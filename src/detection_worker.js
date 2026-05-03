// detection_worker.js - AI detection runs here (separate thread)

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js');

let nsfwModel = null;
let isReady = false;

// Decision buffer for stability
class DecisionBuffer {
  constructor() {
    this.history = [];
    this.windowSize = 4;
    this.currentState = 'CLEAR';
  }

  push(rawDecision) {
    this.history.push(rawDecision);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
  }

  getStableDecision() {
    if (this.history.length < this.windowSize) {
      return this.currentState;
    }

    const blurCount = this.history.filter(d => d === 'BLUR').length;
    const clearCount = this.history.filter(d => d === 'CLEAR').length;

    // 3/4 to blur, 4/4 to clear
    if (blurCount >= 3 && this.currentState !== 'BLUR') {
      this.currentState = 'BLUR';
    } else if (clearCount >= 4 && this.currentState !== 'CLEAR') {
      this.currentState = 'CLEAR';
    }

    return this.currentState;
  }

  forceState(state) {
    this.history = [];
    this.currentState = state;
  }
}

const decisionBuffer = new DecisionBuffer();

// Load model
async function loadModel() {
  try {
    self.postMessage({ type: 'STATUS', status: 'LOADING' });
    
    // Force WebGL backend
    await tf.setBackend('webgl');
    await tf.ready();
    
    // Load NSFWJS model
    nsfwModel = await nsfwjs.load();
    
    // Warm up GPU
    const warmupCanvas = new OffscreenCanvas(160, 160);
    const ctx = warmupCanvas.getContext('2d');
    ctx.fillRect(0, 0, 160, 160);
    await nsfwModel.classify(warmupCanvas);
    
    isReady = true;
    self.postMessage({ type: 'STATUS', status: 'READY' });
  } catch (error) {
    self.postMessage({ type: 'STATUS', status: 'ERROR', error: error.message });
  }
}

// Handle messages from content script
self.onmessage = async function(event) {
  const { type, bitmap, timestamp, videoId } = event.data;
  
  if (type === 'ANALYZE_FRAME') {
    if (!isReady) {
      loadModel();
      return;
    }
    
    try {
      const predictions = await nsfwModel.classify(bitmap);
      bitmap.close();
      
      const unsafeScore = predictions
        .filter(p => ['Porn', 'Sexy', 'Hentai'].includes(p.className))
        .reduce((sum, p) => sum + p.probability, 0);
      
      // Determine decision
      let rawDecision;
      if (unsafeScore >= 0.82) {
        rawDecision = 'BLUR';
      } else if (unsafeScore < 0.55) {
        rawDecision = 'CLEAR';
      } else {
        rawDecision = 'UNCERTAIN';
      }
      
      decisionBuffer.push(rawDecision === 'UNCERTAIN' ? 'CLEAR' : rawDecision);
      const stableDecision = decisionBuffer.getStableDecision();
      
      self.postMessage({
        type: 'DETECTION_RESULT',
        decision: stableDecision,
        confidence: unsafeScore,
        timestamp,
        videoId,
        tier: 1
      });
      
    } catch (error) {
      console.error('Detection error:', error);
      self.postMessage({
        type: 'DETECTION_RESULT',
        decision: 'BLUR',
        confidence: 1,
        timestamp,
        videoId
      });
    }
  }
  
  if (type === 'FORCE_REANALYZE') {
    decisionBuffer.forceState('BLUR');
  }
};

// Auto-load model on worker start
loadModel();