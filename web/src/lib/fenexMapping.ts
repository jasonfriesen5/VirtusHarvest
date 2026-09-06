import type { Crop, Destination, Farm, Field, Route, Truck } from './types';
import type { Issuer } from './fenexClient';
import type { Truckload } from './truckloads';
import type { FenexItem, FenexRemission, FenexRequest } from './fenexPayload';
import { REASONS, EMISSION_RESPONSIBILITIES, TRANSPORT_TYPES, splitRuc, storedRucParts } from './sifen';
import { wetKg } from './selectors';
import { cropDocumentName, cropInternalCode } from './cropCodes';
import { cropKey, truckloadCropGroups } from './truckloadCrop';

/**
 * Turns one truckload into the document Fenex expects.
 *
 * Everything here is a starting point the operator can correct in the sheet —
 * the app knows the weights, the truck and the buyer, but not the distance
 * driven or that a different driver took the load today.
 */

export interface MappingContext {
  /**
   * Who the document is issued by. Fenex fills the header from the token, so
   * this is not sent as issuer fields — it is here because the transportista
   * block names this same person when they haul their own grain, and that IS
   * sent.
   */
  issuer: Issuer | null;
  destinations: Destination[];
  trucks: Truck[];
  crops: Crop[];
  fields: Field[];
  farms: Farm[];
  routes: Route[];
}

function day(iso: string | null, plusDays = 0): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + plusDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const s = (v: string | null | undefined) => (v ?? '').trim();


/**
 * The field the truck was last loaded from.
 *
 * A truck can be topped up across two farms, and the punto de salida on the
 * document is where it departed — so the last load on board decides it, not
 * the first. `load.fields` is an alphabetical list of names and would pick an
 * arbitrary one, so this walks the loads backwards in time instead.
 *
 * Resolution prefers `field_id` over the name: two fields can share a name,
 * and matching by name would sometimes pick the wrong farm.
 */
function originFieldFor(load: Truckload, ctx: MappingContext): Field | undefined {
  // load.loads is ordered oldest-first, so the end is the most recent.
  for (let i = load.loads.length - 1; i >= 0; i--) {
    const w = load.loads[i];
    const byId = w.field_id ? ctx.fields.find((f) => f.id === w.field_id) : undefined;
    if (byId) return byId;
    const name = s(w.zone);
    const byName = name ? ctx.fields.find((f) => f.name === name) : undefined;
    if (byName) return byName;
  }
  return undefined;
}

export function buildFenexRequest(load: Truckload, ctx: MappingContext): FenexRequest {
  const dest = ctx.destinations.find((d) => d.name === load.destination);
  const truck = ctx.trucks.find((t) => t.name === load.truck);

  // The farm the truck was last loaded from is where it departed.
  const originField = originFieldFor(load, ctx);
  const farm = originField?.farm_id ? ctx.farms.find((f) => f.id === originField.farm_id) : undefined;

  const issueDate = day(load.emptiedAt);
  const receiver = splitRuc(s(dest?.ruc));
  const issuerRuc = storedRucParts(s(ctx.issuer?.ruc), s(ctx.issuer?.ruc_dv));

  // A hauler on the truck means a third party; otherwise the farm hauls its own
  // grain, which is what "Propio" means, and the issuer is the transportista.
  const hasHauler = Boolean(s(truck?.transportista_name));
  const haulerRuc = storedRucParts(
    s(truck?.transportista_ruc),
    s(truck?.transportista_ruc_dv),
  );
  const docType = (s(truck?.transportista_document_type) || 'RUC') === 'CI' ? 'CI' : 'RUC';

  // The truckload guard permits one canonical crop, so this normally yields a
  // single line. Grouping still happens here so an older mixed load remains
  // inspectable while submission stays blocked — but it groups by cropKey, the
  // same rule the guard applies, so alias spellings of one grain cannot split
  // into two lines. The weights are the scale readings rather than the
  // moisture-adjusted figures: the document declares what is being transported.
  const groups = truckloadCropGroups(load.loads, wetKg);

  const items: FenexItem[] = groups.map(({ key, name, kg }) => {
    // Matched on the canonical key, not the exact name. An exact-name lookup
    // missed the crop record whenever the load was spelled differently from the
    // crop list, and silently fell back to the raw name as the product code.
    const crop = ctx.crops.find((c) => cropKey(c.name) === key);
    return {
      // This is Fenex/SIFEN dCodInt: the issuer's own internal product code,
      // not a national crop-species code. A future catalogue selection can
      // additionally send productId so Fenex resolves this snapshot itself.
      productId: null,
      productCode: crop ? cropInternalCode(crop) : name.slice(0, 20),
      productName: crop ? cropDocumentName(crop) : name,
      // Virtus stores and sends physical truckload weight in kilograms. Crop
      // configuration cannot relabel those numbers as tonnes without conversion.
      unitCode: '83',
      unitDescription: 'kg',
      // SIFEN wants whole kilos on a transport document; the buyer's scale is
      // what settles the fine detail later.
      quantity: Math.round(kg),
    };
  });

  const totalKg = items.reduce((sum, i) => sum + i.quantity, 0);

  const remission: FenexRemission = {
    // Chosen in the sheet, under the issuer that is sending: the same buyer
    // is a different customer record in each Fenex account, so there is no one
    // id a destination could carry.
    customerId: null,
    issueDate,

    // Grain leaving for a buyer is a sale, which is also the one motivo that
    // demands a future invoice date.
    reasonCode: 1,
    reasonDescription: REASONS[1],
    emissionResponsibilityCode: 1,
    emissionResponsibilityDescription: EMISSION_RESPONSIBILITIES[1],
    // Remembered per farm-and-buyer pair: the same silo is a different distance
    // from each farm, so keying it to the destination alone would be wrong.
    estimatedDistanceKm:
      ctx.routes.find((r) => r.farm_id === farm?.id && r.destination_id === dest?.id)?.distance_km ??
      null,
    futureInvoiceIssueDate: issueDate,

    receiverTaxpayerType: '1',
    receiverRuc: receiver.ruc,
    receiverDv: receiver.dv,
    receiverName: s(dest?.razon_social) || s(dest?.name),
    receiverAddress: s(dest?.address),
    // Paraguayan rural addresses carry no house number; SIFEN wants the field
    // populated regardless, and "0" is what Fenex's own tests send.
    receiverHouseNumber: '0',
    receiverDepartmentCode: s(dest?.department_code),
    receiverDepartmentName: s(dest?.department),
    receiverDistrictCode: s(dest?.district_code),
    receiverDistrictName: s(dest?.district),
    receiverCityCode: s(dest?.city_code),
    receiverCityName: s(dest?.city_name),

    transportType: hasHauler ? 2 : 1,
    transportTypeDescription: TRANSPORT_TYPES[hasHauler ? 2 : 1],
    freightResponsibility: 1,
    transportStartDate: issueDate,
    transportEndDate: day(load.emptiedAt, 1),

    departureAddress: s(farm?.address),
    departureHouseNumber: '0',
    departureDepartmentCode: s(farm?.department_code),
    departureDepartmentName: s(farm?.department),
    departureDistrictCode: s(farm?.district_code),
    departureDistrictName: s(farm?.district),
    departureCityCode: s(farm?.city_code),
    departureCityName: s(farm?.city_name),

    // Delivery defaults to the receptor — grain normally goes where the buyer is.
    deliveryAddress: s(dest?.address),
    deliveryHouseNumber: '0',
    deliveryDepartmentCode: s(dest?.department_code),
    deliveryDepartmentName: s(dest?.department),
    deliveryDistrictCode: s(dest?.district_code),
    deliveryDistrictName: s(dest?.district),
    deliveryCityCode: s(dest?.city_code),
    deliveryCityName: s(dest?.city_name),

    vehicleType: s(truck?.vehicle_type) || 'Camion',
    // Capped at 10 characters by SIFEN, so a long make is trimmed rather than
    // rejected — the operator can shorten it properly in the sheet.
    vehicleBrand: s(truck?.make_model).slice(0, 10),
    vehiclePlate: s(truck?.plate),

    transporterDocumentType: docType,
    transporterRuc: docType === 'RUC' ? (hasHauler ? haulerRuc.ruc : issuerRuc.ruc) : '',
    transporterDv: docType === 'RUC'
      ? (hasHauler ? haulerRuc.dv : issuerRuc.dv)
      : '',
    transporterCi: docType === 'CI' ? s(truck?.transportista_ci) : '',
    transporterName: s(truck?.transportista_name) || s(ctx.issuer?.razon_social),
    transporterFiscalAddress: s(truck?.transportista_address) || s(ctx.issuer?.address),

    driverCi: s(truck?.driver_ci),
    driverName: s(truck?.driver) || load.operators[0] || '',
    driverAddress: s(truck?.driver_address),

    cargoWeight: totalKg > 0 ? totalKg : null,
    cargoWeightUnitCode: '83',
    cargoWeightUnitDescription: 'kg',
    // Names the document's own lines, so it comes from the same grouping the
    // lines do — listing a raw spelling that no line carries would not describe
    // this cargo.
    cargoDescription: items.map((i) => i.productName).join(', ').slice(0, 200),
    notes: '',
  };

  return {
    // The empty-truck row that closed this bundle: stable across retries, and
    // well inside the 100-character limit.
    idempotencyKey: load.closedBy?.id ?? load.key,
    remission,
    items,
  };
}

/** Which farm-and-buyer pair a truckload represents, for remembering distance. */
export function routeKeyFor(
  load: Truckload,
  ctx: MappingContext,
): { farmId: string; destinationId: string } | null {
  const dest = ctx.destinations.find((d) => d.name === load.destination);
  // Must agree with buildFenexRequest, or the remembered distance would belong
  // to a different farm than the one printed on the document.
  const farmId = originFieldFor(load, ctx)?.farm_id;
  if (!farmId || !dest) return null;
  return { farmId, destinationId: dest.id };
}
