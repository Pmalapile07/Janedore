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

function activateTab(tabName, activeButton) {
  tabViews.forEach(view => {
    view.hidden = view.dataset.view !== tabName;
  });
  navItems.forEach(item => {
    const active = item === activeButton;
    item.classList.toggle('selected', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  moveNavIndicator(activeButton);
  window.scrollTo({ top: 0, behavior: 'instant' });
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
    if (welcomeImage && content.heroImageUrl) welcomeImage.src = content.heroImageUrl;

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
      heroButton.href = destinations[link.type] || '/shop';
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
let appCurrentProduct = null;
let appProductQuantity = 1;
let appSelectedSize = '';
let appSelectedVariant = 0;
let appGalleryImages = [];

function appProductEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function appProductMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? 'R' + amount.toFixed(2) : '';
}
function appProductImages(product) {
  const candidates = [];
  if (Array.isArray(product.images)) candidates.push(...product.images);
  if (Array.isArray(product.gallery)) candidates.push(...product.gallery);
  if (product.imageUrl) candidates.unshift(product.imageUrl);
  if (product.image) candidates.push(product.image);
  (Array.isArray(product.variants) ? product.variants : []).forEach(variant => {
    if (variant.imageUrl) candidates.push(variant.imageUrl);
    if (Array.isArray(variant.images)) candidates.push(...variant.images);
  });
  return [...new Set(candidates.filter(value => typeof value === 'string' && /^https:\/\//i.test(value)))];
}
function appProductCartItems() {
  try { return JSON.parse(localStorage.getItem('janedore-app-cart') || '[]'); } catch (_) { return []; }
}
function appUpdateCartCount() {
  const count = appProductCartItems().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const badge = document.getElementById('app-product-cart-count');
  if (badge) { badge.textContent = count > 9 ? '9+' : String(count); badge.hidden = count < 1; }
}
function appProductClose() {
  if (!appProductView || appProductView.hidden) return;
  appProductView.hidden = true;
  document.body.classList.remove('app-product-open');
  document.querySelectorAll('.app-tab-content').forEach(view => { view.hidden = view.dataset.view !== 'Home'; });
  document.querySelector('.app-header').hidden = false;
  document.querySelector('.bottom-nav').hidden = false;
  if (location.hash.startsWith('#product/')) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo({top:0,behavior:'instant'});
}
function appProductShowLoading() {
  appProductView.hidden = false;
  document.body.classList.add('app-product-open');
  document.querySelectorAll('.app-tab-content').forEach(view => view.hidden = true);
  document.querySelector('.app-header').hidden = true;
  document.querySelector('.bottom-nav').hidden = true;
  document.getElementById('app-product-gallery-track').innerHTML = '<div class="app-product-gallery-loading"></div>';
  document.getElementById('app-product-brand').textContent = '';
  document.getElementById('app-product-name').textContent = 'Loading product…';
  document.getElementById('app-product-price').textContent = '';
  document.getElementById('app-product-description').textContent = '';
}
async function appOpenProduct(productId, pushHistory = true) {
  const id = String(productId || '').trim();
  if (!id) return;
  appProductShowLoading();
  if (pushHistory) history.pushState({appProductId:id}, '', '#product/' + encodeURIComponent(id));
  window.scrollTo({top:0,behavior:'instant'});
  let product = appProductCache.get(id) || null;
  try {
    const snap = await appProductDb.collection('products').doc(id).get();
    if (snap.exists) product = {...(product || {}), ...snap.data(), id:snap.id};
  } catch (error) {
    console.warn('[APP PRODUCT] Firestore detail lookup failed:', error.message);
  }
  if (!product) {
    document.getElementById('app-product-name').textContent = 'This product is currently unavailable.';
    document.getElementById('app-product-description').textContent = 'Please go back and try another product.';
    return;
  }
  appCurrentProduct = product;
  appProductQuantity = 1;
  appSelectedSize = '';
  appSelectedVariant = 0;
  const images = appProductImages(product);
  appGalleryImages = images.length ? images : [];
  const gallery = document.getElementById('app-product-gallery-track');
  gallery.innerHTML = appGalleryImages.length
    ? appGalleryImages.map((url,index) => '<div class="app-product-gallery-slide"><img src="' + appProductEscape(url) + '" alt="' + appProductEscape(product.name || 'Product image') + '" loading="' + (index ? 'lazy' : 'eager') + '"></div>').join('')
    : '<div class="app-product-gallery-slide app-product-gallery-empty"></div>';
  const dots = document.getElementById('app-product-gallery-dots');
  dots.innerHTML = appGalleryImages.length > 1 ? appGalleryImages.map((_,i) => '<span class="app-product-gallery-dot' + (!i?' active':'') + '"></span>').join('') : '';
  gallery.onscroll = () => {
    const index = Math.round(gallery.scrollLeft / Math.max(1,gallery.clientWidth));
    [...dots.children].forEach((dot,i)=>dot.classList.toggle('active',i===index));
  };
  document.getElementById('app-product-brand').textContent = product.brand || product.vendorName || '';
  document.getElementById('app-product-name').textContent = product.name || product.title || '';
  const regular = Number(product.price) || 0;
  const sale = Number(product.salePrice);
  document.getElementById('app-product-price').innerHTML = Number.isFinite(sale) && sale > 0 && sale < regular
    ? '<span class="app-product-sale-price">' + appProductMoney(sale) + '</span><s>' + appProductMoney(regular) + '</s>'
    : appProductMoney(regular);
  const stock = Number(product.stock);
  const stockEl = document.getElementById('app-product-stock');
  stockEl.textContent = Number.isFinite(stock) && stock <= 0 ? 'Sold out' : (String(product.badge || '').toLowerCase() === 'pre-order' ? 'Available for pre-order' : '');
  const sizes = (Array.isArray(product.sizes) ? product.sizes : []).filter(size => String(size).toUpperCase() !== 'OS');
  const sizeGroup = document.getElementById('app-product-size-group');
  sizeGroup.hidden = !sizes.length;
  document.getElementById('app-product-sizes').innerHTML = sizes.map(size => '<button class="app-product-option" type="button" data-size="' + appProductEscape(size) + '">' + appProductEscape(size) + '</button>').join('');
  const variants = Array.isArray(product.variants) ? product.variants : [];
  document.getElementById('app-product-variant-group').hidden = !variants.length;
  document.getElementById('app-product-variants').innerHTML = variants.map((variant,index) => '<button class="app-product-option" type="button" data-variant="' + index + '">' + appProductEscape(variant.name || variant.color || variant.colour || ('Option ' + (index+1))) + '</button>').join('');
  document.getElementById('app-product-qty').textContent = '1';
  document.getElementById('app-product-description').innerHTML = appProductEscape(product.description || 'No description available.').replace(/\n/g,'<br>') +
    (product.compositionCare ? '<p><strong>Composition &amp; care</strong><br>' + appProductEscape(product.compositionCare).replace(/\n/g,'<br>') + '</p>' : '') +
    (product.measurements ? '<p><strong>Measurements</strong><br>' + appProductEscape(product.measurements).replace(/\n/g,'<br>') + '</p>' : '');
  document.getElementById('app-product-shipping').textContent = product.shippingReturns || 'Please see the delivery and returns information at checkout.';
  document.getElementById('app-product-add').disabled = Number.isFinite(stock) && stock <= 0;
  document.getElementById('app-product-add').textContent = Number.isFinite(stock) && stock <= 0 ? 'Sold out' : 'Add to bag';
  appUpdateCartCount();
  try {
    const reviewSnap = await appProductDb.collection('reviews').where('productId','==',id).limit(20).get();
    const reviews = reviewSnap.docs.map(doc => doc.data());
    const reviewBox = document.getElementById('app-product-reviews');
    reviewBox.innerHTML = reviews.length ? reviews.map(review => '<div class="app-product-review"><strong>' + appProductEscape(review.name || 'Customer') + '</strong><p>' + appProductEscape(review.text || '') + '</p></div>').join('') : 'There are no reviews for this product yet.';
  } catch (_) {
    document.getElementById('app-product-reviews').textContent = 'Customer reviews are unavailable right now.';
  }
}
document.addEventListener('click', event => {
  const card = event.target.closest('.app-new-in-card[data-product-id]');
  if (card && !event.target.closest('.app-new-in-wishlist')) {
    appOpenProduct(card.dataset.productId);
    return;
  }
  const sizeButton = event.target.closest('[data-size]');
  if (sizeButton && appProductView && !appProductView.hidden) {
    appSelectedSize = sizeButton.dataset.size;
    document.querySelectorAll('#app-product-sizes [data-size]').forEach(button => button.classList.toggle('selected',button===sizeButton));
  }
  const variantButton = event.target.closest('[data-variant]');
  if (variantButton && appProductView && !appProductView.hidden) {
    appSelectedVariant = Number(variantButton.dataset.variant);
    document.querySelectorAll('#app-product-variants [data-variant]').forEach(button => button.classList.toggle('selected',button===variantButton));
  }
});
document.addEventListener('keydown', event => {
  const card = event.target.closest && event.target.closest('.app-new-in-card[data-product-id]');
  if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); appOpenProduct(card.dataset.productId); }
});
document.getElementById('app-product-back').addEventListener('click', () => {
  if (history.state && history.state.appProductId) history.back();
  else appProductClose();
});
document.getElementById('app-product-share').addEventListener('click', async () => {
  if (!appCurrentProduct) return;
  const url = location.href;
  const data = {title:appCurrentProduct.name || appCurrentProduct.title || 'Product',text:appCurrentProduct.name || '',url};
  if (navigator.share) { try { await navigator.share(data); } catch (error) { if (error.name !== 'AbortError') console.warn(error); } }
  else { try { await navigator.clipboard.writeText(url); alert('Product link copied.'); } catch (_) { window.prompt('Copy this product link:',url); } }
});
document.getElementById('app-product-cart').addEventListener('click', () => { location.href = '/cart'; });
document.getElementById('app-product-qty-minus').addEventListener('click', () => {
  appProductQuantity = Math.max(1,appProductQuantity-1);
  document.getElementById('app-product-qty').textContent = String(appProductQuantity);
});
document.getElementById('app-product-qty-plus').addEventListener('click', () => {
  const stock = Number(appCurrentProduct && appCurrentProduct.stock);
  appProductQuantity = Math.min(Number.isFinite(stock) && stock > 0 ? stock : 99,appProductQuantity+1);
  document.getElementById('app-product-qty').textContent = String(appProductQuantity);
});
document.getElementById('app-product-add').addEventListener('click', () => {
  if (!appCurrentProduct) return;
  const sizes = Array.isArray(appCurrentProduct.sizes) ? appCurrentProduct.sizes.filter(size => String(size).toUpperCase() !== 'OS') : [];
  if (sizes.length && !appSelectedSize) { alert('Please select a size first.'); return; }
  const items = appProductCartItems();
  const key = [appCurrentProduct.id,appSelectedSize,appSelectedVariant].join(':');
  const existing = items.find(item => item.key === key);
  if (existing) existing.quantity += appProductQuantity;
  else items.push({key,productId:appCurrentProduct.id,name:appCurrentProduct.name || appCurrentProduct.title,brand:appCurrentProduct.brand || '',price:Number(appCurrentProduct.salePrice) > 0 && Number(appCurrentProduct.salePrice) < Number(appCurrentProduct.price) ? Number(appCurrentProduct.salePrice) : Number(appCurrentProduct.price) || 0,imageUrl:appGalleryImages[0] || '',size:appSelectedSize,variant:appSelectedVariant,quantity:appProductQuantity});
  localStorage.setItem('janedore-app-cart',JSON.stringify(items));
  appUpdateCartCount();
  const button = document.getElementById('app-product-add');
  button.textContent = 'Added to bag';
  setTimeout(() => { if (button && !button.disabled) button.textContent = 'Add to bag'; },1400);
});
window.addEventListener('popstate', () => {
  if (location.hash.startsWith('#product/')) appOpenProduct(decodeURIComponent(location.hash.slice(9)),false);
  else if (appProductView && !appProductView.hidden) appProductClose();
});
appUpdateCartCount();
