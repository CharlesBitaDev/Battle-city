# Battle City: notes for Claude

A Battle City-style tank game for an Android 9 TV box (generic "SMART_TV" firmware, Mali-450 GPU, **no Play Store**). The owner works from a phone only: never ask them to run commands. They install the APK on the TV by typing **tinyurl.com/btt000** in its Downloader app (the older tinyurl.com/battlecitytv goes to the same place). Both links point to `dist/battle-city.apk` on branch `ccr-b0870caf-5uxupg`, so every update must commit a rebuilt `dist/battle-city.apk` there. Their TV has no Play Store and no working ADB, and a USB or phone-cable install shows "Can't open file".

## How it works

- The game is plain HTML5 canvas + JavaScript in `web/`, and the Android app (`android/`) shows it full screen in a WebView, loaded from the APK's assets.
- **JavaScript must stay ES2017** (old TV WebView): no `?.`, `??`, class fields, `Array.flat`, `Object.fromEntries`, ES modules. Also avoid newer CSS like `inset` or `aspect-ratio` in `index.html`. `node tools/check.mjs` enforces the syntax part.
- Logical screen 384x216 (16:9), battlefield 208x208 at (88,4), 26x26 cells of 8px. Bricks are tracked in 4px quarters (`G.bq`); a shell removes a 4px strip 16px wide. Fixed 60 Hz update in `main.js`.
- **Sound on the TV is native:** `node tools/render-sounds.mjs` records every effect from `audio.js` (8-bit NES-style: pulse/triangle/LFSR-noise voices stepped at 60 Hz; original tunes, not copies of Namco's music; plus a seamless 1-second `engine` loop from `BC.audio.renderEngine`) into `web/sounds/*.ogg`. The TV app plays them with Android `SoundPool` via `Android.playSound(name, vol)` / `Android.engine(level)` (0 off, 1 idle, 2 driving = louder and 1.2x speed). Live WebAudio synthesis is only used in browsers. The owner reported the live-synth sound playing badly on the TV, so re-run the recorder after changing any sound in `audio.js`. `build-apk.sh` stores `.ogg` files uncompressed (`-0 ogg`), as `openFd` needs.
- Files: `font.js` (5x7 pixel font, cached), `sprites.js` (all graphics drawn in code), `levels.js` (generated), `audio.js` (WebAudio blips), `input.js` (merges remote/phone/keyboard/touch per player), `game.js` (rules + all screens), `main.js` (loop, platform bridge, keyboard, on-screen touch buttons for phone browsers), `qrcode.js` (vendored kazuhikoarase/qrcode-generator 2.0.4, MIT).
- Modes (`G.kind`): `campaign` (the 100 stages), `survival` (endless, `setWave()` every 10 kills, stage layout = random `G.arena`, best run saved in `save.surv`) and `versus` (P1 bottom centre v P2 top centre, no base or enemies, `G.vs` scores, first to `VS_TARGET`). Enemy strength comes from `setDifficulty(s, ease)` (`G.diff`). The ship power-up (`t.ship`) lets a player drive on water and absorbs one hit unless over water.
- Stages: `node tools/gen-levels.mjs` regenerates `web/js/levels.js` deterministically (seeded). It checks every stage is reachable and the base's middle lane is shielded. Don't hand-edit `levels.js`.
- Difficulty per stage: in `buildStage()` (`speedMul`, `smart`, `fireChance`, `spawnInterval`) and the enemy roster in `gen-levels.mjs`.

## TV app (android/)

- No Gradle: `build-apk.sh` uses aapt2/javac/d8/apksigner directly (build-tools **35.0.0**; 34's d8 crashes on these classes), platform android-34, minSdk 21.
- `MainActivity` sends remote keys to JS as `BC.key(name, down)` (up/down/left/right/ok/back) and handles `window.Android` calls: `getAddress`, `load`/`save` (SharedPreferences), `exit`, `sendToPhone`.
- `ControllerServer` (plain Java, testable on a desktop JVM) serves `web/controller.html` on port 8765 (next free port up to 8774) plus a WebSocket at `/ws`. Protocol is in the class comment. Phones call `BC.phoneJoin/phoneState/phoneMenu`.
- Signing key `android/battle-city.keystore` (password `battlecity`) is committed on purpose. Every build must use the same key, or the TV refuses to update over the installed app. It's a hobby app, not a secret.
- Icons/banner: `node tools/make-icons.mjs` (renders the game's own sprites with Playwright).

## Build and release

- **The owner installs `dist/battle-city.apk` from the repo.** After every change: run `node tools/check.mjs`, rebuild, copy `build/battle-city.apk` to `dist/`, and commit it with the change. Download link (work happens on branch `ccr-b0870caf-5uxupg`): https://github.com/CharlesBitaDev/Battle-city/raw/ccr-b0870caf-5uxupg/dist/battle-city.apk
- versionCode = number of commits + 1 (`build-apk.sh`), so each committed build is newer than the last. Never lower it, or the TV refuses the update.
- CI (`.github/workflows/build.yml`) would build the APK and replace a `latest` release on every push, but as of 2026-10-04 GitHub never assigns its job a runner on this account (it fails in seconds with no steps or logs). It's probably an account or billing restriction, not the code.
- Local build: `ANDROID_HOME=~/android-sdk ./build-apk.sh` (install the SDK command-line tools, then `sdkmanager "build-tools;35.0.0" "platforms;android-34"`).

## Testing without a TV

- Open `web/index.html?debug=1` in Chromium (Playwright). `?debug=1` unlocks all stages. Keyboard: arrows + space (P1), WASD + F (P2), Esc = back.
- `BC.game.debug` has hooks: `startStage(mode, stage)`, `killEnemies()`, `destroyBase()`, `spawnPower(kind)`, `state()`.
- To mimic the TV, inject a fake `window.Android` with `page.addInitScript` and call `BC.key(...)` / `BC.phoneState(slot, bits)`.

## Game Store app (store/)

- A second TV app, **Game Store** (`com.charlesbita.gamestore`), lists the games in `store/catalog.json` and installs or updates them with Android's `PackageInstaller` (session API, REQUEST_INSTALL_PACKAGES). On first use the TV asks to allow installs from Game Store (`Android.allowInstalls()` opens that setting). The screen is `store/web/index.html` in a WebView. The remote is mapped to `Store.key()`, and Java calls `Store.onCatalog/onProgress/onInstalled/onInstallError/refresh`.
- The store reads the catalog from `https://raw.githubusercontent.com/CharlesBitaDev/Battle-city/ccr-b0870caf-5uxupg/store/catalog.json` (`CATALOG_URL` in `store/android/src/.../MainActivity.java`), caching the last copy for offline use. **Moving the branch breaks installed stores**, so if that ever happens, keep the old file working or ship a store update first.
- Each game entry has `id, name, package, version (versionCode), versionName, apk (direct https URL), banner (320x180 image URL), players, description`. A game shows UPDATE when the installed versionCode is lower than `version`. Any Android TV APK can be added, including ones from other repos.
- `build-apk.sh` and `store/build-store.sh` write their version into the catalog (`tools/set-catalog.mjs`). After building, copy `build-store/game-store.apk` to `dist/` and commit it together with the catalog. The store offers itself as an update when `catalog.store.version` is higher.
- The owner installs the store once from **tinyurl.com/bttstore** (points to `dist/game-store.apk`). Icons: `node tools/make-store-icons.mjs`.

## Kiko's Quest (kiko/)

- A second game: an original side-scrolling platformer (not Mario: own hero, enemies, tunes and levels). Hero Kiko (orange fox, teal scarf); player 2 is Miko (blue fox, orange scarf). Package `com.charlesbita.kiko`, built by `kiko/build-apk.sh` into `kiko/build/kiko.apk`; copy it to `dist/kiko.apk` and commit. Signed with the same key as Battle City (`android/battle-city.keystore`). Listed in `store/catalog.json` as `kiko`.
- Same platform layer as Battle City (`main.js`, `input.js`, `font.js`, `qrcode.js`, `ControllerServer`, phone controller page with a JUMP button). Rules stay ES2017; `node kiko/tools/check.mjs` checks syntax and levels.
- Screen 384x216; tiles 16px; maps are 13 rows drawn from y = 8 (the score line sits above). 16 levels in 4 worlds (grass, desert, cave, night) from `node kiko/tools/gen-levels.mjs` (seeded, built from hand-made chunks so every jump is possible; don't hand-edit `levels.js`). Map legend is at the top of `gen-levels.mjs`.
- Controls: left/right run, OK or UP jumps (hold for higher), DOWN throws a fireball with the sun seed, BACK pauses. The TV remote sends one key at a time, so Kiko keeps sideways speed in the air when no direction is held. Physics constants are at the top of `kiko/web/js/game.js` (full jump about 4 tiles high, about 5.5 tiles long when running).
- Items: berry (grow), sun seed (fire), heart (1 up); 100 coins = 1 up. Enemies: beetle and frog (stomp), bird (flies, stomp), spiky (can't be stomped; fireball or bump it). Checkpoint flag halfway; goal pole gives a height bonus, then the clock turns into points. Shared lives; in 2 players the camera follows whoever is ahead and pulls the other along.
- Sound: `kiko/web/js/audio.js` (8-bit effects and four original music loops). `node kiko/tools/render-sounds.mjs` records them to `kiko/web/sounds/*.ogg` (music as `music-<world>.ogg`); the TV app plays effects with SoundPool and music with MediaPlayer via `Android.playSound(name, vol)` / `Android.music(name)` ("" = stop). Re-run the recorder after changing any sound.
- Icons/banner: `node kiko/tools/make-icons.mjs`. Saves go to SharedPreferences "kiko", key `kiko-save` (`best` level index reached, `hi`, `muted`, `music`).
- Debug: `kiko/web/index.html?debug=1` unlocks all levels; `BC.game.debug` has `startLevel(players, index)`, `give(i, form)`, `kill(i)`, `teleport(i, col, row)`, `state()`.
- The owner asked for these games to live in their own "Game-store" repo; it didn't exist yet (2026-10-04), so Kiko lives here for now.
