/**
 * ProxiLink – Settings Controller
 * Manages user profile customization, theme selector, buffer tuning, and cache clearing.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
});

function initSettings() {
  const user = getActiveUser() || {
    username: 'alex_99',
    display_name: 'Alex Johnson',
    avatar_color: '#6366F1'
  };

  const nameInput = document.getElementById('setting-display-name');
  const userInput = document.getElementById('setting-username');
  const colorInput = document.getElementById('setting-avatar-color');
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

  if (nameInput) nameInput.value = user.display_name || '';
  if (userInput) userInput.value = user.username || '';
  if (colorInput) colorInput.value = user.avatar_color || '#6366F1';

  // Set theme radio or buttons
  const themeRadios = document.querySelectorAll('input[name="theme-choice"]');
  themeRadios.forEach(r => {
    if (r.value === currentTheme) r.checked = true;
  });
}

function saveProfileSettings() {
  const displayName = document.getElementById('setting-display-name').value.trim();
  const avatarColor = document.getElementById('setting-avatar-color').value;

  if (!displayName) {
    showToast('Display name cannot be empty.', 'warning');
    return;
  }

  let user = getActiveUser() || { username: 'user', display_name: 'User' };
  user.display_name = displayName;
  user.avatar_color = avatarColor;

  setActiveUser(user);
  updateAuthUI();
  showToast('Profile updated successfully!', 'success');
}

function handleThemeChange(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('proxilink_theme', theme);
  updateThemeToggleIcons(theme);
  showToast(`Theme updated to ${theme} mode`, 'info');
}

function saveNetworkPreferences() {
  const chunkSize = document.getElementById('chunk-size-select').value;
  const autoReconnect = document.getElementById('auto-reconnect-toggle').checked;

  localStorage.setItem('proxilink_chunk_size', chunkSize);
  localStorage.setItem('proxilink_auto_reconnect', autoReconnect ? '1' : '0');

  showToast(`Network preferences saved! (Chunk: ${chunkSize} KB)`, 'success');
}

function clearLocalCache() {
  if (confirm('Are you sure you want to clear cached messages and transfer logs from local storage?')) {
    sessionStorage.removeItem('chat_peer_id');
    sessionStorage.removeItem('chat_peer_name');
    showToast('Local application cache cleared!', 'success');
  }
}
