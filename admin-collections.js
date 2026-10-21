(function () {
  'use strict';
  if (!window._adminDB) return;
  var db = window._adminDB;
  var collectionsRef = db.collection('collections');
  var productsRef = db.collection('products');
  var esc = window._esc || function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  };
  var showToast = window._showToast || function (message) { alert(message); };
  var isSuperAdmin = window._isSuperAdmin || function () { return window._currentUserRole === 'SUPER_ADMIN'; };
  function slugify(value) {
    return String(value || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function canManage(collection) {
    return isSuperAdmin() || (window._currentUserRole === 'VENDOR' && collection &&
      collection.vendorId && collection.vendorId === window._currentVendorId &&
      collection.status !== 'active' && collection.published !== true);
  }
  function hasMember(product, collection) {
    if (collection && collection.collectionType === 'automated') {
      if (collection.automatedRule === 'sale') return typeof window._hasSalePrice === 'function' ? window._hasSalePrice(product) : Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price || 0);
      if (collection.automatedRule === 'freedelivery') return window._isFreeDeliveryBrandProduct(product);
      if (collection.automatedRule === 'newin') {
        var created = product.createdAt && typeof product.createdAt.toDate === 'function' ? product.createdAt.toDate() : new Date(product.createdAt || 0);
        return !!created && !isNaN(created.getTime()) && Date.now() - created.getTime() <= 5 * 24 * 60 * 60 * 1000;
      }
    }
    var values = Array.isArray(product.collections) ? product.collections : String(product.collections || '').split(',');
    var handle = String(collection.handle || collection.slug || collection.id || '').toLowerCase();
    var title = String(collection.title || collection.name || '').toLowerCase();
    return values.some(function (value) {
      value = String(value || '').trim().toLowerCase();
      return value && (value === handle || value === title);
    });
  }
  function loadCollections() {
    var list = document.getElementById('collections-admin-list');
    if (list) list.innerHTML = '<div class="empty-state"><p>Loading collections…</p></div>';
    var query = collectionsRef;
    if (window._currentUserRole === 'VENDOR') {
      if (!window._currentVendorId) {
        if (list) list.innerHTML = '<div class="empty-state"><p>Your vendor profile is not available.</p></div>';
        return;
      }
      query = query.where('vendorId', '==', window._currentVendorId);
    }
    query.get().then(function (snapshot) {
      var items = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
      items.sort(function (a, b) {
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
      });
      window._adminCollectionsData = items;
      renderList(items);
    }).catch(function (error) {
      if (list) list.innerHTML = '<div class="empty-state"><p>Could not load collections: ' + esc(error.message || 'Please try again.') + '</p><button class="btn btn-ghost" type="button" onclick="window._loadAdminCollections()">Retry</button></div>';
    });
  }
  function renderList(items) {
    var list = document.getElementById('collections-admin-list');
    if (!list) return;
    var products = window._allProducts || [];
    var isPlatformAdmin = isSuperAdmin();
    var activeProducts = products.filter(function (product) { return product.status === 'active'; });
    var activeBrands = {};
    activeProducts.forEach(function (product) {
      var brand = String(product.brand || product.vendorName || '').trim();
      if (brand) activeBrands[brand.toLowerCase()] = brand;
    });
    var allProductsRow = isPlatformAdmin
      ? '<div class="products-row" role="listitem" data-collection-search="all products all /shop system collection" onclick="window._showAllProductsCollectionInfo()" style="cursor:pointer;">' +
          '<div style="width:40px;height:40px;border-radius:4px;background:var(--surface2);margin-right:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--text2);"><i class="ph ph-stack"></i></div>' +
          '<div style="flex:1;min-width:0;"><div class="pi-name">All Products</div>' +
          '<div class="pi-meta">' + activeProducts.length + ' active products · ' + Object.keys(activeBrands).length + ' brands · /shop</div></div>' +
          '<span class="badge" style="background:var(--surface2);color:var(--text2);">System</span>' +
        '</div>'
      : '';
    var brandsFor = function (item) {
      var brands = {};
      products.forEach(function (product) {
        if (product.status === 'archived' || !hasMember(product, item)) return;
        var brand = String(product.brand || product.vendorName || '').trim();
        if (brand) brands[brand.toLowerCase()] = brand;
      });
      return Object.keys(brands).length;
    };
    var productCount = function (item) {
      return products.filter(function (product) { return product.status !== 'archived' && hasMember(product, item); }).length;
    };
    var toolbar = '<div class="orders-search-row"><div class="orders-search-wrap"><i class="ph ph-magnifying-glass"></i><input class="orders-search-input" id="collections-admin-search" placeholder="Search collections" oninput="window._filterAdminCollections()"></div></div>';
    if (!items.length && !isPlatformAdmin) {
      list.innerHTML = toolbar + '<div class="orders-empty-state"><div class="orders-empty-icon"><i class="ph-light ph-stack"></i></div><div class="orders-empty-title">No collections yet</div><div class="orders-empty-sub">Create your first collection to curate products across brands.</div></div>';
      return;
    }
    list.innerHTML = toolbar + '<div class="products-list" role="list">' + allProductsRow + items.map(function (item) {
      var count = productCount(item);
      var brandCount = brandsFor(item);
      var title = item.title || item.name || item.handle || item.id;
      var published = item.status === 'active' || item.published === true;
      var image = item.imageUrl ? '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" class="pi-thumb" style="width:40px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0;">' : '<div style="width:40px;height:40px;border-radius:4px;background:var(--surface2);margin-right:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="ph ph-image"></i></div>';
      var search = String(title + ' ' + (item.handle || item.slug || '') + ' ' + (item.description || '')).toLowerCase();
      return '<div class="products-row admin-selectable-row" role="listitem" data-catalog-id="' + esc(item.id) + '" data-collection-search="' + esc(search) + '" onclick="window._catalogBulkToggle(event,\'collections\',\'' + esc(item.id) + '\',function(){window._editAdminCollection(\'' + esc(item.id) + '\')})"><span class="admin-select-check"><i class="ph ph-check"></i></span>' +
        image +
        '<div style="flex:1;min-width:0;"><div class="pi-name">' + esc(title) + '</div>' +
        '<div class="pi-meta">' + count + ' products · ' + brandCount + ' brands</div></div>' +
        '<span class="badge" style="' + (published ? 'background:var(--surface2);color:var(--text2);' : 'background:var(--surface2);color:var(--muted);') + '">' + (published ? 'Active' : 'Draft') + '</span>' +
      '</div>';
    }).join('') + '<div class="orders-empty-sub" id="collections-admin-no-results" style="display:none;padding:18px 0;">No collections match your search.</div></div>';
  }

  // All Products is a built-in, read-only collection. It is not stored as
  // a normal Firestore collection because its membership is always derived
  // from the active product catalogue. The storefront's canonical route is /shop.
  window._showAllProductsCollectionInfo = function () {
    if (!isSuperAdmin()) return;
    var wrap = document.getElementById('collections-admin-form-wrap');
    if (!wrap) return;
    var activeProducts = (window._allProducts || []).filter(function (product) { return product.status === 'active'; });
    wrap.innerHTML =
      '<div style="border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px;background:var(--surface);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;"><div style="font-weight:600;">All Products <span class="badge" style="margin-left:6px;background:var(--surface2);color:var(--text2);">System collection</span></div><button type="button" class="btn btn-sm btn-ghost" onclick="window._cancelAdminCollectionForm()">Close</button></div>' +
        '<div class="form-group"><label>Collection name</label><input value="All Products" disabled></div>' +
        '<div class="form-group"><label>Product condition</label><input value="Include every active product" disabled><small style="color:var(--muted);">This system condition is fixed and cannot be edited. Products enter or leave automatically when their status changes.</small></div>' +
        '<div class="form-group"><label>Storefront URL</label><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><input value="https://janedore.co.za/shop" readonly style="flex:1;min-width:220px;"><a class="btn btn-ghost" href="https://janedore.co.za/shop" target="_blank" rel="noopener noreferrer">Open shop <i class="ph ph-arrow-square-out" style="margin-left:4px;"></i></a></div></div>' +
        '<div style="font-size:12px;color:var(--muted);">' + activeProducts.length + ' active products currently included.</div>' +
      '</div>';
  };
  window._filterAdminCollections = function () {
    var input = document.getElementById('collections-admin-search');
    var query = input ? input.value.toLowerCase().trim() : '';
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-collection-search]'));
    var visible = 0;
    rows.forEach(function (row) {
      var match = (row.getAttribute('data-collection-search') || '').indexOf(query) !== -1;
      row.style.display = match ? 'flex' : 'none';
      if (match) visible++;
    });
    var total = document.getElementById('collections-admin-total');
    if (total) total.textContent = visible + ' collection' + (visible === 1 ? '' : 's');
    var empty = document.getElementById('collections-admin-no-results');
    if (empty) empty.style.display = visible ? 'none' : 'block';
  };
  window._loadAdminCollections = loadCollections;
  window._renderCollectionsTab = function () {
    var mc = document.getElementById('main-content');
    if (!mc) return;
    if (!window._currentUser || !window._roleResolved) {
      mc.innerHTML = '<div class="empty-state"><p>Sign in to manage collections.</p></div>';
      return;
    }
    var canCreate = isSuperAdmin() || window._currentUserRole === 'VENDOR';
    var topActions = document.getElementById('top-nav-actions');
    if (topActions) {
      topActions.innerHTML =
        (canCreate ? '<button class="orders-create-btn" type="button" onclick="window._showAdminCollectionForm(null)" aria-label="Add collection" title="Add collection"><i class="ph ph-plus-circle"></i></button>' : '') +
        '<div class="admin-bulk-actions-wrap"><button class="orders-actions-btn" type="button" onclick="window._toggleCatalogActions(event,\'collections\')" aria-label="Collection actions" title="Actions"><i class="ph ph-dots-three"></i></button><div class="admin-catalog-actions" id="collections-actions-menu" hidden><div class="admin-catalog-actions-title">Actions</div><button type="button" onclick="window._catalogBulkStart(\'collections\')"><i class="ph ph-check-circle"></i> Select items</button><button type="button" onclick="window._refreshAdminCollections()"><i class="ph ph-arrow-clockwise"></i> Refresh collections</button></div></div>';
    }
    mc.innerHTML = '<div id="collections-admin-form-wrap"></div><div id="collections-admin-list"></div>';
    loadCollections();
  };
  window._refreshAdminCollections = function() {
    window._adminCollectionsData = null;
    loadCollections();
  };
  window._showAdminCollectionForm = function (collectionId) {
    var wrap = document.getElementById('collections-admin-form-wrap');
    if (!wrap) return;
    var collection = (window._adminCollectionsData || []).find(function (c) { return c.id === collectionId; }) || {
      title: '', handle: '', description: '', imageUrl: '', status: 'draft',
      sortOrder: ((window._adminCollectionsData || []).length + 1) * 10,
      collectionType: 'manual', automatedRule: 'sale', visibleInNavigation: false, featured: false, seoTitle: '', seoDescription: '',
      vendorId: isSuperAdmin() ? '' : window._currentVendorId
    };
    if (collectionId && !canManage(collection)) { showToast('You do not have permission to edit this collection.', 'error'); return; }
    var vendorOnly = window._currentUserRole === 'VENDOR';
    var products = (window._allProducts || []).filter(function (product) { return !vendorOnly || product.status !== 'active'; });
    wrap.innerHTML = '<form id="admin-collection-form" onsubmit="window._saveAdminCollection(event,\'' + esc(collectionId || '') + '\')" style="border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px;background:var(--surface);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;"><div style="font-weight:600;">' + (collectionId ? 'Edit collection' : 'New collection') + '</div><button type="button" class="btn btn-sm btn-ghost" onclick="window._cancelAdminCollectionForm()">Cancel</button></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">' +
      '<div class="form-group"><label for="admin-collection-title">Collection name</label><input id="admin-collection-title" name="title" required maxlength="100" value="' + esc(collection.title || collection.name || '') + '" placeholder="e.g. The Weekend Edit" oninput="window._suggestCollectionHandle()"></div>' +
      '<div class="form-group"><label for="admin-collection-handle">URL handle</label><input id="admin-collection-handle" name="handle" required maxlength="120" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="' + esc(collection.handle || collection.slug || collection.id || '') + '"' + (collectionId ? ' data-edited="true"' : '') + ' placeholder="the-weekend-edit"><small style="color:var(--muted);">Lowercase letters, numbers and hyphens.</small></div></div>' +
      '<div class="form-group"><label for="admin-collection-description">Description</label><textarea id="admin-collection-description" name="description" rows="3" maxlength="3000" placeholder="Tell customers what brings this edit together.">' + esc(collection.description || '') + '</textarea></div>' +
      '<div class="form-group"><label for="admin-collection-image">Collection image</label><div style="display:flex;gap:8px;flex-wrap:wrap;"><input id="admin-collection-image" name="imageUrl" value="' + esc(collection.imageUrl || '') + '" placeholder="Image URL" style="flex:1;min-width:180px;"><button class="btn btn-sm btn-ghost" type="button" onclick="window._uploadAdminCollectionImage()">Upload image</button></div><div id="admin-collection-image-preview" style="margin-top:10px;">' + (collection.imageUrl ? '<img src="' + esc(collection.imageUrl) + '" alt="" style="max-width:220px;max-height:150px;object-fit:cover;border-radius:8px;">' : '') + '</div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;"><div class="form-group"><label for="admin-collection-type">Product selection</label><select id="admin-collection-type" name="collectionType" onchange="window._toggleAdminCollectionRule()"><option value="manual"' + ((collection.collectionType || 'manual') === 'manual' ? ' selected' : '') + '>Manual selection</option><option value="automated"' + (collection.collectionType === 'automated' ? ' selected' : '') + '>Automated rule</option></select></div><div class="form-group" id="admin-collection-rule-wrap"><label for="admin-collection-rule">Automated rule</label><select id="admin-collection-rule" name="automatedRule"><option value="sale"' + ((collection.automatedRule || 'sale') === 'sale' ? ' selected' : '') + '>Products on sale</option><option value="newin"' + (collection.automatedRule === 'newin' ? ' selected' : '') + '>New arrivals</option><option value="freedelivery"' + (collection.automatedRule === 'freedelivery' ? ' selected' : '') + '>Free delivery products</option></select></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;"><div class="form-group"><label for="admin-collection-status">Status</label><select id="admin-collection-status" name="status"' + (vendorOnly ? ' disabled' : '') + '><option value="draft"' + ((collection.status !== 'active' && collection.published !== true) ? ' selected' : '') + '>Draft</option><option value="active"' + ((collection.status === 'active' || collection.published === true) ? ' selected' : '') + '>Published</option></select>' + (vendorOnly ? '<small style="color:var(--muted);">Vendor collections remain drafts until approved.</small>' : '') + '</div><div class="form-group"><label for="admin-collection-order">Display order</label><input id="admin-collection-order" name="sortOrder" type="number" min="0" step="1" value="' + esc(collection.sortOrder == null ? 0 : collection.sortOrder) + '"></div></div>' +
      '<div style="display:flex;gap:18px;flex-wrap:wrap;margin:8px 0 18px;"><label style="display:flex;align-items:center;gap:8px;font-size:12px;"><input type="checkbox" name="visibleInNavigation"' + (collection.visibleInNavigation ? ' checked' : '') + '> Show in the menu</label><label style="display:flex;align-items:center;gap:8px;font-size:12px;"><input type="checkbox" name="featured"' + (collection.featured ? ' checked' : '') + '> Feature in storefront sections</label></div>' +
      '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px;"><div style="font-weight:600;margin-bottom:12px;">Search engine listing</div><div class="form-group"><label for="admin-collection-seo-title">SEO title</label><input id="admin-collection-seo-title" name="seoTitle" maxlength="180" value="' + esc(collection.seoTitle || '') + '" placeholder="Defaults to collection name"></div><div class="form-group"><label for="admin-collection-seo-description">SEO description</label><textarea id="admin-collection-seo-description" name="seoDescription" rows="2" maxlength="320" placeholder="Short description for search results.">' + esc(collection.seoDescription || '') + '</textarea></div></div>' +
      '<div id="admin-collection-manual-products" style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px;"><div style="font-weight:600;margin-bottom:8px;">Products</div><input id="admin-collection-product-search" placeholder="Search products by name or brand" oninput="window._filterAdminCollectionProducts()" style="margin-bottom:8px;width:100%;"><div id="admin-collection-products" style="max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;">' +
      (products.length ? products.map(function (p) {
        var label = (p.name || p.title || p.id) + ' ' + (p.brand || '');
        return '<label data-collection-product-row data-search="' + esc(label.toLowerCase()) + '" style="display:flex;align-items:center;gap:9px;padding:8px 4px;font-size:12px;border-bottom:1px solid var(--border);"><input type="checkbox" name="productIds" value="' + esc(p.id) + '"' + ((collection.collectionType !== 'automated' && hasMember(p, collection)) ? ' checked' : '') + '><span style="flex:1;">' + esc(p.name || p.title || p.id) + '</span><span style="color:var(--muted);font-size:10px;">' + esc(p.brand || '') + '</span></label>';
      }).join('') : '<div style="padding:12px;color:var(--muted);">No products available in your scope.</div>') +
      '</div><small style="color:var(--muted);display:block;margin-top:6px;">Selected products use the existing collections field. Vendor accounts only see products in their own scope.</small></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px;"><button type="button" class="btn btn-ghost" onclick="window._cancelAdminCollectionForm()">Cancel</button><button type="submit" class="btn btn-primary">Save collection</button></div></form>';
    window._toggleAdminCollectionRule();
  };
  window._toggleAdminCollectionRule = function () {
    var type = document.getElementById('admin-collection-type');
    var rule = document.getElementById('admin-collection-rule-wrap');
    var products = document.getElementById('admin-collection-manual-products');
    var automated = !!type && type.value === 'automated';
    if (rule) rule.style.display = automated ? '' : 'none';
    if (products) products.style.display = automated ? 'none' : '';
  };

  window._suggestCollectionHandle = function () {
    var title = document.getElementById('admin-collection-title');
    var handle = document.getElementById('admin-collection-handle');
    if (title && handle && !handle.dataset.edited) handle.value = slugify(title.value);
  };
  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'admin-collection-handle') event.target.dataset.edited = 'true';
  });
  window._filterAdminCollectionProducts = function () {
    var input = document.getElementById('admin-collection-product-search');
    var query = input ? input.value.toLowerCase().trim() : '';
    var list = document.getElementById('admin-collection-products');
    if (list) list.querySelectorAll('[data-collection-product-row]').forEach(function (row) {
      row.style.display = (row.getAttribute('data-search') || '').indexOf(query) !== -1 ? 'flex' : 'none';
    });
  };
  window._uploadAdminCollectionImage = function () {
    if (typeof window._uploadToCloudinary !== 'function') { showToast('Image upload is not ready yet. Please try again.', 'error'); return; }
    window._uploadToCloudinary(function (url) {
      var input = document.getElementById('admin-collection-image');
      var preview = document.getElementById('admin-collection-image-preview');
      if (input) input.value = url;
      if (preview) preview.innerHTML = '<img src="' + esc(url) + '" alt="" style="max-width:220px;max-height:150px;object-fit:cover;border-radius:8px;">';
    }, false);
  };
  window._cancelAdminCollectionForm = function () {
    var wrap = document.getElementById('collections-admin-form-wrap');
    if (wrap) wrap.innerHTML = '';
  };
  window._editAdminCollection = function (id) { var item = (window._adminCollectionsData || []).find(function (c) { return c.id === id; }); if (item) window._showAdminCollectionForm(id); };
  window._saveAdminCollection = function (event, collectionId) {
    event.preventDefault();
    if (!window._currentUser || !window._roleResolved) { showToast('Please sign in again before saving.', 'error'); return; }
    var old = (window._adminCollectionsData || []).find(function (c) { return c.id === collectionId; }) || null;
    if (collectionId && !canManage(old)) { showToast('You do not have permission to edit this collection.', 'error'); return; }
    if (!isSuperAdmin() && window._currentUserRole !== 'VENDOR') { showToast('You do not have permission to manage collections.', 'error'); return; }
    var form = document.getElementById('admin-collection-form');
    if (!form) return;
    var title = form.elements.title.value.trim();
    var handle = form.elements.handle.value.trim().toLowerCase();
    if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) { showToast('Enter a collection name and a valid URL handle.', 'error'); return; }
    if ((window._adminCollectionsData || []).some(function (c) { return (c.handle || c.slug || c.id) === handle && c.id !== collectionId; })) { showToast('That collection URL handle is already in use.', 'error'); return; }
    if (window._currentUserRole === 'VENDOR' && old) {
      var oldHandleForScope = String(old.handle || old.slug || old.id).toLowerCase();
      var oldTitleForScope = String(old.title || old.name || '').toLowerCase();
      var activeMembership = (window._allProducts || []).some(function (product) {
        if (product.status !== 'active') return false;
        var values = Array.isArray(product.collections) ? product.collections : String(product.collections || '').split(',');
        return values.some(function (value) {
          value = String(value || '').trim().toLowerCase();
          return value === oldHandleForScope || (!!oldTitleForScope && value === oldTitleForScope);
        });
      });
      if (activeMembership && (handle !== oldHandleForScope || title.toLowerCase() !== oldTitleForScope)) {
        showToast('A Super Admin must rename this collection because it is assigned to published products.', 'error');
        return;
      }
    }
    var collectionType = form.elements.collectionType.value === 'automated' ? 'automated' : 'manual';
    var automatedRule = ['newin', 'freedelivery'].indexOf(form.elements.automatedRule.value) !== -1 ? form.elements.automatedRule.value : 'sale';
    var selectedIds = collectionType === 'manual' ? Array.prototype.slice.call(form.querySelectorAll('input[name="productIds"]:checked')).map(function (input) { return input.value; }) : [];
    var chosen = {}; selectedIds.forEach(function (id) { chosen[id] = true; });
    var status = isSuperAdmin() ? form.elements.status.value : 'draft';
    var data = {
      title: title, name: title, handle: handle, slug: handle,
      collectionType: collectionType, automatedRule: automatedRule,
      description: form.elements.description.value.trim(),
      imageUrl: form.elements.imageUrl.value.trim(),
      status: status, published: status === 'active',
      sortOrder: Math.max(0, Number(form.elements.sortOrder.value) || 0),
      visibleInNavigation: !!form.elements.visibleInNavigation.checked,
      featured: !!form.elements.featured.checked,
      seoTitle: form.elements.seoTitle.value.trim(),
      seoDescription: form.elements.seoDescription.value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!isSuperAdmin()) data.vendorId = window._currentVendorId;
    else data.vendorId = old ? (old.vendorId || null) : null;
    if (!collectionId) { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); data.createdBy = window._currentUser.uid; }
    var ref = collectionId ? collectionsRef.doc(collectionId) : collectionsRef.doc(handle);
    var batch = db.batch();
    batch.set(ref, data, { merge: true });
    (window._allProducts || []).forEach(function (product) {
      if (window._currentUserRole === 'VENDOR' && product.status === 'active') return;
      var memberships = Array.isArray(product.collections) ? product.collections.slice() : String(product.collections || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var oldHandle = old ? String(old.handle || old.slug || old.id).toLowerCase() : '';
      var oldTitle = old ? String(old.title || old.name || '').toLowerCase() : '';
      var wasMember = memberships.some(function (v) { v = String(v || '').trim().toLowerCase(); return v === oldHandle || (!!oldTitle && v === oldTitle); });
      var isSelected = !!chosen[product.id];
      var next = memberships.filter(function (v) { v = String(v || '').trim().toLowerCase(); return !(oldHandle && v === oldHandle) && !(oldTitle && v === oldTitle); });
      if (isSelected && next.indexOf(handle) === -1) next.push(handle);
      if (!isSelected && !wasMember) return;
      if (next.join('|') !== memberships.join('|')) batch.set(productsRef.doc(product.id), { collections: next }, { merge: true });
    });
    batch.commit().then(function () {
      showToast('Collection saved'); window._loadProducts(); loadCollections(); window._cancelAdminCollectionForm();
    }).catch(function (error) { showToast('Could not save collection: ' + (error.message || 'Please try again.'), 'error'); });
  };
  window._toggleAdminCollectionPublish = function (id) {
    var item = (window._adminCollectionsData || []).find(function (c) { return c.id === id; });
    if (!item || !canManage(item)) { showToast('You do not have permission to change this collection.', 'error'); return; }
    if (!isSuperAdmin()) { showToast('Only Super Admin can publish or unpublish collections.', 'error'); return; }
    var publish = !(item.status === 'active' || item.published === true);
    if (publish && !confirm('Publish "' + (item.title || item.name) + '" to the storefront?')) return;
    collectionsRef.doc(id).update({ status: publish ? 'active' : 'draft', published: publish, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { showToast(publish ? 'Collection published' : 'Collection unpublished'); loadCollections(); })
      .catch(function (error) { showToast('Could not update collection: ' + error.message, 'error'); });
  };
  window._deleteAdminCollection = function (id, skipConfirm) {
    var item = (window._adminCollectionsData || []).find(function (c) { return c.id === id; });
    if (!item || !canManage(item)) { showToast('You do not have permission to delete this collection.', 'error'); return Promise.reject(new Error('Permission denied')); }
    var title = item.title || item.name || item.handle || id;
    if (window._currentUserRole === 'VENDOR' && (window._allProducts || []).some(function (product) {
      if (product.status !== 'active') return false;
      return hasMember(product, item);
    })) {
      showToast('A Super Admin must delete this collection because it is assigned to published products.', 'error');
      return Promise.reject(new Error('Published products are assigned to this collection'));
    }
    if (!skipConfirm && !confirm('Delete "' + title + '"? This removes the collection record and its membership from loaded products. This cannot be undone.')) return Promise.resolve(false);
    var handle = String(item.handle || item.slug || id).toLowerCase();
    var name = String(item.title || item.name || '').toLowerCase();
    var batch = db.batch(); batch.delete(collectionsRef.doc(id));
    (window._allProducts || []).forEach(function (product) {
      if (window._currentUserRole === 'VENDOR' && product.status === 'active') return;
      var memberships = Array.isArray(product.collections) ? product.collections.slice() : String(product.collections || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var next = memberships.filter(function (value) { value = String(value || '').trim().toLowerCase(); return value !== handle && (!name || value !== name); });
      if (next.join('|') !== memberships.join('|')) batch.set(productsRef.doc(product.id), { collections: next }, { merge: true });
    });
    return batch.commit().then(function () { if (!skipConfirm) { showToast('Collection deleted'); window._loadProducts(); loadCollections(); } return true; })
      .catch(function (error) { if (!skipConfirm) showToast('Could not delete collection: ' + error.message, 'error'); throw error; });
  };
})();