/**
 * ProxiLink Backend – File Service
 * Manages Multer configuration, date partitioning, UUID deduplication, and streaming downloads.
 */
'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const FileModel = require('../models/File');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

// Multer DiskStorage with date-based folder partitioning
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().slice(0, 10);
    const dateDir = path.join(UPLOAD_ROOT, today);
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }
    cb(null, dateDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

// File filter: reject executable scripts (.exe, .bat, .sh, .vbs)
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const BLOCKED = new Set(['.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js', '.scr']);
  if (BLOCKED.has(ext)) {
    return cb(new Error(`File type ${ext} is blocked for security reasons.`), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB max file size
  },
  fileFilter
});

const FileService = {
  upload,

  /**
   * Save uploaded file record to SQLite.
   */
  async recordUploadedFile({ file, sender_id, receiver_id }) {
    if (!file) throw new Error('No file was provided for upload.');

    // Compute relative storage path
    const relativePath = file.path.replace(UPLOAD_ROOT, '').replace(/\\/g, '/');

    return FileModel.create({
      sender_id,
      receiver_id: receiver_id ? parseInt(receiver_id, 10) : null,
      file_name: file.originalname,
      file_size: file.size,
      file_type: file.mimetype || 'application/octet-stream',
      file_path: relativePath,
      transfer_status: 'completed'
    });
  },

  /**
   * Resolve absolute file path on disk.
   */
  resolveDiskPath(relativePath) {
    return path.join(UPLOAD_ROOT, relativePath);
  }
};

module.exports = FileService;
