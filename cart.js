/* ============================================================
   CART DATA LAYER — single source of truth is S.cart
   All shared calculations live here so renderCartPage() and checkout
   never duplicate logic.
   ============================================================ */

function loadCartFromStorage() { try { const saved = localStorage.getItem('janedore_cart'); if (saved) S.cart = JSON.parse(saved); } catch(e) { S.cart = []; } }
function saveCartToStorage() { try { localStorage.setItem('janedore_cart', JSON.stringify(S.cart)); } catch(e) {} }
function cleanCartOrphans() { S.cart = S.cart.filter(item => PRODUCTS.some(p => p.id === item.productId)); saveCartToStorage(); }

// --- HTML Sanitizer ---
function sanitizeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function sanitizeDiscountCode(code) {
  if (!code) return '';
  // Allow only letters, numbers, underscores, and hyphens (3-20 chars)
  const sanitized = code.replace(/[^A-Za-z0-9_-]/g, '').substring(0, 20);
  return sanitized.toUpperCase();
}

// --- Discount state ---
let appliedDiscount = null;
const DISCOUNTS_REF = firebase.firestore().collection('discounts');

function loadAppliedDiscount() {
  try {
    const saved = localStorage.getItem('janedore_applied_discount');
    if (saved) {
      appliedDiscount = JSON.parse(saved);
      // Sanitize the code when loading from storage
      if (appliedDiscount && appliedDiscount.code) {
        appliedDiscount.code = sanitizeDiscountCode(appliedDiscount.code);
      }
    }
  } catch(e) { appliedDiscount = null; }
}

function saveAppliedDiscount() {
  try {
    if (appliedDiscount) localStorage.setItem('janedore_applied_discount', JSON.stringify(appliedDiscount));
    else localStorage.removeItem('janedore_applied_discount');
  } catch(e) {}
}

// --- Product/variant lookup (safe against deleted products) ---
function getCartProduct(productId) { return PRODUCTS.find(p => p.id === productId); }
function getCartVariant(product, variantIndex) { return (product?.variants || [])[variantIndex] ?? {}; }

// --- Stock re-check at cart time ---
// addToCart()/changeQty() only check stock at the moment they run — an
// item already sitting in the cart never gets re-checked again, so if
// it sells out (someone else buys the last one, or admin zeroes it)
// while it's just sitting there, the cart showed no sign of it at all;
// the only thing that ever caught it was placeOrder()'s Firestore
// transaction, deep at the end of checkout, after the customer had
// already filled in their whole address. This re-checks live stock for
// each line wherever the cart is rendered instead, so it shows up right
// where the problem actually is.
function getCartItemStock(item) {
  const product = getCartProduct(item.productId);
  if (!product) return 0;
  return getVariantSizeStock(product, item.variantIndex, item.size);
}
function cartHasSoldOutItem() {
  return S.cart.some(item => getCartItemStock(item) <= 0);
}
function handleCheckoutClick() {
  if (cartHasSoldOutItem()) {
    alert('Please remove the sold out item(s) from your bag before checking out.');
    return;
  }
  navigateTo('checkout');
}

// --- Per-item helpers ---
function getCartItemThumbnail(item) {
  if (item.thumbnail && item.thumbnail !== PLACEHOLDER_IMAGE) return item.thumbnail;
  if (!item.productId) return PLACEHOLDER_IMAGE;
  return getProductThumbnail(getCartProduct(item.productId), item.variantIndex);
}
function getCartItemUnitPrice(item) { return item.salePrice ?? item.price ?? 0; }
function getCartItemLineTotal(item) { return getCartItemUnitPrice(item) * item.qty; }

// --- Aggregate cart calculations ---
function getCartTotalQty() { return S.cart.reduce((a, i) => a + i.qty, 0); }
function getCartSubtotal() { return S.cart.reduce((a, i) => a + getCartItemLineTotal(i), 0); }

// --- Discount calculations ---
function getDiscountAmount() {
  if (!appliedDiscount) return 0;
  const subtotal = getCartSubtotal();
  
  switch(appliedDiscount.type) {
    case 'percentage':
      return (subtotal * appliedDiscount.value) / 100;
    case 'fixed_amount':
      return Math.min(appliedDiscount.value, subtotal);
    case 'free_shipping':
      return 0; // Free shipping handled separately
    case 'buy_x_get_y':
      return calculateBuyXGetYDiscount();
    default:
      return 0;
  }
}

function calculateBuyXGetYDiscount() {
  const totalItems = getCartTotalQty();
  if (totalItems < appliedDiscount.value) return 0;
  
  // Find cheapest item in cart
  let cheapestPrice = Infinity;
  S.cart.forEach(item => {
    const unitPrice = getCartItemUnitPrice(item);
    if (unitPrice < cheapestPrice) cheapestPrice = unitPrice;
  });
  
  return cheapestPrice || 0;
}

function getCartTotalAfterDiscount() {
  const subtotal = getCartSubtotal();
  const discountAmount = getDiscountAmount();
  return Math.max(0, subtotal - discountAmount);
}

const FREE_SHIPPING_THRESHOLD = 1500;
function getCartShippingStatus(subtotal) {
  // Check if free shipping discount is applied
  if (appliedDiscount && appliedDiscount.type === 'free_shipping') {
    return {
      freeShipping: true,
      message: "Free shipping applied via discount code"
    };
  }
  
  const freeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  return {
    freeShipping,
    message: freeShipping ? "Free shipping applied" : `R150 shipping · Free over ${formatPrice(FREE_SHIPPING_THRESHOLD)}`
  };
}

function cartHasMultipleTypes() {
  const types = new Set(S.cart.map(i => getCartProduct(i.productId)?.category).filter(Boolean));
  return types.size > 1;
}
function hasSunglassesInCart() { return S.cart.some(item => getCartProduct(item.productId)?.category === 'sunglasses'); }
function pouchAlreadyInCart() { return S.cart.some(item => item.productId === 'janedore-leather-pouch'); }

function truncateNameTwoWords(name) {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return name;
  return words.slice(0, 2).join(' ') + '…';
}

/* ============================================================
   MUTATIONS — every mutation goes through commitCartChange()
   so localStorage, the badge, the drawer, and the full page
   are always kept in sync, no matter which view is open.
   ============================================================ */

function commitCartChange() {
  saveCartToStorage();
  updateBadges();
  renderCartPage();
}

function addToCart(productId, size, qty) {
  const q = (qty && qty > 0) ? qty : 1;
  const product = getCartProduct(productId);
  if (!product || isProductSoldOut(product)) return;
  const vi = S.productVariantSelections[productId] ?? 0;
  const variant = getCartVariant(product, vi);
  const resolvedSize = size || product.sizes[0] || 'OS';
  const existing = S.cart.find(i => i.productId === productId && i.size === resolvedSize && i.variantIndex === vi);

  // Stock is tracked per size within each color — cap against what's
  // actually left for this exact combination, not just the product as a
  // whole, and account for however many of it are already sitting in
  // the cart so a second click can't add past what's really available.
  const available = getVariantSizeStock(product, vi, resolvedSize);
  const room = available - (existing ? existing.qty : 0);
  if (room <= 0) {
    alert((product.name || 'This item') + ' (' + resolvedSize + ') is out of stock.');
    return;
  }
  const addQty = Math.min(q, room);
  if (addQty < q) alert('Only ' + available + ' of ' + (product.name || 'this item') + ' (' + resolvedSize + ') left — added what’s available.');

  if (existing) existing.qty += addQty;
  else S.cart.push({ productId, variantIndex: vi, size: resolvedSize, qty: addQty, name: sanitizeHTML(product.name), brand: sanitizeHTML(product.brand), price: product.price, salePrice: product.salePrice, color: sanitizeHTML(variant.color || 'Default'), thumbnail: getProductThumbnail(product, vi) });
  if (typeof lastConfirmedOrderNumber !== 'undefined' && lastConfirmedOrderNumber) {
    lastConfirmedOrderNumber = null;
    sessionStorage.removeItem('janedore_last_order_number');
  }
  commitCartChange();
  showAddedToCartToast();
}

// "Added to cart" bar: stays where the customer is (no cart panel), with a
// strip along its top that shrinks to nothing; the bar leaves when it
// does. Adding again while it's showing restarts the countdown.
const ADDED_TOAST_MS = 3000;
let _addedToastTimer = null;
function showAddedToCartToast() {
  let toast = document.getElementById('added-to-cart-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'added-to-cart-toast';
    toast.className = 'added-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML =
      '<div class="added-toast-progress"></div>' +
      '<i class="ph ph-check-circle added-toast-icon" aria-hidden="true"></i>' +
      '<span class="added-toast-text">Added to cart</span>' +
      '<button type="button" class="added-toast-close" aria-label="Dismiss"><i class="ph ph-x"></i></button>';
    toast.querySelector('.added-toast-close').addEventListener('click', hideAddedToCartToast);
    document.body.appendChild(toast);
  }
  // Sit just above the product page's sticky Add to Bag bar when it's there.
  const sticky = document.getElementById('sticky-add-bar');
  toast.style.bottom = (sticky ? sticky.getBoundingClientRect().height : 0) + 16 + 'px';

  // Restart the shrinking strip from full width.
  const progress = toast.querySelector('.added-toast-progress');
  progress.style.transition = 'none';
  progress.style.transform = 'scaleX(1)';
  void progress.offsetWidth;
  progress.style.transition = 'transform ' + ADDED_TOAST_MS + 'ms linear';
  progress.style.transform = 'scaleX(0)';

  toast.classList.add('show');
  clearTimeout(_addedToastTimer);
  _addedToastTimer = setTimeout(hideAddedToCartToast, ADDED_TOAST_MS);
}
function hideAddedToCartToast() {
  clearTimeout(_addedToastTimer);
  const toast = document.getElementById('added-to-cart-toast');
  if (toast) toast.classList.remove('show');
}

function removeFromCart(productId, size, vi) {
  S.cart = S.cart.filter(i => !(i.productId === productId && i.size === size && i.variantIndex === vi));
  commitCartChange();
}

function changeQty(productId, size, delta, vi) {
  const item = S.cart.find(i => i.productId === productId && i.size === size && i.variantIndex === vi);
  if (!item) return;
  const nq = item.qty + delta;
  if (nq <= 0) { removeFromCart(productId, size, vi); return; }
  if (delta > 0) {
    const product = getCartProduct(productId);
    const available = product ? getVariantSizeStock(product, vi, size) : nq;
    if (nq > available) { alert('Only ' + available + ' left in stock.'); return; }
  }
  item.qty = nq; commitCartChange();
}

function addPouchToCart() {
  const pouch = getCartProduct('janedore-leather-pouch');
  if (pouch) addToCart('janedore-leather-pouch', 'OS');
}

/* ============================================================
   DISCOUNT CODE APPLICATION
   ============================================================ */

function applyPromoCode() {
  const input = document.getElementById('cart-promo-input');
  if (!input) return;
  
  // Sanitize the code before processing
  const code = sanitizeDiscountCode(input.value);
  
  if (!code) {
    showPromoMessage('Please enter a valid discount code (letters, numbers, underscores, hyphens only)', 'error');
    return;
  }

  const subtotal = getCartSubtotal();

  // Query Firestore for the discount code (Firestore handles this safely)
  DISCOUNTS_REF.where('code', '==', code).get().then(function(snapshot) {
    if (snapshot.empty) {
      showPromoMessage('Invalid discount code', 'error');
      return;
    }

    const discountDoc = snapshot.docs[0];
    const discount = Object.assign({ id: discountDoc.id }, discountDoc.data());

    // Check if discount is active
    if (!discount.active) {
      showPromoMessage('This discount is no longer active', 'error');
      return;
    }

    // Check date validity
    const now = new Date();
    if (discount.startDate && new Date(discount.startDate) > now) {
      showPromoMessage('This discount is not yet active', 'error');
      return;
    }
    if (discount.endDate && new Date(discount.endDate) < now) {
      showPromoMessage('This discount has expired', 'error');
      return;
    }

    // Check usage limit
    if (discount.usageLimit !== null && discount.usageLimit !== undefined) {
      if ((discount.usageCount || 0) >= discount.usageLimit) {
        showPromoMessage('This discount has reached its usage limit', 'error');
        return;
      }
    }

    // Check minimum purchase
    if (discount.minimumPurchase && subtotal < discount.minimumPurchase) {
      showPromoMessage('Minimum purchase of ' + formatPrice(discount.minimumPurchase) + ' required', 'error');
      return;
    }

    // Apply the discount (store sanitized values)
    appliedDiscount = {
      id: discount.id,
      code: sanitizeDiscountCode(discount.code),
      type: sanitizeHTML(discount.type),
      value: Number(discount.value) || 0,
      description: sanitizeHTML(getDiscountDescription(discount))
    };

    saveAppliedDiscount();
    showPromoMessage('Discount applied: ' + appliedDiscount.description, 'success');
    renderCartPage();

  }).catch(function(err) {
    console.error('[APPLY_DISCOUNT]', err);
    showPromoMessage('Error applying discount: ' + sanitizeHTML(err.message), 'error');
  });
}

function removePromoCode() {
  appliedDiscount = null;
  saveAppliedDiscount();
  
  const input = document.getElementById('cart-promo-input');
  if (input) input.value = '';
  
  renderCartPage();
}

function getDiscountDescription(discount) {
  switch(discount.type) {
    case 'percentage':
      return discount.value + '% off';
    case 'fixed_amount':
      return formatPrice(discount.value) + ' off';
    case 'free_shipping':
      return 'Free shipping';
    case 'buy_x_get_y':
      return 'Buy ' + discount.value + ' Get 1 Free';
    default:
      return 'Discount';
  }
}

function showPromoMessage(message, type) {
  // Remove existing message
  const existing = document.querySelector('.cart-promo-message');
  if (existing) existing.remove();

  const input = document.getElementById('cart-promo-input');
  if (!input) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'cart-promo-message';
  msgDiv.textContent = message; // textContent is safe - no HTML injection
  msgDiv.style.cssText = `
    margin-top: 8px;
    font-size: 12px;
    font-weight: 500;
    color: ${type === 'success' ? '#166534' : '#dc2626'};
    display: block;
  `;

  input.parentNode.appendChild(msgDiv);

  // Auto-remove after 4 seconds
  setTimeout(function() {
    if (msgDiv.parentNode) msgDiv.remove();
  }, 4000);
}

function recordDiscountUsage() {
  if (!appliedDiscount || !appliedDiscount.id) return Promise.resolve();

  return DISCOUNTS_REF.doc(appliedDiscount.id).update({
    usageCount: firebase.firestore.FieldValue.increment(1)
  }).catch(function(err) {
    console.error('[RECORD_DISCOUNT_USAGE]', err);
  });
}

/* ============================================================
   RENDER — drawer and full page. Markup/classes are unchanged
   from the original; only the calculations behind them are
   now shared via the helpers above.
   ============================================================ */

function renderCartPage() {
  if (!DOM.cartPageContent) return;

  if (!S.cart.length) {
    DOM.cartPageContent.innerHTML = '<div class="cart-page-empty"><div class="cart-page-empty-title">Your bag is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>';
    return;
  }

  let html = `<div class="cart-page-title">Your Bag (${getCartTotalQty()} ${getCartTotalQty() === 1 ? 'item' : 'items'})</div>`;
  S.cart.forEach(item => {
    const thumbnail = getCartItemThumbnail(item);
    const lineTotal = getCartItemLineTotal(item);
    const itemName = sanitizeHTML(item.name || '');
    const itemBrand = sanitizeHTML(item.brand || '');
    const itemColor = sanitizeHTML(item.color || '');
    const itemSize = sanitizeHTML(item.size || '');
    const itemSizeDisplay = itemSize !== 'OS' ? itemSize : '';
    const itemMeta = [itemColor, itemSizeDisplay].filter(Boolean).join(' · ');
    const productId = sanitizeHTML(item.productId || '');
    const soldOut = getCartItemStock(item) <= 0;

    html += `<div class="cart-page-item${soldOut ? ' sold-out' : ''}" onclick="goToProduct('${productId}')">
      <div class="cart-page-img" style="background-image:url('${thumbnail}');"></div>
      <div class="cart-page-details">
        <div class="cart-page-brand">${itemBrand}</div>
        <div class="cart-page-name">${itemName}</div>
        <div class="cart-page-meta">${itemMeta}</div>
        ${soldOut ? '<div class="cart-page-sold-out-badge">Sold Out</div>' : ''}
        <div class="cart-page-qty-wrap">
          <button class="cart-page-qty-btn" onclick="event.stopPropagation();changeQty('${productId}','${itemSize}',-1,${item.variantIndex});">−</button>
          <span class="cart-page-qty-num">${item.qty}</span>
          <button class="cart-page-qty-btn"${soldOut ? ' disabled' : ''} onclick="event.stopPropagation();changeQty('${productId}','${itemSize}',1,${item.variantIndex});">+</button>
        </div>
      </div>
      <div class="cart-page-price">${formatPrice(lineTotal)}</div>
      <button class="cart-page-remove" onclick="event.stopPropagation();removeFromCart('${productId}','${itemSize}',${item.variantIndex});">×</button>
    </div>`;
  });

  if (hasSunglassesInCart() && !pouchAlreadyInCart()) {
    const pouch = getCartProduct('janedore-leather-pouch');
    if (pouch) html += `<div class="cart-addon-section"><div class="cart-addon-title">ADD-ON</div><div class="cart-addon-item"><div class="cart-addon-img" style="background-image:url('${getProductThumbnail(pouch)}');"></div><div class="cart-addon-info"><div class="cart-addon-name">${sanitizeHTML(pouch.name)}</div><div class="cart-addon-price">${formatPrice(pouch.price)}</div></div><button class="cart-addon-btn" onclick="event.stopPropagation();addPouchToCart();">Add</button></div></div>`;
  }

  const discountAmount = getDiscountAmount();
  const finalTotal = getCartTotalAfterDiscount();
  const shipping = getCartShippingStatus(finalTotal);
  const hasSoldOut = cartHasSoldOutItem();
  const discountHtml = appliedDiscount
    ? `<div class="cart-page-subtotal">Discount (${sanitizeHTML(appliedDiscount.code)}) <strong>-${formatPrice(discountAmount)}</strong> <button class="cart-page-remove-discount" onclick="removePromoCode()" aria-label="Remove discount">×</button></div>`
    : '';

  html += `<div class="cart-page-summary">
    ${discountHtml}
    <div class="cart-page-subtotal">${appliedDiscount ? 'Total' : 'Subtotal'} <strong>${formatPrice(finalTotal)}</strong></div>
    <div class="cart-page-ship-note">${shipping.message}</div>
    ${cartHasMultipleTypes() ? '<div class="cart-page-multi-package-note">contents may arrive in multiple packages</div>' : ''}
    <div class="cart-page-actions">
      <button class="cart-page-btn secondary" onclick="navigateTo('products')">Continue Shopping</button>
      <button class="cart-page-btn primary"${hasSoldOut ? ' disabled' : ''} onclick="handleCheckoutClick()">Checkout</button>
    </div>
    <div class="cart-security-note"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Secure & Encrypted Payment</div>
  </div>`;
  DOM.cartPageContent.innerHTML = html;
}

// The cart is a normal page (#page-cart, /cart), not a slide-out panel.
function openCart() { hideAddedToCartToast(); navigateTo('cart'); }

function updateBadges() {
  const cc = getCartTotalQty();
  if (DOM.cartBadge) { DOM.cartBadge.style.display = cc > 0 ? "flex" : "none"; DOM.cartBadge.textContent = cc; }
  if (DOM.wishBadge) { DOM.wishBadge.style.display = S.wishlist.length > 0 ? "flex" : "none"; DOM.wishBadge.textContent = S.wishlist.length; }
}

// Initialize discount from storage on page load
loadAppliedDiscount();
