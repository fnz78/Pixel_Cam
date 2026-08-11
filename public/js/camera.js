export class CameraManager {
  constructor() {
    this.video = document.createElement('video');
    this.video.id = 'webcamVideo';
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.style.display = 'none';
    document.body.appendChild(this.video);

    this.stream = null;
    this.facingMode = 'user'; // 'user' or 'environment'
  }

  async start(facingMode = 'user') {
    this.stop();
    this.facingMode = facingMode;
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 640 },
        facingMode: this.facingMode
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      // Wait for metadata to load so size is known
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          resolve(this.video);
        };
      });
      await this.video.play();
      return this.video;
    } catch (err) {
      console.error("Camera access failed:", err);
      throw err;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  isActive() {
    return this.stream !== null && this.stream.active;
  }

  async toggleFacingMode() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.isActive()) {
      return await this.start(this.facingMode);
    }
    return null;
  }

  // Grabs current video frame as a canvas element (fast, zero memory leaks)
  grabFrame() {
    if (!this.isActive() || this.video.paused || this.video.ended) return null;
    
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const size = Math.min(vw, vh);
    
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Crop center square
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;
    ctx.drawImage(this.video, sx, sy, size, size, 0, 0, size, size);
    
    // Also tag it so the renderer knows it can treat it like an Image
    return canvas;
  }
}
