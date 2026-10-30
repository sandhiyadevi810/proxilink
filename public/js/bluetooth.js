/**
 * ProxiLink – Web Bluetooth (BLE) Controller
 * Interacts with nearby Bluetooth Low Energy devices using the Web Bluetooth API.
 * 
 * Note: Web Bluetooth is restricted to BLE GATT Client operations in Chromium-based browsers.
 * Unrestricted Classic Bluetooth (RFCOMM/OBEX) and Wi-Fi Direct file sharing require a native Android app.
 */
'use strict';

let bluetoothDevice = null;
let gattServer = null;
let writeCharacteristic = null;
let readCharacteristic = null;

// Commonly used BLE UART Services (Nordic UART Service and HM-10 serial modules)
const BLE_SERVICES = {
  NORDIC_UART: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  NORDIC_TX:   '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  NORDIC_RX:   '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  HM10_SERVICE:'0000ffe0-0000-1000-8000-00805f9b34fb',
  HM10_CHAR:   '0000ffe1-0000-1000-8000-00805f9b34fb'
};

document.addEventListener('DOMContentLoaded', () => {
  checkBrowserSupport();
});

function checkBrowserSupport() {
  const notSupportedEl = document.getElementById('bt-not-supported');
  const supportedEl = document.getElementById('bt-supported');

  if (!navigator.bluetooth) {
    if (notSupportedEl) notSupportedEl.classList.remove('hidden');
    if (supportedEl) supportedEl.classList.add('hidden');
    return false;
  }

  if (notSupportedEl) notSupportedEl.classList.add('hidden');
  if (supportedEl) supportedEl.classList.remove('hidden');
  return true;
}

/**
 * Trigger BLE Device Discovery via browser modal.
 */
async function startScan() {
  if (!navigator.bluetooth) {
    showToast('Web Bluetooth API is not available.', 'error');
    return;
  }

  const ring = document.getElementById('bt-ring');
  const statusBadge = document.getElementById('scan-status');

  if (ring) ring.classList.add('scanning');
  if (statusBadge) {
    statusBadge.textContent = 'Scanning...';
    statusBadge.className = 'badge badge-warning';
  }

  try {
    // Request nearby Bluetooth devices with UART / Generic services
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        'generic_access',
        BLE_SERVICES.NORDIC_UART,
        BLE_SERVICES.HM10_SERVICE,
        0xFFE0
      ]
    });

    if (ring) ring.classList.remove('scanning');
    if (statusBadge) {
      statusBadge.textContent = 'Device Found';
      statusBadge.className = 'badge badge-success';
    }

    displayDiscoveredDevice(device);
  } catch (err) {
    if (ring) ring.classList.remove('scanning');
    if (statusBadge) {
      statusBadge.textContent = 'Scan Cancelled';
      statusBadge.className = 'badge badge-warning';
    }
    if (err.name !== 'NotFoundError') {
      showToast('Bluetooth scan error: ' + err.message, 'error');
    }
  }
}

/**
 * Display discovered BLE device in UI list.
 */
function displayDiscoveredDevice(device) {
  bluetoothDevice = device;
  const list = document.getElementById('device-list');
  if (!list) return;

  list.innerHTML = `
    <div class="device-card" id="dev-${device.id}">
      <div class="device-icon">📱</div>
      <div class="device-info">
        <div class="device-name">${escHtml(device.name || 'Unnamed BLE Device')}</div>
        <div class="device-meta">ID: ${device.id.slice(0, 12)}... | BLE Peripheral</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="connectBleDevice()">Connect</button>
    </div>
  `;

  device.addEventListener('gattserverdisconnected', onBleDisconnected);
}

/**
 * Connect to GATT server on selected BLE peripheral.
 */
async function connectBleDevice() {
  if (!bluetoothDevice) return;

  showToast(`Connecting to ${bluetoothDevice.name || 'BLE device'}...`, 'info');

  try {
    gattServer = await bluetoothDevice.gatt.connect();
    console.log('[BLE] GATT Server Connected.');

    // Attempt to locate UART / Serial characteristics
    await discoverBleCharacteristics();

    // Update UI
    const chatCard = document.getElementById('ble-chat-card');
    const devNameEl = document.getElementById('connected-device-name');
    if (chatCard) chatCard.classList.remove('hidden');
    if (devNameEl) devNameEl.textContent = bluetoothDevice.name || 'BLE Device';

    showToast('Bluetooth device connected successfully!', 'success');
  } catch (err) {
    console.error('[BLE] GATT connection failed:', err);
    showToast('Connection failed: ' + err.message, 'error');
  }
}

/**
 * Locate writable and readable characteristics on connected GATT server.
 */
async function discoverBleCharacteristics() {
  try {
    const services = await gattServer.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeCharacteristic = char;
        }
        if (char.properties.notify || char.properties.indicate || char.properties.read) {
          readCharacteristic = char;
          try {
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', handleBleIncomingData);
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[BLE] Could not query services, standard GATT access limited:', err);
  }
}

/**
 * Send short text message over BLE GATT write characteristic.
 */
async function bleSend() {
  const input = document.getElementById('ble-msg-input');
  const text = input.value.trim();
  if (!text) return;

  if (text.length > 200) {
    showToast('BLE text is limited to 200 characters per packet.', 'warning');
    return;
  }

  try {
    if (writeCharacteristic) {
      const encoder = new TextEncoder();
      await writeCharacteristic.writeValue(encoder.encode(text));
    }

    appendBleMessage(text, true);
    input.value = '';
    showToast('BLE message sent!', 'success');
  } catch (err) {
    console.error('[BLE] Send error:', err);
    showToast('BLE send failed: ' + err.message, 'error');
  }
}

/**
 * Handle incoming notification from BLE peripheral.
 */
function handleBleIncomingData(event) {
  const value = event.target.value;
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(value);
  appendBleMessage(text, false);
}

function appendBleMessage(text, isMe) {
  const container = document.getElementById('ble-messages');
  if (!container) return;

  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = `ble-msg ${isMe ? 'sent' : 'recv'}`;
  msgDiv.textContent = text;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Disconnect active BLE peripheral.
 */
function bleDisconnect() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
  }
}

function onBleDisconnected() {
  console.log('[BLE] Disconnected.');
  showToast('Bluetooth device disconnected.', 'warning');
  const chatCard = document.getElementById('ble-chat-card');
  if (chatCard) chatCard.classList.add('hidden');
}
