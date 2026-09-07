import type { Crop } from './types';
import { cropKey } from './truckloadCrop';

const STANDARD_CROP_CODES: Record<string, string> = {
  soybeans: 'VH-SOYBEANS', corn: 'VH-CORN', wheat: 'VH-WHEAT',
  sorghum: 'VH-SORGHUM', sunflower: 'VH-SUNFLOWER', canola: 'VH-CANOLA',
  barley: 'VH-BARLEY', cotton: 'VH-COTTON', rice: 'VH-RICE',
  peanuts: 'VH-PEANUTS', oats: 'VH-OATS', chia: 'VH-CHIA',
};

/**
 * SIFEN E701 is an issuer-owned internal merchandise code, not a national crop
 * classification. Prefer an explicitly saved code; otherwise derive one from the
 * crop's canonical key. Every path is limited to 20 chars.
 *
 * The fallback deliberately does NOT derive from crop.id. Crop ids are shaped
 * `<user_id>_<Name>`, so every crop belonging to one account shares its first
 * 36 characters — taking the leading 17 of those produced ONE code for ALL of
 * that account's custom crops (Sésamo, Zafriña and Tártago all became
 * VH-0A2C3E4F1EA54CBD9). dCodInt is what distinguishes one merchandise line
 * from another, so a collision there is not cosmetic.
 *
 * Deriving from cropKey() instead is collision-free, reproduces all twelve
 * STANDARD_CROP_CODES byte for byte (each is exactly `VH-` + its key upper
 * cased), and prints something a human can read on the document. The table is
 * kept above so those twelve are pinned and can never drift with the rule.
 */
export function cropInternalCode(crop: Pick<Crop, 'id' | 'name' | 'product_code'>): string {
  const saved = (crop.product_code ?? '').trim();
  if (saved) return saved.slice(0, 20);
  const key = cropKey(crop.name);
  const standard = STANDARD_CROP_CODES[key];
  if (standard) return standard;
  const compact = key.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!compact) throw new Error('This crop has no name to derive an internal code from.');
  return `VH-${compact.slice(0, 17)}`;
}

export function cropDocumentName(crop: Pick<Crop, 'name' | 'fiscal_description'>): string {
  return (crop.fiscal_description ?? '').trim() || crop.name.trim();
}
