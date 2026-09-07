/**
 * A line-by-line mirror of Fenex's RemissionValidationService.
 *
 * There is no sandbox. The first document we send goes to SET for real, gets a
 * real number from the timbrado, and — as the backend stands today — cannot be
 * cancelled. So every rule the server enforces is enforced here first, in the
 * same words, before anything leaves the browser.
 *
 * When Jonathan changes a rule, change it here too. A mirror that drifts is
 * worse than no mirror, because it teaches people to trust it.
 */

/** Motivo del traslado. The description must match the code exactly. */
export const REASONS: Record<number, string> = {
  1: 'Traslado por ventas',
  2: 'Traslado por consignación',
  4: 'Traslado por compra',
  6: 'Traslado por devolución',
  7: 'Traslado entre locales de la empresa',
  9: 'Traslado de bienes para reparación',
  13: 'Traslado de encomienda',
  99: 'Otro',
};

export const EMISSION_RESPONSIBILITIES: Record<number, string> = {
  1: 'Emisor de la factura',
  2: 'Poseedor de la factura y bienes',
  3: 'Empresa transportista',
};

export const TRANSPORT_TYPES: Record<number, string> = {
  1: 'Propio',
  2: 'Tercero',
};

export const FREIGHT_RESPONSIBILITIES: Record<number, string> = {
  1: 'Emisor',
  2: 'Receptor',
  3: 'Tercero',
};

/** SIFEN unit codes. 83 is kilogrammes, which is what grain ships in. */
export const UNIT_CODES: Record<string, string> = {
  '77': 'UNI', '83': 'kg', '86': 'g', '87': 'm', '88': 'ML', '89': 'LT',
  '90': 'MG', '91': 'CM', '94': 'PUL', '95': 'MM', '97': 'AA', '98': 'ME',
  '99': 'TN', '100': 'Hs', '101': 'Mi', '102': 'Di', '108': 'MT',
  '110': 'M3', '625': 'Km', '660': 'ml', '869': 'ha',
};

export interface Issue {
  field: string;
  message: string;
}

const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Text present, and within the server's length bounds. */
export function text(
  value: unknown,
  field: string,
  min: number,
  max: number,
  message: string,
): Issue | null {
  const s = trim(value);
  if (s.length < min || s.length > max) return { field, message };
  return null;
}

/** Digits only — the server rejects letters, spaces and punctuation alike. */
export function digits(
  value: unknown,
  field: string,
  min: number,
  max: number,
  message: string,
): Issue | null {
  const s = trim(value);
  if (!/^\d+$/.test(s) || s.length < min || s.length > max) return { field, message };
  return null;
}

/**
 * Plates are normalised before the pattern is applied: spaces and dashes are
 * stripped and the rest upper-cased. "AAAT-338" and "aaat 338" are both fine;
 * what matters is what survives normalisation.
 */
export function normalisePlate(plate: string): string {
  return plate.trim().replace(/[\s-]/g, '').toUpperCase();
}

export function checkPlate(plate: string): Issue | null {
  return /^[A-Z0-9]{3,7}$/.test(normalisePlate(plate))
    ? null
    : {
        field: 'vehiclePlate',
        message: 'La chapa debe contener entre 3 y 7 letras o números.',
      };
}

/**
 * A Paraguayan RUC is a base number plus a single verifier digit, and SIFEN
 * wants them in separate fields. "3744941-9" becomes "3744941" and "9".
 */
export function splitRuc(raw: string): { ruc: string; dv: string } {
  const cleaned = trim(raw).replace(/\s/g, '');
  // Without the separator there is no reliable way to know whether the last
  // digit belongs to the base or is the DV. Keep it intact and make a missing
  // DV visible instead of silently changing a taxpayer's identity.
  const m = cleaned.match(/^(\d{1,8})-(\d)$/);
  if (m) return { ruc: m[1], dv: m[2] };
  return { ruc: cleaned.replace(/\D/g, '').slice(0, 8), dv: '' };
}

/** Use this when the database already stores base RUC and DV separately. */
export function storedRucParts(rawRuc: string, rawDv: string): { ruc: string; dv: string } {
  const ruc = trim(rawRuc).replace(/\D/g, '');
  const dv = trim(rawDv).replace(/\D/g, '');
  return dv ? { ruc, dv } : splitRuc(rawRuc);
}

export function formatRuc(ruc: string | null, dv: string | null): string {
  if (!ruc) return '';
  return dv ? `${ruc}-${dv}` : ruc;
}

/** One location block: receptor, salida or entrega. */
export interface LocationInput {
  address: string;
  houseNumber: string;
  departmentCode: string;
  departmentName: string;
  districtCode: string;
  districtName: string;
  cityCode: string;
  cityName: string;
}

export function checkLocation(loc: LocationInput, label: string, prefix: string): Issue[] {
  const out: Issue[] = [];
  const push = (i: Issue | null) => {
    if (i) out.push(i);
  };

  push(text(loc.address, `${prefix}.address`, 1, 255, `La dirección de ${label} es obligatoria.`));
  push(
    digits(
      loc.houseNumber || '0',
      `${prefix}.houseNumber`,
      1,
      10,
      `El número de casa de ${label} debe ser numérico.`,
    ),
  );
  push(digits(loc.departmentCode, `${prefix}.departmentCode`, 1, 10, `Falta el departamento de ${label}.`));
  push(text(loc.departmentName, `${prefix}.departmentName`, 1, 120, `Falta el departamento de ${label}.`));
  push(digits(loc.districtCode, `${prefix}.districtCode`, 1, 10, `Falta el distrito de ${label}.`));
  push(text(loc.districtName, `${prefix}.districtName`, 1, 120, `Falta el distrito de ${label}.`));
  push(digits(loc.cityCode, `${prefix}.cityCode`, 1, 10, `Falta la ciudad de ${label}.`));
  push(text(loc.cityName, `${prefix}.cityName`, 1, 120, `Falta la ciudad de ${label}.`));

  return out;
}

/**
 * The one rule this mirror cannot reproduce: whether the department, district
 * and city genuinely coexist in the official DNIT table. Only the server knows.
 * Choosing all three from the linked pickers is what makes it safe — typing
 * codes by hand is not.
 */
export const GEOGRAPHY_CAVEAT =
  'The department, district and city combination is verified by SIFEN itself. ' +
  'Choose all three from the lists rather than typing codes.';
