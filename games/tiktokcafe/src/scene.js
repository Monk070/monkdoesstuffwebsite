// The café itself — a dollhouse cutaway, four rooms in a 2×2 grid.
// Static architecture renders once into an offscreen canvas; drawAmbient()
// layers the living details (fire, steam, cats, bulbs, clouds) every frame.
//
// TikTok-safe zone: the middle 55% of the 360×640 canvas (y ≈ 144–496).
// The building lives entirely inside it; sky and street are sacrificial.

import { PAL } from "./palette.js";
import { PLANTS, ANIMALS, darken, lighten } from "./sprites.js";
import { settings } from "./settings.js";

export const W = 360, H = 640;

// ------------------------------------------------------- scene themes ----
// The world outside the café (⚙ Settings → Background, or ?theme=).
// The building interior stays warm and lamplit in every theme.

const SCENES = {
  night: {
    sky: ["#171a38", "#33254d", "#68395c", "#a35a63"],
    stars: 90, moon: "crescent", cloud: "#3d2f55",
    skyline: true, skylineLit: true, lamp: true,
  },
  day: {
    sky: ["#4e8fc4", "#74b2dd", "#a8d4e8", "#ffe9c4"],
    stars: 0, sun: true, cloud: "#f0f4f8",
    skyline: true, skylineLit: false, lamp: false,
  },
  space: {
    sky: ["#04050d", "#0b0d22", "#181040", "#2c1a52"],
    stars: 160, planets: true, cloud: null,
    skyline: false, skylineLit: false, lamp: true,
  },
  halloween: {
    sky: ["#140b20", "#331a4d", "#6e2f3a", "#b0532e"],
    stars: 60, moon: "full", cloud: "#2c1c3d",
    skyline: true, skylineLit: true, lamp: true,
    bats: true, pumpkins: true,
  },
  xmas: {
    sky: ["#0c1330", "#1a2850", "#324768", "#5c7390"],
    stars: 70, moon: "crescent", cloud: "#4a5a78",
    skyline: true, skylineLit: true, lamp: true,
    snow: true,
  },
};

export const SCENE_THEMES = Object.keys(SCENES);

export function sceneTheme() {
  return SCENES[settings.scene?.theme] ?? SCENES.night;
}

// ------------------------------------------------------------- layout ----

const BX = 28, BW = 304;              // building x, width
const WALL = 12;                      // exterior wall thickness
const MID = { x: 176, w: 8 };         // wall between left/right rooms

// Outer silhouette (incl. outline) — the zoom camera frames this.
export const BUILDING = { x: BX - 2, w: BW + 4, top: 142, bottom: 424 };

export const L = {
  sign:    { x: BX, y: 150, w: BW, h: 26 },
  upper:   { y: 176, h: 112 },
  divider: { y: 288, h: 8 },
  ground:  { y: 296, h: 118 },
  base:    { y: 414, h: 10 },
  street:  { y: 424 },

  rooms: {
    garden:  { x: BX + WALL, y: 176, w: MID.x - BX - WALL, h: 112, label: "GARDEN",  cmd: "!GARDEN"  },
    loft:    { x: MID.x + MID.w, y: 176, w: BX + BW - WALL - MID.x - MID.w, h: 112, label: "LOFT", cmd: "!LOFT" },
    kitchen: { x: BX + WALL, y: 296, w: MID.x - BX - WALL, h: 118, label: "KITCHEN", cmd: "!KITCHEN" },
    counter: { x: MID.x + MID.w, y: 296, w: BX + BW - WALL - MID.x - MID.w, h: 118, label: "COUNTER", cmd: "!COUNTER" },
  },

  // Where characters' feet sit, per storey.
  walkY: { ground: 410, upper: 284 },

  // Fixed on-screen spots per room — one player sprite each, no stacking.
  spots: {
    kitchen: [ { x: 60 }, { x: 108 }, { x: 150 } ],
    counter: [ { x: 272 } ],
    garden:  [ { x: 70 }, { x: 128 } ],
    loft:    [ { x: 252 }, { x: 296 } ],
  },

  // Anchor points for action feedback (floaties), keyed by verb.
  stations: {
    chop:  { x: 60,  y: 410 },
    stove: { x: 108, y: 410 },
    fry:   { x: 150, y: 410 },
    stir:  { x: 108, y: 410 },
    bake:  { x: 108, y: 410 },
    plate: { x: 172, y: 410 },
    serve: { x: 272, y: 410 },
    water: { x: 110, y: 284 },
    pet:   { x: 254, y: 284 },
  },

  pass:   { x: MID.x, y: 336, w: MID.w, h: 26 },   // hatch in the middle wall
  rail:   { y: 302 },                              // ticket rail (kitchen top)
  stools: [ { x: 202, y: 396 }, { x: 238, y: 396 } ],
  door:   { x: 300, y: 350, w: 18, h: 64 },
  stove:  { x: 96, y: 344 },                       // oven front (fire window)
  fuel:   { x: 86, y: 348 },                       // fuel gauge anchor
  hud:    { coins: { x: 328, y: 158 } },
};

// ------------------------------------------------------------ helpers ----

function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

// Outlined box with a top highlight and right shadow — the furniture core.
function box(c, x, y, w, h, base, light, dk, outline = PAL.woodOutline) {
  px(c, x - 1, y - 1, w + 2, h + 2, outline);
  px(c, x, y, w, h, base);
  px(c, x, y, w, 1, light);
  px(c, x + w - 1, y + 1, 1, h - 1, dk);
  px(c, x, y + h - 1, w, 1, dk);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------- static scene ----

let staticCanvas = null;

export function buildStatic() {
  staticCanvas = document.createElement("canvas");
  staticCanvas.width = W; staticCanvas.height = H;
  const c = staticCanvas.getContext("2d");

  const T = sceneTheme();
  drawSky(c, T);
  drawStreet(c, T);
  drawShell(c);
  drawGarden(c);
  drawLoft(c);
  drawKitchen(c);
  drawCounter(c);
  drawSign(c);
  if (T.snow) drawSnowCaps(c);
  if (T.pumpkins) drawSpookyDecor(c);
  return staticCanvas;
}

export function getStatic() { return staticCanvas ?? buildStatic(); }

// Theme changed (⚙ Settings → Background) — repaint the architecture.
export function rebuildStatic() { buildStatic(); }

// ------------------------------------------------------------------ sky ----

function drawSky(c, T) {
  // vertical gradient from the theme's four stops (top → horizon glow)
  const g = c.createLinearGradient(0, 0, 0, H * 0.78);
  g.addColorStop(0, T.sky[0]);
  g.addColorStop(0.45, T.sky[1]);
  g.addColorStop(0.8, T.sky[2]);
  g.addColorStop(1, T.sky[3]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // stars — dense up top, thinning toward the horizon (space: everywhere)
  const rnd = mulberry32(77);
  for (let i = 0; i < (T.stars ?? 0); i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * rnd() * (T.planets ? 620 : 300));
    c.globalAlpha = 0.4 + rnd() * 0.6;
    px(c, x, y, 1, 1, PAL.star);
  }
  c.globalAlpha = 1;

  if (T.sun) {
    c.globalAlpha = 0.25;
    c.fillStyle = "#fff3d0";
    c.beginPath(); c.arc(76, 62, 22, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = "#ffd98a";
    c.beginPath(); c.arc(76, 62, 14, 0, Math.PI * 2); c.fill();
    px(c, 70, 55, 5, 4, "#fff3d0");
  }

  if (T.moon === "crescent") {
    c.fillStyle = PAL.moon;
    c.beginPath(); c.arc(303, 62, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = T.sky[0];
    c.beginPath(); c.arc(298, 58, 11, 0, Math.PI * 2); c.fill();
    px(c, 299, 68, 2, 2, lighten(PAL.moon, 0.2));
  } else if (T.moon === "full") {
    // big harvest moon with craters + haze
    c.globalAlpha = 0.15;
    c.fillStyle = "#ffb347";
    c.beginPath(); c.arc(298, 62, 27, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = "#e8a04a";
    c.beginPath(); c.arc(298, 62, 20, 0, Math.PI * 2); c.fill();
    px(c, 291, 55, 4, 4, "#c47f3e");
    px(c, 303, 68, 5, 3, "#c47f3e");
    px(c, 299, 49, 3, 3, "#c47f3e");
  }

  if (T.planets) {
    // ringed gas giant
    c.fillStyle = "#c48fb0";
    c.beginPath(); c.arc(300, 64, 14, 0, Math.PI * 2); c.fill();
    px(c, 288, 59, 24, 2, "#a06a92");
    px(c, 280, 68, 40, 2, "#8fb0d4");
    px(c, 276, 69, 48, 1, "rgba(143,176,212,0.5)");
    // small red planet + a distant blue one
    c.fillStyle = "#c25b4e";
    c.beginPath(); c.arc(64, 96, 6, 0, Math.PI * 2); c.fill();
    px(c, 60, 94, 4, 1, "#e0806a");
    c.fillStyle = "#5b74b8";
    c.beginPath(); c.arc(180, 40, 3, 0, Math.PI * 2); c.fill();
  }

  // distant skyline silhouette
  if (T.skyline) {
    const rs = mulberry32(1234);
    let sx = 0;
    while (sx < W) {
      const bw = 18 + Math.floor(rs() * 30);
      const bh = 14 + Math.floor(rs() * 34);
      c.fillStyle = PAL.skyline;
      c.fillRect(sx, 148 - bh, bw, bh + 10);
      // windows (lit after dark, dark by day)
      for (let wx = sx + 3; wx < sx + bw - 3; wx += 5) {
        for (let wy = 152 - bh; wy < 144; wy += 6) {
          if (rs() < 0.24) px(c, wx, wy, 2, 2, T.skylineLit ? "#e8b96a" : "#1c1733");
        }
      }
      sx += bw + 2 + Math.floor(rs() * 8);
    }
  }
}

// --------------------------------------------------------------- street ----

function drawStreet(c, T) {
  const y = L.street.y;
  // pavement
  px(c, 0, y, W, H - y, "#3d3244");
  px(c, 0, y, W, 3, T.snow ? "#e8eef4" : "#55465c");
  px(c, 0, y + 3, W, 1, "#2c2433");
  // paving joints
  const rnd = mulberry32(9);
  for (let row = y + 10; row < H; row += 14) {
    px(c, 0, row, W, 1, "#332a3b");
    for (let jx = ((row / 14) | 0) % 2 ? 12 : 26; jx < W; jx += 28) {
      px(c, jx, row - 14 < y ? y + 4 : row - 14, 1, Math.min(14, row - y - 4), "#332a3b");
    }
  }
  void rnd;

  // lamppost (right of building) — unlit by day
  px(c, 342, y - 116, 3, 116, "#2c2433");
  px(c, 336, y - 120, 15, 6, "#2c2433");
  px(c, 339, y - 126, 9, 8, T.lamp ? "#ffd98a" : "#4a4456");
  if (T.lamp) px(c, 341, y - 124, 3, 3, "#fff3d0");
  px(c, 340, y, 7, 3, "#241d2b");

  // bench (left of building)
  box(c, 2, y - 12, 22, 4, PAL.wood, PAL.woodLight, PAL.woodDark);
  px(c, 4, y - 8, 2, 8, PAL.woodDark);
  px(c, 20, y - 8, 2, 8, PAL.woodDark);

  // potted trees flanking the door
  c.drawImage(PLANTS.potted, 286, y - 9);
  c.drawImage(PLANTS.potted, 324, y - 9);

  // doormat under the door
  px(c, L.door.x - 2, y - 10, L.door.w + 4, 4, "#8a4a3d");
  px(c, L.door.x, y - 9, L.door.w, 2, "#a25c4a");

  // sandwich board: "LIVE"
  px(c, 254, y - 16, 16, 16, PAL.signBg);
  px(c, 255, y - 15, 14, 14, "#3d2b38");
  c.fillStyle = PAL.signText;
  // (drawn as chunky pixels — tiny "A" board look)
  px(c, 257, y - 12, 10, 2, PAL.signText);
  px(c, 257, y - 8, 10, 2, "#f2788f");

  // halloween: jack-o'-lanterns by the bench and the door
  if (T.pumpkins) {
    for (const pxx of [8, 276]) {
      px(c, pxx, y - 9, 12, 9, "#d97a2e");
      px(c, pxx + 1, y - 9, 2, 9, "#b8622a");
      px(c, pxx + 9, y - 9, 2, 9, "#b8622a");
      px(c, pxx + 5, y - 12, 2, 3, "#4e7a3f");         // stem
      px(c, pxx + 2, y - 7, 2, 2, "#ffd98a");          // eyes
      px(c, pxx + 8, y - 7, 2, 2, "#ffd98a");
      px(c, pxx + 3, y - 3, 6, 1, "#ffd98a");          // grin
    }
  }
}

// halloween: decor INSIDE the café too — the zoom camera crops the street,
// so the theme has to read from the rooms themselves
function drawSpookyDecor(c) {
  // jack-o'-lantern beside the counter-room door
  const co = L.rooms.counter, cfy = co.y + co.h - 10;
  const pxx = L.door.x - 16;
  px(c, pxx, cfy - 8, 12, 8, "#d97a2e");
  px(c, pxx + 1, cfy - 8, 2, 8, "#b8622a");
  px(c, pxx + 9, cfy - 8, 2, 8, "#b8622a");
  px(c, pxx + 5, cfy - 11, 2, 3, "#4e7a3f");           // stem
  px(c, pxx + 2, cfy - 6, 2, 2, "#ffd98a");            // eyes
  px(c, pxx + 8, cfy - 6, 2, 2, "#ffd98a");
  px(c, pxx + 3, cfy - 3, 6, 1, "#ffd98a");            // grin
  // cobwebs in the upper-room ceiling corners
  for (const r of [L.rooms.garden, L.rooms.loft]) {
    const wx = r.x + r.w - 1, wy = r.y + 4;
    c.globalAlpha = 0.55;
    for (let i = 1; i <= 4; i++) {
      px(c, wx - i * 3, wy, 1, 1, "#e8e4f0");          // radial threads
      px(c, wx, wy + i * 3, 1, 1, "#e8e4f0");
      px(c, wx - i * 2, wy + i * 2, 1, 1, "#e8e4f0");
    }
    px(c, wx - 8, wy + 3, 5, 1, "#e8e4f0");            // cross strands
    px(c, wx - 4, wy + 6, 4, 1, "#e8e4f0");
    c.globalAlpha = 1;
  }
}

// xmas: snow settled on every upward-facing ledge
function drawSnowCaps(c) {
  const y = L.street.y;
  px(c, BX, L.sign.y - 8, BW, 3, "#eef4fa");           // parapet
  px(c, 286, L.sign.y - 27, 20, 3, "#eef4fa");         // chimney cap
  px(c, 336, y - 122, 15, 2, "#eef4fa");               // lamp head
  px(c, 2, y - 14, 22, 2, "#eef4fa");                  // bench
  px(c, 254, y - 17, 16, 2, "#eef4fa");                // sandwich board
}

// -------------------------------------------------------- building shell ----

function drawShell(c) {
  const top = L.sign.y, bottom = L.base.y + L.base.h;

  // outline silhouette
  px(c, BX - 2, top - 8, BW + 4, bottom - top + 8, PAL.outline);

  // parapet + roofline
  px(c, BX, top - 6, BW, 8, PAL.roof);
  px(c, BX, top - 6, BW, 2, PAL.roofLight);
  for (let x = BX; x < BX + BW; x += 10) px(c, x, top - 6, 1, 2, PAL.roofDark);

  // chimney
  px(c, 288, top - 24, 16, 20, PAL.brickDark);
  px(c, 286, top - 26, 20, 4, PAL.roofDark);
  px(c, 290, top - 22, 3, 16, PAL.brick);

  // brick frame: sides + divider + base
  brickFill(c, BX, top + L.sign.h, WALL, bottom - top - L.sign.h);
  brickFill(c, BX + BW - WALL, top + L.sign.h, WALL, bottom - top - L.sign.h);
  px(c, MID.x, L.upper.y, MID.w, L.ground.y + L.ground.h - L.upper.y, "#7a5a48");
  px(c, MID.x + 1, L.upper.y, 2, L.ground.y + L.ground.h - L.upper.y, "#8f6c56");

  // floor divider between storeys
  px(c, BX, L.divider.y, BW, L.divider.h, PAL.divider);
  px(c, BX, L.divider.y, BW, 2, "#5c4452");
  px(c, BX, L.divider.y + L.divider.h - 1, BW, 1, "#2c1c12");

  // building base
  px(c, BX, L.base.y, BW, L.base.h, "#4a3a44");
  px(c, BX, L.base.y, BW, 2, "#5c4452");
}

function brickFill(c, x, y, w, h) {
  px(c, x, y, w, h, PAL.mortar);
  const rnd = mulberry32(x * 31 + y);
  for (let row = 0; row < h - 2; row += 5) {
    const off = ((row / 5) | 0) % 2 ? 4 : 0;
    for (let col = -4 + off; col < w; col += 8) {
      const bw = Math.min(7, w - col - 1);
      if (bw <= 0 || col < 0) {
        if (col < 0 && col + 7 > 0) px(c, x, y + row + 1, col + 7, 4, rnd() < 0.2 ? PAL.brickLight : PAL.brick);
        continue;
      }
      px(c, x + col, y + row + 1, bw, 4,
        rnd() < 0.15 ? PAL.brickDark : rnd() < 0.3 ? PAL.brickLight : PAL.brick);
    }
  }
}

// ---------------------------------------------------------------- sign ----

function drawSign(c) {
  const s = L.sign;
  px(c, s.x, s.y, s.w, s.h, PAL.signBg);
  px(c, s.x + 2, s.y + 2, s.w - 4, s.h - 4, "#3d2b38");
  px(c, s.x + 2, s.y + 2, s.w - 4, 1, "#554152");
  // Text is drawn big and chunky: 2× scaled bitmap font, done in view.js HUD
  // so it can share the glow pass. Bulb sockets here (lit dynamically):
  for (let i = 0; i < 22; i++) {
    const bx = s.x + 7 + i * 14;
    px(c, bx, s.y + s.h - 5, 2, 2, PAL.bulbOff);
  }
}

// ---------------------------------------------------------------- rooms ----

function roomBase(c, r, wallCol, wallSh, floorFn) {
  px(c, r.x, r.y, r.w, r.h, wallCol);
  // wall shading: darker near the ceiling
  px(c, r.x, r.y, r.w, 3, wallSh);
  c.globalAlpha = 0.35;
  px(c, r.x, r.y + 3, r.w, 2, wallSh);
  c.globalAlpha = 1;
  floorFn(c, r);
  // baseboard
  px(c, r.x, r.y + r.h - 12, r.w, 2, PAL.baseboard);
}

function woodFloor(c, r, seed = 5) {
  const fy = r.y + r.h - 10;
  px(c, r.x, fy, r.w, 10, PAL.floorWood);
  const rnd = mulberry32(seed);
  for (let row = 0; row < 10; row += 5) {
    px(c, r.x, fy + row, r.w, 1, PAL.floorWoodSh);
    const off = row === 0 ? 0 : 14;
    for (let col = off; col < r.w; col += 28) {
      px(c, r.x + col, fy + row + 1, 1, 4, PAL.floorWoodSh);
      if (rnd() < 0.5) px(c, r.x + col + 2, fy + row + 1, 10, 1, PAL.floorWoodHi);
    }
  }
}

function roomPlate(c, r) {
  // little wooden name plate, top-left: "KITCHEN !KITCHEN" (text via view.js)
  box(c, r.x + 3, r.y + 4, 54, 9, PAL.wood, PAL.woodLight, PAL.woodDark);
}

// -------------------------------------------------------------- kitchen ----

function drawKitchen(c) {
  const r = L.rooms.kitchen;
  roomBase(c, r, PAL.tile, PAL.tileSh, (cc, rr) => {
    // checker tile floor
    const fy = rr.y + rr.h - 10;
    px(cc, rr.x, fy, rr.w, 10, "#c9b489");
    for (let ty = 0; ty < 10; ty += 5) {
      for (let tx = 0; tx < rr.w; tx += 5) {
        if (((tx / 5) + (ty / 5)) % 2 === 0) px(cc, rr.x + tx, fy + ty, 5, 5, "#b09a72");
      }
    }
  });

  // tiled splashback grid
  c.globalAlpha = 0.5;
  for (let ty = r.y + 6; ty < r.y + r.h - 14; ty += 8) px(c, r.x, ty, r.w, 1, PAL.tileSh);
  for (let tx = r.x + 8; tx < r.x + r.w; tx += 8) px(c, tx, r.y + 6, 1, r.h - 20, PAL.tileSh);
  c.globalAlpha = 1;

  const floorY = r.y + r.h - 10;

  // --- chop station (left): counter + cutting board + knife block
  box(c, r.x + 6, floorY - 26, 42, 26, PAL.wood, PAL.woodLight, PAL.woodDark);
  px(c, r.x + 8, floorY - 28, 38, 3, PAL.woodLight);            // countertop
  px(c, r.x + 8, floorY - 26, 38, 1, PAL.woodDark);
  px(c, r.x + 12, floorY - 31, 16, 4, "#d9c9a8");               // cutting board
  px(c, r.x + 12, floorY - 31, 16, 1, "#e8dcc0");
  px(c, r.x + 30, floorY - 30, 2, 3, PAL.metalLight);           // knife
  px(c, r.x + 32, floorY - 29, 3, 1, PAL.woodDark);
  px(c, r.x + 10, floorY - 18, 14, 12, PAL.woodDark);           // cabinet doors
  px(c, r.x + 28, floorY - 18, 14, 12, PAL.woodDark);
  px(c, r.x + 22, floorY - 13, 2, 2, PAL.coin);
  px(c, r.x + 36, floorY - 13, 2, 2, PAL.coin);
  // veg basket on the counter
  px(c, r.x + 36, floorY - 33, 9, 5, PAL.terracotta);
  px(c, r.x + 37, floorY - 35, 2, 2, PAL.tomato);
  px(c, r.x + 40, floorY - 35, 2, 2, PAL.leafLight);
  px(c, r.x + 43, floorY - 34, 2, 2, PAL.carrot);

  // --- stove/oven (center) with hood
  const sx = L.stove.x - r.x + r.x, sy = L.stove.y;
  box(c, sx, sy, 36, floorY - sy, PAL.stoveBody, PAL.stoveLight, PAL.stoveDark);
  px(c, sx + 2, sy - 3, 32, 4, PAL.stoveDark);                  // cooktop
  px(c, sx + 5, sy - 4, 8, 2, PAL.outline);                     // burners
  px(c, sx + 22, sy - 4, 8, 2, PAL.outline);
  px(c, sx + 4, sy + 6, 28, 18, PAL.stoveDark);                 // oven window frame
  px(c, sx + 6, sy + 8, 24, 14, "#2c2030");                     // glass (fire = dynamic)
  px(c, sx + 14, sy + 2, 8, 2, PAL.metalLight);                 // handle
  // extraction hood
  px(c, sx + 2, r.y + 30, 32, 8, PAL.metal);
  px(c, sx + 2, r.y + 30, 32, 2, PAL.metalLight);
  px(c, sx + 12, r.y + 14, 12, 16, PAL.metalDark);
  px(c, sx + 13, r.y + 15, 2, 14, PAL.metal);

  // --- fry station (right): range + big pan
  box(c, r.x + 100, floorY - 26, 32, 26, PAL.stoveBody, PAL.stoveLight, PAL.stoveDark);
  px(c, r.x + 102, floorY - 28, 28, 3, PAL.stoveDark);
  px(c, r.x + 106, floorY - 31, 18, 4, "#2c2830");              // pan
  px(c, r.x + 106, floorY - 31, 18, 1, "#4a4450");
  px(c, r.x + 124, floorY - 30, 7, 2, PAL.stoveDark);           // handle
  px(c, r.x + 104, floorY - 18, 24, 12, PAL.stoveDark);         // oven drawer
  px(c, r.x + 114, floorY - 15, 6, 2, PAL.metalLight);
}

// -------------------------------------------------------------- counter ----

function drawCounter(c) {
  const r = L.rooms.counter;
  roomBase(c, r, PAL.wallCream, PAL.wallCreamSh, (cc, rr) => woodFloor(cc, rr, 21));
  const floorY = r.y + r.h - 10;

  // pass hatch (shared with kitchen — drawn over the middle wall)
  px(c, L.pass.x - 2, L.pass.y, L.pass.w + 4, L.pass.h, "#3a2416");
  px(c, L.pass.x - 1, L.pass.y + 1, L.pass.w + 2, L.pass.h - 2, "#8f6c56");
  px(c, L.pass.x - 4, L.pass.y + L.pass.h - 2, L.pass.w + 8, 3, PAL.woodLight);  // shelf
  px(c, L.pass.x - 4, L.pass.y + L.pass.h + 1, L.pass.w + 8, 1, PAL.woodDark);

  // chalkboard menu
  px(c, r.x + 10, r.y + 18, 34, 26, PAL.woodDark);
  px(c, r.x + 12, r.y + 20, 30, 22, "#2e3830");
  px(c, r.x + 14, r.y + 23, 20, 2, "#d9c9a8");
  px(c, r.x + 14, r.y + 28, 24, 1, "#8fa88f");
  px(c, r.x + 14, r.y + 32, 18, 1, "#8fa88f");
  px(c, r.x + 14, r.y + 36, 22, 1, "#8fa88f");

  // wall art + clock
  px(c, r.x + 56, r.y + 20, 12, 10, PAL.wood);
  px(c, r.x + 58, r.y + 22, 8, 6, "#68395c");
  px(c, r.x + 60, r.y + 24, 3, 2, PAL.moon);
  c.fillStyle = PAL.cream;
  c.beginPath(); c.arc(r.x + 84, r.y + 25, 6, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.outline;
  c.beginPath(); c.arc(r.x + 84, r.y + 25, 6, 0, Math.PI * 2); c.stroke();
  px(c, r.x + 84, r.y + 22, 1, 4, PAL.ink);
  px(c, r.x + 84, r.y + 25, 3, 1, PAL.ink);

  // the bar counter (shortened — the server works the floor to its right)
  box(c, r.x + 4, floorY - 30, 64, 30, PAL.wood, PAL.woodLight, PAL.woodDark);
  px(c, r.x + 2, floorY - 33, 68, 4, PAL.woodLight);            // counter top
  px(c, r.x + 2, floorY - 30, 68, 1, PAL.woodDark);
  for (let p = 8; p < 64; p += 16) px(c, r.x + 4 + p, floorY - 26, 1, 24, PAL.woodDark);

  // espresso machine
  box(c, r.x + 8, floorY - 47, 24, 13, PAL.metal, PAL.metalLight, PAL.metalDark);
  px(c, r.x + 10, floorY - 50, 20, 4, PAL.metalDark);
  px(c, r.x + 13, floorY - 34, 3, 4, PAL.metalDark);            // portafilter
  px(c, r.x + 24, floorY - 34, 3, 4, PAL.metalDark);
  px(c, r.x + 28, floorY - 45, 2, 6, PAL.copper);               // lever
  px(c, r.x + 12, floorY - 44, 4, 3, "#d94f3d");                // button

  // register
  box(c, r.x + 40, floorY - 43, 16, 9, PAL.copper, lighten(PAL.copper, 0.3), PAL.copperDark);
  px(c, r.x + 42, floorY - 41, 12, 3, "#2e3830");
  px(c, r.x + 43, floorY - 40, 4, 1, "#8fce8f");

  // stools
  for (const st of L.stools) {
    px(c, st.x - 6, st.y - 12, 12, 4, "#b8556e");
    px(c, st.x - 6, st.y - 12, 12, 1, "#d1788c");
    px(c, st.x - 5, st.y - 8, 2, 16, PAL.woodDark);
    px(c, st.x + 3, st.y - 8, 2, 16, PAL.woodDark);
    px(c, st.x - 4, st.y - 2, 8, 1, PAL.woodDark);
  }

  // door to the street
  const d = L.door;
  px(c, d.x - 2, d.y - 4, d.w + 4, d.h + 4, "#3a2416");
  px(c, d.x, d.y, d.w, d.h, PAL.woodDark);
  px(c, d.x + 2, d.y + 4, d.w - 4, 24, PAL.glass);              // window pane
  px(c, d.x + 2, d.y + 4, d.w - 4, 3, PAL.glassLight);
  px(c, d.x + 3, d.y + 34, d.w - 6, 1, PAL.wood);
  px(c, d.x + 3, d.y + 44, d.w - 6, 1, PAL.wood);
  px(c, d.x + 2, d.y + 30, 3, 3, PAL.coin);                     // handle
  // OPEN sign hanging in the pane
  px(c, d.x + 4, d.y + 10, 10, 6, PAL.signBg);
  px(c, d.x + 5, d.y + 11, 8, 4, "#f2c14e");
}

// --------------------------------------------------------------- garden ----

function drawGarden(c) {
  const r = L.rooms.garden;
  roomBase(c, r, "#88b4a8", "#6d968c", (cc, rr) => {
    const fy = rr.y + rr.h - 10;
    px(cc, rr.x, fy, rr.w, 10, "#7a6a4a");                      // dirt-flecked boards
    px(cc, rr.x, fy, rr.w, 1, "#93805c");
    px(cc, rr.x, fy + 5, rr.w, 1, "#635538");
  });

  // greenhouse glass panels along the back
  for (let gx = r.x + 4; gx < r.x + r.w - 12; gx += 24) {
    px(c, gx, r.y + 8, 20, 40, PAL.glass);
    px(c, gx, r.y + 8, 20, 2, PAL.glassLight);
    px(c, gx + 2, r.y + 12, 3, 30, PAL.glassLight);             // shine streak
    px(c, gx - 1, r.y + 7, 22, 1, "#5c7a72");
    px(c, gx - 1, r.y + 7, 1, 42, "#5c7a72");
    px(c, gx + 20, r.y + 7, 1, 42, "#5c7a72");
    px(c, gx + 9, r.y + 8, 1, 40, "#5c7a72");
  }

  const floorY = r.y + r.h - 10;

  // planter boxes
  const planters = [
    { x: r.x + 8,  crop: "tomato" },
    { x: r.x + 52, crop: "herb" },
    { x: r.x + 96, crop: "tomato" },
  ];
  for (const p of planters) {
    box(c, p.x, floorY - 12, 34, 12, PAL.wood, PAL.woodLight, PAL.woodDark);
    px(c, p.x + 2, floorY - 11, 30, 3, PAL.soil);
    if (p.crop === "tomato") {
      c.drawImage(PLANTS.tomato, p.x + 3, floorY - 20);
      c.drawImage(PLANTS.tomato, p.x + 17, floorY - 20);
    } else {
      c.drawImage(PLANTS.herb, p.x + 5, floorY - 17);
      c.drawImage(PLANTS.herb, p.x + 14, floorY - 17);
      c.drawImage(PLANTS.herb, p.x + 23, floorY - 17);
    }
  }

  // hanging plants from the ceiling
  c.drawImage(PLANTS.hanging, r.x + 42, r.y + 2);
  c.drawImage(PLANTS.hanging, r.x + 80, r.y + 2);
  c.drawImage(PLANTS.hanging, r.x + 118, r.y + 2);

  // watering can
  px(c, r.x + 118, floorY - 8, 12, 8, PAL.metal);
  px(c, r.x + 118, floorY - 8, 12, 2, PAL.metalLight);
  px(c, r.x + 114, floorY - 6, 4, 1, PAL.metal);
  px(c, r.x + 113, floorY - 7, 2, 2, PAL.metalDark);
  px(c, r.x + 122, floorY - 11, 4, 3, PAL.metalDark);

  // grow lamp
  px(c, r.x + 62, r.y + 4, 14, 4, PAL.stoveDark);
  px(c, r.x + 64, r.y + 8, 10, 2, "#ffe9a3");
}

// ------------------------------------------------------------------ loft ----

function drawLoft(c) {
  const r = L.rooms.loft;
  roomBase(c, r, PAL.wallRose, PAL.wallRoseSh, (cc, rr) => woodFloor(cc, rr, 42));

  // wallpaper dots
  c.globalAlpha = 0.4;
  for (let wy = r.y + 10; wy < r.y + r.h - 20; wy += 12) {
    for (let wx = r.x + 6 + ((wy / 12) % 2 ? 6 : 0); wx < r.x + r.w - 6; wx += 12) {
      px(c, wx, wy, 2, 2, PAL.wallRoseSh);
    }
  }
  c.globalAlpha = 1;

  const floorY = r.y + r.h - 10;

  // round window with the night sky
  const wx = r.x + 96, wy = r.y + 30, rad = 15;
  c.fillStyle = "#3a2416";
  c.beginPath(); c.arc(wx, wy, rad + 2, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.skyMid;
  c.beginPath(); c.arc(wx, wy, rad, 0, Math.PI * 2); c.fill();
  px(c, wx - 6, wy - 6, 2, 2, PAL.star);
  px(c, wx + 4, wy - 2, 1, 1, PAL.star);
  px(c, wx - 2, wy + 5, 1, 1, PAL.star);
  c.fillStyle = PAL.moon;
  c.beginPath(); c.arc(wx + 6, wy - 6, 4, 0, Math.PI * 2); c.fill();
  px(c, wx - rad, wy, rad * 2, 1, "#3a2416");
  px(c, wx, wy - rad, 1, rad * 2, "#3a2416");

  // bookshelf
  box(c, r.x + 6, floorY - 34, 26, 34, PAL.wood, PAL.woodLight, PAL.woodDark);
  for (let shelf = 0; shelf < 3; shelf++) {
    const sy = floorY - 28 + shelf * 10;
    px(c, r.x + 8, sy, 22, 1, PAL.woodDark);
    const rnd = mulberry32(shelf * 7 + 3);
    let bx = r.x + 9;
    while (bx < r.x + 27) {
      const bw = 2 + Math.floor(rnd() * 2);
      const bh = 6 + Math.floor(rnd() * 2);
      const cols = ["#c25b4e", "#4f8f8b", "#7a9c68", "#b0619c", "#d9984a", "#5b74b8"];
      px(c, bx, sy - bh, bw, bh, cols[Math.floor(rnd() * cols.length)]);
      bx += bw + 1;
    }
  }

  // cat tree (platforms sized for the 2× cats)
  const tx = r.x + 40;
  px(c, tx + 14, floorY - 40, 5, 40, "#d9c9a8");                // post
  px(c, tx + 15, floorY - 40, 1, 40, "#efe4cc");
  for (let ry = floorY - 38; ry < floorY; ry += 4) px(c, tx + 14, ry, 5, 1, "#bfae8c");
  box(c, tx, floorY - 42, 36, 4, PAL.wood, PAL.woodLight, PAL.woodDark);   // top platform
  box(c, tx + 20, floorY - 22, 20, 4, PAL.wood, PAL.woodLight, PAL.woodDark); // mid platform

  // rug
  px(c, r.x + 78, floorY - 2, 40, 5, "#b8556e");
  px(c, r.x + 80, floorY - 1, 36, 3, "#d1788c");
  px(c, r.x + 78, floorY - 2, 2, 5, "#f2d5dc");
  px(c, r.x + 116, floorY - 2, 2, 5, "#f2d5dc");

  // cushion
  px(c, r.x + 82, floorY - 6, 18, 6, "#4f8f8b");
  px(c, r.x + 83, floorY - 7, 16, 2, "#6fb0ab");

  // yarn ball
  c.fillStyle = "#e06a5a";
  c.beginPath(); c.arc(r.x + 70, floorY - 3, 3, 0, Math.PI * 2); c.fill();
  px(c, r.x + 66, floorY - 2, 4, 1, "#e06a5a");
}

// -------------------------------------------------- ambient (per frame) ----

// Everything here is cheap, additive detail keyed off time `t` (seconds).
export function drawAmbient(c, t, state) {
  const T = sceneTheme();

  // sign bulbs chase (xmas: fairy-light colours)
  const s = L.sign;
  const XMAS_BULBS = ["#ff6a6a", "#7fce7f", "#f2c14e"];
  for (let i = 0; i < 22; i++) {
    const bx = s.x + 7 + i * 14;
    const on = ((i + Math.floor(t * 4)) % 3) === 0;
    const lit = T.snow ? XMAS_BULBS[i % 3] : PAL.bulbOn;
    px(c, bx, s.y + s.h - 5, 2, 2, on ? lit : PAL.bulbOff);
    if (on) { c.globalAlpha = 0.25; px(c, bx - 1, s.y + s.h - 6, 4, 4, lit); c.globalAlpha = 1; }
  }

  // stove fire (visible in the oven window) — flickers, scales with fuel
  const fuelFrac = state ? state.fuel / state.fuelMax : 0.7;
  const sx = L.stove.x, sy = L.stove.y;
  const flick = Math.sin(t * 13) + Math.sin(t * 29 + 1.7);
  const fh = Math.max(1, Math.round(4 + fuelFrac * 7 + flick));
  px(c, sx + 6, sy + 22 - fh, 24, fh, PAL.fire2);
  px(c, sx + 9, sy + 22 - Math.max(1, fh - 3), 18, Math.max(1, fh - 3), PAL.fire1);
  if (fh > 5) px(c, sx + 14, sy + 22 - fh + 3, 8, 2, PAL.fireCore);
  c.globalAlpha = 0.10 + 0.05 * Math.sin(t * 7);
  px(c, sx - 6, sy - 2, 48, 30, PAL.fire1);
  c.globalAlpha = 1;

  // chimney smoke
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.35 + i * 0.25) % 1;
    const smx = 294 + Math.sin((t + i * 2) * 1.1) * (2 + ph * 5);
    const smy = L.sign.y - 26 - ph * 26;
    c.globalAlpha = 0.35 * (1 - ph);
    const sz = 2 + Math.round(ph * 4);
    px(c, Math.round(smx), Math.round(smy), sz, sz, PAL.smoke);
  }
  c.globalAlpha = 1;

  // fry pan sizzle steam
  const k = L.rooms.kitchen, kfy = k.y + k.h - 10;
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.7 + i * 0.33) % 1;
    c.globalAlpha = 0.4 * (1 - ph);
    px(c, k.x + 110 + i * 5 + Math.round(Math.sin((t + i) * 3) * 2), Math.round(kfy - 33 - ph * 12), 2, 2, PAL.steam);
  }
  c.globalAlpha = 1;

  // espresso machine steam
  const co = L.rooms.counter, cfy = co.y + co.h - 10;
  for (let i = 0; i < 2; i++) {
    const ph = (t * 0.5 + i * 0.5) % 1;
    c.globalAlpha = 0.35 * (1 - ph);
    px(c, co.x + 14 + i * 8 + Math.round(Math.sin(t * 2 + i * 3) * 2), Math.round(cfy - 52 - ph * 10), 2, 2, PAL.steam);
  }
  c.globalAlpha = 1;

  // grow lamp glow (garden)
  const g = L.rooms.garden;
  c.globalAlpha = 0.08 + 0.03 * Math.sin(t * 2);
  px(c, g.x + 56, g.y + 10, 26, 40, "#ffe9a3");
  c.globalAlpha = 1;

  // butterfly in the garden
  const bx = g.x + 68 + Math.sin(t * 0.8) * 40;
  const by = g.y + 46 + Math.sin(t * 1.7) * 14 + Math.sin(t * 5) * 3;
  const wing = Math.sin(t * 14) > 0;
  px(c, Math.round(bx), Math.round(by), 1, 2, "#4a3b32");
  px(c, Math.round(bx) - (wing ? 2 : 1), Math.round(by), wing ? 2 : 1, 2, "#f2c14e");
  px(c, Math.round(bx) + 1, Math.round(by), wing ? 2 : 1, 2, "#f2c14e");

  // loft animals — cats/dogs/rabbits (!animal cycles); 2× size, idle frames.
  // Every species' grids keep the eyes in the same cells, so the tears below
  // line up whichever animal is home.
  const cl = L.rooms.loft, clfy = cl.y + cl.h - 10;
  const kind = ANIMALS[state?.animal] ?? ANIMALS.cats;
  const frame = Math.floor(t * 1.2) % 2;
  const beast = (spr, x, y) => c.drawImage(spr, x, y, spr.width * 2, spr.height * 2);
  beast(kind.lie1[frame], cl.x + 42, clfy - 42 - 16);               // top of the tree
  beast(kind.lie2[(frame + 1) % 2], cl.x + 84, clfy - 2 - 16);      // on the rug
  beast(kind.sit[frame], cl.x + 8, clfy - 34 - 20);                 // on the bookshelf
  // occasional blink sparkle by the sitting one
  if (Math.sin(t * 0.9) > 0.995) px(c, cl.x + 30, clfy - 46, 1, 1, PAL.star);

  // vibe meter empty → the animals cry :( blue tears under their eyes
  if (state && state.vibe <= 0) {
    const tear = "#5ab0e8";
    const drip = 2 + (Math.floor(t * 2) % 2);                       // tears slowly drip
    // lying: eyes on the left of the head (grid cols 1–2, scaled 2×)
    px(c, cl.x + 42 + 2, clfy - 58 + 6, 2, drip, tear);             // tree
    px(c, cl.x + 42 + 6, clfy - 58 + 6, 2, drip, tear);
    px(c, cl.x + 84 + 2, clfy - 18 + 6, 2, drip, tear);             // rug
    px(c, cl.x + 84 + 6, clfy - 18 + 6, 2, drip, tear);
    // sitting: eyes at grid cols 2 and 4
    px(c, cl.x + 8 + 4, clfy - 54 + 6, 2, drip, tear);              // bookshelf
    px(c, cl.x + 8 + 8, clfy - 54 + 6, 2, drip, tear);
  }

  // lamppost + window warm glow pools
  if (T.lamp) {
    c.globalAlpha = 0.10;
    px(c, 330, L.street.y - 8, 26, 12, "#ffd98a");
  }
  c.globalAlpha = 0.06 + 0.02 * Math.sin(t * 3 + 1);
  px(c, L.rooms.counter.x, L.rooms.counter.y + 40, L.rooms.counter.w, 70, "#ffd98a");
  px(c, L.rooms.kitchen.x, L.rooms.kitchen.y + 40, L.rooms.kitchen.w, 70, "#ffd98a");
  c.globalAlpha = 1;

  // drifting clouds (in front of stars, behind the building — drawn after
  // static so we fake it by keeping them above the roofline)
  if (T.cloud) cloudLayer(c, t, T.cloud);

  // ---- theme extras ----

  // xmas: falling snow above the street line
  if (T.snow) {
    for (let i = 0; i < 46; i++) {
      const spd = 14 + (i % 5) * 4;
      const sx2 = (i * 83 + Math.sin(t * 0.7 + i) * 10 + t * 6) % W;
      const sy2 = (i * 131 + t * spd) % L.street.y;
      c.globalAlpha = 0.5 + (i % 3) * 0.2;
      const sz = i % 4 === 0 ? 2 : 1;
      px(c, Math.round((sx2 + W) % W), Math.round(sy2), sz, sz, "#f0f6fc");
    }
    c.globalAlpha = 1;
  }

  // halloween: bats crossing the sky
  if (T.bats) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * (0.04 + i * 0.013) + i * 0.4) % 1;
      const bxx = Math.round(ph * (W + 30)) - 15;
      const byy = Math.round(36 + i * 24 + Math.sin(t * 3 + i * 2) * 6);
      const up = Math.sin(t * 10 + i) > 0;
      px(c, bxx, byy, 2, 2, "#171020");
      px(c, bxx - 3, byy + (up ? -2 : 1), 3, 2, "#171020");
      px(c, bxx + 2, byy + (up ? -2 : 1), 3, 2, "#171020");
    }
  }

  // space: a shooting star every few seconds
  if (T.planets) {
    const ph = (t % 7) / 7;
    if (ph < 0.12) {
      const sxx = 40 + ph * 7 * 260, syy = 30 + ph * 7 * 60;
      c.globalAlpha = 1 - ph / 0.12;
      px(c, Math.round(sxx), Math.round(syy), 8, 1, "#fff3d0");
      px(c, Math.round(sxx) + 8, Math.round(syy), 3, 1, "#ffe9c4");
      c.globalAlpha = 1;
    }
  }
}

function cloudLayer(c, t, color) {
  const clouds = [
    { y: 34, s: 5.0, w: 46, sp: 2.2 },
    { y: 66, s: 9.5, w: 34, sp: 3.1 },
    { y: 104, s: 3.1, w: 56, sp: 1.6 },
  ];
  c.globalAlpha = 0.5;
  for (const cl of clouds) {
    const x = ((t * cl.sp + cl.s * 90) % (W + cl.w * 2)) - cl.w;
    px(c, Math.round(x), cl.y, cl.w, 5, color);
    px(c, Math.round(x) + 6, cl.y - 3, cl.w - 16, 3, color);
    px(c, Math.round(x) + 10, cl.y + 5, cl.w - 24, 2, color);
  }
  c.globalAlpha = 1;
}
