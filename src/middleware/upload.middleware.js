/**
 * upload.middleware.js
 * Multer configuration for file uploads.
 * - Saves files to /uploads/<YYYY-MM-DD>/
 * - Renames files to UUID to prevent path traversal
 * - Limits file type and size
 */
'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed'
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// Storage engine – saves files to /uploads/YYYY-MM-DD/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const today   = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
    const dir     = path.join(__dirname, '..', '..', 'uploads', today);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // UUID + original extension (sanitized)
    const ext      = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  }
});

// MIME-type filter
function fileFilter(_req, file, cb) {
  if (ALLOWED_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `File type '${file.mimetype}' is not allowed.`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Error handler for multer errors (to use as Express middleware)
function handleUploadError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
}

module.exports = { upload, handleUploadError };
