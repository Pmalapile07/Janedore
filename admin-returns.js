/* ─────────────────────────────────────────────────────────
   RETURNS — requests customers log on /pages/log-a-return.
   Read and updated through server.js / returns-api.js
   (/api/admin/returns), which checks the caller's role, so no Firestore
   rules change is needed.
   - A brand (VENDOR) sees returns of its own items and can Accept or
     Dispute them, with a note.
   - Only Super Admin decides: Approve (who pays return delivery) or
     Decline, then Item received, then the two-step refund (Start refund,
     then Confirm refund completed once refunded in PayFast).
   - Admin can see everything but not decide.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var fmt       = window._fmt;

  var returns = [];
  var role = '';
  var myVendorId = null;
  var filter = 'open';
  var openId = null;

  var STATUS = {
    submitted:      ['Awaiting decision', 'pending'],
    approved:       ['Approved, awaiting item', 'processing'],
    declined:       ['Declined', 'cancelled'],
    received:       ['Item received', 'processing'],
    refund_pending: ['Refund in progress', 'refund_pending'],
    refunded:       ['Refunded', 'fulfilled'],
    closed:         ['Closed', 'muted']
  };
  var OPEN = ['submitted', 'approved', 'received', 'refund_pending'];

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

  window._renderReturnsTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;">Loading...</div>';
    api('/api/admin/returns').then(function (data) {
      returns = data.returns || [];
      role = data.role || '';
      myVendorId = data.vendorId || null;
      draw();
    }).catch(function (e) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load returns: ' + esc(e.message) + '</div></div>';
    });
  };

  function brandsOf(r) {
    var seen = {};
    return (r.items || []).filter(function (i) { if (seen[i.vendorId]) return false; seen[i.vendorId] = 1; return true; })
      .map(function (i) { return { id: i.vendorId, brand: i.brand || 'JANEDORE' }; });
  }

  function draw() {
    var mc = safeEl('main-content');
    if (!mc || window._currentTab !== 'returns') return;
    var counts = { open: 0, done: 0, all: returns.length };
    returns.forEach(function (r) { counts[OPEN.indexOf(r.status) !== -1 ? 'open' : 'done']++; });
    var shown = returns.filter(function (r) {
      var isOpen = OPEN.indexOf(r.status) !== -1;
      return filter === 'all' || (filter === 'open' ? isOpen : !isOpen);
    });
    var tabs = [['open', 'Open'], ['done', 'Completed'], ['all', 'All']].map(function (t) {
      return '<button class="reports-filter' + (filter === t[0] ? ' active' : '') + '" onclick="window._setReturnsFilter(\'' + t[0] + '\')">' + t[1] + ' <span>' + counts[t[0]] + '</span></button>';
    }).join('');

    var list = shown.length ? shown.map(card).join('') :
      '<div class="empty-state"><div class="empty-state-text">' + (filter === 'open'
        ? 'No open returns. When a customer logs a return, it shows up here and in your email.' : 'Nothing here yet.') + '</div></div>';
    mc.innerHTML = '<div class="reports-page returns-admin">' +
      (role === 'VENDOR' ? '<div class="return-help">Review each return of your products and Accept or Dispute it. Janedore makes the final decision and handles the refund.</div>' : '') +
      '<div class="reports-filters">' + tabs + '</div>' + list + '</div>';
  }

  function card(r) {
    var st = STATUS[r.status] || [r.status, 'muted'];
    var expanded = openId === r.id;
    var brandNames = brandsOf(r).map(function (b) { return b.brand; }).join(', ');
    var waitingOnBrand = r.status === 'submitted' && brandsOf(r).some(function (b) { return !(r.brandResponses || {})[b.id]; });
    var disputed = Object.keys(r.brandResponses || {}).some(function (k) { return r.brandResponses[k].decision === 'dispute'; });

    var head = '<div class="report-card-head return-card-head" onclick="window._toggleReturn(\'' + esc(r.id) + '\')">' +
      '<div><div class="report-brand">' + esc(r.returnNumber) + ' · Order #' + esc(r.orderNumber) + '</div>' +
      '<div class="report-reason">' + esc(r.customerName || r.customerEmail || '') + ' · ' + esc(brandNames) + ' · ' + (r.items || []).length + ' item' + ((r.items || []).length === 1 ? '' : 's') + '</div>' +
      '<div class="report-meta">' + esc(fmtDate(r.createdAt)) +
        (disputed ? ' · <strong class="return-flag">Brand disputed</strong>' : waitingOnBrand && role !== 'VENDOR' ? ' · Waiting on brand' : '') + '</div></div>' +
      '<span class="badge badge-' + esc(st[1]) + '">' + esc(st[0]) + '</span>' +
    '</div>';
    if (!expanded) return '<div class="card report-card return-card">' + head + '</div>';

    var items = (r.items || []).map(function (i) {
      return '<div class="return-admin-item">' +
        '<div class="return-admin-item-name">' + esc(i.name) + ' <span>· ' + esc(i.brand || '') + (i.size && i.size !== 'OS' ? ' · Size ' + esc(i.size) : '') + ' · Qty ' + (i.qty || 1) + ' · ' + fmt((i.price || 0) * (i.qty || 1)) + '</span></div>' +
        '<div class="return-admin-reason"><strong>' + esc(i.reason || '') + '.</strong> ' + esc(i.details || '') + '</div>' +
      '</div>';
    }).join('');
    var photos = (r.photos || []).map(function (u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener" class="return-admin-photo" style="background-image:url(\'' + esc(u) + '\')"></a>';
    }).join('');

    var responses = brandsOf(r).map(function (b) {
      var resp = (r.brandResponses || {})[b.id];
      return '<div class="return-admin-response">' +
        '<strong>' + esc(b.brand) + ':</strong> ' + (resp
          ? (resp.decision === 'accept' ? 'Accepted' : 'Disputed') + (resp.note ? ': ' + esc(resp.note) : '') + ' <span>(' + esc(fmtDate(resp.at)) + ')</span>'
          : 'No response yet') +
      '</div>';
    }).join('');

    var timeline = (r.timeline || []).slice().reverse().map(function (t) {
      return '<div class="return-admin-log"><span>' + esc(fmtDate(t.at)) + '</span> ' + esc(t.text) + (t.by ? ' <em>(' + esc(t.by) + ')</em>' : '') + '</div>';
    }).join('');

    return '<div class="card report-card return-card is-open">' + head +
      '<div class="return-admin-body">' +
        section('Items', items) +
        (photos ? section('Customer photos', '<div class="return-admin-photos">' + photos + '</div>') : '') +
        (r.note ? section('Customer note', '<div class="report-details">' + esc(r.note) + '</div>') : '') +
        section('Brand response', responses + brandActions(r)) +
        (role !== 'VENDOR' ? section('Customer', '<div class="report-details">' + esc(r.customerName || '') + '<br><a href="mailto:' + esc(r.customerEmail) + '">' + esc(r.customerEmail) + '</a>' + (r.customerPhone ? '<br>' + esc(r.customerPhone) : '') + '</div>') : '') +
        (r.approval ? section('Decision', '<div class="report-details">Approved: ' + (r.approval.shipping === 'collection' ? 'Janedore arranges collection' : 'customer arranges and pays return delivery') + (r.approval.message ? '<br><span class="return-pre">' + esc(r.approval.message) + '</span>' : '') + '</div>') : '') +
        (r.declineReason ? section('Decision', '<div class="report-details">Declined: ' + esc(r.declineReason) + '</div>') : '') +
        section('Refund', '<div class="report-details">' + fmt(r.refundAmount || 0) + ' for the returned items (delivery not included)</div>') +
        superActions(r) +
        section('Activity', timeline) +
      '</div></div>';
  }

  function section(title, html) {
    return '<div class="return-admin-section"><div class="return-admin-title">' + esc(title) + '</div>' + html + '</div>';
  }

  function brandActions(r) {
    if (r.status !== 'submitted') return '';
    if (role !== 'VENDOR') return '';
    var mine = (r.brandResponses || {})[myVendorId];
    return '<div class="return-admin-form">' +
      '<textarea class="return-admin-input" id="ret-note-' + esc(r.id) + '" placeholder="Note for Janedore (required to dispute)">' + esc(mine && mine.note || '') + '</textarea>' +
      '<div class="report-actions">' +
        '<button class="btn btn-sm btn-primary" onclick="window._returnAction(\'' + esc(r.id) + '\',\'brand_accept\',this)">Accept return</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="window._returnAction(\'' + esc(r.id) + '\',\'brand_dispute\',this)">Dispute</button>' +
      '</div></div>';
  }

  function superActions(r) {
    if (role !== 'SUPER_ADMIN') return '';
    var id = esc(r.id);
    var btn = function (action, label, primary) {
      return '<button class="btn btn-sm ' + (primary ? 'btn-primary' : 'btn-ghost') + '" onclick="window._returnAction(\'' + id + '\',\'' + action + '\',this)">' + label + '</button>';
    };
    var body = '';
    if (r.status === 'submitted') {
      body = '<div class="return-admin-form">' +
        '<label class="return-admin-radio"><input type="radio" name="ret-ship-' + id + '" value="customer" checked> Customer arranges and pays return delivery</label>' +
        '<label class="return-admin-radio"><input type="radio" name="ret-ship-' + id + '" value="collection"> Janedore arranges collection (free for the customer)</label>' +
        '<textarea class="return-admin-input" id="ret-text-' + id + '" placeholder="Approving: return address and instructions, or collection details. Declining: the reason the customer will see."></textarea>' +
        '<div class="report-actions">' + btn('approve', 'Approve return', true) + btn('decline', 'Decline', false) + '</div></div>';
    } else if (r.status === 'approved') {
      body = '<div class="report-actions">' + btn('received', 'Mark item received', true) + '</div>';
    } else if (r.status === 'received') {
      body = '<div class="return-help">Next: refund ' + fmt(r.refundAmount || 0) + ' in your PayFast dashboard. Start the refund here first so the customer knows it is on its way.</div>' +
        '<div class="report-actions">' + btn('refund_start', 'Start refund', true) + '</div>';
    } else if (r.status === 'refund_pending') {
      body = '<div class="return-help">Once PayFast shows the refund of ' + fmt(r.refundAmount || 0) + ', confirm it here. Only then is the customer told it is completed.</div>' +
        '<div class="report-actions">' + btn('refund_confirm', 'Confirm refund completed', true) + '</div>';
    }
    if (OPEN.indexOf(r.status) !== -1) {
      body += '<div class="report-actions return-close">' + btn('close', 'Close without refund', false) + '</div>';
    }
    return body ? section('Your decision', body) : '';
  }

  window._setReturnsFilter = function (f) { filter = f; draw(); };
  window._toggleReturn = function (id) { openId = openId === id ? null : id; draw(); };

  var CONFIRM = {
    approve: 'Approve this return? The customer will be emailed your instructions.',
    decline: 'Decline this return? The customer will be emailed your reason.',
    received: 'Mark the returned item as received? The customer will be told their refund is next.',
    refund_start: 'Start the refund? The customer will be told it is being processed. Then refund them in PayFast.',
    refund_confirm: 'Have you refunded the customer in your PayFast dashboard? Only confirm once PayFast shows the refund. The customer will be told it is completed.',
    close: 'Close this return without a refund? The customer is not emailed.',
    brand_dispute: 'Send your dispute to Janedore? They will review it before deciding.'
  };

  window._returnAction = function (id, action, el) {
    var r = returns.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var payload = { action: action };
    var textEl = safeEl(action.indexOf('brand_') === 0 ? 'ret-note-' + id : 'ret-text-' + id);
    payload.text = textEl ? textEl.value.trim() : '';
    if (action === 'approve') {
      var picked = document.querySelector('input[name="ret-ship-' + id + '"]:checked');
      payload.shipping = picked ? picked.value : 'customer';
      if (payload.shipping === 'customer' && !payload.text) { showToast('Add the return address and instructions for the customer.', 'error'); return; }
    }
    if (action === 'decline' && !payload.text) { showToast('Add the reason the customer will see.', 'error'); return; }
    if (action === 'brand_dispute' && !payload.text) { showToast('Explain why you dispute this return.', 'error'); return; }
    if (action === 'close') payload.text = window.prompt('Reason for closing (for your records):', '') || '';
    else if (CONFIRM[action] && !confirm(CONFIRM[action])) return;
    if (el) el.disabled = true;
    api('/api/admin/returns/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        showToast('Return updated', 'success');
        window._renderReturnsTab();
      })
      .catch(function (e) {
        if (el) el.disabled = false;
        showToast('Error: ' + e.message, 'error');
      });
  };
})();
