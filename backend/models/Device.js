/**
 * ProxiLink Backend – Device Model
 * Data Access Layer for Devices table.
 */
'use strict';

const { queryAll, queryOne, run } = require('../config/database');

const Device = {
  /**
   * Register a new wireless device for a user.
   */
  register({ user_id, device_name, device_type = 'laptop', connection_type = 'wifi', status = 'online' }) {
    const result = run(
      `INSERT INTO Devices (user_id, device_name, device_type, connection_type, status)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, device_name.trim(), device_type, connection_type, status]
    );
    return this.findById(result.lastInsertRowid);
  },

  /**
   * Alias for register
   */
  create(params) {
    return this.register(params);
  },

  /**
   * Find device by device_id.
   */
  findById(deviceId) {
    return queryOne(
      `SELECT d.*, u.username, u.display_name 
       FROM Devices d
       JOIN Users u ON u.user_id = d.user_id
       WHERE d.device_id = ?`,
      [deviceId]
    );
  },

  /**
   * List all registered devices for a specific user.
   */
  findByUserId(userId) {
    return queryAll(
      'SELECT * FROM Devices WHERE user_id = ? ORDER BY last_active DESC',
      [userId]
    );
  },

  /**
   * List all online/registered devices across the local network.
   */
  findAll() {
    return queryAll(
      `SELECT d.*, u.username, u.display_name
       FROM Devices d
       JOIN Users u ON u.user_id = d.user_id
       ORDER BY d.last_active DESC`
    );
  },

  /**
   * Update device connection status ('online', 'offline', 'connected').
   */
  updateStatus(deviceId, status) {
    const valid = ['online', 'offline', 'connected'];
    if (!valid.includes(status)) {
      throw new Error(`Invalid device status. Must be one of: ${valid.join(', ')}`);
    }

    run(
      `UPDATE Devices 
       SET status = ?, last_active = strftime('%Y-%m-%dT%H:%M:%SZ','now') 
       WHERE device_id = ?`,
      [status, deviceId]
    );
    return this.findById(deviceId);
  },

  /**
   * Delete device registration.
   */
  delete(deviceId) {
    const dev = this.findById(deviceId);
    if (!dev) return false;
    run('DELETE FROM Devices WHERE device_id = ?', [deviceId]);
    return true;
  }
};

module.exports = Device;
