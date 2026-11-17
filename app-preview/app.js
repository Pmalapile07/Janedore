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
const appScrollMemoryKey = 'janedore_app_scroll_history_v1';
let appSavedScrollState = {};
try { appSavedScrollState = JSON.parse(localStorage.getItem(appScrollMemoryKey) || '{}') || {}; } catch (_) {}
const appTabMemories = new Map(Object.entries(appSavedScrollState.tabs || {}));
let appCollectionMemory = appSavedScrollState.collection || {scrollY:0};
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let appScrollRestoreToken = 0;

function appPersistScrollMemories() {
  try {
    localStorage.setItem(appScrollMemoryKey, JSON.stringify({
      tabs:Object.fromEntries(appTabMemories),
      collection:appCollectionMemory
    }));
  } catch (_) {}
}

function appRestoreScrollPosition(scrollY) {
  const targetY = Math.max(0, Number(scrollY) || 0);
  const token = ++appScrollRestoreToken;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== appScrollRestoreToken) return;
      window.scrollTo({top:targetY,behavior:'instant'});
    });
  });
}

function appSaveCurrentTabMemory() {
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage && !collectionPage.hidden && (!appProductView || appProductView.hidden)) {
    appCollectionMemory.scrollY = window.scrollY;
    appPersistScrollMemories();
    return;
  }
  const memory = appTabMemories.get(appActiveTab) || {scrollY:0, productId:null, productScrollY:0};
  if (appProductView && !appProductView.hidden) {
    memory.productId = appCurrentProduct && appCurrentProduct.id ? String(appCurrentProduct.id) : (appRenderedProductId || null);
    memory.productScrollY = window.scrollY;
  } else {
    memory.scrollY = window.scrollY;
    memory.productId = null;
    memory.productScrollY = 0;
  }
  appTabMemories.set(appActiveTab, memory);
  appPersistScrollMemories();
}

let appScrollSaveQueued = false;
window.addEventListener('scroll', () => {
  if (appScrollSaveQueued) return;
  appScrollSaveQueued = true;
  requestAnimationFrame(() => {
    appScrollSaveQueued = false;
    const collectionPage = document.getElementById('app-shop-page');
    if (collectionPage && !collectionPage.hidden && (!appProductView || appProductView.hidden)) {
      appCollectionMemory.scrollY = window.scrollY;
      appPersistScrollMemories();
    } else if (!appProductView || appProductView.hidden) {
      const memory = appTabMemories.get(appActiveTab) || {scrollY:0,productId:null,productScrollY:0};
      memory.scrollY = window.scrollY;
      appTabMemories.set(appActiveTab, memory);
      appPersistScrollMemories();
    } else {
      const memory = appTabMemories.get(appActiveTab) || {scrollY:0,productId:null,productScrollY:0};
      memory.productScrollY = window.scrollY;
      appTabMemories.set(appActiveTab, memory);
      appPersistScrollMemories();
    }
  });
});

function appSelectNavigationTab(tabName, activeButton) {
  navItems.forEach(item => {
    const active = item === activeButton;
    item.classList.toggle('selected', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  moveNavIndicator(activeButton);
}

function appRestoreTab(tabName, activeButton) {
  appProductReturnToCart = false;
  const cartView = document.getElementById('app-cart-view');
  if (cartView && !cartView.hidden) {
    cartView.hidden = true;
    document.body.classList.remove('app-cart-open');
  }
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage) collectionPage.hidden = true;
  appActiveTab = tabName;
  const memory = appTabMemories.get(tabName) || {scrollY:0, productId:null, productScrollY:0};
  appSelectNavigationTab(tabName, activeButton);
  if (location.hash.startsWith('#product/') || location.hash === '#bag') {
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (memory.productId) {
    appOpenProduct(memory.productId, false).then(() => {
      appRestoreScrollPosition(memory.productScrollY);
    });
    return;
  }
  appProductView.hidden = true;
  document.body.classList.remove('app-product-open');
  const header = document.querySelector('.app-header');
  if (header) header.hidden = tabName === 'Shop';
  const purchaseRow = document.getElementById('app-product-sticky-bar');
  if (purchaseRow) purchaseRow.hidden = true;
  tabViews.forEach(view => { view.hidden = view.dataset.view !== tabName; });
  if (tabName === 'Shop') appShopLoadProducts();
  appRestoreScrollPosition(memory.scrollY);
}

function activateTab(tabName, activeButton) {
  if (tabName === 'Cart') { appCartOpen(); return; }
  const cartView = document.getElementById('app-cart-view');
  if (cartView && !cartView.hidden) {
    appRestoreTab(tabName, activeButton);
    return;
  }
  const collectionPage = document.getElementById('app-shop-page');
  if (tabName === appActiveTab && (!appProductView || appProductView.hidden) && (!collectionPage || collectionPage.hidden)) return;
  appSaveCurrentTabMemory();
  appRestoreTab(tabName, activeButton);
}

navItems.forEach(button => {
  button.addEventListener('click', () => {
    activateTab(button.dataset.tab, button);
  });
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
    const placeholders = [
      { name: 'Clothing', slug: 'clothing' },
      { name: 'Accessories', slug: 'accessories' },
      { name: 'Beauty', slug: 'beauty' },
      { name: 'Fragrance', slug: 'fragrance' },
      { name: 'Kids', slug: 'kids' },
      { name: 'Homeware', slug: 'homeware' }
    ];
    const categories = Array.isArray(content.categories) && content.categories.length
      ? content.categories
      : placeholders;

    strip.replaceChildren();
    categories.forEach(category => {
      const item = document.createElement('div');
      item.className = 'app-category';

      const circle = document.createElement('span');
      circle.className = 'app-category-circle';
      circle.setAttribute('aria-hidden', 'true');
      if (category.imageUrl && /^https:\/\//i.test(category.imageUrl)) {
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


// App card wishlist affordance: keep taps on the heart separate from product-card taps.
document.addEventListener('click', event => {
  const button = event.target.closest('.app-new-in-wishlist');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const active = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', String(!active));
  button.setAttribute('aria-label', active ? 'Add to wishlist' : 'Remove from wishlist');
  const icon = button.querySelector('i');
  if (icon) icon.className = active ? 'ph ph-heart-straight' : 'ph-fill ph-heart-straight';
  button.classList.toggle('is-wishlisted', !active);
  appShowAddedToast(active ? 'Removed from wishlist' : 'Added to wishlist', active ? 'ph-heart-break' : 'ph-heart', 'wishlist');
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
        '<div class="app-new-in-brand">' + escapeText(product.brand) + '</div>' +
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

// Load the same active brand imagery used by the website's Shop by brand grid.
fetch('/api/app-brands', { headers: { Accept: 'application/json' } })
  .then(response => {
    if (!response.ok) throw new Error('Brands unavailable');
    return response.json();
  })
  .then(data => {
    const grid = document.getElementById('app-shop-brand-grid');
    if (!grid) return;
    const brands = Array.isArray(data.brands) ? data.brands : [];
    if (!brands.length) {
      grid.innerHTML = '<p class="app-new-in-empty">Brands will appear here soon.</p>';
      return;
    }
    const escapeBrand = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
const appProductCache = new Map();
const appProductLoads = new Map();

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
  const products = [...appShopProducts];
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
      '<div class="app-new-in-brand">' + appProductEscape(product.brand || product.vendorName || '') + '</div>' +
      '<div class="app-new-in-name">' + appProductEscape(product.name || product.title || 'Product') + '</div>' +
      '<div class="app-new-in-price">' + price + '</div></article>';
  }).join('');
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
function appOpenHomeCollection() {
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
  appShopLoadProducts();
  appRestoreScrollPosition(appCollectionMemory.scrollY || 0);
}
const appShopBack = document.getElementById('app-shop-back');
if (appShopBack) appShopBack.addEventListener('click', () => {
  const collectionPage = document.getElementById('app-shop-page');
  if (collectionPage) { appCollectionMemory.scrollY = window.scrollY; collectionPage.hidden = true; appPersistScrollMemories(); }
  const homeButton = navItems.find(item => item.dataset.tab === 'Home');
  if (homeButton) appRestoreTab('Home', homeButton);
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
  const wished = bar.dataset.wishProductId === String(product.id) && bar.dataset.wished === 'true';
  bar.dataset.wishProductId = String(product.id);
  bar.dataset.wished = String(wished);
  bar.innerHTML = '<button class="app-product-sticky-add" id="app-product-sticky-add" type="button"' +
    ((Number.isFinite(Number(product.stock)) && Number(product.stock) <= 0) ? ' disabled' : '') +
    '><span class="app-product-sticky-label">' + ((Number.isFinite(Number(product.stock)) && Number(product.stock) <= 0) ? 'Sold out' : 'Add to bag') +
    '</span></button><button class="app-product-sticky-wish' + (wished ? ' wished' : '') + '" id="app-product-sticky-wish" type="button" aria-label="' + (wished ? 'Remove from wishlist' : 'Add to wishlist') + '" aria-pressed="' + wished + '"><i class="' + (wished ? 'ph-fill ph-heart-straight' : 'ph ph-heart-straight') + '" aria-hidden="true"></i></button>';
  bar.hidden = false;
  document.getElementById('app-product-sticky-add').onclick = appAddCurrentProductToBag;
  document.getElementById('app-product-sticky-wish').onclick = event => {
    const button = event.currentTarget;
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(next));
    button.setAttribute('aria-label', next ? 'Remove from wishlist' : 'Add to wishlist');
    button.classList.toggle('wished', next);
    const icon = button.querySelector('i');
    if (icon) icon.className = next ? 'ph ph-fill ph-heart-straight' : 'ph ph-heart-straight';
    bar.dataset.wished = String(next);
    appShowAddedToast(next ? 'Added to wishlist' : 'Removed from wishlist', next ? 'ph-heart' : 'ph-heart-break', 'wishlist');
  };
  appUpdateProductStickyState();
}
function appUpdateProductStickyState() {
  const bar = document.getElementById('app-product-sticky-bar');
  if (!bar || !appProductView || appProductView.hidden || !appCurrentProduct) return;
  const label = bar.querySelector('.app-product-sticky-label');
  const button = bar.querySelector('.app-product-sticky-add');
  const p = appCurrentProduct, hasSizes = appProductHasSizes(p);
  const selectedStock = appProductSizeStock(p, appSelectedVariant, appSelectedSize || 'OS');
  const noAvailableSize = hasSizes && !(p.sizes || []).filter(s => s !== 'OS').some(s => appProductSizeStock(p, appSelectedVariant, s) > 0);
  const soldOut = Number(p.stock) <= 0 || noAvailableSize || (!hasSizes && selectedStock <= 0);
  const needsSize = hasSizes && !appSelectedSize && !soldOut;
  if (button) button.disabled = soldOut || needsSize || (hasSizes && selectedStock <= 0);
  if (label) label.textContent = soldOut || (hasSizes && selectedStock <= 0) ? 'Sold out' : (needsSize ? 'Select a size' : 'Add to bag');
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
  appActiveTab = 'Wishlist';
  if (appProductView) appProductView.hidden = true;
  const cartView = document.getElementById('app-cart-view');
  if (cartView) cartView.hidden = true;
  document.body.classList.remove('app-product-open');
  const header = document.querySelector('.app-header');
  const bottom = document.querySelector('.bottom-nav');
  if (header) header.hidden = false;
  if (bottom) bottom.hidden = false;
  tabViews.forEach(view => { view.hidden = view.dataset.view !== 'Wishlist'; });
  window.scrollTo({top:0,behavior:'instant'});
}
function appHideAddedToast() {
  window.clearTimeout(appAddedToastTimer);
  const toast = document.getElementById('app-added-toast');
  if (toast) toast.classList.remove('show');
}
function appUpdateCartIndicator() {
  const count = appProductCartItems().reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const badge = document.querySelector('.nav-cart-count');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.hidden = count < 1;
  }
  const cartButton = document.querySelector('.nav-item[data-tab="Cart"]');
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
  appProductView.hidden = false;
  document.body.classList.add('app-product-open');
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
    tabMemory.productId = null;
    tabMemory.productScrollY = 0;
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
  memory.productId = null;
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
  if (!openedFromCart) {
    const tabMemory = appTabMemories.get(appActiveTab) || {scrollY:0,productId:null,productScrollY:0};
    tabMemory.productId = id;
    tabMemory.productScrollY = 0;
    appTabMemories.set(appActiveTab,tabMemory);
  }
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
    document.getElementById('app-product-brand').textContent = product.brand || product.vendorName || '';
    document.getElementById('app-product-name').textContent = product.name || product.title || '';
    const previewPrice = Number(product.price) || 0;
    const previewSale = Number(product.salePrice);
    document.getElementById('app-product-price').innerHTML = Number.isFinite(previewSale) && previewSale > 0 && previewSale < previewPrice
      ? '<span class="app-product-sale-price">' + appProductMoney(previewSale) + '</span><s>' + appProductMoney(previewPrice) + '</s>'
      : appProductMoney(previewPrice);
    document.getElementById('app-product-description').innerHTML = appProductEscape(product.description || 'No description available.').replace(/\\n/g,'<br>');
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
  document.getElementById('app-product-brand').textContent = product.brand || product.vendorName || '';
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
  document.getElementById('app-product-description').innerHTML = appProductEscape(product.description || 'No description available.').replace(/\n/g,'<br>') +
    (product.compositionCare ? '<p><strong>Composition &amp; care</strong><br>' + appProductEscape(product.compositionCare).replace(/\n/g,'<br>') + '</p>' : '') +
    (product.measurements ? '<p><strong>Measurements</strong><br>' + appProductEscape(product.measurements).replace(/\n/g,'<br>') + '</p>' : '');
  document.getElementById('app-product-shipping').textContent = product.shippingReturns || 'Please see the delivery and returns information at checkout.';
  appRenderProductStickyBar(product, regular, sale);

  const related = [...appProductCache.values()].filter(item => item.id !== id && item.category && item.category === product.category).slice(0,6);
  const relatedSection = document.getElementById('app-product-related');
  const relatedTrack = document.getElementById('app-product-related-track');
  if (related.length) {
    relatedTrack.innerHTML = related.map(item => {
      const image = appProductImages(item)[0] || '';
      return '<a href="#product/' + encodeURIComponent(item.id) + '" class="app-product-related-card" data-product-id="' + appProductEscape(item.id) + '">' +
        (image ? '<img src="' + appProductEscape(image) + '" alt="' + appProductEscape(item.name || '') + '" loading="lazy">' : '<div class="app-product-related-image"></div>') +
        '<strong>' + appProductEscape(item.brand || '') + '</strong>' + appProductEscape(item.name || '') + '<span>' + appProductMoney(item.price) + '</span></a>';
    }).join('');
    relatedSection.hidden = false;
  } else {
    relatedSection.hidden = true;
    relatedTrack.innerHTML = '';
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

/* APP BAG — shares cart and discount storage with the website. */
const appCartView = document.getElementById('app-cart-view');
const appCartContent = document.getElementById('app-cart-content');
let appCartReturnTab = 'Home';
let appCartRenderVersion = 0;
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
    const vendorId = (product && product.vendorId) || item.vendorId || 'vendor-janedore';
    await appCartLoadVendor(vendorId);
  }));
  if (changed) {
    try { localStorage.setItem('janedore_cart', JSON.stringify(items)); } catch (_) {}
  }
}
function appCartVendorId(item, product) {
  return (product && product.vendorId) || (item && item.vendorId) || 'vendor-janedore';
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
    const saved = JSON.parse(localStorage.getItem('janedore_recently_viewed') || '[]');
    const ids = Array.isArray(saved) ? saved.map(String) : [];
    const id = String(product.id);
    localStorage.setItem('janedore_recently_viewed', JSON.stringify([id].concat(ids.filter(function(value) { return value !== id; })).slice(0, 20)));
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
async function appCartRenderRecentlyViewed(renderVersion) {
  const section = document.getElementById('app-cart-recent');
  const track = document.getElementById('app-cart-recent-track');
  if (!section || !track) return;
  try {
    const products = await appCartRecentlyViewedProducts();
    if (renderVersion !== appCartRenderVersion || !section.isConnected) return;
    if (!products.length) {
      section.hidden = true;
      track.innerHTML = '';
      return;
    }
    track.innerHTML = products.map(function(product) {
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
        '<div class="app-new-in-brand">' + appProductEscape(product.brand || '') + '</div>' +
        '<div class="app-new-in-name">' + appProductEscape(product.name || product.title || 'Product') + '</div>' +
        '<div class="app-new-in-price">' + price + '</div>' +
      '</article>';
    }).join('');
    section.hidden = false;
  } catch (error) {
    section.hidden = true;
    console.warn('[APP BAG] Recently viewed products could not be loaded:', error && error.message);
  }
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
  const cartButton = navItems.find(function(item) { return item.dataset.tab === 'Cart'; });
  if (cartButton) {
    navItems.forEach(function(item) {
      const active = item === cartButton;
      item.classList.toggle('selected', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    moveNavIndicator(cartButton);
  }
  document.body.classList.remove('app-product-open');
  document.body.classList.add('app-cart-open');
  appCartView.hidden = false;
  appRenderCart();
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
  if (selected) {
    navItems.forEach(function(item) {
      const active = item === selected;
      item.classList.toggle('selected', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    moveNavIndicator(selected);
  }
  if (!fromHistory && location.hash === '#bag') history.back();
  window.scrollTo({top:0,behavior:'instant'});
}
function appRenderCart(skipHydration) {
  if (!appCartContent) return;
  const items = appProductCartItems();
  const renderVersion = ++appCartRenderVersion;
  const stepper = document.querySelector('.app-checkout-steps');
  if (stepper) stepper.hidden = !items.length;
  appUpdateCartIndicator();
  const recentSection = '<section class="app-cart-recent" id="app-cart-recent" hidden><h2>Recently viewed</h2><div class="app-new-in-track app-cart-recent-track" id="app-cart-recent-track"></div></section>';
  if (!items.length) {
    appCartContent.innerHTML = '<div class="app-cart-empty"><i class="ph ph-tote-simple" aria-hidden="true"></i><h2>Your bag is empty</h2><p>Find something you love.</p><button type="button" id="app-cart-shop">Continue shopping</button></div>' + recentSection;
    appCartRenderRecentlyViewed(renderVersion);
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
    ? '<div class="app-cart-total-row discount"><span>Discount (' + appProductEscape(appAppliedDiscount.code || '') + ')</span><span>-' + appCartFormat(discountAmount) + '</span></div>'
    : '';
  appCartContent.innerHTML = appCartDeliveryBanner(items) +
    '<div class="app-cart-items">' + cards + '</div>' +
    appCartPromoHtml() +
    '<div class="app-cart-summary">' +
    discountRow +
    '<div class="app-cart-total-row"><span>Delivery</span><span>Calculated at checkout</span></div>' +
    '<div class="app-cart-total-head"><span>Subtotal</span><strong>' + appCartFormat(Math.max(0, subtotal - discountAmount)) + '</strong></div>' +
    '<button type="button" id="app-cart-checkout">Proceed to checkout</button></div>' + recentSection;
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
      appOpenHomeCollection();
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
appUpdateCartIndicator();
if (location.hash.startsWith('#product/')) appOpenProduct(decodeURIComponent(location.hash.slice(9)),false);
