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
function activateCheckoutPage() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const checkoutPage = document.getElementById("page-checkout");
  if (!checkoutPage) return null;
  checkoutPage.classList.add("active");
  S.currentPage = "checkout";
  updateHash('checkout');
  window.scrollTo({ top: 0, behavior: "smooth" });
  ensureNavScrolled();
  return checkoutPage;
}

function navigateToCheckout() {
  // Participates in app.js's shared pageNavGeneration counter (see the
  // comment there) even though this function has no async fetch of its
  // own — bumping it here still invalidates any OTHER page's in-flight
  // fetch (a vendor page's, a content page's) the moment the user lands
  // on checkout, same as every other navigation function does.
  ++pageNavGeneration;
  const user = firebase.auth().currentUser;

  if (!S.cart.length && !user && !lastConfirmedOrderNumber) {
    alert('Your cart is empty');
    return;
  }

  const checkoutPage = activateCheckoutPage();
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

    document.getElementById('checkout-form-view').style.display = 'block';
    document.getElementById('checkout-confirmation-view').style.display = 'none';
    if (confirmingView) confirmingView.style.display = 'none';

    const placeOrderBtn = document.getElementById('checkout-place-order-btn');
    if (placeOrderBtn) { placeOrderBtn.disabled = false; placeOrderBtn.textContent = 'Place Order'; }

    if (user && user.email) {
      document.getElementById('checkout-email').value = user.email;
      if (user.displayName) {
        document.getElementById('checkout-name').value = user.displayName;
      }
      prefillCheckoutFromProfile(user.uid);
    } else if (checkoutEmail) {
      document.getElementById('checkout-email').value = checkoutEmail;
    }

    renderCheckoutSummary();
  }
}

// Fills in a returning signed-in customer's saved address — written to
// their profile the first time they complete an order while logged in
// (see placeOrder() below) — so they don't retype it on every visit.
// Guarded per field so it only fills in blanks, never overwrites
// something already typed this session.
async function prefillCheckoutFromProfile(uid) {
  try {
    const doc = await db.collection('customers').doc(uid).get();
    if (!doc.exists) return;
    const c = doc.data();
    const fillIfEmpty = (id, value) => {
      const el = document.getElementById(id);
      if (el && !el.value && value) el.value = value;
    };
    fillIfEmpty('checkout-phone', c.phone);
    fillIfEmpty('checkout-address', c.address);
    fillIfEmpty('checkout-city', c.city);
    fillIfEmpty('checkout-province', c.province);
    fillIfEmpty('checkout-postal', c.postalCode);
    fillIfEmpty('checkout-country', c.country);
  } catch (e) {
    console.warn('[CHECKOUT] Could not load saved address:', e.message);
  }
}

function renderCheckoutSummary() {
  const itemsContainer = document.getElementById('checkout-items');
  if (!itemsContainer || !S.cart.length) {
    if (itemsContainer) itemsContainer.innerHTML = '<p style="text-align:center;padding:20px;color:#888;font-size:11px;">Your cart is empty.</p>';
    return;
  }
  
  const subtotal = S.cart.reduce((a, i) => a + (i.salePrice ?? i.price ?? 0) * i.qty, 0);
  const shipping = subtotal >= 1500 ? 0 : 150;
  const total = subtotal + shipping;
  
  let itemsHTML = S.cart.map(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    const thumbnail = item.thumbnail && item.thumbnail !== PLACEHOLDER_IMAGE 
      ? item.thumbnail 
      : (product ? getProductThumbnail(product, item.variantIndex) : PLACEHOLDER_IMAGE);
    
    // 'OS' is a placeholder sentinel, not a real size — never display it.
    const itemSizeDisplay = item.size && item.size !== 'OS' ? item.size : '';
    return `<div class="checkout-item">
      <div class="checkout-item-img" style="background-image:url('${thumbnail}');"></div>
      <div class="checkout-item-info">
        <div class="checkout-item-brand">${item.brand || ''}</div>
        <div class="checkout-item-name">${item.name}</div>
        <div class="checkout-item-meta">${item.color || ''}${item.color && itemSizeDisplay ? ' · ' : ''}${itemSizeDisplay} · Qty: ${item.qty}</div>
      </div>
      <div class="checkout-item-price">${formatPrice((item.salePrice ?? item.price ?? 0) * item.qty)}</div>
    </div>`;
  }).join('');
  
  const brandGroups = {};
  S.cart.forEach(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    const brand = product?.brand || 'Unknown';
    if (!brandGroups[brand]) brandGroups[brand] = [];
    brandGroups[brand].push(item);
  });
  
  const brandNames = Object.keys(brandGroups);
  const totalItems = S.cart.reduce((a, i) => a + i.qty, 0);
  
  let packagesHTML = '';
  if (brandNames.length > 1) {
    packagesHTML = `<div class="checkout-package-note">${brandNames.length} packages · Ships from ${brandNames.join(', ')}</div>`;
  }
  
  itemsContainer.innerHTML = itemsHTML;
  
  const packagesEl = document.getElementById('checkout-packages');
  if (packagesEl) packagesEl.innerHTML = packagesHTML;
  
  const subtotalEl = document.getElementById('checkout-subtotal');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  
  const shippingEl = document.getElementById('checkout-shipping');
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'Free' : formatPrice(shipping);
  
  const totalEl = document.getElementById('checkout-total');
  if (totalEl) totalEl.textContent = formatPrice(total);
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
  
  if (!email || !name || !address || !city || !country) {
    alert('Please fill in all required fields.');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; }
    return;
  }
  
  checkoutEmail = email;
  localStorage.setItem('janedore_checkout_email', email);
  
  const subtotal = S.cart.reduce((a, i) => a + (i.salePrice ?? i.price ?? 0) * i.qty, 0);
  const shipping = subtotal >= 1500 ? 0 : 150;
  const total = subtotal + shipping;
  
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
        price: item.salePrice || item.price,
        variantIndex: item.variantIndex
      };
    }),
    packageCount: Object.keys(brandGroups).length,
    brands: Object.keys(brandGroups),
    vendorIds: Array.from(vendorIdSet),
    subtotal,
    shipping,
    total,
    currency: S.currency,
    itemCount: S.cart.reduce((a, i) => a + i.qty, 0),
    status: 'pending',
    paymentStatus: 'unpaid'
  };
  
  try {
    // Order creation and the stock decrement happen in a single
    // transaction — both succeed together or neither does. Previously
    // these were two separate steps: the order was always created, and
    // stock was decremented afterward on a best-effort basis (a failure
    // there was just logged, leaving the order and the inventory count
    // out of sync forever). That separate step also read-then-wrote
    // stock non-atomically, so two customers checking out the last unit
    // at the same moment could both succeed and oversell it.
    // Firestore transactions serialize against each other on the same
    // document, so this closes both problems at once: every read happens
    // before any write (required by the API), stock sufficiency is
    // checked for the whole cart before anything is committed, and a
    // product that sells out between two concurrent checkouts correctly
    // fails the second one instead of letting it through.
    const orderRef = db.collection('orders').doc();

    // Group cart lines by product — the same product can appear twice
    // (two different sizes/colors of one item), and each product must be
    // read and written only once in this transaction: writing it twice
    // would have the second write silently clobber the first's stock
    // change, since each write replaces that product's whole stock state.
    const itemsByProduct = {};
    S.cart.forEach(item => {
      (itemsByProduct[item.productId] = itemsByProduct[item.productId] || []).push(item);
    });
    const productIds = Object.keys(itemsByProduct);
    const productRefs = productIds.map(id => db.collection('products').doc(id));

    await db.runTransaction(async (transaction) => {
      const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

      // Validate every line first — nothing gets written until the whole
      // cart is confirmed to fit, same as before.
      const updates = [];
      for (let p = 0; p < productIds.length; p++) {
        const doc = productDocs[p];
        if (!doc.exists) continue;
        const data = doc.data();
        const items = itemsByProduct[productIds[p]];
        const stockByVariant = (data.stockByVariant && typeof data.stockByVariant === 'object') ? data.stockByVariant : null;

        if (stockByVariant) {
          // Stock is tracked per size per color — check/decrement each
          // line against its own (variant, size) bucket, not the product
          // as a whole, so selling out Size S doesn't block Size M.
          const nextByVariant = JSON.parse(JSON.stringify(stockByVariant));
          for (const item of items) {
            const vi = item.variantIndex ?? 0;
            const key = item.size || 'OS';
            const sizeStock = nextByVariant[vi] || {};
            const current = typeof sizeStock[key] === 'number' ? sizeStock[key] : 0;
            if (current < item.qty) {
              const err = new Error((item.name || 'An item') + ' (' + key + ') only has ' + current + ' left in stock.');
              err.outOfStock = true;
              throw err;
            }
            sizeStock[key] = current - item.qty;
            nextByVariant[vi] = sizeStock;
          }
          const newTotal = Object.values(nextByVariant).reduce((sum, sizes) =>
            sum + Object.values(sizes).reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0), 0);
          updates.push({ ref: productRefs[p], data: { stockByVariant: nextByVariant, stock: newTotal } });
        } else {
          // Not yet broken down by size/color — same flat check as before.
          const currentStock = data.stock || 0;
          const totalQty = items.reduce((a, it) => a + it.qty, 0);
          if (currentStock < totalQty) {
            const err = new Error((items[0].name || 'An item') + ' only has ' + currentStock + ' left in stock.');
            err.outOfStock = true;
            throw err;
          }
          updates.push({ ref: productRefs[p], data: { stock: currentStock - totalQty } });
        }
      }

      transaction.set(orderRef, {
        ...orderData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      updates.forEach(u => transaction.update(u.ref, u.data));
    });

    // Fire-and-forget — save this address to the signed-in customer's
    // profile so it's there to prefill next visit. The order is already
    // placed, so a failure here should never block or undo any of
    // that, just get logged.
    if (user) {
      db.collection('customers').doc(user.uid).set({
        name,
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
    await redirectToPayFast(orderRef.id);

  } catch (e) {
    console.warn('Order error:', e);
    alert(e.outOfStock ? e.message : 'Error placing order: ' + e.message);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; }
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
  const res = await fetch('/api/payfast/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId })
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
    const res = await fetch('/api/orders/' + encodeURIComponent(orderId) + '/status');
    const data = await res.json();
    if (data.paymentStatus === 'paid') {
      S.cart = [];
      updateBadges();
      renderCart();
      saveCartToStorage();

      lastConfirmedOrderNumber = data.orderNumber || orderId;
      sessionStorage.setItem('janedore_last_order_number', lastConfirmedOrderNumber);

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
    const res = await fetch('/api/orders/' + encodeURIComponent(orderId));
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

// No courier/logistics integration exists yet, so this is a generic
// estimate (order date + 5-9 days), not a real tracked delivery window —
// matches how most storefronts show a delivery estimate before a
// tracking number actually exists.
function formatDeliveryEstimate(iso) {
  const base = iso ? new Date(iso) : new Date();
  const start = new Date(base); start.setDate(start.getDate() + 5);
  const end = new Date(base); end.setDate(end.getDate() + 9);
  const fmt = (d) => d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
  return fmt(start) + ' – ' + fmt(end);
}

function renderOrderConfirmation(order) {
  const numberEl = document.getElementById('confirmation-order-number');
  if (numberEl) numberEl.textContent = '#' + (order.orderNumber || '');

  const dateEl = document.getElementById('confirmation-order-date');
  if (dateEl) dateEl.textContent = formatConfirmationDate(order.createdAt);

  const deliveryEl = document.getElementById('confirmation-delivery-estimate');
  if (deliveryEl) deliveryEl.textContent = formatDeliveryEstimate(order.createdAt);

  const statusDot = document.getElementById('confirmation-status-dot');
  const statusText = document.getElementById('confirmation-status-text');
  if (statusDot && statusText) {
    if (order.paymentStatus === 'paid') {
      statusDot.classList.remove('danger');
      statusText.textContent = 'Payment Confirmed';
    } else {
      statusDot.classList.add('danger');
      statusText.textContent = order.paymentStatus === 'refunded' ? 'Refunded' : 'Payment Pending';
    }
  }

  const items = order.items || [];
  const itemCount = items.reduce((a, i) => a + (i.qty || 0), 0);
  const countEl = document.getElementById('confirmation-item-count');
  if (countEl) countEl.textContent = itemCount + (itemCount === 1 ? ' Item' : ' Items');

  const brandGroups = {};
  items.forEach(item => {
    const brand = item.brand || 'Unknown';
    (brandGroups[brand] = brandGroups[brand] || []).push(item);
  });

  const itemsEl = document.getElementById('confirmation-items');
  if (itemsEl) {
    itemsEl.innerHTML = Object.keys(brandGroups).map(brand => {
      const groupItems = brandGroups[brand];
      const groupCount = groupItems.reduce((a, i) => a + (i.qty || 0), 0);
      const rows = groupItems.map(item => {
        const product = PRODUCTS.find(p => p.id === item.productId);
        const thumbnail = product ? getProductThumbnail(product, item.variantIndex) : PLACEHOLDER_IMAGE;
        const sizeDisplay = item.size && item.size !== 'OS' ? item.size : '';
        return `<div class="checkout-item">
          <div class="checkout-item-img" style="background-image:url('${thumbnail}');"></div>
          <div class="checkout-item-info">
            <div class="checkout-item-name">${item.name}</div>
            <div class="checkout-item-meta">${item.color || ''}${item.color && sizeDisplay ? ' · ' : ''}${sizeDisplay}</div>
          </div>
          <div class="checkout-item-qty">Qty: ${item.qty}</div>
          <div class="checkout-item-price">${formatPrice((item.price || 0) * item.qty)}</div>
        </div>`;
      }).join('');
      return `<div class="checkout-confirmation-brand-group">
        <div class="checkout-confirmation-brand-head"><span>${brand}</span><span>${groupCount + (groupCount === 1 ? ' Item' : ' Items')}</span></div>
        ${rows}
      </div>`;
    }).join('');
  }

  const addressEl = document.getElementById('confirmation-address');
  if (addressEl) {
    const line2 = [order.city, order.province].filter(Boolean).join(', ');
    const line3 = [order.postalCode, order.country].filter(Boolean).join(', ');
    addressEl.innerHTML =
      '<strong>' + (order.customerName || '') + '</strong>' +
      (order.shippingAddress || '') + '<br>' +
      line2 + '<br>' +
      line3;
  }

  const summaryEl = document.getElementById('confirmation-summary');
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="checkout-total-row"><span>Items (' + itemCount + ')</span><span>' + formatPrice(order.subtotal || 0) + '</span></div>' +
      '<div class="checkout-total-row"><span>Shipping</span><span>' + (order.shipping === 0 ? 'Free' : formatPrice(order.shipping || 0)) + '</span></div>' +
      '<div class="checkout-total-divider"></div>' +
      '<div class="checkout-total-final"><strong>Total</strong><strong>' + formatPrice(order.total || 0) + '</strong></div>';
  }
}

function showPayFastConfirmingView() {
  payFastConfirmPending = true;
  activateCheckoutPage();

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
      if (text) text.textContent = 'This usually only takes a few seconds — please don\'t close this page.';
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
    fetch('/api/payfast/order/' + encodeURIComponent(orderId) + '/cancel', { method: 'POST' })
      .catch(function (e) { console.warn('[PAYFAST_CANCEL] Could not record cancellation:', e.message); });
    alert('Payment was cancelled. Your bag is still here whenever you\'re ready.');
    return;
  }

  showPayFastConfirmingView();
  pollPaymentStatus(orderId, 0);
}
handlePayFastReturn();
