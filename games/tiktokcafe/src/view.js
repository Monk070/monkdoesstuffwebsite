// Dynamic game rendering: everything the game state puts on screen each
// frame — players, customers, tickets, gauges, HUD. Reads state, never writes.
//
// Two passes: draw() on the pixel canvas (sprites, bars, icons only), then
// drawOverlay() on the high-res overlay for ALL text — plain black Arial,
// on small white chips wherever the background is dark. No bitmap text.

import { L, W, BUILDING } from "./scene.js";
import { state, activeIn, activeCooks, frozen, styleFor, ANIMAL_SINGULAR } from "./game.js";
import { settings, firstAlias } from "./settings.js";
import { playerSprite, customerSprite, flipFor, DISHES, DISHES_BURNT, MINI_PETS } from "./sprites.js";
import { PAL } from "./palette.js";
import { setRect, selectedKey, offset } from "./label-editor.js";
import * as fx from "./fx.js";

// Character sprite scale — 1×/2×/3×, set in ⚙ Settings (Display).
const charScale = () => settings.display.charScale || 3;
const ROOMS = ["kitchen", "counter", "garden", "loft"];

let tags = [];                         // name tags   — rebuilt each frame
let texts = [];                        // Arial texts — rebuilt each frame

function say(str, x, y, opts = {}) {
  texts.push({ str, x, y, size: 6, align: "center", chip: false, ...opts });
}

export function draw(c, t) {
  tags = [];
  texts = [];
  drawPlayers(c, t);
  drawCustomers(c, t);
  drawBigTickets(c, t);
  drawPassDishes(c);
  drawFuelGauge(c);
  drawResourceMeters(c);
  queueRoomPlates();
  queueHud(t);
  fx.draw(c);
}

// High-res overlay pass — all text, name tags, speech bubbles, toasts, banner.
export function drawOverlay(o, t, vp) {
  for (const e of texts) otext(o, e);
  drawSignTitle(o, t);
  drawCoins(o);
  drawStatus(o);
  if (bigTicketsRect) {
    setRect("orders", bigTicketsRect);
    if (selectedKey() === "orders") {
      o.strokeStyle = "#4a90ff";
      o.lineWidth = 1;
      o.setLineDash([3, 2]);
      o.strokeRect(bigTicketsRect.x, bigTicketsRect.y, bigTicketsRect.w, bigTicketsRect.h);
      o.setLineDash([]);
    }
  }
  const nm = settings.names;
  tags.forEach((tag, i) => {
    fx.bubble(o, tag.text, tag.x, tag.y, { size: nm.size, tail: nm.mode !== "chest" });
    // clickable for arrow-key nudging (moves ALL name tags together)
    o.font = `600 ${nm.size}px ${settings.theme.uiFont}, sans-serif`;
    const w = o.measureText(tag.text).width + 7, h = nm.size + 5;
    setRect(`names#${i}`, { x: tag.x - w / 2, y: tag.y - h / 2, w, h });
    if (selectedKey()?.startsWith("names")) {
      o.strokeStyle = "#4a90ff";
      o.lineWidth = 1;
      o.setLineDash([3, 2]);
      o.strokeRect(tag.x - w / 2 - 2, tag.y - h / 2 - 2, w + 4, h + 4);
      o.setLineDash([]);
    }
  });
  fx.drawOverlay(o);
  fx.drawToasts(o, vp, { below: L.street.y + 16, above: BUILDING.top - 6 });
  drawBanner(o, t, vp);

  // gift freezes pause every timer for 30s — show a countdown so a frozen
  // café reads as "frozen", not "stalled"
  if (frozen()) {
    otext(o, {
      str: `timers frozen: ${Math.ceil(state.freezeUntil - state.clock)}s`,
      x: vp.x + vp.w / 2, y: L.divider.y + 16,
      size: 7, align: "center", chip: true, chipBg: "#cdeef0",
    });
  }

  // nudge-mode hint while a label is selected
  if (selectedKey()) {
    otext(o, {
      str: "arrow keys to move · shift = 5px · esc to finish",
      x: vp.x + vp.w / 2, y: vp.y + vp.h - 18,
      size: 7, align: "center", chip: true,
    });
  }
}

// ---- Arial text with optional white chip background ----

function otext(o, e) {
  const th = settings.theme;
  const style = e.style ? e.style + " " : "";
  o.font = `${style}${e.size}px ${e.font ?? th.uiFont}, sans-serif`;
  o.textAlign = e.align;
  o.textBaseline = "middle";
  o.globalAlpha = e.alpha ?? 1;
  const w = o.measureText(e.str).width + 6;
  const h = e.size + 4;
  const bx = e.align === "left" ? e.x - 3 : e.align === "right" ? e.x - w + 3 : e.x - w / 2;
  if (e.chip) {
    o.fillStyle = e.chipBg ?? th.bubbleBg;
    o.beginPath();
    o.roundRect(bx, e.y - h / 2, w, h, 2);
    o.fill();
  }
  o.fillStyle = e.color ?? th.bubbleText;
  o.fillText(e.str, e.x, e.y + 0.5);
  o.globalAlpha = 1;

  // clickable/nudgeable labels: register hit box + draw selection outline
  if (e.id) {
    setRect(e.id, { x: bx, y: e.y - h / 2, w, h });
    if (selectedKey() === e.id) {
      o.strokeStyle = "#4a90ff";
      o.lineWidth = 1;
      o.setLineDash([3, 2]);
      o.strokeRect(bx - 2, e.y - h / 2 - 2, w + 4, h + 4);
      o.setLineDash([]);
    }
  }
}

// ---- crisp pixel lettering (3×5 glyphs drawn as scaled rects) ----
// Used for the coin counter and the marquee sign title — pixel look without
// the blur of scaling a tiny canvas font.

const GLYPHS_35 = {
  0: ["111","101","101","101","111"], 1: ["010","110","010","010","111"],
  2: ["111","001","111","100","111"], 3: ["111","001","111","001","111"],
  4: ["101","101","111","001","001"], 5: ["111","100","111","001","111"],
  6: ["111","100","111","101","111"], 7: ["111","001","010","010","010"],
  8: ["111","101","111","101","111"], 9: ["111","101","111","001","111"],
  A: ["010","101","111","101","101"], B: ["110","101","110","101","110"],
  C: ["011","100","100","100","011"], D: ["110","101","101","101","110"],
  E: ["111","100","110","100","111"], F: ["111","100","110","100","100"],
  G: ["011","100","101","101","011"], H: ["101","101","111","101","101"],
  I: ["111","010","010","010","111"], J: ["001","001","001","101","010"],
  K: ["101","110","100","110","101"], L: ["100","100","100","100","111"],
  M: ["101","111","111","101","101"], N: ["101","111","111","111","101"],
  O: ["010","101","101","101","010"], P: ["110","101","110","100","100"],
  Q: ["010","101","101","110","011"], R: ["110","101","110","110","101"],
  S: ["011","100","010","001","110"], T: ["111","010","010","010","010"],
  U: ["101","101","101","101","011"], V: ["101","101","101","010","010"],
  W: ["101","101","111","111","101"], X: ["101","101","010","101","101"],
  Y: ["101","101","010","010","010"], Z: ["111","001","010","100","111"],
  "!": ["010","010","010","000","010"], "'": ["010","010","000","000","000"],
  "-": ["000","000","111","000","000"], ".": ["000","000","000","000","010"],
  ":": ["000","010","000","010","000"], "&": ["010","101","010","101","011"],
  " ": ["000","000","000","000","000"],
};

function pixelTextWidth(str, s) {
  return str.length * 4 * s - s;
}

// Draws crisp scaled-rect pixel text. align: left | center | right.
function drawPixelText(o, str, x, y, s, color, shadow = null, align = "left") {
  str = String(str).toUpperCase();
  const w = pixelTextWidth(str, s);
  let cx = align === "center" ? Math.round(x - w / 2) : align === "right" ? Math.round(x - w) : x;
  for (const ch of str) {
    const g = GLYPHS_35[ch] ?? GLYPHS_35["."];
    for (let ry = 0; ry < 5; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (g[ry][rx] !== "1") continue;
        if (shadow) { o.fillStyle = shadow; o.fillRect(cx + rx * s + 1, y + ry * s + 1, s, s); }
        o.fillStyle = color;
        o.fillRect(cx + rx * s, y + ry * s, s, s);
      }
    }
    cx += 4 * s;
  }
}

const COIN_GRID = [
  ".gggg.",
  "gllllg",
  "glccdg",
  "glccdg",
  "gddddg",
  ".gggg.",
];
const COIN_COLS = { g: "#8a5a26", l: "#ffe08a", c: "#f2c14e", d: "#c8963a" };

// ---- marquee sign title — gold pixel lettering, customizable text ----

function drawSignTitle(o, t) {
  const text = String(settings.sign.text ?? "").trim();
  if (!text) return;
  const off = offset("sign");
  const s = 2;
  const cx = 180 + off.dx;
  const top = 157 + off.dy;

  const flicker = 0.85 + 0.15 * Math.sin(t * 2.3);
  o.globalAlpha = flicker;
  drawPixelText(o, text, cx, top, s, PAL.signText ?? "#ffd98a", "#2c1520", "center");
  o.globalAlpha = 1;

  const w = pixelTextWidth(text.toUpperCase(), s);
  const box = { x: cx - w / 2 - 2, y: top - 2, w: w + 4, h: 5 * s + 4 };
  setRect("sign", box);
  if (selectedKey() === "sign") {
    o.strokeStyle = "#4a90ff";
    o.lineWidth = 1;
    o.setLineDash([3, 2]);
    o.strokeRect(box.x, box.y, box.w, box.h);
    o.setLineDash([]);
  }
}

// served counter — gold pixel lettering to match the sign, nudgeable
function drawStatus(o) {
  const off = offset("status");
  const s = 2;
  const str = `SERVED: ${state.served}`;
  const x = 34 + off.dx, y = L.street.y + 4 + off.dy;
  drawPixelText(o, str, x, y, s, PAL.signText ?? "#ffd98a", "#2c1520", "left");
  const w = pixelTextWidth(str, s);
  const box = { x: x - 2, y: y - 2, w: w + 4, h: 5 * s + 4 };
  setRect("status", box);
  if (selectedKey() === "status") {
    o.strokeStyle = "#4a90ff";
    o.lineWidth = 1;
    o.setLineDash([3, 2]);
    o.strokeRect(box.x, box.y, box.w, box.h);
    o.setLineDash([]);
  }
}

function drawCoins(o) {
  const off = offset("coins");
  const s = 2;              // 2 world px per glyph pixel — chunky and clear
  const right = L.hud.coins.x + off.dx;
  const top = 157 + off.dy;
  const numStr = String(state.coins);
  drawPixelText(o, numStr, right, top, s, "#f2c14e", "#2c1520", "right");
  const numLeft = right - pixelTextWidth(numStr, s);

  // coin icon left of the number
  const cs = 2;
  const cx = numLeft - 6 * cs - 4, cy = top - 1;
  for (let ry = 0; ry < 6; ry++) {
    for (let rx = 0; rx < 6; rx++) {
      const col = COIN_COLS[COIN_GRID[ry][rx]];
      if (col) { o.fillStyle = col; o.fillRect(cx + rx * cs, cy + ry * cs, cs, cs); }
    }
  }

  const box = { x: cx - 2, y: cy - 2, w: right - cx + 4, h: 6 * cs + 4 };
  setRect("coins", box);
  if (selectedKey() === "coins") {
    o.strokeStyle = "#4a90ff";
    o.lineWidth = 1;
    o.setLineDash([3, 2]);
    o.strokeRect(box.x, box.y, box.w, box.h);
    o.setLineDash([]);
  }
}

// tiny pixel heart icon (game canvas), scalable
function pixelHeart(c, x, y, color, s = 1) {
  c.fillStyle = color;
  c.fillRect(x, y, 2 * s, 2 * s);
  c.fillRect(x + 3 * s, y, 2 * s, 2 * s);
  c.fillRect(x, y + s, 5 * s, 2 * s);
  c.fillRect(x + s, y + 3 * s, 3 * s, s);
  c.fillRect(x + 2 * s, y + 4 * s, s, s);
}

// meter size multiplier (⚙ Settings → Theme)
const meterScale = () => Math.max(0.5, settings.theme.meterScale || 1);

// ---- players at their room spots (fixed slots — nobody stacks) ----

function walkFor(room) {
  return room === "garden" || room === "loft" ? L.walkY.upper : L.walkY.ground;
}

function drawPlayers(c, t) {
  for (const room of ROOMS) {
    const spots = L.spots[room];
    const slotIds = state.slots[room];
    let shown = 0;

    slotIds.forEach((id, i) => {
      if (!id) return;
      const p = state.players.get(id);
      if (!p) return;
      shown++;

      const spot = spots[i];
      // same character everywhere — the chef's hat goes on in kitchen/counter
      const isChefRoom = room === "kitchen" || room === "counter";
      const stl = styleFor(p.id, p.name);
      const ghost = stl.form === "ghost";
      const spr = playerSprite(p.name, {
        hat: isChefRoom ? (p.goldHat ? "gold" : "chef") : null,
        style: stl,
      });
      const w = spr.width * charScale(), h = spr.height * charScale();

      const acting = state.clock - (p.actionAt ?? -99) < 0.9;
      // ghosts hover and wiggle in place; everyone else bobs (lift only —
      // feet never sink)
      const bob = ghost
        ? Math.round(Math.sin(t * 2.2 + i * 1.7) * 2) - 1
        : (!acting && Math.sin(t * 2.6 + i * 2.1) > 0 ? -1 : 0);
      const wiggle = ghost ? Math.round(Math.sin(t * 3.4 + i * 2.3) * 1.5) : 0;
      const x = Math.round(spot.x - w / 2) + wiggle;
      const y = walkFor(room) - h + bob;

      c.save();
      if (ghost) c.globalAlpha = 0.88;
      if (flipFor(p.name)) {
        c.translate(x + w, y);
        c.scale(-1, 1);
        c.drawImage(spr, 0, 0, w, h);
      } else {
        c.drawImage(spr, x, y, w, h);
      }
      c.restore();

      // adopted pet — sits at the feet and follows its owner between rooms
      if (stl.pet && MINI_PETS[stl.pet]) {
        const ps = MINI_PETS[stl.pet];
        const pw = ps.width * 2, ph = ps.height * 2;
        const flip = flipFor(p.name);
        const petX = Math.round(flip ? spot.x - w / 2 - pw + 4 : spot.x + w / 2 - 4);
        const petY = walkFor(room) - ph + (Math.sin(t * 3 + i) > 0.3 ? -1 : 0);
        c.save();
        if (flip) {
          c.translate(petX + pw, petY);
          c.scale(-1, 1);
          c.drawImage(ps, 0, 0, pw, ph);
        } else {
          c.drawImage(ps, petX, petY, pw, ph);
        }
        c.restore();
      }

      // action flourish: a tool flash near the hands
      if (acting) {
        const fxX = spot.x + (flipFor(p.name) ? -w / 2 : w / 2 - 8);
        c.fillStyle = PAL.metalLight;
        c.fillRect(Math.round(fxX), y + Math.round(h * 0.55) + (Math.floor(t * 12) % 2) * 2, 6, 2);
      }

      // name tag — bubble above the head or badge on the chest (⚙ Settings)
      const nm = settings.names;
      const label = p.name.slice(0, Math.max(3, Math.round(nm.maxChars || 10)));
      const ty = nm.mode === "chest" ? y + Math.round(h * 0.58) : y - 7;
      tags.push({ text: label, x: spot.x + nm.dx, y: ty + nm.dy });
    });

    // overflow badge — active players beyond the visible spots (nudgeable)
    const extra = activeIn(room) - shown;
    if (extra > 0) {
      const r = L.rooms[room];
      const off = offset("over-" + room);
      say(`+${extra}`, r.x + r.w - 5 + off.dx, r.y + 23 + off.dy,
        { chip: true, align: "right", size: 5, id: "over-" + room });
    }
  }
}

// ---- customers on stools ----

function drawCustomers(c, t) {
  for (const cu of state.customers) {
    const st = L.stools[cu.stool];
    if (!st) continue;
    // viewers who seated themselves keep their own customized character
    const spr = cu.viewer && cu.uid
      ? playerSprite(cu.name, { style: styleFor(cu.uid, cu.name) })
      : customerSprite(cu.name);
    const w = spr.width * charScale(), h = spr.height * charScale();
    const seatY = st.y - 12;                    // stool seat top
    let y = seatY - h;
    let alpha = 1;

    if (cu.state === "happy") {
      y -= Math.round(Math.abs(Math.sin(cu.life * 6)) * 3);
      if (cu.life > 2) alpha = 1 - (cu.life - 2);
    } else if (cu.state === "leaving") {
      alpha = Math.max(0, 1 - cu.life / 1.5);
    } else if (Math.sin(t * 2 + cu.stool * 3) > 0.6) {
      y -= 1;
    }

    c.globalAlpha = Math.max(0, alpha);
    c.drawImage(spr, Math.round(st.x - w / 2), Math.round(y), w, h);

    // viewers who seated themselves with !customer get their name tag
    if (cu.viewer && cu.state === "waiting") {
      const nm = settings.names;
      const label = cu.name.slice(0, Math.max(3, Math.round(nm.maxChars || 10)));
      const ty = nm.mode === "chest" ? y + Math.round(h * 0.58) : y - 10;
      tags.push({ text: label, x: st.x + nm.dx, y: ty + nm.dy });
    }

    // waiting patience bar — green fill over a red background, black border,
    // so the depletion reads clearly at a glance
    if (cu.state === "waiting") {
      const ticket = state.tickets.find(tk => tk.id === cu.ticketId);
      if (ticket && ticket.state !== "done") {
        const sla = Math.max(10, settings.timers.orderSeconds) * (1 + state.vibe / 200);
        const fr = Math.max(0, 1 - ticket.age / sla);
        const bx = Math.round(st.x - 8), by = Math.round(y - 6);
        c.fillStyle = "#000000";
        c.fillRect(bx - 1, by - 1, 18, 5);           // 1px border
        c.fillStyle = "#b02020";
        c.fillRect(bx, by, 16, 3);                   // red background
        c.fillStyle = PAL.good;
        c.fillRect(bx, by, Math.round(16 * fr), 3);  // green remaining
      }
    }
    c.globalAlpha = 1;
  }
}

// ---- large readable order tickets, centered under the rooms ----
// Position, whole-ticket scale, font family/size/style and text colour all
// come from ⚙ Settings → Order tickets. Click the row + arrows to move it.

let bigTicketsRect = null;   // hit box for click-to-nudge, set each frame

function drawBigTickets(c, t) {
  const bt = settings.bigTickets;
  const k = Math.max(0.4, bt.scale || 1);
  const tw = Math.round(52 * k), th = Math.round(46 * k), gap = Math.round(8 * k);
  const fBase = Math.max(4, (bt.fontSize || 6) * k);
  const fStyle = bt.fontStyle === "normal" ? "" : bt.fontStyle;
  const txt = { font: bt.font, style: fStyle, color: bt.color };

  const live = state.tickets.slice(0, 4);
  const n = live.length;
  if (!n) { bigTicketsRect = null; return; }
  // Fixed columns: the row is always sized for maxOrders slots, and each
  // ticket sits in its assigned column — no repositioning as tickets come/go.
  const cols = Math.max(1, Math.min(4, Math.round(settings.timers.maxOrders ?? 3)));
  const totalW = cols * tw + (cols - 1) * gap;
  const x0 = Math.round(bt.x - totalW / 2);
  const y = Math.round(bt.y);
  bigTicketsRect = { x: x0 - 2, y: y - 4, w: totalW + 4, h: th + 6 };
  const sla = Math.max(10, settings.timers.orderSeconds) * (1 + state.vibe / 200);

  live.forEach((tk, i) => {
    const x = x0 + Math.min(tk.col ?? i, cols - 1) * (tw + gap);
    const failed = tk.state === "done" && tk.outcome !== "plated";
    const fade = tk.state === "done" ? Math.max(0, 1 - (state.clock - tk.doneAt) / 2.5) : 1;
    const alpha = fade * (failed ? 0.75 : 1);
    if (alpha <= 0) return;

    c.globalAlpha = alpha;
    c.fillStyle = "rgba(10,8,14,0.5)";
    c.fillRect(x + 2, y + 2, tw, th);
    if (frozen() && tk.state !== "done") {
      c.fillStyle = "#9fd4d8";
      c.fillRect(x - 1, y - 1, tw + 2, th + 2);
    }
    c.fillStyle = tk.state === "ready" ? "#fff3d0" : PAL.ticket;
    c.fillRect(x, y, tw, th);
    c.fillStyle = PAL.ticketSh;
    c.fillRect(x, y + th - 2, tw, 2);
    c.fillStyle = PAL.metalDark;
    c.fillRect(x + tw / 2 - 4 * k, y - 2, Math.round(8 * k), 3);

    const mid = x + tw / 2;
    say(tk.recipe.name.toLowerCase(), mid, y + 6 * k, { ...txt, size: fBase, alpha });

    if (tk.state === "open") {
      // one line per needed action: "!chop" + fill boxes
      let ly = y + 17 * k;
      const box = Math.round(5 * k), step = Math.round(7 * k);
      for (const s of tk.slots) {
        say("!" + s.verb, x + 4 * k, ly, { ...txt, size: fBase - k, align: "left", alpha });
        const boxesX = x + tw - 4 * k - s.need * step;
        for (let b = 0; b < s.need; b++) {
          c.fillStyle = b < s.have ? PAL.good : "#cbbd9d";
          c.fillRect(Math.round(boxesX + b * step), Math.round(ly - 2 * k), box, box);
        }
        ly += 9 * k;
      }
    } else if (tk.state === "cooking") {
      say("cooking...", mid, y + 20 * k, { ...txt, size: fBase, alpha });
      const fr = 1 - tk.cookLeft / Math.max(1, settings.timers.cookSeconds);
      c.fillStyle = PAL.copper;
      c.fillRect(x + 4, y + Math.round(29 * k), Math.round((tw - 8) * Math.max(0, Math.min(1, fr))), Math.round(4 * k));
    } else if (tk.state === "ready") {
      const urgent = tk.plateLeft < 5;
      if (!urgent || Math.floor(t * 4) % 2 === 0) {
        say("!" + firstAlias("plate"), mid, y + 20 * k,
          { ...txt, size: fBase + k, alpha, color: urgent ? PAL.bad : bt.color });
      }
      const fr = tk.plateLeft / Math.max(2, settings.timers.plateSeconds);
      c.fillStyle = urgent ? PAL.bad : PAL.good;
      c.fillRect(x + 4, y + Math.round(29 * k), Math.round((tw - 8) * Math.max(0, fr)), Math.round(4 * k));
    } else if (tk.state === "pass") {
      say("!" + firstAlias("serve"), mid, y + 20 * k, { ...txt, size: fBase + k, alpha });
      const fr = 1 - tk.passAge / Math.max(2, settings.timers.serveSeconds);
      c.fillStyle = "#b0619c";
      c.fillRect(x + 4, y + Math.round(29 * k), Math.round((tw - 8) * Math.max(0, fr)), Math.round(4 * k));
    } else {
      const msg = tk.outcome === "plated" ? "served!" : tk.outcome === "burnt" ? "burnt!" : "left...";
      say(msg, mid, y + 22 * k, { ...txt, size: fBase + k, alpha, color: tk.outcome === "plated" ? "#3d7a3d" : PAL.bad });
    }

    // customer patience strip along the bottom
    if (tk.state !== "done") {
      const fr = Math.max(0, Math.min(1, 1 - tk.age / sla));
      c.fillStyle = fr > 0.5 ? PAL.good : fr > 0.25 ? PAL.coin : PAL.bad;
      c.fillRect(x + 3, y + th - Math.round(6 * k), Math.round((tw - 6) * fr), Math.round(3 * k));
    }
    c.globalAlpha = 1;
  });
}

// ---- dishes waiting on the pass shelf ----

function drawPassDishes(c) {
  const passing = state.tickets.filter(tk => tk.state === "pass");
  passing.slice(0, 2).forEach((tk, i) => {
    const dish = DISHES[tk.recipe.dish ?? tk.recipe.id] ?? DISHES.toastie;
    c.drawImage(dish, L.pass.x + L.pass.w + 1 + i * 4, L.pass.y + L.pass.h - 8 - i * 2);
  });
  const burnt = state.tickets.find(tk => tk.state === "done" && tk.outcome === "burnt");
  if (burnt) {
    const dish = DISHES_BURNT[burnt.recipe.dish ?? burnt.recipe.id] ?? DISHES_BURNT.toastie;
    c.drawImage(dish, L.rooms.kitchen.x + 108, L.walkY.ground - 34);
  }
}

// ---- stove fuel gauge (fed by likes) ----

function drawFuelGauge(c) {
  const s = meterScale();
  const x = L.fuel.x, y = L.fuel.y;
  const gw = Math.round(6 * s), gh = Math.round(22 * s);
  const fr = state.fuel / state.fuelMax;
  c.fillStyle = "rgba(20,14,22,0.6)";
  c.fillRect(x - 1, y - 1, gw + 2, gh + 2);
  c.fillStyle = "#3a2a30";
  c.fillRect(x, y, gw, gh);
  const fh = Math.round(gh * fr);
  c.fillStyle = fr > 0.5 ? PAL.fire1 : fr > 0.2 ? PAL.fire2 : PAL.bad;
  c.fillRect(x, y + gh - fh, gw, fh);
  pixelHeart(c, x, y - 2 - Math.round(5 * s), "#e03131", s);
  if (fr < 0.2) say("likes = fuel", x + 3, y - 10 - Math.round(5 * s), { chip: true, size: 5 });
}

// ---- veg pantry, garden growth, cat vibe ----

function drawResourceMeters(c) {
  // veg counter — in BOTH kitchen and garden so the supply chain reads.
  // Font/size/style/colours in ⚙ Settings → Veg counter; each is nudgeable.
  const vc = settings.vegCounter;
  const vegStr = `Food ${Math.max(0, Math.round(state.veg))}`;
  const vegOpts = {
    chip: true, align: "left",
    size: Math.max(4, vc.size),
    font: vc.font,
    style: vc.style === "normal" ? "" : vc.style,
    color: state.veg > 0 ? vc.color : PAL.bad,
    chipBg: vc.bg,
  };
  const vegIcon = (x, y) => {
    c.fillStyle = PAL.tomato;
    c.fillRect(x, y + 2, 4, 4);
    c.fillStyle = PAL.leafLight;
    c.fillRect(x + 1, y, 2, 2);
  };

  const k = L.rooms.kitchen;
  const vk = offset("veg-kitchen");
  vegIcon(k.x + 6 + vk.dx, k.y + 20 + vk.dy);
  say(vegStr, k.x + 14 + vk.dx, k.y + 24 + vk.dy, { ...vegOpts, id: "veg-kitchen" });

  // growth pips + veg counter — garden
  const s = meterScale();
  const g = L.rooms.garden;
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i < state.growth ? PAL.leafLight : "rgba(20,14,22,0.35)";
    c.fillRect(g.x + 6 + i * Math.round(6 * s), g.y + 22, Math.round(4 * s), Math.round(4 * s));
  }
  const vg = offset("veg-garden");
  const gvx = g.x + 8 + Math.round(18 * s);
  vegIcon(gvx + vg.dx, g.y + 20 + vg.dy);
  say(vegStr, gvx + 8 + vg.dx, g.y + 24 + vg.dy, { ...vegOpts, id: "veg-garden" });

  // vibe bar — loft (heart colour is themable)
  const cl = L.rooms.loft;
  const vibeCol = settings.theme.vibeColor;
  pixelHeart(c, cl.x + 6, cl.y + 21, vibeCol, s);
  const bx = cl.x + 8 + Math.round(6 * s), bw = Math.round(26 * s), bh = Math.round(3 * s);
  const by = cl.y + 21 + Math.round(2 * s);
  c.fillStyle = "rgba(20,14,22,0.4)";
  c.fillRect(bx, by, bw, bh);
  c.fillStyle = vibeCol;
  c.fillRect(bx, by, Math.round(bw * state.vibe / 100), bh);
}

// ---- room name plates ----

function queueRoomPlates() {
  // rooms whose sign also advertises their main action verb
  const roomVerb = { garden: "water", counter: "serve", loft: "pet" };
  for (const key of Object.keys(L.rooms)) {
    const r = L.rooms[key];
    const off = offset(key);
    // the loft is named after whoever lives there (!animal cycles species)
    const label = key === "loft"
      ? `${ANIMAL_SINGULAR[state.animal] ?? "cat"} loft`
      : r.label.toLowerCase();
    let text = `${label} · !${firstAlias(key)}`;
    if (roomVerb[key]) text += ` !${firstAlias(roomVerb[key])}`;
    say(text, r.x + 6 + off.dx, r.y + 10 + off.dy,
      { chip: true, align: "left", size: 6, id: key });
  }
}

// ---- HUD ----

function queueHud(t) {
  // (coins + served counter render as pixel art — see drawOverlay)

  const cooks = activeCooks();

  // call-to-action — text/position/size in ⚙ Settings; click + arrows to move.
  // Stays visible while selected so it can be positioned even mid-game.
  const editing = selectedKey() === "cta";
  if (editing || (cooks === 0 && Math.floor(t * 0.5) % 2 === 0)) {
    const cta = settings.cta;
    const msg = cta.text || `type !${firstAlias("kitchen")} to cook`;
    say(msg, cta.x, cta.y, { chip: true, size: cta.size, id: "cta" });
  }
}

// ---- gift banner (overlay bubble, slightly larger) ----

function drawBanner(o, t, vp) {
  if (!state.banner) return;
  const remain = state.banner.until - state.clock;
  const a = remain > 4.5 ? (5 - remain) * 2 : remain < 0.5 ? remain * 2 : 1;
  void t;
  fx.bubble(o, state.banner.text, vp.x + vp.w / 2, L.divider.y + 4, {
    alpha: Math.max(0, Math.min(1, a)),
    tail: false,
    size: 9,
  });
}

void W;
