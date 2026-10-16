function loadWishlistFromStorage() {
  loadFavBrandsFromStorage();
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

// ==================== FAVOURITE BRANDS ====================
// Vendor ids, kept beside the product wishlist: localStorage for guests,
// customers/{uid}.favouriteBrands once signed in (synced with the
// wishlist below). Hearts on brand pages and the Brands A-Z list.
// S (app.js) loads after this file, so this runs from
// loadWishlistFromStorage() rather than at the top level.
function loadFavBrandsFromStorage() {
  try { const saved = JSON.parse(localStorage.getItem('janedore_fav_brands') || '[]'); S.favBrands = Array.isArray(saved) ? saved : []; }
  catch (e) { S.favBrands = []; }
}
function saveFavBrandsToStorage() {
  try { localStorage.setItem('janedore_fav_brands', JSON.stringify(S.favBrands)); } catch (e) {}
}
function isFavBrand(vendorId) { return (S.favBrands || []).includes(vendorId); }

function favBrandButtonHtml(vendorId, className) {
  const on = isFavBrand(vendorId);
  const id = escapeHTML(vendorId);
  return `<button type="button" class="${className}${on ? ' wished' : ''}" data-fav-brand="${id}" aria-pressed="${on}" aria-label="${on ? 'Remove from favourite brands' : 'Add to favourite brands'}" onclick="event.stopPropagation();toggleFavBrand('${escapeJSString(vendorId)}')"><i class="${on ? 'ph-fill' : 'ph'} ph-heart"></i></button>`;
}

function toggleFavBrand(vendorId) {
  if (!vendorId) return;
  const on = !isFavBrand(vendorId);
  S.favBrands = on ? (S.favBrands || []).concat(vendorId) : S.favBrands.filter(id => id !== vendorId);
  document.querySelectorAll(`[data-fav-brand="${CSS.escape(vendorId)}"]`).forEach(b => {
    const icon = b.querySelector('i');
    if (icon) icon.className = (on ? 'ph-fill' : 'ph') + ' ph-heart';
    b.classList.toggle('wished', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Remove from favourite brands' : 'Add to favourite brands');
  });
  saveFavBrandsToStorage();
  syncWishlistToAccount();
  if (S.currentPage === 'wishlist') renderWishlistPage();
  if (typeof showAddedToCartToast === 'function') {
    showAddedToCartToast(on ? 'Added to favourite brands' : 'Removed from favourite brands', on ? 'ph-heart' : 'ph-heart-break',
      on ? null : () => { if (!isFavBrand(vendorId)) toggleFavBrand(vendorId); });
  }
}

function favBrandVendors() {
  return (S.favBrands || []).map(id => (S.vendors || []).find(v => v.id === id)).filter(Boolean);
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
  // Also flips any other heart tagged for this product (the product
  // page's own heart and the sticky bar's), so they never disagree.
  const hearts = new Set(document.querySelectorAll(`[data-wish-id="${CSS.escape(productId)}"]`));
  if (btnEl) hearts.add(btnEl);
  hearts.forEach(b => {
    const icon = b.querySelector('i');
    if (icon) icon.className = nowWished ? 'ph-fill ph-heart' : (b.dataset.wishWeight || 'ph-light') + ' ph-heart';
    b.classList.toggle('wished', nowWished);
  });
  updateBadges();
  renderWishlistPage();
  saveWishlistToStorage();
  syncWishlistToAccount();
}

// ==================== ACCOUNT SYNC ====================
// Guests keep working exactly as before (localStorage only). Signed-in
// customers additionally get customers/{uid}.wishlist (an array of
// product ids) kept in step with it, so the wishlist follows them to
// any device they log into. Driven entirely by login.js's single auth
// listener (syncWishlistOnLogin/clearWishlistOnLogout below) rather
// than a second listener here, so the two never race each other on the
// same sign-in/out transition.

let _wishlistSyncedUid = null; // guards against re-merging on every
                                // auth-state tick for an already-synced user

// Fire-and-forget — pushes the current wishlist to the signed-in
// customer's profile. No-op for guests and chat's anonymous sessions.
function syncWishlistToAccount() {
  const user = firebase.auth().currentUser;
  if (!user || user.isAnonymous) return;
  db.collection('customers').doc(user.uid).set({
    wishlist: S.wishlist.map(p => p.id),
    favouriteBrands: S.favBrands || [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(function(err) {
    console.warn('[WISHLIST] Could not save to account:', err.message);
  });
}

// Called once per sign-in (see login.js) with whatever's in the
// customer's saved wishlist, merged with whatever's already in this
// browser's local wishlist as a guest — nothing gets lost either way.
async function syncWishlistOnLogin(uid) {
  if (_wishlistSyncedUid === uid) return;
  await window.productsReady;
  try {
    const doc = await db.collection('customers').doc(uid).get();
    const remoteIds = (doc.exists && Array.isArray(doc.data().wishlist)) ? doc.data().wishlist : [];
    const localIds = S.wishlist.map(p => p.id);
    const mergedIds = Array.from(new Set(remoteIds.concat(localIds)));

    S.wishlist = mergedIds.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    saveWishlistToStorage();
    _wishlistSyncedUid = uid;

    // Only write back if the merge actually changed something — avoids
    // a pointless write on every login when nothing local was added.
    const remoteBrands = (doc.exists && Array.isArray(doc.data().favouriteBrands)) ? doc.data().favouriteBrands : [];
    const mergedBrands = Array.from(new Set(remoteBrands.concat(S.favBrands || [])));
    S.favBrands = mergedBrands;
    saveFavBrandsToStorage();

    if (mergedIds.length !== remoteIds.length || mergedBrands.length !== remoteBrands.length) {
      await db.collection('customers').doc(uid).set({
        wishlist: mergedIds,
        favouriteBrands: mergedBrands,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    document.querySelectorAll('[data-fav-brand]').forEach(b => {
      const on = isFavBrand(b.dataset.favBrand);
      b.classList.toggle('wished', on);
      const icon = b.querySelector('i');
      if (icon) icon.className = (on ? 'ph-fill' : 'ph') + ' ph-heart';
    });

    updateBadges();
    if (S.currentPage === 'wishlist') renderWishlistPage();
  } catch (e) {
    console.warn('[WISHLIST] Could not sync with account:', e.message);
  }
}

// The account's wishlist stays safely saved in Firestore — this just
// clears the local mirror so it doesn't linger as a "guest" wishlist
// for whoever uses this browser next.
function clearWishlistOnLogout() {
  if (!_wishlistSyncedUid) return; // was never a signed-in wishlist to begin with
  _wishlistSyncedUid = null;
  S.wishlist = [];
  S.favBrands = [];
  saveWishlistToStorage();
  saveFavBrandsToStorage();
  updateBadges();
  if (S.currentPage === 'wishlist') renderWishlistPage();
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
function setWishTab(tab) {
  S.wishTab = tab;
  renderWishlistPage();
}

// Products | Brands tabs once either list has something in it; the empty
// bag look (renderCartPage(), cart.js) when both are empty.
function renderWishlistPage() {
  if (!DOM.wishPageContent) return;
  const brands = favBrandVendors();
  if (!S.wishlist.length && !brands.length) {
    DOM.wishPageContent.classList.add('is-empty');
    DOM.wishPageContent.innerHTML = wishEmptyHtml('ph-heart', 'Your wishlist is empty', 'Continue Shopping', "navigateTo('products')");
    if (DOM.wishPageContent.querySelector('#wish-slider-grid')) initSliderLeadingTracking('wish-slider-grid');
    return;
  }
  DOM.wishPageContent.classList.remove('is-empty');
  const tab = S.wishTab === 'brands' ? 'brands' : 'products';
  const cols = S.gridColsWish;
  const gridToggle = tab === 'products' && S.wishlist.length ? `<button class="col-grid-toggle-btn wish-grid-toggle" onclick="toggleGridWish()" title="Change grid layout">
      <div class="col-grid-icon cols-${cols}">
        <div class="col-grid-bar"></div>
        <div class="col-grid-bar"></div>
        <div class="col-grid-bar"></div>
      </div>
    </button>` : '';
  const tabs = `<div class="wish-tabs" role="tablist">${gridToggle}
    <button type="button" role="tab" class="wish-tab${tab === 'products' ? ' active' : ''}" aria-selected="${tab === 'products'}" onclick="setWishTab('products')">Products (${S.wishlist.length})</button>
    <button type="button" role="tab" class="wish-tab${tab === 'brands' ? ' active' : ''}" aria-selected="${tab === 'brands'}" onclick="setWishTab('brands')">Brands (${brands.length})</button>
  </div>`;

  if (tab === 'brands') {
    DOM.wishPageContent.innerHTML = tabs + (brands.length ? favBrandsHtml(brands)
      : wishEmptyHtml('ph-storefront', 'No favourite brands yet', 'Browse Brands', "navigateTo('brands')", 'Tap the heart on any brand to keep it here.'));
    if (DOM.wishPageContent.querySelector('#wish-slider-grid')) initSliderLeadingTracking('wish-slider-grid');
    return;
  }
  if (!S.wishlist.length) {
    DOM.wishPageContent.innerHTML = tabs + wishEmptyHtml('ph-heart', 'No saved products yet', 'Continue Shopping', "navigateTo('products')");
    if (DOM.wishPageContent.querySelector('#wish-slider-grid')) initSliderLeadingTracking('wish-slider-grid');
    return;
  }
  const cards = S.wishlist.map(p => productCard(p, cols === 3, true, S.productVariantSelections[p.id] ?? 0)).join('');
  DOM.wishPageContent.innerHTML = tabs + `<div class="product-grid" style="grid-template-columns:${gridTemplateFor(cols)}">${cards}</div>`;
}

// Same block as the empty bag: icon, message, black button, then Recently
// Viewed or New Arrivals.
function wishEmptyHtml(icon, title, btnLabel, btnAction, sub) {
  const recent = S.recentlyViewed.filter(p => p && p.status === 'active');
  const useRecent = recent.length >= 2;
  const picks = (useRecent ? recent : newestActiveProducts()).slice(0, 8);
  return `<div class="cart-empty">
      <i class="ph ${icon} cart-empty-icon" aria-hidden="true"></i>
      <div class="cart-empty-title">${title}</div>
      ${sub ? `<div class="wish-empty-sub">${sub}</div>` : ''}
      <button class="cart-empty-btn" onclick="${btnAction}">${btnLabel}</button>
    </div>${cartSliderHtml(useRecent ? 'Recently Viewed' : 'New Arrivals', picks, 'wish-slider-grid')}`;
}

// One row per brand (logo, name, what's new), then the newest pieces
// from all of them.
function favBrandsHtml(brands) {
  const rows = brands.map(v => {
    const name = v.brand || v.name || v.brandName || '';
    const products = getVendorBaseProducts(v);
    const fresh = products.filter(p => isProductNew(p)).length;
    const logo = /^https:\/\//i.test(String(v.logoUrl || '').trim()) ? v.logoUrl.trim() : '';
    const meta = fresh ? `<span class="fav-brand-new">${fresh} new</span>` : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`;
    return `<div class="fav-brand-row" onclick="navigateToVendor('${escapeJSString(v.slug || v.id)}')">
      <div class="fav-brand-logo">${logo ? `<img src="${escapeHTML(logo)}" alt="">` : escapeHTML(name.charAt(0).toUpperCase())}</div>
      <div class="fav-brand-info"><div class="fav-brand-name">${escapeHTML(name)}</div><div class="fav-brand-meta">${meta}</div></div>
      ${favBrandButtonHtml(v.id, 'fav-brand-heart')}
      <i class="ph ph-caret-right fav-brand-caret" aria-hidden="true"></i>
    </div>`;
  }).join('');
  const newest = merchandiseProducts(brands.flatMap(v => getVendorBaseProducts(v)), undefined, 'newest').slice(0, 8);
  return `<div class="fav-brand-list">${rows}</div>${cartSliderHtml('New from your brands', newest, 'wish-slider-grid')}`;
}
