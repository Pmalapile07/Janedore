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
const https = require('https');

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
  const { adminDb, admin, orderShipments, allPackagesDone, sendOrderStatusEmail, sendResendEmail, alertEmail } = deps;

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
    // Every courier package delivered and every collected one (if any,
    // collection-api.js) collected.
    const delivered = (s) => DONE.includes(statuses[refKey(s.tracking.trackingNumber)]);
    const current = String(order.status || '').toLowerCase();
    let next = null;
    if (order.paymentStatus === 'paid') {
      if (allPackagesDone(order, delivered) && (BEFORE_SHIPPED.includes(current) || current === 'shipped')) next = 'delivered';
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

  // Super Admin-only connection test. Uses Bob Go's documented sample lane
  // and a harmless sample parcel; this requests checkout rates only and
  // never creates an order, shipment, label or booking.
  app.post('/api/admin/bobgo/test-rates', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!adminDb) return res.status(503).json({ ok: false, error: 'Firebase Admin is not configured on the server.' });
    if (typeof deps.rateLimited === 'function' && deps.rateLimited(req, 'bobgo-rate-test', 3, 60 * 60 * 1000)) {
      return res.status(429).json({ ok: false, error: 'Please wait before running another Bob Go test.' });
    }
    const match = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ ok: false, error: 'Please sign in to Admin again, then retry.' });
    try {
      const decoded = await admin.auth().verifyIdToken(match[1]);
      const staffDoc = await adminDb.collection('admins').doc(decoded.uid).get();
      const role = staffDoc.exists ? String((staffDoc.data() || {}).role || '').toUpperCase() : '';
      if (role !== 'SUPER_ADMIN') return res.status(403).json({ ok: false, error: 'Only the Super Admin can run this test.' });
    } catch (e) {
      return res.status(401).json({ ok: false, error: 'Your Admin session could not be verified. Please sign in again.' });
    }

    const apiKey = String(process.env.BOBGO_API_KEY || '').trim();
    if (!apiKey) return res.status(503).json({ ok: false, error: 'BOBGO_API_KEY is missing from Render environment variables.' });
    const configuredBase = String(process.env.BOBGO_BASE_URL || 'https://api.sandbox.bobgo.co.za/v2').trim().replace(/\/+$/, '');
    let endpoint;
    try {
      const base = new URL(configuredBase);
      if (base.protocol !== 'https:' || !['api.sandbox.bobgo.co.za', 'api.bobgo.co.za'].includes(base.hostname)) throw new Error('unsupported host');
      endpoint = new URL(base.pathname.replace(/\/$/, '') + '/rates-at-checkout', base.origin);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'BOBGO_BASE_URL must be the official Bob Go Sandbox or Production API URL ending in /v2.' });
    }

    const payload = JSON.stringify({
      collection_address: {
        type: 'business', company: 'JANEDORE test', street_address: '125 Dallas Avenue',
        local_area: 'Newlands', city: 'Pretoria', zone: 'Gauteng', country: 'ZA', code: '0181'
      },
      delivery_address: {
        type: 'residential', street_address: '5 Long Street',
        local_area: 'Cape Town City Centre', city: 'Cape Town',
        zone: 'Western Cape', country: 'ZA', code: '8001'
      },
      items: [{
        description: 'JANEDORE sample parcel', sku: 'JANEDORE-BOBGO-TEST',
        price: 200, quantity: 1, length_cm: 17, width_cm: 8, height_cm: 5, weight_kg: 0.4
      }],
      order_total_price: 200,
      handling_time: 2
    });

    try {
      const result = await new Promise((resolve, reject) => {
        const request = https.request({
          hostname: endpoint.hostname, path: endpoint.pathname, method: 'POST', timeout: 25000,
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, response => {
          let body = '';
          response.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) request.destroy(new Error('Bob Go response was too large.')); });
          response.on('end', () => {
            let data = {};
            try { data = body ? JSON.parse(body) : {}; } catch (e) { data = {}; }
            resolve({ status: response.statusCode || 0, data });
          });
        });
        request.on('timeout', () => request.destroy(new Error('Bob Go did not respond within 25 seconds.')));
        request.on('error', reject);
        request.write(payload);
        request.end();
      });

      if (result.status < 200 || result.status >= 300) {
        const message = String(result.data.message || result.data.error || '').slice(0, 300);
        const hint = result.status === 401 ? 'Check that BOBGO_API_KEY is a Sandbox key and matches BOBGO_BASE_URL.'
          : result.status === 403 ? 'The API key may not have API access or the account plan may not allow this endpoint.'
          : result.status === 423 ? 'The Bob Go account is closed.'
          : '';
        return res.status(200).json({
          ok: false, httpStatus: result.status,
          error: message || ('Bob Go returned HTTP ' + result.status + '.'),
          hint
        });
      }

      const rates = Array.isArray(result.data.rates) ? result.data.rates : [];
      return res.json({
        ok: true,
        environment: endpoint.hostname === 'api.sandbox.bobgo.co.za' ? 'Sandbox' : 'Production',
        rateCount: rates.length,
        rates: rates.slice(0, 10).map(rate => ({
          serviceName: String(rate.service_name || 'Delivery').slice(0, 100),
          price: Number(rate.total_price) || 0,
          currency: String(rate.currency || 'ZAR'),
          description: String(rate.description || '').slice(0, 160),
          type: String(rate.type || ''),
          minDeliveryDate: rate.min_delivery_date || null,
          maxDeliveryDate: rate.max_delivery_date || null
        })),
        message: rates.length ? 'Bob Go connection and rate request are working.' : 'Bob Go accepted the request, but returned no rates for this sample route. Check your Bob Go checkout rate rules and service areas.'
      });
    } catch (e) {
      console.error('[BOBGO TEST] Request failed:', e.message);
      return res.status(502).json({ ok: false, error: e.message || 'Could not reach Bob Go. Please try again.' });
    }
  });

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
