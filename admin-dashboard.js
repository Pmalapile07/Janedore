(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc           = window._esc;
  var safeEl        = window._safeEl;
  var fmt           = window._fmt;
  var productsRef   = window._productsRef;
  var reviewsRef    = window._reviewsRef;
  var newsletterRef = window._newsletterRef;
  var ordersRef     = window._ordersRef;

  /* ─────────────────────────────────────────────────────────
     LAUNCH CENTER CONFIG
     Edit these values to update progress/task
  ───────────────────────────────────────────────────────── */
  var LAUNCH_PCT  = 63;
  var LAUNCH_TASK = 'Add first hero product';

  /* ─────────────────────────────────────────────────────────
     RENDER DASHBOARD TAB
  ───────────────────────────────────────────────────────── */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      /* ── LAUNCH CENTER ── */
      '<div class="launch-center-card" id="launch-center-card">' +
        '<div class="launch-card-top">' +
          '<div>' +
            '<div class="launch-card-label">Launch Center</div>' +
            '<div class="launch-pct" id="launch-pct-num">0%</div>' +
            '<div class="launch-pct-label">Complete</div>' +
          '</div>' +
          '<span class="launch-card-emoji">🚀</span>' +
        '</div>' +
        '<div class="launch-progress-wrap">' +
          '<div class="launch-progress-bar-bg">' +
            '<div class="launch-progress-bar-fill" id="launch-bar" style="width:0%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="launch-next-task">' +
          '<div class="launch-next-label">Next Task</div>' +
          '<div class="launch-next-text">' + esc(LAUNCH_TASK) + '</div>' +
        '</div>' +
        '<button class="launch-open-btn" onclick="window._openLaunchCenter && window._openLaunchCenter()">' +
          'Open Launch Center' +
        '</button>' +
      '</div>' +

      /* ── OVERVIEW HEADER ── */
      '<div class="section-header" style="margin-bottom:14px;">' +
        '<div class="section-title">Overview</div>' +
        '<span class="ui-label" style="font-size:10px;">' +
          new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) +
        '</span>' +
      '</div>' +

      /* ── STAT CARDS ── */
      '<div class="stats-grid" id="dash-stats">' +
        Array(4).fill(
          '<div class="stat-card">' +
            '<div class="stat-number" style="opacity:.15;font-size:24px;">—</div>' +
            '<div class="stat-label" style="opacity:.3;">Loading</div>' +
          '</div>'
        ).join('') +
      '</div>' +

      /* ── CHARTS ── */
      '<div style="display:grid;grid-template-columns:1fr;gap:10px;">' +
        '<div class="card"><div class="card-header"><span class="card-title">Orders — Last 30 Days</span></div>' +
        '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div></div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">' +
        '<div class="card"><div class="card-header"><span class="card-title">Top Products</span></div>' +
        '<div id="top-products-list" style="padding:4px 0;"></div></div>' +
        '<div class="card"><div class="card-header"><span class="card-title">Low Stock</span></div>' +
        '<div id="low-stock-list" style="padding:4px 0;"></div></div>' +
      '</div>' +

      '<div style="margin-top:10px;" class="card"><div class="card-header"><span class="card-title">Revenue by Brand</span></div>' +
      '<div class="chart-wrap"><canvas id="revenue-chart" class="chart-canvas"></canvas></div></div>';

    /* Animate launch bar after paint */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var bar = safeEl('launch-bar');
        var pct = safeEl('launch-pct-num');
        if (bar) bar.style.width = LAUNCH_PCT + '%';
        if (pct) pct.textContent = LAUNCH_PCT + '%';
      });
    });

    /* ── FETCH DATA ── */
    Promise.all([
      productsRef.get(),
      reviewsRef.get(),
      newsletterRef.get(),
      ordersRef.get()
    ]).then(function (results) {
      var products     = results[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var orders       = results[3].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var totalRevenue = orders.reduce(function (s, o) { return s + (o.subtotal || 0); }, 0);
      var pendingOrders = orders.filter(function (o) { return (o.status || 'pending') === 'pending'; }).length;
      var avgOrder     = orders.length ? totalRevenue / orders.length : 0;

      var statsEl = safeEl('dash-stats');
      if (statsEl) {
        statsEl.className = 'stats-grid';
        statsEl.style.gridTemplateColumns = 'repeat(4,1fr)';
        statsEl.innerHTML =
          statCard(fmt(totalRevenue), 'Total Revenue', true) +
          statCard(orders.length,     'Total Orders') +
          statCard(fmt(avgOrder),     'Avg Order', true) +
          statCard(pendingOrders,     'Pending') +
          statCard(results[0].size,   'Products') +
          statCard(results[1].size,   'Reviews') +
          statCard(results[2].size,   'Subscribers') +
          statCard(window._totalUnreadMessages || 0, 'Unread Chats');
      }

      buildOrdersChart(orders);

      var topEl = safeEl('top-products-list');
      if (topEl) {
        var sorted = products.slice()
          .sort(function (a, b) { return (b.unitsSold || 0) - (a.unitsSold || 0); })
          .slice(0, 5);
        topEl.innerHTML = sorted.length === 0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-state-text">No data yet</div></div>'
          : sorted.map(function (p) {
              return '<div class="info-row">' +
                '<span style="font-size:12.5px;">' + esc(p.name.substring(0, 24)) + (p.name.length > 24 ? '…' : '') + '</span>' +
                '<span class="ui-label">' + esc(String(p.unitsSold || 0)) + ' sold</span>' +
              '</div>';
            }).join('');
      }

      buildRevenueChart(orders, products);

      var lowEl = safeEl('low-stock-list');
      if (lowEl) {
        var lowStock = products.filter(function (p) { return (p.stock || 0) < 5; }).slice(0, 6);
        lowEl.innerHTML = lowStock.length === 0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-state-text">All well stocked</div></div>'
          : lowStock.map(function (p) {
              return '<div class="info-row">' +
                '<span style="font-size:12.5px;">' + esc(p.name.substring(0, 24)) + (p.name.length > 24 ? '…' : '') + '</span>' +
                '<span style="color:' + (p.stock === 0 ? 'var(--danger)' : 'var(--warning)') + ';font-size:11px;font-weight:600;">' +
                  esc(String(p.stock || 0)) + ' left' +
                '</span>' +
              '</div>';
            }).join('');
      }

    }).catch(function (e) {
      console.error('[DASHBOARD_TAB]', e);
      var statsEl = safeEl('dash-stats');
      if (statsEl) {
        statsEl.innerHTML = '<p style="color:var(--danger);padding:16px;font-size:12px;">Error: ' + esc(e.message) + '</p>';
      }
    });
  };

  /* ─────────────────────────────────────────────────────────
     STAT CARD BUILDER
     isRevenue = true → use smaller, weighted revenue style
  ───────────────────────────────────────────────────────── */
  function statCard(value, label, isRevenue) {
    var numClass = 'stat-number' + (isRevenue ? ' revenue' : '');
    return '<div class="stat-card">' +
      '<div class="' + numClass + '">' + esc(String(value)) + '</div>' +
      '<div class="stat-label">' + esc(label) + '</div>' +
    '</div>';
  }

  /* ─────────────────────────────────────────────────────────
     CHARTS
  ───────────────────────────────────────────────────────── */
  function buildOrdersChart(orders) {
    var canvas = safeEl('orders-chart');
    if (!canvas || !window.Chart) return;
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }

    var days = {}, now = Date.now(), DAY = 86400000;
    for (var i = 29; i >= 0; i--) {
      var d   = new Date(now - i * DAY);
      var key = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
      days[key] = 0;
    }
    orders.forEach(function (o) {
      if (!o.createdAt) return;
      var d   = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      var key = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
      if (days[key] !== undefined) days[key]++;
    });

    window._analyticsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Object.keys(days),
        datasets: [{
          label: 'Orders',
          data: Object.values(days),
          borderColor: '#1a56db',
          backgroundColor: 'rgba(26,86,219,0.05)',
          borderWidth: 1.5,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: '#1a56db'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family: 'Manrope' }, maxTicksLimit: 8, color: '#bbb' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family: 'Manrope' }, precision: 0, color: '#bbb' }, beginAtZero: true }
        }
      }
    });
  }

  function buildRevenueChart(orders, products) {
    var canvas = safeEl('revenue-chart');
    if (!canvas || !window.Chart) return;
    if (window._revenueChart) { window._revenueChart.destroy(); window._revenueChart = null; }

    var brandMap = {};
    products.forEach(function (p) { brandMap[p.id] = p.brand || 'Unknown'; });

    var brandRevenue = {};
    orders.forEach(function (o) {
      var brand = (o.brand || (o.items && o.items[0] && brandMap[o.items[0].productId]) || 'JANEDORE');
      brandRevenue[brand] = (brandRevenue[brand] || 0) + (o.subtotal || 0);
    });

    var labels = Object.keys(brandRevenue);
    var data   = Object.values(brandRevenue);
    if (labels.length === 0) { labels = ['No data']; data = [0]; }

    window._revenueChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Revenue',
          data: data,
          backgroundColor: ['#111', '#1a56db', '#3b82f6', '#60a5fa', '#93c5fd'].slice(0, labels.length),
          borderWidth: 0,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9, family: 'Manrope' }, color: '#bbb' } },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 9, family: 'Manrope' }, callback: function (v) { return 'R' + v; }, color: '#bbb' },
            beginAtZero: true
          }
        }
      }
    });
  }

})();
