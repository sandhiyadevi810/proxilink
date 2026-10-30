/**
 * ProxiLink Backend – Device Controller
 * Manages device registration, status updates, and listing.
 */
'use strict';

const Device = require('../models/Device');

const DeviceController = {
  /**
   * POST /api/devices/register
   * Register a new device for the authenticated user.
   */
  async registerDevice(req, res, next) {
    try {
      const { device_name, device_type, connection_type, status } = req.body;

      if (!device_name || !device_name.trim()) {
        return res.status(400).json({ error: 'Device name is required.' });
      }

      const newDevice = Device.register({
        user_id: req.user.user_id,
        device_name: device_name.trim(),
        device_type: device_type || 'laptop',
        connection_type: connection_type || 'wifi',
        status: status || 'online'
      });

      return res.status(201).json({
        message: 'Device registered successfully.',
        device: newDevice
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/devices
   * List all devices belonging to the user or all network devices if requested.
   */
  async getDevices(req, res, next) {
    try {
      const scope = req.query.scope; // 'all', 'online', 'my'
      const ConnectionService = require('../services/connectionService');
      const onlineDevices = ConnectionService.getOnlineDevices();

      let devices;
      if (scope === 'online') {
        devices = onlineDevices;
      } else if (scope === 'all') {
        devices = Device.findAll();
      } else {
        devices = Device.findByUserId(req.user.user_id);
      }

      return res.status(200).json({ devices, onlineDevices });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/devices/:id/status
   * Update device connection status ('online', 'offline', 'connected').
   */
  async updateDeviceStatus(req, res, next) {
    try {
      const deviceId = parseInt(req.params.id, 10);
      const { status } = req.body;

      if (isNaN(deviceId)) {
        return res.status(400).json({ error: 'Invalid device ID parameter.' });
      }

      if (!status) {
        return res.status(400).json({ error: 'Status is required.' });
      }

      const device = Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Device not found.' });
      }

      // Ensure ownership
      if (device.user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'Access denied. You do not own this device.' });
      }

      const updated = Device.updateStatus(deviceId, status);

      return res.status(200).json({
        message: 'Device status updated.',
        device: updated
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/devices/:id
   * Deregister device.
   */
  async deleteDevice(req, res, next) {
    try {
      const deviceId = parseInt(req.params.id, 10);
      if (isNaN(deviceId)) {
        return res.status(400).json({ error: 'Invalid device ID parameter.' });
      }

      const device = Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Device not found.' });
      }

      if (device.user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'Access denied. You do not own this device.' });
      }

      Device.delete(deviceId);

      return res.status(200).json({
        message: 'Device deregistered successfully.'
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = DeviceController;
