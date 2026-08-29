import type { Crop, Destination, Emisor, Farm, Field, Truck } from './types';
import type { Truckload } from './truckloads';
import type { FenexItem, FenexRemission, FenexRequest } from './fenexPayload';
import { REASONS, EMISSION_RESPONSIBILITIES, TRANSPORT_TYPES, splitRuc } from './sifen';
import { netKg } from './selectors';

/**
 * Turns one truckload into the document Fenex expects.
 *
 * Everything here is a starting point the operator can correct in the sheet —
 * the app knows the weights, the truck and the buyer, but not the distance
 * driven or that a different driver took the load today.
 */

export interface MappingContext {
  emisor: Emisor | null;
  destinations: Destination[];
  trucks: Truck[];
  crops: Crop[];
  fields: Field[];
  farms: Farm[];
}

function day(iso: string | null, plusDays = 0): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + plusDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const s = (v: string | null | undefined) => (v ?? '').trim();

export function buildFenexRequest(load: Truckload, ctx: MappingContext): FenexRequest {
  const dest = ctx.destinations.find((d) => d.name === load.destination);
  const truck = ctx.trucks.find((t) => t.name === load.truck);

  // The farm behind the first field these loads came from is the departure point.
  const originField = load.fields[0] ? ctx.fields.find((f) => f.name === load.fields[0]) : undefined;
  const farm = originField?.farm_id ? ctx.farms.find((f) => f.id === originField.farm_id) : undefined;

  const issueDate = day(load.emptiedAt);
  const receiver = splitRuc(s(dest?.ruc));
  const emisorRuc = splitRuc(s(ctx.emisor?.ruc));

  // A hauler on the truck means a third party; otherwise the farm hauls its own
  // grain, which is what "Propio" means, and the emisor is the transportista.
  const hasHauler = Boolean(s(truck?.transportista_name));
  const haulerRuc = splitRuc(s(truck?.transportista_ruc));
  const docType = (s(truck?.transportista_document_type) || 'RUC') === 'CI' ? 'CI' : 'RUC';

  // One line per crop — a truck carrying two crops is two items, not a lump.
  const byCrop = new Map<string, number>();
  for (const w of load.loads) {
    const name = s(w.crop) || 'Sin especificar';
    byCrop.set(name, (byCrop.get(name) ?? 0) + netKg(w));
  }

  const items: FenexItem[] = [...byCrop.entries()].map(([name, kg]) => {
    const crop = ctx.crops.find((c) => c.name === name);
    return {
      productCode: s(crop?.product_code) || name.slice(0, 60),
      productName: s(crop?.fiscal_description) || name,
      unitCode: s(crop?.fiscal_unit_code) || '83',
      unitDescription: s(crop?.fiscal_unit_description) || 'kg',
      // SIFEN wants whole kilos on a transport document; the buyer's scale is
      // what settles the fine detail later.
      quantity: Math.round(kg),
    };
  });

  const totalKg = items.reduce((sum, i) => sum + i.quantity, 0);

  const remission: FenexRemission = {
    customerId: s(dest?.fenex_customer_id) || null,
    issueDate,

    // Grain leaving for a buyer is a sale, which is also the one motivo that
    // demands a future invoice date.
    reasonCode: 1,
    reasonDescription: REASONS[1],
    emissionResponsibilityCode: 1,
    emissionResponsibilityDescription: EMISSION_RESPONSIBILITIES[1],
    estimatedDistanceKm: null,
    futureInvoiceIssueDate: issueDate,

    receiverTaxpayerType: '1',
    receiverRuc: receiver.ruc,
    receiverDv: receiver.dv,
    receiverName: s(dest?.razon_social) || s(dest?.name),
    receiverAddress: s(dest?.address),
    receiverHouseNumber: '0',
    receiverDepartmentCode: '',
    receiverDepartmentName: s(dest?.department),
    receiverDistrictCode: '',
    receiverDistrictName: s(dest?.district),
    receiverCityCode: '',
    receiverCityName: '',

    transportType: hasHauler ? 2 : 1,
    transportTypeDescription: TRANSPORT_TYPES[hasHauler ? 2 : 1],
    freightResponsibility: 1,
    transportStartDate: issueDate,
    transportEndDate: day(load.emptiedAt, 1),

    departureAddress: s(farm?.address),
    departureHouseNumber: s(farm?.house_number) || '0',
    departureDepartmentCode: s(farm?.department_code),
    departureDepartmentName: s(farm?.department),
    departureDistrictCode: s(farm?.district_code),
    departureDistrictName: s(farm?.district),
    departureCityCode: s(farm?.city_code),
    departureCityName: s(farm?.city_name),

    // Delivery defaults to the receptor — grain normally goes where the buyer is.
    deliveryAddress: s(dest?.address),
    deliveryHouseNumber: '0',
    deliveryDepartmentCode: '',
    deliveryDepartmentName: s(dest?.department),
    deliveryDistrictCode: '',
    deliveryDistrictName: s(dest?.district),
    deliveryCityCode: '',
    deliveryCityName: '',

    vehicleType: s(truck?.vehicle_type) || 'Camion',
    // Capped at 10 characters by SIFEN, so a long make is trimmed rather than
    // rejected — the operator can shorten it properly in the sheet.
    vehicleBrand: s(truck?.make_model).slice(0, 10),
    vehiclePlate: s(truck?.plate),

    transporterDocumentType: docType,
    transporterRuc: docType === 'RUC' ? (hasHauler ? haulerRuc.ruc : emisorRuc.ruc) : '',
    transporterDv: docType === 'RUC'
      ? (hasHauler ? haulerRuc.dv : s(ctx.emisor?.ruc_dv) || emisorRuc.dv)
      : '',
    transporterCi: docType === 'CI' ? s(truck?.transportista_ci) : '',
    transporterName: s(truck?.transportista_name) || s(ctx.emisor?.razon_social),
    transporterFiscalAddress: s(truck?.transportista_address) || s(ctx.emisor?.address),

    driverCi: s(truck?.driver_ci),
    driverName: s(truck?.driver) || load.operators[0] || '',
    driverAddress: s(truck?.driver_address),

    cargoWeight: totalKg > 0 ? totalKg : null,
    cargoWeightUnitCode: '83',
    cargoWeightUnitDescription: 'kg',
    cargoDescription: [...byCrop.keys()].join(', ').slice(0, 200),
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
