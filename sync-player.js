/**
 * Synced Player
 * Plays Guitar Pro tabs synced with real audio recordings
 */

class SyncedPlayer {
    constructor() {
        this.alphaTab = null;
        this.audioContext = null;
        this.audioBuffer = null;
        this.audioSource = null;
        this.gainNode = null;
        
        this.score = null;
        this.syncData = null;
        this.gpFile = null;
        this.gpFileData = null;
        this.audioFile = null;
        this.audioFileData = null;
        
        // Playback state
        this.isPlaying = false;
        this.isLooping = false;
        this.currentTime = 0;
        this.duration = 0;
        this.playbackRate = 1.0;
        this.volume = 0.8;
        this.startedAt = 0;
        this.pausedAt = 0;
        
        // Animation frame for updates
        this.animationFrame = null;
        
        // Current bar tracking
        this.currentBar = 0;
        this.totalBars = 0;
        
        // Tick cache for cursor positioning
        this.barTickMap = []; // Maps bar number to {startTick, endTick}
        
        // Sync offset - delay notation slightly so it doesn't appear ahead of audio
        // Negative value = notation is delayed (behind audio)
        this.notationOffset = -0.15; // 150ms delay
        
        // DOM Elements
        this.elements = {
            // File inputs
            syncFileInput: document.getElementById('syncFileInput'),
            gpFileInput: document.getElementById('gpFileInput'),
            audioFileInput: document.getElementById('audioFileInput'),
            
            // Upload cards
            syncUploadCard: document.getElementById('syncUploadCard'),
            gpUploadCard: document.getElementById('gpUploadCard'),
            audioUploadCard: document.getElementById('audioUploadCard'),
            syncStatus: document.getElementById('syncStatus'),
            gpStatus: document.getElementById('gpStatus'),
            audioStatus: document.getElementById('audioStatus'),
            startPlaybackBtn: document.getElementById('startPlaybackBtn'),
            
            // Track info
            trackTitle: document.getElementById('trackTitle'),
            trackArtist: document.getElementById('trackArtist'),
            trackList: document.getElementById('trackList'),
            
            // Notation
            alphaTabContainer: document.getElementById('alphaTab'),
            welcomeScreen: document.getElementById('welcomeScreen'),
            
            // Bar indicator
            currentBar: document.getElementById('currentBar'),
            totalBars: document.getElementById('totalBars'),
            
            // Playback controls
            playPauseBtn: document.getElementById('playPauseBtn'),
            stopBtn: document.getElementById('stopBtn'),
            prevBarBtn: document.getElementById('prevBarBtn'),
            nextBarBtn: document.getElementById('nextBarBtn'),
            loopBtn: document.getElementById('loopBtn'),
            
            // Time & progress
            currentTime: document.getElementById('currentTime'),
            totalTime: document.getElementById('totalTime'),
            progressFill: document.getElementById('progressFill'),
            progressCursor: document.getElementById('progressCursor'),
            progressBar: document.getElementById('progressBar'),
            barMarkers: document.getElementById('barMarkers'),
            
            // Volume & tempo
            tempoSlider: document.getElementById('tempoSlider'),
            tempoValue: document.getElementById('tempoValue'),
            volumeSlider: document.getElementById('volumeSlider'),
            
            // Badge
            audioSourceBadge: document.getElementById('audioSourceBadge'),
            
            // Loading
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText')
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.checkForLibraryProject();
    }
    
    async checkForLibraryProject() {
        // Check URL for project ID
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        
        if (!projectId) return;
        
        this.showLoading('Loading project from library...');
        
        try {
            // Load project from IndexedDB
            const project = await window.TabLibrary.loadProject(projectId);
            
            if (!project) {
                this.hideLoading();
                alert('Project not found in library.');
                return;
            }
            
            // Set sync data
            this.syncData = {
                title: project.title,
                artist: project.artist,
                markers: project.markers,
                totalBars: project.totalBars
            };
            
            // Mark sync as loaded
            this.elements.syncStatus.textContent = '✓ Loaded';
            this.elements.syncStatus.classList.add('loaded');
            this.elements.syncUploadCard.classList.add('loaded');
            
            // Load GP file
            if (project.gpFileData) {
                const gpArrayBuffer = this.base64ToArrayBuffer(project.gpFileData);
                this.gpFileData = new Uint8Array(gpArrayBuffer);
                this.elements.gpStatus.textContent = '✓ Loaded';
                this.elements.gpStatus.classList.add('loaded');
                this.elements.gpUploadCard.classList.add('loaded');
            }
            
            // Load audio file
            if (project.audioFileData) {
                this.audioFileData = this.base64ToArrayBuffer(project.audioFileData);
                this.elements.audioStatus.textContent = '✓ Loaded';
                this.elements.audioStatus.classList.add('loaded');
                this.elements.audioUploadCard.classList.add('loaded');
            }
            
            // Clean URL without reloading
            window.history.replaceState({}, document.title, 'sync-player.html');
            
            // Check if all files are ready
            this.checkAllFilesReady();
            
            this.hideLoading();
            
        } catch (e) {
            console.error('Failed to load project from library:', e);
            this.hideLoading();
            alert('Failed to load project. Please try again.');
        }
    }
    
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return array.buffer;
    }
    
    checkAllFilesReady() {
        const hasSync = this.syncData !== null;
        const hasGP = this.gpFileData !== null;
        const hasAudio = this.audioFileData !== null;
        
        if (hasSync && hasGP && hasAudio) {
            this.elements.startPlaybackBtn.disabled = false;
        }
    }
    
    bindEvents() {
        // File inputs
        this.elements.syncFileInput.addEventListener('change', (e) => {
            this.loadSyncFile(e.target.files[0]);
        });
        
        this.elements.gpFileInput.addEventListener('change', (e) => {
            this.loadGPFile(e.target.files[0]);
        });
        
        this.elements.audioFileInput.addEventListener('change', (e) => {
            this.loadAudioFile(e.target.files[0]);
        });
        
        // Start playback button
        this.elements.startPlaybackBtn.addEventListener('click', () => {
            this.startPlayback();
        });
        
        // Playback controls
        this.elements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.elements.stopBtn.addEventListener('click', () => this.stop());
        this.elements.prevBarBtn.addEventListener('click', () => this.previousBar());
        this.elements.nextBarBtn.addEventListener('click', () => this.nextBar());
        this.elements.loopBtn.addEventListener('click', () => this.toggleLoop());
        
        // Tempo slider
        this.elements.tempoSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.playbackRate = value / 100;
            this.elements.tempoValue.textContent = `${value}%`;
            
            if (this.audioSource) {
                this.audioSource.playbackRate.value = this.playbackRate;
            }
        });
        
        // Volume slider
        this.elements.volumeSlider.addEventListener('input', (e) => {
            this.volume = parseInt(e.target.value) / 100;
            if (this.gainNode) {
                this.gainNode.gain.value = this.volume;
            }
        });
        
        // Progress bar seeking
        this.elements.progressBar.addEventListener('click', (e) => {
            if (this.duration === 0) return;
            const rect = this.elements.progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.seekTo(percent * this.duration);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'Escape':
                    this.stop();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.previousBar();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextBar();
                    break;
                case 'KeyL':
                    this.toggleLoop();
                    break;
            }
        });
    }
    
    // ==========================================
    // File Loading
    // ==========================================
    
    loadSyncFile(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.syncData = JSON.parse(e.target.result);
                this.onSyncDataLoaded();
            } catch (err) {
                alert('Invalid sync file format');
            }
        };
        reader.readAsText(file);
    }
    
    onSyncDataLoaded() {
        this.elements.trackTitle.textContent = this.syncData.title || 'Untitled';
        this.elements.trackArtist.textContent = this.syncData.artist || 'Unknown Artist';
        
        document.title = `${this.syncData.title || 'Untitled'} - TabPlayer`;
        
        this.totalBars = this.syncData.totalBars || 0;
        this.elements.totalBars.textContent = this.totalBars;
        
        // Update sync card status
        this.elements.syncUploadCard.classList.add('loaded');
        this.elements.syncStatus.textContent = '✓ Loaded';
        
        this.updateStartButton();
    }
    
    loadGPFile(file) {
        if (!file) return;
        
        this.gpFile = file;
        this.gpFileData = null;
        
        // Update GP card status
        this.elements.gpUploadCard.classList.add('loaded');
        this.elements.gpStatus.textContent = '✓ ' + file.name.substring(0, 15) + (file.name.length > 15 ? '...' : '');
        
        // Read the file data but don't load into alphaTab yet
        const reader = new FileReader();
        reader.onload = (e) => {
            this.gpFileData = new Uint8Array(e.target.result);
            this.updateStartButton();
        };
        reader.onerror = () => {
            alert('Failed to read Guitar Pro file');
            this.elements.gpUploadCard.classList.remove('loaded');
            this.elements.gpStatus.textContent = 'Click to select';
        };
        reader.readAsArrayBuffer(file);
    }
    
    loadAudioFile(file) {
        if (!file) return;
        
        this.audioFile = file;
        this.audioFileData = null;
        
        // Update audio card status
        this.elements.audioUploadCard.classList.add('loaded');
        this.elements.audioStatus.textContent = '✓ ' + file.name.substring(0, 15) + (file.name.length > 15 ? '...' : '');
        
        // Read the file data but don't decode yet
        const reader = new FileReader();
        reader.onload = (e) => {
            this.audioFileData = e.target.result;
            this.updateStartButton();
        };
        reader.onerror = () => {
            alert('Failed to read audio file');
            this.elements.audioUploadCard.classList.remove('loaded');
            this.elements.audioStatus.textContent = 'Click to select';
        };
        reader.readAsArrayBuffer(file);
    }
    
    initAlphaTab() {
        const settings = {
            core: {
                fontDirectory: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/',
                file: null,
                tracks: 'all'
            },
            display: {
                staveProfile: 'Default',
                layoutMode: 'Page',
                scale: 1.0,
                stretchForce: 0.8,
                resources: {
                    staffLineColor: '#3d4450',
                    barSeparatorColor: '#3d4450',
                    mainGlyphColor: '#e6edf3',
                    secondaryGlyphColor: '#8b949e',
                    scoreInfoColor: '#e6edf3',
                    barNumberColor: '#8b949e'
                }
            },
            notation: {
                elements: {
                    scoreTitle: true,
                    scoreSubTitle: true,
                    scoreArtist: true,
                    scoreAlbum: true,
                    scoreWords: true,
                    scoreMusic: true,
                    scoreCopyright: true,
                    guitarTuning: true
                }
            },
            player: {
                enablePlayer: true,
                enableCursor: true,
                enableUserInteraction: true,
                scrollElement: this.elements.alphaTabContainer,
                scrollMode: 'Continuous',
                // Load soundfont but we'll mute it
                soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2'
            }
        };
        
        this.alphaTab = new alphaTab.AlphaTabApi(this.elements.alphaTabContainer, settings);
        
        this.alphaTab.scoreLoaded.on((score) => {
            this.onScoreLoaded(score);
        });
        
        this.alphaTab.playerReady.on(() => {
            // Mute the alphaTab player - we only want the cursor, not its audio
            this.alphaTab.masterVolume = 0;
            this.alphaTab.metronomeVolume = 0;
            this.buildBarTickMap();
            this.checkReadyToPlay();
        });
        
        this.alphaTab.renderStarted.on(() => {
            this.showLoading('Rendering notation...');
        });
        
        this.alphaTab.renderFinished.on(() => {
            this.hideLoading();
            this.renderBarMarkers();
            // Build tick map if player is already ready
            if (this.alphaTab.isReadyForPlayback) {
                this.buildBarTickMap();
            }
        });
    }
    
    onScoreLoaded(score) {
        this.score = score;
        this.totalBars = score.masterBars.length;
        this.elements.totalBars.textContent = this.totalBars;
        
        this.populateTrackList(score.tracks);
        this.checkReadyToPlay();
    }
    
    buildBarTickMap() {
        // Build a mapping from bar numbers to tick positions
        this.barTickMap = [];
        
        if (!this.alphaTab || !this.alphaTab.tickCache) return;
        
        const tickCache = this.alphaTab.tickCache;
        if (tickCache.masterBars) {
            tickCache.masterBars.forEach((barInfo, index) => {
                this.barTickMap[index + 1] = {
                    start: barInfo.start,
                    end: barInfo.end
                };
            });
        }
    }
    
    populateTrackList(tracks) {
        this.elements.trackList.innerHTML = '';
        
        const colors = [
            '#00d4aa', '#ff6b6b', '#4ecdc4', '#ffe66d', 
            '#a29bfe', '#fd79a8', '#fdcb6e', '#74b9ff',
            '#55efc4', '#fab1a0', '#81ecec', '#dfe6e9'
        ];
        
        tracks.forEach((track, index) => {
            const trackEl = document.createElement('div');
            trackEl.className = 'track-item';
            trackEl.dataset.index = index;
            
            const color = colors[index % colors.length];
            
            trackEl.innerHTML = `
                <div class="track-color" style="background: ${color}"></div>
                <div class="track-details">
                    <div class="track-name">${track.name || `Track ${index + 1}`}</div>
                    <div class="track-instrument">${this.getInstrumentName(track)}</div>
                </div>
            `;
            
            trackEl.addEventListener('click', () => {
                this.selectTrack(index);
            });
            
            this.elements.trackList.appendChild(trackEl);
        });
        
        if (tracks.length > 0) {
            this.selectTrack(0);
        }
    }
    
    getInstrumentName(track) {
        if (track.staves && track.staves.length > 0) {
            const staff = track.staves[0];
            if (staff.isPercussion) return 'Drums';
            if (staff.stringTuning && staff.stringTuning.tunings) {
                const stringCount = staff.stringTuning.tunings.length;
                if (stringCount === 4) return 'Bass';
                if (stringCount === 6) return 'Guitar';
                if (stringCount === 7) return '7-String Guitar';
                return `${stringCount}-String`;
            }
        }
        return 'Instrument';
    }
    
    selectTrack(index) {
        const items = this.elements.trackList.querySelectorAll('.track-item');
        items.forEach((item, i) => {
            item.classList.toggle('active', i === index);
        });
        
        this.alphaTab.renderTracks([this.score.tracks[index]]);
    }
    
    updateStartButton() {
        const hasSync = this.syncData !== null;
        const hasGP = this.gpFileData !== null;
        const hasAudio = this.audioFileData !== null;
        
        this.elements.startPlaybackBtn.disabled = !(hasSync && hasGP && hasAudio);
    }
    
    startPlayback() {
        if (!this.syncData || !this.gpFileData || !this.audioFileData) return;
        
        this.showLoading('Loading files...');
        
        // Initialize alphaTab
        if (!this.alphaTab) {
            this.initAlphaTab();
        }
        
        // Load GP file into alphaTab
        this.alphaTab.load(this.gpFileData);
        
        // Initialize audio context and decode audio
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = this.volume;
        }
        
        this.audioContext.decodeAudioData(this.audioFileData.slice(0), (buffer) => {
            this.audioBuffer = buffer;
            this.duration = buffer.duration;
            this.elements.totalTime.textContent = this.formatTime(this.duration);
            this.elements.audioSourceBadge.classList.add('visible');
            
            // Hide welcome screen
            this.elements.welcomeScreen.style.display = 'none';
            
            this.checkReadyToPlay();
        }, (err) => {
            this.hideLoading();
            alert('Failed to decode audio file');
        });
    }
    
    checkReadyToPlay() {
        const hasSync = this.syncData && this.syncData.markers && this.syncData.markers.length > 0;
        const hasGP = this.score !== null;
        const hasAudio = this.audioBuffer !== null;
        
        // Enable playback if we have all required files
        // The tick map will be built async when player is ready
        if (hasSync && hasGP && hasAudio) {
            this.enablePlaybackControls(true);
        }
    }
    
    enablePlaybackControls(enabled) {
        this.elements.playPauseBtn.disabled = !enabled;
        this.elements.stopBtn.disabled = !enabled;
        this.elements.prevBarBtn.disabled = !enabled;
        this.elements.nextBarBtn.disabled = !enabled;
        this.elements.loopBtn.disabled = !enabled;
    }
    
    // ==========================================
    // Progress Bar Markers
    // ==========================================
    
    renderBarMarkers() {
        this.elements.barMarkers.innerHTML = '';
        
        if (!this.syncData || !this.syncData.markers || this.duration === 0) return;
        
        this.syncData.markers.forEach((marker) => {
            const percent = (marker.time / this.duration) * 100;
            const line = document.createElement('div');
            line.className = 'bar-marker-line';
            line.style.left = `${percent}%`;
            line.dataset.bar = marker.bar;
            this.elements.barMarkers.appendChild(line);
        });
    }
    
    // ==========================================
    // Playback Control
    // ==========================================
    
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        if (!this.audioBuffer) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        this.audioSource.playbackRate.value = this.playbackRate;
        this.audioSource.connect(this.gainNode);
        
        this.audioSource.onended = () => {
            if (this.isPlaying) {
                if (this.isLooping) {
                    this.seekTo(0);
                    this.play();
                } else {
                    this.stop();
                }
            }
        };
        
        const offset = this.pausedAt;
        this.startedAt = this.audioContext.currentTime - offset / this.playbackRate;
        this.audioSource.start(0, offset);
        
        this.isPlaying = true;
        this.updatePlayButton();
        this.startUpdateLoop();
    }
    
    pause() {
        if (!this.isPlaying) return;
        
        this.pausedAt = (this.audioContext.currentTime - this.startedAt) * this.playbackRate;
        
        if (this.audioSource) {
            this.audioSource.onended = null;
            this.audioSource.stop();
            this.audioSource = null;
        }
        
        this.isPlaying = false;
        this.updatePlayButton();
        this.stopUpdateLoop();
    }
    
    stop() {
        this.pause();
        this.pausedAt = 0;
        this.currentTime = 0;
        this.currentBar = 0;
        this.updateProgress();
        this.updateCursor();
        this.elements.currentBar.textContent = '1';
    }
    
    seekTo(time) {
        const wasPlaying = this.isPlaying;
        
        if (wasPlaying) {
            this.pause();
        }
        
        this.pausedAt = Math.max(0, Math.min(time, this.duration));
        this.currentTime = this.pausedAt;
        this.updateProgress();
        this.updateCursor();
        
        if (wasPlaying) {
            this.play();
        }
    }
    
    previousBar() {
        if (!this.syncData || !this.syncData.markers) return;
        
        let targetTime = 0;
        for (let i = this.syncData.markers.length - 1; i >= 0; i--) {
            if (this.syncData.markers[i].time < this.currentTime - 0.1) {
                targetTime = this.syncData.markers[i].time;
                break;
            }
        }
        
        this.seekTo(targetTime);
    }
    
    nextBar() {
        if (!this.syncData || !this.syncData.markers) return;
        
        for (const marker of this.syncData.markers) {
            if (marker.time > this.currentTime + 0.1) {
                this.seekTo(marker.time);
                return;
            }
        }
    }
    
    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.elements.loopBtn.classList.toggle('active', this.isLooping);
    }
    
    // ==========================================
    // Update Loop
    // ==========================================
    
    startUpdateLoop() {
        const update = () => {
            if (!this.isPlaying) return;
            
            this.currentTime = (this.audioContext.currentTime - this.startedAt) * this.playbackRate;
            
            if (this.currentTime >= this.duration) {
                this.currentTime = this.duration;
            }
            
            this.updateProgress();
            this.updateCursor();
            
            this.animationFrame = requestAnimationFrame(update);
        };
        
        this.animationFrame = requestAnimationFrame(update);
    }
    
    stopUpdateLoop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
    
    updateProgress() {
        this.elements.currentTime.textContent = this.formatTime(this.currentTime);
        
        const percent = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
        this.elements.progressFill.style.width = `${percent}%`;
        this.elements.progressCursor.style.left = `${percent}%`;
    }
    
    updateCursor() {
        if (!this.syncData || !this.syncData.markers) return;
        
        // Apply notation offset (negative = notation is delayed/behind audio)
        const adjustedTime = this.currentTime + this.notationOffset;
        
        // Find current bar and the next bar based on adjusted time
        let currentBarIndex = 0;
        let currentBarTime = 0;
        let nextBarTime = this.duration;
        
        for (let i = 0; i < this.syncData.markers.length; i++) {
            const marker = this.syncData.markers[i];
            if (adjustedTime >= marker.time) {
                currentBarIndex = i;
                currentBarTime = marker.time;
                // Get next bar time
                if (i + 1 < this.syncData.markers.length) {
                    nextBarTime = this.syncData.markers[i + 1].time;
                } else {
                    nextBarTime = this.duration;
                }
            } else {
                break;
            }
        }
        
        const currentMarker = this.syncData.markers[currentBarIndex];
        if (!currentMarker) return;
        
        const barNumber = currentMarker.bar;
        
        // Update bar indicator
        if (barNumber !== this.currentBar) {
            this.currentBar = barNumber;
            this.elements.currentBar.textContent = barNumber;
        }
        
        // Only update alphaTab cursor if tick map is ready
        if (this.barTickMap.length === 0) return;
        
        // Calculate interpolated tick position within the current bar
        const barTicks = this.barTickMap[barNumber];
        if (!barTicks) return;
        
        // How far through this bar are we (0 to 1)?
        const barDuration = nextBarTime - currentBarTime;
        const timeInBar = adjustedTime - currentBarTime;
        const barProgress = barDuration > 0 ? Math.min(1, Math.max(0, timeInBar / barDuration)) : 0;
        
        // Interpolate tick position
        const tickRange = barTicks.end - barTicks.start;
        const currentTick = Math.floor(barTicks.start + (tickRange * barProgress));
        
        // Update alphaTab cursor position
        try {
            this.alphaTab.tickPosition = currentTick;
        } catch (e) {
            // Ignore errors
        }
    }
    
    updatePlayButton() {
        const playIcon = this.elements.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.elements.playPauseBtn.querySelector('.pause-icon');
        
        playIcon.style.display = this.isPlaying ? 'none' : 'block';
        pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
    }
    
    // ==========================================
    // Utility Functions
    // ==========================================
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showLoading(text = 'Loading...') {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.add('visible');
    }
    
    hideLoading() {
        this.elements.loadingOverlay.classList.remove('visible');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.syncedPlayer = new SyncedPlayer();
});
