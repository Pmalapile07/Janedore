/* ─────────────────────────────────────────────────────────
   REPORTS — brand reports sent from the storefront's brand pages
   ("Report this brand"). Read and updated through server.js
   (/api/admin/brand-reports), which checks the caller is Super Admin
   or Admin, so no Firestore rules change is needed. Super Admin only
   in the UI (permissions.js).
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;

  var reports = [];
  var filter = 'new';

  function api(path, opts) {
    var user = window._currentUser;
    if (!user || !user.getIdToken) return Promise.reject(new Error('Not signed in'));
    return user.getIdToken().then(function (token) {
      opts = opts || {};
      opts.headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {});
      return fetch(path, opts);
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  window._renderReportsTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    if (!window._isSuperAdmin || !window._isSuperAdmin()) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Only Super Admin can see reports.</div></div>';
      return;
    }
    mc.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;">Loading...</div>';
    api('/api/admin/brand-reports').then(function (data) {
      reports = data.reports || [];
      draw();
    }).catch(function (e) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load reports: ' + esc(e.message) + '</div></div>';
    });
  };

  function draw() {
    var mc = safeEl('main-content');
    if (!mc || window._currentTab !== 'reports') return;
    var counts = { new: 0, reviewed: 0, all: reports.length };
    reports.forEach(function (r) { counts[r.status === 'reviewed' ? 'reviewed' : 'new']++; });
    var shown = reports.filter(function (r) { return filter === 'all' || (filter === 'reviewed' ? r.status === 'reviewed' : r.status !== 'reviewed'); });

    var tabs = [['new', 'New'], ['reviewed', 'Reviewed'], ['all', 'All']].map(function (t) {
      return '<button class="reports-filter' + (filter === t[0] ? ' active' : '') + '" onclick="window._setReportsFilter(\'' + t[0] + '\')">' + t[1] + ' <span>' + counts[t[0]] + '</span></button>';
    }).join('');

    var list = shown.length ? shown.map(function (r) {
      var reviewed = r.status === 'reviewed';
      return '<div class="card report-card' + (reviewed ? ' is-reviewed' : '') + '">' +
        '<div class="report-card-head">' +
          '<div><div class="report-brand">' + esc(r.brand || 'Unknown brand') + '</div>' +
          '<div class="report-reason">' + esc(r.reason) + '</div></div>' +
          '<span class="report-status">' + (reviewed ? 'Reviewed' : 'New') + '</span>' +
        '</div>' +
        (r.details ? '<div class="report-details">' + esc(r.details) + '</div>' : '') +
        '<div class="report-meta">' + esc(fmtDate(r.createdAt)) + ' · ' +
          (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : 'Anonymous') + '</div>' +
        '<div class="report-actions">' +
          '<button class="btn btn-sm ' + (reviewed ? 'btn-ghost' : 'btn-primary') + '" onclick="window._setReportStatus(\'' + esc(r.id) + '\',\'' + (reviewed ? 'new' : 'reviewed') + '\',this)">' + (reviewed ? 'Mark as new' : 'Mark reviewed') + '</button>' +
          (r.vendorId ? '<a class="btn btn-sm btn-ghost" href="/brands/' + encodeURIComponent(r.vendorId) + '" target="_blank" rel="noopener">View brand</a>' : '') +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty-state"><div class="empty-state-text">' +
      (filter === 'new' ? 'No new reports. When a customer reports a brand, it shows up here and in your email.' : 'Nothing here yet.') + '</div></div>';

    mc.innerHTML = '<div class="reports-page"><div class="reports-filters">' + tabs + '</div>' + list + '</div>';
  }

  window._setReportsFilter = function (f) { filter = f; draw(); };

  window._setReportStatus = function (id, status, btn) {
    if (btn) btn.disabled = true;
    api('/api/admin/brand-reports/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify({ status: status }) })
      .then(function () {
        reports.forEach(function (r) { if (r.id === id) r.status = status; });
        showToast(status === 'reviewed' ? 'Marked as reviewed' : 'Marked as new', 'success');
        draw();
      })
      .catch(function (e) {
        if (btn) btn.disabled = false;
        showToast('Error: ' + e.message, 'error');
      });
  };
})();
