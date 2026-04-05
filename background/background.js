// Visual Diff Extension - Background Service Worker (Optimized)
// Uses chrome.storage.session to survive service worker restarts.

// --- Storage Helpers ---

async function getReference() {
  const result = await chrome.storage.session.get('referenceDataUrl');
  return result.referenceDataUrl || null;
}

async function setReference(dataUrl) {
  if (dataUrl) {
    await chrome.storage.session.set({ referenceDataUrl: dataUrl });
  } else {
    await chrome.storage.session.remove('referenceDataUrl');
  }
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

    if (options.removeFixed) {
      await sendToContent(tabId, { type: 'HIDE_FIXED_ELEMENTS' });
    }

    await sendToContent(tabId, { type: 'SAVE_SCROLL' });

    const captureDelay = options.captureDelay || 150;
    const captures = await captureAllSlices(tabId, dims, captureDelay, windowId);

    await sendToContent(tabId, { type: 'RESTORE_SCROLL' });

    if (options.removeFixed) {
      await sendToContent(tabId, { type: 'SHOW_FIXED_ELEMENTS' });
    }

    const stitchedDataUrl = await stitchCaptures(captures, dims);

    await sendToContent(tabId, {
      type: 'RENDER_COMPARISON',
      reference: referenceDataUrl,
      screenshot: stitchedDataUrl,
    });

    return { ok: true, scrollHeight: dims.scrollHeight };
  } catch (err) {
    try {
      await sendToContent(tabId, { type: 'RESTORE_SCROLL' });
      if (options.removeFixed) await sendToContent(tabId, { type: 'SHOW_FIXED_ELEMENTS' });
    } catch (_) {}
    return { error: err.message };
  }
}

// --- Capture Logic ---

async function captureAllSlices(tabId, dims, captureDelay, windowId) {
  const { scrollWidth, scrollHeight, viewportWidth, viewportHeight, devicePixelRatio } = dims;
  const effectiveHeight = Math.min(scrollHeight, 15000);
  const vSlices = Math.ceil(effectiveHeight / viewportHeight);
  const hSlices = Math.ceil(scrollWidth / viewportWidth);
  const dpr = devicePixelRatio;
  const captures = new Array(vSlices * hSlices);
  let idx = 0;

  for (let row = 0; row < vSlices; row++) {
    for (let col = 0; col < hSlices; col++) {
      const scrollX = col * viewportWidth;
      const scrollY = row * viewportHeight;

      await sendToContent(tabId, { type: 'SCROLL_FOR_CAPTURE', scrollX, scrollY });
      await delay(captureDelay);

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });

      captures[idx++] = {
        x: (scrollX * dpr) | 0,
        y: (scrollY * dpr) | 0,
        clipW: (Math.min(viewportWidth, scrollWidth - scrollX) * dpr) | 0,
        clipH: (Math.min(viewportHeight, effectiveHeight - scrollY) * dpr) | 0,
        dataUrl,
      };
    }
  }

  return captures;
}

// --- Stitching with OffscreenCanvas (Optimized) ---

async function stitchCaptures(captures, dims) {
  const { scrollWidth, scrollHeight, devicePixelRatio } = dims;
  const effectiveHeight = Math.min(scrollHeight, 15000);
  const canvasW = (scrollWidth * devicePixelRatio) | 0;
  const canvasH = (effectiveHeight * devicePixelRatio) | 0;

  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  const bitmaps = await Promise.all(
    captures.map(async (cap) => {
      const resp = await fetch(cap.dataUrl);
      const blob = await resp.blob();
      return createImageBitmap(blob);
    })
  );

  try {
    for (let i = 0; i < captures.length; i++) {
      const cap = captures[i];
      ctx.drawImage(bitmaps[i], 0, 0, cap.clipW, cap.clipH, cap.x, cap.y, cap.clipW, cap.clipH);
    }
  } finally {
    for (let i = 0; i < bitmaps.length; i++) {
      bitmaps[i].close();
    }
  }

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
