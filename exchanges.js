/* ============================================================
   EXCHANGE AN ITEM: /pages/exchange-an-item
   content-pages.js hands this slug to renderExchangesPage(). Built like
   Log a return (returns.js): two pill tabs, Exchange an item (order
   number + email, pick items, what you'd like instead, reason, photos)
   and Check exchange status (exchange number + email).
   exchanges-api.js does the checks. Exchanges never become refunds, so
   nothing here mentions one. Who pays postage follows the reason (see
   EXCHANGE_POLICY_HTML).
   ?order=JD-123456 starts an exchange for that order; ?exchange=EX-123456
   opens its status. Reuses the returns and Track your order styles and
   the photo uploader helpers' pattern.
   ============================================================ */

const EXCHANGES_SLUG = 'exchange-an-item';
const EXCHANGE_PHOTO_MAX = 6;
let _exchangeLookup = null;   // { orderNumber, email, items, reasons, ourFault, days }
let _exchangePhotos = [];
let _exchangeUploading = 0;
let _exchangeEmail = '';

const EXCHANGE_POLICY_HTML = `<div class="track-notice returns-policy">
      <strong>How exchanges work</strong><br>
      1. Choose the item, the size or colour you’d like instead, and tell us why.<br>
      2. We review your request with the brand and email you our decision. Once approved, your new item is set aside for you.<br>
      3. Send the item back as instructed. If we sent the wrong size or item, or it arrived damaged or faulty, postage is on us. If the item was sent as ordered, postage both ways is at your cost.<br>
      4. Once the brand has received the item, your new one is dispatched with tracking.
    </div>`;

function renderExchangesPage(tab) {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const ex = (params.get('exchange') || '').trim();
  const order = (params.get('order') || '').trim();
  tab = tab || (ex ? 'status' : order ? 'start' : '');
  const email = (typeof returnsSavedEmail === 'function' ? returnsSavedEmail() : '') || _exchangeEmail;
  _exchangeLookup = null; _exchangePhotos = [];

  el.innerHTML = `<section class="track-page returns-page exchanges-page">
    ${tab ? `<button type="button" class="account-back" onclick="history.replaceState(null, null, location.pathname); renderExchangesPage('')"><i class="ph ph-arrow-left" aria-hidden="true"></i> Exchanges</button>` : ''}
    <h1 class="track-title">Exchanges</h1>
    <div id="exchanges-body"></div>
  </section>`;

  const body = document.getElementById('exchanges-body');
  if (!tab) {
    body.innerHTML = `<nav class="jd-list" aria-label="Exchanges">
        <button type="button" class="jd-list-row" onclick="renderExchangesPage('start')"><span>Exchange an item</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
        <button type="button" class="jd-list-row" onclick="renderExchangesPage('status')"><span>Check exchange status</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
        <button type="button" class="jd-list-row" onclick="navigateToContentPage('log-a-return')"><span>Return an item instead</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
      </nav>
      ${EXCHANGE_POLICY_HTML}`;
    return;
  }
  if (tab === 'status') {
    body.innerHTML = `<p class="track-intro">Enter your exchange number and the email address used at checkout.</p>
      <form class="track-form" onsubmit="submitExchangeStatus(event)" novalidate>
        <label class="track-label" for="xs-number">Exchange number</label>
        <input class="track-input" id="xs-number" placeholder="EX-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(ex)}">
        <label class="track-label" for="xs-email">Email address</label>
        <input class="track-input" id="xs-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}">
        <div class="track-error" id="xs-error" role="alert"></div>
        <button class="track-btn" id="xs-btn" type="submit">Check status</button>
        <p class="track-hint">Your exchange number begins with EX- and can be found in your exchange confirmation email.</p>
      </form>
      <div id="xs-result"></div>
      ${EXCHANGE_POLICY_HTML}`;
    if (ex && email) submitExchangeStatus();
    return;
  }

  body.innerHTML = `<p class="track-intro">You can exchange an item for another size or colour within 30 days of dispatch. Find your order to get started.</p>
    <form class="track-form" id="xl-form" onsubmit="submitExchangeLookup(event)" novalidate>
      <label class="track-label" for="xl-number">Order number</label>
      <input class="track-input" id="xl-number" placeholder="JD-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(order)}">
      <label class="track-label" for="xl-email">Email address</label>
      <input class="track-input" id="xl-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}">
      <div class="track-error" id="xl-error" role="alert"></div>
      <button class="track-btn" id="xl-btn" type="submit">Find order</button>
    </form>
    <div id="xl-result"></div>
    ${EXCHANGE_POLICY_HTML}`;
  if (order && email) submitExchangeLookup();
}

function exchangesError(id, msg) {
  const e = document.getElementById(id);
  if (e) { e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }
}

async function exchangesPost(path, payload) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// ---------- Exchange an item ----------

async function submitExchangeLookup(ev) {
  if (ev) ev.preventDefault();
  const orderNumber = document.getElementById('xl-number').value.trim();
  const email = document.getElementById('xl-email').value.trim();
  const btn = document.getElementById('xl-btn');
  exchangesError('xl-error', '');
  if (!orderNumber || !email) { exchangesError('xl-error', 'Please enter your order number and email address.'); return; }
  btn.disabled = true; btn.textContent = 'Searching…';
  try {
    const data = await exchangesPost('/api/exchanges/lookup', { orderNumber, email });
    _exchangeLookup = Object.assign({ email }, data);
    _exchangeEmail = email;
    document.getElementById('xl-form').style.display = 'none';
    document.querySelector('.exchanges-page .track-intro').style.display = 'none';
    renderExchangeForm();
  } catch (e) {
    exchangesError('xl-error', e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Find order';
  }
}

// The colour and size pickers for one item, from what the server says
// is in stock. Out of stock sizes stay visible but can't be chosen.
function exchangeOptionsHtml(it) {
  const opts = it.options || [];
  if (!opts.length) return `<p class="return-blocked">This item can’t be exchanged online. Please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span>.</p>`;
  const current = opts[it.variantIndex] ? it.variantIndex : 0;
  const colour = opts.length > 1
    ? `<label class="track-label" for="xc-${it.index}">Colour</label>
       <select class="track-input" id="xc-${it.index}" onchange="drawExchangeSizes(${it.index})">${opts.map(o => `<option value="${o.variantIndex}"${o.variantIndex === current ? ' selected' : ''}>${escapeHTML(o.color || 'Colour ' + (o.variantIndex + 1))}</option>`).join('')}</select>`
    : `<input type="hidden" id="xc-${it.index}" value="${current}">`;
  return colour + `<div id="xsz-${it.index}"></div>`;
}

function drawExchangeSizes(index) {
  const it = _exchangeLookup && _exchangeLookup.items[index];
  const box = document.getElementById('xsz-' + index);
  if (!it || !box) return;
  const vi = Number(document.getElementById('xc-' + index).value) || 0;
  const opt = (it.options || []).find(o => o.variantIndex === vi);
  const sizes = opt ? opt.sizes : [];
  if (sizes.length === 1 && sizes[0].size === 'OS') {
    box.innerHTML = sizes[0].inStock ? `<input type="hidden" id="xs-${index}" value="OS">`
      : `<input type="hidden" id="xs-${index}" value=""><p class="return-blocked">This colour is out of stock at the moment.</p>`;
    return;
  }
  box.innerHTML = `<label class="track-label" for="xs-${index}">Size you’d like</label>
    <select class="track-input" id="xs-${index}"><option value="">Choose a size</option>${sizes.map(s => `<option value="${escapeHTML(s.size)}"${s.inStock ? '' : ' disabled'}>${escapeHTML(s.size)}${s.inStock ? '' : ' (out of stock)'}</option>`).join('')}</select>`;
}

function exchangePostageHint(index) {
  const reason = document.getElementById('xr-' + index).value;
  const hint = document.getElementById('xp-' + index);
  if (!hint) return;
  if (!reason) { hint.textContent = ''; return; }
  hint.textContent = (_exchangeLookup.ourFault || []).includes(reason)
    ? 'Postage is on us for this exchange. Please add photos showing the issue.'
    : 'As the item was sent as ordered, postage both ways is at your cost.';
}

function renderExchangeForm() {
  const box = document.getElementById('xl-result');
  const d = _exchangeLookup;
  if (!box || !d) return;
  const anyEligible = d.items.some(i => i.eligible);
  const reasons = d.reasons.map(r => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join('');
  const items = d.items.map(it => {
    const product = PRODUCTS.find(p => p.id === it.productId);
    const thumb = product ? getProductThumbnail(product, it.variantIndex) : PLACEHOLDER_IMAGE;
    const meta = [it.color && it.color !== 'Default' ? it.color : '', it.size && it.size !== 'OS' ? 'Size ' + it.size : '', 'Qty ' + it.ordered].filter(Boolean).map(escapeHTML).join(' · ');
    let qty = '';
    if (it.eligible && it.qty > 1) {
      let opts = '';
      for (let n = 1; n <= it.qty; n++) opts += `<option value="${n}"${n === 1 ? ' selected' : ''}>${n}</option>`;
      qty = `<label class="track-label" for="xq-${it.index}">Quantity to exchange</label><select class="track-input" id="xq-${it.index}">${opts}</select>`;
    }
    return `<div class="return-item${it.eligible ? '' : ' is-blocked'}" id="xi-${it.index}">
      <label class="return-item-row">
        <input type="checkbox" class="exchange-check" data-index="${it.index}" ${it.eligible ? '' : 'disabled'} onchange="toggleExchangeItem(${it.index}, this.checked)">
        <span class="track-item-img" style="background-image:url('${escapeForCssUrl(thumb)}')"></span>
        <span class="track-item-info"><span class="track-item-name">${escapeHTML(trackPlainText(it.name))}</span>
          <span class="track-item-meta">${escapeHTML(trackPlainText(it.brand))} · ${meta}</span>
          ${it.eligible ? (it.deadline ? `<span class="track-item-meta">Exchange by ${escapeHTML(trackDate(it.deadline, true))}</span>` : '') : `<span class="return-blocked">${escapeHTML(it.blocked)}</span>`}</span>
      </label>
      <div class="return-item-fields" id="xf-${it.index}" hidden>
        ${qty}
        ${exchangeOptionsHtml(it)}
        <label class="track-label" for="xr-${it.index}">Reason for exchange</label>
        <select class="track-input" id="xr-${it.index}" onchange="exchangePostageHint(${it.index})"><option value="">Choose a reason</option>${reasons}</select>
        <p class="track-hint exchange-postage" id="xp-${it.index}" aria-live="polite"></p>
        <label class="track-label" for="xd-${it.index}">Tell us more (optional)</label>
        <textarea class="track-input return-textarea" id="xd-${it.index}" maxlength="1000" placeholder="For example, how the fit felt, or what was wrong with the item."></textarea>
      </div>
    </div>`;
  }).join('');

  box.innerHTML = `<div class="track-order-number">Order ${escapeHTML(d.orderNumber)}</div>
    <div class="track-heading">Choose the items to exchange</div>
    ${items}
    ${anyEligible ? `<div class="account-section-title return-photos-title">Photos</div>
    <p class="account-note return-note">Required if we sent the wrong size or item, or it arrived damaged or faulty. Add up to ${EXCHANGE_PHOTO_MAX} clear photos of the item and its label or tags.</p>
    <div class="return-photos" id="exchange-photos"></div>
    <label class="track-label" for="exchange-note">Anything else we should know? (optional)</label>
    <textarea class="track-input return-textarea" id="exchange-note" maxlength="1000"></textarea>
    <div class="track-error" id="xsub-error" role="alert"></div>
    <button type="button" class="track-btn" id="xsub-btn" onclick="submitExchangeRequest()">Submit exchange request</button>
    <p class="track-hint">Please don’t send anything back yet. We’ll email you instructions once your request has been reviewed.</p>`
    : `<div class="track-notice">None of the items on this order can be exchanged at the moment. If you think this is a mistake, please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span>.</div>`}
    <button type="button" class="track-another" onclick="renderExchangesPage('start')">Use a different order</button>`;
  d.items.forEach(it => { if (it.eligible && (it.options || []).length) drawExchangeSizes(it.index); });
  drawExchangePhotos();
}

function toggleExchangeItem(index, on) {
  const f = document.getElementById('xf-' + index);
  if (f) f.hidden = !on;
  document.getElementById('xi-' + index)?.classList.toggle('is-selected', on);
}

function drawExchangePhotos() {
  const box = document.getElementById('exchange-photos');
  if (!box) return;
  box.innerHTML = _exchangePhotos.map((u, i) => `<span class="return-photo" style="background-image:url('${escapeForCssUrl(u)}')"><button type="button" aria-label="Remove photo" onclick="removeExchangePhoto(${i})"><i class="ph ph-x"></i></button></span>`).join('') +
    (_exchangeUploading ? Array.from({ length: _exchangeUploading }, () => '<span class="return-photo is-loading"><span class="spinner"></span></span>').join('') : '') +
    (_exchangePhotos.length + _exchangeUploading < EXCHANGE_PHOTO_MAX ? `<button type="button" class="return-photo-add" onclick="pickExchangePhotos()"><i class="ph ph-camera" aria-hidden="true"></i><span>Add photos</span></button>` : '');
}

function removeExchangePhoto(i) { _exchangePhotos.splice(i, 1); drawExchangePhotos(); }

// Same customer Cloudinary upload as returns and chat (chat.js).
function pickExchangePhotos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/heic';
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files || []).slice(0, EXCHANGE_PHOTO_MAX - _exchangePhotos.length - _exchangeUploading);
    files.forEach(file => {
      if (file.size > 15 * 1024 * 1024) { exchangesError('xsub-error', 'Each photo must be smaller than 15 MB.'); return; }
      _exchangeUploading++;
      drawExchangePhotos();
      uploadChatImageToCloudinary(file).then(url => { _exchangePhotos.push(url); })
        .catch(() => exchangesError('xsub-error', 'A photo didn’t upload. Please try again.'))
        .finally(() => { _exchangeUploading--; drawExchangePhotos(); });
    });
  };
  input.click();
}

async function submitExchangeRequest() {
  const d = _exchangeLookup;
  const btn = document.getElementById('xsub-btn');
  exchangesError('xsub-error', '');
  const items = [];
  let needsPhotos = false;
  for (const cb of document.querySelectorAll('.exchange-check:checked')) {
    const i = Number(cb.dataset.index);
    const it = d.items[i];
    const name = trackPlainText(it.name);
    const colourEl = document.getElementById('xc-' + i);
    const sizeEl = document.getElementById('xs-' + i);
    const reason = document.getElementById('xr-' + i).value;
    const qtyEl = document.getElementById('xq-' + i);
    if (!colourEl || !sizeEl || !sizeEl.value) { exchangesError('xsub-error', 'Please choose the size you’d like instead of ' + name + '.'); return; }
    if (!reason) { exchangesError('xsub-error', 'Please choose a reason for ' + name + '.'); return; }
    const ourFault = (d.ourFault || []).includes(reason);
    const wantVariantIndex = Number(colourEl.value) || 0;
    if (!ourFault && wantVariantIndex === (it.variantIndex || 0) && sizeEl.value === (it.size || 'OS')) {
      exchangesError('xsub-error', 'Please choose a different size or colour for ' + name + '.'); return;
    }
    if (ourFault) needsPhotos = true;
    items.push({ index: i, qty: qtyEl ? Number(qtyEl.value) : 1, reason, wantVariantIndex, wantSize: sizeEl.value, details: document.getElementById('xd-' + i).value.trim() });
  }
  if (!items.length) { exchangesError('xsub-error', 'Please choose at least one item to exchange.'); return; }
  if (_exchangeUploading) { exchangesError('xsub-error', 'Please wait for your photos to finish uploading.'); return; }
  if (needsPhotos && !_exchangePhotos.length) { exchangesError('xsub-error', 'Please add at least one photo showing the issue with the item.'); return; }
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await exchangesPost('/api/exchanges', { orderNumber: d.orderNumber, email: d.email, items, photos: _exchangePhotos, note: document.getElementById('exchange-note').value.trim() });
    document.getElementById('xl-result').innerHTML = `<div class="returns-done">
      <div class="checkout-thanks-icon returns-done-icon"><i class="ph ph-check" aria-hidden="true"></i></div>
      <div class="track-heading">Exchange request received</div>
      <div class="track-order-number">Exchange ${escapeHTML(res.exchangeNumber)} · Order ${escapeHTML(d.orderNumber)}</div>
      <p class="track-intro">We’ve emailed you a confirmation. Our team will review your request with the brand and email you with the next steps. Please keep the item, with its tags and packaging, until then.</p>
      <button type="button" class="track-btn" onclick="openExchangeStatus('${escapeJSString(res.exchangeNumber)}')">Check exchange status</button>
    </div>`;
    document.querySelector('.exchanges-page .returns-policy')?.remove();
    resetScrollToTop();
  } catch (e) {
    exchangesError('xsub-error', e.message);
    btn.disabled = false; btn.textContent = 'Submit exchange request';
  }
}

function openExchangeStatus(number) {
  history.replaceState(null, null, '/pages/' + EXCHANGES_SLUG + '?exchange=' + encodeURIComponent(number));
  renderExchangesPage('status');
}

// ---------- Check exchange status ----------

async function submitExchangeStatus(ev) {
  if (ev) ev.preventDefault();
  const exchangeNumber = document.getElementById('xs-number').value.trim();
  const email = document.getElementById('xs-email').value.trim();
  const btn = document.getElementById('xs-btn');
  exchangesError('xs-error', '');
  if (!exchangeNumber || !email) { exchangesError('xs-error', 'Please enter your exchange number and email address.'); return; }
  btn.disabled = true; btn.textContent = 'Searching…';
  try {
    const x = await exchangesPost('/api/exchanges/status', { exchangeNumber, email });
    _exchangeEmail = email;
    document.querySelector('#exchanges-body .track-form').style.display = 'none';
    document.querySelector('#exchanges-body .track-intro').style.display = 'none';
    document.getElementById('xs-result').innerHTML = exchangeStatusHtml(x);
  } catch (e) {
    exchangesError('xs-error', e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Check status';
  }
}

function exchangeWantText(it) {
  return [it.wantColor && it.wantColor !== 'Default' ? it.wantColor : '', it.wantSize && it.wantSize !== 'OS' ? 'Size ' + it.wantSize : ''].filter(Boolean).join(', ') || 'A replacement';
}

function exchangeStatusHtml(x) {
  const declined = x.status === 'declined';
  const reached = { submitted: 0, approved: 1, received: 2, dispatched: 3, closed: 3 }[x.status] || 0;
  const labels = declined ? ['Request received', 'Reviewed', 'Declined'] : ['Request received', 'Approved', 'Item received', 'New item sent'];
  const steps = labels.map((label, i) => {
    const state = declined || i <= reached ? 'done' : i === reached + 1 ? 'current' : '';
    return `<div class="track-step ${state}"><span class="track-step-dot">${state === 'done' ? '<i class="ph ph-check" aria-hidden="true"></i>' : ''}</span><span class="track-step-label">${label}</span></div>`;
  }).join('<div class="track-step-line"></div>');
  const heading = {
    submitted: 'Your exchange is under review', approved: 'Your exchange has been approved', declined: 'Your exchange was not approved',
    received: 'We’ve received your item', dispatched: 'Your new item is on its way', closed: 'Exchange closed'
  }[x.status] || 'Your exchange';
  const postage = x.postage === 'janedore'
    ? 'Postage is on us: we’ll arrange collection of the item and send your new one at no cost to you.'
    : 'Postage both ways is at your cost.';
  const notice = {
    submitted: 'We’re reviewing your request with the brand and will email you our decision. Please don’t send anything back yet.',
    approved: 'Your new item has been set aside for you. ' + postage + ' Please follow the instructions below.',
    declined: x.declineReason || '',
    received: 'The brand has received your item. We’ll email you as soon as your new one is on its way.',
    dispatched: 'Your new item has been dispatched. You can follow it with the tracking details below.',
    closed: 'This exchange has been closed. If you have any questions, please contact customer care.'
  }[x.status] || '';
  const items = (x.items || []).map(it => {
    const product = PRODUCTS.find(p => p.id === it.productId);
    const thumb = product ? getProductThumbnail(product, it.variantIndex) : PLACEHOLDER_IMAGE;
    return `<div class="track-item"><div class="track-item-img" style="background-image:url('${escapeForCssUrl(thumb)}')"></div>
      <div class="track-item-info"><div class="track-item-name">${escapeHTML(trackPlainText(it.name))}</div>
      <div class="track-item-meta">${escapeHTML(trackPlainText(it.brand))} · Qty ${it.qty} · ${escapeHTML(it.reason || '')}</div>
      <div class="track-item-meta"><strong>Exchange for:</strong> ${escapeHTML(exchangeWantText(it))}</div></div></div>`;
  }).join('');
  return `<div class="track-result">
    <div class="track-order-number">Exchange ${escapeHTML(x.exchangeNumber)} · Order ${escapeHTML(x.orderNumber)}</div>
    ${x.createdAt ? `<div class="track-order-meta">Requested ${escapeHTML(trackDate(x.createdAt, true))}</div>` : ''}
    <div class="track-heading">${escapeHTML(heading)}</div>
    <div class="track-card">
      <div class="track-steps">${steps}</div>
      ${notice ? `<p class="track-wait">${declined ? '<strong>Reason:</strong> ' : ''}${escapeHTML(notice)}</p>` : ''}
      ${x.status === 'approved' && x.message ? `<div class="return-instructions"><div class="account-detail-title">Instructions</div>${escapeHTML(x.message)}</div>` : ''}
      ${x.status === 'dispatched' && x.trackingNumber ? `<div class="return-instructions"><div class="account-detail-title">Tracking</div>${escapeHTML(x.courier || '')} · ${escapeHTML(x.trackingNumber)}</div>` : ''}
    </div>
    <div class="track-card"><div class="account-detail-title">Items</div>${items}</div>
    <p class="account-help">Questions about your exchange? <span class="track-link" onclick="navigateToContentPage('customer-care')">Contact customer care</span> and quote ${escapeHTML(x.exchangeNumber)}.</p>
  </div>`;
}

window.renderExchangesPage = renderExchangesPage;
