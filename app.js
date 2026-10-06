const DOM = {
  get cartBadge() { return document.getElementById("cart-badge"); },
  get wishBadge() { return document.getElementById("wish-badge"); },
  get cartItemCount() { return document.getElementById("cart-item-count"); },
  get searchOverlay() { return document.getElementById("search-overlay"); },
  get searchInput() { return document.getElementById("search-input"); },
  get searchBody() { return document.getElementById("search-body"); },
  get menuBackdrop() { return document.getElementById("menu-backdrop"); },
  get menuDrawer() { return document.getElementById("menu-drawer"); },
  get cartBackdrop() { return document.getElementById("cart-backdrop"); },
  get cartPanel() { return document.getElementById("cart-panel"); },
  get arrivalsGrid() { return document.getElementById("arrivals-grid"); },
  get allProductsGrid() { return document.getElementById("all-products-grid"); },
  get categoryProductsGrid() { return document.getElementById("category-products-grid"); },
  get categoryNameTag() { return document.getElementById("category-name-tag"); },
  get categoryDescriptionWrap() { return document.getElementById("category-description-wrap"); },
  get productDetail() { return document.getElementById("page-product-detail"); },
  get cartBody() { return document.getElementById("cart-body"); },
  get cartFoot() { return document.getElementById("cart-foot"); },
  get cartPageContent() { return document.getElementById("cart-page-content"); },
  get wishPageContent() { return document.getElementById("wish-page-content"); },
  get campaignSlides() { return document.getElementById("campaign-slides"); },
  get reviewStars() { return document.getElementById("review-stars"); },
  get reviewText() { return document.getElementById("review-text"); },
  get reviewName() { return document.getElementById("review-name"); },
  get reviewImageInput() { return document.getElementById("review-image-input"); },
  get reviewImagePreview() { return document.getElementById("review-image-preview"); },
  get reviewModalBackdrop() { return document.getElementById("review-modal-backdrop"); },
  get gridToggleSvg() { return document.getElementById("grid-toggle-svg"); },
  get catGridToggleSvg() { return document.getElementById("cat-grid-toggle-svg"); },
  get mainNav() { return document.getElementById("main-nav"); },
  get homepageNewsletterSection() { return document.getElementById("homepage-newsletter-section"); },
  get heroBg() { return document.getElementById("hero-bg"); },
  hero: null,
  get chatBubble() { return document.getElementById("live-chat-bubble"); }
};

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
  cart:[], wishlist:[], currency:"ZAR", currentPage:"home", currentCategoryPage:null, selectedSize:null, productVariantSelections:{}, imageMode:"ghost", gridCols:2, gridColsCat:2, gridColsWish:2, gridColsVendor:2, filter:{cat:[],size:"all",vendor:[],onSale:false,inStock:false}, catFilter:{cat:[],size:"all",vendor:[],onSale:false,inStock:false}, vendorFilter:{cat:[],size:"all",vendor:[],onSale:false,inStock:false}, currentVendor:null, sortBy:"featured", campaignSlideIndex:0, recentlyViewed:[], currentSlide:0, cardTouchStartX:{}, cardSlideIndex:{}, swipeState:{}, previousCollectionPage:null, currentReviewProductId:null, saleMode:false, categoriesSlideIndex:0, productInfoTab:'description', stickyExtended:false, stickyWishHidden:false, activeSortTab:null
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
async function backfillMissingSlugs(products) {
  const existingSlugs = new Set(products.filter(p => p.slug).map(p => p.slug));
  const writes = [];
  products.forEach(p => {
    if (!p.slug) {
      const slug = makeUniqueSlug(generateSlugBase(p.name), existingSlugs);
      p.slug = slug;
      writes.push(
        db.collection('products').doc(p.id).update({ slug }).catch(e => {
          console.warn('Slug backfill failed for', p.id, e);
        })
      );
    }
  });
  if (writes.length) await Promise.all(writes);
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
    await backfillMissingSlugs(products);
    return products;
  } catch(e) {
    console.error('Error fetching products:', e);
    return [];
  }
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
window.closeCart = closeCart;
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
window.selectStickySize = selectStickySize;
window.handleStickyAddClick = handleStickyAddClick;
window.subscribeNewsletter = subscribeNewsletter;

// ==================== CLOSE FILTER PANEL HELPER ====================
function closeFilterPanel() {
  const filterPanel = document.getElementById('collection-filter-options');
  const filterBackdrop = document.getElementById('collection-filter-backdrop');
  if (filterPanel) filterPanel.classList.remove('open');
  if (filterBackdrop) filterBackdrop.classList.remove('open');
}

async function init() {
  loadCartFromStorage();
  updateBadges();
  PRODUCTS = await fetchProducts();
  _resolveProductsReady();
  cleanCartOrphans();
  loadRecentlyViewedFromStorage();
  loadWishlistFromStorage();
  updateBadges();
  buildArrivals();
  if (typeof renderSiteContent === 'function') renderSiteContent();
  const footerIds = ["main-footer","products-footer","category-footer","campaign-footer","cart-footer","wishlist-footer","editorial-footer","checkout-footer","login-footer","account-footer","vendor-footer","content-footer"];
  footerIds.forEach(id => { const el = document.getElementById(id); if (el) buildFooter(id); });
  buildCampaignSlider();
  initVendors();
  initNavScroll();

  // Path-based routes (/products/slug, /collections/cat, /pages/slug, /shop, /login, etc)
  // take priority over hash routes.
  const pathRoute = getRouteFromPath();
  if (pathRoute) {
    if (pathRoute.page === 'product-detail') {
      const product = findProductBySlug(pathRoute.slug);
      if (product) { goToProduct(product.id, true); }
      else { navigateTo('home'); }
    } else if (pathRoute.page === 'category') {
      navigateToCategory(pathRoute.cat, true);
    } else if (pathRoute.page === 'content') {
      navigateToContentPage(pathRoute.slug, true);
    } else if (pathRoute.page === 'vendor') {
      navigateToVendor(pathRoute.slug, true);
    } else if (pathRoute.page === 'login') {
      await window.authReady;
      navigateToLogin(true);
    } else if (pathRoute.page === 'account') {
      await window.authReady;
      navigateToAccount(true);
    } else if (['cart','wishlist','checkout','products','campaign','editorial'].includes(pathRoute.page)) {
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
      navigateToCategory(route.cat, true);
    }
    else if (route.page === 'login') { await window.authReady; navigateToLogin(true); }
    else if (route.page === 'account') { await window.authReady; navigateToAccount(true); }
    else if (['cart','wishlist','checkout','products','campaign','editorial'].includes(route.page)) {
      navigateTo(route.page, true);
    }
    else navigateTo('home');
  }
  updateChatVisibility();
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

function getRouteFromHash() { const hash = window.location.hash.replace('#', ''); if (!hash) return { page: 'home' }; if (hash === 'products') return { page: 'products' }; if (hash === 'campaign') return { page: 'campaign' }; if (hash === 'cart') return { page: 'cart' }; if (hash === 'wishlist') return { page: 'wishlist' }; if (hash === 'checkout') return { page: 'checkout' }; if (hash === 'editorial') return { page: 'editorial' }; if (hash === 'login') return { page: 'login' }; if (hash === 'account') return { page: 'account' }; if (hash.startsWith('category-')) return { page: 'category', cat: hash.replace('category-', '') }; if (hash.startsWith('product-')) return { page: 'product-detail', productId: hash.replace('product-', '') }; return { page: 'home' }; }

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
  m = path.match(/^\/brands\/([^\/]+)\/?$/);
  if (m) return { page: 'vendor', slug: decodeURIComponent(m[1]) };
  m = path.match(/^\/(shop|login|account|checkout|cart|wishlist|campaign|editorial)\/?$/);
  if (m) return { page: URL_TO_PAGE_MAP[m[1]] || m[1] };
  return null;
}

window.addEventListener('popstate', async () => {
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
      navigateToVendor(pathRoute.slug, true);
      return;
    } else if (pathRoute.page === 'login') {
      await window.authReady;
      navigateToLogin(true);
      return;
    } else if (pathRoute.page === 'account') {
      await window.authReady;
      navigateToAccount(true);
      return;
    } else if (['cart','wishlist','checkout','products','campaign','editorial'].includes(pathRoute.page)) {
      navigateTo(pathRoute.page, true);
      return;
    }
  }
  const route = getRouteFromHash();
  if (route.page === 'product-detail') goToProduct(route.productId, true);
  else if (route.page === 'category') navigateToCategory(route.cat, true);
  else if (route.page === 'login') { await window.authReady; navigateToLogin(true); }
  else if (route.page === 'account') { await window.authReady; navigateToAccount(true); }
  else if (['cart','wishlist','checkout','products','campaign','editorial'].includes(route.page)) navigateTo(route.page, true);
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
}

function navigateTo(page, replaceUrl) {
  closeFilterPanel();
  closeSearch();
  S.saleMode = false; S.filter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false};
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  S.currentPage = page; window.scrollTo({top:0,behavior:"instant"}); removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page","collection-page"); }
  setNavForPage(page);
  if (page === 'home') updateHash('');
  else if (PAGE_URL_MAP.hasOwnProperty(page)) updateCleanUrl(page, replaceUrl);
  else updateHash(page);
  if(page==="products"){ DOM.mainNav?.classList.add("collection-page"); S.activeSortTab = 'all'; renderCollectionSortingTabs(); renderAllProducts(); ensureNavScrolled(); S.previousCollectionPage='products'; }
  if(page==="cart"){ renderCartPage(); ensureNavScrolled(); }
  if(page==="wishlist"){ renderWishlistPage(); ensureNavScrolled(); }
  if(page==="checkout"){ navigateToCheckout(replaceUrl); }
  if(page==="editorial") ensureNavScrolled();
  updateChatVisibility();
}

function navigateToCategory(cat, replaceUrl) {
  closeFilterPanel();
  closeSearch();
  S.saleMode = false; S.catFilter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false}; updateCollectionUrl(cat, replaceUrl);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-category").classList.add("active"); S.currentPage="category"; S.currentCategoryPage=cat;
  S.previousCollectionPage = cat; removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  setNavForPage('category');
  S.activeSortTab = cat;
  renderCollectionSortingTabs();
  if(DOM.categoryNameTag) DOM.categoryNameTag.textContent = '';
  renderCategoryProducts(); window.scrollTo({top:0,behavior:"instant"}); ensureNavScrolled(); updateChatVisibility();
}

function goToProduct(productId, replaceUrl) {
  closeFilterPanel();
  closeSearch();
  S.saleMode = false; S.filter.vendor = []; closeCart();
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

function goBackFromProduct() { closeFilterPanel(); removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page"); if(S.previousCollectionPage&&S.previousCollectionPage!=='products') navigateToCategory(S.previousCollectionPage); else navigateTo('products'); }

function goBackHome() { closeFilterPanel(); removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page","collection-page"); document.body.classList.remove('on-collection-page'); navigateTo('home'); }

function navigateToSale() { closeFilterPanel(); closeSearch(); S.saleMode = true; S.filter = {cat:[], size:"all", vendor:[], onSale:false, inStock:false}; updateCleanUrl('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.activeSortTab = 'sale'; renderCollectionSortingTabs(); renderSaleProducts(); window.scrollTo({top:0,behavior:"instant"}); setNavForPage('products'); ensureNavScrolled(); updateChatVisibility(); }

function navigateToLogin(replaceUrl) {
  closeFilterPanel();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-login").classList.add("active");
  S.currentPage = "login"; updateCleanUrl('login', replaceUrl);
  window.scrollTo({top:0,behavior:"instant"}); setNavForPage('login'); ensureNavScrolled();
}

function navigateToAccount(replaceUrl) {
  closeFilterPanel();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-account").classList.add("active");
  S.currentPage = "account"; updateCleanUrl('account', replaceUrl);
  window.scrollTo({top:0,behavior:"instant"}); setNavForPage('account'); ensureNavScrolled();
}

function navigateToCheckout(replaceUrl) {
  closeFilterPanel();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-checkout").classList.add("active");
  S.currentPage = "checkout"; updateCleanUrl('checkout', replaceUrl);
  window.scrollTo({top:0,behavior:"instant"}); setNavForPage('checkout'); ensureNavScrolled();
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
  ensureNavScrolled();
}

// Hero image is now admin-set (siteContent/homepage.hero.imageUrl, see
// site-content.js) — one image, CSS object-fit/background-size:cover
// handles desktop/mobile responsively, so there's no more desktop/mobile
// URL switching to do here.

function openMenu() { closeFilterPanel(); DOM.menuBackdrop.classList.add("open"); DOM.menuDrawer.classList.add("open"); }
function closeMenu() { DOM.menuBackdrop.classList.remove("open"); DOM.menuDrawer.classList.remove("open"); }
function toggleSubmenuCollapse(section) { const el = document.getElementById(section + '-collapse'); if (el) el.classList.toggle('open'); }
function toggleBrandsCollapse() { const el = document.getElementById('brands-collapse'); if (el) el.classList.toggle('open'); }

function updateChatVisibility() {
  if (!DOM.chatBubble) return;
  const hiddenPages = ['product-detail', 'products', 'category', 'wishlist', 'cart'];
  DOM.chatBubble.style.display = hiddenPages.includes(S.currentPage) ? 'none' : 'flex';
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
