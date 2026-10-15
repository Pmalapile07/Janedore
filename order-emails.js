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

const GREEN = '#b8cc87';
const GREEN_TINT = '#e6edd5';
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

function deliveryWindow(order) {
  const ts = order.createdAt;
  const base = ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts ? new Date(ts) : new Date());
  const fmt = (days) => {
    const d = new Date(base); d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' });
  };
  return fmt(5) + ' and ' + fmt(9);
}

function addressLines(order) {
  return [
    order.shippingAddress,
    [order.city, order.province].filter(Boolean).join(', '),
    [order.postalCode, order.country].filter(Boolean).join(', ')
  ].filter(Boolean);
}

// ---------- building blocks ----------

function shell(opts) {
  // opts: { title, preheader, bannerHtml, cards: [html], footerHtml }
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<title>' + esc(opts.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f2f2f2;font-family:' + FONT + ';color:#111111;-webkit-font-smoothing:antialiased;">' +
    // Inbox preview line (hidden in the email itself).
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f2f2f2;">' + esc(opts.preheader || '') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;">' +
    '<tr><td align="center" style="padding:0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">' +
      '<tr><td style="background:#111111;padding:22px 24px;">' +
        // Logo image from admin > Content when set; email apps can't load
        // the site's Unbounded font, so text is only the fallback.
        (opts.logoUrl
          ? '<img src="' + esc(opts.logoUrl) + '" alt="JANEDORE" height="22" style="display:block;height:22px;width:auto;border:0;">'
          : '<span style="font-family:' + FONT + ';font-size:16px;letter-spacing:0.22em;color:#ffffff;text-transform:uppercase;">Janedore</span>') +
      '</td></tr>' +
      (opts.bannerHtml ? '<tr><td style="background:' + GREEN_TINT + ';padding:16px 24px;font-size:14px;line-height:1.5;color:#111111;">' + opts.bannerHtml + '</td></tr>' : '') +
      '<tr><td style="padding:16px;">' +
        opts.cards.map(c => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;margin:0 0 16px;"><tr><td style="padding:20px;">' + c + '</td></tr></table>').join('') +
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
        (opts.hidePrice ? '' : '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:8px;">' + money(itemLine(item)) + '</div>') +
      '</td></tr></table>';
  }).join('');
}

function totalsBlock(order, headLabel) {
  const discount = Number(order.discountAmount) || 0;
  return rows(
    row(headLabel || 'Total paid', money(order.total), { big: true, bold: true }) +
    divider() +
    row('Cart Total', money(order.subtotal)) +
    (discount > 0 ? row('Discount' + (order.discountCode ? ' (' + esc(order.discountCode) + ')' : ''), '-' + money(discount), { color: GREEN, semi: true }) : '') +
    row('Delivery Fee', Number(order.shipping) ? money(order.shipping) : 'Free')
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
  return 'Cart Total: ' + money(order.subtotal) +
    (discount > 0 ? '\nDiscount' + (order.discountCode ? ' (' + order.discountCode + ')' : '') + ': -' + money(discount) : '') +
    '\nDelivery Fee: ' + (Number(order.shipping) ? money(order.shipping) : 'Free') +
    '\nTotal: ' + money(order.total);
}

function textItems(items, hidePrice) {
  return items.map(i => '- ' + (i.name || 'Item') + (i.brand ? ' (' + i.brand + ')' : '') +
    (i.color && i.color !== 'Default' ? ', ' + i.color : '') + (sizeOf(i) ? ', size ' + sizeOf(i) : '') +
    ' x' + (Number(i.qty) || 1) + (hidePrice ? '' : ', ' + money(itemLine(i)))).join('\n');
}

// ---------- the emails ----------

function customerConfirmation(order, ctx) {
  const items = order.items || [];
  const count = items.reduce((a, i) => a + (Number(i.qty) || 1), 0);
  const brands = [...new Set(items.map(i => i.brand).filter(Boolean))];
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || 'there';
  const num = order.orderNumber || '';

  const thanks =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 4px;">' +
      '<div style="width:56px;height:56px;line-height:56px;border-radius:28px;background:' + GREEN + ';color:#111111;font-size:28px;text-align:center;margin:0 auto 16px;">&#10003;</div>' +
      '<div style="font-size:22px;font-weight:700;line-height:1.3;color:#111111;">Thank you, ' + esc(first) + '</div>' +
      '<div style="font-size:14px;line-height:1.5;color:#555555;margin:8px auto 0;max-width:380px;">Your payment went through and your order is in. We\'ll email you again when it\'s on its way.</div>' +
      '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:20px;">Order #' + esc(num) + '</div>' +
      '<div style="font-size:13px;color:#777777;margin-top:4px;">' + esc(orderDate(order)) + '</div>' +
    '</td></tr></table>';

  const status = title('Order status') + rows(
    row('Payment', '<span style="color:#2e8b57;">&#9679;</span> Confirmed', { semi: true }) +
    row('Estimated delivery', esc(deliveryWindow(order)), { semi: true })
  ) + (brands.length > 1
    ? '<div style="font-size:12px;color:#777777;margin-top:10px;line-height:1.5;">Your order ships in ' + brands.length + ' packages, one from each brand, so they may arrive on different days.</div>'
    : '');

  const html = shell({
    logoUrl: ctx.logoUrl,
    title: 'Order confirmed',
    preheader: 'Order #' + num + ' is confirmed: ' + money(order.total) + '.',
    cards: [
      thanks,
      status,
      title('Your items', '(' + count + ')') + itemsBlock(items, ctx),
      title('Delivery details') + addressBlock(order),
      totalsBlock(order, 'Total paid') + button('Shop New Arrivals', ctx.siteUrl + '/shop')
    ],
    footerHtml: SUPPORT_FOOTER
  });

  const text = 'Thank you, ' + first + '. Your order is confirmed.\n\nOrder #' + num + ' · ' + orderDate(order) +
    '\nEstimated delivery: ' + deliveryWindow(order) + '\n\n' + textItems(items) + '\n\n' + textTotals(order) +
    '\n\nDelivering to:\n' + [order.customerName].concat(addressLines(order)).join('\n') +
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
    (order.needsAttention ? '<br><span style="color:#b3261e;font-weight:700;">Needs attention: ' + esc(order.needsAttention) + '</span>' : '');

  const brandsCard = title('Brands on this order') + rows(Object.keys(byBrand).map(b =>
    row(esc(b), byBrand[b] + (byBrand[b] === 1 ? ' item' : ' items'))).join('')) +
    (ctx.vendorEmailNote ? '<div style="font-size:12px;color:#777777;margin-top:10px;line-height:1.5;">' + ctx.vendorEmailNote + '</div>' : '');

  const html = shell({
    logoUrl: ctx.logoUrl,
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

function vendorNewOrder(order, ctx, vendor, items) {
  const count = items.reduce((a, i) => a + (Number(i.qty) || 1), 0);
  const value = items.reduce((a, i) => a + itemLine(i), 0);
  const num = order.orderNumber || '';
  const brandName = vendor.brand || vendor.name || 'your brand';

  const html = shell({
    logoUrl: ctx.logoUrl,
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

function shipped(order, ctx, items, opts) {
  opts = opts || {};
  const num = order.orderNumber || '';
  const first = String(order.customerName || '').trim().split(/\s+/)[0] || 'there';
  const intro = opts.complete
    ? 'Good news: everything in your order is now on its way.'
    : 'Good news: part of your order is now on its way. The rest follows separately, as each brand ships from its own warehouse.';
  const tracking = opts.tracking || {};
  const trackingCard = tracking.trackingNumber
    ? title('Tracking') + rows(
        (tracking.courier ? row('Courier', esc(tracking.courier), { semi: true }) : '') +
        row('Tracking number', esc(tracking.trackingNumber), { semi: true }))
    : '';

  const html = shell({
    logoUrl: ctx.logoUrl,
    title: opts.heading || 'Your order is on its way',
    preheader: intro,
    bannerHtml: '<strong>' + esc(opts.heading || 'Your order is on its way') + '</strong>',
    cards: [
      '<div style="font-size:14px;line-height:1.6;color:#555555;">Hi ' + esc(first) + ', ' + intro + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#111111;margin-top:14px;">Order #' + esc(num) + '</div>',
      trackingCard,
      title('On its way') + itemsBlock(items, ctx, { hidePrice: true }),
      title('Delivering to') + addressBlock(order)
    ].filter(Boolean),
    footerHtml: SUPPORT_FOOTER
  });

  const text = (opts.heading || 'Your order is on its way') + '\n\nHi ' + first + ', ' + intro + '\n\n' + textItems(items, true) +
    (tracking.trackingNumber ? '\n\n' + (tracking.courier ? tracking.courier + ': ' : '') + tracking.trackingNumber : '') +
    '\n\nOrder #' + num + '\n\nQuestions? support@janedore.co.za';

  return { subject: (opts.heading || 'Your order is on its way') + ' (order #' + num + ')', html, text };
}

module.exports = { customerConfirmation, adminNewOrder, vendorNewOrder, shipped, money };
