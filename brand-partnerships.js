/* ============================================================
   BRAND PARTNERSHIPS — /pages/brand-partnerships (footer link)
   content-pages.js hands this slug to renderBrandPartnershipsPage()
   instead of a Firestore page. The hero image is set in admin > Pages
   > Brand Partnerships (pages/brand-partnerships.heroImageUrl); the
   copy lives here. Two featured brands come from the live brand list
   (S.vendors), preferring ones with a cover image; grey placeholders
   show until brands exist. Apply to Partner opens
   /pages/partner-application (partner-application.js).
   ============================================================ */

const BRAND_PARTNERSHIPS_SLUG = 'brand-partnerships';

// Brand Partnerships FAQ. Delivery costs and payouts are still being
// decided, so those answers stay neutral until they are.
const BP_FAQ = [
  ['Who can apply?', 'Independent brands that design their own products in our categories: clothing, kidswear, accessories, jewellery, bags, footwear, beauty, fragrance and homeware. We do not accept dropshipping businesses, resellers of other brands, or counterfeit and replica goods.'],
  ['Is there a fee to join?', 'No. There are no sign-up, listing or monthly fees to partner with JANEDORE. We only earn when you make a sale.'],
  ['Can I keep selling on my own website and elsewhere?', 'Yes. Partnerships with JANEDORE are non-exclusive, so you are free to continue selling through your own website, social media, store and other stockists.'],
  ['Do you work with made-to-order brands?', 'Yes. Made-to-order products are sold on JANEDORE as pre-orders. You set an estimated dispatch date for each product, customers pay in full at checkout, and pre-orders are shipped separately once they are ready.'],
  ['Who ships the orders?', 'You do. Orders for your products appear in your partner dashboard, and you pack and ship them from your own studio or warehouse. Once you add the tracking number, the customer is notified and can follow their parcel.'],
  ['Who pays for delivery?', 'Customers pay a delivery fee at checkout. How courier costs are handled between JANEDORE and your brand is confirmed with each brand during onboarding.'],
  ['How are payments handled?', 'Customers pay JANEDORE securely at checkout. Payout terms, including timing, are confirmed with each brand during onboarding.'],
  ['How do returns work?', 'Customers can request a return within 30 days of dispatch, with photos and a reason. You are notified and can accept or dispute each request, and JANEDORE makes the final decision and manages the refund.'],
  ['Who looks after customer service?', 'JANEDORE Customer Care handles customer queries, order tracking and returns on your behalf, and we involve your team whenever your input is needed.'],
  ['My brand does not yet meet your standards. Can I still apply?', 'Yes. If you already have customers and sales but need help with photography, packaging, branding or fulfilment, you can request support in your application, and we will take this into account when reviewing it.'],
  ['How will I know the outcome of my application?', 'You will receive an email confirming your application, and another once a decision has been made. You can also check your application status at any time using your reference and email address.'],
  ['Can I apply again if my application is declined?', 'Yes. As your brand grows, you are very welcome to apply again in the future.']
];

function partnershipFeaturedBrands() {
  const all = typeof getFeaturedBrands === 'function' ? getFeaturedBrands(S.vendors || []) : [];
  const live = all.filter(v => !v.status || v.status === 'active');
  return live.slice().sort((a, b) => (b.heroImageUrl ? 1 : 0) - (a.heroImageUrl ? 1 : 0)).slice(0, 2);
}

function partnershipBrandCardHtml(v) {
  if (!v) {
    return `<div class="bp-brand is-placeholder"><div class="bp-brand-img"><span class="shop-brand-placeholder-label">Brand</span></div>
      <div class="bp-brand-name">Brand name</div><div class="bp-brand-desc">A short introduction to the brand.</div></div>`;
  }
  const name = v.name || v.brandName || v.brand || '';
  const img = v.heroImageUrl || v.logoUrl;
  const desc = String(v.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const short = desc.length > 140 ? desc.slice(0, 137).replace(/\s+\S*$/, '') + '…' : desc;
  const go = `navigateToVendor('${escapeJSString(v.slug || v.id)}')`;
  return `<div class="bp-brand" onclick="${go}">
    <div class="bp-brand-img"${img ? ` style="background-image:url('${escapeForCssUrl(img)}')"` : ''}>${v.logoUrl && v.heroImageUrl ? `<img src="${escapeHTML(v.logoUrl)}" alt="" class="shop-brand-logo">` : ''}</div>
    <div class="bp-brand-name">${escapeHTML(name)}</div>
    ${short ? `<div class="bp-brand-desc">${escapeHTML(short)}</div>` : ''}
    <span class="bp-brand-link">Discover ${escapeHTML(name)}</span>
  </div>`;
}

function renderBrandPartnershipsPage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const featured = partnershipFeaturedBrands();
  const cards = [featured[0], featured[1]].map(partnershipBrandCardHtml).join('');
  const pillar = (icon, title, text) => `<div class="bp-benefit">
      <span class="care-option-icon"><i class="ph ${icon}" aria-hidden="true"></i></span>
      <div><div class="bp-benefit-title">${title}</div><p class="bp-text">${text}</p></div>
    </div>`;
  const step = (n, title, text) => `<div class="bp-step"><span class="bp-step-num">${n}</span><div><div class="bp-benefit-title">${title}</div><p class="bp-text">${text}</p></div></div>`;

  el.innerHTML = `
    <div class="bp-hero" id="bp-hero">
      <div class="bp-hero-inner">
        <div class="bp-eyebrow">Brand Partnerships</div>
        <h1 class="bp-hero-title">A curated platform for independent brands</h1>
        <p class="bp-hero-text">Partner with JANEDORE to reach a discerning, design-led audience through a premium multi-brand storefront.</p>
      </div>
    </div>

    <section class="bp-page">
      <div class="bp-section bp-first">
        <h2 class="track-heading">The JANEDORE proposition</h2>
        <p class="bp-lead">JANEDORE is a curated multi-brand retail platform for independent fashion, accessories, fragrance and lifestyle labels. We combine the reach and infrastructure of a destination storefront with the editorial standards of a boutique, giving emerging and established brands a considered environment in which to grow.</p>
        <p class="bp-text">Our model is built on selective partnership. Rather than listing brands at volume, we onboard a limited number of labels whose product quality, design integrity and brand narrative align with our positioning. This keeps our assortment focused, protects the perceived value of every brand we carry and ensures each partner receives meaningful visibility.</p>
        <p class="bp-text">For our customers, JANEDORE is a trusted point of discovery. For our partners, it is a premium sales channel that complements, rather than competes with, their existing direct-to-consumer and wholesale strategies.</p>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">Our brands</h2>
        <p class="bp-text">Our portfolio brings together labels with a distinct point of view. Each partner retains full ownership of its identity, from creative direction to product development, while benefiting from shared commerce infrastructure and a collective audience.</p>
        <div class="bp-brands">${cards}</div>
        <span class="track-link bp-all" onclick="navigateTo('brands')">View all brands</span>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">The value of partnership</h2>
        <p class="bp-text">A JANEDORE partnership is designed to strengthen your brand equity, expand your market reach and reduce the operational burden of selling online.</p>
        <div class="bp-benefits">
          ${pillar('ph-storefront', 'Brand equity and positioning', 'A dedicated brand page presents your identity, campaign imagery and narrative within a curated, premium environment that reinforces your positioning rather than diluting it.')}
          ${pillar('ph-users-three', 'Customer acquisition', 'Gain access to a growing audience actively seeking independent labels, with visibility across our collections, editorial features and brand discovery, extending your reach beyond your existing channels.')}
          ${pillar('ph-credit-card', 'Commerce infrastructure', 'JANEDORE manages the storefront, secure payment processing, order communications, customer care and a structured returns process, reducing your operational overhead so your team can focus on product and growth.')}
          ${pillar('ph-package', 'Operational control', 'Through a dedicated partner dashboard, you manage product listings, inventory and pre-orders, and fulfil orders directly from your own studio or warehouse, with tracking information shared with the customer.')}
        </div>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">Partnership criteria</h2>
        <p class="bp-text">Every application is reviewed by our team against a consistent set of criteria. We look for brands that demonstrate:</p>
        <ul class="bp-list">
          <li><strong>Product quality.</strong> Considered materials, sound construction and a high standard of finish.</li>
          <li><strong>A distinctive point of view.</strong> A clear design language and a brand story that resonates with a discerning customer.</li>
          <li><strong>Strong brand presentation.</strong> Professional product photography and a cohesive visual identity.</li>
          <li><strong>Operational readiness.</strong> The capacity to maintain accurate inventory and fulfil orders reliably and on time.</li>
        </ul>
      </div>

      <div class="bp-section" id="bp-carry">
        <h2 class="track-heading">What we carry</h2>
        <p class="bp-text">JANEDORE is a fashion and lifestyle destination. We partner with brands that design their own products in the following categories:</p>
        <div class="bp-tags">${['Clothing', 'Kidswear', 'Accessories', 'Jewellery', 'Bags', 'Footwear', 'Beauty', 'Fragrance', 'Homeware'].map(c => `<span>${c}</span>`).join('')}</div>
        <p class="bp-text"><strong>Made to order.</strong> Brands that make their products to order are welcome. These products are sold on JANEDORE as pre-orders, with a clear estimated dispatch date for the customer.</p>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">What we do not accept</h2>
        <p class="bp-text">To protect our customers and the brands we work with, applications from the following will not be considered:</p>
        <ul class="bp-list bp-list-no">
          <li><strong>Dropshipping.</strong> Businesses that sell products sourced from third-party suppliers and shipped directly to the customer.</li>
          <li><strong>Resellers.</strong> Businesses selling products designed by other brands. We partner directly with the brand that creates the product.</li>
          <li><strong>Counterfeit and replica goods.</strong> Copies of, or products closely imitating, another brand’s designs or trademarks.</li>
          <li><strong>Products outside our categories.</strong> Including food and drink, alcohol, tobacco and vaping products, supplements and medicines, electronics, and adult products.</li>
        </ul>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">Support for growing brands</h2>
        <p class="bp-text">Some of the brands we admire most already have a loyal customer base and strong sales, but their presentation is not yet at the standard of our platform. If that sounds like your brand, you are still welcome to apply.</p>
        <p class="bp-text">In your application, tell us where you would like support, whether that is product photography, packaging, brand identity or fulfilment. Our team will take this into account when reviewing your application, and where we see the potential, we will work with you on the changes needed to join JANEDORE.</p>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">The onboarding process</h2>
        <div class="bp-steps">
          ${step(1, 'Application', 'Submit an overview of your brand, including your product categories, price positioning and current sales channels.')}
          ${step(2, 'Review', 'Our partnerships team evaluates each application against our criteria and will contact shortlisted brands to discuss terms.')}
          ${step(3, 'Onboarding', 'Once terms are agreed, we work with you to build your brand page, list your collection and configure your partner dashboard.')}
          ${step(4, 'Launch', 'Your brand goes live on JANEDORE, with orders routed directly to your dashboard for fulfilment.')}
        </div>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">Frequently asked questions</h2>
        <div class="bp-faq">${BP_FAQ.map(([q, a]) => `<details class="bp-faq-item"><summary>${q}<span class="bp-faq-icon" aria-hidden="true"></span></summary><p class="bp-text">${a}</p></details>`).join('')}</div>
      </div>

      <div class="bp-cta">
        <h2 class="bp-cta-title">Partner with JANEDORE</h2>
        <p class="bp-cta-text">We welcome applications from independent brands that share our commitment to quality and considered design. Submit your application and a member of our partnerships team will be in touch.</p>
        <button type="button" class="bp-cta-btn" onclick="applyForBrandPartnership()">Apply to Partner</button>
      </div>
    </section>`;

  db.collection('pages').doc(BRAND_PARTNERSHIPS_SLUG).get().then(doc => {
    const url = doc.exists && doc.data().heroImageUrl;
    const hero = document.getElementById('bp-hero');
    if (url && hero) { hero.style.backgroundImage = `url('${escapeForCssUrl(url)}')`; hero.classList.add('has-image'); }
  }).catch(() => {});
}

// Opens the Partner Application form (partner-application.js).
function applyForBrandPartnership() {
  navigateToContentPage('partner-application');
}

window.renderBrandPartnershipsPage = renderBrandPartnershipsPage;
window.applyForBrandPartnership = applyForBrandPartnership;
