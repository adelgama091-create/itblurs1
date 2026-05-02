// Minimal background script for Manifest V3
// This file is required by manifest.json but can remain empty for now
// Future: could handle extension installation, updates, or global settings

chrome.runtime.onInstalled.addListener(() => {
  console.log('itblurs extension installed');
  
  // Set default configuration
  chrome.storage.local.set({
    fullScreenBlur: false,  // Region-only blur by default
    sensitivity: 70,        // Default sensitivity (70% = 0.55 threshold)
    enabled: true
  });
});
