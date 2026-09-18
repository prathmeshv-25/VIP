/**
 * Events UI
 *
 * Renders the event catalog grid, the registration form dropdown,
 * and the quick-select "Register" button on each card.
 */

import { getState } from "../state/appState.js";
import { escapeHtml } from "../utils/security.js";
import { getAvailableSeats } from "../utils/formatting.js";
import { switchTab } from "./tabs.js";

/**
 * Render all event cards in the #events-grid container.
 * Also updates the header quick-stats (#stat-total-events, #stat-total-available).
 */
export function renderEventCatalog() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;

  const { events } = getState();
  grid.innerHTML = "";

  let totalAvailableSeats = 0;

  events.forEach((event) => {
    const available = getAvailableSeats(event);
    const status = (event.status || "open").toLowerCase();
    const isOpen = status === "open";

    if (isOpen) {
      totalAvailableSeats += available;
    }

    const isFull = available === 0;
    const isLow  = available > 0 && available <= 5;

    let badgeHtml = "";
    let statusBtnText = "";
    let canRegister = false;

    if (!isOpen) {
      if (status === "draft") {
        badgeHtml = `<span class="badge badge-status badge-status-draft"><iconify-icon icon="fa6-solid:file-pen"></iconify-icon> DRAFT</span>`;
        statusBtnText = "DRAFT (Preview Only)";
      } else if (status === "closed") {
        badgeHtml = `<span class="badge badge-status badge-status-closed"><iconify-icon icon="fa6-solid:lock"></iconify-icon> CLOSED</span>`;
        statusBtnText = "REGISTRATION CLOSED";
      } else if (status === "completed") {
        badgeHtml = `<span class="badge badge-status badge-status-completed"><iconify-icon icon="fa6-solid:flag-checkered"></iconify-icon> COMPLETED</span>`;
        statusBtnText = "EVENT FINISHED";
      } else if (status === "cancelled") {
        badgeHtml = `<span class="badge badge-status badge-status-cancelled"><iconify-icon icon="fa6-solid:ban"></iconify-icon> CANCELLED</span>`;
        statusBtnText = "EVENT CANCELLED";
      }
    } else if (isFull) {
      badgeHtml = `<span class="badge badge-danger"><iconify-icon icon="fa6-solid:lock"></iconify-icon> FULL</span>`;
      statusBtnText = "EVENT FULL";
    } else if (isLow) {
      badgeHtml = `<span class="badge badge-warning"><iconify-icon icon="fa6-solid:triangle-exclamation"></iconify-icon> FEW SEATS</span>`;
      statusBtnText = "Register Now";
      canRegister = true;
    } else {
      badgeHtml = `<span class="badge badge-success"><iconify-icon icon="fa6-solid:circle-check"></iconify-icon> OPEN</span>`;
      statusBtnText = "Register Now";
      canRegister = true;
    }

    const percentage = Math.min(100, Math.round((event.registered / event.seats) * 100));
    const venueText  = event.venue ? `${escapeHtml(event.venue)}` : "Main Auditorium";
    const timeText   = event.startTime ? `${escapeHtml(event.startTime)} - ${escapeHtml(event.endTime || '')}` : "09:00 AM - 05:00 PM";

    const cardEl = document.createElement("div");
    cardEl.className = !canRegister ? "event-card card-full" : "event-card";
    cardEl.innerHTML = `
      <div>
        <div class="card-top">
          <h3 class="event-name">${escapeHtml(event.name)}</h3>
          ${badgeHtml}
        </div>
        ${event.description ? `<p class="text-muted" style="font-size:0.82rem; margin-bottom:0.6rem;">${escapeHtml(event.description)}</p>` : ''}
        <div class="event-date">
          <iconify-icon icon="fa6-regular:calendar-check"></iconify-icon> ${escapeHtml(event.date)} &bull; ${timeText}
        </div>
        <div class="event-date" style="margin-top:0.2rem; font-size:0.8rem; color:var(--text-muted);">
          <iconify-icon icon="fa6-solid:location-dot"></iconify-icon> ${venueText}
        </div>
        <div class="seats-counter-box" style="margin-top:0.75rem;">
          <div class="seats-header">
            <span>Seat Availability</span>
            <span class="seats-available-text ${isFull ? "full" : isLow ? "low" : "available"}">
              ${isFull ? "FULL" : `${available} seats left`}
            </span>
          </div>
          <div class="seats-progress-bar">
            <div class="progress-fill ${isFull ? "full" : isLow ? "low" : ""}" style="width: ${percentage}%"></div>
          </div>
          <small class="text-muted" style="display:block; margin-top:0.4rem; font-size:0.75rem;">
            ${event.registered} / ${event.seats} Registered (${percentage}% filled)
          </small>
        </div>
      </div>
      <div style="margin-top:1rem;">
        <button
          class="btn ${canRegister ? "btn-primary" : "btn-outline-secondary"} btn-block"
          ${!canRegister ? "disabled" : ""}
          onclick="window._ehSelectEvent(${event.id})"
        >
          ${canRegister
            ? '<iconify-icon icon="fa6-solid:user-plus"></iconify-icon> Register Now'
            : `<iconify-icon icon="fa6-solid:ban"></iconify-icon> ${statusBtnText}`}
        </button>
      </div>
    `;

    grid.appendChild(cardEl);
  });

  // Header quick-stats
  const statTotal     = document.getElementById("stat-total-events");
  const statAvailable = document.getElementById("stat-total-available");
  if (statTotal)     statTotal.textContent     = events.length;
  if (statAvailable) statAvailable.textContent = totalAvailableSeats;
}

/**
 * Render the event <select> dropdown in the registration form.
 * Preserves the user's current selection if the event still exists.
 */
export function renderFormOptions() {
  const select = document.getElementById("event-select");
  if (!select) return;

  const { events } = getState();
  const currentSelection = select.value;

  select.innerHTML = '<option value="">-- Choose an Event --</option>';

  events.forEach((event) => {
    const available = getAvailableSeats(event);
    const status    = (event.status || "open").toLowerCase();
    const isOpen    = status === "open";
    const isFull    = available === 0;

    const opt = document.createElement("option");
    opt.value = event.id;

    if (!isOpen) {
      opt.textContent = `${event.name} — [${status.toUpperCase()}]`;
      opt.disabled = true;
    } else if (isFull) {
      opt.textContent = `${event.name} — (FULL)`;
      opt.disabled = true;
    } else {
      opt.textContent = `${event.name} — (${available} seats left)`;
    }

    select.appendChild(opt);
  });

  if (currentSelection) select.value = currentSelection;
}

/**
 * Pre-select an event in the registration form and switch to the Register tab.
 * Exposed on `window._ehSelectEvent` so inline onclick attributes can reach it.
 * @param {number} eventId
 */
export function selectEventForRegistration(eventId) {
  const select = document.getElementById("event-select");
  if (select) select.value = eventId;

  switchTab("register");
  setTimeout(() => document.getElementById("student-name")?.focus(), 100);
}
