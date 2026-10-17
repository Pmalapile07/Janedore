/* ─────────────────────────────────────────────────────────
   CONTENT — Super Admin's file library.
   Upload anything Cloudinary takes (images, fonts, sounds, video,
   PDFs), preview it, copy its link, and choose which image is the
   website logo or the email logo.

   Stored as one document, settings/contentLibrary:
     { items: [{ id, name, url, kind, format, bytes, publicId, uploadedAt }],
       siteLogo: { url, itemId } | null,
       emailLogo: { url, itemId } | null }
   settings/* is already Super-Admin-writable in firestore.rules, so no
   rules change is needed. server.js reads siteLogo for the header and
   emailLogo for every order email.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (!window._adminDB) return;

  var db        = window._adminDB;
  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var libraryRef = db.collection('settings').doc('contentLibrary');

  var library = { items: [], siteLogo: null, emailLogo: null, logoFont: null };
  var uploading = 0;

  var SLOTS = [
    { key: 'logoFont',  kind: 'font',  label: 'Logo font',    hint: 'The JANEDORE text at the top of every page is set in this font. Not set: Unbounded.' },
    { key: 'siteLogo',  kind: 'image', label: 'Website logo', hint: 'Replaces the JANEDORE text at the top of every page with an image. Use a white logo on a transparent background.' },
    { key: 'emailLogo', kind: 'image', label: 'Email logo',   hint: 'Shown in the black bar at the top of every order email. Use a white PNG on a transparent background.' }
  ];

  function kindOf(result, file) {
    var type = (file && file.type) || '';
    var fmt = String(result.format || (file && file.name.split('.').pop()) || '').toLowerCase();
    if (/^(ttf|otf|woff2?|eot)$/.test(fmt) || /font/.test(type)) return 'font';
    if (result.resource_type === 'image' && fmt !== 'pdf') return 'image';
    if (fmt === 'pdf') return 'pdf';
    if (/^audio\//.test(type) || /^(mp3|wav|ogg|m4a|aac|flac)$/.test(fmt)) return 'sound';
    if (result.resource_type === 'video') return 'video';
    return 'file';
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function thumbUrl(url) {
    return url && url.indexOf('/image/upload/') !== -1 ? url.replace('/upload/', '/upload/c_limit,w_300,h_300,f_auto,q_auto/') : url;
  }

  function load() {
    return libraryRef.get().then(function (doc) {
      var d = doc.exists ? doc.data() : {};
      library = { items: Array.isArray(d.items) ? d.items : [], siteLogo: d.siteLogo || null, emailLogo: d.emailLogo || null, logoFont: d.logoFont || null };
    });
  }

  // Logo choices only; the items list is changed with arrayUnion/arrayRemove.
  function save(patch) {
    Object.assign(library, patch);
    return libraryRef.set(Object.assign({}, patch, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
  }

  // ─── RENDER ─────────────────────────────────────────────────

  window._renderContentTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    if (!window._isSuperAdmin || !window._isSuperAdmin()) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Only Super Admin can manage content.</div></div>';
      return;
    }
    mc.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;">Loading...</div>';
    load().then(draw).catch(function (e) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load content: ' + esc(e.message) + '</div></div>';
    });
  };

  function slotCard(slot) {
    var current = library[slot.key];
    return '<div class="card content-slot">' +
      '<div class="content-slot-preview">' +
        (current && current.url
          ? (slot.kind === 'font'
              ? '<style>@font-face{font-family:"cf-slot-' + slot.key + '";src:url("' + esc(current.url) + '");}</style><span class="content-slot-font" style="font-family:\'cf-slot-' + slot.key + '\',sans-serif;">JANEDORE</span>'
              : '<img src="' + esc(thumbUrl(current.url)) + '" alt="">')
          : '<span>Not set</span>') +
      '</div>' +
      '<div class="content-slot-body">' +
        '<div class="content-slot-title">' + esc(slot.label) + '</div>' +
        '<div class="content-slot-hint">' + esc(slot.hint) + '</div>' +
        (current && current.url
          ? '<button class="btn btn-xs btn-ghost" onclick="window._clearContentSlot(\'' + slot.key + '\')">Remove</button>'
          : '<div class="content-slot-hint" style="margin-top:6px;">Pick ' + (slot.kind === 'font' ? 'a font' : 'an image') + ' below and tap "Use as ' + esc(slot.label.toLowerCase()) + '".</div>') +
      '</div>' +
    '</div>';
  }

  function itemPreview(item) {
    var url = esc(item.url);
    if (item.kind === 'image') return '<img src="' + esc(thumbUrl(item.url)) + '" alt="" loading="lazy">';
    if (item.kind === 'sound') return '<i class="ph-light ph-music-note"></i><audio controls preload="none" src="' + url + '"></audio>';
    if (item.kind === 'video') return '<video src="' + url + '" controls preload="metadata" playsinline></video>';
    if (item.kind === 'font') {
      return '<style>@font-face{font-family:"cf-' + esc(item.id) + '";src:url("' + url + '");}</style>' +
        '<div class="content-font-sample" style="font-family:\'cf-' + esc(item.id) + '\',sans-serif;">Aa JANEDORE</div>';
    }
    if (item.kind === 'pdf') return '<i class="ph-light ph-file-pdf"></i>';
    return '<i class="ph-light ph-file"></i>';
  }

  function itemCard(item) {
    var usedAs = SLOTS.filter(function (s) { return library[s.key] && library[s.key].itemId === item.id; })
      .map(function (s) { return s.label; });
    return '<div class="content-item">' +
      '<div class="content-item-preview content-kind-' + esc(item.kind) + '">' + itemPreview(item) + '</div>' +
      '<div class="content-item-body">' +
        '<div class="content-item-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div>' +
        '<div class="content-item-meta">' + esc(item.kind) + (item.format ? ' · ' + esc(String(item.format).toUpperCase()) : '') + ' · ' + fmtBytes(item.bytes) + '</div>' +
        (usedAs.length ? '<div class="content-item-used">' + esc(usedAs.join(', ')) + '</div>' : '') +
        '<div class="content-item-actions">' +
          '<button class="btn btn-xs btn-ghost" onclick="window._copyContentLink(\'' + esc(item.id) + '\')"><i class="ph-light ph-link"></i> Copy link</button>' +
          SLOTS.filter(function (s) { return s.kind === item.kind; }).map(function (s) {
            return '<button class="btn btn-xs btn-ghost" onclick="window._setContentSlot(\'' + s.key + '\',\'' + esc(item.id) + '\')">Use as ' + esc(s.label.toLowerCase()) + '</button>';
          }).join('') +
          '<button class="btn btn-xs btn-ghost" style="color:var(--danger);" onclick="window._removeContentItem(\'' + esc(item.id) + '\')">Remove</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function draw() {
    var mc = safeEl('main-content');
    if (!mc) return;
    var items = library.items.slice().sort(function (a, b) { return (b.uploadedAt || 0) - (a.uploadedAt || 0); });
    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:16px;">' +
        '<div class="section-title">Content</div>' +
        '<button class="btn btn-primary btn-sm" onclick="window._uploadContent()"><i class="ph-light ph-upload-simple" style="margin-right:4px;"></i> Upload</button>' +
      '</div>' +
      '<div class="content-slots">' + SLOTS.map(slotCard).join('') + '</div>' +
      '<div class="content-section-label">Library <span>' + items.length + (items.length === 1 ? ' file' : ' files') + '</span></div>' +
      (uploading ? '<div class="content-uploading">Uploading ' + uploading + (uploading === 1 ? ' file' : ' files') + '...</div>' : '') +
      (items.length
        ? '<div class="content-grid">' + items.map(itemCard).join('') + '</div>'
        : '<div class="empty-state"><div class="empty-state-text">No files yet. Upload logos, fonts, sounds, videos or anything else you want to keep here.</div></div>');
  }

  // ─── ACTIONS ────────────────────────────────────────────────

  window._uploadContent = function () {
    if (!window.CLOUDINARY_CLOUD_NAME) { showToast('Cloudinary is not configured.', 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (input.parentNode) input.parentNode.removeChild(input);
      files.forEach(function (file) {
        if (file.size > 100000000) { showToast(file.name + ' is too large (max 100MB)', 'error'); return; }
        uploading++; draw();
        // "auto" lets Cloudinary take any file: images, video and sound,
        // and everything else (fonts, PDFs) as a raw file. Signed when the
        // server is set up for it (window._cloudinaryUpload, admin.js).
        window._cloudinaryUpload(file, 'auto')
          .then(function (result) {
            // arrayUnion: several uploads finishing together can't
            // overwrite each other's entries.
            return libraryRef.set({
              items: firebase.firestore.FieldValue.arrayUnion({
                id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name: file.name,
                url: result.secure_url,
                kind: kindOf(result, file),
                format: result.format || file.name.split('.').pop() || '',
                bytes: result.bytes || file.size,
                publicId: result.public_id || '',
                resourceType: result.resource_type || '',
                uploadedAt: Date.now()
              }),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).then(load);
          })
          .then(function () { showToast(file.name + ' uploaded'); })
          .catch(function (e) { showToast('Upload failed for ' + file.name + ': ' + e.message, 'error'); })
          .then(function () { uploading--; if (window._currentTab === 'content') draw(); });
      });
    };
    input.click();
  };

  function findItem(id) { return library.items.filter(function (i) { return i.id === id; })[0]; }

  window._copyContentLink = function (id) {
    var item = findItem(id);
    if (!item) return;
    var done = function () { showToast('Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(item.url).then(done, function () { window.prompt('Copy this link:', item.url); });
    else window.prompt('Copy this link:', item.url);
  };

  window._setContentSlot = function (slotKey, id) {
    var item = findItem(id);
    if (!item) return;
    var patch = {}; patch[slotKey] = { url: item.url, itemId: item.id, format: item.format || '' };
    save(patch).then(function () {
      var slot = SLOTS.filter(function (s) { return s.key === slotKey; })[0];
      showToast((slot ? slot.label : 'Logo') + ' updated. It can take up to a minute to show.');
      draw();
    }).catch(function (e) { showToast('Could not save: ' + e.message, 'error'); });
  };

  window._clearContentSlot = function (slotKey) {
    var patch = {}; patch[slotKey] = null;
    save(patch).then(function () { showToast('Removed'); draw(); })
      .catch(function (e) { showToast('Could not save: ' + e.message, 'error'); });
  };

  window._removeContentItem = function (id) {
    var item = findItem(id);
    if (!item) return;
    if (!confirm('Remove "' + item.name + '" from Content? Anything using its link will stop showing it.')) return;
    var patch = { items: firebase.firestore.FieldValue.arrayRemove(item), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    SLOTS.forEach(function (s) { if (library[s.key] && library[s.key].itemId === id) patch[s.key] = null; });
    libraryRef.set(patch, { merge: true }).then(load).then(function () { showToast('Removed'); draw(); })
      .catch(function (e) { showToast('Could not remove: ' + e.message, 'error'); });
  };
})();
