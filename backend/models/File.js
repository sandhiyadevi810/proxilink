/**
 * ProxiLink Backend – File & Transfer History Model
 * Data Access Layer for Files and Transfer_History tables.
 */
'use strict';

const { queryAll, queryOne, run, transaction } = require('../config/database');

const FileModel = {
  /**
   * Save uploaded file record and register its initial transfer history entry.
   */
  create({ sender_id, receiver_id = null, file_name, file_size, file_type, file_path, transfer_status = 'completed' }) {
    return transaction(() => {
      // 1. Insert file metadata
      const resFile = run(
        `INSERT INTO Files (sender_id, receiver_id, file_name, file_size, file_type, file_path, transfer_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sender_id, receiver_id || null, file_name, file_size, file_type, file_path, transfer_status]
      );

      const fileId = resFile.lastInsertRowid;

      // 2. Insert corresponding record into Transfer_History
      run(
        `INSERT INTO Transfer_History (file_id, sender_id, receiver_id, transfer_status)
         VALUES (?, ?, ?, ?)`,
        [fileId, sender_id, receiver_id || null, transfer_status]
      );

      return this.findById(fileId);
    });
  },

  /**
   * Find file by file_id with sender/receiver details.
   */
  findById(fileId) {
    return queryOne(
      `SELECT f.*,
              s.username AS sender_username, s.display_name AS sender_name,
              r.username AS receiver_username, r.display_name AS receiver_name
       FROM Files f
       JOIN Users s ON s.user_id = f.sender_id
       LEFT JOIN Users r ON r.user_id = f.receiver_id
       WHERE f.file_id = ?`,
      [fileId]
    );
  },

  /**
   * Retrieve all files associated with a specific user.
   */
  findByUser(userId) {
    return queryAll(
      `SELECT f.*,
              s.username AS sender_username, s.display_name AS sender_name,
              r.username AS receiver_username, r.display_name AS receiver_name
       FROM Files f
       JOIN Users s ON s.user_id = f.sender_id
       LEFT JOIN Users r ON r.user_id = f.receiver_id
       WHERE f.sender_id = ? OR f.receiver_id = ?
       ORDER BY f.created_at DESC`,
      [userId, userId]
    );
  },

  /**
   * Update file transfer status in both Files and Transfer_History tables.
   */
  updateTransferStatus(fileId, status) {
    const valid = ['in_progress', 'completed', 'failed'];
    if (!valid.includes(status)) {
      throw new Error(`Invalid transfer status. Must be one of: ${valid.join(', ')}`);
    }

    transaction(() => {
      run('UPDATE Files SET transfer_status = ? WHERE file_id = ?', [status, fileId]);
      run('UPDATE Transfer_History SET transfer_status = ? WHERE file_id = ?', [status, fileId]);
    });

    return this.findById(fileId);
  },

  /**
   * Query comprehensive transfer history audit log for a user.
   */
  getHistory(userId, limit = 50, offset = 0) {
    return queryAll(
      `SELECT th.transfer_id, th.transfer_date, th.transfer_status,
              f.file_id, f.file_name, f.file_size, f.file_type, f.file_path,
              s.username AS sender_username, s.display_name AS sender_name,
              r.username AS receiver_username, r.display_name AS receiver_name
       FROM Transfer_History th
       JOIN Files f ON f.file_id = th.file_id
       JOIN Users s ON s.user_id = th.sender_id
       LEFT JOIN Users r ON r.user_id = th.receiver_id
       WHERE th.sender_id = ? OR th.receiver_id = ?
       ORDER BY th.transfer_date DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, limit, offset]
    );
  }
};

module.exports = FileModel;
