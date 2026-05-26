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

  var db = firebase.firestore();
  var rtdb = firebase.database();
  var auth = firebase.auth();

  window._adminDB = db;
  window._adminRTDB = rtdb;
  window._adminAuth = auth;

  var productsRef = db.collection('products');
  var reviewsRef = db.collection('reviews');
  var newsletterRef = db.collection('newsletter');
  var ordersRef = db.collection('orders');
  var customersRef = db.collection('customers');
  var vendorsRef = db.collection('vendors');
  var adminsRef = db.collection('admins');

  window._productsRef = productsRef;
  window._reviewsRef = reviewsRef;
  window._newsletterRef = newsletterRef;
  window._ordersRef = ordersRef;
  window._customersRef = customersRef;
  window._vendorsRef = vendorsRef;
  window._adminsRef = adminsRef;

  window._currentTab = 'dashboard';
  window._allProducts = [];
  window._currentUser = null;
  window._currentUserRole = null;
  window._currentVendorId = null;
  window._roleResolved = false;

  var totalUnreadMessages = 0;
  window._totalUnreadMessages = 0;

  var analyticsChart = null;
  var revenueChart = null;
  window._analyticsChart = null;
  window._revenueChart = null;

  var modalState = { isOpen: false, type: null, overlayElement: null, contentElement: null, escapeHandler: null };
  window._modalState = modalState;

  var CHAT_ROOT = 'live_chat';
  window._CHAT_ROOT = CHAT_ROOT;
  window._ORDER_STATUSES = ['pending','paid','processing','packed','shipped','delivered','cancelled','refunded'];
  window._QUICK_REPLIES = ['Hi! How can I help you today?','Your order is being processed.','Your order has been shipped!','We will get back to you shortly.','Thank you for your patience.','Could you share your order number?'];

  var ALLOWED_ROLES = { SUPER_ADMIN: true, VENDOR: true, VIEWER: true };

  function esc(str) { if (str === null || str === undefined) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/`/g,'&#096;'); }
  window._esc = esc;

  function safeUrl(url) { if (!url || typeof url !== 'string') return ''; var t = url.trim(); if (/^https:\/\//i.test(t) || /^data:image\//i.test(t)) return t; return ''; }
  window._safeUrl = safeUrl;

  function safeEl(id) { return document.getElementById(id) || null; }
  window._safeEl = safeEl;

  function fmt(n) { return 'R' + Number(n||0).toLocaleString('en-ZA'); }
  window._fmt = fmt;

  function fmtDate(ts) { if (!ts) return '—'; var d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('en-ZA', {day:'2-digit',month:'short',year:'numeric'}); }
  window._fmtDate = fmtDate;

  function fmtDateShort(ts) { if (!ts) return '—'; var d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('en-ZA', {day:'2-digit',month:'short'}); }
  window._fmtDateShort = fmtDateShort;

  function fmtTime(ts) { if (!ts) return ''; var d = new Date(ts); return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
  window._fmtTime = fmtTime;

  function avatarClass(str) { var idx = 0; if (str) for (var i=0;i<str.length;i++) idx = (idx + str.charCodeAt(i)) % 8; return 'ca-' + idx; }
  window._avatarClass = avatarClass;

  function avatarInitials(str) { if (!str) return '?'; return str.replace(/[^a-zA-Z0-9]/g,'').substring(0,2).toUpperCase() || '?'; }
  window._avatarInitials = avatarInitials;

  function showToast(msg, type) { type = type || 'success'; var toast = document.createElement('div'); toast.className = 'toast toast-' + type; toast.textContent = msg; var tc = safeEl('toast-container'); if (tc) tc.appendChild(toast); setTimeout(function(){ if (toast && toast.parentNode) toast.parentNode.removeChild(toast); }, 3200); }
  window._showToast = showToast;

  function safeSetDisplay(id, display) { var el = safeEl(id); if (el) el.style.display = display; }
  window._safeSetDisplay = safeSetDisplay;

  function isSuperAdmin() { return window._currentUserRole === 'SUPER_ADMIN'; }
  window._isSuperAdmin = isSuperAdmin;

  function statusBadge(status) { status = (status || 'pending').toLowerCase(); return '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>'; }
  window._statusBadge = statusBadge;

  function requireSuperAdmin(actionName) { if (!isSuperAdmin()) { showToast('Insufficient permissions: ' + (actionName || 'action'), 'error'); logError('AUTHZ', new Error('Non-super-admin attempted: ' + actionName)); return false; } return true; }
  window._requireSuperAdmin = requireSuperAdmin;

  function createOverlay(type) { var overlay = document.createElement('div'); overlay.className = type === 'modal' ? 'modal-overlay' : 'slide-panel-overlay'; overlay.addEventListener('click', function(e) { if (e.target === overlay) { if (type === 'modal') closeModal(); else closePanel(); } }); return overlay; }
  function mountModal(htmlContent) { cleanupModalState(); var container = safeEl('modal-container'); if (!container) return; var overlay = createOverlay('modal'); var contentWrapper = document.createElement('div'); contentWrapper.innerHTML = htmlContent; var modalElement = contentWrapper.firstElementChild; if (modalElement) modalElement.addEventListener('click', function(e){ e.stopPropagation(); }); overlay.appendChild(modalElement); container.innerHTML = ''; container.appendChild(overlay); modalState.isOpen = true; modalState.type = 'modal'; modalState.overlayElement = overlay; modalState.contentElement = modalElement; setupEscapeHandler(); }
  window._mountModal = mountModal;

  function mountPanel(htmlContent) { cleanupModalState(); var container = safeEl('panel-container'); if (!container) return; var overlay = createOverlay('panel'); var contentWrapper = document.createElement('div'); contentWrapper.innerHTML = htmlContent; var panelElement = contentWrapper.firstElementChild; if (panelElement) panelElement.addEventListener('click', function(e){ e.stopPropagation(); }); overlay.appendChild(panelElement); container.innerHTML = ''; container.appendChild(overlay); modalState.isOpen = true; modalState.type = 'panel'; modalState.overlayElement = overlay; modalState.contentElement = panelElement; }
  window._mountPanel = mountPanel;

  function setupEscapeHandler() { if (modalState.escapeHandler) document.removeEventListener('keydown', modalState.escapeHandler); modalState.escapeHandler = function(e) { if (e.key === 'Escape') { if (modalState.type === 'panel') closePanel(); else if (modalState.type === 'modal') closeModal(); } }; document.addEventListener('keydown', modalState.escapeHandler); }
  function cleanupModalState() { if (modalState.escapeHandler) { document.removeEventListener('keydown', modalState.escapeHandler); modalState.escapeHandler = null; } var mc = safeEl('modal-container'); var pc = safeEl('panel-container'); if (mc) mc.innerHTML = ''; if (pc) pc.innerHTML = ''; modalState.isOpen = false; modalState.type = null; modalState.overlayElement = null; modalState.contentElement = null; }
  window._closeModal = function() { cleanupModalState(); };
  window._closePanel = function() { cleanupModalState(); };

  function showAuthLoading() { var loader = safeEl('auth-loading'); if (!loader) { loader = document.createElement('div'); loader.id = 'auth-loading'; loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.97);display:flex;align-items:center;justify-content:center;z-index:9999;'; loader.innerHTML = '<div style="text-align:center;font-family:Manrope,sans-serif;"><div style="font-size:14px;color:#666;">Verifying access...</div></div>'; document.body.appendChild(loader); } loader.style.display = 'flex'; }
  function hideAuthLoading() { var loader = safeEl('auth-loading'); if (loader) loader.style.display = 'none'; }
  function initUIState() { safeSetDisplay('login-screen', 'flex'); safeSetDisplay('admin-panel', 'none'); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initUIState); } else { initUIState(); }

  auth.onAuthStateChanged(function(user) {
    if (user) {
      window._currentUser = user;
      safeSetDisplay('login-screen', 'none'); safeSetDisplay('admin-panel', 'none');
      showAuthLoading();
      var initials = (user.email || 'A').substring(0,1).toUpperCase();
      var iniEl = safeEl('admin-initials'); if (iniEl) iniEl.textContent = initials;
      [safeEl('admin-email'), safeEl('admin-email-more')].forEach(function(el) { if (el) el.textContent = user.email; });
      loadUserRole(user).then(function() {
        window._roleResolved = true;
        hideAuthLoading();
        safeSetDisplay('admin-panel', 'block');
        window._loadProducts();
        window._startChatMonitoring();
        renderRoleUI();
      }).catch(function(err) { logError('AUTH/ROLE', err); hideAuthLoading(); auth.signOut().catch(function(e){ logError('AUTH/SIGNOUT', e); }); safeSetDisplay('login-screen', 'flex'); safeSetDisplay('admin-panel', 'none'); showToast('Authentication failed. Please try again.', 'error'); });
    } else {
      window._currentUser = null; window._currentUserRole = null; window._roleResolved = false; window._currentVendorId = null;
      hideAuthLoading(); safeSetDisplay('login-screen', 'flex'); safeSetDisplay('admin-panel', 'none');
      window._stopChatMonitoring();
    }
  });

  function loadUserRole(user) { return adminsRef.doc(user.uid).get().then(function(doc) { if (doc.exists) { var data = doc.data(); var rawRole = data.role || 'VIEWER'; window._currentUserRole = ALLOWED_ROLES[rawRole] ? rawRole : 'VIEWER'; window._currentVendorId = (window._currentUserRole === 'VENDOR') ? (data.vendorId || null) : null; } else { window._currentUserRole = 'VIEWER'; window._currentVendorId = null; showToast('Your account is not authorized. Contact a Super Admin.', 'error'); } }).catch(function(err) { logError('ROLE_FETCH', err); window._currentUserRole = 'VIEWER'; window._currentVendorId = null; showToast('Could not verify your role. Limited access granted.', 'error'); }); }

  function renderRoleUI() { var badge = safeEl('admin-role-badge'); if (badge) { badge.style.display = 'inline-block'; badge.textContent = isSuperAdmin() ? 'Super Admin' : (window._currentUserRole === 'VIEWER' ? 'Viewer' : 'Vendor'); badge.className = 'role-badge ' + (isSuperAdmin() ? 'badge-super' : 'badge-vendor'); } var items = { 'btn-seed': isSuperAdmin(), 'btn-seed-more': isSuperAdmin(), 'vendors-tab-btn': isSuperAdmin(), 'vendors-more-item': isSuperAdmin() }; Object.keys(items).forEach(function(id) { var el = safeEl(id); if (el) el.style.display = items[id] ? 'flex' : 'none'; }); }

  window.handleLogin = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    var emailEl = safeEl('login-email'), passwordEl = safeEl('login-password'), errorEl = safeEl('login-error');
    if (!emailEl || !passwordEl) { logError('LOGIN', new Error('Login form elements not found')); alert('Login form error. Please reload the page.'); return false; }
    var email = emailEl.value.trim(), password = passwordEl.value;
    if (errorEl) errorEl.style.display = 'none';
    if (!email || !password) { if (errorEl) { errorEl.textContent = 'Please enter email and password.'; errorEl.style.display = 'block'; } return false; }
    var loginBtn = safeEl('login-btn'); if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Signing in...'; }
    auth.signInWithEmailAndPassword(email, password).catch(function(err) { logError('LOGIN', err); if (errorEl) { var displayMsg = 'Invalid credentials. Please try again.'; if (err.code === 'auth/too-many-requests') displayMsg = 'Too many failed attempts. Please wait and try again.'; errorEl.textContent = displayMsg; errorEl.style.display = 'block'; } if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; } });
    return false;
  };

  window.handleLogout = function() { auth.signOut().catch(function(err){ logError('LOGOUT', err); }); };

  window.switchTab = function(tab) {
    window._currentTab = tab;
    if (tab !== 'messages') { window._activeChatSession = null; window._detachActiveChatListeners(); }
    document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
    document.querySelectorAll('.bnav-btn[data-tab]').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
    document.querySelectorAll('.bnav-btn:not([data-tab])').forEach(function(b) { b.classList.remove('active'); });
    cleanupModalState();
    renderCurrentTab();
  };

  function renderCurrentTab() { var mc = safeEl('main-content'); if (!mc) return; window._destroyCharts(); switch (window._currentTab) { case 'dashboard': window._renderDashboardTab(); break; case 'products': window._renderProductsTab(); break; case 'messages': window._renderMessagesTab(); break; case 'reviews': window._renderReviewsTab(); break; case 'newsletter': window._renderNewsletterTab(); break; case 'orders': window._renderOrdersTab(); break; case 'customers': window._renderCustomersTab(); break; case 'vendors': window._renderVendorsTab(); break; } }

  function destroyCharts() { if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; } if (window._revenueChart) { window._revenueChart.destroy(); window._revenueChart = null; } }
  window._destroyCharts = destroyCharts;

  function loadProducts() {
    if (!window._currentUser || !window._roleResolved) return;
    var query = isSuperAdmin() ? productsRef.get() : productsRef.where('vendorId','==', window._currentVendorId || '__none__').get();
    query.then(function(snapshot) { window._allProducts = snapshot.docs.map(function(d) { var product = Object.assign({ id: d.id }, d.data()); if (product.variants && Array.isArray(product.variants)) { product.variants = product.variants.map(function(variant) { if (!variant.images) { variant.images = { model: [], ghost: [], detail: [] }; } else { variant.images.model = Array.isArray(variant.images.model) ? variant.images.model : []; variant.images.ghost = Array.isArray(variant.images.ghost) ? variant.images.ghost : []; variant.images.detail = Array.isArray(variant.images.detail) ? variant.images.detail : []; } return variant; }); } return product; }); var el = safeEl('product-count'); if (el) el.textContent = window._allProducts.length + ' products'; var dot = safeEl('status-dot'); if (dot) dot.className = 'status-dot online'; renderCurrentTab(); }).catch(function(e) { logError('LOAD_PRODUCTS', e); var dot = safeEl('status-dot'); if (dot) dot.className = 'status-dot offline'; showToast('Firebase: ' + e.message, 'error'); });
  }
  window._loadProducts = loadProducts;

  var chatsMonitorRef = null;
  var chatsMonitorCallback = null;
  var CHAT_MONITOR_LIMIT = 100;
  function startChatMonitoring() { window._stopChatMonitoring(); chatsMonitorRef = rtdb.ref(CHAT_ROOT).limitToLast(CHAT_MONITOR_LIMIT); chatsMonitorCallback = function(snapshot) { var unread = 0; snapshot.forEach(function(sessionSnap) { var messages = sessionSnap.child('messages'); if (messages.exists()) { messages.forEach(function(msgSnap) { var msg = msgSnap.val(); if (msg && msg.sender === 'customer' && msg.read === false) unread++; }); } }); window._totalUnreadMessages = unread; updateUnreadBadge(); }; chatsMonitorRef.on('value', chatsMonitorCallback, function(err) { logError('CHAT_MONITOR', err); }); }
  window._startChatMonitoring = startChatMonitoring;

  function stopChatMonitoring() { if (chatsMonitorRef && chatsMonitorCallback) { chatsMonitorRef.off('value', chatsMonitorCallback); chatsMonitorRef = null; chatsMonitorCallback = null; } window._detachActiveChatListeners(); }
  window._stopChatMonitoring = stopChatMonitoring;

  function updateUnreadBadge() { ['messages-unread-badge','bnav-msg-badge'].forEach(function(id) { var badge = safeEl(id); if (badge) { badge.textContent = window._totalUnreadMessages; badge.style.display = window._totalUnreadMessages > 0 ? 'inline-flex' : 'none'; } }); }

  window.addEventListener('beforeunload', function() { window._stopChatMonitoring(); destroyCharts(); });

})();
