/**
 * Event Service
 *
 * All Supabase database operations for the `events` table.
 * Falls back to localStorage when Supabase is unavailable.
 *
 * Every function returns plain JS objects — no Supabase types leak out.
 */

import { getSupabaseClient } from "../config/supabase.js";
import { logNetworkConsole } from "../ui/notifications.js";

const STORAGE_KEY_EVENTS = "ps4_events_v1";

/** Seed data used when no database is available */
const INITIAL_EVENTS = [
  {
    id: 1,
    name: "Code Clash",
    description: "Competitive algorithmic coding challenge for student programmers.",
    date: "10 Sept 2026",
    rawDate: "2026-09-10",
    startTime: "09:00 AM",
    endTime: "12:00 PM",
    venue: "Lab 3, IT Block",
    seats: 30,
    registered: 0,
    status: "open",
  },
  {
    id: 2,
    name: "Web Warfare",
    description: "Real-time front-end design and web development battle.",
    date: "10 Sept 2026",
    rawDate: "2026-09-10",
    startTime: "01:00 PM",
    endTime: "04:00 PM",
    venue: "Main Auditorium",
    seats: 25,
    registered: 0,
    status: "open",
  },
  {
    id: 3,
    name: "Tech Quiz",
    description: "Fast-paced trivia competition on CS fundamentals and tech news.",
    date: "10 Sept 2026",
    rawDate: "2026-09-10",
    startTime: "04:30 PM",
    endTime: "06:00 PM",
    venue: "Seminar Hall B",
    seats: 40,
    registered: 0,
    status: "open",
  },
];

/**
 * Map a raw Supabase `events` row to the internal event shape.
 * @param {object} row
 */
function mapEvent(row) {
  return {
    id:          Number(row.id),
    name:        row.name,
    description: row.description || "",
    date:        row.date,
    rawDate:     row.raw_date || row.rawDate || "",
    startTime:   row.start_time || row.startTime || "09:00 AM",
    endTime:     row.end_time || row.endTime || "05:00 PM",
    venue:       row.venue || "Main Auditorium",
    seats:       Number(row.seats),
    registered:  Number(row.registered || 0),
    status:      (row.status || "open").toLowerCase(),
  };
}

/**
 * Fetch all events ordered by id ascending.
 * Falls back to localStorage if Supabase is unreachable.
 * @returns {Promise<Array>}
 */
export async function fetchEvents() {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("id", { ascending: true });

      const latency = Date.now() - t0;

      if (!error && data && data.length > 0) {
        logNetworkConsole(
          "GET",
          "/rest/v1/events",
          200,
          latency,
          `Fetched ${data.length} events from Supabase`
        );
        return data.map(mapEvent);
      }

      if (error) {
        logNetworkConsole(
          "GET",
          "/rest/v1/events",
          500,
          Date.now() - t0,
          error.message
        );
      }
    } catch (err) {
      logNetworkConsole("GET", "/rest/v1/events", 500, Date.now() - t0, err.message);
    }
  }

  // localStorage fallback
  const latency = Math.floor(8 + Math.random() * 15);
  logNetworkConsole("GET", "/api/v1/events", 200, latency, "LocalStorage fallback");

  const saved = localStorage.getItem(STORAGE_KEY_EVENTS);
  if (saved) {
    try { return JSON.parse(saved); } catch { /* corrupt data */ }
  }
  return JSON.parse(JSON.stringify(INITIAL_EVENTS));
}

/**
 * Insert a new event row.
 * @param {{ id, name, description, date, rawDate, startTime, endTime, venue, seats, status }} newEvent
 */
export async function createEvent(newEvent) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  const payload = {
    id:          newEvent.id,
    name:        newEvent.name,
    description: newEvent.description || "",
    date:        newEvent.date,
    raw_date:    newEvent.rawDate,
    start_time:  newEvent.startTime || "09:00 AM",
    end_time:    newEvent.endTime || "05:00 PM",
    venue:       newEvent.venue || "Main Auditorium",
    seats:       newEvent.seats,
    registered:  0,
    status:      (newEvent.status || "open").toLowerCase(),
  };

  if (supabase) {
    try {
      const { error } = await supabase.from("events").insert([payload]);
      logNetworkConsole(
        "POST",
        "/rest/v1/events",
        error ? 400 : 201,
        Date.now() - t0,
        error ? error.message : `Created event ID ${newEvent.id} [${payload.status}]`
      );
      if (error) return { error };
    } catch (err) {
      logNetworkConsole("POST", "/rest/v1/events", 500, Date.now() - t0, err.message);
      return { error: err };
    }
  } else {
    logNetworkConsole("POST", "/api/v1/events", 201, 15, `Created "${newEvent.name}"`);
  }

  return {};
}

/**
 * Update an existing event row.
 * @param {{ id, name, description, date, rawDate, startTime, endTime, venue, seats, registered, status }} eventData
 */
export async function updateEvent(eventData) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  const payload = {
    name:        eventData.name,
    description: eventData.description || "",
    date:        eventData.date,
    raw_date:    eventData.rawDate,
    start_time:  eventData.startTime || "09:00 AM",
    end_time:    eventData.endTime || "05:00 PM",
    venue:       eventData.venue || "Main Auditorium",
    seats:       eventData.seats,
    registered:  eventData.registered,
    status:      (eventData.status || "open").toLowerCase(),
  };

  if (supabase) {
    try {
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", eventData.id);

      logNetworkConsole(
        "PATCH",
        `/rest/v1/events?id=eq.${eventData.id}`,
        error ? 400 : 200,
        Date.now() - t0,
        error ? error.message : `Updated event ${eventData.id}`
      );
      if (error) return { error };
    } catch (err) {
      logNetworkConsole("PATCH", "/rest/v1/events", 500, Date.now() - t0, err.message);
      return { error: err };
    }
  } else {
    logNetworkConsole(
      "PATCH",
      `/api/v1/events/${eventData.id}`,
      200,
      15,
      `Updated capacity to ${eventData.seats}`
    );
  }

  return {};
}

/**
 * Transition an event's lifecycle status (e.g., draft → open, open → closed/cancelled).
 * @param {number} eventId
 * @param {string} newStatus — draft, open, closed, completed, cancelled
 */
export async function updateEventStatus(eventId, newStatus) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();
  const statusClean = String(newStatus).toLowerCase();

  if (supabase) {
    try {
      const { error } = await supabase
        .from("events")
        .update({ status: statusClean })
        .eq("id", eventId);

      logNetworkConsole(
        "PATCH",
        `/rest/v1/events?id=eq.${eventId}`,
        error ? 400 : 200,
        Date.now() - t0,
        error ? error.message : `Event ${eventId} transition → ${statusClean.toUpperCase()}`
      );
      if (error) return { error };
    } catch (err) {
      logNetworkConsole("PATCH", "/rest/v1/events", 500, Date.now() - t0, err.message);
      return { error: err };
    }
  }

  return {};
}

/**
 * Delete an event row by id.
 * @param {number} eventId
 */
export async function deleteEvent(eventId) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      logNetworkConsole(
        "DELETE",
        `/rest/v1/events?id=eq.${eventId}`,
        error ? 400 : 200,
        Date.now() - t0,
        error ? error.message : `Deleted event ${eventId}`
      );
      if (error) return { error };
    } catch (err) {
      logNetworkConsole("DELETE", "/rest/v1/events", 500, Date.now() - t0, err.message);
      return { error: err };
    }
  } else {
    logNetworkConsole("DELETE", `/api/v1/events/${eventId}`, 200, 15, "Deleted event");
  }

  return {};
}

/**
 * Delete all events and re-seed the defaults (admin reset).
 */
export async function resetEvents() {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      await supabase.from("events").delete().neq("id", 0);
      for (const ev of INITIAL_EVENTS) {
        await supabase.from("events").insert([{
          id: ev.id,
          name: ev.name,
          description: ev.description,
          date: ev.date,
          raw_date: ev.rawDate,
          start_time: ev.startTime,
          end_time: ev.endTime,
          venue: ev.venue,
          seats: ev.seats,
          registered: 0,
          status: ev.status,
        }]);
      }
      logNetworkConsole("POST", "/rest/v1/rpc/reset_events", 200, Date.now() - t0, "Events re-seeded");
    } catch (err) {
      logNetworkConsole("POST", "/rest/v1/rpc/reset_events", 500, Date.now() - t0, err.message);
    }
  }
  return JSON.parse(JSON.stringify(INITIAL_EVENTS));
}
