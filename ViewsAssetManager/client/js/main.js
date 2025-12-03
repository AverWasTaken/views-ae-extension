"use strict";

/**
 * Views Asset Manager - Main
 * Controller logic connecting API, UI, and FileSystem.
 * Handles initialization, event binding, and orchestration.
 */
(function() {
    const Utils = Views.Utils;
    const API = Views.API;
    const UI = Views.UI;
    const State = Views.State;
    const AssetController = Views.AssetController;
    const FolderController = Views.FolderController;

    const log = Utils.log;

    /**
     * Creates asset rendering callbacks object
     * @returns {Object} Callbacks for asset rendering
     */
    const getAssetCallbacks = () => ({
        onImport: AssetController.handleAssetDownload,
        onPreview: AssetController.handleAssetPreview,
        onSelect: AssetController.handleAssetSelect,
        getSelectedIds: AssetController.getSelectedIds
    });

    /**
     * Wrapper for selectFolder that provides callbacks
     * @param {string} folderId - Folder ID to select
     */
    const selectFolder = (folderId) => {
        FolderController.selectFolder(folderId, getAssetCallbacks(), AssetController.updateAssetView);
    };

    /**
     * Handles API key form submission
     * @param {Event} event - Form submit event
     */
    const handleApiKeySubmit = async (event) => {
        event.preventDefault();
        const state = State.getState();

        const apiKey = UI.elements.apiKeyInput.value.trim();

        if (!apiKey) {
            UI.showApiKeyError("Please enter an API key");
            return;
        }

        UI.elements.saveApiKeyButton.disabled = true;
        UI.elements.saveApiKeyButton.textContent = "Validating...";
        UI.elements.apiKeyError.classList.add("form-error--hidden");

        try {
            log("Validating API key...");
            await API.validateApiKey(apiKey);

            const success = API.storeApiKey(apiKey);
            if (!success) {
                throw new Error("Failed to store API key");
            }

            UI.hideApiKeyModal();
            state.apiKey = apiKey;
            UI.showFeedbackButton();

            AssetController.startBackgroundPreload();

            if (state.isFirstRun) {
                state.isFirstRun = false;
                UI.setStatus("API key configured successfully!", "success");
                await Utils.loadHostScript();
                const folders = await FolderController.loadFolders();
                UI.renderFolders(folders, selectFolder);
                UI.renderWelcomeScreen();
            } else {
                UI.setStatus("API key updated successfully!", "success");
                State.clearCache();
                State.clearPreloadPromises();
                AssetController.startBackgroundPreload();
                const folders = await FolderController.loadFolders();
                UI.renderFolders(folders, selectFolder);
                if (!state.isWelcome) {
                    AssetController.syncAssets(getAssetCallbacks());
                }
            }
        } catch (error) {
            console.error("API key validation failed:", error);
            UI.showApiKeyError(error.message || "Failed to validate API key");
        } finally {
            UI.elements.saveApiKeyButton.disabled = false;
            UI.elements.saveApiKeyButton.textContent = "Save Key";
        }
    };

    /**
     * Handles search input changes with debouncing
     */
    const handleSearchInput = () => {
        const state = State.getState();
        UI.updateClearButtonVisibility();

        const existingTimer = State.getSearchDebounceTimer();
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            const query = UI.getSearchQuery();
            state.searchQuery = query;
            state.visibleCount = 20;
            AssetController.updateAssetView(getAssetCallbacks());
            log(`Search query: "${query}"`);
        }, 200);

        State.setSearchDebounceTimer(timer);
    };

    /**
     * Handles clearing the search
     */
    const handleClearSearch = () => {
        const state = State.getState();
        UI.clearSearch();
        state.searchQuery = "";
        state.visibleCount = 20;
        AssetController.updateAssetView(getAssetCallbacks());
        log("Search cleared.");
    };

    /**
     * Handles feedback form submission
     * @param {Event} event - Form submit event
     */
    const handleFeedbackSubmit = async (event) => {
        event.preventDefault();

        const feedbackType = UI.elements.feedbackType.value;
        const message = UI.elements.feedbackMessage.value.trim();
        const discordUsername = UI.elements.feedbackDiscord.value.trim();

        if (!message) {
            UI.showFeedbackError("Please enter a message");
            return;
        }

        UI.elements.submitFeedbackButton.disabled = true;
        UI.elements.submitFeedbackButton.textContent = "Sending...";

        try {
            const typeColors = {
                bug: 0xff6b6b,
                feature: 0x00a3e0,
                feedback: 0x9b59b6
            };

            const typeLabels = {
                bug: "🐛 Bug Report",
                feature: "✨ Feature Request",
                feedback: "💬 General Feedback"
            };

            const embed = {
                title: typeLabels[feedbackType] || "Feedback",
                description: message,
                color: typeColors[feedbackType] || 0x00a3e0,
                fields: [],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "Views Asset Manager"
                }
            };

            if (discordUsername) {
                embed.fields.push({
                    name: "Discord",
                    value: discordUsername,
                    inline: true
                });
            }

            const response = await fetch(State.FEEDBACK_WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    embeds: [embed]
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to send feedback: ${response.status}`);
            }

            log("Feedback sent successfully");
            UI.showFeedbackSuccess("Thank you! Your feedback has been sent.");

            UI.elements.feedbackMessage.value = "";
            UI.elements.feedbackDiscord.value = "";

            setTimeout(() => {
                UI.hideFeedbackModal();
            }, 2000);

        } catch (error) {
            console.error("Failed to send feedback:", error);
            UI.showFeedbackError("Failed to send feedback. Please try again or report in Discord.");
        } finally {
            UI.elements.submitFeedbackButton.disabled = false;
            UI.elements.submitFeedbackButton.textContent = "Send Feedback";
        }
    };

    /**
     * Shows the update modal with the update handler
     * @param {string} currentVer - Current extension version
     * @param {string} newVer - New available version
     */
    const showUpdatePrompt = (currentVer, newVer) => {
        UI.showUpdateModal(currentVer, newVer, async (onProgress) => {
            await Utils.runUpdateScript(onProgress);
        });
    };

    /**
     * Starts the periodic version check interval
     */
    const startVersionCheckInterval = () => {
        const existingInterval = State.getVersionCheckInterval();
        if (existingInterval) {
            clearInterval(existingInterval);
        }

        log(`Starting periodic version check (every ${State.VERSION_CHECK_INTERVAL_MS / 1000 / 60} minutes)`);

        const interval = setInterval(async () => {
            log("Running periodic version check...");
            await checkVersion();
        }, State.VERSION_CHECK_INTERVAL_MS);

        State.setVersionCheckInterval(interval);
    };

    /**
     * Checks if the extension version matches the API version
     * @returns {Promise<boolean>} True if versions match, false if update required
     */
    const checkVersion = async () => {
        try {
            log("Checking extension version...");
            const versionInfo = await API.fetchVersion();
            const expectedVersion = API.getExpectedVersion();

            log(`Server version: ${versionInfo.version}, Expected: ${expectedVersion}`);

            if (API.isUpdateRequired(versionInfo.version)) {
                log("Update required - showing update modal");

                UI.setVersionBadge(expectedVersion, true, () => {
                    showUpdatePrompt(expectedVersion, versionInfo.version);
                });

                showUpdatePrompt(expectedVersion, versionInfo.version);
                return false;
            }

            UI.setVersionBadge(expectedVersion, false);

            log("Version check passed");
            return true;
        } catch (error) {
            console.error("Version check failed:", error);
            log("Version check failed, continuing anyway...");

            UI.setVersionBadge(API.getExpectedVersion(), false);
            return true;
        }
    };

    /**
     * Binds all event listeners
     */
    const bindEvents = () => {
        const state = State.getState();

        UI.elements.refreshButton.addEventListener("click", async () => {
            log("Manual refresh requested.");
            State.clearCache();
            State.clearPreloadPromises();
            handleClearSearch();
            AssetController.clearSelection();

            const versionOk = await checkVersion();
            if (!versionOk) {
                return;
            }

            const folders = await FolderController.loadFolders();
            UI.renderFolders(folders, selectFolder);
            await AssetController.syncAssets(getAssetCallbacks());
        });

        UI.elements.settingsButton.addEventListener("click", () => {
            log("Settings opened.");
            UI.showApiKeyModal(false);
        });

        if (UI.elements.feedbackButton) {
            UI.elements.feedbackButton.addEventListener("click", () => {
                log("Feedback modal opened.");
                UI.showFeedbackModal();
            });
        }

        if (UI.elements.feedbackForm) {
            UI.elements.feedbackForm.addEventListener("submit", handleFeedbackSubmit);
        }

        if (UI.elements.cancelFeedbackButton) {
            UI.elements.cancelFeedbackButton.addEventListener("click", UI.hideFeedbackModal);
        }

        if (UI.elements.feedbackModal) {
            UI.elements.feedbackModal.querySelector(".modal__overlay").addEventListener("click", UI.hideFeedbackModal);
        }

        if (UI.elements.searchInput) {
            UI.elements.searchInput.addEventListener("input", handleSearchInput);
            UI.elements.searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    handleClearSearch();
                    UI.elements.searchInput.blur();
                }
            });
        }

        if (UI.elements.clearSearchBtn) {
            UI.elements.clearSearchBtn.addEventListener("click", handleClearSearch);
        }

        if (UI.elements.closePreviewBtn) {
            UI.elements.closePreviewBtn.addEventListener("click", UI.hidePreview);
        }

        if (UI.elements.previewModal) {
            UI.elements.previewModal.querySelector(".modal__overlay").addEventListener("click", UI.hidePreview);
        }

        if (UI.elements.previewImportBtn) {
            UI.elements.previewImportBtn.addEventListener("click", () => {
                if (state.previewAsset) {
                    UI.hidePreview();
                    AssetController.handleAssetDownload(state.previewAsset, UI.elements.previewImportBtn);
                }
            });
        }

        if (UI.elements.previewPrevBtn) {
            UI.elements.previewPrevBtn.addEventListener("click", AssetController.previewPrevAsset);
        }

        if (UI.elements.previewNextBtn) {
            UI.elements.previewNextBtn.addEventListener("click", AssetController.previewNextAsset);
        }

        [UI.elements.gridSmall, UI.elements.gridMedium, UI.elements.gridLarge].forEach(btn => {
            if (btn) {
                btn.addEventListener("click", () => {
                    UI.setGridSize(btn.dataset.size);
                });
            }
        });

        if (UI.elements.clearSelectionBtn) {
            UI.elements.clearSelectionBtn.addEventListener("click", AssetController.clearSelection);
        }

        if (UI.elements.importSelectedBtn) {
            UI.elements.importSelectedBtn.addEventListener("click", AssetController.handleImportSelected);
        }

        document.addEventListener("keydown", (e) => {
            if (UI.isPreviewOpen()) {
                switch (e.key) {
                    case "Escape":
                        UI.hidePreview();
                        break;
                    case "ArrowLeft":
                        e.preventDefault();
                        AssetController.previewPrevAsset();
                        break;
                    case "ArrowRight":
                        e.preventDefault();
                        AssetController.previewNextAsset();
                        break;
                    case "Enter":
                        e.preventDefault();
                        if (state.previewAsset) {
                            UI.hidePreview();
                            AssetController.handleAssetDownload(state.previewAsset, UI.elements.previewImportBtn);
                        }
                        break;
                }
            }
        });

        UI.elements.apiKeyForm.addEventListener("submit", handleApiKeySubmit);

        UI.elements.cancelApiKeyButton.addEventListener("click", () => {
            if (!state.isFirstRun) {
                UI.hideApiKeyModal();
            }
        });

        UI.elements.toggleApiKeyVisibility.addEventListener("click", UI.toggleApiKeyVisibility);

        UI.elements.apiKeyModal.querySelector(".modal__overlay").addEventListener("click", () => {
            if (!state.isFirstRun && UI.elements.cancelApiKeyButton.style.display !== "none") {
                UI.hideApiKeyModal();
            }
        });

        const allAssetsItem = UI.elements.folderList.querySelector('[data-folder-id="all"]');
        if (allAssetsItem) {
            allAssetsItem.addEventListener("click", () => selectFolder("all"));
        }
    };

    /**
     * Initializes the application
     */
    const init = async () => {
        const state = State.getState();
        bindEvents();

        try {
            log("Initializing panel UI.");

            const storedKey = API.getStoredApiKey();
            if (storedKey) {
                state.apiKey = storedKey;
                API.setApiKey(storedKey);

                AssetController.startBackgroundPreload();

                UI.showFeedbackButton();
                log("API key loaded from storage, background preload started");
            } else {
                log("No API key found - first run");
                state.isFirstRun = true;
                UI.setLoading(false);
                UI.showApiKeyModal(true);
                return;
            }

            const versionOk = await checkVersion();
            if (!versionOk) {
                UI.setLoading(false);
                State.clearPreloadPromises();
                return;
            }

            await Utils.loadHostScript();

            const folders = await FolderController.loadFolders();
            UI.renderFolders(folders, selectFolder);

            UI.renderWelcomeScreen();

            AssetController.syncAssets(getAssetCallbacks());

            startVersionCheckInterval();

        } catch (error) {
            console.error("Initialization failed", error);
            UI.setStatus(error.message || "Initialization failed.", "error");
            UI.setLoading(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();
