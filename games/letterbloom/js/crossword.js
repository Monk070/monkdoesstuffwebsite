// crossword.js - Improved Crossword Manager with Single Letter Animation
export class CrosswordManager {
    constructor() {
        this.grid = [];
        this.gridSize = 15;
        this.container = null;
        this.placedWords = []; // Track all placed words with their positions
        this.PADDING = 2; // Minimum padding from edges
    }

    createGrid(targetWords) {
        if (targetWords.length === 0) return;
        
        // Remove duplicates from target words (extra safety check)
        const uniqueWords = [...new Set(targetWords)];
        
        // Initialize empty grid
        this.grid = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
        this.placedWords = [];
        
        // Sort words by length (place longer words first for better layout)
        const sortedWords = [...uniqueWords].sort((a, b) => b.length - a.length);
        
        // Place first word in the center
        const firstWord = sortedWords[0];
        const placed = this.placeFirstWord(firstWord);
        
        if (!placed) {
            console.error('Could not place first word:', firstWord);
            return;
        }
        
        // Try to place remaining words
        for (let wordIdx = 1; wordIdx < sortedWords.length; wordIdx++) {
            const word = sortedWords[wordIdx];
            
            if (!this.placeIntersectingWord(word, wordIdx)) {
                // If can't intersect, try to place nearby
                this.placeNearbyWord(word, wordIdx);
            }
        }
        
        // Compact the grid to minimize empty space
        this.compactGrid();
    }

    placeFirstWord(word) {
        // Place the first word horizontally in the center
        const startRow = Math.floor(this.gridSize / 2);
        const startCol = Math.floor((this.gridSize - word.length) / 2);
        
        if (!this.canPlaceWord(word, startRow, startCol, false)) {
            return false;
        }
        
        this.placeWord(word, startRow, startCol, false, 0);
        return true;
    }

    placeIntersectingWord(word, wordIndex) {
        // Try to find the best intersection point
        const intersections = this.findPossibleIntersections(word);
        
        if (intersections.length === 0) {
            return false;
        }
        
        // Sort intersections by quality (prefer center positions and multiple intersections)
        intersections.sort((a, b) => {
            // Prefer positions closer to center
            const centerDist_a = Math.abs(a.row - this.gridSize/2) + Math.abs(a.col - this.gridSize/2);
            const centerDist_b = Math.abs(b.row - this.gridSize/2) + Math.abs(b.col - this.gridSize/2);
            return centerDist_a - centerDist_b;
        });
        
        // Try each intersection point
        for (const intersection of intersections) {
            if (this.canPlaceWord(word, intersection.row, intersection.col, intersection.vertical)) {
                this.placeWord(word, intersection.row, intersection.col, intersection.vertical, wordIndex);
                return true;
            }
        }
        
        return false;
    }

    findPossibleIntersections(word) {
        const intersections = [];
        
        // Check each placed word for possible intersections
        for (const placedWord of this.placedWords) {
            for (let i = 0; i < word.length; i++) {
                for (let j = 0; j < placedWord.word.length; j++) {
                    if (word[i] === placedWord.word[j]) {
                        // Found a matching letter
                        if (placedWord.vertical) {
                            // Placed word is vertical, try placing new word horizontally
                            const newRow = placedWord.row + j;
                            const newCol = placedWord.col - i;
                            intersections.push({
                                row: newRow,
                                col: newCol,
                                vertical: false,
                                intersectionCount: 1
                            });
                        } else {
                            // Placed word is horizontal, try placing new word vertically
                            const newRow = placedWord.row - i;
                            const newCol = placedWord.col + j;
                            intersections.push({
                                row: newRow,
                                col: newCol,
                                vertical: true,
                                intersectionCount: 1
                            });
                        }
                    }
                }
            }
        }
        
        return intersections;
    }

    placeNearbyWord(word, wordIndex) {
        // If we can't intersect, place the word near existing words
        const bounds = this.getGridBounds();
        
        // Try positions around the existing words
        const positions = [
            { row: bounds.minRow - 2, col: bounds.minCol, vertical: false },
            { row: bounds.maxRow + 2, col: bounds.minCol, vertical: false },
            { row: bounds.minRow, col: bounds.minCol - 2, vertical: true },
            { row: bounds.minRow, col: bounds.maxCol + 2, vertical: true }
        ];
        
        for (const pos of positions) {
            if (this.canPlaceWord(word, pos.row, pos.col, pos.vertical)) {
                this.placeWord(word, pos.row, pos.col, pos.vertical, wordIndex);
                return true;
            }
        }
        
        // Last resort: place randomly within bounds
        for (let attempts = 0; attempts < 20; attempts++) {
            const vertical = Math.random() < 0.5;
            const row = this.PADDING + Math.floor(Math.random() * (this.gridSize - 2 * this.PADDING - (vertical ? word.length : 0)));
            const col = this.PADDING + Math.floor(Math.random() * (this.gridSize - 2 * this.PADDING - (vertical ? 0 : word.length)));
            
            if (this.canPlaceWord(word, row, col, vertical)) {
                this.placeWord(word, row, col, vertical, wordIndex);
                return true;
            }
        }
        
        return false;
    }

    canPlaceWord(word, row, col, vertical) {
        // Check boundaries with padding (both axes - candidate positions
        // from placeNearbyWord can fall outside the grid)
        const endRow = vertical ? row + word.length - 1 : row;
        const endCol = vertical ? col : col + word.length - 1;
        if (row < this.PADDING || col < this.PADDING ||
            endRow > this.gridSize - 1 - this.PADDING ||
            endCol > this.gridSize - 1 - this.PADDING) {
            return false;
        }
        
        // The cells immediately before and after the word (along its axis)
        // must be empty - otherwise separate words read as one longer word.
        if (vertical) {
            if (this.isOccupied(row - 1, col) || this.isOccupied(row + word.length, col)) {
                return false;
            }
        } else {
            if (this.isOccupied(row, col - 1) || this.isOccupied(row, col + word.length)) {
                return false;
            }
        }

        // Check for conflicts with existing letters
        for (let i = 0; i < word.length; i++) {
            const r = vertical ? row + i : row;
            const c = vertical ? col : col + i;

            if (this.grid[r][c]) {
                if (this.grid[r][c].letter !== word[i]) {
                    return false;
                }
                // Shared cells are only allowed at perpendicular crossings -
                // two same-direction words sharing cells would look like one
                // longer word (THE + HER reading as "THER").
                if (this.hasWordThroughCell(r, c, vertical)) {
                    return false;
                }
            } else {
                // Check adjacent cells (except at intersections)
                if (!this.checkAdjacentCells(r, c, vertical)) {
                    return false;
                }
            }
        }

        return true;
    }

    isOccupied(row, col) {
        return row >= 0 && row < this.gridSize &&
               col >= 0 && col < this.gridSize &&
               !!this.grid[row][col];
    }

    // Is (row, col) covered by an already-placed word with this orientation?
    hasWordThroughCell(row, col, vertical) {
        return this.placedWords.some(placed => placed.vertical === vertical && (
            vertical
                ? placed.col === col && row >= placed.row && row < placed.row + placed.word.length
                : placed.row === row && col >= placed.col && col < placed.col + placed.word.length
        ));
    }

    checkAdjacentCells(row, col, wordIsVertical) {
        // Ensure words don't touch except at intersections
        const checks = wordIsVertical ? 
            [[0, -1], [0, 1]] : // Check left and right for vertical words
            [[-1, 0], [1, 0]];  // Check up and down for horizontal words
        
        for (const [dr, dc] of checks) {
            const r = row + dr;
            const c = col + dc;
            
            if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
                if (this.grid[r][c] && this.grid[r][c].letter) {
                    return false; // Adjacent cell has a letter
                }
            }
        }
        
        return true;
    }

    placeWord(word, row, col, vertical, wordIndex) {
        // Track the placed word
        this.placedWords.push({
            word: word,
            row: row,
            col: col,
            vertical: vertical,
            index: wordIndex
        });
        
        // Place letters in grid
        for (let i = 0; i < word.length; i++) {
            const r = vertical ? row + i : row;
            const c = vertical ? col : col + i;
            
            if (!this.grid[r][c]) {
                this.grid[r][c] = {
                    letter: word[i],
                    wordIndex: wordIndex,
                    filled: false
                };
            } else {
                // Letter already exists (intersection), mark as part of multiple words
                if (!this.grid[r][c].wordIndices) {
                    this.grid[r][c].wordIndices = [this.grid[r][c].wordIndex];
                }
                this.grid[r][c].wordIndices.push(wordIndex);
            }
        }
    }

    getGridBounds() {
        let minRow = this.gridSize, maxRow = 0;
        let minCol = this.gridSize, maxCol = 0;
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.grid[row][col]) {
                    minRow = Math.min(minRow, row);
                    maxRow = Math.max(maxRow, row);
                    minCol = Math.min(minCol, col);
                    maxCol = Math.max(maxCol, col);
                }
            }
        }
        
        return { minRow, maxRow, minCol, maxCol };
    }

    compactGrid() {
        // Shift the entire crossword to minimize empty space
        const bounds = this.getGridBounds();
        
        // Calculate how much we can shift
        const shiftRow = Math.max(0, bounds.minRow - this.PADDING);
        const shiftCol = Math.max(0, bounds.minCol - this.PADDING);
        
        if (shiftRow > 0 || shiftCol > 0) {
            // Create new grid
            const newGrid = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
            
            // Copy cells to new positions
            for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
                for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
                    if (this.grid[row][col]) {
                        const newRow = row - shiftRow;
                        const newCol = col - shiftCol;
                        newGrid[newRow][newCol] = this.grid[row][col];
                    }
                }
            }
            
            // Update placed words positions
            for (const placedWord of this.placedWords) {
                placedWord.row -= shiftRow;
                placedWord.col -= shiftCol;
            }
            
            this.grid = newGrid;
        }
    }

    render() {
        this.container = document.getElementById('crosswordGrid');
        this.container.innerHTML = '';
        
        // Get actual bounds of the crossword
        const bounds = this.getGridBounds();
        
        // Add some padding for visual appeal
        const visualPadding = 1;
        const minRow = Math.max(0, bounds.minRow - visualPadding);
        const maxRow = Math.min(this.gridSize - 1, bounds.maxRow + visualPadding);
        const minCol = Math.max(0, bounds.minCol - visualPadding);
        const maxCol = Math.min(this.gridSize - 1, bounds.maxCol + visualPadding);
        
        // Calculate grid dimensions
        const gridRows = maxRow - minRow + 1;
        const gridCols = maxCol - minCol + 1;
        
        // Adjust cell size based on grid dimensions
        const maxCellSize = 40;
        const minCellSize = 25;
        const cellSize = Math.max(minCellSize, Math.min(maxCellSize, 400 / Math.max(gridRows, gridCols)));
        
        // Render the grid
        for (let row = minRow; row <= maxRow; row++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'crossword-row';
            
            for (let col = minCol; col <= maxCol; col++) {
                const cell = document.createElement('div');
                cell.className = 'crossword-cell';
                cell.style.width = cellSize + 'px';
                cell.style.height = cellSize + 'px';
                cell.style.fontSize = (cellSize * 0.6) + 'px';
                
                if (this.grid[row][col]) {
                    cell.dataset.row = row;
                    cell.dataset.col = col;
                    cell.textContent = this.grid[row][col].filled ? this.grid[row][col].letter : '';
                    if (this.grid[row][col].filled) {
                        cell.classList.add('filled');
                    }
                    
                    // Add subtle highlighting for intersections
                    if (this.grid[row][col].wordIndices && this.grid[row][col].wordIndices.length > 1) {
                        cell.classList.add('intersection');
                    }
                } else {
                    cell.classList.add('empty');
                }
                
                rowDiv.appendChild(cell);
            }
            
            this.container.appendChild(rowDiv);
        }
        
        // Add grid info for debugging (remove in production)
        this.container.dataset.gridInfo = `${gridRows}x${gridCols} cells, size: ${cellSize}px`;
    }

    findAndRevealRandomLetter() {
        // Find ALL unrevealed letters in the crossword
        const unrevealedPositions = [];
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.grid[row][col] && 
                    this.grid[row][col].letter && 
                    !this.grid[row][col].filled) {
                    unrevealedPositions.push({ row, col });
                }
            }
        }
        
        if (unrevealedPositions.length === 0) return false;
        
        // Prioritize letters that are part of multiple words (intersections)
        const intersectionPositions = unrevealedPositions.filter(pos => 
            this.grid[pos.row][pos.col].wordIndices && 
            this.grid[pos.row][pos.col].wordIndices.length > 1
        );
        
        // Pick from intersections first if available, otherwise any unrevealed letter
        const targetPositions = intersectionPositions.length > 0 ? intersectionPositions : unrevealedPositions;
        const randomPos = targetPositions[Math.floor(Math.random() * targetPositions.length)];
        
        // Mark the letter as filled in the grid
        this.grid[randomPos.row][randomPos.col].filled = true;
        
        // Only update the single cell instead of re-rendering entire grid
        this.revealSingleLetter(randomPos.row, randomPos.col);
        
        return true;
    }
    
    revealSingleLetter(row, col) {
        // Find the specific cell in the DOM and update it
        const cells = this.container.querySelectorAll('.crossword-cell');
        
        for (const cell of cells) {
            if (cell.dataset.row == row && cell.dataset.col == col) {
                // Update the cell content
                cell.textContent = this.grid[row][col].letter;
                
                // Add ONLY hint-reveal class for animation
                cell.classList.add('hint-reveal');
                
                // After animation completes, switch to filled state WITHOUT animation
                setTimeout(() => {
                    cell.classList.remove('hint-reveal');
                    cell.classList.add('filled', 'no-animation');
                    
                    // Check if it's an intersection
                    if (this.grid[row][col].wordIndices && this.grid[row][col].wordIndices.length > 1) {
                        cell.classList.add('intersection');
                    }
                }, 600);
                
                break;
            }
        }
    }
    
    isWordFullyRevealed(word) {
        const positions = this.findWordInGrid(word);
        if (!positions) return false;
        
        // Check if all letters of this word are revealed
        for (const pos of positions) {
            if (!this.grid[pos.row][pos.col].filled) {
                return false;
            }
        }
        return true;
    }
    
    findWordInGrid(word) {
        // Use our tracked placed words for efficient lookup
        for (const placedWord of this.placedWords) {
            if (placedWord.word === word) {
                const positions = [];
                for (let i = 0; i < word.length; i++) {
                    const row = placedWord.vertical ? placedWord.row + i : placedWord.row;
                    const col = placedWord.vertical ? placedWord.col : placedWord.col + i;
                    positions.push({ row, col });
                }
                return positions;
            }
        }
        return null;
    }
    
    fillWord(word) {
        const positions = this.findWordInGrid(word);
        if (!positions) return;
        
        for (const pos of positions) {
            this.grid[pos.row][pos.col].filled = true;
        }
        
        this.render();
    }

    // Get statistics about the current grid
    getGridStats() {
        const bounds = this.getGridBounds();
        const filledCells = this.grid.flat().filter(cell => cell && cell.filled).length;
        const totalCells = this.grid.flat().filter(cell => cell && cell.letter).length;
        
        return {
            bounds: bounds,
            placedWords: this.placedWords.length,
            filledCells: filledCells,
            totalCells: totalCells,
            fillPercentage: totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0
        };
    }
}