/**
 * Realtime Manager
 *
 * Manages the Supabase Realtime channel for live seat updates.
 * Falls back to localStorage polling ONLY when Supabase is unavailable.
 *
 * Design:
 *  - On a realtime event we re-fetch only if the serialised state differs
 *    from `lastHash` — avoiding unnecessary re-renders.
 *  - Polling is disabled entirely when a Realtime channel is active.
 */

import { getSupabaseClient } from "../config/supabase.js";
import { getState, setState } from "../state/appState.js";
import { fetchEvents, mapEvent } from "../services/eventService.js";
import { fetchRegistrations, syncStateIntegrity, mapRegistration } from "../services/registrationService.js";
import { logNetworkConsole } from "../ui/notifications.js";
import { saveLocalState } from "./localPersistence.js";
import { updateTargetedEventCardUI } from "../ui/events.js";
import { updateTargetedAdminEventUI, appendTargetedRegistrationRow } from "../ui/dashboard.js";
import { appendTargetedStudentTicket } from "../ui/tickets.js";

let _realtimeChannel = null;
let _pollingTimer = null;

/**
 * Handle live Supabase Realtime payload for the `events` table.
 * Performs targeted model update and O(1) DOM rendering without full re-fetch.
 * @param {object} payload
 */
export function handleRealtimeEventDelta(payload) {
  if (!payload || !payload.new) return;
  const rawRow = payload.new;
  const updatedEvent = mapEvent(rawRow);

  const { events, registrations } = getState();
  const index = events.findIndex((e) => e.id === updatedEvent.id);

  let newEvents = [...events];
  if (index !== -1) {
    newEvents[index] = { ...events[index], ...updatedEvent };
  } else {
    newEvents.push(updatedEvent);
  }

  const newHash = JSON.stringify(newEvents) + JSON.stringify(registrations);
  setState({ events: newEvents, lastHash: newHash });
  saveLocalState(newEvents, registrations);

  // Targeted O(1) UI Updates:
  // 1. Student View Event Card
  updateTargetedEventCardUI(updatedEvent);

  // 2. Admin View Box & Metrics
  updateTargetedAdminEventUI(updatedEvent);

  // Pulse DB indicator dot
  const pulseDot = document.getElementById("db-pulse-dot");
  if (pulseDot) {
    pulseDot.classList.add("pulse-active");
    setTimeout(() => pulseDot.classList.remove("pulse-active"), 1000);
  }

  logNetworkConsole(
    "WS",
    `/realtime/v1/events?id=${updatedEvent.id}`,
    200,
    0,
    `Live Event Delta: "${updatedEvent.name}" (${updatedEvent.registered}/${updatedEvent.seats} seats)`
  );
}

/**
 * Handle live Supabase Realtime payload for the `registrations` table.
 * Performs targeted model update and O(1) DOM rendering without full re-fetch.
 * @param {object} payload
 */
export function handleRealtimeRegistrationDelta(payload) {
  if (!payload || !payload.new) return;
  const rawRow = payload.new;
  const newReg = mapRegistration(rawRow);

  const { events, registrations } = getState();

  // Attach event details if missing in payload
  if (!newReg.eventName || !newReg.eventDate) {
    const matchingEv = events.find((e) => e.id === newReg.eventId);
    if (matchingEv) {
      newReg.eventName = newReg.eventName || matchingEv.name;
      newReg.eventDate = newReg.eventDate || matchingEv.date;
    }
  }

  const exists = registrations.some((r) => r.id === newReg.id);
  let newRegs = [...registrations];
  if (!exists) {
    newRegs.unshift(newReg);
  } else {
    newRegs = newRegs.map((r) => (r.id === newReg.id ? { ...r, ...newReg } : r));
  }

  const newHash = JSON.stringify(events) + JSON.stringify(newRegs);
  setState({ registrations: newRegs, lastHash: newHash });
  saveLocalState(events, newRegs);

  // Targeted O(1) UI Updates:
  // 1. Admin Tables (Registrations, Students, Ticket verification)
  appendTargetedRegistrationRow(newReg);

  // 2. Student My Events / Dashboard
  appendTargetedStudentTicket(newReg);

  // Pulse DB indicator dot
  const pulseDot = document.getElementById("db-pulse-dot");
  if (pulseDot) {
    pulseDot.classList.add("pulse-active");
    setTimeout(() => pulseDot.classList.remove("pulse-active"), 1000);
  }

  logNetworkConsole(
    "WS",
    `/realtime/v1/registrations?id=${newReg.id}`,
    200,
    0,
    `Live Registration Delta: Ticket ${newReg.ticketCode || newReg.id} for ${newReg.studentName}`
  );
}

/**
 * Start the Supabase Realtime channel.
 * Subscribes to changes on `events` and `registrations`.
 */
export function startRealtime() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
  }

  _realtimeChannel = supabase
    .channel("eventhub-live-data")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events" },
      (payload) => handleRealtimeEventDelta(payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "registrations" },
      (payload) => handleRealtimeRegistrationDelta(payload)
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        logNetworkConsole(
          "WS",
          "/realtime/v1/websocket",
          200,
          0,
          "Supabase Realtime subscribed <iconify-icon icon='fa6-solid:circle-check' style='color:var(--color-success);'></iconify-icon>"
        );
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        logNetworkConsole(
          "WS",
          "/realtime/v1/websocket",
          500,
          0,
          `Realtime ${status} — fallback polling available`
        );
      }
    });
}

/**
 * Tear down the Realtime channel.
 */
export function stopRealtime() {
  const supabase = getSupabaseClient();
  if (_realtimeChannel && supabase) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

/**
 * Pull fresh data from Supabase and update state if something changed.
 * Called by both the Realtime handler and the polling fallback.
 * @param {string} source — label for the network log
 */
export async function refreshFromRealtime(source = "manual") {
  const [freshEvents, freshRegs] = await Promise.all([
    fetchEvents(),
    fetchRegistrations(),
  ]);

  const syncedRegs = syncStateIntegrity(freshEvents, freshRegs);
  const newHash = JSON.stringify(freshEvents) + JSON.stringify(syncedRegs);

  const { lastHash } = getState();
  if (newHash === lastHash) return; // no change

  setState({
    events:       freshEvents,
    registrations: syncedRegs,
    lastHash:     newHash,
  });

  saveLocalState(freshEvents, syncedRegs);

  logNetworkConsole("WS", `realtime/${source}`, 200, 0, "Live state applied");

  // Pulse the DB indicator dot
  const pulseDot = document.getElementById("db-pulse-dot");
  if (pulseDot) {
    pulseDot.classList.add("pulse-active");
    setTimeout(() => pulseDot.classList.remove("pulse-active"), 1000);
  }
}

/**
 * Start localStorage polling as a fallback when Supabase Realtime is not available.
 * Only activates when there is no active Supabase client.
 */
export function startPolling() {
  if (getSupabaseClient()) return; // Realtime handles it
  if (_pollingTimer) return;

  const pollSync = async () => {
    const freshEvents = await fetchEvents();
    const freshRegs   = await fetchRegistrations();
    const syncedRegs  = syncStateIntegrity(freshEvents, freshRegs);
    const newHash = JSON.stringify(freshEvents) + JSON.stringify(syncedRegs);

    const { lastHash } = getState();
    if (lastHash && newHash !== lastHash) {
      setState({ events: freshEvents, registrations: syncedRegs, lastHash: newHash });
      saveLocalState(freshEvents, syncedRegs);

      const pulseDot = document.getElementById("db-pulse-dot");
      if (pulseDot) {
        pulseDot.classList.add("pulse-active");
        setTimeout(() => pulseDot.classList.remove("pulse-active"), 1000);
      }
    } else if (!lastHash) {
      setState({ lastHash: newHash });
    }
  };

  _pollingTimer = setInterval(pollSync, 3000);

  // Also listen for storage events from other tabs
  window.addEventListener("storage", (e) => {
    if (
      e.key === "ps4_events_v1" ||
      e.key === "ps4_registrations_v1" ||
      e.key === "ps4_last_update"
    ) {
      pollSync();
    }
  });
}

export function stopPolling() {
  if (_pollingTimer) {
    clearInterval(_pollingTimer);
    _pollingTimer = null;
  }
}
