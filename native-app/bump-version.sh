#!/bin/bash
# Bump the app version in one place.
#
#   ./bump-version.sh 1.0.1     -> version 1.0.1, build number +1
#   ./bump-version.sh           -> build number +1 only (same version)
#
# Keeps five things in step, which otherwise drift silently:
#   - APP_VERSION in index.html            (what the About screen shows)
#   - versionName / versionCode  (Android)  Play rejects a reused versionCode
#   - MARKETING_VERSION / CURRENT_PROJECT_VERSION (iOS)  same rule on App Store
set -e
cd "$(dirname "$0")"

ROOT_HTML="../index.html"
GRADLE="android/app/build.gradle"
PBX="ios/App/App.xcodeproj/project.pbxproj"

[ -f "$ROOT_HTML" ] || { echo "error: $ROOT_HTML not found"; exit 1; }
[ -f "$GRADLE" ]    || { echo "error: $GRADLE not found";    exit 1; }

CUR_CODE=$(grep -oE 'versionCode +[0-9]+' "$GRADLE" | grep -oE '[0-9]+')
CUR_NAME=$(grep -oE 'versionName +"[^"]+"' "$GRADLE" | sed -E 's/.*"([^"]+)".*/\1/')
NEW_CODE=$((CUR_CODE + 1))
NEW_NAME="${1:-$CUR_NAME}"

if ! echo "$NEW_NAME" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "error: version must look like 1.2.3 (got '$NEW_NAME')"; exit 1
fi

# ── Android ──
sed -i '' -E "s/versionCode +[0-9]+/versionCode $NEW_CODE/"        "$GRADLE"
sed -i '' -E "s/versionName +\"[^\"]+\"/versionName \"$NEW_NAME\"/" "$GRADLE"

# ── web / About screen ──
sed -i '' -E "s/var APP_VERSION = '[^']*';/var APP_VERSION = '$NEW_NAME';/" "$ROOT_HTML"
# A silent no-op here is how the About screen ends up disagreeing with the store.
grep -q "var APP_VERSION = '$NEW_NAME';" "$ROOT_HTML" \
  || { echo "error: APP_VERSION not updated in $ROOT_HTML"; exit 1; }

# ── iOS (only if the platform has been added) ──
if [ -f "$PBX" ]; then
  sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $NEW_NAME;/g"          "$PBX"
  sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $NEW_CODE;/g" "$PBX"
fi

cp "$ROOT_HTML" www/index.html
npx cap sync android >/dev/null 2>&1 || true
[ -d ios ] && npx cap sync ios >/dev/null 2>&1 || true

echo "version  $CUR_NAME -> $NEW_NAME"
echo "build    $CUR_CODE -> $NEW_CODE"
[ -f "$PBX" ] && echo "updated: android + ios + web" || echo "updated: android + web"
echo "synced."
