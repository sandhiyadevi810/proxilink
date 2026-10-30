/**
 * messageController.js – One-to-one and group messaging
 */
'use strict';

const { run, queryAll } = require('../db/db');

/** POST /api/messages/send – save a message (called after P2P delivery for persistence) */
function sendMessage(req, res) {
  const senderId = req.session.userId;
  const { receiver_id, group_id, content, message_type = 'text' } = req.body;

  if (!receiver_id && !group_id) {
    return res.status(400).json({ error: 'Provide either receiver_id or group_id.' });
  }

  const result = run(
    `INSERT INTO messages (sender_id, receiver_id, group_id, content, message_type, status)
     VALUES (?, ?, ?, ?, ?, 'sent')`,
    [senderId, receiver_id || null, group_id || null, content, message_type]
  );

  return res.status(201).json({ message_id: result.lastInsertRowid, status: 'saved' });
}

/** GET /api/messages/conversation/:peerId – get 1-to-1 conversation */
function getConversation(req, res) {
  const userId = req.session.userId;
  const peerId = parseInt(req.params.peerId, 10);
  if (isNaN(peerId)) return res.status(400).json({ error: 'Invalid peer ID.' });

  const limit  = parseInt(req.query.limit,  10) || 100;
  const offset = parseInt(req.query.offset, 10) || 0;

  const messages = queryAll(
    `SELECT m.message_id, m.sender_id, m.receiver_id, m.content,
            m.message_type, m.sent_at, m.status,
            u.display_name AS sender_name, u.avatar_color AS sender_color
     FROM messages m
     JOIN users u ON u.user_id = m.sender_id
     WHERE (m.sender_id = ? AND m.receiver_id = ?)
        OR (m.sender_id = ? AND m.receiver_id = ?)
     ORDER BY m.sent_at ASC
     LIMIT ? OFFSET ?`,
    [userId, peerId, peerId, userId, limit, offset]
  );

  return res.json({ messages });
}

/** GET /api/messages/group/:groupId – get group messages */
function getGroupMessages(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group ID.' });

  const limit  = parseInt(req.query.limit,  10) || 100;
  const offset = parseInt(req.query.offset, 10) || 0;

  const messages = queryAll(
    `SELECT m.message_id, m.sender_id, m.group_id, m.content,
            m.message_type, m.sent_at, m.status,
            u.display_name AS sender_name, u.avatar_color AS sender_color
     FROM messages m
     JOIN users u ON u.user_id = m.sender_id
     WHERE m.group_id = ?
     ORDER BY m.sent_at ASC
     LIMIT ? OFFSET ?`,
    [groupId, limit, offset]
  );

  return res.json({ messages });
}

/** PATCH /api/messages/:id/status – update delivery status */
function updateStatus(req, res) {
  const messageId = parseInt(req.params.id, 10);
  const { status } = req.body;
  const VALID = new Set(['sent', 'delivered', 'read']);

  if (!VALID.has(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }

  run('UPDATE messages SET status = ? WHERE message_id = ?', [status, messageId]);
  return res.json({ updated: true });
}

/** GET /api/messages/all – get all message history for current user */
function getAllMessages(req, res) {
  const userId = req.session.userId;
  const limit  = parseInt(req.query.limit,  10) || 100;
  const offset = parseInt(req.query.offset, 10) || 0;

  const messages = queryAll(
    `SELECT m.message_id, m.sender_id, m.receiver_id, m.group_id, m.content,
            m.message_type, m.sent_at, m.status,
            s.display_name AS sender_name,
            r.display_name AS receiver_name,
            g.group_name
     FROM messages m
     JOIN users s ON s.user_id = m.sender_id
     LEFT JOIN users r ON r.user_id = m.receiver_id
     LEFT JOIN groups g ON g.group_id = m.group_id
     WHERE m.sender_id = ? OR m.receiver_id = ?
        OR m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
     ORDER BY m.sent_at DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, userId, limit, offset]
  );

  return res.json({ messages });
}

module.exports = { sendMessage, getConversation, getGroupMessages, updateStatus, getAllMessages };
