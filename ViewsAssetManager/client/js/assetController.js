"use strict";

/**
 * Views Asset Manager - Asset Controller
 * Handles asset operations: preloading, syncing, filtering, downloading, preview, and selection.
 */
(function(global) {
    global.Views = global.Views || {};

    const Utils = global.Views.Utils;
    const API = global.Views.API;
    const FS = global.Views.FileSystem;
    const UI = global.Views.UI;
    const State = global.Views.State;

    const log = Utils.log;

    /**
     * Silently preloads all assets in background without UI updates.
     * @returns {Promise<Array|null>} Array of assets or null on failure
     */
    const preloadAssetsInBackground = async () => {
        try {
            log("Background preload: Starting asset fetch...");
            const startTime = Date.now();

            let page = 1;
            const limit = 100;
            let allFetched = [];

            let data = await API.fetchJson(`/assets?page=${page}&limit=${limit}`);
            allFetched = [...(data.assets || [])];
            const total = data.total || 0;
            const totalPages = Math.ceil(total / limit);

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
     */
    const startBackgroundPreload = () => {
        const state = State.getState();
        if (!state.preloadPromise) {
            log("Starting background preload...");
            state.preloadPromise = preloadAssetsInBackground();
            state.preloadFoldersPromise = preloadFoldersInBackground();
        }
    };

    /**
     * Filters assets by current folder (only direct folder, not subfolders)
     * @param {Array} allAssets - List of all assets
     * @returns {Array} Filtered assets
     */
    const filterAssetsByFolder = (allAssets) => {
        const state = State.getState();
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
     * @returns {Array} Filtered assets matching query
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
        const state = State.getState();
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
     * @param {Object} callbacks - Event callbacks for asset rendering
     */
    const updateAssetView = (callbacks) => {
        const state = State.getState();
        if (state.isWelcome) return;

        const folderFiltered = filterAssetsByFolder(state.allAssets);
        state.filteredAssets = folderFiltered;

        const searchFiltered = filterAssetsBySearch(folderFiltered, state.searchQuery);
        state.searchResults = searchFiltered;

        const toShow = searchFiltered.slice(0, state.visibleCount);
        state.displayedAssets = toShow;

        UI.renderAssets(toShow, state.selectedFolderId, callbacks, state.searchQuery);

        UI.updateSearchStats(toShow.length, searchFiltered.length, state.searchQuery);

        if (!state.searchQuery && searchFiltered.length > 0) {
            UI.setStatus(`${folderFiltered.length} assets found.`, "success");
        } else if (state.searchQuery && searchFiltered.length > 0) {
            UI.setStatus("", "info");
        }

        UI.updateSelectionBar(state.selectedAssetIds.length);

        const hasMore = state.displayedAssets.length < state.searchResults.length;
        UI.updateLoadMoreButton(hasMore, () => {
            state.visibleCount += 20;
            updateAssetView(callbacks);
        });

        updateFolderCounts();
    };

    /**
     * Fetches ALL assets from the API to allow client-side filtering.
     * Uses preloaded data if available.
     * @param {Object} callbacks - Event callbacks for asset rendering
     */
    const syncAssets = async (callbacks) => {
        const state = State.getState();
        const currentSession = State.incrementFetchSession();

        if (!state.isWelcome) {
            UI.setLoading(true);
        }

        try {
            let allFetched = null;

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

            updateFolderCounts();

            UI.setStatus(`${state.allAssets.length} assets loaded`, "success");

            if (!state.isWelcome) {
                updateAssetView(callbacks);
            }

        } catch (error) {
            console.error("Failed to sync assets", error);
            if (!state.isWelcome) {
                UI.setStatus("Failed to sync assets. Check your connection.", "error");
            }
            if (state.fetchSession === currentSession && !state.isWelcome) {
                UI.renderAssets([], state.selectedFolderId, callbacks);
            }
        } finally {
            if (state.fetchSession === currentSession) {
                UI.setLoading(false);
            }
        }
    };

    /**
     * Handles asset download and import into After Effects
     * @param {Object} asset - The asset to download
     * @param {HTMLElement} button - The button element that triggered the download
     */
    const handleAssetDownload = async (asset, button) => {
        const displayName = Utils.getDisplayName(asset.name || asset.id);

        try {
            const hasComp = await Utils.evalScript("getActiveComp() !== null");
            if (hasComp === "false" || hasComp === false) {
                UI.setStatus("Please open or select a composition first.", "error");
                return;
            }
        } catch (compCheckError) {
            log("Composition check failed:", compCheckError);
            UI.setStatus("Please open or select a composition first.", "error");
            return;
        }

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

    /**
     * Gets the index of an asset in the displayed assets
     * @param {string} assetId - The asset ID
     * @returns {number} Index or -1 if not found
     */
    const getAssetIndex = (assetId) => {
        const state = State.getState();
        return state.displayedAssets.findIndex(a => a.id === assetId);
    };

    /**
     * Updates the preview navigation button states
     */
    const updatePreviewNavState = () => {
        const state = State.getState();
        if (!state.previewAsset) return;
        const currentIndex = getAssetIndex(state.previewAsset.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < state.displayedAssets.length - 1;
        UI.updatePreviewNav(hasPrev, hasNext);
    };

    /**
     * Handles asset preview
     * @param {Object} asset - The asset to preview
     */
    const handleAssetPreview = (asset) => {
        const state = State.getState();
        state.previewAsset = asset;
        UI.showPreview(asset);
        updatePreviewNavState();
    };

    /**
     * Navigates to the previous asset in preview
     */
    const previewPrevAsset = () => {
        const state = State.getState();
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
        const state = State.getState();
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
        const state = State.getState();
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
        const state = State.getState();
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
    const getSelectedIds = () => State.getState().selectedAssetIds;

    /**
     * Imports multiple selected assets sequentially
     */
    const handleImportSelected = async () => {
        const state = State.getState();
        if (state.selectedAssetIds.length === 0) return;

        try {
            const hasComp = await Utils.evalScript("getActiveComp() !== null");
            if (hasComp === "false" || hasComp === false) {
                UI.setStatus("Please open or select a composition first.", "error");
                return;
            }
        } catch (compCheckError) {
            log("Composition check failed:", compCheckError);
            UI.setStatus("Please open or select a composition first.", "error");
            return;
        }

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

    global.Views.AssetController = {
        preloadAssetsInBackground,
        preloadFoldersInBackground,
        startBackgroundPreload,
        filterAssetsByFolder,
        filterAssetsBySearch,
        updateFolderCounts,
        updateAssetView,
        syncAssets,
        handleAssetDownload,
        handleAssetPreview,
        previewPrevAsset,
        previewNextAsset,
        updatePreviewNavState,
        handleAssetSelect,
        clearSelection,
        getSelectedIds,
        handleImportSelected
    };

})(window);

