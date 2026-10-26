# GachaManager
![Latest release](https://img.shields.io/github/v/release/rsparkle/gacha-manager)

A task manager built gacha players. Tracks dailies, resets and deadlines across games and accounts so you never miss out on any limited rewards, with a calendar of upcoming new characters, patches and livestreams.

**Built with:** Electron + Vue 3 + Vite

**Platform:** Windows desktop app and a web version

---
## Download
Grab the latest installer from [Releases](https://github.com/rsparkle/gacha-manager/releases/latest). The app updates itself after that.

Windows SmartScreen may warn about an unrecognized app since the installer isn't code-signed. Click **More info → Run anyway**.

## Web version
Try it in the browser at **https://rsparkle.github.io/gacha-manager/**.

The web version has the schedule and task tracking, with accounts saved in the browser. Game detection and notifications are desktop-only.
Use **Settings → Accounts backup** to move them between browsers or to and from the desktop app.

## Supported Games
- Genshin Impact
- Honkai: Star Rail
- Zenless Zone Zero
- Neverness To Everness
- Infinity Nikki

## Preview
**Setup**

https://github.com/user-attachments/assets/e99ae7bc-26b1-4c58-9c44-281b29654357

**Tasks**

https://github.com/user-attachments/assets/2b24b5c2-60a3-44a7-8da3-32d8850590ef

**Schedule**

https://github.com/user-attachments/assets/b0336d16-2e27-4e57-b3bb-063e3235cb73

## Key Features

- **Per-Game Task Tracking:** Track dailies, weeklies, events, etc. per game.
- **Server-Aware Reset Timers:** Every task counts down to its real reset time on your account's server, including servers that follow daylight saving time.
- **Multi-Account Support:** Seamlessly switch between main and alt accounts. Entering a UID picks the right server automatically.
- **Notifications & Game Detection:** Optional Windows alerts when unfinished tasks are about to reset, and optional automatic completion of your dailies when the game is running.
- **Schedule Tracking:** Visual calendar of patch releases, banners and livestreams with countdown timers and server-aware timing.
- **Character Themes:** A default dark mode plus character themes for a few characters.

## Building from source
```bash
# Clone the repo
git clone https://github.com/rsparkle/gacha-manager.git

# Install dependencies
npm install

# Run or Build the desktop app
npm start
npm run make

# Run or Build the web version
npm run web:dev
npm run web:build
```

## Disclaimer
GachaManager is an unofficial fan project and is not affiliated with or endorsed by any of the developers or publishers of the games it supports.

All game assets, characters and imagery are the property of their respective owners. This project is non-commercial and intended for personal use.
