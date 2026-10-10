// "vendors" is the real collection — admin-vendors.js's CRUD
// (create/edit/delete/seed) actually reads and writes it. A prior pass
// repointed this at "brands" on the mistaken assumption that "vendors"
// was dead; it wasn't, and "brands" had nothing in it. Reverted.
async function fetchVendors() { try { const snapshot = await db.collection('vendors').where('status','==','active').get(); if (!snapshot.empty) { const vendors = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); return vendors; } } catch(e) {} return []; }
function renderVendorsDesktop(vendors) {
  const navLinksContainer = document.querySelector('.desktop-nav-links'); if (!navLinksContainer) return;
  const existing = navLinksContainer.querySelector('.desktop-dropdown-wrap.brands-dynamic'); if (existing) existing.remove();
  if (!vendors.length) return;
  const wrap = document.createElement('div'); wrap.className = 'desktop-dropdown-wrap brands-dynamic';
  const span = document.createElement('span'); span.className = 'desktop-nav-link'; span.style.cssText = 'display:flex;align-items:center;gap:4px;'; span.innerHTML = 'Brands <i class="ph-light ph-caret-down" style="font-size:10px;"></i>';
  const menu = document.createElement('div'); menu.className = 'desktop-dropdown-menu';
  vendors.forEach(vendor => { const name = vendor.name || vendor.brandName || 'Unknown Brand'; const a = document.createElement('a'); a.className = 'desktop-dropdown-item'; a.textContent = name; a.onclick = function(e) { e.preventDefault(); navigateToBrandProducts(name); }; menu.appendChild(a); });
  wrap.appendChild(span); wrap.appendChild(menu); navLinksContainer.appendChild(wrap);
}
function renderVendorsMobile(vendors) {
  const brandsBody = document.querySelector('#brands-collapse .brands-collapse-body'); if (!brandsBody) return;
  if (!vendors.length) { brandsBody.innerHTML = '<div class="brand-logo-placeholder">No brands available</div>'; return; }
  brandsBody.innerHTML = vendors.map(vendor => { const name = vendor.name || vendor.brandName || 'Unknown Brand'; const escaped = name.replace(/'/g, "\\'").replace(/"/g, '&quot;'); return `<div class="brand-logo-placeholder" onclick="navigateToBrandProducts('${escaped}');closeMenu();">${name}</div>`; }).join('');
}
function renderVendorsFooter(vendors) {
  document.querySelectorAll('.footer-collapse').forEach(collapse => { const header = collapse.querySelector('.footer-collapse-header'); if (!header) return; if (header.textContent.trim().toLowerCase() !== 'brands') return; const body = collapse.querySelector('.footer-collapse-body'); if (!body) return; const ul = body.querySelector('.footer-links'); if (!ul) return; if (!vendors.length) { ul.innerHTML = '<li><a>No brands available</a></li>'; return; } ul.innerHTML = vendors.map(vendor => { const name = vendor.name || vendor.brandName || 'Unknown Brand'; const escaped = name.replace(/'/g, "\\'").replace(/"/g, '&quot;'); return `<li><a onclick="navigateToBrandProducts('${escaped}')">${name}</a></li>`; }).join(''); });
}
function navigateToBrandProducts(brandName) { S.saleMode = false; updateHash('products'); document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); document.getElementById("page-products").classList.add("active"); S.currentPage = "products"; const toolbarCenter = document.getElementById("page-products").querySelector(".toolbar-center"); if(toolbarCenter) toolbarCenter.textContent = brandName.toUpperCase(); const filtered = PRODUCTS.filter(p => p.status === 'active' && (p.brand || '') === brandName); const prods = merchandiseProducts(filtered); if(DOM.allProductsGrid) { DOM.allProductsGrid.style.gridTemplateColumns = S.gridCols===1?"1fr":S.gridCols===2?"repeat(2,1fr)":"repeat(3,1fr)"; DOM.allProductsGrid.innerHTML = prods.length ? prods.map(p=>productCard(p, S.gridCols===3, true)).join("") : '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No products from this brand yet.</div>'; applyEditorialGrid(DOM.allProductsGrid, S.gridCols); updateGridToggleSVG("grid-toggle-svg", S.gridCols); } window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled(); updateChatVisibility(); }

/* ============================================================
   HOME "OUR BRANDS" — CONTINUOUS AUTO-SCROLLING STRIP
   Renders every active vendor (excluding JANEDORE, the house's own
   brand) as a logo+name pair in a strip that scrolls continuously
   on its own — not a manual swipe slider, no progress dots.

   DOM contract (must exist in index.html):
     #home-brands-slider → strip container (CSS: overflow hidden)

   The strip's content is repeated enough times to read as
   continuous even with only 1-2 brands, then that whole repeated
   set is duplicated once more so the marquee's translateX(-50%)
   loop point is seamless — same technique #announcement-bar uses
   in navigation.css.
   ============================================================ */

// Resolves a product's real vendor record. Checks the brand-name text
// first, not vendorId — vendorId has twice turned out unreliable in this
// app's real data (defaulted to the literal 'janedore' when it couldn't
// be resolved at save time, and separately left pointing at a real-but-
// wrong vendor after a product's Brand dropdown was changed). brand text
// is what a human actually typed/selected, so it's trusted first; vendorId
// is only a fallback for the rare product with a blank brand field.
function findVendorForProduct(product) {
  if (!product) return null;
  const vendors = S.vendors || [];
  const brandName = (product.brand || '').toLowerCase().trim();
  if (brandName) {
    const byBrand = vendors.find(v => (v.name || v.brandName || v.brand || '').toLowerCase().trim() === brandName);
    if (byBrand) return byBrand;
  }
  return vendors.find(v => v.id === product.vendorId) || null;
}

function getFeaturedBrands(vendors) {
  if (!vendors || !vendors.length) return [];
  // JANEDORE is the house's own main brand, not a guest.
  return vendors.filter(v => {
    const name = (v.name || v.brandName || v.brand || '').toLowerCase().trim();
    return name !== 'janedore';
  });
}

function renderHomeBrandSpotlight(vendors) {
  const sliderEl = document.getElementById('home-brands-slider');
  if (!sliderEl) return;

  const brands = getFeaturedBrands(vendors);
  if (!brands.length) {
    sliderEl.innerHTML = '';
    return;
  }

  const REPEATS = Math.max(4, Math.ceil(10 / brands.length));
  const repeated = [];
  for (let i = 0; i < REPEATS; i++) repeated.push(...brands);

  const renderItem = (vendor) => {
    const name = vendor.name || vendor.brandName || vendor.brand || 'Unknown Brand';
    const logo = vendor.logoUrl
      ? `<img src="${escapeHTML(vendor.logoUrl)}" alt="" class="brand-strip-logo">`
      : `<span class="brand-strip-logo brand-strip-logo-fallback">${escapeHTML(name.charAt(0).toUpperCase())}</span>`;
    return `<div class="brand-strip-item" onclick="navigateToVendor('${escapeJSString(vendor.slug || vendor.id)}')">${logo}<span class="brand-strip-name">${escapeHTML(name)}</span></div>`;
  };

  const setHTML = repeated.map(renderItem).join('');
  sliderEl.innerHTML = `<div class="brand-strip-track">${setHTML}${setHTML}</div>`;
}

// Home page "Shop by Brand" — a manual swipe slider (#brand-grid),
// distinct from the auto-scrolling marquee above. One real card per
// brand, same 5/6 image ratio as a product card.
// Shared by the home page's #brand-grid and the product page's own
// Shop by Brand section — same cards, same onclick, different
// container each place renders them into.
function shopByBrandCardsHtml(brands) {
  return brands.map(vendor => {
    const brandImg = vendor.heroImageUrl || vendor.logoUrl;
    const bg = brandImg ? `background-image:url('${escapeForCssUrl(brandImg)}');` : '';
    const logo = vendor.logoUrl ? `<img src="${escapeHTML(vendor.logoUrl)}" alt="" class="shop-brand-logo">` : '';
    return `<div class="shop-brand-card" onclick="navigateToVendor('${escapeJSString(vendor.slug || vendor.id)}')"><div class="shop-brand-img" style="${bg}">${logo}</div></div>`;
  }).join('');
}

// Flat #f4f4f4 box with a literal "Brand" label, not clickable — same
// "never looks broken or blank" idea as placeholderProductCard()
// (collection.js) for an empty product grid. Used by the /brands page's
// featured grid when there are no brands yet.
function placeholderBrandCardsHtml(count) {
  return Array.from({ length: count }, () =>
    '<div class="shop-brand-card shop-brand-card-placeholder"><div class="shop-brand-img"><span class="shop-brand-placeholder-label">Brand</span></div></div>'
  ).join('');
}

function buildShopByBrand(vendors) {
  const grid = document.getElementById('brand-grid');
  if (!grid) return;

  const brands = getFeaturedBrands(vendors);
  grid.innerHTML = brands.length ? shopByBrandCardsHtml(brands) : placeholderBrandCardsHtml(4);
}

// ==================== BRANDS PAGE (/brands) — A-Z directory ====================
// Same structure as a typical brand-directory page (Superbalist's
// /brands was the reference): a grid of brand cards at the top (reuses
// shopByBrandCardsHtml()/navigateToVendor() verbatim, same cards as the
// homepage's Shop by Brand section, just laid out as a static 2-column
// grid instead of a swipe slider — see .brands-page-grid in
// product-grid.css), then a jump-to-letter index, then every brand
// listed under its own letter heading. Scales to however many real
// vendors exist — with very few brands it's just a short page, not a
// broken one.
function renderBrandsPage(vendors) {
  const grid = document.getElementById('brands-page-grid');
  const indexEl = document.getElementById('brands-az-index');
  const listEl = document.getElementById('brands-az-list');
  if (!grid || !indexEl || !listEl) return;

  const brands = getFeaturedBrands(vendors || []);

  // Index built from LETTERS/groups up front, before the empty check,
  // so the A-Z row always renders (every letter in its disabled state
  // when there are no brands yet) instead of going blank — matches
  // the grid/list below, which already show their own empty states.
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  const groups = {};
  brands
    .slice()
    .sort((a, b) => (a.name || a.brandName || '').localeCompare(b.name || b.brandName || ''))
    .forEach(v => {
      const name = v.name || v.brandName || 'Unknown Brand';
      const first = name.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(first) ? first : '#';
      (groups[letter] = groups[letter] || []).push(v);
    });

  indexEl.innerHTML = LETTERS.map(letter => {
    if (letter === '#') {
      return `<span class="brands-az-letter brands-az-hash">#</span>`;
    }
    const has = !!groups[letter];
    return has
      ? `<a class="brands-az-letter" href="#brands-letter-${letter}">${letter}</a>`
      : `<span class="brands-az-letter disabled">${letter}</span>`;
  }).join('');

  if (!brands.length) {
    grid.innerHTML = placeholderBrandCardsHtml(4);
    listEl.innerHTML = '<div class="brands-empty">No brands available yet.</div>';
    return;
  }

  grid.innerHTML = shopByBrandCardsHtml(brands);

  listEl.innerHTML = LETTERS.filter(letter => groups[letter]).map(letter => {
    const items = groups[letter].map(v => {
      const name = v.name || v.brandName || 'Unknown Brand';
      return `<li onclick="navigateToVendor('${escapeJSString(v.slug || v.id)}')">${escapeHTML(name)}</li>`;
    }).join('');
    return `<div class="brands-az-group" id="brands-letter-${letter}"><div class="brands-az-heading">${letter}</div><ul class="brands-az-items">${items}</ul></div>`;
  }).join('');
}

async function initVendors() {
  const vendors = await fetchVendors();
  await backfillMissingVendorSlugs(vendors);
  S.vendors = vendors;
  renderVendorsDesktop(vendors);
  renderVendorsMobile(vendors);
  renderVendorsFooter(vendors);
  renderHomeBrandSpotlight(vendors);
  buildShopByBrand(vendors);
  renderBrandsPage(vendors);
}
