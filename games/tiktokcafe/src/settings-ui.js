// ⚙ Settings modal — edit command aliases + gift/like effects at runtime.
// Opened from the dev panel's Settings button.

import {
  settings, saveSettings, resetSettings,
  ROOM_ACTIONS, VERB_ACTIONS, FONT_CHOICES,
} from "./settings.js";
import { refreshCommands } from "./commands.js";
import { resetCoins, resetServed, resetFood } from "./game.js";
import { rebuildStatic } from "./scene.js";

let modal = null;

function field(labelText, inputEl) {
  const row = document.createElement("label");
  row.className = "set-row";
  const span = document.createElement("span");
  span.textContent = labelText;
  row.append(span, inputEl);
  return row;
}

// Collapsible section — keeps the long settings list navigable.
function section(box, title, note = null) {
  const det = document.createElement("details");
  det.className = "set-section";
  const sum = document.createElement("summary");
  sum.textContent = title;
  det.appendChild(sum);
  if (note) {
    const p = document.createElement("p");
    p.className = "set-note";
    p.textContent = note;
    det.appendChild(p);
  }
  box.appendChild(det);
  return det;
}

function makeSelect(options, value) {
  const s = document.createElement("select");
  for (const [val, label] of options) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    s.appendChild(opt);
  }
  s.value = value;
  return s;
}

const fontOptions = FONT_CHOICES.map(f => [f, f]);

// numeric input that live-writes into settings while typing
function numInput(value, set, { step = "1", min = null } = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.step = step;
  if (min !== null) input.min = min;
  input.value = value;
  input.addEventListener("input", () => {
    const n = parseFloat(input.value);
    if (!Number.isNaN(n)) set(n);
  });
  return input;
}

// colour picker that live-writes into settings
function colorInput(value, set) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("input", () => set(input.value));
  return input;
}

function buildModal() {
  modal = document.createElement("div");
  modal.id = "settings";
  const box = document.createElement("div");
  box.className = "settings-box";
  modal.appendChild(box);

  const h = document.createElement("h2");
  h.textContent = "Café Settings";
  box.appendChild(h);

  const cmdInputs = {};
  const giftInputs = {};

  const cmdSec = section(box, "Chat commands",
    "Comma-separated aliases — the first one shows on signs and hints.");
  const grid = document.createElement("div");
  grid.className = "set-grid";
  for (const action of [...ROOM_ACTIONS, ...VERB_ACTIONS]) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = settings.commands[action];
    cmdInputs[action] = input;
    grid.appendChild(field("!" + action, input));
  }
  cmdSec.appendChild(grid);

  const giftSec = section(box, "Likes & gifts");
  const gifts = document.createElement("div");
  gifts.className = "set-grid";
  const giftFields = [
    ["freezeSeconds", "Gift: freeze timers (seconds)"],
    ["crateMinCoins", "Gift: crate drop from (coins)"],
    ["fuelPerLike",   "Likes: stove fuel per like"],
  ];
  for (const [key, label] of giftFields) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.min = "0";
    input.value = settings.gifts[key];
    giftInputs[key] = input;
    gifts.appendChild(field(label, input));
  }
  giftSec.appendChild(gifts);

  // kitchen timers
  const timerSec = section(box, "Kitchen timers (seconds) & limits");
  const timers = document.createElement("div");
  timers.className = "set-grid";
  const timerInputs = {
    orderSeconds: numInput(settings.timers.orderSeconds, n => (settings.timers.orderSeconds = n), { min: "10" }),
    cookSeconds:  numInput(settings.timers.cookSeconds,  n => (settings.timers.cookSeconds = n),  { min: "1" }),
    plateSeconds: numInput(settings.timers.plateSeconds, n => (settings.timers.plateSeconds = n), { min: "2" }),
    serveSeconds: numInput(settings.timers.serveSeconds, n => (settings.timers.serveSeconds = n), { min: "2" }),
    maxOrders:    numInput(settings.timers.maxOrders,    n => (settings.timers.maxOrders = n),    { min: "1" }),
    vibeDecayPerMin: numInput(settings.timers.vibeDecayPerMin, n => (settings.timers.vibeDecayPerMin = n), { min: "0" }),
    idleLeaveSeconds: numInput(settings.timers.idleLeaveSeconds, n => (settings.timers.idleLeaveSeconds = n), { min: "30" }),
  };
  timers.appendChild(field("Order lasts / customer waits", timerInputs.orderSeconds));
  timers.appendChild(field("Cooking time", timerInputs.cookSeconds));
  timers.appendChild(field("Time to !plate before burning", timerInputs.plateSeconds));
  timers.appendChild(field("Time to !serve before self-serve", timerInputs.serveSeconds));
  timers.appendChild(field("Max orders at once (1–4)", timerInputs.maxOrders));
  timers.appendChild(field("Cat vibe decay (per minute)", timerInputs.vibeDecayPerMin));
  timers.appendChild(field("Character leaves after idle (seconds)", timerInputs.idleLeaveSeconds));
  timerSec.appendChild(timers);

  // feature toggles
  const featSec = section(box, "Features");
  const feats = document.createElement("div");
  feats.className = "set-grid";
  const giftsToggle = document.createElement("input");
  giftsToggle.type = "checkbox";
  giftsToggle.checked = settings.features.gifts;
  giftsToggle.addEventListener("change", () => { settings.features.gifts = giftsToggle.checked; });
  feats.appendChild(field("Gift effects enabled", giftsToggle));

  const cmdsToggle = document.createElement("input");
  cmdsToggle.type = "checkbox";
  cmdsToggle.checked = settings.features.commands;
  cmdsToggle.addEventListener("change", () => { settings.features.commands = cmdsToggle.checked; });
  feats.appendChild(field("Text commands enabled", cmdsToggle));

  const bgToggle = document.createElement("input");
  bgToggle.type = "checkbox";
  bgToggle.checked = settings.features.viewerBackground;
  bgToggle.addEventListener("change", () => { settings.features.viewerBackground = bgToggle.checked; });
  feats.appendChild(field("Viewers can change background (!background)", bgToggle));
  featSec.appendChild(feats);

  // veg counter — the garden↔kitchen supply-chain display
  const vegSec = section(box, "Veg counter", "Garden grows it, kitchen uses it — shown in both rooms.");
  const vegGrid = document.createElement("div");
  vegGrid.className = "set-grid";

  const vegFont = makeSelect(fontOptions, settings.vegCounter.font);
  vegFont.addEventListener("change", () => { settings.vegCounter.font = vegFont.value; });
  vegGrid.appendChild(field("Font", vegFont));

  const vegSize = numInput(settings.vegCounter.size, n => (settings.vegCounter.size = n), { min: "4" });
  vegGrid.appendChild(field("Font size", vegSize));

  const vegStyle = makeSelect(
    [["normal", "Normal"], ["bold", "Bold"], ["italic", "Italic"], ["bold italic", "Bold italic"]],
    settings.vegCounter.style,
  );
  vegStyle.addEventListener("change", () => { settings.vegCounter.style = vegStyle.value; });
  vegGrid.appendChild(field("Font style", vegStyle));

  const vegColor = colorInput(settings.vegCounter.color, v => (settings.vegCounter.color = v));
  vegGrid.appendChild(field("Text colour", vegColor));

  const vegBg = colorInput(settings.vegCounter.bg, v => (settings.vegCounter.bg = v));
  vegGrid.appendChild(field("Background colour", vegBg));
  vegSec.appendChild(vegGrid);

  // sound — generative SFX on/off + volume
  const soundSec = section(box, "Sound");
  const soundGrid = document.createElement("div");
  soundGrid.className = "set-grid";

  const soundToggle = document.createElement("input");
  soundToggle.type = "checkbox";
  soundToggle.checked = settings.sound.enabled;
  soundToggle.addEventListener("change", () => { settings.sound.enabled = soundToggle.checked; });
  soundGrid.appendChild(field("Sound effects enabled", soundToggle));

  const soundVol = document.createElement("input");
  soundVol.type = "range";
  soundVol.min = "0";
  soundVol.max = "1";
  soundVol.step = "0.05";
  soundVol.value = settings.sound.volume;
  const volLabel = () => `Volume: ${Math.round(soundVol.value * 100)}%`;
  const volField = field(volLabel(), soundVol);
  soundVol.addEventListener("input", () => {
    volField.querySelector("span").textContent = volLabel();
    settings.sound.volume = parseFloat(soundVol.value);                  // live
  });
  soundGrid.appendChild(volField);
  soundSec.appendChild(soundGrid);

  // scene background — the world outside the café
  const sceneSec = section(box, "Background",
    "The world outside the café — sky, street and weather. Applies instantly.");
  const sceneGrid = document.createElement("div");
  sceneGrid.className = "set-grid";
  const sceneTheme = makeSelect(
    [["night", "Night (default)"], ["day", "Day"], ["space", "Space"],
     ["halloween", "Halloween"], ["xmas", "Christmas"]],
    settings.scene.theme,
  );
  sceneTheme.addEventListener("change", () => {
    settings.scene.theme = sceneTheme.value;                             // live
    rebuildStatic();
  });
  sceneGrid.appendChild(field("Scene theme", sceneTheme));
  sceneSec.appendChild(sceneGrid);

  // theme — fonts, bubble colours, meter colour/size
  const themeSec = section(box, "Theme");
  const theme = document.createElement("div");
  theme.className = "set-grid";

  const signText = document.createElement("input");
  signText.type = "text";
  signText.value = settings.sign.text;
  signText.addEventListener("input", () => { settings.sign.text = signText.value; });   // live
  theme.appendChild(field("Sign title (gold pixel letters)", signText));

  const uiFont = makeSelect(fontOptions, settings.theme.uiFont);
  uiFont.addEventListener("change", () => { settings.theme.uiFont = uiFont.value; });
  theme.appendChild(field("UI font (tags, bubbles, labels)", uiFont));

  const bubbleBg = colorInput(settings.theme.bubbleBg, v => (settings.theme.bubbleBg = v));
  theme.appendChild(field("Bubble background", bubbleBg));

  const bubbleText = colorInput(settings.theme.bubbleText, v => (settings.theme.bubbleText = v));
  theme.appendChild(field("Bubble text colour", bubbleText));

  const vibeColor = colorInput(settings.theme.vibeColor, v => (settings.theme.vibeColor = v));
  theme.appendChild(field("Cat heart meter colour", vibeColor));

  const meterSize = document.createElement("input");
  meterSize.type = "range";
  meterSize.min = "0.5";
  meterSize.max = "2";
  meterSize.step = "0.25";
  meterSize.value = settings.theme.meterScale;
  const meterLabel = () => `Meter size: ${meterSize.value}×`;
  const meterField = field(meterLabel(), meterSize);
  meterSize.addEventListener("input", () => {
    meterField.querySelector("span").textContent = meterLabel();
    settings.theme.meterScale = parseFloat(meterSize.value);              // live
  });
  theme.appendChild(meterField);
  themeSec.appendChild(theme);

  // display — character sprite scale slider (1×/2×/3×)
  const dispSec = section(box, "Display");
  const disp = document.createElement("div");
  disp.className = "set-grid";
  const scaleInput = document.createElement("input");
  scaleInput.type = "range";
  scaleInput.min = "1";
  scaleInput.max = "3";
  scaleInput.step = "1";
  scaleInput.value = settings.display.charScale;
  const scaleLabel = () => `Character size: ${scaleInput.value}×`;
  const scaleField = field(scaleLabel(), scaleInput);
  scaleInput.addEventListener("input", () => {
    scaleField.querySelector("span").textContent = scaleLabel();
    settings.display.charScale = parseInt(scaleInput.value, 10);   // live preview
  });
  disp.appendChild(scaleField);
  dispSec.appendChild(disp);

  // player name tags — mode, font size, char limit, position
  const nameSec = section(box, "Player names");
  const nameGrid = document.createElement("div");
  nameGrid.className = "set-grid";

  const nameMode = makeSelect(
    [["bubble", "Bubble above head"], ["chest", "Badge on chest"]],
    settings.names.mode,
  );
  nameMode.addEventListener("change", () => { settings.names.mode = nameMode.value; });  // live
  nameGrid.appendChild(field("Display style", nameMode));

  const nameSize = document.createElement("input");
  nameSize.type = "range";
  nameSize.min = "4";
  nameSize.max = "10";
  nameSize.step = "1";
  nameSize.value = settings.names.size;
  const nameSizeLabel = () => `Font size: ${nameSize.value}px`;
  const nameSizeField = field(nameSizeLabel(), nameSize);
  nameSize.addEventListener("input", () => {
    nameSizeField.querySelector("span").textContent = nameSizeLabel();
    settings.names.size = parseInt(nameSize.value, 10);                     // live
  });
  nameGrid.appendChild(nameSizeField);

  const nameChars = numInput(settings.names.maxChars, n => (settings.names.maxChars = n), { min: "3" });
  nameGrid.appendChild(field("Character limit", nameChars));

  const nameDx = numInput(settings.names.dx, n => (settings.names.dx = n));
  nameGrid.appendChild(field("X offset (or click a name + arrows)", nameDx));

  const nameDy = numInput(settings.names.dy, n => (settings.names.dy = n));
  nameGrid.appendChild(field("Y offset", nameDy));
  nameSec.appendChild(nameGrid);

  // large order tickets — position, scale, font, colour
  const btSec = section(box, "Order tickets", "The large tickets under the rooms.");
  const btGrid = document.createElement("div");
  btGrid.className = "set-grid";

  const btX = numInput(settings.bigTickets.x, n => (settings.bigTickets.x = n));
  btGrid.appendChild(field("X centre (or click the row + arrows)", btX));

  const btY = numInput(settings.bigTickets.y, n => (settings.bigTickets.y = n));
  btGrid.appendChild(field("Y position", btY));

  const btScale = document.createElement("input");
  btScale.type = "range";
  btScale.min = "0.5";
  btScale.max = "2";
  btScale.step = "0.1";
  btScale.value = settings.bigTickets.scale;
  const btScaleLabel = () => `Ticket scale: ${btScale.value}×`;
  const btScaleField = field(btScaleLabel(), btScale);
  btScale.addEventListener("input", () => {
    btScaleField.querySelector("span").textContent = btScaleLabel();
    settings.bigTickets.scale = parseFloat(btScale.value);               // live
  });
  btGrid.appendChild(btScaleField);

  const btFont = makeSelect(fontOptions, settings.bigTickets.font);
  btFont.addEventListener("change", () => { settings.bigTickets.font = btFont.value; });
  btGrid.appendChild(field("Ticket font", btFont));

  const btFontSize = numInput(settings.bigTickets.fontSize, n => (settings.bigTickets.fontSize = n), { min: "4" });
  btGrid.appendChild(field("Font size", btFontSize));

  const btStyle = makeSelect(
    [["normal", "Normal"], ["bold", "Bold"], ["italic", "Italic"], ["bold italic", "Bold italic"]],
    settings.bigTickets.fontStyle,
  );
  btStyle.addEventListener("change", () => { settings.bigTickets.fontStyle = btStyle.value; });
  btGrid.appendChild(field("Font style", btStyle));

  const btColor = colorInput(settings.bigTickets.color, v => (settings.bigTickets.color = v));
  btGrid.appendChild(field("Text colour", btColor));
  btSec.appendChild(btGrid);

  // game messages (toasts) — position, count, duration, fonts, colours
  const toastSec = section(box, "Game messages", "The full-width bars, e.g. “jules_v joined the kitchen!”");
  const toastGrid = document.createElement("div");
  toastGrid.className = "set-grid";

  const posInput = makeSelect(
    [["below", "Below the rooms"], ["above", "Above the rooms"]],
    settings.toasts.position,
  );
  posInput.addEventListener("change", () => { settings.toasts.position = posInput.value; });  // live
  toastGrid.appendChild(field("Position", posInput));

  const maxInput = document.createElement("input");
  maxInput.type = "range";
  maxInput.min = "1";
  maxInput.max = "7";
  maxInput.step = "1";
  maxInput.value = settings.toasts.max;
  const maxLabel = () => `Messages shown: ${maxInput.value}`;
  const maxField = field(maxLabel(), maxInput);
  maxInput.addEventListener("input", () => {
    maxField.querySelector("span").textContent = maxLabel();
    settings.toasts.max = parseInt(maxInput.value, 10);                 // live
  });
  toastGrid.appendChild(maxField);

  const secsInput = document.createElement("input");
  secsInput.type = "number";
  secsInput.step = "0.5";
  secsInput.min = "0.5";
  secsInput.value = settings.toasts.seconds;
  toastGrid.appendChild(field("Time on screen (seconds)", secsInput));

  const toastFont = makeSelect(fontOptions, settings.toasts.font);
  toastFont.addEventListener("change", () => { settings.toasts.font = toastFont.value; });    // live
  toastGrid.appendChild(field("Message font", toastFont));

  const toastColor = document.createElement("input");
  toastColor.type = "color";
  toastColor.value = settings.toasts.textColor;
  toastColor.addEventListener("input", () => { settings.toasts.textColor = toastColor.value; });
  toastGrid.appendChild(field("Message colour", toastColor));

  const userStyled = document.createElement("input");
  userStyled.type = "checkbox";
  userStyled.checked = settings.toasts.userStyled;
  userStyled.addEventListener("change", () => { settings.toasts.userStyled = userStyled.checked; });
  toastGrid.appendChild(field("Style the username differently", userStyled));

  const userFont = makeSelect(fontOptions, settings.toasts.userFont);
  userFont.addEventListener("change", () => { settings.toasts.userFont = userFont.value; });  // live
  toastGrid.appendChild(field("Username font", userFont));

  const userColor = document.createElement("input");
  userColor.type = "color";
  userColor.value = settings.toasts.userColor;
  userColor.addEventListener("input", () => { settings.toasts.userColor = userColor.value; });
  toastGrid.appendChild(field("Username colour", userColor));
  toastSec.appendChild(toastGrid);

  // "type !kitchen to cook" message — text, position, size
  const ctaSec = section(box, "Call-to-action message", "The flashing hint shown when the kitchen is empty.");
  const ctaInputs = {};
  const cta = document.createElement("div");
  cta.className = "set-grid";
  const ctaFields = [
    ["text", "Text (blank = auto)", "text"],
    ["x",    "X position (0–360)",  "number"],
    ["y",    "Y position (0–640)",  "number"],
    ["size", "Font size",           "number"],
  ];
  for (const [key, label, type] of ctaFields) {
    const input = document.createElement("input");
    input.type = type;
    if (type === "number") { input.step = "1"; input.min = "0"; }
    input.value = settings.cta[key];
    ctaInputs[key] = input;
    cta.appendChild(field(label, input));
  }
  ctaSec.appendChild(cta);

  const actions = document.createElement("div");
  actions.className = "set-actions";
  const mkBtn = (label, fn, cls = "") => {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", fn);
    actions.appendChild(b);
    return b;
  };

  mkBtn("Save", () => {
    for (const action of Object.keys(cmdInputs)) {
      const v = cmdInputs[action].value.trim();
      if (v) settings.commands[action] = v;
    }
    for (const key of Object.keys(giftInputs)) {
      const n = parseFloat(giftInputs[key].value);
      if (!Number.isNaN(n) && n >= 0) settings.gifts[key] = n;
    }
    settings.cta.text = ctaInputs.text.value.trim();
    for (const key of ["x", "y", "size"]) {
      const n = parseFloat(ctaInputs[key].value);
      if (!Number.isNaN(n)) settings.cta[key] = n;
    }
    settings.display.charScale = parseInt(scaleInput.value, 10) || 3;
    settings.toasts.position = posInput.value;
    settings.toasts.max = parseInt(maxInput.value, 10) || 3;
    const secs = parseFloat(secsInput.value);
    if (!Number.isNaN(secs) && secs > 0) settings.toasts.seconds = secs;
    saveSettings();
    refreshCommands();
    close();
  }, "primary");

  mkBtn("Reset defaults", () => {
    resetSettings();
    refreshCommands();
    for (const action of Object.keys(cmdInputs)) cmdInputs[action].value = settings.commands[action];
    for (const key of Object.keys(giftInputs)) giftInputs[key].value = settings.gifts[key];
    for (const key of Object.keys(ctaInputs)) ctaInputs[key].value = settings.cta[key];
    scaleInput.value = settings.display.charScale;
    scaleField.querySelector("span").textContent = scaleLabel();
    posInput.value = settings.toasts.position;
    maxInput.value = settings.toasts.max;
    maxField.querySelector("span").textContent = maxLabel();
    secsInput.value = settings.toasts.seconds;
    toastFont.value = settings.toasts.font;
    toastColor.value = settings.toasts.textColor;
    userStyled.checked = settings.toasts.userStyled;
    userFont.value = settings.toasts.userFont;
    userColor.value = settings.toasts.userColor;
    nameMode.value = settings.names.mode;
    nameSize.value = settings.names.size;
    nameSizeField.querySelector("span").textContent = nameSizeLabel();
    nameChars.value = settings.names.maxChars;
    nameDx.value = settings.names.dx;
    nameDy.value = settings.names.dy;
    for (const key of Object.keys(timerInputs)) timerInputs[key].value = settings.timers[key];
    soundToggle.checked = settings.sound.enabled;
    soundVol.value = settings.sound.volume;
    volField.querySelector("span").textContent = volLabel();
    vegFont.value = settings.vegCounter.font;
    vegSize.value = settings.vegCounter.size;
    vegStyle.value = settings.vegCounter.style;
    vegColor.value = settings.vegCounter.color;
    vegBg.value = settings.vegCounter.bg;
    giftsToggle.checked = settings.features.gifts;
    cmdsToggle.checked = settings.features.commands;
    bgToggle.checked = settings.features.viewerBackground;
    signText.value = settings.sign.text;
    btX.value = settings.bigTickets.x;
    btY.value = settings.bigTickets.y;
    btScale.value = settings.bigTickets.scale;
    btScaleField.querySelector("span").textContent = btScaleLabel();
    btFont.value = settings.bigTickets.font;
    btFontSize.value = settings.bigTickets.fontSize;
    btStyle.value = settings.bigTickets.fontStyle;
    btColor.value = settings.bigTickets.color;
    uiFont.value = settings.theme.uiFont;
    bubbleBg.value = settings.theme.bubbleBg;
    bubbleText.value = settings.theme.bubbleText;
    vibeColor.value = settings.theme.vibeColor;
    meterSize.value = settings.theme.meterScale;
    meterField.querySelector("span").textContent = meterLabel();
    sceneTheme.value = settings.scene.theme;
    rebuildStatic();
  });

  mkBtn("Reset coin counter", () => {
    if (window.confirm("Zero the coin counter?")) resetCoins();
  });

  mkBtn("Reset served counter", () => {
    if (window.confirm("Zero the served counter?")) resetServed();
  });

  mkBtn("Reset food", () => {
    if (window.confirm("Reset the food pantry to 20?")) resetFood();
  });

  mkBtn("Close", close);
  box.appendChild(actions);

  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.body.appendChild(modal);
}

export function openSettings() {
  if (!modal) buildModal();
  modal.classList.add("open");
}

function close() {
  modal?.classList.remove("open");
}
