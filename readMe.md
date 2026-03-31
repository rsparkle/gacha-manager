# GachaManager

A desktop task manager built for people who play multiple gacha games at once. Tracks dailies, resets and deadlines across games and accounts so nothing expires while you're busy playing a different one.

**Built with:** Electron + Vue 3 + Vite

---

## Project Status
- **Current Version:** `v0.7.7` (Alpha)
- **Status:** Active Development. Core logic is functional; game data is actively being expanded.

## Preview
**Setup**

https://github.com/user-attachments/assets/30c66999-dad8-4234-bda5-3fdbedf5cf11

**Tasks**

https://github.com/user-attachments/assets/6aff6f0f-560d-4461-929d-a27e8823d253

**Server Time**

https://github.com/user-attachments/assets/20fe0a42-f62a-42ce-ad12-a9cd656ae6dc

**Account Management**

https://github.com/user-attachments/assets/b4fb7ae1-ec34-4e7b-9095-e7a8d2724ef7


## Key Features

- **Per-Game Task Tracking:** Real-time completion tracking with instant UI updates.
- **Server-Aware Reset Timers:** UID prefix auto-detection handles region-specific resets (NA/EU/Asia).
- **Multi-Account Support:** Seamlessly switch between main and alt accounts.
- **Dynamic Themes:** Includes a default sleek dark mode and a specialized **HSR Sparkle** theme.
- **Smart Cleanup:** Removing the last account for a game automatically cleans up your sidebar.
- **Schedule & Event Tracking:** Visual calendar of patch releases, banners and livestreams with countdown timers and server-aware timing.

## Roadmap
- [ ] **Hoyolab Integration:** Track your stamina in real time.
- [ ] **Expanded Library:** Support for additional games and themes.

## Installation & Building

> [!IMPORTANT]
> **Asset Notice:** Official game assets are **not** included in the source code. Pre-built releases bundle these assets automatically. If building from source, you will need to provide your own assets.

```bash
# Clone the repo
git clone https://github.com/ricardomagid/GachaManager.git

# Install dependencies
npm install

# Add game assets to src/renderer/assets/

# Run or Build
npm start
npm run make
```

## Disclaimer
GachaManager is an unofficial fan project and is not affiliated with or endorsed by HoYoverse (Cognosphere) or any other game developer.

All game assets, characters and imagery are the property of their respective owners. This project is non-commercial and intended for personal use.
