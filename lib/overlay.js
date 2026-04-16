// Visual Diff Extension - Overlay / Diff / Side-by-Side Rendering (Optimized)
// Caches canvas contexts to avoid repeated getContext calls.

var VDiff = window.VDiff || {};

VDiff.overlay = {
  _ctxCache: new WeakMap(),

  _getCtx: function (canvas) {
    if (this._ctxCache.has(canvas)) {
      return this._ctxCache.get(canvas);
    }
    const ctx = canvas.getContext('2d');
    this._ctxCache.set(canvas, ctx);
    return ctx;
  },

  renderOverlay: function (canvas, screenshotImg, referenceImg, opacity) {
    const ctx = this._getCtx(canvas);
    const w = canvas.width, h = canvas.height;
    ctx.globalAlpha = 1.0;
    ctx.drawImage(screenshotImg, 0, 0, w, h);
    ctx.globalAlpha = opacity;
    ctx.drawImage(referenceImg, 0, 0, w, h);
    ctx.globalAlpha = 1.0;

    // Top-bar labels: ORIGINAL (left) and CURRENT (right)
    const labelH = 30, margin = 8, pad = 10, radius = 4;
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(233,69,96,0.9)';
    VDiff.overlay._roundRect(ctx, margin, margin, 88, labelH, radius);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('ORIGINAL', margin + pad, margin + labelH / 2);

    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    VDiff.overlay._roundRect(ctx, w - margin - 80, margin, 80, labelH, radius);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('CURRENT', w - margin - 80 + pad, margin + labelH / 2);
  },

  renderDiff: function (canvas, diffImageData) {
    const ctx = this._getCtx(canvas);
    ctx.putImageData(diffImageData, 0, 0);
  },

  renderHeatmap: function (canvas, heatmapImageData, screenshotImg, density) {
    const ctx = this._getCtx(canvas);
    const w = canvas.width, h = canvas.height;
    const alpha = 0.3 + (density != null ? density : 0.5) * 0.7;

    ctx.globalAlpha = 1.0;
    ctx.drawImage(screenshotImg, 0, 0, w, h);

    if (!this._heatmapTmp || this._heatmapTmp.width !== w || this._heatmapTmp.height !== h) {
      this._heatmapTmp = document.createElement('canvas');
      this._heatmapTmp.width = w;
      this._heatmapTmp.height = h;
    }
    this._heatmapTmp.getContext('2d').putImageData(heatmapImageData, 0, 0);

    ctx.globalAlpha = alpha;
    ctx.drawImage(this._heatmapTmp, 0, 0);
    ctx.globalAlpha = 1.0;
  },

  renderSideBySide: function (canvas, screenshotImg, referenceImg) {
    const ctx = this._getCtx(canvas);
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, w, h);

    const dividerW = 3;
    const gap = 8;
    const panelW = (w - dividerW) >> 1;
    const labelH = 30;
    const labelMargin = 8;
    const drawableY = labelH + labelMargin + gap;
    let drawableH = h - drawableY - gap;
    if (drawableH < 10) drawableH = h;

    const rightBoxX = panelW + dividerW;
    const boxW = panelW - (gap << 1);

    const refW = referenceImg.naturalWidth, refH = referenceImg.naturalHeight;
    const scrW = screenshotImg.naturalWidth, scrH = screenshotImg.naturalHeight;

    const lScale = Math.min(boxW / refW, drawableH / refH, 1);
    const lw = (refW * lScale + 0.5) | 0, lh = (refH * lScale + 0.5) | 0;
    const lx = ((boxW - lw) >> 1) + gap, ly = ((drawableH - lh) >> 1) + drawableY;

    const rScale = Math.min(boxW / scrW, drawableH / scrH, 1);
    const rw = (scrW * rScale + 0.5) | 0, rh = (scrH * rScale + 0.5) | 0;
    const rx = ((boxW - rw) >> 1) + rightBoxX + gap, ry = ((drawableH - rh) >> 1) + drawableY;

    ctx.drawImage(referenceImg, lx, ly, lw, lh);
    ctx.drawImage(screenshotImg, rx, ry, rw, rh);

    ctx.fillStyle = '#e94560';
    ctx.fillRect(panelW, 0, dividerW, h);

    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(233, 69, 96, 0.9)';
    VDiff.overlay._roundRect(ctx, gap, labelMargin, 96, labelH, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('ORIGINAL', gap + 12, labelMargin + (labelH >> 1));

    ctx.fillStyle = 'rgba(60, 140, 255, 0.9)';
    VDiff.overlay._roundRect(ctx, rightBoxX + gap, labelMargin, 88, labelH, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('CURRENT', rightBoxX + gap + 12, labelMargin + (labelH >> 1));

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - 0.5, ly - 0.5, lw + 1, lh + 1);
    ctx.strokeRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1);
  },

  _roundRect: function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },
};

window.VDiff = VDiff;
