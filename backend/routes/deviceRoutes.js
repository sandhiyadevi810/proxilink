/**
 * ProxiLink Backend – Device Routes
 * Mounted at /api/devices
 */
'use strict';

const express = require('express');
const router = express.Router();
const DeviceController = require('../controllers/deviceController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/',           authMiddleware, DeviceController.registerDevice);
router.post('/register',   authMiddleware, DeviceController.registerDevice);
router.get('/',            authMiddleware, DeviceController.getDevices);
router.put('/:id/status',  authMiddleware, DeviceController.updateDeviceStatus);
router.delete('/:id',      authMiddleware, DeviceController.deleteDevice);

module.exports = router;
