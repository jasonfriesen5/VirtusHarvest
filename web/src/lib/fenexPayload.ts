import type { Issue, LocationInput } from './sifen';
import {
  EMISSION_RESPONSIBILITIES,
  REASONS,
  TRANSPORT_TYPES,
  FREIGHT_RESPONSIBILITIES,
  checkLocation,
  checkPlate,
  digits,
  normalisePlate,
  text,
} from './sifen';

/**
 * The payload Fenex accepts, and the check that it will be accepted.
 *
 * Field names mirror RemissionCreateRequest.java exactly. Where our own model
 * says something different — a RUC with its verifier digit attached, a motivo
 * as a sentence — the translation happens here and nowhere else.
 */

export interface FenexItem {
  productCode: string;
  productName: string;
  description?: string;
  unitCode: string;
  unitDescription: string;
  quantity: number;
}

export interface FenexRemission {
  customerId: string | null;
  issueDate: string;

  reasonCode: number;
  reasonDescription: string;
  emissionResponsibilityCode: number;
  emissionResponsibilityDescription: string;
  estimatedDistanceKm: number | null;
  futureInvoiceIssueDate: string | null;

  receiverTaxpayerType: string;
  receiverRuc: string;
  receiverDv: string;
  receiverName: string;
  receiverAddress: string;
  receiverHouseNumber: string;
  receiverDepartmentCode: string;
  receiverDepartmentName: string;
  receiverDistrictCode: string;
  receiverDistrictName: string;
  receiverCityCode: string;
  receiverCityName: string;

  transportType: number;
  transportTypeDescription: string;
  freightResponsibility: number;
  transportStartDate: string;
  transportEndDate: string | null;

  departureAddress: string;
  departureHouseNumber: string;
  departureDepartmentCode: string;
  departureDepartmentName: string;
  departureDistrictCode: string;
  departureDistrictName: string;
  departureCityCode: string;
  departureCityName: string;

  deliveryAddress: string;
  deliveryHouseNumber: string;
  deliveryDepartmentCode: string;
  deliveryDepartmentName: string;
  deliveryDistrictCode: string;
  deliveryDistrictName: string;
  deliveryCityCode: string;
  deliveryCityName: string;

  vehicleType: string;
  vehicleBrand: string;
  vehiclePlate: string;

  transporterDocumentType: 'RUC' | 'CI';
  transporterRuc: string;
  transporterDv: string;
  transporterCi: string;
  transporterName: string;
  transporterFiscalAddress: string;

  driverCi: string;
  driverName: string;
  driverAddress: string;

  cargoWeight: number | null;
  cargoWeightUnitCode: string;
  cargoWeightUnitDescription: string;
  cargoDescription: string;
  notes: string;
}

export interface FenexRequest {
  idempotencyKey: string;
  remission: FenexRemission;
  items: FenexItem[];
}

const loc = (r: FenexRemission, p: 'receiver' | 'departure' | 'delivery'): LocationInput => ({
  address: r[`${p}Address`],
  houseNumber: r[`${p}HouseNumber`],
  departmentCode: r[`${p}DepartmentCode`],
  departmentName: r[`${p}DepartmentName`],
  districtCode: r[`${p}DistrictCode`],
  districtName: r[`${p}DistrictName`],
  cityCode: r[`${p}CityCode`],
  cityName: r[`${p}CityName`],
});

/**
 * Everything the Fenex validator would reject, found before sending.
 *
 * With no sandbox and no cancellation, a rejected payload is the good outcome
 * and an accepted-but-wrong one is the bad one — so this errs toward strictness.
 */
export function validate(req: FenexRequest): Issue[] {
  const out: Issue[] = [];
  const push = (i: Issue | null) => { if (i) out.push(i); };
  const r = req.remission;

  push(text(req.idempotencyKey, 'idempotencyKey', 1, 100, 'Falta la clave de idempotencia.'));

  // ── Motivo ────────────────────────────────────────────────────────────────
  if (!(r.reasonCode in REASONS)) {
    out.push({ field: 'reasonCode', message: 'Motivo de traslado no soportado.' });
  } else if (r.reasonCode === 99) {
    push(text(r.reasonDescription, 'reasonDescription', 5, 60,
      'Para «Otro motivo» la descripción debe tener entre 5 y 60 caracteres.'));
  } else if (REASONS[r.reasonCode] !== r.reasonDescription.trim()) {
    // The server compares these literally, so a stray accent fails the document.
    out.push({
      field: 'reasonDescription',
      message: `La descripción debe ser exactamente «${REASONS[r.reasonCode]}».`,
    });
  }

  // Traslado por ventas is the normal case here, and it is the one that needs
  // a future invoice date — easy to miss, and rejected server-side.
  if (r.reasonCode === 1) {
    if (!r.futureInvoiceIssueDate) {
      out.push({
        field: 'futureInvoiceIssueDate',
        message: 'La fecha futura de la factura es obligatoria para traslado por ventas.',
      });
    } else if (r.issueDate && r.futureInvoiceIssueDate < r.issueDate) {
      out.push({
        field: 'futureInvoiceIssueDate',
        message: 'La fecha de la factura no puede ser anterior a la fecha de la remisión.',
      });
    }
  }

  if (!(r.emissionResponsibilityCode in EMISSION_RESPONSIBILITIES)) {
    out.push({ field: 'emissionResponsibilityCode', message: 'Responsable de emisión no soportado.' });
  } else if (
    EMISSION_RESPONSIBILITIES[r.emissionResponsibilityCode] !== r.emissionResponsibilityDescription.trim()
  ) {
    out.push({
      field: 'emissionResponsibilityDescription',
      message: `La descripción debe ser exactamente «${EMISSION_RESPONSIBILITIES[r.emissionResponsibilityCode]}».`,
    });
  }

  if (!(r.transportType in TRANSPORT_TYPES)) {
    out.push({ field: 'transportType', message: 'Tipo de transporte no soportado.' });
  }
  if (!(r.freightResponsibility in FREIGHT_RESPONSIBILITIES)) {
    out.push({ field: 'freightResponsibility', message: 'Responsable del flete no soportado.' });
  }

  if (!r.issueDate) out.push({ field: 'issueDate', message: 'La fecha de emisión es obligatoria.' });
  if (!r.transportStartDate) {
    out.push({ field: 'transportStartDate', message: 'La fecha de inicio del traslado es obligatoria.' });
  }

  if (r.estimatedDistanceKm == null || r.estimatedDistanceKm < 1 || r.estimatedDistanceKm > 99999) {
    out.push({ field: 'estimatedDistanceKm', message: 'La distancia debe estar entre 1 y 99999 km.' });
  }

  // ── Receptor ──────────────────────────────────────────────────────────────
  if (!['1', '2'].includes(r.receiverTaxpayerType.trim())) {
    out.push({ field: 'receiverTaxpayerType', message: 'El tipo de contribuyente debe ser 1 o 2.' });
  }
  push(digits(r.receiverRuc, 'receiverRuc', 1, 8, 'El RUC del receptor debe tener hasta 8 dígitos.'));
  push(digits(r.receiverDv, 'receiverDv', 1, 1, 'El DV del receptor debe tener exactamente 1 dígito.'));
  push(text(r.receiverName, 'receiverName', 1, 200, 'La razón social del receptor es obligatoria.'));
  out.push(...checkLocation(loc(r, 'receiver'), 'receptor', 'receiver'));
  out.push(...checkLocation(loc(r, 'departure'), 'salida', 'departure'));
  out.push(...checkLocation(loc(r, 'delivery'), 'entrega', 'delivery'));

  // ── Vehículo ──────────────────────────────────────────────────────────────
  push(text(r.vehicleType, 'vehicleType', 4, 10, 'El tipo de vehículo debe tener entre 4 y 10 caracteres.'));
  push(text(r.vehicleBrand, 'vehicleBrand', 1, 10, 'La marca debe tener entre 1 y 10 caracteres.'));
  push(checkPlate(r.vehiclePlate));

  // ── Transportista: RUC or CI, never both ─────────────────────────────────
  if (r.transporterDocumentType === 'RUC') {
    push(digits(r.transporterRuc, 'transporterRuc', 1, 8, 'El RUC del transportista es obligatorio.'));
    push(digits(r.transporterDv, 'transporterDv', 1, 1, 'El DV del transportista es obligatorio.'));
    if (r.transporterCi.trim()) {
      out.push({ field: 'transporterCi', message: 'No se informa CI cuando el transportista usa RUC.' });
    }
  } else {
    push(digits(r.transporterCi, 'transporterCi', 1, 30, 'La CI del transportista es obligatoria.'));
    if (r.transporterRuc.trim() || r.transporterDv.trim()) {
      out.push({ field: 'transporterRuc', message: 'No se informa RUC cuando el transportista usa CI.' });
    }
  }
  push(text(r.transporterName, 'transporterName', 4, 60, 'El transportista debe tener entre 4 y 60 caracteres.'));
  push(text(r.transporterFiscalAddress, 'transporterFiscalAddress', 1, 150,
    'El domicilio fiscal del transportista es obligatorio.'));

  // ── Chofer ────────────────────────────────────────────────────────────────
  push(digits(r.driverCi, 'driverCi', 1, 30, 'La CI del chofer es obligatoria.'));
  push(text(r.driverName, 'driverName', 4, 60, 'El nombre del chofer debe tener entre 4 y 60 caracteres.'));
  push(text(r.driverAddress, 'driverAddress', 1, 255, 'La dirección del chofer es obligatoria.'));

  // ── Carga ────────────────────────────────────────────────────────────────
  // Weight is optional, but any one of the three fields commits you to all of
  // them — and it must be a whole number.
  if (r.cargoWeight != null || r.cargoWeightUnitCode || r.cargoWeightUnitDescription) {
    if (!(r.cargoWeight != null && r.cargoWeight > 0)) {
      out.push({ field: 'cargoWeight', message: 'El peso total debe ser mayor que cero.' });
    } else if (!Number.isInteger(r.cargoWeight)) {
      out.push({ field: 'cargoWeight', message: 'El peso total debe ser un número entero.' });
    }
    push(digits(r.cargoWeightUnitCode, 'cargoWeightUnitCode', 1, 4, 'Falta el código de unidad del peso.'));
  }

  // ── Items ────────────────────────────────────────────────────────────────
  if (req.items.length === 0) {
    out.push({ field: 'items', message: 'Se requiere al menos un producto.' });
  }
  if (req.items.length > 999) {
    out.push({ field: 'items', message: 'No se admiten más de 999 productos.' });
  }
  req.items.forEach((item, i) => {
    const p = `items[${i}]`;
    push(text(item.productCode, `${p}.productCode`, 1, 60, 'El código del producto es obligatorio.'));
    push(text(item.productName, `${p}.productName`, 1, 200, 'La descripción del producto es obligatoria.'));
    push(digits(item.unitCode, `${p}.unitCode`, 1, 4, 'El código de unidad SIFEN es obligatorio.'));
    push(text(item.unitDescription, `${p}.unitDescription`, 1, 50, 'La descripción de unidad es obligatoria.'));
    if (!(item.quantity > 0)) {
      out.push({ field: `${p}.quantity`, message: 'La cantidad debe ser mayor que cero.' });
    }
  });

  return out;
}

/**
 * Whether a stored payload is one of these, rather than a draft saved under an
 * older shape. Drafts persist in the database across releases, so a payload
 * read back cannot be trusted to match the current type — and reaching into
 * `.remission` on one that predates it throws, which takes the whole page down.
 */
export function isFenexRequest(value: unknown): value is FenexRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<FenexRequest>;
  return (
    typeof v.idempotencyKey === 'string' &&
    Array.isArray(v.items) &&
    typeof v.remission === 'object' &&
    v.remission !== null &&
    typeof (v.remission as FenexRemission).vehiclePlate === 'string'
  );
}

/** Normalisations the server applies anyway — done here so what you see is sent. */
export function normalise(req: FenexRequest): FenexRequest {
  return {
    ...req,
    remission: {
      ...req.remission,
      vehiclePlate: normalisePlate(req.remission.vehiclePlate),
      // Blank rather than absent: the server checks the unused one is empty.
      transporterCi: req.remission.transporterDocumentType === 'RUC' ? '' : req.remission.transporterCi,
      transporterRuc: req.remission.transporterDocumentType === 'CI' ? '' : req.remission.transporterRuc,
      transporterDv: req.remission.transporterDocumentType === 'CI' ? '' : req.remission.transporterDv,
    },
  };
}
