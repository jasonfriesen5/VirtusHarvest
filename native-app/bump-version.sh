#!/bin/bash
# Bump the app version in one place.
#
#   ./bump-version.sh 1.0.2     -> version 1.0.2, build number +1
#   ./bump-version.sh           -> build number +1 only (same version)
#
# Keeps four things in step, which otherwise drift silently — and already had:
# the About screen read 1.0.1 while Gradle said 1.0.
#   - APP_VERSION in src/js/00-platform.js   (what the About screen shows)
#   - versionName / versionCode  (Android)    Play rejects a reused versionCode
#   - MARKETING_VERSION / CURRENT_PROJECT_VERSION (iOS)  same rule on App Store
#
# versionCode is the one that must ALWAYS rise: Play permanently reserves every
# number you upload, so a forgotten bump means a rejected release.
set -e
cd "$(dirname "$0")"

GRADLE="android/app/build.gradle"
PLATFORM_JS="../src/js/00-platform.js"
PBX="ios/App/App.xcodeproj/project.pbxproj"
BUILD_SH="../build.sh"

[ -f "$GRADLE" ]      || { echo "error: $GRADLE not found";      exit 1; }
[ -f "$PLATFORM_JS" ] || { echo "error: $PLATFORM_JS not found"; exit 1; }

CUR_CODE=$(grep -oE 'versionCode +[0-9]+' "$GRADLE" | grep -oE '[0-9]+')
CUR_NAME=$(grep -oE 'versionName +"[^"]+"' "$GRADLE" | sed -E 's/.*"([^"]+)".*/\1/')
NEW_CODE=$((CUR_CODE + 1))
NEW_NAME="${1:-$CUR_NAME}"

if ! echo "$NEW_NAME" | grep -qE '^[0-9]+\.[0-9]+(\.[0-9]+)?$'; then
  echo "error: version must look like 1.2 or 1.2.3 (got '$NEW_NAME')"; exit 1
fi

# ── Android ──
sed -i '' -E "s/versionCode +[0-9]+/versionCode $NEW_CODE/"         "$GRADLE"
sed -i '' -E "s/versionName +\"[^\"]+\"/versionName \"$NEW_NAME\"/"  "$GRADLE"

# ── web / About screen ──
sed -i '' -E "s/var APP_VERSION = '[^']*';/var APP_VERSION = '$NEW_NAME';/" "$PLATFORM_JS"
# A silent no-op here is how the About screen ends up disagreeing with the store.
grep -q "var APP_VERSION = '$NEW_NAME';" "$PLATFORM_JS" \
  || { echo "error: APP_VERSION not updated in $PLATFORM_JS"; exit 1; }

# ── iOS (only if the platform has been added) ──
if [ -f "$PBX" ]; then
  sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $NEW_NAME;/g"             "$PBX"
  sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $NEW_CODE;/g" "$PBX"
fi

# build.sh stamps the cache-busting BUILD_ID and copies src/ into www/ and
# native-app/www/, then runs cap sync for both platforms. Doing it here means a
# bump is never left half-applied to the native projects.
if [ -x "$BUILD_SH" ]; then
  "$BUILD_SH" --sync >/dev/null 2>&1 || { echo "error: build.sh --sync failed"; exit 1; }
fi

echo "version  $CUR_NAME -> $NEW_NAME"
echo "build    $CUR_CODE -> $NEW_CODE"
[ -f "$PBX" ] && echo "updated: android + ios + web" || echo "updated: android + web"
echo "synced."
