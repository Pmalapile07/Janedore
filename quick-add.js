// Quick add: the bag icon on product cards (collection.js productCard,
// productCardHome) opens a sheet with the product's photo, price,
// colours and sizes, so shoppers can add it to their bag without
// leaving the page they're on. Adding uses the same addToCart() as the
// product page (cart.js), so stock limits and the "Added to bag" bar
// work the same way.

let _quickAdd = null; // { id, vi, size }

function quickAddButtonHtml(p) {
  if ((p.stock ?? 0) <= 0) return '';
  return `<button type="button" class="product-quick-add-btn" aria-label="Quick add ${escapeHTML(p.name || '')}" onclick="event.stopPropagation();openQuickAdd('${escapeJSString(p.id)}')"><i class="ph ph-tote-simple"></i></button>`;
}

function quickAddSizes(p) { return (p.sizes || []).filter(s => s !== 'OS'); }

function openQuickAdd(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  const vi = S.productVariantSelections[productId] ?? 0;
  _quickAdd = { id: productId, vi, size: null };
  let sheet = document.getElementById('quick-add-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'quick-add-sheet';
    sheet.innerHTML = '<div class="quick-add-backdrop" onclick="closeQuickAdd()"></div>' +
      '<div class="quick-add-panel" role="dialog" aria-modal="true" aria-label="Quick add"></div>';
    document.body.appendChild(sheet);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeQuickAdd(); });
  }
  renderQuickAdd();
  if (typeof lockPageScroll === 'function' && !sheet.classList.contains('open')) lockPageScroll();
  requestAnimationFrame(() => sheet.classList.add('open'));
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
  const imgs = variant.images || {};
  const img = gridThumbURL(imgs.ghost?.[0] || imgs.model?.[0] || PLACEHOLDER_IMAGE);
  const sizes = quickAddSizes(p);
  // Keep the picked size only while it's in stock in this colour; a
  // product with one size in stock has it picked already.
  if (_quickAdd.size && !isSizeInStock(p, vi, _quickAdd.size)) _quickAdd.size = null;
  const inStock = sizes.filter(s => isSizeInStock(p, vi, s));
  if (!_quickAdd.size && inStock.length === 1) _quickAdd.size = inStock[0];
  const available = sizes.length ? inStock.length > 0 : isSizeInStock(p, vi, 'OS');

  const price = hasSalePrice(p)
    ? `<span class="quick-add-price-sale">${escapeHTML(formatPriceCardStyle(p.salePrice))}</span><span class="quick-add-price-was">${escapeHTML(formatPriceCardStyle(p.price))}</span>`
    : `<span>${escapeHTML(formatPriceCardStyle(p.price))}</span>`;
  const colours = (p.variants || []).length > 1
    ? `<div class="quick-add-label">Colour: <span>${escapeHTML(variant.color || '')}</span></div><div class="quick-add-swatches">` +
      p.variants.map((v, i) => `<button type="button" class="quick-add-swatch${i === vi ? ' selected' : ''}" style="background:${escapeHTML((v && v.swatch) || '#ccc')}" aria-label="${escapeHTML((v && v.color) || 'Colour ' + (i + 1))}" onclick="quickAddColour(${i})"></button>`).join('') + '</div>'
    : '';
  const sizeRow = sizes.length
    ? `<div class="quick-add-label">Select a size</div><div class="sizes-row">` +
      sizes.map(s => {
        const ok = isSizeInStock(p, vi, s);
        return `<button type="button" class="product-size-btn${_quickAdd.size === s ? ' sel' : ''}${ok ? '' : ' out-of-stock'}" ${ok ? '' : 'disabled aria-label="' + escapeHTML(s) + ', sold out"'} onclick="quickAddSize('${escapeJSString(s)}')">${escapeHTML(s)}</button>`;
      }).join('') + '</div>'
    : '';
  const label = !available ? 'Sold out' : (sizes.length && !_quickAdd.size ? 'Select a size' : 'Add to bag');

  panel.innerHTML = `
    <button type="button" class="quick-add-close" onclick="closeQuickAdd()" aria-label="Close"><i class="ph ph-x"></i></button>
    <div class="quick-add-head">
      <img class="quick-add-img" src="${escapeHTML(img)}" alt="${escapeHTML(p.name || '')}">
      <div class="quick-add-meta">
        <div class="product-brand">${escapeHTML(p.brand || '')}</div>
        <div class="quick-add-name">${escapeHTML(p.name || '')}</div>
        <div class="quick-add-price">${price}</div>
      </div>
    </div>
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
