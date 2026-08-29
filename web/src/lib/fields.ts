import type { Farm, Field } from './types';

/**
 * Field names are not unique — this account has two fields called "Field A" on
 * different farms. Anywhere a field is shown in a list, the duplicated names
 * are qualified by their farm so a person can tell them apart; unique names are
 * left alone rather than cluttered with a farm they don't need.
 *
 * Pickers must still be keyed and valued by field *id*. Resolving a field by
 * name silently picks whichever duplicate comes first.
 */
export function fieldLabels(fields: Field[], farms: Farm[]): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const f of fields) nameCounts.set(f.name, (nameCounts.get(f.name) ?? 0) + 1);

  const farmName = new Map(farms.map((f) => [f.id, f.name] as const));

  return new Map(
    fields.map((f) => [
      f.id,
      (nameCounts.get(f.name) ?? 0) > 1
        ? `${f.name} — ${f.farm_id ? (farmName.get(f.farm_id) ?? 'unknown farm') : 'no farm'}`
        : f.name,
    ]),
  );
}
