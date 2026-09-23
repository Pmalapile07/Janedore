// Canonical formatPrice — the only one left after removing the dead
// duplicate that used to live in product-detail.js (same function name,
// this one wins since collection.js loads after it). Merged in that
// duplicate's currency-symbol-switching (via S.currency/CURRENCIES),
// which had never actually run before now — number formatting itself
// (comma-grouped, no decimals) is unchanged from what's already live.
function formatPrice(price) {
  const n = Number(price);
  const safe = Number.isFinite(n) ? n : 0;
  const symbol = (typeof CURRENCIES !== 'undefined' && CURRENCIES[S.currency]?.symbol) || 'R';
  return symbol + safe.toLocaleString('en-US');
}

function hasSalePrice(p) {
  if (!p || p.salePrice === null || p.salePrice === undefined || p.salePrice === '') {
    return false;
  }
  return Number.isFinite(Number(p.salePrice));
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

function escapeForCssUrl(url) {
  const safe = safeImageURL(url);
  return String(safe).replace(/['"\\\n\r]/g, '');
}

const COLLECTION_DESCRIPTIONS = {
  'all-clothing': 'Our complete clothing edit — refined silhouettes for the modern wardrobe.', 'dresses': 'Effortless dresses that balance structure and fluidity.', 'tops': 'Elevated essentials, from sculptural blouses to relaxed knits.', 'bottoms': 'Tailored trousers and fluid skirts with quiet intention.', 'jackets': 'Outerwear that defines the silhouette — sharp, soft, and considered.', 'sets': 'Coordinated pieces designed to be worn together or styled apart.', 'bags': 'Understated accessories that complete the look without saying too much.', 'jewelry': 'Sculptural adornments — timeless pieces with modern sensibility.', 'sunglasses': 'Bold yet refined eyewear for the discerning gaze.', 'parfum': 'A study in scent. THATO parfums are crafted for the considered wearer.', 'all-accessories': 'Bags, jewelry, and eyewear — the details that finish the look.', 'homeware': 'Considered pieces for the home. New arrivals coming soon.', 'all': 'Explore the complete edit of considered pieces, distinctive designs, and understated essentials.'
};
const CATEGORY_ORDER = { tops:1, bottoms:2, dresses:3, sets:4, jackets:5, bags:6, jewelry:7, sunglasses:8, parfum:9 };

const CLOTHING_CATEGORIES = ['dresses','tops','bottoms','jackets','sets'];
// Accessories bundles bags, jewelry, sunglasses, and shoes into one browsable
// category — mirrors the exact same grouping technique CLOTHING_CATEGORIES
// already uses below, just for a different set of categories.
// TEMPORARY: this list is hardcoded for now to fix the homepage/nav layout.
// The plan is to move this grouping into Firestore (admin-managed) later —
// see conversation. When that happens, this array goes away and the JS
// reads the grouping from the database instead.
const ACCESSORY_CATEGORIES = ['bags','jewelry','sunglasses','shoes'];
const LEATHER_POUCH_ID = 'janedore-leather-pouch';

function gridTemplateFor(cols) {
  return cols === 1 ? "1fr" : cols === 2 ? "repeat(2,1fr)" : "repeat(3,1fr)";
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
    if (S.filter.cat !== 'all' && p.category !== S.filter.cat) return false;
    if (S.filter.vendor && p.brand !== S.filter.vendor) return false;
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
    if (S.catFilter.vendor && p.brand !== S.catFilter.vendor) return false;

    if (isAllClothing) {
      if (!CLOTHING_CATEGORIES.includes(p.category)) return false;
    } else if (isAllAccessories) {
      if (!ACCESSORY_CATEGORIES.includes(p.category)) return false;
    } else if (!isAll && S.currentCategoryPage && p.category !== S.currentCategoryPage) {
      return false;
    }

    return passesCommonFilters(p, S.catFilter);
  });
}

function applyFilter(type, value) {
  S.filter[type] = value;
  if (S.saleMode) renderSaleProducts();
  else renderAllProducts();
}

function applyCatFilter(type, value) {
  S.catFilter[type] = value;
  renderCategoryProducts();
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
  updateCollectionGridIcon();
}

function toggleCollectionGrid() {
  if (S.currentPage === 'products') { toggleGrid(); }
  else if (S.currentPage === 'category') { toggleGridCat(); }
  updateCollectionGridIcon();
}

function updateCollectionGridIcon() {
  const icon = document.getElementById('col-grid-icon');
  if (!icon) return;
  let cols;
  if (S.currentPage === 'products') { cols = S.gridCols || 2; }
  else if (S.currentPage === 'category') { cols = S.gridColsCat || 2; }
  else { cols = 2; }
  icon.classList.remove('cols-1', 'cols-2', 'cols-3');
  if (cols === 1) { icon.classList.add('cols-1'); }
  else if (cols === 3) { icon.classList.add('cols-3'); }
  else { icon.classList.add('cols-2'); }
}

function updateCollectionTitle() {
  const titleEl = document.getElementById('collection-filter-title-display');
  const descEl = document.getElementById('collection-top-description');
  if (!titleEl) return;
  
  let title = 'ALL PRODUCTS';
  let description = '';
  let showDesc = false;
  
  if (S.currentPage === 'vendor' && S.currentVendorId) {
    title = 'BRAND';
    showDesc = false;
  } else if (S.currentPage === 'products') {
    title = S.saleMode ? 'SALE' : 'ALL PRODUCTS';
    description = COLLECTION_DESCRIPTIONS['all'];
    showDesc = true;
  } else if (S.currentPage === 'category' && S.currentCategoryPage) {
    const catTitles = {
      'all': 'ALL PRODUCTS',
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
    title = catTitles[S.currentCategoryPage] || S.currentCategoryPage.toUpperCase();
    // Hardcoded category description text is intentionally not shown
    // on category pages anymore — title only.
    showDesc = false;
  } else {
    if (titleEl) titleEl.style.display = 'none';
    if (descEl) descEl.style.display = 'none';
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
}

function buildCategoryFilterOptions() {
  const filterContainer = document.getElementById('collection-filter-categories');
  if (!filterContainer) return;
  
  const categories = [...new Set(PRODUCTS.filter(p => p.status === 'active').map(p => p.category).filter(Boolean))];
  
  categories.sort((a, b) => {
    const oA = CATEGORY_ORDER[a] ?? 99;
    const oB = CATEGORY_ORDER[b] ?? 99;
    if (oA !== oB) return oA - oB;
    return String(a).localeCompare(String(b));
  });

  const activeCat = (S.currentPage === 'category')
    ? (S.catFilter?.cat || 'all')
    : (S.filter?.cat || 'all');
  
  let html = `<label class="filter-option"><input type="radio" name="filter-cat-collection" value="all" ${activeCat === 'all' ? 'checked' : ''} onchange="applyCollectionFilter('cat','all')"> All</label>`;
  
  categories.forEach(cat => {
    const label = String(cat).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const checked = activeCat === cat ? 'checked' : '';
    html += `<label class="filter-option"><input type="radio" name="filter-cat-collection" value="${escapeHTML(cat)}" ${checked} onchange="applyCollectionFilter('cat','${escapeJSString(cat)}')"> ${escapeHTML(label)}</label>`;
  });
  
  filterContainer.innerHTML = html;
}

function buildBrandFilterOptions() {
  const filterContainer = document.getElementById('collection-filter-brands');
  if (!filterContainer) return;

  const brands = [...new Set(PRODUCTS.filter(p => p.status === 'active').map(p => p.brand).filter(Boolean))].sort();

  const activeBrand = (S.currentPage === 'category')
    ? (S.catFilter?.vendor || 'all')
    : (S.filter?.vendor || 'all');

  let html = `<label class="filter-option"><input type="radio" name="filter-brand-collection" value="all" ${activeBrand === 'all' ? 'checked' : ''} onchange="applyCollectionFilter('vendor', null)"> All</label>`;

  brands.forEach(brand => {
    const checked = activeBrand === brand ? 'checked' : '';
    html += `<label class="filter-option"><input type="radio" name="filter-brand-collection" value="${escapeHTML(brand)}" ${checked} onchange="applyCollectionFilter('vendor','${escapeJSString(brand)}')"> ${escapeHTML(brand)}</label>`;
  });

  filterContainer.innerHTML = html;
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
  const expanded = [];
  products.forEach(p => {
    const variants = p.variants || [];
    if (variants.length <= 1) {
      expanded.push({ product: p, variantIndex: 0 });
    } else {
      variants.forEach((v, i) => {
        expanded.push({ product: p, variantIndex: i });
      });
    }
  });
  return expanded;
}

function productCard(p, isLarge, showDetails, variantIndex) {
  const vi = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[p.id] ?? 0);
  const soldOut = (p.stock ?? 0) <= 0;
  const badgeLabel = p.badge ? (p.badge === 'sold' ? 'SOLD OUT' : String(p.badge).toUpperCase()) : '';
  const badge = badgeLabel ? `<span class="product-badge">${escapeHTML(badgeLabel)}</span>` : '';
  const imgs = p.variants?.[vi]?.images;
  const ghost = safeImageURL(imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE);
  
  const brand = p.brand ? `<div class="product-brand">${escapeHTML(p.brand)}</div>` : '';
  const name = `<div class="product-title">${escapeHTML(p.name)}</div>`;
  
  const price = hasSalePrice(p)
    ? `<div class="product-price-row"><span class="product-price product-price-sale">${formatPrice(p.salePrice)}</span><span class="product-price-original">${formatPrice(p.price)}</span></div>`
    : `<div class="product-price-row"><span class="product-price">${formatPrice(p.price)}</span></div>`;

  const pid = escapeJSString(p.id);
  // Swatches removed from cards — replaced by a wishlist bookmark toggle
  // in the same spot, wired to toggleWish() (wishlist.js) via the thin
  // wrapper toggleWishFromCard() below, which just swaps this one icon's
  // class instead of re-rendering the whole card.
  const isWished = S.wishlist.some(w => w.id === p.id);
  const wishRow = `<div class="product-wish-row"><button type="button" class="product-wish-btn" onclick="event.stopPropagation();event.preventDefault();toggleWishFromCard('${pid}', this.firstElementChild);"><i class="${isWished ? 'ph-fill' : 'ph-light'} ph-bookmark-simple"></i></button></div>`;

  const metaRow = showDetails !== false ? `${brand}${name}${price}${wishRow}` : brand;

  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" data-product-id="${pid}" onclick="S.productVariantSelections['${pid}']=${vi};goToProduct('${pid}')">
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" loading="lazy" onload="this.classList.add('img-loaded')"></div>
      ${metaRow}
    </div>`;
}

// ── TOOLBAR HELPERS ──────────────────────────────────────────
// Sort dropdown + on-sale + in-stock checkboxes are injected into the existing
// toolbar. The filter-panel HTML is built here so all three render functions
// stay consistent.

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
  const f = (S.currentPage === 'category') ? S.catFilter : S.filter;
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

// ── RENDERERS ────────────────────────────────────────────────

function renderAllProducts() {
  if(!DOM.allProductsGrid) return;
  let prods = merchandiseProducts(getFilteredProducts(), undefined, S.sortBy);
  const expanded = expandProductVariants(prods);
  DOM.allProductsGrid.style.gridTemplateColumns = gridTemplateFor(S.gridCols);
  DOM.allProductsGrid.innerHTML = expanded.map(({product, variantIndex}) => productCard(product, S.gridCols===3, true, variantIndex)).join("");
  applyEditorialGrid(DOM.allProductsGrid, S.gridCols);
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
  updateCollectionTitle();
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

function renderCategoryProducts() {
  if(!S.currentCategoryPage || !DOM.categoryProductsGrid) return;
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
  DOM.categoryProductsGrid.innerHTML = expanded.length
    ? expanded.map(({product, variantIndex}) => productCard(product, S.gridColsCat===3, true, variantIndex)).join("")
    : '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No products in this category yet.</div>';
  applyEditorialGrid(DOM.categoryProductsGrid, S.gridColsCat);
  updateGridToggleSVG("cat-grid-toggle-svg",S.gridColsCat);
  if(DOM.categoryDescriptionWrap){DOM.categoryDescriptionWrap.innerHTML='';}
  renderCollectionSortingTabs();
  updateCollectionTitle();
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  injectToolbarExtras('page-category', 'cat-grid-toggle-svg');
}

function renderSaleProducts() { 
  if(!DOM.allProductsGrid) return;

  let filtered = PRODUCTS.filter(p => p.status === 'active' && hasSalePrice(p));

  if (S.filter.cat !== 'all') {
    filtered = filtered.filter(p => p.category === S.filter.cat);
  }
  if (S.filter.vendor) {
    filtered = filtered.filter(p => p.brand === S.filter.vendor);
  }
  if (S.filter.size && S.filter.size !== 'all') {
    filtered = filtered.filter(p => (p.sizes || []).includes(S.filter.size));
  }
  if (S.filter.inStock) {
    filtered = filtered.filter(p => (Number(p.stock) || 0) > 0);
  }
  // On-sale toggle is inherently true on this page; no need to re-check.

  const sp = merchandiseProducts(filtered, undefined, S.sortBy);
  const expanded = expandProductVariants(sp); 
  DOM.allProductsGrid.style.gridTemplateColumns = gridTemplateFor(S.gridCols); 
  DOM.allProductsGrid.innerHTML = expanded.length ? expanded.map(({product, variantIndex})=>productCard(product, S.gridCols===3, true, variantIndex)).join("") : '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No sale items at the moment.</div>'; 
  applyEditorialGrid(DOM.allProductsGrid, S.gridCols); 
  updateGridToggleSVG("grid-toggle-svg", S.gridCols); 
  updateCollectionTitle();
  buildCategoryFilterOptions();
  buildBrandFilterOptions();
  injectToolbarExtras('page-products', 'grid-toggle-svg');
}

// Injects the Sort dropdown into the toolbar and the On-sale/In-stock
// checkboxes into the filter panel. Idempotent — safe to call repeatedly.
function injectToolbarExtras(pageId, gridSvgId) {
  const page = document.getElementById(pageId);
  if (!page) return;

  // Remove any previous injection to avoid duplicates.
  const oldSort = page.querySelector('.sort-by-select');
  if (oldSort) oldSort.remove();
  const oldExtras = page.querySelector('.filter-extras-injected');
  if (oldExtras) oldExtras.remove();

  // Insert sort dropdown into the toolbar (before the grid toggle if present).
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

  // Insert filter extras into the filter panel.
  const panel = page.querySelector('#collection-filter-options');
  if (panel) {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter-extras-injected';
    wrapper.innerHTML = buildFilterExtras();
    panel.appendChild(wrapper);
  }
}

function toggleGrid() { S.gridCols = S.gridCols === 1 ? 2 : S.gridCols === 2 ? 3 : 1; if(S.saleMode) renderSaleProducts(); else renderAllProducts(); updateGridToggleSVG("grid-toggle-svg", S.gridCols); updateCollectionGridIcon(); }

function toggleGridCat() { S.gridColsCat = S.gridColsCat === 1 ? 2 : S.gridColsCat === 2 ? 3 : 1; renderCategoryProducts(); updateGridToggleSVG("cat-grid-toggle-svg", S.gridColsCat); updateCollectionGridIcon(); }

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
  if (cat === 'all') { S.filter.cat = 'all'; S.filter.vendor = null; updateHash('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; S.currentCategoryPage = null; renderAllProducts(); }
  else { navigateToCategory(cat); }
  renderCollectionSortingTabs();
  window.scrollTo({top:0,behavior:"smooth"});
  updateCollectionGridIcon();
}

// Renders the "Shop by Category" grid — a clean, static 2x2 (4 cells,
// always visible, no swipe/slider). Beauty was dropped (no real
// inventory behind it yet) rather than sharing a cell with Scent via a
// swipe gesture — that pattern tested as confusing/unfamiliar, so it's
// gone entirely now, not just for this category.
function buildCategoriesSlider() {
  const grid = document.getElementById('home-categories-grid');
  const progress = document.getElementById('home-categories-progress');
  if (!grid || !progress) return;

  const categories = [
    { label:'Clothing', img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287', cat:'all-clothing' },
    { label:'Accessories', img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703', cat:'all-accessories' },
    { label:'Homeware', img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-8985.png?v=1789390405', cat:'homeware' },
    { label:'Scent', img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601', cat:'parfum' }
  ];

  grid.innerHTML = categories.map(c => `<div class="home-category-card" onclick="navigateToCategory('${escapeJSString(c.cat)}')"><div class="home-category-img" style="background-image:url('${escapeForCssUrl(c.img)}');background-size:cover;background-position:center;"></div><div class="home-category-label">${escapeHTML(c.label)}</div></div>`).join('');
  // The 2x2 grid never scrolls (forced by CSS), so the progress row
  // stays empty — nothing to indicate with only 4 fixed cells.
  progress.innerHTML = '';
}

function goCategoriesSlide(idx) { const grid=document.getElementById('home-categories-grid'); const cards=grid?.querySelectorAll('.home-category-card'); if(!cards) return; const pw=window.innerWidth>=900?5:window.innerWidth>=640?3:2; idx=Math.max(0,Math.min(idx,Math.max(0,cards.length-pw))); S.categoriesSlideIndex=idx; const cw=cards[0]?.offsetWidth+8||grid.offsetWidth/pw+8; grid.scrollTo({left:idx*cw,behavior:'smooth'}); document.querySelectorAll('#home-categories-progress .swipe-bar').forEach((b,i)=>b.classList.toggle('active',i===idx)); }

function productCardHome(p) {
  const badgeLabel = p.badge ? (p.badge === 'sold' ? 'SOLD OUT' : String(p.badge).toUpperCase()) : '';
  const badge = badgeLabel ? `<span class="product-badge">${escapeHTML(badgeLabel)}</span>` : '';
  const soldOut = (p.stock ?? 0) <= 0;
  const vi = S.productVariantSelections[p.id] ?? 0;
  const imgs = p.variants?.[vi]?.images;
  const ghost = safeImageURL(imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE);
  const pid = escapeJSString(p.id);
  // Same price markup/classes as productCard() above, so homepage cards
  // match collection/category page cards exactly — reuses formatPrice()/
  // hasSalePrice() already defined in this file.
  const price = hasSalePrice(p)
    ? `<div class="product-price-row"><span class="product-price product-price-sale">${formatPrice(p.salePrice)}</span><span class="product-price-original">${formatPrice(p.price)}</span></div>`
    : `<div class="product-price-row"><span class="product-price">${formatPrice(p.price)}</span></div>`;
  // Swatches removed — replaced by a wishlist bookmark toggle, same as
  // productCard() above.
  const brandHtml = `<div class="product-brand">${escapeHTML(p.brand || 'JANEDORE')}</div>`;
  const isWished = S.wishlist.some(w => w.id === p.id);
  const wishRow = `<div class="product-wish-row"><button type="button" class="product-wish-btn" onclick="event.stopPropagation();event.preventDefault();toggleWishFromCard('${pid}', this.firstElementChild);"><i class="${isWished ? 'ph-fill' : 'ph-light'} ph-bookmark-simple"></i></button></div>`;
  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" data-product-id="${pid}" onclick="goToProduct('${pid}')">
      <div class="product-img-wrap">${badge}<img src="${escapeHTML(ghost)}" alt="${escapeHTML(p.name)}" loading="lazy" onload="this.classList.add('img-loaded')"></div>
      ${brandHtml}
      <div class="product-title">${escapeHTML(p.name)}</div>
      ${price}
      ${wishRow}
    </div>`;
}

// Thin wrapper around toggleWish() (wishlist.js) for card-level bookmark
// icons — toggles the actual wishlist state via the existing function,
// then just swaps this one icon's class so the card it's on doesn't
// need to be fully re-rendered.
function toggleWishFromCard(productId, iconEl) {
  toggleWish(productId);
  const isWished = S.wishlist.some(w => w.id === productId);
  if (iconEl) iconEl.className = isWished ? 'ph-fill ph-bookmark-simple' : 'ph-light ph-bookmark-simple';
}

function buildArrivals() { if(DOM.arrivalsGrid) { const active = PRODUCTS.filter(p=>p.status==='active'); DOM.arrivalsGrid.innerHTML = merchandiseProducts(active).slice(0,8).map(p=>productCardHome(p)).join(""); } buildCategoriesSlider(); buildShopByAccessories(); buildShopByClothing(); buildNewsletterSection(); }

// Homepage "Shop by Accessories" row — same horizontal-slider treatment
// and card markup as New Arrivals (productCardHome), just filtered to
// ACCESSORY_CATEGORIES. Matches the same product set the "all-accessories"
// category page shows (leather pouch excluded here too, consistent with
// getCatFilteredProducts' handling of that item).
function buildShopByAccessories() {
  if (!DOM.accessoriesGrid) return;
  const accessories = PRODUCTS.filter(p => p.status === 'active' && ACCESSORY_CATEGORIES.includes(p.category));
  DOM.accessoriesGrid.innerHTML = merchandiseProducts(accessories).slice(0, 8).map(p => productCardHome(p)).join('');
}

// Homepage "Shop by Clothing" row — same pattern as buildShopByAccessories()
// above, filtered to CLOTHING_CATEGORIES instead, matching the
// "all-clothing" category page's product set.
function buildShopByClothing() {
  if (!DOM.clothingGrid) return;
  const clothing = PRODUCTS.filter(p => p.status === 'active' && CLOTHING_CATEGORIES.includes(p.category));
  DOM.clothingGrid.innerHTML = merchandiseProducts(clothing).slice(0, 8).map(p => productCardHome(p)).join('');
}

function buildNewsletterSection() {
  if(!DOM.homepageNewsletterSection) return;
  DOM.homepageNewsletterSection.innerHTML = `<div class="newsletter-section">
    <div class="newsletter-sub">SIGN UP FOR JANEDORE UPDATES</div>
    <div class="newsletter-heading">Get exclusive updates on new arrivals, curated drops, and stories from independent South African brands.</div>
    <div class="newsletter-form"><input class="newsletter-input" type="email" placeholder="Enter your email" id="newsletter-email"><button class="newsletter-btn" onclick="subscribeNewsletter(document.getElementById('newsletter-email').value)"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button></div>
    <p class="newsletter-disclaimer">By signing up, you agree to our privacy policy.</p>
  </div>`;
}

// ==================== VENDOR / BRAND PAGE ====================

async function navigateToVendor(vendorId, replaceUrl) {
  S.saleMode = false;
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-vendor").classList.add("active");
  S.currentPage = "vendor";
  S.currentVendorId = vendorId;
  removeStickyBar();
  if(DOM.mainNav) { DOM.mainNav.classList.remove("product-page"); DOM.mainNav.classList.add("collection-page"); }
  const newPath = '/brands/' + encodeURIComponent(vendorId);
  if (window.location.pathname !== newPath) {
    replaceUrl ? history.replaceState(null, null, newPath) : history.pushState(null, null, newPath);
  }
  const el = document.getElementById('vendor-page-content');
  if (el) el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const doc = await db.collection('brands').doc(vendorId).get();
    renderVendorPage(doc.exists ? Object.assign({id:doc.id}, doc.data()) : null);
  } catch(e) {
    console.error('Error fetching vendor:', e);
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

function renderVendorPage(vendor) {
  const el = document.getElementById('vendor-page-content');
  if (!el) return;
  const heroImg = safeImageURL(vendor?.heroImageUrl || vendor?.logoUrl || '');
  const brandName = vendor?.brand || vendor?.name || '';
  const desc = vendor?.description || '';
  const normalizedBrandName = normalizeBrandName(brandName);
  
  const products = merchandiseProducts(PRODUCTS.filter(p => {
    if (p.status !== 'active') return false;
    if (vendor?.id && p.vendorId === vendor.id) return true;
    if (p.brand && brandName && normalizeBrandName(p.brand) === normalizedBrandName) return true;
    return false;
  }), 'vendor');
  
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
    <div class="product-grid" style="padding: 0 18px 32px; max-width:1400px; margin:0 auto;">
      ${expanded.map(({product, variantIndex}) => productCard(product, false, true, variantIndex)).join('')}
    </div>
  `;
  
  const footerEl = document.getElementById('vendor-footer');
  if (footerEl && typeof buildFooter === 'function') {
    buildFooter('vendor-footer');
    if (typeof renderVendorsFooter === 'function') renderVendorsFooter(S.vendors || []);
  }
}

window.navigateToVendor = navigateToVendor;
