(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var fmt        = window._fmt;
  var fmtDate    = window._fmtDate;
  var showToast  = window._showToast;
  var statusBadge = window._statusBadge;
  var isSuperAdmin = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var mountPanel = window._mountPanel;
  var closePanel = window._closePanel;
  var ordersRef  = window._ordersRef;
  var ORDER_STATUSES = window._ORDER_STATUSES;

  /* ─────────────────────────────────────────────────────────
     RENDER ORDERS TAB
  ───────────────────────────────────────────────────────── */
  window._renderOrdersTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML = '';
    if (!isSuperAdmin()) {
      mc.innerHTML += '<div class="vendor-scope-bar">Showing orders for your brand only</div>';
    }
    mc.innerHTML += renderOrdersToolbar();

    var container = document.createElement('div');
    container.id = 'orders-table-wrap';
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">◫</div><div class="empty-state-text">Loading orders...</div></div>';
    mc.appendChild(container);

    var query = isSuperAdmin()
      ? ordersRef.orderBy('createdAt','desc').limit(100)
      : ordersRef.where('vendorIds','array-contains', window._currentVendorId || '__none__').orderBy('createdAt','desc').limit(100);

    query.get().then(function(ords) {
      window._ordersData = ords.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      renderOrdersTable(window._ordersData);
    }).catch(function(e) {
      console.error('[ORDERS_TAB]', e);
      container.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: ' + esc(e.message) + '</p>';
    });
  };

  function renderOrdersToolbar() {
    return '<div class="section-header" style="margin-bottom:10px;">' +
      '<div class="section-title">Orders</div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<input class="search-input" id="order-search" placeholder="Search orders..." oninput="window._filterOrders()" style="min-width:180px;">' +
      '<select class="filter-select" id="order-status-filter" onchange="window._filterOrders()">' +
        '<option value="">All Statuses</option>' +
        ORDER_STATUSES.map(function(s){
          return '<option value="'+s+'">'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>';
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
  }

  function renderOrdersTable(orders) {
    var statusFilterEl  = safeEl('order-status-filter');
    var paymentFilterEl = safeEl('order-payment-filter');
    var searchEl        = safeEl('order-search');

    var statusFilter  = statusFilterEl  ? statusFilterEl.value  : '';
    var paymentFilter = paymentFilterEl ? paymentFilterEl.value : '';
    var search        = searchEl ? (searchEl.value || '').toLowerCase() : '';

    var filtered = orders.filter(function(o) {
      if (statusFilter  && (o.status || 'pending') !== statusFilter)    return false;
      if (paymentFilter && (o.paymentStatus || 'unpaid') !== paymentFilter) return false;
      if (search) {
        var hay = (o.id + (o.customerEmail||'') + (o.customerName||'')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    var countEl = safeEl('orders-count');
    if (countEl) countEl.textContent = filtered.length + ' orders';

    var wrap = safeEl('orders-table-wrap');
    if (!wrap) return;

    if (filtered.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">◫</div><div class="empty-state-text">No orders found.</div></div>';
      return;
    }

    wrap.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Fulfillment</th><th>Date</th><th></th></tr></thead>' +
      '<tbody>' +
      filtered.map(function(o) {
        return '<tr onclick="window._openOrderDetail(\'' + esc(o.id) + '\')">' +
          '<td><span style="font-size:11.5px;font-weight:500;">#' + esc(o.id.substring(0,10)) + '</span></td>' +
          '<td><div style="font-weight:400;">' + esc(o.customerName||'Guest') + '</div><div class="cell-muted">' + esc(o.customerEmail||'') + '</div></td>' +
          '<td class="cell-muted">' + esc(String(o.itemCount||0)) + '</td>' +
          '<td style="font-weight:400;">' + fmt(o.subtotal||0) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td>' + statusBadge(o.fulfillmentStatus||'unfulfilled') + '</td>' +
          '<td class="cell-muted">' + fmtDate(o.createdAt) + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<button class="btn btn-xs btn-ghost" onclick="window._openOrderDetail(\'' + esc(o.id) + '\')" title="View">View</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window._filterOrders = function() {
    if (window._ordersData) renderOrdersTable(window._ordersData);
  };

  /* ─────────────────────────────────────────────────────────
     ORDER DETAIL PANEL
  ───────────────────────────────────────────────────────── */
  window._openOrderDetail = function(orderId) {
    if (!orderId || typeof orderId !== 'string') return;
    var o = (window._ordersData || []).find(function(x){ return x.id === orderId; });

    var panelHTML = '<div class="slide-panel">' +
      '<button class="slide-panel-close" onclick="window._closePanel()">X</button>' +
      '<div class="ui-label" style="margin-bottom:4px;">Order</div>' +
      '<div style="font-size:21px;font-weight:400;margin-bottom:18px;">#' + esc(orderId.substring(0,14)) + '</div>' +
      (o ? renderOrderDetailContent(o, orderId) : '<div id="order-detail-loading" style="color:var(--muted);font-size:13px;">Loading...</div>') +
    '</div>';

    mountPanel(panelHTML);

    if (!o) {
      ordersRef.doc(orderId).get().then(function(doc) {
        if (!doc.exists) return;
        var data = Object.assign({id:doc.id}, doc.data());
        var loadEl = safeEl('order-detail-loading');
        if (loadEl) loadEl.outerHTML = renderOrderDetailContent(data, orderId);
      }).catch(function(e){ console.error('[ORDER_DETAIL_FETCH]', e); });
    }
  };

  function renderOrderDetailContent(o, orderId) {
    var html = '';

    html += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">' +
      statusBadge(o.status) + statusBadge(o.fulfillmentStatus||'unfulfilled') +
    '</div>';

    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
      '<button class="btn btn-sm btn-ghost" onclick="window._copyOrderId(\'' + esc(orderId) + '\')">Copy #</button>' +
      (o.customerPhone ? '<button class="btn btn-sm btn-ghost" onclick="window._whatsappCustomer(\'' + esc(o.customerPhone) + '\')">WhatsApp</button>' : '') +
      '<button class="btn btn-sm btn-ghost" onclick="window._printOrderInvoice()">Invoice</button>' +
      (isSuperAdmin() ? '<button class="btn btn-sm btn-danger" onclick="window._quickRefund(\'' + esc(orderId) + '\')">Refund</button>' : '') +
    '</div>';

    html += '<div class="card-title" style="margin-bottom:7px;">Customer</div>' +
      '<div class="info-panel" style="margin-bottom:14px;">' +
        '<div class="info-row"><span class="label">Name</span><span>' + esc(o.customerName||'—') + '</span></div>' +
        '<div class="info-row"><span class="label">Email</span><span>' + esc(o.customerEmail||'—') + '</span></div>' +
        '<div class="info-row"><span class="label">Phone</span><span>' + esc(o.customerPhone||'—') + '</span></div>' +
      '</div>';

    if (o.shippingAddress) {
      html += '<div class="card-title" style="margin-bottom:7px;">Shipping</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Address</span><span>' + esc(o.shippingAddress||'—') + '</span></div>' +
          '<div class="info-row"><span class="label">Tracking</span><span>' + esc(o.trackingNumber||'—') + '</span></div>' +
          '<div class="info-row"><span class="label">Courier</span><span>' + esc(o.courier||'—') + '</span></div>' +
          '<div class="info-row"><span class="label">ETA</span><span>' + esc(o.estimatedDelivery||'—') + '</span></div>' +
        '</div>';
    }

    html += '<div class="card-title" style="margin-bottom:7px;">Revenue</div>' +
      '<div class="info-panel" style="margin-bottom:14px;">' +
        '<div class="info-row"><span class="label">Subtotal</span><span>' + fmt(o.subtotal||0) + '</span></div>' +
        (isSuperAdmin() ? '<div class="info-row"><span class="label">Platform Rev</span><span>' + fmt(o.platformRevenue||0) + '</span></div>' : '') +
        (isSuperAdmin() ? '<div class="info-row"><span class="label">Vendor Rev</span><span>' + fmt(o.vendorRevenue||0) + '</span></div>' : '') +
        '<div class="info-row"><span class="label">Payout</span><span>' + statusBadge(o.payoutStatus||'pending') + '</span></div>' +
      '</div>';

    if (isSuperAdmin()) {
      html += '<div class="card-title" style="margin-bottom:8px;">Update Status</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px;">' +
        ORDER_STATUSES.map(function(s) {
          return '<button class="btn btn-xs ' + (o.status===s?'btn-primary':'btn-ghost') + '" onclick="window._updateOrderStatus(\'' + esc(orderId) + '\',\'' + esc(s) + '\')">' + esc(s) + '</button>';
        }).join('') +
        '</div>';

      html += '<div style="margin-bottom:12px;">' +
        '<div class="card-title" style="margin-bottom:7px;">Tracking Number</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<input id="tracking-input" value="' + esc(o.trackingNumber||'') + '" placeholder="Tracking #" style="flex:1;padding:8px 11px;border:0.5px solid var(--border-med);font-family:Manrope,sans-serif;font-size:12px;background:var(--surface2);outline:none;border-radius:7px;">' +
          '<button class="btn btn-sm" onclick="window._saveTracking(\'' + esc(orderId) + '\')">Save</button>' +
        '</div>' +
      '</div>';

      html += '<div>' +
        '<div class="card-title" style="margin-bottom:7px;">Internal Notes</div>' +
        '<textarea id="order-note-input" style="width:100%;border:0.5px solid var(--border-med);padding:9px 11px;font-family:Manrope,sans-serif;font-size:12px;font-weight:300;min-height:68px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;" placeholder="Internal notes...">' + esc(o.internalNotes||'') + '</textarea>' +
        '<button class="btn btn-sm btn-ghost" style="margin-top:7px;" onclick="window._saveOrderNote(\'' + esc(orderId) + '\')">Save Note</button>' +
      '</div>';
    }

    return html;
  }

  /* ─────────────────────────────────────────────────────────
     ORDER ACTIONS
  ───────────────────────────────────────────────────────── */
  window._copyOrderId = function(orderId) {
    navigator.clipboard.writeText(orderId)
      .then(function(){ showToast('Order # copied'); })
      .catch(function(e) {
        console.error('[COPY_ORDER_ID]', e);
        showToast('Could not copy', 'error');
      });
  };

  window._whatsappCustomer = function(phone) {
    var sanitized = phone.replace(/[^\d+]/g, '');
    if (sanitized) window.open('https://wa.me/' + sanitized, '_blank', 'noopener,noreferrer');
  };

  window._printOrderInvoice = function() {
    showToast('Invoice print - add your template', 'info');
  };

  window._quickRefund = function(orderId) {
    if (!requireSuperAdmin('quickRefund')) return;
    if (!confirm('Mark order #' + orderId.substring(0,10) + ' as refunded?')) return;
    ordersRef.doc(orderId).update({ status:'refunded', updatedAt:new Date().toISOString() })
      .then(function() {
        showToast('Order marked as refunded');
        if (window._ordersData) {
          var o = window._ordersData.find(function(x){ return x.id===orderId; });
          if (o) o.status = 'refunded';
        }
        closePanel();
      }).catch(function(e) {
        console.error('[QUICK_REFUND]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._updateOrderStatus = function(orderId, status) {
    if (!requireSuperAdmin('updateOrderStatus')) return;
    if (ORDER_STATUSES.indexOf(status) === -1) {
      showToast('Invalid status value', 'error');
      return;
    }
    ordersRef.doc(orderId).update({ status: status, updatedAt: new Date().toISOString() })
      .then(function() {
        showToast('Status updated to ' + status);
        if (window._ordersData) {
          var o = window._ordersData.find(function(x){ return x.id===orderId; });
          if (o) { o.status = status; renderOrdersTable(window._ordersData); }
        }
        closePanel();
      }).catch(function(e) {
        console.error('[UPDATE_ORDER_STATUS]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._saveTracking = function(orderId) {
    var input = safeEl('tracking-input');
    if (!input) return;
    ordersRef.doc(orderId).update({ trackingNumber: input.value, updatedAt: new Date().toISOString() })
      .then(function(){ showToast('Tracking saved'); })
      .catch(function(e) {
        console.error('[SAVE_TRACKING]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._saveOrderNote = function(orderId) {
    var input = safeEl('order-note-input');
    if (!input) return;
    ordersRef.doc(orderId).update({ internalNotes: input.value, updatedAt: new Date().toISOString() })
      .then(function(){ showToast('Note saved'); })
      .catch(function(e) {
        console.error('[SAVE_ORDER_NOTE]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

})();
