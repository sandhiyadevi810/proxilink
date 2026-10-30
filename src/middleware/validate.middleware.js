/**
 * validate.middleware.js
 * Input validation helpers using express-validator.
 */
'use strict';

const { body, validationResult } = require('express-validator');

/** Middleware: checks validation result, returns 422 on failure */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array().map(e => e.msg) });
  }
  next();
}

/** Validation rules for user registration */
const registerRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3–30 characters.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username may only contain letters, numbers, and underscores.'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be at least 6 characters.'),
  body('display_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be 1–50 characters.')
    .escape()
];

/** Validation rules for login */
const loginRules = [
  body('username').trim().notEmpty().withMessage('Username is required.'),
  body('password').notEmpty().withMessage('Password is required.')
];

/** Validation rules for sending a message */
const messageRules = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message must be 1–4000 characters.')
    .escape()
];

/** Validation rules for creating a group */
const groupRules = [
  body('group_name')
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage('Group name must be 1–60 characters.')
    .escape()
];

module.exports = {
  handleValidationErrors,
  registerRules,
  loginRules,
  messageRules,
  groupRules
};
