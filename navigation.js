function updateHash(hash) { if (window.location.hash !== hash) history.pushState(null, null, hash || '#'); }
function getRouteFromHash() { const hash = window.location.hash.replace('#', ''); if (!hash) return { page: 'home' }; if (hash === 'products') return { page: 'products' }; if (hash === 'campaign') return { page: 'campaign' }; if (hash === 'cart') return { page: 'cart' }; if (hash === 'wishlist') return { page: 'wishlist' }; if (hash === 'checkout') return { page: 'checkout' }; if (hash === 'editorial') return { page: 'editorial' }; if (hash === 'login') return { page: 'login' }; if (hash === 'account') return { page: 'account' }; if (hash.startsWith('category-')) return { page: 'category', cat: hash.replace('category-', '') }; if (hash.startsWith('product-')) return { page: 'product-detail', productId: hash.replace('product-', '') }; return { page: 'home' }; }
window.addEventListener('popstate', () => { const route = getRouteFromHash(); if (route.page === 'product-detail') goToProduct(route.productId); else if (route.page === 'category') navigateToCategory(route.cat); else if (route.page === 'login') navigateToLogin(); else if (route.page === 'account') navigateToAccount(); else navigateTo(route.page); });

function navigateTo(page) {
  S.saleMode = false; S.filter.vendor = null; updateHash(page === 'home' ? '' : page);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  S.currentPage = page; window.scrollTo({top:0,behavior:"smooth"}); removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page","collection-page"); }
  if(page==="products"){ DOM.mainNav?.classList.add("collection-page"); S.activeSortTab = 'all'; renderCollectionSortingTabs(); renderAllProducts(); ensureNavScrolled(); S.previousCollectionPage='products'; }
  if(page==="cart"){ renderCartPage(); ensureNavScrolled(); }
  if(page==="wishlist"){ renderWishlistPage(); ensureNavScrolled(); }
  if(page==="checkout"){ navigateToCheckout(); }
  if(page==="home") setTimeout(checkNavForHome,50);
  if(page==="editorial") ensureNavScrolled();
  updateChatVisibility(); setTimeout(refreshSwipeTracks,50);
}
function navigateToCategory(cat) {
  S.saleMode = false; S.filter.vendor = null; updateHash(`category-${cat}`);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-category").classList.add("active"); S.currentPage="category"; S.currentCategoryPage=cat;
  S.previousCollectionPage = cat; removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  S.activeSortTab = cat;
  renderCollectionSortingTabs();
  if(DOM.categoryNameTag) DOM.categoryNameTag.textContent = '';
  renderCategoryProducts(); window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled(); setTimeout(refreshSwipeTracks,50); updateChatVisibility();
}
function goToProduct(productId) {
  S.saleMode = false; S.filter.vendor = null; updateHash(`product-${productId}`); closeCart();
  const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  S.recentlyViewed=S.recentlyViewed.filter(p=>p.id!==productId); S.recentlyViewed.unshift(product); if(S.recentlyViewed.length>6) S.recentlyViewed.pop();
  if (S.currentPage === 'category' || S.currentPage === 'products') S.previousCollectionPage = S.currentCategoryPage || 'products';
  S.currentReviewProductId = productId;
  S.stickyWishHidden = false;
  if(DOM.mainNav) { DOM.mainNav.classList.add("product-page"); DOM.mainNav.classList.remove("collection-page"); }
  renderProductPage(product); updateChatVisibility();
}
function goBackFromProduct() { removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page"); if(S.previousCollectionPage&&S.previousCollectionPage!=='products') navigateToCategory(S.previousCollectionPage); else navigateTo('products'); }
function goBackHome() { removeStickyBar(); if(DOM.mainNav) DOM.mainNav.classList.remove("product-page","collection-page"); navigateTo('home'); }
function navigateToSale() { S.saleMode = true; S.filter.vendor = null; updateHash('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.activeSortTab = 'sale'; renderCollectionSortingTabs(); renderSaleProducts(); window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled(); updateChatVisibility(); }

function initNavScroll() { DOM.hero = document.getElementById("hero"); window.addEventListener("scroll", () => { if (!DOM.hero) { DOM.mainNav.classList.add("scrolled"); return; } DOM.mainNav.classList.toggle("scrolled", DOM.hero.getBoundingClientRect().bottom <= 0); updateStickyBarOnScroll(); }, { passive: true }); }
function ensureNavScrolled() { DOM.mainNav.classList.add("scrolled"); }
function checkNavForHome() { DOM.hero = document.getElementById("hero"); if (!DOM.hero) { DOM.mainNav.classList.add("scrolled"); return; } DOM.mainNav.classList.toggle("scrolled", DOM.hero.getBoundingClientRect().bottom <= 0); }
function isDesktop() { return window.innerWidth >= 769; }
function setHeroImage() { if(DOM.heroBg) DOM.heroBg.style.backgroundImage = isDesktop() ? "url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6700.png?v=1778930159')" : "url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/1B332189-93D3-46B2-A719-F5CCBAEAF139.png?v=1778858287')"; }
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
