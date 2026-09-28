/**
 * Form Validation Utilities (Phase 7 Hardened Input Validation)
 * Pure functions — no DOM access, no side effects.
 * Each function returns { valid: boolean, error?: string }.
 */

/** Only letters, spaces, hyphens, and apostrophes are allowed in student names. */
const NAME_REGEX = /^[A-Za-z\s'\-]+$/;

/** Standard RFC email format pattern */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Roll number pattern: alphanumeric, min 3 chars */
const ROLL_REGEX = /^[A-Za-z0-9\/-]{3,20}$/;

/**
 * Validate Student Full Name.
 * @param {string} name
 * @returns {{ valid: boolean, error?: string, cleanName?: string }}
 */
export function validateName(name) {
  const clean = (name || "").trim();
  if (!clean) {
    return { valid: false, error: "Please enter your name" };
  }
  if (clean.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters long" };
  }
  if (clean.length > 60) {
    return { valid: false, error: "Name cannot exceed 60 characters" };
  }
  if (!NAME_REGEX.test(clean)) {
    return { valid: false, error: "Invalid Name: Only letters, spaces, hyphens allowed" };
  }
  return { valid: true, cleanName: clean };
}

/**
 * Validate Email address format.
 * @param {string} email
 * @returns {{ valid: boolean, error?: string, cleanEmail?: string }}
 */
export function validateEmail(email) {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) {
    return { valid: false, error: "Please enter an email address" };
  }
  if (!EMAIL_REGEX.test(clean)) {
    return { valid: false, error: "Please enter a valid email address (e.g. student@college.edu)" };
  }
  return { valid: true, cleanEmail: clean };
}

/**
 * Validate Student Roll Number.
 * @param {string} roll
 * @returns {{ valid: boolean, error?: string, cleanRoll?: string }}
 */
export function validateRollNumber(roll) {
  const clean = (roll || "").trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: "Please enter roll number" };
  }
  if (!ROLL_REGEX.test(clean)) {
    return { valid: false, error: "Invalid Roll Number: Must be 3-20 alphanumeric characters (e.g. CS101)" };
  }
  return { valid: true, cleanRoll: clean };
}

/**
 * Validate Account Password strength.
 * @param {string} password
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Please enter a password" };
  }
  if (password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters long" };
  }
  return { valid: true };
}

/**
 * Validate Auth Form Inputs (Login / Signup).
 * @param {string} email
 * @param {string} password
 * @param {boolean} isSignup
 * @param {string} fullName
 * @param {string} rollNumber
 * @returns {{ valid: boolean, error?: string, cleanEmail?: string, cleanName?: string, cleanRoll?: string }}
 */
export function validateAuthForm(email, password, isSignup = false, fullName = "", rollNumber = "") {
  const emailRes = validateEmail(email);
  if (!emailRes.valid) return emailRes;

  const passRes = validatePassword(password);
  if (!passRes.valid) return passRes;

  if (isSignup) {
    const nameRes = validateName(fullName);
    if (!nameRes.valid) return nameRes;

    const rollRes = validateRollNumber(rollNumber);
    if (!rollRes.valid) return rollRes;

    return {
      valid: true,
      cleanEmail: emailRes.cleanEmail,
      cleanName: nameRes.cleanName,
      cleanRoll: rollRes.cleanRoll,
    };
  }

  return { valid: true, cleanEmail: emailRes.cleanEmail };
}

/**
 * Validate the student registration form fields.
 *
 * @param {string} studentName
 * @param {string} rollNumber
 * @param {number|string} eventId
 * @param {Array<{id:number,seats:number,registered:number,name:string,status?:string}>} events
 * @param {Array<{eventId:number,rollNumber:string,userId?:string}>} registrations
 * @param {string|null} userId
 * @returns {{ valid: boolean, error?: string, event?: object, nameClean?: string, rollClean?: string }}
 */
export function validateRegistrationForm(
  studentName,
  rollNumber,
  eventId,
  events,
  registrations,
  userId = null
) {
  const nameRes = validateName(studentName);
  if (!nameRes.valid) return nameRes;

  const rollRes = validateRollNumber(rollNumber);
  if (!rollRes.valid) return rollRes;

  const parsedEventId = parseInt(eventId, 10);
  if (isNaN(parsedEventId) || !parsedEventId) {
    return { valid: false, error: "Please select an event" };
  }

  const event = events.find((e) => e.id === parsedEventId);
  if (!event) {
    return { valid: false, error: "Invalid event selected" };
  }

  // Phase 5.1 Lifecycle State Guard
  if (event.status && event.status.toLowerCase() !== "open") {
    const statusLabel = event.status.toUpperCase();
    return {
      valid: false,
      error: `Event "${event.name}" is currently ${statusLabel} and not open for registration.`,
    };
  }

  const available = Math.max(0, event.seats - event.registered);
  if (event.registered >= event.seats || available <= 0) {
    return { valid: false, error: `Event "${event.name}" is FULL!` };
  }

  const isDuplicate = registrations.some(
    (r) =>
      r.eventId === parsedEventId &&
      ((userId && r.userId && r.userId === userId) ||
       (rollRes.cleanRoll && (r.rollNumber || "").toLowerCase() === rollRes.cleanRoll.toLowerCase()))
  );
  if (isDuplicate) {
    return {
      valid: false,
      error: "You are already registered for this event.",
    };
  }

  return { valid: true, event, nameClean: nameRes.cleanName, rollClean: rollRes.cleanRoll };
}

/**
 * Validate the add/edit event form fields.
 *
 * @param {string} name
 * @param {string} date        ISO date string (YYYY-MM-DD)
 * @param {number|string} seats
 * @param {Array<{id:number,name:string}>} existingEvents
 * @param {number|null} editingId   Pass the ID being edited so the duplicate check skips itself
 * @returns {{ valid: boolean, error?: string, nameClean?: string, dateClean?: string, seatsNum?: number }}
 */
export function validateEventForm(name, date, seats, existingEvents, editingId = null) {
  const nameClean = (name || "").trim();
  const dateClean = (date || "").trim();
  const seatsNum = parseInt(seats, 10);

  if (!nameClean) {
    return { valid: false, error: "Please enter an event name." };
  }
  if (nameClean.length < 2 || nameClean.length > 100) {
    return { valid: false, error: "Event name must be between 2 and 100 characters." };
  }

  if (!dateClean) {
    return { valid: false, error: "Please select an event date from the calendar." };
  }

  if (isNaN(seatsNum) || seatsNum <= 0) {
    return {
      valid: false,
      error: "Total seats capacity must be a number greater than 0.",
    };
  }
  if (seatsNum > 10000) {
    return { valid: false, error: "Total seats capacity cannot exceed 10,000." };
  }

  const isDuplicate = existingEvents.some(
    (e) =>
      e.id !== editingId &&
      e.name.toLowerCase() === nameClean.toLowerCase()
  );
  if (isDuplicate) {
    return {
      valid: false,
      error: `An event named "${nameClean}" already exists.`,
    };
  }

  return { valid: true, nameClean, dateClean, seatsNum };
}
