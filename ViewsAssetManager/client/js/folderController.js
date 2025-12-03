"use strict";

/**
 * Views Asset Manager - Folder Controller
 * Handles folder operations: loading, path building, and selection.
 */
(function(global) {
    global.Views = global.Views || {};

    const Utils = global.Views.Utils;
    const API = global.Views.API;
    const UI = global.Views.UI;
    const State = global.Views.State;

    const log = Utils.log;

    /**
     * Loads folders from API and builds lookup map.
     * Uses preloaded data if available.
     * @returns {Promise<Array>} Array of folder objects
     */
    const loadFolders = async () => {
        const state = State.getState();
        let folders;

        if (state.preloadFoldersPromise) {
            log("Using preloaded folders...");
            folders = await state.preloadFoldersPromise;
            state.preloadFoldersPromise = null;

            if (!folders) {
                log("Preloaded folders unavailable, fetching fresh...");
                folders = await API.fetchFolders();
            }
        } else {
            folders = await API.fetchFolders();
        }

        state.folders = folders;

        state.folderMap = {};
        folders.forEach(folder => {
            state.folderMap[folder.id] = folder;
        });

        log(`Loaded ${folders.length} folders into state.`);
        return folders;
    };

    /**
     * Builds folder path from local folder data
     * @param {string} folderId - Target folder ID
     * @returns {Array} Array of folder objects from root to target
     */
    const buildFolderPath = (folderId) => {
        const state = State.getState();
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
     * Selects a folder and triggers asset view update
     * @param {string} folderId - Folder ID to select ("all", "favorites", or folder UUID)
     * @param {Object} callbacks - Event callbacks for asset rendering
     * @param {Function} updateAssetViewFn - Function to update asset view
     */
    const selectFolder = async (folderId, callbacks, updateAssetViewFn) => {
        const state = State.getState();
        const Preferences = global.Views.Preferences;
        const targetId = String(folderId);

        if (String(state.selectedFolderId) === targetId && !state.isWelcome) return;

        state.selectedFolderId = targetId;
        state.isWelcome = false;

        UI.elements.folderList.querySelectorAll(".folder-item").forEach((item) => {
            item.classList.toggle("folder-item--active", item.dataset.folderId === targetId);
        });

        log(`Selected folder: ${targetId}`);

        // Save last folder preference
        if (Preferences) {
            Preferences.setLastFolder(targetId);
        }

        State.resetPagination();
        state.searchQuery = "";
        UI.clearSearch();

        if (targetId === "all" || targetId === "favorites") {
            state.currentFolderPath = [];
            UI.hideBreadcrumbs();
        } else {
            state.currentFolderPath = buildFolderPath(targetId);
            UI.renderBreadcrumbs(state.currentFolderPath, (id) => selectFolder(id, callbacks, updateAssetViewFn));

            const pathIds = state.currentFolderPath.slice(0, -1).map(f => f.id);
            UI.expandToFolder(targetId, pathIds);
        }

        updateAssetViewFn(callbacks);
    };

    global.Views.FolderController = {
        loadFolders,
        buildFolderPath,
        selectFolder
    };

})(window);

