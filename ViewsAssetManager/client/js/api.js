"use strict";

/**
 * Views Asset Manager - API
 * Handles authentication and network requests.
 */
(function(global) {
    global.Views = global.Views || {};
    
    // Wait for Utils to be available
    const Utils = global.Views.Utils;
    const log = Utils ? Utils.log : console.log;

    const API_BASE_URL = "https://api.viewseditors.com";
    const API_KEY_STORAGE_KEY = "views_asset_manager_api_key";
    
    /** Cached extension version read from manifest */
    let cachedExtensionVersion = null;
    
    /**
     * Gets the extension version from the manifest.xml
     * @returns {string} Version string from manifest
     */
    const getExtensionVersion = () => {
        if (cachedExtensionVersion) return cachedExtensionVersion;
        
        try {
            const csInterface = new CSInterface();
            const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            const fs = require("fs");
            const path = require("path");
            const manifestPath = path.join(extensionPath, "CSXS", "manifest.xml");
            
            if (fs.existsSync(manifestPath)) {
                const manifestContent = fs.readFileSync(manifestPath, "utf8");
                const match = manifestContent.match(/ExtensionBundleVersion="([^"]+)"/);
                if (match && match[1]) {
                    cachedExtensionVersion = match[1];
                    log("Read extension version from manifest:", cachedExtensionVersion);
                    return cachedExtensionVersion;
                }
            }
        } catch (e) {
            log("Failed to read version from manifest:", e.message);
        }
        
        // Fallback
        cachedExtensionVersion = "1.0.0";
        return cachedExtensionVersion;
    };
    
    let currentApiKey = "";
    let cachedDeviceId = null;

    /**
     * Storage functions for API key management
     */
    const storage = {
        get: (key) => {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.error("Failed to read from storage:", error);
                return null;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                console.error("Failed to write to storage:", error);
                return false;
            }
        },
        remove: (key) => {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error("Failed to remove from storage:", error);
                return false;
            }
        }
    };

    /**
     * Gets the stored API key
     * @returns {string|null} The stored API key or null
     */
    const getStoredApiKey = () => {
        return storage.get(API_KEY_STORAGE_KEY);
    };

    /**
     * Stores the API key securely
     * @param {string} apiKey - The API key to store
     * @returns {boolean} Success status
     */
    const storeApiKey = (apiKey) => {
        const success = storage.set(API_KEY_STORAGE_KEY, apiKey);
        if (success) {
            currentApiKey = apiKey;
            log("API key stored successfully");
        }
        return success;
    };

    /**
     * Removes the stored API key
     * @returns {boolean} Success status
     */
    const removeApiKey = () => {
        const success = storage.remove(API_KEY_STORAGE_KEY);
        if (success) {
            currentApiKey = "";
            log("API key removed");
        }
        return success;
    };

    const setApiKey = (key) => {
        currentApiKey = key;
    };

    /**
     * Gets the device ID (generates and caches it on first call)
     * @returns {Promise<string>} The device ID
     */
    const ensureDeviceId = async () => {
        if (!cachedDeviceId) {
            if (typeof DeviceId === 'undefined' || typeof DeviceId.getDeviceId !== 'function') {
                throw new Error("Device ID module not loaded");
            }
            cachedDeviceId = await DeviceId.getDeviceId();
            log("Device ID generated and cached");
        }
        return cachedDeviceId;
    };

    /**
     * Validates that an API key is configured
     * @throws {Error} If API key is not set
     */
    const ensureApiKey = () => {
        if (!currentApiKey) {
            const warning = "API key is required. Please configure your API key in settings.";
            console.error(warning);
            throw new Error(warning);
        }
    };

    /**
     * Makes an authenticated GET request to the API
     * @param {string} path - API endpoint path (e.g., "/assets")
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If API key is missing, device limit exceeded, or request fails
     */
    const fetchJson = async (path) => {
        ensureApiKey();
        const deviceId = await ensureDeviceId();

        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: "GET",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-API-Key": currentApiKey,
                "X-Device-ID": deviceId
            }
        });

        // Handle device limit exceeded
        if (response.status === 403) {
            throw new Error("This API key is already registered to another device. Please contact your administrator or use a different API key.");
        }

        // Handle missing device ID (shouldn't happen, but just in case)
        if (response.status === 400) {
            const errorText = await response.text();
            if (errorText.includes("device") || errorText.includes("Device")) {
                throw new Error("Device identification error. Please restart the extension.");
            }
        }

        if (!response.ok) {
            throw new Error(`API error ${response.status}: ${response.statusText}`);
        }
        return response.json();
    };

    /**
     * Validates an API key by making a test request with device binding
     * @param {string} apiKey - The API key to validate
     * @returns {Promise<boolean>} Whether the key is valid and successfully bound to this device
     */
    const validateApiKey = async (apiKey) => {
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error("API key cannot be empty");
        }

        // Generate device ID for validation
        const deviceId = await ensureDeviceId();
        log(`Testing API key with device ID: ${deviceId.substring(0, 16)}...`);

        // Test the key by making a request to the API
        try {
            log(`Validating API key against ${API_BASE_URL}/folders`);
            const response = await fetch(`${API_BASE_URL}/folders`, {
                method: "GET",
                cache: "no-cache",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-API-Key": apiKey,
                    "X-Device-ID": deviceId
                }
            });

            log(`Validation response: ${response.status} ${response.statusText}`);

            if (response.status === 200 || response.status === 404) {
                log("API key validated and bound to this device");
                return true;
            }

            if (response.status === 401) {
                throw new Error("Invalid API key. Please check and try again.");
            }

            if (response.status === 403) {
                throw new Error("This API key is already registered to another device. Please use a different key or contact your administrator.");
            }

            if (response.status === 400) {
                let errorDetails = "";
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.message || errorData.error || "";
                } catch (e) {}
                throw new Error(`Validation error: ${errorDetails || "Invalid request. Please try again."}`);
            }

            if (response.status === 500) {
                let errorDetails = "";
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.message || errorData.error || "";
                } catch (e) {}
                throw new Error(`Server error (500)${errorDetails ? ": " + errorDetails : ". Please try again later or contact support."}`);
            }

            throw new Error(`API error ${response.status}: ${response.statusText}`);
        } catch (error) {
            if (error.message.includes("API error") || 
                error.message.includes("Invalid API key") || 
                error.message.includes("already registered") ||
                error.message.includes("Server error") ||
                error.message.includes("Validation error")) {
                throw error;
            }
            
            log("Validation error:", error);
            throw new Error("Unable to validate API key. Check your network connection. You may be on a newtwork that blocks the API. Consider using a VPN or proxy.");
        }
    };

    /**
     * Fetches folders from the API
     */
    const fetchFolders = async () => {
        try {
            log("Fetching folders.");
            const data = await fetchJson("/folders");
            const folders = Array.isArray(data) ? data : data.folders || [];
            log(`Loaded ${folders.length} folders.`);
            return folders;
        } catch (error) {
            console.error("Failed to load folders", error);
            return [];
        }
    };

    /**
     * Requests a presigned download URL for an asset
     */
    const requestAssetDownload = async (assetId) => {
        if (!assetId) {
            throw new Error("Asset id missing.");
        }
        const encodedId = encodeURIComponent(assetId);
        log(`Requesting download for asset: ${assetId} (encoded: ${encodedId})`);
        return fetchJson(`/assets/${encodedId}/download`);
    };

    /**
     * Fetches the API version from the server
     * @returns {Promise<{version: string, major: number, minor: number, patch: number}>} Version info
     */
    const fetchVersion = async () => {
        log("Fetching API version...");
        const response = await fetch(`${API_BASE_URL}/version`, {
            method: "GET",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch version: ${response.status}`);
        }

        return response.json();
    };

    /**
     * Gets the current extension version (read from manifest)
     * @returns {string} Current version string
     */
    const getExpectedVersion = () => getExtensionVersion();

    /**
     * Compares version strings to check if update is needed
     * Only returns true if server version is NEWER than local version
     * @param {string} serverVersion - Version from the server
     * @returns {boolean} True if server version is newer (update needed)
     */
    const isUpdateRequired = (serverVersion) => {
        const localVersion = getExtensionVersion();
        try {
            const [serverMajor, serverMinor, serverPatch] = serverVersion.split(".").map(Number);
            const [localMajor, localMinor, localPatch] = localVersion.split(".").map(Number);
            
            // Server major version is higher
            if (serverMajor > localMajor) return true;
            // Same major, server minor is higher
            if (serverMajor === localMajor && serverMinor > localMinor) return true;
            // Same major and minor, server patch is higher
            if (serverMajor === localMajor && serverMinor === localMinor && serverPatch > localPatch) return true;
            
            return false;
        } catch (e) {
            // If parsing fails, fall back to simple string comparison
            log("Version parse error, falling back to string compare:", e);
            return serverVersion !== localVersion;
        }
    };

    global.Views.API = {
        setApiKey,
        getStoredApiKey,
        storeApiKey,
        removeApiKey,
        validateApiKey,
        fetchJson,
        fetchFolders,
        requestAssetDownload,
        fetchVersion,
        getExpectedVersion,
        isUpdateRequired
    };

})(window);

