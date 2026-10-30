/**
 * ProxiLink Backend – Authentication Routes
 * Mounted at /api/auth
 */
'use strict';

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/register', AuthController.register);
router.post('/login',    AuthController.login);
router.post('/logout',   AuthController.logout);
router.get('/profile',   authMiddleware, AuthController.getProfile);
router.get('/me',        authMiddleware, AuthController.getProfile);

module.exports = router;
