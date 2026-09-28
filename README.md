# mechanical war.io

A Counter-Strike-style multiplayer office shooter that runs directly in the browser and deploys as a static GitHub Pages site. AUTO vs DJB, one office, first team to 30 eliminations.

## Play

1. Type a callsign, pick a department (**AUTO** or **DJB**) and an operative.
2. Press **PLAY**. There is exactly one room: the first player in becomes the host, everyone else walks straight in.

**RH** (Ressources Humaines) is listed too. It is not a playable department. Try it anyway.

### Operatives

| Operative | Look |
| --- | --- |
| The Manager | Bald, glasses, tie, synergy |
| Vape Guy | Backwards cap, stubble, vape pen (clouds included) |
| The Intern | Messy hair, backpack, lanyard |
| IT Guy | Ponytail, beard, headset, shorts |
| Sales Bro | Slick hair, sunglasses, gold watch |
| Coffee Queen | Bun, earrings, coffee on the vest |

### Controls

| Key | Action |
| --- | --- |
| WASD / ZQSD | Move (layout-independent) |
| Shift | Walk (silent footsteps) |
| Ctrl / C | Crouch; crouch mid-jump to tuck your legs and land on desks |
| Space | Jump |
| Mouse | Aim / fire, right-click scopes the AWP |
| E | Pick up a weapon or grab an office prop |
| LMB with a prop | Hold to charge, release to throw it at someone |
| R / G / V | Reload / drop / emote |
| 1-4, wheel | Primary, pistol, knife, held prop |
| Tab | Scoreboard |
| Esc | Pause and settings |

Touch devices get a floating move stick, drag-to-look and FIRE / JUMP / DUCK / R / USE / SWAP / SCOPE buttons.

### Weapons and props

Knife (backstabs kill), Glock-18, MP5, Nova, AK-47, M4A4, AWP and RPG-7, each with its own damage, head multiplier, spray recoil, spread, reload, move speed and procedural sound. Floor weapons are spread through the office (AWP in the CEO office, M4 in the server room, RPG at reception...).

Keyboards, mugs, staplers, phones, laptops, monitors, extinguishers, plants, bins, office chairs and printers can all be picked up and thrown; heavier items slow you down and hurt more.

## Architecture

No build step: plain ES modules, three.js 0.160 via an import map and PeerJS 1.5 from CDN.

- `src/main.js` wires the menu, loading, pause and settings overlays.
- `src/menu.js` renders the menu, the 3D character preview and the RH gag.
- `src/game.js` handles rendering, input, movement, combat, the viewmodel, network apply and the HUD loop.
- `src/touch.js` implements the mobile controls.
- `src/host.js` is the host-authoritative match state: validation, damage, pickups, prop physics, scoring and snapshots.
- `src/net.js` manages the single fixed room: host-or-join, retries, offline fallback and host-loss signalling.
- `src/world.js` builds the office map (desks, colliders you can stand on, lighting, radar data). It uses `src/textures.js` for procedural canvas textures and materials, and `src/geometry.js` for static batching helpers.
- `src/weapons.js`, `src/characters.js` and `src/props.js` build the weapon models and first-person arms, the character rigs (IK arms) and the throwable props with their physics.
- `src/fx.js` and `src/audio.js` provide the effects and procedural WebAudio sound.
- `src/hud.js` draws the CS-style HUD: radar, kill feed, scoreboard and damage indicators.
- `src/config.js` holds teams, characters, weapons, props, quality presets and saved settings.

If the host leaves, the remaining players reconnect and one of them takes over as host automatically. When the PeerJS broker cannot be reached, the game starts an offline practice session.

## Local development

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` runs a module syntax check, then Playwright tests against a mocked PeerJS broker. The tests cover the menu, the RH denial, entering the office, landing on a desk, throwing a prop, and two tabs joining the same room and shooting each other.

To play locally, double-click `play-local.cmd` (Windows), or run the command below. Opening `index.html` directly from disk does not work: browsers block ES modules on `file://` pages.

```bash
npx http-server . -p 4173 -c-1
```

Then open `http://127.0.0.1:4173` (open two tabs to play against yourself).

## Deployment

GitHub Pages can serve the repository root directly; all local assets use relative paths. A network connection is required on first load for the CDN runtimes, and the public PeerJS broker plus WebRTC connectivity are required for multiplayer.

## Known limitations

- WebRTC may fail on restrictive networks without a dedicated TURN relay.
- The host performs sanity validation (weapon ownership, damage caps, range, cadence), but a dedicated server would still be needed for real anti-cheat.
- Procedural audio starts only after a user interaction because of browser autoplay policies.
