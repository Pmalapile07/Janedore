(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var fmtDate    = window._fmtDate;
  var showToast  = window._showToast;
  var newsletterRef = window._newsletterRef;

  /* ─────────────────────────────────────────────────────────
     RENDER NEWSLETTER TAB
  ───────────────────────────────────────────────────────── */
  window._renderNewsletterTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Newsletter</div>' +
        '<div class="section-actions">' +
          '<input class="search-input" id="nl-search" placeholder="Search emails..." oninput="window._filterNewsletter()" style="max-width:180px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._exportNewsletterCSV()">Export CSV</button>' +
        '</div>' +
      '</div>' +
      '<div id="nl-stats" style="margin-bottom:12px;"></div>' +
      '<div id="nl-list"></div>';

    newsletterRef.orderBy('subscribedAt','desc').limit(200).get().then(function(subs) {
      window._nlData = subs.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var countEl = safeEl('nl-stats');
      if (countEl) countEl.innerHTML = '<div class="stat-card"><div class="stat-number sm">' + subs.size + '</div><div class="stat-label">Total Subscribers</div></div>';
      renderNewsletterList(window._nlData);
    }).catch(function(e) {
      console.error('[NEWSLETTER_TAB]', e);
      var el = safeEl('nl-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No subscribers yet.</div></div>';
    });
  };

  function renderNewsletterList(subs) {
    var searchEl = safeEl('nl-search');
    var search   = searchEl ? (searchEl.value || '').toLowerCase() : '';
    var filtered = search ? subs.filter(function(s){ return (s.email||'').toLowerCase().indexOf(search) !== -1; }) : subs;

    var el = safeEl('nl-list');
    if (!el) return;

    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No subscribers found.</div></div>';
      return;
    }

    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Email</th><th>Subscribed</th><th>Tags</th></tr></thead>' +
      '<tbody>' +
      filtered.map(function(s) {
        return '<tr>' +
          '<td style="font-weight:400;">' + esc(s.email||'') + '</td>' +
          '<td class="cell-muted">' + fmtDate(s.subscribedAt) + '</td>' +
          '<td><span style="font-size:9.5px;color:var(--muted);">' + esc((s.tags||[]).join(', ')||'—') + '</span></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window._filterNewsletter = function() {
    if (window._nlData) renderNewsletterList(window._nlData);
  };

  window._exportNewsletterCSV = function() {
    var subs = window._nlData || [];
    if (subs.length === 0) { showToast('No subscribers to export', 'info'); return; }
    var rows = ['Email,Subscribed,Tags'];
    subs.forEach(function(s) {
      var email     = (s.email||'').replace(/"/g,'""');
      var subDate   = fmtDate(s.subscribedAt).replace(/"/g,'""');
      var tags      = (s.tags||[]).join(';').replace(/"/g,'""');
      rows.push('"'+email+'","'+subDate+'","'+tags+'"');
    });
    var blob = new Blob([rows.join('\n')], {type:'text/csv'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'janedore-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  };

})();
