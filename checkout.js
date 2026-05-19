// ==================== CHECKOUT LOGIC ====================

let checkoutEmail = localStorage.getItem('janedore_checkout_email') || '';

function navigateToCheckout() {
  if (!S.cart.length) { alert('Your cart is empty'); return; }
  
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
    
    if (checkoutEmail) {
      document.getElementById('checkout-email').value = checkoutEmail;
    }
    
    renderCheckoutSummary();
  }
}

function renderCheckoutSummary() {
  const itemsContainer = document.getElementById('checkout-items');
  if (!itemsContainer) return;
  
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
  
  let itemsHTML = S.cart.map(item => {
    return `<div class="checkout-item">
      <div class="checkout-item-img" style="background-image:url('${item.thumbnail || ''}');"></div>
      <div class="checkout-item-info">
        <div class="checkout-item-brand">${item.brand || ''}</div>
        <div class="checkout-item-name">${item.name}</div>
        <div style="color:#888;">${item.color || ''} · ${item.size || ''} · Qty: ${item.qty}</div>
      </div>
      <div style="font-size:11px;">${formatPrice((item.salePrice ?? item.price ?? 0) * item.qty)}</div>
    </div>`;
  }).join('');
  
  const brandNames = Object.keys(brandGroups);
  let packagesHTML = '';
  if (brandNames.length > 1) {
    packagesHTML = `<div class="checkout-package-note">📦 ${brandNames.length} packages from ${brandNames.join(', ')}</div>`;
  }
  
  itemsContainer.innerHTML = itemsHTML;
  document.getElementById('checkout-packages').innerHTML = packagesHTML;
  document.getElementById('checkout-subtotal').textContent = formatPrice(subtotal);
  document.getElementById('checkout-shipping').textContent = shipping === 0 ? 'Free' : formatPrice(shipping);
  document.getElementById('checkout-total').textContent = formatPrice(total);
}

async function placeOrder(e) {
  e.preventDefault();
  
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
  
  const orderData = {
    orderNumber: 'ORD-' + Date.now(),
    customerEmail: email,
    customerName: name,
    customerPhone: phone,
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
    packages: Object.keys(brandGroups).length,
    brands: Object.keys(brandGroups),
    subtotal,
    shipping,
    total,
    currency: S.currency,
    itemCount: S.cart.reduce((a, i) => a + i.qty, 0),
    status: 'pending'
  };
  
  try {
    // Save order to Firestore
    await db.collection('orders').add({
      ...orderData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Reduce stock (don't let errors block confirmation)
    try {
      for (const item of S.cart) {
        const productRef = db.collection('products').doc(item.productId);
        const productDoc = await productRef.get();
        if (productDoc.exists) {
          const currentStock = productDoc.data().stock || 0;
          await productRef.update({ stock: Math.max(0, currentStock - item.qty) });
        }
      }
    } catch (stockError) {
      console.warn('Stock update failed but order saved:', stockError);
    }
    
    // Show confirmation
    document.getElementById('checkout-form-view').style.display = 'none';
    document.getElementById('checkout-confirmation-view').style.display = 'block';
    document.getElementById('confirmation-order-number').textContent = 'Order #' + orderData.orderNumber;
    
    // Clear cart
    S.cart = [];
    updateBadges();
    renderCart();
    
  } catch (e) {
    console.warn('Order error:', e);
    alert('Error placing order: ' + e.message);
  }
}
