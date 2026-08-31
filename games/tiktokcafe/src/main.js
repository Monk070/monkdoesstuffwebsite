// TikTok Café — boot. One ingest() path feeds the game whether events come
// from the local TikTok LIVE bridge (live) or the dev simulator (fake).

import { connect as connectBridge } from "./tiktok-client.js";
import { W, H, getStatic, drawAmbient, SCENE_THEMES } from "./scene.js";
import { camera, toggleZoom, viewport } from "./camera.js";
import * as game from "./game.js";
import * as commands from "./commands.js";
import * as view from "./view.js";
import * as fx from "./fx.js";
import { initSimulator, setTikTokState, logEvent } from "./simulator.js";
import { settings } from "./settings.js";
import * as labelEditor from "./label-editor.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

// Speech bubbles render on a separate overlay canvas at full device
// resolution so Arial text stays sharp while the pixel art stays chunky.
const overlay = document.getElementById("overlay");
const octx = overlay.getContext("2d");
let overlayScale = 1;   // logical (360×640) → overlay device pixels

// ---- scale the 360×640 canvas to fill the window (keeps 9:16 aspect) ----
function fit() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  overlay.style.width = canvas.style.width;
  overlay.style.height = canvas.style.height;
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.max(1, Math.round(W * scale * dpr));
  overlay.height = Math.max(1, Math.round(H * scale * dpr));
  overlayScale = overlay.width / W;
}
window.addEventListener("resize", fit);
fit();

// Z toggles the zoom camera; ?zoom=0 starts zoomed out.
// Arrow keys nudge a clicked label (label-editor) and win over other keys.
window.addEventListener("keydown", (e) => {
  if (e.target.matches?.("input")) return;
  if (labelEditor.handleKey(e)) { e.preventDefault(); return; }
  if (e.key.toLowerCase() === "z") toggleZoom();
});
if (new URLSearchParams(location.search).get("zoom") === "0") toggleZoom();

// ?msgpos=above|below overrides the saved message position for this session
// (useful for testing or a per-OBS-source setup without changing settings).
const msgpos = new URLSearchParams(location.search).get("msgpos");
if (msgpos === "above" || msgpos === "below") settings.toasts.position = msgpos;

// ?names=bubble|chest — session-only override of the name tag style.
const namemode = new URLSearchParams(location.search).get("names");
if (namemode === "bubble" || namemode === "chest") settings.names.mode = namemode;

// ?coins=N — set the coin counter (display testing).
const coinsParam = parseInt(new URLSearchParams(location.search).get("coins"), 10);
if (!Number.isNaN(coinsParam) && coinsParam >= 0) game.state.coins = coinsParam;

// ?theme=night|day|space|halloween|xmas — session-only background override.
const themeParam = new URLSearchParams(location.search).get("theme");
if (SCENE_THEMES.includes(themeParam)) settings.scene.theme = themeParam;

// ?animal=cats|dogs|rabbits — set the loft species (display testing).
const animalParam = new URLSearchParams(location.search).get("animal");
if (game.ANIMAL_KINDS.includes(animalParam)) game.state.animal = animalParam;

// Click a label to select it for arrow-key nudging.
canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const lx = ((e.clientX - r.left) / r.width) * W;
  const ly = ((e.clientY - r.top) / r.height) * H;
  labelEditor.handleClick(camera.x + lx / camera.z, camera.y + ly / camera.z);
});

// ---- single ingest path (live + sim) ----
export function ingest(msg, source = "live") {
  if (source === "sim") console.debug("[cafe] (sim)", msg.event, msg.data?.comment ?? "");
  logEvent(msg, source);
  commands.handleEvent(msg);
}

// ---- error surfacing ----
// A single uncaught exception used to kill the rAF loop dead — the game
// "stalled" with no visible cause. Now every frame is wrapped, the loop
// always reschedules, and errors show in a red bar so they can be reported.
let errBar = null;
let errCount = 0;

function showError(msg) {
  errCount++;
  if (!errBar) {
    errBar = document.createElement("div");
    errBar.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:99;background:#7a1f1f;" +
      "color:#ffd7d7;font:12px/1.4 monospace;padding:4px 10px;white-space:pre-wrap;";
    document.body.appendChild(errBar);
  }
  errBar.textContent = `game error ×${errCount} (screenshot me!): ${msg}`;
}

window.addEventListener("error", (e) => showError(e.message ?? String(e.error)));
window.addEventListener("unhandledrejection", (e) => showError(String(e.reason)));

// ---- main loop ----
let last = performance.now();

function frame(now) {
  try {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    game.tick(dt);
    fx.update(dt);

    // camera: zoomed (building fills the width) or full scene
    const z = camera.z;
    ctx.setTransform(z, 0, 0, z, -z * camera.x, -z * camera.y);
    ctx.drawImage(getStatic(), 0, 0);   // cached; rebuilt on theme change
    drawAmbient(ctx, t, game.state);
    view.draw(ctx, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const k = overlayScale * z;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(k, 0, 0, k, -k * camera.x, -k * camera.y);
    view.drawOverlay(octx, t, viewport());
  } catch (err) {
    console.error("[cafe] frame error:", err);
    showError(err?.stack?.split("\n").slice(0, 2).join(" ") ?? String(err));
  }
  requestAnimationFrame(frame);   // ALWAYS reschedule — one bad frame must not stall the café
}
requestAnimationFrame(frame);

// ---- TikTok LIVE bridge (the serve.mjs WebSocket; auto-reconnects) ----
connectBridge({
  onClose: () => setTikTokState({ state: "error", error: "Local server offline — run start.bat" }),
  onEvent: (msg) => {
    if (msg.event === "tiktokState") return setTikTokState(msg.data);
    ingest(msg, "live");
  },
});

// ---- dev simulator panel ----
initSimulator(ingest);

// ---- ?demo seeds a busy café (screenshots, quick visual checks) ----
if (new URLSearchParams(location.search).has("demo")) {
  const seed = (u, msg) => ingest({ event: "chat", data: { uniqueId: u, nickname: u, comment: msg } }, "sim");
  game.state.coins = 150;
  seed("alice_smith", "!kitchen");
  seed("bobthebuilder", "!kitchen");
  seed("bobthebuilder", "!gold");
  seed("charlie99", "!kitchen");
  seed("diana_d", "!counter");
  seed("ethan_x", "!garden");
  seed("fiona_p", "!loft");
  // show off the customization range in screenshots (persists harmlessly —
  // these are fake users): a trans-male hoodie chef, a non-binary gardener,
  // a purple bob, a ghost server, a kitten follower
  game.setStyle("charlie99", { gender: 3, top: 2, lower: 2 });
  game.setStyle("ethan_x", { gender: 2, skin: 5 });
  game.setStyle("fiona_p", { haircolour: 6, hairstyle: 3 });
  game.setStyle("diana_d", { form: "ghost" });
  game.setStyle("alice_smith", { pet: "cat" });
  game.setStyle("bobthebuilder", { form: "alien" });
  const t1 = game.spawnTicket(), t2 = game.spawnTicket();
  if (t1) { t1.slots.forEach(s => (s.have = s.need)); t1.state = "cooking"; t1.cookLeft = 5; }
  if (t2) { t2.slots.forEach(s => (s.have = s.need)); t2.state = "pass"; t2.passAge = 2; }
  seed("hungry_hank", "!customer");
  game.state.served = 7;
  game.state.vibe = 45;
  game.state.growth = 2;
  game.onGift("diana_d", "Rose", 1);
}
