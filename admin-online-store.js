(function () {
  'use strict';

  if (!window._adminDB) return;

  var db        = window._adminDB;
  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var isSuperAdmin = window._isSuperAdmin;

  // Split across two docs on purpose: onlineStore (comingSoonEnabled) is
  // safe to read publicly if ever needed client-side, but
  // onlineStoreSecrets (visitorPassword) must never be — the public-facing
  // coming-soon page only ever reaches it indirectly, through server.js's
  // /api/verify-visitor-password endpoint (firebase-admin, server-side).
  var onlineStoreRef = db.collection('settings').doc('onlineStore');
  var secretsRef      = db.collection('settings').doc('onlineStoreSecrets');

  window._renderOnlineStoreTab = function () {
    if (!isSuperAdmin()) {
      var mc = safeEl('main-content');
      if (mc) mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Only Super Admin can access this section.</div></div>';
      return;
    }

    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:16px;">' +
        '<div class="section-title">Online Store</div>' +
      '</div>' +
      '<div id="online-store-body"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></div>';

    Promise.all([onlineStoreRef.get(), secretsRef.get()]).then(function (results) {
      var storeData   = results[0].exists ? results[0].data() : {};
      var secretsData = results[1].exists ? results[1].data() : {};
      renderBody(storeData.comingSoonEnabled !== false, secretsData.visitorPassword || '');
    }).catch(function (e) {
      console.error('[ONLINE_STORE]', e);
      var body = safeEl('online-store-body');
      if (body) body.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load. ' + esc(e.message) + '</div></div>';
    });
  };

  function renderBody(comingSoonEnabled, visitorPassword) {
    var body = safeEl('online-store-body');
    if (!body) return;

    body.innerHTML =
      '<form id="online-store-form" onsubmit="window._handleOnlineStoreSubmit(event)">' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Coming Soon Page</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Status</label>' +
              '<select name="comingSoonEnabled">' +
                '<option value="true"' + (comingSoonEnabled ? ' selected' : '') + '>On — Visitors see the Coming Soon page</option>' +
                '<option value="false"' + (!comingSoonEnabled ? ' selected' : '') + '>Off — Store is live to everyone</option>' +
              '</select>' +
              '<div style="font-size:10px;color:var(--muted);margin-top:4px;">' +
                'While on, only you (signed in as Super Admin) or someone with the visitor password below can see the actual site — everyone else lands on the Coming Soon page.' +
              '</div>' +
            '</div>' +

            '<div class="form-group" style="padding:0;">' +
              '<label>Visitor Password</label>' +
              '<input name="visitorPassword" value="' + esc(visitorPassword) + '" placeholder="e.g. a word only people you tell can use">' +
              '<div style="font-size:10px;color:var(--muted);margin-top:4px;">' +
                'Share this with anyone you want to preview the live site before launch (an investor, a friend) — they enter it on the Coming Soon page to get in, without needing an admin account.' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        '<button type="submit" class="btn btn-primary" style="width:100%;margin-bottom:80px;">' +
          '<i class="ph-light ph-check" style="margin-right:4px;"></i> Save' +
        '</button>' +

      '</form>';
  }

  window._handleOnlineStoreSubmit = function (e) {
    e.preventDefault();
    if (!isSuperAdmin()) return;

    var form = e.target;
    var comingSoonEnabled = form.comingSoonEnabled.value === 'true';
    var visitorPassword   = form.visitorPassword.value.trim();

    Promise.all([
      onlineStoreRef.set({ comingSoonEnabled: comingSoonEnabled, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }),
      secretsRef.set({ visitorPassword: visitorPassword, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    ]).then(function () {
      showToast('Online store settings saved');
    }).catch(function (e) {
      console.error('[ONLINE_STORE_SAVE]', e);
      showToast('Error saving: ' + e.message, 'error');
    });
  };

})();
