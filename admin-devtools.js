(function () {
  'use strict';

  if (!window._adminDB) return;

  var db        = window._adminDB;
  var rtdb      = window._adminRTDB;
  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var fmt       = window._fmt;
  var fmtDate   = window._fmtDate;
  var fmtTime   = window._fmtTime;
  var ordersRef = window._ordersRef;

  var DEVTOOLS_SECTIONS = [
    { id: 'system',   label: 'System Diagnostics' },
    { id: 'payment',  label: 'Payment Diagnostics' },
    { id: 'database', label: 'Database Diagnostics' },
    { id: 'activity', label: 'Admin Activity & Error Logs' },
    { id: 'seed',     label: 'Seed Data & Utilities' }
  ];

  var _devtoolsSection = 'system';

  /* ─────────────────────────────────────────────────────────
     RENDER DEVELOPER TOOLS TAB — SUPER_ADMIN only.
     Everything in here is read-only by default and queries real
     Firestore/RTDB state — nothing is fabricated. Where real
     instrumentation doesn't exist yet (admin activity/error
     history, a persisted payment-event log), this says so plainly
     instead of showing fake rows.
  ───────────────────────────────────────────────────────── */
  window._renderDevtoolsTab = function (section) {
    var mc = safeEl('main-content');
    if (!mc) return;

    if (!window._isSuperAdmin || !window._isSuperAdmin()) {
      mc.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon"><i class="ph-light ph-lock"></i></div>' +
        '<div class="empty-state-text">Developer Tools is restricted to Super Admin</div>' +
      '</div>';
      return;
    }

    if (section) _devtoolsSection = section;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Developer Tools</div>' +
      '</div>' +
      '<div class="dash-overview-controls" style="margin-bottom:16px;">' +
        DEVTOOLS_SECTIONS.map(function (s) {
          return '<button class="dash-overview-range-btn' + (s.id === _devtoolsSection ? ' active' : '') + '" onclick="window._setDevtoolsSection(\'' + s.id + '\')">' + esc(s.label) + '</button>';
        }).join('') +
      '</div>' +
      '<div id="devtools-section-body"></div>';

    renderSection(_devtoolsSection);
  };

  window._setDevtoolsSection = function (id) {
    window._renderDevtoolsTab(id);
  };

  function renderSection(id) {
    var body = safeEl('devtools-section-body');
    if (!body) return;
    switch (id) {
      case 'system':   renderSystemDiagnostics(body);   break;
      case 'payment':  renderPaymentDiagnostics(body);  break;
      case 'database': renderDatabaseDiagnostics(body); break;
      case 'activity': renderActivityLogs(body);        break;
      case 'seed':     renderSeedUtilities(body);        break;
    }
  }

  /* ─── shared helpers ───────────────────────────────────────── */

  function diagRowHTML(id, label) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--border);font-size:var(--font-scale-sm);">' +
      '<span>' + esc(label) + '</span>' +
      '<span id="diag-status-' + id + '" style="color:var(--muted2);">Not run yet</span>' +
    '</div>';
  }

  function setDiagStatus(id, ok, detail) {
    var el = safeEl('diag-status-' + id);
    if (!el) return;
    var icon = ok === null
      ? '<i class="ph-light ph-circle-dashed" style="color:var(--muted2);"></i> '
      : ok
        ? '<i class="ph-light ph-check-circle" style="color:var(--success);"></i> '
        : '<i class="ph-light ph-x-circle" style="color:var(--danger);"></i> ';
    el.innerHTML = icon + esc(detail);
  }

  function setAuthRow(id) {
    var u = window._currentUser;
    var role = window._currentUserRole;
    if (u) {
      setDiagStatus(id, true, 'Signed in as ' + (u.email || u.uid) + ' · role ' + (role || 'unresolved'));
    } else {
      setDiagStatus(id, false, 'No authenticated session');
    }
  }

  // Shared by System Diagnostics and Database Diagnostics — one real
  // Firestore read (timed) and one real RTDB presence check (timed),
  // nothing cached, nothing simulated. prefix picks which rows to
  // update ('sys-' or 'db-').
  window._runDevtoolsConnectivity = function (prefix) {
    setDiagStatus(prefix + '-firestore', null, 'Checking…');
    setDiagStatus(prefix + '-rtdb', null, 'Checking…');

    var t0 = Date.now();
    db.collection('settings').doc('platform').get().then(function () {
      setDiagStatus(prefix + '-firestore', true, 'OK · ' + (Date.now() - t0) + 'ms');
    }).catch(function (e) {
      setDiagStatus(prefix + '-firestore', false, 'Failed: ' + (e.message || 'unknown error'));
    });

    if (!rtdb) {
      setDiagStatus(prefix + '-rtdb', false, 'Realtime Database not initialized');
      return;
    }
    var t1 = Date.now();
    rtdb.ref('.info/connected').once('value').then(function (snap) {
      var ok = snap.val() === true;
      setDiagStatus(prefix + '-rtdb', ok, ok ? ('OK · ' + (Date.now() - t1) + 'ms') : 'Not connected');
    }).catch(function (e) {
      setDiagStatus(prefix + '-rtdb', false, 'Failed: ' + (e.message || 'unknown error'));
    });
  };

  function notAvailableBlock(items) {
    return '<div class="card" style="margin-top:4px;">' +
      '<div class="card-header"><span class="card-title">Not available yet</span></div>' +
      '<div style="padding:12px 16px;">' +
        '<ul style="margin:0;padding-left:18px;color:var(--muted2);font-size:var(--font-scale-sm);line-height:1.7;">' +
          items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
        '</ul>' +
      '</div>' +
    '</div>';
  }

  /* ─── A. System Diagnostics ────────────────────────────────── */

  function renderSystemDiagnostics(body) {
    body.innerHTML =
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Live checks</span>' +
          '<button class="btn btn-sm btn-ghost" onclick="window._runDevtoolsConnectivity(\'sys\')">Run checks</button>' +
        '</div>' +
        '<div style="padding:4px 16px;">' +
          diagRowHTML('sys-firestore', 'Firestore reachability') +
          diagRowHTML('sys-rtdb', 'Realtime Database reachability') +
          diagRowHTML('sys-auth', 'Current admin session') +
        '</div>' +
      '</div>' +
      notAvailableBlock([
        'Failed admin request tracking — no client-side error handler writes failures anywhere yet',
        'Runtime JavaScript error capture',
        'Historical data-loading failure log',
        'Authentication/permission error history beyond the current session'
      ]);
    setAuthRow('sys-auth');
  }

  /* ─── B. Payment Diagnostics ───────────────────────────────── */

  function renderPaymentDiagnostics(body) {
    body.innerHTML =
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Look up an order</span></div>' +
        '<div style="padding:12px 16px;display:flex;gap:8px;">' +
          '<input class="search-input" id="devtools-order-lookup" placeholder="Order ID or order number" onkeydown="if(event.key===\'Enter\')window._lookupDevtoolsOrder()">' +
          '<button class="btn btn-sm" onclick="window._lookupDevtoolsOrder()">Look up</button>' +
        '</div>' +
        '<div id="devtools-payment-result" style="padding:0 16px 16px;"></div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Stuck / pending payments</span>' +
          '<button class="btn btn-sm btn-ghost" onclick="window._loadStuckPayments()">Refresh</button>' +
        '</div>' +
        '<div id="devtools-stuck-payments" style="padding:12px 16px;">' +
          '<div style="color:var(--muted2);font-size:var(--font-scale-sm);">Orders left unpaid for over an hour with no cancellation or confirmation. Click Refresh to check.</div>' +
        '</div>' +
      '</div>' +
      notAvailableBlock([
        'A persisted log of PayFast ITN notifications — server.js only console-logs these today, nothing is written to Firestore/RTDB',
        'Raw ITN payload history for a given order',
        'A stored signature/source-IP/amount verification audit trail (the checks run live on every notification, but the result isn’t saved anywhere)'
      ]) +
      '<div style="padding:10px 2px;color:var(--muted2);font-size:var(--font-scale-xs);">This panel is read-only — it cannot initiate a charge or mark an order paid. <strong>paidAt</strong> is set only by the server-side PayFast notification handler, after its signature, source-IP, amount-match, and PayFast server-confirmation checks all pass — never by a browser redirect or client-side claim.</div>';
  }

  function renderOrderResult(o) {
    var el = safeEl('devtools-payment-result');
    if (!el) return;
    if (!o) {
      el.innerHTML = '<div style="color:var(--muted2);font-size:var(--font-scale-sm);padding-top:4px;">No order found for that ID.</div>';
      return;
    }
    var ps = o.paymentStatus || 'unpaid';
    var status = o.status || 'pending';
    var timeline = Array.isArray(o.timeline) ? o.timeline.slice().sort(function (a, b) {
      return new Date(a.at) - new Date(b.at);
    }) : [];

    el.innerHTML =
      '<div style="padding-top:4px;display:flex;flex-direction:column;gap:6px;font-size:var(--font-scale-sm);">' +
        '<div><strong>#' + esc(o.orderNumber || o.id) + '</strong> &nbsp;<span class="badge badge-' + esc(ps) + '">' + esc(ps) + '</span> <span class="badge">' + esc(status) + '</span></div>' +
        '<div>Total: ' + fmt(o.total) + ' · Created: ' + fmtDate(o.createdAt) + ' ' + fmtTime(o.createdAt) + '</div>' +
        '<div>Paid at: ' + (o.paidAt ? (fmtDate(o.paidAt) + ' ' + fmtTime(o.paidAt)) : '—') + ' · PayFast payment ID: ' + esc(o.pfPaymentId || '—') + '</div>' +
      '</div>' +
      '<div style="margin-top:12px;">' +
        '<div class="card-title" style="margin-bottom:6px;">Timeline</div>' +
        (timeline.length
          ? timeline.map(function (e) {
              return '<div style="padding:6px 0;border-bottom:0.5px solid var(--border);font-size:var(--font-scale-sm);"><span style="color:var(--muted2);">' + fmtDate(e.at) + ' ' + fmtTime(e.at) + '</span> — ' + esc(e.text || '') + '</div>';
            }).join('')
          : '<div style="color:var(--muted2);font-size:var(--font-scale-sm);">No recorded activity on this order.</div>') +
      '</div>';
  }

  window._lookupDevtoolsOrder = function () {
    var input = ((safeEl('devtools-order-lookup') || {}).value || '').trim();
    var el = safeEl('devtools-payment-result');
    if (!input) { if (el) el.innerHTML = ''; return; }
    if (el) el.innerHTML = '<div style="color:var(--muted2);font-size:var(--font-scale-sm);padding-top:4px;">Searching…</div>';

    ordersRef.doc(input).get().then(function (doc) {
      if (doc.exists) { renderOrderResult(Object.assign({ id: doc.id }, doc.data())); return; }
      return ordersRef.where('orderNumber', '==', input).limit(1).get().then(function (snap) {
        renderOrderResult(snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data()));
      });
    }).catch(function (e) {
      console.error('[DEVTOOLS PAYMENT LOOKUP]', e);
      if (el) el.innerHTML = '<div style="color:var(--danger);font-size:var(--font-scale-sm);padding-top:4px;">Lookup failed: ' + esc(e.message || 'unknown error') + '</div>';
    });
  };

  window._loadStuckPayments = function () {
    var el = safeEl('devtools-stuck-payments');
    if (!el) return;
    el.innerHTML = '<div style="color:var(--muted2);font-size:var(--font-scale-sm);">Checking…</div>';

    // Same "last 200 orders by createdAt" shape the Home overview
    // already uses (admin-dashboard.js) — no new composite index
    // needed, since filtering by payment status happens client-side.
    ordersRef.orderBy('createdAt', 'desc').limit(200).get().then(function (snap) {
      var stuck = snap.docs
        .map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function (o) { return (o.paymentStatus || 'unpaid') === 'unpaid'; })
        .filter(window._isAbandonedOrder || function () { return false; });

      if (!stuck.length) {
        el.innerHTML = '<div style="color:var(--muted2);font-size:var(--font-scale-sm);">No stuck payments found in the last 200 orders.</div>';
        return;
      }
      el.innerHTML = stuck.slice(0, 25).map(function (o) {
        var created = o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : null;
        var ageH = created ? Math.round((Date.now() - created.getTime()) / 3600000) : 0;
        return '<div style="padding:8px 0;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;font-size:var(--font-scale-sm);">' +
          '<span>#' + esc(o.orderNumber || o.id) + '</span>' +
          '<span style="color:var(--muted2);">' + fmt(o.total) + ' · unpaid ' + ageH + 'h</span>' +
        '</div>';
      }).join('');
    }).catch(function (e) {
      console.error('[DEVTOOLS STUCK PAYMENTS]', e);
      el.innerHTML = '<div style="color:var(--danger);font-size:var(--font-scale-sm);">Query failed: ' + esc(e.message || 'unknown error') + '</div>';
    });
  };

  /* ─── C. Database Diagnostics ──────────────────────────────── */

  function renderDatabaseDiagnostics(body) {
    body.innerHTML =
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Live checks</span>' +
          '<button class="btn btn-sm btn-ghost" onclick="window._runDevtoolsConnectivity(\'db\')">Run checks</button>' +
        '</div>' +
        '<div style="padding:4px 16px;">' +
          diagRowHTML('db-firestore', 'Firestore connectivity') +
          diagRowHTML('db-rtdb', 'Realtime Database connectivity') +
        '</div>' +
      '</div>' +
      notAvailableBlock([
        'Historical permission-denied error log',
        'Failed read/write log (collection, document, timestamp)',
        'Per-operation latency history'
      ]);
  }

  /* ─── D. Admin Activity & Error Logs ───────────────────────── */

  function renderActivityLogs(body) {
    body.innerHTML =
      '<div class="card">' +
        '<div class="card-header"><span class="card-title">Admin Activity &amp; Error Logs</span></div>' +
        '<div style="padding:8px 16px 16px;">' +
          '<div class="empty-state" style="padding:20px 0;">' +
            '<div class="empty-state-icon"><i class="ph-light ph-clipboard-text"></i></div>' +
            '<div class="empty-state-text">Not available yet</div>' +
          '</div>' +
          '<div style="color:var(--muted2);font-size:var(--font-scale-sm);line-height:1.7;">' +
            'There is no stored admin-activity or error log anywhere in this app today — only console output on the server, plus each order’s own activity timeline (visible under Payment Diagnostics, scoped to that one order). Adding a real log would need a new, dedicated Firestore collection written to from server.js (API and auth failures) and from this admin client (permission denials), with secrets and payment details redacted before anything is written, plus search/filter here to query it.' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ─── E. Seed Data & Utilities ─────────────────────────────── */

  function renderSeedUtilities(body) {
    body.innerHTML =
      '<div class="card">' +
        '<div class="card-header"><span class="card-title">Seed Data &amp; Utilities</span></div>' +
        '<div style="padding:16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div style="font-size:var(--font-scale-sm);color:var(--muted2);">Writes 3 default brand/vendor records (JANEDORE, NIRIUS CO, THATO) into the vendors collection. Safe to run more than once — it upserts and never deletes existing vendors, products, or orders. Does not run automatically; only runs when you click the button below.</div>' +
          '<button class="btn btn-sm" style="align-self:flex-start;" onclick="if(window._seedDefaultVendors){window._seedDefaultVendors();}else{window._showToast(\'Seed function unavailable\',\'error\');}">Seed Default Vendors</button>' +
        '</div>' +
      '</div>';
  }

})();
