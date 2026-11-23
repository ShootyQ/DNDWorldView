# Hearth — shared fantasy world builder

A small local-first 3D town editor for a DM and a table of phone viewers. Includes a low-poly river town, terrain sculpting and painting, object tools, randomized townsfolk, portrait markers, synchronized locations, undo/redo, scene patches and world backups.

## Run

Use Node 22.12+ (Node 24 recommended).

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

Open the private **DM link printed in the terminal**. It grants editing access; do not share it. Use **Invite players** for a player-only LAN address and QR code. Phones must be on the laptop's Wi-Fi. Allow inbound TCP 3000 on the laptop firewall; disable Wi-Fi client isolation if clients cannot connect. Set `PORT` to change the port. In cloud development, the printed LAN address may belong to the cloud machine, not your home network; run locally for a table session.

```sh
npm test
npm run build
npm start
```

The production server serves `dist`; the development server uses Vite middleware. Both listen on `0.0.0.0`. Keep the server running during sessions. Future tasks should use this existing checkout; do not create a worktree by default.

## Build a world

- Choose an asset, then click ground to place it. Grab and drag any object to move it freely without snapping. The camera stays fixed, and releasing saves one undoable move. Press Escape to cancel. Select an object to enter exact X/Z coordinates, rename, rotate, recolor, duplicate or delete. Drag empty ground to orbit. The Move button also supports click-to-place movement. Click **A little more life** to place five randomized people.
- In Terrain, choose raise/lower/smooth/flatten or a ground material, adjust radius, and drag to apply a soft brush stroke. Each stroke is one undoable edit. Switch to Select to orbit; wheel/pinch zooms. Flatten slopes before placing buildings. Lower terrain below -1.3 m to reveal water.
- Orbit, pan, and zoom to frame a location, then save the current camera view in Locations. **Show** brings all viewers there; they retain independent camera control until the next location change.
- Place Player portrait markers, then upload character images through their inspector. Uploads are cropped and converted to 256px PNG. Only the DM moves markers.
- Export/import world JSON with the toolbar arrows. Exports bundle portraits. Import replaces the world as one undoable edit. For AI assistance see [the patch contract](docs/PATCHES.md).

## Persistence and recovery

`data/world.json` is atomically replaced after every committed edit; `data/world.backup.json` retains the prior save. Portraits and the private DM token also live under `data/`. Back up that whole folder, or use world export. Saves survive restarts; live connections and the 30-entry in-memory undo history do not. Invalid saved worlds stop startup without overwriting the original: stop the server, preserve the corrupt file, and restore the backup. Rotate the DM token by stopping the server and removing `data/dm-token`, then restart. Portrait files remain after deletion/undo so older edits can recover them.

## Boundaries

One DM, up to a handful of viewers, a 256m square world, static NPCs, fixed water level and simple procedural models. No combat, pathfinding, interiors or player movement. LAN HTTP is for trusted home networks; do not expose this server directly to the Internet. Portrait images are visible to joined players. Object edits are revision checked; stale changes are rejected. Server autosave acknowledgement is displayed in the footer.

## Browser smoke test

After building, run `npx playwright install chromium` once and then `npm run test:browser`. To use an existing Chromium instead, set `CHROMIUM_PATH` to its executable (in this cloud machine: `/usr/bin/chromium`). The test starts an isolated production server, checks desktop/mobile rendering, editing, location sync and patch preview/apply/undo, and writes screenshots under ignored `artifacts/`. These checks use desktop browser emulation; physical-phone performance still needs a check on your devices. Rendering is on demand, with instanced trees and a capped pixel ratio to reduce mobile work.

## GitHub Pages

The `Deploy Hearth to GitHub Pages` workflow builds a standalone editor on pushes to `main`. In GitHub repository **Settings → Pages**, set **Source** to **GitHub Actions**. Its site lives under `/DNDWorldView/`.

The Pages editor saves worlds and portraits in this browser on this device. Export backups with the toolbar download button. A shared site link opens each person's own world; send a world export to share a snapshot. Live synchronized phone sessions remain supported by the Node server and can be hosted separately later.

To test the Pages build locally:

```sh
STANDALONE=1 BASE_PATH=/DNDWorldView/ npm run build
BASE_PATH=/DNDWorldView/ npx vite preview
```

Normal `npm run build` and `npm run dev` retain server-backed sessions. Never publish the `data/` folder or a DM token; the Pages artifact contains only `dist/`.

For the direct-placement browser regression test, build the Pages version, run Vite preview as above, then run `CHROMIUM_PATH=/usr/bin/chromium node --import tsx tests/drag.mjs` (or omit CHROMIUM_PATH when Playwright Chromium is installed).
