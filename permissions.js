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
  //
  // module  : string  — e.g. 'products', 'orders', 'inbox'
  // action  : string  — e.g. 'read', 'create', 'update_own', 'publish'
  // context : object  — optional scope data:
  //   {
  //     vendorId    : string   — resource owner's vendorId
  //     ownerId     : string   — resource owner's uid (for ownership checks)
  //     participants: string[] — for inbox conversation membership checks
  //   }
  //
  // Returns: boolean

  window._can = function (module, action, context) {
    var role = window._currentUserRole;

    // No role resolved yet — deny everything.
    if (!role) return false;

    var map = window._permissions[role];

    // SUPER_ADMIN wildcard — always allow.
    if (map === '*') return true;

    // Unknown role — deny.
    if (!map) return false;

    var allowed = map[module];

    // Module not listed for this role — deny.
    if (!allowed || !Array.isArray(allowed)) return false;

    // Direct action match (e.g. role has 'read' and action is 'read').
    if (allowed.indexOf(action) !== -1) {

      // If action is a scoped variant (ends in _own), enforce scope.
      if (action.indexOf('_own') !== -1) {
        return _checkScope(context);
      }

      // Non-scoped action for this role — allow.
      return true;
    }

    // Role has the scoped version but request is for the bare action
    // (e.g. role has 'read_own' and action is 'read').
    // For tab navigation (no context), allow — scoping happens at data level.
    // For data operations with context, enforce scope.
    var scopedAction = action + '_own';
    if (allowed.indexOf(scopedAction) !== -1) {
      if (!context) return true;
      return _checkScope(context);
    }

    // Role has the bare action (e.g. 'read') but the request is for
    // the scoped variant ('read_own') — also valid since it is more
    // restrictive. Enforce scope.
    var bareAction = action.replace('_own', '');
    if (allowed.indexOf(bareAction) !== -1) {
      return _checkScope(context);
    }

    return false;
  };

  // ─── 3. SCOPE ENFORCEMENT ────────────────────────────────────
  //
  // Called when an action requires ownership verification.
  // Passes if:
  //   a) context.vendorId matches the current user's vendorId, OR
  //   b) context.ownerId matches the current user's uid, OR
  //   c) current user appears in context.participants (inbox), OR
  //   d) no context provided — deny by default for scoped actions.

  function _checkScope(context) {
    if (!context) return false;

    var uid      = window._currentUser ? window._currentUser.uid : null;
    var vendorId = window._currentVendorId;

    // Vendor-scoped resource check.
    if (context.vendorId && vendorId) {
      if (context.vendorId === vendorId) return true;
    }

    // Ownership by uid.
    if (context.ownerId && uid) {
      if (context.ownerId === uid) return true;
    }

    // Inbox conversation membership.
    if (Array.isArray(context.participants) && uid) {
      if (context.participants.indexOf(uid) !== -1) return true;
    }

    return false;
  }

  // ─── 4. CONVENIENCE GUARDS ───────────────────────────────────

  // Drop-in replacement for the old isSuperAdmin() used across all modules.
  window._isSuperAdmin = function () {
    return window._currentUserRole === 'SUPER_ADMIN';
  };

  // Drop-in replacement for requireSuperAdmin().
  // Returns true if allowed, shows a toast and returns false if not.
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

  // Generic guard — shows a toast on failure.
  // Usage: if (!_guard('products', 'publish')) return;
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
  //
  // Call after role is resolved to show/hide nav tabs and UI regions
  // based on what the current role is permitted to access.
  //
  // Usage: window._applyRoleUI()
  //
  // Tabs are identified by their data-tab attribute on sidebar-btn
  // and bnav-btn elements. Any tab whose module produces zero allowed
  // actions is hidden.

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

      // Toggle sidebar buttons.
      document.querySelectorAll('.sidebar-btn[data-tab="' + tab + '"]').forEach(function (el) {
        el.style.display = visible ? '' : 'none';
      });

      // Toggle bottom nav buttons.
      document.querySelectorAll('.bnav-btn[data-tab="' + tab + '"]').forEach(function (el) {
        el.style.display = visible ? '' : 'none';
      });
    });

    // Super-admin-only elements — targeted by their actual HTML IDs.
    // vendors tab and seed data buttons are hidden by default in the HTML
    // and only shown to Super Admin.
    var isSA = window._isSuperAdmin();
    var superAdminOnlyIds = [
      'vendors-tab-btn',   // sidebar vendors tab
      'vendors-more-item', // more menu vendors item
      'settings-tab-btn',  // sidebar settings tab
      'settings-more-item',// more menu settings item
      'btn-seed',          // sidebar seed button
      'btn-seed-more'      // more menu seed button
    ];
    superAdminOnlyIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = isSA ? '' : 'none';
    });

    // Role badge in the header.
    var badge = document.getElementById('admin-role-badge');
    if (badge) {
      var labels = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', VENDOR: 'Vendor', VIEWER: 'Viewer' };
      badge.textContent = labels[role] || role;
      badge.className   = 'role-badge badge-' + (role || 'viewer').toLowerCase().replace('_', '-');
      badge.style.display = 'inline-block';
    }
  };

  // ─── 6. DATA QUERY SCOPE HELPERS ─────────────────────────────
  //
  // These return the correct Firestore query constraint for the
  // current user, so each module does not have to replicate the
  // role-branching logic.
  //
  // Usage:
  //   var q = window._scopedQuery(window._productsRef);
  //   q.get().then(...)

  window._scopedQuery = function (collectionRef, vendorField) {
    vendorField = vendorField || 'vendorId';

    if (window._isSuperAdmin() || window._currentUserRole === 'ADMIN') {
      return collectionRef;
    }

    // VENDOR — scope to own vendorId.
    var vid = window._currentVendorId || '__none__';
    return collectionRef.where(vendorField, '==', vid);
  };

  // Same for RTDB paths — returns the correct ref.
  // For RTDB, vendor inbox sessions are keyed by vendorId at the root
  // live_chat node, so pass the root ref and this returns a filtered
  // ref (RTDB does not support WHERE, so VENDOR gets their own path).
  window._scopedRTDBRef = function (rootRef, sessionVendorId) {
    if (window._isSuperAdmin() || window._currentUserRole === 'ADMIN') {
      return rootRef;
    }
    // For vendors: navigate to their specific sub-path if sessionVendorId
    // matches, or return null (caller should treat null as no access).
    var vid = window._currentVendorId || '__none__';
    if (sessionVendorId && sessionVendorId !== vid) return null;
    return rootRef;
  };

  // ─── 7. BACKWARD COMPATIBILITY SHIMS ─────────────────────────
  //
  // These ensure any module still calling the old patterns continues
  // to work while being transparently routed through _can().

  // Old: isSuperAdmin() — now window._isSuperAdmin() defined above.
  // Expose as a plain global function too for inline HTML onclick handlers.
  window.isSuperAdmin = window._isSuperAdmin;

  // Old: requireSuperAdmin(name) — now window._requireSuperAdmin(name).
  window.requireSuperAdmin = window._requireSuperAdmin;

  console.log('[JANEDORE PERMISSIONS] Engine loaded. Awaiting role resolution.');

})();
