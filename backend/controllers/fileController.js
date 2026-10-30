/**
 * ProxiLink Backend – File Controller
 * Manages multipart file uploads, file metadata listings, and authenticated file downloads.
 */
'use strict';

const fs = require('fs');
const FileModel = require('../models/File');
const FileService = require('../services/fileService');

const FileController = {
  /**
   * POST /api/files/upload
   * Handle uploaded file from Multer and record metadata.
   */
  async uploadFile(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file was uploaded in request.' });
      }

      const receiverId = req.body.receiver_id ? parseInt(req.body.receiver_id, 10) : null;

      const record = await FileService.recordUploadedFile({
        file: req.file,
        sender_id: req.user.user_id,
        receiver_id: receiverId
      });

      return res.status(201).json({
        message: 'File uploaded and recorded successfully.',
        file: record,
        download_url: `/api/files/${record.file_id}/download`
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/files
   * List files uploaded or received by the authenticated user.
   */
  async getFiles(req, res, next) {
    try {
      const files = FileModel.findByUser(req.user.user_id);
      return res.status(200).json({ files });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/files/history
   * Retrieve comprehensive file transfer audit history for the authenticated user.
   */
  async getTransferHistory(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const offset = parseInt(req.query.offset, 10) || 0;
      const history = FileModel.getHistory(req.user.user_id, limit, offset);
      return res.status(200).json({ history });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/files/:id/download
   * Serve authenticated file binary download.
   */
  async downloadFile(req, res, next) {
    try {
      const fileId = parseInt(req.params.id, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: 'Invalid file ID parameter.' });
      }

      const record = FileModel.findById(fileId);
      if (!record) {
        return res.status(404).json({ error: 'File record not found.' });
      }

      // Check authorization: user must be sender or receiver
      if (record.sender_id !== req.user.user_id && record.receiver_id !== req.user.user_id) {
        return res.status(403).json({ error: 'Access denied to this file.' });
      }

      const diskPath = FileService.resolveDiskPath(record.file_path);
      if (!fs.existsSync(diskPath)) {
        return res.status(404).json({ error: 'File no longer exists on local storage.' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(record.file_name)}"`);
      res.setHeader('Content-Type', record.file_type);

      return res.sendFile(diskPath);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = FileController;
