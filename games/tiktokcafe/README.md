# TikTok Café

Cozy interactive pixel-art café for TikTok Live. Viewers run the whole café
with chat commands. The local Node server (`tools/serve.mjs`) connects
DIRECTLY to TikTok LIVE via `tiktok-live-connector` and rebroadcasts events
to the browser over a WebSocket bridge (`/tiktok`) — no TikFinity needed.
Same bridge design as Hookline.

## Run it

```
start.bat          → npm install (first run), serves on http://localhost:5501, opens the browser
stop.bat           → kills the server
```

Requires Node.js. No build step — vanilla ES modules on a canvas; the only
dependencies are the server-side bridge (`tiktok-live-connector`, `ws`).

## Play it (viewer commands)

| Command | Effect |
| --- | --- |
| `!kitchen` `!counter` `!garden` `!loft` | join a room (fixed on-screen spot per player; `!cats` still works as a loft alias) |
| `!customer` | seat yourself as a customer and place a random order |
| `!leave` | step out of the café (character disappears; any command re-joins) |
| `!chop` `!fry` `!stir` `!bake` | fill a slot on the oldest ticket that needs it — every prep step consumes 1 food; at 0 food NOTHING can be prepared until the garden grows more |
| `!plate` | put a ready dish on the pass |
| `!serve` | deliver a passed dish — ONLY works from inside the counter (`!counter` first) |
| `!water` | grow food — 3 waters harvest +2 food (pixel tomato pop) |
| `!pet` | pet a loft animal — vibe meter stretches customer patience, boosts tips; at 0 vibe the animals cry |
| `!animal` | cycle the loft residents for everyone: cats → dogs → rabbits (room sign, pet sound and toasts follow; persists between streams) |
| `!background` | cycle the scene theme for everyone: night → day → space → halloween → christmas (persists; streamer can disable in ⚙ Features) |
| `!gender` | restyle your character: male → female → non-binary → trans male → trans female (default hair style; a small pride pin for the trans/non-binary looks) |
| `!skin` | cycle your skin tone (6 tones) |
| `!top` | change your top: tee → striped tee → hoodie → jacket |
| `!lower` | change your lower half: jeans → shorts → dress |
| `!haircolour` | dye your hair: brown → blonde → red → black → pink → blue → purple → green |
| `!hairstyle` | 9 cuts: short → shaggy → long → bob → ponytail → bun → spiky → afro → buzz (an explicit pick overrides the gender default) |
| `!ghost` | become a ghost — hovers and wiggles in place; type again to turn back |
| `!alien` | become a green alien (antennae, big black eyes); type again to turn back |
| `!adoptcat` `!adoptdog` `!adoptbunny` | adopt a tiny pet that sits at your feet and follows you room to room; same command again sends it home |
| likes | fuel the stove — an empty stove cooks at ⅓ speed; the liker's name floats out of the furnace with a ❤️ |
| gifts | coin value banks into the café till; freeze all timers 30 s; big gifts drop an ingredient crate |

Characters are consistent everywhere: one sprite per viewer in every room
(chef's toque on top in the kitchen/counter — even on ghosts and aliens),
and every customization choice — gender, skin, top, lower, hair colour,
hairstyle, ghost/alien form, adopted pet, plus the gold hat — is remembered
between streams (localStorage, `tiktokcafe.chars.v1`). Viewers who never
customize get a stable hash-based look drawn only from male/female,
jeans/shorts and natural hair colours — dresses, pride pins and bright hair
are always an explicit choice, never randomly assigned.

Secret: `!gold` buys a gold chef's hat for 100 coins from the till (exact
spelling, listed nowhere in-game).

Typos land (edit distance 1: `!chpo` works). Per-user cooldown 2 s. Any
action verb auto-joins the right room — except `!serve`, which requires
standing at the counter (that's the server's job), and the style commands
(`!animal` `!gender` `!skin` `!top` `!lower`), which work from anywhere.
Unserved pass dishes self-serve after 10 s at a smaller tip.
Idle players leave after 150 s (TikTok sends no "viewer left" event, so idle
time is the proxy — tunable). Coins/food/vibe/loft-animal persist between
streams (localStorage).

The supply chain: **garden → kitchen → pass → counter → happy customer**,
with the cat loft as the zero-pressure room that quietly helps everyone.

## Settings (⚙ button in the dev panel — collapsible sections)

Everything a streamer tunes lives in the settings panel (right side), saved
to localStorage:

- **Chat commands** — comma-separated aliases per action; the first alias
  shows on room signs and hints (e.g. rename `!chop` to `!cut, chop, dice`)
- **Likes & gifts** — freeze duration, crate-drop coin threshold, fuel/like
- **Kitchen timers & limits** — order lifetime / customer patience, cooking
  time, plate window, serve window (seconds), max orders at once (1–4,
  default 3), cat vibe decay per minute, idle-leave seconds
- **Features** — toggle gift effects, text-command processing, and the
  viewer `!background` command on/off
- **Veg counter** — the "Food N" chip shown in both garden and kitchen:
  font, size, style, text colour, background colour; each copy nudgeable
- **Sound** — generative SFX on/off + volume. All sounds are synthesized
  live (Web Audio, zero sample files): per-animal pet sounds (meow / woof /
  squeak), watering bloops, per-verb cooking sounds, plate clink, "Ba-ding!"
  on serve, tick-tock patience warning. Browsers unlock audio on the first
  click; OBS plays immediately.
- **Background** — scene theme for the world outside the café: Night
  (default), Day, Space, Halloween (harvest moon, bats, jack-o'-lanterns,
  cobwebs) or Christmas (snowfall, snow caps, fairy-light sign bulbs).
  Applies instantly; the interior stays warm and lamplit in every theme.
- **Theme** — sign title text (gold pixel letters), UI font, bubble
  background + text colours, cat heart meter colour, meter size (0.5–2×)
- **Display** — character sprite size slider (1×/2×/3×, live preview)
- **Player names** — bubble above head or badge on chest, font size,
  character limit, X/Y offset (or click a name in-game + arrows)
- **Order tickets** — the large tickets under the rooms: X/Y position (or
  click the row + arrows), whole-ticket scale (0.5–2×), font family/size/
  style, text colour. Tickets sit in fixed columns and never shift around.
- **Game messages** — position (above/below the rooms; above = 5 fixed rows
  that replace in place), rows shown (1–7), time on screen, message font
  (5 choices) + colour, optional separate username font + colour. Bars are
  colour-coded to the room they're about.
- **Call-to-action message** — the flashing "type !kitchen to cook" text:
  custom text, X/Y position (canvas is 360×640), and font size

Buttons under the sections: Save, Reset defaults, Reset coin counter,
Reset served counter, Reset food, Close.

## Moving labels

Click any label in the game (room signs, coin counter, SERVED counter, sign
title, food counters, name tags, overflow +N badges, order-ticket row, the
call-to-action) to select it, then nudge with the **arrow keys** (Shift =
5px). **Esc**/**Enter** finishes. Positions save automatically.

## Keys & URL params

- `` ` `` — toggle the dev panel (dev + settings panels are visible by
  default; `?dev=0` hides both for a clean OBS browser source, `?settings=0`
  keeps just the settings closed)
- `Z` — toggle the zoom camera (default: zoomed so the building fills the
  width; `?zoom=0` starts zoomed out with street + sky)
- `?demo=1` — seed a busy café (screenshots, quick checks)
- `?auto=1` — start auto-play (simulated, state-aware chatroom)
- `?settings=1` — open the settings panel on load
- `?msgpos=above|below`, `?names=bubble|chest` — session-only overrides
- `?theme=night|day|space|halloween|xmas` — session-only background override
- `?animal=cats|dogs|rabbits` — set the loft species (display testing)
- `?coins=N` — set the coin counter (display testing)
- `?edit=<label>` — preselect a label for nudging

## Dev testing & going live

The dev panel (left side) is a fake chatroom: type `alice: !chop` and press
Enter, or use the buttons (including Gift 5/50/500/5000 for display checks).
**Auto-play** simulates a busy chat. The terminal under the tiktok pill
shows every event — ● live / ○ sim, gold for !commands — so during a live
test you can see exactly what TikTok delivers. If anything ever breaks, a
red error bar appears at the top: screenshot it.

Live checklist: go live on TikTok → start.bat → enter your @username at the
top of the dev panel → Connect → pill turns green "tiktok: @you" → real
events stream with ● bullets. The connection lives in the server, so the
OBS browser source (`?dev=0`) receives events even if you connected from a
different tab. Auto-reconnects on drops (backs off gently if TikTok's
signing server rate-limits).

## Layout

360×640 logical canvas (9:16). The building sits in the TikTok-safe middle
55%; the zoom camera crops to the building width by default. ALL text —
labels, tickets, HUD, bubbles, toasts — renders on a second full-resolution
overlay canvas (crisp at any zoom); pixel-art lettering (sign, coins,
SERVED) is drawn as scaled rects on the overlay for the same reason. The
game stays chunky pixel art underneath.

## Files

```
index.html / style.css     page shell + dev/settings panel chrome
start.bat / stop.bat       serve + stop on port 5501
tools/serve.mjs            static server + TikTok LIVE bridge (ported from Hookline)
src/main.js                boot, render loop, camera transforms, ingest(), error bar
src/camera.js              zoom camera (building-width crop)
src/tiktok-client.js       WebSocket client for the local bridge
src/commands.js            chat parsing: fuzzy match, cooldowns, routing
src/settings.js            all streamer settings + migrations (localStorage)
src/settings-ui.js         the ⚙ Settings panel (collapsible sections)
src/label-editor.js        click-a-label + arrow-key nudging
src/game.js                state + café loop (tickets, rooms, persistence)
src/scene.js               static building + ambient animation (procedural)
src/view.js                dynamic rendering (players, tickets, HUD, labels)
src/sprites.js             string-grid sprites (players, hats, cats, plants, dishes)
src/fx.js                  bubbles, toasts, veg pops, smoke, sparkles
src/sfx.js                 generative sounds (Web Audio, no samples)
src/palette.js             the one palette + per-user color hashing
src/simulator.js           dev panel: fake chat, auto-play, event terminal
```

## Polish / roadmap ideas

- Named regulars: returning viewers get a permanent NPC at their own table
- Assigned "head chef" tickets for gifters (sequence-owned orders)
- Upgrades shop: more things like !gold to spend till coins on
- Verify gift streak behavior against real TikTok LIVE traffic (the bridge
  only emits completed streaks, marked repeatEnd: true)
