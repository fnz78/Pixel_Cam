import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import apiRouter from './routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Defense-in-depth: Disable x-powered-by header
app.disable('x-powered-by');

// Set payload limit since photos sent to /api/share can be large (base64 string)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply Helmet Security Headers with strict Content-Security-Policy (no inline scripts)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'", "https://cdnjs.cloudflare.com"],
      "script-src": ["'self'", "https://cdnjs.cloudflare.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "blob:"],
      "connect-src": ["'self'"],
      "worker-src": ["'self'", "blob:"]
    }
  }
}));

// Apply CORS Policy
app.use(cors());

// General rate limiter on all API requests, except image creation
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests, please wait a bit' },
  skip: (req) => req.originalUrl === '/api/share' && req.method === 'POST'
});

// Stricter rate limiter specifically for creating secure shares to prevent database abuse
const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Limit each IP to 20 shares per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sharing rate limit exceeded. Please try again in 15 minutes.' }
});

app.use('/api', apiLimiter);
app.post('/api/share', shareLimiter);


// Bind API endpoints
app.use('/api', apiRouter);

// Serve static public assets
app.use(express.static(path.resolve('public')));

// Catch-all route to serve the SPA index file
app.get('*', (req, res) => {
  res.sendFile(path.resolve('public/index.html'));
});

// Bind server port
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  PIXELCAM Backend Server Running Successfully! `);
  console.log(`  Local URL: http://localhost:${PORT}          `);
  console.log(`===============================================`);
});
export default app;
