#!/bin/bash
# Copy src/ into www/ (browser preview) and native-app/www/ (what Capacitor
# packages into the Android and iOS apps). No bundler: the app is plain scripts,
# so what runs on the tablet is exactly what's in src/.
#
# Memory from Harvest: BOTH platforms must be synced after any app change, or
# one of them silently ships the old web assets.
set -e
cd "$(dirname "$0")"

# Stamp every asset URL with the build id. Without this both Chrome and the
# Android WebView happily serve a cached copy of a .js file after a rebuild —
# you edit code, sync, relaunch, and run the OLD script with no sign anything
# is wrong. Cost a debugging session; not doing it again.
BUILD_ID=$(date +%Y%m%d%H%M%S)

for dest in www native-app/www; do
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R src/index.html src/css src/js "$dest"/
  BUILD_ID="$BUILD_ID" python3 - "$dest/index.html" <<'PY'
import os, re, sys
path = sys.argv[1]
ver  = os.environ['BUILD_ID']
html = open(path).read()
html = re.sub(r'(\./(?:js|css)/[A-Za-z0-9._-]+\.(?:js|css))"',
              lambda m: m.group(1) + '?v=' + ver + '"', html)
open(path, 'w').write(html)
PY
done

echo "www/ + native-app/www/ built — $(find www -type f | wc -l | tr -d ' ') files each"

if [ "$1" = "--sync" ]; then
  cd native-app
  npx cap sync android
  npx cap sync ios 2>/dev/null || echo "(ios platform not added yet — skipped)"
fi
