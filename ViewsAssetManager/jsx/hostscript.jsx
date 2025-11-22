/**
 * Views Asset Manager host script.
 */
(function () {
    var LOG_PREFIX = "[ViewsAssetManager]";

    function log(message) {
        $.writeln(LOG_PREFIX + " " + message);
    }

    function getActiveComp() {
        if (!app || !app.project) {
            return null;
        }
        var item = app.project.activeItem;
        if (item && item instanceof CompItem) {
            return item;
        }
        return null;
    }

    function ensureUndoEnded(undoOpened) {
        if (undoOpened) {
            try {
                app.endUndoGroup();
            } catch (err) {
                log("Undo close failed: " + err);
            }
        }
    }

    function centerLayer(layer, comp) {
        if (!layer || !comp) {
            return;
        }
        var position = layer.property("Position");
        if (position) {
            position.setValue([comp.width / 2, comp.height / 2]);
        }
        layer.startTime = comp.time;
        if (layer.inPoint !== comp.time) {
            layer.inPoint = comp.time;
        }
    }

    function decodeBase64(data) {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var output = [];
        var i = 0;
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var clean = (data || "").replace(/[^A-Za-z0-9\+\/\=]/g, "");

        while (i < clean.length) {
            enc1 = chars.indexOf(clean.charAt(i++));
            enc2 = chars.indexOf(clean.charAt(i++));
            enc3 = chars.indexOf(clean.charAt(i++));
            enc4 = chars.indexOf(clean.charAt(i++));

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            output.push(String.fromCharCode(chr1));

            if (enc3 !== 64 && enc3 !== -1) {
                output.push(String.fromCharCode(chr2));
            }
            if (enc4 !== 64 && enc4 !== -1) {
                output.push(String.fromCharCode(chr3));
            }
        }
        return output.join("");
    }

    function sanitizeFileName(name) {
        if (!name || name === "") {
            name = "asset.png";
        }

        var sanitized = name.replace(/[<>:"\/\\|?*]/g, "-");
        if (sanitized.indexOf(".") === -1) {
            sanitized += ".png";
        }
        return sanitized;
    }

    function getCacheFolder() {
        var folder = new Folder(Folder.temp.fsName + "/ViewsAssetManager");
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function cleanupOldCacheFiles() {
        try {
            var folder = getCacheFolder();
            var files = folder.getFiles();
            if (!files) return;

            var now = new Date();
            // 3 days in milliseconds
            var maxAge = 3 * 24 * 60 * 60 * 1000;
            
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file instanceof File) {
                    var age = now.getTime() - file.modified.getTime();
                    if (age > maxAge) {
                        file.remove();
                        // log("Removed old cache file: " + file.name);
                    }
                }
            }
        } catch (e) {
            log("Cleanup error: " + e.toString());
        }
    }

    function saveToTemp(base64Data, fileName) {
        try {
            if (!base64Data) {
                throw new Error("Missing base64 data.");
            }

            var folder = getCacheFolder();
            var safeName = sanitizeFileName(fileName);
            var filePath = folder.fsName + "/" + safeName;
            var file = new File(filePath);
            file.encoding = "BINARY";
            file.open("w");
            file.write(decodeBase64(base64Data));
            file.close();

            log("Asset cached at " + file.fsName);
            return file.fsName;
        } catch (error) {
            var message = error && error.message ? error.message : error.toString();
            log("saveToTemp error: " + message);
            return "Error: " + message;
        }
    }

    function importAndAddAsset(filePath) {
        var undoOpened = false;
        try {
            if (!filePath) {
                throw new Error("File path is required.");
            }

            var file = new File(filePath);
            if (!file.exists) {
                throw new Error("File not found: " + filePath);
            }
            
            // Verify file can be opened and has content
            if (file.length === 0) {
                throw new Error("File is empty or corrupted: " + filePath);
            }
            
            // Try to open the file to verify it's readable
            file.encoding = "BINARY";
            if (!file.open("r")) {
                throw new Error("File couldn't be opened for reading - it may be locked or corrupted.");
            }
            file.close();

            if (!app.project) {
                app.newProject();
            }

            var comp = getActiveComp();
            if (!comp) {
                throw new Error("Open or select an active composition.");
            }

            var importOptions = new ImportOptions(file);
            if (!importOptions.canImportAs(ImportAsType.FOOTAGE)) {
                throw new Error("Unsupported file type or corrupted file.");
            }

            importOptions.importAs = ImportAsType.FOOTAGE;
            app.beginUndoGroup("Views Asset Import");
            undoOpened = true;

            var footage = app.project.importFile(importOptions);
            
            // Validate that import was successful
            if (!footage) {
                throw new Error("Import failed - file may be corrupted or invalid. After Effects could not read the file.");
            }
            
            var layer = comp.layers.add(footage);
            centerLayer(layer, comp);

            log("Imported asset " + file.fsName);
            return "Asset imported successfully.";
        } catch (error) {
            var message = error && error.message ? error.message : error.toString();
            log("importAndAddAsset error: " + message);
            return "Error: " + message;
        } finally {
            ensureUndoEnded(undoOpened);
        }
    }

    $.global.importAndAddAsset = importAndAddAsset;
    $.global.getActiveComp = getActiveComp;
    $.global.saveToTemp = saveToTemp;

    // Run cleanup on load
    cleanupOldCacheFiles();
})();

