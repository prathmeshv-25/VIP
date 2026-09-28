/**
 * Security Utilities
 * Pure helper functions for sanitising data before it reaches the DOM or API queries.
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

/**
 * Sanitize input text by trimming, stripping script/html tags, and escaping quotes.
 * @param {any} str
 * @returns {string}
 */
export function sanitizeString(str) {
  if (str === null || str === undefined) return "";
  const cleaned = stripHtml(String(str)).trim();
  return escapeHtml(cleaned);
}

/**
 * Sanitize roll numbers (alphanumeric, hyphens, slashes only, uppercase).
 * @param {string} roll
 * @returns {string}
 */
export function sanitizeRollNumber(roll) {
  if (!roll) return "";
  return String(roll)
    .toUpperCase()
    .replace(/[^A-Z0-9\/-]/g, "")
    .trim();
}

/**
 * Safely parse integer values with fallback.
 * @param {any} val
 * @param {number} fallback
 * @returns {number}
 */
export function safeParseInt(val, fallback = 0) {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}
