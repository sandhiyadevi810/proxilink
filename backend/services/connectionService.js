/**
 * ProxiLink Backend – Connection Service
 * Manages active peer presence, online sockets, and device sessions across the local network.
 */
'use strict';

// Map: userId (number) -> Map<socketId, deviceInfo>
const activeUsers = new Map();

const ConnectionService = {
  /**
   * Register an active socket connection for a user with rich device info.
   */
  registerUserSocket(userId, socketId, info = {}) {
    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Map());
    }
    activeUsers.get(userId).set(socketId, {
      socketId,
      userId,
      username: info.username || `user_${userId}`,
      displayName: info.displayName || `Peer #${userId}`,
      deviceName: info.deviceName || `${info.deviceType || 'Device'} (${info.ip || 'LAN'})`,
      deviceType: info.deviceType || 'laptop',
      connectionType: info.connectionType || 'wifi',
      ip: info.ip || '127.0.0.1',
      connectedAt: new Date().toISOString()
    });
  },

  /**
   * Deregister a socket on disconnect.
   */
  deregisterSocket(userId, socketId) {
    if (activeUsers.has(userId)) {
      const userSockets = activeUsers.get(userId);
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        activeUsers.delete(userId);
      }
    }
  },

  /**
   * Check if a specific user is currently connected.
   */
  isUserOnline(userId) {
    return activeUsers.has(userId) && activeUsers.get(userId).size > 0;
  },

  /**
   * Retrieve list of all currently connected user IDs.
   */
  getOnlineUserIds() {
    return Array.from(activeUsers.keys());
  },

  /**
   * Retrieve all online devices across the local Wi-Fi network.
   */
  getOnlineDevices() {
    const devices = [];
    for (const [userId, sockets] of activeUsers.entries()) {
      for (const [socketId, info] of sockets.entries()) {
        devices.push({
          userId: info.userId,
          username: info.username,
          displayName: info.displayName,
          deviceName: info.deviceName,
          deviceType: info.deviceType,
          connectionType: info.connectionType,
          ip: info.ip,
          socketId: info.socketId,
          connectedAt: info.connectedAt,
          status: 'online'
        });
      }
    }
    return devices;
  },

  /**
   * Retrieve all socket IDs associated with a specific user.
   */
  getUserSocketIds(userId) {
    if (!activeUsers.has(userId)) return [];
    return Array.from(activeUsers.get(userId).keys());
  }
};

module.exports = ConnectionService;

