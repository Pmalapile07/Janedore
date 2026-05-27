function loadWishlistFromStorage() {
  try {
    const saved = localStorage.getItem('janedore_wishlist');
    if (saved) {
      const ids = JSON.parse(saved);
      S.wishlist = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    }
  } catch(e) {
    S.wishlist = [];
  }
}

function saveWishlistToStorage() {
  try {
    const ids = S.wishlist.map(p => p.id);
    localStorage.setItem('janedore_wishlist', JSON.stringify(ids));
  } catch(e) {}
}

function toggleWish(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const idx = S.wishlist.findIndex(w => w.id === productId);
  if (idx >= 0) {
    S.wishlist.splice(idx, 1);
  } else {
    S.wishlist.push(product);
  }
  updateBadges();
  renderWishlistPage();
  saveWishlistToStorage();
}

function renderWishlistPage() {
  if (!DOM.wishPageContent) return;
  if (!S.wishlist.length) {
    DOM.wishPageContent.innerHTML = '<div class="wish-page-empty"><div class="wish-page-empty-title">Your wishlist is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>';
    return;
  }
  DOM.wishPageContent.innerHTML = `<div class="wish-page-title">Wishlist (${S.wishlist.length})</div><div class="wish-page-grid">${S.wishlist.map(p => {
    const vi = S.productVariantSelections[p.id] ?? 0;
    const priceHtml = p.salePrice
      ? `<span class="wish-page-price-sale">${formatPrice(p.salePrice)}</span><span class="wish-page-price-original">${formatPrice(p.price)}</span>`
      : `<span class="wish-page-price">${formatPrice(p.price)}</span>`;
    const allImages = getAllProductImages(p, vi);
    const thumbnail = allImages.length ? allImages[0] : PLACEHOLDER_IMAGE;
    const soldOutClass = isProductSoldOut(p) ? ' sold-out' : '';
    return `<div class="product-card${soldOutClass}" data-product-id="${p.id}" onclick="goToProduct('${p.id}')">
      <div class="product-img-wrap">
        <div class="product-card-slides">
          <div class="product-card-slide" style="background-image:url('${thumbnail}');"></div>
        </div>
      </div>
      <div class="product-brand-tag">${p.brand || ''}</div>
      <div class="product-name collection-name">${truncateName(p.name)}</div>
      <div class="product-price-row"><div class="product-price">${priceHtml}</div></div>
    </div>`;
  }).join("")}</div>`;
}
