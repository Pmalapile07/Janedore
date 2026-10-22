// ==================== EXCHANGES ====================
// Customers exchange an item for another size or colour on
// /pages/exchange-an-item (exchanges.js): they find their order with its
// number and checkout email, pick items shipped in the last RETURN_DAYS
// days, choose what they want instead (only sizes and colours in stock),
// give a reason, and get an exchange number (EX-123456) to check its
// status with. Exchanges never become refunds.
//
// Who pays postage follows the reason: if the brand sent the wrong size
// or item, or it arrived damaged or faulty, JANEDORE pays; if the
// customer ordered the wrong size or changed their mind, the customer
// pays. Super Admin confirms this when approving.
//
// Flow: submitted -> approved (stock for the new item is reserved) ->
// received (the brand has the original back) -> dispatched (the new item
// is on its way, with tracking). Or declined. Every brand on the
// exchange is emailed and can confirm or dispute it in admin; only Super
// Admin approves or declines. The brand or Super Admin marks the item
// received and dispatched. Everything is read and written here with
// firebase-admin behind staff checks, so firestore.rules needs no change.
// Shares its order lookup and helpers with returns-api.js.

const crypto = require('crypto');

const OUR_FAULT = ['Wrong size sent', 'Wrong item sent', 'Damaged or faulty'];
const REASONS = ['Doesn’t fit', 'I’d prefer a different size or colour'].concat(OUR_FAULT);
const OPEN = ['submitted', 'approved', 'received'];

module.exports = function registerExchanges(app, deps, shared) {
  const { adminDb, admin, buildOrderEmailContext, orderEmails, ORDER_ALERT_EMAIL } = deps;
  const { limited, cleanNumber, cleanEmail, findOrder, returnableItems, staff, brandContacts, send, RETURN_DAYS } = shared;
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const iso = (t) => (t && t.toDate ? t.toDate().toISOString() : (t || null));
  const FROM = 'Janedore Exchanges <noreply@janedore.co.za>';

  // Same per-size stock rule as the storefront (product-detail.js).
  function stockOf(product, variantIndex, size) {
    const bySize = product.stockByVariant && product.stockByVariant[variantIndex];
    if (!bySize || typeof bySize !== 'object') return Number(product.stock) || 0;
    const n = bySize[size || 'OS'];
    return typeof n === 'number' ? n : 0;
  }

  function variantName(product, i) {
    const v = (product.variants || [])[i];
    return (v && (v.color || v.name)) || '';
  }

  async function newExchangeNumber(exchangeId) {
    for (let i = 0; i < 8; i++) {
      const number = 'EX-' + crypto.randomInt(100000, 1000000);
      try { await adminDb.collection('exchangeNumbers').doc(number).create({ exchangeId, at: ts() }); return number; }
      catch (e) { if (e.code === 6 || /already exists/i.test(e.message)) continue; throw e; }
    }
    throw new Error('Could not find a free exchange number');
  }

  function publicExchange(x) {
    return {
      exchangeNumber: x.exchangeNumber, orderNumber: x.orderNumber, status: x.status, createdAt: iso(x.createdAt),
      items: (x.items || []).map((i) => ({ productId: i.productId, variantIndex: i.variantIndex, name: i.name, brand: i.brand, size: i.size, color: i.color,
        qty: i.qty, reason: i.reason, wantSize: i.wantSize, wantColor: i.wantColor, wantVariantIndex: i.wantVariantIndex })),
      postage: x.approval ? x.approval.postage : x.postage,
      message: x.approval ? x.approval.message || '' : '',
      declineReason: x.declineReason || '',
      courier: x.dispatch ? x.dispatch.courier : '', trackingNumber: x.dispatch ? x.dispatch.trackingNumber : ''
    };
  }

  // Moves stock for the new items: -1 reserves on approval, +1 puts it
  // back if an approved exchange is closed before dispatch.
  async function moveStock(items, direction) {
    await adminDb.runTransaction(async (tx) => {
      const refs = [...new Set(items.map((i) => i.productId))].map((id) => adminDb.collection('products').doc(id));
      const docs = await Promise.all(refs.map((r) => tx.get(r)));
      const products = {};
      docs.forEach((d) => { products[d.id] = d.exists ? d.data() : null; });
      const patches = {};
      for (const it of items) {
        const p = products[it.productId];
        if (!p) throw new Error(it.name + ' is no longer available.');
        const patch = patches[it.productId] || (patches[it.productId] = {
          byVariant: p.stockByVariant && typeof p.stockByVariant === 'object' ? JSON.parse(JSON.stringify(p.stockByVariant)) : null,
          stock: Number(p.stock) || 0
        });
        const size = it.wantSize || 'OS';
        if (patch.byVariant && patch.byVariant[it.wantVariantIndex] && typeof patch.byVariant[it.wantVariantIndex] === 'object') {
          const now = Number(patch.byVariant[it.wantVariantIndex][size]) || 0;
          if (direction < 0 && now < it.qty) throw new Error(it.name + ' in ' + [it.wantColor, size !== 'OS' ? 'size ' + size : ''].filter(Boolean).join(', ') + ' is out of stock.');
          patch.byVariant[it.wantVariantIndex][size] = now + direction * it.qty;
        } else if (direction < 0 && patch.stock < it.qty) {
          throw new Error(it.name + ' is out of stock.');
        }
        patch.stock = Math.max(0, patch.stock + direction * it.qty);
      }
      refs.forEach((ref) => {
        const patch = patches[ref.id];
        if (!patch) return;
        const update = { stock: patch.stock };
        if (patch.byVariant) {
          update.stockByVariant = patch.byVariant;
          update.stock = Object.values(patch.byVariant).reduce((a, sizes) => a + Object.values(sizes || {}).reduce((b, n) => b + (Number(n) || 0), 0), 0);
        }
        tx.update(ref, update);
      });
    });
  }

  // ---- customer: find order ----
  app.post('/api/exchanges/lookup', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 20)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    const orderNumber = cleanNumber(req.body && req.body.orderNumber);
    const email = cleanEmail(req.body && req.body.email);
    if (!orderNumber || !email) return res.status(400).json({ error: 'Please enter your order number and email address.' });
    try {
      const found = await findOrder(orderNumber, email);
      if (!found) return res.status(404).json({ error: 'We couldn’t find an order matching those details. Please check your order number and email address.' });
      const items = await returnableItems(found.id, found.order, 'exchange');
      // What each item can be exchanged for: its sizes and colours, with
      // what is in stock now.
      const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
      const docs = await Promise.all(ids.map((id) => adminDb.collection('products').doc(id).get()));
      const options = {};
      docs.forEach((d) => {
        if (!d.exists) return;
        const p = d.data();
        const sizes = (p.sizes && p.sizes.length ? p.sizes : ['OS']);
        options[d.id] = (p.variants || [{}]).map((v, vi) => ({
          variantIndex: vi, color: variantName(p, vi),
          sizes: sizes.map((s) => ({ size: s, inStock: stockOf(p, vi, s) > 0 }))
        }));
      });
      res.json({
        orderNumber: found.order.orderNumber || orderNumber,
        items: items.map(({ vendorId, ...i }) => Object.assign(i, { options: options[i.productId] || [] })),
        reasons: REASONS, ourFault: OUR_FAULT, days: RETURN_DAYS
      });
    } catch (e) {
      console.error('[EXCHANGES_LOOKUP]', e.message);
      res.status(500).json({ error: 'We couldn’t complete your request. Please try again.' });
    }
  });

  // ---- customer: submit ----
  app.post('/api/exchanges', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 20)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    const b = req.body || {};
    const orderNumber = cleanNumber(b.orderNumber);
    const email = cleanEmail(b.email);
    const cloud = process.env.CLOUDINARY_CLOUD_NAME || '';
    const photos = (Array.isArray(b.photos) ? b.photos : []).map(String)
      .filter((u) => /^https:\/\/res\.cloudinary\.com\//.test(u) && (!cloud || u.indexOf('/' + cloud + '/') !== -1)).slice(0, 6);
    const note = String(b.note || '').trim().slice(0, 1000);
    try {
      const found = await findOrder(orderNumber, email);
      if (!found) return res.status(404).json({ error: 'We couldn’t find an order matching those details.' });
      const available = await returnableItems(found.id, found.order, 'exchange');
      const picked = [];
      for (const sel of (Array.isArray(b.items) ? b.items : [])) {
        const item = available[Number(sel.index)];
        const qty = Math.floor(Number(sel.qty) || 0);
        const reason = REASONS.includes(sel.reason) ? sel.reason : '';
        const details = String(sel.details || '').trim().slice(0, 1000);
        if (!item || !item.eligible) return res.status(400).json({ error: 'One of the items can no longer be exchanged. Please refresh and try again.' });
        if (!(qty > 0) || qty > item.qty) return res.status(400).json({ error: 'Please check the quantity for ' + item.name + '.' });
        if (!reason) return res.status(400).json({ error: 'Please choose a reason for ' + item.name + '.' });
        const pdoc = item.productId ? await adminDb.collection('products').doc(item.productId).get() : null;
        if (!pdoc || !pdoc.exists) return res.status(400).json({ error: item.name + ' is no longer available to exchange. Please contact customer care.' });
        const p = pdoc.data();
        const sizes = p.sizes && p.sizes.length ? p.sizes : ['OS'];
        const wantVariantIndex = Math.floor(Number(sel.wantVariantIndex));
        const wantSize = String(sel.wantSize || '');
        if (!(wantVariantIndex >= 0 && wantVariantIndex < Math.max(1, (p.variants || []).length)) || !sizes.includes(wantSize)) {
          return res.status(400).json({ error: 'Please choose what you’d like instead of ' + item.name + '.' });
        }
        const same = wantVariantIndex === (Number(item.variantIndex) || 0) && wantSize === (item.size || 'OS');
        if (same && !OUR_FAULT.includes(reason)) return res.status(400).json({ error: 'Please choose a different size or colour for ' + item.name + '.' });
        if (stockOf(p, wantVariantIndex, wantSize) < qty) return res.status(400).json({ error: 'The size or colour you chose for ' + item.name + ' is out of stock. Please choose another.' });
        picked.push(Object.assign({}, item, { qty, reason, details, wantSize, wantVariantIndex, wantColor: variantName(p, wantVariantIndex) }));
      }
      if (!picked.length) return res.status(400).json({ error: 'Please choose at least one item to exchange.' });
      if (picked.some((i) => OUR_FAULT.includes(i.reason)) && !photos.length) {
        return res.status(400).json({ error: 'Please add at least one photo showing the issue with the item.' });
      }

      const ref = adminDb.collection('exchanges').doc();
      const exchangeNumber = await newExchangeNumber(ref.id);
      const order = found.order;
      const vendorIds = [...new Set(picked.map((i) => i.vendorId).filter(Boolean))];
      const data = {
        exchangeNumber, orderId: found.id, orderNumber: order.orderNumber || orderNumber,
        customerEmail: email, customerName: order.customerName || '', customerPhone: order.customerPhone || '',
        items: picked.map(({ eligible, blocked, deadline, ordered, ...i }) => i),
        vendorIds, photos, note, status: 'submitted',
        // Proposed from the reasons; Super Admin confirms it on approval.
        postage: picked.some((i) => OUR_FAULT.includes(i.reason)) ? 'janedore' : 'customer',
        brandResponses: {},
        timeline: [{ at: new Date().toISOString(), text: 'Exchange requested by the customer.' }],
        createdAt: ts(), updatedAt: ts()
      };
      await ref.set(data);

      const ctx = await buildOrderEmailContext(order);
      const ex = Object.assign({}, data, { createdAt: new Date().toISOString() });
      const jobs = [send(email, orderEmails.exchangeRequested(ex, ctx))];
      jobs.push(send(ORDER_ALERT_EMAIL, orderEmails.exchangeForStaff(ex, ctx, { heading: 'New exchange request' }), FROM));
      (await brandContacts(vendorIds)).forEach((brand) => {
        const own = Object.assign({}, ex, { items: ex.items.filter((i) => i.vendorId === brand.id) });
        jobs.push(send(brand.to, orderEmails.exchangeForStaff(own, ctx, { heading: 'A customer wants to exchange your product', brand: brand.label }), FROM));
      });
      await Promise.all(jobs);
      res.json({ ok: true, exchangeNumber });
    } catch (e) {
      console.error('[EXCHANGES_SUBMIT]', e.message);
      res.status(500).json({ error: 'We couldn’t complete your request. Please try again.' });
    }
  });

  // ---- customer: status ----
  app.post('/api/exchanges/status', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 20)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    const number = cleanNumber(req.body && req.body.exchangeNumber);
    const email = cleanEmail(req.body && req.body.email);
    const notFound = () => res.status(404).json({ error: 'We couldn’t find an exchange matching those details. Please check your exchange number and email address.' });
    if (!number || !email) return res.status(400).json({ error: 'Please enter your exchange number and email address.' });
    try {
      const nd = /^[A-Z0-9-]+$/.test(number) ? await adminDb.collection('exchangeNumbers').doc(number).get() : null;
      if (!nd || !nd.exists) return notFound();
      const doc = await adminDb.collection('exchanges').doc(nd.data().exchangeId).get();
      if (!doc.exists || doc.data().customerEmail !== email) return notFound();
      res.json(publicExchange(doc.data()));
    } catch (e) {
      console.error('[EXCHANGES_STATUS]', e.message);
      res.status(500).json({ error: 'We couldn’t complete your request. Please try again.' });
    }
  });

  // ---- signed-in customer: their returns and exchanges (My account) ----
  // Same rule as orders in My account: those on orders placed while signed
  // in, plus those under the account's email once it is verified.
  app.get('/api/account/returns-exchanges', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: 'Please sign in.' });
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(match[1]); } catch (e) { return res.status(401).json({ error: 'Please sign in.' }); }
    try {
      const email = String(decoded.email || '').trim().toLowerCase();
      const own = await adminDb.collection('orders').where('customerId', '==', decoded.uid).limit(100).get();
      const orderIds = own.docs.map((d) => d.id);
      const lists = {};
      for (const kind of ['returns', 'exchanges']) {
        const found = {};
        const add = (snap) => snap.docs.forEach((d) => { found[d.id] = d.data(); });
        if (decoded.email_verified && email) add(await adminDb.collection(kind).where('customerEmail', '==', email).limit(100).get());
        for (let i = 0; i < orderIds.length; i += 10) {
          add(await adminDb.collection(kind).where('orderId', 'in', orderIds.slice(i, i + 10)).get());
        }
        lists[kind] = Object.values(found).map((x) => ({
          number: x.returnNumber || x.exchangeNumber, orderNumber: x.orderNumber, status: x.status, createdAt: iso(x.createdAt),
          items: (x.items || []).map((i) => ({ productId: i.productId, variantIndex: i.variantIndex, name: i.name, brand: i.brand, qty: i.qty,
            wantSize: i.wantSize, wantColor: i.wantColor }))
        })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      }
      res.json({ returns: lists.returns, exchanges: lists.exchanges });
    } catch (e) {
      console.error('[ACCOUNT_RETURNS_EXCHANGES]', e.message);
      res.status(500).json({ error: 'Could not load your returns and exchanges.' });
    }
  });

  // ---- admin: list ----
  app.get('/api/admin/exchanges', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const me = await staff(req);
    if (!me || !['SUPER_ADMIN', 'ADMIN', 'VENDOR'].includes(me.role)) return res.status(403).json({ error: 'Not authorized' });
    try {
      let q = adminDb.collection('exchanges');
      if (me.role === 'VENDOR') {
        if (!me.vendorId) return res.json({ exchanges: [], role: me.role });
        q = q.where('vendorIds', 'array-contains', me.vendorId);
      }
      const snap = await q.limit(300).get();
      const list = snap.docs.map((d) => {
        const x = d.data();
        const out = Object.assign({}, x, { id: d.id, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });
        if (me.role === 'VENDOR') {
          // A brand sees only its own lines and its own response, plus the
          // delivery address it needs to send the new item.
          out.items = (x.items || []).filter((i) => i.vendorId === me.vendorId);
          out.brandResponses = x.brandResponses && x.brandResponses[me.vendorId] ? { [me.vendorId]: x.brandResponses[me.vendorId] } : {};
        }
        return out;
      }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      // The delivery address for the new item comes from the order.
      const orderIds = [...new Set(list.map((x) => x.orderId).filter(Boolean))];
      const orders = await Promise.all(orderIds.map((id) => adminDb.collection('orders').doc(id).get()));
      const addr = {};
      orders.forEach((o) => {
        if (!o.exists) return;
        const d = o.data();
        addr[o.id] = [d.customerName, d.shippingAddress, d.city, d.province, d.postalCode, d.customerPhone].filter(Boolean).join(', ');
      });
      list.forEach((x) => { x.deliveryAddress = addr[x.orderId] || ''; });
      res.json({ exchanges: list, role: me.role, vendorId: me.vendorId });
    } catch (e) {
      console.error('[ADMIN_EXCHANGES]', e.message);
      res.status(500).json({ error: 'Could not load exchanges' });
    }
  });

  // ---- admin: actions ----
  app.post('/api/admin/exchanges/:id', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const me = await staff(req);
    if (!me) return res.status(403).json({ error: 'Not authorized' });
    const b = req.body || {};
    const action = String(b.action || '');
    const text = String(b.text || '').trim().slice(0, 1500);
    try {
      const ref = adminDb.collection('exchanges').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Exchange not found' });
      const x = doc.data();
      const isSA = me.role === 'SUPER_ADMIN';
      const isOwnBrand = me.role === 'VENDOR' && me.vendorId && (x.vendorIds || []).includes(me.vendorId);
      const now = new Date().toISOString();
      const patch = { updatedAt: ts() };
      let log = '';
      let customerStage = null;

      if (action === 'brand_accept' || action === 'brand_dispute') {
        const vid = me.role === 'VENDOR' ? me.vendorId : String(b.vendorId || '');
        if (!(isSA || isOwnBrand) || !vid || !(x.vendorIds || []).includes(vid)) return res.status(403).json({ error: 'Not authorized' });
        if (x.status !== 'submitted') return res.status(400).json({ error: 'This exchange has already been decided.' });
        if (action === 'brand_dispute' && !text) return res.status(400).json({ error: 'Please explain why you dispute this exchange.' });
        const brand = ((x.items || []).find((i) => i.vendorId === vid) || {}).brand || 'The brand';
        patch['brandResponses.' + vid] = { decision: action === 'brand_accept' ? 'accept' : 'dispute', note: text, at: now, by: me.name };
        log = brand + (action === 'brand_accept' ? ' confirmed the exchange.' : ' disputed the exchange: ' + text);
      } else if (action === 'received' || action === 'dispatched') {
        // The brand handles the goods, so it (or Super Admin) records them.
        if (!(isSA || isOwnBrand)) return res.status(403).json({ error: 'Not authorized' });
        if (action === 'received') {
          if (x.status !== 'approved') return res.status(400).json({ error: 'The exchange must be approved first.' });
          Object.assign(patch, { status: 'received', receivedAt: now });
          log = 'Original item received.';
          customerStage = 'received';
        } else {
          if (x.status !== 'received') return res.status(400).json({ error: 'Mark the original item received first.' });
          const courier = String(b.courier || '').trim().slice(0, 80);
          const trackingNumber = String(b.trackingNumber || '').trim().slice(0, 80);
          if (!courier || !trackingNumber) return res.status(400).json({ error: 'Add the courier and tracking number for the new item.' });
          Object.assign(patch, { status: 'dispatched', dispatch: { courier, trackingNumber, at: now } });
          log = 'New item dispatched with ' + courier + ' (' + trackingNumber + ').';
          customerStage = 'dispatched';
        }
      } else {
        if (!isSA) return res.status(403).json({ error: 'Only Super Admin can decide exchanges.' });
        if (action === 'approve') {
          if (x.status !== 'submitted') return res.status(400).json({ error: 'This exchange has already been decided.' });
          const postage = b.postage === 'janedore' ? 'janedore' : 'customer';
          if (!text) return res.status(400).json({ error: 'Add the instructions for the customer.' });
          try { await moveStock(x.items || [], -1); }
          catch (e) { return res.status(400).json({ error: e.message + ' Decline the exchange or contact the customer.' }); }
          Object.assign(patch, { status: 'approved', stockReserved: true, approval: { postage, message: text, at: now } });
          log = 'Exchange approved (' + (postage === 'janedore' ? 'JANEDORE pays postage' : 'customer pays postage') + '). Stock for the new item reserved.';
          customerStage = 'approved';
        } else if (action === 'decline') {
          if (x.status !== 'submitted') return res.status(400).json({ error: 'This exchange has already been decided.' });
          if (!text) return res.status(400).json({ error: 'Please give the customer a reason.' });
          Object.assign(patch, { status: 'declined', declineReason: text, declinedAt: now });
          log = 'Exchange declined: ' + text;
          customerStage = 'declined';
        } else if (action === 'close') {
          if (!OPEN.includes(x.status)) return res.status(400).json({ error: 'This exchange is already finished.' });
          if (x.stockReserved) {
            await moveStock(x.items || [], 1);
            patch.stockReserved = false;
          }
          Object.assign(patch, { status: 'closed', closedAt: now, closeNote: text });
          log = 'Exchange closed' + (text ? ': ' + text : '.') + (x.stockReserved ? ' Reserved stock released.' : '');
        } else {
          return res.status(400).json({ error: 'Unknown action' });
        }
      }
      patch.timeline = admin.firestore.FieldValue.arrayUnion({ at: now, text: log, by: me.name });
      await ref.update(patch);

      const updated = Object.assign({}, x, patch, { timeline: undefined });
      if (customerStage) {
        const orderDoc = await adminDb.collection('orders').doc(x.orderId).get();
        const ctx = await buildOrderEmailContext(orderDoc.exists ? orderDoc.data() : {});
        await send(x.customerEmail, orderEmails.exchangeUpdate(updated, ctx, customerStage));
      }
      if (action === 'brand_dispute') {
        const ctx = await buildOrderEmailContext({ items: x.items || [] });
        await send(ORDER_ALERT_EMAIL, orderEmails.exchangeForStaff(x, ctx, { heading: 'A brand disputed an exchange', dispute: log }), FROM);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[ADMIN_EXCHANGE_ACTION]', e.message);
      res.status(500).json({ error: 'Could not update the exchange' });
    }
  });
};

module.exports.OPEN_STATUSES = OPEN;
module.exports.OUR_FAULT = OUR_FAULT;
