// Restore the customer's Firebase session before deciding which opening screen to show.
const appFirebaseConfig = {
  apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI",
  authDomain: "janedore-9f035.firebaseapp.com",
  projectId: "janedore-9f035",
  storageBucket: "janedore-9f035.firebasestorage.app",
  messagingSenderId: "571299748651",
  appId: "1:571299748651:web:01463a772d47b39cc4036e"
};
if (!firebase.apps.length) firebase.initializeApp(appFirebaseConfig);
const appAuth = firebase.auth();
const welcomeScreen = document.getElementById('app-welcome');
const guestButton = document.getElementById('app-continue-guest');
let guestContinuedThisLaunch = false;

function showAppHome() {
  if (welcomeScreen) welcomeScreen.hidden = true;
}

function showAppWelcome() {
  if (welcomeScreen) welcomeScreen.hidden = false;
}

if (guestButton) {
  guestButton.addEventListener('click', () => {
    guestContinuedThisLaunch = true;
    showAppHome();
  });
}

let authResolved = false;
function completeAppLaunch(user) {
  if (user && !user.isAnonymous) {
    showAppHome();
  } else if (guestContinuedThisLaunch) {
    showAppHome();
  } else {
    showAppWelcome();
  }
}

const launchFallback = window.setTimeout(() => {
  if (!authResolved) {
    authResolved = true;
    completeAppLaunch(null);
  }
}, 5000);

appAuth.onAuthStateChanged(user => {
  if (authResolved && !user) return;
  authResolved = true;
  window.clearTimeout(launchFallback);
  completeAppLaunch(user);
});


const nav = document.querySelector('.bottom-nav');
const navItems = [...document.querySelectorAll('.nav-item')];
const appWishlistStorageKey = 'janedore-app-wishlist-v1';
let appWishlistProductIds = new Set();
try {
  const savedWishlist = JSON.parse(localStorage.getItem(appWishlistStorageKey) || '[]');
  if (Array.isArray(savedWishlist)) appWishlistProductIds = new Set(savedWishlist.map(String).filter(Boolean));
} catch (error) {}
function appUpdateWishlistIndicator() {
  const count = appWishlistProductIds.size;
  const badge = document.querySelector('.nav-wishlist-count');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.hidden = count < 1;
  }
  const button = navItems.find(item => item.dataset.tab === 'Wishlist');
  if (button) button.setAttribute('aria-label', count ? 'Wishlist, ' + count + (count === 1 ? ' saved item' : ' saved items') : 'Wishlist');
}
function appToggleWishlistProduct(productId) {
  const id = String(productId || '');
  if (!id) return false;
  const next = !appWishlistProductIds.has(id);
  if (next) appWishlistProductIds.add(id);
  else appWishlistProductIds.delete(id);
  try { localStorage.setItem(appWishlistStorageKey, JSON.stringify([...appWishlistProductIds])); } catch (error) {}
  appUpdateWishlistIndicator();
  appUpdateProductImageWishlist();
  return next;
}
appUpdateWishlistIndicator();
const navIndicator = document.querySelector('.nav-indicator');

function moveNavIndicator(item) {
  if (!nav || !item || !navIndicator) return;
  const navRect = nav.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const x = itemRect.left - navRect.left + (itemRect.width - navIndicator.offsetWidth) / 2;
  nav.style.setProperty('--indicator-x', `${x}px`);
}

const initialNavItem = navItems.find(item => item.classList.contains('selected')) || navItems[0];
moveNavIndicator(initialNavItem);
window.addEventListener('resize', () => {
  moveNavIndicator(navItems.find(item => item.classList.contains('selected')));
});

const tabViews = [...document.querySelectorAll('.app-tab-content[data-view]')];
let appActiveTab = initialNavItem ? initialNavItem.dataset.tab : 'Home';
// Scroll history lives only for the current app runtime. A refresh or relaunch
// starts clean, while tab navigation within this runtime still restores positions.
const appTabMemories = new Map();
let appCollectionMemory = {type:'all-products',scrollY:0};
if (!appCollectionMemory.type) appCollectionMemory.type = 'all-products';
// Each bottom tab owns its last screen and its own scroll position.
// Screens are restored independently: tab root, collection, or product detail.
let appHomeScreen = 'home';
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let appScrollRestoreToken = 0;

function appPersistScrollMemories() {
  // Intentionally memory-only: never carry scroll history across refreshes or launches.
}

function appRestoreScrollPosition(scrollY) {
  const targetY = Math.max(0, Number(scrollY) || 0);
  const token = ++appScrollRestoreToken;
  window.scrollTo({top:targetY,behavior:'instant'});
  if (targetY > 0) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== appScrollRestoreToken) return;
      window.scrollTo({top:targetY,behavior:'instant'});
    }));
  }
}

function appDefaultTabMemory() {
  return {screen:'tab',scrollY:0,productId:null,productScrollY:0,productReturnToCollection:false,collectionScrollY:0};
}

function appSaveCurrentTabMemory() {
  if (!appActiveTab) return;
  const memory = appTabMemories.get(appActiveTab) || appDefaultTabMemory();
  const collectionPage = document.getElementById('app-shop-page');
  if (appActiveTab === 'Shop' && document.body.classList.contains('app-shop-brands-open')) {
    memory.screen = 'brands';
    memory.scrollY = window.scrollY;
  } else if (collectionPage && !collectionPage.hidden && (!appProductView || appProductView.hidden)) {
    memory.screen = 'collection';
    memory.collectionScrollY = window.scrollY;
    if (appActiveTab === 'Home') {
      appCollectionMemory.scrollY = window.scrollY;
      appHomeScreen = 'collection';
    }
  } else if (appProductView && !appProductView.hidden) {
    memory.screen = 'product';
    memory.productId = appCurrentProduct && appCurrentProduct.id
      ? String(appCurrentProduct.id)
      : (appRenderedProductId || memory.productId || null);
    memory.productScrollY = window.scrollY;
    memory.productReturnToCollection = !!appProductReturnToCollection;
  } else {
    memory.screen = 'tab';
    memory.scrollY = window.scrollY;
    memory.productId = null;
    memory.productScrollY = 0;
    memory.productReturnToCollection = false;
  }
  appTabMemories.set(appActiveTab,memory);
  appPersistScrollMemories();
}

let appScrollSaveQueued = false;
window.addEventListener('scroll', () => {
  if (appScrollSaveQueued) return;
  appScrollSaveQueued = true;
  requestAnimationFrame(() => {
    appScrollSaveQueued = false;
    if (appCartView && !appCartView.hidden) return;
    const memory = appTabMemories.get(appActiveTab) || appDefaultTabMemory();
    const collectionPage = document.getElementById('app-shop-page');
    if (appActiveTab === 'Shop' && document.body.classList.contains('app-shop-brands-open')) {
      memory.screen = 'brands';
      memory.scrollY = window.scrollY;
    } else if (appProductView && !appProductView.hidden) {
      memory.screen = 'product';
      memory.productId = appCurrentProduct && appCurrentProduct.id ? String(appCurrentProduct.id) : (appRenderedProductId || memory.productId || null);
      memory.productScrollY = window.scrollY;
      memory.productReturnToCollection = !!appProductReturnToCollection;
    } else if (collectionPage && !collectionPage.hidden) {
      memory.screen = 'collection';
      memory.collectionScrollY = window.scrollY;
      if (appActiveTab === 'Home') {
        appCollectionMemory.scrollY = window.scrollY;
        appHomeScreen = 'collection';
      }
    } else {
      memory.screen = 'tab';
      memory.scrollY = window.scrollY;
    }
    appTabMemories.set(appActiveTab,memory);
    appPersistScrollMemories();
  });
});

function appUpdateHeaderTitle(tabName) {
  const header = document.querySelector('.app-header-top');
  const logo = header?.querySelector('.app-logo');
  const pageTitle = header?.querySelector('.app-page-title');
  const brandsBack = header?.querySelector('.app-shop-brands-header-back');
  const searchLabel = document.getElementById('app-search-label');
  if (!logo || !pageTitle) return;
  const brandDirectoryOpen = document.body.classList.contains('app-shop-brands-open');
  document.body.classList.toggle('app-search-qr-visible', tabName === 'Home' || tabName === 'Shop' || tabName === 'Discover');
  if (searchLabel) {
    searchLabel.textContent = brandDirectoryOpen ? 'Search brands' : 'Search products and brands';
    searchLabel.setAttribute('aria-label', searchLabel.textContent);
  }
  const pageTitles = { Shop: brandDirectoryOpen ? 'A–Z Brands' : 'Shop', Discover: 'Brands' };
  const isPageTitle = Object.prototype.hasOwnProperty.call(pageTitles, tabName);
  logo.hidden = isPageTitle;
  pageTitle.hidden = !isPageTitle;
  if (brandsBack) brandsBack.hidden = !brandDirectoryOpen;
  pageTitle.textContent = isPageTitle ? pageTitles[tabName] : '';
  header.setAttribute('aria-label', isPageTitle ? pageTitles[tabName] : 'JANEDORE');
}

// Apply the initial tab's header state on page load, not only after navigation.
appUpdateHeaderTitle(appActiveTab);

function appSelectNavigationTab(tabName, activeButton) {
  appUpdateHeaderTitle(tabName);
  navItems.forEach(item => {
    const active = item === activeButton;
    item.classList.toggle('selected', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');

    // Use filled Phosphor icons for selected tabs, while keeping the custom
    // Home mark unchanged.
    if (item.dataset.tab !== 'Home') {
      const icon = item.querySelector('i[class*="ph-"]');
      if (icon) {
        icon.classList.toggle('ph-fill', active);
        icon.classList.toggle('ph', !active);
      }
    }
  });
  moveNavIndicator(activeButton);
}

// Page-navigation layer: show a tab's remembered page. This does not own
// the bottom navigation's selected state.
function appShowTabPage(tabName) {
  appProductReturnToCart = false;
  appProductReturnToCollection = false;
  const cartView = document.getElementById('app-cart-view');
  if (cartView && !cartView.hidden) {
    cartView.hidden = true;
    document.body.classList.remove('app-cart-open');
  }
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage) collectionPage.hidden = true;
  appActiveTab = tabName;
  const memory = appTabMemories.get(tabName) || appDefaultTabMemory();
  appTabMemories.set(tabName,memory);
  if (location.hash.startsWith('#product/') || location.hash === '#bag') {
    history.replaceState(null, '', location.pathname + location.search);
  }
  appProductView.hidden = true;
  document.body.classList.remove('app-product-open');
  const header = document.querySelector('.app-header');
  if (header) header.hidden = false;
  const purchaseRow = document.getElementById('app-product-sticky-bar');
  if (purchaseRow) purchaseRow.hidden = true;
  tabViews.forEach(view => { view.hidden = view.dataset.view !== tabName; });

  // Shop uses its own static category landing grid. The separate
  // all-products catalogue remains a Home destination and stays hidden on Shop.
  if (collectionPage) collectionPage.hidden = true;

  // Restore the Shop Brands directory when returning to Shop.
  if (tabName === 'Shop' && memory.screen === 'brands') {
    const shopGrid = document.querySelector('.app-shop-category-grid');
    const shopBrandsDirectory = document.getElementById('app-shop-brands-directory');
    document.body.classList.add('app-shop-brands-open');
    if (shopGrid) shopGrid.hidden = true;
    if (shopBrandsDirectory) shopBrandsDirectory.hidden = false;
    appUpdateHeaderTitle('Shop');
    appRestoreScrollPosition(memory.scrollY || 0);
    return;
  }

  // Restore the Home collection only when returning to Home.
  if (tabName === 'Home' && memory.screen === 'collection' && collectionPage) {
    tabViews.forEach(view => { view.hidden = true; });
    collectionPage.hidden = false;
    if (header) header.hidden = true;
    if (tabName === 'Home') appHomeScreen = 'collection';
    appRestoreScrollPosition(tabName === 'Home'
      ? (appCollectionMemory.scrollY || memory.collectionScrollY || 0)
      : (memory.collectionScrollY || 0));
    return;
  }

  if (tabName !== 'Shop' && memory.screen === 'product' && memory.productId) {
    const productId = String(memory.productId);
    const productScrollY = memory.productScrollY || 0;
    const returnToCollection = !!memory.productReturnToCollection;
    appOpenProduct(productId, false);
    appProductReturnToCollection = returnToCollection;
    memory.productReturnToCollection = returnToCollection;
    appTabMemories.set(tabName,memory);
    appPersistScrollMemories();
    appRestoreScrollPosition(productScrollY);
    return;
  }

  if (tabName === 'Home') appHomeScreen = 'home';
  document.body.classList.remove('app-shop-brands-open');
  appUpdateHeaderTitle(tabName);
  const shopGrid = document.querySelector('.app-shop-category-grid');
  const shopBrandsDirectory = document.getElementById('app-shop-brands-directory');
  if (shopGrid) shopGrid.hidden = false;
  if (shopBrandsDirectory) shopBrandsDirectory.hidden = true;
  appRestoreScrollPosition(memory.scrollY || 0);
}

// Page-navigation layer: coordinates page transitions and asks the state
// manager to save/restore page state. The bottom-nav click handler does not
// contain any of this routing logic.
function appNavigateToTab(tabName, activeButton) {
  if (tabName === 'Cart') {
    // Save the current Home → collection → product journey before Cart
    // temporarily takes over the screen. Returning to Home can then restore
    // the same product, its source collection, and both scroll positions.
    if (appCartView && appCartView.hidden) appSaveCurrentTabMemory();
    appCartOpen();
    return;
  }
  const cartView = document.getElementById('app-cart-view');
  if (cartView && !cartView.hidden) {
    appShowTabPage(tabName);
    return;
  }
  const collectionPage = document.getElementById('app-shop-page');
  if (tabName === appActiveTab && (!appProductView || appProductView.hidden) && (!collectionPage || collectionPage.hidden)) return;
  appSaveCurrentTabMemory();
  appShowTabPage(tabName);
}

navItems.forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;
    const reselectingTab = button.classList.contains('selected');

    if (reselectingTab && tabName !== 'Cart') {
      // Tapping an already-selected tab again returns it to its root screen
      // and clears that tab's remembered subpage and scroll position.
      const resetMemory = appDefaultTabMemory();
      appTabMemories.set(tabName, resetMemory);
      if (tabName === 'Home') {
        appCollectionMemory.scrollY = 0;
        const allCategory = appCategoryStrip && appCategoryStrip.querySelector('.app-category[data-category="all"]');
        if (allCategory) appSelectHomeCategory(allCategory);
      }
      appPersistScrollMemories();
      appSelectNavigationTab(tabName, button);
      appShowTabPage(tabName);
      window.scrollTo({top:0,behavior:'instant'});
      return;
    }

    appSelectNavigationTab(tabName, button);
    appNavigateToTab(tabName, button);
  });
});

// Keep the product navigation pinned while the page scrolls. The image actions
// disappear on scroll; the sticky header becomes white once the gallery has passed.
function appUpdateProductHeaderOnScroll() {
  const view = document.getElementById('app-product-view');
  const gallery = document.getElementById('app-product-gallery');
  if (!view || view.hidden || !gallery || !document.body.classList.contains('app-product-open')) {
    document.body.classList.remove('app-product-scrolled','app-product-header-solid');
    return;
  }
  const scrolled = window.scrollY > 18;
  const galleryBottom = gallery.getBoundingClientRect().bottom;
  const stickyHeader = document.getElementById('app-product-sticky-header');
  const headerBottom = stickyHeader ? stickyHeader.getBoundingClientRect().bottom : 58;
  document.body.classList.toggle('app-product-scrolled', scrolled);
  document.body.classList.toggle('app-product-header-solid', galleryBottom <= headerBottom);
}
window.addEventListener('scroll', appUpdateProductHeaderOnScroll, {passive:true});
window.addEventListener('resize', appUpdateProductHeaderOnScroll);
const appStickyProductName = document.getElementById('app-product-sticky-name');
const appStickyProductPrice = document.getElementById('app-product-sticky-price');
const appMainProductName = document.getElementById('app-product-name');
const appMainProductPrice = document.getElementById('app-product-price');
function appSyncStickyProductHeading() {
  if (appStickyProductName && appMainProductName) appStickyProductName.textContent = appMainProductName.textContent;
  if (appStickyProductPrice && appMainProductPrice) appStickyProductPrice.innerHTML = appMainProductPrice.innerHTML;
}
if (appMainProductName && appMainProductPrice) {
  const stickyHeadingObserver = new MutationObserver(appSyncStickyProductHeading);
  stickyHeadingObserver.observe(appMainProductName,{childList:true,subtree:true,characterData:true});
  stickyHeadingObserver.observe(appMainProductPrice,{childList:true,subtree:true,characterData:true,attributes:true});
  appSyncStickyProductHeading();
}

const headerCartButton = document.getElementById('app-header-cart');
if (headerCartButton) headerCartButton.addEventListener('click', () => {
  if (appCartView && appCartView.hidden) appSaveCurrentTabMemory();
  appCartOpen();
});

// The app reads the shared homepage hero and category tiles from the
// same Firestore content managed in Admin. The labels below are placeholders
// only until categories have been added in Admin > Categories.
fetch('/api/app-homepage', { headers: { Accept: 'application/json' } })
  .then(response => {
    if (!response.ok) throw new Error('Homepage content unavailable');
    return response.json();
  })
  .then(content => {
    const image = document.getElementById('app-home-hero-image');
    if (image && content.heroImageUrl) image.src = content.heroImageUrl;
    const welcomeImage = document.getElementById('app-welcome-image');
    if (welcomeImage && content.heroImageUrl) {
      const welcomeImageUrl = String(content.heroImageUrl);
      const welcomeImagePreload = new Image();
      welcomeImagePreload.onload = () => {
        const safeWelcomeImageUrl = welcomeImageUrl.replace(/["\\]/g, '');
        const backgroundValue = 'url("' + safeWelcomeImageUrl + '")';
        document.documentElement.style.setProperty('--app-welcome-background', backgroundValue);
        if (welcomeScreen) welcomeScreen.style.backgroundImage = backgroundValue;
        welcomeImage.src = welcomeImageUrl;
        try { localStorage.setItem('janedore_app_welcome_image', welcomeImageUrl); } catch (_) {}
      };
      welcomeImagePreload.onerror = () => {
        // Keep the last successfully cached welcome image if the new image fails.
      };
      welcomeImagePreload.src = welcomeImageUrl;
    }

    // Use the exact heading and CTA configured for the main website hero.
    const heroHeading = document.getElementById('app-home-hero-heading');
    const heroButton = document.getElementById('app-home-hero-button');
    if (heroHeading) heroHeading.textContent = content.heroHeading || '';
    if (heroButton) {
      heroButton.textContent = content.heroButtonText || '';
      const link = content.heroButtonLink || { type: 'products' };
      const value = String(link.value || '').trim();
      const destinations = {
        home: '/',
        products: '/shop',
        sale: '/sale',
        category: value ? '/collections/' + encodeURIComponent(value) : '/shop',
        collection: value ? '/collections/' + encodeURIComponent(value) : '/shop',
        vendor: value ? '/brands/' + encodeURIComponent(value) : '/brands',
        product: value ? '/products/' + encodeURIComponent(value) : '/shop',
        page: value ? '/pages/' + encodeURIComponent(value) : '/',
        url: /^https:\/\//i.test(value) ? value : '/shop'
      };
      if (link.type === 'products') {
        heroButton.href = '#all-products';
        heroButton.addEventListener('click', function(event) {
          event.preventDefault();
          appOpenHomeCollection();
        });
      } else {
        heroButton.href = destinations[link.type] || '/shop';
      }
      if (link.type === 'url' && /^https:\/\//i.test(value)) {
        heroButton.target = '_blank';
        heroButton.rel = 'noopener';
      }
    }

    const strip = document.querySelector('.app-category-list');
    if (!strip) return;
    const categoryOrder = [
      { name: 'All', slug: 'all' },
      { name: 'Clothing', slug: 'clothing' },
      { name: 'Accessories', slug: 'accessories' },
      { name: 'Beauty', slug: 'beauty' },
      { name: 'Fragrance', slug: 'fragrance' },
      { name: 'Kids', slug: 'kids' },
      { name: 'Homeware', slug: 'homeware' },
      { name: 'Brands', slug: 'brands' },
      { name: 'Sale', slug: 'sale' }
    ];
    const configuredCategories = Array.isArray(content.categories) ? content.categories : [];
    const categories = categoryOrder.map(category => {
      const configured = configuredCategories.find(item =>
        String(item.name || '').trim().toLowerCase() === category.name.toLowerCase()
      );
      return configured ? { ...configured, name: category.name, slug: category.slug } : category;
    });

    strip.replaceChildren();
    categories.forEach(category => {
      const item = document.createElement('div');
      item.className = 'app-category' + (category.slug === 'all' ? ' is-selected' : '');
      item.dataset.category = category.slug;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-pressed', String(category.slug === 'all'));

      const circle = document.createElement('span');
      circle.className = 'app-category-circle';
      circle.setAttribute('aria-hidden', 'true');
      if (category.slug === 'sale') {
        circle.classList.add('is-sale');
      } else if (category.slug === 'brands') {
        circle.classList.add('is-brands');
      }
      if (category.slug !== 'brands' && category.imageUrl && /^https:\/\//i.test(category.imageUrl)) {
        circle.style.backgroundImage = 'url("' + category.imageUrl.replace(/"/g, '') + '")';
        circle.classList.add('has-image');
      }

      const label = document.createElement('span');
      label.textContent = category.name;
      item.append(circle, label);
      strip.appendChild(item);
    });
  })
  .catch(error => console.warn('[APP HOME] Could not load shared homepage content:', error.message));


// Homepage category navigation switches the Home content only. It never
// opens the Shop collection or changes the selected bottom-navigation tab.
const appCategoryStrip = document.querySelector('.app-category-list');
const appHomeView = document.querySelector('.app-tab-content[data-view="Home"]');
function appRenderHomeCategory(category) {
  if (!appHomeView) return;
  const selectedCategory = category || 'all';
  const isAllHome = selectedCategory === 'all';
  const allSections = [...appHomeView.querySelectorAll(':scope > section:not(.app-category-strip):not(.app-category-home)')];

  // All is the full homepage. Every other category opens its own empty
  // category home for now, while keeping the shared header, search and
  // category selector available.
  allSections.forEach(section => { section.hidden = !isAllHome; });

  const categoryHome = document.getElementById('app-category-home');
  if (categoryHome) {
    categoryHome.hidden = isAllHome;
    categoryHome.dataset.category = selectedCategory;
    const selectedItem = appCategoryStrip && appCategoryStrip.querySelector('.app-category[data-category="' + selectedCategory + '"]');
    const categoryName = selectedItem ? selectedItem.textContent.trim() : selectedCategory;
    categoryHome.setAttribute('aria-label', categoryName + ' home');

    // Homepage category destinations remain separate from the Shop
    // Brands directory. Category-specific Home content can be added later.
    categoryHome.innerHTML = '';
  }
}

function appSelectHomeCategory(item) {
  if (!item) return;
  appHomeSelectedCategory = item.dataset.category || 'all';
  appCategoryStrip.querySelectorAll('.app-category').forEach(categoryItem => {
    const selected = categoryItem === item;
    categoryItem.classList.toggle('is-selected', selected);
    categoryItem.setAttribute('aria-pressed', String(selected));
  });
  appRenderHomeCategory(appHomeSelectedCategory);
}
if (appCategoryStrip) {
  appCategoryStrip.addEventListener('click', event => {
    const item = event.target.closest('.app-category[data-category]');
    if (item) appSelectHomeCategory(item);
  });
  appCategoryStrip.addEventListener('keydown', event => {
    const item = event.target.closest('.app-category[data-category]');
    if (item && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      appSelectHomeCategory(item);
    }
  });
}

// App card wishlist affordance: keep taps on the heart separate from product-card taps.
document.addEventListener('click', event => {
  const button = event.target.closest('.app-new-in-wishlist');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const card = button.closest('[data-product-id]');
  const productId = card && card.dataset.productId;
  if (!productId) return;
  const active = appToggleWishlistProduct(productId);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
  const icon = button.querySelector('i');
  if (icon) icon.className = active ? 'ph-fill ph-heart-straight' : 'ph ph-heart-straight';
  button.classList.toggle('is-wishlisted', active);
  appShowAddedToast(active ? 'Added to wishlist' : 'Removed from wishlist', active ? 'ph-heart' : 'ph-heart-break', 'wishlist');
});

// Keep the New In progress indicator in sync with horizontal scrolling.
const newInTrack = document.getElementById('app-new-in-track');
const newInProgress = document.querySelector('.app-new-in-progress');
const newInProgressFill = document.querySelector('.app-new-in-progress-fill');
function updateNewInProgress() {
  if (!newInTrack || !newInProgress || !newInProgressFill) return;
  const maxScroll = Math.max(0, newInTrack.scrollWidth - newInTrack.clientWidth);
  const visibleRatio = newInTrack.scrollWidth > 0 ? newInTrack.clientWidth / newInTrack.scrollWidth : 1;
  const thumbRatio = Math.min(1, visibleRatio);
  const travel = Math.max(0, newInProgress.clientWidth * (1 - thumbRatio));
  const progress = maxScroll > 0 ? newInTrack.scrollLeft / maxScroll : 0;
  newInProgressFill.style.width = (thumbRatio * 100) + '%';
  newInProgressFill.style.transform = 'translateX(' + (travel * progress) + 'px)';
  newInProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}
if (newInTrack) {
  newInTrack.addEventListener('scroll', updateNewInProgress, { passive: true });
  window.addEventListener('resize', updateNewInProgress);
  requestAnimationFrame(updateNewInProgress);
}

// Keep both Discover brand-slider indicators in sync with horizontal scrolling.
document.querySelectorAll('.app-discover-section').forEach(section => {
  const track = section.querySelector('.app-discover-brand-track');
  const progressBar = section.querySelector('.app-discover-progress');
  const fill = progressBar && progressBar.querySelector('.app-new-in-progress-fill');
  if (!track || !progressBar || !fill) return;
  const updateProgress = () => {
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const thumbRatio = track.scrollWidth > 0 ? Math.min(1, track.clientWidth / track.scrollWidth) : 1;
    const travel = Math.max(0, progressBar.clientWidth * (1 - thumbRatio));
    const progress = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
    fill.style.width = (thumbRatio * 100) + '%';
    fill.style.transform = 'translateX(' + (travel * progress) + 'px)';
    progressBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  };
  track.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  requestAnimationFrame(updateProgress);
});

// New In uses the same live Firestore products as the website homepage.
fetch('/api/app-new-in', { headers: { Accept: 'application/json' } })
  .then(response => {
    if (!response.ok) throw new Error('New In products unavailable');
    return response.json();
  })
  .then(data => {
    const track = document.getElementById('app-new-in-track');
    if (!track) return;
    const products = Array.isArray(data.products) ? data.products : [];
    products.forEach(product => { if (product && product.id) appProductCache.set(String(product.id), product); });
    if (!products.length) {
      track.innerHTML = '<p class="app-new-in-empty">New pieces will appear here soon.</p>';
      return;
    }
    const escapeText = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    track.innerHTML = products.map(product => {
      const regularPrice = Number(product.price) || 0;
      const salePrice = product.salePrice == null || product.salePrice === '' ? NaN : Number(product.salePrice);
      const sale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < regularPrice;
      const badge = Number(product.stock) <= 0
        ? 'SOLD OUT'
        : (String(product.badge || '').trim().toLowerCase() === 'pre-order'
          ? 'PRE-ORDER'
          : sale
            ? 'SALE'
            : (product.badge && !['new','sale','sold out','sold','free delivery'].includes(String(product.badge).toLowerCase())
              ? String(product.badge).toUpperCase()
              : 'NEW'));
      const price = sale
        ? '<span class="app-new-in-old-price">R' + escapeText(regularPrice.toFixed(2)) + '</span><span class="app-new-in-sale-price">R' + escapeText(salePrice.toFixed(2)) + '</span>'
        : '<span>R' + escapeText(regularPrice.toFixed(2)) + '</span>';
      const image = product.imageUrl && /^https:\/\//i.test(product.imageUrl)
        ? '<img src="' + escapeText(product.imageUrl) + '" alt="' + escapeText(product.name) + '" loading="lazy">'
        : '';
      return '<article class="app-new-in-card' + (product.stock <= 0 ? ' is-sold-out' : '') + '" data-product-id="' + escapeText(product.id || '') + '" role="button" tabindex="0" aria-label="View ' + escapeText(product.name) + '">' +
        '<div class="app-new-in-image">' + (badge ? '<span class="app-new-in-badge' + (badge === 'SALE' ? ' is-sale' : '') + '">' + escapeText(badge) + '</span>' : '') + image + '<button class="app-new-in-wishlist" type="button" aria-label="Add to wishlist" aria-pressed="false"><i class="ph ph-heart-straight" aria-hidden="true"></i></button></div>' +
        '<div class="app-new-in-brand">' + escapeText(appFormatBrandName(product.brand)) + '</div>' +
        '<div class="app-new-in-name">' + escapeText(product.name) + '</div>' +
        '<div class="app-new-in-price">' + price + '</div>' +
      '</article>';
    }).join('');
  })
  .catch(error => {
    const track = document.getElementById('app-new-in-track');
    if (track) track.innerHTML = '<p class="app-new-in-empty">New In is temporarily unavailable.</p>';
    console.warn('[APP NEW IN] Could not load shared products:', error.message);
  });


// Keep the empty Bestsellers slider indicator in sync with horizontal scrolling.
const bestsellersTrack = document.getElementById('app-bestsellers-track');
const bestsellersProgress = document.querySelector('.app-bestsellers-progress');
const bestsellersProgressFill = bestsellersProgress && bestsellersProgress.querySelector('.app-new-in-progress-fill');
function updateBestsellersProgress() {
  if (!bestsellersTrack || !bestsellersProgress || !bestsellersProgressFill) return;
  const maxScroll = Math.max(0, bestsellersTrack.scrollWidth - bestsellersTrack.clientWidth);
  const visibleRatio = bestsellersTrack.scrollWidth > 0 ? bestsellersTrack.clientWidth / bestsellersTrack.scrollWidth : 1;
  const thumbRatio = Math.min(1, visibleRatio);
  const travel = Math.max(0, bestsellersProgress.clientWidth * (1 - thumbRatio));
  const progress = maxScroll > 0 ? bestsellersTrack.scrollLeft / maxScroll : 0;
  bestsellersProgressFill.style.width = (thumbRatio * 100) + '%';
  bestsellersProgressFill.style.transform = 'translateX(' + (travel * progress) + 'px)';
  bestsellersProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}
if (bestsellersTrack) {
  bestsellersTrack.addEventListener('scroll', updateBestsellersProgress, { passive: true });
  window.addEventListener('resize', updateBestsellersProgress);
  requestAnimationFrame(updateBestsellersProgress);
}

// Keep the Shop Clothing placeholder slider indicator in sync.
const shopClothingTrack = document.getElementById('app-shop-clothing-track');
const shopClothingProgress = document.querySelector('.app-shop-clothing-progress');
const shopClothingProgressFill = shopClothingProgress && shopClothingProgress.querySelector('.app-new-in-progress-fill');
function updateShopClothingProgress() {
  if (!shopClothingTrack || !shopClothingProgress || !shopClothingProgressFill) return;
  const maxScroll = Math.max(0, shopClothingTrack.scrollWidth - shopClothingTrack.clientWidth);
  const visibleRatio = shopClothingTrack.scrollWidth > 0 ? shopClothingTrack.clientWidth / shopClothingTrack.scrollWidth : 1;
  const thumbRatio = Math.min(1, visibleRatio);
  const travel = Math.max(0, shopClothingProgress.clientWidth * (1 - thumbRatio));
  const progress = maxScroll > 0 ? shopClothingTrack.scrollLeft / maxScroll : 0;
  shopClothingProgressFill.style.width = (thumbRatio * 100) + '%';
  shopClothingProgressFill.style.transform = 'translateX(' + (travel * progress) + 'px)';
  shopClothingProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}
if (shopClothingTrack) {
  shopClothingTrack.addEventListener('scroll', updateShopClothingProgress, { passive: true });
  window.addEventListener('resize', updateShopClothingProgress);
  requestAnimationFrame(updateShopClothingProgress);
}

// Keep the Shop Accessories placeholder slider indicator in sync.
const shopAccessoriesTrack = document.getElementById('app-shop-accessories-track');
const shopAccessoriesProgress = document.querySelector('.app-shop-accessories-progress');
const shopAccessoriesProgressFill = shopAccessoriesProgress && shopAccessoriesProgress.querySelector('.app-new-in-progress-fill');
function updateShopAccessoriesProgress() {
  if (!shopAccessoriesTrack || !shopAccessoriesProgress || !shopAccessoriesProgressFill) return;
  const maxScroll = Math.max(0, shopAccessoriesTrack.scrollWidth - shopAccessoriesTrack.clientWidth);
  const visibleRatio = shopAccessoriesTrack.scrollWidth > 0 ? shopAccessoriesTrack.clientWidth / shopAccessoriesTrack.scrollWidth : 1;
  const thumbRatio = Math.min(1, visibleRatio);
  const travel = Math.max(0, shopAccessoriesProgress.clientWidth * (1 - thumbRatio));
  const progress = maxScroll > 0 ? shopAccessoriesTrack.scrollLeft / maxScroll : 0;
  shopAccessoriesProgressFill.style.width = (thumbRatio * 100) + '%';
  shopAccessoriesProgressFill.style.transform = 'translateX(' + (travel * progress) + 'px)';
  shopAccessoriesProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}
if (shopAccessoriesTrack) {
  shopAccessoriesTrack.addEventListener('scroll', updateShopAccessoriesProgress, { passive: true });
  window.addEventListener('resize', updateShopAccessoriesProgress);
  requestAnimationFrame(updateShopAccessoriesProgress);
}


// Keep the Based on Your Habits placeholder slider indicator in sync.
const habitsTrack = document.getElementById('app-based-on-habits-track');
const habitsProgress = document.querySelector('.app-based-on-habits-progress');
const habitsProgressFill = habitsProgress && habitsProgress.querySelector('.app-new-in-progress-fill');
function updateHabitsProgress() {
  if (!habitsTrack || !habitsProgress || !habitsProgressFill) return;
  const maxScroll = Math.max(0, habitsTrack.scrollWidth - habitsTrack.clientWidth);
  const visibleRatio = habitsTrack.scrollWidth > 0 ? habitsTrack.clientWidth / habitsTrack.scrollWidth : 1;
  const thumbRatio = Math.min(1, visibleRatio);
  const travel = Math.max(0, habitsProgress.clientWidth * (1 - thumbRatio));
  const progress = maxScroll > 0 ? habitsTrack.scrollLeft / maxScroll : 0;
  habitsProgressFill.style.width = (thumbRatio * 100) + '%';
  habitsProgressFill.style.transform = 'translateX(' + (travel * progress) + 'px)';
  habitsProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}
if (habitsTrack) {
  habitsTrack.addEventListener('scroll', updateHabitsProgress, { passive: true });
  window.addEventListener('resize', updateHabitsProgress);
  requestAnimationFrame(updateHabitsProgress);
}


// Keep the Shop for Kids placeholder slider indicator in sync.
const shopKidsTrack = document.getElementById("app-shop-kids-track");
const shopKidsProgress = document.querySelector(".app-shop-kids-progress");
const shopKidsProgressFill = shopKidsProgress && shopKidsProgress.querySelector(".app-new-in-progress-fill");
function updateShopKidsProgress() {
  if (!shopKidsTrack || !shopKidsProgress || !shopKidsProgressFill) return;
  const maxScroll = Math.max(0, shopKidsTrack.scrollWidth - shopKidsTrack.clientWidth);
  const visibleRatio = shopKidsTrack.scrollWidth > 0 ? shopKidsTrack.clientWidth / shopKidsTrack.scrollWidth : 1;
  const thumbRatio = Math.min(1, visibleRatio);
  const travel = Math.max(0, shopKidsProgress.clientWidth * (1 - thumbRatio));
  const progress = maxScroll > 0 ? shopKidsTrack.scrollLeft / maxScroll : 0;
  shopKidsProgressFill.style.width = (thumbRatio * 100) + "%";
  shopKidsProgressFill.style.transform = "translateX(" + (travel * progress) + "px)";
  shopKidsProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}
if (shopKidsTrack) {
  shopKidsTrack.addEventListener('scroll', updateShopKidsProgress, { passive: true });
  window.addEventListener('resize', updateShopKidsProgress);
  requestAnimationFrame(updateShopKidsProgress);
}

// Keep the skincare and makeup placeholder slider indicators in sync.
["skincare", "makeup"].forEach(section => {
  const track = document.getElementById("app-shop-" + section + "-track");
  const progress = document.querySelector(".app-shop-" + section + "-progress");
  const fill = progress && progress.querySelector(".app-new-in-progress-fill");
  function updateProgress() {
    if (!track || !progress || !fill) return;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const visibleRatio = track.scrollWidth > 0 ? track.clientWidth / track.scrollWidth : 1;
    const thumbRatio = Math.min(1, visibleRatio);
    const travel = Math.max(0, progress.clientWidth * (1 - thumbRatio));
    const position = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
    fill.style.width = (thumbRatio * 100) + "%";
    fill.style.transform = "translateX(" + (travel * position) + "px)";
    progress.setAttribute("aria-valuenow", String(Math.round(position * 100)));
  }
  if (track) {
    track.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    requestAnimationFrame(updateProgress);
  }
});

// The Brands directory uses the same active vendor records as the main
// website's /brands page. Each entry opens the real JANEDORE brand profile.
let appBrandDirectoryData = [];
let appBrandDirectoryLoaded = false;
let appBrandDirectoryLoading = null;

function appBrandEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
}

function appFormatBrandDisplayName(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase().replace(/(^|[\\s'-])([a-z])/g, (match, separator, letter) => separator + letter.toLocaleUpperCase());
}

function appBuildBrandDirectoryHTML(brands) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  const groups = {};
  (brands || []).slice().sort((a, b) => {
    const aName = a.name || a.brandName || a.brand || '';
    const bName = b.name || b.brandName || b.brand || '';
    return aName.localeCompare(bName);
  }).forEach(brand => {
    const name = String(brand.name || brand.brandName || brand.brand || '').trim();
    if (!name) return;
    const first = name.charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : '#';
    (groups[letter] = groups[letter] || []).push(brand);
  });

  const list = letters.filter(letter => groups[letter]).map(letter => {
    const items = groups[letter].map(brand => {
      const name = appFormatBrandDisplayName(brand.name || brand.brandName || brand.brand || '');
      const slug = String(brand.slug || brand.id || '');
      const logoUrl = /^https?:\/\//i.test(String(brand.logoUrl || '').trim()) ? String(brand.logoUrl).trim() : '';
      const logo = '<span class="app-brands-az-logo" aria-hidden="true">' +
        (logoUrl ? '<img src="' + appBrandEscape(logoUrl) + '" alt="" loading="lazy">' : '') +
        '</span>';
      return '<li><a href="/brands/' + encodeURIComponent(slug) + '">' + logo +
        '<span class="app-brands-az-name">' + appBrandEscape(name) + '</span>' +
        '<i class="ph ph-caret-right app-brands-az-chevron" aria-hidden="true"></i></a></li>';
    }).join('');
    return '<section class="app-brands-az-group" id="app-brands-letter-' + letter + '"><h2>' +
      letter + '</h2><ul>' + items + '</ul></section>';
  }).join('');

  const index = letters.map(letter => {
    if (!groups[letter]) return '<span class="app-brands-az-letter is-disabled" aria-disabled="true">' + letter + '</span>';
    return '<a class="app-brands-az-letter is-available" href="#app-brands-letter-' + letter +
      '" data-brand-letter="' + letter + '">' + letter + '</a>';
  }).join('');

  return (list ? '<div class="app-brands-az-list">' + list + '</div>' :
    '<p class="app-brands-loading">No brands are currently available.</p>') +
    '<nav class="app-brands-az-index" aria-label="Jump to brand letter">' + index + '</nav>';
}

function appPreloadBrandDirectory() {
  if (appBrandDirectoryLoaded) return Promise.resolve(appBrandDirectoryData);
  if (appBrandDirectoryLoading) return appBrandDirectoryLoading;

  // Fetch active vendors during app startup so A–Z is ready before it is opened.
  appBrandDirectoryLoading = appProductDb.collection('vendors')
    .where('status', '==', 'active').get()
    .then(snapshot => {
      appBrandDirectoryData = snapshot.docs.map(doc => Object.assign({id:doc.id}, doc.data()))
        .filter(brand => String(brand.name || brand.brandName || brand.brand || '').trim());
      appBrandDirectoryLoaded = true;
      const directory = document.getElementById('app-shop-brands-directory');
      if (directory && !directory.hidden) {
        directory.innerHTML = appBuildBrandDirectoryHTML(appBrandDirectoryData);
      }
      return appBrandDirectoryData;
    })
    .catch(error => {
      console.warn('[APP BRANDS] Could not preload A–Z directory:', error.message);
      const directory = document.getElementById('app-shop-brands-directory');
      if (directory && !directory.hidden) {
        directory.innerHTML = '<p class="app-brands-loading">Brands are temporarily unavailable. Please try again.</p>';
      }
      return null;
    })
    .finally(() => { appBrandDirectoryLoading = null; });
  return appBrandDirectoryLoading;
}

function appLoadBrandDirectory(directory) {
  if (!directory) return;
  if (appBrandDirectoryLoaded) {
    directory.innerHTML = appBuildBrandDirectoryHTML(appBrandDirectoryData);
    return Promise.resolve(appBrandDirectoryData);
  }
  // A–Z uses the startup request; it never starts a second fetch on navigation.
  return appPreloadBrandDirectory().then(brands => {
    if (appBrandDirectoryLoaded) {
      directory.innerHTML = appBuildBrandDirectoryHTML(appBrandDirectoryData);
    }
    return brands;
  });
}

// Load the live vendor directory when the customer opens Shop → Brands.
document.addEventListener('click', event => {
  const back = event.target.closest('#app-shop-brands-back');
  if (back) {
    const grid = document.querySelector('.app-shop-category-grid');
    const directory = document.getElementById('app-shop-brands-directory');
    if (grid) grid.hidden = false;
    if (directory) directory.hidden = true;
    document.body.classList.remove('app-shop-brands-open');
    appUpdateHeaderTitle('Shop');
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const tile = event.target.closest('.app-shop-brands-tile');
  if (tile) {
    const grid = document.querySelector('.app-shop-category-grid');
    const directory = document.getElementById('app-shop-brands-directory');
    if (!grid || !directory) return;
    grid.hidden = true;
    directory.hidden = false;
    document.body.classList.add('app-shop-brands-open');
    appLoadBrandDirectory(directory);
    appUpdateHeaderTitle('Shop');
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const letterLink = event.target.closest('.app-brands-az-index a[data-brand-letter]');
  if (letterLink) {
    event.preventDefault();
    const target = document.getElementById('app-brands-letter-' + letterLink.dataset.brandLetter);
    if (target) window.scrollTo({top:target.getBoundingClientRect().top + window.scrollY - 112,behavior:'smooth'});
  }
});

// Load the same active brand imagery used by the website's Shop by brand grid.
fetch('/api/app-brands', { headers: { Accept: 'application/json' } })
  .then(response => {
    if (!response.ok) throw new Error('Brands unavailable');
    return response.json();
  })
  .then(data => {
    const grid = document.getElementById('app-shop-brand-grid');
    if (!grid) return;
    const escapeBrand = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const brands = Array.isArray(data.brands) ? data.brands : [];
    const goToBrands = document.getElementById('app-discover-go-to-brands');
    const popularBrands = document.getElementById('app-discover-popular-brands');
    const azSubtitle = document.getElementById('app-discover-az-subtitle');
    if (azSubtitle) {
      const names = brands.slice(0, 3).map(brand => brand.name || brand.brandName || brand.brand).filter(Boolean);
      azSubtitle.textContent = names.length
        ? names.join(', ') + ' and many more...'
        : 'Discover more independent brands...';
    }
    const renderBrandRows = list => list.map(brand => {
      const name = brand.name || brand.brandName || brand.brand || 'Brand';
      const slug = String(brand.slug || brand.id || '');
      const logo = brand.logoUrl
        ? '<img src="' + escapeBrand(brand.logoUrl) + '" alt="" loading="lazy">'
        : '';
      return '<a class="app-shop-category-tile app-discover-brand-row" href="/brands/' + encodeURIComponent(slug) + '">' +
        '<span class="app-discover-brand-heart" aria-hidden="true"><i class="ph ph-heart-straight"></i></span>' +
        '<strong>' + escapeBrand(name) + '</strong>' +
        '<span class="app-brands-az-logo app-discover-brand-row-image">' + logo + '</span></a>';
    }).join('');
    if (goToBrands) goToBrands.innerHTML = brands.length
      ? renderBrandRows(brands.slice(0, 2))
      : '<p class="app-new-in-empty">Brands will appear here soon.</p>';
    if (popularBrands) popularBrands.innerHTML = brands.length > 2
      ? renderBrandRows(brands.slice(2))
      : (brands.length ? renderBrandRows(brands) : '<p class="app-new-in-empty">Brands will appear here soon.</p>');
    if (!brands.length) {
      grid.innerHTML = '<p class="app-new-in-empty">Brands will appear here soon.</p>';
      return;
    }
    grid.innerHTML = brands.map(brand => {
      const image = brand.heroImageUrl || brand.logoUrl || '';
      const style = image ? ' style="background-image:url(&quot;' + escapeBrand(image) + '&quot;)"' : '';
      const logo = brand.logoUrl ? '<img src="' + escapeBrand(brand.logoUrl) + '" alt="" loading="lazy">' : '';
      return '<div class="app-shop-brand-card"><div class="app-shop-brand-image"' + style + '>' + logo + '</div></div>';
    }).join('');
  })
  .catch(error => {
    const grid = document.getElementById('app-shop-brand-grid');
    if (grid) grid.innerHTML = '<p class="app-new-in-empty">Brands are temporarily unavailable.</p>';
    console.warn('[APP BRANDS] Could not load brands:', error.message);
  });




// APP PRODUCT PAGE: live product cards open a focused in-app detail view.
const appProductView = document.getElementById('app-product-view');
const appProductDb = firebase.firestore();
// Start fetching A–Z brand data as soon as the app initializes.
appPreloadBrandDirectory();
const appProductCache = new Map();
const appProductLoads = new Map();

let appHomeSelectedCategory = 'all';
const appShopProducts = [];
let appShopLoaded = false;
let appShopLoading = null;

function appShopDate(product) {
  const value = product && product.createdAt;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(value || product.created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}
function appShopRenderProducts() {
  const grid = document.getElementById('app-shop-product-grid');
  if (!grid) return;
  // The Shop bottom tab is its own all-products destination. Homepage
  // category selection must never filter or otherwise change this catalogue.
  const selectedCategory = 'all';
  const products = appShopProducts.filter(product => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'sale') {
      const price = Number(product.price) || 0;
      const salePrice = Number(product.salePrice);
      return Number.isFinite(salePrice) && salePrice > 0 && salePrice < price;
    }
    if (selectedCategory === 'brands') return !!String(product.brand || product.vendorName || '').trim();
    if (selectedCategory === 'designers') return !!String(product.designer || product.designerName || '').trim();
    const categoryText = String(product.category || product.department || product.productType || '').trim().toLowerCase();
    const aliases = {
      clothing:['clothing','apparel','fashion','clothes'],
      accessories:['accessories','accessory','bags','jewellery','jewelry'],
      beauty:['beauty','skincare','skin care','makeup','cosmetics'],
      fragrance:['fragrance','fragrances','scent','scents','perfume','perfumes'],
      kids:['kids','kid','children','childrens','children’s'],
      homeware:['homeware','home','home goods','home decor','decor']
    };
    return (aliases[selectedCategory] || [selectedCategory]).some(term => categoryText.includes(term));
  });
  const countLabel = document.getElementById('app-shop-product-count');
  if (countLabel) {
    const count = products.length;
    countLabel.textContent = count + (count === 1 ? ' item' : ' items');
  }
  if (!products.length) {
    grid.innerHTML = '<p class="app-new-in-empty">No products match these filters.</p>';
    return;
  }
  grid.innerHTML = products.map(product => {
    const regular = Number(product.price) || 0;
    const salePrice = Number(product.salePrice);
    const sale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < regular;
    const badge = Number(product.stock) <= 0 ? 'SOLD OUT' : (sale ? 'SALE' : '');
    const image = appProductImages(product)[0] || product.imageUrl || '';
    const price = sale
      ? '<span class="app-new-in-old-price">R' + regular.toFixed(2) + '</span><span class="app-new-in-sale-price">R' + salePrice.toFixed(2) + '</span>'
      : '<span>R' + regular.toFixed(2) + '</span>';
    return '<article class="app-new-in-card' + (Number(product.stock) <= 0 ? ' is-sold-out' : '') + '" data-product-id="' + appProductEscape(product.id) + '" role="button" tabindex="0" aria-label="View ' + appProductEscape(product.name || product.title || 'Product') + '">' +
      '<div class="app-new-in-image">' + (badge ? '<span class="app-new-in-badge' + (badge === 'SALE' ? ' is-sale' : '') + '">' + badge + '</span>' : '') + (image ? '<img src="' + appProductEscape(image) + '" alt="' + appProductEscape(product.name || product.title || 'Product') + '" loading="lazy">' : '') + '<button class="app-new-in-wishlist" type="button" aria-label="Add to wishlist" aria-pressed="false"><i class="ph ph-heart-straight" aria-hidden="true"></i></button></div>' +
      '<div class="app-new-in-brand">' + appProductEscape(appFormatBrandName(product.brand || product.vendorName || '')) + '</div>' +
      '<div class="app-new-in-name">' + appProductEscape(product.name || product.title || 'Product') + '</div>' +
      '<div class="app-new-in-price">' + price + '</div></article>';
  }).join('');
}
// Handle product selection directly inside the All Products collection grid.
// Keep wishlist taps independent from opening the product detail screen.
const appShopProductGrid = document.getElementById('app-shop-product-grid');
if (appShopProductGrid) {
  appShopProductGrid.addEventListener('click', event => {
    const card = event.target.closest('.app-new-in-card[data-product-id]');
    if (!card || !appShopProductGrid.contains(card) || event.target.closest('.app-new-in-wishlist')) return;
    event.preventDefault();
    event.stopPropagation();
    appOpenProduct(card.dataset.productId);
  });
  appShopProductGrid.addEventListener('keydown', event => {
    const card = event.target.closest('.app-new-in-card[data-product-id]');
    if (!card || !appShopProductGrid.contains(card) || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    appOpenProduct(card.dataset.productId);
  });
}
async function appShopLoadProducts() {
  if (appShopLoaded) { appShopRenderProducts(); return; }
  if (appShopLoading) return appShopLoading;
  const grid = document.getElementById('app-shop-product-grid');
  appShopLoading = appProductDb.collection('products').where('status', '==', 'active').get()
    .then(snapshot => {
      appShopProducts.splice(0, appShopProducts.length, ...snapshot.docs.map(doc => Object.assign({id:doc.id}, doc.data())));
      appShopProducts.forEach(product => appProductCache.set(String(product.id), product));
      const brands = [...new Set(appShopProducts.map(p => String(p.brand || p.vendorName || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      const categories = [...new Set(appShopProducts.map(p => String(p.category || p.department || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      const brandSelect = document.getElementById('app-shop-brand-filter');
      const categorySelect = document.getElementById('app-shop-category-filter');
      if (brandSelect) brandSelect.innerHTML = '<option value="all">All brands</option>' + brands.map(v=>'<option value="' + appProductEscape(v) + '">' + appProductEscape(v) + '</option>').join('');
      if (categorySelect) categorySelect.innerHTML = '<option value="all">All categories</option>' + categories.map(v=>'<option value="' + appProductEscape(v) + '">' + appProductEscape(v) + '</option>').join('');
      appShopLoaded = true;
      appShopRenderProducts();
    })
    .catch(error => {
      if (grid) grid.innerHTML = '<p class="app-new-in-empty">Products are temporarily unavailable.</p>';
      console.warn('[APP SHOP] Could not load products:', error.message);
    })
    .finally(() => { appShopLoading = null; });
  return appShopLoading;
}
function appOpenHomeCollection(category) {
  if (category) appHomeSelectedCategory = category;
  else appHomeSelectedCategory = 'all';
  if (appProductView && !appProductView.hidden) appProductView.hidden = true;
  appSaveCurrentTabMemory();
  const homeView = tabViews.find(view => view.dataset.view === 'Home');
  const collectionPage = document.getElementById('app-shop-page');
  if (!homeView || !collectionPage) return;
  // The collection is a separate screen, not content appended below Home.
  tabViews.forEach(view => { view.hidden = true; });
  collectionPage.hidden = false;
  const appHeader = document.querySelector('.app-header');
  if (appHeader) appHeader.hidden = true;
  appCollectionMemory.type = 'all-products';
  appHomeScreen = 'collection';
  const homeMemory = appTabMemories.get('Home') || appDefaultTabMemory();
  homeMemory.screen = 'collection';
  homeMemory.collectionScrollY = appCollectionMemory.scrollY || 0;
  appTabMemories.set('Home',homeMemory);
  appPersistScrollMemories();
  appShopLoadProducts();
  appRestoreScrollPosition(0);
}
const appShopBack = document.getElementById('app-shop-back');
if (appShopBack) appShopBack.addEventListener('click', () => {
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage) {
    appCollectionMemory.scrollY = window.scrollY;
    collectionPage.hidden = true;
    appHomeScreen = 'home';
    const homeMemory = appTabMemories.get('Home') || appDefaultTabMemory();
    homeMemory.screen = 'tab';
    homeMemory.collectionScrollY = appCollectionMemory.scrollY;
    homeMemory.productId = null;
    homeMemory.productScrollY = 0;
    homeMemory.productReturnToCollection = false;
    appTabMemories.set('Home',homeMemory);
    appPersistScrollMemories();
  }
  const homeButton = navItems.find(item => item.dataset.tab === 'Home');
  if (homeButton) {
    appSelectNavigationTab('Home', homeButton);
    appShowTabPage('Home');
  }
});
const appProductReviewsCache = new Map();
let appRenderedProductId = '';
let appCurrentProduct = null;
let appProductQuantity = 1;

let appSelectedVariant = 0;
let appGalleryImages = [];

function appProductEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function appFormatBrandName(value) {
  return String(value == null ? '' : value).trim().toLowerCase()
    .replace(/(^|[\\s&'-])([a-z])/g, (_, separator, letter) => separator + letter.toUpperCase());
}
function appProductFormatMultiline(value) {
  let source = String(value == null ? '' : value).trim();
  if (!source) return '';

  // Product descriptions may already contain HTML, or may contain HTML
  // that was entity-escaped before it reached the app prototype.
  let parsed = null;
  for (let pass = 0; pass < 3; pass++) {
    parsed = new DOMParser().parseFromString(source, 'text/html');
    const decoded = parsed.body.textContent || '';
    if (parsed.body.childElementCount || decoded === source || !/<\/?(?:p|br|strong|b|em|i|u|ul|ol|li|h[2-4]|blockquote)\b[^>]*>/i.test(decoded)) break;
    source = decoded;
  }

  const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);
  const blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE']);
  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.nodeValue || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE || blocked.has(node.tagName)) return null;
    const children = Array.from(node.childNodes).map(cleanNode).filter(Boolean);
    if (!allowed.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      children.forEach(child => fragment.appendChild(child));
      return fragment;
    }
    const clean = document.createElement(node.tagName.toLowerCase());
    children.forEach(child => clean.appendChild(child));
    return clean;
  };

  const container = document.createElement('div');
  Array.from(parsed.body.childNodes).map(cleanNode).filter(Boolean)
    .forEach(node => container.appendChild(node));

  // Plain-text descriptions remain plain text, with their line breaks kept.
  if (!container.querySelector('*')) {
    const paragraph = document.createElement('p');
    String(container.textContent || '').split(/\r?\n/).forEach((line, index) => {
      if (index) paragraph.appendChild(document.createElement('br'));
      paragraph.appendChild(document.createTextNode(line));
    });
    container.replaceChildren(paragraph);
  }
  return container.innerHTML;
}

let appReviewItems = [];
let appReviewSort = 'newest';
let appReviewProductId = '';

function appReviewTime(review) {
  return review && review.createdAt && typeof review.createdAt.toDate === 'function' ? review.createdAt.toDate().getTime() : 0;
}
function appReviewDate(timestamp) {
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (!days) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return days + ' days ago';
  if (days < 14) return '1 week ago';
  if (days < 30) return Math.floor(days / 7) + ' weeks ago';
  if (days < 60) return '1 month ago';
  if (days < 365) return Math.floor(days / 30) + ' months ago';
  if (days < 730) return '1 year ago';
  return Math.floor(days / 365) + ' years ago';
}
function appReviewStars(rating) {
  return Array.from({length:5},(_,i)=>'<i class="'+(i<Math.round(rating)?'ph-fill':'ph')+' ph-star" aria-hidden="true"></i>').join('');
}
function appReviewInteraction(id) {
  try { return JSON.parse(localStorage.getItem('janedore_review_interactions') || '{}')[id] || {}; } catch (_) { return {}; }
}
function appReviewVisitorId() {
  const key='janedore_review_visitor';
  try {
    let id=localStorage.getItem(key);
    if(!id){id=window.crypto&&crypto.randomUUID?crypto.randomUUID():'jd-'+Date.now()+'-'+Math.random().toString(16).slice(2);localStorage.setItem(key,id);}
    return id;
  } catch (_) { return ''; }
}
function appRenderProductReviews(productId) {
  const box=document.getElementById('app-product-reviews');
  if(!box || appReviewProductId!==productId || !appCurrentProduct || appCurrentProduct.id!==productId) return;
  const reviews=appReviewItems;
  if(!reviews.length){box.innerHTML='<div class="product-reviews-empty"><p>There are no reviews for this product yet.</p></div>';return;}
  const average=reviews.reduce((sum,r)=>sum+(Number(r.rating)||0),0)/reviews.length;
  const ratings=reviews.map(r=>Math.max(1,Math.min(5,Math.round(Number(r.rating)||0))));
  const breakdown=[5,4,3,2,1].map(star=>{
    const amount=ratings.filter(r=>r===star).length;
    const width=Math.round(amount/reviews.length*100);
    return '<div class="product-review-breakdown-row"><span>'+star+' <i class="ph-fill ph-star" aria-hidden="true"></i></span><span class="product-review-breakdown-track"><span style="width:'+width+'%"></span></span><span>'+amount+'</span></div>';
  }).join('');
  const sorted=[...reviews].sort((a,b)=>{
    if(appReviewSort==='highest') return (Number(b.rating)||0)-(Number(a.rating)||0)||appReviewTime(b)-appReviewTime(a);
    if(appReviewSort==='lowest') return (Number(a.rating)||0)-(Number(b.rating)||0)||appReviewTime(b)-appReviewTime(a);
    return appReviewTime(b)-appReviewTime(a);
  });
  box.innerHTML='<section class="product-reviews-summary" aria-label="Customer rating summary"><div class="product-reviews-average"><strong>'+average.toFixed(1)+'</strong><span class="product-review-stars" aria-label="'+average.toFixed(1)+' out of 5">'+appReviewStars(average)+'</span><p>'+reviews.length+' customer review'+(reviews.length===1?'':'s')+'</p></div><div class="product-review-breakdown">'+breakdown+'</div></section>'+
    (reviews.length>1?'<div class="product-reviews-toolbar"><label for="app-product-review-sort">Sort by</label><select id="app-product-review-sort" onchange="appSortProductReviews(this.value)"><option value="newest">Most recent</option><option value="highest">Highest rating</option><option value="lowest">Lowest rating</option></select></div>':'')+
    '<div class="product-review-list">'+sorted.map(review=>{
      const date=appReviewTime(review)?appReviewDate(appReviewTime(review)):'';
      const author=String(review.name||'Anonymous').trim().toLocaleLowerCase('en-ZA').replace(/\b[a-z]/g,letter=>letter.toLocaleUpperCase('en-ZA'));
      const rating=Math.max(0,Math.min(5,Number(review.rating)||0));
      const verified=review.verified===true?'<span class="product-review-verified"><i class="ph ph-check-circle" aria-hidden="true"></i> Verified purchase</span>':'';
      const featured=review.featured===true?'<span class="product-review-featured">Featured</span>':'';
      const photos=(Array.isArray(review.imageUrls)&&review.imageUrls.length?review.imageUrls:[review.imageUrl]).filter(u=>String(u||'').startsWith('https://res.cloudinary.com/'));
      const photoHtml=photos.length?'<div class="product-review-photos">'+photos.map(u=>'<img class="product-review-photo" src="'+appProductEscape(u)+'" alt="Photo from '+appProductEscape(author)+'" loading="lazy">').join('')+'</div>':'';
      const reply=review.vendorReply?'<div class="product-review-brand-reply"><span>Brand reply</span><p>'+appProductEscape(review.vendorReply)+'</p></div>':'';
      const interaction=appReviewInteraction(review.id||'');
      const vote=interaction.vote||'';
      const flagged=interaction.flagged===true;
      return '<article class="product-review-card"><div class="product-review-card-head"><div class="product-review-author-wrap"><div class="product-review-author-line"><p class="product-review-author">'+appProductEscape(author)+'</p>'+featured+'</div><div class="product-review-meta">'+(date?'<span class="product-review-date">'+date+'</span>':'')+verified+'</div></div></div>'+
        '<p class="product-review-stars" aria-label="'+rating+' out of 5">'+appReviewStars(rating)+'</p>'+
        (review.text?'<p class="product-review-text">'+appProductEscape(review.text)+'</p>':'')+
        (review.rewarded?'<p class="product-review-reward">Received a thank-you voucher for this review</p>':'')+photoHtml+reply+
        '<div class="product-review-actions"><span class="product-review-helpful-label">Was this helpful to you?</span><div class="product-review-votes">'+
        '<button type="button" class="product-review-action'+(vote==='helpful'?' is-selected':'')+'" '+(vote?'disabled':'')+' onclick="appSubmitReviewFeedback(\''+appProductEscape(review.id||'')+'\',true,this)" aria-label="Yes, helpful"><i class="ph ph-thumbs-up"></i><span>'+(Number(review.helpfulCount)||0)+'</span></button>'+
        '<button type="button" class="product-review-action'+(vote==='notHelpful'?' is-selected':'')+'" '+(vote?'disabled':'')+' onclick="appSubmitReviewFeedback(\''+appProductEscape(review.id||'')+'\',false,this)" aria-label="No, not helpful"><i class="ph ph-thumbs-down"></i><span>'+(Number(review.notHelpfulCount)||0)+'</span></button></div>'+
        '<button type="button" class="product-review-flag'+(flagged?' is-selected':'')+'" '+(flagged?'disabled':'')+' onclick="appFlagProductReview(\''+appProductEscape(review.id||'')+'\',this)"><i class="ph-fill ph-flag"></i><span>'+(flagged?'Review flagged':'Flag review')+'</span></button></div></article>';
    }).join('')+'</div>';
  const select=document.getElementById('app-product-review-sort');
  if(select) select.value=appReviewSort;
}
window.appSortProductReviews=function(value){if(!['newest','highest','lowest'].includes(value))return;appReviewSort=value;appRenderProductReviews(appReviewProductId);};
window.appSubmitReviewFeedback=async function(reviewId,helpful,button){
  const visitorId=appReviewVisitorId(); if(!visitorId)return alert('Please enable site storage to vote.');
  button.disabled=true;
  try{
    const response=await fetch('/api/reviews/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId,helpful,visitorId})});
    const result=await response.json(); if(!response.ok)throw new Error(result.error||'Could not save your vote.');
    const saved=JSON.parse(localStorage.getItem('janedore_review_interactions')||'{}');saved[reviewId]=Object.assign({},saved[reviewId],{vote:helpful?'helpful':'notHelpful'});localStorage.setItem('janedore_review_interactions',JSON.stringify(saved));
    const review=appReviewItems.find(r=>r.id===reviewId);if(review){const key=helpful?'helpfulCount':'notHelpfulCount';review[key]=(Number(review[key])||0)+1;}
    appRenderProductReviews(appReviewProductId);
  }catch(error){button.disabled=false;alert(error.message);}
};
window.appFlagProductReview=async function(reviewId,button){
  const visitorId=appReviewVisitorId();if(!visitorId)return alert('Please enable site storage to report a review.');
  button.disabled=true;
  try{
    const response=await fetch('/api/reviews/flag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId,visitorId})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not report this review.');
    const saved=JSON.parse(localStorage.getItem('janedore_review_interactions')||'{}');saved[reviewId]=Object.assign({},saved[reviewId],{flagged:true});localStorage.setItem('janedore_review_interactions',JSON.stringify(saved));
    appRenderProductReviews(appReviewProductId);
  }catch(error){button.disabled=false;alert(error.message);}
};
async function appLoadProductReviews(productId){
  const box=document.getElementById('app-product-reviews');if(!box)return;
  appReviewProductId=productId;appReviewSort='newest';

  // Show previously fetched reviews immediately; refresh them quietly in the background.
  const cachedReviews=appProductReviewsCache.get(productId);
  if(cachedReviews){
    appReviewItems=cachedReviews;
    appRenderProductReviews(productId);
  }else{
    appReviewItems=[];
    box.innerHTML='';
  }

  try{
    const snap=await appProductDb.collection('reviews').where('productId','==',productId).limit(100).get();
    if(!appCurrentProduct||appCurrentProduct.id!==productId||appReviewProductId!==productId)return;
    const freshReviews=snap.docs.map(doc=>Object.assign({id:doc.id},doc.data())).sort((a,b)=>appReviewTime(b)-appReviewTime(a));
    appProductReviewsCache.set(productId,freshReviews);
    appReviewItems=freshReviews;
    appRenderProductReviews(productId);
  }catch(error){
    if(!cachedReviews&&appCurrentProduct&&appCurrentProduct.id===productId)box.textContent='Customer reviews are unavailable right now.';
  }
}

function appProductMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? 'R' + amount.toFixed(2) : '';
}
function appProductGallery(product) {
  const images = [], owners = [];
  (Array.isArray(product.variants) ? product.variants : []).forEach((variant, variantIndex) => {
    const group = variant && variant.images || {};
    ['model','ghost','detail'].forEach(type => (Array.isArray(group[type]) ? group[type] : []).forEach(url => {
      if (typeof url === 'string' && /^https:\/\//i.test(url) && !images.includes(url)) { images.push(url); owners.push(variantIndex); }
    }));
  });
  if (!images.length) {
    const legacy = [];
    if (Array.isArray(product.images)) legacy.push(...product.images);
    if (Array.isArray(product.gallery)) legacy.push(...product.gallery);
    if (product.imageUrl) legacy.unshift(product.imageUrl);
    if (product.image) legacy.push(product.image);
    legacy.filter(url => typeof url === 'string' && /^https:\/\//i.test(url)).forEach(url => {
      if (!images.includes(url)) { images.push(url); owners.push(0); }
    });
  }
  return {images, owners};
}
function appProductImages(product) { return appProductGallery(product).images; }
function appProductSizeStock(product, variantIndex, size) {
  const map = product && product.stockByVariant && product.stockByVariant[variantIndex];
  if (!map || typeof map !== 'object') return Number(product && product.stock) || 0;
  return Number(map[size || 'OS']) || 0;
}
function appProductHasSizes(product) {
  return (Array.isArray(product && product.sizes) ? product.sizes : []).some(size => size !== 'OS');
}
let appSelectedSize = null;
let appGalleryOwners = [];
function appRenderProductOptions(product, variantIndex) {
  const root = document.getElementById('app-product-options');
  if (!root) return;
  const sizes = (Array.isArray(product.sizes) ? product.sizes : []).filter(size => size !== 'OS');
  if (sizes.length && (!appSelectedSize || !sizes.includes(appSelectedSize) || appProductSizeStock(product, variantIndex, appSelectedSize) <= 0)) {
    appSelectedSize = sizes.find(size => appProductSizeStock(product, variantIndex, size) > 0) || null;
  }
  const sizeHtml = sizes.length ? '<div class="app-product-sizes"><div class="app-product-option-label">Select a size</div><div class="app-product-size-list">' +
    sizes.map(size => {
      const available = appProductSizeStock(product, variantIndex, size) > 0;
      return '<button type="button" class="app-product-size-button' + (appSelectedSize === size ? ' selected' : '') + (!available ? ' out-of-stock' : '') + '" data-app-size="' + appProductEscape(size) + '"' + (!available ? ' disabled aria-disabled="true"' : '') + ' aria-label="' + appProductEscape(size + (!available ? ', sold out' : '')) + '">' + appProductEscape(size) + '</button>';
    }).join('') + '</div></div>' : '';
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const colourHtml = variants.length ? '<div class="app-product-colours"><div class="app-product-option-label">Select a colour</div><div class="app-product-colour-list">' +
    variants.map((variant, index) => {
      const imgs = variant.images || {};
      const thumb = variant.swatchImage || [imgs.ghost,imgs.model,imgs.detail].map(list => Array.isArray(list) ? list[0] : '').find(Boolean) || '';
      const style = thumb && /^https:\/\//i.test(thumb) ? 'background-image:url(&quot;' + appProductEscape(thumb) + '&quot;)' : 'background-color:' + appProductEscape(variant.swatch || '#eee');
      const label = variant.color || variant.colour || ('Colour ' + (index + 1));
      return '<button type="button" class="app-product-colour-swatch' + (index === variantIndex ? ' selected' : '') + '" data-app-variant="' + index + '" style="' + style + '" aria-label="' + appProductEscape(label) + '" title="' + appProductEscape(label) + '"></button>';
    }).join('') + '</div></div>' : '';
  root.innerHTML = sizeHtml + colourHtml;
  root.querySelectorAll('[data-app-size]').forEach(button => button.addEventListener('click', () => {
    appSelectedSize = button.dataset.appSize;
    appRenderProductOptions(product, appSelectedVariant);
    appUpdateQuantityControls();
    appUpdateProductStickyState();
  }));
  root.querySelectorAll('[data-app-variant]').forEach(button => button.addEventListener('click', () => appSelectProductVariant(Number(button.dataset.appVariant))));
}
function appSelectProductVariant(index) {
  if (!appCurrentProduct || !Number.isInteger(index) || index < 0 || index >= (appCurrentProduct.variants || []).length) return;
  appSelectedVariant = index;
  appSelectedSize = null;
  appRenderProductOptions(appCurrentProduct, index);
  appUpdateQuantityControls();
  appUpdateProductStickyState();
  const first = appGalleryOwners.findIndex(owner => owner === index);
  const track = document.getElementById('app-product-gallery-track');
  if (first >= 0 && track) track.scrollTo({left:first * track.clientWidth,behavior:'smooth'});
}
function appRenderProductStickyBar(product, regular, sale) {
  const bar = document.getElementById('app-product-sticky-bar');
  if (!bar) return;
  const unavailable = Number.isFinite(Number(product.stock)) && Number(product.stock) <= 0;
  bar.innerHTML = '<button class="app-product-sticky-buy" id="app-product-sticky-buy" type="button"' +
    (unavailable ? ' disabled' : '') +
    '>Buy now</button><button class="app-product-sticky-add" id="app-product-sticky-add" type="button"' +
    (unavailable ? ' disabled' : '') +
    '><span class="app-product-sticky-label">' + (unavailable ? 'Sold out' : 'Add to bag') +
    '</span></button>';
  bar.hidden = false;
  document.getElementById('app-product-sticky-add').onclick = appAddCurrentProductToBag;
  document.getElementById('app-product-sticky-buy').onclick = appBuyNowCurrentProduct;
  appUpdateProductStickyState();
}
function appUpdateProductStickyState() {
  const bar = document.getElementById('app-product-sticky-bar');
  if (!bar || !appProductView || appProductView.hidden || !appCurrentProduct) return;
  const label = bar.querySelector('.app-product-sticky-label');
  const button = bar.querySelector('.app-product-sticky-add');
  const buyButton = bar.querySelector('.app-product-sticky-buy');
  const p = appCurrentProduct, hasSizes = appProductHasSizes(p);
  const selectedStock = appProductSizeStock(p, appSelectedVariant, appSelectedSize || 'OS');
  const noAvailableSize = hasSizes && !(p.sizes || []).filter(s => s !== 'OS').some(s => appProductSizeStock(p, appSelectedVariant, s) > 0);
  const soldOut = Number(p.stock) <= 0 || noAvailableSize || (!hasSizes && selectedStock <= 0);
  const needsSize = hasSizes && !appSelectedSize && !soldOut;
  const unavailable = soldOut || needsSize || (hasSizes && selectedStock <= 0);
  if (button) button.disabled = unavailable;
  if (buyButton) buyButton.disabled = unavailable;
  if (label) label.textContent = soldOut || (hasSizes && selectedStock <= 0) ? 'Sold out' : (needsSize ? 'Select a size' : 'Add to bag');
  appUpdateProductImageWishlist();
}
function appProductCartItems() {
  try { return JSON.parse(localStorage.getItem('janedore_cart') || '[]'); } catch (_) { return []; }
}
const APP_ADDED_TOAST_MS = 3000;
let appAddedToastTimer = null;
function appShowAddedToast(message, icon, destination) {
  let toast = document.getElementById('app-added-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-added-toast';
    toast.className = 'app-added-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<div class="app-added-toast-progress"></div>' +
      '<i class="ph ph-check-circle app-added-toast-icon" aria-hidden="true"></i>' +
      '<span class="app-added-toast-text"></span>' +
      '<button type="button" class="app-added-toast-close" aria-label="Dismiss"><i class="ph ph-x" aria-hidden="true"></i></button>';
    toast.addEventListener('click', event => {
      if (event.target.closest('.app-added-toast-close')) return;
      const target = toast.dataset.destination;
      appHideAddedToast();
      if (target === 'cart') appCartOpen();
      else if (target === 'wishlist') appOpenWishlistDestination();
    });
    toast.querySelector('.app-added-toast-close').addEventListener('click', event => { event.stopPropagation(); appHideAddedToast(); });
    document.body.appendChild(toast);
  }
  toast.querySelector('.app-added-toast-text').textContent = message || 'Added to bag';
  toast.dataset.destination = destination || (/wishlist/i.test(message || '') ? 'wishlist' : 'cart');
  const iconEl = toast.querySelector('.app-added-toast-icon');
  if (iconEl) iconEl.className = 'ph ' + (icon || 'ph-check-circle') + ' app-added-toast-icon';
  const progress = toast.querySelector('.app-added-toast-progress');
  progress.style.transition = 'none';
  progress.style.transform = 'scaleX(1)';
  void progress.offsetWidth;
  progress.style.transition = 'transform ' + APP_ADDED_TOAST_MS + 'ms linear';
  progress.style.transform = 'scaleX(0)';
  toast.classList.add('show');
  window.clearTimeout(appAddedToastTimer);
  appAddedToastTimer = window.setTimeout(appHideAddedToast, APP_ADDED_TOAST_MS);
}
function appOpenWishlistDestination() {
  appSaveCurrentTabMemory();
  const wishlistMemory = appTabMemories.get('Wishlist') || appDefaultTabMemory();
  wishlistMemory.screen = 'tab';
  wishlistMemory.scrollY = 0;
  wishlistMemory.productId = null;
  wishlistMemory.productScrollY = 0;
  wishlistMemory.productReturnToCollection = false;
  appTabMemories.set('Wishlist', wishlistMemory);
  appPersistScrollMemories();
  const wishlistButton = navItems.find(item => item.dataset.tab === 'Wishlist');
  if (wishlistButton) appSelectNavigationTab('Wishlist', wishlistButton);
  appShowTabPage('Wishlist');
  window.scrollTo({top:0,behavior:'instant'});
}
function appHideAddedToast() {
  window.clearTimeout(appAddedToastTimer);
  const toast = document.getElementById('app-added-toast');
  if (toast) toast.classList.remove('show');
}
function appUpdateCartIndicator() {
  const count = appProductCartItems().reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const badge = document.querySelector('.app-header-cart-count');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.hidden = count < 1;
  }
  const cartButton = document.getElementById('app-header-cart');
  if (cartButton) cartButton.setAttribute('aria-label', count ? 'Shopping bag, ' + count + (count === 1 ? ' item' : ' items') : 'Shopping bag');
}
let appProductReturnToCart = false;
let appProductReturnToCollection = false;
function appShowProductView() {
  const cartView = document.getElementById('app-cart-view');
  appProductReturnToCart = !!(cartView && !cartView.hidden);
  if (cartView) cartView.hidden = true;
  document.body.classList.remove('app-cart-open');
  const stickyBar = document.getElementById('app-product-sticky-bar');
  if (stickyBar) stickyBar.hidden = true;
  // Keep the product detail as the only page surface while it is open.
  // The source collection remains remembered and is revealed by Back.
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage) collectionPage.hidden = true;
  appProductView.hidden = false;
  document.body.classList.add('app-product-open');
  appUpdateProductHeaderOnScroll();
  document.querySelectorAll('.app-tab-content').forEach(view => { view.hidden = true; });
  const header = document.querySelector('.app-header');
  const bottomNav = document.querySelector('.bottom-nav');
  if (header) header.hidden = true;
  if (bottomNav) bottomNav.hidden = false;
}
function appProductClose() {
  if (!appProductView || appProductView.hidden) return;
  if (appProductReturnToCart) {
    appProductReturnToCart = false;
    appProductView.hidden = true;
    const stickyBar = document.getElementById('app-product-sticky-bar');
    if (stickyBar) stickyBar.hidden = true;
    document.body.classList.remove('app-product-open');
    const cartView = document.getElementById('app-cart-view');
    if (cartView) cartView.hidden = false;
    const header = document.querySelector('.app-header');
    const bottomNav = document.querySelector('.bottom-nav');
    if (header) header.hidden = true;
    if (bottomNav) bottomNav.hidden = false;
    document.body.classList.add('app-cart-open');
    if (location.hash.startsWith('#product/')) history.replaceState({appCart:true}, '', location.pathname + location.search + '#bag');
    appRenderCart();
    window.scrollTo({top:0,behavior:'instant'});
    return;
  }
  if (appProductReturnToCollection) {
    appProductReturnToCollection = false;
    const tabMemory = appTabMemories.get(appActiveTab) || {scrollY:0,productId:null,productScrollY:0};
    tabMemory.screen = 'collection';
    tabMemory.productId = null;
    tabMemory.productReturnToCollection = false;
    tabMemory.productScrollY = 0;
    tabMemory.collectionScrollY = appCollectionMemory.scrollY || 0;
    appTabMemories.set(appActiveTab, tabMemory);
    appPersistScrollMemories();
    appProductView.hidden = true;
    const stickyBar = document.getElementById('app-product-sticky-bar');
    if (stickyBar) stickyBar.hidden = true;
    document.body.classList.remove('app-product-open');
    tabViews.forEach(view => { view.hidden = true; });
    const collectionPage = document.getElementById('app-shop-page');
    if (collectionPage) collectionPage.hidden = false;
    const header = document.querySelector('.app-header');
    const bottomNav = document.querySelector('.bottom-nav');
    if (header) header.hidden = true;
    if (bottomNav) bottomNav.hidden = false;
    if (location.hash.startsWith('#product/')) history.replaceState(null, '', location.pathname + location.search);
    appRestoreScrollPosition(appCollectionMemory.scrollY || 0);
    return;
  }
  const memory = appTabMemories.get(appActiveTab) || {scrollY:0,productId:null,productScrollY:0};
  memory.screen = 'tab';
  memory.productId = null;
  memory.productReturnToCollection = false;
  memory.productScrollY = 0;
  appTabMemories.set(appActiveTab,memory);
  appPersistScrollMemories();
  appProductView.hidden = true;
  const stickyBar = document.getElementById('app-product-sticky-bar');
  if (stickyBar) stickyBar.hidden = true;
  document.body.classList.remove('app-product-open');
  tabViews.forEach(view => { view.hidden = view.dataset.view !== appActiveTab; });
  const header = document.querySelector('.app-header');
  const bottomNav = document.querySelector('.bottom-nav');
  if (header) header.hidden = appActiveTab === 'Shop';
  if (bottomNav) bottomNav.hidden = false;
  if (location.hash.startsWith('#product/')) history.replaceState(null, '', location.pathname + location.search);
  appRestoreScrollPosition(memory.scrollY);
}
function appProductShowLoading() {
  appShowProductView();
  document.getElementById('app-product-gallery-track').innerHTML = '<div class="app-product-gallery-loading"></div>';
  document.getElementById('app-product-brand').textContent = '';
  document.getElementById('app-product-name').textContent = 'Loading product…';
  document.getElementById('app-product-price').textContent = '';
  document.getElementById('app-product-description').textContent = '';
}
async function appOpenProduct(productId, pushHistory = true) {
  const id = String(productId || '').trim();
  if (!id) return;
  let product = appProductCache.get(id) || null;
  if (product) appRecordRecentlyViewed(product);
  const openedFromCart = !!(document.getElementById('app-cart-view') && !document.getElementById('app-cart-view').hidden);
  const collectionPage = document.getElementById('app-shop-page');
  appProductReturnToCollection = !openedFromCart && !!(collectionPage && !collectionPage.hidden);
  if (!openedFromCart && appActiveTab) {
    const memory = appTabMemories.get(appActiveTab) || appDefaultTabMemory();
    memory.screen = 'product';
    memory.productId = id;
    memory.productScrollY = 0;
    memory.productReturnToCollection = appProductReturnToCollection;
    appTabMemories.set(appActiveTab,memory);
    appPersistScrollMemories();
  }
  // Do not persist this product as the active content of a bottom tab.
  // The product view is temporary; Back returns to its source page.
  appShowProductView();
  if (pushHistory) history.pushState({appProductId:id}, '', '#product/' + encodeURIComponent(id));
  window.scrollTo({top:0,behavior:'instant'});
  // Paint the product card's already-loaded image and details immediately.
  // The full Firestore document is hydrated in the background below.
  if (product && appRenderedProductId !== id) {
    appCurrentProduct = product;
    appProductQuantity = 1;
    appSelectedVariant = 0;
    appSelectedSize = null;
    const previewGallery = appProductGallery(product);
    appGalleryImages = previewGallery.images;
    appGalleryOwners = previewGallery.owners;
    const previewTrack = document.getElementById('app-product-gallery-track');
    previewTrack.innerHTML = appGalleryImages.length
      ? appGalleryImages.map((url,index) => '<div class="app-product-gallery-slide"><img src="' + appProductEscape(url) + '" alt="' + appProductEscape(product.name || product.title || 'Product image') + '" loading="' + (index ? 'lazy' : 'eager') + '"></div>').join('')
      : '<div class="app-product-gallery-slide app-product-gallery-empty"></div>';
    const previewDots = document.getElementById('app-product-gallery-dots');
    previewDots.innerHTML = appGalleryImages.length > 1 ? appGalleryImages.map((_,i) => '<span class="app-product-gallery-dot' + (!i?' active':'') + '"></span>').join('') : '';
    document.getElementById('app-product-brand').textContent = appFormatBrandDisplayName(product.brand || product.vendorName || '');
    document.getElementById('app-product-name').textContent = product.name || product.title || '';
    const previewPrice = Number(product.price) || 0;
    const previewSale = Number(product.salePrice);
    document.getElementById('app-product-price').innerHTML = Number.isFinite(previewSale) && previewSale > 0 && previewSale < previewPrice
      ? '<span class="app-product-sale-price">' + appProductMoney(previewSale) + '</span><s>' + appProductMoney(previewPrice) + '</s>'
      : appProductMoney(previewPrice);
    document.getElementById('app-product-description').innerHTML = appProductFormatMultiline(product.description || 'No description available.');
    document.getElementById('app-product-shipping').textContent = product.shippingReturns || 'Please see the delivery and returns information at checkout.';
    appRenderProductOptions(product, 0);
    document.getElementById('app-product-qty').textContent = '1';
    document.getElementById('app-product-qty-minus').disabled = true;
    appRenderProductStickyBar(product, previewPrice, previewSale);
    appUpdateProductStickyState();
  }
  // Reopening the same product restores its rendered page immediately.
  // appShowProductView hides the sticky bar while switching views, so restore
  // it before returning to the already-rendered product.
  if (product && appRenderedProductId === id) {
    const stickyBar = document.getElementById('app-product-sticky-bar');
    if (stickyBar) stickyBar.hidden = false;
    appUpdateProductStickyState();
    return;
  }
  // List APIs can return abbreviated records. Always hydrate the product
  // detail from Firestore so Admin-managed sizes, stockByVariant and image
  // groups are present before rendering the app product page.
  // Do not replace the opening screen with a "Loading product" message.
  // A cached product is already visible; uncached products retain the page
  // shell until the detail document arrives.
  try {
    let load = appProductLoads.get(id);
    if (!load) {
      load = appProductDb.collection('products').doc(id).get();
      appProductLoads.set(id, load);
    }
    const snap = await load;
    if (snap.exists) {
      product = {...(product || {}), ...snap.data(), id:snap.id};
      appProductCache.set(id, product);
      appCartHydratedProductIds.add(id);
      appRecordRecentlyViewed(product);
    }
  } catch (error) {
    console.warn('[APP PRODUCT] Firestore detail lookup failed; using cached data:', error.message);
  } finally {
    appProductLoads.delete(id);
  }
  if (!product) {
    document.getElementById('app-product-name').textContent = 'This product is currently unavailable.';
    document.getElementById('app-product-description').textContent = 'Please go back and try another product.';
    return;
  }
  appCurrentProduct = product;
  appRenderedProductId = id;
  appProductQuantity = 1;
  appSelectedVariant = 0;
  appSelectedSize = null;
  const productGallery = appProductGallery(product);
  appGalleryImages = productGallery.images;
  appGalleryOwners = productGallery.owners;
  const gallery = document.getElementById('app-product-gallery-track');
  gallery.innerHTML = appGalleryImages.length
    ? appGalleryImages.map((url,index) => '<div class="app-product-gallery-slide"><img src="' + appProductEscape(url) + '" alt="' + appProductEscape(product.name || 'Product image') + '" loading="' + (index ? 'lazy' : 'eager') + '"></div>').join('')
    : '<div class="app-product-gallery-slide app-product-gallery-empty"></div>';
  const dots = document.getElementById('app-product-gallery-dots');
  dots.innerHTML = appGalleryImages.length > 1 ? appGalleryImages.map((_,i) => '<span class="app-product-gallery-dot' + (!i?' active':'') + '"></span>').join('') : '';
  gallery.onscroll = () => {
    const index = Math.round(gallery.scrollLeft / Math.max(1,gallery.clientWidth));
    [...dots.children].forEach((dot,i)=>dot.classList.toggle('active',i===index));
    const owner = appGalleryOwners[index];
    if (owner !== undefined && owner !== appSelectedVariant) {
      appSelectedVariant = owner;
      appSelectedSize = null;
      appRenderProductOptions(appCurrentProduct, appSelectedVariant);
      appUpdateQuantityControls();
      appUpdateProductStickyState();
    }
  };
  document.getElementById('app-product-brand').textContent = appFormatBrandDisplayName(product.brand || product.vendorName || '');
  document.getElementById('app-product-name').textContent = product.name || product.title || '';
  const regular = Number(product.price) || 0;
  const sale = Number(product.salePrice);
  document.getElementById('app-product-price').innerHTML = Number.isFinite(sale) && sale > 0 && sale < regular
    ? '<span class="app-product-sale-price">' + appProductMoney(sale) + '</span><s>' + appProductMoney(regular) + '</s>'
    : appProductMoney(regular);
  appRenderProductOptions(product, appSelectedVariant);
  document.getElementById('app-product-qty').textContent = '1';
  document.getElementById('app-product-qty-minus').disabled = true;
  appUpdateQuantityControls();
  document.getElementById('app-product-description').innerHTML = appProductFormatMultiline(product.description || 'No description available.') +
    (product.compositionCare ? '<p><strong>Composition &amp; care</strong><br>' + appProductFormatMultiline(product.compositionCare) + '</p>' : '') +
    (product.measurements ? '<p><strong>Measurements</strong><br>' + appProductFormatMultiline(product.measurements) + '</p>' : '');
  document.getElementById('app-product-shipping').textContent = product.shippingReturns || 'Please see the delivery and returns information at checkout.';
  appRenderProductStickyBar(product, regular, sale);

  // Load the complete active catalogue before choosing suggestions. The
  // initial Home feed only caches a small New In subset.
  await appShopLoadProducts();
  const activeProducts = appShopProducts.filter(item =>
    item && String(item.id) !== id && item.status === 'active'
  );
  const inStockProducts = activeProducts.filter(item => {
    const stockMap = item.stockByVariant;
    if (stockMap && typeof stockMap === 'object') {
      const quantities = Object.values(stockMap).flatMap(value =>
        value && typeof value === 'object' ? Object.values(value) : [value]
      );
      if (quantities.length) return quantities.some(quantity => Number(quantity) > 0);
    }
    return Number(item.stock) > 0;
  });
  const suggestionPool = inStockProducts.length ? inStockProducts : activeProducts;
  const currentBrand = String(product.brand || product.vendorName || '').trim();
  const sameBrand = suggestionPool.filter(item => String(item.brand || item.vendorName || '').trim() === currentBrand && currentBrand);
  const featured = suggestionPool.filter(item => item.featured && String(item.brand || item.vendorName || '').trim() !== currentBrand);
  const remaining = suggestionPool.filter(item => !item.featured && String(item.brand || item.vendorName || '').trim() !== currentBrand);
  const suggested = [...sameBrand, ...featured, ...remaining].slice(0,4);
  const suggestedSection = document.getElementById('app-product-related');
  const suggestedTrack = document.getElementById('app-product-related-track');
  if (suggested.length) {
    suggestedTrack.innerHTML = suggested.map(item => {
      const regularPrice = Number(item.price) || 0;
      const salePrice = item.salePrice == null || item.salePrice === '' ? NaN : Number(item.salePrice);
      const sale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < regularPrice;
      const stock = Number(item.stock);
      const badge = stock <= 0
        ? 'SOLD OUT'
        : (String(item.badge || '').trim().toLowerCase() === 'pre-order'
          ? 'PRE-ORDER'
          : sale
            ? 'SALE'
            : (item.badge && !['new','sale','sold out','sold','free delivery'].includes(String(item.badge).toLowerCase())
              ? String(item.badge).toUpperCase()
              : 'NEW'));
      const price = sale
        ? '<span class="app-new-in-old-price">R' + appProductEscape(regularPrice.toFixed(2)) + '</span><span class="app-new-in-sale-price">R' + appProductEscape(salePrice.toFixed(2)) + '</span>'
        : '<span>R' + appProductEscape(regularPrice.toFixed(2)) + '</span>';
      const image = appProductImages(item)[0] || item.imageUrl || '';
      return '<article class="app-new-in-card' + (stock <= 0 ? ' is-sold-out' : '') + '" data-product-id="' + appProductEscape(item.id) + '" role="button" tabindex="0" aria-label="View ' + appProductEscape(item.name || item.title || 'Product') + '">' +
        '<div class="app-new-in-image">' + (badge ? '<span class="app-new-in-badge' + (badge === 'SALE' ? ' is-sale' : '') + '">' + appProductEscape(badge) + '</span>' : '') + (image ? '<img src="' + appProductEscape(image) + '" alt="' + appProductEscape(item.name || item.title || 'Product') + '" loading="lazy">' : '') + '<button class="app-new-in-wishlist" type="button" aria-label="Add to wishlist" aria-pressed="false"><i class="ph ph-heart-straight" aria-hidden="true"></i></button></div>' +
        '<div class="app-new-in-brand">' + appProductEscape(appFormatBrandName(item.brand || item.vendorName || '')) + '</div>' +
        '<div class="app-new-in-name">' + appProductEscape(item.name || item.title || 'Product') + '</div>' +
        '<div class="app-new-in-price">' + price + '</div>' +
      '</article>';
    }).join('');
    suggestedSection.hidden = false;
    appBindSliderProgress(suggestedTrack, document.getElementById('app-product-related-progress'));
  } else {
    suggestedSection.hidden = true;
    suggestedTrack.innerHTML = '';
  }
  const homewareStyle = document.getElementById('app-product-homeware-style');
  if (homewareStyle) {
    // Admin saves the selected taxonomy category as product.category.
    // Resolve its parent department through the same shared taxonomy used by Admin.
    const categorySlug = String(product.category || '').trim();
    const isHomewareProduct = !!(
      window.JDTaxonomy &&
      window.JDTaxonomy.departmentOf(categorySlug) === 'homeware'
    );
    homewareStyle.hidden = !isHomewareProduct;
    homewareStyle.innerHTML = isHomewareProduct ?
      '<div class="app-new-in-heading"><h2 id="app-product-homeware-style-title">Style the space</h2><p>A few pieces to bring your space together.</p></div>' +
      '<div class="app-category-style-editorial" role="img" aria-label="Homeware editorial image placeholder"></div>' +
      '<div class="app-category-style-grid" aria-label="Four homeware product placeholders">' +
        '<div class="app-category-style-card" aria-hidden="true"><div class="app-category-style-card-image"></div></div>'.repeat(4) +
      '</div>' : '';
  }
  const accessoriesStyle = document.getElementById('app-product-accessories-style');
  if (accessoriesStyle) {
    // Use the Admin taxonomy category slug to decide whether this product
    // belongs to the Accessories department.
    const categorySlug = String(product.category || '').trim();
    const isAccessoriesProduct = !!(
      window.JDTaxonomy &&
      window.JDTaxonomy.departmentOf(categorySlug) === 'accessories'
    );
    accessoriesStyle.hidden = !isAccessoriesProduct;
    accessoriesStyle.innerHTML = isAccessoriesProduct ?
      '<div class="app-new-in-heading"><h2 id="app-product-accessories-style-title">Ways to style</h2><p>A few pieces to finish the look.</p></div>' +
      '<div class="app-category-style-editorial" role="img" aria-label="Accessories editorial image placeholder"></div>' +
      '<div class="app-category-style-grid" aria-label="Four accessories product placeholders">' +
        '<div class="app-category-style-card" aria-hidden="true"><div class="app-category-style-card-image"></div></div>'.repeat(4) +
      '</div>' : '';
  }
  const frequentlyBoughtTrack = document.getElementById('app-product-frequently-bought-track');
  const frequentlyBoughtProgress = document.getElementById('app-product-frequently-bought-progress');
  if (frequentlyBoughtTrack) {
    // Keep the section visible before purchase-history data exists, using the same
    // neutral product-card placeholders as the app's other product sliders.
    frequentlyBoughtTrack.innerHTML =
      '<article class="app-new-in-card app-new-in-loading" aria-hidden="true"><div class="app-new-in-image"></div><div class="app-new-in-skeleton app-new-in-brand"></div><div class="app-new-in-skeleton app-new-in-name"></div><div class="app-new-in-skeleton app-new-in-price"></div></article>'.repeat(4);
    appBindSliderProgress(frequentlyBoughtTrack, frequentlyBoughtProgress);
  }
  appUpdateCartIndicator();
  appUpdateProductStickyState();
  await appLoadProductReviews(id);
}
document.addEventListener('click', event => {
  const card = event.target.closest('.app-new-in-card[data-product-id], .app-product-related-card[data-product-id]');
  if (card && !event.target.closest('.app-new-in-wishlist')) {
    event.preventDefault();
    appOpenProduct(card.dataset.productId);
    return;
  }
});
document.addEventListener('keydown', event => {
  const card = event.target.closest && event.target.closest('.app-new-in-card[data-product-id], .app-product-related-card[data-product-id]');
  if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); appOpenProduct(card.dataset.productId); }
});
document.getElementById('app-product-back').addEventListener('click', () => {
  if (history.state && history.state.appProductId) history.back();
  else appProductClose();
});
// Product-page cart action is wired to the native app bag below.
document.getElementById('app-product-share').addEventListener('click', async () => {
  if (!appCurrentProduct) return;
  const url = location.href;
  const data = {title:appCurrentProduct.name || appCurrentProduct.title || 'Product',text:appCurrentProduct.name || '',url};
  if (navigator.share) { try { await navigator.share(data); } catch (error) { if (error.name !== 'AbortError') console.warn(error); } }
  else { try { await navigator.clipboard.writeText(url); alert('Product link copied.'); } catch (_) { window.prompt('Copy this product link:',url); } }
});

function appUpdateProductImageWishlist() {
  const button = document.getElementById('app-product-image-wishlist');
  if (!button) return;
  const productId = appCurrentProduct && appCurrentProduct.id ? String(appCurrentProduct.id) : '';
  const active = !!productId && appWishlistProductIds.has(productId);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
  const icon = button.querySelector('i');
  if (icon) icon.className = active ? 'ph-fill ph-heart-straight' : 'ph ph-heart-straight';
}

document.getElementById('app-product-image-wishlist').addEventListener('click', () => {
  if (!appCurrentProduct || !appCurrentProduct.id) return;
  const active = appToggleWishlistProduct(appCurrentProduct.id);
  appShowAddedToast(active ? 'Added to wishlist' : 'Removed from wishlist', active ? 'ph-heart' : 'ph-heart-break', 'wishlist');
});
document.getElementById('app-product-image-bag').addEventListener('click', () => {
  appCartOpen();
});

/* APP BAG — shares cart and discount storage with the website. */
const appCartView = document.getElementById('app-cart-view');
const appCartContent = document.getElementById('app-cart-content');
let appCartReturnTab = 'Home';
let appCartRenderVersion = 0;
let appCartNeedsRender = true;
let appCartPromoFeedback = null;
let appCartPromoPending = false;
let appAppliedDiscount = null;
const appCartVendorCache = new Map();
const appCartHydratedProductIds = new Set();
const appCartVendorLoads = new Map();

try {
  const savedDiscount = localStorage.getItem('janedore_applied_discount');
  if (savedDiscount) appAppliedDiscount = JSON.parse(savedDiscount);
} catch (_) { appAppliedDiscount = null; }

function appCartFormat(value) { return appProductMoney(value); }
function appCartSafeCode(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 20).toUpperCase();
}
function appCartSaveDiscount() {
  try {
    if (appAppliedDiscount) localStorage.setItem('janedore_applied_discount', JSON.stringify(appAppliedDiscount));
    else localStorage.removeItem('janedore_applied_discount');
  } catch (_) {}
}
function appCartUnitPrice(item) {
  const regular = Number(item.price) || 0;
  const sale = Number(item.salePrice) || 0;
  return sale > 0 && sale < regular ? sale : regular;
}
function appCartSubtotal(items) {
  return items.reduce((sum, item) => sum + appCartUnitPrice(item) * Math.max(1, Number(item.qty) || 1), 0);
}
function appCartDiscountAmount(items, subtotal) {
  if (!appAppliedDiscount) return 0;
  const value = Number(appAppliedDiscount.value) || 0;
  if (appAppliedDiscount.type === 'percentage') return Math.round(subtotal * value) / 100;
  if (appAppliedDiscount.type === 'fixed_amount') return Math.min(value, subtotal);
  if (appAppliedDiscount.type === 'buy_x_get_y') {
    if (items.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0) < value) return 0;
    const prices = items.map(appCartUnitPrice).filter(price => price > 0);
    return prices.length ? Math.min.apply(null, prices) : 0;
  }
  return 0;
}
function appCartLoadProduct(productId) {
  const id = String(productId || '');
  if (!id) return Promise.resolve(null);
  if (appCartHydratedProductIds.has(id) && appProductCache.has(id)) return Promise.resolve(appProductCache.get(id));
  let load = appProductLoads.get(id);
  if (!load) {
    load = appProductDb.collection('products').doc(id).get();
    appProductLoads.set(id, load);
  }
  return load.then(function(snapshot) {
    appCartHydratedProductIds.add(id);
    if (!snapshot.exists) return null;
    const product = Object.assign({}, snapshot.data(), {id: snapshot.id});
    appProductCache.set(id, product);
    return product;
  }).catch(function(error) {
    console.warn('[APP BAG] Product lookup failed:', error && error.message);
    return null;
  }).finally(function() {
    appProductLoads.delete(id);
  });
}
function appCartLoadVendor(vendorId) {
  const id = String(vendorId || '');
  if (!id || id === 'unknown') return Promise.resolve(null);
  if (appCartVendorCache.has(id)) return Promise.resolve(appCartVendorCache.get(id));
  if (appCartVendorLoads.has(id)) return appCartVendorLoads.get(id);
  const load = appProductDb.collection('vendors').doc(id).get().then(function(snapshot) {
    const vendor = snapshot.exists ? Object.assign({id: snapshot.id}, snapshot.data()) : null;
    appCartVendorCache.set(id, vendor);
    return vendor;
  }).catch(function(error) {
    console.warn('[APP BAG] Brand delivery lookup failed:', error && error.message);
    appCartVendorCache.set(id, null);
    return null;
  }).finally(function() {
    appCartVendorLoads.delete(id);
  });
  appCartVendorLoads.set(id, load);
  return load;
}
async function appCartHydrateItems(items) {
  let changed = false;
  await Promise.all(items.map(async function(item) {
    const product = await appCartLoadProduct(item.productId);
    if (product) {
      if (!item.vendorId && product.vendorId) { item.vendorId = product.vendorId; changed = true; }
      if (!item.brand && product.brand) { item.brand = product.brand; changed = true; }
      if (!item.name && (product.name || product.title)) { item.name = product.name || product.title; changed = true; }
      if (item.price == null && product.price != null) { item.price = product.price; changed = true; }
      if (item.salePrice == null && product.salePrice != null) { item.salePrice = product.salePrice; changed = true; }
      if (!item.thumbnail) {
        const images = appProductImages(product);
        if (images.length) { item.thumbnail = images[0]; changed = true; }
      }
    }
    const vendorId = appCartVendorId(item, product);
    await appCartLoadVendor(vendorId);
  }));
  if (changed) {
    try { localStorage.setItem('janedore_cart', JSON.stringify(items)); } catch (_) {}
  }
}
function appCartVendorId(item, product) {
  const brand = String((product && product.brand) || (item && item.brand) || '').trim().toUpperCase();
  // Only JANEDORE products may fall back to the house vendor. A guest brand
  // without a resolved vendor must not inherit JANEDORE's free-delivery offer.
  if (brand === 'JANEDORE') return 'vendor-janedore';
  return (product && product.vendorId) || (item && item.vendorId) || 'unknown';
}
function appCartGetShipments(items) {
  const groups = new Map();
  items.forEach(function(item) {
    const product = appProductCache.get(String(item.productId || '')) || null;
    const vendorId = appCartVendorId(item, product);
    const vendor = appCartVendorCache.get(vendorId) || null;
    const warehouse = vendor && String(vendor.warehouse || '').trim().toLowerCase();
    const key = warehouse ? 'warehouse:' + warehouse : vendorId;
    const brand = (vendor && (vendor.brand || vendor.name)) || (product && product.brand) || item.brand || 'JANEDORE';
    if (!groups.has(key)) groups.set(key, {key:key, brand:brand, brands:[], vendorIds:[], warehouse:!!warehouse, subtotal:0, eligible:true, minimum:0});
    const group = groups.get(key);
    if (group.brands.indexOf(brand) === -1) group.brands.push(brand);
    if (group.vendorIds.indexOf(vendorId) === -1) group.vendorIds.push(vendorId);
    group.subtotal += appCartUnitPrice(item) * Math.max(1, Number(item.qty) || 1);
    const offer = (vendor && vendor.freeDeliveryOffer) || (product && product.freeDeliveryOffer) || null;
    const minimum = Number(offer && offer.minimum);
    if (!(minimum > 0)) group.eligible = false;
    else group.minimum = Math.max(group.minimum, minimum);
  });
  const freeByCode = !!(appAppliedDiscount && appAppliedDiscount.type === 'free_shipping');
  return Array.from(groups.values()).map(function(group) {
    const reached = group.eligible && group.subtotal >= group.minimum;
    group.brand = group.brands.join(' & ');
    group.free = freeByCode || reached;
    group.remaining = group.eligible && !reached && !freeByCode ? group.minimum - group.subtotal : 0;
    return group;
  });
}
function appCartDeliveryBanner(items) {
  const shipments = appCartGetShipments(items);
  if (!shipments.length) return '';
  if (appAppliedDiscount && appAppliedDiscount.type === 'free_shipping') {
    return '<div class="app-cart-delivery-banner is-free"><i class="ph ph-truck" aria-hidden="true"></i><div class="app-cart-delivery-copy"><p>Your discount code includes free delivery.</p><div class="app-cart-delivery-track"><span style="width:100%"></span></div></div></div>';
  }
  const eligible = shipments.filter(function(group) { return group.eligible; });
  const pending = eligible.find(function(group) { return group.remaining > 0; });
  if (pending) {
    const progress = Math.max(0, Math.min(100, pending.subtotal / pending.minimum * 100));
    return '<div class="app-cart-delivery-banner"><i class="ph ph-truck" aria-hidden="true"></i><div class="app-cart-delivery-copy"><p>Add <strong>' + appProductEscape(appCartFormat(pending.remaining)) + '</strong> more from <strong>' + appProductEscape(pending.brand) + '</strong> to get free delivery.</p><div class="app-cart-delivery-track"><span style="width:' + progress + '%"></span></div></div></div>';
  }
  const free = eligible.filter(function(group) { return group.free; });
  if (!free.length) return '';
  const allPackagesFree = free.length === shipments.length;
  const brands = free.map(function(group) { return group.brand; }).join(' and ');
  const message = allPackagesFree ? 'Your order qualifies for free delivery.' : 'Your ' + appProductEscape(brands) + ' items qualify for free delivery.';
  return '<div class="app-cart-delivery-banner is-free"><i class="ph ph-truck" aria-hidden="true"></i><div class="app-cart-delivery-copy"><p>' + message + '</p><div class="app-cart-delivery-track"><span style="width:100%"></span></div></div></div>';
}
function appCartPromoHtml() {
  let body = '';
  if (appAppliedDiscount) {
    body = '<div class="app-cart-promo-applied"><span><i class="ph ph-check-circle" aria-hidden="true"></i> ' + appProductEscape(appAppliedDiscount.code || 'Discount') + ' applied</span><button type="button" id="app-cart-promo-remove">Remove</button></div>';
  } else {
    body = '<div class="app-cart-promo-row"><input id="app-cart-promo-input" type="text" placeholder="Enter code" autocomplete="off" autocapitalize="off" aria-label="Discount code"' + (appCartPromoPending ? ' disabled' : '') + '><button type="button" id="app-cart-promo-apply"' + (appCartPromoPending ? ' disabled aria-busy="true"' : '') + '>' + (appCartPromoPending ? 'Applying…' : 'Apply') + '</button></div>';
  }
  const feedback = appCartPromoFeedback
    ? '<p class="app-cart-promo-message ' + appProductEscape(appCartPromoFeedback.type) + '" role="status">' + appProductEscape(appCartPromoFeedback.message) + '</p>'
    : '';
  return '<section class="app-cart-promo"><h2>Apply a code</h2>' + body + feedback + '</section>';
}
function appCartDiscountDescription(discount) {
  if (discount.type === 'percentage') return discount.value + '% off';
  if (discount.type === 'fixed_amount') return appCartFormat(discount.value) + ' off';
  if (discount.type === 'free_shipping') return 'Free delivery';
  if (discount.type === 'buy_x_get_y') return 'Buy ' + discount.value + ' Get 1 Free';
  return 'Discount';
}
async function appCartApplyPromoCode() {
  if (appCartPromoPending) return;
  const input = document.getElementById('app-cart-promo-input');
  if (!input) return;
  const enteredCode = input.value;
  const code = appCartSafeCode(enteredCode);
  if (!code) {
    appCartPromoFeedback = {message:'Please enter a valid discount code.', type:'error'};
    appRenderCart();
    return;
  }
  const items = appProductCartItems();
  const subtotal = appCartSubtotal(items);
  appCartPromoPending = true;
  appCartPromoFeedback = null;
  appRenderCart();
  const pendingInput = document.getElementById('app-cart-promo-input');
  if (pendingInput) pendingInput.value = enteredCode;
  try {
    const response = await fetch('/api/discounts/lookup', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:code})
    });
    const data = await response.json().catch(function() { return {}; });
    if (!response.ok) throw new Error(data.error || 'We couldn’t verify this code. Please try again.');
    if (!data.found) throw new Error('This discount code is not valid.');
    const discount = data.discount || {};
    if (!discount.active) throw new Error('This discount is no longer active.');
    const now = new Date();
    if (discount.startDate && new Date(discount.startDate) > now) throw new Error('This discount is not yet active.');
    if (discount.endDate && new Date(discount.endDate) < now) throw new Error('This discount has expired.');
    if (discount.usageLimit !== null && discount.usageLimit !== undefined && (discount.usageCount || 0) >= discount.usageLimit) throw new Error('This discount has reached its usage limit.');
    if (discount.minimumPurchase && subtotal < Number(discount.minimumPurchase)) throw new Error('A minimum spend of ' + appCartFormat(discount.minimumPurchase) + ' applies to this code.');
    appAppliedDiscount = {
      id:discount.id,
      code:appCartSafeCode(discount.code || code),
      type:String(discount.type || ''),
      value:Number(discount.value) || 0,
      description:appCartDiscountDescription(discount)
    };
    appCartSaveDiscount();
    appCartPromoPending = false;
    appCartPromoFeedback = {message:'Discount applied: ' + appAppliedDiscount.description, type:'success'};
    appRenderCart();
  } catch (error) {
    appCartPromoPending = false;
    const message = error && error.name === 'TypeError'
      ? 'Could not reach the discount service. Please check your connection and try again.'
      : (error.message || 'This code could not be applied. Please try again.');
    appCartPromoFeedback = {message:message, type:'error'};
    appRenderCart();
    const nextInput = document.getElementById('app-cart-promo-input');
    if (nextInput) nextInput.value = enteredCode;
  }
}
function appCartRemovePromoCode() {
  appAppliedDiscount = null;
  appCartSaveDiscount();
  appCartPromoFeedback = {message:'Discount removed.', type:'success'};
  appRenderCart();
}
function appRecordRecentlyViewed(product) {
  if (!product || !product.id) return;
  try {
    const id = String(product.id);
    const saved = JSON.parse(localStorage.getItem('janedore_recently_viewed') || '[]');
    const ids = Array.isArray(saved) ? saved.map(String) : [];
    localStorage.setItem('janedore_recently_viewed', JSON.stringify([id].concat(ids.filter(function(value) { return value !== id; })).slice(0, 20)));
    const cached = JSON.parse(localStorage.getItem('janedore_recently_viewed_products') || '{}');
    cached[id] = product;
    const allowed = new Set([id].concat(ids.filter(function(value) { return value !== id; })).slice(0, 20));
    Object.keys(cached).forEach(function(key) { if (!allowed.has(key)) delete cached[key]; });
    localStorage.setItem('janedore_recently_viewed_products', JSON.stringify(cached));
  } catch (_) {}
}
async function appCartRecentlyViewedProducts() {
  let ids = [];
  try {
    const saved = JSON.parse(localStorage.getItem('janedore_recently_viewed') || '[]');
    ids = Array.isArray(saved) ? saved.map(String).slice(0, 12) : [];
  } catch (_) { ids = []; }
  const products = await Promise.all(ids.map(appCartLoadProduct));
  return products.filter(function(product) {
    return product && (!product.status || String(product.status).toLowerCase() === 'active');
  }).slice(0, 10);
}
function appBindSliderProgress(track, progress) {
  if (!track || !progress) return;
  const fill = progress.querySelector('.app-new-in-progress-fill');
  if (!fill) return;
  function update() {
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const visibleRatio = track.scrollWidth > 0 ? track.clientWidth / track.scrollWidth : 1;
    const thumbRatio = Math.min(1, visibleRatio);
    const travel = Math.max(0, progress.clientWidth * (1 - thumbRatio));
    const position = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
    fill.style.width = (thumbRatio * 100) + '%';
    fill.style.transform = 'translateX(' + (travel * position) + 'px)';
    progress.setAttribute('aria-valuenow', String(Math.round(position * 100)));
  }
  track.onscroll = update;
  if (progress._resizeHandler) window.removeEventListener('resize', progress._resizeHandler);
  progress._resizeHandler = update;
  window.addEventListener('resize', update);
  requestAnimationFrame(update);
}

function appCartRenderRecentlyViewed(renderVersion) {
  const section = document.getElementById('app-cart-recent');
  const track = document.getElementById('app-cart-recent-track');
  if (!section || !track) return;

  let ids = [];
  let cached = {};
  try {
    const savedIds = JSON.parse(localStorage.getItem('janedore_recently_viewed') || '[]');
    ids = Array.isArray(savedIds) ? savedIds.map(String).slice(0, 12) : [];
    cached = JSON.parse(localStorage.getItem('janedore_recently_viewed_products') || '{}') || {};
  } catch (_) { ids = []; cached = {}; }

  function paint(products) {
    if (renderVersion !== appCartRenderVersion || !section.isConnected) return;
    const visible = products.filter(function(product) {
      return product && (!product.status || String(product.status).toLowerCase() === 'active');
    }).slice(0, 10);
    if (!visible.length) {
      section.hidden = true;
      track.innerHTML = '';
      return;
    }
    const cardsHTML = visible.map(function(product) {
      const regularPrice = Number(product.price) || 0;
      const salePrice = product.salePrice == null || product.salePrice === '' ? NaN : Number(product.salePrice);
      const sale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < regularPrice;
      const badge = Number(product.stock) <= 0
        ? 'SOLD OUT'
        : (String(product.badge || '').trim().toLowerCase() === 'pre-order'
          ? 'PRE-ORDER'
          : sale
            ? 'SALE'
            : (product.badge && !['new','sale','sold out','sold','free delivery'].includes(String(product.badge).toLowerCase())
              ? String(product.badge).toUpperCase()
              : 'NEW'));
      const price = sale
        ? '<span class="app-new-in-old-price">R' + regularPrice.toFixed(2) + '</span><span class="app-new-in-sale-price">R' + salePrice.toFixed(2) + '</span>'
        : '<span>R' + regularPrice.toFixed(2) + '</span>';
      const image = appProductImages(product)[0] || product.imageUrl || '';
      return '<article class="app-new-in-card' + (Number(product.stock) <= 0 ? ' is-sold-out' : '') + '" data-product-id="' + appProductEscape(product.id || '') + '" role="button" tabindex="0" aria-label="View ' + appProductEscape(product.name || product.title || 'Product') + '">' +
        '<div class="app-new-in-image">' + (badge ? '<span class="app-new-in-badge' + (badge === 'SALE' ? ' is-sale' : '') + '">' + appProductEscape(badge) + '</span>' : '') + (image ? '<img src="' + appProductEscape(image) + '" alt="' + appProductEscape(product.name || product.title || 'Product') + '" loading="lazy">' : '') + '<button class="app-new-in-wishlist" type="button" aria-label="Add to wishlist" aria-pressed="false"><i class="ph ph-heart-straight" aria-hidden="true"></i></button></div>' +
        '<div class="app-new-in-brand">' + appProductEscape(appFormatBrandName(product.brand || '')) + '</div>' +
        '<div class="app-new-in-name">' + appProductEscape(product.name || product.title || 'Product') + '</div>' +
        '<div class="app-new-in-price">' + price + '</div>' +
      '</article>';
    }).join('');
    // Cached products are painted immediately, then refreshed from Firestore.
    // Do not replace the slider DOM when the refreshed cards are identical:
    // doing so reloads every image and makes Recently Viewed visibly flash.
    if (track.innerHTML !== cardsHTML) track.innerHTML = cardsHTML;
    section.hidden = false;
    appBindSliderProgress(track, document.getElementById('app-cart-recent-progress'));
  }

  const cachedProducts = ids.map(function(id) { return cached[id] || appProductCache.get(id) || null; }).filter(Boolean);
  if (cachedProducts.length) paint(cachedProducts);

  Promise.all(ids.map(appCartLoadProduct)).then(function(products) {
    if (renderVersion !== appCartRenderVersion || !section.isConnected) return;
    const fresh = products.filter(Boolean);
    try {
      const nextCache = Object.assign({}, cached);
      fresh.forEach(function(product) { nextCache[String(product.id)] = product; });
      localStorage.setItem('janedore_recently_viewed_products', JSON.stringify(nextCache));
    } catch (_) {}
    paint(fresh);
  }).catch(function(error) {
    console.warn('[APP BAG] Recently viewed products could not be refreshed:', error && error.message);
  });
}
function appCartOpen() {
  if (!appCartView) return;
  const alreadyOpen = !appCartView.hidden;
  if (!alreadyOpen) {
    const selected = navItems.find(function(item) { return item.classList.contains('selected') && item.dataset.tab !== 'Cart'; });
    appCartReturnTab = selected ? selected.dataset.tab : appActiveTab || 'Home';
  }
  appProductView.hidden = true;
  const sticky = document.getElementById('app-product-sticky-bar');
  if (sticky) sticky.hidden = true;
  document.querySelectorAll('.app-tab-content').forEach(function(view) { view.hidden = true; });
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage) collectionPage.hidden = true;
  const header = document.querySelector('.app-header');
  const bottom = document.querySelector('.bottom-nav');
  if (header) header.hidden = true;
  if (bottom) bottom.hidden = false;
  // The bag now opens from the header; keep the current bottom tab selected.
  document.body.classList.remove('app-product-open');
  document.body.classList.add('app-cart-open');
  appCartView.hidden = false;
  // Keep the existing cart DOM when returning from another tab. Only rebuild
  // it when the cart contents have actually changed or it has never rendered.
  if (appCartNeedsRender) appRenderCart();
  window.scrollTo({top:0,behavior:'instant'});
  if (!alreadyOpen && location.hash !== '#bag') history.pushState({appCart:true}, '', location.pathname + location.search + '#bag');
}
function appCartClose(fromHistory) {
  if (!appCartView || appCartView.hidden) return;
  appCartView.hidden = true;
  document.body.classList.remove('app-cart-open');
  document.querySelectorAll('.app-tab-content').forEach(function(view) { view.hidden = view.dataset.view !== appCartReturnTab; });
  const header = document.querySelector('.app-header');
  const bottom = document.querySelector('.bottom-nav');
  if (header) header.hidden = false;
  if (bottom) bottom.hidden = false;
  const selected = navItems.find(function(item) { return item.dataset.tab === appCartReturnTab; });
  if (selected) appSelectNavigationTab(appCartReturnTab, selected);
  if (!fromHistory && location.hash === '#bag') history.back();
  window.scrollTo({top:0,behavior:'instant'});
}
function appRenderCart(skipHydration) {
  if (!appCartContent) return;
  appCartNeedsRender = false;
  const items = appProductCartItems();
  const renderVersion = ++appCartRenderVersion;
  const stepper = document.querySelector('.app-checkout-steps');
  appUpdateCartIndicator();
  if (!items.length) {
    if (stepper) stepper.hidden = true;
    appCartContent.innerHTML = '<div class="app-cart-empty"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 200" width="220" height="200" role="img" aria-label="Empty cart">\n  <style>\n    .stroke { stroke: #000; stroke-width: 1; stroke-linecap: round; stroke-linejoin: round; fill: none; }\n    #cart { animation: roll 4s ease-in-out infinite; }\n    .spoke { transform-box: fill-box; transform-origin: center; animation: spin 4s ease-in-out infinite; }\n    #ghost { animation: drop 4s ease-in infinite; opacity: 0; }\n    @keyframes roll {\n      0%, 100% { transform: translateX(0); }\n      25% { transform: translateX(8px); }\n      75% { transform: translateX(-8px); }\n    }\n    @keyframes spin {\n      0%, 100% { transform: rotate(0deg); }\n      25% { transform: rotate(57deg); }\n      75% { transform: rotate(-57deg); }\n    }\n    @keyframes drop {\n      0% { transform: translateY(0); opacity: 0; }\n      15% { transform: translateY(0); opacity: 1; }\n      55% { transform: translateY(74px); opacity: 1; }\n      70% { transform: translateY(74px); opacity: 0; }\n      100% { transform: translateY(0); opacity: 0; }\n    }\n    @media (prefers-reduced-motion: reduce) {\n      #cart, .spoke, #ghost { animation: none; }\n    }\n  </style>\n  <g id="cart">\n\n    <path d="M52 62 H200 L186 128 H68 Z" fill="#E0EBFF"/>\n    <rect id="ghost" x="113" y="14" width="26" height="26" rx="3" fill="none" stroke="#809ADD" stroke-width="1" stroke-dasharray="4 4" stroke-linecap="round"/>\n    <path class="stroke" d="M89 62 L97.5 128"/>\n    <path class="stroke" d="M126 62 L127 128"/>\n    <path class="stroke" d="M163 62 L156.5 128"/>\n    <path class="stroke" d="M57.3 84 H195.3"/>\n    <path class="stroke" d="M62.7 106 H190.7"/>\n    <path class="stroke" d="M52 62 H200 L186 128 H68 Z"/>\n    <path class="stroke" d="M52 62 L42 30 Q41 26 36 26 H29"/>\n    <circle class="stroke" cx="25" cy="26" r="4"/>\n    <path class="stroke" d="M68 128 L74 146 Q76 152 84 152 H186"/>\n    <path class="stroke" d="M84 152 V157"/>\n    <path class="stroke" d="M176 152 V157"/>\n    <circle cx="84" cy="165" r="8" fill="#809ADD" stroke="#000" stroke-width="1"/>\n    <circle cx="176" cy="165" r="8" fill="#809ADD" stroke="#000" stroke-width="1"/>\n    <path class="stroke spoke" d="M84 160 V170"/>\n    <path class="stroke spoke" d="M176 160 V170"/>\n  </g>\n</svg><h2>Your bag is empty</h2><p>Your next favourite find is waiting.</p><button type="button" id="app-cart-shop" class="app-home-hero-button">Continue shopping</button></div>';
    if (!skipHydration) appCartHydrateItems(items);
    return;
  }
  const subtotal = appCartSubtotal(items);
  const discountAmount = appCartDiscountAmount(items, subtotal);
  const cards = items.map(function(item, index) {
    const quantity = Math.max(1, Number(item.qty) || 1);
    const image = typeof item.thumbnail === 'string' && /^https:\/\//i.test(item.thumbnail) ? item.thumbnail : '';
    const variant = item.color && item.color !== 'Default' ? ' · ' + item.color : '';
    const size = item.size && item.size !== 'OS' ? ' · Size ' + item.size : '';
    const product = appProductCache.get(String(item.productId || '')) || null;
    const badge = product
      ? (Number(product.stock) <= 0
        ? 'SOLD OUT'
        : (String(product.badge || '').trim().toLowerCase() === 'pre-order'
          ? 'PRE-ORDER'
          : ((Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price))
            ? 'SALE'
            : (product.badge && !['new','sale','sold out','sold','free delivery'].includes(String(product.badge).toLowerCase())
              ? String(product.badge).toUpperCase()
              : 'NEW'))))
      : '';
    const quantityLeading = quantity <= 1
      ? '<button type="button" class="app-cart-qty-action" data-cart-action="remove" data-index="' + index + '" aria-label="Remove ' + appProductEscape(item.name || 'product') + '"><i class="ph ph-trash" aria-hidden="true"></i></button>'
      : '<button type="button" class="app-cart-qty-action" data-cart-action="minus" data-index="' + index + '" aria-label="Decrease quantity"><i class="ph ph-minus" aria-hidden="true"></i></button>';
    return '<article class="app-cart-item" data-cart-index="' + index + '" data-product-id="' + appProductEscape(item.productId || '') + '" role="button" tabindex="0" aria-label="View product details for ' + appProductEscape(item.name || 'Product') + '">' +
      '<div class="app-cart-item-image">' + (image ? '<img src="' + appProductEscape(image) + '" alt="">' : '') + '</div>' +
      '<div class="app-cart-item-info"><span class="app-cart-item-badge-slot">' + (badge ? '<span class="app-cart-item-badge' + (badge === 'SALE' ? ' is-sale' : '') + '">' + appProductEscape(badge) + '</span>' : '') + '</span>' +
      '<p class="app-cart-item-brand">' + appProductEscape(item.brand || '') + '</p>' +
      '<h2>' + appProductEscape(item.name || 'Product') + '</h2><p class="app-cart-item-variant">' + appProductEscape((variant + size).replace(/^ · /, '')) + '</p>' +
      '<div class="app-cart-item-quantity-wrap"><div class="app-cart-item-controls">' + quantityLeading + '<span>' + quantity + '</span><button type="button" class="app-cart-qty-action" data-cart-action="plus" data-index="' + index + '" aria-label="Increase quantity"><i class="ph ph-plus" aria-hidden="true"></i></button></div></div></div>' +
      '<div class="app-cart-item-price">' + appCartFormat(appCartUnitPrice(item) * quantity) + '</div></article>';
  }).join('');
  const discountRow = appAppliedDiscount
    ? '<div class="app-cart-total-row discount"><span>Discount</span><span>-' + appCartFormat(discountAmount) + '</span></div>'
    : '';
  const deliveryBanner = appCartDeliveryBanner(items);
  const recentSection = '<section class="app-cart-recent" id="app-cart-recent" hidden><h2>Recently viewed</h2><div class="app-cart-recent-track" id="app-cart-recent-track"></div><div class="app-new-in-progress app-cart-recent-progress" id="app-cart-recent-progress" role="progressbar" aria-label="Recently viewed slider position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="app-new-in-progress-fill"></span></div></section>';
  appCartContent.innerHTML = (deliveryBanner ? '<div class="app-cart-delivery-slot" id="app-cart-delivery-slot">' + deliveryBanner + '</div>' : '') +
    '<div class="app-cart-items">' + cards + '</div>' +
    appCartPromoHtml() +
    '<div class="app-cart-summary">' +
    discountRow +
    '<div class="app-cart-total-row"><span>Delivery</span><span>Calculated at checkout</span></div>' +
    '<div class="app-cart-total-head"><span>Subtotal</span><strong>' + appCartFormat(Math.max(0, subtotal - discountAmount)) + '</strong></div>' +
    '<button type="button" id="app-cart-checkout">Proceed to checkout</button></div>' + recentSection;
  if (stepper) stepper.hidden = false;
  appCartRenderRecentlyViewed(renderVersion);
  if (!skipHydration) {
    appCartHydrateItems(items).then(function() {
      if (renderVersion === appCartRenderVersion && appCartView && !appCartView.hidden) appRenderCart(true);
    });
  }
}
if (appCartContent) {
  appCartContent.addEventListener('click', function(event) {
    const recentCard = event.target.closest('.app-cart-recent-card[data-product-id]');
    if (recentCard) { appOpenProduct(recentCard.dataset.productId); return; }
    // Open the exact product represented by a cart row. Quantity controls
    // remain independent and must never trigger product navigation.
    const cartProduct = event.target.closest('.app-cart-item[data-product-id]');
    if (cartProduct && !event.target.closest('[data-cart-action]')) {
      appOpenProduct(cartProduct.dataset.productId);
      return;
    }
    const button = event.target.closest('[data-cart-action]');
    if (button) {
      const index = Number(button.dataset.index);
      const items = appProductCartItems();
      const item = items[index];
      if (!item) return;
      if (button.dataset.cartAction === 'remove') items.splice(index, 1);
      else if (button.dataset.cartAction === 'minus') item.qty = Math.max(1, (Number(item.qty) || 1) - 1);
      else if (button.dataset.cartAction === 'plus') item.qty = (Number(item.qty) || 1) + 1;
      localStorage.setItem('janedore_cart', JSON.stringify(items));
      if (typeof scheduleBagSync === 'function') scheduleBagSync();
      appRenderCart();
      return;
    }
    if (event.target.closest('#app-cart-checkout')) window.location.href = '/checkout';
    if (event.target.closest('#app-cart-shop')) {
      appCartClose(false);
      appHomeScreen = 'home';
      const homeMemory = appTabMemories.get('Home') || {scrollY:0, productId:null, productScrollY:0};
      homeMemory.scrollY = 0;
      homeMemory.productId = null;
      homeMemory.productScrollY = 0;
      appTabMemories.set('Home', homeMemory);
      appCollectionMemory.scrollY = 0;
      appPersistScrollMemories();
      const homeButton = navItems.find(item => item.dataset.tab === 'Home');
      if (homeButton) appSelectNavigationTab('Home', homeButton);
      appShowTabPage('Home');
      window.scrollTo({top:0,behavior:'instant'});
    }
    if (event.target.closest('#app-cart-promo-apply')) appCartApplyPromoCode();
    if (event.target.closest('#app-cart-promo-remove')) appCartRemovePromoCode();
  });
  appCartContent.addEventListener('keydown', function(event) {
    const cartProduct = event.target.closest && event.target.closest('.app-cart-item[data-product-id]');
    if (cartProduct && event.target === cartProduct && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      appOpenProduct(cartProduct.dataset.productId);
      return;
    }
    if (event.target && event.target.id === 'app-cart-promo-input' && event.key === 'Enter') {
      event.preventDefault();
      appCartApplyPromoCode();
    }
  });
}

function appUpdateQuantityControls() {
  const stock = appCurrentProduct ? appProductSizeStock(appCurrentProduct, appSelectedVariant, appSelectedSize || 'OS') : 0;
  const max = stock > 0 ? stock : 99;
  appProductQuantity = Math.max(1, Math.min(appProductQuantity, max));
  document.getElementById('app-product-qty').textContent = String(appProductQuantity);
  document.getElementById('app-product-qty-minus').disabled = appProductQuantity <= 1;
  document.getElementById('app-product-qty-plus').disabled = stock <= 0 || appProductQuantity >= max;
}
document.getElementById('app-product-qty-minus').addEventListener('click', () => {
  appProductQuantity = Math.max(1,appProductQuantity-1);
  appUpdateQuantityControls();
});
document.getElementById('app-product-qty-plus').addEventListener('click', () => {
  const stock = Number(appCurrentProduct && appCurrentProduct.stock);
  appProductQuantity = Math.min(Number.isFinite(stock) && stock > 0 ? stock : 99,appProductQuantity+1);
  appUpdateQuantityControls();
});
function appBuyNowCurrentProduct() {
  if (!appCurrentProduct) return;
  const hasSizes = appProductHasSizes(appCurrentProduct);
  const resolvedSize = hasSizes ? appSelectedSize : 'OS';
  if ((hasSizes && !resolvedSize) || appProductSizeStock(appCurrentProduct, appSelectedVariant, resolvedSize) <= 0) {
    appUpdateProductStickyState();
    return;
  }
  appAddCurrentProductToBag();
  appCartOpen();
}
function appAddCurrentProductToBag() {

  if (!appCurrentProduct) return;
  const hasSizes = appProductHasSizes(appCurrentProduct);
  const resolvedSize = hasSizes ? appSelectedSize : 'OS';
  if ((hasSizes && !resolvedSize) || appProductSizeStock(appCurrentProduct, appSelectedVariant, resolvedSize) <= 0) {
    appUpdateProductStickyState();
    return;
  }
  const items = appProductCartItems();
  const existing = items.find(item => item.productId === appCurrentProduct.id && item.size === resolvedSize && Number(item.variantIndex || 0) === appSelectedVariant);
  if (existing) existing.qty = (Number(existing.qty) || 0) + appProductQuantity;
  else {
    const variant = (appCurrentProduct.variants || [])[appSelectedVariant] || {};
    items.push({
      productId:appCurrentProduct.id,
      vendorId:appCurrentProduct.vendorId || 'vendor-janedore',
      variantIndex:appSelectedVariant,
      size:resolvedSize,
      qty:appProductQuantity,
      name:appCurrentProduct.name || appCurrentProduct.title || '',
      brand:appCurrentProduct.brand || '',
      price:appCurrentProduct.price,
      salePrice:appCurrentProduct.salePrice,
      color:variant.color || variant.colour || 'Default',
      thumbnail:appGalleryImages.find((url,index) => appGalleryOwners[index] === appSelectedVariant) || appGalleryImages[0] || appCurrentProduct.imageUrl || ''
    });
  }
  localStorage.setItem('janedore_cart',JSON.stringify(items));
  appCartNeedsRender = true;
  appUpdateCartIndicator();
  appShowAddedToast('Added to bag', 'ph-check-circle', 'cart');
  
  const button = document.getElementById('app-product-sticky-add');
  const label = button && button.querySelector('.app-product-sticky-label');
  if (label && button && !button.disabled) {
    label.textContent = 'Added';
    setTimeout(() => {
      if (label.isConnected && appCurrentProduct) label.textContent = button.closest('.app-product-sticky-bar').classList.contains('minimized') ? 'Add' : 'Add to bag';
    }, 1400);
  }
}
window.addEventListener('popstate', () => {
  if (appCartView && !appCartView.hidden) { appCartClose(true); return; }
  if (location.hash.startsWith('#product/')) appOpenProduct(decodeURIComponent(location.hash.slice(9)),false);
  else if (appProductView && !appProductView.hidden) appProductClose();
});

// Pull-to-refresh is limited to the three top-level tabs. It refreshes the
// current tab's live content without navigating or reloading the whole app.
(function setupAppPullToRefresh() {
  const shell = document.querySelector('.app-shell');
  if (!shell) return;
  const indicator = document.createElement('div');
  indicator.className = 'app-pull-refresh-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = '<span class="app-pull-refresh-spinner" aria-hidden="true"></span><span class="app-pull-refresh-label">Pull to refresh</span>';
  shell.appendChild(indicator);

  let startY = 0;
  let pullDistance = 0;
  let tracking = false;
  let refreshing = false;
  let content = null;
  const threshold = 68;
  const maxPull = 104;

  function eligible() {
    if (!['Home', 'Shop', 'Discover'].includes(appActiveTab)) return false;
    const cart = document.getElementById('app-cart-view');
    const collection = document.getElementById('app-shop-page');
    return window.scrollY <= 1 &&
      (!appProductView || appProductView.hidden) &&
      (!cart || cart.hidden) &&
      (!collection || collection.hidden);
  }
  function setPull(distance) {
    pullDistance = Math.min(maxPull, Math.max(0, distance));
    const progress = Math.min(1, pullDistance / threshold);
    indicator.style.setProperty('--pull-progress', String(progress));
    indicator.style.transform = 'translate(-50%, ' + Math.max(0, pullDistance - 38) + 'px)';
    const label = indicator.querySelector('.app-pull-refresh-label');
    if (label) label.textContent = pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh';
    if (content) content.style.transform = 'translate3d(0,' + Math.round(pullDistance * .42) + 'px,0)';
    indicator.classList.toggle('is-ready', pullDistance >= threshold);
  }
  function resetPull() {
    if (content) {
      const releasedContent = content;
      releasedContent.style.transform = '';
      window.setTimeout(() => releasedContent.classList.remove('app-pull-refresh-moving'), 220);
    }
    indicator.classList.remove('is-visible', 'is-refreshing', 'is-ready');
    setPull(0);
    indicator.style.transform = 'translate(-50%, -42px)';
    content = null;
    pullDistance = 0;
    tracking = false;
  }
  async function refreshCurrentTab() {
    if (appActiveTab === 'Home') {
      // Re-fetch the shared homepage configuration without resetting the
      // selected category, scroll history, or bottom-navigation state.
      const response = await fetch('/api/app-homepage', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Homepage refresh unavailable');
      const data = await response.json();
      const heroImage = document.getElementById('app-home-hero-image');
      const heading = document.getElementById('app-home-hero-heading');
      if (heroImage && data.heroImageUrl) heroImage.src = data.heroImageUrl;
      if (heading) heading.textContent = data.heroHeading || '';
      const welcomeImage = document.getElementById('app-welcome-image');
      if (welcomeImage && data.heroImageUrl) welcomeImage.src = data.heroImageUrl;
      // Refresh the live New In response and update the in-memory product
      // cache; the existing cards remain visible while the request completes.
      const productsResponse = await fetch('/api/app-new-in', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (productsResponse.ok) {
        const productsData = await productsResponse.json();
        (Array.isArray(productsData.products) ? productsData.products : []).forEach(product => {
          if (product && product.id) appProductCache.set(String(product.id), product);
        });
      }
    }
    // Shop and Discover are intentionally empty tabs at present. The gesture
    // still completes there without taking the customer to another screen.
  }

  document.addEventListener('touchstart', event => {
    if (refreshing || !eligible() || event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    tracking = startY <= 150;
    if (!tracking) return;
    content = document.querySelector('.app-tab-content[data-view="' + appActiveTab + '"]');
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    const delta = event.touches[0].clientY - startY;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    if (window.scrollY > 1) { tracking = false; return; }
    event.preventDefault();
    if (pullDistance === 0) {
      indicator.classList.add('is-visible');
      if (content) content.classList.add('app-pull-refresh-moving');
    }
    setPull(delta * .72);
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (!tracking || refreshing) return;
    tracking = false;
    if (pullDistance < threshold) {
      resetPull();
      return;
    }
    refreshing = true;
    indicator.classList.add('is-refreshing');
    indicator.style.transform = 'translate(-50%, 18px)';
    const label = indicator.querySelector('.app-pull-refresh-label');
    if (label) label.textContent = 'Refreshing…';
    if (content) {
      content.classList.remove('app-pull-refresh-moving');
      content.style.transform = 'translate3d(0,42px,0)';
    }
    try {
      await refreshCurrentTab();
    } catch (error) {
      console.warn('[APP REFRESH] Could not refresh current tab:', error.message);
    } finally {
      refreshing = false;
      resetPull();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    if (tracking && !refreshing) resetPull();
  }, { passive: true });
})();

// Warm the full All Products catalogue as soon as the app script starts.
// This runs behind the welcome screen and shares the same in-flight request
// when the customer opens Shop Now, so the collection is ready on arrival.
appShopLoadProducts();
appUpdateCartIndicator();
if (location.hash.startsWith('#product/')) appOpenProduct(decodeURIComponent(location.hash.slice(9)),false);
