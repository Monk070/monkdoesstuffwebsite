// Chat → game actions. Forgiving on purpose: fuzzy match (edit distance 1)
// so typos land, per-user 2s cooldown so one fast typer can't drain the
// queue, and any action verb auto-joins you to the right room — friction at
// the front door kills engagement.

import * as game from "./game.js";
import * as fx from "./fx.js";
import { L, SCENE_THEMES, rebuildStatic } from "./scene.js";
import { settings, saveSettings, wordMap, firstAlias, ROOM_ACTIONS } from "./settings.js";

const COOLDOWN = 2; // seconds per user

// Which room each verb belongs to (auto-join target).
const VERB_ROOM = {
  chop: "kitchen", fry: "kitchen", stir: "kitchen", bake: "kitchen", plate: "kitchen",
  serve: "counter",
  water: "garden",
  pet: "loft",
};

// Character customization — works from anywhere, no room join.
const STYLE_ACTIONS = new Set(["gender", "skin", "top", "lower", "haircolour", "hairstyle"]);
const ADOPT_PET = { adoptcat: "cat", adoptdog: "dog", adoptbunny: "bunny" };

// The unknown-command hint sticks to the core loop (the full list got long).
const HINT_ACTIONS = ["chop", "fry", "stir", "bake", "plate", "serve", "water", "pet"];

const ROOMS = new Set(ROOM_ACTIONS);

// Alias lookup — rebuilt whenever the streamer saves settings.
let WORDS = wordMap();
let ALL_WORDS = Object.keys(WORDS);
export function refreshCommands() {
  WORDS = wordMap();
  ALL_WORDS = Object.keys(WORDS);
}

function levenshtein1(a, b) {
  // true if edit distance ≤ 1 (cheap check, no full matrix needed)
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; }
    else if (la > lb) i++;
    else j++;
  }
  return edits + (la - i) + (lb - j) <= 1;
}

function fuzzyMatch(word) {
  if (ALL_WORDS.includes(word)) return word;
  if (word.length < 3) return null;         // don't fuzzy tiny words
  for (const w of ALL_WORDS) if (levenshtein1(word, w)) return w;
  return null;
}

// Main entry: a chat message arrives (from the TikTok bridge or the simulator).
export function handleChat({ uniqueId, nickname, comment }) {
  if (!comment) return;
  const m = comment.trim().match(/^!\s*([a-zA-Z]+)/);
  if (!m) return;                            // not a command — ignore chatter

  const rawWord = m[1].toLowerCase();
  const word = fuzzyMatch(rawWord);
  const name = shortName(nickname || uniqueId);
  const p = game.getPlayer(uniqueId, name);

  // hidden easter egg — exact spelling only, not listed anywhere
  if (rawWord === "gold") {
    game.buyGoldHat(p);
    return;
  }

  if (!word) {
    const hints = HINT_ACTIONS.map(v => "!" + firstAlias(v)).join(" ");
    fx.toast(`${name}: try ${hints}`, { user: name });
    return;
  }

  // cooldown — silently absorb spam, only toast the first offense
  if (game.state.clock - p.lastCmdAt < COOLDOWN) {
    if (!p.cooledToasted) { fx.toast(`${name}: easy! one action every ${COOLDOWN}s`, { user: name }); p.cooledToasted = true; }
    return;
  }
  p.lastCmdAt = game.state.clock;
  p.cooledToasted = false;

  const action = WORDS[word];

  // room joins
  if (ROOMS.has(action)) {
    game.joinRoom(p, action);
    return;
  }

  // !customer — seat yourself and place a random order (no room join)
  if (action === "customer") {
    const res = game.placeOrder(p);
    if (!res.ok) fx.toast(`${name}: ${res.reason}`, { room: "counter", user: name });
    return;
  }

  // !leave — step out of the café; any later command re-joins automatically
  if (action === "leave") {
    game.leaveCafe(p);
    return;
  }

  // !animal — cycle the loft residents (cats → dogs → rabbits) for everyone
  if (action === "animal") {
    game.cycleAnimal(p);
    return;
  }

  // !background — cycle the scene theme for everyone (⚙ Features can disable)
  if (action === "background") {
    if (settings.features.viewerBackground) cycleBackground(p);
    return;
  }

  // !gender !skin !top !lower !haircolour !hairstyle — restyle (persists)
  if (STYLE_ACTIONS.has(action)) {
    game.cycleStyle(p, action);
    return;
  }

  // !ghost / !alien — toggle a whole-body form (again = back to human)
  if (action === "ghost" || action === "alien") {
    game.setForm(p, action);
    return;
  }

  // !adoptcat / !adoptdog / !adoptbunny — a tiny follower (again = release)
  if (ADOPT_PET[action]) {
    game.adoptPet(p, ADOPT_PET[action]);
    return;
  }

  // action verbs — auto-join the right room first...
  const verb = action;
  const room = VERB_ROOM[verb];
  if (!room) return;

  // ...EXCEPT !serve: the server role must be claimed by standing at the
  // counter. No auto-join — being in the counter is the point of the room.
  if (verb === "serve" && p.room !== "counter") {
    fx.toast(
      `${name}: you can only !${firstAlias("serve")} from the counter — type !${firstAlias("counter")} first!`,
      { room: "counter", user: name },
    );
    return;
  }
  if (p.room !== room) game.joinRoom(p, room);

  const res = game.act(p, verb);
  if (res.ok) {
    const st = L.stations[verb] ?? L.stations.chop;
    fx.floatText(`${name}: ${verb}!`, st.x, st.y - 56, "#bfe8bf", { ttl: 1.3 });
    p.lastVerb = verb;
    p.actionAt = game.state.clock;
  } else {
    fx.toast(`${name}: ${res.reason}`, { room, user: name });
  }
}

// Cycles settings.scene.theme (the same value the ⚙ Background select edits),
// so the choice persists between streams and stays in sync with the panel.
const THEME_FLAIR = {
  night: ["🌙", "night"], day: ["☀️", "day"], space: ["🌌", "space"],
  halloween: ["🎃", "halloween"], xmas: ["🎄", "christmas"],
};

function cycleBackground(p) {
  p.lastAction = game.state.clock;
  const i = SCENE_THEMES.indexOf(settings.scene.theme);
  settings.scene.theme = SCENE_THEMES[(i + 1) % SCENE_THEMES.length];
  rebuildStatic();
  saveSettings();
  const [emoji, label] = THEME_FLAIR[settings.scene.theme] ?? ["🎨", settings.scene.theme];
  fx.toast(`${emoji} ${p.name} changed the scene to ${label}!`, { user: p.name });
}

function shortName(n) {
  n = String(n).replace(/\s+/g, " ").trim();
  const lim = Math.max(3, Math.round(settings.names.maxChars || 10));
  return n.length > lim ? n.slice(0, lim) : n;
}

// Live event router — single ingest path, sim and live both land here.
// Payload shapes are TikFinity-compatible (the bridge preserves them).
export function handleEvent(msg) {
  const { event, data } = msg;
  if (!data) return;
  switch (event) {
    case "chat":
      if (!settings.features.commands) break;   // text commands toggled off
      handleChat(data);
      break;
    case "like":
      game.onLikes(data.likeCount ?? 1, shortName(data.nickname ?? data.uniqueId ?? ""));
      break;
    case "gift":
      if (!settings.features.gifts) break;      // gift effects toggled off
      // Streak gotcha (EVENTS.md): only count when the streak ends.
      if (data.repeatEnd === false) break;
      game.onGift(
        shortName(data.nickname ?? data.uniqueId ?? "someone"),
        data.giftName ?? "a gift",
        (data.diamondCount ?? 1) * (data.repeatCount ?? 1),
      );
      break;
    case "member": {
      const who = shortName(data.nickname ?? data.uniqueId ?? "someone");
      fx.toast(`${who} walked in — type !${firstAlias("kitchen")} to cook`, { user: who });
      break;
    }
    case "roomUser":
      if (typeof data.viewerCount === "number") game.state.viewerCount = data.viewerCount;
      break;
    default:
      break;
  }
}
