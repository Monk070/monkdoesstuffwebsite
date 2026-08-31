// Catalogue loading + item rotation. data/catalog.json is built by
// tools/build-catalog.py (Vinted scrape with locally cached images) so the
// game runs fully offline once built.

import { loadSeen, saveSeen } from "./storage.js";

let items = [];
let seen = loadSeen();

export async function loadCatalog() {
  const res = await fetch("data/catalog.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`catalog.json missing (${res.status}) — run tools/build-catalog.py`);
  const data = await res.json();
  items = (data.items ?? []).filter(it => it.title && Number.isFinite(it.price) && it.price > 0);
  return items.length;
}

export function catalogSize() { return items.length; }

function inMode(it, mode) {
  if (mode === "property") return it.kind === "property";
  if (mode === "items") return it.kind !== "property";
  return true;
}

// Random unseen item from the selected pool; when that pool is exhausted
// its rotation resets (seen entries for the OTHER mode are left alone).
export function nextItem(mode = "mixed") {
  const all = items.filter(it => inMode(it, mode));
  if (!all.length) return null;
  let pool = all.filter(it => !seen.has(it.id));
  if (!pool.length) {
    for (const it of all) seen.delete(it.id);
    pool = all;
  }
  const item = pool[Math.floor(Math.random() * pool.length)];
  seen.add(item.id);
  saveSeen(seen);
  return item;
}
