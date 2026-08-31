// Dev simulator — the TODO's "fake text input box". Type `alice: !chop`
// (or just `!chop`) and it becomes a TikFinity-shaped chat event through the
// same ingest path as live traffic (the bridge emits the same shapes).
// Auto-play simulates a whole chatroom so the scaling knob can be eyeballed.
// Also hosts the TikTok LIVE connect UI. Toggle panel with backtick.

import { openSettings } from "./settings-ui.js";
import { state as gameState } from "./game.js";

const FAKE_USERS = [
  "alice_smith", "bobthebuilder", "charlie99", "diana_d", "ethan_x",
  "fiona_p", "george.h", "hannah_lol", "iggy_pop", "jules_v",
];

let send = null;
let selfUser = "you";

function flatUser(uniqueId) {
  return {
    userId: "7" + String(Math.abs(hash(uniqueId))).padStart(18, "0"),
    uniqueId,
    nickname: uniqueId,
    profilePictureUrl: "",
    followRole: 0, userBadges: [], userSceneTypes: [],
    isModerator: false, isNewGifter: false, isSubscriber: false,
    topGifterRank: 0, gifterLevel: 0, teamMemberLevel: 0,
    msgId: String(Date.now()) + String(Math.floor(Math.random() * 1e6)),
    createTime: String(Date.now()),
    tikfinityUserId: 0, tikfinityUsername: "sim",
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function chat(user, comment) {
  send({ event: "chat", data: { ...flatUser(user), comment, emotes: [], userIdentity: { isAnchor: false } } }, "sim");
}
function like(user, count) {
  send({ event: "like", data: { ...flatUser(user), likeCount: count, totalLikeCount: 0 } }, "sim");
}
function gift(user, name, coins) {
  send({ event: "gift", data: {
    ...flatUser(user), giftId: 5655, giftName: name, giftType: 1,
    diamondCount: coins, giftPictureUrl: "", repeatCount: 1, repeatEnd: true,
  } }, "sim");
}
function member(user) {
  send({ event: "member", data: { ...flatUser(user), actionId: 1 } }, "sim");
}

// ---- auto-play: a synthetic chatroom that reacts like a real one ----
// Reads the game state and picks verbs the café actually needs — waters when
// veg runs low, plates what's ready, serves what's on the pass. A blind
// random mix starves the pantry and deadlocks after a few minutes.
let autoTimer = null;

function pickVerb() {
  const opts = [];
  if (gameState.veg < 4) opts.push("!water", "!water", "!water");
  for (const t of gameState.tickets) {
    if (t.state === "open") {
      for (const s of t.slots) if (s.have < s.need) opts.push("!" + s.verb);
    } else if (t.state === "ready") {
      opts.push("!plate", "!plate");
    } else if (t.state === "pass") {
      // serving requires standing at the counter first
      opts.push("!counter", "!serve", "!serve");
    }
  }
  if (!opts.length) opts.push("!customer", "!kitchen", "!water");
  // ambient flavour: cats, gardening, the odd typo
  opts.push("!pet", "!water", "!chpo");
  return opts[Math.floor(Math.random() * opts.length)];
}

function autoTick() {
  const user = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
  const roll = Math.random();
  if (roll < 0.72) chat(user, pickVerb());
  else if (roll < 0.87) like(user, 1 + Math.floor(Math.random() * 14));
  else if (roll < 0.94) chat(user, "this cafe is so cute omg");
  else if (roll < 0.995) member(user);
  else gift(user, "Rose", 1 + Math.floor(Math.random() * 30));   // ~1 in 200 — freezes were stacking
}

function setAuto(on, btn) {
  if (on && !autoTimer) {
    autoTimer = setInterval(autoTick, 650);
    btn.classList.add("on");
    btn.textContent = "Auto-play: ON";
  } else if (!on && autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    btn.classList.remove("on");
    btn.textContent = "Auto-play";
  }
}

// ---- panel wiring ----

// Live event terminal — every ingested event (live or sim) gets a row.
// Live rows are bold; !commands are highlighted.
let logEl = null;

export function logEvent(msg, source) {
  if (!logEl) logEl = document.getElementById("sim-log");
  if (!logEl) return;
  const { event, data } = msg;
  if (!data) return;

  const who = data.nickname ?? data.uniqueId ?? "?";
  let text;
  switch (event) {
    case "chat":   text = `${who}: ${data.comment}`; break;
    case "gift":   text = `${who} 🎁 ${data.giftName} ×${data.repeatCount ?? 1} (${data.diamondCount ?? 0} coins)`; break;
    case "like":   text = `${who} ♥ ×${data.likeCount ?? 1}`; break;
    case "member": text = `${who} joined.`; break;
    case "follow": text = `${who} followed`; break;
    case "share":  text = `${who} shared the live`; break;
    default: return;                       // skip roomUser/config chatter
  }

  const isCmd = event === "chat" && /^\s*!/.test(data.comment ?? "");
  const row = document.createElement("div");
  row.className = "log-row" + (source === "live" ? " live" : "") + (isCmd ? " cmd" : "");
  const ts = new Date().toLocaleTimeString([], { hour12: false });
  row.textContent = `${ts} ${source === "live" ? "●" : "○"} ${text}`;
  logEl.appendChild(row);
  while (logEl.children.length > 150) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

// TikTok LIVE connection status (from the serve.mjs bridge, not TikFinity).
let tiktokState = "idle";

export function setTikTokState(data) {
  tiktokState = data.state;
  const pill = document.getElementById("sim-conn");
  if (pill) {
    const on = data.state === "connected";
    pill.textContent = on ? `tiktok: @${data.username}` : `tiktok: ${data.state}`;
    pill.className = `pill ${on ? "on" : "off"}`;
  }
  const btn = document.getElementById("tiktok-connect-btn");
  const busy = ["connected", "connecting", "reconnecting"].includes(data.state);
  if (btn) btn.textContent = busy ? "Disconnect" : "Connect";
  const note = document.getElementById("tiktok-note");
  if (note) {
    note.textContent = {
      idle: "Go live on TikTok, then connect your @username",
      connecting: "Connecting…",
      connected: `Connected to @${data.username}'s LIVE — chat runs the café!`,
      reconnecting: "Connection dropped — reconnecting…",
      error: data.error || "Connection failed",
    }[data.state] || "";
  }
}

function wireTikTokConnect() {
  const input = document.getElementById("tiktok-user");
  const btn = document.getElementById("tiktok-connect-btn");
  if (!input || !btn) return;
  input.value = localStorage.getItem("cafe.tiktokUser") || "";
  btn.addEventListener("click", async () => {
    if (["connected", "connecting", "reconnecting"].includes(tiktokState)) {
      try { await fetch("/api/tiktok/disconnect", { method: "POST" }); } catch { /* server gone */ }
      return;
    }
    const username = input.value.trim();
    if (!username) {
      document.getElementById("tiktok-note").textContent = "Enter your TikTok @username";
      return;
    }
    localStorage.setItem("cafe.tiktokUser", username);
    document.getElementById("tiktok-note").textContent = "Connecting…";
    try {
      await fetch("/api/tiktok/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
    } catch {
      document.getElementById("tiktok-note").textContent = "Local server not reachable — run start.bat";
    }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
}

export function initSimulator(ingest) {
  send = ingest;
  wireTikTokConnect();
  const panel = document.getElementById("simulator");
  const input = document.getElementById("sim-input");
  const sendBtn = document.getElementById("sim-send");
  const row = panel.querySelector(".sim-buttons");

  const submit = () => {
    const raw = input.value.trim();
    if (!raw) return;
    const m = raw.match(/^([\w.\-]+)\s*:\s*(.+)$/);
    if (m) { selfUser = m[1]; chat(m[1], m[2]); }
    else chat(selfUser, raw);
    input.value = "";
  };
  sendBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  const buttons = [
    ["3 join",   () => FAKE_USERS.slice(0, 3).forEach((u, i) => setTimeout(() => chat(u, "!kitchen"), i * 150))],
    ["!chop",    () => chat(randUser(), "!chop")],
    ["!fry",     () => chat(randUser(), "!fry")],
    ["!stir",    () => chat(randUser(), "!stir")],
    ["!bake",    () => chat(randUser(), "!bake")],
    ["!plate",   () => chat(randUser(), "!plate")],
    ["!serve",   () => chat(randUser(), "!serve")],
    ["!water",   () => chat(randUser(), "!water")],
    ["!pet",     () => chat(randUser(), "!pet")],
    ["!customer", () => chat(randUser(), "!customer")],
    ["!leave",   () => chat(randUser(), "!leave")],
    ["!animal",  () => chat(randUser(), "!animal")],
    ["!background", () => chat(randUser(), "!background")],
    ["!gender",  () => chat(randUser(), "!gender")],
    ["!skin",    () => chat(randUser(), "!skin")],
    ["!top",     () => chat(randUser(), "!top")],
    ["!lower",   () => chat(randUser(), "!lower")],
    ["!haircolour", () => chat(randUser(), "!haircolour")],
    ["!hairstyle",  () => chat(randUser(), "!hairstyle")],
    ["!ghost",   () => chat(randUser(), "!ghost")],
    ["!alien",   () => chat(randUser(), "!alien")],
    ["!adoptcat", () => chat(randUser(), "!adoptcat")],
    ["!adoptdog", () => chat(randUser(), "!adoptdog")],
    ["Like ×15", () => like(randUser(), 15)],
    ["Gift 5",    () => gift(randUser(), "Rose", 5)],
    ["Gift 50",   () => gift(randUser(), "Doughnut", 50)],
    ["Gift 500",  () => gift(randUser(), "Galaxy", 500)],
    ["Gift 5000", () => gift(randUser(), "Lion", 5000)],
    ["Join",     () => member(randUser())],
    ["Burst",    () => { for (let i = 0; i < 10; i++) setTimeout(autoTick, i * 120); }],
  ];
  for (const [label, fn] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", fn);
    row.appendChild(b);
  }
  const auto = document.createElement("button");
  auto.textContent = "Auto-play";
  auto.addEventListener("click", () => setAuto(!autoTimer, auto));
  row.appendChild(auto);

  const cfg = document.createElement("button");
  cfg.textContent = "⚙ Settings";
  cfg.addEventListener("click", openSettings);
  row.appendChild(cfg);

  // ?auto=1 starts auto-play immediately (headless screenshots, quick demos)
  if (new URLSearchParams(location.search).has("auto")) {
    setAuto(true, auto);
    panel.classList.add("hidden");
  }

  // Dev panel AND settings panel are visible by default; ?dev=0 hides both
  // (clean OBS browser source), ?settings=0 keeps just the settings closed.
  // Backtick toggles the dev panel any time.
  const params = new URLSearchParams(location.search);
  const devOn = params.get("dev") !== "0";
  if (devOn) {
    panel.classList.remove("hidden");
    if (params.get("settings") !== "0") openSettings();
  } else if (params.get("settings") === "1") {
    openSettings();
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "`" && document.activeElement !== input) {
      panel.classList.toggle("hidden");
      e.preventDefault();
    }
  });
}

function randUser() {
  return FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
}
