// Currency chaos mode. Rates are APPROXIMATE and hard-coded on purpose —
// this is a game show, not a bureau de change; what matters is the order of
// magnitude staying funny ("guess this teapot in Vietnamese Đồng").
// Weighted toward high-multiplier currencies because big numbers = big laughs.

export const GBP = { code: "GBP", name: "British Pounds", symbol: "£", perGBP: 1, decimals: 2, weight: 0 };

export const CURRENCIES = [
  { code: "VND", name: "Vietnamese Đồng",    symbol: "₫",   perGBP: 33000, decimals: 0, weight: 3 },
  { code: "IDR", name: "Indonesian Rupiah",  symbol: "Rp",  perGBP: 21000, decimals: 0, weight: 3 },
  { code: "COP", name: "Colombian Pesos",    symbol: "COL$", perGBP: 5300, decimals: 0, weight: 2 },
  { code: "KRW", name: "South Korean Won",   symbol: "₩",   perGBP: 1800,  decimals: 0, weight: 2 },
  { code: "CLP", name: "Chilean Pesos",      symbol: "CLP$", perGBP: 1250, decimals: 0, weight: 2 },
  { code: "HUF", name: "Hungarian Forint",   symbol: "Ft",  perGBP: 480,   decimals: 0, weight: 2 },
  { code: "JPY", name: "Japanese Yen",       symbol: "¥",   perGBP: 195,   decimals: 0, weight: 2 },
  { code: "INR", name: "Indian Rupees",      symbol: "₹",   perGBP: 112,   decimals: 0, weight: 2 },
  { code: "PHP", name: "Philippine Pesos",   symbol: "₱",   perGBP: 76,    decimals: 0, weight: 1 },
  { code: "TRY", name: "Turkish Lira",       symbol: "₺",   perGBP: 55,    decimals: 0, weight: 1 },
  { code: "CZK", name: "Czech Koruna",       symbol: "Kč",  perGBP: 30,    decimals: 0, weight: 1 },
  { code: "ZAR", name: "South African Rand", symbol: "R",   perGBP: 24,    decimals: 0, weight: 1 },
  { code: "USD", name: "US Dollars",         symbol: "$",   perGBP: 1.35,  decimals: 2, weight: 1 },
  { code: "EUR", name: "Euros",              symbol: "€",   perGBP: 1.17,  decimals: 2, weight: 1 },
];

export function randomCurrency() {
  const total = CURRENCIES.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of CURRENCIES) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return CURRENCIES[0];
}

// GBP price → round number in the target currency. Snapped to the currency's
// decimals so "exact" is actually typeable.
export function convert(gbp, currency) {
  const raw = gbp * currency.perGBP;
  const f = 10 ** currency.decimals;
  return Math.round(raw * f) / f;
}

export function formatMoney(value, currency = GBP) {
  if (currency.code === "GBP" && value < 1) {
    return `${Math.round(value * 100)}p`;
  }
  const whole = Math.floor(value);
  const frac = Math.round((value - whole) * 100);
  const grouped = whole.toLocaleString("en-GB");
  const fracPart = currency.decimals === 2 && frac
    ? `.${String(frac).padStart(2, "0")}` : "";
  return `${currency.symbol}${grouped}${fracPart}`;
}
