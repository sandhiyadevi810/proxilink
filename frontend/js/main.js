/**
 * ProxiLink – Master Client Utilities & Theme Engine
 * Shared across all 9 frontend pages.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNav();
  highlightActiveNav();
  updateAuthUI();
});

// ─── Theme Management ─────────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('proxilink_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleIcons(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('proxilink_theme', next);
  updateThemeToggleIcons(next);
  showToast(`Switched to ${next} mode`, 'info');
}

function updateThemeToggleIcons(theme) {
  const toggles = document.querySelectorAll('.theme-toggle-btn i');
  toggles.forEach(icon => {
    if (theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  });
}

// ─── Mobile Navbar ────────────────────────────────────────────────
function initMobileNav() {
  const toggleBtn = document.querySelector('.nav-toggle-btn');
  const navMenu   = document.querySelector('.nav-menu');

  if (toggleBtn && navMenu) {
    toggleBtn.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-xmark');
      }
    });
  }
}

// ─── Active Navigation Link ───────────────────────────────────────
function highlightActiveNav() {
  const path = window.location.pathname.toLowerCase();
  const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  const links = document.querySelectorAll('.nav-link, .sidebar-nav-item');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const cleanHref = href.substring(href.lastIndexOf('/') + 1);

    if (cleanHref === filename || (filename === '' && cleanHref === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// ─── Session & Auth State ─────────────────────────────────────────
function getActiveUser() {
  try {
    const raw = sessionStorage.getItem('proxilink_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setActiveUser(user) {
  if (user) {
    sessionStorage.setItem('proxilink_user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('proxilink_user');
  }
}

function updateAuthUI() {
  const user = getActiveUser();
  const userDisplayEls = document.querySelectorAll('.user-display-name');
  const userRoleEls    = document.querySelectorAll('.user-role');
  const userAvatarEls  = document.querySelectorAll('.user-avatar-initials');

  if (user) {
    userDisplayEls.forEach(el => el.textContent = user.display_name || user.username);
    userRoleEls.forEach(el => el.textContent = `@${user.username}`);
    userAvatarEls.forEach(el => {
      el.textContent = (user.display_name || user.username).slice(0, 2).toUpperCase();
      if (user.avatar_color) el.style.backgroundColor = user.avatar_color;
    });
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  sessionStorage.removeItem('proxilink_user');
  sessionStorage.removeItem('chat_peer_id');
  showToast('Logged out successfully', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 600);
}

// ─── Toast Notifications ─────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconClass = type === 'success' ? 'fa-solid fa-circle-check text-success' :
                    type === 'error'   ? 'fa-solid fa-triangle-exclamation text-danger' :
                    type === 'warning' ? 'fa-solid fa-circle-exclamation text-warning' :
                                         'fa-solid fa-circle-info text-secondary';

  toast.innerHTML = `
    <i class="${iconClass}" style="font-size:1.15rem"></i>
    <div style="flex:1;word-break:break-word">${escHtml(message)}</div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;padding:0.2rem">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ─── Utility Helpers ──────────────────────────────────────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
  if (bytes === 0 || !bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
