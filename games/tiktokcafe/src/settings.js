// Streamer-configurable settings: which chat words trigger which action, and
// what likes/gifts do. Edited in the ⚙ Settings panel, saved to localStorage.

const KEY = "tiktokcafe.settings.v1";

export const DEFAULTS = {
  version: 5,              // bump when a default change should migrate old saves
  // Comma-separated alias lists. First alias is shown on room signs/hints.
  commands: {
    kitchen: "kitchen, cook",
    counter: "counter, server",
    garden:  "garden, grow",
    loft:    "loft, cats, cat",
    chop:    "chop, cut, slice",
    fry:     "fry, grill, flip",
    stir:    "stir, mix, whisk",
    bake:    "bake, oven",
    plate:   "plate, pass, ding",
    serve:   "serve, deliver",
    water:   "water, plant",
    pet:     "pet, pat, pets",
    customer: "customer, order",
    leave:   "leave, bye, afk",
    animal:  "animal, animals",
    background: "background, theme, bg",
    gender:  "gender",
    skin:    "skin, tone",
    top:     "top, shirt",
    lower:   "lower, bottoms, pants",
    haircolour: "haircolour, haircolor",
    hairstyle:  "hairstyle, hair",
    ghost:   "ghost, boo",
    alien:   "alien, ufo",
    adoptcat:   "adoptcat, adoptkitten",
    adoptdog:   "adoptdog, adoptpuppy",
    adoptbunny: "adoptbunny, adoptrabbit",
  },
  gifts: {
    freezeSeconds: 30,     // any gift freezes order/burn timers this long
    crateMinCoins: 10,     // gifts worth ≥ this auto-fill one ticket slot
    fuelPerLike:   0.5,    // stove fuel per like tap
  },
  // The flashing call-to-action shown when the kitchen is empty.
  // Position/size are in logical canvas units (canvas is 360×640).
  cta: {
    text: "",              // empty = auto: "type !<kitchen alias> to cook"
    x: 180,
    y: 342,
    size: 8,
  },
  display: {
    charScale: 3,          // character sprite size: 1×, 2× or 3×
  },
  // Look & feel shared by bubbles, chips and meters.
  theme: {
    uiFont: "Arial",       // font for name tags, bubbles, labels (FONT_CHOICES)
    bubbleBg: "#ffffff",   // bubble / chip / name-tag background
    bubbleText: "#000000", // bubble / chip text colour
    vibeColor: "#f2788f",  // the cat-loft heart meter
    meterScale: 1,         // fuel / vibe / growth meter size (1–2×)
  },
  // Feature toggles.
  features: {
    gifts: true,           // gifts freeze timers / drop crates
    commands: true,        // chat text commands are processed
    viewerBackground: true, // !background lets viewers cycle the scene theme
  },
  // Scene background — the world outside the café (⚙ Settings → Background).
  scene: {
    theme: "night",        // night | day | space | halloween | xmas
  },
  // Veg counter — shown in BOTH the garden and the kitchen so the supply
  // chain (!water grows what !chop consumes) is obvious.
  vegCounter: {
    font: "Arial",         // one of FONT_CHOICES
    size: 6,
    style: "bold",         // normal | bold | italic | bold italic
    color: "#000000",
    bg: "#ffffff",
  },
  // Generative sound effects (Web Audio — no sample files).
  sound: {
    enabled: true,
    volume: 0.6,           // 0–1
  },
  // Kitchen timers (seconds) + limits.
  timers: {
    orderSeconds: 75,      // how long an order lasts / a customer waits
    cookSeconds: 8,        // cooking time once all slots are filled
    plateSeconds: 15,      // window to !plate a ready dish before it burns
    serveSeconds: 10,      // window to !serve before the customer self-serves
    maxOrders: 3,          // orders live at once (1–4)
    vibeDecayPerMin: 24,   // cat heart meter drain per minute (each !pet adds 8)
    idleLeaveSeconds: 150, // idle this long → character leaves (TikTok sends no
                           // "viewer left" event, so idle time is the proxy)
  },
  // Player name tags on the characters.
  names: {
    mode: "bubble",        // "bubble" above the head | "chest" badge on the body
    size: 6,               // font size (px)
    maxChars: 10,          // names longer than this get cut
    dx: 0,                 // position tweak — also click a name in-game and
    dy: 0,                 //   nudge with the arrow keys
  },
  // The marquee sign title — gold pixel lettering on the fascia.
  sign: {
    text: "TIKTOK CAFE",
  },
  // The large order tickets under the rooms.
  bigTickets: {
    x: 180,                // row centre (canvas is 360 wide)
    y: 452,                // row top
    scale: 1,              // whole-ticket scale (0.5–2×)
    font: "Arial",         // one of FONT_CHOICES
    fontSize: 6,           // base text size (state words render bigger)
    fontStyle: "bold",     // normal | bold | italic | bold italic
    color: "#000000",      // ticket text colour (urgency reds stay red)
  },
  // Game messages ("jules_v joined the kitchen!") — the full-width bars.
  toasts: {
    position: "above",     // "above" | "below" the game rooms
    max: 5,                // rows shown at once (1–7)
    seconds: 2.6,          // how long each message stays on screen
    font: "Arial",         // one of FONT_CHOICES
    textColor: "#000000",
    userStyled: true,      // render the TikTok username in its own style
    userFont: "Arial",     // one of FONT_CHOICES
    userColor: "#c2185b",
  },
  // Per-label nudge offsets (world px). Click a label in-game, then use the
  // arrow keys to move it; Esc/Enter deselects. Saved automatically.
  labels: {
    kitchen: { dx: 0, dy: 0 },
    counter: { dx: 0, dy: 0 },
    garden:  { dx: 0, dy: 0 },
    loft:    { dx: 0, dy: 0 },
    coins:   { dx: 0, dy: 0 },
    status:  { dx: 0, dy: 0 },
    sign:    { dx: 0, dy: 0 },
    "over-kitchen": { dx: 0, dy: 0 },
    "over-counter": { dx: 0, dy: 0 },
    "over-garden":  { dx: 0, dy: 0 },
    "over-loft":    { dx: 0, dy: 0 },
    "veg-kitchen":  { dx: 0, dy: 0 },
    "veg-garden":   { dx: 0, dy: 0 },
  },
};

export const ROOM_ACTIONS = ["kitchen", "counter", "garden", "loft"];
export const VERB_ACTIONS = [
  "chop", "fry", "stir", "bake", "plate", "serve", "water", "pet",
  "customer", "leave", "animal", "background", "gender", "skin", "top", "lower",
  "haircolour", "hairstyle", "ghost", "alien",
  "adoptcat", "adoptdog", "adoptbunny",
];

// Web-safe fonts available for the game message bars.
export const FONT_CHOICES = ["Arial", "Verdana", "Georgia", "Trebuchet MS", "Courier New"];

export const settings = structuredClone(DEFAULTS);

export function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!d) return;
    Object.assign(settings.commands, d.commands ?? {});
    Object.assign(settings.gifts, d.gifts ?? {});
    Object.assign(settings.cta, d.cta ?? {});
    Object.assign(settings.display, d.display ?? {});
    Object.assign(settings.theme, d.theme ?? {});
    Object.assign(settings.features, d.features ?? {});
    Object.assign(settings.scene, d.scene ?? {});
    Object.assign(settings.timers, d.timers ?? {});
    Object.assign(settings.vegCounter, d.vegCounter ?? {});
    Object.assign(settings.sound, d.sound ?? {});
    Object.assign(settings.names, d.names ?? {});
    Object.assign(settings.sign, d.sign ?? {});
    Object.assign(settings.bigTickets, d.bigTickets ?? {});
    Object.assign(settings.toasts, d.toasts ?? {});
    Object.assign(settings.labels, d.labels ?? {});
    // migrations for saves made before a default changed
    if ((d.version ?? 1) < 2) settings.toasts.position = "above";
    if ((d.version ?? 1) < 3) settings.toasts.max = 5;
    // v4: the cat loft became the any-animal loft — action "cats" → "loft"
    if ((d.version ?? 1) < 4) {
      if (d.commands?.cats) {
        const words = String(d.commands.cats).split(",").map(w => w.trim()).filter(Boolean);
        if (!words.includes("loft")) words.unshift("loft");
        settings.commands.loft = words.join(", ");
      }
      if (d.labels?.cats) settings.labels.loft = { ...d.labels.cats };
      if (d.labels?.["over-cats"]) settings.labels["over-loft"] = { ...d.labels["over-cats"] };
    }
    // v5: v4 kept a legacy alias order like "cats, cat, loft" — the FIRST
    // alias shows on the room sign, so move "loft" to the front
    if ((d.version ?? 1) < 5) {
      const words = String(settings.commands.loft ?? "").split(",").map(w => w.trim()).filter(Boolean);
      if (words.includes("loft") && words[0] !== "loft") {
        settings.commands.loft = ["loft", ...words.filter(w => w !== "loft")].join(", ");
      }
    }
    // stale keys copied in by the Object.assigns above
    delete settings.commands.cats;
    delete settings.labels.cats;
    delete settings.labels["over-cats"];
    settings.version = DEFAULTS.version;
  } catch { /* corrupt — keep defaults */ }
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* non-fatal */ }
}

export function resetSettings() {
  Object.assign(settings.commands, structuredClone(DEFAULTS.commands));
  Object.assign(settings.gifts, structuredClone(DEFAULTS.gifts));
  Object.assign(settings.cta, structuredClone(DEFAULTS.cta));
  Object.assign(settings.display, structuredClone(DEFAULTS.display));
  Object.assign(settings.theme, structuredClone(DEFAULTS.theme));
  Object.assign(settings.features, structuredClone(DEFAULTS.features));
  Object.assign(settings.scene, structuredClone(DEFAULTS.scene));
  Object.assign(settings.timers, structuredClone(DEFAULTS.timers));
  Object.assign(settings.vegCounter, structuredClone(DEFAULTS.vegCounter));
  Object.assign(settings.sound, structuredClone(DEFAULTS.sound));
  Object.assign(settings.names, structuredClone(DEFAULTS.names));
  Object.assign(settings.sign, structuredClone(DEFAULTS.sign));
  Object.assign(settings.bigTickets, structuredClone(DEFAULTS.bigTickets));
  Object.assign(settings.toasts, structuredClone(DEFAULTS.toasts));
  Object.assign(settings.labels, structuredClone(DEFAULTS.labels));
  saveSettings();
}

// word → action lookup built from the alias lists.
export function wordMap() {
  const map = {};
  for (const [action, words] of Object.entries(settings.commands)) {
    for (const raw of String(words).split(",")) {
      const w = raw.trim().toLowerCase().replace(/^!/, "");
      if (w) map[w] = action;
    }
  }
  return map;
}

export function firstAlias(action) {
  const w = String(settings.commands[action] ?? action).split(",")[0].trim().replace(/^!/, "");
  return w || action;
}

loadSettings();
