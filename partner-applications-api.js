// ==================== PARTNER APPLICATIONS ====================
// Brands apply on /pages/partner-application (partner-application.js) and
// can check progress there with their PA- reference and email. Super Admin
// reviews them in admin > Applications (admin-applications.js).
//
// Stages: received -> under_review -> accepted | conditional | declined.
// "conditional" (Accepted with conditions) lists what the brand needs to
// change first; from there Super Admin can still accept or decline.
// The brand is emailed on received, accepted, conditional and declined.
// Applications live in partnerApplications/{reference}; the server reads
// and writes them, so no Firestore rules change is needed.

const LISTS = {
  // Keep in sync with PA_CATEGORIES in partner-application.js.
  categories: ['Clothing', 'Kidswear', 'Jewellery', 'Bags', 'Footwear', 'Accessories', 'Homeware', 'Beauty', 'Fragrance and candles'],
  production: ['Made in advance and held in stock', 'Made to order', 'Both'],
  supportAreas: ['Product photography', 'Packaging', 'Brand identity', 'Product descriptions', 'Pricing', 'Fulfilment and shipping', 'Something else'],
  priceBand: ['Under R500', 'R500 to R1,500', 'R1,500 to R5,000', 'Over R5,000'],
  channels: ['Own website', 'Social media', 'Own store or studio', 'Other retailers or stockists', 'Markets and pop-ups', 'Not selling yet'],
  rangeSize: ['1 to 10 products', '11 to 50 products', '51 to 200 products', 'More than 200 products'],
  fulfilment: ['We pack and ship orders ourselves', 'We use a fulfilment or courier partner', 'We are still setting this up']
};
// The form on Brand partnerships no longer asks for location, price band,
// channels, range size, fulfilment, goals or role; they are still accepted
// (and shown in admin) so older applications keep their details.
const DECIDED = ['accepted', 'declined'];

module.exports = function registerPartnerApplications(app, deps) {
  const { adminDb, admin, sendResendEmail, orderEmails, ORDER_ALERT_EMAIL, SITE_URL, getBrandAssets, logoImageUrl } = deps;
  const col = () => adminDb.collection('partnerApplications');
  const iso = (t) => (t && t.toDate ? t.toDate().toISOString() : (t || null));
  const nowIso = () => new Date().toISOString();

  const hits = new Map();
  function limited(req, key, max, windowMs) {
    const k = key + ':' + String(req.ip || '');
    const now = Date.now();
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) return true;
    h.push(now);
    hits.set(k, h);
    return false;
  }

  async function emailCtx() {
    const assets = await getBrandAssets().catch(() => ({}));
    return { siteUrl: SITE_URL, logoUrl: assets.emailLogo ? logoImageUrl(assets.emailLogo, 360) : '', logoFontUrl: assets.logoFont || '' };
  }

  async function staff(req) {
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return null;
    try {
      const decoded = await admin.auth().verifyIdToken(match[1]);
      const doc = await adminDb.collection('admins').doc(decoded.uid).get();
      if (!doc.exists) return null;
      const d = doc.data();
      return { uid: decoded.uid, role: d.role, name: d.name || d.email || decoded.email || 'Staff' };
    } catch (e) { return null; }
  }

  // ---- Apply ----
  app.post('/api/partner-applications', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    const b = req.body || {};
    if (b.hp) return res.json({ ok: true, reference: '' });
    if (limited(req, 'apply', 3, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many applications from this connection. Please try again later.' });

    const str = (v, n) => String(v || '').trim().substring(0, n);
    const pick = (v, list) => list.indexOf(v) !== -1 ? v : '';
    const pickMany = (v, list) => (Array.isArray(v) ? v : []).filter((x) => list.indexOf(x) !== -1).filter((x, i, a) => a.indexOf(x) === i);
    const cloud = process.env.CLOUDINARY_CLOUD_NAME || '';
    const a = {
      brandName: str(b.brandName, 100), website: str(b.website, 200), instagram: str(b.instagram, 100), social: str(b.social, 200),
      lookbookUrl: str(b.lookbook, 300), distinctive: str(b.distinctive, 1000), whyJanedore: str(b.whyJanedore, 1000),
      location: str(b.location, 100), founded: /^\d{4}$/.test(str(b.founded, 4)) ? str(b.founded, 4) : '',
      primaryCategory: pick(b.primaryCategory, LISTS.categories),
      categories: pickMany(b.categories, LISTS.categories), production: pick(b.production, LISTS.production), priceBand: pick(b.priceBand, LISTS.priceBand), story: str(b.story, 3000),
      supportRequested: b.supportRequested === true, supportAreas: b.supportRequested === true ? pickMany(b.supportAreas, LISTS.supportAreas) : [],
      supportDetails: b.supportRequested === true ? str(b.supportDetails, 1500) : '',
      channels: pickMany(b.channels, LISTS.channels), rangeSize: pick(b.rangeSize, LISTS.rangeSize), fulfilment: pick(b.fulfilment, LISTS.fulfilment), goals: str(b.goals, 1500),
      images: (Array.isArray(b.images) ? b.images : []).map(String).filter((u) => /^https:\/\/res\.cloudinary\.com\//.test(u) && (!cloud || u.indexOf('/' + cloud + '/') !== -1)).slice(0, 6),
      contactName: str(b.contactName, 100), role: str(b.role, 100), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 30)
    };
    const asUrl = (u) => (u && !/^https?:\/\//i.test(u) ? 'https://' + u : u);
    a.website = asUrl(a.website);
    a.lookbookUrl = asUrl(a.lookbookUrl);
    if (a.primaryCategory && a.categories.indexOf(a.primaryCategory) === -1) a.categories.unshift(a.primaryCategory);
    if (!a.primaryCategory) a.primaryCategory = a.categories[0] || '';
    const badUrl = (u) => u && !/^https?:\/\/[^\s/]+\.[^\s]{2,}$/i.test(u);
    const missing =
      !a.contactName ? 'Please enter your full name.' :
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) ? 'Please enter a valid email address.' :
      a.phone.replace(/\D/g, '').length < 7 ? 'Please enter a contact number we can reach you on.' :
      !a.brandName ? 'Please enter your brand name.' :
      badUrl(a.website) ? 'Please check your website address.' :
      !a.primaryCategory ? 'Please choose your primary product category.' :
      !a.production ? 'Please tell us how your products are made.' :
      !a.story ? 'Please add a short introduction to your brand.' :
      !a.distinctive ? 'Please tell us what makes your brand distinctive.' :
      !a.whyJanedore ? 'Please tell us why you would like to partner with JANEDORE.' :
      badUrl(a.lookbookUrl) ? 'Please check your lookbook link.' :
      !a.images.length && !a.lookbookUrl ? 'Please add product images or a lookbook link so we can see your work.' :
      a.supportRequested && !a.supportAreas.length ? 'Please choose where you would like support.' :
      b.ownProducts !== true ? 'Please confirm that your brand designs its own products and does not dropship.' :
      b.consent !== true ? 'Please confirm the declaration at the bottom of the form.' : '';
    if (missing) return res.status(400).json({ error: missing });

    try {
      // The reference is the document id, so it is unique and easy to find.
      let saved = false;
      for (let i = 0; i < 6 && !saved; i++) {
        a.reference = 'PA-' + String(Math.floor(100000 + Math.random() * 900000));
        try {
          await col().doc(a.reference).create(Object.assign({}, a, {
            status: 'received', consent: true, ownProductsConfirmed: true, createdAt: nowIso(),
            timeline: [{ at: nowIso(), status: 'received', text: 'Application received.' }]
          }));
          saved = true;
        } catch (e) { if (e.code !== 6 && !/already exists/i.test(e.message)) throw e; }
      }
      if (!saved) throw new Error('Could not create a reference');

      const ctx = await emailCtx();
      const team = orderEmails.partnerApplicationForStaff(a, ctx);
      const copy = orderEmails.partnerApplicationReceived(a, ctx);
      // The team email must go out, or an application could go unseen.
      await sendResendEmail({ from: 'Janedore Partnerships <noreply@janedore.co.za>', replyTo: a.email, to: ORDER_ALERT_EMAIL, subject: team.subject, html: team.html, text: team.text });
      sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: a.email, subject: copy.subject, html: copy.html, text: copy.text })
        .then(() => col().doc(a.reference).update({ receivedEmailSentAt: nowIso() }))
        .catch((e) => console.error('[PARTNER_APP] Confirmation failed:', e.message));
      res.json({ ok: true, reference: a.reference });
    } catch (e) {
      console.error('[PARTNER_APP] Error:', e.message);
      res.status(500).json({ error: 'We couldn’t submit your application. Please try again.' });
    }
  });

  // ---- Status check (brand) ----
  app.post('/api/partner-applications/status', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (limited(req, 'status', 20, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    const reference = String((req.body || {}).reference || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 20);
    const email = String((req.body || {}).email || '').trim().toLowerCase().slice(0, 200);
    const notFound = () => res.status(404).json({ error: 'We couldn’t find an application matching those details. Please check your reference and email address.' });
    if (!reference || !email) return res.status(400).json({ error: 'Please enter your reference and email address.' });
    if (!/^PA-\d{6}$/.test(reference)) return notFound();
    try {
      const doc = await col().doc(reference).get();
      if (!doc.exists || doc.data().email !== email) return notFound();
      const a = doc.data();
      res.json({
        reference: a.reference, brandName: a.brandName, status: a.status, createdAt: iso(a.createdAt),
        decidedAt: a.decidedAt || null, message: a.decisionMessage || '', conditions: a.status === 'conditional' ? (a.conditions || []) : []
      });
    } catch (e) {
      console.error('[PARTNER_APP] Status error:', e.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- Admin ----
  app.get('/api/admin/partner-applications', async (req, res) => {
    const me = await staff(req);
    if (!me || (me.role !== 'SUPER_ADMIN' && me.role !== 'ADMIN')) return res.status(403).json({ error: 'Not allowed' });
    try {
      const snap = await col().get();
      const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data(), { createdAt: iso(d.data().createdAt) }))
        .sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')));
      res.json({ role: me.role, applications: list });
    } catch (e) {
      console.error('[PARTNER_APP] Admin list error:', e.message);
      res.status(500).json({ error: 'Could not load applications.' });
    }
  });

  app.post('/api/admin/partner-applications/:id', async (req, res) => {
    const me = await staff(req);
    if (!me || me.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Only Super Admin can decide on applications.' });
    const id = String(req.params.id || '').replace(/[^A-Z0-9-]/gi, '').slice(0, 20);
    const b = req.body || {};
    const action = String(b.action || '');
    const text = String(b.text || '').trim().slice(0, 2000);
    const conditions = (Array.isArray(b.conditions) ? b.conditions : []).map((c) => String(c || '').trim().slice(0, 300)).filter(Boolean).slice(0, 15);
    try {
      const ref = col().doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: 'Application not found' });
      const a = doc.data();
      if (DECIDED.indexOf(a.status) !== -1) return res.status(409).json({ error: 'A final decision has already been made on this application.' });

      let update;
      if (action === 'review') {
        if (a.status !== 'received') return res.status(409).json({ error: 'This application is already past review.' });
        update = { status: 'under_review', log: 'Marked as under review.' };
      } else if (action === 'accept') {
        update = { status: 'accepted', log: 'Accepted.' };
      } else if (action === 'conditional') {
        if (a.status === 'conditional') return res.status(409).json({ error: 'This application is already accepted with conditions.' });
        if (!conditions.length) return res.status(400).json({ error: 'Please list at least one condition.' });
        update = { status: 'conditional', log: 'Accepted with conditions: ' + conditions.join('; ') };
      } else if (action === 'decline') {
        update = { status: 'declined', log: 'Declined.' };
      } else {
        return res.status(400).json({ error: 'Unknown action' });
      }

      const fields = { status: update.status, updatedAt: nowIso(), timeline: admin.firestore.FieldValue.arrayUnion({ at: nowIso(), status: update.status, text: update.log + (text ? ' Note: ' + text : ''), by: me.name }) };
      if (update.status !== 'under_review') {
        fields.decidedAt = nowIso();
        fields.decidedBy = me.name;
        fields.decisionMessage = text;
        if (update.status === 'conditional') fields.conditions = conditions;
      }
      await ref.update(fields);

      if (update.status !== 'under_review') {
        const ctx = await emailCtx();
        const email = orderEmails.partnerApplicationUpdate(Object.assign({}, a, { status: update.status, decisionMessage: text, conditions }), ctx);
        try {
          await sendResendEmail({ from: 'Janedore Partnerships <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: a.email, subject: email.subject, html: email.html, text: email.text });
          await ref.update({ [update.status + 'EmailSentAt']: nowIso() });
        } catch (e) {
          console.error('[PARTNER_APP] Decision email failed:', e.message);
          return res.json({ ok: true, emailFailed: true });
        }
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[PARTNER_APP] Admin action error:', e.message);
      res.status(500).json({ error: 'Could not update the application.' });
    }
  });
};
