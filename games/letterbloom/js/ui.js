// ui.js - UI Manager with Hint Limit Display and Skip Button
export class UIManager {
    constructor() {
        this.levelElement = document.getElementById('level');
        this.scoreElement = document.getElementById('score');
        this.currentWordElement = document.getElementById('currentWord');
        this.foundWordsListElement = document.getElementById('foundWordsList');
        this.bonusWordsListElement = document.getElementById('bonusWordsList');
        this.loadingElement = document.getElementById('loading');
        this.gameAreaElement = document.getElementById('gameArea');
        this.hintButton = document.getElementById('hintBtn');
        this.skipButton = document.getElementById('skipBtn');
        this.foundCountElement = document.getElementById('foundCount');
        this.targetCountElement = document.getElementById('targetCount');
        
        this.targetWordsFound = 0;
        this.totalTargetWords = 0;
    }

    updateLevel(level) {
        if (this.levelElement) {
            this.levelElement.textContent = level;
        }
    }

    updateScore(score) {
        if (this.scoreElement) {
            this.scoreElement.textContent = score;
        }
    }

    updateHintButton(hintsUsed, maxHints, currentScore) {
        if (this.hintButton) {
            const hintsRemaining = maxHints - hintsUsed;
            
            if (hintsRemaining <= 0) {
                // No hints left
                this.hintButton.style.opacity = '0.5';
                this.hintButton.style.cursor = 'not-allowed';
                this.hintButton.textContent = `No Hints Left`;
                this.hintButton.disabled = true;
            } else if (currentScore < 5) {
                // Not enough points
                this.hintButton.style.opacity = '0.5';
                this.hintButton.style.cursor = 'not-allowed';
                this.hintButton.textContent = `Hint (Need 5pts)`;
                this.hintButton.disabled = true;
            } else {
                // Hints available
                this.hintButton.style.opacity = '1';
                this.hintButton.style.cursor = 'pointer';
                this.hintButton.textContent = `Hint (${hintsRemaining} left)`;
                this.hintButton.disabled = false;
            }
        }
    }
    
    updateSkipButton(currentScore) {
        if (this.skipButton) {
            if (currentScore < 100) {
                // Not enough points
                this.skipButton.style.opacity = '0.5';
                this.skipButton.style.cursor = 'not-allowed';
                this.skipButton.textContent = `Skip (Need 100pts)`;
                this.skipButton.disabled = true;
            } else {
                // Can skip
                this.skipButton.style.opacity = '1';
                this.skipButton.style.cursor = 'pointer';
                this.skipButton.textContent = `Skip Level (-100)`;
                this.skipButton.disabled = false;
            }
        }
    }

    updateCurrentWord(word) {
        if (this.currentWordElement) {
            this.currentWordElement.textContent = word;
        }
    }

    showLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'block';
        }
        if (this.gameAreaElement) {
            this.gameAreaElement.style.display = 'none';
        }
    }

    hideLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
        if (this.gameAreaElement) {
            this.gameAreaElement.style.display = 'grid';
        }
    }

    setTargetWords(targetWords) {
        this.totalTargetWords = targetWords.length;
        this.targetWordsFound = 0;
        this.updateWordCount();
    }

    updateWordCount() {
        if (this.foundCountElement) {
            this.foundCountElement.textContent = this.targetWordsFound;
        }
        if (this.targetCountElement) {
            this.targetCountElement.textContent = this.totalTargetWords;
        }
    }

    addFoundWord(word, isTargetWord = true) {
        const wordDiv = document.createElement('div');
        
        if (isTargetWord) {
            wordDiv.className = 'found-word';
            wordDiv.textContent = word;
            if (this.foundWordsListElement) {
                this.foundWordsListElement.appendChild(wordDiv);
            }
            this.targetWordsFound++;
            this.updateWordCount();
        } else {
            // Bonus word
            wordDiv.className = 'bonus-word';
            wordDiv.textContent = word;
            if (this.bonusWordsListElement) {
                this.bonusWordsListElement.appendChild(wordDiv);
            }
        }
    }

    clearFoundWords() {
        if (this.foundWordsListElement) {
            this.foundWordsListElement.innerHTML = '';
        }
        if (this.bonusWordsListElement) {
            this.bonusWordsListElement.innerHTML = '';
        }
        this.targetWordsFound = 0;
        this.updateWordCount();
    }

    // Styled in-game replacement for window.confirm(). Resolves true/false.
    showConfirm(message, { confirmText = 'Yes', cancelText = 'Cancel' } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-content">
                    <p class="confirm-message"></p>
                    <div class="confirm-buttons">
                        <button class="confirm-yes"></button>
                        <button class="confirm-no"></button>
                    </div>
                </div>
            `;
            overlay.querySelector('.confirm-message').textContent = message;
            const yesBtn = overlay.querySelector('.confirm-yes');
            const noBtn = overlay.querySelector('.confirm-no');
            yesBtn.textContent = confirmText;
            noBtn.textContent = cancelText;

            const close = (result) => {
                document.removeEventListener('keydown', onKeyDown);
                overlay.remove();
                resolve(result);
            };
            const onKeyDown = (e) => {
                if (e.key === 'Escape') close(false);
            };

            yesBtn.addEventListener('click', () => close(true));
            noBtn.addEventListener('click', () => close(false));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(false);
            });
            document.addEventListener('keydown', onKeyDown);

            document.body.appendChild(overlay);
            noBtn.focus();
        });
    }

    showMessage(text) {
        const msg = document.createElement('div');
        msg.className = 'message';
        msg.textContent = text;
        document.body.appendChild(msg);
        
        setTimeout(() => {
            msg.remove();
        }, 2000);
    }

    // Helper method to check if we're using horizontal layout
    isHorizontalLayout() {
        return document.querySelector('.game-area') !== null;
    }
}