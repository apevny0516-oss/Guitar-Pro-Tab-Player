/**
 * TabPlayer Library
 * Manages saved tab sync projects using IndexedDB
 */

class TabLibrary {
    constructor() {
        this.db = null;
        this.projects = [];
        this.currentView = 'grid';
        this.currentSort = 'updated';
        this.searchQuery = '';
        this.selectedProjectId = null;
        
        // DOM Elements
        this.elements = {
            searchInput: document.getElementById('searchInput'),
            totalProjects: document.getElementById('totalProjects'),
            totalStorage: document.getElementById('totalStorage'),
            gridViewBtn: document.getElementById('gridViewBtn'),
            listViewBtn: document.getElementById('listViewBtn'),
            sortSelect: document.getElementById('sortSelect'),
            libraryContent: document.getElementById('libraryContent'),
            emptyState: document.getElementById('emptyState'),
            projectsGrid: document.getElementById('projectsGrid'),
            contextMenu: document.getElementById('contextMenu'),
            deleteModal: document.getElementById('deleteModal'),
            deleteProjectName: document.getElementById('deleteProjectName'),
            closeDeleteModal: document.getElementById('closeDeleteModal'),
            cancelDelete: document.getElementById('cancelDelete'),
            confirmDelete: document.getElementById('confirmDelete'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText')
        };
        
        this.init();
    }
    
    async init() {
        this.showLoading('Loading library...');
        await this.initDatabase();
        await this.loadProjects();
        this.bindEvents();
        this.hideLoading();
    }
    
    // ===================================
    // Database Operations
    // ===================================
    
    initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TabPlayerLibrary', 1);
            
            request.onerror = () => {
                console.error('Failed to open database');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                
                // Create projects store
                if (!db.objectStoreNames.contains('projects')) {
                    const store = db.createObjectStore('projects', { keyPath: 'id' });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('artist', 'artist', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
        });
    }
    
    async loadProjects() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();
            
            request.onsuccess = () => {
                this.projects = request.result || [];
                this.renderProjects();
                this.updateStats();
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to load projects');
                reject(request.error);
            };
        });
    }
    
    async saveProject(project) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            
            // Update timestamp
            project.updatedAt = new Date().toISOString();
            
            const request = store.put(project);
            
            request.onsuccess = () => {
                resolve(project);
            };
            
            request.onerror = () => {
                console.error('Failed to save project');
                reject(request.error);
            };
        });
    }
    
    async deleteProject(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.delete(id);
            
            request.onsuccess = () => {
                this.projects = this.projects.filter(p => p.id !== id);
                this.renderProjects();
                this.updateStats();
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to delete project');
                reject(request.error);
            };
        });
    }
    
    async getProject(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.get(id);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // ===================================
    // Event Bindings
    // ===================================
    
    bindEvents() {
        // Search
        this.elements.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderProjects();
        });
        
        // View toggle
        this.elements.gridViewBtn.addEventListener('click', () => this.setView('grid'));
        this.elements.listViewBtn.addEventListener('click', () => this.setView('list'));
        
        // Sort
        this.elements.sortSelect.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderProjects();
        });
        
        // Close context menu on click outside
        document.addEventListener('click', (e) => {
            if (!this.elements.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
        
        // Context menu actions
        this.elements.contextMenu.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleContextAction(action);
            });
        });
        
        // Delete modal
        this.elements.closeDeleteModal.addEventListener('click', () => this.hideDeleteModal());
        this.elements.cancelDelete.addEventListener('click', () => this.hideDeleteModal());
        this.elements.confirmDelete.addEventListener('click', () => this.confirmDeleteProject());
        
        this.elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === this.elements.deleteModal) {
                this.hideDeleteModal();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
                this.hideDeleteModal();
            }
        });
    }
    
    // ===================================
    // Rendering
    // ===================================
    
    renderProjects() {
        let filtered = this.projects;
        
        // Filter by search
        if (this.searchQuery) {
            filtered = filtered.filter(p => 
                p.title.toLowerCase().includes(this.searchQuery) ||
                p.artist.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // Sort
        filtered = this.sortProjects(filtered);
        
        // Show/hide empty state
        if (filtered.length === 0) {
            this.elements.emptyState.style.display = 'flex';
            this.elements.projectsGrid.style.display = 'none';
            return;
        }
        
        this.elements.emptyState.style.display = 'none';
        this.elements.projectsGrid.style.display = 'grid';
        
        // Render cards
        this.elements.projectsGrid.innerHTML = filtered.map(project => this.renderProjectCard(project)).join('');
        
        // Bind card events
        this.elements.projectsGrid.querySelectorAll('.project-card').forEach(card => {
            const id = card.dataset.id;
            
            // Double click to open
            card.addEventListener('dblclick', () => this.openProject(id));
            
            // Single click to select
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.project-menu-btn') && !e.target.closest('.project-action-btn')) {
                    this.selectProject(id);
                }
            });
            
            // Menu button
            const menuBtn = card.querySelector('.project-menu-btn');
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showContextMenu(e, id);
            });
            
            // Right click
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, id);
            });
            
            // Action buttons
            const playBtn = card.querySelector('.project-action-btn.play');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playProject(id);
                });
            }
            
            const editBtn = card.querySelector('.project-action-btn.edit');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openProject(id);
                });
            }
        });
    }
    
    renderProjectCard(project) {
        const syncPercent = project.totalBars > 0 
            ? Math.round((project.markers.length / project.totalBars) * 100) 
            : 0;
        const isComplete = syncPercent === 100;
        const updatedDate = new Date(project.updatedAt).toLocaleDateString();
        
        return `
            <div class="project-card" data-id="${project.id}">
                <div class="project-header">
                    <div class="project-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18V5l12-2v13"/>
                            <circle cx="6" cy="18" r="3"/>
                            <circle cx="18" cy="16" r="3"/>
                        </svg>
                    </div>
                    <h3 class="project-title">${this.escapeHtml(project.title)}</h3>
                    <p class="project-artist">${this.escapeHtml(project.artist)}</p>
                    <button class="project-menu-btn" title="More options">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"/>
                            <circle cx="12" cy="5" r="1"/>
                            <circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                </div>
                <div class="project-body">
                    <div class="project-stats">
                        <span class="project-stat ${isComplete ? 'complete' : ''}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="3" width="20" height="14" rx="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                            </svg>
                            ${project.markers.length}/${project.totalBars} bars
                        </span>
                        <span class="project-stat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12,6 12,12 16,14"/>
                            </svg>
                            ${this.formatDuration(project.audioDuration || 0)}
                        </span>
                    </div>
                    <div class="sync-progress">
                        <div class="sync-progress-fill" style="width: ${syncPercent}%"></div>
                    </div>
                    <div class="project-footer">
                        <span class="project-date">${updatedDate}</span>
                        <div class="project-actions">
                            <button class="project-action-btn play" title="Play">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="5,3 19,12 5,21"/>
                                </svg>
                            </button>
                            <button class="project-action-btn edit" title="Edit">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"/>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    sortProjects(projects) {
        const sorted = [...projects];
        
        switch (this.currentSort) {
            case 'updated':
                sorted.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                break;
            case 'created':
                sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'name':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'artist':
                sorted.sort((a, b) => a.artist.localeCompare(b.artist));
                break;
        }
        
        return sorted;
    }
    
    // ===================================
    // UI Actions
    // ===================================
    
    setView(view) {
        this.currentView = view;
        
        this.elements.gridViewBtn.classList.toggle('active', view === 'grid');
        this.elements.listViewBtn.classList.toggle('active', view === 'list');
        this.elements.projectsGrid.classList.toggle('list-view', view === 'list');
    }
    
    selectProject(id) {
        // Deselect previous
        this.elements.projectsGrid.querySelectorAll('.project-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Select new
        this.selectedProjectId = id;
        const card = this.elements.projectsGrid.querySelector(`[data-id="${id}"]`);
        if (card) {
            card.classList.add('selected');
        }
    }
    
    showContextMenu(e, projectId) {
        this.selectedProjectId = projectId;
        this.selectProject(projectId);
        
        const menu = this.elements.contextMenu;
        
        // Position menu
        let x = e.clientX;
        let y = e.clientY;
        
        // Adjust if off screen
        const menuRect = menu.getBoundingClientRect();
        if (x + 200 > window.innerWidth) x = window.innerWidth - 200;
        if (y + 250 > window.innerHeight) y = window.innerHeight - 250;
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.add('visible');
    }
    
    hideContextMenu() {
        this.elements.contextMenu.classList.remove('visible');
    }
    
    handleContextAction(action) {
        this.hideContextMenu();
        
        if (!this.selectedProjectId) return;
        
        switch (action) {
            case 'open':
                this.openProject(this.selectedProjectId);
                break;
            case 'play':
                this.playProject(this.selectedProjectId);
                break;
            case 'export':
                this.exportProject(this.selectedProjectId);
                break;
            case 'duplicate':
                this.duplicateProject(this.selectedProjectId);
                break;
            case 'delete':
                this.showDeleteModal(this.selectedProjectId);
                break;
        }
    }
    
    showDeleteModal(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        
        this.selectedProjectId = projectId;
        this.elements.deleteProjectName.textContent = project.title;
        this.elements.deleteModal.classList.add('visible');
    }
    
    hideDeleteModal() {
        this.elements.deleteModal.classList.remove('visible');
    }
    
    async confirmDeleteProject() {
        if (!this.selectedProjectId) return;
        
        this.showLoading('Deleting project...');
        await this.deleteProject(this.selectedProjectId);
        this.hideDeleteModal();
        this.hideLoading();
    }
    
    // ===================================
    // Project Actions
    // ===================================
    
    async openProject(id) {
        // Just pass the project ID - editor will load from IndexedDB
        window.location.href = `editor.html?project=${id}`;
    }
    
    async playProject(id) {
        // Just pass the project ID - player will load from IndexedDB
        window.location.href = `sync-player.html?project=${id}`;
    }
    
    async exportProject(id) {
        const project = await this.getProject(id);
        if (!project) return;
        
        // Export .tabsync file
        const syncData = {
            version: 2,
            title: project.title,
            artist: project.artist,
            gpFile: project.gpFileName,
            audioFile: project.audioFileName,
            totalBars: project.totalBars,
            markers: project.markers,
            createdAt: project.createdAt,
            exportedAt: new Date().toISOString()
        };
        
        const json = JSON.stringify(syncData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this.downloadFile(blob, `${project.title.replace(/[^a-z0-9]/gi, '_')}.tabsync`);
        
        // Also offer to download GP and audio files
        if (project.gpFileData) {
            const gpBlob = this.base64ToBlob(project.gpFileData, 'application/octet-stream');
            this.downloadFile(gpBlob, project.gpFileName);
        }
        
        if (project.audioFileData) {
            const audioBlob = this.base64ToBlob(project.audioFileData, 'audio/mpeg');
            this.downloadFile(audioBlob, project.audioFileName);
        }
    }
    
    async duplicateProject(id) {
        const project = await this.getProject(id);
        if (!project) return;
        
        const duplicate = {
            ...project,
            id: this.generateId(),
            title: `${project.title} (Copy)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await this.saveProject(duplicate);
        this.projects.push(duplicate);
        this.renderProjects();
        this.updateStats();
    }
    
    // ===================================
    // Stats
    // ===================================
    
    updateStats() {
        this.elements.totalProjects.textContent = this.projects.length;
        
        // Calculate storage
        let totalSize = 0;
        this.projects.forEach(p => {
            if (p.gpFileData) totalSize += p.gpFileData.length * 0.75; // base64 overhead
            if (p.audioFileData) totalSize += p.audioFileData.length * 0.75;
        });
        
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
        this.elements.totalStorage.textContent = `${sizeMB} MB`;
    }
    
    // ===================================
    // Utilities
    // ===================================
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    base64ToBlob(base64, type) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return new Blob([array], { type });
    }
    
    showLoading(text = 'Loading...') {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.add('visible');
    }
    
    hideLoading() {
        this.elements.loadingOverlay.classList.remove('visible');
    }
}

// ===================================
// Static methods for use by other pages
// ===================================

window.TabLibrary = {
    async saveToLibrary(projectData) {
        console.log('[TabLibrary] saveToLibrary called with:', {
            id: projectData.id,
            title: projectData.title,
            hasGpFileData: !!projectData.gpFileData,
            gpFileDataLength: projectData.gpFileData?.length,
            hasAudioFileData: !!projectData.audioFileData,
            audioFileDataLength: projectData.audioFileData?.length
        });
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TabPlayerLibrary', 1);
            
            request.onerror = () => {
                console.error('[TabLibrary] Failed to open database:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['projects'], 'readwrite');
                const store = transaction.objectStore('projects');
                
                const project = {
                    id: projectData.id || (Date.now().toString(36) + Math.random().toString(36).substr(2)),
                    title: projectData.title || 'Untitled',
                    artist: projectData.artist || 'Unknown Artist',
                    gpFileName: projectData.gpFileName,
                    audioFileName: projectData.audioFileName,
                    gpFileData: projectData.gpFileData, // base64
                    audioFileData: projectData.audioFileData, // base64
                    markers: projectData.markers || [],
                    totalBars: projectData.totalBars || 0,
                    audioDuration: projectData.audioDuration || 0,
                    createdAt: projectData.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                console.log('[TabLibrary] Storing project:', project.id, 'gpData:', !!project.gpFileData, 'audioData:', !!project.audioFileData);
                
                // Handle transaction errors
                transaction.onerror = (e) => {
                    console.error('[TabLibrary] Transaction error:', e.target.error);
                    reject(e.target.error);
                };
                
                transaction.oncomplete = () => {
                    console.log('[TabLibrary] Transaction complete for project:', project.id);
                };
                
                const req = store.put(project);
                req.onsuccess = () => {
                    console.log('[TabLibrary] Project saved successfully:', project.id);
                    resolve(project);
                };
                req.onerror = () => {
                    console.error('[TabLibrary] Failed to save project:', req.error);
                    reject(req.error);
                };
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('projects')) {
                    const store = db.createObjectStore('projects', { keyPath: 'id' });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('artist', 'artist', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
        });
    },
    
    async loadProject(id) {
        console.log('[TabLibrary] loadProject called with id:', id);
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TabPlayerLibrary', 1);
            
            request.onerror = () => {
                console.error('[TabLibrary] Failed to open database:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['projects'], 'readonly');
                const store = transaction.objectStore('projects');
                const req = store.get(id);
                
                req.onsuccess = () => {
                    const project = req.result;
                    console.log('[TabLibrary] Project loaded:', {
                        id: project?.id,
                        title: project?.title,
                        hasGpFileData: !!project?.gpFileData,
                        gpFileDataLength: project?.gpFileData?.length,
                        hasAudioFileData: !!project?.audioFileData,
                        audioFileDataLength: project?.audioFileData?.length
                    });
                    resolve(project);
                };
                req.onerror = () => {
                    console.error('[TabLibrary] Failed to load project:', req.error);
                    reject(req.error);
                };
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('projects')) {
                    db.createObjectStore('projects', { keyPath: 'id' });
                }
            };
        });
    },
    
    // Debug function - call from console: TabLibrary.debugAllProjects()
    async debugAllProjects() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TabPlayerLibrary', 1);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['projects'], 'readonly');
                const store = transaction.objectStore('projects');
                const req = store.getAll();
                
                req.onsuccess = () => {
                    const projects = req.result;
                    console.log('=== ALL PROJECTS IN INDEXEDDB ===');
                    projects.forEach(p => {
                        console.log({
                            id: p.id,
                            title: p.title,
                            artist: p.artist,
                            gpFileName: p.gpFileName,
                            audioFileName: p.audioFileName,
                            hasGpFileData: !!p.gpFileData,
                            gpFileDataLength: p.gpFileData?.length || 0,
                            hasAudioFileData: !!p.audioFileData,
                            audioFileDataLength: p.audioFileData?.length || 0,
                            markersCount: p.markers?.length || 0,
                            totalBars: p.totalBars,
                            createdAt: p.createdAt,
                            updatedAt: p.updatedAt
                        });
                    });
                    console.log('=================================');
                    resolve(projects);
                };
                req.onerror = () => reject(req.error);
            };
            request.onerror = () => reject(request.error);
        });
    },
    
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    base64ToBlob(base64, type) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return new Blob([array], { type });
    },
    
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return array.buffer;
    }
};

// Initialize when on library page
if (document.querySelector('.library-container')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.tabLibrary = new TabLibrary();
    });
}

