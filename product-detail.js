function safeImage(url) { return url || PLACEHOLDER_IMAGE; }
function formatPrice(amount) { return `${CURRENCIES[S.currency]?.symbol??"R"}${(amount??0).toFixed(2)}`; }
function isProductSoldOut(product) { return (product?.stock??0)<=0; }
function wordCount(str) { return (str||'').split(/\s+/).filter(Boolean).length; }
function truncateName(name) { if(!name) return ''; const w=name.split(' '); return w.length<=3?name:w.slice(0,3).join(' ')+'<br>'+w.slice(3).join(' '); }
function truncateNameEllipsis(name) { if(!name) return ''; const w=name.split(' '); return w.length<=3?name:w.slice(0,3).join(' ')+'…'; }

function getProductImages(product, variantIndex) {
  const idx = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[product.id] ?? 0);
  const variant = product?.variants?.[idx] ?? product?.variants?.[0] ?? {};
  if (product.category === 'jewelry') return [...(variant.images?.model||[]), ...(variant.images?.ghost||[])].filter(Boolean).length ? [...(variant.images?.model||[]), ...(variant.images?.ghost||[])].filter(Boolean) : [PLACEHOLDER_IMAGE];
  return variant.images?.[S.imageMode] || variant.images?.ghost || variant.images?.model || [PLACEHOLDER_IMAGE];
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
function stickySwatchesHtml(product, selectedIndex) { const variants = product?.variants || []; const si = selectedIndex !== undefined ? selectedIndex : (S.productVariantSelections[product.id] ?? 0); const soldOut = isProductSoldOut(product); return variants.map((v,i)=>{ let cls = `sticky-swatch${i===si?" selected":""}${soldOut?" sold-out":""}`; return `<span class="${cls}" style="background:${v.swatch||'#ccc'};" onclick="event.stopPropagation();selectStickyVariant('${product.id}',${i})"></span>`; }).join(""); }
function selectVariant(productId, variantIndex, evt) {
  if(evt){evt.stopPropagation();evt.preventDefault();} S.productVariantSelections[productId]=variantIndex; const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  const allImages = getAllProductImages(product, variantIndex);
  document.querySelectorAll(`.product-card[data-product-id="${productId}"]`).forEach(card=>{ const slidesEl=card.querySelector(".product-card-slides"); if(slidesEl) slidesEl.innerHTML = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join(""); const barsEl=card.querySelector(".card-slider-bars"); if(barsEl) barsEl.innerHTML = allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join(""); const sc=card.querySelector(".product-card-slides"); if(sc){sc.style.transform="translateX(0)"; S.cardSlideIndex[productId]=0;} });
  if(S.currentPage==="product-detail"){ const images=getAllProductImages(product, variantIndex); const mainImg=document.getElementById("product-main-image"); const thumbsEl=document.getElementById("product-thumbnails"); if(mainImg){ mainImg.style.backgroundImage=`url('${images[0]}')`; } if(thumbsEl){ thumbsEl.innerHTML = images.map((u,i)=>`<div class="product-thumbnail${i===0?' active':''}" style="background-image:url('${u}');" onclick="switchMainImage(${i},'${u.replace(/'/g,"\\'")}')"></div>`).join(""); } updateStickyBar(product); updateStickyBarExtras(); }
}
function selectStickyVariant(productId, idx) { selectVariant(productId, idx); updateStickyBarExtras(); }

function switchMainImage(index, url) {
  const mainImage = document.getElementById('product-main-image');
  if (mainImage) { mainImage.style.backgroundImage = `url('${url}')`; }
  document.querySelectorAll('.product-thumbnail').forEach((t, i) => t.classList.toggle('active', i === index));
}

let productImages = [];
let currentImageIndex = 0;

function initProductSwipe(images) {
  productImages = images;
  currentImageIndex = 0;
  const mainImage = document.getElementById('product-main-image');
  if (!mainImage || !images.length) return;
  
  let touchStartX = 0;
  let touchEndX = 0;
  
  mainImage.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
  }, {passive: true});
  
  mainImage.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) < 40) return;
    if (diff > 0 && currentImageIndex < productImages.length - 1) {
      currentImageIndex++;
    } else if (diff < 0 && currentImageIndex > 0) {
      currentImageIndex--;
    }
    mainImage.style.backgroundImage = `url('${productImages[currentImageIndex]}')`;
    document.querySelectorAll('.product-thumbnail').forEach((t, i) => t.classList.toggle('active', i === currentImageIndex));
  }, {passive: true});
}

function productCard(product, compactMode=false, isCollectionPage=false) {
  if(!product) return ''; if(isCollectionPage && product.id === 'janedore-leather-pouch' && S.currentCategoryPage !== 'sunglasses') return '';
  const vi = S.productVariantSelections[product.id] ?? 0; const allImages = getAllProductImages(product, vi);
  const priceHtml = product.salePrice ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>` : formatPrice(product.price);
  const badgeLabel = product.badge==="sold"?"Sold Out":product.badge==="new"?"New":product.salePrice?"Sale":""; const badgeHtml = badgeLabel ? `<div class="product-badge-wrap"><span class="badge-${product.badge==='sold'?'sold':product.salePrice?'sale':'new'}">${badgeLabel}</span></div>` : "";
  const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join(""); const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : '';
  const soldOutClass = isProductSoldOut(product) ? ' sold-out' : ''; const nameClass = isCollectionPage ? ' collection-name' : ''; const displayName = isCollectionPage ? truncateName(product.name) : (product.name || '');
  return `<div class="product-card${soldOutClass}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')"><div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')"><div class="product-card-slides" id="card-slides-${product.id}">${slidesHtml}</div>${barsHtml}${badgeHtml}</div>${compactMode ? '' : `<div class="product-brand-tag">${product.brand||''}</div><div class="product-name${nameClass}">${displayName}</div><div class="product-price-row"><div class="product-price">${priceHtml}</div></div>`}</div>`;
}
function productCardHome(product) {
  if(!product) return ''; const vi = S.productVariantSelections[product.id] ?? 0; const allImages = getAllProductImages(product, vi);
  const priceHtml = product.salePrice ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>` : formatPrice(product.price);
  const badgeLabel = product.badge==="sold"?"Sold Out":product.badge==="new"?"New":product.salePrice?"Sale":""; const badgeHtml = badgeLabel ? `<div class="product-badge-wrap"><span class="badge-${product.badge==='sold'?'sold':product.salePrice?'sale':'new'}">${badgeLabel}</span></div>` : "";
  const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join(""); const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : '';
  return `<div class="product-card${isProductSoldOut(product)?' sold-out':''}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')"><div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')"><div class="product-card-slides" id="card-slides-home-${product.id}">${slidesHtml}</div>${barsHtml}${badgeHtml}</div><div class="product-brand-tag">${product.brand||''}</div><div class="product-name collection-name">${truncateName(product.name)}</div><div class="product-price-row"><div class="product-price">${priceHtml}</div></div></div>`;
}
function cardTouchStart(e, productId) { S.cardTouchStartX[productId] = e.touches[0].clientX; }
function cardTouchEnd(e, productId) { const startX = S.cardTouchStartX[productId]; if(!startX) return; const diff = startX - e.changedTouches[0].clientX; if(Math.abs(diff) < 30) return; const product = PRODUCTS.find(p=>p.id===productId); if(!product) return; const vi = S.productVariantSelections[productId] ?? 0; const allImages = getAllProductImages(product, vi); const total = allImages.length; const cur = S.cardSlideIndex[productId] ?? 0; let nxt = cur; if(diff > 0 && cur < total - 1) nxt = cur + 1; else if(diff < 0 && cur > 0) nxt = cur - 1; S.cardSlideIndex[productId] = nxt; document.querySelectorAll(`#card-slides-${productId}, #card-slides-home-${productId}`).forEach(el => { if(el) el.style.transform = `translateX(-${nxt*100}%)`; }); const card = document.querySelector(`.product-card[data-product-id="${productId}"]`); if(card) card.querySelectorAll(".card-slider-bar").forEach((d,i)=>d.classList.toggle("active",i===nxt)); }
function getCompleteLookProducts(currentProduct) {
  if (!currentProduct) return []; const active = PRODUCTS.filter(p => p.status === 'active' && p.id !== currentProduct.id); const pouch = active.find(p => p.id === 'janedore-leather-pouch'); const clothing = active.filter(p => ['dresses','tops','bottoms','jackets','sets'].includes(p.category)); const tops = clothing.filter(p => p.category === 'tops'), bottoms = clothing.filter(p => p.category === 'bottoms'); const dresses = clothing.filter(p => p.category === 'dresses'), jewelry = active.filter(p => p.category === 'jewelry'); const bags = active.filter(p => p.category === 'bags' && p.id !== 'janedore-leather-pouch'); const sunglasses = active.filter(p => p.category === 'sunglasses'), parfum = active.filter(p => p.category === 'parfum'); let s = []; const cat = currentProduct.category;
  if (cat === 'sunglasses') { if (pouch) s.push(pouch); s = s.concat(tops.slice(0,2)); if (s.length < 3) s = s.concat(bottoms.slice(0,1)); } else if (['tops','bottoms','dresses','jackets','sets'].includes(cat)) { if (cat === 'tops') { s = s.concat(bottoms.slice(0,1)); s = s.concat(jewelry.slice(0,1)); if (pouch) s.push(pouch); } else if (cat === 'bottoms') { s = s.concat(tops.slice(0,2)); s = s.concat(jewelry.slice(0,1)); } else if (cat === 'dresses') { s = s.concat(jewelry.slice(0,2)); } else { s = s.concat(tops.slice(0,1)); s = s.concat(bottoms.slice(0,1)); } if (s.length < 4) s = s.concat(bags.slice(0,1)); } else if (cat === 'parfum') { s = s.concat(clothing.slice(0,2)); s = s.concat(sunglasses.slice(0,1)); } else if (cat === 'bags') { s = s.concat(jewelry.slice(0,2)); s = s.concat(sunglasses.slice(0,1)); if (pouch && currentProduct.id !== 'janedore-leather-pouch') s.push(pouch); } else if (cat === 'jewelry') { if (pouch) s.push(pouch); s = s.concat(tops.slice(0,2)); }
  return [...new Set(s)].slice(0,6);
}
function buildSwipeSection(title, products, containerId) { const id = containerId || `swipe-${Date.now()}`; const cards = products.map(p => `<div class="product-card" data-product-id="${p.id}" onclick="goToProduct('${p.id}')">${buildSwipeCardInner(p)}</div>`).join(''); const perView = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2; const maxIdx = Math.max(0, products.length - perView); const bars = Array.from({length: maxIdx+1}, (_,i) => `<div class="swipe-bar${i===0?' active':''}" onclick="goSwipe('${id}',${i})"></div>`).join(''); return `<div class="swipe-section"><div class="swipe-section-title">${title}</div><div class="swipe-track-wrap" id="wrap-${id}" ontouchstart="swipeTouchStart(event,'${id}')" ontouchend="swipeTouchEnd(event,'${id}')" onmousedown="swipeMouseDown(event,'${id}')"><div class="swipe-track" id="track-${id}">${cards}</div></div><div class="swipe-bars" id="bars-${id}">${bars}</div></div>`; }
function buildSwipeCardInner(product) { if(!product) return ''; const vi = S.productVariantSelections[product.id] ?? 0; const allImages = getAllProductImages(product, vi); const priceHtml = product.salePrice ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>` : formatPrice(product.price); const badgeLabel = product.badge==="sold"?"Sold Out":product.badge==="new"?"New":product.salePrice?"Sale":""; const badgeHtml = badgeLabel ? `<div class="product-badge-wrap"><span class="badge-${product.badge==='sold'?'sold':product.salePrice?'sale':'new'}">${badgeLabel}</span></div>` : ""; const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join(""); const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : ''; return `<div class="product-img-wrap${isProductSoldOut(product)?' sold-out':''}" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')"><div class="product-card-slides">${slidesHtml}</div>${barsHtml}${badgeHtml}</div><div class="product-brand-tag">${product.brand||''}</div><div class="product-name">${product.name||''}</div><div class="product-price-row"><div class="product-price">${priceHtml}</div></div>`; }
function selectSize(btn,size) { document.querySelectorAll(".modal-size-btn").forEach(b=>b.classList.remove("sel")); btn.classList.add("sel"); S.selectedSize=size; }
function switchInfoTab(tab) { S.productInfoTab=tab; document.querySelectorAll('.info-tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); document.querySelectorAll('.info-tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.tab===tab)); }
function toggleDescExpand() { const desc=document.getElementById('modal-desc'); const toggle=document.getElementById('desc-toggle'); if(!desc||!toggle)return; if(desc.classList.contains('expanded')){desc.classList.remove('expanded');toggle.textContent='View More';}else{desc.classList.add('expanded');toggle.textContent='View Less';} }

async function renderProductPage(product) {
  document.querySelectorAll(".page").forEach(pg=>pg.classList.remove("active")); DOM.productDetail.classList.add("active"); S.currentPage="product-detail"; S.selectedSize=null;
  S.stickyWishHidden = false;
  if(DOM.mainNav) { DOM.mainNav.classList.add("product-page"); DOM.mainNav.classList.remove("collection-page"); }
  showLoading(DOM.productDetail);
  const vi=S.productVariantSelections[product.id]??0; const images=getAllProductImages(product,vi); const isWished=S.wishlist.some(w=>w.id===product.id); const soldOut=isProductSoldOut(product);
  const related=merchandiseProducts(PRODUCTS.filter(p=>p.id!==product.id&&p.category===product.category&&p.status==='active')).slice(0,6); const relatedSection=related.length?buildSwipeSection('You May Also Like',related,`related-${product.id}`):'';
  const ctl=getCompleteLookProducts(product); const ctlSection=ctl.length?buildSwipeSection('Complete the Look',ctl,`ctl-${product.id}`):'';
  const rv=S.recentlyViewed.filter(p=>p.id!==product.id).slice(0,6); const rvSection=rv.length?buildSwipeSection('Recently Viewed',rv,`rv-${product.id}`):'';
  const reviews=await getProductReviews(product.id); const reviewsHtml=reviews.length?reviews.map(r=>`<div style="font-size:12px;font-weight:300;color:#555;margin-bottom:10px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)} — ${r.text||'No comment'}<br><small style="color:#aaa;">${r.name||'Anonymous'} · ${r.country||'Unknown'} · ${r.createdAt?new Date(r.createdAt.seconds*1000).toLocaleDateString():'Recently'}</small></div>`).join(''):'<p class="no-reviews">No reviews yet.</p>';
  const hasDesc=product.description&&product.description.length>0; const descWordCount=wordCount(product.description); const showViewMore=descWordCount>20;
  const wishIconClass=isWished?"ph-fill ph-bookmark-simple":"ph-thin ph-bookmark-simple";
  DOM.productDetail.innerHTML=`
    <div class="product-slider" id="product-slider">
      <div class="product-main-image" id="product-main-image" style="background-image:url('${images[0]}');"></div>
      <div class="product-thumbnails" id="product-thumbnails">
        ${images.map((u,i)=>`<div class="product-thumbnail${i===0?' active':''}" style="background-image:url('${u}');" onclick="switchMainImage(${i},'${u.replace(/'/g,"\\'")}')"></div>`).join("")}
      </div>
    </div>
    <div class="product-info" style="margin-top:5px;">
      <div class="info-tabs-wrap">
        <button class="info-tab-btn active" data-tab="description" onclick="switchInfoTab('description')">Description</button>
        <button class="info-tab-btn" data-tab="composition" onclick="switchInfoTab('composition')">Composition</button>
        <button class="info-tab-btn" data-tab="measurements" onclick="switchInfoTab('measurements')">Measurements</button>
        <button class="info-tab-btn" data-tab="shipping" onclick="switchInfoTab('shipping')">Shipping</button>
      </div>
      <div class="info-tab-panel active" data-tab="description">
        ${hasDesc?`<div class="modal-desc" id="modal-desc">${product.description||''}</div>${showViewMore?`<button class="modal-desc-toggle" id="desc-toggle" onclick="toggleDescExpand()">View More</button>`:''}`:'<p style="font-size:12px;font-weight:300;color:#888;">No description available.</p>'}
        <div class="product-brand-under-desc"><span>Brand: ${product.brand||''}</span><button class="inline-wish-btn" onclick="event.stopPropagation();toggleWish('${product.id}');var t=this.querySelector('i');t.className=t.className.includes('ph-fill')?'ph-thin ph-bookmark-simple':'ph-fill ph-bookmark-simple';"><i class="${wishIconClass}"></i></button></div>
      </div>
      <div class="info-tab-panel" data-tab="composition"><p>${product.compositionCare||'No composition details available.'}</p></div>
      <div class="info-tab-panel" data-tab="measurements"><p>${product.measurements||'No measurements available.'}</p></div>
      <div class="info-tab-panel" data-tab="shipping"><p>${product.shippingReturns||'No shipping details available.'}</p><div class="shipping-calc"><input id="postal-code-input" placeholder="Enter postal code"><button onclick="calculateShipping()">Calculate</button></div><div class="shipping-result" id="shipping-result"></div></div>
    </div>
    <div style="max-width:720px;margin:0 auto;padding:0 12px;">
      <div class="ai-disclaimer-notice"><span>*</span><p>Select imagery may include AI-assisted production.<br><strong>Product accuracy remains a priority.</strong></p></div>
      ${ctlSection}${relatedSection}
      <div class="reviews-section"><div class="reviews-title">Reviews</div>${reviewsHtml}<button class="write-review-btn" onclick="openReviewModal()">Write a Review</button></div>
      ${rvSection}
    </div>
    <div class="back-btn-wrap"><button class="back-btn" onclick="goBackFromProduct()">Back</button></div>
    <footer id="product-footer"></footer>`;
  buildFooter("product-footer"); window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled(); setTimeout(refreshSwipeTracks,50);
  createStickyBar(product); S.productInfoTab='description';
  setTimeout(() => initProductSwipe(images), 100);
}
