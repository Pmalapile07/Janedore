// ==================== DELETE ACCOUNT ====================
// My account > Delete account (account.js). POST /api/account/delete
// removes the customer's account and personal data, and keeps what the
// law requires:
//
// - Deleted: the sign-in (Firebase Auth), the customers/{uid} profile
//   (details, addresses, wishlist, recent searches), waitlist entries and
//   saved bags (bag reminders).
// - Anonymised: their reviews stay on the product, as "Verified
//   customer" with no city; the link to them (reviewOwners) is deleted.
// - Kept, hidden: orders, returns and exchanges are kept for tax,
//   accounting, refunds, disputes and fraud prevention, marked
//   accountDeletedAt so they never show in an account again, even one
//   made later with the same email.
//
// Staff accounts are never deleted here. A sign-in older than 15 minutes
// must sign in again first, so a phone left signed in can't be used to
// delete someone's account.

const RECENT_SIGN_IN_SECONDS = 15 * 60;

module.exports = function registerAccount(app, deps) {
  const { adminDb, admin, rateLimited } = deps;

  async function docsWhere(col, field, value) {
    if (!value) return [];
    return (await adminDb.collection(col).where(field, '==', value).limit(500).get()).docs;
  }


  // Customer profile writes go through Admin SDK so the same validation
  // is enforced even if a browser bypasses the storefront form.
  app.post('/api/account/profile', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Account updates are not configured.' });
    if (rateLimited(req, 'account-profile', 12, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many updates. Please wait and try again.' });
    const match = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: 'Please sign in.' });
    let user;
    try { user = await admin.auth().verifyIdToken(match[1]); }
    catch (_) { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const rawPhone = String(b.phone || '').trim();
    let phone = rawPhone.replace(/[\s().-]/g, '');
    if (phone.startsWith('+27')) phone = '0' + phone.slice(3);
    else if (phone.startsWith('27') && phone.length === 11) phone = '0' + phone.slice(2);
    const email = String(user.email || '').trim().toLowerCase();
    const validEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email);
    const provinceNames = ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'];
    const province = provinceNames.find(x => x.toLowerCase() === String(b.province || '').trim().toLowerCase()) || '';
    const address = String(b.address || '').trim();
    const suburb = String(b.suburb || '').trim();
    const city = String(b.city || '').trim();
    const postalCode = String(b.postalCode || '').trim();
    const hasAddress = [address, suburb, city, b.province, postalCode].some(x => String(x || '').trim());
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return res.status(400).json({ error: 'Enter a valid full name.' });
    if (!validEmail) return res.status(400).json({ error: 'Your account email address is not valid. Please contact customer care.' });
    if (rawPhone && !/^0[1-8]\d{8}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid South African phone number using 10 digits or +27 format.' });
    if (hasAddress && (!address || address.length < 5 || address.length > 120 || /[\u0000-\u001f\u007f]/.test(address) ||
      !suburb || !/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 .,'’()/-]{1,79}$/.test(suburb) ||
      !city || !/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 .,'’()/-]{1,79}$/.test(city) ||
      !province || !/^\d{4}$/.test(postalCode))) {
      return res.status(400).json({ error: 'Complete your street address, suburb, city, province and 4-digit postal code.' });
    }
    const data = {
      name, phone, address: hasAddress ? address : '', suburb: hasAddress ? suburb : '',
      city: hasAddress ? city : '', province: hasAddress ? province : '',
      postalCode: hasAddress ? postalCode : '', email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
      await adminDb.collection('customers').doc(user.uid).set(data, { merge: true });
      return res.json({ ok: true });
    } catch (error) {
      console.error('[ACCOUNT_PROFILE_SAVE]', error.message);
      return res.status(500).json({ error: 'We couldn’t save your details. Please try again.' });
    }
  });

  app.post('/api/account/delete', async (req, res) => {
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (rateLimited(req, 'account-delete', 5, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: 'Please sign in.' });
    let user;
    try { user = await admin.auth().verifyIdToken(match[1]); } catch (e) { return res.status(401).json({ error: 'Please sign in.' }); }
    if (!user.auth_time || Date.now() / 1000 - user.auth_time > RECENT_SIGN_IN_SECONDS) {
      return res.status(401).json({ error: 'For your security, please sign in again before deleting your account.', reauth: true });
    }
    const uid = user.uid;
    // Records under the email only when the account has proved it owns it.
    const email = user.email_verified ? String(user.email || '').trim().toLowerCase() : '';
    try {
      if ((await adminDb.collection('admins').doc(uid).get()).exists) {
        return res.status(403).json({ error: 'Staff accounts can’t be deleted here. Please contact a Super Admin.' });
      }
      const now = Date.now();

      // Orders, returns and exchanges: kept, hidden from accounts.
      const orders = [...await docsWhere('orders', 'customerId', uid), ...await docsWhere('orders', 'customerEmail', email)];
      const orderIds = [...new Set(orders.map((d) => d.id))];
      const services = [];
      for (const kind of ['returns', 'exchanges']) {
        services.push(...await docsWhere(kind, 'customerEmail', email));
        for (let i = 0; i < orderIds.length; i += 10) {
          services.push(...(await adminDb.collection(kind).where('orderId', 'in', orderIds.slice(i, i + 10)).get()).docs);
        }
      }
      const hide = new Map();
      [...orders, ...services].forEach((d) => hide.set(d.ref.path, d.ref));
      await Promise.all([...hide.values()].map((ref) => ref.update({ accountDeletedAt: now })));

      // Reviews: anonymised; the owner link deleted.
      const owners = [...await docsWhere('reviewOwners', 'uid', uid), ...await docsWhere('reviewOwners', 'email', email)];
      const ownerIds = [...new Set(owners.map((d) => d.id))];
      await Promise.all(ownerIds.map(async (id) => {
        const review = adminDb.collection('reviews').doc(id);
        if ((await review.get()).exists) await review.update({ name: 'Verified customer', city: null });
        await adminDb.collection('reviewOwners').doc(id).delete();
      }));

      // Waitlist entries and saved bags: deleted.
      const gone = [
        ...await docsWhere('waitlist', 'uid', uid), ...await docsWhere('waitlist', 'email', email),
        ...await docsWhere('bags', 'email', email)
      ];
      await Promise.all([...new Map(gone.map((d) => [d.ref.path, d.ref])).values()].map((ref) => ref.delete()));

      // The profile, then the sign-in itself.
      await adminDb.collection('customers').doc(uid).delete();
      await admin.auth().deleteUser(uid);
      console.log('[ACCOUNT_DELETE] Deleted account', uid, '·', hide.size, 'records kept and hidden');
      res.json({ ok: true });
    } catch (e) {
      console.error('[ACCOUNT_DELETE] Failed for', uid, ':', e.message);
      res.status(500).json({ error: 'We couldn’t delete your account. Please try again or contact customer care.' });
    }
  });
};
