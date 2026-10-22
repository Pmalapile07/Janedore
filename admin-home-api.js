// ==================== ADMIN HOME: ACTIVITY AND NOTIFICATIONS ====================
// GET /api/admin/home for Admin > Home (admin-dashboard.js), scoped to
// the signed-in staff member's role:
//
// - activity: what needs doing now. Super Admin / Admin: paid orders to
//   fulfil, returns and exchanges to review, new partner applications,
//   brand reports and customer care messages. A brand: its page setup
//   (logo, hero image, slogan, first product) and its own orders and
//   returns. Unread chats are added in the browser, which already
//   tracks them.
// - notifications: what happened in the last 14 days, newest first.

module.exports = function registerAdminHome(app, deps) {
  const { adminDb, admin } = deps;
  const DAY = 86400000;
  const OPEN_ORDER = ['pending', 'processing', 'packed'];

  const toMs = (v) => {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    const t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  };
  const rand = (n) => 'R' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  async function staff(req) {
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return null;
    try {
      const decoded = await admin.auth().verifyIdToken(match[1]);
      const doc = await adminDb.collection('admins').doc(decoded.uid).get();
      if (!doc.exists) return null;
      const d = doc.data();
      const role = String(d.role || '').toUpperCase();
      if (['SUPER_ADMIN', 'ADMIN', 'VENDOR'].indexOf(role) === -1) return null;
      return { role, vendorId: d.vendorId || null };
    } catch (e) {
      return null;
    }
  }

  // Newest docs of a collection (by createdAt), filtered in memory, so
  // no composite indexes are needed.
  async function recent(name, limit) {
    const snap = await adminDb.collection(name).orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }
  const safe = (p) => p.catch((e) => { console.error('[ADMIN_HOME]', e.message); return []; });

  async function platformHome() {
    const since = Date.now() - 14 * DAY;
    const [orders, returns, exchanges, apps, reports, contacts, reviews] = await Promise.all([
      safe(recent('orders', 300)), safe(recent('returns', 100)), safe(recent('exchanges', 100)),
      safe(recent('partnerApplications', 100)), safe(recent('brandReports', 100)),
      safe(recent('contactMessages', 100)), safe(recent('reviews', 50))
    ]);
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const activity = [
      { key: 'orders', count: paid.filter((o) => OPEN_ORDER.indexOf(String(o.status || 'pending').toLowerCase()) !== -1).length, tab: 'orders' },
      { key: 'returns', count: returns.filter((r) => r.status === 'submitted').length, tab: 'returns' },
      { key: 'exchanges', count: exchanges.filter((r) => r.status === 'submitted').length, tab: 'exchanges' },
      { key: 'applications', count: apps.filter((a) => a.status === 'received').length, tab: 'applications' },
      { key: 'reports', count: reports.filter((r) => r.status === 'new').length, tab: 'reports' },
      { key: 'contacts', count: contacts.filter((c) => c.status === 'new').length, tab: 'messages' }
    ];
    const notes = [];
    paid.forEach((o) => notes.push({ type: 'order', at: toMs(o.createdAt), text: 'New order #' + (o.orderNumber || o.id) + ' · ' + rand(o.total), tab: 'orders' }));
    returns.forEach((r) => notes.push({ type: 'return', at: toMs(r.createdAt), text: 'Return request ' + (r.returnNumber || '') + ' on order #' + (r.orderNumber || ''), tab: 'returns' }));
    exchanges.forEach((r) => notes.push({ type: 'exchange', at: toMs(r.createdAt), text: 'Exchange request ' + (r.exchangeNumber || '') + ' on order #' + (r.orderNumber || ''), tab: 'exchanges' }));
    apps.forEach((a) => notes.push({ type: 'application', at: toMs(a.createdAt), text: 'Partner application from ' + (a.brandName || 'a brand'), tab: 'applications' }));
    reports.forEach((r) => notes.push({ type: 'report', at: toMs(r.createdAt), text: 'Concern reported about ' + (r.brand || 'a brand') + ': ' + (r.reason || ''), tab: 'reports' }));
    contacts.forEach((c) => notes.push({ type: 'message', at: toMs(c.createdAt), text: 'Customer care message from ' + (c.name || 'a customer') + (c.topic ? ' about ' + String(c.topic).toLowerCase() : ''), tab: 'messages' }));
    reviews.forEach((r) => notes.push({ type: 'review', at: toMs(r.createdAt), text: (Number(r.rating) || 0) + '-star review from ' + (r.name || 'a customer'), tab: 'reviews' }));
    return { activity, notifications: notes.filter((n) => n.at >= since).sort((a, b) => b.at - a.at).slice(0, 30) };
  }

  async function vendorHome(vendorId) {
    const since = Date.now() - 14 * DAY;
    const [vendorDoc, products, orders, returns, reviews] = await Promise.all([
      adminDb.collection('vendors').doc(vendorId).get(),
      safe(adminDb.collection('products').where('vendorId', '==', vendorId).limit(1).get().then((s) => s.docs)),
      safe(adminDb.collection('orders').where('vendorIds', 'array-contains', vendorId).limit(200).get().then((s) => s.docs.map((d) => Object.assign({ id: d.id }, d.data())))),
      safe(adminDb.collection('returns').where('vendorIds', 'array-contains', vendorId).limit(100).get().then((s) => s.docs.map((d) => d.data()))),
      safe(adminDb.collection('reviews').where('vendorId', '==', vendorId).limit(100).get().then((s) => s.docs.map((d) => d.data())))
    ]);
    const v = vendorDoc.exists ? vendorDoc.data() : {};
    const setup = [
      { key: 'logo', done: !!v.logoUrl },
      { key: 'hero', done: !!v.heroImageUrl },
      { key: 'slogan', done: !!String(v.slogan || '').trim() },
      { key: 'product', done: products.length > 0 }
    ];
    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const activity = [
      { key: 'orders', count: paid.filter((o) => OPEN_ORDER.indexOf(String(o.status || 'pending').toLowerCase()) !== -1).length, tab: 'orders' },
      { key: 'returns', count: returns.filter((r) => r.status === 'submitted').length, tab: 'returns' }
    ];
    const notes = [];
    paid.forEach((o) => notes.push({ type: 'order', at: toMs(o.createdAt), text: 'New order #' + (o.orderNumber || o.id), tab: 'orders' }));
    returns.forEach((r) => notes.push({ type: 'return', at: toMs(r.createdAt), text: 'Return request ' + (r.returnNumber || '') + ' on order #' + (r.orderNumber || ''), tab: 'returns' }));
    reviews.forEach((r) => notes.push({ type: 'review', at: toMs(r.createdAt), text: (Number(r.rating) || 0) + '-star review from ' + (r.name || 'a customer'), tab: 'reviews' }));
    return {
      brand: { name: v.brand || v.name || '', logoUrl: v.logoUrl || '' },
      setup, activity,
      notifications: notes.filter((n) => n.at >= since).sort((a, b) => b.at - a.at).slice(0, 30)
    };
  }

  app.get('/api/admin/home', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const who = await staff(req);
    if (!who) return res.status(403).json({ error: 'Not authorized' });
    try {
      if (who.role === 'VENDOR') {
        if (!who.vendorId) return res.json({ setup: [], activity: [], notifications: [] });
        return res.json(await vendorHome(who.vendorId));
      }
      res.json(await platformHome());
    } catch (e) {
      console.error('[ADMIN_HOME] Failed:', e.message);
      res.status(500).json({ error: 'Could not load your activity' });
    }
  });
};
