/**
 * Ticket & My Events UI (Phase 4 & Phase 4.1)
 *
 * Handles Student Dashboard header ("Hello, Rahul 👋"),
 * 3 key metrics (Registered Events, Upcoming, Completed),
 * MY EVENTS grid cards, and ticket receipt modal trigger.
 */

import { getState } from "../state/appState.js";
import { escapeHtml } from "../utils/security.js";
import { showToast } from "./notifications.js";
import { showConfirmationModal } from "./registration.js";

/**
 * Wire up the ticket lookup search button and Enter-key handler.
 */
export function setupTicketLookup() {
  const searchBtn = document.getElementById("lookup-ticket-btn");
  const inputEl   = document.getElementById("lookup-roll-number");

  if (searchBtn && inputEl) {
    searchBtn.addEventListener("click", () => performTicketLookup(inputEl.value));
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") performTicketLookup(inputEl.value);
    });
  }

  autoLookupForCurrentUser();
}

/**
 * Pre-fill roll number, calculate dashboard metrics, and render student's events.
 */
export function autoLookupForCurrentUser() {
  const { currentUser, profile, registrations } = getState();
  const inputEl = document.getElementById("lookup-roll-number");

  // 1. Student Dashboard Greeting Banner ("Hello, Rahul 👋")
  const name = profile?.full_name || currentUser?.fullName || currentUser?.name || "Student";
  const firstName = name.split(" ")[0] || "Student";

  const greetingEl = document.getElementById("student-dashboard-greeting");
  if (greetingEl) {
    greetingEl.textContent = `Hello, ${firstName} 👋`;
  }

  // 2. Filter registrations for current student
  const studentId   = currentUser?.id || null;
  const rollNumber  = profile?.roll_number || currentUser?.rollNumber || "";

  if (inputEl && rollNumber && !inputEl.value) {
    inputEl.value = rollNumber;
  }

  let studentRegs = [];
  if (studentId) {
    studentRegs = registrations.filter((r) => r.userId === studentId);
  }
  if (studentRegs.length === 0 && rollNumber) {
    const q = rollNumber.toLowerCase();
    studentRegs = registrations.filter((r) => (r.rollNumber || "").toLowerCase() === q);
  }

  // 3. Calculate Dashboard Metrics
  const totalCount = studentRegs.length;
  // Calculate completed vs upcoming (default fallback if empty sample data)
  let completedCount = 0;
  let upcomingCount  = totalCount;

  studentRegs.forEach((r) => {
    if (r.status === "completed") {
      completedCount++;
    } else if (r.eventDate) {
      // Check if date is in past (e.g. earlier than 2026-09-11)
      const d = new Date(r.eventDate);
      if (!isNaN(d.getTime()) && d < new Date("2026-09-11")) {
        completedCount++;
      }
    }
  });

  if (totalCount > 0 && completedCount > totalCount) {
    completedCount = 1;
  }
  upcomingCount = Math.max(0, totalCount - completedCount);

  // If user has registrations, update metric display
  const regCountEl = document.getElementById("stat-registered-count");
  const upCountEl  = document.getElementById("stat-upcoming-count");
  const compCountEl = document.getElementById("stat-completed-count");

  if (regCountEl)  regCountEl.textContent  = totalCount;
  if (upCountEl)   upCountEl.textContent   = upcomingCount;
  if (compCountEl) compCountEl.textContent = completedCount;

  // 4. Render My Events Cards
  renderMyEvents(studentRegs, rollNumber);
}

/**
 * Render MY EVENTS cards grid for the student.
 * @param {Array} studentRegs
 * @param {string} searchRollQuery
 */
export function renderMyEvents(studentRegs, searchRollQuery = "") {
  const container  = document.getElementById("lookup-results-container");
  const emptyState = document.getElementById("lookup-empty-state");

  if (!container) return;

  container.innerHTML = "";

  if (studentRegs.length === 0) {
    if (emptyState) {
      emptyState.classList.remove("hidden");
      const p = document.getElementById("empty-state-text") || emptyState.querySelector("p");
      if (p) {
        p.textContent = searchRollQuery
          ? `No registered events found for Roll Number "${searchRollQuery.toUpperCase()}".`
          : "You haven't registered for any events yet.";
      }
    }
    return;
  }

  emptyState?.classList.add("hidden");

  studentRegs.forEach((reg) => {
    const numericId = parseInt(String(reg.id || "").replace(/\D/g, ""), 10);
    const seatNum   = reg.seatNumber || reg.seat_number || (!isNaN(numericId) && numericId > 0 ? (numericId % 50) + 1 : 42);

    const card = document.createElement("div");
    card.className = "my-event-card";
    card.innerHTML = `
      <div>
        <div class="my-event-card-header">
          <h3 class="my-event-title">${escapeHtml(reg.eventName)}</h3>
        </div>
        <div class="my-event-date">
          <iconify-icon icon="fa6-regular:calendar-check"></iconify-icon> ${escapeHtml(reg.eventDate)}
        </div>
        <div class="my-event-seat">
          <iconify-icon icon="fa6-solid:chair"></iconify-icon> Seat: ${seatNum}
        </div>
      </div>
      <div class="my-event-footer">
        <span class="badge badge-success confirmed-badge">
          <iconify-icon icon="fa6-solid:check"></iconify-icon> Confirmed
        </span>
        <button class="btn btn-primary btn-sm view-ticket-btn" onclick="window._ehViewTicket('${escapeHtml(reg.id)}')">
          <iconify-icon icon="fa6-solid:ticket"></iconify-icon> View Ticket
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * Search registrations by roll number and render the results.
 * @param {string} rollQuery
 */
export function performTicketLookup(rollQuery) {
  const query = (rollQuery || "").trim().toLowerCase();

  if (!query) {
    showToast("Please enter a roll number to search", "warning");
    return;
  }

  const { registrations } = getState();
  const matches = registrations.filter(
    (r) => (r.rollNumber || "").toLowerCase() === query
  );

  renderMyEvents(matches, query);
}

/**
 * Show the confirmation modal / ticket pass for a registered ticket.
 * @param {string} regId
 */
export function viewTicketReceipt(regId) {
  const { registrations } = getState();
  const reg = registrations.find((r) => r.id === regId);
  if (reg) showConfirmationModal(reg);
}

