// Character + organic sprites, authored as string grids and compiled to
// offscreen canvases. Furniture is drawn procedurally in scene.js — grids are
// only for things with organic silhouettes (people, animals, plants, food).

import { PAL, SKINS, HAIR_COLORS, accentFor, skinFor, hairFor, hashStr } from "./palette.js";

export function darken(hex, f = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function lighten(hex, f = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + 255 * f * 0.5 + 20));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + 255 * f * 0.5 + 20));
  const b = Math.min(255, Math.round((n & 255) + 255 * f * 0.5 + 20));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function makeSprite(rows, map) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "." || ch === " ") continue;
      const col = map[ch];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

// ------------------------------------------------------------ customers ----
// NPC customers keep the simple all-hashed look; viewers get the layered
// player sprite below (which also seats itself on a stool via !customer).

const CUSTOMER_GRID = [
  "....RRRR....",
  "...RRRRRR...",
  "...RRRRRR...",
  "...rSSSSr...",
  "...SESSES...",
  "...SSssSS...",
  "....SSSS....",
  "..OOOOOOOO..",
  ".OOOOOOOOOO.",
  ".OoOOOOOOoO.",
  "..oOOOOOOo..",
  "...OOOOOO...",
  "...oo..oo...",
  "...BB..BB...",
];

const spriteCache = new Map();

export function customerSprite(name) {
  const key = "cust:" + name;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const accent = accentFor(name + "c"), skin = skinFor(name), hair = hairFor(name);
  const cv = makeSprite(CUSTOMER_GRID, {
    R: hair, r: darken(hair, 0.72),
    S: skin, s: darken(skin, 0.8), E: "#2c2030",
    O: accent, o: darken(accent, 0.7),
    B: "#3a2a30",
  });
  spriteCache.set(key, cv);
  return cv;
}

// ---- player sprites: composed from gender / skin / top / lower layers ----
// Viewers customize with !gender !skin !top !lower; choices persist per
// viewer (game.js, tiktokcafe.chars.v1) and follow them into every room.
// Uncustomized viewers get a stable hash-based look so the crowd still
// varies. 12×16 grid; layers paint in order so long hair drapes over the
// top and the chef's hat sits over the hair.

const PLAYER_W = 12, PLAYER_H = 16;

// sparse row-maps: { rowIndex: "12-char string" }
function paint(c, rows, cols) {
  for (const ry of Object.keys(rows)) {
    const str = rows[ry], y = +ry;
    for (let x = 0; x < str.length; x++) {
      const col = cols[str[x]];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
  }
}

const P_HEAD = {
  3: "...SSSSSS...",
  4: "...SESSES...",
  5: "...SSssSS...",
  6: "....SSSS....",
};

// !top — tee, striped tee, hoodie, jacket (accent colour stays hashed per
// name so a viewer's character remains recognizable; the cut changes)
const P_TOPS = [
  { // tee
    7:  "..TTTTTTTT..",
    8:  ".TTTTTTTTTT.",
    9:  ".TtTTTTTTtT.",
    10: "..tTTTTTTt..",
    11: "...TTTTTT...",
  },
  { // striped tee
    7:  "..TTTTTTTT..",
    8:  ".TwwwwwwwwT.",
    9:  ".TtTTTTTTtT.",
    10: "..twwwwwwt..",
    11: "...TTTTTT...",
  },
  { // hoodie — hood edges beside the head + drawstrings
    2:  "..T......T..",
    3:  "..T......T..",
    7:  ".TTTTTTTTTT.",
    8:  ".TTTwTTwTTT.",
    9:  ".TtTTTTTTtT.",
    10: "..tTTTTTTt..",
    11: "...TTTTTT...",
  },
  { // jacket — light collar + dark zip line
    7:  "..TTTwwTTT..",
    8:  ".TTTTzzTTTT.",
    9:  ".TtTTzzTTtT.",
    10: "..tTTzzTTt..",
    11: "...TTzzTT...",
  },
];
const TOP_COUNT = P_TOPS.length;

// !lower — jeans, shorts, dress (each has its own colours; the dress is
// accent-hashed so it varies per viewer)
const P_LOWERS = [
  { // jeans
    12: "...JJJJJJ...",
    13: "...JJ..JJ...",
    14: "...jJ..Jj...",
    15: "...BB..BB...",
  },
  { // shorts
    12: "...JJJJJJ...",
    13: "...JJ..JJ...",
    14: "...SS..SS...",
    15: "...BB..BB...",
  },
  { // dress
    12: "..DDDDDDDD..",
    13: ".DDDDDDDDDD.",
    14: "...SS..SS...",
    15: "...BB..BB...",
  },
];
const LOWER_COLS = [
  { J: "#4e6a94", j: "#3a5074" },   // denim
  { J: "#b09a72", j: "#8f7a55" },   // khaki
  {},                                // dress paints with D
];
const LOWER_COUNT = P_LOWERS.length;

// !hairstyle — indexes 0–2 double as the gender defaults (GENDER_HAIR), so
// keep short/shaggy/long first. An explicit !hairstyle pick overrides the
// gender default and survives later !gender changes.
export const HAIRSTYLE_LABELS = [
  "short", "shaggy", "long", "bob", "ponytail", "bun", "spiky", "afro", "buzz cut",
];
const P_HAIRS = [
  { // short
    1: "....HHHH....",
    2: "...HHHHHH...",
    3: "...H....H...",
  },
  { // shaggy (medium)
    0: "....HHHH....",
    1: "...HHHHHH...",
    2: "..HHHHHHHH..",
    3: "..HH....HH..",
    4: "..H......H..",
  },
  { // long — drapes over the shoulders
    0: "....HHHH....",
    1: "...HHHHHH...",
    2: "..HHHHHHHH..",
    3: "..HH....HH..",
    4: "..HH....HH..",
    5: "..HH....HH..",
    6: "..HH....HH..",
    7: "..HH....HH..",
    8: "..H......H..",
  },
  { // bob — full sides, curls in at the jaw
    0: "....HHHH....",
    1: "...HHHHHH...",
    2: "..HHHHHHHH..",
    3: "..HH....HH..",
    4: "..HH....HH..",
    5: "..HH....HH..",
    6: "..HHH..HHH..",
  },
  { // ponytail — short on top, tail swinging off the right
    0: "....HHHH....",
    1: "...HHHHHH.H.",
    2: "...HHHHHHHH.",
    3: "...H....H.H.",
    4: "..........H.",
    5: "..........H.",
  },
  { // bun — topknot
    0: ".....HH.....",
    1: "....HHHH....",
    2: "...HHHHHH...",
    3: "...H....H...",
  },
  { // spiky
    0: "...H.H.H....",
    1: "...HHHHHH...",
    2: "...HHHHHH...",
    3: "...H....H...",
  },
  { // afro — big and round
    0: "..HHHHHHHH..",
    1: ".HHHHHHHHHH.",
    2: ".HHHHHHHHHH.",
    3: ".HH......HH.",
    4: ".H........H.",
  },
  { // buzz cut — a whisper of hair
    2: "...HHHHHH...",
  },
];
export const HAIRSTYLE_COUNT = P_HAIRS.length;
export const HAIRCOLOUR_COUNT = HAIR_COLORS.length;

// !gender — hair style + optional pride pin on the chest. Pins are strictly
// opt-in: hash-default characters only ever roll male/female (no pin), so
// nobody gets an identity they didn't choose.
export const GENDER_LABELS = ["male", "female", "non-binary", "trans male", "trans female"];
const P_GENDERS = [
  { hair: 0, pin: null },        // male
  { hair: 2, pin: null },        // female
  { hair: 1, pin: "nb" },        // non-binary
  { hair: 0, pin: "trans" },     // trans male
  { hair: 2, pin: "trans" },     // trans female
];
const PINS = {
  trans: ["#5bcefa", "#f5a9b8", "#ffffff"],
  nb:    ["#fff430", "#9c59d1", "#2c2c2c"],
};
export const GENDER_COUNT = P_GENDERS.length;
export const SKIN_COUNT = SKINS.length;
export { TOP_COUNT, LOWER_COUNT };

// Default hairstyle per gender (used until the viewer picks a !hairstyle).
export const GENDER_HAIR = P_GENDERS.map(g => g.hair);

// chef's toque, overlaid on the hair when working kitchen/counter
const HAT_ROWS = {
  0: "....HHHH....",
  1: "...HHHHHH...",
  2: "...hHHHHh...",
  3: "....hhhh....",
};
const HAT_COLS = {
  chef: { H: "#f2ede4", h: "#cfc6b5" },
  gold: { H: "#f2c14e", h: "#c8963a" },
};

// !ghost — the whole body becomes a ghost (outfit hidden; the chef hat still
// perches on top, which is the correct amount of silly). view.js adds the
// in-place wiggle + translucency.
const GHOST_ROWS = {
  1:  "...GGGGGG...",
  2:  "..GGGGGGGG..",
  3:  ".GGGGGGGGGG.",
  4:  ".GGEGGGGEGG.",
  5:  ".GGGGGGGGGG.",
  6:  ".GGGGmmGGGG.",
  7:  ".GGGGGGGGGG.",
  8:  ".GGGGGGGGGG.",
  9:  ".GGGGGGGGGG.",
  10: ".GGGGGGGGGG.",
  11: ".GGGGGGGGGG.",
  12: ".GGGGGGGGGG.",
  13: ".gGGGGGGGGg.",
  14: ".GG.GG.GG.G.",
};
const GHOST_COLS = { G: "#eef2fa", g: "#c8d2e8", E: "#2c2030", m: "#8a96b8" };

// !alien — green skin, big black eyes, antennae (no hair; outfit stays)
const ALIEN_SKIN = "#7cd45f";
const ALIEN_FACE = {
  4: "...EE..EE...",
  5: "....E..E....",
};
const ALIEN_ANTENNA = {
  0: "...G....G...",
  1: "....g..g....",
  2: "....g..g....",
};
const ALIEN_COLS = { G: "#aef29a", g: "#4e9c50" };

// Hash-default style for a viewer who never customized (male/female only,
// jeans/shorts only, natural hair colours only — dresses, pins and bright
// hair are opt-in choices).
export function defaultStyle(name) {
  return {
    gender: hashStr(name + "g") % 2,
    skin:   hashStr(name + "s") % SKINS.length,
    top:    hashStr(name + "t") % TOP_COUNT,
    lower:  hashStr(name + "l") % 2,
    haircolour: hashStr(name + "h") % 4,   // brown/blonde/red/black
    hairstyle: null,                       // null = follow the gender default
  };
}

// The one sprite a viewer wears in every room.
// hat: null | "chef" | "gold"
// style: { gender, skin, top, lower, haircolour, hairstyle, form }
export function playerSprite(name, { hat = null, style = null } = {}) {
  const st = style ?? defaultStyle(name);
  const g = P_GENDERS[st.gender % P_GENDERS.length];
  const hairstyle = (st.hairstyle ?? g.hair) % HAIRSTYLE_COUNT;
  const haircolour = (st.haircolour ?? 0) % HAIRCOLOUR_COUNT;
  const form = st.form ?? null;
  const key = `pl:${name}:${hat ?? ""}:${st.gender}.${st.skin}.${st.top}.${st.lower}.${hairstyle}.${haircolour}.${form ?? ""}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const cv = document.createElement("canvas");
  cv.width = PLAYER_W;
  cv.height = PLAYER_H;
  const c = cv.getContext("2d");

  if (form === "ghost") {
    paint(c, GHOST_ROWS, GHOST_COLS);
    if (hat && HAT_COLS[hat]) paint(c, HAT_ROWS, HAT_COLS[hat]);
    spriteCache.set(key, cv);
    return cv;
  }

  const skin = form === "alien" ? ALIEN_SKIN : SKINS[st.skin % SKINS.length];
  const accent = accentFor(name);
  const hair = HAIR_COLORS[haircolour];

  paint(c, P_HEAD, { S: skin, s: darken(skin, 0.8), E: "#2c2030" });
  paint(c, P_TOPS[st.top % TOP_COUNT], {
    T: accent, t: darken(accent, 0.7),
    w: lighten(accent, 0.35), z: darken(accent, 0.45),
  });
  paint(c, P_LOWERS[st.lower % LOWER_COUNT], {
    ...LOWER_COLS[st.lower % LOWER_COUNT],
    S: skin, B: "#3a2a30", D: accentFor(name + "d"),
  });
  if (form === "alien") {
    paint(c, ALIEN_FACE, { E: "#101418" });
    paint(c, ALIEN_ANTENNA, ALIEN_COLS);
  } else {
    paint(c, P_HAIRS[hairstyle], { H: hair, h: darken(hair, 0.72) });
    if (g.pin) {
      PINS[g.pin].forEach((col, i) => { c.fillStyle = col; c.fillRect(3, 8 + i, 1, 1); });
    }
  }
  if (hat && HAT_COLS[hat]) paint(c, HAT_ROWS, HAT_COLS[hat]);

  spriteCache.set(key, cv);
  return cv;
}

// ------------------------------------------------------------ mini pets ----
// !adoptcat / !adoptdog / !adoptbunny — a tiny companion drawn at its
// owner's feet (view.js), following them from room to room.

const MINI_CAT = [
  ".C.C....",
  ".CCC....",
  ".CzC....",
  ".CCC..C.",
  ".CCCCCC.",
  ".CCCCC..",
  ".C..C...",
];
const MINI_DOG = [
  "........",
  "cCCC....",
  "NCzC....",
  ".CCC..C.",
  ".CCCCCC.",
  ".CCCCC..",
  ".C..C...",
];
const MINI_BUNNY = [
  ".C.C....",
  ".C.C....",
  ".CzC....",
  ".CCC....",
  ".CCCCN..",
  ".CCCC...",
  ".C.C....",
];

export const MINI_PETS = {
  cat:   makeSprite(MINI_CAT, furMap(PAL.catOrange)),
  dog:   makeSprite(MINI_DOG, furMap("#a9713f")),
  bunny: makeSprite(MINI_BUNNY, furMap("#f0ece0")),
};

// --------------------------------------------------------- loft animals ----
// !animal cycles the loft residents: cats → dogs → rabbits. All grids keep
// their eyes in the same cells (lie: row 2 cols 1–2, sit: row 2 cols 2/4) so
// the vibe-zero crying tears in scene.js line up for every species.

const CAT_LIE_A = [
  ".C.C............",
  "CCCC............",
  "CzzC.........C..",
  "cCCCCCCCCCC.C...",
  "CCCCCCCCCCCCC...",
  "CCCCCCCCCCCC....",
  "cCCCCCCCCCCc....",
  ".Cc..Cc..Cc.....",
];
const CAT_LIE_B = [
  ".C.C............",
  "CCCC............",
  "CzzC............",
  "cCCCCCCCCCC.....",
  "CCCCCCCCCCCCCC..",
  "CCCCCCCCCCCC.C..",
  "cCCCCCCCCCCc....",
  ".Cc..Cc..Cc.....",
];
const CAT_SIT_A = [
  ".C..C.....",
  ".CCCC.....",
  ".CECE.....",
  ".CCCC..N..",
  "..CC......",
  ".CCCC..C..",
  "CCCCCC.C..",
  "CCCCCC.C..",
  "cCCCCcC...",
  ".C..C.....",
];
const CAT_SIT_B = [
  ".C..C.....",
  ".CCCC.....",
  ".CECE.....",
  ".CCCC.....",
  "..CC......",
  ".CCCC.....",
  "CCCCCC.C..",
  "CCCCCC..C.",
  "cCCCCc..C.",
  ".C..C.....",
];

// dogs — floppy ears, snout with a nose, waggy tail
const DOG_LIE_A = [
  ".cc.............",
  ".CCC............",
  "CzzCC........C..",
  "NCCCCCCCCCCCC...",
  "CCCCCCCCCCCCC...",
  "CCCCCCCCCCCC....",
  "cCCCCCCCCCCc....",
  ".Cc..Cc..Cc.....",
];
const DOG_LIE_B = [
  ".cc.............",
  ".CCC............",
  "CzzCC...........",
  "NCCCCCCCCCCCC...",
  "CCCCCCCCCCCCCC..",
  "CCCCCCCCCCCC.C..",
  "cCCCCCCCCCCc....",
  ".Cc..Cc..Cc.....",
];
const DOG_SIT_A = [
  ".C..C.....",
  "cCCCCc....",
  ".CECE.....",
  ".CCCC.....",
  ".NCC......",
  ".CCCC.....",
  "CCCCCC.C..",
  "CCCCCC.C..",
  "cCCCCcC...",
  ".C..C.....",
];
const DOG_SIT_B = [
  ".C..C.....",
  "cCCCCc....",
  ".CECE.....",
  ".CCCC.....",
  ".NCC......",
  ".CCCC.....",
  "CCCCCC....",
  "CCCCCC.C..",
  "cCCCCc..C.",
  ".C..C.....",
];

// rabbits — tall ears (they twitch between frames), cotton tail
const RAB_LIE_A = [
  ".C.C............",
  ".C.C............",
  "CzzC............",
  "CCCCCCCCCCC.....",
  "CCCCCCCCCCCCN...",
  "CCCCCCCCCCCC....",
  "cCCCCCCCCCc.....",
  ".Cc..Cc.........",
];
const RAB_LIE_B = [
  "................",
  ".C.C............",
  "CzzC............",
  "CCCCCCCCCCC.....",
  "CCCCCCCCCCCCN...",
  "CCCCCCCCCCCC....",
  "cCCCCCCCCCc.....",
  ".Cc..Cc.........",
];
const RAB_SIT_A = [
  ".C..C.....",
  ".C..C.....",
  ".CECE.....",
  ".CCCC.....",
  "..CC......",
  ".CCCC.....",
  "CCCCCC....",
  "CCCCCCN...",
  "cCCCCc....",
  ".C..C.....",
];
const RAB_SIT_B = [
  ".C..C.....",
  ".C..CC....",
  ".CECE.....",
  ".CCCC.....",
  "..CC......",
  ".CCCC.....",
  "CCCCCC....",
  "CCCCCCN...",
  "cCCCCc....",
  ".C..C.....",
];

function furMap(fur) {
  return {
    C: fur, c: darken(fur, 0.75),
    z: darken(fur, 0.5),           // closed eyes
    E: "#3a2f1a",                  // open eyes
    N: PAL.catInner,               // nose / cotton tail
  };
}

function pair(a, b, fur) {
  return [makeSprite(a, furMap(fur)), makeSprite(b, furMap(fur))];
}

// Three residents per species: two lying (tree + rug), one sitting (shelf).
export const ANIMALS = {
  cats: {
    lie1: pair(CAT_LIE_A, CAT_LIE_B, PAL.catOrange),
    lie2: pair(CAT_LIE_A, CAT_LIE_B, PAL.catGrey),
    sit:  pair(CAT_SIT_A, CAT_SIT_B, PAL.catCream),
  },
  dogs: {
    lie1: pair(DOG_LIE_A, DOG_LIE_B, "#a9713f"),
    lie2: pair(DOG_LIE_A, DOG_LIE_B, PAL.catGrey),
    sit:  pair(DOG_SIT_A, DOG_SIT_B, PAL.catCream),
  },
  rabbits: {
    lie1: pair(RAB_LIE_A, RAB_LIE_B, "#f0ece0"),
    lie2: pair(RAB_LIE_A, RAB_LIE_B, "#b5793f"),
    sit:  pair(RAB_SIT_A, RAB_SIT_B, PAL.catGrey),
  },
};

// --------------------------------------------------------------- plants ----

const POTTED_PLANT = [
  "...L.LL...",
  "..LLLLLL..",
  ".LLlLLlLL.",
  "..LLLLLL..",
  "...lLLl...",
  "....ll....",
  "..TTTTTT..",
  "..TttttT..",
  "...TTTT...",
];

const HANGING_PLANT = [
  "....##....",
  "...T##T...",
  "..TTTTTT..",
  "..LLLLLL..",
  ".Ll.LL.lL.",
  ".L..lL..L.",
  "....L...l.",
  "....l.....",
];

const TOMATO_PLANT = [
  "..L..R..",
  ".LLLLLL.",
  "RLlLLlL.",
  ".LLRLLL.",
  "..lLl...",
  "...l....",
];

const HERB_PLANT = [
  ".L.L.L.",
  ".lLlLl.",
  "..lll..",
  "...l...",
];

const plantMap = {
  L: PAL.leafLight, l: PAL.leaf, R: PAL.tomato,
  T: PAL.terracotta, t: darken(PAL.terracotta, 0.75),
  "#": PAL.woodOutline,
};

export const PLANTS = {
  potted:  makeSprite(POTTED_PLANT, plantMap),
  hanging: makeSprite(HANGING_PLANT, plantMap),
  tomato:  makeSprite(TOMATO_PLANT, plantMap),
  herb:    makeSprite(HERB_PLANT, plantMap),
};

// ----------------------------------------------------------------- food ----

const DISH_GRIDS = {
  toastie: [
    "..bbbb..",
    ".bccccb.",
    "bcccccb.",
    ".bbbbbb.",
    "pppppppp",
  ],
  soup: [
    "..ssss..",
    ".swwwws.",
    ".ssssss.",
    "pppppppp",
  ],
  pancakes: [
    "..gggg..",
    ".cccccc.",
    ".cccccc.",
    "pppppppp",
  ],
  cookies: [
    ".kk..kk.",
    ".kk..kk.",
    "pppppppp",
  ],
};

const dishMap = {
  b: PAL.crumb, c: lighten(PAL.crumb, 0.3), p: "#e8e4f0",
  s: PAL.tomato, w: PAL.cream, g: PAL.coin, k: darken(PAL.crumb, 0.85),
};

export const DISHES = Object.fromEntries(
  Object.entries(DISH_GRIDS).map(([k, g]) => [k, makeSprite(g, dishMap)])
);

// Burnt version of any dish: same silhouette, charcoal colors.
const burntMap = { b: "#3a3440", c: "#4a4450", p: "#e8e4f0", s: "#3a3440", w: "#4a4450", g: "#3a3440", k: "#2c2830" };
export const DISHES_BURNT = Object.fromEntries(
  Object.entries(DISH_GRIDS).map(([k, g]) => [k, makeSprite(g, burntMap)])
);

// Small pose variety: pick a stable per-user flip so lines of chefs don't
// look like clones.
export function flipFor(name) { return hashStr(name + "f") % 2 === 0; }
