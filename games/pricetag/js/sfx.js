// Tiny generative SFX (Web Audio, no samples): countdown ticks and the
// reveal "ding". Browsers unlock audio on first click; OBS plays immediately.

let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext ?? window.webkitAudioContext)(); }
    catch { enabled = false; }
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function setEnabled(on) { enabled = on; }

function blip(freq, dur = 0.08, gain = 0.12, type = "square") {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  } catch { /* audio is never worth crashing over */ }
}

export function tick()   { blip(880, 0.05, 0.08); }
export function lastTick() { blip(1320, 0.07, 0.1); }
export function reveal() { blip(523, 0.12, 0.14, "triangle"); setTimeout(() => blip(784, 0.2, 0.14, "triangle"), 110); }
export function win()    { [659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.15, 0.12, "triangle"), i * 90)); }
