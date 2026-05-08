/**
 * GEMINI WATERMARK REMOVER — Main Application Logic
 */
'use strict';

/* ───────────────────────────── State ───────────────────────────── */
let originalFile   = null;
let originalBitmap = null;
let resultBlob     = null;
let worker         = null;
let workerReady    = false;
let jobCounter     = 0;
const pendingJobs  = new Map();

/* ───────────────────────────── Worker bootstrap ─────────────────── */
function initWorker() {
  try {
    worker = new Worker('js/worker.js');
    worker.onmessage = (e) => {
      const { id, success, imageData, applied, watermarkSize, error } = e.data;
      const job = pendingJobs.get(id);
      if (!job) return;
      pendingJobs.delete(id);
      if (success) job.resolve({ imageData, applied, watermarkSize });
      else          job.reject(new Error(error));
    };
    worker.onerror = (e) => {
      console.error('Worker error', e);
      showToast('Processing error — please try again.', 'error');
    };
    workerReady = true;
  } catch (e) {
    console.warn('Web Worker unavailable:', e);
  }
}

function dispatchToWorker(imageData, width, height) {
  return new Promise((resolve, reject) => {
    const id = ++jobCounter;
    pendingJobs.set(id, { resolve, reject });
    worker.postMessage({ imageData, width, height, id }, [imageData.data.buffer]);
  });
}

/* ───────────────────────────── Upload Zone ──────────────────────── */
function setupUploadZone() {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
}

/* ───────────────────────────── File Handling ────────────────────── */
async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload a valid image file (PNG, JPEG, WebP).', 'error');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('File too large. Max size is 20 MB.', 'error');
    return;
  }

  originalFile = file;
  resultBlob   = null;

  try {
    originalBitmap = await createImageBitmap(file);
    showPreview(file, originalBitmap);
    hideResult();
    setProcessBtnState('ready');

    /* Enable the process button now that we have a file */
    const btn = document.getElementById('processBtn');
    if (btn) btn.disabled = false;
  } catch {
    showToast('Could not read the image. Try a different file.', 'error');
  }
}

function showPreview(file, bitmap) {
  const uploadZone = document.getElementById('uploadZone');
  const wrap       = document.getElementById('previewWrap');
  const img        = document.getElementById('previewImg');
  const info       = document.getElementById('fileInfo');
  if (!wrap || !img) return;

  /* Also set the before-image for the compare slider */
  const beforeImg = document.getElementById('beforeImg');

  const url = URL.createObjectURL(file);
  img.src = url;
  if (beforeImg) beforeImg.src = url;
  img.onload = () => { /* keep URL alive until reset */ };

  if (info) {
    const kb = (file.size / 1024).toFixed(1);
    info.textContent = `${file.name}\u2002·\u2002${bitmap.width}\u00d7${bitmap.height}px\u2002·\u2002${kb}\u202fKB`;
  }

  /* Hide the dashed drop zone, show the image card in its place */
  if (uploadZone) uploadZone.style.display = 'none';
  wrap.style.display = 'block';
}

function resetToUploadZone() {
  const uploadZone = document.getElementById('uploadZone');
  const wrap       = document.getElementById('previewWrap');
  const input      = document.getElementById('fileInput');
  if (uploadZone) uploadZone.style.display = '';
  if (wrap)       wrap.style.display = 'none';
  if (input)      input.value = '';
  originalFile   = null;
  originalBitmap = null;
  resultBlob     = null;
  hideResult();
  setProcessBtnState('ready');
  const btn = document.getElementById('processBtn');
  if (btn) btn.disabled = true;
}

/* ───────────────────────────── Processing ───────────────────────── */
async function processImage() {
  if (!originalBitmap || !workerReady) return;

  setProcessBtnState('loading');
  setProgress(10);

  try {
    const { width, height } = originalBitmap;

    /* Draw to offscreen canvas */
    const canvas = new OffscreenCanvas(width, height);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(originalBitmap, 0, 0);

    setProgress(30);
    const imageData = ctx.getImageData(0, 0, width, height);
    setProgress(50);

    const result = await dispatchToWorker(imageData, width, height);
    setProgress(80);

    /* Write result back */
    ctx.putImageData(result.imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    resultBlob = blob;

    setProgress(100);
    showResult(blob, result.applied);
    setProcessBtnState('done');

    if (result.applied) {
      showToast('Watermark removed successfully!', 'success');
    } else {
      showToast('No Gemini watermark detected. Image exported as-is.', 'info');
    }

  } catch (err) {
    console.error(err);
    setProcessBtnState('ready');
    setProgress(0);
    showToast('An error occurred during processing. Please try again.', 'error');
  }
}

/* ───────────────────────────── Result Panel ─────────────────────── */
function showResult(blob, applied) {
  const panel    = document.getElementById('resultPanel');
  const afterImg = document.getElementById('resultImg');
  const statusEl = document.getElementById('resultStatus');
  if (!panel) return;

  const url = URL.createObjectURL(blob);
  if (afterImg) { afterImg.src = url; }
  if (statusEl) {
    statusEl.textContent = applied
      ? 'Watermark removed — download your clean image below.'
      : 'No Gemini watermark detected in this image.';
  }

  panel.classList.add('visible');
  setupCompareSlider();
}

function hideResult() {
  const panel = document.getElementById('resultPanel');
  if (panel) panel.classList.remove('visible');
}

/* ───────────────────────────── Compare Slider ───────────────────── */
function setupCompareSlider() {
  const wrap   = document.getElementById('compareWrap');
  const after  = document.getElementById('compareAfter');
  const handle = document.getElementById('compareHandle');
  if (!wrap || !after || !handle) return;

  let dragging = false;

  const setPos = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    let pct    = (clientX - rect.left) / rect.width;
    pct        = Math.max(0.02, Math.min(0.98, pct));
    after.style.width  = `${pct * 100}%`;
    handle.style.left  = `${pct * 100}%`;
  };

  handle.addEventListener('mousedown',  (e) => { dragging = true; e.preventDefault(); });
  handle.addEventListener('touchstart', (e) => { dragging = true; e.preventDefault(); }, { passive: false });

  window.addEventListener('mousemove',  (e) => { if (dragging) setPos(e.clientX); });
  window.addEventListener('touchmove',  (e) => { if (dragging) setPos(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('mouseup',    () => { dragging = false; });
  window.addEventListener('touchend',   () => { dragging = false; });

  setPos(wrap.getBoundingClientRect().left + wrap.offsetWidth * 0.5);
}

/* ───────────────────────────── Download ────────────────────────── */
function downloadResult() {
  if (!resultBlob) return;
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(resultBlob);
  const name = originalFile ? originalFile.name.replace(/\.[^.]+$/, '') : 'image';
  a.download = `${name}_no_watermark.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* ───────────────────────────── UI Helpers ───────────────────────── */
function setProcessBtnState(state) {
  const btn = document.getElementById('processBtn');
  if (!btn) return;

  const states = {
    ready:   { text: 'Remove Watermark', disabled: false },
    loading: { text: 'Processing…',      disabled: true  },
    done:    { text: 'Process Again',    disabled: false  },
  };
  const s = states[state] || states.ready;
  const textEl = btn.querySelector('.btn-text');
  if (textEl) textEl.textContent = s.text;
  btn.disabled = s.disabled;
}

function setProgress(pct) {
  const bar  = document.getElementById('progressFill');
  const wrap = document.getElementById('progressWrap');
  if (!bar || !wrap) return;

  if (pct <= 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  bar.style.width    = `${pct}%`;
  if (pct >= 100) setTimeout(() => { wrap.style.display = 'none'; bar.style.width = '0%'; }, 800);
}

/* ───────────────────────────── Toast ───────────────────────────── */
function showToast(msg, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'https://cdn.lordicon.com/oqdmuxru.json',
    error:   'https://cdn.lordicon.com/vyukcgvf.json',
    info:    'https://cdn.lordicon.com/msoeawqm.json',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <lord-icon src="${icons[type] || icons.info}" trigger="in" colors="primary:#a78bfa" style="width:24px;height:24px;flex-shrink:0"></lord-icon>
    <span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(100%)';
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

/* ───────────────────────────── FAQ Accordion ────────────────────── */
function setupFAQ() {
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach((btn) => {
    btn.addEventListener('click', function () {
      const item = this.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      // close all
      document.querySelectorAll('.faq-item').forEach((el) => {
        el.classList.remove('open');
        const q = el.querySelector('.faq-question');
        if (q) q.setAttribute('aria-expanded', 'false');
      });
      // open clicked one if it was closed
      if (!isOpen) {
        item.classList.add('open');
        this.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ───────────────────────────── Clipboard Paste ──────────────────── */
function setupPaste() {
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          handleFile(file);
          showToast('Image pasted from clipboard!', 'success');
        }
        break;
      }
    }
  });
}

/* ───────────────────────────── Navbar Mobile ────────────────────── */
function setupNavbar() {
  const ham   = document.getElementById('navHamburger');
  const links = document.getElementById('navLinks');
  if (!ham || !links) return;
  ham.addEventListener('click', () => links.classList.toggle('open'));
}

/* ───────────────────────────── Init ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initWorker();
  setupUploadZone();
  setupFAQ();
  setupPaste();
  setupNavbar();

  const processBtn  = document.getElementById('processBtn');
  const downloadBtn = document.getElementById('downloadBtn');

  if (processBtn)  processBtn.addEventListener('click', processImage);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadResult);

  /* Animate elements on scroll */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fade-up');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
