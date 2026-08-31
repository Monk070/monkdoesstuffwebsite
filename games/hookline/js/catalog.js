import { normalize, stripDecorations, trackKey } from './normalize.js';
import { isBannedTitle, collidesWithCommands } from './moderation.js';

export const GENRES = [
  { key: 'any', label: 'Any' },
  { key: 'pop', label: 'Pop' },
  { key: 'rock', label: 'Rock' },
  { key: 'hiphop', label: 'Hip-Hop' },
  { key: 'rap', label: 'Rap' },
  { key: 'dance', label: 'Dance/Electronic' },
  { key: 'rnb', label: 'R&B' },
  { key: 'country', label: 'Country' },
  { key: 'indie', label: 'Indie/Alt' },
  { key: 'metal', label: 'Metal' },
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

let tracks = [];
let meta = { generatedAt: null };

export async function loadCatalog() {
  const res = await fetch('./data/catalog.json');
  const data = await res.json();
  meta = data;
  // drop songs viewers can't guess in chat: titles TikTok blocks, and titles
  // that collide with the !skip command
  const usable = (data.tracks || []).filter(t => !isBannedTitle(t.t) && !collidesWithCommands(t.t));
  tracks = usable.map(t => ({
    ...t,
    decade: Math.floor(t.y / 10) * 10,
    key: trackKey(t.t, t.a),
    // searchable haystack: full title + artist + decoration-stripped title
    norm: normalize(t.t + ' ' + t.a) + ' ' + normalize(stripDecorations(t.t)),
  }));
  return { count: tracks.length, generatedAt: data.generatedAt };
}

export function catalogSize() { return tracks.length; }
export function allTracks() { return tracks; }

// Pool of possible answers for the current settings. Difficulty = quantile of
// Spotify popularity *within* the genre/era-filtered pool, so "Easy 80s Metal"
// means the best-known 80s metal, not globally famous songs that happen to be metal.
export function filterPool({ genre, era, difficulty }) {
  let pool = tracks;
  if (genre && genre !== 'any') pool = pool.filter(t => t.g.includes(genre));
  if (era && era !== 'any') pool = pool.filter(t => t.decade === era);
  if (difficulty && difficulty !== 'any' && pool.length >= MIN_POOL) {
    const sorted = [...pool].sort((a, b) => b.p - a.p);
    const i = DIFFICULTIES.findIndex(d => d.key === difficulty);
    const n = sorted.length;
    pool = sorted.slice(Math.floor((n * i) / 5), Math.floor((n * (i + 1)) / 5));
  }
  return pool;
}

// Autocomplete over the ENTIRE catalogue (never just the answer pool — that
// would leak the answer). Returns up to `limit` tracks, deduped by song key.
export function suggest(query, limit = 8) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const qTokens = q.split(' ');
  const scored = [];
  for (const t of tracks) {
    if (!qTokens.every(tok => t.norm.includes(tok))) continue;
    let score = 0;
    if (t.norm.startsWith(q)) score += 3;
    if (normalize(t.a).startsWith(q)) score += 2;
    if (t.norm.includes(q)) score += 1;
    score += t.p / 200; // popularity as a mild tiebreaker
    scored.push([score, t]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const out = [];
  const seen = new Set();
  for (const [, t] of scored) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// Availability map so the UI can grey out empty combos (pre-difficulty).
export function comboCount(genre, era) {
  return filterPool({ genre, era, difficulty: 'any' }).length;
}
