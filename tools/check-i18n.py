#!/usr/bin/env python3
"""
Report any user-facing string that cannot be translated.

Three ways a string reaches the user in Virtus Feed:
  1. data-en / data-en-ph attributes in index.html  → swept by applyLanguage()
  2. T('English key') in the JS                     → looked up at call time
  3. showToast('English key')                       → showToast() calls T() itself

All three need an entry in the dictionaries. Anything missing renders in
English no matter what language the operator picked. Markup that hardcodes
Spanish with no data-en is the other failure mode — it can never become
English — so that is reported too.

Run after adding UI:  python3 tools/check-i18n.py
Exits non-zero if anything is untranslatable.
"""
import re, sys, html, glob, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
idx  = (root / 'src/index.html').read_text()
DICTS = ['src/js/01-i18n.js', 'src/js/18-i18n-feed.js']

have = set()
for d in DICTS:
    for m in re.finditer(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", (root / d).read_text(), re.M):
        have.add(m.group(1))

keys = set()
for m in re.finditer(r'data-en(?:-ph)?="([^"]+)"', idx):
    keys.add(html.unescape(m.group(1)))
for f in sorted(glob.glob(str(root / 'src/js/*.js'))):
    if 'i18n' in f:
        continue
    src = pathlib.Path(f).read_text()
    for m in re.finditer(r"T\('([^'\\]+)'\)", src):
        keys.add(m.group(1))
    for m in re.finditer(r"showToast\(\s*'([^'\\]+)'\s*[,)]", src):
        keys.add(m.group(1))

missing = sorted(k for k in keys if k not in have)

# Spanish sitting in the markup with no data-en can never render as English.
SP = re.compile(r'[áéíóúñ¿¡]')
# Deliberately untagged: language names always render in their own language
# (every OS picker does this), and .tab-label is owned by applyLanguage()'s
# tabMap rather than the data-en sweep.
ALLOWED = {'Español'}
untagged = []
for m in re.finditer(r'<(\w+)((?:(?!data-en)[^<>])*?)>([^<>]+)</\1>', idx):
    attrs, text = m.group(2), m.group(3).strip()
    if not text or not SP.search(text) or 'data-en' in attrs:
        continue
    if text in ALLOWED or 'tab-label' in attrs:
        continue
    untagged.append(text[:60])

print(f'dictionary keys: {len(have)}   strings used by the UI: {len(keys)}')
print(f'\nmissing translations: {len(missing)}')
for k in missing:
    print('  ' + k)
print(f'\nSpanish in markup with no data-en: {len(set(untagged))}')
for t in sorted(set(untagged)):
    print('  ' + t)

sys.exit(1 if (missing or untagged) else 0)
