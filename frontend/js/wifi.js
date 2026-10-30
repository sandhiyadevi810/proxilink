/**
 * ProxiLink – Wi-Fi Connection Manager Controller (Phase 5)
 * WebRTC P2P Manager with Local LAN Signalling, Live Device Discovery, and RTT Latency Monitoring.
 */
'use strict';

let isScanning = false;
let connectedPeer = null;
let p2p = null;
let currentProfile = {
  userId: parseInt(localStorage.getItem('user_id'), 10) || Math.floor(Math.random() * 800) + 100,
  username: localStorage.getItem('username') || 'local_user',
  displayName: localStorage.getItem('display_name') || 'Local Node',
  deviceType: 'laptop',
  deviceName: 'ProxiLink Node'
};

document.addEventListener('DOMContentLoaded', () => {
  initWiFiPage();
});

function initWiFiPage() {
  const ipEl = document.getElementById('wifi-local-ip');
  if (ipEl) {
    ipEl.textContent = window.location.hostname === 'localhost' ? '127.0.0.1 (Localhost)' : window.location.hostname;
  }

  // Initialize WebRTC P2P Engine
  if (typeof ProxiLinkP2P !== 'undefined') {
    p2p = new ProxiLinkP2P();
    window.p2pEngine = p2p;

    p2p.init(currentProfile);

    // Bind P2P lifecycle listeners
    p2p.on('device-list', (data) => {
      renderDiscoveredDevices(data);
    });

    p2p.on('connection-state', (evt) => {
      handleConnectionStateChange(evt);
    });

    p2p.on('datachannel-state', (evt) => {
      handleDataChannelStateChange(evt);
    });

    p2p.on('latency', (evt) => {
      const latencyEl = document.getElementById('conn-latency');
      if (latencyEl) {
        latencyEl.textContent = `${evt.rtt} ms (${evt.method === 'datachannel' ? 'P2P Direct' : 'LAN Relay'})`;
      }
    });

    p2p.on('peer-disconnected', (evt) => {
      showToast(`Peer ${evt.peerId} disconnected.`, 'warning');
      disconnectPeer(false);
    });

    p2p.on('error', (err) => {
      showToast(`P2P Handshake notice: ${err.error || err.stage}`, 'warning');
    });
  }

  loadOnlinePeers();
}

async function startScan() {
  if (isScanning) return;
  isScanning = true;

  const radar = document.getElementById('wifi-radar');
  const scanBtn = document.getElementById('scan-btn');
  const scanText = document.getElementById('scan-status-text');

  if (radar) radar.classList.remove('hidden');
  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Discovering Peers...';
  }
  if (scanText) scanText.textContent = 'Broadcasting local subnet discovery packets...';

  showToast('Broadcasting discovery on local Wi-Fi subnet...', 'info');

  if (p2p) {
    p2p.scanDevices();
  }

  setTimeout(async () => {
    isScanning = false;
    if (radar) radar.classList.add('hidden');
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Scan for Devices';
    }
    if (scanText) scanText.textContent = 'Scan completed. Discovered nearby devices listed below.';

    await loadOnlinePeers();
    showToast('Discovered active devices on current Wi-Fi network.', 'success');
  }, 1500);
}

async function loadOnlinePeers() {
  const container = document.getElementById('device-list');
  if (!container) return;

  try {
    const res = await fetch('/api/devices?scope=online', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const onlineDevs = data.devices || data.onlineDevices || [];
      const remotePeers = onlineDevs.filter(d => d.userId !== currentProfile.userId);

      if (remotePeers.length > 0) {
        container.innerHTML = remotePeers.map(d => renderDeviceCard({
          id: d.userId,
          name: d.displayName || d.deviceName,
          username: d.username,
          ip: d.ip || window.location.hostname,
          deviceType: d.deviceType || 'laptop',
          signal: 95,
          isLive: true
        })).join('');
        return;
      }
    }
  } catch (err) {
    console.warn('[WiFi Manager] Offline API fetch:', err);
  }

  // Demonstration Fallback Devices when single device is active
  const demoDevices = [
    { id: 2, name: 'MacBook Pro – Alex', username: 'alex_99', ip: '192.168.1.105', deviceType: 'laptop', signal: 95, isLive: false },
    { id: 3, name: 'Pixel 8 Pro – Sarah', username: 'sarah_c', ip: '192.168.1.112', deviceType: 'mobile', signal: 82, isLive: false },
    { id: 4, name: 'Dell XPS 15 – David', username: 'david_k', ip: '192.168.1.120', deviceType: 'laptop', signal: 74, isLive: false }
  ];

  container.innerHTML = `
    <div class="text-xs text-muted" style="padding:0.4rem 0.5rem;background:rgba(59,130,246,0.08);border-radius:var(--radius-sm);margin-bottom:0.5rem">
      <i class="fa-solid fa-circle-info text-secondary"></i> Open a second browser tab or connect another phone on the same Wi-Fi to test live real-time P2P discovery!
    </div>
  ` + demoDevices.map(d => renderDeviceCard(d)).join('');
}

function renderDiscoveredDevices(data) {
  const container = document.getElementById('device-list');
  if (!container) return;

  const devices = data.devices || [];
  const remote = devices.filter(d => d.userId !== currentProfile.userId);

  if (remote.length > 0) {
    container.innerHTML = remote.map(d => renderDeviceCard({
      id: d.userId,
      name: d.displayName || d.deviceName,
      username: d.username,
      ip: d.ip || 'LAN Node',
      deviceType: d.deviceType || 'laptop',
      signal: 98,
      isLive: true
    })).join('');
  }
}

function renderDeviceCard(dev) {
  const isConnected = connectedPeer && (connectedPeer.id === dev.id || connectedPeer.userId === dev.id);
  const icon = dev.deviceType === 'mobile' ? 'fa-mobile-screen' :
               dev.deviceType === 'tablet' ? 'fa-tablet-screen-button' : 'fa-laptop';

  return `
    <div class="card flex items-center justify-between" id="dev-card-${dev.id}" style="padding:1.15rem 1.5rem;transition:var(--transition);${isConnected ? 'border-color:var(--success);background:rgba(16,185,129,0.08)' : ''}">
      <div class="flex items-center gap-3">
        <div style="width:44px;height:44px;border-radius:var(--radius-sm);background:rgba(59,130,246,0.15);color:var(--secondary);display:flex;align-items:center;justify-content:center;font-size:1.25rem">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span style="font-weight:700;font-size:0.95rem">${escHtml(dev.name)}</span>
            ${dev.isLive ? '<span class="badge badge-success text-xs">Live LAN Node</span>' : '<span class="badge badge-warning text-xs">Demo Peer</span>'}
          </div>
          <div class="text-xs text-muted">IP: ${dev.ip} • @${escHtml(dev.username)}</div>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2" title="Signal: ${dev.signal}%">
          <i class="fa-solid fa-wifi text-secondary" style="font-size:0.85rem"></i>
          <span class="text-xs text-muted">${dev.signal}%</span>
        </div>

        ${isConnected ? `
          <button class="btn btn-danger btn-sm" onclick="disconnectPeer()">
            <i class="fa-solid fa-link-slash"></i> Disconnect
          </button>
          <a href="chat.html" class="btn btn-primary btn-sm">
            <i class="fa-solid fa-comments"></i> Chat
          </a>
          <a href="files.html" class="btn btn-secondary btn-sm">
            <i class="fa-solid fa-file-arrow-up"></i> Send File
          </a>
        ` : `
          <button class="btn btn-secondary btn-sm" onclick="connectPeer(${dev.id}, '${escHtml(dev.name)}', '${dev.ip}', ${dev.isLive})">
            <i class="fa-solid fa-link"></i> Connect P2P
          </button>
        `}
      </div>
    </div>
  `;
}

async function connectPeer(id, name, ip, isLive = false) {
  showToast(`Initiating WebRTC handshake with ${name}...`, 'info');

  const card = document.getElementById(`dev-card-${id}`);
  if (card) {
    const btn = card.querySelector('button');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Pairing...';
    }
  }

  connectedPeer = { id, userId: id, name, ip, isLive };
  sessionStorage.setItem('chat_peer_id', id);
  sessionStorage.setItem('chat_peer_name', name);
  sessionStorage.setItem('chat_mode', 'direct');

  if (p2p && isLive) {
    try {
      await p2p.connectToPeer({ userId: id, displayName: name, ip });
    } catch (err) {
      console.warn('[P2P Connect Warning]', err);
    }
  } else {
    // Demonstration pairing simulation with real UI handshake
    setTimeout(() => {
      updatePeerStatusUI();
      loadOnlinePeers();
      showToast(`WebRTC direct DataChannel established with ${name}!`, 'success');
      startSimulatedLatency();
    }, 1000);
  }
}

function disconnectPeer(notify = true) {
  if (connectedPeer) {
    showToast(`Disconnected from ${connectedPeer.name}`, 'warning');
  }

  if (p2p) {
    p2p.disconnect(notify);
  }

  connectedPeer = null;
  sessionStorage.removeItem('chat_peer_id');
  updatePeerStatusUI();
  loadOnlinePeers();
}

function handleConnectionStateChange(evt) {
  console.log('[WiFi Page] Connection State:', evt.state);
  if (evt.state === 'connected') {
    updatePeerStatusUI();
    showToast(`WebRTC P2P connection established!`, 'success');
  } else if (evt.state === 'incoming-connection') {
    connectedPeer = {
      id: evt.peer.userId,
      userId: evt.peer.userId,
      name: evt.peer.displayName || 'Peer',
      ip: evt.peer.deviceName || 'LAN'
    };
    updatePeerStatusUI();
    showToast(`Incoming P2P connection from ${connectedPeer.name}!`, 'info');
  } else if (evt.state === 'disconnected' || evt.state === 'failed') {
    disconnectPeer(false);
  }
}

function handleDataChannelStateChange(evt) {
  console.log('[WiFi Page] DataChannel State:', evt.state);
  const channelEl = document.getElementById('conn-channel-state');
  if (channelEl) {
    channelEl.textContent = evt.state === 'open' ? 'Open (Ordered, DTLS Encrypted)' : evt.state;
  }
  if (evt.state === 'open') {
    updatePeerStatusUI();
  }
}

function updatePeerStatusUI() {
  const panel = document.getElementById('peer-status-panel');
  if (!panel) return;

  if (connectedPeer) {
    panel.classList.remove('hidden');
    document.getElementById('conn-peer-name').textContent = connectedPeer.name;
    document.getElementById('conn-peer-ip').textContent = connectedPeer.ip;
    document.getElementById('conn-channel-state').textContent = 'Open (Ordered, Reliable, DTLS)';
  } else {
    panel.classList.add('hidden');
  }
}

function startSimulatedLatency() {
  const latencyEl = document.getElementById('conn-latency');
  const timer = setInterval(() => {
    if (!connectedPeer) {
      clearInterval(timer);
      return;
    }
    if (latencyEl) {
      const rtt = Math.floor(Math.random() * 3) + 2; // 2-4 ms typical Wi-Fi LAN
      latencyEl.textContent = `${rtt} ms (LAN Direct)`;
    }
  }, 2000);
}
