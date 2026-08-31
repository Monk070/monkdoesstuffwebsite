// Text normalization shared by the game (guess matching / autocomplete) and the
// catalogue build script (dedupe keys, Deezer matching).
// Goal: "Ke$ha" and "Kesha" normalize to the same string, "P!nk" -> "pink",
// "Beyoncé" -> "beyonce", "Florence & The Machine" -> "florence and the machine".

const SYMBOL_MAP = [
  [/\$/g, 's'],
  [/!/g, 'i'],
  [/¡/g, 'i'],
  [/@/g, 'a'],
  [/€/g, 'e'],
  [/£/g, 'l'],
  [/&/g, ' and '],
  [/\+/g, ' and '],
  [/×/g, 'x'],
  [/Ø/g, 'o'],
  [/ø/g, 'o'],
  [/['’´`]/g, ''],
];

export function normalize(str) {
  if (!str) return '';
  let s = str.toLowerCase();
  for (const [re, rep] of SYMBOL_MAP) s = s.replace(re, rep);
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // fold diacritics
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  // fold spelled-out acronyms: "u s a" -> "usa", "a b c" -> "abc", so
  // "Surfin' U.S.A." and "surfin usa" land on the same string
  s = s.replace(/\b([a-z0-9]) (?=[a-z0-9]\b)/g, '$1');
  return s;
}

// Strip version decorations so remasters/edits dedupe to the original song.
export function stripDecorations(title) {
  if (!title) return '';
  let t = title;
  // parenthesised/bracketed qualifiers: (feat. X), (2011 Remaster), [Radio Edit]...
  t = t.replace(/\s*[(\[][^)\]]*\b(feat|ft|with|remaster|remastered|version|edit|mix|remix|mono|stereo|live|bonus|deluxe|single|radio|from|taken from|soundtrack)\b[^)\]]*[)\]]/gi, '');
  // trailing " - ..." qualifiers
  t = t.replace(/\s*-\s*(feat\.?|ft\.?)\s.+$/i, '');
  t = t.replace(/\s*-\s*\d{4}\s*(digital\s*)?remaster(ed)?( version)?$/i, '');
  t = t.replace(/\s*-\s*(digital\s*)?remaster(ed)?(\s*\d{4})?( version)?$/i, '');
  t = t.replace(/\s*-\s*(radio edit|single version|album version|original mix|extended mix|mono|stereo|live|remix|acoustic( version)?|bonus track|re-?recorded( version)?)$/i, '');
  // generic: drop any trailing " - ..." chunks that read like version credits,
  // e.g. "Love Is Gone - Fred Riester & Joachim Garraud Radio Edit Remix"
  const DASH_DECOR = /\b(feat|ft|with|from|theme|remaster(ed)?|version|edit|mix|remix|rework|dub|vip|mono|stereo|live|bonus|deluxe|single|radio|acoustic|instrumental|demo|sped up|slowed|extended|original|anniversary|session|soundtrack|(19|20)\d{2})\b/i;
  const parts = t.split(/\s+[-–—]\s+/);
  while (parts.length > 1 && DASH_DECOR.test(parts[parts.length - 1])) parts.pop();
  t = parts.join(' - ');
  return t.trim() || title;
}

// Identity key for a song: same song across remasters/reissues -> same key.
export function trackKey(title, artist) {
  return normalize(stripDecorations(title)) + '|' + normalize(artist);
}
