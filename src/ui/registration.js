/**
 * Registration UI
 *
 * Handles the registration form, confirmation modal, and CSV export.
 */

import { getState, setState, readState } from "../state/appState.js";
import { validateRegistrationForm } from "../utils/validation.js";
import { formatTimestamp, getAvailableSeats } from "../utils/formatting.js";
import { escapeHtml } from "../utils/security.js";
import { registerForEvent } from "../services/registrationService.js";
import { showToast, logToTerminal, toggleButtonLoading } from "./notifications.js";
import { saveLocalState } from "../realtime/localPersistence.js";

/**
 * Wire up the registration form submit handler.
 * Includes double-click guard via `isSubmitting` state flag.
 */
export function setupFormHandler() {
  const form      = document.getElementById("registration-form");
  const submitBtn = document.getElementById("submit-reg-btn");
  const alertBox  = document.getElementById("form-alert");
  const alertMsg  = document.getElementById("form-alert-msg");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (readState("isSubmitting")) {
      logToTerminal("Double-click detected & blocked by submission lock!", "warn");
      return;
    }

    setState({ isSubmitting: true });
    toggleButtonLoading(submitBtn, true);
    alertBox?.classList.add("hidden");

    const name    = document.getElementById("student-name")?.value;
    const roll    = document.getElementById("roll-number")?.value;
    const eventId = document.getElementById("event-select")?.value;

    try {
      const result = await _handleRegistration(name, roll, eventId);

      if (!result.success) {
        if (alertBox && alertMsg) {
          alertMsg.textContent = result.error;
          alertBox.classList.remove("hidden");
        }
        showToast(result.error, "error");
        logToTerminal(`Registration failed: ${result.error}`, "error");
        return;
      }

      form.reset();
      showConfirmationModal(result.registration);
      showToast("Registration successful!", "success");
      logToTerminal(
        `Registered: ${result.registration.studentName} (${result.registration.rollNumber}) → ${result.registration.eventName}`,
        "info"
      );
    } finally {
      setState({ isSubmitting: false });
      toggleButtonLoading(submitBtn, false);
    }
  });
}

/**
 * Pre-fill registration form inputs with logged-in student info.
 */
export function populateStudentFormFromUser() {
  const { currentUser } = getState();
  if (!currentUser) return;

  const nameInput = document.getElementById("student-name");
  const rollInput = document.getElementById("roll-number");

  if (currentUser.fullName || currentUser.name) {
    if (nameInput) {
      nameInput.value = currentUser.fullName || currentUser.name;
    }
  }

  if (currentUser.rollNumber) {
    if (rollInput) {
      rollInput.value = currentUser.rollNumber;
    }
  }
}

/**
 * Core registration logic: validate → call service → update state.
 * @private
 */
async function _handleRegistration(studentName, rollNumber, eventId) {
  const { events, registrations, currentUser } = getState();

  const validation = validateRegistrationForm(
    studentName,
    rollNumber,
    eventId,
    events,
    registrations,
    currentUser?.id || null
  );

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { event, nameClean, rollClean } = validation;

  const regId    = "REG-" + Math.floor(1000 + Math.random() * 9000);
  const timestamp = formatTimestamp();

  const payload = {
    id:             regId,
    eventId:        event.id,
    eventName:      event.name,
    eventDate:      event.date,
    studentName:    nameClean,
    rollNumber:     rollClean,
    timestamp,
    seatsLeftAfter: Math.max(0, getAvailableSeats(event) - 1),
    userId:         currentUser?.id || null,
  };

  const result = await registerForEvent(payload);

  if (!result.success) {
    const rawMsg = result.error ?? "Booking failed. Please try again.";
    const tableMissing = /could not find the table.*schema cache/i.test(rawMsg) ||
                         result.error?.code === "PGRST205";
    const msg = tableMissing
      ? "Supabase setup incomplete — run the SQL setup script in the Database Settings panel, then refresh."
      : rawMsg;
    return { success: false, error: msg.includes("EVENT_FULL") ? `Event "${event.name}" is FULL!` : msg };
  }

  // Update in-memory state
  const updatedRegs   = [result.registration, ...registrations];
  const updatedEvents = events.map((ev) => {
    if (ev.id !== event.id) return ev;
    const newRegistered = result.registeredCount ?? ev.registered + 1;
    return { ...ev, registered: newRegistered };
  });

  setState({ events: updatedEvents, registrations: updatedRegs });
  saveLocalState(updatedEvents, updatedRegs);

  return { success: true, registration: result.registration };
}

// ─── Confirmation Modal ───────────────────────────────────────────────────────

/**
 * Populate and show the post-registration confirmation modal.
 * @param {{ id, studentName, rollNumber, eventName, eventDate, seatsLeftAfter, ticketCode }} reg
 */
export function showConfirmationModal(reg) {
  const modal = document.getElementById("confirmation-modal");
  if (!modal) return;

  const ticketCode  = reg.ticketCode || reg.ticket_code || reg.id;
  const studentName = reg.studentName || reg.student_name || "Student";
  const rollNumber  = reg.rollNumber || reg.roll_number || "N/A";
  const eventName   = reg.eventName || reg.event_name || "Event";
  const eventDate   = reg.eventDate || reg.event_date || "TBD";

  // Derive seat number for display (e.g., Seat: 42)
  const numericId = parseInt(String(reg.id || "").replace(/\D/g, ""), 10);
  const seatNum = reg.seatNumber || reg.seat_number || (!isNaN(numericId) && numericId > 0 ? (numericId % 50) + 1 : 42);

  const idEl        = document.getElementById("receipt-id");
  const nameEl      = document.getElementById("receipt-name");
  const rollEl      = document.getElementById("receipt-roll");
  const eventEl     = document.getElementById("receipt-event");
  const dateEl      = document.getElementById("receipt-date");
  const seatEl      = document.getElementById("receipt-seat");
  const qrImg       = document.getElementById("receipt-qr-image");
  const seatsLeftEl = document.getElementById("receipt-seats-left");

  if (idEl)        idEl.textContent        = ticketCode;
  if (nameEl)      nameEl.textContent      = studentName;
  if (rollEl)      rollEl.textContent      = rollNumber;
  if (eventEl)     eventEl.textContent     = eventName;
  if (dateEl)      dateEl.textContent      = eventDate;
  if (seatEl)      seatEl.textContent      = `Seat: ${seatNum}`;
  if (seatsLeftEl) seatsLeftEl.textContent = `${reg.seatsLeftAfter ?? 0} seats remaining`;

  if (qrImg) {
    const qrPayload = `EVENTHUB|${eventName}|${studentName}|${rollNumber}|SEAT:${seatNum}|TICKET:${ticketCode}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}`;
  }

  modal.classList.remove("hidden");
}


/**
 * Hide the confirmation modal.
 */
export function hideConfirmationModal() {
  document.getElementById("confirmation-modal")?.classList.add("hidden");
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/**
 * Export all registrations as a downloadable CSV file.
 */
export function exportRegistrationsCSV() {
  const { registrations } = getState();

  if (registrations.length === 0) {
    showToast("No registration data to export", "warning");
    return;
  }

  let csv = "data:text/csv;charset=utf-8,ID,Student Name,Roll Number,Event Name,Event Date,Timestamp\n";
  registrations.forEach((r) => {
    csv += `"${r.id}","${r.studentName}","${r.rollNumber}","${r.eventName}","${r.eventDate}","${r.timestamp}"\n`;
  });

  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csv));
  link.setAttribute("download", `registrations_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Registrations exported to CSV!", "success");
}
