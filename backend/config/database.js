/**
 * ProxiLink Backend – Database Configuration Module
 * Uses sql.js WebAssembly SQLite for cross-platform portability.
 * Persists SQLite binary to disk at database/proxilink.db on write operations.
 */
'use strict';

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'database');
const DB_PATH = path.join(DB_DIR, 'proxilink.db');

// Ensure database folder exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;
let SQL = null;

/**
 * Initialize WebAssembly SQLite database and run schema migrations.
 */
async function initDatabase() {
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  // Enforce foreign key constraints
  db.run('PRAGMA foreign_keys = ON;');

  createTables();
  saveDB();
  console.log(`[Database] SQLite (WASM) initialized at: ${DB_PATH}`);
}

/**
 * Flush in-memory SQLite database state to binary disk file.
 */
function saveDB() {
  if (db) {
    try {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('[Database] Failed to write database to disk:', err);
    }
  }
}

/**
 * Execute DDL schema creation matching Phase 4 specifications.
 */
function createTables() {
  db.run(`
    -- ─── 1. Users Table ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Users (
      user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      email         TEXT    UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      display_name  TEXT    DEFAULT '',
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── 2. Devices Table ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Devices (
      device_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      device_name     TEXT    NOT NULL DEFAULT 'Unknown Device',
      device_type     TEXT    NOT NULL DEFAULT 'laptop', -- 'laptop', 'mobile', 'tablet'
      connection_type TEXT    NOT NULL DEFAULT 'wifi',   -- 'wifi', 'bluetooth', 'webrtc'
      status          TEXT    NOT NULL DEFAULT 'offline',-- 'online', 'offline', 'connected'
      last_active     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── 3. Messages Table ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Messages (
      message_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id       INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      receiver_id     INTEGER DEFAULT NULL REFERENCES Users(user_id) ON DELETE SET NULL,
      group_id        INTEGER DEFAULT NULL,
      message_content TEXT    NOT NULL,
      message_type    TEXT    NOT NULL DEFAULT 'text',    -- 'text', 'file', 'system'
      timestamp       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      delivery_status TEXT    NOT NULL DEFAULT 'sent'     -- 'sent', 'delivered', 'read'
    );

    -- ─── 4. Files Table ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Files (
      file_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id       INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      receiver_id     INTEGER DEFAULT NULL REFERENCES Users(user_id) ON DELETE SET NULL,
      file_name       TEXT    NOT NULL,
      file_size       INTEGER NOT NULL DEFAULT 0,
      file_type       TEXT    NOT NULL DEFAULT 'application/octet-stream',
      file_path       TEXT    NOT NULL,
      transfer_status TEXT    NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── 5. Transfer History Table ───────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Transfer_History (
      transfer_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id         INTEGER NOT NULL REFERENCES Files(file_id) ON DELETE CASCADE,
      sender_id       INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      receiver_id     INTEGER DEFAULT NULL REFERENCES Users(user_id) ON DELETE SET NULL,
      transfer_date   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      transfer_status TEXT    NOT NULL DEFAULT 'completed'    -- 'completed', 'in_progress', 'failed'
    );

    -- ─── 6. Groups Table ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Groups (
      group_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name      TEXT    NOT NULL,
      created_by      INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── 7. Group Members Table ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Group_Members (
      membership_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id        INTEGER NOT NULL REFERENCES Groups(group_id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      joined_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(group_id, user_id)
    );

    -- ─── Performance Indexes ─────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_users_username    ON Users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email       ON Users(email);
    CREATE INDEX IF NOT EXISTS idx_devices_user      ON Devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender   ON Messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON Messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_group    ON Messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_files_sender      ON Files(sender_id);
    CREATE INDEX IF NOT EXISTS idx_files_receiver    ON Files(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_file     ON Transfer_History(file_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_grp ON Group_Members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_usr ON Group_Members(user_id);
  `);
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

function getDB() {
  if (!db) throw new Error('Database not initialized. Await initDatabase() first.');
  return db;
}

/**
 * Execute SELECT query returning an array of objects.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Array<object>}
 */
function queryAll(sql, params = []) {
  const d = getDB();
  const stmt = d.prepare(sql);
  if (params && params.length) {
    stmt.bind(params);
  }
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Execute SELECT query returning the first matching row or null.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {object|null}
 */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

let inTransaction = false;

/**
 * Execute INSERT, UPDATE, or DELETE query and persist to disk.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {{ lastInsertRowid: number, changes: number }}
 */
function run(sql, params = []) {
  const d = getDB();
  if (params && params.length) {
    d.run(sql, params);
  } else {
    d.run(sql);
  }

  const res = d.exec('SELECT last_insert_rowid() AS id, changes() AS ch;');
  const lastInsertRowid = res[0] && res[0].values[0] ? res[0].values[0][0] : 0;
  const changes = res[0] && res[0].values[0] ? res[0].values[0][1] : 0;

  if (!inTransaction) {
    saveDB();
  }
  return { lastInsertRowid, changes };
}

/**
 * Execute callback inside an ACID transaction and persist to disk.
 * @param {Function} fn 
 */
function transaction(fn) {
  const d = getDB();
  inTransaction = true;
  d.run('BEGIN TRANSACTION;');
  try {
    const res = fn();
    d.run('COMMIT;');
    inTransaction = false;
    saveDB();
    return res;
  } catch (err) {
    d.run('ROLLBACK;');
    inTransaction = false;
    throw err;
  }
}

module.exports = {
  initDatabase,
  initDB: initDatabase,
  getDB,
  queryAll,
  queryOne,
  run,
  transaction,
  saveDB
};
