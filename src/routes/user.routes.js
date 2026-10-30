'use strict';
const router = require('express').Router();
const { listUsers, getUser } = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth.middleware');

router.get('/',    requireAuth, listUsers);
router.get('/:id', requireAuth, getUser);

module.exports = router;
