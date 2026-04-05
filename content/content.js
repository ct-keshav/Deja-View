// Visual Diff Extension - Content Script (Memory-Safe Orchestrator)
// Lazy diff/heatmap computation, releases unused buffers on mode switch.

(function () {
  'use strict';

  // Max pixels for composite export canvas (4 panels).
  // 40M pixels ≈ 160 MB RGBA — keeps clipboard export safe.
  var MAX_COMPOSITE_PIXELS = 40_000_000;

  var state = {
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
    var style = document.createElement('style');
    style.id = 'vdiff-hide-fixed';
    style.textContent = '[data-vdiff-was-fixed] { display: none !important; }';
    document.head.appendChild(style);

    var allElements = document.querySelectorAll('*');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      if (el.id === 'vdiff-overlay-container' || el.id === 'vdiff-toolbar-host') continue;
      var pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        el.setAttribute('data-vdiff-was-fixed', '1');
        state.hiddenFixedElements.push(el);
      }
    }
  }

  function showFixedElements() {
    for (var i = 0; i < state.hiddenFixedElements.length; i++) {
      state.hiddenFixedElements[i].removeAttribute('data-vdiff-was-fixed');
    }
    state.hiddenFixedElements = [];
    var style = document.getElementById('vdiff-hide-fixed');
    if (style) style.remove();
  }

  // --- Render Comparison ---

  async function handleRenderComparison(referenceDataUrl, screenshotDataUrl) {
    cleanup();

    var refImg, scrImg;
    await Promise.all([
      VDiff.utils.loadImage(referenceDataUrl).then(function (img) { refImg = img; }),
      VDiff.utils.loadImage(screenshotDataUrl).then(function (img) { scrImg = img; }),
    ]);

    state.referenceImg = refImg;
    state.screenshotImg = scrImg;

    var normalized = VDiff.utils.normalizeImages(refImg, scrImg);
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
        var prevMode = state.mode;
        state.mode = mode;
        // Release buffers not needed by the new mode.
        releaseUnusedBuffers(prevMode, mode);
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

  // --- Release buffers not needed by the current mode ---

  function releaseUnusedBuffers(prevMode, newMode) {
    // When leaving diff mode, free the diff buffer (it depends on density anyway).
    if (prevMode === 'diff' && newMode !== 'diff') {
      state.diffImageData = null;
      state.diffDensity = -1;
    }
    // When leaving heatmap mode, free the heatmap buffer.
    if (prevMode === 'heatmap' && newMode !== 'heatmap') {
      state.heatmapImageData = null;
    }
  }

  // --- Fast match % (no pixel output, just count) ---

  function computeMatchPercentage() {
    var ref = state.refImageData.data;
    var scr = state.scrImageData.data;
    var len = ref.length;
    var match = 0;
    var total = state.normalizedWidth * state.normalizedHeight;
    for (var i = 0; i < len; i += 4) {
      var rd = ref[i] - scr[i]; rd = rd < 0 ? -rd : rd;
      var gd = ref[i + 1] - scr[i + 1]; gd = gd < 0 ? -gd : gd;
      var bd = ref[i + 2] - scr[i + 2]; bd = bd < 0 ? -bd : bd;
      if (rd + gd + bd <= 30) match++;
    }
    state.matchPercentage = ((match / total) * 100).toFixed(2);
  }

  // --- Lazy diff computation ---

  function ensureDiff() {
    if (state.diffImageData && state.diffDensity === state.density) return;
    var result = VDiff.diff.computeDiff(
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
    var m = state.mode;
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

  // --- Composite Image Generation (Memory-Capped) ---

  function imageDataToCanvas(imageData) {
    var c = document.createElement('canvas');
    c.width = imageData.width;
    c.height = imageData.height;
    c.getContext('2d').putImageData(imageData, 0, 0);
    return c;
  }

  function buildCompositeCanvas() {
    if (!state.referenceImg || !state.screenshotImg) return null;

    ensureDiff();
    ensureHeatmap();

    var w = state.normalizedWidth;
    var h = state.normalizedHeight;
    var gap = 16;
    var labelH = 32;
    var cols = 4;
    var totalW = w * cols + gap * (cols + 1);
    var totalH = h + labelH + gap * 2;

    // Check if composite would exceed pixel budget.
    // If so, scale down to fit.
    var totalPixels = totalW * totalH;
    var scale = 1;
    if (totalPixels > MAX_COMPOSITE_PIXELS) {
      scale = Math.sqrt(MAX_COMPOSITE_PIXELS / totalPixels);
      totalW = Math.round(totalW * scale);
      totalH = Math.round(totalH * scale);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      gap = Math.round(gap * scale);
      labelH = Math.round(labelH * scale);
    }

    var c = document.createElement('canvas');
    c.width = totalW;
    c.height = totalH;
    var ctx = c.getContext('2d');

    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, totalW, totalH);

    var fontSize = Math.max(8, Math.round(14 * scale));
    ctx.font = '600 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'middle';

    var imgY = labelH + gap;
    var labels = [
      { text: 'ORIGINAL', color: '#e94560' },
      { text: 'CURRENT', color: '#3c8cff' },
      { text: 'DIFF (' + state.matchPercentage + '% match)', color: '#e9a825' },
      { text: 'HEATMAP', color: '#c850c0' },
    ];

    for (var i = 0; i < cols; i++) {
      var lx = gap * (i + 1) + w * i;
      ctx.fillStyle = labels[i].color;
      ctx.fillText(labels[i].text, lx, labelH / 2 + gap / 2);
    }

    var x1 = gap;
    ctx.drawImage(state.referenceImg, x1, imgY, w, h);

    var x2 = gap * 2 + w;
    ctx.drawImage(state.screenshotImg, x2, imgY, w, h);

    var x3 = gap * 3 + w * 2;
    var diffCanvas = imageDataToCanvas(state.diffImageData);
    ctx.drawImage(diffCanvas, 0, 0, diffCanvas.width, diffCanvas.height, x3, imgY, w, h);

    var x4 = gap * 4 + w * 3;
    var heatCanvas = imageDataToCanvas(state.heatmapImageData);
    ctx.drawImage(heatCanvas, 0, 0, heatCanvas.width, heatCanvas.height, x4, imgY, w, h);

    return c;
  }

  function getCompositeDataUrl() {
    var c = buildCompositeCanvas();
    if (!c) return Promise.reject(new Error('No images to copy'));
    return Promise.resolve(c.toDataURL('image/png'));
  }

  function copyAllToClipboard() {
    var c = buildCompositeCanvas();
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
