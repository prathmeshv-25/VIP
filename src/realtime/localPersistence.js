/**
 * Local Persistence Helpers
 *
 * Thin wrappers around localStorage for events and registrations.
 * Used as a fallback layer and as a cross-tab sync signal.
 */

const STORAGE_KEY_EVENTS         = "ps4_events_v1";
const STORAGE_KEY_REGISTRATIONS  = "ps4_registrations_v1";

/**
 * Persist current state to localStorage.
 * @param {Array} events
 * @param {Array} registrations
 */
export function saveLocalState(events, registrations) {
  try {
    localStorage.setItem(STORAGE_KEY_EVENTS,        JSON.stringify(events));
    localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(registrations));
    localStorage.setItem("ps4_last_update",         String(Date.now()));
  } catch (e) {
    // Storage might be full or blocked — fail silently
  }
}

/**
 * Load events from localStorage.
 * @returns {Array | null}
 */
export function loadLocalEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Load registrations from localStorage.
 * @returns {Array | null}
 */
export function loadLocalRegistrations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTRATIONS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
