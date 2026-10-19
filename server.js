const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
const orderEmails = require('./order-emails');

const app = express();

// Render terminates TLS and proxies requests — without this, req.ip
// reads Render's internal proxy address instead of the real caller's,
// which the PayFast ITN handler below depends on to verify a
// notification really came from PayFast's own servers.
app.set('trust proxy', true);

app.use(express.json());

// ==================== SECURITY ====================
// Browser security headers on every response. frame-ancestors/X-Frame-
// Options 'self' still allow admin's homepage preview (a same-site
// iframe) but stop other sites framing the shop (clickjacking).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Server-side code and config sit in the same folder that express.static
// serves the site from. They hold no secrets, but there is no reason for
// anyone to download them, so they 404 like any missing file.
const PRIVATE_FILES = new Set([
  '/server.js', '/returns-api.js', '/exchanges-api.js', '/waitlist-api.js', '/partner-applications-api.js', '/order-emails.js',
  '/firestore.rules', '/firestore.indexes.json', '/package.json', '/package-lock.json',
  '/debugger.html'
]);
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) {}
  if (PRIVATE_FILES.has(p.toLowerCase()) || /^\/node_modules(\/|$)/i.test(p)) return res.status(404).send('Not found');
  next();
});

// Simple per-IP limiter for public endpoints: true once an IP has made
// `max` requests to this bucket within `windowMs`.
const rateBuckets = new Map();
function rateLimited(req, bucket, max, windowMs) {
  const key = bucket + ':' + String(req.ip || '');
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { rateBuckets.set(key, hits); return true; }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}
// Drop old entries every 30 minutes so the map can't grow without limit.
setInterval(() => {
  const now = Date.now();
  rateBuckets.forEach((hits, key) => { if (!hits.some((t) => now - t < 24 * 60 * 60 * 1000)) rateBuckets.delete(key); });
}, 30 * 60 * 1000).unref();

// Page HTML (/, /cart, /checkout, /products/... — any path without a file
// extension) must be re-checked on every load. Without a Cache-Control
// header, a phone restoring a tab after a while can reuse an old copy
// that still points at the previous deploy's scripts and checkout.
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.includes('.')) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

// ==================== FIREBASE ADMIN INIT ====================
// Uses the existing FIREBASE_SERVICE_ACCOUNT env var already set on Render.
// If it's missing or invalid, we fail gracefully — the /products/:slug
// route below will just fall through to the normal client-rendered page.

let serviceAccount = null;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error('[FIREBASE-ADMIN] Could not parse FIREBASE_SERVICE_ACCOUNT:', e.message);
}

let adminDb = null;
if (serviceAccount) {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  adminDb = admin.firestore();
  console.log('[FIREBASE-ADMIN] Initialized');
} else {
  console.warn('[FIREBASE-ADMIN] Not initialized — /products/:slug will serve plain index.html');
}

// ==================== COMING SOON GATE ====================
// While Coming Soon is on, storefront pages are only sent to a browser
// holding a pass this server signed: jd_visitor after the visitor
// password (/api/verify-visitor-password) or jd_admin after a Super
// Admin signs in (/api/admin-gate-pass). Both are HttpOnly and HMAC-
// signed, so a browser can't make one up, and a visitor pass stops
// working when the visitor password changes. Everyone else is sent to
// the Coming Soon page. Product data itself stays guarded by
// firestore.rules either way; this only decides who sees the shop.
const gateSecret = crypto.createHash('sha256')
  .update('jd-gate|' + (process.env.GATE_SECRET || (serviceAccount && serviceAccount.private_key) || crypto.randomBytes(32).toString('hex')))
  .digest();
const GATE_PASS_MS = 7 * 24 * 60 * 60 * 1000;
let gateCache = { at: 0, comingSoon: true, visitorPassword: null };
async function getGateState() {
  if (!adminDb) return { comingSoon: true, visitorPassword: null };
  if (Date.now() - gateCache.at < 15000) return gateCache;
  const [settings, secrets] = await Promise.all([
    adminDb.collection('settings').doc('onlineStore').get(),
    adminDb.collection('settings').doc('onlineStoreSecrets').get()
  ]);
  gateCache = {
    at: Date.now(),
    // Unset counts as gated, same as /api/online-store-status.
    comingSoon: !(settings.exists && settings.data().comingSoonEnabled === false),
    visitorPassword: (secrets.exists && secrets.data().visitorPassword) || null
  };
  return gateCache;
}
function gateSignature(kind, exp, visitorPassword) {
  return crypto.createHmac('sha256', gateSecret)
    .update(kind + '|' + exp + '|' + (kind === 'visitor' ? String(visitorPassword || '') : ''))
    .digest('hex');
}
function readCookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function hasGatePass(req, state) {
  const check = (name, kind) => {
    const [exp, sig] = readCookie(req, name).split('.');
    if (!exp || !sig || !(Number(exp) > Date.now())) return false;
    if (kind === 'visitor' && !state.visitorPassword) return false;
    const want = Buffer.from(gateSignature(kind, exp, state.visitorPassword));
    const got = Buffer.from(sig);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };
  return check('jd_admin', 'admin') || check('jd_visitor', 'visitor');
}
function setGatePass(req, res, name, kind, visitorPassword) {
  const exp = String(Date.now() + GATE_PASS_MS);
  res.cookie(name, exp + '.' + gateSignature(kind, exp, visitorPassword), {
    httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/', maxAge: GATE_PASS_MS
  });
}
// Full storefront pages only; files, the API, admin, Coming Soon itself
// and the bag reminder unsubscribe link are always served.
const GATED_HTML = new Set(['/index.html', '/store.html', '/products.html', '/category.html']);
app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = req.path;
  const page = GATED_HTML.has(p) || (!p.includes('.') && !p.startsWith('/api/') && p !== '/admin' && !p.startsWith('/bag-reminders/'));
  if (!page) return next();
  try {
    const state = await getGateState();
    if (!state.comingSoon || hasGatePass(req, state)) return next();
  } catch (e) {
    console.error('[GATE] Status check failed:', e.message);
  }
  res.set('Cache-Control', 'no-store');
  res.redirect(302, '/janedore-coming-soon.html');
});

const SITE_URL = 'https://janedore.co.za';

// ==================== SEARCH ENGINE DISCOVERY ====================
// SEO settings are editable in Admin > SEO and cached briefly to avoid
// a Firestore read on every HTML request.
let seoSettingsCache = { at: 0, value: null };
async function getSeoSettings() {
  if (!adminDb) return {};
  if (seoSettingsCache.value && Date.now() - seoSettingsCache.at < 60000) return seoSettingsCache.value;
  try {
    const doc = await adminDb.collection('settings').doc('seo').get();
    seoSettingsCache = { at: Date.now(), value: doc.exists ? (doc.data() || {}) : {} };
    return seoSettingsCache.value;
  } catch (e) {
    console.warn('[SEO] Settings unavailable:', e.message);
    return seoSettingsCache.value || {};
  }
}
function injectHomepageSeo(html, seo) {
  const title = String(seo.metaTitle || 'JANEDORE | Curated Fashion & Independent Brands').trim().slice(0, 120);
  let description = String(seo.metaDescription || 'Discover considered fashion, accessories, homeware and scent from JANEDORE and independent brands, curated in South Africa.').trim().slice(0, 320);
  const canonicalHost = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(String(seo.canonicalHost || '')) ? String(seo.canonicalHost).replace(/\/$/, '') : SITE_URL;
  const canonicalUrl = canonicalHost + '/';
  const verification = seo.googleSiteVerification
    ? '<meta name="google-site-verification" content="' + escapeHtml(String(seo.googleSiteVerification).trim()) + '">'
    : '';
  const sameAs = [seo.instagramUrl, seo.tiktokUrl].filter(url => /^https:\/\//i.test(String(url || ''))).map(url => String(url));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'JANEDORE',
    url: canonicalUrl,
    description,
    ...(sameAs.length ? { sameAs } : {})
  };
  const block = '<title>' + escapeHtml(title) + '</title>' +
    '<meta name="description" content="' + escapeHtml(description) + '">' +
    '<link rel="canonical" href="' + escapeHtml(canonicalUrl) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="JANEDORE">' +
    '<meta property="og:title" content="' + escapeHtml(title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(description) + '">' +
    '<meta property="og:url" content="' + escapeHtml(canonicalUrl) + '">' +
    '<meta property="og:image" content="' + SITE_URL + '/share-card.png">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + escapeHtml(title) + '">' +
    '<meta name="twitter:description" content="' + escapeHtml(description) + '">' +
    '<meta name="twitter:image" content="' + SITE_URL + '/share-card.png">' +
    verification +
    '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, '\\u003c') + '</script></head>';
  return replaceHeadTags(html, block);
}

function xmlEscape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

app.get('/robots.txt', async (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /account',
    'Disallow: /wishlist',
    'Disallow: /search',
    'Disallow: /*?*',
    'Sitemap: ' + SITE_URL + '/sitemap.xml',
    ''
  ].join('\n'));
});

app.get('/sitemap.xml', async (req, res) => {
  res.type('application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=1800');
  const urls = new Map();
  urls.set(SITE_URL + '/', new Date().toISOString().slice(0, 10));
  try {
    const gate = await getGateState();
    if (adminDb && !gate.comingSoon) {
      const [productSnap, collectionSnap, vendorSnap] = await Promise.all([
        adminDb.collection('products').get(),
        adminDb.collection('collections').where('status', '==', 'active').get(),
        adminDb.collection('vendors').get()
      ]);
      const vendorStatus = new Map(vendorSnap.docs.map(doc => [doc.id, String((doc.data() || {}).status || '').toLowerCase()]));
      productSnap.docs.forEach(doc => {
        const p = doc.data() || {};
        const slug = String(p.slug || '').trim();
        const status = String(p.status || '').toLowerCase();
        if (!slug || status !== 'active' || p.published === false) return;
        if (p.vendorId && ['suspended', 'inactive'].includes(vendorStatus.get(p.vendorId))) return;
        const url = SITE_URL + '/products/' + encodeURIComponent(slug);
        const updated = p.updatedAt && p.updatedAt.toDate ? p.updatedAt.toDate().toISOString().slice(0, 10) : '';
        urls.set(url, updated || new Date().toISOString().slice(0, 10));
      });
      collectionSnap.docs.forEach(doc => {
        const c = doc.data() || {};
        const handle = String(c.handle || c.slug || doc.id).trim();
        if (!handle || c.published === false) return;
        const url = SITE_URL + '/collections/' + encodeURIComponent(handle);
        const updated = c.updatedAt && c.updatedAt.toDate ? c.updatedAt.toDate().toISOString().slice(0, 10) : '';
        urls.set(url, updated || new Date().toISOString().slice(0, 10));
      });
      Object.keys(CATEGORY_META).forEach(cat => urls.set(SITE_URL + '/collections/' + encodeURIComponent(cat), new Date().toISOString().slice(0, 10)));
    }
  } catch (e) {
    console.error('[SITEMAP] Could not build dynamic URLs:', e.message);
  }
  const body = Array.from(urls.entries()).map(([loc, lastmod]) =>
    '<url><loc>' + xmlEscape(loc) + '</loc>' + (lastmod ? '<lastmod>' + xmlEscape(lastmod) + '</lastmod>' : '') + '</url>'
  ).join('');
  res.send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + body + '</urlset>');
});

// Cloudinary config endpoint — MUST be first
// Public uploads must use a dedicated, restricted Cloudinary preset.
// Never fall back to the admin preset: it may permit non-image assets.
app.get('/api/cloudinary-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    publicUploadPreset: process.env.CLOUDINARY_PUBLIC_UPLOAD_PRESET || ''
  });
});

// ==================== VAT RATE FOR CHECKOUT ====================
// settings/platform isn't readable by shoppers (staff-only rule), so the
// one value checkout needs — the VAT rate set in admin Settings ("VAT
// Rate") — is passed through here. 0 (the default) means not
// VAT-registered: checkout shows no VAT line. Cached for 5 minutes.
let vatRateCache = { value: 0, at: 0 };
app.get('/api/store-settings', async (req, res) => {
  if (adminDb && Date.now() - vatRateCache.at > 5 * 60 * 1000) {
    try {
      const doc = await adminDb.collection('settings').doc('platform').get();
      const rate = Number(doc.exists && doc.data().taxRate);
      vatRateCache = { value: Number.isFinite(rate) && rate > 0 && rate < 100 ? rate : 0, at: Date.now() };
    } catch (e) {
      console.warn('[STORE_SETTINGS] Could not read VAT rate:', e.message);
    }
  }
  res.json({ vatRate: vatRateCache.value });
});

// ==================== ONLINE STORE GATE ====================
// The "Coming Soon" on/off flag and the visitor password that bypasses
// it both live in Firestore, but neither is read by the public client
// directly: the flag's own doc could be made public-readable safely,
// but it shares a security-rules shape with the password doc, and the
// password itself must NEVER be sent to an anonymous browser. Routing
// both through the server (firebase-admin, bypasses client rules
// entirely) means no public Firestore rule changes are needed at all,
// and the password is never exposed, even in a network tab.

app.get('/api/online-store-status', async (req, res) => {
  if (!adminDb) return res.json({ comingSoonEnabled: true });
  try {
    const doc = await adminDb.collection('settings').doc('onlineStore').get();
    // Defaults to true (gated) when unset — matches the site's behavior
    // before this toggle existed, so a fresh/unconfigured doc never
    // accidentally exposes the site.
    const comingSoonEnabled = doc.exists && doc.data().comingSoonEnabled === false ? false : true;
    // unlocked: this browser holds a valid pass (Coming Soon page skips
    // itself and goes to the shop).
    let unlocked = false;
    try { unlocked = hasGatePass(req, await getGateState()); } catch (e) {}
    res.json({ comingSoonEnabled, unlocked });
  } catch (e) {
    console.error('[ONLINE_STORE_STATUS] Error:', e.message);
    res.json({ comingSoonEnabled: true });
  }
});

app.post('/api/verify-visitor-password', async (req, res) => {
  if (rateLimited(req, 'visitor-password', 10, 15 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'Too many tries. Please wait a few minutes.' });
  const password = req.body && req.body.password;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ ok: false });
  }
  if (!adminDb) return res.status(503).json({ ok: false });

  try {
    const doc = await adminDb.collection('settings').doc('onlineStoreSecrets').get();
    const storedPassword = doc.exists ? doc.data().visitorPassword : null;
    const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
    const ok = !!storedPassword && crypto.timingSafeEqual(hash(password), hash(storedPassword));
    if (ok) setGatePass(req, res, 'jd_visitor', 'visitor', storedPassword);
    res.json({ ok });
  } catch (e) {
    console.error('[VERIFY_VISITOR_PASSWORD] Error:', e.message);
    res.status(500).json({ ok: false });
  }
});

// Super Admins get a jd_admin pass so they can see the shop while it's
// behind Coming Soon (the Coming Soon admin sign-in and admin.html call
// this once signed in).
app.post('/api/admin-gate-pass', async (req, res) => {
  if (!adminDb) return res.status(503).json({ ok: false });
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ ok: false });
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const doc = await adminDb.collection('admins').doc(decoded.uid).get();
    if (!doc.exists || String(doc.data().role || '').toUpperCase() !== 'SUPER_ADMIN') return res.status(403).json({ ok: false });
    setGatePass(req, res, 'jd_admin', 'admin');
    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({ ok: false });
  }
});

// ==================== EMAIL SYSTEM ====================
// Shared by every notification this app sends. Two pieces:
//   emailLayout()      — the visual shell (logo, divider, heading, footer),
//                         lifted out of what used to be a one-off HTML
//                         string duplicated per email. Every new email
//                         type reuses this instead of rebuilding it.
//   sendResendEmail()  — the actual Resend API call, previously hand-built
//                         inline inside the welcome-email route. Now a
//                         promise-returning helper any route can call.
// from/replyTo default to support@ (the "replies welcome" address);
// pass noreply@ explicitly for emails that don't need a response — order
// confirmations etc. — matching the two addresses already set up on the
// janedore.co.za domain in Resend.

function emailLayout(opts) {
  const heading = opts.heading;
  const bodyHtml = opts.bodyHtml;
  const signature = opts.signature || 'Janedore';
  const footerHtml = opts.footerHtml ||
    'You’re receiving this because you have an account or placed an order at janedore.co.za.<br>' +
    '<a href="mailto:support@janedore.co.za">support@janedore.co.za</a>';

  return ('<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <title>' + heading + '</title>\n' +
'  <style>\n' +
'    * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'    body {\n' +
'      background-color: #ffffff;\n' +
"      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;\n" +
'      -webkit-font-smoothing: antialiased;\n' +
'      color: #1a1a1a;\n' +
'    }\n' +
'    .wrapper {\n' +
'      max-width: 560px;\n' +
'      margin: 0 auto;\n' +
'      padding: 64px 40px;\n' +
'    }\n' +
'    .logo {\n' +
'      font-size: 13px;\n' +
'      letter-spacing: 0.22em;\n' +
'      text-transform: uppercase;\n' +
'      color: #1a1a1a;\n' +
'      margin-bottom: 56px;\n' +
'      display: block;\n' +
'    }\n' +
'    .divider {\n' +
'      width: 32px;\n' +
'      height: 1px;\n' +
'      background: #1a1a1a;\n' +
'      margin-bottom: 40px;\n' +
'    }\n' +
'    .heading {\n' +
'      font-size: 28px;\n' +
'      font-weight: 300;\n' +
'      line-height: 1.2;\n' +
'      letter-spacing: -0.01em;\n' +
'      color: #1a1a1a;\n' +
'      margin-bottom: 24px;\n' +
'    }\n' +
'    .body-text {\n' +
'      font-size: 14px;\n' +
'      font-weight: 300;\n' +
'      line-height: 1.8;\n' +
'      color: #6b6b6b;\n' +
'      margin-bottom: 24px;\n' +
'    }\n' +
'    .signature {\n' +
'      display: block;\n' +
'      font-size: 12px;\n' +
'      font-weight: 400;\n' +
'      letter-spacing: 0.1em;\n' +
'      text-transform: uppercase;\n' +
'      color: #1a1a1a;\n' +
'      margin-top: 24px;\n' +
'    }\n' +
'    .footer {\n' +
'      margin-top: 64px;\n' +
'      padding-top: 32px;\n' +
'      border-top: 1px solid #e0e0e0;\n' +
'      font-size: 10px;\n' +
'      color: #aaaaaa;\n' +
'      letter-spacing: 0.04em;\n' +
'      line-height: 1.8;\n' +
'    }\n' +
'    .footer a {\n' +
'      color: #aaaaaa;\n' +
'      text-decoration: underline;\n' +
'    }\n' +
'    table.items { width: 100%; border-collapse: collapse; }\n' +
'    table.items td {\n' +
'      padding: 14px 0;\n' +
'      border-bottom: 1px solid #efefef;\n' +
'      font-size: 13px;\n' +
'      color: #1a1a1a;\n' +
'      vertical-align: top;\n' +
'    }\n' +
'    table.items td.qty { color: #6b6b6b; white-space: nowrap; padding-left: 12px; }\n' +
'    table.items td.price { text-align: right; white-space: nowrap; padding-left: 12px; }\n' +
'    table.totals { width: 100%; border-collapse: collapse; margin-top: 16px; }\n' +
'    table.totals td { padding: 4px 0; font-size: 13px; }\n' +
'    table.totals td.label { color: #6b6b6b; }\n' +
'    table.totals td.value { text-align: right; }\n' +
'    table.totals tr.grand td {\n' +
'      padding-top: 14px;\n' +
'      border-top: 1px solid #e0e0e0;\n' +
'      font-size: 15px;\n' +
'      font-weight: 500;\n' +
'      color: #1a1a1a;\n' +
'    }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div class="wrapper">\n' +
'    <span class="logo">Janedore</span>\n' +
'    <div class="divider"></div>\n' +
'    <h1 class="heading">' + heading + '</h1>\n' +
'    ' + bodyHtml + '\n' +
'    <span class="signature">' + signature + '</span>\n' +
'    <div class="footer">' + footerHtml + '</div>\n' +
'  </div>\n' +
'</body>\n' +
'</html>');
}

function sendResendEmail(opts) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return reject(new Error('RESEND_API_KEY not set'));
    }

    const fromAddress = opts.from || 'Janedore <support@janedore.co.za>';
    const body = JSON.stringify({
      from:     fromAddress,
      reply_to: opts.replyTo || fromAddress,
      to:       Array.isArray(opts.to) ? opts.to : [opts.to],
      subject:  opts.subject,
      html:     opts.html,
      text:     opts.text
    });

    const options = {
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
        } else {
          reject(new Error('Resend API error ' + response.statusCode + ': ' + data));
        }
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

// Newsletter welcome email via Resend
// Each address gets this email at most once a day, and each IP can
// trigger it 3 times an hour, so it can't be used to spam people.
const welcomeSentTo = new Map();
app.post('/api/send-welcome-email', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 200);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const last = welcomeSentTo.get(email);
  if (last && Date.now() - last < 24 * 60 * 60 * 1000) return res.json({ success: true });
  if (rateLimited(req, 'welcome-email', 3, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests' });
  welcomeSentTo.set(email, Date.now());
  if (welcomeSentTo.size > 5000) welcomeSentTo.clear();

  const html = emailLayout({
    heading: 'You’re on the list.',
    bodyHtml: '<p class="body-text">We’re not quite ready yet, but when we are,<br>you’ll be the first to know.</p>'
  });
  const text = 'You’re on the list.\n\nWe’re not quite ready yet, but when we are, you’ll be the first to know.\n\nJanedore\n\nsupport@janedore.co.za';

  sendResendEmail({
    from: 'Janedore <support@janedore.co.za>',
    to: email,
    subject: 'You’re on the list.',
    html,
    text
  }).then(() => {
    console.log('[RESEND] Welcome email sent to:', email);
    res.json({ success: true });
  }).catch((err) => {
    console.error('[RESEND] Welcome email error:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  });
});

// ==================== BRAND ASSETS (admin > Content) ====================
// The logos chosen in admin's Content section (settings/contentLibrary):
// siteLogo replaces the header wordmark, emailLogo goes in the black bar
// of every order email. Cached for a minute.
let brandAssetsCache = { value: { siteLogo: '', emailLogo: '', logoFont: '', logoFontFormat: '' }, at: 0 };
// ==================== BRAND PRIVATE DETAILS ====================
// vendors/{id} is public (the storefront reads it), so a brand's contact
// and login email, commission, PayFast merchant ID and internal notes live
// in vendorPrivate/{id} instead (admin-vendors.js, firestore.rules).
// getVendors() returns both merged. migrateVendorPrivate() moves any of
// these fields still on a vendors doc, once, on start-up.
const VENDOR_PRIVATE_FIELDS = ['email', 'accountEmail', 'accountUid', 'commissionRate', 'payfastMerchantId', 'notes'];

async function getVendors(ids) {
  if (!ids.length) return [];
  const pubs = await adminDb.getAll(...ids.map((id) => adminDb.collection('vendors').doc(id)));
  const privs = await adminDb.getAll(...ids.map((id) => adminDb.collection('vendorPrivate').doc(id)));
  return pubs.map((d, i) => d.exists ? Object.assign({}, d.data(), privs[i].exists ? privs[i].data() : {}) : null);
}

async function migrateVendorPrivate() {
  if (!adminDb) return;
  try {
    const snap = await adminDb.collection('vendors').get();
    let moved = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      const priv = {};
      const del = {};
      VENDOR_PRIVATE_FIELDS.forEach((f) => {
        if (f in d) { priv[f] = d[f]; del[f] = admin.firestore.FieldValue.delete(); }
      });
      if (!Object.keys(priv).length) continue;
      const privRef = adminDb.collection('vendorPrivate').doc(doc.id);
      const existing = await privRef.get();
      // A value already in vendorPrivate is newer; never overwrite it.
      const keep = existing.exists ? existing.data() : {};
      Object.keys(keep).forEach((k) => { if (k in priv) delete priv[k]; });
      if (Object.keys(priv).length) await privRef.set(priv, { merge: true });
      await doc.ref.update(del);
      moved++;
    }
    if (moved) console.log('[VENDOR_PRIVATE] Moved private details for ' + moved + ' brand(s)');
  } catch (e) {
    console.error('[VENDOR_PRIVATE] Migration failed:', e.message);
  }
}
migrateVendorPrivate();

async function getBrandAssets() {
  if (!adminDb || Date.now() - brandAssetsCache.at < 60 * 1000) return brandAssetsCache.value;
  try {
    const doc = await adminDb.collection('settings').doc('contentLibrary').get();
    const d = doc.exists ? doc.data() : {};
    const pick = (slot) => (slot && /^https:\/\//.test(slot.url || '') ? slot.url : '');
    brandAssetsCache = { value: { siteLogo: pick(d.siteLogo), emailLogo: pick(d.emailLogo), logoFont: pick(d.logoFont), logoFontFormat: (d.logoFont && d.logoFont.format) || '' }, at: Date.now() };
  } catch (e) {
    console.warn('[BRAND_ASSETS] Could not read content library:', e.message);
    brandAssetsCache.at = Date.now();
  }
  return brandAssetsCache.value;
}

// Cloudinary resize that keeps transparency (PNG), for logos.
function logoImageUrl(url, width) {
  return url.includes('/image/upload/') ? url.replace('/upload/', '/upload/c_limit,w_' + width + ',f_png/') : url;
}

// Guest-order access tokens are generated by the trusted server, stored as
// a SHA-256 hash on the order, and never returned by order APIs. An order ID alone
// must not grant access to customer details or payment initiation.
function orderAccessTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
function hasOrderAccess(req, order) {
  const token = String(req.headers['x-order-access-token'] || '');
  const storedHash = String(order && order.orderAccessTokenHash || '');
  if (!token || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  return orderAccessTokenHash(token) === storedHash;
}

// ==================== ORDER NOTIFICATIONS ====================
// Sent once an order is paid (PayFast ITN below). Designs live in
// order-emails.js. Who gets what:
//   customer — one confirmation for the whole order
//   Janedore — every order, all brands (ORDER_ALERT_EMAIL, default support@)
//   each brand — only its own items and where to ship them. Products with
//     no brand profile, or whose brand email is a janedore.co.za address,
//     are Janedore's own: they're in the Janedore email, nothing extra sent.
const ORDER_ALERT_EMAIL = process.env.ORDER_ALERT_EMAIL || 'support@janedore.co.za';

// Product photo for an email: the item's colour's first photo, resized and
// as JPEG (some email apps can't show WebP).
function emailImageUrl(product, variantIndex) {
  const variants = (product && product.variants) || [];
  const v = variants[variantIndex || 0] || variants[0] || {};
  const imgs = v.images || {};
  const url = (imgs.ghost && imgs.ghost[0]) || (imgs.model && imgs.model[0]) || '';
  if (!/^https:\/\//.test(url)) return '';
  return url.includes('/upload/') ? url.replace('/upload/', '/upload/c_fill,w_144,h_192,q_auto,f_jpg/') : url;
}

// Loads each item's product (for its photo and its brand — taken from the
// product itself, not from what the browser wrote on the order).
async function buildOrderEmailContext(order) {
  const items = order.items || [];
  const ids = [...new Set(items.map(i => String(i.productId || '')).filter(Boolean))];
  const products = {};
  if (ids.length) {
    const docs = await adminDb.getAll(...ids.map(id => adminDb.collection('products').doc(id)));
    docs.forEach(d => { if (d.exists) products[d.id] = d.data(); });
  }
  const assets = await getBrandAssets();
  return {
    siteUrl: SITE_URL,
    logoUrl: assets.emailLogo ? logoImageUrl(assets.emailLogo, 360) : '',
    logoFontUrl: assets.logoFont || '',
    products,
    vendorIdFor: item => (products[item.productId] && products[item.productId].vendorId) || item.vendorId || null,
    imageFor: item => emailImageUrl(products[item.productId], item.variantIndex)
  };
}

// Random order numbers (JD-483920) that say nothing about how many orders
// the shop gets. Reserved in orderNumbers/{number} so no two orders can
// ever share one. Given out when the order is paid, so abandoned
// checkouts never use one up.
async function assignOrderNumber(orderRef) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const number = 'JD-' + crypto.randomInt(100000, 1000000);
    try {
      await adminDb.collection('orderNumbers').doc(number).create({ orderId: orderRef.id, at: admin.firestore.FieldValue.serverTimestamp() });
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(e.message)) continue; // taken — draw again
      throw e;
    }
    return number;
  }
  throw new Error('Could not find a free order number');
}

async function sendPaidOrderEmails(orderId, order) {
  const ctx = await buildOrderEmailContext(order);
  const sent = { customer: false, janedore: false, brands: [] };
  const send = (to, email, from) => sendResendEmail({
    from: from || 'Janedore <noreply@janedore.co.za>',
    replyTo: 'support@janedore.co.za',
    to, subject: email.subject, html: email.html, text: email.text
  });

  // Group the items by brand, and look up each brand's email.
  const byVendor = {};
  (order.items || []).forEach(item => {
    const vid = ctx.vendorIdFor(item);
    if (vid) (byVendor[vid] = byVendor[vid] || []).push(item);
  });
  const vendorIds = Object.keys(byVendor);
  const vendorList = await getVendors(vendorIds);
  const brandSends = [];
  const notes = [];
  vendorList.forEach((vendor, i) => {
    const label = (vendor && (vendor.brand || vendor.name)) || 'A brand';
    const to = vendor && String(vendor.email || vendor.accountEmail || '').trim();
    if (!to) { notes.push(escapeHtml(label) + ' has no email on file, so they were not emailed.'); return; }
    if (/@janedore\.co\.za$/i.test(to)) return; // Janedore's own brand
    brandSends.push({ id: vendorIds[i], label, to, items: byVendor[vendorIds[i]], vendor });
  });
  if (brandSends.length) notes.unshift('Emailed ' + brandSends.map(b => escapeHtml(b.label)).join(', ') + ' with their items.');
  ctx.vendorEmailNote = notes.join(' ');

  const jobs = [];
  if (order.customerEmail) {
    jobs.push(send(order.customerEmail, orderEmails.customerConfirmation(order, ctx))
      .then(() => { sent.customer = true; })
      .catch(err => console.warn('[ORDER_EMAIL] Customer email failed for', orderId, ':', err.message)));
  }
  jobs.push(send(ORDER_ALERT_EMAIL, orderEmails.adminNewOrder(order, ctx), 'Janedore Orders <noreply@janedore.co.za>')
    .then(() => { sent.janedore = true; })
    .catch(err => console.warn('[ORDER_EMAIL] Janedore alert failed for', orderId, ':', err.message)));
  brandSends.forEach(b => {
    jobs.push(send(b.to, orderEmails.vendorNewOrder(order, ctx, b.vendor, b.items))
      .then(() => { sent.brands.push(b.id); })
      .catch(err => console.warn('[ORDER_EMAIL] Brand email failed for', orderId, b.id, ':', err.message)));
  });
  await Promise.all(jobs);

  // Kept on the order so admin can see what went out.
  await adminDb.collection('orders').doc(orderId).update({
    emailsSent: Object.assign(sent, { at: admin.firestore.FieldValue.serverTimestamp() })
  }).catch(() => {});
}

// ==================== PAYFAST INTEGRATION ====================
// Reference: PayFast's own Developer Documentation (Custom Integration
// + ITN + Split Payments sections). Three pieces:
//   1. generatePayFastSignature() — the exact algorithm PayFast's docs
//      specify (their own PHP reference implementation, translated).
//   2. POST /api/payfast/initiate — called by checkout.js right after
//      an order is created (still pending/unpaid); builds the signed
//      field set checkout.js submits as a redirect to PayFast.
//   3. POST /api/payfast/notify — the ITN webhook PayFast calls once a
//      payment completes. Runs all four checks PayFast's docs require
//      before trusting it, then marks the order paid and sends the
//      confirmation email — this is now the ONLY place that happens.


// Defaults to sandbox — PAYFAST_SANDBOX must be explicitly set to the
// literal string 'false' to process real payments. A missing or
// misspelled env var fails safe (stays in sandbox) rather than
// accidentally going live.
const PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX !== 'false';
const PAYFAST_HOST = PAYFAST_SANDBOX ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
const PAYFAST_PROCESS_URL = 'https://' + PAYFAST_HOST + '/eng/process';
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;

if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) {
  console.warn('[PAYFAST] PAYFAST_MERCHANT_ID/PAYFAST_MERCHANT_KEY not set — /api/payfast/initiate will fail until they are');
} else {
  console.log('[PAYFAST] Initialized in', PAYFAST_SANDBOX ? 'SANDBOX' : 'LIVE', 'mode');
}

// PHP's urlencode() — which PayFast's signature algorithm is specified
// in terms of — differs from JS's encodeURIComponent() in two ways:
// spaces become '+' (not %20), and it additionally escapes ! ' ( ) * ~
// which encodeURIComponent leaves untouched. A different encoding
// produces a different hash, which PayFast silently rejects as a
// signature mismatch, so this match has to be exact, not approximate.
function payFastUrlEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Mirrors PayFast's documented PHP reference implementation exactly:
// concatenate fields in the order they're given — NOT alphabetical;
// PayFast's docs explicitly warn not to confuse this with a
// different, alphabetically-ordered API they also expose — append the
// passphrase, MD5 the result. `data` must be a plain object built
// with keys in the exact order PayFast's field list specifies; JS
// preserves string-key insertion order, so this only works if the
// caller constructed the object correctly to begin with.
//
// includeBlanks: initiate's own outgoing fields are never blank in
// practice, so this stays false there (unchanged, already confirmed
// correct — PayFast accepts and processes the resulting signature).
// A real ITN signature mismatch traced to the raw POST body having
// blank fields (item_description, custom_str1-5, custom_int1-5) that
// this used to silently drop before hashing — PayFast's own ITN
// signature includes them, so this is passed true there instead.
function buildPayFastParamString(data, includeBlanks) {
  let pfOutput = '';
  for (const key of Object.keys(data)) {
    const val = data[key];
    const isBlank = (val === '' || val === undefined || val === null);
    if (includeBlanks || !isBlank) {
      pfOutput += key + '=' + payFastUrlEncode(String(isBlank ? '' : val).trim()) + '&';
    }
  }
  return pfOutput.slice(0, -1);
}

function generatePayFastSignature(data, passphrase, includeBlanks) {
  let getString = buildPayFastParamString(data, includeBlanks);
  if (passphrase) {
    getString += '&passphrase=' + payFastUrlEncode(String(passphrase).trim());
  }
  return crypto.createHash('md5').update(getString).digest('hex');
}

// ==================== ORDER PRICING (server-side, authoritative) ====================
// The browser builds the order (items, sizes, quantities), but it must
// never decide what it costs: the order doc is created client-side, so a
// total written there is whatever the visitor's browser says. Before
// PayFast is ever asked to charge anything, this re-prices the order from
// the live product records and the discount code's own record, and that
// result — not the browser's — is what gets charged and what the ITN
// later checks the payment against. Mirrors cart.js's rules exactly:
// sale price only when 0 < salePrice < price, discount validated the same
// way applyPromoCode() does, and delivery per brand package: R150, or
// free when every item in it is marked Free delivery and the package
// comes to R750 or more (cart.js getCartShipments()).
const SHIPPING_FEE = 150;
const FREE_DELIVERY_MIN = 750;
const HOUSE_VENDOR_ID = 'vendor-janedore';
function isHouseProduct(p) {
  return !!p && (!p.vendorId || p.vendorId === HOUSE_VENDOR_ID || String(p.brand || '').trim().toUpperCase() === 'JANEDORE');
}
// Per brand (vendors/{id}.freeDelivery, set in Admin > Brands); JANEDORE
// itself defaults to on. freeVendors: vendorId -> that flag.
function isFreeDeliveryProduct(p, freeVendors) {
  if (!p) return false;
  const house = isHouseProduct(p);
  const flag = freeVendors && freeVendors[house ? HOUSE_VENDOR_ID : p.vendorId];
  return typeof flag === 'boolean' ? flag : house;
}

function serverUnitPrice(product) {
  const price = Number(product.price) || 0;
  const sale = Number(product.salePrice);
  return (Number.isFinite(sale) && sale > 0 && sale < price) ? sale : price;
}

async function priceOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) throw Object.assign(new Error('Order has no items'), { status: 400 });

  const ids = [...new Set(items.map(i => String(i.productId || '')))];
  const docs = await Promise.all(ids.map(id => adminDb.collection('products').doc(id).get()));
  const products = {};
  docs.forEach((d, i) => { if (d.exists) products[ids[i]] = d.data(); });

  let subtotal = 0;
  let itemCount = 0;
  let cheapestUnit = Infinity;
  const pricedItems = items.map(item => {
    const product = products[String(item.productId || '')];
    if (!product) throw Object.assign(new Error('A product in this order is no longer available'), { status: 409 });
    const qty = Math.floor(Number(item.qty));
    if (!(qty > 0)) throw Object.assign(new Error('Invalid quantity'), { status: 400 });
    const unit = serverUnitPrice(product);
    subtotal += unit * qty;
    itemCount += qty;
    cheapestUnit = Math.min(cheapestUnit, unit);
    // Pre-order comes from the product, never the browser: those lines
    // ship later as their own package (orderShipments()).
    const preorder = isPreorderProduct(product);
    return Object.assign({}, item, { qty, price: unit, preorder, preorderShipDate: preorder ? (product.preorderShipDate || null) : null });
  });

  let discount = null;
  let discountAmount = 0;
  const code = String(order.discountCode || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 20);
  if (code) {
    const snap = await adminDb.collection('discounts').where('code', '==', code).limit(1).get();
    const d = snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
    const now = new Date();
    const usable = d && d.active &&
      !(d.startDate && new Date(d.startDate) > now) &&
      !(d.endDate && new Date(d.endDate) < now) &&
      !(d.usageLimit !== null && d.usageLimit !== undefined && (d.usageCount || 0) >= d.usageLimit) &&
      !(d.minimumPurchase && subtotal < Number(d.minimumPurchase));
    if (usable) {
      const value = Number(d.value) || 0;
      if (d.type === 'percentage') discountAmount = subtotal * value / 100;
      else if (d.type === 'fixed_amount') discountAmount = Math.min(value, subtotal);
      else if (d.type === 'buy_x_get_y') discountAmount = itemCount >= value && Number.isFinite(cheapestUnit) ? cheapestUnit : 0;
      discountAmount = Math.round(Math.max(0, Math.min(discountAmount, subtotal)) * 100) / 100;
      discount = { id: d.id, code: d.code, type: d.type };
    }
  }

  const afterDiscount = Math.max(0, subtotal - discountAmount);
  // One parcel per brand; JANEDORE's own stock is one package.
  const codeFree = !!(discount && discount.type === 'free_shipping');
  const vendorIds = [...new Set([HOUSE_VENDOR_ID].concat(Object.values(products).map((p) => p.vendorId).filter(Boolean)))];
  const vendorDocs = await adminDb.getAll(...vendorIds.map((id) => adminDb.collection('vendors').doc(id)));
  const freeVendors = {};
  vendorDocs.forEach((d, i) => { if (d.exists && typeof d.data().freeDelivery === 'boolean') freeVendors[vendorIds[i]] = d.data().freeDelivery; });
  const packageMap = new Map();
  pricedItems.forEach((i) => {
    const product = products[String(i.productId || '')];
    const key = isHouseProduct(product) ? 'janedore' : product.vendorId;
    if (!packageMap.has(key)) packageMap.set(key, { subtotal: 0, eligible: true });
    const pkg = packageMap.get(key);
    pkg.subtotal += i.price * i.qty;
    if (!isFreeDeliveryProduct(product, freeVendors)) pkg.eligible = false;
  });
  const packages = packageMap.size;
  let shipping = 0;
  packageMap.forEach((pkg) => {
    if (!(codeFree || (pkg.eligible && pkg.subtotal >= FREE_DELIVERY_MIN))) shipping += SHIPPING_FEE;
  });
  const total = Math.round((afterDiscount + shipping) * 100) / 100;

  return {
    items: pricedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    discountCode: discount ? discount.code : null,
    discountId: discount ? discount.id : null,
    discountAmount,
    shipping,
    shippingPackages: packages,
    total,
    itemCount,
    pricedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

// Trusted checkout endpoint: the browser may submit a cart and delivery
// details, but only this server creates the order and reserves inventory.
// Firestore Admin SDK writes bypass client rules; stock is never decremented
// directly by an anonymous browser.
app.post('/api/orders/create', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Checkout is not configured' });
  if (rateLimited(req, 'order-create', 12, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many checkout attempts. Please try again shortly.' });
  }
  const body = req.body || {};
  const input = body.orderData || {};
  const items = Array.isArray(input.items) ? input.items.slice(0, 30) : [];
  if (!items.length) return res.status(400).json({ error: 'Your bag is empty.' });
  if (items.some(i => !i || typeof i.productId !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(i.productId) || !Number.isInteger(Number(i.qty)) || Number(i.qty) < 1 || Number(i.qty) > 20)) {
    return res.status(400).json({ error: 'One or more items or quantities are invalid.' });
  }
  const customerEmail = String(input.customerEmail || '').trim().toLowerCase().slice(0, 200);
  const customerName = String(input.customerName || '').trim().slice(0, 120);
  const customerPhone = String(input.customerPhone || '').trim().slice(0, 40);
  const shippingAddress = String(input.shippingAddress || '').trim().slice(0, 300);
  const city = String(input.city || '').trim().slice(0, 100);
  const province = String(input.province || '').trim().slice(0, 100);
  const postalCode = String(input.postalCode || '').trim().slice(0, 30);
  const country = String(input.country || '').trim().slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || !customerName || !shippingAddress || !city || !province || !postalCode || !country) {
    return res.status(400).json({ error: 'Please provide valid customer and delivery details.' });
  }

  let customerId = null;
  const bearer = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (bearer) {
    try { customerId = (await admin.auth().verifyIdToken(bearer[1])).uid; }
    catch (e) { return res.status(401).json({ error: 'Your sign-in session expired. Please sign in again.' }); }
  }

  try {
    const orderRef = adminDb.collection('orders').doc();
    const accessToken = crypto.randomBytes(32).toString('hex');
    const orderNumber = 'ORD-' + Date.now() + '-' + accessToken.slice(0, 4).toUpperCase();
    const inputItems = items.map(i => ({
      productId: String(i.productId).slice(0, 150),
      qty: Math.floor(Number(i.qty)),
      size: String(i.size || 'OS').slice(0, 30),
      color: String(i.color || '').slice(0, 80),
      variantIndex: Math.max(0, Math.min(50, Math.floor(Number(i.variantIndex) || 0)))
    }));
    const priced = await priceOrder({ items: inputItems, discountCode: String(input.discountCode || '').slice(0, 40) });
    const itemsByProduct = {};
    priced.items.forEach(i => { (itemsByProduct[i.productId] = itemsByProduct[i.productId] || []).push(i); });
    const productIds = Object.keys(itemsByProduct);
    const productRefs = productIds.map(id => adminDb.collection('products').doc(id));

    await adminDb.runTransaction(async (tx) => {
      const productDocs = await Promise.all(productRefs.map(ref => tx.get(ref)));
      const productsById = {};
      productDocs.forEach((doc, i) => {
        if (!doc.exists) throw Object.assign(new Error('A product in your bag is no longer available.'), { status: 409 });
        const product = doc.data();
        if (String(product.status || '').toLowerCase() !== 'active') {
          throw Object.assign(new Error('A product in your bag is no longer available.'), { status: 409 });
        }
        productsById[productIds[i]] = product;
        const expected = itemsByProduct[productIds[i]][0].price;
        if (Math.abs(serverUnitPrice(product) - expected) > 0.001) {
          throw Object.assign(new Error('A product price just changed. Please review your bag and try again.'), { status: 409 });
        }
      });
      const shortfalls = applyStockChange(tx, productDocs, productRefs, itemsByProduct, -1);
      if (shortfalls.length) {
        throw Object.assign(new Error('Some items have just sold out or no longer have enough stock: ' + shortfalls.join(', ')), { status: 409 });
      }
      const canonicalItems = priced.items.map(item => {
        const product = productsById[item.productId];
        return Object.assign({}, item, {
          name: String(product.name || item.name || 'Product').slice(0, 200),
          brand: String(product.brand || 'JANEDORE').slice(0, 120),
          vendorId: product.vendorId || null
        });
      });
      const vendorIds = [...new Set(canonicalItems.map(i => i.vendorId).filter(Boolean))];
      const brands = [...new Set(canonicalItems.map(i => i.brand).filter(Boolean))];
      tx.set(orderRef, {
        orderNumber, customerEmail, customerName, customerPhone, customerId,
        shippingAddress, city, province, postalCode, country,
        items: canonicalItems, packageCount: priced.shippingPackages, brands, vendorIds,
        subtotal: priced.subtotal, discountCode: priced.discountCode,
        discountAmount: priced.discountAmount, shipping: priced.shipping,
        total: priced.total, currency: 'ZAR', itemCount: priced.itemCount,
        status: 'pending', paymentStatus: 'unpaid',
        orderAccessTokenHash: orderAccessTokenHash(accessToken),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    res.status(201).json({ orderId: orderRef.id, orderAccessToken: accessToken, orderNumber });
  } catch (e) {
    console.error('[ORDER_CREATE] Error:', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not create your order. Please try again.' });
  }
});

app.post('/api/payfast/initiate', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) return res.status(503).json({ error: 'PayFast not configured' });

  const orderId = req.body && req.body.orderId;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderDoc.data();
    if (!hasOrderAccess(req, order)) return res.status(403).json({ error: 'Order access could not be verified' });
    if (order.paymentStatus === 'paid') return res.status(400).json({ error: 'Order already paid' });
    if (['cancelled', 'failed', 'expired'].includes(order.paymentStatus)) return res.status(400).json({ error: 'This order is no longer open. Please check out again.' });

    // Charge what the order really costs, never what the browser wrote.
    let priced;
    try {
      priced = await priceOrder(order);
    } catch (pe) {
      return res.status(pe.status || 500).json({ error: pe.message || 'Could not price order' });
    }
    if (!(priced.total > 0)) return res.status(400).json({ error: 'Order total must be more than R0' });
    if (Math.abs(Number(order.total || 0) - priced.total) > 0.01) {
      console.warn('[PAYFAST_INIT] Order', orderId, 'browser total', order.total, 'repriced to', priced.total);
    }
    await orderRef.update(priced);
    Object.assign(order, priced);

    const nameParts = (order.customerName || '').trim().split(/\s+/).filter(Boolean);
    const nameFirst = nameParts[0] || 'Customer';
    const nameLast = nameParts.slice(1).join(' ') || 'Customer';

    // Field order matters — the signature below is a hash of these
    // fields concatenated in exactly this order, not sorted.
    const data = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: SITE_URL + '/?payfast_return=1&order=' + encodeURIComponent(orderId),
      cancel_url: SITE_URL + '/?payfast_cancel=1&order=' + encodeURIComponent(orderId),
      notify_url: SITE_URL + '/api/payfast/notify',
      name_first: nameFirst,
      name_last: nameLast,
      email_address: order.customerEmail,
      m_payment_id: orderId,
      amount: Number(order.total || 0).toFixed(2),
      item_name: 'Janedore Order #' + (order.orderNumber || orderId)
    };
    // The method the customer picked on checkout step 3. With it set,
    // PayFast opens straight on that method; left out, PayFast lists every
    // method enabled on the account (Apple Pay, SnapScan, …). Signed, so it
    // must sit here — after the transaction details, before the signature.
    const PAYFAST_METHODS = ['cc', 'ef'];
    const paymentMethod = req.body && req.body.paymentMethod;
    if (PAYFAST_METHODS.includes(paymentMethod)) data.payment_method = paymentMethod;

    // Split Payments can only target ONE third-party merchant per
    // transaction (PayFast's own constraint, not ours) — only attach a
    // split when this order has exactly one vendor and that vendor has
    // a PayFast account on file. A multi-vendor cart, or a vendor with
    // no PayFast ID configured yet, just pays Janedore in full, same
    // as any order would without this field — nothing breaks either
    // way, the payout is just manual for that order instead.
    let setupField = null;
    if (Array.isArray(order.vendorIds) && order.vendorIds.length === 1) {
      const vendor = (await getVendors([order.vendorIds[0]]))[0];
      if (vendor && vendor.payfastMerchantId) {
        const commission = Number(vendor.commissionRate);
        const vendorPercentage = Number.isFinite(commission)
          ? Math.max(0, Math.min(100, Math.round(100 - commission)))
          : 85; // falls back to admin-vendors.js's own 15%-commission default
        setupField = JSON.stringify({
          split_payment: { merchant_id: Number(vendor.payfastMerchantId), percentage: vendorPercentage }
        });
      }
    }

    // Signature is computed on `data` alone — PayFast's docs explicitly
    // exclude `setup` from the signature calculation; adding it before
    // this point would make every split payment fail with a mismatch.
    const signature = generatePayFastSignature(data, PAYFAST_PASSPHRASE);

    const fields = Object.assign({}, data, { signature });
    if (setupField) fields.setup = setupField;

    res.json({ action: PAYFAST_PROCESS_URL, fields });
  } catch (e) {
    console.error('[PAYFAST_INITIATE] Error:', e.message);
    res.status(500).json({ error: 'Could not start payment' });
  }
});

// ==================== STOCK RETURN FOR UNPAID ORDERS ====================
// Stock is taken off when the order is created (checkout.js, in the same
// transaction as the order) so two customers can't both buy the last unit.
// If that order then never gets paid — cancelled on PayFast, payment
// failed, or the customer simply left — the units go back here. Runs in a
// transaction and records stockRestored on the order, so it can only ever
// happen once per order, and never to a paid one. Mirrors checkout.js's
// decrement exactly: per color/size when the product tracks stock that
// way (stockByVariant), otherwise the flat product total.
function applyStockChange(tx, productDocs, productRefs, itemsByProduct, sign) {
  const shortfalls = [];
  productDocs.forEach((doc, i) => {
    if (!doc.exists) return;
    const data = doc.data();
    const items = itemsByProduct[productRefs[i].id];
    const byVariant = (data.stockByVariant && typeof data.stockByVariant === 'object') ? JSON.parse(JSON.stringify(data.stockByVariant)) : null;
    if (byVariant) {
      items.forEach(item => {
        const vi = item.variantIndex ?? 0;
        const key = item.size || 'OS';
        const sizes = byVariant[vi] || {};
        const current = typeof sizes[key] === 'number' ? sizes[key] : 0;
        const next = current + sign * item.qty;
        if (next < 0) shortfalls.push((item.name || productRefs[i].id) + ' (' + key + ')');
        sizes[key] = Math.max(0, next);
        byVariant[vi] = sizes;
      });
      const total = Object.values(byVariant).reduce((sum, sizes) =>
        sum + Object.values(sizes).reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0), 0);
      tx.update(productRefs[i], { stockByVariant: byVariant, stock: total });
    } else {
      const qty = items.reduce((a, it) => a + it.qty, 0);
      const next = (data.stock || 0) + sign * qty;
      if (next < 0) shortfalls.push(items[0].name || productRefs[i].id);
      tx.update(productRefs[i], { stock: Math.max(0, next) });
    }
  });
  return shortfalls;
}

function groupOrderItems(order) {
  const itemsByProduct = {};
  (order.items || []).forEach(item => {
    const id = String(item.productId || '');
    const qty = Math.floor(Number(item.qty));
    if (!id || !(qty > 0)) return;
    (itemsByProduct[id] = itemsByProduct[id] || []).push(Object.assign({}, item, { qty }));
  });
  return itemsByProduct;
}

// Marks an unpaid order with `paymentStatus` (cancelled/failed/expired)
// and puts its stock back. Returns false if there was nothing to do.
async function releaseUnpaidOrder(orderRef, paymentStatus) {
  return adminDb.runTransaction(async (tx) => {
    const orderDoc = await tx.get(orderRef);
    if (!orderDoc.exists) return false;
    const order = orderDoc.data();
    const current = order.paymentStatus || 'unpaid';
    if (current === 'paid' || order.stockRestored) {
      if (current === 'unpaid') tx.update(orderRef, { paymentStatus });
      return false;
    }
    const itemsByProduct = groupOrderItems(order);
    const productRefs = Object.keys(itemsByProduct).map(id => adminDb.collection('products').doc(id));
    const productDocs = await Promise.all(productRefs.map(ref => tx.get(ref)));
    applyStockChange(tx, productDocs, productRefs, itemsByProduct, +1);
    tx.update(orderRef, {
      paymentStatus: current === 'unpaid' ? paymentStatus : current,
      stockRestored: true,
      stockRestoredAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return true;
  });
}

// Payment arrived for an order whose stock was already given back (it
// expired or was cancelled first). The customer has paid, so the sale
// stands: take the stock again, and flag the order for the team if any
// of it has sold out in the meantime.
async function reclaimStockForLatePayment(orderRef) {
  return adminDb.runTransaction(async (tx) => {
    const orderDoc = await tx.get(orderRef);
    if (!orderDoc.exists || !orderDoc.data().stockRestored) return [];
    const itemsByProduct = groupOrderItems(orderDoc.data());
    const productRefs = Object.keys(itemsByProduct).map(id => adminDb.collection('products').doc(id));
    const productDocs = await Promise.all(productRefs.map(ref => tx.get(ref)));
    const shortfalls = applyStockChange(tx, productDocs, productRefs, itemsByProduct, -1);
    tx.update(orderRef, Object.assign({ stockRestored: false },
      shortfalls.length ? { needsAttention: 'Paid after expiry; out of stock: ' + shortfalls.join(', ') } : {}));
    return shortfalls;
  });
}

// Abandoned checkouts: anything still unpaid 2 hours after it was placed
// is expired and its stock returned. Queried on paymentStatus alone (a
// single-field index Firestore has by default) and filtered by age here.
const UNPAID_ORDER_TTL_MS = 2 * 60 * 60 * 1000;
async function expireAbandonedOrders() {
  if (!adminDb) return;
  try {
    const cutoff = Date.now() - UNPAID_ORDER_TTL_MS;
    const snap = await adminDb.collection('orders').where('paymentStatus', '==', 'unpaid').get();
    let released = 0;
    for (const doc of snap.docs) {
      const created = doc.data().createdAt;
      const createdMs = created && typeof created.toMillis === 'function' ? created.toMillis() : 0;
      if (!createdMs || createdMs > cutoff) continue;
      if (await releaseUnpaidOrder(doc.ref, 'expired')) released++;
    }
    if (released) console.log('[ORDERS] Expired', released, 'abandoned unpaid order(s) and returned their stock');
  } catch (e) {
    console.error('[ORDERS] Abandoned-order sweep failed:', e.message);
  }
}
setTimeout(expireAbandonedOrders, 60 * 1000);
setInterval(expireAbandonedOrders, 15 * 60 * 1000).unref();

// Called by checkout.js when the customer lands back on cancel_url —
// the only signal we get for an explicit cancel, since PayFast's ITN
// only fires for an actual payment attempt. Guarded against the order
// having been paid in the meantime (e.g. the ITN winning a race against
// this call) so a cancel report can never downgrade a real payment.
app.post('/api/payfast/order/:id/cancel', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const orderRef = adminDb.collection('orders').doc(req.params.id);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Order not found' });
    if (!hasOrderAccess(req, orderDoc.data())) return res.status(403).json({ error: 'Order access could not be verified' });
    await releaseUnpaidOrder(orderRef, 'cancelled');
    res.json({ ok: true });
  } catch (e) {
    console.error('[PAYFAST_CANCEL] Error:', e.message);
    res.status(500).json({ error: 'Could not record cancellation' });
  }
});

const PAYFAST_VALID_HOSTS = ['www.payfast.co.za', 'sandbox.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za'];

function resolveValidPayFastIps() {
  const dns = require('dns');
  return new Promise((resolve) => {
    const ips = new Set();
    let remaining = PAYFAST_VALID_HOSTS.length;
    PAYFAST_VALID_HOSTS.forEach((host) => {
      dns.lookup(host, { all: true }, (err, addresses) => {
        if (!err && addresses) addresses.forEach(a => ips.add(a.address));
        remaining -= 1;
        if (remaining === 0) resolve(ips);
      });
    });
  });
}

function payFastServerConfirm(paramString) {
  return new Promise((resolve) => {
    const options = {
      hostname: PAYFAST_HOST,
      path: '/eng/query/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(paramString)
      }
    };
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve(data.trim() === 'VALID'));
    });
    request.on('error', () => resolve(false));
    request.write(paramString);
    request.end();
  });
}

// PayFast posts the ITN as application/x-www-form-urlencoded, scoped
// to just this path so the rest of the app keeps using express.json().
app.use('/api/payfast/notify', express.urlencoded({ extended: false }));

app.post('/api/payfast/notify', async (req, res) => {
  // Ack immediately — PayFast retries aggressively (instantly, then
  // after 10 minutes, then exponentially) if it doesn't get a 200, and
  // every check below runs independently of this response.
  res.status(200).send('OK');

  if (!adminDb) { console.error('[PAYFAST_ITN] adminDb not configured'); return; }

  try {
    const pfData = req.body || {};
    const receivedSignature = pfData.signature;
    const dataForSignature = Object.assign({}, pfData);
    delete dataForSignature.signature;

    // Check 1 — signature. Recomputed over every field PayFast posted
    // back, INCLUDING blank ones (item_description, custom_str1-5,
    // custom_int1-5) — PayFast's own ITN signature counts those, even
    // though initiate correctly omits blanks from its own outgoing
    // signature (confirmed against a real sandbox payment's raw POST
    // body before this was changed from the old blanks-stripped
    // version, which failed on every single payment).
    const expectedSignature = generatePayFastSignature(dataForSignature, PAYFAST_PASSPHRASE, true);

    if (expectedSignature !== receivedSignature) {
      console.error('[PAYFAST_ITN] Signature mismatch for', pfData.m_payment_id);
      return;
    }

    // Check 2 — the request really came from a PayFast server.
    const validIps = await resolveValidPayFastIps();
    const requestIp = String(req.ip || '').replace('::ffff:', '');
    if (!validIps.has(requestIp)) {
      console.error('[PAYFAST_ITN] Untrusted source IP:', requestIp, 'for', pfData.m_payment_id);
      return;
    }

    // Check 3 — the amount paid matches what this order actually costs.
    const orderId = pfData.m_payment_id;
    if (!orderId) { console.error('[PAYFAST_ITN] Missing m_payment_id'); return; }
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) { console.error('[PAYFAST_ITN] Unknown order:', orderId); return; }
    const order = orderDoc.data();
    const expectedAmount = Number(order.total || 0);
    const receivedAmount = Number(pfData.amount_gross || 0);
    if (Math.abs(expectedAmount - receivedAmount) > 0.01) {
      console.error('[PAYFAST_ITN] Amount mismatch for', orderId, '— expected', expectedAmount, 'got', receivedAmount);
      return;
    }

    // Check 4 — ask PayFast itself to confirm this exact transaction.
    const paramString = Object.keys(pfData)
      .filter(k => k !== 'signature')
      .map(k => k + '=' + payFastUrlEncode(pfData[k]))
      .join('&');
    const confirmed = await payFastServerConfirm(paramString);
    if (!confirmed) {
      console.error('[PAYFAST_ITN] Server confirmation failed for', orderId);
      return;
    }

    if (pfData.payment_status !== 'COMPLETE') {
      console.log('[PAYFAST_ITN]', orderId, 'status is', pfData.payment_status, '— not marking paid');
      // Only act on an explicit FAILED — PENDING (used by some payment
      // methods) may still resolve to COMPLETE on a later ITN, so it's
      // left alone rather than being recorded as a failure prematurely.
      if (pfData.payment_status === 'FAILED' && order.paymentStatus === 'unpaid') {
        await releaseUnpaidOrder(orderRef, 'failed');
      }
      return;
    }
    if (order.paymentStatus === 'paid') {
      console.log('[PAYFAST_ITN] Order', orderId, 'already marked paid — ignoring duplicate notification');
      return;
    }

    if (order.stockRestored) {
      const shortfalls = await reclaimStockForLatePayment(orderRef);
      if (shortfalls.length) console.error('[PAYFAST_ITN] Order', orderId, 'paid after its stock was released; now short on:', shortfalls.join(', '));
    }

    // Short random order number, saved in the same write that marks the
    // order paid, so the confirmation page never shows the old one.
    let orderNumber = order.orderNumber || orderId;
    try {
      orderNumber = await assignOrderNumber(orderRef);
    } catch (err) {
      console.warn('[PAYFAST_ITN] Could not assign order number for', orderId, ':', err.message);
    }

    // In a transaction: if two copies of this notice arrive together, only
    // one marks the order paid and sends the emails.
    const markedNow = await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(orderRef);
      if (!fresh.exists || fresh.data().paymentStatus === 'paid') return false;
      tx.update(orderRef, {
        orderNumber,
        checkoutRef: order.orderNumber || null,
        paymentStatus: 'paid',
        status: 'processing',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        pfPaymentId: pfData.pf_payment_id || null
      });
      return true;
    });
    if (!markedNow) {
      console.log('[PAYFAST_ITN] Order', orderId, 'was marked paid by a parallel notification — skipping');
      return;
    }

    // A discount only counts as "used" once it's actually been paid for.
    if (order.discountId) {
      adminDb.collection('discounts').doc(order.discountId)
        .update({ usageCount: admin.firestore.FieldValue.increment(1) })
        .catch(err => console.warn('[PAYFAST_ITN] Could not count discount use for', orderId, ':', err.message));
    }

    // Emails: customer, Janedore, each brand. A failure here never undoes
    // the payment above.
    const paidOrder = Object.assign({}, order, { orderNumber, paymentStatus: 'paid', pfPaymentId: pfData.pf_payment_id || null });
    sendPaidOrderEmails(orderId, paidOrder).catch(err => {
      console.warn('[PAYFAST_ITN] Order emails failed for', orderId, ':', err.message);
    });

    // No bag reminder for anything this customer just bought.
    const paidEmail = String(order.customerEmail || '').trim().toLowerCase();
    if (paidEmail) {
      adminDb.collection('bags').where('email', '==', paidEmail).limit(20).get()
        .then((snap) => Promise.all(snap.docs.map((d) => d.ref.update({ reminderDue: null, converted: true }))))
        .catch((err) => console.warn('[PAYFAST_ITN] Could not clear bag reminders for', orderId, ':', err.message));
    }

    console.log('[PAYFAST_ITN] Order', orderId, 'marked paid.');
  } catch (e) {
    console.error('[PAYFAST_ITN] Unhandled error:', e.message);
  }
});

// Lets checkout.js poll "is this order actually paid yet" once the
// customer lands back on return_url — the ITN above is the source of
// truth, this just lets the browser ask what it already decided.
app.get('/api/orders/:id/status', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const doc = await adminDb.collection('orders').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const order = doc.data();
    if (!hasOrderAccess(req, order)) return res.status(403).json({ error: 'Order access could not be verified' });
    res.json({ paymentStatus: order.paymentStatus || 'unpaid', orderNumber: order.orderNumber || req.params.id });
  } catch (e) {
    res.status(500).json({ error: 'Could not check order status' });
  }
});

// Called once, right after /status confirms paymentStatus === 'paid', to
// populate the real order confirmation page (items, address, totals) —
// kept separate from /status above so the polling loop there stays a
// small, cheap payload instead of re-fetching the whole order on every
// retry. Only a curated set of fields is returned, not the raw Firestore
// doc, so adding internal-only fields to orders later doesn't leak them
// here by accident.
app.get('/api/orders/:id', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const doc = await adminDb.collection('orders').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const order = doc.data();
    if (!hasOrderAccess(req, order)) return res.status(403).json({ error: 'Order access could not be verified' });
    res.json({
      orderNumber: order.orderNumber || req.params.id,
      status: order.status || 'pending',
      paymentStatus: order.paymentStatus || 'unpaid',
      items: order.items || [],
      subtotal: order.subtotal || 0,
      shipping: order.shipping || 0,
      discountCode: order.discountCode || null,
      discountAmount: order.discountAmount || 0,
      total: order.total || 0,
      currency: order.currency || 'ZAR',
      customerName: order.customerName || '',
      shippingAddress: order.shippingAddress || '',
      city: order.city || '',
      province: order.province || '',
      postalCode: order.postalCode || '',
      country: order.country || '',
      createdAt: order.createdAt ? order.createdAt.toDate().toISOString() : null
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not load order' });
  }
});

// ==================== DISCOUNT LOOKUP ====================
// The bag's promo code box (cart.js applyPromoCode). Discounts are no
// longer readable by shoppers in Firestore (so nobody can list every
// code), so the bag asks here for one code at a time. Returns only what
// the bag needs to check and show it; checkout still re-prices on the
// server (priceOrder). 30 tries per 15 minutes per IP.
const discountHits = new Map();
app.post('/api/discounts/lookup', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  const ip = String(req.ip || '');
  const now = Date.now();
  const hits = (discountHits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (hits.length >= 30) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
  hits.push(now);
  discountHits.set(ip, hits);
  const code = String((req.body && req.body.code) || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 20);
  if (!code) return res.status(400).json({ error: 'Please enter a discount code.' });
  try {
    const snap = await adminDb.collection('discounts').where('code', '==', code).limit(1).get();
    if (snap.empty) return res.json({ found: false });
    const d = snap.docs[0].data();
    const pick = ['code', 'type', 'value', 'active', 'startDate', 'endDate', 'usageLimit', 'usageCount', 'minimumPurchase', 'buyQuantity', 'getQuantity', 'description', 'title'];
    const out = { id: snap.docs[0].id };
    pick.forEach((k) => { if (d[k] !== undefined) out[k] = d[k] && d[k].toDate ? d[k].toDate().toISOString() : d[k]; });
    res.json({ found: true, discount: out });
  } catch (e) {
    console.error('[DISCOUNT_LOOKUP] Error:', e.message);
    res.status(500).json({ error: 'Could not check that code. Please try again.' });
  }
});

// ==================== BAG REMINDERS ====================
// The abandoned bag email. cart.js sends the bag here (product ids, sizes
// and quantities only) whenever it changes, but only once we know the
// shopper's email: signed in, or typed at checkout. If the bag sits
// unpaid for 3 hours, sweepBagReminders() sends one reminder with a
// "Return to your bag" link (/cart?bag=ID refills it). Never sent if the
// order was paid, the bag is empty or older than 3 days, or the shopper
// unsubscribed (link in every email). bags/{id} and bagOptOut are
// server-only (no Firestore rule allows them).
const BAG_REMINDER_DELAY = 3 * 60 * 60 * 1000;
const BAG_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const emailKey = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

function cleanBagItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((i) => ({
    productId: String((i && i.productId) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100),
    variantIndex: Math.max(0, Math.min(50, Math.floor(Number(i && i.variantIndex) || 0))),
    size: String((i && i.size) || 'OS').slice(0, 20),
    qty: Math.max(1, Math.min(20, Math.floor(Number(i && i.qty) || 1)))
  })).filter((i) => i.productId);
}

app.post('/api/bag', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  if (rateLimited(req, 'bag-save', 60, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests' });
  const b = req.body || {};
  const bagId = String(b.bagId || '');
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[a-f0-9]{24}$/.test(bagId)) return res.status(400).json({ error: 'Invalid bag' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  const items = cleanBagItems(b.items);
  const sig = JSON.stringify(items);
  try {
    const ref = adminDb.collection('bags').doc(bagId);
    const doc = await ref.get();
    const old = doc.exists ? doc.data() : null;
    if (old && old.sig === sig && old.email === email) return res.json({ ok: true });
    const now = Date.now();
    const optOut = await adminDb.collection('bagOptOut').doc(emailKey(email)).get();
    await ref.set({
      email, items, sig, updatedAt: now,
      reminderDue: items.length && !optOut.exists ? now + BAG_REMINDER_DELAY : null,
      reminderSentAt: null
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[BAG] Save error:', e.message);
    res.status(500).json({ error: 'Could not save bag' });
  }
});

// Refills the bag from a reminder link. Returns products only, never the email.
app.get('/api/bag/:id', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  if (rateLimited(req, 'bag-read', 30, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests' });
  const bagId = String(req.params.id || '');
  if (!/^[a-f0-9]{24}$/.test(bagId)) return res.status(404).json({ error: 'Not found' });
  try {
    const doc = await adminDb.collection('bags').doc(bagId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ items: doc.data().items || [] });
  } catch (e) {
    res.status(500).json({ error: 'Could not load bag' });
  }
});

// The email's Unsubscribe link.
app.get('/bag-reminders/stop', async (req, res) => {
  const bagId = String(req.query.bag || '');
  let done = false;
  if (adminDb && /^[a-f0-9]{24}$/.test(bagId)) {
    try {
      const doc = await adminDb.collection('bags').doc(bagId).get();
      if (doc.exists && doc.data().email) {
        await adminDb.collection('bagOptOut').doc(emailKey(doc.data().email)).set({ at: Date.now() });
        await doc.ref.update({ reminderDue: null });
        done = true;
      }
    } catch (e) { console.error('[BAG] Opt-out error:', e.message); }
  }
  res.set('Content-Type', 'text/html; charset=utf-8').send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>JANEDORE</title></head>' +
    '<body style="margin:0;font-family:Inter,Helvetica,Arial,sans-serif;color:#111;background:#fff;"><div style="max-width:480px;margin:0 auto;padding:80px 24px;text-align:center;">' +
    '<div style="letter-spacing:0.12em;font-size:15px;margin:0 0 40px;">JANEDORE</div>' +
    '<h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">' + (done ? 'You have been unsubscribed' : 'Link not recognised') + '</h1>' +
    '<p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 28px;">' + (done ? 'You will no longer receive reminder emails about items left in your bag. You will still receive emails about your orders.' : 'This link is no longer valid. If you keep receiving these emails, please contact support@janedore.co.za.') + '</p>' +
    '<a href="/" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Continue shopping</a>' +
    '</div></body></html>');
});

async function sweepBagReminders() {
  if (!adminDb) return;
  const now = Date.now();
  let snap;
  try {
    snap = await adminDb.collection('bags').where('reminderDue', '<=', now).limit(50).get();
  } catch (e) { console.error('[BAG] Sweep query failed:', e.message); return; }
  for (const doc of snap.docs) {
    const bag = doc.data();
    const done = (fields) => doc.ref.update(Object.assign({ reminderDue: null }, fields || {})).catch(() => {});
    try {
      if (!bag.items || !bag.items.length || !bag.email || now - (bag.updatedAt || 0) > BAG_MAX_AGE) { await done(); continue; }
      const optOut = await adminDb.collection('bagOptOut').doc(emailKey(bag.email)).get();
      if (optOut.exists) { await done(); continue; }
      // Paid since the bag last changed? Then it was ordered, no reminder.
      const orders = await adminDb.collection('orders').where('customerEmail', '==', bag.email).limit(20).get();
      const paidSince = orders.docs.some((o) => {
        const d = o.data();
        const at = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : new Date(d.createdAt || 0).getTime();
        return ['paid', 'refund_pending', 'refunded'].includes(d.paymentStatus) && at >= (bag.updatedAt || 0) - 60 * 60 * 1000;
      });
      if (paidSince) { await done({ converted: true }); continue; }

      const ctx = await buildOrderEmailContext({ items: bag.items });
      const items = bag.items.map((i) => {
        const p = ctx.products[i.productId];
        if (!p || p.status !== 'active') return null;
        const v = (p.variants || [])[i.variantIndex] || (p.variants || [])[0] || {};
        return Object.assign({}, i, { name: p.name || 'Item', brand: p.brand || '', color: v.color || '', price: serverUnitPrice(p) });
      }).filter(Boolean);
      if (!items.length) { await done(); continue; }
      const email = orderEmails.bagReminder(items, ctx, {
        bagUrl: SITE_URL + '/cart?bag=' + doc.id,
        stopUrl: SITE_URL + '/bag-reminders/stop?bag=' + doc.id
      });
      await sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: bag.email, subject: email.subject, html: email.html, text: email.text });
      await done({ reminderSentAt: now });
      console.log('[BAG] Reminder sent for bag', doc.id);
    } catch (e) {
      console.error('[BAG] Reminder failed for', doc.id, ':', e.message);
      await done({ reminderError: String(e.message).slice(0, 200) });
    }
  }
}
setInterval(sweepBagReminders, 15 * 60 * 1000).unref();

// ==================== TRACK YOUR ORDER ====================
// The /pages/track-your-order form (track-order.js). The customer gives
// their order number and the email they checked out with; both have to
// match before anything is returned, and a wrong pair gets the same
// answer as an order that doesn't exist. One package per brand, each
// with its own tracking once that brand has shipped.
const trackHits = new Map();
app.post('/api/track-order', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  const ip = String(req.ip || '');
  const now = Date.now();
  const hits = (trackHits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (hits.length >= 15) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
  hits.push(now);
  trackHits.set(ip, hits);

  const orderNumber = String((req.body && req.body.orderNumber) || '').trim().toUpperCase().replace(/^#/, '').replace(/\s+/g, '').slice(0, 40);
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 200);
  const notFound = () => res.status(404).json({ error: 'We couldn’t find an order matching those details. Please check your order number and email address.' });
  if (!orderNumber || !email) return res.status(400).json({ error: 'Please enter your order number and email address.' });

  try {
    let doc = null;
    const numberDoc = /^[A-Z0-9-]+$/.test(orderNumber) ? await adminDb.collection('orderNumbers').doc(orderNumber).get() : null;
    if (numberDoc && numberDoc.exists && numberDoc.data().orderId) {
      doc = await adminDb.collection('orders').doc(numberDoc.data().orderId).get();
    } else {
      const snap = await adminDb.collection('orders').where('orderNumber', '==', orderNumber).limit(1).get();
      doc = snap.empty ? null : snap.docs[0];
    }
    if (!doc || !doc.exists) return notFound();
    const order = doc.data();
    if (String(order.customerEmail || '').trim().toLowerCase() !== email) return notFound();

    const packages = orderShipments(order).map((g) => ({
      brand: g.brand,
      preorder: g.preorder,
      shipBy: g.shipBy,
      items: g.items.map((item) => ({
        productId: item.productId || '', variantIndex: item.variantIndex || 0, name: item.name || '',
        size: item.size || '', color: item.color || '', qty: item.qty || 1
      })),
      shipped: !!g.tracking.trackingNumber,
      courier: g.tracking.courier,
      trackingNumber: g.tracking.trackingNumber,
      shippedAt: g.tracking.addedAt
    }));

    res.json({
      orderNumber: order.orderNumber || orderNumber,
      createdAt: order.createdAt && order.createdAt.toDate ? order.createdAt.toDate().toISOString() : null,
      paid: ['paid', 'refund_pending', 'refunded'].includes(order.paymentStatus),
      refundPending: order.paymentStatus === 'refund_pending',
      refunded: order.paymentStatus === 'refunded' || String(order.status || '').toLowerCase() === 'refunded',
      cancelled: String(order.status || '').toLowerCase() === 'cancelled',
      packages
    });
  } catch (e) {
    console.error('[TRACK_ORDER]', e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ==================== SHIPPING NOTIFICATION ====================
// Fired from the admin order-detail page the moment a vendor (or staff)
// successfully saves tracking for their own line items on an order.
// This is a genuinely new email — until now the only order email was
// the payment confirmation. Each brand on a multi-vendor order ships
// separately, so this fires every time any one of them adds tracking,
// and says "partially shipped" unless that save was the LAST vendor on
// the order still missing tracking — same fulfilled/partial logic the
// admin UI itself uses (computeFulfillmentStatus in admin-orders.js),
// just re-derived here from the order doc read fresh via firebase-admin
// so it can't be spoofed by whatever a client happens to send.

// A product is on pre-order when its badge is "pre-order" (admin's Badge
// field); preorderShipDate is the brand's expected ship date.
function isPreorderProduct(p) {
  return String((p && p.badge) || '').trim().toLowerCase() === 'pre-order';
}

// One package per brand, plus a separate one for that brand's pre-order
// lines (they ship later; the customer still paid one delivery fee).
// Tracking: vendorTracking[vid] for the in-stock package and
// vendorTracking[vid].preorder for the pre-order one, so a brand only
// ever writes its own vendorTracking entry (firestore.rules). Orders
// with no vendor split use the old flat trackingNumber/courier.
function orderShipments(order) {
  const vt = order.vendorTracking || {};
  const vendorIds = Array.isArray(order.vendorIds) ? order.vendorIds : [];
  const map = new Map();
  (order.items || []).forEach((item) => {
    const vid = item.vendorId || null;
    const pre = !!item.preorder;
    const key = (vid || '__none__') + (pre ? '__preorder' : '');
    if (!map.has(key)) map.set(key, { key, vendorId: vid, preorder: pre, brand: item.brand || 'JANEDORE', items: [], shipBy: null });
    const g = map.get(key);
    g.items.push(item);
    if (pre && item.preorderShipDate && (!g.shipBy || item.preorderShipDate > g.shipBy)) g.shipBy = item.preorderShipDate;
  });
  return [...map.values()]
    // Orders with a vendor split have always ignored lines without a vendor.
    .filter((g) => !vendorIds.length || (g.vendorId && vendorIds.includes(g.vendorId)))
    .map((g) => {
      const entry = g.vendorId ? (vt[g.vendorId] || {}) : null;
      const t = g.vendorId
        ? (g.preorder ? (entry.preorder || {}) : entry)
        : { trackingNumber: order.trackingNumber, courier: order.courier };
      return Object.assign(g, { tracking: { trackingNumber: t.trackingNumber || '', courier: t.courier || '', addedAt: t.addedAt || null } });
    });
}

function computeOrderFulfillment(order) {
  const shipments = orderShipments(order);
  if (!shipments.length) return (order.trackingNumber ? 'fulfilled' : 'unfulfilled');
  const shipped = shipments.filter((s) => s.tracking.trackingNumber).length;
  if (shipped === 0) return 'unfulfilled';
  if (shipped === shipments.length) return 'fulfilled';
  return 'partial';
}

// Verifies the request actually came from an admin/vendor account with
// the right to ship for this vendorId — the same authorization the
// Firestore security rules already enforce on the tracking write itself,
// re-checked here since this endpoint also sends an email containing
// the customer's name, address and order contents.
async function authorizeShipmentRequest(req, vendorId) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return { ok: false, reason: 'No auth token' };

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (e) {
    return { ok: false, reason: 'Invalid auth token' };
  }

  const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
  if (!adminDoc.exists) return { ok: false, reason: 'Not a staff/vendor account' };
  const role = adminDoc.data().role;

  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return { ok: true };
  if (role === 'VENDOR' && adminDoc.data().vendorId === vendorId) return { ok: true };
  return { ok: false, reason: 'Not authorized for this vendor' };
}

function findShipment(order, vendorId, preorder) {
  return orderShipments(order).find((s) => (s.vendorId || '') === (vendorId || '') && s.preorder === !!preorder) || null;
}

function buildShipmentEmail(order, shipment, status, ctx) {
  return orderEmails.shipped(order, ctx, shipment ? shipment.items : (order.items || []), {
    complete: status === 'fulfilled',
    heading: status === 'fulfilled' ? 'Your order has shipped' : 'Part of your order has shipped',
    tracking: shipment ? shipment.tracking : {}
  });
}

app.post('/api/orders/:id/notify-shipped', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const vendorId = req.body && req.body.vendorId ? String(req.body.vendorId) : '';
    const preorder = !!(req.body && req.body.preorder);

    const auth = await authorizeShipmentRequest(req, vendorId);
    if (!auth.ok) return res.status(403).json({ error: auth.reason || 'Not authorized' });

    const orderRef = adminDb.collection('orders').doc(req.params.id);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = orderDoc.data();

    if (vendorId && (!Array.isArray(order.vendorIds) || order.vendorIds.indexOf(vendorId) === -1)) {
      return res.status(400).json({ error: 'That vendor is not part of this order' });
    }
    const status = computeOrderFulfillment(order);
    if (status === 'unfulfilled') return res.json({ ok: true, skipped: 'Nothing shipped yet' });
    const shipment = findShipment(order, vendorId, preorder);
    if (shipment && !shipment.tracking.trackingNumber) return res.json({ ok: true, skipped: 'That package has no tracking yet' });

    // Customer gets "on its way"; the Janedore team gets a copy saying
    // which brand shipped. The brand itself is not emailed.
    const ctx = await buildOrderEmailContext(order);
    const jobs = [];
    if (order.customerEmail) {
      const email = buildShipmentEmail(order, shipment, status, ctx);
      jobs.push(sendResendEmail({
        from: 'Janedore <noreply@janedore.co.za>',
        replyTo: 'support@janedore.co.za',
        to: order.customerEmail,
        subject: email.subject,
        html: email.html,
        text: email.text
      }));
    }
    const shippedItems = shipment ? shipment.items : (order.items || []);
    const shipments = orderShipments(order);
    const adminEmail = orderEmails.adminShipped(order, ctx, shippedItems, {
      brand: ((shippedItems[0] && shippedItems[0].brand) || 'JANEDORE') + (shipment && shipment.preorder ? ' (pre-order)' : ''),
      tracking: shipment ? shipment.tracking : {},
      complete: status === 'fulfilled',
      totalPackages: shipments.length,
      shippedPackages: shipments.filter((s) => s.tracking.trackingNumber).length
    });
    jobs.push(sendResendEmail({
      from: 'Janedore Orders <noreply@janedore.co.za>',
      to: ORDER_ALERT_EMAIL,
      subject: adminEmail.subject,
      html: adminEmail.html,
      text: adminEmail.text
    }));
    const results = await Promise.allSettled(jobs);
    results.filter((r) => r.status === 'rejected').forEach((r) => console.error('[NOTIFY_SHIPPED] Send failed:', r.reason && r.reason.message));

    res.json({ ok: true, status });
  } catch (e) {
    console.error('[NOTIFY_SHIPPED] Error:', e.message);
    res.status(500).json({ error: 'Could not send shipping notification' });
  }
});

// ==================== REFUND EMAIL ====================
// admin-orders.js calls this after each refund step. "refund_pending":
// the customer is told it's being processed. "refunded": staff confirmed
// the money was refunded in the PayFast dashboard, and only then is the
// customer told it's done. Each email goes once; the team gets a copy.
app.post('/api/orders/:id/notify-refunded', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const auth = await authorizeShipmentRequest(req, '');
    if (!auth.ok) return res.status(403).json({ error: auth.reason || 'Not authorized' });
    const orderRef = adminDb.collection('orders').doc(req.params.id);
    const doc = await orderRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = doc.data();
    const done = order.paymentStatus === 'refunded';
    if (!done && order.paymentStatus !== 'refund_pending') return res.status(400).json({ error: 'Order has no refund in progress' });
    const sentField = done ? 'refundEmailSentAt' : 'refundStartedEmailSentAt';
    if (order[sentField]) return res.json({ ok: true, skipped: 'Already emailed' });
    if (!order.customerEmail) return res.json({ ok: true, skipped: 'No customer email' });
    const ctx = await buildOrderEmailContext(order);
    const email = done ? orderEmails.refunded(order, ctx) : orderEmails.refundStarted(order, ctx);
    await sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: order.customerEmail, subject: email.subject, html: email.html, text: email.text });
    await orderRef.update({ [sentField]: admin.firestore.FieldValue.serverTimestamp() });
    sendResendEmail({ from: 'Janedore Orders <noreply@janedore.co.za>', to: ORDER_ALERT_EMAIL, subject: (done ? 'Refund completed' : 'Refund started') + ': order #' + (order.orderNumber || req.params.id), html: email.html, text: email.text })
      .catch((e) => console.warn('[NOTIFY_REFUNDED] Team copy failed:', e.message));
    res.json({ ok: true });
  } catch (e) {
    console.error('[NOTIFY_REFUNDED]', e.message);
    res.status(500).json({ error: 'Could not send refund email' });
  }
});

// ==================== PRE-ORDER DATE CHANGED ====================
// admin-products.js calls this after a brand (or staff) saves a new
// "Expected to ship" date on a pre-order product. Every paid order still
// waiting on that product's pre-order package gets one email.
app.post('/api/preorder-date-changed', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const productId = String((req.body && req.body.productId) || '');
    const oldDate = String((req.body && req.body.oldDate) || '').slice(0, 10);
    if (!productId) return res.status(400).json({ error: 'Missing productId' });
    const productDoc = await adminDb.collection('products').doc(productId).get();
    if (!productDoc.exists) return res.status(404).json({ error: 'Product not found' });
    const product = productDoc.data();
    const auth = await authorizeShipmentRequest(req, product.vendorId || '');
    if (!auth.ok) return res.status(403).json({ error: auth.reason || 'Not authorized' });
    if (!isPreorderProduct(product) || !product.preorderShipDate || product.preorderShipDate === oldDate) return res.json({ ok: true, sent: 0 });

    // paymentStatus alone, like the expiry sweep: no composite index needed.
    const snap = await adminDb.collection('orders').where('paymentStatus', '==', 'paid').limit(1000).get();
    let sent = 0;
    for (const doc of snap.docs) {
      const order = doc.data();
      if (!order.customerEmail || ['cancelled', 'refunded'].includes(String(order.status || '').toLowerCase())) continue;
      const pkg = orderShipments(order).find((s) => s.preorder && !s.tracking.trackingNumber && s.items.some((i) => i.productId === productId));
      if (!pkg) continue;
      const items = pkg.items.filter((i) => i.productId === productId);
      const previous = (items[0] && items[0].preorderShipDate) || oldDate;
      if (previous === product.preorderShipDate) continue; // already told
      await doc.ref.update({ items: (order.items || []).map((i) => (i.productId === productId && i.preorder ? Object.assign({}, i, { preorderShipDate: product.preorderShipDate }) : i)) });
      const ctx = await buildOrderEmailContext(order);
      const email = orderEmails.preorderDateChanged(order, ctx, items.map((i) => Object.assign({}, i, { preorderShipDate: product.preorderShipDate })), {
        brand: product.brand || pkg.brand, oldDate: previous, newDate: product.preorderShipDate
      });
      try {
        await sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: order.customerEmail, subject: email.subject, html: email.html, text: email.text });
        sent++;
      } catch (e) { console.error('[PREORDER_DATE] Email failed for', doc.id, e.message); }
    }
    res.json({ ok: true, sent });
  } catch (e) {
    console.error('[PREORDER_DATE]', e.message);
    res.status(500).json({ error: 'Could not notify customers' });
  }
});

// ==================== VENDOR ORDER LIST ====================
// Firestore flatly refuses to run a *list* query (the Orders tab's
// "every order I'm part of") whose authorization needs a lookup beyond
// the caller's own token — see firestore.rules' long comment on the
// orders `allow list` rule for the full story, and server.js's own
// /api/admin/sync-staff-claims below for the custom-claims approach
// that's supposed to fix it. That approach kept hitting friction
// getting a flawless rules file published from a phone's Firebase
// Console, so this is the pragmatic fallback: let a vendor's own
// browser ask the SERVER for their orders instead of asking Firestore
// directly. The Admin SDK below is never subject to security rules at
// all (that's what "admin" means), so this sidesteps the whole
// list-query limitation rather than depending on the rules being
// exactly right. Verifies the caller's own ID token and reads their
// role/vendorId fresh from their admins/{uid} doc (never trusts
// anything the client claims about itself) before running the query.
app.get('/api/vendor/orders', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: 'No auth token' });

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(match[1]);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    const callerDoc = await adminDb.collection('admins').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'VENDOR') {
      return res.status(403).json({ error: 'Not a vendor account' });
    }
    const vendorId = callerDoc.data().vendorId;
    if (!vendorId) return res.status(400).json({ error: 'No brand linked to this account' });

    // No .orderBy() alongside the array-contains filter, same reason as
    // the client-side version this replaces: avoids needing a composite
    // index set up in the Firebase console. Sorted here instead.
    const snap = await adminDb.collection('orders')
      .where('vendorIds', 'array-contains', vendorId)
      .limit(200)
      .get();

    const orders = snap.docs.map((d) => {
      const data = d.data();
      // createdAt is a real Firestore Timestamp — JSON can't carry that
      // as-is, and admin-orders.js's own o.createdAt.toDate ? ... : new
      // Date(o.createdAt) pattern already treats a plain ISO string the
      // same way it treats a live Timestamp, so this needs no other
      // client-side change at all.
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate().toISOString();
      }
      return Object.assign({ id: d.id }, data);
    });

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json({ orders });
  } catch (e) {
    console.error('[VENDOR_ORDERS] Error:', e.message);
    res.status(500).json({ error: 'Could not load orders' });
  }
});

// ==================== STAFF AUTH CLAIMS ====================
// A vendor's account role/vendorId lives on their admins/{uid} Firestore
// doc, which is what every *single-document* read already checks fine
// (adminDoc() in firestore.rules). But Firestore flatly refuses to run
// that kind of extra lookup when evaluating a *list* request (a query,
// like "every order this vendor is part of") — it can only allow a list
// request using facts already on the caller's own auth token, with no
// further reads. See firestore.rules' orders `allow list` rule, which
// checks request.auth.token.vendorId instead of a Firestore lookup —
// this endpoint is what actually puts vendorId onto that token, via
// Firebase Auth "custom claims" (only settable with admin privileges,
// never from a browser). Call it once after creating a vendor's login,
// and again any time their role/vendorId might have changed, so an
// already-existing account can be brought in sync too.
app.post('/api/admin/sync-staff-claims', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: 'No auth token' });

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(match[1]);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    const callerDoc = await adminDb.collection('admins').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only a Super Admin can sync staff claims' });
    }

    const targetUid = req.body && req.body.uid ? String(req.body.uid) : '';
    if (!targetUid) return res.status(400).json({ error: 'uid is required' });

    const targetDoc = await adminDb.collection('admins').doc(targetUid).get();
    if (!targetDoc.exists) return res.status(404).json({ error: 'That staff account was not found' });
    const data = targetDoc.data();

    await admin.auth().setCustomUserClaims(targetUid, {
      role: data.role || null,
      vendorId: data.vendorId || null
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[SYNC_STAFF_CLAIMS] Error:', e.message);
    res.status(500).json({ error: 'Could not sync claims' });
  }
});

// ==================== CHAT AI REPLY ====================
// Called by chat.js (customer-facing widget) whenever a customer sends
// a message and hasn't explicitly asked for a human. Uses the official
// @google/genai SDK (server-side only — the API key never reaches the
// browser). Needs a GEMINI_API_KEY env var set on Render, alongside the
// existing RESEND_API_KEY / CLOUDINARY_* vars.

let genAI = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log('[GEMINI] Initialized');
} else {
  console.warn('[GEMINI] GEMINI_API_KEY not set — /api/chat-ai-reply will return an error until it is');
}

const CHAT_SYSTEM_PROMPT = `You are the JANEDORE customer support assistant. JANEDORE is a multi-brand store, and every brand it stocks has been vetted for quality and a strong identity. You help customers with sizing, shipping, returns, and finding the right piece. Keep replies short (2-4 sentences), warm, and direct: this is a small chat bubble, not an email. Never use em dashes (—); use commas, colons or full stops instead. If you don't know the answer, or the question needs a human (an order-specific issue, a complaint, anything you're not confident about), say so plainly and suggest they ask to speak with a person.`;

app.post('/api/chat-ai-reply', async (req, res) => {
  // Each reply costs a Gemini call: 20 per 10 minutes per IP.
  if (rateLimited(req, 'chat-ai', 20, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many messages. Please wait a few minutes.' });
  const message = req.body && typeof req.body.message === 'string' ? req.body.message.slice(0, 2000) : req.body && req.body.message;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing message' });
  }

  if (!genAI) {
    console.error('[GEMINI] GEMINI_API_KEY not set');
    return res.status(500).json({ error: 'AI reply service not configured' });
  }

  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: message,
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT
      }
    });
    const reply = result.text;
    if (!reply) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }
    res.json({ reply: reply.trim() });
  } catch (e) {
    console.error('[GEMINI] Generate error:', e.message);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

// ==================== CACHE BUSTING ====================
// None of the local <link>/<script> tags in index.html carry a version
// query string, so a CDN in front of this domain (Cloudflare etc. — very
// common for a custom domain) can cache .css/.js files at the edge by
// file extension alone, ignoring whatever Cache-Control this server
// sends. That means a CSS/JS fix can be correct in the deployed source
// and still never reach a browser, indefinitely, until the edge cache
// naturally expires — indistinguishable from "the fix didn't work."
// BUILD_ID changes on every deploy (a fresh process start), so appending
// it as a query string busts any such cache immediately, every time,
// with no manual version-bumping required.
const BUILD_ID = Date.now();

function injectCacheBust(html) {
  // Also matches files that already carry a query string (e.g. a
  // hand-written "?v=3"), which used to be skipped and so never refreshed.
  return html.replace(/\b(href|src)="([^"?]+\.(?:css|js)(?:\?[^"]*)?)"/g, (match, attr, filePath) => {
    if (/^(?:https?:)?\/\//.test(filePath)) return match; // external CDN URL — leave alone
    const sep = filePath.includes('?') ? '&' : '?';
    return attr + '="' + filePath + sep + 'v=' + BUILD_ID + '"';
  })
    // The page fragments index.html fetches at runtime (checkout.html,
    // chat-widget.html, login.html…) need the same treatment, or a cached
    // copy of an old fragment can show up inside a freshly deployed page —
    // e.g. the previous checkout design.
    .replace(/fetch\('([\w-]+\.html)'\)/g, (m, file) => "fetch('" + file + "?v=" + BUILD_ID + "')")
    // Lets the page notice, after a tab has sat in the background, that a
    // newer deploy exists (see the stale-tab check in index.html).
    .replace('<head>', '<head>\n  <meta name="build-id" content="' + BUILD_ID + '">');
}

// Read by index.html's stale-tab check. Never cached.
// ==================== CUSTOMER CARE ====================
// The contact form on /pages/customer-care (customer-care.js). Saved to
// contactMessages and emailed to the team with reply-to set to the
// customer, so a reply from the inbox goes straight to them. The customer
// gets a copy. Limited to 5 messages an hour per IP address; the hidden
// "website" field catches bots.
const CONTACT_TOPICS = ['An order', 'Delivery', 'Returns and refunds', 'A product', 'Payment', 'My account', 'Something else'];
const contactHits = new Map();
app.post('/api/contact', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  const body = req.body || {};
  if (body.website) return res.json({ ok: true });
  const ip = String(req.ip || '');
  const now = Date.now();
  const hits = (contactHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= 5) return res.status(429).json({ error: 'You’ve sent a few messages already. Please try again later, or email us at support@janedore.co.za.' });

  const name = String(body.name || '').trim().substring(0, 100);
  const email = String(body.email || '').trim().toLowerCase().substring(0, 200);
  const orderNumber = String(body.orderNumber || '').trim().toUpperCase().replace(/[^A-Z0-9#-]/g, '').substring(0, 40);
  const topic = CONTACT_TOPICS.indexOf(body.topic) !== -1 ? body.topic : '';
  const message = String(body.message || '').trim().substring(0, 3000);
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!topic) return res.status(400).json({ error: 'Please choose a topic.' });
  if (!message) return res.status(400).json({ error: 'Please write your message.' });
  hits.push(now);
  contactHits.set(ip, hits);

  try {
    const ref = await adminDb.collection('contactMessages').add({
      name, email, orderNumber, topic, message, status: 'new',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const msg = { name, email, orderNumber, topic, message, id: ref.id };
    const assets = await getBrandAssets().catch(() => ({}));
    const ctx = { siteUrl: SITE_URL, logoUrl: assets.emailLogo ? logoImageUrl(assets.emailLogo, 360) : '', logoFontUrl: assets.logoFont || '' };
    const team = orderEmails.contactForStaff(msg, ctx);
    const copy = orderEmails.contactReceived(msg, ctx);
    // The team email must go out, or the message is only in Firestore.
    await sendResendEmail({ from: 'Janedore Customer Care <noreply@janedore.co.za>', replyTo: email, to: ORDER_ALERT_EMAIL, subject: team.subject, html: team.html, text: team.text });
    sendResendEmail({ from: 'Janedore <noreply@janedore.co.za>', replyTo: 'support@janedore.co.za', to: email, subject: copy.subject, html: copy.html, text: copy.text })
      .catch((e) => console.error('[CONTACT] Copy to customer failed:', e.message));
    res.json({ ok: true });
  } catch (e) {
    console.error('[CONTACT] Error:', e.message);
    res.status(500).json({ error: 'We couldn’t send your message. Please try again, or email us at support@janedore.co.za.' });
  }
});

// ==================== REPORT A BRAND ====================
// The "more" button on a brand page opens a short form; reports are
// saved to brandReports and emailed to the Janedore team (never to the
// brand). Limited to 5 reports an hour per IP address.
const REPORT_REASONS = ['Counterfeit or fake product', 'Item not as described', 'Problem with an order', 'Offensive or misleading content', 'Something else'];
const reportHits = new Map();
app.post('/api/report-brand', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  const ip = String(req.ip || '');
  const now = Date.now();
  const hits = (reportHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= 5) return res.status(429).json({ error: 'Too many reports. Please try again later.' });

  const body = req.body || {};
  const vendorId = String(body.vendorId || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 100);
  const reason = REPORT_REASONS.indexOf(body.reason) !== -1 ? body.reason : '';
  const details = String(body.details || '').trim().substring(0, 2000);
  const email = String(body.email || '').trim().substring(0, 200);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  if (!vendorId || !reason) return res.status(400).json({ error: 'Please choose a reason.' });
  if (reason === 'Something else' && !details) return res.status(400).json({ error: 'Please tell us what happened.' });

  try {
    const vendorDoc = await adminDb.collection('vendors').doc(vendorId).get();
    if (!vendorDoc.exists) return res.status(404).json({ error: 'Brand not found' });
    const brand = vendorDoc.data().brand || vendorDoc.data().name || 'A brand';
    hits.push(now);
    reportHits.set(ip, hits);

    const ref = await adminDb.collection('brandReports').add({
      vendorId, brand, reason, details, email: validEmail,
      status: 'new',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px;">' +
      '<h2 style="font-size:20px;margin:0 0 12px;">Brand reported: ' + escapeHtml(brand) + '</h2>' +
      '<p style="margin:0 0 6px;"><strong>Reason:</strong> ' + escapeHtml(reason) + '</p>' +
      (details ? '<p style="margin:0 0 6px;white-space:pre-wrap;"><strong>Details:</strong> ' + escapeHtml(details) + '</p>' : '') +
      '<p style="margin:0 0 6px;"><strong>Reported by:</strong> ' + (validEmail ? escapeHtml(validEmail) : 'Anonymous') + '</p>' +
      '<p style="margin:16px 0 0;color:#777;font-size:12px;">Report ' + escapeHtml(ref.id) + '. The brand has not been told.</p></div>';
    sendResendEmail({
      from: 'Janedore Reports <noreply@janedore.co.za>',
      replyTo: validEmail || undefined,
      to: ORDER_ALERT_EMAIL,
      subject: 'Brand reported: ' + brand + ' (' + reason + ')',
      html,
      text: 'Brand reported: ' + brand + '\nReason: ' + reason + (details ? '\nDetails: ' + details : '') + '\nReported by: ' + (validEmail || 'Anonymous') + '\nReport ' + ref.id
    }).catch((e) => console.error('[REPORT_BRAND] Email failed:', e.message));

    if (validEmail) {
      const assets = await getBrandAssets().catch(() => ({}));
      const confirm = orderEmails.reportReceived({ brand, reason, details }, {
        siteUrl: SITE_URL,
        logoUrl: assets.emailLogo ? logoImageUrl(assets.emailLogo, 360) : '',
        logoFontUrl: assets.logoFont || ''
      });
      sendResendEmail({
        from: 'Janedore <noreply@janedore.co.za>',
        replyTo: 'support@janedore.co.za',
        to: validEmail,
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text
      }).catch((e) => console.error('[REPORT_BRAND] Confirmation email failed:', e.message));
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[REPORT_BRAND] Error:', e.message);
    res.status(500).json({ error: 'Could not send your report. Please try again.' });
  }
});

// Signed Cloudinary uploads for admin. The browser asks for a signature
// before every upload; only signed-in staff (Super Admin, Admin or a
// brand) get one, so once the main preset (CLOUDINARY_UPLOAD_PRESET) is
// set to Signed in Cloudinary, nobody else can upload with it. The API
// secret stays on the server. Until CLOUDINARY_API_KEY and
// CLOUDINARY_API_SECRET are set on Render this answers 503 and admin
// falls back to the unsigned upload it used before.
app.post('/api/admin/cloudinary-signature', async (req, res) => {
  const apiKey = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !secret || !process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ error: 'Signed uploads are not configured', unsigned: true });
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  if (rateLimited(req, 'cloudinary-sign', 300, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many uploads. Please wait a few minutes.' });
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Not signed in' });
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const doc = await adminDb.collection('admins').doc(decoded.uid).get();
    const role = doc.exists ? String(doc.data().role || '').toUpperCase() : '';
    if (['SUPER_ADMIN', 'ADMIN', 'VENDOR'].indexOf(role) === -1) return res.status(403).json({ error: 'Not authorized to upload' });
  } catch (e) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  // Cloudinary signs every parameter except file, cloud_name,
  // resource_type and api_key: sorted key=value pairs joined with &,
  // then the secret, hashed with SHA-1.
  const params = { timestamp: Math.floor(Date.now() / 1000) };
  if (process.env.CLOUDINARY_UPLOAD_PRESET) params.upload_preset = process.env.CLOUDINARY_UPLOAD_PRESET;
  const toSign = Object.keys(params).sort().map((k) => k + '=' + params[k]).join('&');
  const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');
  res.json({ cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey, timestamp: params.timestamp, uploadPreset: params.upload_preset || '', signature });
});

// Admin > Reports: list brand reports and mark them reviewed. Super
// Admin and Admin only (checked against admins/{uid}, like shipments).
async function verifyPlatformStaff(req) {
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const doc = await adminDb.collection('admins').doc(decoded.uid).get();
    return doc.exists && (doc.data().role === 'SUPER_ADMIN' || doc.data().role === 'ADMIN');
  } catch (e) {
    return false;
  }
}

app.get('/api/admin/brand-reports', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  if (!(await verifyPlatformStaff(req))) return res.status(403).json({ error: 'Not authorized' });
  try {
    const snap = await adminDb.collection('brandReports').orderBy('createdAt', 'desc').limit(200).get();
    res.json({ reports: snap.docs.map((d) => {
      const r = d.data();
      return { id: d.id, vendorId: r.vendorId, brand: r.brand, reason: r.reason, details: r.details || '', email: r.email || '',
        status: r.status || 'new', createdAt: r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toISOString() : null };
    }) });
  } catch (e) {
    console.error('[BRAND_REPORTS] List failed:', e.message);
    res.status(500).json({ error: 'Could not load reports' });
  }
});

app.post('/api/admin/brand-reports/:id', async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Not configured' });
  if (!(await verifyPlatformStaff(req))) return res.status(403).json({ error: 'Not authorized' });
  const status = req.body && req.body.status;
  if (['new', 'reviewed'].indexOf(status) === -1) return res.status(400).json({ error: 'Invalid status' });
  try {
    const ref = adminDb.collection('brandReports').doc(String(req.params.id));
    if (!(await ref.get()).exists) return res.status(404).json({ error: 'Report not found' });
    await ref.update({ status, statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (e) {
    console.error('[BRAND_REPORTS] Update failed:', e.message);
    res.status(500).json({ error: 'Could not update report' });
  }
});

app.get('/api/build-id', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ buildId: String(BUILD_ID) });
});


// ==================== SEO HELPERS ====================

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtmlTags(str) {
  return String(str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function replaceHeadTags(html, metaBlock) {
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  out = out.replace(/<meta\s+name=["']description["'][^>]*>/i, '');
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*>/i, '');
  out = out.replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '');
  out = out.replace(/<\/head>/i, metaBlock);
  return out;
}

// ==================== PRODUCT SEO ====================

function injectProductMeta(html, product, slug) {
  const canonicalUrl = `${SITE_URL}/products/${encodeURIComponent(slug)}`;
  const title = `${product.name || 'Product'} | JANEDORE`;

  let description = stripHtmlTags(product.description || product.productFeatures || '');
  if (description.length > 160) description = description.slice(0, 157).trim() + '...';

  const firstVariant = (product.variants && product.variants[0]) || {};
  const variantImages = firstVariant.images || {};
  const imageUrl =
    (variantImages.ghost && variantImages.ghost[0]) ||
    (variantImages.model && variantImages.model[0]) ||
    (variantImages.detail && variantImages.detail[0]) ||
    '';

  const price = product.salePrice != null ? product.salePrice : product.price;
  const availability = (product.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name || '',
    description: description,
    sku: product.sku || undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    image: imageUrl ? [imageUrl] : undefined,
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'ZAR',
      price: price != null ? String(price) : undefined,
      availability: availability
    }
  };
  Object.keys(jsonLd).forEach(k => jsonLd[k] === undefined && delete jsonLd[k]);
  Object.keys(jsonLd.offers).forEach(k => jsonLd.offers[k] === undefined && delete jsonLd.offers[k]);

  const metaBlock = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonicalUrl}">
    <meta property="og:type" content="product">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonicalUrl}">
    ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>`;

  return replaceHeadTags(html, metaBlock);
}

// ==================== COLLECTION SEO ====================
// Static metadata — mirrors COLLECTION_DESCRIPTIONS in collection.js.
// No Firestore lookup needed since categories are a fixed, known set.

const CATEGORY_META = {
  'all-clothing': { label: 'All Clothing', description: 'Our complete clothing edit: refined silhouettes for the modern wardrobe.' },
  'dresses':      { label: 'Dresses', description: 'Effortless dresses that balance structure and fluidity.' },
  'tops':         { label: 'Tops', description: 'Elevated essentials, from sculptural blouses to relaxed knits.' },
  'bottoms':      { label: 'Bottoms', description: 'Tailored trousers and fluid skirts with quiet intention.' },
  'jackets':      { label: 'Jackets', description: 'Outerwear that defines the silhouette: sharp, soft, and considered.' },
  'sets':         { label: 'Sets', description: 'Coordinated pieces designed to be worn together or styled apart.' },
  'bags':         { label: 'Bags', description: 'Understated accessories that complete the look without saying too much.' },
  'jewelry':      { label: 'Jewelry', description: 'Sculptural adornments: timeless pieces with modern sensibility.' },
  'sunglasses':   { label: 'Sunglasses', description: 'Bold yet refined eyewear for the discerning gaze.' },
  'parfum':       { label: 'Scent', description: 'A study in scent. THATO parfums are crafted for the considered wearer.' }
};

function injectCollectionMeta(html, cat) {
  const meta = CATEGORY_META[cat];
  if (!meta) return null; // unknown category — caller falls through to normal SPA

  const canonicalUrl = `${SITE_URL}/collections/${encodeURIComponent(cat)}`;
  const title = `${meta.label} | JANEDORE`;
  const description = meta.description;

  const metaBlock = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonicalUrl}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonicalUrl}">
  </head>`;

  return replaceHeadTags(html, metaBlock);
}

// ==================== HOMEPAGE CONTENT (SSR) ====================
// siteContent/homepage (the admin "Homepage" tab, admin-homepage.js /
// site-content.js) used to be invisible to a fresh page load entirely
// — the browser got static "Heading"/"Button" fallback text, and real
// content only replaced it once the client's own Firestore read
// resolved. That meant customers routinely saw raw CMS placeholder
// strings for the first second or two of every visit. Fetching the
// same public doc here, server-side, and splicing it directly into
// the HTML response removes that gap: the response the browser gets
// already has real copy in it. site-content.js's own client-side
// fetch still runs on top of this and keeps things current if admin
// changes something between this response being cached and the page
// loading, but it's no longer the only source of the customer's first
// paint.
//
// Cached for HOMEPAGE_CACHE_MS so a burst of traffic costs one
// Firestore read, not one per request — marketing copy doesn't need
// per-request freshness, and the client-side fetch already covers the
// "admin just changed it" case for anyone already on the page.
let _homepageCache = null;
let _homepageCacheAt = 0;
const HOMEPAGE_CACHE_MS = 30000;

async function getCachedHomepage() {
  const now = Date.now();
  if (_homepageCache && (now - _homepageCacheAt) < HOMEPAGE_CACHE_MS) return _homepageCache;
  const doc = await adminDb.collection('siteContent').doc('homepage').get();
  _homepageCache = doc.exists ? (doc.data() || {}) : {};
  _homepageCacheAt = now;
  return _homepageCache;
}

// Same f_auto/q_auto/c_limit idea as site-content.js's contentImageURL()
// client-side — only ever shrinks what Cloudinary serves, computed here
// too so the hero/banner/category image is already sized correctly in
// the very first HTML response instead of only after the client's own
// fetch resolves.
function adminImageURL(url, maxWidth) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return '';
  if (!trimmed.includes('/upload/')) return trimmed;
  return trimmed.replace('/upload/', '/upload/f_auto,q_auto,c_limit,w_' + maxWidth + '/');
}

// Fills the text content of <TAG ... id="id" ...>...</TAG> and drops
// skeleton-text/content-shimmer from its class list — this element's
// content is now decided (real text, or confirmed genuinely unset), so
// there's nothing left for it to visually wait on. Leaves the element
// untouched (still shimmering) if id isn't found, which only happens
// if index.html's markup ever changes out from under this.
function fillTextElement(html, id, text) {
  const re = new RegExp('(<[a-zA-Z0-9]+\\b[^>]*\\bid="' + id + '"[^>]*>)([^<]*)(</)');
  return html.replace(re, function (_m, openTag, _oldText, closeStart) {
    const cleanedOpen = openTag.replace(/\s*\b(skeleton-text|content-shimmer)\b/g, '');
    return cleanedOpen + escapeHtml(text || '') + closeStart;
  });
}

function fillBackgroundElement(html, id, imageUrl, maxWidth) {
  const url = adminImageURL(imageUrl, maxWidth);
  const re = new RegExp('(<div\\b[^>]*\\bid="' + id + '"[^>]*)(>)');
  return html.replace(re, function (_m, openAttrs, gt) {
    if (url) {
      const safeUrl = url.replace(/['"\\]/g, '');
      const cleaned = openAttrs.replace(/\s*\bcontent-shimmer\b/g, '');
      return cleaned + " style=\"background-image:url('" + safeUrl + "');background-size:cover;background-position:center;\"" + gt;
    }
    // SSR succeeded but this field is genuinely unset — settle to the
    // flat neutral empty state instead of animating a shimmer forever;
    // same content-shimmer -> content-empty distinction
    // loadBackgroundImage() makes client-side once ITS fetch resolves.
    return openAttrs.replace(/\bcontent-shimmer\b/, 'content-empty') + gt;
  });
}

// renderShopByCategory() in site-content.js always rebuilds this grid's
// innerHTML from scratch regardless of what's here, so this only needs
// to get the initial paint right (image + label), not full
// interactivity (onclick) — the client overwrites it moments later
// either way. Unconfigured (no tiles) leaves the 4 static neutral
// placeholder tiles already in index.html untouched.
function applyShopByCategoryTiles(html, tiles) {
  if (!tiles.length) return html;
  const inner = tiles.map(function (tile) {
    const label = escapeHtml(tile.label || '');
    const url = adminImageURL(tile.imageUrl, 600);
    const safeUrl = url.replace(/['"\\]/g, '');
    const style = url ? " style=\"background-image:url('" + safeUrl + "');background-size:cover;background-position:center;\"" : '';
    return '<div class="home-category-card"><div class="home-category-img"' + style + '><div class="home-category-label">' + label + '</div></div></div>';
  }).join('');
  return html.replace(
    /(<div class="home-categories-grid" id="home-categories-grid">)[\s\S]*?(<\/div>\s*<\/section>)/,
    '$1' + inner + '$2'
  );
}

function applyHomepageContent(html, homepage) {
  const hero = homepage.hero || {};
  const arrivals = homepage.newArrivals || {};
  const shopByCategory = homepage.shopByCategory || {};
  const clothing = homepage.shopByClothing || {};
  const banner = homepage.editorialBanner || {};
  const shopByBrand = homepage.shopByBrand || {};

  // The header always shows the JANEDORE text wordmark. An uploaded
  // Site Logo used to hide it here in favour of an image the header no
  // longer has, which left the logo blank on every page.

  html = fillTextElement(html, 'hero-heading', hero.heading);
  html = fillTextElement(html, 'hero-shop-btn', hero.buttonText);
  html = fillBackgroundElement(html, 'hero-bg', hero.imageUrl, 1600);

  html = fillTextElement(html, 'arrivals-heading', arrivals.heading);
  html = fillTextElement(html, 'arrivals-view-all-btn', arrivals.buttonText);

  html = fillTextElement(html, 'shop-by-category-heading', shopByCategory.heading);
  html = applyShopByCategoryTiles(html, Array.isArray(shopByCategory.tiles) ? shopByCategory.tiles : []);

  html = fillTextElement(html, 'clothing-heading', clothing.heading);
  html = fillTextElement(html, 'clothing-view-all-btn', clothing.buttonText);

  html = fillTextElement(html, 'banner-heading', banner.heading);
  html = fillTextElement(html, 'banner-btn', banner.buttonText);
  html = fillBackgroundElement(html, 'editorial-banner-img', banner.imageUrl, 1600);

  html = fillTextElement(html, 'shop-by-brand-heading', shopByBrand.heading);

  return html;
}

// Entry point used by every route below that serves index.html. Never
// throws — falls back to the untouched static HTML (still correct,
// just shimmering until the client's own fetch resolves) if adminDb
// isn't configured or the Firestore read fails for any reason.
async function injectHomepageContent(html) {
  if (!adminDb) return html;
  try {
    const homepage = await getCachedHomepage();
    return applyHomepageContent(html, homepage || {});
  } catch (e) {
    console.error('[HOMEPAGE SSR] Error:', e.message);
    return html;
  }
}

async function renderIndexHtml(headTransform) {
  const indexPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  if (headTransform) html = headTransform(html);
  html = await injectHomepageContent(html);
  html = await injectCustomLogoFont(html);
  html = await injectSiteLogo(html);
  return injectCacheBust(html);
}

// Logo font from admin > Content: the JANEDORE wordmark is set in the
// uploaded font, still as text (sharp at any size), preloaded so it's
// ready by first paint. Its fallback is Inter SemiBold (navigation.css),
// the same face, so there's nothing to swap. Not set: Inter SemiBold.
async function injectCustomLogoFont(html) {
  const { logoFont, logoFontFormat } = await getBrandAssets();
  if (!logoFont) return html;
  const fmt = String(logoFontFormat || logoFont.split('.').pop() || '').toLowerCase();
  const cssFormat = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[fmt] || 'truetype';
  const mime = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' }[fmt] || 'font/ttf';
  const url = escapeHtml(logoFont);
  return html.replace(
    /<link id="logo-font-css"[^>]*>/,
    () => '<link rel="preload" as="font" type="' + mime + '" href="' + url + '" crossorigin>\n' +
      '  <style id="logo-font-css">@font-face{font-family:"Janedore Logo";src:url("' + url + '") format("' + cssFormat + '");font-weight:400;font-style:normal;font-display:block;}' +
      '.nav-logo-text,.footer-logo-fallback{font-family:"Janedore Logo","Inter",Helvetica,Arial,sans-serif !important;font-weight:400 !important;}</style>'
  );
}

// Website logo from admin > Content: swaps the header's text wordmark for
// the image. Not set: the JANEDORE text wordmark stays.
async function injectSiteLogo(html) {
  const { siteLogo } = await getBrandAssets();
  if (!siteLogo) return html;
  const src = escapeHtml(logoImageUrl(siteLogo, 480));
  return html.replace(
    /<span class="nav-logo-text" id="nav-logo-text">JANEDORE<\/span>/,
    '<img class="nav-logo-img" id="nav-logo-img" src="' + src + '" alt="JANEDORE">'
  );
}

// ==================== PRODUCT SEO ROUTE ====================
// Must be registered before the static middleware and catch-all below.
// Serves index.html with real per-product <title>/meta/canonical/OG/JSON-LD
// injected server-side, so Google and link-preview bots see the right tags
// without running JS. Falls through to the normal SPA index.html if the
// product isn't found or Firebase Admin isn't configured — nothing breaks.

app.get('/products/:slug', async (req, res, next) => {
  if (!adminDb) return next();

  try {
    const slug = req.params.slug;
    let product = null;

    const bySlug = await adminDb.collection('products').where('slug', '==', slug).limit(1).get();
    if (!bySlug.empty) {
      product = { id: bySlug.docs[0].id, ...bySlug.docs[0].data() };
    } else {
      // Fallback: someone hit /products/prod-1788177528434 directly (old ID)
      const byId = await adminDb.collection('products').doc(slug).get();
      if (byId.exists) product = { id: byId.id, ...byId.data() };
    }

    if (!product) return next();
    // A product whose brand is suspended or inactive (Admin > Brands) is
    // hidden from the storefront, so a direct link gets the plain SPA
    // (no product SEO meta) and the client won't render it either.
    if (!isHouseProduct(product) && product.vendorId) {
      try {
        const vdoc = await adminDb.collection('vendors').doc(product.vendorId).get();
        const vst = vdoc.exists ? String(vdoc.data().status || '').toLowerCase() : '';
        if (vst === 'suspended' || vst === 'inactive') return next();
      } catch (e) {}
    }

    const finalHtml = await renderIndexHtml(h => injectProductMeta(h, product, product.slug || slug));
    res.send(finalHtml);
  } catch (e) {
    console.error('[PRODUCT ROUTE] Error:', e.message);
    return next();
  }
});

// ==================== COLLECTION SEO ROUTE ====================
// Also before static middleware and catch-all. No database call needed —
// categories are a fixed set, so this is pure string injection.

app.get('/collections/:cat', async (req, res, next) => {
  try {
    const handle = req.params.cat;
    const snapshot = await adminDb.collection('collections')
      .where('status', '==', 'active').get();
    const matchingDoc = snapshot.docs.find(doc => {
      const data = doc.data() || {};
      return String(data.handle || data.slug || doc.id) === handle;
    });
    if (matchingDoc) {
      const collection = matchingDoc.data() || {};
      if (collection.published === false) return next();
      const titleText = String(collection.seoTitle || collection.title || collection.name || handle);
      const descriptionText = String(collection.seoDescription || collection.description || '');
      const canonicalUrl = `${SITE_URL}/collections/${encodeURIComponent(handle)}`;
      const title = `${titleText} | JANEDORE`;
      const metaBlock = `
        <title>${escapeHtml(title)}</title>
        <meta name="description" content="${escapeHtml(descriptionText)}">
        <link rel="canonical" href="${canonicalUrl}">
        <meta property="og:type" content="website">
        <meta property="og:title" content="${escapeHtml(title)}">
        <meta property="og:description" content="${escapeHtml(descriptionText)}">
        <meta property="og:url" content="${canonicalUrl}">
      </head>`;
      const html = await renderIndexHtml(h => replaceHeadTags(h, metaBlock));
      res.send(html);
      return;
    }
    if (!CATEGORY_META[handle]) return next();
    const html = await renderIndexHtml(h => injectCollectionMeta(h, handle));
    res.send(html);
  } catch (e) {
    console.error('[COLLECTION ROUTE] Error:', e.message);
    return next();
  }
});

// ==================== ADMIN PANEL ROUTE ====================
// Also before static middleware. admin.html was never routed through
// injectCacheBust() the way index.html is above — it was just served
// as-is by the static middleware below, so admin.css/admin.js/every
// admin-*.js carried no version query string at all. Any CDN sitting
// in front of this domain (see the CACHE BUSTING comment above) can
// then cache those files at the edge by file extension indefinitely,
// serving a stale admin panel no matter how correct or how deployed a
// fix is — indistinguishable from "the fix didn't work," same failure
// mode injectCacheBust() exists to prevent, just never applied here.

app.get(['/admin', '/admin.html'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    res.send(injectCacheBust(html));
  } catch (e) {
    console.error('[ADMIN ROUTE] Error:', e.message);
    res.status(500).send('Error loading admin panel');
  }
});

// Serve static files (CSS, JS, images, etc.). index:false stops this from
// auto-serving index.html for "/" itself (its default behavior) — every
// HTML page must go through the routes below instead, so the cache-bust
// query string actually gets injected rather than silently skipped for
// the single most-visited URL on the site.
app.use(express.static(path.join(__dirname), {
  index: false,
  // Font files are named with a content hash and never change in place —
  // safe to cache for a year so repeat visits don't re-fetch them (and
  // don't risk a visible font swap) the way the default no-cache headers
  // would. CSS/JS/images keep the default (always revalidated) since
  // those get edited in place during active development.
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.otf') || filePath.endsWith('.ttf') || filePath.endsWith('.woff2')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Page fragments: always check with the server before reusing a copy.
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Returns: /api/returns* and /api/admin/returns* (returns-api.js).
// Exchanges: /api/exchanges* and /api/admin/exchanges* (exchanges-api.js),
// sharing the returns order lookup.
const returnsDeps = { adminDb, admin, orderShipments, sendResendEmail, buildOrderEmailContext, orderEmails, ORDER_ALERT_EMAIL, getVendors };
const returnsShared = require('./returns-api')(app, returnsDeps);
require('./exchanges-api')(app, returnsDeps, returnsShared);

// Waitlist: /api/waitlist and /api/account/waitlist* (waitlist-api.js),
// plus the back-in-stock email sweep.
require('./waitlist-api')(app, { adminDb, admin, sendResendEmail, buildOrderEmailContext, orderEmails, SITE_URL, rateLimited });
require('./partner-applications-api')(app, { adminDb, admin, sendResendEmail, orderEmails, ORDER_ALERT_EMAIL, SITE_URL, getBrandAssets, logoImageUrl });

// Catch-all for HTML routing — only sends index.html for clean URLs
app.get('*', async (req, res) => {
  // If it looks like a file request (.css, .js, .png etc), let it 404
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  // Otherwise send index.html for client-side routing, with the current
  // homepage content already spliced in — see renderIndexHtml() above.
  try {
    const seo = await getSeoSettings();
    const transform = req.path === '/' ? (html) => injectHomepageSeo(html, seo) : null;
    res.send(await renderIndexHtml(transform));
  } catch (e) {
    console.error('[CATCH-ALL] Error:', e.message);
    const rawHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.send(injectCacheBust(rawHtml));
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
