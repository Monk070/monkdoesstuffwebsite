import { normalize, movieKey } from './normalize.js';
import { isBannedTitle, collidesWithCommands } from './moderation.js';

export const GENRES = [
  { key: 'any', label: 'Any' },
  { key: 'action', label: 'Action' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'drama', label: 'Drama' },
  { key: 'horror', label: 'Horror' },
  { key: 'scifi', label: 'Sci-Fi/Fantasy' },
  { key: 'animation', label: 'Animation' },
  { key: 'romance', label: 'Romance' },
  { key: 'thriller', label: 'Thriller/Crime' },
];

export const ERAS = [
  { key: 'any', label: 'Any' },
  { key: 1960, label: '1960s' },
  { key: 1970, label: '1970s' },
  { key: 1980, label: '1980s' },
  { key: 1990, label: '1990s' },
  { key: 2000, label: '2000s' },
  { key: 2010, label: '2010s' },
  { key: 2020, label: '2020s' },
];

export const DIFFICULTIES = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'expert', label: 'Expert' },
  { key: 'impossible', label: 'Pro' }, // key stays for saved settings/CSS
];

const MIN_POOL = 10; // below this, difficulty slicing is meaningless

let movies = [];
let meta = { generatedAt: null };

export async function loadCatalog() {
  const res = await fetch('./data/catalog.json');
  const data = await res.json();
  meta = data;
  // drop films viewers can't guess in chat: titles TikTok blocks, and titles
  // that collide with the !skip command
  const usable = (data.movies || []).filter(m => !isBannedTitle(m.t) && !collidesWithCommands(m.t));
  movies = usable.map(m => ({
    ...m,
    decade: Math.floor(m.y / 10) * 10,
    key: movieKey(m.t, m.y),
    // searchable haystack: normalized title + release year
    norm: normalize(m.t) + ' ' + m.y,
  }));
  return { count: movies.length, generatedAt: data.generatedAt };
}

export function catalogSize() { return movies.length; }
export function allMovies() { return movies; }

// Pool of possible answers for the current settings. Difficulty = quantile of
// TMDB vote count *within* the genre/era-filtered pool, so "Easy 80s Horror"
// means the best-known 80s horror, not globally famous films that happen to
// be horror.
export function filterPool({ genre, era, difficulty }) {
  let pool = movies;
  if (genre && genre !== 'any') pool = pool.filter(m => m.g.includes(genre));
  if (era && era !== 'any') pool = pool.filter(m => m.decade === era);
  if (difficulty && difficulty !== 'any' && pool.length >= MIN_POOL) {
    const sorted = [...pool].sort((a, b) => b.p - a.p);
    const i = DIFFICULTIES.findIndex(d => d.key === difficulty);
    const n = sorted.length;
    pool = sorted.slice(Math.floor((n * i) / 5), Math.floor((n * (i + 1)) / 5));
  }
  return pool;
}

// Autocomplete over the ENTIRE catalogue (never just the answer pool — that
// would leak the answer). Returns up to `limit` films, deduped by key.
export function suggest(query, limit = 8) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const qTokens = q.split(' ');
  const scored = [];
  for (const m of movies) {
    if (!qTokens.every(tok => m.norm.includes(tok))) continue;
    let score = 0;
    if (m.norm.startsWith(q)) score += 3;
    if (m.norm.includes(q)) score += 1;
    score += m.p / 200; // recognisability as a mild tiebreaker
    scored.push([score, m]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const out = [];
  const seen = new Set();
  for (const [, m] of scored) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

// Availability map so the UI can grey out empty combos (pre-difficulty).
export function comboCount(genre, era) {
  return filterPool({ genre, era, difficulty: 'any' }).length;
}
