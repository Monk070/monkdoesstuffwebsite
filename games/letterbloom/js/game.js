// game.js - Central game controller: levels, scoring, word submission
import { AudioManager } from './audio.js';
import { PuzzleGenerator } from './puzzle.js';
import { CrosswordManager } from './crossword.js';
import { LetterCircleManager } from './letterCircle.js';
import { UIManager } from './ui.js';
import { DictionaryService } from './dictionaryService.js';
import { SaveManager } from './saveManager.js';
import { Tutorial } from './tutorial.js';
import { ZoneManager } from './zoneManager.js';

const POINTS_PER_TARGET_LETTER = 10;
const POINTS_PER_BONUS_LETTER = 5;
const HINT_COST = 5;
const SKIP_COST = 100;
const MAX_HINTS_PER_LEVEL = 3;
const FINAL_LEVEL = 100;

export class Game {
    constructor() {
        this.currentLevel = 1;
        this.score = 0;
        this.currentLetters = [];
        this.targetWords = [];
        this.foundTargetWords = [];
        this.foundBonusWords = [];
        this.hintsUsedThisLevel = 0;
        this.maxHintsPerLevel = MAX_HINTS_PER_LEVEL;
        this.isLoading = false;
        this.isGameComplete = false;

        // Lifetime statistics (persisted in the save file)
        this.totalWordsFound = 0;
        this.totalBonusWordsFound = 0;
        this.totalHintsUsed = 0;
        this.totalLevelsCompleted = 0;
        this.totalPlayTime = 0;
        this.sessionStartTime = Date.now();

        this.audioManager = new AudioManager();
        this.puzzleGenerator = new PuzzleGenerator();
        this.crosswordManager = new CrosswordManager();
        this.letterCircleManager = new LetterCircleManager();
        this.uiManager = new UIManager();
        this.dictionary = DictionaryService.getInstance();
        this.saveManager = new SaveManager();
        this.tutorial = new Tutorial(this);
        this.zoneManager = new ZoneManager();

        // The tutorial reaches the game through the global
        window.game = this;
    }

    get foundWords() {
        return [...this.foundTargetWords, ...this.foundBonusWords];
    }

    async init() {
        this.isLoading = true;

        this.zoneManager.init();
        await this.audioManager.init();
        await this.dictionary.load();

        this.setupEventListeners();

        if (this.saveManager.hasSavedGame()) {
            const savedLevel = this.saveManager.loadGame().level;
            this.zoneManager.setZone(this.zoneManager.getZoneForLevel(savedLevel));
            this.showContinueDialog();
        } else {
            this.zoneManager.setZone(1);
            if (this.saveManager.isTutorialComplete()) {
                this.startNewLevel();
            } else {
                this.startTutorial();
            }
        }

        this.saveManager.enableAutoSave(this);
        this.startPlayTimeTracking();

        this.isLoading = false;
    }

    showContinueDialog() {
        const saveData = this.saveManager.loadGame();
        const dialog = document.createElement('div');
        dialog.className = 'continue-dialog';
        dialog.innerHTML = `
            <div class="continue-content">
                <h2>Welcome Back!</h2>
                <p>You have a saved game at Level ${saveData.level}</p>
                <p>Score: ${saveData.score} points</p>
                <div class="continue-buttons">
                    <button id="continueBtn" class="continue-btn">Continue</button>
                    <button id="newGameBtn" class="new-game-btn">New Game</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('continueBtn').addEventListener('click', () => {
            dialog.remove();
            this.loadGame();
        });

        document.getElementById('newGameBtn').addEventListener('click', async () => {
            const confirmed = await this.uiManager.showConfirm(
                'Start a new game? Your saved progress will be lost.',
                { confirmText: 'New Game', cancelText: 'Keep Save' }
            );
            if (!confirmed) {
                return;
            }
            dialog.remove();
            this.saveManager.deleteSave();
            if (this.saveManager.isTutorialComplete()) {
                this.startNewLevel();
            } else {
                this.startTutorial();
            }
        });
    }

    loadGame() {
        const saveData = this.saveManager.loadGame();
        if (!saveData) {
            console.error('No save data found');
            this.startNewLevel();
            return;
        }

        // Older saves may contain lowercase words; normalise on the way in
        this.currentLevel = saveData.level;
        this.score = saveData.score;
        this.currentLetters = saveData.currentLetters.map(letter => letter.toUpperCase());
        this.targetWords = saveData.targetWords.map(word => word.toUpperCase());
        this.foundTargetWords = (saveData.foundTargetWords || []).map(word => word.toUpperCase());
        this.foundBonusWords = (saveData.foundBonusWords || []).map(word => word.toUpperCase());
        this.hintsUsedThisLevel = saveData.hintsUsedThisLevel || 0;

        this.zoneManager.setZone(this.zoneManager.getZoneForLevel(this.currentLevel));

        if (saveData.stats) {
            this.totalWordsFound = saveData.stats.totalWordsFound || 0;
            this.totalBonusWordsFound = saveData.stats.totalBonusWordsFound || 0;
            this.totalHintsUsed = saveData.stats.totalHintsUsed || 0;
            this.totalLevelsCompleted = saveData.stats.totalLevelsCompleted || 0;
            this.totalPlayTime = saveData.stats.totalPlayTime || 0;
        }

        if (saveData.crosswordState) {
            this.saveManager.restoreCrosswordState(this.crosswordManager, saveData.crosswordState);
            this.crosswordManager.render();
        } else {
            this.crosswordManager.createGrid(this.targetWords);
            this.crosswordManager.render();
            this.foundTargetWords.forEach(word => this.crosswordManager.fillWord(word));
        }

        this.letterCircleManager.create(this.currentLetters);
        this.uiManager.updateLevel(this.currentLevel);
        this.uiManager.updateScore(this.score);
        this.uiManager.setTargetWords(this.targetWords);
        this.uiManager.clearFoundWords();
        this.foundTargetWords.forEach(word => this.uiManager.addFoundWord(word, true));
        this.foundBonusWords.forEach(word => this.uiManager.addFoundWord(word, false));
        this.updateActionButtons();
        this.uiManager.hideLoading();
        this.uiManager.showMessage('Game loaded!');
    }

    startTutorial() {
        this.tutorial.onComplete = () => {
            this.saveManager.markTutorialComplete();
            // The tutorial itself starts the first level when it finishes
        };

        this.uiManager.hideLoading();
        setTimeout(() => this.tutorial.start(), 500);
    }

    setupEventListeners() {
        document.getElementById('shuffleBtn').addEventListener('click', () => this.shuffleLetters());
        document.getElementById('hintBtn').addEventListener('click', () => this.giveHint());
        document.getElementById('skipBtn').addEventListener('click', () => this.skipLevel());

        this.letterCircleManager.onWordSelected = (word) => {
            this.uiManager.updateCurrentWord(word);
        };
        this.letterCircleManager.onWordSubmit = (word) => {
            this.handleWordSubmission(word);
        };

        // Ctrl+S: manual save
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveGame();
                this.uiManager.showMessage('Game saved!');
            }
        });
    }

    getGameState() {
        return {
            currentLevel: this.currentLevel,
            score: this.score,
            currentLetters: this.currentLetters,
            targetWords: this.targetWords,
            foundTargetWords: this.foundTargetWords,
            foundBonusWords: this.foundBonusWords,
            hintsUsedThisLevel: this.hintsUsedThisLevel,
            crosswordManager: this.crosswordManager,
            totalWordsFound: this.totalWordsFound,
            totalBonusWordsFound: this.totalBonusWordsFound,
            totalHintsUsed: this.totalHintsUsed,
            totalLevelsCompleted: this.totalLevelsCompleted,
            totalPlayTime: this.getTotalPlayTime()
        };
    }

    saveGame() {
        return this.saveManager.saveGame(this.getGameState());
    }

    startPlayTimeTracking() {
        setInterval(() => {
            this.totalPlayTime += Date.now() - this.sessionStartTime;
            this.sessionStartTime = Date.now();
        }, 60000);
    }

    getTotalPlayTime() {
        return this.totalPlayTime + (Date.now() - this.sessionStartTime);
    }

    async startNewLevel() {
        this.isLoading = true;
        this.uiManager.showLoading();
        this.foundTargetWords = [];
        this.foundBonusWords = [];
        this.hintsUsedThisLevel = 0;
        this.uiManager.clearFoundWords();
        this.updateActionButtons();
        this.setControlsEnabled(true);

        await this.zoneManager.updateZone(this.currentLevel);

        const puzzle = await this.puzzleGenerator.generate(this.currentLevel);
        this.currentLetters = puzzle.letters.map(letter => letter.toUpperCase());
        this.targetWords = puzzle.targetWords.map(word => word.toUpperCase());

        // Words the crossword couldn't fit are dropped from the target list -
        // an invisible word would otherwise block level completion.
        this.crosswordManager.createGrid(this.targetWords);
        const placedWords = this.crosswordManager.placedWords.map(p => p.word);
        if (placedWords.length > 0) {
            this.targetWords = this.targetWords.filter(word => placedWords.includes(word));
        }

        this.uiManager.setTargetWords(this.targetWords);
        this.crosswordManager.render();
        this.letterCircleManager.create(this.currentLetters);
        this.uiManager.updateLevel(this.currentLevel);
        this.uiManager.updateScore(this.score);
        this.uiManager.hideLoading();

        this.saveGame();
        this.isLoading = false;
    }

    handleWordSubmission(word) {
        word = word.toUpperCase();

        if (word.length < 3) {
            this.uiManager.showMessage('Word too short!');
        } else if (this.foundWords.includes(word)) {
            this.uiManager.showMessage('Already found!');
            this.audioManager.playSound('alreadyFound');
        } else if (this.targetWords.includes(word)) {
            this.acceptTargetWord(word);
        } else if (this.dictionary.hasWord(word)) {
            this.acceptBonusWord(word);
        } else {
            this.uiManager.showMessage('Not in word list');
            this.audioManager.playSound('error');
        }

        this.clearSelection();
    }

    acceptTargetWord(word) {
        this.foundTargetWords.push(word);
        this.totalWordsFound++;
        this.uiManager.addFoundWord(word, true);
        this.crosswordManager.fillWord(word);
        this.addScore(word.length * POINTS_PER_TARGET_LETTER);
        this.uiManager.showMessage('Great!');
        this.audioManager.playSound('success');
        this.saveGame();

        if (this.checkLevelComplete()) {
            this.levelComplete();
        }
    }

    acceptBonusWord(word) {
        const points = word.length * POINTS_PER_BONUS_LETTER;
        this.foundBonusWords.push(word);
        this.totalBonusWordsFound++;
        this.uiManager.addFoundWord(word, false);
        this.addScore(points);
        this.uiManager.showMessage(`Bonus! +${points}`);
        this.audioManager.playSound('success');
        this.saveGame();
    }

    addScore(points) {
        this.score = Math.max(0, this.score + points);
        this.uiManager.updateScore(this.score);
        this.updateActionButtons();
    }

    updateActionButtons() {
        this.uiManager.updateHintButton(this.hintsUsedThisLevel, this.maxHintsPerLevel, this.score);
        this.uiManager.updateSkipButton(this.score);
    }

    setControlsEnabled(enabled) {
        for (const id of ['shuffleBtn', 'hintBtn', 'skipBtn']) {
            const button = document.getElementById(id);
            if (button) button.disabled = !enabled;
        }
    }

    checkLevelComplete() {
        return this.targetWords.every(word => this.foundTargetWords.includes(word));
    }

    clearSelection() {
        this.letterCircleManager.clearSelection();
        this.uiManager.updateCurrentWord('');
    }

    shuffleLetters() {
        for (let i = this.currentLetters.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.currentLetters[i], this.currentLetters[j]] = [this.currentLetters[j], this.currentLetters[i]];
        }
        this.letterCircleManager.create(this.currentLetters);
        this.clearSelection();
        this.audioManager.playSound('click');
    }

    giveHint() {
        if (this.hintsUsedThisLevel >= this.maxHintsPerLevel) {
            this.uiManager.showMessage(`No hints left! (${this.maxHintsPerLevel}/${this.maxHintsPerLevel} used)`);
            return;
        }
        if (this.score < HINT_COST) {
            this.uiManager.showMessage(`Not enough points! Need ${HINT_COST} points for a hint.`);
            return;
        }

        if (!this.crosswordManager.findAndRevealRandomLetter()) {
            this.uiManager.showMessage('All letters already revealed!');
            return;
        }

        this.hintsUsedThisLevel++;
        this.totalHintsUsed++;
        this.addScore(-HINT_COST);
        this.uiManager.showMessage(`Hint ${this.hintsUsedThisLevel}/${this.maxHintsPerLevel} used! -${HINT_COST} points`);
        this.audioManager.playSound('click');
        this.saveGame();
        this.checkForCompletedWords();
    }

    skipLevel() {
        if (this.score < SKIP_COST) {
            this.uiManager.showMessage(`Not enough points! Need ${SKIP_COST} points to skip level.`);
            return;
        }

        this.addScore(-SKIP_COST);
        this.uiManager.showMessage(`Revealing all answers... -${SKIP_COST} points`);
        this.revealAllWords();
    }

    revealAllWords() {
        this.setControlsEnabled(false);

        const unfoundWords = this.targetWords.filter(word => !this.foundTargetWords.includes(word));

        const advance = () => {
            this.uiManager.showMessage('Level skipped! Moving to next level...');
            setTimeout(() => this.advanceLevel(), 2000);
        };

        if (unfoundWords.length === 0) {
            advance();
            return;
        }

        unfoundWords.forEach((word, index) => {
            setTimeout(() => {
                this.crosswordManager.fillWord(word);
                this.foundTargetWords.push(word);
                this.uiManager.addFoundWord(word, true);
                this.audioManager.playSound('success');

                if (index === unfoundWords.length - 1) {
                    setTimeout(advance, 500);
                }
            }, index * 400);
        });
    }

    // After a hint, words may have become fully revealed letter by letter
    checkForCompletedWords() {
        for (const word of this.targetWords) {
            if (!this.foundTargetWords.includes(word) && this.crosswordManager.isWordFullyRevealed(word)) {
                this.foundTargetWords.push(word);
                this.totalWordsFound++;
                this.uiManager.addFoundWord(word, true);
            }
        }
        if (this.checkLevelComplete()) {
            this.levelComplete();
        }
    }

    levelComplete() {
        const levelBonus = 50 + (this.currentLevel * 10);
        this.totalLevelsCompleted++;
        this.addScore(levelBonus);

        const isFinalLevel = this.currentLevel >= FINAL_LEVEL;
        const isNewZone = !isFinalLevel && this.zoneManager.isZoneBoundary(this.currentLevel + 1);

        if (isFinalLevel) {
            this.uiManager.showMessage('Final level complete!');
        } else if (isNewZone) {
            const zoneInfo = this.zoneManager.getCurrentZoneInfo();
            this.uiManager.showMessage(`Zone ${zoneInfo.id} Complete! Entering new area...`);
        } else {
            this.uiManager.showMessage(`Level ${this.currentLevel} Complete! +${levelBonus} bonus`);
        }

        this.audioManager.playSound('levelComplete');
        this.saveGame();

        setTimeout(() => this.advanceLevel(), isNewZone ? 3500 : 2500);
    }

    advanceLevel() {
        if (this.currentLevel >= FINAL_LEVEL) {
            this.showGameComplete();
        } else {
            this.currentLevel++;
            this.startNewLevel();
        }
    }

    showGameComplete() {
        this.isGameComplete = true;
        this.saveManager.deleteSave();
        this.audioManager.playSound('levelComplete');

        const overlay = document.createElement('div');
        overlay.className = 'game-complete-overlay';
        overlay.innerHTML = `
            <div class="game-complete-content">
                <h1>🌸 Congratulations! 🌸</h1>
                <h2>You've completed Letter Bloom</h2>
                <p>All ${FINAL_LEVEL} levels, fully bloomed.</p>
                <div class="game-complete-stats">
                    <div>Final score<strong>${this.score}</strong></div>
                    <div>Words found<strong>${this.totalWordsFound}</strong></div>
                    <div>Bonus words<strong>${this.totalBonusWordsFound}</strong></div>
                </div>
                <button id="playAgainBtn" class="play-again-btn">Play Again</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('playAgainBtn').addEventListener('click', () => {
            overlay.remove();
            this.isGameComplete = false;
            this.currentLevel = 1;
            this.score = 0;
            this.startNewLevel();
        });
    }
}
