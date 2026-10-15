// ==================== SITE CONTENT (ADMIN-EDITABLE HOMEPAGE) ====================
// Hero image/heading/button, New Arrivals' heading/button, Shop by
// Category's heading + tiles, Shop by Clothing's heading/button, the
// editorial banner, Shop by Brand's heading, and the newsletter copy
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

function renderNewArrivalsHeader(arrivals) {
  arrivals = arrivals || {};
  const headingEl = document.getElementById('arrivals-heading');
  const btnEl = document.getElementById('arrivals-view-all-btn');
  if (headingEl) { headingEl.textContent = arrivals.heading || ''; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = arrivals.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(arrivals.buttonLink); };
  }
}

function renderCollectionQuickLinks() {
  const row = document.getElementById('nav-quick-links');
  if (!row || typeof window._loadPublishedCollections !== 'function') return;
  row.querySelectorAll('[data-dynamic-collection-link]').forEach(function (el) { el.remove(); });
  window._loadPublishedCollections().then(function (collections) {
    if (!row.isConnected) return;
    const published = collections || [];
    ['sale', 'newin'].forEach(function (handle) {
      const staticLink = row.querySelector('[data-nav-page="' + handle + '"]');
      const dynamicRecord = published.some(function (item) { return String(item.handle || item.slug || item.id) === handle; });
      if (staticLink) staticLink.style.display = dynamicRecord ? 'none' : '';
    });
    const visible = published.filter(function (item) { return item.visibleInNavigation === true; })
      .sort(function (a, b) {
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
      });
    visible.forEach(function (item) {
      const handle = String(item.handle || item.slug || item.id || '');
      if (!handle) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-quick-link';
      button.setAttribute('data-dynamic-collection-link', 'true');
      button.setAttribute('data-nav-page', 'collection-' + handle);
      button.textContent = item.title || item.name || handle;
      button.addEventListener('click', function () {
        if (typeof window.navigateToCollection === 'function') window.navigateToCollection(handle);
      });
      row.appendChild(button);
    });
    if (typeof window.updateNavQuickLinksChevrons === 'function') window.updateNavQuickLinksChevrons();
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
    const categories = (featuredCategories.length ? featuredCategories : allCategories).slice(0, 4);

    if (!categories.length) {
      // Keep the four homepage category placeholders visible until categories
      // are created in Admin. Do not collapse the section when the data is empty.
      grid.style.display = '';
      grid.innerHTML = Array.from({ length: 4 }, function() {
        return '<div class="home-category-card" aria-hidden="true"><div class="home-category-img content-empty"><div class="home-category-label"></div></div></div>';
      }).join('');
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
    }).join('');

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
function renderShopByClothingHeader(clothing) {
  clothing = clothing || {};
  const headingEl = document.getElementById('clothing-heading');
  const btnEl = document.getElementById('clothing-view-all-btn');
  if (headingEl) { headingEl.textContent = clothing.heading || ''; headingEl.classList.remove('skeleton-text'); }
  if (btnEl) {
    btnEl.textContent = clothing.buttonText || '';
    btnEl.classList.remove('skeleton-text');
    btnEl.onclick = function () { goToSiteLink(clothing.buttonLink); };
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
  // The header now always uses the Unbounded text wordmark.
  // Homepage logo uploads no longer replace the navigation wordmark.
  const textEl = document.getElementById('nav-logo-text');
  if (textEl) textEl.style.display = '';
}

function renderShopByBrandHeader(shopByBrand) {
  shopByBrand = shopByBrand || {};
  const headingEl = document.getElementById('shop-by-brand-heading');
  if (headingEl) { headingEl.textContent = shopByBrand.heading || ''; headingEl.classList.remove('skeleton-text'); }
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
    renderCollectionQuickLinks();
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
