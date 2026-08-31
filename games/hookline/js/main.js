import { loadCatalog, suggest, comboCount, GENRES, ERAS, DIFFICULTIES } from './catalog.js';
import { openWheel, wireWheel } from './wheel.js';
import { ClipPlayer } from './audio.js';
import { freshPreview } from './deezer.js';
import { loadState, saveState } from './storage.js';
import { fireConfetti } from './confetti.js';
import { startAutoTest, stopAutoTest, isAutoTestRunning } from './autotest.js';
import { playDing, playTick } from './sfx.js';
import {
  STAGE_DEFS, MAX_CLIP, activeStages,
  newRound, guessRound, skipRound, pickTrack,
  chatWin, chatSkipStage,
} from './game.js';
import { ChatController } from './chat.js';
import { connect as connectTikFinity } from './tikfinity-client.js';
import { trackKey } from './normalize.js';

const $ = (id) => document.getElementById(id);

const state = loadState();
const player = new ClipPlayer();

let round = null;
let sessionScore = 0;
let selectedSuggestion = -1;
let currentSuggestions = [];
let roundCounter = 0;           // guards async preview loads against stale rounds
let chat = null;                // ChatController (TikTok viewers)
const feedLines = [];           // recent viewer guesses, newest first
let catalogMeta = { count: 0, generatedAt: null };

// ---------- init ----------

async function init() {
  wireWheel();
  migrateStageStats();
  wireEvents();
  wireChat();
  wireTikTokConnect();
  applyVolume(state.settings.volume);
  applyBuffer(state.settings.buffer);
  applyZoom(state.settings.gameZoom);
  applyLogoScale(state.settings.logoScale);
  applyHintScale(state.settings.hintScale);
  applySpinScale(state.settings.spinScale);
  applySpinPos(state.settings.spinPos);

  wireRebuild(); // shows the Update-catalogue button when the local server is present

  try {
    catalogMeta = await loadCatalog();
    if (catalogMeta.count === 0) return showEmptyCatalog();
  } catch {
    return showEmptyCatalog();
  }

  renderCatalogInfo();
  renderBadges();
  renderLeaderboard();
  scheduleLbRotation();
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
  info.textContent = `${catalogMeta.count.toLocaleString()} tracks · updated ${when}`;
}

// One click pulls the latest catalogue from hookline.fun via the local
// server — no Spotify credentials needed on the streamer's machine.
async function startRebuild() {
  const btn = $('rebuild-btn');
  const note = $('rebuild-note');
  btn.disabled = true;
  note.textContent = 'Downloading the latest catalogue…';
  try {
    const res = await fetch('/api/catalog/update', { method: 'POST' });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Update failed');
    catalogMeta = await loadCatalog();
    renderCatalogInfo();
    renderBadges();
    hideOverlay();
    note.textContent = `✔ ${out.count.toLocaleString()} tracks — up to date`;
    startEndlessRound();
  } catch (err) {
    note.textContent = '✖ ' + (err.message || 'Local server not reachable');
  }
  btn.disabled = false;
}

function showEmptyCatalog() {
  showOverlay(`
    <h2>No catalogue yet</h2>
    <p>Add your Spotify API credentials to <code>tools/secrets.json</code>
    (copy <code>secrets.example.json</code>), then click
    <strong>⟳ Update catalogue</strong> in Settings — or run
    <code>node tools/build-catalog.mjs</code> by hand.</p>
  `);
}

// ---------- settings UI ----------

// Genre / Era / Difficulty live ON the game panel (same as hookline.fun):
// the two badges open the wheel picker, the difficulty ladder is clickable,
// and the small play toggle arms "climb one difficulty after every song".
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
    ? `${state.purchase.buyer || 'Viewer'}'s pick: ${state.purchase.desc || ''} — ${left} song${left === 1 ? '' : 's'} left`
    : '';
  $('pb-queue').textContent = queue.length
    ? `Next: ${queue.map(q => `${q.buyer} (${q.desc})`).join(' · ')}`
    : '';
}

function refundPurchaseQueue() {
  const queue = state.purchaseQueue || [];
  if (!queue.length) { state.purchaseQueue = []; return; }
  for (const q of queue) {
    // refunds land in the bank: points were pulled bank-first, and banked
    // points are the safer place to hand money back (still spendable first)
    creditBank(q.uniqueId, q.buyer, '', q.cost);
  }
  state.purchaseQueue = [];
  addFeedLine('Streamer changed the settings — queued purchases refunded', true);
  renderLeaderboard();
  renderPurchaseBar();
}

// ---------- viewer wallet: banked (gift) points spend before leaderboard points ----------

// likes not yet worth a whole banked point, per viewer (session-scoped)
const likeTally = new Map();

function viewerFunds(uniqueId) {
  return {
    bank: state.tiktok.bank[uniqueId]?.points || 0,
    lb: state.tiktok.scores[uniqueId]?.points || 0,
  };
}

function creditBank(uniqueId, name, pfp, amount) {
  const b = state.tiktok.bank[uniqueId] || { name, points: 0 };
  b.name = name || b.name;
  if (pfp) b.pfp = pfp;
  b.points += amount;
  state.tiktok.bank[uniqueId] = b;
}

// Caller must have checked affordability against bank + leaderboard combined.
function spendPoints(uniqueId, cost) {
  let remaining = cost;
  const b = state.tiktok.bank[uniqueId];
  if (b && remaining > 0) {
    const take = Math.min(b.points, remaining);
    b.points -= take;
    remaining -= take;
  }
  const s = state.tiktok.scores[uniqueId];
  if (s && remaining > 0) {
    s.points -= remaining;
    remaining = 0;
  }
}

// Free picks won on the wheel: one !genre / !era purchase costs nothing.
function takeCredit(uniqueId, field) {
  const c = state.tiktok.credits[uniqueId];
  if (!c || !(c[field] > 0)) return false;
  c[field]--;
  return true;
}

// Each NEXT SONG climbs the ladder: Easy → ... → Pro → back to Easy.
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
          ? 'Cycling on: each song climbs to the next difficulty'
          : 'Cycling off: every song stays on this difficulty'}">${CYCLE_SVG}</button>
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

// same wheel as hookline.fun; combos with no tracks are greyed out
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

async function startRoundWith(track, rng = Math.random) {
  chat?.resetRound();
  // previews always play from the start; clip lengths come from the toggles
  round = newRound(track, 'start', rng, activeStages(state.settings.stageToggles));
  const myRound = ++roundCounter;
  buildClipbarSegments();
  renderRound();
  $('play-btn').disabled = true;
  $('play-btn').title = 'Loading…';

  // Fresh preview via JSONP (baked URLs expire); fall back to the baked one.
  let url = await freshPreview(track.id);
  if (myRound !== roundCounter) return; // user moved on while we were fetching
  if (!url) url = track.pv || null;
  if (!url) {
    // Dead track (no preview at all any more) — swap in another.
    round.guesses = [];
    const replacement = pickTrack(state.settings);
    if (replacement && replacement.id !== track.id) return startRoundWith(replacement, rng);
    $('play-btn').title = 'No preview available';
    return;
  }
  player.load(url);
  $('play-btn').disabled = false;
  updatePlayButton();
  autoFinalPlays = 0;
  if (autoActive()) autoPlayClip();
}

function startEndlessRound() {
  player.stop();
  // viewer-bought genre/era lasts PURCHASE_SONGS songs; then the next
  // queued purchase takes over, or Any/Any returns
  if (state.purchase?.active) {
    if (state.purchase.left > 0) {
      state.purchase.left--;
    } else {
      const next = (state.purchaseQueue || []).shift();
      if (next) {
        for (const c of next.changes) state.settings[c.field] = c.key;
        // this song is 1 of 5
        state.purchase = { left: PURCHASE_SONGS - 1, active: true, buyer: next.buyer, desc: next.desc, uniqueId: next.uniqueId };
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
  let track;
  if (honeypotArmed && honeypotTracks.length) {
    track = honeypotTracks[Math.floor(Math.random() * honeypotTracks.length)];
    honeypotArmed = false;
  } else {
    track = pickTrack(state.settings);
  }
  if (!track) {
    showOverlay('<h2>No tracks match</h2><p>This genre/era/difficulty combination has no tracks in the catalogue. Try different settings.</p>');
    return;
  }
  hideOverlay();
  startRoundWith(track);
}

// ---------- guess handling ----------

// Streamer's TikTok identity (nickname + pfp), sent by the server once the
// LIVE connection is up — their browser guesses then show up as them.
let tiktokOwner = null;

// ---------- developer commands (@monkdoesstuff only, on any install) ----------
// Secret chat powers, keyed to Monk's TikTok account alone:
//   !monk        -> arms the honeypot: the next song comes from a pool of
//                   tracks nobody could organically know — Shazam bait.
//   !gamedev     -> "MONK IS HERE!" fanfare overlay + LovDev — The Game Dev
//   !genre/!era  -> applied instantly, free, no purchase window
//   !skip        -> instant skip, no vote
const DEV_ID = 'monkdoesstuff';
let honeypotArmed = false;
let honeypotTracks = [];
fetch('./data/honeypot.json')
  .then(r => (r.ok ? r.json() : []))
  .then(list => { honeypotTracks = list.map(t => ({ ...t, key: trackKey(t.t, t.a) })); })
  .catch(() => { /* no honeypot file — feature simply stays dormant */ });

function isDevUser(uid) {
  return String(uid || '').toLowerCase() === DEV_ID;
}

function submitGuess(track) {
  if (!round || round.status !== 'playing') return;
  player.stop();
  const result = guessRound(round, track);
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
  player.stop();
  const result = skipRound(round);
  clearInput();
  afterAttempt(result);
}

function afterAttempt(result) {
  renderRound();
  if (result === 'playing') {
    chat?.resetStage(); // new clip length -> skip votes start over
    updatePlayButton();
    autoFinalPlays = 0;
    if (autoActive()) autoPlayClip();
    return;
  }
  // round over
  state.endless.games++;
  if (result === 'won') {
    state.endless.wins++;
    state.endless.streak++;
    state.endless.bestStreak = Math.max(state.endless.bestStreak, state.endless.streak);
    const sec = String(round.stages[round.stage].s);
    state.endless.byStageSec[sec] = (state.endless.byStageSec[sec] || 0) + 1;
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
  $('skipbar').hidden = !round || round.status !== 'playing';
  $('clipbar').hidden = false;
  $('clip-marker-wrap').hidden = false;
  $('round-badges').hidden = false;
  updateSkipbar(0);
  setPlayBtnPlaying(false);
  updateClipbar(0);
}

// Segments proportional to real time (dividers at each enabled stage);
// a single arrow marker points at the END of the current stage's segment.
// Rebuilt per round — the streamer can retoggle stages between songs.
function buildClipbarSegments() {
  const wrap = $('clipbar-segments');
  wrap.innerHTML = '';
  if (!round) return;
  let prev = 0;
  for (const st of round.stages) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.width = `${((st.s - prev) / round.maxClip) * 100}%`;
    wrap.appendChild(seg);
    prev = st.s;
  }
}

function updateClipbar(elapsed) {
  if (!round) return;
  const segs = $('clipbar-segments').children;
  const stage = round.stage;
  for (let i = 0; i < segs.length; i++) {
    segs[i].classList.toggle('unlocked', i <= stage);
  }
  $('clipbar-progress').style.width = `${Math.min(100, (elapsed / round.maxClip) * 100)}%`;
  // arrow sits exactly on the divider at the end of the unlocked window
  $('clip-marker').style.left = `${(round.stages[stage].s / round.maxClip) * 100}%`;
  $('cm-time').textContent = `${round.stages[stage].s}s`;
}

function setPlayBtnPlaying(isPlaying) {
  $('play-btn').classList.toggle('playing', isPlaying);
}

// Live viewer counter (right column) — tweens to the new value with a pop.
// Fed by TikFinity roomUser events; the auto-test's fake roomUser event goes
// through the same path, so test mode shows the simulated room's count.
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

// !skip vote progress under the clip bar; resets whenever the stage changes.
// Just the fill — the vote threshold is the streamer's business (settings),
// viewers only see the bar climbing.
function updateSkipbar(votes) {
  if (!chat) return;
  const needed = chat.skipThreshold();
  $('skipbar-fill').style.width = `${Math.min(100, (votes / needed) * 100)}%`;
}

function updatePlayButton() {
  const btn = $('play-btn');
  setPlayBtnPlaying(false); // any stage change/stop resets to the play icon
  if (!round || round.status !== 'playing') { btn.disabled = true; return; }
  btn.disabled = false;
  btn.title = `Play ${round.stages[round.stage].s}s`;
}

function showReveal() {
  const t = round.track;
  const won = round.status === 'won';
  player.stop();
  $('guess-box').style.display = 'none';
  $('play-row').style.display = 'none';
  // The TOP 5 stays put (a stable anchor between rounds); the reveal widget
  // swaps in for the game widgets below it (badges/bars/play/search).
  $('skipbar').hidden = true;
  $('clipbar').hidden = true;
  $('clip-marker-wrap').hidden = true;
  $('round-badges').hidden = true;

  const reveal = $('reveal');
  reveal.hidden = false;

  // The answer is hidden during play and revealed when the round ends —
  // by a correct guess (mine or a viewer's), or after the 15s stage runs dry.
  // Confetti for a win; a plain reveal when nobody got it.
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
      <span class="win-pill">
        <span class="eq"><i></i><i></i><i></i><i></i></span>
        Guessed in ${round.stages[round.stage].s}s!
      </span>`;
  } else {
    $('reveal-outcome').innerHTML = `
      <span class="lose-pill">
        <span class="eq eq-sad"><i></i><i></i><i></i><i></i></span>
        Out of time!
      </span>`;
  }
  $('reveal-cover').src = t.c;
  $('reveal-title').textContent = t.t;
  $('reveal-artist').textContent = t.af || t.a;
  $('reveal-info').textContent = `${t.al} · ${t.y}`;
  const link = $('reveal-spotify');
  if (t.sid) {
    link.href = `https://open.spotify.com/track/${t.sid}`;
    link.style.display = '';
  } else {
    link.style.display = 'none';
  }
  // points always live in the banner now — nothing duplicated by the metadata
  $('reveal-points').textContent = '';

  // Reward listen: the answer is revealed either way, so play the full 15s
  // clip with a progress bar under the reveal. Replay button mirrors it.
  // In auto mode the next round starts once the preview has finished.
  setRevealProgress(0);
  if (player.hasSource) {
    player.onProgress = (elapsed) => setRevealProgress(elapsed);
    player.onEnded = () => {
      $('replay-btn').classList.remove('playing');
      setRevealProgress(0);
      if (autoActive()) setTimeout(autoNext, 800);
    };
    player.playClip(round.offset, MAX_CLIP);
    $('replay-btn').classList.add('playing');
  } else if (autoActive()) {
    setTimeout(autoNext, 5000); // no preview to play out — still move on
  }
}

function setRevealProgress(elapsed) {
  $('reveal-progress-fill').style.width = `${Math.min(100, (elapsed / MAX_CLIP) * 100)}%`;
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
  currentSuggestions.forEach((t, i) => {
    const li = document.createElement('li');
    li.innerHTML = `${escapeHtml(t.t)} <span class="s-artist">— ${escapeHtml(t.a)}</span>`;
    li.addEventListener('mousedown', (e) => { e.preventDefault(); submitGuess(t); });
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

// Wins used to be tallied by stage INDEX against the old fixed stage list;
// now they're keyed by seconds so toggling stages can't scramble history.
function migrateStageStats() {
  const e = state.endless;
  e.byStageSec = e.byStageSec || {};
  if (Array.isArray(e.byStage) && e.byStage.some(n => n > 0)) {
    const legacy = [0.1, 0.5, 2, 8, 15];
    e.byStage.forEach((n, i) => {
      if (n > 0) e.byStageSec[String(legacy[i])] = (e.byStageSec[String(legacy[i])] || 0) + n;
    });
    e.byStage = [0, 0, 0, 0, 0];
    saveState();
  }
}

function showStats() {
  const e = state.endless;
  const winPct = e.games ? Math.round((e.wins / e.games) * 100) : 0;
  const secs = [...new Set([...STAGE_DEFS.map(d => String(d.s)), ...Object.keys(e.byStageSec)])]
    .sort((a, b) => Number(a) - Number(b));
  const stageRows = secs
    .filter(s => e.byStageSec[s])
    .map(s => `<tr><td>Guessed at ${s}s</td><td>${e.byStageSec[s]}</td></tr>`).join('');
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

// ---------- TikTok chat (TikFinity) ----------

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
    // combined "!genre pop !era 2010" costs 2,000), all-or-nothing, applied
    // from the NEXT song (never aborts the current round). If a purchase
    // window is already running, the streamer's purchaseMode decides:
    // queue behind it (default) or override it.
    onSettings: (changes, viewerName, uniqueId) => {
      const describe = (list) =>
        list.map(c => `${c.field === 'genre' ? 'Genre' : 'Era'}: ${c.item.label}`).join(' + ');
      // wheel-won free picks make matching changes cost nothing
      const paidFor = (list) => list.filter(c => !takeCredit(uniqueId, c.field));

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
        const funds = viewerFunds(uniqueId);
        const total = funds.bank + funds.lb;
        const desc = describe(changes);
        const paid = paidFor(changes);
        const cost = SETTING_COST * paid.length;
        if (total < cost) {
          // give the free picks back — the purchase didn't happen
          for (const c of changes.filter(x => !paid.includes(x))) {
            (state.tiktok.credits[uniqueId] ||= {})[c.field] = (state.tiktok.credits[uniqueId][c.field] || 0) + 1;
          }
          addFeedLine(`${escapeHtml(viewerName)} tried ${escapeHtml(desc)} — needs ${cost.toLocaleString()} pts (has ${total.toLocaleString()})`, false);
          failPop(`${viewerName} you need ${cost.toLocaleString()} points! You have ${total.toLocaleString()}`);
          return;
        }
        spendPoints(uniqueId, cost);
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
      const funds = viewerFunds(uniqueId);
      const total = funds.bank + funds.lb;
      const desc = describe(effective);
      const paid = paidFor(effective);
      const cost = SETTING_COST * paid.length;
      if (total < cost) {
        for (const c of effective.filter(x => !paid.includes(x))) {
          (state.tiktok.credits[uniqueId] ||= {})[c.field] = (state.tiktok.credits[uniqueId][c.field] || 0) + 1;
        }
        addFeedLine(`${escapeHtml(viewerName)} tried ${escapeHtml(desc)} — needs ${cost.toLocaleString()} pts (has ${total.toLocaleString()})`, false);
        failPop(`${viewerName} you need ${cost.toLocaleString()} points! You have ${total.toLocaleString()}`);
        return;
      }
      spendPoints(uniqueId, cost);
      for (const c of effective) state.settings[c.field] = c.item.key;
      state.purchase = { left: PURCHASE_SONGS, active: true, buyer: viewerName, desc, uniqueId };
      saveState();
      renderBadges();
      renderLeaderboard();
      renderPurchaseBar();
      const freebies = effective.length - paid.length;
      addFeedLine(`${escapeHtml(viewerName)} ${cost ? `spent ${cost.toLocaleString()} pts` : 'used a free pick'}${freebies && cost ? ' (+ a free pick)' : ''}: ${escapeHtml(desc)} (next ${PURCHASE_SONGS} songs)`, true);
      settingPop(`${viewerName} set ${desc}!`);
    },
    onPoints: (viewerName, uniqueId) => {
      const funds = viewerFunds(uniqueId);
      pointsPop(funds.bank > 0
        ? `${viewerName}: ${funds.lb.toLocaleString()} pts + ${funds.bank.toLocaleString()} banked!`
        : `${viewerName} you have ${funds.lb.toLocaleString()} points!`);
    },
    onBank: (viewerName, uniqueId) => {
      const banked = viewerFunds(uniqueId).bank;
      pointsPop(`${viewerName} you have ${banked.toLocaleString()} banked points!`);
    },
    // likes trickle into the bank quietly (no pops — taps come in floods);
    // leftovers below the rate carry over until the next batch
    onLike: (viewerName, uniqueId, pfp, count) => {
      const rate = Math.round(Number(state.settings.likesPerPoint)) || 0;
      if (rate <= 0) return;
      likeTally.set(uniqueId, (likeTally.get(uniqueId) || 0) + count);
      const pts = Math.floor(likeTally.get(uniqueId) / rate);
      if (pts <= 0) return;
      likeTally.set(uniqueId, likeTally.get(uniqueId) - pts * rate);
      creditBank(uniqueId, viewerName, pfp, pts);
      saveState();
      if (lbView === 'bank') renderLeaderboard();
    },
    onGift: (viewerName, uniqueId, pfp, totalCoins, giftName) => {
      const ratio = Number(state.settings.coinRatio) || 0;
      if (ratio > 0) {
        const banked = Math.max(1, Math.round(totalCoins * ratio));
        creditBank(uniqueId, viewerName, pfp, banked);
        saveState();
        bankPop(`${viewerName} banked ${banked.toLocaleString()} pts!`);
        addFeedLine(`🎁 ${escapeHtml(viewerName)} sent ${escapeHtml(giftName || 'a gift')} (${totalCoins} coins) → +${banked.toLocaleString()} banked`, true);
        if (lbView === 'bank') renderLeaderboard();
        scheduleLbRotation();
      }
      const spinAt = Number(state.settings.wheelGiftCoins) || 0;
      if (spinAt > 0 && totalCoins >= spinAt) {
        queueSpin({ name: viewerName, uniqueId, pfp });
      }
    },
    canPlay: (uniqueId) => !state.settings.followToPlay
      || !!state.tiktok.followers[uniqueId]
      || isDevUser(uniqueId)
      || (tiktokOwner && uniqueId === tiktokOwner.uniqueId),
    onBlocked: (viewerName) => {
      failPop(`${viewerName} Follow To Play!`);
      addFeedLine(`${escapeHtml(viewerName)} needs to follow before playing`, false);
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
      addFeedLine('🎣 honeypot armed — next song is Shazam bait', true);
    },
    onDevParty: (name, pfp) => gamedevParty(name, pfp),
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

  connectTikFinity({
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
const PURCHASE_SONGS = 5;  // a bought genre/era lasts this many songs, then back to Any/Any
const PURCHASE_QUEUE_MAX = 3; // pending purchases waiting behind the current window

// ---------- !gamedev fanfare (dev easter egg) ----------
// "MONK IS HERE!" — searchlight rays, pulsing title, confetti barrage, and
// LovDev — The Game Dev playing. Runs ~15s then fades everything back.

// The Game Dev runs 13s — start the 0.5s fade at 12.5s so the lights and
// the last note land together.
const PARTY_MS = 12500;
let partyAudio = null;
let partyTimer = null;
let partyConfetti = null;

function gamedevParty(name, pfp) {
  const ov = $('party-overlay');
  const pfpImg = $('party-pfp');
  const usePfp = pfp || tiktokOwner?.pfp || '';
  if (usePfp) {
    pfpImg.src = usePfp;
    pfpImg.hidden = false;
    pfpImg.onerror = () => { pfpImg.hidden = true; };
  } else {
    pfpImg.hidden = true;
  }
  // 0.5s fade in — unhide first, then let the opacity transition run
  ov.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show')));
  player.stop(); // the round clip yields the stage
  try {
    partyAudio = partyAudio || new Audio('assets/the-game-dev.mp3');
    partyAudio.currentTime = 0;
    partyAudio.volume = Math.min(1, state.settings.volume / 100);
    partyAudio.play().catch(() => {});
  } catch { /* no audio — the lights still go on */ }
  fireConfetti($('game'));
  clearInterval(partyConfetti);
  partyConfetti = setInterval(() => fireConfetti($('game')), 1600);
  addFeedLine('🛠 dev: Monk is here! (LovDev — The Game Dev)', true);
  clearTimeout(partyTimer);
  partyTimer = setTimeout(() => {
    clearInterval(partyConfetti);
    // 0.5s fade out, sight and sound together
    ov.classList.remove('show');
    setTimeout(() => { ov.hidden = true; }, 520);
    const a = partyAudio;
    if (a) {
      const step = a.volume / 10;
      const fade = setInterval(() => {
        if (a.volume <= step) {
          clearInterval(fade);
          a.pause();
        } else {
          a.volume = Math.max(0, a.volume - step);
        }
      }, 50);
    }
  }, PARTY_MS);
}

// ---------- gift wheel spin ----------
// A single gift worth >= settings.wheelGiftCoins coins spins a 5-segment
// prize wheel on stream. Spins queue so simultaneous gifts each get their
// moment. Prizes apply when the wheel stops.

const WHEEL_PRIZES = [
  {
    label: '10K', sub: 'JACKPOT', color: '#f7c948',
    win: (v) => { creditBank(v.uniqueId, v.name, v.pfp, 10000); return `${v.name} hits the 10K JACKPOT! (banked)`; },
  },
  {
    label: 'GENRE', sub: 'FREE PICK', color: '#1db954',
    win: (v) => {
      const c = (state.tiktok.credits[v.uniqueId] ||= {});
      c.genre = (c.genre || 0) + 1;
      return `${v.name} won a FREE GENRE pick!`;
    },
  },
  {
    label: '1K', sub: 'BANKED', color: '#00c2ff',
    win: (v) => { creditBank(v.uniqueId, v.name, v.pfp, 1000); return `${v.name} won 1,000 banked points!`; },
  },
  {
    label: 'ERA', sub: 'FREE PICK', color: '#b967ff',
    win: (v) => {
      const c = (state.tiktok.credits[v.uniqueId] ||= {});
      c.era = (c.era || 0) + 1;
      return `${v.name} won a FREE ERA pick!`;
    },
  },
  {
    label: '2.5K', sub: 'BANKED', color: '#ff5c8a',
    win: (v) => { creditBank(v.uniqueId, v.name, v.pfp, 2500); return `${v.name} won 2,500 banked points!`; },
  },
];

const SPIN_MS = 4000;
const SPIN_RESULT_MS = 3500;
const SPIN_TURNS = 5; // full revolutions before landing
const spinQueue = [];
let spinning = false;
let wheelBuilt = false;

function buildSpinWheel() {
  if (wheelBuilt) return;
  wheelBuilt = true;
  const svg = $('spin-wheel');
  const seg = 360 / WHEEL_PRIZES.length;
  const pt = (a, r) => [100 + r * Math.cos((a * Math.PI) / 180), 100 + r * Math.sin((a * Math.PI) / 180)];
  let html = '<circle cx="100" cy="100" r="99" fill="#0d0d14"/>';
  WHEEL_PRIZES.forEach((p, i) => {
    const a0 = -90 + i * seg;
    const a1 = a0 + seg;
    const [x0, y0] = pt(a0, 96);
    const [x1, y1] = pt(a1, 96);
    html += `<path d="M100,100 L${x0.toFixed(2)},${y0.toFixed(2)} A96,96 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${p.color}" stroke="#0d0d14" stroke-width="2"/>`;
    const mid = a0 + seg / 2;
    const [tx, ty] = pt(mid, 60);
    html += `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" transform="rotate(${(mid + 90).toFixed(1)} ${tx.toFixed(2)} ${ty.toFixed(2)})" text-anchor="middle" class="spin-label"><tspan x="${tx.toFixed(2)}" dy="-2">${p.label}</tspan><tspan x="${tx.toFixed(2)}" dy="13" class="spin-sub">${p.sub}</tspan></text>`;
  });
  // rim pins on the segment boundaries — what the pointer "hits" as it spins
  WHEEL_PRIZES.forEach((p, i) => {
    const [px, py] = pt(-90 + i * seg, 91);
    html += `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="3.4" fill="#fff" stroke="#0d0d14" stroke-width="1"/>`;
  });
  html += '<circle cx="100" cy="100" r="14" fill="#0d0d14" stroke="#fff" stroke-width="2"/>';
  svg.innerHTML = html;
}

function queueSpin(viewer) {
  spinQueue.push(viewer);
  if (!spinning) runNextSpin();
}

function runNextSpin() {
  const v = spinQueue.shift();
  if (!v) { spinning = false; return; }
  spinning = true;
  buildSpinWheel();
  const overlay = $('spin-overlay');
  const wheel = $('spin-wheel');
  const seg = 360 / WHEEL_PRIZES.length;
  overlay.hidden = false;
  // the gifter's face on their moment: pfp + nickname above the wheel
  const pfpImg = $('spin-pfp');
  const pfpFake = $('spin-pfp-fake');
  if (v.pfp) {
    pfpImg.src = v.pfp; // no-referrer set in markup: TikTok CDN rejects foreign referrers
    pfpImg.hidden = false;
    pfpFake.hidden = true;
    pfpImg.onerror = () => { pfpImg.hidden = true; pfpFake.hidden = false; pfpFake.textContent = '🎁'; };
  } else {
    pfpImg.hidden = true;
    pfpFake.hidden = false;
    pfpFake.textContent = '🎁';
  }
  $('spin-name').textContent = v.name;
  $('spin-title').textContent = 'spins the wheel!';
  $('spin-result').classList.remove('show');

  const idx = Math.floor(Math.random() * WHEEL_PRIZES.length);
  // land segment idx's centre under the top pointer after the showy turns
  const target = 360 * SPIN_TURNS - (idx * seg + seg / 2);
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  addFeedLine(`🎡 ${escapeHtml(v.name)} triggered a wheel spin`, true);

  // rAF-driven cubic-out: flies from the first frame, dies over ~4s. Driving
  // it ourselves (not CSS) is what makes the pointer ticks land exactly as
  // each segment pin passes — one click per pin, pitch of a real prize wheel.
  const pointer = $('spin-pointer');
  const t0 = performance.now();
  let lastNotch = 0;
  let lastKick = 0;
  let kickTimer = null;
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / SPIN_MS);
    const rot = target * (1 - Math.pow(1 - p, 3));
    wheel.style.transform = `rotate(${rot}deg)`;
    const notch = Math.floor(rot / seg);
    if (notch > lastNotch) {
      lastNotch = notch;
      playTick(state.settings.volume / 100);
      if (now - lastKick > 60) { // don't thrash the kick mid-blur
        lastKick = now;
        pointer.classList.remove('kick');
        void pointer.offsetWidth;
        pointer.classList.add('kick');
        clearTimeout(kickTimer);
        kickTimer = setTimeout(() => pointer.classList.remove('kick'), 90);
      }
    }
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  setTimeout(() => {
    // test spins (settings button) show the outcome but award nothing
    const prize = WHEEL_PRIZES[idx];
    const msg = v.test
      ? `Test: ${prize.label} ${prize.sub} — no prize awarded`
      : prize.win(v);
    if (!v.test) {
      saveState();
      renderLeaderboard();
      scheduleLbRotation();
    }
    const result = $('spin-result');
    result.textContent = msg;
    result.classList.add('show');
    playDing(state.settings.volume / 100);
    fireConfetti($('game'));
    addFeedLine(`🎡 ${escapeHtml(msg)}`, true);
    setTimeout(() => {
      overlay.hidden = true;
      runNextSpin();
    }, SPIN_RESULT_MS);
  }, SPIN_MS + 150);
}

// ---------- auto mode (AFK) ----------
// Loops the current clip with a 0.5s gap so the game runs itself. A viewer
// win reveals, plays the full preview, then advances. If nobody gets it
// after several full plays at the 15s stage, the round reveals and moves on.

const AUTO_FINAL_PLAYS = 6; // ~1.5 min stuck at 15s before giving up
let autoTimer = null;
let autoFinalPlays = 0;

function autoActive() {
  return state.settings.autoMode;
}

function autoPlayClip() {
  if (!autoActive() || !round || round.status !== 'playing' || !player.hasSource) return;
  player.onProgress = (elapsed) => updateClipbar(elapsed);
  player.onEnded = () => {
    updateClipbar(0);
    setPlayBtnPlaying(false);
    if (!autoActive() || !round || round.status !== 'playing') return;
    if (round.stage === round.stages.length - 1 && ++autoFinalPlays >= AUTO_FINAL_PLAYS) {
      doSkip(); // nobody got it — reveal and move on
      return;
    }
    clearTimeout(autoTimer);
    autoTimer = setTimeout(autoPlayClip, state.settings.autoGap || 500);
  };
  player.playClip(round.offset, round.stages[round.stage].s);
  setPlayBtnPlaying(true);
}

function autoNext() {
  if (!autoActive() || !round || round.status === 'playing') return;
  $('next-btn').click();
}

// a passed skip vote (or a dev !skip): unlock the next clip length, or at
// the 15s max give up on the song entirely
function skipPassAction() {
  if (!round || round.status !== 'playing') return;
  if (chatSkipStage(round)) {
    player.stop();
    addFeedLine(`⏭ chat skipped ahead → ${round.stages[round.stage].s}s unlocked`, true);
    renderRound();
    updatePlayButton();
    autoFinalPlays = 0;
    if (autoActive()) autoPlayClip();
  } else {
    // 15s already unlocked — nobody has a clue: reveal, no points, auto
    // mode moves on by itself
    addFeedLine('⏭ chat voted to skip the song', true);
    settingPop('Chat skipped the song!');
    doSkip();
  }
}

// green = purchase, orange = can't afford, cyan = balance, gold = banked
const settingPop = (text) => queuePop('setting-pop', text);
const failPop = (text) => queuePop('fail-pop', text);
const pointsPop = (text) => queuePop('points-pop', text);
const bankPop = (text) => queuePop('bank-pop', text);

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

// Followers are learned two ways: live follow events, and the follow flag
// TikTok attaches to chat messages. Once seen, a follower stays unlocked.
function markFollower(uniqueId, nickname = '') {
  if (!uniqueId || state.tiktok.followers[uniqueId]) return;
  state.tiktok.followers[uniqueId] = 1;
  saveState();
  if (state.settings.followToPlay && nickname) {
    addFeedLine(`❤ ${escapeHtml(nickname)} followed — can play now`, true);
  }
}

// exposed for the smoke harness (tools/smoke-features.mjs) and live debugging
window.hooklineIngest = (msg, source = 'sim') => ingest(msg, source);

function ingest(msg, source = 'live') {
  if (source === 'sim') console.debug('[hookline] (sim)', msg.event, msg.data?.comment ?? '');
  if (msg.event === 'follow' && msg.data?.uniqueId) {
    markFollower(msg.data.uniqueId, msg.data.nickname || '');
    return;
  }
  if (msg.event === 'chat' && msg.data?.follows >= 1) {
    markFollower(msg.data.uniqueId);
  }
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

const COIN_SVG = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15 9.5c0-1.1-1.34-2-3-2s-3 .9-3 2 1.34 2 3 2 3 .9 3 2-1.34 2-3 2-3-.9-3-2"/></svg>';

let lbRotTimer = null;
let lbRotIndex = 0; // survives re-renders so the rotation doesn't restart on every win

// The podium alternates between the points leaderboard and the gift bank
// (settings.bankRotate seconds per view; 0 or an empty bank = points only).
let lbView = 'points';
let lbViewTimer = null;

function scheduleLbRotation() {
  const secs = Number(state.settings.bankRotate) || 0;
  // rotate whenever the pace is set — an empty BANK view is deliberate,
  // it advertises that gifts bank points
  if (!secs) {
    clearInterval(lbViewTimer);
    lbViewTimer = null;
    if (lbView !== 'points') { lbView = 'points'; renderLeaderboard(); }
    return;
  }
  if (lbViewTimer) return; // already rotating at the current pace
  lbViewTimer = setInterval(() => {
    lbView = lbView === 'points' ? 'bank' : 'points';
    renderLeaderboard();
  }, secs * 1000);
}

function renderLeaderboard() {
  const bankMode = lbView === 'bank';
  $('top5-title').innerHTML = bankMode
    ? `${COIN_SVG} BANK`
    : `${TROPHY_SVG.replace('lb-trophy', 'icon')} LEADERBOARD`;
  $('top5').classList.toggle('bank-view', bankMode);
  const all = Object.values(bankMode ? state.tiktok.bank : state.tiktok.scores)
    .filter(e => !bankMode || e.points > 0)
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
  // The slot is ALWAYS rendered (placeholder when nobody's there yet) so the
  // podium keeps one height while it alternates between LEADERBOARD and BANK.
  clearInterval(lbRotTimer);
  lbRotTimer = null;
  const rest = all.slice(5);
  {
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
    if (rest.length === 0) {
      li.classList.add('lb-empty');
      inner.innerHTML = `
        <span class="lb-rank">6</span>
        <span class="lb-name">...</span>`;
    } else {
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

function applySpinScale(pct) {
  document.documentElement.style.setProperty('--spin-scale', pct / 100);
  $('spinscale-value').textContent = `${pct}%`;
}

function applySpinPos(pct) {
  document.documentElement.style.setProperty('--spin-pos', pct);
  $('spinpos-value').textContent = `${pct}%`;
}

function applyVolume(v) {
  player.setVolume(v / 100);
  $('volume-slider').value = v;
  $('volume-icon').innerHTML = VOL_SVG.head + (v === 0 ? VOL_SVG.mute : v < 40 ? VOL_SVG.low : VOL_SVG.high);
}

// ---------- events ----------

function wireEvents() {
  // collapsible settings groups remember whether the streamer left them open
  for (const d of document.querySelectorAll('#settings-panel details.sgroup')) {
    const key = d.dataset.group;
    if (state.settings.openGroups?.[key] != null) d.open = !!state.settings.openGroups[key];
    d.addEventListener('toggle', () => {
      (state.settings.openGroups ||= {})[key] = d.open;
      saveState();
    });
  }

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
      clearTimeout(autoTimer);
      if (state.settings.autoMode) {
        if (round && round.status === 'playing' && !player.playing) autoPlayClip();
        else if (round && round.status !== 'playing' && !player.playing) autoNext();
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

  // clip length toggles — at least one must stay on
  const stageChips = $('stage-chips').querySelectorAll('.chip');
  const syncStageChips = () => {
    for (const c of stageChips) {
      c.classList.toggle('active', !!state.settings.stageToggles[c.dataset.stage]);
    }
  };
  syncStageChips();
  for (const c of stageChips) {
    c.addEventListener('click', () => {
      const key = c.dataset.stage;
      const t = state.settings.stageToggles;
      const onCount = Object.values(t).filter(Boolean).length;
      if (t[key] && onCount <= 1) return; // never allow zero stages
      t[key] = !t[key];
      saveState();
      syncStageChips();
    });
  }

  // !bank: coins -> banked points ratio + podium rotation pace
  const coinInput = $('coinratio-input');
  coinInput.value = state.settings.coinRatio;
  coinInput.addEventListener('change', () => {
    state.settings.coinRatio = Math.max(0, Number(coinInput.value) || 0);
    coinInput.value = state.settings.coinRatio;
    saveState();
  });
  const likesInput = $('likesrate-input');
  likesInput.value = state.settings.likesPerPoint;
  likesInput.addEventListener('change', () => {
    state.settings.likesPerPoint = Math.max(0, Math.round(Number(likesInput.value) || 0));
    likesInput.value = state.settings.likesPerPoint;
    saveState();
  });
  const rotChips = $('bankrotate-chips').querySelectorAll('.chip');
  const syncRotChips = () => {
    for (const c of rotChips) {
      c.classList.toggle('active', Number(c.dataset.rot) === (Number(state.settings.bankRotate) || 0));
    }
  };
  syncRotChips();
  for (const c of rotChips) {
    c.addEventListener('click', () => {
      state.settings.bankRotate = Number(c.dataset.rot);
      saveState();
      syncRotChips();
      clearInterval(lbViewTimer);
      lbViewTimer = null;
      scheduleLbRotation();
    });
  }

  // follow-to-play gate
  const followChips = $('follow-chips').querySelectorAll('.chip');
  const syncFollowChips = () => {
    for (const c of followChips) {
      c.classList.toggle('active', (c.dataset.follow === 'true') === !!state.settings.followToPlay);
    }
  };
  syncFollowChips();
  for (const c of followChips) {
    c.addEventListener('click', () => {
      state.settings.followToPlay = c.dataset.follow === 'true';
      saveState();
      syncFollowChips();
    });
  }

  // test spin: fake user, real animation, no prize — for sizing/positioning
  $('testspin-btn').addEventListener('click', () => {
    queueSpin({ name: 'TestViewer', uniqueId: 'wheel_test', pfp: 'assets/avatars/a3.png', test: true });
  });

  // gift wheel spin threshold
  const wheelInput = $('wheelcoins-input');
  wheelInput.value = state.settings.wheelGiftCoins;
  wheelInput.addEventListener('change', () => {
    state.settings.wheelGiftCoins = Math.max(0, Math.round(Number(wheelInput.value) || 0));
    wheelInput.value = state.settings.wheelGiftCoins;
    saveState();
  });

  const gapChips = $('autogap-chips').querySelectorAll('.chip');
  const syncGapChips = () => {
    for (const c of gapChips) {
      c.classList.toggle('active', Number(c.dataset.gap) === (state.settings.autoGap || 500));
    }
  };
  syncGapChips();
  for (const c of gapChips) {
    c.addEventListener('click', () => {
      state.settings.autoGap = Number(c.dataset.gap);
      saveState();
      syncGapChips();
    });
  }

  const bufferSlider = $('buffer-slider');
  state.settings.buffer = Math.min(120, state.settings.buffer); // slider max shrank to 120
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
    ['spinscale-slider', 'spinScale', applySpinScale],
    ['spinpos-slider', 'spinPos', applySpinPos],
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

  $('play-btn').addEventListener('click', () => {
    if (!round || round.status !== 'playing') return;
    if (player.playing) { // acting as a pause button mid-clip
      player.stop();
      setPlayBtnPlaying(false);
      updateClipbar(0);
      return;
    }
    player.onProgress = (elapsed) => updateClipbar(elapsed);
    player.onEnded = () => { updateClipbar(0); setPlayBtnPlaying(false); };
    player.playClip(round.offset, round.stages[round.stage].s);
    setPlayBtnPlaying(true);
  });

  $('skip-btn').addEventListener('click', doSkip);
  $('replay-btn').addEventListener('click', () => {
    if (!round || !player.hasSource) return;
    const btn = $('replay-btn');
    if (player.playing) {
      player.stop();
      btn.classList.remove('playing');
      setRevealProgress(0);
      return;
    }
    player.onProgress = (elapsed) => setRevealProgress(elapsed);
    player.onEnded = () => { btn.classList.remove('playing'); setRevealProgress(0); };
    player.playClip(round.offset, MAX_CLIP);
    btn.classList.add('playing');
  });
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
    if (!confirm('Clear the leaderboard AND the bank? All viewer points, banked points and free picks are wiped.')) return;
    state.tiktok.scores = {};
    state.tiktok.bank = {};
    state.tiktok.credits = {};
    saveState();
    clearInterval(lbViewTimer);
    lbViewTimer = null;
    lbView = 'points';
    renderLeaderboard();
  });

  $('stats-btn').addEventListener('click', showStats);
  $('stats-close').addEventListener('click', () => $('stats-modal').close());

  // Space to play when input not focused
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && document.activeElement !== $('guess-input') && round?.status === 'playing') {
      e.preventDefault();
      $('play-btn').click();
    }
  });
}

init();
