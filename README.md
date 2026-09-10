# Leave by — smart commute display

A complete TomTom commute system: a responsive configuration dashboard, a secure
Cloudflare Worker API, durable settings/cache, deterministic departure predictions,
and CircuitPython firmware for a MatrixPortal S3 with **two 64×32 panels arranged
horizontally as one 128×32 display**. No machine learning or fabricated live data.

## Start locally

Use Node.js 24 LTS (22.13+ is supported by the existing build; the tests use Node's
experimental TypeScript transform and SQLite). Keep the existing npm lockfile.

1. `npm ci`
2. Copy `.env.example` to `.env`; retain your existing `TOMTOM_API_KEY`.
3. Set different random `ADMIN_TOKEN` and `DISPLAY_TOKEN` values. Generate each
   with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. `npm run build`
5. Apply the initial migration once:
   `npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_absurd_menace.sql`
6. `npm run dev`, then open the URL printed by the server (normally
   http://localhost:3000). Enter `ADMIN_TOKEN` in the connection form.
7. Set addresses, arrival date/time, allowances, active days/window, timezone,
   brightness, and rotation. Choose **Save & calculate**.

With no ADMIN_TOKEN, only loopback hosts allow unauthenticated development access.
Do not expose that development server directly to the internet. A MatrixPortal on
your LAN needs a LAN-reachable server and DISPLAY_TOKEN; localhost on the panel
refers to the panel itself. Prefer HTTPS; the firmware's explicit HTTP opt-in is
for trusted LAN development only.

The entered arrival is a **specific date and time**, in the browser's local zone.
The separately configured IANA timezone controls the active window and physical
display labels. Active weekdays control refresh frequency; they do not silently
roll the arrival deadline forward. Select the next date after a commute ends.
Equal active start/end means all day; overnight windows belong to the starting day.

## Architecture and decisions

- `app/`: reusable address picker, settings form, recommendation, forecast graph,
  and 4:1 LED preview. Original Leave by colors, address ranking, and keyboard
  autocomplete are retained. Access tokens stay in memory, never browser storage.
- `server/tomtom.ts`: server-only search/geocode/routing with bounded timeouts,
  strict result validation, fastest driving routes, traffic enabled, summary-only
  responses, and `computeTravelTimeFor=all`.
- `server/recommendation.ts`: independent deterministic calculation; parking and
  safety allowances are added to every candidate arrival. Latest feasible candidate
  wins even when the series is nonmonotonic. Between adjacent 10-minute samples,
  one-minute candidates use the **slower** endpoint estimate. Unsampled long gaps
  are never interpolated. This is conservative, not an exact minute-by-minute
  TomTom forecast or a guarantee of punctuality.
- `server/service.ts`: samples now through 90 minutes ahead. An arrive-by lookup
  excluding allowances anchors an extra nearby window for trips beyond that
  horizon. Current, historical, and live data all come from TomTom. No ML.
- `server/storage.ts`: a small D1 adapter. The same SQLite database runs locally
  through Wrangler and persists under ignored `.wrangler/state`. It is a durable
  local development fallback, not browser localStorage or an in-memory database.
  Missing database configuration fails clearly. Settings, coordinates, cache, retry
  cooldown, and cross-isolate refresh leases survive server restarts.
- `server/display.ts`: compact, explicit serialization (typically under 6 KB).
  Server epoch keeps the MCU clock in UTC; formatted labels provide local time
  without an IANA timezone library. Forecast timestamps and stale ages are retained.
- `matrixportal/`: the complete hardware application, renderer, bounded network
  reader, response validator, bundled pixel font, and setup instructions.

A meaningful later change of at least three minutes marks improving/worsening and
its approximate time; smaller movement is stable. A later spike is still reported
if the final estimate recovers. Forecast endpoints may choose different fastest
routes. A future record store/predictor can replace the provider's prediction
series without changing the recommendation algorithm or display contract.

## API and security

| Endpoint | Access | Behavior |
| --- | --- | --- |
| `GET /api/search?q=` | Admin | Debounced autocomplete, cached 24h |
| `POST /api/route` | Admin | `{}` refreshes saved commute; one-minute minimum |
| `GET /api/display` | Admin or display | Compact current/cached result and status |
| `GET /api/settings` | Admin | Saved settings or setup defaults |
| `PUT /api/settings` | Admin | Validate, persist, immediately recalculate |

Send `Authorization: Bearer <token>`. The display token cannot search, edit settings,
or call POST /api/route. Manual firmware refresh requests the newest server cache;
it does not bypass TomTom rate limits. Legacy POST bodies
`{start,end,arriveAt}` still return the original arrive-by route result, limited to
one calculation per minute. All writes require JSON and reject cross-origin browser
requests. Responses disable caching. Errors never include TomTom URLs, keys, or raw
upstream error bodies. Invalid stored/schema state fails closed with a generic error.

The TomTom key exists only in server environment secrets, never in JSON, client
JavaScript, firmware, or settings.toml. Both real `.env` and `settings.toml` are
ignored by Git. Do not configure a key with a public frontend variable prefix.

## Refresh schedule and approximate TomTom usage

Refreshes are demand-driven: the panel/browser polls the server; cached reads make
no TomTom call. Keep the panel powered or use an external authenticated poll if
estimates must remain warm with all clients closed. No background timer is assumed
inside an ephemeral Worker.

- Active window: current estimate every 5 minutes; full series every 15 minutes.
- Outside the window: current and series at most hourly while clients poll.
- Full near-term refresh: 1 current + 1 arrive-by + 9 future routes = **11 calls**.
- Each active hour: 4 × 11 plus 8 current-only = **about 52 routing calls**.
- A distant deadline adds up to 5 departure samples per full refresh, giving up to
  **72 calls/hour**. Outside active hours: roughly 11–16 calls/hour.
- Example: four active hours and twenty inactive hours with continuous polling:
  **about 428–608 routing calls/day**, before manual refreshes/settings edits.
  Passed arrival deadlines stop routing until a new date is saved.
- Two initial geocodes are cached for 30 days. Search queries are debounced 250ms,
  cached 24h, and globally limited to roughly one new request per 300ms. Selected
  coordinates are reused. The MCU never searches addresses.
- A database lease prevents overlapping jobs across Worker isolates; only one
  prediction request runs at a time, paced at least 1.2 seconds apart. Failed refreshes preserve
  old data and impose a one-minute provider cooldown; HTTP 429 pauses at least five minutes and settings saves cannot bypass it.

Actual billing depends on your TomTom plan; these are request counts, not prices.

## Installation on the physical display

See [matrixportal/README.md](matrixportal/README.md) for firmware files, fonts,
CircuitPython requirements, two-panel wiring, power, controls, and verification.
Default brightness is 30%. Firmware uses a dark background and never draws a full
white screen. The browser preview is illustrative; the actual pixel renderer has
its own tested 128×32 bounds and a fixed bundled font.

## Deployment

### Sites (this existing project)

The existing `.openai/hosting.json` project is preserved, with logical D1 binding
`DB`. Sites creates the production database and applies the generated migrations
from `drizzle/` before uploading the Worker. Keep migrations and their metadata in
source control. `npm run db:generate` generates future changes; never edit an applied
migration. Build, save the exact source/version, then deploy with Sites. Configure
TOMTOM_API_KEY, ADMIN_TOKEN, and DISPLAY_TOKEN as **secret** runtime values.

An owner-only Sites URL additionally has a platform sign-in gate. The browser signs
in normally and uses ADMIN_TOKEN. For hardware, copy the site's existing bypass
access token into `OAI_SITES_TOKEN` in the device's private settings.toml. The firmware
sends it as `OAI-Sites-Authorization: Bearer ...`, plus its separate DISPLAY_TOKEN.
That Sites token opens the platform gate; application permissions still restrict
the device to `/api/display`. Never give the display ADMIN_TOKEN. Keep the site
private; no public-access change is required. If a Sites token is unavailable,
request one through the site's access controls or use the standalone deployment.

### Standalone Cloudflare Worker

Keep the same source/build. Create a D1 database in your Cloudflare account, copy
`dist/server/wrangler.json` to a deployment configuration with the **real** database
ID and correctly resolved Worker/assets paths, and apply the generated migration to
that database. Store all three secrets with Wrangler secret management. Deploy the
built ESM Worker and assets over HTTPS. Do not deploy the placeholder database ID.
Use your deployed URL in COMMUTE_API_URL and leave OAI_SITES_TOKEN empty. Protect your
Cloudflare account; rotate the device token independently if a panel is lost.

## Checks

- `npm test`: recommendation, traffic classification, allowances, invalid provider
  data, serialization, database leases, caching/offline, and API authorization.
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `python -m unittest discover -s tests -p test_firmware.py`
- `python -m compileall -q matrixportal`

Python checks run on a desktop and use a bounded bitmap, not a physical matrix.
Firmware verification includes every reliability screen, the maximum-width 12:59
time, long labels, cached data, JSON validation, and HTTP framing. Actual Wi-Fi/TLS,
panel scan order, brightness, button timing, and long-duration power stability
require the physical S3. No hardware execution is claimed.

## References

- [TomTom Calculate Route v1](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route)
- [Adafruit S3 pinouts and buttons](https://learn.adafruit.com/adafruit-matrixportal-s3/pinouts)
- [CircuitPython RGBMatrix](https://docs.circuitpython.org/en/stable/shared-bindings/rgbmatrix/index.html)
- [CircuitPython TLS socket API](https://docs.circuitpython.org/en/stable/shared-bindings/ssl/index.html)

