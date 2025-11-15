"use strict";

(function () {
    const API_BASE_URL = "https://api.viewseditors.com/";
    const API_KEY = window.VIEWS_ASSET_MANAGER_API_KEY || "";
    const LOG_PREFIX = "[ViewsAssetManager]";
    const PLACEHOLDER_THUMB =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%232a2a2a'/%3E%3Cpath d='M40 140l40-50 35 35 25-30 20 45H40z' fill='%233a3a3a'/%3E%3C/svg%3E";
    const csInterface = new CSInterface();
    const log = (...messages) => console.log(LOG_PREFIX, ...messages);

    const elements = {
        grid: document.getElementById("assetGrid"),
        spinner: document.getElementById("spinner"),
        status: document.getElementById("statusArea"),
        refreshButton: document.getElementById("refreshButton")
    };

    const state = {
        assets: []
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

    const ensureApiKey = () => {
        if (!API_KEY) {
            const warning = "Missing API key. Set window.VIEWS_ASSET_MANAGER_API_KEY.";
            console.error(`[ViewsAssetManager] ${warning}`);
            throw new Error(warning);
        }
    };

    const fetchJson = async (path) => {
        ensureApiKey();
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: "GET",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-API-Key": API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`API error ${response.status}: ${response.statusText}`);
        }
        return response.json();
    };

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

    const requestAssetDownload = async (assetId) => {
        if (!assetId) {
            throw new Error("Asset id missing.");
        }
        return fetchJson(`/assets/${assetId}/download`);
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
            let importPath = payload.filePath || payload.path;
            const base64Blob = payload.base64Data || payload.base64 || payload.data;

            if (!importPath && base64Blob) {
                const fileName =
                    payload.fileName ||
                    `${sanitizeFileName(asset.name || "asset")}-${asset.id || Date.now()}.png`;
                const path = await evalScript(
                    `saveToTemp("${escapeForEval(base64Blob)}","${escapeForEval(fileName)}")`
                );
                importPath = path;
            }

            if (!importPath) {
                throw new Error("API did not provide a file path.");
            }

            const result = await evalScript(
                `importAndAddAsset("${escapeForEval(importPath)}")`
            );
            log("Asset imported", asset.id);
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

    const createAssetCard = (asset) => {
        const card = document.createElement("article");
        card.className = "asset-card";

        const img = document.createElement("img");
        img.className = "asset-card__thumb";
        img.alt = asset.name || "Asset thumbnail";
        img.src = asset.thumbnailUrl || asset.previewUrl || asset.thumbnail || PLACEHOLDER_THUMB;

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

    const bindEvents = () => {
        elements.refreshButton.addEventListener("click", () => {
            log("Manual refresh requested.");
            fetchAssets();
        });
    };

    const init = async () => {
        bindEvents();
        try {
            log("Initializing panel UI.");
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

