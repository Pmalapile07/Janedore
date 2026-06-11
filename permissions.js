(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // JANEDORE PERMISSIONS ENGINE
  // Load this file before admin.js and all module files.
  //
  // Architecture:
  //   Role       = identity only (SUPER_ADMIN | ADMIN | VENDOR)
  //   Permission = action control per module
  //   Scope      = data access control (vendorId, ownership, inbox membership)
  //   UI         = fully driven by _can()
  // ─────────────────────────────────────────────────────────────

  // ─── 1. PERMISSION MAP ───────────────────────────────────────

  window._permissions = {

    SUPER_ADMIN: '*',

    ADMIN: {
      dashboard:  ['read'],
      orders:     ['read', 'update'],
      products:   ['read'],
      inbox:      ['read', 'reply', 'moderate'],
      reviews:    ['read', 'moderate'],
      newsletter: [],
      vendors:    ['read'],
      customers:  []
    },

    VENDOR: {
      dashboard:  ['read'],
      orders:     ['read_own'],
      products:   ['read_own', 'create', 'update_own', 'delete_own'],
      inbox:      ['read_own', 'reply_own'],
      reviews:    ['read_own', 'reply_own'],
      newsletter: [],
      vendors:    ['read_own', 'update_own'],
      customers:  []
    }

  };

  // ─── 2. CORE PERMISSION CHECK: _can(module, action, context) ─

  window._can = function (module, action, context) {
    var role = window._currentUserRole;

    if (!role) return false;

    var map = window._permissions[role];

    if (map === '*') return true;

    if (!map) return false;

    var allowed = map[module];

    if (!allowed || !Array.isArray(allowed)) return false;

    if (allowed.indexOf(action) !== -1) {
      if (action.indexOf('_own') !== -1) {
        return _checkScope(context);
      }
      return true;
    }

    var bareAction = action.replace('_own', '');
    if (allowed.indexOf(bareAction) !== -1) {
      return _checkScope(context);
    }

    return false;
  };

  // ─── 3. SCOPE ENFORCEMENT ────────────────────────────────────

  function _checkScope(context) {
    if (!context) return false;

    var uid      = window._currentUser ? window._currentUser.uid : null;
    var vendorId = window._currentVendorId;

    if (context.vendorId && vendorId) {
      if (context.vendorId === vendorId) return true;
    }

    if (context.ownerId && uid) {
      if (context.ownerId === uid) return true;
    }

    if (Array.isArray(context.participants) && uid) {
      if (context.participants.indexOf(uid) !== -1) return true;
    }

    return false;
  }

  // ─── 4. CONVENIENCE GUARDS ───────────────────────────────────

  window._isSuperAdmin = function () {
    return window._currentUserRole === 'SUPER_ADMIN';
  };

  window._requireSuperAdmin = function (actionName) {
    if (!window._isSuperAdmin()) {
      if (window._showToast) {
        window._showToast('Insufficient permissions: ' + (actionName || 'action'), 'error');
      }
      console.error('[JANEDORE AUTHZ] Non-super-admin attempted:', actionName);
      return false;
    }
    return true;
  };

  window._guard = function (module, action, context) {
    if (!window._can(module, action, context)) {
      if (window._showToast) {
        window._showToast('You do not have permission to perform this action.', 'error');
      }
      console.warn('[JANEDORE AUTHZ] Denied —', module, action, context || '');
      return false;
    }
    return true;
  };

  // ─── 5. UI VISIBILITY HELPER ─────────────────────────────────

  var TAB_MODULE_MAP = {
    dashboard:  'dashboard',
    products:   'products',
    orders:     'orders',
    messages:   'inbox',
    reviews:    'reviews',
    newsletter: 'newsletter',
    vendors:    'vendors',
    customers:  'customers',
    settings:   'settings'
  };

  window._applyRoleUI = function () {
    var role = window._currentUserRole;
    var map  = window._permissions[role];

    Object.keys(TAB_MODULE_MAP).forEach(function (tab) {
      var module  = TAB_MODULE_MAP[tab];
      var visible = false;

      if (map === '*') {
        visible = true;
      } else if (map && map[module] && map[module].length > 0) {
        visible = true;
      }

      // Toggle sidebar buttons
      document.querySelectorAll('.sidebar-btn[data-tab="' + tab + '"]').forEach(function (el) {
        el.style.display = visible ? '' : 'none';
      });

      // Toggle bottom nav buttons
      document.querySelectorAll('.bnav-btn[data-tab="' + tab + '"]').forEach(function (el) {
        el.style.display = visible ? '' : 'none';
      });
    });

    // Super-admin-only elements
    var isSA = window._isSuperAdmin();
    var superAdminOnlyIds = [
      'vendors-tab-btn',
      'vendors-more-item',
      'settings-tab-btn',
      'settings-more-item',
      'btn-seed',
      'btn-seed-more'
    ];
    superAdminOnlyIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = isSA ? '' : 'none';
    });

    // Role badge in the header
    var badge = document.getElementById('admin-role-badge');
    if (badge) {
      var labels = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', VENDOR: 'Vendor', VIEWER: 'Viewer' };
      badge.textContent = labels[role] || role;
      badge.className   = 'role-badge badge-' + (role || 'viewer').toLowerCase().replace('_', '-');
      badge.style.display = 'inline-block';
    }
  };

  // ─── 6. DATA QUERY SCOPE HELPERS ─────────────────────────────

  window._scopedQuery = function (collectionRef, vendorField) {
    vendorField = vendorField || 'vendorId';

    if (window._isSuperAdmin() || window._currentUserRole === 'ADMIN') {
      return collectionRef;
    }

    var vid = window._currentVendorId || '__none__';
    return collectionRef.where(vendorField, '==', vid);
  };

  window._scopedRTDBRef = function (rootRef, sessionVendorId) {
    if (window._isSuperAdmin() || window._currentUserRole === 'ADMIN') {
      return rootRef;
    }
    var vid = window._currentVendorId || '__none__';
    if (sessionVendorId && sessionVendorId !== vid) return null;
    return rootRef;
  };

  // ─── 7. BACKWARD COMPATIBILITY SHIMS ─────────────────────────

  window.isSuperAdmin = window._isSuperAdmin;
  window.requireSuperAdmin = window._requireSuperAdmin;

  console.log('[JANEDORE PERMISSIONS] Engine loaded. Awaiting role resolution.');

})();
