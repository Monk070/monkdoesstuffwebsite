// Chat message → price guess. Strict about SHAPE (the message must BE a
// price, not merely contain one, so ordinary chatter doesn't count) but
// forgiving about FORMAT — property prices arrive in every notation chat
// can invent:
//
//   2.50  £3  50p  4 quid                        (car-boot items)
//   395000  395,000  !395k  £395,000             (houses)
//   1250000  1.25m  1.5 mil  2 grand
//   1 million 200        → 1,200,000   (bare number after "million" reads
//   1million 250 thousand → 1,250,000   as thousands — how people say it)
//   9.6b  9 billion 600                          (houses priced in Đồng)
//
// A leading "!" is allowed everywhere (viewers treat guesses as commands).
// maxGuess is per-round: currency chaos mode raises it (a house in
// Vietnamese Đồng is legitimately ten billion).

export const MAX_GUESS = 100_000_000;

// Plain money: "2.50", "£3", "50p", "4 quid", "395,000"
const PLAIN = new RegExp(
  "^\\s*!?\\s*£?\\s*" +
  "(\\d{1,3}(?:,\\d{3})+|\\d{1,13})" +  // whole part, optional thousands commas
  "(?:\\.(\\d{1,2}))?" +                // optional pence
  "\\s*(p|quid|pounds?)?\\s*!?\\s*$",
  "i",
);

// Unit words → multiplier. "grand" is UK for £1000.
const UNITS = {
  billion: 1e9, bn: 1e9, b: 1e9,
  million: 1e6, mil: 1e6, m: 1e6,
  thousand: 1e3, k: 1e3, grand: 1e3,
};
const UNIT_WORDS = "billion|bn|b|million|mil|m|thousand|k|grand";
const PAIR = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})?`, "gi");
const UNITS_SHAPE = new RegExp(`^(?:\\s*\\d+(?:\\.\\d+)?\\s*(?:${UNIT_WORDS})?\\s*)+$`, "i");
const STEP_DOWN = { 1e9: 1e6, 1e6: 1e3, 1e3: 1 };

function finish(value, maxGuess) {
  if (!Number.isFinite(value) || value <= 0 || value > maxGuess) return null;
  return Math.round(value * 100) / 100;
}

// Returns the guess as a number (in the round's currency), or null if the
// message isn't a price.
export function parseGuess(text, maxGuess = MAX_GUESS) {
  const raw = String(text ?? "");

  const plain = raw.match(PLAIN);
  if (plain) {
    const whole = Number(plain[1].replace(/,/g, ""));
    const pence = plain[2] ? Number(`0.${plain[2]}`) : 0;
    let value = whole + pence;
    if (plain[3]?.toLowerCase() === "p") {
      if (plain[2]) return null;         // "2.50p" is nonsense — reject
      value = whole / 100;
    }
    return finish(value, maxGuess);
  }

  // Unit notation: strip decorations, then the WHOLE string must be
  // (number unit?) pairs — leftovers mean it's chatter, not a guess.
  const s = raw.trim()
    .replace(/^!\s*/, "")
    .replace(/£/g, "")
    .replace(/(\d),(\d{3})\b/g, "$1$2")  // thousands commas inside numbers
    .replace(/[!.\s]+$/, "");
  if (!UNITS_SHAPE.test(s)) return null;

  const pairs = [...s.matchAll(PAIR)].filter(m => m[0].trim());
  if (!pairs.length || pairs.length > 3) return null;
  if (!pairs.some(m => m[2])) return null;      // no unit at all → PLAIN's job

  let total = 0;
  let prevMult = Infinity;
  for (let i = 0; i < pairs.length; i++) {
    const num = Number(pairs[i][1]);
    let mult;
    if (pairs[i][2]) {
      mult = UNITS[pairs[i][2].toLowerCase()];
      if (mult >= prevMult) return null;        // "500k 1 million" — gibberish
    } else {
      if (i === 0) return null;                 // bare first number needs a unit here
      // bare follower steps down: after billions read millions ("9b 600"),
      // after millions read thousands ("1m 200"), after thousands read
      // pounds ("1 grand 50")
      mult = STEP_DOWN[prevMult] ?? 1;
      if (num >= 1000) return null;             // "1m 5000" — ambiguous, reject
    }
    total += num * mult;
    prevMult = mult;
  }
  return finish(total, maxGuess);
}

// GBP-only convenience formatter (currency.js formatMoney handles the rest).
export function formatPrice(value) {
  if (value >= 1) {
    const pounds = Math.floor(value);
    const pence = Math.round((value - pounds) * 100);
    const grouped = pounds.toLocaleString("en-GB");
    return pence ? `£${grouped}.${String(pence).padStart(2, "0")}` : `£${grouped}`;
  }
  return `${Math.round(value * 100)}p`;
}
