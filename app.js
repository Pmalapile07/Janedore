// Defined in index.html's <head>; plain fallback for any page that loads
// this script without it (e.g. debugger.html).
window.resetScrollToTop = window.resetScrollToTop || function () { window.scrollTo(0, 0); };

const DOM = {
  get cartBadge() { return document.getElementById("cart-badge"); },
  get wishBadge() { return document.getElementById("wish-badge"); },
  get searchOverlay() { return document.getElementById("search-overlay"); },
  get searchInput() { return document.getElementById("search-input"); },
  get searchBody() { return document.getElementById("search-body"); },
  get menuBackdrop() { return document.getElementById("menu-backdrop"); },
  get menuDrawer() { return document.getElementById("menu-drawer"); },
  get arrivalsGrid() { return document.getElementById("arrivals-grid"); },
  get allProductsGrid() { return document.getElementById("all-products-grid"); },
  get categoryProductsGrid() { return document.getElementById("category-products-grid"); },
  get categoryNameTag() { return document.getElementById("category-name-tag"); },
  get categoryDescriptionWrap() { return document.getElementById("category-description-wrap"); },
  get productDetail() { return document.getElementById("page-product-detail"); },
  get cartPageContent() { return document.getElementById("cart-page-content"); },
  get wishPageContent() { return document.getElementById("wish-page-content"); },
  get campaignSlides() { return document.getElementById("campaign-slides"); },
  get reviewStars() { return document.getElementById("review-stars"); },
  get reviewText() { return document.getElementById("review-text"); },
  get reviewName() { return document.getElementById("review-name"); },
  get reviewImageInput() { return document.getElementById("review-image-input"); },
  get reviewModalBackdrop() { return document.getElementById("review-modal-backdrop"); },
  get gridToggleSvg() { return document.getElementById("grid-toggle-svg"); },
  get catGridToggleSvg() { return document.getElementById("cat-grid-toggle-svg"); },
  get mainNav() { return document.getElementById("main-nav"); },
  get heroBg() { return document.getElementById("hero-bg"); },
  hero: null,
  get chatBubble() { return document.getElementById("live-chat-bubble"); }
};

// Bumped by every page-navigation function (navigateTo, navigateToCategory,
// goToProduct, navigateToVendor, navigateToContentPage, navigateToLogin,
// navigateToAccount) — the one shared signal for "has the user moved on to
// a different page since an async fetch for the PREVIOUS page started."
// Any code that fetches data for a page and then renders it should capture
// this value before the fetch (`const myNav = ++pageNavGeneration;`) and
// check `myNav !== pageNavGeneration` immediately after awaiting — if it
// no longer matches, something else has navigated since, and the fetch's
// result must be thrown away instead of applied, no matter how long the
// fetch took or what order multiple fetches resolve in. Without this, a
// slow background fetch for a page the user has since left can resolve
// later and corrupt whatever page they're actually looking at by then —
// this is what the one-off vendorNavToken in collection.js used to guard
// against for vendor pages only; this replaces it as the shared mechanism
// every page-level fetch should use.
let pageNavGeneration = 0;

let PRODUCTS = [];
// Resolves once PRODUCTS is actually populated — the wishlist account
// sync (wishlist.js, triggered by login.js's auth listener) needs this:
// Firebase Auth can restore a signed-in session before fetchProducts()
// resolves, and rehydrating/merging a wishlist's product ids against an
// empty PRODUCTS array would silently produce an empty list — which,
// written straight back to the account, would wipe a real saved
// wishlist instead of merging into it.
let _resolveProductsReady;
window.productsReady = new Promise(r => { _resolveProductsReady = r; });
const CURRENCIES = { ZAR:{label:"ZAR R",symbol:"R"}, BWP:{label:"BWP P",symbol:"P"}, USD:{label:"USD $",symbol:"$"}, LSL:{label:"LSL M",symbol:"M"}, NAD:{label:"NAD N$",symbol:"N$"} };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect fill='%23f4f4f4' width='400' height='500'/%3E%3C/svg%3E";

// formatPrice removed from app.js — the storefront version lives in collections.js
// and handles numeric coercion + en-US comma formatting (R1,299) safely.

const S = {
  cart:[], wishlist:[], currency:"ZAR", currentPage:"home", currentCategoryPage:null, selectedSize:null, productVariantSelections:{}, imageMode:"ghost", gridCols:2, gridColsCat:2, gridColsWish:2, gridColsVendor:2, filter:{cat:[],size:"all",vendor:[],onSale:false,inStock:false}, catFilter:{cat:[],size:"all",vendor:[],onSale:false,inStock:false}, vendorFilter:{cat:[],size:"all",vendor:[],onSale:false,inStock:false}, currentVendor:null, sortBy:"newest", campaignSlideIndex:0, recentlyViewed:[], currentSlide:0, cardTouchStartX:{}, cardSlideIndex:{}, swipeState:{}, previousCollectionPage:null, currentReviewProductId:null, saleMode:false, newInMode:false, categoriesSlideIndex:0, productInfoTab:'description', stickyExtended:false, stickyWishHidden:false, activeSortTab:null
};

/* ============================================================
   RECENTLY VIEWED PERSISTENCE — same pattern as cart's
   loadCartFromStorage/saveCartToStorage (see cart.js). Only
   product IDs are persisted; the full product objects are
   rehydrated from PRODUCTS on load so stale prices/images/stock
   never leak in and deleted products are dropped silently.
   ============================================================ */

function loadRecentlyViewedFromStorage() {
  try {
    const saved = localStorage.getItem('janedore_recently_viewed');
    if (saved) {
      const ids = JSON.parse(saved);
      S.recentlyViewed = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    }
  } catch(e) { S.recentlyViewed = []; }
}

function saveRecentlyViewedToStorage() {
  try {
    localStorage.setItem('janedore_recently_viewed', JSON.stringify(S.recentlyViewed.map(p => p.id)));
  } catch(e) {}
}

// Every non-home, non-product, non-collection page now gets a clean
// root-level URL instead of a hash. Maps internal page key -> URL segment
// (most are the same string; 'products' is an exception since the URL
// "/products" is reserved for individual items at /products/{slug}).
const PAGE_URL_MAP = {
  products: 'shop',
  campaign: 'campaign',
  editorial: 'editorial',
  brands: 'brands',
  categories: 'categories',
  giftcards: 'gift-cards',
  login: 'login',
  account: 'account',
  checkout: 'checkout',
  cart: 'cart',
  wishlist: 'wishlist'
};
const URL_TO_PAGE_MAP = Object.fromEntries(Object.entries(PAGE_URL_MAP).map(([k, v]) => [v, k]));

// ==================== SLUG HELPERS ====================

function generateSlugBase(name) {
  return (name || '').toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
}

function makeUniqueSlug(base, existingSlugs) {
  let slug = base;
  let n = 2;
  while (existingSlugs.has(slug)) {
    slug = base + '-' + n;
    n++;
  }
  existingSlugs.add(slug);
  return slug;
}

// Only writes a slug to Firestore when a product doesn't already have one —
// existing slugs are never touched, per rule: don't change slugs on edit.
//
// Not awaited by its caller (fetchProducts()) on purpose: every product
// missing a slug gets its own Firestore WRITE here, and writes are
// slower than reads. The in-memory fix (p.slug = slug, below) happens
// synchronously regardless, so the page already has correct slugs to
// render/link with immediately — there's nothing a visitor needs to
// wait on. The actual Firestore writes still happen, just in the
// background, self-healing the data without holding up first paint.
function backfillMissingSlugs(products) {
  const existingSlugs = new Set(products.filter(p => p.slug).map(p => p.slug));
  products.forEach(p => {
    if (!p.slug) {
      const slug = makeUniqueSlug(generateSlugBase(p.name), existingSlugs);
      p.slug = slug;
      db.collection('products').doc(p.id).update({ slug }).catch(e => {
        console.warn('Slug backfill failed for', p.id, e);
      });
    }
  });
}

// Same backfill-once pattern as products, for brand/vendor pages — gives
// every vendor an SEO-friendly /brands/{slug} URL instead of the raw
// Firestore doc ID (which for admin-created vendors is a random,
// meaningless string like "uf1c4uBKwmCAVafjEdRL").
async function backfillMissingVendorSlugs(vendors) {
  const existingSlugs = new Set(vendors.filter(v => v.slug).map(v => v.slug));
  const writes = [];
  vendors.forEach(v => {
    if (!v.slug) {
      const slug = makeUniqueSlug(generateSlugBase(v.brand || v.name), existingSlugs);
      v.slug = slug;
      writes.push(
        db.collection('vendors').doc(v.id).update({ slug }).catch(e => {
          console.warn('Vendor slug backfill failed for', v.id, e);
        })
      );
    }
  });
  if (writes.length) await Promise.all(writes);
}

// Slug first (the canonical, SEO-friendly URL), raw doc ID as a fallback
// so old /brands/{id} links people already have out there keep working.
function findVendorBySlug(slug) {
  return (S.vendors || []).find(v => v.slug === slug) || (S.vendors || []).find(v => v.id === slug);
}

function findProductBySlug(slug) {
  return PRODUCTS.find(p => p.slug === slug) || PRODUCTS.find(p => p.id === slug);
}

async function fetchProducts() {
  try {
    const snapshot = await db.collection('products').where('status','==','active').get();
    const products = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    backfillMissingSlugs(products);
    return products;
  } catch(e) {
    console.error('Error fetching products:', e);
    return [];
  }
}

// A brand set to Suspended or Inactive in Admin > Brands is hidden from
// the whole storefront, products and all. fetchVendors() returns only
// active brands, so a product from another brand shows only when its
// brand is in that set. JANEDORE's own products always show. Skipped
// when the brand list is empty (a read error), so a hiccup loading
// brands never empties the catalogue.
function filterProductsByActiveVendors(products, vendors) {
  if (!Array.isArray(vendors) || !vendors.length) return products;
  const house = (typeof isHouseProduct === 'function') ? isHouseProduct : (p => !p.vendorId || String(p.brand||'').trim().toUpperCase()==='JANEDORE');
  const activeIds = new Set(vendors.map(v => v.id));
  const activeNames = new Set(vendors.map(v => String(v.name || v.brand || '').trim().toUpperCase()).filter(Boolean));
  return products.filter(p => {
    if (house(p)) return true;
    if (p.vendorId) return activeIds.has(p.vendorId);
    return activeNames.has(String(p.brand || '').trim().toUpperCase());
  });
}

window.navigateTo = navigateTo;
window.navigateToCategory = navigateToCategory;
window.navigateToSale = navigateToSale;
window.goToProduct = goToProduct;
window.goBackFromProduct = goBackFromProduct;
window.goBackHome = goBackHome;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.openCart = openCart;
window.openSearch = openSearch;
window.closeSearch = closeSearch;
window.toggleSubmenuCollapse = toggleSubmenuCollapse;
window.toggleBrandsCollapse = toggleBrandsCollapse;
window.handleSearch = handleSearch;
window.toggleGrid = toggleGrid;
window.toggleGridCat = toggleGridCat;
window.toggleFilterDropdown = toggleFilterDropdown;
window.applyFilter = applyFilter;
window.applyCatFilter = applyCatFilter;
window.selectSortTab = selectSortTab;
window.openReviewModal = openReviewModal;
window.closeReviewModal = closeReviewModal;
window.setReviewRating = setReviewRating;
window.submitReview = submitReview;
window.handleReviewImage = handleReviewImage;
window.toggleWish = toggleWish;
window.addPouchToCart = addPouchToCart;
window.moveCampaignSlider = moveCampaignSlider;
window.subscribeNewsletter = subscribeNewsletter;

// ==================== CLOSE FILTER PANEL HELPER ====================
function closeFilterPanel() {
  const filterPanel = document.getElementById('collection-filter-options');
  if (filterPanel && filterPanel.classList.contains('open')) {
    filterPanel.classList.remove('open');
    document.body.style.overflow = '';
  }
}

async function init() {
  loadCartFromStorage();
  updateBadges();
  // Fired before awaiting fetchProducts() below (not after) so the
  // siteContent/homepage read — and therefore hero image discovery —
  // starts in parallel with the products fetch instead of serially
  // behind it. The two read unrelated Firestore documents; nothing
  // here depends on PRODUCTS being ready first.
  if (typeof renderSiteContent === 'function') renderSiteContent();
  // Load brands alongside products so inactive/suspended brands' products
  // can be filtered out before anything renders (no flash of a hidden
  // brand's items). initVendors() below reuses this same list.
  const vendorsPromise = (typeof fetchVendors === 'function') ? fetchVendors().catch(() => []) : Promise.resolve([]);
  PRODUCTS = await fetchProducts();
  try {
    const vendors = await vendorsPromise;
    if (vendors && vendors.length) { S.vendors = vendors; PRODUCTS = filterProductsByActiveVendors(PRODUCTS, vendors); }
  } catch (e) {}
  _resolveProductsReady();
  cleanCartOrphans();
  if (typeof restoreBagFromLink === 'function') restoreBagFromLink();
  loadRecentlyViewedFromStorage();
  loadWishlistFromStorage();
  updateBadges();
  buildArrivals();
  const footerIds = ["main-footer","products-footer","category-footer","campaign-footer","cart-footer","wishlist-footer","editorial-footer","brands-footer","categories-footer","giftcards-footer","checkout-footer","login-footer","account-footer","vendor-footer","content-footer"];
  footerIds.forEach(id => { const el = document.getElementById(id); if (el) buildFooter(id); });
  buildCampaignSlider();
  initVendors(S.vendors);
  initNavScroll();

  // PayFast redirects the customer back to "/?payfast_return=1&order=..."
  // (a bare path with query params, no hash), so without this check the
  // routing below falls through to the home page while checkout.js's own
  // PayFast-return handler is, independently and concurrently, trying to
  // show the checkout page's confirming/confirmation view — whichever one
  // finishes last wins, so the customer could get yanked back to home
  // mid-confirmation. Recognizing it here means both agree on landing on
  // checkout; checkout.js alone decides which inner view to show.
  //
  // Reads a flag rather than re-parsing location.search: checkout.js's
  // own PayFast-return handler runs earlier (at script-load time, before
  // this DOMContentLoaded-bound init() does) and rewrites the URL to
  // strip these query params once it's read them, so by the time init()
  // runs they'd already be gone from the URL.
  if (window.__payfastReturnActive) {
    navigateTo('checkout', true);
    updateChatVisibility();
    routeReady();
    return;
  }

  // Path-based routes (/products/slug, /collections/cat, /pages/slug, /shop, /login, etc)
  // take priority over hash routes.
  const pathRoute = getRouteFromPath();
  if (pathRoute) {
    if (pathRoute.page === 'product-detail') {
      const product = findProductBySlug(pathRoute.slug);
      if (product) { goToProduct(product.id, true); }
      else { navigateTo('home'); }
    } else if (pathRoute.page === 'category') {
      navigateToCollection(pathRoute.cat, true);
    } else if (pathRoute.page === 'content') {
      navigateToContentPage(pathRoute.slug, true);
    } else if (pathRoute.page === 'vendor') {
      navigateToVendor(pathRoute.slug, true, pathRoute.view);
    } else if (pathRoute.page === 'login') {
      await window.authReady;
      navigateToLogin(true);
    } else if (pathRoute.page === 'account') {
      await window.authReady;
      navigateToAccount(true);
    } else if (['cart','wishlist','checkout','products','campaign','editorial','brands','categories','giftcards'].includes(pathRoute.page)) {
      navigateTo(pathRoute.page, true);
    } else {
      navigateTo('home');
    }
  } else {
    const route = getRouteFromHash();
    if (route.page === 'product-detail') {
      goToProduct(route.productId, true);
    }
    else if (route.page === 'category') {
      navigateToCollection(route.cat, true);
    }
    else if (route.page === 'login') { await window.authReady; navigateToLogin(true); }
    else if (route.page === 'account') { await window.authReady; navigateToAccount(true); }
    else if (['cart','wishlist','checkout','products','campaign','editorial','brands','categories','giftcards'].includes(route.page)) {
      navigateTo(route.page, true);
    }
    else navigateTo('home');
  }
  updateChatVisibility();
  routeReady();
}

// Shows the page again once init() has picked it (see the route-pending
// script in index.html's <head>, which hides the home page until then).
function routeReady() {
  document.documentElement.classList.remove('route-pending');
}

window.addEventListener('DOMContentLoaded', init);

function updateHash(hash) {
  const fullHash = hash ? '#' + hash : '';
  const newUrl = '/' + fullHash;
  if (window.location.pathname !== '/' || window.location.hash !== fullHash) {
    history.pushState(null, null, newUrl);
  }
}

// Pushes (or replaces) a clean root-level URL for pages in PAGE_URL_MAP
// (shop, campaign, editorial, login, account, checkout, cart, wishlist).
function updateCleanUrl(pageKey, replaceUrl) {
  const segment = PAGE_URL_MAP[pageKey] || pageKey;
  const newPath = '/' + segment;
  if (window.location.pathname === newPath) return;
  if (replaceUrl) history.replaceState(null, null, newPath);
  else history.pushState(null, null, newPath);
}

// Pushes (or replaces) the clean /products/{slug} URL for a product page.
function updateProductUrl(product, replaceUrl) {
  const slug = product.slug || product.id;
  const newPath = '/products/' + encodeURIComponent(slug);
  if (window.location.pathname === newPath) return;
  if (replaceUrl) history.replaceState(null, null, newPath);
  else history.pushState(null, null, newPath);
}

// Pushes (or replaces) the clean /collections/{cat} URL for a category page.
function updateCollectionUrl(cat, replaceUrl) {
  const newPath = '/collections/' + encodeURIComponent(cat);
  if (window.location.pathname === newPath) return;
  if (replaceUrl) history.replaceState(null, null, newPath);
  else history.pushState(null, null, newPath);
}

function getRouteFromHash() { const hash = window.location.hash.replace('#', ''); if (!hash) return { page: 'home' }; if (hash === 'products') return { page: 'products' }; if (hash === 'campaign') return { page: 'campaign' }; if (hash === 'cart') return { page: 'cart' }; if (hash === 'wishlist') return { page: 'wishlist' }; if (hash === 'checkout') return { page: 'checkout' }; if (hash === 'editorial') return { page: 'editorial' }; if (hash === 'brands') return { page: 'brands' }; if (hash === 'categories') return { page: 'categories' }; if (hash === 'giftcards') return { page: 'giftcards' }; if (hash === 'login') return { page: 'login' }; if (hash === 'account') return { page: 'account' }; if (hash.startsWith('category-')) return { page: 'category', cat: hash.replace('category-', '') }; if (hash.startsWith('product-')) return { page: 'product-detail', productId: hash.replace('product-', '') }; return { page: 'home' }; }

// Reads clean /products/{slug}, /collections/{cat}, /pages/{slug}, and every
// mapped utility/content page (/shop, /login, /account, /checkout, /cart,
// /wishlist, /campaign, /editorial).
function getRouteFromPath() {
  const path = window.location.pathname;
  let m = path.match(/^\/products\/([^\/]+)\/?$/);
  if (m) return { page: 'product-detail', slug: decodeURIComponent(m[1]) };
  m = path.match(/^\/collections\/([^\/]+)\/?$/);
  if (m) return { page: 'category', cat: decodeURIComponent(m[1]) };
  m = path.match(/^\/pages\/([^\/]+)\/?$/);
  if (m) return { page: 'content', slug: decodeURIComponent(m[1]) };
  m = path.match(/^\/brands\/([^\/]+)(?:\/(shop|sale))?\/?$/);
  if (m) return { page: 'vendor', slug: decodeURIComponent(m[1]), view: m[2] || 'home' };
  m = path.match(/^\/account\/(orders\/[^\/]+|[a-z]+)\/?$/);
  if (m) return { page: 'account' };
  m = path.match(/^\/(shop|login|account|checkout|cart|wishlist|campaign|editorial|brands|categories|gift-cards)\/?$/);
  if (m) return { page: URL_TO_PAGE_MAP[m[1]] || m[1] };
  return null;
}

window.addEventListener('popstate', async () => {
  // In-page anchors (e.g. an old #brands-letter-A link) are scroll
  // targets, not routes; never treat them as a page change.
  if (/^#brands-letter-/.test(window.location.hash)) return;
  closeFilterPanel();
  const pathRoute = getRouteFromPath();
  if (pathRoute) {
    if (pathRoute.page === 'product-detail') {
      const product = findProductBySlug(pathRoute.slug);
      if (product) { goToProduct(product.id, true); return; }
    } else if (pathRoute.page === 'category') {
      navigateToCategory(pathRoute.cat, true);
      return;
    } else if (pathRoute.page === 'content') {
      navigateToContentPage(pathRoute.slug, true);
      return;
    } else if (pathRoute.page === 'vendor') {
      navigateToVendor(pathRoute.slug, true, pathRoute.view);
      return;
    } else if (pathRoute.page === 'login') {
      await window.authReady;
      navigateToLogin(true);
      return;
    } else if (pathRoute.page === 'account') {
      await window.authReady;
      navigateToAccount(true);
      return;
    } else if (['cart','wishlist','checkout','products','campaign','editorial','brands','categories','giftcards'].includes(pathRoute.page)) {
      navigateTo(pathRoute.page, true);
      return;
    }
  }
  const route = getRouteFromHash();
  if (route.page === 'product-detail') goToProduct(route.productId, true);
  else if (route.page === 'category') navigateToCategory(route.cat, true);
  else if (route.page === 'login') { await window.authReady; navigateToLogin(true); }
  else if (route.page === 'account') { await window.authReady; navigateToAccount(true); }
  else if (['cart','wishlist','checkout','products','campaign','editorial','brands','categories','giftcards'].includes(route.page)) navigateTo(route.page, true);
  else navigateTo('home');
});

function setNavForPage(page) {
  if (!DOM.mainNav) return;

  // Toggle body class for collection pages — shows the shared
  // filter bar (grid toggle, FILTER button, title) above the grid.
  if (page === 'products' || page === 'category' || page === 'vendor') {
    document.body.classList.add('on-collection-page');
  } else {
    document.body.classList.remove('on-collection-page');
  }

  // Hides #main-nav's search bar only on the brands directory page
  // (navigation.css) — tightens the gap between the nav and the A-Z
  // heading, matching the reference layout; every other page keeps the
  // search bar exactly as before.
  document.body.classList.toggle('on-brands-page', page === 'brands');
}

function navigateTo(page, replaceUrl) {
  // The Understated campaign page is retired (its idea moves to
  // Editorial); /campaign and old links land on the homepage. The page
  // markup stays in index.html for reference.
  if (page === 'campaign') { page = 'home'; replaceUrl = true; }
  S.currentCollectionHandle = null;
  S.currentCollectionData = null;
  ++pageNavGeneration;
  closeFilterPanel();
  closeSearch();
  S.saleMode = false; S.newInMode = false; S.filter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false};
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  S.currentPage = page;
  removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page","collection-page"); }
  // Reset scroll after switching the destination page and nav classes.
  // On iOS Safari, scrolling before these layout changes can leave the
  // sticky header visually out of sync with the page below it.
  resetScrollToTop();
  requestAnimationFrame(() => {
    // Re-resolve the sticky header against the destination page layout.
    if (DOM.mainNav) DOM.mainNav.getBoundingClientRect();
  });
  setNavForPage(page);
  if (page === 'home') updateHash('');
  else if (PAGE_URL_MAP.hasOwnProperty(page)) updateCleanUrl(page, replaceUrl);
  else updateHash(page);
  if(page==="products"){ DOM.mainNav?.classList.add("collection-page"); S.activeSortTab = 'all'; renderCollectionSortingTabs(); renderAllProducts(); ensureNavScrolled(); S.previousCollectionPage='products'; }
  if(page==="cart"){ renderCartPage(); ensureNavScrolled(); }
  if(page==="wishlist"){ renderWishlistPage(); ensureNavScrolled(); }
  if(page==="checkout"){ navigateToCheckout(replaceUrl); }
  if(page==="editorial") ensureNavScrolled();
  if(page==="categories"){ renderDynamicCategoriesPage(); ensureNavScrolled(); }
  if(page==="giftcards") ensureNavScrolled();
  if(page==="brands"){ if (typeof renderBrandsPage === 'function') renderBrandsPage(S.vendors || []); ensureNavScrolled(); }
  updateChatVisibility();
}


function renderDynamicCategoriesPage() {
  var grid = document.getElementById('categories-page-grid');
  if (!grid || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
  firebase.firestore().collection('categories').get().then(function(snapshot) {
    if (!grid.isConnected) return;
    var categories = snapshot.docs.map(function(doc) { return Object.assign({id:doc.id},doc.data()); });
    grid.innerHTML = categories.map(function(c) {
      var name = String(c.name || '').replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];});
      var image = String(c.imageUrl || '');
      if (!/^https:\/\//i.test(image)) image = '';
      var safeImage = image.replace(/['"\\\\\n\r]/g,'');
      var slug = String(c.slug || c.id || '').replace(/[^a-z0-9-]/gi,'');
      return '<button type="button" class="home-category-card" onclick="navigateToCategory(\'' + slug + '\')" aria-label="Browse ' + name + '"><div class="home-category-img' + (image ? '' : ' content-empty') + '"' + (image ? ' style="background-image:url(&quot;' + safeImage + '&quot;);background-size:cover;background-position:center;"' : '') + '><div class="home-category-label">' + name + '</div></div></button>';
    }).join('');
    if (!categories.length) {
      grid.innerHTML = Array.from({ length: 8 }, function() {
        return '<div class="home-category-card category-empty-card" aria-hidden="true"><div class="home-category-img content-empty"></div></div>';
      }).join('');
    }
    grid.style.display = '';
  }).catch(function(err){ console.error('Could not load storefront categories',err); });
}

function navigateToCategory(cat, replaceUrl) {
  // Old department addresses (all-clothing, all-accessories) open the
  // department (taxonomy.js).
  const dept = window.JDTaxonomy && JDTaxonomy.department(cat);
  if (dept) cat = dept.slug;
  S.currentCollectionHandle = null;
  S.currentCollectionData = null;
  ++pageNavGeneration;
  closeFilterPanel();
  closeSearch();
  S.saleMode = false; S.newInMode = false; S.catFilter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false}; updateCollectionUrl(cat, replaceUrl);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-category").classList.add("active"); S.currentPage="category"; S.currentCategoryPage=cat;
  S.previousCollectionPage = cat; removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  setNavForPage('category');
  S.activeSortTab = cat;
  renderCollectionSortingTabs();
  if(DOM.categoryNameTag) DOM.categoryNameTag.textContent = '';
  renderCategoryProducts(); resetScrollToTop(); ensureNavScrolled(); updateChatVisibility();
}

// Resolve /collections/:handle from published Firestore records first.
// If the handle is not a collection, retain the existing category route.
// Collections that exist without being created in admin. One with the
// same handle made in admin > Collections takes over.
const BUILTIN_COLLECTIONS = {
  'free-delivery': { id: 'free-delivery', handle: 'free-delivery', title: 'Free delivery and collection', collectionType: 'automated', automatedRule: 'freedelivery' },
  women: { id: 'women', handle: 'women', title: 'Women', collectionType: 'automated', automatedRule: 'gender', gender: 'women' },
  men: { id: 'men', handle: 'men', title: 'Men', collectionType: 'automated', automatedRule: 'gender', gender: 'men' }
};

// The Women or Men page, optionally opened on one of its sections
// (SHOP_GROUPS, collection.js), e.g. Men > Shoes.
function shopGenderPage(g, group) {
  S.nextShopGroup = group || null;
  navigateToCollection(g);
}

async function navigateToCollection(handle, replaceUrl) {
  if (typeof window._loadPublishedCollections !== 'function') { navigateToCategory(handle, replaceUrl); return; }
  try {
    const items = await window._loadPublishedCollections();
    const collection = (items || []).find(function (item) { return String(item.handle || item.slug || item.id) === String(handle); }) || BUILTIN_COLLECTIONS[handle];
    if (!collection) { navigateToCategory(handle, replaceUrl); return; }
    ++pageNavGeneration; closeFilterPanel(); closeSearch();
    S.saleMode = false; S.newInMode = false;
    S.catFilter = {cat:[], size:'all', vendor:[], onSale:false, inStock:false};
    S.currentCollectionHandle = String(collection.handle || collection.slug || collection.id);
    S.currentCollectionData = collection; S.currentCategoryPage = S.currentCollectionHandle;
    S.shopGroup = S.nextShopGroup || null; S.nextShopGroup = null;
    S.currentPage = 'category'; S.previousCollectionPage = S.currentCollectionHandle;
    updateCollectionUrl(S.currentCollectionHandle, replaceUrl);
    document.querySelectorAll('.page').forEach(function (page) { page.classList.remove('active'); });
    document.getElementById('page-category').classList.add('active'); removeStickyBar();
    if (DOM.mainNav) { DOM.mainNav.classList.remove('product-page'); DOM.mainNav.classList.add('collection-page'); }
    setNavForPage('category'); S.activeSortTab = S.currentCollectionHandle;
    if (DOM.categoryNameTag) DOM.categoryNameTag.textContent = '';
    renderCollectionSortingTabs(); renderCategoryProducts();
    resetScrollToTop(); ensureNavScrolled(); updateChatVisibility();
  } catch (error) { console.error('[COLLECTIONS] Could not resolve collection route:', error); navigateToCategory(handle, replaceUrl); }
}

function goToProduct(productId, replaceUrl) {
  ++pageNavGeneration;
  closeFilterPanel();
  closeSearch();
  S.saleMode = false; S.newInMode = false; S.filter.vendor = [];
  const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  updateProductUrl(product, replaceUrl);
  S.recentlyViewed=S.recentlyViewed.filter(p=>p.id!==productId); S.recentlyViewed.unshift(product); if(S.recentlyViewed.length>6) S.recentlyViewed.pop();
  saveRecentlyViewedToStorage();
  if (S.currentPage === 'category' || S.currentPage === 'products') S.previousCollectionPage = S.currentCategoryPage || 'products';
  S.currentReviewProductId = productId;
  S.stickyWishHidden = false;
  if(DOM.mainNav) { DOM.mainNav.classList.add("product-page"); DOM.mainNav.classList.remove("collection-page"); }
  document.body.classList.remove('on-collection-page');
  renderProductPage(product); updateChatVisibility();
}

function goBackFromProduct() { closeFilterPanel(); removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page"); if(S.previousCollectionPage&&S.previousCollectionPage!=='products') navigateToCollection(S.previousCollectionPage); else navigateTo('products'); }

function goBackHome() { closeFilterPanel(); removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page","collection-page"); document.body.classList.remove('on-collection-page'); navigateTo('home'); }

function navigateToSaleLegacy() { S.currentCollectionHandle = null; S.currentCollectionData = null; ++pageNavGeneration; closeFilterPanel(); closeSearch(); S.saleMode = true; S.newInMode = false; S.filter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false}; updateCleanUrl('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.activeSortTab = 'sale'; renderCollectionSortingTabs(); renderSaleProducts(); resetScrollToTop(); setNavForPage('products'); ensureNavScrolled(); updateChatVisibility(); }

function navigateToSale() {
  if (window._publishedCollections) {
    if (window._publishedCollections.some(function (item) { return String(item.handle || item.slug || item.id) === 'sale'; })) {
      navigateToCollection('sale'); return;
    }
    navigateToSaleLegacy(); return;
  }
  if (typeof window._loadPublishedCollections === 'function') {
    window._loadPublishedCollections().then(function (items) {
      if ((items || []).some(function (item) { return String(item.handle || item.slug || item.id) === 'sale'; })) navigateToCollection('sale');
      else navigateToSaleLegacy();
    });
    return;
  }
  navigateToSaleLegacy();
}

// Same shape as navigateToSale() — filters PRODUCTS to genuinely new
// items (renderNewInProducts(), collection.js — isProductNew(),
// product-detail.js's createdAt-within-PRODUCT_NEW_DAYS check) instead
// of on-sale ones. Previously this just set S.sortBy='newest' and
// called renderAllProducts(), which sorted the WHOLE catalog
// newest-first without filtering anything out — indistinguishable
// from All products once you scrolled past the first few items.
function navigateToNewInLegacy() { S.currentCollectionHandle = null; S.currentCollectionData = null; ++pageNavGeneration; closeFilterPanel(); closeSearch(); S.saleMode = false; S.newInMode = true; S.sortBy = 'newest'; S.filter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false}; updateCleanUrl('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.activeSortTab = 'newin'; renderCollectionSortingTabs(); renderNewInProducts(); resetScrollToTop(); setNavForPage('products'); ensureNavScrolled(); updateChatVisibility(); }

function navigateToNewIn() {
  if (window._publishedCollections) {
    if (window._publishedCollections.some(function (item) { return String(item.handle || item.slug || item.id) === 'newin'; })) {
      navigateToCollection('newin'); return;
    }
    navigateToNewInLegacy(); return;
  }
  if (typeof window._loadPublishedCollections === 'function') {
    window._loadPublishedCollections().then(function (items) {
      if ((items || []).some(function (item) { return String(item.handle || item.slug || item.id) === 'newin'; })) navigateToCollection('newin');
      else navigateToNewInLegacy();
    });
    return;
  }
  navigateToNewInLegacy();
}

function navigateToLogin(replaceUrl) {
  ++pageNavGeneration;
  closeFilterPanel();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-login").classList.add("active");
  S.currentPage = "login"; updateCleanUrl('login', replaceUrl);
  resetScrollToTop(); setNavForPage('login'); ensureNavScrolled();
}

function navigateToAccount(replaceUrl) {
  ++pageNavGeneration;
  closeFilterPanel();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-account").classList.add("active");
  S.currentPage = "account"; updateCleanUrl('account', replaceUrl);
  resetScrollToTop(); setNavForPage('account'); ensureNavScrolled();
}

function navigateToCheckout(replaceUrl) {
  ++pageNavGeneration;
  closeFilterPanel();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-checkout").classList.add("active");
  S.currentPage = "checkout"; updateCleanUrl('checkout', replaceUrl);
  resetScrollToTop(); setNavForPage('checkout'); ensureNavScrolled();
}

function ensureNavScrolled() { if (DOM.mainNav) DOM.mainNav.classList.add("scrolled"); }

// Nav is always solid white/black now (.scrolled and the default state
// render identically — see navigation.css), so there's nothing left to
// recompute on scroll. This used to run a forced-reflow
// getBoundingClientRect() check on every single scroll event to decide
// whether to toggle .scrolled; with no visual difference to toggle,
// that was just wasted work on every scroll tick, which is a real
// contributor to scroll/tap jank on slower phones.
function initNavScroll() {
  const nav = DOM.mainNav;
  if (nav) {
    const syncNavHeight = () => {
      // Use the rendered height, not a guessed mobile/desktop constant:
      // the search row is hidden on some pages and responsive rows differ.
      document.documentElement.style.setProperty('--main-nav-sticky-height', nav.getBoundingClientRect().height + 'px');
    };
    syncNavHeight();
    if (typeof ResizeObserver !== 'undefined') {
      if (window.__janedoreNavHeightObserver) window.__janedoreNavHeightObserver.disconnect();
      window.__janedoreNavHeightObserver = new ResizeObserver(syncNavHeight);
      window.__janedoreNavHeightObserver.observe(nav);
    } else {
      window.addEventListener('resize', syncNavHeight, { passive: true });
    }
  }
  ensureNavScrolled();
}

// Hero image is now admin-set (siteContent/homepage.hero.imageUrl, see
// site-content.js) — one image, CSS object-fit/background-size:cover
// handles desktop/mobile responsively, so there's no more desktop/mobile
// URL switching to do here.

// Full-screen menu (index.html #menu-drawer). Refreshes the account row
// and the wishlist/bag badges each time it opens, and freezes the page
// behind it the same way the chat widget does (lockPageScroll, chat.js).
function openMenu() {
  closeFilterPanel();
  closeMenuPanel(true);
  const user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
  const signedIn = user && !user.isAnonymous;
  const label = document.getElementById('menu-account-label');
  if (label) label.textContent = signedIn ? 'My account' : 'Sign in';
  const badge = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n; el.style.display = n > 0 ? 'flex' : 'none'; } };
  badge('menu-wish-badge', (S.wishlist || []).length);
  badge('menu-bag-badge', (S.cart || []).reduce((a, i) => a + (Number(i.qty) || 1), 0));
  // Opens at the top, however far it was scrolled last time.
  if (!DOM.menuDrawer.classList.contains('open')) DOM.menuDrawer.querySelectorAll('.menu-panel').forEach(p => { p.scrollTop = 0; });
  if (typeof lockPageScroll === 'function' && !DOM.menuDrawer.classList.contains('open')) lockPageScroll();
  DOM.menuBackdrop.classList.add("open"); DOM.menuDrawer.classList.add("open");
}
function closeMenu() {
  const wasOpen = DOM.menuDrawer.classList.contains('open');
  DOM.menuBackdrop.classList.remove("open"); DOM.menuDrawer.classList.remove("open");
  if (wasOpen && typeof unlockPageScroll === 'function') unlockPageScroll();
}
// Slides to a category's own list (Clothing, Accessories) and back.
function openMenuPanel(name) {
  const panel = document.getElementById('menu-panel-' + name);
  if (!panel) return;
  panel.scrollTop = 0;
  panel.classList.add('active');
  DOM.menuDrawer.classList.add('sub-open');
}
// The menu's sections, like Superbalist: All (every product), then
// Women, Men, Kids, Homeware and Beauty, each opening its own list. Women and Men list their
// sections (SHOP_GROUPS, collection.js); the others their categories.
// Only what has products right now, so the menu never leads to an empty
// page.
const MENU_SECTIONS = [['women', 'Women'], ['men', 'Men'], ['kids', 'Kids'], ['homeware', 'Homeware'], ['beauty', 'Beauty']];
function renderMenuDepartments() {
  const el = document.getElementById('menu-departments');
  if (!el || !window.JDTaxonomy) return;
  // All: every product, straight to the page; the sections open their lists.
  el.innerHTML = `<a class="menu-row menu-cat" onclick="closeMenu();navigateTo('products');">All<i class="ph ph-caret-right menu-chev"></i></a>` +
    MENU_SECTIONS.map(([key, name]) =>
    `<button class="menu-row menu-cat" onclick="openMenuSection('${key}')">${escapeHTML(name)}<i class="ph ph-caret-right menu-chev"></i></button>`).join('');
}
document.addEventListener('DOMContentLoaded', renderMenuDepartments);

function openMenuSection(key) {
  const panel = document.getElementById('menu-panel-dept');
  if (!panel) return;
  const name = (MENU_SECTIONS.find(s => s[0] === key) || [key, key])[1];
  const live = PRODUCTS.filter(p => p.status === 'active');
  const row = (label, onclick) => `<a class="menu-row menu-subcat" onclick="closeMenu();${onclick}">${escapeHTML(label)}<i class="ph ph-caret-right menu-chev"></i></a>`;
  let rows;
  if (key === 'women' || key === 'men') {
    const mine = live.filter(p => inGenderShop(p, key));
    rows = row('Shop all ' + key, `shopGenderPage('${key}');`) +
      SHOP_GROUPS.filter(gr => mine.some(p => inShopGroup(p, gr.key))).map(gr => row(shopGroupName(gr, key), `shopGenderPage('${key}','${gr.key}');`)).join('');
  } else {
    const stocked = new Set(live.map(p => p.category));
    const cats = JDTaxonomy.categoriesIn(key).filter(c => c !== key && stocked.has(c) && !JDTaxonomy.category(c).legacy).sort((a, b) => JDTaxonomy.order(a) - JDTaxonomy.order(b));
    rows = row('Shop all ' + name.toLowerCase(), `navigateToCategory('${key}');`) + cats.map(c => row(JDTaxonomy.label(c), `navigateToCategory('${escapeJSString(c)}');`)).join('');
  }
  panel.innerHTML = `<button class="menu-back" onclick="closeMenuPanel()"><i class="ph ph-caret-left"></i>${escapeHTML(name)}</button>` + rows;
  openMenuPanel('dept');
}

function closeMenuPanel(instant) {
  if (!DOM.menuDrawer) return;
  DOM.menuDrawer.classList.remove('sub-open');
  document.querySelectorAll('.menu-subpanel.active').forEach(p => p.classList.remove('active'));
}
function toggleSubmenuCollapse(section) { const el = document.getElementById(section + '-collapse'); if (el) el.classList.toggle('open'); }
function toggleBrandsCollapse() { const el = document.getElementById('brands-collapse'); if (el) el.classList.toggle('open'); }

function updateChatVisibility() {
  // Where the bubble shows is decided in CSS (chat-widget.html): hidden
  // on the product page, bag and checkout, visible on every other page.
  // Deriving it from the active page means no navigation path can leave
  // it stuck hidden; this just clears any inline style left by older code.
  if (DOM.chatBubble) DOM.chatBubble.style.removeProperty('display');
}
// ==================== IMAGE PROTECTION ====================
// Prevent long-press/right-click saving of product images

// Block context menu on product images
document.addEventListener('contextmenu', function(e) {
  if (e.target.closest('.product-img-wrap') || 
      e.target.closest('.product-main-image') || 
      e.target.closest('.product-thumbnail') ||
      e.target.closest('[style*="background-image"]')) {
    e.preventDefault();
    return false;
  }
});

// Block long-press on mobile for product images
document.addEventListener('touchstart', function(e) {
  if (e.target.closest('.product-img-wrap') || 
      e.target.closest('.product-main-image') || 
      e.target.closest('.product-thumbnail')) {
    // Only prevent if it's a long press (not a swipe)
    const touch = e.touches[0];
    const target = e.target;
    
    // Set a timeout to detect long press
    const longPressTimer = setTimeout(() => {
      e.preventDefault();
      // Show a subtle feedback that saving is disabled
      if (target.style) {
        target.style.opacity = '0.8';
        setTimeout(() => { target.style.opacity = ''; }, 200);
      }
    }, 500);
    
    // Clear timeout on touch end or move
    target.addEventListener('touchend', () => clearTimeout(longPressTimer), { once: true });
    target.addEventListener('touchmove', () => clearTimeout(longPressTimer), { once: true });
  }
}, { passive: false });

// Prevent dragging of any background-image divs
document.addEventListener('dragstart', function(e) {
  if (e.target.closest('.product-img-wrap') || 
      e.target.closest('.product-main-image') || 
      e.target.closest('.product-thumbnail') ||
      e.target.style.backgroundImage) {
    e.preventDefault();
    return false;
  }
});
