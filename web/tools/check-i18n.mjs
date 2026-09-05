/**
 * Lists every Spanish source string the console renders that has no English
 * entry. Modelled on the app's tools/check-i18n.py, for the same reason: a
 * missing translation degrades to Spanish silently, so nothing but a checker
 * will ever tell you it is missing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk('src').filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
  // Labels held in data files and translated where they are rendered.
  if (f.endsWith('analytics.ts') || f.endsWith('write.ts')) {
    for (const m of src.matchAll(/label: '([^']+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/\d+: '([^']+)'/g)) keys.add(m[1]);
  }
  // Record<string, string> label maps (KIND_LABEL, TITLES, NAV…) reach t()
  // through a variable, so the literal never appears inside t('…') and nothing
  // was checking them. Spanish-looking values in such maps count as keys.
  for (const map of src.matchAll(/(?:Record<[^>]*string>|\[\s*\n)?\s*=\s*\{([^}]*)\};/g)) {
    for (const m of map[1].matchAll(/^\s*[\w'"-]+:\s*'([^']{2,})',?\s*$/gm)) {
      const v = m[1];
      if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(v) || /^[A-ZÁÉÍÓÚÑ]/.test(v)) keys.add(v);
    }
  }
}

const en = readFileSync('src/lib/i18n.en.ts', 'utf8');
const have = new Set([...en.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1].replace(/\\'/g, "'")));

const missing = [...keys].filter((k) => !have.has(k)).sort();
if (missing.length) {
  console.log(`${missing.length} string(s) with no English translation:\n`);
  for (const k of missing) console.log('  ' + k);
  process.exit(1);
}
console.log(`i18n OK — ${keys.size} strings, all translated.`);
