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
  return safeImageURL(url).replace('/upload/', '/upload/f_auto,q_auto,c_fill,w_700,h_840/');
}

function escapeForCssUrl(url) {
  const safe = safeImageURL(url);
  return String(safe).replace(/['"\\\n\r]/g, '');
}

const CATEGORY_ORDER = { tops:1, bottoms:2, dresses:3, sets:4, jackets:5, bags:6, jewelry:7, sunglasses:8, parfum:9 };

const CLOTHING_CATEGORIES = ['dresses','tops','bottoms','jackets','sets'];
// Accessories bundles bags, jewelry, and sunglasses into one browsable
// category — mirrors the exact same grouping technique CLOTHING_CATEGORIES
// already uses below, just for a different set of categories.
const ACCESSORY_CATEGORIES = ['bags','jewelry','sunglasses'];

// The `category` values actually relevant to whatever the customer is
// currently browsing. Returns null on the All Products / Sale pages
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
  if (S.currentCategoryPage === 'all-clothing') return CLOTHING_CATEGORIES;
  if (S.currentCategoryPage === 'all-accessories') return ACCESSORY_CATEGORIES;
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

function productBelongsToCollection(product, collection) {
  if (!product || !collection) return false;
  if (collection.collectionType === 'automated') {
    if (collection.automatedRule === 'sale') return hasSalePrice(product);
    if (collection.automatedRule === 'newin') return typeof isProductNew === 'function' && isProductNew(product);
    if (collection.automatedRule === 'freedelivery') return typeof isFreeDeliveryProduct === 'function' && isFreeDeliveryProduct(product);
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
  { v: 'price-desc', l: 'Price High to Low' },
  { v: 'price-asc',  l: 'Price Low to High' },
  { v: 'oldest',     l: 'Oldest' },
  { v: 'discount',   l: 'Biggest Discount' }
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
    const oA = CATEGORY_ORDER[a.category] ?? 99;
    const oB = CATEGORY_ORDER[b.category] ?? 99;
    if (oA !== oB) return oA - oB;
    const pA = Number(hasSalePrice(a) ? a.salePrice : a.price);
    const pB = Number(hasSalePrice(b) ? b.salePrice : b.price);
    const sA = Number.isFinite(pA) ? pA : 0;
    const sB = Number.isFinite(pB) ? pB : 0;
    return sA - sB;
  });
  return applySort(sorted, sortBy);
}

function showLoading(container) { if(container) container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>'; }

// ── FILTERS ──────────────────────────────────────────────────
// Filters available: category, brand, size, on-sale, in-stock.
// The old R500 price band filter is removed entirely.

function passesCommonFilters(p, f) {
  if (f.size && f.size !== 'all' && !(p.sizes || []).includes(f.size)) return false;
  if (f.sizes && f.sizes.length && !(p.sizes || []).some(s => f.sizes.includes(s))) return false;
  if (f.colors && f.colors.length && !productColors(p).some(c => f.colors.includes(c))) return false;
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
  const isAllClothing = S.currentCategoryPage === 'all-clothing';
  const isAllAccessories = S.currentCategoryPage === 'all-accessories';
  const isAll = S.currentCategoryPage === 'all';

  return PRODUCTS.filter(p => {
    if (p.status !== 'active') return false;
    if (S.currentCollectionHandle) {
      const collection = S.currentCollectionData ||
        (window._publishedCollections || []).find(function (item) {
          return String(item.handle || item.slug || item.id) === S.currentCollectionHandle;
        });
      if (!productBelongsToCollection(p, collection)) return false;
    }
    if (p.id === LEATHER_POUCH_ID && S.currentCategoryPage !== 'sunglasses' && !S.currentCollectionHandle) return false;
    if (S.catFilter.vendor.length && !S.catFilter.vendor.includes(p.brand)) return false;

    if (!S.currentCollectionHandle) {
      if (isAllClothing) {
        if (!CLOTHING_CATEGORIES.includes(p.category)) return false;
      } else if (isAllAccessories) {
        if (!ACCESSORY_CATEGORIES.includes(p.category)) return false;
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
const ARRAY_FILTERS = ['cat', 'vendor', 'sizes', 'colors'];
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
  if (opening) { _filterOpenSections = null; renderFilterPanel(); }
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

function updateCollectionTitle() {
  const titleEl = document.getElementById('collection-filter-title-display');
  const headingEl = document.getElementById('collection-page-heading');
  const countEl = document.getElementById('collection-product-count');
  const descEl = document.getElementById('collection-top-description');
  const bcEl = document.getElementById('collection-page-breadcrumb');
  if (!titleEl && !headingEl) return;

  let title = 'ALL PRODUCTS';
  let description = '';
  let collectionImage = '';
  let showDesc = false;

  // catTitles is only the fallback shown before admin-homepage.js's
  // siteContent/collectionPages has loaded (or for a slug nobody's
  // customized yet) — window._siteContent.collectionPages[slug].title
  // overrides it once site-content.js's fetch resolves.
  const catTitles = {
    'all': 'ALL PRODUCTS',
    'sale': 'SALE',
    'newin': 'NEW IN',
    'all-clothing': 'CLOTHING',
    'all-accessories': 'ACCESSORIES',
    'homeware': 'HOMEWARE',
    'dresses': 'DRESSES',
    'tops': 'TOPS',
    'bottoms': 'BOTTOMS',
    'jackets': 'JACKETS',
    'sets': 'SETS',
    'bags': 'BAGS',
    'jewelry': 'JEWELRY',
    'sunglasses': 'SUNGLASSES',
    'parfum': 'SCENT'
  };
  const collectionPages = (window._siteContent && window._siteContent.collectionPages) || {};
  function collectionCopyFor(slug) {
    const custom = collectionPages[slug] || {};
    return {
      title: (custom.title || '').trim() || catTitles[slug] || slug.toUpperCase(),
      description: (custom.description || '').trim()
    };
  }

  if (S.currentCollectionHandle && S.currentCollectionData) {
    const collection = S.currentCollectionData;
    title = String(collection.title || collection.name || collection.handle || S.currentCollectionHandle).toUpperCase();
    description = String(collection.description || '');
    collectionImage = String(collection.imageUrl || '');
    showDesc = !!description || !!collectionImage;
  } else if (S.currentPage === 'vendor' && S.currentVendorId) {
    title = 'BRAND';
    showDesc = false;
  } else if (S.currentPage === 'products') {
    const slug = S.saleMode ? 'sale' : (S.newInMode ? 'newin' : 'all');
    const copy = collectionCopyFor(slug);
    title = copy.title;
    description = copy.description;
    showDesc = !!description;
  } else if (S.currentPage === 'category' && S.currentCategoryPage) {
    const copy = collectionCopyFor(S.currentCategoryPage);
    title = copy.title;
    description = copy.description;
    showDesc = !!description;
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
    headingEl.textContent = title === 'ALL PRODUCTS' ? 'All Products' : title.toLowerCase().replace(/\b\w/g, function (char) { return char.toUpperCase(); });
    headingEl.style.display = 'block';
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

  if (descEl) {
    if (showDesc && (description || collectionImage)) {
      const imageMarkup = collectionImage && safeImageURL(collectionImage) !== PLACEHOLDER_IMAGE ? `<img src="${escapeHTML(safeImageURL(collectionImage))}" alt="" loading="lazy" style="width:100%;max-height:320px;object-fit:cover;display:block;margin:0 0 14px;">` : '';
      const descriptionMarkup = description ? `<p>${escapeHTML(description)}</p>` : '';
      descEl.innerHTML = imageMarkup + descriptionMarkup;
      descEl.style.display = imageMarkup || descriptionMarkup ? 'block' : 'none';
    } else {
      descEl.style.display = 'none';
    }
  }

  // Collection pages have no breadcrumb trail. Brand pages keep this bar
  // for the product page's back arrow on the left and, on the right, the
  // "more" button that opens the report-this-brand panel.
  if (bcEl) {
    const onBrand = S.currentPage === 'vendor';
    bcEl.classList.toggle('has-icons', onBrand);
    bcEl.innerHTML = onBrand
      ? `<button class="product-breadcrumb-back" type="button" onclick="goBackFromProduct()" aria-label="Go back"><i class="ph ph-arrow-left"></i></button><span class="page-breadcrumb-trail"></span><button class="product-breadcrumb-share brand-more-btn" type="button" aria-label="Report this brand" onclick="openBrandReport()"><i class="ph ph-dots-three-circle"></i></button>`
      : '';
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
  if (skip !== 'onSale' && f.onSale && !hasSalePrice(p)) return false;
  if (skip !== 'inStock' && f.inStock && (Number(p.stock) || 0) <= 0) return false;
  return true;
}

// A product's colours, from its variants ("Default" is no colour).
function productColors(p) {
  return [...new Set((p.variants || []).map(v => String(v.color || '').trim()).filter(c => c && c.toLowerCase() !== 'default'))];
}

function filterCategoryLabel(cat) {
  const names = { parfum: 'Scent', jewelry: 'Jewellery' };
  return names[cat] || String(cat).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

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
  cats.sort((a, b) => ((CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)) || String(a).localeCompare(String(b)));
  sections.push({ key: 'cat', title: 'Category', options: cats.map(c => ({ value: c, label: filterCategoryLabel(c), picked: f.cat.includes(c), count: count('cat', p => p.category === c) })) });

  // Brands: not on a brand's own page.
  if (S.currentPage !== 'vendor') {
    const brands = [...new Set(pool.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    sections.push({ key: 'vendor', title: 'Brands', options: brands.map(b => ({ value: b, label: b, picked: f.vendor.includes(b), count: count('vendor', p => p.brand === b) })) });
  }

  // 'OS' is the one-size placeholder, never a real size.
  const sizes = [...new Set(pool.flatMap(p => p.sizes || []).filter(s => s && s !== 'OS'))].sort(compareSizes);
  sections.push({ key: 'sizes', title: 'Size', options: sizes.map(sz => ({ value: sz, label: sz, picked: (f.sizes || []).includes(sz), count: count('sizes', p => (p.sizes || []).includes(sz)) })) });

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
        const action = o.type ? `applyCollectionFilter('${o.type}', ${!o.picked})` : `applyCollectionFilter('${sec.key}','${escapeJSString(o.value)}')`;
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
function renderActiveFilterChips() {
  const container = document.getElementById('active-filter-chips');
  if (!container) return;

  const isCategoryPage = S.currentPage === 'category';
  const f = S.currentPage === 'vendor' ? S.vendorFilter : (isCategoryPage ? S.catFilter : S.filter);

  const chips = [];
  f.cat.forEach(cat => {
    const label = filterCategoryLabel(cat);
    chips.push({ label, onclick: `applyCollectionFilter('cat','${escapeJSString(cat)}')` });
  });
  f.vendor.forEach(brand => {
    chips.push({ label: brand, onclick: `applyCollectionFilter('vendor','${escapeJSString(brand)}')` });
  });
  (f.sizes || []).forEach(size => {
    chips.push({ label: 'Size ' + size, onclick: `applyCollectionFilter('sizes','${escapeJSString(size)}')` });
  });
  (f.colors || []).forEach(color => {
    chips.push({ label: color, onclick: `applyCollectionFilter('colors','${escapeJSString(color)}')` });
  });
  if (f.onSale) chips.push({ label: 'On Sale', onclick: `applyCollectionFilter('onSale', false)` });
  if (f.inStock) chips.push({ label: 'In Stock', onclick: `applyCollectionFilter('inStock', false)` });

  if (!chips.length) { container.innerHTML = ''; return; }

  let html = chips.map(c =>
    `<button class="filter-chip" onclick="${c.onclick}">${escapeHTML(c.label)} <span class="filter-chip-x">&times;</span></button>`
  ).join('');
  html += `<button class="filter-chip-clear" onclick="clearAllCollectionFilters()">Clear all</button>`;

  container.innerHTML = html;
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
// Shared by the All Products, Category, and Sale grids. Page N shows
// exactly products [(N-1)*6, N*6) — a real discrete page, not a
// cumulative "load more" list — with a plain "Page N of M" footer
// (arrow controls either side, no product count), hidden entirely
// when there are 6 or fewer products (nothing to page through).
// Keyed by the grid element's id so All Products and Sale (which
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
      gridEl.innerHTML = pageItems.map(({product, variantIndex}, i) => productCard(product, cols===3, true, variantIndex, pageNum === 1 && i < 4 && (i === 0 ? 'high' : true))).join("");
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

function productCard(p, isLarge, showDetails, variantIndex, eager) {
  const vi = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[p.id] ?? 0);
  const soldOut = (p.stock ?? 0) <= 0;
  const badges = getCardBadges(p);
  const badge = badges.length ? `<div class="product-badge-stack">${badges.map(b => `<span class="product-badge ${badgeClass(b)}">${escapeHTML(b)}</span>`).join('')}</div>` : '';
  const imgs = p.variants?.[vi]?.images;
  const ghost = gridThumbURL(imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE);
  const pid = escapeJSString(p.id);

  const brand = `<div class="product-brand">${escapeHTML(p.brand || '')}</div>`;
  const name = `<div class="product-title">${escapeHTML(p.name)}</div>`;
  const isWished = S.wishlist.some(w => w.id === p.id);
  const wishBtn = `<button class="product-wish-btn${isWished ? ' wished' : ''}" onclick="event.stopPropagation();toggleWish('${pid}', this)"><i class="${isWished ? 'ph-fill' : 'ph'} ph-heart"></i></button>`;

  const onSale = hasSalePrice(p);
  const priceInner = onSale
    ? `<div class="product-price-stack"><span class="product-price-original">${escapeHTML(formatPriceCardStyle(p.price))}</span><span class="product-price product-price-sale">${escapeHTML(formatPriceCardStyle(p.salePrice))}</span></div>`
    : `<span class="product-price">${escapeHTML(formatPriceCardStyle(p.price))}</span>`;
  const swatches = cardVariantSwatchesHtml(p, vi);
  const price = `<div class="product-price-row">${priceInner}${swatches}</div>`;

  const metaRow = `${brand}<div class="product-card-name-row">${name}</div>${price}`;

  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="S.productVariantSelections['${pid}']=${vi};goToProduct('${pid}')">
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" ${eager === 'high' ? 'loading="eager" fetchpriority="high"' : eager ? 'loading="eager"' : 'loading="lazy"'} onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">${wishBtn}</div>
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
    const color = (v && v.swatch) || '#ccc';
    const label = (v && v.color) || ('Variant ' + (i + 1));
    const selected = i === selectedIndex ? ' selected' : '';
    return `<span class="variant-swatch${selected}" style="background:${escapeHTML(color)}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}" onclick="event.stopPropagation();event.preventDefault();selectCardVariant('${pid}', ${i}, this);"></span>`;
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
      const nextSrc = gridThumbURL(imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE);
      imgEl.classList.remove('img-loaded');
      imgEl.src = escapeHTML(nextSrc);
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
  const isWished = S.wishlist.some(w => w.id === p.id);
  const brand = `<div class="product-brand">${escapeHTML(p.brand || '')}</div>`;
  const name = `<div class="product-title">${escapeHTML(p.name)}</div>`;
  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="goToProduct('${pid}')">
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" ${eager === 'high' ? 'loading="eager" fetchpriority="high"' : eager ? 'loading="eager"' : 'loading="lazy"'} onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')"><button class="product-wish-btn${isWished ? ' wished' : ''}" onclick="event.stopPropagation();toggleWish('${pid}', this)"><i class="${isWished ? 'ph-fill' : 'ph'} ph-heart"></i></button></div>
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
// section on the same page (e.g. You May Also Like) already shows.
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
   SWIPE SECTION — Recently Viewed / You May Also Like / Complete the Look
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
  let cp;
  if (S.currentCollectionHandle) cp=getCatFilteredProducts();
  else if(S.currentCategoryPage==='parfum') cp=getCatFilteredProducts().filter(p=>p.category==='parfum');
  else if(S.currentCategoryPage==='jewelry') cp=getCatFilteredProducts().filter(p=>p.category==='jewelry');
  else if(S.currentCategoryPage==='sunglasses') cp=getCatFilteredProducts().filter(p=>p.category==='sunglasses'||p.id===LEATHER_POUCH_ID);
  else if(S.currentCategoryPage==='all-clothing') cp=getCatFilteredProducts().filter(p=>CLOTHING_CATEGORIES.includes(p.category));
  else if(S.currentCategoryPage==='all-accessories') cp=getCatFilteredProducts().filter(p=>ACCESSORY_CATEGORIES.includes(p.category));
  else if(S.currentCategoryPage==='homeware') cp=getCatFilteredProducts().filter(p=>p.category==='homeware');
  else if(CLOTHING_CATEGORIES.includes(S.currentCategoryPage)) cp=getCatFilteredProducts().filter(p=>p.category===S.currentCategoryPage);
  else if(S.currentCategoryPage==='bags') cp=getCatFilteredProducts().filter(p=>p.category===S.currentCategoryPage&&p.id!==LEATHER_POUCH_ID);
  else cp=getCatFilteredProducts();
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
// PRODUCT_NEW_DAYS) instead of on-sale ones. Previously "New In" just
// sorted the entire catalog newest-first without actually filtering
// it, so it looked identical to All Products once you scrolled past
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
  const tabs = [{ label: 'View All', cat: 'all' }].concat(collections.map(function (item) {
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

// "New Arrivals" means newest first — merchandiseProducts()'s own
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
  const active = PRODUCTS.filter(p => p.status === 'active' && CLOTHING_CATEGORIES.includes(p.category));
  const top = merchandiseProducts(active).slice(0, 8);
  grid.innerHTML = top.length ? top.map(p => productCardHome(p)).join('') : placeholderProductCards(6, true);
  initSliderLeadingTracking('clothing-grid');
}

function buildShopByAccessories() {
  const grid = document.getElementById('accessories-grid');
  if (!grid) return;
  const active = PRODUCTS.filter(p => p.status === 'active' && ACCESSORY_CATEGORIES.includes(p.category));
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

async function navigateToVendor(vendorIdOrSlug, replaceUrl) {
  // Shared with every other page-navigation function (see the
  // pageNavGeneration comment in app.js) — guards against this fetch
  // outliving the visit, whether that's a second navigateToVendor()
  // call (another brand) or navigating away to a completely different
  // page (All Products, home, back button, anything).
  const myNavGen = ++pageNavGeneration;
  closeSearch();
  S.saleMode = false;
  S.newInMode = false;
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-vendor").classList.add("active");
  S.currentPage = "vendor";
  removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  // Shows the shared filter bar (grid toggle, FILTER button, title)
  // above the grid, same as the products/category pages.
  document.body.classList.add('on-collection-page');
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
  if (el) el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  // Reset per-visit so a filter/grid choice on one brand's page doesn't
  // carry over to the next brand you look at.
  S.vendorFilter = {cat:[], size:'all', vendor:[], onSale:false, inStock:false};
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
  // started — another brand's page, All Products, back button, anything
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
    const canonicalPath = '/brands/' + encodeURIComponent(vendor?.slug || docId);
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
  updateCollectionTitle();
}

function normalizeBrandName(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/nirious co/g, 'nirius co');
}

// The shared filter bar (#collection-filter-bar, holding the grid
// toggle + FILTER button) and its active-chips row normally live right
// after the nav, above every collection-style page's content — correct
// for All Products/Category, which open straight into a grid with no
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
  if (chips) bar.insertAdjacentElement('afterend', chips);
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
  // Same image source as the homepage's Shop by Brand cards
  // (vendors.js's shopByBrandCardsHtml) — heroImageUrl first, falling
  // back to logoUrl — so a brand's image matches wherever it shows up.
  const heroImg = safeImageURL(vendor?.heroImageUrl || vendor?.logoUrl || '');
  const brandName = vendor?.brand || vendor?.name || '';
  const desc = vendor?.description || '';
  // The brand's logo replaces its name in the hero; the name stays as alt text.
  const logoUrl = /^https:\/\//i.test(String(vendor?.logoUrl || '').trim()) ? vendor.logoUrl.trim() : '';

  const products = merchandiseProducts(getVendorFilteredProducts(vendor), 'vendor', S.sortBy);
  const expanded = expandProductVariants(products);

  el.innerHTML = `
    <section class="vendor-hero-section">
      <div class="vendor-hero-img" style="background-image:url('${escapeForCssUrl(heroImg)}');">
        <div class="vendor-hero-content">
          ${logoUrl
            ? `<h1 class="vendor-hero-name vendor-hero-logo-wrap"><img class="vendor-hero-logo" src="${escapeHTML(logoUrl)}" alt="${escapeHTML(brandName)}"></h1>`
            : `<div class="vendor-hero-name">${escapeHTML(brandName)}</div>`}
          <p class="vendor-hero-desc">${escapeHTML(desc)}</p>
        </div>
      </div>
    </section>
    <section class="site-collection-layout">
      <div class="product-grid" id="vendor-products-grid"></div>
    </section>
  `;

  moveFilterBarBelowVendorHero(el.querySelector('.vendor-hero-section'));

  const gridEl = document.getElementById('vendor-products-grid');
  gridEl.style.gridTemplateColumns = gridTemplateFor(S.gridColsVendor);
  applyGridColsClass(gridEl, S.gridColsVendor);
  renderPaginatedGrid(gridEl, expanded, S.gridColsVendor);
  updateCollectionGridIcon();
  updateCollectionTitle();
  renderFilterPanel();
  renderActiveFilterChips();
  injectToolbarExtras('page-vendor', 'col-grid-icon');

  const footerEl = document.getElementById('vendor-footer');
  if (footerEl && typeof buildFooter === 'function') {
    buildFooter('vendor-footer');
    if (typeof renderVendorsFooter === 'function') renderVendorsFooter(S.vendors || []);
  }
}

window.navigateToVendor = navigateToVendor;


// ---- Report this brand ----
// Bottom panel opened from the brand page's "more" button. Reports go to
// server.js /api/report-brand, which saves them and emails the
// Janedore team; the brand is never told who reported them.
const BRAND_REPORT_REASONS = ['Counterfeit or fake product', 'Item not as described', 'Problem with an order', 'Offensive or misleading content', 'Something else'];

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
      <h2 id="brand-report-title">Report ${escapeHTML(brandName)}</h2>
      <button type="button" class="brand-report-close" onclick="closeBrandReport()" aria-label="Close"><i class="ph ph-x"></i></button>
    </div>
    <form id="brand-report-form" onsubmit="submitBrandReport(event)">
      <p class="brand-report-intro">Tell us what's wrong. Your report goes to the JANEDORE team, not to the brand.</p>
      <div class="brand-report-reasons">${BRAND_REPORT_REASONS.map((r, i) => `<label class="brand-report-reason"><input type="radio" name="reason" value="${escapeHTML(r)}"${i === 0 ? ' required' : ''}><span>${escapeHTML(r)}</span></label>`).join('')}</div>
      <label class="brand-report-label" for="brand-report-details">Details <span>(optional)</span></label>
      <textarea id="brand-report-details" name="details" rows="4" maxlength="2000" placeholder="What happened? Include an order number if you have one."></textarea>
      <label class="brand-report-label" for="brand-report-email">Your email <span>(optional, so we can follow up)</span></label>
      <input id="brand-report-email" name="email" type="email" maxlength="200" autocomplete="email" value="${escapeHTML(email)}">
      <div class="brand-report-msg" id="brand-report-msg" role="status"></div>
      <button type="submit" class="brand-report-submit">Send Report</button>
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
  if (reason === 'Something else' && !details) { msg.textContent = 'Please tell us what happened.'; form.details.focus(); return; }
  btn.disabled = true; btn.textContent = 'Sending...'; msg.textContent = '';
  try {
    const res = await fetch('/api/report-brand', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: S.currentVendor && S.currentVendor.id, reason, details, email: form.email.value.trim() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not send your report. Please try again.');
    const sentTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim()) ? form.email.value.trim() : '';
    form.innerHTML = `<div class="brand-report-done"><i class="ph ph-check-circle"></i><p><strong>Thank you. We've received your report.</strong></p><p>Our team will look into it. The brand won't be told who sent it.${sentTo ? ' We\'ve sent a copy to ' + escapeHTML(sentTo) + '.' : ''}</p><button type="button" class="brand-report-submit" onclick="closeBrandReport()">Done</button></div>`;
  } catch (err) {
    msg.textContent = err.message;
    btn.disabled = false; btn.textContent = 'Send Report';
  }
}
