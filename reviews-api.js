// ==================== PRODUCT REVIEWS ====================
// Only customers who bought a product can review it. The product page
// asks /api/reviews/eligibility whether to show Write a review, and
// /api/reviews saves the review after checking the purchase again.
//
// Who counts as having bought it: a paid order containing the product
// that is either the signed-in customer's (their uid, or their verified
// account email) or, for a guest, one this device placed (order number
// plus the email used at checkout, the same pair Track your order uses).
//
// Up to 4 photos; /api/reviews/photo-signature lets a buyer upload them
// when the storefront has no public Cloudinary preset.
//
// The reviewer's email is required but never public: reviews/{id} is
// readable by anyone, so the email lives in reviewOwners/{id}
// (server only; admins can read it, firestore.rules). One review per
// customer per product: the id is a hash of email + product, so
// reviewing again replaces the earlier review.

const crypto = require('crypto');

module.exports = function registerReviews(app, deps) {
  const { adminDb, admin, rateLimited } = deps;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_REVIEW_PHOTOS = 4;

  async function signedIn(req) {
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return null;
    try { const u = await admin.auth().verifyIdToken(match[1]); return u.firebase && u.firebase.sign_in_provider === 'anonymous' ? null : u; } catch (e) { return null; }
  }

  function hasProduct(order, productId) {
    return order.paymentStatus === 'paid' && (order.items || []).some(i => i && i.productId === productId);
  }

  // The paid order that proves this customer bought the product, or null.
  async function findPurchase(req, productId, deviceOrders) {
    const user = await signedIn(req);
    if (user) {
      const byUid = await adminDb.collection('orders').where('customerId', '==', user.uid).limit(100).get();
      for (const d of byUid.docs) if (hasProduct(d.data(), productId)) return { order: d.data(), email: String(user.email || d.data().customerEmail || '').toLowerCase(), uid: user.uid };
      if (user.email && user.email_verified) {
        const byEmail = await adminDb.collection('orders').where('customerEmail', '==', String(user.email).toLowerCase()).limit(100).get();
        for (const d of byEmail.docs) if (hasProduct(d.data(), productId)) return { order: d.data(), email: String(user.email).toLowerCase(), uid: user.uid };
      }
    }
    for (const o of (Array.isArray(deviceOrders) ? deviceOrders : []).slice(0, 20)) {
      const number = String((o && o.orderNumber) || '').trim().toUpperCase().slice(0, 40);
      const email = String((o && o.email) || '').trim().toLowerCase().slice(0, 200);
      if (!number || !EMAIL_RE.test(email)) continue;
      const snap = await adminDb.collection('orders').where('orderNumber', '==', number).limit(1).get();
      const order = snap.empty ? null : snap.docs[0].data();
      if (order && String(order.customerEmail || '').toLowerCase() === email && hasProduct(order, productId)) return { order, email, uid: user ? user.uid : null };
    }
    return null;
  }

  app.post('/api/reviews/eligibility', async (req, res) => {
    if (!adminDb) return res.json({ eligible: false });
    if (rateLimited(req, 'review-eligibility', 120, 15 * 60 * 1000)) return res.json({ eligible: false });
    try {
      const productId = String((req.body || {}).productId || '').slice(0, 120);
      const purchase = productId ? await findPurchase(req, productId, (req.body || {}).orders) : null;
      res.json(purchase ? { eligible: true, email: purchase.email } : { eligible: false });
    } catch (e) {
      console.error('[REVIEWS] Eligibility failed:', e.message);
      res.json({ eligible: false });
    }
  });

  // Review photos: a signed Cloudinary upload for someone who bought the
  // product, images only, into the reviews folder. Used when the
  // storefront has no public upload preset (CLOUDINARY_PUBLIC_UPLOAD_PRESET).
  // Needs CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, like admin's
  // signed uploads (server.js).
  app.post('/api/reviews/photo-signature', async (req, res) => {
    const apiKey = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET, cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!apiKey || !secret || !cloudName || !adminDb) return res.status(503).json({ error: 'Photo uploads are not set up' });
    if (rateLimited(req, 'review-photo-sign', 30, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    try {
      const productId = String((req.body || {}).productId || '').slice(0, 120);
      const purchase = productId ? await findPurchase(req, productId, (req.body || {}).orders) : null;
      if (!purchase) return res.status(403).json({ error: 'Only customers who bought this item can add photos.' });
      // Cloudinary signs every parameter except file, cloud_name,
      // resource_type and api_key: sorted key=value pairs joined with &,
      // then the secret, hashed with SHA-1.
      const params = { allowed_formats: 'jpg,jpeg,png,webp,heic,heif', folder: 'reviews', timestamp: Math.floor(Date.now() / 1000) };
      const toSign = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
      const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');
      res.json({ cloudName, apiKey, signature, timestamp: params.timestamp, folder: params.folder, allowedFormats: params.allowed_formats });
    } catch (e) {
      console.error('[REVIEWS] Photo signature failed:', e.message);
      res.status(500).json({ error: 'Could not add your photos. Please try again.' });
    }
  });

  app.post('/api/reviews', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (rateLimited(req, 'review-submit', 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    const b = req.body || {};
    const productId = String(b.productId || '').slice(0, 120);
    const rating = Math.round(Number(b.rating));
    const text = String(b.text || '').trim().slice(0, 2000);
    const name = String(b.name || '').trim().slice(0, 100) || 'Anonymous';
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    // Up to 4 photos the customer added, in their chosen order, already
    // uploaded to our Cloudinary account by the browser; anything else
    // is ignored. imageUrl (the first) is kept for older readers.
    const cloud = process.env.CLOUDINARY_CLOUD_NAME || '';
    const imageUrls = (Array.isArray(b.imageUrls) ? b.imageUrls : [b.imageUrl])
      .map(u => String(u || '').slice(0, 500))
      .filter(u => cloud && u.startsWith('https://res.cloudinary.com/' + cloud + '/image/upload/'))
      .slice(0, MAX_REVIEW_PHOTOS);
    const imageUrl = imageUrls[0] || null;
    if (!productId) return res.status(400).json({ error: 'Missing product.' });
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Please choose a star rating.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter the email you ordered with.' });
    try {
      const purchase = await findPurchase(req, productId, b.orders);
      if (!purchase) return res.status(403).json({ error: 'Only customers who bought this item can review it.' });
      if (purchase.email !== email) return res.status(400).json({ error: 'Please use the email you ordered with: ' + purchase.email });
      const productDoc = await adminDb.collection('products').doc(productId).get();
      const id = crypto.createHash('sha256').update(email + '|' + productId).digest('hex').slice(0, 32);
      const batch = adminDb.batch();
      batch.set(adminDb.collection('reviews').doc(id), {
        productId, rating, text, name, imageUrl, imageUrls, verified: true,
        vendorId: (productDoc.exists && productDoc.data().vendorId) || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      batch.set(adminDb.collection('reviewOwners').doc(id), {
        email, uid: purchase.uid || null, productId, orderNumber: purchase.order.orderNumber || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
      res.json({ ok: true });
    } catch (e) {
      console.error('[REVIEWS] Save failed:', e.message);
      res.status(500).json({ error: 'Could not save your review. Please try again.' });
    }
  });

  // My account > Reviews: the signed-in customer's own reviews, matched
  // by their uid or their verified email.
  app.get('/api/account/reviews', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const user = await signedIn(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const ids = new Set();
      (await adminDb.collection('reviewOwners').where('uid', '==', user.uid).limit(100).get()).docs.forEach(d => ids.add(d.id));
      if (user.email && user.email_verified) {
        (await adminDb.collection('reviewOwners').where('email', '==', String(user.email).toLowerCase()).limit(100).get()).docs.forEach(d => ids.add(d.id));
      }
      const docs = ids.size ? await adminDb.getAll(...[...ids].map(id => adminDb.collection('reviews').doc(id))) : [];
      const items = docs.filter(d => d.exists).map(d => {
        const r = d.data();
        return { id: d.id, productId: r.productId, rating: r.rating, text: r.text, name: r.name, imageUrl: r.imageUrl || null, imageUrls: r.imageUrls || (r.imageUrl ? [r.imageUrl] : []), createdAt: r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : 0 };
      }).sort((a, b) => b.createdAt - a.createdAt);
      res.json({ items });
    } catch (e) {
      console.error('[REVIEWS] Account list failed:', e.message);
      res.status(500).json({ error: 'Could not load your reviews.' });
    }
  });
};
