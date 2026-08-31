import { filterPool } from './catalog.js';

// Reveal stages: how many mosaic columns the frame is rendered at per attempt
// (0 = the clear frame). Steep curve: naming the film from ~7 blocks across
// is worth 20x a clear-frame guess.
export const STAGES = [7, 12, 20, 40, 0];
export const STAGE_POINTS = [1000, 500, 250, 100, 50];
export const STAGE_NAMES = ['S1', 'S2', 'S3', 'S4', 'S5'];

export function stageLabel(i) {
  return STAGES[i] === 0 ? 'the clear frame' : `stage ${i + 1}`;
}

// --- round object ---
// A round = one film + guess progress.
export function newRound(movie) {
  return {
    movie,
    stage: 0,                 // index into STAGES = current attempt
    guesses: [],              // { type: 'wrong'|'skip', text }
    status: 'playing',        // 'playing' | 'won' | 'lost'
    pointsEarned: 0,
  };
}

export function guessRound(round, guessedMovie) {
  if (round.status !== 'playing') return round.status;
  if (guessedMovie.key === round.movie.key) {
    round.status = 'won';
    round.pointsEarned = STAGE_POINTS[round.stage];
    return 'won';
  }
  round.guesses.push({ type: 'wrong', text: `${guessedMovie.t} (${guessedMovie.y})` });
  return advance(round);
}

// Chat voted !skip: sharpen the frame WITHOUT costing an attempt slot's
// outcome. Returns false once the clear frame is showing — the caller treats
// a passed vote there as chat giving up on the film (skipRound).
export function chatSkipStage(round) {
  if (round.status !== 'playing' || round.stage >= STAGES.length - 1) return false;
  round.guesses.push({ type: 'skip', text: 'Chat vote — sharpened' });
  round.stage++;
  return true;
}

// A viewer named the film in chat — round won at the current stage.
export function chatWin(round, viewerName, viewerPfp = '') {
  if (round.status !== 'playing') return round.status;
  round.status = 'won';
  round.pointsEarned = STAGE_POINTS[round.stage];
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
  if (round.stage >= STAGES.length - 1) {
    round.status = 'lost';
    return 'lost';
  }
  round.stage++;
  return 'playing';
}

// --- film picking ---
const recentIds = [];
const RECENT_LIMIT = 50;

export function pickMovie(settings, rng = Math.random) {
  const pool = filterPool(settings);
  if (pool.length === 0) return null;
  let candidates = pool.filter(m => !recentIds.includes(m.id));
  if (candidates.length === 0) candidates = pool;
  const movie = candidates[Math.floor(rng() * candidates.length)];
  recentIds.push(movie.id);
  if (recentIds.length > RECENT_LIMIT) recentIds.shift();
  return movie;
}
