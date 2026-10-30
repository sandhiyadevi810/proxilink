'use strict';
const router = require('express').Router();
const { createGroup, listMyGroups, getMembers, addMember } = require('../controllers/groupController');
const { requireAuth } = require('../middleware/auth.middleware');
const { groupRules, handleValidationErrors } = require('../middleware/validate.middleware');

router.post('/',              requireAuth, groupRules, handleValidationErrors, createGroup);
router.get ('/',              requireAuth, listMyGroups);
router.get ('/:id/members',   requireAuth, getMembers);
router.post('/:id/add-member',requireAuth, addMember);

module.exports = router;
