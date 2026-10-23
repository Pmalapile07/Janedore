// Card actions: the heart-and-plus icon on product cards (collection.js
// productCard, productCardHome) opens a sheet with three choices: Add to
// bag, Add to (or Remove from) wishlist, View full details. Add to bag
// turns the sheet into quick add: the product's photo, price, colours
// and sizes, so shoppers can add it without leaving the page they're on.
// Adding uses the same addToCart() as the product page (cart.js), so
// stock limits and the "Added to bag" bar work the same way.

let _quickAdd = null; // { id, vi, size }

// The heart stays an outline whether or not the product is wished; the
// sheet says Add to or Remove from wishlist.
function cardActionButtonHtml(p) {
  return `<button type="button" class="product-card-action" aria-label="Options for ${escapeHTML(p.name || '')}" onclick="event.stopPropagation();openCardActions('${escapeJSString(p.id)}')"><i class="ph ph-heart"></i><i class="ph-fill ph-plus-circle card-action-plus" aria-hidden="true"></i></button>`;
}

function quickAddSizes(p) { return (p.sizes || []).filter(s => s !== 'OS'); }

function quickAddSheet() {
  let sheet = document.getElementById('quick-add-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'quick-add-sheet';
    sheet.innerHTML = '<div class="quick-add-backdrop" onclick="closeQuickAdd()"></div>' +
      '<div class="quick-add-panel" role="dialog" aria-modal="true" aria-label="Quick add"></div>';
    document.body.appendChild(sheet);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeQuickAdd(); });
  }
  return sheet;
}
function showQuickAddSheet(sheet) {
  if (sheet.classList.contains('open')) return;
  if (typeof lockPageScroll === 'function') lockPageScroll();
  requestAnimationFrame(() => sheet.classList.add('open'));
}

// The product at the top of both views: photo, brand, name, price.
function quickAddHeadHtml(p, vi) {
  const imgs = ((p.variants || [])[vi] || {}).images || {};
  const img = gridThumbURL(imgs.ghost?.[0] || imgs.model?.[0] || PLACEHOLDER_IMAGE);
  const price = hasSalePrice(p)
    ? `<span class="quick-add-price-sale">${escapeHTML(formatPriceCardStyle(p.salePrice))}</span><span class="quick-add-price-was">${escapeHTML(formatPriceCardStyle(p.price))}</span>`
    : `<span>${escapeHTML(formatPriceCardStyle(p.price))}</span>`;
  return `<button type="button" class="quick-add-close" onclick="closeQuickAdd()" aria-label="Close"><i class="ph ph-x"></i></button>
    <div class="quick-add-head">
      <img class="quick-add-img" src="${escapeHTML(img)}" alt="${escapeHTML(p.name || '')}">
      <div class="quick-add-meta">
        <div class="product-brand">${escapeHTML(p.brand || '')}</div>
        <div class="quick-add-name">${escapeHTML(p.name || '')}</div>
        <div class="quick-add-price">${price}</div>
      </div>
    </div>`;
}

function openCardActions(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  const sheet = quickAddSheet();
  const panel = sheet.querySelector('.quick-add-panel');
  const vi = S.productVariantSelections[productId] ?? 0;
  const id = escapeJSString(p.id);
  const wished = (S.wishlist || []).some(w => w.id === p.id);
  const row = (icon, label, onclick) => `<button type="button" class="card-action-row" onclick="${onclick}"><i class="ph ${icon}" aria-hidden="true"></i><span>${label}</span><i class="ph ph-caret-right card-action-chev" aria-hidden="true"></i></button>`;
  panel.innerHTML = quickAddHeadHtml(p, vi) + `<div class="card-action-list">` +
    ((p.stock ?? 0) > 0 ? row('ph-tote-simple', 'Add to bag', `openQuickAdd('${id}')`) : '') +
    row('ph-heart', wished ? 'Remove from wishlist' : 'Add to wishlist', `closeQuickAdd();toggleWish('${id}')`) +
    row('ph-arrow-right', 'View full details', `closeQuickAdd();S.productVariantSelections['${id}']=${vi};goToProduct('${id}')`) +
    `</div>`;
  showQuickAddSheet(sheet);
}

function openQuickAdd(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  const vi = S.productVariantSelections[productId] ?? 0;
  _quickAdd = { id: productId, vi, size: null };
  const sheet = quickAddSheet();
  renderQuickAdd();
  showQuickAddSheet(sheet);
}

function closeQuickAdd() {
  const sheet = document.getElementById('quick-add-sheet');
  if (!sheet || !sheet.classList.contains('open')) return;
  sheet.classList.remove('open');
  if (typeof unlockPageScroll === 'function') unlockPageScroll();
}

function renderQuickAdd() {
  const panel = document.querySelector('#quick-add-sheet .quick-add-panel');
  const p = _quickAdd && PRODUCTS.find(x => x.id === _quickAdd.id);
  if (!panel || !p) return;
  const vi = _quickAdd.vi;
  const variant = (p.variants || [])[vi] || {};
  const sizes = quickAddSizes(p);
  // Keep the picked size only while it's in stock in this colour; a
  // product with one size in stock has it picked already.
  if (_quickAdd.size && !isSizeInStock(p, vi, _quickAdd.size)) _quickAdd.size = null;
  const inStock = sizes.filter(s => isSizeInStock(p, vi, s));
  if (!_quickAdd.size && inStock.length === 1) _quickAdd.size = inStock[0];
  const available = sizes.length ? inStock.length > 0 : isSizeInStock(p, vi, 'OS');

  const colours = (p.variants || []).length > 1
    ? `<div class="quick-add-label">Colour: <span>${escapeHTML(variant.color || '')}</span></div><div class="quick-add-swatches">` +
      p.variants.map((v, i) => { const thumb = variantSwatchThumb(v); return `<button type="button" class="quick-add-swatch${i === vi ? ' selected' : ''}${thumb ? ' has-image' : ''}" style="${thumb ? `background-image:url('${thumb}')` : `background:${escapeHTML((v && v.swatch) || '#ccc')}`}" aria-label="${escapeHTML((v && v.color) || 'Colour ' + (i + 1))}" onclick="quickAddColour(${i})"></button>`; }).join('') + '</div>'
    : '';
  const sizeRow = sizes.length
    ? `<div class="quick-add-label">Select a size</div><div class="sizes-row">` +
      sizes.map(s => {
        const ok = isSizeInStock(p, vi, s);
        return `<button type="button" class="product-size-btn${_quickAdd.size === s ? ' sel' : ''}${ok ? '' : ' out-of-stock'}" ${ok ? '' : 'disabled aria-label="' + escapeHTML(s) + ', sold out"'} onclick="quickAddSize('${escapeJSString(s)}')">${escapeHTML(s)}</button>`;
      }).join('') + '</div>'
    : '';
  const label = !available ? 'Sold out' : (sizes.length && !_quickAdd.size ? 'Select a size' : 'Add to bag');

  panel.innerHTML = quickAddHeadHtml(p, vi) + `
    ${colours ? `<div class="quick-add-section">${colours}</div>` : ''}
    ${sizeRow ? `<div class="quick-add-section">${sizeRow}</div>` : ''}
    <button type="button" class="quick-add-submit" onclick="quickAddSubmit()" ${label === 'Add to bag' ? '' : 'disabled'}>${label}</button>
    <button type="button" class="quick-add-details" onclick="closeQuickAdd();S.productVariantSelections['${escapeJSString(p.id)}']=${vi};goToProduct('${escapeJSString(p.id)}')">View full details</button>`;
}

function quickAddColour(i) { _quickAdd.vi = i; renderQuickAdd(); }
function quickAddSize(s) { _quickAdd.size = s; renderQuickAdd(); }

function quickAddSubmit() {
  const p = _quickAdd && PRODUCTS.find(x => x.id === _quickAdd.id);
  if (!p) return;
  if (quickAddSizes(p).length && !_quickAdd.size) return;
  // addToCart() adds the colour picked for this product.
  S.productVariantSelections[p.id] = _quickAdd.vi;
  closeQuickAdd();
  addToCart(p.id, _quickAdd.size || 'OS', 1);
}
