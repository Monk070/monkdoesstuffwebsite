// TikTok chat moderation filter. If a song title contains a word viewers
// can't type in TikTok chat, they literally cannot guess it — so those songs
// are dropped from the catalogue at load time (never picked, never suggested).
//
// Matching is on whole normalized words ("ass" hits "Kiss My Ass", not
// "Classic"). Extend the list freely — it's checked at page load, no rebuild.

import { normalize, stripDecorations } from './normalize.js';

const BANNED_WORDS = new Set([
  'sex', 'sexy', 'sexual',
  'bitch', 'bitches',
  'fuck', 'fucking', 'fuckin', 'motherfucker', 'mf',
  'shit',
  'ass', 'asshole',
  'pussy', 'dick', 'cock', 'cunt',
  'whore', 'slut', 'hoe', 'hoes',
  'nigga', 'niggas', 'nigger',
  'porn', 'porno',
  'cocaine', 'heroin', 'meth', 'crack',
  'suicide', 'suicidal',
]);

export function isBannedTitle(title) {
  return normalize(title).split(' ').some(word => BANNED_WORDS.has(word));
}

// A title that IS the skip command collides with the vote syntax: chat.js
// routes "!skip" to the vote path before guessing, so viewers typing the
// answer would be voting to advance the round instead — the song is unwinnable
// from chat. normalize() maps "!" -> "i" ("Skip!" -> "skipi"), so check the
// raw title with symbols stripped as well as the normalized form.
export function collidesWithCommands(title) {
  const raw = (title || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return raw === 'skip' || normalize(stripDecorations(title)) === 'skip';
}
