/**
 * ProxiLink – Chat Controller
 * Manages conversation loading, active peer selection, message transmission,
 * typing indicators, and file attachments.
 */
'use strict';

let currentUser = null;
let currentChat = {
  id: null,       // userId or groupId
  name: '',
  mode: 'direct'  // 'direct' | 'group'
};

let contactList = [];
let onlineUserIds = new Set();
let typingTimeout = null;

// ── Initialization ────────────────────────────────────────────────────────────
async function initChat() {
  currentUser = getCachedUser();
  if (!currentUser) {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) { window.location.href = '/auth'; return; }
      const data = await res.json();
      currentUser = data.user;
      sessionStorage.setItem('proxilink_user', JSON.stringify(currentUser));
    } catch {
      window.location.href = '/auth';
      return;
    }
  }

  const navName = document.getElementById('nav-name');
  if (navName) navName.textContent = currentUser.display_name;

  initSocket();
  await loadContacts();

  // Check if a peer was pre-selected from dashboard
  const savedPeerId = sessionStorage.getItem('chat_peer_id');
  const savedName   = sessionStorage.getItem('chat_peer_name');
  const savedMode   = sessionStorage.getItem('chat_mode') || 'direct';

  if (savedPeerId) {
    selectContact(parseInt(savedPeerId, 10), savedName, savedMode);
  }
}

// ── Load Contacts (Users & Groups) ────────────────────────────────────────────
async function loadContacts() {
  try {
    const [uRes, gRes] = await Promise.all([
      fetch('/api/users', { credentials: 'include' }),
      fetch('/api/groups', { credentials: 'include' })
    ]);

    const uData = uRes.ok ? await uRes.json() : { users: [] };
    const gData = gRes.ok ? await gRes.json() : { groups: [] };

    contactList = [
      ...gData.groups.map(g => ({
        id: g.group_id,
        name: g.group_name,
        isGroup: true,
        meta: `${g.member_count} members`
      })),
      ...uData.users.map(u => ({
        id: u.user_id,
        name: u.display_name,
        username: u.username,
        color: u.avatar_color,
        isGroup: false
      }))
    ];

    renderContacts();
  } catch (err) {
    console.error('[Chat] Failed to load contacts:', err);
  }
}

function renderContacts(filter = '') {
  const container = document.getElementById('contact-list');
  if (!container) return;

  const lc = filter.toLowerCase();
  const filtered = contactList.filter(c => c.name.toLowerCase().includes(lc));

  if (!filtered.length) {
    container.innerHTML = '<p class="text-sm text-muted text-center" style="padding:1rem">No contacts found.</p>';
    return;
  }

  container.innerHTML = filtered.map(c => {
    const isOnline = !c.isGroup && onlineUserIds.has(c.id);
    const initials = c.name.slice(0, 2).toUpperCase();
    const isActive = currentChat.id === c.id && currentChat.mode === (c.isGroup ? 'group' : 'direct');

    return `
      <div class="user-item ${isActive ? 'active' : ''}" onclick="selectContact(${c.id}, '${escHtml(c.name)}', '${c.isGroup ? 'group' : 'direct'}')">
        <div class="avatar avatar-sm" style="background:${c.color || 'var(--clr-primary)'}">${initials}</div>
        <div class="user-info">
          <div class="user-name">${escHtml(c.name)}</div>
          <div class="user-meta">${c.isGroup ? 'Group' : (isOnline ? '🟢 Online' : '⚪ Offline')}</div>
        </div>
        ${!c.isGroup ? `<div class="status-dot ${isOnline ? 'online' : 'offline'}"></div>` : ''}
      </div>
    `;
  }).join('');
}

function filterContacts(val) {
  renderContacts(val);
}

// ── Select Contact / Open Conversation ─────────────────────────────────────────
async function selectContact(id, name, mode = 'direct') {
  currentChat.id = id;
  currentChat.name = name;
  currentChat.mode = mode;

  sessionStorage.setItem('chat_peer_id', id);
  sessionStorage.setItem('chat_peer_name', name);
  sessionStorage.setItem('chat_mode', mode);

  renderContacts();

  document.getElementById('no-chat').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');

  document.getElementById('peer-display-name').textContent = name;
  document.getElementById('peer-avatar').textContent = name.slice(0, 2).toUpperCase();

  const connectBtn = document.getElementById('connect-btn');
  const webrtcBar = document.getElementById('webrtc-bar');

  if (mode === 'group') {
    document.getElementById('peer-status').textContent = 'Group Conversation';
    if (connectBtn) connectBtn.classList.add('hidden');
    if (webrtcBar) webrtcBar.classList.add('hidden');
  } else {
    const isOnline = onlineUserIds.has(id);
    document.getElementById('peer-status').textContent = isOnline ? 'Online (LAN)' : 'Offline';
    if (connectBtn) connectBtn.classList.remove('hidden');
    if (webrtcBar) webrtcBar.classList.remove('hidden');

    // Auto-attempt WebRTC if both peers are online
    if (isOnline && !isP2PReady()) {
      startWebRTCConnection(id);
    }
  }

  await loadMessages();
}

function startWebRTC() {
  if (currentChat.mode === 'direct' && currentChat.id) {
    startWebRTCConnection(currentChat.id);
  }
}

// ── Load Conversation Messages ────────────────────────────────────────────────
async function loadMessages() {
  const container = document.getElementById('messages-area');
  container.innerHTML = '<div class="spinner" style="margin:2rem auto;display:block"></div>';

  try {
    const url = currentChat.mode === 'group'
      ? `/api/messages/group/${currentChat.id}`
      : `/api/messages/conversation/${currentChat.id}`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load messages');
    const data = await res.json();

    const messages = data.messages || [];

    if (!messages.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>No messages yet. Send a message to get started!</p>
        </div>`;
      return;
    }

    container.innerHTML = '';
    messages.forEach(m => {
      const isMe = m.sender_id === currentUser.user_id;
      appendMessageBubble({
        isMe,
        senderName: m.sender_name || (isMe ? 'You' : currentChat.name),
        content: m.content,
        messageType: m.message_type,
        timestamp: m.sent_at,
        status: m.delivery_status
      });
    });

    scrollChatToBottom();
  } catch (err) {
    container.innerHTML = '<p class="text-danger text-center text-sm" style="padding:1rem">Failed to load messages.</p>';
    console.error(err);
  }
}

// ── Send Message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !currentChat.id) return;

  input.value = '';
  stopTyping();

  const tempId = generateTempId();
  const timestamp = new Date().toISOString();

  // Optimistically display bubble in UI
  appendMessageBubble({
    isMe: true,
    senderName: 'You',
    content: text,
    messageType: 'text',
    timestamp,
    status: 'pending'
  });
  scrollChatToBottom();

  if (currentChat.mode === 'direct') {
    // If WebRTC is active, send immediately via P2P
    if (isP2PReady()) {
      sendViaP2P(JSON.stringify({
        type: 'chat_message',
        from: currentUser.user_id,
        senderName: currentUser.display_name,
        content: text,
        messageType: 'text',
        sent_at: timestamp
      }));
    } else if (socket) {
      // Relay through Socket.IO
      socket.emit('relay-message', {
        to: currentChat.id,
        content: text,
        message_type: 'text',
        tempId
      });
    }

    // Persist to local SQLite DB
    try {
      await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          receiver_id: currentChat.id,
          content: text,
          message_type: 'text'
        })
      });
    } catch (err) {
      console.warn('[Chat] Message persistence error:', err);
    }

  } else {
    // Group Message
    if (socket) {
      socket.emit('relay-group-message', {
        groupId: currentChat.id,
        content: text,
        message_type: 'text'
      });
    }

    try {
      await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          group_id: currentChat.id,
          content: text,
          message_type: 'text'
        })
      });
    } catch (err) {
      console.warn('[Chat] Group message persistence error:', err);
    }
  }
}

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── Typing Indicator Logic ────────────────────────────────────────────────────
function handleTyping() {
  if (currentChat.mode !== 'direct' || !socket || !currentChat.id) return;

  socket.emit('typing-start', { to: currentChat.id });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 2000);
}

function stopTyping() {
  if (currentChat.mode !== 'direct' || !socket || !currentChat.id) return;
  socket.emit('typing-stop', { to: currentChat.id });
}

function handlePeerTyping(data) {
  if (currentChat.mode === 'direct' && currentChat.id === data.from) {
    const row = document.getElementById('typing-row');
    const nameEl = document.getElementById('typing-name');
    if (row && nameEl) {
      nameEl.textContent = data.fromName || 'Peer';
      row.style.display = 'flex';
      scrollChatToBottom();
    }
  }
}

function handlePeerStoppedTyping(data) {
  if (currentChat.mode === 'direct' && currentChat.id === data.from) {
    const row = document.getElementById('typing-row');
    if (row) row.style.display = 'none';
  }
}

// ── Incoming Message Handlers ─────────────────────────────────────────────────
function handleIncomingMessage(data) {
  if (currentChat.mode === 'direct' && currentChat.id === data.from) {
    appendMessageBubble({
      isMe: false,
      senderName: data.fromName,
      content: data.content,
      messageType: data.message_type,
      timestamp: data.sent_at
    });
    scrollChatToBottom();
  } else {
    showToast(`New message from ${data.fromName}: "${data.content.slice(0, 30)}..."`, 'info');
  }
}

function handleIncomingGroupMessage(data) {
  if (currentChat.mode === 'group' && currentChat.id === data.groupId) {
    appendMessageBubble({
      isMe: false,
      senderName: data.fromName,
      content: data.content,
      messageType: data.message_type,
      timestamp: data.sent_at
    });
    scrollChatToBottom();
  } else {
    showToast(`New group message in group #${data.groupId}`, 'info');
  }
}

function renderIncomingMessage(data) {
  appendMessageBubble({
    isMe: false,
    senderName: data.senderName,
    content: data.content,
    messageType: data.messageType || 'text',
    timestamp: data.sent_at
  });
  scrollChatToBottom();
}

// ── UI Rendering Helpers ──────────────────────────────────────────────────────
function appendMessageBubble({ isMe, senderName, content, messageType, timestamp, status }) {
  const container = document.getElementById('messages-area');
  if (!container) return;

  // Clear initial empty state
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const row = document.createElement('div');
  row.className = `msg-row ${isMe ? 'sent' : 'recv'}`;

  let bodyHtml = '';

  if (messageType === 'file') {
    try {
      const fileData = typeof content === 'string' && content.startsWith('{') ? JSON.parse(content) : null;
      if (fileData && fileData.downloadUrl) {
        bodyHtml = `
          <div class="bubble file-bubble ${isMe ? 'sent' : 'recv'}">
            <div class="file-info">
              <span class="file-icon">📁</span>
              <div>
                <div class="file-name">${escHtml(fileData.fileName)}</div>
                <div class="file-size">${formatBytes(fileData.fileSize)}</div>
              </div>
            </div>
            <a href="${fileData.downloadUrl}" target="_blank" class="btn btn-sm btn-ghost" style="margin-top:.4rem;text-align:center">⬇ Download</a>
          </div>
        `;
      } else {
        bodyHtml = `<div class="bubble ${isMe ? 'sent' : 'recv'}">📁 ${escHtml(content)}</div>`;
      }
    } catch {
      bodyHtml = `<div class="bubble ${isMe ? 'sent' : 'recv'}">📁 ${escHtml(content)}</div>`;
    }
  } else {
    bodyHtml = `<div class="bubble ${isMe ? 'sent' : 'recv'}">${escHtml(content)}</div>`;
  }

  const metaHtml = `
    <div class="msg-meta">
      ${!isMe ? `<span>${escHtml(senderName)} • </span>` : ''}
      <span>${formatDate(timestamp)}</span>
      ${isMe ? `<span class="tick">${status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}
    </div>
  `;

  row.innerHTML = bodyHtml + metaHtml;
  container.appendChild(row);
}

function appendLocalFileMessage(fileName, fileSize, linkOrType) {
  appendMessageBubble({
    isMe: true,
    senderName: 'You',
    content: JSON.stringify({ fileName, fileSize, downloadUrl: linkOrType.startsWith('/') ? linkOrType : '#' }),
    messageType: 'file',
    timestamp: new Date().toISOString(),
    status: 'delivered'
  });
  scrollChatToBottom();
}

function appendReceivedFileMessage(fileName, fileSize, objectUrl) {
  appendMessageBubble({
    isMe: false,
    senderName: currentChat.name,
    content: JSON.stringify({ fileName, fileSize, downloadUrl: objectUrl }),
    messageType: 'file',
    timestamp: new Date().toISOString()
  });
  scrollChatToBottom();
}

function handleFilePick(e) {
  const file = e.target.files[0];
  if (!file || !currentChat.id) return;
  sendFile(file, currentChat.id);
  e.target.value = '';
}

function scrollChatToBottom() {
  const container = document.getElementById('messages-area');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// ── Socket online user updates ────────────────────────────────────────────────
function onUserList(data) {
  onlineUserIds = new Set(data.onlineUserIds);
  renderContacts();
  if (currentChat.id && currentChat.mode === 'direct') {
    const isOnline = onlineUserIds.has(currentChat.id);
    const statusEl = document.getElementById('peer-status');
    if (statusEl) statusEl.textContent = isOnline ? 'Online (LAN)' : 'Offline';
  }
}

initChat();
