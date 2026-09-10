// saveManager.js - Save/Load System for Letter Bloom
export class SaveManager {
    constructor() {
        this.SAVE_KEY = 'letterbloom-save';
        this.TUTORIAL_KEY = 'letterbloom-tutorial-complete';
    }

    // Save current game state
    saveGame(gameState) {
        try {
            const saveData = {
                version: '1.0',
                timestamp: Date.now(),
                level: gameState.currentLevel,
                score: gameState.score,
                currentLetters: gameState.currentLetters,
                targetWords: gameState.targetWords,
                foundTargetWords: gameState.foundTargetWords,
                foundBonusWords: gameState.foundBonusWords,
                hintsUsedThisLevel: gameState.hintsUsedThisLevel,
                crosswordState: this.serializeCrosswordState(gameState.crosswordManager),
                stats: {
                    totalWordsFound: gameState.totalWordsFound || 0,
                    totalBonusWordsFound: gameState.totalBonusWordsFound || 0,
                    totalHintsUsed: gameState.totalHintsUsed || 0,
                    totalLevelsCompleted: gameState.totalLevelsCompleted || 0,
                    totalPlayTime: gameState.totalPlayTime || 0,
                    lastPlayed: Date.now()
                }
            };
            
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
            return true;
        } catch (error) {
            console.error('Failed to save game:', error);
            return false;
        }
    }

    // Load saved game state
    loadGame() {
        try {
            const savedData = localStorage.getItem(this.SAVE_KEY);
            if (!savedData) return null;
            
            const saveData = JSON.parse(savedData);
            
            // Validate save data
            if (!this.isValidSaveData(saveData)) {
                console.warn('Invalid save data found, ignoring');
                return null;
            }
            
            return saveData;
        } catch (error) {
            console.error('Failed to load game:', error);
            return null;
        }
    }

    // Check if there's a saved game
    hasSavedGame() {
        return localStorage.getItem(this.SAVE_KEY) !== null;
    }

    // Delete saved game
    deleteSave() {
        try {
            localStorage.removeItem(this.SAVE_KEY);
            return true;
        } catch (error) {
            console.error('Failed to delete save:', error);
            return false;
        }
    }

    // Serialize crossword state for saving
    serializeCrosswordState(crosswordManager) {
        if (!crosswordManager || !crosswordManager.grid) return null;
        
        const gridState = [];
        for (let row = 0; row < crosswordManager.gridSize; row++) {
            for (let col = 0; col < crosswordManager.gridSize; col++) {
                if (crosswordManager.grid[row][col]) {
                    gridState.push({
                        row,
                        col,
                        cell: crosswordManager.grid[row][col]
                    });
                }
            }
        }
        
        return {
            gridState,
            placedWords: crosswordManager.placedWords,
            gridSize: crosswordManager.gridSize
        };
    }

    // Restore crossword state from save
    restoreCrosswordState(crosswordManager, savedState) {
        if (!savedState || !crosswordManager) return;
        
        // Initialize grid
        crosswordManager.gridSize = savedState.gridSize || 15;
        crosswordManager.grid = Array(crosswordManager.gridSize).fill(null)
            .map(() => Array(crosswordManager.gridSize).fill(null));
        
        // Restore grid cells
        if (savedState.gridState) {
            savedState.gridState.forEach(item => {
                if (item.row < crosswordManager.gridSize && item.col < crosswordManager.gridSize) {
                    crosswordManager.grid[item.row][item.col] = item.cell;
                }
            });
        }
        
        // Restore placed words
        crosswordManager.placedWords = savedState.placedWords || [];
    }

    // Validate save data structure
    isValidSaveData(saveData) {
        if (!saveData) return false;
        
        // Check required fields
        const requiredFields = ['version', 'timestamp', 'level', 'score', 'currentLetters', 'targetWords'];
        for (const field of requiredFields) {
            if (!(field in saveData)) {
                return false;
            }
        }
        
        // Check data types
        if (!Array.isArray(saveData.currentLetters) || !Array.isArray(saveData.targetWords)) {
            return false;
        }
        
        // Check if save is not too old (30 days)
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - saveData.timestamp > thirtyDaysInMs) {
            console.warn('Save data is older than 30 days');
            // You might still want to load it, just warning
        }
        
        return true;
    }

    // Auto-save functionality
    enableAutoSave(game, intervalMs = 30000) { // Auto-save every 30 seconds
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        const canSave = () => game && !game.isLoading && !game.isGameComplete;

        this.autoSaveInterval = setInterval(() => {
            if (canSave()) {
                this.saveGame(game.getGameState());
            }
        }, intervalMs);

        // Also save on important events
        window.addEventListener('beforeunload', () => {
            if (canSave()) {
                this.saveGame(game.getGameState());
            }
        });

        // Save on visibility change (mobile background)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && canSave()) {
                this.saveGame(game.getGameState());
            }
        });
    }

    // Disable auto-save
    disableAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    // Tutorial completion tracking
    isTutorialComplete() {
        return localStorage.getItem(this.TUTORIAL_KEY) === 'true';
    }

    markTutorialComplete() {
        localStorage.setItem(this.TUTORIAL_KEY, 'true');
    }

    resetTutorial() {
        localStorage.removeItem(this.TUTORIAL_KEY);
    }

    // Get game statistics
    getGameStats() {
        const saveData = this.loadGame();
        if (!saveData || !saveData.stats) {
            return {
                totalWordsFound: 0,
                totalBonusWordsFound: 0,
                totalHintsUsed: 0,
                totalLevelsCompleted: 0,
                totalPlayTime: 0,
                lastPlayed: null
            };
        }
        return saveData.stats;
    }

    // Export save data (for backup)
    exportSave() {
        const saveData = this.loadGame();
        if (!saveData) return null;
        
        const exportData = {
            ...saveData,
            exported: Date.now(),
            exportVersion: '1.0'
        };
        
        return btoa(JSON.stringify(exportData));
    }

    // Import save data
    importSave(encodedData) {
        try {
            const decodedData = JSON.parse(atob(encodedData));
            
            if (!this.isValidSaveData(decodedData)) {
                throw new Error('Invalid save data');
            }
            
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(decodedData));
            return true;
        } catch (error) {
            console.error('Failed to import save:', error);
            return false;
        }
    }
}