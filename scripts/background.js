let socket = null;
let rdpAddress = null;
let rdpPort = "8081";
let presenceEnabled = true;
let keepAliveInterval = null;
let customPrefix = "";
let privacyBlacklist = [];
let listMode = "blacklist";

let enableWpm = false;
let currentWpm = 0;

let enableTabCount = false;
let currentTabCount = 0;

let enableDetailMode = true;
let enableYouTube = true;
let enableIncognito = true;

let pomodoroEndTime = null;
let pomodoroInterval = null;

let afkEndTime = null;
let afkInterval = null;

let reconnectDelay = 5000; // Start at 5 seconds

// Initialize extension
chrome.storage.local.get([
    'rdpAddress', 'rdpPort', 'presenceEnabled', 'customPrefix', 'blacklist', 'listMode',
    'enableWpm', 'enableTabCount', 'pomodoroEndTime', 'enableYouTube', 'enableIncognito', 'afkEndTime', 'enableDetailMode'
], (result) => {
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
    if (result.enableWpm !== undefined) {
        enableWpm = result.enableWpm;
    }
    if (result.enableTabCount !== undefined) {
        enableTabCount = result.enableTabCount;
    }
    if (result.enableDetailMode !== undefined) {
        enableDetailMode = result.enableDetailMode;
    }
    if (result.enableYouTube !== undefined) {
        enableYouTube = result.enableYouTube;
    }
    if (result.enableIncognito !== undefined) {
        enableIncognito = result.enableIncognito;
    }
    if (result.pomodoroEndTime) {
        pomodoroEndTime = result.pomodoroEndTime;
        if (pomodoroEndTime > Date.now()) {
            startPomodoroTick();
        } else {
            pomodoroEndTime = null;
        }
    }
    if (result.afkEndTime) {
        afkEndTime = result.afkEndTime;
        if (afkEndTime > Date.now()) {
            startAfkTick();
        } else {
            afkEndTime = null;
        }
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
        enableWpm = message.enableWpm || false;
        enableTabCount = message.enableTabCount || false;

        if (message.enableDetailMode !== undefined) enableDetailMode = message.enableDetailMode;
        if (message.enableYouTube !== undefined) enableYouTube = message.enableYouTube;
        if (message.enableIncognito !== undefined) enableIncognito = message.enableIncognito;

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
    } else if (message.action === 'wpmUpdate') {
        if (enableWpm) {
            currentWpm = message.wpm;
            updatePresenceForActiveTab();
        }
    } else if (message.action === 'startPomodoro') {
        // 25 minutes from now
        pomodoroEndTime = Date.now() + (25 * 60 * 1000);
        chrome.storage.local.set({ pomodoroEndTime: pomodoroEndTime });
        startPomodoroTick();
        updatePresenceForActiveTab();
    } else if (message.action === 'stopPomodoro') {
        pomodoroEndTime = null;
        chrome.storage.local.set({ pomodoroEndTime: null });
        if (pomodoroInterval) clearInterval(pomodoroInterval);
        updatePresenceForActiveTab();
    } else if (message.action === 'startAfk') {
        const mins = message.minutes || 15;
        afkEndTime = Date.now() + (mins * 60 * 1000);
        chrome.storage.local.set({ afkEndTime: afkEndTime });
        startAfkTick();
        updatePresenceForActiveTab();
    } else if (message.action === 'stopAfk') {
        afkEndTime = null;
        chrome.storage.local.set({ afkEndTime: null });
        if (afkInterval) clearInterval(afkInterval);
        updatePresenceForActiveTab();
    }
    return true;
});

function startPomodoroTick() {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(() => {
        if (pomodoroEndTime && Date.now() > pomodoroEndTime) {
            // Timer finished
            pomodoroEndTime = null;
            chrome.storage.local.set({ pomodoroEndTime: null });
            clearInterval(pomodoroInterval);
            updatePresenceForActiveTab();
        } else if (pomodoroEndTime) {
            // Periodically force an update to keep the counter correct on Discord
            updatePresenceForActiveTab();
        }
    }, 60000); // Check every minute
}

function startAfkTick() {
    if (afkInterval) clearInterval(afkInterval);
    afkInterval = setInterval(() => {
        if (afkEndTime && Date.now() > afkEndTime) {
            // Timer finished
            afkEndTime = null;
            chrome.storage.local.set({ afkEndTime: null });
            clearInterval(afkInterval);
            updatePresenceForActiveTab();
        } else if (afkEndTime) {
            updatePresenceForActiveTab();
        }
    }, 60000); // Check every minute
}

function connectToRDP() {
    if (socket) return;
    if (!rdpAddress) return;

    // Use ws:// for standard local/RDP connections
    let url = `ws://${rdpAddress}:${rdpPort}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log(`[RDP Bridge] Connected to ${url}`);
        reconnectDelay = 5000; // Reset delay on successful connection
        updatePresenceForActiveTab();

        // Keep the service worker alive by pinging the server every 20 seconds
        keepAliveInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                try {
                    socket.send(JSON.stringify({ action: "ping" }));
                } catch (e) {
                    console.error("Failed to send ping:", e);
                }
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

        // Attempt reconnect with exponential backoff if still enabled
        if (presenceEnabled && rdpAddress) {
            console.log(`[RDP Bridge] Reconnecting in ${reconnectDelay / 1000} seconds...`);
            setTimeout(connectToRDP, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 1.5, 60000); // Cap at 60 seconds
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

    try {
        socket.send(JSON.stringify(payload));
    } catch (e) {
        console.error("Failed to send presence payload:", e);
    }
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
    if (enableTabCount) {
        chrome.tabs.query({}, (tabs) => {
            currentTabCount = tabs.length;
            processAndSendPresence(tab, currentTabCount);
        });
    } else {
        processAndSendPresence(tab, 0);
    }
}

function processAndSendPresence(tab, totalTabs) {
    // Check if AFK override is active
    if (afkEndTime && afkEndTime > Date.now()) {
        const remainingMinutes = Math.ceil((afkEndTime - Date.now()) / 60000);
        sendPresenceUpdate(`Away for ${remainingMinutes}m`, "💤 AFK");
        return;
    }

    // Detail Mode off - block custom statuses
    if (!enableDetailMode) {
        let title = "Active";
        if (pomodoroEndTime && pomodoroEndTime > Date.now()) {
            const remainingMinutes = Math.ceil((pomodoroEndTime - Date.now()) / 60000);
            title = `[🍅 ${remainingMinutes}m] Focused`;
        }
        sendPresenceUpdate(title, "Studying");
        return;
    }

    // Check if it's an incognito tab
    if (enableIncognito && tab && tab.incognito) {
        sendPresenceUpdate("Incognito Browsing", "Private Session");
        return;
    }

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
    if (enableYouTube && cleanUrl.includes("youtube.com") && finalTitle.endsWith(" - YouTube")) {
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

    // Append Pomodoro status if active
    if (pomodoroEndTime && pomodoroEndTime > Date.now()) {
        const remainingMinutes = Math.ceil((pomodoroEndTime - Date.now()) / 60000);
        finalTitle = `[🍅 ${remainingMinutes}m] ${finalTitle}`;
    }

    // Append WPM
    if (enableWpm && currentWpm > 0) {
        finalTitle = `${finalTitle} | ⌨️ ${currentWpm} WPM`;
    }

    // Append Tab count
    if (enableTabCount && totalTabs > 0) {
        cleanUrl = `${cleanUrl} (${totalTabs} tabs open)`;
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
        if (!presenceEnabled || !enableYouTube || !enableDetailMode) return;

        // Do not process media updates if AFK is active
        if (afkEndTime && afkEndTime > Date.now()) return;

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

            // Format seconds into H:MM:SS or M:SS
            const formatTime = (secs) => {
                if (isNaN(secs) || secs < 0) return "0:00";
                const h = Math.floor(secs / 3600);
                const m = Math.floor((secs % 3600) / 60);
                const s = Math.floor(secs % 60);
                if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                return `${m}:${s.toString().padStart(2, '0')}`;
            };

            const timeString = `[${formatTime(message.currentTime)} / ${formatTime(message.duration)}]`;

            if (message.isPlaying) {
                detailText = `[▶] ${detailText}`;
                stateText = `${stateText} ${timeString}`;
                // Calculate when the video started playing to show elapsed time
                startTime = Date.now() - (message.currentTime * 1000);
            } else {
                detailText = `[⏸] ${detailText}`;
                stateText = `${stateText} ${timeString} (Paused)`;
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

        try {
            socket.send(JSON.stringify({
                action: "updatePresence",
                activity: activityPayload
            }));
        } catch (e) {
            console.error("Failed to send media update payload:", e);
        }
    }
});
