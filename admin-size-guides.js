// ==================== SIZE GUIDES (admin) ====================
// The Size guide card on the product form (admin-products.js). A product
// can have:
// - a size chart: saved per brand in the sizeGuides collection
//   ({ vendorId, name, columns, rows }), made once and picked on every
//   product it fits. Editing a chart changes it on every product using
//   it; "Save as new chart" keeps a copy for a different fit.
// - a photo of the brand's own size guide (product.sizeGuideImage). A
//   Super Admin approves it (product.sizeGuideApproved) before the
//   product can be published; a new photo needs approving again.
//   firestore.rules enforces both.
// The shop's Size guide pop-up (product-detail.js) shows the chart and
// the approved photo.
(function () {
  'use strict';
  if (!window._adminDB) return;

  var esc = window._esc;
  var showToast = window._showToast;
  var isSuperAdmin = window._isSuperAdmin;
  var guidesRef = window._adminDB.collection('sizeGuides');

  var _guides = [];       // charts this admin can use
  var _editing = null;    // { id, vendorId, name, columns, rows } while the editor is open

  function vendorName(id) {
    var v = (window._vendorsData || []).find(function (x) { return x.id === id; });
    return v ? (v.name || v.brand || id) : id;
  }

  // The brand a new chart belongs to: the brand's own account, or the
  // brand picked on the product.
  function chartVendorId() {
    if (window._currentVendorId) return window._currentVendorId;
    var form = document.getElementById('product-form');
    var brand = form && form.brand ? form.brand.value : '';
    var v = (window._vendorsData || []).find(function (x) {
      return String(x.brand || x.name || '').toLowerCase().trim() === String(brand).toLowerCase().trim();
    });
    return v ? v.id : 'vendor-janedore';
  }

  function loadGuides() {
    var q = isSuperAdmin() ? guidesRef : guidesRef.where('vendorId', '==', window._currentVendorId || '-');
    return q.get().then(function (snap) {
      // Rows are stored as { cells: [...] } (Firestore can't hold nested
      // arrays); read back as plain arrays.
      _guides = snap.docs.map(function (d) {
        var g = Object.assign({ id: d.id }, d.data());
        g.rows = (g.rows || []).map(function (r) { return Array.isArray(r) ? r : (r && r.cells) || []; });
        return g;
      })
        .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    }).catch(function (e) { console.warn('[SIZE_GUIDES]', e.message); _guides = []; });
  }

  function optionsHtml(selectedId) {
    return '<option value="">No size chart</option>' + _guides.map(function (g) {
      var label = (g.name || 'Untitled chart') + (isSuperAdmin() ? ' · ' + vendorName(g.vendorId) : '');
      return '<option value="' + esc(g.id) + '"' + (g.id === selectedId ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  function tablePreviewHtml(g) {
    if (!g || !(g.columns || []).length) return '';
    return '<div style="overflow-x:auto;margin-top:8px;"><table style="border-collapse:collapse;font-size:11px;width:100%;">' +
      '<tr>' + g.columns.map(function (c) { return '<th style="text-align:left;padding:5px 6px;border-bottom:0.5px solid var(--border-med);white-space:nowrap;">' + esc(c) + '</th>'; }).join('') + '</tr>' +
      (g.rows || []).map(function (r) {
        return '<tr>' + g.columns.map(function (_, i) { return '<td style="padding:5px 6px;border-bottom:0.5px solid var(--border);white-space:nowrap;">' + esc(r[i] || '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table></div>';
  }

  // ---------- The card ----------

  window._sizeGuideCardHtml = function (p) {
    var img = p.sizeGuideImage || '';
    return '<div class="card" style="margin-bottom:12px;">' +
      '<div class="card-header"><span class="card-title">Size guide</span></div>' +
      '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="font-size:11px;color:var(--muted);">Shown in the Size guide pop-up on the product page. Use a size chart, a photo of your own size guide, or both.</div>' +
        '<div class="form-group" style="padding:0;">' +
          '<label>Size chart <span style="font-size:10px;color:var(--muted);">(make it once, then pick it on every product it fits)</span></label>' +
          '<select name="sizeGuideId" id="pf-size-guide" style="width:100%;" onchange="window._sgPreview()"><option value="">Loading charts…</option></select>' +
          '<div style="display:flex;gap:6px;margin-top:6px;">' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._sgEdit(false)"><i class="ph-light ph-plus"></i> New chart</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" id="pf-sg-edit" onclick="window._sgEdit(true)"><i class="ph-light ph-pencil-simple"></i> Edit chart</button>' +
          '</div>' +
          '<div id="pf-sg-preview"></div>' +
          '<div id="pf-sg-editor"></div>' +
        '</div>' +
        '<div class="form-group" style="padding:0;">' +
          '<label>Size guide photo <span style="font-size:10px;color:var(--muted);">' + (isSuperAdmin() ? '(optional)' : '(optional; a Super Admin approves it before the product can be published)') + '</span></label>' +
          '<input type="hidden" name="sizeGuideImage" id="pf-sg-image" value="' + esc(img) + '">' +
          '<input type="hidden" name="sizeGuideApproved" id="pf-sg-approved" value="' + (img && p.sizeGuideApproved === true ? 'true' : 'false') + '">' +
          '<div id="pf-sg-photo"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  window._initSizeGuideCard = function (p) {
    loadGuides().then(function () {
      var sel = document.getElementById('pf-size-guide');
      if (!sel) return;
      sel.innerHTML = optionsHtml(p.sizeGuideId || '');
      window._sgPreview();
    });
    renderPhoto();
  };

  window._sgPreview = function () {
    var sel = document.getElementById('pf-size-guide');
    var box = document.getElementById('pf-sg-preview');
    var edit = document.getElementById('pf-sg-edit');
    if (!sel || !box) return;
    var g = _guides.find(function (x) { return x.id === sel.value; });
    box.innerHTML = tablePreviewHtml(g);
    if (edit) edit.style.display = g ? '' : 'none';
  };

  // ---------- Photo ----------

  function renderPhoto() {
    var box = document.getElementById('pf-sg-photo');
    if (!box) return;
    var url = (document.getElementById('pf-sg-image') || {}).value || '';
    var approved = (document.getElementById('pf-sg-approved') || {}).value === 'true';
    if (!url) {
      box.innerHTML = '<button type="button" class="btn btn-sm btn-ghost" onclick="window._sgUploadPhoto()"><i class="ph-light ph-cloud-arrow-up" style="margin-right:4px;"></i> Upload photo</button>';
      return;
    }
    box.innerHTML =
      '<div style="display:flex;gap:12px;align-items:flex-start;">' +
        '<a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="Size guide photo" style="width:96px;height:96px;object-fit:contain;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-sm);"></a>' +
        '<div style="display:flex;flex-direction:column;gap:6px;font-size:11.5px;">' +
          (approved
            ? '<span style="color:var(--success, #1a7f37);font-weight:600;"><i class="ph ph-check-circle"></i> Approved</span>'
            : '<span style="color:var(--danger);font-weight:600;"><i class="ph ph-clock"></i> Waiting for Super Admin approval</span>' +
              '<span style="color:var(--muted);">This product can’t be published until the photo is approved.</span>') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            (isSuperAdmin() && !approved ? '<button type="button" class="btn btn-xs btn-primary" onclick="window._sgApprove(true)">Approve photo</button>' : '') +
            (isSuperAdmin() && approved ? '<button type="button" class="btn btn-xs btn-ghost" onclick="window._sgApprove(false)">Withdraw approval</button>' : '') +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._sgUploadPhoto()">Replace</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._sgRemovePhoto()">Remove</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  window._sgUploadPhoto = function () {
    window._uploadToCloudinary(function (url) {
      document.getElementById('pf-sg-image').value = url;
      // A brand's new photo needs a Super Admin's approval; a Super
      // Admin's own is approved as it's added.
      document.getElementById('pf-sg-approved').value = isSuperAdmin() ? 'true' : 'false';
      renderPhoto();
      showToast('Size guide photo added. Save the product to keep it.');
    }, false);
  };

  window._sgRemovePhoto = function () {
    document.getElementById('pf-sg-image').value = '';
    document.getElementById('pf-sg-approved').value = 'false';
    renderPhoto();
  };

  window._sgApprove = function (on) {
    if (!isSuperAdmin()) return;
    document.getElementById('pf-sg-approved').value = on ? 'true' : 'false';
    renderPhoto();
    showToast(on ? 'Photo approved. Save the product to keep it.' : 'Approval withdrawn. Save the product to keep it.');
  };

  // ---------- Chart editor ----------

  window._sgEdit = function (existing) {
    var sel = document.getElementById('pf-size-guide');
    var g = existing && sel ? _guides.find(function (x) { return x.id === sel.value; }) : null;
    _editing = g
      ? { id: g.id, vendorId: g.vendorId, name: g.name || '', columns: (g.columns || []).slice(), rows: (g.rows || []).map(function (r) { return r.slice(); }) }
      : { id: null, vendorId: chartVendorId(), name: '', columns: ['Size', 'Bust (cm)', 'Waist (cm)', 'Hips (cm)'], rows: [['', '', '', '']] };
    renderEditor();
  };

  function cell(value, attrs) {
    return '<input ' + attrs + ' value="' + esc(value || '') + '" style="width:100%;min-width:112px;padding:6px 8px;font-size:11.5px;box-sizing:border-box;">';
  }

  function renderEditor() {
    var box = document.getElementById('pf-sg-editor');
    if (!box) return;
    if (!_editing) { box.innerHTML = ''; return; }
    var e = _editing;
    box.innerHTML =
      '<div style="margin-top:10px;padding:12px;border:0.5px solid var(--border-med);border-radius:var(--r-sm);background:var(--surface2);display:flex;flex-direction:column;gap:10px;">' +
        '<div class="form-group" style="padding:0;"><label>Chart name</label><input id="sg-name" value="' + esc(e.name) + '" placeholder="e.g. Women’s dresses" oninput="window._sgSet(\'name\',null,null,this.value)"></div>' +
        '<div style="font-size:11px;color:var(--muted);">The first row is the headings, e.g. Size, Bust (cm), Waist (cm). Add a row for each size.</div>' +
        '<div style="overflow-x:auto;"><table style="border-collapse:collapse;">' +
          '<tr>' + e.columns.map(function (c, ci) {
            return '<th style="padding:2px;">' + cell(c, 'oninput="window._sgSet(\'col\',' + ci + ',null,this.value)" style="font-weight:600;"') +
              (e.columns.length > 1 ? '<button type="button" class="btn btn-xs btn-ghost" style="margin-top:2px;" onclick="window._sgRemove(\'col\',' + ci + ')" aria-label="Remove column">Remove</button>' : '') + '</th>';
          }).join('') + '</tr>' +
          e.rows.map(function (r, ri) {
            return '<tr>' + e.columns.map(function (_, ci) { return '<td style="padding:2px;">' + cell(r[ci], 'oninput="window._sgSet(\'cell\',' + ci + ',' + ri + ',this.value)"') + '</td>'; }).join('') +
              '<td style="padding:2px;"><button type="button" class="btn btn-xs btn-ghost" onclick="window._sgRemove(\'row\',' + ri + ')" aria-label="Remove row"><i class="ph-light ph-x"></i></button></td></tr>';
          }).join('') +
        '</table></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._sgAdd(\'row\')"><i class="ph-light ph-plus"></i> Row</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._sgAdd(\'col\')"><i class="ph-light ph-plus"></i> Column</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-sm btn-primary" onclick="window._sgSave(false)">' + (e.id ? 'Save chart' : 'Save new chart') + '</button>' +
          (e.id ? '<button type="button" class="btn btn-sm btn-ghost" onclick="window._sgSave(true)">Save as new chart</button>' : '') +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._sgCancel()">Cancel</button>' +
        '</div>' +
        (e.id ? '<div style="font-size:11px;color:var(--muted);">Saving changes this chart on every product that uses it. For a different fit, use Save as new chart.</div>' : '') +
      '</div>';
  }

  window._sgSet = function (kind, ci, ri, value) {
    if (!_editing) return;
    if (kind === 'name') _editing.name = value;
    else if (kind === 'col') _editing.columns[ci] = value;
    else if (kind === 'cell') _editing.rows[ri][ci] = value;
  };
  window._sgAdd = function (kind) {
    if (!_editing) return;
    if (kind === 'row') _editing.rows.push(_editing.columns.map(function () { return ''; }));
    else { _editing.columns.push(''); _editing.rows.forEach(function (r) { r.push(''); }); }
    renderEditor();
  };
  window._sgRemove = function (kind, i) {
    if (!_editing) return;
    if (kind === 'row') _editing.rows.splice(i, 1);
    else { _editing.columns.splice(i, 1); _editing.rows.forEach(function (r) { r.splice(i, 1); }); }
    renderEditor();
  };
  window._sgCancel = function () { _editing = null; renderEditor(); };

  window._sgSave = function (asNew) {
    var e = _editing;
    if (!e) return;
    var columns = e.columns.map(function (c) { return String(c || '').trim(); });
    var rows = e.rows.map(function (r) { return columns.map(function (_, i) { return String(r[i] || '').trim(); }); })
      .filter(function (r) { return r.some(Boolean); });
    var name = String(e.name || '').trim();
    if (!name) { showToast('Give the chart a name', 'error'); return; }
    if (columns.some(function (c) { return !c; })) { showToast('Fill in every heading, or remove the empty column', 'error'); return; }
    if (!rows.length) { showToast('Add at least one size', 'error'); return; }
    var data = { vendorId: e.vendorId, name: name, columns: columns, rows: rows, updatedAt: new Date().toISOString() };
    var ref = (!asNew && e.id) ? guidesRef.doc(e.id) : guidesRef.doc();
    ref.set(toStored(data)).then(function () {
      showToast('Size chart saved');
      _editing = null;
      renderEditor();
      return loadGuides();
    }).then(function () {
      var sel = document.getElementById('pf-size-guide');
      if (sel) { sel.innerHTML = optionsHtml(ref.id); window._sgPreview(); }
    }).catch(function (err) { showToast('Error: ' + err.message, 'error'); });
  };

  function toStored(g) {
    return Object.assign({}, g, { rows: g.rows.map(function (r) { return { cells: r }; }) });
  }

  // ---------- Saving the product ----------

  // Fields for the product, and whether it may be published: a photo has
  // to be approved first.
  window._sizeGuideFormData = function (form) {
    var image = form.sizeGuideImage ? String(form.sizeGuideImage.value || '') : '';
    return {
      sizeGuideId: form.sizeGuideId ? form.sizeGuideId.value || '' : '',
      sizeGuideImage: image,
      sizeGuideApproved: !!image && !!form.sizeGuideApproved && form.sizeGuideApproved.value === 'true'
    };
  };

  // Products list: a Super Admin sees which products wait on a photo.
  window._sizeGuideNeedsApproval = function (p) { return !!(p && p.sizeGuideImage && p.sizeGuideApproved !== true); };
})();
