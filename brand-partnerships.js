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

      <div class="bp-section">
        <h2 class="track-heading">The onboarding process</h2>
        <div class="bp-steps">
          ${step(1, 'Application', 'Submit an overview of your brand, including your product categories, price positioning and current sales channels.')}
          ${step(2, 'Review', 'Our partnerships team evaluates each application against our criteria and will contact shortlisted brands to discuss terms.')}
          ${step(3, 'Onboarding', 'Once terms are agreed, we work with you to build your brand page, list your collection and configure your partner dashboard.')}
          ${step(4, 'Launch', 'Your brand goes live on JANEDORE, with orders routed directly to your dashboard for fulfilment.')}
        </div>
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
