/* ============================================================
   BRAND PARTNERSHIPS: /pages/brand-partnerships (footer link)
   content-pages.js hands this slug to renderBrandPartnershipsPage()
   instead of a Firestore page. Kept deliberately short: hero, what we
   look for, how it works, a few questions, then the application form
   itself (partner-application.js, which also submits it to
   /api/partner-applications). The hero image, hero video and the
   selection image are set in admin > Pages > Brand Partnerships
   (pages/brand-partnerships); without them the page is typographic.

   Copy rule: say only what JANEDORE actually offers today. Commission
   rate, courier costs, payout timing and a review timeframe are not set
   yet, so they are described as agreed before onboarding.
   ============================================================ */

const BRAND_PARTNERSHIPS_SLUG = 'brand-partnerships';

const BP_CATEGORIES = ['clothing', 'kidswear', 'jewellery', 'bags', 'footwear', 'accessories', 'homeware', 'beauty', 'fragrance and candles'];

const BP_FAQ = [
  ['Is there a fee?', 'No. There is no fee to apply and no listing or monthly fees. We earn a commission on sales, agreed with each brand before onboarding.'],
  ['Who handles shipping?', 'You keep your own stock and ship each order with tracking. Delivery terms are agreed before onboarding.'],
  ['Can I keep selling elsewhere?', 'Yes. Partnerships are non-exclusive.'],
  ['Do you work with made-to-order brands?', 'Yes. Made-to-order pieces are sold as pre-orders.'],
  ['What happens after I apply?', 'You will receive a confirmation email with your reference, and we will email you once a decision has been made. Acceptance is not guaranteed.']
];

// Cloudinary delivery: right-sized, modern format.
function bpImageUrl(url, width) {
  return /res\.cloudinary\.com\/.+\/upload\//.test(url) ? url.replace('/upload/', '/upload/f_auto,q_auto,c_limit,w_' + width + '/') : url;
}

// Cloudinary video delivery: 1280 wide, compressed, no audio, MP4; or
// its first frame as the poster.
function bpCloudinaryVideo(url) {
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url);
}
function bpVideoUrl(url, poster) {
  const t = poster ? 'so_0,f_jpg,q_auto,w_1600,c_limit' : 'q_auto,w_1280,c_limit,ac_none';
  return url.replace('/video/upload/', '/video/upload/' + t + '/').replace(/\.[a-z0-9]+$/i, poster ? '.jpg' : '.mp4');
}

function bpToggleHeroVideo() {
  const v = document.querySelector('#bp-hero-media video');
  const btn = document.getElementById('bp-hero-pause');
  if (!v || !btn) return;
  if (v.paused) v.play().catch(() => {}); else v.pause();
  btn.classList.toggle('is-paused', v.paused);
  btn.setAttribute('aria-label', v.paused ? 'Play background video' : 'Pause background video');
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

  const criteria = [
    ['Originality', 'Products you design yourselves, with a clear point of view.'],
    ['Quality', 'Considered materials, a high standard of finish and strong photography.'],
    ['Reliability', 'Accurate stock and orders dispatched on time.'],
    ['Communication', 'Prompt, professional and caring towards customers.']
  ];

  const steps = [
    ['Apply', 'Tell us about your brand below.'],
    ['Review', 'We assess every application individually.'],
    ['Agree terms', 'Suitable brands agree terms with us.'],
    ['Onboard', 'We set up your brand page and collection.']
  ];

  el.innerHTML = `
    <div class="bp">
      <section class="bp-hero" id="bp-hero" aria-labelledby="bp-hero-title">
        <div class="bp-hero-media" id="bp-hero-media" hidden></div>
        <button type="button" class="bp-hero-pause" id="bp-hero-pause" hidden aria-label="Pause background video" onclick="bpToggleHeroVideo()"><span aria-hidden="true"></span></button>
        <div class="bp-hero-copy">
          <div class="bp-eyebrow">Brand Partnerships</div>
          <h1 class="bp-hero-title" id="bp-hero-title">A considered home for distinctive brands.</h1>
          <p class="bp-hero-text">We work with a small selection of independent brands. If yours has a point of view, we would like to hear from you.</p>
          <div class="bp-hero-actions">
            <button type="button" class="bp-btn" onclick="bpScrollTo('bp-apply')">Apply to partner</button>
          </div>
        </div>
      </section>

      <section class="bp-section bp-tint" aria-labelledby="bp-s2">
        <div class="bp-wrap">
          ${head('Selection', '<span id="bp-s2">What we look for</span>', 'Emerging or established, every brand is considered individually.')}
          <div class="bp-figure" id="bp-img-selectionImageUrl" hidden></div>
          <dl class="bp-criteria">
            ${criteria.map(([t, d]) => `<div class="bp-criterion"><dt>${t}</dt><dd>${d}</dd></div>`).join('')}
          </dl>
          <p class="bp-scope-line"><strong>Categories:</strong> ${BP_CATEGORIES.join(', ').replace(/^./, c => c.toUpperCase())}.</p>
          <p class="bp-scope-line"><strong>Not accepted:</strong> dropshipping, resellers, counterfeit or replica goods.</p>
        </div>
      </section>

      <section class="bp-section" id="bp-process" aria-labelledby="bp-s3">
        <div class="bp-wrap">
          ${head('The process', '<span id="bp-s3">How it works</span>', '')}
          <ol class="bp-steps">
            ${steps.map(([t, d]) => `<li class="bp-step"><h3>${t}</h3><p>${d}</p></li>`).join('')}
          </ol>
        </div>
      </section>

      <section class="bp-section bp-apply" id="bp-apply" aria-labelledby="bp-s6">
        <div class="bp-wrap bp-narrow">
          ${head('Questions', '<span id="bp-s5">Before you apply</span>', '')}
          <div class="bp-faq">${BP_FAQ.map(([q, a]) => `<details class="bp-faq-item"><summary>${q}<span class="bp-faq-icon" aria-hidden="true"></span></summary><p>${a}</p></details>`).join('')}</div>
          <div class="bp-apply-head">
            ${head('Apply', '<span id="bp-s6">Partner application</span>', 'Fields marked * are required.')}
          </div>
          <div id="pa-form-wrap">${typeof partnerFormHtml === 'function' ? partnerFormHtml() : ''}</div>
          <p class="bp-status-link">Already applied? <button type="button" class="bp-link" onclick="openPartnerStatusPage()">Check your application status</button></p>
        </div>
      </section>
    </div>`;

  if (typeof initPartnerForm === 'function') initPartnerForm();
  if (window._bpScrollToApply) { window._bpScrollToApply = false; setTimeout(() => bpScrollTo('bp-apply', true), 60); }

  db.collection('pages').doc(BRAND_PARTNERSHIPS_SLUG).get().then(doc => {
    const data = (doc.exists && doc.data()) || {};
    const url = data.heroImageUrl;
    const media = document.getElementById('bp-hero-media');
    const hero = document.getElementById('bp-hero');
    if (data.heroVideoUrl && media && bpCloudinaryVideo(data.heroVideoUrl)) {
      // Muted background loop. Reduced motion or data saver: still frame only.
      const poster = url ? bpImageUrl(url, 1600) : bpVideoUrl(data.heroVideoUrl, 'poster');
      const still = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.connection && navigator.connection.saveData);
      media.innerHTML = still
        ? `<img src="${escapeHTML(poster)}" alt="" fetchpriority="high" decoding="async">`
        : `<video src="${escapeHTML(bpVideoUrl(data.heroVideoUrl))}" poster="${escapeHTML(poster)}" autoplay muted loop playsinline preload="auto" aria-hidden="true" tabindex="-1"></video>`;
      media.hidden = false;
      hero.classList.add('has-video');
      if (!still) document.getElementById('bp-hero-pause').hidden = false;
    } else if (url && media) {
      media.innerHTML = `<img src="${escapeHTML(bpImageUrl(url, 1600))}" srcset="${escapeHTML(bpImageUrl(url, 800))} 800w, ${escapeHTML(bpImageUrl(url, 1600))} 1600w" sizes="(min-width: 900px) 55vw, 100vw" alt="" fetchpriority="high" decoding="async">`;
      media.hidden = false;
      hero.classList.add('has-image');
    }
    // Section images, each optional (admin > Pages > Brand Partnerships).
    ['selectionImageUrl'].forEach(key => {
      const box = document.getElementById('bp-img-' + key);
      if (!data[key] || !box) return;
      box.innerHTML = `<img src="${escapeHTML(bpImageUrl(data[key], 1600))}" srcset="${escapeHTML(bpImageUrl(data[key], 800))} 800w, ${escapeHTML(bpImageUrl(data[key], 1600))} 1600w, ${escapeHTML(bpImageUrl(data[key], 2160))} 2160w" sizes="(min-width: 1080px) 1016px, calc(100vw - 32px)" alt="" loading="lazy" decoding="async">`;
      box.hidden = false;
    });
  }).catch(() => {});
}

// Kept for older links (the application form used to be its own page).
function applyForBrandPartnership() {
  bpScrollTo('bp-apply');
}

window.renderBrandPartnershipsPage = renderBrandPartnershipsPage;
window.applyForBrandPartnership = applyForBrandPartnership;
window.bpScrollTo = bpScrollTo;
window.bpToggleHeroVideo = bpToggleHeroVideo;
