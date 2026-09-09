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
  var vendorsRef     = db.collection('vendors');
  var adminsRef      = db.collection('admins');
  var discountsRef   = db.collection('discounts');
  var discountCodesRef = db.collection('discountCodes');

  window._productsRef   = productsRef;
  window._reviewsRef    = reviewsRef;
  window._newsletterRef = newsletterRef;
  window._ordersRef     = ordersRef;
  window._customersRef  = customersRef;
  window._vendorsRef    = vendorsRef;
  window._adminsRef     = adminsRef;
  window._discountsRef  = discountsRef;
  window._discountCodesRef = discountCodesRef;

  window._currentTab       = 'dashboard';
  window._allProducts      = [];
  window._allDiscounts     = [];
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

  window._ORDER_STATUSES  = ['pending','paid','processing','packed','shipped','delivered','cancelled','refunded'];
  window._QUICK_REPLIES   = [
    'Hi! How can I help you today?',
    'Your order is being processed.',
    'Your order has been shipped!',
    'We will get back to you shortly.',
    'Thank you for your patience.',
    'Could you share your order number?'
  ];

  var ALLOWED_ROLES = { SUPER_ADMIN: true, ADMIN: true, VENDOR: true, VIEWER: true };

  // ─── DISCOUNT TYPES (Shopify-style) ─────────────────────────
  window._DISCOUNT_TYPES = {
    PERCENTAGE: 'percentage',
    FIXED_AMOUNT: 'fixed_amount',
    FREE_SHIPPING: 'free_shipping',
    BUY_X_GET_Y: 'buy_x_get_y'
  };

  window._DISCOUNT_APPLIES_TO = {
    ALL_PRODUCTS: 'all_products',
    SPECIFIC_PRODUCTS: 'specific_products',
    SPECIFIC_COLLECTIONS: 'specific_collections'
  };

  window._DISCOUNT_LIMITS = {
    MAX_PERCENTAGE: 100,
    MIN_PERCENTAGE: 0,
    MAX_FIXED_AMOUNT: 1000000,
    MIN_FIXED_AMOUNT: 0,
    MAX_USAGE_LIMIT: 1000000,
    MAX_MINIMUM_PURCHASE: 1000000
  };

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
    var d = new Date(ts);
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

  // ─── DISCOUNT VALIDATION (Shopify-style limits) ──────────────
  function validateDiscountRate(type, value) {
    var limits = window._DISCOUNT_LIMITS;
    value = Number(value || 0);

    switch(type) {
      case window._DISCOUNT_TYPES.PERCENTAGE:
        if (value < limits.MIN_PERCENTAGE || value > limits.MAX_PERCENTAGE) {
          return { valid: false, message: 'Percentage discount must be between ' + limits.MIN_PERCENTAGE + '% and ' + limits.MAX_PERCENTAGE + '%' };
        }
        break;
      case window._DISCOUNT_TYPES.FIXED_AMOUNT:
        if (value < limits.MIN_FIXED_AMOUNT || value > limits.MAX_FIXED_AMOUNT) {
          return { valid: false, message: 'Fixed amount must be between R' + limits.MIN_FIXED_AMOUNT + ' and R' + limits.MAX_FIXED_AMOUNT.toLocaleString() };
        }
        break;
      default:
        return { valid: false, message: 'Invalid discount type' };
    }
    return { valid: true, value: value };
  }
  window._validateDiscountRate = validateDiscountRate;

  function validateDiscountUsageLimit(limit) {
    if (limit === null || limit === undefined || limit === '') return { valid: true, value: null };
    limit = Number(limit);
    if (limit < 0 || limit > window._DISCOUNT_LIMITS.MAX_USAGE_LIMIT) {
      return { valid: false, message: 'Usage limit must be between 0 and ' + window._DISCOUNT_LIMITS.MAX_USAGE_LIMIT.toLocaleString() };
    }
    return { valid: true, value: limit };
  }
  window._validateDiscountUsageLimit = validateDiscountUsageLimit;

  function validateMinimumPurchase(amount) {
    if (amount === null || amount === undefined || amount === '') return { valid: true, value: null };
    amount = Number(amount);
    if (amount < 0 || amount > window._DISCOUNT_LIMITS.MAX_MINIMUM_PURCHASE) {
      return { valid: false, message: 'Minimum purchase must be between R0 and R' + window._DISCOUNT_LIMITS.MAX_MINIMUM_PURCHASE.toLocaleString() };
    }
    return { valid: true, value: amount };
  }
  window._validateMinimumPurchase = validateMinimumPurchase;

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
      loader.innerHTML = '<div style="text-align:center;font-family:Manrope,sans-serif;"><div style="font-size:14px;color:#666;">Verifying access...</div></div>';
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

      var initials = (user.email || 'A').substring(0,1).toUpperCase();
      var iniEl = safeEl('admin-initials'); if (iniEl) iniEl.textContent = initials;
      [safeEl('admin-email'), safeEl('admin-email-more')].forEach(function(el) { if (el) el.textContent = user.email; });

      loadUserRole(user).then(function() {
        window._roleResolved = true;
        hideAuthLoading();
        safeSetDisplay('admin-panel', 'block');
        window._applyRoleUI();
        loadProducts();
        loadDiscounts();
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
        loadDiscounts();
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

  window.switchTab = function(tab) {
    var TAB_MODULE_MAP = {
      dashboard: 'dashboard', products: 'products', orders: 'orders',
      messages: 'inbox', reviews: 'reviews', newsletter: 'newsletter',
      vendors: 'vendors', customers: 'customers', settings: 'settings',
      admins: 'admins', discounts: 'discounts'
    };
    var module = TAB_MODULE_MAP[tab];
    if (module && !window._can(module, 'read')) {
      showToast('You do not have access to this section.', 'error');
      return;
    }

    window._currentTab = tab;
    if (tab !== 'messages') {
      window._activeChatSession = null;
      if (window._detachActiveChatListeners) window._detachActiveChatListeners();
    }
    document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.bnav-btn[data-tab]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.bnav-btn:not([data-tab])').forEach(function(b) {
      b.classList.remove('active');
    });
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
      case 'admins':      if (window._renderAdminsTab)      window._renderAdminsTab();      break;
      case 'discounts':   if (window._renderDiscountsTab)   window._renderDiscountsTab();   break;
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

  // ─── DISCOUNT LOADING ────────────────────────────────────────

  function loadDiscounts() {
    if (!window._currentUser || !window._roleResolved) return;

    discountsRef.get().then(function(snapshot) {
      window._allDiscounts = snapshot.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });

      var el = safeEl('discount-count');
      if (el) el.textContent = window._allDiscounts.length + ' discounts';
      renderCurrentTab();
    }).catch(function(e) {
      logError('LOAD_DISCOUNTS', e);
      showToast('Firebase: ' + e.message, 'error');
    });
  }
  window._loadDiscounts = loadDiscounts;

  // ─── DISCOUNT CREATION (Shopify-style) ───────────────────────

  window._openNewDiscountModal = function() {
    var html = '<div class="modal-content" style="max-width:600px;">' +
      '<div class="modal-header"><h3>Create Discount</h3>' +
      '<button class="icon-btn" onclick="window._closeModal()">×</button></div>' +
      '<div class="modal-body">' +
      '<form id="discount-form" onsubmit="window._handleDiscountSubmit(event)">' +
      '<div class="form-group">' +
      '<label>Discount Code</label>' +
      '<input type="text" id="discount-code" required placeholder="e.g. SUMMER20" style="text-transform:uppercase;">' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Discount Type</label>' +
      '<select id="discount-type" onchange="window._toggleDiscountTypeFields()">' +
      '<option value="percentage">Percentage</option>' +
      '<option value="fixed_amount">Fixed Amount</option>' +
      '<option value="free_shipping">Free Shipping</option>' +
      '<option value="buy_x_get_y">Buy X Get Y</option>' +
      '</select>' +
      '</div>' +
      '<div class="form-group" id="discount-value-group">' +
      '<label>Discount Value</label>' +
      '<input type="number" id="discount-value" min="0" max="100" step="0.01" required placeholder="Enter discount value">' +
      '<small id="discount-value-hint" style="color:#666;">Percentage discount (0-100%)</small>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Applies To</label>' +
      '<select id="discount-applies-to">' +
      '<option value="all_products">All Products</option>' +
      '<option value="specific_products">Specific Products</option>' +
      '<option value="specific_collections">Specific Collections</option>' +
      '</select>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Minimum Purchase Amount (R)</label>' +
      '<input type="number" id="discount-min-purchase" min="0" step="0.01" placeholder="No minimum">' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Usage Limit</label>' +
      '<input type="number" id="discount-usage-limit" min="0" step="1" placeholder="Unlimited">' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Start Date</label>' +
      '<input type="date" id="discount-start-date">' +
      '</div>' +
      '<div class="form-group">' +
      '<label>End Date</label>' +
      '<input type="date" id="discount-end-date">' +
      '</div>' +
      '<div class="form-actions">' +
      '<button type="button" onclick="window._closeModal()">Cancel</button>' +
      '<button type="submit">Create Discount</button>' +
      '</div>' +
      '</form>' +
      '</div></div>';
    mountModal(html);
  };

  window._toggleDiscountTypeFields = function() {
    var type = safeEl('discount-type').value;
    var valueGroup = safeEl('discount-value-group');
    var valueInput = safeEl('discount-value');
    var valueHint = safeEl('discount-value-hint');

    if (type === 'free_shipping') {
      valueGroup.style.display = 'none';
      valueInput.removeAttribute('required');
    } else if (type === 'buy_x_get_y') {
      valueGroup.style.display = 'block';
      valueInput.setAttribute('max', '100');
      valueInput.setAttribute('step', '1');
      valueHint.textContent = 'Number of items customer buys (X)';
      valueInput.setAttribute('required', 'required');
    } else if (type === 'percentage') {
      valueGroup.style.display = 'block';
      valueInput.setAttribute('max', '100');
      valueInput.setAttribute('step', '0.01');
      valueHint.textContent = 'Percentage discount (0-100%)';
      valueInput.setAttribute('required', 'required');
    } else if (type === 'fixed_amount') {
      valueGroup.style.display = 'block';
      valueInput.removeAttribute('max');
      valueInput.setAttribute('step', '0.01');
      valueHint.textContent = 'Fixed amount discount (R)';
      valueInput.setAttribute('required', 'required');
    }
  };

  window._handleDiscountSubmit = function(e) {
    e.preventDefault();
    
    var code = safeEl('discount-code').value.trim().toUpperCase();
    var type = safeEl('discount-type').value;
    var value = safeEl('discount-value').value;
    var appliesTo = safeEl('discount-applies-to').value;
    var minPurchase = safeEl('discount-min-purchase').value;
    var usageLimit = safeEl('discount-usage-limit').value;
    var startDate = safeEl('discount-start-date').value;
    var endDate = safeEl('discount-end-date').value;

    // Validate code format
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
      showToast('Discount code must be 3-20 characters (letters, numbers, underscores, hyphens)', 'error');
      return false;
    }

    // Validate discount rate based on type
    if (type !== 'free_shipping') {
      var rateValidation = validateDiscountRate(type, value);
      if (!rateValidation.valid) {
        showToast(rateValidation.message, 'error');
        return false;
      }
    }

    // Validate usage limit
    var usageValidation = validateDiscountUsageLimit(usageLimit);
    if (!usageValidation.valid) {
      showToast(usageValidation.message, 'error');
      return false;
    }

    // Validate minimum purchase
    var minPurchaseValidation = validateMinimumPurchase(minPurchase);
    if (!minPurchaseValidation.valid) {
      showToast(minPurchaseValidation.message, 'error');
      return false;
    }

    // Validate dates
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      showToast('Start date must be before end date', 'error');
      return false;
    }

    var discountData = {
      code: code,
      type: type,
      value: type === 'free_shipping' ? null : Number(value),
      appliesTo: appliesTo,
      minimumPurchase: minPurchaseValidation.value,
      usageLimit: usageValidation.value,
      usageCount: 0,
      startDate: startDate || null,
      endDate: endDate || null,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: window._currentUser ? window._currentUser.uid : null
    };

    // Check if code already exists
    discountsRef.where('code', '==', code).get().then(function(snapshot) {
      if (!snapshot.empty) {
        showToast('Discount code already exists', 'error');
        return;
      }

      discountsRef.add(discountData).then(function(docRef) {
        showToast('Discount created successfully!');
        closeModal();
        loadDiscounts();
      }).catch(function(err) {
        logError('CREATE_DISCOUNT', err);
        showToast('Failed to create discount: ' + err.message, 'error');
      });
    }).catch(function(err) {
      logError('CHECK_DISCOUNT_CODE', err);
      showToast('Failed to check discount code: ' + err.message, 'error');
    });

    return false;
  };

  // ─── DISCOUNT RENDERING ──────────────────────────────────────

  window._renderDiscountsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    var discountTypeLabels = {
      percentage: 'Percentage',
      fixed_amount: 'Fixed Amount',
      free_shipping: 'Free Shipping',
      buy_x_get_y: 'Buy X Get Y'
    };

    var html = '<div class="tab-header">' +
      '<h2>Discounts</h2>' +
      '<button class="btn-primary" onclick="window._openNewDiscountModal()">+ Create Discount</button>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-header"><h3>All Discounts</h3><span id="discount-count">' + window._allDiscounts.length + ' discounts</span></div>' +
      '<div class="table-responsive">' +
      '<table class="data-table">' +
      '<thead><tr>' +
      '<th>Code</th><th>Type</th><th>Value</th><th>Usage</th><th>Status</th><th>Dates</th><th>Actions</th>' +
      '</tr></thead>' +
      '<tbody>';

    window._allDiscounts.forEach(function(discount) {
      var typeLabel = discountTypeLabels[discount.type] || discount.type;
      var valueDisplay = '—';
      if (discount.type === 'percentage') valueDisplay = discount.value + '%';
      else if (discount.type === 'fixed_amount') valueDisplay = fmt(discount.value);
      else if (discount.type === 'buy_x_get_y') valueDisplay = 'Buy ' + discount.value + ' Get 1';

      var usageDisplay = discount.usageCount || 0;
      if (discount.usageLimit) usageDisplay += ' / ' + discount.usageLimit;

      var statusBadgeHtml = discount.active ? 
        '<span class="badge badge-active">Active</span>' : 
        '<span class="badge badge-inactive">Inactive</span>';

      var datesDisplay = '—';
      if (discount.startDate && discount.endDate) {
        datesDisplay = fmtDateShort(discount.startDate) + ' - ' + fmtDateShort(discount.endDate);
      } else if (discount.startDate) {
        datesDisplay = 'From ' + fmtDateShort(discount.startDate);
      } else if (discount.endDate) {
        datesDisplay = 'Until ' + fmtDateShort(discount.endDate);
      }

      html += '<tr>' +
        '<td><strong>' + esc(discount.code) + '</strong></td>' +
        '<td>' + esc(typeLabel) + '</td>' +
        '<td>' + esc(valueDisplay) + '</td>' +
        '<td>' + esc(usageDisplay) + '</td>' +
        '<td>' + statusBadgeHtml + '</td>' +
        '<td>' + esc(datesDisplay) + '</td>' +
        '<td>' +
        '<button onclick="window._toggleDiscountStatus(\'' + discount.id + '\')">Toggle</button> ' +
        '<button onclick="window._deleteDiscount(\'' + discount.id + '\')">Delete</button>' +
        '</td>' +
        '</tr>';
    });

    if (window._allDiscounts.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;padding:20px;">No discounts created yet</td></tr>';
    }

    html += '</tbody></table></div></div>';
    mc.innerHTML = html;
  };

  window._toggleDiscountStatus = function(discountId) {
    var discount = window._allDiscounts.find(function(d) { return d.id === discountId; });
    if (!discount) return;

    discountsRef.doc(discountId).update({
      active: !discount.active
    }).then(function() {
      showToast('Discount ' + (discount.active ? 'deactivated' : 'activated') + ' successfully');
      loadDiscounts();
    }).catch(function(err) {
      logError('TOGGLE_DISCOUNT', err);
      showToast('Failed to toggle discount: ' + err.message, 'error');
    });
  };

  window._deleteDiscount = function(discountId) {
    if (!confirm('Are you sure you want to delete this discount?')) return;

    discountsRef.doc(discountId).delete().then(function() {
      showToast('Discount deleted successfully');
      loadDiscounts();
    }).catch(function(err) {
      logError('DELETE_DISCOUNT', err);
      showToast('Failed to delete discount: ' + err.message, 'error');
    });
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
    ['messages-unread-badge','bnav-msg-badge'].forEach(function(id) {
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
  window.loadDiscounts       = loadDiscounts;
  window.seedDefaultData     = window._seedDefaultData;
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
  window.openNewDiscountModal = window._openNewDiscountModal;
  window.handleDiscountSubmit = window._handleDiscountSubmit;
  window.toggleDiscountStatus = window._toggleDiscountStatus;
  window.deleteDiscount       = window._deleteDiscount;
  window.toggleDiscountTypeFields = window._toggleDiscountTypeFields;
  window.renderDiscountsTab   = window._renderDiscountsTab;
  window.validateDiscountRate = validateDiscountRate;
  window.validateDiscountUsageLimit = validateDiscountUsageLimit;
  window.validateMinimumPurchase = validateMinimumPurchase;

})();
