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
      admins: 'admins'
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

})();
