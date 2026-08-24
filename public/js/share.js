document.addEventListener('DOMContentLoaded', async () => {
  const loader = document.getElementById('loader');
  const errorBox = document.getElementById('errorBox');
  const polaroidCard = document.getElementById('polaroidCard');
  const canvas = document.getElementById('photoCanvas');
  const captionEl = document.getElementById('caption');
  const dlBtn = document.getElementById('dlBtn');

  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('id');

  if (!shareId) {
    loader.style.display = 'none';
    errorBox.textContent = 'ERROR: INVALID OR MISSING SHARE ID';
    errorBox.style.display = 'block';
    return;
  }

  // Basic sanitization of shareId regex validation to prevent client-side path manipulation
  if (!/^[a-f0-9]{16}$/.test(shareId)) {
    loader.style.display = 'none';
    errorBox.textContent = 'ERROR: INVALID SHARE ID STRUCTURE';
    errorBox.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`/api/share/${shareId}`);
    if (!res.ok) {
      throw new Error(res.status === 404 ? 'POLAROID NOT FOUND' : 'FAILED TO LOAD ENCRYPTED DATA');
    }

    const data = await res.json();
    const img = new Image();
    img.onload = () => {
      loader.style.display = 'none';
      polaroidCard.style.display = 'flex';
      dlBtn.style.display = 'inline-flex';

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // textContent is used to securely display text and prevent XSS injection
      captionEl.textContent = data.caption || '';
      
      // Setup download handler
      dlBtn.addEventListener('click', () => {
        // Bake frame and caption into export
        const exportCanvas = document.createElement('canvas');
        const pad = 24, photoSize = 480, bottomPad = 96;
        exportCanvas.width = photoSize + pad * 2;
        exportCanvas.height = photoSize + pad + bottomPad;
        
        const eCtx = exportCanvas.getContext('2d');
        eCtx.fillStyle = '#F5EFDD'; // Standard Polaroid frame color
        eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        eCtx.imageSmoothingEnabled = false;
        eCtx.drawImage(canvas, pad, pad, photoSize, photoSize);
        
        if (data.caption) {
          eCtx.fillStyle = '#241B2F';
          eCtx.font = "32px 'VT323', monospace";
          eCtx.textAlign = 'center';
          eCtx.textBaseline = 'middle';
          eCtx.fillText(data.caption, exportCanvas.width/2, photoSize + pad + bottomPad/2, exportCanvas.width - pad*2);
        }

        exportCanvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `pixelcam-shared-${shareId}.png`;
          link.href = url;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }, 'image/png');
      });
    };
    img.onerror = () => {
      throw new Error('FAILED TO LOAD POLAROID IMAGE SOURCE');
    };
    img.src = data.imageDataUrl;
  } catch (err) {
    loader.style.display = 'none';
    errorBox.textContent = `ERROR: ${err.message.toUpperCase()}`;
    errorBox.style.display = 'block';
  }
});
