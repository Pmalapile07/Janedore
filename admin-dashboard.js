(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var ordersRef = window._ordersRef;

  var BRANDS = [
    { key: 'JANEDORE', color: '#1a56db', bg: 'rgba(26,86,219,0.07)' },
    { key: 'THATO',    color: '#111111', bg: 'rgba(17,17,17,0.06)'  }
  ];

  /* active brand filters — all on by default */
  var _activeFilters = { JANEDORE: true, THATO: true };
  var _allOrders = [];

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

      /* ── ORDERS CHART CARD ── */
      '<div class="card" style="margin-bottom:10px;">' +

        /* Card header row */
        '<div class="card-header" style="flex-wrap:wrap;gap:8px;">' +
          '<span class="card-title">Orders — Last 30 Days</span>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;">' +

            /* Live View pill */
            '<div class="dash-live-pill" id="dash-live-pill">' +
              '<span class="dash-live-dot"></span>' +
              '<span class="dash-live-label" id="dash-live-count">Live View</span>' +
            '</div>' +

            /* Brand toggles */
            BRANDS.map(function (b) {
              return '<button class="dash-brand-toggle active" id="dash-toggle-' + b.key + '"' +
                ' onclick="window._dashToggleBrand(\'' + b.key + '\')"' +
                ' style="--brand-color:' + b.color + ';">' +
                '<span class="dash-brand-dot" style="background:' + b.color + ';"></span>' +
                b.key +
              '</button>';
            }).join('') +

          '</div>' +
        '</div>' +

        '<div class="chart-wrap" style="position:relative;">' +
          '<canvas id="orders-chart" class="chart-canvas"></canvas>' +
        '</div>' +

      '</div>' +

      /* ── DAY DETAIL POPUP (hidden) ── */
      '<div id="dash-day-popup" class="dash-day-popup" style="display:none;">' +
        '<div class="dash-day-popup-inner">' +
          '<div class="dash-day-popup-header">' +
            '<span class="dash-day-popup-title" id="dash-popup-title">—</span>' +
            '<button class="dash-day-popup-close" onclick="window._dashClosePopup()">' +
              '<i class="ph-light ph-x"></i>' +
            '</button>' +
          '</div>' +
          '<div id="dash-popup-body" class="dash-day-popup-body"></div>' +
        '</div>' +
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

    /* Sync launch card */
    if (window._initLaunchCenter) window._initLaunchCenter();

    /* Fetch orders */
    ordersRef.get().then(function (result) {
      _allOrders = result.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      buildChart(_allOrders);
    }).catch(function (e) {
      console.error('[DASHBOARD]', e);
    });
  };

  /* ─────────────────────────────────────────────────────────
     BRAND TOGGLE
  ───────────────────────────────────────────────────────── */
  window._dashToggleBrand = function (key) {
    _activeFilters[key] = !_activeFilters[key];
    var btn = safeEl('dash-toggle-' + key);
    if (btn) {
      if (_activeFilters[key]) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
    buildChart(_allOrders);
  };

  /* ─────────────────────────────────────────────────────────
     BUILD CHART
  ───────────────────────────────────────────────────────── */
  function buildDayMap() {
    var days = {}, now = Date.now(), DAY = 86400000;
    for (var i = 29; i >= 0; i--) {
      var d   = new Date(now - i * DAY);
      var key = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
      days[key] = key;
    }
    return Object.keys(days);
  }

  function buildChart(orders) {
    var canvas = safeEl('orders-chart');
    if (!canvas || !window.Chart) return;
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }

    var labels = buildDayMap();

    /* Build per-brand per-day counts AND store order refs */
    var brandDayData = {};   /* brandKey → { dayLabel: count } */
    var brandDayOrders = {}; /* brandKey → { dayLabel: [orders] } */

    BRANDS.forEach(function (b) {
      brandDayData[b.key]   = {};
      brandDayOrders[b.key] = {};
      labels.forEach(function (lbl) {
        brandDayData[b.key][lbl]   = 0;
        brandDayOrders[b.key][lbl] = [];
      });
    });

    /* Also track "unknown" brand under JANEDORE as fallback */
    orders.forEach(function (o) {
      if (!o.createdAt) return;
      var d   = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      var lbl = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
      if (brandDayData['JANEDORE'][lbl] === undefined) return;

      /* Determine brand */
      var brand = (o.brand || '').toUpperCase();
      var matched = BRANDS.find(function (b) { return b.key === brand; });
      var key = matched ? matched.key : 'JANEDORE';

      brandDayData[key][lbl]++;
      brandDayOrders[key][lbl].push(o);
    });

    /* Store for click handler */
    window._dashBrandDayOrders = brandDayOrders;
    window._dashLabels         = labels;

    var datasets = BRANDS
      .filter(function (b) { return _activeFilters[b.key]; })
      .map(function (b) {
        return {
          label: b.key,
          data: labels.map(function (lbl) { return brandDayData[b.key][lbl]; }),
          borderColor: b.color,
          backgroundColor: b.bg,
          borderWidth: 1.5,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: b.color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        };
      });

    window._analyticsChart = new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false } /* We use custom popup */
        },
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
        },
        onClick: function (evt, elements) {
          if (!elements || elements.length === 0) return;
          var idx = elements[0].index;
          var lbl = labels[idx];
          window._dashOpenDayPopup(lbl);
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     DAY POPUP
  ───────────────────────────────────────────────────────── */
  window._dashOpenDayPopup = function (dayLabel) {
    var popup     = safeEl('dash-day-popup');
    var titleEl   = safeEl('dash-popup-title');
    var bodyEl    = safeEl('dash-popup-body');
    if (!popup || !titleEl || !bodyEl) return;

    /* Collect orders from all brands for this day */
    var allDayOrders = [];
    var brandDayOrders = window._dashBrandDayOrders || {};
    BRANDS.forEach(function (b) {
      if (brandDayOrders[b.key] && brandDayOrders[b.key][dayLabel]) {
        brandDayOrders[b.key][dayLabel].forEach(function (o) {
          allDayOrders.push(Object.assign({ _brand: b.key, _color: b.color }, o));
        });
      }
    });

    titleEl.textContent = dayLabel;

    if (allDayOrders.length === 0) {
      bodyEl.innerHTML =
        '<div class="dash-popup-empty">' +
          '<i class="ph-light ph-receipt" style="font-size:22px;opacity:.2;"></i>' +
          '<span>No orders on this day</span>' +
        '</div>';
    } else {
      bodyEl.innerHTML = allDayOrders.map(function (o) {
        var orderId  = (o.orderId || o.id || '—').toString().slice(-6).toUpperCase();
        var customer = o.customerName || o.email || 'Customer';
        var amount   = o.subtotal != null ? 'R' + Number(o.subtotal).toFixed(2) : '—';
        var status   = o.status || 'pending';
        return '<div class="dash-popup-row">' +
          '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
            '<span class="dash-popup-brand-dot" style="background:' + o._color + ';"></span>' +
            '<div style="min-width:0;">' +
              '<div class="dash-popup-order-id">#' + esc(orderId) + '</div>' +
              '<div class="dash-popup-customer">' + esc(customer) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">' +
            '<span class="dash-popup-amount">' + esc(amount) + '</span>' +
            '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    popup.style.display = 'block';
    requestAnimationFrame(function () { popup.classList.add('open'); });
  };

  window._dashClosePopup = function () {
    var popup = safeEl('dash-day-popup');
    if (!popup) return;
    popup.classList.remove('open');
    setTimeout(function () { popup.style.display = 'none'; }, 220);
  };

  /* Close popup on outside click */
  document.addEventListener('click', function (e) {
    var popup = safeEl('dash-day-popup');
    if (!popup || popup.style.display === 'none') return;
    if (!popup.contains(e.target) && !e.target.closest('#orders-chart')) {
      window._dashClosePopup();
    }
  });

})();
