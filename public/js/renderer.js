import { rgbToLab, deltaE76 } from './palettes.js';

// Bayer 4x4 threshold matrix
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

// Helper to draw cover-cropped image with zoom, pan, and rotation
export function drawCoverTransformed(ctx, img, targetW, targetH, zoom, panX, panY, rotation) {
  ctx.save();
  ctx.translate(targetW / 2, targetH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(zoom, zoom);
  
  // Scale the pan offsets from viewfinder space (480px base) to target canvas space
  const scale = targetW / 480;
  ctx.translate(panX * scale, panY * scale);

  const imgW = img.width || img.videoWidth || targetW;
  const imgH = img.height || img.videoHeight || targetH;
  
  const ir = imgW / imgH;
  const tr = 1.0; // Viewfinder and Polaroids are always square 1:1

  let drawW, drawH;
  if (ir > tr) {
    drawH = targetH;
    drawW = targetH * ir;
  } else {
    drawW = targetW;
    drawH = targetW / ir;
  }

  // Draw image centered at (0,0)
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

// Draw a shape on canvas
export function drawShape(ctx, cx, cy, r, shapeType) {
  ctx.beginPath();
  if (shapeType === 'circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shapeType === 'diamond') {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  } else {
    // Square
    ctx.rect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.fill();
}

// Main rendering pipeline
export function renderPixelated(destCanvas, image, settings, paletteManager) {
  const w = destCanvas.width;
  const h = destCanvas.height;
  const dctx = destCanvas.getContext('2d');

  if (!image) {
    dctx.fillStyle = '#0d0912';
    dctx.fillRect(0, 0, w, h);
    return { cellColors: [], beadCounts: {} };
  }

  const {
    pixelSize,
    dotFill,
    shape,
    palette,
    glossIntensity,
    showCraftGrid,
    ditherMode,
    zoom,
    panX,
    panY,
    rotation,
    luminanceSizing // boolean
  } = settings;

  // Calculate grid dimensions
  const sw = Math.max(1, Math.floor(w / pixelSize));
  const sh = Math.max(1, Math.floor(h / pixelSize));

  // 1. Create a downsampled working canvas
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;

  // Draw cover-cropped image onto small canvas
  drawCoverTransformed(sctx, image, sw, sh, zoom, panX, panY, rotation);

  // 2. Perform palette quantization and optional dithering on the small canvas
  const imgData = sctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;

  if (ditherMode === 'floyd' && palette !== 'full' && palette !== 'sepia') {
    // Floyd-Steinberg Error Diffusion
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

        // Distribute errors
        distributeError(data, sw, sh, x + 1, y,     errR, errG, errB, 7 / 16);
        distributeError(data, sw, sh, x - 1, y + 1, errR, errG, errB, 3 / 16);
        distributeError(data, sw, sh, x,     y + 1, errR, errG, errB, 5 / 16);
        distributeError(data, sw, sh, x + 1, y + 1, errR, errG, errB, 1 / 16);
      }
    }
  } else if (ditherMode === 'bayer4' && palette !== 'full' && palette !== 'sepia') {
    // Bayer 4x4 Ordered Dithering
    const spread = 40; // Dither pattern contrast spread
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
    // standard quantization without dithering
    for (let i = 0; i < data.length; i += 4) {
      const [newR, newG, newB] = paletteManager.quantizeColor(data[i], data[i+1], data[i+2], palette);
      data[i] = newR;
      data[i + 1] = newG;
      data[i + 2] = newB;
    }
  }

  sctx.putImageData(imgData, 0, 0);
  return drawPasses(destCanvas, small, sw, sh, imgData, settings);
}

// Distribute error for Floyd-Steinberg
function distributeError(data, w, h, x, y, errR, errG, errB, weight) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = (y * w + x) * 4;
  data[idx]     = Math.min(255, Math.max(0, data[idx]     + errR * weight));
  data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + errG * weight));
  data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + errB * weight));
}

// Draw passes (Pass A and Pass B) on the main thread canvas
export function drawPasses(destCanvas, smallCanvas, sw, sh, imgData, settings) {
  const w = destCanvas.width;
  const h = destCanvas.height;
  const dctx = destCanvas.getContext('2d');
  
  const {
    dotFill,
    shape,
    glossIntensity,
    showCraftGrid,
    luminanceSizing
  } = settings;

  // 3. PASS A — Hue-Correct Darkened Base Layer (drawn blocky)
  dctx.imageSmoothingEnabled = false;
  dctx.clearRect(0, 0, w, h);
  dctx.drawImage(smallCanvas, 0, 0, sw, sh, 0, 0, w, h);
  
  // Blend with dark overlay to make a dark pegboard shadow showing hue
  dctx.fillStyle = 'rgba(4, 6, 14, 0.55)';
  dctx.fillRect(0, 0, w, h);

  // 4. PASS B — Dot/Bead Art overlay
  const cellW = w / sw;
  const cellH = h / sh;
  const baseRadius = Math.min(cellW, cellH) / 2 * dotFill;

  // Track colors for reports
  const beadCounts = {};
  const cellColors = [];
  const data = imgData.data;

  for (let y = 0; y < sh; y++) {
    const rowColors = [];
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const rgbKey = `${r},${g},${b}`;

      rowColors.push([r, g, b]);
      beadCounts[rgbKey] = (beadCounts[rgbKey] || 0) + 1;

      const cx = x * cellW + cellW / 2;
      const cy = y * cellH + cellH / 2;

      // Sizing calculation based on luminance
      let radius = baseRadius;
      if (luminanceSizing) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        radius = baseRadius * (0.35 + 0.65 * lum);
      }

      // Draw main bead shape
      dctx.fillStyle = `rgb(${r},${g},${b})`;
      drawShape(dctx, cx, cy, radius, shape);

      // Draw gloss specular highlight
      if (radius > 3 && glossIntensity > 0) {
        dctx.fillStyle = `rgba(255, 255, 255, ${glossIntensity})`;
        const glossRad = radius * 0.32;
        drawShape(dctx, cx - radius * 0.3, cy - radius * 0.3, glossRad, shape);
      }

      // Draw craft peg board holes if enabled
      if (showCraftGrid) {
        dctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        dctx.lineWidth = 1;
        dctx.strokeRect(x * cellW, y * cellH, cellW, cellH);
      }
    }
    cellColors.push(rowColors);
  }

  return {
    cellColors,
    beadCounts,
    columns: sw,
    rows: sh
  };
}
