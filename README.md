# GachaManager
![Latest release](https://img.shields.io/github/v/release/rsparkle/gacha-manager)

A desktop task manager built for people who play multiple gacha games at once. Tracks dailies, resets and deadlines across games and accounts so nothing expires while you're busy playing a different one.

**Built with:** Electron + Vue 3 + Vite

**Platform:** Windows only

---
## Download
Grab the latest installer from [Releases](https://github.com/rsparkle/gacha-manager/releases/latest). The app updates itself after that.

Windows SmartScreen may warn about an unrecognized app since the installer isn't code-signed. Click **More info → Run anyway**.

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
- **Server-Aware Reset Timers:** UID prefix auto-detection handles region-specific resets (America/Europe/Asia).
- **Multi-Account Support:** Seamlessly switch between main and alt accounts.
- **Notifications & Game Detection:** Optional Windows alerts when unfinished tasks are about to reset, and optional automatic completion of your dailies when the game is running.
- **Schedule Tracking:** Visual calendar of patch releases, banners and livestreams with countdown timers and server-aware timing.
- **Character Themes:** A default dark mode plus character themes for a few characters.

## Building from source
```bash
# Clone the repo
git clone https://github.com/rsparkle/gacha-manager.git

# Install dependencies
npm install

# Run or Build
npm start
npm run make
```

## Disclaimer
GachaManager is an unofficial fan project and is not affiliated with or endorsed by any of the developers or publishers of the games it supports.

All game assets, characters and imagery are the property of their respective owners. This project is non-commercial and intended for personal use.
