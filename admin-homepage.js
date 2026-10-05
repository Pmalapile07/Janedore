(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var db        = window._adminDB;

  var homepageRef       = db.collection('siteContent').doc('homepage');
  var collectionPagesRef = db.collection('siteContent').doc('collectionPages');

  var _homepageData = {};
  var _collectionPagesData = {};
  var _tilesState = []; // Shop by Category tiles — kept as live in-memory
                         // state so add/remove can re-render the list
                         // without losing whatever's already typed.

  // Slugs/labels match collection.js's catTitles/CLOTHING_CATEGORIES/
  // ACCESSORY_CATEGORIES exactly (plus 'all' and 'sale', the two
  // non-category collection views) — keep these two lists in sync if a
  // category is ever renamed, same hazard as admin-pages.js's PAGE_GROUPS
  // vs. footer.js's link list.
  var COLLECTION_SLUGS = [
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

  var LINK_TYPES = [
    { value: 'products', label: 'All Products' },
    { value: 'sale',     label: 'Sale' },
    { value: 'category', label: 'Category' },
    { value: 'vendor',   label: 'Vendor / Brand' },
    { value: 'url',      label: 'Custom URL' }
  ];

  function linkPlaceholder(type) {
    if (type === 'category') return 'e.g. all-clothing';
    if (type === 'vendor')   return 'vendor slug or id';
    if (type === 'url')      return 'https://...';
    return '';
  }

  // A link is always {type, value} — 'products'/'sale' need no value,
  // 'category'/'vendor'/'url' do. window._toggleLinkValueInput keeps the
  // value input's visibility in sync when the type is changed after load.
  function linkFieldHtml(prefix, link, label) {
    link = link || {};
    var type = link.type || 'products';
    var needsValue = type === 'category' || type === 'vendor' || type === 'url';
    var optionsHtml = LINK_TYPES.map(function (t) {
      return '<option value="' + t.value + '"' + (t.value === type ? ' selected' : '') + '>' + esc(t.label) + '</option>';
    }).join('');
    return (
      '<div class="form-group site-link-field" style="padding:0;">' +
        '<label>' + esc(label) + '</label>' +
        '<div style="display:flex;gap:8px;">' +
          '<select name="' + prefix + 'Type" style="flex:0 0 150px;" onchange="window._toggleLinkValueInput(this)">' + optionsHtml + '</select>' +
          '<input name="' + prefix + 'Value" class="site-link-value" value="' + esc(link.value || '') + '" placeholder="' + esc(linkPlaceholder(type)) + '" style="flex:1;' + (needsValue ? '' : 'display:none;') + '"' + (needsValue ? '' : ' disabled') + '>' +
        '</div>' +
      '</div>'
    );
  }

  window._toggleLinkValueInput = function (sel) {
    var row = sel.closest('.site-link-field');
    var valueInput = row && row.querySelector('.site-link-value');
    if (!valueInput) return;
    var needsValue = sel.value === 'category' || sel.value === 'vendor' || sel.value === 'url';
    valueInput.disabled = !needsValue;
    valueInput.style.display = needsValue ? '' : 'none';
    valueInput.placeholder = linkPlaceholder(sel.value);
    if (!needsValue) valueInput.value = '';
  };

  function imageFieldHtml(name, url, label) {
    return (
      '<div class="form-group" style="padding:0;">' +
        '<label>' + esc(label) + '</label>' +
        '<div style="display:flex;gap:8px;">' +
          '<input name="' + name + '" value="' + esc(url || '') + '" placeholder="https://..." style="flex:1;">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._uploadSingleImageTo(this)"><i class="ph-light ph-cloud-arrow-up"></i> Upload</button>' +
        '</div>' +
        (url ? '<img src="' + esc(url) + '" style="max-width:160px;max-height:120px;object-fit:cover;border-radius:6px;margin-top:6px;display:block;">' : '') +
      '</div>'
    );
  }

  function tileRowHtml(tile, i) {
    tile = tile || {};
    var linkPrefix = 'tile' + i + 'Link';
    return (
      '<div class="card" style="margin-bottom:10px;">' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:11px;color:var(--muted);">Tile ' + (i + 1) + '</span>' +
            '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--danger);" onclick="window._removeCategoryTile(' + i + ')">Remove</button>' +
          '</div>' +
          '<div class="form-group" style="padding:0;"><label>Label</label><input name="tile' + i + 'Label" value="' + esc(tile.label || '') + '" placeholder="Category"></div>' +
          imageFieldHtml('tile' + i + 'Image', tile.imageUrl, 'Image') +
          linkFieldHtml(linkPrefix, tile.link, 'Destination') +
        '</div>' +
      '</div>'
    );
  }

  function renderTilesContainer() {
    var c = safeEl('category-tiles-container');
    if (!c) return;
    c.innerHTML = _tilesState.map(function (t, i) { return tileRowHtml(t, i); }).join('') ||
      '<p class="account-muted" style="font-size:11px;">No tiles yet — click "Add tile" below.</p>';
  }

  function _syncTilesFromDOM() {
    var form = safeEl('homepage-form');
    if (!form) return;
    _tilesState.forEach(function (tile, i) {
      var labelEl = form['tile' + i + 'Label'];
      var imageEl = form['tile' + i + 'Image'];
      var typeEl  = form['tile' + i + 'LinkType'];
      var valueEl = form['tile' + i + 'LinkValue'];
      if (labelEl) tile.label = labelEl.value;
      if (imageEl) tile.imageUrl = imageEl.value;
      if (typeEl) tile.link = { type: typeEl.value, value: valueEl ? valueEl.value : '' };
    });
  }

  window._addCategoryTile = function () {
    _syncTilesFromDOM();
    _tilesState.push({ label: '', imageUrl: '', link: { type: 'category', value: '' } });
    renderTilesContainer();
  };

  window._removeCategoryTile = function (i) {
    _syncTilesFromDOM();
    _tilesState.splice(i, 1);
    renderTilesContainer();
  };

  window._renderHomepageTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    Promise.all([homepageRef.get(), collectionPagesRef.get()]).then(function (results) {
      _homepageData = results[0].exists ? (results[0].data() || {}) : {};
      _collectionPagesData = results[1].exists ? (results[1].data() || {}) : {};
      _tilesState = (_homepageData.shopByCategory && Array.isArray(_homepageData.shopByCategory.tiles))
        ? _homepageData.shopByCategory.tiles.slice()
        : [];
      renderHomepageForm();
    }).catch(function (e) {
      showToast('Error loading homepage content: ' + e.message, 'error');
    });
  };

  function renderHomepageForm() {
    var mc = safeEl('main-content');
    if (!mc) return;
    var h = _homepageData;
    var hero = h.hero || {};
    var arrivals = h.newArrivals || {};
    var shopCat = h.shopByCategory || {};
    var clothing = h.shopByClothing || {};
    var banner = h.editorialBanner || {};
    var brand = h.shopByBrand || {};
    var news = h.newsletter || {};

    var collectionRowsHtml = COLLECTION_SLUGS.map(function (item) {
      var data = _collectionPagesData[item.slug] || {};
      return (
        '<div class="form-group" style="padding:0;margin-bottom:10px;">' +
          '<label>' + esc(item.label) + ' <span style="font-size:10px;color:var(--muted);">— /' + esc(item.slug) + '</span></label>' +
          '<input name="cp_' + item.slug + '_title" value="' + esc(data.title || '') + '" placeholder="' + esc(item.label.toUpperCase()) + '" style="margin-bottom:6px;">' +
          '<textarea name="cp_' + item.slug + '_desc" placeholder="Optional description shown under the title" style="min-height:50px;">' + esc(data.description || '') + '</textarea>' +
        '</div>'
      );
    }).join('');

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<div class="section-title">Homepage</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'homepage-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +

      '<form id="homepage-form" onsubmit="window._handleHomepageSubmit(event)">' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Hero</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            imageFieldHtml('heroImage', hero.imageUrl, 'Image') +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="heroHeading" value="' + esc(hero.heading || '') + '" placeholder="Heading"></div>' +
            '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="heroButtonText" value="' + esc(hero.buttonText || '') + '" placeholder="Button"></div>' +
            linkFieldHtml('heroButtonLink', hero.buttonLink, 'Button Link') +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">New Arrivals</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="arrivalsHeading" value="' + esc(arrivals.heading || '') + '" placeholder="Collection Heading"></div>' +
            '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="arrivalsButtonText" value="' + esc(arrivals.buttonText || '') + '" placeholder="Button"></div>' +
            linkFieldHtml('arrivalsButtonLink', arrivals.buttonLink, 'Button Link') +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Shop by Category</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="categoryHeading" value="' + esc(shopCat.heading || '') + '" placeholder="Heading"></div>' +
            '<div id="category-tiles-container"></div>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._addCategoryTile()"><i class="ph-light ph-plus"></i> Add tile</button>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Shop by Clothing</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="clothingHeading" value="' + esc(clothing.heading || '') + '" placeholder="Heading"></div>' +
            '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="clothingButtonText" value="' + esc(clothing.buttonText || '') + '" placeholder="Button"></div>' +
            linkFieldHtml('clothingButtonLink', clothing.buttonLink, 'Button Link') +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Editorial Banner</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            imageFieldHtml('bannerImage', banner.imageUrl, 'Image') +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="bannerHeading" value="' + esc(banner.heading || '') + '" placeholder="Heading"></div>' +
            '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="bannerButtonText" value="' + esc(banner.buttonText || '') + '" placeholder="Button"></div>' +
            linkFieldHtml('bannerButtonLink', banner.buttonLink, 'Button Link') +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Shop by Brand</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<p class="account-muted" style="font-size:11px;margin:0;">The brand tiles themselves come from Vendors — add or edit a brand\'s logo there. Only the section heading is set here.</p>' +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="brandHeading" value="' + esc(brand.heading || '') + '" placeholder="Heading"></div>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Newsletter</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Heading</label><input name="newsletterHeading" value="' + esc(news.heading || '') + '" placeholder="Heading"></div>' +
            '<div class="form-group" style="padding:0;"><label>Subtext</label><input name="newsletterSubtext" value="' + esc(news.subtext || '') + '" placeholder=""></div>' +
            '<div class="form-group" style="padding:0;"><label>Disclaimer</label><input name="newsletterDisclaimer" value="' + esc(news.disclaimer || '') + '" placeholder=""></div>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Collection Pages</span></div>' +
          '<div style="padding:12px 16px;">' +
            collectionRowsHtml +
          '</div>' +
        '</div>' +

      '</form>';

    renderTilesContainer();
  }

  window._handleHomepageSubmit = function (e) {
    e.preventDefault();
    if (!window._guard('homepage', 'update')) return;
    var form = e.target;

    function readLink(prefix) {
      var typeEl = form[prefix + 'Type'];
      var valueEl = form[prefix + 'Value'];
      return { type: typeEl ? typeEl.value : 'products', value: valueEl ? valueEl.value.trim() : '' };
    }

    _syncTilesFromDOM();
    var tiles = _tilesState.map(function (t) {
      return { label: (t.label || '').trim(), imageUrl: (t.imageUrl || '').trim(), link: t.link || { type: 'category', value: '' } };
    });

    var homepageData = {
      hero: {
        imageUrl: form.heroImage.value.trim(),
        heading: form.heroHeading.value.trim(),
        buttonText: form.heroButtonText.value.trim(),
        buttonLink: readLink('heroButtonLink')
      },
      newArrivals: {
        heading: form.arrivalsHeading.value.trim(),
        buttonText: form.arrivalsButtonText.value.trim(),
        buttonLink: readLink('arrivalsButtonLink')
      },
      shopByCategory: {
        heading: form.categoryHeading.value.trim(),
        tiles: tiles
      },
      shopByClothing: {
        heading: form.clothingHeading.value.trim(),
        buttonText: form.clothingButtonText.value.trim(),
        buttonLink: readLink('clothingButtonLink')
      },
      editorialBanner: {
        imageUrl: form.bannerImage.value.trim(),
        heading: form.bannerHeading.value.trim(),
        buttonText: form.bannerButtonText.value.trim(),
        buttonLink: readLink('bannerButtonLink')
      },
      shopByBrand: {
        heading: form.brandHeading.value.trim()
      },
      newsletter: {
        heading: form.newsletterHeading.value.trim(),
        subtext: form.newsletterSubtext.value.trim(),
        disclaimer: form.newsletterDisclaimer.value.trim()
      },
      updatedAt: new Date().toISOString()
    };

    var collectionPagesData = { updatedAt: new Date().toISOString() };
    COLLECTION_SLUGS.forEach(function (item) {
      collectionPagesData[item.slug] = {
        title: (form['cp_' + item.slug + '_title'].value || '').trim(),
        description: (form['cp_' + item.slug + '_desc'].value || '').trim()
      };
    });

    Promise.all([
      homepageRef.set(homepageData, { merge: true }),
      collectionPagesRef.set(collectionPagesData, { merge: true })
    ]).then(function () {
      _homepageData = homepageData;
      _collectionPagesData = collectionPagesData;
      showToast('Homepage saved');
    }).catch(function (err) {
      showToast('Error: ' + err.message, 'error');
    });
  };

})();
