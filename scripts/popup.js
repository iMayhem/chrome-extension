document.addEventListener('DOMContentLoaded', () => {
  const addressInput = document.getElementById('rdpAddress');
  const portInput = document.getElementById('rdpPort');
  const enableToggle = document.getElementById('enablePresence');
  const customPrefixInput = document.getElementById('customPrefix');
  const blacklistInput = document.getElementById('blacklist');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load existing settings
  chrome.storage.local.get(['rdpAddress', 'rdpPort', 'presenceEnabled', 'customPrefix', 'blacklist', 'listMode'], (result) => {
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
  });

  saveBtn.addEventListener('click', () => {
    const address = addressInput.value.trim();
    const port = portInput.value.trim() || "8081";
    const customPrefix = customPrefixInput.value.trim();
    const blacklist = blacklistInput.value.trim();
    const listMode = document.querySelector('input[name="listMode"]:checked').value;
    const enabled = enableToggle.checked;

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
      listMode: listMode
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
        listMode: listMode
      });
    });
  });
});
