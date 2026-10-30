/**
 * ProxiLink Backend – Message Routes
 * Mounted at /api/messages
 */
'use strict';

const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/',        authMiddleware, MessageController.sendMessage);
router.get('/history',  authMiddleware, MessageController.getMessageHistory);
router.get('/all',      authMiddleware, MessageController.getMessageHistory);
router.get('/:id',      authMiddleware, MessageController.getMessageById);
router.put('/:id/status', authMiddleware, MessageController.updateStatus);

module.exports = router;
