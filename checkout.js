// ==================== CHECKOUT LOGIC ====================

let checkoutEmail = localStorage.getItem('janedore_checkout_email') || '';
let lastConfirmedOrderNumber = sessionStorage.getItem('janedore_last_order_number') || null;

function navigateToCheckout() {
  const user = firebase.auth().currentUser;

  if (!S.cart.length && !user && !lastConfirmedOrderNumber) {
    alert('Your cart is empty');
    return;
  }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  const checkoutPage = document.getElementById("page-checkout");
  if (checkoutPage) {
    checkoutPage.classList.add("active");
    S.currentPage = "checkout";
    updateHash('checkout');
    window.scrollTo({ top: 0, behavior: "smooth" });
    ensureNavScrolled();

    if (!S.cart.length && lastConfirmedOrderNumber) {
      document.getElementById('checkout-form-view').style.display = 'none';
      document.getElementById('checkout-confirmation-view').style.display = 'block';
      document.getElementById('confirmation-order-number').textContent = 'Order #' + lastConfirmedOrderNumber;
      return;
    }

    document.getElementById('checkout-form-view').style.display = 'block';
    document.getElementById('checkout-confirmation-view').style.display = 'none';

    if (user && user.email) {
      document.getElementById('checkout-email').value = user.email;
      if (user.displayName) {
        document.getElementById('checkout-name').value = user.displayName;
      }
    } else if (checkoutEmail) {
      document.getElementById('checkout-email').value = checkoutEmail;
    }
    
    renderCheckoutSummary();
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
  
  const email = document.getElementById('checkout-email').value.trim();
  const name = document.getElementById('checkout-name').value.trim();
  const address = document.getElementById('checkout-address').value.trim();
  const city = document.getElementById('checkout-city').value.trim();
  const postal = document.getElementById('checkout-postal').value.trim();
  const country = document.getElementById('checkout-country').value.trim();
  const phone = document.getElementById('checkout-phone').value.trim();
  
  if (!email || !name || !address || !city || !country) {
    alert('Please fill in all required fields.');
    return;
  }
  
  checkoutEmail = email;
  localStorage.setItem('janedore_checkout_email', email);
  
  const subtotal = S.cart.reduce((a, i) => a + (i.salePrice ?? i.price ?? 0) * i.qty, 0);
  const shipping = subtotal >= 1500 ? 0 : 150;
  const total = subtotal + shipping;
  
  const brandGroups = {};
  S.cart.forEach(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    const brand = product?.brand || 'Unknown';
    if (!brandGroups[brand]) brandGroups[brand] = [];
    brandGroups[brand].push(item);
  });
  
  const user = firebase.auth().currentUser;
  
  const orderData = {
    orderNumber: 'ORD-' + Date.now(),
    customerEmail: email,
    customerName: name,
    customerPhone: phone,
    customerId: user ? user.uid : null,
    shippingAddress: { address, city, postal, country },
    items: S.cart.map(item => ({
      productId: item.productId,
      name: item.name,
      brand: item.brand,
      size: item.size,
      color: item.color,
      qty: item.qty,
      price: item.salePrice || item.price,
      variantIndex: item.variantIndex
    })),
    packageCount: Object.keys(brandGroups).length,
    brands: Object.keys(brandGroups),
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

    // Fire-and-forget — the order is already placed and stock is already
    // decremented at this point; a failed confirmation email shouldn't
    // block or undo any of that, just get logged.
    fetch('/api/send-order-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: orderData.orderNumber,
        customerEmail: orderData.customerEmail,
        customerName: orderData.customerName,
        items: orderData.items,
        subtotal: orderData.subtotal,
        shipping: orderData.shipping,
        total: orderData.total,
        currency: orderData.currency
      })
    }).catch(function(err) {
      console.warn('[EMAIL] Order confirmation failed to send:', err.message);
    });

    document.getElementById('checkout-form-view').style.display = 'none';
    document.getElementById('checkout-confirmation-view').style.display = 'block';
    document.getElementById('confirmation-order-number').textContent = 'Order #' + orderData.orderNumber;

    lastConfirmedOrderNumber = orderData.orderNumber;
    sessionStorage.setItem('janedore_last_order_number', lastConfirmedOrderNumber);

    S.cart = [];
    updateBadges();
    renderCart();
    saveCartToStorage();

  } catch (e) {
    console.warn('Order error:', e);
    alert(e.outOfStock ? e.message : 'Error placing order: ' + e.message);
  }
}
