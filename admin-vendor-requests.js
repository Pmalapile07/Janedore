/* Coming-soon brand interest leads. These are leads, not approved vendors or full applications. */
(function () {
  'use strict';
  var esc = window._esc;
  var safeEl = window._safeEl;
  var showToast = window._showToast;
  var requests = [];
  var filter = 'open';
  var opened = null;
  function api(path, opts) {
    var user = window._currentUser;
    if (!user || !user.getIdToken) return Promise.reject(new Error('Not signed in'));
    return user.getIdToken().then(function (token) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {});
      return fetch(path, opts);
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }
  function date(value) {
    if (!value) return 'Date unavailable';
    var d = new Date(value);
    return isNaN(d.getTime()) ? 'Date unavailable' : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }
  window._renderVendorRequestsTab = function () {
    var el = safeEl('main-content');
    if (!el) return;
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;">Loading vendor requests...</div>';
    api('/api/admin/vendor-requests').then(function (data) { requests = data.requests || []; draw(); })
      .catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load vendor requests: ' + esc(e.message) + '</div></div>'; });
  };
  function draw() {
    var el = safeEl('main-content');
    if (!el || window._currentTab !== 'vendorRequests') return;
    var openCount = requests.filter(function (r) { return r.status === 'new' || r.status === 'contacted'; }).length;
    var counts = { open: openCount, all: requests.length, done: requests.length - openCount };
    var shown = requests.filter(function (r) {
      return filter === 'all' || (filter === 'open' ? r.status === 'new' || r.status === 'contacted' : r.status === 'converted' || r.status === 'not_interested');
    });
    var filters = [['open', 'Open'], ['done', 'Closed'], ['all', 'All']].map(function (f) {
      return '<button class="reports-filter' + (filter === f[0] ? ' active' : '') + '" onclick="window._setVendorRequestFilter(\'' + f[0] + '\')">' + f[1] + ' <span>' + counts[f[0]] + '</span></button>';
    }).join('');
    var list = shown.length ? shown.map(card).join('') : '<div class="empty-state"><div class="empty-state-text">' + (filter === 'open' ? 'No new brand requests yet. Coming-soon brand enquiries will appear here.' : 'Nothing to show here yet.') + '</div></div>';
    el.innerHTML = '<div class="reports-page returns-admin"><div class="section-header" style="margin-bottom:10px;"><div class="section-title">Vendor Requests</div></div>' +
      '<p style="font-size:13px;color:var(--muted);margin:0 0 14px;">Early expressions of interest from brands. These are not full partnership applications or approved vendors.</p>' +
      '<div class="reports-filters">' + filters + '</div>' + list + '</div>';
  }
  function card(r) {
    var labels = { new: ['New', 'pending'], contacted: ['Contacted', 'processing'], converted: ['Converted', 'fulfilled'], not_interested: ['Not proceeding', 'cancelled'] };
    var state = labels[r.status] || labels.new;
    var head = '<div class="report-card-head return-card-head" onclick="window._toggleVendorRequest(\'' + esc(r.id) + '\')"><div>' +
      '<div class="report-brand">' + esc(r.brandName || 'Unnamed brand') + '</div><div class="report-reason">' + esc(r.email) + '</div>' +
      '<div class="report-meta">' + esc(date(r.createdAt)) + ' · Coming soon popup</div></div><span class="badge badge-' + state[1] + '">' + state[0] + '</span></div>';
    if (opened !== r.id) return '<div class="card report-card return-card">' + head + '</div>';
    var social = r.social ? '<div class="report-details">Website / Instagram: <a href="' + esc(/^https?:\/\//i.test(r.social) ? r.social : 'https://www.instagram.com/' + r.social.replace(/^@/, '')) + '" target="_blank" rel="noopener">' + esc(r.social) + '</a></div>' : '';
    var actions = '<div class="report-actions">' +
      (r.status !== 'contacted' ? '<button class="btn btn-sm btn-ghost" onclick="window._updateVendorRequest(\'' + esc(r.id) + '\',\'contacted\',this)">Mark contacted</button>' : '') +
      (r.status !== 'converted' ? '<button class="btn btn-sm btn-primary" onclick="window._updateVendorRequest(\'' + esc(r.id) + '\',\'converted\',this)">Mark converted</button>' : '') +
      (r.status !== 'not_interested' ? '<button class="btn btn-sm btn-ghost" onclick="window._updateVendorRequest(\'' + esc(r.id) + '\',\'not_interested\',this)">Not proceeding</button>' : '') +
      (r.status !== 'new' ? '<button class="btn btn-sm btn-ghost" onclick="window._updateVendorRequest(\'' + esc(r.id) + '\',\'new\',this)">Reopen</button>' : '') + '</div>';
    return '<div class="card report-card return-card is-open">' + head + '<div class="return-admin-body">' +
      '<div class="return-admin-section"><div class="return-admin-title">Contact</div><div class="report-details"><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></div>' + social + '</div>' +
      '<div class="return-admin-section"><div class="return-admin-title">Request status</div>' + actions + '</div></div></div>';
  }
  window._setVendorRequestFilter = function (value) { filter = value; draw(); };
  window._toggleVendorRequest = function (id) { opened = opened === id ? null : id; draw(); };
  window._updateVendorRequest = function (id, status, button) {
    if (button) button.disabled = true;
    api('/api/admin/vendor-requests/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify({ status: status }) })
      .then(function () { showToast('Vendor request updated.', 'success'); window._renderVendorRequestsTab(); })
      .catch(function (e) { if (button) button.disabled = false; showToast('Could not update request: ' + e.message, 'error'); });
  };
})();
