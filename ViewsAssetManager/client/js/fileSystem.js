"use strict";

/**
 * Views Asset Manager - FileSystem
 * Handles file downloading and processing (Node.js / CEP).
 */
(function(global) {
    global.Views = global.Views || {};
    
    const Utils = global.Views.Utils;
    const log = Utils ? Utils.log : console.log;

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
        const safeName = Utils.sanitizeFileName(fileName);

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
    
                            response.pipe(fileStream);
    
                            fileStream.on("finish", function () {
                                fileStream.close(async function () {
                                    try {
                                        // Repair the PNG to ensure AE compatibility
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

        const blob = await response.blob();
        const sizeInMB = (blob.size / 1024 / 1024).toFixed(2);

        log("Downloaded " + sizeInMB + " MB (" + blob.type + ")");

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

                    const tempPath = await Utils.evalScript(
                        'saveToTemp(\"' + Utils.escapeForEval(base64) + '\", \"' + Utils.escapeForEval(safeName) + '\")'
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

    global.Views.FileSystem = {
        downloadFileToTemp
    };

})(window);





