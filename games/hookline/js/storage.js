const KEY = 'hookline_state_v1';

const DEFAULTS = {
  settings: {
    genre: 'any',
    era: 'any',
    difficulty: 'easy',
    volume: 70,
    skipPct: 25, // % of current viewers whose !skip votes advance the segment
    buffer: 0, // px of empty space above the frame content (TikTok's top overlay)
    gameZoom: 100, // % zoom of the game column content (80-125)
    logoScale: 100, // % size of the HOOKLINE.fun logo (50-150)
    hintScale: 100, // % size of the two !command hint rows (50-150)
    diffCycle: true, // each NEXT SONG climbs Easy→Pro then loops
    autoMode: false, // AFK: loop clips and advance rounds automatically
    autoGap: 500, // ms between auto replays (500 / 1000 / 2000)
    purchaseMode: 'queue', // 'queue' | 'override' — second !genre/!era purchase waits or replaces
    tiktokUser: '', // last connected TikTok @username
    stageToggles: { 0.1: true, 0.2: false, 0.5: true, 2: true, 5: false, 8: true, 15: true }, // enabled clip lengths
    coinRatio: 1, // banked points per gifted coin (0 = gifts don't bank)
    likesPerPoint: 10, // taps needed per 1 banked point (0 = likes don't bank)
    bankRotate: 10, // seconds each view when the podium alternates Leaderboard <-> Bank (0 = leaderboard only)
    followToPlay: false, // viewers must follow the streamer before guesses/purchases count
    wheelGiftCoins: 0, // a single gift worth >= this many coins spins the prize wheel (0 = off)
    spinScale: 100, // % size of the spin wheel overlay (50-150)
    spinPos: 50, // vertical position of the wheel in the frame (0 top - 100 bottom)
    openGroups: {}, // which collapsible settings groups the streamer left open
  },
  endless: { games: 0, wins: 0, streak: 0, bestStreak: 0, score: 0, byStage: [0, 0, 0, 0, 0], byStageSec: {} },
  purchase: { left: 0, active: false }, // viewer-bought genre/era window (5 songs)
  purchaseQueue: [], // pending purchases waiting for the current window to end
  tiktok: {
    scores: {}, // uniqueId -> { name, pfp, points, wins }
    bank: {}, // uniqueId -> { name, pfp, points } — gift-funded, spent before leaderboard points
    credits: {}, // uniqueId -> { genre: n, era: n } — free picks won on the wheel
    followers: {}, // uniqueId -> 1, learned from follow events / chat follow flags
  },
};

let state = null;

export function loadState() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? deepMerge(structuredClone(DEFAULTS), JSON.parse(raw)) : structuredClone(DEFAULTS);
  } catch {
    state = structuredClone(DEFAULTS);
  }
  return state;
}

export function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* private mode etc. — play on without persistence */ }
}

function deepMerge(base, over) {
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
      deepMerge(base[k], over[k]);
    } else if (over[k] !== undefined) {
      base[k] = over[k];
    }
  }
  return base;
}
