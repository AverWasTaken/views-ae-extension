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

    /**
     * Detects if running on Windows or Mac
     * @returns {string} "win" or "mac"
     */
    const getPlatform = () => {
        const os = require("os");
        return os.platform() === "darwin" ? "mac" : "win";
    };

    /**
     * Executes a command and returns a promise
     * @param {string} command - Command to execute
     * @param {Object} options - exec options
     * @returns {Promise<{stdout: string, stderr: string}>}
     */
    const execPromise = (command, options = {}) => {
        const { exec } = require("child_process");
        const platform = getPlatform();
        const shell = platform === "mac" ? "/bin/bash" : "cmd.exe";
        
        return new Promise((resolve, reject) => {
            exec(command, { shell, ...options }, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    };

    /**
     * Updates the extension by cloning the latest version from GitHub
     * @param {Function} onProgress - Optional callback for progress updates
     * @returns {Promise<void>}
     */
    const runUpdateScript = async (onProgress) => {
        const path = require("path");
        const fs = require("fs");
        const os = require("os");
        
        const platform = getPlatform();
        const repoUrl = "https://github.com/AverWasTaken/views-ae-extension.git";
        const tempDir = path.join(os.tmpdir(), "ViewsAssetManager_Update");
        
        // Platform-specific paths
        const cepDir = platform === "mac" 
            ? "/Library/Application Support/Adobe/CEP/extensions"
            : "C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions";
        const extensionDest = path.join(cepDir, "ViewsAssetManager");
        
        log("Starting extension update...");
        log("Platform:", platform);
        log("Temp dir:", tempDir);
        log("Destination:", extensionDest);
        
        try {
            // Step 1: Check if git is installed
            if (onProgress) onProgress("Checking git installation...");
            try {
                await execPromise("git --version");
                log("Git is installed");
            } catch (e) {
                throw new Error("Git is not installed. Please install Git from https://git-scm.com");
            }
            
            // Step 2: Clean up old temp folder
            if (onProgress) onProgress("Preparing...");
            if (fs.existsSync(tempDir)) {
                log("Removing old temp folder...");
                const rmCmd = platform === "mac" ? `rm -rf "${tempDir}"` : `rmdir /s /q "${tempDir}"`;
                await execPromise(rmCmd);
            }
            
            // Step 3: Clone the repository
            if (onProgress) onProgress("Downloading from GitHub...");
            log("Cloning repository...");
            try {
                const { stdout, stderr } = await execPromise(`git clone --depth 1 --progress "${repoUrl}" "${tempDir}"`, {
                    timeout: 60000 // 60 second timeout
                });
                log("Clone stdout:", stdout);
                log("Clone stderr:", stderr);
            } catch (e) {
                log("Clone error:", e.error?.message, e.stderr);
                throw new Error("Failed to download from GitHub. Check your internet connection.");
            }
            
            // Step 4: Verify clone succeeded
            const clonedExtPath = path.join(tempDir, "ViewsAssetManager");
            if (!fs.existsSync(clonedExtPath)) {
                throw new Error("Download failed - extension folder not found in repository");
            }
            
            // Verify key files exist in the cloned repo
            const manifestPath = path.join(clonedExtPath, "CSXS", "manifest.xml");
            if (!fs.existsSync(manifestPath)) {
                throw new Error("Download corrupted - manifest.xml not found");
            }
            log("Clone verified - files exist");
            
            // Step 5: Install with admin privileges (platform-specific)
            if (onProgress) onProgress("Requesting admin access...");
            log("Requesting admin privileges for installation...");
            
            const resultPath = path.join(os.tmpdir(), "ViewsUpdate_Result.txt");
            
            // Delete any existing result file
            if (fs.existsSync(resultPath)) {
                fs.unlinkSync(resultPath);
            }
            
            if (platform === "mac") {
                // Mac: Use AppleScript to request admin password
                const shellScript = `
#!/bin/bash
rm -rf "${extensionDest}" 2>/dev/null
cp -R "${clonedExtPath}" "${extensionDest}"
if [ -f "${extensionDest}/CSXS/manifest.xml" ]; then
    echo "SUCCESS" > "${resultPath}"
else
    echo "ERROR: Copy failed" > "${resultPath}"
fi
`;
                const scriptPath = path.join(os.tmpdir(), "ViewsUpdate_Install.sh");
                fs.writeFileSync(scriptPath, shellScript, { mode: 0o755 });
                log("Install script written to:", scriptPath);
                
                if (onProgress) onProgress("Installing (enter password)...");
                
                // Use AppleScript to run with admin privileges - shows password dialog
                const appleScript = `do shell script "bash '${scriptPath}'" with administrator privileges`;
                const elevateCmd = `osascript -e '${appleScript.replace(/'/g, "'\\''")}'`;
                log("Running elevated command via AppleScript");
                
                try {
                    await execPromise(elevateCmd, { timeout: 120000 });
                    log("Elevated command completed");
                } catch (e) {
                    log("Elevation error:", e.error?.message, e.stderr);
                    if (!fs.existsSync(resultPath)) {
                        throw new Error("Admin prompt was cancelled. Please try again and enter your password.");
                    }
                }
                
                // Cleanup script
                try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
                
            } else {
                // Windows: Use PowerShell with UAC elevation
                const scriptPath = path.join(os.tmpdir(), "ViewsUpdate_Install.ps1");
                // Note: No need to escape backslashes - script is written to file, not passed inline
                const scriptContent = `
$ErrorActionPreference = 'Stop'
$src = '${clonedExtPath.replace(/'/g, "''")}'
$dest = '${extensionDest.replace(/'/g, "''")}'
$logFile = '${resultPath.replace(/'/g, "''")}'

try {
    # Remove old extension if exists
    if (Test-Path $dest) {
        Remove-Item -Path $dest -Recurse -Force -ErrorAction Stop
    }
    # Copy new extension
    Copy-Item -Path $src -Destination $dest -Recurse -Force -ErrorAction Stop
    # Write success
    'SUCCESS' | Out-File -FilePath $logFile -Encoding UTF8
} catch {
    # Write error
    "ERROR: $_" | Out-File -FilePath $logFile -Encoding UTF8
}
`;
                
                fs.writeFileSync(scriptPath, scriptContent, "utf8");
                log("Install script written to:", scriptPath);
                
                if (onProgress) onProgress("Installing (approve admin prompt)...");
                
                // Run PowerShell with elevation - this will show UAC prompt
                const elevateCmd = `powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \\"${scriptPath}\\"' -Verb RunAs -Wait"`;
                log("Running elevated command:", elevateCmd);
                
                try {
                    await execPromise(elevateCmd, { timeout: 120000 }); // 2 min timeout for user to click UAC
                    log("Elevated command completed");
                } catch (e) {
                    log("Elevation error:", e.error?.message, e.stderr);
                    // Check if result file was created anyway (UAC might have succeeded even if exec reports error)
                    if (!fs.existsSync(resultPath)) {
                        throw new Error("Admin prompt was cancelled or failed to appear. Try again.");
                    }
                }
                
                // Cleanup script
                try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
            }
            
            // Check the result file
            if (onProgress) onProgress("Checking result...");
            
            // Wait a moment for file to be written
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (!fs.existsSync(resultPath)) {
                throw new Error("Installation did not complete. The admin prompt may have been cancelled.");
            }
            
            const result = fs.readFileSync(resultPath, "utf8").trim();
            log("Install result:", result);
            
            // Cleanup result file
            try { fs.unlinkSync(resultPath); } catch (e) { /* ignore */ }
            
            if (result.startsWith("ERROR:")) {
                throw new Error("Installation failed: " + result.substring(7));
            }
            
            if (result !== "SUCCESS") {
                throw new Error("Installation returned unexpected result: " + result);
            }
            
            log("Admin install completed successfully");
            
            // Step 6: Verify installation
            if (onProgress) onProgress("Verifying installation...");
            
            // Wait a moment for filesystem to sync
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const installedManifest = path.join(extensionDest, "CSXS", "manifest.xml");
            if (!fs.existsSync(installedManifest)) {
                throw new Error("Installation verification failed - files not copied correctly. Try again.");
            }
            log("Installation verified - manifest exists at destination");
            
            // Step 7: Cleanup temp folder
            if (onProgress) onProgress("Cleaning up...");
            try {
                const rmCmd = platform === "mac" ? `rm -rf "${tempDir}"` : `rmdir /s /q "${tempDir}"`;
                await execPromise(rmCmd);
            } catch (e) {
                log("Warning: Could not cleanup temp folder:", e.stderr);
                // Not critical, continue
            }
            
            log("Update completed successfully!");
            if (onProgress) onProgress("Update complete!");
            
        } catch (error) {
            log("Update failed:", error.message);
            // Try to cleanup on failure
            try {
                if (fs.existsSync(tempDir)) {
                    const rmCmd = platform === "mac" ? `rm -rf "${tempDir}"` : `rmdir /s /q "${tempDir}"`;
                    await execPromise(rmCmd);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
            throw error;
        }
    };

    global.Views.Utils = {
        log,
        escapeForEval,
        sanitizeFileName,
        getDisplayName,
        evalScript,
        loadHostScript,
        runUpdateScript,
        csInterface
    };

})(window);

