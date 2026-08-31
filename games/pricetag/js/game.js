// Round state machine + scoring. Pure logic — no DOM, no timers of its own —
// so tools/test-game.mjs can drive it headlessly.
//
// Phases: idle → guessing → reveal → (next round) …
// One guess per viewer per round; re-guessing replaces (keeps chat engaged
// right up to the buzzer). Closest 3 win points, exact match gets a bonus.

export const POINTS = [3, 2, 1];     // 1st/2nd/3rd closest
export const EXACT_BONUS = 2;        // guessed it to the penny

export function createGame() {
  return {
    phase: "idle",                   // idle | guessing | reveal
    item: null,                      // { id, title, price, image, source, url }
    timeLeft: 0,
    guesses: new Map(),              // uid → { name, value, at, pfp }
    seq: 0,                          // guess arrival order (tie-break)
    lastWinners: [],                 // reveal results, newest round
    round: 0,
  };
}

export function startRound(g, item, seconds) {
  g.phase = "guessing";
  g.item = item;
  g.timeLeft = seconds;
  g.guesses = new Map();
  g.seq = 0;
  g.lastWinners = [];
  g.round++;
}

// Returns true if the guess was accepted (i.e. we're mid-round).
export function submitGuess(g, uid, name, value, pfp = "") {
  if (g.phase !== "guessing" || !uid || !Number.isFinite(value)) return false;
  const prev = g.guesses.get(uid);
  g.guesses.set(uid, { name: name || uid, value, at: prev?.at ?? g.seq++, pfp });
  return true;
}

// End the round: rank everyone by closeness, award points.
// Ties on distance go to whoever guessed FIRST (rewards conviction).
export function reveal(g) {
  if (g.phase !== "guessing" || !g.item) return [];
  g.phase = "reveal";
  const price = g.item.price;
  const ranked = [...g.guesses.entries()]
    .map(([uid, e]) => ({ uid, ...e, dist: Math.abs(e.value - price) }))
    .sort((a, b) => a.dist - b.dist || a.at - b.at);
  g.lastWinners = ranked.slice(0, POINTS.length).map((entry, i) => ({
    ...entry,
    points: POINTS[i] + (entry.dist < 0.005 ? EXACT_BONUS : 0),
    exact: entry.dist < 0.005,
  }));
  return g.lastWinners;
}
