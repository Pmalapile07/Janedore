function safeImage(url) { return url || PLACEHOLDER_IMAGE; }
function formatPrice(amount) { return `${CURRENCIES[S.currency]?.symbol??"R"}${(amount??0).toFixed(2)}`; }
function isProductSoldOut(product) { return (product?.stock??0)<=0; }

// Pre-order: the Badge field set to "pre-order" in admin, with the brand's
// expected ship date (YYYY-MM-DD). Stock caps how many can be pre-ordered.
// Mirrors server.js isPreorderProduct().
function isPreorderProduct(product) { return String(product?.badge || '').trim().toLowerCase() === 'pre-order'; }
function preorderShipText(dateStr, short) {
  const d = dateStr ? new Date(String(dateStr).slice(0, 10) + 'T12:00:00') : null;
  if (!d || isNaN(d)) return '';
  return d.toLocaleDateString('en-ZA', short ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

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
  // Default to the first size actually in stock for this color, so the
  // customer can add straight away instead of being told to pick one
  // (and a product with only one available size never asks at all).
  if (!S.selectedSize || !sizes.includes(S.selectedSize) || !isSizeInStock(product, variantIndex, S.selectedSize)) {
    S.selectedSize = sizes.find(s => isSizeInStock(product, variantIndex, s)) || null;
  }
  const buttons = sizes.map(s => {
    const inStock = isSizeInStock(product, variantIndex, s);
    const cls = 'product-size-btn' + (S.selectedSize === s ? ' sel' : '') + (inStock ? '' : ' out-of-stock');
    const selectable = inStock || product.waitlist;
    return `<button class="${cls}" ${selectable ? '' : 'disabled aria-disabled="true"'} onclick="selectProductSize(this,'${s}')"${inStock ? '' : ' aria-label="' + escapeHTML(s) + ', sold out"'}>${escapeHTML(s)}</button>`;
  }).join('');
  return `<div class="product-sizes" id="product-size-row"><div class="sizes-label">Select a Size</div><div class="sizes-row">${buttons}</div></div>`;
}

// Waitlist (waitlist-api.js): products with "Waitlist when sold out"
// on in admin keep their sold-out sizes selectable, and the Add to Bag
// button reads Add to Waitlist for them (updateAddToCartState). Signed-in
// customers join straight away; guests are asked to sign in first, since
// the waitlist lives in My Account.
function productWaitlistMode(product) {
  if (!product || !product.waitlist) return false;
  const vi = S.productVariantSelections[product.id] ?? 0;
  const hasSizes = (product.sizes || []).filter(s => s !== 'OS').length > 0;
  if (hasSizes) return !!S.selectedSize && !isSizeInStock(product, vi, S.selectedSize);
  return isProductSoldOut(product) || !isSizeInStock(product, vi, 'OS');
}

async function joinProductWaitlist(product, btn) {
  const user = firebase.auth().currentUser;
  if (!user || user.isAnonymous) {
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Sign in to join the waitlist', 'ph-user');
    navigateToLogin();
    return;
  }
  const label = btn && btn.querySelector('.sticky-btn-label');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
      body: JSON.stringify({ productId: product.id, variantIndex: S.productVariantSelections[product.id] ?? 0, size: S.selectedSize || 'OS' }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    if (label) label.textContent = 'Added';
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Added to your waitlist', 'ph-check-circle');
    setTimeout(updateAddToCartState, 1600);
  } catch (e) {
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast(e.message, 'ph-warning-circle');
    updateAddToCartState();
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Re-evaluates the sticky bar's Add to Bag button (the page's only add
// button) label/disabled state against
// whatever's currently selected (size, color). Called after both size
// and color selection rather than duplicating this logic at each call
// site — S.currentReviewProductId doubles as "the product currently on
// screen" (set by goToProduct()), same convention sticky-bar.js uses.
function updateAddToCartState() {
  if (S.currentPage !== 'product-detail') return;
  const product = PRODUCTS.find(p => p.id === S.currentReviewProductId);
  const stickyBtn = document.getElementById('sticky-add-btn');
  if (!product || !stickyBtn) return;
  const vi = S.productVariantSelections[product.id] ?? 0;
  const isPreorder = isPreorderProduct(product);
  const soldOut = isProductSoldOut(product);
  const realSizes = (product.sizes || []).filter(s => s !== 'OS');
  const hasSizes = realSizes.length > 0;
  // A size is auto-selected whenever one is in stock (buildSizeRowHtml),
  // so no selection here means this color has none left.
  const noSizeInStock = hasSizes && !realSizes.some(s => isSizeInStock(product, vi, s));
  const needsSize = hasSizes && !S.selectedSize && !noSizeInStock;
  const sizeOutOfStock = !needsSize && hasSizes && !isSizeInStock(product, vi, S.selectedSize);
  const waitlist = productWaitlistMode(product);
  // Waitlist on and every size of this colour sold out: pick one first.
  const pickForWaitlist = !!product.waitlist && hasSizes && !S.selectedSize;
  stickyBtn.disabled = waitlist ? false : (pickForWaitlist || needsSize || sizeOutOfStock || soldOut);

  // Never overwrite the transient "Added" feedback; "Add" instead of
  // "Add to Bag" once the bar is minimized.
  const bar = document.getElementById('sticky-add-bar');
  if (bar && bar.classList.contains('added-feedback')) return;
  const label = stickyBtn.querySelector('.sticky-btn-label');
  const defaultLabel = (bar && bar.classList.contains('minimized')) ? 'Add' : 'Add to Bag';
  if (waitlist) { if (label) label.textContent = bar && bar.classList.contains('minimized') ? 'Waitlist' : 'Add to Waitlist'; return; }
  if (pickForWaitlist) { if (label) label.textContent = 'Select a Size'; return; }
  const unavailable = (sizeOutOfStock || soldOut) ? (isPreorder ? 'Pre-orders Full' : 'Sold Out') : '';
  if (label) label.textContent = needsSize ? 'Select a Size' : (unavailable || (isPreorder ? 'Pre-order' : defaultLabel));
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
var RESERVED_BADGE_VALUES = ['new', 'sale', 'sold out', 'sold', 'free delivery'];

function isProductNew(product) {
  var created = product && product.createdAt ? new Date(product.createdAt).getTime() : NaN;
  if (!created || isNaN(created)) return false;
  var ageMs = Date.now() - created;
  return ageMs >= 0 && ageMs <= PRODUCT_NEW_DAYS * 24 * 60 * 60 * 1000;
}

// "SALE" → "badge-sale", "SOLD OUT" → "badge-sold-out": lets each badge
// be styled on its own (product-grid.css / product-info.css).
function badgeClass(label) {
  return 'badge-' + String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  // Products marked Free delivery from brands that offer it (cart.js),
  // the same products as the Free Delivery collection.
  if (typeof isFreeDeliveryProduct === 'function' && isFreeDeliveryProduct(product)) badges.push('FREE DELIVERY');

  return badges;
}

// Product cards are too small for every badge, so they show the one that
// matters most to buying it (sold out, pre-order, sale, a custom admin
// badge, then new), plus FREE DELIVERY under it when it applies. Sold out
// always shows alone. The product page's larger image keeps every badge
// (getProductBadges()).
var CARD_BADGE_PRIORITY = ['SOLD OUT', 'PRE-ORDER', 'SALE'];
function getCardBadges(product) {
  var badges = getProductBadges(product);
  var free = badges.indexOf('FREE DELIVERY') !== -1;
  var rest = badges.filter(function (b) { return b !== 'FREE DELIVERY'; });
  var main = null;
  for (var i = 0; i < CARD_BADGE_PRIORITY.length && !main; i++) {
    if (rest.indexOf(CARD_BADGE_PRIORITY[i]) !== -1) main = CARD_BADGE_PRIORITY[i];
  }
  if (!main) main = rest.filter(function (b) { return b !== 'NEW'; })[0] || rest[0] || null;
  if (main === 'SOLD OUT') return [main];
  return (main ? [main] : []).concat(free ? ['FREE DELIVERY'] : []);
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

// Each color box shows that color's own product photo (product-on-white
// shot first, then model, then detail), scaled by Cloudinary to fit the
// box without cropping (c_fit). A color with no photos shows its flat
// swatch color instead.
function variantSwatchThumb(variant) {
  const imgs = variant?.images || {};
  const url = [imgs.ghost, imgs.model, imgs.detail].map(a => (a || []).filter(Boolean)[0]).find(Boolean);
  if (!url) return '';
  return escapeForCssUrl(safeImageURL(url).replace('/upload/', '/upload/f_auto,q_auto,c_fit,w_144,h_192/'));
}
function variantSwatchesHtml(product, selectedIndex) {
  const variants = product?.variants || [];
  const si = selectedIndex !== undefined ? selectedIndex : (S.productVariantSelections[product.id] ?? 0);
  const soldOut = isProductSoldOut(product);
  return variants.map((v, i) => {
    const thumb = variantSwatchThumb(v);
    const cls = `variant-swatch${i === si ? ' selected' : ''}${soldOut ? ' sold-out' : ''}${thumb ? ' has-image' : ''}`;
    const style = thumb ? `background-image:url('${thumb}');` : `background-color:${escapeHTML(v.swatch || '#ccc')};`;
    const label = escapeHTML(v.color || `Color ${i + 1}`);
    return `<span class="${cls}" style="${style}" role="button" aria-label="${label}" title="${label}" onclick="event.stopPropagation();selectVariant('${product.id}',${i},event)"></span>`;
  }).join('');
}

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

function changeProductQuantity(delta) {
  const product = PRODUCTS.find(p => p.id === S.currentReviewProductId);
  const current = Math.max(1, Number(S.productQuantity) || 1);
  const stock = Number(product?.stock);
  const next = current + delta;
  const max = Number.isFinite(stock) && stock > 0 ? stock : Infinity;
  S.productQuantity = Math.min(max, Math.max(1, next));
  const value = document.getElementById('product-quantity-value');
  if (value) value.textContent = String(S.productQuantity);
  const minus = document.getElementById('product-quantity-minus');
  const plus = document.getElementById('product-quantity-plus');
  if (minus) minus.disabled = S.productQuantity <= 1;
  if (plus) plus.disabled = S.productQuantity >= max;
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
function goBackFromProduct() {
  if (window.history.length > 1) window.history.back();
  else navigateTo('home');
}

async function shareCurrentProduct(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  const url = window.location.href;
  const title = product?.name || document.title || 'JANEDORE product';
  const shareData = { title, text: title, url };
  if (navigator.share) {
    try { await navigator.share(shareData); }
    catch (error) { if (error?.name !== 'AbortError') console.error('Product share failed:', error); }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    alert('Product link copied. You can now share it in any app.');
  } catch (error) {
    window.prompt('Copy this product link to share it:', url);
  }
}

async function renderProductPage(product) {
  // Reset scroll FIRST, before any DOM writes below — not just
  // before the real content (the big innerHTML write further down),
  // but before even showLoading()'s placeholder. Product pages are
  // almost always opened from partway down a scrolled grid (unlike
  // quick-link taps, which happen near the top already), so there's
  // real scrollY to carry over. Doing this at the end of the function
  // (where it used to be) left a window where the browser could paint
  // a frame of the new, tall content at the OLD scroll position —
  // showing whatever section of the product page happened to fall at
  // that old offset — before snapping to top, which is exactly what
  // looked like "the page slides up under the header as if someone
  // scrolled."
  resetScrollToTop();
  document.querySelectorAll(".page").forEach(pg=>pg.classList.remove("active")); DOM.productDetail.classList.add("active"); S.currentPage="product-detail"; S.selectedSize=null; S.productQuantity=1;
  if(DOM.mainNav) { DOM.mainNav.classList.add("product-page"); DOM.mainNav.classList.remove("collection-page"); }
  showLoading(DOM.productDetail);

  // FIX: ensure variant selection is initialized before rendering
  if(S.productVariantSelections[product.id] === undefined) {
    S.productVariantSelections[product.id] = 0;
  }

  const vi=S.productVariantSelections[product.id]; const images=getAllProductImages(product,vi);
  const variants=product.variants||[];
  // 'OS' is a placeholder sentinel, not a real size — never show it as
  // a selectable "size" (there's nothing to actually select).
  const sizes=(product.sizes||[]).filter(s=>s!=='OS');
  const productBadges=getProductBadges(product);
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

  const titleCaseBreadcrumb = value => String(value || '').replace(/[-_]+/g, ' ').trim().toLowerCase().replace(/(^|\\s)\\S/g, letter => letter.toUpperCase());
  const productCollectionValues = (Array.isArray(product.collections) ? product.collections : String(product.collections || '').split(','))
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  const publishedCollections = typeof window._loadPublishedCollections === 'function'
    ? await window._loadPublishedCollections()
    : (window._publishedCollections || []);
  const productCollection = publishedCollections.find(collection => {
    const handle = String(collection.handle || collection.slug || collection.id || '').trim().toLowerCase();
    const title = String(collection.title || collection.name || '').trim().toLowerCase();
    return productCollectionValues.some(value => value === handle || value === title);
  });
  const collectionHandle = productCollection && (productCollection.handle || productCollection.slug || productCollection.id);
  const collectionLabel = titleCaseBreadcrumb(productCollection && (productCollection.title || productCollection.name || collectionHandle));
  const breadcrumbSeparator = '<span class="page-breadcrumb-sep" aria-hidden="true"> / </span>';
  const breadcrumbHtml = `<div class="product-breadcrumb-bar">
    <button class="product-breadcrumb-back" type="button" onclick="goBackFromProduct()" aria-label="Go back"><i class="ph ph-arrow-left"></i></button>
    <nav class="page-breadcrumb" aria-label="Breadcrumb">
      <span class="page-breadcrumb-link" onclick="navigateTo('home')">Home</span>
      ${productCollection && collectionHandle ? `${breadcrumbSeparator}<span class="page-breadcrumb-link" onclick="navigateToCollection('${escapeJSString(collectionHandle)}')">${escapeHTML(collectionLabel)}</span>` : ''}
      ${breadcrumbSeparator}<span class="page-breadcrumb-current">${escapeHTML(titleCaseBreadcrumb(product.name || ''))}</span>
    </nav>
    <button class="product-breadcrumb-share" type="button" onclick="shareCurrentProduct('${escapeJSString(product.id)}')" aria-label="Share product"><i class="ph ph-share-network"></i></button>
  </div>`;

  DOM.productDetail.innerHTML=`
    ${breadcrumbHtml}
    <div class="product-slider" id="product-slider">
      <div class="product-main-image" id="product-main-image" style="background-image:url('${images[0]}');">
        ${productBadges.length?`<div class="product-badge-detail-stack">${productBadges.map(b=>`<span class="product-badge-detail ${badgeClass(b)}">${escapeHTML(b)}</span>`).join('')}</div>`:''}
      </div>
      ${imageBarsHtml}
    </div>
    <div class="product-info">
      <div class="product-name-group">
        <h1 class="product-title-main">${product.name||''}</h1>
        <div class="product-brand-price-row">
          <p class="product-by-brand-name"${productVendor?` onclick="navigateToVendor('${escapeJSString(productVendor.slug||productVendor.id)}')"`:''}>${product.brand||'JANEDORE'}${productVendor?' <i class="ph ph-arrow-right"></i>':''}</p>
        </div>
      </div>
      ${isPreorderProduct(product) ? `<div class="product-preorder-note"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span><strong>Pre-order</strong>${product.preorderShipDate ? ` · Estimated dispatch: ${escapeHTML(preorderShipText(product.preorderShipDate))}` : ''}<br>Payment is taken at checkout. This item is dispatched separately once available.</span></div>` : ''}
      <div class="product-quantity-row" aria-label="Quantity selector">
        <span class="product-quantity-label">Quantity</span>
        <div class="product-quantity-control">
          <button class="product-quantity-btn" id="product-quantity-minus" type="button" aria-label="Decrease quantity" onclick="changeProductQuantity(-1)" disabled>−</button>
          <span class="product-quantity-value" id="product-quantity-value" aria-live="polite">1</span>
          <button class="product-quantity-btn" id="product-quantity-plus" type="button" aria-label="Increase quantity" onclick="changeProductQuantity(1)" ${product.stock <= 1 ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <div class="product-size-color-group">
        ${buildSizeRowHtml(product,vi)}
        ${variants.length?`<div class="product-variants"><div class="sizes-label">Select a Color</div><div class="variants-row">${variantSwatchesHtml(product,vi)}</div></div>`:''}
      </div>
      <div class="info-accordion-wrap">
        <div class="info-accordion-item open" id="info-accordion-description">
          <div class="info-accordion-header" onclick="toggleInfoAccordion('description')">
            Product Information
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
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
  ensureNavScrolled();
  if (typeof createStickyBar === 'function') createStickyBar(product);
  updateAddToCartState();
  setTimeout(() => initProductSwipe(images), 100);
}
