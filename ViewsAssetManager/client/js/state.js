"use strict";

/**
 * Views Asset Manager - State
 * Centralized state management and constants.
 */
(function(global) {
    global.Views = global.Views || {};

    /** Discord webhook URL for feedback */
    const FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/1444455426627473499/Ss2N0KNP7tgrFYmFp_GFSca5QLCOugvRcmcPXemtCYCf2RaFO5n2l4CCJU4IO1G1H-q0";

    /** How often to check for updates (5 minutes) */
    const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

    /**
     * Application state object
     * @type {Object}
     */
    const state = {
        allAssets: [],
        displayedAssets: [],
        filteredAssets: [],
        searchResults: [],
        selectedAssetIds: [],
        previewAsset: null,
        folders: [],
        folderMap: {},
        selectedFolderId: null,
        currentFolderPath: [],
        searchQuery: "",
        apiKey: "",
        deviceId: null,
        isFirstRun: false,
        isWelcome: true,
        pagination: {
            page: 1,
            limit: 20,
            total: 0
        },
        visibleCount: 20,
        fetchSession: 0,
        cache: {},
        preloadPromise: null,
        preloadFoldersPromise: null
    };

    /** Debounce timer for search */
    let searchDebounceTimer = null;

    /** Interval ID for periodic version checks */
    let versionCheckInterval = null;

    /**
     * Gets the current state
     * @returns {Object} The state object
     */
    const getState = () => state;

    /**
     * Gets a specific state value
     * @param {string} key - State key
     * @returns {*} The state value
     */
    const get = (key) => state[key];

    /**
     * Sets a state value
     * @param {string} key - State key
     * @param {*} value - Value to set
     */
    const set = (key, value) => {
        state[key] = value;
    };

    /**
     * Gets the search debounce timer
     * @returns {number|null} Timer ID
     */
    const getSearchDebounceTimer = () => searchDebounceTimer;

    /**
     * Sets the search debounce timer
     * @param {number|null} timer - Timer ID
     */
    const setSearchDebounceTimer = (timer) => {
        searchDebounceTimer = timer;
    };

    /**
     * Gets the version check interval
     * @returns {number|null} Interval ID
     */
    const getVersionCheckInterval = () => versionCheckInterval;

    /**
     * Sets the version check interval
     * @param {number|null} interval - Interval ID
     */
    const setVersionCheckInterval = (interval) => {
        versionCheckInterval = interval;
    };

    /**
     * Resets pagination state
     */
    const resetPagination = () => {
        state.pagination.page = 1;
        state.visibleCount = 20;
    };

    /**
     * Increments the fetch session counter
     * @returns {number} The new session ID
     */
    const incrementFetchSession = () => {
        state.fetchSession++;
        return state.fetchSession;
    };

    /**
     * Clears the asset cache
     */
    const clearCache = () => {
        state.cache = {};
    };

    /**
     * Clears preload promises
     */
    const clearPreloadPromises = () => {
        state.preloadPromise = null;
        state.preloadFoldersPromise = null;
    };

    global.Views.State = {
        getState,
        get,
        set,
        getSearchDebounceTimer,
        setSearchDebounceTimer,
        getVersionCheckInterval,
        setVersionCheckInterval,
        resetPagination,
        incrementFetchSession,
        clearCache,
        clearPreloadPromises,
        FEEDBACK_WEBHOOK_URL,
        VERSION_CHECK_INTERVAL_MS
    };

})(window);

