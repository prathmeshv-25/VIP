/**
 * Admin Dashboard UI (Phase 5 & Phase 5.1)
 *
 * Renders Admin Sub-dashboards (Overview, Events, Registrations, Students, Tickets, Audit Logs),
 * Event CRUD with Lifecycle State Transitions (DRAFT, OPEN, CLOSED, COMPLETED, CANCELLED),
 * Students Directory, and Issued Tickets Registry.
 */

import { getState, setState } from "../state/appState.js";
import { validateEventForm } from "../utils/validation.js";
import { formatDateForDisplay, getRawDate, getAvailableSeats } from "../utils/formatting.js";
import { escapeHtml } from "../utils/security.js";
import {
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
} from "../services/eventService.js";
import { cancelRegistration } from "../services/registrationService.js";
import { showToast, logToTerminal } from "./notifications.js";
import { saveLocalState } from "../realtime/localPersistence.js";
import { showConfirmationModal } from "./registration.js";

// ─── Admin Sub-navigation ───────────────────────────────────────────────────

/**
 * Setup Admin Sub-navigation tabs (Overview, Events, Registrations, Students, Tickets, Audit Logs).
 */
export function setupAdminSubnav() {
  const tabs = document.querySelectorAll(".admin-nav-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetSubtab = tab.getAttribute("data-subtab");
      if (!targetSubtab) return;

      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".admin-subview").forEach((view) => {
        view.classList.toggle("hidden", view.id !== `subtab-${targetSubtab}`);
      });
    });
  });

  _setupSearchListeners();
}

/** @private */
function _setupSearchListeners() {
  document.getElementById("table-search")?.addEventListener("input", renderRegistrationsTable);
  document.getElementById("table-filter-event")?.addEventListener("change", renderRegistrationsTable);
  document.getElementById("student-dir-search")?.addEventListener("input", renderStudentsTable);
  document.getElementById("ticket-log-search")?.addEventListener("input", renderTicketsTable);
}

// ─── Dashboard Metrics & Event Breakdown ─────────────────────────────────────

/**
 * Render admin dashboard metrics, event CRUD breakdown, students directory, and ticket logs.
 */
export function renderAdminDashboard() {
  const { events, registrations } = getState();

  // 1. Top metrics
  let totalCapacity = 0, totalRegistered = 0, totalAvailable = 0;
  events.forEach((e) => {
    totalCapacity   += e.seats;
    totalRegistered += e.registered;
    totalAvailable  += getAvailableSeats(e);
  });

  _setText("admin-metric-events",     events.length);
  _setText("admin-metric-capacity",   totalCapacity);
  _setText("admin-metric-registered", totalRegistered);
  _setText("admin-metric-available",  totalAvailable);

  // 2. Render Event Lifecycle Cards Grid
  _renderEventsGrid(events);

  // 3. Filter dropdown
  const filterSelect = document.getElementById("table-filter-event");
  if (filterSelect) {
    const current = filterSelect.value || "ALL";
    filterSelect.innerHTML = '<option value="ALL">All Events</option>';
    events.forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.name;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = current;
  }

  // 4. Render all subview tables
  renderRegistrationsTable();
  renderStudentsTable();
  renderTicketsTable();
}

/** @private */
function _renderEventsGrid(events) {
  const grid = document.getElementById("admin-events-list");
  if (!grid) return;

  grid.innerHTML = "";
  events.forEach((e) => {
    const avail  = getAvailableSeats(e);
    const isFull = avail === 0;
    const pct    = Math.round((e.registered / e.seats) * 100);
    const status = (e.status || "open").toLowerCase();

    const box = document.createElement("div");
    box.className = "admin-event-box";
    box.innerHTML = `
      <div class="admin-event-title" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
        <div>
          <strong style="font-size:1.1rem; color:var(--text-primary);">${escapeHtml(e.name)}</strong>
          ${e.description ? `<p class="text-muted" style="font-size:0.8rem; margin-top:0.25rem;">${escapeHtml(e.description)}</p>` : ""}
        </div>
        <span class="badge badge-status badge-status-${status}">
          <iconify-icon icon="${_getStatusIcon(status)}"></iconify-icon> ${status.toUpperCase()}
        </span>
      </div>

      <div class="admin-stats-line" style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:0.6rem;">
        <iconify-icon icon="fa6-regular:calendar-days"></iconify-icon> ${escapeHtml(e.date || "TBD")} &bull; ${escapeHtml(e.startTime || '09:00 AM')} &bull; ${escapeHtml(e.venue || 'Main Auditorium')}
      </div>

      <div class="seats-progress-bar" style="height:6px; margin-bottom:0.5rem;">
        <div class="progress-fill ${isFull ? "full" : ""}" style="width:${pct}%"></div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-muted); margin-bottom:0.85rem;">
        <span>${e.registered} / ${e.seats} Capacity (${pct}%)</span>
        <strong style="color:${isFull ? "var(--color-danger)" : "var(--color-success)"}">
          ${isFull ? "FULL" : `${avail} Seats Left`}
        </strong>
      </div>

      <div class="admin-event-actions" style="display:flex; gap:0.5rem; justify-content:space-between; flex-wrap:wrap; border-top:1px dashed var(--border-color); padding-top:0.6rem;">
        <!-- Lifecycle Transition Dropdown -->
        <select class="form-control form-control-sm select-control" style="width:auto; font-size:0.75rem; padding:0.25rem 0.5rem;"
                onchange="window._ehTransitionStatus(${e.id}, this.value)">
          <option value="draft" ${status === "draft" ? "selected" : ""}>State: DRAFT</option>
          <option value="open" ${status === "open" ? "selected" : ""}>State: OPEN</option>
          <option value="closed" ${status === "closed" ? "selected" : ""}>State: CLOSED</option>
          <option value="completed" ${status === "completed" ? "selected" : ""}>State: COMPLETED</option>
          <option value="cancelled" ${status === "cancelled" ? "selected" : ""}>State: CANCELLED</option>
        </select>

        <div style="display:flex; gap:0.4rem;">
          <button class="btn btn-sm btn-outline-secondary"
                  onclick="window._ehOpenEditEvent(${e.id})" title="Edit event details">
            <iconify-icon icon="fa6-solid:pen-to-square"></iconify-icon> Edit
          </button>
          <button class="btn btn-sm btn-outline-danger"
                  onclick="window._ehConfirmDelete(${e.id})" title="Delete event">
            <iconify-icon icon="fa6-solid:trash-can"></iconify-icon> Delete
          </button>
        </div>
      </div>
    `;
    grid.appendChild(box);
  });
}

function _getStatusIcon(status) {
  switch (status) {
    case "draft":     return "fa6-solid:file-pen";
    case "open":      return "fa6-solid:circle-check";
    case "closed":    return "fa6-solid:lock";
    case "completed": return "fa6-solid:flag-checkered";
    case "cancelled": return "fa6-solid:ban";
    default:          return "fa6-solid:circle-info";
  }
}

// ─── Lifecycle Transition Handler ─────────────────────────────────────────────

/**
 * Handle quick status transition dropdown change for an event.
 * @param {number} eventId
 * @param {string} newStatus
 */
export async function handleStatusTransition(eventId, newStatus) {
  const { events } = getState();
  const event = events.find((e) => e.id === eventId);
  if (!event) return;

  const oldStatus = event.status || "open";
  const statusClean = newStatus.toLowerCase();

  if (oldStatus === statusClean) return;

  const updatedEvents = events.map((e) => (e.id === eventId ? { ...e, status: statusClean } : e));
  setState({ events: updatedEvents });
  saveLocalState(updatedEvents, getState().registrations);

  await updateEventStatus(eventId, statusClean);
  renderAdminDashboard();

  showToast(`Event "${event.name}" state updated to ${statusClean.toUpperCase()}`, "info");
  logToTerminal(`Event ${eventId} (${event.name}) transitioned: ${oldStatus.toUpperCase()} → ${statusClean.toUpperCase()}`, "info");
}

// ─── Registrations Table ──────────────────────────────────────────────────────

/**
 * Render the filterable/searchable registrations data table.
 */
export function renderRegistrationsTable() {
  const tbody      = document.getElementById("registrations-table-body");
  const emptyState = document.getElementById("empty-table-state");
  if (!tbody) return;

  const { registrations } = getState();
  const query    = (document.getElementById("table-search")?.value || "").toLowerCase().trim();
  const filterEv = (document.getElementById("table-filter-event")?.value || "ALL");

  const filtered = registrations.filter((r) => {
    const matchSearch =
      r.studentName.toLowerCase().includes(query) ||
      r.rollNumber.toLowerCase().includes(query)  ||
      r.id.toLowerCase().includes(query);
    const matchEvent = filterEv === "ALL" || r.eventId.toString() === filterEv;
    return matchSearch && matchEvent;
  });

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    emptyState?.classList.remove("hidden");
    return;
  }
  emptyState?.classList.add("hidden");

  filtered.forEach((reg, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><code>${escapeHtml(reg.ticketCode || reg.id)}</code></td>
      <td><strong>${escapeHtml(reg.studentName)}</strong></td>
      <td><code>${escapeHtml(reg.rollNumber)}</code></td>
      <td>${escapeHtml(reg.eventName)}</td>
      <td class="text-muted" style="font-size:0.8rem;">${escapeHtml(reg.timestamp)}</td>
      <td>
        <button class="btn btn-sm btn-outline-danger"
                onclick="window._ehCancelReg('${escapeHtml(reg.id)}')"
                title="Cancel & refund seat">
          <iconify-icon icon="fa6-solid:trash-can"></iconify-icon> Cancel
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Students Directory Table ─────────────────────────────────────────────────

/**
 * Render the Students Directory table.
 */
export function renderStudentsTable() {
  const tbody      = document.getElementById("students-table-body");
  const emptyState = document.getElementById("empty-students-state");
  if (!tbody) return;

  const { registrations } = getState();
  const query = (document.getElementById("student-dir-search")?.value || "").toLowerCase().trim();

  // Aggregate student stats from registrations
  const studentMap = new Map();
  registrations.forEach((r) => {
    const key = r.rollNumber.toLowerCase();
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        name: r.studentName,
        roll: r.rollNumber,
        count: 0,
        lastEvent: r.eventName,
      });
    }
    const student = studentMap.get(key);
    student.count += 1;
    student.lastEvent = r.eventName;
  });

  const students = Array.from(studentMap.values()).filter((s) =>
    s.name.toLowerCase().includes(query) || s.roll.toLowerCase().includes(query)
  );

  tbody.innerHTML = "";

  if (students.length === 0) {
    emptyState?.classList.remove("hidden");
    return;
  }
  emptyState?.classList.add("hidden");

  students.forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td><code>${escapeHtml(s.roll)}</code></td>
      <td><span class="badge badge-primary">${s.count} Events</span></td>
      <td>${escapeHtml(s.lastEvent)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Tickets Verification Table ───────────────────────────────────────────────

/**
 * Render Issued Tickets & Verification Registry table.
 */
export function renderTicketsTable() {
  const tbody = document.getElementById("tickets-table-body");
  if (!tbody) return;

  const { registrations } = getState();
  const query = (document.getElementById("ticket-log-search")?.value || "").toLowerCase().trim();

  const filtered = registrations.filter((r) => {
    const code = (r.ticketCode || r.id).toLowerCase();
    const name = r.studentName.toLowerCase();
    const roll = r.rollNumber.toLowerCase();
    return code.includes(query) || name.includes(query) || roll.includes(query);
  });

  tbody.innerHTML = "";

  filtered.forEach((reg) => {
    const code = reg.ticketCode || reg.id;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code style="color:var(--accent-primary); font-weight:700;">${escapeHtml(code)}</code></td>
      <td>${escapeHtml(reg.eventName)}</td>
      <td><strong>${escapeHtml(reg.studentName)}</strong></td>
      <td><code>${escapeHtml(reg.rollNumber)}</code></td>
      <td><span class="badge badge-success"><iconify-icon icon="fa6-solid:circle-check"></iconify-icon> VALID</span></td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="window._ehViewTicket('${escapeHtml(reg.id)}')">
          <iconify-icon icon="fa6-solid:qrcode"></iconify-icon> View Ticket
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Cancel Registration ──────────────────────────────────────────────────────

/**
 * Cancel a student registration and return the seat to the event.
 * @param {string} regId
 */
export async function handleCancelRegistration(regId) {
  const { events, registrations } = getState();

  const idx = registrations.findIndex((r) => r.id === regId);
  if (idx === -1) return;

  const reg   = registrations[idx];
  const event = events.find((e) => e.id === reg.eventId);

  const updatedEvents = events.map((e) => {
    if (e.id !== reg.eventId) return e;
    return { ...e, registered: Math.max(0, e.registered - 1) };
  });

  const updatedRegs = registrations.filter((r) => r.id !== regId);
  setState({ events: updatedEvents, registrations: updatedRegs });
  saveLocalState(updatedEvents, updatedRegs);

  const mutatedEvent = updatedEvents.find((e) => e.id === reg.eventId);
  await cancelRegistration(regId, mutatedEvent);

  showToast(`Registration ${regId} canceled. Seat returned to pool.`, "warning");
  logToTerminal(
    `Canceled registration ${regId} (${reg.studentName}). Seats available for ${reg.eventName} increased.`,
    "warn"
  );
  renderAdminDashboard();
}

// ─── Add / Edit Event Modal ───────────────────────────────────────────────────

/**
 * Open the create-event modal (blank form).
 */
export function openCreateEventModal() {
  _configureEventModal({
    title:       '<iconify-icon icon="fa6-solid:calendar-plus" style="color:var(--accent-primary);"></iconify-icon> Create New Event',
    subtitle:    "Add a new event and configure initial seat allocation.",
    btnText:     '<iconify-icon icon="fa6-solid:plus"></iconify-icon> Save Event',
    editId:      "",
    name:        "",
    description: "",
    date:        "",
    startTime:   "09:00 AM",
    endTime:     "05:00 PM",
    venue:       "Main Auditorium",
    seats:       "30",
    status:      "open",
  });
}

/**
 * Open the edit-event modal pre-filled with the event's current values.
 * @param {number} id
 */
export function openEditEventModal(id) {
  const { events } = getState();
  const event = events.find((e) => e.id === parseInt(id, 10));
  if (!event) return;

  _configureEventModal({
    title:       '<iconify-icon icon="fa6-solid:pen-to-square" style="color:var(--accent-primary);"></iconify-icon> Edit Event Details',
    subtitle:    "Update event details, lifecycle state, or total seats capacity.",
    btnText:     '<iconify-icon icon="fa6-solid:floppy-disk"></iconify-icon> Update Event',
    editId:      event.id,
    name:        event.name,
    description: event.description || "",
    date:        getRawDate(event),
    startTime:   event.startTime || "09:00 AM",
    endTime:     event.endTime || "05:00 PM",
    venue:       event.venue || "Main Auditorium",
    seats:       event.seats,
    status:      event.status || "open",
  });
}

/** @private */
function _configureEventModal({ title, subtitle, btnText, editId, name, description, date, startTime, endTime, venue, seats, status }) {
  const modal    = document.getElementById("add-event-modal");
  const form     = document.getElementById("add-event-form");
  const alertBox = document.getElementById("add-event-alert");

  if (!modal) return;

  _setValue("edit-event-id", editId);
  _setHtml("add-event-title", title);
  _setText("add-event-subtitle", subtitle);
  _setHtml("save-new-event-btn", btnText);

  _setValue("new-event-name",        name);
  _setValue("new-event-description", description);
  _setValue("new-event-date",        date);
  _setValue("new-event-start-time",  startTime);
  _setValue("new-event-end-time",    endTime);
  _setValue("new-event-venue",       venue);
  _setValue("new-event-seats",       seats);
  _setValue("new-event-status",      status || "open");

  alertBox?.classList.add("hidden");
  if (form) form.dataset.dirty = "false";

  modal.classList.remove("hidden");
  document.getElementById("new-event-name")?.focus();
}

/**
 * Wire the add/edit event modal form submit and close buttons.
 */
export function setupAddEventModal() {
  setupAdminSubnav();

  const modal     = document.getElementById("add-event-modal");
  const openBtn   = document.getElementById("open-add-event-modal-btn");
  const closeBtn  = document.getElementById("add-event-close-btn");
  const cancelBtn = document.getElementById("add-event-cancel-btn");
  const form      = document.getElementById("add-event-form");
  const alertBox  = document.getElementById("add-event-alert");
  const alertMsg  = document.getElementById("add-event-alert-msg");

  const hideModal = () => {
    modal?.classList.add("hidden");
    alertBox?.classList.add("hidden");
    form?.reset();
  };

  openBtn?.addEventListener("click",  () => openCreateEventModal());
  closeBtn?.addEventListener("click", hideModal);
  cancelBtn?.addEventListener("click", hideModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const editId      = document.getElementById("edit-event-id")?.value;
    const name        = document.getElementById("new-event-name")?.value;
    const description = document.getElementById("new-event-description")?.value;
    const date        = document.getElementById("new-event-date")?.value;
    const startTime   = document.getElementById("new-event-start-time")?.value;
    const endTime     = document.getElementById("new-event-end-time")?.value;
    const venue       = document.getElementById("new-event-venue")?.value;
    const seats       = document.getElementById("new-event-seats")?.value;
    const status      = document.getElementById("new-event-status")?.value;

    const payloadData = { editId, name, description, date, startTime, endTime, venue, seats, status };

    let res;
    if (editId) {
      res = await _doEditEvent(parseInt(editId, 10), payloadData);
    } else {
      res = await _doCreateEvent(payloadData);
    }

    if (!res.success) {
      if (alertBox && alertMsg) {
        alertMsg.textContent = res.error;
        alertBox.classList.remove("hidden");
      }
      return;
    }

    hideModal();
    renderAdminDashboard();
  });
}

// ─── Event CRUD Logic ─────────────────────────────────────────────────────────

/** @private */
async function _doCreateEvent(data) {
  const { events } = getState();

  const v = validateEventForm(data.name, data.date, data.seats, events, null);
  if (!v.valid) return { success: false, error: v.error };

  const formattedDate = formatDateForDisplay(v.dateClean);
  const nextId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1;

  const newEvent = {
    id:          nextId,
    name:        v.nameClean,
    description: (data.description || "").trim(),
    date:        formattedDate,
    rawDate:     v.dateClean,
    startTime:   (data.startTime || "09:00 AM").trim(),
    endTime:     (data.endTime || "05:00 PM").trim(),
    venue:       (data.venue || "Main Auditorium").trim(),
    seats:       v.seatsNum,
    registered:  0,
    status:      (data.status || "open").toLowerCase(),
  };

  const result = await createEvent(newEvent);
  if (result.error) return { success: false, error: result.error.message ?? "Failed to create event." };

  const updatedEvents = [...events, newEvent];
  setState({ events: updatedEvents });
  saveLocalState(updatedEvents, getState().registrations);

  showToast(`Event "${newEvent.name}" created!`, "success");
  logToTerminal(`Created event "${newEvent.name}" (ID: ${newEvent.id}, Capacity: ${newEvent.seats}, Status: ${newEvent.status.toUpperCase()}).`, "info");

  return { success: true };
}

/** @private */
async function _doEditEvent(targetId, data) {
  const { events, registrations } = getState();
  const event = events.find((e) => e.id === targetId);
  if (!event) return { success: false, error: "Event not found." };

  const seatsNum = parseInt(data.seats, 10);
  if (!isNaN(seatsNum) && seatsNum < event.registered) {
    return {
      success: false,
      error: `Capacity cannot be reduced below current registered attendees (${event.registered}).`,
    };
  }

  const v = validateEventForm(data.name, data.date, data.seats, events, targetId);
  if (!v.valid) return { success: false, error: v.error };

  const formattedDate = formatDateForDisplay(v.dateClean);
  const oldName = event.name;

  const updatedEvent = {
    ...event,
    name:        v.nameClean,
    description: (data.description || "").trim(),
    date:        formattedDate,
    rawDate:     v.dateClean,
    startTime:   (data.startTime || "09:00 AM").trim(),
    endTime:     (data.endTime || "05:00 PM").trim(),
    venue:       (data.venue || "Main Auditorium").trim(),
    seats:       v.seatsNum,
    status:      (data.status || "open").toLowerCase(),
  };

  const updatedEvents = events.map((e) => (e.id === targetId ? updatedEvent : e));

  // Sync event name in existing registrations if it changed
  const updatedRegs = (oldName !== v.nameClean)
    ? registrations.map((r) =>
        r.eventId === targetId ? { ...r, eventName: v.nameClean } : r
      )
    : registrations;

  setState({ events: updatedEvents, registrations: updatedRegs });
  saveLocalState(updatedEvents, updatedRegs);

  await updateEvent(updatedEvent);

  showToast(`Event "${updatedEvent.name}" updated!`, "success");
  logToTerminal(
    `Updated event ID ${updatedEvent.id}: "${updatedEvent.name}", Status=${updatedEvent.status.toUpperCase()}, Seats=${updatedEvent.seats}.`,
    "info"
  );

  return { success: true };
}

/**
 * Show a browser confirm dialog and delete the event if confirmed.
 * @param {number} id
 */
export async function confirmAndDeleteEvent(id) {
  const { events, registrations } = getState();
  const targetId  = parseInt(id, 10);
  const event     = events.find((e) => e.id === targetId);
  if (!event) return;

  const regCount = registrations.filter((r) => r.eventId === targetId).length;
  let msg = `Are you sure you want to delete event "${event.name}"?`;
  if (regCount > 0) {
    msg += `\n\nWARNING: ${regCount} student registration(s) will also be canceled!`;
  }

  if (!confirm(msg)) return;

  const updatedEvents = events.filter((e) => e.id !== targetId);
  const updatedRegs   = registrations.filter((r) => r.eventId !== targetId);
  const removedCount  = registrations.length - updatedRegs.length;

  setState({ events: updatedEvents, registrations: updatedRegs });
  saveLocalState(updatedEvents, updatedRegs);

  await deleteEvent(targetId);

  showToast(`Event "${event.name}" deleted.`, "warning");
  logToTerminal(
    `Deleted event "${event.name}" (ID: ${targetId}). Removed ${removedCount} registration(s).`,
    "warn"
  );
  renderAdminDashboard();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function _setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function _setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

