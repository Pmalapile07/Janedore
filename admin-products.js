(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc               = window._esc;
  var safeEl            = window._safeEl;
  var safeUrl            = window._safeUrl;
  var fmt               = window._fmt;
  var showToast         = window._showToast;
  var isSuperAdmin      = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var productsRef       = window._productsRef;

  var CATEGORIES = [
    { group: 'Clothing',         items: ['dresses','tops','bottoms','jackets','coats','sets','jumpsuits','skirts','trousers','shorts','knitwear','swimwear','activewear','lingerie'] },
    { group: 'Footwear',         items: ['heels','flats','boots','sneakers','sandals','mules','loafers'] },
    { group: 'Bags',             items: ['handbags','clutches','tote-bags','shoulder-bags','crossbody-bags','backpacks','mini-bags'] },
    { group: 'Accessories',      items: ['sunglasses','eyewear','jewelry','scarves','belts','hats','hair-accessories','gloves','iphone-cases'] },
    { group: 'Hair',             items: ['extensions','clip-ins','hair-pieces'] },
    { group: 'Beauty & Scent',   items: ['parfum','body-care','candles','homeware'] }
  ];

  var ALL_CATEGORY_ITEMS = CATEGORIES.reduce(function(acc, g) { return acc.concat(g.items); }, []);

  var SIZE_UNITS = ['Custom','OS','XS–XXL','UK','EU','US','cm','inches'];

  var SIZE_PRESETS = {
    'clothing':    { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'dresses':     { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'tops':        { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'bottoms':     { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'jackets':     { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'coats':       { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'sets':        { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'jumpsuits':   { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'skirts':      { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'trousers':    { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'shorts':      { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'knitwear':    { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'swimwear':    { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'activewear':  { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'lingerie':    { unit: 'XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    'heels':       { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'flats':       { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'boots':       { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'sneakers':    { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'sandals':     { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'mules':       { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'loafers':     { unit: 'UK', sizes: 'UK 3, UK 4, UK 5, UK 6, UK 7, UK 8' },
    'jewelry':     { unit: 'OS', sizes: 'OS' },
    'sunglasses':  { unit: 'OS', sizes: 'OS' },
    'eyewear':     { unit: 'OS', sizes: 'OS' },
    'scarves':     { unit: 'OS', sizes: 'OS' },
    'belts':       { unit: 'Custom', sizes: 'XS, S, M, L' },
    'hats':        { unit: 'Custom', sizes: 'S/M, M/L, L/XL' },
    'hair-accessories': { unit: 'OS', sizes: 'OS' },
    'gloves':      { unit: 'Custom', sizes: 'S, M, L' },
    'iphone-cases': { unit: 'Custom', sizes: 'iPhone 13, iPhone 14, iPhone 15, iPhone 16' },
    'extensions':  { unit: 'inches', sizes: '16, 18, 20, 22, 24' },
    'clip-ins':    { unit: 'inches', sizes: '16, 18, 20, 22, 24' },
    'hair-pieces': { unit: 'OS', sizes: 'OS' },
    'parfum':      { unit: 'OS', sizes: 'OS' },
    'body-care':   { unit: 'OS', sizes: 'OS' },
    'candles':     { unit: 'OS', sizes: 'OS' },
    'homeware':    { unit: 'OS', sizes: 'OS' },
    'handbags':    { unit: 'OS', sizes: 'OS' },
    'clutches':    { unit: 'OS', sizes: 'OS' },
    'tote-bags':   { unit: 'OS', sizes: 'OS' },
    'shoulder-bags': { unit: 'OS', sizes: 'OS' },
    'crossbody-bags': { unit: 'OS', sizes: 'OS' },
    'backpacks':   { unit: 'OS', sizes: 'OS' },
    'mini-bags':   { unit: 'OS', sizes: 'OS' }
  };

  var BRANDS   = ['JANEDORE','NIRIUS CO','THATO'];
  var STATUSES = ['active', 'draft', 'archived'];

  function markdownToHtml(text) {
    if (!text) return '';
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    var lines = text.split('\n');
    var output = [];
    var inList = false;
    lines.forEach(function(line) {
      var trimmed = line.trim();
      if (/^[\*\-]\s+/.test(trimmed)) {
        if (!inList) { output.push('<ul>'); inList = true; }
        output.push('<li>' + trimmed.replace(/^[\*\-]\s+/, '') + '</li>');
      } else {
        if (inList) { output.push('</ul>'); inList = false; }
        if (trimmed.length > 0) output.push('<p>' + trimmed + '</p>');
      }
    });
    if (inList) output.push('</ul>');
    return output.join('');
  }

  // ── SLUG HELPERS ─────────────────────────────────────────────
  // New products get a slug generated from their name. Existing products
  // keep whatever slug they already have — it is never regenerated on edit.

  function _slugify(name) {
    return (name || '').toString().toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'product';
  }

  function _uniqueSlug(base, allProducts, excludeId) {
    var taken = {};
    allProducts.forEach(function(p) {
      if (p.slug && p.id !== excludeId) taken[p.slug] = true;
    });
    var slug = base, n = 2;
    while (taken[slug]) { slug = base + '-' + n; n++; }
    return slug;
  }

  window._uploadToCloudinary = function(onSuccess) {
    var cloudName    = window.CLOUDINARY_CLOUD_NAME;
    var uploadPreset = window.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName)    { showToast('Cloudinary cloud name not configured.', 'error'); return; }
    if (!uploadPreset) { showToast('Cloudinary upload preset not configured.', 'error'); return; }
    var widget = window.cloudinary.createUploadWidget(
      { cloudName: cloudName, uploadPreset: uploadPreset, sources: ['local'], multiple: true, clientAllowedFormats: ['png','jpg','jpeg','webp'], maxFileSize: 20000000, showUploadMoreButton: true },
      function(error, result) {
        if (error) { showToast('Upload failed: ' + (error.message || 'Unknown error'), 'error'); return; }
        if (result && result.event === 'success') { onSuccess(result.info.secure_url); }
      }
    );
    widget.open();
  };

  function saveProduct(productData) {
    if (!window._currentUser || !window._roleResolved) { showToast('Not authenticated', 'error'); return; }
    if (!isSuperAdmin()) {
      if (!window._currentVendorId) { showToast('No vendor scope. Cannot save product.', 'error'); return; }
      productData.vendorId = window._currentVendorId;
    }
    var ref = productData.id ? productsRef.doc(productData.id) : productsRef.doc(productData.sku || ('prod-' + Date.now()));
    productData.id = ref.id;
    ref.set(productData, { merge: true }).then(function() {
      showToast('Product saved');
      window._loadProducts();
      window._renderProductsTab();
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  }

  window.deleteProduct = function(productId) {
    if (!requireSuperAdmin('deleteProduct')) return;
    if (!confirm('Delete this product? This cannot be undone.')) return;
    productsRef.doc(productId).delete().then(function() {
      showToast('Product deleted');
      window._loadProducts();
      window._renderProductsTab();
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window.duplicateProduct = function(productId) {
    var p = (window._allProducts || []).find(function(x){ return x.id === productId; });
    if (!p) return;
    var copy = Object.assign({}, p);
    copy.id = ''; copy.name = copy.name + ' (Copy)'; copy.sku = copy.sku + '-COPY';
    copy.slug = _uniqueSlug(_slugify(copy.name), window._allProducts || [], null);
    copy.status = 'draft'; copy.createdAt = new Date().toISOString(); copy.updatedAt = new Date().toISOString();
    var ref = productsRef.doc(); copy.id = ref.id;
    ref.set(copy).then(function() { showToast('Product duplicated'); window._loadProducts(); }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window.archiveProduct = function(productId) {
    productsRef.doc(productId).update({ status: 'archived', updatedAt: new Date().toISOString() })
      .then(function() { showToast('Product archived'); window._loadProducts(); window._renderProductsTab(); })
      .catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._renderProductsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    var allProducts = window._allProducts || [];
    var hasAny = allProducts.length > 0;
    var canAdd = isSuperAdmin() || window._currentUserRole === 'VENDOR';

    mc.innerHTML =
      (window._currentUserRole === 'VENDOR' ? '<div class="vendor-scope-bar">Showing your brand products only</div>' : '') +
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Products</div>' +
        '<div class="section-actions">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._refreshProducts()" title="Refresh"><i class="ph-light ph-arrows-clockwise"></i> Refresh</button>' +
          (hasAny && canAdd ? '<button class="btn btn-sm btn-primary" onclick="window._openProductForm(null)">Add product</button>' : '') +
        '</div>' +
      '</div>' +
      (hasAny ? (
        '<div class="toolbar" style="margin-bottom:12px;">' +
          '<input class="search-input" id="product-search" placeholder="Search products..." oninput="window._filterProducts()">' +
          '<select class="filter-select" id="product-cat-filter" onchange="window._filterProducts()">' +
            '<option value="">All Categories</option>' +
            ALL_CATEGORY_ITEMS.map(function(c){ return '<option value="'+c+'">'+c.replace(/-/g,' ').replace(/\b\w/g,function(l){return l.toUpperCase();})+'</option>'; }).join('') +
          '</select>' +
          '<select class="filter-select" id="product-status-filter" onchange="window._filterProducts()">' +
            '<option value="">All Statuses</option>' +
            STATUSES.map(function(s){ return '<option value="'+s+'">'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>'; }).join('') +
          '</select>' +
          '<div class="toolbar-spacer"></div>' +
          '<span id="products-filtered-count" class="ui-label"></span>' +
        '</div>' +
        '<div class="product-list" id="products-list">' + allProducts.map(renderProductRow).join('') + '</div>'
      ) : renderEmptyState());
  };

  window._refreshProducts = function() { showToast('Refreshing...'); window._loadProducts(); };

  function renderEmptyState() {
    if (window._currentUserRole === 'ADMIN') {
      return '<div class="orders-empty-state"><div class="orders-empty-icon"><i class="ph-light ph-package"></i></div><div class="orders-empty-title">No products yet</div><div class="orders-empty-sub">Products from all brands will appear here once added.</div></div>';
    }
    return '<div class="orders-empty-state"><div class="orders-empty-icon"><i class="ph-light ph-package"></i></div><div class="orders-empty-title">Add your first product</div><div class="orders-empty-sub">Your products will appear here.</div><button class="orders-empty-btn" onclick="window._openProductForm(null)"><i class="ph-light ph-plus" style="font-size:15px;"></i> Add product</button></div>';
  }

  function renderProductRow(p) {
    var firstVariant = (p.variants && p.variants[0]) || {};
    var firstImages  = firstVariant.images || { model:[], ghost:[], detail:[] };
    var allImages = p.category === 'jewelry'
      ? [].concat(firstImages.model||[], firstImages.ghost||[], firstImages.detail||[])
      : [].concat(firstImages.ghost||[], firstImages.model||[], firstImages.detail||[]);
    var thumb = safeUrl(allImages[0] || '');
    return '<div class="product-row">' +
      '<div onclick="window._openProductForm(\'' + esc(p.id) + '\')" style="flex:1;min-width:0;display:flex;align-items:center;cursor:pointer;">' +
        (thumb ? '<img src="'+esc(thumb)+'" class="pi-thumb" onerror="this.style.display=\'none\'" style="width:40px;height:40px;object-fit:cover;border-radius:4px;margin-right:12px;flex-shrink:0;">' : '<div style="width:40px;height:40px;border-radius:4px;background:var(--surface2);margin-right:12px;flex-shrink:0;"></div>') +
        '<div style="flex:1;min-width:0;">' +
          '<div class="pi-name">' + esc(p.name) + '</div>' +
          '<div class="pi-meta">' + esc(p.brand||'') + ' · ' + esc(p.category||'') + ' · ' + fmt(p.price) +
            (p.stock <= 3 ? ' · <span style="color:var(--danger);font-weight:600;">' + esc(String(p.stock)) + ' left</span>' : ' · ' + esc(String(p.stock)) + ' in stock') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span class="badge badge-' + esc(p.status||'draft') + '">' + esc(p.status||'draft') + '</span>' +
        '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();duplicateProduct(\'' + esc(p.id) + '\')" title="Duplicate"><i class="ph-light ph-copy"></i></button>' +
        '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();archiveProduct(\'' + esc(p.id) + '\')" title="Archive"><i class="ph-light ph-archive"></i></button>' +
      '</div>' +
    '</div>';
  }

  window._filterProducts = function() {
    var allProducts = window._allProducts || [];
    var search  = (safeEl('product-search')        || {}).value  || '';
    var cat     = (safeEl('product-cat-filter')    || {}).value  || '';
    var status  = (safeEl('product-status-filter') || {}).value  || '';
    search = search.toLowerCase();
    var filtered = allProducts.filter(function(p) {
      if (cat    && p.category !== cat)    return false;
      if (status && p.status   !== status) return false;
      if (search && (p.name+p.brand+(p.sku||'')).toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
    var countEl = safeEl('products-filtered-count');
    if (countEl) countEl.textContent = filtered.length + ' product' + (filtered.length !== 1 ? 's' : '');
    var listEl = safeEl('products-list');
    if (listEl) listEl.innerHTML = filtered.map(renderProductRow).join('');
  };

  // ── MEDIA POOL ───────────────────────────────────────────────

  var _mediaPool = [];

  function _poolFromProduct(p) {
    var seen = {}; var pool = [];
    (p.variants || []).forEach(function(v) {
      var imgs = v.images || {};
      [].concat(imgs.model||[], imgs.ghost||[], imgs.detail||[]).forEach(function(u) {
        var s = safeUrl(u);
        if (s && !seen[s]) { seen[s] = true; pool.push(s); }
      });
    });
    return pool;
  }

  function _renderMediaPool() {
    var grid = safeEl('media-pool-grid');
    if (!grid) return;
    if (_mediaPool.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:28px;background:var(--surface2);border:0.5px dashed var(--border-med);border-radius:var(--r-sm);color:var(--muted);font-size:11px;"><i class="ph-light ph-image" style="font-size:28px;display:block;margin-bottom:6px;"></i>No images yet. Click upload to add images.</div>';
      return;
    }
    grid.innerHTML = _mediaPool.map(function(url, i) {
      return '<div style="position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;border:0.5px solid var(--border-light);">' +
        '<img src="' + esc(url) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.opacity=\'0.3\'">' +
        '<button type="button" onclick="window._removeFromPool(' + i + ')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);border:none;color:#fff;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;" title="Remove"><i class="ph-light ph-x" style="font-size:10px;"></i></button>' +
      '</div>';
    }).join('');
    _renderAllVariantImageSelectors();
  }

  window._removeFromPool = function(index) {
    var removed = _mediaPool.splice(index, 1)[0];
    var container = safeEl('variants-container');
    if (container) {
      container.querySelectorAll('.variant-block').forEach(function(block) {
        ['model','ghost','detail'].forEach(function(type) {
          var sel = block.querySelector('[data-img-type="' + type + '"]');
          if (!sel) return;
          Array.from(sel.options).forEach(function(opt) { if (opt.value === removed) opt.remove(); });
        });
      });
    }
    _renderMediaPool();
  };

  window._uploadToPool = function() {
    window._uploadToCloudinary(function(url) {
      if (_mediaPool.indexOf(url) === -1) _mediaPool.push(url);
      _renderMediaPool();
      showToast('Image added to media');
    });
  };

  // ── VARIANT IMAGE SELECTORS ──────────────────────────────────

  function _buildVariantImageSelector(type, variantIndex, selectedUrls) {
    selectedUrls = selectedUrls || [];
    var label = type === 'model' ? 'Model shots' : type === 'ghost' ? 'Ghost / flat lay' : 'Detail shots';
    var options = _mediaPool.map(function(url) {
      var isSelected = selectedUrls.indexOf(url) !== -1;
      var filename = url.split('/').pop().split('?')[0].substring(0, 28);
      return '<option value="' + esc(url) + '"' + (isSelected ? ' selected' : '') + '>' + esc(filename) + '</option>';
    }).join('');
    return '<div style="margin-bottom:8px;">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px;">' + label + '</div>' +
      (options
        ? '<select multiple data-img-type="' + type + '" data-variant="' + variantIndex + '" style="width:100%;min-height:60px;max-height:100px;font-size:11px;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-sm);padding:4px;" onchange="window._onVariantImgChange(' + variantIndex + ')">' + options + '</select><div style="font-size:10px;color:var(--muted);margin-top:3px;">Hold Ctrl / Cmd to select multiple</div>'
        : '<div style="font-size:11px;color:var(--muted);padding:6px;background:var(--surface2);border-radius:var(--r-sm);">Upload images above first</div>'
      ) +
    '</div>';
  }

  window._onVariantImgChange = function(variantIndex) { _refreshVariantPreviewStrip(variantIndex); };

  function _refreshVariantPreviewStrip(variantIndex) {
    var strip = document.getElementById('variant-preview-strip-' + variantIndex);
    if (!strip) return;
    var cat = (document.querySelector('[name="category"]') || {}).value || 'dresses';
    var block = document.querySelector('[data-variant-index="' + variantIndex + '"]');
    if (!block) return;
    var modelSel  = block.querySelector('[data-img-type="model"]');
    var ghostSel  = block.querySelector('[data-img-type="ghost"]');
    var detailSel = block.querySelector('[data-img-type="detail"]');
    var modelUrls  = modelSel  ? Array.from(modelSel.selectedOptions).map(function(o){ return o.value; })  : [];
    var ghostUrls  = ghostSel  ? Array.from(ghostSel.selectedOptions).map(function(o){ return o.value; })  : [];
    var detailUrls = detailSel ? Array.from(detailSel.selectedOptions).map(function(o){ return o.value; }) : [];
    var combined = cat === 'jewelry' ? [].concat(modelUrls, ghostUrls, detailUrls) : [].concat(ghostUrls, modelUrls, detailUrls);
    if (combined.length === 0) { strip.innerHTML = '<div style="font-size:10.5px;color:var(--muted);">No images assigned</div>'; return; }
    strip.innerHTML = '<div style="display:flex;gap:5px;flex-wrap:wrap;">' + combined.map(function(url) {
      return '<img src="' + esc(url) + '" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:0.5px solid var(--border-light);" onerror="this.style.display=\'none\'">';
    }).join('') + '</div>';
  }

  function _renderAllVariantImageSelectors() {
    var container = safeEl('variants-container');
    if (!container) return;
    container.querySelectorAll('.variant-block').forEach(function(block) {
      var vi = parseInt(block.getAttribute('data-variant-index'), 10);
      var getSelected = function(type) {
        var sel = block.querySelector('[data-img-type="' + type + '"]');
        return sel ? Array.from(sel.selectedOptions).map(function(o){ return o.value; }) : [];
      };
      var imgSelWrap = block.querySelector('.variant-img-selectors');
      if (imgSelWrap) {
        imgSelWrap.innerHTML =
          _buildVariantImageSelector('model',  vi, getSelected('model'))  +
          _buildVariantImageSelector('ghost',  vi, getSelected('ghost'))  +
          _buildVariantImageSelector('detail', vi, getSelected('detail'));
      }
    });
  }

  // ── SIZE PRESET HELPER ───────────────────────────────────────

  window._applySizePreset = function() {
    var catEl  = document.querySelector('[name="category"]');
    var unitEl = safeEl('pf-size-unit');
    var sizesEl = safeEl('pf-sizes-input');
    if (!catEl || !unitEl || !sizesEl) return;
    var cat = catEl.value;
    var preset = SIZE_PRESETS[cat];
    if (preset) {
      unitEl.value  = preset.unit;
      sizesEl.value = preset.sizes;
    }
    _updateSizePreview();
  };

  window._updateSizePreview = function() {
    var unitEl  = safeEl('pf-size-unit');
    var sizesEl = safeEl('pf-sizes-input');
    var preview = safeEl('pf-size-preview');
    if (!unitEl || !sizesEl || !preview) return;
    var unit  = unitEl.value;
    var sizes = sizesEl.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    if (sizes.length === 0) { preview.innerHTML = '<span style="color:var(--muted);font-size:11px;">No sizes yet</span>'; return; }
    preview.innerHTML = sizes.map(function(s) {
      var label = (unit === 'OS' || unit === 'XS–XXL' || unit === 'Custom') ? s : unit + ' ' + s;
      return '<span style="display:inline-block;border:0.8px solid #111;padding:6px 10px;font-size:10px;letter-spacing:0.05em;margin:3px;">' + esc(label) + '</span>';
    }).join('');
  };

  // ── OPEN PRODUCT FORM ────────────────────────────────────────

  window._openNewProductModal = function() { window._openProductForm(null); };
  window._openProductModal    = function(id) { window._openProductForm(id); };

  window._openProductForm = function(productOrId) {
    var allProducts = window._allProducts || [];
    var p;
    if (typeof productOrId === 'string') {
      p = allProducts.find(function(x){ return x.id === productOrId; });
      if (!p) { showToast('Product not found', 'error'); return; }
    } else { p = productOrId; }

    p = p || {
      id:'', sku:'', name:'', brand:'JANEDORE', vendorId:'janedore',
      category:'dresses', price:0, salePrice:null, badge:'', sizes:[], sizeUnit:'XS–XXL', stock:0,
      status:'draft', featured:false, description:'', productFeatures:'',
      compositionCare:'', shippingReturns:'', measurements:'', tags:[], shippingWeight:'', internationalShipping:false,
      variants:[{ color:'', swatch:'#111', images:{ model:[], ghost:[], detail:[] } }]
    };

    if (p.variants && Array.isArray(p.variants)) {
      p.variants = p.variants.map(function(v) {
        if (!v.images || typeof v.images !== 'object') v.images = { model:[], ghost:[], detail:[] };
        else { v.images.model = Array.isArray(v.images.model) ? v.images.model : []; v.images.ghost = Array.isArray(v.images.ghost) ? v.images.ghost : []; v.images.detail = Array.isArray(v.images.detail) ? v.images.detail : []; }
        return v;
      });
    }

    _mediaPool = _poolFromProduct(p);
    var mc = safeEl('main-content');
    if (!mc) return;
    var isNew = !p.id;

    // Build category options with groups
    var catOptions = CATEGORIES.map(function(g) {
      return '<optgroup label="' + esc(g.group) + '">' +
        g.items.map(function(c) {
          var label = c.replace(/-/g,' ').replace(/\b\w/g, function(l){ return l.toUpperCase(); });
          return '<option value="' + esc(c) + '"' + (p.category === c ? ' selected' : '') + '>' + label + '</option>';
        }).join('') +
      '</optgroup>';
    }).join('');

    var currentSizes = (p.sizes || []).join(', ');
    var currentUnit  = p.sizeUnit || 'XS–XXL';

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<button type="button" class="btn btn-ghost" onclick="window._renderProductsTab()"><i class="ph-light ph-arrow-left" style="margin-right:4px;"></i> Cancel</button>' +
        '<div style="font-size:13px;font-weight:500;color:var(--text);">' + (isNew ? 'Add product' : 'Edit product') + '</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'product-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +

      '<form id="product-form" onsubmit="window._handleProductSubmit(event,\'' + esc(p.id) + '\')">' +

      // 1. TITLE & DESCRIPTION
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Product info</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;"><label>Title</label><input name="name" value="' + esc(p.name) + '" placeholder="e.g. Raffle Brandy Dress" required></div>' +
          '<div class="form-group" style="padding:0;"><label>Description <span style="font-size:10px;color:var(--muted);">— supports * bullets and **bold**</span></label><textarea name="description" style="min-height:80px;">' + esc(p.description||'') + '</textarea></div>' +
          '<div class="form-group" style="padding:0;"><label>Brand</label><select name="brand" style="width:100%;">' + BRANDS.map(function(b){ return '<option value="'+b+'"'+(p.brand===b?' selected':'')+'>'+b+'</option>'; }).join('') + '</select></div>' +
          '<div class="form-group" style="padding:0;"><label>Category</label><select name="category" style="width:100%;" onchange="window._applySizePreset()">' + catOptions + '</select></div>' +
          '<div class="form-group" style="padding:0;"><label>Product features</label><textarea name="productFeatures" style="min-height:60px;">' + esc(p.productFeatures||'') + '</textarea></div>' +
          '<div class="form-group" style="padding:0;"><label>Composition &amp; care</label><textarea name="compositionCare" style="min-height:60px;">' + esc(p.compositionCare||'') + '</textarea></div>' +
          '<div class="form-group" style="padding:0;"><label>Measurements</label><input name="measurements" value="' + esc(p.measurements||'') + '" placeholder="e.g. Model wears size S. Length: 98cm."></div>' +
        '</div>' +
      '</div>' +

      // 2. MEDIA
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header" style="justify-content:space-between;"><span class="card-title">Media</span><button type="button" class="btn btn-sm btn-ghost" onclick="window._uploadToPool()"><i class="ph-light ph-cloud-arrow-up" style="margin-right:4px;"></i> Upload images</button></div>' +
        '<div style="padding:12px 16px;"><div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Upload all product images here first, then assign them to each variant below.</div><div id="media-pool-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;"></div></div>' +
      '</div>' +

      // 3. PRICING
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Pricing</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;"><label>Price (R)</label><input name="price" type="number" min="0" step="0.01" value="' + esc(String(p.price||0)) + '" required oninput="window._pfUpdateMargin()"></div>' +
          '<div class="form-group" style="padding:0;"><label>Sale price (R) <span style="font-size:10px;color:var(--muted);">— leave blank if not on sale</span></label><input name="salePrice" type="number" min="0" step="0.01" value="' + esc(String(p.salePrice||'')) + '" oninput="window._pfUpdateMargin()"></div>' +
          '<div id="pf-margin-display" style="background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font-size:11.5px;display:none;"></div>' +
        '</div>' +
      '</div>' +

      // 4. INVENTORY
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Inventory</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;"><label>SKU</label><input name="sku" value="' + esc(p.sku||'') + '" placeholder="e.g. DRS-RBB-001"></div>' +
          '<div class="form-group" style="padding:0;"><label>Stock quantity</label><div style="display:flex;align-items:center;gap:10px;"><button type="button" class="no-qty-btn" onclick="window._pfChangeStock(-1)"><i class="ph-light ph-minus"></i></button><input name="stock" id="pf-stock" type="number" min="0" value="' + esc(String(p.stock||0)) + '" style="width:80px;text-align:center;" oninput="window._pfUpdateStockLabel()"><button type="button" class="no-qty-btn" onclick="window._pfChangeStock(1)"><i class="ph-light ph-plus"></i></button><span id="pf-stock-label" style="font-size:11px;color:var(--muted);"></span></div></div>' +
        '</div>' +
      '</div>' +

      // 5. SIZES
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header" style="justify-content:space-between;"><span class="card-title">Sizes</span><button type="button" class="btn btn-xs btn-ghost" onclick="window._applySizePreset()">Auto-fill from category</button></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Size unit</label>' +
            '<select id="pf-size-unit" name="sizeUnit" style="width:100%;" onchange="window._updateSizePreview()">' +
              SIZE_UNITS.map(function(u){ return '<option value="'+u+'"'+(currentUnit===u?' selected':'')+'>'+u+'</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Sizes <span style="font-size:10px;color:var(--muted);">— comma separated</span></label>' +
            '<input id="pf-sizes-input" name="sizes" value="' + esc(currentSizes) + '" placeholder="e.g. UK 3, UK 4, UK 5 or XS, S, M, L" oninput="window._updateSizePreview()">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Preview</label>' +
            '<div id="pf-size-preview" style="padding:8px 0;min-height:36px;"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 6. VARIANTS
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header" style="justify-content:space-between;"><span class="card-title">Variants</span><button type="button" class="btn btn-xs btn-ghost" onclick="window._addVariant()"><i class="ph-light ph-plus"></i> Add variant</button></div>' +
        '<div id="variants-container" style="padding:0 16px 12px;">' +
          (p.variants||[]).map(function(v, i){ return buildVariantBlock(v, i, p.category); }).join('') +
        '</div>' +
      '</div>' +

      // 7. SHIPPING
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Shipping</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;"><label>Weight (kg)</label><input name="shippingWeight" type="number" min="0" step="0.01" value="' + esc(String(p.shippingWeight||'')) + '" placeholder="e.g. 0.5"></div>' +
          '<div class="form-group" style="padding:0;"><label>Shipping &amp; returns note</label><input name="shippingReturns" value="' + esc(p.shippingReturns||'') + '" placeholder="e.g. Free shipping over R1000"></div>' +
          '<div class="form-group" style="padding:0;"><label>International shipping</label><select name="internationalShipping" style="width:100%;"><option value="false"'+(p.internationalShipping?'':' selected')+'>No</option><option value="true"'+(p.internationalShipping?' selected':'')+'>Yes</option></select></div>' +
        '</div>' +
      '</div>' +

      // 8. STATUS & VISIBILITY
      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Status &amp; visibility</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;"><label>Product status</label><select name="status" style="width:100%;">' + STATUSES.map(function(s){ return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>'; }).join('') + '</select></div>' +
          '<div class="form-group" style="padding:0;"><label>Badge</label><select name="badge" style="width:100%;"><option value="">None</option>' + ['new','sale','sold','pre-order'].map(function(b){ return '<option value="'+b+'"'+(p.badge===b?' selected':'')+'>'+b.charAt(0).toUpperCase()+b.slice(1)+'</option>'; }).join('') + '</select></div>' +
          '<div class="form-group" style="padding:0;"><label>Featured on homepage</label><select name="featured" style="width:100%;"><option value="false"'+(p.featured?'':' selected')+'>No</option><option value="true"'+(p.featured?' selected':'')+'>Yes</option></select></div>' +
        '</div>' +
      '</div>' +

      // 9. TAGS
      '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-header"><span class="card-title">Tags</span></div>' +
        '<div style="padding:12px 16px;"><div class="form-group" style="padding:0;"><label>Tags <span style="font-size:10px;color:var(--muted);">— comma separated</span></label><input name="tags" value="' + esc((p.tags||[]).join(', ')) + '" placeholder="e.g. summer, linen, sale"></div></div>' +
      '</div>' +

      '</form>';

    _renderMediaPool();
    window._pfUpdateMargin();
    window._pfUpdateStockLabel();
    window._updateSizePreview();
  };

  // ── VARIANT BLOCK ─────────────────────────────────────────────

  function buildVariantBlock(v, index, category) {
    v = v || {};
    var images     = v.images || { model:[], ghost:[], detail:[] };
    var modelUrls  = Array.isArray(images.model)  ? images.model  : [];
    var ghostUrls  = Array.isArray(images.ghost)  ? images.ghost  : [];
    var detailUrls = Array.isArray(images.detail) ? images.detail : [];

    return '<div class="variant-block" data-variant-index="' + index + '" style="padding-top:14px;margin-top:' + (index > 0 ? '14px' : '4px') + ';border-top:' + (index > 0 ? '0.5px solid var(--border)' : 'none') + ';">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">Variant ' + (index+1) + '</div>' +
        '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--danger);" onclick="window._removeVariant('+index+')">Remove</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px;">' +
        '<div class="form-group" style="padding:0;flex:1;"><label>Color name</label><input name="variant-color-'+index+'" value="'+esc(v.color||'')+'" placeholder="e.g. Black"></div>' +
        '<div class="form-group" style="padding:0;width:110px;"><label>Swatch</label><div style="display:flex;gap:7px;align-items:center;"><input name="variant-swatch-'+index+'" value="'+esc(v.swatch||'#111')+'" placeholder="#111" style="flex:1;min-width:0;" oninput="this.nextElementSibling.value=this.value"><input type="color" value="'+esc(v.swatch||'#111')+'" style="width:34px;height:34px;padding:2px;border:0.5px solid var(--border-med);cursor:pointer;border-radius:6px;flex-shrink:0;" oninput="document.querySelector(\'[name=variant-swatch-'+index+']\').value=this.value"></div></div>' +
      '</div>' +
      '<div class="variant-img-selectors">' +
        _buildVariantImageSelector('model',  index, modelUrls)  +
        _buildVariantImageSelector('ghost',  index, ghostUrls)  +
        _buildVariantImageSelector('detail', index, detailUrls) +
      '</div>' +
      '<div id="variant-preview-strip-' + index + '" style="margin-top:8px;"><div style="font-size:10.5px;color:var(--muted);">No images assigned</div></div>' +
    '</div>';
  }

  // ── PRICING / STOCK HELPERS ───────────────────────────────────

  window._pfUpdateMargin = function() {
    var priceEl     = document.querySelector('[name="price"]');
    var salePriceEl = document.querySelector('[name="salePrice"]');
    var displayEl   = safeEl('pf-margin-display');
    if (!priceEl || !displayEl) return;
    var price     = parseFloat(priceEl.value) || 0;
    var salePrice = salePriceEl && salePriceEl.value ? parseFloat(salePriceEl.value) : null;
    var effective = salePrice !== null ? salePrice : price;
    if (price <= 0) { displayEl.style.display = 'none'; return; }
    var discount = salePrice !== null ? Math.round((1 - salePrice / price) * 100) : 0;
    displayEl.style.display = 'block';
    displayEl.innerHTML =
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--muted);">Selling price</span><span>R' + effective.toLocaleString('en-ZA') + '</span></div>' +
      (salePrice !== null ? '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--muted);">Discount</span><span style="color:var(--danger);">-' + discount + '%</span></div>' : '') +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">Original price</span><span>R' + price.toLocaleString('en-ZA') + '</span></div>';
  };

  window._pfChangeStock = function(delta) {
    var el = safeEl('pf-stock');
    if (!el) return;
    el.value = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
    window._pfUpdateStockLabel();
  };

  window._pfUpdateStockLabel = function() {
    var el    = safeEl('pf-stock');
    var label = safeEl('pf-stock-label');
    if (!el || !label) return;
    var qty = parseInt(el.value, 10) || 0;
    if (qty === 0)     label.textContent = 'Out of stock';
    else if (qty <= 3) label.textContent = qty + ' left — low stock';
    else               label.textContent = qty + ' in stock';
  };

  // ── VARIANT ADD / REMOVE ──────────────────────────────────────

  window._addVariant = function() {
    var c = safeEl('variants-container');
    if (!c) return;
    var cat = (document.querySelector('[name="category"]') || {}).value || 'dresses';
    c.insertAdjacentHTML('beforeend', buildVariantBlock({ images:{ model:[], ghost:[], detail:[] } }, c.children.length, cat));
  };

  window._removeVariant = function(index) {
    var container = safeEl('variants-container');
    if (!container) return;
    var blocks = container.querySelectorAll('.variant-block');
    if (blocks.length <= 1) { showToast('Need at least one variant', 'info'); return; }
    var block = container.querySelector('[data-variant-index="' + index + '"]');
    if (block) {
      block.remove();
      container.querySelectorAll('.variant-block').forEach(function(b, i) {
        b.setAttribute('data-variant-index', i);
        var label = b.querySelector('[style*="Variant"]');
        if (label) label.textContent = 'Variant ' + (i+1);
      });
    }
  };

  // ── SUBMIT ────────────────────────────────────────────────────

  window._handleProductSubmit = function(e, existingId) {
    e.preventDefault();
    var form            = e.target;
    var allProducts     = window._allProducts || [];
    var existingProduct = existingId ? allProducts.find(function(p){ return p.id === existingId; }) : null;

    var price     = parseFloat(form.price.value);
    var stock     = parseInt(form.stock.value, 10);
    var salePrice = form.salePrice.value ? parseFloat(form.salePrice.value) : null;

    if (isNaN(price) || price < 0) { showToast('Invalid price', 'error'); return; }
    if (isNaN(stock) || stock < 0) { showToast('Invalid stock quantity', 'error'); return; }

    var unitEl  = safeEl('pf-size-unit');
    var sizesEl = safeEl('pf-sizes-input');
    var unit    = unitEl  ? unitEl.value  : 'Custom';
    var rawSizes = sizesEl ? sizesEl.value : (form.sizes ? form.sizes.value : '');

    var sizes = rawSizes.split(',').map(function(s){ return s.trim(); }).filter(Boolean).map(function(s) {
      if (unit === 'OS' || unit === 'XS–XXL' || unit === 'Custom') return s;
      // Only prepend unit if not already included
      return s.toLowerCase().indexOf(unit.toLowerCase()) === 0 ? s : unit + ' ' + s;
    });

    // Slug: keep the existing one untouched on edit. Only generate a new
    // one if this product genuinely has none yet (new product, or an old
    // product that predates slugs and hasn't been backfilled).
    var slug = (existingProduct && existingProduct.slug)
      ? existingProduct.slug
      : _uniqueSlug(_slugify(form.name.value), allProducts, existingId || null);

    var data = {
      id:                   existingId || form.sku.value || ('prod-' + Date.now()),
      slug:                 slug,
      sku:                  form.sku.value,
      name:                 form.name.value,
      brand:                form.brand.value,
      vendorId:             existingProduct ? existingProduct.vendorId : (window._currentVendorId || 'janedore'),
      category:             form.category.value,
      price:                price,
      salePrice:            salePrice,
      badge:                form.badge.value || null,
      sizes:                sizes,
      sizeUnit:             unit,
      stock:                stock,
      status:               form.status.value,
      featured:             form.featured.value === 'true',
      description:          markdownToHtml(form.description.value),
      productFeatures:      form.productFeatures.value,
      compositionCare:      form.compositionCare.value,
      measurements:         form.measurements ? form.measurements.value : '',
      shippingReturns:      form.shippingReturns.value,
      shippingWeight:       parseFloat(form.shippingWeight.value) || 0,
      internationalShipping: form.internationalShipping.value === 'true',
      tags:                 form.tags.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      createdAt:            existingProduct ? (existingProduct.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt:            new Date().toISOString(),
      variants:             []
    };

    var vi = 0;
    while (form['variant-color-' + vi] !== undefined) {
      var block = document.querySelector('[data-variant-index="' + vi + '"]');
      var getSelected = function(type) {
        if (!block) return [];
        var sel = block.querySelector('[data-img-type="' + type + '"]');
        return sel ? Array.from(sel.selectedOptions).map(function(o){ return o.value; }) : [];
      };
      data.variants.push({
        color:  form['variant-color-'  + vi].value.trim(),
        swatch: form['variant-swatch-' + vi].value.trim() || '#111',
        images: { model: getSelected('model'), ghost: getSelected('ghost'), detail: getSelected('detail') }
      });
      vi++;
    }

    if (data.variants.length === 0) {
      data.variants.push({ color:'Default', swatch:'#111', images:{ model:[], ghost:[], detail:[] } });
    }

    saveProduct(data);
  };

})();
