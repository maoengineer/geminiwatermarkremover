'use strict';
/**
 * GeminiClean — UI layer
 * Engine: js/gwr-engine.js  (GargantuaX/gemini-watermark-remover build)
 *
 * Flow:
 *  1. User drops / selects / pastes image
 *  2. Upload zone hides → previewCard shows with original photo
 *  3. Loading spinner overlays the card while engine processes
 *  4. Engine writes to #processedImage → we detect → show After toggle + action buttons
 *  5. Before/After toggle switches pcardDisplay src
 *  6. "Add more" / × resets everything back to upload zone
 */

/* ─── helpers ─── */
const $  = (id) => document.getElementById(id);
const show = (el) => { if (el) el.style.display = ''; };
const hide = (el) => { if (el) el.style.display = 'none'; };

/* ─── Navbar ─── */
function setupNavbar() {
  const ham = $('navHamburger'), links = $('navLinks');
  if (!ham || !links) return;
  ham.addEventListener('click', () => links.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!ham.contains(e.target) && !links.contains(e.target))
      links.classList.remove('open');
  });
}

/* ─── FAQ accordion ─── */
function setupFAQ() {
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', function () {
      const item = this.closest('.faq-item');
      if (!item) return;
      const open = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach((el) => {
        el.classList.remove('open');
        el.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });
      if (!open) { item.classList.add('open'); this.setAttribute('aria-expanded', 'true'); }
    });
  });
}

/* ─── Scroll reveal ─── */
function setupReveal() {
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('animate-fade-up'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
}

/* ─── Preview Card logic ─── */
function setupPreviewCard() {
  const uploadArea    = $('uploadArea');
  const fileInput     = $('fileInput');
  const previewCard   = $('previewCard');
  const pcardDisplay  = $('pcardDisplay');
  const pcardProcess  = $('pcardProcessing');
  const pcardToggle   = $('pcardToggle');
  const pcardActions  = $('pcardActions');
  const pcardBefore   = $('pcardBefore');
  const pcardAfter    = $('pcardAfter');
  const pcardDownload = $('pcardDownload');
  const pcardCopy     = $('pcardCopy');
  const pcardAddMore  = $('pcardAddMore');
  const pcardClose    = $('pcardClose');

  /* Engine elements (hidden DOM, engine writes to these) */
  const origImg   = $('originalImage');
  const procImg   = $('processedImage');
  const dlBtn     = $('downloadBtn');

  let originalSrc  = '';
  let processedSrc = '';
  let currentMode  = 'before';   // 'before' | 'after'

  /* ── Show card with photo ── */
  function showCard(src) {
    originalSrc = src;
    currentMode = 'before';
    pcardDisplay.src = src;
    hide(uploadArea);
    show(previewCard);
    show(pcardProcess);    // spinner on
    hide(pcardToggle);
    hide(pcardActions);
    pcardBefore.classList.add('active');
    pcardAfter.classList.remove('active');
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Called when engine finishes (processedImage has src) ── */
  function onProcessingDone(src) {
    processedSrc = src;
    hide(pcardProcess);   // spinner off
    show(pcardToggle);
    show(pcardActions);
    // Auto-switch to After so user sees the result
    setMode('after');
  }

  /* ── Toggle Before / After ── */
  function setMode(mode) {
    currentMode = mode;
    if (mode === 'after' && processedSrc) {
      pcardDisplay.src = processedSrc;
      pcardAfter.classList.add('active');
      pcardBefore.classList.remove('active');
    } else {
      pcardDisplay.src = originalSrc;
      pcardBefore.classList.add('active');
      pcardAfter.classList.remove('active');
    }
  }

  /* ── Reset to upload zone ── */
  function reset() {
    originalSrc  = '';
    processedSrc = '';
    currentMode  = 'before';
    pcardDisplay.src = '';
    hide(previewCard);
    show(uploadArea);
    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Also reset engine state
    if (fileInput) fileInput.value = '';
  }

  /* ── Watch processedImage for src change (engine result signal) ── */
  if (procImg) {
    procImg.addEventListener('load', () => {
      if (procImg.src && procImg.src !== window.location.href) {
        onProcessingDone(procImg.src);
      }
    });
    // Also watch via MutationObserver (engine may set src directly)
    new MutationObserver(() => {
      const s = procImg.getAttribute('src');
      if (s && s !== processedSrc && s.startsWith('data:')) {
        onProcessingDone(s);
      }
    }).observe(procImg, { attributes: true, attributeFilter: ['src'] });
  }

  /* Watch downloadBtn appearing — engine shows it when done */
  if (dlBtn) {
    new MutationObserver(() => {
      const visible = dlBtn.style.display !== 'none';
      if (visible && procImg && procImg.src && procImg.src !== window.location.href) {
        onProcessingDone(procImg.src);
      }
    }).observe(dlBtn, { attributes: true, attributeFilter: ['style'] });
  }

  /* ── File input change → show card ── */
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => showCard(e.target.result);
    reader.readAsDataURL(file);
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
  }

  /* ── Drag & drop on uploadArea ── */
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
        // Also pass to engine via fileInput
        try {
          const dt = new DataTransfer(); dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      }
    });
    uploadArea.addEventListener('click', () => fileInput && fileInput.click());
    uploadArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput && fileInput.click(); });
  }

  /* ── Ctrl+V paste ── */
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (!file) break;
        handleFile(file);
        try {
          const dt = new DataTransfer(); dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        break;
      }
    }
  });

  /* ── Toggle buttons ── */
  if (pcardBefore) pcardBefore.addEventListener('click', () => setMode('before'));
  if (pcardAfter)  pcardAfter.addEventListener('click',  () => setMode('after'));

  /* ── Download: trigger engine's hidden download button ── */
  if (pcardDownload) {
    pcardDownload.addEventListener('click', () => {
      if (dlBtn && dlBtn.style.display !== 'none') {
        dlBtn.click();
      } else if (processedSrc) {
        // fallback: direct data URL download
        const a = document.createElement('a');
        a.href = processedSrc;
        a.download = 'geminiclean-result.png';
        a.click();
      }
    });
  }

  /* ── Copy to clipboard ── */
  if (pcardCopy) {
    pcardCopy.addEventListener('click', async () => {
      const src = currentMode === 'after' && processedSrc ? processedSrc : originalSrc;
      if (!src) return;
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        pcardCopy.textContent = '✓ Copied!';
        setTimeout(() => { pcardCopy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy image'; }, 2000);
      } catch (_) {
        pcardCopy.textContent = 'Copy failed';
        setTimeout(() => { pcardCopy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy image'; }, 2000);
      }
    });
  }

  /* ── Add more / Close = reset ── */
  if (pcardAddMore) pcardAddMore.addEventListener('click', reset);
  if (pcardClose)   pcardClose.addEventListener('click',   reset);

  /* Also wire engine's hidden resetBtn */
  const engReset = $('resetBtn');
  if (engReset) engReset.addEventListener('click', reset);
}

/* ─── Loading overlay bridge ─── */
function setupLoadingOverlay() {
  const overlay = $('loadingOverlay');
  if (!overlay) return;
  const sync = () => {
    const off = overlay.classList.contains('hidden') || overlay.style.display === 'none';
    overlay.classList.toggle('active', !off);
  };
  new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });
  sync();
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();
  setupFAQ();
  setupReveal();
  setupPreviewCard();
  setupLoadingOverlay();
});
