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

    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      renderOverviewDashboard(mc);
    } else if (role === 'VENDOR') {
      renderVendorDashboard(mc);
    } else {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading dashboard...</div></div>';
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SUPER_ADMIN / ADMIN DASHBOARD — overview only
     Was a full page (stat cards, recent orders table, brand
     performance / low stock) above/below the overview widget; cut
     down to just the overview on request while the analytics piece
     is still being built out. The old stat-grid/table rendering and
     its extra Firestore queries (products/vendors/reviews) are gone
     too, not just hidden, since nothing reads them anymore.
  ═══════════════════════════════════════════════════════════ */
  function renderOverviewDashboard(mc) {
    mc.innerHTML = '<div class="dashboard-shell">' + dashOverviewHTML() + '</div>';
    loadOverviewStats();
  }

  function loadOverviewStats() {
    ordersRef.orderBy('createdAt', 'desc').limit(200).get().then(function (snap) {
      var orders = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      renderDashOverview(orders, _dashRangeDays);
    }).catch(function (e) {
      console.error('[DASHBOARD OVERVIEW]', e);
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

  /* ═══════════════════════════════════════════════════════════
     OVERVIEW — Shopify-style Live/Sessions/Sales/Orders/Conversion
     row + trend chart. The whole SUPER_ADMIN/ADMIN dashboard right
     now, on request, while the analytics piece is still being built
     out (not shown for Vendor — site-wide traffic isn't scoped per
     brand; vendors keep their own separate dashboard below).

     Sales/Orders and the chart are real, computed straight from
     Firestore. Live/Sessions/Conversion stay "—" for now: there's no
     visitor
     tracking wired up yet (no Google Analytics reads, no presence
     system). Once a GA4 property + service account are connected,
     those three get the same real treatment instead of being hidden.
  ═══════════════════════════════════════════════════════════ */
  var _dashRangeDays  = 30;
  var _dashOrdersCache = null;

  function dashOverviewHTML() {
    return '<div class="dash-overview">' +
      '<div class="dash-overview-stats">' +
        '<div class="dash-overview-stat"><span class="dash-overview-stat-label"><span class="dash-live-dot"></span>Live</span><span class="dash-overview-stat-value" id="ov-live">—</span></div>' +
        '<div class="dash-overview-stat"><span class="dash-overview-stat-label">Sessions</span><span class="dash-overview-stat-value" id="ov-sessions">—</span></div>' +
        '<div class="dash-overview-stat"><span class="dash-overview-stat-label">Total sales</span><span class="dash-overview-stat-value" id="ov-sales">—</span></div>' +
        '<div class="dash-overview-stat"><span class="dash-overview-stat-label">Orders</span><span class="dash-overview-stat-value" id="ov-orders">—</span></div>' +
        '<div class="dash-overview-stat"><span class="dash-overview-stat-label">Conversion</span><span class="dash-overview-stat-value" id="ov-conversion">—</span></div>' +
      '</div>' +
      '<div class="dash-overview-chart-wrap"><canvas id="dash-overview-chart"></canvas></div>' +
      '<div class="dash-overview-controls">' +
        [1, 7, 30, 90].map(function (d) {
          var label = d === 1 ? 'Today' : d + ' days';
          return '<button class="dash-overview-range-btn' + (d === _dashRangeDays ? ' active' : '') + '" data-days="' + d + '" onclick="window._setDashRange(' + d + ')">' + label + '</button>';
        }).join('') +
        '<button class="dash-overview-report-btn" onclick="window._showToast(\'Full reports coming soon\')">View report</button>' +
      '</div>' +
    '</div>';
  }

  window._setDashRange = function (days) {
    renderDashOverview(_dashOrdersCache || [], days);
  };

  function renderDashOverview(orders, days) {
    _dashOrdersCache = orders;
    _dashRangeDays    = days;

    document.querySelectorAll('.dash-overview-range-btn').forEach(function (b) {
      b.classList.toggle('active', Number(b.dataset.days) === days);
    });

    var today = new Date();
    var buckets = [];
    for (var i = days - 1; i >= 0; i--) {
      buckets.push({ date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - i), revenue: 0, orders: 0 });
    }
    var startMs = buckets[0].date.getTime();

    var totalSales = 0, totalOrders = 0;
    orders.forEach(function (o) {
      var ts = o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : null;
      if (!ts) return;
      var dayStart = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime();
      if (dayStart < startMs) return;
      var idx = Math.round((dayStart - startMs) / 86400000);
      if (idx < 0 || idx >= buckets.length) return;
      var amt = o.total || o.subtotal || 0;
      buckets[idx].revenue += amt;
      buckets[idx].orders  += 1;
      totalSales += amt;
      totalOrders += 1;
    });

    setStat('ov-sales',  'R' + totalSales.toLocaleString('en-ZA'));
    setStat('ov-orders', totalOrders);

    var canvas = safeEl('dash-overview-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }

    window._analyticsChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: buckets.map(function (b) { return b.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); }),
        datasets: [{
          data: buckets.map(function (b) { return b.revenue; }),
          borderColor: '#1a56db',
          backgroundColor: 'rgba(26,86,219,0.08)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return 'R' + ctx.parsed.y.toLocaleString('en-ZA'); } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 }, color: '#8a8a8a' } },
          y: { display: false, beginAtZero: true }
        }
      }
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
