(function () {
  // --- DOM Elements ---
  const sourceTabs = document.querySelectorAll('.source-tab');
  const panelUpload = document.getElementById('panel-upload');
  const panelTab = document.getElementById('panel-tab');

  // Upload panel
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const dropPrompt = document.getElementById('drop-zone-prompt');
  const previewContainer = document.getElementById('preview-container');
  const preview = document.getElementById('preview');
  const previewDims = document.getElementById('preview-dims');
  const clearBtn = document.getElementById('clear-btn');

  // Tab capture panel
  const step1Indicator = document.getElementById('step1-indicator');
  const step2Indicator = document.getElementById('step2-indicator');
  const step1Content = document.getElementById('step1-content');
  const step2Content = document.getElementById('step2-content');
  const currentTabInfo = document.getElementById('current-tab-info');
  const captureThisBtn = document.getElementById('capture-this-btn');
  const tabRefPreview = document.getElementById('tab-ref-preview');
  const tabRefDims = document.getElementById('tab-ref-dims');
  const recaptureBtn = document.getElementById('recapture-btn');
  const compareTabInfo = document.getElementById('compare-tab-info');
  const compareTabBtn = document.getElementById('compare-tab-btn');

  // Shared
  const options = document.getElementById('options');
  const removeFixedCheckbox = document.getElementById('remove-fixed');
  const captureDelaySlider = document.getElementById('capture-delay');
  const delayValue = document.getElementById('delay-value');
  const compareBtn = document.getElementById('compare-btn');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const statusEl = document.getElementById('status');

  // --- Constants ---
  var MAX_UPLOAD_FILE_SIZE = 20 * 1024 * 1024; // 20 MB file size
  var MAX_UPLOAD_PIXELS = 40_000_000; // 40M pixels (~160 MB RGBA)

  // --- State ---
  let referenceDataUrl = null;
  let activeSource = 'tab';

  // =====================
  // SOURCE TAB SWITCHING
  // =====================

  sourceTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      sourceTabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeSource = tab.dataset.source;

      panelUpload.hidden = activeSource !== 'upload';
      panelTab.hidden = activeSource !== 'tab';
      compareBtn.hidden = activeSource !== 'upload';
      options.hidden = true;

      if (activeSource === 'tab') {
        showCurrentTabInfo(currentTabInfo);
        checkExistingReference();
      }

      updateCompareButton();
    });
  });

  // =====================
  // UPLOAD / PASTE PANEL
  // =====================

  dropZone.addEventListener('click', function (e) {
    if (e.target.closest('.clear-btn')) return;
    fileInput.click();
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  document.addEventListener('paste', function (e) {
    if (activeSource !== 'upload') return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleFile(file);
        return;
      }
    }
  });

  clearBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    resetUpload();
  });

  function handleFile(file) {
    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      setStatus('File too large (max ' + Math.round(MAX_UPLOAD_FILE_SIZE / 1024 / 1024) + 'MB).', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      const img = new Image();
      img.onload = function () {
        var pixels = img.naturalWidth * img.naturalHeight;
        if (pixels > MAX_UPLOAD_PIXELS) {
          setStatus(
            'Image too large (' + img.naturalWidth + 'x' + img.naturalHeight +
            '). Max ~' + Math.round(Math.sqrt(MAX_UPLOAD_PIXELS)) + 'px per side.',
            true
          );
          return;
        }
        referenceDataUrl = dataUrl;
        previewDims.textContent = img.naturalWidth + ' x ' + img.naturalHeight + 'px';
        preview.src = referenceDataUrl;
        previewContainer.hidden = false;
        dropPrompt.hidden = true;
        options.hidden = false;
        updateCompareButton();
        setStatus('Reference loaded. Click "Capture & Compare".');
      };
      img.onerror = function () {
        setStatus('Could not decode image.', true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function resetUpload() {
    referenceDataUrl = null;
    preview.src = '';
    previewContainer.hidden = true;
    dropPrompt.hidden = false;
    fileInput.value = '';
    previewDims.textContent = '';
    if (activeSource === 'upload') {
      options.hidden = true;
      updateCompareButton();
      setStatus('');
    }
  }

  // =====================
  // CAPTURE FROM TAB
  // =====================

  async function showCurrentTabInfo(container) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        container.textContent = '';
        const card = document.createElement('div');
        card.className = 'current-tab-card';

        if (tab.favIconUrl) {
          const favicon = document.createElement('img');
          favicon.className = 'tab-item__favicon';
          favicon.src = tab.favIconUrl;
          favicon.addEventListener('error', function () { favicon.style.display = 'none'; });
          card.appendChild(favicon);
        }

        const title = document.createElement('span');
        title.className = 'current-tab-card__title';
        title.textContent = tab.title || tab.url || 'Untitled';
        card.appendChild(title);

        container.appendChild(card);
      }
    } catch (_) {}
  }

  async function checkExistingReference() {
    try {
      const resp = await sendMessage({ type: 'GET_REFERENCE' });
      if (resp && resp.dataUrl) {
        referenceDataUrl = resp.dataUrl;
        goToStep2();
      }
    } catch (_) {}
  }

  // Step 1: Capture this tab as reference
  captureThisBtn.addEventListener('click', async function () {
    captureThisBtn.disabled = true;
    setStatus('Capturing this tab...');

    try {
      const response = await sendMessage({ type: 'CAPTURE_CURRENT_TAB' });

      if (response && response.error) {
        setStatus('Error: ' + response.error, true);
        captureThisBtn.disabled = false;
        return;
      }

      referenceDataUrl = response.dataUrl;

      await sendMessage({ type: 'SET_REFERENCE', dataUrl: referenceDataUrl });

      goToStep2();
      setStatus('Reference captured! Now go to the new version tab and click "Compare Against This Tab".');
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      captureThisBtn.disabled = false;
    }
  });

  function goToStep2() {
    step1Content.hidden = true;
    step2Content.hidden = false;
    step1Indicator.classList.remove('active');
    step1Indicator.classList.add('done');
    step2Indicator.classList.add('active');

    tabRefPreview.src = referenceDataUrl;
    const img = new Image();
    img.onload = function () {
      tabRefDims.textContent = img.naturalWidth + ' x ' + img.naturalHeight + 'px';
    };
    img.src = referenceDataUrl;

    showCurrentTabInfo(compareTabInfo);
  }

  function goToStep1() {
    step1Content.hidden = false;
    step2Content.hidden = true;
    step1Indicator.classList.add('active');
    step1Indicator.classList.remove('done');
    step2Indicator.classList.remove('active');
    captureThisBtn.disabled = false;
    referenceDataUrl = null;
    showCurrentTabInfo(currentTabInfo);
    setStatus('');
  }

  recaptureBtn.addEventListener('click', function () {
    goToStep1();
  });

  // Step 2: Compare against this tab
  compareTabBtn.addEventListener('click', async function () {
    if (!referenceDataUrl) return;

    compareTabBtn.disabled = true;
    setStatus('Capturing current page and comparing...');

    try {
      await sendMessage({ type: 'SET_REFERENCE', dataUrl: referenceDataUrl });

      const response = await sendMessage({
        type: 'START_COMPARISON',
        options: {
          removeFixed: removeFixedCheckbox.checked,
          captureDelay: parseInt(captureDelaySlider.value, 10),
        },
      });

      if (response && response.error) {
        setStatus('Error: ' + response.error, true);
        compareTabBtn.disabled = false;
      } else {
        let msg = 'Comparison active. Check the page.';
        if (response && response.cappedHeight && response.scrollHeight > response.cappedHeight) {
          msg += ' Note: page height (' + response.scrollHeight + 'px) was capped to ' + response.cappedHeight + 'px to stay within memory limits.';
        }
        setStatus(msg);
        copyAllBtn.hidden = false;
      }
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      compareTabBtn.disabled = false;
    }
  });

  // =====================
  // OPTIONS
  // =====================

  captureDelaySlider.addEventListener('input', function () {
    delayValue.textContent = captureDelaySlider.value + 'ms';
  });

  // =====================
  // COMPARE (upload mode)
  // =====================

  function updateCompareButton() {
    compareBtn.disabled = !referenceDataUrl;
  }

  compareBtn.addEventListener('click', async function () {
    if (!referenceDataUrl) return;

    compareBtn.disabled = true;
    setStatus('Sending reference image...');

    try {
      await sendMessage({ type: 'SET_REFERENCE', dataUrl: referenceDataUrl });
      setStatus('Capturing current page...');

      const response = await sendMessage({
        type: 'START_COMPARISON',
        options: {
          removeFixed: removeFixedCheckbox.checked,
          captureDelay: parseInt(captureDelaySlider.value, 10),
        },
      });

      if (response && response.error) {
        setStatus('Error: ' + response.error, true);
        compareBtn.disabled = false;
      } else {
        let msg = 'Comparison active. Check the page.';
        if (response && response.cappedHeight && response.scrollHeight > response.cappedHeight) {
          msg += ' Note: page height (' + response.scrollHeight + 'px) was capped to ' + response.cappedHeight + 'px to stay within memory limits.';
        }
        setStatus(msg);
        copyAllBtn.hidden = false;
      }
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      compareBtn.disabled = false;
    }
  });

  // --- Copy All Images ---

  copyAllBtn.addEventListener('click', async function () {
    copyAllBtn.disabled = true;
    copyAllBtn.textContent = 'Copying...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const resp = await new Promise(function (resolve, reject) {
        chrome.tabs.sendMessage(tab.id, { type: 'COPY_ALL_IMAGES' }, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });

      if (resp && resp.error) {
        setStatus('Copy failed: ' + resp.error, true);
        copyAllBtn.disabled = false;
        copyAllBtn.textContent = 'Copy All Images to Clipboard';
        return;
      }

      const imgResp = await fetch(resp.dataUrl);
      const blob = await imgResp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setStatus('All images copied to clipboard!');
      copyAllBtn.textContent = 'Copied!';
      setTimeout(function () {
        copyAllBtn.disabled = false;
        copyAllBtn.textContent = 'Copy All Images to Clipboard';
      }, 1500);
    } catch (err) {
      setStatus('Copy failed: ' + err.message, true);
      copyAllBtn.disabled = false;
      copyAllBtn.textContent = 'Copy All Images to Clipboard';
    }
  });

  // Listen for comparison closed
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'COMPARISON_CLOSED') {
      updateCompareButton();
      compareTabBtn.disabled = false;
      copyAllBtn.hidden = true;
      setStatus('Comparison closed.');
    }
  });

  // =====================
  // HELPERS
  // =====================

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', !!isError);
  }

  function sendMessage(msg) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(msg, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // --- Init ---
  showCurrentTabInfo(currentTabInfo);
  checkExistingReference();
})();
