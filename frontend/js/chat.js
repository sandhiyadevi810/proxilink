/**
 * ProxiLink – Unified Messaging Controller (Phase 7)
 * Implements Unified Wi-Fi & Bluetooth mode selection, offline message queueing with auto-flush,
 * in-chat keyword search, in-line file sharing attachments, and ACK delivery verification.
 */
'use strict';

let currentPeer = {
  id: 2,
  name: 'Alex Johnson',
  isGroup: false,
  isLive: false
};

let currentSearchTerm = '';
let currentMode = 'wifi'; // 'wifi' | 'bluetooth'

// Conversation history store: peerId -> array of message objects
const conversationStore = {
  2: [
    { id: 'm1', fromMe: false, text: "Hey! Connected to your ProxiLink node via local Wi-Fi.", time: "10:14 AM", status: 'delivered', mode: 'wifi' },
    { id: 'm2', fromMe: true, text: "Awesome! WebRTC DataChannel is open and running at gigabit LAN speed.", time: "10:15 AM", status: 'delivered', mode: 'wifi' },
    { id: 'm3', fromMe: false, text: "Let's test sending a document without touching the internet.", time: "10:16 AM", status: 'delivered', mode: 'wifi' }
  ],
  101: [
    { id: 'm4', fromMe: false, text: "Welcome everyone to the Offline Project Team group!", time: "09:30 AM", sender: "Dr. Evans", status: 'delivered', mode: 'wifi' },
    { id: 'm5', fromMe: true, text: "All nodes reporting synchronized state over local subnet.", time: "09:32 AM", sender: "You", status: 'delivered', mode: 'wifi' }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  initChatPage();
});

async function initChatPage() {
  const savedPeerId = sessionStorage.getItem('chat_peer_id');
  const savedName   = sessionStorage.getItem('chat_peer_name');
  const savedMode   = sessionStorage.getItem('chat_mode');

  if (savedPeerId) {
    currentPeer.id = parseInt(savedPeerId, 10) || 2;
    currentPeer.name = savedName || 'Peer Node';
    currentPeer.isGroup = savedMode === 'group';
  }

  // Restore communication mode
  if (window.unifiedComms) {
    currentMode = window.unifiedComms.getMode();
  }
  updateModeUI(currentMode);

  // Initialize Engines if available
  initEngines();

  updateChatHeader();
  await loadContacts();
  checkAndDisplayOfflineQueue();
  renderConversation();
}

function initEngines() {
  // 1. WebRTC P2P Engine
  if (typeof ProxiLinkP2P !== 'undefined' && !window.p2pEngine) {
    window.p2pEngine = new ProxiLinkP2P();
    window.p2pEngine.init({
      userId: parseInt(localStorage.getItem('user_id'), 10) || Math.floor(Math.random() * 800) + 100,
      username: localStorage.getItem('username') || 'local_user',
      displayName: localStorage.getItem('display_name') || 'Local Node'
    });
  }

  if (window.p2pEngine) {
    window.p2pEngine.on('message', (msg) => {
      handleIncomingMessage(msg, 'wifi');
    });

    window.p2pEngine.on('message-delivered', ({ messageId }) => {
      markMessageDelivered(messageId);
    });

    window.p2pEngine.on('datachannel-state', ({ state }) => {
      updateChatHeader();
      if (state === 'open') {
        autoFlushPendingQueue();
      }
    });
  }

  // 2. Bluetooth BLE Engine
  if (typeof ProxiLinkBLE !== 'undefined' && !window.bleEngine) {
    window.bleEngine = new ProxiLinkBLE();
  }

  if (window.bleEngine) {
    window.bleEngine.on('message-received', (msg) => {
      handleIncomingMessage({
        message_id: msg.id,
        sender_id: currentPeer.id,
        sender_name: currentPeer.name,
        message_content: msg.text,
        timestamp: msg.timestamp
      }, 'bluetooth');
    });

    window.bleEngine.on('state-change', ({ state }) => {
      updateChatHeader();
      if (state === 'connected') {
        autoFlushPendingQueue();
      }
    });
  }

  // 3. Unified Comms Engine
  if (window.unifiedComms) {
    window.unifiedComms.on('queue-updated', () => {
      checkAndDisplayOfflineQueue();
    });

    window.unifiedComms.on('message-status', ({ id, status }) => {
      updateMessageStatus(id, status);
    });
  }
}

// ─── Communication Mode Switcher ──────────────────────────────────

function setCommunicationMode(mode) {
  if (mode === currentMode) return;

  if (mode === 'bluetooth') {
    if (!window.bleEngine || !window.bleEngine.isConnected) {
      showToast('Notice: Bluetooth peripheral not currently paired. Messages will queue in offline outbox.', 'info');
    }
  } else if (mode === 'wifi') {
    if (!window.p2pEngine || !window.p2pEngine.isDataChannelReady()) {
      showToast('Notice: Wi-Fi P2P DataChannel is connecting on local LAN.', 'info');
    }
  }

  currentMode = mode;
  if (window.unifiedComms) {
    window.unifiedComms.setMode(mode);
  }

  updateModeUI(mode);
  showToast(`Switched communication mode to ${mode === 'wifi' ? 'Wi-Fi P2P' : 'Bluetooth BLE'}`, 'success');
}

function updateModeUI(mode) {
  const wifiBtn = document.getElementById('mode-btn-wifi');
  const btBtn   = document.getElementById('mode-btn-bt');
  const badge   = document.getElementById('active-proto-badge');
  const indicator = document.getElementById('current-mode-indicator');

  if (mode === 'wifi') {
    if (wifiBtn) { wifiBtn.className = 'btn btn-primary btn-sm'; }
    if (btBtn)   { btBtn.className = 'btn btn-ghost btn-sm'; }
    if (badge)   { badge.className = 'proto-badge proto-webrtc'; badge.innerHTML = '<i class="fa-solid fa-shield-check"></i> WebRTC P2P'; }
    if (indicator) { indicator.innerHTML = '<i class="fa-solid fa-circle-dot text-success"></i> Wi-Fi Channel Active'; }
  } else {
    if (wifiBtn) { wifiBtn.className = 'btn btn-ghost btn-sm'; }
    if (btBtn)   { btBtn.className = 'btn btn-secondary btn-sm'; }
    if (badge)   { badge.className = 'proto-badge proto-bt'; badge.innerHTML = '<i class="fa-brands fa-bluetooth-b"></i> Bluetooth BLE'; }
    if (indicator) { indicator.innerHTML = '<i class="fa-solid fa-circle-dot text-accent"></i> BLE Serial GATT'; }
  }

  updateChatHeader();
}

function updateChatHeader() {
  const nameEl   = document.getElementById('chat-peer-name');
  const avatarEl = document.getElementById('chat-peer-avatar');
  const statusEl = document.getElementById('chat-peer-status');

  if (nameEl) nameEl.textContent = currentPeer.name;
  if (avatarEl) avatarEl.textContent = currentPeer.name.slice(0, 2).toUpperCase();

  if (statusEl) {
    if (currentPeer.isGroup) {
      statusEl.textContent = 'Group Discussion (Subnet Broadcast)';
    } else if (currentMode === 'wifi') {
      const isReady = window.p2pEngine && window.p2pEngine.isDataChannelReady();
      statusEl.textContent = isReady ? '🟢 Wi-Fi DataChannel (Encrypted P2P)' : '🟡 LAN Node (Connecting P2P...)';
    } else if (currentMode === 'bluetooth') {
      const isReady = window.bleEngine && window.bleEngine.isConnected;
      statusEl.textContent = isReady ? '🔵 Bluetooth BLE (GATT Active)' : '⚪ BLE Peripheral (Offline / Disconnected)';
    }
  }
}

// ─── Contacts & Discussions ───────────────────────────────────────

async function loadContacts() {
  const container = document.getElementById('chat-contacts-list');
  if (!container) return;

  try {
    const res = await fetch('/api/users', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const users = data.users || [];
      if (users.length > 0) {
        container.innerHTML = `
          <!-- Group Tab -->
          <div class="user-item ${currentPeer.isGroup ? 'active' : ''}" onclick="switchChat(101, 'Engineering Project Team', true)">
            <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:linear-gradient(135deg, var(--secondary), var(--primary));color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:700">
              <i class="fa-solid fa-users"></i>
            </div>
            <div style="flex:1;overflow:hidden">
              <div style="font-weight:600;font-size:0.9rem">Engineering Project Team</div>
              <div class="text-xs text-muted">Group • Subnet Broadcast</div>
            </div>
          </div>
        ` + users.map(u => `
          <div class="user-item ${(!currentPeer.isGroup && currentPeer.id === u.user_id) ? 'active' : ''}" onclick="switchChat(${u.user_id}, '${escHtml(u.display_name)}', false, true)">
            <div style="width:40px;height:40px;border-radius:50%;background:${u.avatar_color || 'var(--primary)'};color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:700">
              ${u.display_name.slice(0, 2).toUpperCase()}
            </div>
            <div style="flex:1;overflow:hidden">
              <div style="font-weight:600;font-size:0.9rem">${escHtml(u.display_name)}</div>
              <div class="text-xs text-muted">@${escHtml(u.username)}</div>
            </div>
            <span class="status-dot online"></span>
          </div>
        `).join('');
        return;
      }
    }
  } catch {}

  // Fallback contacts
  container.innerHTML = `
    <div class="user-item ${currentPeer.isGroup ? 'active' : ''}" onclick="switchChat(101, 'Engineering Project Team', true)">
      <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:linear-gradient(135deg, var(--secondary), var(--primary));color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:700">
        <i class="fa-solid fa-users"></i>
      </div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:600;font-size:0.9rem">Engineering Project Team</div>
        <div class="text-xs text-muted">Group • Subnet Broadcast</div>
      </div>
    </div>
    <div class="user-item ${(!currentPeer.isGroup && currentPeer.id === 2) ? 'active' : ''}" onclick="switchChat(2, 'Alex Johnson', false)">
      <div style="width:40px;height:40px;border-radius:50%;background:#06B6D4;color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:700">AJ</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:600;font-size:0.9rem">Alex Johnson</div>
        <div class="text-xs text-muted">@alex_99 • Online</div>
      </div>
      <span class="status-dot online"></span>
    </div>
    <div class="user-item ${(!currentPeer.isGroup && currentPeer.id === 3) ? 'active' : ''}" onclick="switchChat(3, 'Sarah Connor', false)">
      <div style="width:40px;height:40px;border-radius:50%;background:#8B5CF6;color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:700">SC</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:600;font-size:0.9rem">Sarah Connor</div>
        <div class="text-xs text-muted">@sarah_c • Online</div>
      </div>
      <span class="status-dot online"></span>
    </div>
  `;
}

function switchChat(id, name, isGroup, isLive = false) {
  currentPeer.id = id;
  currentPeer.name = name;
  currentPeer.isGroup = isGroup;
  currentPeer.isLive = isLive;

  sessionStorage.setItem('chat_peer_id', id);
  sessionStorage.setItem('chat_peer_name', name);
  sessionStorage.setItem('chat_mode', isGroup ? 'group' : 'direct');

  updateChatHeader();
  loadContacts();
  checkAndDisplayOfflineQueue();
  renderConversation();

  const sidebar = document.querySelector('.chat-sidebar');
  if (sidebar && window.innerWidth <= 768) {
    sidebar.classList.add('mobile-hidden');
    document.querySelector('.chat-main').classList.remove('mobile-hidden');
  }
}

// ─── In-Chat Search ───────────────────────────────────────────────

function handleChatSearch(e) {
  currentSearchTerm = e.target.value.trim().toLowerCase();
  renderConversation();
}

// ─── Rendering Conversation with Status Badges ────────────────────

function renderConversation() {
  const container = document.getElementById('chat-messages-pane');
  if (!container) return;

  let msgs = conversationStore[currentPeer.id] || [];

  // Filter by search keyword if user entered search query
  if (currentSearchTerm) {
    msgs = msgs.filter(m => m.text && m.text.toLowerCase().includes(currentSearchTerm));
  }

  if (msgs.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted" style="margin:auto;padding:2rem">
        <i class="fa-solid fa-comments" style="font-size:2.5rem;margin-bottom:0.75rem;color:var(--border-color)"></i>
        <p>${currentSearchTerm ? 'No messages match search: "' + escHtml(currentSearchTerm) + '"' : 'No messages yet with ' + escHtml(currentPeer.name)}</p>
        <span class="text-xs">Type a message below or attach a file!</span>
      </div>
    `;
    return;
  }

  container.innerHTML = msgs.map(m => {
    let tickHtml = '';
    if (m.fromMe) {
      if (m.status === 'delivered') {
        tickHtml = '<i class="fa-solid fa-check-double text-secondary tick-icon" title="Delivered to peer (ACK confirmed)"></i>';
      } else if (m.status === 'pending') {
        tickHtml = '<i class="fa-solid fa-clock text-warning tick-icon" title="Queued in offline outbox"></i>';
      } else if (m.status === 'failed') {
        tickHtml = '<i class="fa-solid fa-triangle-exclamation text-danger tick-icon" title="Delivery interrupted"></i>';
      } else {
        tickHtml = '<i class="fa-solid fa-check text-muted tick-icon" title="Sent to channel"></i>';
      }
    }

    const protoBadge = m.mode === 'bluetooth' ? '<span class="proto-badge proto-bt" style="font-size:0.65rem;padding:0.1rem 0.35rem">BLE</span>' : '';

    return `
      <div class="msg-bubble-wrapper ${m.fromMe ? 'msg-sent' : 'msg-recv'}" style="display:flex;flex-direction:column;align-items:${m.fromMe ? 'flex-end' : 'flex-start'};margin-bottom:0.75rem" id="bubble-${m.id || ''}">
        ${(!m.fromMe && currentPeer.isGroup) ? `<span class="text-xs text-muted" style="margin-bottom:0.2rem">${escHtml(m.sender || 'Peer')}</span>` : ''}
        
        <div class="msg-bubble" style="padding:0.7rem 1.1rem;border-radius:var(--radius-md);max-width:72%;font-size:0.9rem;word-break:break-word;${m.fromMe ? (m.status === 'pending' ? 'background:rgba(245,158,11,0.25);border:1px dashed var(--warning);color:var(--text-main);' : 'background:linear-gradient(135deg,var(--secondary),var(--primary));color:#FFF;border-bottom-right-radius:4px;') : 'background:var(--bg-surface-solid);color:var(--text-main);border:1px solid var(--border-subtle);border-bottom-left-radius:4px;'}">
          ${m.isFile ? `
            <div class="flex items-center gap-3">
              <i class="fa-solid ${m.fileIcon || 'fa-file'} text-accent" style="font-size:1.5rem"></i>
              <div>
                <div style="font-weight:600">${escHtml(m.fileName)}</div>
                <div class="text-xs" style="opacity:0.85">${formatBytes(m.fileSize)}</div>
              </div>
              ${m.downloadUrl ? `<a href="${m.downloadUrl}" download="${escHtml(m.fileName)}" class="btn btn-sm btn-ghost" style="color:#FFF" title="Save file"><i class="fa-solid fa-download"></i></a>` : ''}
            </div>
          ` : escHtml(m.text)}
        </div>

        <div class="text-xs text-muted flex items-center gap-1" style="margin-top:0.25rem">
          <span>${m.time}</span>
          ${protoBadge}
          ${tickHtml}
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ─── Unified Messaging Dispatch ───────────────────────────────────

async function sendChatMessage() {
  const input = document.getElementById('chat-input-text');
  const text = input.value.trim();
  if (!text) return;

  const msgId = 'msg_' + Date.now();
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!conversationStore[currentPeer.id]) {
    conversationStore[currentPeer.id] = [];
  }

  const newMsg = {
    id: msgId,
    fromMe: true,
    text: text,
    time: timeStr,
    status: 'sent',
    mode: currentMode
  };

  conversationStore[currentPeer.id].push(newMsg);
  input.value = '';
  renderConversation();

  // Dispatch via Unified Comms Manager
  if (window.unifiedComms) {
    try {
      const res = await window.unifiedComms.sendMessage(text, currentPeer.id, currentPeer.name);
      if (res && res.queued) {
        newMsg.status = 'pending';
        renderConversation();
        checkAndDisplayOfflineQueue();
        showToast('Peer unreachable on current mode. Message saved in offline outbox.', 'info');
      }
    } catch (err) {
      console.warn('[Chat Dispatch Notice]', err);
    }
  }

  // Demonstration simulated ACK when chatting with demo peer
  if (!currentPeer.isLive) {
    simulateDemonstrationResponse(text, msgId);
  }
}

// ─── In-Line File Sharing Attachment ──────────────────────────────

async function handleChatFileAttach(e) {
  if (e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    const msgId = 'file_' + Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Mode-specific size check
    if (currentMode === 'bluetooth' && file.size > 2 * 1024 * 1024) {
      showToast('Bluetooth BLE limit is 2 MB. Switch to Wi-Fi P2P for files up to 500 MB.', 'warning');
      return;
    }

    if (!conversationStore[currentPeer.id]) {
      conversationStore[currentPeer.id] = [];
    }

    const fileMsg = {
      id: msgId,
      fromMe: true,
      isFile: true,
      fileName: file.name,
      fileSize: file.size,
      fileIcon: file.type.includes('image') ? 'fa-file-image' : (file.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file'),
      time: timeStr,
      status: 'sent',
      mode: currentMode
    };

    conversationStore[currentPeer.id].push(fileMsg);
    renderConversation();
    showToast(`Streaming ${file.name} over ${currentMode === 'wifi' ? 'Wi-Fi P2P' : 'Bluetooth BLE'}...`, 'info');

    try {
      if (window.unifiedComms) {
        await window.unifiedComms.sendFile(file, currentPeer.id);
        fileMsg.status = 'delivered';
        renderConversation();
        showToast(`File "${file.name}" delivered!`, 'success');
      }
    } catch (err) {
      console.warn('[Attachment Transfer Warning]', err);
      showToast(err.message, 'warning');
    }
  }
}

// ─── Offline Outbox Queueing Logic ────────────────────────────────

function checkAndDisplayOfflineQueue() {
  const banner = document.getElementById('chat-offline-queue-banner');
  const textEl = document.getElementById('offline-queue-text');
  if (!banner || !window.unifiedComms) return;

  const pending = window.unifiedComms.getPendingForPeer(currentPeer.id);
  if (pending.length > 0) {
    banner.classList.remove('hidden');
    textEl.textContent = `${pending.length} message${pending.length > 1 ? 's' : ''} queued offline. Auto-sending when connection restores...`;
  } else {
    banner.classList.add('hidden');
  }
}

async function retryFlushOfflineQueue() {
  if (!window.unifiedComms) return;
  showToast('Attempting to flush queued messages...', 'info');

  const count = await window.unifiedComms.flushOfflineQueue(currentPeer.id, async (msg) => {
    if (msg.mode === 'wifi' && window.p2pEngine) {
      window.p2pEngine.sendMessage(msg.content, msg.id);
    } else if (msg.mode === 'bluetooth' && window.bleEngine) {
      await window.bleEngine.sendMessage(msg.content);
    }
  });

  if (count > 0) {
    showToast(`Successfully transmitted ${count} queued messages!`, 'success');
    checkAndDisplayOfflineQueue();
    renderConversation();
  } else {
    showToast('Peer connection still unavailable. Messages remain queued.', 'warning');
  }
}

function autoFlushPendingQueue() {
  if (window.unifiedComms) {
    retryFlushOfflineQueue();
  }
}

function updateMessageStatus(id, status) {
  for (const peerId in conversationStore) {
    const list = conversationStore[peerId];
    const item = list.find(m => m.id === id);
    if (item) {
      item.status = status;
      renderConversation();
      break;
    }
  }
}

function markMessageDelivered(msgId) {
  updateMessageStatus(msgId, 'delivered');
}

function handleIncomingMessage(msg, mode = 'wifi') {
  const senderId = msg.sender_id || currentPeer.id;
  const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!conversationStore[senderId]) {
    conversationStore[senderId] = [];
  }

  conversationStore[senderId].push({
    id: msg.message_id || 'in_' + Date.now(),
    fromMe: false,
    text: msg.message_content || msg.text,
    time: timeStr,
    sender: msg.sender_name || 'Peer',
    mode
  });

  if (currentPeer.id === senderId) {
    renderConversation();
  }
  showToast(`Direct ${mode.toUpperCase()} message from ${msg.sender_name || 'Peer'}`, 'info');
}

function handleChatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function insertEmoji(emoji) {
  const input = document.getElementById('chat-input-text');
  if (input) {
    input.value += emoji;
    input.focus();
  }
}

function simulateDemonstrationResponse(originalMsg, sentMsgId) {
  const indicator = document.getElementById('chat-typing-indicator');
  if (indicator) indicator.classList.remove('hidden');

  setTimeout(() => {
    markMessageDelivered(sentMsgId);
    if (indicator) indicator.classList.add('hidden');

    const responses = [
      `Message received over unified ${currentMode.toUpperCase()} channel!`,
      "Packet validated and stored into local SQLite history.",
      "Acknowledged. Ready for next message or binary attachment."
    ];
    const replyText = responses[Math.floor(Math.random() * responses.length)];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    conversationStore[currentPeer.id].push({
      id: 'resp_' + Date.now(),
      fromMe: false,
      text: replyText,
      time: timeStr,
      sender: currentPeer.name,
      mode: currentMode,
      status: 'delivered'
    });

    renderConversation();
  }, 1200);
}

function toggleMobileChatSidebar() {
  const sidebar = document.querySelector('.chat-sidebar');
  const main = document.querySelector('.chat-main');
  if (sidebar && main) {
    sidebar.classList.toggle('mobile-hidden');
    main.classList.toggle('mobile-hidden');
  }
}
