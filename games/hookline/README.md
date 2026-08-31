# Hookline — TikTok LIVE edition

Song-guessing game for TikTok LIVE streamers: clips unlock in stages
(0.1s → 0.5s → 2s → 8s → 15s of a 30-second preview) and viewers guess in
chat with `!song name`. **Connects directly to TikTok LIVE** — no TikFinity,
no OBS plugins, nothing else running. This is the standalone product; the
web version lives at https://hookline.fun (separate repo), which also serves
as this product's catalogue source.

**Sources:** Spotify Web API for metadata/popularity (catalogue built
offline, or pulled ready-made from hookline.fun), Deezer for the 30s audio
previews + cover art (fetched fresh at play time so expired preview URLs
never break the game).

## Run it

- **Dev:** `start.bat` — serves on http://localhost:8123 via `tools/serve.mjs`
  and opens the browser. `stop.bat` kills it. Node 18+.
- **Ship it:** `make-package.bat` builds `..\Hookline Packaged` — the whole
  game + node_modules + a bundled Node runtime + a one-click
  `HOOKLINE START.bat` and a streamer README. Zip that folder and send it;
  the recipient installs nothing and never needs Spotify credentials
  (**⟳ Update catalogue** downloads `hookline.fun/data/catalog.json`).

## TikTok LIVE connection

`tools/serve.mjs` connects with `tiktok-live-connector` v2 (websocket signing
by Euler Stream — the free community tier for now; a commercial API key +
short-lived token minting is the path for shipping to customers). Events are
re-broadcast on a local WebSocket (`/tiktok`) in the old TikFinity
`{event, data}` shape, so the front-end is transport-agnostic.

Connect from Settings: enter the @username, go live on TikTok, hit
**Connect** (green) / **Disconnect** (red); a pulsing note confirms the live
link. Auto-reconnect with backoff; "user is offline"-class errors don't
retry-loop.

v2 protobuf gotchas (hard-won on a real stream): chat text arrives as
`content` not `comment`; there is no `viewerCount` field (mapped from
`viewerCount ?? total ?? totalUser`); user ids and avatars need fallback
chains. One-shot shape loggers remain in `serve.mjs` for the next surprise.

## Chat commands

- `!<guess>` — guess the track. Title alone is enough; artist optional.
  Forgiving on purpose (`js/chatmatch.js` + `js/normalize.js`): symbols fold
  (Ke$ha = Kesha, P!nk = pink), typos tolerated by length-scaled edit
  distance, spelled-out acronyms collapse (`!surfin usa` hits
  "Surfin' U.S.A."), dash-suffixed metadata noise is stripped ("Love Is
  Gone - Fred Riester & Joachim Garraud Radio Edit Remix" matches
  `!love is gone`), bracketed/dash alternate titles match on either half
  ("we can't be friends (wait for your love)", "Lady - Hear Me Tonight").
  Different songs don't false-positive.
- `!skip` — vote to unlock the next clip length; threshold = settings
  slider % of current viewers. The purple bar fills as votes land. At the
  15s max a passed vote **skips the song entirely** (reveal, no points) —
  chat's escape hatch when nobody has a clue.
- `!genre <x>` / `!era <y>` — **costs 1,000 points each**, pulled from the
  viewer's **bank first**, then leaderboard points (both in one comment
  = 2,000, atomic). Forgiving parsing (`js/chatcommands.js`): aliases
  (rap/edm/alt), decades ("90s", "1995", "eighties"). A purchase holds for
  a **5-song window**, then Any/Any returns. While a window runs, further
  purchases either **queue** (cap 3, paid on joining) or **override** —
  streamer's toggle. The streamer changing genre/era manually cancels and
  refunds the queue (refunds land in the bank). One pick per viewer: while
  yours is running or queued, further purchases bounce (no points taken)
  until it has played out. A purple purchase bar under the leaderboard
  shows the current pick, songs left, and the queue. Free picks won on the
  wheel are consumed before any points.
- `!points` (also `!pts` `!score` `!balance`) — balance check by pop.
- `!bank` — banked-points balance check by gold pop.

**Gifts & the bank** — a gift banks `coins × ratio` points for the sender
(ratio is a setting; 0 disables). Likes bank too: every `likesPerPoint`
taps = 1 banked point (default 10, 0 disables; leftovers carry within the
session, conversion is silent — no pops for like floods). Banked points
are a separate pot from the leaderboard, spent first on purchases. The podium **alternates between
LEADERBOARD and BANK** views (pace is a setting; gold styling in bank
view). A single gift worth ≥ the **wheel spin threshold** (setting, 0 =
off) spins an on-stream prize wheel — gifter's pfp + name above it, spins
queue one at a time: **10K banked jackpot · free genre pick · free era
pick · 1K banked · 2.5K banked** (every points prize lands in the bank).
Wheel size and vertical position are sliders; a Test spin button runs the
full animation with a fake user and awards nothing.

**Follow to play** (toggle, default off) — guesses, skip votes and
purchases only count for followers (balance checks still answer).
Followers are learned from TikTok follow events and the follow flag on
chat messages; a new follow unlocks instantly, and known followers persist
between streams.

First correct viewer wins the round: ding + confetti, pfp/name/points
banner, points to the persistent LEADERBOARD. Only the streamer (or auto
mode) advances rounds. All viewer feedback is neon pops in the frame —
red wrong-guess, green skips/purchases, orange can't-afford (with
shortfall), cyan balance — through one queue (900ms stagger, 3 lanes) so
simultaneous events never overlap.

## Layout

Three columns; the **centre is a 9:16 portrait frame** — the stream capture
area (bottom quarter deliberately empty for the webcam). Logo →
two-row command hint → LEADERBOARD → purchase bar → banner slot → clip
bar → play/skip → guess box. Nothing shifts position between states.
Sides (456px) are the streamer's consoles, not for capture: settings on
the left, viewer chat log + simulator on the right.

## Settings (left column)

Organised as TikTok LIVE connect on top plus four collapsible groups —
**Game rules**, **Gifts & bank**, **Look & sound**, **Data & resets** —
each remembering whether the streamer left it open.

TikTok LIVE connect · `!skip` threshold slider · **Buffer** (0–120px of
empty space at the top of the frame so TikTok's live UI doesn't cover the
game) · **Game zoom** (80–125%, scales the game-column widgets to fill the
frame width) · **Title size** and **!commands size** (50–150%, for monitors
whose DPI renders the logo/hint rows oversized) · volume · **Auto mode (AFK)** — loops the clip (0.5/1/2s gap),
a guessed song plays its full preview then auto-advances; the streamer can
walk away · **Clip lengths** (toggle each of 0.1/0.2/0.5/2/5/8/15s; at
least one stays on; applies next song) · **!bank** (coins→banked ratio + podium
rotation pace) · **Follow to play** on/off · **Gift wheel spin** (coin
threshold + wheel size/position sliders) · purchase queue/override toggle ·
Reset Score / Clear Leaderboard (also wipes bank + free picks) ·
⟳ Update catalogue (pulls from hookline.fun).

Genre / Era / Difficulty sit on the game panel as wheel-picker pills.
Difficulty (Easy → Medium → Hard → Expert → Pro = popularity quintiles
within the filtered pool) has a play-toggle that climbs one rung per song.
Scoring by clip length: 0.1s=1000 · 0.2s=750 · 0.5s=500 · 2s=250 ·
5s=150 · 8s=100 · 15s=50 — a round only steps through the enabled lengths.

## Testing without going live

- **▶ Auto-test**: synthetic chatroom of 10 fake viewers — realistic wrong
  guesses, !skip votes, stage-scaled correct guesses, occasional gifts
  (so the bank and wheel spin can be rehearsed off-live).
- **Sim input**: `name: !guess` — same ingest path as live chat.
- `window.hooklineIngest({event, data})` in the console injects any event
  (chat/gift/follow) for debugging.
- Unit tests: `node tools/test-normalize.mjs`, `test-chatmatch.mjs`,
  `test-chatcommands.mjs`, `test-game.mjs`.
- Feature smoke: `node tools/smoke-features.mjs` — boots the server +
  headless Edge and drives gifts → bank → wheel → follow gate end-to-end.

## Files

- `tools/serve.mjs` — static server + TikTok LIVE connection + `/tiktok`
  WS bridge + `/api/tiktok/*`, `/api/catalog/update`
- `js/main.js` — UI wiring, reveal flow, settings, pops, purchases, auto mode
- `js/game.js` — round state machine, scoring
- `js/chat.js` — chat controller: guesses, skip votes, commands, cooldowns
- `js/chatcommands.js` — `!genre`/`!era` parsing · `js/chatmatch.js` — fuzzy
  guess matcher · `js/normalize.js` — shared text normalisation
- `js/catalog.js` — catalogue load, pools, autocomplete
- `js/tikfinity-client.js` — reconnecting WS client (now pointed at `/tiktok`)
- `js/audio.js` / `js/sfx.js` / `js/confetti.js` / `js/autotest.js` /
  `js/deezer.js` / `js/storage.js`
- `tools/build-catalog.mjs` — Spotify sweep → Deezer match (needs
  `tools/secrets.json`, see `secrets.example.json`; dev only — shipped
  copies pull from hookline.fun instead)
- `make-package.bat` + `tools/packaging/` — the shippable-folder builder
