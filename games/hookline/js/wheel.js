// Shared iOS-style wheel picker (scroll-snap column with a centre highlight).
// Used by solo (Genre/Era badges) and the multiplayer lobby (all settings).
// Items: { key, label, cls?, disabled? } — disabled rows show greyed and
// can't be committed. DONE applies, backdrop click cancels.

const $ = (id) => document.getElementById(id);

export const WHEEL_ITEM_H = 40;

let wheelState = null; // { items, index, onCommit }
let wired = false;

export function wireWheel() {
  if (wired) return;
  wired = true;
  const wheel = $('wheel');
  let raf = null;
  wheel.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; updateWheelFocus(); });
  });
  // desktop mouse wheel: exactly one item per notch, not a free scroll
  let lastNotch = 0;
  wheel.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!wheelState) return;
    const now = performance.now();
    if (now - lastNotch < 90) return;
    lastNotch = now;
    const idx = Math.max(0, Math.min(wheelState.items.length - 1,
      Math.round(wheel.scrollTop / WHEEL_ITEM_H) + Math.sign(e.deltaY)));
    wheel.scrollTo({ top: idx * WHEEL_ITEM_H, behavior: 'smooth' });
  }, { passive: false });
  $('wheel-done').addEventListener('click', () => {
    if (wheelState) {
      const { items, index, onCommit } = wheelState;
      if (items[index] && !items[index].disabled) onCommit(items[index].key);
    }
    closeWheel();
  });
  // tapping the backdrop cancels without applying
  $('wheel-overlay').addEventListener('click', (e) => {
    if (e.target === $('wheel-overlay')) closeWheel();
  });
}

export function openWheel(title, items, currentKey, onCommit) {
  const wheel = $('wheel');
  const index = Math.max(0, items.findIndex(i => String(i.key) === String(currentKey)));
  wheelState = { items, index, onCommit };
  $('wheel-title').textContent = title;
  wheel.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'wheel-item' + (it.cls ? ` ${it.cls}` : '');
    b.textContent = it.label;
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => {
      // tap to centre it; tap the centred one again to confirm (same as DONE)
      if (i === wheelState?.index) {
        if (!it.disabled) { wheelState.onCommit(it.key); closeWheel(); }
        return;
      }
      wheel.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'smooth' });
    });
    wheel.appendChild(b);
  });
  $('wheel-overlay').hidden = false;
  requestAnimationFrame(() => {
    wheel.scrollTop = index * WHEEL_ITEM_H;
    updateWheelFocus();
  });
}

function updateWheelFocus() {
  if (!wheelState) return;
  const wheel = $('wheel');
  const idx = Math.max(0, Math.min(wheelState.items.length - 1, Math.round(wheel.scrollTop / WHEEL_ITEM_H)));
  wheelState.index = idx;
  [...wheel.children].forEach((el, i) => {
    el.classList.toggle('current', i === idx);
    el.classList.toggle('near', Math.abs(i - idx) === 1);
  });
}

function closeWheel() {
  $('wheel-overlay').hidden = true;
  wheelState = null;
}
