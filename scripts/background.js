let socket = null;
let rdpAddress = null;
let rdpPort = "8081";
let presenceEnabled = true;
let keepAliveInterval = null;
let customPrefix = "";
let privacyBlacklist = [];
let listMode = "blacklist";

// Initialize extension
chrome.storage.local.get(['rdpAddress', 'rdpPort', 'presenceEnabled', 'customPrefix', 'blacklist', 'listMode'], (result) => {
    if (result.presenceEnabled !== undefined) {
        presenceEnabled = result.presenceEnabled;
    }
    if (result.rdpPort) {
        rdpPort = result.rdpPort;
    }
    if (result.customPrefix) {
        customPrefix = result.customPrefix;
    }
    if (result.blacklist) {
        privacyBlacklist = result.blacklist.split('\n').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    }
    if (result.listMode) {
        listMode = result.listMode;
    }
    if (result.rdpAddress && presenceEnabled) {
        rdpAddress = result.rdpAddress;
        connectToRDP();
    }
});

// Listen for settings updates from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsUpdated') {
        rdpAddress = message.address;
        rdpPort = message.port;
        presenceEnabled = message.enabled;
        customPrefix = message.customPrefix || "";
        listMode = message.listMode || "blacklist";

        if (message.blacklist) {
            privacyBlacklist = message.blacklist.split('\n').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        } else {
            privacyBlacklist = [];
        }

        if (presenceEnabled && rdpAddress) {
            if (socket && socket.readyState === WebSocket.OPEN) {
                disconnectFromRDP();
                connectToRDP();
            } else {
                connectToRDP();
            }
        } else {
            disconnectFromRDP();
        }
    }
    return true;
});

function connectToRDP() {
    if (socket) return;
    if (!rdpAddress) return;

    // Use ws:// for standard local/RDP connections
    let url = `ws://${rdpAddress}:${rdpPort}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log(`[RDP Bridge] Connected to ${url}`);
        updatePresenceForActiveTab();

        // Keep the service worker alive by pinging the server every 20 seconds
        keepAliveInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ action: "ping" }));
            }
        }, 20000);
    };

    socket.onclose = (event) => {
        console.log('[RDP Bridge] Disconnected:', event.code, event.reason);
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        socket = null;

        // Attempt reconnect every 10 seconds if still enabled
        if (presenceEnabled && rdpAddress) {
            setTimeout(connectToRDP, 10000);
        }
    };

    socket.onerror = (error) => {
        console.error('[RDP Bridge] WebSocket Error:', error);
    };
}

function disconnectFromRDP() {
    if (socket) {
        // Tell the server to clear presence before closing connection
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: "clearPresence" }));
        }
        socket.close();
        socket = null;
    }
}

// ----------------------------------------------------
// Tab Listening and Presence Updates
// ----------------------------------------------------

function sendPresenceUpdate(title, cleanUrl) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!presenceEnabled) return;

    const payload = {
        action: "updatePresence",
        title: title,
        url: cleanUrl
    };

    socket.send(JSON.stringify(payload));
}

function updatePresenceForActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            handleTabChange(tab);
        }
    });
}

function handleTabChange(tab) {
    // Show 'Idle' when on a new tab or internal page
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
        sendPresenceUpdate("New Tab", "Idle");
        return;
    }

    let cleanUrl = tab.url;
    try {
        const urlObj = new URL(tab.url);
        cleanUrl = urlObj.hostname; // This changes "https://www.youtube.com/watch?v=..." to just "www.youtube.com"

        // Domain Filter check
        const domainMatch = privacyBlacklist.some(domain => cleanUrl.toLowerCase().includes(domain));

        if (listMode === 'whitelist' && !domainMatch) {
            // If in whitelist mode and domain is NOT on the list, hide it
            sendPresenceUpdate("Private Browsing", "Idle");
            return;
        } else if (listMode === 'blacklist' && domainMatch) {
            // If in blacklist mode and domain IS on the list, hide it
            sendPresenceUpdate("Private Browsing", "Idle");
            return;
        }
    } catch (e) {
        console.error("Failed to parse URL:", tab.url);
    }

    let finalTitle = tab.title;

    // Automatic Media Formatting for YouTube
    if (cleanUrl.includes("youtube.com") && finalTitle.endsWith(" - YouTube")) {
        // Remove the " - YouTube" suffix
        finalTitle = finalTitle.slice(0, -10);
        // Remove notification badges (e.g., "(3) ")
        finalTitle = finalTitle.replace(/^\(\d+\)\s+/, "");

        if (!customPrefix || customPrefix.trim() === '') {
            finalTitle = `Watching: ${finalTitle}`;
        }
    }

    if (customPrefix && customPrefix.trim() !== '') {
        finalTitle = `${customPrefix.trim()} ${finalTitle}`;
    }

    sendPresenceUpdate(finalTitle, cleanUrl);
}

// Listener: when active tab changes.
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        handleTabChange(tab);
    });
});

// Listener: when the URL/Title of the active tab updates.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active) {
        // Only send updates if title or URL actually changed
        if (changeInfo.url || changeInfo.title) {
            handleTabChange(tab);
        }
    }
});

// Listener: content script media updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'mediaUpdate' && sender.tab.active) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (!presenceEnabled) return;

        // Respect domain filters even for media
        const urlObj = new URL(message.url);
        const cleanUrl = urlObj.hostname;
        const domainMatch = privacyBlacklist.some(domain => cleanUrl.toLowerCase().includes(domain));

        if (listMode === 'whitelist' && !domainMatch) return;
        if (listMode === 'blacklist' && domainMatch) return;

        let stateText = cleanUrl;
        let detailText = message.title;
        let startTime = null;

        if (cleanUrl.includes("youtube.com")) {
            detailText = detailText.replace(/ - YouTube$/, "").replace(/^\(\d+\)\s+/, "");
            if (message.isPlaying) {
                detailText = `[▶] ${detailText}`;
                // Calculate when the video started playing to show elapsed time
                startTime = Date.now() - (message.currentTime * 1000);
            } else {
                detailText = `[⏸] ${detailText} (Paused)`;
            }
        }

        if (customPrefix && customPrefix.trim() !== '') {
            detailText = `${customPrefix.trim()} ${detailText}`;
        }

        const activityPayload = {
            details: detailText,
            state: stateText,
        };

        if (startTime) {
            activityPayload.startTimestamp = startTime;
        }

        socket.send(JSON.stringify({
            action: "updatePresence",
            activity: activityPayload
        }));
    }
});
