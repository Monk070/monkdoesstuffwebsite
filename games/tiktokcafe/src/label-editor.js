// Label position editor. Click a label in the game to select it, then use
// the arrow keys to nudge it (Shift = 5px steps). Esc or Enter deselects.
// Offsets persist via settings.labels; the CTA nudges its absolute x/y.

import { settings, saveSettings } from "./settings.js";

let selected = new URLSearchParams(location.search).get("edit") || null;
const rects = new Map();   // key → { x, y, w, h } world coords, updated each frame

export function setRect(key, r) { rects.set(key, r); }

export function selectedKey() { return selected; }

export function offset(key) {
  return settings.labels[key] ?? { dx: 0, dy: 0 };
}

export function handleClick(wx, wy) {
  for (const [key, r] of rects) {
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) {
      selected = key;
      return true;
    }
  }
  selected = null;
  return false;
}

export function handleKey(e) {
  if (!selected) return false;
  const step = e.shiftKey ? 5 : 1;
  let dx = 0, dy = 0;
  switch (e.key) {
    case "ArrowLeft":  dx = -step; break;
    case "ArrowRight": dx = step;  break;
    case "ArrowUp":    dy = -step; break;
    case "ArrowDown":  dy = step;  break;
    case "Escape":
    case "Enter":
      selected = null;
      saveSettings();
      return true;
    default:
      return false;
  }

  if (selected === "cta") {
    settings.cta.x += dx;
    settings.cta.y += dy;
  } else if (selected === "orders") {
    settings.bigTickets.x += dx;
    settings.bigTickets.y += dy;
  } else if (selected.startsWith("names")) {
    // any player name tag — one shared offset for all of them
    settings.names.dx += dx;
    settings.names.dy += dy;
  } else {
    const o = settings.labels[selected] ?? (settings.labels[selected] = { dx: 0, dy: 0 });
    o.dx += dx;
    o.dy += dy;
  }
  saveSettings();
  return true;
}
