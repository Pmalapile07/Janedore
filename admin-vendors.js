(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // WAIT UNTIL ADMIN/FIREBASE LOADS
  // ─────────────────────────────────────────────
  function initVendorsModule() {

    if (!window._adminDB) {
      console.warn('[VENDORS] _adminDB missing.');
      return;
    }

    // ─────────────────────────────────────────────
    // SAFE DEPENDENCIES
    // ─────────────────────────────────────────────
    var esc = window._esc || function (s) {
      return s === undefined || s === null ? '' : String(s);
    };

    var safeEl = window._safeEl || function (id) {
      return document.getElementById(id);
    };

    var showToast = window._showToast || function (msg) {
      console.log(msg);
    };

    var statusBadge = window._statusBadge || function (status) {
      return '<span>' + esc(status) + '</span>';
    };

    var isSuperAdmin = window._isSuperAdmin || function () {
      return true;
    };

    var requireSuperAdmin = window._requireSuperAdmin || function () {
      return true;
    };

    var mountModal = window._mountModal || function (html) {
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div);
    };

    var closeModal = window._closeModal || function () {
      document.querySelectorAll('.modal').forEach(function (m) {
        m.remove();
      });
    };

    // ─────────────────────────────────────────────
    // FIXED FIRESTORE REFERENCE
    // ─────────────────────────────────────────────
    var vendorsRef = null;

    try {

      if (window._vendorsRef) {

        vendorsRef = window._vendorsRef;

      } else {

        vendorsRef = window._adminDB.collection('vendors');
        window._vendorsRef = vendorsRef;

      }

      console.log('[VENDORS] vendorsRef initialized:', vendorsRef);

    } catch (e) {

      console.error('[VENDORS] Failed to initialize vendorsRef:', e);
      return;

    }

    // ─────────────────────────────────────────────
    // RENDER TAB
    // ─────────────────────────────────────────────
    window._renderVendorsTab = function () {

      if (!isSuperAdmin()) {

        var denied = safeEl('main-content');

        if (denied) {
          denied.innerHTML =
            '<div class="empty-state">' +
            '<div class="empty-state-text">Access denied.</div>' +
            '</div>';
        }

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
        '<div id="vendors-list">' +
        '<div class="empty-state">' +
        '<div class="empty-state-icon">⬡</div>' +
        '<div class="empty-state-text">Loading...</div>' +
        '</div>' +
        '</div>';

      if (!vendorsRef) {

        console.error('[VENDORS] vendorsRef missing.');

        var fail = safeEl('vendors-list');

        if (fail) {
          fail.innerHTML =
            '<div class="empty-state">' +
            '<div class="empty-state-text">Database connection failed.</div>' +
            '</div>';
        }

        return;
      }

      vendorsRef.get()

        .then(function (snap) {

          window._vendorsData = snap.docs.map(function (d) {
            return Object.assign({ id: d.id }, d.data());
          });

          renderVendorsList(window._vendorsData);

        })

        .catch(function (e) {

          console.error('[VENDORS_TAB]', e);

          var el = safeEl('vendors-list');

          if (el) {
            el.innerHTML =
              '<div class="empty-state">' +
              '<div class="empty-state-text">Could not load vendors.</div>' +
              '<div style="font-size:11px;color:#999;margin-top:6px;">' +
              esc(e.message || 'Unknown error') +
              '</div>' +
              '</div>';
          }

        });

    };

    // ─────────────────────────────────────────────
    // RENDER LIST
    // ─────────────────────────────────────────────
    function renderVendorsList(vendors) {

      var el = safeEl('vendors-list');

      if (!el) return;

      if (!vendors || !vendors.length) {

        el.innerHTML =
          '<div class="empty-state">' +
          '<div class="empty-state-icon">⬡</div>' +
          '<div class="empty-state-text">No vendors yet.</div>' +
          '</div>';

        return;
      }

      var allProducts = window._allProducts || [];

      el.innerHTML =
        '<div class="table-wrap">' +
        '<table class="data-table">' +
        '<thead>' +
        '<tr>' +
        '<th>Vendor</th>' +
        '<th>Brand</th>' +
        '<th>Email</th>' +
        '<th>Status</th>' +
        '<th>Products</th>' +
        '<th></th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>' +

        vendors.map(function (v) {

          var productCount = allProducts.filter(function (p) {
            return p.vendorId === v.id;
          }).length;

          return (
            '<tr>' +
            '<td style="font-weight:400;">' + esc(v.name || '—') + '</td>' +
            '<td class="cell-muted">' + esc(v.brand || '—') + '</td>' +
            '<td class="cell-muted">' + esc(v.email || '—') + '</td>' +
            '<td>' + statusBadge(v.status || 'active') + '</td>' +
            '<td>' + productCount + '</td>' +
            '<td>' +
            '<button class="btn btn-xs btn-ghost" onclick="window._openVendorModal(\'' + esc(v.id) + '\')">Edit</button>' +
            '</td>' +
            '</tr>'
          );

        }).join('') +

        '</tbody>' +
        '</table>' +
        '</div>';
    }

    // ─────────────────────────────────────────────
    // OPEN MODAL
    // ─────────────────────────────────────────────
    window._openVendorModal = function (vendorId) {

      if (!requireSuperAdmin()) return;

      var v = vendorId
        ? (window._vendorsData || []).find(function (x) {
            return x.id === vendorId;
          })
        : null;

      v = v || {
        id: '',
        name: '',
        brand: '',
        email: '',
        commissionRate: 15,
        status: 'active',
        notes: ''
      };

      var modalHTML =
        '<div class="modal modal-sm">' +
        '<button class="modal-close" onclick="window._closeModal()">X</button>' +
        '<div class="modal-title">' +
        (vendorId ? 'Edit' : 'New') +
        ' Vendor</div>' +

        '<form id="vendor-form" onsubmit="window._handleVendorSubmit(event,\'' + esc(v.id) + '\')">' +

        '<div class="form-group">' +
        '<label>Vendor Name</label>' +
        '<input name="name" value="' + esc(v.name) + '" required>' +
        '</div>' +

        '<div class="form-group">' +
        '<label>Brand Name</label>' +
        '<input name="brand" value="' + esc(v.brand) + '">' +
        '</div>' +

        '<div class="form-group">' +
        '<label>Email</label>' +
        '<input type="email" name="email" value="' + esc(v.email) + '">' +
        '</div>' +

        '<div style="display:flex;gap:10px;padding-top:12px;">' +
        '<button type="submit" class="btn btn-primary btn-sm">Save Vendor</button>' +

        (vendorId
          ? '<button type="button" class="btn btn-danger btn-sm" onclick="window._deleteVendor(\'' + esc(vendorId) + '\')">Delete</button>'
          : '') +

        '</div>' +
        '</form>' +
        '</div>';

      mountModal(modalHTML);
    };

    // ─────────────────────────────────────────────
    // SUBMIT
    // ─────────────────────────────────────────────
    window._handleVendorSubmit = function (e, existingId) {

      e.preventDefault();

      var form = e.target;

      var vendorId = existingId || ('vendor-' + Date.now());

      var data = {
        id: vendorId,
        name: form.name.value || '',
        brand: form.brand.value || '',
        email: form.email.value || '',
        updatedAt: new Date().toISOString()
      };

      if (!existingId) {
        data.createdAt = new Date().toISOString();
      }

      vendorsRef.doc(vendorId)
        .set(data, { merge: true })

        .then(function () {

          showToast('Vendor saved');

          closeModal();

          window._renderVendorsTab();

        })

        .catch(function (e) {

          console.error('[VENDOR_SUBMIT]', e);

          showToast(e.message || 'Error saving vendor');

        });
    };

    // ─────────────────────────────────────────────
    // DELETE
    // ─────────────────────────────────────────────
    window._deleteVendor = function (vendorId) {

      if (!confirm('Delete this vendor?')) return;

      vendorsRef.doc(vendorId)

        .delete()

        .then(function () {

          showToast('Vendor deleted');

          closeModal();

          window._renderVendorsTab();

        })

        .catch(function (e) {

          console.error('[DELETE_VENDOR]', e);

          showToast(e.message || 'Delete failed');

        });
    };

    // ─────────────────────────────────────────────
    // SEED DEFAULTS
    // ─────────────────────────────────────────────
    window._seedDefaultVendors = function () {

      var defaults = [

        {
          id: 'vendor-janedore',
          name: 'JANEDORE',
          brand: 'JANEDORE',
          status: 'active'
        },

        {
          id: 'vendor-nirius',
          name: 'NIRIUS CO',
          brand: 'NIRIUS CO',
          status: 'active'
        },

        {
          id: 'vendor-thato',
          name: 'THATO',
          brand: 'THATO',
          status: 'active'
        }

      ];

      Promise.all(

        defaults.map(function (v) {
          return vendorsRef.doc(v.id).set(v, { merge: true });
        })

      )

      .then(function () {

        showToast('Default vendors seeded');

        window._renderVendorsTab();

      })

      .catch(function (e) {

        console.error('[SEED]', e);

        showToast(e.message || 'Seed failed');

      });

    };

    console.log('[VENDORS] Module initialized successfully.');

  }

  // ─────────────────────────────────────────────
  // WAIT FOR FIREBASE/ADMIN
  // ─────────────────────────────────────────────
  var tries = 0;

  var wait = setInterval(function () {

    tries++;

    if (window._adminDB) {

      clearInterval(wait);

      initVendorsModule();

    }

    if (tries > 50) {

      clearInterval(wait);

      console.error('[VENDORS] Timed out waiting for _adminDB.');

    }

  }, 200);

})();
