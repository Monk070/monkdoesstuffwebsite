// Auto-test: a synthetic chatroom for dress rehearsals. Ten fake viewers with
// avatars guess through the normal ingest path — wrong guesses pulled from the
// real catalogue, occasional !skip votes, and a stage-scaled chance of the
// correct answer so rounds resolve at varied clip lengths (some are lost).
// Endless mode only. The bots never press NEXT SONG — advancing rounds is
// always the streamer's call, exactly like a live session.

import { allTracks } from './catalog.js';

const USERS = [
  { id: 'sim_mia', name: 'Mia', pfp: 'assets/avatars/a1.png' },
  { id: 'sim_pickles', name: 'Pickles', pfp: 'assets/avatars/a2.png' },
  { id: 'sim_joeyd', name: 'JoeyD', pfp: 'assets/avatars/a3.png' },
  { id: 'sim_lunastar', name: 'LunaStar', pfp: 'assets/avatars/a4.png' },
  { id: 'sim_baz', name: 'Baz', pfp: 'assets/avatars/a5.png' },
  { id: 'sim_kittykat', name: 'KittyKat', pfp: 'assets/avatars/a6.png' },
  { id: 'sim_sam7', name: 'Sam_7', pfp: 'assets/avatars/a7.png' },
  { id: 'sim_roxie', name: 'Roxie', pfp: 'assets/avatars/a8.png' },
  { id: 'sim_tommygun', name: 'TommyGun', pfp: 'assets/avatars/a9.png' },
  { id: 'sim_peach', name: 'Peach', pfp: 'assets/avatars/a10.png' },
];

const TICK_MS = 1800;
const SKIP_CHANCE = 0.18;
const GIFT_CHANCE = 0.05; // dress-rehearse the !bank / wheel-spin features
const GIFT_COINS = [1, 5, 10, 99, 199];
const CORRECT_CHANCE = [0.03, 0.06, 0.12, 0.25, 0.5]; // per tick, by stage (clamped)
const FAKE_VIEWER_COUNT = 12; // -> !skip needs 3 votes

let timer = null;

export function isAutoTestRunning() {
  return !!timer;
}

export function startAutoTest({ ingest, getRound }) {
  if (timer) return;
  ingest({ event: 'roomUser', data: { viewerCount: FAKE_VIEWER_COUNT } }, 'sim');

  // bots count as followers so the follow-to-play gate can stay on in tests
  const say = (u, comment) => ingest({
    event: 'chat',
    data: { uniqueId: u.id, nickname: u.name, profilePictureUrl: u.pfp, comment, follows: 1 },
  }, 'sim');

  timer = setInterval(() => {
    const round = getRound();
    const u = USERS[(Math.random() * USERS.length) | 0];

    if (Math.random() < 0.25) { // like taps flow constantly on a real live
      ingest({
        event: 'like',
        data: { uniqueId: u.id, nickname: u.name, profilePictureUrl: u.pfp, count: 1 + ((Math.random() * 14) | 0) },
      }, 'sim');
      return;
    }

    if (Math.random() < GIFT_CHANCE) {
      const coins = GIFT_COINS[(Math.random() * GIFT_COINS.length) | 0];
      ingest({
        event: 'gift',
        data: { uniqueId: u.id, nickname: u.name, profilePictureUrl: u.pfp, giftName: 'Rose', diamonds: coins, repeat: 1, total: coins },
      }, 'sim');
      return;
    }

    if (!round || round.status !== 'playing') return; // reveal up — wait for the streamer

    const roll = Math.random();
    if (roll < SKIP_CHANCE) {
      say(u, '!skip');
      return;
    }
    const correctChance = CORRECT_CHANCE[Math.min(round.stage, CORRECT_CHANCE.length - 1)];
    if (roll < SKIP_CHANCE + correctChance) {
      const t = round.track;
      say(u, '!' + (Math.random() < 0.4 ? `${t.t} ${t.a}` : t.t));
      return;
    }
    // wrong guess: a real title from the catalogue, never the answer
    const pool = allTracks();
    if (pool.length < 2) return;
    const wrong = pool[(Math.random() * pool.length) | 0];
    if (wrong.key === round.track.key) return;
    say(u, '!' + wrong.t);
  }, TICK_MS);
}

export function stopAutoTest() {
  if (timer) clearInterval(timer);
  timer = null;
}
