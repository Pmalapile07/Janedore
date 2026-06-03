(function () {
  'use strict';

  if (!window._adminDB) return;

  var db                = window._adminDB;
  var esc               = window._esc;
  var safeEl            = window._safeEl;
  var fmt               = window._fmt;
  var fmtDate           = window._fmtDate;
  var showToast         = window._showToast;
  var statusBadge       = window._statusBadge;
  var isSuperAdmin      = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var mountPanel        = window._mountPanel;
  var closePanel        = window._closePanel;
  var ordersRef         = window._ordersRef;
  var productsRef       = window._productsRef;
  var ORDER_STATUSES    = window._ORDER_STATUSES;

  var draftsRef = db.collection('order_drafts');

  /* Abandoned = pending + unpaid + older than 1 hour */
  var ABANDONED_THRESHOLD_MS = 60 * 60 * 1000;

  function isAbandoned(o) {
    if ((o.status || 'pending') !== 'pending') return false;
    if ((o.paymentStatus || 'unpaid') === 'paid') return false;
    if (!o.createdAt) return true;
    var ts = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
    return (Date.now() - ts.getTime()) > ABANDONED_THRESHOLD_MS;
  }

  /* ─────────────────────────────────────────────────────────
     RENDER ORDERS TAB
  ───────────────────────────────────────────────────────── */
  window._renderOrdersTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Orders</div>' +
        '<div class="section-actions">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._refreshOrders()" title="Refresh">' +
            '<i class="ph-light ph-arrows-clockwise"></i> Refresh' +
          '</button>' +
          '<button class="btn btn-sm btn-primary" onclick="window._openNewOrderForm()">' +
            '<i class="ph-light ph-plus"></i> New Order' +
          '</button>' +
        '</div>' +
      '</div>' +
      ((!isSuperAdmin())
        ? '<div class="vendor-scope-bar">Showing orders for your brand only</div>'
        : '') +
      '<div id="orders-toolbar-wrap"></div>' +
      '<div id="orders-table-wrap"></div>';

    loadOrders();
  };

  /* ─────────────────────────────────────────────────────────
     LOAD — always fresh from Firestore
  ───────────────────────────────────────────────────────── */
  function loadOrders() {
    var wrap = safeEl('orders-table-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-text">Loading orders...</div>' +
        '</div>';
    }

    var query = isSuperAdmin()
      ? ordersRef.orderBy('createdAt', 'desc').limit(200)
      : ordersRef
          .where('vendorIds', 'array-contains', window._currentVendorId || '__none__')
          .orderBy('createdAt', 'desc')
          .limit(200);

    query.get().then(function (snap) {
      window._ordersData = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
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

  /* ─────────────────────────────────────────────────────────
     RENDER UI — toolbar + table, or empty state
  ───────────────────────────────────────────────────────── */
  function renderOrdersUI(orders) {
    var toolbarWrap = safeEl('orders-toolbar-wrap');
    var tableWrap   = safeEl('orders-table-wrap');
    if (!toolbarWrap || !tableWrap) return;

    var hasAny = orders.length > 0;

    /* No orders at all — hide toolbar, show empty state */
    if (!hasAny) {
      toolbarWrap.innerHTML = '';
      tableWrap.innerHTML   = renderEmptyState(false);
      return;
    }

    /* Has orders — render toolbar */
    toolbarWrap.innerHTML =
      '<div class="toolbar" style="margin-bottom:12px;">' +
        '<input class="search-input" id="order-search"' +
          ' placeholder="Search by name, email, order ID..."' +
          ' oninput="window._filterOrders()"' +
          ' style="min-width:180px;">' +

        /* Status dropdown — includes Abandoned as a virtual status */
        '<select class="filter-select" id="order-status-filter" onchange="window._filterOrders()">' +
          '<option value="">All Orders</option>' +
          '<option value="abandoned">Abandoned</option>' +
          ORDER_STATUSES.map(function (s) {
            return '<option value="' + s + '">' +
              s.charAt(0).toUpperCase() + s.slice(1) +
            '</option>';
          }).join('') +
        '</select>' +

        /* Payment dropdown */
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

  /* ─────────────────────────────────────────────────────────
     RENDER TABLE (with active filters)
  ───────────────────────────────────────────────────────── */
  function renderOrdersTable(orders) {
    var statusFilterEl  = safeEl('order-status-filter');
    var paymentFilterEl = safeEl('order-payment-filter');
    var searchEl        = safeEl('order-search');

    var statusFilter  = statusFilterEl  ? statusFilterEl.value  : '';
    var paymentFilter = paymentFilterEl ? paymentFilterEl.value : '';
    var search        = searchEl ? (searchEl.value || '').toLowerCase() : '';

    var filtered = orders.filter(function (o) {
      /* Virtual "abandoned" filter */
      if (statusFilter === 'abandoned') {
        if (!isAbandoned(o)) return false;
      } else if (statusFilter) {
        if ((o.status || 'pending') !== statusFilter) return false;
      }

      if (paymentFilter && (o.paymentStatus || 'unpaid') !== paymentFilter) return false;

      if (search) {
        var hay = (
          o.id +
          (o.customerEmail || '') +
          (o.customerName  || '') +
          (o.orderNumber   || '')
        ).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }

      return true;
    });

    var countEl = safeEl('orders-count');
    if (countEl) countEl.textContent = filtered.length + ' order' + (filtered.length !== 1 ? 's' : '');

    var wrap = safeEl('orders-table-wrap');
    if (!wrap) return;

    /* Filtered but no results */
    if (filtered.length === 0) {
      wrap.innerHTML = renderEmptyState(true);
      return;
    }

    /* Count abandoned for banner */
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

    wrap.innerHTML =
      bannerHTML +
      '<div class="table-wrap">' +
        '<table class="data-table">' +
          '<thead><tr>' +
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
            return '<tr onclick="window._openOrderDetail(\'' + esc(o.id) + '\')"' +
              (abandoned ? ' class="order-row-abandoned"' : '') + '>' +
              '<td>' +
                '<span style="font-size:11.5px;font-weight:500;">' +
                  '#' + esc((o.orderNumber || o.id).toString().slice(-8).toUpperCase()) +
                '</span>' +
                (abandoned
                  ? '<div><span class="badge badge-warning" style="font-size:9px;padding:2px 6px;">Abandoned</span></div>'
                  : '') +
              '</td>' +
              '<td>' +
                '<div style="font-weight:400;">' + esc(o.customerName  || 'Guest') + '</div>' +
                '<div class="cell-muted">'        + esc(o.customerEmail || '')      + '</div>' +
              '</td>' +
              '<td class="cell-muted">' + esc(String(o.itemCount || 0)) + '</td>' +
              '<td style="font-weight:400;">' + fmt(o.subtotal || 0) + '</td>' +
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

  /* ─────────────────────────────────────────────────────────
     EMPTY STATE
  ───────────────────────────────────────────────────────── */
  function renderEmptyState(isFiltered) {
    return '<div class="orders-empty-state">' +
      '<div class="orders-empty-icon">' +
        '<i class="ph-light ph-receipt"></i>' +
      '</div>' +
      '<div class="orders-empty-title">Manage your orders</div>' +
      '<div class="orders-empty-sub">' +
        (isFiltered
          ? 'No orders match your current filters. Try adjusting your search or filter.'
          : 'Orders placed on your store will appear here. You can also create an order manually for phone or in-person sales.') +
      '</div>' +
      (!isFiltered
        ? '<button class="orders-empty-btn" onclick="window._openNewOrderForm()">' +
            '<i class="ph-light ph-plus" style="font-size:15px;"></i>' +
            'Create your first order' +
          '</button>'
        : '<button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="window._clearOrderFilters()">' +
            'Clear filters' +
          '</button>') +
    '</div>';
  }

  window._clearOrderFilters = function () {
    var s = safeEl('order-status-filter');
    var p = safeEl('order-payment-filter');
    var q = safeEl('order-search');
    if (s) s.value = '';
    if (p) p.value = '';
    if (q) q.value = '';
    window._filterOrders();
  };

  /* ─────────────────────────────────────────────────────────
     NEW ORDER FORM
  ───────────────────────────────────────────────────────── */
  window._openNewOrderForm = function (draftId, draftData) {
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
          '<button class="btn btn-sm btn-ghost"' +
            ' onclick="window._saveOrderDraft(\'' + esc(draftId || '') + '\')">' +
            '<i class="ph-light ph-floppy-disk"></i> Save Draft' +
          '</button>' +
          '<button class="btn btn-sm btn-primary"' +
            ' onclick="window._submitNewOrder(\'' + esc(draftId || '') + '\')">' +
            '<i class="ph-light ph-check"></i> Place Order' +
          '</button>' +
        '</div>' +
      '</div>' +

      /* ── CUSTOMER ── */
      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Customer</span></div>' +
        '<div class="form-group">' +
          '<label>Full Name</label>' +
          '<input id="no-customer-name" placeholder="e.g. Lerato Dlamini"' +
            ' value="' + esc(d.customerName || '') + '">' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Email</label>' +
            '<input id="no-customer-email" type="email" placeholder="email@example.com"' +
              ' value="' + esc(d.customerEmail || '') + '">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Phone</label>' +
            '<input id="no-customer-phone" type="tel" placeholder="+27 ..."' +
              ' value="' + esc(d.customerPhone || '') + '">' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── PRODUCTS ── */
      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Products</span></div>' +
        '<div style="padding:12px 16px;">' +
          '<select id="no-product-picker" class="filter-select"' +
            ' style="width:100%;margin-bottom:10px;"' +
            ' onchange="window._noPickProduct(this)">' +
            '<option value="">Select a product to add...</option>' +
            products.map(function (p) {
              var price = p.price ||
                (p.variants && p.variants[0] && p.variants[0].price) || 0;
              return '<option value="' + esc(p.id) + '"' +
                ' data-name="'  + esc(p.name  || '')  + '"' +
                ' data-price="' + price               + '"' +
                ' data-brand="' + esc(p.brand || '')  + '">' +
                esc(p.name || 'Unnamed') + ' — ' + fmt(price) +
              '</option>';
            }).join('') +
          '</select>' +
          '<div id="no-items-list"></div>' +
        '</div>' +
      '</div>' +

      /* ── SHIPPING ADDRESS ── */
      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header"><span class="card-title">Shipping Address</span></div>' +
        '<div class="form-group">' +
          '<label>Street Address</label>' +
          '<input id="no-address" placeholder="123 Example Street"' +
            ' value="' + esc(d.shippingAddress || '') + '">' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>City</label>' +
            '<input id="no-city" placeholder="Johannesburg"' +
              ' value="' + esc(d.city || '') + '">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Province</label>' +
            '<input id="no-province" placeholder="Gauteng"' +
              ' value="' + esc(d.province || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Postal Code</label>' +
            '<input id="no-postal" placeholder="2000"' +
              ' value="' + esc(d.postalCode || '') + '">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Country</label>' +
            '<input id="no-country" placeholder="South Africa"' +
              ' value="' + esc(d.country || 'South Africa') + '">' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── PAYMENT ── */
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

      /* ── INTERNAL NOTES ── */
      '<div class="card" style="margin-bottom:80px;">' +
        '<div class="card-header"><span class="card-title">Internal Notes</span></div>' +
        '<div class="form-group">' +
          '<label>Notes</label>' +
          '<textarea id="no-notes" placeholder="Internal notes — not visible to customer...">' +
            esc(d.internalNotes || '') +
          '</textarea>' +
        '</div>' +
      '</div>' +

      /* ── STICKY BOTTOM BAR ── */
      '<div class="no-action-bar">' +
        '<button class="btn btn-ghost" onclick="window._renderOrdersTab()">' +
          '<i class="ph-light ph-x"></i> Cancel' +
        '</button>' +
        '<button class="btn btn-ghost"' +
          ' onclick="window._saveOrderDraft(\'' + esc(draftId || '') + '\')">' +
          '<i class="ph-light ph-floppy-disk"></i> Save Draft' +
        '</button>' +
        '<button class="btn btn-primary"' +
          ' onclick="window._submitNewOrder(\'' + esc(draftId || '') + '\')">' +
          '<i class="ph-light ph-check"></i> Place Order' +
        '</button>' +
      '</div>';

    renderOrderItems();
    window._noRecalcTotal();
  }

  /* ─────────────────────────────────────────────────────────
     PRODUCT PICKER
  ───────────────────────────────────────────────────────── */
  window._noPickProduct = function (select) {
    var opt = select.options[select.selectedIndex];
    if (!opt || !opt.value) return;

    var id    = opt.value;
    var name  = opt.getAttribute('data-name')  || '';
    var price = parseFloat(opt.getAttribute('data-price')) || 0;
    var brand = opt.getAttribute('data-brand') || '';

    var existing = (window._newOrderItems || []).find(function (i) {
      return i.productId === id;
    });
    if (existing) {
      existing.qty++;
    } else {
      window._newOrderItems.push({
        productId: id, name: name, price: price, brand: brand, qty: 1
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
        '<div style="text-align:center;padding:20px 0;color:var(--muted2);font-size:12px;">' +
          'No products added yet' +
        '</div>';
      return;
    }

    listEl.innerHTML = items.map(function (item, idx) {
      return '<div class="no-item-row">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:400;">' + esc(item.name) + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
            fmt(item.price) + ' each' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
          '<button class="no-qty-btn" onclick="window._noChangeQty(' + idx + ',-1)">' +
            '<i class="ph-light ph-minus"></i>' +
          '</button>' +
          '<span style="font-size:13px;font-weight:500;min-width:18px;text-align:center;">' +
            item.qty +
          '</span>' +
          '<button class="no-qty-btn" onclick="window._noChangeQty(' + idx + ',1)">' +
            '<i class="ph-light ph-plus"></i>' +
          '</button>' +
          '<span style="font-size:13px;font-weight:500;min-width:52px;text-align:right;">' +
            fmt(item.price * item.qty) +
          '</span>' +
          '<button class="no-qty-btn no-qty-remove" onclick="window._noRemoveItem(' + idx + ')">' +
            '<i class="ph-light ph-x"></i>' +
          '</button>' +
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

  /* ─────────────────────────────────────────────────────────
     TOTALS
  ───────────────────────────────────────────────────────── */
  window._noRecalcTotal = function () {
    var totalsEl = safeEl('no-totals');
    if (!totalsEl) return;

    var items    = window._newOrderItems || [];
    var subtotal = items.reduce(function (s, i) { return s + (i.price * i.qty); }, 0);
    var shipping = parseFloat((safeEl('no-shipping') || {}).value) || 0;
    var discount = parseFloat((safeEl('no-discount') || {}).value) || 0;
    var total    = Math.max(0, subtotal + shipping - discount);

    totalsEl.innerHTML =
      '<div class="info-row">' +
        '<span class="label">Subtotal</span><span>' + fmt(subtotal) + '</span>' +
      '</div>' +
      '<div class="info-row">' +
        '<span class="label">Shipping</span><span>' + fmt(shipping) + '</span>' +
      '</div>' +
      (discount > 0
        ? '<div class="info-row">' +
            '<span class="label">Discount</span>' +
            '<span style="color:var(--success);">− ' + fmt(discount) + '</span>' +
          '</div>'
        : '') +
      '<div class="info-row" style="border-top:0.5px solid var(--border);">' +
        '<span class="label" style="color:var(--text);font-weight:600;">Total</span>' +
        '<span style="font-size:15px;font-weight:600;">' + fmt(total) + '</span>' +
      '</div>';
  };

  /* ─────────────────────────────────────────────────────────
     BUILD PAYLOAD
  ───────────────────────────────────────────────────────── */
  function buildOrderPayload(status) {
    var items    = window._newOrderItems || [];
    var subtotal = items.reduce(function (s, i) { return s + (i.price * i.qty); }, 0);
    var shipping = parseFloat((safeEl('no-shipping') || {}).value) || 0;
    var discount = parseFloat((safeEl('no-discount') || {}).value) || 0;
    var total    = Math.max(0, subtotal + shipping - discount);

    return {
      customerName:      (safeEl('no-customer-name')   || {}).value || '',
      customerEmail:     (safeEl('no-customer-email')  || {}).value || '',
      customerPhone:     (safeEl('no-customer-phone')  || {}).value || '',
      shippingAddress:   (safeEl('no-address')         || {}).value || '',
      city:              (safeEl('no-city')             || {}).value || '',
      province:          (safeEl('no-province')         || {}).value || '',
      postalCode:        (safeEl('no-postal')           || {}).value || '',
      country:           (safeEl('no-country')          || {}).value || 'South Africa',
      paymentStatus:     (safeEl('no-payment-status')   || {}).value || 'unpaid',
      paymentMethod:     (safeEl('no-payment-method')   || {}).value || 'eft',
      shippingFee:       shipping,
      discount:          discount,
      subtotal:          total,
      itemCount:         items.reduce(function (s, i) { return s + i.qty; }, 0),
      items:             items,
      internalNotes:     (safeEl('no-notes') || {}).value || '',
      status:            status || 'pending',
      fulfillmentStatus: 'unfulfilled',
      source:            'manual'
    };
  }

  /* ─────────────────────────────────────────────────────────
     SAVE DRAFT
  ───────────────────────────────────────────────────────── */
  window._saveOrderDraft = function (existingDraftId) {
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

  /* ─────────────────────────────────────────────────────────
     SUBMIT ORDER
  ───────────────────────────────────────────────────────── */
  window._submitNewOrder = function (draftId) {
    var name = (safeEl('no-customer-name') || {}).value || '';
    if (!name.trim()) {
      showToast('Please enter a customer name', 'error');
      return;
    }
    if (!window._newOrderItems || window._newOrderItems.length === 0) {
      showToast('Please add at least one product', 'error');
      return;
    }

    var payload = buildOrderPayload('pending');
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
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

  /* ─────────────────────────────────────────────────────────
     ORDER DETAIL PANEL
  ───────────────────────────────────────────────────────── */
  window._openOrderDetail = function (orderId) {
    if (!orderId || typeof orderId !== 'string') return;
    var o = (window._ordersData || []).find(function (x) { return x.id === orderId; });

    var panelHTML =
      '<div class="slide-panel">' +
        '<button class="slide-panel-close" onclick="window._closePanel()">✕</button>' +
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
        var data = Object.assign({ id: doc.id }, doc.data());
        var loadEl = safeEl('order-detail-loading');
        if (loadEl) loadEl.outerHTML = renderOrderDetailContent(data, orderId);
      }).catch(function (e) { console.error('[ORDER_DETAIL_FETCH]', e); });
    }
  };

  function renderOrderDetailContent(o, orderId) {
    var abandoned = isAbandoned(o);
    var html = '';

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

    html +=
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<button class="btn btn-sm btn-ghost"' +
          ' onclick="window._copyOrderId(\'' + esc(orderId) + '\')">Copy #</button>' +
        (o.customerPhone
          ? '<button class="btn btn-sm btn-ghost"' +
              ' onclick="window._whatsappCustomer(\'' + esc(o.customerPhone) + '\')">WhatsApp</button>'
          : '') +
        '<button class="btn btn-sm btn-ghost" onclick="window._printOrderInvoice()">Invoice</button>' +
        (isSuperAdmin()
          ? '<button class="btn btn-sm btn-danger"' +
              ' onclick="window._quickRefund(\'' + esc(orderId) + '\')">Refund</button>'
          : '') +
      '</div>';

    html +=
      '<div class="card-title" style="margin-bottom:7px;">Customer</div>' +
      '<div class="info-panel" style="margin-bottom:14px;">' +
        '<div class="info-row"><span class="label">Name</span><span>'  + esc(o.customerName  || '—') + '</span></div>' +
        '<div class="info-row"><span class="label">Email</span><span>' + esc(o.customerEmail || '—') + '</span></div>' +
        '<div class="info-row"><span class="label">Phone</span><span>' + esc(o.customerPhone || '—') + '</span></div>' +
      '</div>';

    if (o.shippingAddress) {
      html +=
        '<div class="card-title" style="margin-bottom:7px;">Shipping</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Address</span><span>'  + esc(o.shippingAddress   || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Tracking</span><span>' + esc(o.trackingNumber    || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Courier</span><span>'  + esc(o.courier           || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">ETA</span><span>'      + esc(o.estimatedDelivery || '—') + '</span></div>' +
        '</div>';
    }

    html +=
      '<div class="card-title" style="margin-bottom:7px;">Revenue</div>' +
      '<div class="info-panel" style="margin-bottom:14px;">' +
        '<div class="info-row"><span class="label">Subtotal</span><span>' + fmt(o.subtotal || 0) + '</span></div>' +
        (isSuperAdmin()
          ? '<div class="info-row"><span class="label">Platform Rev</span><span>' + fmt(o.platformRevenue || 0) + '</span></div>'
          : '') +
        (isSuperAdmin()
          ? '<div class="info-row"><span class="label">Vendor Rev</span><span>' + fmt(o.vendorRevenue || 0) + '</span></div>'
          : '') +
        '<div class="info-row"><span class="label">Payout</span><span>' +
          statusBadge(o.payoutStatus || 'pending') +
        '</span></div>' +
      '</div>';

    if (isSuperAdmin()) {
      html +=
        '<div class="card-title" style="margin-bottom:8px;">Update Status</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px;">' +
          ORDER_STATUSES.map(function (s) {
            return '<button class="btn btn-xs ' + (o.status === s ? 'btn-primary' : 'btn-ghost') + '"' +
              ' onclick="window._updateOrderStatus(\'' + esc(orderId) + '\',\'' + esc(s) + '\')">' +
              esc(s) + '</button>';
          }).join('') +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<div class="card-title" style="margin-bottom:7px;">Tracking Number</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<input id="tracking-input" value="' + esc(o.trackingNumber || '') + '"' +
              ' placeholder="Tracking #"' +
              ' style="flex:1;padding:8px 11px;border:0.5px solid var(--border-med);' +
                'font-family:Manrope,sans-serif;font-size:12px;background:var(--surface2);' +
                'outline:none;border-radius:7px;">' +
            '<button class="btn btn-sm"' +
              ' onclick="window._saveTracking(\'' + esc(orderId) + '\')">Save</button>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="card-title" style="margin-bottom:7px;">Internal Notes</div>' +
          '<textarea id="order-note-input"' +
            ' style="width:100%;border:0.5px solid var(--border-med);padding:9px 11px;' +
              'font-family:Manrope,sans-serif;font-size:12px;font-weight:300;min-height:68px;' +
              'background:var(--surface2);outline:none;border-radius:7px;resize:vertical;"' +
            ' placeholder="Internal notes...">' +
            esc(o.internalNotes || '') +
          '</textarea>' +
          '<button class="btn btn-sm btn-ghost" style="margin-top:7px;"' +
            ' onclick="window._saveOrderNote(\'' + esc(orderId) + '\')">Save Note</button>' +
        '</div>';
    }

    return html;
  }

  /* ─────────────────────────────────────────────────────────
     ORDER ACTIONS
  ───────────────────────────────────────────────────────── */
  window._copyOrderId = function (orderId) {
    navigator.clipboard.writeText(orderId)
      .then(function () { showToast('Order # copied'); })
      .catch(function () { showToast('Could not copy', 'error'); });
  };

  window._whatsappCustomer = function (phone) {
    var sanitized = phone.replace(/[^\d+]/g, '');
    if (sanitized) window.open('https://wa.me/' + sanitized, '_blank', 'noopener,noreferrer');
  };

  window._printOrderInvoice = function () {
    showToast('Invoice print — add your template', 'info');
  };

  window._quickRefund = function (orderId) {
    if (!requireSuperAdmin('quickRefund')) return;
    if (!confirm('Mark order #' + orderId.substring(0, 10) + ' as refunded?')) return;
    ordersRef.doc(orderId)
      .update({ status: 'refunded', updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Order marked as refunded');
        if (window._ordersData) {
          var o = window._ordersData.find(function (x) { return x.id === orderId; });
          if (o) o.status = 'refunded';
        }
        closePanel();
      }).catch(function (e) {
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._updateOrderStatus = function (orderId, status) {
    if (!requireSuperAdmin('updateOrderStatus')) return;
    if (ORDER_STATUSES.indexOf(status) === -1) {
      showToast('Invalid status value', 'error');
      return;
    }
    ordersRef.doc(orderId)
      .update({ status: status, updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Status updated to ' + status);
        if (window._ordersData) {
          var o = window._ordersData.find(function (x) { return x.id === orderId; });
          if (o) { o.status = status; renderOrdersTable(window._ordersData); }
        }
        closePanel();
      }).catch(function (e) {
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._saveTracking = function (orderId) {
    var input = safeEl('tracking-input');
    if (!input) return;
    ordersRef.doc(orderId)
      .update({ trackingNumber: input.value, updatedAt: new Date().toISOString() })
      .then(function () { showToast('Tracking saved'); })
      .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._saveOrderNote = function (orderId) {
    var input = safeEl('order-note-input');
    if (!input) return;
    ordersRef.doc(orderId)
      .update({ internalNotes: input.value, updatedAt: new Date().toISOString() })
      .then(function () { showToast('Note saved'); })
      .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

})();
