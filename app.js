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
const CURRENCIES = { ZAR:{label:"ZAR R",symbol:"R"}, BWP:{label:"BWP P",symbol:"P"}, USD:{label:"USD $",symbol:"$"}, LSL:{label:"LSL M",symbol:"M"}, NAD:{label:"NAD N$",symbol:"N$"} };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect fill='%23f0ede8' width='400' height='500'/%3E%3C/svg%3E";
function formatPrice(price, currency) {
  if (currency && CURRENCIES[currency]) {
    return CURRENCIES[currency].symbol + ' ' + (price || 0).toLocaleString();
  }
  return 'R ' + (price || 0).toLocaleString();
}
const S = {
  cart:[], wishlist:[], currentPage:"home", currentCategoryPage:null, selectedSize:null, productVariantSelections:{}, imageMode:"ghost", gridCols:2, gridColsCat:2, filter:{cat:"all",size:"all",price:"all",vendor:null}, catFilter:{size:"all",price:"all"}, campaignSlideIndex:0, recentlyViewed:[], currentSlide:0, cardTouchStartX:{}, cardSlideIndex:{}, swipeState:{}, previousCollectionPage:null, currentReviewProductId:null, saleMode:false, categoriesSlideIndex:0, productInfoTab:'description', stickyExtended:false, stickyWishHidden:false, activeSortTab:null
};

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

function findProductBySlug(slug) {
  return PRODUCTS.find(p => p.slug === slug) || PRODUCTS.find(p => p.id === slug);
}

async function fetchProducts() {
  try {
    const snapshot = await db.collection('products').where('status','==','active').get();
    if(!snapshot.empty) {
      const products = snapshot.docs.map(d=>({id:d.id,...d.data()}));
      await backfillMissingSlugs(products);
      return products;
    }
  } catch(e) {}
  await new Promise(r=>setTimeout(r,600));
  return [
    { id:"nova-sunglasses", slug:"janedore-logo-nova-sunglasses", sku:"ACC-NSG-006", name:"Janedore Logo Nova Sunglasses", brand:"JANEDORE", category:"sunglasses", price:350, salePrice:280, badge:"sale", sizes:["OS"], stock:10, status:"active", featured:true, description:"Bold yet refined sunglasses featuring UV400 lenses and a distinctive warm brown finish.", productFeatures:"UV400 lenses.", compositionCare:"Acetate frame.", shippingReturns:"Free shipping over R1000.", measurements:"Model wears size OS. Lens width: 52mm.", variants:[{ color:"Warm Brown", swatch:"#AF3E06", images:{ model:[], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/C8DC66E1-BB21-4807-BC2C-C7F52A8005CE.png?v=1778858287"], detail:[] } }] },
    { id:"tenese-gold-earrings", slug:"stainless-steel-tenese-gold-earrings", sku:"JWL-TGE-005", name:"Stainless Steel Tenesè Gold Earrings", brand:"NIRIUS CO", category:"jewelry", price:380, salePrice:null, badge:"new", sizes:["Stainless Steel"], stock:10, status:"active", featured:true, description:"Sculptural gold earrings crafted from premium gold-plated stainless steel.", productFeatures:"18k gold-plated.", compositionCare:"Gold-plated stainless steel.", shippingReturns:"Free shipping over R1500.", measurements:"Length: 3.5cm. Weight: 12g each.", variants:[{ color:"Gold", swatch:"#d4af37", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6607.png?v=1778790153"], detail:[] } }] },
    { id:"janedore-leather-pouch", slug:"janedore-debossed-leather-pouch", sku:"ACC-JLP-007", name:"Janedore Debossed Leather Pouch", brand:"JANEDORE", category:"bags", price:50, salePrice:null, badge:null, sizes:["OS"], stock:50, status:"active", featured:false, description:"Supple debossed leather pouch.", productFeatures:"Genuine leather.", compositionCare:"100% Leather.", shippingReturns:"Free with sunglass purchase.", measurements:"Dimensions: 18cm x 12cm.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"], detail:[] } }] },
    { id:"janedore-raffle-brandy-black-dress", slug:"janedore-raffle-brandy-black-dress", sku:"DRS-RBB-001", name:"Janedore Raffle Brandy Black Dress", brand:"JANEDORE", category:"dresses", price:450, salePrice:380, badge:"sale", sizes:["S","M","L"], stock:40, status:"active", featured:true, description:"Fluid silhouette and quiet tension. This weighted crepe dress moves with you.", productFeatures:"Weighted crepe fabric.", compositionCare:"100% Polyester.", shippingReturns:"Free shipping over R1000.", measurements:"Model wears size S. Length: 98cm.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/116AE49E-1C83-474E-B538-B3147C826859.png?v=1778858287"], detail:[] } }] },
    { id:"thato-rumination-tea-parfum", slug:"thato-rumination-tea-parfum", sku:"PRF-TRT-001", name:"Thato Rumination Tea Parfum", brand:"THATO", category:"parfum", price:350, salePrice:299, badge:"sale", sizes:["OS"], stock:30, status:"active", featured:true, description:"A contemplative fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", measurements:"Volume: 50ml.", variants:[{ color:"Pale Linen", swatch:"#EBEDE0", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"], detail:[] } }] },
    { id:"thato-pink-rain-parfum", slug:"thato-pink-rain-parfum", sku:"PRF-TPR-002", name:"Thato Pink Rain Parfum", brand:"THATO", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:25, status:"active", featured:true, description:"A delicate, romantic fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", measurements:"Volume: 50ml.", variants:[{ color:"Pink Rain", swatch:"#F3DBD7", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6630.png?v=1778801279"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/FD9FBEA5-4CD8-421E-A549-F67099AD9B79.png?v=1778801677"], detail:[] } }] },
    { id:"janedore-studded-halter-dress", slug:"janedore-studded-halter-neck-dress", sku:"DRS-SHN-001", name:"Janedore Studded Halter Neck Dress", brand:"JANEDORE", category:"dresses", price:680, salePrice:null, badge:"new", sizes:["XS","S","M","L"], stock:20, status:"active", featured:true, description:"Refined edge meets feminine structure.", productFeatures:"Structured halter neckline.", compositionCare:"95% Polyester, 5% Elastane.", shippingReturns:"Free shipping over R1000.", measurements:"Model wears size S. Length: 92cm.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/BB8C5723-337D-4CB3-B9B8-9FC4BF36CBFE.png?v=1779001142"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/27BAAA95-3B6D-4CCE-A2D8-FFF60326A881.png?v=1779001142"], detail:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_1.png?v=1779001150","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_2.png?v=1779001160","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_3.png?v=1779001170"] } }] }
  ];
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
window.calculateShipping = calculateShipping;
window.selectStickySize = selectStickySize;
window.handleStickyAddClick = handleStickyAddClick;
window.subscribeNewsletter = subscribeNewsletter;

async function init() {
  loadCartFromStorage();
  updateBadges();
  PRODUCTS = await fetchProducts();
  cleanCartOrphans();
  loadWishlistFromStorage();
  updateBadges();
  setHeroImage();
  buildArrivals();
  const footerIds = ["main-footer","products-footer","category-footer","campaign-footer","cart-footer","wishlist-footer","editorial-footer","checkout-footer","login-footer","account-footer"];
  footerIds.forEach(id => { const el = document.getElementById(id); if (el) buildFooter(id); });
  buildCampaignSlider();
  initVendors();

  // Path-based product routes (/products/slug) take priority over hash routes.
  const pathRoute = getRouteFromPath();
  if (pathRoute) {
    const product = findProductBySlug(pathRoute.slug);
    if (product) { goToProduct(product.id, true); }
    else { navigateTo('home'); }
  } else {
    const route = getRouteFromHash();
    if (route.page === 'product-detail') {
      // Legacy link like #product-prod-1788177528434 — load the product
      // and goToProduct() will clean the URL to /products/slug below.
      goToProduct(route.productId, true);
    }
    else if (route.page === 'category') navigateToCategory(route.cat);
    else if (route.page === 'login') navigateToLogin();
    else if (route.page === 'account') navigateToAccount();
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

// Pushes (or replaces) the clean /products/{slug} URL for a product page.
function updateProductUrl(product, replaceUrl) {
  const slug = product.slug || product.id;
  const newPath = '/products/' + encodeURIComponent(slug);
  if (window.location.pathname === newPath) return;
  if (replaceUrl) history.replaceState(null, null, newPath);
  else history.pushState(null, null, newPath);
}

function getRouteFromHash() { const hash = window.location.hash.replace('#', ''); if (!hash) return { page: 'home' }; if (hash === 'products') return { page: 'products' }; if (hash === 'campaign') return { page: 'campaign' }; if (hash === 'cart') return { page: 'cart' }; if (hash === 'wishlist') return { page: 'wishlist' }; if (hash === 'checkout') return { page: 'checkout' }; if (hash === 'editorial') return { page: 'editorial' }; if (hash === 'login') return { page: 'login' }; if (hash === 'account') return { page: 'account' }; if (hash.startsWith('category-')) return { page: 'category', cat: hash.replace('category-', '') }; if (hash.startsWith('product-')) return { page: 'product-detail', productId: hash.replace('product-', '') }; return { page: 'home' }; }

// Reads clean /products/{slug} URLs.
function getRouteFromPath() {
  const match = window.location.pathname.match(/^\/products\/([^\/]+)\/?$/);
  if (match) return { page: 'product-detail', slug: decodeURIComponent(match[1]) };
  return null;
}

window.addEventListener('popstate', () => {
  const pathRoute = getRouteFromPath();
  if (pathRoute) {
    const product = findProductBySlug(pathRoute.slug);
    if (product) { goToProduct(product.id, true); return; }
  }
  const route = getRouteFromHash();
  if (route.page === 'product-detail') goToProduct(route.productId, true);
  else if (route.page === 'category') navigateToCategory(route.cat);
  else if (route.page === 'login') navigateToLogin();
  else if (route.page === 'account') navigateToAccount();
  else navigateTo('home');
});

function setNavForPage(page) {
  if (!DOM.mainNav) return;
}

function navigateTo(page) {
  S.saleMode = false; S.filter.vendor = null;
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  S.currentPage = page; window.scrollTo({top:0,behavior:"instant"}); removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page","collection-page"); }
  setNavForPage(page);
  updateHash(page === 'home' ? '' : page);
  if(page==="products"){ DOM.mainNav?.classList.add("collection-page"); S.activeSortTab = 'all'; renderCollectionSortingTabs(); renderAllProducts(); ensureNavScrolled(); S.previousCollectionPage='products'; }
  if(page==="cart"){ renderCartPage(); ensureNavScrolled(); }
  if(page==="wishlist"){ renderWishlistPage(); ensureNavScrolled(); }
  if(page==="checkout"){ navigateToCheckout(); }
  if(page==="editorial") ensureNavScrolled();
  updateChatVisibility(); setTimeout(refreshSwipeTracks, 50);
}

function navigateToCategory(cat) {
  S.saleMode = false; S.filter.vendor = null; updateHash(`category-${cat}`);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-category").classList.add("active"); S.currentPage="category"; S.currentCategoryPage=cat;
  S.previousCollectionPage = cat; removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  setNavForPage('category');
  S.activeSortTab = cat;
  renderCollectionSortingTabs();
  if(DOM.categoryNameTag) DOM.categoryNameTag.textContent = '';
  renderCategoryProducts(); window.scrollTo({top:0,behavior:"instant"}); ensureNavScrolled(); setTimeout(refreshSwipeTracks, 50); updateChatVisibility();
}

function goToProduct(productId, replaceUrl) {
  S.saleMode = false; S.filter.vendor = null; closeCart();
  const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  updateProductUrl(product, replaceUrl);
  S.recentlyViewed=S.recentlyViewed.filter(p=>p.id!==productId); S.recentlyViewed.unshift(product); if(S.recentlyViewed.length>6) S.recentlyViewed.pop();
  if (S.currentPage === 'category' || S.currentPage === 'products') S.previousCollectionPage = S.currentCategoryPage || 'products';
  S.currentReviewProductId = productId;
  S.stickyWishHidden = false;
  if(DOM.mainNav) { DOM.mainNav.classList.add("product-page"); DOM.mainNav.classList.remove("collection-page"); }
  renderProductPage(product); updateChatVisibility();
}

function goBackFromProduct() { removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page"); if(S.previousCollectionPage&&S.previousCollectionPage!=='products') navigateToCategory(S.previousCollectionPage); else navigateTo('products'); }

function goBackHome() { removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page","collection-page"); navigateTo('home'); }

function navigateToSale() { S.saleMode = true; S.filter.vendor = null; updateHash('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.activeSortTab = 'sale'; renderCollectionSortingTabs(); renderSaleProducts(); window.scrollTo({top:0,behavior:"instant"}); setNavForPage('products'); ensureNavScrolled(); updateChatVisibility(); }

function navigateToLogin() {
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-login").classList.add("active");
  S.currentPage = "login"; updateHash('login');
  window.scrollTo({top:0,behavior:"instant"}); setNavForPage('login'); ensureNavScrolled();
}

function navigateToAccount() {
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-account").classList.add("active");
  S.currentPage = "account"; updateHash('account');
  window.scrollTo({top:0,behavior:"instant"}); setNavForPage('account'); ensureNavScrolled();
}

function navigateToCheckout() {
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-checkout").classList.add("active");
  S.currentPage = "checkout"; updateHash('checkout');
  window.scrollTo({top:0,behavior:"instant"}); setNavForPage('checkout'); ensureNavScrolled();
}

function ensureNavScrolled() { if (DOM.mainNav) DOM.mainNav.classList.add("scrolled"); }

function isDesktop() { return window.innerWidth >= 769; }
function setHeroImage() { if(DOM.heroBg) DOM.heroBg.style.backgroundImage = isDesktop() ? "url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6700.png?v=1778930159')" : "url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-7785.png?v=1782670201')"; }
window.addEventListener('resize', setHeroImage);

function openMenu() { DOM.menuBackdrop.classList.add("open"); DOM.menuDrawer.classList.add("open"); }
function closeMenu() { DOM.menuBackdrop.classList.remove("open"); DOM.menuDrawer.classList.remove("open"); }
function toggleSubmenuCollapse(section) { const el = document.getElementById(section + '-collapse'); if (el) el.classList.toggle('open'); }
function toggleBrandsCollapse() { const el = document.getElementById('brands-collapse'); if (el) el.classList.toggle('open'); }

function updateChatVisibility() {
  if (!DOM.chatBubble) return;
  const hiddenPages = ['product-detail', 'products', 'category', 'wishlist', 'cart'];
  DOM.chatBubble.style.display = hiddenPages.includes(S.currentPage) ? 'none' : 'flex';
}
