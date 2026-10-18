/* ─────────────────────────────────────────────────────────
   EXCHANGES: requests customers make on /pages/exchange-an-item.
   Read and updated through server.js / exchanges-api.js
   (/api/admin/exchanges), which checks the caller's role, so no
   Firestore rules change is needed. Exchanges never become refunds.
   - A brand (VENDOR) sees exchanges of its own items, confirms it can
     supply the new size or colour (or disputes it), then marks the
     original item received and the new one dispatched with tracking.
   - Only Super Admin approves (confirming who pays postage, which is
     proposed from the reason) or declines. Approving reserves stock for
     the new item; closing an approved exchange puts it back.
   - Admin can see everything but not decide.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;

  var exchanges = [];
  var role = '';
  var myVendorId = null;
  var filter = 'open';
  var openId = null;

  var STATUS = {
    submitted:  ['Awaiting decision', 'pending'],
    approved:   ['Approved, awaiting item', 'processing'],
    declined:   ['Declined', 'cancelled'],
    received:   ['Item received, send new one', 'processing'],
    dispatched: ['New item dispatched', 'fulfilled'],
    closed:     ['Closed', 'muted']
  };
  var OPEN = ['submitted', 'approved', 'received'];

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

  function want(i) {
    return [i.wantColor && i.wantColor !== 'Default' ? i.wantColor : '', i.wantSize && i.wantSize !== 'OS' ? 'Size ' + i.wantSize : ''].filter(Boolean).join(', ') || 'A replacement';
  }

  window._renderExchangesTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;">Loading...</div>';
    api('/api/admin/exchanges').then(function (data) {
      exchanges = data.exchanges || [];
      role = data.role || '';
      myVendorId = data.vendorId || null;
      draw();
    }).catch(function (e) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load exchanges: ' + esc(e.message) + '</div></div>';
    });
  };

  function brandsOf(x) {
    var seen = {};
    return (x.items || []).filter(function (i) { if (seen[i.vendorId]) return false; seen[i.vendorId] = 1; return true; })
      .map(function (i) { return { id: i.vendorId, brand: i.brand || 'JANEDORE' }; });
  }

  function draw() {
    var mc = safeEl('main-content');
    if (!mc || window._currentTab !== 'exchanges') return;
    var counts = { open: 0, done: 0, all: exchanges.length };
    exchanges.forEach(function (x) { counts[OPEN.indexOf(x.status) !== -1 ? 'open' : 'done']++; });
    var shown = exchanges.filter(function (x) {
      var isOpen = OPEN.indexOf(x.status) !== -1;
      return filter === 'all' || (filter === 'open' ? isOpen : !isOpen);
    });
    var tabs = [['open', 'Open'], ['done', 'Completed'], ['all', 'All']].map(function (t) {
      return '<button class="reports-filter' + (filter === t[0] ? ' active' : '') + '" onclick="window._setExchangesFilter(\'' + t[0] + '\')">' + t[1] + ' <span>' + counts[t[0]] + '</span></button>';
    }).join('');
    var list = shown.length ? shown.map(card).join('') :
      '<div class="empty-state"><div class="empty-state-text">' + (filter === 'open'
        ? 'No open exchanges. When a customer asks to exchange an item, it shows up here and in your email.' : 'Nothing here yet.') + '</div></div>';
    mc.innerHTML = '<div class="reports-page returns-admin">' +
      (role === 'VENDOR' ? '<div class="return-help">Confirm that you can supply the size or colour each customer wants, or dispute it. Janedore makes the final decision. Once approved, mark the original item received when it reaches you, then send the new one and add its tracking.</div>' : '') +
      '<div class="reports-filters">' + tabs + '</div>' + list + '</div>';
  }

  function section(title, html) {
    return '<div class="return-admin-section"><div class="return-admin-title">' + esc(title) + '</div>' + html + '</div>';
  }

  function card(x) {
    var st = STATUS[x.status] || [x.status, 'muted'];
    var expanded = openId === x.id;
    var brandNames = brandsOf(x).map(function (b) { return b.brand; }).join(', ');
    var waitingOnBrand = x.status === 'submitted' && brandsOf(x).some(function (b) { return !(x.brandResponses || {})[b.id]; });
    var disputed = Object.keys(x.brandResponses || {}).some(function (k) { return x.brandResponses[k].decision === 'dispute'; });
    var postage = (x.approval ? x.approval.postage : x.postage) === 'janedore' ? 'JANEDORE pays postage' : 'Customer pays postage';

    var head = '<div class="report-card-head return-card-head" onclick="window._toggleExchange(\'' + esc(x.id) + '\')">' +
      '<div><div class="report-brand">' + esc(x.exchangeNumber) + ' · Order #' + esc(x.orderNumber) + '</div>' +
      '<div class="report-reason">' + esc(x.customerName || x.customerEmail || '') + ' · ' + esc(brandNames) + ' · ' + esc(postage) + '</div>' +
      '<div class="report-meta">' + esc(fmtDate(x.createdAt)) +
        (disputed ? ' · <strong class="return-flag">Brand disputed</strong>' : waitingOnBrand && role !== 'VENDOR' ? ' · Waiting on brand' : '') + '</div></div>' +
      '<span class="badge badge-' + esc(st[1]) + '">' + esc(st[0]) + '</span>' +
    '</div>';
    if (!expanded) return '<div class="card report-card return-card">' + head + '</div>';

    var items = (x.items || []).map(function (i) {
      return '<div class="return-admin-item">' +
        '<div class="return-admin-item-name">' + esc(i.name) + ' <span>· ' + esc(i.brand || '') + (i.color && i.color !== 'Default' ? ' · ' + esc(i.color) : '') + (i.size && i.size !== 'OS' ? ' · Size ' + esc(i.size) : '') + ' · Qty ' + (i.qty || 1) + '</span></div>' +
        '<div class="return-admin-reason"><strong>Exchange for: ' + esc(want(i)) + '.</strong></div>' +
        '<div class="return-admin-reason"><strong>' + esc(i.reason || '') + '.</strong> ' + esc(i.details || '') + '</div>' +
      '</div>';
    }).join('');
    var photos = (x.photos || []).map(function (u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener" class="return-admin-photo" style="background-image:url(\'' + esc(u) + '\')"></a>';
    }).join('');
    var responses = brandsOf(x).map(function (b) {
      var resp = (x.brandResponses || {})[b.id];
      return '<div class="return-admin-response"><strong>' + esc(b.brand) + ':</strong> ' + (resp
        ? (resp.decision === 'accept' ? 'Confirmed' : 'Disputed') + (resp.note ? ': ' + esc(resp.note) : '') + ' <span>(' + esc(fmtDate(resp.at)) + ')</span>'
        : 'No response yet') + '</div>';
    }).join('');
    var timeline = (x.timeline || []).slice().reverse().map(function (t) {
      return '<div class="return-admin-log"><span>' + esc(fmtDate(t.at)) + '</span> ' + esc(t.text) + (t.by ? ' <em>(' + esc(t.by) + ')</em>' : '') + '</div>';
    }).join('');

    return '<div class="card report-card return-card is-open">' + head +
      '<div class="return-admin-body">' +
        section('Items', items) +
        (photos ? section('Customer photos', '<div class="return-admin-photos">' + photos + '</div>') : '') +
        (x.note ? section('Customer note', '<div class="report-details">' + esc(x.note) + '</div>') : '') +
        section('Brand response', responses + brandActions(x)) +
        section('Customer', '<div class="report-details">' + esc(x.customerName || '') + (role !== 'VENDOR' ? '<br><a href="mailto:' + esc(x.customerEmail) + '">' + esc(x.customerEmail) + '</a>' : '') +
          (x.deliveryAddress ? '<br>Deliver the new item to: ' + esc(x.deliveryAddress) : '') + '</div>') +
        (x.approval ? section('Decision', '<div class="report-details">Approved: ' + (x.approval.postage === 'janedore' ? 'JANEDORE pays postage both ways' : 'customer pays postage both ways') + (x.approval.message ? '<br><span class="return-pre">' + esc(x.approval.message) + '</span>' : '') + '</div>') : '') +
        (x.declineReason ? section('Decision', '<div class="report-details">Declined: ' + esc(x.declineReason) + '</div>') : '') +
        (x.dispatch ? section('New item', '<div class="report-details">' + esc(x.dispatch.courier) + ' · ' + esc(x.dispatch.trackingNumber) + '</div>') : '') +
        goodsActions(x) +
        superActions(x) +
        section('Activity', timeline) +
      '</div></div>';
  }

  function btn(id, action, label, primary) {
    return '<button class="btn btn-sm ' + (primary ? 'btn-primary' : 'btn-ghost') + '" onclick="window._exchangeAction(\'' + id + '\',\'' + action + '\',this)">' + label + '</button>';
  }

  function brandActions(x) {
    if (x.status !== 'submitted' || role !== 'VENDOR') return '';
    var mine = (x.brandResponses || {})[myVendorId];
    var id = esc(x.id);
    return '<div class="return-admin-form">' +
      '<textarea class="return-admin-input" id="ex-note-' + id + '" placeholder="Note for Janedore (required to dispute)">' + esc(mine && mine.note || '') + '</textarea>' +
      '<div class="report-actions">' + btn(id, 'brand_accept', 'Confirm, we can supply it', true) + btn(id, 'brand_dispute', 'Dispute', false) + '</div></div>';
  }

  // Item received and new item dispatched: the brand or Super Admin.
  function goodsActions(x) {
    if (role !== 'VENDOR' && role !== 'SUPER_ADMIN') return '';
    var id = esc(x.id);
    if (x.status === 'approved') {
      return section('Original item', '<div class="return-help">Once the customer’s item has reached the brand and been checked, mark it received.</div>' +
        '<div class="report-actions">' + btn(id, 'received', 'Mark item received', true) + '</div>');
    }
    if (x.status === 'received') {
      return section('Send the new item', '<div class="return-admin-form">' +
        '<input class="return-admin-input" id="ex-courier-' + id + '" placeholder="Courier, e.g. The Courier Guy">' +
        '<input class="return-admin-input" id="ex-tracking-' + id + '" placeholder="Tracking number">' +
        '<div class="report-actions">' + btn(id, 'dispatched', 'Mark new item dispatched', true) + '</div></div>');
    }
    return '';
  }

  function superActions(x) {
    if (role !== 'SUPER_ADMIN') return '';
    var id = esc(x.id);
    var body = '';
    if (x.status === 'submitted') {
      var ours = x.postage === 'janedore';
      body = '<div class="return-admin-form">' +
        '<div class="return-help">Proposed from the reason: ' + (ours ? 'the brand sent the wrong size or item, or it is faulty, so JANEDORE pays postage.' : 'the item was sent as ordered, so the customer pays postage.') + ' Approving reserves stock for the new item.</div>' +
        '<label class="return-admin-radio"><input type="radio" name="ex-post-' + id + '" value="janedore"' + (ours ? ' checked' : '') + '> JANEDORE pays postage both ways (our fault)</label>' +
        '<label class="return-admin-radio"><input type="radio" name="ex-post-' + id + '" value="customer"' + (ours ? '' : ' checked') + '> Customer pays postage both ways</label>' +
        '<textarea class="return-admin-input" id="ex-text-' + id + '" placeholder="Approving: where to send the item and how, or collection details. Declining: the reason the customer will see."></textarea>' +
        '<div class="report-actions">' + btn(id, 'approve', 'Approve exchange', true) + btn(id, 'decline', 'Decline', false) + '</div></div>';
    }
    if (OPEN.indexOf(x.status) !== -1) {
      body += '<div class="report-actions return-close">' + btn(id, 'close', 'Close exchange', false) + '</div>';
    }
    return body ? section('Your decision', body) : '';
  }

  window._setExchangesFilter = function (f) { filter = f; draw(); };
  window._toggleExchange = function (id) { openId = openId === id ? null : id; draw(); };

  var CONFIRM = {
    approve: 'Approve this exchange? Stock for the new item is reserved and the customer is emailed your instructions.',
    decline: 'Decline this exchange? The customer will be emailed your reason.',
    received: 'Mark the original item as received? The customer will be told their new item is next.',
    dispatched: 'Mark the new item as dispatched? The customer will be emailed the tracking details.',
    brand_dispute: 'Send your dispute to Janedore? They will review it before deciding.'
  };

  window._exchangeAction = function (id, action, el) {
    var payload = { action: action };
    var textEl = safeEl(action.indexOf('brand_') === 0 ? 'ex-note-' + id : 'ex-text-' + id);
    payload.text = textEl ? textEl.value.trim() : '';
    if (action === 'approve') {
      var picked = document.querySelector('input[name="ex-post-' + id + '"]:checked');
      payload.postage = picked ? picked.value : 'customer';
      if (!payload.text) { showToast('Add the instructions for the customer.', 'error'); return; }
    }
    if (action === 'decline' && !payload.text) { showToast('Add the reason the customer will see.', 'error'); return; }
    if (action === 'brand_dispute' && !payload.text) { showToast('Explain why you dispute this exchange.', 'error'); return; }
    if (action === 'dispatched') {
      payload.courier = (safeEl('ex-courier-' + id) || {}).value || '';
      payload.trackingNumber = (safeEl('ex-tracking-' + id) || {}).value || '';
      if (!payload.courier.trim() || !payload.trackingNumber.trim()) { showToast('Add the courier and tracking number.', 'error'); return; }
    }
    if (action === 'close') {
      var reason = window.prompt('Reason for closing (for your records). Any reserved stock is put back:', '');
      if (reason === null) return;
      payload.text = reason;
    } else if (CONFIRM[action] && !confirm(CONFIRM[action])) return;
    if (el) el.disabled = true;
    api('/api/admin/exchanges/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        showToast('Exchange updated', 'success');
        window._renderExchangesTab();
      })
      .catch(function (e) {
        if (el) el.disabled = false;
        showToast('Error: ' + e.message, 'error');
      });
  };
})();
