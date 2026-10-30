/**
 * ProxiLink Backend – User Controller
 * Handles user listing, profile retrieval by ID, and profile updates.
 */
'use strict';

const User = require('../models/User');

const UserController = {
  /**
   * GET /api/users
   * Return list of all registered users on the platform.
   */
  async getAllUsers(req, res, next) {
    try {
      const users = User.findAll();
      return res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/users/:id
   * Get public profile of a single user by ID.
   */
  async getUserById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user ID parameter.' });
      }

      const user = User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      return res.status(200).json({ user: User.toSafeUser(user) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/users/:id
   * Update user's profile attributes.
   */
  async updateUser(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user ID parameter.' });
      }

      // Ensure user is modifying their own profile
      if (req.user.user_id !== id) {
        return res.status(403).json({ error: 'Access denied. You can only update your own profile.' });
      }

      const { display_name, email } = req.body;

      const updated = User.update(id, { display_name, email });
      if (!updated) {
        return res.status(404).json({ error: 'User not found.' });
      }

      return res.status(200).json({
        message: 'Profile updated successfully.',
        user: User.toSafeUser(updated)
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = UserController;
