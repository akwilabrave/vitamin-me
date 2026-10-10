# Vitamin Me

Personal fitness app (installable web app) for iPhone.

**Data flow:** Huawei Watch Fit 4 → Huawei Health → Strava → Strava API → Vitamin Me

- Static site hosted on GitHub Pages, no backend.
- Strava credentials and tokens are stored only on the phone (localStorage), never in this repo.
- Workout summaries in localStorage; per-workout detail and streams cached in IndexedDB.

## Files
| File | Purpose |
|---|---|
| `index.html` | The whole app: UI, Strava OAuth + sync, maps (Leaflet + OpenStreetMap), HR chart, splits |
| `sw.js` | Offline app-shell cache. Bump `VERSION` on every deploy. |
| `manifest.json`, `icon-*.png` | Home-screen install metadata |
