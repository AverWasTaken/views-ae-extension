"use strict";

/**
 * Views Asset Manager - Utils
 * Common helper functions and logging.
 */
(function(global) {
    global.Views = global.Views || {};

    const LOG_PREFIX = "[ViewsAssetManager]";
    const csInterface = new CSInterface();

    const log = (...messages) => console.log(LOG_PREFIX, ...messages);

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

    const loadHostScript = async () => {
        const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        const normalized = extensionRoot.replace(/\\/g, "\\\\");
        await evalScript(`$.evalFile("${normalized}/jsx/hostscript.jsx")`);
        log("Host script loaded.");
    };

    global.Views.Utils = {
        log,
        escapeForEval,
        sanitizeFileName,
        getDisplayName,
        evalScript,
        loadHostScript,
        csInterface
    };

})(window);

