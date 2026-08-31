// Text normalization shared by the game (guess matching / autocomplete) and
// the catalogue build script (dedupe keys).
// Goal: "WALL·E" and "walle" normalize to the same string, "Amélie" ->
// "amelie", "Rocky II" and "rocky 2" land on the same string, "Dune: Part Two"
// matches "dune part 2".

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

// Whole-word folds so sequels match however people type them. Single-letter
// romans (I, V, X) stay untouched — they're real words in titles ("V for
// Vendetta", "American History X"). Folding applies to titles AND guesses,
// so both sides always land on the same string.
const WORD_FOLDS = {
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
};

export function normalize(str) {
  if (!str) return '';
  let s = str.toLowerCase();
  for (const [re, rep] of SYMBOL_MAP) s = s.replace(re, rep);
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // fold diacritics
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  // fold spelled-out acronyms: "e t" -> "et", so "E.T." and "et" match
  s = s.replace(/\b([a-z0-9]) (?=[a-z0-9]\b)/g, '$1');
  s = s.split(' ').map(w => WORD_FOLDS[w] || w).join(' ');
  return s;
}

// Identity key for a film. Year included so remakes ("Dune" 1984 / 2021)
// stay distinct entries.
export function movieKey(title, year) {
  return normalize(title) + '|' + (year || '');
}
