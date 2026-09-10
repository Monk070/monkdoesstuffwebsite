// letterCircle.js - The draggable letter wheel (mouse + touch).
// While dragging, the connection line rubber-bands from the last selected
// letter to the pointer, so it is visible from the first letter onwards.
export class LetterCircleManager {
    constructor() {
        this.container = null;
        this.letters = [];
        this.buttonCenters = [];   // SVG-space centre of each letter button
        this.selectedLetters = [];
        this.selectedButtons = [];
        this.isDragging = false;
        this.pointerPos = null;    // pointer position in SVG space while dragging
        this.onWordSelected = null;
        this.onWordSubmit = null;

        // Document-level handlers so the drag keeps working (and ends) even
        // when the pointer leaves the letter buttons or the wheel entirely.
        this._onMouseMove = (e) => {
            if (!this.isDragging) return;
            this._updatePointer(e.clientX, e.clientY);
        };
        this._onMouseUp = () => this.endDrag();
    }

    isMobile() {
        return window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches ||
               window.matchMedia("(max-aspect-ratio: 9/16)").matches;
    }

    create(letters) {
        this.letters = letters;
        this.container = document.getElementById('letterCircle');

        // Clear only the buttons, keep the SVG
        const buttons = this.container.querySelectorAll('.letter-button');
        buttons.forEach(btn => btn.remove());

        // Adjust sizes based on device
        const isMobileDevice = this.isMobile();
        const containerSize = isMobileDevice ? 150 : 180;
        const radius = isMobileDevice ? 50 : 60;
        const buttonSize = isMobileDevice ? 38 : 46;
        const centerX = containerSize / 2;
        const centerY = containerSize / 2;

        const svg = document.getElementById('connectionLine');
        if (svg) {
            svg.style.width = `${containerSize}px`;
            svg.style.height = `${containerSize}px`;
            // Let the rubber-band segment draw past the SVG bounds
            svg.style.overflow = 'visible';
        }

        const angleStep = (2 * Math.PI) / letters.length;
        this.buttonCenters = [];

        letters.forEach((letter, index) => {
            const button = document.createElement('button');
            button.className = 'letter-button';
            button.textContent = letter;
            button.dataset.index = index;

            const angle = angleStep * index - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle) - (buttonSize / 2);
            const y = centerY + radius * Math.sin(angle) - (buttonSize / 2);

            button.style.left = x + 'px';
            button.style.top = y + 'px';
            this.buttonCenters[index] = { x: x + buttonSize / 2, y: y + buttonSize / 2 };

            if ('ontouchstart' in window) {
                // Touch events for mobile. touchmove keeps firing on the
                // button where the touch started, so selection uses
                // elementFromPoint and the pointer position comes from the
                // touch coordinates.
                button.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.startDrag(index, button);
                    const touch = e.touches[0];
                    this._updatePointer(touch.clientX, touch.clientY);
                }, { passive: false });

                button.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    if (!this.isDragging) return;
                    const touch = e.touches[0];
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (element && element.classList.contains('letter-button')) {
                        this.continueDrag(parseInt(element.dataset.index), element);
                    }
                    this._updatePointer(touch.clientX, touch.clientY);
                }, { passive: false });

                button.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.endDrag();
                }, { passive: false });
            } else {
                // Mouse events for desktop
                button.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.startDrag(index, button);
                    this._updatePointer(e.clientX, e.clientY);
                });
                button.addEventListener('mouseenter', () => this.continueDrag(index, button));
            }

            this.container.appendChild(button);
        });
    }

    // Convert viewport coordinates to SVG space and redraw the line
    _updatePointer(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        this.pointerPos = { x: clientX - rect.left, y: clientY - rect.top };
        this.drawConnections();
    }

    startDrag(index, button) {
        this.isDragging = true;
        this.clearSelection();
        this.selectLetter(index, button);

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);

        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    }

    continueDrag(index, button) {
        if (!this.isDragging) return;
        if (this.selectedButtons.includes(button)) return;
        this.selectLetter(index, button);
    }

    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.pointerPos = null;

        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);

        if (this.selectedLetters.length >= 3) {
            if (this.onWordSubmit) {
                this.onWordSubmit(this.getSelectedWord());
            }
        } else {
            this.clearSelection();
        }
        this.drawConnections();
    }

    selectLetter(index, button) {
        if (this.selectedButtons.includes(button)) return;

        this.selectedLetters.push(this.letters[index]);
        this.selectedButtons.push(button);
        button.classList.add('selected');

        if (this.onWordSelected) {
            this.onWordSelected(this.getSelectedWord());
        }
        this.drawConnections();

        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(5);
        }
    }

    drawConnections() {
        const path = document.getElementById('linePath');
        if (!path) return;

        if (this.selectedButtons.length === 0) {
            path.setAttribute('d', '');
            return;
        }

        const points = this.selectedButtons.map(btn =>
            this.buttonCenters[parseInt(btn.dataset.index)]
        );

        // Rubber-band segment from the last letter to the pointer
        if (this.isDragging && this.pointerPos) {
            points.push(this.pointerPos);
        }

        path.setAttribute('d', this._buildRoundedPath(points));
    }

    // Path through the points with each corner rounded off by a small
    // quadratic curve, instead of a sharp angle.
    _buildRoundedPath(points, radius = 10) {
        if (points.length === 0) return '';
        let d = `M ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
            if (inLen < 0.01 || outLen < 0.01) continue;

            // Stop short of the corner on the way in, curve through it on the way out
            const rIn = Math.min(radius, inLen / 2);
            const rOut = Math.min(radius, outLen / 2);
            const entryX = curr.x - ((curr.x - prev.x) / inLen) * rIn;
            const entryY = curr.y - ((curr.y - prev.y) / inLen) * rIn;
            const exitX = curr.x + ((next.x - curr.x) / outLen) * rOut;
            const exitY = curr.y + ((next.y - curr.y) / outLen) * rOut;

            d += ` L ${entryX} ${entryY} Q ${curr.x} ${curr.y} ${exitX} ${exitY}`;
        }

        const last = points[points.length - 1];
        d += ` L ${last.x} ${last.y}`;
        return d;
    }

    clearSelection() {
        this.selectedLetters = [];
        this.selectedButtons.forEach(btn => btn.classList.remove('selected'));
        this.selectedButtons = [];
        this.pointerPos = null;
        this.drawConnections();
    }

    getSelectedWord() {
        return this.selectedLetters.join('');
    }

    // Handle orientation changes
    handleOrientationChange() {
        if (this.letters.length > 0) {
            this.create(this.letters);
        }
    }
}

// Recreate the wheel when the device orientation changes
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (window.game && window.game.letterCircleManager) {
            window.game.letterCircleManager.handleOrientationChange();
        }
    }, 100);
});
