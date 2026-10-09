(function () {
  'use strict';

  var _isAdminPage = !!(
    document.getElementById('admin-panel') &&
    document.getElementById('login-screen')
  );

  if (!_isAdminPage) { return; }

  function logError(context, err) {
    var msg = err && (err.message || String(err));
    console.error('[JANEDORE ADMIN][' + context + ']', msg);
  }

  var firebaseConfig = {
    apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI",
    authDomain: "janedore-9f035.firebaseapp.com",
    projectId: "janedore-9f035",
    storageBucket: "janedore-9f035.firebasestorage.app",
    messagingSenderId: "571299748651",
    appId: "1:571299748651:web:01463a772d47b39cc4036e",
    measurementId: "G-Y9NMT0ZGKZ",
    databaseURL: "https://janedore-9f035-default-rtdb.firebaseio.com"
  };

  if (typeof firebase === 'undefined') {
    logError('INIT', new Error('Firebase SDK not loaded'));
    alert('Firebase SDK not loaded. Please check your internet connection and reload.');
    return;
  }

  if (!firebase.apps.length) {
    try { firebase.initializeApp(firebaseConfig); }
    catch (e) { logError('INIT', e); return; }
  }

  var db   = firebase.firestore();
  var rtdb = firebase.database();
  var auth = firebase.auth();

  window._adminDB   = db;
  window._adminRTDB = rtdb;
  window._adminAuth = auth;

  var productsRef    = db.collection('products');
  var reviewsRef     = db.collection('reviews');
  var newsletterRef  = db.collection('newsletter');
  var ordersRef      = db.collection('orders');
  var customersRef   = db.collection('customers');
  // "vendors" is the canonical collection — it's where the real vendor
  // records actually live. A prior pass mistakenly repointed this at
  // "brands" (which had nothing in it), thinking "vendors" was dead;
  // reverted. admin-vendors.js's full CRUD (create/edit/delete/seed) and
  // the storefront's vendor page (collection.js) both read/write "vendors".
  var vendorsRef     = db.collection('vendors');
  var adminsRef      = db.collection('admins');

  window._productsRef   = productsRef;
  window._reviewsRef    = reviewsRef;
  window._newsletterRef = newsletterRef;
  window._ordersRef     = ordersRef;
  window._customersRef  = customersRef;
  window._vendorsRef    = vendorsRef;
  window._adminsRef     = adminsRef;

  window._currentTab       = 'dashboard';
  window._allProducts      = [];
  window._currentUser      = null;
  window._currentUserRole  = null;
  window._currentVendorId  = null;
  window._roleResolved     = false;

  window._totalUnreadMessages = 0;

  var modalState = {
    isOpen: false, type: null,
    overlayElement: null, contentElement: null, escapeHandler: null
  };
  window._modalState = modalState;

  var CHAT_ROOT = 'live_chat';
  window._CHAT_ROOT = CHAT_ROOT;

  // Fulfillment states only — payment events ('paid'/'refunded') live on
  // paymentStatus, which only the verified PayFast ITN (or an explicit
  // refund action) is allowed to set. See admin-orders.js's TIMELINE_STEPS
  // and _quickRefund.
  window._ORDER_STATUSES  = ['pending','processing','packed','shipped','delivered','cancelled'];
  window._QUICK_REPLIES   = [
    'Hi! How can I help you today?',
    'Your order is being processed.',
    'Your order has been shipped!',
    'We will get back to you shortly.',
    'Thank you for your patience.',
    'Could you share your order number?'
  ];

  var ALLOWED_ROLES = { SUPER_ADMIN: true, ADMIN: true, VENDOR: true, VIEWER: true };

  // ─── UTILITY FUNCTIONS ───────────────────────────────────────

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/`/g,'&#096;');
  }
  window._esc = esc;

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var t = url.trim();
    if (/^https:\/\//i.test(t) || /^data:image\//i.test(t)) return t;
    return '';
  }
  window._safeUrl = safeUrl;

  function safeEl(id) { return document.getElementById(id) || null; }
  window._safeEl = safeEl;

  function fmt(n) { return 'R' + Number(n||0).toLocaleString('en-ZA'); }
  window._fmt = fmt;

  function fmtDate(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', {day:'2-digit',month:'short',year:'numeric'});
  }
  window._fmtDate = fmtDate;

  function fmtDateShort(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', {day:'2-digit',month:'short'});
  }
  window._fmtDateShort = fmtDateShort;

  function fmtTime(ts) {
    if (!ts) return '';
    // Firestore Timestamp objects (createdAt etc.) need .toDate() first —
    // handing one straight to `new Date(...)` doesn't parse it and
    // silently produces "Invalid Date", same fix fmtDate()/fmtDateShort()
    // above already have.
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }
  window._fmtTime = fmtTime;

  function avatarClass(str) {
    var idx = 0;
    if (str) for (var i=0;i<str.length;i++) idx = (idx + str.charCodeAt(i)) % 8;
    return 'ca-' + idx;
  }
  window._avatarClass = avatarClass;

  function avatarInitials(str) {
    if (!str) return '?';
    return str.replace(/[^a-zA-Z0-9]/g,'').substring(0,2).toUpperCase() || '?';
  }
  window._avatarInitials = avatarInitials;

  function showToast(msg, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className  = 'toast toast-' + type;
    toast.textContent = msg;
    var tc = safeEl('toast-container');
    if (tc) tc.appendChild(toast);
    setTimeout(function(){ if (toast && toast.parentNode) toast.parentNode.removeChild(toast); }, 3200);
  }
  window._showToast = showToast;

  function safeSetDisplay(id, display) { var el = safeEl(id); if (el) el.style.display = display; }
  window._safeSetDisplay = safeSetDisplay;

  function statusBadge(status) {
    status = (status || 'pending').toLowerCase();
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>';
  }
  window._statusBadge = statusBadge;

  // ─── MODAL / PANEL ───────────────────────────────────────────

  function createOverlay(type) {
    var overlay = document.createElement('div');
    overlay.className = type === 'modal' ? 'modal-overlay' : 'slide-panel-overlay';
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { type === 'modal' ? closeModal() : closePanel(); }
    });
    return overlay;
  }

  function mountModal(htmlContent) {
    cleanupModalState();
    var container = safeEl('modal-container');
    if (!container) return;
    var overlay = createOverlay('modal');
    var wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    var el = wrapper.firstElementChild;
    if (el) el.addEventListener('click', function(e){ e.stopPropagation(); });
    overlay.appendChild(el);
    container.innerHTML = '';
    container.appendChild(overlay);
    modalState.isOpen = true; modalState.type = 'modal';
    modalState.overlayElement = overlay; modalState.contentElement = el;
    setupEscapeHandler();
  }
  window._mountModal = mountModal;

  function mountPanel(htmlContent) {
    cleanupModalState();
    var container = safeEl('panel-container');
    if (!container) return;
    var overlay = createOverlay('panel');
    var wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    var el = wrapper.firstElementChild;
    if (el) el.addEventListener('click', function(e){ e.stopPropagation(); });
    overlay.appendChild(el);
    container.innerHTML = '';
    container.appendChild(overlay);
    modalState.isOpen = true; modalState.type = 'panel';
    modalState.overlayElement = overlay; modalState.contentElement = el;
  }
  window._mountPanel = mountPanel;

  function setupEscapeHandler() {
    if (modalState.escapeHandler) document.removeEventListener('keydown', modalState.escapeHandler);
    modalState.escapeHandler = function(e) {
      if (e.key === 'Escape') { modalState.type === 'panel' ? closePanel() : closeModal(); }
    };
    document.addEventListener('keydown', modalState.escapeHandler);
  }

  function cleanupModalState() {
    if (modalState.escapeHandler) { document.removeEventListener('keydown', modalState.escapeHandler); modalState.escapeHandler = null; }
    var mc = safeEl('modal-container'); var pc = safeEl('panel-container');
    if (mc) mc.innerHTML = ''; if (pc) pc.innerHTML = '';
    modalState.isOpen = false; modalState.type = null;
    modalState.overlayElement = null; modalState.contentElement = null;
  }

  function closeModal() { cleanupModalState(); }
  window._closeModal = closeModal;

  function closePanel() { cleanupModalState(); }
  window._closePanel = closePanel;

  // ─── AUTH LOADING OVERLAY ────────────────────────────────────

  function showAuthLoading() {
    var loader = safeEl('auth-loading');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'auth-loading';
      loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.97);display:flex;align-items:center;justify-content:center;z-index:9999;';
      loader.innerHTML = '<div style="text-align:center;font-family:Inter,sans-serif;"><div style="font-size:14px;color:#666;">Verifying access...</div></div>';
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
  }

  function hideAuthLoading() { var loader = safeEl('auth-loading'); if (loader) loader.style.display = 'none'; }

  // ─── INITIAL UI STATE ────────────────────────────────────────

  function initUIState() { safeSetDisplay('login-screen', 'flex'); safeSetDisplay('admin-panel', 'none'); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initUIState); } else { initUIState(); }

  // ─── AUTH STATE ──────────────────────────────────────────────

  auth.onAuthStateChanged(function(user) {
    if (user) {
      console.log('[JANEDORE AUTH] onAuthStateChanged: user present —', user.email, '| uid:', user.uid);
      window._currentUser = user;
      safeSetDisplay('login-screen', 'none');
      safeSetDisplay('admin-panel', 'none');
      showAuthLoading();

      [safeEl('admin-email'), safeEl('admin-email-more')].forEach(function(el) { if (el) el.textContent = user.email; });

      loadUserRole(user).then(function() {
        window._roleResolved = true;
        hideAuthLoading();
        safeSetDisplay('admin-panel', 'block');
        window._applyRoleUI();
        loadProducts();
        startChatMonitoring();
      }).catch(function(err) {
        logError('AUTH/ROLE', err);
        hideAuthLoading();
        window._currentUserRole = 'VIEWER';
        window._roleResolved = true;
        safeSetDisplay('admin-panel', 'block');
        showToast('Could not verify your role — limited access. Reload to retry.', 'error');
        window._applyRoleUI();
        loadProducts();
      });
    } else {
      console.warn('[JANEDORE AUTH] onAuthStateChanged: null — no session.');
      window._currentUser     = null;
      window._currentUserRole = null;
      window._roleResolved    = false;
      window._currentVendorId = null;
      hideAuthLoading();
      safeSetDisplay('login-screen', 'flex');
      safeSetDisplay('admin-panel', 'none');
      stopChatMonitoring();
    }
  });

  auth.onIdTokenChanged(function(user) {
    if (user) {
      console.log('[JANEDORE AUTH] onIdTokenChanged: token present or refreshed —', user.email);
    } else {
      console.warn('[JANEDORE AUTH] onIdTokenChanged: null — token gone.');
    }
  });

  // ─── ROLE LOADING ────────────────────────────────────────────

  function loadUserRole(user) {
    return adminsRef.doc(user.uid).get().then(function(doc) {
      if (doc.exists) {
        var data    = doc.data();
        var rawRole = (data.role || 'VIEWER').toUpperCase();
        window._currentUserRole = ALLOWED_ROLES[rawRole] ? rawRole : 'VIEWER';
        window._currentVendorId = (window._currentUserRole === 'VENDOR')
          ? (data.vendorId || null)
          : null;
        console.log('[JANEDORE AUTH] Role resolved:', window._currentUserRole);

        // Firestore's security rules check request.auth.token.vendorId
        // (a custom claim, stamped on by /api/admin/sync-staff-claims)
        // for a vendor's own list queries, like "every order I'm part
        // of" — not the admins/{uid} doc itself, which a list request
        // can't look up. Forcing a token refresh here means a vendor
        // whose claims were just synced by a Super Admin gets them on
        // their very next page load, without needing to fully sign out
        // first — cheap, and harmless if the claims were already current.
        if (window._currentUserRole === 'VENDOR' && user.getIdToken) {
          user.getIdToken(true).catch(function (e) { console.warn('[TOKEN_REFRESH]', e); });
        }
      } else {
        window._currentUserRole = 'VIEWER';
        window._currentVendorId = null;
        showToast('Your account is not authorised. Contact a Super Admin.', 'error');
      }
    }).catch(function(err) {
      logError('ROLE_FETCH', err);
      window._currentUserRole = 'VIEWER';
      window._currentVendorId = null;
      showToast('Could not verify your role. Limited access granted.', 'error');
    });
  }

  // ─── TAB NAVIGATION ──────────────────────────────────────────

  var TAB_TITLES = {
    dashboard: 'Home', products: 'Products', orders: 'Orders',
    messages: 'Inbox', reviews: 'Reviews', newsletter: 'Newsletter',
    vendors: 'Vendors', customers: 'Customers', settings: 'Settings',
    admins: 'Admins', pages: 'Pages', discounts: 'Discounts',
    homepage: 'Homepage', onlineStore: 'Online Store',
    analytics: 'Analytics', devtools: 'Developer Tools'
  };

  // Exactly one bottom-nav element reads as "selected" at a time —
  // one of the three pill tabs, the More button (standing in for
  // every tab only reachable through the More sheet), or the search
  // button. Without this, tapping More/Search left whichever pill tab
  // was active still showing its highlight, making it look like
  // nothing happened ("stuck on" the old icon).
  function setBottomNavActive(which) {
    document.querySelectorAll('.bnav-btn[data-tab]').forEach(function(b) {
      var isActive = b.dataset.tab === which;
      b.classList.toggle('active', isActive);
      // Shopify-style selected state: the tab's own icon swaps from
      // bold outline (ph-bold) to solid (ph-fill) instead of just
      // recoloring.
      var icon = b.querySelector('i');
      if (icon) {
        icon.classList.toggle('ph-fill', isActive);
        icon.classList.toggle('ph-bold', !isActive);
      }
    });
    var moreBtn = document.querySelector('.bottom-nav-pill .bnav-btn:not([data-tab])');
    if (moreBtn) moreBtn.classList.toggle('active', which === 'more');
    var searchBtn = document.querySelector('.bnav-search-btn');
    if (searchBtn) searchBtn.classList.toggle('active', which === 'search');
  }
  window._setBottomNavActive = setBottomNavActive;

  function bnavKeyForTab(tab) {
    return (tab === 'dashboard' || tab === 'orders' || tab === 'products') ? tab : 'more';
  }

  // Closing More/Search without picking anything (tapping the
  // backdrop, the X button) doesn't change window._currentTab, so the
  // nav highlight should fall back to whatever that still is, not
  // just go blank.
  window._revertBottomNavActive = function() {
    setBottomNavActive(bnavKeyForTab(window._currentTab));
  };

  window.switchTab = function(tab) {
    // Tapping a nav button while the search overlay or the More sheet
    // is open used to switch the tab underneath without dismissing
    // either — they're both full-screen, so the switch was invisible
    // and it looked "stuck" on whichever was open. Close both first.
    if (window._closeAdminSearch) window._closeAdminSearch();
    if (typeof closeMoreMenu === 'function') closeMoreMenu();

    var TAB_MODULE_MAP = {
      dashboard: 'dashboard', products: 'products', orders: 'orders',
      messages: 'inbox', reviews: 'reviews', newsletter: 'newsletter',
      vendors: 'vendors', customers: 'customers', settings: 'settings',
      admins: 'admins', pages: 'pages', discounts: 'discounts',
      onlineStore: 'settings', homepage: 'homepage',
      analytics: 'analytics', devtools: 'devtools'
    };

    var module = TAB_MODULE_MAP[tab];
    if (module && window._can && !window._can(module, 'read')) {
      showToast('You do not have access to this section.', 'error');
      return;
    }

    window._currentTab = tab;
    var titleEl = safeEl('top-nav-title');
    if (titleEl) titleEl.textContent = TAB_TITLES[tab] || 'Dashboard';
    // Cleared on every switch — whichever render*Tab() runs next fills
    // it back in if that section has its own top-bar actions (Orders
    // and Products do); otherwise it just stays empty.
    var topActionsEl = safeEl('top-nav-actions');
    if (topActionsEl) topActionsEl.innerHTML = '';
    if (tab !== 'messages') {
      window._activeChatSession = null;
      if (window._detachActiveChatListeners) window._detachActiveChatListeners();
    }
    document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    setBottomNavActive(bnavKeyForTab(tab));
    cleanupModalState();
    renderCurrentTab();
  };

  function renderCurrentTab() {
    var mc = safeEl('main-content');
    if (!mc) return;
    destroyCharts();
    switch (window._currentTab) {
      case 'dashboard':   if (window._renderDashboardTab)   window._renderDashboardTab();   break;
      case 'products':    if (window._renderProductsTab)    window._renderProductsTab();    break;
      case 'messages':    if (window._renderMessagesTab)    window._renderMessagesTab();    break;
      case 'reviews':     if (window._renderReviewsTab)     window._renderReviewsTab();     break;
      case 'newsletter':  if (window._renderNewsletterTab)  window._renderNewsletterTab();  break;
      case 'orders':      if (window._renderOrdersTab)      window._renderOrdersTab();      break;
      case 'customers':   if (window._renderCustomersTab)   window._renderCustomersTab();   break;
      case 'vendors':     if (window._renderVendorsTab)     window._renderVendorsTab();     break;
      case 'settings':    if (window._renderSettingsTab)    window._renderSettingsTab();    break;
      case 'onlineStore': if (window._renderOnlineStoreTab) window._renderOnlineStoreTab(); break;
      case 'admins':      if (window._renderAdminsTab)      window._renderAdminsTab();      break;
      case 'pages':       if (window._renderPagesTab)       window._renderPagesTab();       break;
      case 'homepage':    if (window._renderHomepageTab)    window._renderHomepageTab();    break;
      case 'discounts':   if (window._renderDiscountsTab)   window._renderDiscountsTab();   break;
      case 'analytics':   if (window._renderAnalyticsTab)   window._renderAnalyticsTab();   break;
      case 'devtools':    if (window._renderDevtoolsTab)    window._renderDevtoolsTab();    break;
    }
  }

  function destroyCharts() {
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }
    if (window._revenueChart)   { window._revenueChart.destroy();   window._revenueChart   = null; }
  }
  window._destroyCharts = destroyCharts;

  // ─── PRODUCT LOADING ─────────────────────────────────────────

  function loadProducts() {
    if (!window._currentUser || !window._roleResolved) return;

    window._scopedQuery(productsRef).get().then(function(snapshot) {
      window._allProducts = snapshot.docs.map(function(d) {
        var product = Object.assign({ id: d.id }, d.data());
        if (product.variants && Array.isArray(product.variants)) {
          product.variants = product.variants.map(function(variant) {
            if (!variant.images) {
              variant.images = { model: [], ghost: [], detail: [] };
            } else {
              variant.images.model  = Array.isArray(variant.images.model)  ? variant.images.model  : [];
              variant.images.ghost  = Array.isArray(variant.images.ghost)  ? variant.images.ghost  : [];
              variant.images.detail = Array.isArray(variant.images.detail) ? variant.images.detail : [];
            }
            return variant;
          });
        }
        return product;
      });

      var el = safeEl('product-count');
      if (el) el.textContent = window._allProducts.length + ' products';
      var dot = safeEl('status-dot');
      if (dot) dot.className = 'status-dot online';
      renderCurrentTab();
    }).catch(function(e) {
      logError('LOAD_PRODUCTS', e);
      var dot = safeEl('status-dot');
      if (dot) dot.className = 'status-dot offline';
      showToast('Firebase: ' + e.message, 'error');
    });
  }
  window._loadProducts = loadProducts;

  // ─── ADMIN SEARCH ────────────────────────────────────────────
  // Opened from the bottom nav's search button. Products search is
  // instant (window._allProducts is already loaded for every role on
  // login). Orders/Customers need their own fetch, scoped the same
  // way the Orders tab itself is (vendor -> /api/vendor/orders, staff
  // -> a direct query) since this runs before either tab may ever
  // have been visited this session — cached after the first search so
  // repeat keystrokes don't re-fetch.

  var _adminSearchOrdersPromise = null;
  var _adminSearchQuery = '';

  function fetchAdminSearchOrders() {
    if (_adminSearchOrdersPromise) return _adminSearchOrdersPromise;
    var isVendor = window._currentUserRole === 'VENDOR';
    var p = isVendor
      ? window._currentUser.getIdToken().then(function(token) {
          return fetch('/api/vendor/orders', { headers: { Authorization: 'Bearer ' + token } });
        }).then(function(res) { return res.json(); }).then(function(body) { return body.orders || []; })
      : ordersRef.orderBy('createdAt', 'desc').limit(300).get().then(function(snap) {
          return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        });
    _adminSearchOrdersPromise = p.catch(function(e) { _adminSearchOrdersPromise = null; throw e; });
    return _adminSearchOrdersPromise;
  }

  // Same shape admin-customers.js derives from orders, so a result
  // clicked here can hand straight off to window._openCustomerDetail.
  // Only written to the shared globals when nothing has loaded them
  // already — the real Customers tab's own 500-order fetch should win
  // if it got there first.
  function getCustomersForSearch() {
    if (window._customersData) return Promise.resolve(window._customersData);
    return fetchAdminSearchOrders().then(function(orders) {
      var map = {};
      orders.forEach(function(o) {
        var email = (o.customerEmail || '').toLowerCase().trim();
        if (!email) return;
        if (!map[email]) {
          map[email] = {
            name: o.customerName || 'Guest', email: email, phone: o.customerPhone || '',
            shippingAddress: o.shippingAddress || {}, orders: 0, spent: 0,
            lastOrder: null, firstOrder: null, orderIds: [], status: 'active'
          };
        }
        var c = map[email];
        c.orders++; c.spent += (o.total || o.subtotal || 0); c.orderIds.push(o.id);
        if (o.customerName && o.customerName !== 'Guest') c.name = o.customerName;
        if (o.customerPhone) c.phone = o.customerPhone;
        if (o.shippingAddress && o.shippingAddress.address) c.shippingAddress = o.shippingAddress;
        var d = o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : null;
        if (d) {
          if (!c.lastOrder || d > c.lastOrder) c.lastOrder = d;
          if (!c.firstOrder || d < c.firstOrder) c.firstOrder = d;
        }
      });
      var list = Object.values(map).sort(function(a, b) { return b.spent - a.spent; });
      if (!window._customersData) { window._customersData = list; window._allOrdersData = orders; }
      return list;
    });
  }

  function searchResultRow(iconClass, title, sub, onclick) {
    return '<div class="search-result-row" onclick="' + onclick + '">' +
      '<div class="search-result-icon"><i class="' + iconClass + '"></i></div>' +
      '<div style="flex:1;min-width:0;"><div class="pi-name">' + esc(title) + '</div><div class="pi-meta">' + esc(sub) + '</div></div>' +
    '</div>';
  }

  function renderAdminSearchResults(query) {
    var body = safeEl('admin-search-body');
    if (!body) return;
    query = (query || '').trim().toLowerCase();
    _adminSearchQuery = query;
    var scope = window._adminSearchScope || 'all';

    function setCount(id, n) {
      var el = safeEl(id);
      if (el) el.textContent = n > 0 ? String(n) : '';
    }

    // "No recent searches" is only the All tab's empty-field landing
    // state (matches the reference). Switching to a single-type tab
    // with nothing typed should browse that type, not show nothing —
    // so only bail out here when both the query AND the scope are at
    // their defaults.
    if (!query && scope === 'all') {
      ['all', 'orders', 'products', 'draft', 'archived', 'customers'].forEach(function(s) { setCount('search-count-' + s, 0); });
      body.innerHTML = '<div class="orders-empty-state"><i class="ph ph-magnifying-glass orders-empty-icon"></i><div class="orders-empty-title">No recent searches</div></div>';
      return;
    }

    function matches(text) {
      return !query || text.toLowerCase().indexOf(query) !== -1;
    }

    body.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading...</div></div>';

    // Every tab's count pill needs all three datasets regardless of
    // which one is currently open, so orders/customers are always
    // fetched here (both cached after the first call).
    Promise.all([
      fetchAdminSearchOrders(),
      getCustomersForSearch()
    ]).then(function(results) {
      if (_adminSearchQuery !== query) return; // a newer keystroke already superseded this
      var orders = results[0], customers = results[1];

      var productMatches = (window._allProducts || []).filter(function(p) {
        return matches((p.name || '') + ' ' + (p.brand || '') + ' ' + (p.sku || ''));
      });
      var orderMatches = orders.filter(function(o) {
        return matches((o.orderNumber || o.id || '') + ' ' + (o.customerName || '') + ' ' + (o.customerEmail || ''));
      });
      var customerMatches = customers.filter(function(c) {
        return matches(c.name + ' ' + c.email);
      });

      setCount('search-count-products', productMatches.length);
      setCount('search-count-orders', orderMatches.length);
      setCount('search-count-customers', customerMatches.length);
      setCount('search-count-all', productMatches.length + orderMatches.length + customerMatches.length);

      var html = '';

      // Products/Orders reuse the exact same row markup (badges
      // included) their own tabs render, via window._renderProductRowHTML
      // / window._renderOrderRowHTML, so a match here looks identical to
      // finding it in the Products/Orders tab itself — not a simplified
      // search-only version. Those rows render with zero horizontal
      // padding (they rely on #main-content's own padding in their native
      // list), so this wraps them in matching padding here instead.
      if ((scope === 'all' || scope === 'products') && productMatches.length) {
        html += '<div class="search-section-label">Products</div>' +
          '<div style="padding:0 var(--space-4);">' +
          productMatches.slice(0, 15).map(function(p) {
            return '<div onclick="window._closeAdminSearch()">' + window._renderProductRowHTML(p) + '</div>';
          }).join('') +
          '</div>';
      }

      if ((scope === 'all' || scope === 'orders') && orderMatches.length) {
        html += '<div class="search-section-label">Orders</div>' +
          '<div style="padding:0 var(--space-4);">' +
          orderMatches.slice(0, 15).map(function(o) {
            return '<div onclick="window._closeAdminSearch()">' + window._renderOrderRowHTML(o) + '</div>';
          }).join('') +
          '</div>';
      }

      if (scope === 'all' || scope === 'customers') {
        if (customerMatches.length) {
          html += '<div class="search-section-label">Customers</div>' + customerMatches.slice(0, 15).map(function(c) {
            return searchResultRow('ph-bold ph-user', c.name, c.email + ' · ' + c.orders + ' order' + (c.orders !== 1 ? 's' : ''),
              "window._closeAdminSearch();window._openCustomerDetail('" + esc(c.email) + "')");
          }).join('');
        }
      }

      body.innerHTML = html || '<div class="orders-empty-state"><i class="ph ph-magnifying-glass orders-empty-icon"></i><div class="orders-empty-title">No results found</div></div>';
    }).catch(function(e) {
      if (_adminSearchQuery !== query) return;
      body.innerHTML = '<p style="padding:16px;color:var(--danger);font-size:12px;">Error: ' + esc(e.message) + '</p>';
    });
  }

  window._openAdminSearch = function() {
    var ov = safeEl('admin-search-overlay');
    if (!ov) return;
    if (typeof closeMoreMenu === 'function') closeMoreMenu();
    ov.classList.add('open');
    setBottomNavActive('search');
    window._adminSearchScope = 'all';
    document.querySelectorAll('.admin-search-tab[data-scope]').forEach(function(t) {
      t.classList.toggle('active', t.dataset.scope === 'all');
    });
    var input = safeEl('admin-search-input');
    if (input) input.value = '';
    renderAdminSearchResults('');
    if (input) setTimeout(function() { input.focus(); }, 50);
  };

  window._closeAdminSearch = function() {
    var ov = safeEl('admin-search-overlay');
    if (ov) ov.classList.remove('open');
    window._revertBottomNavActive();
  };

  window._setAdminSearchScope = function(scope) {
    window._adminSearchScope = scope;
    document.querySelectorAll('.admin-search-tab[data-scope]').forEach(function(t) {
      t.classList.toggle('active', t.dataset.scope === scope);
    });
    var input = safeEl('admin-search-input');
    renderAdminSearchResults(input ? input.value : '');
  };

  window._runAdminSearch = function() {
    var input = safeEl('admin-search-input');
    renderAdminSearchResults(input ? input.value : '');
  };

  // ─── CHAT MONITORING ─────────────────────────────────────────

  var chatsMonitorRef      = null;
  var chatsMonitorCallback = null;
  var CHAT_MONITOR_LIMIT   = 100;

  function startChatMonitoring() {
    stopChatMonitoring();
    chatsMonitorRef = rtdb.ref(CHAT_ROOT).limitToLast(CHAT_MONITOR_LIMIT);
    chatsMonitorCallback = function(snapshot) {
      var unread  = 0;
      var vid     = window._currentVendorId;
      var isVendor = window._currentUserRole === 'VENDOR';

      snapshot.forEach(function(sessionSnap) {
        if (isVendor) {
          var sessionData = sessionSnap.val() || {};
          if (sessionData.vendorId && sessionData.vendorId !== vid) return;
        }
        var messages = sessionSnap.child('messages');
        if (messages.exists()) {
          messages.forEach(function(msgSnap) {
            var msg = msgSnap.val();
            if (msg && msg.sender === 'customer' && msg.read === false) unread++;
          });
        }
      });

      window._totalUnreadMessages = unread;
      updateUnreadBadge();
    };
    chatsMonitorRef.on('value', chatsMonitorCallback, function(err) { logError('CHAT_MONITOR', err); });
  }
  window._startChatMonitoring = startChatMonitoring;

  function stopChatMonitoring() {
    if (chatsMonitorRef && chatsMonitorCallback) {
      chatsMonitorRef.off('value', chatsMonitorCallback);
      chatsMonitorRef = null; chatsMonitorCallback = null;
    }
    if (window._detachActiveChatListeners) window._detachActiveChatListeners();
  }
  window._stopChatMonitoring = stopChatMonitoring;

  function updateUnreadBadge() {
    ['messages-unread-badge','bnav-msg-badge','more-msg-badge'].forEach(function(id) {
      var badge = safeEl(id);
      if (badge) {
        badge.textContent    = window._totalUnreadMessages;
        badge.style.display  = window._totalUnreadMessages > 0 ? 'inline-flex' : 'none';
      }
    });
  }

  // ─── LOGIN / LOGOUT ──────────────────────────────────────────

  window.handleLogin = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    var emailEl    = safeEl('login-email');
    var passwordEl = safeEl('login-password');
    var errorEl    = safeEl('login-error');
    if (!emailEl || !passwordEl) {
      logError('LOGIN', new Error('Login form elements not found'));
      alert('Login form error. Please reload the page.');
      return false;
    }
    var email    = emailEl.value.trim();
    var password = passwordEl.value;
    if (errorEl) errorEl.style.display = 'none';
    if (!email || !password) {
      if (errorEl) { errorEl.textContent = 'Please enter email and password.'; errorEl.style.display = 'block'; }
      return false;
    }
    var loginBtn = safeEl('login-btn');
    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Signing in...'; }
    auth.signInWithEmailAndPassword(email, password).catch(function(err) {
      logError('LOGIN', err);
      if (errorEl) {
        var msg = 'Invalid credentials. Please try again.';
        if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please wait and try again.';
        errorEl.textContent = msg; errorEl.style.display = 'block';
      }
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; }
    });
    return false;
  };

  window.handleLogout = function() { auth.signOut().catch(function(err){ logError('LOGOUT', err); }); };

  // ─── CLOUDINARY UPLOAD ───────────────────────────────────────

  window.uploadToCloudinary = function(inputElement, variantIndex) {
    var cloudName    = window.CLOUDINARY_CLOUD_NAME;
    var uploadPreset = window.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName)    { showToast('Cloudinary still loading, try again...', 'error'); return; }
    if (!uploadPreset) { showToast('Cloudinary upload preset not configured.', 'error'); return; }
    var widget = window.cloudinary.createUploadWidget(
      {
        cloudName: cloudName, uploadPreset: uploadPreset,
        sources: ['local','url','camera'], multiple: false, maxFiles: 1,
        clientAllowedFormats: ['png','jpg','jpeg','gif','webp','svg','bmp'],
        maxFileSize: 20000000
      },
      function(error, result) {
        if (error) { logError('CLOUDINARY_UPLOAD', error); showToast('Upload failed.', 'error'); return; }
        if (result && result.event === 'success') {
          var secureUrl = result.info.secure_url;
          if (inputElement) {
            inputElement.value = secureUrl;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            if (window._updateImagePreview) window._updateImagePreview(inputElement);
            if (variantIndex !== undefined && window._updateVariantPreview) window._updateVariantPreview(variantIndex);
          }
          showToast('Image uploaded!');
        }
      }
    );
    widget.open();
  };

  // ─── CLEANUP ─────────────────────────────────────────────────

  window.addEventListener('beforeunload', function() { stopChatMonitoring(); destroyCharts(); });

  // ─── PUBLIC API ALIASES ──────────────────────────────────────

  window.loadProducts        = loadProducts;
  window.openNewProductModal = window._openNewProductModal;
  window.openProductModal    = window._openProductModal;
  window.filterProducts      = window._filterProducts;
  window.addVariant          = window._addVariant;
  window.removeVariant       = window._removeVariant;
  window.addImageUrl         = window._addImageUrl;
  window.removeImageUrl      = window._removeImageUrl;
  window.updateImagePreview  = window._updateImagePreview;
  window.updateVariantPreview = window._updateVariantPreview;
  window.closeModal          = closeModal;
  window.closePanel          = closePanel;
  window.handleProductSubmit = window._handleProductSubmit;

})();
