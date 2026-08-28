(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc          = window._esc;
  var safeEl       = window._safeEl;
  var fmtDate      = window._fmtDate;
  var showToast    = window._showToast;
  var isSuperAdmin = window._isSuperAdmin;
  var mountModal   = window._mountModal;
  var closeModal   = window._closeModal;
  var adminsRef    = window._adminsRef;

  var STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
  var ROLE_LABELS = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', VIEWER: 'Viewer' };
  var ROLE_BADGE_CLASS = { SUPER_ADMIN: 'badge-success', ADMIN: 'badge-processing', VIEWER: 'badge-muted' };

  /* ─────────────────────────────────────────────────────────
     RENDER ADMINS TAB — Super Admin only
  ───────────────────────────────────────────────────────── */
  window._renderAdminsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    if (!isSuperAdmin()) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">You do not have access to this section.</div></div>';
      return;
    }

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Admins</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-sm btn-primary" onclick="window._openAdminModal(null)">+ Add Admin</button>' +
        '</div>' +
      '</div>' +
      '<div id="admins-list"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></div>';

    adminsRef.where('role', 'in', STAFF_ROLES).get().then(function(snap) {
      window._adminsData = snap.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });
      renderAdminsList(window._adminsData);
    }).catch(function(e) {
      console.error('[ADMINS_TAB]', e);
      var el = safeEl('admins-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load admins.</div><button class="btn btn-sm btn-ghost" style="margin-top:12px;" onclick="window._renderAdminsTab()">Retry</button></div>';
    });
  };

  /* ─────────────────────────────────────────────────────────
     ADMINS LIST
  ───────────────────────────────────────────────────────── */
  function renderAdminsList(admins) {
    var el = safeEl('admins-list');
    if (!el) return;

    if (admins.length === 0) {
      el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-users-three"></i></div>' +
        '<div class="orders-empty-title">No staff accounts yet</div>' +
        '<div class="orders-empty-sub">Team members will appear here once added.</div>' +
        '<button class="orders-empty-btn" onclick="window._openAdminModal(null)">Add your first admin</button>' +
      '</div>';
      return;
    }

    var currentUid = window._currentUser ? window._currentUser.uid : null;

    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
        '<th>Name</th>' +
        '<th>Email</th>' +
        '<th>Role</th>' +
        '<th>Last Login</th>' +
        '<th>Added</th>' +
        '<th></th>' +
      '</tr></thead>' +
      '<tbody>' +
      admins.map(function(a) {
        var isSelf     = a.id === currentUid;
        var roleClass  = ROLE_BADGE_CLASS[a.role] || 'badge-muted';
        var roleLabel  = ROLE_LABELS[a.role] || a.role;

        return '<tr>' +
          '<td style="font-weight:500;">' + esc(a.name || '—') +
            (isSelf ? ' <span class="badge badge-muted" style="font-size:9px;">You</span>' : '') +
          '</td>' +
          '<td>' + esc(a.email || '—') + '</td>' +
          '<td><span class="badge ' + roleClass + '">' + esc(roleLabel) + '</span></td>' +
          '<td>' + (a.lastLogin ? fmtDate(a.lastLogin) : '—') + '</td>' +
          '<td>' + fmtDate(a.createdAt) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button class="btn btn-xs btn-ghost" onclick="window._openAdminModal(\'' + esc(a.id) + '\')">Edit</button>' +
            (isSelf ? '' : '<button class="btn btn-xs btn-danger" onclick="window._deleteAdmin(\'' + esc(a.id) + '\')">Delete</button>') +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ─────────────────────────────────────────────────────────
     ADMIN MODAL — CREATE / EDIT (Super Admin only)
  ───────────────────────────────────────────────────────── */
  window._openAdminModal = function(adminId) {
    if (!window._requireSuperAdmin('manage admins')) return;

    var a = adminId ? (window._adminsData || []).find(function(x) { return x.id === adminId; }) : null;
    a = a || { id: '', name: '', email: '', role: 'ADMIN' };

    var isSelf = !!(adminId && window._currentUser && adminId === window._currentUser.uid);

    var modalHTML = '<div class="modal modal-sm">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
      '<div class="modal-title">' + (adminId ? 'Edit' : 'New') + ' Admin</div>' +
      '<form id="admin-form" onsubmit="window._handleAdminSubmit(event, \'' + esc(a.id) + '\')">' +

        '<div class="form-group"><label>Name</label><input name="name" value="' + esc(a.name || '') + '" required placeholder="e.g. Lindiwe"></div>' +

        (adminId
          ? '<div class="form-group"><label>Email</label><input value="' + esc(a.email || '') + '" disabled style="opacity:0.6;"></div>'
          : '<div class="form-group"><label>Email</label><input name="email" type="email" required placeholder="staff@janedore.co.za"></div>') +

        (adminId
          ? ''
          : '<div class="form-group"><label>Password</label><input name="password" type="text" required minlength="6" placeholder="Set a password"><div style="font-size:10px;color:var(--muted);margin-top:4px;">Minimum 6 characters. Share this with them securely.</div></div>') +

        '<div class="form-group"><label>Role</label>' +
          '<select name="role"' + (isSelf ? ' disabled' : '') + '>' +
            '<option value="ADMIN"' + (a.role === 'ADMIN' ? ' selected' : '') + '>Admin</option>' +
            '<option value="VIEWER"' + (a.role === 'VIEWER' ? ' selected' : '') + '>Viewer</option>' +
            '<option value="SUPER_ADMIN"' + (a.role === 'SUPER_ADMIN' ? ' selected' : '') + '>Super Admin</option>' +
          '</select>' +
          (isSelf
            ? '<div style="font-size:10px;color:var(--muted);margin-top:4px;">You cannot change your own role.</div>'
            : '<div style="font-size:10px;color:var(--muted);margin-top:4px;">Super Admin has full access to everything, including managing other admins.</div>') +
        '</div>' +

        '<div style="display:flex;gap:10px;padding:14px 20px 4px;">' +
          '<button type="submit" class="btn btn-primary">Save Admin</button>' +
          (adminId && !isSelf ? '<button type="button" class="btn btn-danger" onclick="window._deleteAdmin(\'' + esc(adminId) + '\')">Delete</button>' : '') +
        '</div>' +

      '</form>' +
    '</div>';

    mountModal(modalHTML);
  };

  window._handleAdminSubmit = function(e, existingId) {
    if (!window._requireSuperAdmin('manage admins')) return;
    e.preventDefault();

    var form = e.target;
    var name = form.name.value.trim();
    var role = form.role.value;
    var isSelf = !!(existingId && window._currentUser && existingId === window._currentUser.uid);

    // Granting owner-level access is a big deal — confirm explicitly.
    if (!isSelf && role === 'SUPER_ADMIN') {
      var already = existingId ? (window._adminsData || []).find(function(x) { return x.id === existingId; }) : null;
      if (!already || already.role !== 'SUPER_ADMIN') {
        if (!confirm('Grant full Super Admin (owner-level) access to ' + (name || 'this account') + '? They will be able to manage everything, including other admins.')) return;
      }
    }

    if (existingId) {
      var data = { name: name, updatedAt: new Date().toISOString() };
      if (!isSelf) data.role = role;

      adminsRef.doc(existingId).update(data).then(function() {
        showToast('Admin updated');
        closeModal();
        window._renderAdminsTab();
      }).catch(function(e) {
        console.error('[ADMIN_UPDATE]', e);
        showToast('Error: ' + e.message, 'error');
      });
      return;
    }

    // Creating a new admin needs a login account too.
    var email    = form.email.value.trim();
    var password = form.password.value;

    if (!email || !password) { showToast('Email and password are required.', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

    // Use a secondary Firebase app so creating the account doesn't
    // sign out the current Super Admin — same pattern as vendor accounts.
    var secondaryAppName = 'admin-creator-' + Date.now();
    var secondaryApp = firebase.initializeApp({
      apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI",
      authDomain: "janedore-9f035.firebaseapp.com",
      projectId: "janedore-9f035",
      storageBucket: "janedore-9f035.firebasestorage.app",
      messagingSenderId: "571299748651",
      appId: "1:571299748651:web:01463a772d47b39cc4036e"
    }, secondaryAppName);

    var secondaryAuth = secondaryApp.auth();

    secondaryAuth.createUserWithEmailAndPassword(email, password).then(function(userCredential) {
      var uid = userCredential.user.uid;

      return secondaryAuth.signOut().then(function() {
        return secondaryApp.delete();
      }).then(function() {
        return adminsRef.doc(uid).set({
          name:      name,
          email:     email,
          role:      role,
          createdAt: new Date().toISOString(),
          createdBy: window._currentUser.uid
        });
      }).then(function() {
        closeModal();
        showToast('Admin account created for ' + email);

        setTimeout(function() {
          var credHTML = '<div class="modal modal-sm">' +
            '<div class="modal-handle"></div>' +
            '<button class="modal-close" onclick="window._closeModal()">&#x2715;</button>' +
            '<div class="modal-title">Account Created</div>' +
            '<div style="padding:16px 20px;">' +
              '<p style="font-size:12.5px;color:var(--text);margin-bottom:16px;">' +
                'Share these credentials with ' + esc(name) + '. They can log in at the Janedore Studio admin page.' +
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

        window._renderAdminsTab();
      });
    }).catch(function(e) {
      console.error('[CREATE_ADMIN_ACCOUNT]', e);

      secondaryAuth.signOut().catch(function() {});
      secondaryApp.delete().catch(function() {});

      if (e.code === 'auth/email-already-in-use') {
        showToast('An account with this email already exists.', 'error');
      } else if (e.code === 'auth/weak-password') {
        showToast('Password is too weak. Use at least 6 characters.', 'error');
      } else {
        showToast('Error: ' + e.message, 'error');
      }
    });
  };

  /* ─────────────────────────────────────────────────────────
     DELETE ADMIN (Super Admin only)
     Removes their Firestore permissions record. This does NOT
     delete their Firebase Auth login — that requires the
     Firebase Console (client SDK can't delete other users'
     credentials), same limitation as vendor account resets.
  ───────────────────────────────────────────────────────── */
  window._deleteAdmin = function(adminId) {
    if (!window._requireSuperAdmin('delete admin')) return;

    if (window._currentUser && adminId === window._currentUser.uid) {
      showToast('You cannot delete your own account.', 'error');
      return;
    }

    var a = (window._adminsData || []).find(function(x) { return x.id === adminId; });
    var label = a ? (a.name || a.email || adminId) : adminId;

    if (!confirm('Remove ' + label + '\'s access? This deletes their permissions record. Their login credentials will still exist — to remove those too, use the Firebase Console.')) return;

    adminsRef.doc(adminId).delete().then(function() {
      showToast('Admin access removed');
      closeModal();
      window._renderAdminsTab();
    }).catch(function(e) {
      console.error('[DELETE_ADMIN]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

})();
