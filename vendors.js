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
async function initVendors() {
  const vendors = await fetchVendors();
  S.vendors = vendors;
  renderVendorsDesktop(vendors);
  renderVendorsMobile(vendors);
  renderVendorsFooter(vendors);
}
