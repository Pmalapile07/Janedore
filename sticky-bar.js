function removeStickyBar() { const e=document.getElementById('sticky-add-bar'); if(e)e.remove(); S.stickyExtended=false; }
function createStickyBar(product) {
  removeStickyBar();
  const soldOut=isProductSoldOut(product);
  const vi=S.productVariantSelections[product.id]??0;
  const price=product.salePrice?product.salePrice:product.price;
  const bar=document.createElement('div');
  bar.id='sticky-add-bar';
  bar.className='sticky-add-bar';
  bar.innerHTML=`
    <div class="sticky-name">${product.name||''}</div>
    <div class="sticky-price">${formatPrice(price)}</div>
    <div class="sticky-extras">
      <div class="sticky-sizes" id="sticky-sizes">${(product.sizes||[]).map(s=>`<button class="sticky-size-btn${S.selectedSize===s?' sel':''}" onclick="event.stopPropagation();selectStickySize(this,'${s}')">${s}</button>`).join("")}</div>
      <div class="sticky-swatches" id="sticky-swatches">${stickySwatchesHtml(product,vi)}</div>
    </div>
    <button class="sticky-add-btn" onclick="handleStickyAddClick('${product.id}')"${soldOut?' disabled':''}>${soldOut?'Sold Out':'Add to Bag'}</button>`;
  document.body.appendChild(bar);
  S.stickyExtended = false;
  updateStickyBarOnScroll();
}
function handleStickyAddClick(productId) {
  const bar=document.getElementById('sticky-add-bar');
  if(!bar) return;
  if(!S.stickyExtended) {
    bar.classList.add('extended');
    S.stickyExtended = true;
    setTimeout(() => {
      const barHeight = bar.offsetHeight;
      bar.style.transform = `translateY(-${barHeight - 60}px)`;
    }, 10);
  } else {
    addToCartFromDetailSticky(productId);
  }
}
function selectStickySize(btn,size) {
  document.querySelectorAll('#sticky-sizes .sticky-size-btn').forEach(b=>b.classList.remove("sel"));
  btn.classList.add("sel");
  S.selectedSize=size;
}
function updateStickyBarExtras() {
  const product=PRODUCTS.find(p=>p.id===S.currentReviewProductId);
  if(!product) return;
  const vi=S.productVariantSelections[product.id]??0;
  const se=document.getElementById('sticky-swatches');
  if(se) se.innerHTML=stickySwatchesHtml(product,vi);
}
function updateStickyBarOnScroll() {
  const bar=document.getElementById('sticky-add-bar');
  if(!bar||S.currentPage!=='product-detail') return;
  const pi=document.querySelector('.product-info');
  if(!pi) return;
  if(pi.getBoundingClientRect().top<window.innerHeight*0.3){
    bar.classList.add('minimized');
    if(!S.stickyExtended) {
      bar.style.transform = '';
    }
    const btn=bar.querySelector('.sticky-add-btn');
    if(btn&&!btn.disabled)btn.textContent='Add';
  } else {
    bar.classList.remove('minimized');
    if(!S.stickyExtended) {
      bar.style.transform = '';
    }
    const btn=bar.querySelector('.sticky-add-btn');
    if(btn&&!btn.disabled)btn.textContent='Add to Bag';
  }
}
function updateStickyBar(product) {
  const bar=document.getElementById('sticky-add-bar');
  if(!bar){createStickyBar(product);return;}
  const soldOut=isProductSoldOut(product);
  const vi=S.productVariantSelections[product.id]??0;
  const price=product.salePrice?product.salePrice:product.price;
  bar.querySelector('.sticky-name').textContent=product.name||'';
  bar.querySelector('.sticky-price').textContent=formatPrice(price);
  const se=bar.querySelector('#sticky-sizes');
  if(se)se.innerHTML=(product.sizes||[]).map(s=>`<button class="sticky-size-btn${S.selectedSize===s?' sel':''}" onclick="event.stopPropagation();selectStickySize(this,'${s}')">${s}</button>`).join("");
  const sw=bar.querySelector('#sticky-swatches');
  if(sw)sw.innerHTML=stickySwatchesHtml(product,vi);
  const btn=bar.querySelector('.sticky-add-btn');
  btn.disabled=soldOut;
  btn.textContent=soldOut?'Sold Out':(bar.classList.contains('minimized')?'Add':'Add to Bag');
}
function addToCartFromDetailSticky(id) {
  if(!S.selectedSize){
    const bar=document.getElementById('sticky-add-bar');
    if(bar&&!S.stickyExtended){
      bar.classList.add('extended');
      S.stickyExtended=true;
      setTimeout(() => {
        const barHeight = bar.offsetHeight;
        bar.style.transform = `translateY(-${barHeight - 60}px)`;
      }, 10);
    }
    return;
  }
  const product=PRODUCTS.find(p=>p.id===id);
  if(product&&isProductSoldOut(product))return;
  addToCart(id,S.selectedSize);
  openCart();
  const bar=document.getElementById('sticky-add-bar');
  if(bar){
    bar.classList.remove('extended');
    bar.style.transform = '';
    S.stickyExtended=false;
    S.selectedSize = null;
    const sizesEl = bar.querySelector('#sticky-sizes');
    if(sizesEl && product) {
      sizesEl.innerHTML = (product.sizes||[]).map(s=>`<button class="sticky-size-btn" onclick="event.stopPropagation();selectStickySize(this,'${s}')">${s}</button>`).join("");
    }
  }
}
