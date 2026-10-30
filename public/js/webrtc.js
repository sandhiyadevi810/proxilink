/**
 * ProxiLink – WebRTC P2P Engine
 * Manages RTCPeerConnection and RTCDataChannel for zero-cloud LAN data transfer.
 */
'use strict';

let peerConnection = null;
let dataChannel = null;
let currentPeerId = null;

// For pure offline LAN, host ICE candidates work without STUN.
// Optional STUN fallback included for networks with symmetric NAT.
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 2
};

/**
 * Initialize WebRTC as the caller (Initiator).
 * @param {number} targetUserId 
 */
async function startWebRTCConnection(targetUserId) {
  currentPeerId = targetUserId;
  closeWebRTC();

  updateRTCStatusUI('connecting', 'Establishing WebRTC...');

  try {
    peerConnection = new RTCPeerConnection(RTC_CONFIG);
    setupPeerConnectionListeners(peerConnection, targetUserId);

    // Create reliable, ordered DataChannel for messaging & file chunks
    dataChannel = peerConnection.createDataChannel('proxilink-data', {
      ordered: true
    });
    setupDataChannelListeners(dataChannel);

    // Create and dispatch SDP Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('signal', {
      to: targetUserId,
      type: 'offer',
      sdp: offer.sdp
    });

    console.log('[WebRTC] Offer created and transmitted to peer:', targetUserId);
  } catch (err) {
    console.error('[WebRTC] Error initiating WebRTC:', err);
    updateRTCStatusUI('failed', 'WebRTC Failed (Using Relay)');
  }
}

/**
 * Handle incoming signalling message relayed through Socket.IO.
 * @param {object} payload 
 */
async function handleIncomingSignal(payload) {
  const { from, type, sdp, candidate } = payload;

  try {
    if (type === 'offer') {
      currentPeerId = from;
      closeWebRTC();
      updateRTCStatusUI('connecting', 'Receiving connection...');

      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      setupPeerConnectionListeners(peerConnection, from);

      // Listen for remote DataChannel creation
      peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannelListeners(dataChannel);
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('signal', {
        to: from,
        type: 'answer',
        sdp: answer.sdp
      });
      console.log('[WebRTC] Answer created and returned to peer:', from);

    } else if (type === 'answer') {
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        console.log('[WebRTC] Remote description set from answer.');
      }

    } else if (type === 'candidate' && candidate) {
      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  } catch (err) {
    console.error('[WebRTC] Signal handling error:', err);
  }
}

/**
 * Configure RTCPeerConnection lifecycle listeners.
 */
function setupPeerConnectionListeners(pc, peerId) {
  pc.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('signal', {
        to: peerId,
        type: 'candidate',
        candidate: event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', pc.connectionState);
    if (pc.connectionState === 'connected') {
      updateRTCStatusUI('connected', 'Direct P2P (LAN)');
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      updateRTCStatusUI('failed', 'Relay Fallback');
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
  };
}

/**
 * Configure RTCDataChannel event listeners.
 */
function setupDataChannelListeners(dc) {
  dc.binaryType = 'arraybuffer';

  dc.onopen = () => {
    console.log('[WebRTC] DataChannel OPEN.');
    updateRTCStatusUI('connected', 'Direct P2P (Active)');
    const channelStatus = document.getElementById('rtc-channel-status');
    const modeLabel = document.getElementById('rtc-mode-label');
    if (channelStatus) channelStatus.textContent = 'DataChannel: Open (High Speed)';
    if (modeLabel) modeLabel.textContent = 'P2P Direct Mode';
  };

  dc.onclose = () => {
    console.log('[WebRTC] DataChannel CLOSED.');
    updateRTCStatusUI('closed', 'Relay Mode');
    const channelStatus = document.getElementById('rtc-channel-status');
    const modeLabel = document.getElementById('rtc-mode-label');
    if (channelStatus) channelStatus.textContent = 'DataChannel: Closed';
    if (modeLabel) modeLabel.textContent = 'Relay Mode';
  };

  dc.onerror = (err) => {
    console.error('[WebRTC] DataChannel error:', err);
  };

  dc.onmessage = (event) => {
    // Check if data is binary (ArrayBuffer: file transfer chunk) or text (JSON message)
    if (event.data instanceof ArrayBuffer) {
      if (typeof handleReceivedFileChunk === 'function') {
        handleReceivedFileChunk(event.data);
      }
    } else if (typeof event.data === 'string') {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'file_header') {
          if (typeof handleFileHeader === 'function') handleFileHeader(parsed);
        } else if (parsed.type === 'chat_message') {
          if (typeof renderIncomingMessage === 'function') renderIncomingMessage(parsed);
        }
      } catch {
        console.log('[WebRTC] Raw string message:', event.data);
      }
    }
  };
}

/**
 * Send data over RTCDataChannel if open. Returns true if sent via P2P.
 * @param {string|ArrayBuffer} data 
 * @returns {boolean}
 */
function sendViaP2P(data) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(data);
    return true;
  }
  return false;
}

/**
 * Check whether WebRTC P2P DataChannel is currently open and ready.
 * @returns {boolean}
 */
function isP2PReady() {
  return !!(dataChannel && dataChannel.readyState === 'open');
}

/**
 * Close active WebRTC connection and cleanup.
 */
function closeWebRTC() {
  if (dataChannel) {
    try { dataChannel.close(); } catch {}
    dataChannel = null;
  }
  if (peerConnection) {
    try { peerConnection.close(); } catch {}
    peerConnection = null;
  }
  updateRTCStatusUI('closed', 'Not Connected');
}

/**
 * Update UI indicators for WebRTC state.
 */
function updateRTCStatusUI(status, label) {
  const badge = document.getElementById('rtc-status-badge');
  const btn = document.getElementById('connect-btn');
  if (!badge) return;

  const dot = badge.querySelector('.dot');
  const text = badge.querySelector('span');

  if (status === 'connected') {
    if (dot) dot.style.background = 'var(--clr-success)';
    if (text) text.textContent = label || 'P2P Connected';
    if (btn) { btn.textContent = '✓ Connected'; btn.disabled = true; }
  } else if (status === 'connecting') {
    if (dot) dot.style.background = 'var(--clr-warning)';
    if (text) text.textContent = label || 'Connecting...';
    if (btn) { btn.textContent = 'Connecting...'; btn.disabled = true; }
  } else {
    if (dot) dot.style.background = 'var(--clr-text-dim)';
    if (text) text.textContent = label || 'Relay Mode';
    if (btn) { btn.textContent = '📶 Connect P2P'; btn.disabled = false; }
  }
}
