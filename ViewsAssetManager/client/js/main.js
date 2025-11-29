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

    const state = {
        allAssets: [], // All assets from API
        displayedAssets: [], // Currently displayed filtered assets
        filteredAssets: [], // All assets matching current folder
        searchResults: [], // Assets matching current search
        selectedAssetIds: [], // IDs of selected assets for batch import
        previewAsset: null, // Currently previewed asset
        folders: [],
        selectedFolderId: null, // Start with no folder selected
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
        cache: {} // Cache for asset requests
    };
    
    /** Debounce timer for search */
    let searchDebounceTimer = null;

    /**
     * Filters assets by current folder
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
     * Fetches ALL assets from the API to allow client-side filtering
     */
    const syncAssets = async () => {
        state.fetchSession++;
        const currentSession = state.fetchSession;
        
        UI.setStatus("Connecting to server...", "info");
        UI.setLoading(true);
        
        try {
            let page = 1;
            const limit = 100;
            let allFetched = [];
            let total = 0;
            
            log(`Syncing assets page ${page}...`);
            let data = await API.fetchJson(`/assets?page=${page}&limit=${limit}`);
            
            allFetched = [...(data.assets || [])];
            total = data.total || 0;
            
            const totalPages = Math.ceil(total / limit);
            
            UI.setStatus(`Loading assets (${allFetched.length}/${total})...`, "info");
            
            if (totalPages > 1) {
                log(`Fetching ${totalPages - 1} more pages...`);
                const promises = [];
                for (let p = 2; p <= totalPages; p++) {
                    promises.push(API.fetchJson(`/assets?page=${p}&limit=${limit}`));
                }
                
                // Show progress as pages load
                let loadedPages = 1;
                const results = await Promise.all(
                    promises.map(async (promise) => {
                        const result = await promise;
                        loadedPages++;
                        const loaded = Math.min(loadedPages * limit, total);
                        UI.setStatus(`Loading assets (${loaded}/${total})...`, "info");
                        return result;
                    })
                );
                
                results.forEach(res => {
                    if (res.assets) {
                        allFetched = [...allFetched, ...res.assets];
                    }
                });
            }
            
            if (state.fetchSession !== currentSession) return;

            state.allAssets = allFetched;
            log(`Synced ${state.allAssets.length} assets.`);
            
            updateAssetView();
            
        } catch (error) {
            console.error("Failed to sync assets", error);
            UI.setStatus("Failed to sync assets. Check your connection.", "error");
            if (state.fetchSession === currentSession) {
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
     * Selects a folder and fetches assets for it
     * @param {string} folderId - Folder ID to select ("all" or folder UUID)
     */
    const selectFolder = (folderId) => {
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

            await new Promise(resolve => setTimeout(resolve, 1000));

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
            
            if (state.isFirstRun) {
                state.isFirstRun = false;
                UI.setStatus("API key configured successfully!", "success");
                await Utils.loadHostScript();
                const folders = await API.fetchFolders();
                UI.renderFolders(folders, selectFolder);
                UI.renderWelcomeScreen();
            } else {
                UI.setStatus("API key updated successfully!", "success");
                state.cache = {}; 
                const folders = await API.fetchFolders();
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
     * Handles asset preview
     * @param {Object} asset - The asset to preview
     */
    const handleAssetPreview = (asset) => {
        state.previewAsset = asset;
        UI.showPreview(asset);
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

                await new Promise(resolve => setTimeout(resolve, 500));

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
            handleClearSearch(); // Clear search on refresh
            clearSelection(); // Clear selection on refresh
            
            const folders = await API.fetchFolders();
            UI.renderFolders(folders, selectFolder);
            await syncAssets();
        });

        UI.elements.settingsButton.addEventListener("click", () => {
            log("Settings opened.");
            UI.showApiKeyModal(false);
        });

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

        // Selection bar event listeners
        if (UI.elements.clearSelectionBtn) {
            UI.elements.clearSelectionBtn.addEventListener("click", clearSelection);
        }
        
        if (UI.elements.importSelectedBtn) {
            UI.elements.importSelectedBtn.addEventListener("click", handleImportSelected);
        }

        // Keyboard shortcut for escape to close preview
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !UI.elements.previewModal.classList.contains("modal--hidden")) {
                UI.hidePreview();
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

    const init = async () => {
        bindEvents();
        try {
            log("Initializing panel UI.");
            
            const storedKey = API.getStoredApiKey();
            if (storedKey) {
                state.apiKey = storedKey;
                API.setApiKey(storedKey);
                log("API key loaded from storage");
            } else {
                log("No API key found - first run");
                state.isFirstRun = true;
                UI.setLoading(false);
                UI.showApiKeyModal(true);
                return;
            }

            await Utils.loadHostScript();
            
            const folders = await API.fetchFolders();
            UI.renderFolders(folders, selectFolder);
            
            UI.renderWelcomeScreen();
            
            syncAssets();
            
        } catch (error) {
            console.error("Initialization failed", error);
            UI.setStatus(error.message || "Initialization failed.", "error");
            UI.setLoading(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();
