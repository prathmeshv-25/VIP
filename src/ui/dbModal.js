/**
 * Database Settings Modal UI
 *
 * Provides the admin DB status panel, Supabase credential override,
 * and the SQL DDL copy utility.
 */

import { getState } from "../state/appState.js";
import {
  saveSupabaseCredentials,
  clearSupabaseCredentials,
  getActiveConfig,
} from "../config/supabase.js";
import { showToast, logToTerminal, updateStatusBadge } from "./notifications.js";

/**
 * Wire up the DB settings modal, tab switcher, and action buttons.
 * @param {Function} onReconnect  — callback to call after credentials change (reloads state)
 */
export function setupDbModal(onReconnect) {
  const statusBtn  = document.getElementById("db-status-btn");
  const modal      = document.getElementById("db-config-modal");
  const closeBtn   = document.getElementById("db-config-close-btn");
  const doneBtn    = document.getElementById("db-config-done-btn");

  const tabStatus   = document.getElementById("db-tab-status");
  const tabSupabase = document.getElementById("db-tab-supabase");
  const tabSql      = document.getElementById("db-tab-sql");

  const panelStatus   = document.getElementById("db-panel-status");
  const panelSupabase = document.getElementById("db-panel-supabase");
  const panelSql      = document.getElementById("db-panel-sql");

  const urlInput      = document.getElementById("supabase-url-input");
  const keyInput      = document.getElementById("supabase-key-input");
  const saveBtn       = document.getElementById("save-supabase-btn");
  const disconnectBtn = document.getElementById("disconnect-supabase-btn");
  const copySqlBtn    = document.getElementById("copy-sql-btn");

  const hideModal = () => modal?.classList.add("hidden");

  const switchDbTab = (activeTab, activePanel) => {
    [tabStatus, tabSupabase, tabSql].forEach((t) => t?.classList.remove("active"));
    [panelStatus, panelSupabase, panelSql].forEach((p) => p?.classList.add("hidden"));
    activeTab?.classList.add("active");
    activePanel?.classList.remove("hidden");
  };

  statusBtn?.addEventListener("click", () => {
    const { currentUser } = getState();
    if (currentUser?.role !== "admin") {
      showToast("Database settings are restricted to Administrators.", "error");
      return;
    }
    const config = getActiveConfig();
    if (urlInput) urlInput.value = config.url;
    if (keyInput) keyInput.value = config.key;
    modal?.classList.remove("hidden");
    switchDbTab(tabStatus, panelStatus);
  });

  closeBtn?.addEventListener("click", hideModal);
  doneBtn?.addEventListener("click", hideModal);

  tabStatus?.addEventListener("click",   () => switchDbTab(tabStatus,   panelStatus));
  tabSupabase?.addEventListener("click", () => switchDbTab(tabSupabase, panelSupabase));
  tabSql?.addEventListener("click",      () => switchDbTab(tabSql,      panelSql));

  saveBtn?.addEventListener("click", async () => {
    const url = urlInput?.value.trim();
    const key = keyInput?.value.trim();

    if (!url || !key) {
      showToast("Please enter both Supabase URL and Anon Key", "warning");
      return;
    }

    await saveSupabaseCredentials(url, key);
    showToast("Supabase connection configured & saved!", "success");
    logToTerminal("Connected to custom Supabase database.", "info");
    await onReconnect();
    switchDbTab(tabStatus, panelStatus);
  });

  disconnectBtn?.addEventListener("click", async () => {
    await clearSupabaseCredentials();
    if (urlInput) urlInput.value = "";
    if (keyInput) keyInput.value = "";
    showToast("Reset to default persistence engine", "info");
    await onReconnect();
    switchDbTab(tabStatus, panelStatus);
  });

  copySqlBtn?.addEventListener("click", () => {
    const sql = document.getElementById("sql-code-content")?.textContent || "";
    navigator.clipboard
      .writeText(sql)
      .then(() => showToast("SQL DDL script copied to clipboard!", "success"))
      .catch(() => showToast("Failed to copy SQL script", "error"));
  });
}
