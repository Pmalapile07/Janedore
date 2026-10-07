(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var db        = window._adminDB;

  var homepageRef = db.collection('siteContent').doc('homepage');

  var _homepageData = {};
  var _tilesState = []; // Shop by Category tiles — kept as live in-memory
                         // state so add/remove can re-render the list
                         // without losing whatever's already typed.
  var _vendorsCache = null;
  var _productsCache = null;

  // Real, known category slugs only — "All Products" and "Sale" are
  // their own separate link types below, not categories. Mirrors
  // collection.js's catTitles; kept as its own small list here since
  // this file doesn't share scope with that one.
  var CATEGORY_SLUGS = [
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

  // Mirrors admin-pages.js's PAGE_GROUPS slugs/labels exactly — keep
  // these two lists in sync if a policy/help page is ever renamed.
  var CONTENT_PAGE_SLUGS = [
    { slug: 'about',            label: 'About' },
    { slug: 'shipping-policy',  label: 'Shipping Policy' },
    { slug: 'return-policy',    label: 'Return Policy' },
    { slug: 'privacy-policy',   label: 'Privacy Policy' },
    { slug: 'terms-conditions', label: 'Terms & Conditions' },
    { slug: 'faq',              label: 'FAQ' },
    { slug: 'size-guide',       label: 'Size Guide' },
    { slug: 'shipping',         label: 'Shipping' },
    { slug: 'returns',          label: 'Returns' },
    { slug: 'contact',          label: 'Contact' }
  ];

  var LINK_TYPES = [
    { value: 'home',     label: 'Home' },
    { value: 'products',label: 'All Products' },
    { value: 'sale',     label: 'Sale' },
    { value: 'category', label: 'Category' },
    { value: 'vendor',   label: 'Vendor / Brand' },
    { value: 'product',  label: 'A Product' },
    { value: 'page',     label: 'A Page' },
    { value: 'url',      label: 'Custom URL' }
  ];

  function linkOptionsFor(type, currentValue) {
    if (type === 'category') {
      return CATEGORY_SLUGS.map(function (c) {
        return '<option value="' + c.slug + '"' + (c.slug === currentValue ? ' selected' : '') + '>' + esc(c.label) + '</option>';
      }).join('');
    }
    if (type === 'vendor') {
      return (_vendorsCache || []).map(function (v) {
        var slug = v.slug || v.id;
        var name = v.name || v.brand || v.brandName || slug;
        return '<option value="' + esc(slug) + '"' + (slug === currentValue ? ' selected' : '') + '>' + esc(name) + '</option>';
      }).join('');
    }
    if (type === 'product') {
      return (_productsCache || []).map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === currentValue ? ' selected' : '') + '>' + esc(p.name || p.id) + '</option>';
      }).join('');
    }
    if (type === 'page') {
      return CONTENT_PAGE_SLUGS.map(function (pg) {
        return '<option value="' + pg.slug + '"' + (pg.slug === currentValue ? ' selected' : '') + '>' + esc(pg.label) + '</option>';
      }).join('');
    }
    return '';
  }

  function valueControlHtml(prefix, type, value) {
    var needsDropdown = type === 'category' || type === 'vendor' || type === 'product' || type === 'page';
    if (needsDropdown) {
      var opts = linkOptionsFor(type, value);
      return '<select name="' + prefix + 'Value" class="site-link-value">' +
        (opts || '<option value="">None available</option>') + '</select>';
    }
    if (type === 'url') {
      return '<input name="' + prefix + 'Value" class="site-link-value" value="' + esc(value || '') + '" placeholder="https://...">';
    }
    return '<input type="hidden" name="' + prefix + 'Value" class="site-link-value" value="">';
  }

  // A link is always {type, value}. Switching type swaps the value
  // control entirely (a different dropdown, a text field, or nothing) —
  // window._onLinkTypeChange rebuilds it rather than just hiding/showing,
  // since category/vendor/product/page each need their own option list.
  function linkFieldHtml(prefix, link, label) {
    link = link || {};
    var type = link.type || 'products';
    var typeOptionsHtml = LINK_TYPES.map(function (t) {
      return '<option value="' + t.value + '"' + (t.value === type ? ' selected' : '') + '>' + esc(t.label) + '</option>';
    }).join('');
    return (
      '<div class="form-group site-link-field" style="padding:0;">' +
        '<label>' + esc(label) + '</label>' +
        '<div style="display:flex;gap:8px;">' +
          '<select name="' + prefix + 'Type" class="site-link-type" style="flex:0 0 150px;" onchange="window._onLinkTypeChange(this)">' + typeOptionsHtml + '</select>' +
          '<span class="site-link-value-wrap" style="flex:1;">' + valueControlHtml(prefix, type, link.value) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  window._onLinkTypeChange = function (sel) {
    var row = sel.closest('.site-link-field');
    var wrap = row && row.querySelector('.site-link-value-wrap');
    if (!wrap) return;
    var prefix = sel.name.slice(0, -4); // strip trailing "Type"
    wrap.innerHTML = valueControlHtml(prefix, sel.value, '');
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

  // Accordion section — collapsed by default, a short preview line in
  // the summary (current heading/thumbnail) so you can see what's set
  // without opening it. Native <details>/<summary>, no custom JS needed
  // for the expand/collapse behavior itself.
  function accordionSectionHtml(icon, title, previewHtml, bodyHtml) {
    return (
      '<div class="card" style="margin-bottom:10px;">' +
        '<details class="homepage-accordion">' +
          '<summary class="homepage-accordion-summary">' +
            '<span class="homepage-accordion-summary-main">' +
              '<i class="ph-light ' + icon + '"></i>' +
              '<span class="homepage-accordion-title">' + esc(title) + '</span>' +
            '</span>' +
            '<span class="homepage-accordion-preview">' + previewHtml + '</span>' +
            '<i class="ph-light ph-caret-down homepage-accordion-chevron"></i>' +
          '</summary>' +
          '<div class="homepage-accordion-body">' + bodyHtml + '</div>' +
        '</details>' +
      '</div>'
    );
  }

  function thumbHtml(url) {
    return url ? '<img src="' + esc(url) + '" class="homepage-accordion-thumb">' : '';
  }

  function ensureVendorsLoaded() {
    if (window._vendorsData) { _vendorsCache = window._vendorsData; return Promise.resolve(); }
    return db.collection('vendors').get().then(function (snap) {
      _vendorsCache = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      window._vendorsData = _vendorsCache;
    }).catch(function () { _vendorsCache = []; });
  }

  function ensureProductsLoaded() {
    if (_productsCache) return Promise.resolve();
    return db.collection('products').get().then(function (snap) {
      _productsCache = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    }).catch(function () { _productsCache = []; });
  }

  window._renderHomepageTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    Promise.all([homepageRef.get(), ensureVendorsLoaded(), ensureProductsLoaded()]).then(function (results) {
      var homepageSnap = results[0];
      _homepageData = homepageSnap.exists ? (homepageSnap.data() || {}) : {};
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

    var sectionsHtml =
      accordionSectionHtml('ph-stamp', 'Site Logo',
        thumbHtml(h.logoUrl) + '<span>' + (h.logoUrl ? 'Image set' : 'Using text wordmark') + '</span>',
        imageFieldHtml('logoImage', h.logoUrl, 'Logo') +
        '<p class="account-muted" style="font-size:11px;margin:0;">Replaces the "JANEDORE" text in the header once set. Clear the URL to go back to text.</p>'
      ) +

      accordionSectionHtml('ph-image', 'Hero',
        thumbHtml(hero.imageUrl) + '<span>' + esc(hero.heading || 'Heading') + '</span>',
        imageFieldHtml('heroImage', hero.imageUrl, 'Image') +
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="heroHeading" value="' + esc(hero.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="heroButtonText" value="' + esc(hero.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('heroButtonLink', hero.buttonLink, 'Button Link')
      ) +

      accordionSectionHtml('ph-squares-four', 'New Arrivals',
        '<span>' + esc(arrivals.heading || 'Collection Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="arrivalsHeading" value="' + esc(arrivals.heading || '') + '" placeholder="Collection Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="arrivalsButtonText" value="' + esc(arrivals.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('arrivalsButtonLink', arrivals.buttonLink, 'Button Link')
      ) +

      accordionSectionHtml('ph-grid-four', 'Shop by Category',
        '<span>' + esc(shopCat.heading || 'Heading') + ' · ' + _tilesState.length + ' tile' + (_tilesState.length === 1 ? '' : 's') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="categoryHeading" value="' + esc(shopCat.heading || '') + '" placeholder="Heading"></div>' +
        '<div id="category-tiles-container"></div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="window._addCategoryTile()"><i class="ph-light ph-plus"></i> Add tile</button>'
      ) +

      accordionSectionHtml('ph-t-shirt', 'Shop by Clothing',
        '<span>' + esc(clothing.heading || 'Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="clothingHeading" value="' + esc(clothing.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="clothingButtonText" value="' + esc(clothing.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('clothingButtonLink', clothing.buttonLink, 'Button Link')
      ) +

      accordionSectionHtml('ph-rectangle', 'Editorial Banner',
        thumbHtml(banner.imageUrl) + '<span>' + esc(banner.heading || 'Heading') + '</span>',
        imageFieldHtml('bannerImage', banner.imageUrl, 'Image') +
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="bannerHeading" value="' + esc(banner.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="bannerButtonText" value="' + esc(banner.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('bannerButtonLink', banner.buttonLink, 'Button Link')
      ) +

      accordionSectionHtml('ph-handshake', 'Shop by Brand',
        '<span>' + esc(brand.heading || 'Heading') + '</span>',
        '<p class="account-muted" style="font-size:11px;margin:0;">The brand tiles themselves come from Vendors — add or edit a brand\'s logo there. Only the section heading is set here.</p>' +
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="brandHeading" value="' + esc(brand.heading || '') + '" placeholder="Heading"></div>'
      ) +

      accordionSectionHtml('ph-envelope-simple', 'Newsletter',
        '<span>' + esc(news.heading || 'Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="newsletterHeading" value="' + esc(news.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Subtext</label><input name="newsletterSubtext" value="' + esc(news.subtext || '') + '" placeholder=""></div>' +
        '<div class="form-group" style="padding:0;"><label>Disclaimer</label><input name="newsletterDisclaimer" value="' + esc(news.disclaimer || '') + '" placeholder=""></div>'
      );

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<div class="section-title">Homepage</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'homepage-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +
      '<p class="account-muted" style="font-size:11px;margin:0 0 12px;">Collection page titles &amp; descriptions moved to the Pages tab.</p>' +
      '<form id="homepage-form" onsubmit="window._handleHomepageSubmit(event)">' +
        sectionsHtml +
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
      logoUrl: form.logoImage.value.trim(),
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

    homepageRef.set(homepageData, { merge: true }).then(function () {
      _homepageData = homepageData;
      showToast('Homepage saved');
    }).catch(function (err) {
      showToast('Error: ' + err.message, 'error');
    });
  };

})();
