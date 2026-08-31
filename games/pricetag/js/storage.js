// Persistence: leaderboard, settings, seen-item rotation. All localStorage,
// so the offline playtest build carries scores between streams — same
// approach as Hookline.

const SCORES_KEY = "pricetag.scores.v1";
const SETTINGS_KEY = "pricetag.settings.v1";
const SEEN_KEY = "pricetag.seen.v1";

export const DEFAULT_SETTINGS = {
  roundSeconds: 40,       // guessing window
  revealSeconds: 12,      // how long the price/winners screen stays up
  autoNext: true,         // roll straight into the next item after reveal
  mode: "mixed",          // mixed | items | property — which catalogue pool
  currencyMode: "gbp",    // gbp | random — random = chaos mode (guess in Đồng)
  tiktokUser: "",         // remembered @username for the bridge
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* non-fatal */ }
}

// scores: { uid: { name, pts, wins, exacts } } — all-time, capped.
export function loadScores() {
  try { return JSON.parse(localStorage.getItem(SCORES_KEY) ?? "{}") ?? {}; }
  catch { return {}; }
}

export function awardPoints(scores, winners) {
  for (const w of winners) {
    const s = scores[w.uid] ?? (scores[w.uid] = { name: w.name, pts: 0, wins: 0, exacts: 0 });
    s.name = w.name || s.name;
    s.pts += w.points;
    if (w.points >= 3) s.wins++;
    if (w.exact) s.exacts++;
    s.at = Date.now();
  }
  // cap the table so localStorage never fills — drop the stalest zero-scorers
  const keys = Object.keys(scores);
  if (keys.length > 2000) {
    keys.sort((a, b) => (scores[a].pts - scores[b].pts) || (scores[a].at ?? 0) - (scores[b].at ?? 0));
    for (const k of keys.slice(0, keys.length - 2000)) delete scores[k];
  }
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(scores)); } catch { /* non-fatal */ }
}

export function topScores(scores, n = 5) {
  return Object.entries(scores)
    .map(([uid, s]) => ({ uid, ...s }))
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins)
    .slice(0, n);
}

// Seen-item rotation: don't repeat an item until the whole pool has been
// played (persists across streams; resets automatically when exhausted).
export function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); }
  catch { return new Set(); }
}

export function saveSeen(seen) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* non-fatal */ }
}
