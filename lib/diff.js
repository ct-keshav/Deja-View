// Visual Diff Extension - Pixel-by-Pixel Diff

var VDiff = window.VDiff || {};

VDiff.diff = {
  /**
   * Red/green per-pixel diff with density control.
   * Heatmap is computed separately via computeHeatmap() — only when needed.
   */
  computeDiff: function (refImageData, scrImageData, width, height, threshold, density) {
    threshold = threshold | 0 || 30;
    density = density != null ? density : 0.5;

    const refData = refImageData.data;
    const scrData = scrImageData.data;
    const len = refData.length;
    const diffData = new Uint8ClampedArray(len);
    let matchCount = 0;

    const tint256 = ((0.15 + density * 0.80) * 256) | 0;
    const cont256 = 256 - tint256;

    const greenR = (30 * tint256) | 0;
    const greenG = (200 * tint256) | 0;
    const greenB = (30 * tint256) | 0;
    const redR = (240 * tint256) | 0;
    const redG = (30 * tint256) | 0;
    const redB = (30 * tint256) | 0;

    for (let i = 0; i < len; i += 4) {
      const rRef = refData[i], gRef = refData[i + 1], bRef = refData[i + 2];
      const rScr = scrData[i], gScr = scrData[i + 1], bScr = scrData[i + 2];

      let rd = rRef - rScr; rd = rd < 0 ? -rd : rd;
      let gd = gRef - gScr; gd = gd < 0 ? -gd : gd;
      let bd = bRef - bScr; bd = bd < 0 ? -bd : bd;

      if (rd + gd + bd <= threshold) {
        diffData[i]     = (rScr * cont256 + greenR) >> 8;
        diffData[i + 1] = (gScr * cont256 + greenG) >> 8;
        diffData[i + 2] = (bScr * cont256 + greenB) >> 8;
        diffData[i + 3] = 255;
        matchCount++;
      } else {
        const avgR = (rRef + rScr) >> 1;
        const avgG = (gRef + gScr) >> 1;
        const avgB = (bRef + bScr) >> 1;
        diffData[i]     = (avgR * cont256 + redR) >> 8;
        diffData[i + 1] = (avgG * cont256 + redG) >> 8;
        diffData[i + 2] = (avgB * cont256 + redB) >> 8;
        diffData[i + 3] = 255;
      }
    }

    return {
      diffImageData: new ImageData(diffData, width, height),
      matchPercentage: ((matchCount / (width * height)) * 100).toFixed(2),
    };
  },

  /**
   * Heatmap: per-pixel diff magnitude -> blue->cyan->green->yellow->red.
   * Computed lazily, only when heatmap mode is selected.
   */
  computeHeatmap: function (refImageData, scrImageData, width, height) {
    const refData = refImageData.data;
    const scrData = scrImageData.data;
    const len = refData.length;
    const out = new Uint8ClampedArray(len);

    for (let i = 0; i < len; i += 4) {
      let rd = refData[i] - scrData[i]; rd = rd < 0 ? -rd : rd;
      let gd = refData[i + 1] - scrData[i + 1]; gd = gd < 0 ? -gd : gd;
      let bd = refData[i + 2] - scrData[i + 2]; bd = bd < 0 ? -bd : bd;

      let t = (rd + gd + bd) / 765;
      if (t > 1) t = 1;

      let r, g, b;
      if (t < 0.25) {
        const s = t * 4;
        r = 0; g = (s * 255) | 0; b = ((1 - s) * 255) | 0;
      } else if (t < 0.5) {
        const s = (t - 0.25) * 4;
        r = 0; g = 255; b = ((1 - s) * 255) | 0;
      } else if (t < 0.75) {
        const s = (t - 0.5) * 4;
        r = (s * 255) | 0; g = 255; b = 0;
      } else {
        const s = (t - 0.75) * 4;
        r = 255; g = ((1 - s) * 255) | 0; b = 0;
      }

      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
    }

    return new ImageData(out, width, height);
  },
};

window.VDiff = VDiff;
