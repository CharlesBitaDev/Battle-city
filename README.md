# Battle City

A tank game for Android TV in the style of the classic arcade tank games. Defend your eagle base and destroy 20 enemy tanks on each of the **100 stages**. One or two players.

## Controls

| | TV remote | Phone controller |
|---|---|---|
| Move | Arrow keys | Arrow pad (slide your thumb) |
| Fire / choose | OK | FIRE (shows "OK" in menus) |
| Pause / back | Back | II |

- **Player 1** can use the TV remote, a phone, or both.
- **Player 2** uses a phone, because the TV can't tell two remotes apart.
- **To connect a phone:** connect it to the same Wi-Fi as the TV. Open **Phone controller** on the title screen, then scan the code with the phone's camera (or type the address shown into the phone's browser). Tap **Player 1** or **Player 2**. Nothing needs to be installed on the phone.

## Game Store

**Game Store** is a second TV app that lists the games and installs or updates them with one press of OK, so you don't need to type links. Install it once by typing **tinyurl.com/bttstore** in the TV's Downloader app. After that, open Game Store and choose a game: it shows **Install**, **Update** or **Play**. The list of games is `store/catalog.json`.

## Install on the TV

The newest build is always here. On the TV, type this short link in the Downloader app: **tinyurl.com/btt000**

Full link:

**https://github.com/CharlesBitaDev/Battle-city/raw/ccr-b0870caf-5uxupg/dist/battle-city.apk**

1. Download `battle-city.apk` on the TV, either with its browser or a downloader app.
2. Open the file and choose **Install**. The first time, the TV asks for permission to install apps from this source. Allow it.
3. **Battle City** then appears with the TV's other apps.

To update, install the new file over the old one. Your progress and high score are kept.

## Game modes

- **1 Player / 2 Players**: the 100 stages. Defend the eagle and destroy 20 tanks per stage.
- **Survival**: endless waves around the eagle. Every 10 tanks destroyed starts a harder wave. The game keeps your best wave and tank count. If a phone is connected as Player 2, you play it together.
- **Versus**: Player 1 against Player 2 on a random map with no enemies or eagle. The first to 5 hits wins. Power-ups appear every 10 seconds, and the clock freezes your opponent.

## What's in the game

- Bricks (shoot through them), steel (needs a 3-star tank), water, trees to hide under and ice that makes tanks slide.
- Four enemy types: basic, fast, power (fast shells) and armoured (four hits). Flashing red tanks drop a power-up when hit:
  helmet (shield), clock (freezes enemies), shovel (steel walls around the base), star (tank upgrade), grenade (destroys every enemy on screen), tank (extra life) and ship (drive across water; the boat also takes one hit for you, unless you are out on the water).
- Stages get harder: more armoured tanks, faster and smarter enemies, and more steel.
- The game remembers the highest stage reached. Choose any stage up to it on the title screen.

## For developers

See `CLAUDE.md`.
