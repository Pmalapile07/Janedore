function formatPrice(price) { return 'R' + (price || 0).toLocaleString(); }
const COLLECTION_DESCRIPTIONS = {
  'all-clothing': 'Our complete clothing edit — refined silhouettes for the modern wardrobe.', 'dresses': 'Effortless dresses that balance structure and fluidity.', 'tops': 'Elevated essentials, from sculptural blouses to relaxed knits.', 'bottoms': 'Tailored trousers and fluid skirts with quiet intention.', 'jackets': 'Outerwear that defines the silhouette — sharp, soft, and considered.', 'sets': 'Coordinated pieces designed to be worn together or styled apart.', 'bags': 'Understated accessories that complete the look without saying too much.', 'jewelry': 'Sculptural adornments — timeless pieces with modern sensibility.', 'sunglasses': 'Bold yet refined eyewear for the discerning gaze.', 'parfum': 'A study in scent. THATO parfums are crafted for the considered wearer.', 'all': 'All pieces — a curated view of everything in store.'
};
const CATEGORY_ORDER = { tops:1, bottoms:2, dresses:3, sets:4, jackets:5, bags:6, jewelry:7, sunglasses:8, parfum:9 };

function merchandiseProducts(products) { if (!products || !products.length) return []; const filtered = products.filter(p => p.id !== 'janedore-leather-pouch'); const sorted = [...filtered].sort((a, b) => { const oA = CATEGORY_ORDER[a.category] ?? 99; const oB = CATEGORY_ORDER[b.category] ?? 99; if (oA !== oB) return oA - oB; const pA = a.salePrice ?? a.price ?? 0; const pB = b.salePrice ?? b.price ?? 0; return pA - pB; }); return sorted; }
function showLoading(container) { if(container) container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>'; }
function getFilteredProducts() { return PRODUCTS.filter(p=>{ if(p.status!=='active') return false; if(S.filter.cat!=='all' && p.category!==S.filter.cat) return false; if(S.filter.vendor && p.brand!==S.filter.vendor) return false; if(S.filter.size!=='all' && !(p.sizes||[]).includes(S.filter.size)) return false; const price = p.salePrice ?? p.price; if(S.filter.price==='low' && price >= 500) return false; if(S.filter.price==='high' && price < 500) return false; return true; }); }
function getCatFilteredProducts() { const isAllClothing = S.currentCategoryPage === 'all-clothing'; const clothingCats = ['dresses','tops','bottoms','jackets','sets']; return PRODUCTS.filter(p=>{ if(p.status!=='active') return false; if(p.id==='janedore-leather-pouch' && S.currentCategoryPage !== 'sunglasses') return false; if(isAllClothing) { if(!clothingCats.includes(p.category)) return false; } else if(S.currentCategoryPage && p.category !== S.currentCategoryPage) return false; if(S.catFilter.size!=='all' && !(p.sizes||[]).includes(S.catFilter.size)) return false; const price = p.salePrice ?? p.price; if(S.catFilter.price==='low' && price >= 500) return false; if(S.catFilter.price==='high' && price < 500) return false; return true; }); }
function applyFilter(type, value) { S.filter[type] = value; if(S.saleMode) renderSaleProducts(); else renderAllProducts(); }
function applyCatFilter(type, value) { S.catFilter[type] = value; renderCategoryProducts(); }

function toggleFilterDropdown(source) {
  const id = source === 'category' ? 'filter-options-category' : 'filter-options-products';
  const el = document.getElementById(id);
  if(el) {
    el.classList.toggle("open");
    if(el.classList.contains("open")) setTimeout(() => document.addEventListener("click", function cf(e) {
      if(!el.contains(e.target) && !e.target.classList.contains("filter-trigger")) {
        el.classList.remove("open");
        document.removeEventListener("click", cf);
      }
    }), 10);
  }
}

function toggleCollectionFilter() {
  const el = document.getElementById('collection-filter-options');
  if(el) {
    el.classList.toggle("open");
    if(el.classList.contains("open")) setTimeout(() => document.addEventListener("click", function cf(e) {
      if(!el.contains(e.target) && !e.target.classList.contains("collection-filter-trigger")) {
        el.classList.remove("open");
        document.removeEventListener("click", cf);
      }
    }), 10);
  }
}

function applyCollectionFilter(type, value) {
  const el = document.getElementById('collection-filter-options');
  if(el) el.classList.remove("open");
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
  icon.classList.remove('cols-1', 'cols-2');
  if (cols === 1) { icon.classList.add('cols-1'); }
  else { icon.classList.add('cols-2'); }
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

// Expands products into one card per variant
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

// FIXED: Cleaned up metaRow structure to ensure perfect vertical alignment
// UPDATED: sold-out flagging + badge text now says "SOLD OUT" instead of "SOLD"
function productCard(p, isLarge, showDetails, variantIndex) {
  const vi = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[p.id] ?? 0);
  const soldOut = (p.stock ?? 0) <= 0;
  const badgeLabel = p.badge ? (p.badge === 'sold' ? 'SOLD OUT' : p.badge.toUpperCase()) : '';
  const badge = badgeLabel ? `<span class="product-badge">${badgeLabel}</span>` : '';
  const imgs = p.variants?.[vi]?.images;
  const ghost = imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE;
  
  const brand = p.brand ? `<div class="product-brand">${p.brand}</div>` : '';
  const name = `<div class="product-title">${p.name}</div>`;
  
  const price = p.salePrice
    ? `<div class="product-price-row"><span class="product-price product-price-sale">${formatPrice(p.salePrice)}</span><span class="product-price-original">${formatPrice(p.price)}</span></div>`
    : `<div class="product-price-row"><span class="product-price">${formatPrice(p.price)}</span></div>`;

  // Brand and Price are now naturally sequential, allowing CSS to align them perfectly
  const metaRow = showDetails !== false ? `${brand}${price}` : brand;

  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="S.productVariantSelections['${p.id}']=${vi};goToProduct('${p.id}')">
      <div class="product-img-wrap">${badge}<img src="${ghost}" alt="${p.name}" loading="lazy"></div>
      ${metaRow}
      ${name}
    </div>`;
}

function renderAllProducts() {
  if(!DOM.allProductsGrid) return;
  let prods = merchandiseProducts(getFilteredProducts());
  const expanded = expandProductVariants(prods);
  DOM.allProductsGrid.style.gridTemplateColumns = S.gridCols===1?"1fr":S.gridCols===2?"repeat(2,1fr)":"repeat(3,1fr)";
  DOM.allProductsGrid.innerHTML = expanded.map(({product, variantIndex}) => productCard(product, S.gridCols===3, true, variantIndex)).join("");
  applyEditorialGrid(DOM.allProductsGrid, S.gridCols);
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
}

function renderCategoryProducts() {
  if(!S.currentCategoryPage || !DOM.categoryProductsGrid) return;
  let cp;
  if(S.currentCategoryPage==='parfum') cp=getCatFilteredProducts().filter(p=>p.category==='parfum');
  else if(S.currentCategoryPage==='jewelry') cp=getCatFilteredProducts().filter(p=>p.category==='jewelry');
  else if(S.currentCategoryPage==='sunglasses') cp=getCatFilteredProducts().filter(p=>p.category==='sunglasses'||p.id==='janedore-leather-pouch');
  else if(S.currentCategoryPage==='all-clothing') cp=getCatFilteredProducts().filter(p=>['dresses','tops','bottoms','jackets','sets'].includes(p.category));
  else if(['dresses','tops','bottoms','jackets','sets'].includes(S.currentCategoryPage)) cp=getCatFilteredProducts().filter(p=>p.category===S.currentCategoryPage);
  else if(S.currentCategoryPage==='bags') cp=getCatFilteredProducts().filter(p=>p.category===S.currentCategoryPage&&p.id!=='janedore-leather-pouch');
  else cp=getCatFilteredProducts();
  let prods=merchandiseProducts(cp);
  const expanded = expandProductVariants(prods);
  DOM.categoryProductsGrid.style.gridTemplateColumns=S.gridColsCat===1?"1fr":S.gridColsCat===2?"repeat(2,1fr)":"repeat(3,1fr)";
  DOM.categoryProductsGrid.innerHTML=expanded.map(({product, variantIndex}) => productCard(product, S.gridColsCat===3, true, variantIndex)).join("");
  applyEditorialGrid(DOM.categoryProductsGrid, S.gridColsCat);
  updateGridToggleSVG("cat-grid-toggle-svg",S.gridColsCat);
  if(DOM.categoryDescriptionWrap){const desc=COLLECTION_DESCRIPTIONS[S.currentCategoryPage]||COLLECTION_DESCRIPTIONS['all']||'';DOM.categoryDescriptionWrap.innerHTML=desc?`<p class="collection-description">${desc}</p>`:'';}
}

function renderSaleProducts() { if(!DOM.allProductsGrid) return; const sp = merchandiseProducts(PRODUCTS.filter(p => p.status === 'active' && p.salePrice)); const expanded = expandProductVariants(sp); DOM.allProductsGrid.style.gridTemplateColumns = S.gridCols===1?"1fr":S.gridCols===2?"repeat(2,1fr)":"repeat(3,1fr)"; DOM.allProductsGrid.innerHTML = expanded.length ? expanded.map(({product, variantIndex})=>productCard(product, S.gridCols===3, true, variantIndex)).join("") : '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No sale items at the moment.</div>'; applyEditorialGrid(DOM.allProductsGrid, S.gridCols); updateGridToggleSVG("grid-toggle-svg", S.gridCols); }

function toggleGrid() { S.gridCols = S.gridCols === 1 ? 2 : S.gridCols === 2 ? 3 : 1; if(S.saleMode) renderSaleProducts(); else renderAllProducts(); updateGridToggleSVG("grid-toggle-svg", S.gridCols); updateCollectionGridIcon(); }

function toggleGridCat() { S.gridColsCat = S.gridColsCat === 1 ? 2 : S.gridColsCat === 2 ? 3 : 1; renderCategoryProducts(); updateGridToggleSVG("cat-grid-toggle-svg", S.gridColsCat); updateCollectionGridIcon(); }

function renderCollectionSortingTabs() {
  const page = document.getElementById(S.currentPage === 'products' ? 'page-products' : 'page-category');
  if (!page) return;
  let existing = page.querySelector('.collection-sorting-tabs');
  if (existing) existing.remove();
  if (S.currentPage === 'category') return;
  const tabs = [
    { label: 'View All', cat: 'all' }, { label: 'Clothing', cat: 'all-clothing' }, { label: 'Dresses', cat: 'dresses' }, { label: 'Tops', cat: 'tops' }, { label: 'Bottoms', cat: 'bottoms' }, { label: 'Jackets', cat: 'jackets' }, { label: 'Sets', cat: 'sets' }, { label: 'Bags', cat: 'bags' }, { label: 'Jewelry', cat: 'jewelry' }, { label: 'Sunglasses', cat: 'sunglasses' }, { label: 'Scent', cat: 'parfum' }, { label: 'Sale', cat: 'sale' }
  ];
  const active = S.activeSortTab || (S.saleMode ? 'sale' : 'all');
  const tabsHtml = tabs.map(t => `<button class="sorting-tab${t.cat === active ? ' active' : ''}" onclick="selectSortTab('${t.cat}')">${t.label}</button>`).join('');
  const toolbarEl = page.querySelector('.collection-toolbar');
  const container = document.createElement('div');
  container.className = 'collection-sorting-tabs';
  container.innerHTML = tabsHtml;
  if (toolbarEl) { toolbarEl.insertAdjacentElement('afterend', container); }
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

function buildCategoriesSlider() {
  const grid = document.getElementById('home-categories-grid'); const progress = document.getElementById('home-categories-progress'); if (!grid || !progress) return;
  const categories = [{ label:'Clothing',img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287',cat:'all-clothing'},{ label:'Jewellery',img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153',cat:'jewelry'},{ label:'Sunglasses',img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287',cat:'sunglasses'},{ label:'Scent',img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601',cat:'parfum'},{ label:'Bags',img:'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703',cat:'bags'}];
  grid.innerHTML = categories.map(c => `<div class="home-category-card" onclick="navigateToCategory('${c.cat}')"><div class="home-category-img" style="background-image:url('${c.img}');background-size:cover;background-position:center;"></div><div class="home-category-label">${c.label}</div></div>`).join('');
  const perView = window.innerWidth >= 900 ? 5 : window.innerWidth >= 640 ? 3 : 2; const maxIdx = Math.max(0, categories.length - perView);
  progress.innerHTML = Array.from({length: maxIdx+1}, (_,i) => `<div class="swipe-bar${i===0?' active':''}" onclick="goCategoriesSlide(${i})"></div>`).join(''); S.categoriesSlideIndex = 0;
  grid.addEventListener('scroll', () => { const cards = grid.querySelectorAll('.home-category-card'); if(!cards.length) return; const pw = window.innerWidth>=900?5:window.innerWidth>=640?3:2; const cw=cards[0].offsetWidth+8; S.categoriesSlideIndex=Math.max(0,Math.min(Math.round(grid.scrollLeft/cw),Math.max(0,cards.length-pw))); progress.querySelectorAll('.swipe-bar').forEach((b,i)=>b.classList.toggle('active',i===S.categoriesSlideIndex)); }, {passive:true});
}

function goCategoriesSlide(idx) { const grid=document.getElementById('home-categories-grid'); const cards=grid?.querySelectorAll('.home-category-card'); if(!cards) return; const pw=window.innerWidth>=900?5:window.innerWidth>=640?3:2; idx=Math.max(0,Math.min(idx,Math.max(0,cards.length-pw))); S.categoriesSlideIndex=idx; const cw=cards[0]?.offsetWidth+8||grid.offsetWidth/pw+8; grid.scrollTo({left:idx*cw,behavior:'smooth'}); document.querySelectorAll('#home-categories-progress .swipe-bar').forEach((b,i)=>b.classList.toggle('active',i===idx)); }

// UPDATED: sold-out flagging + badge text now says "SOLD OUT" instead of "SOLD"
function productCardHome(p) {
  const badgeLabel = p.badge ? (p.badge === 'sold' ? 'SOLD OUT' : p.badge.toUpperCase()) : '';
  const badge = badgeLabel ? `<span class="product-badge">${badgeLabel}</span>` : '';
  const soldOut = (p.stock ?? 0) <= 0;
  const vi = S.productVariantSelections[p.id] ?? 0;
  const imgs = p.variants?.[vi]?.images;
  const ghost = imgs?.ghost?.[0] || imgs?.model?.[0] || PLACEHOLDER_IMAGE;
  return `
    <div class="product-card${soldOut ? ' sold-out' : ''}" onclick="goToProduct('${p.id}')">
      <div class="product-img-wrap">${badge}<img src="${ghost}" alt="${p.name}" loading="lazy"></div>
      <div class="product-brand">${p.brand || 'JANEDORE'}</div>
      <div class="product-title">${p.name}</div>
    </div>`;
}

function buildArrivals() { if(DOM.arrivalsGrid) { const active = PRODUCTS.filter(p=>p.status==='active'); DOM.arrivalsGrid.innerHTML = merchandiseProducts(active).slice(0,8).map(p=>productCardHome(p)).join(""); } buildCategoriesSlider(); buildNewsletterSection(); }

function buildNewsletterSection() { if(!DOM.homepageNewsletterSection) return; DOM.homepageNewsletterSection.innerHTML = `<div class="newsletter-section"><div class="newsletter-title">Subscribe to our newsletter</div><div class="newsletter-form"><input class="newsletter-input" type="email" placeholder="Enter your email" id="newsletter-email"><button class="newsletter-btn" onclick="subscribeNewsletter(document.getElementById('newsletter-email').value)"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button></div><p class="newsletter-disclaimer">By signing up, you agree to our privacy policy.</p></div>`; }

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
}

function renderVendorPage(vendor) {
  const el = document.getElementById('vendor-page-content');
  if (!el) return;
  const heroImg = vendor?.heroImageUrl || vendor?.logoUrl || '';
  const brandName = vendor?.brand || vendor?.name || '';
  const desc = vendor?.description || '';
  
  // Match products by vendorId OR brand name (case-insensitive)
  const products = merchandiseProducts(PRODUCTS.filter(p => {
    if (p.status !== 'active') return false;
    
    // Match by vendorId
    if (vendor?.id && p.vendorId === vendor.id) return true;
    
    // Match by brand name (case-insensitive)
    if (p.brand && brandName && p.brand.toLowerCase() === brandName.toLowerCase()) return true;
    
    // Special case for spelling variations
    if (brandName === 'NIRIUS CO' && p.brand === 'NIRIOUS CO') return true;
    if (brandName === 'NIRIOUS CO' && p.brand === 'NIRIUS CO') return true;
    
    return false;
  }));
  
  const expanded = expandProductVariants(products);

  el.innerHTML = `
    <section class="vendor-hero-section">
      <div class="vendor-hero-img" style="background-image:url('${heroImg}');">
        <div class="vendor-hero-content">
          <div class="vendor-hero-name">${brandName}</div>
          <p class="vendor-hero-desc">${desc}</p>
        </div>
      </div>
    </section>
    <div class="product-grid" style="padding: 0 18px 32px; max-width:1400px; margin:0 auto;">
      ${expanded.map(({product, variantIndex}) => productCard(product, false, true, variantIndex)).join('')}
    </div>
  `;
  
  // Build footer for vendor page, then re-populate its brands list
  // (buildFooter always resets brands to empty — renderVendorsFooter fills it back in)
  const footerEl = document.getElementById('vendor-footer');
  if (footerEl && typeof buildFooter === 'function') {
    buildFooter('vendor-footer');
    if (typeof renderVendorsFooter === 'function') renderVendorsFooter(S.vendors || []);
  }
}

window.navigateToVendor = navigateToVendor;
