# Modern Wars

A browser-based grand strategy war simulation played on a real-world map. Start from the current modern-day world map or load a custom scenario, assign countries to opposing sides, and watch organic frontlines form as AI armies capture territory, react to threats, and execute war plans.

## Status

**Active development.** This is a dev build, so expect bugs, balance issues, rough UI, and incomplete systems.

## Running

Open https://vaspyyy.github.io/moder-wars/ in a browser.

For local development, serve the repository as static files:

```sh
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/.

## Current Era

The current **Choose Era** menu exposes one playable era:

- **2022 Modern Day** - current borders and geopolitics from `assets/maps/world map 2022.json`

## What You Can Do

- **PLAY** opens the 2022 Modern Day era and starts conquest setup.
- **EDITOR** redraws borders, creates countries, manages cities, and saves or loads scenarios.
- **COMMUNITY** browses, uploads, remixes, and downloads shared scenarios or countries.
- **SETTINGS** changes simulation speed, map display, audio, language, and related options.
- **God Mode** and editor tools can stage custom wars, alter borders, and test scenarios.

## Custom Scenarios

Modern Wars can load custom scenario files and community scenarios. This is separate from the built-in era picker: the main era menu currently exposes only 2022 Modern Day, but the editor and community tools can still create, import, remix, and share other setups.

## Controls

- Click-and-drag to pan, scroll to zoom
- Click a country to inspect it and assign it during setup

## Known State

Older era data, thumbnails, hidden cards, dormant click handlers, and import presets may still exist in the codebase. They are not currently exposed as supported main-menu eras unless they are visible in the **Choose Era** screen.

## Development Notes

- There is no build step and no root npm install requirement for the main app.
- Serve the repo as static files during local development.
- The service worker caches aggressively. After source changes, hard-refresh the browser or bump `CACHE_VERSION`.
- Game version appears in both `index.html` and `workers/service-worker.js`; keep them in sync.

## Tech

Vanilla JavaScript, Leaflet map, Canvas overlay, IndexedDB GeoJSON cache, and Web Workers for frontline and GeoJSON processing.
