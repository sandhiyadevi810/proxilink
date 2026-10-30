/**
 * ProxiLink Backend – Message Model
 * Data Access Layer for Messages table.
 */
'use strict';

const { queryAll, queryOne, run } = require('../config/database');

const Message = {
  /**
   * Insert a new message into SQLite.
   */
  create({ sender_id, receiver_id = null, group_id = null, message_content, message_type = 'text' }) {
    const result = run(
      `INSERT INTO Messages (sender_id, receiver_id, group_id, message_content, message_type, delivery_status)
       VALUES (?, ?, ?, ?, ?, 'sent')`,
      [sender_id, receiver_id || null, group_id || null, message_content, message_type]
    );
    return this.findById(result.lastInsertRowid);
  },

  /**
   * Find message by message_id with sender metadata.
   */
  findById(messageId) {
    return queryOne(
      `SELECT m.*, 
              s.username AS sender_username, s.display_name AS sender_name,
              r.username AS receiver_username, r.display_name AS receiver_name
       FROM Messages m
       JOIN Users s ON s.user_id = m.sender_id
       LEFT JOIN Users r ON r.user_id = m.receiver_id
       WHERE m.message_id = ?`,
      [messageId]
    );
  },

  /**
   * Retrieve one-to-one conversation between two users.
   */
  getConversation(userIdA, userIdB, limit = 100, offset = 0) {
    return queryAll(
      `SELECT m.*,
              s.username AS sender_username, s.display_name AS sender_name,
              r.username AS receiver_username, r.display_name AS receiver_name
       FROM Messages m
       JOIN Users s ON s.user_id = m.sender_id
       LEFT JOIN Users r ON r.user_id = m.receiver_id
       WHERE (m.sender_id = ? AND m.receiver_id = ?)
          OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.timestamp ASC
       LIMIT ? OFFSET ?`,
      [userIdA, userIdB, userIdB, userIdA, limit, offset]
    );
  },

  /**
   * Alias for getConversation
   */
  findConversation(userIdA, userIdB, limit = 100, offset = 0) {
    return this.getConversation(userIdA, userIdB, limit, offset);
  },

  /**
   * Retrieve group messages.
   */
  getGroupMessages(groupId, limit = 100, offset = 0) {
    return queryAll(
      `SELECT m.*,
              s.username AS sender_username, s.display_name AS sender_name
       FROM Messages m
       JOIN Users s ON s.user_id = m.sender_id
       WHERE m.group_id = ?
       ORDER BY m.timestamp ASC
       LIMIT ? OFFSET ?`,
      [groupId, limit, offset]
    );
  },

  /**
   * Retrieve all messages related to a specific user (for full history audits).
   */
  getAllForUser(userId, limit = 100, offset = 0) {
    return queryAll(
      `SELECT m.*,
              s.username AS sender_username, s.display_name AS sender_name,
              r.username AS receiver_username, r.display_name AS receiver_name
       FROM Messages m
       JOIN Users s ON s.user_id = m.sender_id
       LEFT JOIN Users r ON r.user_id = m.receiver_id
       WHERE m.sender_id = ? OR m.receiver_id = ?
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, limit, offset]
    );
  },

  /**
   * Update message delivery status ('sent', 'delivered', 'read').
   */
  updateDeliveryStatus(messageId, status) {
    const valid = ['sent', 'delivered', 'read'];
    if (!valid.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${valid.join(', ')}`);
    }

    run(
      'UPDATE Messages SET delivery_status = ? WHERE message_id = ?',
      [status, messageId]
    );
    return this.findById(messageId);
  }
};

module.exports = Message;
