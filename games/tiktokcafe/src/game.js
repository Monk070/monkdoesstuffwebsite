// Game state + the café loop. A ticket is a tiny SLA: type, contribution
// slots, timers that breach. Chat fills slots by typing verbs; nobody owns
// anything (contribution pool — works the same with 3 viewers or 300).
//
// The full chain: order spawns → kitchen fills slots → dish cooks → !plate
// puts it on the pass → !serve (counter) delivers it. Garden grows the veg
// that !chop consumes; the cat loft's vibe meter stretches customer patience
// and fattens tips. Coins/veg/vibe persist between streams (localStorage).

import { L } from "./scene.js";
import { settings } from "./settings.js";
import * as fx from "./fx.js";
import * as sfx from "./sfx.js";
import {
  defaultStyle, GENDER_LABELS, GENDER_COUNT, SKIN_COUNT, TOP_COUNT, LOWER_COUNT,
  GENDER_HAIR, HAIRSTYLE_COUNT, HAIRCOLOUR_COUNT, HAIRSTYLE_LABELS,
} from "./sprites.js";

// ------------------------------------------------------------- recipes ----

export const RECIPES = [
  { id: "toastie",  name: "TOASTIE",  slots: { chop: 1, fry: 1 },  coins: 3, weight: 3 },
  { id: "soup",     name: "SOUP",     slots: { chop: 2, stir: 1 }, coins: 4, weight: 3 },
  { id: "pancakes", name: "PANCAKES", slots: { stir: 1, fry: 1 },  coins: 4, weight: 2 },
  { id: "cookies",  name: "COOKIES",  slots: { stir: 1, bake: 1 }, coins: 3, weight: 2 },
  { id: "blt",      name: "BLT",      slots: { chop: 2, fry: 1 },  coins: 5, weight: 2, dish: "toastie" },
];

export const KITCHEN_VERBS = ["chop", "fry", "stir", "bake", "plate"];

// Loft residents — !animal cycles the species for everyone.
export const ANIMAL_KINDS = ["cats", "dogs", "rabbits"];
export const ANIMAL_SINGULAR = { cats: "cat", dogs: "dog", rabbits: "bunny" };

// Timing windows are streamer-tunable (⚙ Settings → Kitchen timers).
// Defaults are latency-safe: comment latency is 1–3s and jittery — see TODO.
const COOK_SECONDS   = () => Math.max(1, settings.timers.cookSeconds);
const PLATE_WINDOW   = () => Math.max(2, settings.timers.plateSeconds);
const SERVE_WINDOW   = () => Math.max(2, settings.timers.serveSeconds);
const TICKET_SLA     = () => Math.max(10, settings.timers.orderSeconds);
const ACTIVE_WINDOW  = 90;    // seconds since last command to count as active
// idle this long → the character leaves (no "viewer left" event exists on
// TikTok, so this is the proxy; tunable in ⚙ Settings)
const SLOT_TIMEOUT   = () => Math.max(30, settings.timers.idleLeaveSeconds ?? 150);
const MAX_TICKETS    = () => Math.max(1, Math.min(4, Math.round(settings.timers.maxOrders ?? 3)));
const GROWTH_PER_HARVEST = 3; // !water count per veg harvest
const VEG_PER_HARVEST    = 2;

// ------------------------------------------------------------- state ----

export const state = {
  coins: 0,
  served: 0,
  burnt: 0,
  veg: 20,                // pantry — consumed by !chop, grown by !water
  vibe: 0,                // 0–100 — fed by !pet, decays; patience + tips
  growth: 0,
  fuel: 60,
  fuelMax: 100,
  freezeUntil: 0,         // gift effect: timers paused until this clock
  clock: 0,               // seconds since boot
  viewerCount: 0,

  animal: "cats",         // loft residents — !animal cycles cats/dogs/rabbits

  players: new Map(),     // uniqueId → player
  slots: {                // fixed on-screen spots per room (player ids)
    kitchen: [null, null, null],
    counter: [null],
    garden:  [null, null],
    loft:    [null, null],
  },
  tickets: [],
  customers: [],          // { name, stool, ticketId, state, life }
  banner: null,           // { text, until } — big gift thank-you
  spawnCarry: 0,
  nextTicketId: 1,
  lastRotate: 0,          // crowded rooms rotate visible players every 5s
  rotOffsets: {},
};

export function frozen() { return state.clock < state.freezeUntil; }

// -------------------------------------------------------- persistence ----

const SAVE_KEY = "tiktokcafe.save.v1";

function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (!d) return;
    state.coins  = d.coins  ?? state.coins;
    state.served = d.served ?? state.served;
    state.burnt  = d.burnt  ?? state.burnt;
    state.veg    = d.veg    ?? state.veg;
    state.vibe   = d.vibe   ?? state.vibe;
    if (ANIMAL_KINDS.includes(d.animal)) state.animal = d.animal;
  } catch { /* corrupt save — start fresh */ }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, served: state.served, burnt: state.burnt,
      veg: Math.round(state.veg), vibe: Math.round(state.vibe),
      animal: state.animal,
      savedAt: Date.now(),
    }));
  } catch { /* storage full/blocked — non-fatal */ }
}

loadSave();
let saveTimer = 0;

// Settings-panel buttons: zero a counter (saves on the next tick).
export function resetCoins() {
  state.coins = 0;
  saveTimer = 5;
}

export function resetServed() {
  state.served = 0;
  state.burnt = 0;
  saveTimer = 5;
}

export function resetFood() {
  state.veg = 20;          // back to the starting pantry
  state.growth = 0;
  saveTimer = 5;
}

// ------------------------------------------------- character customization ----
// Per-viewer looks (!gender !skin !top !lower) + the gold hat, persisted so a
// regular's character survives between streams. Uncustomized viewers fall
// back to a stable hash-based style (sprites.defaultStyle).

const CHARS_KEY = "tiktokcafe.chars.v1";
let chars = {};              // uniqueId → { gender?, skin?, top?, lower?, gold?, at }

function loadChars() {
  try { chars = JSON.parse(localStorage.getItem(CHARS_KEY) ?? "null") ?? {}; }
  catch { chars = {}; }
}

function saveChars() {
  try {
    const ids = Object.keys(chars);
    if (ids.length > 1000) {           // keep the store bounded: drop oldest
      ids.sort((a, b) => (chars[a].at ?? 0) - (chars[b].at ?? 0));
      for (const id of ids.slice(0, ids.length - 1000)) delete chars[id];
    }
    localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
  } catch { /* non-fatal */ }
}

loadChars();

// Resolved style for rendering — stored choices win, hash defaults fill in.
// hairstyle: an explicit !hairstyle pick wins; otherwise the gender default.
export function styleFor(id, name = "") {
  const c = chars[id] ?? {};
  const d = defaultStyle(String(name || id));
  const gender = c.gender ?? d.gender;
  return {
    gender,
    skin:   c.skin   ?? d.skin,
    top:    c.top    ?? d.top,
    lower:  c.lower  ?? d.lower,
    haircolour: c.haircolour ?? d.haircolour,
    hairstyle:  c.hairstyle  ?? GENDER_HAIR[gender % GENDER_COUNT],
    form:   c.form ?? null,      // null | "ghost" | "alien"
    pet:    c.pet  ?? null,      // null | "cat" | "dog" | "bunny"
  };
}

const STYLE_COUNTS = {
  gender: GENDER_COUNT, skin: SKIN_COUNT, top: TOP_COUNT, lower: LOWER_COUNT,
  haircolour: HAIRCOLOUR_COUNT, hairstyle: HAIRSTYLE_COUNT,
};
const TOP_LABELS   = ["a tee", "a striped tee", "a hoodie", "a jacket"];
const LOWER_LABELS = ["jeans", "shorts", "a dress"];
const HAIRCOLOUR_LABELS = ["brown", "blonde", "red", "black", "pink", "blue", "purple", "green"];

export function cycleStyle(p, kind) {
  p.lastAction = state.clock;
  const next = (styleFor(p.id, p.name)[kind] + 1) % STYLE_COUNTS[kind];
  setStyle(p.id, { [kind]: next });
  const what =
    kind === "gender" ? `is now ${GENDER_LABELS[next]}` :
    kind === "skin"   ? `changed skin tone (${next + 1}/${SKIN_COUNT})` :
    kind === "top"    ? `put on ${TOP_LABELS[next]}` :
    kind === "lower"  ? `put on ${LOWER_LABELS[next]}` :
    kind === "haircolour" ? `dyed their hair ${HAIRCOLOUR_LABELS[next]}` :
                        `got a new 'do: ${HAIRSTYLE_LABELS[next]}`;
  fx.toast(`✨ ${p.name} ${what}`, { user: p.name });
}

// !ghost / !alien — toggle a whole-body form (typing it again turns you back;
// picking the other form switches). Persists like the rest of the outfit.
export function setForm(p, form) {
  p.lastAction = state.clock;
  const next = (chars[p.id]?.form ?? null) === form ? null : form;
  setStyle(p.id, { form: next });
  fx.toast(
    next === "ghost" ? `👻 ${p.name} is a ghost now! woooo~` :
    next === "alien" ? `👽 ${p.name} beamed in as an alien!` :
    `✨ ${p.name} is human again`,
    { user: p.name },
  );
}

// !adoptcat / !adoptdog / !adoptbunny — a tiny pet that sits at your feet
// and follows you from room to room. Same command again sends it home.
const PET_LABELS = { cat: "kitten 🐱", dog: "puppy 🐶", bunny: "bunny 🐰" };

export function adoptPet(p, kind) {
  p.lastAction = state.clock;
  const next = (chars[p.id]?.pet ?? null) === kind ? null : kind;
  setStyle(p.id, { pet: next });
  fx.toast(
    next ? `${p.name} adopted a ${PET_LABELS[kind]} — it follows them everywhere!`
         : `${p.name}'s ${PET_LABELS[kind]} went home`,
    { user: p.name },
  );
}

export function setStyle(id, patch) {
  const c = chars[id] ?? (chars[id] = {});
  Object.assign(c, patch);
  c.at = Date.now();
  saveChars();
}

// !animal — anyone can flip the loft species for the whole café.
export function cycleAnimal(p) {
  p.lastAction = state.clock;
  const i = ANIMAL_KINDS.indexOf(state.animal);
  state.animal = ANIMAL_KINDS[(i + 1) % ANIMAL_KINDS.length];
  saveTimer = 5;
  const emoji = { cats: "🐱", dogs: "🐶", rabbits: "🐰" }[state.animal];
  fx.toast(`${emoji} ${p.name} filled the loft with ${state.animal}!`, { room: "loft", user: p.name });
}

// ------------------------------------------------------------ players ----

export function getPlayer(id, name) {
  let p = state.players.get(id);
  if (!p) {
    p = { id, name, room: null, lastAction: -999, lastCmdAt: -999, joinedAt: state.clock };
    if (chars[id]?.gold) p.goldHat = true;   // gold hats persist between streams
    state.players.set(id, p);
  }
  if (name) p.name = name;
  return p;
}

function releaseSlot(p) {
  for (const room of Object.keys(state.slots)) {
    const arr = state.slots[room];
    const i = arr.indexOf(p.id);
    if (i !== -1) arr[i] = null;
  }
}

function assignSlot(p, room) {
  const arr = state.slots[room];
  if (arr.includes(p.id)) return true;
  const i = arr.indexOf(null);
  if (i === -1) return false;      // room full — still playing, just off-screen
  arr[i] = p.id;
  return true;
}

export function joinRoom(p, room) {
  const wasIn = p.room;
  if (wasIn !== room) releaseSlot(p);
  p.room = room;
  p.lastAction = state.clock;
  assignSlot(p, room);
  if (wasIn !== room) {
    fx.toast(`${p.name} joined the ${L.rooms[room]?.label.toLowerCase() ?? room}!`, { room, user: p.name });
  }
  return wasIn !== room;
}

// !gold — buy a gold chef's hat for 100 coins from the café till.
export function buyGoldHat(p) {
  p.lastAction = state.clock;
  if (p.goldHat) {
    fx.toast(`${p.name} already has the gold hat!`, { user: p.name });
    return;
  }
  if (state.coins < 100) {
    fx.toast(`${p.name}: a gold chef's hat costs 100 coins — the till only has ${state.coins}`, { user: p.name });
    return;
  }
  state.coins -= 100;
  p.goldHat = true;
  setStyle(p.id, { gold: true });            // persists with their outfit
  saveTimer = 5;
  fx.heartPop(L.hud.coins.x - 20, L.hud.coins.y + 8);
  fx.toast(`✨ ${p.name} bought a GOLD chef's hat! (-100 coins)`, { user: p.name });
}

// !leave — the player steps out of the café (their character disappears)
// but stays in the live; any command brings them straight back.
export function leaveCafe(p) {
  releaseSlot(p);
  const wasIn = p.room;
  p.room = null;
  p.lastAction = -999;                     // drop out of active counts too
  if (wasIn) fx.toast(`${p.name} left the café — see you soon!`, { user: p.name });
  return { ok: true };
}

export function activeIn(room) {
  let n = 0;
  for (const p of state.players.values()) {
    if (p.room === room && state.clock - p.lastAction < ACTIVE_WINDOW) n++;
  }
  return n;
}

export function activeCooks() { return activeIn("kitchen"); }

// The scaling knob. THE line that makes 5 viewers and 500 both playable.
function ordersPerMinute() {
  return Math.min(8, 1 + activeCooks() * 0.2);
}

// ------------------------------------------------------------ tickets ----

function pickRecipe() {
  const total = RECIPES.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RECIPES) { roll -= r.weight; if (roll <= 0) return r; }
  return RECIPES[0];
}

const CUSTOMER_NAMES = ["mabel", "otto", "pearl", "gus", "ivy", "franklin", "meredith", "sami"];

export function spawnTicket({ customerName = null, customerId = null } = {}) {
  if (state.tickets.filter(t => t.state !== "done").length >= MAX_TICKETS()) return null;
  const recipe = pickRecipe();

  // Fixed display column: take the lowest free one and keep it for life, so
  // tickets never jump around as others complete. Fading done tickets still
  // hold their column — evict the oldest if every column is taken.
  const cols = MAX_TICKETS();
  const used = new Set(state.tickets.filter(tk => tk.col != null).map(tk => tk.col));
  let col = -1;
  for (let i = 0; i < cols; i++) if (!used.has(i)) { col = i; break; }
  if (col === -1) {
    const doneIdx = state.tickets.findIndex(tk => tk.state === "done");
    if (doneIdx !== -1) {
      col = state.tickets[doneIdx].col ?? 0;
      state.tickets.splice(doneIdx, 1);
    } else {
      col = 0;   // unreachable: the cap guarantees a done ticket exists here
    }
  }

  const t = {
    id: state.nextTicketId++,
    recipe,
    col,
    slots: Object.entries(recipe.slots).map(([verb, need]) => ({ verb, need, have: 0 })),
    state: "open",          // open → cooking → ready → pass → done
    age: 0, cookLeft: 0, plateLeft: 0, passAge: 0,
    outcome: null,
    contributors: new Set(),
  };
  state.tickets.push(t);

  const taken = new Set(state.customers.map(cu => cu.stool));
  const free = L.stools.map((_, i) => i).filter(i => !taken.has(i));
  if (free.length) {
    state.customers.push({
      name: customerName ?? CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)] + "_" + t.id,
      viewer: !!customerName,
      uid: customerId,               // viewer customers wear their own sprite
      stool: free[0], ticketId: t.id, state: "waiting", life: 0,
    });
  }
  return t;
}

// A viewer seats themselves as a customer and places a random order.
export function placeOrder(p) {
  p.lastAction = state.clock;
  const t = spawnTicket({ customerName: p.name, customerId: p.id });
  if (!t) return { ok: false, reason: "orders are full right now — help cook instead!" };
  fx.toast(`${p.name} ordered a ${t.recipe.name.toLowerCase()}!`, { room: "counter", user: p.name });
  const cu = state.customers.find(c => c.ticketId === t.id);
  if (cu) fx.heartPop(L.stools[cu.stool].x, L.stools[cu.stool].y - 56);
  return { ok: true, ticket: t };
}

// A viewer performs an action verb. Returns { ok, reason }.
export function act(p, verb) {
  p.lastAction = state.clock;

  switch (verb) {
    case "water": {
      state.growth += 1;
      sfx.bloops();
      const g = L.rooms.garden;
      if (state.growth >= GROWTH_PER_HARVEST) {
        state.growth -= GROWTH_PER_HARVEST;
        state.veg += VEG_PER_HARVEST;
        fx.vegPop(g.x + 62, g.y + g.h - 34, VEG_PER_HARVEST);
      }
      return { ok: true };
    }

    case "pet": {
      state.vibe = Math.min(100, state.vibe + 8);
      // per-species voice — guarded like the kitchen verbs (stall lesson)
      try { ({ cats: sfx.meow, dogs: sfx.woof, rabbits: sfx.squeak })[state.animal]?.(); }
      catch (e) { console.error("[sfx]", e); }
      const cl = L.rooms.loft;
      fx.heartPop(cl.x + 60 + Math.random() * 40, cl.y + cl.h - 30);
      return { ok: true };
    }

    case "serve": {
      const t = state.tickets.find(tk => tk.state === "pass");
      if (!t) return { ok: false, reason: "nothing on the pass — kitchen first!" };
      serveTicket(t, p);
      return { ok: true, ticket: t, verb };
    }

    case "plate": {
      const ready = state.tickets.find(t => t.state === "ready");
      if (!ready) return { ok: false, reason: "nothing to plate yet" };
      ready.state = "pass";
      ready.passAge = 0;
      sfx.clink();
      return { ok: true, ticket: ready, verb };
    }

    default: {
      // kitchen contribution verbs — every prep step needs food in the
      // pantry; when it runs out, NOTHING can be prepared until the garden
      // grows more
      if (state.veg <= 0) {
        return { ok: false, reason: "out of food! !water the garden" };
      }
      const t = state.tickets.find(tk =>
        tk.state === "open" && tk.slots.some(s => s.verb === verb && s.have < s.need));
      if (!t) {
        const anyOpen = state.tickets.some(tk => tk.state === "open");
        return { ok: false, reason: anyOpen ? `no ${verb} needed right now` : "no open orders" };
      }
      const slot = t.slots.find(s => s.verb === verb && s.have < s.need);
      slot.have++;
      t.contributors.add(p.name);
      state.veg--;                           // every prep action uses 1 food
      if (t.slots.every(s => s.have >= s.need)) {
        t.state = "cooking";
        t.cookLeft = COOK_SECONDS();
      }
      // sound last, and guarded — a sound bug must never corrupt game state
      try { ({ chop: sfx.chop, fry: sfx.sizzle, stir: sfx.stir, bake: sfx.bake })[verb]?.(); }
      catch (e) { console.error("[sfx]", e); }
      return { ok: true, ticket: t, verb };
    }
  }
}

function serveTicket(t, p = null, { selfServe = false } = {}) {
  t.state = "done";
  t.outcome = "plated";
  t.doneAt = state.clock;

  const cust = state.customers.find(cu => cu.ticketId === t.id);
  const stool = cust ? L.stools[cust.stool] : L.stools[0];

  let pay = t.recipe.coins;
  if (t.contributors.size > 2) pay += 1;      // brigade bonus
  if (state.vibe > 60) pay += 1;              // good vibes tip
  if (selfServe) pay = Math.max(1, pay - 1);  // customer had to fetch it

  state.coins += pay;
  state.served++;
  sfx.bading();
  fx.coinPop(stool.x, stool.y - 40, pay);
  fx.heartPop(stool.x, stool.y - 48);
  if (selfServe) fx.toast("nobody served — the customer grabbed it (smaller tip)", { room: "counter" });
  if (cust) { cust.state = "happy"; cust.life = 0; }
}

function failTicket(t, outcome) {
  t.state = "done";
  t.outcome = outcome;
  t.doneAt = state.clock;

  const cust = state.customers.find(cu => cu.ticketId === t.id);
  if (outcome === "burnt") {
    state.burnt++;
    state.coins = Math.max(0, state.coins - 1);
    fx.smokePuff(L.rooms.kitchen.x + 115, L.rooms.kitchen.y + 75);
    fx.toast(`the ${t.recipe.name} burnt! a ${ANIMAL_SINGULAR[state.animal]} is eyeing it...`, { room: "kitchen" });
  } else {
    fx.toast(`order ${t.recipe.name} walked out. faster next time!`, { room: "counter" });
  }
  if (cust) { cust.state = "leaving"; cust.life = 0; }
}

// --------------------------------------------------------- like / gift ----

export function onLikes(count, name) {
  state.fuel = Math.min(state.fuelMax, state.fuel + count * settings.gifts.fuelPerLike);
  // the liker's name drifts up out of the furnace with a heart
  if (name) {
    fx.floatText(`${name} ❤️`, L.stove.x + 18, L.stove.y + 8, "#e03131", { plain: true, ttl: 2.2 });
  }
}

export function onGift(name, giftName, coins) {
  const freeze = settings.gifts.freezeSeconds;
  state.freezeUntil = state.clock + freeze;
  state.fuel = state.fuelMax;
  state.coins += Math.max(0, Math.round(coins));   // gift coins bank into the café till
  state.banner = { text: `${name} sent ${giftName}! timers frozen ${Math.round(freeze)}s`, until: state.clock + 5 };
  fx.coinPop(L.hud.coins.x - 14, L.hud.coins.y + 10, Math.round(coins));
  fx.heartPop(L.rooms.counter.x + 60, L.rooms.counter.y + 30);
  if (coins >= settings.gifts.crateMinCoins) {
    const t = state.tickets.find(tk => tk.state === "open");
    if (t) {
      const slot = t.slots.find(s => s.have < s.need);
      if (slot) {
        slot.have++;
        fx.floatText("crate drop!", L.rooms.kitchen.x + 68, L.rooms.kitchen.y + 50, "#f2c14e");
        if (t.slots.every(s => s.have >= s.need)) { t.state = "cooking"; t.cookLeft = COOK_SECONDS(); }
      }
    }
  }
}

// ---------------------------------------------------------------- tick ----

export function tick(dt) {
  state.clock += dt;
  const freeze = frozen();

  // fuel drains slowly while anything is cooking; vibe decays at a
  // streamer-tunable rate (⚙ Settings → Kitchen timers & limits)
  const cooking = state.tickets.some(t => t.state === "cooking");
  state.fuel = Math.max(0, state.fuel - dt * (cooking ? 1.2 : 0.25));
  const vibeDecay = Math.max(0, settings.timers.vibeDecayPerMin ?? 24) / 60;
  state.vibe = Math.max(0, state.vibe - dt * vibeDecay);

  // order spawning — carry fractional spawns across frames
  if (!freeze) {
    state.spawnCarry += (ordersPerMinute() / 60) * dt;
    if (state.spawnCarry >= 1) { state.spawnCarry -= 1; spawnTicket(); }
  }

  // vibe stretches how long customers are willing to wait
  const sla = TICKET_SLA() * (1 + state.vibe / 200);

  for (const t of state.tickets) {
    if (t.state === "done") continue;
    if (!freeze) t.age += dt;

    if (t.state === "cooking") {
      // cooking continues even frozen, but an empty stove (no likes = no
      // fuel) cooks at a third of the speed — checked live, so refuelling
      // mid-cook speeds it back up immediately
      t.cookLeft -= dt * (state.fuel > 0 ? 1 : 0.35);
      if (t.cookLeft <= 0) { t.state = "ready"; t.plateLeft = PLATE_WINDOW(); }
    } else if (t.state === "ready") {
      if (!freeze) t.plateLeft -= dt;
      if (t.plateLeft <= 0) failTicket(t, "burnt");
    } else if (t.state === "pass") {
      if (!freeze) t.passAge += dt;
      if (t.passAge > SERVE_WINDOW()) serveTicket(t, null, { selfServe: true });
    } else if (t.age > sla) {
      failTicket(t, "expired");
    }

    // patience warning: tick-tock when a customer's time runs low
    if (t.state !== "done" && 1 - t.age / sla < 0.25 && state.clock >= (t.nextTickTock ?? 0)) {
      try { sfx.ticktock(); } catch (e) { console.error("[sfx]", e); }
      t.nextTickTock = state.clock + 8;
    }
  }

  // sweep finished tickets off the rail after a beat
  for (let i = state.tickets.length - 1; i >= 0; i--) {
    const t = state.tickets[i];
    if (t.state === "done" && state.clock - t.doneAt > 2.5) state.tickets.splice(i, 1);
  }

  // customers
  for (let i = state.customers.length - 1; i >= 0; i--) {
    const cu = state.customers[i];
    cu.life += dt;
    if ((cu.state === "happy" && cu.life > 3) || (cu.state === "leaving" && cu.life > 2)) {
      state.customers.splice(i, 1);
    }
  }

  // free slots held by players who wandered off
  for (const room of Object.keys(state.slots)) {
    const arr = state.slots[room];
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      const p = state.players.get(arr[i]);
      if (!p || state.clock - p.lastAction > SLOT_TIMEOUT()) {
        if (p) p.room = null;
        arr[i] = null;
      }
    }
  }

  // crowded rooms rotate their visible spots every 5s so every viewer's
  // character gets screen time; uncrowded rooms stay stable
  if (state.clock - state.lastRotate >= 5) {
    state.lastRotate = state.clock;
    for (const room of Object.keys(state.slots)) {
      const arr = state.slots[room];
      const actives = [...state.players.values()]
        .filter(p => p.room === room && state.clock - p.lastAction < ACTIVE_WINDOW)
        .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
      if (actives.length > arr.length) {
        const off = (state.rotOffsets[room] = ((state.rotOffsets[room] ?? 0) + 1) % actives.length);
        for (let i = 0; i < arr.length; i++) arr[i] = actives[(off + i) % actives.length].id;
      } else {
        // everyone fits — just make sure each active player has a spot
        for (const p of actives) {
          if (!arr.includes(p.id)) {
            const free = arr.indexOf(null);
            if (free !== -1) arr[free] = p.id;
          }
        }
      }
    }
  }

  if (state.banner && state.clock > state.banner.until) state.banner = null;

  saveTimer += dt;
  if (saveTimer >= 5) { saveTimer = 0; save(); }
}
