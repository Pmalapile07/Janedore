(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var fmt        = window._fmt;
  var fmtDate    = window._fmtDate;
  var mountPanel = window._mountPanel;
  var ordersRef  = window._ordersRef;

  /* ─────────────────────────────────────────────────────────
     RENDER CUSTOMERS TAB
  ───────────────────────────────────────────────────────── */
  window._renderCustomersTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Customers</div>' +
        '<input class="search-input" id="customer-search" placeholder="Search name, email..." oninput="window._filterCustomers()" style="max-width:220px;">' +
      '</div>' +
      '<div id="customers-table-wrap"><div class="empty-state"><div class="empty-state-icon">○</div><div class="empty-state-text">Loading...</div></div></div>';

    ordersRef.orderBy('createdAt','desc').limit(200).get().then(function(ords) {
      var customerMap = {};
      ords.docs.forEach(function(d) {
        var o     = Object.assign({id:d.id}, d.data());
        var email = o.customerEmail || '';
        if (!email) return;
        if (!customerMap[email]) {
          customerMap[email] = { name:o.customerName||'Guest', email:email, phone:o.customerPhone||'', orders:0, spent:0, lastOrder:o.createdAt||null };
        }
        customerMap[email].orders++;
        customerMap[email].spent += (o.subtotal||0);
        if (o.createdAt && (!customerMap[email].lastOrder || o.createdAt > customerMap[email].lastOrder))
          customerMap[email].lastOrder = o.createdAt;
      });
      window._customersData = Object.values(customerMap).sort(function(a,b){ return b.spent-a.spent; });
      renderCustomersTable(window._customersData);
    }).catch(function(e) {
      console.error('[CUSTOMERS_TAB]', e);
      var wrap = safeEl('customers-table-wrap');
      if (wrap) wrap.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: '+esc(e.message)+'</p>';
    });
  };

  function renderCustomersTable(customers) {
    var searchEl = safeEl('customer-search');
    var search   = searchEl ? (searchEl.value || '').toLowerCase() : '';
    var filtered = search
      ? customers.filter(function(c){ return (c.name+c.email).toLowerCase().indexOf(search) !== -1; })
      : customers;

    var wrap = safeEl('customers-table-wrap');
    if (!wrap) return;

    if (filtered.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">○</div><div class="empty-state-text">No customers found.</div></div>';
      return;
    }

    wrap.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Last Order</th></tr></thead>' +
      '<tbody>' +
      filtered.map(function(c) {
        return '<tr onclick="window._openCustomerDetail(\'' + esc(c.email) + '\')">' +
          '<td style="font-weight:400;">' + esc(c.name) + '</td>' +
          '<td class="cell-muted">' + esc(c.email) + '</td>' +
          '<td class="cell-muted">' + esc(c.phone||'—') + '</td>' +
          '<td>' + esc(String(c.orders)) + '</td>' +
          '<td style="font-weight:400;">' + fmt(c.spent) + '</td>' +
          '<td class="cell-muted">' + fmtDate(c.lastOrder) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window._filterCustomers = function() {
    if (window._customersData) renderCustomersTable(window._customersData);
  };

  /* ─────────────────────────────────────────────────────────
     CUSTOMER DETAIL PANEL
  ───────────────────────────────────────────────────────── */
  window._openCustomerDetail = function(email) {
    var c = (window._customersData||[]).find(function(x){ return x.email===email; });
    if (!c) return;

    var panelHTML = '<div class="slide-panel">' +
      '<button class="slide-panel-close" onclick="window._closePanel()">X</button>' +
      '<div class="ui-label" style="margin-bottom:4px;">Customer</div>' +
      '<div style="font-size:22px;font-weight:400;margin-bottom:18px;">' + esc(c.name) + '</div>' +
      '<div class="info-panel">' +
        '<div class="info-row"><span class="label">Email</span><span>' + esc(c.email) + '</span></div>' +
        '<div class="info-row"><span class="label">Phone</span><span>' + esc(c.phone||'—') + '</span></div>' +
        '<div class="info-row"><span class="label">Total Orders</span><span>' + esc(String(c.orders)) + '</span></div>' +
        '<div class="info-row"><span class="label">Total Spent</span><span>' + fmt(c.spent) + '</span></div>' +
        '<div class="info-row"><span class="label">Last Order</span><span>' + fmtDate(c.lastOrder) + '</span></div>' +
      '</div>' +
    '</div>';

    mountPanel(panelHTML);
  };

})();
