/**
 * ProxiLink – Dashboard Controller
 * Fetches user profile, online status, recent conversations, and transfer metrics.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

async function initDashboard() {
  loadUserProfile();
  checkWirelessStatus();
  loadRecentConversations();
  loadRecentTransfers();
}

function loadUserProfile() {
  let user = getActiveUser();
  if (!user) {
    // Attempt to verify session from backend
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.user) {
          setActiveUser(data.user);
          updateAuthUI();
        } else {
          // Create fallback demo user for preview
          const demo = { user_id: 1, username: 'guest_user', display_name: 'Guest Peer', avatar_color: '#6366F1' };
          setActiveUser(demo);
          updateAuthUI();
        }
      })
      .catch(() => {
        const demo = { user_id: 1, username: 'guest_user', display_name: 'Guest Peer', avatar_color: '#6366F1' };
        setActiveUser(demo);
        updateAuthUI();
      });
  } else {
    updateAuthUI();
  }
}

function checkWirelessStatus() {
  // Wi-Fi Status
  const wifiIpEl = document.getElementById('stat-wifi-ip');
  if (wifiIpEl) {
    wifiIpEl.textContent = window.location.hostname || '127.0.0.1';
  }

  // Web Bluetooth Browser Support Check
  const btStatusEl = document.getElementById('stat-bt-status');
  const btDotEl    = document.getElementById('stat-bt-dot');

  if (navigator.bluetooth) {
    if (btStatusEl) btStatusEl.textContent = 'BLE Supported (Chrome)';
    if (btDotEl) btDotEl.className = 'status-dot online';
  } else {
    if (btStatusEl) btStatusEl.textContent = 'Not Supported (Use Chrome)';
    if (btDotEl) btDotEl.className = 'status-dot offline';
  }
}

async function loadRecentConversations() {
  const container = document.getElementById('recent-chats-list');
  if (!container) return;

  try {
    const res = await fetch('/api/users', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const users = data.users || [];
      if (users.length > 0) {
        container.innerHTML = users.slice(0, 5).map(u => `
          <div class="user-item" onclick="openChatWith(${u.user_id}, '${escHtml(u.display_name)}')">
            <div class="user-avatar-initials" style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${u.avatar_color || 'var(--primary)'};color:#FFF;font-weight:700;font-size:0.85rem">
              ${u.display_name.slice(0, 2).toUpperCase()}
            </div>
            <div style="flex:1;overflow:hidden">
              <div style="font-weight:600;font-size:0.9rem">${escHtml(u.display_name)}</div>
              <div class="text-xs text-muted">@${escHtml(u.username)}</div>
            </div>
            <a href="chat.html" class="btn btn-ghost btn-sm" style="padding:0.3rem 0.6rem">
              <i class="fa-solid fa-message"></i>
            </a>
          </div>
        `).join('');
        return;
      }
    }
  } catch {}

  // Fallback demo conversations
  container.innerHTML = `
    <div class="user-item" onclick="openChatWith(2, 'Sarah Connor')">
      <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#06B6D4;color:#FFF;font-weight:700;font-size:0.85rem">SC</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:600;font-size:0.9rem">Sarah Connor</div>
        <div class="text-xs text-muted">Direct LAN P2P • Active</div>
      </div>
      <a href="chat.html" class="btn btn-ghost btn-sm"><i class="fa-solid fa-message"></i></a>
    </div>
    <div class="user-item" onclick="openChatWith(3, 'Project Research Team')">
      <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#8B5CF6;color:#FFF;font-weight:700;font-size:0.85rem">PR</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:600;font-size:0.9rem">Project Research Team</div>
        <div class="text-xs text-muted">Group Chat • 4 Members</div>
      </div>
      <a href="chat.html" class="btn btn-ghost btn-sm"><i class="fa-solid fa-message"></i></a>
    </div>
  `;
}

async function loadRecentTransfers() {
  const tbody = document.getElementById('recent-transfers-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/files/history?limit=4', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const files = data.history || [];
      if (files.length > 0) {
        tbody.innerHTML = files.map(f => `
          <tr>
            <td><i class="fa-solid fa-file" style="color:var(--secondary);margin-right:0.4rem"></i><strong>${escHtml(f.file_name)}</strong></td>
            <td>${formatBytes(f.file_size)}</td>
            <td><span class="proto-badge proto-wifi">Wi-Fi LAN</span></td>
            <td><span class="badge badge-success">Completed</span></td>
            <td>${formatDate(f.transfer_date || f.started_at)}</td>
          </tr>
        `).join('');
        return;
      }
    }
  } catch {}

  // Fallback demo transfers
  tbody.innerHTML = `
    <tr>
      <td><i class="fa-solid fa-file-pdf" style="color:#EF4444;margin-right:0.4rem"></i><strong>Architecture_Doc.pdf</strong></td>
      <td>4.2 MB</td>
      <td><span class="proto-badge proto-webrtc">WebRTC P2P</span></td>
      <td><span class="badge badge-success">Completed</span></td>
      <td>Today, 10:45 AM</td>
    </tr>
    <tr>
      <td><i class="fa-solid fa-file-image" style="color:#10B981;margin-right:0.4rem"></i><strong>System_Topology.png</strong></td>
      <td>1.8 MB</td>
      <td><span class="proto-badge proto-wifi">Wi-Fi LAN</span></td>
      <td><span class="badge badge-success">Completed</span></td>
      <td>Today, 09:30 AM</td>
    </tr>
  `;
}

function openChatWith(id, name) {
  sessionStorage.setItem('chat_peer_id', id);
  sessionStorage.setItem('chat_peer_name', name);
  sessionStorage.setItem('chat_mode', 'direct');
  window.location.href = 'chat.html';
}
