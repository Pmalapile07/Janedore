(function () {
  'use strict';

  if (!window._adminDB) return;

  var safeEl = window._safeEl;

  /* ─────────────────────────────────────────────────────────
     DEVELOPER TOOLS — SUPER_ADMIN only (enforced the same way as
     every other SUPER_ADMIN-only tab: absent from the permission
     map for ADMIN/VENDOR, plus the hardcoded superAdminOnlyIds list
     in permissions.js hides the nav entry itself).

     This is a placeholder shell for now — System/Payment/Database
     Diagnostics, Admin Activity & Error Logs, and Seed Data &
     Utilities land in a follow-up change with real, non-fabricated
     checks against Firestore/RTDB. Nothing here claims to show data
     it doesn't actually have yet.
  ───────────────────────────────────────────────────────── */
  window._renderDevtoolsTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    if (!window._isSuperAdmin || !window._isSuperAdmin()) {
      mc.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon"><i class="ph-light ph-lock"></i></div>' +
        '<div class="empty-state-text">Developer Tools is restricted to Super Admin</div>' +
      '</div>';
      return;
    }

    mc.innerHTML = '<div class="empty-state">' +
      '<div class="empty-state-icon"><i class="ph-light ph-wrench"></i></div>' +
      '<div class="empty-state-text">Developer Tools diagnostics are coming next</div>' +
      '<div style="font-size:var(--font-scale-sm);color:var(--muted2);max-width:380px;">System, Payment, and Database Diagnostics, Admin Activity &amp; Error Logs, and Seed Data &amp; Utilities will appear here, built against real Firestore/RTDB checks only.</div>' +
    '</div>';
  };

})();
