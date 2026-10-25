// ==================== BOB GO: TRACKING UPDATES ====================
// Bob Go (the courier platform) posts every tracking event for a parcel
// to /api/bobgo/webhook (topic tracking/updated). Each one is matched to
// its order by the package's tracking number (order.trackingRefs, kept by
// server.js notify-shipped), saved on the order (order.bobgo), and moves
// the order along with no one clicking:
// - a parcel collected or on its way: the order becomes Shipped;
// - every parcel delivered: the order becomes Delivered, which sends the
//   delivered email, starts the 14-day return window (deliveredAt) and
//   schedules the review request (server.js sendOrderStatusEmail);
// - a delivery problem (failed delivery, returned to sender...): noted in
//   the order's timeline and emailed to the team.
// Each step goes in the order's timeline, emailed or not, as when staff
// change it in admin. Off until BOBGO_WEBHOOK_SECRET is set: every
// delivery must carry Bob Go's signature (an HMAC-SHA256 of the raw body
// with that secret, base64), or it's refused. Subscribe the URL to
// tracking/updated in Bob Go (Settings → Webhook subscriptions).
// Every delivery is logged in bobgoEvents (server only).

const crypto = require('crypto');

// Bob Go statuses (Create a shipment > Statuses).
const MOVING = ['collected', 'in-transit', 'out-for-delivery', 'ready-for-pickup'];
const DONE = ['delivered', 'finalised'];
const PROBLEMS = ['collection-exception', 'delivery-exception', 'failed-collection', 'failed-delivery', 'returned-to-sender', 'cancelled-by-courier'];
// Shown in the order's timeline; in-transit scans are too many to list.
const MILESTONES = ['collected', 'out-for-delivery', 'ready-for-pickup', 'delivered'].concat(PROBLEMS);
// Order statuses Bob Go may move forward from (never a cancelled or
// refunded order).
const BEFORE_SHIPPED = ['', 'pending', 'processing', 'packed'];

module.exports = function registerBobGo(app, deps) {
  const { adminDb, admin, orderShipments, sendOrderStatusEmail, sendResendEmail, alertEmail } = deps;

  function signatureOk(req) {
    const secret = process.env.BOBGO_WEBHOOK_SECRET;
    const got = String(req.headers['bobgo-webhook-signature'] || '');
    if (!secret || !got || !req.rawBody) return false;
    const want = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
    const a = Buffer.from(got), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const refKey = (ref) => String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 60);
  const timeline = (text) => admin.firestore.FieldValue.arrayUnion({ text, at: new Date().toISOString() });

  async function handleTracking(t) {
    const ref = String(t.shipment_tracking_reference || '').trim().toUpperCase();
    const status = String(t.status || '').toLowerCase();
    if (!ref || !status) return 'no tracking reference or status';
    const snap = await adminDb.collection('orders').where('trackingRefs', 'array-contains', ref).limit(1).get();
    if (snap.empty) return 'no order with this tracking number';
    const orderRef = snap.docs[0].ref;
    const order = snap.docs[0].data();
    const key = refKey(ref);
    const prev = (order.bobgo || {})[key] || {};
    // Repeats are expected: the same status again changes nothing.
    if (prev.status === status) return 'repeat';

    const pkg = orderShipments(order).find((s) => String(s.tracking.trackingNumber || '').trim().toUpperCase() === ref);
    const label = (pkg ? pkg.brand + (pkg.preorder ? ' pre-order' : '') : 'Package') + ' (' + ref + ')';
    const friendly = String(t.status_friendly || status.replace(/-/g, ' '));
    const update = {
      ['bobgo.' + key]: {
        status, statusFriendly: friendly, trackingUrl: (t.shipment && t.shipment.tracking_url) || prev.trackingUrl || null,
        lastCheckpointTime: t.last_checkpoint_time || null, at: new Date().toISOString()
      }
    };
    if (MILESTONES.includes(status)) update.timeline = timeline(label + ': ' + friendly + ' (Bob Go).');

    // The order's status, from every package's latest Bob Go status.
    const statuses = Object.assign({}, ...Object.entries(order.bobgo || {}).map(([k, v]) => ({ [k]: v.status })), { [key]: status });
    const refs = orderShipments(order).map((s) => refKey(s.tracking.trackingNumber)).filter((k) => k && k !== '_');
    const current = String(order.status || '').toLowerCase();
    let next = null;
    if (order.paymentStatus === 'paid') {
      if (refs.length && refs.every((k) => DONE.includes(statuses[k])) && (BEFORE_SHIPPED.includes(current) || current === 'shipped')) next = 'delivered';
      else if ((MOVING.includes(status) || DONE.includes(status)) && BEFORE_SHIPPED.includes(current)) next = 'shipped';
    }
    if (next) {
      update.status = next;
      update.updatedAt = new Date().toISOString();
      if (next === 'delivered') update.deliveredAt = new Date().toISOString();
    }
    await orderRef.update(update);

    if (next) {
      await orderRef.update({ timeline: timeline('Bob Go changed the order status to ' + next.charAt(0).toUpperCase() + next.slice(1) + '.') });
      const fresh = (await orderRef.get()).data();
      let note;
      try {
        const r = await sendOrderStatusEmail(orderRef, fresh);
        const name = next.charAt(0).toUpperCase() + next.slice(1) + ' email';
        note = r.sentTo ? name + ' sent to ' + r.sentTo + '.' : name + ' not sent: ' + r.skipped + '.';
      } catch (e) { note = next + ' email not sent: ' + e.message + '.'; }
      await orderRef.update({ timeline: timeline(note) });
    }

    if (PROBLEMS.includes(status) && alertEmail) {
      const num = order.orderNumber || snap.docs[0].id;
      sendResendEmail({
        from: 'Janedore Orders <noreply@janedore.co.za>', to: alertEmail,
        subject: 'Delivery problem: order #' + num + ' (' + friendly + ')',
        text: 'Bob Go reports "' + friendly + '" for ' + label + ' on order #' + num + '.\n\nCustomer: ' + (order.customerName || '') + ' <' + (order.customerEmail || '') + '>\n' +
          (update['bobgo.' + key].trackingUrl ? 'Tracking: ' + update['bobgo.' + key].trackingUrl + '\n' : '') + '\nCheck the shipment in Bob Go and contact the customer if needed.',
        html: '<p>Bob Go reports <strong>' + friendly + '</strong> for ' + label + ' on order #' + num + '.</p><p>Customer: ' + (order.customerName || '') + ' &lt;' + (order.customerEmail || '') + '&gt;</p><p>Check the shipment in Bob Go and contact the customer if needed.</p>'
      }).catch((e) => console.warn('[BOBGO] Alert email failed:', e.message));
    }
    return next ? 'order ' + next : 'saved';
  }

  app.post('/api/bobgo/webhook', (req, res) => {
    if (!adminDb || !process.env.BOBGO_WEBHOOK_SECRET) return res.status(503).json({ error: 'Not configured' });
    if (!signatureOk(req)) return res.status(401).json({ error: 'Bad signature' });
    // Answer first (Bob Go waits at most 20 seconds), then do the work.
    res.json({ ok: true });
    const topic = String(req.headers['x-bobgroup-topic'] || '');
    const body = req.body || {};
    const log = adminDb.collection('bobgoEvents').doc();
    const ref = String(body.shipment_tracking_reference || body.tracking_reference || '').toUpperCase();
    (topic === 'tracking/updated' ? handleTracking(body) : Promise.resolve('topic not used yet'))
      .then((result) => log.set({ topic, ref, status: body.status || null, result, receivedAt: Date.now() }))
      .catch((e) => {
        console.error('[BOBGO] Webhook failed:', topic, ref, e.message);
        return log.set({ topic, ref, status: body.status || null, result: 'error: ' + e.message, receivedAt: Date.now() });
      })
      .catch(() => {});
  });
};
