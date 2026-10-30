/**
 * ProxiLink – WebRTC Wi-Fi Peer-to-Peer Communication Engine
 * Phase 5 Core Module: Offline P2P DataChannel Messaging & File Streaming
 * 
 * Provides:
 * 1. Local Network Signalling integration via Socket.IO
 * 2. WebRTC Peer Connection & DataChannel establishment
 * 3. Offline text messaging with ACK delivery receipts
 * 4. Chunk-based file streaming (64 KB) with bufferedAmount flow control
 * 5. Real-time RTT latency measurement over DataChannel
 * 6. Disconnection, reconnection, and failover handling
 */
'use strict';

class ProxiLinkP2P {
  constructor(options = {}) {
    this.options = Object.assign({
      chunkSize: 64 * 1024, // 64 KB WebRTC chunk size
      bufferThreshold: 1024 * 1024, // 1 MB flow control threshold
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    }, options);

    this.socket = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.activePeer = null; // { userId, displayName, deviceName, ip }
    this.myDeviceInfo = {
      userId: null,
      username: 'guest',
      displayName: 'Local Node',
      deviceName: 'ProxiLink Browser',
      deviceType: 'laptop'
    };

    // Incoming file assembly registry: fileId -> { meta, chunks, receivedBytes, startTime }
    this.incomingFiles = new Map();

    // Event listeners map
    this.listeners = {
      'device-discovered': [],
      'device-list': [],
      'connection-state': [],
      'datachannel-state': [],
      'message': [],
      'message-delivered': [],
      'file-progress': [],
      'file-received': [],
      'file-sent': [],
      'latency': [],
      'peer-disconnected': [],
      'error': []
    };

    this.pingTimer = null;
    this.isInitiator = false;
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
        try { cb(data); } catch (e) { console.error(`[P2P Event Error: ${event}]`, e); }
      });
    }
  }

  // ─── Initialization & Local Signalling ──────────────────────────

  init(userProfile = {}) {
    Object.assign(this.myDeviceInfo, userProfile);

    // Identify user token if available
    const token = localStorage.getItem('token') || '';

    // Connect to local Socket.IO signalling gateway
    if (typeof io !== 'undefined') {
      const socketOptions = {
        auth: { token },
        query: {
          userId: this.myDeviceInfo.userId || '',
          deviceName: this.myDeviceInfo.deviceName || 'Local Device',
          deviceType: this.myDeviceInfo.deviceType || 'laptop'
        },
        transports: ['websocket', 'polling']
      };

      this.socket = io(window.location.origin, socketOptions);
      this._bindSocketEvents();
    } else {
      console.warn('[P2P] Socket.IO client library not loaded. Signalling operates in offline mock mode.');
    }

    return this;
  }

  _bindSocketEvents() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[P2P Signalling] Connected to local gateway with socket ID:', this.socket.id);
      this.emit('connection-state', { state: 'signalling-online', socketId: this.socket.id });
      this.scanDevices();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[P2P Signalling] Disconnected from gateway:', reason);
      this.emit('connection-state', { state: 'signalling-offline', reason });
    });

    // Received online roster
    this.socket.on('user-list', (data) => {
      this.emit('device-list', data);
    });

    this.socket.on('device-list', (data) => {
      this.emit('device-list', data);
    });

    // Received WebRTC Signalling packet (Offer / Answer / ICE Candidate)
    this.socket.on('signal', async (payload) => {
      await this._handleIncomingSignal(payload);
    });

    // Direct peer disconnect notification
    this.socket.on('peer-disconnected-direct', ({ from }) => {
      if (this.activePeer && this.activePeer.userId === from) {
        this.disconnect(false);
        this.emit('peer-disconnected', { peerId: from });
      }
    });

    // Ping / Pong via Signalling fallback
    this.socket.on('ping-peer', ({ from, timestamp }) => {
      this.socket.emit('pong-peer', { to: from, timestamp });
    });

    this.socket.on('pong-peer', ({ timestamp }) => {
      const rtt = Date.now() - timestamp;
      this.emit('latency', { rtt, method: 'signalling' });
    });
  }

  // ─── Wi-Fi Device Discovery ─────────────────────────────────────

  scanDevices() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scan-devices');
    }
  }

  // ─── WebRTC Connection Handshake ────────────────────────────────

  /**
   * Connect to a discovered peer over local Wi-Fi.
   * Creates RTCPeerConnection and initiates SDP offer.
   */
  async connectToPeer(peer) {
    if (!peer || !peer.userId) {
      throw new Error('Valid peer object with userId is required to connect.');
    }

    this.disconnect(false); // Clean any previous connection
    this.activePeer = peer;
    this.isInitiator = true;

    this.emit('connection-state', { state: 'connecting', peer });

    try {
      this._createPeerConnection(peer.userId);

      // Initiator creates the reliable RTCDataChannel
      this.dataChannel = this.peerConnection.createDataChannel('proxilink-p2p-channel', {
        ordered: true
      });
      this._bindDataChannelEvents(this.dataChannel);

      // Create and send SDP Offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this._sendSignal({
        to: peer.userId,
        type: 'offer',
        sdp: offer.sdp,
        metadata: this.myDeviceInfo
      });

      console.log(`[P2P Handshake] Sent SDP Offer to ${peer.displayName || peer.userId}`);
    } catch (err) {
      console.error('[P2P Handshake Error]', err);
      this.emit('error', { stage: 'create-offer', error: err.message });
      this.emit('connection-state', { state: 'failed', error: err.message });
    }
  }

  _createPeerConnection(targetUserId) {
    const config = {
      iceServers: this.options.iceServers
    };

    this.peerConnection = new RTCPeerConnection(config);

    // ICE Candidate gathering
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignal({
          to: targetUserId,
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    // Connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[P2P Connection State]:', state);
      this.emit('connection-state', { state, peer: this.activePeer });

      if (state === 'connected') {
        this._startHeartbeatPing();
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this._stopHeartbeatPing();
      }
    };

    // Receiver handles DataChannel creation from remote
    this.peerConnection.ondatachannel = (event) => {
      console.log('[P2P DataChannel] Received remote DataChannel:', event.channel.label);
      this.dataChannel = event.channel;
      this._bindDataChannelEvents(this.dataChannel);
    };
  }

  _bindDataChannelEvents(channel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('[P2P DataChannel] Channel OPEN and ready for offline data transfer.');
      this.emit('datachannel-state', { state: 'open', peer: this.activePeer });
      this._startHeartbeatPing();
    };

    channel.onclose = () => {
      console.log('[P2P DataChannel] Channel closed.');
      this.emit('datachannel-state', { state: 'closed', peer: this.activePeer });
      this._stopHeartbeatPing();
    };

    channel.onerror = (err) => {
      console.error('[P2P DataChannel Error]', err);
      this.emit('error', { stage: 'datachannel', error: err });
    };

    // Handle incoming P2P data packets (Text messages, File chunks, ACK, Ping/Pong)
    channel.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };
  }

  // ─── Signalling Dispatcher ──────────────────────────────────────

  _sendSignal(payload) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('signal', payload);
    } else {
      console.warn('[P2P Signalling] Cannot send signal: Socket offline');
    }
  }

  async _handleIncomingSignal(payload) {
    const { from, fromName, fromUsername, type, sdp, candidate, metadata } = payload;

    // 1. Handle SDP Offer (Receiver side)
    if (type === 'offer') {
      console.log(`[P2P Handshake] Received SDP Offer from ${fromName} (${from})`);
      this.activePeer = {
        userId: from,
        displayName: fromName,
        username: fromUsername,
        deviceName: metadata?.deviceName || 'Peer Device',
        deviceType: metadata?.deviceType || 'laptop'
      };
      this.isInitiator = false;
      this.emit('connection-state', { state: 'incoming-connection', peer: this.activePeer });

      this._createPeerConnection(from);

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this._sendSignal({
        to: from,
        type: 'answer',
        sdp: answer.sdp,
        metadata: this.myDeviceInfo
      });
      console.log(`[P2P Handshake] Sent SDP Answer to ${from}`);
    }

    // 2. Handle SDP Answer (Initiator side)
    else if (type === 'answer') {
      console.log(`[P2P Handshake] Received SDP Answer from ${fromName}`);
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
      }
    }

    // 3. Handle ICE Candidate
    else if (type === 'candidate' && candidate) {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[P2P ICE Candidate Warning]', e);
        }
      }
    }
  }

  // ─── DataChannel Packet Protocol ────────────────────────────────

  _handleDataChannelMessage(data) {
    // Binary packet: incoming file chunk
    if (data instanceof ArrayBuffer) {
      this._handleIncomingBinaryChunk(data);
      return;
    }

    // JSON text packet
    try {
      const packet = JSON.parse(data);

      switch (packet.type) {
        // Direct Text Message
        case 'chat':
          this._handleIncomingChatMessage(packet);
          break;

        // Delivery Acknowledgement (Single tick -> Double tick)
        case 'ack':
          this.emit('message-delivered', { messageId: packet.messageId });
          break;

        // File Metadata Header
        case 'file-meta':
          this._handleIncomingFileMeta(packet);
          break;

        // File Transfer Completion
        case 'file-complete':
          this._handleIncomingFileComplete(packet);
          break;

        // Latency Measurement Ping
        case 'ping':
          this._sendControlPacket({ type: 'pong', timestamp: packet.timestamp });
          break;

        // Latency Measurement Pong Response
        case 'pong': {
          const rtt = Date.now() - packet.timestamp;
          this.emit('latency', { rtt, method: 'datachannel' });
          break;
        }

        default:
          console.log('[P2P Unknown Packet Type]:', packet.type);
      }
    } catch (e) {
      console.error('[P2P Parse Error]', e, data);
    }
  }

  _sendControlPacket(packet) {
    if (this.isDataChannelReady()) {
      this.dataChannel.send(JSON.stringify(packet));
    }
  }

  // ─── Offline Text Messaging ─────────────────────────────────────

  /**
   * Send text message directly through WebRTC DataChannel.
   * If DataChannel is unavailable, seamlessly falls back to socket relay.
   */
  sendMessage(text, messageId = Date.now().toString()) {
    if (!text || !text.trim()) return false;

    const packet = {
      type: 'chat',
      messageId,
      content: text.trim(),
      senderId: this.myDeviceInfo.userId,
      senderName: this.myDeviceInfo.displayName,
      timestamp: new Date().toISOString()
    };

    if (this.isDataChannelReady()) {
      this.dataChannel.send(JSON.stringify(packet));
      console.log(`[P2P Msg Sent via DataChannel]: "${text}" (ID: ${messageId})`);
      return { success: true, method: 'webrtc-datachannel', packet };
    }

    // Fallback over local signalling socket if P2P channel is not open
    if (this.socket && this.socket.connected && this.activePeer) {
      this.socket.emit('relay-message', {
        to: this.activePeer.userId,
        content: text.trim(),
        message_type: 'text',
        tempId: messageId
      });
      console.log(`[P2P Msg Sent via Local Relay]: "${text}" (ID: ${messageId})`);
      return { success: true, method: 'socket-relay', packet };
    }

    throw new Error('No active P2P DataChannel or Signalling connection to peer.');
  }

  _handleIncomingChatMessage(packet) {
    // Send immediate ACK receipt back across DataChannel
    this._sendControlPacket({
      type: 'ack',
      messageId: packet.messageId
    });

    this.emit('message', {
      message_id: packet.messageId,
      sender_id: packet.senderId,
      sender_name: packet.senderName,
      message_content: packet.content,
      timestamp: packet.timestamp,
      delivery_status: 'delivered',
      isP2P: true
    });
  }

  // ─── Chunk-based Offline File Sharing ───────────────────────────

  /**
   * Send any file directly over WebRTC DataChannel in 64 KB slices.
   * Implements backpressure flow control against dataChannel.bufferedAmount.
   */
  async sendFile(file, options = {}) {
    if (!this.isDataChannelReady()) {
      throw new Error('P2P DataChannel is not open. Establish connection first.');
    }

    if (!file) {
      throw new Error('Valid File object is required.');
    }

    // Size limit check (default 500 MB)
    const maxBytes = 500 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`File exceeds maximum size of 500 MB (Size: ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
    }

    const fileId = 'file_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const chunkSize = this.options.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);

    console.log(`[P2P File Send] Starting: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, ${totalChunks} chunks)`);

    // 1. Send file metadata header
    const metaPacket = {
      type: 'file-meta',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize
    };
    this.dataChannel.send(JSON.stringify(metaPacket));

    // 2. Stream binary slices with flow control
    let offset = 0;
    let chunkIndex = 0;
    const startTime = Date.now();

    while (offset < file.size) {
      // Flow control: wait if buffer exceeds threshold
      if (this.dataChannel.bufferedAmount > this.options.bufferThreshold) {
        await this._waitForBufferDrain();
      }

      const slice = file.slice(offset, offset + chunkSize);
      const arrayBuffer = await slice.arrayBuffer();

      // Prefix chunk with 4-byte chunk index for ordered integrity
      const payload = new Uint8Array(4 + arrayBuffer.byteLength);
      const view = new DataView(payload.buffer);
      view.setUint32(0, chunkIndex);
      payload.set(new Uint8Array(arrayBuffer), 4);

      this.dataChannel.send(payload.buffer);

      offset += slice.size;
      chunkIndex++;

      // Compute progress & speed
      const percent = Math.min(100, Math.round((offset / file.size) * 100));
      const elapsedSeconds = (Date.now() - startTime) / 1000 || 0.001;
      const speedMBps = ((offset / 1024 / 1024) / elapsedSeconds).toFixed(2);

      this.emit('file-progress', {
        fileId,
        fileName: file.name,
        offset,
        total: file.size,
        percent,
        speedMBps,
        direction: 'sending'
      });
    }

    // 3. Send completion notice
    const completePacket = {
      type: 'file-complete',
      fileId
    };
    this.dataChannel.send(JSON.stringify(completePacket));

    console.log(`[P2P File Send] Completed: ${file.name}`);
    this.emit('file-sent', {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      durationMs: Date.now() - startTime
    });

    return { fileId, fileName: file.name, fileSize: file.size };
  }

  _waitForBufferDrain() {
    return new Promise((resolve) => {
      const channel = this.dataChannel;
      channel.bufferedAmountLowThreshold = this.options.bufferThreshold / 2;
      const handler = () => {
        channel.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', handler);
    });
  }

  // ─── Incoming File Processing ───────────────────────────────────

  _handleIncomingFileMeta(meta) {
    console.log(`[P2P File Recv] Receiving file metadata:`, meta);
    this.incomingFiles.set(meta.fileId, {
      meta,
      chunks: new Array(meta.totalChunks),
      receivedBytes: 0,
      receivedChunks: 0,
      startTime: Date.now()
    });

    this.emit('file-progress', {
      fileId: meta.fileId,
      fileName: meta.fileName,
      offset: 0,
      total: meta.fileSize,
      percent: 0,
      speedMBps: '0.00',
      direction: 'receiving'
    });
  }

  _handleIncomingBinaryChunk(arrayBuffer) {
    if (this.incomingFiles.size === 0) return;

    // Read 4-byte chunk index prefix
    const view = new DataView(arrayBuffer);
    const chunkIndex = view.getUint32(0);
    const chunkData = arrayBuffer.slice(4);

    // Find active receiving file
    const activeEntry = Array.from(this.incomingFiles.values())[0];
    if (!activeEntry) return;

    activeEntry.chunks[chunkIndex] = chunkData;
    activeEntry.receivedBytes += chunkData.byteLength;
    activeEntry.receivedChunks++;

    const percent = Math.min(100, Math.round((activeEntry.receivedBytes / activeEntry.meta.fileSize) * 100));
    const elapsedSeconds = (Date.now() - activeEntry.startTime) / 1000 || 0.001;
    const speedMBps = ((activeEntry.receivedBytes / 1024 / 1024) / elapsedSeconds).toFixed(2);

    this.emit('file-progress', {
      fileId: activeEntry.meta.fileId,
      fileName: activeEntry.meta.fileName,
      offset: activeEntry.receivedBytes,
      total: activeEntry.meta.fileSize,
      percent,
      speedMBps,
      direction: 'receiving'
    });
  }

  _handleIncomingFileComplete(packet) {
    const entry = this.incomingFiles.get(packet.fileId);
    if (!entry) return;

    console.log(`[P2P File Recv] Transfer finished for: ${entry.meta.fileName}`);

    // Reassemble binary chunks into single complete Blob
    const blob = new Blob(entry.chunks, { type: entry.meta.fileType });
    const downloadUrl = URL.createObjectURL(blob);

    this.emit('file-received', {
      fileId: entry.meta.fileId,
      fileName: entry.meta.fileName,
      fileSize: entry.meta.fileSize,
      fileType: entry.meta.fileType,
      blob,
      downloadUrl,
      durationMs: Date.now() - entry.startTime
    });

    this.incomingFiles.delete(packet.fileId);
  }

  // ─── Latency Ping/Pong ──────────────────────────────────────────

  _startHeartbeatPing() {
    this._stopHeartbeatPing();
    this.pingTimer = setInterval(() => {
      if (this.isDataChannelReady()) {
        this._sendControlPacket({ type: 'ping', timestamp: Date.now() });
      }
    }, 2000);
  }

  _stopHeartbeatPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ─── Connection Lifecycle ───────────────────────────────────────

  isDataChannelReady() {
    return this.dataChannel && this.dataChannel.readyState === 'open';
  }

  disconnect(notifyPeer = true) {
    this._stopHeartbeatPing();

    if (notifyPeer && this.activePeer) {
      if (this.socket && this.socket.connected) {
        this.socket.emit('disconnect-peer', { to: this.activePeer.userId });
      }
    }

    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
      this.peerConnection = null;
    }

    const prevPeer = this.activePeer;
    this.activePeer = null;
    this.isInitiator = false;

    if (prevPeer) {
      this.emit('connection-state', { state: 'disconnected', peer: prevPeer });
    }
  }
}

// Make accessible to all frontend controllers
if (typeof window !== 'undefined') {
  window.ProxiLinkP2P = ProxiLinkP2P;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProxiLinkP2P;
}
