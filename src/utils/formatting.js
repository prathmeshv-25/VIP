/**
 * Formatting Utilities
 * Pure functions for date formatting and display helpers.
 * No DOM access, no imports — safe to unit-test in isolation.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
];

/**
 * Convert an ISO date string (YYYY-MM-DD) to a human-readable form.
 * e.g. "2026-09-10" → "10 Sept 2026"
 * Falls back to returning the original string if parsing fails.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateForDisplay(dateStr) {
  if (!dateStr) return "";

  const parts = dateStr.split("-");
  if (parts.length === 3) {
    let year, monthIndex, day;

    if (parts[0].length === 4) {
      // YYYY-MM-DD
      year = parts[0];
      monthIndex = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      day = parseInt(parts[0], 10);
      monthIndex = parseInt(parts[1], 10) - 1;
      year = parts[2];
    }

    if (
      monthIndex >= 0 &&
      monthIndex < 12 &&
      !isNaN(day) &&
      day > 0
    ) {
      return `${day} ${MONTH_NAMES[monthIndex]} ${year}`;
    }
  }

  return dateStr;
}

/**
 * Derive a raw ISO date string (YYYY-MM-DD) from an event object.
 * Prefers `event.rawDate`, then parses `event.date` (display format).
 * @param {{ rawDate?: string, date?: string }} event
 * @returns {string}
 */
export function getRawDate(event) {
  if (event?.rawDate) return event.rawDate;
  if (event?.date) {
    const parts = event.date.split(" ");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const monthStr = parts[1];
      const year = parts[2];
      const mIdx = MONTH_NAMES.findIndex(
        (m) => m.toLowerCase() === monthStr.toLowerCase()
      );
      if (mIdx !== -1) {
        const month = String(mIdx + 1).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
  }
  return "";
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
  return Math.max(0, event.seats - event.registered);
}
