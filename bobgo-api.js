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


  // Per-brand checkout rate quotes. Always Sandbox until the live key is enabled.
  // Product parcel data and brand pickup addresses are read from Firestore,
  // never accepted from the browser.
  app.post('/api/bobgo/checkout-rates', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!adminDb) return res.status(503).json({ ok: false, error: 'Checkout shipping is not configured.' });
    if (typeof deps.rateLimited === 'function' && deps.rateLimited(req, 'bobgo-checkout-rates', 12, 10 * 60 * 1000)) {
      return res.status(429).json({ ok: false, error: 'Please wait before checking delivery rates again.' });
    }
    const apiKey = String(process.env.BOBGO_API_KEY || '').trim();
    const baseUrl = String(process.env.BOBGO_BASE_URL || 'https://api.sandbox.bobgo.co.za/v2').trim().replace(/\/+$/, '');
    let endpoint;
    try {
      const base = new URL(baseUrl);
      if (base.protocol !== 'https:' || base.hostname !== 'api.sandbox.bobgo.co.za') throw new Error('Sandbox only');
      endpoint = new URL(base.pathname.replace(/\/$/, '') + '/rates-at-checkout', base.origin);
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'Checkout rates are currently available in Bob Go Sandbox only.' });
    }
    if (!apiKey) return res.status(503).json({ ok: false, error: 'Bob Go Sandbox API key is not configured.' });

    const a = req.body || {};
    const street = String(a.street || '').trim().slice(0, 120);
    const suburb = String(a.suburb || '').trim().slice(0, 80);
    const city = String(a.city || '').trim().slice(0, 80);
    const province = String(a.province || '').trim().slice(0, 80);
    const postal = String(a.postalCode || '').trim().slice(0, 12);
    const lines = Array.isArray(a.items) ? a.items.slice(0, 30) : [];
    if (!street || !suburb || !city || !province || !/^\d{4}$/.test(postal) || !lines.length) {
      return res.status(400).json({ ok: false, error: 'Complete your delivery address before checking rates.' });
    }
    if (lines.some(i => !i || typeof i.productId !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(i.productId) || !Number.isInteger(Number(i.qty)) || Number(i.qty) < 1 || Number(i.qty) > 20)) {
      return res.status(400).json({ ok: false, error: 'Your bag contains an invalid item or quantity. Please refresh your bag.' });
    }

    try {
      const ids = [...new Set(lines.map(i => String(i.productId)))];
      const productDocs = await adminDb.getAll(...ids.map(id => adminDb.collection('products').doc(id)));
      const products = {};
      productDocs.forEach((d, i) => { if (d.exists) products[ids[i]] = d.data(); });
      if (ids.some(id => !products[id])) return res.status(409).json({ ok: false, error: 'A product in your bag is no longer available.' });

      const vendorIdFor = p => (!p.vendorId || p.vendorId === 'vendor-janedore' || String(p.brand || '').trim().toUpperCase() === 'JANEDORE') ? 'vendor-janedore' : String(p.vendorId);
      const vendorIds = [...new Set(ids.map(id => vendorIdFor(products[id])))];
      const [pubDocs, privateDocs] = await Promise.all([
        adminDb.getAll(...vendorIds.map(id => adminDb.collection('vendors').doc(id))),
        adminDb.getAll(...vendorIds.map(id => adminDb.collection('vendorPrivate').doc(id)))
      ]);
      const vendors = {};
      vendorIds.forEach((id, i) => { vendors[id] = Object.assign({}, pubDocs[i].exists ? pubDocs[i].data() : {}, privateDocs[i].exists ? privateDocs[i].data() : {}); });

      const groups = new Map();
      const groupingDiagnostics = [];
      lines.forEach(line => {
        const p = products[line.productId], vid = vendorIdFor(p), vendor = vendors[vid] || {};
        const wh = String(vendor.warehouse || '').trim().toLowerCase();
        const key = wh ? 'warehouse:' + wh : vid;
        groupingDiagnostics.push({
          productId: line.productId,
          productName: String(p.name || '').slice(0, 80),
          brand: String(p.brand || ''),
          resolvedVendorId: vid,
          warehouseGroup: wh || null,
          shipmentKey: key
        });
        if (!groups.has(key)) groups.set(key, { key, vendorIds: new Set(), items: [], total: 0 });
        const g = groups.get(key), qty = Number(line.qty), parcel = p.parcel || {};
        const weight = Number(p.shippingWeight), length = Number(parcel.lengthCm), width = Number(parcel.widthCm), height = Number(parcel.heightCm);
        if (!(weight > 0) || !(length > 0) || !(width > 0) || !(height > 0)) {
          throw Object.assign(new Error('Shipping weight and packed parcel dimensions are missing for ' + String(p.name || 'a product') + '. Add them under Admin → Products → Shipping.'), { status: 422 });
        }
        const price = Number(p.salePrice) > 0 && Number(p.salePrice) < Number(p.price) ? Number(p.salePrice) : Number(p.price) || 0;
        g.vendorIds.add(vid); g.total += price * qty;
        g.items.push({ description: String(p.name || 'JANEDORE item').slice(0, 100), sku: String(p.sku || line.productId).slice(0, 80), price, quantity: qty, length_cm: length, width_cm: width, height_cm: height, weight_kg: weight });
      });

      console.info('[BOBGO CHECKOUT] Cart products grouped for rate requests:', groupingDiagnostics);
      const shipments = [];
      for (const g of groups.values()) {
        const vids = [...g.vendorIds], pickups = vids.map(id => vendors[id] && vendors[id].pickup);
        const valid = p => p && p.street && p.suburb && p.city && p.province && /^\d{4}$/.test(String(p.postalCode || ''));
        if (pickups.some(p => !valid(p))) throw Object.assign(new Error('Please add a complete pickup address for every brand under Admin → Brands.'), { status: 422 });
        const pickup = pickups[0];
        const same = p => ['street','suburb','city','province','postalCode'].every(k => String(p[k] || '').trim().toLowerCase() === String(pickup[k] || '').trim().toLowerCase());
        if (pickups.some(p => !same(p))) throw Object.assign(new Error('Brands sharing a warehouse must have the same pickup address.'), { status: 422 });

        const payload = JSON.stringify({
          collection_address: { type: pickup.type === 'residential' ? 'residential' : 'business', company: String(pickup.company || 'JANEDORE brand'), street_address: pickup.street, local_area: pickup.suburb, city: pickup.city, zone: pickup.province, country: 'ZA', code: String(pickup.postalCode) },
          delivery_address: { type: 'residential', street_address: street, local_area: suburb, city, zone: province, country: 'ZA', code: postal },
          // Customer checkout is door-to-door only. Bob Go's "door" filter
          // can also include in-store pickup, so the response is strictly
          // filtered to type === "door" below.
          delivery_type: ['door'],
          items: g.items, order_total_price: Math.round(g.total * 100) / 100, handling_time: 2
        });
        const result = await new Promise((resolve, reject) => {
          const request = https.request({ hostname: endpoint.hostname, path: endpoint.pathname, method: 'POST', timeout: 20000, headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) request.destroy(new Error('Bob Go response was too large.')); });
            response.on('end', () => { let data = {}; try { data = body ? JSON.parse(body) : {}; } catch (_) {} resolve({ status: response.statusCode || 0, data }); });
          });
          request.on('timeout', () => request.destroy(new Error('Bob Go did not respond within 20 seconds.')));
          request.on('error', reject); request.write(payload); request.end();
        });
        if (result.status < 200 || result.status >= 300) throw Object.assign(new Error(String(result.data.message || result.data.error || ('Bob Go returned HTTP ' + result.status)).slice(0, 250)), { status: 502 });
        const rawRates = Array.isArray(result.data.rates) ? result.data.rates : [];
        console.info('[BOBGO CHECKOUT] Raw Bob Go rates:', {
          shipmentKey: g.key,
          httpStatus: result.status,
          rateCount: rawRates.length,
          rateTypes: rawRates.map(rate => String(rate.type || 'unspecified')),
          rateNames: rawRates.slice(0, 12).map(rate => String(rate.service_name || rate.name || 'Unnamed')),
          responseKeys: Object.keys(result.data || {})
        });
        // Customer checkout only offers delivery to the customer's street
        // address. Do not expose recipient pickup points or in-store collection.
        // Bob Go returns service_level_priority in the configured account order.
        const mapped = rawRates.map((rate, index) => {
          if (String(rate.type || '').toLowerCase() !== 'door') return null;
          const name = String(rate.service_name || rate.serviceName || rate.courier_name || rate.name || 'Delivery');
          const price = Number(rate.total_price ?? rate.price);
          if (!Number.isFinite(price) || price < 0) return null;
          const levelText = String(rate.service_level_name || rate.service_level || rate.service_level_code || name);
          const levelLower = levelText.toLowerCase();
          const checkoutLabel = levelLower.includes('express') ? 'Express Shipping'
            : levelLower.includes('standard') ? 'Standard Shipping'
            : levelText;
          return {
            key: String(rate.service_code || rate.id || ('door-' + index)),
            serviceName: name,
            checkoutLabel,
            price,
            description: String(rate.description || '').slice(0, 160),
            minDeliveryDate: rate.min_delivery_date || rate.minDeliveryDate || null,
            maxDeliveryDate: rate.max_delivery_date || rate.maxDeliveryDate || null,
            bobgoRateId: rate.id == null ? null : rate.id,
            serviceCode: rate.service_code || null,
            type: 'door',
            serviceLevelCode: rate.service_level_code || null,
            serviceLevelPriority: rate.service_level_priority == null || rate.service_level_priority === ''
              ? null : Number.isFinite(Number(rate.service_level_priority)) ? Number(rate.service_level_priority) : null,
            sourceOrder: index
          };
        }).filter(Boolean);
        const byBobGoPriority = (x, y) => {
          if (x.serviceLevelPriority != null && y.serviceLevelPriority != null) {
            return x.serviceLevelPriority - y.serviceLevelPriority || x.sourceOrder - y.sourceOrder;
          }
          if (x.serviceLevelPriority != null) return -1;
          if (y.serviceLevelPriority != null) return 1;
          return x.sourceOrder - y.sourceOrder;
        };
        const deliveryOptions = mapped.sort(byBobGoPriority);
        const standard = deliveryOptions.find(rate => rate.checkoutLabel === 'Standard Shipping') || deliveryOptions[0] || null;

        shipments.push({
          key: g.key,
          vendorIds: vids,
          brand: vids.map(id => String((vendors[id] && (vendors[id].brand || vendors[id].name)) || id)).join(' & '),
          rates: { standard, deliveryOptions }
        });
      }
      console.info('[BOBGO CHECKOUT] Separate Bob Go quotes returned:', shipments.map(s => ({ key: s.key, brand: s.brand, hasStandard: !!s.rates.standard, deliveryOptionCount: s.rates.deliveryOptions.length })));
      return res.json({ ok: true, sandbox: true, shipments });
    } catch (e) {
      console.error('[BOBGO CHECKOUT RATES]', e.message);
      return res.status(e.status || 502).json({ ok: false, error: e.message || 'Could not retrieve Bob Go delivery rates.' });
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
