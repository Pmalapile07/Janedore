(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc           = window._esc;
  var safeEl        = window._safeEl;
  var fmt           = window._fmt;
  var ordersRef     = window._ordersRef;

  /* ─────────────────────────────────────────────────────────
     RENDER DASHBOARD TAB
  ───────────────────────────────────────────────────────── */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =

      /* ── HEADER ── */
      '<div class="section-header" style="margin-bottom:14px;">' +
        '<div class="section-title">Dashboard</div>' +
        '<span class="ui-label" style="font-size:10px;">' +
          new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) +
        '</span>' +
      '</div>' +

      /* ── ORDERS CHART ── */
      '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header">' +
          '<span class="card-title">Orders — Last 30 Days</span>' +
        '</div>' +
        '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
      '</div>' +

      /* ── LAUNCH CENTER CARD ── */
      '<div class="launch-center-card" id="launch-center-card">' +
        '<div class="launch-card-top">' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="launch-card-label">Launch Center</div>' +
            '<div class="launch-pct" id="launch-pct-num">—</div>' +
            '<div class="launch-pct-label" id="launch-pct-label">Loading</div>' +
          '</div>' +
          '<div class="launch-card-icon-wrap">' +
            '<i class="ph-light ph-rocket-launch" style="font-size:22px;color:var(--accent);opacity:.7;"></i>' +
          '</div>' +
        '</div>' +
        '<div class="launch-progress-wrap">' +
          '<div class="launch-progress-bar-bg">' +
            '<div class="launch-progress-bar-fill" id="launch-bar" style="width:0%;transition:width .6s cubic-bezier(.32,.72,0,1);"></div>' +
          '</div>' +
          '<div class="launch-progress-detail" id="launch-progress-detail" style="font-size:10px;color:var(--muted2);margin-top:5px;letter-spacing:.03em;"></div>' +
        '</div>' +
        '<div class="launch-next-task">' +
          '<div class="launch-next-label" id="launch-next-label">Next Task</div>' +
          '<div class="launch-next-text" id="launch-next-text">—</div>' +
        '</div>' +
        '<button class="launch-open-btn" onclick="window._openLaunchCenter && window._openLaunchCenter()">' +
          '<i class="ph-light ph-arrow-square-out" style="font-size:15px;"></i>' +
          'Open Launch Center' +
        '</button>' +
      '</div>';

    /* Sync launch card from cached state */
    if (window._initLaunchCenter) window._initLaunchCenter();

    /* ── FETCH ORDERS FOR CHART ── */
    ordersRef.get().then(function (result) {
      var orders = result.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      buildOrdersChart(orders);
    }).catch(function (e) {
      console.error('[DASHBOARD]', e);
    });
  };

  /* ─────────────────────────────────────────────────────────
     ORDERS CHART
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
          x: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 9, family: 'Manrope' }, maxTicksLimit: 8, color: '#bbb' }
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 9, family: 'Manrope' }, precision: 0, color: '#bbb' },
            beginAtZero: true
          }
        }
      }
    });
  }

})();
