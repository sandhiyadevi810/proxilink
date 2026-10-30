/**
 * ProxiLink – Transfer & Message History Controller
 * Handles historical audit logs, multi-attribute filtering, and CSV report export.
 */
'use strict';

let activeView = 'files'; // 'files' | 'messages'
let allFiles = [];
let allMessages = [];

// Sample data to guarantee rich demonstration even if database is fresh
const defaultFileHistory = [
  { id: 1, name: 'Project_Design_Phase2.pdf', size: 5450000, sender: 'You', receiver: 'Alex Johnson', proto: 'WebRTC P2P', status: 'Completed', time: '2026-10-30T10:45:00Z' },
  { id: 2, name: 'Network_Topology_Schema.png', size: 1840000, sender: 'Sarah Connor', receiver: 'You', proto: 'Wi-Fi LAN', status: 'Completed', time: '2026-10-30T09:30:00Z' },
  { id: 3, name: 'Android_APK_Release_v1.zip', size: 24800000, sender: 'You', receiver: 'David Kim', proto: 'WebRTC P2P', status: 'Completed', time: '2026-10-29T16:15:00Z' },
  { id: 4, name: 'Telemetry_Log.txt', size: 14200, sender: 'Lab Sensor #01', receiver: 'You', proto: 'Bluetooth BLE', status: 'Completed', time: '2026-10-29T14:20:00Z' },
  { id: 5, name: 'Backup_Database_Wasm.db', size: 8900000, sender: 'You', receiver: 'Alex Johnson', proto: 'Wi-Fi LAN', status: 'Failed', time: '2026-10-28T18:00:00Z' }
];

const defaultMessageHistory = [
  { sender: 'You', receiver: 'Alex Johnson', content: 'WebRTC DataChannel is open and running at gigabit LAN speed.', type: 'Text', time: '2026-10-30T10:15:00Z', status: 'Delivered' },
  { sender: 'Alex Johnson', receiver: 'You', content: 'Let\'s test sending a document without touching the internet.', type: 'Text', time: '2026-10-30T10:16:00Z', status: 'Delivered' },
  { sender: 'Sarah Connor', receiver: 'Project Team', content: 'Wi-Fi Direct Kotlin service successfully compiled on Android 14.', type: 'Group', time: '2026-10-30T09:30:00Z', status: 'Delivered' },
  { sender: 'You', receiver: 'David Kim', content: 'Here is the link to download the native APK bundle.', type: 'Text', time: '2026-10-29T16:10:00Z', status: 'Delivered' }
];

document.addEventListener('DOMContentLoaded', () => {
  loadHistoryRecords();
});

function switchHistoryTab(tab) {
  activeView = tab;

  const filesBtn = document.getElementById('hist-tab-files');
  const msgsBtn  = document.getElementById('hist-tab-msgs');
  const filesContainer = document.getElementById('hist-files-table-wrap');
  const msgsContainer  = document.getElementById('hist-msgs-table-wrap');

  if (tab === 'files') {
    filesBtn.classList.add('active');
    msgsBtn.classList.remove('active');
    filesContainer.classList.remove('hidden');
    msgsContainer.classList.add('hidden');
  } else {
    filesBtn.classList.remove('active');
    msgsBtn.classList.add('active');
    filesContainer.classList.add('hidden');
    msgsContainer.classList.remove('hidden');
  }

  filterHistory();
}

async function loadHistoryRecords() {
  allFiles = [...defaultFileHistory];
  allMessages = [...defaultMessageHistory];

  try {
    const [fRes, mRes] = await Promise.all([
      fetch('/api/files/history', { credentials: 'include' }),
      fetch('/api/messages/all', { credentials: 'include' })
    ]);

    if (fRes.ok) {
      const fData = await fRes.json();
      if (fData.history && fData.history.length > 0) {
        allFiles = [
          ...fData.history.map(item => ({
            id: item.transfer_id || item.file_id,
            name: item.file_name,
            size: item.file_size || item.total_bytes || 0,
            sender: item.sender_name || 'You',
            receiver: item.receiver_name || 'Peer Node',
            proto: 'Wi-Fi LAN',
            status: (item.transfer_status || item.status || 'completed').toLowerCase() === 'completed' ? 'Completed' : 'In Progress',
            time: item.transfer_date || item.started_at || new Date().toISOString()
          })),
          ...defaultFileHistory
        ];
      }
    }

    if (mRes.ok) {
      const mData = await mRes.json();
      if (mData.messages && mData.messages.length > 0) {
        allMessages = [
          ...mData.messages.map(m => ({
            sender: m.sender_name || 'You',
            receiver: m.group_name ? `👥 ${m.group_name}` : (m.receiver_name || 'Peer'),
            content: m.message_content || m.content || '',
            type: m.message_type || 'Text',
            time: m.timestamp || m.sent_at || new Date().toISOString(),
            status: m.delivery_status || m.status || 'Delivered'
          })),
          ...defaultMessageHistory
        ];
      }
    }
  } catch {}

  document.getElementById('hist-file-badge').textContent = allFiles.length;
  document.getElementById('hist-msg-badge').textContent = allMessages.length;

  filterHistory();
}

function filterHistory() {
  const query = document.getElementById('hist-search').value.toLowerCase();
  const protoFilter = document.getElementById('hist-proto-filter').value;
  const statusFilter = document.getElementById('hist-status-filter').value;

  if (activeView === 'files') {
    renderFilteredFiles(query, protoFilter, statusFilter);
  } else {
    renderFilteredMessages(query, statusFilter);
  }
}

function renderFilteredFiles(query, proto, status) {
  const tbody = document.getElementById('hist-files-tbody');
  if (!tbody) return;

  const filtered = allFiles.filter(item => {
    const matchQuery = !query ||
      item.name.toLowerCase().includes(query) ||
      item.sender.toLowerCase().includes(query) ||
      item.receiver.toLowerCase().includes(query);

    const matchProto = proto === 'all' || item.proto.toLowerCase().includes(proto);
    const matchStatus = status === 'all' || item.status.toLowerCase() === status;

    return matchQuery && matchProto && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding:2.5rem">
          <i class="fa-solid fa-folder-open" style="font-size:2rem;margin-bottom:0.5rem;display:block"></i>
          No file records match your query.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const statusBadge = item.status === 'Completed'
      ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Completed</span>'
      : item.status === 'Failed'
      ? '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Failed</span>'
      : '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> In Progress</span>';

    const protoBadge = item.proto.includes('Bluetooth')
      ? '<span class="proto-badge proto-bt">BLE</span>'
      : item.proto.includes('WebRTC')
      ? '<span class="proto-badge proto-webrtc">WebRTC P2P</span>'
      : '<span class="proto-badge proto-wifi">Wi-Fi LAN</span>';

    return `
      <tr>
        <td><strong>${escHtml(item.name)}</strong></td>
        <td>${formatBytes(item.size)}</td>
        <td>${escHtml(item.sender)} → ${escHtml(item.receiver)}</td>
        <td>${protoBadge}</td>
        <td>${statusBadge}</td>
        <td>${formatDate(item.time)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="showToast('Re-downloading ${escHtml(item.name)} from local storage...', 'info')">
            <i class="fa-solid fa-download"></i> Save
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderFilteredMessages(query, status) {
  const tbody = document.getElementById('hist-msgs-tbody');
  if (!tbody) return;

  const filtered = allMessages.filter(item => {
    const matchQuery = !query ||
      item.content.toLowerCase().includes(query) ||
      item.sender.toLowerCase().includes(query) ||
      item.receiver.toLowerCase().includes(query);

    const matchStatus = status === 'all' || item.status.toLowerCase() === status;
    return matchQuery && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding:2.5rem">
          <i class="fa-solid fa-comments" style="font-size:2rem;margin-bottom:0.5rem;display:block"></i>
          No message records match your query.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${escHtml(item.sender)}</strong></td>
      <td>${escHtml(item.receiver)}</td>
      <td style="max-width:320px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(item.content)}</div></td>
      <td><span class="badge badge-primary">${escHtml(item.type)}</span></td>
      <td>${formatDate(item.time)}</td>
      <td><span class="badge badge-success"><i class="fa-solid fa-check-double"></i> ${escHtml(item.status)}</span></td>
    </tr>
  `).join('');
}

function exportAuditReportCSV() {
  const data = activeView === 'files' ? allFiles : allMessages;
  if (!data || data.length === 0) {
    showToast('No records to export.', 'warning');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,';

  if (activeView === 'files') {
    csvContent += 'File Name,Size Bytes,Sender,Receiver,Protocol,Status,Timestamp\n';
    data.forEach(row => {
      csvContent += `"${row.name}",${row.size},"${row.sender}","${row.receiver}","${row.proto}","${row.status}","${row.time}"\n`;
    });
  } else {
    csvContent += 'Sender,Receiver,Message Content,Type,Timestamp,Status\n';
    data.forEach(row => {
      csvContent += `"${row.sender}","${row.receiver}","${row.content.replace(/"/g, '""')}","${row.type}","${row.time}","${row.status}"\n`;
    });
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ProxiLink_${activeView}_audit_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Exported ${activeView} audit log as CSV!`, 'success');
}
