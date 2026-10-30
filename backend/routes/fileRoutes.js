/**
 * ProxiLink Backend – File Routes
 * Mounted at /api/files
 */
'use strict';

const express = require('express');
const router = express.Router();
const FileController = require('../controllers/fileController');
const FileService = require('../services/fileService');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/upload',       authMiddleware, FileService.upload.single('file'), FileController.uploadFile);
router.get('/',              authMiddleware, FileController.getFiles);
router.get('/history',       authMiddleware, FileController.getTransferHistory);
router.get('/:id/download',  authMiddleware, FileController.downloadFile);

module.exports = router;
