/**
 * groupController.js – Group creation and management
 */
'use strict';

const { run, queryAll, queryOne, transaction } = require('../db/db');

/** POST /api/groups/create */
function createGroup(req, res) {
  const userId     = req.session.userId;
  const { group_name, member_ids = [] } = req.body;

  if (!Array.isArray(member_ids)) {
    return res.status(400).json({ error: 'member_ids must be an array.' });
  }

  let groupId;
  transaction(() => {
    const result = run(
      'INSERT INTO groups (group_name, created_by) VALUES (?, ?)',
      [group_name.trim(), userId]
    );
    groupId = result.lastInsertRowid;

    // Add creator
    run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId]);

    // Add other members
    for (const memberId of member_ids) {
      const id = parseInt(memberId, 10);
      if (!isNaN(id) && id !== userId) {
        run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, id]);
      }
    }
  });

  return res.status(201).json({ group_id: groupId, group_name: group_name.trim() });
}

/** GET /api/groups – list all groups the current user is a member of */
function listMyGroups(req, res) {
  const userId = req.session.userId;
  const groups = queryAll(
    `SELECT g.group_id, g.group_name, g.created_at,
            u.display_name AS creator_name,
            COUNT(gm2.user_id) AS member_count
     FROM groups g
     JOIN users u ON u.user_id = g.created_by
     JOIN group_members gm ON gm.group_id = g.group_id AND gm.user_id = ?
     JOIN group_members gm2 ON gm2.group_id = g.group_id
     GROUP BY g.group_id
     ORDER BY g.created_at DESC`,
    [userId]
  );
  return res.json({ groups });
}

/** GET /api/groups/:id/members */
function getMembers(req, res) {
  const groupId = parseInt(req.params.id, 10);
  if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group ID.' });

  const members = queryAll(
    `SELECT u.user_id, u.display_name, u.avatar_color, gm.joined_at
     FROM group_members gm
     JOIN users u ON u.user_id = gm.user_id
     WHERE gm.group_id = ?
     ORDER BY u.display_name COLLATE NOCASE ASC`,
    [groupId]
  );
  return res.json({ members });
}

/** POST /api/groups/:id/add-member */
function addMember(req, res) {
  const groupId = parseInt(req.params.id, 10);
  const userId  = parseInt(req.body.user_id, 10);

  if (isNaN(groupId) || isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid group or user ID.' });
  }

  // Only group creator can add members
  const group = queryOne('SELECT * FROM groups WHERE group_id = ? AND created_by = ?', [groupId, req.session.userId]);
  if (!group) return res.status(403).json({ error: 'Only the group creator can add members.' });

  run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId]);
  return res.json({ added: true });
}

module.exports = { createGroup, listMyGroups, getMembers, addMember };
