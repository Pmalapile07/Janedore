// =========================================
//  STICKY ADD TO CART — JANEDORE
//  Zara-style UX: tap size → instant add
//  Permanently glued to bottom:0
//  NO translateY transforms ever
// =========================================

function removeStickyBar() {
  const e = document.getElementById('sticky-add-bar');
  if (e) e.remove();
  S.stickyExtended = false;
}

function createStickyBar(product) {
  removeStickyBar();
  const soldOut = isProductSoldOut(product);
  const vi = S.productVariantSelections[product.id] ?? 0;
  const price = product.salePrice ? product.salePrice : product.price;
  const bar = document.createElement('div');
  bar.id = 'sticky-add-bar';
  bar.className = 'sticky-add-bar';
  bar.innerHTML = `
    <div class="sticky-name">${product.name || ''}</div>
    <div class="sticky-price">${formatPrice(price)}</div>
    <div class="sticky-extras">
      <div class="sticky-sizes" id="sticky-sizes">
        ${(product.sizes || []).map(s =>
          `<button class="sticky-size-btn${S.selectedSize === s ? ' sel' : ''}"
            onclick="event.stopPropagation(); onStickySelectSize(this, '${s}', '${product.id}')"
          >${s}</button>`
        ).join('')}
      </div>
      <div class="sticky-swatches" id="sticky-swatches">${stickySwatchesHtml(product, vi)}</div>
    </div>
    <button class="sticky-add-btn"
      onclick="handleStickyAddClick('${product.id}')"
      ${soldOut ? ' disabled' : ''}
    ><span class="sticky-btn-label">${soldOut ? 'Sold Out' : 'Add to Bag'}</span><span class="sticky-btn-price">${formatPrice(price)}</span></button>`;
  document.body.appendChild(bar);
  S.stickyExtended = false;
  updateStickyBarOnScroll();
}

// ─── Open size panel ───────────────────────────────────────
function handleStickyAddClick(productId) {
  const bar = document.getElementById('sticky-add-bar');
  if (!bar) return;

  // Already extended — do nothing (sizes handle their own tap)
  if (S.stickyExtended) return;

  // Expand to show sizes — bar stays glued to bottom:0
  bar.classList.add('extended');
  S.stickyExtended = true;
  // NO translateY — panel expands upward naturally from bottom
}

// ─── Tap size → instant add ────────────────────────────────
function onStickySelectSize(btn, size, productId) {
  // Visual selection
  document.querySelectorAll('#sticky-sizes .sticky-size-btn')
    .forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  S.selectedSize = size;

  const product = PRODUCTS.find(p => p.id === productId);
  if (!product || isProductSoldOut(product)) return;

  // Instant add
  addToCart(productId, size);

  // Luxury feedback — no aggressive cart drawer
  _stickyAddedFeedback(productId, product);
}

// ─── "Added" feedback then collapse ───────────────────────
function _stickyAddedFeedback(productId, product) {
  const bar = document.getElementById('sticky-add-bar');
  if (!bar) return;

  // Collapse extended panel — bar stays glued to bottom:0
  bar.classList.remove('extended');
  S.stickyExtended = false;
  S.selectedSize = null;

  // Reset size button states
  const sizesEl = bar.querySelector('#sticky-sizes');
  if (sizesEl && product) {
    sizesEl.innerHTML = (product.sizes || []).map(s =>
      `<button class="sticky-size-btn"
        onclick="event.stopPropagation(); onStickySelectSize(this, '${s}', '${product.id}')"
      >${s}</button>`
    ).join('');
  }

  // Brief "Added" state on the button — then restore
  const btn = bar.querySelector('.sticky-add-btn');
  const label = bar.querySelector('.sticky-btn-label');
  if (btn && label) {
    bar.classList.add('added-feedback');
    label.textContent = 'Added';

    setTimeout(() => {
      bar.classList.remove('added-feedback');
      const isMin = bar.classList.contains('minimized');
      label.textContent = isMin ? 'Add' : 'Add to Bag';
    }, 1600);
  }
}

// ─── Legacy: size chosen via selectStickySize ─────────────
// Kept for any direct call sites outside the bar
function selectStickySize(btn, size) {
  document.querySelectorAll('#sticky-sizes .sticky-size-btn')
    .forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  S.selectedSize = size;
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
      label.textContent = 'Add';
    }
  } else {
    bar.classList.remove('minimized');
    const label = bar.querySelector('.sticky-btn-label');
    const btn = bar.querySelector('.sticky-add-btn');
    if (label && btn && !btn.disabled && label.textContent !== 'Added') {
      label.textContent = 'Add to Bag';
    }
  }
}

// ─── Update swatches only ──────────────────────────────────
function updateStickyBarExtras() {
  const product = PRODUCTS.find(p => p.id === S.currentReviewProductId);
  if (!product) return;
  const vi = S.productVariantSelections[product.id] ?? 0;
  const se = document.getElementById('sticky-swatches');
  if (se) se.innerHTML = stickySwatchesHtml(product, vi);
}

// ─── Full bar update (variant/price change) ────────────────
function updateStickyBar(product) {
  const bar = document.getElementById('sticky-add-bar');
  if (!bar) { createStickyBar(product); return; }

  const soldOut = isProductSoldOut(product);
  const vi = S.productVariantSelections[product.id] ?? 0;
  const price = product.salePrice ? product.salePrice : product.price;

  bar.querySelector('.sticky-name').textContent = product.name || '';
  
  // Update standalone price (visible in default state)
  const priceEl = bar.querySelector('.sticky-price');
  if (priceEl) priceEl.textContent = formatPrice(price);

  // Update price inside button (visible in minimized state)
  const btnPriceEl = bar.querySelector('.sticky-btn-price');
  if (btnPriceEl) btnPriceEl.textContent = formatPrice(price);

  const se = bar.querySelector('#sticky-sizes');
  if (se) se.innerHTML = (product.sizes || []).map(s =>
    `<button class="sticky-size-btn${S.selectedSize === s ? ' sel' : ''}"
      onclick="event.stopPropagation(); onStickySelectSize(this, '${s}', '${product.id}')"
    >${s}</button>`
  ).join('');

  const sw = bar.querySelector('#sticky-swatches');
  if (sw) sw.innerHTML = stickySwatchesHtml(product, vi);

  const btn = bar.querySelector('.sticky-add-btn');
  const label = bar.querySelector('.sticky-btn-label');
  if (btn && label) {
    btn.disabled = soldOut;
    if (soldOut) {
      label.textContent = 'Sold Out';
    } else if (label.textContent !== 'Added') {
      label.textContent = bar.classList.contains('minimized') ? 'Add' : 'Add to Bag';
    }
  }
}

// ─── Legacy shim — kept for any existing call sites ────────
function addToCartFromDetailSticky(id) {
  if (!S.selectedSize) {
    handleStickyAddClick(id);
    return;
  }
  const product = PRODUCTS.find(p => p.id === id);
  if (product && isProductSoldOut(product)) return;
  addToCart(id, S.selectedSize);
  _stickyAddedFeedback(id, product);
}
