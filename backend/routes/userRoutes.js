/**
 * ProxiLink Backend – User Routes
 * Mounted at /api/users
 */
'use strict';

const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/',     authMiddleware, UserController.getAllUsers);
router.get('/:id',  authMiddleware, UserController.getUserById);
router.put('/:id',  authMiddleware, UserController.updateUser);

module.exports = router;
