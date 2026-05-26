(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var showToast  = window._showToast;
  var statusBadge = window._statusBadge;
  var isSuperAdmin = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var mountModal = window._mountModal;
  var closeModal = window._closeModal;
  var vendorsRef = window._vendorsRef;
  var db         = window._adminDB;

  /* ─────────────────────────────────────────────────────────
     DEFAULT VENDORS (match what was hardcoded in HTML)
  ───────────────────────────────────────────────────────── */
  var DEFAULT_VENDORS = [
    { id: 'vendor-janedore', name: 'JANEDORE', brand: 'JANEDORE', email: '', commissionRate: 0, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Default brand — house label' },
    { id: 'vendor-nirius',   name: 'NIRIUS CO', brand: 'NIRIUS CO', email: '', commissionRate: 15, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Default brand' },
    { id: 'vendor-thato',    name: 'THATO', brand: 'THATO', email: '', commissionRate: 15, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Default brand — parfum' }
  ];

  /* ─────────────────────────────────────────────────────────
     SEED DEFAULT VENDORS
  ───────────────────────────────────────────────────────── */
  window._seedDefaultVendors = function() {
    if (!requireSuperAdmin('seedDefaultVendors')) return;
    var btn = safeEl('seed-vendors-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Seeding...'; }

    var promises = DEFAULT_VENDORS.map(function(v) {
      return vendorsRef.doc(v.id).set(v, { merge: true });
    });

    Promise.all(promises).then(function() {
      showToast('Default vendors seeded!');
      if (btn) { btn.disabled = false; btn.textContent = 'Seed Default Vendors'; }
      window._renderVendorsTab();
    }).catch(function(e) {
      console.error('[SEED_VENDORS]', e);
      showToast('Error seeding: ' + (e.message || 'Unknown error'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Seed Default Vendors'; }
    });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER VENDORS TAB
  ───────────────────────────────────────────────────────── */
  window._renderVendorsTab = function() {
    if (!isSuperAdmin()) {
      var mc = safeEl('main-content');
      if (mc) mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Access denied.</div></div>';
      return;
    }
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Vendors</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-sm btn-outline" id="seed-vendors-btn" onclick="window._seedDefaultVendors()">Seed Default Vendors</button>' +
          '<button class="btn btn-sm btn-primary" onclick="window._openVendorModal(null)">+ Add Vendor</button>' +
        '</div>' +
      '</div>' +
      '<div id="vendors-list"><div class="empty-state"><div class="empty-state-icon">⬡</div><div class="empty-state-text">Loading...</div></div></div>';

    loadVendorsSafe();
  };

  function loadVendorsSafe() {
    vendorsRef.get().then(function(snap) {
      window._vendorsData = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      renderVendorsList(window._vendorsData);
    }).catch(function(e) {
      console.error('[VENDORS_TAB]', e);
      var el = safeEl('vendors-list');
      if (el) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⬡</div><div class="empty-state-text">Could not load vendors. Check console or seed defaults.</div><button class="btn btn-sm btn-outline" style="margin-top:12px;" onclick="window._seedDefaultVendors()">Seed Default Vendors</button></div>';
      }
    });
  }

  function renderVendorsList(vendors) {
    var el = safeEl('vendors-list');
    if (!el) return;

    if (!vendors || vendors.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⬡</div><div class="empty-state-text">No vendors yet. Click "Seed Default Vendors" to add JANEDORE, NIRIUS CO, and THATO.</div><button class="btn btn-sm btn-outline" style="margin-top:12px;" onclick="window._seedDefaultVendors()">Seed Default Vendors</button></div>';
      return;
    }

    var allProducts = window._allProducts || [];

    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Vendor</th><th>Brand</th><th>Email</th><th>Status</th><th>Products</th><th></th></tr></thead>' +
      '<tbody>' +
      vendors.map(function(v) {
        var productCount = allProducts.filter(function(p){ return p.vendorId === v.id || (p.brand && p.brand.toUpperCase() === (v.brand || '').toUpperCase()); }).length;
        return '<tr>' +
          '<td style="font-weight:400;">' + esc(v.name || '—') + '</td>' +
          '<td class="cell-muted">' + esc(v.brand || '—') + '</td>' +
          '<td class="cell-muted">' + esc(v.email || '—') + '</td>' +
          '<td>' + statusBadge(v.status || 'active') + '</td>' +
          '<td>' + productCount + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<button class="btn btn-xs btn-ghost" onclick="window._openVendorModal(\'' + esc(v.id) + '\')">Edit</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ─────────────────────────────────────────────────────────
     VENDOR MODAL (CREATE / EDIT)
  ───────────────────────────────────────────────────────── */
  window._openVendorModal = function(vendorId) {
    if (!requireSuperAdmin('openVendorModal')) return;
    var v = vendorId ? (window._vendorsData || []).find(function(x){ return x.id === vendorId; }) : null;
    v = v || { id:'', name:'', brand:'', email:'', commissionRate:15, status:'active', notes:'' };

    var modalHTML = '<div class="modal modal-sm">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">X</button>' +
      '<div class="modal-title">' + (vendorId ? 'Edit' : 'New') + ' Vendor</div>' +
      '<form id="vendor-form" onsubmit="window._handleVendorSubmit(event, \'' + esc(v.id) + '\')">' +
        '<div class="form-group"><label>Vendor Name</label><input name="name" value="' + esc(v.name) + '" required placeholder="e.g. Thato"></div>' +
        '<div class="form-group"><label>Brand Name (must match product brand)</label><input name="brand" value="' + esc(v.brand) + '" placeholder="e.g. THATO"></div>' +
        '<div class="form-group"><label>Contact Email</label><input name="email" type="email" value="' + esc(v.email) + '" placeholder="vendor@brand.com"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Commission %</label><input name="commissionRate" type="number" value="' + esc(String(v.commissionRate || 15)) + '" min="0" max="100"></div>' +
          '<div class="form-group"><label>Status</label><select name="status"><option value="active"' + (v.status === 'active' ? ' selected' : '') + '>Active</option><option value="suspended"' + (v.status === 'suspended' ? ' selected' : '') + '>Suspended</option></select></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea name="notes">' + esc(v.notes || '') + '</textarea></div>' +
        '<div style="display:flex;gap:10px;padding:14px 16px 4px;">' +
          '<button type="submit" class="btn btn-primary btn-sm">Save Vendor</button>' +
          (vendorId ? '<button type="button" class="btn btn-danger btn-sm" onclick="window._deleteVendor(\'' + esc(vendorId) + '\')">Delete</button>' : '') +
        '</div>' +
      '</form>' +
    '</div>';

    mountModal(modalHTML);
  };

  window._handleVendorSubmit = function(e, existingId) {
    if (!requireSuperAdmin('handleVendorSubmit')) return;
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
      commissionRate: commission,
      status:         form.status.value === 'suspended' ? 'suspended' : 'active',
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
      showToast('Error: ' + (e.message || 'Unknown error'), 'error');
    });
  };

  window._deleteVendor = function(vendorId) {
    if (!requireSuperAdmin('deleteVendor')) return;
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

})();
