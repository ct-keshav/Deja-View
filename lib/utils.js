// Visual Diff Extension - Shared Utilities (Optimized)

var VDiff = window.VDiff || {};

VDiff.utils = {
  loadImage: function (dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load image')); };
      img.src = dataUrl;
    });
  },

  /**
   * Normalize two images to the same dimensions.
   * Reuses a single canvas to avoid extra allocations.
   */
  normalizeImages: function (refImg, scrImg) {
    const width = Math.max(refImg.naturalWidth, scrImg.naturalWidth);
    const height = Math.max(refImg.naturalHeight, scrImg.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(refImg, 0, 0, width, height);
    const refImageData = ctx.getImageData(0, 0, width, height);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(scrImg, 0, 0, width, height);
    const scrImageData = ctx.getImageData(0, 0, width, height);

    return {
      width: width,
      height: height,
      refImageData: refImageData,
      scrImageData: scrImageData,
    };
  },
};

window.VDiff = VDiff;
