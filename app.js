/* ============================================================
   Orthobitto — Main Application Script
   Author: Omar Mohammad Chowdhury
   ============================================================ */

'use strict';

// ============================================================
// GLOBAL STATE
// ============================================================
const AppState = {
  currentImage: null,
  imageDataURL: null,
  rotation: 0,
  brightness: 20,
  contrast: 30,
  ocrText: '',
  translatedSentences: [], // [{en, bn}]
  vocabularyItems: [],     // [{word, meaning}]
  isScanning: false,
  isTranslating: false,
  cameraStream: null,
  torchTrack: null,
  torchOn: false,
  facingMode: 'environment',
  isOnline: navigator.onLine,
  mobileActiveTab: 'scanner',
  pdfExportMode: 'sentences',
};

// Public read/write bridge for the modular enhancement layer.
window.OrthobittoAppState = AppState;

// ============================================================
// DOM ELEMENT CACHE
// ============================================================
const $ = id => document.getElementById(id);
const $q = sel => document.querySelector(sel);

const Elements = {
  // Scanner
  dropzone: $('dropzone'),
  dropzoneContent: $('dropzone-content'),
  imagePreviewWrap: $('image-preview-wrap'),
  previewImg: $('preview-img'),
  scanWaveContainer: $('scan-wave-container'),
  removeImageBtn: $('remove-image-btn'),
  fileInput: $('file-input'),
  cameraWrap: $('camera-wrap'),
  cameraVideo: $('camera-video'),
  torchBtn: $('torch-btn'),
  cameraSwitchBtn: $('camera-switch-btn'),
  cameraBtn: $('camera-btn'),
  imageControls: $('image-controls'),
  scanActionRow: $('scan-action-row'),
  scanBtn: $('scan-btn'),
  // OCR
  ocrCard: $('ocr-card'),
  ocrEditor: $('ocr-text-editor'),
  charCount: $('char-count'),
  wordCount: $('word-count'),
  // Progress
  progressSteps: $('progress-steps'),
  progressLabel: $('progress-label'),
  progressPct: $('progress-pct'),
  progressBarFill: $('progress-bar-fill'),
  // Results
  emptyStateRight: $('empty-state-right'),
  translationCard: $('translation-card'),
  translationBody: $('translation-body'),
  vocabCard: $('vocab-card'),
  vocabTbody: $('vocab-tbody'),
  vocabCountBadge: $('vocab-count-badge'),
  // UI
  processingCanvas: $('processing-canvas'),
  onlineIndicator: $('online-indicator'),
  // Mobile
  panelScanner: $('panel-scanner'),
  panelResults: $('panel-results'),
  navSentenceBadge: $('nav-sentence-badge'),
  navVocabBadge: $('nav-vocab-badge'),
};

// ============================================================
// PERFORMANCE: REUSABLE OCR WORKER + TRANSLATION MEMORY
// ============================================================
let ocrWorkerPromise = null;
let ocrWorkerReady = false;
const TRANSLATION_CACHE_KEY = 'orthobitto-translation-memory-v1';
const translationMemory = new Map();
const TRANSLATION_MEMORY_MAX = 300;
let translationMemoryLoaded = false;
let translationMemorySaveTimer = null;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function loadTranslationMemory() {
  if (translationMemoryLoaded) return;
  translationMemoryLoaded = true;
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== 'object') return;
    for (const [key, value] of Object.entries(saved)) {
      if (typeof value === 'string' && value) translationMemory.set(key, value);
    }
  } catch (_) {}
}

function saveTranslationMemory() {
  try {
    const entries = [...translationMemory.entries()].slice(-TRANSLATION_MEMORY_MAX);
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (_) {}
}

function queueTranslationMemorySave() {
  if (translationMemorySaveTimer) clearTimeout(translationMemorySaveTimer);
  translationMemorySaveTimer = setTimeout(() => {
    translationMemorySaveTimer = null;
    saveTranslationMemory();
  }, 350);
}

function getCachedTranslation(text) {
  loadTranslationMemory();
  return translationMemory.get(String(text || '').normalize('NFKC').trim()) || null;
}

function rememberTranslation(text, translation) {
  loadTranslationMemory();
  translationMemory.set(String(text || '').normalize('NFKC').trim(), translation);
  while (translationMemory.size > TRANSLATION_MEMORY_MAX) {
    const oldest = translationMemory.keys().next().value;
    translationMemory.delete(oldest);
  }
  queueTranslationMemorySave();
}

async function getOCRWorker(logger = null) {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker('eng', 1, {
      logger: message => {
        if (typeof logger === 'function') logger(message);
      }
    }).then(worker => {
      ocrWorkerReady = true;
      return worker;
    }).catch(error => {
      ocrWorkerPromise = null;
      ocrWorkerReady = false;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

// Warm the OCR engine during idle time so the first scan does not pay the
// full worker/language initialization cost. This yields to initial UI work.
function warmOCRWorker() {
  if (!window.Tesseract) return;
  const warm = () => getOCRWorker().catch(() => {});
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 6000 });
  } else {
    window.setTimeout(warm, 3000);
  }
}

window.addEventListener('load', warmOCRWorker, { once: true });
window.addEventListener('pagehide', () => {
  if (ocrWorkerPromise) {
    ocrWorkerPromise.then(worker => worker.terminate()).catch(() => {});
    ocrWorkerPromise = null;
    ocrWorkerReady = false;
  }
}, { once: true });

// Word classes are provided by src/config/word-classes.js
const STOPWORDS = window.OrthobittoWordClasses.STOPWORDS;
const FUNCTION_WORDS = window.OrthobittoWordClasses.FUNCTION_WORDS;

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=4.0.3', { updateViaCache: 'none' })
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// Preload local dictionary before user translation actions.
OrthobittoDictionary.ready();

// ============================================================
// THEME MANAGEMENT
// ============================================================
function initTheme() {
  // Enhanced theme controller is initialized by orthobitto-enhancements.js.
  if (typeof window.OrthobittoTheme?.init === 'function') {
    window.OrthobittoTheme.init();
    return;
  }
  const saved = localStorage.getItem('orthobitto-theme-preference-v2') || 'system';
  const resolved = saved === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : saved;
  document.documentElement.dataset.theme = resolved;
}


// ============================================================
// ONLINE/OFFLINE STATUS
// ============================================================
function updateOnlineStatus() {
  AppState.isOnline = navigator.onLine;
  const el = Elements.onlineIndicator;
  const label = el.querySelector('.status-label');
  if (AppState.isOnline) {
    el.classList.remove('offline');
    el.classList.add('online');
    if (label) label.textContent = 'Online';
    el.title = 'Online';
  } else {
    el.classList.remove('online');
    el.classList.add('offline');
    if (label) label.textContent = 'Offline';
    el.title = 'Offline';
    showToast('Offline Mode', 'Switched to local translation fallback.', 'warning');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ============================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================
const toastIcons = {
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function showToast(title, message = '', type = 'info', duration = 4000) {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${toastIcons[type] || toastIcons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="removeToast(this.parentElement)" aria-label="Close notification">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  container.appendChild(toast);
  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }
  return toast;
}

function removeToast(toast) {
  if (!toast || !toast.parentElement) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 280);
}

// ============================================================
// PERFORMANCE: LAZY PDF ENGINE + OPTIONAL PDF FONTS
// ============================================================
let pdfEnginePromise = null;
let pdfFontsPromise = null;

function loadPdfEngine() {
  if (window.OrthobittoPDF) return Promise.resolve(window.OrthobittoPDF);
  if (pdfEnginePromise) return pdfEnginePromise;
  pdfEnginePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-orthobitto-pdf-engine]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.OrthobittoPDF), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load PDF engine.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'pdf-generator.js?v=4.1.2';
    script.async = true;
    script.dataset.orthobittoPdfEngine = 'true';
    script.onload = () => window.OrthobittoPDF ? resolve(window.OrthobittoPDF) : reject(new Error('PDF engine did not initialize.'));
    script.onerror = () => reject(new Error('Could not load PDF engine.'));
    document.head.appendChild(script);
  }).catch(err => { pdfEnginePromise = null; throw err; });
  return pdfEnginePromise;
}

function loadPdfFonts() {
  if (pdfFontsPromise) return pdfFontsPromise;
  pdfFontsPromise = new Promise(resolve => {
    if (document.querySelector('link[data-orthobitto-pdf-fonts]')) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Atma:wght@400;500;600;700&family=Caveat:wght@400;600;700&family=Galada&family=Indie+Flower&family=Mina:wght@400;700&family=Noto+Sans+Bengali:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
    link.dataset.orthobittoPdfFonts = 'true';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return pdfFontsPromise;
}

// ============================================================
// MODAL MANAGEMENT
// ============================================================
function closeBlurModal() {
  $('blur-modal').hidden = true;
}
function showBlurModal() {
  $('blur-modal').hidden = false;
}
function openPDFSettings(mode = 'sentences') {
  loadPdfFonts();
  AppState.pdfExportMode = mode;
  if (mode === 'sentences' && !AppState.translatedSentences.length) {
    showToast('No Sentences Yet', 'Please scan and translate text first.', 'warning');
    return;
  }
  if (mode === 'vocab' && !AppState.vocabularyItems.length) {
    showToast('No Vocabulary Yet', 'Please translate text first to build the vocabulary list.', 'warning');
    return;
  }

  const title = $('pdf-modal-title');
  const note = $('pdf-export-mode-note');
  const button = $('pdf-generate-btn');
  if (mode === 'vocab') {
    title.textContent = 'Export Vocabulary PDF';
    note.textContent = 'Vocabulary-only PDF: English words in handwriting style with clean Bengali meanings.';
    button.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg> Download Vocabulary PDF`;
  } else {
    title.textContent = 'Export Sentence PDF';
    note.textContent = 'Sentence-only PDF: English sentence plus Bengali translation, with a protected footer area.';
    button.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg> Download Sentence PDF`;
  }
  $('pdf-modal').hidden = false;
}
function closePDFModal() {
  $('pdf-modal').hidden = true;
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.hidden = true;
    }
  });
});

// ============================================================
// HISTORY DRAWER
// ============================================================
function openHistoryDrawer() {
  $('history-drawer').hidden = false;
  renderHistoryList();
}
function closeHistoryDrawer() {
  $('history-drawer').hidden = true;
}
$('history-drawer').addEventListener('click', e => {
  if (e.target === $('history-drawer')) closeHistoryDrawer();
});

// ============================================================
// MOBILE TAB NAVIGATION
// ============================================================
function switchMobileTab(tabName, btn) {
  AppState.mobileActiveTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('mobile-active'));

  if (tabName === 'scanner') {
    Elements.panelScanner.classList.add('mobile-active');
    return;
  }

  if (tabName === 'sentences') {
    Elements.panelResults.classList.add('mobile-active');
    Elements.emptyStateRight.hidden = AppState.translatedSentences.length > 0;
    Elements.translationCard.hidden = AppState.translatedSentences.length === 0;
    Elements.vocabCard.hidden = true;
    if (AppState.translatedSentences.length) ensureSentenceResultsVisible();
    return;
  }

  if (tabName === 'vocabulary') {
    Elements.panelResults.classList.add('mobile-active');
    Elements.emptyStateRight.hidden = true;
    Elements.translationCard.hidden = true;
    Elements.vocabCard.hidden = false;
    if (!AppState.vocabularyItems.length && Elements.vocabTbody) {
      Elements.vocabTbody.innerHTML = '<tr class="vocab-empty-row"><td colspan="4">Scan and extract text first. Approved words will appear here.</td></tr>';
    }
    return;
  }
}

function activateMobileTab(tabName) {
  const btn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (btn) switchMobileTab(tabName, btn);
}

function initMobilePanels() {
  if (window.innerWidth <= 767) {
    activateMobileTab(AppState.mobileActiveTab || 'scanner');
  } else {
    Elements.panelScanner.classList.remove('mobile-active');
    Elements.panelResults.classList.remove('mobile-active');
  }
}
window.addEventListener('resize', initMobilePanels);

// ============================================================
// FILE INPUT & DRAG-DROP
// ============================================================
function triggerFileInput() {
  Elements.fileInput.click();
}

function handleDragOver(e) {
  e.preventDefault();
  Elements.dropzone.classList.add('drag-over');
}
function handleDragLeave(e) {
  Elements.dropzone.classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  Elements.dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    processImageFile(file);
  } else {
    showToast('Invalid File', 'Please drop an image file (JPG, PNG, WEBP).', 'error');
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processImageFile(file);
}

function processImageFile(file) {
  if (file.size > 20 * 1024 * 1024) {
    showToast('File Too Large', 'Maximum file size is 20MB.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const dataURL = ev.target.result;
    AppState.imageDataURL = dataURL;
    AppState.currentImage = file;
    AppState.rotation = 0;
    resetSliders();
    showImagePreview(dataURL);
    checkBlurriness(dataURL);
    autoApplyCamScannerFilter();
  };
  reader.readAsDataURL(file);
}

function showImagePreview(dataURL) {
  stopCamera();
  Elements.dropzoneContent.hidden = true;
  Elements.cameraWrap.hidden = true;
  Elements.imagePreviewWrap.hidden = false;
  Elements.previewImg.src = dataURL;
  Elements.imageControls.hidden = false;
  Elements.scanActionRow.hidden = false;
  Elements.torchBtn.hidden = true;
  Elements.cameraSwitchBtn.hidden = true;
  Elements.cameraBtn.style.display = '';
}

function removeImage(e) {
  e.stopPropagation();
  AppState.currentImage = null;
  AppState.imageDataURL = null;
  AppState.rotation = 0;
  Elements.imagePreviewWrap.hidden = true;
  Elements.dropzoneContent.hidden = false;
  Elements.imageControls.hidden = true;
  Elements.scanActionRow.hidden = true;
  Elements.scanWaveContainer.hidden = true;
  Elements.fileInput.value = '';
  hideProgress();
  showToast('Image Removed', 'Upload another image to continue.', 'info', 2500);
}

// ============================================================
// CAMSCANNER AUTO-FILTER
// ============================================================
function autoApplyCamScannerFilter() {
  const sliderB = $('brightness-slider');
  const sliderC = $('contrast-slider');
  sliderB.value = 20;
  sliderC.value = 30;
  $('brightness-val').textContent = 20;
  $('contrast-val').textContent = 30;
  AppState.brightness = 20;
  AppState.contrast = 30;
  applyFilters();
}

function resetSliders() {
  $('brightness-slider').value = 0;
  $('contrast-slider').value = 0;
  $('brightness-val').textContent = 0;
  $('contrast-val').textContent = 0;
}

function applyFilters() {
  const b = parseInt($('brightness-slider').value);
  const c = parseInt($('contrast-slider').value);
  $('brightness-val').textContent = b;
  $('contrast-val').textContent = c;
  AppState.brightness = b;
  AppState.contrast = c;

  const brightnessVal = 1 + b / 100;
  const contrastVal = 1 + c / 100;
  Elements.previewImg.style.filter = `brightness(${brightnessVal}) contrast(${contrastVal}) saturate(0.9)`;
}

function rotateImage(degrees) {
  AppState.rotation = (AppState.rotation + degrees) % 360;
  Elements.previewImg.style.transform = `rotate(${AppState.rotation}deg)`;
}

function resetFilters() {
  AppState.rotation = 0;
  AppState.brightness = 0;
  AppState.contrast = 0;
  $('brightness-slider').value = 0;
  $('contrast-slider').value = 0;
  $('brightness-val').textContent = 0;
  $('contrast-val').textContent = 0;
  Elements.previewImg.style.filter = '';
  Elements.previewImg.style.transform = '';
}

// ============================================================
// BLUR DETECTION
// ============================================================
function checkBlurriness(dataURL) {
  const img = new Image();
  img.onload = () => {
    const canvas = Elements.processingCanvas;
    const ctx = canvas.getContext('2d');
    const w = Math.min(img.naturalWidth, 400);
    const h = Math.min(img.naturalHeight, 300);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const blurScore = laplacianVariance(imageData, w, h);
    if (blurScore < 80) {
      showBlurModal();
    }
  };
  img.src = dataURL;
}

function laplacianVariance(imageData, w, h) {
  const data = imageData.data;
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const kernel = [0,-1,0,-1,4,-1,0,-1,0];
  let sum = 0, sum2 = 0, count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let lap = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          lap += gray[(y + ky) * w + (x + kx)] * kernel[ki++];
        }
      }
      sum += lap;
      sum2 += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  const variance = sum2 / count - mean * mean;
  return variance;
}

// ============================================================
// CAMERA ACCESS
// ============================================================
async function startCamera() {
  if (!window.isSecureContext) {
    showToast('Camera Requires HTTPS', 'Open the Vercel HTTPS address, then allow camera access.', 'error', 4000);
    triggerFileInput();
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    showToast('Camera Not Available', 'This browser cannot access the camera. Choose an image instead.', 'warning', 4000);
    triggerFileInput();
    return;
  }

  const primaryConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: AppState.facingMode },
      width: { ideal: IS_IOS ? 1280 : 1920 },
      height: { ideal: IS_IOS ? 720 : 1080 }
    }
  };

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (firstError) {
    console.warn('[Camera] Primary constraints failed:', firstError);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      });
    } catch (fallbackError) {
      console.error('[Camera] Fallback failed:', fallbackError);
      const name = fallbackError?.name || firstError?.name || 'UnknownError';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showToast('Camera Permission Needed', 'Allow Camera access for this website in Safari Settings, or upload a photo.', 'error', 5000);
      } else {
        showToast('Camera Unavailable', 'You can still upload a photo from your device.', 'warning', 4500);
      }
      triggerFileInput();
      return;
    }
  }

  try {
    AppState.cameraStream = stream;
    const video = Elements.cameraVideo;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;

    Elements.dropzoneContent.hidden = true;
    Elements.imagePreviewWrap.hidden = true;
    Elements.cameraWrap.hidden = false;
    Elements.cameraBtn.style.display = 'none';
    Elements.imageControls.hidden = true;
    Elements.scanActionRow.hidden = true;

    // Safari/iOS can require an explicit play() after assigning the MediaStream.
    try { await video.play(); } catch (playError) { console.warn('[Camera] Explicit play() failed:', playError); }

    // Only expose torch when the current track actually supports it.
    const track = stream.getVideoTracks()[0];
    const caps = track?.getCapabilities ? track.getCapabilities() : {};
    Elements.torchBtn.hidden = !caps?.torch;
    Elements.cameraSwitchBtn.hidden = false;

    showToast('Camera Active', 'Tap the capture button to take a photo.', 'info', 3000);
  } catch (error) {
    stream?.getTracks()?.forEach(track => track.stop());
    AppState.cameraStream = null;
    console.error('[Camera] Stream setup failed:', error);
    showToast('Camera Setup Failed', 'Upload a photo instead.', 'warning', 4000);
    triggerFileInput();
  }
}
function stopCamera() {
  if (AppState.cameraStream) {
    AppState.cameraStream.getTracks().forEach(t => t.stop());
    AppState.cameraStream = null;
    AppState.torchTrack = null;
    AppState.torchOn = false;
  }
  Elements.cameraWrap.hidden = true;
  Elements.torchBtn.hidden = true;
  Elements.cameraSwitchBtn.hidden = true;
  Elements.cameraBtn.style.display = '';
  if (!AppState.imageDataURL) {
    Elements.dropzoneContent.hidden = false;
  }
}

async function toggleTorch() {
  if (!AppState.cameraStream) return;
  const tracks = AppState.cameraStream.getVideoTracks();
  if (!tracks.length) return;
  const track = tracks[0];
  const caps = track.getCapabilities();
  if (!caps || !caps.torch) {
    showToast('Torch Unavailable', 'This device does not support torch control.', 'warning');
    return;
  }
  AppState.torchOn = !AppState.torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: AppState.torchOn }] });
    Elements.torchBtn.style.color = AppState.torchOn ? 'var(--brand-warning)' : '';
    showToast(AppState.torchOn ? 'Torch On' : 'Torch Off', '', 'info', 1500);
  } catch (e) {
    showToast('Torch Error', 'Could not toggle torch.', 'error');
  }
}

async function switchCamera() {
  stopCamera();
  AppState.facingMode = AppState.facingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
}

function capturePhoto() {
  const video = Elements.cameraVideo;
  const canvas = Elements.processingCanvas;
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataURL = canvas.toDataURL('image/jpeg', 0.92);
  AppState.imageDataURL = dataURL;
  AppState.currentImage = { name: `scan_${Date.now()}.jpg`, type: 'image/jpeg' };
  AppState.rotation = 0;
  stopCamera();
  showImagePreview(dataURL);
  checkBlurriness(dataURL);
  autoApplyCamScannerFilter();
  showToast('Photo Captured', 'Ready to scan and extract text.', 'success', 2500);
}

// ============================================================
// OCR — TESSERACT.JS
// ============================================================
async function startOCR() {
  if (!AppState.imageDataURL) {
    showToast('No Image', 'Please upload or capture an image first.', 'warning');
    return;
  }
  if (AppState.isScanning) return;
  AppState.isScanning = true;

  Elements.scanBtn.disabled = true;
  Elements.scanBtn.innerHTML = `
    <div class="loading-dots"><span></span><span></span><span></span></div>
    Scanning...
  `;
  Elements.scanWaveContainer.hidden = false;
  Elements.progressSteps.hidden = false;
  setProgress(0, ocrWorkerReady ? 'Starting OCR...' : 'Initializing OCR Engine...');
  resetSteps();

  try {
    const processedDataURL = await getProcessedImageDataURL();
    setStep('scan', 'active');
    setProgress(10, 'Scanning Image...');

    const worker = await getOCRWorker(message => {
      if (message?.status === 'recognizing text') {
        const pct = Math.round(10 + message.progress * 70);
        setProgress(pct, 'Extracting Text...');
      }
    });

    const result = await worker.recognize(processedDataURL);

    setStep('scan', 'done');
    setStep('filter', 'active');
    setProgress(82, 'Filtering & Cleaning Text...');

    let text = result.data.text.trim();
    text = cleanOCRText(text);

    setStep('filter', 'done');
    setProgress(90, 'Preparing Editor...');

    AppState.ocrText = text;
    showOCREditor(text);
    // Build the approved local vocabulary immediately in the background so the
    // mobile Words tab has content as soon as OCR finishes.
    buildVocabulary(text).catch(error => console.warn('[Vocabulary] Background build after OCR failed:', error));
    setProgress(100, 'Text Extracted Successfully!');
    hideProgress();

    showToast('OCR Complete', `Extracted ${text.split(/\s+/).filter(Boolean).length} words. Tap Translate for sentence results.`, 'success', 3000);

  } catch (err) {
    console.error('[OCR]', err);
    setProgress(0, 'OCR Failed');
    showToast('OCR Failed', 'Could not extract text. Try a clearer image.', 'error');
    hideProgress();
  } finally {
    AppState.isScanning = false;
    Elements.scanWaveContainer.hidden = true;
    Elements.scanBtn.disabled = false;
    Elements.scanBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="4 7 4 4 20 4 20 7"></polyline>
        <line x1="9" y1="20" x2="15" y2="20"></line>
        <line x1="12" y1="4" x2="12" y2="20"></line>
      </svg>
      Scan &amp; Extract Text
    `;
  }
}

async function getProcessedImageDataURL() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = Elements.processingCanvas;
        const ctx = canvas.getContext('2d', { alpha: false });
        // Extremely large phone photos waste OCR time/memory without improving
        // recognition proportionally. Keep the long side in a practical OCR range.
        const MAX_OCR_DIMENSION = IS_IOS ? 2300 : 2600;
        const scale = Math.min(1, MAX_OCR_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        canvas.width = width;
        canvas.height = height;
        ctx.save();
        if (AppState.rotation !== 0) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((AppState.rotation * Math.PI) / 180);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }
        ctx.filter = `brightness(${1 + AppState.brightness / 100}) contrast(${1 + AppState.contrast / 100}) saturate(0.9)`;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.restore();
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Could not decode the image for OCR.'));
    img.src = AppState.imageDataURL;
  });
}

function cleanOCRText(text) {
  return String(text || '')
    .normalize('NFKC')
    // Remove control characters, but preserve Unicode punctuation and Bengali glyphs.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Normalize dash/quote variants without deleting punctuation.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '—')
    // Remove common question-paper / MCQ markers at the start of lines.
    .replace(/^\s*(?:[A-Z]\.|[a-z]\)|\d+[.)])\s+/gm, '')
    // Never create a space before punctuation marks.
    .replace(/[ \t]+([,.;:!?%])/g, '$1')
    .replace(/[ \t]+([।॥])/g, '$1')
    // Avoid spaces just inside brackets.
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    // Collapse repeated horizontal whitespace only.
    .replace(/[ \t]{2,}/g, ' ')
    // Keep paragraph structure, but normalize excessive blank lines.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

function showOCREditor(text) {
  Elements.ocrCard.hidden = false;
  Elements.ocrEditor.value = text;
  updateEditorStats(text);
}

Elements.ocrEditor.addEventListener('input', function() {
  AppState.ocrText = this.value;
  updateEditorStats(this.value);
});

function updateEditorStats(text) {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  Elements.charCount.textContent = `${chars.toLocaleString()} characters`;
  Elements.wordCount.textContent = `${words.toLocaleString()} words`;
}

function copyOcrText() {
  const text = Elements.ocrEditor.value;
  if (!text.trim()) { showToast('Nothing to Copy', '', 'warning', 2000); return; }
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied!', 'OCR text copied to clipboard.', 'success', 2000);
  });
}

// ============================================================
// PROGRESS CONTROLS
// ============================================================
function setProgress(pct, label) {
  Elements.progressBarFill.style.width = `${pct}%`;
  Elements.progressLabel.textContent = label;
  Elements.progressPct.textContent = `${pct}%`;
}

function resetSteps() {
  ['step-scan','step-filter','step-translate','step-vocab'].forEach(id => {
    const el = $(id);
    el.classList.remove('active', 'done');
  });
}

function setStep(name, state) {
  const el = $(`step-${name}`);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}

function hideProgress() {
  setTimeout(() => {
    Elements.progressSteps.hidden = true;
    resetSteps();
    setProgress(0, 'Initializing...');
  }, 800);
}

// ============================================================
// TRANSLATION ENGINE
// ============================================================
async function startTranslation() {
  const text = Elements.ocrEditor.value.trim();
  if (!text) {
    showToast('No Text', 'Please scan an image to extract text first.', 'warning');
    return;
  }
  if (AppState.isTranslating) return;
  AppState.isTranslating = true;

  const translateBtn = $('translate-btn');
  translateBtn.disabled = true;
  translateBtn.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div> Translating...`;

  Elements.progressSteps.hidden = false;
  resetSteps();
  setStep('translate', 'active');
  setProgress(5, 'Starting Translation...');

  Elements.emptyStateRight.hidden = true;
  Elements.translationCard.hidden = false;
  Elements.translationBody.innerHTML = '';
  AppState.translatedSentences = [];

  const sentences = splitIntoSentences(text);
  const total = sentences.length;
  if (!total) {
    AppState.isTranslating = false;
    translateBtn.disabled = false;
    return;
  }

  setProgress(10, `Translating ${total} sentences...`);

  // Render every complete English sentence immediately. Sentence visibility must
  // never depend on a translation API response.
  const blocks = sentences.map((sentence, index) => createSentenceBlock(sentence.trim(), index));
  const fragment = document.createDocumentFragment();
  blocks.forEach(block => fragment.appendChild(block));
  Elements.translationBody.appendChild(fragment);

  // Use a small concurrency window: substantially faster on normal networks,
  // while avoiding a flood of requests against free translation endpoints.
  const concurrency = IS_IOS ? Math.min(2, total) : Math.min(3, total);
  const translations = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function translationWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;
      const sentence = sentences[index].trim();
      try {
        translations[index] = await translateText(sentence);
      } catch (error) {
        console.warn('[Sentence Translation] Failed:', error);
        translations[index] = offlineFallbackTranslation(sentence);
      }
      updateSentenceTranslation(index, translations[index]);
      completed += 1;
      const pct = Math.round(10 + (completed / total) * 70);
      setProgress(pct, `Translating ${completed} of ${total}...`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, translationWorker));

  AppState.translatedSentences = sentences.map((sentence, index) => ({
    en: normalizeOCRSentence(sentence),
    bn: normalizeOCRSentence(translations[index] || '') || offlineFallbackTranslation(sentence)
  }));

  // Final, deterministic render: never leave loading/skeleton rows behind.
  // This also guarantees every complete English sentence is paired with a
  // complete Bengali result before the UI moves on to vocabulary.
  renderTranslationResults(AppState.translatedSentences);

  setStep('translate', 'done');
  setStep('vocab', 'active');
  setProgress(85, 'Building Vocabulary...');

  // Vocabulary is non-blocking: UI/rendering or dictionary issues must never
  // prevent the overall translation flow from reaching 100%.
  try {
    await buildVocabulary(text);
  } catch (error) {
    console.error('[Vocabulary] Non-blocking UI error:', error);
    showToast('Vocabulary Partially Completed', 'Translation is complete. Some vocabulary UI details could not be refreshed.', 'warning', 3500);
  } finally {
    // Never finish a translation run with a blank result panel.
    ensureSentenceResultsVisible();
    setStep('vocab', 'done');
    setProgress(100, 'Complete!');
  }

  try {
    saveToHistory(text, AppState.translatedSentences, AppState.vocabularyItems);
  } catch (error) {
    console.warn('[History] Save skipped:', error);
  }

  hideProgress();
  AppState.isTranslating = false;
  translateBtn.disabled = false;
  translateBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>
    Translate
  `;

  updateMobileBadges();
  if (window.innerWidth <= 767) activateMobileTab('sentences');
  showToast('Translation Complete', `${AppState.translatedSentences.length} sentences translated.`, 'success');
}

function normalizeOCRSentence(text) {
  let value = String(text || '').normalize('NFKC');
  value = value.replace(/\u00A0/g, ' ');
  value = value.replace(/[\t\r\n]+/g, ' ');
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, '');
  value = value.replace(/([.!?]){2,}/g, '$1');
  value = value.replace(/[,;:]{2,}/g, ',');
  value = value.replace(/\s+([,.;:!?])/g, '$1');
  value = value.replace(/([,;:!?])(?=[A-Za-z])/g, '$1 ');
  value = value.replace(/\s{2,}/g, ' ').trim();
  value = value.replace(/^[^A-Za-z0-9\u0980-\u09FF"“‘'()+-]+/, '');
  value = value.replace(/[^A-Za-z0-9\u0980-\u09FF"”’'().!?+-]+$/u, '');
  return value.trim();
}

function splitIntoSentences(text) {
  const cleaned = normalizeOCRSentence(text);
  if (!cleaned) return [];

  const abbreviations = new Map();
  const protectedText = cleaned.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|e\.g|i\.e)\./gi, match => {
    const key = `ORTHO_DOT_${abbreviations.size}_MARK`;
    abbreviations.set(key, match);
    return key;
  });
  const restore = value => {
    let restored = String(value || '');
    for (const [key, original] of abbreviations) restored = restored.replaceAll(key, original);
    return normalizeOCRSentence(restored);
  };

  const parts = protectedText.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [protectedText];
  return parts.map(restore).filter(s => s.length > 1 && /[A-Za-z]/.test(s));
}
function makeClickableSentence(sentence, index) {
  return escapeHTML(sentence).replace(/\b[A-Za-z][A-Za-z'’-]*\b/g, token => {
    const safe = escapeAttr(token);
    return `<button type="button" class="inline-word" data-word="${safe}" onclick="openWordCard('${safe}', '${escapeAttr(sentence)}', '${index}')">${escapeHTML(token)}</button>`;
  });
}

function createSentenceBlock(sentence, index) {
  const block = document.createElement('article');
  block.className = 'sentence-block';
  block.id = `sentence-${index}`;
  block.style.animationDelay = `${Math.min(index * 0.03, 0.24)}s`;
  block.innerHTML = `
    <div class="sentence-english">
      <div class="sentence-en-wrap">
        <div class="sentence-label">English</div>
        <div class="sentence-en-text">${makeClickableSentence(sentence, index)}</div>
      </div>
      <button class="speak-btn" type="button" onclick="speakText('${escapeAttr(sentence)}', this)" title="Pronounce English" aria-label="Pronounce English sentence">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      </button>
    </div>
    <div class="sentence-bengali" id="ben-${index}">
      <div class="sentence-label">বাংলা অর্থ</div>
      <div class="sentence-pending" aria-live="polite">অর্থ প্রস্তুত হচ্ছে…</div>
    </div>
  `;
  return block;
}

function updateSentenceTranslation(index, translation) {
  const benEl = $(`ben-${index}`);
  if (!benEl) return;
  let safeTranslation = normalizeOCRSentence(String(translation || ''));
  if (!safeTranslation) safeTranslation = 'অনুবাদ এখন উপলব্ধ নয়।';
  safeTranslation = safeTranslation.replace(/[​-‍﻿]/g,'').replace(/([,;:!?]){2,}/g,'$1').replace(/\s+([,;:!?])/g,'$1').trim();
  benEl.innerHTML = `
    <div class="sentence-label">বাংলা অর্থ</div>
    <div class="sentence-ben-text">${escapeHTML(safeTranslation)}</div>
  `;
}

function ensureSentenceResultsVisible() {
  if (!AppState.translatedSentences.length || !Elements.translationBody) return;
  if (!Elements.translationBody.querySelector('.sentence-block')) {
    renderTranslationResults(AppState.translatedSentences);
  }
}

function renderTranslationResults(items) {
  const body = Elements.translationBody;
  if (!body) return;

  Elements.emptyStateRight.hidden = true;
  Elements.translationCard.hidden = false;
  Elements.vocabCard.hidden = true;
  body.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    const sentence = String(item?.en || '').trim();
    if (!sentence) return;
    fragment.appendChild(createSentenceBlock(sentence, index));
  });

  body.appendChild(fragment);

  // Replace every temporary loader synchronously after the blocks are attached
  // to the document. This avoids any timing race with requestAnimationFrame.
  items.forEach((item, index) => updateSentenceTranslation(index, item?.bn));

  // Defensive verification: a translation card with zero rendered sentence
  // blocks is a UI failure, not a normal empty state. Re-render once from the
  // canonical application state instead of showing blank ruled lines.
  if (items.length > 0 && !body.querySelector('.sentence-block')) {
    console.warn('[Translation UI] Sentence blocks missing after render; retrying once.');
    const retry = document.createDocumentFragment();
    items.forEach((item, index) => {
      const sentence = String(item?.en || '').trim();
      if (!sentence) return;
      retry.appendChild(createSentenceBlock(sentence, index));
    });
    body.appendChild(retry);
    items.forEach((item, index) => updateSentenceTranslation(index, item?.bn));
  }
}

// Content safety is provided by src/engines/safety/content-safety.js
const containsBlockedContent = text => window.OrthobittoSafety.containsBlockedContent(text);
const sanitizeForLearning = text => window.OrthobittoSafety.sanitizeForLearning(text);

// ============================================================
// TRANSLATION API CALLS — SENTENCE ENGINE ONLY
// ============================================================
async function translateText(text) {
  if (!text.trim()) return text;

  // The UI renders the English sentence first; this deadline only protects the
  // Bengali translation request from keeping the sentence result in a pending
  // state indefinitely (especially when index.html is opened via file://).
  const deadlineMs = 7000;
  return await Promise.race([translateTextInternal(text), new Promise(resolve => setTimeout(() => resolve(offlineFallbackTranslation(text)), deadlineMs))]);
}

async function translateTextInternal(text) {

  const safeText = sanitizeForLearning(text);
  if (safeText === null) {
    console.warn('[Safety] Blocked sentence from translation.');
    return '[Content blocked for safety]';
  }
  text = safeText;

  const cached = getCachedTranslation(text);
  if (cached && isPlausibleSentenceTranslation(text, cached)) return cached;

  if (AppState.isOnline) {
    try {
      const result = await translateMyMemory(text);
      if (result && isPlausibleSentenceTranslation(text, result)) {
        rememberTranslation(text, result);
        return result;
      }
    } catch (e) {
      console.warn('[Sentence Translation] MyMemory failed, trying LibreTranslate...', e);
    }
    try {
      const result = await translateLibreTranslate(text);
      if (result && isPlausibleSentenceTranslation(text, result)) {
        rememberTranslation(text, result);
        return result;
      }
    } catch (e) {
      console.warn('[Sentence Translation] LibreTranslate failed, using offline fallback.', e);
    }
  }

  return offlineFallbackTranslation(text);
}

function isPlausibleSentenceTranslation(source, translated) {
  const output = String(translated || '').trim();
  if (!output) return false;

  // Reject raw API echoes for English text. Sentence translations may legitimately
  // contain a few Latin tokens, but a near-identical all-English response is suspect.
  const normalizedSource = source.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedOutput = output.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalizedOutput) return true;
  if (normalizedSource === normalizedOutput) return false;

  // If the source contains letters and the output contains no Bengali script and
  // is mostly alphabetic, do not present it as Bengali translation.
  const hasBengali = /[\u0980-\u09FF]/.test(output);
  const latinChars = (output.match(/[a-zA-Z]/g) || []).length;
  const totalLetters = (output.match(/[A-Za-z\u0980-\u09FF]/g) || []).length;
  if (!hasBengali && totalLetters > 0 && latinChars / totalLetters > 0.85) return false;
  return true;
}

async function translateMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|bn`;
  const resp = await fetchWithTimeout(url, 8000);
  if (!resp.ok) throw new Error('MyMemory API error');
  const data = await resp.json();
  if (data.responseStatus === 200 && data.responseData?.translatedText) {
    return data.responseData.translatedText;
  }
  throw new Error('Bad MyMemory response');
}

async function translateLibreTranslate(text) {
  const url = 'https://libretranslate.de/translate';
  const resp = await fetchWithTimeout(url, 8000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'en', target: 'bn', format: 'text' })
  });
  if (!resp.ok) throw new Error('LibreTranslate error');
  const data = await resp.json();
  if (data.translatedText) return data.translatedText;
  throw new Error('Bad LibreTranslate response');
}

async function fetchWithTimeout(url, timeout = 8000, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function offlineFallbackTranslation(text) {
  // Never manufacture a misleading word-by-word Bengali sentence when the
  // sentence translation service is unavailable. The dictionary is word-local,
  // not a sentence translation engine.
  return 'অনুবাদ এখন উপলব্ধ নয়।';
}

// ============================================================
// WORD MEANING ENGINE — LOCAL, ALLOWLIST ONLY
// ============================================================
async function lookupWordMeaning(word) {
  await OrthobittoDictionary.ready();
  const item = OrthobittoDictionary.lookup(word);
  return item ? item.meaning_bn : null;
}

// ============================================================
// VOCABULARY BUILDER
// ============================================================
async function buildVocabulary(text) {
  // Vocabulary is an enhancement, never a hard dependency for translation.
  // Never allow a dictionary/network/file-loading issue to stall the scan pipeline.
  try {
    await Promise.race([
      OrthobittoDictionary.ready(),
      new Promise(resolve => setTimeout(resolve, 2800))
    ]);
  } catch (error) {
    console.warn('[Vocabulary] Dictionary unavailable; continuing with an empty match set.', error);
  }

  const rawWords = text.match(/\b[a-zA-Z]{2,}\b/g) || [];
  const uniqueWords = [...new Set(rawWords.map(w => w.toLowerCase()))];
  const candidates = uniqueWords.filter(w => !STOPWORDS.has(w) || FUNCTION_WORDS.has(w));

  AppState.vocabularyItems = [];
  Elements.vocabCard.hidden = false;
  Elements.vocabTbody.innerHTML = '';

  const fragment = document.createDocumentFragment();
  let rowNumber = 0;

  for (const word of candidates) {
    if (!OrthobittoDictionary.isSafeWord(word)) continue;
    const entry = OrthobittoDictionary.lookup(word);
    if (!entry) continue;

    const item = { word, meaning: entry.meaning_bn, lemma: entry.lemma || word };
    AppState.vocabularyItems.push(item);
    rowNumber += 1;
    fragment.appendChild(createVocabRow(item, rowNumber));
  }

  if (rowNumber) {
    Elements.vocabTbody.appendChild(fragment);
  } else {
    Elements.vocabTbody.innerHTML = `
      <tr class="vocab-empty-row">
        <td colspan="4">No approved vocabulary matches were found in the local Orthobitto dictionary.</td>
      </tr>`;
  }

  Elements.vocabCountBadge.textContent = `${AppState.vocabularyItems.length} words`;
  updateMobileBadges();
}

function createVocabRow(item, num) {
  const tr = document.createElement('tr');
  tr.style.animationDelay = `${num * 0.04}s`;
  tr.innerHTML = `
    <td class="vocab-num">${num}</td>
    <td class="vocab-word"><button class="word-inline-btn" type="button" onclick="openWordCard('${escapeAttr(item.word)}', '', '')">${escapeHTML(item.word)}</button></td>
    <td class="vocab-bengali">${escapeHTML(item.meaning)}</td>
    <td class="vocab-speak">
      <button class="speak-btn" onclick="speakText('${escapeAttr(item.word)}', this)" title="Pronounce word" style="width:24px;height:24px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      </button>
    </td>
  `;
  return tr;
}

function appendVocabRow(item, num) {
  Elements.vocabTbody.appendChild(createVocabRow(item, num));
}

function updateMobileBadges() {
  const sc = AppState.translatedSentences.length;
  const vc = AppState.vocabularyItems.length;
  const sentBadge = $('nav-sentence-badge');
  const vocBadge = $('nav-vocab-badge');

  // Badge elements are optional in the current compact mobile navigation.
  // Never let a missing optional badge crash the translation/vocabulary flow.
  if (sc > 0 && sentBadge) {
    sentBadge.textContent = sc;
    sentBadge.hidden = false;
  }
  if (vc > 0 && vocBadge) {
    vocBadge.textContent = vc;
    vocBadge.hidden = false;
  }
}

// ============================================================
// WEB SPEECH API
// ============================================================
let currentUtterance = null;
function speakText(text, btn) {
  if (!('speechSynthesis' in window)) {
    showToast('Speech Unavailable', 'Web Speech API not supported in this browser.', 'warning');
    return;
  }
  if (currentUtterance) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.speak-btn.speaking').forEach(b => b.classList.remove('speaking'));
    if (currentUtterance.text === text) { currentUtterance = null; return; }
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.onstart = () => btn.classList.add('speaking');
  utterance.onend = () => { btn.classList.remove('speaking'); currentUtterance = null; };
  utterance.onerror = () => { btn.classList.remove('speaking'); currentUtterance = null; };
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

// ============================================================
// COPY TRANSLATION
// ============================================================
function copyTranslation() {
  if (!AppState.translatedSentences.length) {
    showToast('Nothing to Copy', '', 'warning', 2000); return;
  }
  const text = AppState.translatedSentences
    .map(s => `${s.en}\n${s.bn}`)
    .join('\n\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied!', 'Translation copied to clipboard.', 'success', 2000);
  });
}

// ============================================================
// PDF FONT SIZE CONTROLS
// ============================================================
const pdfFontSizes = { eng: 18, ben: 17 };

function adjustFontSize(type, delta) {
  pdfFontSizes[type] = Math.max(8, Math.min(24, pdfFontSizes[type] + delta));
  $(`${type}-font-size`).textContent = pdfFontSizes[type];
}

// ============================================================
// PDF GENERATION — DELEGATED TO pdf-generator.js
// ============================================================
async function generatePDF() {
  const mode = AppState.pdfExportMode || 'sentences';
  if (mode === 'sentences' && !AppState.translatedSentences.length) {
    showToast('No Sentences', 'Please translate text before generating a sentence PDF.', 'warning');
    return;
  }
  if (mode === 'vocab' && !AppState.vocabularyItems.length) {
    showToast('No Vocabulary', 'Please build the vocabulary list before generating a vocabulary PDF.', 'warning');
    return;
  }
  const config = {
    mode,
    engFont: $('pdf-eng-font').value,
    benFont: $('pdf-ben-font').value,
    engFontSize: pdfFontSizes.eng,
    benFontSize: pdfFontSizes.ben,
    sentences: AppState.translatedSentences,
    vocab: AppState.vocabularyItems,
  };
  const btn = $('pdf-generate-btn');
  if (btn) btn.disabled = true;
  try {
    const pdf = await loadPdfEngine();
    await pdf.generate(config);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// INDEXEDDB — SCAN HISTORY
// ============================================================
const DB_NAME = 'orthobitto-db';
const DB_VERSION = 1;
const STORE_NAME = 'scans';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function saveToHistory(ocrText, translations, vocab) {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      timestamp: Date.now(),
      preview: AppState.imageDataURL ? AppState.imageDataURL.substring(0, 200) : null,
      imageDataURL: AppState.imageDataURL,
      ocrText: ocrText.substring(0, 500),
      translations,
      vocab,
    };
    store.add(record);

    // Keep only last 20
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const all = allReq.result;
      if (all.length > 20) {
        const toDelete = all.slice(0, all.length - 20);
        const delTx = database.transaction(STORE_NAME, 'readwrite');
        const delStore = delTx.objectStore(STORE_NAME);
        toDelete.forEach(item => delStore.delete(item.id));
      }
    };
  } catch (e) {
    console.warn('[IndexedDB] Save failed:', e);
  }
}

async function getAllHistory() {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.reverse());
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

async function deleteHistoryItem(id) {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await renderHistoryList();
  } catch (e) {
    console.warn('[IndexedDB] Delete failed:', e);
  }
}

async function clearAllHistory() {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    await renderHistoryList();
    showToast('History Cleared', 'All scan history has been deleted.', 'success', 2500);
  } catch (e) {
    console.warn('[IndexedDB] Clear failed:', e);
  }
}

async function renderHistoryList() {
  const list = $('history-list');
  const items = await getAllHistory();

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state-sm">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <p>No history yet</p>
      </div>`;
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="history-item" onclick="loadHistoryItem(${item.id})">
      ${item.imageDataURL
        ? `<img class="history-thumb" src="${item.imageDataURL}" alt="Scan thumbnail" loading="lazy" />`
        : `<div class="history-thumb" style="background:var(--bg-muted);display:flex;align-items:center;justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
           </div>`
      }
      <div class="history-info">
        <div class="history-title">${escapeHTML(item.ocrText.substring(0, 50) + '...')}</div>
        <div class="history-meta">${formatHistoryDate(item.timestamp)} · ${item.translations?.length || 0} sentences</div>
      </div>
      <button class="history-del-btn" onclick="event.stopPropagation();deleteHistoryItem(${item.id})" aria-label="Delete history item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path></svg>
      </button>
    </div>
  `).join('');
}

async function loadHistoryItem(id) {
  const database = await openDB();
  const tx = database.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(id);
  req.onsuccess = () => {
    const item = req.result;
    if (!item) return;
    closeHistoryDrawer();

    if (item.imageDataURL) {
      AppState.imageDataURL = item.imageDataURL;
      showImagePreview(item.imageDataURL);
    }

    AppState.ocrText = item.ocrText;
    showOCREditor(item.ocrText);

    if (item.translations?.length) {
      AppState.translatedSentences = item.translations;
      Elements.emptyStateRight.hidden = true;
      Elements.translationCard.hidden = false;
      Elements.translationBody.innerHTML = '';
      item.translations.forEach((s, i) => {
        const block = createSentenceBlock(s.en, i);
        Elements.translationBody.appendChild(block);
        updateSentenceTranslation(i, s.bn);
      });
    }

    if (item.vocab?.length) {
      AppState.vocabularyItems = item.vocab;
      Elements.vocabCard.hidden = false;
      Elements.vocabTbody.innerHTML = '';
      item.vocab.forEach((v, i) => appendVocabRow(v, i + 1));
      Elements.vocabCountBadge.textContent = `${item.vocab.length} words`;
    }

    updateMobileBadges();
    showToast('History Loaded', 'Previous scan restored.', 'success');
  };
}

function formatHistoryDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// UTILITY HELPERS
// ============================================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ');
}

// ============================================================
// APP INITIALIZATION
// ============================================================
function init() {
  initTheme();
  initMobilePanels();
  updateOnlineStatus();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeBlurModal();
      closePDFModal();
      closeHistoryDrawer();
    }
  });

  // Touch: swipe dropzone to open history
  let touchStartX = 0;
  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (diff > 80 && touchStartX > window.innerWidth - 60) {
      openHistoryDrawer();
    }
  }, { passive: true });

  // PWA install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showToast('Install Orthobitto', 'Add to home screen for the best experience.', 'info', 6000);
  });

  console.log('%cOrthobitto v4.0.3', 'font-size:18px;font-weight:bold;color:#B89A63;');
  console.log('%cPremium English Learning Workspace', 'color:#8B7352;');
}

document.addEventListener('DOMContentLoaded', init);

