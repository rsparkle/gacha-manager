# GachaManager
![Latest release](https://img.shields.io/github/v/release/rsparkle/gacha-manager)

A task manager built for gacha players. Tracks dailies, resets and deadlines across games and accounts so you never miss out on any limited rewards, with a calendar of upcoming new characters, patches and livestreams.

**[Try it in your browser →](https://rsparkle.github.io/gacha-manager/)**

**Built with:** Electron + Vue 3 + Vite

**Platform:** Windows desktop app, plus a web version for PC and mobile

---
## Download
Grab the latest installer from [Releases](https://github.com/rsparkle/gacha-manager/releases/latest). The app updates itself after that.

Windows SmartScreen may warn about an unrecognized app since the installer isn't code-signed. Click **More info → Run anyway**.

## Web Version
**[Try it in your browser →](https://rsparkle.github.io/gacha-manager/)**

The web version has every feature except Game Detection, which is desktop-only. Use **Settings → Accounts backup** to move account data between browsers or devices, or to and from the desktop app.

## Currently Supported Games
- Genshin Impact
- Honkai: Star Rail
- Zenless Zone Zero
- Neverness To Everness
- Infinity Nikki

## Features

### Setup
<img width="900" alt="Setup screen with game and server selection" src="https://github.com/user-attachments/assets/ba06aed2-5dd9-45fc-9352-e04366fc8323" />

- **Multi-Server Support:** Every server of every game is supported, so reset times always match your account's region.

### Tasks
<img width="900" alt="Task list with dailies, weeklies and reset countdowns" src="https://github.com/user-attachments/assets/5e751ed2-4ac6-438a-9f3d-608c761aad20" />

- **Per-Game Task Tracking:** Track dailies, weeklies, events and more for each game.
- **Multi-Account Support:** Switch between main and alt accounts. Entering a UID picks the right server automatically.
- **Server-Aware Reset Timers:** Each task counts down to its real reset on your server, daylight saving time included.
- **Notifications:** Optional Windows or browser alerts when unfinished tasks are about to reset.
- **Game Detection** *(desktop only)*: Optionally completes your dailies automatically while the game is running.

### Schedule
<img width="900" alt="Calendar showing patch releases, banners and livestreams" src="https://github.com/user-attachments/assets/80de01a5-74e5-47c6-b6c1-29a48236e964" />

- **Patch Calendar:** Releases, banners and livestreams with countdowns, timed to your server.

### Character Themes
<img width="900" alt="Theme picker with character themes from each game" src="https://github.com/user-attachments/assets/b6258195-689b-44a0-b81e-24c93fb25d1d" />

- Every game comes with at least one character theme, with more on the way.

## Building from source
```bash
# Clone the repo
git clone https://github.com/rsparkle/gacha-manager.git
cd gacha-manager

# Install dependencies
npm install

# Run or build the desktop app
npm start
npm run make

# Run or build the web version
npm run web:dev
npm run web:build
```

## Privacy
Once a day, the desktop app and the web version send an anonymous count with only the app version and the platform (desktop, web or mobile). There's no ID, account data or anything else that could identify you. It's just how I know if people are using it.

Everything else stays on your device. Reports are only sent when you submit one.

## Disclaimer
GachaManager is an unofficial fan project and is not affiliated with or endorsed by any of the developers or publishers of the games it supports.

All game assets, characters and imagery are the property of their respective owners. This project is non-commercial and intended for personal use.
