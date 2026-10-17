# Doppel token Worker

A tiny Cloudflare Worker that holds Doppel's Strava **client secret**, so nobody has to paste API credentials into the app. It only does the OAuth exchanges; the phone still talks to Strava directly for every workout (Strava API Policy 5.16 forbids proxying API data, so keep it that way).

| Route | What it does |
|---|---|
| `GET /start?state=K.C` | Sends the athlete to Strava's consent screen (`read,activity:read`) |
| `GET /callback` | Strava redirects here. Swaps the code for tokens and parks them in KV for 2 minutes under `K` |
| `POST /claim {k, v}` | The app collects the parked tokens. `sha256(v)` must equal `C`, so only the phone that started the sign-in can claim them. The parked copy is deleted at once |
| `POST /refresh {refresh_token}` | New access token. Answers `401` when the athlete removed access, and the app then wipes its Strava data |
| `POST /revoke {token}` | Disconnect: revokes Doppel's access on Strava |
| `GET/POST /webhook` | Strava webhook subscription check and event acknowledgement |

Nothing else is stored: no names, emails or workouts. Free plan: 100,000 requests a day.

## Setup (about 15 minutes, all free)

Everything below can be done in the Cloudflare dashboard in a browser. No command line needed.

1. **Cloudflare account.** Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free plan).
2. **KV namespace.** *Storage & Databases → KV → Create*. Name it `doppel-handoff`.
3. **Worker.** *Compute → Workers & Pages → Create → Worker*, name it `doppel-auth`, deploy the hello-world, then *Edit code*. Replace everything with the contents of [`src/index.js`](src/index.js) and click *Deploy*. Its address looks like `https://doppel-auth.<your-subdomain>.workers.dev`.
4. **Settings → Bindings → Add → KV namespace.** Variable name `HANDOFF`, namespace `doppel-handoff`.
5. **Settings → Variables and secrets.** Add:

   | Name | Type | Value |
   |---|---|---|
   | `CLIENT_ID` | Text | Your Strava Client ID |
   | `APP_URL` | Text | `https://akwilabrave.github.io/vitamin-me/app/` |
   | `CLIENT_SECRET` | **Secret** | Your Strava Client Secret |
   | `VERIFY_TOKEN` | **Secret** | Any random string, e.g. from a password generator |

   Deploy again after saving.
6. **Check it.** Open the Worker's address in a browser: it should say `Doppel auth: ok`.
7. **Strava.** At [strava.com/settings/api](https://www.strava.com/settings/api), set **Authorization Callback Domain** to the Worker's host only, e.g. `doppel-auth.<your-subdomain>.workers.dev` (no `https://`, no path).
8. **Doppel.** Put the Worker's address in [`app/config.js`](../app/config.js) as `authUrl` and push. From then on, Connect with Strava goes through the Worker.
9. **Webhook subscription** (Strava requires one so apps learn about deauthorizations). Run once, from any terminal, with your values filled in:

   ```sh
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=YOUR_CLIENT_ID -F client_secret=YOUR_CLIENT_SECRET \
     -F callback_url=https://doppel-auth.<your-subdomain>.workers.dev/webhook \
     -F verify_token=YOUR_VERIFY_TOKEN
   ```

   A reply with an `id` means it worked. Doppel keeps no server-side data, so the Worker only acknowledges events; each phone notices a revoked token on its next refresh and deletes its Strava data itself.

**Order matters:** step 7 switches Strava's callback away from the GitHub Pages address, so do steps 7 and 8 together. Until `authUrl` is set, the app keeps using the old flow (your own Client ID and Secret in Settings).

## With the command line instead

```sh
cd worker
npx wrangler login
npx wrangler kv namespace create HANDOFF      # paste the id into wrangler.toml
# set CLIENT_ID in wrangler.toml
npx wrangler secret put CLIENT_SECRET
npx wrangler secret put VERIFY_TOKEN
npx wrangler deploy
```

## If the secret ever leaks

Regenerate it at [strava.com/settings/api](https://www.strava.com/settings/api), update the `CLIENT_SECRET` secret, and tell Strava within 24 hours (API Agreement 1.2). Existing users should stay connected: refresh tokens belong to the app, not to the secret.
