"use strict";

/**
 * Views Asset Manager - After Effects Extension
 * 
 * API key is stored securely in localStorage and can be managed via the GUI.
 * - API key can be either an admin key or a user-generated key from the API
 * - All API requests require the X-API-Key header for authentication
 */

(function () {
    const API_BASE_URL = "https://api.viewseditors.com/";
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
     * Fetches the asset catalog from the API
     * Expected response format: { assets: [...] }
     * Each asset contains: id, name, size, thumbnail, uploadDate
     */
    const fetchAssets = async () => {
        setLoading(true);
        setStatus("Fetching assets…", "info");
        try {
            log("Fetching asset catalog.");
            const data = await fetchJson("/assets");
            const assets = Array.isArray(data) ? data : data.assets || [];
            state.assets = assets;
            renderAssets(assets);
            log(`Loaded ${assets.length} assets.`);
            setStatus(`${assets.length} assets ready.`, "success");
        } catch (error) {
            console.error(LOG_PREFIX, "Failed to load assets", error);
            renderAssets([]);
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
        return fetchJson(`/assets/${assetId}/download`);
    };

    /**
     * Downloads a file from a URL and converts it to base64
     * @param {string} url - The URL to download from (presigned URL from API)
     * @returns {Promise<string>} Base64-encoded file data
     */
    const downloadFileAsBase64 = async (url) => {
        const response = await fetch(url, {
            method: "GET",
            cache: "no-cache"
        });

        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(",")[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const handleAssetDownload = async (asset, button) => {
        setLoading(true);
        setStatus(`Importing ${asset.name || "asset"}…`, "info");
        button.disabled = true;
        const originalLabel = button.textContent;
        button.textContent = "Importing…";

        try {
            log("Starting download for asset", asset.id);
            const payload = await requestAssetDownload(asset.id);

            if (!payload.url) {
                throw new Error("API did not provide a download URL.");
            }

            log("Downloading asset from presigned URL");
            const base64Data = await downloadFileAsBase64(payload.url);

            const fileName = sanitizeFileName(asset.name || "asset");
            log("Saving asset to temp directory");
            const importPath = await evalScript(
                `saveToTemp("${escapeForEval(base64Data)}","${escapeForEval(fileName)}")`
            );

            if (!importPath) {
                throw new Error("Failed to save asset to temporary directory.");
            }

            log("Importing asset into After Effects");
            const result = await evalScript(
                `importAndAddAsset("${escapeForEval(importPath)}")`
            );
            log("Asset imported successfully:", asset.id);
            setStatus(result || `${asset.name || "Asset"} imported successfully.`, "success");
        } catch (error) {
            console.error(LOG_PREFIX, "Import failed", error);
            setStatus(error.message || "Unable to import asset.", "error");
        } finally {
            setLoading(false);
            button.disabled = false;
            button.textContent = originalLabel;
        }
    };

    const renderAssets = (assets) => {
        elements.grid.innerHTML = "";

        if (!assets.length) {
            const empty = document.createElement("p");
            empty.className = "asset-grid__empty";
            empty.textContent = "No assets available.";
            elements.grid.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        assets.forEach((asset) => {
            fragment.appendChild(createAssetCard(asset));
        });
        elements.grid.appendChild(fragment);
        log("Rendered asset grid.");
    };

    /**
     * Creates an asset card element for the grid
     * @param {Object} asset - Asset data from API (id, name, size, thumbnail, uploadDate)
     * @returns {HTMLElement} Article element containing the asset card
     */
    const createAssetCard = (asset) => {
        const card = document.createElement("article");
        card.className = "asset-card";

        const img = document.createElement("img");
        img.className = "asset-card__thumb";
        img.alt = asset.name || "Asset thumbnail";
        img.src = asset.thumbnail || PLACEHOLDER_THUMB;

        const title = document.createElement("p");
        title.className = "asset-card__title";
        title.textContent = asset.name || "Untitled asset";

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
            const response = await fetch(`${API_BASE_URL}/assets`, {
                method: "GET",
                cache: "no-cache",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-API-Key": apiKey
                }
            });

            if (response.status === 401) {
                throw new Error("Invalid API key. Please check and try again.");
            }

            if (!response.ok && response.status !== 404) {
                throw new Error(`API error ${response.status}: ${response.statusText}`);
            }

            return true;
        } catch (error) {
            if (error.message.includes("API error") || error.message.includes("Invalid API key")) {
                throw error;
            }
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
                await fetchAssets();
            } else {
                setStatus("API key updated successfully!", "success");
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
        elements.refreshButton.addEventListener("click", () => {
            log("Manual refresh requested.");
            fetchAssets();
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
            await fetchAssets();
        } catch (error) {
            console.error(LOG_PREFIX, "Initialization failed", error);
            setStatus(error.message || "Initialization failed.", "error");
            setLoading(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();

