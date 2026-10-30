/**
 * ProxiLink Backend – Message Service
 * Coordinates persistence, delivery logic, and real-time WebSocket dispatches.
 */
'use strict';

const Message = require('../models/Message');

const MessageService = {
  /**
   * Process and save outbound message, then dispatch over Socket.IO if recipient is online.
   */
  async processAndSendMessage({ sender_id, receiver_id, group_id, message_content, message_type = 'text' }, io) {
    if (!message_content || !message_content.trim()) {
      throw new Error('Message content cannot be empty.');
    }

    if (!receiver_id && !group_id) {
      throw new Error('Message must have a receiver_id or group_id.');
    }

    // Persist to SQLite
    const savedMessage = Message.create({
      sender_id,
      receiver_id: receiver_id ? parseInt(receiver_id, 10) : null,
      group_id: group_id ? parseInt(group_id, 10) : null,
      message_content: message_content.trim(),
      message_type
    });

    // Real-time dispatch via Socket.IO if io instance provided
    if (io) {
      if (receiver_id) {
        // Targeted delivery to receiver's personal user room
        io.to(`user:${receiver_id}`).emit('incoming-message', savedMessage);
      } else if (group_id) {
        // Group delivery
        io.to(`group:${group_id}`).emit('incoming-group-message', savedMessage);
      }
    }

    return savedMessage;
  },

  /**
   * Fetch conversation history between two peers.
   */
  async getConversationHistory(userId1, userId2, limit, offset) {
    return Message.getConversation(userId1, userId2, limit, offset);
  },

  /**
   * Fetch group message history.
   */
  async getGroupHistory(groupId, limit, offset) {
    return Message.getGroupMessages(groupId, limit, offset);
  },

  /**
   * Mark message as delivered or read.
   */
  async markStatus(messageId, status, io) {
    const updated = Message.updateDeliveryStatus(messageId, status);
    if (io && updated) {
      io.to(`user:${updated.sender_id}`).emit('message-status-updated', {
        message_id: messageId,
        status: status
      });
    }
    return updated;
  }
};

module.exports = MessageService;
