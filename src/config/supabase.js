/**
 * Supabase Client Configuration
 * Single place to create/cache the Supabase JS client.
 * Only the browser-safe anon/publishable key is used here.
 * The service-role key MUST NEVER appear in this file.
 */

// Team VIP Production — browser-safe publishable key
const DEFAULT_SUPABASE_URL = "https://bntiigihpnoucodgcacy.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_phMG4dt_U0zd1_z2MvsLpQ_JI0Ed1Ye";

let _client = null;
let _runtimeConfig = null;

/**
 * Fetch runtime Supabase config from the Vercel API route.
 * Falls back gracefully when running on a local file server.
 */
async function loadRuntimeConfig() {
  if (_runtimeConfig) return _runtimeConfig;
  if (!window.location.protocol.startsWith("http")) return null;

  try {
    const res = await fetch("/api/runtime-config", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.url && data?.key) {
      _runtimeConfig = data;
    }
  } catch {
    // Running locally without the Vercel function — that is fine
  }

  return _runtimeConfig;
}

/**
 * Resolve the active Supabase URL + key.
 * Priority:  localStorage override → runtime config → hardcoded defaults
 */
function resolveConfig() {
  const savedUrl = localStorage.getItem("ps4_supabase_url");
  const savedKey = localStorage.getItem("ps4_supabase_key");
  return {
    url: savedUrl || _runtimeConfig?.url || DEFAULT_SUPABASE_URL,
    key: savedKey || _runtimeConfig?.key || DEFAULT_SUPABASE_KEY,
  };
}

/**
 * Return the cached Supabase client (or create it if needed).
 * Call `initSupabaseClient()` once at startup before using this.
 */
export function getSupabaseClient() {
  return _client;
}

/**
 * Initialise (or reinitialise) the Supabase client.
 * Returns the client on success, null if the supabase-js global is missing.
 */
export async function initSupabaseClient() {
  await loadRuntimeConfig();
  const { url, key } = resolveConfig();

  if (!url || !key || !window.supabase) {
    _client = null;
    return null;
  }

  _client = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _client;
}

/**
 * Persist custom Supabase credentials (admin override).
 * Triggers a client reinitialisation.
 */
export async function saveSupabaseCredentials(url, key) {
  localStorage.setItem("ps4_supabase_url", url);
  localStorage.setItem("ps4_supabase_key", key);
  return initSupabaseClient();
}

/**
 * Clear custom credentials and fall back to defaults.
 */
export async function clearSupabaseCredentials() {
  localStorage.removeItem("ps4_supabase_url");
  localStorage.removeItem("ps4_supabase_key");
  return initSupabaseClient();
}

/**
 * Expose the resolved URL/key for the DB settings panel.
 */
export function getActiveConfig() {
  return resolveConfig();
}
