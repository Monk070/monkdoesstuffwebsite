// Tiny synthesized sound effects via Web Audio — no audio files needed.
// The "ding" is two sine partials (E6 + A6) with a fast attack and a long
// exponential tail, like a service bell.

let ctx = null;

export function playDing(volume01 = 1) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.25 * Math.min(1, Math.max(0, volume01));
    master.connect(ctx.destination);

    const partials = [
      [1318.5, 0, 0.9, 1],    // freq, delay, duration, gain
      [1760, 0.06, 0.7, 0.55],
    ];
    for (const [freq, delay, dur, gain] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + delay);
      g.gain.linearRampToValueAtTime(gain, t0 + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + delay + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + dur + 0.05);
    }
  } catch { /* no audio available — stay silent */ }
}
