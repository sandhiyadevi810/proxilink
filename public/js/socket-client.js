/**
 * ProxiLink – Socket.IO Client Wrapper
 * Handles WebSocket connection lifecycle, authentication sync, and event routing.
 */
'use strict';

let socket = null;

function initSocket() {
  if (typeof io === 'undefined') {
    console.error('Socket.IO client library not loaded.');
    return null;
  }

  // Connect to the same origin with cookies passed for session authentication
  socket = io({
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected. Socket ID:', socket.id);
    const wsDot = document.getElementById('ws-dot');
    const wsText = document.getElementById('ws-status-text');
    const sockDot = document.getElementById('socket-dot');
    const sockStatus = document.getElementById('socket-status');

    if (wsDot) wsDot.className = 'dot dot-green';
    if (wsText) wsText.textContent = 'Connected';
    if (sockDot) sockDot.className = 'dot dot-green';
    if (sockStatus) sockStatus.textContent = 'WebSocket: Connected';
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
    const wsDot = document.getElementById('ws-dot');
    const wsText = document.getElementById('ws-status-text');
    const sockDot = document.getElementById('socket-dot');
    const sockStatus = document.getElementById('socket-status');

    if (wsDot) wsDot.className = 'dot dot-gray';
    if (wsText) wsText.textContent = 'Disconnected';
    if (sockDot) sockDot.className = 'dot dot-gray';
    if (sockStatus) sockStatus.textContent = 'WebSocket: Disconnected';
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
    const sockStatus = document.getElementById('socket-status');
    if (sockStatus) sockStatus.textContent = 'WebSocket: Error';
  });

  socket.on('auth-error', (data) => {
    console.error('[Socket] Auth error from server:', data.error);
    showToast('Session expired. Please log in again.', 'warning');
    setTimeout(() => { window.location.href = '/auth'; }, 1500);
  });

  // ── Online user list broadcast ──
  socket.on('user-list', (data) => {
    if (typeof onUserList === 'function') {
      onUserList(data);
    }
  });

  // ── WebRTC Signalling dispatch ──
  socket.on('signal', (payload) => {
    if (typeof handleIncomingSignal === 'function') {
      handleIncomingSignal(payload);
    }
  });

  // ── Incoming 1-to-1 message fallback ──
  socket.on('incoming-message', (data) => {
    if (typeof handleIncomingMessage === 'function') {
      handleIncomingMessage(data);
    }
  });

  // ── Incoming Group message ──
  socket.on('incoming-group-message', (data) => {
    if (typeof handleIncomingGroupMessage === 'function') {
      handleIncomingGroupMessage(data);
    }
  });

  // ── Typing indicators ──
  socket.on('peer-typing', (data) => {
    if (typeof handlePeerTyping === 'function') {
      handlePeerTyping(data);
    }
  });

  socket.on('peer-stopped-typing', (data) => {
    if (typeof handlePeerStoppedTyping === 'function') {
      handlePeerStoppedTyping(data);
    }
  });

  // ── File transfer events ──
  socket.on('incoming-file-start', (data) => {
    if (typeof handleIncomingFileStart === 'function') {
      handleIncomingFileStart(data);
    }
  });

  socket.on('file-transfer-progress', (data) => {
    if (typeof handleIncomingFileProgress === 'function') {
      handleIncomingFileProgress(data);
    }
  });

  socket.on('incoming-file-complete', (data) => {
    if (typeof handleIncomingFileComplete === 'function') {
      handleIncomingFileComplete(data);
    }
  });

  socket.on('file-transfer-error', (data) => {
    if (typeof handleIncomingFileError === 'function') {
      handleIncomingFileError(data);
    }
  });

  socket.on('peer-disconnected', (data) => {
    if (typeof handlePeerDisconnected === 'function') {
      handlePeerDisconnected(data);
    }
  });

  return socket;
}
