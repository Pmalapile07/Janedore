// ==================== CHECKOUT LOGIC ====================

let checkoutEmail = localStorage.getItem('janedore_checkout_email') || '';
let lastConfirmedOrderNumber = sessionStorage.getItem('janedore_last_order_number') || null;

// Full order details (items, address, totals) for the confirmation page
// — separate from lastConfirmedOrderNumber above, which alone isn't
// enough to render a real confirmation page. Persisted the same way, so
// refreshing or reopening checkout.html still shows the full page.
let lastConfirmedOrderDetails = null;
try {
  const storedOrderDetails = sessionStorage.getItem('janedore_last_order_details');
  if (storedOrderDetails) lastConfirmedOrderDetails = JSON.parse(storedOrderDetails);
} catch (e) { /* ignore — falls back to the order-number-only view */ }

// True from the moment a PayFast-return confirmation poll starts until
// it either succeeds or the customer is shown the "check again" fallback.
// app.js's init() also lands on the checkout page on a PayFast return
// (see the comment there), which otherwise races this poll: if init()'s
// navigateTo('checkout') runs while a poll is still waiting, it would
// call navigateToCheckout() below and reset the view back to the plain
// form, hiding the spinner the poll is actively showing. This flag tells
// navigateToCheckout() to leave the inner view alone while that's true.
let payFastConfirmPending = false;

// Shared by navigateToCheckout() and the PayFast-return flow below —
// both need to force the checkout page active regardless of whatever
// page the router's own startup logic landed on.
function activateCheckoutPage(replaceUrl) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const checkoutPage = document.getElementById("page-checkout");
  if (!checkoutPage) return null;
  checkoutPage.classList.add("active");
  S.currentPage = "checkout";
  // Same clean /checkout URL and header state as every other page —
  // this used to push "/#checkout" instead, a second address for the
  // same page that a reloaded or restored tab could come back to.
  updateCleanUrl('checkout', replaceUrl);
  resetScrollToTop();
  setNavForPage('checkout');
  ensureNavScrolled();
  return checkoutPage;
}

function navigateToCheckout(replaceUrl) {
  // Participates in app.js's shared pageNavGeneration counter (see the
  // comment there) even though this function has no async fetch of its
  // own — bumping it here still invalidates any OTHER page's in-flight
  // fetch (a vendor page's, a content page's) the moment the user lands
  // on checkout, same as every other navigation function does.
  ++pageNavGeneration;
  const user = firebase.auth().currentUser;

  // Nothing to pay for and no order just placed: the checkout form would
  // only show R0 totals, so land on the bag instead — the first link in
  // the bag → checkout → payment chain.
  if (!S.cart.length && !lastConfirmedOrderNumber && !payFastConfirmPending) {
    navigateTo('cart', replaceUrl);
    return;
  }

  const checkoutPage = activateCheckoutPage(replaceUrl);
  if (checkoutPage) {
    if (payFastConfirmPending) return;

    // checkout.html (containing every element below) loads into
    // #checkout-loaded via its own independent fetch in index.html —
    // if that hasn't resolved yet, none of these elements exist. Wait
    // for it and retry instead of silently no-op'ing on null, which is
    // what used to leave the page looking blank.
    if (!document.getElementById('checkout-form-view')) {
      (window.checkoutFragmentReady || Promise.resolve()).then(navigateToCheckout);
      return;
    }

    const confirmingView = document.getElementById('checkout-confirming-view');

    if (!S.cart.length && lastConfirmedOrderNumber) {
      document.getElementById('checkout-form-view').style.display = 'none';
      document.getElementById('checkout-payment-view').style.display = 'none';
      document.getElementById('checkout-confirmation-view').style.display = 'block';
      if (confirmingView) confirmingView.style.display = 'none';
      if (lastConfirmedOrderDetails) {
        renderOrderConfirmation(lastConfirmedOrderDetails);
      } else {
        // Details fetch failed or hasn't happened yet — fall back to
        // just the order number rather than showing broken/empty markup.
        document.getElementById('confirmation-order-number').textContent = '#' + lastConfirmedOrderNumber;
      }
      return;
    }

    showCheckoutStep(2);

    const placeOrderBtn = document.getElementById('checkout-place-order-btn');
    if (placeOrderBtn) { placeOrderBtn.disabled = false; placeOrderBtn.textContent = 'Pay now'; }

    if (checkoutEmail) fillCheckoutFieldIfEmpty('checkout-email', checkoutEmail);
    prefillCheckoutForSignedInCustomer();

    renderCheckoutSummary();
  }
}

// Only ever fills a blank field — never overwrites something the
// customer has already typed this visit.
function fillCheckoutFieldIfEmpty(id, value) {
  const el = document.getElementById(id);
  if (el && !el.value && value) el.value = value;
}

// Prefills checkout for a logged-in customer (a real account, not the
// anonymous session every visitor gets): email and name from the
// account, then phone and address from their profile — saved there each
// time they place an order while logged in (see placeOrder()). If the
// profile has no address yet, their most recent order's details are used
// instead. Waits for Firebase to restore the login first, so this also
// works when the page is reloaded straight onto /checkout.
async function prefillCheckoutForSignedInCustomer() {
  await (window.authReady || Promise.resolve());
  const user = firebase.auth().currentUser;
  if (!user || user.isAnonymous || !user.email) return;

  fillCheckoutFieldIfEmpty('checkout-email', user.email);
  fillCheckoutFieldIfEmpty('checkout-name', user.displayName);

  let saved = {};
  try {
    const doc = await db.collection('customers').doc(user.uid).get();
    if (doc.exists) saved = doc.data() || {};
  } catch (e) {
    console.warn('[CHECKOUT] Could not load saved profile:', e.message);
  }

  if (!saved.address) {
    try {
      const snap = await db.collection('orders')
        .where('customerEmail', '==', user.email)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (!snap.empty) {
        const o = snap.docs[0].data();
        saved = Object.assign({
          name: o.customerName, phone: o.customerPhone, address: o.shippingAddress,
          city: o.city, province: o.province, postalCode: o.postalCode
        }, saved);
      }
    } catch (e) {
      console.warn('[CHECKOUT] Could not load last order details:', e.message);
    }
  }

  fillCheckoutFieldIfEmpty('checkout-name', saved.name);
  fillCheckoutFieldIfEmpty('checkout-phone', saved.phone);
  fillCheckoutFieldIfEmpty('checkout-address', saved.address);
  fillCheckoutFieldIfEmpty('checkout-city', saved.city);
  fillCheckoutFieldIfEmpty('checkout-province', saved.province);
  fillCheckoutFieldIfEmpty('checkout-postal', saved.postalCode);
}

// Logging in while already on checkout (e.g. in another tab) fills the
// form in too.
firebase.auth().onAuthStateChanged(function () {
  if (S.currentPage === 'checkout' && document.getElementById('checkout-form-view')) {
    prefillCheckoutForSignedInCustomer();
  }
});

// VAT rate from admin Settings (0 = not VAT-registered, no VAT line).
// Prices on the site already include VAT, so the line shows the VAT
// part of the total rather than adding anything to it.
let checkoutVatRate = 0;
fetch('/api/store-settings')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    const rate = Number(d && d.vatRate);
    if (!(rate > 0 && rate < 100)) return;
    checkoutVatRate = rate;
    renderCheckoutSummary();
  })
  .catch(() => {});

function formatVatAmount(total) {
  const vat = Math.round(total * checkoutVatRate / (100 + checkoutVatRate) * 100) / 100;
  return 'R' + vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Same price / discount / delivery rules as the cart page (cart.js), so
// the bag and checkout always show the same total.
function getCheckoutTotals() {
  const subtotal = getCartSubtotal();
  const discountAmount = getDiscountAmount();
  const afterDiscount = getCartTotalAfterDiscount();
  const status = getCartShippingStatus(afterDiscount);
  const shipping = status.fee;
  return { subtotal, discountAmount, shipping, packages: status.packages, total: afterDiscount + shipping };
}

// Opens/closes a collapsible checkout card (Order summary, Apply a code).
function toggleCheckoutCard(btn) {
  const body = btn && document.getElementById(btn.getAttribute('aria-controls'));
  if (!body) return;
  const expand = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(expand));
  body.hidden = !expand;
}

// Step 2 (details + shipping) → step 3 (payment). The details form is
// checked first; nothing is created or charged until Pay now on step 3.
function goToPaymentStep(e) {
  if (e) e.preventDefault();
  const form = document.getElementById('checkout-form');
  if (form && !form.reportValidity()) return;
  showCheckoutStep(3);
}

// Shows step 2 (details) or step 3 (payment) of the checkout page.
function showCheckoutStep(step) {
  const formView = document.getElementById('checkout-form-view');
  const paymentView = document.getElementById('checkout-payment-view');
  if (!formView || !paymentView) return;
  formView.style.display = step === 3 ? 'none' : 'block';
  paymentView.style.display = step === 3 ? 'block' : 'none';
  ['checkout-confirmation-view', 'checkout-confirming-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  renderCheckoutSummary();
  resetScrollToTop();
}

// Radio cards (shipping / payment method): outline the chosen one.
document.addEventListener('change', function (e) {
  const input = e.target;
  if (!input.matches || !input.matches('.checkout-option input[type="radio"]')) return;
  document.querySelectorAll('.checkout-option input[name="' + input.name + '"]').forEach(r => {
    r.closest('.checkout-option').classList.toggle('is-selected', r.checked);
  });
});

function renderCheckoutSummary() {
  if (!document.getElementById('checkout-form-view') || !S.cart.length) return;

  const { subtotal, discountAmount, shipping, packages, total } = getCheckoutTotals();

  // "Your order" card: the bag's item layout, read-only — no wishlist
  // heart or remove button; changes are made one step back, in the bag.
  const itemCount = S.cart.reduce((a, i) => a + i.qty, 0);
  const countEl = document.getElementById('checkout-order-count');
  if (countEl) countEl.textContent = '(' + itemCount + ')';
  const orderTotalEl = document.getElementById('checkout-order-total');
  if (orderTotalEl) orderTotalEl.textContent = formatPrice(subtotal);
  const itemsEl = document.getElementById('checkout-items');
  if (itemsEl) {
    const mixedDelivery = cartHasMixedDelivery();
    itemsEl.innerHTML = S.cart.map(item => {
      const color = item.color && item.color !== 'Default' ? ' · ' + sanitizeHTML(item.color) : '';
      // 'OS' is a placeholder sentinel, not a real size — never display it.
      const size = item.size && item.size !== 'OS' ? sanitizeHTML(item.size) : '';
      return `<div class="checkout-order-item">
        <div class="cart-item-top">
          <div class="cart-item-img" style="background-image:url('${getCartItemThumbnail(item)}');">${cartBadgesHtml(item)}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${sanitizeHTML(item.name || '')}</div>
            <div class="cart-item-brand">${sanitizeHTML(item.brand || '')}${color}</div>
            ${cartPreorderHtml(item)}${cartFreeDeliveryHtml(item, mixedDelivery)}
          </div>
        </div>
        <div class="cart-item-attrs">
          <span>Quantity: <strong>${item.qty}</strong></span>
          ${size ? `<span class="cart-item-size">Size: <strong>${size}</strong></span>` : ''}
        </div>
        <div class="cart-item-bottom">
          <span class="cart-item-returns">Exchange or return within 30 days of dispatch</span>
          <span class="cart-item-price${cartItemOnSale(item) ? ' is-sale' : ''}">${formatPrice(getCartItemLineTotal(item))}</span>
        </div>
      </div>`;
    }).join('');
  }

  const discountRow = discountAmount > 0
    ? `<div class="checkout-totals-row discount"><span>Discount${appliedDiscount ? ' (' + sanitizeHTML(appliedDiscount.code) + ')' : ''} <button type="button" class="cart-page-remove-discount" onclick="removePromoCode()" aria-label="Remove discount">×</button></span><span>-${formatPrice(discountAmount)}</span></div>`
    : '';
  const vatLine = checkoutVatRate > 0
    ? `<div class="checkout-vat-note">Includes VAT of ${formatVatAmount(total)}</div>`
    : '';
  const totalsHtml = `<div class="checkout-totals-head${vatLine ? ' has-vat' : ''}"><span>Total to pay</span><span>${formatPrice(total)}</span></div>
    ${vatLine}
    <div class="checkout-totals-row"><span>Cart total</span><span>${formatPrice(subtotal)}</span></div>
    ${discountRow}
    <div class="checkout-totals-row"><span>Delivery fee${packages > 1 ? ' (' + packages + ' packages)' : ''}</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>`;
  document.querySelectorAll('[data-checkout-totals]').forEach(el => { el.innerHTML = totalsHtml; });

  renderShippingMethod(shipping, packages);
}

// Shipping method card: one parcel per brand, each from its own brand.
function renderShippingMethod(shipping, packages) {
  const nameEl = document.getElementById('checkout-shipping-name');
  if (nameEl) nameEl.textContent = packages > 1 ? 'Standard, ' + packages + ' packages' : 'Standard';
  const shippingPriceEl = document.getElementById('checkout-shipping-price');
  if (shippingPriceEl) shippingPriceEl.textContent = shipping === 0 ? 'FREE' : formatPrice(shipping);
  const estimateEl = document.getElementById('checkout-delivery-estimate');
  if (estimateEl) estimateEl.innerHTML = cartHasOnlyPreorder() ? '' : `Estimated delivery: <strong>${sanitizeHTML(deliveryEstimateText())}</strong>`;
  const fromEl = document.getElementById('checkout-ships-from');
  if (!fromEl) return;
  const shipments = getCartShipments();
  // Pre-orders ship on their own once ready, inside the same fee.
  const preorderNote = cartHasPreorder() ? ' <span class="checkout-preorder-note">Pre-order items are dispatched separately once available, at no additional shipping cost.</span>' : '';
  if (shipments.length <= 1) {
    fromEl.innerHTML = `Ships from <strong>${sanitizeHTML(shipments[0] ? shipments[0].brand : 'JANEDORE')}</strong>.` + preorderNote;
    return;
  }
  const sharedWarehouse = shipments.some(sh => sh.brands.length > 1);
  fromEl.innerHTML = `Your order ships in ${packages} separate packages, ${sharedWarehouse ? 'one from each brand or shared warehouse' : 'one from each brand'}.` + preorderNote +
    `<span class="checkout-ships-list">${shipments.map(s => `<span class="checkout-ships-row"><span>${sanitizeHTML(s.brand)}</span><span>${s.free ? 'Free' : formatPrice(s.fee)}</span></span>`).join('')}</span>`;
}

// In-stock items: dispatched within DELIVERY_DAYS_MIN business days of
// the order, delivered by DELIVERY_DAYS_MAX (Standard, South Africa).
const DELIVERY_DAYS_MIN = 3;
const DELIVERY_DAYS_MAX = 6;
function addBusinessDays(date, days) {
  const d = new Date(date);
  while (days > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days--;
  }
  return d;
}
function deliveryEstimateText() {
  const fmt = (d) => d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  const now = new Date();
  return fmt(addBusinessDays(now, DELIVERY_DAYS_MIN)) + ' – ' + fmt(addBusinessDays(now, DELIVERY_DAYS_MAX));
}
function cartHasOnlyPreorder() {
  return S.cart.length > 0 && S.cart.every(item => cartItemPreorderDate(item) !== null);
}

// Guest-order access token stays in this tab's session storage. Only its
// SHA-256 hash is written to the order document.
function orderAccessHeaders(orderId) {
  const token = sessionStorage.getItem('janedore_order_access_' + orderId) || '';
  return token ? { 'X-Order-Access-Token': token } : {};
}

async function placeOrder(e) {
  e.preventDefault();

  if (!S.cart.length) {
    alert('Your cart is empty.');
    return;
  }

  // Same loading-state pattern as login.js's handleLoginSubmit(): disable
  // the button and swap its label while the request is in flight. This
  // also doubles as the duplicate-submission guard — a disabled button
  // doesn't fire further submit events, so a second click (or the
  // keyboard re-submitting) while this is still running does nothing.
  const submitBtn = document.getElementById('checkout-place-order-btn');
  if (submitBtn && submitBtn.disabled) return;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait…'; }

  const email = document.getElementById('checkout-email').value.trim();
  const name = document.getElementById('checkout-name').value.trim();
  const address = document.getElementById('checkout-address').value.trim();
  const city = document.getElementById('checkout-city').value.trim();
  const province = document.getElementById('checkout-province').value.trim();
  const postal = document.getElementById('checkout-postal').value.trim();
  const country = document.getElementById('checkout-country').value.trim();
  const phone = document.getElementById('checkout-phone').value.trim();
  
  if (!email || !name || !address || !city || !province || !postal || !country) {
    alert('Please fill in all required fields.');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Pay now'; }
    return;
  }
  
  checkoutEmail = email;
  localStorage.setItem('janedore_checkout_email', email);
  
  // Shown to the customer and stored as their expected total — the server
  // re-prices the order from live product/discount data before charging
  // (priceOrder() in server.js), so these numbers are never trusted for
  // payment on their own.
  const { subtotal, discountAmount, shipping, total } = getCheckoutTotals();

  const brandGroups = {};
  const vendorIdSet = new Set();
  S.cart.forEach(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    const brand = product?.brand || 'Unknown';
    if (!brandGroups[brand]) brandGroups[brand] = [];
    brandGroups[brand].push(item);
    if (product?.vendorId) vendorIdSet.add(product.vendorId);
  });

  const user = firebase.auth().currentUser;
  const orderData = {
    orderNumber: 'ORD-' + Date.now(),
    customerEmail: email,
    customerName: name,
    customerPhone: phone,
    customerId: user ? user.uid : null,
    shippingAddress: address,
    city,
    province,
    postalCode: postal,
    country,
    // vendorId per line + the order-level vendorIds list below are what
    // admin-vendors.js's revenue/order-count tally already reads
    // (vendorRevenue/vendorOrders in renderVendorsTab) — this was never
    // being written, so every vendor's dashboard numbers have been
    // silently stuck at zero regardless of real sales.
    items: S.cart.map(item => {
      const product = PRODUCTS.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        name: item.name,
        brand: item.brand,
        vendorId: product?.vendorId || null,
        size: item.size,
        color: item.color,
        qty: item.qty,
        price: getCartItemUnitPrice(item),
        variantIndex: item.variantIndex,
        // The server re-stamps both from the product (priceOrder()).
        preorder: !!product && isPreorderProduct(product),
        preorderShipDate: product && isPreorderProduct(product) ? (product.preorderShipDate || null) : null
      };
    }),
    packageCount: Object.keys(brandGroups).length,
    brands: Object.keys(brandGroups),
    vendorIds: Array.from(vendorIdSet),
    subtotal,
    discountCode: appliedDiscount ? appliedDiscount.code : null,
    discountAmount,
    shipping,
    total,
    currency: S.currency,
    itemCount: S.cart.reduce((a, i) => a + i.qty, 0),
    status: 'pending',
    paymentStatus: 'unpaid'
  };
  
  try {
    // The server validates the cart, recalculates prices, reserves stock
    // atomically and creates the order. The browser never writes inventory.
    const authHeaders = { 'Content-Type': 'application/json' };
    if (user && !user.isAnonymous) {
      try { authHeaders.Authorization = 'Bearer ' + await user.getIdToken(); }
      catch (authError) { throw new Error('Your sign-in session expired. Please sign in again.'); }
    }
    const createResponse = await fetch('/api/orders/create', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ orderData })
    });
    const created = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      const err = new Error(created.error || 'Could not create your order. Please try again.');
      err.outOfStock = createResponse.status === 409;
      throw err;
    }
    const orderId = created.orderId;
    if (!orderId || !created.orderAccessToken) throw new Error('The server did not return a secure order confirmation. Please contact support before retrying.');
    sessionStorage.setItem('janedore_order_access_' + orderId, created.orderAccessToken);

    // Fire-and-forget — save this address to the signed-in customer's
    // profile so it's there to prefill next visit. The order is already
    // placed, so a failure here should never block or undo any of
    // that, just get logged.
    if (user && !user.isAnonymous) {
      db.collection('customers').doc(user.uid).set({
        name,
        email: user.email || email,
        phone,
        address,
        city,
        province,
        postalCode: postal,
        country,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(function(err) {
        console.warn('[CHECKOUT] Could not save address to profile:', err.message);
      });
    }

    // The order exists now (status: pending, paymentStatus: unpaid) but
    // nothing has actually been paid for yet — that's what this redirect
    // is for. The cart is deliberately NOT cleared here: if the customer
    // cancels on PayFast's side, they land back on the site with their
    // bag intact instead of having to re-add everything. Clearing it,
    // sending the confirmation email, and showing the confirmation
    // screen all now happen only once handlePayFastReturn() below
    // confirms the order actually got paid.
    await redirectToPayFast(orderId);

  } catch (e) {
    console.warn('Order error:', e);
    alert(e.outOfStock ? e.message : 'Error placing order: ' + e.message);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Pay now'; }
  }
  // No restore on success: redirectToPayFast() navigates the browser
  // away, so the button stays disabled/"Please wait…" until that
  // happens rather than flickering back to clickable first.
}

// Asks the server to build a signed PayFast payment request for this
// order (the signature needs the account passphrase, which must never
// reach the browser, so this can only happen server-side — see
// /api/payfast/initiate in server.js) and submits it as a real form
// POST, which navigates the browser away to PayFast's payment page.
async function redirectToPayFast(orderId) {
  // The method picked on step 3 ('cc' card, 'ef' Instant EFT, or '' for
  // PayFast's full list). The server only accepts known values.
  const picked = document.querySelector('input[name="checkout-payment-method"]:checked');
  const res = await fetch('/api/payfast/initiate', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, orderAccessHeaders(orderId)),
    body: JSON.stringify({ orderId, paymentMethod: picked ? picked.value : '' })
  });
  if (!res.ok) {
    const body = await res.json().catch(function () { return {}; });
    throw new Error(body.error || 'Could not start payment. Please try again.');
  }
  const { action, fields } = await res.json();

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  Object.keys(fields).forEach(function (key) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = fields[key];
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// PayFast's ITN (server-side, see server.js) is usually sent and
// processed before the customer is redirected back to return_url, but
// that's not a hard guarantee — Render's free tier can be slow to wake
// up, so the order's paymentStatus may not have updated yet by the time
// the customer lands back here. Rather than check once and give up,
// poll a few times with backoff before concluding anything.
const PAYFAST_POLL_DELAYS_MS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000]; // ~25s total

async function pollPaymentStatus(orderId, attempt) {
  try {
    const res = await fetch('/api/orders/' + encodeURIComponent(orderId) + '/status', {
      headers: orderAccessHeaders(orderId)
    });
    const data = await res.json();
    if (data.paymentStatus === 'paid') {
      S.cart = [];
      updateBadges();
      renderCartPage();
      saveCartToStorage();

      lastConfirmedOrderNumber = data.orderNumber || orderId;
      sessionStorage.setItem('janedore_last_order_number', lastConfirmedOrderNumber);
      // Remembered on this device so the buyer can review what they bought
      // without signing in (product-detail.js deviceOrdersForReviews()).
      try {
        const mine = JSON.parse(localStorage.getItem('janedore_my_orders') || '[]').filter(o => o.orderNumber !== lastConfirmedOrderNumber);
        mine.unshift({ orderNumber: lastConfirmedOrderNumber, email: localStorage.getItem('janedore_checkout_email') || '' });
        localStorage.setItem('janedore_my_orders', JSON.stringify(mine.slice(0, 20)));
      } catch (e) {}

      await loadConfirmedOrderDetails(orderId);

      payFastConfirmPending = false;
      navigateToCheckout();
      return;
    }
  } catch (e) {
    console.warn('[PAYFAST_RETURN] Could not confirm payment status:', e.message);
  }

  if (attempt < PAYFAST_POLL_DELAYS_MS.length) {
    setTimeout(function () { pollPaymentStatus(orderId, attempt + 1); }, PAYFAST_POLL_DELAYS_MS[attempt]);
  } else {
    showPayFastConfirmTimeout(orderId);
  }
}

// Fetches the full order (items, address, totals) for the confirmation
// page and caches it — a failure here isn't fatal, navigateToCheckout()
// falls back to showing just the order number.
async function loadConfirmedOrderDetails(orderId) {
  try {
    const res = await fetch('/api/orders/' + encodeURIComponent(orderId), {
      headers: orderAccessHeaders(orderId)
    });
    if (!res.ok) return;
    lastConfirmedOrderDetails = await res.json();
    sessionStorage.setItem('janedore_last_order_details', JSON.stringify(lastConfirmedOrderDetails));
  } catch (e) {
    console.warn('[CHECKOUT] Could not load order details for confirmation page:', e.message);
  }
}

function formatConfirmationDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

// Same as "View order" in the confirmation email (order-emails.js): the
// Track your order page sends a signed-in owner on to My account and
// shows guests the order with their checkout email filled in. The
// account's cached order list predates this order, so it's cleared.
function viewConfirmedOrder() {
  if (!lastConfirmedOrderNumber) { navigateTo('home'); return; }
  if (typeof clearAccountCache === 'function') clearAccountCache();
  history.pushState(null, null, '/pages/track-your-order?order=' + encodeURIComponent(lastConfirmedOrderNumber) + '&view=1');
  navigateToContentPage('track-your-order', true);
}

function renderOrderConfirmation(order) {
  const numberEl = document.getElementById('confirmation-order-number');
  if (numberEl) numberEl.textContent = '#' + (order.orderNumber || '');

  const dateEl = document.getElementById('confirmation-order-date');
  if (dateEl) dateEl.textContent = formatConfirmationDate(order.createdAt);


  const statusDot = document.getElementById('confirmation-status-dot');
  const statusText = document.getElementById('confirmation-status-text');
  if (statusDot && statusText) {
    if (order.paymentStatus === 'paid') {
      statusDot.classList.remove('danger');
      statusText.textContent = 'Confirmed';
    } else {
      statusDot.classList.add('danger');
      statusText.textContent = order.paymentStatus === 'refunded' ? 'Refunded' : order.paymentStatus === 'refund_pending' ? 'Refund in progress' : 'Pending';
    }
  }

  const thanksText = document.getElementById('confirmation-thanks-text');
  if (thanksText) {
    thanksText.textContent = order.paymentStatus === 'paid'
      ? 'Your payment went through and your order is in. A confirmation email is on its way.'
      : "Your order is in. We'll email your confirmation as soon as your payment clears.";
  }

  const items = order.items || [];
  const itemCount = items.reduce((a, i) => a + (i.qty || 0), 0);
  const countEl = document.getElementById('confirmation-item-count');
  if (countEl) countEl.textContent = '(' + itemCount + ')';

  const itemsEl = document.getElementById('confirmation-items');
  if (itemsEl) {
    const brands = [...new Set(items.map(i => i.brand).filter(Boolean))];
    itemsEl.innerHTML = items.map(item => {
      const product = PRODUCTS.find(p => p.id === item.productId);
      const thumbnail = product ? getProductThumbnail(product, item.variantIndex) : PLACEHOLDER_IMAGE;
      // 'OS' is a placeholder sentinel, not a real size — never display it.
      const sizeDisplay = item.size && item.size !== 'OS' ? item.size : '';
      const brandLine = [item.brand, item.color].filter(Boolean).map(escapeHTML).join(' · ');
      return `<div class="checkout-item">
        <div class="checkout-item-img" style="background-image:url('${thumbnail}');"></div>
        <div class="checkout-item-info">
          <div class="checkout-item-name">${escapeHTML(item.name)}</div>
          ${brandLine ? `<div class="checkout-item-brand">${brandLine}</div>` : ''}
          ${cartPreorderHtml(item)}
          <div class="checkout-item-meta">Qty: <strong>${item.qty}</strong>${sizeDisplay ? ` &nbsp; Size: <strong>${escapeHTML(sizeDisplay)}</strong>` : ''}</div>
        </div>
        <div class="checkout-item-price">${formatPrice((item.price || 0) * item.qty)}</div>
      </div>`;
    }).join('') + (brands.length > 1
      ? `<p class="checkout-packages-note">Ships in ${brands.length} packages, one from each brand.</p>`
      : '');
  }

  const addressEl = document.getElementById('confirmation-address');
  if (addressEl) {
    const lines = [
      order.shippingAddress,
      [order.city, order.province].filter(Boolean).join(', '),
      [order.postalCode, order.country].filter(Boolean).join(', ')
    ].filter(Boolean).map(escapeHTML);
    addressEl.innerHTML = '<strong>' + escapeHTML(order.customerName) + '</strong>' + lines.join('<br>');
  }

  const summaryEl = document.getElementById('confirmation-summary');
  if (summaryEl) {
    const discount = Number(order.discountAmount) || 0;
    summaryEl.innerHTML =
      '<div class="checkout-totals-head"><span>Total paid</span><span>' + formatPrice(order.total || 0) + '</span></div>' +
      '<div class="checkout-totals-row"><span>Cart total</span><span>' + formatPrice(order.subtotal || 0) + '</span></div>' +
      (discount > 0
        ? '<div class="checkout-totals-row discount"><span>Discount' + (order.discountCode ? ' (' + escapeHTML(order.discountCode) + ')' : '') + '</span><span>-' + formatPrice(discount) + '</span></div>'
        : '') +
      '<div class="checkout-totals-row"><span>Delivery fee</span><span>' + (order.shipping === 0 ? 'Free' : formatPrice(order.shipping || 0)) + '</span></div>';
  }

  const view = document.getElementById('checkout-confirmation-view');
  if (view) view.classList.add('has-details');
}

function showPayFastConfirmingView() {
  payFastConfirmPending = true;
  activateCheckoutPage(true);

  // This runs at script-load time, right as the PayFast redirect lands
  // — almost certainly before checkout.html's own independent fetch
  // (in index.html) has finished injecting these elements into
  // #checkout-loaded. Wait for it rather than silently no-op'ing on
  // null, same as navigateToCheckout() above.
  if (!document.getElementById('checkout-form-view')) {
    (window.checkoutFragmentReady || Promise.resolve()).then(showPayFastConfirmingView);
    return;
  }

  const formView = document.getElementById('checkout-form-view');
  const confirmationView = document.getElementById('checkout-confirmation-view');
  const confirmingView = document.getElementById('checkout-confirming-view');
  if (formView) formView.style.display = 'none';
  const paymentView = document.getElementById('checkout-payment-view');
  if (paymentView) paymentView.style.display = 'none';
  if (confirmationView) confirmationView.style.display = 'none';
  if (confirmingView) confirmingView.style.display = 'block';
}

function showPayFastConfirmTimeout(orderId) {
  const spinner = document.getElementById('checkout-confirming-spinner');
  const text = document.getElementById('checkout-confirming-text');
  const retryBtn = document.getElementById('checkout-confirming-retry');
  if (spinner) spinner.style.display = 'none';
  if (text) text.textContent = 'This is taking longer than usual. We\'ll email your confirmation as soon as it clears, or check again now.';
  if (retryBtn) {
    retryBtn.style.display = 'inline-block';
    retryBtn.onclick = function () {
      retryBtn.style.display = 'none';
      if (spinner) spinner.style.display = 'block';
      if (text) text.textContent = 'This usually only takes a few seconds. Please don\'t close this page.';
      pollPaymentStatus(orderId, 0);
    };
  }
}

// Runs once on page load, at script-load time (this file is deferred,
// so the DOM already exists by the time it runs). app.js's init() also
// recognizes payfast_return/payfast_cancel and lands on the checkout
// page itself regardless of which of the two finishes first — see the
// comment next to that check in app.js — so there's no dependency here
// on run order between the two.
function handlePayFastReturn() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  if (!orderId) return;

  const isReturn = params.get('payfast_return') === '1';
  const isCancel = params.get('payfast_cancel') === '1';
  if (!isReturn && !isCancel) return;

  // The early inline <script> in index.html's <head> hid #page-home so
  // it never got painted while this was still undecided — safe to
  // remove now, either branch below takes it from here (activating
  // checkout, or leaving home visible behind the cancel alert).
  const earlyHide = document.getElementById('payfast-early-hide');
  if (earlyHide) earlyHide.remove();

  // Flag read by app.js's init() (see the comment there) — set before
  // the URL is rewritten below, since init() runs later (after
  // DOMContentLoaded) and by then location.search would already be
  // stripped if it tried to read the params itself.
  window.__payfastReturnActive = true;

  // Either way, the URL's done its job — drop the query params so a
  // refresh doesn't replay this.
  history.replaceState(null, '', window.location.pathname);

  if (isCancel) {
    // Best-effort — the customer's bag is already intact regardless of
    // whether this call succeeds, so a network failure here shouldn't
    // block showing them the message below.
    fetch('/api/payfast/order/' + encodeURIComponent(orderId) + '/cancel', {
      method: 'POST',
      headers: orderAccessHeaders(orderId)
    })
      .catch(function (e) { console.warn('[PAYFAST_CANCEL] Could not record cancellation:', e.message); });
    alert('Payment was cancelled. Your bag is still here whenever you\'re ready.');
    return;
  }

  showPayFastConfirmingView();
  pollPaymentStatus(orderId, 0);
}
handlePayFastReturn();
