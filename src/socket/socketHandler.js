/**
 * socketHandler.js
 * Manages all real-time WebSocket events for ProxiLink.
 *
 * Responsibilities:
 *  1. Track online users (userId → socketId mapping)
 *  2. Broadcast online user list on join/leave
 *  3. Relay WebRTC signalling (SDP offer/answer + ICE candidates)
 *  4. Relay text messages when WebRTC DataChannel is not yet open
 *  5. Relay group messages to all group members
 *  6. Handle typing indicators
 *  7. Handle file transfer notifications
 */
'use strict';

const { queryAll } = require('../db/db');

// Map: userId (number) → Set of socketIds (one user can have multiple tabs)
const onlineUsers = new Map();

/**
 * @param {import('socket.io').Server} io
 */
function initSocketHandler(io) {

  io.on('connection', (socket) => {
    const session = socket.request.session;

    // ── Reject unauthenticated sockets ─────────────────────────────────────
    if (!session || !session.userId) {
      socket.emit('auth-error', { error: 'Authentication required.' });
      socket.disconnect(true);
      return;
    }

    const userId      = session.userId;
    const displayName = session.displayName;
    const clientIp    = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    console.log(`[Socket] ${displayName} (${userId}) connected — socket ${socket.id} from ${clientIp}`);

    // ── Register user in onlineUsers map ───────────────────────────────────
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);
    socket.data.userId      = userId;
    socket.data.displayName = displayName;

    // Join a personal room (userId-based) for targeted delivery
    socket.join(`user:${userId}`);

    // Broadcast updated user list to everyone
    broadcastUserList(io);

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] ${displayName} (${userId}) disconnected — reason: ${reason}`);
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) onlineUsers.delete(userId);
      }
      broadcastUserList(io);
      // Notify peer of disconnection (if in a P2P session)
      socket.broadcast.emit('peer-disconnected', { userId });
    });

    // ── WebRTC Signalling ─────────────────────────────────────────────────
    // Relay SDP offer, SDP answer, or ICE candidate to the target peer
    socket.on('signal', (payload) => {
      const { to, type, sdp, candidate } = payload;
      if (!to) return;

      // to = target userId
      io.to(`user:${to}`).emit('signal', {
        from:      userId,
        fromName:  displayName,
        type,
        sdp:       sdp       || null,
        candidate: candidate || null
      });
    });

    // ── Relay Text Message (fallback when WebRTC is not connected) ─────────
    socket.on('relay-message', (payload) => {
      const { to, content, message_type, tempId } = payload;
      if (!to || !content) return;

      // Deliver to target user's room
      io.to(`user:${to}`).emit('incoming-message', {
        from:         userId,
        fromName:     displayName,
        content,
        message_type: message_type || 'text',
        sent_at:      new Date().toISOString(),
        tempId        // echo back so sender can confirm delivery
      });

      // Also confirm delivery back to sender
      socket.emit('message-delivered', { tempId, to });
    });

    // ── Relay Group Message ───────────────────────────────────────────────
    socket.on('relay-group-message', (payload) => {
      const { groupId, content, message_type } = payload;
      if (!groupId || !content) return;

      // Get all group members from DB
      const members = queryAll(
        `SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?`,
        [groupId, userId]
      );

      const msgPayload = {
        from:         userId,
        fromName:     displayName,
        groupId,
        content,
        message_type: message_type || 'text',
        sent_at:      new Date().toISOString()
      };

      // Emit to each member's personal room
      members.forEach(m => {
        io.to(`user:${m.user_id}`).emit('incoming-group-message', msgPayload);
      });
    });

    // ── Typing Indicators ────────────────────────────────────────────────
    socket.on('typing-start', ({ to }) => {
      if (!to) return;
      io.to(`user:${to}`).emit('peer-typing', { from: userId, fromName: displayName });
    });

    socket.on('typing-stop', ({ to }) => {
      if (!to) return;
      io.to(`user:${to}`).emit('peer-stopped-typing', { from: userId });
    });

    // ── File Transfer Notifications ──────────────────────────────────────
    socket.on('file-transfer-start', (payload) => {
      const { to, fileName, fileSize, fileType, transferId } = payload;
      if (!to) return;
      io.to(`user:${to}`).emit('incoming-file-start', {
        from: userId, fromName: displayName,
        fileName, fileSize, fileType, transferId
      });
    });

    socket.on('file-transfer-progress', (payload) => {
      const { to, transferId, progress } = payload;
      if (!to) return;
      io.to(`user:${to}`).emit('file-transfer-progress', { from: userId, transferId, progress });
    });

    socket.on('file-transfer-complete', (payload) => {
      const { to, transferId, fileUrl } = payload;
      if (!to) return;
      io.to(`user:${to}`).emit('incoming-file-complete', { from: userId, transferId, fileUrl });
    });

    socket.on('file-transfer-error', (payload) => {
      const { to, transferId, error } = payload;
      if (!to) return;
      io.to(`user:${to}`).emit('file-transfer-error', { from: userId, transferId, error });
    });

    // ── Connection keep-alive ping ────────────────────────────────────────
    socket.on('ping-server', () => {
      socket.emit('pong-server', { timestamp: Date.now() });
    });
  });
}

/**
 * Build and broadcast the current online user list to all connected clients.
 * Returns userId array and display names.
 */
function broadcastUserList(io) {
  const list = [];
  for (const [uid] of onlineUsers) {
    list.push(uid);
  }
  io.emit('user-list', { onlineUserIds: list });
}

/** Utility: check if a specific user is online */
function isUserOnline(userId) {
  return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
}

module.exports = initSocketHandler;
module.exports.isUserOnline = isUserOnline;
