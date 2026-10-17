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
    ]},
    // Text is built into the page (brand-partnerships.js); only the hero
    // image is set here.
    { group: 'Brand Partnerships', items: [
      { slug: 'brand-partnerships', label: 'Brand Partnerships', imagesOnly: true }
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
        var hasContent = item.imagesOnly ? PAGE_IMAGE_SLOTS.some(function (sl) { return !!(data && data[sl.key]); }) : !!(data && data.content && data.content.trim());
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
            '<div class="form-group" style="padding:0;"><label>Description <span style="font-size:10px;color:var(--muted);">(shown under the title, optional)</span></label><textarea name="description" style="min-height:120px;">' + esc(data.description || '') + '</textarea></div>' +
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
    if (item.imagesOnly) { renderImagesPageForm(mc, item, data); return; }

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
            '<div class="form-group" style="padding:0;"><label>Body <span style="font-size:10px;color:var(--muted);">(HTML supported)</span></label><textarea name="content" style="min-height:280px;">' + esc(data.content || '') + '</textarea></div>' +
          '</div>' +
        '</div>' +
      '</form>';
  };

  // Images and a hero video only (Brand Partnerships): the page text is part of the site
  // design; each slot is optional and the page leaves it out when empty
  // (brand-partnerships.js reads the same keys).
  var PAGE_IMAGE_SLOTS = [
    { key: 'heroVideoUrl', label: 'Hero video', ratio: '16/9', video: true, help: 'Plays silently on a loop behind the headline. Keep it short (around 10 to 20 seconds), landscape and under 100 MB; sound is removed. When set, it replaces the hero image, which is then used as the still frame for visitors with reduced motion or data saver on.' },
    { key: 'heroImageUrl', label: 'Hero image', ratio: '4/5', help: 'At the top of the page, beside the headline on desktop and above it on mobile. A portrait image works best. Without one, the hero is text only.' },
    { key: 'selectionImageUrl', label: 'What we look for', ratio: '16/9', help: 'Under the paragraph that introduces what we look for. A landscape image works best.' },
  ];

  function pageImagePreviewHtml(url, ratio, video) {
    if (video && url) return '<video src="' + esc(url) + '" muted loop autoplay playsinline style="display:block;width:100%;aspect-ratio:' + ratio + ';max-height:320px;object-fit:cover;background:#111;border-radius:6px;"></video>';
    return url
      ? '<div style="aspect-ratio:' + ratio + ';max-height:320px;background:#f4f4f4 center/cover no-repeat;background-image:url(\'' + esc(url) + '\');border-radius:6px;"></div>'
      : '<div style="aspect-ratio:' + ratio + ';max-height:320px;background:#f4f4f4;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;">No image. This spot is left out of the page.</div>';
  }

  function renderImagesPageForm(mc, item, data) {
    var cards = PAGE_IMAGE_SLOTS.map(function (sl) {
      var url = data[sl.key] || '';
      return '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">' + esc(sl.label) + '</span></div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div id="page-img-preview-' + sl.key + '">' + pageImagePreviewHtml(url, sl.ratio, sl.video) + '</div>' +
          '<input type="hidden" id="page-img-' + sl.key + '" value="' + esc(url) + '">' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="btn btn-ghost" id="page-img-btn-' + sl.key + '" onclick="window.' + (sl.video ? '_uploadPageVideo' : '_uploadPageImage') + '(\'' + sl.key + '\')"><i class="ph-light ph-upload-simple" style="margin-right:4px;"></i> Upload ' + (sl.video ? 'video' : 'image') + '</button>' +
            '<button type="button" class="btn btn-ghost" onclick="window._setPageImage(\'' + sl.key + '\',\'\')">Remove</button>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + esc(sl.help) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<button type="button" class="btn btn-ghost" onclick="window._renderPagesTab()"><i class="ph-light ph-arrow-left" style="margin-right:4px;"></i> Cancel</button>' +
        '<div style="font-size:13px;font-weight:500;color:var(--text);">' + esc(item.label) + '</div>' +
        '<button type="button" class="btn btn-primary" onclick="window._saveImagesPage(\'' + esc(item.slug) + '\')"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' + cards;
  }

  window._setPageImage = function(key, url) {
    var sl = PAGE_IMAGE_SLOTS.find(function (x) { return x.key === key; });
    var input = safeEl('page-img-' + key), prev = safeEl('page-img-preview-' + key);
    if (input) input.value = url;
    if (prev && sl) prev.innerHTML = pageImagePreviewHtml(url, sl.ratio, sl.video);
  };

  // Videos go to Cloudinary's video endpoint (signed via admin.js).
  window._uploadPageVideo = function(key) {
    if (!window.CLOUDINARY_CLOUD_NAME) { showToast('Cloudinary is not configured.', 'error'); return; }
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,video/quicktime';
    input.onchange = function() {
      var file = input.files && input.files[0];
      if (!file) return;
      if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) { showToast('Please choose an MP4, WebM or MOV video.', 'error'); return; }
      if (file.size > 100 * 1024 * 1024) { showToast('That video is over 100 MB. Please use a shorter or smaller file.', 'error'); return; }
      var btn = safeEl('page-img-btn-' + key);
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
      window._cloudinaryUpload(file, 'video')
        .then(function(result) {
          window._setPageImage(key, result.secure_url);
          showToast('Video uploaded. Press Save to publish it.');
        })
        .catch(function(e) { showToast('Upload failed: ' + e.message, 'error'); })
        .then(function() { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-light ph-upload-simple" style="margin-right:4px;"></i> Upload video'; } });
    };
    input.click();
  };

  window._uploadPageImage = function(key) {
    if (!window._uploadToCloudinary) { showToast('Image upload is not available', 'error'); return; }
    window._uploadToCloudinary(function(url) { window._setPageImage(key, url); showToast('Image uploaded. Press Save to publish it.'); }, false);
  };

  window._saveImagesPage = function(slug) {
    if (!window._guard('pages', 'update')) return;
    var data = { updatedAt: new Date().toISOString() };
    PAGE_IMAGE_SLOTS.forEach(function (sl) { var input = safeEl('page-img-' + sl.key); data[sl.key] = input ? input.value : ''; });
    pagesRef.doc(slug).set(data, { merge: true }).then(function() {
      _pagesData[slug] = Object.assign({}, _pagesData[slug], data);
      showToast('Page saved');
      window._renderPagesTab();
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
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
