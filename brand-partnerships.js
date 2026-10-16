/* ============================================================
   BRAND PARTNERSHIPS — /pages/brand-partnerships (footer link)
   content-pages.js hands this slug to renderBrandPartnershipsPage()
   instead of a Firestore page. Two featured brands come from the live
   brand list (S.vendors), preferring ones with a cover image; grey
   placeholders show until brands exist. The Apply button has no
   destination yet (applyForBrandPartnership()).
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
      <div class="bp-brand-name">Brand name</div><div class="bp-brand-desc">A short line about the brand.</div></div>`;
  }
  const name = v.name || v.brandName || v.brand || '';
  const img = v.heroImageUrl || v.logoUrl;
  const desc = String(v.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const short = desc.length > 120 ? desc.slice(0, 117).replace(/\s+\S*$/, '') + '…' : desc;
  const go = `navigateToVendor('${escapeJSString(v.slug || v.id)}')`;
  return `<div class="bp-brand" onclick="${go}">
    <div class="bp-brand-img"${img ? ` style="background-image:url('${escapeForCssUrl(img)}')"` : ''}>${v.logoUrl && v.heroImageUrl ? `<img src="${escapeHTML(v.logoUrl)}" alt="" class="shop-brand-logo">` : ''}</div>
    <div class="bp-brand-name">${escapeHTML(name)}</div>
    ${short ? `<div class="bp-brand-desc">${escapeHTML(short)}</div>` : ''}
    <span class="bp-brand-link">Visit ${escapeHTML(name)}</span>
  </div>`;
}

function renderBrandPartnershipsPage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const featured = partnershipFeaturedBrands();
  const cards = [featured[0], featured[1]].map(partnershipBrandCardHtml).join('');
  const benefit = (icon, title, text) => `<div class="bp-benefit">
      <span class="care-option-icon"><i class="ph ${icon}" aria-hidden="true"></i></span>
      <div><div class="bp-benefit-title">${title}</div><p class="bp-text">${text}</p></div>
    </div>`;
  const step = (n, title, text) => `<div class="bp-step"><span class="bp-step-num">${n}</span><div><div class="bp-benefit-title">${title}</div><p class="bp-text">${text}</p></div></div>`;

  el.innerHTML = `
    <section class="bp-page">
      <div class="bp-hero">
        <div class="bp-eyebrow">Brand Partnerships</div>
        <h1 class="track-title">Independent brands, one destination</h1>
        <p class="bp-lead">JANEDORE brings together independent fashion and lifestyle brands we believe in. Each one is chosen for its design, its quality and the story behind it, and each has its own space to tell that story.</p>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">Our brands</h2>
        <p class="bp-text">From considered everyday pieces to statement accessories, our brands are built by people who care about how things are made. Here are two of them.</p>
        <div class="bp-brands">${cards}</div>
        <span class="track-link bp-all" onclick="navigateTo('brands')">See all brands</span>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">Why partner with JANEDORE</h2>
        <div class="bp-benefits">
          ${benefit('ph-storefront', 'Your own brand page', 'A dedicated page for your brand, with your logo, cover image and story, alongside your full collection.')}
          ${benefit('ph-users-three', 'Reach new customers', 'Be discovered by shoppers looking for independent brands, through our collections, edits and Shop by Brand.')}
          ${benefit('ph-credit-card', 'We take care of checkout', 'Secure payments, order confirmations and Customer Care are handled by JANEDORE, so you can focus on your product.')}
          ${benefit('ph-package', 'You stay in control', 'Manage your products, stock and pre-orders, and add tracking to your orders, from your own brand dashboard. You ship from your own studio or warehouse.')}
        </div>
      </div>

      <div class="bp-section">
        <h2 class="track-heading">How it works</h2>
        <div class="bp-steps">
          ${step(1, 'Apply', 'Tell us about your brand, what you make and where you are based.')}
          ${step(2, 'We get to know you', 'Our team reviews every application and will be in touch to talk it through.')}
          ${step(3, 'Set up your brand', 'Once approved, we help you set up your brand page and add your collection.')}
          ${step(4, 'Start selling', 'Your brand goes live on JANEDORE, and orders come straight to your dashboard.')}
        </div>
      </div>

      <div class="bp-cta">
        <h2 class="bp-cta-title">Become a JANEDORE brand</h2>
        <p class="bp-cta-text">If your brand would be at home on JANEDORE, we would love to hear from you.</p>
        <button type="button" class="bp-cta-btn" onclick="applyForBrandPartnership()">Apply to Join</button>
      </div>
    </section>`;
}

// Destination still to be decided (an application form, email, etc.).
function applyForBrandPartnership() {
  if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Applications open soon');
}

window.renderBrandPartnershipsPage = renderBrandPartnershipsPage;
window.applyForBrandPartnership = applyForBrandPartnership;
