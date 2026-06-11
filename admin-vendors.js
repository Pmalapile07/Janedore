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

  var role = null; // cached on render

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

    // Load vendors + orders for revenue calculation
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

      // Calculate revenue per vendor
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
        '<th>Status</th>' +
        (canEdit ? '<th></th>' : '') +
      '</tr></thead>' +
      '<tbody>' +
      vendors.map(function(v) {
        var productCount = allProducts.filter(function(p) { return p.vendorId === v.id; }).length;
        var revenue      = vendorRevenue[v.id] || 0;
        var orderCount   = vendorOrders[v.id] || 0;
        var commission   = v.commissionRate || 0;

        return '<tr onclick="window._openVendorDetail(\'' + esc(v.id) + '\')" style="cursor:pointer;">' +
          '<td style="font-weight:500;">' + esc(v.name || v.id) + '</td>' +
          '<td>' + esc(v.brand || '—') + '</td>' +
          '<td>' + productCount + '</td>' +
          '<td>' + orderCount + '</td>' +
          '<td>' + fmt(revenue) + '</td>' +
          '<td>' + commission + '%</td>' +
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
     VENDOR DETAIL PANEL (click a vendor row)
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
        '</div>' +

        (canEdit
          ? '<div style="margin-bottom:14px;">' +
              '<button class="btn btn-sm btn-ghost" onclick="window._openVendorModal(\'' + esc(vendorId) + '\')">Edit Vendor</button>' +
            '</div>'
          : '') +

        '<div class="card-title" style="margin-bottom:7px;">Details</div>' +
        '<div class="info-panel" style="margin-bottom:14px;">' +
          '<div class="info-row"><span class="label">Name</span><span>' + esc(v.name || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Brand</span><span>' + esc(v.brand || '—') + '</span></div>' +
          '<div class="info-row"><span class="label">Email</span><span>' + esc(v.email || '—') + '</span></div>' +
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
     VENDOR OWN PROFILE (Vendor role only)
  ───────────────────────────────────────────────────────── */
  function renderVendorProfile(mc) {
    var vendorId = window._currentVendorId;
    if (!vendorId) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">No vendor profile linked to your account.</div></div>';
      return;
    }

    mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading your brand profile...</div></div>';

    vendorsRef.doc(vendorId).get().then(function(doc) {
      if (!doc.exists) {
        mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Vendor profile not found.</div></div>';
        return;
      }

      var v = Object.assign({ id: doc.id }, doc.data());

      mc.innerHTML =
        '<div class="section-header" style="margin-bottom:16px;">' +
          '<div class="section-title">Your Brand</div>' +
        '</div>' +

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

        // Commission & Status — READ ONLY for vendor
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

        // Save button
        '<button class="btn btn-primary" style="width:100%;margin-bottom:16px;" onclick="document.getElementById(\'vendor-profile-form\').requestSubmit()">' +
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
    v = v || { id:'', name:'', brand:'', email:'', description:'', logoUrl:'', commissionRate:15, status:'active', notes:'' };

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
