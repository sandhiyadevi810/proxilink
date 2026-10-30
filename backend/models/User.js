/**
 * ProxiLink Backend – User Model
 * Data Access Layer for Users table.
 */
'use strict';

const { queryAll, queryOne, run } = require('../config/database');

const User = {
  /**
   * Create a new registered user in SQLite.
   */
  create({ username, email, password_hash, display_name }) {
    const result = run(
      `INSERT INTO Users (username, email, password_hash, display_name)
       VALUES (?, ?, ?, ?)`,
      [username.toLowerCase().trim(), email ? email.toLowerCase().trim() : null, password_hash, display_name ? display_name.trim() : username.trim()]
    );
    return this.findById(result.lastInsertRowid);
  },

  /**
   * Locate user by username (case-insensitive).
   */
  findByUsername(username) {
    if (!username) return null;
    return queryOne('SELECT * FROM Users WHERE username = ? COLLATE NOCASE', [username.toLowerCase().trim()]);
  },

  /**
   * Locate user by email (case-insensitive).
   */
  findByEmail(email) {
    if (!email) return null;
    return queryOne('SELECT * FROM Users WHERE email = ? COLLATE NOCASE', [email.toLowerCase().trim()]);
  },

  /**
   * Find user by primary key ID.
   */
  findById(userId) {
    return queryOne(
      'SELECT user_id, username, email, display_name, created_at FROM Users WHERE user_id = ?',
      [userId]
    );
  },

  /**
   * Find user including password hash (for authentication verify).
   */
  findWithAuth(identifier) {
    return queryOne(
      'SELECT * FROM Users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
      [identifier.toLowerCase().trim(), identifier.toLowerCase().trim()]
    );
  },

  /**
   * Retrieve all users excluding passwords.
   */
  findAll() {
    return queryAll(
      'SELECT user_id, username, email, display_name, created_at FROM Users ORDER BY user_id ASC'
    );
  },

  /**
   * Update user profile attributes.
   */
  update(userId, { display_name, email }) {
    const user = this.findById(userId);
    if (!user) return null;

    const newName = display_name !== undefined ? display_name.trim() : user.display_name;
    const newEmail = email !== undefined ? (email ? email.toLowerCase().trim() : null) : user.email;

    run(
      'UPDATE Users SET display_name = ?, email = ? WHERE user_id = ?',
      [newName, newEmail, userId]
    );

    return this.findById(userId);
  },

  /**
   * Strip sensitive fields from user object for safe client responses.
   */
  toSafeUser(user) {
    if (!user) return null;
    const { password_hash, ...safe } = user;
    return safe;
  }
};

module.exports = User;
