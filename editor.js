/**
 * Sync Editor
 * Creates sync files for playing Guitar Pro tabs with real audio
 */

class SyncEditor {
    constructor() {
        this.wavesurfer = null;
        this.alphaTab = null;
        this.score = null;
        this.audioFile = null;
        this.gpFile = null;
        this.gpFileData = null; // Store the raw GP file data (Uint8Array)
        this.gpFileDataBase64 = null; // Store GP file as base64 for library
        this.audioFileData = null; // Store raw audio file data for library (base64)
        this.gpFileName = null; // Store filename for library
        this.audioFileName = null; // Store filename for library
        
        // Library project
        this.projectId = null;
        this.projectSaved = false;
        this.autoSaveTimeout = null;
        this.isSaving = false;
        
        // Beat markers: array of { bar: number, time: number (in seconds) }
        this.beatMarkers = [];
        this.currentBarToMark = 1;
        this.totalBars = 0;
        this.barTickMap = {};
        
        // Playback state
        this.isPlaying = false;
        this.playbackSpeed = 1.0;
        this.lastSyncedBar = 0;
        this.lastTick = 0;
        
        // Mode: 'edit' or 'preview'
        this.currentMode = 'edit';
        
        // DOM Elements
        this.elements = {
            // File inputs
            gpFileInput: document.getElementById('gpFileInput'),
            audioFileInput: document.getElementById('audioFileInput'),
            gpDropZone: document.getElementById('gpDropZone'),
            audioDropZone: document.getElementById('audioDropZone'),
            gpFileName: document.getElementById('gpFileName'),
            audioFileName: document.getElementById('audioFileName'),
            gpStatus: document.getElementById('gpStatus'),
            audioStatus: document.getElementById('audioStatus'),
            syncStatus: document.getElementById('syncStatus'),
            
            // Project
            projectName: document.getElementById('projectName'),
            
            // Waveform
            waveformContainer: document.getElementById('waveform'),
            waveformCurrentTime: document.getElementById('waveformCurrentTime'),
            waveformTotalTime: document.getElementById('waveformTotalTime'),
            beatMarkersContainer: document.getElementById('beatMarkers'),
            
            // Tap controls
            tapBtn: document.getElementById('tapBtn'),
            currentBarNumber: document.getElementById('currentBarNumber'),
            barSublabel: document.getElementById('barSublabel'),
            undoBtn: document.getElementById('undoBtn'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            
            // Playback controls
            playPauseBtn: document.getElementById('playPauseBtn'),
            skipBackBtn: document.getElementById('skipBackBtn'),
            rewindBtn: document.getElementById('rewindBtn'),
            forwardBtn: document.getElementById('forwardBtn'),
            skipForwardBtn: document.getElementById('skipForwardBtn'),
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),
            
            // Notation
            notationPreview: document.getElementById('notationPreview'),
            trackSelect: document.getElementById('trackSelect'),
            
            // Stats
            totalBars: document.getElementById('totalBars'),
            markersSet: document.getElementById('markersSet'),
            audioDuration: document.getElementById('audioDuration'),
            syncProgressBar: document.getElementById('syncProgressBar'),
            
            // Timeline
            markersTimeline: document.getElementById('markersTimeline'),
            
            // Actions
            exportBtn: document.getElementById('exportBtn'),
            loadSyncBtn: document.getElementById('loadSyncBtn'),
            loadSyncInput: document.getElementById('loadSyncInput'),
            
            // Share Modal
            shareModal: document.getElementById('shareModal'),
            closeShareModal: document.getElementById('closeShareModal'),
            closeShareModalBtn: document.getElementById('closeShareModalBtn'),
            shareBtn: document.getElementById('shareBtn'),
            exportTitle: document.getElementById('exportTitle'),
            exportArtist: document.getElementById('exportArtist'),
            summaryBars: document.getElementById('summaryBars'),
            
            // Share elements
            generateStandalonePlayer: document.getElementById('generateStandalonePlayer'),
            directLinkOutput: document.getElementById('directLinkOutput'),
            embedCodeOutput: document.getElementById('embedCodeOutput'),
            embedWidth: document.getElementById('embedWidth'),
            embedHeight: document.getElementById('embedHeight'),
            
            // Loading
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            
            // Mode toggle
            editorContainer: document.querySelector('.editor-container'),
            editModeBtn: document.getElementById('editModeBtn'),
            previewModeBtn: document.getElementById('previewModeBtn'),
        };
        
        this.init();
    }
    
    init() {
        console.log('SyncEditor init() starting...');
        this.bindEvents();
        console.log('bindEvents() complete');
        this.initWavesurfer();
        console.log('initWavesurfer() complete, wavesurfer:', this.wavesurfer ? 'created' : 'null');
        this.checkForOpenProject();
    }
    
    async checkForOpenProject() {
        // Check URL for project ID
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        
        if (!projectId) return;
        
        this.showLoading('Loading project from library...');
        console.log('Opening project:', projectId);
        
        try {
            // Load project from IndexedDB
            const project = await window.TabLibrary.loadProject(projectId);
            
            console.log('Loaded project:', project);
            console.log('Has gpFileData:', !!project?.gpFileData, 'length:', project?.gpFileData?.length);
            console.log('Has audioFileData:', !!project?.audioFileData, 'length:', project?.audioFileData?.length);
            
            if (!project) {
                this.hideLoading();
                alert('Project not found in library.');
                return;
            }
            
            this.projectId = project.id;
            this.beatMarkers = project.markers || [];
            this.currentBarToMark = this.beatMarkers.length + 1;
            
            // Set title/artist
            this.elements.projectName.textContent = project.title;
            this.elements.exportTitle.value = project.title;
            this.elements.exportArtist.value = project.artist;
            
            // Load GP file
            if (project.gpFileData) {
                console.log('Loading GP file from project, data length:', project.gpFileData.length);
                // Store the base64 data directly for later saving
                this.gpFileDataBase64 = project.gpFileData;
                this.gpFileData = new Uint8Array(this.base64ToArrayBuffer(project.gpFileData));
                this.gpFileName = project.gpFileName || 'unknown.gp';
                this.elements.gpFileName.textContent = this.gpFileName;
                this.elements.gpDropZone.classList.add('has-file');
                this.elements.gpStatus.textContent = 'Loading...';
                
                if (!this.alphaTab) {
                    this.initAlphaTab();
                }
                this.alphaTab.load(this.gpFileData);
            } else {
                console.warn('No GP file data in project!');
            }
            
            // Load audio file
            if (project.audioFileData) {
                console.log('Loading audio file from project, data length:', project.audioFileData.length);
                // Ensure wavesurfer is initialized
                if (!this.wavesurfer) {
                    this.initWavesurfer();
                }
                
                if (!this.wavesurfer) {
                    this.hideLoading();
                    alert('Failed to initialize audio player.');
                    return;
                }
                
                // Store the base64 data directly for later saving
                this.audioFileData = project.audioFileData;
                this.audioFileName = project.audioFileName || 'unknown.mp3';
                // Determine audio type from filename or default to mpeg
                const audioType = this.audioFileName.toLowerCase().endsWith('.wav') ? 'audio/wav' 
                    : this.audioFileName.toLowerCase().endsWith('.ogg') ? 'audio/ogg'
                    : 'audio/mpeg';
                const audioBlob = this.base64ToBlob(project.audioFileData, audioType);
                this.elements.audioFileName.textContent = this.audioFileName;
                this.elements.audioDropZone.classList.add('has-file');
                this.elements.audioStatus.textContent = 'Loading...';
                
                // Remove placeholder
                const placeholder = this.elements.waveformContainer.querySelector('.waveform-placeholder');
                if (placeholder) placeholder.remove();
                
                try {
                    await this.wavesurfer.loadBlob(audioBlob);
                } catch (err) {
                    console.error('Failed to load audio from library:', err);
                    this.hideLoading();
                    this.elements.audioStatus.textContent = 'Error';
                    alert('Failed to load audio file from library.');
                    return;
                }
            } else {
                console.warn('No audio file data in project!');
            }
            
            // Clean URL without reloading
            window.history.replaceState({}, document.title, 'editor.html');
            
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
    
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192; // Process in chunks to avoid call stack issues
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }
    
    base64ToBlob(base64, type) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return new Blob([array], { type });
    }
    
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    initWavesurfer() {
        // Prevent double initialization
        if (this.wavesurfer) {
            console.log('Wavesurfer already initialized');
            return;
        }
        
        // Check if container exists
        if (!this.elements.waveformContainer) {
            console.error('Waveform container element not found!');
            return;
        }
        
        console.log('Creating WaveSurfer instance...');
        try {
            this.wavesurfer = WaveSurfer.create({
                container: this.elements.waveformContainer,
                waveColor: '#3d4450',
                progressColor: '#00d4aa',
                cursorColor: '#ff6b6b',
                cursorWidth: 2,
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
                height: 'auto',
                normalize: true,
                backend: 'WebAudio'
            });
            
            if (!this.wavesurfer) {
                console.error('WaveSurfer.create() returned null/undefined');
                alert('Failed to initialize audio waveform. Please refresh the page.');
                return;
            }
            
            console.log('WaveSurfer created successfully');
        } catch (err) {
            console.error('Failed to create WaveSurfer:', err);
            alert('Failed to initialize audio waveform. Please refresh the page.');
            return;
        }
        
        this.wavesurfer.on('ready', () => {
            // Clear loading timeout
            if (this.audioLoadTimeout) {
                clearTimeout(this.audioLoadTimeout);
                this.audioLoadTimeout = null;
            }
            this.hideLoading();
            this.enableAudioControls(true);
            const duration = this.wavesurfer.getDuration();
            this.elements.waveformTotalTime.textContent = this.formatTime(duration);
            this.elements.audioDuration.textContent = this.formatTimeShort(duration);
            this.elements.audioStatus.textContent = 'Loaded';
            this.elements.audioStatus.classList.add('complete');
            this.updateTapButtonState();
            
            // Update markers display now that we have duration
            // (needed when loading project from library with existing markers)
            this.updateMarkersDisplay();
        });
        
        this.wavesurfer.on('error', (err) => {
            console.error('WaveSurfer error:', err);
            // Clear loading timeout
            if (this.audioLoadTimeout) {
                clearTimeout(this.audioLoadTimeout);
                this.audioLoadTimeout = null;
            }
            this.hideLoading();
            this.elements.audioStatus.textContent = 'Error';
            this.elements.audioStatus.classList.remove('complete');
            alert('Failed to load audio file. Please try a different file format (MP3, WAV, OGG).');
        });
        
        this.wavesurfer.on('loading', (percent) => {
            // Update loading progress
            this.elements.audioStatus.textContent = `Loading... ${percent}%`;
            this.elements.loadingText.textContent = `Loading audio file... ${percent}%`;
        });
        
        this.wavesurfer.on('decode', () => {
            // Audio has been decoded, now rendering waveform
            this.elements.audioStatus.textContent = 'Rendering waveform...';
            this.elements.loadingText.textContent = 'Rendering waveform...';
        });
        
        this.wavesurfer.on('audioprocess', () => {
            const currentTime = this.wavesurfer.getCurrentTime();
            this.elements.waveformCurrentTime.textContent = this.formatTime(currentTime);
            this.highlightCurrentBar(currentTime);
        });
        
        this.wavesurfer.on('seeking', () => {
            const currentTime = this.wavesurfer.getCurrentTime();
            this.elements.waveformCurrentTime.textContent = this.formatTime(currentTime);
            // Sync notation when seeking
            this.lastSyncedBar = 0; // Reset to force sync
            this.highlightCurrentBar(currentTime);
        });
        
        this.wavesurfer.on('play', () => {
            this.isPlaying = true;
            this.updatePlayButton();
        });
        
        this.wavesurfer.on('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
        
        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
    }
    
    initAlphaTab() {
        this.elements.notationPreview.innerHTML = '';
        
        const settings = {
            core: {
                fontDirectory: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/',
                file: null,
                tracks: [0]
            },
            display: {
                staveProfile: 'Default',
                layoutMode: 'Horizontal',
                scale: 0.8,
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
                    scoreTitle: false,
                    scoreSubTitle: false,
                    scoreArtist: false,
                    scoreAlbum: false,
                    scoreWords: false,
                    scoreMusic: false,
                    scoreCopyright: false,
                    guitarTuning: true
                }
            },
            player: {
                enablePlayer: true,
                enableCursor: true,
                enableUserInteraction: true,
                soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2',
                scrollElement: this.elements.notationPreview,
                scrollMode: 'Continuous'
            }
        };
        
        this.alphaTab = new alphaTab.AlphaTabApi(this.elements.notationPreview, settings);
        
        this.alphaTab.scoreLoaded.on((score) => {
            this.onScoreLoaded(score);
        });
        
        this.alphaTab.renderFinished.on(() => {
            this.hideLoading();
            this.buildBarTickMap();
        });
        
        this.alphaTab.playerReady.on(() => {
            // Mute alphaTab's audio - we only use it for cursor/highlighting
            this.alphaTab.masterVolume = 0;
            this.alphaTab.metronomeVolume = 0;
        });
        
        // Start continuous scroll tracking for notation
        this.startNotationScrollTracking();
    }
    
    startNotationScrollTracking() {
        const trackCursor = () => {
            if (this.isPlaying) {
                this.keepNotationCursorInView();
            }
            this.notationScrollAnimationId = requestAnimationFrame(trackCursor);
        };
        trackCursor();
    }
    
    keepNotationCursorInView() {
        const cursor = this.elements.notationPreview.querySelector('.at-cursor-beat');
        if (!cursor) return;
        
        const container = this.elements.notationPreview;
        const cursorRect = cursor.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // For horizontal layout, track X position
        // Target: keep cursor about 1/3 from the left
        const targetX = containerRect.left + (containerRect.width * 0.33);
        const currentX = cursorRect.left;
        const diffX = currentX - targetX;
        
        // Only scroll if cursor is significantly off from target
        if (Math.abs(diffX) > 20) {
            container.scrollLeft += diffX * 0.15;
        }
        
        // Also track Y position for vertical scroll if needed
        const targetY = containerRect.top + (containerRect.height * 0.4);
        const currentY = cursorRect.top;
        const diffY = currentY - targetY;
        
        if (Math.abs(diffY) > 20) {
            container.scrollTop += diffY * 0.15;
        }
    }
    
    buildBarTickMap() {
        // Build a map of bar number -> tick position for scrolling
        this.barTickMap = {};
        const tickCache = this.alphaTab.tickCache;
        if (tickCache && tickCache.masterBars) {
            tickCache.masterBars.forEach((bar, i) => {
                this.barTickMap[i + 1] = { start: bar.start, end: bar.end };
            });
        }
    }
    
    scrollToBar(barNumber) {
        if (!this.alphaTab || !this.barTickMap || !this.barTickMap[barNumber]) return;
        
        const barTicks = this.barTickMap[barNumber];
        try {
            this.alphaTab.tickPosition = barTicks.start;
        } catch (e) {
            // Ignore scroll errors
        }
    }
    
    bindEvents() {
        // File inputs
        this.elements.gpFileInput.addEventListener('change', (e) => {
            this.loadGPFile(e.target.files[0]);
        });
        
        this.elements.audioFileInput.addEventListener('change', (e) => {
            this.loadAudioFile(e.target.files[0]);
        });
        
        // Load sync file
        this.elements.loadSyncBtn.addEventListener('click', () => {
            this.elements.loadSyncInput.click();
        });
        
        this.elements.loadSyncInput.addEventListener('change', (e) => {
            this.loadSyncFile(e.target.files[0]);
        });
        
        // Drop zones
        this.setupDropZone(this.elements.gpDropZone, this.elements.gpFileInput);
        this.setupDropZone(this.elements.audioDropZone, this.elements.audioFileInput);
        
        // Tap button
        this.elements.tapBtn.addEventListener('click', () => this.recordBeatMarker());
        
        // Undo/Clear
        this.elements.undoBtn.addEventListener('click', () => this.undoLastMarker());
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAllMarkers());
        
        // Playback controls
        this.elements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.elements.skipBackBtn.addEventListener('click', () => this.skipToStart());
        this.elements.rewindBtn.addEventListener('click', () => this.rewind());
        this.elements.forwardBtn.addEventListener('click', () => this.forward());
        this.elements.skipForwardBtn.addEventListener('click', () => this.skipToEnd());
        
        // Speed slider
        this.elements.speedSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.playbackSpeed = value / 100;
            this.elements.speedValue.textContent = `${value}%`;
            if (this.wavesurfer) {
                this.wavesurfer.setPlaybackRate(this.playbackSpeed);
            }
        });
        
        // Track selection
        this.elements.trackSelect.addEventListener('change', (e) => {
            const trackIndex = parseInt(e.target.value);
            if (!isNaN(trackIndex) && this.score) {
                this.alphaTab.renderTracks([this.score.tracks[trackIndex]]);
            }
        });
        
        // Share Modal
        this.elements.shareBtn.addEventListener('click', () => this.showShareModal());
        this.elements.closeShareModal.addEventListener('click', () => this.hideShareModal());
        this.elements.closeShareModalBtn.addEventListener('click', () => this.hideShareModal());
        
        // Share modal backdrop click
        this.elements.shareModal.addEventListener('click', (e) => {
            if (e.target === this.elements.shareModal) {
                this.hideShareModal();
            }
        });
        
        // Share/Embed
        this.elements.generateStandalonePlayer.addEventListener('click', () => this.generateStandalonePlayer());
        this.elements.embedWidth.addEventListener('input', () => this.updateEmbedCode());
        this.elements.embedHeight.addEventListener('input', () => this.updateEmbedCode());
        
        // Copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => this.copyToClipboard(btn));
        });
        
        // Mode toggle
        this.elements.editModeBtn.addEventListener('click', () => this.setMode('edit'));
        this.elements.previewModeBtn.addEventListener('click', () => this.setMode('preview'));
        
        // Auto-save when title/artist change (with debounce)
        if (this.elements.exportTitle) {
            this.elements.exportTitle.addEventListener('input', () => {
                // Update project name display
                this.elements.projectName.textContent = this.elements.exportTitle.value || 'Untitled';
                this.scheduleAutoSave();
            });
        }
        if (this.elements.exportArtist) {
            this.elements.exportArtist.addEventListener('input', () => {
                this.scheduleAutoSave();
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't handle shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'KeyT':
                    e.preventDefault();
                    this.recordBeatMarker();
                    break;
                case 'KeyZ':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        this.undoLastMarker();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.rewind();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.forward();
                    break;
                case 'Home':
                    e.preventDefault();
                    this.skipToStart();
                    break;
                case 'End':
                    e.preventDefault();
                    this.skipToEnd();
                    break;
                case 'Escape':
                    if (this.currentMode === 'preview') {
                        this.setMode('edit');
                    } else {
                        this.hideExportModal();
                    }
                    break;
                case 'KeyP':
                    // Toggle preview mode if possible
                    if (this.beatMarkers.length > 0 && this.score && this.wavesurfer) {
                        this.setMode(this.currentMode === 'edit' ? 'preview' : 'edit');
                    }
                    break;
            }
        });
    }
    
    setupDropZone(zone, input) {
        // Only add click handler if zone is not a label containing the input
        // (labels naturally trigger their contained inputs)
        if (zone.tagName !== 'LABEL' || !zone.contains(input)) {
            zone.addEventListener('click', (e) => {
                e.preventDefault();
                input.click();
            });
        }
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    
    loadGPFile(file) {
        if (!file) return;
        
        this.gpFile = file;
        this.gpFileName = file.name; // Store filename for saving
        this.showLoading('Loading Guitar Pro file...');
        
        // Update UI
        this.elements.gpFileName.textContent = file.name;
        this.elements.gpDropZone.classList.add('has-file');
        this.elements.gpStatus.textContent = 'Loading...';
        
        // Update project name
        const songName = file.name.replace(/\.[^/.]+$/, '');
        this.elements.projectName.textContent = songName;
        
        // Initialize alphaTab if needed
        if (!this.alphaTab) {
            this.initAlphaTab();
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.gpFileData = new Uint8Array(e.target.result);
            // Also convert to base64 for library saving
            this.gpFileDataBase64 = this.arrayBufferToBase64(e.target.result);
            console.log('GP file converted to base64, length:', this.gpFileDataBase64?.length);
            this.alphaTab.load(this.gpFileData);
        };
        reader.onerror = () => {
            this.hideLoading();
            this.elements.gpStatus.textContent = 'Error';
            alert('Failed to load Guitar Pro file');
        };
        reader.readAsArrayBuffer(file);
    }
    
    async loadAudioFile(file) {
        console.log('loadAudioFile called with:', file?.name);
        if (!file) return;
        
        // Ensure wavesurfer is initialized
        if (!this.wavesurfer) {
            console.warn('Wavesurfer not initialized, initializing now...');
            this.initWavesurfer();
        }
        
        console.log('Wavesurfer state:', this.wavesurfer ? 'ready' : 'still null');
        
        if (!this.wavesurfer) {
            alert('Failed to initialize audio player. Please refresh the page.');
            return;
        }
        
        this.audioFile = file;
        this.audioFileName = file.name; // Store filename for saving
        this.showLoading('Loading audio file...');
        
        // Convert to base64 for library saving (do this first, synchronously wait)
        try {
            this.audioFileData = await this.fileToBase64(file);
            console.log('Audio converted to base64, length:', this.audioFileData?.length);
        } catch (err) {
            console.error('Failed to convert audio to base64:', err);
        }
        
        // Update UI
        this.elements.audioFileName.textContent = file.name;
        this.elements.audioDropZone.classList.add('has-file');
        this.elements.audioStatus.textContent = 'Loading...';
        
        // Remove placeholder
        const placeholder = this.elements.waveformContainer.querySelector('.waveform-placeholder');
        if (placeholder) placeholder.remove();
        
        // Set a timeout in case loading hangs
        this.audioLoadTimeout = setTimeout(() => {
            if (this.elements.audioStatus.textContent === 'Loading...') {
                this.hideLoading();
                this.elements.audioStatus.textContent = 'Timeout';
                alert('Audio loading timed out. Please try a smaller file or different format.');
            }
        }, 30000); // 30 second timeout
        
        // Load into wavesurfer - use Promise for better error handling
        try {
            await this.wavesurfer.loadBlob(file);
            // Note: 'ready' event will handle success UI updates
        } catch (err) {
            console.error('WaveSurfer loadBlob error:', err);
            if (this.audioLoadTimeout) {
                clearTimeout(this.audioLoadTimeout);
                this.audioLoadTimeout = null;
            }
            this.hideLoading();
            this.elements.audioStatus.textContent = 'Error';
            alert('Failed to load audio file: ' + (err.message || 'Unknown error'));
        }
    }
    
    loadSyncFile(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const syncData = JSON.parse(e.target.result);
                this.applySyncData(syncData);
            } catch (err) {
                alert('Invalid sync file format');
            }
        };
        reader.readAsText(file);
    }
    
    applySyncData(syncData) {
        // Apply loaded sync data
        if (syncData.markers && Array.isArray(syncData.markers)) {
            this.beatMarkers = syncData.markers;
            this.currentBarToMark = this.beatMarkers.length + 1;
            
            // Update UI
            this.updateAllDisplays();
            
            // Set title/artist if present
            if (syncData.title) {
                this.elements.exportTitle.value = syncData.title;
                this.elements.projectName.textContent = syncData.title;
            }
            if (syncData.artist) {
                this.elements.exportArtist.value = syncData.artist;
            }
            
            // Prompt to load the associated files
            alert(`Sync data loaded with ${this.beatMarkers.length} markers.\n\nPlease load the GP file: ${syncData.gpFile || 'Unknown'}\nAnd audio file: ${syncData.audioFile || 'Unknown'}`);
        }
    }
    
    onScoreLoaded(score) {
        this.score = score;
        
        // Count total bars
        this.totalBars = score.masterBars.length;
        this.elements.totalBars.textContent = this.totalBars;
        
        // Update status
        this.elements.gpStatus.textContent = 'Loaded';
        this.elements.gpStatus.classList.add('complete');
        
        // Populate track selector
        this.elements.trackSelect.innerHTML = '';
        score.tracks.forEach((track, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = track.name || `Track ${index + 1}`;
            this.elements.trackSelect.appendChild(option);
        });
        
        // Reset markers if this is a new file
        if (this.beatMarkers.length === 0 || this.beatMarkers.length > this.totalBars) {
            this.beatMarkers = [];
            this.currentBarToMark = 1;
        }
        
        // Pre-fill export fields from score metadata
        if (score.title) this.elements.exportTitle.value = score.title;
        if (score.artist) this.elements.exportArtist.value = score.artist;
        
        this.updateAllDisplays();
        this.hideLoading();
    }
    
    recordBeatMarker() {
        if (!this.wavesurfer || !this.score) return;
        if (this.currentBarToMark > this.totalBars) return;
        
        const currentTime = this.wavesurfer.getCurrentTime();
        
        // Add marker
        this.beatMarkers.push({
            bar: this.currentBarToMark,
            time: currentTime
        });
        
        // Advance to next bar
        this.currentBarToMark++;
        
        // Update everything
        this.updateAllDisplays();
        
        // Scroll notation to the next bar to mark
        this.scrollToBar(this.currentBarToMark);
        
        // Visual feedback
        this.flashTapButton();
        
        // Schedule auto-save
        this.scheduleAutoSave();
    }
    
    flashTapButton() {
        this.elements.tapBtn.classList.add('tapped');
        setTimeout(() => {
            this.elements.tapBtn.classList.remove('tapped');
        }, 150);
    }
    
    undoLastMarker() {
        if (this.beatMarkers.length === 0) return;
        
        this.beatMarkers.pop();
        this.currentBarToMark--;
        
        this.updateAllDisplays();
        
        // Schedule auto-save
        this.scheduleAutoSave();
    }
    
    clearAllMarkers() {
        if (this.beatMarkers.length === 0) return;
        if (!confirm('Clear all beat markers? This cannot be undone.')) return;
        
        this.beatMarkers = [];
        this.currentBarToMark = 1;
        
        this.updateAllDisplays();
        
        // Schedule auto-save (will save empty markers if project exists)
        this.scheduleAutoSave();
    }
    
    updateAllDisplays() {
        this.updateCurrentBarDisplay();
        this.updateMarkersDisplay();
        this.updateMarkersTimeline();
        this.updateSyncStats();
        this.updateButtonStates();
    }
    
    updateCurrentBarDisplay() {
        if (this.totalBars === 0) {
            this.elements.currentBarNumber.textContent = '—';
            this.elements.barSublabel.textContent = 'Load files to begin';
            return;
        }
        
        if (this.currentBarToMark > this.totalBars) {
            this.elements.currentBarNumber.textContent = '✓';
            this.elements.currentBarNumber.classList.add('complete');
            this.elements.barSublabel.textContent = 'All bars marked!';
        } else {
            this.elements.currentBarNumber.textContent = this.currentBarToMark;
            this.elements.currentBarNumber.classList.remove('complete');
            this.elements.barSublabel.textContent = `of ${this.totalBars} bars`;
        }
    }
    
    updateMarkersDisplay() {
        this.elements.beatMarkersContainer.innerHTML = '';
        
        if (!this.wavesurfer) return;
        const duration = this.wavesurfer.getDuration();
        if (duration === 0) return;
        
        this.beatMarkers.forEach((marker) => {
            const percent = (marker.time / duration) * 100;
            const el = document.createElement('div');
            el.className = 'beat-marker';
            el.style.left = `${percent}%`;
            el.dataset.bar = `Bar ${marker.bar}`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.wavesurfer.seekTo(marker.time / duration);
            });
            this.elements.beatMarkersContainer.appendChild(el);
        });
    }
    
    updateMarkersTimeline() {
        if (this.totalBars === 0) {
            this.elements.markersTimeline.innerHTML = '<div class="timeline-empty">Load files to see bar timeline</div>';
            return;
        }
        
        const container = document.createElement('div');
        container.className = 'timeline-markers';
        
        for (let i = 1; i <= this.totalBars; i++) {
            const marker = this.beatMarkers.find(m => m.bar === i);
            const el = document.createElement('div');
            el.className = 'timeline-marker' + (marker ? ' set' : '');
            el.dataset.bar = i;
            el.innerHTML = `
                <span class="marker-bar">${i}</span>
                <span class="marker-time">${marker ? this.formatTimeShort(marker.time) : '—'}</span>
            `;
            
            if (marker) {
                el.addEventListener('click', () => {
                    if (this.wavesurfer) {
                        const duration = this.wavesurfer.getDuration();
                        this.wavesurfer.seekTo(marker.time / duration);
                        // Also scroll notation to this bar
                        this.scrollToBar(marker.bar);
                    }
                });
            }
            
            container.appendChild(el);
        }
        
        this.elements.markersTimeline.innerHTML = '';
        this.elements.markersTimeline.appendChild(container);
    }
    
    updateSyncStats() {
        this.elements.markersSet.textContent = this.beatMarkers.length;
        this.elements.syncStatus.textContent = `${this.beatMarkers.length} / ${this.totalBars} bars`;
        
        // Update progress bar
        const percent = this.totalBars > 0 ? (this.beatMarkers.length / this.totalBars) * 100 : 0;
        this.elements.syncProgressBar.style.width = `${percent}%`;
    }
    
    updateButtonStates() {
        const hasMarkers = this.beatMarkers.length > 0;
        const canTap = this.score && this.wavesurfer && this.wavesurfer.getDuration() > 0 && this.currentBarToMark <= this.totalBars;
        const canPreview = hasMarkers && this.score && this.wavesurfer && this.wavesurfer.getDuration() > 0;
        const canSave = hasMarkers && this.score && this.wavesurfer && this.wavesurfer.getDuration() > 0;
        const canShare = hasMarkers && this.score && this.wavesurfer && this.wavesurfer.getDuration() > 0;
        
        this.elements.undoBtn.disabled = !hasMarkers;
        this.elements.clearAllBtn.disabled = !hasMarkers;
        this.elements.shareBtn.disabled = !canShare;
        this.elements.tapBtn.disabled = !canTap;
        this.elements.previewModeBtn.disabled = !canPreview;
    }
    
    setMode(mode) {
        if (mode === this.currentMode) return;
        
        this.currentMode = mode;
        
        // Update mode toggle buttons
        this.elements.editModeBtn.classList.toggle('active', mode === 'edit');
        this.elements.previewModeBtn.classList.toggle('active', mode === 'preview');
        
        // Update container class
        this.elements.editorContainer.classList.toggle('preview-mode', mode === 'preview');
        
        if (mode === 'preview') {
            // Stop any playing audio when entering preview
            if (this.wavesurfer && this.isPlaying) {
                this.wavesurfer.pause();
            }
            // Reset to beginning for preview
            if (this.wavesurfer) {
                this.wavesurfer.seekTo(0);
            }
            // Ensure notation scrolls to start
            this.scrollToBar(1);
        } else {
            // Entering edit mode - reset any preview state
            if (this.wavesurfer && this.isPlaying) {
                this.wavesurfer.pause();
            }
        }
    }
    
    updateTapButtonState() {
        const hasGP = this.score !== null;
        const hasAudio = this.wavesurfer && this.wavesurfer.getDuration() > 0;
        const notComplete = this.currentBarToMark <= this.totalBars;
        
        this.elements.tapBtn.disabled = !(hasGP && hasAudio && notComplete);
    }
    
    highlightCurrentBar(currentTime) {
        // Find which bar we're in based on markers
        let currentBar = 0;
        let currentBarTime = 0;
        let nextBarTime = null;
        
        for (let i = 0; i < this.beatMarkers.length; i++) {
            if (currentTime >= this.beatMarkers[i].time) {
                currentBar = this.beatMarkers[i].bar;
                currentBarTime = this.beatMarkers[i].time;
                nextBarTime = this.beatMarkers[i + 1]?.time || null;
            } else {
                break;
            }
        }
        
        // Highlight in timeline
        const timelineMarkers = this.elements.markersTimeline.querySelectorAll('.timeline-marker');
        timelineMarkers.forEach((el) => {
            const bar = parseInt(el.dataset.bar);
            el.classList.toggle('current', bar === currentBar);
        });
        
        // Sync notation - scroll to current bar and interpolate position within bar
        if (currentBar > 0 && currentBar !== this.lastSyncedBar) {
            this.lastSyncedBar = currentBar;
            this.scrollToBar(currentBar);
        }
        
        // Interpolate tick position within the bar for smoother cursor movement
        if (currentBar > 0 && this.barTickMap && this.barTickMap[currentBar]) {
            const barTicks = this.barTickMap[currentBar];
            
            // Calculate progress within bar
            let progress = 0;
            if (nextBarTime && nextBarTime > currentBarTime) {
                const barDuration = nextBarTime - currentBarTime;
                const timeInBar = currentTime - currentBarTime;
                progress = Math.min(1, Math.max(0, timeInBar / barDuration));
            }
            
            // Interpolate tick position
            const tick = Math.floor(barTicks.start + (barTicks.end - barTicks.start) * progress);
            
            // Only update every few ticks to reduce jitter
            if (!this.lastTick || Math.abs(tick - this.lastTick) > 100) {
                this.lastTick = tick;
                try {
                    this.alphaTab.tickPosition = tick;
                } catch (e) {}
            }
        }
    }
    
    // Playback controls
    togglePlayPause() {
        if (!this.wavesurfer) return;
        this.wavesurfer.playPause();
    }
    
    skipToStart() {
        if (!this.wavesurfer) return;
        this.wavesurfer.seekTo(0);
    }
    
    skipToEnd() {
        if (!this.wavesurfer) return;
        this.wavesurfer.seekTo(0.999);
    }
    
    rewind() {
        if (!this.wavesurfer) return;
        const currentTime = this.wavesurfer.getCurrentTime();
        const duration = this.wavesurfer.getDuration();
        const newTime = Math.max(0, currentTime - 5);
        this.wavesurfer.seekTo(newTime / duration);
    }
    
    forward() {
        if (!this.wavesurfer) return;
        const currentTime = this.wavesurfer.getCurrentTime();
        const duration = this.wavesurfer.getDuration();
        const newTime = Math.min(duration, currentTime + 5);
        this.wavesurfer.seekTo(newTime / duration);
    }
    
    updatePlayButton() {
        const playIcon = this.elements.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.elements.playPauseBtn.querySelector('.pause-icon');
        
        playIcon.style.display = this.isPlaying ? 'none' : 'block';
        pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
    }
    
    enableAudioControls(enabled) {
        this.elements.playPauseBtn.disabled = !enabled;
        this.elements.skipBackBtn.disabled = !enabled;
        this.elements.rewindBtn.disabled = !enabled;
        this.elements.forwardBtn.disabled = !enabled;
        this.elements.skipForwardBtn.disabled = !enabled;
        
        this.updateTapButtonState();
    }
    
    // Share functionality
    async showShareModal() {
        // Pre-fill title/artist from score if available
        if (this.score) {
            if (!this.elements.exportTitle.value) {
                this.elements.exportTitle.value = this.score.title || '';
            }
            if (!this.elements.exportArtist.value) {
                this.elements.exportArtist.value = this.score.artist || '';
            }
        }
        
        // Update summary
        this.elements.summaryBars.textContent = `${this.beatMarkers.length}/${this.totalBars} bars`;
        
        // Ensure project is saved to get project ID for embed codes
        if (!this.projectId && this.gpFileDataBase64 && this.audioFileData) {
            this.showLoading('Saving project...');
            await this.autoSave();
            this.hideLoading();
        }
        
        // Generate embed code automatically
        this.generateEmbedCode();
        
        this.elements.shareModal.classList.add('visible');
    }
    
    hideShareModal() {
        this.elements.shareModal.classList.remove('visible');
    }
    
    generateEmbedCode() {
        if (!this.projectId) {
            this.elements.directLinkOutput.value = 'Save project first to generate embed code';
            this.elements.embedCodeOutput.value = 'Save project first to generate embed code';
            return;
        }
        
        // Get base URL (same origin as current page)
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
        const embedUrl = `${baseUrl}sync-embed.html?project=${this.projectId}`;
        
        // Set direct link
        this.elements.directLinkOutput.value = embedUrl;
        
        // Generate embed code
        this.updateEmbedCode();
    }
    
    updateEmbedCode() {
        if (!this.projectId) return;
        
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
        const embedUrl = `${baseUrl}sync-embed.html?project=${this.projectId}`;
        
        const width = this.elements.embedWidth.value || '100%';
        const height = this.elements.embedHeight.value || '450';
        
        const embedCode = `<iframe src="${embedUrl}" width="${width}" height="${height}" style="border: none; border-radius: 8px;" allowfullscreen allow="autoplay"></iframe>`;
        this.elements.embedCodeOutput.value = embedCode;
    }
    
    async generateStandalonePlayer() {
        this.showLoading('Generating standalone player...');
        
        try {
            // Get base64 data for GP and audio files
            let gpBase64 = null;
            let audioBase64 = null;
            
            if (this.gpFile) {
                gpBase64 = await this.fileToBase64(this.gpFile);
            } else if (this.gpFileData) {
                gpBase64 = btoa(String.fromCharCode.apply(null, this.gpFileData));
            }
            
            if (this.audioFile) {
                audioBase64 = await this.fileToBase64(this.audioFile);
            } else if (this.audioFileData) {
                audioBase64 = this.audioFileData;
            }
            
            if (!gpBase64 || !audioBase64) {
                throw new Error('Missing GP or audio file data');
            }
            
            // Build sync data
            const syncData = {
                title: this.elements.exportTitle.value || this.score?.title || 'Untitled',
                artist: this.elements.exportArtist.value || this.score?.artist || 'Unknown Artist',
                markers: this.beatMarkers,
                totalBars: this.totalBars
            };
            
            // Generate the standalone HTML
            const html = this.buildStandalonePlayerHTML(syncData, gpBase64, audioBase64);
            
            // Download the file
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const filename = `${syncData.title.replace(/[^a-z0-9]/gi, '_')}_player.html`;
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            
            URL.revokeObjectURL(url);
            this.hideLoading();
            
            // Show success notification
            this.showNotification('Standalone player downloaded! Upload it to any web server to share.');
            
        } catch (e) {
            console.error('Failed to generate standalone player:', e);
            this.hideLoading();
            alert('Failed to generate standalone player. Please try again.');
        }
    }
    
    buildStandalonePlayerHTML(syncData, gpBase64, audioBase64) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(syncData.title)} - ${this.escapeHtml(syncData.artist)}</title>
    <script src="https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/alphaTab.min.js"><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; }
        .player-container { height: 100vh; display: flex; flex-direction: column; }
        .player-header { padding: 12px 16px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
        .track-info h1 { font-size: 1rem; font-weight: 600; }
        .track-info p { font-size: 0.8rem; color: #8b949e; }
        .controls { display: flex; align-items: center; gap: 12px; }
        .play-btn { width: 44px; height: 44px; background: linear-gradient(135deg, #00d4aa, #00a884); border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .play-btn svg { width: 20px; height: 20px; fill: #0d1117; }
        .play-btn.playing .play-icon { display: none; }
        .play-btn:not(.playing) .pause-icon { display: none; }
        .progress-container { padding: 8px 16px; background: #161b22; }
        .progress-bar { height: 4px; background: #30363d; border-radius: 2px; cursor: pointer; }
        .progress-fill { height: 100%; background: #00d4aa; border-radius: 2px; width: 0%; transition: width 0.1s; }
        .notation-container { flex: 1; overflow: auto; background: #0d1117; }
        .at-cursor-bar { background: rgba(0, 212, 170, 0.15) !important; }
        .at-highlight * { fill: #00d4aa !important; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="player-header">
            <div class="track-info">
                <h1>${this.escapeHtml(syncData.title)}</h1>
                <p>${this.escapeHtml(syncData.artist)}</p>
            </div>
            <div class="controls">
                <button class="play-btn" id="playBtn">
                    <svg class="play-icon" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                    <svg class="pause-icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
            </div>
        </div>
        <div class="progress-container">
            <div class="progress-bar" id="progressBar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
        </div>
        <div class="notation-container" id="notation"></div>
    </div>
    <script>
        const syncData = ${JSON.stringify(syncData)};
        const gpData = "${gpBase64}";
        const audioData = "${audioBase64}";
        
        let api, audioCtx, audioBuffer, source, gainNode;
        let isPlaying = false, startedAt = 0, pausedAt = 0, duration = 0;
        let barTickMap = [];
        
        function base64ToArrayBuffer(b64) {
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr.buffer;
        }
        
        async function init() {
            // Init alphaTab
            api = new alphaTab.AlphaTabApi(document.getElementById('notation'), {
                core: { fontDirectory: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/' },
                display: { layoutMode: 'Horizontal', scale: 0.9, resources: { staffLineColor: '#30363d', barSeparatorColor: '#30363d', mainGlyphColor: '#e6edf3', secondaryGlyphColor: '#8b949e' } },
                notation: { elements: { scoreTitle: false, scoreSubTitle: false, scoreArtist: false, scoreAlbum: false, scoreWords: false, scoreMusic: false, scoreCopyright: false } },
                player: { enablePlayer: true, enableCursor: true, soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2', scrollElement: document.getElementById('notation'), scrollMode: 'Continuous' }
            });
            
            api.renderFinished.on(() => {
                if (api.tickCache && api.tickCache.masterBars) {
                    barTickMap = api.tickCache.masterBars.map(b => ({ start: b.start, end: b.end }));
                }
            });
            
            api.playerReady.on(() => { api.masterVolume = 0; api.metronomeVolume = 0; });
            api.load(new Uint8Array(base64ToArrayBuffer(gpData)));
            
            // Init audio
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
            audioBuffer = await audioCtx.decodeAudioData(base64ToArrayBuffer(audioData));
            duration = audioBuffer.duration;
            
            // Events
            document.getElementById('playBtn').onclick = togglePlay;
            document.getElementById('progressBar').onclick = (e) => {
                const rect = e.target.getBoundingClientRect();
                seekTo((e.clientX - rect.left) / rect.width * duration);
            };
        }
        
        function togglePlay() {
            if (isPlaying) pause(); else play();
        }
        
        function play() {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(gainNode);
            source.start(0, pausedAt);
            startedAt = audioCtx.currentTime - pausedAt;
            isPlaying = true;
            document.getElementById('playBtn').classList.add('playing');
            update();
        }
        
        function pause() {
            if (source) source.stop();
            pausedAt = audioCtx.currentTime - startedAt;
            isPlaying = false;
            document.getElementById('playBtn').classList.remove('playing');
        }
        
        function seekTo(time) {
            const wasPlaying = isPlaying;
            if (isPlaying) { source.stop(); isPlaying = false; }
            pausedAt = time;
            if (wasPlaying) play();
            updateCursor(time);
        }
        
        function update() {
            if (!isPlaying) return;
            const currentTime = audioCtx.currentTime - startedAt;
            if (currentTime >= duration) { pause(); pausedAt = 0; return; }
            document.getElementById('progressFill').style.width = (currentTime / duration * 100) + '%';
            updateCursor(currentTime);
            requestAnimationFrame(update);
        }
        
        function updateCursor(time) {
            let bar = 0;
            for (let i = 0; i < syncData.markers.length; i++) {
                if (time >= syncData.markers[i].time) bar = syncData.markers[i].bar;
            }
            if (bar > 0 && barTickMap[bar - 1]) {
                try { api.tickPosition = barTickMap[bar - 1].start; } catch(e) {}
            }
        }
        
        init();
    <\/script>
</body>
</html>`;
    }
    
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    showNotification(message) {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = 'toast-notification';
        notification.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);
        requestAnimationFrame(() => notification.classList.add('visible'));
        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
    
    copyToClipboard(btn) {
        const targetId = btn.dataset.target;
        const target = document.getElementById(targetId);
        
        if (!target) return;
        
        target.select();
        document.execCommand('copy');
        
        // Visual feedback
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    }
    
    // Schedule an auto-save after a short delay (debounced)
    scheduleAutoSave() {
        // Only auto-save if we have the required data
        if (!this.score || !this.wavesurfer || this.beatMarkers.length === 0) {
            return;
        }
        
        // Clear any existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        // Schedule save after 2 seconds of inactivity
        this.autoSaveTimeout = setTimeout(() => {
            this.autoSave();
        }, 2000);
    }
    
    // Silent auto-save (no loading overlay, minimal notification)
    async autoSave() {
        // Skip if already saving or missing required data
        if (this.isSaving || !this.score || !this.wavesurfer || this.beatMarkers.length === 0) {
            return;
        }
        
        this.isSaving = true;
        
        console.log('Auto-save starting, current state:', {
            gpFileDataBase64: !!this.gpFileDataBase64,
            gpFileDataBase64Length: this.gpFileDataBase64?.length,
            audioFileData: !!this.audioFileData,
            audioFileDataLength: this.audioFileData?.length,
            gpFileName: this.gpFileName,
            audioFileName: this.audioFileName,
            projectId: this.projectId
        });
        
        try {
            // Use stored base64 data, or convert if needed
            let gpBase64 = this.gpFileDataBase64;
            let audioBase64 = this.audioFileData;
            
            // Convert GP file if base64 not available
            if (!gpBase64 && this.gpFile) {
                gpBase64 = await this.fileToBase64(this.gpFile);
                this.gpFileDataBase64 = gpBase64;
            } else if (!gpBase64 && this.gpFileData) {
                // Convert Uint8Array to base64 using chunked method
                gpBase64 = this.arrayBufferToBase64(this.gpFileData.buffer);
                this.gpFileDataBase64 = gpBase64;
            }
            
            // Convert audio file if base64 not available
            if (!audioBase64 && this.audioFile) {
                audioBase64 = await this.fileToBase64(this.audioFile);
                this.audioFileData = audioBase64;
            }
            
            // Need both files for auto-save
            if (!gpBase64 || !audioBase64) {
                console.log('Auto-save skipped: missing file data', { gpBase64: !!gpBase64, audioBase64: !!audioBase64 });
                this.isSaving = false;
                return;
            }
            
            const projectData = {
                id: this.projectId,
                title: this.elements.exportTitle.value || this.score.title || 'Untitled',
                artist: this.elements.exportArtist.value || this.score.artist || 'Unknown Artist',
                gpFileName: this.gpFileName || 'unknown.gp',
                audioFileName: this.audioFileName || 'unknown.mp3',
                gpFileData: gpBase64,
                audioFileData: audioBase64,
                markers: this.beatMarkers,
                totalBars: this.totalBars,
                audioDuration: this.wavesurfer.getDuration()
            };
            
            console.log('Auto-saving project:', {
                id: projectData.id,
                title: projectData.title,
                gpFileName: projectData.gpFileName,
                audioFileName: projectData.audioFileName,
                hasGpData: !!projectData.gpFileData,
                gpDataLength: projectData.gpFileData?.length,
                hasAudioData: !!projectData.audioFileData,
                audioDataLength: projectData.audioFileData?.length,
                markersCount: projectData.markers?.length
            });
            
            const saved = await window.TabLibrary.saveToLibrary(projectData);
            this.projectId = saved.id;
            this.projectSaved = true;
            
            console.log('Auto-save complete, project ID:', saved.id);
            
            // Show brief auto-save indicator
            this.showAutoSaveIndicator();
            
        } catch (e) {
            console.error('Auto-save failed:', e);
        }
        
        this.isSaving = false;
    }
    
    showAutoSaveIndicator() {
        // Remove existing indicator
        const existing = document.querySelector('.auto-save-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.className = 'auto-save-indicator';
        indicator.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
            <span>Saved</span>
        `;
        document.body.appendChild(indicator);
        
        // Animate and remove
        requestAnimationFrame(() => {
            indicator.classList.add('visible');
            setTimeout(() => {
                indicator.classList.remove('visible');
                setTimeout(() => indicator.remove(), 300);
            }, 1500);
        });
    }
    
    async saveToLibrary() {
        if (!this.score || !this.wavesurfer) {
            alert('Please load both GP and audio files first.');
            return;
        }
        
        if (this.beatMarkers.length === 0) {
            alert('Please add at least one sync marker before saving.');
            return;
        }
        
        // Cancel any pending auto-save
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
        
        this.isSaving = true;
        this.showLoading('Saving to library...');
        
        try {
            // Use stored base64 data, or convert if needed
            let gpBase64 = this.gpFileDataBase64;
            let audioBase64 = this.audioFileData;
            
            // Convert GP file if base64 not available
            if (!gpBase64 && this.gpFile) {
                gpBase64 = await this.fileToBase64(this.gpFile);
                this.gpFileDataBase64 = gpBase64;
            } else if (!gpBase64 && this.gpFileData) {
                // Convert Uint8Array to base64 using chunked method
                gpBase64 = this.arrayBufferToBase64(this.gpFileData.buffer);
                this.gpFileDataBase64 = gpBase64;
            }
            
            // Convert audio file if base64 not available
            if (!audioBase64 && this.audioFile) {
                audioBase64 = await this.fileToBase64(this.audioFile);
                this.audioFileData = audioBase64;
            }
            
            const projectData = {
                id: this.projectId, // Will be null for new projects
                title: this.elements.exportTitle.value || this.score.title || 'Untitled',
                artist: this.elements.exportArtist.value || this.score.artist || 'Unknown Artist',
                gpFileName: this.gpFileName || 'unknown.gp',
                audioFileName: this.audioFileName || 'unknown.mp3',
                gpFileData: gpBase64,
                audioFileData: audioBase64,
                markers: this.beatMarkers,
                totalBars: this.totalBars,
                audioDuration: this.wavesurfer.getDuration()
            };
            
            // Use the static save method from library.js
            const saved = await window.TabLibrary.saveToLibrary(projectData);
            this.projectId = saved.id;
            this.projectSaved = true;
            
            this.hideLoading();
            this.showSaveNotification();
            
        } catch (e) {
            console.error('Failed to save to library:', e);
            this.hideLoading();
            alert('Failed to save to library. Please try again.');
        }
        
        this.isSaving = false;
    }
    
    showSaveNotification() {
        // Remove existing notification if present
        const existing = document.querySelector('.save-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = 'save-notification';
        notification.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
            <span>Saved to Library</span>
            <a href="library.html">View Library →</a>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.classList.add('visible');
        });
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }
    
    // Utility functions
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
    
    formatTimeShort(seconds) {
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
    window.syncEditor = new SyncEditor();
});
