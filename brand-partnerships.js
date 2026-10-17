/* ============================================================
   BRAND PARTNERSHIPS: /pages/brand-partnerships (footer link)
   content-pages.js hands this slug to renderBrandPartnershipsPage()
   instead of a Firestore page. One journey: hero, proposition, what we
   look for, how it works, commercial terms, FAQ, then the application
   form itself (partner-application.js, which also submits it to
   /api/partner-applications). The hero image is set in admin > Pages >
   Brand Partnerships (pages/brand-partnerships.heroImageUrl); without
   one the hero is typographic. Featured brands only appear when real,
   active brands exist.

   Copy rule: say only what JANEDORE actually offers today. Commission
   rate, courier costs, payout timing and a review timeframe are not set
   yet, so they are described as agreed before onboarding.
   ============================================================ */

const BRAND_PARTNERSHIPS_SLUG = 'brand-partnerships';

const BP_CATEGORIES = ['Clothing', 'Kidswear', 'Jewellery', 'Bags', 'Footwear', 'Accessories', 'Homeware', 'Beauty', 'Fragrance and candles'];

const BP_FAQ = [
  ['Who can apply?', 'Independent brands that design their own products, from emerging labels to established names. Every application is assessed on its own merits.'],
  ['Which categories are considered?', 'Clothing and kidswear, jewellery, bags, footwear and accessories, homeware, beauty, and scent, including perfume and candles.'],
  ['Is there an application fee?', 'No. There is no fee to apply, and no listing or monthly fees. Commission on sales is agreed with each brand before onboarding.'],
  ['Does applying guarantee acceptance?', 'No. We work with a limited number of brands and review every application against the same criteria. Applying is the start of a conversation, not a commitment on either side.'],
  ['Who handles shipping and fulfilment?', 'Partners keep their own stock and ship orders from their own studio or warehouse, adding tracking for each order so the customer can follow it. Delivery costs and dispatch times are agreed before onboarding.'],
  ['Can I keep selling elsewhere?', 'Yes. Partnerships are non-exclusive, so you can continue selling through your own website, store and other stockists.'],
  ['Do you work with made-to-order brands?', 'Yes. Made-to-order pieces are sold as pre-orders with an estimated dispatch date, and shipped once they are ready.'],
  ['What happens after I apply?', 'You will receive a confirmation email with your reference. Our team reviews your application and emails you once a decision has been made. You can check your application status at any time using your reference.']
];

function partnershipFeaturedBrands() {
  const all = typeof getFeaturedBrands === 'function' ? getFeaturedBrands(S.vendors || []) : [];
  return all.filter(v => (!v.status || v.status === 'active') && v.heroImageUrl).slice(0, 2);
}

// Cloudinary delivery: right-sized, modern format.
function bpImageUrl(url, width) {
  return /res\.cloudinary\.com\/.+\/upload\//.test(url) ? url.replace('/upload/', '/upload/f_auto,q_auto,c_limit,w_' + width + '/') : url;
}

function bpScrollTo(id, instant) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
}

function renderBrandPartnershipsPage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;

  const head = (label, title, intro) => `
    <div class="bp-head">
      <div class="bp-kicker">${label}</div>
      <h2 class="bp-title">${title}</h2>
      ${intro ? `<p class="bp-intro">${intro}</p>` : ''}
    </div>`;

  const benefits = [
    ['An additional retail channel', 'Sell alongside your own website and stockists, through a storefront with secure checkout, order confirmations and customer care already in place.'],
    ['A considered setting for your work', 'A dedicated brand page for your story, imagery and collection, presented with the same care as everything else on JANEDORE.'],
    ['Another route to discovery', 'Your pieces appear across our collections, brand directory and search, where customers browse by category as well as by brand.'],
    ['Good company', 'A selection of independent brands chosen to complement one another, so your work is seen in the context it deserves.']
  ];

  const criteria = [
    ['Identity and originality', 'A clear point of view and products you design yourselves.'],
    ['Product quality and presentation', 'Considered materials, a high standard of finish, and photography that does the work justice.'],
    ['Relevance to our categories', 'Pieces that sit naturally within fashion, accessories, homeware, beauty or scent.'],
    ['Operational readiness', 'Accurate stock, reliable dispatch and the capacity to fulfil orders on time.'],
    ['Communication and service', 'Prompt, professional communication with our team and a shared care for the customer.']
  ];

  const steps = [
    ['Introduce your brand', 'Tell us who you are, what you make and why JANEDORE.'],
    ['We review your application', 'Our team assesses every brand against the same criteria.'],
    ['We discuss the details', 'Suitable brands talk through commercial and operational arrangements with us.'],
    ['Terms, then onboarding', 'Once both parties agree the terms, we set up your brand page and collection.']
  ];

  const terms = [
    ['Commission and fees', 'There are no application, listing or monthly fees. JANEDORE earns a commission on sales, agreed with each brand.'],
    ['Pricing and listings', 'Retail pricing and how your products are listed are agreed upfront. Partners manage products, stock and pre-orders in their partner dashboard.'],
    ['Inventory and fulfilment', 'You hold your own stock and ship orders from your studio or warehouse, adding tracking so the customer can follow each parcel.'],
    ['Shipping and delivery', 'Customers pay a delivery fee at checkout. How courier costs are handled and the dispatch times you commit to are agreed with each brand.'],
    ['Returns, refunds and service', 'Customers may request a return within 30 days of dispatch. You review each request, JANEDORE makes the final decision and processes refunds, and our Customer Care team handles customer queries.'],
    ['Payment schedules', 'When and how you are paid for your sales is agreed before onboarding.'],
    ['Brand assets and imagery', 'You supply product photography and brand assets to an agreed standard. How they are used on JANEDORE is part of the agreement.']
  ];

  const featured = partnershipFeaturedBrands();
  const featuredHtml = featured.length === 2 ? `
    <div class="bp-featured">
      <div class="bp-featured-label">Among the brands on JANEDORE</div>
      <div class="bp-featured-grid">${featured.map(v => {
        const name = v.name || v.brandName || v.brand || '';
        return `<a class="bp-featured-item" href="/brands/${encodeURIComponent(v.slug || v.id)}" onclick="event.preventDefault();navigateToVendor('${escapeJSString(v.slug || v.id)}')">
          <img src="${escapeHTML(bpImageUrl(v.heroImageUrl, 720))}" alt="${escapeHTML(name)}" loading="lazy" decoding="async">
          <span>${escapeHTML(name)}</span>
        </a>`;
      }).join('')}</div>
    </div>` : '';

  el.innerHTML = `
    <div class="bp">
      <section class="bp-hero" id="bp-hero" aria-labelledby="bp-hero-title">
        <div class="bp-hero-media" id="bp-hero-media" hidden></div>
        <div class="bp-hero-copy">
          <div class="bp-eyebrow">Brand Partnerships</div>
          <h1 class="bp-hero-title" id="bp-hero-title">A considered home for distinctive brands.</h1>
          <p class="bp-hero-text">JANEDORE brings together a selection of independent fashion, accessories, homeware and scent brands in one carefully edited retail destination. We are looking for brands with a point of view to join it.</p>
          <div class="bp-hero-actions">
            <button type="button" class="bp-btn" onclick="bpScrollTo('bp-apply')">Apply to partner</button>
            <button type="button" class="bp-link" onclick="bpScrollTo('bp-process')">How it works</button>
          </div>
        </div>
      </section>

      <section class="bp-section" aria-labelledby="bp-s1">
        <div class="bp-wrap">
          ${head('The proposition', '<span id="bp-s1">Why brands join JANEDORE</span>', 'A partnership is a second home for your work: a place where it is presented with care, alongside brands that share your standards.')}
          <div class="bp-benefits">
            ${benefits.map(([t, d]) => `<div class="bp-benefit"><h3>${t}</h3><p>${d}</p></div>`).join('')}
          </div>
          ${featuredHtml}
        </div>
      </section>

      <section class="bp-section bp-tint" aria-labelledby="bp-s2">
        <div class="bp-wrap">
          ${head('Selection', '<span id="bp-s2">What we look for</span>', 'Every application is considered individually. We welcome emerging and established brands alike; what matters is the work and how it is run.')}
          <dl class="bp-criteria">
            ${criteria.map(([t, d]) => `<div class="bp-criterion"><dt>${t}</dt><dd>${d}</dd></div>`).join('')}
          </dl>
          <div class="bp-scope">
            <div class="bp-scope-col">
              <h3>Categories we consider</h3>
              <p class="bp-cats">${BP_CATEGORIES.join('<span aria-hidden="true"> / </span>')}</p>
              <p>Made-to-order pieces are welcome and sold as pre-orders.</p>
            </div>
            <div class="bp-scope-col">
              <h3>What we do not take on</h3>
              <p>Dropshipping businesses, resellers of other brands, counterfeit or replica goods, and products outside our categories.</p>
            </div>
          </div>
          <p class="bp-note">Already selling well but your presentation is not quite there yet? You can still apply and tell us where you would like support. We take it into account when we review your application.</p>
        </div>
      </section>

      <section class="bp-section" id="bp-process" aria-labelledby="bp-s3">
        <div class="bp-wrap">
          ${head('The process', '<span id="bp-s3">How partnerships work</span>', '')}
          <ol class="bp-steps">
            ${steps.map(([t, d]) => `<li class="bp-step"><h3>${t}</h3><p>${d}</p></li>`).join('')}
          </ol>
        </div>
      </section>

      <section class="bp-section bp-tint" aria-labelledby="bp-s4">
        <div class="bp-wrap">
          ${head('Commercial terms', '<span id="bp-s4">Clear terms, agreed first</span>', 'The details of every partnership are discussed and agreed before it begins. These are the areas we cover with each brand.')}
          <dl class="bp-terms">
            ${terms.map(([t, d]) => `<div class="bp-term"><dt>${t}</dt><dd>${d}</dd></div>`).join('')}
          </dl>
          <p class="bp-note">Nothing is final until both parties have agreed the terms.</p>
        </div>
      </section>

      <section class="bp-section" aria-labelledby="bp-s5">
        <div class="bp-wrap bp-narrow">
          ${head('Questions', '<span id="bp-s5">Frequently asked</span>', '')}
          <div class="bp-faq">${BP_FAQ.map(([q, a]) => `<details class="bp-faq-item"><summary>${q}<span class="bp-faq-icon" aria-hidden="true"></span></summary><p>${a}</p></details>`).join('')}</div>
        </div>
      </section>

      <section class="bp-section bp-apply" id="bp-apply" aria-labelledby="bp-s6">
        <div class="bp-wrap bp-narrow">
          ${head('Apply', '<span id="bp-s6">Partner application</span>', 'Tell us about your brand. It takes around ten minutes. Fields marked * are required.')}
          <div id="pa-form-wrap">${typeof partnerFormHtml === 'function' ? partnerFormHtml() : ''}</div>
          <p class="bp-status-link">Already applied? <button type="button" class="bp-link" onclick="openPartnerStatusPage()">Check your application status</button></p>
        </div>
      </section>
    </div>`;

  if (typeof initPartnerForm === 'function') initPartnerForm();
  if (window._bpScrollToApply) { window._bpScrollToApply = false; setTimeout(() => bpScrollTo('bp-apply', true), 60); }

  db.collection('pages').doc(BRAND_PARTNERSHIPS_SLUG).get().then(doc => {
    const url = doc.exists && doc.data().heroImageUrl;
    const media = document.getElementById('bp-hero-media');
    if (!url || !media) return;
    media.innerHTML = `<img src="${escapeHTML(bpImageUrl(url, 1600))}" srcset="${escapeHTML(bpImageUrl(url, 800))} 800w, ${escapeHTML(bpImageUrl(url, 1600))} 1600w" sizes="(min-width: 900px) 55vw, 100vw" alt="" fetchpriority="high" decoding="async">`;
    media.hidden = false;
    document.getElementById('bp-hero').classList.add('has-image');
  }).catch(() => {});
}

// Kept for older links (the application form used to be its own page).
function applyForBrandPartnership() {
  bpScrollTo('bp-apply');
}

window.renderBrandPartnershipsPage = renderBrandPartnershipsPage;
window.applyForBrandPartnership = applyForBrandPartnership;
window.bpScrollTo = bpScrollTo;
