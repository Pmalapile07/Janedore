/* ============================================================
   PRODUCT CARD BUILDERS — unified structure
   ============================================================ */

function productCard(product, compactMode = false, isCollectionPage = false) {
  if (!product) return '';
  if (isCollectionPage && product.id === 'janedore-leather-pouch' && S.currentCategoryPage !== 'sunglasses') return '';

  const vi = S.productVariantSelections[product.id] ?? 0;
  const allImages = getAllProductImages(product, vi);

  const priceHtml = product.salePrice
    ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>`
    : formatPrice(product.price);

  const badgeLabel = getBadgeLabel(product);
  const badgeHtml = badgeLabel
    ? `<div class="product-badge-wrap"><span class="badge-${product.badge === 'sold' ? 'sold' : product.salePrice ? 'sale' : 'new'}">${badgeLabel}</span></div>`
    : "";

  const slidesHtml = allImages.map(u => `<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
  const barsHtml = allImages.length > 1
    ? `<div class="card-slider-bars">${allImages.map((_, i) => `<div class="card-slider-bar${i === 0 ? ' active' : ''}"></div>`).join("")}</div>`
    : '';

  const soldOutClass = isProductSoldOut(product) ? ' sold-out' : '';
  const nameClass = isCollectionPage ? ' collection-name' : '';
  const displayName = isCollectionPage ? truncateName(product.name) : (product.name || '');

  return `<div class="product-card${soldOutClass}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')">
    <div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')">
      <div class="product-card-slides" id="card-slides-${product.id}">${slidesHtml}</div>
      ${barsHtml}${badgeHtml}
    </div>
    ${compactMode ? '' : `
      <div class="product-meta-row">
        <div class="product-brand-tag">${product.brand || ''}</div>
        <div class="product-price-row"><div class="product-price">${priceHtml}</div></div>
      </div>
      <div class="product-name${nameClass}">${displayName}</div>
    `}
  </div>`;
}

function productCardHome(product) {
  if (!product) return '';
  const vi = S.productVariantSelections[product.id] ?? 0;
  const allImages = getAllProductImages(product, vi);

  const priceHtml = product.salePrice
    ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>`
    : formatPrice(product.price);

  const badgeLabel = getBadgeLabel(product);
  const badgeHtml = badgeLabel
    ? `<div class="product-badge-wrap"><span class="badge-${product.badge === 'sold' ? 'sold' : product.salePrice ? 'sale' : 'new'}">${badgeLabel}</span></div>`
    : "";

  const slidesHtml = allImages.map(u => `<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
  const barsHtml = allImages.length > 1
    ? `<div class="card-slider-bars">${allImages.map((_, i) => `<div class="card-slider-bar${i === 0 ? ' active' : ''}"></div>`).join("")}</div>`
    : '';

  return `<div class="product-card${isProductSoldOut(product) ? ' sold-out' : ''}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')">
    <div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')">
      <div class="product-card-slides" id="card-slides-home-${product.id}">${slidesHtml}</div>
      ${barsHtml}${badgeHtml}
    </div>
    <div class="product-meta-row">
      <div class="product-brand-tag">${product.brand || ''}</div>
      <div class="product-price-row"><div class="product-price">${priceHtml}</div></div>
    </div>
    <div class="product-name collection-name">${truncateName(product.name)}</div>
  </div>`;
}

/* ============================================================
   SWIPE SECTION (used by Recently Viewed, You May Also Like, etc.)
   ============================================================ */

function buildSwipeSection(title, products, containerId) {
  const id = containerId || `swipe-${Date.now()}`;
  const cards = products.map(p => buildSwipeCardInner(p)).join('');
  const perView = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2;
  const maxIdx = Math.max(0, products.length - perView);
  const bars = Array.from({ length: maxIdx + 1 }, (_, i) =>
    `<div class="swipe-bar${i === 0 ? ' active' : ''}" onclick="goSwipe('${id}',${i})"></div>`
  ).join('');

  return `<div class="swipe-section">
    <div class="swipe-section-title">${title}</div>
    <div class="swipe-track-wrap" id="wrap-${id}"
         ontouchstart="swipeTouchStart(event,'${id}')"
         ontouchend="swipeTouchEnd(event,'${id}')"
         onmousedown="swipeMouseDown(event,'${id}')">
      <div class="swipe-track" id="track-${id}">${cards}</div>
    </div>
    <div class="swipe-bars" id="bars-${id}">${bars}</div>
  </div>`;
}

/* Returns the FULL card markup (not just inner) so it matches productCardHome */
function buildSwipeCardInner(product) {
  if (!product) return '';
  const vi = S.productVariantSelections[product.id] ?? 0;
  const allImages = getAllProductImages(product, vi);

  const priceHtml = product.salePrice
    ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>`
    : formatPrice(product.price);

  const badgeLabel = getBadgeLabel(product);
  const badgeHtml = badgeLabel
    ? `<div class="product-badge-wrap"><span class="badge-${product.badge === 'sold' ? 'sold' : product.salePrice ? 'sale' : 'new'}">${badgeLabel}</span></div>`
    : "";

  const slidesHtml = allImages.map(u => `<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
  const barsHtml = allImages.length > 1
    ? `<div class="card-slider-bars">${allImages.map((_, i) => `<div class="card-slider-bar${i === 0 ? ' active' : ''}"></div>`).join("")}</div>`
    : '';

  return `<div class="product-card${isProductSoldOut(product) ? ' sold-out' : ''}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')">
    <div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')">
      <div class="product-card-slides" id="card-slides-${product.id}">${slidesHtml}</div>
      ${barsHtml}${badgeHtml}
    </div>
    <div class="product-meta-row">
      <div class="product-brand-tag">${product.brand || ''}</div>
      <div class="product-price-row"><div class="product-price">${priceHtml}</div></div>
    </div>
    <div class="product-name collection-name">${truncateName(product.name)}</div>
  </div>`;
}

/* ============================================================
   CARD SWIPE (image swipe within a single card)
   ============================================================ */

function cardTouchStart(e, productId) {
  S.cardTouchStartX[productId] = e.touches[0].clientX;
}

function cardTouchEnd(e, productId) {
  const startX = S.cardTouchStartX[productId];
  if (!startX) return;
  const diff = startX - e.changedTouches[0].clientX;
  if (Math.abs(diff) < 30) return;

  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  const vi = S.productVariantSelections[productId] ?? 0;
  const allImages = getAllProductImages(product, vi);
  const total = allImages.length;
  const cur = S.cardSlideIndex[productId] ?? 0;

  let nxt = cur;
  if (diff > 0 && cur < total - 1) nxt = cur + 1;
  else if (diff < 0 && cur > 0) nxt = cur - 1;

  S.cardSlideIndex[productId] = nxt;

  document.querySelectorAll(`#card-slides-${productId}, #card-slides-home-${productId}`).forEach(el => {
    if (el) el.style.transform = `translateX(-${nxt * 100}%)`;
  });

  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  if (card) card.querySelectorAll(".card-slider-bar").forEach((d, i) => d.classList.toggle("active", i === nxt));
}

/* ============================================================
   VARIANT SELECT (updates all card instances, incl. swipe sections)
   ============================================================ */

function selectVariant(productId, variantIndex, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  S.productVariantSelections[productId] = variantIndex;

  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const allImages = getAllProductImages(product, variantIndex);

  // Update product cards (grid + home + swipe sections)
  document.querySelectorAll(`.product-card[data-product-id="${productId}"]`).forEach(card => {
    const slidesEl = card.querySelector(".product-card-slides");
    if (slidesEl) {
      slidesEl.innerHTML = allImages.map(u => `<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
      slidesEl.style.transform = "translateX(0)";
    }
    const barsEl = card.querySelector(".card-slider-bars");
    if (barsEl) {
      barsEl.innerHTML = allImages.map((_, i) => `<div class="card-slider-bar${i === 0 ? ' active' : ''}"></div>`).join("");
    }
    S.cardSlideIndex[productId] = 0;
  });

  // Update product detail page images
  if (S.currentPage === "product-detail") {
    const images = getAllProductImages(product, variantIndex);
    const mainImg = document.getElementById("product-main-image");
    const thumbsEl = document.getElementById("product-thumbnails");
    const barsEl = document.getElementById("product-image-bars");

    if (mainImg) { mainImg.style.backgroundImage = `url('${images[0]}')`; }

    if (thumbsEl) {
      thumbsEl.innerHTML = images.map((u, i) =>
        `<div class="product-thumbnail${i === 0 ? ' active' : ''}" style="background-image:url('${u}');" onclick="switchMainImage(${i},'${u.replace(/'/g, "&#39;")}')"></div>`
      ).join('');
    }

    if (barsEl) {
      barsEl.innerHTML = images.map((u, i) =>
        `<div class="swipe-bar${i === 0 ? ' active' : ''}" onclick="switchMainImage(${i},'${u.replace(/'/g, "&#39;")}')"></div>`
      ).join('');
    }

    productImages = images;
    currentImageIndex = 0;

    document.querySelectorAll('.variant-swatch').forEach((s, i) => s.classList.toggle('selected', i === variantIndex));
  }
}
