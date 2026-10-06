const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

const app = express();

app.use(express.json());

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

const SITE_URL = 'https://janedore.co.za';

// Cloudinary config endpoint — MUST be first
app.get('/api/cloudinary-config', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET
  });
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
    res.json({ comingSoonEnabled });
  } catch (e) {
    console.error('[ONLINE_STORE_STATUS] Error:', e.message);
    res.json({ comingSoonEnabled: true });
  }
});

app.post('/api/verify-visitor-password', async (req, res) => {
  const password = req.body && req.body.password;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ ok: false });
  }
  if (!adminDb) return res.status(503).json({ ok: false });

  try {
    const doc = await adminDb.collection('settings').doc('onlineStoreSecrets').get();
    const storedPassword = doc.exists ? doc.data().visitorPassword : null;
    const ok = !!storedPassword && password === storedPassword;
    res.json({ ok });
  } catch (e) {
    console.error('[VERIFY_VISITOR_PASSWORD] Error:', e.message);
    res.status(500).json({ ok: false });
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
  const signature = opts.signature || '— Janedore';
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
app.post('/api/send-welcome-email', (req, res) => {
  const email = req.body && req.body.email;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const html = emailLayout({
    heading: 'You’re on the list.',
    bodyHtml: '<p class="body-text">We’re not quite ready yet — but when we are,<br>you’ll be the first to know.</p>'
  });
  const text = 'You’re on the list.\n\nWe’re not quite ready yet — but when we are, you’ll be the first to know.\n\n— Janedore\n\nsupport@janedore.co.za';

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

// Order confirmation email via Resend — fired by checkout.js right after
// an order is successfully placed. Uses noreply@ since a receipt doesn't
// need a reply, but still points anyone with a real question at support@.
app.post('/api/send-order-confirmation', (req, res) => {
  const b = req.body || {};
  const orderNumber = b.orderNumber;
  const customerEmail = b.customerEmail;
  const customerName = b.customerName;
  const items = b.items;
  const subtotal = b.subtotal;
  const shipping = b.shipping;
  const total = b.total;
  const currency = b.currency;

  if (!customerEmail || !customerEmail.includes('@') || !orderNumber || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Invalid order data' });
  }

  const symbol = (!currency || currency === 'ZAR') ? 'R' : (currency + ' ');
  const fmt = (n) => symbol + Number(n || 0).toFixed(2);

  const itemsRowsHtml = items.map((item) => {
    const details = [item.color, item.size].filter(Boolean).join(' / ');
    return '<tr>' +
      '<td>' + escapeHtml(item.name || 'Item') +
        (item.brand ? '<br><span style="color:#aaa;font-size:11px;">' + escapeHtml(item.brand) + '</span>' : '') +
        (details ? '<br><span style="color:#aaa;font-size:11px;">' + escapeHtml(details) + '</span>' : '') +
      '</td>' +
      '<td class="qty">x' + (item.qty || 1) + '</td>' +
      '<td class="price">' + fmt(item.price) + '</td>' +
      '</tr>';
  }).join('');

  const itemsTextLines = items.map((item) =>
    (item.name || 'Item') + ' x' + (item.qty || 1) + ' — ' + fmt(item.price)
  ).join('\n');

  const bodyHtml =
    '<p class="body-text">Hi ' + escapeHtml(customerName || 'there') + ', thank you for your order — here’s what we’ve got.</p>' +
    '<table class="items">' + itemsRowsHtml + '</table>' +
    '<table class="totals">' +
      '<tr><td class="label">Subtotal</td><td class="value">' + fmt(subtotal) + '</td></tr>' +
      '<tr><td class="label">Shipping</td><td class="value">' + (shipping ? fmt(shipping) : 'Free') + '</td></tr>' +
      '<tr class="grand"><td class="label" style="color:#1a1a1a;">Total</td><td class="value">' + fmt(total) + '</td></tr>' +
    '</table>' +
    '<p class="body-text" style="margin-top:32px;">Order #' + escapeHtml(orderNumber) + '</p>';

  const html = emailLayout({
    heading: 'Order confirmed.',
    bodyHtml: bodyHtml,
    footerHtml: 'Questions about your order? <a href="mailto:support@janedore.co.za">support@janedore.co.za</a>'
  });

  const text = 'Order confirmed.\n\nHi ' + (customerName || 'there') + ', thank you for your order.\n\n' +
    itemsTextLines +
    '\n\nSubtotal: ' + fmt(subtotal) + '\nShipping: ' + (shipping ? fmt(shipping) : 'Free') + '\nTotal: ' + fmt(total) +
    '\n\nOrder #' + orderNumber + '\n\n— Janedore\nsupport@janedore.co.za';

  sendResendEmail({
    from: 'Janedore <noreply@janedore.co.za>',
    replyTo: 'support@janedore.co.za',
    to: customerEmail,
    subject: 'Order confirmed — #' + orderNumber,
    html,
    text
  }).then(() => {
    console.log('[RESEND] Order confirmation sent to:', customerEmail);
    res.json({ success: true });
  }).catch((err) => {
    console.error('[RESEND] Order confirmation error:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  });
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

const CHAT_SYSTEM_PROMPT = `You are the JANEDORE customer support assistant. JANEDORE is a multi-brand store — every brand it stocks has been vetted for quality and a strong identity. You help customers with sizing, shipping, returns, and finding the right piece. Keep replies short (2-4 sentences), warm, and direct — this is a small chat bubble, not an email. If you don't know the answer, or the question needs a human (an order-specific issue, a complaint, anything you're not confident about), say so plainly and suggest they ask to speak with a person.`;

app.post('/api/chat-ai-reply', async (req, res) => {
  const message = req.body && req.body.message;

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
  return html.replace(/\b(href|src)="([^"]+\.(?:css|js))"/g, (match, attr, filePath) => {
    if (/^(?:https?:)?\/\//.test(filePath)) return match; // external CDN URL — leave alone
    const sep = filePath.includes('?') ? '&' : '?';
    return attr + '="' + filePath + sep + 'v=' + BUILD_ID + '"';
  });
}

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
  'all-clothing': { label: 'All Clothing', description: 'Our complete clothing edit — refined silhouettes for the modern wardrobe.' },
  'dresses':      { label: 'Dresses', description: 'Effortless dresses that balance structure and fluidity.' },
  'tops':         { label: 'Tops', description: 'Elevated essentials, from sculptural blouses to relaxed knits.' },
  'bottoms':      { label: 'Bottoms', description: 'Tailored trousers and fluid skirts with quiet intention.' },
  'jackets':      { label: 'Jackets', description: 'Outerwear that defines the silhouette — sharp, soft, and considered.' },
  'sets':         { label: 'Sets', description: 'Coordinated pieces designed to be worn together or styled apart.' },
  'bags':         { label: 'Bags', description: 'Understated accessories that complete the look without saying too much.' },
  'jewelry':      { label: 'Jewelry', description: 'Sculptural adornments — timeless pieces with modern sensibility.' },
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
  return injectCacheBust(html);
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
    if (!CATEGORY_META[req.params.cat]) return next(); // unknown category — let the normal SPA handle it
    const html = await renderIndexHtml(h => injectCollectionMeta(h, req.params.cat));
    res.send(html);
  } catch (e) {
    console.error('[COLLECTION ROUTE] Error:', e.message);
    return next();
  }
});

// Serve static files (CSS, JS, images, etc.). index:false stops this from
// auto-serving index.html for "/" itself (its default behavior) — every
// HTML page must go through the routes below instead, so the cache-bust
// query string actually gets injected rather than silently skipped for
// the single most-visited URL on the site.
app.use(express.static(path.join(__dirname), { index: false }));

// Catch-all for HTML routing — only sends index.html for clean URLs
app.get('*', async (req, res) => {
  // If it looks like a file request (.css, .js, .png etc), let it 404
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  // Otherwise send index.html for client-side routing, with the current
  // homepage content already spliced in — see renderIndexHtml() above.
  try {
    res.send(await renderIndexHtml());
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
