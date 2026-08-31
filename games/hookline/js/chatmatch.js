// Chat guess matching — forgiving on purpose (TikTok chat, phones, speed).
// A guess is correct if it names the song title; the artist is optional but
// may be appended in any reasonable form:
//   "!can't stop"                          -> title only
//   "!cant stop red hot chili peppers"     -> title + artist
//   "!can't stop - Red hot chilli peppers" -> separator + misspelling
//   "!can't stop rhcp"                     -> artist initials
// Wrong-but-close is handled with length-scaled edit distance, so "chilli"
// lands on "chili" but "can't stop the feeling" does NOT match "can't stop".

import { normalize, stripDecorations } from './normalize.js';

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

function initialsOf(s) {
  return s.split(' ').map(w => w[0]).join('');
}

// every token of `rest` matches some token of `artist` (fuzzy for len>=3)
function tokensSubset(rest, artist) {
  const artistTokens = artist.split(' ');
  return rest.split(' ').every(rt =>
    artistTokens.some(at => rt === at || (rt.length >= 3 && fuzzyEquals(rt, at))),
  );
}

function restMatchesArtist(rest, artist) {
  if (!rest) return true; // no artist given — title alone is enough
  if (fuzzyEquals(rest, artist)) return true;
  if (rest.replace(/ /g, '') === initialsOf(artist)) return true; // "rhcp"
  if (tokensSubset(rest, artist)) return true; // "chili peppers"
  return false;
}

// Official titles are often over-specified vs what a song is known as:
// "Stateside + Zara Larsson", "Freed From Desire x Whistle", "Title with X".
// Accept a guess matching the part BEFORE a connector word, as long as the
// guess is substantial (3+ chars) so "me" can't claim "Me and Your Mama".
const CONNECTORS = new Set(['and', 'x', 'feat', 'ft', 'featuring', 'with', 'vs', 'versus']);

function matchesTitleCore(gn, title) {
  if (fuzzyEquals(gn, title)) return true;
  if (gn.length < 3) return false;
  const tTokens = title.split(' ');
  const gCount = gn.split(' ').length;
  if (gCount >= tTokens.length) return false;
  const next = tTokens[gCount];
  if (!CONNECTORS.has(next)) return false;
  return fuzzyEquals(gn, tTokens.slice(0, gCount).join(' '));
}

// A title's guessable forms: the full (decoration-stripped) title, the part
// before any bracketed section, and each bracketed section that is a real
// alternate title rather than a qualifier. "we can't be friends (wait for
// your love)" accepts both halves; "Escape (The Piña Colada Song)" accepts
// "escape" and "the pina colada song"; "(feat. X)" stays a qualifier.
const DECOR_RE = /\b(feat|ft|with|remaster|remastered|version|edit|mix|remix|mono|stereo|live|bonus|deluxe|single|radio|from|taken from|soundtrack)\b/i;
// dash tails that are song structure, not names — never guessable on their own
const TAIL_STOP = /\b(pt|part|vol|volume|no|reprise|skit|interlude|outtake|b side|acappella|a cappella|official|minus|dj tool|recorded|including)\b/i;

function titleCandidates(rawTitle, artist) {
  const raw = String(rawTitle || '');
  const out = new Set();
  const full = normalize(stripDecorations(raw));
  if (full) out.add(full);
  const before = normalize(stripDecorations(raw.replace(/\s*[(\[].*$/, '')));
  if (before) out.add(before);
  // the head before any " - " suffix is always guessable — dash tails are
  // version/credit noise in practice, whatever words they happen to use.
  // A tail that ISN'T noise is an alternate title ("Lady - Hear Me Tonight")
  // and becomes guessable too, unless it's structural (Pt. 1, Interlude...)
  // or just names the artist.
  const segs = raw.split(/\s+[-–—]\s+/);
  if (segs.length > 1) {
    const h = normalize(stripDecorations(segs[0].replace(/\s*[(\[].*$/, '')));
    if (h && h.length >= 3) out.add(h);
    const an = normalize(artist || '');
    for (const seg of segs.slice(1)) {
      if (DECOR_RE.test(seg)) continue;
      const s = normalize(seg);
      if (!s || s.length < 4 || TAIL_STOP.test(s)) continue;
      if (an && (s.includes(an) || an.includes(s))) continue;
      out.add(s);
    }
  }
  for (const m of raw.matchAll(/[(\[]([^)\]]+)[)\]]/g)) {
    if (DECOR_RE.test(m[1])) continue;
    const inner = normalize(m[1]);
    if (inner) out.add(inner);
  }
  return [...out];
}

export function guessMatches(rawGuess, track) {
  const gn = normalize(rawGuess);
  if (!gn) return false;
  const artist = normalize(track.a);
  return titleCandidates(track.t, track.a).some(title => matchesTitle(gn, title, artist));
}

function matchesTitle(gn, title, artist) {
  if (!title) return false;

  // whole guess == title (fuzzy), or the title's core before a connector
  if (matchesTitleCore(gn, title)) return true;

  // title with connector words dropped: "stateside zara larsson"
  const noConn = title.split(' ').filter(w => !CONNECTORS.has(w)).join(' ');
  if (noConn !== title && fuzzyEquals(gn, noConn)) return true;

  // split guess into candidate title + remainder; try both orders.
  const gTokens = gn.split(' ');
  const tCount = title.split(' ').length;
  for (const k of [tCount, tCount + 1, tCount - 1]) {
    if (k < 1 || k >= gTokens.length + 1) continue;
    // title first: "cant stop rhcp"
    const head = gTokens.slice(0, k).join(' ');
    const tail = gTokens.slice(k).join(' ');
    if (fuzzyEquals(head, title) && restMatchesArtist(tail, artist)) return true;
    // artist first: "rhcp cant stop"
    const tail2 = gTokens.slice(gTokens.length - k).join(' ');
    const head2 = gTokens.slice(0, gTokens.length - k).join(' ');
    if (fuzzyEquals(tail2, title) && restMatchesArtist(head2, artist)) return true;
  }

  // last resort for shortened guesses of long over-specified titles:
  // guess-head + artist where the head is the title core ("stateside pinkpantheress")
  for (const k of [1, 2, 3]) {
    if (k >= gTokens.length) break;
    const head = gTokens.slice(0, k).join(' ');
    const tail = gTokens.slice(k).join(' ');
    if (matchesTitleCore(head, title) && restMatchesArtist(tail, artist)) return true;
  }
  return false;
}
