(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc               = window._esc;
  var safeEl            = window._safeEl;
  var safeUrl           = window._safeUrl;
  var fmt               = window._fmt;
  var showToast         = window._showToast;
  var isSuperAdmin      = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var productsRef       = window._productsRef;

  var CATEGORIES = ['dresses','tops','bottoms','jackets','sets','sunglasses','jewelry','bags','parfum'];
  var BRANDS     = ['JANEDORE','NIRIUS CO','THATO'];
  var STATUSES   = ['active', 'draft', 'archived'];

  /* ─────────────────────────────────────────────────────────
     CLOUDINARY UPLOAD — device only, no external sources
  ───────────────────────────────────────────────────────── */
  window._uploadToCloudinary = function(onSuccess) {
    var cloudName    = window.CLOUDINARY_CLOUD_NAME;
    var uploadPreset = window.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName)    { showToast('Cloudinary cloud name not configured.', 'error'); return; }
    if (!uploadPreset) { showToast('Cloudinary upload preset not configured.', 'error'); return; }

    var widget = window.cloudinary.createUploadWidget(
      {
        cloudName:    cloudName,
        uploadPreset: uploadPreset,
        sources:      ['local'],
        multiple:     true,
        clientAllowedFormats: ['png','jpg','jpeg','webp'],
        maxFileSize:  20000000,
        showUploadMoreButton: true
      },
      function(error, result) {
        if (error) { showToast('Upload failed: ' + (error.message || 'Unknown error'), 'error'); return; }
        if (result && result.event === 'success') {
          onSuccess(result.info.secure_url);
        }
      }
    );
    widget.open();
  };

  /* ─────────────────────────────────────────────────────────
     SAVE PRODUCT
  ───────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────
     PRODUCT ACTIONS
  ───────────────────────────────────────────────────────── */
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
    copy.status = 'draft'; copy.createdAt = new Date().toISOString(); copy.updatedAt = new Date().toISOString();
    var ref = productsRef.doc(); copy.id = ref.id;
    ref.set(copy).then(function() { showToast('Product duplicated'); window._loadProducts(); }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window.archiveProduct = function(productId) {
    productsRef.doc(productId).update({ status: 'archived', updatedAt: new Date().toISOString() })
      .then(function() { showToast('Product archived'); window._loadProducts(); window._renderProductsTab(); })
      .catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  /* ─────────────────────────────────────────────────────────
     SEED
  ───────────────────────────────────────────────────────── */
  var DEFAULT_PRODUCTS = [
    { id:"nova-sunglasses", sku:"ACC-NSG-006", name:"Janedore Logo Nova Sunglasses", brand:"JANEDORE", vendorId:"janedore", category:"sunglasses", price:350, salePrice:null, badge:"sold", sizes:["OS"], stock:10, status:"active", featured:true, description:"Bold yet refined sunglasses with UV protection.", productFeatures:"UV400 lenses.", compositionCare:"Acetate frame.", shippingReturns:"Free shipping over R1000.", tags:[], shippingWeight:0.2, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Warm Brown",swatch:"#AF3E06",images:{model:[],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/C8DC66E1-BB21-4807-BC2C-C7F52A8005CE.png?v=1778858287"],detail:[]}}] },
    { id:"tenese-gold-earrings", sku:"JWL-TGE-005", name:"Stainless Steel Tenese Gold Earrings", brand:"NIRIUS CO", vendorId:"nirius-co", category:"jewelry", price:380, salePrice:null, badge:"new", sizes:["Stainless Steel"], stock:10, status:"active", featured:true, description:"Sculptural gold earrings with a modern twist.", productFeatures:"18k gold-plated.", compositionCare:"Gold-plated stainless steel.", shippingReturns:"Free shipping over R1500.", tags:[], shippingWeight:0.1, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Gold",swatch:"#d4af37",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6607.png?v=1778790153"],detail:[]}}] },
    { id:"janedore-leather-pouch", sku:"ACC-JLP-007", name:"Janedore Debossed Leather Pouch", brand:"JANEDORE", vendorId:"janedore", category:"bags", price:50, salePrice:null, badge:null, sizes:["OS"], stock:50, status:"active", featured:false, description:"Supple debossed leather pouch.", productFeatures:"Genuine leather.", compositionCare:"100% Leather.", shippingReturns:"Free with sunglass purchase.", tags:[], shippingWeight:0.3, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"],detail:[]}}] },
    { id:"janedore-raffle-brandy-black-dress", sku:"DRS-RBB-001", name:"Janedore Raffle Brandy Black Dress", brand:"JANEDORE", vendorId:"janedore", category:"dresses", price:450, salePrice:null, badge:"new", sizes:["S","M","L"], stock:40, status:"active", featured:true, description:"The Raffle Brandy black dress.", productFeatures:"Weighted crepe fabric.", compositionCare:"100% Polyester.", shippingReturns:"Free shipping over R1000.", tags:[], shippingWeight:0.5, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/116AE49E-1C83-474E-B538-B3147C826859.png?v=1778858287"],detail:[]}}] },
    { id:"thato-rumination-tea-parfum", sku:"PRF-TRT-001", name:"Thato Rumination Tea Parfum", brand:"THATO", vendorId:"thato", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:30, status:"active", featured:true, description:"A contemplative fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", tags:[], shippingWeight:0.2, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Pale Linen",swatch:"#EBEDE0",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"],detail:[]}}] },
    { id:"thato-pink-rain-parfum", sku:"PRF-TPR-002", name:"Thato Pink Rain Parfum", brand:"THATO", vendorId:"thato", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:25, status:"active", featured:true, description:"A delicate, romantic fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", tags:[], shippingWeight:0.2, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Pink Rain",swatch:"#F3DBD7",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6630.png?v=1778801279"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/FD9FBEA5-4C42-421E-A549-F67099AD9B79.png?v=1778801677"],detail:[]}}] },
    { id:"janedore-studded-halter-dress", sku:"DRS-SHN-001", name:"Janedore Studded Halter Neck Dress", brand:"JANEDORE", vendorId:"janedore", category:"dresses", price:680, salePrice:null, badge:"new", sizes:["XS","S","M","L"], stock:20, status:"active", featured:true, description:"Refined edge meets feminine structure.", productFeatures:"Structured halter neckline.", compositionCare:"95% Polyester, 5% Elastane.", shippingReturns:"Free shipping over R1000.", tags:[], shippingWeight:0.4, internationalShipping:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/BB8C5723-337D-4CB3-B9B8-9FC4BF36CBFE.png?v=1779001142"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/27BAAA95-3B6D-4CCE-A2D8-FFF60326A881.png?v=1779001142"],detail:[]}}] }
  ];

  window.seedDefaultProducts = function() {
    if (!requireSuperAdmin('seedDefaultProducts')) return;
    if (!confirm('Seed all 7 default products to Firebase?')) return;
    var batch = window._adminDB.batch();
    DEFAULT_PRODUCTS.forEach(function(p){ batch.set(productsRef.doc(p.id), p); });
    batch.commit()
      .then(function(){ showToast('7 products seeded'); window._loadProducts(); window._renderProductsTab(); })
      .catch(function(e){ showToast('Error: ' + e.message, 'error'); });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER PRODUCTS TAB — list view
  ───────────────────────────────────────────────────────── */
  window._renderProductsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    var allProducts = window._allProducts || [];
    var hasAny = allProducts.length > 0;

    mc.innerHTML =
      (window._currentUserRole === 'VENDOR' ? '<div class="vendor-scope-bar">Showing your brand products only</div>' : '') +
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Products</div>' +
        '<div class="section-actions">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._refreshProducts()" title="Refresh">' +
            '<i class="ph-light ph-arrows-clockwise"></i> Refresh' +
          '</button>' +
          (hasAny ? '<button class="btn btn-sm btn-primary" onclick="window._openProductForm(null)">Add product</button>' : '') +
        '</div>' +
      '</div>' +
      (hasAny ? (
        '<div class="toolbar" style="margin-bottom:12px;">' +
          '<input class="search-input" id="product-search" placeholder="Search products..." oninput="window._filterProducts()">' +
          '<select class="filter-select" id="product-cat-filter" onchange="window._filterProducts()">' +
            '<option value="">All Categories</option>' +
            CATEGORIES.map(function(c){ return '<option value="'+c+'">'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>'; }).join('') +
          '</select>' +
          '<select class="filter-select" id="product-status-filter" onchange="window._filterProducts()">' +
            '<option value="">All Statuses</option>' +
            STATUSES.map(function(s){ return '<option value="'+s+'">'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>'; }).join('') +
          '</select>' +
          '<div class="toolbar-spacer"></div>' +
          '<span id="products-filtered-count" class="ui-label"></span>' +
        '</div>' +
        '<div class="product-list" id="products-list">' +
          allProducts.map(renderProductRow).join('') +
        '</div>'
      ) : renderEmptyState());
  };

  window._refreshProducts = function() {
    showToast('Refreshing...');
    window._loadProducts();
  };

  function renderEmptyState() {
    return '<div class="orders-empty-state">' +
      '<div class="orders-empty-icon"><i class="ph-light ph-package"></i></div>' +
      '<div class="orders-empty-title">Add your first product</div>' +
      '<div class="orders-empty-sub">Your products will appear here. Start by adding your first item to the store.</div>' +
      '<button class="orders-empty-btn" onclick="window._openProductForm(null)">' +
        '<i class="ph-light ph-plus" style="font-size:15px;"></i> Add product' +
      '</button>' +
    '</div>';
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
        (thumb
          ? '<img src="'+esc(thumb)+'" class="pi-thumb" onerror="this.style.display=\'none\'" style="width:40px;height:40px;object-fit:cover;border-radius:4px;margin-right:12px;flex-shrink:0;">'
          : '<div style="width:40px;height:40px;border-radius:4px;background:var(--surface2);margin-right:12px;flex-shrink:0;"></div>') +
        '<div style="flex:1;min-width:0;">' +
          '<div class="pi-name">' + esc(p.name) + '</div>' +
          '<div class="pi-meta">' + esc(p.brand||'') + ' · ' + esc(p.category||'') + ' · ' + fmt(p.price) +
            (p.stock <= 3
              ? ' · <span style="color:var(--danger);font-weight:600;">' + esc(String(p.stock)) + ' left</span>'
              : ' · ' + esc(String(p.stock)) + ' in stock') +
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

  /* ─────────────────────────────────────────────────────────
     SHARED MEDIA POOL
     All uploaded images live here keyed by URL.
     Variants simply reference URLs from this pool.
  ───────────────────────────────────────────────────────── */

  var _mediaPool = [];

  function _poolFromProduct(p) {
    var seen = {};
    var pool = [];
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
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:28px;background:var(--surface2);border:0.5px dashed var(--border-med);border-radius:var(--r-sm);color:var(--muted);font-size:11px;">' +
          '<i class="ph-light ph-image" style="font-size:28px;display:block;margin-bottom:6px;"></i>' +
          'No images yet. Click upload to add images.' +
        '</div>';
      return;
    }
    grid.innerHTML = _mediaPool.map(function(url, i) {
      return '<div style="position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;border:0.5px solid var(--border-light);">' +
        '<img src="' + esc(url) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.opacity=\'0.3\'">' +
        '<button type="button" onclick="window._removeFromPool(' + i + ')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);border:none;color:#fff;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;" title="Remove">' +
          '<i class="ph-light ph-x" style="font-size:10px;"></i>' +
        '</button>' +
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
          Array.from(sel.options).forEach(function(opt) {
            if (opt.value === removed) opt.remove();
          });
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

  /* ─────────────────────────────────────────────────────────
     VARIANT IMAGE SELECTORS
  ───────────────────────────────────────────────────────── */
  function _buildVariantImageSelector(type, variantIndex, selectedUrls) {
    selectedUrls = selectedUrls || [];
    var label = type === 'model' ? 'Model shots' : type === 'ghost' ? 'Ghost / flat lay' : 'Detail shots';
    var options = _mediaPool.map(function(url, i) {
      var isSelected = selectedUrls.indexOf(url) !== -1;
      var filename = url.split('/').pop().split('?')[0].substring(0, 28);
      return '<option value="' + esc(url) + '"' + (isSelected ? ' selected' : '') + '>' + esc(filename) + '</option>';
    }).join('');

    return '<div style="margin-bottom:8px;">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px;">' + label + '</div>' +
      (options
        ? '<select multiple data-img-type="' + type + '" data-variant="' + variantIndex + '" ' +
            'style="width:100%;min-height:60px;max-height:100px;font-size:11px;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-sm);padding:4px;" ' +
            'onchange="window._onVariantImgChange(' + variantIndex + ')">' +
            options +
          '</select>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:3px;">Hold Ctrl / Cmd to select multiple</div>'
        : '<div style="font-size:11px;color:var(--muted);padding:6px;background:var(--surface2);border-radius:var(--r-sm);">Upload images above first</div>'
      ) +
    '</div>';
  }

  window._onVariantImgChange = function(variantIndex) {
    _refreshVariantPreviewStrip(variantIndex);
  };

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
    var combined = cat === 'jewelry'
      ? [].concat(modelUrls, ghostUrls, detailUrls)
      : [].concat(ghostUrls, modelUrls, detailUrls);
    if (combined.length === 0) {
      strip.innerHTML = '<div style="font-size:10.5px;color:var(--muted);">No images assigned</div>';
      return;
    }
    strip.innerHTML = '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
      combined.map(function(url) {
        return '<img src="' + esc(url) + '" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:0.5px solid var(--border-light);" onerror="this.style.display=\'none\'">';
      }).join('') +
    '</div>';
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
      var modelSel  = getSelected('model');
      var ghostSel  = getSelected('ghost');
      var detailSel = getSelected('detail');
      var imgSelWrap = block.querySelector('.variant-img-selectors');
      if (imgSelWrap) {
        imgSelWrap.innerHTML =
          _buildVariantImageSelector('model',  vi, modelSel)  +
          _buildVariantImageSelector('ghost',  vi, ghostSel)  +
          _buildVariantImageSelector('detail', vi, detailSel);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     OPEN PRODUCT FORM
  ───────────────────────────────────────────────────────── */
  window._openNewProductModal = function() { window._openProductForm(null); };
  window._openProductModal    = function(id) { window._openProductForm(id); };

  window._openProductForm = function(productOrId) {
    var allProducts = window._allProducts || [];
    var p;
    if (typeof productOrId === 'string') {
      p = allProducts.find(function(x){ return x.id === productOrId; });
      if (!p) { showToast('Product not found', 'error'); return; }
    } else {
      p = productOrId;
    }

    p = p || {
      id:'', sku:'', name:'', brand:'JANEDORE', vendorId:'janedore',
      category:'dresses', price:0, salePrice:null, badge:'', sizes:[], stock:0,
      status:'draft', featured:false, description:'', productFeatures:'',
      compositionCare:'', shippingReturns:'', tags:[], shippingWeight:'', internationalShipping:false,
      variants:[{ color:'', swatch:'#111', images:{ model:[], ghost:[], detail:[] } }]
    };

    if (p.variants && Array.isArray(p.variants)) {
      p.variants = p.variants.map(function(v) {
        if (!v.images || typeof v.images !== 'object') v.images = { model:[], ghost:[], detail:[] };
        else {
          v.images.model  = Array.isArray(v.images.model)  ? v.images.model  : [];
          v.images.ghost  = Array.isArray(v.images.ghost)  ? v.images.ghost  : [];
          v.images.detail = Array.isArray(v.images.detail) ? v.images.detail : [];
        }
        return v;
      });
    }

    _mediaPool = _poolFromProduct(p);

    var mc = safeEl('main-content');
    if (!mc) return;
    var isNew = !p.id;

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<button type="button" class="btn btn-ghost" onclick="window._renderProductsTab()">' +
          '<i class="ph-light ph-arrow-left" style="margin-right:4px;"></i> Cancel' +
        '</button>' +
        '<div style="font-size:13px;font-weight:500;color:var(--text);">' + (isNew ? 'Add product' : 'Edit product') + '</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'product-form\').requestSubmit()">' +
          '<i class="ph-light ph-check" style="margin-right:4px;"></i> Save' +
        '</button>' +
      '</div>' +

      '<form id="product-form" onsubmit="window._handleProductSubmit(event,\'' + esc(p.id) + '\')">' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Status</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Product status</label>' +
            '<select name="status" style="width:100%;">' +
              STATUSES.map(function(s){ return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Badge</label>' +
            '<select name="badge" style="width:100%;">' +
              '<option value="">None</option>' +
              ['new','sale','sold','pre-order'].map(function(b){ return '<option value="'+b+'"'+(p.badge===b?' selected':'')+'>'+b.charAt(0).toUpperCase()+b.slice(1)+'</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Featured on homepage</label>' +
            '<select name="featured" style="width:100%;">' +
              '<option value="false"'+(p.featured?'':' selected')+'>No</option>' +
              '<option value="true"'+(p.featured?' selected':'')+'>Yes</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header" style="justify-content:space-between;">' +
          '<span class="card-title">Media</span>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._uploadToPool()">' +
            '<i class="ph-light ph-cloud-arrow-up" style="margin-right:4px;"></i> Upload images' +
          '</button>' +
        '</div>' +
        '<div style="padding:12px 16px;">' +
          '<div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Upload all product images here first, then assign them to each variant below.</div>' +
          '<div id="media-pool-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Product info</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Title</label>' +
            '<input name="name" value="' + esc(p.name) + '" placeholder="e.g. Raffle Brandy Dress" required>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Description</label>' +
            '<textarea name="description" style="min-height:80px;">' + esc(p.description||'') + '</textarea>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Brand</label>' +
            '<select name="brand" style="width:100%;">' +
              BRANDS.map(function(b){ return '<option value="'+b+'"'+(p.brand===b?' selected':'')+'>'+b+'</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Category</label>' +
            '<select name="category" style="width:100%;">' +
              CATEGORIES.map(function(c){ return '<option value="'+c+'"'+(p.category===c?' selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Product features</label>' +
            '<textarea name="productFeatures" style="min-height:60px;">' + esc(p.productFeatures||'') + '</textarea>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Composition &amp; care</label>' +
            '<textarea name="compositionCare" style="min-height:60px;">' + esc(p.compositionCare||'') + '</textarea>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Pricing</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Price (R)</label>' +
            '<input name="price" type="number" min="0" step="0.01" value="' + esc(String(p.price||0)) + '" required oninput="window._pfUpdateMargin()">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Sale price (R) <span style="font-size:10px;color:var(--muted);">— leave blank if not on sale</span></label>' +
            '<input name="salePrice" type="number" min="0" step="0.01" value="' + esc(String(p.salePrice||'')) + '" oninput="window._pfUpdateMargin()">' +
          '</div>' +
          '<div id="pf-margin-display" style="background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font-size:11.5px;display:none;"></div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Inventory</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>SKU</label>' +
            '<input name="sku" value="' + esc(p.sku||'') + '" placeholder="e.g. DRS-RBB-001">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Stock quantity</label>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<button type="button" class="no-qty-btn" onclick="window._pfChangeStock(-1)"><i class="ph-light ph-minus"></i></button>' +
              '<input name="stock" id="pf-stock" type="number" min="0" value="' + esc(String(p.stock||0)) + '" style="width:80px;text-align:center;" oninput="window._pfUpdateStockLabel()">' +
              '<button type="button" class="no-qty-btn" onclick="window._pfChangeStock(1)"><i class="ph-light ph-plus"></i></button>' +
              '<span id="pf-stock-label" style="font-size:11px;color:var(--muted);"></span>' +
            '</div>' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Sizes <span style="font-size:10px;color:var(--muted);">— comma separated, e.g. XS, S, M, L</span></label>' +
            '<input name="sizes" value="' + esc((p.sizes||[]).join(', ')) + '" placeholder="XS, S, M, L or OS">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header" style="justify-content:space-between;">' +
          '<span class="card-title">Variants</span>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._addVariant()"><i class="ph-light ph-plus"></i> Add variant</button>' +
        '</div>' +
        '<div id="variants-container" style="padding:0 16px 12px;">' +
          (p.variants||[]).map(function(v, i){ return buildVariantBlock(v, i, p.category); }).join('') +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">Shipping</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Weight (kg)</label>' +
            '<input name="shippingWeight" type="number" min="0" step="0.01" value="' + esc(String(p.shippingWeight||'')) + '" placeholder="e.g. 0.5">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Shipping &amp; returns note</label>' +
            '<input name="shippingReturns" value="' + esc(p.shippingReturns||'') + '" placeholder="e.g. Free shipping over R1000">' +
          '</div>' +
          '<div class="form-group" style="padding:0;">' +
            '<label>International shipping</label>' +
            '<select name="internationalShipping" style="width:100%;">' +
              '<option value="false"'+(p.internationalShipping?'':' selected')+'>No</option>' +
              '<option value="true"'+(p.internationalShipping?' selected':'')+'>Yes</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:24px;">' +
        '<div class="card-header"><span class="card-title">Tags</span></div>' +
        '<div style="padding:12px 16px;">' +
          '<div class="form-group" style="padding:0;">' +
            '<label>Tags <span style="font-size:10px;color:var(--muted);">— comma separated</span></label>' +
            '<input name="tags" value="' + esc((p.tags||[]).join(', ')) + '" placeholder="e.g. summer, linen, sale">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '</form>';

    _renderMediaPool();
    window._pfUpdateMargin();
    window._pfUpdateStockLabel();
  };

  /* ─────────────────────────────────────────────────────────
     VARIANT BLOCK
  ───────────────────────────────────────────────────────── */
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
        '<div class="form-group" style="padding:0;flex:1;">' +
          '<label>Color name</label>' +
          '<input name="variant-color-'+index+'" value="'+esc(v.color||'')+'" placeholder="e.g. Black">' +
        '</div>' +
        '<div class="form-group" style="padding:0;width:110px;">' +
          '<label>Swatch</label>' +
          '<div style="display:flex;gap:7px;align-items:center;">' +
            '<input name="variant-swatch-'+index+'" value="'+esc(v.swatch||'#111')+'" placeholder="#111" style="flex:1;min-width:0;" oninput="this.nextElementSibling.value=this.value">' +
            '<input type="color" value="'+esc(v.swatch||'#111')+'" style="width:34px;height:34px;padding:2px;border:0.5px solid var(--border-med);cursor:pointer;border-radius:6px;flex-shrink:0;" oninput="document.querySelector(\'[name=variant-swatch-'+index+']\').value=this.value">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="variant-img-selectors">' +
        _buildVariantImageSelector('model',  index, modelUrls)  +
        _buildVariantImageSelector('ghost',  index, ghostUrls)  +
        _buildVariantImageSelector('detail', index, detailUrls) +
      '</div>' +

      '<div id="variant-preview-strip-' + index + '" style="margin-top:8px;">' +
        '<div style="font-size:10.5px;color:var(--muted);">No images assigned</div>' +
      '</div>' +

    '</div>';
  }

  /* ─────────────────────────────────────────────────────────
     PRICING / STOCK HELPERS
  ───────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────
     VARIANT ADD / REMOVE
  ───────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────
     SUBMIT
  ───────────────────────────────────────────────────────── */
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

    var data = {
      id:                   existingId || form.sku.value || ('prod-' + Date.now()),
      sku:                  form.sku.value,
      name:                 form.name.value,
      brand:                form.brand.value,
      vendorId:             existingProduct ? existingProduct.vendorId : (window._currentVendorId || 'janedore'),
      category:             form.category.value,
      price:                price,
      salePrice:            salePrice,
      badge:                form.badge.value || null,
      sizes:                form.sizes.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      stock:                stock,
      status:               form.status.value,
      featured:             form.featured.value === 'true',
      description:          form.description.value,
      productFeatures:      form.productFeatures.value,
      compositionCare:      form.compositionCare.value,
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
        images: {
          model:  getSelected('model'),
          ghost:  getSelected('ghost'),
          detail: getSelected('detail')
        }
      });
      vi++;
    }

    if (data.variants.length === 0) {
      data.variants.push({ color:'Default', swatch:'#111', images:{ model:[], ghost:[], detail:[] } });
    }

    saveProduct(data);
  };

})();
