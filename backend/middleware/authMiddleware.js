/**
 * ProxiLink Backend – JWT Authentication Middleware
 * Validates incoming JSON Web Tokens from Authorization header, query, or cookies.
 */
'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'proxilink_offline_wireless_secret_key_2026_jwt';

function authMiddleware(req, res, next) {
  let token = null;

  // 1. Check Authorization Header: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check Query parameter (?token=...)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  // 3. Check Session / Cookie fallback
  if (!token && req.session && req.session.userId) {
    req.user = User.findById(req.session.userId);
    if (req.user) return next();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Access denied. No authentication token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = User.findById(decoded.user_id);

    if (!user) {
      return res.status(401).json({ error: 'User associated with this token no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid or expired authentication token.'
    });
  }
}

/**
 * Generate a signed JWT token for an authenticated user.
 */
function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = {
  authMiddleware,
  generateToken,
  JWT_SECRET
};
