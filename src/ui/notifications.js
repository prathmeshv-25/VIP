/**
 * Notifications UI
 *
 * Toast messages, terminal log, and the live REST network console.
 * These functions write to the DOM only — they never mutate app state.
 */

import { escapeHtml } from "../utils/security.js";

// ─── Toast Notifications ────────────────────────────────────────────────────

/**
 * Show a transient toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 */
export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const ICONS = {
    info:    "fa6-solid:circle-info",
    success: "fa6-solid:circle-check",
    error:   "fa6-solid:circle-xmark",
    warning: "fa6-solid:triangle-exclamation",
  };

  toast.innerHTML = `
    <iconify-icon icon="${ICONS[type] ?? ICONS.info}"></iconify-icon>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Audit Terminal ──────────────────────────────────────────────────────────

/**
 * Append a line to the audit terminal panel.
 * @param {string} msg
 * @param {'info'|'warn'|'error'} type
 */
export function logToTerminal(msg, type = "info") {
  const terminal = document.getElementById("terminal-body");
  if (!terminal) return;

  const line = document.createElement("p");
  line.className = `terminal-line ${type}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] > ${msg}`;

  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

/**
 * Clear all lines from the audit terminal.
 */
export function clearTerminal() {
  const terminal = document.getElementById("terminal-body");
  if (terminal) {
    terminal.innerHTML = '<p class="terminal-line text-muted">> Log cleared.</p>';
  }
}

// ─── Network Console ─────────────────────────────────────────────────────────

/**
 * Append a REST / WebSocket log line to the live network console panel.
 * @param {string} method     GET | POST | PATCH | DELETE | WS
 * @param {string} path
 * @param {number} status     HTTP status code
 * @param {number} latencyMs
 * @param {string} [details]  Optional inline HTML (iconify tags allowed)
 */
export function logNetworkConsole(method, path, status = 200, latencyMs = 25, details = "") {
  const container = document.getElementById("network-console-body");
  if (!container) return;

  const ts = new Date().toLocaleTimeString();
  const line = document.createElement("p");
  line.className = "terminal-line";

  let statusClass = "text-success";
  if (status >= 400) statusClass = "text-danger";
  else if (status >= 300) statusClass = "text-warn";

  const METHOD_COLORS = {
    GET:    "#3b82f6",
    POST:   "#10b981",
    PATCH:  "#f59e0b",
    PUT:    "#f59e0b",
    DELETE: "#ef4444",
    WS:     "#a855f7",
  };
  const methodColor = METHOD_COLORS[method] ?? "#94a3b8";

  // `details` may contain safe iconify HTML — we only escape the user-controlled path
  line.innerHTML =
    `<span style="color:#64748b;">[${ts}]</span> ` +
    `<strong style="color:${methodColor};">${method}</strong> ` +
    `<code style="color:var(--text-primary);">${escapeHtml(path)}</code> ` +
    `<span class="${statusClass}">${status}</span> ` +
    `<small style="color:#64748b;">(${latencyMs}ms)</small>` +
    (details ? ` <span style="color:#94a3b8;">&mdash; ${details}</span>` : "");

  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

/**
 * Clear the network console panel.
 */
export function clearNetworkConsole() {
  const container = document.getElementById("network-console-body");
  if (container) {
    container.innerHTML =
      '<p class="terminal-line text-muted">&gt; Live REST network stream cleared.</p>';
  }
}

// ─── DB Status Badge ─────────────────────────────────────────────────────────

/**
 * Update the header database status badge.
 * @param {boolean} isOnline
 * @param {string} labelText
 * @param {string} providerText
 */
export function updateStatusBadge(isOnline, labelText, providerText) {
  const dot        = document.getElementById("db-pulse-dot");
  const text       = document.getElementById("db-status-text");
  const engineText = document.getElementById("db-active-engine-text");
  const providerEl = document.getElementById("db-provider-name");

  if (dot)        dot.className = `db-pulse-dot ${isOnline ? "online" : "offline"}`;
  if (text)       text.textContent = labelText;
  if (engineText) engineText.innerHTML =
    `<iconify-icon icon="fa6-solid:circle-check"></iconify-icon> ${escapeHtml(labelText)} Active`;
  if (providerEl) providerEl.textContent = providerText;
}

// ─── Button Loading State ────────────────────────────────────────────────────

/**
 * Toggle a button between its normal state and a loading spinner.
 * Expects `.btn-text` and `.btn-spinner` child elements in the button.
 * @param {HTMLElement} btn
 * @param {boolean} isLoading
 */
export function toggleButtonLoading(btn, isLoading) {
  if (!btn) return;
  const btnText    = btn.querySelector(".btn-text");
  const btnSpinner = btn.querySelector(".btn-spinner");

  btn.disabled = isLoading;
  btnText   ?.classList.toggle("hidden", isLoading);
  btnSpinner?.classList.toggle("hidden", !isLoading);
}
