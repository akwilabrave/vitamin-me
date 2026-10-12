# Vitamin Me

Personal fitness app (installable web app) for iPhone.

**Data flow:** Huawei Watch Fit 4 → Huawei Health → Strava → Strava API → Vitamin Me

- Static site hosted on GitHub Pages, no backend.
- All user data (Strava credentials, tokens, workouts, shop) is stored only on the user's own phone, never in this repo or on any server.
- Backups are files the user saves themselves (share sheet → Files / iCloud Drive).
- Workout summaries in localStorage; per-workout detail and streams cached in IndexedDB.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page shell and styles (themes) |
| `app.js` | Strava OAuth + sync, views, maps (Leaflet + OpenStreetMap), HR chart, splits, settings, backup |
| `scoring.js` | Pure points engine (effort blocks, distance, consistency, streaks) |
| `records.js` | Personal records and vitamin collection (pure functions; vitamins never affect points) |
| `jar.js` | Vitamin jar and collection celebration |
| `territory.js` | World tile grid (zoom-17 tiles): claimed tiles, biggest square, areas (pure functions) |
| `ghost.js` | Same-route detection (tile overlap) and time-at-distance comparison (pure functions) |
| `race.js` | Ghost race page: verdict, gap chart, splits, animated replay |
| `shop.js` | Reward shop |
| `sw.js` | Offline app-shell cache. Bump `VERSION` on every deploy. |
| `manifest.json`, `icon-*.png` | Home-screen install metadata |
