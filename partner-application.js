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
const PA_CATEGORIES = ['Clothing', 'Accessories', 'Jewellery', 'Bags', 'Footwear', 'Fragrance and beauty', 'Homeware', 'Other'];
const PA_PRICE_BANDS = ['Under R500', 'R500 to R1,500', 'R1,500 to R5,000', 'Over R5,000'];
const PA_CHANNELS = ['Own website', 'Social media', 'Own store or studio', 'Other retailers or stockists', 'Markets and pop-ups', 'Not selling yet'];
const PA_RANGE_SIZES = ['1 to 10 products', '11 to 50 products', '51 to 200 products', 'More than 200 products'];
const PA_FULFILMENT = ['We pack and ship orders ourselves', 'We use a fulfilment or courier partner', 'We are still setting this up'];

let _paImages = [];
let _paUploading = 0;

function renderPartnerApplicationPage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;
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
      <p class="track-intro">Tell us about your brand. Our partnerships team reviews every application against our partnership criteria and will contact shortlisted brands to discuss terms. Fields marked * are required.</p>

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
          <h2 class="pa-section-title"><span>4</span>Contact details</h2>
          <div class="pa-row">
            <div>${field('pa-name', 'Full name *', `maxlength="100" autocomplete="name" value="${escapeHTML((signedIn && user.displayName) || '')}"`)}</div>
            <div>${field('pa-role', 'Role', 'maxlength="100" placeholder="Founder, Director"')}</div>
          </div>
          ${field('pa-email', 'Email address *', `type="email" maxlength="200" autocomplete="email" value="${escapeHTML((signedIn && user.email) || '')}"`)}
          ${field('pa-phone', 'Phone number *', 'type="tel" maxlength="30" autocomplete="tel"')}
        </div>

        <label class="pa-check pa-consent"><input type="checkbox" id="pa-consent"><span>I confirm that the information provided is accurate, and I agree to JANEDORE contacting me about this application.</span></label>
        <input type="text" id="pa-website-hp" class="care-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="track-error" id="pa-error" role="alert"></div>
        <button class="track-btn" id="pa-btn" type="submit">Submit Application</button>
        <p class="track-hint">You’ll receive a confirmation email once your application has been submitted.</p>
      </form>
    </section>`;
  drawPartnerImages();
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
    categories: checked('pa-category'), priceBand: val('pa-price'), story: val('pa-story'),
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
    !p.consent ? 'Please confirm the declaration at the bottom of the form.' : '';
  if (missing) { partnerError(missing); return; }

  const btn = document.getElementById('pa-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/partner-applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'We couldn’t submit your application. Please try again.');
    const page = document.querySelector('.pa-page');
    page.innerHTML = `<div class="returns-done pa-done">
      <div class="returns-done-icon"><i class="ph ph-check" aria-hidden="true"></i></div>
      <h1 class="track-title">Application received</h1>
      <p class="track-intro">Thank you for your interest in partnering with JANEDORE. Your reference is <strong>${escapeHTML(data.reference || '')}</strong>, and we’ve sent a confirmation to ${escapeHTML(p.email)}.</p>
      <p class="track-intro">Our partnerships team reviews every application carefully. If your brand is shortlisted, we will contact you to discuss the next steps.</p>
      <button class="track-btn" type="button" onclick="navigateToContentPage('brand-partnerships')">Back to Brand Partnerships</button>
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
