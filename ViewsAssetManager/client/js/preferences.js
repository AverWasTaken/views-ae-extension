"use strict";

/**
 * Views Asset Manager - Preferences
 * Handles persistent user preferences and favorites storage.
 */
(function(global) {
    global.Views = global.Views || {};

    const STORAGE_KEYS = {
        GRID_SIZE: "views_grid_size",
        LAST_FOLDER: "views_last_folder",
        SIDEBAR_COLLAPSED: "views_sidebar_collapsed",
        FAVORITES: "views_favorites"
    };

    /**
     * Safely gets a value from localStorage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Stored value or default
     */
    const get = (key, defaultValue = null) => {
        try {
            const stored = localStorage.getItem(key);
            if (stored === null) return defaultValue;
            return JSON.parse(stored);
        } catch (e) {
            console.error("Preferences: Failed to read", key, e);
            return defaultValue;
        }
    };

    /**
     * Safely sets a value in localStorage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} Success status
     */
    const set = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error("Preferences: Failed to write", key, e);
            return false;
        }
    };

    /**
     * Gets the saved grid size preference
     * @returns {string} Grid size ("small", "medium", or "large")
     */
    const getGridSize = () => get(STORAGE_KEYS.GRID_SIZE, "medium");

    /**
     * Saves the grid size preference
     * @param {string} size - Grid size to save
     */
    const setGridSize = (size) => set(STORAGE_KEYS.GRID_SIZE, size);

    /**
     * Gets the last selected folder ID
     * @returns {string|null} Folder ID or null
     */
    const getLastFolder = () => get(STORAGE_KEYS.LAST_FOLDER, null);

    /**
     * Saves the last selected folder ID
     * @param {string} folderId - Folder ID to save
     */
    const setLastFolder = (folderId) => set(STORAGE_KEYS.LAST_FOLDER, folderId);

    /**
     * Gets sidebar collapsed state
     * @returns {boolean} True if collapsed
     */
    const getSidebarCollapsed = () => get(STORAGE_KEYS.SIDEBAR_COLLAPSED, false);

    /**
     * Saves sidebar collapsed state
     * @param {boolean} collapsed - Collapsed state
     */
    const setSidebarCollapsed = (collapsed) => set(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed);

    /**
     * Gets the list of favorite asset IDs
     * @returns {Array<string>} Array of favorited asset IDs
     */
    const getFavorites = () => get(STORAGE_KEYS.FAVORITES, []);

    /**
     * Checks if an asset is favorited
     * @param {string} assetId - Asset ID to check
     * @returns {boolean} True if favorited
     */
    const isFavorite = (assetId) => {
        const favorites = getFavorites();
        return favorites.includes(assetId);
    };

    /**
     * Adds an asset to favorites
     * @param {string} assetId - Asset ID to add
     * @returns {boolean} Success status
     */
    const addFavorite = (assetId) => {
        const favorites = getFavorites();
        if (!favorites.includes(assetId)) {
            favorites.push(assetId);
            return set(STORAGE_KEYS.FAVORITES, favorites);
        }
        return true;
    };

    /**
     * Removes an asset from favorites
     * @param {string} assetId - Asset ID to remove
     * @returns {boolean} Success status
     */
    const removeFavorite = (assetId) => {
        const favorites = getFavorites();
        const index = favorites.indexOf(assetId);
        if (index > -1) {
            favorites.splice(index, 1);
            return set(STORAGE_KEYS.FAVORITES, favorites);
        }
        return true;
    };

    /**
     * Toggles favorite status for an asset
     * @param {string} assetId - Asset ID to toggle
     * @returns {boolean} New favorite status (true = now favorited)
     */
    const toggleFavorite = (assetId) => {
        if (isFavorite(assetId)) {
            removeFavorite(assetId);
            return false;
        } else {
            addFavorite(assetId);
            return true;
        }
    };

    global.Views.Preferences = {
        getGridSize,
        setGridSize,
        getLastFolder,
        setLastFolder,
        getSidebarCollapsed,
        setSidebarCollapsed,
        getFavorites,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite
    };

})(window);

