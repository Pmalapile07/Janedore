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
      <h1 class="track-title">Track your order</h1>
      <p class="track-intro">Enter your order number and the email address used at checkout.</p>
      <form class="track-form" id="track-form" onsubmit="submitTrackOrder(event)" novalidate>
        <label class="track-label" for="track-number">Order number</label>
        <input class="track-input" id="track-number" type="text" placeholder="JD-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(number)}" required>
        <label class="track-label" for="track-email">Email</label>
        <input class="track-input" id="track-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHTML(email)}" required>
        <div class="track-error" id="track-error" role="alert"></div>
        <button class="track-btn" id="track-btn" type="submit">Track order</button>
        <p class="track-hint">Your order number begins with JD- and can be found in your order confirmation email.</p>
      </form>
      <div id="track-result"></div>
    </section>`;
  if (params.get('view') && number) openViewOrderLink(number);
  else if (number && email) submitTrackOrder();
}

// "View order" in order emails links to ?order=JD-123456&view=1. A
// signed-in customer who owns that order goes straight to it in My
// Account; anyone else stays here with the number (and their email, when
// we know it) filled in, and the order shows as soon as both are there.
// Waits for the saved sign-in to load first: an email link is a fresh
// page load, where currentUser is still null for a moment.
async function openViewOrderLink(number) {
  await (window.authReady || Promise.resolve());
  if (S.currentContentSlug !== TRACK_ORDER_SLUG) return;
  const user = firebase.auth().currentUser;
  if (user && !user.isAnonymous) {
    let owned = null;
    try { owned = (await loadAccountOrders()).find(o => (o.orderNumber || o.id).toUpperCase() === number.toUpperCase()) || null; }
    catch (e) { console.warn('[VIEW_ORDER]', e.message); }
    if (S.currentContentSlug !== TRACK_ORDER_SLUG) return;
    if (owned) {
      history.replaceState(null, null, '/account/orders/' + encodeURIComponent(owned.orderNumber || owned.id));
      navigateToAccount(true);
      return;
    }
  }
  const emailEl = document.getElementById('track-email');
  if (emailEl && !emailEl.value && user && !user.isAnonymous && user.email) emailEl.value = user.email;
  if (emailEl && emailEl.value) submitTrackOrder();
  else if (emailEl) emailEl.focus();
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
    if (!res.ok) { showError(data.error || 'We couldn’t complete your request. Please try again.'); return; }
    if (S.currentContentSlug !== TRACK_ORDER_SLUG) return;
    document.getElementById('track-form').style.display = 'none';
    document.querySelector('.track-intro').style.display = 'none';
    document.getElementById('track-result').innerHTML = trackResultHtml(data);
    resetScrollToTop();
  } catch (err) {
    showError('Unable to connect. Please check your internet connection and try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Track order';
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

// The order statuses admin sets (admin.js _ORDER_STATUSES, minus
// cancelled) in the order a package moves through them.
const TRACK_STAGES = ['pending', 'processing', 'packed', 'shipped', 'delivered'];
const TRACK_STAGE_LABELS = ['Order confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered'];
const TRACK_PREORDER_STAGE_LABELS = ['Pre-order confirmed', 'In production', 'Packed', 'Shipped', 'Delivered'];
// Collected by the customer from the brand (p.collect): no courier.
const TRACK_COLLECT_STAGE_LABELS = ['Order confirmed', 'Processing', 'Packed', 'Ready to collect', 'Collected'];
function trackStageLabels(p) { return p.collect ? TRACK_COLLECT_STAGE_LABELS : p.preorder ? TRACK_PREORDER_STAGE_LABELS : TRACK_STAGE_LABELS; }

// How far one package has got: the order's status, or Shipped once the
// package has tracking. On an order where some packages have tracking and
// others don't, a "shipped" status doesn't move the rest past Packed.
function trackPackageStage(o, p) {
  let stage = Math.max(0, TRACK_STAGES.indexOf(String(o.status || '').toLowerCase()));
  if (p.collect) return p.collectedAt ? 4 : p.readyAt ? 3 : Math.min(stage, 2);
  if (p.shipped) stage = Math.max(stage, 3);
  else if (stage === 3 && (o.packages || []).some(x => x.shipped)) stage = 2;
  return stage;
}

// Courier tracking pages that take the tracking number in the URL. Keys
// are admin-orders.js COURIERS, lower-cased; same list as order-emails.js.
const COURIER_TRACKING_URLS = {
  'the courier guy': 'https://portal.thecourierguy.co.za/track?ref={n}',
  'fastway': 'https://www.fastway.co.za/our-services/track-your-parcel?l={n}',
  'dhl': 'https://www.dhl.com/za-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}',
  'aramex': 'https://www.aramex.com/za/en/track/results?ShipmentNumber={n}',
  'dsv': 'https://www.dsv.com/en/tools/track-and-trace?reference={n}',
  'internet express': 'https://www.internetexpress.co.za/track-and-trace?waybill={n}',
  'mds collivery': 'https://collivery.net/tracking?waybill={n}',
  'rhenus': 'https://www.rhenus.com/en/track-and-trace?number={n}'
};
function courierTrackingUrl(courier, trackingNumber) {
  const tpl = COURIER_TRACKING_URLS[String(courier || '').trim().toLowerCase()];
  return tpl && trackingNumber ? tpl.replace('{n}', encodeURIComponent(trackingNumber)) : '';
}

// opts.hideAnother: the My account order page (account.js) has its own way back.
function trackResultHtml(o, opts) {
  opts = opts || {};
  const packages = o.packages || [];
  const shippedCount = packages.filter(p => p.shipped).length;
  const allShipped = packages.length > 0 && shippedCount === packages.length;
  // One package per brand. A brand's pre-order is a second shipment of
  // that same package (it ships when ready), never a package of its own.
  const brandKeys = [...new Set(packages.map(p => p.brand))];
  const brandCount = brandKeys.length;
  const split = packages.length > brandCount;
  const unit = split ? 'shipments' : 'packages';
  const meta = [o.createdAt ? 'Placed ' + trackDate(o.createdAt, true) : '', brandCount > 1 ? brandCount + ' packages' : ''].filter(Boolean).join(' · ');

  let notice = '';
  if (o.refundPending) {
    notice = `<div class="track-notice">We’re processing a refund for this order. You’ll receive an email as soon as it has been completed. If you have any questions, please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span>.</div>`;
  } else if (o.refunded) {
    notice = `<div class="track-notice">Your refund has been completed and returned to your original payment method. Depending on your bank, it can take up to 10 business days to reflect. If you have any questions, please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span>.</div>`;
  } else if (o.cancelled) {
    notice = `<div class="track-notice">This order has been cancelled. If you have any questions, please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span>.</div>`;
  } else if (!o.paid) {
    notice = `<div class="track-notice">Payment for this order has not been received, so it has not been processed. If you have been charged, please <span class="track-link" onclick="navigateToContentPage('customer-care')">contact customer care</span> and quote your order number.</div>`;
  }
  const allPreorder = packages.length > 0 && packages.every(p => p.preorder);
  const stages = packages.map(p => trackPackageStage(o, p));
  const allAt = (n) => stages.length > 0 && stages.every(s => s >= n);
  const allCollect = packages.length > 0 && packages.every(p => p.collect);
  const heading = o.refundPending ? 'Refund in progress' : o.refunded ? 'Refunded' : o.cancelled ? 'Order cancelled' : !o.paid ? 'Payment pending'
    : allCollect && allAt(4) ? 'Your order has been collected'
    : allCollect && allAt(3) ? 'Your order is ready to collect'
    : allAt(4) ? (packages.length > 1 ? `All ${unit} have been delivered` : 'Your order has been delivered')
    : allShipped ? (packages.length > 1 ? `All ${unit} have shipped` : 'Your order has shipped')
    : shippedCount ? `Partially shipped: ${shippedCount} of ${packages.length} ${unit}`
    : allAt(2) ? (packages.length > 1 ? `All ${unit} are packed` : 'Your order has been packed')
    : allPreorder ? 'Pre-order confirmed' : 'Your order is being processed';

  // Each package has its own steps; a pre-order is produced after purchase.
  // Steps up to the package's stage are done; the next one is in progress.
  const stepsHtml = (p, stage) => {
    const labels = trackStageLabels(p);
    return `<div class="track-steps">${labels.map((label, i) => {
      const state = i <= stage ? 'done' : i === stage + 1 ? 'current' : '';
      return `<div class="track-step ${state}"><span class="track-step-dot">${state === 'done' ? '<i class="ph ph-check" aria-hidden="true"></i>' : ''}</span><span class="track-step-label">${label}</span></div>`;
    }).join('<div class="track-step-line"></div>')}</div>`;
  };

  const cardLabel = (p) => {
    const n = brandKeys.indexOf(p.brand) + 1;
    const pkg = brandCount > 1 ? `Package ${n} of ${brandCount}` : 'Your package';
    const brandSplit = packages.filter(x => x.brand === p.brand).length > 1;
    return brandSplit ? `${brandCount > 1 ? pkg + ' · ' : ''}${p.preorder ? 'Pre-order shipment' : 'In-stock shipment'}` : pkg;
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
    const stage = stages[i];
    const pill = stage >= 2 ? trackStageLabels(p)[stage] : p.preorder ? 'In production' : 'Processing';
    const status = live ? `<span class="track-pill${stage === 4 ? ' delivered' : stage === 3 ? ' shipped' : ''}">${pill}</span>` : '';
    const courierUrl = courierTrackingUrl(p.courier, p.trackingNumber);
    const shipBy = p.preorder && p.shipBy ? preorderShipText(p.shipBy) : '';
    const place = p.collectFrom;
    const body = !live ? '' : p.collect
      ? (p.collectedAt
        ? `<p class="track-wait">Collected on ${escapeHTML(trackDate(new Date(p.collectedAt).toISOString()))}.</p>`
        : p.readyAt
        ? `<div class="track-ship">
            ${place && place.addressLines && place.addressLines.length ? `<div class="track-ship-row"><span>Collect from</span><strong>${[place.brand].concat(place.addressLines).map(x => escapeHTML(trackPlainText(x))).join('<br>')}</strong></div>` : ''}
            ${place && place.hours ? `<div class="track-ship-row"><span>Opening hours</span><strong>${escapeHTML(place.hours)}</strong></div>` : ''}
          </div><p class="track-wait">Ready to collect. Please bring the collection code from your email; the parcel is only handed over to someone who gives it.</p>`
        : `<p class="track-wait">${escapeHTML(trackPlainText(p.brand))} is preparing this package. We’ll email you the collection address, opening hours and your collection code as soon as it’s ready.</p>`)
      : stage === 4 && !p.shipped
      ? `<p class="track-wait">This package has been delivered.</p>`
      : p.shipped
      ? `<div class="track-ship">
          ${p.courier ? `<div class="track-ship-row"><span>Courier</span><strong>${escapeHTML(p.courier)}</strong></div>` : ''}
          <div class="track-ship-row"><span>Tracking number</span><strong>${escapeHTML(p.trackingNumber)}</strong>
            ${courierUrl
              ? `<a class="track-copy" href="${escapeHTML(courierUrl)}" target="_blank" rel="noopener" onclick="copyTrackingNumber(null,'${escapeJSString(p.trackingNumber)}')">Track <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>`
              : `<button type="button" class="track-copy" onclick="copyTrackingNumber(this,'${escapeJSString(p.trackingNumber)}')">Copy</button>`}</div>
          ${p.shippedAt ? `<div class="track-ship-row"><span>Dispatched</span><strong>${escapeHTML(trackDate(p.shippedAt))}</strong></div>` : ''}
        </div>`
      : p.preorder
        ? `<p class="track-wait">${shipBy ? `<strong>Estimated dispatch: ${escapeHTML(shipBy)}.</strong> ` : ''}This item is in production with ${escapeHTML(trackPlainText(p.brand))}. We will notify you of any change to the estimated dispatch date, and send tracking details once it has shipped.</p>`
        : `<p class="track-wait">${escapeHTML(trackPlainText(p.brand))} is processing this package. You will receive a shipping confirmation with tracking details once it has been dispatched.</p>`;
    return `<div class="track-card">
      <div class="track-card-head"><div><div class="track-card-label">${cardLabel(p)}</div><div class="track-card-brand">${escapeHTML(trackPlainText(p.brand))}</div></div>${status}</div>
      ${live ? stepsHtml(p, stage) : ''}${items}${body}</div>`;
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

// btn is null for the Track link: the number is copied too, in case the
// courier's page doesn't fill it in by itself.
function copyTrackingNumber(btn, value) {
  const done = () => { if (!btn) return; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done).catch(() => {});
  else {
    const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    t.remove();
  }
}
