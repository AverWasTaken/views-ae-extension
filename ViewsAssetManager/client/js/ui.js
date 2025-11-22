"use strict";

/**
 * Views Asset Manager - UI
 * DOM manipulation and rendering logic.
 */
(function(global) {
    global.Views = global.Views || {};
    
    const Utils = global.Views.Utils;
    const log = Utils ? Utils.log : console.log;

    const PLACEHOLDER_THUMB =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%232a2a2a'/%3E%3Cpath d='M40 140l40-50 35 35 25-30 20 45H40z' fill='%233a3a3a'/%3E%3C/svg%3E";

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
                Utils.csInterface.openURLInDefaultBrowser("https://discord.gg/views");
            });
        }

        setStatus("Ready.", "info");
    };

    /**
     * Renders the folder list in the sidebar
     * @param {Array} folders - Array of folder objects
     * @param {Function} onFolderSelect - Callback when a folder is clicked
     */
    const renderFolders = (folders, onFolderSelect) => {
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
            
            li.addEventListener("click", () => onFolderSelect(folder.id));
            
            elements.folderList.appendChild(li);
        });

        log(`Rendered ${folders.length} folders.`);
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
        }
    };

    /**
     * Creates an asset card element for the grid
     * @param {Object} asset - Asset data from API (id, name, size, thumbnail, uploadDate)
     * @param {Function} onImport - Callback for import button
     * @returns {HTMLElement} Article element containing the asset card
     */
    const createAssetCard = (asset, onImport) => {
        const card = document.createElement("article");
        card.className = "asset-card";
        const displayName = Utils.getDisplayName(asset.name || asset.id);

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
        button.addEventListener("click", () => onImport(asset, button));

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(button);
        return card;
    };

    /**
     * Renders assets to the grid
     * @param {Array} assets - Array of asset objects to render
     * @param {string} selectedFolderId - ID of the current folder
     * @param {Function} onImport - Callback for import
     */
    const renderAssets = (assets, selectedFolderId, onImport) => {
        elements.grid.innerHTML = "";

        if (!assets.length) {
            const empty = document.createElement("p");
            empty.className = "asset-grid__empty";
            empty.textContent = selectedFolderId === "all" 
                ? "No assets available." 
                : "No assets in this folder.";
            elements.grid.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        assets.forEach((asset) => {
            fragment.appendChild(createAssetCard(asset, onImport));
        });
        elements.grid.appendChild(fragment);
        log(`Rendered ${assets.length} assets.`);
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
     * Toggles API key visibility in the input field
     */
    const toggleApiKeyVisibility = () => {
        const isPassword = elements.apiKeyInput.type === "password";
        elements.apiKeyInput.type = isPassword ? "text" : "password";
        elements.showKeyIcon.classList.toggle("hidden", isPassword);
        elements.hideKeyIcon.classList.toggle("hidden", !isPassword);
    };
    
    /**
     * Updates the Load More button state
     */
    const updateLoadMoreButton = (hasMore, onClick) => {
        const mainContent = document.querySelector(".main-content");
        let btn = document.getElementById("loadMoreBtn");
        
        if (hasMore) {
            if (!btn) {
                btn = document.createElement("button");
                btn.id = "loadMoreBtn";
                btn.className = "btn btn--secondary";
                btn.textContent = "Load More";
                btn.style.margin = "1rem auto";
                btn.style.display = "block";
                btn.style.width = "200px";
                
                btn.addEventListener("click", onClick);
                
                mainContent.appendChild(btn);
            } else {
                // Clone and replace to remove old event listeners if they stack up
                // Or better: just ensure we don't attach multiple listeners or handle it in main
                // For now, simple display toggle is safer if listener is stable.
                // But the callback might change if state changes? No, onClick usually refers to a stable function in main.
            }
            
            btn.style.display = "block";
        } else {
            if (btn) {
                btn.style.display = "none";
            }
        }
    };
    
    // Expose methods
    global.Views.UI = {
        elements,
        LoadingOverlay,
        setStatus,
        setLoading,
        renderWelcomeScreen,
        renderFolders,
        updateFolderCount,
        renderAssets,
        renderSkeletons,
        showApiKeyModal,
        hideApiKeyModal,
        showApiKeyError,
        toggleApiKeyVisibility,
        updateLoadMoreButton
    };

})(window);

