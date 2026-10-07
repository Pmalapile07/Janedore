function safeImage(url) { return url || PLACEHOLDER_IMAGE; }
function formatPrice(amount) { return `${CURRENCIES[S.currency]?.symbol??"R"}${(amount??0).toFixed(2)}`; }
function isProductSoldOut(product) { return (product?.stock??0)<=0; }

// Stock is tracked per size within each color variant, in a separate
// stockByVariant map keyed by variant index then size (e.g.
// {"0":{S:5,M:0,L:2}, "1":{S:1}}) — kept apart from the variants array
// itself (which holds images/colors) so a customer's stock-decrement
// write at checkout can be scoped to just the quantity data and never
// touch product content. A product's overall stock (used by
// isProductSoldOut/badges above) is just the sum of all of these. A
// product saved before this existed has no stockByVariant yet; for
// those, fall back to the old product-wide total so nothing that was
// working stops working before it's re-saved in admin.
function getVariantSizeStock(product, variantIndex, size) {
  const sizeStock = product?.stockByVariant?.[variantIndex];
  if (!sizeStock || typeof sizeStock !== 'object') return product?.stock ?? 0;
  const val = sizeStock[size || 'OS'];
  return typeof val === 'number' ? val : 0;
}

function isSizeInStock(product, variantIndex, size) {
  return getVariantSizeStock(product, variantIndex, size) > 0;
}

// Shared by the initial render and by selectVariant() (switching color
// re-renders this, since availability differs per color).
function buildSizeRowHtml(product, variantIndex) {
  const sizes = (product.sizes || []).filter(s => s !== 'OS');
  if (!sizes.length) return '';
  // A single size isn't a choice — select it automatically instead of
  // making the customer click the one option there is.
  if (sizes.length === 1 && S.selectedSize !== sizes[0]) S.selectedSize = sizes[0];
  const buttons = sizes.map(s => {
    const inStock = isSizeInStock(product, variantIndex, s);
    const cls = 'product-size-btn' + (S.selectedSize === s ? ' sel' : '') + (inStock ? '' : ' out-of-stock');
    return `<button class="${cls}" ${inStock ? '' : 'disabled aria-disabled="true"'} onclick="selectProductSize(this,'${s}')">${escapeHTML(s)}</button>`;
  }).join('');
  return `<div class="product-sizes" id="product-size-row"><div class="sizes-label">Size</div><div class="sizes-row">${buttons}</div><div class="size-guide-note">Need help with sizing? <span>View our size guide</span></div></div>`;
}

// Re-evaluates the Add to Cart button's label/disabled state against
// whatever's currently selected (size, color). Called after both size
// and color selection rather than duplicating this logic at each call
// site — S.currentReviewProductId doubles as "the product currently on
// screen" (set by goToProduct()), same convention sticky-bar.js uses.
function updateAddToCartState() {
  if (S.currentPage !== 'product-detail') return;
  const product = PRODUCTS.find(p => p.id === S.currentReviewProductId);
  const addBtn = document.getElementById('product-add-btn');
  if (!product || !addBtn) return;
  const vi = S.productVariantSelections[product.id] ?? 0;
  const isPreorder = product.badge === 'pre-order';
  const soldOut = isProductSoldOut(product);
  const hasSizes = (product.sizes || []).filter(s => s !== 'OS').length > 0;
  const needsSize = hasSizes && !S.selectedSize;
  const sizeOutOfStock = !needsSize && hasSizes && !isSizeInStock(product, vi, S.selectedSize);
  addBtn.disabled = (needsSize || sizeOutOfStock || soldOut) && !isPreorder;
  addBtn.textContent = isPreorder ? 'Pre-order' : (needsSize ? 'Select a Size' : ((sizeOutOfStock || soldOut) ? 'Sold Out' : 'Add to Cart'));
}
function wordCount(str) { return (str||'').split(/\s+/).filter(Boolean).length; }
function truncateName(name) { if(!name) return ''; const w=name.split(' '); return w.length<=3?name:w.slice(0,3).join(' ')+'<br>'+w.slice(3).join(' '); }
function truncateNameEllipsis(name) { if(!name) return ''; const w=name.split(' '); return w.length<=3?name:w.slice(0,3).join(' ')+'…'; }

// Badges are computed from real product data rather than a manually-set
// flag, so staff never have to remember to update them: New = added
// within the last PRODUCT_NEW_DAYS days, Sale = has a valid sale price
// below the list price, Sold Out = zero stock. Only Pre-order and a
// free-text custom label stay admin-set. Sold Out always wins and hides
// every other badge — a product that can't be bought shouldn't also be
// advertised as new or on sale.
var PRODUCT_NEW_DAYS = 5;
var RESERVED_BADGE_VALUES = ['new', 'sale', 'sold out', 'sold'];

function isProductNew(product) {
  var created = product && product.createdAt ? new Date(product.createdAt).getTime() : NaN;
  if (!created || isNaN(created)) return false;
  var ageMs = Date.now() - created;
  return ageMs >= 0 && ageMs <= PRODUCT_NEW_DAYS * 24 * 60 * 60 * 1000;
}

function getProductBadges(product) {
  if (!product) return [];
  if (isProductSoldOut(product)) return ['SOLD OUT'];

  var badges = [];
  if (isProductNew(product)) badges.push('NEW');
  if (hasSalePrice(product)) badges.push('SALE');

  var manual = (product.badge || '').trim();
  if (manual && RESERVED_BADGE_VALUES.indexOf(manual.toLowerCase()) === -1) {
    badges.push(manual.toUpperCase());
  }

  return badges;
}

function getProductImages(product, variantIndex) {
  const idx = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[product.id] ?? 0);
  const variant = product?.variants?.[idx] ?? product?.variants?.[0] ?? {};
  
  const model = (variant.images?.model || []).filter(Boolean);
  const ghost = (variant.images?.ghost || []).filter(Boolean);
  const detail = (variant.images?.detail || []).filter(Boolean);
  
  const combined = [...model, ...ghost, ...detail];
  
  if (combined.length > 0) return combined;
  return [PLACEHOLDER_IMAGE];
}
function getProductThumbnail(product, variantIndex) { return safeImage(getProductImages(product, variantIndex)[0]); }
function getAllProductImages(product, variantIndex) {
  const idx = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[product.id] ?? 0);
  const variant = product?.variants?.[idx] ?? product?.variants?.[0] ?? {};
  const model = (variant.images?.model || []).filter(Boolean);
  const ghost = (variant.images?.ghost || []).filter(Boolean);
  const detail = (variant.images?.detail || []).filter(Boolean);
  const all = [...model, ...ghost, ...detail];
  return all.length ? all : [PLACEHOLDER_IMAGE];
}

function variantSwatchesHtml(product, selectedIndex) { const variants = product?.variants || []; const si = selectedIndex !== undefined ? selectedIndex : (S.productVariantSelections[product.id] ?? 0); const soldOut = isProductSoldOut(product); return variants.slice(0,2).map((v,i)=>{ let cls = `variant-swatch${i===si?" selected":""}${soldOut?" sold-out":""}`; let style = v.dualColor ? `--swatch-color1:${v.swatch||'#ccc'};--swatch-color2:${v.swatchColor2||'#999'};` : `background:${v.swatch||'#ccc'};`; if(v.dualColor) cls += ' dual-color'; return `<span class="${cls}" style="${style}" onclick="event.stopPropagation();selectVariant('${product.id}',${i},event)"></span>`; }).join("") + (variants.length>2?`<span class="variant-plus">+${variants.length-2}</span>`:''); }

function selectVariant(productId, variantIndex, evt) {
  if(evt){evt.stopPropagation();evt.preventDefault();}
  S.productVariantSelections[productId] = variantIndex;
  const product = PRODUCTS.find(p=>p.id===productId);
  if(!product) return;
  const allImages = getAllProductImages(product, variantIndex);

  // Update product cards in grid
  document.querySelectorAll(`.product-card[data-product-id="${productId}"]`).forEach(card=>{ const slidesEl=card.querySelector(".product-card-slides"); if(slidesEl) slidesEl.innerHTML = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join(""); const barsEl=card.querySelector(".card-slider-bars"); if(barsEl) barsEl.innerHTML = allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join(""); const sc=card.querySelector(".product-card-slides"); if(sc){sc.style.transform="translateX(0)"; S.cardSlideIndex[productId]=0;} });

  // Update product detail page images
  if(S.currentPage==="product-detail"){
    const images = getAllProductImages(product, variantIndex);
    const mainImg = document.getElementById("product-main-image");
    const barsEl = document.getElementById("product-image-bars");
    if(mainImg){ mainImg.style.backgroundImage=`url('${images[0]}')`; }
    if(barsEl){
      barsEl.innerHTML = images.map((u,i)=>`<div class="swipe-bar${i===0?' active':''}" onclick="switchMainImage(${i},'${u.replace(/'/g,"&#39;")}')"></div>`).join('');
    }
    // Update swipe init
    productImages = images;
    currentImageIndex = 0;
    // Update swatch selected state — scoped to the main product's own
    // swatch row, not every .variant-swatch on the page. Unscoped, this
    // also matched related-product cards elsewhere on the page (same
    // class, from collection.js's productCard()), toggling .selected by
    // raw document-order index against this product's own 0/1 index —
    // on any page where another product's swatches render before this
    // one in the DOM, the wrong element got highlighted (or none did),
    // even though the color swap itself worked. That's what looked like
    // the swatch picker being "stubborn."
    const mainSwatchRow = document.querySelector('#page-product-detail .variants-row');
    if (mainSwatchRow) {
      mainSwatchRow.querySelectorAll('.variant-swatch').forEach((s,i) => s.classList.toggle('selected', i === variantIndex));
    }
    // Stock availability per size can differ by color, so a size chosen
    // for the previous color may not even apply to this one — reset the
    // selection and rebuild the size row against the new variant's stock,
    // same as switching color resets size choice on Zara/Net-a-Porter.
    S.selectedSize = null;
    const sizeRow = document.getElementById('product-size-row');
    if (sizeRow) sizeRow.outerHTML = buildSizeRowHtml(product, variantIndex);
    updateAddToCartState();
  }
}

function switchMainImage(index, url) {
  const mainImage = document.getElementById('product-main-image');
  if (mainImage) { mainImage.style.backgroundImage = `url('${url}')`; }
  document.querySelectorAll('#product-image-bars .swipe-bar').forEach((b, i) => b.classList.toggle('active', i === index));
  currentImageIndex = index;
}

let productImages = [];
let currentImageIndex = 0;

function initProductSwipe(images) {
  productImages = images;
  currentImageIndex = 0;
  const mainImage = document.getElementById('product-main-image');
  if (!mainImage || !images.length) return;
  let touchStartX = 0;
  mainImage.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
  mainImage.addEventListener('touchend', function(e) {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) < 40) return;
    if (diff > 0 && currentImageIndex < productImages.length - 1) { currentImageIndex++; }
    else if (diff < 0 && currentImageIndex > 0) { currentImageIndex--; }
    mainImage.style.backgroundImage = `url('${productImages[currentImageIndex]}')`;
    document.querySelectorAll('#product-image-bars .swipe-bar').forEach((b, i) => b.classList.toggle('active', i === currentImageIndex));
  }, {passive: true});
}

function selectProductSize(btn, size) {
  document.querySelectorAll('.product-size-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  S.selectedSize = size;
  updateAddToCartState();
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

// Static 2-column grid — same card markup/styling as the collection
// page (productCard()), not the sliding swipe-track used elsewhere.
// No scroll, no touch handlers, no bars. Used for Recently Viewed,
// You May Also Like, and Complete the Look.
function buildProductGridSection(title, products, gridId) {
  const cards = products.map(p => productCard(p)).join('');
  return `<div class="swipe-section">
    <div class="swipe-section-title">${title}</div>
    <div class="product-grid static-product-grid" id="${gridId}">${cards}</div>
  </div>`;
}

function buildSwipeCardInner(product) {
  if (!product) return '';
  return productCardHome(product);
}

function selectSize(btn,size) { document.querySelectorAll(".modal-size-btn").forEach(b=>b.classList.remove("sel")); btn.classList.add("sel"); S.selectedSize=size; }
function toggleInfoAccordion(key) {
  document.getElementById(`info-accordion-${key}`)?.classList.toggle('open');
}
async function renderProductPage(product) {
  document.querySelectorAll(".page").forEach(pg=>pg.classList.remove("active")); DOM.productDetail.classList.add("active"); S.currentPage="product-detail"; S.selectedSize=null; S.productQuantity=1;
  if(DOM.mainNav) { DOM.mainNav.classList.add("product-page"); DOM.mainNav.classList.remove("collection-page"); }
  showLoading(DOM.productDetail);

  // FIX: ensure variant selection is initialized before rendering
  if(S.productVariantSelections[product.id] === undefined) {
    S.productVariantSelections[product.id] = 0;
  }

  const vi=S.productVariantSelections[product.id]; const images=getAllProductImages(product,vi); const soldOut=isProductSoldOut(product);
  const isPreorder=product.badge==='pre-order';
  const variants=product.variants||[];
  // 'OS' is a placeholder sentinel, not a real size — never show it as
  // a selectable "size" (there's nothing to actually select).
  const sizes=(product.sizes||[]).filter(s=>s!=='OS');
  const price=product.salePrice||product.price; const originalPrice=product.salePrice?product.price:null;
  const productBadges=getProductBadges(product);
  const isWished=S.wishlist.some(w=>w.id===product.id);
  const related=merchandiseProducts(PRODUCTS.filter(p=>p.id!==product.id&&p.category===product.category&&p.status==='active')).slice(0,6); const relatedSection=related.length?buildProductGridSection('You May Also Like',related,`related-${product.id}`):'';
  // Same-brand picks first, then site-wide featured products, then
  // whatever's left — works for every category, unlike the old
  // category-by-category rules. Excludes whatever You May Also Like
  // (above) already shows, so the two sections don't repeat products.
  const suggested=getSuggestedProducts(product,related.map(p=>p.id)); const suggestedSection=suggested.length?buildProductGridSection('Suggested Products',suggested,`suggested-${product.id}`):'';
  const productVendor=findVendorForProduct(product);
  // Shows every brand, including the one this product is from — the
  // shopper is already looking at that brand's product, so there's no
  // real redundancy in also listing it here.
  const shopByBrandVendors=getFeaturedBrands(S.vendors||[]);
  const shopByBrandSection=shopByBrandVendors.length?`<div class="swipe-section"><div class="swipe-section-title">Shop by Brand</div><div class="product-grid brand-grid-scroll">${shopByBrandCardsHtml(shopByBrandVendors)}</div></div>`:'';

  // Progress bars for the main image slider, mirroring the swipe-bar
  // dots used in Recently Viewed / You May Also Like / Complete the Look.
  // Always rendered — a single image still shows one bar — replacing the
  // old thumbnail strip entirely.
  const imageBarsHtml = `<div class="swipe-bars" id="product-image-bars">${images.map((u,i)=>`<div class="swipe-bar${i===0?' active':''}" onclick="switchMainImage(${i},'${u.replace(/'/g,"&#39;")}')"></div>`).join('')}</div>`;

  const categoryLabel = String(product.category||'').replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
  const breadcrumbHtml = `<nav class="page-breadcrumb" aria-label="Breadcrumb">
    <span onclick="navigateTo('home')">Home</span>
    ${productVendor?`<span class="page-breadcrumb-sep">/</span><span onclick="navigateToVendor('${escapeJSString(productVendor.slug||productVendor.id)}')">${escapeHTML(product.brand||'')}</span>`:''}
    ${product.category?`<span class="page-breadcrumb-sep">/</span><span onclick="navigateToCategory('${product.category}')">${categoryLabel}</span>`:''}
    <span class="page-breadcrumb-sep">/</span>
    <span class="page-breadcrumb-current">${escapeHTML(product.name||'')}</span>
  </nav>`;

  DOM.productDetail.innerHTML=`
    ${breadcrumbHtml}
    <div class="product-slider" id="product-slider">
      <div class="product-main-image" id="product-main-image" style="background-image:url('${images[0]}');">
        ${productBadges.length?`<div class="product-badge-detail-stack">${productBadges.map(b=>`<span class="product-badge-detail">${escapeHTML(b)}</span>`).join('')}</div>`:''}
      </div>
      ${imageBarsHtml}
    </div>
    <div class="product-info">
      <div class="product-name-group">
        <h1 class="product-title-main">${product.name||''}</h1>
        <div class="product-brand-price-row">
          <p class="product-by-brand-name"${productVendor?` onclick="navigateToVendor('${escapeJSString(productVendor.slug||productVendor.id)}')"`:''}>${product.brand||'JANEDORE'}${productVendor?' <i class="ph ph-arrow-right"></i>':''}</p>
          <div class="product-price-top">${originalPrice?`<span class="price-current price-sale">${formatPrice(price)}</span><span class="price-original">${formatPrice(originalPrice)}</span>`:`<span class="price-current">${formatPrice(price)}</span>`}</div>
        </div>
      </div>
      <div class="product-size-color-group">
        ${variants.length>1?`<div class="product-variants"><div class="sizes-label">Select Color</div><div class="variants-row">${variantSwatchesHtml(product,vi)}</div></div>`:''}
        ${buildSizeRowHtml(product,vi)}
      </div>
      <div class="product-add-row">
        <button class="product-wish-row-btn${isWished?' wished':''}" onclick="toggleWish('${product.id}',this)" aria-label="Add to Wishlist"><i class="${isWished?'ph-fill':'ph-light'} ph-heart"></i></button>
        <button class="product-add-row-btn" id="product-add-btn" onclick="addToCart('${product.id}',S.selectedSize,S.productQuantity)" ${(soldOut&&!isPreorder)?'disabled':''}>${isPreorder?'Pre-order':(soldOut?'Sold Out':'Add to Cart')}</button>
      </div>
      <div class="info-accordion-wrap">
        <div class="info-accordion-item open" id="info-accordion-description">
          <div class="info-accordion-header" onclick="toggleInfoAccordion('description')">
            Product Information
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div class="info-accordion-body">
            <div>${product.description||'No description available.'}</div>
            ${product.compositionCare?`<p class="info-sub-label">Composition &amp; Care</p><p>${product.compositionCare}</p>`:''}
            ${product.measurements?`<p class="info-sub-label">Measurements</p><p>${product.measurements}</p>`:''}
          </div>
        </div>
        <div class="info-accordion-item" id="info-accordion-shipping">
          <div class="info-accordion-header" onclick="toggleInfoAccordion('shipping')">
            Shipping &amp; Returns
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div class="info-accordion-body"><p>${product.shippingReturns||'No shipping details available.'}</p></div>
        </div>
      </div>
    </div>
    <div style="max-width:720px;margin:0 auto;padding:0 0 32px;">
      ${suggestedSection}${shopByBrandSection}${relatedSection}
    </div>
    <footer id="product-footer"></footer>`;
  buildFooter("product-footer");
  if (typeof renderVendorsFooter === 'function') renderVendorsFooter(S.vendors || []);
  window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled();
  updateAddToCartState();
  setTimeout(() => initProductSwipe(images), 100);
}
