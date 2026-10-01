// "brands" is the collection admin-vendors.js's CRUD (create/edit/delete/
// seed) actually reads and writes — "vendors" was a second, unrelated
// collection nothing ever wrote to, so this always returned [].
async function fetchVendors() { try { const snapshot = await db.collection('brands').where('status','==','active').get(); if (!snapshot.empty) { const vendors = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); return vendors; } } catch(e) {} return []; }
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
    return `<div class="brand-strip-item" onclick="navigateToVendor('${escapeJSString(vendor.id)}')">${logo}<span class="brand-strip-name">${escapeHTML(name)}</span></div>`;
  };

  const setHTML = repeated.map(renderItem).join('');
  sliderEl.innerHTML = `<div class="brand-strip-track">${setHTML}${setHTML}</div>`;
}

// Home page "Shop by Brand" — a manual swipe slider (#brand-grid),
// distinct from the auto-scrolling marquee above. One real card per
// brand, same 5/6 image ratio as a product card.
function buildShopByBrand(vendors) {
  const grid = document.getElementById('brand-grid');
  if (!grid) return;

  const brands = getFeaturedBrands(vendors);
  if (!brands.length) { grid.innerHTML = ''; return; }

  grid.innerHTML = brands.map(vendor => {
    const name = vendor.name || vendor.brandName || vendor.brand || 'Unknown Brand';
    const bg = vendor.logoUrl ? `background-image:url('${escapeForCssUrl(vendor.logoUrl)}');` : '';
    return `<div class="shop-brand-card" onclick="navigateToVendor('${escapeJSString(vendor.id)}')"><div class="shop-brand-img" style="${bg}"><div class="shop-brand-overlay"></div><div class="shop-brand-name">${escapeHTML(name)}</div></div></div>`;
  }).join('');
}

async function initVendors() {
  const vendors = await fetchVendors();
  S.vendors = vendors;
  renderVendorsDesktop(vendors);
  renderVendorsMobile(vendors);
  renderVendorsFooter(vendors);
  renderHomeBrandSpotlight(vendors);
  buildShopByBrand(vendors);
}
