// =========================================
//  STICKY ADD TO CART — JANEDORE
//  Just price + a single Add to bag button.
//  Size/color are picked on the page itself (the
//  size row above) — this bar only acts on whatever's
//  already selected there, same as the main Add to
//  Cart button.
//  Permanently glued to bottom:0
//  NO translateY transforms ever
// =========================================

function stickyPriceHtml(product) {
 const price = product.salePrice ? product.salePrice : product.price;
 const originalPrice = product.salePrice ? product.price : null;
 return originalPrice
   ? `<span class="sticky-price-current sticky-price-sale">${formatPrice(price)}</span><span class="sticky-price-original">${formatPrice(originalPrice)}</span>`
   : `<span class="sticky-price-current">${formatPrice(price)}</span>`;
}

function removeStickyBar() {
 const e = document.getElementById('sticky-add-bar');
 if (e) e.remove();
}

function createStickyBar(product) {
 removeStickyBar();
 const soldOut = isProductSoldOut(product);
 const price = product.salePrice ? product.salePrice : product.price;
 const bar = document.createElement('div');
 bar.id = 'sticky-add-bar';
 bar.className = 'sticky-add-bar';
 const isWished = S.wishlist.some(w => w.id === product.id);
 bar.innerHTML = `
   <div class="sticky-top-row">
     <div class="sticky-price">${stickyPriceHtml(product)}</div>
     <button class="sticky-wish-btn${isWished ? ' wished' : ''}" type="button" data-wish-id="${escapeHTML(product.id)}" data-wish-weight="ph" onclick="toggleWish('${product.id}',this)" aria-label="Add to wishlist"><i class="${isWished ? 'ph-fill' : 'ph'} ph-heart"></i></button>
   </div>
   <button class="sticky-add-btn" id="sticky-add-btn"
     onclick="addToCartFromDetailSticky('${product.id}')"
     ${soldOut ? ' disabled' : ''}
   ><span class="sticky-btn-label">${soldOut ? 'Sold out' : 'Add to bag'}</span><span class="sticky-btn-price">${formatPrice(price)}</span></button>`;
 document.body.appendChild(bar);
 updateStickyBarOnScroll();
}

// ─── Direct add — uses whatever size/qty are already selected on the
// page itself, same pipeline the main Add to Cart button uses. The
// button is disabled (via updateAddToCartState(), product-detail.js)
// whenever a size still needs picking, so this never fires without one.
function addToCartFromDetailSticky(id) {
 const product = PRODUCTS.find(p => p.id === id);
 if (!product) return;
 // Sold out with the waitlist on: the same button joins the waitlist.
 if (typeof productWaitlistMode === 'function' && productWaitlistMode(product)) { joinProductWaitlist(product, document.getElementById('sticky-add-btn')); return; }
 if (isProductSoldOut(product)) return;
 addToCart(id, S.selectedSize, S.productQuantity);
 _stickyAddedFeedback(product);
}

// ─── "Added" feedback then restore ─────────────────────────
function _stickyAddedFeedback(product) {
 const bar = document.getElementById('sticky-add-bar');
 if (!bar) return;

 const btn = bar.querySelector('.sticky-add-btn');
 const label = bar.querySelector('.sticky-btn-label');
 if (btn && label) {
   bar.classList.add('added-feedback');
   label.textContent = 'Added';

   setTimeout(() => {
     bar.classList.remove('added-feedback');
     // Recompute rather than assume "Add to bag" — the color/size may
     // have changed to something sold out while "Added" was showing.
     updateAddToCartState();
   }, 1600);
 }
}

// ─── Scroll state: full → minimized ───────────────────────
function updateStickyBarOnScroll() {
 const bar = document.getElementById('sticky-add-bar');
 if (!bar || S.currentPage !== 'product-detail') return;
 const pi = document.querySelector('.product-info');
 if (!pi) return;

 const isMin = pi.getBoundingClientRect().top < window.innerHeight * 0.3;

 if (isMin) {
   bar.classList.add('minimized');
   const label = bar.querySelector('.sticky-btn-label');
   const btn = bar.querySelector('.sticky-add-btn');
   if (label && btn && !btn.disabled && label.textContent !== 'Added') {
     label.textContent = label.textContent === 'Add to waitlist' ? 'Waitlist' : 'Add';
   }
 } else {
   bar.classList.remove('minimized');
   const label = bar.querySelector('.sticky-btn-label');
   const btn = bar.querySelector('.sticky-add-btn');
   if (label && btn && !btn.disabled && label.textContent !== 'Added') {
     label.textContent = label.textContent === 'Waitlist' ? 'Add to waitlist' : 'Add to bag';
   }
 }
}
