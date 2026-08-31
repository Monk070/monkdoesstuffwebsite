// PriceTag — boot & orchestration. One ingest() path feeds the game whether
// guesses come from the local TikTok LIVE bridge (live) or the dev panel
// (sim), exactly like Hookline / TikTok Café.

import { connect as connectBridge } from "./tiktok-client.js";
import { parseGuess, MAX_GUESS } from "./guess.js";
import { GBP, randomCurrency, convert, formatMoney } from "./currency.js";
import { createGame, startRound, submitGuess, reveal } from "./game.js";
import { loadCatalog, catalogSize, nextItem } from "./catalog.js";
import {
  loadSettings, saveSettings, loadScores, awardPoints, topScores,
} from "./storage.js";
import * as sfx from "./sfx.js";

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const scores = loadScores();
const game = createGame();

let tiktokState = "idle";
let autoTimer = null;
let nextTimer = null;
let roundCurrency = GBP;   // per-round; random in currency chaos mode

// ---- error surfacing (stall lesson from the Café: never die silently) ----
window.addEventListener("error", (e) => showError(e.message ?? String(e.error)));
window.addEventListener("unhandledrejection", (e) => showError(String(e.reason)));
let errBar = null;
function showError(msg) {
  if (!errBar) {
    errBar = document.createElement("div");
    errBar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99;" +
      "background:#7a1f1f;color:#ffd7d7;font:12px/1.4 monospace;padding:4px 10px;";
    document.body.appendChild(errBar);
  }
  errBar.textContent = `error (screenshot me!): ${msg}`;
}

// ---------------------------------------------------------------- rounds ----

// Property listings carry several photos — auto-flick through them while
// chat guesses, with pager dots (the "scroll through the pictures" mode).
let photoTimer = null;
let photoIdx = 0;

function showPhoto(item, idx) {
  const img = $("item-photo");
  const photos = item.images?.length ? item.images : (item.image ? [item.image] : []);
  if (!photos.length) return;
  photoIdx = idx % photos.length;
  img.classList.remove("fade");
  void img.offsetWidth;                  // restart the CSS animation
  img.classList.add("fade");
  img.src = photos[photoIdx];
  const dots = $("photo-dots");
  [...dots.children].forEach((d, i) => d.classList.toggle("on", i === photoIdx));
}

function beginRound() {
  clearTimeout(nextTimer);
  clearInterval(photoTimer);
  const item = nextItem(settings.mode);
  if (!item) {
    showError(settings.mode === "property"
      ? "no properties in the catalogue yet — run the catalogue builder"
      : "catalogue empty — run the catalogue builder");
    return;
  }
  // Currency chaos: convert the (GBP) price into this round's currency —
  // guesses, distances and the reveal all live in that currency.
  roundCurrency = settings.currencyMode === "random" ? randomCurrency() : GBP;
  const roundItem = {
    ...item,
    gbpPrice: item.price,
    price: convert(item.price, roundCurrency),
  };
  startRound(game, roundItem, settings.roundSeconds);
  const isProperty = item.kind === "property";

  $("idle-screen").hidden = true;
  $("reveal-screen").hidden = true;
  $("round-screen").hidden = false;

  const img = $("item-photo");
  const fallback = $("item-photo-fallback");
  const photos = item.images?.length ? item.images : (item.image ? [item.image] : []);
  img.hidden = !photos.length; fallback.hidden = photos.length > 0;
  fallback.textContent = isProperty ? "🏠" : "📦";
  img.onerror = () => { img.hidden = true; fallback.hidden = false; };

  const dots = $("photo-dots");
  dots.hidden = photos.length < 2;
  dots.innerHTML = photos.length > 1
    ? photos.slice(0, 12).map(() => "<span></span>").join("")
    : "";
  showPhoto(item, 0);
  if (photos.length > 1) {
    photoTimer = setInterval(() => showPhoto(item, photoIdx + 1), 3500);
  }

  const sym = roundCurrency.symbol;
  $("price-tag").textContent = isProperty ? `${sym}???,???` : `${sym}?.??`;
  $("item-title").textContent = item.title;
  $("item-source").textContent = `spotted on ${item.source ?? "the internet"}`;
  if (roundCurrency.code !== "GBP") {
    $("round-cta").innerHTML =
      `💱 this round you're guessing in <b>${roundCurrency.name} (${sym})</b>!`;
  } else {
    $("round-cta").innerHTML = isProperty
      ? "guess the asking price — <b>!395k</b> · <b>£400,000</b> · <b>!1.2m</b>"
      : "type your price in chat — <b>£2.50</b> · <b>99p</b> · <b>15</b>";
  }
  $("guess-feed").innerHTML = "";
  $("guess-count").textContent = "0 guesses";
  renderTimer();
}

function endRound() {
  clearInterval(photoTimer);
  const winners = reveal(game);
  sfx.reveal();
  if (winners.length) sfx.win();

  $("round-screen").hidden = true;
  $("reveal-screen").hidden = false;
  $("reveal-price").textContent = formatMoney(game.item.price, roundCurrency);
  const gbpNote = $("reveal-gbp");
  gbpNote.hidden = roundCurrency.code === "GBP";
  if (!gbpNote.hidden) {
    gbpNote.textContent = `that's ${formatMoney(game.item.gbpPrice, GBP)} back home`;
  }

  const podium = $("podium");
  podium.innerHTML = "";
  if (!winners.length) {
    podium.innerHTML = `<p class="podium-empty">no guesses — shy crowd!</p>`;
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    winners.forEach((w, i) => {
      const row = document.createElement("div");
      row.className = "podium-row" + (w.exact ? " exact" : "");
      row.innerHTML =
        `<span class="medal">${medals[i]}</span>` +
        `<span class="p-name"></span>` +
        `<span class="p-guess">${formatMoney(w.value, roundCurrency)}</span>` +
        `<span class="p-pts">+${w.points}${w.exact ? " EXACT!" : ""}</span>`;
      row.querySelector(".p-name").textContent = w.name;
      podium.appendChild(row);
    });
    awardPoints(scores, winners);
    confettiBurst(winners.some(w => w.exact) ? 140 : 60);
  }
  renderLeaderboard();

  if (settings.autoNext) {
    $("next-note").textContent = `next item in ${settings.revealSeconds}s…`;
    nextTimer = setTimeout(beginRound, settings.revealSeconds * 1000);
  } else {
    $("next-note").textContent = "▶ Start round when ready";
  }
}

function renderLeaderboard() {
  const rows = $("leader-rows");
  rows.innerHTML = "";
  for (const s of topScores(scores, 5)) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="l-name"></span><span class="l-pts">${s.pts} pts</span>`;
    li.querySelector(".l-name").textContent = s.name;
    rows.appendChild(li);
  }
}

// 100ms heartbeat drives the countdown (game.js owns no timers).
let lastBeat = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - lastBeat) / 1000;
  lastBeat = now;
  if (game.phase !== "guessing") return;
  const before = Math.ceil(game.timeLeft);
  game.timeLeft -= dt;
  const after = Math.ceil(game.timeLeft);
  if (after !== before && after <= 5 && after > 0) (after === 1 ? sfx.lastTick : sfx.tick)();
  if (game.timeLeft <= 0) { endRound(); return; }
  renderTimer();
}, 100);

function renderTimer() {
  const total = settings.roundSeconds;
  const left = Math.max(0, game.timeLeft);
  $("timer-fill").style.width = `${(left / total) * 100}%`;
  $("timer-text").textContent = Math.ceil(left);
  $("timer-row").classList.toggle("urgent", left <= 5);
}

// ---------------------------------------------------------------- ingest ----

function ingest(msg, source = "live") {
  const { event, data } = msg;
  if (!data) return;
  if (event === "chat") {
    // cap scales with the round currency — a house in Đồng is ten billion
    const value = parseGuess(data.comment, MAX_GUESS * roundCurrency.perGBP);
    log(`${data.nickname || data.uniqueId}: ${data.comment}`, source, value != null);
    if (value == null) return;
    if (submitGuess(game, data.uniqueId, data.nickname, value, data.profilePictureUrl)) {
      addGuessRow(data.nickname || data.uniqueId, value);
    }
  }
}

function addGuessRow(name, value) {
  const feed = $("guess-feed");
  const row = document.createElement("div");
  row.className = "guess-row";
  row.innerHTML = `<span class="g-name"></span> reckons <b>${formatMoney(value, roundCurrency)}</b>`;
  row.querySelector(".g-name").textContent = name;
  feed.prepend(row);
  while (feed.children.length > 8) feed.removeChild(feed.lastChild);
  $("guess-count").textContent = `${game.guesses.size} guess${game.guesses.size === 1 ? "" : "es"}`;
}

// ---------------------------------------------------------------- panel ----

function log(text, source, hit = false) {
  const el = $("log");
  const row = document.createElement("div");
  row.className = (source === "live" ? "live " : "") + (hit ? "hit" : "");
  row.textContent = `${source === "live" ? "●" : "○"} ${text}`;
  el.appendChild(row);
  while (el.children.length > 120) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function setTikTokState(data) {
  tiktokState = data.state;
  const pill = $("conn-pill");
  const on = data.state === "connected";
  pill.textContent = on ? `tiktok: @${data.username}` : `tiktok: ${data.state}`;
  pill.className = `pill ${on ? "on" : "off"}`;
  $("tiktok-connect-btn").textContent =
    ["connected", "connecting", "reconnecting"].includes(data.state) ? "Disconnect" : "Connect";
  const note = $("tiktok-note");
  note.classList.toggle("live", on);
  note.textContent = {
    idle: "Go live on TikTok, then connect your @username",
    connecting: "Connecting…",
    connected: `Connected to @${data.username}'s LIVE — chat can guess!`,
    reconnecting: "Connection dropped — reconnecting…",
    error: data.error || "Connection failed",
  }[data.state] || "";
}

function wirePanel() {
  const input = $("tiktok-user");
  input.value = settings.tiktokUser || "";
  $("tiktok-connect-btn").addEventListener("click", async () => {
    if (["connected", "connecting", "reconnecting"].includes(tiktokState)) {
      try { await fetch("/api/tiktok/disconnect", { method: "POST" }); } catch { /* server gone */ }
      return;
    }
    const username = input.value.trim();
    if (!username) { $("tiktok-note").textContent = "Enter your TikTok @username"; return; }
    settings.tiktokUser = username;
    saveSettings(settings);
    $("tiktok-note").textContent = "Connecting…";
    try {
      await fetch("/api/tiktok/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
    } catch {
      $("tiktok-note").textContent = "Local server not reachable — run start.bat";
    }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") $("tiktok-connect-btn").click(); });

  $("p-start").addEventListener("click", beginRound);
  $("p-reveal").addEventListener("click", () => { if (game.phase === "guessing") endRound(); });
  $("p-skip").addEventListener("click", () => { if (game.phase !== "idle") beginRound(); });
  $("start-btn").addEventListener("click", beginRound);

  $("set-mode").value = settings.mode;
  $("set-mode").addEventListener("change", () => {
    settings.mode = $("set-mode").value;
    saveSettings(settings);
  });

  $("set-currency").value = settings.currencyMode;
  $("set-currency").addEventListener("change", () => {
    settings.currencyMode = $("set-currency").value;
    saveSettings(settings);
  });

  $("set-round").value = settings.roundSeconds;
  $("set-reveal").value = settings.revealSeconds;
  $("set-autonext").checked = settings.autoNext;
  $("set-round").addEventListener("change", () => {
    settings.roundSeconds = Math.max(10, Math.min(180, Number($("set-round").value) || 40));
    saveSettings(settings);
  });
  $("set-reveal").addEventListener("change", () => {
    settings.revealSeconds = Math.max(4, Math.min(60, Number($("set-reveal").value) || 12));
    saveSettings(settings);
  });
  $("set-autonext").addEventListener("change", () => {
    settings.autoNext = $("set-autonext").checked;
    saveSettings(settings);
  });
  $("set-sound").addEventListener("change", () => sfx.setEnabled($("set-sound").checked));

  // sim: "alice: 4.50" fakes a viewer; bare "4.50" guesses as "you"
  let selfUser = "you";
  const simSubmit = () => {
    const raw = $("sim-input").value.trim();
    if (!raw) return;
    const m = raw.match(/^([\w.\-]+)\s*:\s*(.+)$/);
    const [user, text] = m ? [m[1], m[2]] : [selfUser, raw];
    if (m) selfUser = m[1];
    ingest({ event: "chat", data: { uniqueId: user, nickname: user, comment: text } }, "sim");
    $("sim-input").value = "";
  };
  $("sim-send").addEventListener("click", simSubmit);
  $("sim-input").addEventListener("keydown", (e) => { if (e.key === "Enter") simSubmit(); });

  $("sim-crowd").addEventListener("click", fakeCrowd);
  $("sim-auto").addEventListener("click", () => {
    if (autoTimer) {
      clearInterval(autoTimer); autoTimer = null;
      $("sim-auto").classList.remove("on"); $("sim-auto").textContent = "Auto-play";
    } else {
      autoTimer = setInterval(() => {
        if (game.phase === "idle") beginRound();
        else if (game.phase === "guessing" && Math.random() < 0.5) fakeGuess();
      }, 700);
      $("sim-auto").classList.add("on"); $("sim-auto").textContent = "Auto-play: ON";
    }
  });
  $("reset-scores").addEventListener("click", () => {
    if (!window.confirm("Wipe the all-time leaderboard?")) return;
    for (const k of Object.keys(scores)) delete scores[k];
    awardPoints(scores, []);
    renderLeaderboard();
  });

  // panel visible by default; ?dev=0 hides it (clean OBS source); ` toggles
  const params = new URLSearchParams(location.search);
  if (params.get("dev") !== "0") $("panel").classList.remove("hidden");
  window.addEventListener("keydown", (e) => {
    if (e.key === "`" && !e.target.matches?.("input")) {
      $("panel").classList.toggle("hidden");
      e.preventDefault();
    }
  });
}

// ---- fake crowd (dev): guesses scattered around the real price ----
const FAKE_USERS = ["alice_smith", "bobthebuilder", "charlie99", "diana_d",
  "ethan_x", "fiona_p", "george.h", "hannah_lol", "iggy_pop", "jules_v"];

function fakeGuess() {
  if (game.phase !== "guessing" || !game.item) return;
  const user = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
  const wild = Math.random() < 0.25;
  const factor = wild ? (0.2 + Math.random() * 4) : (0.6 + Math.random() * 0.9);
  const price = game.item.price;
  let comment;
  if (price >= 10000) {
    // property: fake the messy real-world notations so the parser gets a
    // workout in every playtest ("395k", "!1.2m", "400,000", "1 million 200")
    const v = Math.round(price * factor / 1000) * 1000;
    const styles = [
      () => String(v),
      () => `${v / 1000}k`,
      () => `!${v.toLocaleString("en-GB")}`,
      () => v >= 1e6 ? `${(v / 1e6).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}m` : `£${v.toLocaleString("en-GB")}`,
      () => v >= 1e6 && v % 1e6 >= 1000
        ? `${Math.floor(v / 1e6)} million ${Math.round((v % 1e6) / 1000)}`
        : `${v / 1000} thousand`,
    ];
    comment = styles[Math.floor(Math.random() * styles.length)]();
  } else {
    comment = String(Math.max(0.1, Math.round(price * factor * 4) / 4));
  }
  ingest({ event: "chat", data: { uniqueId: user, nickname: user, comment } }, "sim");
}

function fakeCrowd() {
  if (game.phase !== "guessing") beginRound();
  for (let i = 0; i < 6; i++) setTimeout(fakeGuess, 200 + i * 350);
}

// ---------------------------------------------------------------- confetti ----

const confetti = [];
const cCanvas = $("confetti");
const cCtx = cCanvas.getContext("2d");

function confettiBurst(n) {
  const { width: w } = cCanvas.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    confetti.push({
      x: Math.random() * w, y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 6,
      color: ["#d84f3f", "#f2c14e", "#4a90d9", "#6ab04c", "#e3a72b"][i % 5],
      life: 3 + Math.random() * 2,
    });
  }
}

setInterval(() => {
  const r = cCanvas.getBoundingClientRect();
  if (cCanvas.width !== Math.round(r.width)) { cCanvas.width = Math.round(r.width); cCanvas.height = Math.round(r.height); }
  cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.life -= 1 / 30; p.x += p.vx / 30; p.y += p.vy / 30; p.rot += p.vr / 30;
    if (p.life <= 0 || p.y > cCanvas.height + 20) { confetti.splice(i, 1); continue; }
    cCtx.save();
    cCtx.translate(p.x, p.y);
    cCtx.rotate(p.rot);
    cCtx.fillStyle = p.color;
    cCtx.globalAlpha = Math.min(1, p.life);
    cCtx.fillRect(-4, -3, 8, 6);
    cCtx.restore();
  }
}, 33);

// ---------------------------------------------------------------- boot ----

wirePanel();
renderLeaderboard();

// ?mode= and ?currency= — session-only overrides (OBS sources, testing);
// the saved settings are left alone.
{
  const params = new URLSearchParams(location.search);
  const modeParam = params.get("mode");
  if (["mixed", "items", "property"].includes(modeParam)) {
    settings.mode = modeParam;
    $("set-mode").value = modeParam;
  }
  const curParam = params.get("currency");
  if (["gbp", "random"].includes(curParam)) {
    settings.currencyMode = curParam;
    $("set-currency").value = curParam;
  }
}

loadCatalog()
  .then((n) => {
    $("cat-count").textContent = n;
    $("idle-note").textContent = `${n} things to put a price on`;
    $("start-btn").hidden = false;
    // ?autostart=1 — straight into a round (OBS sources, headless tests)
    if (new URLSearchParams(location.search).get("autostart") === "1") beginRound();
  })
  .catch((err) => {
    $("idle-note").textContent = String(err.message || err);
  });

connectBridge({
  onClose: () => setTikTokState({ state: "error", error: "Local server offline — run start.bat" }),
  onEvent: (msg) => {
    if (msg.event === "tiktokState") return setTikTokState(msg.data);
    ingest(msg, "live");
  },
});

// exposed for the smoke harness and live debugging (Hookline pattern)
window.pricetagIngest = (msg, source = "sim") => ingest(msg, source);
window.pricetagStart = beginRound;
