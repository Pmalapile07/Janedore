/* ============================================================
   MY ACCOUNT: /account, /account/{section} and /account/orders/{JD-number}
   Rendered into #account-loaded (index.html) by navigateToAccount()
   (login.js). /account is a list like the navigation menu (Account info,
   Orders, Returns & exchanges, Wallet, Wishlist, Waitlist, Reviews) with
   Sign out; each opens its own page at /account/{section}. An order opens
   its own page with the same packages, steps and tracking as Track Your
   Order (track-order.js), plus delivery and payment details.
   ============================================================ */

S.accountTab = '';
let _accountOrders = null;   // paid/cancelled orders, newest first
let _accountProfile = null;
let _accountNeedsVerify = false;  // customers/{uid}
let _accountUid = null;
let _accountServices = null;  // { returns, exchanges } from /api/account/returns-exchanges

function accountUser() {
  const user = firebase.auth().currentUser;
  return user && !user.isAnonymous ? user : null;
}

function accountRoot() { return document.getElementById('account-loaded'); }

// From the URL: /account/orders/JD-123456 opens that order.
function accountOrderFromPath() {
  const m = window.location.pathname.match(/^\/account\/orders\/([^\/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

const ACCOUNT_SECTIONS = {
  info: 'Account info', orders: 'Orders', returns: 'Returns & exchanges', wallet: 'Wallet', waitlist: 'Waitlist', reviews: 'Reviews'
};

// From the URL: /account/orders, /account/info and so on.
function accountSectionFromPath() {
  const m = window.location.pathname.match(/^\/account\/([a-z]+)\/?$/);
  return m && ACCOUNT_SECTIONS[m[1]] ? m[1] : '';
}

async function renderAccountPage() {
  const el = accountRoot();
  const user = accountUser();
  if (!el || !user) return;
  if (_accountUid !== user.uid) { _accountOrders = null; _accountProfile = null; _accountUid = user.uid; }

  const orderNumber = accountOrderFromPath();
  if (orderNumber) return renderAccountOrder(orderNumber);

  const section = accountSectionFromPath();
  S.accountTab = section;
  if (!section) {
    const first = (user.displayName || (_accountProfile && _accountProfile.name) || '').trim().split(/\s+/)[0];
    const row = (label, onclick) => `<button type="button" class="jd-list-row" onclick="${onclick}"><span>${label}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`;
    el.innerHTML = `<section class="account-page">
      <h1 class="account-heading">${first ? 'Hi, ' + escapeHTML(first) : 'My account'}</h1>
      <p class="account-hello">${escapeHTML(user.email || '')}</p>
      <nav class="jd-list" aria-label="My account">
        ${row('Account info', "openAccountSection('info')")}
        ${row('Orders', "openAccountSection('orders')")}
        ${row('Returns &amp; exchanges', "openAccountSection('returns')")}
        ${row('Wallet', "openAccountSection('wallet')")}
        ${row('Wishlist', "navigateTo('wishlist')")}
        ${row('Waitlist', "openAccountSection('waitlist')")}
        ${row('Reviews', "openAccountSection('reviews')")}
      </nav>
      <button type="button" class="account-outline-btn account-signout-btn" onclick="handleLogout()">Sign out</button>
      <button type="button" class="account-help-link" onclick="navigateToContentPage('customer-care')"><i class="ph ph-question" aria-hidden="true"></i><span>Customer care</span></button>
    </section>`;
    return;
  }

  el.innerHTML = `<section class="account-page">
    <button type="button" class="account-back" onclick="openAccountSection('')"><i class="ph ph-arrow-left" aria-hidden="true"></i> My account</button>
    <h1 class="account-heading account-section-heading">${ACCOUNT_SECTIONS[section]}</h1>
    <div id="account-tab-body"><div class="loading-spinner"><div class="spinner"></div></div></div>
  </section>`;
  if (section === 'orders') renderAccountOrders();
  else if (section === 'info') renderAccountProfile();
  else if (section === 'returns') renderAccountReturns();
  else if (section === 'wallet') renderAccountWallet();
  else if (section === 'waitlist') renderAccountWaitlist();
  else renderAccountReviews();
}

// '' is the account list itself.
function openAccountSection(section) {
  history.pushState(null, null, '/account' + (section ? '/' + section : ''));
  renderAccountPage();
  resetScrollToTop();
}

// Kept for older calls.
function setAccountTab(tab) { openAccountSection(tab === 'profile' ? 'info' : tab); }

// ---------- Orders ----------

async function loadAccountOrders() {
  if (_accountOrders) return _accountOrders;
  const user = accountUser();
  // Orders placed while signed in are found by account. Orders placed with
  // this email as a guest are only shown once the email is verified
  // (firestore.rules), so nobody can sign up with someone else's email and
  // see their orders. Single-field queries (no orderBy), so no composite
  // index is needed; sorted here instead. Unpaid orders that never went
  // through are left out.
  if (!user.emailVerified) {
    await user.reload().catch(() => {});
    if (user.emailVerified) await user.getIdToken(true).catch(() => {});
  }
  _accountNeedsVerify = !user.emailVerified;
  const queries = [db.collection('orders').where('customerId', '==', user.uid).limit(100).get()];
  if (user.emailVerified) queries.push(db.collection('orders').where('customerEmail', '==', (user.email || '').trim().toLowerCase()).limit(100).get());
  const snaps = await Promise.all(queries);
  const byId = {};
  snaps.forEach(snap => snap.docs.forEach(d => { byId[d.id] = Object.assign({ id: d.id }, d.data()); }));
  const seconds = (o) => (o.createdAt && o.createdAt.seconds) || (o.createdAt ? new Date(o.createdAt).getTime() / 1000 : 0);
  _accountOrders = Object.values(byId)
    .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'refund_pending' || accountOrderCancelled(o))
    .sort((a, b) => seconds(b) - seconds(a));
  return _accountOrders;
}

function accountOrderCancelled(o) {
  return ['cancelled', 'refunded'].includes(String(o.status || '').toLowerCase()) || o.paymentStatus === 'refunded';
}
function accountOrderRefunded(o) {
  return o.paymentStatus === 'refunded' || String(o.status || '').toLowerCase() === 'refunded';
}

function accountOrderDate(o) {
  const ts = o.createdAt;
  if (!ts) return null;
  return ts.seconds ? new Date(ts.seconds * 1000).toISOString() : new Date(ts).toISOString();
}

// Same packages as server.js orderShipments(): one per brand, plus one
// for that brand's pre-orders, with tracking from vendorTracking.
function accountOrderPackages(order) {
  const vt = order.vendorTracking || {};
  const vendorIds = Array.isArray(order.vendorIds) ? order.vendorIds : [];
  const map = new Map();
  (order.items || []).forEach(item => {
    const vid = item.vendorId || null;
    const pre = !!item.preorder;
    const key = (vid || '__none__') + (pre ? '__preorder' : '');
    if (!map.has(key)) map.set(key, { vendorId: vid, preorder: pre, brand: item.brand || 'JANEDORE', items: [], shipBy: null });
    const g = map.get(key);
    g.items.push(item);
    if (pre && item.preorderShipDate && (!g.shipBy || item.preorderShipDate > g.shipBy)) g.shipBy = item.preorderShipDate;
  });
  return [...map.values()]
    .filter(g => !vendorIds.length || (g.vendorId && vendorIds.includes(g.vendorId)))
    .map(g => {
      const entry = g.vendorId ? (vt[g.vendorId] || {}) : null;
      const t = g.vendorId ? (g.preorder ? (entry.preorder || {}) : entry) : { trackingNumber: order.trackingNumber, courier: order.courier };
      return Object.assign(g, { shipped: !!t.trackingNumber, trackingNumber: t.trackingNumber || '', courier: t.courier || '', shippedAt: t.addedAt || null });
    });
}

function accountOrderStatus(o) {
  if (o.paymentStatus === 'refund_pending') return { label: 'Refund in progress', cls: '' };
  if (accountOrderRefunded(o)) return { label: 'Refunded', cls: '' };
  if (accountOrderCancelled(o)) return { label: 'Cancelled', cls: '' };
  const pk = accountOrderPackages(o);
  const shipped = pk.filter(p => p.shipped).length;
  const status = String(o.status || '').toLowerCase();
  if (status === 'delivered') return { label: 'Delivered', cls: 'delivered' };
  if (pk.length && shipped === pk.length) return { label: 'Shipped', cls: 'shipped' };
  if (shipped) return { label: 'Partially shipped', cls: 'shipped' };
  if (status === 'shipped') return { label: 'Shipped', cls: 'shipped' };
  if (status === 'packed') return { label: 'Packed', cls: '' };
  if (pk.length && pk.every(p => p.preorder)) return { label: 'Pre-order', cls: '' };
  return { label: 'Processing', cls: '' };
}

async function renderAccountOrders() {
  const body = document.getElementById('account-tab-body');
  let orders;
  try { orders = await loadAccountOrders(); }
  catch (e) {
    console.error('[ACCOUNT_ORDERS]', e);
    if (body) body.innerHTML = '<p class="account-note">We couldn’t load your orders. Please refresh the page and try again.</p>';
    return;
  }
  if (!body || S.accountTab !== 'orders') return;
  const verify = _accountNeedsVerify ? `<div class="track-notice account-verify">Placed an order as a guest with this email address? <span class="track-link" onclick="sendAccountVerification(this)">Verify your email</span> to see it here.</div>` : '';
  if (!orders.length) {
    body.innerHTML = verify + `<div class="cart-empty account-empty">
      <i class="ph ph-package cart-empty-icon" aria-hidden="true"></i>
      <div class="cart-empty-title">No orders yet</div>
      <div class="wish-empty-sub">When you place an order, it will appear here.</div>
      <button class="cart-empty-btn" onclick="navigateTo('products')">Start shopping</button>
    </div>`;
    return;
  }
  body.innerHTML = verify + orders.map(o => {
    const status = accountOrderStatus(o);
    const items = o.items || [];
    const count = items.reduce((a, i) => a + (Number(i.qty) || 1), 0);
    const thumbs = items.slice(0, 4).map(item => {
      const product = PRODUCTS.find(p => p.id === item.productId);
      const thumb = product ? getProductThumbnail(product, item.variantIndex) : PLACEHOLDER_IMAGE;
      return `<span class="account-thumb" style="background-image:url('${escapeForCssUrl(thumb)}')"></span>`;
    }).join('') + (items.length > 4 ? `<span class="account-thumb more">+${items.length - 4}</span>` : '');
    const num = o.orderNumber || o.id;
    return `<button type="button" class="account-order" onclick="openAccountOrder('${escapeJSString(num)}')">
      <span class="account-order-top"><span class="account-order-num">Order ${escapeHTML(num)}</span><span class="track-pill${status.cls ? ' ' + status.cls : ''}">${status.label}</span></span>
      <span class="account-order-meta">${escapeHTML(trackDate(accountOrderDate(o), true))} · ${count} ${count === 1 ? 'item' : 'items'} · ${formatPrice(o.total || 0)}</span>
      <span class="account-order-thumbs">${thumbs}</span>
      <span class="account-order-view">View order <i class="ph ph-caret-right" aria-hidden="true"></i></span>
    </button>`;
  }).join('');
}

function openAccountOrder(orderNumber) {
  history.pushState(null, null, '/account/orders/' + encodeURIComponent(orderNumber));
  renderAccountOrder(orderNumber);
  resetScrollToTop();
}

function backToAccountOrders() {
  openAccountSection('orders');
}

async function renderAccountOrder(orderNumber) {
  const el = accountRoot();
  if (!el) return;
  el.innerHTML = '<section class="account-page"><div class="loading-spinner"><div class="spinner"></div></div></section>';
  let order = null;
  try { order = (await loadAccountOrders()).find(o => (o.orderNumber || o.id) === orderNumber) || null; }
  catch (e) { console.error('[ACCOUNT_ORDER]', e); }
  if (accountOrderFromPath() !== orderNumber) return;
  const back = `<button type="button" class="account-back" onclick="backToAccountOrders()"><i class="ph ph-arrow-left" aria-hidden="true"></i> All orders</button>`;
  if (!order) {
    el.innerHTML = `<section class="account-page">${back}<p class="account-note">We couldn’t find this order in your account.</p></section>`;
    return;
  }

  const packages = accountOrderPackages(order).map(p => Object.assign({}, p, {
    items: p.items.map(i => ({ productId: i.productId, variantIndex: i.variantIndex || 0, name: i.name, size: i.size, color: i.color, qty: i.qty || 1 }))
  }));
  const tracking = trackResultHtml({
    orderNumber: order.orderNumber || order.id,
    createdAt: accountOrderDate(order),
    paid: ['paid', 'refund_pending'].includes(order.paymentStatus) || accountOrderRefunded(order),
    refundPending: order.paymentStatus === 'refund_pending',
    refunded: accountOrderRefunded(order),
    cancelled: accountOrderCancelled(order) && !accountOrderRefunded(order),
    status: String(order.status || 'pending').toLowerCase(),
    packages
  }, { hideAnother: true });

  const address = [order.shippingAddress, [order.city, order.province].filter(Boolean).join(', '), [order.postalCode, order.country].filter(Boolean).join(', ')]
    .filter(Boolean).map(escapeHTML).join('<br>');
  const discount = Number(order.discountAmount) || 0;
  const shipping = Number(order.shipping) || 0;
  el.innerHTML = `<section class="account-page">
    ${back}
    ${tracking}
    <div class="track-card account-detail">
      <div class="account-detail-title">Delivery details</div>
      <div class="account-detail-text"><strong>${escapeHTML(order.customerName || '')}</strong><br>${address}${order.customerPhone ? '<br>' + escapeHTML(order.customerPhone) : ''}</div>
    </div>
    <div class="track-card account-detail">
      <div class="account-detail-title">Payment summary</div>
      <div class="account-row big"><span>Total paid</span><span>${formatPrice(order.total || 0)}</span></div>
      ${accountOrderRefunded(order) ? `<div class="account-row"><span>Refunded</span><span>-${formatPrice(order.refundAmount || order.total || 0)}</span></div>` : ''}
      <div class="account-row"><span>Cart total</span><span>${formatPrice(order.subtotal || 0)}</span></div>
      ${discount > 0 ? `<div class="account-row"><span>Discount${order.discountCode ? ' (' + escapeHTML(order.discountCode) + ')' : ''}</span><span>-${formatPrice(discount)}</span></div>` : ''}
      <div class="account-row"><span>Delivery fee${new Set(packages.map(p => p.brand)).size > 1 ? ' (' + new Set(packages.map(p => p.brand)).size + ' packages)' : ''}</span><span>${shipping ? formatPrice(shipping) : 'Free'}</span></div>
      <div class="account-row"><span>Payment method</span><span>PayFast</span></div>
    </div>
    ${order.paymentStatus === 'paid' && packages.some(p => p.shipped) ? `<button type="button" class="account-outline-btn account-return-btn" onclick="startAccountReturn('${escapeJSString(order.orderNumber || order.id)}')">Return items</button>
      <button type="button" class="account-outline-btn account-return-btn" onclick="startAccountExchange('${escapeJSString(order.orderNumber || order.id)}')">Exchange items</button>` : ''}
    <p class="account-help">Need help with this order? <span class="track-link" onclick="navigateToContentPage('customer-care')">Contact customer care</span> and quote order ${escapeHTML(order.orderNumber || order.id)}.</p>
  </section>`;
}

// Opens Log a return with this order already filled in.
function startAccountReturn(orderNumber) {
  history.pushState(null, null, '/pages/log-a-return?order=' + encodeURIComponent(orderNumber));
  navigateToContentPage('log-a-return', true);
}

// Opens Exchange an item with this order already filled in.
function startAccountExchange(orderNumber) {
  history.pushState(null, null, '/pages/exchange-an-item?order=' + encodeURIComponent(orderNumber));
  navigateToContentPage('exchange-an-item', true);
}

// ---------- Profile ----------

async function loadAccountProfile() {
  if (_accountProfile) return _accountProfile;
  const doc = await db.collection('customers').doc(accountUser().uid).get();
  _accountProfile = doc.exists ? (doc.data() || {}) : {};
  return _accountProfile;
}

async function renderAccountProfile() {
  const body = document.getElementById('account-tab-body');
  const user = accountUser();
  let p = {};
  try { p = await loadAccountProfile(); } catch (e) { console.warn('[ACCOUNT_PROFILE]', e.message); }
  if (!body || S.accountTab !== 'info') return;
  const usesPassword = (user.providerData || []).some(x => x && x.providerId === 'password');
  const usesGoogle = (user.providerData || []).some(x => x && x.providerId === 'google.com');
  const field = (id, label, value, attrs) => `<label class="track-label" for="${id}">${label}</label><input class="track-input" id="${id}" value="${escapeHTML(value || '')}" ${attrs || ''}>`;
  body.innerHTML = `<form class="account-form" onsubmit="saveAccountProfile(event)" novalidate>
    <div class="account-section-title">Personal details</div>
    ${field('acc-name', 'Full name', p.name || user.displayName, 'autocomplete="name" required')}
    ${field('acc-phone', 'Phone number', p.phone, 'type="tel" autocomplete="tel" placeholder="+27 81 234 5678"')}
    <label class="track-label" for="acc-email">Email address</label>
    <input class="track-input" id="acc-email" value="${escapeHTML(user.email || '')}" disabled>
    <p class="account-note">To change your email address, please contact customer care.</p>

    <div class="account-section-title">Default delivery address</div>
    ${field('acc-address', 'Street address', p.address, 'autocomplete="street-address" placeholder="House number and street name"')}
    <div class="account-form-row">
      <div>${field('acc-city', 'City', p.city, 'autocomplete="address-level2" placeholder="Johannesburg"')}</div>
      <div>${field('acc-province', 'Province', p.province, 'autocomplete="address-level1" placeholder="Gauteng"')}</div>
    </div>
    ${field('acc-postal', 'Postal code', p.postalCode, 'inputmode="numeric" autocomplete="postal-code" placeholder="2000"')}
    <p class="account-note">Used to fill in checkout for you.</p>
    <div class="track-error" id="acc-error" role="alert"></div>
    <button type="submit" class="track-btn" id="acc-save">Save changes</button>
  </form>

  <div class="account-section-title">Sign-in &amp; security</div>
  ${usesPassword ? `<p class="account-note">We’ll email you a secure link to set a new password.</p>
    <button type="button" class="account-outline-btn" id="acc-password" onclick="sendAccountPasswordReset()">Change password</button>` : ''}
  ${usesGoogle ? `<p class="account-note">You sign in with your Google account.</p>` : ''}`;
}

async function saveAccountProfile(e) {
  e.preventDefault();
  const user = accountUser();
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const err = document.getElementById('acc-error');
  const btn = document.getElementById('acc-save');
  const name = val('acc-name');
  err.style.display = 'none';
  if (!name) { err.textContent = 'Please enter your full name.'; err.style.display = 'block'; return; }
  const data = { name, phone: val('acc-phone'), address: val('acc-address'), city: val('acc-city'), province: val('acc-province'), postalCode: val('acc-postal'),
    email: (user.email || '').toLowerCase(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await db.collection('customers').doc(user.uid).set(data, { merge: true });
    if (name !== user.displayName) await user.updateProfile({ displayName: name });
    _accountProfile = Object.assign({}, _accountProfile, data);
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Your details have been saved', 'ph-check-circle');
  } catch (ex) {
    console.error('[ACCOUNT_SAVE]', ex);
    err.textContent = 'We couldn’t save your details. Please try again.';
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Save changes';
  }
}

async function sendAccountPasswordReset() {
  const user = accountUser();
  const btn = document.getElementById('acc-password');
  if (!user || !btn) return;
  btn.disabled = true;
  try {
    await firebase.auth().sendPasswordResetEmail(user.email, { url: window.location.origin + '/login' });
    btn.textContent = 'Link sent';
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Password link sent to ' + user.email, 'ph-envelope-simple');
  } catch (e) {
    btn.disabled = false;
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Something went wrong. Please try again.', 'ph-warning-circle');
  }
}

// ---------- Returns & exchanges, Wallet, Waitlist ----------

// GET/POST to an /api/account/* endpoint as the signed-in customer.
async function accountApi(path, method) {
  const token = await accountUser().getIdToken();
  const res = await fetch(path, { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

const ACCOUNT_SERVICE_STATUS = {
  submitted: ['Under review', ''], approved: ['Approved', 'shipped'], received: ['Item received', 'shipped'], declined: ['Not approved', 'cancelled'],
  refund_pending: ['Refund in progress', 'shipped'], refunded: ['Refunded', 'delivered'], dispatched: ['New item sent', 'delivered'], closed: ['Closed', 'cancelled']
};

async function renderAccountReturns() {
  const body = document.getElementById('account-tab-body');
  let data = _accountServices;
  if (!data) {
    try { data = _accountServices = await accountApi('/api/account/returns-exchanges'); }
    catch (e) {
      if (body && S.accountTab === 'returns') body.innerHTML = `<p class="account-note">${escapeHTML(e.message)}</p>`;
      return;
    }
  }
  if (!body || S.accountTab !== 'returns') return;
  const card = (x, kind) => {
    const st = ACCOUNT_SERVICE_STATUS[x.status] || [x.status, ''];
    const slug = kind === 'return' ? 'log-a-return?return=' : 'exchange-an-item?exchange=';
    const names = (x.items || []).map(i => trackPlainText(i.name) + (kind === 'exchange' && (i.wantSize || i.wantColor) ? ' for ' + [i.wantColor, i.wantSize && i.wantSize !== 'OS' ? 'size ' + i.wantSize : ''].filter(Boolean).join(', ') : '')).join(', ');
    return `<button type="button" class="account-order" onclick="openAccountService('${escapeJSString(slug + encodeURIComponent(x.number))}')">
      <span class="account-order-top"><span class="account-order-num">${kind === 'return' ? 'Return' : 'Exchange'} ${escapeHTML(x.number)}</span><span class="track-pill${st[1] ? ' ' + st[1] : ''}">${escapeHTML(st[0])}</span></span>
      <span class="account-order-meta">Order ${escapeHTML(x.orderNumber || '')}${x.createdAt ? ' · ' + escapeHTML(trackDate(x.createdAt, true)) : ''}</span>
      <span class="account-order-meta">${escapeHTML(names)}</span>
      <span class="account-order-view">View status <i class="ph ph-caret-right" aria-hidden="true"></i></span>
    </button>`;
  };
  const list = data.returns.map(x => card(x, 'return')).concat(data.exchanges.map(x => card(x, 'exchange')));
  body.innerHTML = `<nav class="jd-list account-service-list" aria-label="Returns and exchanges">
      <button type="button" class="jd-list-row" onclick="navigateToContentPage('log-a-return')"><span>Start a return</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
      <button type="button" class="jd-list-row" onclick="navigateToContentPage('exchange-an-item')"><span>Exchange an item</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
    </nav>
    ${list.length ? `<div class="account-section-title">Your returns and exchanges</div>${list.join('')}`
      : `<p class="account-note account-empty-note">You haven’t returned or exchanged anything yet. Items can be returned or exchanged within 30 days of dispatch.</p>`}`;
}

function openAccountService(path) {
  history.pushState(null, null, '/pages/' + path);
  navigateToContentPage(path.split('?')[0], true);
}

function renderAccountWallet() {
  const body = document.getElementById('account-tab-body');
  if (!body || S.accountTab !== 'wallet') return;
  body.innerHTML = `<div class="cart-empty account-empty">
    <i class="ph ph-wallet cart-empty-icon" aria-hidden="true"></i>
    <div class="cart-empty-title">Your wallet is coming soon</div>
    <div class="wish-empty-sub">Gift card and store credit balances will appear here once they’re available.</div>
  </div>`;
}

async function renderAccountWaitlist() {
  const body = document.getElementById('account-tab-body');
  let items;
  try { items = (await accountApi('/api/account/waitlist')).items || []; }
  catch (e) {
    if (body && S.accountTab === 'waitlist') body.innerHTML = `<p class="account-note">${escapeHTML(e.message)}</p>`;
    return;
  }
  if (!body || S.accountTab !== 'waitlist') return;
  if (!items.length) {
    body.innerHTML = `<div class="cart-empty account-empty">
      <i class="ph ph-bell cart-empty-icon" aria-hidden="true"></i>
      <div class="cart-empty-title">Your waitlist is empty</div>
      <div class="wish-empty-sub">When a size you love is sold out or its pre-orders are full, join its waitlist on the product page and we’ll email you when it’s available again.</div>
    </div>`;
    return;
  }
  body.innerHTML = items.map(w => {
    const product = PRODUCTS.find(p => p.id === w.productId);
    const thumb = product ? getProductThumbnail(product, w.variantIndex) : PLACEHOLDER_IMAGE;
    const meta = [w.brand, w.color && w.color !== 'Default' ? w.color : '', w.size && w.size !== 'OS' ? 'Size ' + w.size : ''].filter(Boolean).map(escapeHTML).join(' · ');
    return `<div class="track-item account-waitlist-item" id="wl-${escapeHTML(w.id)}">
      <div class="track-item-img"${product ? ` onclick="goToProduct('${escapeJSString(product.id)}')"` : ''} style="background-image:url('${escapeForCssUrl(thumb)}')"></div>
      <div class="track-item-info"><div class="track-item-name">${escapeHTML(trackPlainText(w.name || (product && product.name) || ''))}</div>
        <div class="track-item-meta">${meta}</div>
        <div class="track-item-meta">${w.status === 'notified' ? 'Available again: we emailed you' : 'Waiting for restock'}</div>
        <button type="button" class="track-link account-waitlist-remove" onclick="removeAccountWaitlist('${escapeJSString(w.id)}', this)">Remove</button>
      </div>
    </div>`;
  }).join('');
}

async function removeAccountWaitlist(id, el) {
  if (el) el.disabled = true;
  try {
    await accountApi('/api/account/waitlist/' + encodeURIComponent(id) + '/remove', 'POST');
    renderAccountWaitlist();
  } catch (e) {
    if (el) el.disabled = false;
    if (typeof showAddedToCartToast === 'function') showAddedToCartToast(e.message, 'ph-warning-circle');
  }
}

// ---------- Reviews ----------

async function renderAccountReviews() {
  const body = document.getElementById('account-tab-body');
  const user = accountUser();
  let reviews = [];
  try {
    const snap = await db.collection('reviews').where('email', '==', (user.email || '').trim().toLowerCase()).limit(50).get();
    reviews = snap.docs.map(d => d.data()).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
  } catch (e) { console.warn('[ACCOUNT_REVIEWS]', e.message); }
  if (!body || S.accountTab !== 'reviews') return;
  if (!reviews.length) {
    body.innerHTML = `<div class="cart-empty account-empty">
      <i class="ph ph-star cart-empty-icon" aria-hidden="true"></i>
      <div class="cart-empty-title">No reviews yet</div>
      <div class="wish-empty-sub">Reviews you leave on products will appear here.</div>
    </div>`;
    return;
  }
  body.innerHTML = reviews.map(r => {
    const product = PRODUCTS.find(p => p.id === r.productId);
    const rating = Math.max(0, Math.min(5, Number(r.rating) || 0));
    const date = r.createdAt && r.createdAt.seconds ? trackDate(new Date(r.createdAt.seconds * 1000).toISOString(), true) : '';
    return `<div class="track-card account-review">
      ${product ? `<div class="account-review-product" onclick="goToProduct('${escapeJSString(product.id)}')">${escapeHTML(product.name || '')}</div>` : ''}
      <div class="account-stars" aria-label="${rating} out of 5">${'★'.repeat(rating)}<span>${'★'.repeat(5 - rating)}</span></div>
      ${r.text ? `<p class="account-review-text">${escapeHTML(r.text)}</p>` : ''}
      ${date ? `<div class="account-order-meta">${escapeHTML(date)}</div>` : ''}
    </div>`;
  }).join('');
}

// A different customer signing in on this device starts clean.
function sendAccountVerification(el) {
  const user = accountUser();
  if (!user) return;
  if (el) el.style.pointerEvents = 'none';
  user.sendEmailVerification().then(() => {
    showAddedToCartToast('Verification email sent to ' + user.email);
  }).catch(e => {
    if (el) el.style.pointerEvents = '';
    showAddedToCartToast(e && e.code === 'auth/too-many-requests' ? 'Please wait a few minutes before trying again' : 'Could not send the email. Please try again.');
  });
}

function clearAccountCache() { _accountOrders = null; _accountProfile = null; _accountUid = null; _accountServices = null; S.accountTab = ''; }
