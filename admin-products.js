(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var safeUrl    = window._safeUrl;
  var fmt        = window._fmt;
  var showToast  = window._showToast;
  var isSuperAdmin = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var mountModal = window._mountModal;
  var closeModal = window._closeModal;
  var productsRef = window._productsRef;

  /* ─────────────────────────────────────────────────────────
     SAVE PRODUCT
  ───────────────────────────────────────────────────────── */
  function saveProduct(productData) {
    if (!window._currentUser || !window._roleResolved) {
      showToast('Not authenticated', 'error');
      return;
    }

    if (!isSuperAdmin()) {
      if (!window._currentVendorId) {
        showToast('No vendor scope. Cannot save product.', 'error');
        return;
      }
      productData.vendorId = window._currentVendorId;
    }

    if (productData.variants && Array.isArray(productData.variants)) {
      productData.variants = productData.variants.map(function(v) {
        if (v.images) {
          v.images.model  = (v.images.model  || []).map(safeUrl).filter(Boolean);
          v.images.ghost  = (v.images.ghost  || []).map(safeUrl).filter(Boolean);
          v.images.detail = (v.images.detail || []).map(safeUrl).filter(Boolean);
        }
        return v;
      });
    }

    var ref = productData.id
      ? productsRef.doc(productData.id)
      : productsRef.doc(productData.sku || ('prod-' + Date.now()));
    productData.id = ref.id;

    ref.set(productData, { merge: true }).then(function() {
      showToast('Product saved!');
      window._loadProducts();
      closeModal();
    }).catch(function(e) {
      console.error('[SAVE_PRODUCT]', e);
      showToast('Error: ' + e.message, 'error');
    });
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
      closeModal();
    }).catch(function(e) {
      console.error('[DELETE_PRODUCT]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  window.duplicateProduct = function(productId) {
    var p = (window._allProducts || []).find(function(x){ return x.id === productId; });
    if (!p) return;
    var copy       = Object.assign({}, p);
    copy.id        = '';
    copy.name      = copy.name + ' (Copy)';
    copy.sku       = copy.sku  + '-COPY';
    copy.status    = 'draft';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    var ref = productsRef.doc();
    copy.id = ref.id;
    ref.set(copy).then(function() {
      showToast('Product duplicated');
      window._loadProducts();
    }).catch(function(e) {
      console.error('[DUPLICATE_PRODUCT]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  window.archiveProduct = function(productId) {
    productsRef.doc(productId).update({ status:'draft', updatedAt:new Date().toISOString() })
      .then(function(){ showToast('Product archived'); window._loadProducts(); closeModal(); })
      .catch(function(e) {
        console.error('[ARCHIVE_PRODUCT]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  /* ─────────────────────────────────────────────────────────
     SEED PRODUCTS
  ───────────────────────────────────────────────────────── */
  var DEFAULT_PRODUCTS = [
    { id:"nova-sunglasses", sku:"ACC-NSG-006", name:"Janedore Logo Nova Sunglasses", brand:"JANEDORE", vendorId:"janedore", category:"sunglasses", price:350, salePrice:null, badge:"sold", sizes:["OS"], stock:10, status:"active", featured:true, description:"Bold yet refined sunglasses with UV protection.", productFeatures:"UV400 lenses.", compositionCare:"Acetate frame.", measurements:"", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Warm Brown",swatch:"#AF3E06",images:{model:[],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/C8DC66E1-BB21-4807-BC2C-C7F52A8005CE.png?v=1778858287"],detail:[]}}] },
    { id:"tenese-gold-earrings", sku:"JWL-TGE-005", name:"Stainless Steel Tenese Gold Earrings", brand:"NIRIUS CO", vendorId:"nirius-co", category:"jewelry", price:380, salePrice:null, badge:"new", sizes:["Stainless Steel"], stock:10, status:"active", featured:true, description:"Sculptural gold earrings with a modern twist.", productFeatures:"18k gold-plated.", compositionCare:"Gold-plated stainless steel.", measurements:"", shippingReturns:"Free shipping over R1500.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Gold",swatch:"#d4af37",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6607.png?v=1778790153"],detail:[]}}] },
    { id:"janedore-leather-pouch", sku:"ACC-JLP-007", name:"Janedore Debossed Leather Pouch", brand:"JANEDORE", vendorId:"janedore", category:"bags", price:50, salePrice:null, badge:null, sizes:["OS"], stock:50, status:"active", featured:false, description:"Supple debossed leather pouch.", productFeatures:"Genuine leather.", compositionCare:"100% Leather.", measurements:"", shippingReturns:"Free with sunglass purchase.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"],detail:[]}}] },
    { id:"janedore-raffle-brandy-black-dress", sku:"DRS-RBB-001", name:"Janedore Raffle Brandy Black Dress", brand:"JANEDORE", vendorId:"janedore", category:"dresses", price:450, salePrice:null, badge:"new", sizes:["S","M","L"], stock:40, status:"active", featured:true, description:"The Raffle Brandy black dress.", productFeatures:"Weighted crepe fabric.", compositionCare:"100% Polyester.", measurements:"", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/116AE49E-1C83-474E-B538-B3147C826859.png?v=1778858287"],detail:[]}}] },
    { id:"thato-rumination-tea-parfum", sku:"PRF-TRT-001", name:"Thato Rumination Tea Parfum", brand:"THATO", vendorId:"thato", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:30, status:"active", featured:true, description:"A contemplative fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", measurements:"", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Pale Linen",swatch:"#EBEDE0",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"],detail:[]}}] },
    { id:"thato-pink-rain-parfum", sku:"PRF-TPR-002", name:"Thato Pink Rain Parfum", brand:"THATO", vendorId:"thato", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:25, status:"active", featured:true, description:"A delicate, romantic fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", measurements:"", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Pink Rain",swatch:"#F3DBD7",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6630.png?v=1778801279"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/FD9FBEA5-4CD8-421E-A549-F67099AD9B79.png?v=1778801677"],detail:[]}}] },
    { id:"janedore-studded-halter-dress", sku:"DRS-SHN-001", name:"Janedore Studded Halter Neck Dress", brand:"JANEDORE", vendorId:"janedore", category:"dresses", price:680, salePrice:null, badge:"new", sizes:["XS","S","M","L"], stock:20, status:"active", featured:true, description:"Refined edge meets feminine structure.", productFeatures:"Structured halter neckline.", compositionCare:"95% Polyester, 5% Elastane.", measurements:"", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/BB8C5723-337D-4CB3-B9B8-9FC4BF36CBFE.png?v=1779001142"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/27BAAA95-3B6D-4CCE-A2D8-FFF60326A881.png?v=1779001142"],detail:[]}}] }
  ];

  window.seedDefaultProducts = function() {
    if (!requireSuperAdmin('seedDefaultProducts')) return;
    if (!confirm('Seed all 7 default products to Firebase?')) return;
    var batch = window._adminDB.batch();
    DEFAULT_PRODUCTS.forEach(function(p){ batch.set(productsRef.doc(p.id), p); });
    batch.commit()
      .then(function(){ showToast('7 products seeded!'); window._loadProducts(); })
      .catch(function(e) {
        console.error('[SEED_PRODUCTS]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER PRODUCTS TAB
  ───────────────────────────────────────────────────────── */
  window._renderProductsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    var allProducts = window._allProducts || [];

    mc.innerHTML = (!isSuperAdmin()
      ? '<div class="vendor-scope-bar">Showing your brand products only</div>'
      : '') +
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Products</div>' +
        '<button class="btn btn-sm btn-primary" onclick="window._openNewProductModal()">+ Product</button>' +
      '</div>' +
      '<div class="toolbar">' +
        '<input class="search-input" id="product-search" placeholder="Search products..." oninput="window._filterProducts()">' +
        '<select class="filter-select" id="product-cat-filter" onchange="window._filterProducts()">' +
          '<option value="">All Categories</option>' +
          ['dresses','tops','bottoms','jackets','sets','sunglasses','jewelry','bags','parfum'].map(function(c){
            return '<option value="'+c+'">'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>';
          }).join('') +
        '</select>' +
        '<select class="filter-select" id="product-status-filter" onchange="window._filterProducts()">' +
          '<option value="">All Statuses</option>' +
          '<option value="active">Active</option>' +
          '<option value="draft">Draft</option>' +
        '</select>' +
        '<div class="toolbar-spacer"></div>' +
        '<span id="products-filtered-count" class="ui-label"></span>' +
      '</div>' +
      '<div class="product-list" id="products-list">' +
        allProducts.map(renderProductRow).join('') +
      '</div>';
  };

  function renderProductRow(p) {
    var firstVariant = (p.variants && p.variants[0]) || {};
    var firstImages  = firstVariant.images || { model:[], ghost:[], detail:[] };
    var allImages    = [];

    if (p.category === 'jewelry') {
      allImages = [].concat(firstImages.model||[], firstImages.ghost||[], firstImages.detail||[]);
    } else {
      allImages = [].concat(firstImages.ghost||[], firstImages.model||[], firstImages.detail||[]);
    }

    var thumbnailUrl  = safeUrl(allImages[0] || '');
    var thumbnailHtml = thumbnailUrl
      ? '<img src="' + esc(thumbnailUrl) + '" class="pi-thumb" onerror="this.style.display=\'none\'" style="width:40px;height:40px;object-fit:cover;border-radius:4px;margin-right:12px;">'
      : '';

    return '<div class="product-row">' +
      '<div onclick="window._openProductModal(\'' + esc(p.id) + '\')" style="flex:1;min-width:0;display:flex;align-items:center;">' +
        thumbnailHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div class="pi-name">' + esc(p.name) + '</div>' +
          '<div class="pi-meta">' + esc(p.brand||'') + ' - ' + esc(p.category||'') + ' - ' + fmt(p.price) +
            (p.stock <= 3
              ? ' - <span style="color:var(--danger);font-weight:600;">' + esc(String(p.stock)) + ' left</span>'
              : ' - ' + esc(String(p.stock)) + ' in stock') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span class="badge badge-' + (p.status==='active'?'active':'draft') + '">' + esc(p.status||'draft') + '</span>' +
        '<div class="pi-actions">' +
          '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();duplicateProduct(\'' + esc(p.id) + '\')" title="Duplicate">+</button>' +
          '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();archiveProduct(\'' + esc(p.id) + '\')" title="Archive">-</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  window._filterProducts = function() {
    var allProducts = window._allProducts || [];
    var searchEl = safeEl('product-search');
    var catEl    = safeEl('product-cat-filter');
    var statusEl = safeEl('product-status-filter');
    var search   = searchEl ? (searchEl.value || '').toLowerCase() : '';
    var cat      = catEl    ? (catEl.value    || '') : '';
    var status   = statusEl ? (statusEl.value || '') : '';

    var filtered = allProducts.filter(function(p) {
      if (cat    && p.category !== cat)    return false;
      if (status && p.status   !== status) return false;
      if (search && (p.name+p.brand+p.sku).toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    var countEl = safeEl('products-filtered-count');
    if (countEl) countEl.textContent = filtered.length + ' products';
    var listEl = safeEl('products-list');
    if (listEl) listEl.innerHTML = filtered.map(renderProductRow).join('');
  };

  window._openNewProductModal = function() { window._openProductModal(null); };

  window._openProductModal = function(productOrId) {
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
      status:'active', featured:false, description:'', compositionCare:'',
      measurements:'', shippingReturns:'',
      variants:[{ color:'', swatch:'#111', images:{ model:[], ghost:[], detail:[] } }]
    };

    if (p.variants && Array.isArray(p.variants)) {
      p.variants = p.variants.map(function(v) {
        if (!v.images || typeof v.images !== 'object') {
          v.images = { model:[], ghost:[], detail:[] };
        } else {
          v.images.model  = Array.isArray(v.images.model)  ? v.images.model  : [];
          v.images.ghost  = Array.isArray(v.images.ghost)  ? v.images.ghost  : [];
          v.images.detail = Array.isArray(v.images.detail) ? v.images.detail : [];
        }
        return v;
      });
    }

    var modalHTML = '<div class="modal">' +
      '<div class="modal-handle"></div>' +
      '<button class="modal-close" onclick="window._closeModal()">X</button>' +
      '<div class="modal-title">' + (p.id?'Edit':'New') + ' Product</div>' +
      '<form id="product-form" onsubmit="window._handleProductSubmit(event,\'' + esc(p.id) + '\')">' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Name</label><input name="name" value="' + esc(p.name) + '" required></div>' +
          '<div class="form-group"><label>SKU</label><input name="sku" value="' + esc(p.sku) + '"></div>' +
        '</div>' +
        '<div class="form-row-3">' +
          '<div class="form-group"><label>Brand</label><select name="brand">' +
            ['JANEDORE','NIRIUS CO','THATO'].map(function(b){ return '<option value="'+b+'"'+(p.brand===b?' selected':'')+'>'+b+'</option>'; }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Category</label><select name="category">' +
            ['dresses','tops','bottoms','jackets','sets','sunglasses','jewelry','bags','parfum'].map(function(c){
              return '<option value="'+c+'"'+(p.category===c?' selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Status</label><select name="status">' +
            '<option value="active"'+(p.status==='active'?' selected':'')+'>Active</option>' +
            '<option value="draft"'+(p.status==='draft'?' selected':'')+'>Draft</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="form-row-3">' +
          '<div class="form-group"><label>Price (R)</label><input name="price" type="number" value="' + esc(String(p.price)) + '" required></div>' +
          '<div class="form-group"><label>Sale Price</label><input name="salePrice" type="number" value="' + esc(String(p.salePrice||'')) + '"></div>' +
          '<div class="form-group"><label>Stock</label><input name="stock" type="number" value="' + esc(String(p.stock)) + '"></div>' +
        '</div>' +
        '<div class="form-row-3">' +
          '<div class="form-group"><label>Badge</label><select name="badge">' +
            '<option value="">None</option>' +
            '<option value="new"'+(p.badge==='new'?' selected':'')+'>New</option>' +
            '<option value="sale"'+(p.badge==='sale'?' selected':'')+'>Sale</option>' +
            '<option value="sold"'+(p.badge==='sold'?' selected':'')+'>Sold Out</option>' +
          '</select></div>' +
          '<div class="form-group"><label>Sizes (comma)</label><input name="sizes" value="' + esc((p.sizes||[]).join(',')) + '"></div>' +
          '<div class="form-group"><label>Featured</label><select name="featured">' +
            '<option value="false"'+(p.featured?'':' selected')+'>No</option>' +
            '<option value="true"'+(p.featured?' selected':'')+'>Yes</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="form-group"><label>Description</label><textarea name="description">' + esc(p.description||'') + '</textarea></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Composition & Care</label><textarea name="compositionCare">' + esc(p.compositionCare||'') + '</textarea></div>' +
          '<div class="form-group"><label>Size Guide</label><textarea name="measurements">' + esc(p.measurements||'') + '</textarea></div>' +
        '</div>' +
        '<div class="form-group"><label>Shipping & Returns</label><input name="shippingReturns" value="' + esc(p.shippingReturns||'') + '"></div>' +
        '<hr class="divider" style="margin:14px 16px;">' +
        '<div style="padding:0 16px;font-size:12px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Variants & Images</div>' +
        '<div id="variants-container" style="padding:0 16px;">' +
          (p.variants||[]).map(function(v,i){ return buildVariantBlock(v, i, p.category); }).join('') +
        '</div>' +
        '<div style="padding:0 16px;">' +
          '<button type="button" class="btn-underline" onclick="window._addVariant()" style="font-size:12px;">+ Add Variant</button>' +
        '</div>' +
        '<div style="padding:16px 16px 4px;display:flex;gap:10px;align-items:center;">' +
          '<button type="submit" class="btn btn-primary btn-sm">Save Product</button>' +
          (p.id && isSuperAdmin() ? '<button type="button" class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + esc(p.id) + '\')">Delete</button>' : '') +
          (p.id ? '<button type="button" class="btn btn-ghost btn-sm" onclick="duplicateProduct(\'' + esc(p.id) + '\');window._closeModal();">Duplicate</button>' : '') +
        '</div>' +
      '</form>' +
    '</div>';

    mountModal(modalHTML);
  };

  /* ─────────────────────────────────────────────────────────
     VARIANT / IMAGE HELPERS
  ───────────────────────────────────────────────────────── */
  function buildVariantBlock(v, index, category) {
    v = v || {};
    var images    = v.images || { model:[], ghost:[], detail:[] };
    var modelUrls  = Array.isArray(images.model)  ? images.model  : [];
    var ghostUrls  = Array.isArray(images.ghost)  ? images.ghost  : [];
    var detailUrls = Array.isArray(images.detail) ? images.detail : [];

    var previewHtml = buildVariantPreview(modelUrls, ghostUrls, detailUrls, category);

    var modelRows  = modelUrls.length  ? modelUrls.map(function(u, i){ return buildImageUrlRow('model', index, u, i); }).join('')  : buildImageUrlRow('model', index, '', 0);
    var ghostRows  = ghostUrls.length  ? ghostUrls.map(function(u, i){ return buildImageUrlRow('ghost', index, u, i); }).join('')  : buildImageUrlRow('ghost', index, '', 0);
    var detailRows = detailUrls.length ? detailUrls.map(function(u, i){ return buildImageUrlRow('detail',index, u, i); }).join('') : '';

    return '<div class="variant-block" data-variant-index="' + index + '">' +
      '<h4>Variant ' + (index+1) + ' <button type="button" class="btn-underline" onclick="window._removeVariant(' + index + ')" style="font-size:10px;color:var(--danger);margin-left:auto;">Remove</button></h4>' +
      '<div class="form-row" style="padding:0;">' +
        '<div class="form-group" style="padding:0 0 10px;"><label>Color Name</label>' +
          '<input name="variant-color-'+index+'" value="'+esc(v.color||'')+'" placeholder="e.g. Black" oninput="window._updateVariantPreview('+index+')"></div>' +
        '<div class="form-group" style="padding:0 0 10px;"><label>Swatch (hex)</label>' +
          '<div style="display:flex;gap:7px;align-items:center;">' +
            '<input name="variant-swatch-'+index+'" value="'+esc(v.swatch||'#111')+'" placeholder="#111" style="flex:1;" oninput="this.nextElementSibling.value=this.value">' +
            '<input type="color" value="'+esc(v.swatch||'#111')+'" style="width:34px;height:34px;padding:2px;border:0.5px solid var(--border-med);cursor:pointer;border-radius:6px;" oninput="document.querySelector(\'[name=variant-swatch-'+index+']\').value=this.value">' +
          '</div></div>' +
      '</div>' +
      '<div class="variant-preview-strip" id="variant-preview-' + index + '" style="margin-bottom:12px;">' + previewHtml + '</div>' +
      '<div class="form-group" style="padding:0 0 8px;"><label>Model Images</label>' +
        '<div class="image-url-inputs" id="variant-model-'+index+'">'+modelRows+'</div>' +
        '<button type="button" class="btn-underline" onclick="window._addImageUrl(\'model\','+index+')" style="font-size:10px;margin-top:5px;">+ Add Model Image</button></div>' +
      '<div class="form-group" style="padding:0 0 8px;"><label>Ghost / Flat Lay Images</label>' +
        '<div class="image-url-inputs" id="variant-ghost-'+index+'">'+ghostRows+'</div>' +
        '<button type="button" class="btn-underline" onclick="window._addImageUrl(\'ghost\','+index+')" style="font-size:10px;margin-top:5px;">+ Add Ghost Image</button></div>' +
      '<div class="form-group" style="padding:0;"><label>Detail Images</label>' +
        '<div class="image-url-inputs" id="variant-detail-'+index+'">'+detailRows+'</div>' +
        '<button type="button" class="btn-underline" onclick="window._addImageUrl(\'detail\','+index+')" style="font-size:10px;margin-top:5px;">+ Add Detail Image</button></div>' +
    '</div>';
  }

  function buildVariantPreview(modelUrls, ghostUrls, detailUrls, category) {
    var combinedImages = category === 'jewelry'
      ? [].concat(modelUrls||[], ghostUrls||[], detailUrls||[])
      : [].concat(ghostUrls||[], modelUrls||[], detailUrls||[]);

    var safeImages = combinedImages.map(safeUrl).filter(Boolean);

    if (safeImages.length === 0) {
      return '<div style="color:var(--muted);font-size:11px;padding:8px;text-align:center;background:var(--surface2);border-radius:6px;">No images uploaded. Preview will appear here.</div>';
    }

    return '<div style="display:flex;gap:6px;overflow-x:auto;padding:8px;background:var(--surface2);border-radius:6px;">' +
      safeImages.map(function(url, i) {
        return '<div style="position:relative;min-width:80px;height:80px;flex-shrink:0;">' +
          '<img src="' + esc(url) + '" style="width:80px;height:80px;object-fit:cover;border-radius:4px;" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><rect fill=%22%23f0ede8%22 width=%2280%22 height=%2280%22/></svg>\'">' +
          '<span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:8px;padding:1px 4px;border-radius:2px;">' + (i+1) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function buildImageUrlRow(type, variantIndex, url, urlIndex) {
    url      = safeUrl(url || '');
    urlIndex = (urlIndex !== undefined) ? urlIndex : 0;
    var placeholder = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%23f0ede8%22 width=%2248%22 height=%2248%22/></svg>';

    return '<div class="image-url-row">' +
      '<input name="variant-'+type+'-'+variantIndex+'[]" value="'+esc(url)+'" placeholder="https://... image URL" ' +
        'oninput="window._updateImagePreview(this);window._updateVariantPreview('+variantIndex+')" style="flex:1;">' +
      '<img class="image-preview" src="'+(url?esc(url):placeholder)+'" onerror="this.src=\''+placeholder+'\'" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:0.5px solid var(--border-light);">' +
      '<button type="button" class="btn-underline" onclick="window._removeImageUrl(this)" style="font-size:10px;color:var(--danger);margin-left:4px;" title="Remove image">✕</button>' +
    '</div>';
  }

  window._updateImagePreview = function(input) {
    var safe = safeUrl(input.value);
    var img  = input.nextElementSibling;
    if (img && img.classList.contains('image-preview')) {
      img.src = safe || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%23f0ede8%22 width=%2248%22 height=%2248%22/></svg>';
    }
  };

  window._updateVariantPreview = function(variantIndex) {
    var previewEl = document.getElementById('variant-preview-' + variantIndex);
    if (!previewEl) return;
    var category  = document.querySelector('[name="category"]');
    var cat       = category ? category.value : 'dresses';

    var modelInputs  = document.querySelectorAll('[name="variant-model-' + variantIndex + '[]"]');
    var ghostInputs  = document.querySelectorAll('[name="variant-ghost-' + variantIndex + '[]"]');
    var detailInputs = document.querySelectorAll('[name="variant-detail-' + variantIndex + '[]"]');

    var modelUrls  = Array.from(modelInputs).map(function(i){ return i.value; }).filter(Boolean);
    var ghostUrls  = Array.from(ghostInputs).map(function(i){ return i.value; }).filter(Boolean);
    var detailUrls = Array.from(detailInputs).map(function(i){ return i.value; }).filter(Boolean);

    previewEl.innerHTML = buildVariantPreview(modelUrls, ghostUrls, detailUrls, cat);
  };

  window._addVariant = function() {
    var c = safeEl('variants-container');
    if (c) {
      var category = document.querySelector('[name="category"]');
      var cat = category ? category.value : 'dresses';
      c.insertAdjacentHTML('beforeend', buildVariantBlock({ images:{ model:[], ghost:[], detail:[] } }, c.children.length, cat));
    }
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
        b.querySelector('h4').innerHTML = 'Variant ' + (i+1) + ' <button type="button" class="btn-underline" onclick="window._removeVariant(' + i + ')" style="font-size:10px;color:var(--danger);margin-left:auto;">Remove</button>';
      });
    }
  };

  window._addImageUrl = function(type, vi) {
    var container = safeEl('variant-' + type + '-' + vi);
    if (container) {
      var existingInputs = container.querySelectorAll('input');
      container.insertAdjacentHTML('beforeend', buildImageUrlRow(type, vi, '', existingInputs.length));
      window._updateVariantPreview(vi);
    }
  };

  window._removeImageUrl = function(button) {
    var row          = button.closest('.image-url-row');
    if (!row) return;
    var variantBlock = row.closest('.variant-block');
    var variantIndex = variantBlock ? parseInt(variantBlock.getAttribute('data-variant-index'), 10) : 0;
    row.remove();
    if (variantBlock) window._updateVariantPreview(variantIndex);
  };

  window._handleProductSubmit = function(e, existingId) {
    e.preventDefault();
    var form            = e.target;
    var allProducts     = window._allProducts || [];
    var existingProduct = existingId ? allProducts.find(function(p){ return p.id === existingId; }) : null;

    var price    = parseFloat(form.price.value);
    var stock    = parseInt(form.stock.value, 10);
    var salePrice= form.salePrice.value ? parseFloat(form.salePrice.value) : null;

    if (isNaN(price) || price < 0) { showToast('Invalid price', 'error'); return; }
    if (isNaN(stock) || stock < 0) { showToast('Invalid stock', 'error'); return; }

    var data = {
      id:              existingId || form.sku.value || ('prod-' + Date.now()),
      sku:             form.sku.value,
      name:            form.name.value,
      brand:           form.brand.value,
      vendorId:        existingProduct ? existingProduct.vendorId : (window._currentVendorId || 'janedore'),
      category:        form.category.value,
      price:           price,
      salePrice:       salePrice,
      badge:           form.badge.value || null,
      sizes:           form.sizes.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      stock:           stock,
      status:          form.status.value,
      featured:        form.featured.value === 'true',
      description:     form.description.value,
      compositionCare: form.compositionCare.value,
      measurements:    form.measurements.value,
      shippingReturns: form.shippingReturns.value,
      createdAt:       existingProduct ? (existingProduct.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
      variants:        []
    };

    var vi = 0;
    while (form['variant-color-' + vi]) {
      var modelInputs  = form.querySelectorAll('[name="variant-model-' + vi + '[]"]');
      var ghostInputs  = form.querySelectorAll('[name="variant-ghost-' + vi + '[]"]');
      var detailInputs = form.querySelectorAll('[name="variant-detail-' + vi + '[]"]');

      data.variants.push({
        color:  form['variant-color-'  + vi].value.trim(),
        swatch: form['variant-swatch-' + vi].value.trim() || '#111',
        images: {
          model:  Array.from(modelInputs).map(function(i){ return i.value.trim(); }).filter(Boolean),
          ghost:  Array.from(ghostInputs).map(function(i){ return i.value.trim(); }).filter(Boolean),
          detail: Array.from(detailInputs).map(function(i){ return i.value.trim(); }).filter(Boolean)
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
