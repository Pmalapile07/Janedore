(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var db        = window._adminDB;

  var pagesRef = db.collection('pages');
  window._pagesRef = pagesRef;
  var collectionPagesRef = db.collection('siteContent').doc('collectionPages');

  // Slugs match the footer.js "policies" and "help" links exactly —
  // keep these two lists in sync if a footer link is ever renamed.
  var PAGE_GROUPS = [
    { group: 'Policies', items: [
      { slug: 'about',             label: 'About' },
      { slug: 'shipping-policy',   label: 'Shipping Policy' },
      { slug: 'return-policy',     label: 'Return Policy' },
      { slug: 'privacy-policy',    label: 'Privacy Policy' },
      { slug: 'terms-conditions',  label: 'Terms & Conditions' }
    ]},
    { group: 'Help', items: [
      { slug: 'faq',         label: 'FAQ' },
      { slug: 'size-guide',  label: 'Size Guide' },
      { slug: 'shipping',    label: 'Shipping' },
      { slug: 'returns',     label: 'Returns' },
      { slug: 'contact',     label: 'Contact' }
    ]}
  ];

  // Mirrors collection.js's catTitles / admin-homepage.js's CATEGORY_SLUGS
  // (plus 'all' and 'sale', the two non-category collection views) — keep
  // these in sync if a category is ever renamed. Lives here, not in the
  // Homepage tab, since editing one of these is the same list->form
  // motion as every other page above, not a homepage section.
  var COLLECTION_PAGE_ITEMS = [
    { slug: 'all',             label: 'All Products' },
    { slug: 'sale',            label: 'Sale' },
    { slug: 'all-clothing',    label: 'Clothing' },
    { slug: 'all-accessories', label: 'Accessories' },
    { slug: 'homeware',        label: 'Homeware' },
    { slug: 'dresses',         label: 'Dresses' },
    { slug: 'tops',            label: 'Tops' },
    { slug: 'bottoms',         label: 'Bottoms' },
    { slug: 'jackets',         label: 'Jackets' },
    { slug: 'sets',            label: 'Sets' },
    { slug: 'bags',            label: 'Bags' },
    { slug: 'jewelry',         label: 'Jewelry' },
    { slug: 'sunglasses',      label: 'Sunglasses' },
    { slug: 'parfum',          label: 'Scent' }
  ];

  var _pagesData = {}; // slug -> { title, content, updatedAt }
  var _collectionPagesData = {}; // slug -> { title, description }

  function loadPagesData() {
    return Promise.all([
      pagesRef.get().then(function(snapshot) {
        _pagesData = {};
        snapshot.docs.forEach(function(d) { _pagesData[d.id] = d.data(); });
      }),
      collectionPagesRef.get().then(function(doc) {
        _collectionPagesData = doc.exists ? (doc.data() || {}) : {};
      })
    ]).catch(function(e) {
      showToast('Error loading pages: ' + e.message, 'error');
    });
  }

  window._renderPagesTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    loadPagesData().then(renderPagesList);
  };

  function renderPagesList() {
    var mc = safeEl('main-content');
    if (!mc) return;

    var groupsHtml = PAGE_GROUPS.map(function(g) {
      var rowsHtml = g.items.map(function(item) {
        var data = _pagesData[item.slug];
        var hasContent = !!(data && data.content && data.content.trim());
        return '<div class="product-row" onclick="window._openPageForm(\'' + esc(item.slug) + '\')" style="cursor:pointer;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="pi-name">' + esc(item.label) + '</div>' +
            '<div class="pi-meta">/pages/' + esc(item.slug) + '</div>' +
          '</div>' +
          '<span class="badge badge-' + (hasContent ? 'active' : 'draft') + '">' + (hasContent ? 'Published' : 'Empty') + '</span>' +
        '</div>';
      }).join('');

      return '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">' + esc(g.group) + '</span></div>' +
        '<div class="product-list">' + rowsHtml + '</div>' +
      '</div>';
    }).join('');

    var collectionRowsHtml = COLLECTION_PAGE_ITEMS.map(function(item) {
      var data = _collectionPagesData[item.slug];
      var hasContent = !!(data && ((data.title && data.title.trim()) || (data.description && data.description.trim())));
      return '<div class="product-row" onclick="window._openCollectionPageForm(\'' + esc(item.slug) + '\')" style="cursor:pointer;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="pi-name">' + esc(item.label) + '</div>' +
          '<div class="pi-meta">/collections/' + esc(item.slug) + '</div>' +
        '</div>' +
        '<span class="badge badge-' + (hasContent ? 'active' : 'draft') + '">' + (hasContent ? 'Customized' : 'Default') + '</span>' +
      '</div>';
    }).join('');

    var collectionGroupHtml = '<div class="card" style="margin-bottom:12px;">' +
      '<div class="card-header"><span class="card-title">Collection Pages</span></div>' +
      '<div class="product-list">' + collectionRowsHtml + '</div>' +
    '</div>';

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Pages</div>' +
      '</div>' +
      groupsHtml +
      collectionGroupHtml;
  }

  window._openCollectionPageForm = function(slug) {
    var item = COLLECTION_PAGE_ITEMS.find(function(i) { return i.slug === slug; });
    if (!item) { showToast('Collection page not found', 'error'); return; }
    var data = _collectionPagesData[slug] || {};

    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<button type="button" class="btn btn-ghost" onclick="window._renderPagesTab()"><i class="ph-light ph-arrow-left" style="margin-right:4px;"></i> Cancel</button>' +
        '<div style="font-size:13px;font-weight:500;color:var(--text);">' + esc(item.label) + '</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'collection-page-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +

      '<form id="collection-page-form" onsubmit="window._handleCollectionPageSubmit(event,\'' + esc(slug) + '\')">' +
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Content</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Title</label><input name="title" value="' + esc(data.title || '') + '" placeholder="' + esc(item.label.toUpperCase()) + '"></div>' +
            '<div class="form-group" style="padding:0;"><label>Description <span style="font-size:10px;color:var(--muted);">— shown under the title, optional</span></label><textarea name="description" style="min-height:120px;">' + esc(data.description || '') + '</textarea></div>' +
          '</div>' +
        '</div>' +
      '</form>';
  };

  window._handleCollectionPageSubmit = function(e, slug) {
    e.preventDefault();
    if (!window._guard('homepage', 'update')) return;
    var form = e.target;
    var data = {
      title: form.title.value.trim(),
      description: form.description.value.trim()
    };
    var update = {};
    update[slug] = data;
    update.updatedAt = new Date().toISOString();
    collectionPagesRef.set(update, { merge: true }).then(function() {
      _collectionPagesData[slug] = data;
      showToast('Collection page saved');
      window._renderPagesTab();
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._openPageForm = function(slug) {
    var allItems = PAGE_GROUPS.reduce(function(acc, g) { return acc.concat(g.items); }, []);
    var item = allItems.find(function(i) { return i.slug === slug; });
    if (!item) { showToast('Page not found', 'error'); return; }
    var data = _pagesData[slug] || {};

    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<button type="button" class="btn btn-ghost" onclick="window._renderPagesTab()"><i class="ph-light ph-arrow-left" style="margin-right:4px;"></i> Cancel</button>' +
        '<div style="font-size:13px;font-weight:500;color:var(--text);">' + esc(item.label) + '</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'page-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +

      '<form id="page-form" onsubmit="window._handlePageSubmit(event,\'' + esc(slug) + '\')">' +
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Content</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Title</label><input name="title" value="' + esc(data.title || item.label) + '" required></div>' +
            '<div class="form-group" style="padding:0;"><label>Body <span style="font-size:10px;color:var(--muted);">— HTML supported</span></label><textarea name="content" style="min-height:280px;">' + esc(data.content || '') + '</textarea></div>' +
          '</div>' +
        '</div>' +
      '</form>';
  };

  window._handlePageSubmit = function(e, slug) {
    e.preventDefault();
    if (!window._guard('pages', 'update')) return;
    var form = e.target;
    var data = {
      title: form.title.value,
      content: form.content.value,
      updatedAt: new Date().toISOString()
    };
    pagesRef.doc(slug).set(data, { merge: true }).then(function() {
      _pagesData[slug] = data;
      showToast('Page saved');
      window._renderPagesTab();
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

})();
