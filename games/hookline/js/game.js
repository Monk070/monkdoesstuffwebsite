import { filterPool, allTracks } from './catalog.js';

// Every clip length the streamer can toggle on, with its points value.
// Steep curve: nailing it from a tenth of a second is worth 20x a 15s guess.
export const STAGE_DEFS = [
  { s: 0.1, pts: 1000 },
  { s: 0.2, pts: 750 },
  { s: 0.5, pts: 500 },
  { s: 2, pts: 250 },
  { s: 5, pts: 150 },
  { s: 8, pts: 100 },
  { s: 15, pts: 50 },
];
// Default enabled set — the classic ladder (also the legacy shape older
// code/tests rely on); 0.2s and 5s are the opt-in extras.
export const STAGES = [0.1, 0.5, 2, 8, 15];
export const STAGE_POINTS = [1000, 500, 250, 100, 50];
export const PREVIEW_LENGTH = 30;
export const MAX_CLIP = 15;

// settings.stageToggles: { '0.1': true, '0.2': false, ... } -> the round's
// stage list. An all-off configuration falls back to the default five.
export function activeStages(toggles) {
  const on = STAGE_DEFS.filter(d => toggles?.[String(d.s)]);
  return on.length ? on : STAGE_DEFS.filter(d => STAGES.includes(d.s));
}

// --- deterministic RNG for daily mode ---
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- round object ---
// A round = one track + guess progress. Same structure across all modes.
export function newRound(track, playMode, rng = Math.random, stageDefs = null) {
  const stages = (stageDefs && stageDefs.length)
    ? stageDefs
    : STAGE_DEFS.filter(d => STAGES.includes(d.s));
  const maxClip = stages[stages.length - 1].s;
  const maxOffset = PREVIEW_LENGTH - MAX_CLIP;
  return {
    track,
    stages,                   // [{ s, pts }] — this round's enabled clip lengths
    maxClip,                  // seconds of the last enabled stage
    stage: 0,                 // index into stages = current attempt
    guesses: [],              // { type: 'wrong'|'skip', text }
    status: 'playing',        // 'playing' | 'won' | 'lost'
    offset: playMode === 'random' ? rng() * maxOffset : 0,
    pointsEarned: 0,
  };
}

export function guessRound(round, guessedTrack) {
  if (round.status !== 'playing') return round.status;
  if (guessedTrack.key === round.track.key) {
    round.status = 'won';
    round.pointsEarned = round.stages[round.stage].pts;
    return 'won';
  }
  round.guesses.push({ type: 'wrong', text: `${guessedTrack.t} — ${guessedTrack.a}` });
  return advance(round);
}

// Chat voted !skip: unlock the next clip length WITHOUT costing an attempt
// slot's outcome. Returns false once the last stage is unlocked — the caller
// treats a passed vote there as chat giving up on the song (skipRound).
export function chatSkipStage(round) {
  if (round.status !== 'playing' || round.stage >= round.stages.length - 1) return false;
  round.guesses.push({ type: 'skip', text: 'Chat vote — skipped ahead' });
  round.stage++;
  return true;
}

// A viewer named the track in chat — round won at the current stage.
export function chatWin(round, viewerName, viewerPfp = '') {
  if (round.status !== 'playing') return round.status;
  round.status = 'won';
  round.pointsEarned = round.stages[round.stage].pts;
  round.wonBy = viewerName;
  round.wonByPfp = viewerPfp;
  return 'won';
}

export function skipRound(round) {
  if (round.status !== 'playing') return round.status;
  round.guesses.push({ type: 'skip', text: 'Skipped' });
  return advance(round);
}

function advance(round) {
  if (round.stage >= round.stages.length - 1) {
    round.status = 'lost';
    return 'lost';
  }
  round.stage++;
  return 'playing';
}

// --- track picking ---
const recentIds = [];
const RECENT_LIMIT = 50;

export function pickTrack(settings, rng = Math.random) {
  const pool = filterPool(settings);
  if (pool.length === 0) return null;
  let candidates = pool.filter(t => !recentIds.includes(t.id));
  if (candidates.length === 0) candidates = pool;
  const track = candidates[Math.floor(rng() * candidates.length)];
  recentIds.push(track.id);
  if (recentIds.length > RECENT_LIMIT) recentIds.shift();
  return track;
}

// Daily: same track for everyone on a given date. Pool = the more recognisable
// half of the whole catalogue (top 50% by popularity), all genres/eras.
export function pickDailyTrack(dateStr) {
  const tracks = [...allTracks()].sort((a, b) => b.p - a.p);
  if (tracks.length === 0) return null;
  const pool = tracks.slice(0, Math.max(1, Math.floor(tracks.length / 2)));
  const rng = mulberry32(xmur3(`hookline-daily-${dateStr}`)());
  return { track: pool[Math.floor(rng() * pool.length)], rng };
}

// Share grid for daily results: e.g. "🟥🟥🟩⬛⬛"
export function shareGrid(round) {
  const cells = [];
  for (let i = 0; i < round.stages.length; i++) {
    if (round.status === 'won' && i === round.stage) { cells.push('🟩'); continue; }
    if (i < round.guesses.length) {
      cells.push(round.guesses[i].type === 'skip' ? '⬜' : '🟥');
    } else {
      cells.push('⬛');
    }
  }
  return cells.join('');
}

// --- blitz ---
export const BLITZ_SECONDS = 120;

export function newBlitz() {
  return {
    timeLeft: BLITZ_SECONDS,
    score: 0,
    guessed: 0,
    attempted: 0,
    running: false,
  };
}
