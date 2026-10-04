# Battle City: notes for Claude

A Battle City-style tank game for an Android 9 TV box (generic "SMART_TV" firmware, Mali-450 GPU, **no Play Store**). The owner works from a phone only: never ask them to run commands. They test by installing the APK from the GitHub release.

## How it works

- The game is plain HTML5 canvas + JavaScript in `web/`, and the Android app (`android/`) shows it full screen in a WebView, loaded from the APK's assets.
- **JavaScript must stay ES2017** (old TV WebView): no `?.`, `??`, class fields, `Array.flat`, `Object.fromEntries`, ES modules. Also avoid newer CSS like `inset` or `aspect-ratio` in `index.html`. `node tools/check.mjs` enforces the syntax part.
- Logical screen 384x216 (16:9), battlefield 208x208 at (88,4), 26x26 cells of 8px. Bricks are tracked in 4px quarters (`G.bq`); a shell removes a 4px strip 16px wide. Fixed 60 Hz update in `main.js`.
- Files: `font.js` (5x7 pixel font, cached), `sprites.js` (all graphics drawn in code), `levels.js` (generated), `audio.js` (WebAudio blips), `input.js` (merges remote/phone/keyboard/touch per player), `game.js` (rules + all screens), `main.js` (loop, platform bridge, keyboard, on-screen touch buttons for phone browsers), `qrcode.js` (vendored kazuhikoarase/qrcode-generator 2.0.4, MIT).
- Stages: `node tools/gen-levels.mjs` regenerates `web/js/levels.js` deterministically (seeded). It checks every stage is reachable and the base's middle lane is shielded. Don't hand-edit `levels.js`.
- Difficulty per stage: in `buildStage()` (`speedMul`, `smart`, `fireChance`, `spawnInterval`) and the enemy roster in `gen-levels.mjs`.

## TV app (android/)

- No Gradle: `build-apk.sh` uses aapt2/javac/d8/apksigner directly (build-tools **35.0.0**; 34's d8 crashes on these classes), platform android-34, minSdk 21.
- `MainActivity` sends remote keys to JS as `BC.key(name, down)` (up/down/left/right/ok/back) and handles `window.Android` calls: `getAddress`, `load`/`save` (SharedPreferences), `exit`, `sendToPhone`.
- `ControllerServer` (plain Java, testable on a desktop JVM) serves `web/controller.html` on port 8765 (next free port up to 8774) plus a WebSocket at `/ws`. Protocol is in the class comment. Phones call `BC.phoneJoin/phoneState/phoneMenu`.
- Signing key `android/battle-city.keystore` (password `battlecity`) is committed on purpose. Every build must use the same key, or the TV refuses to update over the installed app. It's a hobby app, not a secret.
- Icons/banner: `node tools/make-icons.mjs` (renders the game's own sprites with Playwright).

## Build and release

- CI (`.github/workflows/build.yml`) runs on every push: checks the code, builds the APK (versionCode = 100 + run number) and replaces the `latest` release.
- Download link: https://github.com/CharlesBitaDev/Battle-city/releases/download/latest/battle-city.apk
- Local build: `ANDROID_HOME=~/android-sdk ./build-apk.sh` (install the SDK command-line tools, then `sdkmanager "build-tools;35.0.0" "platforms;android-34"`).

## Testing without a TV

- Open `web/index.html?debug=1` in Chromium (Playwright). `?debug=1` unlocks all stages. Keyboard: arrows + space (P1), WASD + F (P2), Esc = back.
- `BC.game.debug` has hooks: `startStage(mode, stage)`, `killEnemies()`, `destroyBase()`, `spawnPower(kind)`, `state()`.
- To mimic the TV, inject a fake `window.Android` with `page.addInitScript` and call `BC.key(...)` / `BC.phoneState(slot, bits)`.
