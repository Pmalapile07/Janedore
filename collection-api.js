// ==================== COLLECTION ====================
// A brand Super Admin approved for collection (vendors/{id}.collectionOffer,
// a shop, studio or business address, never a home) can be picked at
// checkout instead of delivery: order.collectFrom lists those brands, and
// their packages have no courier and no delivery fee (server.js
// priceOrder). Each package then goes:
// - Ready for collection: the brand (or staff) marks it in admin. The
//   customer is emailed the address (vendorPrivate/{id}.collection), the
//   hours and a 6-digit collection code. The code lives only in
//   collectionCodes/{orderId}__{key} (server only), so the brand can't
//   see it and nobody can mark a parcel collected without the customer.
// - Collected: the brand enters the code the customer gives them. Three
//   wrong codes lock the package: the customer and the team are emailed,
//   and only Janedore customer care (staff) can send a new code; a brand
//   can't. When every
//   package is collected (or delivered, per Bob Go), the order becomes
//   Delivered: delivered email, 14-day return window, review request.
// - Not collected: a reminder 7 days after it was ready; after 14 days
//   the team is emailed to contact the customer, then cancel and refund.
// Progress is order.collection[key] { readyAt, collectedAt, ... }, key
// vendorId (+ '__preorder' for a brand's pre-order package).

const crypto = require('crypto');

const DAY = 24 * 60 * 60 * 1000;
const REMIND_AFTER = 7 * DAY;
const HOLD_FOR = 14 * DAY;
const MAX_ATTEMPTS = 3;
const COURIER_DONE = ['delivered', 'finalised'];

module.exports = function registerCollection(app, deps) {
  const { adminDb, admin, orderShipments, collectionKey, allPackagesDone, authorizeShipmentRequest,
    sendOrderStatusEmail, sendResendEmail, buildOrderEmailContext, orderEmails, alertEmail, houseVendorId } = deps;

  const timeline = (text) => admin.firestore.FieldValue.arrayUnion({ text, at: new Date().toISOString() });
  const codeRef = (orderId, key) => adminDb.collection('collectionCodes').doc(orderId + '__' + key);
  const holdText = (readyAt) => new Date(readyAt + HOLD_FOR).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' });
  // Bob Go's latest status for a courier package (bobgo-api.js).
  const courierDone = (order) => (s) => {
    const ref = String(s.tracking.trackingNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 60);
    return !!ref && COURIER_DONE.includes(((order.bobgo || {})[ref] || {}).status);
  };

  // Where the customer collects: the brand's private collection address.
  async function collectionPlace(vendorId) {
    const [pub, priv] = await Promise.all([
      adminDb.collection('vendors').doc(vendorId).get(),
      adminDb.collection('vendorPrivate').doc(vendorId).get()
    ]);
    const v = pub.exists ? pub.data() : {};
    const c = (priv.exists && priv.data().collection) || {};
    return {
      brand: v.brand || v.name || 'the brand',
      hours: String((v.collectionOffer || {}).hours || ''),
      instructions: String(c.instructions || ''),
      addressLines: [c.company, c.street, [c.suburb, c.city].filter(Boolean).join(', '), [c.province, c.postalCode].filter(Boolean).join(', ')].filter(Boolean)
    };
  }

  // Next time the sweep below needs to look at this order.
  function nextDue(collection) {
    let due = null;
    Object.values(collection || {}).forEach((c) => {
      if (!c || !c.readyAt || c.collectedAt) return;
      const at = !c.remindedAt ? c.readyAt + REMIND_AFTER : !c.overdueAt ? c.readyAt + HOLD_FOR : null;
      if (at && (due === null || at < due)) due = at;
    });
    return due;
  }

  async function emailCustomer(order, shipment, code, reminder) {
    if (!order.customerEmail) return { skipped: 'No customer email' };
    const place = await collectionPlace(shipment.vendorId || houseVendorId);
    if (!place.addressLines.length) throw new Error('The brand has no collection address');
    const ctx = await buildOrderEmailContext(order);
    const email = orderEmails.readyForCollection(order, ctx, shipment.items, {
      brand: place.brand, addressLines: place.addressLines, hours: place.hours, instructions: place.instructions,
      code, holdUntil: holdText(shipment.collection.readyAt || Date.now()), reminder
    });
    await sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: order.customerEmail, subject: email.subject, html: email.html, text: email.text });
    return { sentTo: order.customerEmail };
  }

  // Code locked: the customer is told to contact customer care (and to
  // say so if it wasn't them), and the team is alerted.
  async function notifyLocked(order, shipment) {
    const num = order.orderNumber || '';
    if (order.customerEmail) {
      const ctx = await buildOrderEmailContext(order);
      const email = orderEmails.collectionLocked(order, ctx, { brand: shipment.brand });
      await sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: order.customerEmail, subject: email.subject, html: email.html, text: email.text });
    }
    if (alertEmail) await sendResendEmail({
      from: 'Janedore Orders <noreply@janedore.co.za>', to: alertEmail,
      subject: 'Collection code locked: order #' + num + ' (' + shipment.brand + ')',
      text: 'Three incorrect collection codes were entered at ' + shipment.brand + ' for order #' + num + '. The order is locked.\n\nCustomer: ' + (order.customerName || '') + ' <' + (order.customerEmail || '') + '> ' + (order.customerPhone || '') + '\n\nConfirm with the customer that they are collecting, then send a new code from the order in admin.',
      html: '<p>Three incorrect collection codes were entered at ' + shipment.brand + ' for order #' + num + '. The order is locked.</p><p>Customer: ' + (order.customerName || '') + ' &lt;' + (order.customerEmail || '') + '&gt; ' + (order.customerPhone || '') + '</p><p>Confirm with the customer that they are collecting, then send a new code from the order in admin.</p>'
    });
  }

  // Every package collected or delivered: the order is Delivered.
  async function finishIfDone(orderRef) {
    const order = (await orderRef.get()).data();
    const status = String(order.status || '').toLowerCase();
    if (order.paymentStatus !== 'paid' || ['delivered', 'cancelled', 'refunded'].includes(status)) return null;
    if (!allPackagesDone(order, courierDone(order))) return null;
    const now = new Date().toISOString();
    await orderRef.update({ status: 'delivered', deliveredAt: now, updatedAt: now, timeline: timeline('Every package was collected or delivered, so the order is now Delivered.') });
    let note;
    try {
      const r = await sendOrderStatusEmail(orderRef, (await orderRef.get()).data());
      note = r.sentTo ? 'Delivered email sent to ' + r.sentTo + '.' : 'Delivered email not sent: ' + r.skipped + '.';
    } catch (e) { note = 'Delivered email not sent: ' + e.message + '.'; }
    await orderRef.update({ timeline: timeline(note) });
    return 'delivered';
  }

  // body: { vendorId, preorder, action: 'ready' | 'collected', code }.
  // 'ready' again sends a new code (the old one stops working).
  app.post('/api/orders/:id/collection', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    try {
      const body = req.body || {};
      const vendorId = String(body.vendorId || houseVendorId);
      const auth = await authorizeShipmentRequest(req, vendorId);
      if (!auth.ok) return res.status(403).json({ error: auth.reason || 'Not authorized' });
      const orderRef = adminDb.collection('orders').doc(req.params.id);
      const doc = await orderRef.get();
      if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
      const order = doc.data();
      if (order.paymentStatus !== 'paid' || ['cancelled', 'refunded'].includes(String(order.status || '').toLowerCase())) {
        return res.status(400).json({ error: 'This order isn’t paid, or has been cancelled.' });
      }
      const shipment = orderShipments(order).find((s) => s.collect && (s.vendorId || houseVendorId) === vendorId && s.preorder === !!body.preorder);
      if (!shipment) return res.status(400).json({ error: 'These items aren’t being collected.' });
      const key = collectionKey(shipment);
      const state = shipment.collection;
      if (state.collectedAt) return res.status(400).json({ error: 'Already collected.' });
      const label = shipment.brand + (shipment.preorder ? ' pre-order' : '');

      if (body.action === 'ready') {
        // A new code (the customer asked customer care) is staff only.
        if (state.readyAt && !auth.staff) return res.status(403).json({ error: 'Only Janedore customer care can send a new collection code.' });
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const readyAt = state.readyAt || Date.now();
        await codeRef(doc.id, key).set({ code, attempts: 0, createdAt: Date.now() });
        const collection = Object.assign({}, order.collection, { [key]: Object.assign({}, state, { readyAt, codeSentAt: Date.now(), locked: false }) });
        const due = nextDue(collection);
        await orderRef.update({
          ['collection.' + key]: collection[key],
          collectionReminderDue: due === null ? admin.firestore.FieldValue.delete() : due,
          timeline: timeline(state.readyAt ? label + ': a new collection code was sent.' : label + ' marked ready for collection.')
        });
        shipment.collection = collection[key];
        let result;
        try { result = await emailCustomer(order, shipment, code, false); }
        catch (e) { result = { skipped: e.message }; }
        await orderRef.update({ timeline: timeline(result.sentTo ? 'Collection email sent to ' + result.sentTo + '.' : 'Collection email not sent: ' + result.skipped + '.') });
        return res.json(Object.assign({ ok: true }, result));
      }

      if (body.action === 'collected') {
        if (!state.readyAt) return res.status(400).json({ error: 'Mark it ready for collection first.' });
        const given = String(body.code || '').replace(/\D/g, '');
        const ref = codeRef(doc.id, key);
        const outcome = await adminDb.runTransaction(async (tx) => {
          const c = await tx.get(ref);
          if (!c.exists) return 'nocode';
          const saved = c.data();
          if ((saved.attempts || 0) >= MAX_ATTEMPTS) return 'locked';
          const ok = given.length === 6 && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(String(saved.code)));
          if (!ok) { tx.update(ref, { attempts: (saved.attempts || 0) + 1 }); return (saved.attempts || 0) + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong'; }
          tx.delete(ref);
          return 'ok';
        });
        if (outcome === 'nocode') return res.status(400).json({ error: 'No collection code was sent. Mark it ready for collection again.' });
        if (outcome !== 'ok') {
          if (outcome === 'locked' && !state.locked) {
            await orderRef.update({ ['collection.' + key + '.locked']: true, timeline: timeline(label + ': collection code locked after ' + MAX_ATTEMPTS + ' incorrect attempts. Customer care must send the customer a new code.') });
            await notifyLocked(order, shipment).catch((e) => console.error('[COLLECTION] Lock emails:', e.message));
          }
          return res.status(400).json({
            error: outcome === 'locked' ? 'The code has been locked after ' + MAX_ATTEMPTS + ' incorrect attempts. The customer must contact Janedore customer care for a new code.' : 'That code isn’t right. Ask the customer to check their email.',
            locked: outcome === 'locked'
          });
        }
        const now = Date.now();
        const collection = Object.assign({}, order.collection, { [key]: Object.assign({}, state, { collectedAt: now, locked: false }) });
        const due = nextDue(collection);
        await orderRef.update({
          ['collection.' + key]: collection[key],
          collectionReminderDue: due === null ? admin.firestore.FieldValue.delete() : due,
          timeline: timeline(label + ' collected by the customer (collection code checked).')
        });
        const next = await finishIfDone(orderRef);
        return res.json({ ok: true, collectedAt: now, status: next });
      }
      res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      console.error('[COLLECTION]', e.message);
      res.status(500).json({ error: 'Could not update the collection', reason: e.message });
    }
  });

  // Hourly: a reminder after 7 days, and the team told after 14.
  async function sweepCollections() {
    if (!adminDb) return;
    const snap = await adminDb.collection('orders').where('collectionReminderDue', '<=', Date.now()).limit(50).get();
    for (const doc of snap.docs) {
      const order = doc.data();
      const collection = Object.assign({}, order.collection);
      const now = Date.now();
      const status = String(order.status || '').toLowerCase();
      if (['cancelled', 'refunded'].includes(status)) { await doc.ref.update({ collectionReminderDue: admin.firestore.FieldValue.delete() }); continue; }
      const updates = {};
      const notes = [];
      for (const s of orderShipments(order).filter((x) => x.collect)) {
        const key = collectionKey(s);
        const c = collection[key];
        if (!c || !c.readyAt || c.collectedAt) continue;
        const label = s.brand + (s.preorder ? ' pre-order' : '');
        try {
          if (!c.remindedAt && now >= c.readyAt + REMIND_AFTER) {
            const saved = await codeRef(doc.id, key).get();
            if (saved.exists) await emailCustomer(order, s, saved.data().code, true);
            collection[key] = Object.assign({}, c, { remindedAt: now });
            notes.push(label + ': collection reminder ' + (saved.exists ? 'sent to ' + order.customerEmail : 'not sent (no code; send a new one)') + '.');
          } else if (c.remindedAt && !c.overdueAt && now >= c.readyAt + HOLD_FOR) {
            const num = order.orderNumber || doc.id;
            if (alertEmail) await sendResendEmail({
              from: 'Janedore Orders <noreply@janedore.co.za>', to: alertEmail,
              subject: 'Not collected: order #' + num + ' (' + s.brand + ')',
              text: 'Order #' + num + ' has been ready to collect from ' + s.brand + ' for 14 days and has not been collected.\n\nCustomer: ' + (order.customerName || '') + ' <' + (order.customerEmail || '') + '> ' + (order.customerPhone || '') + '\n\nContact the customer. If they no longer want it, cancel the order and refund it.',
              html: '<p>Order #' + num + ' has been ready to collect from ' + s.brand + ' for 14 days and has not been collected.</p><p>Customer: ' + (order.customerName || '') + ' &lt;' + (order.customerEmail || '') + '&gt; ' + (order.customerPhone || '') + '</p><p>Contact the customer. If they no longer want it, cancel the order and refund it.</p>'
            });
            collection[key] = Object.assign({}, c, { overdueAt: now });
            notes.push(label + ': not collected after 14 days. The team was emailed to contact the customer, then cancel and refund if needed.');
          }
        } catch (e) { console.error('[COLLECTION_SWEEP]', doc.id, key, e.message); }
      }
      if (notes.length) updates.timeline = admin.firestore.FieldValue.arrayUnion(...notes.map((text) => ({ text, at: new Date().toISOString() })));
      const due = nextDue(collection);
      Object.keys(collection).forEach((k) => { updates['collection.' + k] = collection[k]; });
      updates.collectionReminderDue = due === null ? admin.firestore.FieldValue.delete() : (due <= now ? now + DAY : due);
      await doc.ref.update(updates).catch((e) => console.error('[COLLECTION_SWEEP]', doc.id, e.message));
    }
  }
  setInterval(() => sweepCollections().catch((e) => console.error('[COLLECTION_SWEEP]', e.message)), 60 * 60 * 1000).unref();

  return { collectionPlace, finishIfDone, sweepCollections };
};
