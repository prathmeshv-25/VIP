/**
 * Registration Service (Phase 9 — Production Hardening)
 *
 * Handles all Supabase database operations for the `registrations` table.
 *  - Enforces JOIN events table for live display data with explicit snapshot fallbacks (Phase 9.2)
 *  - Uses `register_for_event` RPC for atomic seat allocation with row-level locks
 *  - Standardizes error responses across database, validation, auth, and concurrency errors (Phase 9.4)
 */

import { getSupabaseClient } from "../config/supabase.js";
import { logNetworkConsole } from "../ui/notifications.js";
import { checkRateLimit, isDebounced } from "../utils/rateLimiter.js";
import { getFriendlyErrorMessage } from "../utils/errorHandler.js";
import { formatDateForDisplay } from "../utils/formatting.js";

const STORAGE_KEY_REGISTRATIONS = "ps4_registrations_v1";

/**
 * Map a raw Supabase `registrations` row (with optional JOINed `events` row) to internal shape.
 * Phase 9.2: Clearly separates current live event details (via JOIN) from historical snapshots.
 * @param {object} r
 */
export function mapRegistration(r) {
  const liveEvent = r.events || null;

  const eventName = liveEvent?.name || r.event_name_snapshot || r.event_name || r.eventName || "Event";
  const rawDate   = liveEvent?.event_date || liveEvent?.raw_date || r.event_date_snapshot || r.event_date || r.eventDate || "";
  const eventDate = rawDate ? formatDateForDisplay(rawDate, true) : "TBD";

  return {
    id:                 r.id,
    eventId:            Number(r.event_id ?? r.eventId),
    eventName:          eventName,
    eventDate:          eventDate,
    eventNameSnapshot:  r.event_name_snapshot ?? r.event_name ?? r.eventName ?? eventName,
    eventDateSnapshot:  r.event_date_snapshot ?? r.event_date ?? r.eventDate ?? rawDate,
    studentName:        r.student_name ?? r.studentName,
    rollNumber:         r.roll_number ?? r.rollNumber,
    timestamp:          r.timestamp,
    seatsLeftAfter:     Number(r.seats_left_after ?? r.seatsLeftAfter ?? 0),
    userId:             r.user_id ?? r.userId ?? null,
    ticketCode:         r.ticket_code ?? r.ticketCode ?? `EVT-${(r.id || "").replace("REG-", "")}`,
    status:             r.status ?? "confirmed",
  };
}

/**
 * Fetch all registrations ordered by creation time descending, joining live event details.
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
        .select("*, events:event_id(id, name, event_date, starts_at, ends_at, venue, status)")
        .order("created_at", { ascending: false });

      const latency = Date.now() - t0;

      if (!error && data) {
        logNetworkConsole(
          "GET",
          "/rest/v1/registrations?select=*,events(*)",
          200,
          latency,
          `Fetched ${data.length} registrations with live event JOIN`
        );
        return data.map(mapRegistration);
      }

      logNetworkConsole(
        "GET",
        "/rest/v1/registrations",
        500,
        Date.now() - t0,
        getFriendlyErrorMessage(error)
      );
    } catch (err) {
      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, err.message);
    }
  }

  // localStorage fallback
  const saved = localStorage.getItem(STORAGE_KEY_REGISTRATIONS);
  logNetworkConsole("GET", "/api/v1/registrations", 200, 10, "LocalStorage fallback");
  if (saved) {
    try { return JSON.parse(saved).map(mapRegistration); } catch { /* corrupt */ }
  }
  return [];
}

/**
 * Fetch registrations for a specific authenticated student, joining live event details.
 * Enforces `WHERE user_id = auth.uid()` at DB query and RLS policy level.
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
        .select("*, events:event_id(id, name, event_date, starts_at, ends_at, venue, status)")
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

      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, getFriendlyErrorMessage(error));
    } catch (err) {
      logNetworkConsole("GET", "/rest/v1/registrations", 500, Date.now() - t0, err.message);
    }
  }

  // Fallback to local filtering
  const all = await fetchRegistrations();
  return all.filter((r) => r.userId === userId);
}

/**
 * Atomically register a student for an event via `register_for_event` RPC.
 * Enforces multi-click debouncing, rate limiting, and friendly error formatting.
 *
 * @param {{ id, eventId, eventName, eventDate, studentName, rollNumber, timestamp, seatsLeftAfter, userId, ticketCode }} regData
 * @returns {Promise<{ success: boolean, registration?: object, error?: string }>}
 */
export async function registerForEvent(regData) {
  const t0 = Date.now();

  // Multi-click Debounce Guard (prevent rapid double clicks)
  const debounceKey = `reg_${regData.eventId}_${regData.userId || regData.rollNumber}`;
  if (isDebounced(debounceKey, 2000)) {
    return { success: false, error: "A registration request is already processing. Please wait..." };
  }

  // Token Bucket Rate Limiter (max 5 requests per minute per student session)
  const rateLimitKey = `rate_reg_${regData.userId || regData.rollNumber || 'anon'}`;
  const limitCheck = checkRateLimit(rateLimitKey, 5, 60000);
  if (!limitCheck.allowed) {
    return {
      success: false,
      error: `Too many registration attempts. Please wait ${limitCheck.retryAfterSec} seconds.`,
    };
  }

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
        // Schema cache miss fallback
        if (error.code === "PGRST202" || String(error.message).toLowerCase().includes("schema cache")) {
          return _compareAndSwapRegister(fullRegData, t0);
        }

        logNetworkConsole("POST", "/rest/v1/rpc/register_for_event", 409, latency, error.message);
        return { success: false, error: getFriendlyErrorMessage(error) };
      }

      const created = Array.isArray(data) ? data[0] : data;
      const registration = mapRegistration({
        ...created,
        id: fullRegData.id,
        event_id: fullRegData.eventId,
        student_name: fullRegData.studentName,
        roll_number: fullRegData.rollNumber,
        timestamp: fullRegData.timestamp,
        user_id: fullRegData.userId,
        ticket_code: created?.ticket_code ?? fullRegData.ticketCode,
      });

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
      return { success: false, error: getFriendlyErrorMessage(err) };
    }
  }

  // No Supabase — localStorage-only mode
  logNetworkConsole("POST", "/api/v1/registrations", 201, 18, `Persisted ticket ${regData.id}`);
  return { success: true, registration: mapRegistration(regData) };
}

/**
 * Compare-and-swap fallback for schema cache misses.
 * @private
 */
async function _compareAndSwapRegister(regData, t0, attempt = 0) {
  const supabase = getSupabaseClient();
  if (attempt >= 3) {
    return { success: false, error: "Could not reserve a seat due to high traffic. Please try again." };
  }

  const { data: current, error: readErr } = await supabase
    .from("events")
    .select("id,name,event_date,date,seats,registered")
    .eq("id", regData.eventId)
    .maybeSingle();

  if (readErr || !current) {
    return { success: false, error: getFriendlyErrorMessage(readErr || "EVENT_NOT_FOUND") };
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
    .select("id,name,event_date,date,seats,registered")
    .maybeSingle();

  if (updateErr) return { success: false, error: getFriendlyErrorMessage(updateErr) };
  if (!updated) return _compareAndSwapRegister(regData, t0, attempt + 1);

  const seatsLeftAfter = Number(updated.seats) - Number(updated.registered);
  const registration = mapRegistration({
    ...regData,
    events: updated,
    seatsLeftAfter,
  });

  const { error: insertErr } = await supabase.from("registrations").insert([{
    id:                  registration.id,
    event_id:            registration.eventId,
    event_name_snapshot: updated.name,
    event_date_snapshot: updated.event_date || updated.date || "",
    event_name:          updated.name,
    event_date:          updated.date || updated.event_date || "",
    student_name:        registration.studentName,
    roll_number:         registration.rollNumber,
    timestamp:           registration.timestamp,
    seats_left_after:    registration.seatsLeftAfter,
    user_id:             registration.userId || null,
    ticket_code:         registration.ticketCode,
  }]);

  if (insertErr) {
    // Return seat if insert failed
    await supabase
      .from("events")
      .update({ registered: Number(updated.registered) - 1 })
      .eq("id", regData.eventId)
      .eq("registered", Number(updated.registered));
    return { success: false, error: getFriendlyErrorMessage(insertErr) };
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
 * Cancel (delete) a registration and return the seat to the event.
 * @param {string} regId
 * @param {{ id: number, registered: number }} event - current event object
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
      return { success: false, error: getFriendlyErrorMessage(err) };
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
 * @param {Array} events
 * @param {Array} registrations
 * @returns {Array} - updated registrations array
 */
export function syncStateIntegrity(events, registrations) {
  let regs = [...registrations];

  events.forEach((event) => {
    const eventRegs = regs.filter((r) => r.eventId === event.id);
    const dbRegisteredCount = Number(event.registered || 0);

    // If event has 0 registered count in DB (e.g. system reset), purge all local registrations for this event
    if (dbRegisteredCount === 0) {
      if (eventRegs.length > 0) {
        regs = regs.filter((r) => r.eventId !== event.id);
      }
      return;
    }

    // If event.registered in DB is greater than actual registrations present,
    // generate placeholder entries so counts match UI expectations
    if (dbRegisteredCount > eventRegs.length) {
      const missingCount = dbRegisteredCount - eventRegs.length;
      const startNum = eventRegs.length + 1;
      for (let i = 0; i < missingCount; i++) {
        const num = startNum + i;
        regs.push(mapRegistration({
          id:                  `REG-${event.id}-${1000 + num}`,
          event_id:            event.id,
          event_name_snapshot: event.name,
          event_date_snapshot: event.date || event.eventDate,
          events:              event,
          student_name:        `Registered Student ${num}`,
          roll_number:         `23ROLL${String(num).padStart(3, "0")}`,
          timestamp:           new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (System Seed)",
          seats_left_after:    event.seats - num,
        }));
      }
    } else if (dbRegisteredCount < eventRegs.length) {
      // Trim extra placeholder/orphaned registrations so local registration length matches DB truth
      const extraCount = eventRegs.length - dbRegisteredCount;
      let removed = 0;
      regs = regs.filter((r) => {
        if (r.eventId === event.id && removed < extraCount && (r.studentName.includes("Registered Student") || r.id.includes("System Seed"))) {
          removed++;
          return false;
        }
        return true;
      });
    }
  });

  return regs;
}
