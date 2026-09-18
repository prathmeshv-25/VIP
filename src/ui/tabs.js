/**
 * Tab Navigation UI
 *
 * Centralised tab switching so every other UI module can import switchTab()
 * without circular dependencies on the full ui/auth.js module.
 */

import { getState } from "../state/appState.js";

/**
 * Switch the active view tab.
 * Respects `data-role` attributes on tab buttons to block unauthorised access.
 * @param {string} viewName  — matches the `data-tab` attribute value
 */
export function switchTab(viewName) {
  const { currentUser } = getState();
  const currentRole = currentUser?.role ?? null;

  // Guard: check role requirement on the target tab button
  const targetTab = document.querySelector(`.tab-btn[data-tab="${viewName}"]`);
  if (targetTab) {
    const roleAttr = targetTab.getAttribute("data-role");
    if (roleAttr && roleAttr !== "all") {
      const allowed = roleAttr.split(",").map((r) => r.trim());
      if (currentRole && !allowed.includes(currentRole)) {
        import("./notifications.js").then(({ showToast }) => {
          showToast("Access restricted for current role.", "error");
        });
        return;
      }
    }
  }

  // Update tab button active states
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === viewName);
  });

  // Update section visibility
  document.querySelectorAll(".view-section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `section-${viewName}`);
  });

  // Show/hide admin-only controls
  const resetBtn   = document.getElementById("reset-system-btn");
  const dbBtn      = document.getElementById("db-status-btn");
  if (resetBtn) resetBtn.classList.toggle("hidden", currentRole !== "admin");
  if (dbBtn)    dbBtn.classList.toggle("hidden", currentRole !== "admin");

  // Tab specific hooks
  if (viewName === "register") {
    import("./registration.js").then(({ populateStudentFormFromUser }) => {
      populateStudentFormFromUser();
    });
  } else if (viewName === "mytickets") {
    import("./tickets.js").then(({ autoLookupForCurrentUser }) => {
      autoLookupForCurrentUser();
    });
  }
}
