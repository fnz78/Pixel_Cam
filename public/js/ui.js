import { renderPixelated, drawPasses, drawCoverTransformed } from './renderer.js';
import { BEAD_METADATA } from './palettes.js';

export class UIManager {
  constructor(state, paletteManager, cameraManager) {
    this.state = state;
    this.palettes = paletteManager;
    this.camera = cameraManager;

    // Cache DOM Elements
    this.fileInput = document.getElementById('fileInput');
    this.webcamBtn = document.getElementById('webcamBtn');
    this.rotateBtn = document.getElementById('rotateBtn');
    this.viewfinder = document.getElementById('viewfinder');
    this.viewCanvas = document.getElementById('viewCanvas');
    this.emptyMsg = document.getElementById('emptyMsg');
    this.flashOverlay = document.getElementById('flashOverlay');
    this.cameraBody = document.getElementById('cameraBody');
    this.powerDot = document.getElementById('powerDot');
    this.shutterBtn = document.getElementById('shutterBtn');

    // Viewport HUD
    this.viewfinderHud = document.getElementById('viewfinderHud');

    // Controls
    this.pixelSizeInput = document.getElementById('pixelSize');
    this.pixelSizeLabel = document.getElementById('pixelSizeLabel');
    this.dotFillInput = document.getElementById('dotFill');
    this.dotFillLabel = document.getElementById('dotFillLabel');
    this.glossIntensityInput = document.getElementById('glossIntensity');
    this.glossIntensityLabel = document.getElementById('glossIntensityLabel');
    
    this.shapeSwatches = document.getElementById('shapeSwatches');
    this.paletteSwatches = document.getElementById('paletteSwatches');
    this.frameSwatches = document.getElementById('frameSwatches');
    
    this.captionInput = document.getElementById('captionInput');
    
    // Toggles
    this.ditherSelect = document.getElementById('ditherSelect');
    this.luminanceSizingCheck = document.getElementById('luminanceSizing');
    this.showCraftGridCheck = document.getElementById('showCraftGrid');
    this.previewFrameCheck = document.getElementById('previewFrame');

    // Tray
    this.tray = document.getElementById('tray');
    this.trayEmpty = document.getElementById('trayEmpty');
    this.clearTrayBtn = document.getElementById('clearTray');
    this.batchDownloadBtn = document.getElementById('batchDownload');
    this.undoDeleteBtn = document.getElementById('undoDeleteBtn');

    // Modals
    this.customPaletteModal = document.getElementById('customPaletteModal');
    this.paletteReportModal = document.getElementById('paletteReportModal');
    
    this.openPaletteReportBtn = document.getElementById('openPaletteReport');
    this.openCustomPaletteBtn = document.getElementById('openCustomPalette');
    this.exportSvgBtn = document.getElementById('exportSvgBtn');
    this.flipBtn = document.getElementById('flipBtn');

    this.beadReportBody = document.getElementById('beadReportBody');
    this.paletteBuilderGrid = document.getElementById('paletteBuilderGrid');
    
    // Printable
    this.printArea = document.getElementById('printArea');

    // Pan & Zoom mouse states
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Web Worker rendering offload
    this.worker = new Worker('./js/render-worker.js', { type: 'module' });
    this.renderRequestId = 0;
    this.pendingRender = null;
    this.worker.onmessage = (e) => {
      const { imgDataArray, requestId } = e.data;
      if (requestId === this.renderRequestId && this.pendingRender) {
        const { destCanvas, small, sw, sh, settings, startTime } = this.pendingRender;
        
        // Put the worker result back into small canvas
        const sctx = small.getContext('2d');
        const imgData = sctx.getImageData(0, 0, sw, sh);
        imgData.data.set(new Uint8ClampedArray(imgDataArray));
        sctx.putImageData(imgData, 0, 0);

        // Draw Passes (Pass A and Pass B) on main thread
        const stats = drawPasses(destCanvas, small, sw, sh, imgData, settings);
        
        const duration = (performance.now() - startTime).toFixed(1);
        this.latestStats = stats;

        if (this.state.loadedImage) {
          const cols = stats.columns || 0;
          const rows = stats.rows || 0;
          this.showHud(`RENDER: ${duration}ms (${cols}x${rows})`);
        }
        
        this.pendingRender = null;
      }
    };

    // Bind event listeners
    this.initEventListeners();
    this.initStateListeners();
  }

  initStateListeners() {
    this.state.onChange((event) => {
      switch (event.type) {
        case 'settings_change':
        case 'settings_change_multiple':
        case 'image_load':
        case 'image_rotate':
        case 'viewport_reset':
          this.refreshViewfinder();
          this.updatePreviewFrame();
          this.state.saveToUrl();
          break;
        case 'tray_add':
          this.renderTray();
          break;
        case 'tray_remove':
          this.renderTray();
          this.showUndoToast();
          break;
        case 'tray_undo':
          this.renderTray();
          break;
        case 'tray_clear':
          this.renderTray();
          this.showUndoToast();
          break;
      }
    });
  }

  initEventListeners() {
    // File inputs
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFileSelect(e.target.files[0]);
    });

    // Drag and drop
    ['dragover', 'dragenter'].forEach(evt => {
      this.viewfinder.addEventListener(evt, (e) => {
        e.preventDefault();
        this.viewfinder.classList.add('drag-over');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(evt => {
      this.viewfinder.addEventListener(evt, (e) => {
        e.preventDefault();
        this.viewfinder.classList.remove('drag-over');
      });
    });
    this.viewfinder.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) this.handleFileSelect(file);
    });

    // Panning on Viewfinder
    this.viewfinder.addEventListener('mousedown', (e) => {
      if (!this.state.loadedImage) return;
      this.isPanning = true;
      this.startX = e.clientX - this.state.current.panX;
      this.startY = e.clientY - this.state.current.panY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const panX = e.clientX - this.startX;
      const panY = e.clientY - this.startY;
      
      // Limit panning range slightly to keep image in view
      this.state.setMultiple({ panX, panY });
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    // Zooming on Viewfinder
    this.viewfinder.addEventListener('wheel', (e) => {
      if (!this.state.loadedImage) return;
      e.preventDefault();
      const zoomFactor = 0.08;
      let zoom = this.state.current.zoom + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
      zoom = Math.min(6.0, Math.max(0.4, zoom));
      this.state.set('zoom', zoom);
      
      // Show zoom HUD
      this.showHud(`ZOOM: ${Math.round(zoom * 100)}%`);
    });

    // Mobile touch gestures for pan/zoom
    let lastTouchDist = 0;
    this.viewfinder.addEventListener('touchstart', (e) => {
      if (!this.state.loadedImage) return;
      if (e.touches.length === 1) {
        this.isPanning = true;
        this.startX = e.touches[0].clientX - this.state.current.panX;
        this.startY = e.touches[0].clientY - this.state.current.panY;
      } else if (e.touches.length === 2) {
        lastTouchDist = this.getTouchDistance(e.touches);
      }
    });

    this.viewfinder.addEventListener('touchmove', (e) => {
      if (!this.state.loadedImage) return;
      if (e.touches.length === 1 && this.isPanning) {
        const panX = e.touches[0].clientX - this.startX;
        const panY = e.touches[0].clientY - this.startY;
        this.state.setMultiple({ panX, panY });
      } else if (e.touches.length === 2) {
        const dist = this.getTouchDistance(e.touches);
        const factor = dist / lastTouchDist;
        let zoom = this.state.current.zoom * factor;
        zoom = Math.min(6.0, Math.max(0.4, zoom));
        this.state.set('zoom', zoom);
        lastTouchDist = dist;
        this.showHud(`ZOOM: ${Math.round(zoom * 100)}%`);
      }
    });

    this.viewfinder.addEventListener('touchend', () => {
      this.isPanning = false;
    });

    // Rotate Button
    this.rotateBtn.addEventListener('click', () => {
      if (!this.state.loadedImage) return;
      this.state.rotateImage();
      this.showHud(`ROTATED: ${this.state.current.rotation}°`);
    });

    // Live Webcam access
    this.webcamBtn.addEventListener('click', async () => {
      if (this.camera.isActive()) {
        this.stopWebcam();
        this.showHud('WEBCAM OFF');
      } else {
        await this.startWebcam();
      }
    });

    // Sliders
    this.pixelSizeInput.addEventListener('input', () => {
      const val = parseInt(this.pixelSizeInput.value, 10);
      this.pixelSizeLabel.textContent = val;
      this.state.set('pixelSize', val);
    });

    this.dotFillInput.addEventListener('input', () => {
      const val = parseInt(this.dotFillInput.value, 10);
      this.dotFillLabel.textContent = val;
      this.state.set('dotFill', val / 100);
    });

    this.glossIntensityInput.addEventListener('input', () => {
      const val = parseInt(this.glossIntensityInput.value, 10);
      this.glossIntensityLabel.textContent = val;
      this.state.set('glossIntensity', val / 100);
    });

    // Swatches
    this.shapeSwatches.addEventListener('click', (e) => {
      const btn = e.target.closest('.shape-btn');
      if (!btn) return;
      const shape = btn.dataset.shape;
      [...this.shapeSwatches.children].forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      this.state.set('shape', shape);
    });

    this.paletteSwatches.addEventListener('click', (e) => {
      const btn = e.target.closest('.swatch');
      if (!btn) return;
      const palette = btn.dataset.palette;
      [...this.paletteSwatches.children].forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      this.state.set('palette', palette);
    });

    this.frameSwatches.addEventListener('click', (e) => {
      const btn = e.target.closest('.swatch');
      if (!btn) return;
      const frameColor = btn.dataset.frame;
      [...this.frameSwatches.children].forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      this.state.set('frameColor', frameColor);
    });

    // Toggles / Options
    this.ditherSelect.addEventListener('change', () => {
      this.state.set('ditherMode', this.ditherSelect.value);
    });

    this.luminanceSizingCheck.addEventListener('change', () => {
      this.state.set('luminanceSizing', this.luminanceSizingCheck.checked);
    });

    this.showCraftGridCheck.addEventListener('change', () => {
      this.state.set('showCraftGrid', this.showCraftGridCheck.checked);
    });

    this.previewFrameCheck.addEventListener('change', () => {
      this.state.set('previewFrame', this.previewFrameCheck.checked);
    });

    // Caption Input
    this.captionInput.addEventListener('input', () => {
      // Remove tags to avoid injection
      const sanitized = this.captionInput.value.replace(/[<>]/g, '');
      this.state.current.caption = sanitized;
      
      const captionEl = this.viewfinder.querySelector('.polaroid-preview-caption-text');
      if (captionEl) {
        captionEl.textContent = sanitized;
      }
    });

    // Shutter Trigger
    this.shutterBtn.addEventListener('click', () => {
      this.triggerShutter();
    });

    // Clear Tray
    this.clearTrayBtn.addEventListener('click', () => {
      this.state.clearTray();
    });

    // Batch Download ZIP
    this.batchDownloadBtn.addEventListener('click', () => {
      this.handleBatchDownload();
    });

    // Undo Toast Trigger
    this.undoDeleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.undoDelete();
      this.undoDeleteBtn.style.display = 'none';
    });

    // Modal triggers
    this.openPaletteReportBtn.addEventListener('click', () => {
      this.openBeadReport();
    });

    this.openCustomPaletteBtn.addEventListener('click', () => {
      this.openCustomPaletteBuilder();
    });

    this.flipBtn.addEventListener('click', async () => {
      if (this.camera.isActive()) {
        this.showHud('FLIPPING CAMERA...');
        try {
          await this.camera.toggleFacingMode();
          this.showHud('CAMERA FLIPPED');
        } catch (err) {
          this.showHud('FLIP FAILED');
        }
      }
    });

    this.exportSvgBtn.addEventListener('click', () => {
      this.downloadSVG();
    });

    // Setup modal overlay clicks to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
      overlay.querySelector('.modal-close').addEventListener('click', () => {
        overlay.classList.remove('active');
      });
    });
  }

  // --- File Verification & Loading ---
  async handleFileSelect(file) {
    if (!file) return;

    // Check size limit (20MB)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      this.shakeCamera();
      this.showHud('FILE TOO BIG (>20MB)');
      return;
    }

    // Verify magic bytes (PNG, JPG, GIF)
    const blob = file.slice(0, 4);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const arr = new Uint8Array(e.target.result);
      let isValid = false;
      
      // PNG: 89 50 4E 47
      if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) isValid = true;
      // JPG: FF D8 FF
      else if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) isValid = true;
      // GIF: 47 49 46
      else if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) isValid = true;
      // WebP (RIFF....WEBP)
      else if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46) isValid = true;

      if (!isValid && !file.type.startsWith('image/')) {
        this.shakeCamera();
        this.showHud('INVALID IMAGE FILE');
        return;
      }

      this.loadImage(file);
    };
    reader.onerror = () => {
      this.shakeCamera();
      this.showHud('ERROR READING FILE');
    };
    reader.readAsArrayBuffer(blob);
  }

  loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.stopWebcam(); // Turn off webcam if loading local image
        const processedImg = this.resizeImageIfNeeded(img);
        this.state.setImage(processedImg);
        this.emptyMsg.classList.add('hidden');
        this.powerDot.classList.add('ready');
        this.showHud('FILM LOADED');
      };
      img.onerror = () => {
        this.shakeCamera();
        this.showHud('CORRUPTED IMAGE');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  resizeImageIfNeeded(img) {
    const MAX_DIM = 4096;
    const w = img.width || img.videoWidth;
    const h = img.height || img.videoHeight;
    
    if (w <= MAX_DIM && h <= MAX_DIM) {
      return img;
    }
    
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    console.log(`Resized image from ${w}x${h} to ${canvas.width}x${canvas.height}`);
    return canvas;
  }

  updatePreviewFrame() {
    const isPreview = this.state.current.previewFrame;
    const frameColor = this.state.current.frameColor;
    const captionText = this.state.current.caption || '';
    
    if (isPreview) {
      this.viewfinder.classList.add('preview-active');
      this.viewfinder.style.setProperty('--preview-frame-color', frameColor);
      
      let pFrame = this.viewfinder.querySelector('.polaroid-preview-frame');
      if (!pFrame) {
        pFrame = document.createElement('div');
        pFrame.className = 'polaroid-preview-frame';
        pFrame.innerHTML = `
          <div class="polaroid-preview-frame-cutout"></div>
          <div class="polaroid-preview-caption-text"></div>
        `;
        this.viewfinder.appendChild(pFrame);
      }
      
      const captionEl = pFrame.querySelector('.polaroid-preview-caption-text');
      captionEl.textContent = captionText;
      captionEl.style.color = (frameColor === '#241B2F') ? '#F5EFDD' : '#241B2F';
    } else {
      this.viewfinder.classList.remove('preview-active');
    }
  }

  // --- Webcam Streams ---
  async startWebcam() {
    this.showHud('CONNECTING...');
    try {
      await this.camera.start();
      this.webcamBtn.innerHTML = `<svg class="pixel-icon" viewBox="0 0 16 16"><path d="M3 2h3v12H3zM10 2h3v12h-3z" fill="currentColor"/></svg> WEBCAM`;
      this.webcamBtn.classList.add('pressed');
      this.flipBtn.style.display = 'inline-flex';
      this.emptyMsg.classList.add('hidden');
      this.powerDot.classList.add('ready');
      this.showHud('LIVE VIEW');

      // Start rendering stream loop
      this.webcamLoop();
    } catch (e) {
      this.shakeCamera();
      this.showHud('WEBCAM ERROR');
      this.stopWebcam();
    }
  }

  stopWebcam() {
    this.camera.stop();
    this.webcamBtn.innerHTML = `<svg class="pixel-icon" viewBox="0 0 16 16"><path d="M5 2h6v2h2v10H3V4h2z" fill="currentColor"/><rect x="7" y="6" width="4" height="4" fill="var(--ink)"/><rect x="5" y="6" width="1" height="1" fill="var(--yellow)"/></svg> WEBCAM`;
    this.webcamBtn.classList.remove('pressed');
    this.flipBtn.style.display = 'none';
    if (!this.state.loadedImage) {
      this.emptyMsg.classList.remove('hidden');
      this.powerDot.classList.remove('ready');
    }
  }

  webcamLoop() {
    if (this.camera.isActive()) {
      const now = performance.now();
      if (!this.lastFpsUpdate) {
        this.lastFpsUpdate = now;
        this.frameCount = 0;
        this.currentFps = 0;
      }
      
      this.frameCount++;
      const elapsed = now - this.lastFpsUpdate;
      
      if (elapsed >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      const frame = this.camera.grabFrame();
      if (frame) {
        const startRender = performance.now();
        const stats = renderPixelated(this.viewCanvas, frame, this.state.current, this.palettes);
        const duration = (performance.now() - startRender).toFixed(1);
        
        const fpsText = this.currentFps ? ` | ${this.currentFps} FPS` : '';
        const cols = stats.columns || 0;
        const rows = stats.rows || 0;
        this.showHud(`LIVE: ${duration}ms (${cols}x${rows})${fpsText}`, false);
      }
      requestAnimationFrame(() => this.webcamLoop());
    } else {
      this.lastFpsUpdate = null;
    }
  }

  // --- Shutter Sequence ---
  triggerShutter() {
    let source = this.state.loadedImage;
    if (this.camera.isActive()) {
      source = this.camera.grabFrame();
    }

    if (!source) {
      this.shakeCamera();
      this.showHud('NO FILM LOADED');
      return;
    }

    // Shutter animation sequence
    this.flash();
    this.kachunk();
    
    // Extract canvas drawing state
    const shotCanvas = document.createElement('canvas');
    shotCanvas.width = 480;
    shotCanvas.height = 480;
    
    // Draw current pixelation state
    const renderStats = renderPixelated(shotCanvas, source, this.state.current, this.palettes);

    const rotationVal = (Math.random() * 8 - 4).toFixed(1);
    const trayItem = {
      id: Date.now(),
      canvas: shotCanvas,
      caption: this.state.current.caption.trim(),
      frameColor: this.state.current.frameColor,
      rotation: rotationVal,
      renderStats: renderStats,
      settingsSnapshot: { ...this.state.current }
    };

    // Eject Polaroid
    setTimeout(() => {
      this.state.addTrayItem(trayItem);
    }, 180);
  }

  flash() {
    this.flashOverlay.classList.add('active');
    setTimeout(() => this.flashOverlay.classList.remove('active'), 90);
  }

  kachunk() {
    this.cameraBody.classList.add('kachunk');
    setTimeout(() => this.cameraBody.classList.remove('kachunk'), 200);
  }

  shakeCamera() {
    this.cameraBody.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(0)' }
      ],
      { duration: 250 }
    );
  }

  // --- Redraw Viewfinder ---
  refreshViewfinder() {
    if (this.camera.isActive()) return; // webcamLoop handles its own drawing
    
    if (!this.state.loadedImage) {
      renderPixelated(this.viewCanvas, null, this.state.current, this.palettes);
      return;
    }

    const start = performance.now();
    const w = this.viewCanvas.width;
    const h = this.viewCanvas.height;
    
    const { pixelSize, zoom, panX, panY, rotation } = this.state.current;
    const sw = Math.max(1, Math.floor(w / pixelSize));
    const sh = Math.max(1, Math.floor(h / pixelSize));

    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true;

    drawCoverTransformed(sctx, this.state.loadedImage, sw, sh, zoom, panX, panY, rotation);

    const imgData = sctx.getImageData(0, 0, sw, sh);
    const buffer = imgData.data.buffer;

    this.renderRequestId++;
    
    this.pendingRender = {
      destCanvas: this.viewCanvas,
      small,
      sw,
      sh,
      settings: { ...this.state.current },
      startTime: start
    };

    this.worker.postMessage({
      imgDataArray: buffer,
      sw,
      sh,
      settings: this.state.current,
      customPalette: this.palettes.customPalette,
      requestId: this.renderRequestId
    }, [buffer]);
  }

  // --- Tray Rendering ---
  renderTray() {
    // Clear current tray DOM except empty banner
    const cards = this.tray.querySelectorAll('.polaroid');
    cards.forEach(c => c.remove());

    if (this.state.trayItems.length === 0) {
      this.trayEmpty.style.display = 'block';
      this.batchDownloadBtn.disabled = true;
      return;
    }

    this.trayEmpty.style.display = 'none';
    this.batchDownloadBtn.disabled = false;

    this.state.trayItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'polaroid';
      card.style.setProperty('--frame', item.frameColor);
      card.style.background = item.frameColor;
      card.style.transform = `rotate(${item.rotation}deg)`;

      const photoWrap = document.createElement('div');
      photoWrap.className = 'polaroid__photo';

      const canvasCopy = document.createElement('canvas');
      canvasCopy.width = 300;
      canvasCopy.height = 300;
      const ctx = canvasCopy.getContext('2d');
      ctx.drawImage(item.canvas, 0, 0, 300, 300);

      const veil = document.createElement('div');
      veil.className = 'develop-veil';

      photoWrap.appendChild(canvasCopy);
      photoWrap.appendChild(veil);

      // Develop Loader Progress Bar (only run for the newly ejected polaroid, index === 0)
      const isNew = (index === 0 && !card.classList.contains('developed') && !item.developedMark);
      if (isNew) {
        item.developedMark = true;
        const loader = document.createElement('div');
        loader.className = 'develop-loader';
        
        const loaderText = document.createElement('span');
        loaderText.textContent = 'DEVELOPING: 0%';
        
        const bar = document.createElement('div');
        bar.className = 'develop-bar-fill';
        
        loader.appendChild(loaderText);
        loader.appendChild(bar);
        photoWrap.appendChild(loader);

        let progress = 0;
        const interval = setInterval(() => {
          progress += 5;
          if (progress > 100) progress = 100;
          
          loaderText.textContent = `DEVELOPING: ${progress}%`;
          bar.style.width = `${progress}%`;
          
          if (progress === 100) {
            clearInterval(interval);
            card.classList.add('developed');
            loader.remove();
          }
        }, 100);
      } else {
        card.classList.add('developed');
        veil.style.opacity = 0;
      }

      const caption = document.createElement('div');
      caption.className = 'polaroid__caption';
      caption.textContent = item.caption;
      if (item.frameColor === '#241B2F') {
        caption.style.color = '#F5EFDD';
      }

      // Actions Panel
      const actions = document.createElement('div');
      actions.className = 'polaroid__actions';

      // Download
      const dlBtn = document.createElement('button');
      dlBtn.className = 'polaroid-btn';
      dlBtn.title = 'Download PNG';
      dlBtn.textContent = '⭳';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadPolaroid(item);
      });

      // Clipboard
      const clipBtn = document.createElement('button');
      clipBtn.className = 'polaroid-btn copy-btn';
      clipBtn.title = 'Copy to Clipboard';
      clipBtn.textContent = '⎗';
      clipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyToClipboard(item);
      });

      // Delete
      const delBtn = document.createElement('button');
      delBtn.className = 'polaroid-btn delete-btn';
      delBtn.title = 'Delete Polaroid';
      delBtn.textContent = '✖';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.removeTrayItem(item.id);
      });

      actions.appendChild(dlBtn);
      actions.appendChild(clipBtn);

      // Share
      const shareBtn = document.createElement('button');
      shareBtn.className = 'polaroid-btn share-btn';
      shareBtn.title = 'Share Polaroid';
      shareBtn.textContent = '➦';
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sharePolaroid(item);
      });
      actions.appendChild(shareBtn);

      actions.appendChild(delBtn);

      card.appendChild(photoWrap);
      card.appendChild(caption);
      card.appendChild(actions);

      // Support clicking to load settings snapshot
      card.addEventListener('dblclick', () => {
        this.state.setMultiple(item.settingsSnapshot);
        this.showHud('SETTINGS RESTORED');
      });

      this.tray.appendChild(card);
    });
  }

  // --- Single Download PNG helper ---
  downloadPolaroid(item) {
    const compiled = this.compilePolaroidCanvas(item);
    compiled.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `pixelcam-${item.caption || 'shot'}-${item.id}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  // --- Copy to Clipboard helper ---
  copyToClipboard(item) {
    const compiled = this.compilePolaroidCanvas(item);
    compiled.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        this.showHud('COPIED TO CLIPBOARD');
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        this.showHud('COPY FAILED');
      }
    }, 'image/png');
  }

  sharePolaroid(item) {
    this.showHud('GENERATING SHARE...');
    
    const dataUrl = item.canvas.toDataURL('image/png');
    
    fetch('/api/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        caption: item.caption
      })
    })
    .then(async (res) => {
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Server error');
      }
      return res.json();
    })
    .then(async (data) => {
      const shareUrl = `${window.location.origin}/share.html?id=${data.id}`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'PIXELCAM Polaroid',
            text: item.caption ? `PIXELCAM: "${item.caption}"` : 'Check out this retro dot-art Polaroid!',
            url: shareUrl
          });
          this.showHud('SHARED LINK!');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      
      await navigator.clipboard.writeText(shareUrl);
      this.showHud('SECURE LINK COPIED!');
    })
    .catch((err) => {
      console.error('Sharing failed:', err);
      this.showHud('SHARING FAILED: ' + err.message.toUpperCase());
    });
  }

  // Bakes the high-res 480px + frame + caption into download asset canvas
  compilePolaroidCanvas(item) {
    const pad = 24;
    const photoSize = 480;
    const bottomPad = 96;
    
    const out = document.createElement('canvas');
    out.width = photoSize + pad * 2;
    out.height = photoSize + pad + bottomPad;
    const ctx = out.getContext('2d');
    
    // Draw frame color
    ctx.fillStyle = item.frameColor;
    ctx.fillRect(0, 0, out.width, out.height);
    
    // Draw canvas image
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(item.canvas, pad, pad, photoSize, photoSize);
    
    // Draw caption
    if (item.caption) {
      ctx.fillStyle = (item.frameColor === '#241B2F') ? '#F5EFDD' : '#241B2F';
      ctx.font = "32px 'VT323', monospace";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.caption, out.width / 2, photoSize + pad + bottomPad / 2, out.width - pad * 2);
    }
    
    return out;
  }

  // --- Batch Download Compilation ---
  async handleBatchDownload() {
    if (this.state.trayItems.length === 0) return;
    
    if (!window.JSZip) {
      this.showHud('JSZIP LOADING...');
      return;
    }

    this.showHud('ZIP PACKAGING...');
    const zip = new window.JSZip();

    // Map each tray item to blob
    const promises = this.state.trayItems.map((item, idx) => {
      return new Promise((resolve) => {
        const canvas = this.compilePolaroidCanvas(item);
        canvas.toBlob((blob) => {
          const paddedIdx = String(this.state.trayItems.length - idx).padStart(3, '0');
          const cleanCaption = (item.caption || 'shot').replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const fileName = `${paddedIdx}_pixelcam_${cleanCaption}.png`;
          zip.file(fileName, blob);
          resolve();
        }, 'image/png');
      });
    });

    await Promise.all(promises);

    zip.generateAsync({ type: 'blob' }).then((content) => {
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.download = `pixelcam_collection_${Date.now()}.zip`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.showHud('ZIP DOWNLOADED');
    });
  }

  // --- Custom Palette Builder Modal ---
  openCustomPaletteBuilder() {
    this.paletteBuilderGrid.innerHTML = '';
    const colors = this.palettes.customPalette;

    colors.forEach((color, idx) => {
      const hex = this.rgbToHex(color[0], color[1], color[2]);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'palette-builder-color';
      wrapper.style.backgroundColor = hex;

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = hex;
      picker.addEventListener('change', (e) => {
        const newRgb = this.hexToRgb(e.target.value);
        this.palettes.customPalette[idx] = newRgb;
        this.palettes.cachePrecomputed();
        wrapper.style.backgroundColor = e.target.value;
        this.state.set('palette', 'custom');
        this.refreshViewfinder();
      });

      const remove = document.createElement('button');
      remove.className = 'palette-builder-remove';
      remove.textContent = '✖';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.palettes.customPalette.length <= 2) {
          this.showHud('NEED AT LEAST 2 COLORS');
          return;
        }
        this.palettes.customPalette.splice(idx, 1);
        this.palettes.cachePrecomputed();
        this.openCustomPaletteBuilder(); // redraw
        this.state.set('palette', 'custom');
        this.refreshViewfinder();
      });

      wrapper.appendChild(picker);
      wrapper.appendChild(remove);
      this.paletteBuilderGrid.appendChild(wrapper);
    });

    // Add "+" color button if under 16 colors
    if (colors.length < 16) {
      const addBtn = document.createElement('div');
      addBtn.className = 'palette-builder-color palette-builder-add';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => {
        // duplicate last color
        const last = colors[colors.length - 1] || [255,255,255];
        this.palettes.customPalette.push([...last]);
        this.palettes.cachePrecomputed();
        this.openCustomPaletteBuilder();
        this.state.set('palette', 'custom');
        this.refreshViewfinder();
      });
      this.paletteBuilderGrid.appendChild(addBtn);
    }

    this.customPaletteModal.classList.add('active');
  }

  // --- Bead count popup & printing ---
  openBeadReport() {
    this.beadReportBody.innerHTML = '';
    const stats = this.latestStats;
    if (!stats || !stats.beadCounts || Object.keys(stats.beadCounts).length === 0) {
      this.beadReportBody.innerHTML = '<p>Load film first to compute bead counts.</p>';
      this.paletteReportModal.classList.add('active');
      return;
    }

    // Heading statistics
    const statsDiv = document.createElement('div');
    statsDiv.className = 'bead-report-stats';
    const totalBeads = Object.values(stats.beadCounts).reduce((a, b) => a + b, 0);
    statsDiv.textContent = `Grid size: ${stats.columns}x${stats.rows} | Total Beads: ${totalBeads}`;
    this.beadReportBody.appendChild(statsDiv);

    const list = document.createElement('div');
    list.className = 'bead-report-list';

    // Renders list of colors
    const sorted = Object.entries(stats.beadCounts).sort((a,b) => b[1] - a[1]);
    const currentPalette = this.state.current.palette;

    sorted.forEach(([rgbKey, count]) => {
      const rgb = rgbKey.split(',').map(Number);
      const hex = this.rgbToHex(rgb[0], rgb[1], rgb[2]);

      let displayName = hex.toUpperCase();
      const metadata = BEAD_METADATA[currentPalette] && BEAD_METADATA[currentPalette][rgbKey];
      if (metadata) {
        displayName = `${metadata.brand} #${metadata.code} ${metadata.name}`;
      }

      const row = document.createElement('div');
      row.className = 'bead-report-row';

      const colorInfo = document.createElement('div');
      colorInfo.className = 'bead-report-color-info';

      const box = document.createElement('div');
      box.className = 'bead-report-color-box';
      box.style.backgroundColor = `rgb(${rgbKey})`;

      const name = document.createElement('span');
      name.className = 'bead-report-color-name';
      name.textContent = displayName;

      colorInfo.appendChild(box);
      colorInfo.appendChild(name);

      const amt = document.createElement('div');
      amt.className = 'bead-report-count';
      amt.textContent = `${count} beads`;

      row.appendChild(colorInfo);
      row.appendChild(amt);
      list.appendChild(row);
    });

    this.beadReportBody.appendChild(list);

    // Print Grid layout action inside Report footer
    const printBtn = document.createElement('button');
    printBtn.className = 'btn success pixel-corners-sm pixel-corners';
    printBtn.style.marginTop = '18px';
    printBtn.style.width = '100%';
    printBtn.innerHTML = `<svg class="pixel-icon" viewBox="0 0 16 16" style="margin-right:8px;"><path d="M4 2h8v2H4zM2 5h12v6H2zM4 12h8v2H4z" fill="currentColor"/><rect x="3" y="7" width="2" height="2" fill="var(--ink)"/></svg> PRINT BEAD ART PATTERN`;
    printBtn.addEventListener('click', () => {
      this.preparePrintPattern(stats);
      window.print();
    });
    this.beadReportBody.appendChild(printBtn);

    this.paletteReportModal.classList.add('active');
  }

  // Prepares the print grid inside .print-area
  preparePrintPattern(stats) {
    this.printArea.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'print-header';
    
    const title = document.createElement('h1');
    title.textContent = 'PIXELCAM PRINTABLE PATTERN';
    
    const info = document.createElement('p');
    info.textContent = `Pattern Grid Size: ${stats.columns} cols x ${stats.rows} rows | Total Bead count: ${Object.values(stats.beadCounts).reduce((a, b) => a + b, 0)} beads`;
    
    header.appendChild(title);
    header.appendChild(info);
    this.printArea.appendChild(header);

    const container = document.createElement('div');
    container.className = 'print-grid-container';

    // Create a coordinates grid canvas for print layout
    const cWrapper = document.createElement('div');
    cWrapper.className = 'print-canvas-wrapper';
    
    const printCanvas = document.createElement('canvas');
    const cellScale = 20; // larger size for printing grid coordinates
    const gridPad = 26; // margin for row/col index labels
    printCanvas.width = stats.columns * cellScale + gridPad;
    printCanvas.height = stats.rows * cellScale + gridPad;

    const ctx = printCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, printCanvas.width, printCanvas.height);

    // Draw grid headers
    ctx.font = '9px monospace';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Column numbers (1 to C)
    for (let c = 0; c < stats.columns; c++) {
      ctx.fillText(c + 1, gridPad + c * cellScale + cellScale / 2, gridPad / 2);
    }
    // Row numbers (1 to R)
    ctx.textAlign = 'right';
    for (let r = 0; r < stats.rows; r++) {
      ctx.fillText(r + 1, gridPad - 6, gridPad + r * cellScale + cellScale / 2);
    }

    // Draw dots and grid cells
    for (let y = 0; y < stats.rows; y++) {
      for (let x = 0; x < stats.columns; x++) {
        const rgb = stats.cellColors[y][x];
        const cx = gridPad + x * cellScale + cellScale / 2;
        const cy = gridPad + y * cellScale + cellScale / 2;

        // Draw bead circle outline
        ctx.fillStyle = `rgb(${rgb.join(',')})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (cellScale / 2) * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw coordinate dot grid intersections helper lines
        ctx.strokeStyle = '#dddddd';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(gridPad + x * cellScale, gridPad + y * cellScale, cellScale, cellScale);
      }
    }

    cWrapper.appendChild(printCanvas);
    container.appendChild(cWrapper);

    // Print Legend Table
    const legend = document.createElement('table');
    legend.className = 'print-legend';
    legend.innerHTML = `
      <thead>
        <tr>
          <th>Color Swatch</th>
          <th>Hex Code</th>
          <th>Bead Quantity</th>
        </tr>
      </thead>
      <tbody>
    `;

    const sorted = Object.entries(stats.beadCounts).sort((a,b) => b[1] - a[1]);
    const currentPalette = this.state.current.palette;

    sorted.forEach(([rgbKey, count]) => {
      const rgb = rgbKey.split(',').map(Number);
      const hex = this.rgbToHex(rgb[0], rgb[1], rgb[2]);

      let displayName = hex.toUpperCase();
      const metadata = BEAD_METADATA[currentPalette] && BEAD_METADATA[currentPalette][rgbKey];
      if (metadata) {
        displayName = `${metadata.brand} #${metadata.code} ${metadata.name}`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="print-swatch" style="background-color:rgb(${rgbKey});"></div> rgb(${rgbKey})</td>
        <td>${displayName}</td>
        <td><strong>${count} beads</strong></td>
      `;
      legend.querySelector('tbody').appendChild(tr);
    });

    container.appendChild(legend);
    this.printArea.appendChild(container);
  }

  // --- Toast HUD feedback ---
  showHud(msg, autoHide = true) {
    this.viewfinderHud.textContent = msg.toUpperCase();
    this.viewfinderHud.style.display = 'block';
    
    // Clear old timer if active
    if (this.hudTimer) clearTimeout(this.hudTimer);
    
    if (autoHide) {
      this.hudTimer = setTimeout(() => {
        this.viewfinderHud.style.display = 'none';
      }, 2500);
    }
  }

  showUndoToast() {
    this.undoDeleteBtn.style.display = 'inline-flex';
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => {
      this.undoDeleteBtn.style.display = 'none';
    }, 8000);
  }

  // --- General Helpers ---
  getTouchDistance(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
  }

  downloadSVG() {
    const stats = this.latestStats;
    if (!stats || !stats.cellColors || stats.cellColors.length === 0) {
      this.showHud('LOAD FILM TO EXPORT SVG');
      return;
    }

    const { cellColors, columns, rows } = stats;
    const { shape, dotFill } = this.state.current;
    
    // Scale settings for high quality vector view
    const cellW = 10;
    const cellH = 10;
    const width = columns * cellW;
    const height = rows * cellH;
    const radius = Math.min(cellW, cellH) / 2 * dotFill;

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
    
    // Draw background (dark base shadow)
    svgContent += `  <rect width="100%" height="100%" fill="#0d0912"/>\n`;

    // Draw cells
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const rgb = cellColors[y][x];
        const fill = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        const cx = x * cellW + cellW / 2;
        const cy = y * cellH + cellH / 2;

        if (shape === 'circle') {
          svgContent += `  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(2)}" fill="${fill}"/>\n`;
        } else if (shape === 'diamond') {
          const topX = cx, topY = cy - radius;
          const rightX = cx + radius, rightY = cy;
          const bottomX = cx, bottomY = cy + radius;
          const leftX = cx - radius, leftY = cy;
          svgContent += `  <polygon points="${topX.toFixed(1)},${topY.toFixed(1)} ${rightX.toFixed(1)},${rightY.toFixed(1)} ${bottomX.toFixed(1)},${bottomY.toFixed(1)} ${leftX.toFixed(1)},${leftY.toFixed(1)}" fill="${fill}"/>\n`;
        } else {
          // Square
          const rx = cx - radius;
          const ry = cy - radius;
          const rw = radius * 2;
          const rh = radius * 2;
          svgContent += `  <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="${fill}"/>\n`;
        }
      }
    }

    svgContent += `</svg>`;

    // Initiate download
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `pixelcam-dotart-${Date.now()}.svg`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.showHud('SVG EXPORTED');
  }
}
