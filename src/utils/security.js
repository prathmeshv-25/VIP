/**
 * Security Utilities
 * Pure helper functions for sanitising data before it reaches the DOM.
 */

/**
 * Escape HTML special characters to prevent XSS when injecting
 * user-supplied strings into innerHTML.
 * @param {any} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Strip all HTML tags from a string (basic sanitisation for display text).
 * @param {string} str
 * @returns {string}
 */
export function stripHtml(str) {
  if (!str) return "";
  return String(str).replace(/<[^>]*>/g, "");
}
