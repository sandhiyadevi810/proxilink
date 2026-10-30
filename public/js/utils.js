/**
 * ProxiLink – Client Utilities
 * Provides shared helper functions across all frontend modules.
 */
'use strict';

/**
 * Display a floating toast notification.
 * @param {string} message 
 * @param {'info'|'success'|'warning'|'error'} type 
 * @param {number} durationMs 
 */
function showToast(message, type = 'info', durationMs = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' :
               type === 'error'   ? '✕' :
               type === 'warning' ? '⚠' : 'ℹ';

  toast.innerHTML = `<span style="font-weight:700">${icon}</span> <span>${escHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str 
 * @returns {string}
 */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format raw byte size into human readable string (KB, MB, GB).
 * @param {number} bytes 
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format ISO datetime string to localized readable string.
 * @param {string} isoString 
 * @returns {string}
 */
function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

/**
 * Generate a unique temporary ID for pending messages or transfers.
 * @returns {string}
 */
function generateTempId() {
  return 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Retrieve cached user session info from sessionStorage.
 * @returns {object|null}
 */
function getCachedUser() {
  try {
    const raw = sessionStorage.getItem('proxilink_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
