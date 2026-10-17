/* ============================================================
   PARTNER APPLICATION — /pages/partner-application
   Opened from Apply to Partner on /pages/brand-partnerships.
   content-pages.js hands this slug to renderPartnerApplicationPage().
   server.js /api/partner-applications saves the application to
   partnerApplications, emails the team (reply goes to the applicant)
   and sends the applicant a confirmation. Images use the same unsigned
   Cloudinary upload as returns and the chat (chat.js).
   ============================================================ */

const PARTNER_APPLICATION_SLUG = 'partner-application';
const PA_IMAGE_MAX = 6;
// Keep in sync with partner-applications-api.js LISTS and the What we
// carry section on brand-partnerships.js.
const PA_CATEGORIES = ['Clothing', 'Kidswear', 'Accessories', 'Jewellery', 'Bags', 'Footwear', 'Beauty', 'Fragrance', 'Homeware'];
const PA_PRODUCTION = ['Made in advance and held in stock', 'Made to order', 'Both'];
const PA_SUPPORT_AREAS = ['Product photography', 'Packaging', 'Brand identity', 'Product descriptions', 'Pricing', 'Fulfilment and shipping', 'Something else'];
const PA_PRICE_BANDS = ['Under R500', 'R500 to R1,500', 'R1,500 to R5,000', 'Over R5,000'];
const PA_CHANNELS = ['Own website', 'Social media', 'Own store or studio', 'Other retailers or stockists', 'Markets and pop-ups', 'Not selling yet'];
const PA_RANGE_SIZES = ['1 to 10 products', '11 to 50 products', '51 to 200 products', 'More than 200 products'];
const PA_FULFILMENT = ['We pack and ship orders ourselves', 'We use a fulfilment or courier partner', 'We are still setting this up'];

let _paImages = [];
let _paUploading = 0;

function renderPartnerApplicationPage(tab) {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const ref = (new URLSearchParams(window.location.search).get('ref') || '').trim();
  tab = tab || (ref ? 'status' : 'apply');
  if (tab === 'status') { renderPartnerStatus(el, ref); return; }
  _paImages = [];
  _paUploading = 0;
  const user = firebase.auth().currentUser;
  const signedIn = user && !user.isAnonymous;
  const opts = list => list.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
  const checks = (name, list) => `<div class="pa-checks">${list.map(v => `<label class="pa-check"><input type="checkbox" name="${name}" value="${escapeHTML(v)}"><span>${escapeHTML(v)}</span></label>`).join('')}</div>`;
  const field = (id, label, attrs = '', hint = '') => `<label class="track-label" for="${id}">${label}</label><input class="track-input" id="${id}" ${attrs}>${hint ? `<p class="pa-hint">${hint}</p>` : ''}`;

  el.innerHTML = `
    <section class="track-page pa-page">
      <span class="track-link pa-back" onclick="navigateToContentPage('brand-partnerships')">Brand Partnerships</span>
      <h1 class="track-title">Partner Application</h1>
      ${partnerTabsHtml('apply')}
      <p class="track-intro">Tell us about your brand. Our partnerships team reviews every application against our partnership criteria and will contact shortlisted brands to discuss terms. Fields marked * are required.</p>
      <div class="track-notice pa-before">
        <strong>Before you apply</strong><br>
        JANEDORE partners only with brands that design their own products. We do not accept dropshipping businesses, resellers of other brands, or counterfeit and replica goods, and we only carry clothing, kidswear, accessories, jewellery, bags, footwear, beauty, fragrance and homeware. Made-to-order brands are welcome, and their products are sold as pre-orders.
        <span class="track-link" onclick="openPartnershipCarry()">See what we carry and do not accept</span>
      </div>

      <form id="pa-form" onsubmit="submitPartnerApplication(event)" oninput="partnerError('')" onchange="partnerError('')" novalidate>
        <div class="pa-section">
          <h2 class="pa-section-title"><span>1</span>Your brand</h2>
          ${field('pa-brand', 'Brand name *', 'maxlength="100" autocomplete="organization"')}
          ${field('pa-website', 'Website', 'type="url" maxlength="200" placeholder="https://"')}
          ${field('pa-instagram', 'Instagram', 'maxlength="100" placeholder="@yourbrand"')}
          <div class="pa-row">
            <div>${field('pa-location', 'Based in *', 'maxlength="100" placeholder="City, country"')}</div>
            <div>${field('pa-founded', 'Year founded', 'inputmode="numeric" maxlength="4" placeholder="2021"')}</div>
          </div>
          <label class="track-label">Product categories *</label>
          ${checks('pa-category', PA_CATEGORIES)}
          <label class="track-label" for="pa-production">How are your products made? *</label>
          <select class="track-input" id="pa-production"><option value="">Choose one</option>${opts(PA_PRODUCTION)}</select>
          <p class="pa-hint">Made-to-order products are sold on JANEDORE as pre-orders, with an estimated dispatch date.</p>
          <label class="track-label" for="pa-price">Average retail price *</label>
          <select class="track-input" id="pa-price"><option value="">Choose a price range</option>${opts(PA_PRICE_BANDS)}</select>
          <label class="track-label" for="pa-story">Brand overview *</label>
          <textarea class="track-input return-textarea pa-textarea" id="pa-story" maxlength="3000" placeholder="Your brand story, design philosophy, materials and production, and what sets your brand apart."></textarea>
        </div>

        <div class="pa-section">
          <h2 class="pa-section-title"><span>2</span>Sales and operations</h2>
          <label class="track-label">Current sales channels *</label>
          ${checks('pa-channel', PA_CHANNELS)}
          <label class="track-label" for="pa-range">Size of your current range *</label>
          <select class="track-input" id="pa-range"><option value="">Choose a range size</option>${opts(PA_RANGE_SIZES)}</select>
          <label class="track-label" for="pa-fulfilment">Order fulfilment *</label>
          <select class="track-input" id="pa-fulfilment"><option value="">Choose one</option>${opts(PA_FULFILMENT)}</select>
          <label class="track-label" for="pa-goals">What would you like to achieve with JANEDORE?</label>
          <textarea class="track-input return-textarea" id="pa-goals" maxlength="1500" placeholder="For example, reaching new customers, launching a new category or growing online sales."></textarea>
        </div>

        <div class="pa-section">
          <h2 class="pa-section-title"><span>3</span>Product imagery *</h2>
          <p class="pa-hint pa-hint-top">Add up to ${PA_IMAGE_MAX} images of your products or campaign. These help us understand your product quality and brand presentation.</p>
          <div class="return-photos" id="pa-images"></div>
        </div>

        <div class="pa-section">
          <h2 class="pa-section-title"><span>4</span>Support to meet our standards</h2>
          <p class="pa-hint pa-hint-top">Already selling, with customers who love your product, but your presentation is not yet at the standard of our platform? You can still apply. Tell us where you would like support, and we will take it into account when we review your application.</p>
          <label class="pa-check pa-support-toggle"><input type="checkbox" id="pa-support" onchange="document.getElementById('pa-support-fields').hidden = !this.checked"><span>I would like support from JANEDORE to meet your brand standards</span></label>
          <div id="pa-support-fields" hidden>
            <label class="track-label">Where would you like support? *</label>
            ${checks('pa-support-area', PA_SUPPORT_AREAS)}
            <label class="track-label" for="pa-support-details">Tell us more</label>
            <textarea class="track-input return-textarea" id="pa-support-details" maxlength="1500" placeholder="For example, your current customer base and sales, and what you would like help with."></textarea>
          </div>
        </div>

        <div class="pa-section">
          <h2 class="pa-section-title"><span>5</span>Contact details</h2>
          <div class="pa-row">
            <div>${field('pa-name', 'Full name *', `maxlength="100" autocomplete="name" value="${escapeHTML((signedIn && user.displayName) || '')}"`)}</div>
            <div>${field('pa-role', 'Role', 'maxlength="100" placeholder="Founder, Director"')}</div>
          </div>
          ${field('pa-email', 'Email address *', `type="email" maxlength="200" autocomplete="email" value="${escapeHTML((signedIn && user.email) || '')}"`)}
          ${field('pa-phone', 'Phone number *', 'type="tel" maxlength="30" autocomplete="tel"')}
        </div>

        <div class="pa-consent">
          <label class="pa-check"><input type="checkbox" id="pa-own-products"><span>I confirm that my brand designs its own products, and that we are not a dropshipping business, a reseller of other brands, or a seller of counterfeit or replica goods. *</span></label>
          <label class="pa-check"><input type="checkbox" id="pa-consent"><span>I confirm that the information provided is accurate, and I agree to JANEDORE contacting me about this application. *</span></label>
        </div>
        <input type="text" id="pa-website-hp" class="care-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="track-error" id="pa-error" role="alert"></div>
        <button class="track-btn" id="pa-btn" type="submit">Submit Application</button>
        <p class="track-hint">You’ll receive a confirmation email once your application has been submitted.</p>
      </form>
    </section>`;
  drawPartnerImages();
}

// Brand Partnerships, scrolled to What we carry / What we do not accept.
function openPartnershipCarry() {
  navigateToContentPage('brand-partnerships');
  setTimeout(() => { const el = document.getElementById('bp-carry'); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140); }, 50);
}

function partnerTabsHtml(tab) {
  return `<div class="wish-tabs account-tabs" role="tablist">
    <button type="button" role="tab" class="wish-tab${tab === 'apply' ? ' active' : ''}" onclick="renderPartnerApplicationPage('apply')">Apply</button>
    <button type="button" role="tab" class="wish-tab${tab === 'status' ? ' active' : ''}" onclick="renderPartnerApplicationPage('status')">Check application status</button>
  </div>`;
}

let _paEmail = '';
let _paRef = '';

// From the Application received screen straight to its status.
function openPartnerStatus() {
  history.replaceState(null, null, '/pages/partner-application?ref=' + encodeURIComponent(_paRef));
  renderPartnerApplicationPage('status');
}

function renderPartnerStatus(el, ref) {
  const user = firebase.auth().currentUser;
  const email = _paEmail || (user && !user.isAnonymous && user.email) || '';
  el.innerHTML = `
    <section class="track-page pa-page">
      <span class="track-link pa-back" onclick="navigateToContentPage('brand-partnerships')">Brand Partnerships</span>
      <h1 class="track-title">Partner Application</h1>
      ${partnerTabsHtml('status')}
      <p class="track-intro">Enter your application reference and the email address you applied with.</p>
      <form class="track-form" onsubmit="submitPartnerStatus(event)" novalidate>
        <label class="track-label" for="ps-ref">Reference</label>
        <input class="track-input" id="ps-ref" placeholder="PA-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(ref || '')}">
        <label class="track-label" for="ps-email">Email address</label>
        <input class="track-input" id="ps-email" type="email" placeholder="you@yourbrand.com" autocomplete="email" value="${escapeHTML(email)}">
        <div class="track-error" id="ps-error" role="alert"></div>
        <button class="track-btn" id="ps-btn" type="submit">Check Status</button>
        <p class="track-hint">Your reference begins with PA- and can be found in your confirmation email.</p>
      </form>
      <div id="ps-result"></div>
    </section>`;
  if (ref && email) submitPartnerStatus();
}

async function submitPartnerStatus(ev) {
  if (ev) ev.preventDefault();
  const reference = document.getElementById('ps-ref').value.trim();
  const email = document.getElementById('ps-email').value.trim();
  const err = document.getElementById('ps-error');
  const showError = msg => { err.textContent = msg || ''; err.style.display = msg ? 'block' : 'none'; };
  showError('');
  if (!reference || !email) return showError('Please enter your reference and email address.');
  const btn = document.getElementById('ps-btn');
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const res = await fetch('/api/partner-applications/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, email }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    _paEmail = email;
    document.getElementById('ps-result').innerHTML = partnerStatusHtml(data);
  } catch (e) {
    showError(e.message);
    document.getElementById('ps-result').innerHTML = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Check Status';
  }
}

const PA_STATUS_COPY = {
  received: ['Application received', 'Thank you for applying. Your application is in the queue and will be reviewed by our partnerships team.'],
  under_review: ['Your application is under review', 'Our partnerships team is reviewing your application against our partnership criteria. We will email you as soon as a decision has been made.'],
  accepted: ['Your application has been accepted', 'Welcome to JANEDORE. A member of our partnerships team will be in touch to agree commercial terms and begin onboarding.'],
  conditional: ['Accepted with conditions', 'We see real potential in your brand and would like to welcome you to JANEDORE. The changes below are required before we can begin onboarding. Once you have made them, reply to your decision email with an update and our team will review it.'],
  declined: ['An update on your application', 'After careful consideration, we are unable to offer a partnership at this time. As your brand grows, you are very welcome to apply again in the future.']
};

function partnerStatusHtml(a) {
  const decided = ['accepted', 'conditional', 'declined'].includes(a.status);
  const reached = { received: 0, under_review: 1 }[a.status] ?? 2;
  const outcome = { accepted: 'Accepted', conditional: 'Accepted with conditions', declined: 'Declined' }[a.status] || 'Decision';
  const steps = ['Application received', 'Under review', outcome].map((label, i) => {
    const state = i <= reached ? 'done' : i === reached + 1 ? 'current' : '';
    const declinedStep = i === 2 && a.status === 'declined';
    return `<div class="track-step ${state}${declinedStep ? ' is-declined' : ''}"><span class="track-step-dot">${state === 'done' ? `<i class="ph ${declinedStep ? 'ph-x' : 'ph-check'}" aria-hidden="true"></i>` : ''}</span><span class="track-step-label">${escapeHTML(label)}</span></div>`;
  }).join('<div class="track-step-line"></div>');
  const copy = PA_STATUS_COPY[a.status] || PA_STATUS_COPY.received;
  const conditions = (a.conditions || []).length
    ? `<div class="track-card"><div class="account-detail-title">Required changes</div><ol class="pa-conditions">${a.conditions.map(c => `<li>${escapeHTML(c)}</li>`).join('')}</ol>
        <div class="pa-help"><strong>Need help?</strong> If you would like support in making any of these changes, please contact a member of our partnerships team at <a class="track-link" href="mailto:support@janedore.co.za">support@janedore.co.za</a>, quoting ${escapeHTML(a.reference || '')}. We will get back to you to discuss how we can help.</div></div>` : '';
  return `<div class="track-result">
    <div class="track-order-number">${escapeHTML(a.brandName || '')} · ${escapeHTML(a.reference || '')}</div>
    ${a.createdAt ? `<div class="track-order-meta">Applied ${escapeHTML(trackDate(a.createdAt, true))}${decided && a.decidedAt ? ` · Decision ${escapeHTML(trackDate(a.decidedAt, true))}` : ''}</div>` : ''}
    <div class="track-heading">${escapeHTML(copy[0])}</div>
    <div class="track-card">
      <div class="track-steps">${steps}</div>
      <p class="track-wait">${escapeHTML(copy[1])}</p>
      ${a.message ? `<div class="return-instructions"><div class="account-detail-title">A note from our team</div>${escapeHTML(a.message)}</div>` : ''}
    </div>
    ${conditions}
    <p class="account-help">Questions about your application? Email <a class="track-link" href="mailto:support@janedore.co.za">support@janedore.co.za</a> and quote ${escapeHTML(a.reference || '')}.</p>
  </div>`;
}

function drawPartnerImages() {
  const box = document.getElementById('pa-images');
  if (!box) return;
  box.innerHTML = _paImages.map((u, i) => `<span class="return-photo" style="background-image:url('${escapeForCssUrl(u)}')"><button type="button" aria-label="Remove image" onclick="removePartnerImage(${i})"><i class="ph ph-x"></i></button></span>`).join('') +
    (_paUploading ? Array.from({ length: _paUploading }, () => '<span class="return-photo is-loading"><span class="spinner"></span></span>').join('') : '') +
    (_paImages.length + _paUploading < PA_IMAGE_MAX ? `<button type="button" class="return-photo-add" onclick="pickPartnerImages()"><i class="ph ph-camera" aria-hidden="true"></i><span>Add images</span></button>` : '');
}

function removePartnerImage(i) { _paImages.splice(i, 1); drawPartnerImages(); }

function partnerError(msg) {
  const e = document.getElementById('pa-error');
  if (e) { e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }
}

function pickPartnerImages() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/heic';
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files || []).slice(0, PA_IMAGE_MAX - _paImages.length - _paUploading);
    files.forEach(file => {
      if (file.size > 15 * 1024 * 1024) { partnerError('Each image must be smaller than 15 MB.'); return; }
      _paUploading++;
      drawPartnerImages();
      uploadChatImageToCloudinary(file).then(url => { _paImages.push(url); })
        .catch(() => partnerError('An image didn’t upload. Please try again.'))
        .finally(() => { _paUploading--; drawPartnerImages(); });
    });
  };
  input.click();
}

async function submitPartnerApplication(ev) {
  if (ev) ev.preventDefault();
  const val = id => (document.getElementById(id).value || '').trim();
  const checked = name => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(c => c.value);
  const p = {
    brandName: val('pa-brand'), website: val('pa-website'), instagram: val('pa-instagram'), location: val('pa-location'), founded: val('pa-founded'),
    categories: checked('pa-category'), production: val('pa-production'), priceBand: val('pa-price'), story: val('pa-story'),
    supportRequested: document.getElementById('pa-support').checked, supportAreas: checked('pa-support-area'), supportDetails: val('pa-support-details'),
    ownProducts: document.getElementById('pa-own-products').checked,
    channels: checked('pa-channel'), rangeSize: val('pa-range'), fulfilment: val('pa-fulfilment'), goals: val('pa-goals'),
    images: _paImages.slice(),
    contactName: val('pa-name'), role: val('pa-role'), email: val('pa-email'), phone: val('pa-phone'),
    consent: document.getElementById('pa-consent').checked, hp: val('pa-website-hp')
  };
  partnerError('');
  const missing =
    !p.brandName ? 'Please enter your brand name.' :
    !p.location ? 'Please tell us where your brand is based.' :
    !p.categories.length ? 'Please choose at least one product category.' :
    !p.production ? 'Please tell us how your products are made.' :
    !p.priceBand ? 'Please choose your average retail price.' :
    !p.story ? 'Please give us an overview of your brand.' :
    !p.channels.length ? 'Please choose your current sales channels.' :
    !p.rangeSize ? 'Please choose the size of your current range.' :
    !p.fulfilment ? 'Please tell us how you fulfil orders.' :
    _paUploading ? 'Please wait for your images to finish uploading.' :
    !p.images.length ? 'Please add at least one product image.' :
    !p.contactName ? 'Please enter your full name.' :
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? 'Please enter a valid email address.' :
    !p.phone ? 'Please enter your phone number.' :
    p.supportRequested && !p.supportAreas.length ? 'Please choose where you would like support.' :
    !p.ownProducts ? 'Please confirm that your brand designs its own products and does not dropship.' :
    !p.consent ? 'Please confirm the declaration at the bottom of the form.' : '';
  if (missing) { partnerError(missing); return; }

  const btn = document.getElementById('pa-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/partner-applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'We couldn’t submit your application. Please try again.');
    _paEmail = p.email;
    _paRef = data.reference || '';
    const page = document.querySelector('.pa-page');
    page.innerHTML = `<div class="returns-done pa-done">
      <div class="returns-done-icon"><i class="ph ph-check" aria-hidden="true"></i></div>
      <h1 class="track-title">Application received</h1>
      <p class="track-intro">Thank you for your interest in partnering with JANEDORE. Your reference is <strong>${escapeHTML(data.reference || '')}</strong>, and we’ve sent a confirmation to ${escapeHTML(p.email)}.</p>
      <p class="track-intro">Our partnerships team reviews every application carefully. If your brand is shortlisted, we will contact you to discuss the next steps.</p>
      <button class="track-btn" type="button" onclick="openPartnerStatus()">Check Application Status</button>
      <p class="track-hint"><span class="track-link" onclick="navigateToContentPage('brand-partnerships')">Back to Brand Partnerships</span></p>
    </div>`;
    window.scrollTo(0, 0);
  } catch (e) {
    partnerError(e.message);
    btn.disabled = false; btn.textContent = 'Submit Application';
  }
}

window.renderPartnerApplicationPage = renderPartnerApplicationPage;
window.submitPartnerApplication = submitPartnerApplication;
window.pickPartnerImages = pickPartnerImages;
window.removePartnerImage = removePartnerImage;
window.partnerError = partnerError;
window.submitPartnerStatus = submitPartnerStatus;
window.openPartnerStatus = openPartnerStatus;
window.openPartnershipCarry = openPartnershipCarry;
