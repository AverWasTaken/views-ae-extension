"use strict";

/**
 * Views Asset Manager - Main
 * Controller logic connecting API, UI, and FileSystem.
 */
(function() {
    // Shortcuts
    const Utils = Views.Utils;
    const API = Views.API;
    const FS = Views.FileSystem;
    const UI = Views.UI;
    
    const log = Utils.log;

    /** Discord webhook URL for feedback */
    const FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/1444455426627473499/Ss2N0KNP7tgrFYmFp_GFSca5QLCOugvRcmcPXemtCYCf2RaFO5n2l4CCJU4IO1G1H-q0";

    const state = {
        allAssets: [], // All assets from API
        displayedAssets: [], // Currently displayed filtered assets
        filteredAssets: [], // All assets matching current folder
        searchResults: [], // Assets matching current search
        selectedAssetIds: [], // IDs of selected assets for batch import
        previewAsset: null, // Currently previewed asset
        folders: [], // All folders from API
        folderMap: {}, // Map of folder ID to folder object for quick lookup
        selectedFolderId: null, // Start with no folder selected
        currentFolderPath: [], // Breadcrumb path from root to current folder
        searchQuery: "", // Current search query
        apiKey: "",
        deviceId: null, 
        isFirstRun: false,
        isWelcome: true, // Track welcome screen state
        pagination: {
            page: 1,
            limit: 20,
            total: 0
        },
        visibleCount: 20, // How many assets to show (for "Load More")
        fetchSession: 0, // ID to track active fetch requests
        cache: {}, // Cache for asset requests
        preloadPromise: null, // Promise for background asset preloading
        preloadFoldersPromise: null // Promise for background folder preloading
    };
    
    /** Debounce timer for search */
    let searchDebounceTimer = null;
    
    /** Interval ID for periodic version checks */
    let versionCheckInterval = null;
    
    /** How often to check for updates (5 minutes) */
    const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

    /**
     * Silently preloads all assets in background without UI updates.
     * Called as early as possible after API key is available.
     * @returns {Promise<Array|null>} Array of assets or null on failure
     */
    const preloadAssetsInBackground = async () => {
        try {
            log("Background preload: Starting asset fetch...");
            const startTime = Date.now();
            
            let page = 1;
            const limit = 100;
            let allFetched = [];
            
            // Fetch first page
            let data = await API.fetchJson(`/assets?page=${page}&limit=${limit}`);
            allFetched = [...(data.assets || [])];
            const total = data.total || 0;
            const totalPages = Math.ceil(total / limit);
            
            // Fetch remaining pages in parallel
            if (totalPages > 1) {
                const promises = [];
                for (let p = 2; p <= totalPages; p++) {
                    promises.push(API.fetchJson(`/assets?page=${p}&limit=${limit}`));
                }
                
                const results = await Promise.all(promises);
                results.forEach(res => {
                    if (res.assets) {
                        allFetched = [...allFetched, ...res.assets];
                    }
                });
            }
            
            const elapsed = Date.now() - startTime;
            log(`Background preload: Complete - ${allFetched.length} assets in ${elapsed}ms`);
            return allFetched;
        } catch (error) {
            console.error("Background preload failed:", error);
            return null;
        }
    };

    /**
     * Silently preloads folders in background without UI updates.
     * @returns {Promise<Array|null>} Array of folders or null on failure
     */
    const preloadFoldersInBackground = async () => {
        try {
            log("Background preload: Starting folder fetch...");
            const folders = await API.fetchFolders();
            log(`Background preload: Loaded ${folders.length} folders`);
            return folders;
        } catch (error) {
            console.error("Background folder preload failed:", error);
            return null;
        }
    };

    /**
     * Starts background preloading of assets and folders.
     * Should be called as soon as API key is available.
     */
    const startBackgroundPreload = () => {
        if (!state.preloadPromise) {
            log("Starting background preload...");
            state.preloadPromise = preloadAssetsInBackground();
            state.preloadFoldersPromise = preloadFoldersInBackground();
        }
    };

    /**
     * Loads folders from API and builds lookup map.
     * Uses preloaded data if available.
     * @returns {Promise<Array>} Array of folder objects
     */
    const loadFolders = async () => {
        let folders;
        
        // Use preloaded folders if available
        if (state.preloadFoldersPromise) {
            log("Using preloaded folders...");
            folders = await state.preloadFoldersPromise;
            state.preloadFoldersPromise = null;
            
            // If preload failed, fetch normally
            if (!folders) {
                log("Preloaded folders unavailable, fetching fresh...");
                folders = await API.fetchFolders();
            }
        } else {
            folders = await API.fetchFolders();
        }
        
        state.folders = folders;
        
        // Build lookup map
        state.folderMap = {};
        folders.forEach(folder => {
            state.folderMap[folder.id] = folder;
        });
        
        log(`Loaded ${folders.length} folders into state.`);
        return folders;
    };

    /**
     * Filters assets by current folder (only direct folder, not subfolders)
     * @param {Array} allAssets - List of all assets
     * @returns {Array} - Filtered assets
     */
    const filterAssetsByFolder = (allAssets) => {
        if (String(state.selectedFolderId) === "all") {
            return allAssets;
        }
        
        return allAssets.filter(asset => {
            return String(asset.folderId) === String(state.selectedFolderId);
        });
    };

    /**
     * Filters assets by search query
     * @param {Array} assets - List of assets to filter
     * @param {string} query - Search query
     * @returns {Array} - Filtered assets matching query
     */
    const filterAssetsBySearch = (assets, query) => {
        if (!query) return assets;
        
        const lowerQuery = query.toLowerCase();
        return assets.filter(asset => {
            const name = (asset.name || asset.id || "").toLowerCase();
            return name.includes(lowerQuery);
        });
    };

    /**
     * Updates counts in the sidebar
     */
    const updateFolderCounts = () => {
        const counts = { all: state.allAssets.length };
        state.allAssets.forEach(asset => {
            if (asset.folderId) {
                counts[asset.folderId] = (counts[asset.folderId] || 0) + 1;
            }
        });

        UI.elements.folderList.querySelectorAll(".folder-item").forEach(item => {
            const fid = item.dataset.folderId;
            const count = counts[fid] || 0;
            const countSpan = item.querySelector(".folder-item__count");
            if (countSpan) countSpan.textContent = count;
        });
    };

    /**
     * Updates the displayed assets based on selection, search, and pagination
     */
    const updateAssetView = () => {
        if (state.isWelcome) return;

        // 1. Filter by folder
        const folderFiltered = filterAssetsByFolder(state.allAssets);
        state.filteredAssets = folderFiltered;
        
        // 2. Filter by search query
        const searchFiltered = filterAssetsBySearch(folderFiltered, state.searchQuery);
        state.searchResults = searchFiltered;
        
        // 3. Slice for display
        const toShow = searchFiltered.slice(0, state.visibleCount);
        state.displayedAssets = toShow;
        
        // 4. Render with callbacks
        const callbacks = {
            onImport: handleAssetDownload,
            onPreview: handleAssetPreview,
            onSelect: handleAssetSelect,
            getSelectedIds: getSelectedIds
        };
        UI.renderAssets(toShow, state.selectedFolderId, callbacks, state.searchQuery);
        
        // 5. Update search stats
        UI.updateSearchStats(toShow.length, searchFiltered.length, state.searchQuery);
        
        // 6. Update status (only if no search active)
        if (!state.searchQuery && searchFiltered.length > 0) {
            UI.setStatus(`${folderFiltered.length} assets found.`, "success");
        } else if (state.searchQuery && searchFiltered.length > 0) {
            UI.setStatus("", "info");
        }
        
        // 7. Update selection bar
        UI.updateSelectionBar(state.selectedAssetIds.length);
        
        const hasMore = state.displayedAssets.length < state.searchResults.length;
        UI.updateLoadMoreButton(hasMore, () => {
            state.visibleCount += 20;
            updateAssetView();
        });
        
        updateFolderCounts();
    };

    /**
     * Fetches ALL assets from the API to allow client-side filtering.
     * Uses preloaded data if available.
     */
    const syncAssets = async () => {
        state.fetchSession++;
        const currentSession = state.fetchSession;
        
        // Only show loading UI if not on welcome screen
        if (!state.isWelcome) {
            UI.setLoading(true);
        }
        
        try {
            let allFetched = null;
            
            // Check if we have preloaded assets available
            if (state.preloadPromise) {
                if (!state.isWelcome) {
                    UI.setStatus("Loading assets...", "info");
                }
                log("Waiting for preloaded assets...");
                allFetched = await state.preloadPromise;
                state.preloadPromise = null;
                
                if (allFetched) {
                    log(`Using ${allFetched.length} preloaded assets`);
                } else {
                    log("Preloaded assets unavailable, fetching fresh...");
                }
            }
            
            // If preload failed or wasn't available, fetch normally
            if (!allFetched) {
                if (!state.isWelcome) {
                    UI.setStatus("Connecting to server...", "info");
                }
                
                let page = 1;
                const limit = 100;
                allFetched = [];
                let total = 0;
                
                log(`Syncing assets page ${page}...`);
                let data = await API.fetchJson(`/assets?page=${page}&limit=${limit}`);
                
                allFetched = [...(data.assets || [])];
                total = data.total || 0;
                
                const totalPages = Math.ceil(total / limit);
                
                if (!state.isWelcome) {
                    UI.setStatus(`Loading assets (${allFetched.length}/${total})...`, "info");
                }
                
                if (totalPages > 1) {
                    log(`Fetching ${totalPages - 1} more pages...`);
                    const promises = [];
                    for (let p = 2; p <= totalPages; p++) {
                        promises.push(API.fetchJson(`/assets?page=${p}&limit=${limit}`));
                    }
                    
                    // Show progress as pages load (only if not on welcome screen)
                    let loadedPages = 1;
                    const results = await Promise.all(
                        promises.map(async (promise) => {
                            const result = await promise;
                            loadedPages++;
                            const loaded = Math.min(loadedPages * limit, total);
                            if (!state.isWelcome) {
                                UI.setStatus(`Loading assets (${loaded}/${total})...`, "info");
                            }
                            return result;
                        })
                    );
                    
                    results.forEach(res => {
                        if (res.assets) {
                            allFetched = [...allFetched, ...res.assets];
                        }
                    });
                }
            }
            
            if (state.fetchSession !== currentSession) return;

            state.allAssets = allFetched;
            log(`Synced ${state.allAssets.length} assets.`);
            
            // Always update folder counts, even on welcome screen
            updateFolderCounts();
            
            // Only update asset view if not on welcome screen
            if (!state.isWelcome) {
                updateAssetView();
            }
            
        } catch (error) {
            console.error("Failed to sync assets", error);
            if (!state.isWelcome) {
                UI.setStatus("Failed to sync assets. Check your connection.", "error");
            }
            if (state.fetchSession === currentSession && !state.isWelcome) {
                const callbacks = {
                    onImport: handleAssetDownload,
                    onPreview: handleAssetPreview,
                    onSelect: handleAssetSelect,
                    getSelectedIds: getSelectedIds
                };
                UI.renderAssets([], state.selectedFolderId, callbacks);
            }
        } finally {
            if (state.fetchSession === currentSession) {
                UI.setLoading(false);
            }
        }
    };

    /**
     * Builds folder path from local folder data
     * @param {string} folderId - Target folder ID
     * @returns {Array} Array of folder objects from root to target
     */
    const buildFolderPath = (folderId) => {
        const path = [];
        let currentId = folderId;
        
        while (currentId && state.folderMap[currentId]) {
            const folder = state.folderMap[currentId];
            path.unshift(folder);
            currentId = folder.parentId;
        }
        
        return path;
    };

    /**
     * Selects a folder and fetches assets for it
     * @param {string} folderId - Folder ID to select ("all" or folder UUID)
     */
    const selectFolder = async (folderId) => {
        const targetId = String(folderId);
        
        if (String(state.selectedFolderId) === targetId && !state.isWelcome) return;
        
        state.selectedFolderId = targetId;
        state.isWelcome = false;
        
        UI.elements.folderList.querySelectorAll(".folder-item").forEach((item) => {
            item.classList.toggle("folder-item--active", item.dataset.folderId === targetId);
        });
        
        log(`Selected folder: ${targetId}`);
        
        // Reset pagination and search on folder change (keep selection)
        state.pagination.page = 1;
        state.visibleCount = 20;
        state.searchQuery = "";
        UI.clearSearch();
        
        // Update breadcrumbs
        if (targetId === "all") {
            state.currentFolderPath = [];
            UI.hideBreadcrumbs();
        } else {
            // Build path from local data (faster than API call)
            state.currentFolderPath = buildFolderPath(targetId);
            UI.renderBreadcrumbs(state.currentFolderPath, selectFolder);
            
            // Expand folder tree to show selected folder
            const pathIds = state.currentFolderPath.slice(0, -1).map(f => f.id);
            UI.expandToFolder(targetId, pathIds);
        }
        
        updateAssetView();
    };

    const handleAssetDownload = async (asset, button) => {
        const displayName = Utils.getDisplayName(asset.name || asset.id);
        
        UI.LoadingOverlay.show(`Downloading ${displayName}`, "Starting download...");
        button.disabled = true;

        try {
            log("Starting import for asset:", asset.id);
            
            const payload = await API.requestAssetDownload(asset.id);
            if (!payload.url) {
                throw new Error("API did not provide a download URL.");
            }

            const fileName = Utils.sanitizeFileName(asset.name || "asset");
            
            const onProgress = (downloaded, total) => {
                if (total > 0) {
                    const percent = (downloaded / total) * 100;
                    const sizeMB = (total / 1024 / 1024).toFixed(1);
                    const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
                    UI.LoadingOverlay.update(`${downloadedMB} MB / ${sizeMB} MB`);
                    UI.LoadingOverlay.showProgress(percent);
                }
            };

            const importPath = await FS.downloadFileToTemp(payload.url, fileName, {}, onProgress);

            await new Promise(resolve => setTimeout(resolve, 100));

            UI.LoadingOverlay.show(`Importing ${displayName}`, "Adding to project...");
            UI.LoadingOverlay.hideProgress();
            
            log("Importing asset into After Effects from:", importPath);
            
            let attempts = 0;
            const maxAttempts = 5;
            let result;
            
            while (attempts < maxAttempts) {
                try {
                    if (attempts > 0) {
                        const delay = 500 * attempts;
                        log(`Waiting ${delay}ms before retry attempt ${attempts + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                    result = await Utils.evalScript(
                        `importAndAddAsset("${Utils.escapeForEval(importPath)}")`
                    );
                    
                    if (result && typeof result === "string" && 
                       (result.includes("couldn't be open") || result.includes("File exists") || result.includes("I/O error"))) {
                        throw new Error(result);
                    }
                    
                    if (result && result.indexOf("Error") === 0) {
                        break; 
                    }
                    
                    break;
                } catch (e) {
                    attempts++;
                    log(`Import attempt ${attempts} failed (${e.message}), retrying...`);
                    if (attempts >= maxAttempts) {
                        result = "Error: " + e.message;
                    }
                }
            }
            
            if (result && result.indexOf("Error") === 0) {
                throw new Error(result);
            }
            
            log("Asset imported successfully:", asset.id);
            UI.setStatus(result || `${displayName || "Asset"} imported successfully.`, "success");
        } catch (error) {
            console.error("Import failed", error);
            
            let errorMessage = error.message || "Unable to import asset.";
            
            if (errorMessage.includes("corrupted") || errorMessage.includes("not of the correct type") || 
                errorMessage.includes("doesn't seem to be a PNG") || errorMessage.includes("Import failed")) {
                errorMessage = `Failed to import ${displayName}: File appears to be corrupted or invalid. Report this issue in a ticket on discord.gg/views`;
            } else if (errorMessage.includes("couldn't be open")) {
                errorMessage = `File is locked or in use. Please try again in a moment.`;
            }
            
            UI.setStatus(errorMessage, "error");
        } finally {
            UI.LoadingOverlay.hide();
            button.disabled = false;
        }
    };

    const handleApiKeySubmit = async (event) => {
        event.preventDefault();
        
        const apiKey = UI.elements.apiKeyInput.value.trim();
        
        if (!apiKey) {
            UI.showApiKeyError("Please enter an API key");
            return;
        }

        UI.elements.saveApiKeyButton.disabled = true;
        UI.elements.saveApiKeyButton.textContent = "Validating...";
        UI.elements.apiKeyError.classList.add("form-error--hidden");

        try {
            log("Validating API key...");
            await API.validateApiKey(apiKey);
            
            const success = API.storeApiKey(apiKey);
            if (!success) {
                throw new Error("Failed to store API key");
            }

            UI.hideApiKeyModal();
            state.apiKey = apiKey;
            UI.showFeedbackButton();
            
            // Start background preload immediately after successful API key submission
            startBackgroundPreload();
            
            if (state.isFirstRun) {
                state.isFirstRun = false;
                UI.setStatus("API key configured successfully!", "success");
                await Utils.loadHostScript();
                const folders = await loadFolders();
                UI.renderFolders(folders, selectFolder);
                UI.renderWelcomeScreen();
            } else {
                UI.setStatus("API key updated successfully!", "success");
                state.cache = {};
                // Clear any existing preload since we're refreshing with new key
                state.preloadPromise = null;
                state.preloadFoldersPromise = null;
                startBackgroundPreload();
                const folders = await loadFolders();
                UI.renderFolders(folders, selectFolder);
                if (!state.isWelcome) {
                    syncAssets();
                }
            }
        } catch (error) {
            console.error("API key validation failed:", error);
            UI.showApiKeyError(error.message || "Failed to validate API key");
        } finally {
            UI.elements.saveApiKeyButton.disabled = false;
            UI.elements.saveApiKeyButton.textContent = "Save Key";
        }
    };

    /**
     * Handles search input changes with debouncing
     */
    const handleSearchInput = () => {
        UI.updateClearButtonVisibility();
        
        // Clear existing debounce timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }
        
        // Debounce search to avoid too many updates
        searchDebounceTimer = setTimeout(() => {
            const query = UI.getSearchQuery();
            state.searchQuery = query;
            state.visibleCount = 20; // Reset pagination on new search
            updateAssetView();
            log(`Search query: "${query}"`);
        }, 200);
    };

    /**
     * Handles clearing the search
     */
    const handleClearSearch = () => {
        UI.clearSearch();
        state.searchQuery = "";
        state.visibleCount = 20;
        updateAssetView();
        log("Search cleared.");
    };

    /**
     * Handles feedback form submission
     * @param {Event} event - Form submit event
     */
    const handleFeedbackSubmit = async (event) => {
        event.preventDefault();
        
        const feedbackType = UI.elements.feedbackType.value;
        const message = UI.elements.feedbackMessage.value.trim();
        const discordUsername = UI.elements.feedbackDiscord.value.trim();
        
        if (!message) {
            UI.showFeedbackError("Please enter a message");
            return;
        }
        
        UI.elements.submitFeedbackButton.disabled = true;
        UI.elements.submitFeedbackButton.textContent = "Sending...";
        
        try {
            // Build the Discord embed
            const typeColors = {
                bug: 0xff6b6b,      // Red
                feature: 0x00a3e0,   // Blue (accent)
                feedback: 0x9b59b6   // Purple
            };
            
            const typeLabels = {
                bug: "🐛 Bug Report",
                feature: "✨ Feature Request",
                feedback: "💬 General Feedback"
            };
            
            const embed = {
                title: typeLabels[feedbackType] || "Feedback",
                description: message,
                color: typeColors[feedbackType] || 0x00a3e0,
                fields: [],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "Views Asset Manager"
                }
            };
            
            // Add discord username if provided
            if (discordUsername) {
                embed.fields.push({
                    name: "Discord",
                    value: discordUsername,
                    inline: true
                });
            }
            
            // Send to Discord webhook
            const response = await fetch(FEEDBACK_WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    embeds: [embed]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to send feedback: ${response.status}`);
            }
            
            log("Feedback sent successfully");
            UI.showFeedbackSuccess("Thank you! Your feedback has been sent.");
            
            // Clear form after success
            UI.elements.feedbackMessage.value = "";
            UI.elements.feedbackDiscord.value = "";
            
            // Close modal after a short delay
            setTimeout(() => {
                UI.hideFeedbackModal();
            }, 2000);
            
        } catch (error) {
            console.error("Failed to send feedback:", error);
            UI.showFeedbackError("Failed to send feedback. Please try again or report in Discord.");
        } finally {
            UI.elements.submitFeedbackButton.disabled = false;
            UI.elements.submitFeedbackButton.textContent = "Send Feedback";
        }
    };

    /**
     * Handles asset preview
     * @param {Object} asset - The asset to preview
     */
    const handleAssetPreview = (asset) => {
        state.previewAsset = asset;
        UI.showPreview(asset);
        updatePreviewNavState();
    };

    /**
     * Gets the index of an asset in the displayed assets
     * @param {string} assetId - The asset ID
     * @returns {number} Index or -1 if not found
     */
    const getAssetIndex = (assetId) => {
        return state.displayedAssets.findIndex(a => a.id === assetId);
    };

    /**
     * Updates the preview navigation button states
     */
    const updatePreviewNavState = () => {
        if (!state.previewAsset) return;
        const currentIndex = getAssetIndex(state.previewAsset.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < state.displayedAssets.length - 1;
        UI.updatePreviewNav(hasPrev, hasNext);
    };

    /**
     * Navigates to the previous asset in preview
     */
    const previewPrevAsset = () => {
        if (!state.previewAsset) return;
        const currentIndex = getAssetIndex(state.previewAsset.id);
        if (currentIndex > 0) {
            const prevAsset = state.displayedAssets[currentIndex - 1];
            state.previewAsset = prevAsset;
            UI.showPreview(prevAsset);
            updatePreviewNavState();
        }
    };

    /**
     * Navigates to the next asset in preview
     */
    const previewNextAsset = () => {
        if (!state.previewAsset) return;
        const currentIndex = getAssetIndex(state.previewAsset.id);
        if (currentIndex < state.displayedAssets.length - 1) {
            const nextAsset = state.displayedAssets[currentIndex + 1];
            state.previewAsset = nextAsset;
            UI.showPreview(nextAsset);
            updatePreviewNavState();
        }
    };

    /**
     * Handles asset selection toggle
     * @param {Object} asset - The asset to toggle
     * @param {HTMLElement} card - The card element
     */
    const handleAssetSelect = (asset, card) => {
        const idx = state.selectedAssetIds.indexOf(asset.id);
        if (idx === -1) {
            state.selectedAssetIds.push(asset.id);
            UI.toggleCardSelection(asset.id, true);
        } else {
            state.selectedAssetIds.splice(idx, 1);
            UI.toggleCardSelection(asset.id, false);
        }
        UI.updateSelectionBar(state.selectedAssetIds.length);
        log(`Selection: ${state.selectedAssetIds.length} assets selected`);
    };

    /**
     * Clears all selected assets
     */
    const clearSelection = () => {
        state.selectedAssetIds.forEach(id => {
            UI.toggleCardSelection(id, false);
        });
        state.selectedAssetIds = [];
        UI.updateSelectionBar(0);
        log("Selection cleared.");
    };

    /**
     * Gets the list of selected asset IDs
     * @returns {Array<string>} Selected asset IDs
     */
    const getSelectedIds = () => state.selectedAssetIds;

    /**
     * Imports multiple selected assets sequentially
     */
    const handleImportSelected = async () => {
        if (state.selectedAssetIds.length === 0) return;
        
        const selectedAssets = state.allAssets.filter(a => state.selectedAssetIds.includes(a.id));
        const total = selectedAssets.length;
        let imported = 0;
        let failed = 0;
        
        UI.LoadingOverlay.show(`Importing ${total} assets`, "Starting batch import...");
        
        for (const asset of selectedAssets) {
            const displayName = Utils.getDisplayName(asset.name || asset.id);
            
            try {
                UI.LoadingOverlay.update(`Importing ${displayName} (${imported + 1}/${total})...`);
                UI.LoadingOverlay.showProgress(((imported) / total) * 100);
                
                log(`Batch import: Starting ${asset.id}`);
                
                const payload = await API.requestAssetDownload(asset.id);
                if (!payload.url) {
                    throw new Error("API did not provide a download URL.");
                }

                const fileName = Utils.sanitizeFileName(asset.name || "asset");
                const importPath = await FS.downloadFileToTemp(payload.url, fileName, {});

                await new Promise(resolve => setTimeout(resolve, 100));

                const result = await Utils.evalScript(
                    `importAndAddAsset("${Utils.escapeForEval(importPath)}")`
                );
                
                if (result && result.indexOf("Error") === 0) {
                    throw new Error(result);
                }
                
                imported++;
                log(`Batch import: Completed ${asset.id}`);
                
            } catch (error) {
                failed++;
                console.error(`Failed to import ${displayName}:`, error);
                log(`Batch import: Failed ${asset.id} - ${error.message}`);
            }
        }
        
        UI.LoadingOverlay.hide();
        clearSelection();
        
        if (failed === 0) {
            UI.setStatus(`Successfully imported ${imported} assets.`, "success");
        } else {
            UI.setStatus(`Imported ${imported} assets, ${failed} failed.`, failed === total ? "error" : "info");
        }
    };

    const bindEvents = () => {
        UI.elements.refreshButton.addEventListener("click", async () => {
            log("Manual refresh requested.");
            state.cache = {};
            // Clear any pending preloads to ensure fresh data
            state.preloadPromise = null;
            state.preloadFoldersPromise = null;
            handleClearSearch();
            clearSelection();
            
            // Check version on refresh
            const versionOk = await checkVersion();
            if (!versionOk) {
                return;
            }
            
            const folders = await loadFolders();
            UI.renderFolders(folders, selectFolder);
            await syncAssets();
        });

        UI.elements.settingsButton.addEventListener("click", () => {
            log("Settings opened.");
            UI.showApiKeyModal(false);
        });

        // Feedback button and modal event listeners
        if (UI.elements.feedbackButton) {
            UI.elements.feedbackButton.addEventListener("click", () => {
                log("Feedback modal opened.");
                UI.showFeedbackModal();
            });
        }
        
        if (UI.elements.feedbackForm) {
            UI.elements.feedbackForm.addEventListener("submit", handleFeedbackSubmit);
        }
        
        if (UI.elements.cancelFeedbackButton) {
            UI.elements.cancelFeedbackButton.addEventListener("click", UI.hideFeedbackModal);
        }
        
        if (UI.elements.feedbackModal) {
            UI.elements.feedbackModal.querySelector(".modal__overlay").addEventListener("click", UI.hideFeedbackModal);
        }

        // Search event listeners
        if (UI.elements.searchInput) {
            UI.elements.searchInput.addEventListener("input", handleSearchInput);
            UI.elements.searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    handleClearSearch();
                    UI.elements.searchInput.blur();
                }
            });
        }
        
        if (UI.elements.clearSearchBtn) {
            UI.elements.clearSearchBtn.addEventListener("click", handleClearSearch);
        }

        // Preview modal event listeners
        if (UI.elements.closePreviewBtn) {
            UI.elements.closePreviewBtn.addEventListener("click", UI.hidePreview);
        }
        
        if (UI.elements.previewModal) {
            UI.elements.previewModal.querySelector(".modal__overlay").addEventListener("click", UI.hidePreview);
        }
        
        if (UI.elements.previewImportBtn) {
            UI.elements.previewImportBtn.addEventListener("click", () => {
                if (state.previewAsset) {
                    UI.hidePreview();
                    handleAssetDownload(state.previewAsset, UI.elements.previewImportBtn);
                }
            });
        }

        // Preview navigation buttons
        if (UI.elements.previewPrevBtn) {
            UI.elements.previewPrevBtn.addEventListener("click", previewPrevAsset);
        }
        
        if (UI.elements.previewNextBtn) {
            UI.elements.previewNextBtn.addEventListener("click", previewNextAsset);
        }

        // Grid size toggle buttons
        [UI.elements.gridSmall, UI.elements.gridMedium, UI.elements.gridLarge].forEach(btn => {
            if (btn) {
                btn.addEventListener("click", () => {
                    UI.setGridSize(btn.dataset.size);
                });
            }
        });

        // Selection bar event listeners
        if (UI.elements.clearSelectionBtn) {
            UI.elements.clearSelectionBtn.addEventListener("click", clearSelection);
        }
        
        if (UI.elements.importSelectedBtn) {
            UI.elements.importSelectedBtn.addEventListener("click", handleImportSelected);
        }

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            // Only handle if preview is open
            if (UI.isPreviewOpen()) {
                switch (e.key) {
                    case "Escape":
                        UI.hidePreview();
                        break;
                    case "ArrowLeft":
                        e.preventDefault();
                        previewPrevAsset();
                        break;
                    case "ArrowRight":
                        e.preventDefault();
                        previewNextAsset();
                        break;
                    case "Enter":
                        e.preventDefault();
                        if (state.previewAsset) {
                            UI.hidePreview();
                            handleAssetDownload(state.previewAsset, UI.elements.previewImportBtn);
                        }
                        break;
                }
            }
        });

        UI.elements.apiKeyForm.addEventListener("submit", handleApiKeySubmit);

        UI.elements.cancelApiKeyButton.addEventListener("click", () => {
            if (!state.isFirstRun) {
                UI.hideApiKeyModal();
            }
        });

        UI.elements.toggleApiKeyVisibility.addEventListener("click", UI.toggleApiKeyVisibility);

        UI.elements.apiKeyModal.querySelector(".modal__overlay").addEventListener("click", () => {
            if (!state.isFirstRun && UI.elements.cancelApiKeyButton.style.display !== "none") {
                UI.hideApiKeyModal();
            }
        });

        const allAssetsItem = UI.elements.folderList.querySelector('[data-folder-id="all"]');
        if (allAssetsItem) {
            allAssetsItem.addEventListener("click", () => selectFolder("all"));
        }
    };

    /**
     * Shows the update modal with the update handler
     * @param {string} currentVer - Current extension version
     * @param {string} newVer - New available version
     */
    const showUpdatePrompt = (currentVer, newVer) => {
        UI.showUpdateModal(currentVer, newVer, async (onProgress) => {
            await Utils.runUpdateScript(onProgress);
        });
    };

    /**
     * Starts the periodic version check interval
     */
    const startVersionCheckInterval = () => {
        // Clear any existing interval
        if (versionCheckInterval) {
            clearInterval(versionCheckInterval);
        }
        
        log(`Starting periodic version check (every ${VERSION_CHECK_INTERVAL_MS / 1000 / 60} minutes)`);
        
        versionCheckInterval = setInterval(async () => {
            log("Running periodic version check...");
            await checkVersion();
        }, VERSION_CHECK_INTERVAL_MS);
    };

    /**
     * Checks if the extension version matches the API version
     * @returns {Promise<boolean>} True if versions match, false if update required
     */
    const checkVersion = async () => {
        try {
            log("Checking extension version...");
            const versionInfo = await API.fetchVersion();
            const expectedVersion = API.getExpectedVersion();
            
            log(`Server version: ${versionInfo.version}, Expected: ${expectedVersion}`);
            
            if (API.isUpdateRequired(versionInfo.version)) {
                log("Update required - showing update modal");
                
                // Set version badge as outdated (clickable to reopen modal)
                UI.setVersionBadge(expectedVersion, true, () => {
                    showUpdatePrompt(expectedVersion, versionInfo.version);
                });
                
                // Show update modal
                showUpdatePrompt(expectedVersion, versionInfo.version);
                return false;
            }
            
            // Set version badge as current
            UI.setVersionBadge(expectedVersion, false);
            
            log("Version check passed");
            return true;
        } catch (error) {
            // If version check fails, log it but continue (graceful degradation)
            console.error("Version check failed:", error);
            log("Version check failed, continuing anyway...");
            
            // Still show the expected version
            UI.setVersionBadge(API.getExpectedVersion(), false);
            return true;
        }
    };

    const init = async () => {
        bindEvents();
        try {
            log("Initializing panel UI.");
            
            // Check for stored API key first - if available, start preloading immediately
            const storedKey = API.getStoredApiKey();
            if (storedKey) {
                state.apiKey = storedKey;
                API.setApiKey(storedKey);
                
                // Start background preload ASAP - don't wait for version check
                startBackgroundPreload();
                
                UI.showFeedbackButton();
                log("API key loaded from storage, background preload started");
            } else {
                log("No API key found - first run");
                state.isFirstRun = true;
                UI.setLoading(false);
                UI.showApiKeyModal(true);
                return;
            }
            
            // Check version (runs in parallel with background preload)
            const versionOk = await checkVersion();
            if (!versionOk) {
                UI.setLoading(false);
                // Clear preload promises if update is required
                state.preloadPromise = null;
                state.preloadFoldersPromise = null;
                return;
            }

            await Utils.loadHostScript();
            
            // Folders may already be preloaded by now
            const folders = await loadFolders();
            UI.renderFolders(folders, selectFolder);

            UI.renderWelcomeScreen();
            
            // Assets may already be preloaded by now
            syncAssets();
            
            // Start periodic version check (every 5 minutes)
            startVersionCheckInterval();
            
        } catch (error) {
            console.error("Initialization failed", error);
            UI.setStatus(error.message || "Initialization failed.", "error");
            UI.setLoading(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();
