const KEY = 'stillshot_state_v1';

const DEFAULTS = {
  settings: {
    genre: 'any',
    era: 'any',
    difficulty: 'easy',
    volume: 70,
    skipPct: 25, // % of current viewers whose !skip votes sharpen the frame
    buffer: 0, // px of empty space above the frame content (TikTok's top overlay)
    gameZoom: 100, // % zoom of the game column content (80-125)
    logoScale: 100, // % size of the STILLSHOT logo (50-150)
    hintScale: 100, // % size of the two !command hint rows (50-150)
    diffCycle: true, // each NEXT FILM climbs Easy→Pro then loops
    autoMode: false, // AFK: auto-sharpen the frame and advance rounds
    autoGap: 15000, // ms per stage in auto mode (10000 / 15000 / 25000)
    purchaseMode: 'queue', // 'queue' | 'override' — second !genre/!era purchase waits or replaces
    tiktokUser: '', // last connected TikTok @username
  },
  endless: { games: 0, wins: 0, streak: 0, bestStreak: 0, score: 0, byStage: [0, 0, 0, 0, 0] },
  purchase: { left: 0, active: false }, // viewer-bought genre/era window (5 films)
  purchaseQueue: [], // pending purchases waiting for the current window to end
  tiktok: { scores: {} }, // uniqueId -> { name, points, wins }
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
