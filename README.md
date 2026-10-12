# Vitamin Me

A personal fitness app for iPhone that turns your workouts into points, records, a vitamin collection, a territory map and a ghost to race. It reads your training from Strava, runs entirely on your phone, and costs nothing to host.

> Built for a Huawei Watch Fit 4 → Huawei Health → Strava setup, but it works with any device that syncs to Strava.

---

## Contents

1. [What it is](#what-it-is)
2. [How it works, in one picture](#how-it-works-in-one-picture)
3. [A tour of the app](#a-tour-of-the-app)
4. [Points: how scoring works](#points-how-scoring-works)
5. [Records](#records)
6. [Vitamins: the achievement collection](#vitamins-the-achievement-collection)
7. [Territory](#territory)
8. [Ghost runner](#ghost-runner)
9. [Reward shop](#reward-shop)
10. [Your data, privacy and backups](#your-data-privacy-and-backups)
11. [Syncing with Strava](#syncing-with-strava)
12. [Architecture](#architecture)
13. [File reference](#file-reference)
14. [Setup](#setup)
15. [Development](#development)
16. [Known limitations](#known-limitations)
17. [Open questions and ideas](#open-questions-and-ideas)

---

## What it is

Vitamin Me is a **progressive web app**: a website that installs to the iPhone home screen and behaves like a native app (full screen, offline, its own icon). There is no server and no account system. The app is a set of static files hosted on GitHub Pages; everything personal lives in the phone's own storage.

It answers one question after every workout: *what did that session earn me?* The answers come in a few deliberately different forms:

| Layer | What it rewards | Spendable? |
|---|---|---|
| **Points** | Effort, distance, consistency, records, exploration | Yes, in the reward shop |
| **Records** | Getting faster or going further | Earn bonus points |
| **Vitamins** | Milestones and habits, collected like achievements | No, they're a collection |
| **Territory** | Running somewhere new | Earn points per new tile |
| **Ghost runner** | Beating your past self on the same route | No, it's a race |

Everything is **derived from your workout history**. Nothing is stored as "you have 948 points"; the app recalculates it from your workouts every time. That's why you can change any scoring rule and your whole history is re-scored consistently.

---

## How it works, in one picture

```mermaid
flowchart LR
    W[Huawei Watch Fit 4] --> H[Huawei Health app]
    H -->|built-in Strava sync| S[(Strava)]
    S -->|Strava API, read-only| A[Vitamin Me<br/>on your iPhone]
    A --> LS[(Phone storage<br/>localStorage + IndexedDB)]
    A -->|map tiles| OSM[OpenStreetMap]
    GH[GitHub Pages] -->|app files only| A
```

1. You record a workout on the watch. Huawei Health syncs it to Strava automatically.
2. When you open Vitamin Me (or tap **Sync**), it asks Strava for anything new.
3. The app fetches the details it needs (heart rate, best efforts, GPS route), stores them on the phone, and runs its engines: scoring, records, vitamins, territory and ghost matching.
4. Everything you see is computed on the phone, from that local data.

GitHub Pages only serves the app's code. Your workouts, tokens and shop never go there.

---

## A tour of the app

The bottom bar has five buttons:

| Icon | Tab | What's there |
|---|---|---|
| Pulse line | **Workouts** | Your point balance, the vitamin jar, weekly and monthly running, a savings goal, and the filterable workout list |
| Capsule | **Progress** | The vitamin jar and collection, the territory card, and your records |
| Bag | **Shop** | Rewards you've set up, your spendable balance, and redemption history |
| Arrows | **Sync** | Fetches new workouts from Strava (asks first) |
| Sliders | **Settings** | Appearance, Strava, goals, scoring rules, backup and data |

### Workouts (home)
- **Points balance:** what you can spend. Below it: this week's points, progress toward the 3-workout streak, and the current streak boost.
- **Vitamin jar** (top right): one capsule for every vitamin you've collected. Tap it to open Progress.
- **Running this week / this month:** with a bar toward your weekly km goal.
- **Workout list:** with filters:
  - **Type chips:** All, Runs, Walks, Rides, Strength, Other. Only the types you have are shown.
  - **Period:** All time, This week, This month, 30 days, This year.
  - **Show:** Everything, Records, Ghost wins, New tiles, With route.
  - **Sort:** Newest, Oldest, Distance, Duration, Points, Pace, Heart rate.
  - **Summary:** a line totals the filtered set. Choices are remembered.

### A workout
Tap any workout to see:
- **Map:** the route, with any territory tiles that run claimed.
- **Stats:** distance, moving time, pace or speed, calories, average and max heart rate, elevation.
- **Points breakdown:** every line that earned points (effort blocks, distance, streak boost, consistency, records, exploration).
- **Ghost runner card:** if you've run this route before.
- **Heart-rate chart:** with your effort zone shaded, so you can see where points were earned.
- **Kilometre splits:** for runs and walks.

### Progress
The vitamin jar, the full collection, the territory summary and your records.

---

## Points: how scoring works

Points are built from five ingredients. Each is designed to reward a *different* behaviour, so the same effort isn't paid twice.

| Ingredient | Rewards | Default |
|---|---|---|
| Effort | Sustained time with your heart rate in the effort zone | 10 pts per 10 continuous minutes, +25 per 30 |
| Distance | Volume | 4 pts/km running, 2 walking, 1 cycling |
| Consistency | Showing up regularly | +15 for the week's 3rd workout, +25 for the 4th, streak boost |
| Records | Getting faster or going further | +50 per beaten record, +30 per new longest run |
| Exploration | Running somewhere new | +2 per new territory tile |

Calories are shown but never scored: they're the least accurate number a watch produces.

### 1. Heart-rate zones

Zones use **heart-rate reserve** (the Karvonen method), which adapts to your fitness through your resting heart rate:

$$HR_{\max} = 208 - 0.7 \cdot \text{age} \qquad \text{(Tanaka)}$$

$$T_p = HR_{\text{rest}} + p \cdot \left(HR_{\max} - HR_{\text{rest}}\right)$$

With the defaults (age 22, resting 60 bpm, effort zone at $p = 40\%$, vigorous at $p = 60\%$):

$$HR_{\max} = 192.6 \text{ bpm}, \qquad T_{\text{effort}} \approx 113 \text{ bpm}, \qquad T_{\text{vigorous}} \approx 140 \text{ bpm}$$

You can enter a measured max heart rate instead of the estimate.

### 2. Effort blocks

The app walks through the second-by-second heart rate of each workout and finds **continuous blocks** of time above the effort threshold:

- A dip below the zone of up to **60 seconds** (a traffic light, a water stop) doesn't break the block. The dip itself earns nothing.
- Seconds in the **vigorous** zone count **1.5×**, so harder effort fills blocks faster.

For a block with effective minutes $t$:

$$P_{\text{effort}} = 10 \cdot \left\lfloor \frac{t}{10} \right\rfloor + 25 \cdot \left\lfloor \frac{t}{30} \right\rfloor$$

A **daily cap of 90 effective minutes** stops the system from rewarding overtraining.

### 3. Distance

$$P_{\text{distance}} = \text{rate} \times \text{km}$$

with the rate set by activity type (running 4, walking and hiking 2, cycling 1, anything else 2).

### 4. Consistency

- A workout counts toward consistency if it's at least **15 minutes** long.
- The week's **3rd** workout earns **+15** and the **4th** earns **+25**. After that the bonuses stop on purpose.
- **Streak boost:** every *consecutive previous* week with 3+ workouts adds **+5%** to this week's effort and distance points, up to **+25%**:

$$m = 1 + \frac{\min(25,\ 5 \cdot n_{\text{streak}})}{100}$$

- **Rest bonus:** a completed day with no workout after **3 consecutive active days** earns **+10**. Rest is part of training.

### 5. Putting it together

For one workout:

$$P = \text{round}\!\left(\left(P_{\text{effort}} + P_{\text{distance}}\right) \cdot m\right) + P_{\text{consistency}} + P_{\text{records}} + P_{\text{exploration}}$$

**Worked example:** a 30-minute 5 km run with 28 continuous minutes in the zone, 12 of them vigorous, with no streak and no records:

$$t = 16 + 1.5 \cdot 12 = 34 \text{ min} \;\Rightarrow\; P_{\text{effort}} = 10 \cdot 3 + 25 \cdot 1 = 55$$

$$P_{\text{distance}} = 4 \cdot 5 = 20 \qquad\Rightarrow\qquad P = 75$$

### Everything is adjustable

**Settings → Scoring** has a page per group (heart-rate zones, effort, distance, consistency, records, exploration). Changed values are outlined, each section can be reset, and **any change re-scores your entire history immediately**.

---

## Records

Records come from Strava's **best efforts**: the fastest 1 km, 5 km, 10 km and half marathon *inside* any run. A fast 5 km in the middle of a 10 km run counts.

| Record | Bonus when beaten |
|---|---|
| 1 km, 5 km, 10 km, half marathon | +50 |
| Longest run | +30 |
| Most running in a week | shown only |
| Longest streak | shown only |

The **first** time you run a distance, it sets the record without a bonus. Only *beating* a record pays, so points can't be earned just by covering a distance once.

---

## Vitamins: the achievement collection

Vitamins are **achievements, not currency**. They never add points. Each type has its own colour; every capsule pairs that colour with your accent colour.

Most can be collected **many times**, and the jar fills up as you do. Three are one-off milestones.

| Vitamin | Collected | Repeats |
|---|---|---|
| **A** | Every new personal record | ✓ |
| **B1** | Every 10 workouts | ✓ |
| **B3** | Every 100 new territory tiles | ✓ |
| **B5** | Every time you beat last time's pace on a repeated route | ✓ |
| **B6** | 50 workouts | once |
| **B12** | 100 workouts | once |
| **C** | Every 4 weeks of streak (3+ workouts a week) | ✓ |
| **D** | Every run of 10 km or more | ✓ |
| **D3** | Every half marathon (21.1 km) | ✓ |
| **E** | Every 60-minute effort block | ✓ |
| **K** | Every 100 km of running | ✓ |
| **K2** | 500 km of running in total | once |
| **Iron** | Every workout with 30+ vigorous minutes | ✓ |
| **Zinc** | Every week with 150+ minutes in your effort zone | ✓ |
| **Magnesium** | Every 10 workouts started before 07:00 | ✓ |
| **Calcium** | Every 1,000 m climbed | ✓ |
| **Omega-3** | Every 5 rest-day bonuses | ✓ |

### The jar and the celebration
- **The jar:** holds one capsule per collection, in the order you earned them, oldest at the bottom. It shows the newest 60 once full; the count keeps going.
- **The celebration:** when a sync brings in new vitamins, a card pops up, the lid lifts, the new capsules drop in, and you get a **Congratulations!** with a dismiss button ("Keep pushing", "Great! I can do more", …).
- **Replay:** **Replay the drop** on the Progress page re-runs the animation as a demo.
- **Reduce Motion:** if it's on in iOS, the card appears without animation.

---

## Territory

The whole world is divided into a fixed grid of tiles (the standard web-map grid at zoom level 17). A tile is about

$$\frac{40\,075\,017 \text{ m} \cdot \cos(\text{latitude})}{2^{17}} \approx 305.7 \text{ m} \cdot \cos(\text{latitude})$$

across, which is about **275 m in Pretoria**. The grid works anywhere on Earth, with no map lookups.

- **Claiming:** any route that passes through a tile you've never visited **claims** it, worth **+2 points**. Running your usual loop again earns nothing new, which is the point: it pushes you to explore.
- **Tracing:** routes are traced at quarter-tile resolution. Gaps longer than 2 km (GPS dropouts) aren't filled in.
- **Stats:**
  - **Tiles claimed** and **new this week**.
  - **Largest area:** your biggest connected patch of tiles.
  - **Biggest square:** the largest solid *k × k* block with no gaps. Filling in holes grows it.
- **Map views:** Home area (your largest patch), Everywhere, and Biggest square. Zoomed out, each separate area shows as a marker with its tile count.

---

## Ghost runner

Run the same route twice and your past self becomes a ghost to race.

**How routes are matched.** Two runs are the same route when their territory tiles overlap strongly and their distances are close:

$$J(A, B) = \frac{|A \cap B|}{|A \cup B|} \geq 0.6 \qquad\text{and}\qquad |d_A - d_B| \leq 15\%$$

Direction doesn't matter: a loop run the other way still matches. No naming or setup is needed.

**On a workout.** A **Ghost runner** card compares your pace with the last time you ran the route, and tells you how many times you've run it.

**The ghost race page:**
- **Opponent:** race **Last time** or **Your best here**.
- **Verdict:** e.g. "You beat your ghost by 1:05", with a short race story (biggest lead, comebacks, where it was decided).
- **Replay:** you and the ghost move along today's route on the map at 90× speed, with a live clock and the gap in metres.
- **Gap chart:** your lead or deficit over the whole distance.
- **Kilometre table:** your split vs the ghost's, and the running gap.

The comparison uses **elapsed** time, so stops count, as they would in a real race.

---

## Reward shop

Your **spendable balance** is:

$$\text{balance} = \text{points earned} - \text{points spent}$$

**The rule that makes it work:** only list things you'd buy anyway, and don't buy them until you've earned the points. That turns points into a gate on real purchases.

- **Suggested rewards** feed back into running, in three groups:
  - **Fuel and recovery:** post-run smoothie, breakfast after a long run, protein, foam roller, sports massage.
  - **Kit upgrades:** socks, cap, flasks, shorts or top, running shoes, massage gun.
  - **Races and routes:** a trail run somewhere new, 10 km and half-marathon entries, a race in another city.
- **Costs in weeks of training:** suggested costs are expressed in weeks, converted using your average weekly points over the last 4 completed weeks (300 a week until there's enough history). Every cost is editable.
- **Reward options:** each reward can be one-off or repeatable, and one can be your **savings goal**, shown on the home screen with progress and time to go.
- **Redeeming:** asks for confirmation, and every redemption can be **undone** from the history.

The shop is a first version; how points translate into rewards is still open (see [Open questions](#open-questions-and-ideas)).

---

## Your data, privacy and backups

**Everything stays on your phone.** There's no server, no analytics and no account.

| Data | Where | Leaves the phone? |
|---|---|---|
| Strava Client ID and Secret, access tokens | localStorage | Only to Strava, to sign in |
| Workouts, heart rate, routes | localStorage + IndexedDB | Never |
| Shop, redemptions, settings | localStorage | Only in backup files you save yourself |
| Map tiles | Fetched from OpenStreetMap | Only the map area being viewed |

- **Persistent storage:** the app asks iOS to protect its storage from automatic clearing (see **Settings → Backup and data**). Deleting the app from the home screen deletes its data.
- **Backups:** **Save backup** opens the share sheet, so you can save the file to iCloud Drive or Files. It holds the shop, redemptions, scoring settings and appearance, but **not** the Strava secret. Workouts aren't included, because they re-sync from Strava. **Restore from backup file** brings everything back.
- **Backup reminder:** a card appears on the home screen when the shop has changed and the last backup is more than 7 days old.
- **Sharing with friends:** each person installs from the same URL and connects their own Strava. Their data lives only on their phone; nothing is shared or stored centrally.

---

## Syncing with Strava

- **First sync:** pulls the last **12 months**. Later syncs ask only for workouts since the newest one you have (with a one-hour overlap).
- **When it syncs:** automatically when you open the app (at most every 10 minutes), and when you tap **Sync** (after a confirmation).
- **Extra requests per workout:** some features need more than the summary:
  - **Heart-rate stream:** for effort scoring.
  - **Workout detail:** for calories, splits, best efforts and the full GPS route.
  - **Distance + position stream:** for ghost races, fetched only when you open one.
- **Request budget:** Strava limits how many requests an app can make (around 100 reads per 15 minutes). Each sync spends at most **40** detail and stream requests, newest workouts first. Older workouts fill in over the next few syncs and show "scoring…" until then. Everything fetched is cached, so each workout is downloaded once.
- **Tokens:** they refresh automatically. You sign in to Strava once.

---

## Architecture

### Design principles

1. **Static and serverless.** Plain HTML, CSS and JavaScript, no build step and no framework. It is hosted free on GitHub Pages.
2. **Pure engines, thin UI.** Scoring, records, territory and ghost matching are pure functions in their own files: data in, results out, no DOM and no storage. They can be tested in Node and reasoned about in isolation.
3. **Derived, not stored.** Points, records, vitamins, territory and ghost matches are all recomputed from workout history. Only raw inputs (workouts, streams, your settings, your shop) are stored, so changing a rule can never leave stale numbers behind.
4. **Cache the expensive parts.** Downloaded streams are cached in IndexedDB. Effort blocks (which depend only on heart rate and zone settings) are cached with a signature of those settings, and recomputed automatically when the settings change. Territory tiles are cached per workout.
5. **App-shell layout.** Only the content area scrolls; the bottom bar sits outside it. That keeps the bar pinned on iOS, where rubber-band scrolling otherwise moves fixed elements.

### How a screen gets its numbers

```mermaid
flowchart TD
    acts[Workouts<br/>vm.acts] --> L[Scoring.ledger<br/>effort, distance, consistency, streaks]
    fx[Effort cache<br/>vm.fx] --> L
    tiles[Tiles cache<br/>vm.tiles] --> T[Territory.compute<br/>claimed tiles, squares, areas]
    acts --> T
    T -->|exploration points| L2[Ledger + exploration]
    L --> L2
    tiles --> G[Ghost.index<br/>same-route matches]
    acts --> G
    L2 --> R[Records.compute<br/>records, vitamins, jar log]
    G --> R
    T --> R
    R -->|record points| LF[Final ledger]
    L2 --> LF
    LF --> UI[Views: Workouts, Progress, Shop, ...]
    shop[Shop<br/>vm.shop] --> UI
```

`getLedger()` in `app.js` runs this pipeline once and caches the result until data or settings change.

### Script load order

The page loads plain scripts in dependency order. The pure engines attach themselves to `globalThis`; the UI files use them at call time.

```
leaflet.min.js        maps (CDN)
scoring.js            → Scoring
territory.js          → Territory   (uses Scoring)
ghost.js              → Ghost
records.js            → Records     (uses Scoring)
jar.js                jar + celebration UI
race.js               ghost race UI
shop.js               shop UI
app.js                storage, Strava, sync, views, router, settings
```

### Navigation

The app is a single page with hash routes:

| Route | Screen |
|---|---|
| `#/` | Workouts (home) |
| `#/a/<id>` | Workout detail |
| `#/ghost/<id>?vs=prev\|best` | Ghost race |
| `#/progress` | Progress |
| `#/territory` | Territory map |
| `#/shop`, `#/shop/suggest`, `#/shop/edit/<id\|new>` | Shop, suggestions, edit reward |
| `#/settings` | Settings menu |
| `#/settings/appearance`, `/strava`, `/goals`, `/scoring`, `/scoring/<group>`, `/data` | Settings pages |

### Storage

**localStorage** (small, synchronous):

| Key | Contents |
|---|---|
| `vm.cfg` | Settings: theme, accent, weekly goal, scoring parameters, Strava Client ID/Secret |
| `vm.tok` | Strava access and refresh tokens, athlete name |
| `vm.acts` | Workout summaries (one compact record per workout) |
| `vm.meta` | Sync markers, last backup time, vitamins already celebrated |
| `vm.fx` | Effort-block cache, with the settings signature it was computed for |
| `vm.tiles` | Territory tiles per workout, and whether they came from the full or simplified route |
| `vm.shop` | Rewards, redemptions, savings goal |
| `vm.list` | Workout-list filters (per-phone convenience) |

**IndexedDB** (database `vitamin-me`, store `kv`), for larger data:

| Key | Contents |
|---|---|
| `d<id>` | Workout detail: calories, splits, best efforts, full route, device |
| `h<id>` | Heart-rate stream (time, bpm) |
| `r<id>` | Race stream (time, distance, position), for ghost races |

---

## File reference

```
vitamin-me/
├── index.html        Page shell, all styles and themes, dock, script tags
├── app.js            The application: storage, Strava auth and sync, views, router, settings
├── scoring.js        Points engine (pure)
├── records.js        Records and vitamins engine (pure)
├── territory.js      Territory grid engine (pure)
├── ghost.js          Same-route matching and race comparison (pure)
├── jar.js            Vitamin jar drawing and the collection celebration
├── race.js           Ghost race page and replay
├── shop.js           Reward shop
├── sw.js             Service worker: offline app shell
├── manifest.json     Home-screen install metadata
├── icon-180.png      Apple touch icon
├── icon-192.png      App icon
├── icon-512.png      App icon (large)
└── README.md         This file
```

| File | Role | Details |
|---|---|---|
| `index.html` | Shell and styles | Theme tokens for light and dark, accent colour variables, every component's CSS, the bottom bar, and a tiny pre-paint script that applies your saved theme before anything renders (no flash). |
| `app.js` | Application core | localStorage and IndexedDB wrappers; theme handling; Strava OAuth (including the Safari-code fallback); incremental sync with a request budget; detail, heart-rate and race stream fetching and caching; the effort and tile caches; `getLedger()` pipeline; all main views (home, workout detail, progress, territory, settings); workout filters; maps; HR chart; backup and restore; router. |
| `scoring.js` | Pure engine | `PARAMS` (every tunable number, which also generates the Scoring settings pages), heart-rate zones, effort-block detection from HR streams, and `ledger()`: per-workout breakdowns, weekly totals, streak multiplier, daily cap and rest bonus. |
| `records.js` | Pure engine | Record tracking from best efforts and distances, PR bonus events, the vitamin definitions (colour, rule, repeatability), collection counts, progress to the next one, and the chronological log that fills the jar. |
| `territory.js` | Pure engine | Zoom-17 tile maths, route-to-tiles tracing, first-visit claiming, exploration points, biggest-square search and connected areas. |
| `ghost.js` | Pure engine | Same-route index (tile Jaccard similarity and distance tolerance), interpolation of time at distance and distance at time, and the race comparison (gap curve, km splits, biggest lead or deficit). |
| `jar.js` | UI | Deterministic capsule layout, jar SVG, the home-screen jar button, tracking which collections have been celebrated, and the celebration card with drop animation and replay. |
| `race.js` | UI | Ghost runner card on workouts, the race page, verdict and race story, gap chart, splits table, and the animated replay on the map. |
| `shop.js` | UI | Balance, rewards list, suggestions priced in weeks of training, reward editor, savings-goal card, redemption and undo. |
| `sw.js` | Offline | Caches the app files so the app opens without a connection. Network-first, so updates arrive immediately when online. **Bump `VERSION` whenever files change.** |
| `manifest.json` | Install | Name, colours, icons, standalone display. |

---

## Setup

### 1. Host the app (once)
1. Put these files in a public GitHub repository.
2. **Settings → Pages → Deploy from a branch → `main` / root.**
3. The app is live at `https://<username>.github.io/<repo>/`.

### 2. Install on iPhone
Open the URL in **Safari**, tap **Share → Add to Home Screen**, and from then on always open it from the home screen.

### 3. Connect Strava (once per person)
Strava limits a new API app to its owner's account, so each person creates their own (free, about 5 minutes):

1. At [strava.com/settings/api](https://www.strava.com/settings/api), create an application. Set **Authorization Callback Domain** to `<username>.github.io`, with no `https://` and no path.
2. In Vitamin Me, go to **Settings → Strava**, paste the **Client ID** and **Client Secret**, and tap **Save and connect Strava**.
3. Approve access on Strava's page, keeping **View data about your activities** ticked.

If iOS returns you to Safari instead of the app, the page shows a code. Copy it, open the app from the home screen, and paste it under **Settings → Strava → Use code**.

### 4. Make the data flow
In **Huawei Health → Me → Data sharing and authorization → Strava**, link your Strava account. New workouts then appear in Strava, and from there in Vitamin Me. Huawei's sync isn't retroactive, so only workouts recorded after linking arrive.

---

## Development

**Run locally.** Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Strava sign-in needs the callback domain to match, so full sign-in only works on the deployed domain. Everything else can be tested locally with data in storage.

**Test the engines in Node.** The pure modules export themselves when `require`d:

```js
const Scoring = require('./scoring.js'); global.Scoring = Scoring;
const Territory = require('./territory.js');
const Ghost = require('./ghost.js');
const Records = require('./records.js');

const L = Scoring.ledger(activities, effortCache, {});   // points
L.terr = Territory.compute(activities, tiles, {});        // territory
Territory.mergeIntoLedger(L, L.terr);
L.ghost = Ghost.index(activities, tiles);                 // same-route matches
const R = Records.compute(activities, L, {});             // records + vitamins
```

**Deploy.** Push to `main`; GitHub Pages redeploys in about a minute.
1. Bump `VERSION` in `sw.js` with every change, or phones may keep serving the cached version.
2. On the phone, fully close and reopen the app to pick up the new version.

**Adding a scoring parameter.** Add a row to `PARAMS` in `scoring.js` (`[key, default, label, unit, group, step]`). It appears in Settings automatically and is available as `p.key` in the engines.

**Adding a vitamin.** Add an entry to `VITAMINS` in `records.js` with a colour, an `n(state)` function returning how many times it's been collected, a `next(state)` progress function, and `once: true` for one-off milestones. Track any new state in `compute()`.

---

## Known limitations

- **Strava is the source of truth.** If a workout doesn't reach Strava (or arrives without heart rate or GPS), Vitamin Me can't score that part of it.
- **Heart-rate-based effort depends on the watch.** Wrist sensors can lag or spike; the 60-second dip tolerance and the vigorous threshold absorb most of it, and every threshold is adjustable.
- **Max heart rate is estimated from age** unless you enter a measured value.
- **Territory tiles start coarse.** Until a workout's full GPS route has been downloaded, its tiles come from Strava's simplified route.
- **Ghost races use elapsed time**, so long stops count against you, unlike Strava's moving time.
- **One device.** Data lives on one phone; moving to a new phone means restoring a backup file and re-syncing Strava.

---

## Open questions and ideas

- **What points mean.** Points currently gate shop rewards. Two possible directions:
  - **A training budget:** points unlock money you've set aside.
  - **XP and levels:** pure progression, nothing to spend.
- **Shop revamp.** Make redeeming feel earned rather than transactional, possibly tied to goals and seasons.
- **Monthly challenges.** One self-set target per month with a large bonus.
- **Strength and other sports.** Scoring is run-centric; strength sessions currently earn only through heart rate.
