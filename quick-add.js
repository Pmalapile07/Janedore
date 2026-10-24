// Card actions: the heart-and-plus icon on product cards (collection.js
// productCard, productCardHome) opens a sheet with three choices: Add to
// bag, Add to (or Remove from) wishlist, View full details. Add to bag
// turns the sheet into quick add: the product's photo, price, colours
// and sizes, so shoppers can add it without leaving the page they're on.
// Adding uses the same addToCart() as the product page (cart.js), so
// stock limits and the "Added to bag" bar work the same way.

let _quickAdd = null; // { id, vi, size }

// Google's Material Symbols heart_plus (loaded in index.html), the same
// icon Superbalist uses. It stays an outline whether or not the product
// is wished; the sheet says Add to or Remove from wishlist.
function cardActionButtonHtml(p) {
  return `<button type="button" class="product-card-action" aria-label="Options for ${escapeHTML(p.name || '')}" onclick="event.stopPropagation();openCardActions('${escapeJSString(p.id)}')"><span class="material-symbols-outlined ms-icon card-action-icon" aria-hidden="true">heart_plus</span></button>`;
}

// Material Symbols icons (the wishlist heart, heart_plus) stay hidden
// (styles.css .ms-icon) until their font has loaded, so their names never
// show in their place.
if (document.fonts && document.fonts.load) {
  document.fonts.load('24px "Material Symbols Outlined"', 'favorite heart_plus')
    .then(f => { if (f.length) document.documentElement.classList.add('ms-ready'); })
    .catch(() => {});
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
// Each view (the choices, then quick add) starts at the top of the sheet.
function showQuickAddSheet(sheet) {
  const panel = sheet.querySelector('.quick-add-panel');
  if (panel) panel.scrollTop = 0;
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
  // Add to bag (black) over Add to wishlist (outlined), then the link to
  // the product page, like the quick add view below.
  panel.innerHTML = quickAddHeadHtml(p, vi) +
    // Sold out: the waitlist when the product has one (admin > Waitlist
    // when sold out), as on the product page.
    ((p.stock ?? 0) > 0
      ? `<button type="button" class="quick-add-submit" onclick="openQuickAdd('${id}')">Add to bag</button>`
      : p.waitlist
        ? `<button type="button" class="quick-add-submit" onclick="openQuickAdd('${id}')">Notify me when available</button>`
        : `<button type="button" class="quick-add-submit" disabled>${isPreorderProduct(p) ? 'Pre-orders full' : 'Sold out'}</button>`) +
    `<button type="button" class="quick-add-secondary" onclick="closeQuickAdd();toggleWish('${id}')">${wished ? 'Remove from wishlist' : 'Add to wishlist'}</button>` +
    `<button type="button" class="quick-add-details" onclick="closeQuickAdd();S.productVariantSelections['${id}']=${vi};goToProduct('${id}')">View full details</button>`;
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
  // Keep the picked size only while it's in stock in this colour (or the
  // product has a waitlist, whose sold-out sizes can be picked); a
  // product with one size in stock has it picked already.
  if (_quickAdd.size && !p.waitlist && !isSizeInStock(p, vi, _quickAdd.size)) _quickAdd.size = null;
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
        const selectable = ok || p.waitlist;
        return `<button type="button" class="product-size-btn${_quickAdd.size === s ? ' sel' : ''}${ok ? '' : ' out-of-stock'}" ${selectable ? '' : 'disabled'}${ok ? '' : ' aria-label="' + escapeHTML(s) + ', sold out"'} onclick="quickAddSize('${escapeJSString(s)}')">${escapeHTML(s)}</button>`;
      }).join('') + '</div>'
    : '';
  // A sold-out pick on a product with a waitlist: Notify me, with an
  // email field for guests right here (no signing in needed).
  const pickedOut = sizes.length ? (_quickAdd.size && !isSizeInStock(p, vi, _quickAdd.size)) : !available;
  const notify = pickedOut && p.waitlist;
  const label = sizes.length && !_quickAdd.size ? 'Select a size'
    : notify ? 'Notify me'
    : pickedOut ? (isPreorderProduct(p) ? 'Pre-orders full' : 'Sold out')
    : 'Add to bag';
  let notifyHtml = '';
  if (notify) {
    const user = firebase.auth().currentUser;
    const signedIn = user && !user.isAnonymous;
    const what = sizes.length ? 'This size is sold out.' : 'This item is sold out.';
    if (_quickAdd.email === undefined) {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(WAITLIST_CONTACT_KEY) || '{}') || {}; } catch (e) {}
      _quickAdd.email = saved.email || '';
    }
    notifyHtml = `<div class="quick-add-section">
      <div class="quick-add-label">Notify me when it’s back</div>
      <p class="quick-add-note">${what} ${signedIn ? `We’ll email you at ${escapeHTML(user.email || '')} as soon as it’s back in stock.` : 'Enter your email address and we’ll let you know as soon as it’s back in stock.'}</p>
      ${signedIn ? '' : `<input class="track-input quick-add-email" id="qa-notify-email" type="email" autocomplete="email" inputmode="email" placeholder="Email address" maxlength="200" value="${escapeHTML(_quickAdd.email)}" oninput="_quickAdd.email=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddSubmit()}">`}
      <p class="track-error" id="qa-notify-error"></p>
    </div>`;
  }

  panel.innerHTML = quickAddHeadHtml(p, vi) + `
    ${colours ? `<div class="quick-add-section">${colours}</div>` : ''}
    ${sizeRow ? `<div class="quick-add-section">${sizeRow}</div>` : ''}
    ${notifyHtml}
    <button type="button" class="quick-add-submit" id="qa-submit" onclick="quickAddSubmit()" ${label === 'Add to bag' || label === 'Notify me' ? '' : 'disabled'}>${label}</button>
    <button type="button" class="quick-add-details" onclick="closeQuickAdd();S.productVariantSelections['${escapeJSString(p.id)}']=${vi};goToProduct('${escapeJSString(p.id)}')">View full details</button>`;
}

function quickAddColour(i) { _quickAdd.vi = i; renderQuickAdd(); }
function quickAddSize(s) { _quickAdd.size = s; renderQuickAdd(); }

async function quickAddSubmit() {
  const p = _quickAdd && PRODUCTS.find(x => x.id === _quickAdd.id);
  if (!p) return;
  if (quickAddSizes(p).length && !_quickAdd.size) return;
  // addToCart() and the waitlist use the colour picked for this product.
  S.productVariantSelections[p.id] = _quickAdd.vi;
  const size = _quickAdd.size || 'OS';
  if (!(p.waitlist && !isSizeInStock(p, _quickAdd.vi, size))) {
    closeQuickAdd();
    addToCart(p.id, size, 1);
    return;
  }
  // The waitlist, right here: signed-in customers by their account, guests
  // by the email they typed (postWaitlist, product-detail.js).
  S.selectedSize = size === 'OS' ? null : size;
  const err = document.getElementById('qa-notify-error');
  const btn = document.getElementById('qa-submit');
  const fail = (msg) => { if (err) { err.textContent = msg; err.style.display = 'block'; } };
  const user = firebase.auth().currentUser;
  const signedIn = user && !user.isAnonymous;
  const email = String(_quickAdd.email || '').trim().toLowerCase();
  if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');
  if (err) err.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    if (signedIn) await postWaitlist(p, { name: user.displayName || '' }, await user.getIdToken());
    else {
      await postWaitlist(p, { email });
      try { localStorage.setItem(WAITLIST_CONTACT_KEY, JSON.stringify({ email })); } catch (e) {}
    }
    closeQuickAdd();
    showAddedToCartToast(signedIn ? 'Added to your waitlist' : 'We’ll email you when it’s back in stock', 'ph-check-circle');
  } catch (e) {
    fail(e.message);
    if (btn) btn.disabled = false;
  }
}
