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
   HOME BRAND SPOTLIGHT — replaces the two hardcoded
   featured-brand-section blocks that used to live in index.html.
   Picks one active vendor from Firestore and renders it into a
   single #home-brand-spotlight container using the SAME existing
   classes (.featured-brand-img / .featured-brand-content / etc.)
   the old hardcoded sections used — no new CSS system.

   Rotation: deterministic by day (days-since-epoch % vendor count),
   so the spotlight changes once a day without needing any extra
   storage or admin control, and automatically includes any new
   vendor added to Firestore.
   ============================================================ */

function pickSpotlightVendor(vendors) {
  if (!vendors || !vendors.length) return null;
  // JANEDORE is the house's own main brand, not a guest — it never
  // belongs in the "other brands" spotlight rotation.
  const eligible = vendors.filter(v => {
    const name = (v.name || v.brandName || v.brand || '').toLowerCase();
    return name !== 'janedore';
  });
  if (!eligible.length) return null;
  const dayIndex = Math.floor(Date.now() / 86400000);
  return eligible[dayIndex % eligible.length];
}

function renderHomeBrandSpotlight(vendors) {
  const el = document.getElementById('home-brand-spotlight');
  if (!el) return;
  const vendor = pickSpotlightVendor(vendors);
  if (!vendor) { el.innerHTML = ''; return; }
  const name = vendor.name || vendor.brandName || vendor.brand || 'Unknown Brand';
  const img = vendor.heroImageUrl || vendor.logoUrl || '';
  const escapedName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  el.innerHTML = `
    <div class="featured-brand-img" style="background-image:url('${img}'); background-color:#e8e4dd;">
      <div class="featured-brand-content">
        <div class="featured-brand-sub">Introducing</div>
        <div class="featured-brand-heading">${escapedName}</div>
        <button class="featured-brand-btn" onclick="navigateToVendor('${vendor.id}')">DISCOVER BRAND</button>
      </div>
    </div>`;
}

async function initVendors() {
  const vendors = await fetchVendors();
  S.vendors = vendors;
  renderVendorsDesktop(vendors);
  renderVendorsMobile(vendors);
  renderVendorsFooter(vendors);
  renderHomeBrandSpotlight(vendors);
}
