/**
 * Auth UI
 *
 * Handles the Entry Screen (Student Sign Up, Student Login, Admin Login),
 * Student Profile Card Dropdown, Student Logout, and Password Show/Hide Toggles.
 *
 * Security model:
 *  - Authentication authority: Supabase Auth.
 *  - Authorization authority: RLS policies on PostgreSQL tables.
 *  - User profile metadata & role stored in `public.profiles`.
 */

import { getState } from "../state/appState.js";
import { signInStudent, signUpStudent, signInAdmin, signOut } from "../services/authService.js";
import { showToast, logToTerminal } from "./notifications.js";
import { switchTab } from "./tabs.js";
import { escapeHtml } from "../utils/security.js";

/**
 * Wire all authentication-related event listeners.
 */
export function setupAuthHandlers() {
  // Option buttons
  const showStudentLoginBtn  = document.getElementById("show-student-login-btn");
  const showStudentSignUpBtn = document.getElementById("show-student-signup-btn");
  const showAdminLoginBtn    = document.getElementById("show-admin-login-btn");

  // Form elements
  const studentLoginForm     = document.getElementById("student-login-form");
  const studentSignUpForm    = document.getElementById("student-signup-form");
  const adminLoginForm       = document.getElementById("admin-login-form");

  // Cancel / Back buttons
  const studentLoginCancel   = document.getElementById("student-login-cancel");
  const studentSignUpCancel  = document.getElementById("student-signup-cancel");
  const adminLoginCancel     = document.getElementById("admin-login-cancel");

  // Switch buttons
  const switchToSignUpBtn    = document.getElementById("switch-to-signup-btn");
  const switchToLoginBtn     = document.getElementById("switch-to-login-btn");

  // Header logout buttons
  const logoutBtn            = document.getElementById("logout-btn");
  const profileLogoutBtn     = document.getElementById("profile-logout-btn");

  // Profile menu dropdown controls
  const profileMenuBtn       = document.getElementById("profile-menu-btn");
  const profileDropdownCard  = document.getElementById("profile-dropdown-card");
  const profileNavEventsBtn  = document.getElementById("profile-nav-events-btn");
  const profileNavTicketsBtn = document.getElementById("profile-nav-tickets-btn");

  // ── Password Show / Hide Toggles ──
  _setupPasswordToggleHandlers();

  // ── Show Forms ──
  showStudentLoginBtn?.addEventListener("click", () => {
    _showFormBox("student-login");
    document.getElementById("student-email-input")?.focus();
  });

  showStudentSignUpBtn?.addEventListener("click", () => {
    _showFormBox("student-signup");
    document.getElementById("student-signup-name")?.focus();
  });

  showAdminLoginBtn?.addEventListener("click", () => {
    _showFormBox("admin-login");
    document.getElementById("admin-email-input")?.focus();
  });

  // ── Switch Form Views ──
  switchToSignUpBtn?.addEventListener("click", () => {
    _showFormBox("student-signup");
  });

  switchToLoginBtn?.addEventListener("click", () => {
    _showFormBox("student-login");
  });

  // ── Cancel / Back to Options ──
  studentLoginCancel?.addEventListener("click", () => _showFormBox("options"));
  studentSignUpCancel?.addEventListener("click", () => _showFormBox("options"));
  adminLoginCancel?.addEventListener("click", () => _showFormBox("options"));

  // ── Profile Dropdown Toggle & Actions ──
  profileMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdownCard?.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!profileMenuBtn?.contains(e.target) && !profileDropdownCard?.contains(e.target)) {
      profileDropdownCard?.classList.add("hidden");
    }
  });

  profileNavEventsBtn?.addEventListener("click", () => {
    profileDropdownCard?.classList.add("hidden");
    switchTab("catalog");
  });

  profileNavTicketsBtn?.addEventListener("click", () => {
    profileDropdownCard?.classList.add("hidden");
    switchTab("mytickets");
  });

  // ── Submit Handlers ──
  studentLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await _handleStudentLogin();
  });

  studentSignUpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await _handleStudentSignUp();
  });

  adminLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await _handleAdminLogin();
  });

  // ── Logout Handlers ──
  const performLogout = async () => {
    profileDropdownCard?.classList.add("hidden");
    await signOut();
    applyRoleUI();
    showToast("Logged out successfully", "info");
    logToTerminal("User session terminated (Logged out)", "info");
    _showFormBox("options");
  };

  logoutBtn?.addEventListener("click", performLogout);
  profileLogoutBtn?.addEventListener("click", performLogout);
}

/** Wire password show/hide eye icon toggle buttons */
function _setupPasswordToggleHandlers() {
  document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute("data-target");
      const inputEl = document.getElementById(targetId);
      if (!inputEl) return;

      const isPassword = inputEl.type === "password";
      inputEl.type = isPassword ? "text" : "password";

      const iconEl = btn.querySelector("iconify-icon");
      if (iconEl) {
        iconEl.setAttribute("icon", isPassword ? "fa6-solid:eye-slash" : "fa6-solid:eye");
      }
    });
  });
}

/** Helper to switch between Entry view boxes */
function _showFormBox(target) {
  const entryOptions     = document.getElementById("entry-options");
  const studentLoginBox  = document.getElementById("student-login-box");
  const studentSignUpBox = document.getElementById("student-signup-box");
  const adminLoginBox    = document.getElementById("admin-login-box");

  entryOptions?.classList.toggle("hidden", target !== "options");
  studentLoginBox?.classList.toggle("hidden", target !== "student-login");
  studentSignUpBox?.classList.toggle("hidden", target !== "student-signup");
  adminLoginBox?.classList.toggle("hidden", target !== "admin-login");

  _hideError("student-login-error");
  _hideError("student-signup-error");
  _hideError("admin-login-error");
}

/** Handle Student Login */
async function _handleStudentLogin() {
  const emailInput = document.getElementById("student-email-input");
  const passInput  = document.getElementById("student-password-input");
  const errorEl    = document.getElementById("student-login-error");
  const submitBtn  = document.getElementById("student-login-submit");

  const email    = (emailInput?.value || "").trim();
  const password = passInput?.value || "";

  if (!email || !password) {
    _showError(errorEl, "Please enter both email and password.");
    return;
  }

  _setButtonLoading(submitBtn, "Logging in…");
  _hideError(errorEl);

  const result = await signInStudent(email, password);
  _resetButton(submitBtn, '<iconify-icon icon="fa6-solid:right-to-bracket"></iconify-icon> Login');

  if (!result.success) {
    _showError(errorEl, result.error);
    return;
  }

  _showFormBox("options");
  applyRoleUI();
  showToast(`Welcome back, ${result.user.fullName || result.user.email}!`, "success");
  logToTerminal(`Student logged in: ${result.user.email}`, "info");
}

/** Handle Student Sign Up */
async function _handleStudentSignUp() {
  const nameInput    = document.getElementById("student-signup-name");
  const emailInput   = document.getElementById("student-signup-email");
  const rollInput    = document.getElementById("student-signup-roll");
  const passInput    = document.getElementById("student-signup-password");
  const confirmInput = document.getElementById("student-signup-confirm");
  const errorEl      = document.getElementById("student-signup-error");
  const submitBtn    = document.getElementById("student-signup-submit");

  const fullName   = (nameInput?.value || "").trim();
  const email      = (emailInput?.value || "").trim();
  const rollNumber = (rollInput?.value || "").trim();
  const password   = passInput?.value || "";
  const confirm    = confirmInput?.value || "";

  if (!fullName || !email || !rollNumber || !password || !confirm) {
    _showError(errorEl, "Please fill in all fields.");
    return;
  }

  if (password.length < 6) {
    _showError(errorEl, "Password must be at least 6 characters long.");
    return;
  }

  if (password !== confirm) {
    _showError(errorEl, "Passwords do not match.");
    return;
  }

  _setButtonLoading(submitBtn, "Creating account…");
  _hideError(errorEl);

  const result = await signUpStudent({ fullName, email, rollNumber, password });
  _resetButton(submitBtn, '<iconify-icon icon="fa6-solid:user-check"></iconify-icon> Create Account');

  if (!result.success) {
    _showError(errorEl, result.error);
    return;
  }

  _showFormBox("options");
  applyRoleUI();
  showToast("Account created successfully! Welcome to EventHub.", "success");
  logToTerminal(`Student account registered: ${email} (${rollNumber})`, "info");
}

/** Handle Admin Login */
async function _handleAdminLogin() {
  const emailInput = document.getElementById("admin-email-input");
  const passInput  = document.getElementById("admin-password-input");
  const errorEl    = document.getElementById("admin-login-error");
  const submitBtn  = document.getElementById("admin-login-submit");

  const email    = (emailInput?.value || "").trim();
  const password = passInput?.value || "";

  if (!email || !password) {
    _showError(errorEl, "Please enter both email and password.");
    return;
  }

  _setButtonLoading(submitBtn, "Signing in…");
  _hideError(errorEl);

  const result = await signInAdmin(email, password);
  _resetButton(submitBtn, '<iconify-icon icon="fa6-solid:right-to-bracket"></iconify-icon> Sign In');

  if (!result.success) {
    _showError(errorEl, result.error);
    return;
  }

  _showFormBox("options");
  applyRoleUI();
  showToast("Logged in as Administrator", "success");
  logToTerminal(`Admin authenticated: ${result.user.email}`, "info");
}

/**
 * Apply the correct UI state for the current role & user profile.
 * Called after login, logout, and session restore.
 */
export function applyRoleUI() {
  const state = getState();
  const { user, profile, isAuthenticated } = state;
  const role = state.role || state.currentUser?.role || null;

  const entryScreen = document.getElementById("entry-screen");
  const appShell    = document.getElementById("app-shell");
  const roleBadge   = document.getElementById("role-badge");

  // Profile Card elements
  const profileNameEl  = document.getElementById("profile-card-name");
  const profileEmailEl = document.getElementById("profile-card-email");
  const profileRollEl  = document.getElementById("profile-card-roll");
  const profileIconEl  = document.getElementById("profile-card-icon");

  if (!isAuthenticated || !role) {
    entryScreen?.classList.remove("hidden");
    appShell?.classList.add("hidden");
    return;
  }

  entryScreen?.classList.add("hidden");
  appShell?.classList.remove("hidden");

  // Resolve user display info from user & profile objects (Phase 2.2 schema)
  const displayName = profile?.full_name || state.currentUser?.fullName || state.currentUser?.name || "Student";
  const displayEmail = user?.email || state.currentUser?.email || "";
  const displayRoll  = profile?.roll_number || state.currentUser?.rollNumber || "";

  // Populate Header Role Badge
  if (roleBadge) {
    if (role === "admin") {
      roleBadge.className = "role-badge role-admin";
      roleBadge.innerHTML = `<iconify-icon icon="fa6-solid:user-shield"></iconify-icon> Admin (${escapeHtml(displayName)})`;
    } else {
      roleBadge.className = "role-badge role-student";
      const rollSuffix = displayRoll ? ` (${escapeHtml(displayRoll)})` : "";
      roleBadge.innerHTML = `<iconify-icon icon="fa6-solid:user-graduate"></iconify-icon> ${escapeHtml(displayName)}${rollSuffix}`;
    }
  }

  // Populate Profile Dropdown Card
  if (profileNameEl)  profileNameEl.textContent  = displayName;
  if (profileEmailEl) profileEmailEl.textContent = displayEmail;
  if (profileRollEl) {
    if (role === "admin") {
      profileRollEl.textContent = "Administrator";
      profileRollEl.className   = "badge badge-primary";
    } else {
      profileRollEl.textContent = displayRoll ? `Roll: ${displayRoll}` : "Student";
      profileRollEl.className   = "badge badge-secondary";
    }
  }
  if (profileIconEl) {
    profileIconEl.setAttribute("icon", role === "admin" ? "fa6-solid:user-shield" : "fa6-solid:user-graduate");
  }

  // Show/hide elements with data-role attributes
  document.querySelectorAll("[data-role]").forEach((el) => {
    const attr = el.getAttribute("data-role");
    if (!attr || attr === "all") {
      el.classList.remove("hidden");
    } else {
      const allowed = attr.split(",").map((r) => r.trim());
      el.classList.toggle("hidden", !allowed.includes(role));
    }
  });

  // Default tab for role
  switchTab(role === "admin" ? "admin" : "catalog");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _showError(el, msg) {
  if (!el) return;
  el.innerHTML = `<iconify-icon icon="fa6-solid:circle-xmark"></iconify-icon> ${escapeHtml(msg)}`;
  el.classList.remove("hidden");
}

function _hideError(elementId) {
  const el = typeof elementId === "string" ? document.getElementById(elementId) : elementId;
  el?.classList.add("hidden");
}

function _setButtonLoading(btn, text) {
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = text;
}

function _resetButton(btn, html) {
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = html;
}
