(function () {
  'use strict';

  if (!window._adminDB) return;

  var db          = window._adminDB;
  var esc         = window._esc;
  var safeEl      = window._safeEl;
  var showToast   = window._showToast;
  var isSuperAdmin = window._isSuperAdmin;

  var settingsRef = db.collection('settings').doc('platform');

  // Cache loaded settings globally so other modules can use them
  window._platformSettings = null;

  /* ─────────────────────────────────────────────────────────
     LOAD SETTINGS ON STARTUP
     Other modules can use window._platformSettings.xxx
     e.g. window._platformSettings.freeShippingThreshold
  ───────────────────────────────────────────────────────── */
  function loadSettings() {
    return settingsRef.get().then(function(doc) {
      if (doc.exists) {
        window._platformSettings = doc.data();
      } else {
        // Defaults
        window._platformSettings = getDefaults();
      }
      return window._platformSettings;
    }).catch(function(e) {
      console.warn('[SETTINGS] Could not load, using defaults:', e.message);
      window._platformSettings = getDefaults();
      return window._platformSettings;
    });
  }

  function getDefaults() {
    return {
      platformName: 'Janedore',
      platformLogo: '',
      platformFavicon: '',
      contactEmail: '',
      supportPhone: '',
      currency: 'ZAR',
      freeShippingThreshold: 1500,
      defaultShippingFee: 150,
      taxRate: 0,
      defaultCommissionRate: 15,
      instagramUrl: '',
      tiktokUrl: '',
      metaTitle: 'Janedore — Curated Fashion',
      metaDescription: 'A curated multi-brand fashion house.',
      maintenanceMode: false,
      updatedAt: null
    };
  }

  // Load immediately
  loadSettings();

  /* ─────────────────────────────────────────────────────────
     RENDER SETTINGS TAB
  ───────────────────────────────────────────────────────── */
  window._renderSettingsTab = function() {
    if (!isSuperAdmin()) {
      var mc = safeEl('main-content');
      if (mc) mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Only Super Admin can access settings.</div></div>';
      return;
    }

    var mc = safeEl('main-content');
    if (!mc) return;

    var s = window._platformSettings || getDefaults();

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:16px;">' +
        '<div class="section-title">Settings</div>' +
        '<button class="btn btn-primary" onclick="document.getElementById(\'settings-form\').requestSubmit()">' +
          '<i class="ph-light ph-check" style="margin-right:4px;"></i> Save All Settings' +
        '</button>' +
      '</div>' +

      '<form id="settings-form" onsubmit="window._handleSettingsSubmit(event)">' +

        // ═══ GENERAL ═══
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">General</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Platform Name</label>' +
              '<input name="platformName" value="' + esc(s.platformName || '') + '" placeholder="Janedore">' +
            '</div>' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Platform Logo URL</label>' +
              '<input name="platformLogo" value="' + esc(s.platformLogo || '') + '" placeholder="https://...">' +
              (s.platformLogo ? '<img src="' + esc(s.platformLogo) + '" style="max-width:120px;max-height:40px;margin-top:6px;border-radius:4px;" onerror="this.style.display=\'none\'">' : '') +
            '</div>' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Favicon URL</label>' +
              '<input name="platformFavicon" value="' + esc(s.platformFavicon || '') + '" placeholder="https://...">' +
            '</div>' +

            '<div class="form-row" style="padding:0;gap:12px;">' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Contact Email</label>' +
                '<input name="contactEmail" type="email" value="' + esc(s.contactEmail || '') + '" placeholder="hello@janedore.co.za">' +
              '</div>' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Support Phone</label>' +
                '<input name="supportPhone" value="' + esc(s.supportPhone || '') + '" placeholder="+27...">' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // ═══ STORE ═══
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Store</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">' +

            '<div class="form-row" style="padding:0;gap:12px;">' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Currency</label>' +
                '<select name="currency">' +
                  '<option value="ZAR"' + (s.currency === 'ZAR' ? ' selected' : '') + '>ZAR (R)</option>' +
                  '<option value="USD"' + (s.currency === 'USD' ? ' selected' : '') + '>USD ($)</option>' +
                  '<option value="EUR"' + (s.currency === 'EUR' ? ' selected' : '') + '>EUR (€)</option>' +
                  '<option value="GBP"' + (s.currency === 'GBP' ? ' selected' : '') + '>GBP (£)</option>' +
                '</select>' +
              '</div>' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Tax Rate (%)</label>' +
                '<input name="taxRate" type="number" min="0" max="100" step="0.1" value="' + esc(String(s.taxRate || 0)) + '">' +
              '</div>' +
            '</div>' +

            '<div class="form-row" style="padding:0;gap:12px;">' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Free Shipping Threshold (R)</label>' +
                '<input name="freeShippingThreshold" type="number" min="0" value="' + esc(String(s.freeShippingThreshold || 1500)) + '">' +
              '</div>' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Default Shipping Fee (R)</label>' +
                '<input name="defaultShippingFee" type="number" min="0" value="' + esc(String(s.defaultShippingFee || 150)) + '">' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // ═══ SOCIAL & SEO ═══
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Social &amp; SEO</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">' +

            '<div class="form-row" style="padding:0;gap:12px;">' +
              '<div class="form-group" style="padding:0;">' +
                '<label>Instagram URL</label>' +
                '<input name="instagramUrl" value="' + esc(s.instagramUrl || '') + '" placeholder="https://instagram.com/...">' +
              '</div>' +
              '<div class="form-group" style="padding:0;">' +
                '<label>TikTok URL</label>' +
                '<input name="tiktokUrl" value="' + esc(s.tiktokUrl || '') + '" placeholder="https://tiktok.com/@...">' +
              '</div>' +
            '</div>' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Meta Title (SEO)</label>' +
              '<input name="metaTitle" value="' + esc(s.metaTitle || '') + '" placeholder="Janedore — Curated Fashion">' +
            '</div>' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Meta Description (SEO)</label>' +
              '<textarea name="metaDescription" style="min-height:60px;">' + esc(s.metaDescription || '') + '</textarea>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // ═══ COMMISSION ═══
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Commission</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Default Commission Rate for New Vendors (%)</label>' +
              '<input name="defaultCommissionRate" type="number" min="0" max="100" value="' + esc(String(s.defaultCommissionRate || 15)) + '">' +
              '<div style="font-size:10px;color:var(--muted);margin-top:4px;">This is the default rate. You can override it per vendor.</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // ═══ MAINTENANCE ═══
        '<div class="card" style="margin-bottom:24px;">' +
          '<div class="card-header"><span class="card-title">Maintenance</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Maintenance Mode</label>' +
              '<select name="maintenanceMode">' +
                '<option value="false"' + (!s.maintenanceMode ? ' selected' : '') + '>Off — Store is live</option>' +
                '<option value="true"' + (s.maintenanceMode ? ' selected' : '') + '>On — Show "Coming Soon" page</option>' +
              '</select>' +
              '<div style="font-size:10px;color:var(--muted);margin-top:4px;">When enabled, visitors will see a maintenance page instead of the store.</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // Save button at bottom
        '<button type="submit" class="btn btn-primary" style="width:100%;margin-bottom:80px;">' +
          '<i class="ph-light ph-check" style="margin-right:4px;"></i> Save All Settings' +
        '</button>' +

      '</form>';
  };

  /* ─────────────────────────────────────────────────────────
     SAVE SETTINGS
  ───────────────────────────────────────────────────────── */
  window._handleSettingsSubmit = function(e) {
    e.preventDefault();
    if (!isSuperAdmin()) return;

    var form = e.target;

    var data = {
      platformName:          form.platformName.value.trim(),
      platformLogo:          form.platformLogo.value.trim(),
      platformFavicon:       form.platformFavicon.value.trim(),
      contactEmail:          form.contactEmail.value.trim(),
      supportPhone:          form.supportPhone.value.trim(),
      currency:              form.currency.value,
      freeShippingThreshold: parseFloat(form.freeShippingThreshold.value) || 1500,
      defaultShippingFee:    parseFloat(form.defaultShippingFee.value) || 150,
      taxRate:               parseFloat(form.taxRate.value) || 0,
      defaultCommissionRate: parseFloat(form.defaultCommissionRate.value) || 15,
      instagramUrl:          form.instagramUrl.value.trim(),
      tiktokUrl:             form.tiktokUrl.value.trim(),
      metaTitle:             form.metaTitle.value.trim(),
      metaDescription:       form.metaDescription.value.trim(),
      maintenanceMode:       form.maintenanceMode.value === 'true',
      updatedAt:             firebase.firestore.FieldValue.serverTimestamp()
    };

    settingsRef.set(data, { merge: true }).then(function() {
      window._platformSettings = data;
      showToast('Settings saved');

      // Update page title immediately
      if (data.metaTitle) {
        document.title = data.metaTitle;
      }
    }).catch(function(e) {
      console.error('[SETTINGS_SAVE]', e);
      showToast('Error saving settings: ' + e.message, 'error');
    });
  };

})();
