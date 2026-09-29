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

function toggleWish(productId, btnEl) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const idx = S.wishlist.findIndex(w => w.id === productId);
  const nowWished = idx < 0;
  if (idx >= 0) {
    S.wishlist.splice(idx, 1);
  } else {
    S.wishlist.push(product);
  }
  // Collection/category/home grids don't re-render on a wish toggle
  // (only the wishlist page does, below), so flip this specific
  // button's icon directly rather than requiring a full grid rebuild
  // to see the change.
  if (btnEl) {
    const icon = btnEl.querySelector('i');
    if (icon) icon.className = nowWished ? 'ph-fill ph-heart' : 'ph-thin ph-heart';
    btnEl.classList.toggle('wished', nowWished);
  }
  updateBadges();
  renderWishlistPage();
  saveWishlistToStorage();
}

// Cycles 1/2/3 columns, same pattern as toggleGrid()/toggleGridCat() on
// the All Products / Category pages — kept separate (S.gridColsWish)
// so switching the wishlist's layout doesn't affect theirs or vice versa.
function toggleGridWish() {
  S.gridColsWish = S.gridColsWish === 1 ? 2 : S.gridColsWish === 2 ? 3 : 1;
  renderWishlistPage();
}

// Stripped down to reuse productCard() (collection.js) directly instead
// of hand-rolling a parallel card template here — that's what kept
// silently drifting out of sync with the real card markup every time
// productCard() changed. Same function, same structure, same page as
// All Products, permanently.
function renderWishlistPage() {
  if (!DOM.wishPageContent) return;
  if (!S.wishlist.length) {
    DOM.wishPageContent.innerHTML = '<div class="wish-page-empty"><div class="wish-page-empty-title">Your wishlist is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>';
    return;
  }
  const cols = S.gridColsWish;
  const cards = S.wishlist.map(p => productCard(p, cols === 3, true, S.productVariantSelections[p.id] ?? 0)).join('');
  DOM.wishPageContent.innerHTML = `<div class="wish-page-header">
    <button class="col-grid-toggle-btn" onclick="toggleGridWish()" title="Change grid layout">
      <div class="col-grid-icon cols-${cols}">
        <div class="col-grid-bar"></div>
        <div class="col-grid-bar"></div>
        <div class="col-grid-bar"></div>
      </div>
    </button>
    <div class="wish-page-title">Wishlist (${S.wishlist.length})</div>
  </div><div class="product-grid" style="grid-template-columns:${gridTemplateFor(cols)}">${cards}</div>`;
}
