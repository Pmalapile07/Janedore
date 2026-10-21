// ==================== ADMIN LIVE-PREVIEW BRIDGE ====================
// Lets the admin Homepage editor (admin-homepage.js) embed the real
// storefront in an iframe and edit text/images directly on it —
// click a heading, type in place and watch it change; click an image,
// pick a new one — instead of hunting for the matching sidebar field.
//
// Inert everywhere else: only activates when window.__adminPreview is
// true, which index.html's own early inline <script> sets (before any
// deferred script, including this one, can run) by checking both that
// this page is actually embedded in an iframe AND loaded with
// ?adminPreview=1 — so a customer's own browser never runs any of
// this.
//
// Two layers of click targets, by design:
//  - FIELDS: specific elements (a heading, a button's text, a
//    background image) that map 1:1 to a real <input name="..."> in
//    admin-homepage.js's form. Clicking one edits it directly.
//  - SECTIONS: the 6 <section> wrappers around those fields. Clicking
//    anywhere else inside one (a product card, empty padding — things
//    with no inline-editable equivalent here) falls back to jumping
//    the admin to that section's accordion, same as before FIELDS
//    existed. FIELD click handlers stop propagation so they take
//    priority over this fallback when both could apply.
(function () {
  if (!window.__adminPreview) return;

  var SECTIONS = {
    'hero': 'hero',
    'home-all-products': 'arrivals',
    'home-categories': 'category',
    'home-shop-clothing': 'clothing',
    'home-shop-accessories': 'accessories',
    'home-editorial-banner': 'banner',
    'home-shop-brand': 'brand'
  };

  // apply(el, url) updates an image field's visual from a freshly
  // uploaded URL (see the 'imageUpdated' listener at the bottom) —
  // background-image divs and real <img> tags need different code.
  function applyBackgroundImage(el, url) { el.style.backgroundImage = "url('" + url + "')"; }

  var FIELDS = [
    { inputName: 'logoImage', type: 'image', selector: '.nav-logo', apply: function (el) {
      // Keep the text wordmark visible; uploaded images no longer replace it.
      var text = el.querySelector('#nav-logo-text');
      if (text) text.style.display = '';
    } },
    { inputName: 'heroImage', type: 'image', selector: '#hero-bg', apply: applyBackgroundImage },
    { inputName: 'heroHeading', type: 'text', selector: '#hero-heading' },
    { inputName: 'heroButtonText', type: 'text', selector: '#hero-shop-btn' },
    { inputName: 'arrivalsHeading', type: 'text', selector: '#arrivals-heading' },
    { inputName: 'arrivalsButtonText', type: 'text', selector: '#arrivals-view-all-btn' },
    { inputName: 'categoryHeading', type: 'text', selector: '#shop-by-category-heading' },
    { inputName: 'clothingHeading', type: 'text', selector: '#clothing-heading' },
    { inputName: 'clothingButtonText', type: 'text', selector: '#clothing-view-all-btn' },
    { inputName: 'accessoriesHeading', type: 'text', selector: '#accessories-heading' },
    { inputName: 'accessoriesButtonText', type: 'text', selector: '#accessories-view-all-btn' },
    { inputName: 'bannerImage', type: 'image', selector: '#editorial-banner-img', apply: applyBackgroundImage },
    { inputName: 'bannerHeading', type: 'text', selector: '#banner-heading' },
    { inputName: 'bannerButtonText', type: 'text', selector: '#banner-btn' },
    { inputName: 'brandHeading', type: 'text', selector: '#shop-by-brand-heading' }
  ];

  var fieldsByInputName = {};
  FIELDS.forEach(function (f) { fieldsByInputName[f.inputName] = f; });

  function post(msg) {
    window.parent.postMessage(Object.assign({ source: 'janedore-preview' }, msg), window.location.origin);
  }

  function init() {
    document.documentElement.classList.add('admin-preview-active');

    Object.keys(SECTIONS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) wireSectionFallback(el, SECTIONS[id]);
    });

    FIELDS.forEach(function (f) {
      var el = document.querySelector(f.selector);
      if (!el) return;
      if (f.type === 'text') wireTextField(el, f.inputName);
      else wireImageField(el, f.inputName);
    });

    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || e.origin !== window.location.origin) return;
      var data = e.data;
      if (!data || data.source !== 'janedore-admin') return;
      if (data.type === 'imageUpdated') {
        var field = fieldsByInputName[data.inputName];
        if (field && field.apply) {
          var el = document.querySelector(field.selector);
          if (el) field.apply(el, data.url);
        }
      }
    });
  }

  // Real onclick handlers get wired onto several of these elements
  // later by site-content.js, once its own Firestore read resolves —
  // slower than this script's DOMContentLoaded timing, so ours
  // reliably registers first and stopImmediatePropagation() in it
  // blocks theirs from ever firing. .nav-logo's onclick is different —
  // set via an inline HTML attribute, which exists before this script
  // runs at all — so it's cleared outright rather than raced.
  function neutralizeExistingClick(el) {
    el.onclick = null;
  }

  function wireSectionFallback(sectionEl, field) {
    sectionEl.addEventListener('click', function (e) {
      e.preventDefault();
      post({ type: 'sectionClicked', field: field });
    });
  }

  function wireTextField(el, inputName) {
    neutralizeExistingClick(el);
    el.classList.add('admin-preview-hoverable', 'admin-preview-text-field');
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (el.isContentEditable) return; // already editing — let the click place the caret normally
      el.contentEditable = 'true';
      el.classList.add('admin-preview-editing');
      el.focus();
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    el.addEventListener('keydown', function (e) {
      // Single-line fields — Enter commits instead of inserting a
      // line break.
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
    el.addEventListener('input', function () {
      post({ type: 'fieldEdited', inputName: inputName, value: el.textContent });
    });
    el.addEventListener('blur', function () {
      el.contentEditable = 'false';
      el.classList.remove('admin-preview-editing');
      post({ type: 'fieldEdited', inputName: inputName, value: el.textContent });
    });
  }

  function wireImageField(el, inputName) {
    neutralizeExistingClick(el);
    el.classList.add('admin-preview-hoverable', 'admin-preview-image-field');
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      post({ type: 'imageFieldClicked', inputName: inputName });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
