// audio.js - Enhanced Audio Manager with Media Player and Time Display
export class AudioManager {
    constructor() {
        // Music player state
        this.currentTrackIndex = 0;
        this.isPlaying = false;  // Start not playing
        this.isMuted = false;
        this.isLooping = false;  // Loop single track or playlist
        this.volume = 0.1; // Music volume: faint background by default
        this.sfxVolume = 0.3; // UI sound effects, independent of music volume
        
        // Audio elements
        this.musicPlayer = null;
        this.audioContext = null;
        
        // Track list - will be loaded dynamically
        this.tracks = [];
        
        // Time update interval
        this.timeUpdateInterval = null;
        
        // Try to get saved preferences
        this.loadPreferences();
    }

    async init() {
        // Initialize audio context for sound effects
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Load track list dynamically
        await this.loadTrackList();
        
        // Create audio element for music
        this.musicPlayer = new Audio();
        this.musicPlayer.loop = false;  // We'll handle looping manually
        this.musicPlayer.volume = this.volume;
        
        // Set up event listeners
        this.musicPlayer.addEventListener('ended', () => {
            this.handleTrackEnd();
        });
        
        this.musicPlayer.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.handlePlaybackError();
        });
        
        // Add loadedmetadata event to get duration
        this.musicPlayer.addEventListener('loadedmetadata', () => {
            this.updateTimeDisplay();
        });
        
        // Add timeupdate event for progress
        this.musicPlayer.addEventListener('timeupdate', () => {
            this.updateTimeDisplay();
        });
        
        // Create media player UI first
        this.createMediaPlayerUI();
        
        // Load first track and update display
        if (this.tracks.length > 0) {
            this.loadTrack(0);
        } else {
            // Update display to show no tracks
            const trackNameEl = document.getElementById('trackName');
            if (trackNameEl) {
                trackNameEl.textContent = 'No music files found';
            }
        }
        
        // Auto-play if it was playing before
        if (this.isPlaying) {
            this.play();
        }
    }
    
    handleTrackEnd() {
        if (this.isLooping) {
            // Loop current track
            this.musicPlayer.currentTime = 0;
            this.play();
        } else {
            // Move to next track
            this.nextTrack();
        }
    }
    
    async loadTrackList() {
        try {
            // Try to load the generated tracks.json file
            const response = await fetch('./audio/tracks.json');
            if (response.ok) {
                this.tracks = await response.json();
                console.log(`Loaded ${this.tracks.length} tracks from tracks.json`);
            } else {
                // Fallback to trying individual numbered files
                await this.detectTracksManually();
            }
        } catch (error) {
            console.warn('Could not load tracks.json, attempting manual detection...');
            await this.detectTracksManually();
        }
    }
    
    async detectTracksManually() {
        console.log('Attempting to auto-detect MP3 files in audio/ folder...');
        
        // First, try to detect any MP3 file to see if audio folder exists
        const testPatterns = [
            '1.mp3', '01.mp3', 'track1.mp3', 'Track1.mp3', 'music1.mp3',
            'song1.mp3', 'bgm1.mp3', 'audio1.mp3', 'track_1.mp3', 'Track_1.mp3'
        ];
        
        let folderExists = false;
        for (const pattern of testPatterns) {
            try {
                const response = await fetch(`./audio/${pattern}`, { method: 'HEAD' });
                if (response.ok) {
                    folderExists = true;
                    break;
                }
            } catch (error) {
                // Continue checking
            }
        }
        
        if (!folderExists) {
            console.log('Testing if audio folder is accessible...');
            // Try a different approach - just try to load any file
            try {
                // Create a test audio element
                const testAudio = new Audio('./audio/test.mp3');
                testAudio.volume = 0;
                await testAudio.play().catch(() => {});
            } catch (error) {
                console.log('Audio folder check failed:', error);
            }
        }
        
        const detectedTracks = [];
        
        // Try common naming patterns more thoroughly
        const patterns = [
            { template: (n) => `${n}.mp3`, name: (n) => `Track ${n}` },
            { template: (n) => `${String(n).padStart(2, '0')}.mp3`, name: (n) => `Track ${n}` },
            { template: (n) => `track${n}.mp3`, name: (n) => `Track ${n}` },
            { template: (n) => `track_${n}.mp3`, name: (n) => `Track ${n}` },
            { template: (n) => `Track${n}.mp3`, name: (n) => `Track ${n}` },
            { template: (n) => `Track_${n}.mp3`, name: (n) => `Track ${n}` },
            { template: (n) => `song${n}.mp3`, name: (n) => `Song ${n}` },
            { template: (n) => `Song${n}.mp3`, name: (n) => `Song ${n}` },
            { template: (n) => `music${n}.mp3`, name: (n) => `Music ${n}` },
            { template: (n) => `Music${n}.mp3`, name: (n) => `Music ${n}` },
            { template: (n) => `bgm${n}.mp3`, name: (n) => `BGM ${n}` },
            { template: (n) => `BGM${n}.mp3`, name: (n) => `BGM ${n}` },
            { template: (n) => `audio${n}.mp3`, name: (n) => `Audio ${n}` }
        ];
        
        for (let pattern of patterns) {
            let trackNumber = 1;
            let consecutiveFails = 0;
            const maxTracks = 20;
            
            while (trackNumber <= maxTracks && consecutiveFails < 3) {
                const filename = pattern.template(trackNumber);
                const url = `./audio/${filename}`;
                
                try {
                    const response = await fetch(url, { method: 'HEAD' });
                    if (response.ok) {
                        detectedTracks.push({
                            name: pattern.name(trackNumber),
                            url: url,
                            filename: filename
                        });
                        console.log(`Found: ${filename}`);
                        consecutiveFails = 0;
                    } else {
                        consecutiveFails++;
                    }
                } catch (error) {
                    consecutiveFails++;
                }
                
                trackNumber++;
            }
            
            // If we found tracks with this pattern, keep checking other patterns too
            // (user might have mixed naming)
        }
        
        if (detectedTracks.length > 0) {
            this.tracks = detectedTracks;
            console.log(`✔ Auto-detected ${this.tracks.length} tracks:`, detectedTracks.map(t => t.filename));
        } else {
            console.warn('No MP3 files detected. Please ensure your audio files are in the audio/ folder.');
            console.log('Expected file patterns: 1.mp3, track1.mp3, song1.mp3, music1.mp3, etc.');
            console.log('Or run generate-tracklist.ps1 to create tracks.json automatically.');
            
            // Show message in player
            this.tracks = [
                { name: 'No music files found in audio/', url: '' }
            ];
        }
    }

    createMediaPlayerUI() {
        // Check if player already exists (avoid duplicates)
        if (document.querySelector('.media-player')) {
            return;
        }
        
        // Create media player container with updated layout including loop button
        const playerContainer = document.createElement('div');
        playerContainer.className = 'media-player';
        playerContainer.innerHTML = `
            <div class="media-player-inner">
                <div class="track-info">
                    <div class="track-name-container">
                        <span id="trackName">Loading music...</span>
                    </div>
                    <div class="track-time" id="trackTime">0:00 / 0:00</div>
                </div>
                <div class="player-controls">
                    <button id="prevTrack" class="player-btn" title="Previous">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                        </svg>
                    </button>
                    <button id="playPauseBtn" class="player-btn play-pause" title="Play/Pause">
                        <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <svg class="pause-icon" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                    </button>
                    <button id="nextTrack" class="player-btn" title="Next">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                        </svg>
                    </button>
                    <button id="loopBtn" class="player-btn" title="Loop Current Track">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                        </svg>
                    </button>
                    <div class="volume-section">
                        <button id="muteBtn" class="player-btn" title="Mute/Unmute">
                            <svg class="volume-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                            <svg class="mute-icon" style="display:none;" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                            </svg>
                        </button>
                        <div class="volume-control">
                            <input type="range" id="volumeSlider" class="volume-slider" min="0" max="100" value="${this.volume * 100}">
                            <span class="volume-display" id="volumeDisplay">${Math.round(this.volume * 100)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Wait for DOM to be ready, then add to left panel
        setTimeout(() => {
            const leftPanel = document.querySelector('.left-panel');
            if (leftPanel) {
                // Add media player to the left panel (will be positioned under crossword)
                leftPanel.appendChild(playerContainer);
            } else {
                // Fallback to game wrapper if left panel not found
                const gameWrapper = document.querySelector('.game-wrapper');
                if (gameWrapper) {
                    gameWrapper.appendChild(playerContainer);
                }
            }
            
            // Set up event listeners after adding to DOM
            this.setupPlayerControls();
            
            // Update initial state and track name
            this.updatePlayerUI();
            
            // Force update track name if we have tracks loaded
            if (this.tracks.length > 0) {
                const trackNameEl = document.getElementById('trackName');
                if (trackNameEl) {
                    const currentTrack = this.tracks[this.currentTrackIndex];
                    trackNameEl.textContent = currentTrack.name || 'Track ' + (this.currentTrackIndex + 1);
                }
            }
        }, 100);
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) {
            return '0:00';
        }
        
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    updateTimeDisplay() {
        const timeEl = document.getElementById('trackTime');
        if (timeEl && this.musicPlayer) {
            const currentTime = this.musicPlayer.currentTime || 0;
            const duration = this.musicPlayer.duration || 0;
            
            timeEl.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
        }
    }

    setupPlayerControls() {
        // Play/Pause button
        const playPauseBtn = document.getElementById('playPauseBtn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (this.isPlaying) {
                    this.pause();
                } else {
                    this.play();
                }
            });
        }
        
        // Previous track button
        const prevBtn = document.getElementById('prevTrack');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.previousTrack();
            });
        }
        
        // Next track button
        const nextBtn = document.getElementById('nextTrack');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.nextTrack();
            });
        }
        
        // Loop button
        const loopBtn = document.getElementById('loopBtn');
        if (loopBtn) {
            loopBtn.addEventListener('click', () => {
                this.toggleLoop();
            });
        }
        
        // Mute button
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.toggleMute();
            });
        }
        
        // Volume slider
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeDisplay = document.getElementById('volumeDisplay');
        if (volumeSlider) {
            volumeSlider.value = this.volume * 100;
            volumeSlider.addEventListener('input', (e) => {
                this.setVolume(e.target.value / 100);
                if (volumeDisplay) {
                    volumeDisplay.textContent = `${Math.round(e.target.value)}%`;
                }
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Spacebar for play/pause (only if not typing)
            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                if (this.isPlaying) {
                    this.pause();
                } else {
                    this.play();
                }
            }
            // Arrow keys for track navigation
            if (e.code === 'ArrowLeft' && e.ctrlKey) {
                this.previousTrack();
            }
            if (e.code === 'ArrowRight' && e.ctrlKey) {
                this.nextTrack();
            }
            // L key for loop toggle
            if (e.code === 'KeyL' && e.ctrlKey) {
                e.preventDefault();
                this.toggleLoop();
            }
        });
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.updateLoopButton();
        this.savePreferences();
    }

    updateLoopButton() {
        const loopBtn = document.getElementById('loopBtn');
        if (loopBtn) {
            if (this.isLooping) {
                loopBtn.classList.add('active');
                loopBtn.title = 'Loop Current Track (ON)';
            } else {
                loopBtn.classList.remove('active');
                loopBtn.title = 'Loop Current Track (OFF)';
            }
        }
    }

    loadTrack(index) {
        if (index < 0 || index >= this.tracks.length) return;
        
        this.currentTrackIndex = index;
        const track = this.tracks[index];
        
        // Update track name display immediately
        const trackNameEl = document.getElementById('trackName');
        if (trackNameEl) {
            trackNameEl.textContent = track.name || 'Track ' + (index + 1);
        }
        
        // Reset time display
        this.updateTimeDisplay();
        
        this.musicPlayer.src = track.url;
        this.musicPlayer.load();
        
        // If was playing, continue playing the new track
        if (this.isPlaying) {
            this.play();
        }
    }

    play() {
        if (this.musicPlayer && this.musicPlayer.src) {
            this.musicPlayer.play().then(() => {
                this.isPlaying = true;
                this.updatePlayerUI();
                this.savePreferences();
            }).catch((error) => {
                console.error('Playback failed:', error);
                // Browser might block autoplay, show play button
                this.isPlaying = false;
                this.updatePlayerUI();
            });
        }
    }

    pause() {
        if (this.musicPlayer) {
            this.musicPlayer.pause();
            this.isPlaying = false;
            this.updatePlayerUI();
            this.savePreferences();
        }
    }

    nextTrack() {
        const nextIndex = (this.currentTrackIndex + 1) % this.tracks.length;
        this.loadTrack(nextIndex);
    }

    previousTrack() {
        const prevIndex = (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;
        this.loadTrack(prevIndex);
    }

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.musicPlayer) {
            this.musicPlayer.volume = this.isMuted ? 0 : this.volume;
        }
        
        // Update slider if needed
        const slider = document.getElementById('volumeSlider');
        if (slider && slider.value !== this.volume * 100) {
            slider.value = this.volume * 100;
        }
        
        this.savePreferences();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.musicPlayer) {
            this.musicPlayer.volume = this.isMuted ? 0 : this.volume;
        }
        this.updatePlayerUI();
        this.savePreferences();
    }

    updatePlayerUI() {
        // Update play/pause button
        const playIcon = document.querySelector('.play-icon');
        const pauseIcon = document.querySelector('.pause-icon');
        if (playIcon && pauseIcon) {
            playIcon.style.display = this.isPlaying ? 'none' : 'block';
            pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
        }
        
        // Update mute button
        const volumeIcon = document.querySelector('.volume-icon');
        const muteIcon = document.querySelector('.mute-icon');
        if (volumeIcon && muteIcon) {
            volumeIcon.style.display = this.isMuted ? 'none' : 'block';
            muteIcon.style.display = this.isMuted ? 'block' : 'none';
        }
        
        // Update old music toggle if it exists (for compatibility)
        const oldToggle = document.querySelector('.music-toggle');
        if (oldToggle) {
            oldToggle.textContent = this.isPlaying ? '🎵' : '🔇';
        }
    }

    handlePlaybackError() {
        console.error('Failed to load track:', this.tracks[this.currentTrackIndex]);
        // Try next track
        if (this.tracks.length > 1) {
            this.nextTrack();
        }
    }

    // Save preferences to localStorage
    savePreferences() {
        const prefs = {
            volume: this.volume,
            isMuted: this.isMuted,
            isPlaying: this.isPlaying,
            currentTrackIndex: this.currentTrackIndex
        };
        localStorage.setItem('letterbloom-audio-prefs', JSON.stringify(prefs));
    }

    // Load preferences from localStorage
    loadPreferences() {
        const saved = localStorage.getItem('letterbloom-audio-prefs');
        if (saved) {
            try {
                const prefs = JSON.parse(saved);
                this.volume = prefs.volume ?? 0.1;
                this.isMuted = prefs.isMuted ?? false;
                this.isPlaying = prefs.isPlaying ?? false;
                this.currentTrackIndex = prefs.currentTrackIndex ?? 0;
            } catch (e) {
                console.error('Failed to load audio preferences:', e);
            }
        }
    }

    // Legacy compatibility methods
    toggleMusic() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    // --- Sound effects: soft lo-fi clicks and dings ------------------------

    // The building block for every UI sound: an oscillator routed through a
    // low-pass filter with a gentle attack. The filter darkens the tone and
    // the soft attack removes the digital "edge".
    _tone({ freq, endFreq = null, time = 0, duration = 0.3, volume = 0.1, type = 'triangle', cutoff = 1500, attack = 0.015 }) {
        const ctx = this.audioContext;
        const start = ctx.currentTime + time;

        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq) {
            osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
        }

        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.5;

        const peak = Math.max(0.001, volume * this.sfxVolume);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + duration + 0.05);
    }

    // A soft "ding": warm sine fundamental plus a quiet octave shimmer.
    _ding(freq, { time = 0, duration = 0.5, volume = 0.09 } = {}) {
        this._tone({ freq, time, duration, volume, type: 'sine', cutoff: 2200, attack: 0.02 });
        this._tone({ freq: freq * 2, time, duration: duration * 0.7, volume: volume * 0.25, type: 'sine', cutoff: 2600, attack: 0.02 });
    }

    playSound(type) {
        if (!this.audioContext || this.isMuted) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        switch (type) {
            case 'click':
                // Muted, woody tap
                this._tone({ freq: 620, endFreq: 480, duration: 0.09, volume: 0.07, cutoff: 900, attack: 0.005 });
                break;
            case 'success':
                // Gentle rising two-note ding (C5 -> G5)
                this._ding(523.25, { duration: 0.45, volume: 0.08 });
                this._ding(783.99, { time: 0.09, duration: 0.55, volume: 0.06 });
                break;
            case 'alreadyFound':
                // Single neutral ding - "yes, you have that one already"
                this._ding(659.25, { duration: 0.4, volume: 0.06 });
                break;
            case 'error':
                // Soft low knock - noticeable but not punishing
                this._tone({ freq: 220, endFreq: 175, duration: 0.22, volume: 0.07, cutoff: 600, attack: 0.008 });
                break;
            case 'levelComplete':
                // Slow, mellow C - E - G arpeggio with a final octave shimmer
                this._ding(523.25, { time: 0, duration: 0.5, volume: 0.08 });
                this._ding(659.25, { time: 0.16, duration: 0.5, volume: 0.07 });
                this._ding(783.99, { time: 0.32, duration: 0.6, volume: 0.07 });
                this._ding(1046.5, { time: 0.48, duration: 0.9, volume: 0.06 });
                break;
            case 'menuOpen':
                // Soft upward breath
                this._tone({ freq: 500, endFreq: 750, duration: 0.12, volume: 0.05, type: 'sine', cutoff: 1200, attack: 0.01 });
                break;
            case 'menuClose':
                // Soft downward breath
                this._tone({ freq: 700, endFreq: 470, duration: 0.12, volume: 0.05, type: 'sine', cutoff: 1200, attack: 0.01 });
                break;
        }
    }
}