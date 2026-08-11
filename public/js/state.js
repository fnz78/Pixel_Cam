export const DEFAULT_SETTINGS = {
  pixelSize: 9,
  dotFill: 0.88,
  shape: 'circle',
  palette: 'full',
  frameColor: '#F5EFDD',
  caption: '',
  glossIntensity: 0.16,
  showCraftGrid: false,
  previewFrame: false,
  ditherMode: 'none', // 'none', 'bayer4', 'floyd'
  zoom: 1.0,
  panX: 0,
  panY: 0,
  rotation: 0
};

export class StateManager {
  constructor() {
    this.current = { ...DEFAULT_SETTINGS };
    this.loadedImage = null;
    this.trayItems = []; // Array of { id, canvas, caption, frameColor, rotation }
    this.trashStack = []; // History stack for undoing deletions
    this.listeners = [];
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  notify(event) {
    for (const listener of this.listeners) {
      listener(event, this);
    }
  }

  set(key, value) {
    if (this.current[key] !== value) {
      this.current[key] = value;
      this.notify({ type: 'settings_change', key, value });
    }
  }

  setMultiple(obj) {
    let changed = false;
    for (const [key, value] of Object.entries(obj)) {
      if (this.current[key] !== value) {
        this.current[key] = value;
        changed = true;
      }
    }
    if (changed) {
      this.notify({ type: 'settings_change_multiple', settings: this.current });
    }
  }

  setImage(img) {
    this.loadedImage = img;
    // Reset pan/zoom on new image load
    this.current.zoom = 1.0;
    this.current.panX = 0;
    this.current.panY = 0;
    this.current.rotation = 0;
    this.notify({ type: 'image_load', image: img });
  }

  rotateImage() {
    this.current.rotation = (this.current.rotation + 90) % 360;
    this.notify({ type: 'image_rotate', rotation: this.current.rotation });
  }

  resetViewport() {
    this.current.zoom = 1.0;
    this.current.panX = 0;
    this.current.panY = 0;
    this.notify({ type: 'viewport_reset' });
  }

  addTrayItem(item) {
    this.trayItems.unshift(item);
    this.notify({ type: 'tray_add', item });
  }

  removeTrayItem(id) {
    const idx = this.trayItems.findIndex(item => item.id === id);
    if (idx !== -1) {
      const removed = this.trayItems.splice(idx, 1)[0];
      this.trashStack.push(removed);
      if (this.trashStack.length > 10) {
        this.trashStack.shift();
      }
      this.notify({ type: 'tray_remove', id, item: removed });
    }
  }

  undoDelete() {
    if (this.trashStack.length > 0) {
      const item = this.trashStack.pop();
      this.trayItems.unshift(item);
      this.notify({ type: 'tray_undo', item });
      return true;
    }
    return false;
  }

  clearTray() {
    if (this.trayItems.length > 0) {
      this.trashStack = [...this.trashStack, ...this.trayItems.reverse()];
      if (this.trashStack.length > 10) {
        this.trashStack = this.trashStack.slice(-10);
      }
      this.trayItems = [];
      this.notify({ type: 'tray_clear' });
    }
  }

  saveToUrl() {
    try {
      const settingsStr = JSON.stringify(this.current);
      const b64 = btoa(encodeURIComponent(settingsStr));
      window.location.hash = `presets=${b64}`;
    } catch (e) {
      console.error('Failed to save settings to URL:', e);
    }
  }

  loadFromUrl() {
    try {
      const hash = window.location.hash;
      if (hash.startsWith('#presets=')) {
        const b64 = hash.slice('#presets='.length);
        const settingsStr = decodeURIComponent(atob(b64));
        const settings = JSON.parse(settingsStr);
        this.setMultiple(settings);
        return true;
      }
    } catch (e) {
      console.error('Failed to load settings from URL:', e);
    }
    return false;
  }
}
