function loadCartFromStorage() { try { const saved = localStorage.getItem('janedore_cart'); if (saved) S.cart = JSON.parse(saved); } catch(e) { S.cart = []; } }
function saveCartToStorage() { try { localStorage.setItem('janedore_cart', JSON.stringify(S.cart)); } catch(e) {} }
function cleanCartOrphans() { S.cart = S.cart.filter(item => PRODUCTS.some(p => p.id === item.productId)); saveCartToStorage(); }
function cartHasMultipleTypes() { const types = new Set(S.cart.map(i=>PRODUCTS.find(p=>p.id===i.productId)?.category).filter(Boolean)); return types.size>1; }
function addPouchToCart() { const pouch=PRODUCTS.find(p=>p.id==='janedore-leather-pouch'); if(pouch){addToCart('janedore-leather-pouch','OS');renderCart();} }
function hasSunglassesInCart() { return S.cart.some(item=>PRODUCTS.find(p=>p.id===item.productId)?.category==='sunglasses'); }
function pouchAlreadyInCart() { return S.cart.some(item=>item.productId==='janedore-leather-pouch'); }
function truncateNameTwoWords(name) {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return name;
  return words.slice(0, 2).join(' ') + '…';
}
function addToCart(productId,size,qty) { 
  const q=(qty&&qty>0)?qty:1; 
  const product=PRODUCTS.find(p=>p.id===productId); 
  if(!product||isProductSoldOut(product))return; 
  const vi=S.productVariantSelections[productId]??0; 
  const variant=(product.variants||[])[vi]??{}; 
  const existing=S.cart.find(i=>i.productId===productId&&i.size===(size||product.sizes[0])&&i.variantIndex===vi); 
  if(existing)existing.qty+=q; 
  else S.cart.push({productId,variantIndex:vi,size:size||product.sizes[0]||'OS',qty:q,name:product.name,brand:product.brand,price:product.price,salePrice:product.salePrice,color:variant.color||'Default',thumbnail:getProductThumbnail(product,vi)}); 
  updateBadges();renderCart();saveCartToStorage();
  openCart();
}

function removeFromCart(productId,size,vi) { S.cart=S.cart.filter(i=>!(i.productId===productId&&i.size===size&&i.variantIndex===vi)); updateBadges();renderCart();saveCartToStorage(); }
function changeQty(productId,size,delta,vi) { const item=S.cart.find(i=>i.productId===productId&&i.size===size&&i.variantIndex===vi); if(!item)return; const nq=item.qty+delta; if(nq<=0){removeFromCart(productId,size,vi);}else{item.qty=nq;renderCart();saveCartToStorage();} }
function renderCart() {
  if(!DOM.cartBody||!DOM.cartFoot)return; const total=S.cart.reduce((a,i)=>a+i.qty,0); if(DOM.cartItemCount)DOM.cartItemCount.textContent=total;
  if(!S.cart.length){DOM.cartBody.innerHTML='<div class="cart-empty-state"><div class="cart-empty-msg">Your bag is empty</div><button class="btn-continue-shopping" onclick="closeCart();navigateTo(\'products\');">Continue Shopping</button></div>';DOM.cartFoot.innerHTML='';return;}
  let html=S.cart.map(item=>{const thumbnail=item.thumbnail&&item.thumbnail!==PLACEHOLDER_IMAGE?item.thumbnail:(item.productId?getProductThumbnail(PRODUCTS.find(p=>p.id===item.productId),item.variantIndex):PLACEHOLDER_IMAGE); return `<div class="cart-item-row" onclick="goToProduct('${item.productId}')"><div class="cart-item-img-placeholder" style="background-image:url('${thumbnail}');"></div><div style="flex:1"><div class="ci-brand">${item.brand||''}</div><div class="ci-name">${truncateNameTwoWords(item.name)}</div><div class="ci-meta">${item.color||''} · ${item.size||''}</div><div class="ci-qty"><button class="ci-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',-1,${item.variantIndex})">−</button><span class="ci-qty-num">${item.qty}</span><button class="ci-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',1,${item.variantIndex})">+</button></div></div><span class="ci-price">${formatPrice((item.salePrice??item.price??0)*item.qty)}</span><button class="ci-remove" onclick="event.stopPropagation();removeFromCart('${item.productId}','${item.size}',${item.variantIndex})">×</button></div>`;}).join("");
  if(hasSunglassesInCart()&&!pouchAlreadyInCart()){const pouch=PRODUCTS.find(p=>p.id==='janedore-leather-pouch');if(pouch)html+=`<div class="cart-addon-section"><div class="cart-addon-title">ADD-ON</div><div class="cart-addon-item"><div class="cart-addon-img" style="background-image:url('${getProductThumbnail(pouch)}');"></div><div class="cart-addon-info"><div class="cart-addon-name">${pouch.name}</div><div class="cart-addon-price">${formatPrice(pouch.price)}</div></div><button class="cart-addon-btn" onclick="event.stopPropagation();addPouchToCart();">Add</button></div></div>`;}
  DOM.cartBody.innerHTML=html; const sub=S.cart.reduce((a,i)=>a+(i.salePrice??i.price??0)*i.qty,0);
  DOM.cartFoot.innerHTML=`<div class="cart-subtotal"><span class="cart-subtotal-label">Subtotal</span><span class="cart-subtotal-val">${formatPrice(sub)}</span></div><div class="cart-ship-note">${sub>=1500?"Free shipping applied":`R150 shipping · Free over ${formatPrice(1500)}`}</div>${cartHasMultipleTypes()?'<div class="cart-multi-package-note">contents may arrive in multiple packages</div>':''}<button class="btn-view-cart" onclick="closeCart();navigateTo('cart');">View Bag</button><button class="btn-checkout-main" onclick="closeCart();navigateTo('checkout');">Checkout</button><div class="cart-security-note"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Secure & Encrypted Payment</div>`;
}
function renderCartPage() {
  if(!DOM.cartPageContent)return;
  if(!S.cart.length){DOM.cartPageContent.innerHTML='<div class="cart-page-empty"><div class="cart-page-empty-title">Your bag is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>';return;}
  let html = `<div class="cart-page-title">Your Bag (${S.cart.reduce((a,i)=>a+i.qty,0)} items)</div>`;
  S.cart.forEach(item => {
    const thumbnail = item.thumbnail && item.thumbnail !== PLACEHOLDER_IMAGE ? item.thumbnail : (item.productId ? getProductThumbnail(PRODUCTS.find(p=>p.id===item.productId), item.variantIndex) : PLACEHOLDER_IMAGE);
    const lineTotal = (item.salePrice ?? item.price ?? 0) * item.qty;
    html += `<div class="cart-page-item" onclick="goToProduct('${item.productId}')">
      <div class="cart-page-img" style="background-image:url('${thumbnail}');"></div>
      <div class="cart-page-details">
        <div class="cart-page-brand">${item.brand||''}</div>
        <div class="cart-page-name">${item.name||''}</div>
        <div class="cart-page-meta">${item.color||''} · ${item.size||''}</div>
        <div class="cart-page-qty-wrap">
          <button class="cart-page-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',-1,${item.variantIndex});renderCartPage();">−</button>
          <span class="cart-page-qty-num">${item.qty}</span>
          <button class="cart-page-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',1,${item.variantIndex});renderCartPage();">+</button>
        </div>
      </div>
      <div class="cart-page-price">${formatPrice(lineTotal)}</div>
      <button class="cart-page-remove" onclick="event.stopPropagation();removeFromCart('${item.productId}','${item.size}',${item.variantIndex});renderCartPage();">×</button>
    </div>`;
  });
  const sub = S.cart.reduce((a,i)=>a+(i.salePrice??i.price??0)*i.qty,0);
  html += `<div class="cart-page-summary">
    <div class="cart-page-subtotal">Subtotal <strong>${formatPrice(sub)}</strong></div>
    <div class="cart-page-ship-note">${sub>=1500?"Free shipping applied":`R150 shipping · Free over ${formatPrice(1500)}`}</div>
    ${cartHasMultipleTypes()?'<div class="cart-page-multi-package-note">contents may arrive in multiple packages</div>':''}
    <div class="cart-page-promo">
      <input class="cart-page-promo-input" type="text" placeholder="Promo code" id="cart-promo-input">
      <button class="cart-page-promo-btn" onclick="applyPromoCode()">Apply</button>
    </div>
    <div class="cart-page-actions">
      <button class="cart-page-btn secondary" onclick="navigateTo('products')">Continue Shopping</button>
      <button class="cart-page-btn primary" onclick="navigateTo('checkout')">Checkout</button>
    </div>
  </div>`;
  DOM.cartPageContent.innerHTML = html;
}
function applyPromoCode(){}
function openCart() { DOM.cartBackdrop.classList.add("open"); DOM.cartPanel.classList.add("open"); renderCart(); }
function closeCart() { DOM.cartBackdrop.classList.remove("open"); DOM.cartPanel.classList.remove("open"); }
function updateBadges() { const cc=S.cart.reduce((a,i)=>a+i.qty,0); if(DOM.cartBadge){DOM.cartBadge.style.display=cc>0?"flex":"none";DOM.cartBadge.textContent=cc;} if(DOM.wishBadge){DOM.wishBadge.style.display=S.wishlist.length>0?"flex":"none";DOM.wishBadge.textContent=S.wishlist.length;} }
function calculateShipping() { const postal=document.getElementById("postal-code-input")?.value.trim(); const res=document.getElementById("shipping-result"); if(!res) return; if(!postal||postal.length<3){res.textContent="Please enter a valid postal code.";return;} res.textContent=`Estimated shipping: ${formatPrice(Math.floor(Math.random()*150)+50)} (3-5 business days)`; }
