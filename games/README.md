# MonkDoesStuff — games

Static builds of Dan's TikTok Live games, copied from their dev folders for
hosting on monkdoesstuff.fun (Cloudflare Pages friendly: no build step,
plain ES modules, each game is self-contained in its folder).

| Folder | Game | Source folder |
| --- | --- | --- |
| `hookline/` | Hookline — Heardle-style song guessing (full 4MB catalogue included) | `D:\Coding\Hookline` |
| `stillshot/` | Stillshot — guess the film from a frame (starter catalogue only — full one needs a TMDB build in the source project) | `D:\Coding\Stillshot` |
| `tiktokcafe/` | TikTok Café — cozy pixel café run by chat | `D:\Coding\TiktokCafe` |
| `pricetag/` | PriceTag — guess the price (Vinted tat + Rightmove property mode, currency chaos) | `D:\Coding\PriceTag` |

## What was deliberately stripped from the copies

- `tools/` — includes each game's local Node server AND **secrets**
  (`secrets.json`: Spotify key for Hookline, TMDB key for Stillshot).
  Never copy tools/ into this public folder.
- `node_modules/`, `.git/`, `*.bat`, `package*.json` — local dev only.

## What works hosted vs locally

Hosted (these copies): browser/solo play, simulators, all game UI.
The **live TikTok connection does NOT work hosted** — it needs each game's
local Node bridge (`tools/serve.mjs` in the source folders, ports:
Hookline 8123, Stillshot 8124, TikTok Café 5501, PriceTag 8125). Streamers
run the game locally via its start.bat; these hosted copies are for
sharing/demoing. Each game shows a "local server offline" style status
when hosted — that's expected, not a bug.

## Updating a copy

Re-run the same robocopy (from the terminal that maintains this folder):

```
robocopy "D:\Coding\<Game>" "D:\Coding\MonkDoesStuff Website\games\<game>" /E /XD node_modules .git .claude tools /XF *.bat package.json package-lock.json .gitignore
```
