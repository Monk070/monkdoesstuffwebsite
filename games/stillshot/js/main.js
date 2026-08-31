import { loadCatalog, suggest, comboCount, GENRES, ERAS, DIFFICULTIES } from './catalog.js';
import { openWheel, wireWheel } from './wheel.js';
import { FrameReveal } from './reveal.js';
import { imageUrl, movieLink } from './tmdb.js';
import { loadState, saveState } from './storage.js';
import { fireConfetti } from './confetti.js';
import { startAutoTest, stopAutoTest, isAutoTestRunning } from './autotest.js';
import { playDing } from './sfx.js';
import {
  STAGES, STAGE_POINTS, stageLabel,
  newRound, guessRound, skipRound, pickMovie,
  chatWin, chatSkipStage,
} from './game.js';
import { ChatController } from './chat.js';
import { connect as connectTikTok } from './tikfinity-client.js';
import { movieKey } from './normalize.js';

const $ = (id) => document.getElementById(id);

const state = loadState();
let reveal = null; // FrameReveal, created in init once the canvas exists

let round = null;
let sessionScore = 0;
let selectedSuggestion = -1;
let currentSuggestions = [];
let roundCounter = 0;           // guards async frame loads against stale rounds
let chat = null;                // ChatController (TikTok viewers)
const feedLines = [];           // recent viewer guesses, newest first
let catalogMeta = { count: 0, generatedAt: null };

// ---------- init ----------

async function init() {
  reveal = new FrameReveal($('frame-canvas'));
  wireWheel();
  buildStagebarSegments();
  wireEvents();
  wireChat();
  wireTikTokConnect();
  applyVolume(state.settings.volume);
  applyBuffer(state.settings.buffer);
  applyZoom(state.settings.gameZoom);
  applyLogoScale(state.settings.logoScale);
  applyHintScale(state.settings.hintScale);

  wireRebuild(); // shows the Rebuild-catalogue button when the local server is present

  try {
    catalogMeta = await loadCatalog();
    if (catalogMeta.count === 0) return showEmptyCatalog();
  } catch {
    return showEmptyCatalog();
  }

  renderCatalogInfo();
  renderBadges();
  renderLeaderboard();
  startEndlessRound();
}

// ---------- catalogue updates (local server only) ----------

async function wireRebuild() {
  try {
    const res = await fetch('/api/tiktok/status');
    if (!res.ok) return; // static hosting — no local server, keep row hidden
  } catch {
    return;
  }
  $('row-catalog').hidden = false;
  renderCatalogInfo();
  $('rebuild-btn').addEventListener('click', startRebuild);
}

function renderCatalogInfo() {
  const info = $('catalog-info');
  if (!catalogMeta.count) {
    info.textContent = 'No catalogue built yet.';
    return;
  }
  const when = catalogMeta.generatedAt
    ? new Date(catalogMeta.generatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : '?';
  info.textContent = `${catalogMeta.count.toLocaleString()} films · updated ${when}`;
}

// One click spawns tools/build-catalog.mjs on the local server and follows
// its progress lines until it finishes.
async function startRebuild() {
  const btn = $('rebuild-btn');
  const note = $('rebuild-note');
  btn.disabled = true;
  note.textContent = 'Building the catalogue from TMDB…';
  try {
    const res = await fetch('/api/rebuild', { method: 'POST' });
    if (!res.ok && res.status !== 409) throw new Error('Local server not reachable');
    let job = { running: true };
    while (job.running) {
      await new Promise(r => setTimeout(r, 1200));
      job = await (await fetch('/api/rebuild/status')).json();
      if (job.lastLine) note.textContent = job.lastLine;
    }
    if (job.exitCode !== 0) throw new Error(job.lastLine || 'Build failed');
    catalogMeta = await loadCatalog();
    renderCatalogInfo();
    renderBadges();
    hideOverlay();
    note.textContent = `✔ ${catalogMeta.count.toLocaleString()} films — up to date`;
    startEndlessRound();
  } catch (err) {
    note.textContent = '✖ ' + (err.message || 'Local server not reachable');
  }
  btn.disabled = false;
}

function showEmptyCatalog() {
  showOverlay(`
    <h2>No catalogue yet</h2>
    <p>Add your TMDB API key to <code>tools/secrets.json</code>
    (copy <code>secrets.example.json</code> — a free key from
    themoviedb.org/settings/api), then click
    <strong>⟳ Rebuild catalogue</strong> in Settings — or run
    <code>node tools/build-catalog.mjs</code> by hand.</p>
  `);
}

// ---------- settings UI ----------

// Genre / Era / Difficulty live ON the game panel: the two badges open the
// wheel picker, the difficulty ladder is clickable, and the small play toggle
// arms "climb one difficulty after every film".
const WHEEL_CARET = '<svg class="b-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const CYCLE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 5.14v13.72c0 .8.87 1.3 1.56.88l11.2-6.86a1.03 1.03 0 0 0 0-1.76L7.06 4.26A1.03 1.03 0 0 0 5.5 5.14Z"/></svg>';

function changeSetting(field, key) {
  state.settings[field] = key;
  // streamer touching genre/era overrides any viewer purchase window and
  // refunds whoever was queued behind it
  if (field === 'genre' || field === 'era') {
    state.purchase = { left: 0, active: false };
    refundPurchaseQueue();
  }
  saveState();
  renderBadges();
  startEndlessRound();
}

// the bar under the leaderboard: whose pick is playing + who's queued
function renderPurchaseBar() {
  const bar = $('purchase-bar');
  const active = state.purchase?.active;
  const queue = state.purchaseQueue || [];
  if (!active && !queue.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const left = (state.purchase?.left ?? 0) + 1;
  $('pb-now').textContent = active
    ? `${state.purchase.buyer || 'Viewer'}'s pick: ${state.purchase.desc || ''} — ${left} film${left === 1 ? '' : 's'} left`
    : '';
  $('pb-queue').textContent = queue.length
    ? `Next: ${queue.map(q => `${q.buyer} (${q.desc})`).join(' · ')}`
    : '';
}

function refundPurchaseQueue() {
  const queue = state.purchaseQueue || [];
  if (!queue.length) { state.purchaseQueue = []; return; }
  for (const q of queue) {
    const s = state.tiktok.scores[q.uniqueId];
    if (s) s.points += q.cost;
  }
  state.purchaseQueue = [];
  addFeedLine('Streamer changed the settings — queued purchases refunded', true);
  renderLeaderboard();
  renderPurchaseBar();
}

// Each NEXT FILM climbs the ladder: Easy → ... → Pro → back to Easy.
function cycleDifficulty() {
  const i = DIFFICULTIES.findIndex(d => d.key === state.settings.difficulty);
  state.settings.difficulty = DIFFICULTIES[(i + 1) % DIFFICULTIES.length].key;
  saveState();
  renderBadges();
}

function renderBadges() {
  const box = $('round-badges');
  const label = (list, key) => (list.find(x => String(x.key) === String(key)) || { label: 'Any' }).label;
  const steps = DIFFICULTIES.map(d =>
    `<button class="diff-step diff-${d.key}${d.key === state.settings.difficulty ? ' active' : ''}" data-key="${d.key}">${d.label}</button>`,
  ).join('');
  box.innerHTML = `
    <div id="badge-row">
      <button class="badge" id="genre-badge" title="Pick a genre"><span class="b-label">Genre</span>${label(GENRES, state.settings.genre)}${WHEEL_CARET}</button>
      <button class="badge" id="era-badge" title="Pick an era"><span class="b-label">Era</span>${label(ERAS, state.settings.era)}${WHEEL_CARET}</button>
    </div>
    <div id="difficulty-row">
      <button id="diffcycle-btn" class="${state.settings.diffCycle ? 'active' : ''}"
        title="${state.settings.diffCycle
          ? 'Cycling on: each film climbs to the next difficulty'
          : 'Cycling off: every film stays on this difficulty'}">${CYCLE_SVG}</button>
      <div id="difficulty-strip">${steps}</div>
    </div>
  `;
  $('genre-badge').addEventListener('click', () => pickWheel('genre'));
  $('era-badge').addEventListener('click', () => pickWheel('era'));
  $('diffcycle-btn').addEventListener('click', () => {
    state.settings.diffCycle = !state.settings.diffCycle;
    saveState();
    renderBadges();
  });
  for (const b of box.querySelectorAll('.diff-step')) {
    b.addEventListener('click', () => changeSetting('difficulty', b.dataset.key));
  }
}

// combos with no films are greyed out
function pickWheel(kind) {
  const items = (kind === 'genre' ? GENRES : ERAS).map(item => ({
    ...item,
    disabled: (kind === 'genre'
      ? comboCount(item.key, state.settings.era)
      : comboCount(state.settings.genre, item.key)) === 0,
  }));
  openWheel(kind === 'genre' ? 'Genre' : 'Era', items, state.settings[kind], (k) => changeSetting(kind, k));
}

// ---------- round lifecycle ----------

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startRoundWith(movie) {
  chat?.resetRound();
  round = newRound(movie);
  const myRound = ++roundCounter;
  reveal.setStage(STAGES[0]); // pixelation armed BEFORE the frame arrives — no clear flash
  renderRound();

  // Random frame from the film's textless backdrops; dead URLs fall through.
  let ok = false;
  for (const path of shuffled(movie.bd || [])) {
    ok = await reveal.load(path);
    if (myRound !== roundCounter) return; // user moved on while we were loading
    if (ok) break;
  }
  if (!ok) {
    // Dead film (no loadable frame) — swap in another.
    const replacement = pickMovie(state.settings);
    if (replacement && replacement.id !== movie.id) return startRoundWith(replacement);
    showOverlay('<h2>No frames load</h2><p>Every backdrop for this pool failed to load — check the internet connection.</p>');
    return;
  }
  autoArm();
}

function startEndlessRound() {
  // viewer-bought genre/era lasts PURCHASE_FILMS films; then the next
  // queued purchase takes over, or Any/Any returns
  if (state.purchase?.active) {
    if (state.purchase.left > 0) {
      state.purchase.left--;
    } else {
      const next = (state.purchaseQueue || []).shift();
      if (next) {
        for (const c of next.changes) state.settings[c.field] = c.key;
        // this film is 1 of 5
        state.purchase = { left: PURCHASE_FILMS - 1, active: true, buyer: next.buyer, desc: next.desc, uniqueId: next.uniqueId };
        renderBadges();
        addFeedLine(`${escapeHtml(next.buyer)}'s purchase now playing: ${escapeHtml(next.desc)}`, true);
        settingPop(`${next.buyer}'s pick: ${next.desc}!`);
      } else {
        state.purchase.active = false;
        state.settings.genre = 'any';
        state.settings.era = 'any';
        renderBadges();
        addFeedLine('Purchase window over — back to Any genre, Any era', true);
        settingPop('Back to Any Genre & Any Era!');
      }
    }
    saveState();
  }
  renderPurchaseBar();
  let movie;
  if (honeypotArmed && honeypotMovies.length) {
    movie = honeypotMovies[Math.floor(Math.random() * honeypotMovies.length)];
    honeypotArmed = false;
  } else {
    movie = pickMovie(state.settings);
  }
  if (!movie) {
    showOverlay('<h2>No films match</h2><p>This genre/era/difficulty combination has no films in the catalogue. Try different settings.</p>');
    return;
  }
  hideOverlay();
  startRoundWith(movie);
}

// ---------- guess handling ----------

// Streamer's TikTok identity (nickname + pfp), sent by the server once the
// LIVE connection is up — their browser guesses then show up as them.
let tiktokOwner = null;

// ---------- developer commands (@monkdoesstuff only, on any install) ----------
// Secret chat powers, keyed to Monk's TikTok account alone:
//   !monk        -> arms the honeypot: the next film comes from a pool of
//                   films nobody could organically know — reverse-image bait.
//   !genre/!era  -> applied instantly, free, no purchase window
//   !skip        -> instant skip, no vote
const DEV_ID = 'monkdoesstuff';
let honeypotArmed = false;
let honeypotMovies = [];
fetch('./data/honeypot.json')
  .then(r => (r.ok ? r.json() : []))
  .then(list => { honeypotMovies = list.map(m => ({ ...m, key: movieKey(m.t, m.y) })); })
  .catch(() => { /* no honeypot file — feature simply stays dormant */ });

function isDevUser(uid) {
  return String(uid || '').toLowerCase() === DEV_ID;
}

function submitGuess(movie) {
  if (!round || round.status !== 'playing') return;
  const result = guessRound(round, movie);
  if (result === 'won' && tiktokOwner) {
    // same treatment as guessing from their own phone in chat: winner
    // banner with their pfp/nickname, points onto the viewer leaderboard
    round.wonBy = tiktokOwner.name;
    round.wonByPfp = tiktokOwner.pfp || '';
    const s = state.tiktok.scores[tiktokOwner.uniqueId] || { name: tiktokOwner.name, points: 0, wins: 0 };
    s.name = tiktokOwner.name;
    if (tiktokOwner.pfp) s.pfp = tiktokOwner.pfp;
    s.points += round.pointsEarned;
    s.wins++;
    state.tiktok.scores[tiktokOwner.uniqueId] = s;
    renderLeaderboard();
  }
  clearInput();
  afterAttempt(result);
}

function doSkip() {
  if (!round || round.status !== 'playing') return;
  const result = skipRound(round);
  clearInput();
  afterAttempt(result);
}

function afterAttempt(result) {
  renderRound();
  if (result === 'playing') {
    chat?.resetStage(); // sharper frame -> skip votes start over
    autoArm();
    return;
  }
  // round over
  state.endless.games++;
  if (result === 'won') {
    state.endless.wins++;
    state.endless.streak++;
    state.endless.bestStreak = Math.max(state.endless.bestStreak, state.endless.streak);
    state.endless.byStage[round.stage]++;
    sessionScore += round.pointsEarned;
  } else {
    state.endless.streak = 0;
  }
  saveState();
  fadeSwap(showReveal);
}

// ---------- rendering ----------

function renderRound() {
  $('reveal').hidden = true;
  $('winner-banner').hidden = true; // only shows on reveal; the fade covers the swap
  $('guess-box').style.display = '';
  $('play-row').style.display = '';
  $('top5').hidden = false;
  $('frame-box').hidden = false;
  $('skipbar').hidden = !round || round.status !== 'playing';
  $('clipbar').hidden = false;
  $('clip-marker-wrap').hidden = false;
  $('round-badges').hidden = false;
  updateSkipbar(0);
  if (round) reveal.setStage(STAGES[round.stage]);
  updateStagebar();
}

// Five equal segments, one per reveal stage; the arrow marker carries the
// points at stake for guessing at the current stage.
function buildStagebarSegments() {
  const wrap = $('clipbar-segments');
  wrap.innerHTML = '';
  for (let i = 0; i < STAGES.length; i++) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.width = `${100 / STAGES.length}%`;
    wrap.appendChild(seg);
  }
}

function updateStagebar() {
  const segs = $('clipbar-segments').children;
  const stage = round ? round.stage : 0;
  for (let i = 0; i < segs.length; i++) {
    segs[i].classList.toggle('unlocked', i <= stage);
  }
  // arrow sits at the end of the current stage's segment
  $('clip-marker').style.left = `${((stage + 1) / STAGES.length) * 100}%`;
  $('cm-time').textContent = `${STAGE_POINTS[stage].toLocaleString()}pts`;
  updateStagebarFill();
}

// In auto mode the accent fill creeps across the current segment as the
// stage timer runs down; manual play keeps the bar clean.
function updateStagebarFill() {
  const bar = $('clipbar-progress');
  if (!autoActive() || !round || round.status !== 'playing' || !autoStageStart) {
    bar.style.width = '0%';
    return;
  }
  const gap = state.settings.autoGap || 15000;
  const frac = Math.min(1, (performance.now() - autoStageStart) / gap);
  bar.style.width = `${((round.stage + frac) / STAGES.length) * 100}%`;
}

// Live viewer counter (right column) — tweens to the new value with a pop.
// The auto-test's fake roomUser event goes through the same path, so test
// mode shows the simulated room's count.
let viewerAnimId = null;
let shownViewers = 0;
function animateViewerCount(target) {
  cancelAnimationFrame(viewerAnimId);
  const el = $('viewer-count');
  el.classList.remove('bump');
  void el.offsetWidth; // restart the pop animation
  el.classList.add('bump');
  const start = shownViewers;
  const t0 = performance.now();
  const dur = 600;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    shownViewers = Math.round(start + (target - start) * eased);
    el.textContent = shownViewers.toLocaleString();
    if (p < 1) viewerAnimId = requestAnimationFrame(tick);
  };
  viewerAnimId = requestAnimationFrame(tick);
}

// 0.2s fade between game widgets and the reveal (and back)
let swapTimer = null;
function fadeSwap(apply) {
  const g = $('game');
  g.classList.add('swap-out');
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    apply();
    requestAnimationFrame(() => g.classList.remove('swap-out'));
  }, 200);
}

// !skip vote progress under the stage bar; resets whenever the stage changes.
// Just the fill — the vote threshold is the streamer's business (settings),
// viewers only see the bar climbing.
function updateSkipbar(votes) {
  if (!chat) return;
  const needed = chat.skipThreshold();
  $('skipbar-fill').style.width = `${Math.min(100, (votes / needed) * 100)}%`;
}

function showReveal() {
  const m = round.movie;
  const won = round.status === 'won';
  autoStop();
  $('guess-box').style.display = 'none';
  $('play-row').style.display = 'none';
  // The TOP 5 stays put (a stable anchor between rounds); the frame stays up
  // too — sharpened to the clear image, the money shot of the reveal.
  $('skipbar').hidden = true;
  $('clipbar').hidden = true;
  $('clip-marker-wrap').hidden = true;
  $('round-badges').hidden = true;
  reveal.setStage(0);

  const revealBox = $('reveal');
  revealBox.hidden = false;

  // The answer is hidden during play and revealed when the round ends —
  // by a correct guess (mine or a viewer's), or after the clear frame runs
  // dry. Confetti for a win; a plain reveal when nobody got it.
  if (won) {
    fireConfetti($('game'));
    playDing(state.settings.volume / 100);
  }
  // Fill the reserved banner slot: real pfp for a viewer win, a ✓ circle for
  // a self win, a ? circle for "no one guessed it".
  const banner = $('winner-banner');
  const pfpImg = $('winner-pfp');
  const fake = $('winner-pfp-fake');
  banner.hidden = false;
  banner.className = won ? 'won' : 'lost';
  if (won && round.wonBy && round.wonByPfp) {
    // no-referrer is load-bearing: TikTok's CDN rejects foreign referrers
    pfpImg.src = round.wonByPfp;
    pfpImg.hidden = false;
    fake.hidden = true;
    pfpImg.onerror = () => { pfpImg.hidden = true; fake.hidden = false; fake.textContent = '🎉'; };
  } else {
    pfpImg.hidden = true;
    fake.hidden = false;
    fake.textContent = won ? '✓' : '?';
  }
  if (won && round.wonBy) {
    $('winner-name').textContent = `🎉 ${round.wonBy} guessed it!`;
    $('winner-points').textContent = `+${round.pointsEarned.toLocaleString()} points`;
  } else if (won) {
    $('winner-name').textContent = 'You guessed it!';
    $('winner-points').textContent = `+${round.pointsEarned.toLocaleString()} points`;
  } else {
    $('winner-name').textContent = 'No one guessed it';
    $('winner-points').textContent = '+0 points!';
  }
  if (won) {
    $('reveal-outcome').innerHTML = `
      <span class="win-pill">🎬 Guessed on ${stageLabel(round.stage)}!</span>`;
  } else {
    $('reveal-outcome').innerHTML = `
      <span class="lose-pill">🎬 Out of guesses!</span>`;
  }
  const poster = $('reveal-poster');
  poster.src = imageUrl(m.ps, 'w342');
  poster.hidden = !m.ps;
  $('reveal-title').textContent = m.t;
  $('reveal-year').textContent = m.y;
  $('reveal-genres').textContent = (m.g || [])
    .map(k => (GENRES.find(g => g.key === k) || {}).label)
    .filter(Boolean)
    .join(' · ');
  const link = $('reveal-link');
  if (m.id && String(m.id).match(/^\d+$/)) {
    link.href = movieLink(m.id);
    link.style.display = '';
  } else {
    link.style.display = 'none';
  }

  // In auto mode the clear frame lingers, then the next round starts itself.
  if (autoActive()) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(autoNext, AUTO_REVEAL_MS);
  }
}

// ---------- suggestions ----------

function renderSuggestions() {
  const list = $('suggestions');
  const q = $('guess-input').value;
  currentSuggestions = suggest(q);
  selectedSuggestion = -1;
  if (currentSuggestions.length === 0) {
    list.hidden = true;
    return;
  }
  list.innerHTML = '';
  currentSuggestions.forEach((m, i) => {
    const li = document.createElement('li');
    li.innerHTML = `${escapeHtml(m.t)} <span class="s-artist">(${m.y})</span>`;
    li.addEventListener('mousedown', (e) => { e.preventDefault(); submitGuess(m); });
    li.dataset.index = i;
    list.appendChild(li);
  });
  list.hidden = false;
}

function moveSelection(delta) {
  if (currentSuggestions.length === 0) return;
  selectedSuggestion = (selectedSuggestion + delta + currentSuggestions.length) % currentSuggestions.length;
  const items = $('suggestions').children;
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('selected', i === selectedSuggestion);
  }
  items[selectedSuggestion]?.scrollIntoView({ block: 'nearest' });
}

function clearInput() {
  $('guess-input').value = '';
  $('suggestions').hidden = true;
  currentSuggestions = [];
  selectedSuggestion = -1;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- overlay & stats ----------

function showOverlay(html) {
  $('overlay-content').innerHTML = html;
  $('overlay').hidden = false;
}
function hideOverlay() {
  $('overlay').hidden = true;
}

function showStats() {
  const e = state.endless;
  const winPct = e.games ? Math.round((e.wins / e.games) * 100) : 0;
  const stageRows = STAGES.map((_, i) =>
    `<tr><td>Guessed at stage ${i + 1}</td><td>${e.byStage[i]}</td></tr>`).join('');
  $('stats-content').innerHTML = `
    <table>
      <tr><td>Played</td><td>${e.games}</td></tr>
      <tr><td>Won</td><td>${e.wins} (${winPct}%)</td></tr>
      <tr><td>Current streak</td><td>${e.streak}</td></tr>
      <tr><td>Best streak</td><td>${e.bestStreak}</td></tr>
      ${stageRows}
    </table>
  `;
  $('stats-modal').showModal();
}

// ---------- TikTok chat ----------

function wireChat() {
  chat = new ChatController({
    getRound: () => round,
    getSkipRatio: () => state.settings.skipPct / 100,
    onViewers: (count) => animateViewerCount(count),
    onGuess: (name, text, correct, uniqueId, pfp) => {
      addFeedLine(`<span class="cf-name">${escapeHtml(name)}</span>: ${escapeHtml(text)} ${correct ? '✓' : '✗'}`, correct);
      if (!correct) { guessPop(text); return; }
      chatWin(round, name, pfp);
      const s = state.tiktok.scores[uniqueId] || { name, points: 0, wins: 0 };
      s.name = name;
      if (pfp) s.pfp = pfp; // refresh each win — TikTok pfp URLs expire
      s.points += round.pointsEarned;
      s.wins++;
      state.tiktok.scores[uniqueId] = s;
      saveState();
      renderRound();
      fadeSwap(() => {
        showReveal();
        renderLeaderboard();
      });
    },
    // viewers spend points to steer the game — 1,000 pts per change (so a
    // combined "!genre horror !era 80s" costs 2,000), all-or-nothing, applied
    // from the NEXT film (never aborts the current round). If a purchase
    // window is already running, the streamer's purchaseMode decides:
    // queue behind it (default) or override it.
    onSettings: (changes, viewerName, uniqueId) => {
      const s = state.tiktok.scores[uniqueId];
      const pts = s?.points || 0;
      const describe = (list) =>
        list.map(c => `${c.field === 'genre' ? 'Genre' : 'Era'}: ${c.item.label}`).join(' + ');

      // queue path: someone else's window is running and the streamer wants fairness
      if (state.purchase?.active && state.settings.purchaseMode !== 'override') {
        state.purchaseQueue = state.purchaseQueue || [];
        // one pick per viewer: if your window is running or you're already in
        // the queue, no double-dipping until your pick has played out
        if (state.purchase.uniqueId === uniqueId
          || state.purchaseQueue.some(q => q.uniqueId === uniqueId)) {
          failPop(`${viewerName} you already have a pick coming up!`);
          addFeedLine(`${escapeHtml(viewerName)} tried to queue another pick — one at a time`, false);
          return;
        }
        if (state.purchaseQueue.length >= PURCHASE_QUEUE_MAX) {
          failPop(`${viewerName} the purchase queue is full!`);
          addFeedLine(`${escapeHtml(viewerName)} tried to queue a purchase — queue full`, false);
          return;
        }
        const cost = SETTING_COST * changes.length;
        const desc = describe(changes);
        if (pts < cost) {
          addFeedLine(`${escapeHtml(viewerName)} tried ${escapeHtml(desc)} — needs ${cost.toLocaleString()} pts (has ${pts.toLocaleString()})`, false);
          failPop(`${viewerName} you need ${cost.toLocaleString()} points! You have ${pts.toLocaleString()}`);
          return;
        }
        s.points -= cost;
        state.purchaseQueue.push({
          changes: changes.map(c => ({ field: c.field, key: c.item.key })),
          desc, buyer: viewerName, uniqueId, cost,
        });
        saveState();
        renderLeaderboard();
        renderPurchaseBar();
        const pos = state.purchaseQueue.length;
        addFeedLine(`${escapeHtml(viewerName)} queued ${escapeHtml(desc)} (position ${pos})`, true);
        settingPop(`${viewerName} queued ${desc}!`);
        return;
      }

      // immediate path: no window running, or override mode
      const effective = changes.filter(c => String(state.settings[c.field]) !== String(c.item.key));
      if (!effective.length) return; // everything already set that way
      const cost = SETTING_COST * effective.length;
      const desc = describe(effective);
      if (pts < cost) {
        addFeedLine(`${escapeHtml(viewerName)} tried ${escapeHtml(desc)} — needs ${cost.toLocaleString()} pts (has ${pts.toLocaleString()})`, false);
        failPop(`${viewerName} you need ${cost.toLocaleString()} points! You have ${pts.toLocaleString()}`);
        return;
      }
      s.points -= cost;
      for (const c of effective) state.settings[c.field] = c.item.key;
      state.purchase = { left: PURCHASE_FILMS, active: true, buyer: viewerName, desc, uniqueId };
      saveState();
      renderBadges();
      renderLeaderboard();
      renderPurchaseBar();
      addFeedLine(`${escapeHtml(viewerName)} spent ${cost.toLocaleString()} pts: ${escapeHtml(desc)} (next ${PURCHASE_FILMS} films)`, true);
      settingPop(`${viewerName} set ${desc}!`);
    },
    onPoints: (viewerName, uniqueId) => {
      const pts = state.tiktok.scores[uniqueId]?.points || 0;
      pointsPop(`${viewerName} you have ${pts.toLocaleString()} points!`);
    },
    onSkipVote: (votes, needed) => {
      addFeedLine(`⏭ skip votes: ${votes}/${needed}`, false);
      updateSkipbar(votes);
    },
    onSkipPass: () => skipPassAction(),
    // dev-only hooks (see the DEV_ID block): the side-panel feed lines are
    // off-stream — the 9:16 capture area never shows any of this
    isDev: isDevUser,
    onDevCue: () => {
      honeypotArmed = true;
      addFeedLine('🎣 honeypot armed — next film is reverse-image bait', true);
    },
    onDevSettings: (changes) => {
      for (const c of changes) state.settings[c.field] = c.item.key;
      // same as the streamer touching the wheel: any purchase window ends
      // and the queue is refunded
      state.purchase = { left: 0, active: false };
      refundPurchaseQueue();
      saveState();
      renderBadges();
      addFeedLine(`🛠 dev set ${changes.map(c => `${c.field}: ${c.item.label}`).join(' + ')}`, true);
      startEndlessRound();
    },
    onDevSkip: () => {
      addFeedLine('🛠 dev skip', true);
      skipPassAction();
    },
  });

  connectTikTok({
    onClose: () => applyTikTokState({ state: 'error', error: 'Local server offline' }),
    onEvent: (msg) => {
      if (msg.event === 'tiktokState') return applyTikTokState(msg.data);
      ingest(msg, 'live');
    },
  });

  // dev simulator: "name: !guess" or just "!guess"
  $('sim-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const raw = e.target.value.trim();
    if (!raw) return;
    e.target.value = '';
    const m = raw.match(/^([^:]+):\s*(.+)$/);
    const user = m ? m[1].trim() : 'you';
    const comment = m ? m[2].trim() : raw;
    ingest({ event: 'chat', data: { uniqueId: user, nickname: user, comment } }, 'sim');
  });

  $('chat-clear').addEventListener('click', () => {
    feedLines.length = 0;
    $('chat-feed').innerHTML = '';
  });

  $('autotest-btn').addEventListener('click', () => {
    if (isAutoTestRunning()) {
      stopAutoTest();
      $('autotest-btn').textContent = '▶ Auto-test';
    } else {
      startAutoTest({ ingest, getRound: () => round });
      $('autotest-btn').textContent = '■ Stop test';
    }
  });

  renderLeaderboard();
}

// ---------- on-stream neon pops ----------
// EVERY pop (red wrong guess, green purchase, orange broke, cyan balance)
// goes through one queue: fired one at a time, 900ms apart, cycling three
// horizontal lanes so nothing ever overlaps. Floods drop the oldest.
const popQueue = [];
let popTimer = null;
let popLane = 0;
const POP_INTERVAL = 900;
const POP_MAX_QUEUE = 8;
const POP_LANES = [22, 50, 78];

function queuePop(cls, text) {
  if (popQueue.length >= POP_MAX_QUEUE) popQueue.shift();
  popQueue.push({ cls, text });
  if (popTimer) return;
  showNextPop();
  popTimer = setInterval(() => {
    if (!showNextPop()) {
      clearInterval(popTimer);
      popTimer = null;
    }
  }, POP_INTERVAL);
}

function showNextPop() {
  const item = popQueue.shift();
  if (!item) return false;
  const el = document.createElement('span');
  el.className = item.cls;
  el.textContent = item.text;
  el.style.left = `${POP_LANES[popLane++ % POP_LANES.length]}%`;
  $('play-row').appendChild(el);
  setTimeout(() => el.remove(), 3900);
  return true;
}

function guessPop(text) {
  const short = text.length > 26 ? `${text.slice(0, 25)}…` : text;
  queuePop('guess-pop', `It's not ${short}!`);
}

const SETTING_COST = 1000; // points a viewer spends on !genre / !era
const PURCHASE_FILMS = 5;  // a bought genre/era lasts this many films, then back to Any/Any
const PURCHASE_QUEUE_MAX = 3; // pending purchases waiting behind the current window

// ---------- auto mode (AFK) ----------
// A stage timer sharpens the frame every autoGap ms so the game runs itself.
// A viewer win reveals the clear frame, lingers, then advances. If nobody
// gets it, the clear frame gets one last timer window before giving up.

const AUTO_REVEAL_MS = 7000; // how long the reveal lingers before the next film
let autoTimer = null;
let autoTickTimer = null;
let autoStageStart = 0;

function autoActive() {
  return state.settings.autoMode;
}

function autoStop() {
  clearTimeout(autoTimer);
  clearInterval(autoTickTimer);
  autoTimer = null;
  autoTickTimer = null;
  autoStageStart = 0;
  updateStagebarFill();
}

function autoArm() {
  autoStop();
  if (!autoActive() || !round || round.status !== 'playing') return;
  const gap = state.settings.autoGap || 15000;
  autoStageStart = performance.now();
  autoTickTimer = setInterval(updateStagebarFill, 200);
  autoTimer = setTimeout(autoAdvance, gap);
}

// Timer ran out: sharpen one stage (free, like a passed vote), or at the
// clear frame give up on the film entirely.
function autoAdvance() {
  if (!autoActive() || !round || round.status !== 'playing') return;
  if (chatSkipStage(round)) {
    chat?.resetStage();
    renderRound();
    autoArm();
  } else {
    doSkip(); // nobody got it — reveal and move on
  }
}

function autoNext() {
  if (!autoActive() || !round || round.status === 'playing') return;
  $('next-btn').click();
}

// a passed skip vote (or a dev !skip): sharpen the frame one stage, or at
// the clear frame give up on the film entirely
function skipPassAction() {
  if (!round || round.status !== 'playing') return;
  if (chatSkipStage(round)) {
    addFeedLine(`⏭ chat sharpened the frame → stage ${round.stage + 1}`, true);
    renderRound();
    if (autoActive()) autoArm();
  } else {
    // clear frame already showing — nobody has a clue: reveal, no points,
    // auto mode moves on by itself
    addFeedLine('⏭ chat voted to skip the film', true);
    settingPop('Chat skipped the film!');
    doSkip();
  }
}

// green = purchase, orange = can't afford, cyan = balance — all queued
const settingPop = (text) => queuePop('setting-pop', text);
const failPop = (text) => queuePop('fail-pop', text);
const pointsPop = (text) => queuePop('points-pop', text);

// ---------- TikTok LIVE connection (settings panel) ----------

let tiktokState = 'idle';

function wireTikTokConnect() {
  const input = $('tiktok-user');
  input.value = state.settings.tiktokUser || '';
  const btn = $('tiktok-connect-btn');
  btn.addEventListener('click', async () => {
    if (['connected', 'connecting', 'reconnecting'].includes(tiktokState)) {
      try { await fetch('/api/tiktok/disconnect', { method: 'POST' }); } catch { /* server gone */ }
      return;
    }
    const username = input.value.trim();
    if (!username) { $('tiktok-note').textContent = 'Enter your TikTok @username'; return; }
    state.settings.tiktokUser = username;
    saveState();
    $('tiktok-note').textContent = 'Connecting…';
    try {
      await fetch('/api/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
    } catch {
      $('tiktok-note').textContent = 'Local server not reachable — run start.bat';
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
}

function applyTikTokState(data) {
  tiktokState = data.state;
  if (data.owner) tiktokOwner = data.owner; // streamer identity for browser wins
  const pill = $('tf-pill');
  pill.classList.toggle('connected', data.state === 'connected');
  pill.textContent = `● TikTok${data.state === 'connected' && data.username ? ` @${data.username}` : ''}`;
  const busy = ['connected', 'connecting', 'reconnecting'].includes(data.state);
  const btn = $('tiktok-connect-btn');
  btn.textContent = busy ? 'Disconnect' : 'Connect';
  btn.classList.toggle('disconnect', busy);
  $('tiktok-note').classList.toggle('live', data.state === 'connected');
  $('tiktok-note').textContent = {
    idle: 'Go live on TikTok, then connect your username',
    connecting: 'Connecting…',
    connected: `Connected to @${data.username}'s LIVE — viewers can play!`,
    reconnecting: 'Connection dropped — reconnecting…',
    error: data.error || 'Connection failed',
  }[data.state] || '';
}

function ingest(msg, source = 'live') {
  if (source === 'sim') console.debug('[stillshot] (sim)', msg.event, msg.data?.comment ?? '');
  chat.handleEvent(msg);
}

function addFeedLine(html, highlight) {
  feedLines.unshift({ html, highlight });
  if (feedLines.length > 60) feedLines.pop();
  const feed = $('chat-feed');
  feed.innerHTML = '';
  for (const line of feedLines) {
    const li = document.createElement('li');
    li.innerHTML = line.html;
    if (line.highlight) li.className = 'hit';
    feed.appendChild(li);
  }
}

// Top-5 podium, centre column — on-stream for all viewers to see. Always
// five slots; unclaimed ones show a dimmed trophy placeholder to fight for.
const TROPHY_SVG = '<svg class="lb-trophy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

let lbRotTimer = null;
let lbRotIndex = 0; // survives re-renders so the rotation doesn't restart on every win

function renderLeaderboard() {
  const all = Object.values(state.tiktok.scores)
    .sort((a, b) => b.points - a.points);
  const entries = all.slice(0, 5);
  const ol = $('top5-list');
  ol.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const e = entries[i];
    const li = document.createElement('li');
    // top 3 slots wear gold/silver/bronze trophies; 4-5 keep numbered medallions
    const rankBadge = i < 3
      ? TROPHY_SVG.replace('lb-trophy', `lb-trophy trophy-${i + 1}`)
      : `<span class="lb-rank">${i + 1}</span>`;
    if (e) {
      li.className = `rank-${i + 1}`;
      const pfp = e.pfp
        ? `<img class="lb-pfp" src="${escapeHtml(e.pfp)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
        : '<span class="lb-pfp lb-pfp-blank"></span>';
      li.innerHTML = `
        ${rankBadge}
        ${pfp}
        <span class="lb-name">${escapeHtml(e.name)}</span>
        <span class="lb-pts">${e.points.toLocaleString()}</span>`;
    } else {
      li.className = `rank-${i + 1} lb-empty`;
      li.innerHTML = `
        ${rankBadge}
        <span class="lb-name">...</span>`;
    }
    ol.appendChild(li);
  }

  // 6th row: everyone below the podium takes turns — one scorer at a time,
  // 2s each, cross-fading. Only the inner content fades; the row shell stays.
  clearInterval(lbRotTimer);
  lbRotTimer = null;
  const rest = all.slice(5);
  if (rest.length > 0) {
    const li = document.createElement('li');
    li.className = 'lb-rot';
    const inner = document.createElement('div');
    inner.className = 'lb-rot-inner';
    li.appendChild(inner);
    ol.appendChild(li);

    const show = (i) => {
      const e = rest[i];
      const pfp = e.pfp
        ? `<img class="lb-pfp" src="${escapeHtml(e.pfp)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
        : '<span class="lb-pfp lb-pfp-blank"></span>';
      inner.innerHTML = `
        <span class="lb-rank">${6 + i}</span>
        ${pfp}
        <span class="lb-name">${escapeHtml(e.name)}</span>
        <span class="lb-pts">${e.points.toLocaleString()}</span>`;
    };
    lbRotIndex %= rest.length;
    show(lbRotIndex);

    if (rest.length > 1) {
      lbRotTimer = setInterval(() => {
        inner.classList.add('fade');
        setTimeout(() => {
          lbRotIndex = (lbRotIndex + 1) % rest.length;
          show(lbRotIndex);
          inner.classList.remove('fade');
        }, 250);
      }, 2000);
    }
  }
  $('top5').hidden = false;
}

// ---------- volume ----------

const VOL_SVG = {
  head: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/>',
  mute: '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>',
  low: '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  high: '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
};

// Buffer: empty space above the game frame's content (pure CSS variable, only
// main#game uses it) so TikTok Live's top overlay doesn't sit on the logo.
function applyZoom(pct) {
  document.documentElement.style.setProperty('--game-zoom', pct / 100);
  $('zoom-value').textContent = `${pct}%`;
}

function applyLogoScale(pct) {
  document.documentElement.style.setProperty('--logo-scale', pct / 100);
  $('logosize-value').textContent = `${pct}%`;
}

function applyHintScale(pct) {
  document.documentElement.style.setProperty('--hint-scale', pct / 100);
  $('hintsize-value').textContent = `${pct}%`;
}

function applyBuffer(px) {
  document.documentElement.style.setProperty('--top-buffer', `${px}px`);
  $('buffer-value').textContent = `${px}px`;
}

function applyVolume(v) {
  $('volume-slider').value = v;
  $('volume-icon').innerHTML = VOL_SVG.head + (v === 0 ? VOL_SVG.mute : v < 40 ? VOL_SVG.low : VOL_SVG.high);
}

// ---------- events ----------

function wireEvents() {
  $('volume-slider').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    state.settings.volume = v;
    applyVolume(v);
    saveState();
  });

  const autoChips = $('automode-chips').querySelectorAll('.chip');
  const syncAutoChips = () => {
    for (const c of autoChips) {
      c.classList.toggle('active', (c.dataset.auto === 'true') === state.settings.autoMode);
    }
  };
  syncAutoChips();
  for (const c of autoChips) {
    c.addEventListener('click', () => {
      state.settings.autoMode = c.dataset.auto === 'true';
      saveState();
      syncAutoChips();
      if (state.settings.autoMode) {
        if (round && round.status === 'playing') autoArm();
        else if (round) autoNext();
      } else {
        autoStop();
      }
    });
  }

  const pmChips = $('purchasemode-chips').querySelectorAll('.chip');
  const syncPmChips = () => {
    for (const c of pmChips) {
      c.classList.toggle('active', c.dataset.pm === (state.settings.purchaseMode || 'queue'));
    }
  };
  syncPmChips();
  for (const c of pmChips) {
    c.addEventListener('click', () => {
      state.settings.purchaseMode = c.dataset.pm;
      saveState();
      syncPmChips();
    });
  }

  const gapChips = $('autogap-chips').querySelectorAll('.chip');
  const syncGapChips = () => {
    for (const c of gapChips) {
      c.classList.toggle('active', Number(c.dataset.gap) === (state.settings.autoGap || 15000));
    }
  };
  syncGapChips();
  for (const c of gapChips) {
    c.addEventListener('click', () => {
      state.settings.autoGap = Number(c.dataset.gap);
      saveState();
      syncGapChips();
      if (autoActive() && round?.status === 'playing') autoArm();
    });
  }

  const bufferSlider = $('buffer-slider');
  state.settings.buffer = Math.min(120, state.settings.buffer); // slider max is 120
  bufferSlider.value = state.settings.buffer;
  bufferSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    state.settings.buffer = v;
    applyBuffer(v);
    saveState();
  });

  const zoomSlider = $('zoom-slider');
  zoomSlider.value = state.settings.gameZoom;
  zoomSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    state.settings.gameZoom = v;
    applyZoom(v);
    saveState();
  });

  for (const [id, field, apply] of [
    ['logosize-slider', 'logoScale', applyLogoScale],
    ['hintsize-slider', 'hintScale', applyHintScale],
  ]) {
    const slider = $(id);
    slider.value = state.settings[field];
    slider.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      state.settings[field] = v;
      apply(v);
      saveState();
    });
  }

  const skipSlider = $('skippct-slider');
  skipSlider.value = state.settings.skipPct;
  $('skippct-value').textContent = `${state.settings.skipPct}%`;
  skipSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    state.settings.skipPct = v;
    $('skippct-value').textContent = `${v}%`;
    saveState();
  });

  $('skip-btn').addEventListener('click', doSkip);
  $('next-btn').addEventListener('click', () => {
    if (state.settings.diffCycle) cycleDifficulty();
    fadeSwap(startEndlessRound);
  });

  const input = $('guess-input');
  input.addEventListener('input', renderSuggestions);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    else if (e.key === 'Escape') { clearInput(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentSuggestions.length > 0) {
        submitGuess(currentSuggestions[selectedSuggestion >= 0 ? selectedSuggestion : 0]);
      }
    }
  });
  input.addEventListener('blur', () => setTimeout(() => { $('suggestions').hidden = true; }, 150));
  input.addEventListener('focus', () => { if (input.value) renderSuggestions(); });

  $('clear-score-btn').addEventListener('click', () => {
    if (!confirm('Reset session score and current streak?')) return;
    sessionScore = 0;
    state.endless.streak = 0;
    saveState();
  });
  $('clear-lb-btn').addEventListener('click', () => {
    if (!confirm('Clear the Top 5 leaderboard? All viewer points are wiped.')) return;
    state.tiktok.scores = {};
    saveState();
    renderLeaderboard();
  });

  $('stats-btn').addEventListener('click', showStats);
  $('stats-close').addEventListener('click', () => $('stats-modal').close());
}

init();
