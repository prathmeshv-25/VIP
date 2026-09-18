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
import { fetchEvents } from "../services/eventService.js";
import { fetchRegistrations, syncStateIntegrity } from "../services/registrationService.js";
import { logNetworkConsole } from "../ui/notifications.js";
import { saveLocalState } from "./localPersistence.js";

let _realtimeChannel = null;
let _pollingTimer = null;

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
      () => refreshFromRealtime("events")
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "registrations" },
      () => refreshFromRealtime("registrations")
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
