/**
 * ProxiLink – Phase 4 Main Backend Server
 * Modular, Secure Node.js + Express + SQLite + Socket.IO Backend
 * WebRTC Signalling Gateway & REST API Architecture
 */
'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// ─── Environment Configuration ────────────────────────────────────
const backendEnv = path.join(__dirname, '.env');
const rootEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
} else if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

const { Server } = require('socket.io');

// ─── Database & Services ──────────────────────────────────────────
const { initDatabase } = require('./config/database');
const initSignallingService = require('./services/signallingService');

// ─── Route Handlers ───────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const messageRoutes = require('./routes/messageRoutes');
const fileRoutes = require('./routes/fileRoutes');

// ─── Middleware ───────────────────────────────────────────────────
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Determine HTTP vs HTTPS Secure Context
const isHttps = process.env.HTTPS === 'true';
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '..', 'ssl', 'server.key');
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '..', 'ssl', 'server.cert');

let server;
let protoPrefix = 'http';

if (isHttps && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    server = https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }, app);
    protoPrefix = 'https';
    console.log('[Server] TLS/HTTPS Secure Context enabled with certificates.');
  } catch (err) {
    console.warn('[Server Warning] Failed to initialize HTTPS. Falling back to HTTP:', err.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  maxHttpBufferSize: 10 * 1024 * 1024 // 10 MB per socket packet
});

// Provide io instance to route controllers
app.set('io', io);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Trust proxy for rate limiting behind local routers
app.set('trust proxy', 1);

// ─── Core Middleware ──────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Auth rate limiter to prevent local brute force
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts. Please try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ─── Serve Static Frontend & Uploads ──────────────────────────────
const frontendDir = path.join(__dirname, '..', 'frontend');
const uploadsDir  = path.join(__dirname, 'uploads');

app.use(express.static(frontendDir));
app.use('/uploads', express.static(uploadsDir));

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'online',
    platform: 'ProxiLink Offline Wireless Platform',
    version: '4.0.0',
    mode: 'offline-p2p',
    timestamp: new Date().toISOString()
  });
});

// ─── REST API Routes ──────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/devices',  deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/files',    fileRoutes);

// ─── Frontend Page Navigation Routing ─────────────────────────────
app.get('/',               (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
app.get(['/login', '/login.html'],       (_req, res) => res.sendFile(path.join(frontendDir, 'login.html')));
app.get(['/register', '/register.html'], (_req, res) => res.sendFile(path.join(frontendDir, 'register.html')));
app.get(['/dashboard', '/dashboard.html'], (_req, res) => res.sendFile(path.join(frontendDir, 'dashboard.html')));
app.get(['/wifi', '/wifi.html'],         (_req, res) => res.sendFile(path.join(frontendDir, 'wifi.html')));
app.get(['/bluetooth', '/bluetooth.html'], (_req, res) => res.sendFile(path.join(frontendDir, 'bluetooth.html')));
app.get(['/chat', '/chat.html'],         (_req, res) => res.sendFile(path.join(frontendDir, 'chat.html')));
app.get(['/files', '/files.html'],       (_req, res) => res.sendFile(path.join(frontendDir, 'files.html')));
app.get(['/history', '/history.html'],   (_req, res) => res.sendFile(path.join(frontendDir, 'history.html')));
app.get(['/settings', '/settings.html'], (_req, res) => res.sendFile(path.join(frontendDir, 'settings.html')));

// ─── Error Handling Middleware ────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Server Startup Sequence ──────────────────────────────────────
async function startServer() {
  try {
    // 1. Initialize SQLite WebAssembly Database
    await initDatabase();

    // 2. Initialize Socket.IO WebRTC Signalling Gateway
    initSignallingService(io);

    // 3. Start Listening
    server.listen(PORT, HOST, () => {
      const { networkInterfaces } = require('os');
      const nets = networkInterfaces();
      const ips = [];

      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            ips.push(net.address);
          }
        }
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║               ProxiLink Wireless Backend Online              ║');
      console.log('╠══════════════════════════════════════════════════════════════╣');
      console.log(`║  Local Host:   ${protoPrefix}://localhost:${PORT}`.padEnd(63) + '║');
      ips.forEach(ip => {
        const padded = `${protoPrefix}://${ip}:${PORT}`.padEnd(46);
        console.log(`║  Network P2P:  ${padded} ║`);
      });
      console.log('║                                                              ║');
      console.log(`║  • Protocol:                 ${protoPrefix.toUpperCase().padEnd(31)} ║`);
      console.log('║  • WebRTC Signalling Gateway: Active                         ║');
      console.log('║  • SQLite WASM Database:     Connected                       ║');
      console.log('║  • JWT Authentication:       Enabled                         ║');
      console.log('║  • Zero Cloud Dependency:    100% Offline                    ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
    });

    // Graceful Shutdown
    const { saveDB } = require('./config/database');
    const gracefulShutdown = () => {
      console.log('\n[Server] Shutting down ProxiLink gracefully...');
      try { saveDB(); } catch {}
      server.close(() => {
        console.log('[Server] HTTP/WebSocket connections closed. Database persisted.');
        process.exit(0);
      });
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

  } catch (err) {
    console.error('[Server] Critical startup error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
