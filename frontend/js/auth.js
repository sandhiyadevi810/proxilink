/**
 * ProxiLink – Authentication Controller (Login & Register)
 * Handles client-side validation, password toggles, and API submission.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  initLoginForm();
  initRegisterForm();
});

// ─── Password Visibility Toggle ──────────────────────────────────
function initPasswordToggles() {
  const toggleBtns = document.querySelectorAll('.password-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = btn.querySelector('i');

      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
          }
        } else {
          input.type = 'password';
          if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
          }
        }
      }
    });
  });
}

// ─── Login Form Submission ───────────────────────────────────────
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const usernameOrEmail = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = document.getElementById('login-btn');

    if (!usernameOrEmail || !password) {
      showErrorAlert('Please enter both your username/email and password.');
      return;
    }

    setButtonLoading(submitBtn, true, 'Signing In...');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: usernameOrEmail,
          password: password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        showErrorAlert(data.error || 'Invalid username or password.');
        setButtonLoading(submitBtn, false, 'Sign In');
        return;
      }

      // Save user session
      setActiveUser(data.user);
      showToast(`Welcome back, ${data.user.display_name}!`, 'success');

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);

    } catch (err) {
      console.warn('[Auth] Server fetch failed, attempting client-mode demo login:', err);
      // Fallback demo mode if running without backend server
      const demoUser = {
        user_id: 1,
        username: usernameOrEmail.split('@')[0],
        display_name: usernameOrEmail.split('@')[0],
        avatar_color: '#6366F1'
      };
      setActiveUser(demoUser);
      showToast(`Logged in as ${demoUser.display_name} (Local Demo Mode)`, 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    }
  });
}

// ─── Register Form Submission ────────────────────────────────────
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const displayName = document.getElementById('display_name').value.trim();
    const username    = document.getElementById('username').value.trim();
    const email       = document.getElementById('email').value.trim();
    const password    = document.getElementById('password').value;
    const confirmPass = document.getElementById('confirm_password').value;
    const submitBtn   = document.getElementById('register-btn');

    // Client Validation
    if (!displayName || !username || !password) {
      showErrorAlert('Please fill in all required fields.');
      return;
    }

    if (username.length < 3 || username.length > 30) {
      showErrorAlert('Username must be between 3 and 30 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showErrorAlert('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showErrorAlert('Please provide a valid email address.');
      return;
    }

    if (password.length < 6) {
      showErrorAlert('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPass) {
      showErrorAlert('Passwords do not match. Please re-enter.');
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating Account...');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          display_name: displayName,
          username: username,
          password: password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        showErrorAlert(data.error || 'Registration failed. Please choose another username.');
        setButtonLoading(submitBtn, false, 'Create Account');
        return;
      }

      setActiveUser(data.user);
      showToast('Account registered successfully!', 'success');

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);

    } catch (err) {
      console.warn('[Auth] Server fetch failed, creating demo user session:', err);
      const demoUser = {
        user_id: Date.now(),
        username: username,
        display_name: displayName,
        avatar_color: '#4F46E5'
      };
      setActiveUser(demoUser);
      showToast('Registration complete (Local Mode)!', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);
    }
  });
}

// ─── UI Alert Helpers ─────────────────────────────────────────────
function showErrorAlert(msg) {
  const container = document.getElementById('auth-alert');
  if (!container) return;
  container.className = 'card';
  container.style.cssText = 'background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.35); color: #FCA5A5; padding: 0.85rem 1.25rem; margin-bottom: 1.25rem; font-size: 0.88rem; display: flex; align-items: center; gap: 0.6rem;';
  container.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${escHtml(msg)}</span>`;
  container.classList.remove('hidden');
}

function clearAlerts() {
  const container = document.getElementById('auth-alert');
  if (container) container.classList.add('hidden');
}

function setButtonLoading(btn, isLoading, text) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? `<i class="fa-solid fa-circle-notch fa-spin"></i> ${text}`
    : text;
}
