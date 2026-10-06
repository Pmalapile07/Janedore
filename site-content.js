// ==================== SITE CONTENT (ADMIN-EDITABLE HOMEPAGE) ====================
// Hero image/heading/button, New Arrivals' heading/button, Shop by
// Category's heading + tiles, Shop by Clothing's heading/button, the
// editorial banner, Shop by Brand's heading, and the newsletter copy
// all used to be hardcoded in index.html/collection.js. They now come
// from siteContent/homepage (written by the admin "Homepage" tab,
// admin-homepage.js) + siteContent/collectionPages (written by the
// admin "Pages" tab, admin-pages.js), fetched once here.
//
// index.html already ships every one of these elements with literal
// empty-state text ("Heading"/"Button") baked in, so a blank/unset
// Firestore doc never looks broken mid-fetch or if admin hasn't
// touched a field yet — it just obviously reads as unfilled-in.

window._siteContent = { homepage: {}, collectionPages: {} };

// A link is always {type, value}. 'home'/'products'/'sale' need no
// value; everything else does. Each type maps to a real navigation
// function already used elsewhere in the app, so a button/tile can
// point anywhere a normal nav link can — not just a handful of pages.
function goToSiteLink(link) {
  if (!link || !link.type) return;
  const value = (link.value || '').trim();
  if (link.type === 'home') { navigateTo('home'); return; }
  if (link.type === 'category' && value) { navigateToCategory(value); return; }
  if (link.type === 'vendor' && value) { navigateToVendor(value); return; }
  if (link.type === 'product' && value) {
    const product = PRODUCTS.find(p => p.id === value);
    if (product) { goToProduct(product.id); return; }
  }
  if (link.type === 'page' && value) { navigateToContentPage(value); return; }
  if (link.type === 'sale') { navigateToSale(); return; }
  if (link.type === 'url' && value) { window.location.href = value; return; }
  navigateTo('products');
}

// Swaps a CSS background-image box from its shimmer placeholder to the
// real image only once that image has actually finished downloading —
// same fade-avoidance-of-a-half-loaded-image idea as the product grid's
// img-loaded class, just for background-image elements instead of <img>.
// No url at all (admin hasn't set one yet) settles on a plain, static
// neutral box (.content-empty) rather than leaving the animated shimmer
// running forever, which would look like a stuck loading state.
function loadBackgroundImage(el, url) {
  if (!el) return;
  if (!url) {
    el.classList.remove('content-shimmer');
    el.classList.add('content-empty');
    el.style.backgroundImage = '';
    return;
  }
  el.classList.remove('content-empty');
  el.classList.add('content-shimmer');
  const probe = new Image();
  probe.onload = function () {
    el.style.backgroundImage = "url('" + url.replace(/['"\\]/g, '') + "')";
    el.classList.remove('content-shimmer');
  };
  probe.onerror = function () {
    el.classList.remove('content-shimmer');
    el.classList.add('content-empty');
  };
  probe.src = url;
}

function renderHero(hero) {
  hero = hero || {};
  const headingEl = document.getElementById('hero-heading');
  const btnEl = document.getElementById('hero-shop-btn');
  if (headingEl) { headingEl.textContent = hero.heading || 'Heading'; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = hero.buttonText || 'Button';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(hero.buttonLink); };
  }
  loadBackgroundImage(document.getElementById('hero-bg'), hero.imageUrl);
}

function renderNewArrivalsHeader(arrivals) {
  arrivals = arrivals || {};
  const headingEl = document.getElementById('arrivals-heading');
  const btnEl = document.getElementById('arrivals-view-all-btn');
  if (headingEl) { headingEl.textContent = arrivals.heading || 'Collection Heading'; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = arrivals.buttonText || 'Button';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(arrivals.buttonLink); };
  }
}

function renderShopByCategory(shopByCategory) {
  shopByCategory = shopByCategory || {};
  const headingEl = document.getElementById('shop-by-category-heading');
  if (headingEl) { headingEl.textContent = shopByCategory.heading || 'Heading'; headingEl.classList.remove('skeleton-text'); }

  const grid = document.getElementById('home-categories-grid');
  if (!grid) return;
  let tiles = Array.isArray(shopByCategory.tiles) ? shopByCategory.tiles : [];
  // Nothing configured in admin yet — show 4 empty placeholder tiles
  // (the grid's original fixed layout) instead of leaving the whole
  // section blank, same empty-state idea as everything else here.
  const isPlaceholder = tiles.length === 0;
  if (isPlaceholder) tiles = [{}, {}, {}, {}];

  grid.innerHTML = tiles.map(function (_, i) {
    return '<div class="home-category-card" data-tile-index="' + i + '">' +
      '<div class="home-category-img"><div class="home-category-label"></div></div>' +
    '</div>';
  }).join('');

  grid.querySelectorAll('[data-tile-index]').forEach(function (cardEl, i) {
    const tile = tiles[i];
    cardEl.querySelector('.home-category-label').textContent = tile.label || 'Category';
    cardEl.onclick = isPlaceholder ? null : function () { goToSiteLink(tile.link); };
    loadBackgroundImage(cardEl.querySelector('.home-category-img'), tile.imageUrl);
  });
}

function renderShopByClothingHeader(clothing) {
  clothing = clothing || {};
  const headingEl = document.getElementById('clothing-heading');
  const btnEl = document.getElementById('clothing-view-all-btn');
  if (headingEl) { headingEl.textContent = clothing.heading || 'Heading'; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = clothing.buttonText || 'Button';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(clothing.buttonLink); };
  }
}

function renderEditorialBanner(banner) {
  banner = banner || {};
  const headingEl = document.getElementById('banner-heading');
  const btnEl = document.getElementById('banner-btn');
  const imgEl = document.getElementById('editorial-banner-img');
  if (headingEl) { headingEl.textContent = banner.heading || 'Heading'; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = banner.buttonText || 'Button';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function (e) { e.stopPropagation(); goToSiteLink(banner.buttonLink); };
  }
  if (imgEl) imgEl.onclick = function () { goToSiteLink(banner.buttonLink); };
  loadBackgroundImage(imgEl, banner.imageUrl);
}

function renderShopByBrandHeader(shopByBrand) {
  shopByBrand = shopByBrand || {};
  const headingEl = document.getElementById('shop-by-brand-heading');
  if (headingEl) { headingEl.textContent = shopByBrand.heading || 'Heading'; headingEl.classList.remove('skeleton-text'); }
}

function renderNewsletter(newsletter) {
  newsletter = newsletter || {};
  const headingEl = document.getElementById('newsletter-heading');
  const subtextEl = document.getElementById('newsletter-subtext');
  const disclaimerEl = document.getElementById('newsletter-disclaimer');
  if (headingEl) { headingEl.textContent = newsletter.heading || 'Heading'; headingEl.classList.remove('skeleton-text'); }
  if (subtextEl) subtextEl.textContent = newsletter.subtext || '';
  if (disclaimerEl) disclaimerEl.textContent = newsletter.disclaimer || '';
}

async function renderSiteContent() {
  try {
    const [homepageSnap, collectionPagesSnap] = await Promise.all([
      db.collection('siteContent').doc('homepage').get(),
      db.collection('siteContent').doc('collectionPages').get()
    ]);
    const homepage = homepageSnap.exists ? (homepageSnap.data() || {}) : {};
    const collectionPages = collectionPagesSnap.exists ? (collectionPagesSnap.data() || {}) : {};
    window._siteContent = { homepage, collectionPages };

    renderHero(homepage.hero);
    renderNewArrivalsHeader(homepage.newArrivals);
    renderShopByCategory(homepage.shopByCategory);
    renderShopByClothingHeader(homepage.shopByClothing);
    renderEditorialBanner(homepage.editorialBanner);
    renderShopByBrandHeader(homepage.shopByBrand);
    renderNewsletter(homepage.newsletter);

    // The category/products page title+description may already be on
    // screen (a direct link straight into a collection page) using the
    // hardcoded fallback — refresh it now that the admin override, if
    // any, is in.
    if (typeof updateCollectionTitle === 'function') updateCollectionTitle();
  } catch (e) {
    console.warn('[SITE CONTENT] Could not load homepage content:', e.message);
    // Fetch itself failed (not just an empty/unset doc, which the
    // render* functions above already handle) — stop the shimmer so it
    // doesn't spin forever and fall back to the literal "Heading"/
    // "Button" placeholder text baked into the HTML.
    document.querySelectorAll('.skeleton-text').forEach(function (el) {
      el.classList.remove('skeleton-text');
    });
  }
}
