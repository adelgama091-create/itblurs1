// content_script.js - Main script that runs on every webpage
// Detects video elements and manages blur overlay

const INFERENCE_SIZE = 160;
let worker = null;
let config = { fullScreenBlur: false, sensitivity: 70 };

// Initialize when page loads
function init() {
  // Load config from storage
  chrome.storage.local.get(['fullScreenBlur', 'sensitivity', 'enabled'], (result) => {
    config.fullScreenBlur = result.fullScreenBlur ?? false;
    config.sensitivity = result.sensitivity ?? 70;
    
    if (result.enabled !== false) {
      startDetection();
    }
  });
}

function startDetection() {
  // Create detection worker
  const workerUrl = chrome.runtime.getURL('src/detection_worker.js');
  worker = new Worker(workerUrl);
  
  worker.onmessage = handleWorkerMessage;
  
  // Find all video elements on page
  findAndMonitorVideos();
  
  // Watch for new videos added dynamically
  const observer = new MutationObserver(() => {
    findAndMonitorVideos();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function findAndMonitorVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (!video.dataset.itblursAttached) {
      video.dataset.itblursAttached = 'true';
      setupVideoMonitoring(video);
    }
  });
}

function setupVideoMonitoring(videoEl) {
  // Create canvas overlay for blur
  const overlay = createOverlay(videoEl);
  const sharedCanvas = new OffscreenCanvas(INFERENCE_SIZE, INFERENCE_SIZE);
  const sharedCtx = sharedCanvas.getContext('2d');
  
  let animationId = null;
  
  function captureFrame() {
    if (videoEl.paused || videoEl.ended) {
      animationId = null;
      return;
    }
    
    // Downscale and capture frame
    sharedCtx.drawImage(videoEl, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
    
    createImageBitmap(sharedCanvas).then(bitmap => {
      worker.postMessage({
        type: 'ANALYZE_FRAME',
        bitmap,
        timestamp: performance.now(),
        videoId: videoEl.dataset.itblursId
      }, [bitmap]);
    });
    
    // Continue capturing
    animationId = requestAnimationFrame(captureFrame);
  }
  
  // Start when video plays
  videoEl.addEventListener('play', () => {
    if (!animationId) {
      captureFrame();
    }
  });
  
  // Handle seek events
  videoEl.addEventListener('seeked', () => {
    worker.postMessage({ type: 'FORCE_REANALYZE' });
    applyFullBlur(overlay, videoEl);
  });
  
  // Track overlay for this video
  videoEl.dataset.itblursId = Math.random().toString(36).substr(2, 9);
  videoEl.dataset.itblursOverlay = 'attached';
}

function createOverlay(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483647;
  `;
  document.body.appendChild(canvas);
  
  // Sync position
  function syncPosition() {
    const rect = videoEl.getBoundingClientRect();
    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }
  
  syncPosition();
  
  // Watch for resize
  const resizeObserver = new ResizeObserver(syncPosition);
  resizeObserver.observe(videoEl);
  
  // Watch for fullscreen
  document.addEventListener('fullscreenchange', syncPosition);
  
  return canvas;
}

function handleWorkerMessage(event) {
  const { type, decision, confidence } = event.data;
  
  if (type === 'DETECTION_RESULT') {
    const videoId = event.data.videoId;
    const video = document.querySelector(`[data-itblurs-id="${videoId}"]`);
    if (!video) return;
    
    const overlay = findOverlayForVideo(video);
    if (!overlay) return;
    
    renderBlur(overlay, video, decision, confidence);
  }
}

function findOverlayForVideo(videoEl) {
  // Simple implementation - find canvas overlay positioned over video
  const canvases = document.querySelectorAll('canvas');
  for (const canvas of canvases) {
    if (canvas.style.zIndex === '2147483647') {
      return canvas;
    }
  }
  return null;
}

function renderBlur(canvas, videoEl, decision, confidence) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (decision === 'CLEAR') return;
  
  if (config.fullScreenBlur) {
    // Full-screen blur
    const blurRadius = Math.round(20 + (confidence - 0.82) * 55);
    ctx.filter = `blur(${Math.min(blurRadius, 30)}px)`;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  } else {
    // Region blur would go here - simplified for MVP
    // For now just do light full-frame if uncertain
    ctx.filter = `blur(15px)`;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  }
}

function applyFullBlur(overlay, videoEl) {
  const ctx = overlay.getContext('2d');
  ctx.filter = 'blur(25px)';
  ctx.drawImage(videoEl, 0, 0, overlay.width, overlay.height);
  ctx.filter = 'none';
}

// Start on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
