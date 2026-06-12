(function () {
  'use strict';

  if (!window._adminDB) return;

  var db          = window._adminDB;
  var rtdb        = window._adminRTDB;
  var esc         = window._esc;
  var safeEl      = window._safeEl;
  var fmt         = window._fmt;
  var fmtDate     = window._fmtDate;
  var showToast   = window._showToast;
  var ordersRef   = window._ordersRef;
  var productsRef = window._productsRef;
  var reviewsRef  = window._reviewsRef;
  var vendorsRef  = window._vendorsRef;

  var CHAT_ROOT = window._CHAT_ROOT || 'live_chat';

  /* ─────────────────────────────────────────────────────────
     RENDER DASHBOARD — role-based
  ───────────────────────────────────────────────────────── */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    var role = window._currentUserRole;

    if (role === 'SUPER_ADMIN') {
      renderSuperAdminDashboard(mc);
    } else if (role === 'ADMIN') {
      renderAdminDashboard(mc);
    } else if (role === 'VENDOR') {
      renderVendorDashboard(mc);
    } else {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading dashboard...</div></div>';
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SUPER ADMIN DASHBOARD
  ═══════════════════════════════════════════════════════════ */
  function renderSuperAdminDashboard(mc) {
    mc.innerHTML =
      '<div class="dashboard-shell">' +
        '<div class="section-header" style="margin-bottom:16px;">' +
          '<div class="section-title">Dashboard</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) + '</div>' +
        '</div>' +
        '<div class="dash-stat-grid" id="dash-stat-grid">' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Total Revenue</div><div class="dash-stat-value" id="stat-revenue">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Total Orders</div><div class="dash-stat-value" id="stat-orders">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Active Brands</div><div class="dash-stat-value" id="stat-brands">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Total Products</div><div class="dash-stat-value" id="stat-products">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Pending Payouts</div><div class="dash-stat-value" id="stat-payouts">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Abandoned Orders</div><div class="dash-stat-value" id="stat-abandoned">—</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px;">' +
          '<div class="card-header"><span class="card-title">Recent Orders</span></div>' +
          '<div id="dash-recent-orders" style="padding:0 16px 12px;"><span style="font-size:12px;color:var(--muted);">Loading...</span></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Brand Performance</span></div>' +
          '<div id="dash-brand-perf" style="padding:0 16px 12px;"><span style="font-size:12px;color:var(--muted);">Loading...</span></div>' +
        '</div>' +
      '</div>';

    loadSuperAdminStats();
  }

  function loadSuperAdminStats() {
    Promise.all([
      ordersRef.orderBy('createdAt', 'desc').limit(200).get(),
      productsRef.get(),
      vendorsRef.get()
    ]).then(function (results) {
      var ordersSnap   = results[0];
      var productsSnap = results[1];
      var vendorsSnap  = results[2];

      var orders   = ordersSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var products = productsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var vendors  = vendorsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });

      var totalRevenue   = orders.reduce(function (s, o) { return s + (o.total || o.subtotal || 0); }, 0);
      var totalOrders    = orders.length;
      var activeBrands   = vendors.filter(function (v) { return v.status !== 'inactive'; }).length;
      var totalProducts  = products.length;
      var pendingPayouts = orders.filter(function (o) { return o.payoutStatus === 'pending' && o.paymentStatus === 'paid'; }).length;
      var abandoned      = orders.filter(function (o) {
        if ((o.status || 'pending') !== 'pending') return false;
        if ((o.paymentStatus || 'unpaid') === 'paid') return false;
        if (!o.createdAt) return true;
        var ts = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        return (Date.now() - ts.getTime()) > (60 * 60 * 1000);
      }).length;

      setStat('stat-revenue',  'R' + totalRevenue.toLocaleString('en-ZA'));
      setStat('stat-orders',   totalOrders);
      setStat('stat-brands',   activeBrands);
      setStat('stat-products', totalProducts);
      setStat('stat-payouts',  pendingPayouts);
      setStat('stat-abandoned', abandoned);

      var recent = orders.slice(0, 8);
      var recentEl = safeEl('dash-recent-orders');
      if (recentEl) {
        if (recent.length === 0) {
          recentEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No orders yet</div>';
        } else {
          recentEl.innerHTML = '<div class="table-wrap" style="margin-top:8px;"><table class="data-table">' +
            '<thead><tr><th>Order</th><th>Customer</th><th>Brand</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>' +
            '<tbody>' + recent.map(function (o) {
              var brand = (o.items && o.items[0] && o.items[0].brand) || '—';
              return '<tr onclick="window.switchTab(\'orders\')" style="cursor:pointer;">' +
                '<td style="font-weight:500;">#' + esc((o.orderNumber || o.id).toString().slice(-8).toUpperCase()) + '</td>' +
                '<td>' + esc(o.customerName || 'Guest') + '</td>' +
                '<td class="cell-muted">' + esc(brand) + '</td>' +
                '<td>' + fmt(o.total || o.subtotal || 0) + '</td>' +
                '<td>' + window._statusBadge(o.status || 'pending') + '</td>' +
                '<td class="cell-muted">' + fmtDate(o.createdAt) + '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>';
        }
      }

      var brandPerfEl = safeEl('dash-brand-perf');
      if (brandPerfEl) {
        if (vendors.length === 0) {
          brandPerfEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No brands yet</div>';
        } else {
          var brandRevenue = {};
          orders.forEach(function (o) {
            var brands = {};
            (o.items || []).forEach(function (item) {
              var b = item.brand || 'Unknown';
              brands[b] = (brands[b] || 0) + (item.price * item.qty);
            });
            Object.keys(brands).forEach(function (b) {
              brandRevenue[b] = (brandRevenue[b] || 0) + brands[b];
            });
          });

          brandPerfEl.innerHTML = '<div style="margin-top:8px;">' +
            vendors.map(function (v) {
              var rev = brandRevenue[v.name] || 0;
              var productCount = products.filter(function (p) { return p.vendorId === v.id; }).length;
              return '<div class="info-row" style="padding:10px 0;">' +
                '<span class="label" style="font-weight:500;color:var(--text);">' + esc(v.name || v.id) + '</span>' +
                '<span style="font-size:12px;">' +
                  fmt(rev) + ' · ' + productCount + ' product' + (productCount !== 1 ? 's' : '') +
                  (v.status === 'inactive' ? ' · <span style="color:var(--warning);">Inactive</span>' : '') +
                '</span>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      }

    }).catch(function (e) {
      console.error('[DASHBOARD SA]', e);
      showToast('Could not load dashboard stats', 'error');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ADMIN DASHBOARD
  ═══════════════════════════════════════════════════════════ */
  function renderAdminDashboard(mc) {
    mc.innerHTML =
      '<div class="dashboard-shell">' +
        '<div class="section-header" style="margin-bottom:16px;">' +
          '<div class="section-title">Dashboard</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) + '</div>' +
        '</div>' +
        '<div class="dash-stat-grid" id="dash-stat-grid">' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Orders Pending</div><div class="dash-stat-value" id="stat-pending">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Unread Messages</div><div class="dash-stat-value" id="stat-unread">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Reviews to Moderate</div><div class="dash-stat-value" id="stat-reviews">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Low Stock Products</div><div class="dash-stat-value" id="stat-lowstock">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Abandoned Orders</div><div class="dash-stat-value" id="stat-abandoned">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Active Brands</div><div class="dash-stat-value" id="stat-brands">—</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px;">' +
          '<div class="card-header"><span class="card-title">Recent Orders</span></div>' +
          '<div id="dash-recent-orders" style="padding:0 16px 12px;"><span style="font-size:12px;color:var(--muted);">Loading...</span></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Low Stock Alerts</span></div>' +
          '<div id="dash-lowstock-list" style="padding:0 16px 12px;"><span style="font-size:12px;color:var(--muted);">Loading...</span></div>' +
        '</div>' +
      '</div>';

    loadAdminStats();
  }

  function loadAdminStats() {
    Promise.all([
      ordersRef.orderBy('createdAt', 'desc').limit(200).get(),
      productsRef.get(),
      reviewsRef.where('moderationStatus', '==', 'pending').get(),
      vendorsRef.get()
    ]).then(function (results) {
      var ordersSnap   = results[0];
      var productsSnap = results[1];
      var reviewsSnap  = results[2];
      var vendorsSnap  = results[3];

      var orders    = ordersSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var products  = productsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var pendingReviews = reviewsSnap.size;
      var activeBrands   = vendorsSnap.docs.filter(function (d) { return d.data().status !== 'inactive'; }).length;

      var ordersPending = orders.filter(function (o) { return o.status === 'pending' || o.status === 'processing'; }).length;
      var unreadChats   = window._totalUnreadMessages || 0;
      var lowStock      = products.filter(function (p) { return p.stock > 0 && p.stock <= 3 && p.status === 'active'; });
      var abandoned     = orders.filter(function (o) {
        if ((o.status || 'pending') !== 'pending') return false;
        if ((o.paymentStatus || 'unpaid') === 'paid') return false;
        if (!o.createdAt) return true;
        var ts = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        return (Date.now() - ts.getTime()) > (60 * 60 * 1000);
      }).length;

      setStat('stat-pending',   ordersPending);
      setStat('stat-unread',    unreadChats);
      setStat('stat-reviews',   pendingReviews);
      setStat('stat-lowstock',  lowStock.length);
      setStat('stat-abandoned', abandoned);
      setStat('stat-brands',    activeBrands);

      var recent = orders.slice(0, 8);
      var recentEl = safeEl('dash-recent-orders');
      if (recentEl) {
        if (recent.length === 0) {
          recentEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No orders yet</div>';
        } else {
          recentEl.innerHTML = '<div class="table-wrap" style="margin-top:8px;"><table class="data-table">' +
            '<thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>' +
            '<tbody>' + recent.map(function (o) {
              return '<tr onclick="window.switchTab(\'orders\')" style="cursor:pointer;">' +
                '<td style="font-weight:500;">#' + esc((o.orderNumber || o.id).toString().slice(-8).toUpperCase()) + '</td>' +
                '<td>' + esc(o.customerName || 'Guest') + '</td>' +
                '<td>' + fmt(o.total || o.subtotal || 0) + '</td>' +
                '<td>' + window._statusBadge(o.status || 'pending') + '</td>' +
                '<td class="cell-muted">' + fmtDate(o.createdAt) + '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>';
        }
      }

      var stockEl = safeEl('dash-lowstock-list');
      if (stockEl) {
        if (lowStock.length === 0) {
          stockEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">All products are well stocked</div>';
        } else {
          stockEl.innerHTML = '<div style="margin-top:8px;">' +
            lowStock.slice(0, 10).map(function (p) {
              return '<div class="info-row" style="padding:8px 0;cursor:pointer;" onclick="window.switchTab(\'products\')">' +
                '<span class="label">' + esc(p.name) + ' <span style="color:var(--muted);font-weight:400;">· ' + esc(p.brand || '') + '</span></span>' +
                '<span style="font-size:12px;color:var(--danger);font-weight:600;">' + p.stock + ' left</span>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      }

    }).catch(function (e) {
      console.error('[DASHBOARD ADMIN]', e);
      showToast('Could not load dashboard stats', 'error');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     VENDOR DASHBOARD
     Uses vendor_sales for revenue/orders instead of orders collection
     since Firestore rules block vendor order access.
  ═══════════════════════════════════════════════════════════ */
  function renderVendorDashboard(mc) {
    var vendorId   = window._currentVendorId;
    var vendorName = 'Your Brand';

    mc.innerHTML =
      '<div class="dashboard-shell">' +
        '<div class="section-header" style="margin-bottom:16px;">' +
          '<div class="section-title" id="vendor-dash-title">Dashboard</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) + '</div>' +
        '</div>' +
        '<div class="dash-stat-grid" id="dash-stat-grid">' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Revenue</div><div class="dash-stat-value" id="stat-revenue">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Orders</div><div class="dash-stat-value" id="stat-orders">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Products</div><div class="dash-stat-value" id="stat-products">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Unread Messages</div><div class="dash-stat-value" id="stat-unread">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Reviews</div><div class="dash-stat-value" id="stat-reviews">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Commission</div><div class="dash-stat-value" id="stat-commission">—</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px;">' +
          '<div class="card-header"><span class="card-title">Recent Orders</span></div>' +
          '<div id="dash-recent-orders" style="padding:0 16px 12px;"><span style="font-size:12px;color:var(--muted);">Loading...</span></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Your Top Products</span></div>' +
          '<div id="dash-top-products" style="padding:0 16px 12px;"><span style="font-size:12px;color:var(--muted);">Loading...</span></div>' +
        '</div>' +
      '</div>';

    loadVendorStats(vendorId, vendorName);
  }

  function loadVendorStats(vendorId, vendorName) {
    // Fetch vendor profile for the name
    var vendorPromise = vendorsRef.doc(vendorId).get().then(function (doc) {
      if (doc.exists) {
        var data = doc.data();
        vendorName = data.name || vendorName;
        var title = safeEl('vendor-dash-title');
        if (title) title.textContent = vendorName + ' Dashboard';
      }
      return doc.exists ? doc.data() : {};
    }).catch(function () { return {}; });

    Promise.all([
      vendorPromise,
      productsRef.where('vendorId', '==', vendorId).get(),
      reviewsRef.where('vendorId', '==', vendorId).get(),
      // Try vendor_sales first, fall back to calculating from orders (won't work for vendor)
      db.collection('vendor_sales').doc(vendorId).get()
    ]).then(function (results) {
      var vendorData   = results[0];
      var productsSnap = results[1];
      var reviewsSnap  = results[2];
      var salesDoc     = results[3];

      var products = productsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var reviews  = reviewsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });

      var activeProducts = products.filter(function (p) { return p.status === 'active'; }).length;
      var totalReviews   = reviews.length;
      var commissionRate = vendorData.commissionRate || 0;
      var unreadChats    = window._totalUnreadMessages || 0;

      // Revenue from vendor_sales collection
      var totalRevenue = 0;
      var totalOrders  = 0;
      var recentOrders = [];

      if (salesDoc.exists) {
        var salesData = salesDoc.data();
        totalRevenue = salesData.totalRevenue || 0;
        totalOrders  = salesData.totalOrders || 0;
        recentOrders = salesData.recentOrders || [];
      }

      setStat('stat-revenue',    'R' + totalRevenue.toLocaleString('en-ZA'));
      setStat('stat-orders',     totalOrders);
      setStat('stat-products',   activeProducts);
      setStat('stat-unread',     unreadChats);
      setStat('stat-reviews',    totalReviews);
      setStat('stat-commission', commissionRate + '%');

      // Recent orders
      var recentEl = safeEl('dash-recent-orders');
      if (recentEl) {
        if (recentOrders.length === 0) {
          recentEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No orders yet. Revenue data updates periodically.</div>';
        } else {
          recentEl.innerHTML = '<div class="table-wrap" style="margin-top:8px;"><table class="data-table">' +
            '<thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>' +
            '<tbody>' + recentOrders.slice(0, 8).map(function (o) {
              return '<tr>' +
                '<td style="font-weight:500;">#' + esc((o.orderNumber || o.id || '').toString().slice(-8).toUpperCase()) + '</td>' +
                '<td>' + esc(o.customerName || 'Guest') + '</td>' +
                '<td>' + fmt(o.total || 0) + '</td>' +
                '<td>' + window._statusBadge(o.status || 'pending') + '</td>' +
                '<td class="cell-muted">' + fmtDate(o.createdAt || o.date) + '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>';
        }
      }

      // Top products — calculate from products collection only (no order data available)
      var topEl = safeEl('dash-top-products');
      if (topEl) {
        if (activeProducts === 0) {
          topEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No active products yet. Add your first product to see performance.</div>';
        } else {
          topEl.innerHTML = '<div style="margin-top:8px;">' +
            products.filter(function(p) { return p.status === 'active'; }).slice(0, 5).map(function (p, i) {
              return '<div class="info-row" style="padding:8px 0;">' +
                '<span class="label">' + (i + 1) + '. ' + esc(p.name) + '</span>' +
                '<span style="font-size:12px;">' + fmt(p.price || 0) + ' · ' + p.stock + ' in stock</span>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      }

    }).catch(function (e) {
      console.error('[DASHBOARD VENDOR]', e);
      // Still show basic stats even if vendor_sales fails
      setStat('stat-revenue',  '—');
      setStat('stat-orders',   '—');
      showToast('Could not load full dashboard. Some data may be unavailable.', 'error');
    });
  }

  /* ─────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────── */
  function setStat(id, value) {
    var el = safeEl(id);
    if (el) el.textContent = String(value);
  }

})();
