const RPC = require('discord-rpc');
const WebSocket = require('ws');

// You will need to create an application in the Discord Developer Portal
// (https://discord.com/developers/applications) and paste the Client ID below.
const clientId = '1476159752235913286'; // REPLACE THIS WITH YOUR OWN DEV PORTAL CLIENT ID

// Initialize Discord RPC Client
const rpc = new RPC.Client({ transport: 'ipc' });

// Initialize WebSocket Server on port 8080
const port = 8080;
const wss = new WebSocket.Server({ port: port });

let isDiscordConnected = false;

rpc.on('ready', () => {
    console.log(`[Discord] Authed for user ${rpc.user.username}`);
    isDiscordConnected = true;
});

// Setup Discord connection retry loop
function connectToDiscord() {
    rpc.login({ clientId }).catch((err) => {
        console.error('[Discord] Failed to connect, retrying in 5s...', err.message);
        setTimeout(connectToDiscord, 5000);
    });
}
connectToDiscord();

function setActivity(tabUrl, tabTitle) {
    if (!rpc || !isDiscordConnected) {
        console.warn(`[Warning] Attempted to set activity, but Discord RPC is disconnected.`);
        return;
    }

    try {
        let stateText = tabUrl || "Browsing the Web";
        if (stateText.length > 128) {
            stateText = stateText.substring(0, 125) + '...';
        }

        let detailText = tabTitle || "Chrome OS Flex";
        if (detailText.length > 128) {
            detailText = detailText.substring(0, 125) + '...';
        }

        rpc.setActivity({
            details: detailText,
            state: stateText,
            startTimestamp: new Date(),
            largeImageKey: 'chrome', // You can upload an image named "chrome" to your Discord Dev app
            largeImageText: 'Google Chrome',
            instance: false,
        });
        console.log(`[RPC] Updated Presence: ${detailText}`);
    } catch (err) {
        console.error(`[Error] Failed to set activity:`, err);
    }
}

function clearActivity() {
    if (rpc && isDiscordConnected) {
        rpc.clearActivity().catch(console.error);
        console.log(`[RPC] Cleared Activity`);
    }
}

wss.on('connection', function connection(ws) {
    console.log('[WebSocket] Chrome Extension Connected');

    ws.on('message', function incoming(message) {
        try {
            const data = JSON.parse(message);

            if (data.action === "updatePresence") {
                setActivity(data.url, data.title);
            } else if (data.action === "clearPresence") {
                clearActivity();
            }
        } catch (e) {
            console.error('[WebSocket] Received malformed message:', message.toString());
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Extension Disconnected - Clearing Activity');
        clearActivity();
    });
});

console.log(`[Server] RDP Bridge Server started. WebSocket listening on port ${port}...`);
