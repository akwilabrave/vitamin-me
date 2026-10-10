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
| `index.html` | The whole app: UI, Strava OAuth + sync, maps (Leaflet + OpenStreetMap), HR chart, splits |
| `scoring.js` | Pure points engine (effort blocks, distance, consistency, streaks) |
| `shop.js` | Reward shop |
| `sw.js` | Offline app-shell cache. Bump `VERSION` on every deploy. |
| `manifest.json`, `icon-*.png` | Home-screen install metadata |
