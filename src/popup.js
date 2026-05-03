// popup.js - Controls the extension popup UI

const toggle = document.getElementById('toggle');
const regionBtn = document.getElementById('regionBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const sensitivitySlider = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');

// Load current settings
chrome.storage.local.get(['enabled', 'fullScreenBlur', 'sensitivity'], (result) => {
  const enabled = result.enabled !== false;
  const fullScreenBlur = result.fullScreenBlur || false;
  const sensitivity = result.sensitivity || 70;
  
  toggle.classList.toggle('on', enabled);
  
  if (fullScreenBlur) {
    regionBtn.classList.remove('active');
    fullscreenBtn.classList.add('active');
  }
  
  sensitivitySlider.value = sensitivity;
  sensitivityValue.textContent = `${sensitivity}%`;
});

// Toggle on/off
toggle.addEventListener('click', () => {
  const isOn = toggle.classList.toggle('on');
  chrome.storage.local.set({ enabled: isOn });
  
  // Notify content scripts
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.reload(tabs[0].id);
    }
  });
});

// Blur type buttons
regionBtn.addEventListener('click', () => {
  regionBtn.classList.add('active');
  fullscreenBtn.classList.remove('active');
  chrome.storage.local.set({ fullScreenBlur: false });
  notifyContentScript({ fullScreenBlur: false });
});

fullscreenBtn.addEventListener('click', () => {
  fullscreenBtn.classList.add('active');
  regionBtn.classList.remove('active');
  chrome.storage.local.set({ fullScreenBlur: true });
  notifyContentScript({ fullScreenBlur: true });
});

// Sensitivity slider
sensitivitySlider.addEventListener('input', (e) => {
  const value = e.target.value;
  sensitivityValue.textContent = `${value}%`;
  chrome.storage.local.set({ sensitivity: parseInt(value) });
  notifyContentScript({ sensitivity: parseInt(value) });
});

function notifyContentScript(config) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'CONFIG_UPDATE',
        ...config
      });
    }
  });
}
