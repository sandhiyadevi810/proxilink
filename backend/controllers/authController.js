/**
 * ProxiLink Backend – Authentication Controller
 * Handles user registration, login, JWT token issuance, and profile retrieval.
 */
'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../middleware/authMiddleware');

const SALT_ROUNDS = 12;

const AuthController = {
  /**
   * POST /api/auth/register
   * Create a new user profile with password hashing and return JWT token.
   */
  async register(req, res, next) {
    try {
      const { username, email, password, display_name } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      // Check duplicate username
      const existingUser = User.findByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: 'Username is already registered. Please choose another.' });
      }

      // Check duplicate email if provided
      if (email && email.trim()) {
        const existingEmail = User.findByEmail(email);
        if (existingEmail) {
          return res.status(409).json({ error: 'Email address is already in use.' });
        }
      }

      // Hash password with bcryptjs
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

      // Create in SQLite
      const newUser = User.create({
        username,
        email: email || null,
        password_hash,
        display_name: display_name || username
      });

      // Generate JWT
      const token = generateToken(newUser);

      // Return token and sanitized user
      return res.status(201).json({
        message: 'User registered successfully.',
        token,
        user: User.toSafeUser(newUser)
      });

    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/login
   * Authenticate user credentials and return JWT token.
   */
  async login(req, res, next) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username/email and password are required.' });
      }

      // Find user by username or email
      const user = User.findWithAuth(username);
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Compare password hash
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Generate JWT
      const token = generateToken(user);

      return res.status(200).json({
        message: 'Login successful.',
        token,
        user: User.toSafeUser(user)
      });

    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/profile
   * Return authenticated user's profile information.
   */
  async getProfile(req, res) {
    return res.status(200).json({
      user: User.toSafeUser(req.user)
    });
  },

  /**
   * POST /api/auth/logout
   * Clear session and acknowledge client logout.
   */
  async logout(req, res) {
    if (req.session) {
      req.session.destroy();
    }
    return res.status(200).json({
      message: 'Logged out successfully.'
    });
  }
};

module.exports = AuthController;
