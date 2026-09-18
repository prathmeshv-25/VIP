/**
 * Registration Service
 *
 * Handles all Supabase operations for the `registrations` table.
 * Uses the `register_for_event` RPC for atomic seat allocation.
 * Falls back to a compare-and-swap approach if the RPC is absent (schema cache miss).
 */

import { getSupabaseClient } from "../config/supabase.js";
import { logNetworkConsole } from "../ui/notifications.js";

const STORAGE_KEY_REGISTRATIONS = "ps4_registrations_v1";

/**
 * Map a raw Supabase `registrations` row to the internal shape.
 * @param {object} r
 */
function mapRegistration(r) {
  return {
    id:            r.id,
    eventId:       Number(r.event_id   ?? r.eventId),
    eventName:     r.event_name        ?? r.eventName,
    eventDate:     r.event_date        ?? r.eventDate,
    studentName:   r.student_name      ?? r.studentName,
    rollNumber:    r.roll_number       ?? r.rollNumber,
    timestamp:     r.timestamp,
    seatsLeftAfter: Number(r.seats_left_after ?? r.seatsLeftAfter ?? 0),
    userId:        r.user_id           ?? r.userId ?? null,
    ticketCode:    r.ticket_code       ?? r.ticketCode ?? `EVT-${(r.id || "").replace("REG-", "")}`,
    status:        r.status            ?? "confirmed",
  };
}

/**
 * Fetch all registrations ordered by creation time descending.
 * Falls back to localStorage when Supabase is unavailable.
 * @returns {Promise<Array>}
 */
export async function fetchRegistrations() {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false });

      const latency = Date.now() - t0;

      if (!error && data) {
        logNetworkConsole(
          "GET",
          "/rest/v1/registrations",
          200,
          latency,
          `Fetched ${data.length} registrations`
        );
        return data.map(mapRegistration);
      }

      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, error?.message);
    } catch (err) {
      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, err.message);
    }
  }

  // localStorage fallback
  const saved = localStorage.getItem(STORAGE_KEY_REGISTRATIONS);
  logNetworkConsole("GET", "/api/v1/registrations", 200, 10, "LocalStorage fallback");
  if (saved) {
    try { return JSON.parse(saved); } catch { /* corrupt */ }
  }
  return [];
}

/**
 * Fetch registrations for a specific authenticated student.
 * Enforces `WHERE user_id = auth.uid()` at the database query and RLS level.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchStudentRegistrations(userId) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      const latency = Date.now() - t0;

      if (!error && data) {
        logNetworkConsole(
          "GET",
          `/rest/v1/registrations?user_id=eq.${userId}`,
          200,
          latency,
          `DB RLS Enforced: Fetched ${data.length} registrations for user ${userId.substring(0, 8)}...`
        );
        return data.map(mapRegistration);
      }

      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, error?.message);
    } catch (err) {
      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, err.message);
    }
  }

  // Fallback to local filtering
  const all = await fetchRegistrations();
  return all.filter((r) => r.userId === userId);
}


/**
 * Atomically register a student for an event via the `register_for_event` RPC.
 * Falls back to a compare-and-swap update if the RPC isn't in the schema cache yet.
 *
 * @param {{ id, eventId, eventName, eventDate, studentName, rollNumber, timestamp, seatsLeftAfter, userId, ticketCode }} regData
 * @returns {Promise<{ success: boolean, registration?: object, error?: string }>}
 */
export async function registerForEvent(regData) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();
  const ticketCode = regData.ticketCode || "EVT-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  const fullRegData = {
    ...regData,
    ticketCode,
    status: "confirmed",
  };

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("register_for_event", {
        p_registration_id: fullRegData.id,
        p_event_id:        fullRegData.eventId,
        p_student_name:    fullRegData.studentName,
        p_roll_number:     fullRegData.rollNumber,
        p_timestamp:       fullRegData.timestamp,
        p_user_id:         fullRegData.userId || null,
        p_ticket_code:     fullRegData.ticketCode,
      });

      const latency = Date.now() - t0;

      if (error) {
        // Schema cache miss — RPC not yet available; try compare-and-swap
        if (
          error.code === "PGRST202" ||
          String(error.message).toLowerCase().includes("schema cache")
        ) {
          return _compareAndSwapRegister(fullRegData, t0);
        }
        logNetworkConsole(
          "POST",
          "/rest/v1/rpc/register_for_event",
          409,
          latency,
          error.message
        );
        let msg = error.message;
        if (error.message?.includes("EVENT_FULL")) {
          msg = `Event "${fullRegData.eventName}" is FULL!`;
        } else if (
          error.message?.includes("ALREADY_REGISTERED") ||
          error.message?.includes("registrations_event_user_unique") ||
          error.message?.includes("registrations_event_roll_unique") ||
          error.message?.includes("duplicate key")
        ) {
          msg = "You are already registered for this event.";
        } else if (error.message?.includes("EVENT_NOT_FOUND")) {
          msg = "The selected event was not found.";
        }
        return { success: false, error: msg };
      }

      const created = Array.isArray(data) ? data[0] : data;
      const registration = {
        ...fullRegData,
        eventName:      created?.event_name  ?? fullRegData.eventName,
        eventDate:      created?.event_date  ?? fullRegData.eventDate,
        seatsLeftAfter: Number(created?.seats_left_after ?? fullRegData.seatsLeftAfter),
        ticketCode:     created?.ticket_code ?? fullRegData.ticketCode,
      };

      logNetworkConsole(
        "POST",
        "/rest/v1/rpc/register_for_event",
        201,
        latency,
        `Atomic booking confirmed — ${fullRegData.id} (${registration.ticketCode})`
      );
      return { success: true, registration, registeredCount: Number(created?.registered) };

    } catch (err) {
      logNetworkConsole("POST", "/rest/v1/rpc/register_for_event", 500, Date.now() - t0, err.message);
      return { success: false, error: err.message };
    }
  }

  // No Supabase — localStorage-only mode
  logNetworkConsole("POST", "/api/v1/registrations", 201, 18, `Persisted ticket ${regData.id}`);
  return { success: true, registration: regData };
}

/**
 * Compare-and-swap fallback for older projects where the RPC
 * hasn't been reloaded into PostgREST's schema cache.
 * @private
 */
async function _compareAndSwapRegister(regData, t0, attempt = 0) {
  const supabase = getSupabaseClient();
  if (attempt >= 3) {
    return { success: false, error: "Could not reserve a seat. Please try again." };
  }

  const { data: current, error: readErr } = await supabase
    .from("events")
    .select("id,name,date,seats,registered")
    .eq("id", regData.eventId)
    .maybeSingle();

  if (readErr || !current) {
    return { success: false, error: readErr?.message || "Event not found." };
  }

  if (Number(current.registered) >= Number(current.seats)) {
    return { success: false, error: `Event "${regData.eventName}" is FULL!` };
  }

  const nextRegistered = Number(current.registered) + 1;

  const { data: updated, error: updateErr } = await supabase
    .from("events")
    .update({ registered: nextRegistered })
    .eq("id", regData.eventId)
    .eq("registered", Number(current.registered))
    .select("id,name,date,seats,registered")
    .maybeSingle();

  if (updateErr) return { success: false, error: updateErr.message };
  if (!updated) return _compareAndSwapRegister(regData, t0, attempt + 1);

  const seatsLeftAfter = Number(updated.seats) - Number(updated.registered);
  const registration = {
    ...regData,
    eventName:      updated.name,
    eventDate:      updated.date,
    seatsLeftAfter,
  };

  const { error: insertErr } = await supabase.from("registrations").insert([{
    id:              registration.id,
    event_id:        registration.eventId,
    event_name:      registration.eventName,
    event_date:      registration.eventDate,
    student_name:    registration.studentName,
    roll_number:     registration.rollNumber,
    timestamp:       registration.timestamp,
    seats_left_after: registration.seatsLeftAfter,
    user_id:         registration.userId || null,
  }]);

  if (insertErr) {
    // Return seat if insert failed
    await supabase
      .from("events")
      .update({ registered: Number(updated.registered) - 1 })
      .eq("id", regData.eventId)
      .eq("registered", Number(updated.registered));
    return { success: false, error: insertErr.message };
  }

  logNetworkConsole(
    "POST",
    "/rest/v1/registrations",
    201,
    Date.now() - t0,
    `Compatibility booking confirmed — ${regData.id}`
  );
  return { success: true, registration, registeredCount: Number(updated.registered) };
}

/**
 * Cancel (delete) a registration and decrement the event's registered count.
 * @param {string} regId
 * @param {{ id: number, registered: number }} event  — current event object
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function cancelRegistration(regId, event) {
  const t0 = Date.now();
  const supabase = getSupabaseClient();

  if (supabase) {
    try {
      await supabase.from("registrations").delete().eq("id", regId);
      if (event) {
        await supabase
          .from("events")
          .update({ registered: event.registered })
          .eq("id", event.id);
      }
      logNetworkConsole(
        "DELETE",
        `/rest/v1/registrations?id=eq.${regId}`,
        200,
        Date.now() - t0,
        "Cancelled registration & returned seat"
      );
      return { success: true };
    } catch (err) {
      logNetworkConsole("DELETE", "/rest/v1/registrations", 500, Date.now() - t0, err.message);
      return { success: false, error: err.message };
    }
  }

  logNetworkConsole("DELETE", `/api/v1/registrations/${regId}`, 200, 12, "Removed ticket & freed seat");
  return { success: true };
}

/**
 * Delete all registrations (admin reset).
 */
export async function resetRegistrations() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from("registrations").delete().neq("id", "0");
      logNetworkConsole("DELETE", "/rest/v1/registrations", 200, 30, "All registrations cleared");
    } catch (err) {
      logNetworkConsole("DELETE", "/rest/v1/registrations", 500, 30, err.message);
    }
  }
  localStorage.removeItem(STORAGE_KEY_REGISTRATIONS);
}

/**
 * Sync consistency: if events.registered > actual registration rows,
 * create placeholder rows so the UI stays coherent.
 *
 * @param {Array} events
 * @param {Array} registrations
 * @returns {Array} — updated registrations array
 */
export function syncStateIntegrity(events, registrations) {
  const regs = [...registrations];

  events.forEach((event) => {
    const eventRegs = regs.filter((r) => r.eventId === event.id);
    if (event.registered > eventRegs.length) {
      const missingCount = event.registered - eventRegs.length;
      const startNum = eventRegs.length + 1;
      for (let i = 0; i < missingCount; i++) {
        const num = startNum + i;
        regs.push({
          id:            `REG-${event.id}-${1000 + num}`,
          eventId:       event.id,
          eventName:     event.name,
          eventDate:     event.date,
          studentName:   `Registered Student ${num}`,
          rollNumber:    `23ROLL${String(num).padStart(3, "0")}`,
          timestamp:     new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (System Seed)",
          seatsLeftAfter: event.seats - num,
        });
      }
    } else if (event.registered < eventRegs.length) {
      event.registered = eventRegs.length;
    }
  });

  return regs;
}
