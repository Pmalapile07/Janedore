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
     HOME — laid out like the Shopify app: a black top half with the
     numbers (Live, Sessions, Total sales, Orders, Conversion rate) and
     a chart of the one you tap, then a white sheet with what needs
     doing ("activity"). The top bar on Home (admin.html #nav-home) has
     the account circle on the left and notifications on the right.

     Sales/Orders come from Firestore; Live and Sessions from the
     store's own visit counting (/api/admin/analytics, analytics-api.js);
     Conversion is orders ÷ sessions. Activity and notifications come
     from /api/admin/home (admin-home-api.js), scoped to the role.
  ═══════════════════════════════════════════════════════════ */
  var _dashRangeDays   = 30;
  var _dashMetric      = 'sales';
  var _dashOrdersCache = null;
  var _dashDaily       = null; // sessions per day from /api/admin/analytics
  var _homeData        = null; // /api/admin/home
  var RANGES = [{ d: 1, label: 'Today' }, { d: 7, label: '7 days' }, { d: 30, label: '30 days' }, { d: 90, label: '90 days' }];

  function authedGet(path) {
    var user = window._currentUser;
    if (!user || !user.getIdToken) return Promise.reject(new Error('Not signed in'));
    return user.getIdToken().then(function (token) {
      return fetch(path, { headers: { 'Authorization': 'Bearer ' + token } });
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function rangeLabel(days) {
    var r = RANGES.filter(function (x) { return x.d === days; })[0];
    return r ? r.label : days + ' days';
  }

  function heroStat(key, label, extra) {
    return '<button type="button" class="dash-hero-stat' + (key === _dashMetric ? ' active' : '') + '" data-metric="' + key + '"' +
      (key === 'live' ? ' disabled' : ' onclick="window._setDashMetric(\'' + key + '\')"') + '>' +
      '<span class="dash-hero-stat-label">' + label + '</span>' +
      '<span class="dash-hero-stat-value">' + (extra || '') + '<span id="ov-' + key + '">-</span></span>' +
    '</button>';
  }

  function activitySheetHTML(inner) {
    return '<div class="dash-sheet">' +
      '<div class="dash-greeting"><span class="dash-greeting-hi" id="dash-greeting-hi">Hi.</span> Here’s your activity</div>' +
      '<div id="dash-activity">' + (inner || '<div class="dash-activity-loading">Loading…</div>') + '</div>' +
    '</div>';
  }

  function renderOverviewDashboard(mc) {
    mc.innerHTML = '<div class="dash-home">' +
      '<div class="dash-hero">' +
        '<div class="dash-hero-stats">' +
          heroStat('live', 'Live', '<span class="dash-hero-live-dot"></span>') +
          heroStat('sessions', 'Sessions') +
          heroStat('sales', 'Total sales') +
          heroStat('orders', 'Orders') +
          heroStat('conversion', 'Conversion rate') +
        '</div>' +
        '<div class="dash-hero-chart"><canvas id="dash-overview-chart"></canvas></div>' +
        '<div class="dash-hero-controls">' +
          '<div class="dash-range">' +
            '<button type="button" class="dash-hero-btn" id="dash-range-btn" onclick="window._toggleDashRange(event)"><i class="ph ph-calendar-blank"></i><span id="dash-range-label">' + rangeLabel(_dashRangeDays) + '</span></button>' +
            '<div class="dash-range-menu" id="dash-range-menu">' + RANGES.map(function (r) {
              return '<button type="button" data-days="' + r.d + '" class="' + (r.d === _dashRangeDays ? 'active' : '') + '" onclick="window._setDashRange(' + r.d + ')">' + r.label + '</button>';
            }).join('') + '</div>' +
          '</div>' +
          '<button type="button" class="dash-hero-btn" onclick="window.switchTab(\'analytics\')"><i class="ph ph-chart-line"></i>View report</button>' +
        '</div>' +
      '</div>' +
      activitySheetHTML() +
    '</div>';
    loadOverviewStats();
    loadHome();
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

  window._toggleDashRange = function (e) {
    if (e) e.stopPropagation();
    var menu = safeEl('dash-range-menu');
    if (menu) menu.classList.toggle('open');
  };
  document.addEventListener('click', function () {
    var menu = safeEl('dash-range-menu');
    if (menu) menu.classList.remove('open');
  });

  window._setDashRange = function (days) {
    var menu = safeEl('dash-range-menu');
    if (menu) {
      menu.classList.remove('open');
      menu.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', Number(b.dataset.days) === days); });
    }
    var label = safeEl('dash-range-label');
    if (label) label.textContent = rangeLabel(days);
    renderDashOverview(_dashOrdersCache || [], days);
  };

  window._setDashMetric = function (metric) {
    _dashMetric = metric;
    document.querySelectorAll('.dash-hero-stat').forEach(function (b) { b.classList.toggle('active', b.dataset.metric === metric); });
    drawDashChart();
  };

  var _dashBuckets = [];
  function renderDashOverview(orders, days) {
    _dashOrdersCache = orders;
    _dashRangeDays    = days;

    var today = new Date();
    var buckets = [];
    for (var i = days - 1; i >= 0; i--) {
      buckets.push({ date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - i), revenue: 0, orders: 0, sessions: 0 });
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
    _dashBuckets = buckets;

    setStat('ov-sales',  'R' + totalSales.toLocaleString('en-ZA'));
    setStat('ov-orders', totalOrders);
    drawDashChart();
    loadDashTraffic(days, totalOrders);
  }

  function chartSeries() {
    return _dashBuckets.map(function (b) {
      if (_dashMetric === 'orders') return b.orders;
      if (_dashMetric === 'sessions') return b.sessions;
      if (_dashMetric === 'conversion') return b.sessions ? Math.round(b.orders / b.sessions * 1000) / 10 : 0;
      return b.revenue;
    });
  }
  function formatMetric(v) {
    if (_dashMetric === 'sales') return 'R' + Number(v).toLocaleString('en-ZA');
    if (_dashMetric === 'conversion') return v + '%';
    return Number(v).toLocaleString('en-ZA');
  }

  // Dark chart like Shopify's: faint horizontal lines with amounts on
  // the left, dates along the bottom. An empty range still gets a 0–1
  // scale so the lines show.
  function drawDashChart() {
    var canvas = safeEl('dash-overview-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }
    var data = chartSeries();
    var max = Math.max.apply(null, data.concat([0]));
    window._analyticsChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: _dashBuckets.map(function (b) { return b.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); }),
        // Nothing in the range (no sales, orders...): just the plain grid,
        // no line.
        datasets: [{ data: data, borderColor: max ? '#3b82f6' : 'transparent', backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: !!max }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return formatMetric(ctx.parsed.y); } } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 4, maxRotation: 0, font: { size: 11 }, color: 'rgba(255,255,255,0.55)' } },
          y: {
            beginAtZero: true, suggestedMax: max ? undefined : 1,
            grid: { color: 'rgba(255,255,255,0.12)', drawTicks: false }, border: { display: false },
            ticks: { maxTicksLimit: 3, padding: 8, font: { size: 11 }, color: 'rgba(255,255,255,0.55)', callback: function (v) { return formatMetric(v); } }
          }
        }
      }
    });
  }

  // Live, Sessions and Conversion for the chosen range. A newer call
  // (another range) wins over one still loading. Live refreshes every
  // 30 seconds while Home is open.
  var _dashTrafficCall = 0;
  var _dashLiveTimer = null;
  function loadDashTraffic(days, orders) {
    var call = ++_dashTrafficCall;
    authedGet('/api/admin/analytics?days=' + days).then(function (data) {
      if (call !== _dashTrafficCall) return;
      setStat('ov-live', data.live || 0);
      setStat('ov-sessions', (data.sessions || 0).toLocaleString('en-ZA'));
      setStat('ov-conversion', data.sessions ? (orders / data.sessions * 100).toFixed(1) + '%' : '0%');
      (data.daily || []).forEach(function (d, i) {
        var b = _dashBuckets[_dashBuckets.length - (data.daily.length - i)];
        if (b) b.sessions = d.sessions || 0;
      });
      if (_dashMetric === 'sessions' || _dashMetric === 'conversion') drawDashChart();
    }).catch(function (e) { console.warn('[DASHBOARD] Analytics:', e.message); });
    if (!_dashLiveTimer) {
      _dashLiveTimer = setInterval(function () {
        if (!safeEl('ov-live')) { clearInterval(_dashLiveTimer); _dashLiveTimer = null; return; }
        if (document.visibilityState !== 'visible') return;
        authedGet('/api/admin/analytics?days=1').then(function (data) { setStat('ov-live', data.live || 0); }).catch(function () {});
      }, 30000);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     VENDOR HOME — same black top half with the brand's own numbers
     (vendor_sales; Firestore rules block vendor order reads), then the
     activity sheet with their page setup, recent orders and products.
  ═══════════════════════════════════════════════════════════ */
  function renderVendorDashboard(mc) {
    var vendorId   = window._currentVendorId;
    var vendorName = 'Your brand';
    var stat = function (id, label) {
      return '<div class="dash-hero-stat"><span class="dash-hero-stat-label">' + label + '</span><span class="dash-hero-stat-value" id="' + id + '">-</span></div>';
    };
    mc.innerHTML = '<div class="dash-home">' +
      '<div class="dash-hero">' +
        '<div class="dash-hero-stats">' +
          stat('stat-revenue', 'Total sales') + stat('stat-orders', 'Orders') + stat('stat-products', 'Products') +
          stat('stat-reviews', 'Reviews') + stat('stat-commission', 'Commission') +
        '</div>' +
      '</div>' +
      activitySheetHTML() +
    '</div>';
    loadVendorStats(vendorId, vendorName);
    loadHome();
  }

  function loadVendorStats(vendorId, vendorName) {
    var vendorPromise = vendorsRef.doc(vendorId).get().then(function (doc) {
      // Commission lives in vendorPrivate (see admin-vendors.js).
      return db.collection('vendorPrivate').doc(vendorId).get().then(function (p) {
        return Object.assign({}, doc.exists ? doc.data() : {}, p.exists ? p.data() : {});
      }).catch(function () { return doc.exists ? doc.data() : {}; });
    }).catch(function () { return {}; });

    Promise.all([
      vendorPromise,
      productsRef.where('vendorId', '==', vendorId).get(),
      reviewsRef.where('vendorId', '==', vendorId).get(),
      db.collection('vendor_sales').doc(vendorId).get()
    ]).then(function (results) {
      var vendorData = results[0];
      var products = results[1].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var activeProducts = products.filter(function (p) { return p.status === 'active'; });
      var sales = results[3].exists ? results[3].data() : {};

      setStat('stat-revenue',    'R' + (sales.totalRevenue || 0).toLocaleString('en-ZA'));
      setStat('stat-orders',     sales.totalOrders || 0);
      setStat('stat-products',   activeProducts.length);
      setStat('stat-reviews',    results[2].size);
      setStat('stat-commission', (vendorData.commissionRate || 0) + '%');

      var recentOrders = sales.recentOrders || [];
      var extra = safeEl('dash-vendor-extra');
      if (!extra) {
        extra = document.createElement('div');
        extra.id = 'dash-vendor-extra';
        var sheet = document.querySelector('.dash-sheet');
        if (sheet) sheet.appendChild(extra);
      }
      extra.innerHTML =
        '<div class="dash-sheet-title">Recent orders</div>' +
        (recentOrders.length ? recentOrders.slice(0, 8).map(function (o) {
          return '<div class="dash-row"><span class="dash-row-text">#' + esc((o.orderNumber || o.id || '').toString().slice(-8).toUpperCase()) + ' · ' + esc(o.customerName || 'Guest') + '</span><span class="dash-row-meta">' + fmt(o.total || 0) + '</span></div>';
        }).join('') : '<div class="dash-row-empty">No orders yet.</div>') +
        '<div class="dash-sheet-title">Your products</div>' +
        (activeProducts.length ? activeProducts.slice(0, 5).map(function (p) {
          return '<div class="dash-row"><span class="dash-row-text">' + esc(p.name) + '</span><span class="dash-row-meta">' + fmt(p.price || 0) + ' · ' + (p.stock || 0) + ' in stock</span></div>';
        }).join('') : '<div class="dash-row-empty">No active products yet.</div>');
    }).catch(function (e) {
      console.error('[DASHBOARD VENDOR]', e);
      setStat('stat-revenue', '-');
      setStat('stat-orders', '-');
      showToast('Could not load full dashboard. Some data may be unavailable.', 'error');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ACTIVITY, ACCOUNT AND NOTIFICATIONS
  ═══════════════════════════════════════════════════════════ */
  var ACTIVITY = {
    orders:       { icon: 'ph-package',            one: 'order to fulfil',              many: 'orders to fulfil',              module: 'orders' },
    returns:      { icon: 'ph-arrow-u-up-left',    one: 'return request to review',     many: 'return requests to review',     module: 'orders' },
    exchanges:    { icon: 'ph-arrows-left-right',  one: 'exchange request to review',   many: 'exchange requests to review',   module: 'orders' },
    applications: { icon: 'ph-file-text',          one: 'new partner application',      many: 'new partner applications',      module: 'vendors' },
    reports:      { icon: 'ph-flag',               one: 'brand concern to review',      many: 'brand concerns to review',      module: 'vendors' },
    contacts:     { icon: 'ph-envelope-simple',    one: 'customer care message',        many: 'customer care messages',        module: 'inbox' },
    chats:        { icon: 'ph-chat',               one: 'unread chat',                  many: 'unread chats',                  module: 'inbox' }
  };
  var SETUP = {
    logo:    { label: 'Add your logo',       tab: 'vendors' },
    hero:    { label: 'Add a hero image',    tab: 'vendors' },
    product: { label: 'Add your first product', tab: 'products' }
  };
  var NOTE_ICONS = { order: 'ph-package', return: 'ph-arrow-u-up-left', exchange: 'ph-arrows-left-right', application: 'ph-file-text', report: 'ph-flag', message: 'ph-envelope-simple', review: 'ph-star', interest: 'ph-handshake' };
  var NOTES_SEEN_KEY = 'jd_admin_notes_seen';
  var NOTES_CLEARED_KEY = 'jd_admin_notes_cleared';

  function canOpen(module) { return !window._can || window._can(module, 'read') || window._can(module, 'read_own'); }

  function loadHome() {
    paintAccount();
    authedGet('/api/admin/home').then(function (data) {
      _homeData = data;
      paintAccount();
      paintActivity();
      paintBellDot();
    }).catch(function (e) {
      console.warn('[DASHBOARD] Home:', e.message);
      _homeData = { activity: [], notifications: [] };
      paintActivity();
    });
  }

  function paintActivity() {
    var el = safeEl('dash-activity');
    if (!el || !_homeData) return;
    var html = '';
    var setup = (_homeData.setup || []).filter(function (s) { return SETUP[s.key]; });
    if (setup.length && setup.some(function (s) { return !s.done; })) {
      html += '<div class="dash-sheet-title">Set up your brand page</div>' + setup.map(function (s) {
        return '<button type="button" class="dash-row dash-row-btn' + (s.done ? ' done' : '') + '" onclick="window.switchTab(\'' + SETUP[s.key].tab + '\')">' +
          '<i class="ph ' + (s.done ? 'ph-check-circle' : 'ph-circle') + ' dash-row-icon"></i>' +
          '<span class="dash-row-text">' + SETUP[s.key].label + '</span><i class="ph ph-caret-right dash-row-caret"></i></button>';
      }).join('');
    }
    var items = (_homeData.activity || []).slice();
    var unread = window._totalUnreadMessages || 0;
    if (unread) items.push({ key: 'chats', count: unread, tab: 'messages' });
    items = items.filter(function (a) { return a.count > 0 && ACTIVITY[a.key] && canOpen(ACTIVITY[a.key].module); });
    if (items.length) {
      html += (html ? '<div class="dash-sheet-title">To do</div>' : '') + items.map(function (a) {
        var def = ACTIVITY[a.key];
        return '<button type="button" class="dash-row dash-row-btn" onclick="window.switchTab(\'' + a.tab + '\')">' +
          '<i class="ph ' + def.icon + ' dash-row-icon"></i>' +
          '<span class="dash-row-text">' + a.count + ' ' + (a.count === 1 ? def.one : def.many) + '</span><i class="ph ph-caret-right dash-row-caret"></i></button>';
      }).join('');
    }
    if (!html) {
      html = '<div class="dash-all-done"><i class="ph ph-check-circle"></i>' +
        '<div class="dash-all-done-title">That’s it for now</div>' +
        '<div class="dash-all-done-sub">Check back later for more insights about your business.</div></div>';
    }
    el.innerHTML = html;
  }

  // Who's signed in: the name on their admin profile (Admins tab) when
  // there is one; otherwise a brand by its brand name, and staff by
  // their role ("super admin", "admin").
  var ROLE_NAMES = { SUPER_ADMIN: 'super admin', ADMIN: 'admin', VENDOR: 'vendor' };
  var _staffName = null;
  function displayName() {
    if (_staffName) return _staffName;
    var role = window._currentUserRole;
    if (role === 'VENDOR' && _homeData && _homeData.brand && _homeData.brand.name) return _homeData.brand.name;
    return ROLE_NAMES[role] || 'there';
  }
  function initials(name) {
    if (!_staffName && name === ROLE_NAMES.SUPER_ADMIN) return 'SA';
    return String(name).trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'J';
  }
  function paintAccount() {
    if (_staffName === null && window._currentUser) {
      _staffName = '';
      db.collection('admins').doc(window._currentUser.uid).get().then(function (d) {
        _staffName = (d.exists && String(d.data().name || '').trim()) || '';
        if (_staffName) paintAccount();
      }).catch(function () {});
    }
    var name = displayName();
    var el = safeEl('nav-account-initials');
    var logo = window._currentUserRole === 'VENDOR' && _homeData && _homeData.brand && _homeData.brand.logoUrl;
    if (el) el.innerHTML = logo ? '<img src="' + esc(logo) + '" alt="">' : esc(initials(name));
    var hi = safeEl('dash-greeting-hi');
    if (hi) hi.textContent = 'Hi ' + name + '.';
    rememberAccount();
  }

  // ── Account switcher (like the Shopify app) ──────────────────
  // A card from the top listing the accounts used on this device, the
  // signed-in one first with a ··· menu (Manage account, Log out), the
  // others to switch to (signs out and opens Sign in with their email
  // filled in), and Add account.
  var ROLE_LABELS = { SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', VENDOR: 'Vendor' };
  var ACCOUNTS_KEY = 'jd_admin_accounts';
  function accountTitle() {
    return _staffName || (window._currentUserRole === 'VENDOR' ? displayName() : ROLE_LABELS[window._currentUserRole] || 'Viewer');
  }
  function savedAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]').filter(function (a) { return a && a.email; }); } catch (e) { return []; }
  }
  function rememberAccount() {
    var email = window._currentUser && window._currentUser.email;
    if (!email) return;
    var me = { email: email, name: accountTitle(), initials: initials(displayName()) };
    var list = [me].concat(savedAccounts().filter(function (a) { return a.email !== email; })).slice(0, 5);
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function closeDashOverlay() {
    var el = safeEl('dash-overlay');
    if (el) el.remove();
    document.removeEventListener('keydown', dashOverlayEsc);
  }
  function dashOverlayEsc(e) { if (e.key === 'Escape') closeDashOverlay(); }
  window._closeDashOverlay = closeDashOverlay;
  function openDashOverlay(kind, html) {
    closeDashOverlay();
    if (window._closePanel) window._closePanel();
    var wrap = document.createElement('div');
    wrap.id = 'dash-overlay';
    wrap.className = 'dash-overlay dash-overlay-' + kind;
    wrap.innerHTML = html;
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeDashOverlay(); });
    document.body.appendChild(wrap);
    document.addEventListener('keydown', dashOverlayEsc);
    return wrap;
  }

  window._openAccountPanel = function () {
    rememberAccount();
    var email = (window._currentUser && window._currentUser.email) || '';
    var others = savedAccounts().filter(function (a) { return a.email !== email; });
    var row = function (a, current) {
      return '<div class="acct-row' + (current ? ' current' : '') + '"' + (current ? '' : ' role="button" tabindex="0" onclick="window._switchAccount(\'' + esc(a.email) + '\')"') + '>' +
        '<span class="acct-avatar">' + esc(a.initials) + '</span>' +
        '<span class="acct-text"><span class="acct-name">' + esc(a.name) + '</span><span class="acct-email">' + esc(a.email) + '</span></span>' +
        (current ? '<button type="button" class="acct-more" aria-label="Account options" onclick="window._toggleAccountMenu(event)"><i class="ph ph-dots-three"></i></button>' +
          '<div class="acct-menu" id="acct-menu">' +
            '<button type="button" onclick="window._openManageAccount()">Manage account</button>' +
            '<button type="button" onclick="window._closeDashOverlay();handleLogout()">Log out</button>' +
          '</div>' : '') +
      '</div>';
    };
    openDashOverlay('account', '<div class="acct-card">' +
      row({ email: email, name: accountTitle(), initials: initials(displayName()) }, true) +
      others.map(function (a) { return row(a, false); }).join('') +
      '<button type="button" class="acct-row acct-add" onclick="window._switchAccount(\'\')"><span class="acct-add-icon"><i class="ph ph-plus-circle"></i></span><span class="acct-name">Add account</span></button>' +
    '</div>');
  };

  window._toggleAccountMenu = function (e) {
    if (e) e.stopPropagation();
    var menu = safeEl('acct-menu');
    if (menu) menu.classList.toggle('open');
  };

  // Switching needs that account's password: sign out, then Sign in
  // opens with the email filled in (empty for Add account).
  window._switchAccount = function (email) {
    closeDashOverlay();
    window._pendingLoginEmail = email || '';
    handleLogout();
    var tries = 0;
    var fill = setInterval(function () {
      var input = safeEl('login-email');
      var screen = safeEl('login-screen');
      if (input && screen && getComputedStyle(screen).display !== 'none') {
        clearInterval(fill);
        input.value = window._pendingLoginEmail;
        var next = window._pendingLoginEmail ? safeEl('login-password') : input;
        if (next) next.focus();
      } else if (++tries > 40) clearInterval(fill);
    }, 100);
  };

  // Manage account: who is signed in, a password reset link, and (for
  // the Super Admin) the team.
  window._openManageAccount = function () {
    var email = (window._currentUser && window._currentUser.email) || '';
    var role = ROLE_LABELS[window._currentUserRole] || 'Viewer';
    openDashOverlay('sheet', '<div class="dash-full-sheet">' +
      '<div class="dash-full-head"><button type="button" class="dash-full-close" aria-label="Close" onclick="window._closeDashOverlay()"><i class="ph ph-x"></i></button><span class="dash-full-title">Account</span><span class="dash-full-action"></span></div>' +
      '<div class="dash-full-body">' +
        '<div class="dash-account">' +
          '<div class="dash-account-avatar">' + esc(initials(displayName())) + '</div>' +
          '<div class="dash-account-name">' + esc(accountTitle()) + '</div>' +
          (accountTitle() !== role ? '<div class="dash-account-role">' + esc(role) + '</div>' : '') +
          '<div class="dash-account-email">' + esc(email) + '</div>' +
        '</div>' +
        '<button type="button" class="dash-row dash-row-btn" onclick="window._sendOwnPasswordReset()"><i class="ph ph-key dash-row-icon"></i><span class="dash-row-text">Change password<span class="dash-row-sub">We’ll email you a link to set a new password</span></span><i class="ph ph-caret-right dash-row-caret"></i></button>' +
        (window._currentUserRole === 'SUPER_ADMIN' ? '<button type="button" class="dash-row dash-row-btn" onclick="window._closeDashOverlay();window.switchTab(\'admins\')"><i class="ph ph-users-three dash-row-icon"></i><span class="dash-row-text">Manage team<span class="dash-row-sub">Admins and their names, roles and access</span></span><i class="ph ph-caret-right dash-row-caret"></i></button>' : '') +
        (window._currentUserRole === 'VENDOR' ? '<button type="button" class="dash-row dash-row-btn" onclick="window._closeDashOverlay();window.switchTab(\'vendors\')"><i class="ph ph-storefront dash-row-icon"></i><span class="dash-row-text">Brand details<span class="dash-row-sub">Your logo, hero image and brand information</span></span><i class="ph ph-caret-right dash-row-caret"></i></button>' : '') +
      '</div>' +
    '</div>');
  };
  window._sendOwnPasswordReset = function () {
    var email = window._currentUser && window._currentUser.email;
    if (!email) return;
    firebase.auth().sendPasswordResetEmail(email).then(function () {
      showToast('A password reset link has been sent to ' + email + '.', 'success');
    }).catch(function () {
      showToast('We couldn’t send the email. Please try again.', 'error');
    });
  };

  function timeAgo(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    var d = Math.floor(s / 86400);
    return d === 1 ? 'Yesterday' : d + ' days ago';
  }
  function notesSeenAt() { try { return Number(localStorage.getItem(NOTES_SEEN_KEY)) || 0; } catch (e) { return 0; } }
  // Clear all hides everything up to now on this device; newer ones
  // still come in.
  function visibleNotes() {
    var cleared = 0;
    try { cleared = Number(localStorage.getItem(NOTES_CLEARED_KEY)) || 0; } catch (e) {}
    return ((_homeData && _homeData.notifications) || []).filter(function (n) { return n.at > cleared; });
  }
  window._clearNotifications = function () {
    try { localStorage.setItem(NOTES_CLEARED_KEY, String(Date.now())); } catch (e) {}
    window._openNotifications();
  };
  function paintBellDot() {
    var dot = safeEl('nav-bell-dot');
    var notes = visibleNotes();
    if (dot) dot.style.display = notes.some(function (n) { return n.at > notesSeenAt(); }) ? 'block' : 'none';
  }

  // Notifications: a full screen sheet with a curved top, like the
  // Shopify app's alerts.
  window._openNotifications = function () {
    var notes = visibleNotes();
    var seen = notesSeenAt();
    try { localStorage.setItem(NOTES_SEEN_KEY, String(Date.now())); } catch (e) {}
    paintBellDot();
    openDashOverlay('sheet', '<div class="dash-full-sheet">' +
      '<div class="dash-full-head"><button type="button" class="dash-full-close" aria-label="Close" onclick="window._closeDashOverlay()"><i class="ph ph-x"></i></button>' +
        '<span class="dash-full-title">Notifications</span>' +
        '<span class="dash-full-action">' + (notes.length ? '<button type="button" class="dash-notes-clear" onclick="window._clearNotifications()">Clear all</button>' : '') + '</span></div>' +
      '<div class="dash-full-body">' +
      (notes.length ? notes.map(function (n) {
        return '<button type="button" class="dash-row dash-row-btn' + (n.at > seen ? ' unseen' : '') + '" onclick="window._closeDashOverlay();window.switchTab(\'' + esc(n.tab) + '\')">' +
          '<i class="ph ' + (NOTE_ICONS[n.type] || 'ph-bell') + ' dash-row-icon"></i>' +
          '<span class="dash-row-text">' + esc(n.text) + '<span class="dash-row-sub">' + timeAgo(n.at) + '</span></span></button>';
      }).join('') : '<div class="dash-notes-empty"><span class="dash-notes-empty-icon"><i class="ph ph-bell"></i></span>' +
          '<div class="dash-all-done-title">Your notifications will show here</div>' +
          '<div class="dash-all-done-sub">New orders, messages, reviews and requests from the last 14 days appear here.</div></div>') +
      '</div>' +
    '</div>');
  };

  /* ═══════════════════════════════════════════════════════════
     ANALYTICS — placeholder destination for Home's "View report"
     button. No detailed reporting (top pages, traffic sources) exists
     yet, so this shows an honest "not built yet" state.
  ═══════════════════════════════════════════════════════════ */
  window._renderAnalyticsTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="empty-state">' +
      '<div class="empty-state-icon"><i class="ph-light ph-chart-bar"></i></div>' +
      '<div class="empty-state-text">Detailed analytics are not set up yet</div>' +
      '<div style="font-size:var(--font-scale-sm);color:var(--muted2);max-width:380px;">Home shows live visitors, sessions, sales, orders and conversion for the range you choose. Detailed reports (top pages, traffic sources) will appear here once they are built.</div>' +
      '<button type="button" class="btn" style="margin-top:var(--space-4);" onclick="window.switchTab(\'dashboard\')"><i class="ph ph-arrow-left"></i> Back to Home</button>' +
    '</div>';
  };

  /* ─────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────── */
  function setStat(id, value) {
    var el = safeEl(id);
    if (el) el.textContent = String(value);
  }

})();
