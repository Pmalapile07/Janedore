(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc          = window._esc;
  var safeEl       = window._safeEl;
  var fmt          = window._fmt;
  var fmtDate      = window._fmtDate;
  var showToast    = window._showToast;
  var statusBadge  = window._statusBadge;
  var isSuperAdmin = window._isSuperAdmin;
  var mountModal   = window._mountModal;
  var closeModal   = window._closeModal;
  var vendorsRef   = window._vendorsRef;
  var ordersRef    = window._ordersRef;
  var productsRef  = window._productsRef;
  var adminsRef    = window._adminsRef;
  var auth         = window._adminAuth;

  var role = null;

  /* ─────────────────────────────────────────────────────────
     RENDER VENDORS TAB — role-based
  ───────────────────────────────────────────────────────── */
  window._renderVendorsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    role = window._currentUserRole;

    // VENDOR sees only their own profile
    if (role === 'VENDOR') {
      renderVendorProfile(mc);
      return;
    }

    // SUPER_ADMIN or ADMIN — show vendor list
    var canEdit = isSuperAdmin();

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Vendors</div>' +
        '<div style="display:flex;gap:8px;">' +
          (canEdit
            ? '<button class="btn btn-sm btn-ghost" id="seed-vendors-btn" onclick="window._seedDefaultVendors()">Seed Default Vendors</button>' +
              '<button class="btn btn-sm btn-primary" onclick="window._openVendorModal(null)">+ Add Vendor</button>'
            : '<span class="ui-label">Read-only view</span>') +
        '</div>' +
      '</div>' +
      '<div id="vendors-list"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></div>';

    Promise.all([
      vendorsRef.get(),
      ordersRef.orderBy('createdAt', 'desc').limit(200).get()
    ]).then(function(results) {
      var vendorsSnap = results[0];
      var ordersSnap  = results[1];

      window._vendorsData = vendorsSnap.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });

      var orders = ordersSnap.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });

      var vendorRevenue = {};
      var vendorOrders = {};
      orders.forEach(function(o) {
        (o.items || []).forEach(function(item) {
          var vid = item.vendorId || 'unknown';
          vendorRevenue[vid] = (vendorRevenue[vid] || 0) + (item.price * item.qty);
        });
        (o.vendorIds || []).forEach(function(vid) {
          vendorOrders[vid] = (vendorOrders[vid] || 0) + 1;
        });
      });

      renderVendorsList(window._vendorsData, vendorRevenue, vendorOrders, canEdit);
    }).catch(function(e) {
      console.error('[VENDORS_TAB]', e);
      var el = safeEl('vendors-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load vendors.</div><button class="btn btn-sm btn-ghost" style="margin-top:12px;" onclick="window._renderVendorsTab()">Retry</button></div>';
    });
  };

  /* ─────────────────────────────────────────────────────────
     VENDOR LIST (Super Admin + Admin)
  ───────────────────────────────────────────────────────── */
  function renderVendorsList(vendors, vendorRevenue, vendorOrders, canEdit) {
    var el = safeEl('vendors-list');
    if (!el) return;

    if (vendors.length === 0) {
      el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-handshake"></i></div>' +
        '<div class="orders-empty-title">No vendors yet</div>' +
        '<div class="orders-empty-sub">Brand partners will appear here once added.</div>' +
        (canEdit ? '<button class="orders-empty-btn" onclick="window._openVendorModal(null)">Add your first vendor</button>' : '') +
      '</div>';
      return;
    }

    var allProducts = window._allProducts || [];

    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
        '<th>Vendor</th>' +
        '<th>Brand</th>' +
        '<th>Products</th>' +
        '<th>Orders</th>' +
        '<th>Revenue</th>' +
        '<th>Commission</th>' +
        '<th>Account</th>' +
        '<th>Status</th>' +
        (canEdit ? '<th></th>' : '') +
      '</tr></thead>' +
      '<tbody>' +
      vendors.map(function(v) {
        var productCount = allProducts.filter(function(p) { return p.vendorId === v.id; }).length;
        var revenue      = vendorRevenue[v.id] || 0;
        var orderCount   = vendorOrders[v.id] || 0;
        var commission   = v.commissionRate || 0;
        var hasAccount   = v.accountEmail ? true : false;

        return '<tr onclick="window._openVendorDetail(\'' + esc(v.id) + '\')" style="cursor:pointer;">' +
          '<td style="font-weight:500;">' + esc(v.name || v.id) + '</td>' +
          '<td>' + esc(v.brand || '—') + '</td>' +
          '<td>' + productCount + '</td>' +
          '<td>' + orderCount + '</td>' +
          '<td>' + fmt(revenue) + '</td>' +
          '<td>' + commission + '%</td>' +
          '<td>' +
            (hasAccount
              ? '<span style="font-size:10px;color:var(--success);">✓ ' + esc(v.accountEmail) + '</span>'
              : '<span style="font-size:10px;color:var(--muted2);">No login</span>') +
          '</td>' +
          '<td>' + statusBadge(v.status || 'active') + '</td>' +
          (canEdit
            ? '<td onclick="event.stopPropagation()">' +
                '<button class="btn btn-xs btn-ghost" onclick="window._openVendorModal(\'' + esc(v.id) + '\')">Edit</button>' +
              '</td>'
            : '') +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ─────────────────────────────────────────────────────────
     VENDOR DETAIL PANEL
  ───────────────────────────────────────────────────────── */
  window._openVendorDetail = function(vendorId) {
    var v = (window._vendorsData || []).find(function(x) { return x.id === vendorId; });
    if (!v) return;

    var allProducts = window._allProducts || [];
    var vendorProducts = allProducts.filter(function(p) { return p.vendorId === vendorId; });

    var canEdit = isSuperAdmin();

    var panelHTML =
      '<div class="slide-panel">' +
        '<button class="slide-panel-close" onclick="window._closePanel()">&#x2715;</button>' +
        '<div class="ui-label" style="margin-bottom:4px;">Vendor</div>' +
        '<div style="font-size:21px;font-weight:300;margin-bottom:18px;">' + esc(v.name || v.id) + '</div>' +

        '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">' +
          statusBadge(v.status || 'active') +
          '<span class="badge badge-muted">' + esc(v.commissionRate || 0) + '% commission</span>' +
          (v.accountEmail ? '<span class="badge badge-success">Has login</span>' : '<span class="badge badge-warning">No login</span>') +
        '</div>' +

        (canEdit
          ? '<div style="margin-bottom:14px;display:flex;gap:6px;">' +
              '<button class="btn btn-sm btn-ghost" onclick="window._openVendorModal(\'' + esc(vendorId) + '\')">Edit Vendor</button>' +
              (v.accountEmail
                ? '<button class="btn btn-sm btn-ghost" onclick="window._resetVendorPassword(\'' + esc(vendorId) + '\')">Reset Password</button>'
                : '<button class="btn btn-sm btn-primary" onclick="window._createVendorAccount(\'' + esc(vendorId) + '\')">Create Login Account</button>') +
            '</div>'
          : '') +

        '<div class="card-title" style="margin-bottom:7px;">Details</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Name</span><span>' + esc(v.name || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Brand</span><span>' + esc(v.brand || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Email</span><span>' + esc(v.email || '—') + '</span></div>' +
          (v.accountEmail ? '<div class="info-row"><span class="label">Login Email</span><span>' + esc(v.accountEmail) + '</span></div>' : '') +
          '<div class="info-row"><span class="label">Created</span><span>' + fmtDate(v.createdAt) + '</span></div>' +
          (v.notes ? '<div class="info-row"><span class="label">Notes</span><span>' + esc(v.notes) + '</span></div>' : '') +
        '</div>' +

        '<div class="card-title" style="margin-bottom:7px;">Products (' + vendorProducts.length + ')</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          (vendorProducts.length === 0
            ? '<div class="info-row"><span class="label">No products yet</span></div>'
            : vendorProducts.slice(0, 10).map(function(p) {
                return '<div class="info-row">' +
                  '<span class="label">' + esc(p.name) + '</span>' +
                  '<span>' + fmt(p.price || 0) + ' · ' + statusBadge(p.status || 'draft') + '</span>' +
                '</div>';
              }).join('') +
              (vendorProducts.length > 10 ? '<div class="info-row"><span class="label" style="color:var(--muted);">+ ' + (vendorProducts.length - 10) + ' more</span></div>' : '')) +
        '</div>' +

      '</div>';

    window._mountPanel(panelHTML);
  };

  /* ─────────────────────────────────────────────────────────
     CREATE VENDOR ACCOUNT (Super Admin only)
  ───────────────────────────────────────────────────────── */
  window._createVendorAccount = function(vendorId) {
    if (!isSuperAdmin()) return;

    var v = (window._vendorsData || []).find(function(x) { return x.id === vendorId; });
    if (!v) { showToast('Vendor not found', 'error'); return; }
    if (!v.email) { showToast('Vendor must have a contact email first. Edit the vendor and add an email.', 'error'); return; }

    // Show a modal to set password
    var modalHTML = '<div class="modal modal-sm">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
      '<div class="modal-title">Create Login Account</div>' +
      '<div style="padding:16px 20px;">' +
        '<p style="font-size:12.5px;color:var(--text);margin-bottom:16px;">' +
          'Create a login account for <strong>' + esc(v.name) + '</strong>. ' +
          'They will use this email and password to sign in to the Janedore Studio.' +
        '</p>' +
        '<form id="create-account-form" onsubmit="window._handleCreateVendorAccount(event, \'' + esc(vendorId) + '\')">' +
          '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
            '<label>Login Email</label>' +
            '<input name="accountEmail" type="email" value="' + esc(v.email) + '" required placeholder="vendor@brand.com">' +
          '</div>' +
          '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
            '<label>Password</label>' +
            '<input name="accountPassword" type="text" required placeholder="Set a password" minlength="6">' +
            '<div style="font-size:10px;color:var(--muted);margin-top:4px;">Minimum 6 characters. Share this with the vendor securely.</div>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary" style="width:100%;">Create Account</button>' +
        '</form>' +
      '</div>' +
    '</div>';

    mountModal(modalHTML);
  };

  window._handleCreateVendorAccount = function(e, vendorId) {
    e.preventDefault();
    if (!isSuperAdmin()) return;

    var form = e.target;
    var email = form.accountEmail.value.trim();
    var password = form.accountPassword.value;

    if (!email || !password) { showToast('Email and password are required.', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

    // Step 1: Create Firebase Auth account
    auth.createUserWithEmailAndPassword(email, password).then(function(userCredential) {
      var uid = userCredential.user.uid;

      // Step 2: Add to admins collection with VENDOR role
      return adminsRef.doc(uid).set({
        email: email,
        role: 'VENDOR',
        vendorId: vendorId,
        createdAt: new Date().toISOString(),
        createdBy: window._currentUser.uid
      }).then(function() {
        // Step 3: Update vendor doc with accountEmail
        return vendorsRef.doc(vendorId).update({
          accountEmail: email,
          accountUid: uid,
          updatedAt: new Date().toISOString()
        });
      }).then(function() {
        // Update local data
        var v = (window._vendorsData || []).find(function(x) { return x.id === vendorId; });
        if (v) { v.accountEmail = email; v.accountUid = uid; }

        closeModal();
        showToast('Account created! Vendor can now log in with ' + email);

        // Show credentials for sharing
        setTimeout(function() {
          var credHTML = '<div class="modal modal-sm">' +
            '<div class="modal-handle"></div>' +
            '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
            '<div class="modal-title">Account Created</div>' +
            '<div style="padding:16px 20px;">' +
              '<p style="font-size:12.5px;color:var(--text);margin-bottom:16px;">' +
                'Share these credentials with the vendor. They can log in at the Janedore Studio admin page.' +
              '</p>' +
              '<div class="info-panel" style="margin-bottom:16px;">' +
                '<div class="info-row"><span class="label">Login URL</span><span style="font-size:11px;">' + window.location.origin + window.location.pathname + '</span></div>' +
                '<div class="info-row"><span class="label">Email</span><span>' + esc(email) + '</span></div>' +
                '<div class="info-row"><span class="label">Password</span><span>' + esc(password) + '</span></div>' +
              '</div>' +
              '<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px;" onclick="window._copyCredentials(\'' + esc(email) + '\',\'' + esc(password) + '\')">Copy Credentials</button>' +
              '<button class="btn btn-ghost btn-sm" style="width:100%;" onclick="window._closeModal()">Done</button>' +
            '</div>' +
          '</div>';
          mountModal(credHTML);
        }, 400);

        window._renderVendorsTab();
      });
    }).catch(function(e) {
      console.error('[CREATE_VENDOR_ACCOUNT]', e);
      if (e.code === 'auth/email-already-in-use') {
        showToast('An account with this email already exists.', 'error');
      } else if (e.code === 'auth/weak-password') {
        showToast('Password is too weak. Use at least 6 characters.', 'error');
      } else {
        showToast('Error: ' + e.message, 'error');
      }
    });
  };

  window._copyCredentials = function(email, password) {
    var text = 'Login: ' + window.location.origin + window.location.pathname + '\nEmail: ' + email + '\nPassword: ' + password;
    navigator.clipboard.writeText(text)
      .then(function() { showToast('Credentials copied to clipboard'); })
      .catch(function() { showToast('Could not copy', 'error'); });
  };

  /* ─────────────────────────────────────────────────────────
     RESET VENDOR PASSWORD (Super Admin only)
  ───────────────────────────────────────────────────────── */
  window._resetVendorPassword = function(vendorId) {
    if (!isSuperAdmin()) return;

    var v = (window._vendorsData || []).find(function(x) { return x.id === vendorId; });
    if (!v || !v.accountEmail) { showToast('Vendor has no login account.', 'error'); return; }

    var modalHTML = '<div class="modal modal-sm">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
      '<div class="modal-title">Reset Password</div>' +
      '<div style="padding:16px 20px;">' +
        '<p style="font-size:12.5px;color:var(--text);margin-bottom:16px;">' +
          'Reset the password for <strong>' + esc(v.name) + '</strong> (' + esc(v.accountEmail) + ').' +
        '</p>' +
        '<form id="reset-password-form" onsubmit="window._handleResetVendorPassword(event, \'' + esc(vendorId) + '\')">' +
          '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
            '<label>New Password</label>' +
            '<input name="newPassword" type="text" required placeholder="New password" minlength="6">' +
          '</div>' +
          '<button type="submit" class="btn btn-primary" style="width:100%;">Reset Password</button>' +
        '</form>' +
      '</div>' +
    '</div>';

    mountModal(modalHTML);
  };

  window._handleResetVendorPassword = function(e, vendorId) {
    e.preventDefault();
    if (!isSuperAdmin()) return;

    var v = (window._vendorsData || []).find(function(x) { return x.id === vendorId; });
    if (!v || !v.accountEmail) return;

    var newPassword = e.target.newPassword.value;
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

    // Firebase requires the user to be signed in to update password via client SDK.
    // For admin-initiated resets, we use a workaround: delete and recreate.
    // Or we tell the vendor to use "Forgot Password".
    // For now, show the password to admin so they can share it.

    showToast('For security, please use Firebase Console to reset the password for ' + v.accountEmail + '. Or ask the vendor to use "Forgot Password" on the login page.', 'info');
    closeModal();

    // Alternative: Use Firebase Admin SDK via a Cloud Function (recommended for production)
    // For now, we show the manual path.
  };

  /* ─────────────────────────────────────────────────────────
     VENDOR OWN PROFILE (Vendor role only)
     Includes onboarding welcome for first-time login
  ───────────────────────────────────────────────────────── */
  function renderVendorProfile(mc) {
    var vendorId = window._currentVendorId;
    if (!vendorId) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">No vendor profile linked to your account. Contact Super Admin.</div></div>';
      return;
    }

    mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading your brand profile...</div></div>';

    vendorsRef.doc(vendorId).get().then(function(doc) {
      if (!doc.exists) {
        mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Vendor profile not found.</div></div>';
        return;
      }

      var v = Object.assign({ id: doc.id }, doc.data());

      // Check if this is first login (no products yet = new vendor)
      var allProducts = window._allProducts || [];
      var vendorProducts = allProducts.filter(function(p) { return p.vendorId === vendorId; });
      var isNewVendor = vendorProducts.length === 0;

      mc.innerHTML =
        '<div class="section-header" style="margin-bottom:16px;">' +
          '<div class="section-title">Your Brand</div>' +
        '</div>' +

        // Welcome banner for new vendors
        (isNewVendor
          ? '<div class="vendor-scope-bar" style="margin-bottom:16px;background:var(--success-soft);border-color:rgba(26,135,66,0.2);color:var(--success);">' +
              '<i class="ph-light ph-confetti" style="font-size:16px;margin-right:6px;"></i>' +
              'Welcome to Janedore! Get started by adding your first product or updating your brand profile below.' +
            '</div>'
          : '') +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Brand Profile</span></div>' +
          '<div style="padding:12px 16px;">' +
            '<form id="vendor-profile-form" onsubmit="window._handleVendorProfileSubmit(event, \'' + esc(v.id) + '\')">' +

              '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
                '<label>Brand Name</label>' +
                '<input name="name" value="' + esc(v.name || '') + '" placeholder="Your brand name">' +
              '</div>' +

              '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
                '<label>Display Name (shown on store)</label>' +
                '<input name="brand" value="' + esc(v.brand || '') + '" placeholder="e.g. NIRIUS CO">' +
              '</div>' +

              '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
                '<label>Contact Email</label>' +
                '<input name="email" type="email" value="' + esc(v.email || '') + '" placeholder="you@brand.com">' +
              '</div>' +

              '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
                '<label>Brand Description</label>' +
                '<textarea name="description" style="min-height:80px;" placeholder="Tell customers about your brand...">' + esc(v.description || '') + '</textarea>' +
              '</div>' +

              '<div class="form-group" style="padding:0;margin-bottom:12px;">' +
                '<label>Logo URL</label>' +
                '<input name="logoUrl" value="' + esc(v.logoUrl || '') + '" placeholder="https://...">' +
              '</div>' +

            '</form>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Platform Details</span></div>' +
          '<div style="padding:12px 16px;">' +
            '<div class="info-panel">' +
              '<div class="info-row">' +
                '<span class="label">Commission Rate</span>' +
                '<span>' + esc(String(v.commissionRate || 0)) + '%</span>' +
              '</div>' +
              '<div class="info-row">' +
                '<span class="label">Status</span>' +
                '<span>' + statusBadge(v.status || 'active') + '</span>' +
              '</div>' +
              '<div class="info-row">' +
                '<span class="label">Member since</span>' +
                '<span>' + fmtDate(v.createdAt) + '</span>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--muted);margin-top:8px;">Commission rate and status are managed by Janedore. Contact support for changes.</div>' +
          '</div>' +
        '</div>' +

        // Quick actions for new vendors
        (isNewVendor
          ? '<div class="card" style="margin-bottom:12px;">' +
              '<div class="card-header"><span class="card-title">Get Started</span></div>' +
              '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;">' +
                '<button class="btn btn-ghost" style="justify-content:flex-start;" onclick="window.switchTab(\'products\')">' +
                  '<i class="ph-light ph-barcode" style="margin-right:8px;font-size:16px;"></i> Add Your First Product' +
                '</button>' +
                '<button class="btn btn-ghost" style="justify-content:flex-start;" onclick="document.getElementById(\'vendor-profile-form\').querySelector(\'[name=name]\').focus()">' +
                  '<i class="ph-light ph-storefront" style="margin-right:8px;font-size:16px;"></i> Update Brand Profile' +
                '</button>' +
              '</div>' +
            '</div>'
          : '') +

        '<button class="btn btn-primary" style="width:100%;margin-bottom:80px;" onclick="document.getElementById(\'vendor-profile-form\').requestSubmit()">' +
          'Save Changes' +
        '</button>';
    }).catch(function(e) {
      console.error('[VENDOR_PROFILE]', e);
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load profile.</div></div>';
    });
  };

  window._handleVendorProfileSubmit = function(e, vendorId) {
    e.preventDefault();
    var form = e.target;

    var data = {
      name:        form.name.value.trim(),
      brand:       form.brand.value.trim(),
      email:       form.email.value.trim(),
      description: form.description.value.trim(),
      logoUrl:     form.logoUrl.value.trim(),
      updatedAt:   new Date().toISOString()
    };

    vendorsRef.doc(vendorId).update(data).then(function() {
      showToast('Brand profile updated');
    }).catch(function(e) {
      console.error('[VENDOR_PROFILE_UPDATE]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  /* ─────────────────────────────────────────────────────────
     VENDOR MODAL — CREATE / EDIT (Super Admin only)
  ───────────────────────────────────────────────────────── */
  window._openVendorModal = function(vendorId) {
    if (!isSuperAdmin()) {
      showToast('Only Super Admin can manage vendors.', 'error');
      return;
    }

    var v = vendorId ? (window._vendorsData || []).find(function(x) { return x.id === vendorId; }) : null;
    v = v || { id:'', name:'', brand:'', email:'', description:'', logoUrl:'', commissionRate:15, status:'active', notes:'', accountEmail:'' };

    var modalHTML = '<div class="modal modal-sm">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
      '<div class="modal-title">' + (vendorId ? 'Edit' : 'New') + ' Vendor</div>' +
      '<form id="vendor-form" onsubmit="window._handleVendorSubmit(event, \'' + esc(v.id) + '\')">' +

        '<div class="form-group"><label>Vendor Name</label><input name="name" value="' + esc(v.name) + '" required placeholder="e.g. Thato"></div>' +
        '<div class="form-group"><label>Brand Display Name</label><input name="brand" value="' + esc(v.brand) + '" placeholder="e.g. THATO"></div>' +
        '<div class="form-group"><label>Contact Email</label><input name="email" type="email" value="' + esc(v.email) + '" placeholder="vendor@brand.com"></div>' +
        '<div class="form-group"><label>Description</label><textarea name="description">' + esc(v.description || '') + '</textarea></div>' +
        '<div class="form-group"><label>Logo URL</label><input name="logoUrl" value="' + esc(v.logoUrl || '') + '" placeholder="https://..."></div>' +

        '<div class="form-row">' +
          '<div class="form-group"><label>Commission %</label><input name="commissionRate" type="number" value="' + esc(String(v.commissionRate || 15)) + '" min="0" max="100"></div>' +
          '<div class="form-group"><label>Status</label><select name="status"><option value="active"' + (v.status === 'active' ? ' selected' : '') + '>Active</option><option value="suspended"' + (v.status === 'suspended' ? ' selected' : '') + '>Suspended</option><option value="inactive"' + (v.status === 'inactive' ? ' selected' : '') + '>Inactive</option></select></div>' +
        '</div>' +

        '<div class="form-group"><label>Internal Notes</label><textarea name="notes">' + esc(v.notes || '') + '</textarea></div>' +

        // Account info (read-only if exists)
        (v.accountEmail
          ? '<div class="form-group"><label>Login Account</label><input value="' + esc(v.accountEmail) + '" disabled style="opacity:0.6;"><div style="font-size:10px;color:var(--muted);margin-top:4px;">Use "Reset Password" to change vendor credentials.</div></div>'
          : '') +

        '<div style="display:flex;gap:10px;padding:14px 20px 4px;">' +
          '<button type="submit" class="btn btn-primary">Save Vendor</button>' +
          (vendorId ? '<button type="button" class="btn btn-danger" onclick="window._deleteVendor(\'' + esc(vendorId) + '\')">Delete</button>' : '') +
        '</div>' +

      '</form>' +
    '</div>';

    mountModal(modalHTML);
  };

  window._handleVendorSubmit = function(e, existingId) {
    if (!isSuperAdmin()) return;
    e.preventDefault();
    var form     = e.target;
    var vendorId = existingId || ('vendor-' + Date.now());

    var commission = parseFloat(form.commissionRate.value) || 15;
    commission = Math.min(100, Math.max(0, commission));

    var data = {
      id:             vendorId,
      name:           form.name.value.trim(),
      brand:          form.brand.value.trim(),
      email:          form.email.value.trim(),
      description:    form.description.value.trim(),
      logoUrl:        form.logoUrl.value.trim(),
      commissionRate: commission,
      status:         form.status.value,
      notes:          form.notes.value.trim(),
      updatedAt:      new Date().toISOString()
    };
    if (!existingId) {
      data.createdAt = new Date().toISOString();
    }

    vendorsRef.doc(vendorId).set(data, { merge: true }).then(function() {
      showToast('Vendor saved');
      closeModal();
      window._renderVendorsTab();
    }).catch(function(e) {
      console.error('[VENDOR_SUBMIT]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  window._deleteVendor = function(vendorId) {
    if (!isSuperAdmin()) return;
    if (!confirm('Delete this vendor? This cannot be undone.')) return;
    vendorsRef.doc(vendorId).delete().then(function() {
      showToast('Vendor deleted');
      closeModal();
      window._renderVendorsTab();
    }).catch(function(e) {
      console.error('[DELETE_VENDOR]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  /* ─────────────────────────────────────────────────────────
     SEED DEFAULT VENDORS
  ───────────────────────────────────────────────────────── */
  window._seedDefaultVendors = function() {
    if (!isSuperAdmin()) return;
    var btn = safeEl('seed-vendors-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Seeding...'; }

    var defaults = [
      { id: 'vendor-janedore', name: 'JANEDORE', brand: 'JANEDORE', email: '', commissionRate: 0, status: 'active', description: 'House label — Janedore original pieces.', logoUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'House brand — 0% commission' },
      { id: 'vendor-nirius',   name: 'NIRIUS CO', brand: 'NIRIUS CO', email: '', commissionRate: 15, status: 'active', description: 'Contemporary jewelry and accessories.', logoUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: '' },
      { id: 'vendor-thato',    name: 'THATO', brand: 'THATO', email: '', commissionRate: 15, status: 'active', description: 'Curated parfum collection.', logoUrl: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: '' }
    ];

    var promises = defaults.map(function(v) {
      return vendorsRef.doc(v.id).set(v, { merge: true });
    });

    Promise.all(promises).then(function() {
      showToast('Default vendors seeded!');
      if (btn) { btn.disabled = false; btn.textContent = 'Seed Default Vendors'; }
      window._renderVendorsTab();
    }).catch(function(e) {
      console.error('[SEED_VENDORS]', e);
      showToast('Error: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Seed Default Vendors'; }
    });
  };

})();
