// ==================== WAITLIST ====================
// Products with "Waitlist when sold out" on in admin: when a size or the
// whole product is sold out, the product page's Add to Bag button reads
// Add to Waitlist and joins it (product-detail.js). sweepWaitlist() checks
// every 15 minutes and emails each customer once when their exact item is
// back in stock, then marks the entry notified. Signed-in customers see
// and remove their entries in My Account > Waitlist (account.js).
// waitlist/{id}, where id is a hash of email + product + colour + size,
// so joining twice keeps one entry. Server only (firestore.rules default
// deny); firebase-admin reads and writes it here.

const crypto = require('crypto');

module.exports = function registerWaitlist(app, deps) {
  const { adminDb, admin, sendResendEmail, buildOrderEmailContext, orderEmails, SITE_URL, rateLimited } = deps;
  const col = () => adminDb.collection('waitlist');

  // Same per-size stock rule as the storefront (product-detail.js).
  function stockOf(product, variantIndex, size) {
    const bySize = product.stockByVariant && product.stockByVariant[variantIndex];
    if (!bySize || typeof bySize !== 'object') return Number(product.stock) || 0;
    const n = bySize[size || 'OS'];
    return typeof n === 'number' ? n : 0;
  }

  async function signedIn(req) {
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return null;
    try { return await admin.auth().verifyIdToken(match[1]); } catch (e) { return null; }
  }

  function entryId(email, productId, variantIndex, size) {
    return crypto.createHash('sha256').update([email, productId, variantIndex, size].join('|')).digest('hex').slice(0, 32);
  }

  // ---- join ----
  app.post('/api/waitlist', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (rateLimited(req, 'waitlist', 20, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    const b = req.body || {};
    const user = await signedIn(req);
    const email = String((user && user.email) || b.email || '').trim().toLowerCase().slice(0, 200);
    const productId = String(b.productId || '').slice(0, 120);
    const variantIndex = Math.max(0, Math.floor(Number(b.variantIndex) || 0));
    const size = String(b.size || 'OS').slice(0, 40);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    try {
      const doc = productId ? await adminDb.collection('products').doc(productId).get() : null;
      if (!doc || !doc.exists || doc.data().status !== 'active') return res.status(404).json({ error: 'This product is no longer available.' });
      const p = doc.data();
      if (!p.waitlist) return res.status(400).json({ error: 'This product doesn’t have a waitlist.' });
      const sizes = p.sizes && p.sizes.length ? p.sizes : ['OS'];
      if (!sizes.includes(size) || variantIndex >= Math.max(1, (p.variants || []).length)) return res.status(400).json({ error: 'Please choose a size.' });
      if (stockOf(p, variantIndex, size) > 0) return res.status(400).json({ error: 'Good news: this is in stock. You can add it to your bag now.' });
      const v = (p.variants || [])[variantIndex] || {};
      await col().doc(entryId(email, productId, variantIndex, size)).set({
        email, uid: user ? user.uid : null, productId, variantIndex, size,
        name: p.name || '', brand: p.brand || '', color: v.color || '',
        status: 'waiting', createdAt: Date.now()
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('[WAITLIST] Join failed:', e.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- My Account: list and remove ----
  // Entries joined while signed in, plus those under the account's email
  // once it is verified (the same rule as orders).
  async function ownEntries(user) {
    const found = {};
    const add = (snap) => snap.docs.forEach((d) => { found[d.id] = d.data(); });
    add(await col().where('uid', '==', user.uid).limit(100).get());
    if (user.email_verified && user.email) add(await col().where('email', '==', String(user.email).toLowerCase()).limit(100).get());
    return found;
  }

  app.get('/api/account/waitlist', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const user = await signedIn(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const found = await ownEntries(user);
      res.json({ items: Object.keys(found).map((id) => Object.assign({ id }, found[id], { uid: undefined }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) });
    } catch (e) {
      console.error('[WAITLIST] List failed:', e.message);
      res.status(500).json({ error: 'Could not load your waitlist.' });
    }
  });

  app.post('/api/account/waitlist/:id/remove', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const user = await signedIn(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const found = await ownEntries(user);
      if (!found[req.params.id]) return res.status(404).json({ error: 'Not found.' });
      await col().doc(req.params.id).delete();
      res.json({ ok: true });
    } catch (e) {
      console.error('[WAITLIST] Remove failed:', e.message);
      res.status(500).json({ error: 'Could not remove it. Please try again.' });
    }
  });

  // ---- back in stock ----
  async function sweepWaitlist() {
    if (!adminDb) return;
    let snap;
    try { snap = await col().where('status', '==', 'waiting').limit(300).get(); }
    catch (e) { console.error('[WAITLIST] Sweep query failed:', e.message); return; }
    const products = {};
    for (const doc of snap.docs) {
      const w = doc.data();
      try {
        if (!(w.productId in products)) {
          const p = await adminDb.collection('products').doc(w.productId).get();
          products[w.productId] = p.exists ? p.data() : null;
        }
        const p = products[w.productId];
        if (!p || p.status !== 'active') continue;
        if (stockOf(p, w.variantIndex, w.size) <= 0) continue;
        const ctx = await buildOrderEmailContext({ items: [{ productId: w.productId, variantIndex: w.variantIndex }] });
        const v = (p.variants || [])[w.variantIndex] || {};
        const item = { productId: w.productId, variantIndex: w.variantIndex, name: p.name || w.name, brand: p.brand || w.brand, color: v.color || w.color, size: w.size, qty: 1 };
        const email = orderEmails.backInStock(item, ctx, { productUrl: SITE_URL + '/products/' + encodeURIComponent(p.slug || w.productId) });
        await sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: w.email, subject: email.subject, html: email.html, text: email.text });
        await doc.ref.update({ status: 'notified', notifiedAt: Date.now() });
        console.log('[WAITLIST] Back in stock email sent for', doc.id);
      } catch (e) {
        console.error('[WAITLIST] Notify failed for', doc.id, ':', e.message);
      }
    }
  }
  setInterval(sweepWaitlist, 15 * 60 * 1000).unref();

  return { sweepWaitlist };
};
