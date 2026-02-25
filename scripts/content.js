// content.js - Injected into YouTube to detect media playback

let videoElement = null;
let updateInterval = null;

function findVideoElement() {
    return document.querySelector('video');
}

function sendMediaState() {
    if (!videoElement) return;

    // Ignore ad videos
    const isAd = document.querySelector('.ad-showing') !== null;
    if (isAd) return;

    const isPlaying = !videoElement.paused && !videoElement.ended && videoElement.readyState > 2;
    const currentTime = Math.floor(videoElement.currentTime);
    const duration = Math.floor(videoElement.duration);

    // Only send if it's a real video with duration
    if (isNaN(duration) || duration <= 0) return;

    // Send state to background script
    chrome.runtime.sendMessage({
        action: 'mediaUpdate',
        isPlaying: isPlaying,
        currentTime: currentTime,
        duration: duration,
        url: window.location.href,
        title: document.title
    });
}

function initMediaTracking() {
    videoElement = findVideoElement();

    if (videoElement) {
        // Clear existing interval just in case
        if (updateInterval) clearInterval(updateInterval);

        // Setup event listeners for instant updates
        videoElement.addEventListener('play', sendMediaState);
        videoElement.addEventListener('pause', sendMediaState);
        videoElement.addEventListener('seeked', sendMediaState);

        // Setup polling for time elapsed (Discord needs timestamps to show progress bars)
        // We'll update the background script periodically
        updateInterval = setInterval(sendMediaState, 2000);

        // Initial state send
        sendMediaState();
    } else {
        // Keep looking if not found yet (SPA navigation)
        setTimeout(initMediaTracking, 1000);
    }
}

// Start tracking when the page loads or navigates (YouTube is an SPA)
document.addEventListener('yt-navigate-finish', () => {
    if (updateInterval) clearInterval(updateInterval);
    setTimeout(initMediaTracking, 500);
});

// Initial boot
setTimeout(initMediaTracking, 1000);
