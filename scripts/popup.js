document.addEventListener('DOMContentLoaded', () => {
  const addressInput = document.getElementById('rdpAddress');
  const portInput = document.getElementById('rdpPort');
  const enableToggle = document.getElementById('enablePresence');
  const customPrefixInput = document.getElementById('customPrefix');
  const blacklistInput = document.getElementById('blacklist');

  const enableDetailModeToggle = document.getElementById('enableDetailMode');
  const enableWpmToggle = document.getElementById('enableWpm');
  const enableTabCountToggle = document.getElementById('enableTabCount');
  const enableYouTubeToggle = document.getElementById('enableYouTube');
  const enableIncognitoToggle = document.getElementById('enableIncognito');

  const startPomodoroBtn = document.getElementById('startPomodoroBtn');
  const stopPomodoroBtn = document.getElementById('stopPomodoroBtn');
  const pomodoroStatusEl = document.getElementById('pomodoroStatus');

  const afkMinutesInput = document.getElementById('afkMinutes');
  const startAfkBtn = document.getElementById('startAfkBtn');
  const stopAfkBtn = document.getElementById('stopAfkBtn');
  const afkStatusText = document.getElementById('afkStatusText');

  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load existing settings
  chrome.storage.local.get([
    'rdpAddress', 'rdpPort', 'presenceEnabled', 'customPrefix', 'blacklist', 'listMode',
    'enableWpm', 'enableTabCount', 'pomodoroEndTime', 'enableYouTube', 'enableIncognito', 'afkEndTime', 'enableDetailMode'
  ], (result) => {
    if (result.rdpAddress) {
      addressInput.value = result.rdpAddress;
    }
    if (result.rdpPort) {
      portInput.value = result.rdpPort;
    }
    if (result.customPrefix) {
      customPrefixInput.value = result.customPrefix;
    }
    if (result.blacklist) {
      blacklistInput.value = result.blacklist;
    }

    if (result.listMode === 'whitelist') {
      document.querySelector('input[name="listMode"][value="whitelist"]').checked = true;
    } else {
      document.querySelector('input[name="listMode"][value="blacklist"]').checked = true;
    }

    if (result.presenceEnabled !== undefined) {
      enableToggle.checked = result.presenceEnabled;
    } else {
      enableToggle.checked = true; // Default to true
    }

    if (result.enableDetailMode !== undefined) {
      enableDetailModeToggle.checked = result.enableDetailMode;
    } else {
      enableDetailModeToggle.checked = true; // Default to true (Show full details)
    }

    if (result.enableWpm !== undefined) {
      enableWpmToggle.checked = result.enableWpm;
    }

    if (result.enableTabCount !== undefined) {
      enableTabCountToggle.checked = result.enableTabCount;
    }

    if (result.enableYouTube !== undefined) {
      enableYouTubeToggle.checked = result.enableYouTube;
    } else {
      enableYouTubeToggle.checked = true;
    }

    if (result.enableIncognito !== undefined) {
      enableIncognitoToggle.checked = result.enableIncognito;
    } else {
      enableIncognitoToggle.checked = true;
    }

    if (result.pomodoroEndTime && result.pomodoroEndTime > Date.now()) {
      startPomodoroBtn.style.display = 'none';
      stopPomodoroBtn.style.display = 'inline-block';
      pomodoroStatusEl.textContent = "Focus session active (Check Discord for time)";
    }

    if (result.afkEndTime && result.afkEndTime > Date.now()) {
      startAfkBtn.style.display = 'none';
      stopAfkBtn.style.display = 'inline-block';
      afkStatusText.textContent = "You are marked as AFK. All other activity is hidden.";
    }
  });

  startPomodoroBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startPomodoro' });
    startPomodoroBtn.style.display = 'none';
    stopPomodoroBtn.style.display = 'inline-block';
    pomodoroStatusEl.textContent = "Focus session started!";
  });

  stopPomodoroBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopPomodoro' });
    stopPomodoroBtn.style.display = 'none';
    startPomodoroBtn.style.display = 'inline-block';
    pomodoroStatusEl.textContent = "Focus session stopped.";
  });

  startAfkBtn.addEventListener('click', () => {
    const mins = parseInt(afkMinutesInput.value) || 15;
    chrome.runtime.sendMessage({ action: 'startAfk', minutes: mins });
    startAfkBtn.style.display = 'none';
    stopAfkBtn.style.display = 'inline-block';
    afkStatusText.textContent = `You are marked as AFK for ${mins} minutes.`;
  });

  stopAfkBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopAfk' });
    stopAfkBtn.style.display = 'none';
    startAfkBtn.style.display = 'inline-block';
    afkStatusText.textContent = "AFK status cleared.";
  });

  saveBtn.addEventListener('click', () => {
    const address = addressInput.value.trim();
    const port = portInput.value.trim() || "8081";
    const customPrefix = customPrefixInput.value.trim();
    const blacklist = blacklistInput.value.trim();
    const listMode = document.querySelector('input[name="listMode"]:checked').value;
    const enabled = enableToggle.checked;
    const enableDetailMode = enableDetailModeToggle.checked;
    const enableWpm = enableWpmToggle.checked;
    const enableTabCount = enableTabCountToggle.checked;
    const enableYouTube = enableYouTubeToggle.checked;
    const enableIncognito = enableIncognitoToggle.checked;

    if (enabled && !address) {
      statusEl.textContent = 'Please enter an RDP address!';
      statusEl.className = 'error';
      return;
    }

    chrome.storage.local.set({
      rdpAddress: address,
      rdpPort: port,
      presenceEnabled: enabled,
      customPrefix: customPrefix,
      blacklist: blacklist,
      listMode: listMode,
      enableDetailMode: enableDetailMode,
      enableWpm: enableWpm,
      enableTabCount: enableTabCount,
      enableYouTube: enableYouTube,
      enableIncognito: enableIncognito
    }, () => {
      // Show success message
      statusEl.textContent = 'Settings saved!';
      statusEl.className = 'success';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);

      // Notify background script about the settings update
      chrome.runtime.sendMessage({
        action: 'settingsUpdated',
        address: address,
        port: port,
        enabled: enabled,
        customPrefix: customPrefix,
        blacklist: blacklist,
        listMode: listMode,
        enableDetailMode: enableDetailMode,
        enableWpm: enableWpm,
        enableTabCount: enableTabCount,
        enableYouTube: enableYouTube,
        enableIncognito: enableIncognito
      });
    });
  });
});
