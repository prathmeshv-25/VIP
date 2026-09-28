/**
 * Rate Limiter & Abuse Protection Utility (Phase 7.4)
 *
 * Implements client-side submission throttling, token bucket rate limiting,
 * and multi-click debouncing to protect RPC endpoints from spam and automated flooding.
 */

const _actionTimestamps = new Map();
const _debounceTimestamps = new Map();

/**
 * Check if an action exceeds rate limits within a rolling time window.
 *
 * @param {string} actionKey — Unique identifier (e.g. "register_event_1")
 * @param {number} maxRequests — Maximum allowed requests in window (default 5)
 * @param {number} windowMs — Time window in milliseconds (default 60,000 = 1 min)
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
 */
export function checkRateLimit(actionKey, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  let timestamps = _actionTimestamps.get(actionKey) || [];

  // Filter timestamps within current window
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  timestamps.push(now);
  _actionTimestamps.set(actionKey, timestamps);

  return {
    allowed: true,
    remaining: maxRequests - timestamps.length,
    retryAfterSec: 0,
  };
}

/**
 * Debounce guard to prevent rapid double-clicks (e.g., clicking "Register" 5 times in 1 second).
 *
 * @param {string} actionKey — Unique identifier (e.g. "submit_btn_reg")
 * @param {number} debounceMs — Lock duration in ms (default 2500ms)
 * @returns {boolean} — Returns true if execution is blocked (debounced), false if allowed.
 */
export function isDebounced(actionKey, debounceMs = 2500) {
  const now = Date.now();
  const lastTime = _debounceTimestamps.get(actionKey) || 0;

  if (now - lastTime < debounceMs) {
    return true; // Blocked! Double-click detected.
  }

  _debounceTimestamps.set(actionKey, now);
  return false; // Allowed!
}

/**
 * Clear rate limit tracking for an action key (e.g. upon successful authentication or reset).
 * @param {string} actionKey
 */
export function clearRateLimit(actionKey) {
  _actionTimestamps.delete(actionKey);
  _debounceTimestamps.delete(actionKey);
}
