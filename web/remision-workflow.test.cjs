const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/src/lib/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: key => {
    assert.ok(key in dependencies, `Unexpected dependency: ${key}`);
    return dependencies[key];
  }, ...globals });
  return exports;
}
const workflow = load('remisionWorkflow');
const truckloads = load('truckloads', { './selectors': { wetKg: w => w.weight ?? 0 } });
const cropGuard = load('truckloadCrop', { './truckloads': truckloads });
const cropCodes = load('cropCodes', { './truckloadCrop': cropGuard });
const grain = (id, crop, truck = 'IVECO', timestamp = id) => ({ id, crop, buggy: truck, timestamp, weight: 100 });
test('crop codes are stable, SIFEN-sized and shared by translated crop names', () => {
  const soja = { id: 'one', name: 'Soja', product_code: null };
  const soybeans = { id: 'two', name: 'Soybeans', product_code: null };
  assert.equal(cropCodes.cropInternalCode(soja), 'VH-SOYBEANS');
  assert.equal(cropCodes.cropInternalCode(soybeans), 'VH-SOYBEANS');
  assert.equal(cropCodes.cropInternalCode({ ...soja, product_code: 'MY-SOYA' }), 'MY-SOYA');
  assert.ok(cropCodes.cropInternalCode({ id: '12345678-1234-1234-1234', name: 'Custom', product_code: null }).length <= 20);
});
test('truckload crop guard rejects mixed and missing crops, but accepts translated names', () => {
  assert.equal(cropGuard.truckloadCropError([grain('1', ' Soja '), grain('2', 'soybeans')]), null);
  assert.equal(cropGuard.truckloadCropError([grain('1', 'Maíz'), grain('2', 'CORN')]), null);
  assert.ok(cropGuard.truckloadCropError([grain('1', 'corn'), grain('2', 'soja')]));
  assert.ok(cropGuard.truckloadCropError([grain('1', null)]));
  assert.equal(cropGuard.truckloadCropError([grain('1', 'corn')]), null);
});
test('editing crop or moving trucks cannot introduce a mixed natural truckload', () => {
  const a = grain('1', 'corn'), b = grain('2', 'corn'), c = grain('3', 'soja', 'Other');
  const rows = [a, b, c];
  assert.ok(cropGuard.editedTruckloadCropError(rows, { ...b, crop: 'soja' }, {}));
  assert.ok(cropGuard.editedTruckloadCropError(rows, { ...c, buggy: 'IVECO' }, {}));
  assert.equal(cropGuard.editedTruckloadCropError(rows, { ...a, weight: 200 }, {}), null);
  assert.equal(cropGuard.editedTruckloadCropError([a], { ...a, crop: 'soja' }, {}), null);
});
test('manual assignments enforce the actual bundle, not the original truck', () => {
  const a = grain('1', 'corn'), b = grain('2', 'corn', 'Other');
  const closing = { id: 'close', buggy: 'IVECO', is_truck_empty: true };
  const opts = { manualClosingIds: new Set(['close']), assignments: [
    { weighing_id: '1', closing_weighing_id: 'close' },
    { weighing_id: '2', closing_weighing_id: 'close' },
  ] };
  assert.ok(cropGuard.editedTruckloadCropError([a, b, closing], { ...b, crop: 'soja' }, opts));
  assert.equal(cropGuard.editedTruckloadCropError([a, b], { ...b, crop: 'soja' }, {
    assignments: [{ weighing_id: '2', closing_weighing_id: null }],
  }), null);
});
test('fresh mixed selection fails before a closing row or assignment is written', async () => {
  let writes = 0;
  const api = { from: () => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      range: async () => ({ data: [grain('1', 'corn'), grain('2', 'soja')], error: null }),
      insert: () => { writes++; return { error: null }; },
      upsert: () => { writes++; return { error: null }; },
    };
    return query;
  } };
  const mutations = load('assignments', {
    './supabase': { supabase: api }, './truckloads': truckloads, './truckloadCrop': cropGuard,
  });
  await assert.rejects(mutations.createTruckload('user', { loadIds: ['1', '2'] }), /only one crop/);
  assert.equal(writes, 0);
});
test('only confirmed approval is issued; remote drafts and uncertain outcomes stay locked', () => {
  for (const [remote, expected] of Object.entries({ DRAFT: 'pending', READY: 'ready', SUBMITTED: 'submitted', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' })) {
    const r = { status: 'issued', fenex_status: remote };
    assert.equal(workflow.remisionState(r), expected);
    assert.equal(workflow.remisionLocked(r), true);
  }
  assert.equal(workflow.remisionLocked({ status: 'draft' }), false);
  assert.equal(workflow.remisionState({ status: 'sending', error_message: 'timeout' }), 'unknown');
  assert.equal(workflow.remisionState({ status: 'draft', cdc: 'assigned' }), 'unknown');
});
test('pending approval locks every member and the closing event', () => {
  const locking = load('locking', {
    './remisionWorkflow': workflow,
    './truckloads': { buildTruckloads: () => ({ completed: [
      { closedBy: { id: 'close' }, loads: [{ id: 'one' }, { id: 'two' }] },
      { closedBy: { id: 'other' }, loads: [{ id: 'three' }] },
    ] }) },
  });
  const rows = [{ closing_weighing_id: 'close', status: 'sending', fenex_status: 'DRAFT' }];
  assert.deepEqual([...locking.lockedWeighingIds([], rows)], ['close', 'one', 'two']);
  assert.deepEqual([...locking.lockedClosingIds(rows)], ['close']);
});
const sifen = load('sifen');
const payload = load('fenexPayload', { './sifen': sifen });
function validRequest() {
  const remission = {
    customerId: null, issueDate: '2026-09-05', reasonCode: 1,
    reasonDescription: 'Traslado por ventas', emissionResponsibilityCode: 1,
    emissionResponsibilityDescription: 'Emisor de la factura', estimatedDistanceKm: 30,
    futureInvoiceIssueDate: '2026-09-05', receiverTaxpayerType: '1',
    receiverRuc: '80012345', receiverDv: '6', receiverName: 'Receptor',
    transportType: 1, transportTypeDescription: 'Propio', freightResponsibility: 1,
    transportStartDate: '2026-09-05', transportEndDate: '2026-09-06',
    vehicleType: 'Camion', vehicleBrand: 'IVECO', vehiclePlate: 'ABC123',
    transporterDocumentType: 'RUC', transporterRuc: '80012345', transporterDv: '6',
    transporterCi: '', transporterName: 'Transportista', transporterFiscalAddress: 'Ruta 1',
    driverCi: '123456', driverName: 'Juan Perez', driverAddress: 'Ruta 1',
    cargoWeight: 30000, cargoWeightUnitCode: '83', cargoWeightUnitDescription: 'kg',
    cargoDescription: 'Soja', notes: '',
  };
  for (const prefix of ['receiver', 'departure', 'delivery']) Object.assign(remission, {
    [`${prefix}Address`]: 'Ruta 1', [`${prefix}HouseNumber`]: '0',
    [`${prefix}DepartmentCode`]: '1', [`${prefix}DepartmentName`]: 'Concepcion',
    [`${prefix}DistrictCode`]: '1', [`${prefix}DistrictName`]: 'Concepcion',
    [`${prefix}CityCode`]: '1', [`${prefix}CityName`]: 'Concepcion',
  });
  return { idempotencyKey: 'test-only', remission, items: [
    { productCode: 'SOJA', productName: 'Soja', unitCode: '83', unitDescription: 'kg', quantity: 30000 },
  ] };
}
test('source refresh updates unchanged prefills and preserves manual corrections', () => {
  const draftSources = load('draftSources', { './fenexPayload': payload });
  const oldSource = validRequest();
  const saved = JSON.parse(JSON.stringify(oldSource));
  saved.remission.driverName = 'Manually corrected driver';
  const stored = draftSources.storeDraft(saved, oldSource);
  const fresh = JSON.parse(JSON.stringify(oldSource));
  fresh.remission.receiverAddress = 'New destination address';
  fresh.remission.driverName = 'New truck default';
  fresh.items[0].quantity = 31000;
  fresh.remission.cargoWeight = 31000;
  assert.equal(draftSources.sourcesChanged(stored, fresh), true);
  const merged = draftSources.refreshDraftSources(
    draftSources.requestFromStored(stored),
    draftSources.sourceFromStored(stored),
    fresh,
  );
  assert.equal(merged.remission.receiverAddress, 'New destination address');
  assert.equal(merged.remission.driverName, 'Manually corrected driver');
  assert.equal(merged.items[0].quantity, 31000);
  assert.equal(merged.remission.cargoWeight, 31000);
  assert.equal('_virtusSourceSnapshot' in payload.normalise(stored), false);
});
test('local validation rejects Fenex date, transport, unit and distance errors', () => {
  const cases = [
    { transportEndDate: null },
    { transportEndDate: '2026-09-01' },
    { transportStartDate: '2026-09-01' },
    { reasonCode: 2, reasonDescription: 'Traslado por consignación' },
    { transportTypeDescription: 'Third party' },
    { cargoWeightUnitDescription: '' },
    { estimatedDistanceKm: 1.5 },
  ];
  for (const change of cases) {
    const req = validRequest();
    Object.assign(req.remission, change);
    assert.ok(payload.validate(req).length > 0, JSON.stringify(change));
  }
  const req = validRequest();
  req.items[0].unitCode = '9999';
  assert.ok(payload.validate(req).length > 0);
});
test('normalisation keeps cargo total and harvest items in wet kilograms', () => {
  const req = validRequest();
  req.items = [
    { ...req.items[0], quantity: 1000.4, unitCode: '99', unitDescription: 'TN' },
    { ...req.items[0], productCode: 'MAIZ', quantity: 500.4 },
  ];
  const result = payload.normalise(req);
  assert.equal(result.remission.cargoWeight, 1500);
  assert.deepEqual(result.items.map(i => [i.unitCode, i.unitDescription]), [['83', 'kg'], ['83', 'kg']]);
});
test('separately stored issuer RUC does not lose its final digit', () => {
  assert.equal(JSON.stringify(sifen.storedRucParts('80012345', '6')), '{"ruc":"80012345","dv":"6"}');
  assert.equal(JSON.stringify(sifen.splitRuc('80012345')), '{"ruc":"80012345","dv":""}');
  assert.equal(JSON.stringify(sifen.splitRuc('80012345-6')), '{"ruc":"80012345","dv":"6"}');
});
