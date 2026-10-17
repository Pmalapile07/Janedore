// ==================== RETURNS ====================
// Customers log a return on /pages/log-a-return (returns.js): they find
// their order with its number and checkout email, pick items shipped in
// the last RETURN_DAYS days, give a reason and photos, and get a return
// number (RT-123456) to check its status with. Every brand on the
// return is emailed and can accept or dispute it in admin; only Super
// Admin decides (approve with who pays return delivery, or decline),
// marks the item received, and refunds in two honest steps (started,
// then confirmed once refunded in PayFast). The customer is emailed at
// each step. Everything is read and written here with firebase-admin,
// behind staff checks, so firestore.rules needs no change.

const crypto = require('crypto');

const RETURN_DAYS = 30;
const REASONS = ['Doesn’t fit', 'Not as described', 'Damaged or faulty', 'Wrong item received', 'Changed my mind', 'Other'];
const OPEN = ['submitted', 'approved', 'received', 'refund_pending'];

module.exports = function registerReturns(app, deps) {
  const { adminDb, admin, orderShipments, sendResendEmail, buildOrderEmailContext, orderEmails, ORDER_ALERT_EMAIL, getVendors } = deps;
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const iso = (t) => (t && t.toDate ? t.toDate().toISOString() : (t || null));

  // ---- shared helpers ----
  const hits = new Map();
  function limited(req, max) {
    const ip = String(req.ip || '');
    const now = Date.now();
    const h = (hits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (h.length >= max) return true;
    h.push(now);
    hits.set(ip, h);
    return false;
  }

  function cleanNumber(v) { return String(v || '').trim().toUpperCase().replace(/^#/, '').replace(/\s+/g, '').slice(0, 40); }
  function cleanEmail(v) { return String(v || '').trim().toLowerCase().slice(0, 200); }

  async function findOrder(orderNumber, email) {
    let doc = null;
    const numberDoc = /^[A-Z0-9-]+$/.test(orderNumber) ? await adminDb.collection('orderNumbers').doc(orderNumber).get() : null;
    if (numberDoc && numberDoc.exists && numberDoc.data().orderId) {
      doc = await adminDb.collection('orders').doc(numberDoc.data().orderId).get();
    } else {
      const snap = await adminDb.collection('orders').where('orderNumber', '==', orderNumber).limit(1).get();
      doc = snap.empty ? null : snap.docs[0];
    }
    if (!doc || !doc.exists) return null;
    const order = doc.data();
    if (String(order.customerEmail || '').trim().toLowerCase() !== email) return null;
    return { id: doc.id, ref: doc.ref, order };
  }

  // Every order line, with how many can still be returned and why not.
  async function returnableItems(orderId, order) {
    const shipments = orderShipments(order);
    const open = await adminDb.collection('returns').where('orderId', '==', orderId).get();
    const used = {};
    open.docs.forEach((d) => {
      const r = d.data();
      if (r.status === 'declined') return;
      (r.items || []).forEach((i) => { used[i.index] = (used[i.index] || 0) + (Number(i.qty) || 0); });
    });
    return (order.items || []).map((item, index) => {
      const shipment = shipments.find((s) => s.items.includes(item));
      const shippedAt = shipment && shipment.tracking.trackingNumber ? (shipment.tracking.addedAt || iso(order.createdAt)) : null;
      const deadline = shippedAt ? new Date(new Date(shippedAt).getTime() + RETURN_DAYS * 86400000) : null;
      const remaining = Math.max(0, (Number(item.qty) || 1) - (used[index] || 0));
      let blocked = '';
      if (order.paymentStatus !== 'paid') blocked = 'This order can’t be returned.';
      else if (!shippedAt) blocked = 'Not shipped yet';
      else if (deadline < new Date()) blocked = 'Return window closed on ' + deadline.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
      else if (!remaining) blocked = 'Already returned';
      return {
        index, productId: item.productId || '', variantIndex: item.variantIndex || 0, name: item.name || '', brand: item.brand || 'JANEDORE',
        vendorId: item.vendorId || null, size: item.size || '', color: item.color || '', price: Number(item.price) || 0,
        qty: remaining, ordered: Number(item.qty) || 1, eligible: !blocked, blocked,
        deadline: deadline ? deadline.toISOString() : null
      };
    });
  }

  async function newReturnNumber(returnId) {
    for (let i = 0; i < 8; i++) {
      const number = 'RT-' + crypto.randomInt(100000, 1000000);
      try { await adminDb.collection('returnNumbers').doc(number).create({ returnId, at: ts() }); return number; }
      catch (e) { if (e.code === 6 || /already exists/i.test(e.message)) continue; throw e; }
    }
    throw new Error('Could not find a free return number');
  }

  async function staff(req) {
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return null;
    try {
      const decoded = await admin.auth().verifyIdToken(match[1]);
      const doc = await adminDb.collection('admins').doc(decoded.uid).get();
      if (!doc.exists) return null;
      const d = doc.data();
      return { uid: decoded.uid, role: d.role, vendorId: d.vendorId || null, name: d.name || d.email || decoded.email || 'Staff' };
    } catch (e) { return null; }
  }

  function publicReturn(r) {
    return {
      returnNumber: r.returnNumber, orderNumber: r.orderNumber, status: r.status, createdAt: iso(r.createdAt),
      items: (r.items || []).map((i) => ({ productId: i.productId, variantIndex: i.variantIndex, name: i.name, brand: i.brand, size: i.size, color: i.color, qty: i.qty, reason: i.reason })),
      refundAmount: r.refundAmount || 0,
      shipping: r.approval ? r.approval.shipping : null,
      message: r.approval ? r.approval.message || '' : '',
      declineReason: r.declineReason || ''
    };
  }

  async function brandContacts(vendorIds) {
    if (!vendorIds.length) return [];
    const vendors = await getVendors(vendorIds);
    return vendors.map((found, i) => {
      const v = found || {};
      return { id: vendorIds[i], label: v.brand || v.name || 'A brand', to: String(v.email || v.accountEmail || '').trim() };
    });
  }

  function send(to, email, from) {
    if (!to) return Promise.resolve();
    return sendResendEmail({ from: from || 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to, subject: email.subject, html: email.html, text: email.text })
      .catch((e) => console.error('[RETURNS] Email to', to, 'failed:', e.message));
  }

  // ---- customer: find order ----
  app.post('/api/returns/lookup', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 20)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    const orderNumber = cleanNumber(req.body && req.body.orderNumber);
    const email = cleanEmail(req.body && req.body.email);
    if (!orderNumber || !email) return res.status(400).json({ error: 'Please enter your order number and email address.' });
    try {
      const found = await findOrder(orderNumber, email);
      if (!found) return res.status(404).json({ error: 'We couldn’t find an order matching those details. Please check your order number and email address.' });
      const items = await returnableItems(found.id, found.order);
      res.json({ orderNumber: found.order.orderNumber || orderNumber, items: items.map(({ vendorId, ...i }) => i), reasons: REASONS, returnDays: RETURN_DAYS });
    } catch (e) {
      console.error('[RETURNS_LOOKUP]', e.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- customer: submit ----
  app.post('/api/returns', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 20)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    const b = req.body || {};
    const orderNumber = cleanNumber(b.orderNumber);
    const email = cleanEmail(b.email);
    const cloud = process.env.CLOUDINARY_CLOUD_NAME || '';
    const photos = (Array.isArray(b.photos) ? b.photos : []).map(String)
      .filter((u) => /^https:\/\/res\.cloudinary\.com\//.test(u) && (!cloud || u.indexOf('/' + cloud + '/') !== -1)).slice(0, 6);
    const note = String(b.note || '').trim().slice(0, 1000);
    if (!photos.length) return res.status(400).json({ error: 'Please add at least one photo of the item.' });
    try {
      const found = await findOrder(orderNumber, email);
      if (!found) return res.status(404).json({ error: 'We couldn’t find an order matching those details.' });
      const available = await returnableItems(found.id, found.order);
      const picked = [];
      for (const sel of (Array.isArray(b.items) ? b.items : [])) {
        const item = available[Number(sel.index)];
        const qty = Math.floor(Number(sel.qty) || 0);
        const reason = REASONS.includes(sel.reason) ? sel.reason : '';
        const details = String(sel.details || '').trim().slice(0, 1000);
        if (!item || !item.eligible) return res.status(400).json({ error: 'One of the items can no longer be returned. Please refresh and try again.' });
        if (!(qty > 0) || qty > item.qty) return res.status(400).json({ error: 'Please check the quantity for ' + item.name + '.' });
        if (!reason) return res.status(400).json({ error: 'Please choose a reason for ' + item.name + '.' });
        if (!details) return res.status(400).json({ error: 'Please tell us more about the issue with ' + item.name + '.' });
        picked.push(Object.assign({}, item, { qty, reason, details }));
      }
      if (!picked.length) return res.status(400).json({ error: 'Please choose at least one item to return.' });

      const ref = adminDb.collection('returns').doc();
      const returnNumber = await newReturnNumber(ref.id);
      const order = found.order;
      const vendorIds = [...new Set(picked.map((i) => i.vendorId).filter(Boolean))];
      const data = {
        returnNumber, orderId: found.id, orderNumber: order.orderNumber || orderNumber,
        customerEmail: email, customerName: order.customerName || '', customerPhone: order.customerPhone || '',
        items: picked.map(({ eligible, blocked, deadline, ordered, ...i }) => i),
        vendorIds, photos, note, status: 'submitted',
        refundAmount: Math.round(picked.reduce((a, i) => a + i.price * i.qty, 0) * 100) / 100,
        brandResponses: {},
        timeline: [{ at: new Date().toISOString(), text: 'Return requested by the customer.' }],
        createdAt: ts(), updatedAt: ts()
      };
      await ref.set(data);

      const ctx = await buildOrderEmailContext(order);
      const ret = Object.assign({}, data, { createdAt: new Date().toISOString() });
      const jobs = [send(email, orderEmails.returnRequested(ret, ctx))];
      const team = orderEmails.returnForStaff(ret, ctx, { heading: 'New return request' });
      jobs.push(send(ORDER_ALERT_EMAIL, team, 'Janedore Returns <noreply@janedore.co.za>'));
      (await brandContacts(vendorIds)).forEach((brand) => {
        const own = Object.assign({}, ret, { items: ret.items.filter((i) => i.vendorId === brand.id) });
        jobs.push(send(brand.to, orderEmails.returnForStaff(own, ctx, { heading: 'A customer wants to return your product', brand: brand.label }), 'Janedore Returns <noreply@janedore.co.za>'));
      });
      await Promise.all(jobs);
      res.json({ ok: true, returnNumber });
    } catch (e) {
      console.error('[RETURNS_SUBMIT]', e.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- customer: status ----
  app.post('/api/returns/status', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 20)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    const number = cleanNumber(req.body && req.body.returnNumber);
    const email = cleanEmail(req.body && req.body.email);
    const notFound = () => res.status(404).json({ error: 'We couldn’t find a return matching those details. Please check your return number and email address.' });
    if (!number || !email) return res.status(400).json({ error: 'Please enter your return number and email address.' });
    try {
      const nd = /^[A-Z0-9-]+$/.test(number) ? await adminDb.collection('returnNumbers').doc(number).get() : null;
      if (!nd || !nd.exists) return notFound();
      const doc = await adminDb.collection('returns').doc(nd.data().returnId).get();
      if (!doc.exists || doc.data().customerEmail !== email) return notFound();
      res.json(publicReturn(doc.data()));
    } catch (e) {
      console.error('[RETURNS_STATUS]', e.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- admin: list ----
  app.get('/api/admin/returns', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const me = await staff(req);
    if (!me || !['SUPER_ADMIN', 'ADMIN', 'VENDOR'].includes(me.role)) return res.status(403).json({ error: 'Not authorized' });
    try {
      let q = adminDb.collection('returns');
      if (me.role === 'VENDOR') {
        if (!me.vendorId) return res.json({ returns: [], role: me.role });
        q = q.where('vendorIds', 'array-contains', me.vendorId);
      }
      const snap = await q.limit(300).get();
      const list = snap.docs.map((d) => {
        const r = d.data();
        const out = Object.assign({}, r, { id: d.id, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) });
        if (me.role === 'VENDOR') {
          // A brand sees only its own lines and its own response.
          out.items = (r.items || []).filter((i) => i.vendorId === me.vendorId);
          out.brandResponses = r.brandResponses && r.brandResponses[me.vendorId] ? { [me.vendorId]: r.brandResponses[me.vendorId] } : {};
          delete out.customerPhone;
        }
        return out;
      }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.json({ returns: list, role: me.role, vendorId: me.vendorId });
    } catch (e) {
      console.error('[ADMIN_RETURNS]', e.message);
      res.status(500).json({ error: 'Could not load returns' });
    }
  });

  // ---- admin: actions ----
  app.post('/api/admin/returns/:id', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const me = await staff(req);
    if (!me) return res.status(403).json({ error: 'Not authorized' });
    const b = req.body || {};
    const action = String(b.action || '');
    const text = String(b.text || '').trim().slice(0, 1500);
    try {
      const ref = adminDb.collection('returns').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Return not found' });
      const r = doc.data();
      const isSA = me.role === 'SUPER_ADMIN';
      const now = new Date().toISOString();
      const patch = { updatedAt: ts() };
      let log = '';
      let customerStage = null;

      if (action === 'brand_accept' || action === 'brand_dispute') {
        const vid = me.role === 'VENDOR' ? me.vendorId : String(b.vendorId || '');
        if (!(isSA || me.role === 'VENDOR') || !vid || !(r.vendorIds || []).includes(vid)) return res.status(403).json({ error: 'Not authorized' });
        if (action === 'brand_dispute' && !text) return res.status(400).json({ error: 'Please explain why you dispute this return.' });
        const brand = ((r.items || []).find((i) => i.vendorId === vid) || {}).brand || 'The brand';
        patch['brandResponses.' + vid] = { decision: action === 'brand_accept' ? 'accept' : 'dispute', note: text, at: now, by: me.name };
        log = brand + (action === 'brand_accept' ? ' accepted the return.' : ' disputed the return: ' + text);
      } else {
        if (!isSA) return res.status(403).json({ error: 'Only Super Admin can decide returns.' });
        if (action === 'approve') {
          if (r.status !== 'submitted') return res.status(400).json({ error: 'This return has already been decided.' });
          const shipping = b.shipping === 'collection' ? 'collection' : 'customer';
          if (shipping === 'customer' && !text) return res.status(400).json({ error: 'Add the return address and instructions for the customer.' });
          Object.assign(patch, { status: 'approved', approval: { shipping, message: text, at: now } });
          log = 'Return approved (' + (shipping === 'collection' ? 'we arrange collection' : 'customer arranges return delivery') + ').';
          customerStage = 'approved';
        } else if (action === 'decline') {
          if (r.status !== 'submitted') return res.status(400).json({ error: 'This return has already been decided.' });
          if (!text) return res.status(400).json({ error: 'Please give the customer a reason.' });
          Object.assign(patch, { status: 'declined', declineReason: text, declinedAt: now });
          log = 'Return declined: ' + text;
          customerStage = 'declined';
        } else if (action === 'received') {
          if (r.status !== 'approved') return res.status(400).json({ error: 'Approve the return first.' });
          Object.assign(patch, { status: 'received', receivedAt: now });
          log = 'Returned item received.';
          customerStage = 'received';
        } else if (action === 'refund_start') {
          if (r.status !== 'received') return res.status(400).json({ error: 'Mark the item received first.' });
          Object.assign(patch, { status: 'refund_pending', refundStartedAt: now });
          log = 'Refund started.';
          customerStage = 'refund_pending';
        } else if (action === 'refund_confirm') {
          if (r.status !== 'refund_pending') return res.status(400).json({ error: 'Start the refund first.' });
          Object.assign(patch, { status: 'refunded', refundedAt: now });
          log = 'Refund confirmed as completed in PayFast.';
          customerStage = 'refunded';
        } else if (action === 'close') {
          Object.assign(patch, { status: 'closed', closedAt: now, closeNote: text });
          log = 'Return closed' + (text ? ': ' + text : '.');
        } else {
          return res.status(400).json({ error: 'Unknown action' });
        }
      }
      patch.timeline = admin.firestore.FieldValue.arrayUnion({ at: now, text: log, by: me.name });
      await ref.update(patch);

      const updated = Object.assign({}, r, patch, { timeline: undefined });
      if (customerStage) {
        const orderDoc = await adminDb.collection('orders').doc(r.orderId).get();
        const ctx = await buildOrderEmailContext(orderDoc.exists ? orderDoc.data() : {});
        await send(r.customerEmail, orderEmails.returnUpdate(updated, ctx, customerStage));
      }
      if (action === 'brand_dispute') {
        const ctx = await buildOrderEmailContext({ items: r.items || [] });
        await send(ORDER_ALERT_EMAIL, orderEmails.returnForStaff(r, ctx, { heading: 'A brand disputed a return', dispute: log }), 'Janedore Returns <noreply@janedore.co.za>');
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[ADMIN_RETURN_ACTION]', e.message);
      res.status(500).json({ error: 'Could not update the return' });
    }
  });
};

module.exports.OPEN_STATUSES = OPEN;
