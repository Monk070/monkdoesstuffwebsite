// Clip player: plays a precise window (offset -> offset+duration) of a 30s
// preview MP3. Deezer's CDN serves plain <audio>-compatible MP3s; no CORS
// issues because we never touch the samples, only play them.

export class ClipPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this._raf = null;
    this._safetyTimer = null;
    this._clipEnd = 0;
    this._clipStart = 0;
    this.playing = false;
    this.onProgress = null; // (elapsedSeconds) => void
    this.onEnded = null;    // () => void
  }

  setVolume(v01) {
    this.audio.volume = Math.min(1, Math.max(0, v01));
  }

  load(url) {
    this.stop();
    this.audio.src = url;
    this.audio.load();
  }

  get hasSource() {
    return !!this.audio.src;
  }

  playClip(offset, duration) {
    this.stop();
    const a = this.audio;
    this._clipStart = offset;
    this._clipEnd = offset + duration;

    const begin = () => {
      a.currentTime = offset;
      const p = a.play();
      if (p) p.catch(() => { this.playing = false; });
      this.playing = true;

      // Precise stop: poll currentTime; safety timeout as a backstop for the
      // 0.1s stage where events can outrun the poll.
      const tick = () => {
        if (!this.playing) return;
        const t = a.currentTime;
        if (this.onProgress) this.onProgress(Math.max(0, t - this._clipStart));
        if (t >= this._clipEnd || a.ended) {
          this._finish();
          return;
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
      this._safetyTimer = setTimeout(() => this._finish(), duration * 1000 + 250);
    };

    if (a.readyState >= 2) {
      begin();
    } else {
      a.addEventListener('canplay', begin, { once: true });
      a.load();
    }
  }

  _finish() {
    if (!this.playing) return;
    this.playing = false;
    this.audio.pause();
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._safetyTimer) clearTimeout(this._safetyTimer);
    this._raf = null;
    this._safetyTimer = null;
    if (this.onEnded) this.onEnded();
  }

  stop() {
    this.playing = false;
    this.audio.pause();
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._safetyTimer) clearTimeout(this._safetyTimer);
    this._raf = null;
    this._safetyTimer = null;
  }
}
