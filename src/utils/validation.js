/**
 * Form Validation Utilities
 * Pure functions — no DOM access, no side effects.
 * Each function returns { valid: boolean, error?: string }.
 */

/** Only letters and spaces are allowed in student names. */
const NAME_REGEX = /^[A-Za-z\s]+$/;

/**
 * Validate the student registration form fields.
 *
 * @param {string} studentName
 * @param {string} rollNumber
 * @param {number|string} eventId
 * @param {Array<{id:number,seats:number,registered:number,name:string}>} events
 * @param {Array<{eventId:number,rollNumber:string}>} registrations
 * @returns {{ valid: boolean, error?: string, event?: object }}
 */
export function validateRegistrationForm(
  studentName,
  rollNumber,
  eventId,
  events,
  registrations,
  userId = null
) {
  const nameClean = (studentName || "").trim();
  const rollClean = (rollNumber || "").trim();
  const parsedEventId = parseInt(eventId, 10);

  if (!nameClean) {
    return { valid: false, error: "Please enter your name" };
  }

  if (!NAME_REGEX.test(nameClean)) {
    return {
      valid: false,
      error: "Invalid Name: Only letters and spaces are allowed",
    };
  }

  if (!rollClean) {
    return { valid: false, error: "Please enter roll number" };
  }

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
       (rollClean && r.rollNumber.toLowerCase() === rollClean.toLowerCase()))
  );
  if (isDuplicate) {
    return {
      valid: false,
      error: "You are already registered for this event.",
    };
  }

  return { valid: true, event, nameClean, rollClean };
}

/**
 * Validate the add/edit event form fields.
 *
 * @param {string} name
 * @param {string} date        ISO date string (YYYY-MM-DD)
 * @param {number|string} seats
 * @param {Array<{id:number,name:string}>} existingEvents
 * @param {number|null} editingId   Pass the ID being edited so the duplicate check skips itself
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEventForm(name, date, seats, existingEvents, editingId = null) {
  const nameClean = (name || "").trim();
  const dateClean = (date || "").trim();
  const seatsNum = parseInt(seats, 10);

  if (!nameClean) {
    return { valid: false, error: "Please enter an event name." };
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
