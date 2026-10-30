/**
 * ProxiLink – Database Module
 * Uses sql.js (WebAssembly SQLite)
 * 100% portable, works across all Node.js versions without native C++ compilation tools.
 * Persists SQLite database binary to disk on writes.
 */

'use strict';

const initSqlJs = require('sql.js');
const path      = require('path');
const fs        = require('fs');

const DB_DIR  = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'proxilink.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db = null;
let SQL = null;

/**
 * Initialize database and create all tables.
 */
async function initDatabase() {
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');

  createTables();
  saveDB();
  console.log('[DB] SQLite (WASM) database initialized at:', DB_PATH);
}

/**
 * Persist in-memory SQLite state to disk.
 */
function saveDB() {
  if (db) {
    try {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('[DB] Failed to save database to disk:', err);
    }
  }
}

function createTables() {
  db.run(`
    -- ─── Users ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      display_name  TEXT    NOT NULL,
      avatar_color  TEXT    NOT NULL DEFAULT '#4F46E5',
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_seen     TEXT    DEFAULT NULL
    );

    -- ─── Devices ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS devices (
      device_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      device_name    TEXT    NOT NULL DEFAULT 'Unknown Device',
      device_type    TEXT    NOT NULL DEFAULT 'unknown',
      ip_address     TEXT    DEFAULT NULL,
      bt_address     TEXT    DEFAULT NULL,
      last_connected TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── Groups ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS groups (
      group_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name  TEXT    NOT NULL,
      created_by  INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── Group Members ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS group_members (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id  INTEGER NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
      joined_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(group_id, user_id)
    );

    -- ─── Messages ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS messages (
      message_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      receiver_id  INTEGER DEFAULT NULL REFERENCES users(user_id) ON DELETE SET NULL,
      group_id     INTEGER DEFAULT NULL REFERENCES groups(group_id) ON DELETE SET NULL,
      content      TEXT    NOT NULL,
      message_type TEXT    NOT NULL DEFAULT 'text',
      sent_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      status       TEXT    NOT NULL DEFAULT 'sent'
    );

    -- ─── Files ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS files (
      file_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      receiver_id  INTEGER DEFAULT NULL REFERENCES users(user_id) ON DELETE SET NULL,
      group_id     INTEGER DEFAULT NULL REFERENCES groups(group_id) ON DELETE SET NULL,
      message_id   INTEGER DEFAULT NULL REFERENCES messages(message_id) ON DELETE SET NULL,
      file_name    TEXT    NOT NULL,
      file_type    TEXT    NOT NULL,
      file_size    INTEGER NOT NULL DEFAULT 0,
      file_path    TEXT    NOT NULL,
      checksum     TEXT    DEFAULT NULL,
      uploaded_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- ─── Transfer History ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS transfer_history (
      transfer_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id           INTEGER NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
      sender_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      receiver_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      status            TEXT    NOT NULL DEFAULT 'in_progress',
      bytes_transferred INTEGER NOT NULL DEFAULT 0,
      total_bytes       INTEGER NOT NULL DEFAULT 0,
      started_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      completed_at      TEXT    DEFAULT NULL
    );

    -- ─── Indexes ──────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_group    ON messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_files_sender      ON files(sender_id);
    CREATE INDEX IF NOT EXISTS idx_files_receiver    ON files(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_file     ON transfer_history(file_id);
  `);
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

const getDB = () => {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
};

/** Run a SELECT that returns multiple rows as objects */
const queryAll = (sql, params = []) => {
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
};

/** Run a SELECT that returns a single row */
const queryOne = (sql, params = []) => {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
};

/** Run an INSERT / UPDATE / DELETE, returns { lastInsertRowid, changes } */
const run = (sql, params = []) => {
  const d = getDB();
  if (params && params.length) {
    d.run(sql, params);
  } else {
    d.run(sql);
  }

  const res = d.exec('SELECT last_insert_rowid() AS id, changes() AS ch;');
  const lastInsertRowid = res[0] && res[0].values[0] ? res[0].values[0][0] : 0;
  const changes = res[0] && res[0].values[0] ? res[0].values[0][1] : 0;

  saveDB();
  return { lastInsertRowid, changes };
};

/** Run multiple statements in a transaction */
const transaction = (fn) => {
  const d = getDB();
  d.run('BEGIN TRANSACTION;');
  try {
    const res = fn();
    d.run('COMMIT;');
    saveDB();
    return res;
  } catch (e) {
    d.run('ROLLBACK;');
    throw e;
  }
};

module.exports = { initDatabase, queryAll, queryOne, run, transaction };
