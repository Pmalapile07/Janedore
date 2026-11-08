// ==================== BOB GO: AUTOMATED BRAND SHIPMENT BOOKING ====================
// Brands mark a parcel ready; JANEDORE rates and books it with Bob Go.
// A transaction lock prevents repeated clicks from creating duplicate bookings.
// Bob Go submission is asynchronous: the tracking reference exists immediately,
// while courier acceptance and the waybill arrive later through webhooks.

const https = require('https');

module.exports = function registerBobGoBooking(app, deps) {
  const { adminDb, admin, orderShipments, authorizeShipmentRequest, rateLimited, sendResendEmail } = deps;

  function bobgoRequest(base, apiKey, path, payload) {
    const body = payload == null ? null : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const url = new URL(base.replace(/\/+$/, '') + path);
      const request = https.request({
        hostname: url.hostname, path: url.pathname + url.search,
        method: body ? 'POST' : 'GET', timeout: 25000,
        headers: Object.assign({
          Authorization: 'Bearer ' + apiKey,
          Accept: 'application/json'
        }, body ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        } : {})
      }, response => {
        let raw = '';
        response.on('data', chunk => {
          raw += chunk;
          if (raw.length > 1024 * 1024) request.destroy(new Error('Bob Go response was too large.'));
        });
        response.on('end', () => {
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
          resolve({ status: response.statusCode || 0, data });
        });
      });
      request.on('timeout', () => request.destroy(new Error('Bob Go did not respond within 25 seconds.')));
      request.on('error', reject);
      if (body) request.write(body);
      request.end();
    });
  }

  const safeText = (v, max) => String(v || '').trim().slice(0, max || 120);
  const splitName = (name) => {
    const parts = safeText(name, 120).split(/\s+/).filter(Boolean);
    return { first: parts.shift() || 'Customer', last: parts.join(' ') || 'Customer' };
  };

  app.get('/api/orders/:id/bobgo-waybill', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!adminDb) return res.status(503).json({ error: 'Shipping is not configured.' });
    const vendorId = safeText(req.query.vendorId, 150);
    const preorder = String(req.query.preorder || '') === 'true';
    if (!vendorId) return res.status(400).json({ error: 'A brand is required.' });
    const auth = await authorizeShipmentRequest(req, vendorId);
    if (!auth.ok) return res.status(403).json({ error: 'You do not have permission to print this brand shipment.' });
    const orderRef = adminDb.collection('orders').doc(req.params.id);
    try {
      const snap = await orderRef.get();
      if (!snap.exists) return res.status(404).json({ error: 'Order not found.' });
      const pkg = orderShipments(snap.data()).find(s => s.vendorId === vendorId && s.preorder === preorder);
      if (!pkg || !pkg.tracking.trackingNumber || !pkg.tracking.bobgoShipmentId) return res.status(404).json({ error: 'No Bob Go booking was found for this parcel.' });
      if (pkg.tracking.bobgoSubmissionStatus !== 'success') return res.status(409).json({ error: 'The courier has not accepted this booking yet. The label will be available once Bob Go confirms it.' });
      const apiKey = safeText(process.env.BOBGO_API_KEY, 500);
    const base = safeText(process.env.BOBGO_BASE_URL || 'https://api.sandbox.bobgo.co.za/v2', 300).replace(/\/+$/, '');
      const result = await bobgoRequest(base, apiKey, '/shipments/waybill?tracking_references=' + encodeURIComponent(JSON.stringify([pkg.tracking.trackingNumber])) + '&paper_size=A4');
      if (result.status < 200 || result.status >= 300) return res.status(502).json({ error: safeText(result.data.message || 'Bob Go could not generate the waybill.', 240) });
      if (!result.data.waybills_ready || !result.data.download_url) return res.status(409).json({ error: 'The courier booking is accepted, but the waybill is not ready yet. Please try again shortly.' });
      return res.json({ ok: true, downloadUrl: result.data.download_url });
    } catch (e) {
      console.error('[BOBGO WAYBILL]', req.params.id, vendorId, e.message);
      return res.status(502).json({ error: 'Could not retrieve the Bob Go waybill.' });
    }
  });

  app.post('/api/orders/:id/book-bobgo', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!adminDb) return res.status(503).json({ error: 'Shipping is not configured.' });

    const vendorId = safeText(req.body && req.body.vendorId, 150);
    const preorder = !!(req.body && req.body.preorder);
    if (!vendorId) return res.status(400).json({ error: 'A brand is required for this shipment.' });

    const auth = await authorizeShipmentRequest(req, vendorId);
    if (!auth.ok) return res.status(403).json({ error: 'You do not have permission to book this brand shipment.' });
    if (typeof rateLimited === 'function' && rateLimited(req, 'bobgo-book-shipment', 8, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Please wait before trying to book another shipment.' });
    }

    const apiKey = safeText(process.env.BOBGO_API_KEY, 500);
    const base = safeText(process.env.BOBGO_BASE_URL || 'https://api.sandbox.bobgo.co.za/v2', 300).replace(/\/+$/, '');
    let api;
    try {
      api = new URL(base);
      if (api.protocol !== 'https:' || !['api.sandbox.bobgo.co.za', 'api.bobgo.co.za'].includes(api.hostname) || !api.pathname.endsWith('/v2')) throw new Error();
    } catch (_) {
      return res.status(503).json({ error: 'BOBGO_BASE_URL must be the official Bob Go Sandbox or Production /v2 URL.' });
    }
    if (!apiKey) return res.status(503).json({ error: 'BOBGO_API_KEY is missing from Render.' });

    const orderRef = adminDb.collection('orders').doc(req.params.id);
    const entryPath = 'vendorTracking.' + vendorId + (preorder ? '.preorder' : '');
    const lockToken = require('crypto').randomUUID();
    let order, shipment;
    try {
      await adminDb.runTransaction(async tx => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) throw Object.assign(new Error('Order not found.'), { status: 404 });
        order = snap.data();
        if (order.paymentStatus !== 'paid') throw Object.assign(new Error('This order must be paid before a courier can be booked.'), { status: 409 });
        if (['cancelled', 'refunded'].includes(String(order.status || '').toLowerCase()) || ['refunded', 'refund_pending'].includes(String(order.paymentStatus || '').toLowerCase())) {
          throw Object.assign(new Error('This order cannot be shipped.'), { status: 409 });
        }
        shipment = orderShipments(order).find(s => s.vendorId === vendorId && s.preorder === preorder);
        if (!shipment) throw Object.assign(new Error('That brand shipment was not found on this order.'), { status: 404 });
        if (shipment.collect) throw Object.assign(new Error('This order is marked for customer collection, not courier delivery.'), { status: 409 });
        const current = preorder ? ((order.vendorTracking || {})[vendorId] || {}).preorder || {} : (order.vendorTracking || {})[vendorId] || {};
        if (current.bobgoShipmentId || current.trackingNumber) throw Object.assign(new Error('This parcel already has a tracking reference. Refresh the order.'), { status: 409 });
        if (current.bobgoBooking && ['booking', 'unknown'].includes(current.bobgoBooking.status)) throw Object.assign(new Error(current.bobgoBooking.status === 'unknown' ? 'The previous booking result is uncertain. Check Bob Go before attempting another booking.' : 'A booking is already in progress for this parcel. Do not click again.'), { status: 409 });
        const patch = {};
        patch[entryPath + '.bobgoBooking'] = { status: 'booking', token: lockToken, startedAt: new Date().toISOString() };
        patch.updatedAt = new Date().toISOString();
        tx.update(orderRef, patch);
      });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || 'Could not prepare the shipment.' });
    }

    let createAttempted = false;
  const releaseLock = async (message, status) => {
      const patch = {};
      patch[entryPath + '.bobgoBooking'] = { status: status || 'failed', message: safeText(message, 240), failedAt: new Date().toISOString() };
      await orderRef.update(patch).catch(() => {});
    };

    try {
      const [vendorDoc, privateDoc] = await Promise.all([
        adminDb.collection('vendors').doc(vendorId).get(),
        adminDb.collection('vendorPrivate').doc(vendorId).get()
      ]);
      const vendor = Object.assign({}, vendorDoc.exists ? vendorDoc.data() : {}, privateDoc.exists ? privateDoc.data() : {});
      const pickup = vendor.pickup || {};
      if (!pickup.street || !pickup.suburb || !pickup.city || !pickup.province || !/^\d{4}$/.test(String(pickup.postalCode || ''))) {
        throw new Error('This brand needs a complete pickup address in Admin → Brands before booking.');
      }
      const lines = shipment.items || [];
      const parcelInput = req.body && req.body.parcel || {};
      const length = Number(parcelInput.lengthCm), width = Number(parcelInput.widthCm);
      const height = Number(parcelInput.heightCm), weight = Number(parcelInput.weightKg);
      if (![length, width, height, weight].every(Number.isFinite) || !(length > 0 && width > 0 && height > 0 && weight > 0) || length > 200 || width > 200 || height > 200 || weight > 70) {
        throw new Error('Enter the packed parcel length, width, height (cm) and total weight (kg) before booking.');
      }
      const declaredValue = lines.reduce((sum, item) => sum + (Number(item.price) || 0) * Math.max(1, Number(item.qty) || 1), 0);
      const parcels = [{
        submitted_length_cm: length, submitted_width_cm: width, submitted_height_cm: height,
        submitted_weight_kg: weight, description: safeText(shipment.brand + (preorder ? ' pre-order' : '') + ' order', 100)
      }];

      const selection = (Array.isArray(order.shippingSelections) ? order.shippingSelections : [])
        .find(s => Array.isArray(s.vendorIds) && s.vendorIds.includes(vendorId));
      if (!selection) throw new Error('The customer delivery option could not be matched to this brand shipment.');
      if (Array.isArray(selection.vendorIds) && selection.vendorIds.length > 1) {
        throw new Error('This order combines brands that share a warehouse. Combined shared-warehouse booking is not enabled yet, so no courier booking was created.');
      }
      const pickupPoint = selection.method === 'pickup-point';
      const pickupLocationId = pickupLocationId;
      if (pickupPoint && (!Number.isInteger(pickupLocationId) || pickupLocationId <= 0 || !selection.pickupPointProviderSlug)) {
        throw new Error('The selected collection point is missing its Bob Go location details. Please contact JANEDORE support.');
      }
      const customer = splitName(order.customerName);
      const brandContact = splitName(vendor.contactName || vendor.name || vendor.brand || shipment.brand);
      const collectionAddress = {
        type: pickup.type === 'residential' ? 'residential' : 'business',
        company: safeText(pickup.company || vendor.name || shipment.brand, 100),
        street_address: safeText(pickup.street, 120), local_area: safeText(pickup.suburb, 80),
        city: safeText(pickup.city, 80), zone: safeText(pickup.province, 80), country: 'ZA', code: String(pickup.postalCode)
      };
      const deliveryAddress = {
        type: 'residential', street_address: safeText(order.shippingAddress, 160),
        local_area: safeText(order.suburb, 80), city: safeText(order.city, 80),
        zone: safeText(order.province, 80), country: 'ZA', code: safeText(order.postalCode, 12)
      };
      const ratePayload = {
        collection_address: collectionAddress,
        parcels,
        declared_value: Math.round(declaredValue * 100) / 100,
        timeout: 25000,
        collection_contact_full_name: brandContact.first + (brandContact.last ? ' ' + brandContact.last : ''),
        collection_contact_mobile_number: safeText(pickup.phone || vendor.phone || '', 30),
        collection_contact_email: safeText(pickup.email || vendor.email || '', 180),
        delivery_contact_full_name: customer.first + (customer.last ? ' ' + customer.last : ''),
        delivery_contact_mobile_number: safeText(order.customerPhone, 30),
        delivery_contact_email: safeText(order.customerEmail, 180)
      };
      if (pickupPoint) {
        ratePayload.delivery_pickup_point_location_id = Number(selection.pickupPointLocationId);
        ratePayload.pickup_point_provider_slug = safeText(selection.pickupPointProviderSlug, 80);
      } else {
        if (!deliveryAddress.street_address || !deliveryAddress.local_area || !deliveryAddress.city || !deliveryAddress.zone || !/^\d{4}$/.test(deliveryAddress.code)) throw new Error('The customer delivery address is incomplete.');
        ratePayload.delivery_address = deliveryAddress;
      }

      ['collection_contact_mobile_number','collection_contact_email','delivery_contact_mobile_number','delivery_contact_email'].forEach(k => { if (!ratePayload[k]) delete ratePayload[k]; });
      const rated = await bobgoRequest(base, apiKey, '/rates', ratePayload);
      if (rated.status < 200 || rated.status >= 300) throw new Error(safeText(rated.data.message || rated.data.error || ('Bob Go rate request failed (' + rated.status + ').'), 240));
      if (rated.data.id == null) throw new Error('Bob Go did not return a rate request ID, so the booking was not submitted.');
      const requests = Array.isArray(rated.data.provider_rate_requests) ? rated.data.provider_rate_requests : [];
      const options = [];
      requests.filter(r => r.status === 'success').forEach(r => {
        (Array.isArray(r.responses) ? r.responses : []).filter(x => x.status === 'success' && x.service_level_code && r.provider_slug).forEach(x => {
          const amount = Number(x.rate_amount);
          const serviceLabel = String(x.service_level && (x.service_level.name || x.service_level.service_level_name) || x.service_level_code).toLowerCase();
          if (!serviceLabel.includes('express') && Number.isFinite(amount) && amount >= 0) options.push({ provider: r.provider_slug, providerName: r.provider_name || r.provider_slug, service: x.service_level_code, amount });
        });
      });
      options.sort((a, b) => a.amount - b.amount);
      if (!options.length) throw new Error('Bob Go returned no bookable courier rates for this parcel and destination. Check the pickup address, parcel dimensions and Bob Go courier services.');
      const chosen = options[0];
      const bookingPayload = {
        provider_slug: chosen.provider,
        service_level_code: chosen.service,
        selected_rate_request_id: rated.data.id,
        collection_address: collectionAddress,
        parcels,
        declared_value: Math.round(declaredValue * 100) / 100,
        custom_order_number: safeText(order.orderNumber || req.params.id, 80),
        collection_contact_name: brandContact.first,
        collection_contact_surname: brandContact.last || 'Brand',
        collection_contact_mobile_number: safeText(pickup.phone || vendor.phone || '', 30),
        collection_contact_email: safeText(pickup.email || vendor.email || '', 180),
        delivery_contact_name: customer.first,
        delivery_contact_surname: customer.last,
        delivery_contact_mobile_number: safeText(order.customerPhone, 30),
        delivery_contact_email: safeText(order.customerEmail, 180),
        timeout: 5000
      };
      ['collection_contact_mobile_number','collection_contact_email','delivery_contact_mobile_number','delivery_contact_email'].forEach(k => { if (!bookingPayload[k]) delete bookingPayload[k]; });
      if (pickupPoint) {
        bookingPayload.delivery_pickup_point_location_id = Number(selection.pickupPointLocationId);
        bookingPayload.pickup_point_provider_slug = safeText(selection.pickupPointProviderSlug, 80);
      } else bookingPayload.delivery_address = deliveryAddress;

      createAttempted = true;
      const booked = await bobgoRequest(base, apiKey, '/shipments', bookingPayload);
      if (booked.status < 200 || booked.status >= 300) throw new Error(safeText(booked.data.message || booked.data.error || ('Bob Go booking failed (' + booked.status + ').'), 240));
      const result = booked.data || {};
      const trackingRef = safeText(result.tracking_reference, 80).toUpperCase();
      if (!result.id || !trackingRef) throw new Error('Bob Go did not return a shipment ID and tracking reference. The booking may need checking in Bob Go before retrying.');
      const entry = {
        bobgoShipmentId: String(result.id),
        trackingNumber: trackingRef,
        courier: safeText(chosen.providerName, 80),
        courierName: safeText(chosen.providerName, 80),
        bobgoSubmissionStatus: safeText(result.submission_status || 'pending-rates', 60),
        bobgoStatus: safeText(result.status, 60),
        bobgoProviderTrackingReference: result.provider_tracking_reference || null,
        bobgoTrackingUrl: result.tracking_url || null,
        bobgoBooking: { status: 'created', createdAt: new Date().toISOString() },
        addedAt: new Date().toISOString(),
        serviceLevelCode: safeText(chosen.service, 80),
        quotedCourierAmount: chosen.amount
      };
      const fresh = await orderRef.get();
      const freshOrder = fresh.data() || {};
      const currentShipment = orderShipments(freshOrder).find(s => s.vendorId === vendorId && s.preorder === preorder);
      if (!currentShipment) throw new Error('The order changed while Bob Go was booking. Please check Bob Go before retrying.');
      const patch = { updatedAt: new Date().toISOString(), trackingRefs: admin.firestore.FieldValue.arrayUnion(trackingRef) };
      Object.keys(entry).forEach(k => { patch[entryPath + '.' + k] = entry[k]; });
      await orderRef.update(patch);
      if (order.customerEmail && typeof sendResendEmail === 'function') {
        await sendResendEmail({
          from: 'Janedore <noreply@janedore.co.za>',
          replyTo: 'support@janedore.co.za',
          to: order.customerEmail,
          subject: 'Your JANEDORE parcel has been booked',
          text: 'Your ' + shipment.brand + (preorder ? ' pre-order parcel' : ' parcel') + ' for order #' + (order.orderNumber || req.params.id) + ' has been booked with the courier.\n\nBob Go tracking reference: ' + trackingRef + '\n\nThe courier is still confirming the booking. We will update your Track Your Order page as soon as the courier accepts and scans the parcel.\n\nJANEDORE'
        }).catch(e => console.warn('[BOBGO BOOKING] Customer email failed:', e.message));
      }
      return res.json({
        ok: true, trackingReference: trackingRef,
        submissionStatus: entry.bobgoSubmissionStatus,
        courier: chosen.provider, message: 'Shipment booking created. Bob Go is confirming it with the courier.'
      });
    } catch (e) {
      console.error('[BOBGO BOOKING]', req.params.id, vendorId, preorder ? 'preorder' : 'stock', e.message);
      await releaseLock(e.message, createAttempted ? 'unknown' : 'failed');
      return res.status(502).json({ error: e.message || 'Could not book this shipment with Bob Go.' });
    }
  });
};
