(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var fmt        = window._fmt;
  var fmtDate    = window._fmtDate;
  var showToast  = window._showToast;
  var statusBadge = window._statusBadge;
  var mountPanel = window._mountPanel;
  var closePanel = window._closePanel;
  var ordersRef  = window._ordersRef;
  var isSuperAdmin = window._isSuperAdmin;

  var role = null;

  /* ─────────────────────────────────────────────────────────
     RENDER CUSTOMERS TAB
  ───────────────────────────────────────────────────────── */
  window._renderCustomersTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    role = window._currentUserRole;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Customers</div>' +
        '<input class="search-input" id="customer-search" placeholder="Search name, email, phone..." oninput="window._filterCustomers()" style="max-width:240px;">' +
      '</div>' +
      '<div id="customers-stats" style="margin-bottom:12px;"></div>' +
      '<div id="customers-table-wrap"><div class="empty-state"><div class="empty-state-text">Loading customers...</div></div></div>';

    ordersRef.orderBy('createdAt', 'desc').limit(500).get().then(function(ords) {
      var customerMap = {};
      var orderList = [];

      ords.docs.forEach(function(d) {
        var o = Object.assign({ id: d.id }, d.data());
        orderList.push(o);

        var email = (o.customerEmail || '').toLowerCase().trim();
        if (!email) return;

        if (!customerMap[email]) {
          customerMap[email] = {
            name: o.customerName || 'Guest',
            email: email,
            phone: o.customerPhone || '',
            shippingAddress: o.shippingAddress || {},
            orders: 0,
            spent: 0,
            lastOrder: null,
            firstOrder: null,
            orderIds: [],
            status: 'active'
          };
        }

        var c = customerMap[email];
        c.orders++;
        c.spent += (o.total || o.subtotal || 0);
        c.orderIds.push(o.id);

        if (o.customerName && o.customerName !== 'Guest') c.name = o.customerName;
        if (o.customerPhone) c.phone = o.customerPhone;
        if (o.shippingAddress && o.shippingAddress.address) c.shippingAddress = o.shippingAddress;

        var orderDate = o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : null;
        if (orderDate) {
          if (!c.lastOrder || orderDate > c.lastOrder) c.lastOrder = orderDate;
          if (!c.firstOrder || orderDate < c.firstOrder) c.firstOrder = orderDate;
        }
      });

      // Store full order list for detail view
      window._allOrdersData = orderList;

      window._customersData = Object.values(customerMap).sort(function(a, b) {
        return b.spent - a.spent;
      });

      // Stats
      var totalCustomers = window._customersData.length;
      var totalRevenue = window._customersData.reduce(function(s, c) { return s + c.spent; }, 0);
      var repeatCustomers = window._customersData.filter(function(c) { return c.orders > 1; }).length;

      var statsEl = safeEl('customers-stats');
      if (statsEl) {
        statsEl.innerHTML =
          '<div class="dash-stat-grid" style="margin-bottom:0;">' +
            '<div class="dash-stat-card">' +
              '<div class="dash-stat-label">Total Customers</div>' +
              '<div class="dash-stat-value">' + totalCustomers + '</div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
              '<div class="dash-stat-label">Total Revenue</div>' +
              '<div class="dash-stat-value">' + fmt(totalRevenue) + '</div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
              '<div class="dash-stat-label">Repeat Customers</div>' +
              '<div class="dash-stat-value">' + repeatCustomers + '</div>' +
            '</div>' +
          '</div>';
      }

      renderCustomersTable(window._customersData);
    }).catch(function(e) {
      console.error('[CUSTOMERS_TAB]', e);
      var wrap = safeEl('customers-table-wrap');
      if (wrap) wrap.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-users"></i></div>' +
        '<div class="orders-empty-title">Could not load customers</div>' +
        '<div class="orders-empty-sub">Check your connection and try again.</div>' +
        '<button class="btn btn-sm btn-ghost" style="margin-top:8px;" onclick="window._renderCustomersTab()">Retry</button>' +
      '</div>';
    });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER TABLE
  ───────────────────────────────────────────────────────── */
  function renderCustomersTable(customers) {
    var searchEl = safeEl('customer-search');
    var search   = searchEl ? (searchEl.value || '').toLowerCase() : '';
    var filtered = search
      ? customers.filter(function(c) {
          return (c.name + c.email + c.phone).toLowerCase().indexOf(search) !== -1;
        })
      : customers;

    var wrap = safeEl('customers-table-wrap');
    if (!wrap) return;

    if (customers.length === 0) {
      wrap.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-users"></i></div>' +
        '<div class="orders-empty-title">No customers yet</div>' +
        '<div class="orders-empty-sub">Customers will appear here once orders start coming in.</div>' +
      '</div>';
      return;
    }

    if (filtered.length === 0) {
      wrap.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-magnifying-glass"></i></div>' +
        '<div class="orders-empty-title">No matches</div>' +
        '<div class="orders-empty-sub">Try a different search term.</div>' +
      '</div>';
      return;
    }

    wrap.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
        '<th>Customer</th>' +
        '<th>Email</th>' +
        '<th>Phone</th>' +
        '<th>Orders</th>' +
        '<th>Total Spent</th>' +
        '<th>Last Order</th>' +
        '<th></th>' +
      '</tr></thead>' +
      '<tbody>' +
      filtered.map(function(c) {
        var isRepeat = c.orders > 1;
        return '<tr onclick="window._openCustomerDetail(\'' + esc(c.email) + '\')" style="cursor:pointer;">' +
          '<td style="font-weight:500;">' +
            esc(c.name) +
            (isRepeat ? ' <span class="badge badge-paid" style="font-size:8px;margin-left:4px;">Repeat</span>' : '') +
          '</td>' +
          '<td class="cell-muted">' + esc(c.email) + '</td>' +
          '<td class="cell-muted">' + esc(c.phone || '—') + '</td>' +
          '<td>' + c.orders + '</td>' +
          '<td style="font-weight:400;">' + fmt(c.spent) + '</td>' +
          '<td class="cell-muted">' + fmtDate(c.lastOrder) + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<button class="btn btn-xs btn-ghost" onclick="window._openCustomerDetail(\'' + esc(c.email) + '\')">View</button>' +
          '</td>' +
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
    var c = (window._customersData || []).find(function(x) { return x.email === email; });
    if (!c) return;

    var canEdit = isSuperAdmin();

    // Find all orders for this customer
    var customerOrders = (window._allOrdersData || []).filter(function(o) {
      return (o.customerEmail || '').toLowerCase().trim() === email;
    }).sort(function(a, b) {
      var da = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
      var db = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
      return db - da;
    });

    var address = c.shippingAddress || {};
    var addressStr = [address.address, address.city, address.postal, address.country]
      .filter(Boolean).join(', ') || '—';

    var panelHTML =
      '<div class="slide-panel">' +
        '<button class="slide-panel-close" onclick="window._closePanel()">&#x2715;</button>' +

        // Header
        '<div class="ui-label" style="margin-bottom:4px;">Customer</div>' +
        '<div style="font-size:21px;font-weight:300;margin-bottom:4px;">' + esc(c.name) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;">' +
          (c.orders > 1 ? '<span class="badge badge-paid">Repeat Customer</span>' : '<span class="badge badge-muted">New Customer</span>') +
          '<span class="badge badge-muted">' + c.orders + ' order' + (c.orders !== 1 ? 's' : '') + '</span>' +
        '</div>' +

        // Actions
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._copyCustomerEmail(\'' + esc(c.email) + '\')">Copy Email</button>' +
          (c.phone
            ? '<button class="btn btn-sm btn-ghost" onclick="window._whatsappCustomer(\'' + esc(c.phone) + '\')">WhatsApp</button>'
            : '') +
          (canEdit
            ? '<button class="btn btn-sm btn-ghost" onclick="window._editCustomerNotes(\'' + esc(c.email) + '\')">Edit Notes</button>'
            : '') +
        '</div>' +

        // Contact info
        '<div class="card-title" style="margin-bottom:7px;">Contact</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Email</span><span>' + esc(c.email) + '</span></div>' +
          '<div class="info-row"><span class="label">Phone</span><span>' + esc(c.phone || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Shipping Address</span><span>' + esc(addressStr) + '</span></div>' +
        '</div>' +

        // Stats
        '<div class="card-title" style="margin-bottom:7px;">Overview</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Total Orders</span><span>' + c.orders + '</span></div>' +
          '<div class="info-row"><span class="label">Total Spent</span><span style="font-weight:500;">' + fmt(c.spent) + '</span></div>' +
          '<div class="info-row"><span class="label">Avg. Order Value</span><span>' + fmt(Math.round(c.spent / c.orders)) + '</span></div>' +
          '<div class="info-row"><span class="label">First Order</span><span>' + fmtDate(c.firstOrder) + '</span></div>' +
          '<div class="info-row"><span class="label">Last Order</span><span>' + fmtDate(c.lastOrder) + '</span></div>' +
        '</div>' +

        // Order history
        '<div class="card-title" style="margin-bottom:7px;">Order History (' + customerOrders.length + ')</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          (customerOrders.length === 0
            ? '<div class="info-row"><span class="label">No orders found</span></div>'
            : customerOrders.map(function(o) {
                var status = o.status || 'pending';
                var paymentStatus = o.paymentStatus || 'unpaid';
                return '<div class="info-row" style="cursor:pointer;" onclick="window._openOrderDetail(\'' + esc(o.id) + '\')">' +
                  '<span class="label">#' + esc((o.orderNumber || o.id).toString().slice(-8).toUpperCase()) + '</span>' +
                  '<span style="display:flex;gap:4px;align-items:center;">' +
                    '<span style="font-size:11px;">' + fmt(o.total || o.subtotal || 0) + '</span>' +
                    ' · ' +
                    statusBadge(status) +
                    ' · ' +
                    statusBadge(paymentStatus) +
                  '</span>' +
                '</div>';
              }).join('')) +
        '</div>' +

        // Internal notes (Super Admin only)
        (canEdit
          ? '<div class="card-title" style="margin-bottom:7px;">Internal Notes</div>' +
            '<div style="margin-bottom:14px;">' +
              '<textarea id="customer-notes-input"' +
                ' style="width:100%;border:0.5px solid var(--border-med);padding:9px 11px;font-family:Manrope,sans-serif;font-size:12px;font-weight:300;min-height:68px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;"' +
                ' placeholder="Add notes about this customer...">' +
                esc(c.notes || '') +
              '</textarea>' +
              '<button class="btn btn-sm btn-ghost" style="margin-top:7px;" onclick="window._saveCustomerNotes(\'' + esc(c.email) + '\')">Save Notes</button>' +
            '</div>'
          : '') +

      '</div>';

    mountPanel(panelHTML);
  };

  /* ─────────────────────────────────────────────────────────
     CUSTOMER ACTIONS
  ───────────────────────────────────────────────────────── */

  window._copyCustomerEmail = function(email) {
    navigator.clipboard.writeText(email)
      .then(function() { showToast('Email copied'); })
      .catch(function() { showToast('Could not copy', 'error'); });
  };

  window._whatsappCustomer = function(phone) {
    var sanitized = phone.replace(/[^\d+]/g, '');
    if (sanitized) window.open('https://wa.me/' + sanitized, '_blank', 'noopener,noreferrer');
  };

  window._editCustomerNotes = function(email) {
    // Scroll to notes textarea
    var notesEl = safeEl('customer-notes-input');
    if (notesEl) {
      notesEl.focus();
      notesEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  window._saveCustomerNotes = function(email) {
    var notesInput = safeEl('customer-notes-input');
    if (!notesInput) return;

    var notes = notesInput.value.trim();

    // Update local data
    var c = (window._customersData || []).find(function(x) { return x.email === email; });
    if (c) {
      c.notes = notes;
    }

    // Store notes in localStorage for now (since customers don't have their own collection yet)
    // TODO: move to a 'customers' collection when you build authentication
    try {
      var storedNotes = JSON.parse(localStorage.getItem('jd_customer_notes') || '{}');
      storedNotes[email] = notes;
      localStorage.setItem('jd_customer_notes', JSON.stringify(storedNotes));
      showToast('Notes saved');
    } catch (e) {
      showToast('Could not save notes', 'error');
    }
  };

  // Load notes on init
  (function loadNotes() {
    try {
      var storedNotes = JSON.parse(localStorage.getItem('jd_customer_notes') || '{}');
      // Notes will be merged when customer data is built
      window._customerNotesCache = storedNotes;
    } catch (e) {
      window._customerNotesCache = {};
    }
  })();

})();
