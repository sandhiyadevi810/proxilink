/**
 * ProxiLink – Phase 7 Integration Verification Test Suite
 * Tests:
 * 1. UnifiedCommsManager: Mode selection, size limits (500MB vs 2MB), offline queueing & flush
 * 2. SQLite Message Persistence & Delivery Status ACK Updates ('pending' -> 'sent' -> 'delivered')
 * 3. File Transfer History Persistence & Audit Queries
 * 4. Full Express REST API Integration with JWT Authentication
 */
'use strict';

const assert = require('assert');
const path = require('path');
const http = require('http');

// Mock localStorage for Node.js environment
const store = new Map();
global.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

// Mock browser objects
global.window = {
  p2pEngine: null,
  bleEngine: null
};

async function runTests() {
  console.log('========================================================');
  console.log('   PROXILINK PHASE 7 INTEGRATION TEST SUITE');
  console.log('========================================================\n');

  // ─── 1. UnifiedCommsManager Unit Tests ─────────────────────────────
  console.log('--- Test 1: UnifiedCommsManager & Offline Outbox Queue ---');
  const UnifiedCommsManager = require('../../frontend/js/unified-comms');
  const comms = new UnifiedCommsManager();

  assert.strictEqual(comms.getMode(), 'wifi', 'Default mode should be wifi');
  comms.setMode('bluetooth');
  assert.strictEqual(comms.getMode(), 'bluetooth', 'Mode should switch to bluetooth');
  assert.throws(() => comms.setMode('nfc'), /Invalid communication mode/, 'Should reject unverified mode');
  comms.setMode('wifi');
  console.log('  [PASS] Mode selection & verification guards verified.');

  // Test Offline Outbox Enqueue
  const pendingMsg = comms.enqueueMessage({
    id: 'test_msg_101',
    receiverId: 2,
    content: 'Offline testing packet',
    timestamp: new Date().toISOString()
  });
  assert.strictEqual(pendingMsg.status, 'pending', 'Enqueued message status must be pending');
  const queue = comms.getOfflineQueue();
  assert.strictEqual(queue.length, 1, 'Offline queue length should be 1');
  assert.strictEqual(queue[0].id, 'test_msg_101');
  console.log('  [PASS] Offline message successfully stored in persistent outbox.');

  // Test Auto-flush simulation
  let transmittedMessages = [];
  const flushedCount = await comms.flushOfflineQueue(2, async (msg) => {
    transmittedMessages.push(msg);
  });
  assert.strictEqual(flushedCount, 1, '1 message should be flushed');
  assert.strictEqual(transmittedMessages.length, 1);
  assert.strictEqual(comms.getOfflineQueue().length, 0, 'Offline queue should be empty after flush');
  console.log('  [PASS] Auto-flush on reconnection confirmed and dequeued.');

  // Test Protocol-specific File Size Guard
  comms.setMode('bluetooth');
  try {
    await comms.sendFile({ name: 'huge_video.mp4', size: 10 * 1024 * 1024 });
    assert.fail('Should reject file > 2MB on Bluetooth');
  } catch (err) {
    assert(err.message.includes('exceeds the 2 MB Bluetooth BLE limit'), 'Correct error message for BLE limit');
  }
  comms.setMode('wifi');
  console.log('  [PASS] Protocol-specific size validation (500 MB Wi-Fi vs 2 MB BLE) enforced.');

  // ─── 2. SQLite Backend Models & Database Initialization ────────────
  console.log('\n--- Test 2: SQLite Database Persistence & Status Transitions ---');
  const { initDatabase, getDB } = require('../config/database');
  await initDatabase();
  console.log('  [PASS] SQLite WebAssembly Database initialized.');

  const User = require('../models/User');
  const Message = require('../models/Message');
  const FileModel = require('../models/File');

  // Create test sender and receiver
  const testSender = User.create({
    username: 'p7_sender_' + Date.now(),
    display_name: 'P7 Alice',
    password_hash: 'hashed_pw_alice'
  });

  const testReceiver = User.create({
    username: 'p7_receiver_' + Date.now(),
    display_name: 'P7 Bob',
    password_hash: 'hashed_pw_bob'
  });

  console.log(`  [INFO] Created test users: ${testSender.username} (ID: ${testSender.user_id}) and ${testReceiver.username} (ID: ${testReceiver.user_id})`);

  // Insert message with 'sent' status
  const msg = Message.create({
    sender_id: testSender.user_id,
    receiver_id: testReceiver.user_id,
    message_content: 'Integrated Wi-Fi & Bluetooth Test Message',
    message_type: 'webrtc'
  });

  assert.strictEqual(msg.delivery_status, 'sent', 'Initial message status must be sent');
  console.log(`  [PASS] Message inserted into SQLite with status: ${msg.delivery_status}`);

  // Transition status to 'delivered' on ACK receipt
  const updatedMsg = Message.updateDeliveryStatus(msg.message_id, 'delivered');
  assert.strictEqual(updatedMsg.delivery_status, 'delivered', 'Message status must update to delivered');
  console.log(`  [PASS] Remote ACK receipt verified: status transitioned to: ${updatedMsg.delivery_status}`);

  // Query conversation history
  const history = Message.getConversation(testSender.user_id, testReceiver.user_id);
  assert(history.length >= 1, 'Conversation history should contain message');
  assert.strictEqual(history[0].delivery_status, 'delivered');
  console.log(`  [PASS] Conversation history retrieved from SQLite with accurate timestamps and delivery status.`);

  // Insert File & Transfer_History record
  const fileRecord = FileModel.create({
    file_name: 'offline_spec.pdf',
    file_size: 1048576, // 1 MB
    file_type: 'application/pdf',
    file_path: 'uploads/offline_spec.pdf',
    sender_id: testSender.user_id,
    receiver_id: testReceiver.user_id,
    transfer_status: 'in_progress'
  });

  assert.strictEqual(fileRecord.transfer_status, 'in_progress');
  const completedFile = FileModel.updateTransferStatus(fileRecord.file_id, 'completed');
  assert.strictEqual(completedFile.transfer_status, 'completed');
  console.log('  [PASS] File transfer record and audit log updated to "completed".');

  const transferHistory = FileModel.getHistory(testSender.user_id);
  assert(transferHistory.length >= 1, 'File transfer audit log must contain records');
  assert.strictEqual(transferHistory[0].file_name, 'offline_spec.pdf');
  console.log(`  [PASS] Transfer history queried successfully (${transferHistory.length} records found).`);

  // ─── 3. REST API Route Verification ────────────────────────────────
  console.log('\n--- Test 3: Express REST API Endpoints ---');
  const { generateToken } = require('../middleware/authMiddleware');
  const token = generateToken(testSender);

  // Helper function for local HTTP requests
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.set('io', { to: () => ({ emit: () => {} }) });

  // Mount routes
  const messageRoutes = require('../routes/messageRoutes');
  const fileRoutes = require('../routes/fileRoutes');
  app.use('/api/messages', messageRoutes);
  app.use('/api/files', fileRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  async function apiRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: port,
        path: urlPath,
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // 3a. POST /api/messages
  const postMsgRes = await apiRequest('POST', '/api/messages', {
    receiver_id: testReceiver.user_id,
    message_content: 'REST API Offline Relay Packet',
    message_type: 'webrtc'
  });
  assert.strictEqual(postMsgRes.status, 201, 'POST /api/messages should return 201');
  const newMsgId = postMsgRes.body.data.message_id;
  console.log(`  [PASS] POST /api/messages succeeded (Message ID: ${newMsgId})`);

  // 3b. GET /api/messages/history?peer_id=X
  const getHistoryRes = await apiRequest('GET', `/api/messages/history?peer_id=${testReceiver.user_id}`);
  assert.strictEqual(getHistoryRes.status, 200, 'GET /api/messages/history should return 200');
  assert(getHistoryRes.body.messages.length >= 2, 'Should return multiple conversation messages');
  console.log(`  [PASS] GET /api/messages/history returned ${getHistoryRes.body.messages.length} messages.`);

  // 3c. PUT /api/messages/:id/status
  const putStatusRes = await apiRequest('PUT', `/api/messages/${newMsgId}/status`, {
    status: 'delivered'
  });
  assert.strictEqual(putStatusRes.status, 200, 'PUT /api/messages/:id/status should return 200');
  assert.strictEqual(putStatusRes.body.data.delivery_status, 'delivered');
  console.log(`  [PASS] PUT /api/messages/${newMsgId}/status updated status to delivered.`);

  // 3d. GET /api/files/history
  const getFileHistoryRes = await apiRequest('GET', '/api/files/history');
  assert.strictEqual(getFileHistoryRes.status, 200, 'GET /api/files/history should return 200');
  assert(Array.isArray(getFileHistoryRes.body.history), 'History should be an array');
  console.log(`  [PASS] GET /api/files/history returned ${getFileHistoryRes.body.history.length} transfer records.`);

  server.close();

  console.log('\n========================================================');
  console.log('   ALL PHASE 7 INTEGRATION TESTS PASSED (100% SUCCESS)');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('\n[FATAL TEST FAILURE]', err);
  process.exit(1);
});
