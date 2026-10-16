/* ============================================================
   TRACK YOUR ORDER — /pages/track-your-order (footer link)
   renderContentPage() (content-pages.js) hands this slug to
   renderTrackOrderPage() instead of a Firestore page. The customer
   enters their order number and checkout email; server.js
   /api/track-order checks both and returns one package per brand.
   /pages/track-your-order?order=JD-123456 fills in the number (the
   shipped email links here).
   ============================================================ */

const TRACK_ORDER_SLUG = 'track-your-order';

function renderTrackOrderPage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const user = firebase.auth().currentUser;
  let savedEmail = '';
  try { savedEmail = localStorage.getItem('janedore_checkout_email') || ''; } catch (e) {}
  const email = (user && !user.isAnonymous && user.email) || savedEmail;
  const number = (params.get('order') || '').trim();

  el.innerHTML = `
    <section class="track-page">
      <h1 class="track-title">Track Your Order</h1>
      <p class="track-intro">Enter your order number and the email you used at checkout.</p>
      <form class="track-form" id="track-form" onsubmit="submitTrackOrder(event)" novalidate>
        <label class="track-label" for="track-number">Order number</label>
        <input class="track-input" id="track-number" type="text" placeholder="JD-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(number)}" required>
        <label class="track-label" for="track-email">Email</label>
        <input class="track-input" id="track-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}" required>
        <div class="track-error" id="track-error" role="alert"></div>
        <button class="track-btn" id="track-btn" type="submit">Track Order</button>
        <p class="track-hint">Your order number starts with JD- and is in your order confirmation email.</p>
      </form>
      <div id="track-result"></div>
    </section>`;
  if (number && email) submitTrackOrder();
}

async function submitTrackOrder(e) {
  if (e) e.preventDefault();
  const numberEl = document.getElementById('track-number');
  const emailEl = document.getElementById('track-email');
  const errorEl = document.getElementById('track-error');
  const btn = document.getElementById('track-btn');
  if (!numberEl || !emailEl) return;
  const orderNumber = numberEl.value.trim();
  const email = emailEl.value.trim();
  const showError = (msg) => { errorEl.textContent = msg; errorEl.style.display = msg ? 'block' : 'none'; };
  showError('');
  if (!orderNumber || !email) { showError('Please enter your order number and email.'); return; }

  btn.disabled = true; btn.textContent = 'Finding your order…';
  try {
    const res = await fetch('/api/track-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber, email }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showError(data.error || 'Something went wrong. Please try again.'); return; }
    if (S.currentContentSlug !== TRACK_ORDER_SLUG) return;
    document.getElementById('track-form').style.display = 'none';
    document.querySelector('.track-intro').style.display = 'none';
    document.getElementById('track-result').innerHTML = trackResultHtml(data);
    resetScrollToTop();
  } catch (err) {
    showError('No connection. Check your internet and try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Track Order';
  }
}

function trackAnotherOrder() {
  document.getElementById('track-result').innerHTML = '';
  document.getElementById('track-form').style.display = '';
  document.querySelector('.track-intro').style.display = '';
  const n = document.getElementById('track-number');
  if (n) { n.value = ''; n.focus(); }
}

// Item names were HTML-escaped when they went into the bag (cart.js).
function trackPlainText(s) {
  const t = document.createElement('textarea');
  t.innerHTML = String(s || '');
  return t.value;
}

function trackDate(iso, withYear) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-ZA', withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

function trackResultHtml(o) {
  const packages = o.packages || [];
  const shippedCount = packages.filter(p => p.shipped).length;
  const allShipped = packages.length > 0 && shippedCount === packages.length;
  const meta = [o.createdAt ? 'Placed ' + trackDate(o.createdAt, true) : '', packages.length > 1 ? packages.length + ' packages' : ''].filter(Boolean).join(' · ');

  let notice = '';
  let step = 1;
  if (o.cancelled) {
    notice = `<div class="track-notice">This order was cancelled. If you have questions, <span class="track-link" onclick="navigateToContentPage('client-support')">contact us</span>.</div>`;
  } else if (!o.paid) {
    notice = `<div class="track-notice">We haven’t received payment for this order, so it hasn’t been sent to the brands. If money left your account, <span class="track-link" onclick="navigateToContentPage('client-support')">contact us</span> with your order number.</div>`;
  } else {
    step = allShipped ? 3 : shippedCount ? 2.5 : 2;
  }
  const heading = o.cancelled ? 'Cancelled' : !o.paid ? 'Awaiting payment' : allShipped ? (packages.length > 1 ? 'All packages are on their way' : 'Your order is on its way')
    : shippedCount ? `${shippedCount} of ${packages.length} packages on their way` : 'Your order is being prepared';

  const steps = ['Order placed', 'Preparing', 'Shipped'].map((label, i) => {
    // step 2: preparing; 2.5: some packages shipped; 3: all shipped.
    const state = i === 0 ? 'done' : i === 1 ? (step > 2 ? 'done' : 'current') : (step === 3 ? 'done' : step === 2.5 ? 'current' : '');
    return `<div class="track-step ${state}"><span class="track-step-dot">${state === 'done' ? '<i class="ph ph-check" aria-hidden="true"></i>' : ''}</span><span class="track-step-label">${label}</span></div>`;
  }).join('<div class="track-step-line"></div>');

  const cards = packages.map((p, i) => {
    const items = p.items.map(it => {
      const product = PRODUCTS.find(x => x.id === it.productId);
      const thumb = product ? getProductThumbnail(product, it.variantIndex) : PLACEHOLDER_IMAGE;
      const details = [it.color && it.color !== 'Default' ? it.color : '', it.size && it.size !== 'OS' ? 'Size ' + it.size : '', 'Qty ' + it.qty].filter(Boolean).map(escapeHTML).join(' · ');
      return `<div class="track-item"><div class="track-item-img" style="background-image:url('${escapeForCssUrl(thumb)}')"></div>
        <div class="track-item-info"><div class="track-item-name">${escapeHTML(trackPlainText(it.name))}</div><div class="track-item-meta">${details}</div></div></div>`;
    }).join('');
    const status = o.cancelled || !o.paid ? '' : `<span class="track-pill${p.shipped ? ' shipped' : ''}">${p.shipped ? 'Shipped' : 'Preparing'}</span>`;
    const body = o.cancelled || !o.paid ? '' : p.shipped
      ? `<div class="track-ship">
          ${p.courier ? `<div class="track-ship-row"><span>Courier</span><strong>${escapeHTML(p.courier)}</strong></div>` : ''}
          <div class="track-ship-row"><span>Tracking number</span><strong>${escapeHTML(p.trackingNumber)}</strong>
            <button type="button" class="track-copy" onclick="copyTrackingNumber(this,'${escapeJSString(p.trackingNumber)}')">Copy</button></div>
          ${p.shippedAt ? `<div class="track-ship-row"><span>Shipped</span><strong>${escapeHTML(trackDate(p.shippedAt))}</strong></div>` : ''}
        </div>`
      : `<p class="track-wait">${escapeHTML(trackPlainText(p.brand))} is getting your items ready. We’ll email you the tracking number as soon as it ships.</p>`;
    return `<div class="track-card">
      <div class="track-card-head"><div><div class="track-card-label">${packages.length > 1 ? `Package ${i + 1} of ${packages.length}` : 'Your package'}</div><div class="track-card-brand">${escapeHTML(trackPlainText(p.brand))}</div></div>${status}</div>
      ${items}${body}</div>`;
  }).join('');

  return `<div class="track-result">
    <div class="track-order-number">Order ${escapeHTML(o.orderNumber)}</div>
    ${meta ? `<div class="track-order-meta">${escapeHTML(meta)}</div>` : ''}
    <div class="track-heading">${escapeHTML(heading)}</div>
    ${o.cancelled || !o.paid ? notice : `<div class="track-steps">${steps}</div>`}
    ${cards}
    <button type="button" class="track-another" onclick="trackAnotherOrder()">Track another order</button>
  </div>`;
}

function copyTrackingNumber(btn, value) {
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done).catch(() => {});
  else {
    const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    t.remove();
  }
}
