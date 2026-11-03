// Rounded to the cent: whole rands show as R1,299, anything else with
// two decimals (R894.99, never R894.992 or R499.9).
function formatPrice(price) {
  const n = Number(price);
  const cents = Math.round((Number.isFinite(n) ? n : 0) * 100);
  const digits = cents % 100 === 0 ? 0 : 2;
  return 'R' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function hasSalePrice(p) {
  if (!p || p.salePrice === null || p.salePrice === undefined || p.salePrice === '') {
    return false;
  }
  const sale = Number(p.salePrice);
  return Number.isFinite(sale) && sale > 0 && sale < Number(p.price || 0);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJSString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3C');
}

function safeImageURL(url) {
  if (!url || typeof url !== 'string') return PLACEHOLDER_IMAGE;
  const trimmed = url.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return trimmed;
  return PLACEHOLDER_IMAGE;
}

// Grid/card thumbnails were loading the exact same full-resolution file
// Cloudinary stores the original upload as — often several MB — just to
// display it at a few hundred pixels wide in a product card. Cloudinary
// URLs always carry exactly one /upload/ segment; inserting transform
// params there resizes+compresses *at Cloudinary's CDN*, not here, so
// this only ever shrinks what gets downloaded. The stored secure_url and
// the full-resolution product-detail/zoom image are untouched. Any URL
// without an /upload/ segment (the inline SVG PLACEHOLDER_IMAGE, or a
// non-Cloudinary source) just passes through unchanged.
function gridThumbURL(url) {
  return safeImageURL(url).replace('/upload/', '/upload/f_auto,q_auto,c_fill,w_700,h_924/');
}

function escapeForCssUrl(url) {
  const safe = safeImageURL(url);
  return String(safe).replace(/['"\\\n\r]/g, '');
}

// Departments, categories, their names and order come from the category
// tree (taxonomy.js). A category page lists one category; a department
// page (Clothing, Accessories, Homeware, Beauty, Kids) lists all of its
// categories.
function isInDepartment(product, deptSlug) {
  return JDTaxonomy.departmentOf(product.category) === deptSlug;
}

// The `category` values actually relevant to whatever the customer is
// currently browsing. Returns null on the All products / Sale pages
// (every category is in scope there); on a category page, returns just
// that page's own categories, so filter options/results never
// reference a completely different department (e.g. clothing
// categories while browsing Homeware).
function getCategoryFilterScope() {
  if (S.currentPage === 'vendor') {
    return S.currentVendor ? [...new Set(getVendorBaseProducts(S.currentVendor).map(p => p.category).filter(Boolean))] : [];
  }
  if (S.currentPage !== 'category' || !S.currentCategoryPage) return null;
  if (S.currentCollectionHandle) return [...new Set(PRODUCTS.filter(function (p) { return productBelongsToCollection(p, S.currentCollectionData); }).map(function (p) { return p.category; }).filter(Boolean))];
  const dept = JDTaxonomy.department(S.currentCategoryPage);
  if (dept) return JDTaxonomy.categoriesIn(dept.slug);
  return [S.currentCategoryPage];
}
const LEATHER_POUCH_ID = 'janedore-leather-pouch';

// Published collections are the shared storefront source of truth.
// The status constraint is required by the public Firestore read rule.
window._publishedCollectionsPromise = window._publishedCollectionsPromise || null;
window._loadPublishedCollections = function (forceRefresh) {
  if (!forceRefresh && window._publishedCollectionsPromise) return window._publishedCollectionsPromise;
  if (typeof db === 'undefined' || !db || typeof db.collection !== 'function') return Promise.resolve([]);
  window._publishedCollectionsPromise = db.collection('collections').where('status', '==', 'active').get()
    .then(function (snapshot) {
      window._publishedCollections = snapshot.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data());
      }).filter(function (item) { return item.published !== false; });
      return window._publishedCollections;
    }).catch(function (error) {
      window._publishedCollectionsPromise = null;
      console.warn('[COLLECTIONS] Could not load published collections:', error.message);
      return [];
    });
  return window._publishedCollectionsPromise;
};

// The sections of Women and Men: rows in the menu (app.js). Shoes and
// bags have their own, as on ASOS and Zalando, rather than hiding inside
// Accessories.
const SHOP_GROUPS = [
  { key: 'new', name: 'New in', test: p => typeof isProductNew === 'function' && isProductNew(p) },
  { key: 'clothing', name: 'Clothing', cats: () => JDTaxonomy.categoriesIn('clothing') },
  { key: 'shoes', name: 'Shoes', cats: () => ['shoes'] },
  { key: 'bags', name: 'Bags', cats: () => ['bags'] },
  { key: 'accessories', name: 'Accessories', cats: () => JDTaxonomy.categoriesIn('accessories').filter(c => c !== 'shoes' && c !== 'bags') },
  { key: 'beauty', name: 'Beauty', menName: 'Grooming', cats: () => JDTaxonomy.categoriesIn('beauty') }
];
// On the Women or Men page: that gender or unisex, leaving out Kids and
// Homeware, which have their own sections.
function inGenderShop(p, g) {
  return JDTaxonomy.forGender(p, g) && ['kids', 'homeware'].indexOf(JDTaxonomy.departmentOf(p.category)) === -1;
}
function shopGroupName(gr, g) { return g === 'men' && gr.menName ? gr.menName : gr.name; }
function inShopGroup(p, key) {
  const gr = SHOP_GROUPS.find(x => x.key === key);
  if (!gr) return true;
  return gr.test ? gr.test(p) : gr.cats().includes(p.category);
}
function isGenderPage() { return !!(S.currentCollectionData && S.currentCollectionData.automatedRule === 'gender'); }

function productBelongsToCollection(product, collection) {
  if (!product || !collection) return false;
  if (collection.collectionType === 'automated') {
    if (collection.automatedRule === 'sale') return hasSalePrice(product);
    if (collection.automatedRule === 'newin') return typeof isProductNew === 'function' && isProductNew(product);
    if (collection.automatedRule === 'gender') return inGenderShop(product, collection.gender);
    // Free delivery or free collection (cart.js).
    if (collection.automatedRule === 'freedelivery') return typeof isFreeDeliveryProduct === 'function' && (isFreeDeliveryProduct(product) || !!collectionOffer(product));
  }
  const values = Array.isArray(product.collections) ? product.collections : String(product.collections || '').split(',');
  const handle = String(collection.handle || collection.slug || collection.id || '').trim().toLowerCase();
  const title = String(collection.title || collection.name || '').trim().toLowerCase();
  return values.some(function (value) {
    value = String(value || '').trim().toLowerCase();
    return value && (value === handle || value === title);
  });
}

function gridTemplateFor(cols) {
  return cols === 1 ? "1fr" : cols === 2 ? "repeat(2,1fr)" : "repeat(3,1fr)";
}

// The nth-child(odd) left-padding on product-card text (product-grid.css)
// only makes sense in 2-column view — it offsets left-column cards
// against the right column. In 1 or 3 columns there's no such pairing,
// so odd-numbered cards would get a stray left nudge for no reason. This
// class lets that CSS rule scope itself to 2-column mode only.
function applyGridColsClass(el, cols) {
  if (!el) return;
  el.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3');
  el.classList.add('grid-cols-' + cols);
}

function isLeatherPouchAllowed(context) {
  return context === 'sunglasses' || context === 'vendor';
}

// ── SORT ─────────────────────────────────────────────────────
// Sorting never disables the editorial grid — the featured/tall card layout
// still applies. Sort only reorders which products land in which position.
// Newest is the default; the Sort button shows whichever is picked.
const SORT_OPTIONS = [
  { v: 'newest',     l: 'Newest' },
  { v: 'price-desc', l: 'Price high to low' },
  { v: 'price-asc',  l: 'Price low to high' },
  { v: 'oldest',     l: 'Oldest' },
  { v: 'discount',   l: 'Biggest discount' }
];

function applySort(products, sortBy) {
  if (!sortBy || sortBy === 'featured') return products;
  const arr = [...products];
  const priceOf = (p) => Number(hasSalePrice(p) ? p.salePrice : p.price);
  const safePrice = (p) => {
    const n = priceOf(p);
    return Number.isFinite(n) ? n : 0;
  };
  switch (sortBy) {
    case 'best-selling': return arr.sort((a, b) => (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0));
    case 'price-asc':  return arr.sort((a, b) => safePrice(a) - safePrice(b));
    case 'price-desc': return arr.sort((a, b) => safePrice(b) - safePrice(a));
    case 'newest':     return arr.sort((a, b) => {
      const ta = new Date(a.createdAt || a.updatedAt || 0).getTime() || 0;
      const tb = new Date(b.createdAt || b.updatedAt || 0).getTime() || 0;
      return tb - ta;
    });
    case 'oldest':     return arr.sort((a, b) => {
      const ta = new Date(a.createdAt || a.updatedAt || 0).getTime() || 0;
      const tb = new Date(b.createdAt || b.updatedAt || 0).getTime() || 0;
      return ta - tb;
    });
    case 'name-asc':   return arr.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    );
    // Biggest percentage off first; full-price items after, newest first.
    case 'discount': {
      const off = (p) => hasSalePrice(p) ? (Number(p.price) - Number(p.salePrice)) / Number(p.price) : 0;
      const time = (p) => new Date(p.createdAt || p.updatedAt || 0).getTime() || 0;
      return arr.sort((a, b) => off(b) - off(a) || time(b) - time(a));
    }
    default: return products;
  }
}

function setSortBy(value) {
  S.sortBy = value;
  updateSortControl();
  if (S.saleMode) renderSaleProducts();
  else if (S.newInMode) renderNewInProducts();
  else if (S.currentPage === 'category') renderCategoryProducts();
  else if (S.currentPage === 'vendor') renderVendorPage(S.currentVendor);
  else renderAllProducts();
}

function merchandiseProducts(products, context, sortBy) {
  if (!products || !products.length) return [];
  const filtered = products.filter(p => p.id !== LEATHER_POUCH_ID || isLeatherPouchAllowed(context));
  const sorted = [...filtered].sort((a, b) => {
    const oA = JDTaxonomy.order(a.category);
    const oB = JDTaxonomy.order(b.category);
    if (oA !== oB) return oA - oB;
    const pA = Number(hasSalePrice(a) ? a.salePrice : a.price);
    const pB = Number(hasSalePrice(b) ? b.salePrice : b.price);
    const sA = Number.isFinite(pA) ? pA : 0;
    const sB = Number.isFinite(pB) ? pB : 0;
    return sA - sB;
  });
  return applySort(sorted, sortBy);
}

function productGridLoadingSkeleton(count) {
  const total = Math.max(2, Math.min(12, Number(count) || 6));
  return '<div class="product-grid product-grid-loading" aria-label="Loading products" aria-busy="true">' +
    Array.from({ length: total }, function () {
      return '<div class="product-card product-card-loading" aria-hidden="true"><div class="product-img-wrap"></div><div class="product-home-meta"><div class="loading-bar loading-bar-brand content-shimmer"></div><div class="loading-bar loading-bar-title content-shimmer"></div><div class="loading-bar loading-bar-price content-shimmer"></div></div></div>';
    }).join('') + '</div>';
}
function brandPageLoadingSkeleton() {
  return '<div class="brand-page-skeleton" aria-label="Loading brand page" aria-busy="true">' +
    '<div class="brand-skeleton-bar"><span class="brand-skeleton-logo content-shimmer"></span><span class="brand-skeleton-name"><i class="content-shimmer"></i><i class="content-shimmer"></i></span></div>' +
    '<div class="brand-skeleton-hero content-shimmer"></div>' +
    '<div class="brand-skeleton-tabs"><i class="content-shimmer"></i><i class="content-shimmer"></i><i class="content-shimmer"></i></div>' +
    '<div class="brand-skeleton-section"><i class="content-shimmer"></i></div>' +
    productGridLoadingSkeleton(6) +
    '<div class="brand-skeleton-section"><i class="content-shimmer"></i></div>' +
    '<div class="brand-skeleton-tiles"><i class="content-shimmer"></i><i class="content-shimmer"></i><i class="content-shimmer"></i></div>' +
    '</div>';
}
function showLoading(container) { if (container) container.innerHTML = productGridLoadingSkeleton(6); }

// ── FILTERS ──────────────────────────────────────────────────
// Filters available: category, brand, size, on-sale, in-stock.
// The old R500 price band filter is removed entirely.

function passesCommonFilters(p, f) {
  if (f.size && f.size !== 'all' && !(p.sizes || []).includes(f.size)) return false;
  if (f.sizes && f.sizes.length && !(p.sizes || []).some(s => f.sizes.includes(s))) return false;
  if (f.colors && f.colors.length && !productColors(p).some(c => f.colors.includes(c))) return false;
  if (f.genders && f.genders.length && !f.genders.some(g => JDTaxonomy.forGender(p, g))) return false;
  if (f.onSale && !hasSalePrice(p)) return false;
  if (f.inStock && (Number(p.stock) || 0) <= 0) return false;
  return true;
}

function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (p.status !== 'active') return false;
    if (S.filter.cat.length && !S.filter.cat.includes(p.category)) return false;
    if (S.filter.vendor.length && !S.filter.vendor.includes(p.brand)) return false;
    return passesCommonFilters(p, S.filter);
  });
}

function getCatFilteredProducts() {
  const dept = JDTaxonomy.department(S.currentCategoryPage);
  const isAll = S.currentCategoryPage === 'all';

  return PRODUCTS.filter(p => {
    if (p.status !== 'active') return false;
    if (S.currentCollectionHandle) {
      const collection = S.currentCollectionData ||
        (window._publishedCollections || []).find(function (item) {
          return String(item.handle || item.slug || item.id) === S.currentCollectionHandle;
        });
      if (!productBelongsToCollection(p, collection)) return false;
      if (S.shopGroup && isGenderPage() && !inShopGroup(p, S.shopGroup)) return false;
    }
    if (p.id === LEATHER_POUCH_ID && S.currentCategoryPage !== 'sunglasses' && !S.currentCollectionHandle) return false;
    if (S.catFilter.vendor.length && !S.catFilter.vendor.includes(p.brand)) return false;

    if (!S.currentCollectionHandle) {
      if (dept) {
        if (!isInDepartment(p, dept.slug)) return false;
      } else if (!isAll && S.currentCategoryPage && p.category !== S.currentCategoryPage) {
        return false;
      }
    }

    // Narrow further to specific subcategories picked in the filter panel
    // (e.g. "Tops" while browsing All Clothing) — previously ignored, so
    // picking a subcategory here had no effect on the results at all.
    if (S.catFilter.cat.length && !S.catFilter.cat.includes(p.category)) return false;

    return passesCommonFilters(p, S.catFilter);
  });
}

// Every active product actually belonging to this brand — same
// matching logic renderVendorPage() always used (vendorId match, or
// normalized brand name match as a fallback). No facet filters
// applied yet; that's getVendorFilteredProducts() below.
function getVendorBaseProducts(vendor) {
  if (!vendor) return [];
  const brandName = vendor?.brand || vendor?.name || '';
  const normalizedBrandName = normalizeBrandName(brandName);
  return PRODUCTS.filter(p => {
    if (p.status !== 'active') return false;
    if (vendor?.id && p.vendorId === vendor.id) return true;
    if (p.brand && brandName && normalizeBrandName(p.brand) === normalizedBrandName) return true;
    return false;
  });
}

function getVendorFilteredProducts(vendor) {
  return getVendorBaseProducts(vendor).filter(p => {
    if (S.vendorFilter.cat.length && !S.vendorFilter.cat.includes(p.category)) return false;
    return passesCommonFilters(p, S.vendorFilter);
  });
}

// Multi-brand stores (ASOS, Superbalist, COS) let shoppers pick more
// than one value per facet — e.g. two brands at once — rather than
// forcing an either/or choice, so category/brand are toggled in and
// out of a list instead of being replaced by a single value.
// Facets picked from a list (several at once); the rest are on/off.
const ARRAY_FILTERS = ['cat', 'vendor', 'sizes', 'colors', 'genders'];
function toggleArrayFilter(filterObj, type, value) {
  const arr = filterObj[type] || (filterObj[type] = []);
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value); else arr.splice(idx, 1);
}

function applyFilter(type, value) {
  if (ARRAY_FILTERS.includes(type)) toggleArrayFilter(S.filter, type, value);
  else S.filter[type] = value;
  if (S.saleMode) renderSaleProducts();
  else if (S.newInMode) renderNewInProducts();
  else renderAllProducts();
}

function applyCatFilter(type, value) {
  if (ARRAY_FILTERS.includes(type)) toggleArrayFilter(S.catFilter, type, value);
  else S.catFilter[type] = value;
  renderCategoryProducts();
}

function applyVendorFilter(type, value) {
  if (ARRAY_FILTERS.includes(type)) toggleArrayFilter(S.vendorFilter, type, value);
  else S.vendorFilter[type] = value;
  renderVendorPage(S.currentVendor);
}

function clearAllCollectionFilters() {
  if (S.currentPage === 'category') {
    S.catFilter = {cat:[], size:'all', vendor:[], onSale:false, inStock:false};
    renderCategoryProducts();
  } else if (S.currentPage === 'vendor') {
    S.vendorFilter = {cat:[], size:'all', vendor:[], onSale:false, inStock:false};
    renderVendorPage(S.currentVendor);
  } else {
    S.filter = {cat:[], size:'all', vendor:[], onSale:false, inStock:false};
    if (S.saleMode) renderSaleProducts();
    else if (S.newInMode) renderNewInProducts();
    else renderAllProducts();
  }
}

function toggleFilterDropdown(source) {
  const id = source === 'category' ? 'filter-options-category' : 'filter-options-products';
  const el = document.getElementById(id);
  if(!el) return;

  if (el._outsideClickHandler) {
    document.removeEventListener("click", el._outsideClickHandler);
    el._outsideClickHandler = null;
  }

  const isOpen = el.classList.toggle("open");
  if (!isOpen) return;

  const handler = function(e) {
    if(!el.contains(e.target) && !e.target.classList.contains("filter-trigger")) {
      el.classList.remove("open");
      document.removeEventListener("click", handler);
      el._outsideClickHandler = null;
    }
  };
  el._outsideClickHandler = handler;
  setTimeout(() => document.addEventListener("click", handler), 10);
}

function toggleCollectionSort() {
  const panel = document.getElementById('collection-sort-options');
  const trigger = document.getElementById('collection-sort-trigger');
  if (!panel || !trigger) return;
  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open', opening);
  trigger.setAttribute('aria-expanded', String(opening));
}

// The Sort button's label and the menu's options, with the picked one
// marked.
function updateSortControl() {
  const current = SORT_OPTIONS.some(o => o.v === S.sortBy) ? S.sortBy : 'newest';
  const label = document.getElementById('collection-sort-label');
  if (label) label.textContent = SORT_OPTIONS.find(o => o.v === current).l.toUpperCase();
  const panel = document.getElementById('collection-sort-options');
  if (panel) panel.innerHTML = SORT_OPTIONS.map(o => `<button type="button" class="${o.v === current ? 'is-selected' : ''}" aria-pressed="${o.v === current}" onclick="chooseCollectionSort('${o.v}')">${escapeHTML(o.l)}</button>`).join('');
}
document.addEventListener('DOMContentLoaded', updateSortControl);

function chooseCollectionSort(value) {
  setSortBy(value);
  const panel = document.getElementById('collection-sort-options');
  const trigger = document.getElementById('collection-sort-trigger');
  if (panel) panel.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', function (event) {
  const dropdown = document.querySelector('.collection-sort-dropdown');
  const panel = document.getElementById('collection-sort-options');
  const trigger = document.getElementById('collection-sort-trigger');
  if (dropdown && panel && !dropdown.contains(event.target)) {
    panel.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }
});

// Opens the full-screen filters with the sections that have picks (or
// the first one) open; Done or × closes them.
function toggleCollectionFilter() {
  const el = document.getElementById('collection-filter-options');
  if(!el) return;
  const opening = !el.classList.contains('open');
  if (opening) {
    _filterOpenSections = null; renderFilterPanel();
    // Opens at the top, however far it was scrolled last time.
    const body = el.querySelector('.collection-filter-body');
    if (body) body.scrollTop = 0;
  }
  el.classList.toggle('open', opening);
  document.body.style.overflow = opening ? 'hidden' : '';
}

// Products update behind the filters as options are picked; the panel
// stays open until Done.
function applyCollectionFilter(type, value) {
  if (S.currentPage === 'products') { applyFilter(type, value); }
  else if (S.currentPage === 'category') { applyCatFilter(type, value); }
  else if (S.currentPage === 'vendor') { applyVendorFilter(type, value); }
  updateCollectionGridIcon();
}

function toggleCollectionGrid() {
  if (S.currentPage === 'products') { toggleGrid(); }
  else if (S.currentPage === 'category') { toggleGridCat(); }
  else if (S.currentPage === 'vendor') { toggleGridVendor(); }
  updateCollectionGridIcon();
}

function updateCollectionGridIcon() {
  const icon = document.getElementById('col-grid-icon');
  if (!icon) return;
  let cols;
  if (S.currentPage === 'products') { cols = S.gridCols || 2; }
  else if (S.currentPage === 'category') { cols = S.gridColsCat || 2; }
  else if (S.currentPage === 'vendor') { cols = S.gridColsVendor || 2; }
  else { cols = 2; }
  icon.classList.remove('cols-1', 'cols-2', 'cols-3');
  if (cols === 1) { icon.classList.add('cols-1'); }
  else if (cols === 3) { icon.classList.add('cols-3'); }
  else { icon.classList.add('cols-2'); }
}

// Collection pages: as soon as the page scrolls down, the header (and its
// search bar) slides away and the Sort/Filter toolbar becomes the sticky
// top bar; scrolling up at any point brings the header straight back, with
// the toolbar sticking under it again (collection.css). Back at the very
// top the header always shows.
let _collectionLastY = 0;
function updateCollectionBarStuck() {
  const y = window.scrollY;
  const delta = y - _collectionLastY;
  const reached = document.body.classList.contains('on-collection-page') && y > 0;
  let stuck = document.body.classList.contains('collection-bar-stuck');
  if (!reached) stuck = false;
  else if (delta > 4) stuck = true;      // scrolling down
  else if (delta < -4) stuck = false;    // scrolling up
  // Small jitters (bounce, momentum) neither hide nor show it.
  if (Math.abs(delta) > 4 || !reached) _collectionLastY = y;
  document.body.classList.toggle('collection-bar-stuck', !!stuck);
}
let _collectionBarTick = false;
window.addEventListener('scroll', () => {
  if (_collectionBarTick) return;
  _collectionBarTick = true;
  requestAnimationFrame(() => { _collectionBarTick = false; updateCollectionBarStuck(); });
}, { passive: true });

// Collection pages show each product name on one line: whole words only,
// as many as fit the card, the rest left off (the product page has the
// full name). Re-runs when a grid is redrawn or the screen size changes.
const FIT_TITLE_GRIDS = '#all-products-grid, #category-products-grid, #vendor-products-grid';
function fitCollectionCardTitles() {
  document.querySelectorAll(FIT_TITLE_GRIDS).forEach(grid => {
    grid.querySelectorAll('.product-title').forEach(el => {
      if (!el.dataset.fullName) el.dataset.fullName = el.textContent.trim();
      const full = el.dataset.fullName;
      // Keyed on the row's width, which doesn't change when the name is cut.
      const width = el.parentElement ? el.parentElement.clientWidth : el.clientWidth;
      if (!width || el.dataset.fitWidth === String(width)) return;
      el.dataset.fitWidth = String(width);
      el.title = full;
      const words = full.split(/\s+/);
      el.textContent = full;
      let n = words.length;
      while (n > 1 && el.scrollWidth > el.clientWidth) el.textContent = words.slice(0, --n).join(' ');
    });
  });
}
let _fitTitlesQueued = false;
function queueFitCollectionCardTitles() {
  if (_fitTitlesQueued) return;
  _fitTitlesQueued = true;
  requestAnimationFrame(() => { _fitTitlesQueued = false; fitCollectionCardTitles(); });
}
new MutationObserver(mutations => {
  if (mutations.some(m => m.target.closest && m.target.closest(FIT_TITLE_GRIDS))) queueFitCollectionCardTitles();
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', queueFitCollectionCardTitles);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFitCollectionCardTitles);

function updateCollectionTitle() {
  updateCollectionBarStuck();
  const titleEl = document.getElementById('collection-filter-title-display');
  const headingEl = document.getElementById('collection-page-heading');
  const countEl = document.getElementById('collection-product-count');
  const descEl = document.getElementById('collection-top-description');
  const bcEl = document.getElementById('collection-page-breadcrumb');
  if (!titleEl && !headingEl) return;

  // Pages show a heading, never a description or collection image.
  // Brand pages show no heading either.
  let title = 'All products';

  // The category tree's name (taxonomy.js) is only the fallback shown
  // before admin-pages.js's siteContent/collectionPages has loaded (or for
  // a page nobody's customized) — window._siteContent.collectionPages[slug]
  // overrides it once site-content.js's fetch resolves. Clothing and
  // Accessories copy may still be saved under their old all-clothing /
  // all-accessories keys.
  // Titles typed in the admin show exactly as typed; these defaults and
  // the category names are already in sentence case.
  const fixedTitles = { 'all': 'All products', 'sale': 'Sale', 'newin': 'New in' };
  const oldKeys = { clothing: 'all-clothing', accessories: 'all-accessories' };
  const collectionPages = (window._siteContent && window._siteContent.collectionPages) || {};
  function collectionCopyFor(slug) {
    const custom = collectionPages[slug] || collectionPages[oldKeys[slug]] || {};
    return { title: (custom.title || '').trim() || fixedTitles[slug] || JDTaxonomy.label(slug) };
  }

  if (S.currentPage === 'vendor') {
    // Brand pages have their brand bar instead of a heading.
    title = '';
  } else if (S.currentCollectionHandle && S.currentCollectionData) {
    const collection = S.currentCollectionData;
    title = String(collection.title || collection.name || collection.handle || S.currentCollectionHandle);
    // Women or Men opened on one section from the menu: "Men’s shoes",
    // "New in for men".
    const gr = isGenderPage() && S.shopGroup && SHOP_GROUPS.find(x => x.key === S.shopGroup);
    if (gr) {
      const g = collection.gender;
      title = gr.key === 'new' ? 'New in for ' + g : (g === 'men' ? 'Men’s ' : 'Women’s ') + shopGroupName(gr, g).toLowerCase();
    }
  } else if (S.currentPage === 'products') {
    title = collectionCopyFor(S.saleMode ? 'sale' : (S.newInMode ? 'newin' : 'all')).title;
  } else if (S.currentPage === 'category' && S.currentCategoryPage) {
    title = collectionCopyFor(S.currentCategoryPage).title;
  } else {
    if (titleEl) titleEl.style.display = 'none';
    if (headingEl) headingEl.style.display = 'none';
    if (countEl) countEl.textContent = '';
    if (descEl) descEl.style.display = 'none';
    if (bcEl) bcEl.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.style.display = 'none';
    titleEl.textContent = title;
  }
  if (headingEl) {
    headingEl.textContent = title;
    headingEl.style.display = title ? 'block' : 'none';
  }
  if (countEl) {
    let countProducts = [];
    if (S.currentPage === 'vendor') countProducts = getVendorFilteredProducts(S.currentVendor);
    else if (S.currentPage === 'category') countProducts = getCatFilteredProducts();
    else {
      countProducts = getFilteredProducts();
      if (S.saleMode) countProducts = countProducts.filter(hasSalePrice);
      else if (S.newInMode) countProducts = countProducts.filter(function (p) { return typeof isProductNew === 'function' && isProductNew(p); });
    }
    countProducts = merchandiseProducts(countProducts, S.currentPage === 'category' ? S.currentCategoryPage : (S.currentPage === 'vendor' ? 'vendor' : undefined));
    const count = countProducts.length;
    countEl.textContent = count + (count === 1 ? ' product' : ' products');
  }

  if (descEl) descEl.style.display = 'none';

  // No breadcrumb trail on collection or brand pages (the brand bar has
  // the brand's own menu).
  if (bcEl) {
    bcEl.classList.remove('has-icons');
    bcEl.innerHTML = '';
  }
}

// Standard faceted-search behavior (ASOS, Superbalist, COS): each facet
// is multi-select (OR within the facet), option counts are computed
// against every OTHER active filter so a shopper can see what picking one
// would actually do, and any option that would return zero results is
// hidden outright rather than shown as a dead end.

function currentFilterState() {
  return S.currentPage === 'vendor' ? S.vendorFilter : (S.currentPage === 'category' ? S.catFilter : S.filter);
}

// Every product the current page lists before any filter is picked.
function filterPagePool() {
  if (S.currentPage === 'vendor') return getVendorBaseProducts(S.currentVendor);
  const empty = { cat: [], size: 'all', vendor: [], onSale: false, inStock: false };
  if (S.currentPage === 'category') {
    const saved = S.catFilter; S.catFilter = empty;
    try { return getCatFilteredProducts(); } finally { S.catFilter = saved; }
  }
  const saved = S.filter; S.filter = empty;
  let pool;
  try { pool = getFilteredProducts(); } finally { S.filter = saved; }
  if (S.saleMode) pool = pool.filter(hasSalePrice);
  else if (S.newInMode) pool = pool.filter(p => typeof isProductNew === 'function' && isProductNew(p));
  return pool;
}

// Passes every picked filter except `skip` (the facet being counted).
function passesFacets(p, f, skip) {
  if (skip !== 'cat' && f.cat.length && !f.cat.includes(p.category)) return false;
  if (skip !== 'vendor' && f.vendor.length && !f.vendor.includes(p.brand)) return false;
  if (skip !== 'sizes' && f.sizes && f.sizes.length && !(p.sizes || []).some(s => f.sizes.includes(s))) return false;
  if (skip !== 'colors' && f.colors && f.colors.length && !productColors(p).some(c => f.colors.includes(c))) return false;
  if (skip !== 'genders' && f.genders && f.genders.length && !f.genders.some(g => JDTaxonomy.forGender(p, g))) return false;
  if (skip !== 'onSale' && f.onSale && !hasSalePrice(p)) return false;
  if (skip !== 'inStock' && f.inStock && (Number(p.stock) || 0) <= 0) return false;
  return true;
}

// A product's colours, from its variants ("Default" is no colour).
function productColors(p) {
  return [...new Set((p.variants || []).map(v => String(v.color || '').trim()).filter(c => c && c.toLowerCase() !== 'default'))];
}

function filterCategoryLabel(cat) { return JDTaxonomy.label(cat); }

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
function compareSizes(a, b) {
  const ia = SIZE_ORDER.indexOf(String(a).toUpperCase()), ib = SIZE_ORDER.indexOf(String(b).toUpperCase());
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  const na = parseFloat(String(a).replace(/[^\d.]/g, '')), nb = parseFloat(String(b).replace(/[^\d.]/g, ''));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

// Which sections are open; null means "work it out" (on opening).
let _filterOpenSections = null;
function toggleFilterSection(key) {
  if (_filterOpenSections.has(key)) _filterOpenSections.delete(key); else _filterOpenSections.add(key);
  renderFilterPanel();
}

function renderFilterPanel() {
  const body = document.getElementById('collection-filter-sections');
  if (!body) return;
  const f = currentFilterState();
  const pool = filterPagePool();
  const count = (skip, test) => pool.filter(p => test(p) && passesFacets(p, f, skip)).length;
  const sections = [];

  // Category: the categories this page covers.
  let cats = [...new Set(pool.map(p => p.category).filter(Boolean))];
  cats.sort((a, b) => (JDTaxonomy.order(a) - JDTaxonomy.order(b)) || String(a).localeCompare(String(b)));
  sections.push({ key: 'cat', title: 'Category', options: cats.map(c => ({ value: c, label: filterCategoryLabel(c), picked: f.cat.includes(c), count: count('cat', p => p.category === c) })) });

  // Gender: only once the list has more than one (womenswear only so far
  // needs no filter).
  const genders = [...new Set(pool.map(p => JDTaxonomy.genderOf(p)))];
  if (genders.length > 1 || (f.genders || []).length) {
    sections.push({ key: 'genders', title: 'Gender', options: JDTaxonomy.GENDERS.filter(g => genders.includes(g[0])).map(([g, label]) => ({ value: g, label, picked: (f.genders || []).includes(g), count: count('genders', p => JDTaxonomy.forGender(p, g)) })) });
  }

  // Brands: not on a brand's own page.
  if (S.currentPage !== 'vendor') {
    const brands = [...new Set(pool.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    sections.push({ key: 'vendor', title: 'Brands', options: brands.map(b => ({ value: b, label: b, picked: f.vendor.includes(b), count: count('vendor', p => p.brand === b) })) });
  }

  // One size section per kind of size (Clothing sizes, Shoe sizes, Kids'
  // sizes; taxonomy.js), all picking from the same size filter. 'OS' is
  // the one-size placeholder, never a real size.
  const sizesByKind = new Map();
  pool.forEach(p => {
    const kind = JDTaxonomy.sizeSystem(p.category) || 'other';
    (p.sizes || []).forEach(sz => {
      if (!sz || sz === 'OS') return;
      if (!sizesByKind.has(kind)) sizesByKind.set(kind, new Set());
      sizesByKind.get(kind).add(sz);
    });
  });
  const kinds = Object.keys(JDTaxonomy.SIZE_SYSTEMS).filter(k => sizesByKind.has(k)).concat(sizesByKind.has('other') ? ['other'] : []);
  kinds.forEach(kind => {
    const title = kinds.length === 1 ? 'Size' : (JDTaxonomy.SIZE_SYSTEMS[kind] ? JDTaxonomy.SIZE_SYSTEMS[kind].label : 'Other sizes');
    const inKind = p => (JDTaxonomy.sizeSystem(p.category) || 'other') === kind;
    sections.push({ key: 'sizes-' + kind, filter: 'sizes', title, options: [...sizesByKind.get(kind)].sort(compareSizes).map(sz => ({ value: sz, label: sz, picked: (f.sizes || []).includes(sz), count: count('sizes', p => inKind(p) && (p.sizes || []).includes(sz)) })) });
  });

  const swatches = {};
  pool.forEach(p => (p.variants || []).forEach(v => { const c = String(v.color || '').trim(); if (c && !swatches[c] && v.swatch) swatches[c] = v.swatch; }));
  const colors = [...new Set(pool.flatMap(productColors))].sort((a, b) => a.localeCompare(b));
  sections.push({ key: 'colors', title: 'Colour', options: colors.map(c => ({ value: c, label: c, swatch: swatches[c], picked: (f.colors || []).includes(c), count: count('colors', p => productColors(p).includes(c)) })) });

  sections.push({ key: 'availability', title: 'Availability', options: [
    { type: 'onSale', label: 'On sale', picked: !!f.onSale, count: count('onSale', hasSalePrice) },
    { type: 'inStock', label: 'In stock', picked: !!f.inStock, count: count('inStock', p => (Number(p.stock) || 0) > 0) }
  ] });

  // Hide options (and whole sections) that would show nothing.
  sections.forEach(sec => { sec.options = sec.options.filter(o => o.picked || o.count > 0); });
  const shown = sections.filter(sec => sec.options.length);

  if (!_filterOpenSections) {
    _filterOpenSections = new Set(shown.filter(sec => sec.options.some(o => o.picked)).map(sec => sec.key));
    if (!_filterOpenSections.size && shown[0]) _filterOpenSections.add(shown[0].key);
  }

  body.innerHTML = shown.length ? shown.map(sec => {
    const open = _filterOpenSections.has(sec.key);
    const picked = sec.options.filter(o => o.picked).length;
    return `<div class="filter-section${open ? ' open' : ''}">
      <button type="button" class="filter-section-head" aria-expanded="${open}" onclick="toggleFilterSection('${sec.key}')">
        <span>${escapeHTML(sec.title)}${picked ? ` <span class="filter-section-picked">(${picked})</span>` : ''}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${open ? `<div class="filter-section-options">${sec.options.map(o => {
        const action = o.type ? `applyCollectionFilter('${o.type}', ${!o.picked})` : `applyCollectionFilter('${sec.filter || sec.key}','${escapeJSString(o.value)}')`;
        const swatch = o.swatch ? `<span class="filter-swatch" style="background:${escapeHTML(o.swatch)}"></span>` : '';
        return `<button type="button" class="filter-choice${o.picked ? ' picked' : ''}" aria-pressed="${o.picked}" onclick="${escapeHTML(action)}"><span class="filter-tick" aria-hidden="true"></span>${swatch}<span class="filter-choice-label">${escapeHTML(o.label)}</span><span class="filter-option-count">${o.count}</span></button>`;
      }).join('')}</div>` : ''}
    </div>`;
  }).join('') : '<div class="filter-empty-note">No filters available</div>';
}

// Chips for every active filter value, shown above the grid (outside
// the slide-out filter panel) so a shopper always sees what's applied
// without opening it — same pattern as ASOS/Superbalist's applied-filter
// row. Clicking a chip removes just that value; "Clear all" resets
// everything at once.
// The filters picked, as a trail under the page heading: the page, the
// category's department, the category, then any other filters, e.g.
// "Women / Accessories / Heels / Size 6". Changed from the Filter
// panel; the page's name clears them.
function renderActiveFilterChips() {
  const container = document.getElementById('active-filter-chips');
  if (!container) return;

  const isCategoryPage = S.currentPage === 'category';
  const f = S.currentPage === 'vendor' ? S.vendorFilter : (isCategoryPage ? S.catFilter : S.filter);

  const parts = [];
  if (f.cat.length) {
    const depts = [...new Set(f.cat.map(c => JDTaxonomy.departmentOf(c)).filter(Boolean))];
    const pageDept = JDTaxonomy.departmentOf(S.currentCategoryPage);
    // The department, unless the page already is that department.
    if (depts.length === 1 && depts[0] !== pageDept && !f.cat.includes(depts[0])) parts.push(JDTaxonomy.label(depts[0]));
    parts.push(f.cat.map(filterCategoryLabel).join(', '));
  }
  (f.vendor || []).forEach(brand => parts.push(brand));
  (f.sizes || []).forEach(size => parts.push('Size ' + size));
  (f.colors || []).forEach(color => parts.push(color));
  (f.genders || []).forEach(g => parts.push(JDTaxonomy.genderLabel(g)));
  if (f.onSale) parts.push('On sale');
  if (f.inStock) parts.push('In stock');

  if (!parts.length) { container.innerHTML = ''; return; }

  const heading = document.getElementById('collection-page-heading');
  const page = (heading && heading.textContent.trim()) || 'All products';
  const sep = '<span class="filter-trail-sep" aria-hidden="true">/</span>';
  container.innerHTML = `<nav class="filter-trail" aria-label="Filters"><button type="button" class="filter-trail-link" onclick="clearAllCollectionFilters()">${escapeHTML(page)}</button>` +
    parts.map((p, i) => sep + `<span class="${i === parts.length - 1 ? 'filter-trail-current' : 'filter-trail-item'}">${escapeHTML(p)}</span>`).join('') + '</nav>';
}

function applyEditorialGrid(gridEl, cols) {
  if (!gridEl) return;
  gridEl.classList.remove('editorial-1col', 'editorial-2col', 'editorial-3col');
  gridEl.classList.add('editorial-' + cols + 'col');
  const cards = gridEl.querySelectorAll('.product-card');
  cards.forEach((card, i) => {
    card.classList.remove('featured-card', 'tall-card');
    if (cols === 2) {
      if (i === 1 || i === 6 || i === 11) card.classList.add('featured-card');
      if (i === 3 || i === 8) card.classList.add('tall-card');
    }
  });
}

function updateGridToggleSVG(svgId, cols) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.classList.remove('cols-1', 'cols-2', 'cols-3');
  svg.classList.add('cols-' + cols);
  svg.querySelectorAll('.grid-block').forEach((b, i) => { b.classList.toggle('active', i < cols); });
  updateCollectionGridIcon();
}

function expandProductVariants(products) {
  // Each product renders as exactly one card regardless of how many
  // color variants it has — a "+N colors" label on the card (see
  // productCard()/productCardHome()) surfaces the extra variants
  // instead of duplicating the product into one card per variant.
  return products.map(p => ({ product: p, variantIndex: 0 }));
}

// ==================== PAGINATION (6 PER PAGE) ====================
// Shared by the All products, Category, and Sale grids. Page N shows
// exactly products [(N-1)*6, N*6) — a real discrete page, not a
// cumulative "load more" list — with a plain "Page N of M" footer
// (arrow controls either side, no product count), hidden entirely
// when there are 6 or fewer products (nothing to page through).
// Keyed by the grid element's id so All products and Sale (which
// share #all-products-grid) don't bleed into each other's state.
// renderXProducts() always calls this with the full, already-
// filtered/sorted list, so every call resets back to page 1 — a
// fresh filter/sort/grid-toggle is meant to reset paging, not keep
// whatever page a previous list left off on.
const PRODUCTS_PER_PAGE = 6;
const _gridCurrentPage = {};

// Flat #f4f4f4 box, no shimmer (nothing is ever going to load into it),
// literal "Brand"/"Product name"/"00" text — shown instead of a real
// card wherever a grid has no products at all, so an empty catalog
// never looks broken or blank. Same count (6) as a full page of
// PRODUCTS_PER_PAGE above. Clickable through to a placeholder product
// page (previewPlaceholderProduct() below) so the product page itself
// can be designed before any real product exists.
function placeholderProductCard() {
  return `
    <div class="product-card product-card-placeholder" onclick="previewPlaceholderProduct()">
      <div class="product-img-wrap"></div>
      <div class="product-brand">Brand</div>
      <div class="product-card-name-row"><div class="product-title">Product name</div></div>
      <div class="product-price-row"><span class="product-price">00</span></div>
    </div>`;
}
function placeholderProductCardHome() {
  return `
    <div class="product-card product-card-placeholder" onclick="previewPlaceholderProduct()">
      <div class="product-img-wrap"></div>
      <div class="product-home-meta">
        <div class="product-brand">Brand</div>
        <div class="product-home-name-row"><div class="product-title">Product name</div></div>
        <div class="product-home-price-row"><span class="product-home-price">00</span></div>
      </div>
    </div>`;
}
function placeholderProductCards(count, home) {
  const one = home ? placeholderProductCardHome : placeholderProductCard;
  return Array.from({ length: count }, one).join('');
}

// A synthetic, never-saved product — exists only so the real product
// page template (renderProductPage(), product-detail.js) has something
// to render for the "Brand"/"Product name" cards above. stock:1 keeps
// it out of the sold-out treatment (that's not what's being previewed
// here); empty variant images fall through to PLACEHOLDER_IMAGE
// (app.js), which is the same #f4f4f4 box now. Never written to
// PRODUCTS or Firestore — goToProduct()'s normal PRODUCTS.find() has
// no way to reach it, which is exactly why this needs its own entry
// point instead of just calling goToProduct() with a fake id.
const PLACEHOLDER_PRODUCT = {
  id: '__placeholder__',
  name: 'Product name',
  brand: 'Brand',
  category: '',
  price: 0,
  salePrice: null,
  badge: null,
  sizes: [],
  stock: 1,
  status: 'draft',
  featured: false,
  description: '',
  productFeatures: '',
  compositionCare: '',
  shippingReturns: '',
  measurements: '',
  variants: [{ color: '', swatch: '#f4f4f4', images: { model: [], ghost: [], detail: [] } }]
};

function previewPlaceholderProduct() {
  closeFilterPanel();
  closeSearch();
  S.saleMode = false;
  S.newInMode = false;
  if (DOM.mainNav) { DOM.mainNav.classList.add('product-page'); DOM.mainNav.classList.remove('collection-page'); }
  document.body.classList.remove('on-collection-page');
  renderProductPage(PLACEHOLDER_PRODUCT);
}

// Same idea as PLACEHOLDER_PRODUCT above, for the /brands empty-state
// cards (placeholderBrandCardsHtml(), vendors.js). id:'__placeholder__'
// keeps getVendorBaseProducts() from matching any real product, so the
// preview's grid falls through to its own placeholder product cards.
const PLACEHOLDER_VENDOR = {
  id: '__placeholder__',
  name: 'Brand',
  brand: 'Brand',
  slug: '',
  heroImageUrl: '',
  logoUrl: '',
  description: ''
};

// Mirrors previewPlaceholderProduct() — lets a brand's page be designed
// before any real vendor exists. Unlike navigateToVendor(), there's no
// Firestore doc to fetch and no URL to push, so this just does the
// page-activation/filter-bar bookkeeping navigateToVendor() would
// normally do, then renders straight from the placeholder.
function previewPlaceholderVendor() {
  closeSearch();
  S.saleMode = false;
  S.newInMode = false;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-vendor").classList.add("active");
  S.currentPage = "vendor";
  removeStickyBar();
  if (DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  document.body.classList.add('on-collection-page');
  S.currentVendorId = null;
  S.vendorFilter = {cat:[], size:'all', vendor:[], onSale:false, inStock:false};
  S.gridColsVendor = 2;
  restoreCollectionFilterBar();
  S.currentVendor = PLACEHOLDER_VENDOR;
  renderVendorPage(PLACEHOLDER_VENDOR);
  resetScrollToTop();
  ensureNavScrolled();
  updateChatVisibility();
}

function renderPaginatedGrid(gridEl, expanded, cols) {
  if (!gridEl) return;
  const key = gridEl.id;
  const total = expanded.length;
  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));

  function renderPage(pageNum) {
    pageNum = Math.max(1, Math.min(pageNum, totalPages));
    _gridCurrentPage[key] = pageNum;

    const start = (pageNum - 1) * PRODUCTS_PER_PAGE;
    const end = Math.min(start + PRODUCTS_PER_PAGE, total);
    const pageItems = expanded.slice(start, end);

    if (total === 0) {
      gridEl.innerHTML = placeholderProductCards(PRODUCTS_PER_PAGE);
    } else {
      gridEl.innerHTML = pageItems.map(({product, variantIndex}, i) => productCard(product, cols===3, true, variantIndex, pageNum === 1 && i < 4 && (i === 0 ? 'high' : true), true)).join("");
      applyEditorialGrid(gridEl, cols);
    }

    const existingFooter = gridEl.parentNode && gridEl.parentNode.querySelector('.grid-pagination[data-for="' + key + '"]');
    if (existingFooter) existingFooter.remove();

    if (total <= PRODUCTS_PER_PAGE) return; // nothing to page through

    const footer = document.createElement('div');
    footer.className = 'grid-pagination';
    footer.setAttribute('data-for', key);
    footer.innerHTML =
      '<button class="grid-pagination-arrow" type="button" aria-label="Previous page"' + (pageNum <= 1 ? ' disabled' : '') + '>&#8249;</button>' +
      '<span class="grid-pagination-status">Page ' + pageNum + ' of ' + totalPages + '</span>' +
      '<button class="grid-pagination-arrow" type="button" aria-label="Next page"' + (pageNum >= totalPages ? ' disabled' : '') + '>&#8250;</button>';
    gridEl.insertAdjacentElement('afterend', footer);

    const [prevBtn, nextBtn] = footer.querySelectorAll('.grid-pagination-arrow');
    prevBtn.addEventListener('click', () => { renderPage(pageNum - 1); gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    nextBtn.addEventListener('click', () => { renderPage(pageNum + 1); gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  renderPage(1);
}

// The photo a card swipes to (collection pages only): the next of the
// product's photos after the one the card shows, which may be another
// colour's when this colour has just one. '' when there's no other.
function cardSecondPhoto(p, vi, shown) {
  const gal = getProductGallery(p);
  if (gal.images.length < 2) return '';
  const start = galleryStart(gal, vi);
  for (let k = 0; k < gal.images.length; k++) {
    const u = gal.images[(start + k) % gal.images.length];
    if (u !== shown) return u;
  }
  return '';
}

// swipe: collection grids (renderPaginatedGrid) let shoppers swipe a card
// to a second photo, or see it on hover with a mouse.
function productCard(p, isLarge, showDetails, variantIndex, eager, swipe) {
  const vi = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[p.id] ?? 0);
  const soldOut = (p.stock ?? 0) <= 0;
  const badges = getCardBadges(p);
  const badge = badges.length ? `<div class="product-badge-stack">${badges.map(b => `<span class="product-badge ${badgeClass(b)}">${escapeHTML(b)}</span>`).join('')}</div>` : '';
  const imgs = p.variants?.[vi]?.images;
  const shown = imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE;
  const ghost = gridThumbURL(shown);
  const pid = escapeJSString(p.id);
  const second = swipe ? cardSecondPhoto(p, vi, shown) : '';
  const secondImg = second ? `<img class="card-photo-2" src="${escapeHTML(gridThumbURL(second))}" alt="" loading="lazy" onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">` : '';

  const brand = `<div class="product-brand">${escapeHTML(p.brand || '')}</div>`;
  const name = `<div class="product-title">${escapeHTML(p.name)}</div>`;

  const onSale = hasSalePrice(p);
  const priceInner = onSale
    ? `<div class="product-price-stack"><span class="product-price-original">${escapeHTML(formatPriceCardStyle(p.price))}</span><span class="product-price product-price-sale">${escapeHTML(formatPriceCardStyle(p.salePrice))}</span></div>`
    : `<span class="product-price">${escapeHTML(formatPriceCardStyle(p.price))}</span>`;
  const swatches = cardVariantSwatchesHtml(p, vi);
  const price = `<div class="product-price-row">${priceInner}${swatches}</div>`;

  const metaRow = `${brand}<div class="product-card-name-row">${name}</div>${price}`;

  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="S.productVariantSelections['${pid}']=${vi};goToProduct('${pid}')">
      <div class="product-img-wrap${second ? ' card-has-2' : ''}">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" ${eager === 'high' ? 'loading="eager" fetchpriority="high"' : eager ? 'loading="eager"' : 'loading="lazy"'} onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">${secondImg}${cardActionButtonHtml(p)}</div>
      ${metaRow}
    </div>`;
}

// Tiny per-variant color squares, restored below the price wherever a
// product has more than one variant (replaces the old "+N colors" text).
// Clicking a square swaps the already-rendered card's own <img> in
// place — no re-render, no navigation. Named distinctly from
// product-detail.js's own variantSwatchesHtml()/selectVariant() (that
// page's swatches drive a slide/thumbnail gallery, not a single <img>,
// and both scripts share the same global scope on every page).
function cardVariantSwatchesHtml(p, selectedIndex) {
  const variants = p.variants || [];
  if (variants.length <= 1) return '';
  const pid = escapeJSString(p.id);
  const swatches = variants.map((v, i) => {
    // The colour's swatch photo (variantSwatchThumb, product-detail.js),
    // or its flat colour when it has no photos.
    const thumb = variantSwatchThumb(v);
    const style = thumb ? `background-image:url('${thumb}')` : `background:${escapeHTML((v && v.swatch) || '#ccc')}`;
    const label = (v && v.color) || ('Variant ' + (i + 1));
    const selected = i === selectedIndex ? ' selected' : '';
    return `<span class="variant-swatch${selected}${thumb ? ' has-image' : ''}" style="${style}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}" onclick="event.stopPropagation();event.preventDefault();selectCardVariant('${pid}', ${i}, this);"></span>`;
  }).join('');
  return `<div class="product-swatches-row">${swatches}</div>`;
}

function selectCardVariant(productId, variantIndex, swatchEl) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  S.productVariantSelections[productId] = variantIndex;

  const card = swatchEl && swatchEl.closest ? swatchEl.closest('.product-card') : null;
  if (card) {
    const imgEl = card.querySelector('.product-img-wrap img');
    if (imgEl) {
      const imgs = p.variants?.[variantIndex]?.images;
      const shown = imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE;
      imgEl.classList.remove('img-loaded');
      imgEl.src = escapeHTML(gridThumbURL(shown));
      // A swipeable card's second photo follows the colour too.
      const second = card.querySelector('.product-img-wrap img.card-photo-2');
      const next = second && cardSecondPhoto(p, variantIndex, shown);
      if (second && next) second.src = escapeHTML(gridThumbURL(next));
      card.querySelector('.product-img-wrap').classList.remove('show-2');
    }
    const row = swatchEl.parentElement;
    if (row) {
      row.querySelectorAll('.variant-swatch.selected').forEach(el => el.classList.remove('selected'));
    }
    swatchEl.classList.add('selected');
  }
}

function formatPriceCardStyle(price) {
  const n = Number(price);
  const safe = Number.isFinite(n) ? n : 0;
  return 'R' + safe.toFixed(2).replace('.', ',');
}

function productCardHome(p, eager) {
  const badges = getCardBadges(p);
  const badge = badges.length ? `<div class="product-badge-stack">${badges.map(b => `<span class="product-badge ${badgeClass(b)}">${escapeHTML(b)}</span>`).join('')}</div>` : '';
  const soldOut = (p.stock ?? 0) <= 0;
  const vi = S.productVariantSelections[p.id] ?? 0;
  const imgs = p.variants?.[vi]?.images;
  const ghost = gridThumbURL(imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE);
  const pid = escapeJSString(p.id);
  const onSale = hasSalePrice(p);
  const priceInner = onSale
    ? `<div class="product-price-stack"><span class="product-price-original">${escapeHTML(formatPriceCardStyle(p.price))}</span><span class="product-home-price product-price-sale">${escapeHTML(formatPriceCardStyle(p.salePrice))}</span></div>`
    : `<span class="product-home-price">${escapeHTML(formatPriceCardStyle(p.price))}</span>`;
  const swatches = cardVariantSwatchesHtml(p, vi);
  const brand = `<div class="product-brand">${escapeHTML(p.brand || '')}</div>`;
  const name = `<div class="product-title">${escapeHTML(p.name)}</div>`;
  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="goToProduct('${pid}')">
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" ${eager === 'high' ? 'loading="eager" fetchpriority="high"' : eager ? 'loading="eager"' : 'loading="lazy"'} onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">${cardActionButtonHtml(p)}</div>
      <div class="product-home-meta">
        ${brand}
        <div class="product-home-name-row">${name}</div>
        <div class="product-home-price-row">${priceInner}${swatches}</div>
      </div>
    </div>`;
}

function cardTouchStart(e, productId) { S.cardTouchStartX[productId] = e.touches[0].clientX; }
function cardTouchEnd(e, productId) {
  const startX = S.cardTouchStartX[productId];
  if (!startX) return;
  const diff = startX - e.changedTouches[0].clientX;
  if (Math.abs(diff) < 30) return;

  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  const vi = S.productVariantSelections[productId] ?? 0;
  const allImages = getAllProductImages(product, vi);
  const total = allImages.length;
  const cur = S.cardSlideIndex[productId] ?? 0;

  let nxt = cur;
  if (diff > 0 && cur < total - 1) nxt = cur + 1;
  else if (diff < 0 && cur > 0) nxt = cur - 1;

  S.cardSlideIndex[productId] = nxt;

  document.querySelectorAll(`#card-slides-${productId}, #card-slides-home-${productId}`).forEach(el => {
    if (el) el.style.transform = `translateX(-${nxt * 100}%)`;
  });

  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  if (card) card.querySelectorAll(".card-slider-bar").forEach((d, i) =>
    d.classList.toggle("active", i === nxt));
}

// Works for every category (the old version only had rules for 9 of
// them, and showed nothing at all for everything else). Priority:
// 1) other products from the same brand ("more from this designer"),
// 2) site-wide featured picks, 3) whatever's left — so there's always
// something to show as long as other active products exist.
// excludeIds lets a caller keep this from repeating products another
// section on the same page (e.g. You may also like) already shows.
function getSuggestedProducts(currentProduct, excludeIds) {
  if (!currentProduct) return [];
  const exclude = new Set([currentProduct.id, ...(excludeIds || [])]);
  const active = PRODUCTS.filter(p => p.status === 'active' && !exclude.has(p.id));
  const inStock = active.filter(p => !isProductSoldOut(p));
  const pool = inStock.length ? inStock : active;

  const sameBrand = pool.filter(p => p.brand === currentProduct.brand);
  const featured = pool.filter(p => p.featured && p.brand !== currentProduct.brand);
  const rest = pool.filter(p => !p.featured && p.brand !== currentProduct.brand);

  return merchandiseProducts([...sameBrand, ...featured, ...rest]).slice(0, 4);
}

/* ============================================================
   SWIPE SECTION — Recently viewed / You may also like / Complete the look
   ============================================================ */

function buildSwipeSection(title, products, containerId) {
  const id = containerId || `swipe-${Date.now()}`;
  const cards = products.map(p => buildSwipeCardInner(p)).join('');

  return `<div class="swipe-section">
    <div class="swipe-section-title">${title}</div>
    <div class="swipe-track-wrap" id="wrap-${id}">
      <div class="swipe-track" id="track-${id}" ontouchstart="swipeTouchStart(event,'${id}')" ontouchend="swipeTouchEnd(event,'${id}')" onmousedown="swipeMouseDown(event,'${id}')">${cards}</div>
    </div>
    <div class="swipe-bars" id="bars-${id}"></div>
  </div>`;
}

function buildSwipeCardInner(product) {
  if (!product) return '';
  return productCardHome(product);
}

function selectSize(btn,size) { document.querySelectorAll(".modal-size-btn").forEach(b=>b.classList.remove("sel")); btn.classList.add("sel"); S.selectedSize=size; }
function renderAllProducts() {
  if(!DOM.allProductsGrid) return;
  restoreCollectionFilterBar();
  let prods = merchandiseProducts(getFilteredProducts(), undefined, S.sortBy);
  const expanded = expandProductVariants(prods);
  DOM.allProductsGrid.style.gridTemplateColumns = gridTemplateFor(S.gridCols);
  applyGridColsClass(DOM.allProductsGrid, S.gridCols);
  renderPaginatedGrid(DOM.allProductsGrid, expanded, S.gridCols);
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
  updateCollectionTitle();
  renderFilterPanel();
  renderActiveFilterChips();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

function renderCategoryProducts() {
  if(!S.currentCategoryPage || !DOM.categoryProductsGrid) return;
  restoreCollectionFilterBar();
  const cp = getCatFilteredProducts();
  let prods=merchandiseProducts(cp, S.currentCategoryPage, S.sortBy);
  const expanded = expandProductVariants(prods);
  DOM.categoryProductsGrid.style.gridTemplateColumns=gridTemplateFor(S.gridColsCat);
  applyGridColsClass(DOM.categoryProductsGrid, S.gridColsCat);
  renderPaginatedGrid(DOM.categoryProductsGrid, expanded, S.gridColsCat);
  updateGridToggleSVG("cat-grid-toggle-svg",S.gridColsCat);
  if(DOM.categoryDescriptionWrap){DOM.categoryDescriptionWrap.innerHTML='';}
  renderCollectionSortingTabs();
  updateCollectionTitle();
  renderFilterPanel();
  renderActiveFilterChips();
  injectToolbarExtras('page-category', 'cat-grid-toggle-svg');
}

// Same shape as renderSaleProducts() above, but filters to genuinely
// new products (isProductNew(), product-detail.js — createdAt within
// PRODUCT_NEW_DAYS) instead of on-sale ones. Previously "New in" just
// sorted the entire catalog newest-first without actually filtering
// it, so it looked identical to All products once you scrolled past
// the first few items. renderPaginatedGrid() already falls back to
// its placeholder cards when `filtered` is empty, so a quiet period
// with nothing newly added still never looks broken.
function renderNewInProducts() {
  if(!DOM.allProductsGrid) return;
  restoreCollectionFilterBar();

  let filtered = PRODUCTS.filter(p => p.status === 'active' && isProductNew(p));

  if (S.filter.cat.length) {
    filtered = filtered.filter(p => S.filter.cat.includes(p.category));
  }
  if (S.filter.vendor.length) {
    filtered = filtered.filter(p => S.filter.vendor.includes(p.brand));
  }
  if (S.filter.size && S.filter.size !== 'all') {
    filtered = filtered.filter(p => (p.sizes || []).includes(S.filter.size));
  }
  if (S.filter.inStock) {
    filtered = filtered.filter(p => (Number(p.stock) || 0) > 0);
  }

  const np = merchandiseProducts(filtered, undefined, S.sortBy);
  const expanded = expandProductVariants(np);
  DOM.allProductsGrid.style.gridTemplateColumns = gridTemplateFor(S.gridCols);
  applyGridColsClass(DOM.allProductsGrid, S.gridCols);
  renderPaginatedGrid(DOM.allProductsGrid, expanded, S.gridCols);
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
  updateCollectionTitle();
  renderFilterPanel();
  renderActiveFilterChips();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

function renderSaleProducts() {
  if(!DOM.allProductsGrid) return;
  restoreCollectionFilterBar();

  let filtered = PRODUCTS.filter(p => p.status === 'active' && hasSalePrice(p));

  if (S.filter.cat.length) {
    filtered = filtered.filter(p => S.filter.cat.includes(p.category));
  }
  if (S.filter.vendor.length) {
    filtered = filtered.filter(p => S.filter.vendor.includes(p.brand));
  }
  if (S.filter.size && S.filter.size !== 'all') {
    filtered = filtered.filter(p => (p.sizes || []).includes(S.filter.size));
  }
  if (S.filter.inStock) {
    filtered = filtered.filter(p => (Number(p.stock) || 0) > 0);
  }

  const sp = merchandiseProducts(filtered, undefined, S.sortBy);
  const expanded = expandProductVariants(sp);
  DOM.allProductsGrid.style.gridTemplateColumns = gridTemplateFor(S.gridCols);
  applyGridColsClass(DOM.allProductsGrid, S.gridCols);
  renderPaginatedGrid(DOM.allProductsGrid, expanded, S.gridCols);
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
  updateCollectionTitle();
  renderFilterPanel();
  renderActiveFilterChips();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

function injectToolbarExtras(pageId, gridSvgId) {
  const page = document.getElementById(pageId);
  if (!page) return;

  const toolbar = page.querySelector('.collection-toolbar');
  if (toolbar) {
    const svg = toolbar.querySelector('#' + gridSvgId);
    const wrapper = document.createElement('div');
    wrapper.className = 'sort-by-wrapper';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginRight = '12px';
    wrapper.innerHTML = buildSortControl();
    if (svg && svg.parentElement) {
      svg.parentElement.insertBefore(wrapper, svg);
    } else {
      toolbar.appendChild(wrapper);
    }
  }

}

function buildSortControl() {
  const current = S.sortBy || 'newest';
  return `<select id="sort-by" class="filter-select sort-by-select" onchange="setSortBy(this.value)">` +
    SORT_OPTIONS.map(o => `<option value="${o.v}"${current === o.v ? ' selected' : ''}>${escapeHTML(o.l)}</option>`).join('') +
  `</select>`;
}

function toggleGrid() { S.gridCols = S.gridCols === 1 ? 2 : S.gridCols === 2 ? 3 : 1; if(S.saleMode) renderSaleProducts(); else if (S.newInMode) renderNewInProducts(); else renderAllProducts(); updateGridToggleSVG("grid-toggle-svg", S.gridCols); updateCollectionGridIcon(); }

function toggleGridCat() { S.gridColsCat = S.gridColsCat === 1 ? 2 : S.gridColsCat === 2 ? 3 : 1; renderCategoryProducts(); updateGridToggleSVG("cat-grid-toggle-svg", S.gridColsCat); updateCollectionGridIcon(); }

function toggleGridVendor() { S.gridColsVendor = S.gridColsVendor === 1 ? 2 : S.gridColsVendor === 2 ? 3 : 1; renderVendorPage(S.currentVendor); updateCollectionGridIcon(); }

function renderCollectionSortingTabs() {
  const page = document.getElementById(S.currentPage === 'products' ? 'page-products' : 'page-category');
  if (!page) return;
  let existing = page.querySelector('.collection-sorting-tabs');
  if (existing) existing.remove();
  if (!window._publishedCollections && typeof window._loadPublishedCollections === 'function') {
    window._loadPublishedCollections().then(function () {
      const currentPage = document.getElementById(S.currentPage === 'products' ? 'page-products' : 'page-category');
      if (currentPage && currentPage.classList.contains('active')) renderCollectionSortingTabs();
    });
  }
  const collections = (window._publishedCollections || []).slice().sort(function (a, b) {
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
      String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
  });
  const tabs = [{ label: 'View all', cat: 'all' }].concat(collections.map(function (item) {
    return { label: item.title || item.name || item.handle || item.id, cat: String(item.handle || item.slug || item.id) };
  }));
  let active;
  if (S.currentPage === 'category') active = S.currentCollectionHandle || S.currentCategoryPage;
  else active = S.activeSortTab || (S.saleMode ? 'sale' : (S.newInMode ? 'newin' : 'all'));
  const tabsHtml = tabs.map(t => `<button class="sorting-tab${t.cat === active ? ' active' : ''}" onclick="selectSortTab('${escapeJSString(t.cat)}')">${escapeHTML(t.label)}</button>`).join('');
  const container = document.createElement('div');
  container.className = 'collection-sorting-tabs';
  container.innerHTML = tabsHtml;

  const toolbarEl = page.querySelector('.collection-toolbar');
  if (toolbarEl) {
    toolbarEl.insertAdjacentElement('afterend', container);
    return;
  }
  const layoutEl = page.querySelector('.site-collection-layout');
  if (layoutEl) {
    layoutEl.insertAdjacentElement('beforebegin', container);
    return;
  }
  page.insertAdjacentElement('afterbegin', container);
}

function selectSortTab(cat) {
  S.activeSortTab = cat;
  const collection = (window._publishedCollections || []).find(function (item) {
    return String(item.handle || item.slug || item.id) === String(cat);
  });
  if (collection) { navigateToCollection(cat); return; }
  if (cat === 'sale') { navigateToSale(); return; }
  if (cat === 'newin') { navigateToNewIn(); return; }
  S.saleMode = false;
  S.newInMode = false;
  if (cat === 'all') { navigateTo('products'); return; }
  navigateToCategory(cat);
  renderCollectionSortingTabs();
  resetScrollToTop();
  updateCollectionGridIcon();
}

// Shop by Category's tiles used to be a hardcoded 4-item array here —
// they're now admin-editable content (siteContent/homepage.shopByCategory,
// written by admin-homepage.js), rendered by renderShopByCategory() in
// site-content.js once that fetch resolves. Nothing to do here anymore.

// "New arrivals" means newest first — merchandiseProducts()'s own
// default order is by category then price, which has nothing to do
// with when a product was added, so it's overridden here with the
// 'newest' sort (createdAt, falling back to updatedAt) already built
// into applySort(). Automatic: nothing to toggle per product.
function buildArrivals() {
  if (DOM.arrivalsGrid) {
    const active = PRODUCTS.filter(p => p.status === 'active');
    const top = merchandiseProducts(active, undefined, 'newest').slice(0, 8);
    DOM.arrivalsGrid.innerHTML = top.length ? top.map((p, i) => productCardHome(p, i < 3 && (i === 0 ? 'high' : true))).join("") : placeholderProductCards(6, true);
    initSliderLeadingTracking('arrivals-grid');
  }
  buildShopByClothing();
  buildShopByAccessories();
}

function buildShopByClothing() {
  const grid = document.getElementById('clothing-grid');
  if (!grid) return;
  const active = PRODUCTS.filter(p => p.status === 'active' && isInDepartment(p, 'clothing'));
  const top = merchandiseProducts(active).slice(0, 8);
  grid.innerHTML = top.length ? top.map(p => productCardHome(p)).join('') : placeholderProductCards(6, true);
  initSliderLeadingTracking('clothing-grid');
}

function buildShopByAccessories() {
  const grid = document.getElementById('accessories-grid');
  if (!grid) return;
  const active = PRODUCTS.filter(p => p.status === 'active' && isInDepartment(p, 'accessories'));
  const top = merchandiseProducts(active).slice(0, 8);
  grid.innerHTML = top.length ? top.map(p => productCardHome(p)).join('') : placeholderProductCards(6, true);
  initSliderLeadingTracking('accessories-grid');
}

// #arrivals-grid / #clothing-grid / #accessories-grid are horizontal scroll-snap sliders,
// so "the first card" isn't fixed — it's whichever card the user has
// scrolled to the leading (left) edge. A plain :first-child selector
// only ever matches the card that happened to render first in the DOM,
// so it stops matching the moment someone swipes. This tracks scroll
// position instead and moves a .slide-leading class onto whichever
// card is actually leading, so product-grid.css's "can't sit
// edge-to-edge with the screen" padding follows the swipe.
function initSliderLeadingTracking(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const update = () => {
    const cards = grid.querySelectorAll('.product-card');
    if (!cards.length) return;
    const gridLeft = grid.getBoundingClientRect().left;
    let leading = cards[0], minDist = Infinity;
    cards.forEach(card => {
      const dist = Math.abs(card.getBoundingClientRect().left - gridLeft);
      if (dist < minDist) { minDist = dist; leading = card; }
    });
    cards.forEach(c => { if (c !== leading) c.classList.remove('slide-leading'); });
    leading.classList.add('slide-leading');
  };
  if (grid._leadingScrollHandler) grid.removeEventListener('scroll', grid._leadingScrollHandler);
  grid._leadingScrollHandler = update;
  grid.addEventListener('scroll', update, { passive: true });
  update();
}

// ==================== VENDOR / BRAND PAGE ====================

async function navigateToVendor(vendorIdOrSlug, replaceUrl, view) {
  // Shared with every other page-navigation function (see the
  // pageNavGeneration comment in app.js) — guards against this fetch
  // outliving the visit, whether that's a second navigateToVendor()
  // call (another brand) or navigating away to a completely different
  // page (All products, home, back button, anything).
  const myNavGen = ++pageNavGeneration;
  closeSearch();
  S.saleMode = false;
  S.newInMode = false;
  // A brand page is not a collection: forget the one just visited, or its
  // name (e.g. Women) would show as this page's heading.
  S.currentCollectionHandle = null;
  S.currentCollectionData = null;
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-vendor").classList.add("active");
  S.currentPage = "vendor";
  removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  // Shows the shared filter bar (grid toggle, FILTER button, title)
  // above the grid, same as the products/category pages.
  document.body.classList.add('on-collection-page');
  // A brand has its home (/brands/x) and its All products and Sale pages
  // (/brands/x/shop, /brands/x/sale), all under the same brand bar.
  // One page per brand. Old /brands/x/shop and /brands/x/sale links open
  // it scrolled to All products (Sale picked for /sale).
  const brandView = view === 'shop' || view === 'sale' ? view : 'home';
  const viewSuffix = '';
  const newPath = '/brands/' + encodeURIComponent(vendorIdOrSlug);
  if (window.location.pathname !== newPath) {
    replaceUrl ? history.replaceState(null, null, newPath) : history.pushState(null, null, newPath);
  }
  // Must happen before the innerHTML wipe just below: if the shared
  // #collection-filter-bar (and its child #collection-filter-title-display,
  // which updateCollectionTitle() depends on to do anything at all) is
  // still sitting inside #vendor-page-content from a PREVIOUS vendor
  // visit, that wipe destroys them outright — not just relocates them,
  // actually removes them from the document, permanently, since nothing
  // after this point has any way to get them back. That's the real root
  // cause of both the "grid toggle disappears" and "breadcrumb never
  // updates again" symptoms: once titleEl is gone, updateCollectionTitle()
  // bails out on its very first line (`if (!titleEl) return;`) on every
  // future call, for the rest of the page's lifetime, regardless of how
  // many more times the user navigates. renderVendorPage() also calls
  // restoreCollectionFilterBar() at its own top, but that's too late —
  // it only helps for the NEXT visit, after this wipe has already
  // destroyed them for the current one.
  restoreCollectionFilterBar();
  const el = document.getElementById('vendor-page-content');
  if (el) el.innerHTML = brandPageLoadingSkeleton();
  // Reset per-visit so a filter/grid choice on one brand's page doesn't
  // carry over to the next brand you look at.
  S.vendorFilter = {cat:[], size:'all', vendor:[], onSale: brandView === 'sale', inStock:false};
  S.gridColsVendor = 2;

  // Resolve a slug (the normal case — every brand link passes its
  // slug now) or a raw doc ID (old links already shared/indexed) down
  // to the real Firestore doc ID. S.vendors may not be loaded yet (a
  // fresh /brands/{slug} page load can race initVendors()), so fall
  // back to a live query by slug instead of assuming an unrecognized
  // value must already be a doc ID.
  let docId = vendorIdOrSlug;
  const known = findVendorBySlug(vendorIdOrSlug);
  if (known) {
    docId = known.id;
  } else {
    try {
      const bySlug = await db.collection('vendors').where('slug', '==', vendorIdOrSlug).limit(1).get();
      if (!bySlug.empty) docId = bySlug.docs[0].id;
    } catch(e) {}
  }
  // Bails if the user has navigated anywhere else since this fetch
  // started — another brand's page, All products, back button, anything
  // — because every navigation function bumps pageNavGeneration (app.js).
  if (myNavGen !== pageNavGeneration) return;
  S.currentVendorId = docId;

  try {
    const doc = await db.collection('vendors').doc(docId).get();
    if (myNavGen !== pageNavGeneration) return;
    const vendor = doc.exists ? Object.assign({id:doc.id}, doc.data()) : null;
    S.currentVendor = vendor;
    renderVendorPage(vendor);
    // Silently upgrade the address bar to the canonical slug URL if we
    // arrived via a raw ID or anything else — no new history entry.
    const canonicalPath = '/brands/' + encodeURIComponent(vendor?.slug || docId) + viewSuffix;
    if (window.location.pathname !== canonicalPath) {
      history.replaceState(null, null, canonicalPath);
    }
  } catch(e) {
    if (myNavGen !== pageNavGeneration) return;
    console.error('Error fetching vendor:', e);
    S.currentVendor = null;
    renderVendorPage(null);
  }
  if (myNavGen !== pageNavGeneration) return;
  resetScrollToTop();
  ensureNavScrolled();
  updateChatVisibility();
  if (brandView !== 'home') requestAnimationFrame(() => scrollToBrandSection('brand-shop'));
  updateCollectionTitle();
}

function normalizeBrandName(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/nirious co/g, 'nirius co');
}

// The shared filter bar (#collection-filter-bar, holding the grid
// toggle + FILTER button) and its active-chips row normally live right
// after the nav, above every collection-style page's content — correct
// for All products/Category, which open straight into a grid with no
// hero image above it. The vendor/brand page has a hero image first,
// and the filter bar belongs below that image, directly above the
// grid — not above the image, where it was sitting by default since
// it's the same DOM position every collection page shares. Relocated
// here instead of duplicating the bar per page, so there's still only
// one real element with its handlers intact — moveFilterBarBelowVendorHero()
// physically moves that one node; restoreCollectionFilterBar() (called
// by the other collection pages) puts it back.
let _filterBarHomeParent = null;
let _filterBarHomeNext = null;

function _rememberFilterBarHome() {
  if (_filterBarHomeParent) return;
  const bar = document.getElementById('collection-filter-bar');
  if (!bar) return;
  _filterBarHomeParent = bar.parentNode;
  _filterBarHomeNext = bar.nextSibling;
}

function restoreCollectionFilterBar() {
  _rememberFilterBarHome();
  const bar = document.getElementById('collection-filter-bar');
  const chips = document.getElementById('active-filter-chips');
  if (!bar || !_filterBarHomeParent) return;
  if (bar.parentNode === _filterBarHomeParent) return; // already home
  if (_filterBarHomeNext && _filterBarHomeNext.parentNode === _filterBarHomeParent) {
    _filterBarHomeParent.insertBefore(bar, _filterBarHomeNext);
  } else {
    _filterBarHomeParent.appendChild(bar);
  }
  const heading = document.getElementById('collection-page-heading');
  if (chips && heading) heading.insertAdjacentElement('afterend', chips);
}

function moveFilterBarBelowVendorHero(heroSection) {
  _rememberFilterBarHome();
  const bar = document.getElementById('collection-filter-bar');
  const chips = document.getElementById('active-filter-chips');
  if (!bar || !heroSection) return;
  heroSection.insertAdjacentElement('afterend', bar);
  if (chips) bar.insertAdjacentElement('afterend', chips);
}

function renderVendorPage(vendor) {
  const el = document.getElementById('vendor-page-content');
  if (!el) return;
  // moveFilterBarBelowVendorHero() (below) relocates the shared
  // #collection-filter-bar/#active-filter-chips to live inside this
  // element's subtree. If this function runs again before they're
  // moved back out — a second vendor visited, sort/filter changed, or
  // just the grid toggle clicked, all of which call renderVendorPage()
  // again — el.innerHTML below would destroy them outright (they'd be
  // actual descendants of el at that point), and the next
  // getElementById('collection-filter-bar') would find nothing,
  // silently leaving the page with no filter bar at all. Moving them
  // back to their real home first guarantees they're never inside el
  // when it gets wiped.
  restoreCollectionFilterBar();
  S.currentVendor = vendor;
  // Same image source as the homepage's Shop by brand cards
  // (vendors.js's shopByBrandCardsHtml) — heroImageUrl first, falling
  // back to logoUrl — so a brand's image matches wherever it shows up.
  const heroImg = safeImageURL(vendor?.heroImageUrl || vendor?.logoUrl || '');
  const brandName = vendor?.brand || vendor?.name || '';
  const logoUrl = /^https:\/\//i.test(String(vendor?.logoUrl || '').trim()) ? vendor.logoUrl.trim() : '';
  const initials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const products = merchandiseProducts(getVendorFilteredProducts(vendor), 'vendor', S.sortBy);
  const expanded = expandProductVariants(products);
  // "Clothing & Accessories": the two departments most of the brand's
  // products are in (ties in menu order), or the one when that's all.
  // The brand's products, matched the same way as its All products grid
  // (vendorId, or the brand name in any capitals: products are saved as
  // "JANEDORE" while the brand may be named "Janedore").
  const brandProducts = getVendorBaseProducts(vendor);
  const depts = {};
  brandProducts.forEach(p => { const d = JDTaxonomy.departmentOf(p.category); if (d) depts[d] = (depts[d] || 0) + 1; });
  const deptOrder = JDTaxonomy.DEPARTMENTS.map(d => d.slug);
  const barLine = Object.keys(depts).sort((x, y) => depts[y] - depts[x] || deptOrder.indexOf(x) - deptOrder.indexOf(y))
    .slice(0, 2).map(d => JDTaxonomy.label(d)).join(' & ');
  const newest = merchandiseProducts(brandProducts, undefined, 'newest').slice(0, 8);
  const sectionHead = (id) => `<div class="home-categories-header" style="display:flex;align-items:center;justify-content:space-between;text-align:left;"><div class="home-categories-title" id="${id}" style="font-family:'Inter',sans-serif !important;font-weight:600 !important;font-size:var(--section-heading-size) !important;letter-spacing:0 !important;text-transform:none !important;line-height:1.3;color:#111;padding:8px 0;"></div></div>`;
  const emptyTile = '<div class="home-category-card" aria-hidden="true"><div class="home-category-img content-empty"><div class="home-category-label"></div></div></div>';
  const collectionTiles = brandCollectionTiles(brandProducts);
  const pickedCats = S.vendorFilter.cat || [];
  const pickedTile = pickedCats.length ? collectionTiles.find(t => t.cats.length === pickedCats.length && t.cats.every(c => pickedCats.includes(c))) : null;

  // A brand's page is its own small homepage inside Janedore: a brand bar
  // (sticks, and takes the header's place while scrolling down, like the
  // collection toolbar), their hero with their description, Shop / Collections
  // / Sale links, New in, their collections and All products, all on one
  // page. Built from the homepage's own pieces (hero, section headers,
  // slider, tiles).
  const onSale = !!S.vendorFilter.onSale;
  const brandBar = `
    <div class="brand-bar" id="brand-bar">
      <button type="button" class="brand-bar-logo" aria-label="${escapeHTML(brandName)} home" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })">${logoUrl ? `<img src="${escapeHTML(logoUrl)}" alt="">` : escapeHTML(initials)}</button>
      <div class="brand-bar-text"><h1 class="brand-bar-name">${escapeHTML(brandName)}</h1>${barLine ? `<div class="brand-bar-line">${escapeHTML(barLine)}</div>` : ''}</div>
      <div class="brand-bar-menu">
        <button type="button" class="brand-bar-more" aria-label="More" aria-expanded="false" onclick="toggleBrandMenu(event)"><i class="ph ph-dots-three"></i></button>
        <div class="collection-sort-options" id="brand-menu" role="menu">
          <button type="button" role="menuitem" onclick="closeBrandMenu();navigateToContentPage('customer-care')">Give feedback</button>
          <button type="button" role="menuitem" onclick="closeBrandMenu();openBrandReport()">Report a problem</button>
        </div>
      </div>
    </div>`;
  const pills = `
    <div class="nav-quick-links brand-quick-links" role="tablist">
      <button class="nav-quick-link${onSale ? '' : ' active'}" data-brand-tab="shop" onclick="showBrandSection('shop')">Shop</button>
      <button class="nav-quick-link" data-brand-tab="collections" onclick="showBrandSection('collections')">Collections</button>
      <button class="nav-quick-link${onSale ? ' active' : ''}" data-brand-tab="sale" onclick="showBrandSection('sale')">Sale</button>
    </div>`;
  // The brand's description (admin > Vendors) in the middle of its hero.
  const heroText = String(vendor?.description || vendor?.slogan || '').trim();

  el.innerHTML = `
    ${brandBar}
    <section class="brand-hero">
      <div class="hero-bg-placeholder${heroImg ? '' : ' content-empty'}" style="${heroImg ? `background-image:url('${escapeForCssUrl(heroImg)}');` : ''}"></div>
      <div class="hero-overlay"></div>
      ${heroText ? `<div class="brand-hero-slogan"><p class="hero-statement-sub brand-hero-text">${escapeHTML(heroText)}</p></div>` : ''}
    </section>
    ${pills}
    <section class="brand-section" id="brand-new">
      ${sectionHead('brand-new-heading')}
      <div class="product-grid" id="vendor-new-grid">${newest.length ? newest.map(p => productCardHome(p)).join('') : placeholderProductCards(6, true)}</div>
      <div class="home-section-btn-row"><button class="initial-drop-view-all" style="display:inline-block;margin:0;" onclick="showBrandSection('shop')">View all</button></div>
    </section>
    <section class="brand-section" id="brand-collections">
      ${sectionHead('brand-collections-heading')}
      <div class="home-categories-grid" id="brand-collections-grid">${collectionTiles.length
        ? collectionTiles.map((t, i) => `<button type="button" class="home-category-card" onclick="openBrandCollection(${i})" aria-label="Shop ${escapeHTML(t.name)}"><div class="home-category-img${t.image ? '' : ' content-empty'}" data-tile-image="${escapeHTML(t.image)}"><div class="home-category-label">${escapeHTML(t.name)}</div></div></button>`).join('')
        : emptyTile.repeat(4)}</div>
    </section>
    <section class="brand-section" id="brand-shop">
      ${sectionHead('brand-all-heading')}
    </section>
    <section class="site-collection-layout">
      <div class="product-grid" id="vendor-products-grid"></div>
    </section>
  `;
  if (typeof setSectionHeading === 'function') {
    const set = (id, t) => { const h = document.getElementById(id); if (h) setSectionHeading(h, t); };
    set('brand-new-heading', 'New in');
    set('brand-collections-heading', 'Collections');
    set('brand-all-heading', onSale ? 'Sale' : pickedTile ? pickedTile.name : 'All products');
  }
  S.brandCollectionTiles = collectionTiles;
  document.querySelectorAll('#brand-collections-grid [data-tile-image]').forEach(el => {
    const url = el.getAttribute('data-tile-image');
    if (url && typeof loadBackgroundImage === 'function') loadBackgroundImage(el, url, 600);
  });
  initSliderLeadingTracking('vendor-new-grid');

  // Brand pages have no sort/filter bar: a brand's range is small enough
  // to browse as is.

  const gridEl = document.getElementById('vendor-products-grid');
  gridEl.style.gridTemplateColumns = gridTemplateFor(S.gridColsVendor);
  applyGridColsClass(gridEl, S.gridColsVendor);
  if (!expanded.length && S.vendorFilter.onSale) {
    // Sale is always offered; say so plainly when nothing's on sale.
    gridEl.innerHTML = `<div class="filter-empty-note" style="grid-column:1/-1;padding:24px 12px;">There are currently no sale items from ${escapeHTML(brandName)}.</div>`;
  } else {
    renderPaginatedGrid(gridEl, expanded, S.gridColsVendor);
  }
  updateCollectionGridIcon();
  updateCollectionTitle();
  // No filter chips on brand pages (Sale is the brand's own link); the
  // chip row is shared with the collection pages, so empty it here.
  const chipsEl = document.getElementById('active-filter-chips');
  if (chipsEl) chipsEl.innerHTML = '';
  injectToolbarExtras('page-vendor', 'col-grid-icon');

  const footerEl = document.getElementById('vendor-footer');
  if (footerEl && typeof buildFooter === 'function') {
    buildFooter('vendor-footer');
    if (typeof renderVendorsFooter === 'function') renderVendorsFooter(S.vendors || []);
  }
}

window.navigateToVendor = navigateToVendor;

// Brand page links, all on the one brand page: Shop shows all the
// brand's products and Sale only their sale ones (scrolled to, under the
// sticky brand bar); Collections scrolls to the collection tiles.
function scrollToBrandSection(id) {
  const target = document.getElementById(id);
  const bar = document.getElementById('brand-bar');
  if (!target) return;
  const y = target.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0);
  window.scrollTo({ top: y, behavior: 'smooth' });
}
// The brand's Collections: made automatically from what it sells, one
// tile per department (Clothing, Accessories, Beauty...) with the photo
// of its newest product there, in the Shop by category tiles' style. A
// brand in one department gets a tile per category instead (Dresses,
// Tops...). Tapping one shows just those products under All products.
function brandCollectionTiles(products) {
  const newest = merchandiseProducts(products, undefined, 'newest');
  const group = (keyOf, nameOf, catsOf) => {
    const map = new Map();
    newest.forEach(p => {
      const key = keyOf(p);
      if (!key) return;
      if (!map.has(key)) map.set(key, { key, name: nameOf(key), cats: catsOf(key), count: 0, image: '' });
      const t = map.get(key);
      t.count++;
      if (!t.image) { const img = getProductImages(p, 0)[0]; if (img && img !== PLACEHOLDER_IMAGE) t.image = img; }
    });
    return [...map.values()].sort((a, b) => b.count - a.count || JDTaxonomy.order(a.key) - JDTaxonomy.order(b.key));
  };
  const depts = group(p => JDTaxonomy.departmentOf(p.category), d => JDTaxonomy.label(d), d => JDTaxonomy.categoriesIn(d));
  if (depts.length !== 1) return depts;
  const cats = group(p => p.category, c => JDTaxonomy.label(c), c => [c]);
  return cats.length > 1 ? cats : depts;
}

function openBrandCollection(i) {
  const tile = (S.brandCollectionTiles || [])[i];
  if (!tile || !S.currentVendor) return;
  S.vendorFilter.cat = tile.cats.slice();
  S.vendorFilter.onSale = false;
  renderVendorPage(S.currentVendor);
  scrollToBrandSection('brand-shop');
}

function showBrandSection(key) {
  if (key === 'collections') { scrollToBrandSection('brand-collections'); return; }
  const onSale = key === 'sale';
  if (S.currentVendor && (!!S.vendorFilter.onSale !== onSale || (S.vendorFilter.cat || []).length)) {
    const y = window.scrollY;
    S.vendorFilter.onSale = onSale;
    S.vendorFilter.cat = [];
    renderVendorPage(S.currentVendor);
    window.scrollTo(0, y);
  }
  scrollToBrandSection('brand-shop');
}

// Brand bar "···" menu: feedback first, reporting second (same menu
// style as the collection Sort menu).
function toggleBrandMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('brand-menu');
  if (!menu) return;
  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  const btn = document.querySelector('.brand-bar-more');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}
function closeBrandMenu() {
  const menu = document.getElementById('brand-menu');
  if (menu) menu.classList.remove('open');
  const btn = document.querySelector('.brand-bar-more');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('.brand-bar-menu')) closeBrandMenu(); });



// ---- Report this brand ----
// Bottom panel opened from the brand page's "more" button. Reports go to
// server.js /api/report-brand, which saves them and emails the
// Janedore team; the brand is never told who reported them.
const BRAND_REPORT_REASONS = ['Counterfeit or replica item', 'Item not as described', 'Order or delivery issue', 'Misleading or inappropriate content', 'Something else'];

function openBrandReport() {
  const vendor = S.currentVendor;
  if (!vendor || !vendor.id) return;
  closeBrandReport();
  const brandName = vendor.brand || vendor.name || 'this brand';
  let email = '';
  try { email = (firebase.auth().currentUser && firebase.auth().currentUser.email) || ''; } catch (e) {}
  const wrap = document.createElement('div');
  wrap.id = 'brand-report';
  wrap.className = 'brand-report-overlay';
  wrap.innerHTML = `<div class="brand-report-sheet" role="dialog" aria-modal="true" aria-labelledby="brand-report-title">
    <div class="brand-report-head">
      <h2 id="brand-report-title">Report a concern</h2>
      <button type="button" class="brand-report-close" onclick="closeBrandReport()" aria-label="Close"><i class="ph ph-x"></i></button>
    </div>
    <form id="brand-report-form" onsubmit="submitBrandReport(event)">
      <p class="brand-report-intro">Help us uphold the standards of the JANEDORE marketplace. Reports about ${escapeHTML(brandName)} are reviewed by our team and handled in strict confidence.</p>
      <div class="brand-report-reasons">${BRAND_REPORT_REASONS.map((r, i) => `<label class="brand-report-reason"><input type="radio" name="reason" value="${escapeHTML(r)}"${i === 0 ? ' required' : ''}><span>${escapeHTML(r)}</span></label>`).join('')}</div>
      <label class="brand-report-label" for="brand-report-details">Details <span>(optional)</span></label>
      <textarea id="brand-report-details" name="details" rows="4" maxlength="2000" placeholder="Describe the issue, including your order number where applicable."></textarea>
      <label class="brand-report-label" for="brand-report-email">Email address <span>(optional, for updates on your report)</span></label>
      <input id="brand-report-email" name="email" type="email" maxlength="200" autocomplete="email" value="${escapeHTML(email)}">
      <div class="brand-report-msg" id="brand-report-msg" role="status"></div>
      <button type="submit" class="brand-report-submit">Submit report</button>
    </form>
  </div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeBrandReport(); });
  document.body.appendChild(wrap);
  document.addEventListener('keydown', brandReportEsc);
  document.body.classList.add('brand-report-open');
  lockBrandReportScroll();
}

// Same page freeze as the chat widget (chat.js lockPageScroll): pinning
// the body stops iOS Safari's toolbar moving, which is what let the page
// show through under the panel.
let brandReportScrollY = 0;
function lockBrandReportScroll() {
  brandReportScrollY = window.scrollY || window.pageYOffset || 0;
  const b = document.body.style;
  b.setProperty('position', 'fixed', 'important');
  b.setProperty('top', -brandReportScrollY + 'px', 'important');
  b.setProperty('left', '0', 'important');
  b.setProperty('right', '0', 'important');
  b.setProperty('width', '100%', 'important');
  b.setProperty('overflow', 'hidden', 'important');
  document.documentElement.style.setProperty('overflow', 'hidden', 'important');
}
function unlockBrandReportScroll() {
  ['position', 'top', 'left', 'right', 'width', 'overflow'].forEach(p => document.body.style.removeProperty(p));
  document.documentElement.style.removeProperty('overflow');
  window.scrollTo(0, brandReportScrollY);
}

function brandReportEsc(e) { if (e.key === 'Escape') closeBrandReport(); }

function closeBrandReport() {
  const el = document.getElementById('brand-report');
  if (!el) return;
  el.remove();
  document.removeEventListener('keydown', brandReportEsc);
  document.body.classList.remove('brand-report-open');
  unlockBrandReportScroll();
}

async function submitBrandReport(e) {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('brand-report-msg');
  const btn = form.querySelector('.brand-report-submit');
  const reason = (form.querySelector('input[name="reason"]:checked') || {}).value || '';
  const details = form.details.value.trim();
  if (reason === 'Something else' && !details) { msg.textContent = 'Please describe the issue.'; form.details.focus(); return; }
  btn.disabled = true; btn.textContent = 'Submitting...'; msg.textContent = '';
  try {
    const res = await fetch('/api/report-brand', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: S.currentVendor && S.currentVendor.id, reason, details, email: form.email.value.trim() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not send your report. Please try again.');
    const sentTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim()) ? form.email.value.trim() : '';
    form.innerHTML = `<div class="brand-report-done"><i class="ph ph-check-circle"></i><p><strong>Thank you. Your report has been submitted.</strong></p><p>Our marketplace team will review it and take appropriate action. All reports are handled in strict confidence.${sentTo ? ' A confirmation has been sent to ' + escapeHTML(sentTo) + '.' : ''}</p><button type="button" class="brand-report-submit" onclick="closeBrandReport()">Done</button></div>`;
  } catch (err) {
    msg.textContent = err.message;
    btn.disabled = false; btn.textContent = 'Submit report';
  }
}

// Collection cards with a second photo (productCard swipe): swipe left
// for it, right to go back. The swipe doesn't open the product.
(function () {
  let wrap = null, sx = 0, sy = 0;
  document.addEventListener('touchstart', e => {
    wrap = e.target.closest ? e.target.closest('.product-img-wrap.card-has-2') : null;
    if (wrap) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!wrap) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      wrap.classList.toggle('show-2', dx < 0);
      wrap.dataset.swipedAt = Date.now();
    }
    wrap = null;
  }, { passive: true });
  document.addEventListener('click', e => {
    const w = e.target.closest ? e.target.closest('.product-img-wrap.card-has-2') : null;
    if (w && Date.now() - (Number(w.dataset.swipedAt) || 0) < 500) { e.stopPropagation(); e.preventDefault(); }
  }, true);
})();
