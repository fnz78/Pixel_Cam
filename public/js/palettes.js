// Preset Palettes
export const PALETTES = {
  gb: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15]
  ],
  nes: [
    [0, 0, 0],
    [124, 124, 124],
    [188, 188, 188],
    [252, 252, 252],
    [0, 0, 252],
    [0, 168, 0],
    [248, 56, 0],
    [248, 184, 0],
    [0, 168, 252],
    [172, 124, 0],
    [164, 0, 164],
    [252, 120, 88]
  ],
  bw: [
    [26, 20, 36],
    [91, 75, 115],
    [169, 155, 196],
    [245, 239, 221]
  ],
  perler: [
    [255,255,255],[0,0,0],[182,32,37],[249,137,172],[43,76,155],[243,219,58],[46,129,74],[86,49,140],
    [238,93,40],[100,61,41],[134,137,140],[255,136,0],[126,41,84],[108,180,63],[0,159,181],[140,215,203]
  ],
  hama: [
    [255,255,255],[0,0,0],[185,22,28],[231,98,142],[24,53,143],[248,208,30],[24,114,53],[69,39,126],
    [235,78,32],[86,52,38],[130,131,133],[50,137,200],[115,183,76],[116,21,56],[88,19,44],[0,155,158]
  ]
};

// --- CIE76 Perceptual Color Matching math ---

// RGB to XYZ conversion
export function rgbToXyz(r, g, b) {
  let rL = r / 255;
  let gL = g / 255;
  let bL = b / 255;

  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

  rL *= 100;
  gL *= 100;
  bL *= 100;

  // Observer = 2°, Illuminant = D65
  const x = rL * 0.4124 + gL * 0.3576 + bL * 0.1805;
  const y = rL * 0.2126 + gL * 0.7152 + bL * 0.0722;
  const z = rL * 0.0193 + gL * 0.1192 + bL * 0.9505;

  return [x, y, z];
}

// XYZ to CIE L*a*b* conversion
export function xyzToLab(x, y, z) {
  // Reference White D65
  const xn = 95.047;
  const yn = 100.000;
  const zn = 108.883;

  let xR = x / xn;
  let yR = y / yn;
  let zR = z / zn;

  xR = xR > 0.008856 ? Math.pow(xR, 1 / 3) : 7.787 * xR + 16 / 116;
  yR = yR > 0.008856 ? Math.pow(yR, 1 / 3) : 7.787 * yR + 16 / 116;
  zR = zR > 0.008856 ? Math.pow(zR, 1 / 3) : 7.787 * zR + 16 / 116;

  const L = 116 * yR - 16;
  const a = 500 * (xR - yR);
  const b = 200 * (yR - zR);

  return [L, a, b];
}

export function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

// Delta E 76 color difference
export function deltaE76(labA, labB) {
  return Math.sqrt(
    Math.pow(labA[0] - labB[0], 2) +
    Math.pow(labA[1] - labB[1], 2) +
    Math.pow(labA[2] - labB[2], 2)
  );
}

// Precomputes L*a*b* for a palette of [R,G,B] colors
export function precomputePaletteLabs(colors) {
  return colors.map(rgb => ({
    rgb,
    lab: rgbToLab(rgb[0], rgb[1], rgb[2])
  }));
}

// Matches R,G,B to nearest palette color using Euclidean Distance in RGB
export function nearestColorRgb(r, g, b, colors) {
  let bestColor = colors[0];
  let bestDist = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const d = Math.pow(r - c[0], 2) + Math.pow(g - c[1], 2) + Math.pow(b - c[2], 2);
    if (d < bestDist) {
      bestDist = d;
      bestColor = c;
    }
  }
  return bestColor;
}

// Matches R,G,B to nearest palette color using CIE76 Perceptual Distance
export function nearestColorCie76(r, g, b, precomputedLabs) {
  const targetLab = rgbToLab(r, g, b);
  let bestColor = precomputedLabs[0].rgb;
  let bestDist = Infinity;

  for (let i = 0; i < precomputedLabs.length; i++) {
    const entry = precomputedLabs[i];
    const dist = deltaE76(targetLab, entry.lab);
    if (dist < bestDist) {
      bestDist = dist;
      bestColor = entry.rgb;
    }
  }

  return bestColor;
}

// Color palettes Manager
export class PaletteManager {
  constructor() {
    this.customPalette = [
      [255, 111, 156], // Pink
      [94, 234, 212],  // Cyan
      [255, 209, 102], // Yellow
      [36, 27, 47],    // Dark Ink
      [245, 239, 221]  // Paper
    ];
    this.cachePrecomputed();
  }

  cachePrecomputed() {
    this.precomputed = {
      gb: precomputePaletteLabs(PALETTES.gb),
      nes: precomputePaletteLabs(PALETTES.nes),
      bw: precomputePaletteLabs(PALETTES.bw),
      perler: precomputePaletteLabs(PALETTES.perler),
      hama: precomputePaletteLabs(PALETTES.hama),
      custom: precomputePaletteLabs(this.customPalette)
    };
  }

  setCustomPalette(colors) {
    this.customPalette = colors;
    this.cachePrecomputed();
  }

  getPalette(mode) {
    if (mode === 'custom') return this.customPalette;
    return PALETTES[mode] || null;
  }

  quantizeColor(r, g, b, mode, useCie76 = true) {
    if (mode === 'full') {
      return [r, g, b];
    }
    if (mode === 'sepia') {
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      return [
        Math.min(255, Math.max(0, Math.round(tr))),
        Math.min(255, Math.max(0, Math.round(tg))),
        Math.min(255, Math.max(0, Math.round(tb)))
      ];
    }

    const precomputed = this.precomputed[mode];
    if (precomputed) {
      if (useCie76) {
        return nearestColorCie76(r, g, b, precomputed);
      } else {
        const rawPalette = this.getPalette(mode);
        return nearestColorRgb(r, g, b, rawPalette);
      }
    }

    // Default passthrough if mode unrecognized
    return [r, g, b];
  }
}

export const BEAD_METADATA = {
  perler: {
    "255,255,255": { name: "White", code: "P01", brand: "Perler" },
    "0,0,0": { name: "Black", code: "P18", brand: "Perler" },
    "182,32,37": { name: "Red", code: "P05", brand: "Perler" },
    "249,137,172": { name: "Pink", code: "P06", brand: "Perler" },
    "43,76,155": { name: "Blue", code: "P08", brand: "Perler" },
    "243,219,58": { name: "Yellow", code: "P03", brand: "Perler" },
    "46,129,74": { name: "Green", code: "P10", brand: "Perler" },
    "86,49,140": { name: "Purple", code: "P13", brand: "Perler" },
    "238,93,40": { name: "Orange", code: "P02", brand: "Perler" },
    "100,61,41": { name: "Brown", code: "P12", brand: "Perler" },
    "134,137,140": { name: "Grey", code: "P17", brand: "Perler" },
    "255,136,0": { name: "Cheddar", code: "P57", brand: "Perler" },
    "126,41,84": { name: "Plum", code: "P60", brand: "Perler" },
    "108,180,63": { name: "Kiwi Lime", code: "P69", brand: "Perler" },
    "0,159,181": { name: "Turquoise", code: "P70", brand: "Perler" },
    "140,215,203": { name: "Toothpaste", code: "P92", brand: "Perler" }
  },
  hama: {
    "255,255,255": { name: "White", code: "H01", brand: "Hama" },
    "0,0,0": { name: "Black", code: "H18", brand: "Hama" },
    "185,22,28": { name: "Red", code: "H05", brand: "Hama" },
    "231,98,142": { name: "Pink", code: "H06", brand: "Hama" },
    "24,53,143": { name: "Blue", code: "H08", brand: "Hama" },
    "248,208,30": { name: "Yellow", code: "H03", brand: "Hama" },
    "24,114,53": { name: "Green", code: "H10", brand: "Hama" },
    "69,39,126": { name: "Purple", code: "H13", brand: "Hama" },
    "235,78,32": { name: "Orange", code: "H02", brand: "Hama" },
    "86,52,38": { name: "Brown", code: "H12", brand: "Hama" },
    "130,131,133": { name: "Grey", code: "H17", brand: "Hama" },
    "50,137,200": { name: "Light Blue", code: "H09", brand: "Hama" },
    "115,183,76": { name: "Light Green", code: "H11", brand: "Hama" },
    "116,21,56": { name: "Claret", code: "H29", brand: "Hama" },
    "88,19,44": { name: "Burgundy", code: "H30", brand: "Hama" },
    "0,155,158": { name: "Turquoise", code: "H31", brand: "Hama" }
  }
};
