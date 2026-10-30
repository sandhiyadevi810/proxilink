/**
 * authController.js – Register, Login, Logout, Me
 */
'use strict';

const bcrypt = require('bcryptjs');
const { queryOne, run } = require('../db/db');

const SALT_ROUNDS = 12;

// Avatar colors pool for new users
const AVATAR_COLORS = [
  '#4F46E5','#0891B2','#059669','#D97706',
  '#DC2626','#7C3AED','#DB2777','#0284C7'
];

/** POST /api/auth/register */
async function register(req, res) {
  try {
    const { username, password, display_name } = req.body;

    // Check username uniqueness
    const existing = queryOne('SELECT user_id FROM users WHERE username = ?', [username.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken. Choose another.' });
    }

    const hash  = await bcrypt.hash(password, SALT_ROUNDS);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const result = run(
      'INSERT INTO users (username, password_hash, display_name, avatar_color) VALUES (?, ?, ?, ?)',
      [username.toLowerCase(), hash, display_name.trim(), color]
    );

    const userId = result.lastInsertRowid;

    // Auto-login after registration
    req.session.userId      = userId;
    req.session.username    = username.toLowerCase();
    req.session.displayName = display_name.trim();

    return res.status(201).json({
      message: 'Registration successful.',
      user: {
        user_id:      userId,
        username:     username.toLowerCase(),
        display_name: display_name.trim(),
        avatar_color: color
      }
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}

/** POST /api/auth/login */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Update last_seen
    run("UPDATE users SET last_seen = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE user_id = ?", [user.user_id]);

    req.session.userId      = user.user_id;
    req.session.username    = user.username;
    req.session.displayName = user.display_name;

    return res.json({
      message: 'Login successful.',
      user: {
        user_id:      user.user_id,
        username:     user.username,
        display_name: user.display_name,
        avatar_color: user.avatar_color
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

/** POST /api/auth/logout */
function logout(req, res) {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully.' });
  });
}

/** GET /api/auth/me */
function me(req, res) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const user = queryOne(
    'SELECT user_id, username, display_name, avatar_color, created_at, last_seen FROM users WHERE user_id = ?',
    [req.session.userId]
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  return res.json({ user });
}

module.exports = { register, login, logout, me };
