import { EN } from './i18n.en';

/**
 * Spanish is the source language, English is the lookup — the same model the
 * app uses (`data-en` on Spanish markup). It means the code reads in the
 * language the yard actually speaks, and a string nobody has translated yet
 * degrades to Spanish rather than to a bare key like `pens.title`.
 *
 * `tools/check-i18n.mjs` lists any Spanish string that has no English entry.
 */

export type Lang = 'es' | 'en';

/** `{name}` placeholders keep interpolated sentences translatable as a whole,
 *  instead of being glued together from fragments in Spanish word order. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const base = lang === 'en' ? (EN[key] ?? key) : key;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}
