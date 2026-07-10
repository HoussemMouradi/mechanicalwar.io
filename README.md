# mechanical war.io

A lightweight peer-to-peer multiplayer FPS that runs directly in the browser and deploys as a static GitHub Pages site.

## Play

1. Enter a player name, choose a team, and choose a room code.
2. Use **Quick Play** to create a room automatically, or use **Host Room** for the first player.
3. Share the room link. Other players use **Join Room** with the same code.

Desktop controls: WASD/ZQSD to move, Shift to sprint, Space to jump, mouse to aim/fire, E to pick up or drop, R to reload, and Escape to pause. Touch devices get dual-zone movement/aim controls plus fire, jump, use, and reload buttons.

## Weapons

The arena contains eight weapons with distinct roles: Viper Pistol, Vector SMG, Bulldog Shotgun, Sentinel Rifle, AK-47 Ravager, M4 Guardian, RPG-7 Titan, and Tactical Knife. Each has individual damage, range, spread, recoil, magazine, reserve ammunition, cadence, reload timing, model, sound profile, and effects.

## Architecture

- `index.html` — static Pages entry point and legacy room-code multiplayer core.
- `enhancements.js` — quality pass for weapons, combat feedback, authoritative host validation, spawns, map, touch controls, and rendering performance.
- `styles.css` — responsive menu, HUD feedback, loading/death states, and mobile controls.
- `tests/` — syntax, menu, gameplay, respawn, map, weapon, and synchronization smoke tests.

Multiplayer uses PeerJS/WebRTC. The host validates identity, weapon, cadence, damage ceiling, range, teams, map bounds, deaths, and respawns before relaying combat events. It remains a browser-hosted peer match rather than a dedicated competitive server; see the limitations below.

## Local development

```bash
npm install
npm test
```

To play locally:

```bash
npx http-server . -p 4173 -c-1
```

Then open `http://127.0.0.1:4173`.

## Deployment

The project intentionally has no build step. GitHub Pages can serve the repository root directly. All local assets use relative paths, so project-site URLs such as `/mechanicalwar.io/` continue to work.

The Three.js and PeerJS runtimes are loaded from pinned CDN versions. A network connection is therefore required on first load, and the public PeerJS broker plus WebRTC connectivity are required for multiplayer.

## Known limitations

- Peer-hosted matches end if the host leaves; host migration is not implemented.
- WebRTC may fail on restrictive networks without a dedicated TURN relay.
- The host performs sanity validation, but a dedicated authoritative server would still be required for ranked/anti-cheat play.
- Procedural audio starts only after a user interaction because of browser autoplay policies.
