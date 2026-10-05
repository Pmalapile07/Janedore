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
    if (icon) icon.className = nowWished ? 'ph-fill ph-heart' : 'ph-light ph-heart';
    btnEl.classList.toggle('wished', nowWished);
  }
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
    if (mergedIds.length !== remoteIds.length) {
      await db.collection('customers').doc(uid).set({
        wishlist: mergedIds,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

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
  saveWishlistToStorage();
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
function renderWishlistPage() {
  if (!DOM.wishPageContent) return;
  const breadcrumbHtml = `<nav class="page-breadcrumb" aria-label="Breadcrumb">
    <span onclick="navigateTo('home')">Home</span>
    <span class="page-breadcrumb-sep">/</span>
    <span class="page-breadcrumb-current">Wishlist</span>
  </nav>`;
  if (!S.wishlist.length) {
    DOM.wishPageContent.innerHTML = breadcrumbHtml + '<div class="wish-page-empty"><div class="wish-page-empty-title">Your wishlist is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>';
    return;
  }
  const cols = S.gridColsWish;
  const cards = S.wishlist.map(p => productCard(p, cols === 3, true, S.productVariantSelections[p.id] ?? 0)).join('');
  DOM.wishPageContent.innerHTML = breadcrumbHtml + `<div class="wish-page-header">
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
