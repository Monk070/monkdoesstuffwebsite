// puzzle.js - Puzzle generator.
//
// Strategy: pick a random common "seed" word whose length equals the number of
// wheel letters, use its letters as the pool, then choose target words from the
// common words that can be assembled from that pool. Because the pool is a real
// word's letters (a multiset, so doubled letters work), there is always a rich
// set of makeable words.
import { DictionaryService, MAX_WORD_LENGTH } from './dictionaryService.js';

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export class PuzzleGenerator {
    constructor() {
        this.dictionary = DictionaryService.getInstance();
    }

    async generate(level) {
        await this.dictionary.load();

        // Difficulty ramps with level
        const minWordLength = 3;
        const maxWordLength = Math.min(4 + Math.floor(level / 3), MAX_WORD_LENGTH);
        const numTargetWords = Math.min(3 + Math.floor(level / 2), 8);
        const numLetters = Math.min(5 + Math.floor(level / 4), MAX_WORD_LENGTH);

        const puzzle =
            this.generateSeedWordPuzzle(minWordLength, maxWordLength, numTargetWords, numLetters) ||
            this.generateFallbackPuzzle(level);

        return this.validatePuzzle(puzzle, level);
    }

    generateSeedWordPuzzle(minLength, maxLength, targetCount, letterCount) {
        const seeds = this.dictionary.getCommonWordsInLengthRange(letterCount, letterCount);
        if (seeds.length === 0) {
            return null;
        }

        for (let attempts = 0; attempts < 50; attempts++) {
            const seed = seeds[Math.floor(Math.random() * seeds.length)];
            const letters = seed.split('');

            const candidates = this.dictionary.findPossibleCommonWords(letters, minLength)
                .filter(word => word.length <= maxLength);

            // Need enough words to fill the level (minimum of 3)
            if (candidates.length < Math.min(targetCount, 3)) {
                continue;
            }

            const targetWords = this.selectTargetWords(candidates, targetCount);
            return {
                letters: shuffle(letters),
                targetWords
            };
        }

        return null;
    }

    // Pick a mix of word lengths: the longest candidate anchors the crossword,
    // the rest are chosen at random.
    selectTargetWords(candidates, targetCount) {
        const pool = shuffle([...new Set(candidates)]);
        const longest = pool.reduce((a, b) => (b.length > a.length ? b : a));
        const selected = [longest];

        for (const word of pool) {
            if (selected.length >= targetCount) break;
            if (!selected.includes(word)) {
                selected.push(word);
            }
        }

        return selected;
    }

    // Hand-checked letter/word patterns, used if generation fails
    // (e.g. dictionary failed to load and the fallback word set is in use).
    generateFallbackPuzzle(level) {
        const patterns = [
            { letters: ['C', 'A', 'T', 'S', 'E'], words: ['CAT', 'CATS', 'SAT', 'CAST', 'SEAT', 'EAST', 'EATS', 'CASE'] },
            { letters: ['R', 'A', 'T', 'E', 'S'], words: ['RAT', 'RATE', 'EAR', 'EARS', 'TEAR', 'STAR', 'EAST', 'SEAT', 'REST'] },
            { letters: ['B', 'E', 'A', 'R', 'S'], words: ['BAR', 'BARS', 'BEAR', 'EARS', 'BASE', 'BARE'] },
            { letters: ['P', 'A', 'R', 'T', 'S'], words: ['PAR', 'PART', 'TRAP', 'STAR', 'TAPS', 'PAST', 'ARTS', 'RATS'] },
            { letters: ['L', 'I', 'N', 'E', 'S'], words: ['LIE', 'LINE', 'LENS', 'ISLE', 'LIES', 'LINES'] },
            { letters: ['M', 'A', 'K', 'E', 'S'], words: ['MAKE', 'MAKES', 'SAME', 'SAKE', 'MASK', 'SEAM'] },
            { letters: ['H', 'O', 'U', 'S', 'E'], words: ['USE', 'HOUSE', 'HOSE', 'SHOE', 'HUES'] },
            { letters: ['T', 'I', 'M', 'E', 'R'], words: ['TIME', 'TIMER', 'TIRE', 'TIER', 'MITE', 'TERM', 'RITE', 'TRIM'] },
            { letters: ['P', 'L', 'A', 'N', 'E'], words: ['PLAN', 'PLANE', 'LEAN', 'LEAP', 'PANE', 'PALE', 'LANE', 'PEAL'] },
            { letters: ['G', 'R', 'E', 'A', 'T'], words: ['GREAT', 'GATE', 'RATE', 'TEAR', 'GEAR', 'RAGE', 'GRATE'] }
        ];

        const pattern = patterns[level % patterns.length];
        const numWords = Math.min(3 + Math.floor(level / 2), pattern.words.length);

        return {
            letters: shuffle([...pattern.letters]),
            targetWords: pattern.words.slice(0, numWords)
        };
    }

    // Safety net: drop any target word that cannot actually be assembled from
    // the letters; regenerate from a fallback pattern if too few remain.
    validatePuzzle(puzzle, level) {
        const validWords = puzzle.targetWords.filter(word =>
            this.dictionary.canMakeWord(word, puzzle.letters)
        );

        if (validWords.length < 3) {
            console.warn('Puzzle validation failed, using fallback pattern');
            return this.generateFallbackPuzzle(level);
        }

        return {
            letters: puzzle.letters,
            targetWords: validWords
        };
    }
}
