/* ============================================================
   CART DATA LAYER — single source of truth is S.cart
   All shared calculations live here so renderCartPage() and checkout
   never duplicate logic.
   ============================================================ */

function loadCartFromStorage() { try { const saved = localStorage.getItem('janedore_cart'); if (saved) S.cart = JSON.parse(saved); } catch(e) { S.cart = []; } }
function saveCartToStorage() { try { localStorage.setItem('janedore_cart', JSON.stringify(S.cart)); } catch(e) {} scheduleBagSync(); }

// ---------- Bag reminders (server.js /api/bag) ----------
// Once we know the shopper's email (signed in, or typed at checkout), the
// bag's products, sizes and quantities are sent to the server, which emails
// one reminder if it's left unpaid for 3 hours. /cart?bag=ID (the link in
// that email) refills an empty bag on any device.
let _bagSyncTimer = null;
let _bagSyncedSig = '';
function bagReminderEmail() {
  try { const u = firebase.auth().currentUser; if (u && !u.isAnonymous && u.email) return u.email; } catch (e) {}
  try { return localStorage.getItem('janedore_checkout_email') || ''; } catch (e) { return ''; }
}
function bagReminderId() {
  let id = '';
  try { id = localStorage.getItem('janedore_bag_id') || ''; } catch (e) {}
  if (!/^[a-f0-9]{24}$/.test(id)) {
    const bytes = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('janedore_bag_id', id); } catch (e) {}
  }
  return id;
}
function scheduleBagSync() {
  clearTimeout(_bagSyncTimer);
  _bagSyncTimer = setTimeout(syncBagToServer, 3000);
}
function syncBagToServer() {
  const email = String(bagReminderEmail() || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const items = (S.cart || []).map(i => ({ productId: i.productId, variantIndex: i.variantIndex || 0, size: i.size, qty: i.qty }));
  const sig = email.toLowerCase() + '|' + JSON.stringify(items);
  if (sig === _bagSyncedSig) return;
  fetch('/api/bag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bagId: bagReminderId(), email, items }) })
    .then(res => { if (res.ok) _bagSyncedSig = sig; })
    .catch(() => {});
}
// The email typed at checkout counts as soon as it's entered.
document.addEventListener('change', e => {
  if (!e.target || e.target.id !== 'checkout-email') return;
  const email = String(e.target.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  try { localStorage.setItem('janedore_checkout_email', email); } catch (err) {}
  scheduleBagSync();
});
// Called once products have loaded (app.js). Refills an empty bag from a
// reminder link; a bag that already has items is left as it is.
function restoreBagFromLink() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('bag');
  if (!id) return;
  params.delete('bag');
  const qs = params.toString();
  history.replaceState(null, null, window.location.pathname + (qs ? '?' + qs : ''));
  if (!/^[a-f0-9]{24}$/.test(id)) return;
  fetch('/api/bag/' + id).then(res => res.ok ? res.json() : null).then(data => {
    if (!data || !Array.isArray(data.items)) return;
    try { localStorage.setItem('janedore_bag_id', id); } catch (e) {}
    if (!S.cart.length) {
      data.items.forEach(it => {
        if (!PRODUCTS.some(p => p.id === it.productId)) return;
        S.productVariantSelections[it.productId] = it.variantIndex || 0;
        addToCart(it.productId, it.size, it.qty);
      });
      if (typeof hideAddedToCartToast === 'function') hideAddedToCartToast();
    }
    if (S.currentPage !== 'cart') navigateTo('cart');
  }).catch(() => {});
}
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
    alert('Please remove sold-out items from your bag to continue to checkout.');
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
// Live product price when the catalogue has loaded (so a price change in
// admin reaches bags that already hold the item), the price saved with the
// cart line otherwise. Same sale rule as hasSalePrice() and the server.
function getCartItemUnitPrice(item) {
  const product = PRODUCTS.find(p => p.id === item.productId);
  if (product) return hasSalePrice(product) ? Number(product.salePrice) : (Number(product.price) || 0);
  return item.salePrice ?? item.price ?? 0;
}
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
      // Rounded to the cent, as server.js priceOrder() charges it.
      return Math.round(subtotal * appliedDiscount.value) / 100;
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

const SHIPPING_FEE = 150;
// Free delivery is each brand's own offer (Admin > Brands, or the brand's
// own profile: vendor.freeDeliveryOffer): on its orders over a minimum,
// delivery is free and the brand pays it, whatever it costs. Every
// product of that brand qualifies. The brand pays for it, not Janedore. Mirrors server.js
// priceOrder(), which is what actually gets charged.
const HOUSE_VENDOR_ID = 'vendor-janedore';
function isHouseProduct(p) {
  return !!p && (!p.vendorId || p.vendorId === HOUSE_VENDOR_ID || String(p.brand || '').trim().toUpperCase() === 'JANEDORE');
}
function productVendor(p) {
  if (!p) return null;
  const vid = isHouseProduct(p) ? HOUSE_VENDOR_ID : p.vendorId;
  return (S.vendors || []).find(v => v.id === vid) || null;
}
// { minimum }, or null.
function freeDeliveryOffer(p) {
  const o = (productVendor(p) || {}).freeDeliveryOffer;
  const minimum = Number(o && o.minimum);
  return minimum > 0 ? { minimum } : null;
}
// The Free delivery badge and collection.
function isFreeDeliveryProduct(p) { return !!freeDeliveryOffer(p); }
function deliveryBadge(p) { return isFreeDeliveryProduct(p) ? 'FREE DELIVERY' : ''; }
// "Free delivery on NIRIUS CO orders over R500."
function freeDeliveryText(p) {
  const o = freeDeliveryOffer(p);
  if (!o) return '';
  const v = productVendor(p) || {};
  return 'Free delivery on ' + (v.brand || v.name || p.brand || '') + ' orders over ' + formatPrice(o.minimum) + '.';
}

// Brands that share a warehouse (Admin > Brands, vendor.warehouse) ship
// together, so they're one package with one fee. Mirrors server.js
// shippingPackageKey().
function shippingPackageKey(product, item) {
  const house = isHouseProduct(product || item);
  const vid = house ? HOUSE_VENDOR_ID : ((product && product.vendorId) || 'unknown');
  const vendor = (S.vendors || []).find(v => v.id === vid);
  const warehouse = vendor && String(vendor.warehouse || '').trim().toLowerCase();
  return warehouse ? 'warehouse:' + warehouse : (house ? 'janedore' : vid);
}

// One package per brand (or per shared warehouse); JANEDORE's own stock
// travels as one package.
function getCartShipments() {
  const groups = new Map();
  S.cart.forEach(item => {
    const product = getCartProduct(item.productId);
    const key = shippingPackageKey(product, item);
    const brand = (product && product.brand) || item.brand || 'JANEDORE';
    if (!groups.has(key)) groups.set(key, { key, brand, brands: [], warehouse: key.startsWith('warehouse:'), subtotal: 0, eligible: true, minimum: 0 });
    const g = groups.get(key);
    if (!g.brands.includes(brand)) g.brands.push(brand);
    g.subtotal += getCartItemLineTotal(item);
    // A package shared by several brands (one warehouse) qualifies only if
    // all of them offer it, at the highest minimum.
    const offer = freeDeliveryOffer(product);
    if (!offer) g.eligible = false;
    else g.minimum = Math.max(g.minimum, offer.minimum);
  });
  const codeFree = !!(appliedDiscount && appliedDiscount.type === 'free_shipping');
  return [...groups.values()].map(g => {
    const reached = g.eligible && g.subtotal >= g.minimum;
    const free = codeFree || reached;
    const fee = free ? 0 : SHIPPING_FEE;
    return Object.assign(g, { brand: g.brands.join(' & '), free, fee, remaining: g.eligible && !reached && !codeFree ? g.minimum - g.subtotal : 0 });
  });
}

function getCartShippingStatus() {
  const shipments = getCartShipments();
  const fee = shipments.reduce((a, s) => a + s.fee, 0);
  return { shipments, packages: Math.max(1, shipments.length), fee, freeShipping: shipments.length > 0 && fee === 0 };
}

// The product card's main badge (getCardBadges()), and the sale price in
// red, on bag and checkout items. Thumbnails here are too small for two
// badges; free delivery has its own line (cartFreeDeliveryHtml()). The
// card's SOLD OUT badge also shows when just this item's size has sold
// out.
function cartBadgesHtml(item) {
  const product = getCartProduct(item.productId);
  const badges = getCartItemStock(item) <= 0 ? ['SOLD OUT']
    : product && typeof getCardBadges === 'function' ? getCardBadges(product).slice(0, 1) : [];
  return badges.length ? `<div class="product-badge-stack cart-badge-stack">${badges.map(b => `<span class="product-badge ${badgeClass(b)}">${sanitizeHTML(b)}</span>`).join('')}</div>` : '';
}
// "Pre-order · Est. dispatch 15 Mar" under the brand on bag, checkout and
// confirmation lines. Order lines carry the flag the server stamped
// (priceOrder(), server.js); bag lines read the live product.
function cartItemPreorderDate(item) {
  if (typeof item.preorder === 'boolean') return item.preorder ? (item.preorderShipDate || '') : null;
  const product = getCartProduct(item.productId);
  return product && isPreorderProduct(product) ? (product.preorderShipDate || '') : null;
}
// "Free delivery" tag on bag and checkout lines, only when the bag mixes
// free-delivery brands with others (all-free or none-free bags say it in
// the delivery bar instead). Never on product cards or product pages.
function cartHasMixedDelivery() {
  const shipments = getCartShipments();
  return shipments.some(s => s.eligible) && shipments.some(s => !s.eligible);
}
function cartFreeDeliveryHtml(item, mixed) {
  const product = getCartProduct(item.productId);
  if (!mixed || !freeDeliveryOffer(product)) return '';
  // Free, or the minimum still to reach.
  const pkg = getCartShipments().find(s => s.key === shippingPackageKey(product, item));
  const text = !pkg || pkg.free ? 'Free delivery' : 'Free delivery over ' + formatPrice(pkg.minimum);
  return '<div class="cart-item-free">' + text + '</div>';
}
function cartPreorderHtml(item) {
  const date = cartItemPreorderDate(item);
  if (date === null) return '';
  const when = date ? preorderShipText(date, true) : '';
  return `<div class="cart-item-preorder">Pre-order${when ? ' · Est. dispatch ' + escapeHTML(when) : ''}</div>`;
}
function cartHasPreorder() { return S.cart.some(item => cartItemPreorderDate(item) !== null); }

function cartItemOnSale(item) {
  const product = getCartProduct(item.productId);
  return !!product && typeof hasSalePrice === 'function' && hasSalePrice(product);
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
  if (addQty < q) alert('Only ' + available + ' of ' + (product.name || 'this item') + ' (' + resolvedSize + ') remaining. We’ve added the available quantity to your bag.');

  if (existing) existing.qty += addQty;
  else S.cart.push({ productId, variantIndex: vi, size: resolvedSize, qty: addQty, name: sanitizeHTML(product.name), brand: sanitizeHTML(product.brand), price: product.price, salePrice: product.salePrice, color: sanitizeHTML(variant.color || 'Default'), thumbnail: getProductThumbnail(product, vi) });
  if (typeof lastConfirmedOrderNumber !== 'undefined' && lastConfirmedOrderNumber) {
    lastConfirmedOrderNumber = null;
    sessionStorage.removeItem('janedore_last_order_number');
  }
  commitCartChange();
  showAddedToCartToast();
}

// "Added to bag" bar: stays where the customer is (no cart panel), with a
// strip along its top that shrinks to nothing; the bar leaves when it
// does. Adding again while it's showing restarts the countdown. Removing
// an item from the bag uses the same bar, with an Undo.
const ADDED_TOAST_MS = 3000;
let _addedToastTimer = null;
let _toastUndo = null;
function showAddedToCartToast(text, icon, undo) {
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
      '<span class="added-toast-text">Added to bag</span>' +
      '<button type="button" class="added-toast-undo">Undo</button>' +
      '<button type="button" class="added-toast-close" aria-label="Dismiss"><i class="ph ph-x"></i></button>';
    toast.querySelector('.added-toast-close').addEventListener('click', hideAddedToCartToast);
    toast.querySelector('.added-toast-undo').addEventListener('click', () => {
      const fn = _toastUndo;
      hideAddedToCartToast();
      if (fn) fn();
    });
    document.body.appendChild(toast);
  }
  toast.querySelector('.added-toast-text').textContent = text || 'Added to bag';
  // 'favorite' is the wishlist heart (heartIconHtml, wishlist.js); the
  // rest are Phosphor icons.
  const iconEl = toast.querySelector('.added-toast-icon');
  if (iconEl) iconEl.outerHTML = icon === 'favorite' ? heartIconHtml(false, 'added-toast-icon')
    : '<i class="ph ' + (icon || 'ph-check-circle') + ' added-toast-icon" aria-hidden="true"></i>';
  _toastUndo = typeof undo === 'function' ? undo : null;
  toast.querySelector('.added-toast-undo').style.display = _toastUndo ? '' : 'none';
  // Sit just above the product page's sticky Add to bag bar when it's there.
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
  _toastUndo = null;
  const toast = document.getElementById('added-to-cart-toast');
  if (toast) toast.classList.remove('show');
}

function removeFromCart(productId, size, vi) {
  const index = S.cart.findIndex(i => i.productId === productId && i.size === size && i.variantIndex === vi);
  if (index < 0) return;
  const [removed] = S.cart.splice(index, 1);
  commitCartChange();
  // Undo puts the line back where it was, unless it's already back.
  showAddedToCartToast('Removed from bag', 'ph-trash', () => {
    if (S.cart.some(i => i.productId === removed.productId && i.size === removed.size && i.variantIndex === removed.variantIndex)) return;
    S.cart.splice(Math.min(index, S.cart.length), 0, removed);
    commitCartChange();
  });
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

// inputId: the bag's box by default, or one of checkout's two code boxes.
function applyPromoCode(inputId) {
  inputId = inputId || 'cart-promo-input';
  const input = document.getElementById(inputId);
  if (!input) return;
  
  // Sanitize the code before processing
  const code = sanitizeDiscountCode(input.value);
  
  if (!code) {
    showPromoMessage(inputId, 'Please enter a valid discount code.', 'error');
    return;
  }

  const subtotal = getCartSubtotal();

  // Checked on the server (server.js /api/discounts/lookup): shoppers
  // can't read the discounts collection, so codes can't be listed.
  fetch('/api/discounts/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    .then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        if (!res.ok) throw new Error(data.error || 'We couldn’t verify this code. Please try again.');
        return data;
      });
    }).then(function(data) {
    if (!data.found) {
      showPromoMessage(inputId, 'This discount code is not valid.', 'error');
      return;
    }

    const discount = data.discount;

    // Check if discount is active
    if (!discount.active) {
      showPromoMessage(inputId, 'This discount is no longer active', 'error');
      return;
    }

    // Check date validity
    const now = new Date();
    if (discount.startDate && new Date(discount.startDate) > now) {
      showPromoMessage(inputId, 'This discount is not yet active', 'error');
      return;
    }
    if (discount.endDate && new Date(discount.endDate) < now) {
      showPromoMessage(inputId, 'This discount has expired', 'error');
      return;
    }

    // Check usage limit
    if (discount.usageLimit !== null && discount.usageLimit !== undefined) {
      if ((discount.usageCount || 0) >= discount.usageLimit) {
        showPromoMessage(inputId, 'This discount has reached its usage limit', 'error');
        return;
      }
    }

    // Check minimum purchase
    if (discount.minimumPurchase && subtotal < discount.minimumPurchase) {
      showPromoMessage(inputId, 'A minimum spend of ' + formatPrice(discount.minimumPurchase) + ' applies to this code.', 'error');
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
    showPromoMessage(inputId, 'Discount applied: ' + appliedDiscount.description, 'success');
    renderCartPage();
    refreshCheckoutTotals();

  }).catch(function(err) {
    console.error('[APPLY_DISCOUNT]', err);
    showPromoMessage(inputId, 'This code could not be applied. Please try again.', 'error');
  });
}

function removePromoCode() {
  appliedDiscount = null;
  saveAppliedDiscount();
  
  ['cart-promo-input', 'checkout-promo-input-2', 'checkout-promo-input-3'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  document.querySelectorAll('.cart-promo-message').forEach(el => el.remove());

  renderCartPage();
  refreshCheckoutTotals();
}

// Checkout shows the same totals as the bag; refresh them after a code
// is applied or removed from either page.
function refreshCheckoutTotals() {
  if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
}

function getDiscountDescription(discount) {
  switch(discount.type) {
    case 'percentage':
      return discount.value + '% off';
    case 'fixed_amount':
      return formatPrice(discount.value) + ' off';
    case 'free_shipping':
      return 'Free delivery';
    case 'buy_x_get_y':
      return 'Buy ' + discount.value + ' Get 1 Free';
    default:
      return 'Discount';
  }
}

function showPromoMessage(inputId, message, type) {
  // Remove existing message
  document.querySelectorAll('.cart-promo-message').forEach(el => el.remove());

  const input = document.getElementById(inputId);
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

  // Below the whole input + Apply row, not squeezed in beside the button.
  (input.closest('.cart-code-row') || input).insertAdjacentElement('afterend', msgDiv);

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
  // The logo-only header (cart.css) applies only while the bag has items;
  // an empty bag keeps the full header so the customer can browse on.
  DOM.cartPageContent.classList.toggle('is-empty', !S.cart.length);

  if (!S.cart.length) {
    // Recently viewed first; fall back to newest arrivals so the slider
    // is never empty for a first-time visitor.
    const recent = S.recentlyViewed.filter(p => p && p.status === 'active');
    const useRecent = recent.length >= 2;
    const picks = (useRecent ? recent : newestActiveProducts()).slice(0, 8);
    DOM.cartPageContent.innerHTML = `<div class="cart-empty">
      <i class="ph ph-tote-simple cart-empty-icon" aria-hidden="true"></i>
      <div class="cart-empty-title">Your bag is empty</div>
      <button class="cart-empty-btn" onclick="navigateTo('products')">Continue shopping</button>
    </div>${cartSliderHtml(useRecent ? 'Recently viewed' : 'New arrivals', picks)}`;
    if (picks.length) initSliderLeadingTracking('cart-slider-grid');
    return;
  }

  const finalTotal = getCartTotalAfterDiscount();
  const shipping = getCartShippingStatus();
  const eligible = shipping.shipments.filter(s => s.eligible);
  const pending = eligible.find(s => s.remaining > 0);
  // Only shown when a brand in the bag offers free delivery. Free delivery
  // is per brand, so a bag that mixes in other brands names the brand.
  const mixed = eligible.length > 0 && eligible.length < shipping.shipments.length;
  const names = list => list.map(s => sanitizeHTML(s.brand)).join(' and ');
  const bannerText = pending
    ? `Add ${formatPrice(pending.remaining)} more from ${sanitizeHTML(pending.brand)} to get <strong>free delivery</strong>.`
    : eligible.length
      ? (mixed ? `Your ${names(eligible)} items qualify for <strong>free delivery</strong>.` : 'Your order qualifies for <strong>free delivery</strong>.')
      : '';
  let html = `${bannerText ? `<div class="cart-delivery-banner"><i class="ph ph-truck" aria-hidden="true"></i><span>${bannerText}</span></div>` : ''}<div class="cart-cards">`;

  S.cart.forEach(item => {
    const thumbnail = getCartItemThumbnail(item);
    const itemName = sanitizeHTML(item.name || '');
    const itemBrand = sanitizeHTML(item.brand || '');
    const itemColor = sanitizeHTML(item.color || '');
    const itemSize = sanitizeHTML(item.size || '');
    const productId = sanitizeHTML(item.productId || '');
    const stock = getCartItemStock(item);
    const soldOut = stock <= 0;
    const wished = S.wishlist.some(w => w.id === item.productId);
    const maxQty = Math.max(item.qty, Math.min(10, stock));
    let qtyOptions = '';
    for (let n = 1; n <= maxQty; n++) qtyOptions += `<option value="${n}"${n === item.qty ? ' selected' : ''}>${n}</option>`;

    html += `<div class="cart-card cart-item${soldOut ? ' sold-out' : ''}">
      <div class="cart-item-top">
        <div class="cart-item-img" style="background-image:url('${thumbnail}');" onclick="goToProduct('${productId}')">${cartBadgesHtml(item)}</div>
        <div class="cart-item-info">
          <div class="cart-item-name" onclick="goToProduct('${productId}')">${itemName}</div>
          <div class="cart-item-brand">${itemBrand}${itemColor && itemColor !== 'Default' ? ' · ' + itemColor : ''}</div>
          ${cartPreorderHtml(item)}${cartFreeDeliveryHtml(item, mixed)}
        </div>
        <div class="cart-item-actions">
          <button class="cart-item-icon-btn${wished ? ' wished' : ''}" type="button" data-wish-id="${productId}" onclick="toggleWish('${productId}',this)" aria-label="Save to wishlist">${heartIconHtml(wished)}</button>
          <button class="cart-item-icon-btn" type="button" onclick="removeFromCart('${productId}','${itemSize}',${item.variantIndex})" aria-label="Remove from bag"><i class="ph ph-x"></i></button>
        </div>
      </div>
      <div class="cart-item-attrs">
        <label class="cart-item-qty">Quantity:
          <select onchange="setCartQty('${productId}','${itemSize}',${item.variantIndex},this.value)"${soldOut ? ' disabled' : ''} aria-label="Quantity">${qtyOptions}</select>
          <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </label>
        ${itemSize && itemSize !== 'OS' ? `<span class="cart-item-size">Size: <strong>${itemSize}</strong></span>` : ''}
      </div>
      <div class="cart-item-bottom">
        <span class="cart-item-returns">Exchange or return within 14 days of delivery</span>
        <span class="cart-item-price${cartItemOnSale(item) ? ' is-sale' : ''}">${formatPrice(getCartItemLineTotal(item))}</span>
      </div>
    </div>`;
  });

  if (hasSunglassesInCart() && !pouchAlreadyInCart()) {
    const pouch = getCartProduct('janedore-leather-pouch');
    if (pouch) html += `<div class="cart-card cart-addon-item"><div class="cart-addon-img" style="background-image:url('${getProductThumbnail(pouch)}');"></div><div class="cart-addon-info"><div class="cart-addon-title">ADD-ON</div><div class="cart-addon-name">${sanitizeHTML(pouch.name)}</div><div class="cart-addon-price">${formatPrice(pouch.price)}</div></div><button class="cart-addon-btn" onclick="addPouchToCart();">Add</button></div>`;
  }

  html += `<div class="cart-card cart-code">
    <div class="cart-card-title">Apply a code <i class="ph ph-info" title="Promo and discount codes are applied to your bag total."></i></div>
    <label class="cart-code-label" for="cart-promo-input">Enter a promo code</label>
    <div class="cart-code-row">
      <input id="cart-promo-input" type="text" placeholder="Enter code" autocomplete="off" autocapitalize="characters" onkeydown="if(event.key==='Enter')applyPromoCode()">
      <button type="button" onclick="applyPromoCode()">Apply</button>
    </div>
  </div>`;

  const discountAmount = getDiscountAmount();
  const hasSoldOut = cartHasSoldOutItem();
  html += `<div class="cart-card cart-totals">
    <div class="cart-totals-head"><span>Total to pay</span><span>${formatPrice(finalTotal + shipping.fee)}</span></div>
    <div class="cart-totals-row"><span>Subtotal</span><span>${formatPrice(getCartSubtotal())}</span></div>
    ${appliedDiscount ? `<div class="cart-totals-row discount"><span>Discount (${sanitizeHTML(appliedDiscount.code)}) <button class="cart-page-remove-discount" onclick="removePromoCode()" aria-label="Remove discount">×</button></span><span>-${formatPrice(discountAmount)}</span></div>` : ''}
    <div class="cart-totals-row"><span>Delivery fee${shipping.packages > 1 ? ` (${shipping.packages} packages)` : ''}</span><span>${shipping.freeShipping ? 'Free' : formatPrice(shipping.fee)}</span></div>
    <button class="cart-checkout-btn"${hasSoldOut ? ' disabled' : ''} onclick="handleCheckoutClick()">Proceed to checkout</button>
  </div></div>`;
  const inspired = cartInspiredProducts();
  html += cartSliderHtml('Inspired by your bag', inspired);
  DOM.cartPageContent.innerHTML = html;
  if (inspired.length) initSliderLeadingTracking('cart-slider-grid');
}

function newestActiveProducts() {
  return merchandiseProducts(PRODUCTS.filter(p => p.status === 'active'), undefined, 'newest');
}

// Same brand or category as what's already in the bag (never the bag's own
// items), topped up with the newest arrivals if that's not enough.
function cartInspiredProducts() {
  const inCart = new Set(S.cart.map(i => i.productId));
  const cartProducts = S.cart.map(i => getCartProduct(i.productId)).filter(Boolean);
  const brands = new Set(cartProducts.map(p => p.brand).filter(Boolean));
  const cats = new Set(cartProducts.map(p => p.category).filter(Boolean));
  const active = PRODUCTS.filter(p => p.status === 'active' && !inCart.has(p.id));
  const related = merchandiseProducts(active.filter(p => brands.has(p.brand) || cats.has(p.category)));
  const picks = related.slice(0, 8);
  for (const p of newestActiveProducts()) {
    if (picks.length >= 8) break;
    if (!inCart.has(p.id) && !picks.includes(p)) picks.push(p);
  }
  return picks;
}

// Horizontal product slider used on both cart states and the empty
// wishlist (#wish-slider-grid there); #cart-slider-grid
// shares the New arrivals slider rules in product-grid.css.
function cartSliderHtml(title, products, gridId) {
  if (!products.length) return '';
  return `<section class="cart-suggestions">
    <div class="cart-suggestions-title">${title}</div>
    <div class="product-grid" id="${gridId || 'cart-slider-grid'}">${products.map(p => productCardHome(p)).join('')}</div>
  </section>`;
}

// Quantity dropdown on the cart page — capped at what's actually in stock
// for that exact color/size, same rule changeQty() applies.
function setCartQty(productId, size, vi, value) {
  const item = S.cart.find(i => i.productId === productId && i.size === size && i.variantIndex === vi);
  if (!item) return;
  const product = getCartProduct(productId);
  const available = product ? getVariantSizeStock(product, vi, size) : Number(value);
  const qty = Math.max(1, Math.min(Number(value) || 1, available || 1));
  if (qty < Number(value)) alert('Only ' + available + ' left in stock.');
  item.qty = qty;
  commitCartChange();
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

// Header progress circles (index.html .checkout-steps; styled in cart.css):
// 1 Bag · 2 Checkout · 3 Payment. Derived from what's actually on screen
// so every path into a checkout view (PayFast return, retries, a reload
// on the confirmation) is covered without each one remembering to call it.
function updateCheckoutSteps() {
  const steps = document.querySelectorAll('.checkout-step');
  if (!steps.length) return;
  const shown = (id) => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
  let current = 0, doneUpTo = 0;
  if (document.getElementById('page-checkout')?.classList.contains('active')) {
    // PayFast itself isn't a step: once the customer is back from it
    // (confirming or confirmed), all three circles are done.
    if (shown('checkout-confirmation-view') || shown('checkout-confirming-view')) doneUpTo = 3;
    else if (shown('checkout-payment-view')) { doneUpTo = 2; current = 3; }
    else { doneUpTo = 1; current = 2; }
  } else if (document.getElementById('page-cart')?.classList.contains('active')) {
    current = 1;
  }
  // Tappable: the steps either side of the current one, never skipping
  // (bag ↔ checkout ↔ payment). Going forward to payment still checks the
  // details form first. Nothing is tappable once the customer is back
  // from PayFast — going back then could create a duplicate order.
  const clickable = current === 1 ? [2] : current === 2 ? [1, 3] : current === 3 ? [2] : [];
  steps.forEach(step => {
    const n = Number(step.dataset.step);
    step.classList.toggle('is-done', n <= doneUpTo);
    step.classList.toggle('is-current', n === current);
    const canClick = clickable.includes(n);
    step.classList.toggle('is-clickable', canClick);
    if (canClick) { step.setAttribute('role', 'button'); step.tabIndex = 0; }
    else { step.removeAttribute('role'); step.removeAttribute('tabindex'); }
  });
}
function goToCheckoutStep(step) {
  if (!step || !step.classList.contains('is-clickable')) return;
  const onCheckout = document.getElementById('page-checkout')?.classList.contains('active');
  if (step.dataset.step === '1') openCart();
  else if (step.dataset.step === '2') { if (onCheckout) showCheckoutStep(2); else handleCheckoutClick(); }
  else if (step.dataset.step === '3') goToPaymentStep();
}
(function watchCheckoutSteps() {
  const observer = new MutationObserver(updateCheckoutSteps);
  const cartPage = document.getElementById('page-cart');
  const checkoutPage = document.getElementById('page-checkout');
  if (cartPage) observer.observe(cartPage, { attributes: true, attributeFilter: ['class'] });
  // subtree here: checkout switches between its form / confirming /
  // confirmation views with inline display styles.
  if (checkoutPage) observer.observe(checkoutPage, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });
  const bar = document.querySelector('.checkout-steps');
  if (bar) {
    bar.addEventListener('click', (e) => goToCheckoutStep(e.target.closest('.checkout-step')));
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToCheckoutStep(e.target.closest('.checkout-step')); }
    });
  }
  updateCheckoutSteps();
})();
