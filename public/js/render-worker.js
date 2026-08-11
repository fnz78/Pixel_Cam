import { PaletteManager } from './palettes.js';

const paletteManager = new PaletteManager();

const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

function distributeError(data, w, h, x, y, errR, errG, errB, weight) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = (y * w + x) * 4;
  data[idx]     = Math.min(255, Math.max(0, data[idx]     + errR * weight));
  data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + errG * weight));
  data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + errB * weight));
}

self.onmessage = function(e) {
  const { imgDataArray, sw, sh, settings, customPalette, requestId } = e.data;
  const { palette, ditherMode } = settings;

  if (customPalette) {
    paletteManager.setCustomPalette(customPalette);
  }

  const data = new Uint8ClampedArray(imgDataArray);

  if (ditherMode === 'floyd' && palette !== 'full' && palette !== 'sepia') {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const oldR = data[idx];
        const oldG = data[idx + 1];
        const oldB = data[idx + 2];

        const [newR, newG, newB] = paletteManager.quantizeColor(oldR, oldG, oldB, palette);
        data[idx] = newR;
        data[idx + 1] = newG;
        data[idx + 2] = newB;

        const errR = oldR - newR;
        const errG = oldG - newG;
        const errB = oldB - newB;

        distributeError(data, sw, sh, x + 1, y,     errR, errG, errB, 7 / 16);
        distributeError(data, sw, sh, x - 1, y + 1, errR, errG, errB, 3 / 16);
        distributeError(data, sw, sh, x,     y + 1, errR, errG, errB, 5 / 16);
        distributeError(data, sw, sh, x + 1, y + 1, errR, errG, errB, 1 / 16);
      }
    }
  } else if (ditherMode === 'bayer4' && palette !== 'full' && palette !== 'sepia') {
    const spread = 40;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const threshold = BAYER_4X4[y % 4][x % 4];
        const offset = (threshold / 16 - 0.5) * spread;

        const r = Math.min(255, Math.max(0, data[idx] + offset));
        const g = Math.min(255, Math.max(0, data[idx + 1] + offset));
        const b = Math.min(255, Math.max(0, data[idx + 2] + offset));

        const [newR, newG, newB] = paletteManager.quantizeColor(r, g, b, palette);
        data[idx] = newR;
        data[idx + 1] = newG;
        data[idx + 2] = newB;
      }
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      const [newR, newG, newB] = paletteManager.quantizeColor(data[i], data[i+1], data[i+2], palette);
      data[i] = newR;
      data[i + 1] = newG;
      data[i + 2] = newB;
    }
  }

  self.postMessage({ imgDataArray: data.buffer, requestId }, [data.buffer]);
};
