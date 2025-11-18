"use strict";

/**
 * Views Asset Manager - After Effects Extension
 * 
 * API key is stored securely in localStorage and can be managed via the GUI.
 * - API key can be either an admin key or a user-generated key from the API
 * - All API requests require the X-API-Key header for authentication
 */

(function () {
    const API_BASE_URL = "https://api.viewseditors.com";
    const API_KEY_STORAGE_KEY = "views_asset_manager_api_key";
    const LOG_PREFIX = "[ViewsAssetManager]";
    const PLACEHOLDER_THUMB =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%232a2a2a'/%3E%3Cpath d='M40 140l40-50 35 35 25-30 20 45H40z' fill='%233a3a3a'/%3E%3C/svg%3E";
    const csInterface = new CSInterface();
    const log = (...messages) => console.log(LOG_PREFIX, ...messages);

    const elements = {
        grid: document.getElementById("assetGrid"),
        spinner: document.getElementById("spinner"),
        status: document.getElementById("statusArea"),
        refreshButton: document.getElementById("refreshButton"),
        settingsButton: document.getElementById("settingsButton"),
        folderList: document.getElementById("folderList"),
        apiKeyModal: document.getElementById("apiKeyModal"),
        apiKeyForm: document.getElementById("apiKeyForm"),
        apiKeyInput: document.getElementById("apiKeyInput"),
        apiKeyError: document.getElementById("apiKeyError"),
        saveApiKeyButton: document.getElementById("saveApiKeyButton"),
        cancelApiKeyButton: document.getElementById("cancelApiKeyButton"),
        toggleApiKeyVisibility: document.getElementById("toggleApiKeyVisibility"),
        showKeyIcon: document.getElementById("showKeyIcon"),
        hideKeyIcon: document.getElementById("hideKeyIcon")
    };

    const state = {
        assets: [],
        folders: [],
        selectedFolderId: "all", // "all" or folder UUID
        apiKey: "",
        isFirstRun: false
    };

    const escapeForEval = (value) =>
        (value || "")
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");

    const sanitizeFileName = (value) =>
        (value || "asset")
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "asset";

    /**
     * Returns a human-friendly display name for an asset by stripping
     * a leading timestamp prefix (e.g. "1763181854469-name.png" -> "name.png").
     * Falls back to the raw value when it does not match the pattern.
     * @param {string} value - Asset name or id
     * @returns {string} Display name
     */
    const getDisplayName = (value) => {
        const raw = (value || "").split("/").pop();
        if (!raw) {
            return "asset";
        }

        const match = raw.match(/^\d{10,}-(.+)$/);
        return match && match[1] ? match[1] : raw;
    };

    const evalScript = (script) =>
        new Promise((resolve, reject) => {
            try {
                csInterface.evalScript(script, (result) => {
                    if (typeof result === "string" && result.indexOf("Error") === 0) {
                        reject(new Error(result));
                        return;
                    }
                    resolve(result);
                });
            } catch (error) {
                reject(error);
            }
        });

    /**
     * Storage functions for API key management
     */
    const storage = {
        get: (key) => {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.error(LOG_PREFIX, "Failed to read from storage:", error);
                return null;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                console.error(LOG_PREFIX, "Failed to write to storage:", error);
                return false;
            }
        },
        remove: (key) => {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error(LOG_PREFIX, "Failed to remove from storage:", error);
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
            state.apiKey = apiKey;
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
            state.apiKey = "";
            log("API key removed");
        }
        return success;
    };

    const loadHostScript = async () => {
        const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        const normalized = extensionRoot.replace(/\\/g, "\\\\");
        await evalScript(`$.evalFile("${normalized}/jsx/hostscript.jsx")`);
        log("Host script loaded.");
    };

    const setStatus = (message = "", tone = "info") => {
        if (!message) {
            elements.status.textContent = "";
            elements.status.className = "status status--hidden";
            return;
        }

        elements.status.textContent = message;
        elements.status.className = `status status--${tone}`;
    };

    const setLoading = (shouldShow) => {
        elements.spinner.classList.toggle("spinner--hidden", !shouldShow);
        elements.refreshButton.disabled = shouldShow;
    };

    /**
     * Validates that an API key is configured
     * @throws {Error} If API key is not set
     */
    const ensureApiKey = () => {
        if (!state.apiKey) {
            const warning = "API key is required. Please configure your API key in settings.";
            console.error(`[ViewsAssetManager] ${warning}`);
            throw new Error(warning);
        }
    };

    /**
     * Makes an authenticated GET request to the API
     * @param {string} path - API endpoint path (e.g., "/assets")
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If API key is missing or request fails
     */
    const fetchJson = async (path) => {
        ensureApiKey();
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: "GET",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-API-Key": state.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`API error ${response.status}: ${response.statusText}`);
        }
        return response.json();
    };

    /**
     * Fetches folders from the API
     * Expected response format: { folders: [{id, name, createdAt}] }
     */
    const fetchFolders = async () => {
        try {
            log("Fetching folders.");
            const data = await fetchJson("/folders");
            const folders = Array.isArray(data) ? data : data.folders || [];
            state.folders = folders;
            renderFolders(folders);
            log(`Loaded ${folders.length} folders.`);
            return folders;
        } catch (error) {
            console.error(LOG_PREFIX, "Failed to load folders", error);
            state.folders = [];
            renderFolders([]);
            return [];
        }
    };

    /**
     * Fetches the asset catalog from the API
     * Expected response format: { assets: [...] }
     * Each asset contains: id, name, size, thumbnail, uploadDate, folderId
     */
    const fetchAssets = async () => {
        setLoading(true);
        setStatus("Fetching assets…", "info");
        try {
            log("Fetching asset catalog.");
            const data = await fetchJson("/assets");
            const assets = Array.isArray(data) ? data : data.assets || [];
            state.assets = assets;
            renderFilteredAssets();
            log(`Loaded ${assets.length} assets.`);
            setStatus(`${assets.length} assets ready.`, "success");
        } catch (error) {
            console.error(LOG_PREFIX, "Failed to load assets", error);
            state.assets = [];
            renderFilteredAssets();
            setStatus(error.message || "Unable to load assets.", "error");
        } finally {
            setLoading(false);
        }
    };

    /**
     * Requests a presigned download URL for an asset
     * @param {string} assetId - Asset ID (S3 key, e.g., "assets/timestamp-filename.png")
     * @returns {Promise<Object>} Response containing { url: "presigned-url" }
     * @note The presigned URL expires after 60 seconds
     */
    const requestAssetDownload = async (assetId) => {
        if (!assetId) {
            throw new Error("Asset id missing.");
        }
        // URL-encode the asset ID since it contains slashes
        const encodedId = encodeURIComponent(assetId);
        log(`Requesting download for asset: ${assetId} (encoded: ${encodedId})`);
        return fetchJson(`/assets/${encodedId}/download`);
    };

    /**
     * Downloads a file from a URL and saves it to a temp directory.
     * Prefers Node.js streaming (more reliable in CEP) and falls back to browser APIs.
     * @param {string} downloadUrl - The URL to download from (presigned URL from API)
     * @param {string} fileName - Name for the saved file
     * @returns {Promise<string>} Absolute path to the downloaded file
     */
    const downloadFileToTemp = async (downloadUrl, fileName) => {
        const safeName = sanitizeFileName(fileName);

        // Prefer Node.js (enabled via --enable-nodejs in the manifest)
        if (typeof require === "function") {
            log("Downloading file via Node.js stream...");

            /** @type {typeof import('fs')} */
            const fs = require("fs");
            /** @type {typeof import('path')} */
            const path = require("path");
            /** @type {typeof import('os')} */
            const os = require("os");
            /** @type {typeof import('http')} */
            const http = require("http");
            /** @type {typeof import('https')} */
            const https = require("https");

            return new Promise((resolve, reject) => {
                try {
                    const tempDir = path.join(os.tmpdir(), "ViewsAssetManager");
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }

                    const filePath = path.join(tempDir, safeName);
                    const fileStream = fs.createWriteStream(filePath);
                    const client = downloadUrl.indexOf("https") === 0 ? https : http;

                    let downloadedBytes = 0;
                    const request = client.get(downloadUrl, (response) => {
                        if (response.statusCode !== 200) {
                            const message = "Failed to download file: " + response.statusCode + " " + (response.statusMessage || "");
                            response.resume();
                            reject(new Error(message));
                            return;
                        }

                        response.on("data", function (chunk) {
                            downloadedBytes += chunk.length;
                        });

                        response.pipe(fileStream);

                        fileStream.on("finish", function () {
                            fileStream.close(function () {
                                const sizeInMB = (downloadedBytes / 1024 / 1024).toFixed(2);
                                log("Downloaded " + sizeInMB + " MB to temp: " + filePath);
                                resolve(filePath);
                            });
                        });
                    });

                    request.on("error", function (error) {
                        try {
                            fileStream.close();
                            fs.unlinkSync(filePath);
                        } catch (e) {
                            // ignore cleanup errors
                        }
                        reject(error);
                    });
                } catch (error) {
                    reject(error);
                }
            });
        }

        // Fallback: browser fetch + CEP FileReader + JSX bridge (original implementation)
        log("Downloading file via fetch/blob fallback...");
        const response = await fetch(downloadUrl, {
            method: "GET",
            cache: "no-cache"
        });

        if (!response.ok) {
            throw new Error("Failed to download file: " + response.status + " " + response.statusText);
        }

        const blob = await response.blob();
        const sizeInMB = (blob.size / 1024 / 1024).toFixed(2);

        log("Downloaded " + sizeInMB + " MB (" + blob.type + ")");

        // Warn about large files (>10MB can be slow)
        if (blob.size > 10 * 1024 * 1024) {
            log("Warning: Large file (" + sizeInMB + " MB) - this may take a moment...");
        }

        // Convert blob to base64 and send through JSX, as before
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async () => {
                try {
                    const base64 = reader.result.split(",")[1];
                    log("Converted to base64, saving as " + safeName + " via JSX...");

                    const tempPath = await evalScript(
                        'saveToTemp(\"' + escapeForEval(base64) + '\", \"' + escapeForEval(safeName) + '\")'
                    );

                    if (!tempPath || (typeof tempPath === "string" && tempPath.indexOf("Error") === 0)) {
                        reject(new Error(tempPath || "Failed to save file"));
                        return;
                    }

                    log("File saved via JSX: " + tempPath);
                    resolve(tempPath);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error("Failed to read downloaded file"));
            };

            reader.readAsDataURL(blob);
        });
    };

    const handleAssetDownload = async (asset, button) => {
        const displayName = getDisplayName(asset.name || asset.id);
        setLoading(true);
        setStatus(`Downloading ${displayName}…`, "info");
        button.disabled = true;
        const originalLabel = button.textContent;
        button.textContent = "Downloading…";

        try {
            log("Starting import for asset:", asset.id);
            
            // Step 1: Get presigned download URL
            const payload = await requestAssetDownload(asset.id);
            if (!payload.url) {
                throw new Error("API did not provide a download URL.");
            }

            // Step 2: Download and save to temp
            button.textContent = "Downloading…";
            const fileName = sanitizeFileName(asset.name || "asset");
            const importPath = await downloadFileToTemp(payload.url, fileName);

            // Step 3: Import into After Effects
            button.textContent = "Importing…";
            setStatus(`Importing ${displayName}…`, "info");
            log("Importing asset into After Effects from:", importPath);
            
            const result = await evalScript(
                `importAndAddAsset("${escapeForEval(importPath)}")`
            );
            
            if (result && result.indexOf("Error") === 0) {
                throw new Error(result);
            }
            
            log("Asset imported successfully:", asset.id);
            setStatus(result || `${displayName || "Asset"} imported successfully.`, "success");
        } catch (error) {
            console.error(LOG_PREFIX, "Import failed", error);
            setStatus(error.message || "Unable to import asset.", "error");
        } finally {
            setLoading(false);
            button.disabled = false;
            button.textContent = originalLabel;
        }
    };

    /**
     * Counts assets per folder
     * @returns {Object} Map of folderId to count
     */
    const countAssetsByFolder = () => {
        const counts = { all: state.assets.length };
        state.assets.forEach((asset) => {
            const folderId = asset.folderId;
            if (folderId) {
                counts[folderId] = (counts[folderId] || 0) + 1;
            }
        });
        return counts;
    };

    /**
     * Renders the folder list in the sidebar
     * @param {Array} folders - Array of folder objects
     */
    const renderFolders = (folders) => {
        const counts = countAssetsByFolder();
        
        // Clear existing custom folders (keep "All Assets")
        const existingItems = elements.folderList.querySelectorAll('.folder-item:not([data-folder-id="all"])');
        existingItems.forEach(item => item.remove());

        // Update count for "All Assets"
        const allItem = elements.folderList.querySelector('[data-folder-id="all"] .folder-item__count');
        if (allItem) allItem.textContent = counts.all;

        // Add folder items
        folders.forEach((folder) => {
            const li = document.createElement("li");
            li.className = "folder-item";
            li.dataset.folderId = folder.id;
            
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", "14");
            svg.setAttribute("height", "14");
            svg.setAttribute("viewBox", "0 0 14 14");
            svg.setAttribute("fill", "currentColor");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M1 3h5l1 1h5v7H1z");
            svg.appendChild(path);

            const nameSpan = document.createElement("span");
            nameSpan.className = "folder-item__name";
            nameSpan.textContent = folder.name;
            nameSpan.title = folder.name;

            const countSpan = document.createElement("span");
            countSpan.className = "folder-item__count";
            countSpan.textContent = counts[folder.id] || 0;

            li.appendChild(svg);
            li.appendChild(nameSpan);
            li.appendChild(countSpan);
            
            li.addEventListener("click", () => selectFolder(folder.id));
            
            elements.folderList.appendChild(li);
        });

        log(`Rendered ${folders.length} folders.`);
    };

    /**
     * Selects a folder and filters assets
     * @param {string} folderId - Folder ID to select ("all" or folder UUID)
     */
    const selectFolder = (folderId) => {
        state.selectedFolderId = folderId;
        
        // Update active state in UI
        elements.folderList.querySelectorAll(".folder-item").forEach((item) => {
            item.classList.toggle("folder-item--active", item.dataset.folderId === folderId);
        });
        
        log(`Selected folder: ${folderId}`);
        renderFilteredAssets();
    };

    /**
     * Filters and renders assets based on selected folder
     */
    const renderFilteredAssets = () => {
        let filteredAssets = state.assets;
        
        if (state.selectedFolderId !== "all") {
            // Show only assets in selected folder
            filteredAssets = state.assets.filter(asset => asset.folderId === state.selectedFolderId);
        }
        
        renderAssets(filteredAssets);
    };

    /**
     * Renders assets to the grid
     * @param {Array} assets - Array of asset objects to render
     */
    const renderAssets = (assets) => {
        elements.grid.innerHTML = "";

        if (!assets.length) {
            const empty = document.createElement("p");
            empty.className = "asset-grid__empty";
            empty.textContent = state.selectedFolderId === "all" 
                ? "No assets available." 
                : "No assets in this folder.";
            elements.grid.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        assets.forEach((asset) => {
            fragment.appendChild(createAssetCard(asset));
        });
        elements.grid.appendChild(fragment);
        log(`Rendered ${assets.length} assets.`);
    };

    /**
     * Creates an asset card element for the grid
     * @param {Object} asset - Asset data from API (id, name, size, thumbnail, uploadDate)
     * @returns {HTMLElement} Article element containing the asset card
     */
    const createAssetCard = (asset) => {
        const card = document.createElement("article");
        card.className = "asset-card";
        const displayName = getDisplayName(asset.name || asset.id);

        const img = document.createElement("img");
        img.className = "asset-card__thumb";
        img.alt = displayName || "Asset thumbnail";
        img.src = asset.thumbnail || PLACEHOLDER_THUMB;

        const title = document.createElement("p");
        title.className = "asset-card__title";
        title.textContent = displayName || "Untitled asset";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "asset-card__cta";
        button.textContent = "Import";
        button.addEventListener("click", () => handleAssetDownload(asset, button));

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(button);
        return card;
    };

    /**
     * Shows the API key setup modal
     * @param {boolean} isRequired - Whether the modal can be cancelled
     */
    const showApiKeyModal = (isRequired = false) => {
        elements.apiKeyModal.classList.remove("modal--hidden");
        elements.apiKeyInput.value = "";
        elements.apiKeyError.classList.add("form-error--hidden");
        elements.apiKeyError.textContent = "";
        elements.cancelApiKeyButton.style.display = isRequired ? "none" : "inline-flex";
        elements.apiKeyInput.focus();
        log(isRequired ? "Showing required API key setup" : "Showing API key settings");
    };

    /**
     * Hides the API key setup modal
     */
    const hideApiKeyModal = () => {
        elements.apiKeyModal.classList.add("modal--hidden");
        elements.apiKeyInput.value = "";
        elements.apiKeyError.classList.add("form-error--hidden");
    };

    /**
     * Shows an error in the API key form
     * @param {string} message - Error message to display
     */
    const showApiKeyError = (message) => {
        elements.apiKeyError.textContent = message;
        elements.apiKeyError.classList.remove("form-error--hidden");
    };

    /**
     * Validates an API key by making a test request
     * @param {string} apiKey - The API key to validate
     * @returns {Promise<boolean>} Whether the key is valid
     */
    const validateApiKey = async (apiKey) => {
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error("API key cannot be empty");
        }

        // Test the key by making a request to the API
        try {
            log(`Testing API key against ${API_BASE_URL}/assets`);
            const response = await fetch(`${API_BASE_URL}/assets`, {
                method: "GET",
                cache: "no-cache",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-API-Key": apiKey
                }
            });

            log(`Validation response: ${response.status} ${response.statusText}`);

            if (response.status === 401) {
                throw new Error("Invalid API key. Please check and try again.");
            }

            if (response.status === 500) {
                // Get more details about the server error
                let errorDetails = "";
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.message || errorData.error || "";
                } catch (e) {
                    // Ignore JSON parse errors
                }
                throw new Error(`Server error (500)${errorDetails ? ": " + errorDetails : ". Please try again later or contact support."}`);
            }

            if (!response.ok && response.status !== 404) {
                throw new Error(`API error ${response.status}: ${response.statusText}`);
            }

            // 200 or 404 are both acceptable (404 just means no assets yet)
            return true;
        } catch (error) {
            // Re-throw our custom errors
            if (error.message.includes("API error") || 
                error.message.includes("Invalid API key") || 
                error.message.includes("Server error")) {
                throw error;
            }
            
            // Network or other errors
            log("Validation error:", error);
            throw new Error("Unable to validate API key. Check your network connection.");
        }
    };

    /**
     * Handles API key form submission
     * @param {Event} event - Form submit event
     */
    const handleApiKeySubmit = async (event) => {
        event.preventDefault();
        
        const apiKey = elements.apiKeyInput.value.trim();
        
        if (!apiKey) {
            showApiKeyError("Please enter an API key");
            return;
        }

        elements.saveApiKeyButton.disabled = true;
        elements.saveApiKeyButton.textContent = "Validating...";
        elements.apiKeyError.classList.add("form-error--hidden");

        try {
            log("Validating API key...");
            await validateApiKey(apiKey);
            
            const success = storeApiKey(apiKey);
            if (!success) {
                throw new Error("Failed to store API key");
            }

            log("API key validated and stored successfully");
            hideApiKeyModal();
            
            if (state.isFirstRun) {
                state.isFirstRun = false;
                setStatus("API key configured successfully!", "success");
                await loadHostScript();
                await Promise.all([fetchFolders(), fetchAssets()]);
            } else {
                setStatus("API key updated successfully!", "success");
                await Promise.all([fetchFolders(), fetchAssets()]);
            }
        } catch (error) {
            console.error(LOG_PREFIX, "API key validation failed:", error);
            showApiKeyError(error.message || "Failed to validate API key");
        } finally {
            elements.saveApiKeyButton.disabled = false;
            elements.saveApiKeyButton.textContent = "Save Key";
        }
    };

    /**
     * Toggles API key visibility in the input field
     */
    const toggleApiKeyVisibility = () => {
        const isPassword = elements.apiKeyInput.type === "password";
        elements.apiKeyInput.type = isPassword ? "text" : "password";
        elements.showKeyIcon.classList.toggle("hidden", isPassword);
        elements.hideKeyIcon.classList.toggle("hidden", !isPassword);
    };

    const bindEvents = () => {
        elements.refreshButton.addEventListener("click", async () => {
            log("Manual refresh requested.");
            await Promise.all([fetchFolders(), fetchAssets()]);
        });

        elements.settingsButton.addEventListener("click", () => {
            log("Settings opened.");
            showApiKeyModal(false);
        });

        elements.apiKeyForm.addEventListener("submit", handleApiKeySubmit);

        elements.cancelApiKeyButton.addEventListener("click", () => {
            if (!state.isFirstRun) {
                hideApiKeyModal();
            }
        });

        elements.toggleApiKeyVisibility.addEventListener("click", toggleApiKeyVisibility);

        // Close modal when clicking overlay (only if not required)
        elements.apiKeyModal.querySelector(".modal__overlay").addEventListener("click", () => {
            if (!state.isFirstRun && !elements.cancelApiKeyButton.style.display !== "none") {
                hideApiKeyModal();
            }
        });

        // Bind default folder item
        const allAssetsItem = elements.folderList.querySelector('[data-folder-id="all"]');
        if (allAssetsItem) {
            allAssetsItem.addEventListener("click", () => selectFolder("all"));
        }
    };

    const init = async () => {
        bindEvents();
        try {
            log("Initializing panel UI.");
            
            // Check for stored API key
            const storedKey = getStoredApiKey();
            if (storedKey) {
                state.apiKey = storedKey;
                log("API key loaded from storage");
            } else {
                log("No API key found - first run");
                state.isFirstRun = true;
                setLoading(false);
                showApiKeyModal(true);
                return;
            }

            await loadHostScript();
            
            // Fetch folders and assets in parallel
            await Promise.all([fetchFolders(), fetchAssets()]);
        } catch (error) {
            console.error(LOG_PREFIX, "Initialization failed", error);
            setStatus(error.message || "Initialization failed.", "error");
            setLoading(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();

