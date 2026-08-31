# Stillshot — guess the film from the frame (TikTok LIVE)

Film-guessing game for TikTok LIVE streamers, sibling of Hookline. A movie
still appears as a chunky mosaic and sharpens in five stages
(7 → 12 → 20 → 40 blocks → clear frame); viewers guess in chat with
`!film name`. **Connects directly to TikTok LIVE** — no TikFinity, no OBS
plugins, nothing else running.

**Sources:** TMDB for everything — film metadata, vote counts (recognisability
→ difficulty tiers) and the stills themselves. The catalogue stores bare TMDB
image paths; `image.tmdb.org` serves them keylessly and they never expire, so
unlike Hookline's Deezer previews nothing is refreshed at play time. Only
**textless** backdrops are used (no title art leaking the answer).

## Run it

- **Dev:** `start.bat` — serves on http://localhost:8124 via `tools/serve.mjs`
  (port 8124 so Hookline's 8123 can run alongside) and opens the browser.
  `stop.bat` kills it. Node 18+.
- **Catalogue:** put a free TMDB key in `tools/secrets.json` (copy
  `secrets.example.json`; themoviedb.org/settings/api — v3 key or v4 token
  both work), then **⟳ Rebuild catalogue** in Settings or
  `node tools/build-catalog.mjs`. Ships ~1,500–2,000 films across 7 decades.
- **Ship it:** `make-package.bat` builds `..\Stillshot Packaged` — game +
  node_modules + bundled Node runtime + one-click `STILLSHOT START.bat` +
  streamer README. Zip and send; the recipient installs nothing (the built
  catalog.json travels with the package, so they don't need a TMDB key).

## TikTok LIVE connection

Same bridge as Hookline: `tools/serve.mjs` connects with
`tiktok-live-connector` v2 (Euler Stream signing) and re-broadcasts events on
a local WebSocket (`/tiktok`) in the old TikFinity `{event, data}` shape.
Connect from Settings: enter the @username, go live, hit **Connect**.
Auto-reconnect with backoff; "user is offline"-class errors don't retry-loop.
The v2 protobuf gotchas (chat text in `content`, no `viewerCount` field,
avatar fallback chains) are handled in `serve.mjs`.

## Chat commands

- `!<guess>` — guess the film. Fuzzy (`js/chatmatch.js` + `js/normalize.js`):
  typos tolerated by length-scaled edit distance, leading "The" optional both
  ways, colon segments guessable on their own (`!endgame` or `!avengers` hit
  "Avengers: Endgame"), roman numerals and number words fold (`!rocky 2` hits
  "Rocky II", `!dune part 2` hits "Dune: Part Two"), and a trailing year is
  accepted when right (`!titanic 1997`, `!it 2017`) — handy for remakes.
- `!skip` — vote to sharpen the frame one stage; threshold = settings slider
  % of current viewers. On the clear frame a passed vote **skips the film
  entirely** (reveal, no points).
- `!genre <x>` / `!era <y>` (also `!decade`) — **costs 1,000 leaderboard
  points each**, both in one comment = 2,000, atomic. Aliases (scary/anime/
  heist), decades ("90s", "1995", "eighties"). A purchase holds for a
  **5-film window**; queue/override behaviour, refunds and one-pick-per-viewer
  all work exactly as in Hookline.
- `!points` (also `!pts` `!score` `!balance`) — balance check by pop.

First correct viewer wins: ding + confetti, pfp/name/points banner, points to
the persistent LEADERBOARD. Scoring 1000 / 500 / 250 / 100 / 50 by stage.
All viewer feedback is neon pops through one queue (900ms stagger, 3 lanes).

## Layout

Three columns; the **centre is a 9:16 portrait frame** — the stream capture
area (bottom quarter empty for the webcam). Logo → command hints →
LEADERBOARD → purchase bar → banner slot → **the frame** (16:9 canvas,
pixelated per stage) → stage bar (marker shows the points at stake) →
skip-vote bar → guess box. Sides (456px): settings left, chat log + simulator
right.

## Settings (left column)

TikTok LIVE connect · `!skip` threshold · Buffer · Game zoom · Title size ·
!commands size · Win sound · **Auto mode (AFK)** — sharpens the frame every
10/15/25s and advances rounds itself · purchase queue/override ·
Reset Score / Clear Leaderboard · ⟳ Rebuild catalogue (TMDB).

Genre / Era / Difficulty sit on the game panel as wheel-picker pills.
Difficulty = TMDB vote-count quintiles within the filtered pool, with the
climb-one-rung-per-film toggle.

## Testing without going live

- **▶ Auto-test**: synthetic chatroom of 10 fake viewers.
- **Sim input**: `name: !guess` — same ingest path as live chat.
- Unit tests: `npm test` (normalize / chatmatch / chatcommands / game).
- Without a TMDB key the repo ships a 12-film starter catalogue using local
  SVG placeholder frames (`assets/testframes/`), so the whole loop runs
  offline.

## Files

- `tools/serve.mjs` — static server + TikTok LIVE connection + `/tiktok`
  WS bridge + `/api/tiktok/*`, `/api/rebuild*`
- `js/main.js` — UI wiring, reveal flow, settings, pops, purchases, auto mode
- `js/game.js` — round state machine, stages, scoring
- `js/reveal.js` — canvas mosaic renderer (the pixelation) · `js/tmdb.js` —
  image URL helper
- `js/chat.js` — chat controller · `js/chatcommands.js` — `!genre`/`!era` ·
  `js/chatmatch.js` — fuzzy title matcher · `js/normalize.js` — shared
  normalisation (roman numerals, number words)
- `js/catalog.js` — catalogue load, pools, autocomplete
- `js/tikfinity-client.js` — reconnecting WS client (pointed at `/tiktok`)
- `js/sfx.js` / `js/confetti.js` / `js/autotest.js` / `js/storage.js`
- `tools/build-catalog.mjs` — TMDB sweep (needs `tools/secrets.json`)
- `make-package.bat` + `tools/packaging/` — the shippable-folder builder
