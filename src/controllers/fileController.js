/**
 * fileController.js – File upload, download, and transfer history
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { run, queryAll, queryOne } = require('../db/db');

/** POST /api/files/upload – save file metadata after Multer stores the file */
function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const senderId    = req.session.userId;
  const receiverId  = req.body.receiver_id ? parseInt(req.body.receiver_id, 10) : null;
  const groupId     = req.body.group_id    ? parseInt(req.body.group_id,    10) : null;
  const messageId   = req.body.message_id  ? parseInt(req.body.message_id,  10) : null;

  const { originalname, mimetype, size, path: filePath } = req.file;
  // Store relative path from /uploads
  const relativePath = filePath.replace(path.join(__dirname, '..', '..', 'uploads'), '').replace(/\\/g, '/');

  const result = run(
    `INSERT INTO files
       (sender_id, receiver_id, group_id, message_id, file_name, file_type, file_size, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [senderId, receiverId, groupId, messageId, originalname, mimetype, size, relativePath]
  );

  const fileId = result.lastInsertRowid;

  // Create initial transfer_history record
  run(
    `INSERT INTO transfer_history (file_id, sender_id, receiver_id, status, bytes_transferred, total_bytes)
     VALUES (?, ?, ?, 'in_progress', 0, ?)`,
    [fileId, senderId, receiverId || 0, size]
  );

  return res.status(201).json({
    file_id:   fileId,
    file_name: originalname,
    file_type: mimetype,
    file_size: size,
    file_url:  `/uploads${relativePath}`
  });
}

/** PATCH /api/files/:id/transfer – update transfer status */
function updateTransfer(req, res) {
  const fileId = parseInt(req.params.id, 10);
  const { status, bytes_transferred } = req.body;

  if (status === 'completed') {
    run(
      `UPDATE transfer_history
       SET status = 'completed', bytes_transferred = total_bytes,
           completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE file_id = ?`,
      [fileId]
    );
  } else if (status === 'failed' || status === 'cancelled') {
    run(
      `UPDATE transfer_history
       SET status = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE file_id = ?`,
      [status, fileId]
    );
  } else if (bytes_transferred !== undefined) {
    run(
      'UPDATE transfer_history SET bytes_transferred = ? WHERE file_id = ?',
      [bytes_transferred, fileId]
    );
  }

  return res.json({ updated: true });
}

/** GET /api/files/history – get transfer history for current user */
function getHistory(req, res) {
  const userId = req.session.userId;
  const limit  = parseInt(req.query.limit,  10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;

  const records = queryAll(
    `SELECT th.transfer_id, th.status, th.bytes_transferred, th.total_bytes,
            th.started_at, th.completed_at,
            f.file_name, f.file_type, f.file_size, f.file_path,
            s.display_name AS sender_name, s.avatar_color AS sender_color,
            r.display_name AS receiver_name
     FROM transfer_history th
     JOIN files f ON f.file_id = th.file_id
     JOIN users s ON s.user_id = th.sender_id
     LEFT JOIN users r ON r.user_id = th.receiver_id
     WHERE th.sender_id = ? OR th.receiver_id = ?
     ORDER BY th.started_at DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, limit, offset]
  );

  return res.json({ history: records });
}

/** GET /api/files/:id/download – serve the file */
function downloadFile(req, res) {
  const fileId  = parseInt(req.params.id, 10);
  const userId  = req.session.userId;

  const file = queryOne(
    'SELECT * FROM files WHERE file_id = ? AND (sender_id = ? OR receiver_id = ?)',
    [fileId, userId, userId]
  );

  if (!file) {
    return res.status(404).json({ error: 'File not found or access denied.' });
  }

  const fullPath = path.join(__dirname, '..', '..', 'uploads', file.file_path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File no longer exists on server.' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name)}"`);
  res.setHeader('Content-Type', file.file_type);
  return res.sendFile(fullPath);
}

module.exports = { uploadFile, updateTransfer, getHistory, downloadFile };
