/**
 * main.js — Application Entry Point
 *
 * Bootstraps EventHub:
 *  1. Initialise Supabase client
 *  2. Restore auth session (if any)
 *  3. Load events + registrations from DB (or localStorage fallback)
 *  4. Wire all UI modules
 *  5. Start Realtime channel (or polling fallback)
 *  6. Subscribe to state changes → re-render views
 */

import { initSupabaseClient, getSupabaseClient } from "./config/supabase.js";
import { getState, setState, subscribe } from "./state/appState.js";
import { restoreSession } from "./services/authService.js";
import { fetchEvents } from "./services/eventService.js";
import { fetchRegistrations, syncStateIntegrity } from "./services/registrationService.js";
import { saveLocalState } from "./realtime/localPersistence.js";
import { startRealtime, startPolling } from "./realtime/realtimeManager.js";
import { updateStatusBadge, logNetworkConsole, showToast } from "./ui/notifications.js";
import { renderEventCatalog, renderFormOptions, selectEventForRegistration } from "./ui/events.js";
import { setupFormHandler, hideConfirmationModal, exportRegistrationsCSV } from "./ui/registration.js";
import {
  renderAdminDashboard,
  renderRegistrationsTable,
  setupAddEventModal,
  handleCancelRegistration,
  openEditEventModal,
  confirmAndDeleteEvent,
  handleStatusTransition,
} from "./ui/dashboard.js";
import { setupTicketLookup, viewTicketReceipt } from "./ui/tickets.js";
import { setupAuthHandlers, applyRoleUI } from "./ui/auth.js";
import { setupAuditPanel } from "./ui/audit.js";
import { setupDbModal } from "./ui/dbModal.js";
import { switchTab } from "./ui/tabs.js";

// ─── Global bridge functions ──────────────────────────────────────────────────
// The HTML uses inline onclick attributes which need globals.
// We namespace all of them under `window._eh*` to keep the global scope clean.
window._ehSelectEvent       = selectEventForRegistration;
window._ehCancelReg         = handleCancelRegistration;
window._ehOpenEditEvent     = openEditEventModal;
window._ehConfirmDelete     = confirmAndDeleteEvent;
window._ehViewTicket        = viewTicketReceipt;
window._ehTransitionStatus  = handleStatusTransition;

// Also expose for the existing audit panel's direct calls (backward compat)
window.__eventHubState = getState;

// ─── Render helper ────────────────────────────────────────────────────────────

function renderAllViews() {
  renderEventCatalog();
  renderFormOptions();
  renderAdminDashboard();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {

  // 1. Initialise Supabase client
  const client = await initSupabaseClient();

  // 2. Connectivity test + status badge
  if (client) {
    try {
      const t0 = Date.now();
      const { error } = await client.from("events").select("id").limit(1);
      const latency   = Date.now() - t0;
      const projectId = (getState() && client.supabaseUrl?.replace("https://", "").split(".")[0]) || "unknown";

      if (!error) {
        updateStatusBadge(true, "Supabase Connected", `Supabase PostgreSQL — ${projectId}`);
        logNetworkConsole("GET", "/rest/v1/events?select=id&limit=1", 200, latency, "Connectivity test PASSED");
      } else {
        updateStatusBadge(true, "Supabase (Setup)", "Connected — run SQL DDL to create tables");
        logNetworkConsole("GET", "/rest/v1/events?select=id&limit=1", 500, latency, error.message);
      }
    } catch (err) {
      updateStatusBadge(false, "Connection Error", err.message);
    }
  } else {
    updateStatusBadge(true, "Live REST DB", "REST Service & localStorage engine");
  }

  // 3. Restore admin session (if the browser has a persisted Supabase auth cookie)
  const restoredUser = await restoreSession();

  // 4. Load initial data
  const [rawEvents, rawRegs] = await Promise.all([fetchEvents(), fetchRegistrations()]);
  const syncedRegs = syncStateIntegrity(rawEvents, rawRegs);
  const hash = JSON.stringify(rawEvents) + JSON.stringify(syncedRegs);

  setState({
    events:        rawEvents,
    registrations: syncedRegs,
    supabaseOnline: !!client,
    lastHash:      hash,
    // If we had a persisted admin session, currentUser was already set by restoreSession()
    // If not, we leave currentUser null (entry screen will show)
  });

  saveLocalState(rawEvents, syncedRegs);

  // 5. Wire UI modules
  setupAuthHandlers();
  applyRoleUI();
  setupFormHandler();
  setupAddEventModal();
  setupTicketLookup();
  setupAuditPanel();
  setupDbModal(async () => {
    // Called after credential change — reinitialise client + reload data
    const newClient = await initSupabaseClient();
    const [ev, regs] = await Promise.all([fetchEvents(), fetchRegistrations()]);
    const synced = syncStateIntegrity(ev, regs);
    setState({ events: ev, registrations: synced, supabaseOnline: !!newClient });
    saveLocalState(ev, synced);
    if (newClient) {
      startRealtime();
    }
    renderAllViews();
  });

  // Theme toggle
  _setupThemeToggle();

  // Tab navigation
  document.querySelectorAll(".tab-btn").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      if (target) switchTab(target);
    });
  });

  // Reset system button (admin only)
  document.getElementById("reset-system-btn")?.addEventListener("click", async () => {
    const { currentUser } = getState();
    if (currentUser?.role !== "admin") {
      showToast("Reset System is restricted to administrators.", "error");
      return;
    }
    if (!confirm("Are you sure you want to reset all registration data to default?")) return;

    const { resetEvents }        = await import("./services/eventService.js");
    const { resetRegistrations } = await import("./services/registrationService.js");

    await resetRegistrations();
    const freshEvents = await resetEvents();
    setState({ events: freshEvents, registrations: [] });
    saveLocalState(freshEvents, []);
    renderAllViews();
    showToast("System & Database reset to default state", "info");
  });

  // Confirmation modal buttons
  document.getElementById("modal-done-btn")?.addEventListener("click",  hideConfirmationModal);
  document.getElementById("modal-close-icon")?.addEventListener("click", hideConfirmationModal);
  document.getElementById("modal-print-btn")?.addEventListener("click",  () => window.print());

  // Admin table search & filter
  document.getElementById("table-search")?.addEventListener("input",  renderRegistrationsTable);
  document.getElementById("table-filter-event")?.addEventListener("change", renderRegistrationsTable);
  document.getElementById("export-csv-btn")?.addEventListener("click", exportRegistrationsCSV);

  // 6. Subscribe to state changes → re-render
  subscribe(() => renderAllViews());

  // 7. Initial render
  renderAllViews();

  // 8. Start Realtime or polling fallback
  if (client) {
    startRealtime();
  } else {
    startPolling();
  }
});

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function _setupThemeToggle() {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  if (!toggleBtn) return;

  const saved = localStorage.getItem("ps4_theme") || "light";
  _applyTheme(saved, toggleBtn);

  toggleBtn.addEventListener("click", () => {
    const current = document.body.classList.contains("light-theme") ? "light" : "dark";
    const next    = current === "light" ? "dark" : "light";
    _applyTheme(next, toggleBtn);
    localStorage.setItem("ps4_theme", next);
  });
}

function _applyTheme(theme, btn) {
  document.body.classList.remove("light-theme", "dark-theme");
  document.body.classList.add(`${theme}-theme`);
  if (btn) {
    btn.innerHTML = theme === "dark"
      ? '<iconify-icon icon="fa6-solid:sun"></iconify-icon>'
      : '<iconify-icon icon="fa6-solid:moon"></iconify-icon>';
  }
}
