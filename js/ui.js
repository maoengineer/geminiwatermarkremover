'use strict';
/**
 * GeminiClean UI layer
 * Fix: watch #originalImage.load as primary trigger (works for both dialog select AND drag/drop)
 */

const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.style.display = ''; };
const hide = (el) => { if (el) el.style.display = 'none'; };

/* ── Navbar ── */
function setupNavbar() {
  const ham = $('navHamburger'), links = $('navLinks');
  if (!ham || !links) return;
  ham.addEventListener('click', () => links.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!ham.contains(e.target) && !links.contains(e.target))
      links.classList.remove('open');
  });
}

/* ── FAQ accordion ── */
function setupFAQ() {
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', function () {
      const item = this.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach((el) => {
        el.classList.remove('open');
        el.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) { item.classList.add('open'); this.setAttribute('aria-expanded', 'true'); }
    });
  });
}

/* ── Scroll reveal ── */
function setupReveal() {
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('animate-fade-up'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
}

/* ── Preview Card ── */
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
  const origImg       = $('originalImage');
  const procImg       = $('processedImage');
  const dlBtn         = $('downloadBtn');

  let originalSrc  = '';
  let processedSrc = '';
  let currentMode  = 'before';
  let cardShown    = false;

  /* ── Show preview card ── */
  function showCard(src) {
    if (cardShown) return; // prevent double-show
    cardShown = true;
    originalSrc = src;
    currentMode = 'before';
    pcardDisplay.src = src;
    hide(uploadArea);
    show(previewCard);
    show(pcardProcess);
    hide(pcardToggle);
    hide(pcardActions);
    if (pcardBefore) pcardBefore.classList.add('active');
    if (pcardAfter)  pcardAfter.classList.remove('active');
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Called when engine finishes ── */
  function onDone(src) {
    processedSrc = src;
    hide(pcardProcess);
    show(pcardToggle);
    show(pcardActions);
    setMode('after');
  }

  /* ── Toggle Before/After ── */
  function setMode(mode) {
    currentMode = mode;
    if (mode === 'after' && processedSrc) {
      pcardDisplay.src = processedSrc;
      pcardAfter?.classList.add('active');
      pcardBefore?.classList.remove('active');
    } else {
      pcardDisplay.src = originalSrc;
      pcardBefore?.classList.add('active');
      pcardAfter?.classList.remove('active');
    }
  }

  /* ── Reset ── */
  function reset() {
    cardShown = false;
    originalSrc = processedSrc = '';
    currentMode = 'before';
    if (pcardDisplay) pcardDisplay.src = '';
    hide(previewCard);
    show(uploadArea);
    if (fileInput) fileInput.value = '';
    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ═══════════════════════════════════════════════════════════
     PRIMARY FIX: Watch #originalImage.load
     The engine ALWAYS sets originalImage.src when it reads a file
     — whether via dialog OR drop. This is the most reliable signal.
  ═══════════════════════════════════════════════════════════ */
  if (origImg) {
    origImg.addEventListener('load', () => {
      if (origImg.src && origImg.naturalWidth > 0 && origImg.src !== window.location.href) {
        showCard(origImg.src); // show card with engine's own loaded image
      }
    });
  }

  /* Watch processedImage — engine sets this when done */
  if (procImg) {
    procImg.addEventListener('load', () => {
      const s = procImg.src;
      if (s && s !== window.location.href && s !== processedSrc && procImg.naturalWidth > 0) {
        onDone(s);
      }
    });
    new MutationObserver(() => {
      const s = procImg.getAttribute('src');
      if (s && s.startsWith('data:') && s !== processedSrc) onDone(s);
    }).observe(procImg, { attributes: true, attributeFilter: ['src'] });
  }

  /* Watch downloadBtn as extra "done" signal */
  if (dlBtn) {
    new MutationObserver(() => {
      if (dlBtn.style.display !== 'none' && procImg?.src && procImg.src !== window.location.href) {
        onDone(procImg.src);
      }
    }).observe(dlBtn, { attributes: true, attributeFilter: ['style'] });
  }

  /* ══════════════════════════════════
     Drag & Drop on upload area
     (engine doesn't intercept drop events — we must handle these)
  ══════════════════════════════════ */
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // ← prevent engine's own drop handler from firing & resetting UI
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      // Immediately show preview via FileReader (fast UX)
      const reader = new FileReader();
      reader.onload = (ev) => showCard(ev.target.result);
      reader.readAsDataURL(file);
      // Feed file to engine via fileInput change event
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    });
  }

  /* ══════════════════════════════════
     Ctrl+V paste
  ══════════════════════════════════ */
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) break;
        const reader = new FileReader();
        reader.onload = (ev) => showCard(ev.target.result);
        reader.readAsDataURL(file);
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        break;
      }
    }
  });

  /* Toggle buttons */
  pcardBefore?.addEventListener('click', () => setMode('before'));
  pcardAfter?.addEventListener('click',  () => setMode('after'));

  /* Download — trigger engine's hidden button */
  pcardDownload?.addEventListener('click', () => {
    if (dlBtn && dlBtn.style.display !== 'none') {
      dlBtn.click();
    } else if (processedSrc) {
      const a = document.createElement('a');
      a.href = processedSrc;
      a.download = 'geminiclean-result.png';
      a.click();
    }
  });

  /* Copy image to clipboard */
  pcardCopy?.addEventListener('click', async () => {
    const src = (currentMode === 'after' && processedSrc) ? processedSrc : originalSrc;
    if (!src) return;
    try {
      const res  = await fetch(src);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      pcardCopy.textContent = '✓ Copied!';
      setTimeout(() => { pcardCopy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy image'; }, 2000);
    } catch (_) {
      pcardCopy.textContent = 'Not supported';
      setTimeout(() => { pcardCopy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy image'; }, 2000);
    }
  });

  /* Add more / Close → reset */
  pcardAddMore?.addEventListener('click', reset);
  pcardClose?.addEventListener('click',   reset);
  $('resetBtn')?.addEventListener('click', reset);
}

/* ── Loading overlay bridge ── */
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

document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();
  setupFAQ();
  setupReveal();
  setupPreviewCard();
  setupLoadingOverlay();
});
