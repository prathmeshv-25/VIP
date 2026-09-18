/**
 * Application State Store
 *
 * A minimal observable store that holds all runtime state.
 * UI modules subscribe to changes; service modules call setState() to update.
 * No direct global mutation — all changes flow through setState().
 */

const _state = {
  /** @type {Array<{id:number,name:string,date:string,rawDate:string,seats:number,registered:number}>} */
  events: [],

  /** @type {Array<{id:string,eventId:number,eventName:string,eventDate:string,studentName:string,rollNumber:string,timestamp:string,seatsLeftAfter:number}>} */
  registrations: [],

  /** Authenticated Supabase Auth user object: { id, email } or null */
  user: null,

  /** User profile record: { full_name, roll_number, role } or null */
  profile: null,

  /** Current active user role: 'student' | 'admin' | null */
  role: null,

  /** Session status flag */
  isAuthenticated: false,

  /** Legacy / combined user descriptor for backward compatibility */
  currentUser: null,

  /** Whether the Supabase client is connected and responding */
  supabaseOnline: false,

  /** Guard: prevents double-form-submission */
  isSubmitting: false,

  /** Last serialised snapshot — used by realtime to detect duplicate pushes */
  lastHash: "",
};

/** @type {Array<(state: typeof _state) => void>} */
const _listeners = [];

/**
 * Read current state (returns a shallow copy — do not mutate directly).
 */
export function getState() {
  return { ..._state };
}

/**
 * Read a single top-level key without cloning the full object.
 * Useful for reading arrays by reference inside service functions.
 */
export function readState(key) {
  return _state[key];
}

/**
 * Merge `patch` into state and notify all subscribers.
 * Only the listed keys are merged — other keys are left intact.
 * @param {Partial<typeof _state>} patch
 */
export function setState(patch) {
  Object.assign(_state, patch);
  _listeners.forEach((fn) => fn({ ..._state }));
}

/**
 * Register a subscriber that fires whenever setState() is called.
 * Returns an unsubscribe function.
 * @param {(state: typeof _state) => void} listener
 */
export function subscribe(listener) {
  _listeners.push(listener);
  return () => {
    const idx = _listeners.indexOf(listener);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}
