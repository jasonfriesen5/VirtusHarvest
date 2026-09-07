/**
 * Dry-weight calculation, ported verbatim from the phone app's calcDryWeight()
 * so the web console and the app can never disagree about what a load weighed.
 *
 * `weighings` stores three weights: `weight` and `wet_weight` are the scale
 * reading, and `dry_weight` is that reading shrunk to the crop's standard
 * moisture. Every total in this app reads `dry_weight ?? weight`, so editing a
 * weight without recomputing the dry figure would leave reports on the old
 * number.
 */

const CROP_BASE_MOISTURE: Record<string, number> = {
  corn: 15.5, // USDA standard
  soybeans: 13.0, // USDA standard
  wheat: 13.5, // USDA standard
  sorghum: 14.0, // USDA standard
  sunflower: 10.0, // USDA standard
  canola: 8.5, // Canadian Grain Commission standard
  barley: 14.5, // USDA standard
  cotton: 7.0, // seed cotton standard
  rice: 13.5, // USDA standard
  peanuts: 10.0, // USDA standard
  oats: 14.0, // USDA standard
  chia: 9.0, // industry standard
};

const DEFAULT_BASE_MOISTURE = 13.0;

export function getBaseMoisture(cropName: string | null | undefined): number {
  if (!cropName) return DEFAULT_BASE_MOISTURE;
  return CROP_BASE_MOISTURE[cropName.trim().toLowerCase()] ?? DEFAULT_BASE_MOISTURE;
}

/**
 * dry = wet × (100 − actual) / (100 − base)
 *
 * Unit-agnostic: it is a ratio, so it applies to whatever unit the row is
 * stored in. Grain at or below the base moisture is not docked.
 */
export function calcDryWeight(
  wet: number,
  moisturePct: number | null | undefined,
  cropName: string | null | undefined,
): number {
  if (!moisturePct || moisturePct <= 0) return wet;
  const base = getBaseMoisture(cropName);
  if (moisturePct <= base) return wet;
  return (wet * (100 - moisturePct)) / (100 - base);
}
