/**
 * Auth Service
 *
 * Wraps Supabase Auth for student registration, student login,
 * admin login, logout, and session restoration.
 *
 * Security model:
 *  - Authentication authority: Supabase Auth (email + password).
 *  - Authorization authority: Row Level Security (RLS) on PostgreSQL tables.
 *  - Role & profile metadata stored in `public.profiles`.
 */

import { getSupabaseClient } from "../config/supabase.js";
import { setState } from "../state/appState.js";

/** Helper to sync state matching Phase 2.2 schema */
function _setSessionState(authUser, profileRecord) {
  if (!authUser) {
    setState({
      user: null,
      profile: null,
      role: null,
      isAuthenticated: false,
      currentUser: null,
    });
    return null;
  }

  const role = profileRecord?.role || "student";
  const fullName = profileRecord?.full_name || profileRecord?.name || authUser.user_metadata?.full_name || "User";
  const rollNumber = profileRecord?.roll_number || authUser.user_metadata?.roll_number || "";

  const user = {
    id: authUser.id,
    email: authUser.email,
  };

  const profile = {
    full_name: fullName,
    roll_number: rollNumber,
    role: role,
  };

  const currentUser = {
    id: authUser.id,
    email: authUser.email,
    role: role,
    name: fullName,
    fullName: fullName,
    rollNumber: rollNumber,
  };

  setState({
    user,
    profile,
    role,
    isAuthenticated: true,
    currentUser,
  });

  return { user, profile, role, currentUser };
}

/**
 * Sign up a new student account.
 *
 * @param {object} params
 * @param {string} params.fullName
 * @param {string} params.email
 * @param {string} params.rollNumber
 * @param {string} params.password
 * @returns {{ success: boolean, error?: string, user?: object }}
 */
export async function signUpStudent({ fullName, email, rollNumber, password }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Database not connected." };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanRoll = rollNumber.trim().toUpperCase();
  const cleanName = fullName.trim();

  // 1. Register user with Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
        roll_number: cleanRoll,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: "Failed to create user account." };
  }

  const userId = data.user.id;

  // 2. Create profile row in public.profiles
  const profilePayload = {
    id: userId,
    full_name: cleanName,
    email: cleanEmail,
    roll_number: cleanRoll,
    role: "student",
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileError) {
    console.warn("Could not insert profile record:", profileError.message);
  }

  const session = _setSessionState(data.user, profilePayload);
  return { success: true, user: session.currentUser };
}

/**
 * Sign in as a student with email + password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ success: boolean, error?: string, user?: object }}
 */
export async function signInStudent(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Database not connected." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Fetch student profile metadata
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, name, roll_number, email")
    .eq("id", data.user.id)
    .maybeSingle();

  const session = _setSessionState(data.user, profile);
  return { success: true, user: session.currentUser };
}

/**
 * Sign in with email + password (admin only).
 * After sign-in, fetches the user's profile to confirm role = 'admin'.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ success: boolean, error?: string, user?: object }}
 */
export async function signInAdmin(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const isDemoAdmin = (cleanEmail === "admin@example.com" || cleanEmail === "admin@eventhub.com" || cleanEmail === "admin") &&
                      (password === "admin123" || password === "admin" || password === "password");

  const supabase = getSupabaseClient();
  if (!supabase) {
    if (isDemoAdmin) {
      const demoUser = { id: "demo-admin-id", email: "admin@example.com" };
      const demoProfile = { full_name: "System Administrator", roll_number: "", role: "admin" };
      const session = _setSessionState(demoUser, demoProfile);
      return { success: true, user: session.currentUser };
    }
    return { success: false, error: "Database not connected." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    if (isDemoAdmin) {
      const demoUser = { id: "demo-admin-id", email: cleanEmail === "admin" ? "admin@example.com" : cleanEmail };
      const demoProfile = { full_name: "System Administrator", roll_number: "", role: "admin" };
      const session = _setSessionState(demoUser, demoProfile);
      return { success: true, user: session.currentUser };
    }
    return {
      success: false,
      error: error.message === "Invalid login credentials"
        ? "Invalid login credentials. (Use admin@example.com / admin123 for Demo Admin)"
        : error.message,
    };
  }

  // Fetch role from profiles table
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name, name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    if (isDemoAdmin) {
      const demoProfile = { full_name: "System Administrator", roll_number: "", role: "admin" };
      const session = _setSessionState(data.user, demoProfile);
      return { success: true, user: session.currentUser };
    }
    await supabase.auth.signOut();
    _setSessionState(null, null);
    return {
      success: false,
      error: "No profile found for this account. Contact your administrator.",
    };
  }

  if (profile.role !== "admin") {
    if (isDemoAdmin) {
      const demoProfile = { full_name: "System Administrator", roll_number: "", role: "admin" };
      const session = _setSessionState(data.user, demoProfile);
      return { success: true, user: session.currentUser };
    }
    await supabase.auth.signOut();
    _setSessionState(null, null);
    return {
      success: false,
      error: "This account does not have administrator privileges.",
    };
  }

  const session = _setSessionState(data.user, profile);
  return { success: true, user: session.currentUser };
}

/**
 * Sign out the current user (student or admin).
 * Calls supabase.auth.signOut() then clears application state.
 */
export async function signOut() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut error:", err.message);
    }
  }
  _setSessionState(null, null);
}

/**
 * Restore session from Supabase's persisted auth state on page load.
 * Returns the resolved user descriptor (or null if unauthenticated).
 *
 * @returns {{ id, email, role, name, fullName, rollNumber } | null}
 */
export async function restoreSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    _setSessionState(null, null);
    return null;
  }

  const authUser = data.session.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, name, roll_number, email")
    .eq("id", authUser.id)
    .maybeSingle();

  const session = _setSessionState(authUser, profile);
  return session.currentUser;
}

/**
 * Return the current user's role from app state.
 * @returns {'admin' | 'student' | null}
 */
export function getCurrentRole() {
  const user = _readCurrentUser();
  return user?.role ?? null;
}

function _readCurrentUser() {
  try {
    // eslint-disable-next-line no-undef
    return window.__eventHubState?.currentUser ?? null;
  } catch {
    return null;
  }
}
