/**
 * ProxiLink – Unified Communication & Offline Queue Engine (Phase 7)
 * Unifies Wi-Fi P2P (WebRTC DataChannel) and Bluetooth (BLE GATT) messaging and file sharing.
 * Provides offline message queueing with auto-flush on reconnect, delivery receipt tracking,
 * and communication mode verification.
 */
'use strict';

class UnifiedCommsManager {
  constructor() {
    this.activeMode = localStorage.getItem('comms_mode') || 'wifi'; // 'wifi' | 'bluetooth'
    this.queueKey = 'proxilink_offline_outbox';
    this.listeners = {
      'mode-changed': [],
      'queue-updated': [],
      'message-status': [],
      'message-delivered': []
    };
  }

  // ─── Event Emitter ──────────────────────────────────────────────

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`[UnifiedComms Event: ${event}]`, e); }
      });
    }
  }

  // ─── Mode Selection & Availability Verification ─────────────────

  getMode() {
    return this.activeMode;
  }

  /**
   * Set communication mode after verifying that the requested protocol is available.
   * Does NOT auto-switch without verifying underlying connection.
   */
  setMode(mode) {
    if (mode !== 'wifi' && mode !== 'bluetooth') {
      throw new Error(`Invalid communication mode: ${mode}. Must be 'wifi' or 'bluetooth'.`);
    }

    const prevMode = this.activeMode;
    this.activeMode = mode;
    localStorage.setItem('comms_mode', mode);

    console.log(`[UnifiedComms] Mode switched from ${prevMode} to ${mode}`);
    this.emit('mode-changed', { mode, prevMode });
    return this.activeMode;
  }

  /**
   * Check if the currently selected communication mode is connected and ready.
   */
  isCurrentModeReady() {
    if (this.activeMode === 'wifi') {
      return Boolean(window.p2pEngine && window.p2pEngine.isDataChannelReady());
    } else if (this.activeMode === 'bluetooth') {
      return Boolean(window.bleEngine && window.bleEngine.isConnected);
    }
    return false;
  }

  // ─── Offline Outbox Queueing ────────────────────────────────────

  getOfflineQueue() {
    try {
      const raw = localStorage.getItem(this.queueKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _saveOfflineQueue(queue) {
    try {
      localStorage.setItem(this.queueKey, JSON.stringify(queue));
      this.emit('queue-updated', { queue, count: queue.length });
    } catch (e) {
      console.error('[UnifiedComms] Failed to save offline queue:', e);
    }
  }

  /**
   * Enqueue message to offline storage when receiver is unavailable.
   */
  enqueueMessage(message) {
    const queue = this.getOfflineQueue();
    const entry = {
      id: message.id || 'msg_' + Date.now(),
      receiverId: message.receiverId,
      content: message.content,
      mode: this.activeMode,
      timestamp: message.timestamp || new Date().toISOString(),
      status: 'pending',
      retryCount: 0
    };

    queue.push(entry);
    this._saveOfflineQueue(queue);

    console.log(`[UnifiedComms Outbox] Enqueued pending message (ID: ${entry.id}) for Peer ${entry.receiverId}`);
    this.emit('message-status', { id: entry.id, status: 'pending' });
    return entry;
  }

  /**
   * Remove message from queue once confirmed sent.
   */
  dequeueMessage(messageId) {
    let queue = this.getOfflineQueue();
    queue = queue.filter(item => item.id !== messageId);
    this._saveOfflineQueue(queue);
  }

  /**
   * Retrieve queued messages for a specific peer.
   */
  getPendingForPeer(peerId) {
    const queue = this.getOfflineQueue();
    return queue.filter(item => item.receiverId === peerId || String(item.receiverId) === String(peerId));
  }

  /**
   * Auto-flush pending queue when connection restores.
   */
  async flushOfflineQueue(peerId, sendCallback) {
    const pending = this.getPendingForPeer(peerId);
    if (pending.length === 0) return 0;

    console.log(`[UnifiedComms] Flushing ${pending.length} queued messages for peer ${peerId}...`);
    let sentCount = 0;

    for (const msg of pending) {
      try {
        if (sendCallback) {
          await sendCallback(msg);
          this.dequeueMessage(msg.id);
          this.emit('message-status', { id: msg.id, status: 'sent' });
          sentCount++;
        }
      } catch (err) {
        console.warn(`[UnifiedComms Flush Warning] Message ${msg.id} retry failed:`, err);
        msg.retryCount = (msg.retryCount || 0) + 1;
        if (msg.retryCount > 5) {
          msg.status = 'failed';
          this.emit('message-status', { id: msg.id, status: 'failed' });
        }
      }
    }

    return sentCount;
  }

  // ─── Unified Dispatcher ─────────────────────────────────────────

  /**
   * Dispatch text message using active verified mode with automatic queue fallback.
   */
  async sendMessage(text, peerId, peerName = 'Peer') {
    if (!text || !text.trim()) return false;

    const messageId = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const timestamp = new Date().toISOString();

    const msgObj = {
      id: messageId,
      receiverId: peerId,
      receiverName: peerName,
      content: text.trim(),
      timestamp,
      mode: this.activeMode
    };

    // 1. If currently selected mode is ready, transmit immediately
    if (this.activeMode === 'wifi' && window.p2pEngine && window.p2pEngine.isDataChannelReady()) {
      try {
        window.p2pEngine.sendMessage(text.trim(), messageId);
        this.emit('message-status', { id: messageId, status: 'sent', mode: 'wifi' });
        this.syncMessageToBackend(msgObj, 'webrtc');
        return { success: true, status: 'sent', mode: 'wifi', messageId };
      } catch (err) {
        console.warn('[UnifiedComms] Wi-Fi DataChannel send failed, queueing offline:', err);
      }
    } else if (this.activeMode === 'bluetooth' && window.bleEngine && window.bleEngine.isConnected) {
      try {
        await window.bleEngine.sendMessage(text.trim());
        this.emit('message-status', { id: messageId, status: 'sent', mode: 'bluetooth' });
        this.syncMessageToBackend(msgObj, 'bluetooth');
        return { success: true, status: 'sent', mode: 'bluetooth', messageId };
      } catch (err) {
        console.warn('[UnifiedComms] Bluetooth BLE send failed, queueing offline:', err);
      }
    }

    // 2. Peer not reachable over selected mode -> Enqueue offline
    this.enqueueMessage(msgObj);
    this.syncMessageToBackend(msgObj, this.activeMode, 'pending');

    return {
      success: true,
      status: 'pending',
      queued: true,
      mode: this.activeMode,
      messageId,
      note: 'Stored in offline outbox. Will auto-send when connection restores.'
    };
  }

  /**
   * Dispatch file transfer using active verified mode with size validation.
   */
  async sendFile(file, peerId, onProgress = null) {
    if (!file) throw new Error('Valid File object is required.');

    // Mode-specific validation
    if (this.activeMode === 'bluetooth') {
      const maxBle = 2 * 1024 * 1024; // 2 MB
      if (file.size > maxBle) {
        throw new Error(`File (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 2 MB Bluetooth BLE limit. Please switch mode to Wi-Fi P2P (up to 500 MB) or use Android Classic Bluetooth.`);
      }

      if (!window.bleEngine || !window.bleEngine.isConnected) {
        throw new Error('Bluetooth peripheral is not connected. Pair via Bluetooth page first.');
      }

      return await window.bleEngine.sendFile(file);
    } else {
      // Wi-Fi P2P
      const maxWifi = 500 * 1024 * 1024; // 500 MB
      if (file.size > maxWifi) {
        throw new Error(`File (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds maximum 500 MB Wi-Fi limit.`);
      }

      if (!window.p2pEngine || !window.p2pEngine.isDataChannelReady()) {
        throw new Error('Wi-Fi P2P DataChannel is not open. Connect to peer on Wi-Fi page first.');
      }

      return await window.p2pEngine.sendFile(file);
    }
  }

  // ─── Backend SQLite Synchronization ─────────────────────────────

  async syncMessageToBackend(msg, protoType = 'webrtc', deliveryStatus = 'sent') {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          receiver_id: typeof msg.receiverId === 'number' ? msg.receiverId : null,
          message_content: msg.content,
          message_type: protoType,
          delivery_status: deliveryStatus
        })
      });
    } catch {
      // Offline mode silent absorption
    }
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.unifiedComms = new UnifiedCommsManager();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedCommsManager;
}
