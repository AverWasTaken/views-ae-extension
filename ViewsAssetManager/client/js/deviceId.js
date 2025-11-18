/**
 * Device ID Generator for Views Asset Manager
 * 
 * Generates a unique, consistent identifier for the current device using
 * system information (MAC address, hostname). The identifier is hashed
 * for privacy before being sent to the API.
 */

"use strict";

(function (global) {
    /**
     * Simple SHA-256 implementation for hashing device identifiers
     * @param {string} message - The string to hash
     * @returns {Promise<string>} Hex-encoded SHA-256 hash
     */
    async function sha256(message) {
        // Use Web Crypto API if available (modern browsers/CEP)
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Fallback: Use Node.js crypto module (available in CEP with Node.js enabled)
        if (typeof require === 'function') {
            try {
                const crypto = require('crypto');
                return crypto.createHash('sha256').update(message).digest('hex');
            } catch (error) {
                console.error('[DeviceId] Failed to load Node.js crypto:', error);
            }
        }

        // Last resort: Simple hash (not cryptographically secure, but functional)
        console.warn('[DeviceId] Using fallback hash - not cryptographically secure');
        let hash = 0;
        for (let i = 0; i < message.length; i++) {
            const char = message.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).padStart(16, '0');
    }

    /**
     * Gets the primary MAC address from network interfaces
     * @returns {string|null} MAC address or null if not found
     */
    function getPrimaryMacAddress() {
        if (typeof require !== 'function') {
            return null;
        }

        try {
            const os = require('os');
            const interfaces = os.networkInterfaces();

            // Look for the first non-internal, non-loopback interface with a MAC address
            for (const interfaceName in interfaces) {
                const iface = interfaces[interfaceName];
                for (const config of iface) {
                    // Skip internal/loopback and interfaces without MAC addresses
                    if (!config.internal && config.mac && config.mac !== '00:00:00:00:00:00') {
                        return config.mac;
                    }
                }
            }

            // Fallback: Use any MAC address we can find
            for (const interfaceName in interfaces) {
                const iface = interfaces[interfaceName];
                for (const config of iface) {
                    if (config.mac && config.mac !== '00:00:00:00:00:00') {
                        return config.mac;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('[DeviceId] Failed to get MAC address:', error);
            return null;
        }
    }

    /**
     * Gets the system hostname
     * @returns {string|null} Hostname or null if not available
     */
    function getHostname() {
        if (typeof require !== 'function') {
            return null;
        }

        try {
            const os = require('os');
            return os.hostname();
        } catch (error) {
            console.error('[DeviceId] Failed to get hostname:', error);
            return null;
        }
    }

    /**
     * Gets the system username
     * @returns {string|null} Username or null if not available
     */
    function getUsername() {
        if (typeof require !== 'function') {
            return null;
        }

        try {
            const os = require('os');
            const userInfo = os.userInfo();
            return userInfo.username;
        } catch (error) {
            console.error('[DeviceId] Failed to get username:', error);
            return null;
        }
    }

    /**
     * Generates a raw device identifier from system information
     * Combines multiple system attributes for reliability
     * @returns {string} Raw device identifier (not hashed)
     */
    function generateRawDeviceId() {
        const parts = [];

        // 1. MAC Address (most reliable, hardware-based)
        const macAddress = getPrimaryMacAddress();
        if (macAddress) {
            parts.push('mac:' + macAddress);
        }

        // 2. Hostname (usually consistent per machine)
        const hostname = getHostname();
        if (hostname) {
            parts.push('host:' + hostname);
        }

        // 3. Username (helps differentiate multiple users on same machine)
        const username = getUsername();
        if (username) {
            parts.push('user:' + username);
        }

        // Ensure we have at least one identifier
        if (parts.length === 0) {
            console.warn('[DeviceId] No system identifiers found - using fallback');
            // Fallback to browser/CEP specific identifiers
            parts.push('fallback:' + navigator.userAgent);
            parts.push('platform:' + navigator.platform);
        }

        return parts.join('|');
    }

    /**
     * Generates a unique device ID for the current system
     * The ID is hashed for privacy and consistency
     * 
     * @returns {Promise<string>} Hashed device ID
     * @example
     * const deviceId = await getDeviceId();
     * // Returns: "a1b2c3d4e5f6..." (64-character hex string)
     */
    async function getDeviceId() {
        const rawId = generateRawDeviceId();
        console.log('[DeviceId] Raw identifier components collected');
        
        // Hash the raw identifier for privacy
        const hashedId = await sha256(rawId);
        console.log('[DeviceId] Device ID generated:', hashedId.substring(0, 16) + '...');
        
        return hashedId;
    }

    /**
     * Gets diagnostic information about device ID generation (for debugging)
     * @returns {Object} Diagnostic information
     */
    function getDeviceIdDiagnostics() {
        return {
            macAddress: getPrimaryMacAddress(),
            hostname: getHostname(),
            username: getUsername(),
            hasNodeJs: typeof require === 'function',
            hasCryptoAPI: typeof crypto !== 'undefined' && crypto.subtle !== undefined,
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };
    }

    // Export to global scope
    global.DeviceId = {
        getDeviceId: getDeviceId,
        getDiagnostics: getDeviceIdDiagnostics
    };

})(typeof window !== 'undefined' ? window : this);

