// Generative SFX — Web Audio, no samples (same approach as the marble run).
// Browsers require a user gesture before audio can play, so the AudioContext
// is created lazily and resumed on the first keydown / pointerdown.
//
// Volume + on/off live in ⚙ Settings → Sound.

import { settings } from "./settings.js";

let ctx = null;
let masterGain = null;
let armed = false;

const VOLUME_CEILING = 0.6;   // sounds are tuned against this ceiling

function ensureCtx() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  return ctx;
}

function tryArm() {
  if (armed) return;
  const c = ensureCtx();
  if (c && c.state === "suspended") c.resume();
  armed = true;
  window.removeEventListener("keydown", tryArm);
  window.removeEventListener("pointerdown", tryArm);
}
window.addEventListener("keydown", tryArm);
window.addEventListener("pointerdown", tryArm);

// Returns the context ready-to-play, or null if muted/unarmed.
function ready() {
  if (!armed || !ctx) return null;
  if (!settings.sound.enabled) return null;
  masterGain.gain.value = Math.max(0, Math.min(1, settings.sound.volume)) * VOLUME_CEILING;
  return ctx;
}

const jitter = (f, pct = 0.05) => f * (1 - pct + Math.random() * pct * 2);

// simple enveloped oscillator
function blip(c, { type = "sine", from, to = null, t0, dur, peak = 0.2, filter = null }) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);

  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  let node = osc;
  if (filter) {
    // frequency/Q are AudioParams (read-only properties) — set .value,
    // never Object.assign, which throws and used to stall the whole game
    const f = c.createBiquadFilter();
    f.type = filter.type ?? "lowpass";
    if (filter.frequency) f.frequency.value = filter.frequency;
    if (filter.Q) f.Q.value = filter.Q;
    node.connect(f);
    node = f;
  }
  node.connect(env).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// enveloped noise burst
function noise(c, { t0, dur, peak = 0.2, type = "lowpass", freqFrom, freqTo = null, q = 1 }) {
  const len = Math.max(1, Math.floor(dur * c.sampleRate));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;

  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freqFrom, t0);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  f.Q.value = q;

  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(f).connect(env).connect(masterGain);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// ---- the café sound set ----

// cat meow: sawtooth with an up-then-down pitch arc through a lowpass
export function meow() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const base = jitter(480, 0.12);

  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(base, t);
  osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.12);   // "me-"
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.34);   // "-ow"

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1500, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.34);
  lp.Q.value = 3;

  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.12, t + 0.04);
  env.gain.setValueAtTime(0.12, t + 0.16);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

  osc.connect(lp).connect(env).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.4);
}

// dog woof: two low sawtooth barks through a lowpass
export function woof() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [0, 0.16].forEach((d) => {
    blip(c, { type: "sawtooth", from: jitter(220, 0.1), to: 120, t0: t + d, dur: 0.12, peak: 0.16,
              filter: { type: "lowpass", frequency: 900, Q: 1.2 } });
  });
}

// rabbit squeak: two quick high chirps
export function squeak() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  blip(c, { type: "sine", from: jitter(1900, 0.1), to: 2600, t0: t, dur: 0.08, peak: 0.1 });
  blip(c, { type: "sine", from: jitter(2400, 0.1), to: 1700, t0: t + 0.1, dur: 0.09, peak: 0.08 });
}

// watering: bloop-bloop-bloop, rising
export function bloops() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [280, 360, 460].forEach((f, i) => {
    blip(c, { from: jitter(f), to: jitter(f) * 1.3, t0: t + i * 0.11, dur: 0.1, peak: 0.16 });
  });
}

// chop: knife thock — noise tick + low thump
export function chop() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  noise(c, { t0: t, dur: 0.05, peak: 0.22, freqFrom: 2400, freqTo: 800, q: 0.8 });
  blip(c, { type: "square", from: 170, to: 90, t0: t, dur: 0.09, peak: 0.14,
            filter: { type: "lowpass", frequency: 500 } });
}

// fry: sizzle
export function sizzle() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  noise(c, { t0: t, dur: 0.5, peak: 0.1, type: "bandpass", freqFrom: 3800, freqTo: 2600, q: 0.6 });
}

// stir: swish
export function stir() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  noise(c, { t0: t, dur: 0.28, peak: 0.09, type: "bandpass", freqFrom: 600, freqTo: 1600, q: 1.5 });
}

// bake: oven whoosh
export function bake() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  noise(c, { t0: t, dur: 0.45, peak: 0.12, freqFrom: 220, freqTo: 500, q: 0.8 });
  blip(c, { from: 90, to: 70, t0: t, dur: 0.3, peak: 0.06 });
}

// plate: soft clink
export function clink() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  blip(c, { type: "triangle", from: jitter(1150), t0: t, dur: 0.12, peak: 0.12 });
  blip(c, { type: "sine", from: jitter(2300), t0: t, dur: 0.08, peak: 0.05 });
}

// served: "Ba-ding!" — short low strike, then a ringing bell note
export function bading() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  blip(c, { type: "triangle", from: 660, t0: t, dur: 0.09, peak: 0.14 });          // "ba"
  blip(c, { type: "triangle", from: 990, t0: t + 0.1, dur: 0.55, peak: 0.16 });    // "ding"
  blip(c, { type: "sine", from: 990 * 2.76, t0: t + 0.1, dur: 0.4, peak: 0.05 });  // bell shimmer
}

// customer running out of patience: tick-tock-tick-tock
export function ticktock() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [1150, 860, 1150, 860].forEach((f, i) => {
    blip(c, { type: "square", from: f, to: f * 0.9, t0: t + i * 0.16, dur: 0.035, peak: 0.1,
              filter: { type: "lowpass", frequency: 2200, Q: 0.7 } });
  });
}
