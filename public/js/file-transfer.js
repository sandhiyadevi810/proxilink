/**
 * ProxiLink – File Transfer Module
 * Supports high-speed P2P chunked transfer (WebRTC) with buffered flow control
 * and seamless HTTP fallback with upload progress tracking.
 */
'use strict';

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for optimal WebRTC throughput
const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1 MB buffer limit before throttling

// Receiver state
let incomingTransfer = {
  active: false,
  fileName: '',
  fileSize: 0,
  fileType: '',
  receivedBytes: 0,
  chunks: []
};

// Sender state
let activeSendJob = {
  active: false,
  cancelled: false
};

/**
 * Main file send dispatcher: checks if WebRTC P2P is ready, otherwise falls back to LAN HTTP.
 * @param {File} file 
 * @param {number} recipientId 
 */
async function sendFile(file, recipientId) {
  if (!file) return;

  if (file.size > 500 * 1024 * 1024) {
    showToast('File exceeds 500 MB limit.', 'error');
    return;
  }

  if (isP2PReady()) {
    console.log('[FileTransfer] Starting P2P transfer over DataChannel.');
    await sendFileViaP2P(file, recipientId);
  } else {
    console.log('[FileTransfer] P2P not open. Falling back to HTTP/LAN upload.');
    await sendFileViaHTTP(file, recipientId);
  }
}

/**
 * Send file chunked over WebRTC DataChannel with bufferedAmount flow control.
 */
async function sendFileViaP2P(file, recipientId) {
  activeSendJob = { active: true, cancelled: false };
  showTransferUI(file.name, file.size);

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Send header
  const header = {
    type: 'file_header',
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || 'application/octet-stream',
    totalChunks
  };
  sendViaP2P(JSON.stringify(header));

  let offset = 0;
  let chunkIndex = 0;

  while (offset < file.size) {
    if (activeSendJob.cancelled) {
      showToast('File transfer cancelled.', 'warning');
      hideTransferUI();
      return;
    }

    // Flow control: pause if data channel buffer is full
    if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      await waitForBufferDrain();
    }

    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();

    try {
      sendViaP2P(buffer);
    } catch (err) {
      console.error('[FileTransfer] P2P send error:', err);
      showToast('P2P file transfer interrupted.', 'error');
      hideTransferUI();
      return;
    }

    offset += buffer.byteLength;
    chunkIndex++;

    updateTransferProgress(offset, file.size);
  }

  hideTransferUI();
  showToast(`File "${file.name}" sent via P2P!`, 'success');

  // Add bubble to local chat UI
  if (typeof appendLocalFileMessage === 'function') {
    appendLocalFileMessage(file.name, file.size, 'p2p');
  }
}

/**
 * Wait for RTCDataChannel buffered amount to drop below threshold.
 */
function waitForBufferDrain() {
  return new Promise((resolve) => {
    if (!dataChannel) return resolve();
    const checkInterval = setInterval(() => {
      if (!dataChannel || dataChannel.bufferedAmount <= CHUNK_SIZE * 2) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 25);
  });
}

/**
 * Receive file header from peer over DataChannel.
 */
function handleFileHeader(header) {
  incomingTransfer = {
    active: true,
    fileName: header.fileName,
    fileSize: header.fileSize,
    fileType: header.fileType,
    receivedBytes: 0,
    chunks: []
  };

  showTransferUI(`Receiving: ${header.fileName}`, header.fileSize);
  showToast(`Incoming file: ${header.fileName} (${formatBytes(header.fileSize)})`, 'info');
}

/**
 * Handle incoming binary chunk from DataChannel.
 */
function handleReceivedFileChunk(chunkBuffer) {
  if (!incomingTransfer.active) return;

  incomingTransfer.chunks.push(chunkBuffer);
  incomingTransfer.receivedBytes += chunkBuffer.byteLength;

  updateTransferProgress(incomingTransfer.receivedBytes, incomingTransfer.fileSize);

  if (incomingTransfer.receivedBytes >= incomingTransfer.fileSize) {
    finalizeIncomingFile();
  }
}

/**
 * Reassemble file chunks into Blob, create object URL, and trigger download.
 */
function finalizeIncomingFile() {
  hideTransferUI();

  const blob = new Blob(incomingTransfer.chunks, { type: incomingTransfer.fileType });
  const objectUrl = URL.createObjectURL(blob);

  showToast(`Received "${incomingTransfer.fileName}"!`, 'success');

  // Trigger automatic download
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = incomingTransfer.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Append download link to chat
  if (typeof appendReceivedFileMessage === 'function') {
    appendReceivedFileMessage(incomingTransfer.fileName, incomingTransfer.fileSize, objectUrl);
  }

  incomingTransfer = { active: false, fileName: '', fileSize: 0, fileType: '', receivedBytes: 0, chunks: [] };
}

/**
 * Fallback: Upload file over HTTP to local Node.js server.
 */
function sendFileViaHTTP(file, recipientId) {
  return new Promise((resolve, reject) => {
    showTransferUI(file.name, file.size);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('recipient_id', recipientId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload', true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        updateTransferProgress(e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      hideTransferUI();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          showToast(`File "${file.name}" uploaded!`, 'success');

          // Send message notification with download link over socket
          if (socket) {
            socket.emit('relay-message', {
              to: recipientId,
              content: JSON.stringify({
                fileName: file.name,
                fileSize: file.size,
                fileId: res.file_id,
                downloadUrl: `/api/files/${res.file_id}/download`
              }),
              message_type: 'file'
            });
          }

          if (typeof appendLocalFileMessage === 'function') {
            appendLocalFileMessage(file.name, file.size, `/api/files/${res.file_id}/download`);
          }
          resolve(res);
        } catch (err) {
          reject(err);
        }
      } else {
        showToast('Upload failed: ' + xhr.statusText, 'error');
        reject(new Error(xhr.statusText));
      }
    };

    xhr.onerror = () => {
      hideTransferUI();
      showToast('Network error during file upload.', 'error');
      reject(new Error('Network error'));
    };

    xhr.send(formData);
  });
}

/**
 * UI: Show transfer progress bar card.
 */
function showTransferUI(name, totalSize) {
  const overlay = document.getElementById('transfer-overlay');
  const nameEl = document.getElementById('tf-filename');
  const bar = document.getElementById('tf-bar');
  const pct = document.getElementById('tf-pct');
  const bytes = document.getElementById('tf-bytes');

  if (overlay) overlay.classList.remove('hidden');
  if (nameEl) nameEl.textContent = name;
  if (bar) bar.style.width = '0%';
  if (pct) pct.textContent = '0%';
  if (bytes) bytes.textContent = `0 / ${formatBytes(totalSize)}`;
}

/**
 * UI: Update progress bar percentage and byte counts.
 */
function updateTransferProgress(current, total) {
  const bar = document.getElementById('tf-bar');
  const pct = document.getElementById('tf-pct');
  const bytes = document.getElementById('tf-bytes');

  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  if (bar) bar.style.width = percent + '%';
  if (pct) pct.textContent = percent + '%';
  if (bytes) bytes.textContent = `${formatBytes(current)} / ${formatBytes(total)}`;
}

/**
 * UI: Hide transfer progress bar card.
 */
function hideTransferUI() {
  const overlay = document.getElementById('transfer-overlay');
  if (overlay) overlay.classList.add('hidden');
}

/**
 * Cancel currently active outbound transfer.
 */
function cancelTransfer() {
  activeSendJob.cancelled = true;
  hideTransferUI();
}
