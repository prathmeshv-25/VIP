/**
 * Analytics UI Engine (Phase 8 & Phase 8.1)
 *
 * Renders high-definition SVG & CSS visual charts for:
 * 1. Admin Analytics (Registrations by Event, Daily Trend, Capacity Utilization, Cancellation Rate & System Health)
 * 2. Student Activity Analytics (Registered, Upcoming, Completed, Cancelled breakdown)
 */

import { escapeHtml } from "../utils/security.js";
import { getAvailableSeats } from "../utils/formatting.js";

/**
 * Render Admin Analytics Dashboard Visualizations in #admin-analytics-charts-grid.
 *
 * @param {Array} events
 * @param {Array} registrations
 */
export function renderAdminAnalyticsCharts(events = [], registrations = []) {
  const container = document.getElementById("admin-analytics-charts-grid");
  if (!container) return;

  // 1. Calculate Core Metrics
  const totalEvents = events.length;
  const totalRegistrations = registrations.length;

  const studentRolls = new Set(registrations.map((r) => (r.rollNumber || "").toLowerCase()).filter(Boolean));
  const totalStudents = studentRolls.size;

  let totalCapacity = 0;
  let totalRegisteredSeats = 0;
  let upcomingEventsCount = 0;

  events.forEach((e) => {
    totalCapacity += Number(e.seats || 0);
    totalRegisteredSeats += Number(e.registered || 0);
    const status = (e.status || "open").toLowerCase();
    if (status === "open") upcomingEventsCount++;
  });

  const overallOccupancyPct = totalCapacity > 0 ? Math.round((totalRegisteredSeats / totalCapacity) * 100) : 0;

  const cancelledRegs = registrations.filter((r) => r.status === "cancelled").length;
  const activeRegs = Math.max(0, totalRegistrations - cancelledRegs);
  const cancellationRatePct = totalRegistrations > 0 ? ((cancelledRegs / totalRegistrations) * 100).toFixed(1) : "0.0";

  let healthBadge = '<span class="badge badge-success"><iconify-icon icon="fa6-solid:circle-check"></iconify-icon> EXCELLENT (&lt;5%)</span>';
  if (parseFloat(cancellationRatePct) >= 10) {
    healthBadge = '<span class="badge badge-danger"><iconify-icon icon="fa6-solid:triangle-exclamation"></iconify-icon> HIGH CANCELLATIONS (&gt;10%)</span>';
  } else if (parseFloat(cancellationRatePct) >= 5) {
    healthBadge = '<span class="badge badge-warning"><iconify-icon icon="fa6-solid:circle-exclamation"></iconify-icon> MODERATE (5-10%)</span>';
  }

  // 2. Daily Registrations Timeline
  const dateMap = new Map();
  registrations.forEach((r) => {
    let day = "Today";
    if (r.timestamp) {
      day = String(r.timestamp).split(",")[0].trim() || "Today";
    }
    dateMap.set(day, (dateMap.get(day) || 0) + 1);
  });
  const dateEntries = Array.from(dateMap.entries()).slice(-6);
  const maxDayVal = Math.max(1, ...dateEntries.map((d) => d[1]));

  // Build Charts Grid HTML
  container.innerHTML = `
    <div class="analytics-charts-row">
      <!-- Chart 1: Registrations by Event (Bar Breakdown) -->
      <div class="analytics-card">
        <div class="analytics-card-header">
          <div>
            <h4 class="analytics-card-title"><iconify-icon icon="fa6-solid:chart-bar"></iconify-icon> Registrations by Event</h4>
            <p class="analytics-card-sub">Event seat allocation & capacity fill rate</p>
          </div>
          <span class="badge badge-primary">${totalEvents} Events</span>
        </div>
        <div class="bars-container">
          ${events.length === 0 ? '<p class="text-muted" style="font-size:0.85rem;">No event data recorded yet.</p>' : ''}
          ${events.map((e) => {
            const pct = Math.round((e.registered / e.seats) * 100);
            const isFull = e.registered >= e.seats;
            return `
              <div class="bar-item">
                <div class="bar-label-flex">
                  <span class="bar-event-name">${escapeHtml(e.name)}</span>
                  <span class="bar-event-seats">${e.registered} / ${e.seats} seats (${pct}%)</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill ${isFull ? "full" : ""}" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Chart 2: System Capacity & Occupancy Ring -->
      <div class="analytics-card">
        <div class="analytics-card-header">
          <div>
            <h4 class="analytics-card-title"><iconify-icon icon="fa6-solid:chart-pie"></iconify-icon> Capacity Utilization</h4>
            <p class="analytics-card-sub">Overall system seat occupancy rate</p>
          </div>
          <span class="badge badge-info">${overallOccupancyPct}% Filled</span>
        </div>
        <div class="occupancy-display-box">
          <div class="radial-ring-wrapper">
            <svg class="radial-ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"></circle>
              <circle class="ring-progress" cx="50" cy="50" r="40"
                      style="stroke-dasharray: 251.2; stroke-dashoffset: ${251.2 - (251.2 * overallOccupancyPct) / 100};"></circle>
            </svg>
            <div class="ring-inner-text">
              <strong>${overallOccupancyPct}%</strong>
              <small>Occupied</small>
            </div>
          </div>
          <div class="ring-legend">
            <div class="legend-item">
              <span class="legend-dot fill-active"></span>
              <span>Occupied: <strong>${totalRegisteredSeats} seats</strong></span>
            </div>
            <div class="legend-item">
              <span class="legend-dot fill-available"></span>
              <span>Available: <strong>${Math.max(0, totalCapacity - totalRegisteredSeats)} seats</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="analytics-charts-row" style="margin-top:1.25rem;">
      <!-- Chart 3: Registrations Timeline (Daily Trend) -->
      <div class="analytics-card">
        <div class="analytics-card-header">
          <div>
            <h4 class="analytics-card-title"><iconify-icon icon="fa6-solid:chart-line"></iconify-icon> Registration Velocity</h4>
            <p class="analytics-card-sub">Bookings timeline trend over recent activity</p>
          </div>
          <span class="badge badge-success"><iconify-icon icon="fa6-solid:arrow-trend-up"></iconify-icon> Active Trend</span>
        </div>
        <div class="timeline-bars-wrapper">
          ${dateEntries.length === 0 ? '<p class="text-muted" style="font-size:0.85rem;">No registration history logged.</p>' : ''}
          ${dateEntries.map(([dateLabel, count]) => {
            const hPct = Math.round((count / maxDayVal) * 100);
            return `
              <div class="timeline-col">
                <div class="timeline-col-bar" style="height:${Math.max(15, hPct)}%" title="${count} bookings on ${dateLabel}">
                  <span class="col-count-badge">${count}</span>
                </div>
                <span class="timeline-date-label">${escapeHtml(dateLabel)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Chart 4: Cancellation Rate & Health Metric -->
      <div class="analytics-card">
        <div class="analytics-card-header">
          <div>
            <h4 class="analytics-card-title"><iconify-icon icon="fa6-solid:heart-pulse"></iconify-icon> System Health & Cancellation Rate</h4>
            <p class="analytics-card-sub">Booking stability & cancellation metrics</p>
          </div>
          ${healthBadge}
        </div>
        <div class="health-metrics-content">
          <div class="health-stat-box mb-3">
            <div class="health-stat-value">${cancellationRatePct}%</div>
            <div class="health-stat-label">Cancellation Rate</div>
          </div>
          <div class="health-details-grid">
            <div class="health-detail-item">
              <span>Confirmed Registrations</span>
              <strong class="text-success">${activeRegs}</strong>
            </div>
            <div class="health-detail-item">
              <span>Cancelled Registrations</span>
              <strong class="text-danger">${cancelledRegs}</strong>
            </div>
            <div class="health-detail-item">
              <span>Unique Students</span>
              <strong class="text-primary">${totalStudents}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Student "My Activity" Analytics section in #student-activity-card.
 *
 * @param {Array} studentRegs
 */
export function renderStudentAnalytics(studentRegs = []) {
  const container = document.getElementById("student-activity-card");
  if (!container) return;

  const totalRegistered = studentRegs.length;

  let upcomingCount  = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  studentRegs.forEach((r) => {
    const status = (r.status || "confirmed").toLowerCase();
    if (status === "cancelled") {
      cancelledCount++;
    } else if (status === "completed") {
      completedCount++;
    } else {
      if (r.eventDate) {
        const d = new Date(r.eventDate);
        if (!isNaN(d.getTime()) && d < new Date("2026-09-11")) {
          completedCount++;
        } else {
          upcomingCount++;
        }
      } else {
        upcomingCount++;
      }
    }
  });

  const activeTotal = Math.max(1, upcomingCount + completedCount);
  const completionPct = Math.round((completedCount / activeTotal) * 100);

  container.innerHTML = `
    <div class="my-activity-header">
      <div>
        <h4 class="activity-card-title"><iconify-icon icon="fa6-solid:chart-line"></iconify-icon> My Activity Summary</h4>
        <p class="text-muted" style="font-size:0.82rem; margin-top:0.2rem;">Track your event participation history</p>
      </div>
      <span class="badge badge-primary">${completionPct}% Events Completed</span>
    </div>

    <div class="my-activity-progress-bar">
      <div class="activity-fill upcoming-fill" style="width: ${Math.round((upcomingCount / activeTotal) * 100)}%" title="${upcomingCount} Upcoming"></div>
      <div class="activity-fill completed-fill" style="width: ${Math.round((completedCount / activeTotal) * 100)}%" title="${completedCount} Completed"></div>
    </div>

    <div class="activity-legend-flex">
      <div class="activity-legend-item">
        <span class="legend-dot dot-upcoming"></span>
        <span>Upcoming: <strong>${upcomingCount}</strong></span>
      </div>
      <div class="activity-legend-item">
        <span class="legend-dot dot-completed"></span>
        <span>Completed: <strong>${completedCount}</strong></span>
      </div>
      <div class="activity-legend-item">
        <span class="legend-dot dot-cancelled"></span>
        <span>Cancelled: <strong>${cancelledCount}</strong></span>
      </div>
    </div>
  `;
}
