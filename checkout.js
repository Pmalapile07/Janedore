// ==================== CHECKOUT LOGIC ====================

let checkoutEmail = localStorage.getItem('janedore_checkout_email') || '';

function navigateToCheckout() {
  const user = firebase.auth().currentUser;
  
  if (!S.cart.length && !user) {
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
    const productRefs = S.cart.map(item => db.collection('products').doc(item.productId));

    await db.runTransaction(async (transaction) => {
      const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

      for (let i = 0; i < S.cart.length; i++) {
        const doc = productDocs[i];
        if (doc.exists) {
          const currentStock = doc.data().stock || 0;
          if (currentStock < S.cart[i].qty) {
            const err = new Error((S.cart[i].name || 'An item') + ' only has ' + currentStock + ' left in stock.');
            err.outOfStock = true;
            throw err;
          }
        }
      }

      transaction.set(orderRef, {
        ...orderData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      for (let i = 0; i < S.cart.length; i++) {
        const doc = productDocs[i];
        if (doc.exists) {
          const currentStock = doc.data().stock || 0;
          transaction.update(productRefs[i], { stock: currentStock - S.cart[i].qty });
        }
      }
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

    S.cart = [];
    updateBadges();
    renderCart();
    saveCartToStorage();

  } catch (e) {
    console.warn('Order error:', e);
    alert(e.outOfStock ? e.message : 'Error placing order: ' + e.message);
  }
}
