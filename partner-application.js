/* ============================================================
   PARTNER APPLICATION
   The form lives in the Apply section of /pages/brand-partnerships
   (brand-partnerships.js renders partnerFormHtml() and calls
   initPartnerForm()). /pages/partner-application now only hosts the
   status check; its Apply tab goes back to that section.
   submitPartnerApplication() posts to /api/partner-applications
   (partner-applications-api.js), which validates again, saves the
   application, emails the team and sends the applicant a confirmation.
   The success message only shows once the server has confirmed it.
   Images use the same unsigned Cloudinary upload as returns and chat.
   ============================================================ */

const PARTNER_APPLICATION_SLUG = 'partner-application';
const PA_IMAGE_MAX = 6;
// Keep in sync with partner-applications-api.js LISTS.
const PA_CATEGORIES = ['Clothing', 'Kidswear', 'Jewellery', 'Bags', 'Footwear', 'Accessories', 'Homeware', 'Beauty', 'Fragrance and candles'];
const PA_PRODUCTION = ['Made in advance and held in stock', 'Made to order', 'Both'];
const PA_SUPPORT_AREAS = ['Product photography', 'Packaging', 'Brand identity', 'Product descriptions', 'Pricing', 'Fulfilment and shipping', 'Something else'];

let _paImages = [];
let _paUploading = 0;
let _paEmail = '';
let _paRef = '';

function renderPartnerApplicationPage(tab) {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || (window._paOpenStatus && _paRef) || '').trim();
  // While Brand partnerships is hidden, only the status check is offered.
  const live = typeof BRAND_PARTNERSHIPS_LIVE === 'undefined' || BRAND_PARTNERSHIPS_LIVE;
  const wantsStatus = !live || tab === 'status' || (!tab && (ref || window._paOpenStatus));
  window._paOpenStatus = false;
  if (wantsStatus) { renderPartnerStatus(el, ref); return; }
  // The application form is part of Brand partnerships now.
  window._bpScrollToApply = true;
  navigateToContentPage('brand-partnerships', true);
}

// From Brand partnerships to the status check.
function openPartnerStatusPage() {
  _paRef = '';
  window._paOpenStatus = true;
  navigateToContentPage(PARTNER_APPLICATION_SLUG);
}

function partnerFormHtml() {
  const user = firebase.auth().currentUser;
  const signedIn = user && !user.isAnonymous;
  const opts = list => list.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
  const checks = (name, list) => `<div class="pa-checks">${list.map(v => `<label class="pa-check"><input type="checkbox" name="${name}" value="${escapeHTML(v)}"><span>${escapeHTML(v)}</span></label>`).join('')}</div>`;
  const req = '<span class="pa-req" aria-hidden="true">*</span>';
  const field = (id, label, attrs, required, hint) => `<div class="pa-field">
      <label class="pa-label" for="${id}">${label}${required ? ' ' + req : ''}</label>
      <input class="pa-input" id="${id}" ${attrs}${required ? ' required aria-required="true"' : ''}${hint ? ` aria-describedby="${id}-hint"` : ''}>
      ${hint ? `<p class="pa-hint" id="${id}-hint">${hint}</p>` : ''}
    </div>`;
  const area = (id, label, max, placeholder, required) => `<div class="pa-field">
      <label class="pa-label" for="${id}">${label}${required ? ' ' + req : ''}</label>
      <textarea class="pa-input pa-area" id="${id}" maxlength="${max}" placeholder="${placeholder}"${required ? ' required aria-required="true"' : ''}></textarea>
    </div>`;

  return `
    <form id="pa-form" class="pa-form" onsubmit="submitPartnerApplication(event)" oninput="partnerError('')" onchange="partnerError('')" novalidate>
      <fieldset class="pa-group">
        <legend>About you</legend>
        ${field('pa-name', 'Full name', `type="text" maxlength="100" autocomplete="name" value="${escapeHTML((signedIn && user.displayName) || '')}"`, true)}
        <div class="pa-row">
          ${field('pa-email', 'Business email', `type="email" maxlength="200" autocomplete="email" inputmode="email" value="${escapeHTML((signedIn && user.email) || '')}"`, true)}
          ${field('pa-phone', 'Contact number', 'type="tel" maxlength="30" autocomplete="tel" inputmode="tel"', true)}
        </div>
      </fieldset>

      <fieldset class="pa-group">
        <legend>Your brand</legend>
        ${field('pa-brand', 'Brand name', 'type="text" maxlength="100" autocomplete="organization"', true)}
        <div class="pa-row">
          ${field('pa-website', 'Website or online store', 'type="url" maxlength="200" inputmode="url" placeholder="yourbrand.com"', false)}
          ${field('pa-social', 'Social media profile', 'type="text" maxlength="200" placeholder="@yourbrand"', false)}
        </div>
        <div class="pa-row">
          <div class="pa-field">
            <label class="pa-label" for="pa-category">Primary product category ${req}</label>
            <select class="pa-input" id="pa-category" required aria-required="true"><option value="">Choose a category</option>${opts(PA_CATEGORIES)}</select>
          </div>
          <div class="pa-field">
            <label class="pa-label" for="pa-production">How are your products made? ${req}</label>
            <select class="pa-input" id="pa-production" required aria-required="true" aria-describedby="pa-production-hint"><option value="">Choose one</option>${opts(PA_PRODUCTION)}</select>
            <p class="pa-hint" id="pa-production-hint">Made-to-order pieces are sold as pre-orders.</p>
          </div>
        </div>
        ${area('pa-intro', 'Short brand introduction', 1500, 'Who you are, what you make and where.', true)}
        ${area('pa-distinctive', 'What makes your brand distinctive?', 1000, 'Your design point of view, materials, craft or story.', true)}
        ${area('pa-why', 'Why would you like to partner with JANEDORE?', 1000, 'What you hope a partnership would bring your brand.', true)}
      </fieldset>

      <fieldset class="pa-group">
        <legend>Your work</legend>
        <p class="pa-hint pa-hint-top" id="pa-work-hint">Share product images, a lookbook link, or both, so we can see your product and presentation.</p>
        ${field('pa-lookbook', 'Catalogue or lookbook link', 'type="url" maxlength="300" inputmode="url" placeholder="Optional"', false)}
        <div class="pa-field">
          <span class="pa-label" id="pa-images-label">Product images <span class="pa-optional">(up to ${PA_IMAGE_MAX})</span></span>
          <div class="return-photos pa-photos" id="pa-images" role="group" aria-labelledby="pa-images-label" aria-describedby="pa-work-hint"></div>
        </div>
      </fieldset>

      <fieldset class="pa-group">
        <legend>Support <span class="pa-optional">(optional)</span></legend>
        <label class="pa-check"><input type="checkbox" id="pa-support" aria-controls="pa-support-fields" onchange="document.getElementById('pa-support-fields').hidden = !this.checked"><span>We would like support from JANEDORE to meet your brand standards</span></label>
        <div id="pa-support-fields" class="pa-support-fields" hidden>
          <span class="pa-label">Where would you like support? ${req}</span>
          ${checks('pa-support-area', PA_SUPPORT_AREAS)}
          ${area('pa-support-details', 'Tell us more', 1500, 'For example, your current customers and sales, and what you would like help with.', false)}
        </div>
      </fieldset>

      <div class="pa-declare">
        <label class="pa-check"><input type="checkbox" id="pa-own-products" required aria-required="true"><span>My brand designs its own products. We are not a dropshipping business, a reseller of other brands, or a seller of counterfeit or replica goods. ${req}</span></label>
        <label class="pa-check"><input type="checkbox" id="pa-consent" required aria-required="true"><span>The information provided is accurate, and JANEDORE may contact me about this application. ${req}</span></label>
      </div>
      <input type="text" id="pa-website-hp" class="care-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="pa-error" id="pa-error" role="alert" aria-live="assertive"></div>
      <button class="bp-btn pa-submit" id="pa-btn" type="submit">Submit application</button>
      <p class="pa-hint">We will email you a confirmation and your reference once your application has been received.</p>
    </form>`;
}

function initPartnerForm() {
  _paImages = [];
  _paUploading = 0;
  drawPartnerImages();
}

function partnerTabsHtml(tab) {
  if (typeof BRAND_PARTNERSHIPS_LIVE !== 'undefined' && !BRAND_PARTNERSHIPS_LIVE) return '';
  return `<div class="wish-tabs account-tabs" role="tablist">
    <button type="button" role="tab" class="wish-tab${tab === 'apply' ? ' active' : ''}" onclick="renderPartnerApplicationPage('apply')">Apply</button>
    <button type="button" role="tab" class="wish-tab${tab === 'status' ? ' active' : ''}" onclick="renderPartnerApplicationPage('status')">Check application status</button>
  </div>`;
}

// From the Application received screen straight to its status.
function openPartnerStatus() {
  window._paOpenStatus = true;
  navigateToContentPage(PARTNER_APPLICATION_SLUG);
}

function renderPartnerStatus(el, ref) {
  const user = firebase.auth().currentUser;
  const email = _paEmail || (user && !user.isAnonymous && user.email) || '';
  el.innerHTML = `
    <section class="track-page pa-page">
      ${typeof BRAND_PARTNERSHIPS_LIVE === 'undefined' || BRAND_PARTNERSHIPS_LIVE ? `<span class="track-link pa-back" onclick="navigateToContentPage('brand-partnerships')">Brand partnerships</span>` : ''}
      <h1 class="track-title">Partner application</h1>
      ${partnerTabsHtml('status')}
      <p class="track-intro">Enter your application reference and the email address you applied with.</p>
      <form class="track-form" onsubmit="submitPartnerStatus(event)" novalidate>
        <label class="track-label" for="ps-ref">Reference</label>
        <input class="track-input" id="ps-ref" placeholder="PA-123456" autocomplete="off" autocapitalize="characters" value="${escapeHTML(ref || '')}">
        <label class="track-label" for="ps-email">Email address</label>
        <input class="track-input" id="ps-email" type="email" placeholder="you@yourbrand.com" autocomplete="email" value="${escapeHTML(email)}">
        <div class="track-error" id="ps-error" role="alert"></div>
        <button class="track-btn" id="ps-btn" type="submit">Check status</button>
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
    btn.disabled = false; btn.textContent = 'Check status';
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

function partnerError(msg, fieldId) {
  const e = document.getElementById('pa-error');
  if (e) { e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }
  document.querySelectorAll('#pa-form [aria-invalid="true"]').forEach(f => f.removeAttribute('aria-invalid'));
  const f = fieldId && document.getElementById(fieldId);
  if (f) { f.setAttribute('aria-invalid', 'true'); f.focus({ preventScroll: true }); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
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
  const val = id => ((document.getElementById(id) || {}).value || '').trim();
  const checked = name => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(c => c.value);
  const primary = val('pa-category');
  const p = {
    contactName: val('pa-name'), email: val('pa-email'), phone: val('pa-phone'),
    brandName: val('pa-brand'), website: val('pa-website'), social: val('pa-social'),
    primaryCategory: primary, categories: primary ? [primary] : [], production: val('pa-production'),
    story: val('pa-intro'), distinctive: val('pa-distinctive'), whyJanedore: val('pa-why'),
    lookbook: val('pa-lookbook'), images: _paImages.slice(),
    supportRequested: document.getElementById('pa-support').checked, supportAreas: checked('pa-support-area'), supportDetails: val('pa-support-details'),
    ownProducts: document.getElementById('pa-own-products').checked,
    consent: document.getElementById('pa-consent').checked, hp: val('pa-website-hp')
  };
  const looksLikeUrl = v => !v || /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v);
  partnerError('');
  const problem =
    !p.contactName ? ['Please enter your full name.', 'pa-name'] :
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? ['Please enter a valid business email address.', 'pa-email'] :
    p.phone.replace(/\D/g, '').length < 7 ? ['Please enter a contact number we can reach you on.', 'pa-phone'] :
    !p.brandName ? ['Please enter your brand name.', 'pa-brand'] :
    !looksLikeUrl(p.website) ? ['Please check your website address.', 'pa-website'] :
    !p.primaryCategory ? ['Please choose your primary product category.', 'pa-category'] :
    !p.production ? ['Please tell us how your products are made.', 'pa-production'] :
    !p.story ? ['Please add a short introduction to your brand.', 'pa-intro'] :
    !p.distinctive ? ['Please tell us what makes your brand distinctive.', 'pa-distinctive'] :
    !p.whyJanedore ? ['Please tell us why you would like to partner with JANEDORE.', 'pa-why'] :
    !looksLikeUrl(p.lookbook) ? ['Please check your lookbook link.', 'pa-lookbook'] :
    _paUploading ? ['Please wait for your images to finish uploading.', null] :
    !p.images.length && !p.lookbook ? ['Please add product images or a lookbook link so we can see your work.', 'pa-lookbook'] :
    p.supportRequested && !p.supportAreas.length ? ['Please choose where you would like support.', null] :
    !p.ownProducts ? ['Please confirm that your brand designs its own products.', 'pa-own-products'] :
    !p.consent ? ['Please confirm the declaration above.', 'pa-consent'] : null;
  if (problem) { partnerError(problem[0], problem[1]); return; }

  const btn = document.getElementById('pa-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/partner-applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.reference) throw new Error(data.error || 'We couldn’t submit your application. Please try again, or email support@janedore.co.za.');
    _paEmail = p.email;
    _paRef = data.reference;
    const wrap = document.getElementById('pa-form-wrap');
    wrap.innerHTML = `<div class="pa-done" role="status" tabindex="-1" id="pa-done">
      <div class="bp-kicker">Application received</div>
      <h3 class="pa-done-title">Thank you, ${escapeHTML(p.contactName.split(' ')[0])}.</h3>
      <p>Your application for <strong>${escapeHTML(p.brandName)}</strong> has been received. Your reference is <strong>${escapeHTML(data.reference)}</strong>, and a confirmation has been sent to ${escapeHTML(p.email)}.</p>
      <p>Our team reviews every application individually and will email you once a decision has been made.</p>
      <button class="bp-btn" type="button" onclick="openPartnerStatus()">Check application status</button>
    </div>`;
    document.querySelectorAll('#bp-apply .bp-intro, #bp-apply .bp-status-link').forEach(n => n.remove());
    const done = document.getElementById('pa-done');
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    done.focus({ preventScroll: true });
  } catch (e) {
    partnerError(e.message);
    btn.disabled = false; btn.textContent = 'Submit application';
  }
}

window.renderPartnerApplicationPage = renderPartnerApplicationPage;
window.submitPartnerApplication = submitPartnerApplication;
window.pickPartnerImages = pickPartnerImages;
window.removePartnerImage = removePartnerImage;
window.partnerError = partnerError;
window.submitPartnerStatus = submitPartnerStatus;
window.openPartnerStatus = openPartnerStatus;
window.openPartnerStatusPage = openPartnerStatusPage;
window.partnerFormHtml = partnerFormHtml;
window.initPartnerForm = initPartnerForm;
