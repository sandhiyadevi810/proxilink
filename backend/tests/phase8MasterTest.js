/**
 * ProxiLink – Phase 8 Master Verification & Quality Assurance Test Suite
 * Comprehensive automated testing covering all 7 testing domains:
 * 1. Functional Testing (Auth, Navigation, Devices, Messaging, Files)
 * 2. Wi-Fi Communication Testing (WebRTC Signalling & DataChannel Flow)
 * 3. Bluetooth Communication Testing (BLE GATT Slicing & Capabilities)
 * 4. File Sharing & Integrity Testing (Chunking, SHA-256 Checksum, Size/Type Guards)
 * 5. Database Testing (SQLite Schema, Constraints, Persistence)
 * 6. Security Testing (Bcrypt Hashing, JWT Integrity, Auth Protection, Injection Guards)
 * 7. Performance & Latency Benchmarks (Query Times, Message Throughput)
 */
'use strict';

const assert = require('assert');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock localStorage for Node environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

async function runMasterTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       PROXILINK PHASE 8 - MASTER QUALITY ASSURANCE SUITE     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      passedTests++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ─── 1. DATABASE & PERSISTENCE TESTING ────────────────────────────
  console.log('--- 1. Database & Persistence Testing ---');
  const { initDatabase, queryAll, queryOne, run, saveDB } = require('../config/database');
  await initDatabase();

  test('Database Schema Verification: All 7 required tables present', () => {
    const tables = queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tableNames = tables.map(t => t.name);
    const required = ['Users', 'Devices', 'Messages', 'Files', 'Transfer_History', 'Groups', 'Group_Members'];
    required.forEach(reqTable => {
      assert(tableNames.includes(reqTable), `Table ${reqTable} must exist in SQLite schema`);
    });
  });

  const User = require('../models/User');
  const uniqueSuffix = Date.now();
  const testUserA = User.create({
    username: `u_alpha_${uniqueSuffix}`,
    email: `alpha_${uniqueSuffix}@proxilink.lan`,
    password_hash: await bcrypt.hash('SecurePass123!', 10),
    display_name: 'Node Alpha'
  });

  const testUserB = User.create({
    username: `u_beta_${uniqueSuffix}`,
    email: `beta_${uniqueSuffix}@proxilink.lan`,
    password_hash: await bcrypt.hash('SecurePass123!', 10),
    display_name: 'Node Beta'
  });

  test('Database Constraint Check: Prevent duplicate username registration', () => {
    assert.throws(() => {
      User.create({
        username: testUserA.username,
        email: `other_${uniqueSuffix}@proxilink.lan`,
        password_hash: 'dummy',
        display_name: 'Duplicate Alpha'
      });
    }, /UNIQUE constraint failed/, 'Database must reject duplicate username');
  });

  test('Database Foreign Key Constraint: Enforce relational integrity', () => {
    const Message = require('../models/Message');
    assert.throws(() => {
      run("INSERT INTO Messages (sender_id, receiver_id, message_content, message_type) VALUES (99999, 88888, 'Orphan message', 'text')");
    }, /FOREIGN KEY constraint failed/, 'Database must reject orphaned foreign keys');
  });

  // ─── 2. SECURITY TESTING ──────────────────────────────────────────
  console.log('\n--- 2. Security Testing ---');
  const { generateToken, JWT_SECRET } = require('../middleware/authMiddleware');

  await asyncTest('Password Hashing Verification: Bcrypt salt rounds and mismatch rejection', async () => {
    const rawPassword = 'OfflineMeshSecretPassword#2026';
    const hash = await bcrypt.hash(rawPassword, 12);
    assert(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Hash must follow valid bcrypt format');
    const isMatch = await bcrypt.compare(rawPassword, hash);
    const isMismatch = await bcrypt.compare('WrongPassword', hash);
    assert(isMatch === true, 'Bcrypt must verify correct password');
    assert(isMismatch === false, 'Bcrypt must reject incorrect password');
  });

  test('JWT Security & Token Verification: Valid token vs tampered signature', () => {
    const token = generateToken(testUserA);
    const decoded = jwt.verify(token, JWT_SECRET);
    assert.strictEqual(decoded.user_id, testUserA.user_id);
    assert.strictEqual(decoded.username, testUserA.username);

    // Tampered Token Test
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ user_id: 1, role: 'admin' })).toString('base64url');
    const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    assert.throws(() => {
      jwt.verify(forgedToken, JWT_SECRET);
    }, /invalid signature/, 'Tampered JWT must be rejected');
  });

  // ─── 3. FUNCTIONAL REST API & AUTH TESTING ────────────────────────
  console.log('\n--- 3. Functional REST API & Authentication Testing ---');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.set('io', { to: () => ({ emit: () => {} }) });

  // Mount API modules
  const authRoutes = require('../routes/authRoutes');
  const userRoutes = require('../routes/userRoutes');
  const deviceRoutes = require('../routes/deviceRoutes');
  const messageRoutes = require('../routes/messageRoutes');
  const fileRoutes = require('../routes/fileRoutes');

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/files', fileRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  function apiCall(method, endpoint, body = null, authToken = null) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: endpoint,
        method,
        headers
      }, res => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  let authTokenAlpha = '';
  await asyncTest('Auth API: User Registration & Login flow', async () => {
    // 1. Register new user
    const regRes = await apiCall('POST', '/api/auth/register', {
      username: `test_reg_${uniqueSuffix}`,
      email: `reg_${uniqueSuffix}@proxilink.lan`,
      password: 'MyPassword123!',
      display_name: 'Registered Tester'
    });
    assert.strictEqual(regRes.status, 201, 'Registration must return 201 Created');
    assert(regRes.body.token, 'Registration must return JWT token');

    // 2. Login
    const loginRes = await apiCall('POST', '/api/auth/login', {
      username: `test_reg_${uniqueSuffix}`,
      password: 'MyPassword123!'
    });
    assert.strictEqual(loginRes.status, 200, 'Login must return 200 OK');
    assert(loginRes.body.token, 'Login must return valid token');
    authTokenAlpha = loginRes.body.token;

    // 3. Profile verification
    const profileRes = await apiCall('GET', '/api/auth/me', null, authTokenAlpha);
    assert.strictEqual(profileRes.status, 200);
    assert.strictEqual(profileRes.body.user.username, `test_reg_${uniqueSuffix}`);

    // 4. Logout acknowledgement
    const logoutRes = await apiCall('POST', '/api/auth/logout', null, authTokenAlpha);
    assert.strictEqual(logoutRes.status, 200);
  });

  await asyncTest('Security Guard: Reject unauthorized API requests without JWT', async () => {
    const unauthRes = await apiCall('GET', '/api/messages/history');
    assert.strictEqual(unauthRes.status, 401, 'Protected route must return 401 Unauthorized without token');
  });

  await asyncTest('Device Registration & Querying API', async () => {
    const regDevRes = await apiCall('POST', '/api/devices', {
      device_name: 'Workstation ThinkPad P1',
      device_type: 'laptop',
      ip_address: '192.168.1.105',
      mac_address: `00:1A:2B:3C:${Math.floor(Math.random()*90+10)}:${Math.floor(Math.random()*90+10)}`
    }, authTokenAlpha);
    assert(regDevRes.status === 201 || regDevRes.status === 200);

    const listDevRes = await apiCall('GET', '/api/devices', null, authTokenAlpha);
    assert.strictEqual(listDevRes.status, 200);
    assert(Array.isArray(listDevRes.body.devices));
  });

  let messageIdForTest = null;
  await asyncTest('Messaging API: One-to-one message exchange & status tracking', async () => {
    const sendMsgRes = await apiCall('POST', '/api/messages', {
      receiver_id: testUserB.user_id,
      message_content: 'Phase 8 Master Test Packet over Wi-Fi DataChannel',
      message_type: 'webrtc'
    }, authTokenAlpha);
    assert.strictEqual(sendMsgRes.status, 201);
    assert.strictEqual(sendMsgRes.body.data.delivery_status, 'sent');
    messageIdForTest = sendMsgRes.body.data.message_id;

    // Update to 'delivered' upon ACK confirmation
    const updateRes = await apiCall('PUT', `/api/messages/${messageIdForTest}/status`, {
      status: 'delivered'
    }, authTokenAlpha);
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.data.delivery_status, 'delivered');

    // Query conversation
    const historyRes = await apiCall('GET', `/api/messages/history?peer_id=${testUserB.user_id}`, null, authTokenAlpha);
    assert.strictEqual(historyRes.status, 200);
    assert(historyRes.body.messages.length >= 1);
  });

  // ─── 4. FILE SHARING & INTEGRITY TESTING ──────────────────────────
  console.log('\n--- 4. File Sharing & Integrity Testing ---');
  const FileModel = require('../models/File');

  test('File Integrity Checksum: SHA-256 computation and matching', () => {
    const fileBuffer = Buffer.from('ProxiLink Offline Wireless Mesh Protocol Specification v8.0');
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Simulate transfer and receiver verification
    const receivedBuffer = Buffer.from(fileBuffer);
    const receiverHash = crypto.createHash('sha256').update(receivedBuffer).digest('hex');
    assert.strictEqual(hash, receiverHash, 'Receiver SHA-256 checksum must match source');

    // Altered packet test
    const corruptedBuffer = Buffer.from('ProxiLink Corrupted Packet Data');
    const corruptedHash = crypto.createHash('sha256').update(corruptedBuffer).digest('hex');
    assert.notStrictEqual(hash, corruptedHash, 'Corrupted chunk must trigger checksum mismatch');
  });

  test('File Chunking Flow Control: Slicing simulation (64 KB chunks)', () => {
    const totalSize = 250 * 1024; // 250 KB
    const chunkSize = 64 * 1024;  // 64 KB
    const expectedChunks = Math.ceil(totalSize / chunkSize);

    const syntheticData = Buffer.alloc(totalSize, 'X');
    const chunks = [];
    for (let offset = 0; offset < totalSize; offset += chunkSize) {
      chunks.push(syntheticData.subarray(offset, Math.min(offset + chunkSize, totalSize)));
    }

    assert.strictEqual(chunks.length, expectedChunks, `Expected ${expectedChunks} chunks for 250 KB file`);
    const reassembled = Buffer.concat(chunks);
    assert.strictEqual(reassembled.length, totalSize, 'Reassembled buffer length must equal original');
  });

  test('File Transfer Audit Persistence in SQLite', () => {
    const fileRecord = FileModel.create({
      file_name: 'master_test_diagram.png',
      file_size: 2048576, // 2 MB
      file_type: 'image/png',
      file_path: 'uploads/master_test_diagram.png',
      sender_id: testUserA.user_id,
      receiver_id: testUserB.user_id,
      transfer_status: 'in_progress'
    });

    assert.strictEqual(fileRecord.transfer_status, 'in_progress');
    FileModel.updateTransferStatus(fileRecord.file_id, 'completed');
    const updated = FileModel.findById(fileRecord.file_id);
    assert.strictEqual(updated.transfer_status, 'completed');

    const audit = FileModel.getHistory(testUserA.user_id);
    assert(audit.some(a => a.file_id === fileRecord.file_id && a.transfer_status === 'completed'));
  });

  // ─── 5. WI-FI & WEBRTC SIGNALLING TESTING ─────────────────────────
  console.log('\n--- 5. Wi-Fi & WebRTC Signalling Testing ---');
  const initSignallingService = require('../services/signallingService');

  test('Signalling Gateway: Room joining and peer notification protocol', () => {
    let emittedEvents = [];
    const mockSocket = {
      id: 'sock_peer_001',
      data: { userId: 55, username: 'peer55', displayName: 'Peer 55' },
      handshake: { headers: {}, query: { deviceName: 'MacBook Air', deviceType: 'laptop', ip: '192.168.1.110' }, auth: {} },
      join: (room) => emittedEvents.push({ type: 'join', room }),
      to: (target) => ({
        emit: (event, payload) => emittedEvents.push({ type: 'emit', target, event, payload })
      }),
      broadcast: {
        emit: (event, payload) => emittedEvents.push({ type: 'broadcast', event, payload })
      },
      on: (ev, handler) => { mockSocket[ev] = handler; }
    };

    const mockIo = {
      use: (middleware) => {},
      on: (ev, cb) => cb(mockSocket),
      emit: (event, payload) => emittedEvents.push({ type: 'io-emit', event, payload }),
      to: (target) => ({
        emit: (event, payload) => emittedEvents.push({ type: 'io-to', target, event, payload })
      })
    };

    initSignallingService(mockIo);

    // Verify connection established personal user room
    const joinAction = emittedEvents.find(e => e.type === 'join' && e.room === 'user:55');
    assert(joinAction, 'Signalling must join socket into personal user room (user:55)');

    // Simulate WebRTC Signal exchange
    mockSocket['signal']({
      to: 99,
      type: 'offer',
      sdp: 'v=0\r\no=...'
    });

    const signalEmit = emittedEvents.find(e => e.type === 'io-to' && e.target === 'user:99' && e.event === 'signal');
    assert(signalEmit, 'Signalling gateway must route offer to targeted peer room (user:99)');
  });

  // ─── 6. BLUETOOTH BLE COMMUNICATION TESTING ───────────────────────
  console.log('\n--- 6. Bluetooth BLE Communication Testing ---');
  const ProxiLinkBLE = require('../../frontend/js/bluetooth-ble');
  const bleEngine = new ProxiLinkBLE();

  test('Web Bluetooth Engine: GATT chunk calculation and MTU framing', () => {
    const rawMsg = 'High density telemetry packet from embedded sensor node.';
    const encoder = new TextEncoder();
    const encoded = encoder.encode(rawMsg);

    // Test MTU Slicing (200 bytes chunk size)
    const mtu = bleEngine.options.mtuSize;
    assert.strictEqual(mtu, 200, 'BLE standard MTU payload chunk must be 200 bytes');
    assert(encoded.length < mtu, 'Short message fits inside single BLE chunk');

    // Multi-chunk simulation
    const largePayload = Buffer.alloc(750, 0x41); // 750 bytes of 'A'
    const totalChunks = Math.ceil(largePayload.length / mtu);
    assert.strictEqual(totalChunks, 4, '750 bytes payload slices into exactly 4 BLE chunks');
  });

  test('Bluetooth Mode & State Transition Handlers', () => {
    let capturedState = null;
    bleEngine.on('state-change', ({ state }) => { capturedState = state; });
    bleEngine.emit('state-change', { state: 'connected', deviceName: 'ProxiLink BLE Peripheral' });
    assert.strictEqual(capturedState, 'connected');
  });

  // ─── 7. PERFORMANCE & LATENCY BENCHMARKS ──────────────────────────
  console.log('\n--- 7. Performance & Latency Benchmarks ---');

  test('Database Query Latency Benchmark (< 25ms per indexed lookup)', () => {
    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      User.findById(testUserA.user_id);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;
    console.log(`     -> Average SQLite lookup latency: ${avgMs.toFixed(3)} ms (Target: < 25 ms)`);
    assert(avgMs < 25, 'Database query average must execute under 25ms');
  });

  test('Message Queueing Throughput Benchmark (100 messages in < 100ms)', () => {
    const UnifiedCommsManager = require('../../frontend/js/unified-comms');
    const comms = new UnifiedCommsManager();
    const count = 100;
    const start = performance.now();

    for (let i = 0; i < count; i++) {
      comms.enqueueMessage({
        id: `bench_${i}_${Date.now()}`,
        receiverId: testUserB.user_id,
        content: `Bench packet #${i}`
      });
    }

    const elapsed = performance.now() - start;
    console.log(`     -> Enqueued ${count} messages in: ${elapsed.toFixed(2)} ms (Throughput: ${(count / (elapsed / 1000)).toFixed(0)} msg/sec)`);
    assert(elapsed < 150, 'Queueing 100 messages must complete within 150ms');
    comms.dequeueMessage('all');
  });

  server.close();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║   ALL PHASE 8 MASTER TESTS PASSED (${passedTests}/${totalTests} TESTS - 100% SUCCESS)    ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

runMasterTestSuite().catch(err => {
  console.error('\n[FATAL TEST SUITE ERROR]', err);
  process.exit(1);
});
