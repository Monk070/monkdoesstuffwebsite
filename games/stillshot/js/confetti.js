// Lightweight canvas confetti — no dependencies. Fired over the game frame on
// a correct guess; falls, spins, fades, cleans itself up.

const COLORS = ['#1db954', '#6c5ce7', '#f5c542', '#e05555', '#4ecdc4', '#ff8a5c', '#eaeaf0'];
const COUNT = 140;
const DURATION_MS = 2800;
const FADE_MS = 600;

export function fireConfetti(container) {
  // one burst at a time
  container.querySelector('.confetti-canvas')?.remove();

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 15,
  });
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const parts = Array.from({ length: COUNT }, (_, i) => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    w: 5 + Math.random() * 5,
    h: 8 + Math.random() * 7,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 2 + Math.random() * 3.4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.28,
    sway: Math.random() * Math.PI * 2,
    color: COLORS[i % COLORS.length],
  }));

  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    if (elapsed > DURATION_MS || !canvas.isConnected) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = elapsed > DURATION_MS - FADE_MS
      ? (DURATION_MS - elapsed) / FADE_MS
      : 1;
    for (const p of parts) {
      p.x += p.vx + Math.sin(p.sway + elapsed / 300) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
