// Viewer settings commands: "!genre pop", "!era 2010", "!era 90s"...
// Deliberately forgiving — aliases, prefixes, small typos, and every way
// people write decades. Matched changes apply from the NEXT song.

import { normalize } from './normalize.js';
import { GENRES, ERAS } from './catalog.js';

const GENRE_ALIASES = {
  any: ['any', 'all', 'everything', 'random', 'mix'],
  pop: ['pop', 'popmusic', 'chart', 'charts'],
  rock: ['rock', 'rocknroll', 'rockandroll', 'classicrock'],
  hiphop: ['hiphop', 'hip', 'hh', 'oldschool', 'boombap'],
  rap: ['rap', 'rapmusic', 'trap', 'drill', 'grime'],
  dance: ['dance', 'edm', 'electronic', 'electro', 'house', 'techno', 'dnb', 'club', 'rave'],
  rnb: ['rnb', 'randb', 'rhythmandblues', 'soul'],
  country: ['country', 'western', 'countrymusic', 'folk'],
  indie: ['indie', 'alt', 'alternative', 'indiealt', 'indierock'],
  metal: ['metal', 'heavymetal', 'thrash', 'rockmetal'],
};

function lev(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let cur = new Array(lb + 1);
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

// "!genre pop" / "!genre hip hop" / "!genre eletronic" -> a GENRES entry
export function matchGenre(raw) {
  const q = normalize(raw).replace(/ /g, '');
  if (!q) return null;
  for (const g of GENRES) {
    const aliases = GENRE_ALIASES[g.key] || [normalize(g.label).replace(/ /g, '')];
    if (aliases.includes(q)) return g;
  }
  for (const g of GENRES) {
    for (const a of GENRE_ALIASES[g.key] || []) {
      if (q.length >= 3 && a.startsWith(q)) return g;
      if (q.length >= 4 && lev(q, a) <= (a.length >= 6 ? 2 : 1)) return g;
    }
  }
  return null;
}

const ERA_WORDS = {
  sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990,
  noughties: 2000, thousands: 2000, tens: 2010, twenties: 2020,
};

// "!era 2010" / "!era 10" / "!era 90s" / "!era 1995" / "!era eighties"
export function matchEra(raw) {
  const q = normalize(raw).replace(/ /g, '').replace(/s$/, '');
  if (!q) return null;
  if (['any', 'all', 'random', 'everything', 'mix'].includes(q)) return ERAS[0];
  for (const [word, decade] of Object.entries(ERA_WORDS)) {
    const w = word.replace(/s$/, '');
    if (q === w || (q.length >= 4 && (w.startsWith(q) || lev(q, w) <= 2))) return eraByKey(decade);
  }
  const digits = q.match(/\d{1,4}/)?.[0];
  if (!digits || digits.length === 3) return null;
  let year = Number(digits);
  if (digits.length <= 2) year = year <= 29 ? 2000 + year : 1900 + year;
  const decade = Math.floor(year / 10) * 10;
  return eraByKey(decade);
}

function eraByKey(decade) {
  return ERAS.find(e => e.key === decade) || null;
}

// One comment can carry both commands: "!genre pop !era 2010" (either
// order). Returns null when the comment isn't a settings command at all,
// or an array of matched { field, item } changes (possibly empty when the
// arguments didn't match anything). First mention of each field wins.
export function parseSettingCommands(text) {
  if (!/^!\s*(genre|era)\b/i.test(text)) return null;
  const out = [];
  for (const m of text.matchAll(/!\s*(genre|era)\b\s*([^!]*)/gi)) {
    const field = m[1].toLowerCase();
    if (out.some(c => c.field === field)) continue;
    const item = field === 'genre' ? matchGenre(m[2]) : matchEra(m[2]);
    if (item) out.push({ field, item });
  }
  return out;
}
