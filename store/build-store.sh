#!/usr/bin/env bash
# Builds the Game Store app (build-store/game-store.apk) with the plain Android SDK tools.
# Same tools and signing key as ../build-apk.sh. Also records the version in store/catalog.json.
# Usage: store/build-store.sh   (version code = number of commits + 1)
set -euo pipefail
cd "$(dirname "$0")/.."

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
VERSION_CODE="${VERSION_CODE:-$(( $(git rev-list --count HEAD 2>/dev/null || echo 0) + 1 ))}"
VERSION_NAME="${VERSION_NAME:-1.0.$VERSION_CODE}"
OUT=build-store

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets/web"
cp store/web/index.html "$OUT/assets/web/"

"$BT/aapt2" compile --dir store/android/res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" \
  --manifest store/android/AndroidManifest.xml -A "$OUT/assets" "$OUT/res.zip" \
  --java "$OUT/gen" --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --min-sdk-version 21 --target-sdk-version 34

javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -d "$OUT/classes" \
  $(find store/android/src "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 21 --lib "$JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')

cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q unsigned.apk classes.dex)
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks android/battle-city.keystore --ks-pass pass:battlecity \
  --ks-key-alias battlecity --key-pass pass:battlecity --out "$OUT/game-store.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/game-store.apk"
if command -v node >/dev/null; then node tools/set-catalog.mjs store "$VERSION_CODE" "$VERSION_NAME"; fi
echo "Built $OUT/game-store.apk (version $VERSION_NAME, code $VERSION_CODE)"
