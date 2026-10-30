'use strict';
const router = require('express').Router();
const { sendMessage, getConversation, getGroupMessages, updateStatus, getAllMessages } = require('../controllers/messageController');
const { requireAuth } = require('../middleware/auth.middleware');
const { messageRules, handleValidationErrors } = require('../middleware/validate.middleware');

router.post('/send',                    requireAuth, messageRules, handleValidationErrors, sendMessage);
router.get ('/all',                     requireAuth, getAllMessages);
router.get ('/conversation/:peerId',    requireAuth, getConversation);
router.get ('/group/:groupId',          requireAuth, getGroupMessages);
router.patch('/:id/status',             requireAuth, updateStatus);

module.exports = router;
