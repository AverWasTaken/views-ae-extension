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
        searchInput: document.getElementById("searchInput"),
        clearSearchBtn: document.getElementById("clearSearchBtn"),
        searchStats: document.getElementById("searchStats"),
        // Breadcrumb navigation
        breadcrumbNav: document.getElementById("breadcrumbNav"),
        breadcrumbList: document.getElementById("breadcrumbList"),
        // Preview modal
        previewModal: document.getElementById("previewModal"),
        previewTitle: document.getElementById("previewTitle"),
        previewImage: document.getElementById("previewImage"),
        closePreviewBtn: document.getElementById("closePreviewBtn"),
        previewImportBtn: document.getElementById("previewImportBtn"),
        previewPrevBtn: document.getElementById("previewPrevBtn"),
        previewNextBtn: document.getElementById("previewNextBtn"),
        // Grid size buttons
        gridSmall: document.getElementById("gridSmall"),
        gridMedium: document.getElementById("gridMedium"),
        gridLarge: document.getElementById("gridLarge"),
        // Selection bar
        selectionBar: document.getElementById("selectionBar"),
        selectionCount: document.getElementById("selectionCount"),
        clearSelectionBtn: document.getElementById("clearSelectionBtn"),
        importSelectedBtn: document.getElementById("importSelectedBtn"),
        // Feedback modal
        feedbackButton: document.getElementById("feedbackButton"),
        feedbackModal: document.getElementById("feedbackModal"),
        feedbackForm: document.getElementById("feedbackForm"),
        feedbackType: document.getElementById("feedbackType"),
        feedbackMessage: document.getElementById("feedbackMessage"),
        feedbackDiscord: document.getElementById("feedbackDiscord"),
        feedbackError: document.getElementById("feedbackError"),
        feedbackSuccess: document.getElementById("feedbackSuccess"),
        cancelFeedbackButton: document.getElementById("cancelFeedbackButton"),
        submitFeedbackButton: document.getElementById("submitFeedbackButton"),
        // API Key modal
        apiKeyModal: document.getElementById("apiKeyModal"),
        apiKeyForm: document.getElementById("apiKeyForm"),
        apiKeyInput: document.getElementById("apiKeyInput"),
        apiKeyError: document.getElementById("apiKeyError"),
        saveApiKeyButton: document.getElementById("saveApiKeyButton"),
        cancelApiKeyButton: document.getElementById("cancelApiKeyButton"),
        toggleApiKeyVisibility: document.getElementById("toggleApiKeyVisibility"),
        showKeyIcon: document.getElementById("showKeyIcon"),
        hideKeyIcon: document.getElementById("hideKeyIcon"),
        // Update modal
        updateModal: document.getElementById("updateModal"),
        updateButton: document.getElementById("updateButton"),
        currentVersion: document.getElementById("currentVersion"),
        newVersion: document.getElementById("newVersion"),
        // Version badge
        versionBadge: document.getElementById("versionBadge"),
        // Sidebar
        folderSidebar: document.getElementById("folderSidebar"),
        sidebarToggle: document.getElementById("sidebarToggle"),
        // Context menu
        contextMenu: document.getElementById("contextMenu"),
        contextMenuFavoriteText: document.getElementById("contextMenuFavoriteText")
    };

    /** Current context menu target asset */
    let contextMenuAsset = null;

    /** Callbacks for context menu actions */
    let contextMenuCallbacks = {};

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

    /** Timer for auto-hiding status messages */
    let statusHideTimer = null;

    /** How long to show status messages before auto-hiding (5 seconds) */
    const STATUS_AUTO_HIDE_MS = 5000;

    /**
     * Sets the status message with optional auto-hide
     * @param {string} message - Status message to display
     * @param {string} tone - Tone of the message (info, success, error)
     * @param {boolean} autoHide - Whether to auto-hide after timeout (default: true)
     */
    const setStatus = (message = "", tone = "info", autoHide = true) => {
        // Clear any existing timer
        if (statusHideTimer) {
            clearTimeout(statusHideTimer);
            statusHideTimer = null;
        }

        if (!message) {
            elements.status.textContent = "";
            elements.status.className = "status status--hidden";
            return;
        }

        elements.status.textContent = message;
        elements.status.className = `status status--${tone}`;

        // Auto-hide after 5 seconds (except for persistent messages)
        if (autoHide) {
            statusHideTimer = setTimeout(() => {
                elements.status.className = "status status--hidden";
                statusHideTimer = null;
            }, STATUS_AUTO_HIDE_MS);
        }
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
    };

    /**
     * Builds a tree structure from flat folder list
     * @param {Array} folders - Flat array of folder objects with parentId
     * @returns {Object} Object with rootFolders array and childrenMap
     */
    const buildFolderTree = (folders) => {
        const childrenMap = {};
        const rootFolders = [];
        
        // Initialize children arrays
        folders.forEach(folder => {
            childrenMap[folder.id] = [];
        });
        
        // Populate children and identify roots
        folders.forEach(folder => {
            if (folder.parentId && childrenMap[folder.parentId]) {
                childrenMap[folder.parentId].push(folder);
            } else {
                rootFolders.push(folder);
            }
        });
        
        return { rootFolders, childrenMap };
    };

    /**
     * Creates a folder item element
     * @param {Object} folder - Folder object
     * @param {number} depth - Nesting depth
     * @param {boolean} hasChildren - Whether folder has children
     * @param {Function} onFolderSelect - Callback when folder is clicked
     * @param {Function} onToggleExpand - Callback when expand toggle is clicked
     * @returns {HTMLElement} The folder list item
     */
    const createFolderItem = (folder, depth, hasChildren, onFolderSelect, onToggleExpand) => {
        const li = document.createElement("li");
        li.className = "folder-item";
        li.dataset.folderId = folder.id;
        if (folder.parentId) {
            li.dataset.parentId = folder.parentId;
        }
        li.style.paddingLeft = `${8 + (depth * 16)}px`;
        
        // Expand/collapse toggle (only if has children)
        if (hasChildren) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "folder-item__toggle";
            toggle.title = "Expand/Collapse";
            toggle.innerHTML = `
                <svg class="folder-item__toggle-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M3 2l4 3-4 3V2z"/>
                </svg>
            `;
            toggle.addEventListener("click", (e) => {
                e.stopPropagation();
                onToggleExpand(folder.id, li);
            });
            li.appendChild(toggle);
        } else {
            // Spacer for alignment when no toggle
            const spacer = document.createElement("span");
            spacer.className = "folder-item__toggle-spacer";
            li.appendChild(spacer);
        }
        
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
        countSpan.textContent = "-";

        li.appendChild(svg);
        li.appendChild(nameSpan);
        li.appendChild(countSpan);
        
        li.addEventListener("click", (e) => {
            if (!e.target.closest(".folder-item__toggle")) {
                onFolderSelect(folder.id);
            }
        });
        
        return li;
    };

    /**
     * Renders the folder list in the sidebar with hierarchy support
     * @param {Array} folders - Array of folder objects
     * @param {Function} onFolderSelect - Callback when a folder is clicked
     */
    const renderFolders = (folders, onFolderSelect) => {
        // Clear existing custom folders (keep "All Assets" and "Favorites")
        const existingItems = elements.folderList.querySelectorAll('.folder-item:not([data-folder-id="all"]):not([data-folder-id="favorites"])');
        existingItems.forEach(item => item.remove());

        // Initialize counts to "-" until loaded
        const allItem = elements.folderList.querySelector('[data-folder-id="all"] .folder-item__count');
        if (allItem) allItem.textContent = "-";
        
        const favItem = elements.folderList.querySelector('[data-folder-id="favorites"] .folder-item__count');
        if (favItem) favItem.textContent = "-";

        // Build tree structure
        const { rootFolders, childrenMap } = buildFolderTree(folders);
        
        // Track expanded state
        const expandedFolders = new Set();
        
        /**
         * Toggles folder expansion
         * @param {string} folderId - Folder ID to toggle
         * @param {HTMLElement} folderElement - The folder list item
         */
        const toggleExpand = (folderId, folderElement) => {
            const isExpanded = expandedFolders.has(folderId);
            
            if (isExpanded) {
                expandedFolders.delete(folderId);
                folderElement.classList.remove("folder-item--expanded");
                // Hide all descendants
                const descendants = elements.folderList.querySelectorAll(`[data-parent-id="${folderId}"]`);
                descendants.forEach(desc => {
                    desc.classList.add("folder-item--hidden");
                    // Also collapse and hide their children recursively
                    const descId = desc.dataset.folderId;
                    expandedFolders.delete(descId);
                    desc.classList.remove("folder-item--expanded");
                    hideDescendants(descId);
                });
            } else {
                expandedFolders.add(folderId);
                folderElement.classList.add("folder-item--expanded");
                // Show direct children only
                const children = elements.folderList.querySelectorAll(`[data-parent-id="${folderId}"]`);
                children.forEach(child => {
                    child.classList.remove("folder-item--hidden");
                });
            }
        };
        
        /**
         * Recursively hides all descendants of a folder
         * @param {string} folderId - Parent folder ID
         */
        const hideDescendants = (folderId) => {
            const children = elements.folderList.querySelectorAll(`[data-parent-id="${folderId}"]`);
            children.forEach(child => {
                child.classList.add("folder-item--hidden");
                hideDescendants(child.dataset.folderId);
            });
        };
        
        /**
         * Recursively renders folders
         * @param {Array} folderList - Folders to render
         * @param {number} depth - Current depth level
         */
        const renderFolderLevel = (folderList, depth) => {
            folderList.forEach(folder => {
                const children = childrenMap[folder.id] || [];
                const hasChildren = children.length > 0;
                
                const li = createFolderItem(folder, depth, hasChildren, onFolderSelect, toggleExpand);
                
                // Hide if not at root level (will be shown when parent expands)
                if (depth > 0) {
                    li.classList.add("folder-item--hidden");
                }
                
                elements.folderList.appendChild(li);
                
                // Recursively render children
                if (hasChildren) {
                    renderFolderLevel(children, depth + 1);
                }
            });
        };
        
        // Render the tree starting from root folders
        renderFolderLevel(rootFolders, 0);

        log(`Rendered ${folders.length} folders (hierarchical).`);
    };

    /**
     * Renders breadcrumb navigation
     * @param {Array} path - Array of folder objects from root to current
     * @param {Function} onNavigate - Callback when breadcrumb is clicked
     */
    const renderBreadcrumbs = (path, onNavigate) => {
        if (!elements.breadcrumbNav || !elements.breadcrumbList) return;
        
        elements.breadcrumbList.innerHTML = "";
        
        // Always show root/home
        const homeLi = document.createElement("li");
        homeLi.className = "breadcrumb-item";
        const homeBtn = document.createElement("button");
        homeBtn.type = "button";
        homeBtn.className = "breadcrumb-link";
        homeBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
        `;
        homeBtn.title = "All Assets";
        homeBtn.addEventListener("click", () => onNavigate("all"));
        homeLi.appendChild(homeBtn);
        elements.breadcrumbList.appendChild(homeLi);
        
        // Add separator and path items
        path.forEach((folder, index) => {
            // Separator
            const sepLi = document.createElement("li");
            sepLi.className = "breadcrumb-separator";
            sepLi.setAttribute("aria-hidden", "true");
            sepLi.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            `;
            elements.breadcrumbList.appendChild(sepLi);
            
            // Folder item
            const li = document.createElement("li");
            li.className = "breadcrumb-item";
            
            const isLast = index === path.length - 1;
            if (isLast) {
                // Current folder - not clickable
                const span = document.createElement("span");
                span.className = "breadcrumb-current";
                span.textContent = folder.name;
                li.appendChild(span);
            } else {
                // Clickable parent
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "breadcrumb-link";
                btn.textContent = folder.name;
                btn.addEventListener("click", () => onNavigate(folder.id));
                li.appendChild(btn);
            }
            
            elements.breadcrumbList.appendChild(li);
        });
        
        // Show/hide breadcrumb nav based on path
        if (path.length > 0) {
            elements.breadcrumbNav.classList.remove("breadcrumb-nav--hidden");
        } else {
            elements.breadcrumbNav.classList.add("breadcrumb-nav--hidden");
        }
    };

    /**
     * Hides the breadcrumb navigation
     */
    const hideBreadcrumbs = () => {
        if (elements.breadcrumbNav) {
            elements.breadcrumbNav.classList.add("breadcrumb-nav--hidden");
        }
    };

    /**
     * Expands folder tree to show a specific folder
     * @param {string} folderId - The folder ID to reveal
     * @param {Array} pathIds - Array of ancestor folder IDs
     */
    const expandToFolder = (folderId, pathIds) => {
        // Expand all ancestors
        pathIds.forEach(ancestorId => {
            const folderEl = elements.folderList.querySelector(`[data-folder-id="${ancestorId}"]`);
            if (folderEl) {
                folderEl.classList.add("folder-item--expanded");
                folderEl.classList.remove("folder-item--hidden");
                // Show children
                const children = elements.folderList.querySelectorAll(`[data-parent-id="${ancestorId}"]`);
                children.forEach(child => child.classList.remove("folder-item--hidden"));
            }
        });
        
        // Make sure the target folder is visible
        const targetEl = elements.folderList.querySelector(`[data-folder-id="${folderId}"]`);
        if (targetEl) {
            targetEl.classList.remove("folder-item--hidden");
        }
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
     * @param {Object} callbacks - Callbacks object with onImport, onPreview, onSelect, onFavorite
     * @returns {HTMLElement} Article element containing the asset card
     */
    const createAssetCard = (asset, callbacks) => {
        const { onImport, onPreview, onSelect, onFavorite, isSelected } = callbacks;
        const Preferences = global.Views.Preferences;
        
        const card = document.createElement("article");
        card.className = "asset-card" + (isSelected ? " asset-card--selected" : "");
        card.dataset.assetId = asset.id;
        const displayName = Utils.getDisplayName(asset.name || asset.id);

        // Selection checkbox
        const checkbox = document.createElement("div");
        checkbox.className = "asset-card__select";
        checkbox.title = "Select for batch import";
        const checkIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        checkIcon.setAttribute("width", "12");
        checkIcon.setAttribute("height", "12");
        checkIcon.setAttribute("viewBox", "0 0 16 16");
        checkIcon.setAttribute("fill", "currentColor");
        const checkPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        checkPath.setAttribute("d", "M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z");
        checkIcon.appendChild(checkPath);
        checkbox.appendChild(checkIcon);
        checkbox.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onSelect) onSelect(asset, card);
        });

        // Favorite button
        const isFavorited = Preferences && Preferences.isFavorite(asset.id);
        const favoriteBtn = document.createElement("button");
        favoriteBtn.type = "button";
        favoriteBtn.className = "asset-card__favorite" + (isFavorited ? " asset-card__favorite--active" : "");
        favoriteBtn.title = isFavorited ? "Remove from favorites" : "Add to favorites";
        const starIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        starIcon.setAttribute("width", "14");
        starIcon.setAttribute("height", "14");
        starIcon.setAttribute("viewBox", "0 0 24 24");
        starIcon.setAttribute("fill", isFavorited ? "currentColor" : "none");
        starIcon.setAttribute("stroke", "currentColor");
        starIcon.setAttribute("stroke-width", "2");
        const starPath = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        starPath.setAttribute("points", "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2");
        starIcon.appendChild(starPath);
        favoriteBtn.appendChild(starIcon);
        favoriteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (Preferences) {
                const nowFavorited = Preferences.toggleFavorite(asset.id);
                favoriteBtn.classList.toggle("asset-card__favorite--active", nowFavorited);
                favoriteBtn.title = nowFavorited ? "Remove from favorites" : "Add to favorites";
                starIcon.setAttribute("fill", nowFavorited ? "currentColor" : "none");
                if (onFavorite) onFavorite(asset, nowFavorited);
            }
        });

        const img = document.createElement("img");
        img.className = "asset-card__thumb";
        img.alt = displayName || "Asset thumbnail";
        img.src = asset.thumbnail || PLACEHOLDER_THUMB;
        img.loading = "lazy";
        // Click on image opens preview, double-click imports
        img.style.cursor = "pointer";
        img.addEventListener("click", () => {
            if (onPreview) onPreview(asset);
        });
        img.addEventListener("dblclick", (e) => {
            e.preventDefault();
            // Find the import button and trigger import
            const importBtnEl = card.querySelector(".asset-card__cta:not(.asset-card__cta--preview)");
            if (onImport && importBtnEl) onImport(asset, importBtnEl);
        });

        const title = document.createElement("p");
        title.className = "asset-card__title";
        title.textContent = displayName || "Untitled asset";
        title.title = displayName;

        // Actions container
        const actions = document.createElement("div");
        actions.className = "asset-card__actions";

        // Preview button
        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "asset-card__cta asset-card__cta--preview";
        previewBtn.title = "Preview";
        const eyeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        eyeIcon.setAttribute("width", "14");
        eyeIcon.setAttribute("height", "14");
        eyeIcon.setAttribute("viewBox", "0 0 16 16");
        eyeIcon.setAttribute("fill", "currentColor");
        const eyePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        eyePath.setAttribute("d", "M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z");
        const eyePath2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        eyePath2.setAttribute("d", "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z");
        eyeIcon.appendChild(eyePath);
        eyeIcon.appendChild(eyePath2);
        previewBtn.appendChild(eyeIcon);
        previewBtn.addEventListener("click", () => {
            if (onPreview) onPreview(asset);
        });

        // Import button
        const importBtn = document.createElement("button");
        importBtn.type = "button";
        importBtn.className = "asset-card__cta";
        importBtn.textContent = "Import";
        importBtn.addEventListener("click", () => {
            if (onImport) onImport(asset, importBtn);
        });

        actions.appendChild(previewBtn);
        actions.appendChild(importBtn);

        // Context menu
        card.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, asset, callbacks);
        });

        card.appendChild(checkbox);
        card.appendChild(favoriteBtn);
        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(actions);
        return card;
    };

    /**
     * Renders assets to the grid
     * @param {Array} assets - Array of asset objects to render
     * @param {string} selectedFolderId - ID of the current folder
     * @param {Object} callbacks - Callbacks object with onImport, onPreview, onSelect, getSelectedIds
     * @param {string} [searchQuery] - Optional search query for empty state message
     */
    const renderAssets = (assets, selectedFolderId, callbacks, searchQuery = "") => {
        elements.grid.innerHTML = "";

        if (!assets.length) {
            const empty = document.createElement("div");
            empty.className = "asset-grid__empty";
            
            // Add icon
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("class", "asset-grid__empty-icon");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("fill", "currentColor");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            
            if (searchQuery) {
                // Search icon for no results
                path.setAttribute("d", "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z");
            } else {
                // Folder icon for empty folder
                path.setAttribute("d", "M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z");
            }
            icon.appendChild(path);
            empty.appendChild(icon);
            
            const text = document.createElement("p");
            if (searchQuery) {
                text.textContent = `No assets found for "${searchQuery}"`;
            } else if (selectedFolderId === "all") {
                text.textContent = "No assets available.";
            } else {
                text.textContent = "No assets in this folder.";
            }
            text.style.margin = "0";
            empty.appendChild(text);
            
            if (searchQuery) {
                const hint = document.createElement("p");
                hint.textContent = "Try a different search term";
                hint.style.margin = "4px 0 0 0";
                hint.style.fontSize = "12px";
                hint.style.opacity = "0.7";
                empty.appendChild(hint);
            }
            
            elements.grid.appendChild(empty);
            return;
        }

        const selectedIds = callbacks.getSelectedIds ? callbacks.getSelectedIds() : [];
        const fragment = document.createDocumentFragment();
        assets.forEach((asset, index) => {
            const isSelected = selectedIds.includes(asset.id);
            const card = createAssetCard(asset, { ...callbacks, isSelected });
            // Staggered animation delay (capped at 500ms max total)
            const delay = Math.min(index * 30, 500);
            card.style.animationDelay = `${delay}ms`;
            fragment.appendChild(card);
        });
        elements.grid.appendChild(fragment);
        log(`Rendered ${assets.length} assets.`);
    };

    /**
     * Appends additional assets to the grid (for infinite scroll)
     * Does not clear existing content, just adds new items
     * @param {Array} assets - Array of NEW asset objects to append
     * @param {Object} callbacks - Callbacks object
     * @param {number} startIndex - Starting index for animation delay
     */
    const appendAssets = (assets, callbacks, startIndex = 0) => {
        if (!assets.length) return;

        const selectedIds = callbacks.getSelectedIds ? callbacks.getSelectedIds() : [];
        const fragment = document.createDocumentFragment();
        
        assets.forEach((asset, index) => {
            const isSelected = selectedIds.includes(asset.id);
            const card = createAssetCard(asset, { ...callbacks, isSelected });
            // Minimal staggered animation for smoother feel
            const delay = Math.min(index * 20, 200);
            card.style.animationDelay = `${delay}ms`;
            fragment.appendChild(card);
        });
        
        // Remove the scroll sentinel before appending
        const sentinel = document.getElementById("scrollSentinel");
        if (sentinel) {
            sentinel.remove();
        }
        
        elements.grid.appendChild(fragment);
        
        // Re-add sentinel after new content
        if (sentinel) {
            elements.grid.appendChild(sentinel);
        }
        
        log(`Appended ${assets.length} more assets.`);
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
            }
            
            btn.style.display = "block";
        } else {
            if (btn) {
                btn.style.display = "none";
            }
        }
    };

    /**
     * Updates the search statistics display
     * @param {number} shown - Number of assets currently shown
     * @param {number} total - Total number of assets matching search
     * @param {string} query - The search query (empty if no search)
     */
    const updateSearchStats = (shown, total, query = "") => {
        if (!elements.searchStats) return;
        
        if (!query) {
            elements.searchStats.textContent = total > 0 ? `${total} assets available` : "";
            elements.searchStats.classList.remove("search-stats--active");
            return;
        }
        
        elements.searchStats.classList.add("search-stats--active");
        if (total === 0) {
            elements.searchStats.textContent = `No results for "${query}"`;
        } else {
            elements.searchStats.textContent = `Showing ${shown} of ${total} results for "${query}"`;
        }
    };

    /**
     * Clears the search input
     */
    const clearSearch = () => {
        if (elements.searchInput) {
            elements.searchInput.value = "";
        }
        if (elements.clearSearchBtn) {
            elements.clearSearchBtn.classList.add("hidden");
        }
        updateSearchStats(0, 0, "");
    };

    /**
     * Gets the current search query
     * @returns {string} The search query
     */
    const getSearchQuery = () => {
        return elements.searchInput ? elements.searchInput.value.trim().toLowerCase() : "";
    };

    /**
     * Updates the clear button visibility based on input value
     */
    const updateClearButtonVisibility = () => {
        if (!elements.clearSearchBtn || !elements.searchInput) return;
        const hasValue = elements.searchInput.value.trim().length > 0;
        elements.clearSearchBtn.classList.toggle("hidden", !hasValue);
    };

    /**
     * Shows the preview modal with an asset
     * @param {Object} asset - The asset to preview
     */
    const showPreview = (asset) => {
        if (!elements.previewModal) return;
        
        const displayName = Utils.getDisplayName(asset.name || asset.id);
        elements.previewTitle.textContent = displayName || "Asset Preview";
        elements.previewImage.src = asset.thumbnail || PLACEHOLDER_THUMB;
        elements.previewImage.alt = displayName || "Asset preview";
        elements.previewModal.classList.remove("modal--hidden");
        
        // Store asset reference for import button
        elements.previewModal.dataset.assetId = asset.id;
        
        log(`Showing preview for: ${displayName}`);
    };

    /**
     * Hides the preview modal
     */
    const hidePreview = () => {
        if (!elements.previewModal) return;
        elements.previewModal.classList.add("modal--hidden");
        elements.previewImage.src = "";
        delete elements.previewModal.dataset.assetId;
    };

    /**
     * Updates the selection bar visibility and count
     * @param {number} count - Number of selected items
     */
    const updateSelectionBar = (count) => {
        if (!elements.selectionBar) return;
        
        if (count > 0) {
            elements.selectionBar.classList.remove("selection-bar--hidden");
            elements.selectionCount.textContent = count;
        } else {
            elements.selectionBar.classList.add("selection-bar--hidden");
        }
    };

    /**
     * Toggles selection state on a card element
     * @param {string} assetId - The asset ID
     * @param {boolean} isSelected - Whether the asset is selected
     */
    const toggleCardSelection = (assetId, isSelected) => {
        const card = elements.grid.querySelector(`.asset-card[data-asset-id="${assetId}"]`);
        if (card) {
            card.classList.toggle("asset-card--selected", isSelected);
        }
    };

    /**
     * Sets the grid size and persists preference
     * @param {string} size - "small", "medium", or "large"
     * @param {boolean} persist - Whether to save to preferences (default: true)
     */
    const setGridSize = (size, persist = true) => {
        // Remove existing size classes
        elements.grid.classList.remove("asset-grid--small", "asset-grid--medium", "asset-grid--large");
        // Add new size class
        elements.grid.classList.add(`asset-grid--${size}`);
        
        // Update button states
        [elements.gridSmall, elements.gridMedium, elements.gridLarge].forEach(btn => {
            if (btn) {
                btn.classList.toggle("grid-size-btn--active", btn.dataset.size === size);
            }
        });
        
        // Persist preference
        if (persist && global.Views.Preferences) {
            global.Views.Preferences.setGridSize(size);
        }
        
        log(`Grid size set to: ${size}`);
    };

    /**
     * Loads and applies saved grid size preference
     */
    const loadGridSizePreference = () => {
        if (global.Views.Preferences) {
            const savedSize = global.Views.Preferences.getGridSize();
            if (savedSize) {
                setGridSize(savedSize, false);
            }
        }
    };

    /**
     * Toggles the sidebar collapsed state
     * @param {boolean} [forceState] - Force collapsed state (optional)
     */
    const toggleSidebar = (forceState) => {
        if (!elements.folderSidebar) return;
        
        const isCollapsed = forceState !== undefined 
            ? forceState 
            : !elements.folderSidebar.classList.contains("folder-sidebar--collapsed");
        
        elements.folderSidebar.classList.toggle("folder-sidebar--collapsed", isCollapsed);
        
        // Update toggle button title
        if (elements.sidebarToggle) {
            elements.sidebarToggle.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
        }
        
        // Persist preference
        if (global.Views.Preferences) {
            global.Views.Preferences.setSidebarCollapsed(isCollapsed);
        }
        
        log(`Sidebar ${isCollapsed ? "collapsed" : "expanded"}`);
    };

    /**
     * Loads and applies saved sidebar state
     */
    const loadSidebarPreference = () => {
        if (global.Views.Preferences && elements.folderSidebar) {
            const isCollapsed = global.Views.Preferences.getSidebarCollapsed();
            if (isCollapsed) {
                toggleSidebar(true);
            }
        }
    };

    /**
     * Shows the context menu at the specified position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} asset - The asset for context actions
     * @param {Object} callbacks - Callbacks for menu actions
     */
    const showContextMenu = (x, y, asset, callbacks) => {
        if (!elements.contextMenu) return;
        
        contextMenuAsset = asset;
        contextMenuCallbacks = callbacks;
        
        // Update favorite text based on current state
        const isFav = global.Views.Preferences && global.Views.Preferences.isFavorite(asset.id);
        if (elements.contextMenuFavoriteText) {
            elements.contextMenuFavoriteText.textContent = isFav ? "Remove from Favorites" : "Add to Favorites";
        }
        
        // Position the menu
        elements.contextMenu.style.display = "block";
        
        // Adjust position if menu would go off screen
        const menuRect = elements.contextMenu.getBoundingClientRect();
        const adjustedX = Math.min(x, window.innerWidth - menuRect.width - 10);
        const adjustedY = Math.min(y, window.innerHeight - menuRect.height - 10);
        
        elements.contextMenu.style.left = `${adjustedX}px`;
        elements.contextMenu.style.top = `${adjustedY}px`;
    };

    /**
     * Hides the context menu
     */
    const hideContextMenu = () => {
        if (elements.contextMenu) {
            elements.contextMenu.style.display = "none";
        }
        contextMenuAsset = null;
    };

    /**
     * Gets the current context menu asset
     * @returns {Object|null} The asset or null
     */
    const getContextMenuAsset = () => contextMenuAsset;

    /**
     * Gets the context menu callbacks
     * @returns {Object} The callbacks
     */
    const getContextMenuCallbacks = () => contextMenuCallbacks;

    /**
     * Updates the preview navigation buttons state
     * @param {boolean} hasPrev - Whether there's a previous asset
     * @param {boolean} hasNext - Whether there's a next asset
     */
    const updatePreviewNav = (hasPrev, hasNext) => {
        if (elements.previewPrevBtn) {
            elements.previewPrevBtn.disabled = !hasPrev;
        }
        if (elements.previewNextBtn) {
            elements.previewNextBtn.disabled = !hasNext;
        }
    };

    /**
     * Checks if the preview modal is open
     * @returns {boolean} True if preview is open
     */
    const isPreviewOpen = () => {
        return elements.previewModal && !elements.previewModal.classList.contains("modal--hidden");
    };

    /**
     * Shows the feedback button (when authenticated)
     */
    const showFeedbackButton = () => {
        if (elements.feedbackButton) {
            elements.feedbackButton.classList.remove("hidden");
        }
    };

    /**
     * Shows the feedback modal
     */
    const showFeedbackModal = () => {
        if (!elements.feedbackModal) return;
        elements.feedbackModal.classList.remove("modal--hidden");
        elements.feedbackMessage.value = "";
        elements.feedbackDiscord.value = "";
        elements.feedbackType.value = "bug";
        elements.feedbackError.classList.add("form-error--hidden");
        elements.feedbackSuccess.classList.add("form-success--hidden");
        elements.feedbackMessage.focus();
        log("Showing feedback modal");
    };

    /**
     * Hides the feedback modal
     */
    const hideFeedbackModal = () => {
        if (!elements.feedbackModal) return;
        elements.feedbackModal.classList.add("modal--hidden");
        elements.feedbackMessage.value = "";
        elements.feedbackDiscord.value = "";
        elements.feedbackError.classList.add("form-error--hidden");
        elements.feedbackSuccess.classList.add("form-success--hidden");
    };

    /**
     * Shows an error in the feedback form
     * @param {string} message - Error message to display
     */
    const showFeedbackError = (message) => {
        elements.feedbackError.textContent = message;
        elements.feedbackError.classList.remove("form-error--hidden");
        elements.feedbackSuccess.classList.add("form-success--hidden");
    };

    /**
     * Shows a success message in the feedback form
     * @param {string} message - Success message to display
     */
    const showFeedbackSuccess = (message) => {
        elements.feedbackSuccess.textContent = message;
        elements.feedbackSuccess.classList.remove("form-success--hidden");
        elements.feedbackError.classList.add("form-error--hidden");
    };

    /**
     * Shows the update required modal
     * @param {string} currentVer - Current extension version
     * @param {string} newVer - New available version
     * @param {Function} onUpdate - Callback when update button is clicked, receives progress callback
     */
    const showUpdateModal = (currentVer, newVer, onUpdate) => {
        if (!elements.updateModal) return;
        
        elements.currentVersion.textContent = currentVer;
        elements.newVersion.textContent = newVer;
        elements.updateModal.classList.remove("modal--hidden");
        
        // Remove any existing listeners and add new one
        const updateBtn = elements.updateButton;
        const newBtn = updateBtn.cloneNode(true);
        updateBtn.parentNode.replaceChild(newBtn, updateBtn);
        elements.updateButton = newBtn;
        
        const noteEl = elements.updateModal.querySelector(".update-modal__note");
        
        newBtn.addEventListener("click", async () => {
            newBtn.disabled = true;
            newBtn.innerHTML = `
                <svg class="spinner__ring" width="16" height="16" viewBox="0 0 40 40" style="animation: spin 0.8s linear infinite;">
                    <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="80 30"/>
                </svg>
                <span id="updateStatus">Updating...</span>
            `;
            
            const statusSpan = newBtn.querySelector("#updateStatus");
            
            const onProgress = (message) => {
                if (statusSpan) statusSpan.textContent = message;
            };
            
            try {
                await onUpdate(onProgress);
                
                // Success - show restart message
                newBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Updated!
                `;
                newBtn.style.backgroundColor = "#2f6f46";
                newBtn.style.borderColor = "#2f6f46";
                
                // Update the modal to show save/restart prompt
                const titleEl = elements.updateModal.querySelector(".update-modal__title");
                const descEl = elements.updateModal.querySelector(".update-modal__description");
                const versionsEl = elements.updateModal.querySelector(".update-modal__versions");
                const iconEl = elements.updateModal.querySelector(".update-modal__icon");
                
                if (titleEl) titleEl.textContent = "Update Complete!";
                if (descEl) {
                    descEl.innerHTML = `
                        <strong style="color: #bff5d5;">Save your project</strong> and restart After Effects to use the new version.
                    `;
                }
                if (versionsEl) versionsEl.style.display = "none";
                if (iconEl) {
                    iconEl.style.background = "linear-gradient(135deg, rgba(47, 111, 70, 0.3) 0%, rgba(47, 111, 70, 0.1) 100%)";
                    iconEl.style.color = "#bff5d5";
                    iconEl.innerHTML = `
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    `;
                }
                
                if (noteEl) {
                    noteEl.innerHTML = `
                        <span style="color: var(--ae-text-secondary);">
                            Go to <strong>File → Save</strong> then close and reopen After Effects.
                        </span>
                    `;
                }
            } catch (error) {
                // Error - show error message
                newBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Update Failed
                `;
                newBtn.style.backgroundColor = "#5a2a2a";
                newBtn.style.borderColor = "#5a2a2a";
                newBtn.disabled = false;
                
                if (noteEl) {
                    noteEl.innerHTML = `<span style="color: #ffbaba;">Error: ${error.message || "Unknown error"}</span><br>Please update manually or try again.`;
                }
            }
        });
        
        log("Showing update modal");
    };

    /**
     * Hides the update modal
     */
    const hideUpdateModal = () => {
        if (!elements.updateModal) return;
        elements.updateModal.classList.add("modal--hidden");
    };

    /**
     * Sets the version badge display
     * @param {string} version - Version string to display
     * @param {boolean} isOutdated - Whether the version is outdated
     * @param {Function} [onClick] - Optional click handler for outdated state
     */
    const setVersionBadge = (version, isOutdated = false, onClick = null) => {
        if (!elements.versionBadge) return;
        
        elements.versionBadge.textContent = `v${version}`;
        elements.versionBadge.classList.toggle("version-indicator--outdated", isOutdated);
        
        if (isOutdated) {
            elements.versionBadge.title = "Update available! Click to update.";
            if (onClick) {
                elements.versionBadge.style.cursor = "pointer";
                elements.versionBadge.onclick = onClick;
            }
        } else {
            elements.versionBadge.title = `Extension version ${version}`;
            elements.versionBadge.style.cursor = "default";
            elements.versionBadge.onclick = null;
        }
        
        log(`Version badge set to: ${version} (outdated: ${isOutdated})`);
    };
    
    // Expose methods
    global.Views.UI = {
        elements,
        LoadingOverlay,
        setStatus,
        setLoading,
        renderWelcomeScreen,
        renderFolders,
        renderBreadcrumbs,
        hideBreadcrumbs,
        expandToFolder,
        updateFolderCount,
        renderAssets,
        appendAssets,
        renderSkeletons,
        showApiKeyModal,
        hideApiKeyModal,
        showApiKeyError,
        toggleApiKeyVisibility,
        updateLoadMoreButton,
        updateSearchStats,
        clearSearch,
        getSearchQuery,
        updateClearButtonVisibility,
        showPreview,
        hidePreview,
        updateSelectionBar,
        toggleCardSelection,
        setGridSize,
        loadGridSizePreference,
        toggleSidebar,
        loadSidebarPreference,
        showContextMenu,
        hideContextMenu,
        getContextMenuAsset,
        getContextMenuCallbacks,
        updatePreviewNav,
        isPreviewOpen,
        showFeedbackButton,
        showFeedbackModal,
        hideFeedbackModal,
        showFeedbackError,
        showFeedbackSuccess,
        showUpdateModal,
        hideUpdateModal,
        setVersionBadge
    };

})(window);

