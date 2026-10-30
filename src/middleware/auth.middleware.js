/**
 * auth.middleware.js
 * Verifies that the requesting user has a valid session.
 */
'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required. Please log in.' });
}

module.exports = { requireAuth };
