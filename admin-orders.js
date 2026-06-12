(function () {
  'use strict';

  if (!window._adminDB) return;

  var db                = window._adminDB;
  var esc               = window._esc;
  var safeEl            = window._safeEl;
  var fmt               = window._fmt;
  var fmtDate           = window._fmtDate;
  var fmtTime           = window._fmtTime;
  var showToast         = window._showToast;
  var statusBadge       = window._statusBadge;
  var mountPanel        = window._mountPanel;
  var closePanel        = window._closePanel;
  var ordersRef         = window._ordersRef;
  var productsRef       = window._productsRef;
  var ORDER_STATUSES    = window._ORDER_STATUSES;

  var draftsRef = db.collection('order_drafts');

  var COURIERS = [
    'The Courier Guy',
    'Fastway',
    'DHL',
    'Aramex',
    'DSV',
    'Internet Express',
    'MDS Collivery',
    'Rhenus',
    'Other'
  ];

  var ABANDONED_THRESHOLD_MS = 60 * 60 * 1000;

  window._selectedOrders = {};
  window._bulkMode = false;

  function isAbandoned(o) {
    if ((o.status || 'pending') !== 'pending') return false;
    if ((o.paymentStatus || 'unpaid') === 'paid') return false;
    if (!o.createdAt) return true;
    var ts = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
    return (Date.now() - ts.getTime()) > ABANDONED_THRESHOLD_MS;
  }

  // ─── RENDER ORDERS TAB ───────────────────────────────────────

  window._renderOrdersTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    // Vendor: blocked from orders collection by Firestore rules
    if (window._currentUserRole === 'VENDOR') {
      mc.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-receipt"></i></div>' +
        '<div class="orders-empty-title">Your Orders</div>' +
        '<div class="orders-empty-sub">Your sales and order data will appear here. Revenue reports are updated periodically by Janedore.</div>' +
      '</div>';
      return;
    }

    window._selectedOrders = {};
    window._bulkMode = false;

    var canUpdate = window._can('orders', 'update');

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Orders</div>' +
        '<div class="section-actions">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._refreshOrders()" title="Refresh">' +
            '<i class="ph-light ph-arrows-clockwise"></i> Refresh' +
          '</button>' +
          (canUpdate
            ? '<button class="btn btn-sm btn-ghost" id="bulk-toggle-btn" onclick="window._toggleBulkMode()" style="display:none;">' +
                '<i class="ph-light ph-check-square"></i> Select</button>' +
              '<div id="bulk-actions" style="display:none;gap:6px;">' +
                '<select class="filter-select" id="bulk-status-select" style="padding:6px 24px 6px 9px;font-size:11px;">' +
                  '<option value="">Bulk status...</option>' +
                  ORDER_STATUSES.map(function (s) {
                    return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
                  }).join('') +
                '</select>' +
                '<button class="btn btn-xs btn-primary" onclick="window._applyBulkStatus()">Apply</button>' +
                '<button class="btn btn-xs btn-ghost" onclick="window._toggleBulkMode()">Cancel</button>' +
              '</div>'
            : '') +
          (window._can('orders', 'create')
            ? '<button class="btn btn-sm btn-primary" onclick="window._openNewOrderForm()">' +
                '<i class="ph-light ph-plus"></i> New Order' +
              '</button>'
            : '') +
        '</div>' +
      '</div>' +
      '<div id="orders-toolbar-wrap"></div>' +
      '<div id="orders-table-wrap"></div>';

    loadOrders();
  };

  // ─── LOAD ────────────────────────────────────────────────────

  function loadOrders() {
    // Vendor can't read orders collection
    if (window._currentUserRole === 'VENDOR') return;

    if (!window._can('orders', 'read')) {
      var wrap = safeEl('orders-table-wrap');
      if (wrap) wrap.innerHTML = '<p style="padding:16px;color:var(--danger);font-size:12px;">Access denied.</p>';
      return;
    }

    var wrap = safeEl('orders-table-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-text">Loading orders...</div>' +
        '</div>';
    }

    ordersRef.orderBy('createdAt', 'desc').limit(200).get().then(function (snap) {
      window._ordersData = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      window._selectedOrders = {};
      renderOrdersUI(window._ordersData);
    }).catch(function (e) {
      console.error('[ORDERS_LOAD]', e);
      if (wrap) {
        wrap.innerHTML =
          '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: ' + esc(e.message) + '</p>';
      }
    });
  }

  window._refreshOrders = function () {
    showToast('Refreshing...');
    loadOrders();
  };

  // ─── BULK MODE ───────────────────────────────────────────────

  window._toggleBulkMode = function () {
    window._bulkMode = !window._bulkMode;
    window._selectedOrders = {};

    var toggleBtn = safeEl('bulk-toggle-btn');
    var bulkActions = safeEl('bulk-actions');

    if (toggleBtn) toggleBtn.style.display = window._bulkMode ? 'none' : '';
    if (bulkActions) bulkActions.style.display = window._bulkMode ? 'flex' : 'none';

    if (window._ordersData) renderOrdersTable(window._ordersData);
  };

  window._toggleOrderSelection = function (orderId, checked) {
    if (checked) {
      window._selectedOrders[orderId] = true;
    } else {
      delete window._selectedOrders[orderId];
    }
    updateBulkCount();
  };

  window._toggleAllOrders = function (checked) {
    if (checked && window._ordersData) {
      window._ordersData.forEach(function (o) {
        window._selectedOrders[o.id] = true;
      });
    } else {
      window._selectedOrders = {};
    }
    if (window._ordersData) renderOrdersTable(window._ordersData);
    updateBulkCount();
  };

  function updateBulkCount() {
    var count = Object.keys(window._selectedOrders).length;
    var bulkActions = safeEl('bulk-actions');
    if (bulkActions) {
      var select = bulkActions.querySelector('select');
      if (select && count > 0) {
        select.options[0].textContent = count + ' order' + (count !== 1 ? 's' : '') + ' selected';
      } else if (select) {
        select.options[0].textContent = 'Bulk status...';
      }
    }
  }

  window._applyBulkStatus = function () {
    var status = (safeEl('bulk-status-select') || {}).value;
    if (!status) { showToast('Select a status first', 'error'); return; }
    if (ORDER_STATUSES.indexOf(status) === -1) { showToast('Invalid status', 'error'); return; }

    var ids = Object.keys(window._selectedOrders);
    if (ids.length === 0) { showToast('No orders selected', 'error'); return; }

    if (!confirm('Update ' + ids.length + ' order' + (ids.length !== 1 ? 's' : '') + ' to "' + status + '"?')) return;

    var batch = db.batch();
    var now = new Date().toISOString();
    ids.forEach(function (id) {
      batch.update(ordersRef.doc(id), { status: status, updatedAt: now });
    });

    batch.commit().then(function () {
      showToast(ids.length + ' order' + (ids.length !== 1 ? 's' : '') + ' updated to ' + status);
      ids.forEach(function (id) {
        var o = (window._ordersData || []).find(function (x) { return x.id === id; });
        if (o) o.status = status;
      });
      window._selectedOrders = {};
      window._bulkMode = false;
      window._toggleBulkMode();
      renderOrdersTable(window._ordersData);
    }).catch(function (e) {
      showToast('Error: ' + e.message, 'error');
    });
  };

  // ─── RENDER UI ───────────────────────────────────────────────

  function renderOrdersUI(orders) {
    var toolbarWrap = safeEl('orders-toolbar-wrap');
    var tableWrap   = safeEl('orders-table-wrap');
    if (!toolbarWrap || !tableWrap) return;

    var toggleBtn = safeEl('bulk-toggle-btn');
    if (toggleBtn) toggleBtn.style.display = orders.length > 0 && !window._bulkMode ? '' : 'none';

    if (orders.length === 0) {
      toolbarWrap.innerHTML = '';
      tableWrap.innerHTML   = renderEmptyState(false);
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    toolbarWrap.innerHTML =
      '<div class="toolbar" style="margin-bottom:12px;">' +
        '<input class="search-input" id="order-search"' +
          ' placeholder="Search by name, email, order ID..."' +
          ' oninput="window._filterOrders()"' +
          ' style="min-width:180px;">' +
        '<select class="filter-select" id="order-status-filter" onchange="window._filterOrders()">' +
          '<option value="">All Orders</option>' +
          '<option value="abandoned">Abandoned</option>' +
          ORDER_STATUSES.map(function (s) {
            return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
          }).join('') +
        '</select>' +
        '<select class="filter-select" id="order-payment-filter" onchange="window._filterOrders()">' +
          '<option value="">All Payments</option>' +
          '<option value="paid">Paid</option>' +
          '<option value="unpaid">Unpaid</option>' +
          '<option value="refunded">Refunded</option>' +
        '</select>' +
        '<div class="toolbar-spacer"></div>' +
        '<span id="orders-count" class="ui-label"></span>' +
      '</div>';

    renderOrdersTable(orders);
  }

  // ─── RENDER TABLE ────────────────────────────────────────────

  function renderOrdersTable(orders) {
    var statusFilterEl  = safeEl('order-status-filter');
    var paymentFilterEl = safeEl('order-payment-filter');
    var searchEl        = safeEl('order-search');

    var statusFilter  = statusFilterEl  ? statusFilterEl.value  : '';
    var paymentFilter = paymentFilterEl ? paymentFilterEl.value : '';
    var search        = searchEl ? (searchEl.value || '').toLowerCase() : '';

    var filtered = orders.filter(function (o) {
      if (statusFilter === 'abandoned') {
        if (!isAbandoned(o)) return false;
      } else if (statusFilter) {
        if ((o.status || 'pending') !== statusFilter) return false;
      }
      if (paymentFilter && (o.paymentStatus || 'unpaid') !== paymentFilter) return false;
      if (search) {
        var hay = (
          o.id +
          (o.customerEmail  || '') +
          (o.customerName   || '') +
          (o.orderNumber    || '')
        ).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    var countEl = safeEl('orders-count');
    if (countEl) countEl.textContent = filtered.length + ' order' + (filtered.length !== 1 ? 's' : '');

    var wrap = safeEl('orders-table-wrap');
    if (!wrap) return;

    if (filtered.length === 0) {
      wrap.innerHTML = renderEmptyState(true);
      return;
    }

    var abandonedCount = orders.filter(isAbandoned).length;
    var bannerHTML = '';
    if (abandonedCount > 0 && statusFilter !== 'abandoned') {
      bannerHTML =
        '<div class="orders-abandoned-banner" onclick="window._filterToAbandoned()">' +
          '<i class="ph-light ph-warning-circle" style="font-size:15px;flex-shrink:0;"></i>' +
          '<span>' + abandonedCount + ' abandoned order' + (abandonedCount !== 1 ? 's' : '') +
            ' — payment never confirmed.</span>' +
          '<span class="orders-abandoned-link">View <i class="ph-light ph-arrow-right" style="font-size:11px;"></i></span>' +
        '</div>';
    }

    var allSelected = filtered.length > 0 && filtered.every(function (o) { return window._selectedOrders[o.id]; });

    wrap.innerHTML =
      bannerHTML +
      '<div class="table-wrap">' +
        '<table class="data-table">' +
          '<thead><tr>' +
            (window._bulkMode ? '<th style="width:34px;"><input type="checkbox" onchange="window._toggleAllOrders(this.checked)"' + (allSelected ? ' checked' : '') + ' style="cursor:pointer;"></th>' : '') +
            '<th>Order</th>' +
            '<th>Customer</th>' +
            '<th>Items</th>' +
            '<th>Total</th>' +
            '<th>Payment</th>' +
            '<th>Status</th>' +
            '<th>Date</th>' +
            '<th></th>' +
          '</tr></thead>' +
          '<tbody>' +
          filtered.map(function (o) {
            var abandoned = isAbandoned(o);
            var isSelected = !!window._selectedOrders[o.id];
            return '<tr onclick="' + (window._bulkMode ? 'window._toggleOrderSelection(\'' + esc(o.id) + '\',' + !isSelected + ');event.stopPropagation();' : 'window._openOrderDetail(\'' + esc(o.id) + '\')') + '"' +
              (abandoned && !window._bulkMode ? ' class="order-row-abandoned"' : '') +
              (isSelected ? ' style="background:var(--accent-soft);"' : '') + '>' +
              (window._bulkMode
                ? '<td onclick="event.stopPropagation();"><input type="checkbox"' + (isSelected ? ' checked' : '') + ' onchange="window._toggleOrderSelection(\'' + esc(o.id) + '\',this.checked)" style="cursor:pointer;"></td>'
                : '') +
              '<td>' +
                '<span style="font-size:11.5px;font-weight:500;">' +
                  '#' + esc((o.orderNumber || o.id).toString().slice(-8).toUpperCase()) +
                '</span>' +
                (abandoned && !window._bulkMode
                  ? '<div><span class="badge badge-warning" style="font-size:9px;padding:2px 6px;">Abandoned</span></div>'
                  : '') +
              '</td>' +
              '<td>' +
                '<div style="font-weight:400;">' + esc(o.customerName  || 'Guest') + '</div>' +
                '<div class="cell-muted">'        + esc(o.customerEmail || '')      + '</div>' +
              '</td>' +
              '<td class="cell-muted">' + esc(String(o.itemCount || 0)) + '</td>' +
              '<td style="font-weight:400;">' + fmt(o.total || o.subtotal || 0) + '</td>' +
              '<td>' + statusBadge(o.paymentStatus || 'unpaid') + '</td>' +
              '<td>' + statusBadge(o.status        || 'pending') + '</td>' +
              '<td class="cell-muted">' + fmtDate(o.createdAt) + '</td>' +
              '<td onclick="event.stopPropagation()">' +
                '<button class="btn btn-xs btn-ghost"' +
                  ' onclick="window._openOrderDetail(\'' + esc(o.id) + '\')">View</button>' +
              '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  window._filterOrders = function () {
    if (window._ordersData) renderOrdersTable(window._ordersData);
  };

  window._filterToAbandoned = function () {
    var el = safeEl('order-status-filter');
    if (el) { el.value = 'abandoned'; window._filterOrders(); }
  };

  // ─── EMPTY STATE ─────────────────────────────────────────────

  function renderEmptyState(isFiltered) {
    var canCreate = window._can('orders', 'create');
    var role = window._currentUserRole;

    var subtitle;
    if (isFiltered) {
      subtitle = 'No orders match your current filters. Try adjusting your search or filter.';
    } else if (role === 'ADMIN') {
      subtitle = 'Orders from all brands will appear here once customers start placing them.' +
        (canCreate ? ' You can also create an order manually for phone or in-person sales.' : '');
    } else {
      subtitle = 'Orders placed on your store will appear here.' +
        (canCreate ? ' You can also create an order manually for phone or in-person sales.' : '');
    }

    return '<div class="orders-empty-state">' +
      '<div class="orders-empty-icon"><i class="ph-light ph-receipt"></i></div>' +
      '<div class="orders-empty-title">Manage your orders</div>' +
      '<div class="orders-empty-sub">' + subtitle + '</div>' +
      (!isFiltered && canCreate
        ? '<button class="orders-empty-btn" onclick="window._openNewOrderForm()">' +
            '<i class="ph-light ph-plus" style="font-size:15px;"></i>' +
            'Create your first order' +
          '</button>'
        : (isFiltered
          ? '<button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="window._clearOrderFilters()">Clear filters</button>'
          : '')) +
    '</div>';
  }

  window._clearOrderFilters = function () {
    var s = safeEl('order-status-filter');
    var p = safeEl('order-payment-filter');
    var q = safeEl('order-search');
    if (s) s.value = ''; if (p) p.value = ''; if (q) q.value = '';
    window._filterOrders();
  };

  // ─── NEW ORDER FORM ──────────────────────────────────────────

  window._openNewOrderForm = function (draftId, draftData) {
    if (!window._guard('orders', 'create')) return;

    productsRef.get().then(function (snap) {
      var products = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      renderNewOrderForm(products, draftId || null, draftData || null);
    }).catch(function (e) {
      showToast('Could not load products: ' + e.message, 'error');
    });
  };

  function renderNewOrderForm(products, draftId, draftData) {
    var mc = safeEl('main-content');
    if (!mc) return;

    var d = draftData || {};
    window._newOrderItems = d.items ? d.items.slice() : [];

    mc.innerHTML =
      '<button class="back-link" onclick="window._renderOrdersTab()">' +
        '<i class="ph-light ph-arrow-left"></i> Orders' +
      '</button>' +
      '<div class="section-header" style="margin-bottom:16px;">' +
        '<div class="section-title">' + (draftId ? 'Edit Draft' : 'New Order') + '</div>' +
        '<div class="section-actions">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._saveOrderDraft(\'' + esc(draftId || '') + '\')">' +
            '<i class="ph-light ph-floppy-disk"></i> Save Draft' +
          '</button>' +
          '<button class="btn btn-sm btn-primary" onclick="window._submitNewOrder(\'' + esc(draftId || '') + '\')">' +
            '<i class="ph-light ph-check"></i> Place Order' +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Customer</span></div>' +
        '<div class="form-group">' +
          '<label>Full Name</label>' +
          '<input id="no-customer-name" placeholder="e.g. Lerato Dlamini" value="' + esc(d.customerName || '') + '">' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Email</label>' +
            '<input id="no-customer-email" type="email" placeholder="email@example.com" value="' + esc(d.customerEmail || '') + '">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Phone</label>' +
            '<input id="no-customer-phone" type="tel" placeholder="+27 ..." value="' + esc(d.customerPhone || '') + '">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Products</span></div>' +
        '<div style="padding:12px 16px;">' +
          '<select id="no-product-picker" class="filter-select" style="width:100%;margin-bottom:10px;" onchange="window._noPickProduct(this)">' +
            '<option value="">Select a product to add...</option>' +
            products.map(function (p) {
              var price = p.price || (p.variants && p.variants[0] && p.variants[0].price) || 0;
              return '<option value="' + esc(p.id) + '"' +
                ' data-name="'     + esc(p.name     || '') + '"' +
                ' data-price="'    + price                 + '"' +
                ' data-brand="'    + esc(p.brand    || '') + '"' +
                ' data-vendor-id="' + esc(p.vendorId || '') + '">' +
                esc(p.name || 'Unnamed') + ' — ' + fmt(price) +
              '</option>';
            }).join('') +
          '</select>' +
          '<div id="no-items-list"></div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Shipping Address</span></div>' +
        '<div class="form-group">' +
          '<label>Street Address</label>' +
          '<input id="no-address" placeholder="123 Example Street" value="' + esc(d.shippingAddress || '') + '">' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>City</label>' +
            '<input id="no-city" placeholder="Johannesburg" value="' + esc(d.city || '') + '">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Province</label>' +
            '<input id="no-province" placeholder="Gauteng" value="' + esc(d.province || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Postal Code</label>' +
            '<input id="no-postal" placeholder="2000" value="' + esc(d.postalCode || '') + '">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Country</label>' +
            '<input id="no-country" placeholder="South Africa" value="' + esc(d.country || 'South Africa') + '">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Payment</span></div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0 16px;">' +
            '<label>Payment Status</label>' +
            '<select id="no-payment-status">' +
              '<option value="unpaid"'   + ((!d.paymentStatus || d.paymentStatus === 'unpaid')   ? ' selected' : '') + '>Unpaid</option>' +
              '<option value="paid"'     + (d.paymentStatus === 'paid'     ? ' selected' : '') + '>Paid</option>' +
              '<option value="refunded"' + (d.paymentStatus === 'refunded' ? ' selected' : '') + '>Refunded</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="padding:0 16px;">' +
            '<label>Payment Method</label>' +
            '<select id="no-payment-method">' +
              '<option value="eft"'   + ((!d.paymentMethod || d.paymentMethod === 'eft')   ? ' selected' : '') + '>EFT / Bank Transfer</option>' +
              '<option value="card"'  + (d.paymentMethod === 'card'  ? ' selected' : '') + '>Card</option>' +
              '<option value="cash"'  + (d.paymentMethod === 'cash'  ? ' selected' : '') + '>Cash</option>' +
              '<option value="yoco"'  + (d.paymentMethod === 'yoco'  ? ' selected' : '') + '>Yoco</option>' +
              '<option value="other"' + (d.paymentMethod === 'other' ? ' selected' : '') + '>Other</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="form-row" style="margin-top:0;">' +
          '<div class="form-group" style="padding:0 16px;">' +
            '<label>Shipping Fee (R)</label>' +
            '<input id="no-shipping" type="number" min="0" placeholder="0.00"' +
              ' value="' + esc(String(d.shippingFee || '0')) + '"' +
              ' oninput="window._noRecalcTotal()">' +
          '</div>' +
          '<div class="form-group" style="padding:0 16px;">' +
            '<label>Discount (R)</label>' +
            '<input id="no-discount" type="number" min="0" placeholder="0.00"' +
              ' value="' + esc(String(d.discount || '0')) + '"' +
              ' oninput="window._noRecalcTotal()">' +
          '</div>' +
        '</div>' +
        '<div id="no-totals" style="margin:4px 16px 14px;background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--r-sm);overflow:hidden;"></div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:80px;">' +
        '<div class="card-header"><span class="card-title">Internal Notes</span></div>' +
        '<div class="form-group">' +
          '<label>Notes</label>' +
          '<textarea id="no-notes" placeholder="Internal notes — not visible to customer...">' +
            esc(d.internalNotes || '') +
          '</textarea>' +
        '</div>' +
      '</div>' +

      '<div class="no-action-bar">' +
        '<button class="btn btn-ghost" onclick="window._renderOrdersTab()">' +
          '<i class="ph-light ph-x"></i> Cancel' +
        '</button>' +
        '<button class="btn btn-ghost" onclick="window._saveOrderDraft(\'' + esc(draftId || '') + '\')">' +
          '<i class="ph-light ph-floppy-disk"></i> Save Draft' +
        '</button>' +
        '<button class="btn btn-primary" onclick="window._submitNewOrder(\'' + esc(draftId || '') + '\')">' +
          '<i class="ph-light ph-check"></i> Place Order' +
        '</button>' +
      '</div>';

    renderOrderItems();
    window._noRecalcTotal();
  }

  // ─── PRODUCT PICKER ──────────────────────────────────────────

  window._noPickProduct = function (select) {
    var opt = select.options[select.selectedIndex];
    if (!opt || !opt.value) return;

    var id       = opt.value;
    var name     = opt.getAttribute('data-name')      || '';
    var price    = parseFloat(opt.getAttribute('data-price'))  || 0;
    var brand    = opt.getAttribute('data-brand')     || '';
    var vendorId = opt.getAttribute('data-vendor-id') || '';

    var existing = (window._newOrderItems || []).filter(function (i) { return i.productId === id; })[0];
    if (existing) {
      existing.qty++;
    } else {
      window._newOrderItems.push({
        productId: id, name: name, price: price, brand: brand, vendorId: vendorId, qty: 1
      });
    }

    select.value = '';
    renderOrderItems();
    window._noRecalcTotal();
  };

  function renderOrderItems() {
    var listEl = safeEl('no-items-list');
    if (!listEl) return;

    var items = window._newOrderItems || [];
    if (items.length === 0) {
      listEl.innerHTML =
        '<div style="text-align:center;padding:20px 0;color:var(--muted2);font-size:12px;">No products added yet</div>';
      return;
    }

    listEl.innerHTML = items.map(function (item, idx) {
      return '<div class="no-item-row">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:400;">' + esc(item.name) + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
            fmt(item.price) + ' each' +
            (item.brand ? ' · ' + esc(item.brand) : '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
          '<button class="no-qty-btn" onclick="window._noChangeQty(' + idx + ',-1)"><i class="ph-light ph-minus"></i></button>' +
          '<span style="font-size:13px;font-weight:500;min-width:18px;text-align:center;">' + item.qty + '</span>' +
          '<button class="no-qty-btn" onclick="window._noChangeQty(' + idx + ',1)"><i class="ph-light ph-plus"></i></button>' +
          '<span style="font-size:13px;font-weight:500;min-width:52px;text-align:right;">' + fmt(item.price * item.qty) + '</span>' +
          '<button class="no-qty-btn no-qty-remove" onclick="window._noRemoveItem(' + idx + ')"><i class="ph-light ph-x"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window._noChangeQty = function (idx, delta) {
    var items = window._newOrderItems || [];
    if (!items[idx]) return;
    items[idx].qty = Math.max(1, items[idx].qty + delta);
    renderOrderItems();
    window._noRecalcTotal();
  };

  window._noRemoveItem = function (idx) {
    (window._newOrderItems || []).splice(idx, 1);
    renderOrderItems();
    window._noRecalcTotal();
  };

  // ─── TOTALS ──────────────────────────────────────────────────

  window._noRecalcTotal = function () {
    var totalsEl = safeEl('no-totals');
    if (!totalsEl) return;

    var items    = window._newOrderItems || [];
    var subtotal = items.reduce(function (s, i) { return s + (i.price * i.qty); }, 0);
    var shipping = parseFloat((safeEl('no-shipping') || {}).value) || 0;
    var discount = parseFloat((safeEl('no-discount') || {}).value) || 0;
    var total    = Math.max(0, subtotal + shipping - discount);

    totalsEl.innerHTML =
      '<div class="info-row"><span class="label">Subtotal</span><span>' + fmt(subtotal) + '</span></div>' +
      '<div class="info-row"><span class="label">Shipping</span><span>' + fmt(shipping) + '</span></div>' +
      (discount > 0
        ? '<div class="info-row"><span class="label">Discount</span><span style="color:var(--success);">- ' + fmt(discount) + '</span></div>'
        : '') +
      '<div class="info-row" style="border-top:0.5px solid var(--border);">' +
        '<span class="label" style="color:var(--text);font-weight:600;">Total</span>' +
        '<span style="font-size:15px;font-weight:600;">' + fmt(total) + '</span>' +
      '</div>';
  };

  // ─── BUILD PAYLOAD ───────────────────────────────────────────

  function buildOrderPayload(status) {
    var items    = window._newOrderItems || [];
    var subtotal = items.reduce(function (s, i) { return s + (i.price * i.qty); }, 0);
    var shipping = parseFloat((safeEl('no-shipping') || {}).value) || 0;
    var discount = parseFloat((safeEl('no-discount') || {}).value) || 0;
    var total    = Math.max(0, subtotal + shipping - discount);

    var vendorIds = [];
    items.forEach(function (item) {
      if (item.vendorId && vendorIds.indexOf(item.vendorId) === -1) {
        vendorIds.push(item.vendorId);
      }
    });

    return {
      customerName:      (safeEl('no-customer-name')  || {}).value || '',
      customerEmail:     (safeEl('no-customer-email') || {}).value || '',
      customerPhone:     (safeEl('no-customer-phone') || {}).value || '',
      shippingAddress:   (safeEl('no-address')        || {}).value || '',
      city:              (safeEl('no-city')            || {}).value || '',
      province:          (safeEl('no-province')        || {}).value || '',
      postalCode:        (safeEl('no-postal')          || {}).value || '',
      country:           (safeEl('no-country')         || {}).value || 'South Africa',
      paymentStatus:     (safeEl('no-payment-status')  || {}).value || 'unpaid',
      paymentMethod:     (safeEl('no-payment-method')  || {}).value || 'eft',
      shippingFee:       shipping,
      discount:          discount,
      subtotal:          subtotal,
      total:             total,
      itemCount:         items.reduce(function (s, i) { return s + i.qty; }, 0),
      items:             items,
      vendorIds:         vendorIds,
      internalNotes:     (safeEl('no-notes') || {}).value || '',
      status:            status || 'pending',
      fulfillmentStatus: 'unfulfilled',
      payoutStatus:      'pending',
      source:            'manual',
      createdBy:         (window._currentUser && window._currentUser.uid) || null
    };
  }

  // ─── SAVE DRAFT ──────────────────────────────────────────────

  window._saveOrderDraft = function (existingDraftId) {
    if (!window._guard('orders', 'create')) return;
    var payload = buildOrderPayload('draft');
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    var promise = existingDraftId
      ? draftsRef.doc(existingDraftId).set(payload)
      : draftsRef.add(payload);

    promise.then(function () {
      showToast('Draft saved');
      window._renderOrdersTab();
    }).catch(function (e) {
      console.error('[SAVE_DRAFT]', e);
      showToast('Error saving draft: ' + e.message, 'error');
    });
  };

  // ─── SUBMIT ORDER ────────────────────────────────────────────

  window._submitNewOrder = function (draftId) {
    if (!window._guard('orders', 'create')) return;

    var name = (safeEl('no-customer-name') || {}).value || '';
    if (!name.trim()) { showToast('Please enter a customer name', 'error'); return; }
    if (!window._newOrderItems || window._newOrderItems.length === 0) {
      showToast('Please add at least one product', 'error'); return;
    }

    var payload = buildOrderPayload('pending');
    payload.createdAt   = firebase.firestore.FieldValue.serverTimestamp();
    payload.orderNumber = 'ORD-' + Date.now();

    ordersRef.add(payload).then(function (ref) {
      if (draftId) draftsRef.doc(draftId).delete().catch(function () {});
      showToast('Order #' + ref.id.substring(0, 8).toUpperCase() + ' created');
      window._renderOrdersTab();
    }).catch(function (e) {
      console.error('[SUBMIT_ORDER]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  // ─── ORDER DETAIL PANEL ──────────────────────────────────────

  window._openOrderDetail = function (orderId) {
    if (!orderId || typeof orderId !== 'string') return;
    if (!window._can('orders', 'read')) return;

    var o = (window._ordersData || []).filter(function (x) { return x.id === orderId; })[0];

    var panelHTML =
      '<div class="slide-panel" style="width:min(92vw,460px);">' +
        '<button class="slide-panel-close" onclick="window._closePanel()">&#x2715;</button>' +
        '<div class="ui-label" style="margin-bottom:4px;">Order</div>' +
        '<div style="font-size:21px;font-weight:400;margin-bottom:18px;">' +
          '#' + esc(orderId.substring(0, 14)) +
        '</div>' +
        (o
          ? renderOrderDetailContent(o, orderId)
          : '<div id="order-detail-loading" style="color:var(--muted);font-size:13px;">Loading...</div>') +
      '</div>';

    mountPanel(panelHTML);

    if (!o) {
      ordersRef.doc(orderId).get().then(function (doc) {
        if (!doc.exists) return;
        var data  = Object.assign({ id: doc.id }, doc.data());
        var loadEl = safeEl('order-detail-loading');
        if (loadEl) loadEl.outerHTML = renderOrderDetailContent(data, orderId);
      }).catch(function (e) { console.error('[ORDER_DETAIL_FETCH]', e); });
    }
  };

  function renderOrderDetailContent(o, orderId) {
    var canUpdate  = window._can('orders', 'update');
    var canRefund  = window._can('orders', 'approve');
    var abandoned  = isAbandoned(o);
    var html       = '';

    if (abandoned) {
      html +=
        '<div class="orders-abandoned-banner" style="margin-bottom:14px;cursor:default;">' +
          '<i class="ph-light ph-warning-circle" style="font-size:15px;flex-shrink:0;"></i>' +
          '<span>This order was abandoned — payment was never confirmed.</span>' +
        '</div>';
    }

    html +=
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">' +
        statusBadge(o.status) +
        statusBadge(o.paymentStatus || 'unpaid') +
        statusBadge(o.fulfillmentStatus || 'unfulfilled') +
      '</div>';

    html += '<div class="card-title" style="margin-bottom:8px;">Order Progress</div>';
    html += renderOrderTimeline(o);

    html +=
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;margin-top:14px;">' +
        '<button class="btn btn-sm btn-ghost" onclick="window._copyOrderId(\'' + esc(orderId) + '\')">Copy #</button>' +
        (o.customerPhone
          ? '<button class="btn btn-sm btn-ghost" onclick="window._whatsappCustomer(\'' + esc(o.customerPhone) + '\')">WhatsApp</button>'
          : '') +
        '<button class="btn btn-sm btn-ghost" onclick="window._printPackingSlip(\'' + esc(orderId) + '\')">Packing Slip</button>' +
        (canRefund
          ? '<button class="btn btn-sm btn-danger" onclick="window._quickRefund(\'' + esc(orderId) + '\')">Refund</button>'
          : '') +
      '</div>';

    html +=
      '<div class="card-title" style="margin-bottom:7px;">Customer</div>' +
      '<div class="info-panel" style="margin-bottom:14px;">' +
        '<div class="info-row"><span class="label">Name</span><span>'  + esc(o.customerName  || '—') + '</span></div>' +
        '<div class="info-row"><span class="label">Email</span><span>' + esc(o.customerEmail || '—') + '</span></div>' +
        '<div class="info-row"><span class="label">Phone</span><span>' + esc(o.customerPhone || '—') + '</span></div>' +
      '</div>';

    if (o.items && o.items.length > 0) {
      html +=
        '<div class="card-title" style="margin-bottom:7px;">Items (' + o.items.length + ')</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">';
      o.items.forEach(function (item) {
        html +=
          '<div class="info-row">' +
            '<span class="label">' + esc(item.name) + ' × ' + item.qty + '</span>' +
            '<span>' + fmt((item.price || 0) * item.qty) + '</span>' +
          '</div>';
      });
      html +=
          '<div class="info-row" style="border-top:0.5px solid var(--border);font-weight:500;">' +
            '<span class="label">Total</span>' +
            '<span>' + fmt(o.total || o.subtotal || 0) + '</span>' +
          '</div>' +
        '</div>';
    }

    if (o.shippingAddress) {
      html +=
        '<div class="card-title" style="margin-bottom:7px;">Shipping</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Address</span><span>'  + esc(o.shippingAddress || o.city || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">City</span><span>'     + esc(o.city || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Province</span><span>' + esc(o.province || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Tracking</span><span>' + esc(o.trackingNumber || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Courier</span><span>'  + esc(o.courier || '—') + '</span></div>' +
        '</div>';
    }

    if (canRefund) {
      html +=
        '<div class="card-title" style="margin-bottom:7px;">Revenue</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Subtotal</span><span>'         + fmt(o.subtotal        || 0) + '</span></div>' +
          '<div class="info-row"><span class="label">Shipping</span><span>'         + fmt(o.shippingFee     || 0) + '</span></div>' +
          '<div class="info-row"><span class="label">Total</span><span>'            + fmt(o.total           || 0) + '</span></div>' +
          '<div class="info-row"><span class="label">Platform Revenue</span><span>' + fmt(o.platformRevenue || 0) + '</span></div>' +
          '<div class="info-row"><span class="label">Payout Status</span><span>'    + statusBadge(o.payoutStatus || 'pending') + '</span></div>' +
        '</div>';

      if (o.vendorPayouts && Object.keys(o.vendorPayouts).length > 0) {
        html += '<div class="card-title" style="margin-bottom:7px;">Vendor Payouts</div>' +
          '<div class="info-panel" style="margin-bottom:14px;">';
        Object.keys(o.vendorPayouts).forEach(function (vid) {
          var vp = o.vendorPayouts[vid];
          html +=
            '<div class="info-row">' +
              '<span class="label">' + esc(vid) + (vp.isHouseBrand ? ' (house)' : '') + '</span>' +
              '<span>' + fmt(vp.payout) + '</span>' +
            '</div>';
        });
        html += '</div>';
      }
    }

    if (canUpdate) {
      html +=
        '<div class="card-title" style="margin-bottom:8px;">Update Status</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px;">' +
          ORDER_STATUSES.map(function (s) {
            if (s === 'refunded' && !canRefund) return '';
            return '<button class="btn btn-xs ' + (o.status === s ? 'btn-primary' : 'btn-ghost') + '"' +
              ' onclick="window._updateOrderStatus(\'' + esc(orderId) + '\',\'' + esc(s) + '\')">' +
              esc(s) + '</button>';
          }).join('') +
        '</div>' +

        '<div style="margin-bottom:12px;">' +
          '<div class="card-title" style="margin-bottom:7px;">Courier &amp; Tracking</div>' +
          '<select id="courier-select" style="width:100%;margin-bottom:6px;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:7px;padding:8px 11px;font-family:Manrope,sans-serif;font-size:12px;color:var(--text);outline:none;">' +
            '<option value="">Select courier...</option>' +
            COURIERS.map(function (c) {
              return '<option value="' + c + '"' + (o.courier === c ? ' selected' : '') + '>' + c + '</option>';
            }).join('') +
          '</select>' +
          '<div style="display:flex;gap:6px;">' +
            '<input id="tracking-input" value="' + esc(o.trackingNumber || '') + '"' +
              ' placeholder="Tracking number"' +
              ' style="flex:1;padding:8px 11px;border:0.5px solid var(--border-med);font-family:Manrope,sans-serif;font-size:12px;background:var(--surface2);outline:none;border-radius:7px;">' +
            '<button class="btn btn-sm" onclick="window._saveTrackingAndCourier(\'' + esc(orderId) + '\')">Save</button>' +
          '</div>' +
        '</div>' +

        '<div>' +
          '<div class="card-title" style="margin-bottom:7px;">Internal Notes</div>' +
          '<textarea id="order-note-input"' +
            ' style="width:100%;border:0.5px solid var(--border-med);padding:9px 11px;font-family:Manrope,sans-serif;font-size:12px;font-weight:300;min-height:68px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;"' +
            ' placeholder="Internal notes...">' +
            esc(o.internalNotes || '') +
          '</textarea>' +
          '<button class="btn btn-sm btn-ghost" style="margin-top:7px;" onclick="window._saveOrderNote(\'' + esc(orderId) + '\')">Save Note</button>' +
        '</div>';
    }

    return html;
  }

  // ─── ORDER TIMELINE ──────────────────────────────────────────

  var TIMELINE_STEPS = [
    { key: 'pending',     label: 'Order Placed',    icon: 'ph-shopping-cart' },
    { key: 'paid',        label: 'Payment Confirmed', icon: 'ph-credit-card' },
    { key: 'processing',  label: 'Processing',       icon: 'ph-package' },
    { key: 'packed',      label: 'Packed',           icon: 'ph-archive' },
    { key: 'shipped',     label: 'Shipped',          icon: 'ph-truck' },
    { key: 'delivered',   label: 'Delivered',        icon: 'ph-check-circle' }
  ];

  function renderOrderTimeline(o) {
    var currentStatus = o.status || 'pending';
    var currentIndex = -1;

    for (var i = 0; i < TIMELINE_STEPS.length; i++) {
      if (TIMELINE_STEPS[i].key === currentStatus) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex === -1) {
      var label = currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1);
      return '<div style="padding:10px 0;font-size:12px;color:var(--muted);text-align:center;">' +
        'Status: <span style="color:var(--text);font-weight:500;">' + label + '</span>' +
      '</div>';
    }

    var html = '<div style="padding:8px 0 4px;">';
    for (var j = 0; j < TIMELINE_STEPS.length; j++) {
      var step = TIMELINE_STEPS[j];
      var isComplete = j <= currentIndex;
      var isCurrent = j === currentIndex;

      html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">' +
        '<div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
          (isComplete
            ? 'background:var(--text);color:#fff;'
            : 'background:var(--surface3);color:var(--muted2);') +
          'font-size:11px;">' +
          (isComplete ? '<i class="ph-light ph-check" style="font-size:12px;"></i>' : (j + 1)) +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:11.5px;font-weight:' + (isCurrent ? '500' : '400') + ';color:' + (isComplete ? 'var(--text)' : 'var(--muted2)') + ';">' +
            step.label +
          '</div>' +
        '</div>' +
      '</div>';

      if (j < TIMELINE_STEPS.length - 1) {
        html += '<div style="margin-left:11px;width:2px;height:8px;background:' + (j < currentIndex ? 'var(--text)' : 'var(--border-med)') + ';border-radius:1px;"></div>';
      }
    }
    html += '</div>';

    return html;
  }

  // ─── PACKING SLIP ────────────────────────────────────────────

  window._printPackingSlip = function (orderId) {
    var o = (window._ordersData || []).find(function (x) { return x.id === orderId; });
    if (!o) { showToast('Order not found', 'error'); return; }

    var itemsHTML = (o.items || []).map(function (item) {
      return '<tr>' +
        '<td style="padding:8px 12px;border-bottom:0.5px solid #ddd;font-size:12px;">' + esc(item.name) + '</td>' +
        '<td style="padding:8px 12px;border-bottom:0.5px solid #ddd;font-size:12px;text-align:center;">' + esc(item.size || '—') + '</td>' +
        '<td style="padding:8px 12px;border-bottom:0.5px solid #ddd;font-size:12px;text-align:center;">' + item.qty + '</td>' +
      '</tr>';
    }).join('');

    var win = window.open('', '_blank', 'width=680,height=700');
    win.document.write(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Packing Slip #' + esc(o.orderNumber || orderId) + '</title>' +
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;color:#222;}' +
      'h1{font-size:22px;font-weight:300;margin:0 0 4px;}' +
      '.order-num{font-size:13px;color:#888;margin-bottom:24px;}' +
      'h2{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#aaa;margin:20px 0 8px;border-bottom:0.5px solid #eee;padding-bottom:4px;}' +
      'p{font-size:13px;margin:3px 0;color:#444;}' +
      'table{width:100%;border-collapse:collapse;margin-top:8px;}' +
      'th{text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#aaa;border-bottom:0.5px solid #ddd;}' +
      '@media print{body{padding:20px;}}' +
      '</style></head><body>' +
      '<h1>Janedore</h1>' +
      '<div class="order-num">Order #' + esc((o.orderNumber || orderId).toString().slice(-8).toUpperCase()) + ' · ' + fmtDate(o.createdAt) + '</div>' +
      '<h2>Customer</h2>' +
      '<p>' + esc(o.customerName || 'Guest') + '</p>' +
      '<p>' + esc(o.customerEmail || '') + '</p>' +
      '<p>' + esc(o.customerPhone || '') + '</p>' +
      '<h2>Shipping Address</h2>' +
      '<p>' + esc(o.shippingAddress || '') + '</p>' +
      '<p>' + esc(o.city || '') + (o.province ? ', ' + esc(o.province) : '') + (o.postalCode ? ' ' + esc(o.postalCode) : '') + '</p>' +
      '<p>' + esc(o.country || 'South Africa') + '</p>' +
      (o.trackingNumber ? '<h2>Tracking</h2><p>' + esc(o.courier || '') + ' — ' + esc(o.trackingNumber) + '</p>' : '') +
      '<h2>Items</h2>' +
      '<table><thead><tr><th>Product</th><th>Size</th><th>Qty</th></tr></thead><tbody>' +
      itemsHTML +
      '</tbody></table>' +
      '<div style="margin-top:24px;font-size:11px;color:#aaa;text-align:center;">Thank you for shopping with Janedore</div>' +
      '</body></html>'
    );
    win.document.close();
    setTimeout(function () { win.print(); }, 300);
  };

  // ─── ORDER ACTIONS ───────────────────────────────────────────

  window._copyOrderId = function (orderId) {
    navigator.clipboard.writeText(orderId)
      .then(function () { showToast('Order # copied'); })
      .catch(function () { showToast('Could not copy', 'error'); });
  };

  window._whatsappCustomer = function (phone) {
    var sanitized = phone.replace(/[^\d+]/g, '');
    if (sanitized) window.open('https://wa.me/' + sanitized, '_blank', 'noopener,noreferrer');
  };

  window._quickRefund = function (orderId) {
    if (!window._guard('orders', 'approve')) return;
    if (!confirm('Mark order #' + orderId.substring(0, 10) + ' as refunded?')) return;
    ordersRef.doc(orderId)
      .update({ status: 'refunded', updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Order marked as refunded');
        if (window._ordersData) {
          var o = window._ordersData.filter(function (x) { return x.id === orderId; })[0];
          if (o) o.status = 'refunded';
        }
        closePanel();
      }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._updateOrderStatus = function (orderId, status) {
    if (!window._guard('orders', 'update')) return;
    if (status === 'refunded' && !window._can('orders', 'approve')) {
      showToast('Only Super Admin can issue refunds.', 'error'); return;
    }
    if (ORDER_STATUSES.indexOf(status) === -1) { showToast('Invalid status value', 'error'); return; }
    ordersRef.doc(orderId)
      .update({ status: status, updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Status updated to ' + status);
        if (window._ordersData) {
          var o = window._ordersData.filter(function (x) { return x.id === orderId; })[0];
          if (o) { o.status = status; renderOrdersTable(window._ordersData); }
        }
        closePanel();
      }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._saveTrackingAndCourier = function (orderId) {
    if (!window._guard('orders', 'update')) return;
    var tracking = safeEl('tracking-input');
    var courier  = safeEl('courier-select');
    if (!tracking) return;

    var data = {
      trackingNumber: tracking.value.trim(),
      courier: courier ? courier.value : '',
      updatedAt: new Date().toISOString()
    };

    ordersRef.doc(orderId).update(data).then(function () {
      showToast('Tracking saved');
      var o = (window._ordersData || []).find(function (x) { return x.id === orderId; });
      if (o) { o.trackingNumber = data.trackingNumber; o.courier = data.courier; }
    }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._saveOrderNote = function (orderId) {
    if (!window._guard('orders', 'update')) return;
    var input = safeEl('order-note-input');
    if (!input) return;
    ordersRef.doc(orderId)
      .update({ internalNotes: input.value, updatedAt: new Date().toISOString() })
      .then(function () { showToast('Note saved'); })
      .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

})();
