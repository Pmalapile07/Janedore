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
     Platform owner — sees everything across all brands.
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
    // Fetch everything in parallel
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

      // Stats
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

      // Update stat cards
      setStat('stat-revenue',  'R' + totalRevenue.toLocaleString('en-ZA'));
      setStat('stat-orders',   totalOrders);
      setStat('stat-brands',   activeBrands);
      setStat('stat-products', totalProducts);
      setStat('stat-payouts',  pendingPayouts);
      setStat('stat-abandoned', abandoned);

      // Recent orders (last 8)
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

      // Brand performance
      var brandPerfEl = safeEl('dash-brand-perf');
      if (brandPerfEl) {
        if (vendors.length === 0) {
          brandPerfEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No brands yet</div>';
        } else {
          // Calculate per-brand revenue from orders
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
     Platform staff — operational view, no financials.
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
      reviewsRef.where('status', '==', 'pending').get(),
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

      // Stats
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

      // Recent orders (last 8)
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

      // Low stock list
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
     Brand owner — sees only their own brand's data.
  ═══════════════════════════════════════════════════════════ */
  function renderVendorDashboard(mc) {
    var vendorId   = window._currentVendorId;
    var vendorName = 'Your Brand';

    mc.innerHTML =
      '<div class="dashboard-shell">' +
        '<div class="section-header" style="margin-bottom:16px;">' +
          '<div class="section-title">Dashboard</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) + '</div>' +
        '</div>' +
        '<div class="dash-stat-grid" id="dash-stat-grid">' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Revenue</div><div class="dash-stat-value" id="stat-revenue">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Orders</div><div class="dash-stat-value" id="stat-orders">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Products</div><div class="dash-stat-value" id="stat-products">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Pending Orders</div><div class="dash-stat-value" id="stat-pending">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Unread Messages</div><div class="dash-stat-value" id="stat-unread">—</div></div>' +
          '<div class="dash-stat-card"><div class="dash-stat-label">Your Reviews</div><div class="dash-stat-value" id="stat-reviews">—</div></div>' +
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
        // Update the title
        var title = safeEl('section-title');
        if (title) title.textContent = vendorName + ' Dashboard';
      }
    }).catch(function () {});

    Promise.all([
      vendorPromise,
      ordersRef.where('vendorIds', 'array-contains', vendorId).orderBy('createdAt', 'desc').limit(100).get(),
      productsRef.where('vendorId', '==', vendorId).get(),
      reviewsRef.where('vendorId', '==', vendorId).get()
    ]).then(function (results) {
      var ordersSnap   = results[1];
      var productsSnap = results[2];
      var reviewsSnap  = results[3];

      var orders   = ordersSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var products = productsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var reviews  = reviewsSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });

      // Calculate revenue — only this vendor's items
      var totalRevenue = orders.reduce(function (sum, o) {
        return sum + (o.items || []).reduce(function (s, item) {
          if (item.vendorId === vendorId) return s + (item.price * item.qty);
          return s;
        }, 0);
      }, 0);

      var totalOrders   = orders.length;
      var totalProducts = products.filter(function (p) { return p.status === 'active'; }).length;
      var pendingOrders = orders.filter(function (o) { return o.status === 'pending' || o.status === 'processing'; }).length;
      var unreadChats   = window._totalUnreadMessages || 0;
      var totalReviews  = reviews.length;

      setStat('stat-revenue',  'R' + totalRevenue.toLocaleString('en-ZA'));
      setStat('stat-orders',   totalOrders);
      setStat('stat-products', totalProducts);
      setStat('stat-pending',  pendingOrders);
      setStat('stat-unread',   unreadChats);
      setStat('stat-reviews',  totalReviews);

      // Recent orders
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

      // Top products (by order frequency)
      var productSales = {};
      orders.forEach(function (o) {
        (o.items || []).forEach(function (item) {
          if (item.vendorId === vendorId) {
            productSales[item.productId] = (productSales[item.productId] || 0) + item.qty;
          }
        });
      });

      var topProducts = products
        .map(function (p) { return { name: p.name, sold: productSales[p.id] || 0, stock: p.stock }; })
        .sort(function (a, b) { return b.sold - a.sold; })
        .slice(0, 5);

      var topEl = safeEl('dash-top-products');
      if (topEl) {
        if (topProducts.length === 0 || topProducts.every(function (p) { return p.sold === 0; })) {
          topEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No sales data yet</div>';
        } else {
          topEl.innerHTML = '<div style="margin-top:8px;">' +
            topProducts.map(function (p, i) {
              return '<div class="info-row" style="padding:8px 0;">' +
                '<span class="label">' + (i + 1) + '. ' + esc(p.name) + '</span>' +
                '<span style="font-size:12px;">' + p.sold + ' sold · ' + p.stock + ' in stock</span>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      }

    }).catch(function (e) {
      console.error('[DASHBOARD VENDOR]', e);
      showToast('Could not load dashboard stats', 'error');
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
