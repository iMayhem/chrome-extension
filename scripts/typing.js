// typing.js - Injected to measure typing speed (WPM) without reading the actual keys

let keystrokeCount = 0;
let lastReset = Date.now();
const CALC_INTERVAL = 5000; // Calculate WPM every 5 seconds

document.addEventListener('keydown', (e) => {
    // Only count printable characters, not modifiers or navigation
    if (e.key.length === 1) {
        keystrokeCount++;
    }
});

setInterval(() => {
    const now = Date.now();
    const elapsedMinutes = (now - lastReset) / 60000;

    if (elapsedMinutes > 0 && keystrokeCount > 0) {
        // Standard WPM calculation: (Characters / 5) / Minutes
        const wpm = Math.round((keystrokeCount / 5) / elapsedMinutes);

        chrome.runtime.sendMessage({
            action: 'wpmUpdate',
            wpm: wpm
        });
    } else {
        // user stopped typing
        chrome.runtime.sendMessage({
            action: 'wpmUpdate',
            wpm: 0
        });
    }

    // Reset counter
    keystrokeCount = 0;
    lastReset = now;
}, CALC_INTERVAL);
