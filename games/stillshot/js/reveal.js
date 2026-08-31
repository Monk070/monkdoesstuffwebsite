// Frame reveal: renders the round's film frame at a given mosaic resolution.
// Pixelation = draw the image tiny (N columns) on an offscreen canvas, then
// upscale with smoothing off — chunky blocks, no CSS-filter edge bleed, and
// impossible to "un-blur" with a screen filter the way a blur could be.

import { imageUrl } from './tmdb.js';

export class FrameReveal {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.octx = this.off.getContext('2d');
    this.img = null;
    this.cols = 0;
    this._loadId = 0;
    // re-render at the same stage when the layout resizes the canvas
    new ResizeObserver(() => this._draw()).observe(canvas);
  }

  // Resolves true when the frame is ready, false for a dead image URL.
  load(path) {
    const myLoad = ++this._loadId;
    this.img = null;
    this._draw(); // blank while loading
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // image.tmdb.org sends CORS headers
      img.onload = () => {
        if (myLoad !== this._loadId) return resolve(false);
        this.img = img;
        this._draw();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = imageUrl(path, 'w780');
    });
  }

  get hasFrame() {
    return !!this.img;
  }

  // cols = mosaic columns; 0 = clear frame
  setStage(cols) {
    this.cols = cols;
    this._draw();
  }

  _draw() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    if (!this.img) return;

    // cover-crop the source so every backdrop fills the 16:9 canvas
    const img = this.img;
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale, sh = h / scale;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;

    if (!this.cols) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return;
    }
    const cols = this.cols;
    const rows = Math.max(1, Math.round(cols * (h / w)));
    this.off.width = cols;
    this.off.height = rows;
    this.octx.imageSmoothingEnabled = true;
    this.octx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, cols, rows, 0, 0, w, h);
  }
}
