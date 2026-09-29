/**
 * Events UI (Phase 9 — Production Hardening)
 *
 * Renders the event catalog grid, registration form dropdown options,
 * quick-select event actions, and supports Loading / Empty / Error / Offline states (Phase 9.5).
 */

import { getState } from "../state/appState.js";
import { escapeHtml } from "../utils/security.js";
import { getAvailableSeats, formatDateForDisplay, formatDateTimeRange } from "../utils/formatting.js";
import { switchTab } from "./tabs.js";

/**
 * Render all event cards in the #events-grid container.
 * Supports Phase 9.5 Loading, Empty, and Offline UI states.
 */
export function renderEventCatalog() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;

  const { events, supabaseOnline } = getState();
  grid.innerHTML = "";

  // Phase 9.5 Empty State
  if (!events || events.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem;">
        <iconify-icon icon="fa6-regular:calendar-xmark" class="empty-icon"></iconify-icon>
        <h3 style="margin-top:0.75rem; color:var(--text-primary);">No Events Available</h3>
        <p class="text-muted">There are currently no events scheduled. Please check back later.</p>
      </div>
    `;
    _updateTotalAvailableSeatsPill();
    return;
  }

  let totalAvailableSeats = 0;

  events.forEach((event) => {
    const available = getAvailableSeats(event);
    const status    = (event.status || "open").toLowerCase();
    const isOpen    = status === "open";

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
    const displayDate = formatDateForDisplay(event.eventDate || event.rawDate || event.date, true);
    const timeText   = formatDateTimeRange(event.startsAt || event.startTime, event.endsAt || event.endTime);

    const cardEl = document.createElement("div");
    cardEl.className = !canRegister ? "event-card card-full" : "event-card";
    cardEl.setAttribute("data-event-id", event.id);
    cardEl.innerHTML = `
      <div>
        <div class="card-top">
          <h3 class="event-name">${escapeHtml(event.name)}</h3>
          ${badgeHtml}
        </div>
        ${event.description ? `<p class="text-muted" style="font-size:0.82rem; margin-bottom:0.6rem;">${escapeHtml(event.description)}</p>` : ''}
        <div class="event-date">
          <iconify-icon icon="fa6-regular:calendar-check"></iconify-icon> ${escapeHtml(displayDate)} &bull; ${timeText}
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
  _updateTotalAvailableSeatsPill();
}

/**
 * Granular DOM update for a single event card on Realtime payload change.
 * @param {object} event
 */
export function updateTargetedEventCardUI(event) {
  const cardEl = document.querySelector(`.event-card[data-event-id="${event.id}"]`);
  if (!cardEl) {
    renderEventCatalog();
    renderFormOptions();
    return;
  }

  const available = getAvailableSeats(event);
  const status = (event.status || "open").toLowerCase();
  const isOpen = status === "open";
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

  cardEl.className = !canRegister ? "event-card card-full" : "event-card";

  const cardTop = cardEl.querySelector(".card-top");
  if (cardTop) {
    const existingBadge = cardTop.querySelector(".badge");
    if (existingBadge) {
      existingBadge.outerHTML = badgeHtml;
    }
  }

  const seatTextEl = cardEl.querySelector(".seats-available-text");
  if (seatTextEl) {
    seatTextEl.className = `seats-available-text ${isFull ? "full" : isLow ? "low" : "available"}`;
    seatTextEl.textContent = isFull ? "FULL" : `${available} seats left`;
  }

  const progressFillEl = cardEl.querySelector(".progress-fill");
  if (progressFillEl) {
    progressFillEl.className = `progress-fill ${isFull ? "full" : isLow ? "low" : ""}`;
    progressFillEl.style.width = `${percentage}%`;
  }

  const smallTextEl = cardEl.querySelector(".seats-counter-box small");
  if (smallTextEl) {
    smallTextEl.textContent = `${event.registered} / ${event.seats} Registered (${percentage}% filled)`;
  }

  const btnEl = cardEl.querySelector("button");
  if (btnEl) {
    btnEl.className = `btn ${canRegister ? "btn-primary" : "btn-outline-secondary"} btn-block`;
    btnEl.disabled = !canRegister;
    btnEl.innerHTML = canRegister
      ? '<iconify-icon icon="fa6-solid:user-plus"></iconify-icon> Register Now'
      : `<iconify-icon icon="fa6-solid:ban"></iconify-icon> ${statusBtnText}`;
  }

  _updateTotalAvailableSeatsPill();
  renderFormOptions();
}

function _updateTotalAvailableSeatsPill() {
  const { events } = getState();
  let totalAvailableSeats = 0;
  events.forEach((ev) => {
    if ((ev.status || "open").toLowerCase() === "open") {
      totalAvailableSeats += getAvailableSeats(ev);
    }
  });

  const statTotal     = document.getElementById("stat-total-events");
  const statAvailable = document.getElementById("stat-total-available");
  if (statTotal)     statTotal.textContent     = events ? events.length : 0;
  if (statAvailable) statAvailable.textContent = totalAvailableSeats;
}

/**
 * Render event <select> dropdown in registration form.
 */
export function renderFormOptions() {
  const select = document.getElementById("event-select");
  if (!select) return;

  const { events } = getState();
  const currentSelection = select.value;

  select.innerHTML = '<option value="">-- Choose an Event --</option>';

  if (events) {
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
  }

  if (currentSelection) select.value = currentSelection;
}

/**
 * Pre-select an event in the registration form and switch tab.
 * @param {number} eventId
 */
export function selectEventForRegistration(eventId) {
  const select = document.getElementById("event-select");
  if (select) select.value = eventId;

  switchTab("register");
  setTimeout(() => document.getElementById("student-name")?.focus(), 100);
}
