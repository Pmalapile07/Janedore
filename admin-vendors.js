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

  /* ─────────────────────────────────────────────────────────
     SAFE VENDORS REF INITIALIZATION
  ───────────────────────────────────────────────────────── */
  function getVendorsRef() {
    if (window._vendorsRef && typeof window._vendorsRef.get === 'function') {
      return window._vendorsRef;
    }
    console.warn('[VENDORS] _vendorsRef unavailable, falling back to db.collection("vendors")');
    if (window._adminDB && typeof window._adminDB.collection === 'function') {
      try {
        var ref = window._adminDB.collection('vendors');
        window._vendorsRef = ref;
        return ref;
      } catch (e) {
        console.error('[VENDORS] Failed to create collection ref:', e);
        return null;
      }
    }
    console.error('[VENDORS] No Firestore instance available');
    return null;
  }

  /* ─────────────────────────────────────────────────────────
     VENDORS FETCH WITH TIMEOUT
  ───────────────────────────────────────────────────────── */
  function fetchVendorsWithTimeout(timeoutMs) {
    timeoutMs = timeoutMs || 12000;
    var vendorsRef = getVendorsRef();
    if (!vendorsRef) {
      return Promise.reject(new Error('VENDORS_REF_UNAVAILABLE'));
    }

    var fetchPromise = vendorsRef.get().then(function(snap) {
      if (!snap) {
        throw new Error('NULL_SNAPSHOT');
      }
      console.log('[VENDORS] Fetch succeeded, docs:', snap.docs ? snap.docs.length : 0);
      return snap;
    });

    var timeoutPromise = new Promise(function(_, reject) {
      setTimeout(function() {
        reject(new Error('FETCH_TIMEOUT'));
      }, timeoutMs);
    });

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  /* ─────────────────────────────────────────────────────────
     RENDER LOADING STATE
  ───────────────────────────────────────────────────────── */
  function renderLoadingState() {
    var el = safeEl('vendors-list');
    if (!el) return;
    el.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">⬡</div>' +
        '<div class="empty-state-text">Loading vendors...</div>' +
      '</div>';
  }

  /* ─────────────────────────────────────────────────────────
     RENDER ERROR STATE
  ───────────────────────────────────────────────────────── */
  function renderErrorState(errorCode, errorMessage, retryCount) {
    var el = safeEl('vendors-list');
    if (!el) return;
    retryCount = retryCount || 0;

    var icon = '⚠';
    var title = 'Could not load vendors';
    var detail = errorMessage || 'An unexpected error occurred.';
    var showRetry = true;
    var showSeed = false;

    switch (errorCode) {
      case 'FETCH_TIMEOUT':
        icon = '⏳';
        title = 'Request timed out';
        detail = 'Firestore took too long to respond. Check your connection.';
        break;
      case 'PERMISSION_DENIED':
      case 'permission-denied':
        icon = '🔒';
        title = 'Permission denied';
        detail = 'Your Firestore security rules may be blocking this request.';
        showSeed = isSuperAdmin();
        break;
      case 'VENDORS_REF_UNAVAILABLE':
        icon = '🔌';
        title = 'Firestore not connected';
        detail = 'The vendors collection reference is not available. Firebase may not be initialized.';
        showRetry = false;
        break;
      case 'NULL_SNAPSHOT':
        icon = '📭';
        title = 'Empty response';
        detail = 'Firestore returned no data. The collection may not exist.';
        showSeed = isSuperAdmin();
        break;
      case 'UNKNOWN':
      default:
        icon = '⚠';
        title = 'Something went wrong';
        showSeed = isSuperAdmin();
        break;
    }

    el.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + icon + '</div>' +
        '<div class="empty-state-text" style="font-weight:500;">' + title + '</div>' +
        '<div class="empty-state-text" style="font-size:12px;color:#999;margin-top:4px;">' + detail + '</div>' +
        (showRetry ?
          '<button class="btn btn-sm btn-outline" style="margin-top:12px;" onclick="window._retryLoadVendors(' + retryCount + ')">Retry</button>'
          : '') +
        (showSeed ?
          '<button class="btn btn-sm btn-outline" style="margin-top:8px;" onclick="window._seedDefaultVendors()">Seed Default Vendors</button>'
          : '') +
      '</div>';
  }

  /* ─────────────────────────────────────────────────────────
     RETRY LOGIC
  ───────────────────────────────────────────────────────── */
  window._retryLoadVendors = function(previousRetryCount) {
    var retryCount = (previousRetryCount || 0) + 1;
    var maxRetries = 3;

    if (retryCount > maxRetries) {
      renderErrorState('MAX_RETRIES', 'Maximum retry attempts reached (' + maxRetries + '). Please refresh the page or check your Firestore configuration.', retryCount);
      return;
    }

    console.log('[VENDORS] Retry attempt ' + retryCount + ' of ' + maxRetries);
    renderLoadingState();

    var timeoutMs = 12000 + (retryCount * 4000);

    fetchVendorsWithTimeout(timeoutMs).then(function(snap) {
      window._vendorsData = snap.docs.map(function(d) {
        return Object.assign({id: d.id}, d.data());
      });
      renderVendorsList(window._vendorsData);
    }).catch(function(err) {
      var code = (err && err.code) || (err && err.message) || 'UNKNOWN';
      var msg  = (err && err.message) || String(err);
      console.error('[VENDORS] Fetch error (retry ' + retryCount + '):', code, msg);
      renderErrorState(code, msg, retryCount);
    });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER VENDORS TAB (ENTRY POINT)
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
      '<div id="vendors-list"></div>';

    renderLoadingState();

    console.log('[VENDORS] Starting vendors fetch...');
    fetchVendorsWithTimeout(12000).then(function(snap) {
      window._vendorsData = snap.docs.map(function(d) {
        return Object.assign({id: d.id}, d.data());
      });
      console.log('[VENDORS] Loaded', window._vendorsData.length, 'vendors');
      renderVendorsList(window._vendorsData);
    }).catch(function(err) {
      var code = (err && err.code) || (err && err.message) || 'UNKNOWN';
      var msg  = (err && err.message) || String(err);
      console.error('[VENDORS] Fetch failed:', code, msg);

      if (code === 'permission-denied' || (msg && msg.indexOf('permission') !== -1)) {
        renderErrorState('PERMISSION_DENIED', 'Firestore permission denied. Check your security rules.', 0);
      } else if (code === 'FETCH_TIMEOUT') {
        renderErrorState('FETCH_TIMEOUT', 'Firestore request timed out after 12 seconds.', 0);
      } else if (code === 'VENDORS_REF_UNAVAILABLE') {
        renderErrorState('VENDORS_REF_UNAVAILABLE', 'Could not access vendors collection.', 0);
      } else if (code === 'NULL_SNAPSHOT') {
        renderErrorState('NULL_SNAPSHOT', 'Firestore returned an empty snapshot.', 0);
      } else {
        renderErrorState('UNKNOWN', msg, 0);
      }
    });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER VENDORS LIST
  ───────────────────────────────────────────────────────── */
  function renderVendorsList(vendors) {
    var el = safeEl('vendors-list');
    if (!el) return;

    if (!vendors || vendors.length === 0) {
      el.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">⬡</div>' +
          '<div class="empty-state-text">No vendors yet.</div>' +
          (isSuperAdmin() ? '<button class="btn btn-sm btn-outline" style="margin-top:12px;" onclick="window._seedDefaultVendors()">Seed Default Vendors</button>' : '') +
        '</div>';
      return;
    }

    var allProducts = window._allProducts || [];

    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Vendor</th><th>Brand</th><th>Email</th><th>Status</th><th>Products</th><th></th></tr></thead>' +
      '<tbody>' +
      vendors.map(function(v) {
        var productCount = allProducts.filter(function(p) {
          return p.vendorId === v.id || (p.brand && v.brand && p.brand.toUpperCase() === v.brand.toUpperCase());
        }).length;
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
    var v = vendorId ? (window._vendorsData || []).find(function(x) { return x.id === vendorId; }) : null;
    v = v || { id: '', name: '', brand: '', email: '', commissionRate: 15, status: 'active', notes: '' };

    var modalHTML =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<button class="modal-close" onclick="window._closeModal()">X</button>' +
        '<div class="modal-title">' + (vendorId ? 'Edit' : 'New') + ' Vendor</div>' +
        '<form id="vendor-form" onsubmit="window._handleVendorSubmit(event, \'' + esc(v.id) + '\')">' +
          '<div class="form-group"><label>Vendor Name</label><input name="name" value="' + esc(v.name) + '" required placeholder="e.g. Thato"></div>' +
          '<div class="form-group"><label>Brand Name</label><input name="brand" value="' + esc(v.brand) + '" placeholder="e.g. THATO"></div>' +
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

    var vendorsRef = getVendorsRef();
    if (!vendorsRef) {
      showToast('Error: Firestore not available', 'error');
      console.error('[VENDORS] handleVendorSubmit failed — no ref');
      return;
    }

    var data = {
      id:             vendorId,
      name:           form.name.value,
      brand:          form.brand.value,
      email:          form.email.value,
      commissionRate: commission,
      status:         form.status.value === 'suspended' ? 'suspended' : 'active',
      notes:          form.notes.value,
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
      console.error('[VENDORS] handleVendorSubmit error:', e);
      showToast('Error: ' + (e.message || 'Unknown error'), 'error');
    });
  };

  window._deleteVendor = function(vendorId) {
    if (!requireSuperAdmin('deleteVendor')) return;
    if (!confirm('Delete this vendor? This cannot be undone.')) return;

    var vendorsRef = getVendorsRef();
    if (!vendorsRef) {
      showToast('Error: Firestore not available', 'error');
      console.error('[VENDORS] deleteVendor failed — no ref');
      return;
    }

    vendorsRef.doc(vendorId).delete().then(function() {
      showToast('Vendor deleted');
      closeModal();
      window._renderVendorsTab();
    }).catch(function(e) {
      console.error('[VENDORS] deleteVendor error:', e);
      showToast('Error: ' + (e.message || 'Unknown error'), 'error');
    });
  };

  /* ─────────────────────────────────────────────────────────
     SEED DEFAULT VENDORS
  ───────────────────────────────────────────────────────── */
  window._seedDefaultVendors = function() {
    if (!requireSuperAdmin('seedDefaultVendors')) return;

    var vendorsRef = getVendorsRef();
    if (!vendorsRef) {
      showToast('Error: Firestore not available', 'error');
      console.error('[VENDORS] seedDefaultVendors failed — no ref');
      return;
    }

    var btn = safeEl('seed-vendors-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Seeding...'; }

    var defaults = [
      { id: 'vendor-janedore', name: 'JANEDORE', brand: 'JANEDORE', email: '', commissionRate: 0, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Default brand — house label' },
      { id: 'vendor-nirius',   name: 'NIRIUS CO', brand: 'NIRIUS CO', email: '', commissionRate: 15, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Default brand' },
      { id: 'vendor-thato',    name: 'THATO', brand: 'THATO', email: '', commissionRate: 15, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Default brand — parfum' }
    ];

    var promises = defaults.map(function(v) {
      return vendorsRef.doc(v.id).set(v, { merge: true });
    });

    Promise.all(promises).then(function() {
      showToast('Default vendors seeded!');
      if (btn) { btn.disabled = false; btn.textContent = 'Seed Default Vendors'; }
      window._renderVendorsTab();
    }).catch(function(e) {
      console.error('[VENDORS] seedDefaultVendors error:', e);
      showToast('Error: ' + (e.message || 'Unknown error'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Seed Default Vendors'; }
    });
  };

})();
