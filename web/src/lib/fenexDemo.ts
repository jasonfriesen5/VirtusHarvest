import geography from './demoGeography.json';
import type { FenexCustomer, FenexLinkStatus, FenexRemissionResult, GeoOption, Issuer, FenexProduct } from './fenexClient';
import type { FenexRequest } from './fenexPayload';

/**
 * A pretend Fenex, so the whole flow can be walked through before a real
 * account exists.
 *
 * Everything here is local. Nothing reaches api.fenexpy.com, nothing reaches
 * SET, no timbrado number is consumed, and the "document" it returns is
 * invalid by construction — the CDC is obviously fake and the PDF is a plain
 * note saying so. That is deliberate: a convincing forgery of a legal document
 * is the last thing this should produce.
 *
 * REMOVE BEFORE LAUNCH. Delete this file, demoGeography.json, the three demo
 * branches in fenexClient.ts, and the toggle in RemisionSettings.tsx.
 */

const KEY = 'vh_fenex_demo';

export const isDemo = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const setDemo = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* private browsing — the toggle simply will not stick */ }
};

const wait = <T,>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const geo = geography as {
  departments: { code: string; name: string }[];
  districts: Record<string, { code: string; name: string }[]>;
  cities: Record<string, { code: string; name: string }[]>;
};

export const demoStatus = (): Promise<FenexLinkStatus> =>
  wait({
    linked: true,
    fenex_email: 'demo@fenexpy.com',
    account_id: 'demo-account',
    subscription_status: 'DEMO',
    paid_until: null,
    linked_at: new Date().toISOString(),
  });

/**
 * Two issuers in trial mode, because one would hide the whole point of the
 * picker — the second is the case where a remisión is filed for someone else.
 */
export const demoIssuers = (): Promise<Issuer[]> =>
  wait([
    {
      id: 'demo-issuer-1',
      label: 'Mi empresa (demo)',
      fenex_email: 'demo@fenexpy.com',
      account_id: 'demo-account',
      subscription_status: 'DEMO',
      paid_until: null,
      linked_at: new Date().toISOString(),
      is_default: true,
      razon_social: 'AGRO DEMO SOCIEDAD ANONIMA',
      ruc: '80012345',
      ruc_dv: '6',
      address: 'COLONIA DEMO, SAN PEDRO',
      phone: '0981000000',
      email: 'demo@fenexpy.com',
    },
    {
      id: 'demo-issuer-2',
      label: 'Vecino (demo)',
      fenex_email: 'vecino@fenexpy.com',
      account_id: 'demo-account-2',
      subscription_status: 'DEMO',
      paid_until: null,
      linked_at: new Date().toISOString(),
      is_default: false,
      razon_social: 'PRODUCTOR VECINO',
      ruc: '3744941',
      ruc_dv: '9',
      address: 'COLONIA SANTA CLARA',
      phone: '0972404045',
      email: 'vecino@fenexpy.com',
    },
  ]);

export const demoDepartments = (): Promise<GeoOption[]> =>
  wait(geo.departments.map((d) => ({ departmentCode: d.code, name: d.name })));

export const demoDistricts = (departmentCode: string): Promise<GeoOption[]> =>
  wait((geo.districts[departmentCode] ?? []).map((d) => ({ districtCode: d.code, name: d.name })));

export const demoCities = (departmentCode: string, districtCode: string): Promise<GeoOption[]> =>
  wait((geo.cities[`${departmentCode}:${districtCode}`] ?? []).map((c) => ({
    cityCode: c.code,
    name: c.name,
  })));

/** Two buyers with real-looking geography, so the pickers have something to do. */
/**
 * A pretend catalogue. Two names for the same commodity on purpose — a farm
 * whose crop is called "Soybeans" and a buyer who calls it "SOJA" must end up
 * with the same code on the document.
 */
export const demoProducts = (): Promise<FenexProduct[]> =>
  wait([
    { id: 'p-soja', code: 'PRO-1', name: 'SOJA', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-maiz', code: 'PRO-2', name: 'MAIZ', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-trigo', code: 'PRO-3', name: 'TRIGO', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-canola', code: 'PRO-4', name: 'CANOLA', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-girasol', code: 'PRO-5', name: 'GIRASOL', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-arroz', code: 'PRO-6', name: 'ARROZ', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-sorgo', code: 'PRO-7', name: 'SORGO', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-avena', code: 'PRO-8', name: 'AVENA', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-chia', code: 'PRO-9', name: 'CHIA', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-mani', code: 'PRO-10', name: 'MANI', unitCode: '83', unitDescription: 'kg' },
    { id: 'p-algodon', code: 'PRO-11', name: 'ALGODON', unitCode: '83', unitDescription: 'kg' },
  ]);

export const demoCustomers = (): Promise<FenexCustomer[]> =>
  wait([
    {
      id: 'demo-customer-1',
      legalName: 'SILO Y ACOPIO DEMO SOCIEDAD ANONIMA',
      ruc: '80142135',
      dv: '7',
      address: 'ARROYO SAN JOSE',
    },
    {
      id: 'demo-customer-2',
      legalName: 'COOPERATIVA DEMO LIMITADA',
      ruc: '80098765',
      dv: '4',
      address: 'RUTA 3 KM 210',
    },
  ]);

/**
 * Returns a plausible-shaped response with an unmistakably fake CDC. The
 * number is prefixed rather than randomised so nobody can mistake a demo
 * document for a real one in the records later.
 */
export const demoCreate = (payload: FenexRequest): Promise<FenexRemissionResult> =>
  wait(
    {
      id: `demo-${payload.idempotencyKey}`,
      remissionNumber: 'DEMO-001-001-0000000',
      cdc: '0000000000000000000000000000000000000000DEMO',
      status: 'APPROVED',
      issuedAt: new Date().toISOString(),
      demo: true,
    } as FenexRemissionResult,
    900,
  );

/** A one-page PDF that says what it is. Never mistakable for a real KuDE. */
export function demoPdfDataUrl(): string {
  const lines = [
    'DOCUMENTO DE PRUEBA - NO VALIDO',
    '',
    'This is a Virtus Harvest demo. No Nota de Remision',
    'was created. Nothing was sent to Fenex or to SET,',
    'and no timbrado number was used.',
  ];
  const content = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 15 : 11} Tf 60 ${740 - i * 26} Td (${l.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const stream = `q 1 0 0 RG 3 w 40 40 m 555 40 l 555 780 l 40 780 l h S Q\n${content}`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(pdf)}`;
}
