function formatPrice(price) {
  const n = Number(price);
  const safe = Number.isFinite(n) ? n : 0;
  return 'R' + safe.toLocaleString('en-US');
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
  if (S.currentCategoryPage === 'all-clothing') return CLOTHING_CATEGORIES;
  if (S.currentCategoryPage === 'all-accessories') return ACCESSORY_CATEGORIES;
  return [S.currentCategoryPage];
}
const LEATHER_POUCH_ID = 'janedore-leather-pouch';

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
    default: return products;
  }
}

function setSortBy(value) {
  S.sortBy = value;
  if (S.saleMode) renderSaleProducts();
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
    if (p.id === LEATHER_POUCH_ID && S.currentCategoryPage !== 'sunglasses') return false;
    if (S.catFilter.vendor.length && !S.catFilter.vendor.includes(p.brand)) return false;

    if (isAllClothing) {
      if (!CLOTHING_CATEGORIES.includes(p.category)) return false;
    } else if (isAllAccessories) {
      if (!ACCESSORY_CATEGORIES.includes(p.category)) return false;
    } else if (!isAll && S.currentCategoryPage && p.category !== S.currentCategoryPage) {
      return false;
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
function toggleArrayFilter(filterObj, type, value) {
  const arr = filterObj[type];
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value); else arr.splice(idx, 1);
}

function applyFilter(type, value) {
  if (type === 'cat' || type === 'vendor') toggleArrayFilter(S.filter, type, value);
  else S.filter[type] = value;
  if (S.saleMode) renderSaleProducts();
  else renderAllProducts();
}

function applyCatFilter(type, value) {
  if (type === 'cat' || type === 'vendor') toggleArrayFilter(S.catFilter, type, value);
  else S.catFilter[type] = value;
  renderCategoryProducts();
}

function applyVendorFilter(type, value) {
  if (type === 'cat' || type === 'vendor') toggleArrayFilter(S.vendorFilter, type, value);
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
    if (S.saleMode) renderSaleProducts(); else renderAllProducts();
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

function toggleCollectionFilter() {
  const el = document.getElementById('collection-filter-options');
  const backdrop = document.getElementById('collection-filter-backdrop');
  if(!el) return;
  const isOpen = el.classList.toggle("open");
  if(backdrop) backdrop.classList.toggle("open", isOpen);
}

function applyCollectionFilter(type, value) {
  const el = document.getElementById('collection-filter-options');
  const backdrop = document.getElementById('collection-filter-backdrop');
  if(el) el.classList.remove("open");
  if(backdrop) backdrop.classList.remove("open");
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
  const descEl = document.getElementById('collection-top-description');
  const bcEl = document.getElementById('collection-page-breadcrumb');
  if (!titleEl) return;

  let title = 'ALL PRODUCTS';
  let description = '';
  let showDesc = false;
  let bcLabel = title;

  // catTitles is only the fallback shown before admin-homepage.js's
  // siteContent/collectionPages has loaded (or for a slug nobody's
  // customized yet) — window._siteContent.collectionPages[slug].title
  // overrides it once site-content.js's fetch resolves.
  const catTitles = {
    'all': 'ALL PRODUCTS',
    'sale': 'SALE',
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

  if (S.currentPage === 'vendor' && S.currentVendorId) {
    title = 'BRAND';
    showDesc = false;
    const vendorName = S.currentVendor ? (S.currentVendor.name || S.currentVendor.brandName || S.currentVendor.brand) : null;
    bcLabel = vendorName || 'Brand';
  } else if (S.currentPage === 'products') {
    const copy = collectionCopyFor(S.saleMode ? 'sale' : 'all');
    title = copy.title;
    description = copy.description;
    showDesc = !!description;
    bcLabel = S.saleMode ? 'Sale' : 'All Products';
  } else if (S.currentPage === 'category' && S.currentCategoryPage) {
    const copy = collectionCopyFor(S.currentCategoryPage);
    title = copy.title;
    description = copy.description;
    showDesc = !!description;
    bcLabel = title.charAt(0) + title.slice(1).toLowerCase();
  } else {
    if (titleEl) titleEl.style.display = 'none';
    if (descEl) descEl.style.display = 'none';
    if (bcEl) bcEl.innerHTML = '';
    return;
  }

  if (titleEl) {
    titleEl.style.display = 'block';
    titleEl.textContent = title;
  }

  if (descEl) {
    if (showDesc && description) {
      descEl.innerHTML = `<p>${description}</p>`;
      descEl.style.display = 'block';
    } else {
      descEl.style.display = 'none';
    }
  }

  if (bcEl) {
    bcEl.innerHTML = `<span onclick="navigateTo('home')">Home</span><span class="page-breadcrumb-sep">/</span><span class="page-breadcrumb-current">${escapeHTML(bcLabel)}</span>`;
  }
}

// Standard faceted-search behavior (ASOS, Superbalist, COS): each facet
// is multi-select (checkboxes, OR within the facet), option counts are
// computed against every OTHER active filter so a shopper can see what
// picking one would actually do, and any option that would return zero
// results is hidden outright rather than shown as a dead end.
function buildCategoryFilterOptions() {
  const filterContainer = document.getElementById('collection-filter-categories');
  if (!filterContainer) return;

  const isCategoryPage = S.currentPage === 'category';
  const isVendorPage = S.currentPage === 'vendor';
  const f = isVendorPage ? S.vendorFilter : (isCategoryPage ? S.catFilter : S.filter);
  const scope = getCategoryFilterScope();
  // Restricts counts to just this brand's own products, same as
  // getVendorFilteredProducts() — otherwise a vendor page's category
  // counts would show site-wide totals instead of this brand's.
  const vendorIds = isVendorPage ? new Set(getVendorBaseProducts(S.currentVendor).map(p => p.id)) : null;

  let categories = [...new Set(PRODUCTS.filter(p => p.status === 'active').map(p => p.category).filter(Boolean))];
  if (scope) categories = categories.filter(c => scope.includes(c));

  categories.sort((a, b) => {
    const oA = CATEGORY_ORDER[a] ?? 99;
    const oB = CATEGORY_ORDER[b] ?? 99;
    if (oA !== oB) return oA - oB;
    return String(a).localeCompare(String(b));
  });

  const countFor = cat => PRODUCTS.filter(p => {
    if (p.status !== 'active' || p.category !== cat) return false;
    if (isVendorPage) return vendorIds.has(p.id) && passesCommonFilters(p, f);
    if (isCategoryPage && p.id === LEATHER_POUCH_ID && S.currentCategoryPage !== 'sunglasses') return false;
    if (f.vendor.length && !f.vendor.includes(p.brand)) return false;
    return passesCommonFilters(p, f);
  }).length;

  let html = '';
  categories.forEach(cat => {
    const count = countFor(cat);
    if (count === 0 && !f.cat.includes(cat)) return;
    const label = String(cat).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const checked = f.cat.includes(cat) ? 'checked' : '';
    html += `<label class="filter-option"><input type="checkbox" ${checked} onchange="applyCollectionFilter('cat','${escapeJSString(cat)}')"> ${escapeHTML(label)} <span class="filter-option-count">(${count})</span></label>`;
  });

  filterContainer.innerHTML = html || '<div class="filter-empty-note">No filters available</div>';
}

function buildBrandFilterOptions() {
  const filterContainer = document.getElementById('collection-filter-brands');
  if (!filterContainer) return;

  // Every product on a vendor page is already that one brand, so a
  // brand filter has nothing to do there — hide the whole group
  // instead of showing it with a single, always-checked option.
  const filterGroup = filterContainer.closest('.filter-group');
  if (S.currentPage === 'vendor') {
    if (filterGroup) filterGroup.style.display = 'none';
    return;
  }
  if (filterGroup) filterGroup.style.display = '';

  const isCategoryPage = S.currentPage === 'category';
  const f = isCategoryPage ? S.catFilter : S.filter;
  const scope = getCategoryFilterScope();

  let pool = PRODUCTS.filter(p => p.status === 'active');
  if (scope) pool = pool.filter(p => scope.includes(p.category));
  if (isCategoryPage) pool = pool.filter(p => p.id !== LEATHER_POUCH_ID || S.currentCategoryPage === 'sunglasses');

  const brands = [...new Set(pool.map(p => p.brand).filter(Boolean))].sort();

  const countFor = brand => pool.filter(p => {
    if (p.brand !== brand) return false;
    if (f.cat.length && !f.cat.includes(p.category)) return false;
    return passesCommonFilters(p, f);
  }).length;

  let html = '';
  brands.forEach(brand => {
    const count = countFor(brand);
    if (count === 0 && !f.vendor.includes(brand)) return;
    const checked = f.vendor.includes(brand) ? 'checked' : '';
    html += `<label class="filter-option"><input type="checkbox" ${checked} onchange="applyCollectionFilter('vendor','${escapeJSString(brand)}')"> ${escapeHTML(brand)} <span class="filter-option-count">(${count})</span></label>`;
  });

  filterContainer.innerHTML = html || '<div class="filter-empty-note">No filters available</div>';
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
    const label = String(cat).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    chips.push({ label, onclick: `applyCollectionFilter('cat','${escapeJSString(cat)}')` });
  });
  f.vendor.forEach(brand => {
    chips.push({ label: brand, onclick: `applyCollectionFilter('vendor','${escapeJSString(brand)}')` });
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

    gridEl.innerHTML = pageItems.map(({product, variantIndex}) => productCard(product, cols===3, true, variantIndex)).join("");
    applyEditorialGrid(gridEl, cols);

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

function productCard(p, isLarge, showDetails, variantIndex) {
  const vi = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[p.id] ?? 0);
  const soldOut = (p.stock ?? 0) <= 0;
  const badges = getProductBadges(p);
  const badge = badges.length ? `<div class="product-badge-stack">${badges.map(b => `<span class="product-badge">${escapeHTML(b)}</span>`).join('')}</div>` : '';
  const imgs = p.variants?.[vi]?.images;
  const ghost = gridThumbURL(imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE);
  const pid = escapeJSString(p.id);

  const brand = `<div class="product-brand">${escapeHTML(p.brand || '')}</div>`;
  const name = `<div class="product-title">${escapeHTML(p.name)}</div>`;
  const isWished = S.wishlist.some(w => w.id === p.id);
  const wishBtn = `<button class="product-wish-btn${isWished ? ' wished' : ''}" onclick="event.stopPropagation();toggleWish('${pid}', this)"><i class="${isWished ? 'ph-fill' : 'ph-light'} ph-heart"></i></button>`;

  const onSale = hasSalePrice(p);
  const priceInner = onSale
    ? `<div class="product-price-stack"><span class="product-price-original">${escapeHTML(formatPriceCardStyle(p.price))}</span><span class="product-price product-price-sale">${escapeHTML(formatPriceCardStyle(p.salePrice))}</span></div>`
    : `<span class="product-price">${escapeHTML(formatPriceCardStyle(p.price))}</span>`;
  const swatches = cardVariantSwatchesHtml(p, vi);
  const price = `<div class="product-price-row">${priceInner}${swatches}</div>`;

  const metaRow = `${brand}<div class="product-card-name-row">${name}</div>${price}`;

  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="S.productVariantSelections['${pid}']=${vi};goToProduct('${pid}')">
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" loading="lazy" onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">${wishBtn}</div>
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

function productCardHome(p) {
  const badges = getProductBadges(p);
  const badge = badges.length ? `<div class="product-badge-stack">${badges.map(b => `<span class="product-badge">${escapeHTML(b)}</span>`).join('')}</div>` : '';
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
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" loading="lazy" onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')"><button class="product-wish-btn${isWished ? ' wished' : ''}" onclick="event.stopPropagation();toggleWish('${pid}', this)"><i class="${isWished ? 'ph-fill' : 'ph-light'} ph-heart"></i></button></div>
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
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  renderActiveFilterChips();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

function renderCategoryProducts() {
  if(!S.currentCategoryPage || !DOM.categoryProductsGrid) return;
  restoreCollectionFilterBar();
  let cp;
  if(S.currentCategoryPage==='parfum') cp=getCatFilteredProducts().filter(p=>p.category==='parfum');
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
  if (expanded.length) {
    renderPaginatedGrid(DOM.categoryProductsGrid, expanded, S.gridColsCat);
  } else {
    DOM.categoryProductsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No products in this category yet.</div>';
  }
  updateGridToggleSVG("cat-grid-toggle-svg",S.gridColsCat);
  if(DOM.categoryDescriptionWrap){DOM.categoryDescriptionWrap.innerHTML='';}
  renderCollectionSortingTabs();
  updateCollectionTitle();
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  renderActiveFilterChips();
  injectToolbarExtras('page-category', 'cat-grid-toggle-svg');
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
  if (expanded.length) {
    renderPaginatedGrid(DOM.allProductsGrid, expanded, S.gridCols);
  } else {
    DOM.allProductsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No sale items at the moment.</div>';
  }
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
  updateCollectionTitle();
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  renderActiveFilterChips();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

function injectToolbarExtras(pageId, gridSvgId) {
  const page = document.getElementById(pageId);
  if (!page) return;

  // #collection-filter-options is a single global panel shared by every
  // page (it sits outside all .page containers in index.html), not
  // nested inside whichever page is currently active — page.querySelector
  // here always came back empty, so the On Sale/In Stock checkboxes
  // this builds were never actually appended anywhere, on any page.
  const oldExtras = document.querySelector('.filter-extras-injected');
  if (oldExtras) oldExtras.remove();

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

  const panel = document.getElementById('collection-filter-options');
  if (panel) {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter-extras-injected';
    wrapper.innerHTML = buildFilterExtras();
    panel.appendChild(wrapper);
  }
}

function buildSortControl() {
  const current = S.sortBy || 'featured';
  const options = [
    { v: 'featured',     l: 'Featured' },
    { v: 'best-selling', l: 'Best Selling' },
    { v: 'price-asc',    l: 'Price: Low to High' },
    { v: 'price-desc',   l: 'Price: High to Low' },
    { v: 'newest',       l: 'Newest first' },
    { v: 'oldest',       l: 'Oldest first' },
    { v: 'name-asc',     l: 'Name: A → Z' }
  ];
  return `<select id="sort-by" class="filter-select sort-by-select" onchange="setSortBy(this.value)">` +
    options.map(o => `<option value="${o.v}"${current === o.v ? ' selected' : ''}>${escapeHTML(o.l)}</option>`).join('') +
  `</select>`;
}

function buildFilterExtras() {
  const f = S.currentPage === 'vendor' ? S.vendorFilter : (S.currentPage === 'category' ? S.catFilter : S.filter);
  const onSale = f.onSale ? 'checked' : '';
  const inStock = f.inStock ? 'checked' : '';
  return `
    <div class="filter-group">
      <div class="filter-group-title">Availability</div>
      <label class="filter-option"><input type="checkbox" ${onSale} onchange="applyCollectionFilter('onSale', this.checked)"> On sale only</label>
      <label class="filter-option"><input type="checkbox" ${inStock} onchange="applyCollectionFilter('inStock', this.checked)"> In stock only</label>
    </div>
  `;
}

function toggleGrid() { S.gridCols = S.gridCols === 1 ? 2 : S.gridCols === 2 ? 3 : 1; if(S.saleMode) renderSaleProducts(); else renderAllProducts(); updateGridToggleSVG("grid-toggle-svg", S.gridCols); updateCollectionGridIcon(); }

function toggleGridCat() { S.gridColsCat = S.gridColsCat === 1 ? 2 : S.gridColsCat === 2 ? 3 : 1; renderCategoryProducts(); updateGridToggleSVG("cat-grid-toggle-svg", S.gridColsCat); updateCollectionGridIcon(); }

function toggleGridVendor() { S.gridColsVendor = S.gridColsVendor === 1 ? 2 : S.gridColsVendor === 2 ? 3 : 1; renderVendorPage(S.currentVendor); updateCollectionGridIcon(); }

function renderCollectionSortingTabs() {
  const page = document.getElementById(S.currentPage === 'products' ? 'page-products' : 'page-category');
  if (!page) return;
  let existing = page.querySelector('.collection-sorting-tabs');
  if (existing) existing.remove();
  const tabs = [
    { label: 'View All', cat: 'all' }, { label: 'Clothing', cat: 'all-clothing' }, { label: 'Accessories', cat: 'all-accessories' }, { label: 'Homeware', cat: 'homeware' }, { label: 'Scent', cat: 'parfum' }
  ];
  let active;
  if (S.currentPage === 'category') {
    if (CLOTHING_CATEGORIES.includes(S.currentCategoryPage)) active = 'all-clothing';
    else if (ACCESSORY_CATEGORIES.includes(S.currentCategoryPage)) active = 'all-accessories';
    else active = S.currentCategoryPage;
  } else {
    active = S.activeSortTab || (S.saleMode ? 'sale' : 'all');
  }
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
  if (cat === 'sale') { navigateToSale(); return; }
  S.saleMode = false;
  if (cat === 'all') { S.filter.cat = []; S.filter.vendor = []; updateHash('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.currentCategoryPage = null; renderAllProducts(); }
  else { navigateToCategory(cat); }
  renderCollectionSortingTabs();
  window.scrollTo({top:0,behavior:"smooth"});
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
function buildArrivals() { if(DOM.arrivalsGrid) { const active = PRODUCTS.filter(p=>p.status==='active'); DOM.arrivalsGrid.innerHTML = merchandiseProducts(active, undefined, 'newest').slice(0,8).map(p=>productCardHome(p)).join(""); initSliderLeadingTracking('arrivals-grid'); } buildShopByClothing(); buildNewsletterSection(); }

function buildShopByClothing() {
  const grid = document.getElementById('clothing-grid');
  if (!grid) return;
  const active = PRODUCTS.filter(p => p.status === 'active' && CLOTHING_CATEGORIES.includes(p.category));
  grid.innerHTML = merchandiseProducts(active).slice(0, 8).map(p => productCardHome(p)).join('');
  initSliderLeadingTracking('clothing-grid');
}

// #arrivals-grid / #clothing-grid are horizontal scroll-snap sliders,
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

// Heading/subtext/disclaimer start as literal empty-state placeholders —
// site-content.js overwrites them with the admin-set siteContent/homepage
// copy once that fetch resolves (see renderSiteContent() there). Nothing
// here is hardcoded marketing copy anymore; it's just what shows if the
// admin hasn't filled the Newsletter section in yet.
function buildNewsletterSection() { if(!DOM.homepageNewsletterSection) return; DOM.homepageNewsletterSection.innerHTML = `<div class="newsletter-section"><div class="newsletter-title" id="newsletter-heading">Heading</div><p class="newsletter-subtext" id="newsletter-subtext"></p><div class="newsletter-form"><input class="newsletter-input" type="email" placeholder="Enter your email" id="newsletter-email"><button class="newsletter-btn" onclick="subscribeNewsletter(document.getElementById('newsletter-email').value)"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button></div><p class="newsletter-disclaimer" id="newsletter-disclaimer"></p></div>`; }

// ==================== VENDOR / BRAND PAGE ====================

async function navigateToVendor(vendorIdOrSlug, replaceUrl) {
  closeSearch();
  S.saleMode = false;
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
  S.currentVendorId = docId;

  try {
    const doc = await db.collection('vendors').doc(docId).get();
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
    console.error('Error fetching vendor:', e);
    S.currentVendor = null;
    renderVendorPage(null);
  }
  window.scrollTo({top:0,behavior:"instant"});
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
  S.currentVendor = vendor;
  const heroImg = safeImageURL(vendor?.heroImageUrl || vendor?.logoUrl || '');
  const brandName = vendor?.brand || vendor?.name || '';
  const desc = vendor?.description || '';

  const products = merchandiseProducts(getVendorFilteredProducts(vendor), 'vendor', S.sortBy);
  const expanded = expandProductVariants(products);

  el.innerHTML = `
    <section class="vendor-hero-section">
      <div class="vendor-hero-img" style="background-image:url('${escapeForCssUrl(heroImg)}');">
        <div class="vendor-hero-content">
          <div class="vendor-hero-name">${escapeHTML(brandName)}</div>
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
  if (expanded.length) {
    renderPaginatedGrid(gridEl, expanded, S.gridColsVendor);
  } else {
    gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No products match these filters.</div>';
  }
  updateCollectionGridIcon();
  updateCollectionTitle();
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  renderActiveFilterChips();
  injectToolbarExtras('page-vendor', 'col-grid-icon');

  const footerEl = document.getElementById('vendor-footer');
  if (footerEl && typeof buildFooter === 'function') {
    buildFooter('vendor-footer');
    if (typeof renderVendorsFooter === 'function') renderVendorsFooter(S.vendors || []);
  }
}

window.navigateToVendor = navigateToVendor;
