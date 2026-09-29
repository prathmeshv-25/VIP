/**
 * Standardized Error Handling Module (Phase 9.4)
 *
 * Categorizes system and network errors into standard error types:
 *  - Database error
 *  - Auth error
 *  - Network error
 *  - Validation error
 *  - Permission error
 *  - Concurrency error
 *
 * Maps technical backend/database details to clean, user-friendly UI messages.
 */

export const ERROR_CODES = {
  // Database / RPC Errors
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  EVENT_FULL:         "EVENT_FULL",
  EVENT_NOT_OPEN:     "EVENT_NOT_OPEN",
  EVENT_NOT_FOUND:    "EVENT_NOT_FOUND",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  DB_QUERY_FAILED:    "DB_QUERY_FAILED",

  // Auth Errors
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  EMAIL_TAKEN:         "EMAIL_TAKEN",
  ROLL_NUMBER_TAKEN:   "ROLL_NUMBER_TAKEN",
  SESSION_EXPIRED:     "SESSION_EXPIRED",
  USER_NOT_FOUND:      "USER_NOT_FOUND",

  // Permission Errors
  PERMISSION_DENIED:  "PERMISSION_DENIED",
  ADMIN_REQUIRED:     "ADMIN_REQUIRED",

  // Concurrency & Rate Limit Errors
  CONCURRENCY_LOCK:   "CONCURRENCY_LOCK",
  RATE_LIMIT_EXCEEDED:"RATE_LIMIT_EXCEEDED",

  // Validation Errors
  VALIDATION_FAILED:  "VALIDATION_FAILED",

  // Network Errors
  NETWORK_OFFLINE:    "NETWORK_OFFLINE",
  SERVICE_UNAVAILABLE:"SERVICE_UNAVAILABLE",
  UNKNOWN_ERROR:      "UNKNOWN_ERROR",
};

/**
 * Maps standard error codes or raw Supabase/JS error objects to user-friendly UI strings.
 * @param {Error|object|string} err
 * @returns {string}
 */
export function getFriendlyErrorMessage(err) {
  if (!err) return "An unexpected error occurred. Please try again.";

  const rawMessage = typeof err === "string" ? err : err.message || err.error_description || "";
  const code = err.code || "";

  // 1. Check direct error code matches
  if (rawMessage.includes("ALREADY_REGISTERED") || rawMessage.includes("registrations_event_user_unique") || rawMessage.includes("registrations_event_roll_unique") || rawMessage.includes("duplicate key")) {
    return "You are already registered for this event.";
  }
  if (rawMessage.includes("EVENT_FULL") || rawMessage.includes("events_registered_check")) {
    return "This event is completely full. No seats remaining.";
  }
  if (rawMessage.includes("EVENT_NOT_OPEN")) {
    return "This event is currently closed or not open for registration.";
  }
  if (rawMessage.includes("EVENT_NOT_FOUND")) {
    return "The requested event could not be found.";
  }
  if (rawMessage.includes("INVALID_TRANSITION")) {
    return "This status change is not allowed by the event lifecycle rules.";
  }

  // 2. Auth errors
  if (rawMessage.includes("Invalid login credentials") || rawMessage.includes("invalid_grant")) {
    return "Invalid email or password. Please check your credentials and try again.";
  }
  if (rawMessage.includes("profiles_email_unique") || rawMessage.includes("User already registered")) {
    return "An account with this email address already exists.";
  }
  if (rawMessage.includes("profiles_roll_number_key") || rawMessage.includes("roll_number_unique")) {
    return "This roll number is already registered to another student.";
  }
  if (rawMessage.includes("JWT expired") || rawMessage.includes("invalid claim")) {
    return "Your session has expired. Please log in again.";
  }

  // 3. Permission errors
  if (rawMessage.includes("permission denied") || rawMessage.includes("403") || code === "42501") {
    return "Permission denied. You do not have administrator rights for this action.";
  }

  // 4. Rate Limiting / Concurrency errors
  if (rawMessage.includes("Submission in progress") || rawMessage.includes("CONCURRENCY_LOCK")) {
    return "A registration request is already processing. Please wait a moment.";
  }
  if (rawMessage.includes("Too many registration attempts") || rawMessage.includes("rate_limit")) {
    return rawMessage;
  }
  if (rawMessage.includes("Email rate limit exceeded")) {
    return "Security limit: Too many email requests sent. Please try again in an hour.";
  }

  // 5. Network / Offline errors
  if (rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError") || rawMessage.includes("offline")) {
    return "Network error: Unable to connect to database. Please check your connection.";
  }

  // Default fallback
  return rawMessage || "Operation failed. Please try again.";
}

/**
 * Custom Error Class for EventHub standard errors.
 */
export class AppError extends Error {
  /**
   * @param {string} code - ERROR_CODES key
   * @param {string} [customMessage]
   */
  constructor(code, customMessage) {
    const msg = customMessage || getFriendlyErrorMessage(code);
    super(msg);
    this.code = code;
    this.friendlyMessage = msg;
  }
}
