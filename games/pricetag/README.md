# PriceTag

Guess-the-price game for TikTok Live. Real second-hand tat (Vinted,
Gumtree) and real houses (Rightmove) appear on screen; viewers guess the
price in chat; closest three win points. Persistent all-time leaderboard.

The local Node server (`tools/serve.mjs`) connects DIRECTLY to TikTok LIVE
via `tiktok-live-connector` — no TikFinity. Same bridge design as Hookline
and TikTok Café. The site itself is static (vanilla ES modules, no build
step) so the future online version deploys to Cloudflare Pages as-is; only
the live-chat connection needs the local server.

## Run it

```
start.bat     → npm install (first run), serves on http://localhost:8125, opens browser
stop.bat      → kills the server
npm test      → parser + game logic tests
python tools\build-catalog.py   → (re)build the item/property catalogue
```

## Play

- **Rounds**: an item appears (properties auto-flick through their photos),
  a countdown runs (default 40s), chat guesses, the price is revealed with
  a podium. Auto-next rolls straight into the next item.
- **Guess parsing** is forgiving — all of these count:
  `2.50` `£3` `50p` `4 quid` `395000` `395,000` `!395k` `£400,000`
  `1.25m` `!1 million 200` `1million 250 thousand` `9.6b`
  A message must BE a price (a lone number/amount), so normal chatter is
  ignored. Re-guessing replaces your guess until the timer ends.
- **Scoring**: closest 3 get 3/2/1 points; guessing exact adds +2.
  Distance ties go to whoever guessed first. Leaderboard persists
  (localStorage `pricetag.scores.v1`).
- **Item rotation**: no repeats until the whole pool has been played
  (persists between streams).

## Streamer panel (backtick toggles; `?dev=0` hides for OBS)

- **TikTok connect**: enter your @username while live → Connect. The
  connection lives in the server, so a clean OBS browser source still
  receives events when you connect from another tab.
- **Mode**: Mixed / Items only / Property only.
- **Currency**: `£ GBP` (fixed) or `🎲 Random currency` — each round picks
  a random currency (weighted toward the funny ones: Vietnamese Đồng,
  Indonesian Rupiah…), the price is converted, and chat must guess in THAT
  currency. Reveal shows the GBP price underneath. Rates in
  `js/currency.js` are approximate on purpose.
- Round/reveal seconds, auto-next, sound.
- **Sim tools**: fake a guess (`alice: 4.50`), Fake crowd, Auto-play —
  full offline playtesting without going live.

## Catalogue

`tools/build-catalog.py` (Python + curl_cffi, VHS Finder recipe) scrapes:

- **Vinted** — internal JSON API; odd-tat search terms, kind=`item`
- **Gumtree** — search pages (needs beautifulsoup4), kind=`item`
- **Rightmove** — search page embedded JSON + listing photo sets
  (up to 6 photos each), kind=`property`, five regions for price spread

All photos are downloaded to `data/img/` so the game runs fully offline.
Titles containing a price are dropped (no leaked answers). Adding another
source = one function in the builder returning the same item shape.
eBay is IP-blocked from this machine (see VHS Finder).

## Files

```
index.html / css/style.css   page shell, game-show styling (Logo.png colours)
start.bat / stop.bat         serve + stop on port 8125
Logo.png                     the PriceTag logo (Dan's)
tools/serve.mjs              static server + TikTok LIVE bridge + rebuild API
tools/build-catalog.py       catalogue scraper (Vinted/Gumtree/Rightmove)
tools/test-guess.mjs         parser tests (every accepted notation)
tools/test-game.mjs          round/scoring tests
js/main.js                   boot, round flow, panel, confetti, ingest()
js/game.js                   round state machine + scoring (pure logic)
js/guess.js                  chat → price parser (pure logic)
js/currency.js               currency chaos mode (rates + formatting)
js/catalog.js                catalogue load + no-repeat rotation
js/storage.js                settings/leaderboard/seen persistence
js/tiktok-client.js          WebSocket client for the local bridge
js/sfx.js                    tiny generative countdown/reveal sounds
data/catalog.json            built catalogue (+ data/img/ photo cache)
```

## Roadmap

- Playtest with viewers (offline build, this repo) ← we are here
- Register a domain (pricetag.fun is taken — variants TBD) + Cloudflare
  Pages online version with solo play
- More sources; maybe eBay via a different network
- Streak bonuses, follow-to-play, gift-triggered special rounds
