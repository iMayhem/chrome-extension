document.addEventListener('DOMContentLoaded', () => {
  const addressInput = document.getElementById('rdpAddress');
  const portInput = document.getElementById('rdpPort');
  const enableToggle = document.getElementById('enablePresence');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load existing settings
  chrome.storage.local.get(['rdpAddress', 'rdpPort', 'presenceEnabled'], (result) => {
    if (result.rdpAddress) {
      addressInput.value = result.rdpAddress;
    }
    if (result.rdpPort) {
      portInput.value = result.rdpPort;
    }
    if (result.presenceEnabled !== undefined) {
      enableToggle.checked = result.presenceEnabled;
    } else {
      enableToggle.checked = true; // Default to true
    }
  });

  saveBtn.addEventListener('click', () => {
    const address = addressInput.value.trim();
    const port = portInput.value.trim() || "8080";
    const enabled = enableToggle.checked;

    if (enabled && !address) {
      statusEl.textContent = 'Please enter an RDP address!';
      statusEl.className = 'error';
      return;
    }

    chrome.storage.local.set({
      rdpAddress: address,
      rdpPort: port,
      presenceEnabled: enabled
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
        enabled: enabled
      });
    });
  });
});
