const RPC = require('discord-rpc');
const WebSocket = require('ws');

// You will need to create an application in the Discord Developer Portal
// (https://discord.com/developers/applications) and paste the Client ID below.
const clientId = '1476159752235913286'; // REPLACE THIS WITH YOUR OWN DEV PORTAL CLIENT ID

console.log('==============================================');
console.log('      Discord RDP Bridge Started (DEBUG)      ');
console.log('==============================================');
console.log(`[INIT] Client ID configured: ${clientId}`);

// Initialize Discord RPC Client
console.log(`[INIT] Creating Discord RPC Client...`);
const rpc = new RPC.Client({ transport: 'ipc' });

// Initialize WebSocket Server on port 8081
const port = 8081;
console.log(`[INIT] Creating WebSocket Server on port ${port}...`);
const wss = new WebSocket.Server({ port: port });

let isDiscordConnected = false;

rpc.on('ready', () => {
    console.log(`\n[DISCORD SUCCESS] Successfully authenticated for user: ${rpc.user.username}`);
    isDiscordConnected = true;
});

// Setup Discord connection retry loop
function connectToDiscord() {
    console.log(`[DISCORD] Attempting to connect to local Discord client...`);
    rpc.login({ clientId }).catch((err) => {
        console.error(`[DISCORD ERROR] Failed to connect: ${err.message}`);
        console.log(`[DISCORD] Retrying connection in 5 seconds...`);
        setTimeout(connectToDiscord, 5000);
    });
}
connectToDiscord();

function setActivity(tabUrl, tabTitle) {
    console.log(`\n[ACTIVITY REQUEST] Received request to set activity.`);
    console.log(`   --> URL: ${tabUrl}`);
    console.log(`   --> Title: ${tabTitle}`);

    if (!rpc || !isDiscordConnected) {
        console.warn(`[ACTIVITY WARNING] Cannot set activity because Discord RPC is disconnected.`);
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

        console.log(`[ACTIVITY] Sending payload to Discord...`);
        rpc.setActivity({
            details: detailText,
            state: stateText,
            startTimestamp: new Date(),
            largeImageKey: 'chrome', // You can upload an image named "chrome" to your Discord Dev app
            largeImageText: 'Google Chrome',
            instance: false,
        }).then(() => {
            console.log(`[ACTIVITY SUCCESS] Presence updated to: ${detailText}`);
        }).catch(err => {
            console.error(`[ACTIVITY ERROR] Failed to set activity internally:`, err);
        });

    } catch (err) {
        console.error(`[ACTIVITY ERROR] Exception caught while setting activity:`, err);
    }
}

function clearActivity() {
    console.log(`\n[ACTIVITY CLEAR] Request received to clear activity.`);
    if (rpc && isDiscordConnected) {
        rpc.clearActivity().then(() => {
            console.log(`[ACTIVITY SUCCESS] Cleared Activity`);
        }).catch(err => {
            console.error(`[ACTIVITY ERROR] Failed to clear activity:`, err);
        });
    } else {
        console.log(`[ACTIVITY CLEAR] Discord disconnected, ignoring clear request.`);
    }
}

wss.on('connection', function connection(ws, req) {
    // Basic IP logging to see if connections reach
    const ip = req._socket ? req._socket.remoteAddress : "Unknown IP";
    console.log(`\n[WEBSOCKET] New connection established from: ${ip}`);

    ws.on('message', function incoming(message) {
        console.log(`[WEBSOCKET DATA] Received raw message: ${message.toString()}`);
        try {
            const data = JSON.parse(message);
            console.log(`[WEBSOCKET JSON] Parsed action: ${data.action}`);

            if (data.action === "updatePresence") {
                setActivity(data.url, data.title);
            } else if (data.action === "clearPresence") {
                clearActivity();
            } else {
                console.log(`[WEBSOCKET] Unknown action received: ${data.action}`);
            }
        } catch (e) {
            console.error('[WEBSOCKET ERROR] Received malformed JSON message:', message.toString());
        }
    });

    ws.on('close', () => {
        console.log(`\n[WEBSOCKET] Connection closed from: ${ip}`);
        clearActivity();
    });

    ws.on('error', (err) => {
        console.error(`\n[WEBSOCKET ERROR] Connection error from ${ip}:`, err);
    });
});

console.log(`\n[SERVER READY] RDP Bridge Server is actively listening on port ${port}...`);
