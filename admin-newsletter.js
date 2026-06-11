(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc           = window._esc;
  var safeEl        = window._safeEl;
  var fmtDate       = window._fmtDate;
  var showToast     = window._showToast;
  var newsletterRef = window._newsletterRef;

  /* ─────────────────────────────────────────────────────────
     RENDER NEWSLETTER TAB
     Super Admin + Admin only — Vendor tab is hidden via permissions.
  ───────────────────────────────────────────────────────── */
  window._renderNewsletterTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Newsletter</div>' +
        '<div class="section-actions">' +
          '<input class="search-input" id="nl-search" placeholder="Search emails..." oninput="window._filterNewsletter()" style="max-width:200px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._exportNewsletterCSV()">Export CSV</button>' +
        '</div>' +
      '</div>' +
      '<div id="nl-stats" style="margin-bottom:12px;"></div>' +
      '<div id="nl-list"><div class="empty-state"><div class="empty-state-text">Loading subscribers...</div></div></div>';

    newsletterRef.orderBy('subscribedAt', 'desc').limit(500).get().then(function(subs) {
      window._nlData = subs.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });

      var countEl = safeEl('nl-stats');
      if (countEl) {
        countEl.innerHTML =
          '<div class="dash-stat-grid" style="margin-bottom:0;">' +
            '<div class="dash-stat-card">' +
              '<div class="dash-stat-label">Total Subscribers</div>' +
              '<div class="dash-stat-value">' + subs.size + '</div>' +
            '</div>' +
          '</div>';
      }

      renderNewsletterList(window._nlData);
    }).catch(function(e) {
      console.error('[NEWSLETTER_TAB]', e);
      var el = safeEl('nl-list');
      if (el) el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-mailbox"></i></div>' +
        '<div class="orders-empty-title">Could not load subscribers</div>' +
        '<div class="orders-empty-sub">Check your connection and try again.</div>' +
        '<button class="btn btn-sm btn-ghost" style="margin-top:8px;" onclick="window._renderNewsletterTab()">Retry</button>' +
      '</div>';
    });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER LIST
  ───────────────────────────────────────────────────────── */
  function renderNewsletterList(subs) {
    var searchEl = safeEl('nl-search');
    var search   = searchEl ? (searchEl.value || '').toLowerCase() : '';
    var filtered = search
      ? subs.filter(function(s) { return (s.email || '').toLowerCase().indexOf(search) !== -1; })
      : subs;

    var el = safeEl('nl-list');
    if (!el) return;

    if (subs.length === 0) {
      el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-mailbox"></i></div>' +
        '<div class="orders-empty-title">No subscribers yet</div>' +
        '<div class="orders-empty-sub">People who sign up for your newsletter will appear here.</div>' +
      '</div>';
      return;
    }

    if (filtered.length === 0) {
      el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-magnifying-glass"></i></div>' +
        '<div class="orders-empty-title">No matches</div>' +
        '<div class="orders-empty-sub">No subscribers match your search. Try a different email.</div>' +
        '<button class="btn btn-sm btn-ghost" style="margin-top:8px;" onclick="window._clearNewsletterSearch()">Clear search</button>' +
      '</div>';
      return;
    }

    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
        '<th>Email</th>' +
        '<th>Subscribed</th>' +
        '<th>Tags</th>' +
      '</tr></thead>' +
      '<tbody>' +
      filtered.map(function(s) {
        return '<tr>' +
          '<td style="font-weight:400;">' + esc(s.email || '—') + '</td>' +
          '<td class="cell-muted">' + fmtDate(s.subscribedAt) + '</td>' +
          '<td><span style="font-size:10px;color:var(--muted);">' + esc((s.tags || []).join(', ') || '—') + '</span></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div style="padding:8px 14px;font-size:10px;color:var(--muted);text-align:right;">' +
        filtered.length + ' subscriber' + (filtered.length !== 1 ? 's' : '') +
        (search ? ' matching "' + esc(search) + '"' : '') +
      '</div>';
  }

  window._filterNewsletter = function() {
    if (window._nlData) renderNewsletterList(window._nlData);
  };

  window._clearNewsletterSearch = function() {
    var el = safeEl('nl-search');
    if (el) { el.value = ''; window._filterNewsletter(); }
  };

  /* ─────────────────────────────────────────────────────────
     EXPORT CSV
  ───────────────────────────────────────────────────────── */
  window._exportNewsletterCSV = function() {
    var subs = window._nlData || [];
    if (subs.length === 0) {
      showToast('No subscribers to export', 'info');
      return;
    }

    var rows = ['Email,Subscribed,Tags'];
    subs.forEach(function(s) {
      var email   = (s.email || '').replace(/"/g, '""');
      var subDate = fmtDate(s.subscribedAt).replace(/"/g, '""');
      var tags    = (s.tags || []).join('; ').replace(/"/g, '""');
      rows.push('"' + email + '","' + subDate + '","' + tags + '"');
    });

    var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'janedore-subscribers.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('CSV exported — ' + subs.length + ' subscribers');
  };

})();
