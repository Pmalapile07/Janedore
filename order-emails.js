// ==================== ORDER EMAILS ====================
// The emails sent when an order is paid, in the same look as the bag and
// checkout pages: grey background, white cards, bold titles, black
// buttons and the site green. Built from tables with inline styles —
// many email apps (Gmail's app, Outlook) ignore <style> blocks.
//
//   customerConfirmation(order, ctx) — to the customer
//   adminNewOrder(order, ctx)        — to support@ (every paid order)
//   vendorNewOrder(order, ctx, vendor, items) — to one brand, only its items
//   shipped(order, ctx, items, opts) — to the customer when items ship
//
// Each returns { subject, html, text }. ctx carries siteUrl and an image
// lookup (imageFor(item) → URL or ''), filled in by server.js.

const GREEN = '#809ADD';
const GREEN_TINT = '#809ADD';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Same format as the site: R1,410 (cents only when there are any).
function money(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return 'R' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function itemLine(item) { return (Number(item.price) || 0) * (Number(item.qty) || 1); }

function sizeOf(item) { return item.size && item.size !== 'OS' ? item.size : ''; }

function orderDate(order) {
  const ts = order.createdAt;
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts ? new Date(ts) : new Date());
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
}

function addressLines(order) {
  return [
    order.shippingAddress,
    [order.city, order.province].filter(Boolean).join(', '),
    [order.postalCode, order.country].filter(Boolean).join(', ')
  ].filter(Boolean);
}

// Brands the customer collects from (order.collectFrom, vendor ids):
// their names, from the order's items.
function collectedBrands(order) {
  const ids = order.collectFrom || [];
  return [...new Set((order.items || []).filter(i => ids.includes(i.vendorId || 'vendor-janedore')).map(i => i.brand || 'JANEDORE'))];
}
function deliveredItems(order) {
  const ids = order.collectFrom || [];
  return (order.items || []).filter(i => !ids.includes(i.vendorId || 'vendor-janedore'));
}

// ---------- building blocks ----------

function shell(opts) {
  // opts: { title, preheader, bannerHtml, cards: [html], footerHtml }
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<title>' + esc(opts.title) + '</title>' +
    // Logo font from admin > Content. Apple Mail shows it; Gmail and
    // Outlook ignore web fonts and use the Helvetica fallback.
    (opts.logoFontUrl ? '<style>@font-face{font-family:"Janedore Logo";src:url("' + esc(opts.logoFontUrl) + '");font-weight:400;}</style>' : '') +
    '</head>' +
    '<body style="margin:0;padding:0;background:#f2f2f2;font-family:' + FONT + ';color:#111111;-webkit-font-smoothing:antialiased;">' +
    // Inbox preview line (hidden in the email itself).
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f2f2f2;">' + esc(opts.preheader || '') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;">' +
    '<tr><td align="center" style="padding:0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">' +
      '<tr><td style="background:#111111;padding:22px 24px;">' +
        // Logo image from admin > Content when set; email apps can't load
        // the site's logo font, so text is only the fallback.
        (opts.logoUrl
          ? '<img src="' + esc(opts.logoUrl) + '" alt="JANEDORE" height="15" style="display:block;height:15px;width:auto;border:0;">'
          : '<span style="font-family:' + (opts.logoFontUrl ? '\'Janedore Logo\', ' : '') + FONT + ';font-size:16px;' +
              // A bold logo font falls back to bold Helvetica where web fonts don't load.
              (/bold/i.test(opts.logoFontUrl || '') ? 'font-weight:700;' : '') +
              'letter-spacing:0.22em;color:#ffffff;text-transform:uppercase;">Janedore</span>') +
      '</td></tr>' +
      (opts.bannerHtml ? '<tr><td style="background:' + GREEN_TINT + ';padding:16px 24px;font-size:14px;line-height:1.5;color:#111111;">' + opts.bannerHtml + '</td></tr>' : '') +
      '<tr><td style="padding:16px;">' +
        opts.cards.filter(Boolean).map(c => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;margin:0 0 16px;"><tr><td style="padding:20px;">' + c + '</td></tr></table>').join('') +
      '</td></tr>' +
      '<tr><td style="padding:4px 24px 40px;font-size:12px;line-height:1.7;color:#888888;text-align:center;">' +
        (opts.footerHtml || '') +
      '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function title(text, rightHtml) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>' +
    '<td style="font-size:17px;font-weight:700;color:#111111;">' + text + '</td>' +
    (rightHtml ? '<td align="right" style="font-size:14px;color:#777777;white-space:nowrap;">' + rightHtml + '</td>' : '') +
    '</tr></table>';
}

function row(label, value, opts) {
  opts = opts || {};
  const color = opts.color || '#111111';
  const weight = opts.bold ? '700' : (opts.semi ? '600' : '400');
  const size = opts.big ? '17px' : '14px';
  return '<tr><td style="padding:6px 0;font-size:' + size + ';font-weight:' + weight + ';color:' + color + ';">' + label + '</td>' +
    '<td align="right" style="padding:6px 0;font-size:' + size + ';font-weight:' + weight + ';color:' + color + ';white-space:nowrap;">' + value + '</td></tr>';
}

function rows(html) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + html + '</table>';
}

function divider() {
  return '<tr><td colspan="2" style="padding:8px 0 4px;"><div style="height:1px;background:#dddddd;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>';
}

function button(label, url) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>' +
    '<td align="center" style="background:#111111;">' +
      '<a href="' + esc(url) + '" style="display:block;padding:16px 20px;font-family:' + FONT + ';font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;text-decoration:none;">' + esc(label) + '</a>' +
    '</td></tr></table>';
}

function itemsBlock(items, ctx, opts) {
  opts = opts || {};
  return items.map((item, i) => {
    const img = ctx.imageFor ? ctx.imageFor(item) : '';
    const meta = [opts.showBrand !== false ? item.brand : '', item.color && item.color !== 'Default' ? item.color : ''].filter(Boolean).map(esc).join(' · ');
    const attrs = 'Qty: <strong>' + (Number(item.qty) || 1) + '</strong>' + (sizeOf(item) ? '&nbsp;&nbsp; Size: <strong>' + esc(sizeOf(item)) + '</strong>' : '');
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + (i ? 'border-top:1px solid #eeeeee;' : '') + '"><tr>' +
      '<td width="72" valign="top" style="padding:' + (i ? '14px' : '0') + ' 14px 14px 0;">' +
        (img
          ? '<img src="' + esc(img) + '" width="72" height="96" alt="" style="display:block;width:72px;height:96px;object-fit:cover;background:#f4f4f4;border:0;">'
          : '<div style="width:72px;height:96px;background:#f4f4f4;"></div>') +
      '</td>' +
      '<td valign="top" style="padding:' + (i ? '14px' : '0') + ' 0 14px;">' +
        '<div style="font-size:15px;font-weight:700;line-height:1.3;color:#111111;">' + esc(item.name || 'Item') + '</div>' +
        (meta ? '<div style="font-size:13px;color:#777777;margin-top:3px;">' + meta + '</div>' : '') +
        '<div style="font-size:13px;color:#111111;margin-top:8px;">' + attrs + '</div>' +
        (item.preorder ? '<div style="font-size:13px;font-weight:600;color:#111111;margin-top:6px;">' + esc(preorderLine(item)) + '</div>' : '') +
        (opts.hidePrice ? '' : '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:8px;">' + money(itemLine(item)) + '</div>') +
      '</td></tr></table>';
  }).join('');
}

function totalsBlock(order, headLabel) {
  const discount = Number(order.discountAmount) || 0;
  return rows(
    row(headLabel || 'Total paid', money(order.total), { big: true, bold: true }) +
    divider() +
    row('Subtotal', money(order.subtotal)) +
    (discount > 0 ? row('Discount' + (order.discountCode ? ' (' + esc(order.discountCode) + ')' : ''), '-' + money(discount), { color: GREEN, semi: true }) : '') +
    row('Delivery fee', Number(order.shipping) ? money(order.shipping) : 'Free')
  );
}

function addressBlock(order, opts) {
  opts = opts || {};
  return '<div style="font-size:14px;line-height:1.6;color:#555555;">' +
    '<strong style="color:#111111;">' + esc(order.customerName || '') + '</strong><br>' +
    addressLines(order).map(esc).join('<br>') +
    (opts.phone && order.customerPhone ? '<br>' + esc(order.customerPhone) : '') +
    (opts.email && order.customerEmail ? '<br><a href="mailto:' + esc(order.customerEmail) + '" style="color:#555555;">' + esc(order.customerEmail) + '</a>' : '') +
    '</div>';
}

const SUPPORT_FOOTER = 'Questions about your order? Reply to this email or write to ' +
  '<a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>Janedore · janedore.co.za';

function textTotals(order) {
  const discount = Number(order.discountAmount) || 0;
  return 'Subtotal: ' + money(order.subtotal) +
    (discount > 0 ? '\nDiscount' + (order.discountCode ? ' (' + order.discountCode + ')' : '') + ': -' + money(discount) : '') +
    '\nDelivery fee: ' + (Number(order.shipping) ? money(order.shipping) : 'Free') +
    '\nTotal: ' + money(order.total);
}

function textItems(items, hidePrice) {
  return items.map(i => '- ' + (i.name || 'Item') + (i.brand ? ' (' + i.brand + ')' : '') +
    (i.color && i.color !== 'Default' ? ', ' + i.color : '') + (sizeOf(i) ? ', size ' + sizeOf(i) : '') +
    ' x' + (Number(i.qty) || 1) + (hidePrice ? '' : ', ' + money(itemLine(i))) + (i.preorder ? ' [' + preorderLine(i) + ']' : '')).join('\n');
}

// "15 March 2027" from the brand's YYYY-MM-DD expected ship date.
function shipByDate(d) {
  const date = d ? new Date(String(d).slice(0, 10) + 'T12:00:00Z') : null;
  return date && !isNaN(date) ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : '';
}
function preorderLine(item) {
  const d = shipByDate(item.preorderShipDate);
  return 'Pre-order' + (d ? ' · Estimated dispatch: ' + d : '');
}

// "View order": signed-in customers land on their account's order page,
// everyone else on Track your order with the number filled in
// (track-order.js renderTrackOrderPage()).
function viewOrderUrl(ctx, num) {
  return ctx.siteUrl + '/pages/track-your-order?order=' + encodeURIComponent(num) + '&view=1';
}

// Same list as track-order.js COURIER_TRACKING_URLS.
const COURIER_TRACKING_URLS = {
  'the courier guy': 'https://portal.thecourierguy.co.za/track?ref={n}',
  'fastway': 'https://www.fastway.co.za/our-services/track-your-parcel?l={n}',
  'dhl': 'https://www.dhl.com/za-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}',
  'aramex': 'https://www.aramex.com/za/en/track/results?ShipmentNumber={n}',
  'dsv': 'https://www.dsv.com/en/tools/track-and-trace?reference={n}',
  'internet express': 'https://www.internetexpress.co.za/track-and-trace?waybill={n}',
  'mds collivery': 'https://collivery.net/tracking?waybill={n}',
  'rhenus': 'https://www.rhenus.com/en/track-and-trace?number={n}'
};
function courierTrackingUrl(courier, trackingNumber) {
  const tpl = COURIER_TRACKING_URLS[String(courier || '').trim().toLowerCase()];
  return tpl && trackingNumber ? tpl.replace('{n}', encodeURIComponent(trackingNumber)) : '';
}

// ---------- the emails ----------

function customerConfirmation(order, ctx) {
  const items = order.items || [];
  const collecting = collectedBrands(order);
  const delivering = deliveredItems(order).length > 0;
  const collectNote = collecting.length
    ? 'You’re collecting your ' + collecting.join(' and ') + ' items. We’ll email you the collection address, opening hours and your collection code as soon as ' + (collecting.length > 1 ? 'each brand has' : 'it’s') + ' ready.'
    : '';
  const count = items.reduce((a, i) => a + (Number(i.qty) || 1), 0);
  const brands = [...new Set(items.map(i => i.brand).filter(Boolean))];
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const num = order.orderNumber || '';

  const thanks =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 4px;">' +
      '<div style="width:56px;height:56px;line-height:56px;border-radius:28px;background:' + GREEN + ';color:#111111;font-size:28px;text-align:center;margin:0 auto 16px;">&#10003;</div>' +
      '<div style="font-size:22px;font-weight:700;line-height:1.3;color:#111111;">Thank you' + (first ? ', ' + esc(first) : '') + '</div>' +
      '<div style="font-size:14px;line-height:1.5;color:#555555;margin:8px auto 0;max-width:380px;">Your payment was successful and your order has been confirmed. ' + (delivering ? 'We\'ll send a shipping confirmation once your order has been dispatched.' : 'We\'ll email you as soon as your order is ready to collect.') + '</div>' +
      '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:20px;">Order #' + esc(num) + '</div>' +
      '<div style="font-size:13px;color:#777777;margin-top:4px;">' + esc(orderDate(order)) + '</div>' +
    '</td></tr></table>';

  const status = title('Order status') + rows(
    row('Payment', '<span style="color:#2e8b57;">&#9679;</span> Confirmed', { semi: true })
  ) + (brands.length > 1
    ? '<div style="font-size:12px;color:#777777;margin-top:10px;line-height:1.5;">Your order ships in ' + brands.length + ' packages, one from each brand, so they may arrive on different days.</div>'
    : '');

  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Order confirmed',
    preheader: 'Order #' + num + ' is confirmed: ' + money(order.total) + '.',
    cards: [
      thanks,
      status,
      title('Your items', '(' + count + ')') + itemsBlock(items, ctx),
      delivering ? title('Delivery details') + addressBlock(order) : '',
      collectNote ? title('Collection') + '<div style="font-size:14px;line-height:1.6;color:#555555;">' + esc(collectNote) + '</div>' : '',
      totalsBlock(order, 'Total paid') + button('View order', viewOrderUrl(ctx, num))
    ],
    footerHtml: SUPPORT_FOOTER
  });

  const text = 'Thank you' + (first ? ', ' + first : '') + '. Your order is confirmed.\n\nOrder #' + num + ' · ' + orderDate(order) +
    '\n\n' + textItems(items) + '\n\n' + textTotals(order) +
    (delivering ? '\n\nDelivering to:\n' + [order.customerName].concat(addressLines(order)).join('\n') : '') +
    (collectNote ? '\n\n' + collectNote : '') +
    '\n\nView your order: ' + viewOrderUrl(ctx, num) +
    '\n\nQuestions? support@janedore.co.za';

  return { subject: 'Your Janedore order #' + num + ' is confirmed', html, text };
}

function adminNewOrder(order, ctx) {
  const items = order.items || [];
  const count = items.reduce((a, i) => a + (Number(i.qty) || 1), 0);
  const num = order.orderNumber || '';
  const byBrand = {};
  items.forEach(i => { const b = i.brand || 'Janedore'; byBrand[b] = (byBrand[b] || 0) + (Number(i.qty) || 1); });

  const banner = '<strong>New order #' + esc(num) + '</strong> · ' + money(order.total) + ' · ' + count + (count === 1 ? ' item' : ' items') +
    (order.needsAttention ? '<br><span style="color:#b3261e;font-weight:700;">Needs attention: ' + esc(order.needsAttention) + '</span>' : '') +
    (collectedBrands(order).length ? '<br>Collecting from ' + esc(collectedBrands(order).join(' and ')) : '');

  const brandsCard = title('Brands on this order') + rows(Object.keys(byBrand).map(b =>
    row(esc(b), byBrand[b] + (byBrand[b] === 1 ? ' item' : ' items'))).join('')) +
    (ctx.vendorEmailNote ? '<div style="font-size:12px;color:#777777;margin-top:10px;line-height:1.5;">' + ctx.vendorEmailNote + '</div>' : '');

  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'New order',
    preheader: 'New order #' + num + ': ' + money(order.total) + ' from ' + (order.customerName || 'a customer'),
    bannerHtml: banner,
    cards: [
      title('Customer') + addressBlock(order, { phone: true, email: true }),
      brandsCard,
      title('Items', '(' + count + ')') + itemsBlock(items, ctx),
      totalsBlock(order, 'Total paid') +
        '<div style="font-size:12px;color:#777777;margin-top:12px;">Paid on PayFast' + (order.pfPaymentId ? ' · ref ' + esc(order.pfPaymentId) : '') + ' · ' + esc(orderDate(order)) + '</div>' +
        button('Open Orders in Admin', ctx.siteUrl + '/admin')
    ],
    footerHtml: 'Sent to the Janedore team for every paid order.'
  });

  const text = 'New order #' + num + ': ' + money(order.total) + ' (' + count + ' items)' +
    (order.needsAttention ? '\nNEEDS ATTENTION: ' + order.needsAttention : '') +
    '\n\nCustomer: ' + (order.customerName || '') + ', ' + (order.customerEmail || '') + ', ' + (order.customerPhone || '') +
    '\n' + addressLines(order).join('\n') + '\n\n' + textItems(items) + '\n\n' + textTotals(order) +
    '\n\nAdmin: ' + ctx.siteUrl + '/admin';

  return { subject: 'New order #' + num + ', ' + money(order.total), html, text };
}

function vendorNewOrder(order, ctx, vendor, items, opts) {
  const count = items.reduce((a, i) => a + (Number(i.qty) || 1), 0);
  const value = items.reduce((a, i) => a + itemLine(i), 0);
  const num = order.orderNumber || '';
  const brandName = vendor.brand || vendor.name || 'your brand';
  if (opts && opts.collect) return vendorCollectOrder(order, ctx, items, { count, value, num, brandName });

  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'New order to ship',
    preheader: 'New Janedore order #' + num + ': ' + count + (count === 1 ? ' item' : ' items') + ' to ship.',
    bannerHtml: '<strong>You have a new order to ship.</strong> The customer has paid. Please pack and send the items below.',
    cards: [
      title('Order #' + esc(num), esc(orderDate(order))) +
        '<div style="font-size:14px;line-height:1.5;color:#555555;">Only the ' + esc(brandName) + ' items on this order are listed. Anything from other brands is shipped separately by them.</div>',
      title('Items to ship', '(' + count + ')') + itemsBlock(items, ctx, { showBrand: false }) +
        rows(divider() + row('Items total', money(value), { semi: true })),
      title('Ship to') + addressBlock(order, { phone: true }) +
        button('Add Tracking', ctx.siteUrl + '/admin')
    ],
    footerHtml: 'Questions about this order? Write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>Janedore · janedore.co.za'
  });

  const text = 'New Janedore order #' + num + ' to ship (' + count + ' items).\n\n' + textItems(items) +
    '\nItems total: ' + money(value) + '\n\nShip to:\n' + [order.customerName].concat(addressLines(order), [order.customerPhone || '']).filter(Boolean).join('\n') +
    '\n\nAdd tracking: ' + ctx.siteUrl + '/admin';

  return { subject: 'New order #' + num + ' to ship, ' + count + (count === 1 ? ' item' : ' items'), html, text };
}

// The customer collects this brand's items: no courier. The brand packs
// them and marks the order Ready for collection in admin, which emails
// the customer the address and a collection code.
function vendorCollectOrder(order, ctx, items, o) {
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'New order for collection',
    preheader: 'New Janedore order #' + o.num + ': the customer will collect it from you.',
    bannerHtml: '<strong>You have a new order for collection.</strong> The customer has paid and will collect it from you.',
    cards: [
      title('Order #' + esc(o.num), esc(orderDate(order))) +
        '<div style="font-size:14px;line-height:1.5;color:#555555;">Please pack the items below, then mark the order <strong>Ready for collection</strong> in admin. The customer is then emailed your collection address, hours and a collection code. When the customer arrives, ask for the code in person, enter it in admin, and only hand over the parcel once it is accepted. Never ask for the code by phone, email or message.</div>',
      title('Items to pack', '(' + o.count + ')') + itemsBlock(items, ctx, { showBrand: false }) +
        rows(divider() + row('Items total', money(o.value), { semi: true })),
      title('Customer') + '<div style="font-size:14px;line-height:1.6;color:#555555;"><strong style="color:#111111;">' + esc(order.customerName || '') + '</strong>' + (order.customerPhone ? '<br>' + esc(order.customerPhone) : '') + '</div>' +
        button('Open order in admin', ctx.siteUrl + '/admin')
    ],
    footerHtml: 'Questions about this order? Write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>Janedore · janedore.co.za'
  });
  const text = 'New Janedore order #' + o.num + ' for collection (' + o.count + ' items).\n\n' + textItems(items) +
    '\nItems total: ' + money(o.value) + '\n\nThe customer will collect it from you. Pack the items, then mark the order Ready for collection in admin. When the customer arrives, ask for the collection code in person, enter it in admin, and only hand over the parcel once it is accepted. Never ask for the code by phone, email or message.\n\nCustomer: ' + (order.customerName || '') + (order.customerPhone ? ', ' + order.customerPhone : '') +
    '\n\nAdmin: ' + ctx.siteUrl + '/admin';
  return { subject: 'New order #' + o.num + ' for collection, ' + o.count + (o.count === 1 ? ' item' : ' items'), html, text };
}

// A brand marked its items Ready for collection (collection-api.js), or
// a reminder that they are still waiting. opts: { brand, addressLines,
// hours, instructions, code, holdUntil (date text), reminder }.
function readyForCollection(order, ctx, items, opts) {
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const heading = opts.reminder ? 'Your order is waiting for you' : 'Your order is ready to collect';
  const intro = (opts.reminder ? 'a reminder that your ' : 'your ') + opts.brand + ' items ' + (opts.reminder ? 'are still' : 'are') + ' ready to collect. Your order will only be released on presentation of the collection code below.' +
    (opts.holdUntil ? ' It will be held for you until ' + opts.holdUntil + '.' : '');
  const where = title('Collect from') +
    '<div style="font-size:14px;line-height:1.6;color:#555555;"><strong style="color:#111111;">' + esc(opts.brand) + '</strong><br>' + opts.addressLines.map(esc).join('<br>') +
    (opts.hours ? '<br><br><strong style="color:#111111;">Opening hours</strong><br>' + esc(opts.hours) : '') +
    (opts.instructions ? '<br><br>' + esc(opts.instructions) : '') + '</div>';
  const code = '<div style="text-align:center;padding:6px 0;"><div style="font-size:13px;color:#777777;">Your collection code</div>' +
    '<div style="font-size:32px;font-weight:700;letter-spacing:0.18em;color:#111111;margin-top:6px;">' + esc(opts.code) + '</div>' +
    '<div style="font-size:12px;color:#555555;margin-top:10px;line-height:1.6;">Only share this code in person, when you collect your order. Janedore and ' + esc(opts.brand) + ' will never ask for it by phone, email or message. If someone is collecting on your behalf, they will need this code.</div></div>';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: heading,
    preheader: 'Order #' + num + ': ' + heading.toLowerCase() + ' from ' + opts.brand + '.',
    bannerHtml: '<strong>' + esc(heading) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      code,
      where + button('View order', viewOrderUrl(ctx, num)),
      title('Items to collect') + itemsBlock(items, ctx, { hidePrice: true })
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = heading + '\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\nYour collection code: ' + opts.code + '\nOnly share this code in person, when you collect your order. Janedore and ' + opts.brand + ' will never ask for it by phone, email or message.' +
    '\n\nCollect from:\n' + [opts.brand].concat(opts.addressLines).join('\n') + (opts.hours ? '\nOpening hours: ' + opts.hours : '') + (opts.instructions ? '\n' + opts.instructions : '') +
    '\n\n' + textItems(items, true) + '\n\nOrder #' + num + '\nView your order: ' + viewOrderUrl(ctx, num) + '\n\nQuestions? support@janedore.co.za';
  return { subject: heading + ' (order #' + num + ')', html, text };
}

// Three incorrect collection codes were entered at the brand
// (collection-api.js): the order is locked until customer care sends a
// new code.
function collectionLocked(order, ctx, opts) {
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const heading = 'Your collection code has been locked';
  const intro = 'for your security, the collection code for your ' + opts.brand + ' order has been locked after three incorrect attempts. Your order is safe and will not be released until you have a new code.';
  const next = 'Please contact customer care at support@janedore.co.za, quoting order #' + num + ', and we’ll issue you a new code. If you weren’t trying to collect your order, please let us know straight away.';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: heading,
    preheader: 'Order #' + num + ': ' + heading.toLowerCase() + '.',
    bannerHtml: '<strong>' + esc(heading) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '<br><br>' + esc(next) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>' +
        button('Contact customer care', 'mailto:support@janedore.co.za?subject=' + encodeURIComponent('New collection code, order #' + num))
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = heading + '\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\n' + next + '\n\nOrder #' + num;
  return { subject: heading + ' (order #' + num + ')', html, text };
}

function shipped(order, ctx, items, opts) {
  opts = opts || {};
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const intro = opts.complete
    ? 'your order has been dispatched.'
    : 'part of your order has been dispatched. The remaining items will be shipped separately by their respective brands.';
  const tracking = opts.tracking || {};
  const courierUrl = courierTrackingUrl(tracking.courier, tracking.trackingNumber);
  const trackingCard = tracking.trackingNumber
    ? title('Tracking') + rows(
        (tracking.courier ? row('Courier', esc(tracking.courier), { semi: true }) : '') +
        row('Tracking number', courierUrl
          ? '<a href="' + esc(courierUrl) + '" style="color:#111111;">' + esc(tracking.trackingNumber) + '</a>'
          : esc(tracking.trackingNumber), { semi: true }))
    : '';
  // Straight to the courier's own tracking page when we know it.
  const trackUrl = courierUrl || viewOrderUrl(ctx, num);

  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: opts.heading || 'Your order has shipped',
    preheader: intro,
    bannerHtml: '<strong>' + esc(opts.heading || 'Your order has shipped') + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + intro + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      trackingCard + button('Track your order', trackUrl),
      title('Items in this shipment') + itemsBlock(items, ctx, { hidePrice: true }),
      title('Delivering to') + addressBlock(order)
    ].filter(Boolean),
    footerHtml: SUPPORT_FOOTER
  });

  const text = (opts.heading || 'Your order has shipped') + '\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\n' + textItems(items, true) +
    (tracking.trackingNumber ? '\n\n' + (tracking.courier ? tracking.courier + ': ' : '') + tracking.trackingNumber : '') +
    '\n\nOrder #' + num + '\nTrack your order: ' + trackUrl + '\n\nQuestions? support@janedore.co.za';

  return { subject: (opts.heading || 'Your order has shipped') + ' (order #' + num + ')', html, text };
}

// Janedore team copy of a shipment: which brand shipped, its tracking,
// and how much of the order is still waiting on other brands.
function adminShipped(order, ctx, items, opts) {
  opts = opts || {};
  const num = order.orderNumber || '';
  const brand = opts.brand || 'A brand';
  const tracking = opts.tracking || {};
  const progress = opts.totalPackages > 1
    ? opts.shippedPackages + ' of ' + opts.totalPackages + ' shipments sent' + (opts.complete ? ', order complete.' : '.')
    : 'Order complete.';

  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Order shipped',
    preheader: brand + ' shipped order #' + num + '. ' + progress,
    bannerHtml: '<strong>' + esc(brand) + ' shipped order #' + esc(num) + '</strong><br>' + esc(progress),
    cards: [
      title('Tracking') + rows(
        row('Brand', esc(brand), { semi: true }) +
        (tracking.courier ? row('Courier', esc(tracking.courier), { semi: true }) : '') +
        row('Tracking number', esc(tracking.trackingNumber || 'Not given'), { semi: true })),
      title('Shipped') + itemsBlock(items, ctx, { hidePrice: true }),
      title('Customer') + addressBlock(order, { phone: true, email: true }) +
        button('Open Orders in Admin', ctx.siteUrl + '/admin')
    ],
    footerHtml: 'Sent to the Janedore team whenever a brand adds tracking.'
  });

  const text = brand + ' shipped order #' + num + '. ' + progress +
    '\n\n' + (tracking.courier ? tracking.courier + ': ' : '') + (tracking.trackingNumber || 'No tracking number') +
    '\n\n' + textItems(items, true) + '\n\nCustomer: ' + (order.customerName || '') + ', ' + (order.customerEmail || '') +
    '\n\nAdmin: ' + ctx.siteUrl + '/admin';

  return { subject: brand + ' shipped order #' + num, html, text };
}

// ---------- returns (returns-api.js) ----------

function returnItemsBlock(ret, ctx) {
  return (ret.items || []).map((item, i) => {
    const img = ctx.imageFor ? ctx.imageFor(item) : '';
    const meta = [item.brand, item.color && item.color !== 'Default' ? item.color : '', sizeOf(item) ? 'Size ' + sizeOf(item) : '', 'Qty ' + (Number(item.qty) || 1)].filter(Boolean).map(esc).join(' · ');
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + (i ? 'border-top:1px solid #eeeeee;' : '') + '"><tr>' +
      '<td width="72" valign="top" style="padding:' + (i ? '14px' : '0') + ' 14px 14px 0;">' +
        (img ? '<img src="' + esc(img) + '" width="72" height="96" alt="" style="display:block;width:72px;height:96px;object-fit:cover;background:#f4f4f4;border:0;">' : '<div style="width:72px;height:96px;background:#f4f4f4;"></div>') +
      '</td><td valign="top" style="padding:' + (i ? '14px' : '0') + ' 0 14px;">' +
        '<div style="font-size:15px;font-weight:700;line-height:1.3;color:#111111;">' + esc(item.name || 'Item') + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:3px;">' + meta + '</div>' +
        (item.reason ? '<div style="font-size:13px;color:#111111;margin-top:8px;"><strong>Reason:</strong> ' + esc(item.reason) + '</div>' : '') +
        (item.details ? '<div style="font-size:13px;line-height:1.5;color:#555555;margin-top:4px;">' + esc(item.details) + '</div>' : '') +
      '</td></tr></table>';
  }).join('');
}
function returnTextItems(ret) {
  return (ret.items || []).map(i => '- ' + (i.name || 'Item') + ' (' + (i.brand || '') + ') x' + (Number(i.qty) || 1) + (i.reason ? ': ' + i.reason : '')).join('\n');
}
function returnStatusUrl(ctx, ret) {
  return ctx.siteUrl + '/pages/log-a-return?return=' + encodeURIComponent(ret.returnNumber || '');
}

// Customer: we have your request.
function returnRequested(ret, ctx) {
  const first = String(ret.customerName || '').trim().split(/\s+/)[0] || '';
  const intro = 'we’ve received your return request for order #' + (ret.orderNumber || '') + '. Our team will review it and email you with the next steps. Please keep the item, with its tags and packaging, until then.';
  const html = shell({
    logoUrl: ctx.logoUrl, logoFontUrl: ctx.logoFontUrl,
    title: 'Return request received',
    preheader: 'Return ' + ret.returnNumber + ' for order #' + ret.orderNumber + ' is under review.',
    bannerHtml: '<strong>Return request received</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Return ' + esc(ret.returnNumber) + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:4px;">Order #' + esc(ret.orderNumber) + '</div>' +
        button('Check return status', returnStatusUrl(ctx, ret)),
      title('Items to return') + returnItemsBlock(ret, ctx),
      '<div style="font-size:13px;line-height:1.6;color:#555555;">Please don’t send anything back yet. We’ll email you once your return has been reviewed, with instructions for sending it.</div>'
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = 'Return request received\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\nReturn ' + ret.returnNumber + '\nOrder #' + ret.orderNumber + '\n\n' + returnTextItems(ret) +
    '\n\nCheck return status: ' + returnStatusUrl(ctx, ret);
  return { subject: 'Return request received (' + ret.returnNumber + ')', html, text };
}

// Team and brand copy of a request (and of a brand's dispute).
function returnForStaff(ret, ctx, opts) {
  opts = opts || {};
  const heading = opts.heading || 'Return request';
  const intro = opts.dispute
    ? opts.dispute + ' Review it in Admin → Returns before deciding.'
    : (opts.brand ? 'A customer has asked to return the item(s) below from your brand. Please review the reason and photos in Admin → Returns and accept or dispute the return. Janedore will make the final decision.'
      : 'A customer has asked to return the item(s) below. Review the photos and the brand’s response in Admin → Returns, then approve or decline.');
  const photos = (ret.photos || []).slice(0, 6).map(u => '<a href="' + esc(u) + '" style="display:inline-block;margin:0 8px 8px 0;"><img src="' + esc(u) + '" width="88" height="88" alt="Customer photo" style="display:block;width:88px;height:88px;object-fit:cover;background:#f4f4f4;border:0;"></a>').join('');
  const html = shell({
    logoUrl: ctx.logoUrl, logoFontUrl: ctx.logoFontUrl,
    title: heading,
    preheader: heading + ': ' + ret.returnNumber + ' for order #' + ret.orderNumber,
    bannerHtml: '<strong>' + esc(heading) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Return ' + esc(ret.returnNumber) + ' · Order #' + esc(ret.orderNumber) + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:4px;">' + esc(ret.customerName || '') + '</div>' +
        button('Open Returns in Admin', ctx.siteUrl + '/admin'),
      title('Items') + returnItemsBlock(ret, ctx),
      photos ? title('Customer photos') + '<div>' + photos + '</div>' : '',
      ret.note ? title('Customer note') + '<div style="font-size:13px;line-height:1.6;color:#555555;">' + esc(ret.note) + '</div>' : ''
    ].filter(Boolean),
    footerHtml: 'Sent by Janedore Returns.'
  });
  const text = heading + '\n\n' + intro + '\n\nReturn ' + ret.returnNumber + ', order #' + ret.orderNumber + '\n\n' + returnTextItems(ret) + '\n\nAdmin: ' + ctx.siteUrl + '/admin';
  return { subject: heading + ' (' + ret.returnNumber + ')', html, text };
}

// Customer: each step after review.
function returnUpdate(ret, ctx, stage) {
  const first = String(ret.customerName || '').trim().split(/\s+/)[0] || '';
  const amount = money(ret.refundAmount || 0);
  const shipping = ret.approval && ret.approval.shipping;
  const copy = {
    approved: ['Your return has been approved', 'your return ' + ret.returnNumber + ' has been approved.' +
      (shipping === 'collection'
        ? ' We’ll arrange a courier to collect the item from you at no cost, and contact you to confirm a collection date.'
        : ' Please send the item back at your own cost, using a tracked delivery service, to the address in the instructions below. Keep your proof of postage.') +
      ' Once we’ve received and checked the item, we’ll process your refund.'],
    declined: ['Update on your return', 'after reviewing your return ' + ret.returnNumber + ', we’re unable to approve it. Please see the reason below. If you have any questions, reply to this email and our team will assist you.'],
    received: ['We’ve received your return', 'we’ve received the item(s) for return ' + ret.returnNumber + '. We’ll now process your refund of ' + amount + ' and email you as soon as it has been completed.'],
    refund_pending: ['We’re processing your refund', 'we’re processing a refund of ' + amount + ' for return ' + ret.returnNumber + '. We’ll email you again as soon as the refund has been completed.'],
    refunded: ['Your refund has been processed', 'your refund of ' + amount + ' for return ' + ret.returnNumber + ' has been completed and returned to your original payment method. Depending on your bank, it can take up to 10 business days to reflect in your account.']
  }[stage];
  const extra = stage === 'declined'
    ? title('Reason') + '<div style="font-size:14px;line-height:1.6;color:#111111;">' + esc(ret.declineReason || '') + '</div>'
    : stage === 'approved' && ret.approval && ret.approval.message
      ? title(shipping === 'collection' ? 'Collection details' : 'Return instructions') + '<div style="font-size:14px;line-height:1.6;color:#111111;white-space:pre-line;">' + esc(ret.approval.message) + '</div>'
      : '';
  const html = shell({
    logoUrl: ctx.logoUrl, logoFontUrl: ctx.logoFontUrl,
    title: copy[0],
    preheader: copy[0] + ' (' + ret.returnNumber + ')',
    bannerHtml: '<strong>' + esc(copy[0]) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(copy[1]) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Return ' + esc(ret.returnNumber) + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:4px;">Order #' + esc(ret.orderNumber) + '</div>' +
        button('Check return status', returnStatusUrl(ctx, ret)),
      extra,
      ['received', 'refund_pending', 'refunded'].includes(stage) ? title('Refund') + rows(row('Refund amount', amount, { big: true, bold: true }) + row('Refund to', 'Original payment method (PayFast)')) : '',
      title('Items') + returnItemsBlock(ret, ctx)
    ].filter(Boolean),
    footerHtml: SUPPORT_FOOTER
  });
  const text = copy[0] + '\n\nHi' + (first ? ' ' + first : '') + ', ' + copy[1] +
    (stage === 'declined' ? '\n\nReason: ' + (ret.declineReason || '') : '') +
    (stage === 'approved' && ret.approval && ret.approval.message ? '\n\n' + ret.approval.message : '') +
    '\n\nReturn ' + ret.returnNumber + '\n' + returnTextItems(ret) + '\n\nCheck return status: ' + returnStatusUrl(ctx, ret);
  return { subject: copy[0] + ' (' + ret.returnNumber + ')', html, text };
}

// ---------- exchanges (exchanges-api.js) ----------
// Never mentions refunds: an exchange only ever ends in a new item.

function exchangeWant(item) {
  return [item.wantColor && item.wantColor !== 'Default' ? item.wantColor : '', item.wantSize && item.wantSize !== 'OS' ? 'Size ' + item.wantSize : ''].filter(Boolean).join(', ') || 'A replacement';
}
function exchangeItemsBlock(ex, ctx) {
  return (ex.items || []).map((item, i) => {
    const img = ctx.imageFor ? ctx.imageFor(item) : '';
    const meta = [item.brand, item.color && item.color !== 'Default' ? item.color : '', sizeOf(item) ? 'Size ' + sizeOf(item) : '', 'Qty ' + (Number(item.qty) || 1)].filter(Boolean).map(esc).join(' · ');
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + (i ? 'border-top:1px solid #eeeeee;' : '') + '"><tr>' +
      '<td width="72" valign="top" style="padding:' + (i ? '14px' : '0') + ' 14px 14px 0;">' +
        (img ? '<img src="' + esc(img) + '" width="72" height="96" alt="" style="display:block;width:72px;height:96px;object-fit:cover;background:#f4f4f4;border:0;">' : '<div style="width:72px;height:96px;background:#f4f4f4;"></div>') +
      '</td><td valign="top" style="padding:' + (i ? '14px' : '0') + ' 0 14px;">' +
        '<div style="font-size:15px;font-weight:700;line-height:1.3;color:#111111;">' + esc(item.name || 'Item') + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:3px;">' + meta + '</div>' +
        '<div style="font-size:13px;color:#111111;margin-top:8px;"><strong>Exchange for:</strong> ' + esc(exchangeWant(item)) + '</div>' +
        (item.reason ? '<div style="font-size:13px;color:#555555;margin-top:4px;">Reason: ' + esc(item.reason) + '</div>' : '') +
      '</td></tr></table>';
  }).join('');
}
function exchangeTextItems(ex) {
  return (ex.items || []).map((i) => '- ' + (i.name || 'Item') + ' (' + (i.brand || '') + ') x' + (Number(i.qty) || 1) + ': ' + (i.reason || '') + '. Exchanging for: ' + exchangeWant(i)).join('\n');
}
function exchangeStatusUrl(ctx, ex) {
  return ctx.siteUrl + '/pages/exchange-an-item?exchange=' + encodeURIComponent(ex.exchangeNumber || '');
}
function exchangePostageLine(postage) {
  return postage === 'janedore'
    ? 'We’ll cover the delivery costs for this exchange: a courier will collect the item and your replacement will be sent at no cost to you.'
    : 'Postage for this exchange is at your cost: sending the item back, and delivery of your new item.';
}

// Customer: we have your request.
function exchangeRequested(ex, ctx) {
  const first = String(ex.customerName || '').trim().split(/\s+/)[0] || '';
  const intro = 'we’ve received your exchange request for order #' + (ex.orderNumber || '') + '. Our team will review it with the brand and email you with the next steps. Please keep the item, with its tags and packaging, until then.';
  const postage = ex.postage === 'janedore'
    ? 'As the issue appears to be on our side, delivery costs for this exchange are expected to be covered by JANEDORE. We’ll confirm this once your request has been reviewed.'
    : 'As the item was sent as ordered, postage for this exchange is at your cost. We’ll confirm the details when we review your request.';
  const html = shell({
    logoUrl: ctx.logoUrl, logoFontUrl: ctx.logoFontUrl,
    title: 'Exchange request received',
    preheader: 'Exchange ' + ex.exchangeNumber + ' for order #' + ex.orderNumber + ' is under review.',
    bannerHtml: '<strong>Exchange request received</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Exchange ' + esc(ex.exchangeNumber) + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:4px;">Order #' + esc(ex.orderNumber) + '</div>' +
        button('Check exchange status', exchangeStatusUrl(ctx, ex)),
      title('Items to exchange') + exchangeItemsBlock(ex, ctx),
      '<div style="font-size:13px;line-height:1.6;color:#555555;">' + esc(postage) + ' Please don’t send anything back yet.</div>'
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = 'Exchange request received\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\nExchange ' + ex.exchangeNumber + '\nOrder #' + ex.orderNumber + '\n\n' + exchangeTextItems(ex) +
    '\n\n' + postage + ' Please don’t send anything back yet.\n\nCheck exchange status: ' + exchangeStatusUrl(ctx, ex);
  return { subject: 'Exchange request received (' + ex.exchangeNumber + ')', html, text };
}

// Team and brand copy of a request (and of a brand's dispute).
function exchangeForStaff(ex, ctx, opts) {
  opts = opts || {};
  const heading = opts.heading || 'Exchange request';
  const intro = opts.dispute
    ? opts.dispute + ' Review it in Admin → Exchanges before deciding.'
    : (opts.brand ? 'A customer has asked to exchange the item(s) below from your brand. Please check that you can supply what they want instead, then confirm or dispute the exchange in Admin → Exchanges. Janedore will make the final decision.'
      : 'A customer has asked to exchange the item(s) below. Check the brand’s response in Admin → Exchanges, then approve or decline. Postage proposed from the reason: ' + (ex.postage === 'janedore' ? 'JANEDORE pays.' : 'the customer pays.'));
  const photos = (ex.photos || []).slice(0, 6).map(u => '<a href="' + esc(u) + '" style="display:inline-block;margin:0 8px 8px 0;"><img src="' + esc(u) + '" width="88" height="88" alt="Customer photo" style="display:block;width:88px;height:88px;object-fit:cover;background:#f4f4f4;border:0;"></a>').join('');
  const html = shell({
    logoUrl: ctx.logoUrl, logoFontUrl: ctx.logoFontUrl,
    title: heading,
    preheader: heading + ': ' + ex.exchangeNumber + ' for order #' + ex.orderNumber,
    bannerHtml: '<strong>' + esc(heading) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Exchange ' + esc(ex.exchangeNumber) + ' · Order #' + esc(ex.orderNumber) + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:4px;">' + esc(ex.customerName || '') + '</div>' +
        button('Open Exchanges in Admin', ctx.siteUrl + '/admin'),
      title('Items') + exchangeItemsBlock(ex, ctx) +
        (ex.items || []).filter((i) => i.details).map((i) => '<div style="font-size:13px;line-height:1.5;color:#555555;margin-top:8px;"><strong>' + esc(i.name) + ':</strong> ' + esc(i.details) + '</div>').join(''),
      photos ? title('Customer photos') + '<div>' + photos + '</div>' : '',
      ex.note ? title('Customer note') + '<div style="font-size:13px;line-height:1.6;color:#555555;">' + esc(ex.note) + '</div>' : ''
    ].filter(Boolean),
    footerHtml: 'Sent by Janedore Exchanges.'
  });
  const text = heading + '\n\n' + intro + '\n\nExchange ' + ex.exchangeNumber + ', order #' + ex.orderNumber + '\n\n' + exchangeTextItems(ex) + '\n\nAdmin: ' + ctx.siteUrl + '/admin';
  return { subject: heading + ' (' + ex.exchangeNumber + ')', html, text };
}

// Customer: each step after review.
function exchangeUpdate(ex, ctx, stage) {
  const first = String(ex.customerName || '').trim().split(/\s+/)[0] || '';
  const postage = ex.approval && ex.approval.postage;
  const copy = {
    approved: ['Your exchange has been approved', 'your exchange ' + ex.exchangeNumber + ' has been approved and your new item has been set aside for you. ' +
      exchangePostageLine(postage) + ' Please follow the instructions below. Once the brand has received the item, we’ll send your new one.'],
    declined: ['Update on your exchange', 'after reviewing your exchange ' + ex.exchangeNumber + ', we’re unable to approve it. Please see the reason below. If you have any questions, reply to this email and our team will assist you.'],
    received: ['We’ve received your item', 'the brand has received the item(s) for exchange ' + ex.exchangeNumber + '. We’ll email you as soon as your new item is on its way.'],
    dispatched: ['Your new item is on its way', 'your new item for exchange ' + ex.exchangeNumber + ' has been dispatched. You can follow it with the tracking details below.']
  }[stage];
  const d = ex.dispatch || {};
  const extra = stage === 'declined'
    ? title('Reason') + '<div style="font-size:14px;line-height:1.6;color:#111111;">' + esc(ex.declineReason || '') + '</div>'
    : stage === 'approved' && ex.approval && ex.approval.message
      ? title('Instructions') + '<div style="font-size:14px;line-height:1.6;color:#111111;white-space:pre-line;">' + esc(ex.approval.message) + '</div>'
      : stage === 'dispatched'
        ? title('Tracking') + rows(row('Courier', esc(d.courier || ''), { semi: true }) + row('Tracking number', esc(d.trackingNumber || ''), { semi: true, bold: true }))
        : '';
  const html = shell({
    logoUrl: ctx.logoUrl, logoFontUrl: ctx.logoFontUrl,
    title: copy[0],
    preheader: copy[0] + ' (' + ex.exchangeNumber + ')',
    bannerHtml: '<strong>' + esc(copy[0]) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(copy[1]) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Exchange ' + esc(ex.exchangeNumber) + '</div>' +
        '<div style="font-size:13px;color:#777777;margin-top:4px;">Order #' + esc(ex.orderNumber) + '</div>' +
        button('Check exchange status', exchangeStatusUrl(ctx, ex)),
      extra,
      title('Items') + exchangeItemsBlock(ex, ctx)
    ].filter(Boolean),
    footerHtml: SUPPORT_FOOTER
  });
  const text = copy[0] + '\n\nHi' + (first ? ' ' + first : '') + ', ' + copy[1] +
    (stage === 'declined' ? '\n\nReason: ' + (ex.declineReason || '') : '') +
    (stage === 'approved' && ex.approval && ex.approval.message ? '\n\n' + ex.approval.message : '') +
    (stage === 'dispatched' ? '\n\nCourier: ' + (d.courier || '') + '\nTracking number: ' + (d.trackingNumber || '') : '') +
    '\n\nExchange ' + ex.exchangeNumber + '\n' + exchangeTextItems(ex) + '\n\nCheck exchange status: ' + exchangeStatusUrl(ctx, ex);
  return { subject: copy[0] + ' (' + ex.exchangeNumber + ')', html, text };
}

// Admin moved the order to a new stage (server.js
// /api/orders/:id/notify-status). trackings: packages that already have
// a tracking number.
const STATUS_EMAIL_COPY = {
  processing: ['Your order is being processed', 'your order is being prepared. We’ll notify you once it has been packed.'],
  packed: ['Your order has been packed', 'your order has been packed and is waiting for the courier. We’ll send tracking details once it has been dispatched.'],
  shipped: ['Your order is on its way', 'your order has been handed to the courier and is on its way to you.'],
  delivered: ['Your order has been delivered', 'your order has been delivered. We hope you love it. Items can be returned or exchanged within 14 days of delivery.']
};
// Every item collected by the customer: no courier in the copy.
const COLLECT_STATUS_EMAIL_COPY = {
  packed: ['Your order has been packed', 'your order has been packed. We’ll email you the collection details as soon as it’s ready to collect.'],
  delivered: ['Your order has been collected', 'your order has been collected. We hope you love it. Items can be returned or exchanged within 14 days of collection.']
};
function statusUpdate(order, ctx, status, trackings) {
  const delivering = deliveredItems(order).length > 0;
  const copy = (!delivering && COLLECT_STATUS_EMAIL_COPY[status]) || STATUS_EMAIL_COPY[status];
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const tracked = (trackings || []).filter(t => t.trackingNumber);
  const trackingCard = status === 'shipped' && tracked.length
    ? title('Tracking') + rows(tracked.map(t => {
        const url = courierTrackingUrl(t.courier, t.trackingNumber);
        const value = url ? '<a href="' + esc(url) + '" style="color:#111111;">' + esc(t.trackingNumber) + '</a>' : esc(t.trackingNumber);
        return row(esc(t.courier || 'Tracking number'), value, { semi: true });
      }).join(''))
    : '';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: copy[0],
    preheader: 'Order #' + num + ': ' + copy[0].toLowerCase() + '.',
    bannerHtml: '<strong>' + esc(copy[0]) + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(copy[1]) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      trackingCard + button('View order', viewOrderUrl(ctx, num)),
      title('Your items') + itemsBlock(order.items || [], ctx, { hidePrice: true }),
      status === 'delivered' || !delivering ? '' : title('Delivering to') + addressBlock(order)
    ].filter(Boolean),
    footerHtml: SUPPORT_FOOTER
  });
  const text = copy[0] + '\n\nHi' + (first ? ' ' + first : '') + ', ' + copy[1] + '\n\n' + textItems(order.items || [], true) +
    tracked.map(t => '\n' + (t.courier ? t.courier + ': ' : '') + t.trackingNumber).join('') +
    '\n\nOrder #' + num + '\nView your order: ' + viewOrderUrl(ctx, num) + '\n\nQuestions? support@janedore.co.za';
  return { subject: copy[0] + ' (order #' + num + ')', html, text };
}

// Step 1 of a refund: staff chose "Start refund" in admin. Says only that
// it is being processed; nothing claims the money has moved yet.
function refundStarted(order, ctx) {
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const amount = Number(order.refundAmount || order.total) || 0;
  const intro = 'we’re processing a refund of ' + money(amount) + ' for your order #' + num + '. We’ll email you again as soon as the refund has been completed.';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'We’re processing your refund',
    preheader: 'Your refund of ' + money(amount) + ' for order #' + num + ' is being processed.',
    bannerHtml: '<strong>We’re processing your refund</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      title('Refund summary') + rows(
        row('Refund amount', money(amount), { big: true, bold: true }) +
        divider() +
        row('Status', 'In progress', { semi: true }) +
        row('Refund to', 'Original payment method (PayFast)')),
      title('Items') + itemsBlock(order.items || [], ctx, {}),
      '<div style="font-size:13px;line-height:1.6;color:#555555;">No action is required from you. If you have any questions in the meantime, reply to this email and our team will assist you.</div>'
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = 'We’re processing your refund\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\nRefund amount: ' + money(amount) + '\nStatus: In progress' +
    '\n\n' + textItems(order.items || [], false) + '\n\nQuestions? support@janedore.co.za';
  return { subject: 'We’re processing your refund (order #' + num + ')', html, text };
}

// Step 2: staff confirmed in admin that the refund was completed in
// PayFast. server.js /api/orders/:id/notify-refunded sends both.
function refunded(order, ctx) {
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const amount = Number(order.refundAmount || order.total) || 0;
  const intro = 'your refund of ' + money(amount) + ' for order #' + num + ' has been completed and returned to your original payment method. Depending on your bank, it can take up to 10 business days to reflect in your account.';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Your refund has been processed',
    preheader: 'A refund of ' + money(amount) + ' for order #' + num + ' has been processed.',
    bannerHtml: '<strong>Your refund has been processed</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      title('Refund summary') + rows(
        row('Refund amount', money(amount), { big: true, bold: true }) +
        divider() +
        row('Original order total', money(order.total)) +
        row('Refunded to', 'Original payment method (PayFast)')),
      title('Refunded items') + itemsBlock(order.items || [], ctx, {}),
      '<div style="font-size:13px;line-height:1.6;color:#555555;">If the refund hasn’t reflected after 10 business days, reply to this email with your order number and our team will follow up with you.</div>'
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = 'Your refund has been processed\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + '\n\nRefund amount: ' + money(amount) +
    '\n\n' + textItems(order.items || [], false) + '\n\nQuestions? support@janedore.co.za';
  return { subject: 'Your refund has been processed (order #' + num + ')', html, text };
}

// A brand moved the expected ship date of a pre-order the customer paid
// for. Sent once per order from server.js /api/preorder-date-changed.
function preorderDateChanged(order, ctx, items, opts) {
  opts = opts || {};
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || '';
  const newDate = shipByDate(opts.newDate);
  const oldDate = shipByDate(opts.oldDate);
  const intro = 'the estimated dispatch date for your pre-order from ' + (opts.brand || 'the brand') + ' has been updated' +
    (newDate ? ' to ' + newDate + '.' : '.');
  const trackUrl = ctx.siteUrl + '/pages/track-your-order?order=' + encodeURIComponent(num);
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Update to your pre-order',
    preheader: intro,
    bannerHtml: '<strong>Update to your pre-order</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', ' + esc(intro) + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      title('Estimated dispatch') + rows(
        (oldDate ? row('Previous', esc(oldDate), { semi: true }) : '') +
        row('Updated', esc(newDate || 'To be confirmed'), { semi: true, bold: true })) + button('Track your order', trackUrl),
      title('Your pre-order') + itemsBlock(items, ctx, { hidePrice: true }),
      '<div style="font-size:13px;line-height:1.6;color:#555555;">No action is required. If the revised date doesn’t suit you, reply to this email and our team will assist you.</div>'
    ],
    footerHtml: SUPPORT_FOOTER
  });
  const text = 'Update to your pre-order\n\nHi' + (first ? ' ' + first : '') + ', ' + intro + (oldDate ? '\nPrevious: ' + oldDate : '') +
    '\n\n' + textItems(items, true) + '\n\nOrder #' + num + '\nTrack your order: ' + trackUrl +
    '\n\nNo action is required. If the revised date doesn’t suit you, reply to this email and our team will assist you.';
  return { subject: 'Update to your pre-order (order #' + num + ')', html, text };
}

// Customer copy when they report a brand and leave an email: we got it,
// what they sent, and where to go for returns or other questions.
function reportReceived(report, ctx) {
  const brand = report.brand || 'the brand';
  const link = (label, path) => '<a href="' + esc(ctx.siteUrl + path) + '" style="color:#111111;font-weight:700;">' + label + '</a>';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Report received',
    preheader: 'Your report about ' + brand + ' has been received and will be reviewed by our team.',
    bannerHtml: '<strong>Report received</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Thank you for your report about <strong style="color:#111111;">' + esc(brand) +
        '</strong>. Our marketplace team will review it and take appropriate action, and will contact you at this email address if further details are required. All reports are handled in strict confidence.</div>',
      title('Your report') + rows(
        row('Brand', esc(brand), { semi: true }) +
        row('Reason', esc(report.reason), { semi: true })) +
        (report.details ? '<div style="font-size:14px;line-height:1.6;color:#555555;margin-top:12px;white-space:pre-wrap;">' + esc(report.details) + '</div>' : ''),
      title('Need something else?') +
        '<div style="font-size:14px;line-height:1.8;color:#555555;">' +
        'Want to send something back? ' + link('Log a return', '/pages/log-a-return') + '.<br>' +
        'Other questions? See our ' + link('Frequently asked questions', '/pages/faq') + '.</div>'
    ],
    footerHtml: 'Anything to add? Reply to this email or write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>Janedore · janedore.co.za'
  });
  const text = 'Report received\n\nThank you for your report about ' + brand +
    '. Our marketplace team will review it and take appropriate action, and will contact you if further details are required. All reports are handled in strict confidence.\n\nBrand: ' + brand +
    '\nReason: ' + report.reason + (report.details ? '\n\n' + report.details : '') +
    '\n\nLog a return: ' + ctx.siteUrl + '/pages/log-a-return\nFrequently asked questions: ' + ctx.siteUrl + '/pages/faq\n\nQuestions? support@janedore.co.za';
  return { subject: 'Your report about ' + brand + ' has been received', html, text };
}

// Customer care contact form (/api/contact): the team's copy and the
// customer's copy.
function contactForStaff(m, ctx) {
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'New customer care message',
    preheader: m.topic + ' from ' + m.name,
    bannerHtml: '<strong>New customer care message</strong>',
    cards: [
      title('From') + rows(
        row('Name', esc(m.name), { semi: true }) +
        row('Email', esc(m.email), { semi: true }) +
        (m.orderNumber ? row('Order', esc(m.orderNumber), { semi: true }) : '') +
        row('Topic', esc(m.topic), { semi: true })),
      title('Message') + '<div style="font-size:14px;line-height:1.6;color:#111111;white-space:pre-wrap;">' + esc(m.message) + '</div>'
    ],
    footerHtml: 'Reply to this email to answer ' + esc(m.name) + ' directly.<br>Message ' + esc(m.id)
  });
  const text = 'New customer care message\n\nName: ' + m.name + '\nEmail: ' + m.email + (m.orderNumber ? '\nOrder: ' + m.orderNumber : '') +
    '\nTopic: ' + m.topic + '\n\n' + m.message + '\n\nReply to this email to answer ' + m.name + ' directly.\nMessage ' + m.id;
  return { subject: 'Customer care: ' + m.topic + (m.orderNumber ? ' (' + m.orderNumber + ')' : '') + ' from ' + m.name, html, text };
}

function contactReceived(m, ctx) {
  const first = String(m.name || '').split(' ')[0];
  const link = (label, path) => '<a href="' + esc(ctx.siteUrl + path) + '" style="color:#111111;font-weight:700;">' + label + '</a>';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'We’ve received your message',
    preheader: 'Thank you for contacting Janedore customer care. We’ll reply to you at this email address.',
    bannerHtml: '<strong>We’ve received your message</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi' + (first ? ' ' + esc(first) : '') + ', thank you for contacting Janedore customer care. We’ll reply to you at this email address.</div>',
      title('Your message') + rows(
        (m.orderNumber ? row('Order', esc(m.orderNumber), { semi: true }) : '') +
        row('Topic', esc(m.topic), { semi: true })) +
        '<div style="font-size:14px;line-height:1.6;color:#555555;margin-top:12px;white-space:pre-wrap;">' + esc(m.message) + '</div>',
      title('In the meantime') +
        '<div style="font-size:14px;line-height:1.8;color:#555555;">' +
        link('Track your order', '/pages/track-your-order') + '<br>' +
        link('Log a return', '/pages/log-a-return') + '<br>' +
        link('Frequently asked questions', '/pages/faq') + '</div>'
    ],
    footerHtml: 'Anything to add? Reply to this email or write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>Janedore · janedore.co.za'
  });
  const text = 'We’ve received your message\n\nHi' + (first ? ' ' + first : '') + ', thank you for contacting Janedore customer care. We’ll reply to you at this email address.\n\n' +
    (m.orderNumber ? 'Order: ' + m.orderNumber + '\n' : '') + 'Topic: ' + m.topic + '\n\n' + m.message +
    '\n\nTrack your order: ' + ctx.siteUrl + '/pages/track-your-order\nLog a return: ' + ctx.siteUrl + '/pages/log-a-return\nFrequently asked questions: ' + ctx.siteUrl + '/pages/faq\n\nQuestions? support@janedore.co.za';
  return { subject: 'We’ve received your message', html, text };
}

// Partner application (/api/partner-applications): the team's copy and
// the applicant's confirmation.
function partnerApplicationForStaff(a, ctx) {
  const link = (url, label) => '<a href="' + esc(url) + '" style="color:#111111;">' + esc(label || url) + '</a>';
  const para = (label, value) => value ? '<div style="font-size:14px;line-height:1.6;color:#111111;margin-top:12px;white-space:pre-wrap;"><strong>' + esc(label) + '</strong><br>' + esc(value) + '</div>' : '';
  const ig = a.instagram ? a.instagram.replace(/^@/, '') : '';
  const cats = a.categories || [];
  const ops = [['Channels', (a.channels || []).join(', ')], ['Range', a.rangeSize], ['Fulfilment', a.fulfilment]].filter((r) => r[1]);
  const images = a.images || [];
  // Applications from before the redesign also carry location, price band,
  // channels, range, fulfilment and goals; they show when present.
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'New partner application',
    preheader: a.brandName + ' has applied to partner with Janedore.',
    bannerHtml: '<strong>New partner application: ' + esc(a.brandName) + '</strong>',
    cards: [
      title('Brand') + rows(
        row('Brand', esc(a.brandName), { semi: true }) +
        (a.location ? row('Based in', esc(a.location), { semi: true }) : '') +
        (a.founded ? row('Founded', esc(a.founded), { semi: true }) : '') +
        (a.website ? row('Website', link(a.website), { semi: true }) : '') +
        (a.social ? row('Social', esc(a.social), { semi: true }) : '') +
        (ig ? row('Instagram', link('https://instagram.com/' + ig, '@' + ig), { semi: true }) : '') +
        row('Primary category', esc(a.primaryCategory || cats[0] || ''), { semi: true }) +
        (cats.length > 1 ? row('Categories', esc(cats.join(', ')), { semi: true }) : '') +
        row('Production', esc(a.production || ''), { semi: true }) +
        (a.priceBand ? row('Average price', esc(a.priceBand), { semi: true }) : '')) +
        para('Introduction', a.story) + para('What makes it distinctive', a.distinctive) + para('Why JANEDORE', a.whyJanedore),
      ops.length || a.goals ? title('Sales and operations') + (ops.length ? rows(ops.map((r) => row(r[0], esc(r[1]), { semi: true })).join('')) : '') + para('Goals', a.goals) : '',
      (a.supportRequested ? title('Support requested') + rows(row('Areas', esc((a.supportAreas || []).join(', ')), { semi: true })) + para('Details', a.supportDetails) : ''),
      title('Their work') + (a.lookbookUrl ? rows(row('Lookbook', link(a.lookbookUrl), { semi: true })) : '') +
        (images.length ? '<div style="margin-top:8px;">' + images.map((u) => '<a href="' + esc(u) + '"><img src="' + esc(u) + '" width="120" height="120" alt="" style="width:120px;height:120px;object-fit:cover;margin:0 6px 6px 0;border:0;"></a>').join('') + '</div>' : ''),
      title('Contact') + rows(
        row('Name', esc(a.contactName) + (a.role ? ', ' + esc(a.role) : ''), { semi: true }) +
        row('Email', esc(a.email), { semi: true }) +
        row('Phone', esc(a.phone), { semi: true }))
    ],
    footerHtml: 'Reply to this email to contact ' + esc(a.contactName) + ' directly.<br>Reference ' + esc(a.reference)
  });
  const line = (label, value) => value ? '\n' + label + ': ' + value : '';
  const block = (label, value) => value ? '\n\n' + label + ':\n' + value : '';
  const text = 'New partner application: ' + a.brandName + ' (' + a.reference + ')\n' +
    line('Based in', a.location) + line('Founded', a.founded) + line('Website', a.website) + line('Social', a.social) + (ig ? '\nInstagram: @' + ig : '') +
    line('Primary category', a.primaryCategory || cats[0]) + (cats.length > 1 ? line('Categories', cats.join(', ')) : '') + line('Production', a.production) + line('Average price', a.priceBand) +
    block('Introduction', a.story) + block('What makes it distinctive', a.distinctive) + block('Why JANEDORE', a.whyJanedore) +
    ops.map((r) => line(r[0], r[1])).join('') + block('Goals', a.goals) +
    (a.supportRequested ? '\n\nSupport requested: ' + (a.supportAreas || []).join(', ') + (a.supportDetails ? '\n' + a.supportDetails : '') : '') +
    line('\nLookbook', a.lookbookUrl) + (images.length ? '\n\nImages:\n' + images.join('\n') : '') +
    '\n\nContact: ' + a.contactName + (a.role ? ', ' + a.role : '') + '\n' + a.email + '\n' + a.phone;
  return { subject: 'Partner application: ' + a.brandName + ' (' + a.reference + ')', html, text };
}

function partnerStatusUrl(a, ctx) {
  return ctx.siteUrl + '/pages/partner-application?ref=' + encodeURIComponent(a.reference);
}

const PARTNER_FOOTER = (a) => 'Questions about your application? Reply to this email and quote ' + esc(a.reference) + '.<br>Janedore · janedore.co.za';
const para = (html) => '<div style="font-size:14px;line-height:1.7;color:#555555;">' + html + '</div>';

function partnerApplicationReceived(a, ctx) {
  const first = String(a.contactName || '').split(' ')[0];
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Application received',
    preheader: 'Thank you for applying to partner with Janedore. Your reference is ' + a.reference + '.',
    bannerHtml: '<strong>Application received</strong>',
    cards: [
      para('Dear ' + esc(first) + ',<br><br>Thank you for your interest in partnering with JANEDORE. We have received the application for <strong style="color:#111111;">' + esc(a.brandName) +
        '</strong>.<br><br>Our partnerships team reviews every application carefully against our partnership criteria, and we will email you as soon as a decision has been made.'),
      title('Your application') + rows(
        row('Reference', esc(a.reference), { semi: true }) +
        row('Brand', esc(a.brandName), { semi: true }) +
        row('Categories', esc((a.categories || []).join(', ')), { semi: true })) +
        button('Check application status', partnerStatusUrl(a, ctx))
    ],
    footerHtml: PARTNER_FOOTER(a)
  });
  const text = 'Application received\n\nDear ' + first + ',\n\nThank you for your interest in partnering with JANEDORE. We have received the application for ' + a.brandName +
    '.\n\nOur partnerships team reviews every application carefully against our partnership criteria, and we will email you as soon as a decision has been made.\n\nReference: ' + a.reference +
    '\nCheck your application status: ' + partnerStatusUrl(a, ctx) + '\n\nQuestions? Reply to this email and quote ' + a.reference + '.';
  return { subject: 'Your JANEDORE partner application (' + a.reference + ')', html, text };
}

// Decision emails: accepted, conditional (Accepted with conditions), declined.
function partnerApplicationUpdate(a, ctx) {
  const first = String(a.contactName || '').split(' ')[0];
  const brand = esc(a.brandName);
  const note = a.decisionMessage ? '<div style="font-size:14px;line-height:1.7;color:#111111;white-space:pre-wrap;border-left:3px solid ' + GREEN + ';padding:4px 0 4px 14px;margin-top:16px;">' + esc(a.decisionMessage) + '</div>' : '';
  const conditions = (a.conditions || []);
  const copy = {
    accepted: {
      subject: 'Welcome to JANEDORE: your application has been accepted (' + a.reference + ')',
      banner: 'Your application has been accepted',
      body: 'Dear ' + esc(first) + ',<br><br>We are delighted to confirm that <strong style="color:#111111;">' + brand + '</strong> has been accepted as a JANEDORE brand partner.' +
        '<br><br>Your brand reflects the quality, design integrity and point of view we look for, and we look forward to presenting it to our customers.',
      next: 'A member of our partnerships team will be in touch shortly to agree commercial terms and begin onboarding, including setting up your brand page, your partner dashboard and your first product listings.',
      textBody: 'We are delighted to confirm that ' + a.brandName + ' has been accepted as a JANEDORE brand partner.\n\nYour brand reflects the quality, design integrity and point of view we look for, and we look forward to presenting it to our customers.'
    },
    conditional: {
      subject: 'Your JANEDORE application: accepted with conditions (' + a.reference + ')',
      banner: 'Accepted with conditions',
      body: 'Dear ' + esc(first) + ',<br><br>Thank you for your patience while we reviewed the application for <strong style="color:#111111;">' + brand + '</strong>.' +
        '<br><br>We see real potential in your brand and would like to welcome you to JANEDORE. Before we can move to onboarding, you will need to make the changes set out below, so that your brand is presented to the standard our customers expect.',
      next: 'These changes are required before we can begin onboarding. Once you have made them, reply to this email with an update, including any new photography or details, and our team will review it and confirm the next steps.',
      help: 'Need help making these changes? Please contact a member of our partnerships team by replying to this email or writing to support@janedore.co.za, quoting your reference ' + a.reference + '. We will get back to you to discuss how we can support you.',
      textBody: 'Thank you for your patience while we reviewed the application for ' + a.brandName + '.\n\nWe see real potential in your brand and would like to welcome you to JANEDORE. Before we can move to onboarding, you will need to make the changes set out below, so that your brand is presented to the standard our customers expect.'
    },
    declined: {
      subject: 'An update on your JANEDORE application (' + a.reference + ')',
      banner: 'An update on your application',
      body: 'Dear ' + esc(first) + ',<br><br>Thank you for applying to partner with JANEDORE, and for the time you took to share <strong style="color:#111111;">' + brand + '</strong> with us.' +
        '<br><br>After careful consideration, we are unable to offer a partnership at this time. We receive many strong applications and can only onboard a limited number of brands, so this decision is not always a reflection of the quality of your work.',
      next: 'As your brand grows, you are very welcome to apply again in the future. We wish you every success.',
      textBody: 'Thank you for applying to partner with JANEDORE, and for the time you took to share ' + a.brandName + ' with us.\n\nAfter careful consideration, we are unable to offer a partnership at this time. We receive many strong applications and can only onboard a limited number of brands, so this decision is not always a reflection of the quality of your work.'
    }
  }[a.status];
  const conditionsCard = a.status === 'conditional'
    ? title('Required changes') + '<ol style="margin:0;padding:0 0 0 20px;font-size:14px;line-height:1.7;color:#111111;">' + conditions.map((c) => '<li style="margin:0 0 8px;">' + esc(c) + '</li>').join('') + '</ol>'
    : '';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: copy.banner,
    preheader: copy.banner + ' (' + a.reference + ')',
    bannerHtml: '<strong>' + esc(copy.banner) + '</strong>',
    cards: [para(copy.body) + note]
      .concat(conditionsCard ? [conditionsCard] : [])
      .concat([title(a.status === 'declined' ? 'Looking ahead' : 'Next steps') + para(esc(copy.next)) +
        (copy.help ? '<div style="font-size:14px;line-height:1.7;color:#111111;background:' + GREEN_TINT + ';padding:14px 16px;margin-top:16px;"><strong>Need help?</strong> ' + esc(copy.help.replace(/^Need help making these changes\? /, '')) + '</div>' : '') +
        button('View application status', partnerStatusUrl(a, ctx))]),
    footerHtml: PARTNER_FOOTER(a)
  });
  const text = copy.banner + '\n\nDear ' + first + ',\n\n' + copy.textBody + (a.decisionMessage ? '\n\n' + a.decisionMessage : '') +
    (a.status === 'conditional' ? '\n\nRequired changes:\n' + conditions.map((c, i) => (i + 1) + '. ' + c).join('\n') : '') +
    '\n\n' + copy.next + (copy.help ? '\n\n' + copy.help : '') + '\n\nReference: ' + a.reference + '\nApplication status: ' + partnerStatusUrl(a, ctx) + '\n\nQuestions? Reply to this email and quote ' + a.reference + '.';
  return { subject: copy.subject, html, text };
}

// Abandoned bag reminder (server.js sweepBagReminders). One email, sent
// about 3 hours after the bag was last changed.
function bagReminder(items, ctx, links) {
  const total = items.reduce((a, i) => a + itemLine(i), 0);
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'You left something in your bag',
    preheader: 'Your pieces are still waiting for you. Complete your order while they are available.',
    bannerHtml: '<strong>You left something in your bag</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.7;color:#555555;">Your pieces are still waiting for you. Stock is limited and items are not reserved until your order is placed, so complete your order while they are still available.</div>',
      title('Your bag') + itemsBlock(items, ctx) +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eeeeee;margin-top:4px;"><tr>' +
        '<td style="padding-top:14px;font-size:15px;font-weight:700;color:#111111;">Subtotal</td>' +
        '<td align="right" style="padding-top:14px;font-size:15px;font-weight:700;color:#111111;">' + money(total) + '</td></tr></table>' +
        button('Return to your bag', links.bagUrl)
    ],
    footerHtml: 'Questions? Reply to this email or write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>' +
      '<a href="' + esc(links.stopUrl) + '" style="color:#888888;">Unsubscribe</a> · Janedore · janedore.co.za'
  });
  const text = 'You left something in your bag\n\nYour pieces are still waiting for you. Stock is limited and items are not reserved until your order is placed.\n\n' +
    items.map((i) => '- ' + (i.name || 'Item') + (i.brand ? ' (' + i.brand + ')' : '') + (i.size && i.size !== 'OS' ? ', size ' + i.size : '') + ', qty ' + (i.qty || 1) + ': ' + money(itemLine(i))).join('\n') +
    '\n\nSubtotal: ' + money(total) + '\n\nReturn to your bag: ' + links.bagUrl + '\n\nUnsubscribe: ' + links.stopUrl;
  return { subject: 'You left something in your bag', html, text };
}

// A few days after an order is delivered (server.js sweepReviewRequests):
// each item they haven't reviewed yet, with its own Write a review link
// (item.reviewUrl) that proves the purchase, so no sign-in is needed.
function reviewRequest(order, ctx, items, links) {
  const first = String(order.customerName || '').trim().split(/\s+/)[0];
  const hi = 'Hi' + (first ? ' ' + first : '') + ',';
  const intro = 'We hope you’re loving your pieces. Share your thoughts in a quick review. It helps other shoppers choose with confidence and helps our brands keep improving.';
  // links.reward: { value, minimumPurchase, days } (server.js REVIEW_REWARD).
  const r = links.reward;
  const offer = r ? 'Leave a review and receive ' + money(r.value) + ' off your next order.' : '';
  const terms = r ? 'Valid on orders of ' + money(r.minimumPurchase) + ' or more, within ' + r.days + ' days of issue. One code per order, for any honest review.' : '';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'How are you finding your order?',
    preheader: offer || 'Share your thoughts in a quick review.',
    bannerHtml: '<strong>How are you finding your order?</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.7;color:#555555;">' + esc(hi) + '<br><br>' + esc(intro) + '</div>' +
        (offer ? '<div style="font-size:15px;font-weight:700;line-height:1.5;color:#111111;margin-top:16px;">' + esc(offer) + '</div>' : ''),
      title('Your order') + items.map((item, i) =>
        '<div style="' + (i ? 'border-top:1px solid #eeeeee;padding-top:14px;margin-top:20px;' : '') + '">' +
          itemsBlock([item], ctx, { hidePrice: true }) + button('Write a review', item.reviewUrl) +
        '</div>').join('') +
        (terms ? '<div style="font-size:12px;line-height:1.6;color:#888888;margin-top:18px;">' + esc(terms) + '</div>' : '')
    ],
    footerHtml: 'You’re receiving this email because you ordered from Janedore. Questions? Write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>' +
      '<a href="' + esc(links.stopUrl) + '" style="color:#888888;">Don’t ask me for reviews</a> · Janedore · janedore.co.za'
  });
  const text = 'How are you finding your order?\n\n' + hi + '\n\n' + intro + (offer ? '\n\n' + offer : '') + '\n\n' +
    items.map((i) => '- ' + (i.name || 'Item') + (i.brand ? ' (' + i.brand + ')' : '') + ': ' + i.reviewUrl).join('\n') +
    (terms ? '\n\n' + terms : '') + '\n\nDon’t ask me for reviews: ' + links.stopUrl;
  return { subject: 'How are you finding your order?', html, text };
}

// After a review, once per order (server.js issueReviewReward): their
// personal code for the next order.
function reviewReward(order, ctx, reward) {
  const first = String(order.customerName || '').trim().split(/\s+/)[0];
  const hi = 'Hi' + (first ? ' ' + first : '') + ',';
  const intro = 'Thank you for your review. Here’s ' + money(reward.value) + ' off your next order.';
  const terms = 'Valid on orders of ' + money(reward.minimumPurchase) + ' or more until ' + reward.until + '. Single use, with this email address. Enter the code in your bag or at checkout.';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: 'Your ' + money(reward.value) + ' thank-you',
    preheader: intro,
    bannerHtml: '<strong>Your ' + money(reward.value) + ' thank-you</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.7;color:#555555;">' + esc(hi) + '<br><br>' + esc(intro) + '</div>' +
        '<div style="border:1px dashed #111111;padding:18px;text-align:center;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#111111;margin-top:20px;">' + esc(reward.code) + '</div>' +
        button('Start shopping', reward.shopUrl) +
        '<div style="font-size:12px;line-height:1.6;color:#888888;margin-top:18px;">' + esc(terms) + '</div>'
    ],
    footerHtml: 'Questions? Write to <a href="mailto:support@janedore.co.za" style="color:#888888;">support@janedore.co.za</a>.<br>Janedore · janedore.co.za'
  });
  const text = 'Your ' + money(reward.value) + ' thank-you\n\n' + hi + '\n\n' + intro + '\n\nYour code: ' + reward.code + '\n\n' + terms + '\n\nShop: ' + reward.shopUrl;
  return { subject: 'Your ' + money(reward.value) + ' thank-you', html, text };
}

// A waitlisted item is back in stock (waitlist-api.js). Sent once.
// item.preorder: a pre-order whose limit was reached has opened again.
function backInStock(item, ctx, links) {
  const what = [item.color && item.color !== 'Default' ? item.color : '', item.size && item.size !== 'OS' ? 'size ' + item.size : ''].filter(Boolean).join(', ');
  const heading = item.preorder ? 'Pre-orders open again' : 'Back in stock';
  const status = item.preorder ? 'is available to pre-order again' : 'is back in stock';
  const first = String((links && links.name) || '').trim().split(/\s+/)[0];
  const hi = 'Hi' + (first ? ' ' + first : '') + ', ';
  const intro = (item.name || 'the item you were waiting for') + (what ? ' in ' + what : '') + ' ' + status + '. Quantities are limited and cannot be reserved, so we recommend ordering soon.';
  const html = shell({
    logoUrl: ctx.logoUrl,
    logoFontUrl: ctx.logoFontUrl,
    title: heading,
    preheader: (item.name || 'Your item') + ' ' + status + '.',
    bannerHtml: '<strong>' + heading + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.7;color:#555555;">' + esc(hi + intro) + '</div>',
      title('Your waitlist item') + itemsBlock([item], ctx, { hidePrice: true }) + button('View item', links.productUrl)
    ],
    footerHtml: 'You’re receiving this email because you joined the waitlist for this item. This is a one-time notification.<br>Janedore · janedore.co.za'
  });
  const text = heading + '\n\n' + hi + intro + '\n\n' + (item.name || '') + (item.brand ? ' (' + item.brand + ')' : '') + (what ? ', ' + what : '') + '\n\nView item: ' + links.productUrl;
  return { subject: (item.name || 'Your item') + ' ' + status, html, text };
}

module.exports = { customerConfirmation, adminNewOrder, vendorNewOrder, readyForCollection, collectionLocked, shipped, adminShipped, statusUpdate, reportReceived, preorderDateChanged, refundStarted, refunded, returnRequested, returnForStaff, returnUpdate, exchangeRequested, exchangeForStaff, exchangeUpdate, contactForStaff, contactReceived, partnerApplicationForStaff, partnerApplicationReceived, partnerApplicationUpdate, bagReminder, backInStock, reviewRequest, reviewReward, money };
