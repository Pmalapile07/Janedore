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

  // "Abandoned" means we genuinely don't know what happened — payment
  // never resolved either way. An explicit outcome (paid, cancelled at
  // PayFast, or failed per PayFast's own ITN) is a known result, not an
  // abandonment, even though none of those is 'paid' either.
  function isAbandoned(o) {
    if ((o.status || 'pending') !== 'pending') return false;
    if ((o.paymentStatus || 'unpaid') !== 'unpaid') return false;
    if (!o.createdAt) return true;
    var ts = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
    return (Date.now() - ts.getTime()) > ABANDONED_THRESHOLD_MS;
  }

  // Appends one entry to the order's real activity log (o.timeline) —
  // Firestore write plus an optimistic local update so the detail panel
  // (if open) reflects it immediately rather than waiting on a refetch.
  // FieldValue.serverTimestamp() can't be used inside an array element,
  // so this uses a plain ISO string instead, same as every other
  // timestamp this file already writes by hand (updatedAt, etc).
  function logOrderTimelineEvent(orderId, text) {
    var entry = { text: text, at: new Date().toISOString() };
    ordersRef.doc(orderId).update({
      timeline: firebase.firestore.FieldValue.arrayUnion(entry)
    }).catch(function (e) { console.warn('[ORDER_TIMELINE]', e.message); });
    if (window._ordersData) {
      var o = window._ordersData.filter(function (x) { return x.id === orderId; })[0];
      if (o) o.timeline = (o.timeline || []).concat([entry]);
    }
    return entry;
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
    var canDelete = window._can('orders', 'delete');

    mc.innerHTML =
      // No .section-title here on purpose — the top nav bar already shows
      // "Orders" (see switchTab() in admin.js), so a second one right
      // below it was a visibly different, redundant duplicate.
      '<div class="section-header" style="margin-bottom:10px;justify-content:flex-end;">' +
        '<div class="section-actions">' +
          (window._can('orders', 'create')
            ? '<button class="btn btn-sm btn-primary orders-create-btn" onclick="window._openNewOrderForm()" aria-label="Create Order" title="Create Order">' +
                '<i class="ph-light ph-plus"></i>' +
              '</button>'
            : '') +
          '<div class="orders-actions-menu-wrap">' +
            '<button class="btn btn-sm btn-ghost orders-actions-btn" onclick="window._toggleOrdersActionsMenu(event)" aria-label="Actions">' +
              '<i class="ph-light ph-dots-three-vertical"></i>' +
            '</button>' +
            '<div class="orders-actions-popover" id="orders-actions-popover" onclick="event.stopPropagation()">' +
              '<button class="orders-actions-item" onclick="window._toggleOrdersActionsMenu();window._refreshOrders()">' +
                '<i class="ph-light ph-arrows-clockwise"></i> Refresh' +
              '</button>' +
              (canUpdate
                ? '<button class="orders-actions-item" id="bulk-toggle-btn" onclick="window._toggleOrdersActionsMenu();window._toggleBulkMode()">' +
                    '<i class="ph-light ph-check-square"></i> Select Orders' +
                  '</button>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="bulk-actions" class="orders-bulk-bar" style="display:none;">' +
        '<select class="filter-select" id="bulk-status-select" style="padding:6px 24px 6px 9px;font-size:11px;">' +
          '<option value="">Bulk status...</option>' +
          ORDER_STATUSES.map(function (s) {
            return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
          }).join('') +
        '</select>' +
        '<button class="btn btn-xs btn-primary" onclick="window._applyBulkStatus()">Apply</button>' +
        (canDelete
          ? '<button class="btn btn-xs btn-danger" onclick="window._applyBulkDelete()">Delete Selected</button>'
          : '') +
        '<button class="btn btn-xs btn-ghost" onclick="window._toggleBulkMode()">Cancel</button>' +
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

  window._toggleBulkMode = function (forceValue) {
    window._bulkMode = (typeof forceValue === 'boolean') ? forceValue : !window._bulkMode;
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
        logOrderTimelineEvent(id, 'You changed the order status to ' + status.charAt(0).toUpperCase() + status.slice(1) + '.');
        var o = (window._ordersData || []).find(function (x) { return x.id === id; });
        if (o) o.status = status;
      });
      window._toggleBulkMode(false);
    }).catch(function (e) {
      showToast('Error: ' + e.message, 'error');
    });
  };

  window._applyBulkDelete = function () {
    if (!window._guard('orders', 'delete')) return;

    var ids = Object.keys(window._selectedOrders);
    if (ids.length === 0) { showToast('No orders selected', 'error'); return; }

    if (!confirm('Permanently delete ' + ids.length + ' order' + (ids.length !== 1 ? 's' : '') + '? This cannot be undone.')) return;

    var batch = db.batch();
    ids.forEach(function (id) {
      batch.delete(ordersRef.doc(id));
    });

    batch.commit().then(function () {
      showToast(ids.length + ' order' + (ids.length !== 1 ? 's' : '') + ' deleted');
      window._ordersData = (window._ordersData || []).filter(function (o) { return ids.indexOf(o.id) === -1; });
      window._toggleBulkMode(false);
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
      '<div class="orders-search-row">' +
        '<div class="orders-search-wrap">' +
          '<i class="ph-light ph-magnifying-glass"></i>' +
          '<input class="orders-search-input" id="order-search"' +
            ' placeholder="Search orders"' +
            ' oninput="window._filterOrders()">' +
        '</div>' +
        '<div class="orders-filter-menu-wrap">' +
          '<button class="orders-filter-btn" id="orders-filter-btn" onclick="window._toggleOrdersFilterPopover(event)" aria-label="Filter">' +
            '<i class="ph-light ph-funnel"></i>' +
          '</button>' +
          '<div class="orders-filter-popover" id="orders-filter-popover" onclick="event.stopPropagation()">' +
            '<label class="orders-filter-popover-label">Status</label>' +
            '<select class="filter-select" id="order-status-filter" onchange="window._filterOrders()">' +
              '<option value="">Any status</option>' +
              ORDER_STATUSES.map(function (s) {
                return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
              }).join('') +
            '</select>' +
            '<label class="orders-filter-popover-label">Payment</label>' +
            '<select class="filter-select" id="order-payment-filter" onchange="window._filterOrders()">' +
              '<option value="">Any payment</option>' +
              '<option value="paid">Paid</option>' +
              '<option value="unpaid">Unpaid</option>' +
              '<option value="cancelled">Cancelled</option>' +
              '<option value="failed">Failed</option>' +
              '<option value="refunded">Refunded</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="orders-tabs" id="orders-tabs"></div>' +
      '<div class="orders-count-row"><span id="orders-count" class="ui-label"></span></div>';

    renderOrderTabs();
    renderOrdersTable(orders);
  }

  var ORDER_TAB_LABELS = {
    all: 'All', unfulfilled: 'Unfulfilled', unpaid: 'Unpaid', open: 'Open',
    abandoned: 'Abandoned', returns: 'Returns', archived: 'Archived'
  };

  function renderOrderTabs() {
    var tabsEl = safeEl('orders-tabs');
    if (!tabsEl) return;
    var active = window._orderTab || 'all';
    tabsEl.innerHTML = Object.keys(ORDER_TAB_LABELS).map(function (t) {
      return '<button class="orders-tab' + (active === t ? ' active' : '') + '" onclick="window._setOrderTab(\'' + t + '\')">' +
        ORDER_TAB_LABELS[t] +
      '</button>';
    }).join('');
  }

  window._setOrderTab = function (tab) {
    window._orderTab = tab;
    renderOrderTabs();
    if (window._ordersData) renderOrdersTable(window._ordersData);
  };

  window._toggleOrdersActionsMenu = function (e) {
    if (e) e.stopPropagation();
    var pop = safeEl('orders-actions-popover');
    if (!pop) return;
    var isOpen = pop.classList.contains('open');
    closeAllOrderPopovers();
    if (!isOpen) pop.classList.add('open');
  };

  window._toggleOrdersFilterPopover = function (e) {
    if (e) e.stopPropagation();
    var pop = safeEl('orders-filter-popover');
    if (!pop) return;
    var isOpen = pop.classList.contains('open');
    closeAllOrderPopovers();
    if (!isOpen) pop.classList.add('open');
  };

  function closeAllOrderPopovers() {
    document.querySelectorAll('.orders-actions-popover.open, .orders-filter-popover.open').forEach(function (p) {
      p.classList.remove('open');
    });
  }
  document.addEventListener('click', closeAllOrderPopovers);

  // ─── RENDER TABLE ────────────────────────────────────────────

  function renderOrdersTable(orders) {
    var canDelete       = window._can('orders', 'delete');
    var canUpdate       = window._can('orders', 'update');
    var statusFilterEl  = safeEl('order-status-filter');
    var paymentFilterEl = safeEl('order-payment-filter');
    var searchEl        = safeEl('order-search');

    var statusFilter  = statusFilterEl  ? statusFilterEl.value  : '';
    var paymentFilter = paymentFilterEl ? paymentFilterEl.value : '';
    var search        = searchEl ? (searchEl.value || '').toLowerCase().replace(/^#/, '') : '';

    var tab = window._orderTab || 'all';

    var filtered = orders.filter(function (o) {
      if (statusFilter && (o.status || 'pending') !== statusFilter) return false;
      if (paymentFilter && (o.paymentStatus || 'unpaid') !== paymentFilter) return false;
      // Tabs are a second, independent filter dimension on top of the
      // status/payment dropdowns above — both apply together. "All"
      // still means literally everything, archived orders included —
      // every other tab hides archived orders, same as Shopify.
      if (tab !== 'all' && tab !== 'archived' && o.archived) return false;
      if (tab === 'unfulfilled' && (o.fulfillmentStatus || 'unfulfilled') === 'fulfilled') return false;
      if (tab === 'unpaid' && (o.paymentStatus || 'unpaid') !== 'unpaid') return false;
      if (tab === 'open' && o.status === 'cancelled') return false;
      if (tab === 'abandoned' && !isAbandoned(o)) return false;
      if (tab === 'returns' && !o.returnRequested) return false;
      if (tab === 'archived' && !o.archived) return false;
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

    var allSelected = filtered.length > 0 && filtered.every(function (o) { return window._selectedOrders[o.id]; });

    wrap.innerHTML =
      (window._bulkMode
        ? '<label class="orders-select-all"><input type="checkbox" onchange="window._toggleAllOrders(this.checked)"' + (allSelected ? ' checked' : '') + '> Select all</label>'
        : '') +
      '<div class="orders-list">' +
        filtered.map(function (o) {
          var abandoned = isAbandoned(o);
          var isSelected = !!window._selectedOrders[o.id];
          var rowClick = window._bulkMode
            ? 'window._toggleOrderSelection(\'' + esc(o.id) + '\',' + !isSelected + ')'
            : 'window._openOrderDetail(\'' + esc(o.id) + '\')';
          return '<div class="order-row' + (isSelected ? ' selected' : '') + '" onclick="' + rowClick + '">' +
            (window._bulkMode
              ? '<input type="checkbox" class="order-row-checkbox" onclick="event.stopPropagation()"' + (isSelected ? ' checked' : '') +
                ' onchange="window._toggleOrderSelection(\'' + esc(o.id) + '\',this.checked)">'
              : '') +
            '<div class="order-row-main">' +
              '<div class="order-row-top">' +
                '<span class="order-row-number">#' + esc(o.orderNumber || o.id) + '</span>' +
                '<span class="order-row-total">' + fmt(o.total || o.subtotal || 0) + '</span>' +
              '</div>' +
              '<div class="order-row-meta">' +
                esc(o.customerName || 'Guest') + ' · ' +
                esc(String(o.itemCount || 0)) + ' item' + (o.itemCount === 1 ? '' : 's') + ' · ' +
                fmtTime(o.createdAt) +
              '</div>' +
              '<div class="order-row-badges">' +
                (abandoned ? '<span class="badge badge-warning">Abandoned</span>' : '') +
                statusBadge(o.fulfillmentStatus || 'unfulfilled') +
                statusBadge(o.paymentStatus || 'unpaid') +
              '</div>' +
            '</div>' +
            (!window._bulkMode && (canUpdate || canDelete)
              ? '<div class="order-row-actions">' +
                  (canUpdate
                    ? '<button class="order-row-icon-btn" onclick="event.stopPropagation();window._toggleOrderArchived(\'' + esc(o.id) + '\',' + !!o.archived + ')" aria-label="' + (o.archived ? 'Unarchive order' : 'Archive order') + '" title="' + (o.archived ? 'Unarchive' : 'Archive') + '">' +
                        '<i class="ph-light ph-' + (o.archived ? 'tray-arrow-up' : 'archive') + '"></i>' +
                      '</button>'
                    : '') +
                  (canDelete
                    ? '<button class="order-row-icon-btn order-row-icon-btn-danger" onclick="event.stopPropagation();window._deleteOrder(\'' + esc(o.id) + '\')" aria-label="Delete order" title="Delete">' +
                        '<i class="ph-light ph-trash"></i>' +
                      '</button>'
                    : '') +
                '</div>'
              : '') +
          '</div>';
        }).join('') +
      '</div>';
  }

  window._filterOrders = function () {
    if (window._ordersData) renderOrdersTable(window._ordersData);
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
      showToast('Order #' + payload.orderNumber + ' created');
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
      '<div class="order-detail-fullscreen">' +
        '<div class="order-detail-fullscreen-header">' +
          '<button class="order-detail-back-btn" onclick="window._closePanel()" aria-label="Back to orders"><i class="ph-light ph-arrow-left"></i></button>' +
          '<span id="order-detail-heading">#' + esc((o && o.orderNumber) || orderId) + '</span>' +
          '<button class="order-detail-back-btn" onclick="window._printPackingSlip(\'' + esc(orderId) + '\')" aria-label="Print packing slip" title="Print packing slip"><i class="ph-light ph-printer"></i></button>' +
        '</div>' +
        '<div class="order-detail-fullscreen-body">' +
          (o
            ? renderOrderDetailContent(o, orderId)
            : '<div id="order-detail-loading" style="color:var(--muted);font-size:13px;">Loading...</div>') +
        '</div>' +
      '</div>';

    mountPanel(panelHTML);

    if (!o) {
      ordersRef.doc(orderId).get().then(function (doc) {
        if (!doc.exists) return;
        var data  = Object.assign({ id: doc.id }, doc.data());
        var headingEl = safeEl('order-detail-heading');
        // A fresh order the admin's cached list doesn't have yet (exactly
        // what happens right after a customer checks out) used to leave
        // this showing the raw Firestore doc ID forever — this fetch is
        // what finally has the real orderNumber, so update it here too,
        // not just the body below it.
        if (headingEl) headingEl.textContent = '#' + (data.orderNumber || orderId);
        var loadEl = safeEl('order-detail-loading');
        if (loadEl) loadEl.outerHTML = renderOrderDetailContent(data, orderId);
      }).catch(function (e) { console.error('[ORDER_DETAIL_FETCH]', e); });
    }
  };

  function renderOrderDetailContent(o, orderId) {
    var canUpdate  = window._can('orders', 'update');
    var canRefund  = window._can('orders', 'approve');
    var canDelete  = window._can('orders', 'delete');
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

    html += '<div class="card-title" style="margin-bottom:8px;">Timeline</div>';
    html += renderOrderTimeline(o);

    html +=
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;margin-top:14px;">' +
        '<button class="btn btn-sm btn-ghost" onclick="window._copyOrderId(\'' + esc(o.orderNumber || orderId) + '\')">Copy #</button>' +
        (o.customerPhone
          ? '<button class="btn btn-sm btn-ghost" onclick="window._whatsappCustomer(\'' + esc(o.customerPhone) + '\')">WhatsApp</button>'
          : '') +
        '<button class="btn btn-sm btn-ghost" onclick="window._printPackingSlip(\'' + esc(orderId) + '\')">Packing Slip</button>' +
        (canRefund
          ? '<button class="btn btn-sm btn-danger" onclick="window._quickRefund(\'' + esc(orderId) + '\')">Refund</button>'
          : '') +
        (canDelete
          ? '<button class="btn btn-sm btn-danger" onclick="window._deleteOrder(\'' + esc(orderId) + '\')">Delete</button>'
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
            return '<button class="btn btn-xs ' + (o.status === s ? 'btn-primary' : 'btn-ghost') + '"' +
              ' onclick="window._updateOrderStatus(\'' + esc(orderId) + '\',\'' + esc(s) + '\')">' +
              esc(s) + '</button>';
          }).join('') +
        '</div>' +

        '<div style="margin-bottom:12px;">' +
          '<div class="card-title" style="margin-bottom:7px;">Courier &amp; Tracking</div>' +
          '<select id="courier-select" style="width:100%;margin-bottom:6px;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:7px;padding:8px 11px;font-family:Inter,sans-serif;font-size:12px;color:var(--text);outline:none;">' +
            '<option value="">Select courier...</option>' +
            COURIERS.map(function (c) {
              return '<option value="' + c + '"' + (o.courier === c ? ' selected' : '') + '>' + c + '</option>';
            }).join('') +
          '</select>' +
          '<div style="display:flex;gap:6px;">' +
            '<input id="tracking-input" value="' + esc(o.trackingNumber || '') + '"' +
              ' placeholder="Tracking number"' +
              ' style="flex:1;padding:8px 11px;border:0.5px solid var(--border-med);font-family:Inter,sans-serif;font-size:12px;background:var(--surface2);outline:none;border-radius:7px;">' +
            '<button class="btn btn-sm" onclick="window._saveTrackingAndCourier(\'' + esc(orderId) + '\')">Save</button>' +
          '</div>' +
        '</div>' +

        '<div>' +
          '<div class="card-title" style="margin-bottom:7px;">Internal Notes</div>' +
          '<textarea id="order-note-input"' +
            ' style="width:100%;border:0.5px solid var(--border-med);padding:9px 11px;font-family:Inter,sans-serif;font-size:12px;font-weight:300;min-height:68px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;"' +
            ' placeholder="Internal notes...">' +
            esc(o.internalNotes || '') +
          '</textarea>' +
          '<button class="btn btn-sm btn-ghost" style="margin-top:7px;" onclick="window._saveOrderNote(\'' + esc(orderId) + '\')">Save Note</button>' +
        '</div>';
    }

    return html;
  }

  // ─── ORDER TIMELINE ──────────────────────────────────────────
  // Real, chronological activity log (o.timeline, written by
  // logOrderTimelineEvent() from every mutating action in this file:
  // status changes, refunds, notes, tracking, archive/unarchive) —
  // replaces the old fixed-steps progress stepper this used to be.
  // Matches Shopify's own order timeline: newest entry first, a dot +
  // timestamp + plain description, no synthetic "steps" that may not
  // reflect what actually happened to a given order.

  function formatTimelineWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }

  function renderOrderTimeline(o) {
    var entries = (o.timeline || []).slice();
    var placedAt = o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate().toISOString() : o.createdAt) : null;
    // "Order placed" isn't logged by logOrderTimelineEvent() — order
    // creation happens in checkout.js, outside this file — so it's
    // synthesized here as the earliest entry instead.
    entries.unshift({ text: 'Order placed.', at: placedAt });
    entries.reverse();

    return '<div class="order-timeline">' +
      entries.map(function (entry) {
        return '<div class="order-timeline-entry">' +
          '<div class="order-timeline-dot"></div>' +
          '<div class="order-timeline-time">' + esc(formatTimelineWhen(entry.at)) + '</div>' +
          '<div class="order-timeline-text">' + esc(entry.text) + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
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
      '<div class="order-num">Order #' + esc(o.orderNumber || orderId) + ' · ' + fmtDate(o.createdAt) + '</div>' +
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
    var existing = window._ordersData ? window._ordersData.filter(function (x) { return x.id === orderId; })[0] : null;
    if (!confirm('Mark order #' + ((existing && existing.orderNumber) || orderId) + ' as refunded?')) return;
    ordersRef.doc(orderId)
      .update({ paymentStatus: 'refunded', updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Order marked as refunded');
        logOrderTimelineEvent(orderId, 'You refunded this order.');
        if (window._ordersData) {
          var o = window._ordersData.filter(function (x) { return x.id === orderId; })[0];
          if (o) o.paymentStatus = 'refunded';
        }
        closePanel();
      }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._deleteOrder = function (orderId) {
    if (!window._guard('orders', 'delete')) return;
    var existing = window._ordersData ? window._ordersData.filter(function (x) { return x.id === orderId; })[0] : null;
    if (!confirm('Permanently delete order #' + ((existing && existing.orderNumber) || orderId) + '? This cannot be undone.')) return;
    ordersRef.doc(orderId).delete().then(function () {
      showToast('Order deleted');
      if (window._ordersData) {
        window._ordersData = window._ordersData.filter(function (x) { return x.id !== orderId; });
        renderOrdersTable(window._ordersData);
      }
      closePanel();
    }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._toggleOrderArchived = function (orderId, currentlyArchived) {
    if (!window._guard('orders', 'update')) return;
    var next = !currentlyArchived;
    ordersRef.doc(orderId).update({ archived: next, updatedAt: new Date().toISOString() }).then(function () {
      showToast(next ? 'Order archived' : 'Order unarchived');
      logOrderTimelineEvent(orderId, next ? 'You archived this order.' : 'You unarchived this order.');
      if (window._ordersData) {
        var o = window._ordersData.filter(function (x) { return x.id === orderId; })[0];
        if (o) o.archived = next;
        renderOrdersTable(window._ordersData);
      }
    }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._updateOrderStatus = function (orderId, status) {
    if (!window._guard('orders', 'update')) return;
    if (ORDER_STATUSES.indexOf(status) === -1) { showToast('Invalid status value', 'error'); return; }
    ordersRef.doc(orderId)
      .update({ status: status, updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Status updated to ' + status);
        logOrderTimelineEvent(orderId, 'You changed the order status to ' + status.charAt(0).toUpperCase() + status.slice(1) + '.');
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
      logOrderTimelineEvent(orderId, data.trackingNumber
        ? 'You added tracking number ' + data.trackingNumber + (data.courier ? ' via ' + data.courier : '') + '.'
        : 'You removed the tracking info on this order.');
      var o = (window._ordersData || []).find(function (x) { return x.id === orderId; });
      if (o) { o.trackingNumber = data.trackingNumber; o.courier = data.courier; }
    }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._saveOrderNote = function (orderId) {
    if (!window._guard('orders', 'update')) return;
    var input = safeEl('order-note-input');
    if (!input) return;
    var hasNote = !!input.value.trim();
    ordersRef.doc(orderId)
      .update({ internalNotes: input.value, updatedAt: new Date().toISOString() })
      .then(function () {
        showToast('Note saved');
        logOrderTimelineEvent(orderId, hasNote ? 'You added a note to this order.' : 'You removed the note on this order.');
      })
      .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
  };

})();
