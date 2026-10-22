// ==================== SITE CONTENT (ADMIN-EDITABLE HOMEPAGE) ====================
// Hero image/heading/button, New arrivals' heading/button, Shop by
// Category's heading + tiles, Shop by Clothing's heading/button, the
// editorial banner, Shop by brand's heading, and the newsletter copy
// all used to be hardcoded in index.html/collection.js. They now come
// from siteContent/homepage (written by the admin "Homepage" tab,
// admin-homepage.js) + siteContent/collectionPages (written by the
// admin "Pages" tab, admin-pages.js), fetched once here.
//
// A field with nothing set (mid-fetch, or admin genuinely hasn't
// filled it in yet) renders as empty, never as a literal placeholder
// word like "Heading"/"Button" — those are internal/CMS strings and
// must never be customer-visible, even briefly. server.js
// server-side-renders the current siteContent/homepage doc straight
// into the HTML response (see injectHomepageContent() there), so in
// the common case these elements already hold real text before this
// file's own fetch below even starts; this fetch just keeps them
// current if admin changed something since that response was cached.

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
  if (link.type === 'collection' && value) { navigateToCollection(value); return; }
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

// Same w_/q_auto/f_auto Cloudinary transform idea as collection.js's
// gridThumbURL(), just with c_limit instead of c_fill — these boxes
// (hero, category tiles, editorial banner) don't share one fixed aspect
// ratio the way product cards do, so capping width without forcing a
// crop avoids distorting whatever crop the admin actually uploaded.
function contentImageURL(url, maxWidth) {
  return safeImageURL(url).replace('/upload/', '/upload/f_auto,q_auto,c_limit,w_' + maxWidth + '/');
}

// Swaps a CSS background-image box from its shimmer placeholder to the
// real image only once that image has actually finished downloading —
// same fade-avoidance-of-a-half-loaded-image idea as the product grid's
// img-loaded class, just for background-image elements instead of <img>.
// No url at all (admin hasn't set one yet) settles on a plain, static
// neutral box (.content-empty) rather than leaving the animated shimmer
// running forever, which would look like a stuck loading state.
function loadBackgroundImage(el, url, maxWidth) {
  if (!el) return;
  if (!url) {
    el.classList.remove('content-shimmer');
    el.classList.add('content-empty');
    el.style.backgroundImage = '';
    return;
  }
  const sized = maxWidth ? contentImageURL(url, maxWidth) : url;
  // server.js's SSR injection (injectHomepageContent) may have already
  // set this exact image before this script ever ran — skip re-adding
  // the shimmer class for a reload that would just flicker the already-
  // correct image back to loading and immediately back again.
  if (el.style.backgroundImage === "url('" + sized.replace(/['"\\]/g, '') + "')") return;
  el.classList.remove('content-empty');
  el.classList.add('content-shimmer');
  const probe = new Image();
  probe.onload = function () {
    el.style.backgroundImage = "url('" + sized.replace(/['"\\]/g, '') + "')";
    el.classList.remove('content-shimmer');
  };
  probe.onerror = function () {
    el.classList.remove('content-shimmer');
    el.classList.add('content-empty');
  };
  probe.src = sized;
}

function renderHero(hero) {
  hero = hero || {};
  const headingEl = document.getElementById('hero-heading');
  const btnEl = document.getElementById('hero-shop-btn');
  if (headingEl) { headingEl.textContent = hero.heading || ''; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = hero.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(hero.buttonLink); };
  }
  loadBackgroundImage(document.getElementById('hero-bg'), hero.imageUrl, 1600);
}

// Homepage section headings: the first word on its own line and the
// rest under it ("Shop / accessories"), so a heading never runs into
// its button. One-word headings stay as they are.
function setSectionHeading(el, text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  el.textContent = words[0] || '';
  if (words.length > 1) {
    el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(words.slice(1).join(' ')));
  }
}

function renderNewArrivalsHeader(arrivals) {
  arrivals = arrivals || {};
  const headingEl = document.getElementById('arrivals-heading');
  const btnEl = document.getElementById('arrivals-view-all-btn');
  if (headingEl) { setSectionHeading(headingEl, arrivals.heading); headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = arrivals.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(arrivals.buttonLink); };
  }
}

// Collections ticked "Show in the menu" (Admin > Collections) are listed
// in the menu's links, ahead of Gift cards. Sale and New in already have
// their own menu entries, so a collection with either handle is skipped.
function renderMenuCollectionLinks() {
  const links = document.querySelector('#menu-panel-main .menu-links');
  if (!links || typeof window._loadPublishedCollections !== 'function') return;
  links.querySelectorAll('[data-dynamic-collection-link]').forEach(function (el) { el.remove(); });
  window._loadPublishedCollections().then(function (collections) {
    if (!links.isConnected) return;
    const giftCards = document.getElementById('menu-giftcards-link');
    (collections || []).filter(function (item) { return item.visibleInNavigation === true; })
      .sort(function (a, b) {
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
      })
      .forEach(function (item) {
        const handle = String(item.handle || item.slug || item.id || '');
        if (!handle || handle === 'sale' || handle === 'newin') return;
        const link = document.createElement('a');
        link.className = 'menu-plain';
        link.setAttribute('data-dynamic-collection-link', 'true');
        link.textContent = item.title || item.name || handle;
        link.addEventListener('click', function () {
          if (typeof closeMenu === 'function') closeMenu();
          if (typeof window.navigateToCollection === 'function') window.navigateToCollection(handle);
        });
        links.insertBefore(link, giftCards && giftCards.parentNode === links ? giftCards : null);
      });
  });
}

function renderShopByCategory(shopByCategory) {
  shopByCategory = shopByCategory || {};
  const headingEl = document.getElementById('shop-by-category-heading');
  if (headingEl) { headingEl.textContent = shopByCategory.heading || ''; headingEl.classList.remove('skeleton-text'); }

  const grid = document.getElementById('home-categories-grid');
  if (!grid || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
  firebase.firestore().collection('categories').get().then(function(snapshot) {
    if (!grid.isConnected) return;
    const allCategories = snapshot.docs
      .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
      .sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }); });
    const featuredCategories = allCategories.filter(function(category) { return category.featuredOnHomepage === true; });
    // Keep the homepage populated when categories exist but none have been
    // explicitly featured yet. Featured categories still take priority.
    // Up to 8 tiles. When there are more categories than that, the last
    // tile is an icon-only "all categories" tile (the /categories page).
    const pool = featuredCategories.length ? featuredCategories : allCategories;
    const showAll = allCategories.length > Math.min(pool.length, 8);
    const categories = pool.slice(0, showAll ? 7 : 8);

    if (!categories.length) {
      // Keep the eight homepage category placeholders visible until categories
      // are created in Admin. Do not collapse the section when the data is empty.
      grid.style.display = '';
      grid.innerHTML = Array.from({ length: 8 }, function() {
        return '<div class="home-category-card" aria-hidden="true"><div class="home-category-img content-empty"><div class="home-category-label"></div></div></div>';
      }).join('');
      updateHomeCategoriesNav();
      return;
    }

    grid.style.display = '';
    grid.innerHTML = categories.map(function(category) {
      const slug = String(category.slug || category.id).replace(/[^a-z0-9-]/gi, '');
      const name = String(category.name || '').replace(/[&<>"']/g, function(ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
      });
      return '<button type="button" class="home-category-card" data-category-slug="' + slug +
        '" aria-label="Browse ' + name + '"><div class="home-category-img' +
        (category.imageUrl ? '' : ' content-empty') + '"><div class="home-category-label">' +
        name + '</div></div></button>';
    }).join('') + (showAll
      ? '<button type="button" class="home-category-card home-category-all" aria-label="All categories" onclick="navigateTo(\'categories\')"><div class="home-category-img"><i class="ph ph-squares-four" aria-hidden="true"></i></div></button>'
      : '');
    updateHomeCategoriesNav();

    grid.querySelectorAll('[data-category-slug]').forEach(function(card, index) {
      const category = categories[index];
      const imageEl = card.querySelector('.home-category-img');
      if (category.imageUrl && /^https:\/\//i.test(category.imageUrl)) loadBackgroundImage(imageEl, category.imageUrl, 600);
      card.addEventListener('click', function() {
        if (typeof navigateToCategory === 'function') navigateToCategory(card.getAttribute('data-category-slug'));
      });
    });
  }).catch(function(error) {
    console.warn('[SITE CONTENT] Could not load homepage categories:', error.message);
  });
}
// Homepage category tiles: chevrons scroll one column (two tiles) at a
// time; each shows only when there's more that way.
function scrollHomeCategories(dir) {
  const grid = document.getElementById('home-categories-grid');
  const card = grid && grid.querySelector('.home-category-card');
  if (!card) return;
  grid.scrollBy({ left: dir * (card.getBoundingClientRect().width + 6), behavior: 'smooth' });
}
function updateHomeCategoriesNav() {
  const grid = document.getElementById('home-categories-grid');
  if (!grid) return;
  const scroller = grid.parentElement;
  const max = grid.scrollWidth - grid.clientWidth;
  scroller.classList.toggle('can-prev', grid.scrollLeft > 4);
  scroller.classList.toggle('can-next', grid.scrollLeft < max - 4);
}
document.addEventListener('DOMContentLoaded', function () {
  const grid = document.getElementById('home-categories-grid');
  if (!grid) return;
  grid.addEventListener('scroll', updateHomeCategoriesNav, { passive: true });
  window.addEventListener('resize', updateHomeCategoriesNav);
  updateHomeCategoriesNav();
});

function renderShopByClothingHeader(clothing) {
  clothing = clothing || {};
  const headingEl = document.getElementById('clothing-heading');
  const btnEl = document.getElementById('clothing-view-all-btn');
  if (headingEl) { setSectionHeading(headingEl, clothing.heading); headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = clothing.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(clothing.buttonLink); };
  }
}

// Shown until Shop by Accessories is first saved in admin (Homepage tab);
// same defaults as admin-homepage.js and server.js.
const SHOP_BY_ACCESSORIES_DEFAULTS = { heading: 'Shop by accessories', buttonText: 'Shop now', buttonLink: { type: 'category', value: 'accessories' } };
function renderShopByAccessoriesHeader(accessories) {
  accessories = Object.assign({}, SHOP_BY_ACCESSORIES_DEFAULTS, accessories || {});
  const headingEl = document.getElementById('accessories-heading');
  const btnEl = document.getElementById('accessories-view-all-btn');
  if (headingEl) { setSectionHeading(headingEl, accessories.heading); headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = accessories.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(accessories.buttonLink); };
  }
}

function renderEditorialBanner(banner) {
  banner = banner || {};
  const headingEl = document.getElementById('banner-heading');
  const btnEl = document.getElementById('banner-btn');
  const imgEl = document.getElementById('editorial-banner-img');
  if (headingEl) { headingEl.textContent = banner.heading || ''; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = banner.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function (e) { e.stopPropagation(); goToSiteLink(banner.buttonLink); };
  }
  if (imgEl) imgEl.onclick = function () { goToSiteLink(banner.buttonLink); };
  loadBackgroundImage(imgEl, banner.imageUrl, 1600);
}

// Swaps the header's text wordmark for an uploaded image (admin
// Homepage tab > Site Logo) once one's set — server.js's SSR already
// does this for the very first paint (applyLogoImage()), this just
// keeps it current if admin changes it after that response was cached.
function renderLogo() {
  // The header always uses the JANEDORE text wordmark.
  // Homepage logo uploads no longer replace the navigation wordmark.
  const textEl = document.getElementById('nav-logo-text');
  if (textEl) textEl.style.display = '';
}

function renderShopByBrandHeader(shopByBrand) {
  shopByBrand = shopByBrand || {};
  const headingEl = document.getElementById('shop-by-brand-heading');
  if (headingEl) { setSectionHeading(headingEl, shopByBrand.heading); headingEl.classList.remove('skeleton-text'); }
}

function renderNewsletter(newsletter) {
  newsletter = newsletter || {};
  const headingEl = document.getElementById('newsletter-heading');
  const subtextEl = document.getElementById('newsletter-subtext');
  const disclaimerEl = document.getElementById('newsletter-disclaimer');
  if (headingEl) { headingEl.textContent = newsletter.heading || ''; headingEl.classList.remove('skeleton-text'); }
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

    renderLogo(homepage.logoUrl);
    renderMenuCollectionLinks();
    renderHero(homepage.hero);
    renderNewArrivalsHeader(homepage.newArrivals);
    renderShopByCategory(homepage.shopByCategory);
    renderShopByClothingHeader(homepage.shopByClothing);
    renderShopByAccessoriesHeader(homepage.shopByAccessories);
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
