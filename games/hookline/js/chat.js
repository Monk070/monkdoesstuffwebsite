// TikTok chat controller. One handleEvent() ingest path (live TikFinity or
// simulator), mirroring the TiktokCafe wiring.
//
//   !<anything>  -> a guess at the current track (fuzzy, title-only OK)
//   !skip        -> vote to unlock the next clip length; passes when 25% of
//                   the current viewer count has voted. No effect at 15s.
//
// Viewer count comes from TikFinity's roomUser events. Before the first one
// arrives (or when testing), we fall back to the number of distinct chatters
// seen this round, so a solo test with one sim user still works (1 vote passes).

import { guessMatches } from './chatmatch.js';
import { parseSettingCommands } from './chatcommands.js';

const SKIP_RE = /^!\s*skip\s*$/i;
const DEFAULT_SKIP_RATIO = 0.25;
const GUESS_COOLDOWN_MS = 1500;

export class ChatController {
  constructor(hooks) {
    // hooks: getRound(), onGuess(name, text, correct), onSkipVote(votes, needed),
    //        onSkipPass(), onViewers(count)
    this.hooks = hooks;
    this.viewerCount = 0;
    this.skipVotes = new Set();
    this.cooldowns = new Map();
    this.roundChatters = new Set();
    this.blockNags = new Map(); // follow-to-play: last "follow to play!" nag per viewer
  }

  resetRound() {
    this.skipVotes.clear();
    this.roundChatters.clear();
  }

  resetStage() {
    this.skipVotes.clear();
  }

  skipThreshold() {
    const base = this.viewerCount || this.roundChatters.size || 1;
    const ratio = this.hooks.getSkipRatio ? this.hooks.getSkipRatio() : DEFAULT_SKIP_RATIO;
    return Math.max(1, Math.ceil(base * ratio)); // 0% -> any single vote passes
  }

  handleEvent(msg) {
    if (!msg || !msg.data) return;

    if (msg.event === 'roomUser') {
      if (typeof msg.data.viewerCount === 'number') {
        this.viewerCount = msg.data.viewerCount;
        this.hooks.onViewers?.(this.viewerCount);
      }
      return;
    }
    if (msg.event === 'gift') {
      const { uniqueId, nickname, profilePictureUrl, total, giftName } = msg.data;
      if (!uniqueId || !(total > 0)) return;
      this.hooks.onGift?.(shortName(nickname || uniqueId), uniqueId, profilePictureUrl || '', total, giftName || '');
      return;
    }
    if (msg.event === 'like') {
      const { uniqueId, nickname, profilePictureUrl, count } = msg.data;
      if (!uniqueId || !(count > 0)) return;
      this.hooks.onLike?.(shortName(nickname || uniqueId), uniqueId, profilePictureUrl || '', count);
      return;
    }
    if (msg.event !== 'chat') return;

    const { uniqueId, nickname, comment, profilePictureUrl } = msg.data;
    if (!uniqueId || !comment) return;
    const text = comment.trim();
    if (!text.startsWith('!')) return; // plain chatter, not for us

    const name = shortName(nickname || uniqueId);
    const dev = this.hooks.isDev?.(uniqueId) === true;

    // secret dev cue: arms the honeypot round. Only the dev account — for
    // anyone else "!monk" just falls through as an ordinary (wrong) guess.
    if (dev && /^!\s*monk\s*$/i.test(text)) {
      this.hooks.onDevCue?.();
      return;
    }

    // dev fanfare: "Monk is here!" overlay + The Game Dev plays
    if (dev && /^!\s*gamedev\s*$/i.test(text)) {
      this.hooks.onDevParty?.(nickname || name, profilePictureUrl || '');
      return;
    }

    // "!points" (or !pts / !score / !balance) — show the viewer their balance
    if (/^!\s*(points?|pts|score|balance)\b/i.test(text)) {
      const now = Date.now();
      if (now - (this.cooldowns.get(uniqueId) || 0) < GUESS_COOLDOWN_MS) return;
      this.cooldowns.set(uniqueId, now);
      this.hooks.onPoints?.(name, uniqueId);
      return;
    }

    // "!bank" — the gift-funded balance on its own
    if (/^!\s*bank(ed)?\b/i.test(text)) {
      const now = Date.now();
      if (now - (this.cooldowns.get(uniqueId) || 0) < GUESS_COOLDOWN_MS) return;
      this.cooldowns.set(uniqueId, now);
      this.hooks.onBank?.(name, uniqueId);
      return;
    }

    // Follow-to-play: balance checks above always answer, but guessing,
    // skipping and purchases need a follow when the streamer turned it on.
    if (!dev && this.hooks.canPlay && !this.hooks.canPlay(uniqueId)) {
      const now = Date.now();
      if (now - (this.blockNags.get(uniqueId) || 0) > 20000) {
        this.blockNags.set(uniqueId, now);
        this.hooks.onBlocked?.(name, uniqueId);
      }
      return;
    }

    // settings purchases (!genre pop / !era 90s, or both in one comment)
    // work any time — they cost points and apply from the next song.
    const changes = parseSettingCommands(text);
    if (changes) {
      if (dev) {
        // dev sets genre/era free of charge, no cooldown
        if (changes.length) this.hooks.onDevSettings?.(changes, name);
        return;
      }
      const now = Date.now();
      if (now - (this.cooldowns.get(uniqueId) || 0) < GUESS_COOLDOWN_MS) return;
      this.cooldowns.set(uniqueId, now);
      if (changes.length) this.hooks.onSettings?.(changes, name, uniqueId);
      return; // settings-shaped comments never fall through to guessing
    }

    const round = this.hooks.getRound?.();
    if (!round || round.status !== 'playing') return;

    this.roundChatters.add(uniqueId);

    if (SKIP_RE.test(text)) {
      if (dev) {
        // dev skip bypasses the vote entirely
        this.resetStage();
        this.hooks.onDevSkip?.();
        return;
      }
      this.skipVotes.add(uniqueId);
      const votes = this.skipVotes.size;
      const needed = this.skipThreshold();
      this.hooks.onSkipVote?.(votes, needed);
      if (votes >= needed) {
        this.resetStage();
        this.hooks.onSkipPass?.();
      }
      return;
    }

    // guess — per-user cooldown so one fast typer can't flood the feed
    const now = Date.now();
    if (now - (this.cooldowns.get(uniqueId) || 0) < GUESS_COOLDOWN_MS) return;
    this.cooldowns.set(uniqueId, now);

    const guessText = text.slice(1).trim();
    if (guessText.length < 2) return;
    const correct = guessMatches(guessText, round.track);
    this.hooks.onGuess?.(name, guessText, correct, uniqueId, profilePictureUrl || '');
  }
}

function shortName(n) {
  return n.length > 18 ? n.slice(0, 17) + '…' : n;
}
