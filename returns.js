/* ============================================================
   LOG A RETURN — /pages/log-a-return (footer link)
   renderContentPage() (content-pages.js) hands this slug to
   renderReturnsPage(). Two pill tabs: Start a return (order number +
   email, pick items, reason, photos) and Check return status (return
   number + email). server.js / returns-api.js does the checks.
   ?order=JD-123456 starts a return for that order; ?return=RT-123456
   opens its status.
   ============================================================ */

const RETURNS_SLUG = 'log-a-return';
const RETURN_PHOTO_MAX = 6;
let _returnLookup = null;   // { orderNumber, email, items, reasons, returnDays }
let _returnPhotos = [];     // Cloudinary URLs
let _returnUploading = 0;
let _returnEmail = '';      // the email just used, so its status opens straight away

function returnsSavedEmail() {
  const user = firebase.auth().currentUser;
  let saved = '';
  try { saved = localStorage.getItem('janedore_checkout_email') || ''; } catch (e) {}
  return (user && !user.isAnonymous && user.email) || _returnEmail || saved;
}

// Shown under both the Start a return and Check return status tabs.
const RETURNS_POLICY_HTML = `<div class="track-notice returns-policy">
      <strong>How returns work</strong><br>
      1. Select the items you wish to return, give a reason and add photos.<br>
      2. We review your request, together with the brand, and email you our decision.<br>
      3. If approved, we’ll explain how to send the item back. Return delivery is at your cost, unless the item is faulty or incorrect, in which case we’ll arrange collection.<br>
      4. Once we’ve received and checked the item, we refund you to your original payment method.
    </div>`;

function renderReturnsPage(tab) {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const ret = (params.get('return') || '').trim();
  const order = (params.get('order') || '').trim();
  tab = tab || (ret ? 'status' : order ? 'start' : '');
  const email = returnsSavedEmail();
  _returnLookup = null; _returnPhotos = [];

  el.innerHTML = `<section class="track-page returns-page">
    ${tab ? `<button type="button" class="account-back" onclick="history.replaceState(null, null, location.pathname); renderReturnsPage('')"><i class="ph ph-arrow-left" aria-hidden="true"></i> Returns</button>` : ''}
    <h1 class="track-title">Returns</h1>
    <div id="returns-body"></div>
  </section>`;

  const body = document.getElementById('returns-body');
  if (!tab) {
    body.innerHTML = `<nav class="jd-list" aria-label="Returns">
        <button type="button" class="jd-list-row" onclick="renderReturnsPage('start')"><span>Start a return</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
        <button type="button" class="jd-list-row" onclick="renderReturnsPage('status')"><span>Check return status</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
        <button type="button" class="jd-list-row" onclick="navigateToContentPage('exchange-an-item')"><span>Exchange an item instead</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
      </nav>
      ${RETURNS_POLICY_HTML}`;
    return;
  }
  if (tab === 'status') {
    body.innerHTML = `<p class="track-intro">Enter your return number and the email address used at checkout.</p>
      <form class="track-form" onsubmit="submitReturnStatus(event)" novalidate>
        <label class="track-label" for="rs-number">Return number</label>
        <input class="track-input" id="rs-number" placeholder="RT-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(ret)}">
        <label class="track-label" for="rs-email">Email address</label>
        <input class="track-input" id="rs-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}">
        <div class="track-error" id="rs-error" role="alert"></div>
        <button class="track-btn" id="rs-btn" type="submit">Check status</button>
        <p class="track-hint">Your return number begins with RT- and can be found in your return confirmation email.</p>
      </form>
      <div id="rs-result"></div>
      ${RETURNS_POLICY_HTML}`;
    if (ret && email) submitReturnStatus();
    return;
  }

  body.innerHTML = `<p class="track-intro">You can return items within 30 days of delivery. Find your order to choose what you’d like to return. Need a different size or colour instead? <span class="track-link" onclick="navigateToContentPage('exchange-an-item')">Exchange an item</span>.</p>
    <form class="track-form" id="rl-form" onsubmit="submitReturnLookup(event)" novalidate>
      <label class="track-label" for="rl-number">Order number</label>
      <input class="track-input" id="rl-number" placeholder="JD-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(order)}">
      <label class="track-label" for="rl-email">Email address</label>
      <input class="track-input" id="rl-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}">
      <div class="track-error" id="rl-error" role="alert"></div>
      <button class="track-btn" id="rl-btn" type="submit">Find order</button>
    </form>
    <div id="rl-result"></div>
    ${RETURNS_POLICY_HTML}`;
  if (order && email) submitReturnLookup();
}

async function returnsPost(path, payload) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'We couldn’t complete your request. Please try again.');
  return data;
}

function returnsError(id, msg) {
  const e = document.getElementById(id);
  if (e) { e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }
}

// ---------- Start a return ----------

async function submitReturnLookup(ev) {
  if (ev) ev.preventDefault();
  const orderNumber = document.getElementById('rl-number').value.trim();
  const email = document.getElementById('rl-email').value.trim();
  const btn = document.getElementById('rl-btn');
  returnsError('rl-error', '');
  if (!orderNumber || !email) { returnsError('rl-error', 'Please enter your order number and email address.'); return; }
  btn.disabled = true; btn.textContent = 'Searching…';
  try {
    const data = await returnsPost('/api/returns/lookup', { orderNumber, email });
    _returnLookup = Object.assign({ email }, data);
    _returnEmail = email;
    document.getElementById('rl-form').style.display = 'none';
    document.querySelector('.returns-page .track-intro').style.display = 'none';
    renderReturnForm();
  } catch (e) {
    returnsError('rl-error', e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Find order';
  }
}

function renderReturnForm() {
  const box = document.getElementById('rl-result');
  const d = _returnLookup;
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
      for (let n = 1; n <= it.qty; n++) opts += `<option value="${n}"${n === it.qty ? ' selected' : ''}>${n}</option>`;
      qty = `<label class="track-label" for="rq-${it.index}">Quantity to return</label><select class="track-input" id="rq-${it.index}">${opts}</select>`;
    }
    return `<div class="return-item${it.eligible ? '' : ' is-blocked'}" id="ri-${it.index}">
      <label class="return-item-row">
        <input type="checkbox" class="return-check" data-index="${it.index}" ${it.eligible ? '' : 'disabled'} onchange="toggleReturnItem(${it.index}, this.checked)">
        <span class="track-item-img" style="background-image:url('${escapeForCssUrl(thumb)}')"></span>
        <span class="track-item-info"><span class="track-item-name">${escapeHTML(trackPlainText(it.name))}</span>
          <span class="track-item-meta">${escapeHTML(trackPlainText(it.brand))} · ${meta}</span>
          ${it.eligible ? (it.deadline ? `<span class="track-item-meta">Return by ${escapeHTML(trackDate(it.deadline, true))}</span>` : '') : `<span class="return-blocked">${escapeHTML(it.blocked)}</span>`}</span>
      </label>
      <div class="return-item-fields" id="rf-${it.index}" hidden>
        ${qty}
        <label class="track-label" for="rr-${it.index}">Reason for return</label>
        <select class="track-input" id="rr-${it.index}"><option value="">Choose a reason</option>${reasons}</select>
        <label class="track-label" for="rd-${it.index}">Additional details</label>
        <textarea class="track-input return-textarea" id="rd-${it.index}" maxlength="1000" placeholder="Describe the issue, e.g. the fit, the fault, or what was different from the description."></textarea>
      </div>
    </div>`;
  }).join('');

  box.innerHTML = `<div class="track-order-number">Order ${escapeHTML(d.orderNumber)}</div>
    <div class="track-heading">Choose the items to return</div>
    ${items}
    ${anyEligible ? `<div class="account-section-title return-photos-title">Photos</div>
    <p class="account-note return-note">Add up to ${RETURN_PHOTO_MAX} clear photos of the item, showing any damage or fault, and the label or tags.</p>
    <div class="return-photos" id="return-photos"></div>
    <label class="track-label" for="return-note">Additional notes (optional)</label>
    <textarea class="track-input return-textarea" id="return-note" maxlength="1000"></textarea>
    <div class="track-error" id="rsub-error" role="alert"></div>
    <button type="button" class="track-btn" id="rsub-btn" onclick="submitReturnRequest()">Submit return request</button>
    <p class="track-hint">Please don’t send anything back yet. We’ll email you instructions once your request has been reviewed.</p>`
    : `<div class="track-notice">None of the items on this order can be returned at the moment. If you believe this is incorrect, please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span>.</div>`}
    <button type="button" class="track-another" onclick="renderReturnsPage('start')">Find another order</button>`;
  drawReturnPhotos();
}

function toggleReturnItem(index, on) {
  const f = document.getElementById('rf-' + index);
  if (f) f.hidden = !on;
  document.getElementById('ri-' + index)?.classList.toggle('is-selected', on);
}

function drawReturnPhotos() {
  const box = document.getElementById('return-photos');
  if (!box) return;
  box.innerHTML = _returnPhotos.map((u, i) => `<span class="return-photo" style="background-image:url('${escapeForCssUrl(u)}')"><button type="button" aria-label="Remove photo" onclick="removeReturnPhoto(${i})"><i class="ph ph-x"></i></button></span>`).join('') +
    (_returnUploading ? Array.from({ length: _returnUploading }, () => '<span class="return-photo is-loading"><span class="spinner"></span></span>').join('') : '') +
    (_returnPhotos.length + _returnUploading < RETURN_PHOTO_MAX ? `<button type="button" class="return-photo-add" onclick="pickReturnPhotos()"><i class="ph ph-camera" aria-hidden="true"></i><span>Add photos</span></button>` : '');
}

function removeReturnPhoto(i) { _returnPhotos.splice(i, 1); drawReturnPhotos(); }

// Same unsigned Cloudinary upload as the chat's photo button (chat.js).
function pickReturnPhotos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/heic';
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files || []).slice(0, RETURN_PHOTO_MAX - _returnPhotos.length - _returnUploading);
    files.forEach(file => {
      if (file.size > 15 * 1024 * 1024) { returnsError('rsub-error', 'Each photo must be smaller than 15 MB.'); return; }
      _returnUploading++;
      drawReturnPhotos();
      uploadChatImageToCloudinary(file).then(url => { _returnPhotos.push(url); })
        .catch(() => returnsError('rsub-error', 'One of your photos could not be uploaded. Please try again.'))
        .finally(() => { _returnUploading--; drawReturnPhotos(); });
    });
  };
  input.click();
}

async function submitReturnRequest() {
  const d = _returnLookup;
  const btn = document.getElementById('rsub-btn');
  returnsError('rsub-error', '');
  const items = [];
  for (const cb of document.querySelectorAll('.return-check:checked')) {
    const i = Number(cb.dataset.index);
    const it = d.items[i];
    const reason = document.getElementById('rr-' + i).value;
    const details = document.getElementById('rd-' + i).value.trim();
    const qtyEl = document.getElementById('rq-' + i);
    if (!reason) { returnsError('rsub-error', 'Please choose a reason for ' + trackPlainText(it.name) + '.'); return; }
    if (!details) { returnsError('rsub-error', 'Please describe the issue with ' + trackPlainText(it.name) + '.'); return; }
    items.push({ index: i, qty: qtyEl ? Number(qtyEl.value) : 1, reason, details });
  }
  if (!items.length) { returnsError('rsub-error', 'Please choose at least one item to return.'); return; }
  if (_returnUploading) { returnsError('rsub-error', 'Please wait for your photos to finish uploading.'); return; }
  if (!_returnPhotos.length) { returnsError('rsub-error', 'Please add at least one photo of the item.'); return; }
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await returnsPost('/api/returns', { orderNumber: d.orderNumber, email: d.email, items, photos: _returnPhotos, note: document.getElementById('return-note').value.trim() });
    const box = document.getElementById('rl-result');
    box.innerHTML = `<div class="returns-done">
      <div class="checkout-thanks-icon returns-done-icon"><i class="ph ph-check" aria-hidden="true"></i></div>
      <div class="track-heading">Return request received</div>
      <div class="track-order-number">Return ${escapeHTML(res.returnNumber)} · Order ${escapeHTML(d.orderNumber)}</div>
      <p class="track-intro">We’ve emailed you a confirmation. Our team will review your request and email you with the next steps. Please keep the item, with its tags and packaging, until then.</p>
      <button type="button" class="track-btn" onclick="openReturnStatus('${escapeJSString(res.returnNumber)}')">Check return status</button>
    </div>`;
    document.querySelector('.returns-policy')?.remove();
    resetScrollToTop();
  } catch (e) {
    returnsError('rsub-error', e.message);
    btn.disabled = false; btn.textContent = 'Submit return request';
  }
}

function openReturnStatus(number) {
  history.replaceState(null, null, '/pages/' + RETURNS_SLUG + '?return=' + encodeURIComponent(number));
  renderReturnsPage('status');
}

// ---------- Check return status ----------

async function submitReturnStatus(ev) {
  if (ev) ev.preventDefault();
  const returnNumber = document.getElementById('rs-number').value.trim();
  const email = document.getElementById('rs-email').value.trim();
  const btn = document.getElementById('rs-btn');
  returnsError('rs-error', '');
  if (!returnNumber || !email) { returnsError('rs-error', 'Please enter your return number and email address.'); return; }
  btn.disabled = true; btn.textContent = 'Searching…';
  try {
    const r = await returnsPost('/api/returns/status', { returnNumber, email });
    _returnEmail = email;
    document.querySelector('#returns-body .track-form').style.display = 'none';
    document.querySelector('#returns-body .track-intro').style.display = 'none';
    document.getElementById('rs-result').innerHTML = returnStatusHtml(r);
  } catch (e) {
    returnsError('rs-error', e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Check status';
  }
}

function returnStatusHtml(r) {
  const declined = r.status === 'declined';
  // How far along: 0 received, 1 approved, 2 item received, 3 refunded.
  // A refund in progress keeps "Refunded" as the current step.
  const reached = { submitted: 0, approved: 1, received: 2, refund_pending: 2, refunded: 3, closed: 3 }[r.status] || 0;
  const labels = declined ? ['Request received', 'Reviewed', 'Declined'] : ['Request received', 'Approved', 'Item received', 'Refunded'];
  const steps = labels.map((label, i) => {
    const state = declined || i <= reached ? 'done' : i === reached + 1 ? 'current' : '';
    return `<div class="track-step ${state}"><span class="track-step-dot">${state === 'done' ? '<i class="ph ph-check" aria-hidden="true"></i>' : ''}</span><span class="track-step-label">${label}</span></div>`;
  }).join('<div class="track-step-line"></div>');

  const heading = {
    submitted: 'Your return is under review', approved: 'Your return has been approved', declined: 'Your return was not approved',
    received: 'We’ve received your return', refund_pending: 'Refund in progress', refunded: 'Refund completed', closed: 'Return closed'
  }[r.status] || 'Your return';
  const amount = formatPrice(r.refundAmount || 0);
  const notice = {
    submitted: 'We’re reviewing your request with the brand. We’ll email you with our decision and the next steps. Please don’t send anything back yet.',
    approved: r.shipping === 'collection'
      ? 'We’ll arrange a courier to collect the item from you at no cost, and contact you to confirm a collection date.'
      : 'Please send the item back at your own cost, using a tracked delivery service. Keep your proof of postage.',
    declined: r.declineReason || '',
    received: `We’ve received your item and will process your refund of ${amount}. We’ll email you once it has been completed.`,
    refund_pending: `We’re processing your refund of ${amount}. We’ll email you as soon as it has been completed.`,
    refunded: `Your refund of ${amount} has been completed and returned to your original payment method. It can take up to 10 business days to reflect.`,
    closed: 'This return has been closed. If you have any questions, please contact customer care.'
  }[r.status] || '';
  const items = (r.items || []).map(it => {
    const product = PRODUCTS.find(p => p.id === it.productId);
    const thumb = product ? getProductThumbnail(product, it.variantIndex) : PLACEHOLDER_IMAGE;
    return `<div class="track-item"><div class="track-item-img" style="background-image:url('${escapeForCssUrl(thumb)}')"></div>
      <div class="track-item-info"><div class="track-item-name">${escapeHTML(trackPlainText(it.name))}</div>
      <div class="track-item-meta">${escapeHTML(trackPlainText(it.brand))} · Qty ${it.qty} · ${escapeHTML(it.reason || '')}</div></div></div>`;
  }).join('');
  return `<div class="track-result">
    <div class="track-order-number">Return ${escapeHTML(r.returnNumber)} · Order ${escapeHTML(r.orderNumber)}</div>
    ${r.createdAt ? `<div class="track-order-meta">Requested ${escapeHTML(trackDate(r.createdAt, true))}</div>` : ''}
    <div class="track-heading">${escapeHTML(heading)}</div>
    <div class="track-card">
      <div class="track-steps">${steps}</div>
      ${notice ? `<p class="track-wait">${declined ? '<strong>Reason:</strong> ' : ''}${escapeHTML(notice)}</p>` : ''}
      ${r.status === 'approved' && r.message ? `<div class="return-instructions"><div class="account-detail-title">${r.shipping === 'collection' ? 'Collection details' : 'Return instructions'}</div>${escapeHTML(r.message)}</div>` : ''}
    </div>
    <div class="track-card"><div class="account-detail-title">Items</div>${items}
      ${['received', 'refund_pending', 'refunded'].includes(r.status) ? `<div class="account-row big return-refund-row"><span>Refund amount</span><span>${amount}</span></div>` : ''}
    </div>
    <p class="account-help">Questions about your return? <span class="track-link" onclick="navigateToContentPage('customer-care')">Contact customer care</span> and quote ${escapeHTML(r.returnNumber)}.</p>
  </div>`;
}
