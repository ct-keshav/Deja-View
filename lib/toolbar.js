// Visual Diff Extension - Shadow DOM Toolbar

var VDiff = window.VDiff || {};

VDiff.toolbar = {
  create: function (options) {
    var t = VDiff.theme;

    const host = document.createElement('div');
    host.id = 'vdiff-toolbar-host';

    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML =
      '<style>' +
      ':host {' +
      '  position: fixed;' +
      '  top: 0;' +
      '  left: 0;' +
      '  right: 0;' +
      '  z-index: 2147483647;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '  transition: box-shadow 0.15s;' +
      '}' +
      '.toolbar {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 12px;' +
      '  padding: 8px 12px 8px 0;' +
      '  background: ' + t.bgSecondary + ';' +
      '  color: ' + t.textPrimary + ';' +
      '  font-size: 13px;' +
      '  box-shadow: ' + t.shadowOverlay + ';' +
      '  user-select: none;' +
      '  flex-wrap: wrap;' +
      '  border-radius: 0 0 ' + t.radiusSm + ' ' + t.radiusSm + ';' +
      '  border-bottom: 1px solid ' + t.borderDefault + ';' +
      '}' +
      '.drag-handle {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  padding: 0 10px;' +
      '  cursor: grab;' +
      '  align-self: stretch;' +
      '  color: ' + t.borderMuted + ';' +
      '  transition: color 0.15s;' +
      '  flex-shrink: 0;' +
      '}' +
      '.drag-handle:hover { color: ' + t.accentWarm + '; }' +
      '.drag-handle:active { cursor: grabbing; color: ' + t.accentWarm + '; }' +
      '.drag-handle svg { pointer-events: none; }' +
      ':host(.dragging) { transition: none; }' +
      ':host(.dragging) .drag-handle { cursor: grabbing; color: ' + t.accentWarm + '; }' +
      '.mode-group {' +
      '  display: flex;' +
      '  gap: 0;' +
      '  border-radius: ' + t.radiusSm + ';' +
      '  overflow: hidden;' +
      '  border: 1px solid ' + t.borderDefault + ';' +
      '  background: ' + t.bgPrimary + ';' +
      '}' +
      '.mode-btn {' +
      '  padding: 6px 12px;' +
      '  border: none;' +
      '  background: transparent;' +
      '  color: ' + t.textMuted + ';' +
      '  cursor: pointer;' +
      '  font-size: 11px;' +
      '  font-weight: 700;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.6px;' +
      '  transition: background 0.15s, color 0.15s;' +
      '}' +
      '.mode-btn:hover {' +
      '  color: ' + t.textPrimary + ';' +
      '  background: ' + t.tintAccent5 + ';' +
      '}' +
      '.mode-btn.active {' +
      '  background: ' + t.gradientAccent + ';' +
      '  color: #fff;' +
      '}' +
      '.separator {' +
      '  width: 1px;' +
      '  height: 24px;' +
      '  background: ' + t.borderDefault + ';' +
      '}' +
      '.slider-container {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 8px;' +
      '}' +
      '.slider-container label {' +
      '  font-size: 11px;' +
      '  font-weight: 600;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.5px;' +
      '  color: ' + t.textSecondary + ';' +
      '}' +
      '.slider-label-original {' +
      '  font-size: 11px;' +
      '  font-weight: 700;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.5px;' +
      '  color: #e94560;' +
      '}' +
      '.slider-label-current {' +
      '  font-size: 11px;' +
      '  font-weight: 700;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.5px;' +
      '  color: #3c8cff;' +
      '}' +
      '.slider-container input[type="range"] {' +
      '  width: 120px;' +
      '  height: 4px;' +
      '  accent-color: ' + t.accentWarm + ';' +
      '  cursor: pointer;' +
      '}' +
      '.slider-value {' +
      '  font-size: 12px;' +
      '  font-weight: 600;' +
      '  color: ' + t.accentWarm + ';' +
      '  min-width: 32px;' +
      '}' +
      '.match-score {' +
      '  font-size: 16px;' +
      '  font-weight: 700;' +
      '  margin-left: auto;' +
      '  padding: 4px 12px;' +
      '  border-radius: ' + t.radiusSm + ';' +
      '  background: ' + t.bgPrimary + ';' +
      '  border: 1px solid ' + t.borderDefault + ';' +
      '}' +
      '.match-score.high { color: ' + t.colorSuccess + '; }' +
      '.match-score.medium { color: ' + t.colorWarning + '; }' +
      '.match-score.low { color: ' + t.colorDanger + '; }' +
      '.legend {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 12px;' +
      '  font-size: 10px;' +
      '  color: ' + t.textSecondary + ';' +
      '}' +
      '.legend-item {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 4px;' +
      '}' +
      '.legend-swatch {' +
      '  width: 10px;' +
      '  height: 10px;' +
      '  border-radius: 2px;' +
      '  border: 1px solid rgba(255,255,255,0.1);' +
      '}' +
      '.action-btn {' +
      '  padding: 5px 12px;' +
      '  border: 1px solid ' + t.borderMuted + ';' +
      '  background: transparent;' +
      '  color: ' + t.textSecondary + ';' +
      '  cursor: pointer;' +
      '  border-radius: ' + t.radiusSm + ';' +
      '  font-size: 11px;' +
      '  font-weight: 600;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.5px;' +
      '  transition: all 0.15s;' +
      '}' +
      '.action-btn:hover {' +
      '  background: ' + t.gradientAccent + ';' +
      '  border-color: transparent;' +
      '  color: #fff;' +
      '}' +
      '.reset-on-close {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 4px;' +
      '  font-size: 10px;' +
      '  color: ' + t.textMuted + ';' +
      '  cursor: pointer;' +
      '}' +
      '.reset-on-close input { accent-color: ' + t.accentWarm + '; cursor: pointer; }' +
      '.hidden { display: none !important; }' +
      '</style>' +
      '<div class="toolbar">' +
      '  <div class="drag-handle" id="drag-handle" title="Drag to reposition">' +
      '    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">' +
      '      <circle cx="4" cy="3" r="1.5"/><circle cx="10" cy="3" r="1.5"/>' +
      '      <circle cx="4" cy="8" r="1.5"/><circle cx="10" cy="8" r="1.5"/>' +
      '      <circle cx="4" cy="13" r="1.5"/><circle cx="10" cy="13" r="1.5"/>' +
      '      <circle cx="4" cy="18" r="1.5"/><circle cx="10" cy="18" r="1.5"/>' +
      '    </svg>' +
      '  </div>' +
      '  <div class="mode-group">' +
      '    <button class="mode-btn active" data-mode="overlay">Overlay</button>' +
      '    <button class="mode-btn" data-mode="diff">Diff</button>' +
      '    <button class="mode-btn" data-mode="heatmap">Heatmap</button>' +
      '    <button class="mode-btn" data-mode="side-by-side">Side by Side</button>' +
      '  </div>' +
      '  <div class="separator"></div>' +
      '  <div class="slider-container" id="opacity-group">' +
      '    <span class="slider-label-original">ORIGINAL</span>' +
      '    <input type="range" min="0" max="100" value="50" id="opacity-slider">' +
      '    <span class="slider-label-current">CURRENT <span id="opacity-value">50%</span></span>' +
      '  </div>' +
      '  <div class="slider-container hidden" id="density-group">' +
      '    <label>Density</label>' +
      '    <input type="range" min="0" max="100" value="50" id="density-slider">' +
      '    <span class="slider-value" id="density-value">50%</span>' +
      '  </div>' +
      '  <div class="legend hidden" id="diff-legend">' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#30c830"></span> Match</div>' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#f03030"></span> Diff</div>' +
      '  </div>' +
      '  <div class="legend hidden" id="heatmap-legend">' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#00f"></span> None</div>' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#0ff"></span> Low</div>' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#0f0"></span> Med</div>' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#ff0"></span> High</div>' +
      '    <div class="legend-item"><span class="legend-swatch" style="background:#f00"></span> Max</div>' +
      '  </div>' +
      '  <div class="match-score" id="match-score">--</div>' +
      '  <button class="action-btn" id="copy-all-btn" title="Copy Original + Current + Diff as one image">' +
      '    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
      '    Copy All' +
      '  </button>' +
      '  <label class="reset-on-close" title="Clear the captured reference image when closing">' +
      '    <input type="checkbox" id="reset-on-close-cb"> Reset ref on close' +
      '  </label>' +
      '  <button class="action-btn" id="reset-btn">Reset</button>' +
      '  <button class="action-btn" id="close-btn">Close</button>' +
      '</div>';

    // --- Drag Logic ---

    const dragHandle = shadow.getElementById('drag-handle');
    let dragStartY = 0;
    let hostStartTop = 0;

    function onDragMove(e) {
      let newTop = hostStartTop + e.clientY - dragStartY;
      const maxTop = window.innerHeight - 50;
      if (newTop < 0) newTop = 0;
      else if (newTop > maxTop) newTop = maxTop;
      host.style.top = newTop + 'px';
    }

    function onDragEnd() {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      host.classList.remove('dragging');
    }

    dragHandle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragStartY = e.clientY;
      hostStartTop = parseInt(host.style.top, 10) || 0;
      host.classList.add('dragging');
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    });

    // --- Event Wiring ---

    const modeButtons = shadow.querySelectorAll('.mode-btn');
    const opacityGroup = shadow.getElementById('opacity-group');
    const densityGroup = shadow.getElementById('density-group');
    const diffLegend = shadow.getElementById('diff-legend');
    const heatmapLegend = shadow.getElementById('heatmap-legend');

    function updateControlsForMode(mode) {
      opacityGroup.classList.toggle('hidden', mode !== 'overlay');
      densityGroup.classList.toggle('hidden', mode !== 'diff' && mode !== 'heatmap');
      diffLegend.classList.toggle('hidden', mode !== 'diff');
      heatmapLegend.classList.toggle('hidden', mode !== 'heatmap');
    }

    modeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        updateControlsForMode(mode);
        options.onModeChange(mode);
      });
    });

    const slider = shadow.getElementById('opacity-slider');
    const opacityLabel = shadow.getElementById('opacity-value');

    slider.addEventListener('input', function () {
      opacityLabel.textContent = slider.value + '%';
      options.onOpacityChange(slider.value / 100);
    });

    const densitySlider = shadow.getElementById('density-slider');
    const densityLabel = shadow.getElementById('density-value');

    densitySlider.addEventListener('input', function () {
      densityLabel.textContent = densitySlider.value + '%';
      options.onDensityChange(densitySlider.value / 100);
    });

    const resetOnCloseCb = shadow.getElementById('reset-on-close-cb');
    const copyAllBtn = shadow.getElementById('copy-all-btn');

    copyAllBtn.addEventListener('click', function () {
      copyAllBtn.textContent = 'Copying...';
      copyAllBtn.disabled = true;
      options.onCopyAll().then(function () {
        copyAllBtn.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg>Copied!';
        setTimeout(function () {
          copyAllBtn.disabled = false;
          copyAllBtn.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy All';
        }, 1500);
      }).catch(function () {
        copyAllBtn.textContent = 'Failed';
        copyAllBtn.disabled = false;
        setTimeout(function () {
          copyAllBtn.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy All';
        }, 1500);
      });
    });

    shadow.getElementById('close-btn').addEventListener('click', function () {
      options.onClose(resetOnCloseCb.checked);
    });
    shadow.getElementById('reset-btn').addEventListener('click', options.onReset);

    document.documentElement.appendChild(host);

    // --- Public API ---

    return {
      setMatchScore: function (pct) {
        const el = shadow.getElementById('match-score');
        const num = parseFloat(pct);
        el.textContent = pct + '%';

        el.classList.remove('high', 'medium', 'low');
        if (num >= 90) {
          el.classList.add('high');
        } else if (num >= 50) {
          el.classList.add('medium');
        } else {
          el.classList.add('low');
        }
      },

      setMode: function (mode) {
        modeButtons.forEach(function (b) {
          b.classList.toggle('active', b.dataset.mode === mode);
        });
        updateControlsForMode(mode);
      },

      getOpacity: function () {
        return slider.value / 100;
      },

      getDensity: function () {
        return densitySlider.value / 100;
      },

      destroy: function () {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        host.remove();
      },
    };
  },
};

window.VDiff = VDiff;
