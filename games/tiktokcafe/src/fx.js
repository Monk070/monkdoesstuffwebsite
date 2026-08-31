// Feedback juice. Every accepted command spawns something here within one
// frame — floating speech bubble, +pop, sparkle. Every rejection gets a
// toast with a reason. If chat types and nothing moves, they leave.
//
// Two layers: pixel particles (sparkles, smoke, coin pops) draw on the game
// canvas; speech bubbles and toasts draw on the high-res overlay in Arial —
// white background, black text — so they're readable at any stream size.

import { PAL } from "./palette.js";
import { settings } from "./settings.js";
import { PLANTS } from "./sprites.js";

// Toast bar backgrounds — match the wall colour of the room they're about.
const ROOM_TOAST_BG = {
  kitchen: PAL.tile,        // mint tile
  counter: PAL.wallCream,   // warm cream
  garden:  "#88b4a8",       // greenhouse green
  loft:    PAL.wallRose,    // dusty rose
};

const floaties = [];   // { text, x, y, vy, life, ttl }
const puffs    = [];   // { x, y, kind, life, ttl }
const toasts   = [];   // { text, life, ttl }
const sparkles = [];   // { x, y, vx, vy, life, ttl, color }
const vegPops  = [];   // { x, y, life, ttl, amount } — pixel tomato + "+N"

// minimal 3×5 pixel glyphs for the veg pop (digits + plus sign)
const POP_GLYPHS = {
  0: ["111","101","101","101","111"], 1: ["010","110","010","010","111"],
  2: ["111","001","111","100","111"], 3: ["111","001","111","001","111"],
  4: ["101","101","111","001","001"], 5: ["111","100","111","001","111"],
  6: ["111","100","111","101","111"], 7: ["111","001","010","010","010"],
  8: ["111","101","111","101","111"], 9: ["111","101","111","001","111"],
  "+": ["000","010","111","010","000"],
};

// A harvest pop: pixel tomato + "+N", floats up from the planters.
export function vegPop(x, y, amount = 1) {
  vegPops.push({ x, y, life: 0, ttl: 1.6, amount });
}

export function floatText(text, x, y, color = "#000000", { ttl = 1.6, plain = false } = {}) {
  floaties.push({ text, x, y, vy: -14, life: 0, ttl, color, plain });
}

export function coinPop(x, y, amount = 1) {
  floatText(`+${amount}`, x, y, PAL.coin, { ttl: 1.2 });
  for (let i = 0; i < 4; i++) {
    sparkles.push({
      x, y,
      vx: Math.cos(i * 1.57 + 0.4) * 18,
      vy: Math.sin(i * 1.57 + 0.4) * 14 - 12,
      life: 0, ttl: 0.6, color: PAL.coin,
    });
  }
}

export function smokePuff(x, y) {
  for (let i = 0; i < 6; i++) {
    puffs.push({
      x: x + (i % 3) * 4 - 4, y: y - (i / 2) * 3,
      kind: "smoke", life: -i * 0.06, ttl: 1.1,
    });
  }
}

export function heartPop(x, y) {
  for (let i = 0; i < 3; i++) {
    sparkles.push({
      x: x + i * 3 - 3, y,
      vx: (i - 1) * 8, vy: -22 - i * 4,
      life: 0, ttl: 1.0, color: PAL.heart, heart: true,
    });
  }
}

export function toast(text, { room = null, user = null } = {}) {
  const ttl = Math.max(0.5, settings.toasts.seconds || 2.6);
  // De-dupe identical live toasts (chat spam friendly).
  const dup = toasts.find(t => t.text === text);
  if (dup) {
    dup.ttl = Math.max(dup.ttl, dup.life + ttl);
    return;
  }
  // Fixed rows: take the lowest free row and keep it — messages never shift,
  // a new one simply replaces whatever row frees up (or evicts the oldest).
  const max = Math.max(1, Math.round(settings.toasts.max));
  const used = new Set(toasts.map(t => t.row));
  let row = -1;
  for (let i = 0; i < max; i++) if (!used.has(i)) { row = i; break; }
  if (row === -1) {
    row = toasts[0].row;    // array is push-ordered, so [0] is the oldest
    toasts.shift();
  }
  toasts.push({ text, life: 0, ttl, room, user, row });
}

export function update(dt) {
  for (const f of floaties) { f.life += dt; f.y += f.vy * dt; f.vy *= 0.96; }
  for (const p of puffs)    { p.life += dt; p.y -= 10 * dt; }
  for (const t of toasts)   { t.life += dt; }
  // if the streamer lowers the row count live, drop rows that no longer fit
  const max = Math.max(1, Math.round(settings.toasts.max));
  for (let i = toasts.length - 1; i >= 0; i--) {
    if (toasts[i].row >= max) toasts.splice(i, 1);
  }
  for (const s of sparkles) {
    s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt;
  }
  for (const v of vegPops) { v.life += dt; v.y -= 12 * dt; }
  cull(floaties); cull(puffs); cull(toasts); cull(sparkles); cull(vegPops);
}

function cull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].life >= arr[i].ttl) arr.splice(i, 1);
  }
}

// ---- pixel layer (game canvas) ----

export function draw(c) {
  for (const s of sparkles) {
    if (s.life < 0) continue;
    const a = 1 - s.life / s.ttl;
    c.globalAlpha = a;
    c.fillStyle = s.color;
    if (s.heart) {
      const x = Math.round(s.x), y = Math.round(s.y);
      c.fillRect(x, y, 2, 2);
      c.fillRect(x + 3, y, 2, 2);
      c.fillRect(x, y + 1, 5, 2);
      c.fillRect(x + 1, y + 3, 3, 1);
      c.fillRect(x + 2, y + 4, 1, 1);
    } else {
      c.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
  }
  c.globalAlpha = 1;

  for (const p of puffs) {
    if (p.life < 0) continue;
    const ph = p.life / p.ttl;
    c.globalAlpha = 0.5 * (1 - ph);
    const sz = 2 + Math.round(ph * 5);
    c.fillStyle = PAL.smoke;
    c.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
  }
  c.globalAlpha = 1;

  // harvest pops: pixel tomato sprite + chunky "+N"
  for (const v of vegPops) {
    const ph = v.life / v.ttl;
    c.globalAlpha = ph > 0.6 ? 1 - (ph - 0.6) / 0.4 : 1;
    const x = Math.round(v.x), y = Math.round(v.y);
    c.drawImage(PLANTS.tomato, x, y, 16, 12);   // 8×6 sprite at 2×
    const str = "+" + v.amount;
    let gx = x + 19;
    for (const ch of str) {
      const g = POP_GLYPHS[ch];
      if (!g) continue;
      for (let ry = 0; ry < 5; ry++) {
        for (let rx = 0; rx < 3; rx++) {
          if (g[ry][rx] !== "1") continue;
          c.fillStyle = "#1e2a18";
          c.fillRect(gx + rx * 2 + 1, y + 2 + ry * 2 + 1, 2, 2);
          c.fillStyle = "#eaffea";
          c.fillRect(gx + rx * 2, y + 2 + ry * 2, 2, 2);
        }
      }
      gx += 8;
    }
  }
  c.globalAlpha = 1;
}

// ---- overlay layer (high-res Arial) ----

// Speech bubble, centered on (x, y), optional tail. Background/text colours
// and font come from the theme settings.
export function bubble(o, text, x, y, { alpha = 1, tail = true, size = 7 } = {}) {
  const th = settings.theme;
  o.font = `600 ${size}px ${th.uiFont}, sans-serif`;
  o.textAlign = "center";
  o.textBaseline = "middle";
  const w = o.measureText(text).width + 7;
  const h = size + 5;
  const bx = x - w / 2, by = y - h / 2;

  o.globalAlpha = alpha;
  o.fillStyle = th.bubbleBg;
  o.strokeStyle = "rgba(0,0,0,0.35)";
  o.lineWidth = 0.5;
  o.beginPath();
  o.roundRect(bx, by, w, h, 3);
  o.fill();
  o.stroke();
  if (tail) {
    o.beginPath();
    o.moveTo(x - 2.5, by + h - 0.5);
    o.lineTo(x + 2.5, by + h - 0.5);
    o.lineTo(x, by + h + 3);
    o.closePath();
    o.fill();
  }
  o.fillStyle = th.bubbleText;
  o.fillText(text, x, y + 0.5);
  o.globalAlpha = 1;
}

export function drawOverlay(o) {
  for (const f of floaties) {
    const ph = f.life / f.ttl;
    const alpha = ph > 0.7 ? 1 - (ph - 0.7) / 0.3 : 1;
    if (f.plain) {
      // bare floating text (no bubble) — e.g. "name ❤️" rising off the furnace
      o.font = `700 7px ${settings.theme.uiFont}, sans-serif`;
      o.textAlign = "center";
      o.textBaseline = "middle";
      o.globalAlpha = alpha * 0.6;
      o.fillStyle = "rgba(20,10,8,0.8)";
      o.fillText(f.text, f.x, f.y + 0.7);
      o.globalAlpha = alpha;
      o.fillStyle = f.color;
      o.fillText(f.text, f.x, f.y);
      o.globalAlpha = 1;
    } else {
      bubble(o, f.text, f.x, f.y, { alpha });
    }
  }
}

// Toasts stack as full-width bars — black Arial text on a background that
// matches the room the message is about (white if roomless). Position
// (above/below the game rooms) comes from settings; `anchors` supplies the
// starting y for each. Above stacks upward, below stacks downward.
export function drawToasts(o, vp, anchors) {
  const rowH = 13;
  const above = settings.toasts.position === "above";
  for (const t of toasts) {
    const ph = t.life / t.ttl;
    const a = ph < 0.1 ? ph / 0.1 : ph > 0.75 ? 1 - (ph - 0.75) / 0.25 : 1;
    // Fixed rows — no shifting: row 0 sits nearest the building on either side.
    const ry = above
      ? anchors.above - t.row * (rowH + 2) - rowH
      : anchors.below + t.row * (rowH + 2);
    o.globalAlpha = Math.max(0, a) * 0.95;
    o.fillStyle = ROOM_TOAST_BG[t.room] ?? settings.theme.bubbleBg;
    o.fillRect(vp.x, ry, vp.w, rowH);
    o.textBaseline = "middle";

    const st = settings.toasts;
    const baseFont = `600 8px ${st.font}, sans-serif`;
    const cx = vp.x + vp.w / 2, cy = ry + rowH / 2 + 0.5;

    // Username in its own font/colour, if this message starts with one.
    if (st.userStyled && t.user && t.text.startsWith(t.user)) {
      const rest = t.text.slice(t.user.length);
      const userFont = `600 8px ${st.userFont}, sans-serif`;
      o.font = userFont;
      const uw = o.measureText(t.user).width;
      o.font = baseFont;
      const rw = o.measureText(rest).width;
      let x = cx - (uw + rw) / 2;
      o.textAlign = "left";
      o.font = userFont;
      o.fillStyle = st.userColor;
      o.fillText(t.user, x, cy);
      x += uw;
      o.font = baseFont;
      o.fillStyle = st.textColor;
      o.fillText(rest, x, cy);
    } else {
      o.font = baseFont;
      o.fillStyle = st.textColor;
      o.textAlign = "center";
      o.fillText(t.text, cx, cy);
    }
    o.globalAlpha = 1;
  }
}
