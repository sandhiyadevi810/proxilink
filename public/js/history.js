/**
 * ProxiLink – History Controller
 * Renders file transfer records and message audit logs with filtering and download actions.
 */
'use strict';

let currentTab = 'files'; // 'files' | 'messages'
let rawFiles = [];
let rawMessages = [];

document.addEventListener('DOMContentLoaded', () => {
  loadHistoryData();
});

function switchView(tab) {
  currentTab = tab;

  const filesBtn = document.getElementById('tab-files-btn');
  const msgsBtn  = document.getElementById('tab-msgs-btn');
  const filesView = document.getElementById('files-view');
  const msgsView  = document.getElementById('messages-view');

  if (tab === 'files') {
    filesBtn.classList.add('active');
    msgsBtn.classList.remove('active');
    filesView.classList.remove('hidden');
    msgsView.classList.add('hidden');
  } else {
    filesBtn.classList.remove('active');
    msgsBtn.classList.add('active');
    filesView.classList.add('hidden');
    msgsView.classList.remove('hidden');
  }

  applyFilters();
}

async function loadHistoryData() {
  try {
    const [fRes, mRes] = await Promise.all([
      fetch('/api/files/history', { credentials: 'include' }),
      fetch('/api/messages/all',   { credentials: 'include' })
    ]);

    if (!fRes.ok || !mRes.ok) {
      if (fRes.status === 401 || mRes.status === 401) {
        window.location.href = '/auth';
        return;
      }
    }

    const fData = fRes.ok ? await fRes.json() : { history: [] };
    const mData = mRes.ok ? await mRes.json() : { messages: [] };

    rawFiles = fData.history || [];
    rawMessages = mData.messages || [];

    document.getElementById('file-count').textContent = rawFiles.length;
    document.getElementById('msg-count').textContent = rawMessages.length;

    applyFilters();
  } catch (err) {
    console.error('[History] Failed to load history records:', err);
    showToast('Failed to load history data.', 'error');
  }
}

function applyFilters() {
  const query = document.getElementById('history-search').value.toLowerCase();
  const protoFilter = document.getElementById('protocol-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  if (currentTab === 'files') {
    renderFilteredFiles(query, protoFilter, statusFilter);
  } else {
    renderFilteredMessages(query, statusFilter);
  }
}

function renderFilteredFiles(query, protoFilter, statusFilter) {
  const tbody = document.getElementById('files-tbody');
  if (!tbody) return;

  const filtered = rawFiles.filter(item => {
    const matchQuery = !query ||
      item.file_name.toLowerCase().includes(query) ||
      (item.sender_name && item.sender_name.toLowerCase().includes(query)) ||
      (item.receiver_name && item.receiver_name.toLowerCase().includes(query));

    const matchStatus = statusFilter === 'all' || item.status.toLowerCase() === statusFilter;
    return matchQuery && matchStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted" style="padding:2rem">
          No file transfer records found.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isCompleted = item.status === 'completed';
    const statusBadge = isCompleted
      ? '<span class="badge badge-success">Completed</span>'
      : item.status === 'in_progress'
      ? '<span class="badge badge-primary">In Progress</span>'
      : '<span class="badge badge-danger">Failed</span>';

    const direction = `${escHtml(item.sender_name || 'You')} → ${escHtml(item.receiver_name || 'Peer')}`;
    const fileId = item.file_id || item.transfer_id;

    return `
      <tr>
        <td><strong>${escHtml(item.file_name)}</strong></td>
        <td><span class="text-xs text-muted">${escHtml(item.file_type || 'binary')}</span></td>
        <td>${formatBytes(item.file_size || item.total_bytes)}</td>
        <td>${direction}</td>
        <td><span class="protocol-tag proto-http">LAN/HTTP</span></td>
        <td>${statusBadge}</td>
        <td>${formatDate(item.started_at)}</td>
        <td>
          <a href="/api/files/${fileId}/download" target="_blank" class="btn btn-sm btn-ghost">
            ⬇ Download
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function renderFilteredMessages(query, statusFilter) {
  const tbody = document.getElementById('messages-tbody');
  if (!tbody) return;

  const filtered = rawMessages.filter(item => {
    const matchQuery = !query ||
      item.content.toLowerCase().includes(query) ||
      (item.sender_name && item.sender_name.toLowerCase().includes(query)) ||
      (item.receiver_name && item.receiver_name.toLowerCase().includes(query)) ||
      (item.group_name && item.group_name.toLowerCase().includes(query));

    const matchStatus = statusFilter === 'all' || (item.status && item.status.toLowerCase() === statusFilter);
    return matchQuery && matchStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding:2rem">
          No message records found.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const target = item.group_name ? `👥 ${escHtml(item.group_name)}` : escHtml(item.receiver_name || 'Direct Peer');
    const sender = escHtml(item.sender_name || 'User');
    const preview = item.message_type === 'file' ? '📁 [File Attachment]' : escHtml(item.content);

    return `
      <tr>
        <td><span class="text-xs text-muted">${sender}</span></td>
        <td><strong>${target}</strong></td>
        <td><div class="truncate" style="max-width:320px">${preview}</div></td>
        <td><span class="badge badge-info">${escHtml(item.message_type || 'text')}</span></td>
        <td>${formatDate(item.sent_at)}</td>
        <td><span class="badge badge-success">${escHtml(item.status || 'sent')}</span></td>
      </tr>
    `;
  }).join('');
}
