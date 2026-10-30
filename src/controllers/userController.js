/**
 * userController.js – User listing and profile
 */
'use strict';

const { queryAll, queryOne } = require('../db/db');

/** GET /api/users – list all users (for building contact list) */
function listUsers(req, res) {
  const users = queryAll(
    `SELECT user_id, username, display_name, avatar_color, last_seen
     FROM users
     WHERE user_id != ?
     ORDER BY display_name COLLATE NOCASE ASC`,
    [req.session.userId]
  );
  return res.json({ users });
}

/** GET /api/users/:id – get specific user profile */
function getUser(req, res) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID.' });

  const user = queryOne(
    'SELECT user_id, username, display_name, avatar_color, created_at, last_seen FROM users WHERE user_id = ?',
    [userId]
  );
  if (!user) return res.status(404).json({ error: 'User not found.' });

  return res.json({ user });
}

module.exports = { listUsers, getUser };
