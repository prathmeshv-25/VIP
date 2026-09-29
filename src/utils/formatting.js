/**
 * Formatting Utilities (Phase 9.1 Date & Time Cleanup)
 * Pure functions for date/time formatting and display helpers.
 * No DOM access, no imports — safe to unit-test in isolation.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
];

const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Convert an ISO date string (YYYY-MM-DD) or TIMESTAMPTZ string to human-readable form.
 * e.g. "2026-09-28" or "2026-09-28T09:00:00+05:30" → "28 September 2026"
 * @param {string|Date} dateInput
 * @param {boolean} [useFullMonth=true]
 * @returns {string}
 */
export function formatDateForDisplay(dateInput, useFullMonth = true) {
  if (!dateInput) return "TBD";

  let year, monthIndex, day;

  if (dateInput instanceof Date) {
    year = dateInput.getFullYear();
    monthIndex = dateInput.getMonth();
    day = dateInput.getDate();
  } else {
    const str = String(dateInput).trim();
    // Check if ISO TIMESTAMPTZ or Date format (e.g. 2026-09-28T09:00:00)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      monthIndex = parseInt(isoMatch[2], 10) - 1;
      day = parseInt(isoMatch[3], 10);
    } else {
      const parts = str.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          monthIndex = parseInt(parts[1], 10) - 1;
          day = parseInt(parts[2], 10);
        } else if (parts[2].length === 4) {
          day = parseInt(parts[0], 10);
          monthIndex = parseInt(parts[1], 10) - 1;
          year = parseInt(parts[2], 10);
        }
      }
    }
  }

  if (year && monthIndex >= 0 && monthIndex < 12 && day > 0) {
    const months = useFullMonth ? FULL_MONTH_NAMES : MONTH_NAMES;
    return `${day} ${months[monthIndex]} ${year}`;
  }

  return String(dateInput);
}

/**
 * Format a time string or TIMESTAMPTZ to 12-hour format e.g. "09:00 AM"
 * @param {string|Date} timeInput
 * @returns {string}
 */
export function formatTimeForDisplay(timeInput) {
  if (!timeInput) return "09:00 AM";

  const str = String(timeInput).trim();

  // Already 12-hour format e.g. "09:00 AM"
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(str)) {
    return str.toUpperCase();
  }

  // ISO TIMESTAMPTZ string e.g. "2026-09-28T09:00:00+05:30" or Date
  const date = timeInput instanceof Date ? timeInput : new Date(str.includes("T") ? str : `1970-01-01T${str}`);
  if (!isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  return str;
}

/**
 * Format start & end times into a unified range display string e.g. "09:00 AM - 05:00 PM"
 * @param {string} startsAt
 * @param {string} endsAt
 * @returns {string}
 */
export function formatDateTimeRange(startsAt, endsAt) {
  const start = formatTimeForDisplay(startsAt || "09:00 AM");
  const end   = formatTimeForDisplay(endsAt   || "05:00 PM");
  return `${start} - ${end}`;
}

/**
 * Derive a raw ISO date string (YYYY-MM-DD) from an event object.
 * Prefers `event.eventDate` / `event.rawDate`, then parses `event.date`.
 * @param {object} event
 * @returns {string}
 */
export function getRawDate(event) {
  if (!event) return "";
  if (event.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)) return event.eventDate;
  if (event.rawDate && /^\d{4}-\d{2}-\d{2}$/.test(event.rawDate)) return event.rawDate;
  if (event.date) {
    const parts = String(event.date).split(" ");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const monthStr = parts[1];
      const year = parts[2];
      const mIdx = FULL_MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(monthStr.toLowerCase())) >= 0
        ? FULL_MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(monthStr.toLowerCase()))
        : MONTH_NAMES.findIndex((m) => m.toLowerCase() === monthStr.toLowerCase());
      if (mIdx !== -1) {
        const month = String(mIdx + 1).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
  }
  return "";
}

/**
 * Convert HTML date input (YYYY-MM-DD) and time input (09:00 AM or 09:00) to ISO TIMESTAMPTZ string.
 * @param {string} dateStr - e.g. "2026-09-28"
 * @param {string} timeStr - e.g. "09:00 AM" or "09:00"
 * @returns {string}
 */
export function toIsoTimestamp(dateStr, timeStr) {
  if (!dateStr) return new Date().toISOString();

  let hh = 9, mm = 0;
  if (timeStr) {
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (timeMatch) {
      hh = parseInt(timeMatch[1], 10);
      mm = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
      if (ampm === "PM" && hh < 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;
    }
  }

  const pad = (n) => String(n).padStart(2, "0");
  return `${dateStr}T${pad(hh)}:${pad(mm)}:00+05:30`;
}

/**
 * Format a JS Date object as a human-readable timestamp.
 * e.g. "02:45 PM (17/09/2026)"
 * @param {Date} [date]
 * @returns {string}
 */
export function formatTimestamp(date = new Date()) {
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const d = date.toLocaleDateString();
  return `${time} (${d})`;
}

/**
 * Return the number of available seats for an event.
 * Derived: seats - registered  (never negative).
 * @param {{ seats: number, registered: number }} event
 * @returns {number}
 */
export function getAvailableSeats(event) {
  if (!event) return 0;
  return Math.max(0, Number(event.seats || 0) - Number(event.registered || 0));
}

