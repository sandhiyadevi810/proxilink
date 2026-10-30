/**
 * ProxiLink Backend – Message Controller
 * Handles sending messages, retrieving conversation history, and querying by ID.
 */
'use strict';

const Message = require('../models/Message');
const MessageService = require('../services/messageService');

const MessageController = {
  /**
   * POST /api/messages
   * Save and dispatch an offline message.
   */
  async sendMessage(req, res, next) {
    try {
      const { receiver_id, group_id, message_content, message_type } = req.body;
      const io = req.app.get('io');

      const saved = await MessageService.processAndSendMessage({
        sender_id: req.user.user_id,
        receiver_id,
        group_id,
        message_content,
        message_type: message_type || 'text'
      }, io);

      return res.status(201).json({
        message: 'Message sent successfully.',
        data: saved
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/messages/history
   * Retrieve conversation history with a peer or in a group.
   * Query params: ?peer_id=X or ?group_id=Y, ?limit=N, ?offset=M
   */
  async getMessageHistory(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const offset = parseInt(req.query.offset, 10) || 0;
      const peerId = req.query.peer_id ? parseInt(req.query.peer_id, 10) : null;
      const groupId = req.query.group_id ? parseInt(req.query.group_id, 10) : null;

      let messages = [];

      if (peerId) {
        messages = await MessageService.getConversationHistory(req.user.user_id, peerId, limit, offset);
      } else if (groupId) {
        messages = await MessageService.getGroupHistory(groupId, limit, offset);
      } else {
        // Return all messages for authenticated user
        messages = Message.getAllForUser(req.user.user_id, limit, offset);
      }

      return res.status(200).json({ messages });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/messages/:id
   * Get single message by ID.
   */
  async getMessageById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid message ID parameter.' });
      }

      const msg = Message.findById(id);
      if (!msg) {
        return res.status(404).json({ error: 'Message not found.' });
      }

      // Ensure user is participant
      if (msg.sender_id !== req.user.user_id && msg.receiver_id !== req.user.user_id && !msg.group_id) {
        return res.status(403).json({ error: 'Access denied to this message.' });
      }

      return res.status(200).json({ message: msg });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/messages/:id/status
   * Update message delivery status (e.g. 'delivered', 'read')
   */
  async updateStatus(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body;
      const io = req.app.get('io');
      const updated = await MessageService.markStatus(id, status, io);
      return res.status(200).json({ message: 'Delivery status updated', data: updated });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = MessageController;
