// Visual Diff Extension - Background Service Worker (Memory-Safe)
// Uses chrome.storage.session to survive service worker restarts.

// --- Constants ---

// Max pixels for the stitched capture canvas (width * height).
// 60M pixels ≈ 240 MB RGBA — safe for most machines.
const MAX_CAPTURE_PIXELS = 60_000_000;

// Max height in CSS pixels before we cap the capture.
const MAX_CAPTURE_HEIGHT = 15_000;

// Max data-URL byte length we'll store in session storage (~10 MB encoded).
const MAX_STORAGE_BYTES = 10 * 1024 * 1024;

// --- Storage Setup ---

// Raise session storage quota to maximum (resets on browser restart anyway).
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
  });
});

// Also run on service-worker startup (covers restarts between installs).
try {
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
  });
} catch (_) {}

// --- Storage Helpers ---

async function getReference() {
  const result = await chrome.storage.session.get('referenceDataUrl');
  return result.referenceDataUrl || null;
}

async function setReference(dataUrl) {
  if (dataUrl) {
    if (dataUrl.length > MAX_STORAGE_BYTES) {
      // Downscale the image to fit storage quota.
      dataUrl = await downscaleDataUrl(dataUrl, MAX_STORAGE_BYTES);
    }
    try {
      await chrome.storage.session.set({ referenceDataUrl: dataUrl });
    } catch (err) {
      // Quota exceeded — try with more aggressive downscale.
      const smaller = await downscaleDataUrl(dataUrl, MAX_STORAGE_BYTES * 0.6);
      await chrome.storage.session.set({ referenceDataUrl: smaller });
    }
  } else {
    await chrome.storage.session.remove('referenceDataUrl');
  }
}

/**
 * Downscale a data URL until its byte length is under maxBytes.
 * Reduces dimensions by 25% each iteration (max 4 rounds).
 */
async function downscaleDataUrl(dataUrl, maxBytes) {
  let scale = 1;
  let result = dataUrl;
  for (let i = 0; i < 4 && result.length > maxBytes; i++) {
    scale *= 0.75;
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const bmp = await createImageBitmap(blob);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const outBlob = await canvas.convertToBlob({ type: 'image/png' });
    result = await blobToDataUrl(outBlob);
  }
  return result;
}

// --- Message Handling ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'SET_REFERENCE':
      setReference(msg.dataUrl).then(() => sendResponse({ ok: true }));
      return true;

    case 'GET_REFERENCE':
      getReference().then((dataUrl) => sendResponse({ dataUrl }));
      return true;

    case 'CAPTURE_CURRENT_TAB':
      handleCaptureCurrentTab()
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case 'START_COMPARISON':
      handleStartComparison(msg.options || {})
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case 'CLEAR_REFERENCE':
      setReference(null).then(() => sendResponse({ ok: true }));
      return true;

    case 'COMPARISON_CLOSED':
      chrome.runtime.sendMessage({ type: 'COMPARISON_CLOSED' }).catch(() => {});
      sendResponse({ ok: true });
      return false;

    default:
      return false;
  }
});

// --- Ensure Content Scripts Are Injected ---

async function ensureContentScripts(tabId) {
  try {
    await sendToContent(tabId, { type: 'PING' });
  } catch (_) {
    await Promise.all([
      chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'lib/theme.js',
          'lib/utils.js',
          'lib/diff.js',
          'lib/overlay.js',
          'lib/toolbar.js',
          'content/content.js',
        ],
      }),
      chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content/content.css'],
      }),
    ]);
  }
}

// --- Capture Current Tab ---

async function handleCaptureCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { error: 'No active tab found.' };
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { ok: true, dataUrl };
}

// --- Full-Page Capture & Comparison ---

async function handleStartComparison(options) {
  const referenceDataUrl = await getReference();
  if (!referenceDataUrl) return { error: 'No reference image uploaded.' };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { error: 'No active tab found.' };

  const tabId = tab.id;
  const windowId = tab.windowId;

  try {
    await ensureContentScripts(tabId);

    const dims = await sendToContent(tabId, { type: 'GET_PAGE_DIMS' });
    if (!dims || dims.scrollHeight == null || dims.viewportHeight == null) {
      return { error: 'Could not get page dimensions.' };
    }

    // Enforce pixel budget: cap effective height so canvas doesn't exceed MAX_CAPTURE_PIXELS.
    const dpr = dims.devicePixelRatio || 1;
    const canvasW = dims.scrollWidth * dpr;
    const maxHeightByPixels = Math.floor(MAX_CAPTURE_PIXELS / canvasW);
    const effectiveHeight = Math.min(dims.scrollHeight, MAX_CAPTURE_HEIGHT, Math.floor(maxHeightByPixels / dpr));

    if (options.removeFixed) {
      await sendToContent(tabId, { type: 'HIDE_FIXED_ELEMENTS' });
    }

    await sendToContent(tabId, { type: 'SAVE_SCROLL' });

    const captureDelay = options.captureDelay || 150;
    const stitchedDataUrl = await captureAndStitch(tabId, dims, effectiveHeight, captureDelay, windowId);

    await sendToContent(tabId, { type: 'RESTORE_SCROLL' });

    if (options.removeFixed) {
      await sendToContent(tabId, { type: 'SHOW_FIXED_ELEMENTS' });
    }

    await sendToContent(tabId, {
      type: 'RENDER_COMPARISON',
      reference: referenceDataUrl,
      screenshot: stitchedDataUrl,
    });

    return { ok: true, scrollHeight: dims.scrollHeight, cappedHeight: effectiveHeight };
  } catch (err) {
    try {
      await sendToContent(tabId, { type: 'RESTORE_SCROLL' });
      if (options.removeFixed) await sendToContent(tabId, { type: 'SHOW_FIXED_ELEMENTS' });
    } catch (_) {}
    return { error: err.message };
  }
}

// --- Capture & Stitch (Memory-Optimized) ---
// Captures one slice at a time, draws it to the canvas immediately,
// then discards the data URL and bitmap before moving to the next slice.

async function captureAndStitch(tabId, dims, effectiveHeight, captureDelay, windowId) {
  const { scrollWidth, viewportWidth, viewportHeight, devicePixelRatio } = dims;
  const dpr = devicePixelRatio || 1;
  const vSlices = Math.ceil(effectiveHeight / viewportHeight);
  const hSlices = Math.ceil(scrollWidth / viewportWidth);

  const canvasW = (scrollWidth * dpr) | 0;
  const canvasH = (effectiveHeight * dpr) | 0;

  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  for (let row = 0; row < vSlices; row++) {
    for (let col = 0; col < hSlices; col++) {
      const scrollX = col * viewportWidth;
      const scrollY = row * viewportHeight;

      await sendToContent(tabId, { type: 'SCROLL_FOR_CAPTURE', scrollX, scrollY });
      await delay(captureDelay);

      // Capture this viewport.
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });

      // Decode, draw, and immediately discard.
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const bmp = await createImageBitmap(blob);

      const clipW = (Math.min(viewportWidth, scrollWidth - scrollX) * dpr) | 0;
      const clipH = (Math.min(viewportHeight, effectiveHeight - scrollY) * dpr) | 0;
      const destX = (scrollX * dpr) | 0;
      const destY = (scrollY * dpr) | 0;

      ctx.drawImage(bmp, 0, 0, clipW, clipH, destX, destY, clipW, clipH);
      bmp.close();
      // dataUrl, resp, blob are now eligible for GC.
    }
  }

  // Convert final canvas to data URL once.
  const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(resultBlob);
}

// --- Helpers ---

function sendToContent(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
