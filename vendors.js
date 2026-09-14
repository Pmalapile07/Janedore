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
   HOME BRAND SPOTLIGHT — now a slider showing every active
   vendor at once (not a rotating single pick), since with only
   a handful of brands at launch, showing all of them does more
   to prove "multi-brand house" than hiding them one at a time
   would. Populates #home-brands-slider with one
   .featured-brand-slide per vendor, plus swipe-bar dots into
   #home-brands-progress. JANEDORE (the house's own brand) is
   still excluded — it's not a guest to spotlight.
   ============================================================ */

function renderHomeBrandSpotlight(vendors) {
  const slider = document.getElementById('home-brands-slider');
  const progress = document.getElementById('home-brands-progress');
  if (!slider) return;

  const eligible = (vendors || []).filter(v => {
    const name = (v.name || v.brandName || v.brand || '').toLowerCase();
    return name !== 'janedore';
  });

  if (!eligible.length) {
    slider.innerHTML = '';
    if (progress) progress.innerHTML = '';
    return;
  }

  slider.innerHTML = eligible.map(vendor => {
    const name = vendor.name || vendor.brandName || vendor.brand || 'Unknown Brand';
    const img = vendor.heroImageUrl || vendor.logoUrl || '';
    const escapedName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<div class="featured-brand-slide">
      <div class="featured-brand-img" style="background-image:url('${img}'); background-color:#e8e4dd;">
        <div class="featured-brand-content">
          <div class="featured-brand-sub">Introducing</div>
          <div class="featured-brand-heading">${escapedName}</div>
          <button class="featured-brand-btn" onclick="navigateToVendor('${vendor.id}')">DISCOVER BRAND</button>
        </div>
      </div>
    </div>`;
  }).join('');

  if (progress) {
    progress.innerHTML = eligible.map((_, i) =>
      `<div class="swipe-bar${i === 0 ? ' active' : ''}"></div>`
    ).join('');
  }
}

async function initVendors() {
  const vendors = await fetchVendors();
  S.vendors = vendors;
  renderVendorsDesktop(vendors);
  renderVendorsMobile(vendors);
  renderVendorsFooter(vendors);
  renderHomeBrandSpotlight(vendors);
}
