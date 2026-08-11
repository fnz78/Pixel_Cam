import { StateManager } from './state.js';
import { PaletteManager } from './palettes.js';
import { CameraManager } from './camera.js';
import { UIManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Managers
  const state = new StateManager();
  const paletteManager = new PaletteManager();
  const cameraManager = new CameraManager();
  const ui = new UIManager(state, paletteManager, cameraManager);

  // Load Presets from URL if present
  const hasUrlPresets = state.loadFromUrl();

  // Sync inputs with loaded state
  syncInputsWithState(state, ui);

  // If preset loaded and we have state values, trigger initial refresh
  ui.refreshViewfinder();
  
  // Set up sync listener for multiple settings updates (e.g. from preset URLs)
  state.onChange((event) => {
    if (event.type === 'settings_change_multiple') {
      syncInputsWithState(state, ui);
    }
  });

  // Register Service Worker for offline/PWA capabilities
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('ServiceWorker registered:', reg.scope))
        .catch((err) => console.error('ServiceWorker registration failed:', err));
    });
  }
});

function syncInputsWithState(state, ui) {
  const current = state.current;

  // Sync Slider values and Labels
  ui.pixelSizeInput.value = current.pixelSize;
  ui.pixelSizeLabel.textContent = current.pixelSize;

  ui.dotFillInput.value = Math.round(current.dotFill * 100);
  ui.dotFillLabel.textContent = Math.round(current.dotFill * 100);

  ui.glossIntensityInput.value = Math.round(current.glossIntensity * 100);
  ui.glossIntensityLabel.textContent = Math.round(current.glossIntensity * 100);

  // Sync shape swatch active class
  [...ui.shapeSwatches.children].forEach(btn => {
    if (btn.dataset.shape === current.shape) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync palette active class
  [...ui.paletteSwatches.children].forEach(btn => {
    if (btn.dataset.palette === current.palette) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync frame active class
  [...ui.frameSwatches.children].forEach(btn => {
    if (btn.dataset.frame === current.frameColor) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync options dropdowns/checkboxes
  ui.ditherSelect.value = current.ditherMode;
  ui.luminanceSizingCheck.checked = current.luminanceSizing || false;
  ui.showCraftGridCheck.checked = current.showCraftGrid || false;
  ui.previewFrameCheck.checked = current.previewFrame || false;

  // Sync caption input
  ui.captionInput.value = current.caption || '';
}
