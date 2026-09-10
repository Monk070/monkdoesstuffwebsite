// tutorial.js - Interactive Tutorial for Letter Bloom (Fixed Positioning)
export class Tutorial {
    constructor(game) {
        this.game = game;
        this.currentStep = 0;
        this.isActive = false;
        this.tutorialLetters = ['T', 'H', 'E', 'R'];
        this.tutorialWords = ['THE', 'HER'];
        this.onComplete = null;
        this.overlay = null;
        this.spotlight = null;
        this.wordCheckInterval = null;
    }

    async start() {
        this.isActive = true;
        this.currentStep = 0;
        
        // Create tutorial overlay
        this.createOverlay();
        
        // Start tutorial sequence
        await this.runTutorialSequence();
    }

    createOverlay() {
        // Create overlay container
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';
        this.overlay.innerHTML = `
            <div class="tutorial-backdrop"></div>
            <svg class="tutorial-mask"><path class="tutorial-mask-path" fill-rule="evenodd"></path></svg>
            <div class="tutorial-spotlight"></div>
            <div class="tutorial-content">
                <div class="tutorial-message"></div>
                <div class="tutorial-buttons">
                    <button class="tutorial-skip">Skip Tutorial</button>
                    <button class="tutorial-next">Next</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);
        
        // Add tutorial styles if not already present
        if (!document.getElementById('tutorial-styles')) {
            const style = document.createElement('style');
            style.id = 'tutorial-styles';
            style.textContent = `
                .tutorial-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 99999;
                    pointer-events: none;
                    animation: fadeIn 0.5s ease;
                }
                
                .tutorial-backdrop {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    pointer-events: all;
                    transition: all 0.5s ease;
                    z-index: 99999;
                }
                
                .tutorial-backdrop.pass-through {
                    pointer-events: none !important;
                }
                
                /* Dark layer with rounded holes punched out for spotlights */
                .tutorial-mask {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    display: none;
                }

                .tutorial-mask-path {
                    fill: rgba(0, 0, 0, 0.7);
                }

                .tutorial-overlay.spotlight-active .tutorial-backdrop {
                    display: none;
                }

                .tutorial-overlay.spotlight-active .tutorial-mask {
                    display: block;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .tutorial-spotlight {
                    position: absolute;
                    border: 3px solid #ffd700;
                    border-radius: 15px;
                    box-shadow: 0 0 40px rgba(255, 215, 0, 0.6),
                                inset 0 0 20px rgba(255, 215, 0, 0.2);
                    pointer-events: none;
                    transition: all 0.5s ease;
                    display: none;
                    z-index: 100000;
                }
                
                .tutorial-spotlight.active {
                    display: block;
                    animation: pulse-glow 2s ease-in-out infinite;
                }
                
                .tutorial-spotlight-hole {
                    position: absolute;
                    background: transparent;
                    pointer-events: all;
                }
                
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.6); }
                    50% { box-shadow: 0 0 60px rgba(255, 215, 0, 0.8); }
                }
                
                .tutorial-content {
                    position: absolute;
                    max-width: 450px;
                    padding: 25px;
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 240, 255, 0.98));
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4),
                                0 0 0 1px rgba(255, 215, 0, 0.3);
                    /* Positioning offsets live in CSS variables so the entrance
                       animation can include them - a plain transform in the
                       keyframes would override the centering and make the box
                       jump when the animation ends. */
                    --tx: 0px;
                    --ty: 0px;
                    transform: translate(var(--tx), var(--ty));
                    animation: slideUp 0.5s ease;
                    pointer-events: all;
                    z-index: 100001;
                }

                .tutorial-content.position-top {
                    top: 120px;
                    left: 50%;
                    --tx: -50%;
                }

                .tutorial-content.position-bottom {
                    bottom: 20px;
                    left: 50%;
                    --tx: -50%;
                }

                .tutorial-content.position-left {
                    top: 50%;
                    left: 20px;
                    --ty: -50%;
                }

                .tutorial-content.position-right {
                    top: 50%;
                    right: 20px;
                    --ty: -50%;
                }

                .tutorial-content.position-center {
                    top: 50%;
                    left: 50%;
                    --tx: -50%;
                    --ty: -50%;
                }

                .tutorial-content.position-beside-crossword {
                    top: 180px;
                    left: calc(50% - 100px);
                    max-width: 400px;
                }

                @keyframes slideUp {
                    from {
                        transform: translate(var(--tx), calc(var(--ty) + 30px));
                        opacity: 0;
                    }
                    to {
                        transform: translate(var(--tx), var(--ty));
                        opacity: 1;
                    }
                }
                
                .tutorial-message {
                    font-size: 1.05em;
                    line-height: 1.6;
                    color: #333;
                    margin-bottom: 20px;
                    min-height: 80px;
                }
                
                .tutorial-message h2 {
                    color: #764ba2;
                    margin-bottom: 12px;
                    font-size: 1.3em;
                }
                
                .tutorial-message .highlight {
                    color: #f5576c;
                    font-weight: bold;
                }
                
                .tutorial-message .word-example {
                    display: inline-block;
                    padding: 3px 10px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border-radius: 12px;
                    font-weight: bold;
                    margin: 0 2px;
                    font-size: 0.95em;
                }
                
                .tutorial-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                
                .tutorial-buttons button {
                    padding: 8px 18px;
                    border: none;
                    border-radius: 20px;
                    font-size: 0.95em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                
                .tutorial-skip {
                    background: rgba(0, 0, 0, 0.1);
                    color: #666;
                }
                
                .tutorial-skip:hover {
                    background: rgba(0, 0, 0, 0.2);
                }
                
                .tutorial-next {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                }
                
                .tutorial-next:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
                }
                
                .tutorial-next:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }
                
                /* Demo grid for showing overlapping words */
                .tutorial-demo-grid {
                    display: inline-block;
                    margin: 15px auto;
                    padding: 12px;
                    background: rgba(102, 126, 234, 0.1);
                    border-radius: 12px;
                    text-align: center;
                }
                
                .tutorial-demo-row {
                    display: flex;
                    justify-content: center;
                }
                
                .tutorial-demo-cell {
                    width: 36px;
                    height: 36px;
                    border: 2px solid rgba(102, 126, 234, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1em;
                    font-weight: bold;
                    margin: 2px;
                    border-radius: 6px;
                    background: white;
                    transition: all 0.3s ease;
                }
                
                .tutorial-demo-cell.filled {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border-color: transparent;
                    animation: popIn 0.5s ease;
                }
                
                .tutorial-demo-cell.overlap {
                    background: linear-gradient(135deg, #f093fb, #f5576c);
                    animation: popIn 0.5s ease, glow 2s ease-in-out infinite;
                }
                
                @keyframes popIn {
                    0% { transform: scale(0) rotate(180deg); }
                    50% { transform: scale(1.2) rotate(90deg); }
                    100% { transform: scale(1) rotate(0); }
                }
                
                @keyframes glow {
                    0%, 100% { box-shadow: 0 0 10px rgba(240, 147, 251, 0.5); }
                    50% { box-shadow: 0 0 20px rgba(240, 147, 251, 0.8); }
                }
                
                .tutorial-arrow {
                    display: inline-block;
                    margin: 0 10px;
                    color: #764ba2;
                    font-size: 1.5em;
                    animation: bounce 1s ease-in-out infinite;
                }
                
                @keyframes bounce {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(5px); }
                }
                
                /* Mobile responsive */
                @media (max-width: 768px) {
                    .tutorial-content {
                        max-width: 90%;
                        padding: 20px;
                        margin: 10px;
                    }
                    
                    .tutorial-content.position-top {
                        top: 60px;
                    }
                    
                    .tutorial-content.position-bottom {
                        bottom: 10px;
                    }
                    
                    .tutorial-content.position-left,
                    .tutorial-content.position-right,
                    .tutorial-content.position-beside-crossword {
                        left: 50%;
                        right: auto;
                        transform: translate(-50%, -50%);
                        top: 50%;
                    }
                    
                    .tutorial-message {
                        font-size: 0.95em;
                    }
                    
                    .tutorial-demo-cell {
                        width: 32px;
                        height: 32px;
                        font-size: 1em;
                    }
                }
                
                /* Arrow pointing to element */
                .tutorial-arrow-pointer {
                    position: absolute;
                    width: 0;
                    height: 0;
                    border-style: solid;
                    z-index: 10000;
                }
                
                .tutorial-arrow-pointer.arrow-down {
                    border-width: 15px 15px 0 15px;
                    border-color: rgba(255, 255, 255, 0.98) transparent transparent transparent;
                    bottom: -15px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                
                .tutorial-arrow-pointer.arrow-up {
                    border-width: 0 15px 15px 15px;
                    border-color: transparent transparent rgba(255, 255, 255, 0.98) transparent;
                    top: -15px;
                    left: 50%;
                    transform: translateX(-50%);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Setup button handlers
        this.spotlight = this.overlay.querySelector('.tutorial-spotlight');
        this.backdrop = this.overlay.querySelector('.tutorial-backdrop');
        this.content = this.overlay.querySelector('.tutorial-content');
        
        const skipBtn = this.overlay.querySelector('.tutorial-skip');
        const nextBtn = this.overlay.querySelector('.tutorial-next');
        
        skipBtn.addEventListener('click', () => this.skip());
        nextBtn.addEventListener('click', () => this.nextStep());
    }

    async runTutorialSequence() {
        const steps = [
            // Step 1: Welcome (top of screen)
            {
                message: `
                    <h2>🌸 Welcome to Letter Bloom!</h2>
                    <p>Let's learn how to play with a quick tutorial.</p>
                    <p>You'll discover the <span class="highlight">secret</span> to mastering this game!</p>
                `,
                spotlight: null,
                position: 'top',
                blockInteraction: true
            },
            
            // Step 2: Show letter wheel AND crossword
            {
                message: `
                    <h2>🎯 The Letter Wheel</h2>
                    <p>Drag your finger (or mouse) across letters below to form words.</p>
                    <p>Let's try making the word <span class="word-example">THE</span></p>
                    <p>Watch how it appears in the crossword above!</p>
                `,
                spotlight: '.letter-circle-container',
                additionalSpotlight: '.crossword-container',
                position: 'bottom',
                action: () => this.setupTutorialPuzzle(),
                blockInteraction: false,
                waitForWord: 'THE'
            },
            
            // Step 3: Make second word with crossword still highlighted
            {
                message: `
                    <h2>✨ Great! You found THE!</h2>
                    <p>Now try to find <span class="word-example">HER</span></p>
                    <p>Watch how it connects with THE in the crossword!</p>
                `,
                spotlight: '.letter-circle-container', 
                additionalSpotlight: '.crossword-container',
                position: 'bottom',
                waitForWord: 'HER',
                blockInteraction: false
            },
            
            // Step 4: The big reveal - crossing words share letters!
            {
                message: `
                    <h2>🔗 Words Cross and Share Letters!</h2>
                    <p>Look at the crossword - <span class="word-example">THE</span> and <span class="word-example">HER</span> cross at the letter H!</p>
                    <div class="tutorial-demo-grid">
                        <div class="tutorial-demo-row">
                            <div class="tutorial-demo-cell filled">T</div>
                            <div class="tutorial-demo-cell overlap">H</div>
                            <div class="tutorial-demo-cell filled">E</div>
                        </div>
                        <div class="tutorial-demo-row">
                            <div class="tutorial-demo-cell" style="visibility: hidden;"></div>
                            <div class="tutorial-demo-cell filled">E</div>
                            <div class="tutorial-demo-cell" style="visibility: hidden;"></div>
                        </div>
                        <div class="tutorial-demo-row">
                            <div class="tutorial-demo-cell" style="visibility: hidden;"></div>
                            <div class="tutorial-demo-cell filled">R</div>
                            <div class="tutorial-demo-cell" style="visibility: hidden;"></div>
                        </div>
                    </div>
                    <p>The <span class="highlight">pink letter</span> belongs to both words at once!</p>
                `,
                spotlight: '.crossword-container',
                position: 'beside-crossword',
                action: () => this.animateOverlap(),
                blockInteraction: true
            },

            // Step 5: Why this matters (center)
            {
                message: `
                    <h2>💡 Why This Matters</h2>
                    <p>Shared letters are free progress: solving one word fills in its letter for every word that <span class="highlight">crosses</span> it.</p>
                    <p>Stuck? Use the letters already revealed at the crossings as clues!</p>
                `,
                spotlight: null,
                position: 'center',
                blockInteraction: true
            },
            
            // Step 6: Other features (position at top)
            {
                message: `
                    <h2>🎮 Quick Tips</h2>
                    <p>• <strong>Shuffle:</strong> Rearrange letters for a fresh view</p>
                    <p>• <strong>Hints:</strong> Reveal a letter (costs 5 points, max 3 per level)</p>
                    <p>• <strong>Bonus Words:</strong> Extra words give you 5 points per letter!</p>
                    <p>• <strong>Music:</strong> Relaxing background music with full controls</p>
                `,
                spotlight: '.controls',
                position: 'top',
                blockInteraction: false
            },
            
            // Step 7: Ready to play (center)
            {
                message: `
                    <h2>🚀 You're Ready!</h2>
                    <p>Remember: Look for <span class="highlight">overlapping words</span> when you get stuck!</p>
                    <p>Good luck and have fun creating beautiful word gardens! 🌺</p>
                `,
                spotlight: null,
                position: 'center',
                blockInteraction: true,
                isLast: true
            }
        ];
        
        this.steps = steps;
        this.showStep(0);
    }

    showStep(stepIndex) {
        if (stepIndex >= this.steps.length) {
            this.complete();
            return;
        }
        
        const step = this.steps[stepIndex];
        this.currentStep = stepIndex;
        
        // Clear any existing word check interval
        if (this.wordCheckInterval) {
            clearInterval(this.wordCheckInterval);
            this.wordCheckInterval = null;
        }
        
        // Update message
        const messageEl = this.overlay.querySelector('.tutorial-message');
        messageEl.innerHTML = step.message;
        
        // Update content position
        this.content.className = 'tutorial-content position-' + (step.position || 'center');
        
        // Update backdrop interaction
        if (step.blockInteraction) {
            this.backdrop.classList.remove('pass-through');
            this.overlay.style.pointerEvents = 'all';
        } else {
            this.backdrop.classList.add('pass-through');
            this.overlay.style.pointerEvents = 'none';
            // Keep tutorial content clickable
            this.content.style.pointerEvents = 'all';
        }
        
        // Update spotlight - handle multiple spotlights
        if (step.spotlight) {
            this.spotlightElement(step.spotlight);
            // If there's an additional spotlight (like crossword), highlight it too
            if (step.additionalSpotlight) {
                // We'll modify spotlightElement to handle multiple areas
                this.addAdditionalSpotlight(step.additionalSpotlight);
            }
        } else {
            this.hideSpotlight();
        }
        
        // Execute action if any
        if (step.action) {
            step.action();
        }
        
        // Update button text
        const nextBtn = this.overlay.querySelector('.tutorial-next');
        if (step.isLast) {
            nextBtn.textContent = 'Start Playing!';
            nextBtn.disabled = false;
        } else if (step.waitForWord) {
            nextBtn.textContent = 'Waiting...';
            nextBtn.disabled = true;
            // Advance as soon as the word is found
            this.waitForWord(step.waitForWord, () => this.nextStep());
        } else {
            nextBtn.textContent = 'Next';
            nextBtn.disabled = false;
        }
    }

    nextStep() {
        this.showStep(this.currentStep + 1);
    }

    async skip() {
        const confirmed = await this.game.uiManager.showConfirm(
            'Skip the tutorial? You can always see it again from the help menu.',
            { confirmText: 'Skip Tutorial', cancelText: 'Keep Going' }
        );
        if (confirmed) {
            this.complete();
        }
    }

    complete() {
        this.isActive = false;
        
        // Clear any intervals
        if (this.wordCheckInterval) {
            clearInterval(this.wordCheckInterval);
            this.wordCheckInterval = null;
        }
        
        // Restore original word submission handler if we modified it
        if (this.originalHandleSubmission) {
            this.game.handleWordSubmission = this.originalHandleSubmission;
        }
        
        // Remove overlay
        if (this.overlay) {
            this.overlay.style.animation = 'fadeOut 0.5s ease';
            setTimeout(() => {
                this.overlay.remove();
                this.overlay = null;
            }, 500);
        }
        
        // Mark tutorial as complete
        if (this.onComplete) {
            this.onComplete();
        }
        
        // Start real game
        this.game.startNewLevel();
    }

    setupTutorialPuzzle() {
        // Set up the tutorial puzzle with T, H, E, R
        this.game.currentLetters = this.tutorialLetters;
        this.game.targetWords = this.tutorialWords;
        this.game.foundTargetWords = [];
        this.game.foundBonusWords = [];
        
        // Hand-build a tutorial crossword: THE across and HER down,
        // crossing at the shared letter H (a normal crossword crossing).
        this.game.crosswordManager.grid = Array(15).fill(null).map(() => Array(15).fill(null));
        this.game.crosswordManager.gridSize = 15;
        this.game.crosswordManager.placedWords = [];

        const centerRow = 6;
        const centerCol = 6;

        //   T H E
        //     E
        //     R
        this.game.crosswordManager.grid[centerRow][centerCol] = {
            letter: 'T',
            wordIndex: 0,
            filled: false
        };
        this.game.crosswordManager.grid[centerRow][centerCol + 1] = {
            letter: 'H',
            wordIndices: [0, 1], // Shared by THE (across) and HER (down)
            filled: false
        };
        this.game.crosswordManager.grid[centerRow][centerCol + 2] = {
            letter: 'E',
            wordIndex: 0,
            filled: false
        };
        this.game.crosswordManager.grid[centerRow + 1][centerCol + 1] = {
            letter: 'E',
            wordIndex: 1,
            filled: false
        };
        this.game.crosswordManager.grid[centerRow + 2][centerCol + 1] = {
            letter: 'R',
            wordIndex: 1,
            filled: false
        };

        // Track placed words
        this.game.crosswordManager.placedWords = [
            {
                word: 'THE',
                row: centerRow,
                col: centerCol,
                vertical: false,
                index: 0
            },
            {
                word: 'HER',
                row: centerRow,
                col: centerCol + 1,
                vertical: true,
                index: 1
            }
        ];
        
        // Render the crossword
        this.game.crosswordManager.render();
        
        // Create letter circle
        this.game.letterCircleManager.create(this.tutorialLetters);
        
        // Update UI
        this.game.uiManager.setTargetWords(this.tutorialWords);
        this.game.uiManager.clearFoundWords();
        
        // Make sure the game handles word submissions during tutorial
        this.originalHandleSubmission = this.game.handleWordSubmission.bind(this.game);
        
        // Override handleWordSubmission to work during tutorial
        this.game.handleWordSubmission = async (word) => {
            if (word.length < 3) {
                this.game.uiManager.showMessage('Word too short!');
                this.game.clearSelection();
                return;
            }

            // Check if word is in target words
            if (this.tutorialWords.includes(word) && !this.game.foundTargetWords.includes(word)) {
                this.game.foundTargetWords.push(word);
                this.game.uiManager.addFoundWord(word, true);

                // fillWord looks the word up in placedWords and re-renders
                this.game.crosswordManager.fillWord(word);

                this.game.uiManager.showMessage('Great!');
                this.game.audioManager.playSound('success');
            } else if (this.game.foundTargetWords.includes(word)) {
                this.game.uiManager.showMessage('Already found!');
                this.game.audioManager.playSound('alreadyFound');
            } else {
                this.game.uiManager.showMessage('Not a target word');
            }
            
            this.game.clearSelection();
        };
    }

    waitForWord(word, callback) {
        // Poll for word completion
        this.wordCheckInterval = setInterval(() => {
            if (this.game.foundTargetWords.includes(word)) {
                clearInterval(this.wordCheckInterval);
                this.wordCheckInterval = null;
                callback();
            }
        }, 100);
    }

    animateOverlap() {
        // Highlight the overlapping letters in the crossword
        const cells = document.querySelectorAll('.crossword-cell.intersection');
        cells.forEach((cell, index) => {
            setTimeout(() => {
                cell.style.animation = 'pulse 1s ease-in-out 3';
            }, index * 200);
        });
    }

    spotlightElement(selector) {
        const element = document.querySelector(selector);
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const spotlight = this.spotlight;
        
        // Create spotlight border around element
        spotlight.style.left = `${rect.left - 10}px`;
        spotlight.style.top = `${rect.top - 10}px`;
        spotlight.style.width = `${rect.width + 20}px`;
        spotlight.style.height = `${rect.height + 20}px`;
        spotlight.classList.add('active');
        
        // Punch a rounded hole in the dark mask over the element
        this.overlay.classList.add('spotlight-active');
        this.spotlightHoles = [rect];
        this.updateMask();
    }

    // Rebuild the dark mask: a full-screen rectangle with a rounded hole
    // (15px radius, matching the spotlight border) for each highlighted area.
    updateMask() {
        const path = this.overlay.querySelector('.tutorial-mask-path');
        if (!path) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        let d = `M 0 0 H ${w} V ${h} H 0 Z`;

        for (const rect of this.spotlightHoles || []) {
            const pad = 10;
            const x = rect.left - pad;
            const y = rect.top - pad;
            const rw = rect.width + pad * 2;
            const rh = rect.height + pad * 2;
            const r = Math.min(15, rw / 2, rh / 2);

            d += ` M ${x + r} ${y}` +
                 ` H ${x + rw - r} Q ${x + rw} ${y} ${x + rw} ${y + r}` +
                 ` V ${y + rh - r} Q ${x + rw} ${y + rh} ${x + rw - r} ${y + rh}` +
                 ` H ${x + r} Q ${x} ${y + rh} ${x} ${y + rh - r}` +
                 ` V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
        }

        path.setAttribute('d', d);
    }

    addAdditionalSpotlight(selector) {
        // Create a second spotlight for the crossword
        const element = document.querySelector(selector);
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        
        // Create additional spotlight element if it doesn't exist
        let spotlight2 = this.overlay.querySelector('.tutorial-spotlight-2');
        if (!spotlight2) {
            spotlight2 = document.createElement('div');
            spotlight2.className = 'tutorial-spotlight tutorial-spotlight-2';
            this.overlay.appendChild(spotlight2);
        }
        
        // Position the second spotlight
        spotlight2.style.left = `${rect.left - 10}px`;
        spotlight2.style.top = `${rect.top - 10}px`;
        spotlight2.style.width = `${rect.width + 20}px`;
        spotlight2.style.height = `${rect.height + 20}px`;
        spotlight2.classList.add('active');

        // Punch a second rounded hole in the mask
        this.spotlightHoles = [...(this.spotlightHoles || []), rect];
        this.updateMask();
    }

    hideSpotlight() {
        this.spotlight.classList.remove('active');
        const spotlight2 = this.overlay.querySelector('.tutorial-spotlight-2');
        if (spotlight2) {
            spotlight2.classList.remove('active');
        }
        this.overlay.classList.remove('spotlight-active');
    }
}

// Add fadeOut animation
if (!document.getElementById('tutorial-fadeout-style')) {
    const style = document.createElement('style');
    style.id = 'tutorial-fadeout-style';
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}