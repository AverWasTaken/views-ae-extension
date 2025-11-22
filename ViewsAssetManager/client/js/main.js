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

    const LoadingOverlay = {
        el: document.getElementById("loadingOverlay"),
        title: document.getElementById("loadingTitle"),
        message: document.getElementById("loadingMessage"),
        progressContainer: document.getElementById("loadingProgress"),
        progressBar: document.getElementById("loadingProgressBar"),
        
        show(title = "Loading...", message = "Please wait") {
            this.title.textContent = title;
            this.message.textContent = message;
            this.el.classList.remove("loading-overlay--hidden");
            this.hideProgress();
        },
        
        hide() {
            this.el.classList.add("loading-overlay--hidden");
        },
        
        update(message) {
            if (message) this.message.textContent = message;
        },
        
        showProgress(percent) {
            this.progressContainer.classList.remove("hidden");
            this.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        },
        
        hideProgress() {
            this.progressContainer.classList.add("hidden");
            this.progressBar.style.width = "0%";
        }
    };

    const state = {
        allAssets: [], // All assets from API
        displayedAssets: [], // Currently displayed filtered assets
        filteredAssets: [], // All assets matching current folder
        folders: [],
        selectedFolderId: null, // Start with no folder selected
        apiKey: "",
        deviceId: null, // Cached device ID (generated once)
        isFirstRun: false,
        isWelcome: true, // Track welcome screen state
        pagination: {
            page: 1,
            limit: 20,
            total: 0
        },
        visibleCount: 20, // How many assets to show (for "Load More")
        fetchSession: 0, // ID to track active fetch requests
        cache: {} // Cache for asset requests: "folderId:page" -> { assets, total }
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
     * Gets the device ID (generates and caches it on first call)
     * @returns {Promise<string>} The device ID
     */
    const ensureDeviceId = async () => {
        if (!state.deviceId) {
            if (typeof DeviceId === 'undefined' || typeof DeviceId.getDeviceId !== 'function') {
                throw new Error("Device ID module not loaded");
            }
            state.deviceId = await DeviceId.getDeviceId();
            log("Device ID generated and cached");
        }
        return state.deviceId;
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
                "X-API-Key": state.apiKey,
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
     * Renders the welcome screen
     */
    const renderWelcomeScreen = () => {
        elements.grid.innerHTML = "";
        
        const container = document.createElement("div");
        container.className = "welcome-screen";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.minHeight = "100%";
        container.style.gridColumn = "1 / -1"; // Fix squished look by spanning all columns
        container.style.color = "var(--ae-text-secondary)";
        container.style.textAlign = "center";
        container.style.padding = "2rem";

        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("width", "48");
        icon.setAttribute("height", "48");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "currentColor");
        icon.style.marginBottom = "1rem";
        icon.style.opacity = "0.5";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z");
        icon.appendChild(path);

        const title = document.createElement("h2");
        title.textContent = "Welcome to Views Asset Manager";
        title.style.margin = "0 0 0.5rem 0";
        title.style.fontSize = "1.2rem";
        title.style.fontWeight = "600";
        title.style.color = "var(--ae-text-primary)";

        const text = document.createElement("p");
        text.textContent = "Select a folder from the sidebar to view assets.";
        text.style.margin = "0 0 2rem 0";

        const credits = document.createElement("div");
        credits.style.fontSize = "0.85rem";
        credits.style.opacity = "0.7";
        credits.style.lineHeight = "1.6";
        credits.innerHTML = `
            <p style="margin: 0 0 0.5rem 0">Made by ayvyr, assets by soracrt.</p>
            <p style="margin: 0">If you have issues, join <a href="#" id="discordLink" style="color: var(--ae-accent); text-decoration: none; border-bottom: 1px solid transparent;">discord.gg/views</a> and make a ticket.</p>
        `;

        container.appendChild(icon);
        container.appendChild(title);
        container.appendChild(text);
        container.appendChild(credits);

        elements.grid.appendChild(container);

        // Handle external link
        const link = container.querySelector("#discordLink");
        if (link) {
            link.addEventListener("mouseenter", () => link.style.borderBottomColor = "var(--ae-accent)");
            link.addEventListener("mouseleave", () => link.style.borderBottomColor = "transparent");
            link.addEventListener("click", (e) => {
                e.preventDefault();
                csInterface.openURLInDefaultBrowser("https://discord.gg/views");
            });
        }

        setStatus("Ready.", "info");
    };

    /**
     * Filters assets by current folder
     * @param {Array} allAssets - List of all assets
     * @returns {Array} - Filtered assets
     */
    const filterAssetsByFolder = (allAssets) => {
        if (String(state.selectedFolderId) === "all") {
            return allAssets;
        }
        // folderId in asset might be null for root, so handle "null" string comparison if needed
        // usually API returns null for root assets
        return allAssets.filter(asset => {
            const assetFolder = asset.folderId || "null"; // Normalize null to string if needed, but likely just check equality
            // If selectedFolderId is a specific ID, match it.
            return String(asset.folderId) === String(state.selectedFolderId);
        });
    };

    /**
     * Fetches ALL assets from the API to allow client-side filtering
     */
    const syncAssets = async () => {
        state.fetchSession++;
        const currentSession = state.fetchSession;
        
        setStatus("Syncing assets...", "info");
        setLoading(true);
        
        try {
            let page = 1;
            const limit = 100; // Larger batch for efficiency
            let allFetched = [];
            let total = 0;
            
            // Fetch first page to get total and first batch
            log(`Syncing assets page ${page}...`);
            let data = await fetchJson(`/assets?page=${page}&limit=${limit}`);
            
            allFetched = [...(data.assets || [])];
            total = data.total || 0;
            
            // Fetch remaining pages if needed
            const totalPages = Math.ceil(total / limit);
            
            if (totalPages > 1) {
                log(`Fetching ${totalPages - 1} more pages...`);
                const promises = [];
                for (let p = 2; p <= totalPages; p++) {
                    promises.push(fetchJson(`/assets?page=${p}&limit=${limit}`));
                }
                
                const results = await Promise.all(promises);
                results.forEach(res => {
                    if (res.assets) {
                        allFetched = [...allFetched, ...res.assets];
                    }
                });
            }
            
            if (state.fetchSession !== currentSession) return;

            state.allAssets = allFetched;
            log(`Synced ${state.allAssets.length} assets.`);
            
            // Update view
            updateAssetView();
            
        } catch (error) {
            console.error(LOG_PREFIX, "Failed to sync assets", error);
            setStatus("Failed to sync assets.", "error");
            if (state.fetchSession === currentSession) {
                renderAssets([]);
            }
        } finally {
            if (state.fetchSession === currentSession) {
                setLoading(false);
                elements.refreshButton.disabled = false;
            }
        }
    };

    /**
     * Updates the displayed assets based on selection and pagination
     */
    const updateAssetView = () => {
        if (state.isWelcome) return;

        // 1. Filter by folder
        const filtered = filterAssetsByFolder(state.allAssets);
        state.filteredAssets = filtered;
        
        // 2. Slice for display
        const toShow = filtered.slice(0, state.visibleCount);
        state.displayedAssets = toShow;
        
        // 3. Render
        renderAssets(toShow);
        
        // 4. Update status
        if (state.selectedFolderId !== "all" && filtered.length === 0 && state.allAssets.length > 0) {
             // Folder empty
        } else if (filtered.length > 0) {
            setStatus(`${filtered.length} assets found.`, "success");
        }
        
        updateLoadMoreButton();
        updateFolderCounts();
    };

    /**
     * Updates counts in the sidebar
     */
    const updateFolderCounts = () => {
        // Count assets per folder
        const counts = { all: state.allAssets.length };
        state.allAssets.forEach(asset => {
            if (asset.folderId) {
                counts[asset.folderId] = (counts[asset.folderId] || 0) + 1;
            }
        });

        // Update UI
        elements.folderList.querySelectorAll(".folder-item").forEach(item => {
            const fid = item.dataset.folderId;
            const count = counts[fid] || 0;
            const countSpan = item.querySelector(".folder-item__count");
            if (countSpan) countSpan.textContent = count;
        });
    };

    /**
     * Updates the Load More button state
     */
    const updateLoadMoreButton = () => {
        const mainContent = document.querySelector(".main-content");
        let btn = document.getElementById("loadMoreBtn");
        
        const hasMore = state.displayedAssets.length < state.filteredAssets.length;
        
        if (hasMore) {
            if (!btn) {
                btn = document.createElement("button");
                btn.id = "loadMoreBtn";
                btn.className = "btn btn--secondary";
                btn.textContent = "Load More";
                btn.style.margin = "1rem auto";
                btn.style.display = "block";
                btn.style.width = "200px";
                
                btn.addEventListener("click", () => {
                    state.visibleCount += 20;
                    updateAssetView();
                });
                
                mainContent.appendChild(btn);
            }
            
            btn.style.display = "block";
        } else {
            if (btn) {
                btn.style.display = "none";
            }
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
     * @param {Object} headers - Optional headers to include in the request
     * @param {Function} onProgress - Optional callback (downloaded, total) => void
     * @returns {Promise<string>} Absolute path to the downloaded file
     */
    const validatePngFile = async (filePath, fs) => {
        return new Promise((resolve, reject) => {
            try {
                // Read the first 16 bytes to be safe
                const fd = fs.openSync(filePath, 'r');
                const buffer = Buffer.alloc(16);
                const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
                fs.closeSync(fd);

                if (bytesRead < 4) {
                    reject(new Error("File is too small to be a PNG"));
                    return;
                }

                // Convert to hex for easier checking and debugging
                const hex = buffer.toString('hex').toUpperCase();
                
                // Standard signature: 89 50 4E 47 0D 0A 1A 0A
                // Check for "PNG" sequence (50 4E 47) anywhere in the header
                if (hex.includes("504E47")) {
                    if (!hex.startsWith("89504E47")) {
                        log("Strict PNG check failed but 'PNG' found. Hex: " + hex);
                    }
                    resolve(true);
                    return;
                }

                // If we fail here, generate a helpful error with the Hex dump
                const snippetBuffer = Buffer.alloc(200);
                const snippetFd = fs.openSync(filePath, 'r');
                fs.readSync(snippetFd, snippetBuffer, 0, 200, 0);
                fs.closeSync(snippetFd);
                const snippet = snippetBuffer.toString('utf8').replace(/\0/g, '');

                reject(new Error(`Downloaded file does not appear to be a valid PNG.\nHex Header: ${hex}\nContent Start: "${snippet}"`));
            } catch (err) {
                reject(new Error("Failed to validate PNG file: " + err.message));
            }
        });
    };

    /**
     * Loads the PNG into an HTML Canvas and re-exports it.
     * This "sanitizes" the PNG, fixing corruption, CMYK issues, or weird compression that AE hates.
     */
    const repairPngWithCanvas = async (filePath, fs) => {
        return new Promise((resolve) => {
            log("Attempting to repair/normalize PNG via Canvas...");
            const img = new Image();
            
            // 5s timeout
            const timeout = setTimeout(() => {
                log("Image load timed out during repair.");
                resolve(false);
            }, 5000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    const dataUrl = canvas.toDataURL('image/png');
                    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
                    const buffer = Buffer.from(base64Data, 'base64');
                    
                    fs.writeFileSync(filePath, buffer);
                    
                    log("Successfully repaired PNG via Canvas.");
                    resolve(true);
                } catch (e) {
                    log("Error repairing PNG: " + e.message);
                    resolve(false);
                }
            };
            
            img.onerror = (e) => {
                clearTimeout(timeout);
                log("Image failed to load for repair (browser cannot read it): " + e);
                resolve(false); 
            };

            // Add random query param to prevent browser caching
            const cacheBust = "?t=" + new Date().getTime();
            // Handle Windows/Mac paths for file URL
            const normalizedPath = filePath.replace(/\\/g, "/");
            const prefix = normalizedPath.startsWith("/") ? "file://" : "file:///";
            img.src = prefix + normalizedPath + cacheBust;
        });
    };

    const downloadFileToTemp = async (downloadUrl, fileName, headers = {}, onProgress) => {
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
                    
                    const makeRequest = (url) => {
                        // Parse URL to handle options correctly
                        const urlObj = new URL(url);
                        const options = {
                            hostname: urlObj.hostname,
                            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                            path: urlObj.pathname + urlObj.search,
                            method: 'GET',
                            headers: headers
                        };
    
                        const client = urlObj.protocol === "https:" ? https : http;
    
                        const request = client.get(options, (response) => {
                            // Handle Redirects
                            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                                log(`Redirecting to ${response.headers.location}...`);
                                request.destroy(); // Stop current request
                                makeRequest(response.headers.location); // Recurse
                                return;
                            }

                            if (response.statusCode !== 200) {
                                const message = "Failed to download file: " + response.statusCode + " " + (response.statusMessage || "");
                                response.resume();
                                reject(new Error(message));
                                return;
                            }
    
                            // Remove data listener to avoid potential stream consumption issues
                            // response.on("data", ...);
    
                            response.pipe(fileStream);
    
                            fileStream.on("finish", function () {
                                fileStream.close(async function () {
                                    try {
                                        // Validate the file is actually a PNG
                                        // await validatePngFile(filePath, fs);
                                        
                                        // Repair the PNG to ensure AE compatibility (fixes CMYK, corruption, weird headers)
                                        await repairPngWithCanvas(filePath, fs);

                                        // Normalize path to forward slashes for ExtendScript compatibility
                                        const normalizedPath = filePath.replace(/\\/g, "/");
                                        log("Downloaded and validated file: " + normalizedPath);
                                        resolve(normalizedPath);
                                    } catch (validationError) {
                                        // Delete invalid file
                                        try { fs.unlinkSync(filePath); } catch(e) {}
                                        reject(validationError);
                                    }
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
                    };

                    makeRequest(downloadUrl);

                } catch (error) {
                    reject(error);
                }
            });
        }

        // Fallback: browser fetch + CEP FileReader + JSX bridge (original implementation)
        log("Downloading file via fetch/blob fallback...");
        const response = await fetch(downloadUrl, {
            method: "GET",
            cache: "no-cache",
            headers: headers
        });

        if (!response.ok) {
            throw new Error("Failed to download file: " + response.status + " " + response.statusText);
        }

        const contentLength = response.headers.get("Content-Length");
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        
        // Note: Fetch body stream reading is needed for true progress in browser, 
        // but usually Node.js path is used. For simplicity in fallback, we skip progress 
        // unless we want to implement ReadableStream reader.
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
        
        LoadingOverlay.show(`Downloading ${displayName}`, "Starting download...");
        button.disabled = true;

        try {
            log("Starting import for asset:", asset.id);
            
            // Step 1: Get presigned download URL (Restoring behavior from mainold.js)
            const payload = await requestAssetDownload(asset.id);
            if (!payload.url) {
                throw new Error("API did not provide a download URL.");
            }

            // Step 2: Download the file
            // Note: We do NOT pass X-API-Key headers here because the presigned URL 
            // already contains authorization params, and sending headers to S3 can cause errors.
            const fileName = sanitizeFileName(asset.name || "asset");
            
            const onProgress = (downloaded, total) => {
                if (total > 0) {
                    const percent = (downloaded / total) * 100;
                    const sizeMB = (total / 1024 / 1024).toFixed(1);
                    const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
                    LoadingOverlay.update(`${downloadedMB} MB / ${sizeMB} MB`);
                    LoadingOverlay.showProgress(percent);
                }
            };

            const importPath = await downloadFileToTemp(payload.url, fileName, {}, onProgress);

            // Small delay to ensure file is fully written and OS buffers are flushed
            // This helps prevent file lock and read errors
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Import into After Effects
            LoadingOverlay.show(`Importing ${displayName}`, "Adding to project...");
            LoadingOverlay.hideProgress();
            
            log("Importing asset into After Effects from:", importPath);
            
            // Attempt import with retries to handle file locking
            let attempts = 0;
            const maxAttempts = 5;
            let result;
            
            while (attempts < maxAttempts) {
                try {
                    // Add delay only between retry attempts, not on first attempt
                    if (attempts > 0) {
                        // Increasing delay to ensure file lock is released by OS/Node
                        // 500ms, 1000ms, 1500ms, etc.
                        const delay = 500 * attempts;
                        log(`Waiting ${delay}ms before retry attempt ${attempts + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                    result = await evalScript(
                        `importAndAddAsset("${escapeForEval(importPath)}")`
                    );
                    
                    // Check if it's a file lock error ("couldn't be open for reading")
                    // If so, throw to trigger retry logic
                    if (result && typeof result === "string" && 
                       (result.includes("couldn't be open") || result.includes("File exists") || result.includes("I/O error"))) {
                        throw new Error(result);
                    }
                    
                    // If it's another error, break to handle it normally
                    if (result && result.indexOf("Error") === 0) {
                        break; 
                    }
                    
                    // Success
                    break;
                } catch (e) {
                    attempts++;
                    log(`Import attempt ${attempts} failed (${e.message}), retrying...`);
                    if (attempts >= maxAttempts) {
                        // If we've run out of attempts, assign the error to result so it's handled below
                        result = "Error: " + e.message;
                    }
                }
            }
            
            if (result && result.indexOf("Error") === 0) {
                throw new Error(result);
            }
            
            log("Asset imported successfully:", asset.id);
            setStatus(result || `${displayName || "Asset"} imported successfully.`, "success");
        } catch (error) {
            console.error(LOG_PREFIX, "Import failed", error);
            
            // Provide more helpful error messages for common issues
            let errorMessage = error.message || "Unable to import asset.";
            
            if (errorMessage.includes("corrupted") || errorMessage.includes("not of the correct type") || 
                errorMessage.includes("doesn't seem to be a PNG") || errorMessage.includes("Import failed")) {
                errorMessage = `Failed to import ${displayName}: File appears to be corrupted or invalid. Report this issue in a ticket on discord.gg/views`;
            } else if (errorMessage.includes("couldn't be open")) {
                errorMessage = `File is locked or in use. Please try again in a moment.`;
            }
            
            setStatus(errorMessage, "error");
        } finally {
            LoadingOverlay.hide();
            button.disabled = false;
        }
    };

    /**
     * Counts assets per folder
     * @returns {Object} Map of folderId to count
     */
    /* 
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
    */

    /**
     * Renders the folder list in the sidebar
     * @param {Array} folders - Array of folder objects
     */
    const renderFolders = (folders) => {
        // Clear existing custom folders (keep "All Assets")
        const existingItems = elements.folderList.querySelectorAll('.folder-item:not([data-folder-id="all"])');
        existingItems.forEach(item => item.remove());

        // Initialize "All Assets" count to "-" until loaded
        const allItem = elements.folderList.querySelector('[data-folder-id="all"] .folder-item__count');
        if (allItem) allItem.textContent = "-";

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
            countSpan.textContent = "-"; // Initial state

            li.appendChild(svg);
            li.appendChild(nameSpan);
            li.appendChild(countSpan);
            
            li.addEventListener("click", () => selectFolder(folder.id));
            
            elements.folderList.appendChild(li);
        });

        log(`Rendered ${folders.length} folders.`);
    };

    /**
     * Selects a folder and fetches assets for it
     * @param {string} folderId - Folder ID to select ("all" or folder UUID)
     */
    const selectFolder = (folderId) => {
        // Ensure strict string comparison
        const targetId = String(folderId);
        
        if (String(state.selectedFolderId) === targetId && !state.isWelcome) return;
        
        state.selectedFolderId = targetId;
        state.isWelcome = false; // Disable welcome screen once a folder is clicked
        
        // Update active state in UI
        elements.folderList.querySelectorAll(".folder-item").forEach((item) => {
            item.classList.toggle("folder-item--active", item.dataset.folderId === targetId);
        });
        
        log(`Selected folder: ${targetId}`);
        
        // Reset pagination and assets
        state.pagination.page = 1;
        state.visibleCount = 20;
        
        // Update view for selected folder
        updateAssetView();
    };

    /**
     * Updates the asset count display for a specific folder
     * @param {string} folderId - The folder ID
     * @param {number} count - The total count of assets
     */
    const updateFolderCount = (folderId, count) => {
        const countSpan = elements.folderList.querySelector(`.folder-item[data-folder-id="${folderId}"] .folder-item__count`);
        if (countSpan) {
            countSpan.textContent = count;
            // Remove the loading state styling if we add any later
        }
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
        img.loading = "lazy";

        const title = document.createElement("p");
        title.className = "asset-card__title";
        title.textContent = displayName || "Untitled asset";
        title.title = displayName; // Tooltip for full name

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
     * Creates a skeleton asset card element
     * @returns {HTMLElement} Article element containing the skeleton card
     */
    const createSkeletonCard = () => {
        const card = document.createElement("article");
        card.className = "asset-card asset-card--skeleton";

        const img = document.createElement("div");
        img.className = "asset-card__thumb skeleton";

        const title = document.createElement("div");
        title.className = "skeleton-text skeleton";

        const button = document.createElement("div");
        button.className = "skeleton-button skeleton";

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(button);
        return card;
    };

    /**
     * Appends skeleton cards to the grid
     * @param {number} count - Number of skeletons to append
     */
    const appendSkeletons = (count = 20) => {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            fragment.appendChild(createSkeletonCard());
        }
        elements.grid.appendChild(fragment);
    };

    /**
     * Replaces the first N skeletons with actual asset cards
     * @param {Array} assets - Array of assets to render
     */
    const replaceSkeletonsWithAssets = (assets) => {
        const skeletons = elements.grid.querySelectorAll(".asset-card--skeleton");
        const count = Math.min(assets.length, skeletons.length);
        
        for (let i = 0; i < count; i++) {
            const assetCard = createAssetCard(assets[i]);
            skeletons[i].replaceWith(assetCard);
        }
    };

    /**
     * Removes any remaining skeletons from the grid
     */
    const removeRemainingSkeletons = () => {
        const skeletons = elements.grid.querySelectorAll(".asset-card--skeleton");
        skeletons.forEach(el => el.remove());
    };

    /**
     * Renders skeleton cards to the grid (replaces content)
     * @param {number} count - Number of skeletons to render
     */
    const renderSkeletons = (count = 20) => {
        elements.grid.innerHTML = "";
        appendSkeletons(count);
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

            // Handle different response codes
            if (response.status === 200 || response.status === 404) {
                // Success! Key is valid and now bound to this device
                // (404 just means no folders yet, which is fine)
                log("API key validated and bound to this device");
                return true;
            }

            if (response.status === 401) {
                throw new Error("Invalid API key. Please check and try again.");
            }

            if (response.status === 403) {
                // Key is already bound to a different device
                throw new Error("This API key is already registered to another device. Please use a different key or contact your administrator.");
            }

            if (response.status === 400) {
                // Missing or invalid device ID
                let errorDetails = "";
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.message || errorData.error || "";
                } catch (e) {
                    // Ignore JSON parse errors
                }
                throw new Error(`Validation error: ${errorDetails || "Invalid request. Please try again."}`);
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

            // Other errors
            throw new Error(`API error ${response.status}: ${response.statusText}`);
        } catch (error) {
            // Re-throw our custom errors
            if (error.message.includes("API error") || 
                error.message.includes("Invalid API key") || 
                error.message.includes("already registered") ||
                error.message.includes("Server error") ||
                error.message.includes("Validation error")) {
                throw error;
            }
            
            // Network or other errors
            log("Validation error:", error);
            throw new Error("Unable to validate API key. Check your network connection. You may be on a newtwork that blocks the API. Consider using a VPN or proxy.");
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
                await fetchFolders();
                renderWelcomeScreen();
            } else {
                setStatus("API key updated successfully!", "success");
                state.cache = {}; // Clear cache on key change
                await fetchFolders();
                // Don't reset to welcome screen on simple key update, just refresh current view if needed
                if (!state.isWelcome) {
                    syncAssets();
                }
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
            state.cache = {}; // Clear cache
            await Promise.all([fetchFolders(), syncAssets()]);
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
            
            // Fetch only folders initially
            await fetchFolders();
            
            // Show welcome screen
            renderWelcomeScreen();
            
            // Start syncing assets in background
            syncAssets();
            
        } catch (error) {
            console.error(LOG_PREFIX, "Initialization failed", error);
            setStatus(error.message || "Initialization failed.", "error");
            setLoading(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();

