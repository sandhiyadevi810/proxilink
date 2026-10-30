'use strict';
const router = require('express').Router();
const { uploadFile, updateTransfer, getHistory, downloadFile } = require('../controllers/fileController');
const { requireAuth } = require('../middleware/auth.middleware');
const { upload, handleUploadError } = require('../middleware/upload.middleware');

router.post('/upload',            requireAuth, upload.single('file'), handleUploadError, uploadFile);
router.get ('/history',           requireAuth, getHistory);
router.get ('/:id/download',      requireAuth, downloadFile);
router.patch('/:id/transfer',     requireAuth, updateTransfer);

module.exports = router;
