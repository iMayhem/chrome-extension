let socket = null;
let rdpAddress = null;
let rdpPort = "8081";
let presenceEnabled = true;

// Initialize extension
chrome.storage.local.get(['rdpAddress', 'rdpPort', 'presenceEnabled'], (result) => {
    if (result.presenceEnabled !== undefined) {
        presenceEnabled = result.presenceEnabled;
    }
    if (result.rdpPort) {
        rdpPort = result.rdpPort;
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
    };

    socket.onclose = (event) => {
        console.log('[RDP Bridge] Disconnected:', event.code, event.reason);
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

function sendPresenceUpdate(title, url) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!presenceEnabled) return;

    const payload = {
        action: "updatePresence",
        title: title,
        url: url
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
    // Ignore chrome:// pages and other internal navigation
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Clear presence when on an internal page
            socket.send(JSON.stringify({ action: "clearPresence" }));
        }
        return;
    }

    sendPresenceUpdate(tab.title, tab.url);
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
