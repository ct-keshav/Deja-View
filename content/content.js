// Visual Diff Extension - Content Script (Orchestrator)
// Optimized for fast open/close: lazy diff/heatmap computation, cached results.

(function () {
  'use strict';

  const state = {
    active: false,
    mode: 'overlay',
    opacity: 0.5,
    density: 0.5,
    referenceImg: null,
    screenshotImg: null,
    normalizedWidth: 0,
    normalizedHeight: 0,
    refImageData: null,
    scrImageData: null,
    diffImageData: null,
    diffDensity: -1,
    heatmapImageData: null,
    matchPercentage: null,
    toolbar: null,
    overlayContainer: null,
    canvas: null,
    savedScrollX: 0,
    savedScrollY: 0,
    hiddenFixedElements: [],
    _densityRafId: 0,
  };

  // --- Safe messaging (survives extension reload) ---

  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(function () {});
    } catch (_) {}
  }

  // --- Message Listener ---

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    switch (msg.type) {
      case 'PING':
        sendResponse({ ok: true });
        return false;

      case 'GET_PAGE_DIMS':
        sendResponse({
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        });
        return false;

      case 'SAVE_SCROLL':
        state.savedScrollX = window.scrollX;
        state.savedScrollY = window.scrollY;
        sendResponse({ ok: true });
        return false;

      case 'SCROLL_FOR_CAPTURE':
        window.scrollTo(msg.scrollX, msg.scrollY);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            sendResponse({ done: true });
          });
        });
        return true;

      case 'RESTORE_SCROLL':
        window.scrollTo(state.savedScrollX, state.savedScrollY);
        sendResponse({ ok: true });
        return false;

      case 'HIDE_FIXED_ELEMENTS':
        hideFixedElements();
        sendResponse({ ok: true });
        return false;

      case 'SHOW_FIXED_ELEMENTS':
        showFixedElements();
        sendResponse({ ok: true });
        return false;

      case 'RENDER_COMPARISON':
        handleRenderComparison(msg.reference, msg.screenshot)
          .then(function () { sendResponse({ ok: true }); })
          .catch(function (err) { sendResponse({ error: err.message }); });
        return true;

      case 'COPY_ALL_IMAGES':
        getCompositeDataUrl()
          .then(function (dataUrl) { sendResponse({ ok: true, dataUrl: dataUrl }); })
          .catch(function (err) { sendResponse({ error: err.message }); });
        return true;

      default:
        return false;
    }
  });

  // --- Fixed Element Management ---

  function hideFixedElements() {
    state.hiddenFixedElements = [];
    const style = document.createElement('style');
    style.id = 'vdiff-hide-fixed';
    style.textContent = '[data-vdiff-was-fixed] { display: none !important; }';
    document.head.appendChild(style);

    const allElements = document.querySelectorAll('*');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (el.id === 'vdiff-overlay-container' || el.id === 'vdiff-toolbar-host') continue;
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        el.setAttribute('data-vdiff-was-fixed', '1');
        state.hiddenFixedElements.push(el);
      }
    }
  }

  function showFixedElements() {
    for (let i = 0; i < state.hiddenFixedElements.length; i++) {
      state.hiddenFixedElements[i].removeAttribute('data-vdiff-was-fixed');
    }
    state.hiddenFixedElements = [];
    const style = document.getElementById('vdiff-hide-fixed');
    if (style) style.remove();
  }

  // --- Render Comparison ---

  async function handleRenderComparison(referenceDataUrl, screenshotDataUrl) {
    cleanup();

    let refImg, scrImg;
    await Promise.all([
      VDiff.utils.loadImage(referenceDataUrl).then(function (img) { refImg = img; }),
      VDiff.utils.loadImage(screenshotDataUrl).then(function (img) { scrImg = img; }),
    ]);

    state.referenceImg = refImg;
    state.screenshotImg = scrImg;

    const normalized = VDiff.utils.normalizeImages(refImg, scrImg);
    state.normalizedWidth = normalized.width;
    state.normalizedHeight = normalized.height;
    state.refImageData = normalized.refImageData;
    state.scrImageData = normalized.scrImageData;

    computeMatchPercentage();

    state.overlayContainer = document.createElement('div');
    state.overlayContainer.id = 'vdiff-overlay-container';
    state.overlayContainer.style.width = normalized.width + 'px';
    state.overlayContainer.style.height = normalized.height + 'px';

    state.canvas = document.createElement('canvas');
    state.canvas.width = normalized.width;
    state.canvas.height = normalized.height;

    state.overlayContainer.appendChild(state.canvas);
    document.documentElement.appendChild(state.overlayContainer);

    state.toolbar = VDiff.toolbar.create({
      onModeChange: function (mode) {
        state.mode = mode;
        render();
      },
      onOpacityChange: function (opacity) {
        state.opacity = opacity;
        if (state.mode === 'overlay') render();
      },
      onDensityChange: function (density) {
        state.density = density;
        if (state.mode === 'diff') {
          state.diffImageData = null;
          state.diffDensity = -1;
          if (state._densityRafId) cancelAnimationFrame(state._densityRafId);
          state._densityRafId = requestAnimationFrame(function () {
            state._densityRafId = 0;
            render();
          });
        } else if (state.mode === 'heatmap') {
          render();
        }
      },
      onCopyAll: function () {
        return copyAllToClipboard();
      },
      onClose: function (resetRef) {
        cleanup();
        if (resetRef) {
          safeSendMessage({ type: 'CLEAR_REFERENCE' });
        }
        safeSendMessage({ type: 'COMPARISON_CLOSED' });
      },
      onReset: function () {
        cleanup();
        safeSendMessage({ type: 'CLEAR_REFERENCE' });
        safeSendMessage({ type: 'COMPARISON_CLOSED' });
      },
    });

    state.toolbar.setMatchScore(state.matchPercentage);
    state.active = true;
    state.mode = 'overlay';
    state.opacity = state.toolbar.getOpacity();
    state.density = state.toolbar.getDensity();

    render();
  }

  // --- Fast match % (no pixel output, just count) ---

  function computeMatchPercentage() {
    const ref = state.refImageData.data;
    const scr = state.scrImageData.data;
    const len = ref.length;
    let match = 0;
    const total = state.normalizedWidth * state.normalizedHeight;
    for (let i = 0; i < len; i += 4) {
      let rd = ref[i] - scr[i]; rd = rd < 0 ? -rd : rd;
      let gd = ref[i + 1] - scr[i + 1]; gd = gd < 0 ? -gd : gd;
      let bd = ref[i + 2] - scr[i + 2]; bd = bd < 0 ? -bd : bd;
      if (rd + gd + bd <= 30) match++;
    }
    state.matchPercentage = ((match / total) * 100).toFixed(2);
  }

  // --- Lazy diff computation ---

  function ensureDiff() {
    if (state.diffImageData && state.diffDensity === state.density) return;
    const result = VDiff.diff.computeDiff(
      state.refImageData, state.scrImageData,
      state.normalizedWidth, state.normalizedHeight,
      30, state.density
    );
    state.diffImageData = result.diffImageData;
    state.diffDensity = state.density;
    state.matchPercentage = result.matchPercentage;
    if (state.toolbar) state.toolbar.setMatchScore(result.matchPercentage);
  }

  function ensureHeatmap() {
    if (state.heatmapImageData) return;
    state.heatmapImageData = VDiff.diff.computeHeatmap(
      state.refImageData, state.scrImageData,
      state.normalizedWidth, state.normalizedHeight
    );
  }

  // --- Rendering ---

  function render() {
    if (!state.active || !state.canvas) return;
    const m = state.mode;
    if (m === 'overlay') {
      VDiff.overlay.renderOverlay(state.canvas, state.screenshotImg, state.referenceImg, state.opacity);
    } else if (m === 'diff') {
      ensureDiff();
      VDiff.overlay.renderDiff(state.canvas, state.diffImageData);
    } else if (m === 'heatmap') {
      ensureHeatmap();
      VDiff.overlay.renderHeatmap(state.canvas, state.heatmapImageData, state.screenshotImg, state.density);
    } else {
      VDiff.overlay.renderSideBySide(state.canvas, state.screenshotImg, state.referenceImg);
    }
  }

  // --- Composite Image Generation ---

  function imageDataToCanvas(imageData) {
    const c = document.createElement('canvas');
    c.width = imageData.width;
    c.height = imageData.height;
    c.getContext('2d').putImageData(imageData, 0, 0);
    return c;
  }

  function buildCompositeCanvas() {
    if (!state.referenceImg || !state.screenshotImg) return null;

    ensureDiff();
    ensureHeatmap();

    const w = state.normalizedWidth;
    const h = state.normalizedHeight;
    const gap = 16;
    const labelH = 32;
    const cols = 4;
    const totalW = w * cols + gap * (cols + 1);
    const totalH = h + labelH + gap * 2;

    const c = document.createElement('canvas');
    c.width = totalW;
    c.height = totalH;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, totalW, totalH);

    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'middle';

    const imgY = labelH + gap;
    const labels = [
      { text: 'ORIGINAL', color: '#e94560' },
      { text: 'CURRENT', color: '#3c8cff' },
      { text: 'DIFF (' + state.matchPercentage + '% match)', color: '#e9a825' },
      { text: 'HEATMAP', color: '#c850c0' },
    ];

    for (let i = 0; i < cols; i++) {
      const x = gap * (i + 1) + w * i;
      ctx.fillStyle = labels[i].color;
      ctx.fillText(labels[i].text, x, labelH / 2 + gap / 2);
    }

    const x1 = gap;
    ctx.drawImage(state.referenceImg, x1, imgY, w, h);

    const x2 = gap * 2 + w;
    ctx.drawImage(state.screenshotImg, x2, imgY, w, h);

    const x3 = gap * 3 + w * 2;
    const diffCanvas = imageDataToCanvas(state.diffImageData);
    ctx.drawImage(diffCanvas, x3, imgY);

    const x4 = gap * 4 + w * 3;
    const heatCanvas = imageDataToCanvas(state.heatmapImageData);
    ctx.drawImage(heatCanvas, x4, imgY);

    return c;
  }

  function getCompositeDataUrl() {
    const c = buildCompositeCanvas();
    if (!c) return Promise.reject(new Error('No images to copy'));
    return Promise.resolve(c.toDataURL('image/png'));
  }

  function copyAllToClipboard() {
    const c = buildCompositeCanvas();
    if (!c) return Promise.reject(new Error('No images to copy'));
    return new Promise(function (resolve, reject) {
      c.toBlob(function (blob) {
        if (!blob) return reject(new Error('Failed to create blob'));
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(resolve).catch(reject);
      }, 'image/png');
    });
  }

  // --- Cleanup ---

  function cleanup() {
    state.active = false;
    if (state._densityRafId) {
      cancelAnimationFrame(state._densityRafId);
      state._densityRafId = 0;
    }
    if (state.toolbar) {
      state.toolbar.destroy();
      state.toolbar = null;
    }
    if (state.overlayContainer) {
      state.overlayContainer.remove();
      state.overlayContainer = null;
    }
    state.canvas = null;
    state.referenceImg = null;
    state.screenshotImg = null;
    state.diffImageData = null;
    state.diffDensity = -1;
    state.heatmapImageData = null;
    state.matchPercentage = null;
    state.refImageData = null;
    state.scrImageData = null;
    state.normalizedWidth = 0;
    state.normalizedHeight = 0;
  }
})();
