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
      <p class="track-intro">Enter your order number and the email address used at checkout.</p>
      <form class="track-form" id="track-form" onsubmit="submitTrackOrder(event)" novalidate>
        <label class="track-label" for="track-number">Order number</label>
        <input class="track-input" id="track-number" type="text" placeholder="JD-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(number)}" required>
        <label class="track-label" for="track-email">Email</label>
        <input class="track-input" id="track-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}" required>
        <div class="track-error" id="track-error" role="alert"></div>
        <button class="track-btn" id="track-btn" type="submit">Track Order</button>
        <p class="track-hint">Your order number begins with JD- and can be found in your order confirmation email.</p>
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
  if (!orderNumber || !email) { showError('Please enter your order number and email address.'); return; }

  btn.disabled = true; btn.textContent = 'Searching…';
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

// opts.hideAnother: the My Account order page (account.js) has its own way back.
function trackResultHtml(o, opts) {
  opts = opts || {};
  const packages = o.packages || [];
  const shippedCount = packages.filter(p => p.shipped).length;
  const allShipped = packages.length > 0 && shippedCount === packages.length;
  const meta = [o.createdAt ? 'Placed ' + trackDate(o.createdAt, true) : '', packages.length > 1 ? packages.length + ' packages' : ''].filter(Boolean).join(' · ');

  let notice = '';
  if (o.refundPending) {
    notice = `<div class="track-notice">We’re processing a refund for this order. You’ll receive an email as soon as it has been completed. If you have any questions, please <span class="track-link" onclick="navigateToContentPage('client-support')">contact Client Support</span>.</div>`;
  } else if (o.refunded) {
    notice = `<div class="track-notice">Your refund has been completed and returned to your original payment method. Depending on your bank, it can take up to 10 business days to reflect. If you have any questions, please <span class="track-link" onclick="navigateToContentPage('client-support')">contact Client Support</span>.</div>`;
  } else if (o.cancelled) {
    notice = `<div class="track-notice">This order has been cancelled. If you have any questions, please <span class="track-link" onclick="navigateToContentPage('client-support')">contact Client Support</span>.</div>`;
  } else if (!o.paid) {
    notice = `<div class="track-notice">Payment for this order has not been received, so it has not been processed. If you have been charged, please <span class="track-link" onclick="navigateToContentPage('client-support')">contact Client Support</span> and quote your order number.</div>`;
  }
  const allPreorder = packages.length > 0 && packages.every(p => p.preorder);
  const heading = o.refundPending ? 'Refund in progress' : o.refunded ? 'Refunded' : o.cancelled ? 'Order cancelled' : !o.paid ? 'Payment pending' : allShipped ? (packages.length > 1 ? 'All packages have shipped' : 'Your order has shipped')
    : shippedCount ? `Partially shipped: ${shippedCount} of ${packages.length} packages` : allPreorder ? 'Pre-order confirmed' : 'Your order is being processed';

  // Each package has its own steps; a pre-order is produced after purchase.
  const stepsHtml = (p) => {
    const labels = p.preorder ? ['Pre-order confirmed', 'In production', 'Shipped'] : ['Order confirmed', 'Processing', 'Shipped'];
    return `<div class="track-steps">${labels.map((label, i) => {
      const state = i === 0 || p.shipped ? 'done' : i === 1 ? 'current' : '';
      return `<div class="track-step ${state}"><span class="track-step-dot">${state === 'done' ? '<i class="ph ph-check" aria-hidden="true"></i>' : ''}</span><span class="track-step-label">${label}</span></div>`;
    }).join('<div class="track-step-line"></div>')}</div>`;
  };

  const cards = packages.map((p, i) => {
    const items = p.items.map(it => {
      const product = PRODUCTS.find(x => x.id === it.productId);
      const thumb = product ? getProductThumbnail(product, it.variantIndex) : PLACEHOLDER_IMAGE;
      const details = [it.color && it.color !== 'Default' ? it.color : '', it.size && it.size !== 'OS' ? 'Size ' + it.size : '', 'Qty ' + it.qty].filter(Boolean).map(escapeHTML).join(' · ');
      return `<div class="track-item"><div class="track-item-img" style="background-image:url('${escapeForCssUrl(thumb)}')"></div>
        <div class="track-item-info"><div class="track-item-name">${escapeHTML(trackPlainText(it.name))}</div><div class="track-item-meta">${details}</div></div></div>`;
    }).join('');
    const live = !o.cancelled && !o.refunded && !o.refundPending && o.paid;
    const status = live ? `<span class="track-pill${p.shipped ? ' shipped' : ''}">${p.shipped ? 'Shipped' : p.preorder ? 'In production' : 'Processing'}</span>` : '';
    const shipBy = p.preorder && p.shipBy ? preorderShipText(p.shipBy) : '';
    const body = !live ? '' : p.shipped
      ? `<div class="track-ship">
          ${p.courier ? `<div class="track-ship-row"><span>Courier</span><strong>${escapeHTML(p.courier)}</strong></div>` : ''}
          <div class="track-ship-row"><span>Tracking number</span><strong>${escapeHTML(p.trackingNumber)}</strong>
            <button type="button" class="track-copy" onclick="copyTrackingNumber(this,'${escapeJSString(p.trackingNumber)}')">Copy</button></div>
          ${p.shippedAt ? `<div class="track-ship-row"><span>Dispatched</span><strong>${escapeHTML(trackDate(p.shippedAt))}</strong></div>` : ''}
        </div>`
      : p.preorder
        ? `<p class="track-wait">${shipBy ? `<strong>Estimated dispatch: ${escapeHTML(shipBy)}.</strong> ` : ''}This item is in production with ${escapeHTML(trackPlainText(p.brand))}. We will notify you of any change to the estimated dispatch date, and send tracking details once it has shipped.</p>`
        : `<p class="track-wait">${escapeHTML(trackPlainText(p.brand))} is processing this package. You will receive a shipping confirmation with tracking details once it has been dispatched.</p>`;
    return `<div class="track-card">
      <div class="track-card-head"><div><div class="track-card-label">${packages.length > 1 ? `Package ${i + 1} of ${packages.length}` : 'Your package'}</div><div class="track-card-brand">${escapeHTML(trackPlainText(p.brand))}</div></div>${status}</div>
      ${live ? stepsHtml(p) : ''}${items}${body}</div>`;
  }).join('');

  return `<div class="track-result">
    <div class="track-order-number">Order ${escapeHTML(o.orderNumber)}</div>
    ${meta ? `<div class="track-order-meta">${escapeHTML(meta)}</div>` : ''}
    <div class="track-heading">${escapeHTML(heading)}</div>
    ${notice}
    ${cards}
    ${opts.hideAnother ? '' : '<button type="button" class="track-another" onclick="trackAnotherOrder()">Track another order</button>'}
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
