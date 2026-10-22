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

  // Departments and categories from the category tree (taxonomy.js) —
  // "All Products" and "Sale" are their own separate link types below,
  // not categories.
  var CATEGORY_SLUGS = (function () {
    var list = [];
    window.JDTaxonomy.DEPARTMENTS.forEach(function (d) {
      list.push({ slug: d.slug, label: d.name });
      d.categories.forEach(function (c) { list.push({ slug: c.slug, label: d.name + ' › ' + c.name }); });
    });
    return list;
  })();

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
      // Links saved to all-clothing / all-accessories are those departments.
      var dept = window.JDTaxonomy.department(currentValue);
      var current = dept ? dept.slug : currentValue;
      return CATEGORY_SLUGS.map(function (c) {
        return '<option value="' + c.slug + '"' + (c.slug === current ? ' selected' : '') + '>' + esc(c.label) + '</option>';
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
      '<p class="account-muted" style="font-size:11px;">No tiles yet. Click "Add tile" below.</p>';
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
  // `field` is a stable slug (not the display title, which is free text
  // that could change) matching the slug the live preview iframe posts
  // back via postMessage when its corresponding section is clicked —
  // see openHomepageAccordionField() below and preview-bridge.js.
  function accordionSectionHtml(icon, title, previewHtml, bodyHtml, field) {
    return (
      '<div class="card" style="margin-bottom:10px;" data-homepage-field="' + esc(field || '') + '">' +
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
    // Defaults match site-content.js until the section is first saved.
    var accessories = h.shopByAccessories || { heading: 'Shop by accessories', buttonText: 'Shop now', buttonLink: { type: 'category', value: 'accessories' } };
    var banner = h.editorialBanner || {};
    var brand = h.shopByBrand || {};
    var news = h.newsletter || {};

    var sectionsHtml =
      accordionSectionHtml('ph-stamp', 'Site Logo',
        thumbHtml(h.logoUrl) + '<span>' + (h.logoUrl ? 'Image set' : 'Using text wordmark') + '</span>',
        imageFieldHtml('logoImage', h.logoUrl, 'Logo') +
        '<p class="account-muted" style="font-size:11px;margin:0;">Replaces the "JANEDORE" text in the header once set. Clear the URL to go back to text.</p>',
        'logo'
      ) +

      accordionSectionHtml('ph-image', 'Hero',
        thumbHtml(hero.imageUrl) + '<span>' + esc(hero.heading || 'Heading') + '</span>',
        imageFieldHtml('heroImage', hero.imageUrl, 'Image') +
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="heroHeading" value="' + esc(hero.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="heroButtonText" value="' + esc(hero.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('heroButtonLink', hero.buttonLink, 'Button Link'),
        'hero'
      ) +

      accordionSectionHtml('ph-squares-four', 'New Arrivals',
        '<span>' + esc(arrivals.heading || 'Collection Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="arrivalsHeading" value="' + esc(arrivals.heading || '') + '" placeholder="Collection Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="arrivalsButtonText" value="' + esc(arrivals.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('arrivalsButtonLink', arrivals.buttonLink, 'Button Link'),
        'arrivals'
      ) +

      accordionSectionHtml('ph-grid-four', 'Shop by Category',
        '<span>' + esc(shopCat.heading || 'Heading') + ' · ' + _tilesState.length + ' tile' + (_tilesState.length === 1 ? '' : 's') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="categoryHeading" value="' + esc(shopCat.heading || '') + '" placeholder="Heading"></div>' +
        '<div id="category-tiles-container"></div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="window._addCategoryTile()"><i class="ph-light ph-plus"></i> Add tile</button>',
        'category'
      ) +

      accordionSectionHtml('ph-t-shirt', 'Shop by Clothing',
        '<span>' + esc(clothing.heading || 'Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="clothingHeading" value="' + esc(clothing.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="clothingButtonText" value="' + esc(clothing.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('clothingButtonLink', clothing.buttonLink, 'Button Link'),
        'clothing'
      ) +

      accordionSectionHtml('ph-handbag', 'Shop by Accessories',
        '<span>' + esc(accessories.heading || 'Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="accessoriesHeading" value="' + esc(accessories.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="accessoriesButtonText" value="' + esc(accessories.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('accessoriesButtonLink', accessories.buttonLink, 'Button Link'),
        'accessories'
      ) +

      accordionSectionHtml('ph-rectangle', 'Editorial Banner',
        thumbHtml(banner.imageUrl) + '<span>' + esc(banner.heading || 'Heading') + '</span>',
        imageFieldHtml('bannerImage', banner.imageUrl, 'Image') +
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="bannerHeading" value="' + esc(banner.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Button Text</label><input name="bannerButtonText" value="' + esc(banner.buttonText || '') + '" placeholder="Button"></div>' +
        linkFieldHtml('bannerButtonLink', banner.buttonLink, 'Button Link'),
        'banner'
      ) +

      accordionSectionHtml('ph-handshake', 'Shop by Brand',
        '<span>' + esc(brand.heading || 'Heading') + '</span>',
        '<p class="account-muted" style="font-size:11px;margin:0;">The brand tiles themselves come from Vendors. Add or edit a brand\'s logo there. Only the section heading is set here.</p>' +
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="brandHeading" value="' + esc(brand.heading || '') + '" placeholder="Heading"></div>',
        'brand'
      ) +

      accordionSectionHtml('ph-envelope-simple', 'Newsletter',
        '<span>' + esc(news.heading || 'Heading') + '</span>',
        '<div class="form-group" style="padding:0;"><label>Heading</label><input name="newsletterHeading" value="' + esc(news.heading || '') + '" placeholder="Heading"></div>' +
        '<div class="form-group" style="padding:0;"><label>Subtext</label><input name="newsletterSubtext" value="' + esc(news.subtext || '') + '" placeholder=""></div>' +
        '<div class="form-group" style="padding:0;"><label>Disclaimer</label><input name="newsletterDisclaimer" value="' + esc(news.disclaimer || '') + '" placeholder=""></div>',
        'newsletter'
      );

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<div class="section-title">Homepage</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'homepage-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +
      '<p class="account-muted" style="font-size:11px;margin:0 0 12px;">Collection page titles &amp; descriptions moved to the Pages tab.</p>' +
      livePreviewHtml() +
      '<form id="homepage-form" onsubmit="window._handleHomepageSubmit(event)">' +
        sectionsHtml +
      '</form>';

    renderTilesContainer();
    wireLivePreview();
  }

  // ==================== LIVE PREVIEW ====================
  // The real storefront, loaded in an iframe pointing at this same
  // origin's own homepage (?adminPreview=1 opts it into
  // preview-bridge.js's click-reporting behavior — see that file).
  // Clicking a section in the preview posts a message back here, which
  // opens and scrolls to the matching accordion above instead of
  // leaving you to hunt for the right one by title.
  //
  // This is a click-to-jump aid, not live bidirectional editing — the
  // iframe shows a snapshot of the live site, not a draft of unsaved
  // form changes. "Refresh" below just reloads it.
  var _previewListenerBound = false;
  var _previewOpen = true;

  function livePreviewHtml() {
    return (
      '<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<i class="ph-light ph-browser"></i>' +
            '<span style="font-size:12px;font-weight:500;">Live Preview</span>' +
            '<span class="account-muted" style="font-size:11px;">Click a section below to jump to its fields</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._refreshHomepagePreview()"><i class="ph-light ph-arrow-clockwise"></i></button>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._toggleHomepagePreview()" id="homepage-preview-toggle"><i class="ph-light ph-caret-up"></i></button>' +
          '</div>' +
        '</div>' +
        '<div id="homepage-preview-wrap" style="height:70vh;max-height:640px;">' +
          '<iframe id="homepage-preview-frame" src="/?adminPreview=1" style="width:100%;height:100%;border:none;display:block;" title="Live homepage preview"></iframe>' +
        '</div>' +
      '</div>'
    );
  }

  window._refreshHomepagePreview = function () {
    var f = safeEl('homepage-preview-frame');
    if (f) f.src = f.src;
  };

  window._toggleHomepagePreview = function () {
    _previewOpen = !_previewOpen;
    var wrap = safeEl('homepage-preview-wrap');
    var btn = safeEl('homepage-preview-toggle');
    if (wrap) wrap.style.display = _previewOpen ? '' : 'none';
    if (btn) btn.innerHTML = '<i class="ph-light ' + (_previewOpen ? 'ph-caret-up' : 'ph-caret-down') + '"></i>';
  };

  // Opens the accordion card whose data-homepage-field matches, closes
  // the rest (so the one you just clicked is easy to find), and
  // scrolls it into view with a brief highlight flash.
  function openHomepageAccordionField(field) {
    var target = document.querySelector('[data-homepage-field="' + field + '"]');
    if (!target) return;
    document.querySelectorAll('[data-homepage-field] > details').forEach(function (d) {
      d.open = false;
    });
    var details = target.querySelector('details');
    if (details) details.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('homepage-field-flash');
    setTimeout(function () { target.classList.remove('homepage-field-flash'); }, 1200);
  }

  // Sets the real form field a preview edit corresponds to, so Save
  // (unchanged, bulk-submits the whole form) picks it up exactly like
  // it would if you'd typed into the sidebar directly — this is the
  // only thing a preview edit actually touches; nothing hits Firestore
  // until Save. Dispatches 'input' in case anything else is listening
  // for it (nothing is, today, but mirrors how _uploadSingleImageTo
  // already does this for manual uploads).
  function setFormFieldValue(inputName, value) {
    var input = document.querySelector('#homepage-form [name="' + inputName + '"]');
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wireLivePreview() {
    if (_previewListenerBound) return;
    _previewListenerBound = true;
    window.addEventListener('message', function (e) {
      // Same-origin only — the iframe always loads this site's own
      // homepage, never anything external, so a different origin here
      // means the message isn't from our own preview bridge.
      if (e.origin !== window.location.origin) return;
      var frame = safeEl('homepage-preview-frame');
      if (!frame || e.source !== frame.contentWindow) return;
      var data = e.data;
      if (!data || data.source !== 'janedore-preview') return;

      if (data.type === 'sectionClicked') {
        openHomepageAccordionField(data.field);
      } else if (data.type === 'fieldEdited') {
        // Typing directly in the preview — sync on every keystroke so
        // Save always has the latest value, but no accordion-jumping
        // or scrolling here: that's the whole point of editing inline
        // instead of through the sidebar.
        setFormFieldValue(data.inputName, data.value);
      } else if (data.type === 'imageFieldClicked') {
        if (!window._uploadToCloudinary) return;
        window._uploadToCloudinary(function (url) {
          setFormFieldValue(data.inputName, url);
          showToast('Image uploaded!');
          // Reflects the new image in the preview immediately, same
          // as the upload already does in the sidebar's own thumbnail
          // — without this it'd only show up after Save + a reload.
          frame.contentWindow.postMessage(
            { source: 'janedore-admin', type: 'imageUpdated', inputName: data.inputName, url: url },
            window.location.origin
          );
        }, false);
      }
    });
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
      shopByAccessories: {
        heading: form.accessoriesHeading.value.trim(),
        buttonText: form.accessoriesButtonText.value.trim(),
        buttonLink: readLink('accessoriesButtonLink')
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
