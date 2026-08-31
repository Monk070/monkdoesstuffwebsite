// Chat guess matching — forgiving on purpose (TikTok chat, phones, speed).
// A guess is correct if it names the film; the year is optional but may be
// appended to disambiguate remakes:
//   "!inception"                 -> title
//   "!the shining"               -> leading "the" optional both ways
//   "!endgame"                   -> subtitle after the colon is guessable
//   "!avengers"                  -> franchise head before the colon too
//   "!titanic 1997" / "!it 2017" -> year suffix accepted when it's right
// Wrong-but-close is handled with length-scaled edit distance, so "shawshank
// redemtion" lands, but "it" does NOT match "us".

import { normalize } from './normalize.js';

function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let cur = new Array(lb + 1);
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

function tolerance(len) {
  if (len >= 14) return 3;
  if (len >= 9) return 2;
  if (len >= 5) return 1;
  return 0;
}

function fuzzyEquals(a, b) {
  if (a === b) return true;
  const tol = tolerance(Math.max(a.length, b.length));
  if (Math.abs(a.length - b.length) > tol) return false;
  return levenshtein(a, b) <= tol;
}

const stripThe = (s) => s.replace(/^the /, '');

// A title's guessable forms. Split on colons and spaced dashes — franchise
// head and subtitle are both fair game ("Avengers: Endgame" accepts
// "avengers" and "endgame"), as are bracketed alternate titles ("Birdman or
// (The Unexpected Virtue of Ignorance)"). Segments under 3 normalized chars
// are dropped so "It: Chapter Two" can't be claimed by "!2".
function titleCandidates(rawTitle) {
  const raw = String(rawTitle || '');
  const out = new Set();
  const add = (s) => {
    const n = normalize(s);
    if (!n || n.length < 3) return;
    out.add(n);
    // a bracket/segment split can leave a dangling connector —
    // "Birdman or (The Unexpected Virtue...)" -> "birdman or" -> "birdman"
    const trimmed = n.replace(/ (or|and)$/, '');
    if (trimmed.length >= 3) out.add(trimmed);
  };
  const full = normalize(raw);
  if (full) out.add(full); // full title always guessable, even short ("Up", "It")
  const noBrackets = raw.replace(/\s*[(\[].*$/, '');
  add(noBrackets);
  for (const seg of noBrackets.split(/\s*:\s*|\s+[-–—]\s+/)) add(seg);
  for (const m of raw.matchAll(/[(\[]([^)\]]+)[)\]]/g)) add(m[1]);
  return [...out];
}

function titleEquals(gn, title) {
  if (fuzzyEquals(gn, title)) return true;
  // leading "the" optional in either direction
  const g2 = stripThe(gn), t2 = stripThe(title);
  if ((g2 !== gn || t2 !== title) && g2 && t2 && fuzzyEquals(g2, t2)) return true;
  return false;
}

export function guessMatches(rawGuess, movie) {
  let gn = normalize(rawGuess);
  if (!gn) return false;
  // a trailing year is fine when it's the film's year: "titanic 1997",
  // "the thing 82". Wrong years don't strip, so "blade runner 2049" survives.
  const y = String(movie.y || '');
  const m = gn.match(/^(.+?) ((?:19|20)\d{2}|\d{2})$/);
  if (m) {
    const yr = m[2].length === 2
      ? (Number(m[2]) <= 29 ? `20${m[2]}` : `19${m[2]}`)
      : m[2];
    if (yr === y) gn = m[1];
  }
  return titleCandidates(movie.t).some(title => titleEquals(gn, title));
}
