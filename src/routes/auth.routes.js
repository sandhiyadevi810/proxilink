'use strict';
const router = require('express').Router();
const { register, login, logout, me } = require('../controllers/authController');
const { registerRules, loginRules, handleValidationErrors } = require('../middleware/validate.middleware');

router.post('/register', registerRules, handleValidationErrors, register);
router.post('/login',    loginRules,    handleValidationErrors, login);
router.post('/logout',   logout);
router.get ('/me',       me);

module.exports = router;
