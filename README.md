# PIXELCAM — Full-Stack Retro Bead & Dot Art Polaroid Maker

Convert your photos into retro dot-art and bead-art Polaroid-style images. This application is structured as a full-stack, production-ready, deployable Web Application complete with secure image sharing, AES-256-GCM encryption at-rest, and progressive web app (PWA) capabilities.

---

## Directory Structure

```
pixelcam/
  ├── public/                # Frontend static assets
  │   ├── css/
  │   │   └── style.css      # Core styles & mobile media queries
  │   ├── js/
  │   │   ├── app.js         # Entrypoint & service worker registration
  │   │   ├── state.js       # App state management
  │   │   ├── ui.js          # DOM events, Web Share, & printing
  │   │   ├── camera.js      # Webcam getUserMedia streaming
  │   │   ├── palettes.js    # Perler/Hama color lookup & CIE76 deltaE math
  │   │   ├── renderer.js    # 2D canvas drawing logic
  │   │   └── render-worker.js # Multi-threaded Web Worker rendering
  │   ├── index.html         # Main camera console layout
  │   ├── share.html         # Landing page for decrypted shared cards
  │   └── manifest.json      # PWA application metadata
  ├── server/                # Backend API & static hosting
  │   ├── index.js           # Express main server (helmet headers, CORS, limits)
  │   ├── routes.js          # API routing (share and retrieval endpoints)
  │   ├── encryption.js      # AES-256-GCM cryptography utility
  │   └── db.json            # Flat file database (ignored by git)
  ├── package.json           # Node scripts and dependencies
  ├── .gitignore             # Git ignore file
  └── README.md              # Setup and deployment documentation
```

---

## Features

- **Decoupled Architecture**: Clean separated `/public` frontend static directory and `/server` Express backend.
- **Multithreading**: Pixel processing is offloaded to a Web Worker (`render-worker.js`) to keep the main browser thread fully fluid.
- **Secure Image Sharing**: Shared images are encrypted at-rest using **AES-256-GCM** encryption. Plaintext images and captions never touch the disk database.
- **Enhanced Web Security**:
  - `Helmet.js` configuration with strict Content Security Policy (CSP), clickjacking, and MIME-sniffing protection.
  - API rate-limiting on sharing requests to prevent database spamming.
- **Offline PWA Capabilities**: Standalone mobile installable experience utilizing a caching Service Worker.
- **Mobile First Responsive Design**: Adaptive layout optimized for both desktop viewports and touch targets on phone screens.

---

## Getting Started

### Prerequisites

- Node.js (version 18.0.0 or higher)

### Installation

1. Clone or download this repository.
2. Open terminal in the directory and install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the server in production mode:
```bash
npm start
```
To run the server in developer hot-reload mode (requires nodemon):
```bash
npm run dev
```
Open **http://localhost:8000** in your browser.

### Security Configurations (Environment Variables)

Create a `.env` file in the root directory to set your custom production encryption key:
```env
PORT=8000
ENCRYPTION_KEY=your_super_secret_production_key_32_chars_or_more
```
*If `ENCRYPTION_KEY` is not provided, the server will fall back to a default key for local development (not recommended for production).*

---

## Deploying to Production (Render / Heroku)

This app is pre-configured to be deployed immediately on cloud hosting platforms such as Render, Heroku, or Railway.

### Deploying to Render
1. Push your code to a GitHub repository (see below).
2. Go to [Render](https://render.com) and create a new **Web Service**.
3. Link your GitHub repository.
4. Set the following settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. In the service's **Environment** tab, add a new variable:
   - `ENCRYPTION_KEY`: `your_custom_secret_key`

---

## Git & GitHub Setup

To version control this project and push it to GitHub:

1. Initialize git local repository:
   ```bash
   git init
   ```
2. Stage and commit files:
   ```bash
   git add .
   git commit -m "Initial commit: full-stack pixelcam with secure encryption backend"
   ```
3. Create a repository on GitHub (do not initialize with README or gitignore).
4. Add the remote URL, rename the default branch, and push:
   ```bash
   git remote add origin https://github.com/yourusername/pixelcam.git
   git branch -M main
   git push -u origin main
   ```
