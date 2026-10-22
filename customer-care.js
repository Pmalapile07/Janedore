/* ============================================================
   CUSTOMER CARE — /pages/customer-care (footer link)
   content-pages.js hands this slug (and the old client-support one)
   to renderCustomerCarePage() instead of a Firestore page. Customers
   can chat with JAI, email us, or send a message with the form below;
   server.js /api/contact emails the team (reply goes straight to the
   customer) and sends the customer a copy.
   ============================================================ */

const CUSTOMER_CARE_SLUG = 'customer-care';
const CUSTOMER_CARE_EMAIL = 'support@janedore.co.za';
const CUSTOMER_CARE_TOPICS = ['An order', 'Delivery', 'Returns and refunds', 'A product', 'Payment', 'My account', 'Something else'];

function renderCustomerCarePage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const user = firebase.auth().currentUser;
  const signedIn = user && !user.isAnonymous;
  let savedEmail = '';
  try { savedEmail = localStorage.getItem('janedore_checkout_email') || ''; } catch (e) {}
  const email = (signedIn && user.email) || savedEmail;
  const name = (signedIn && user.displayName) || '';
  const order = (params.get('order') || '').trim();
  const topics = CUSTOMER_CARE_TOPICS.map(t => `<option value="${escapeHTML(t)}"${order && t === 'An order' ? ' selected' : ''}>${escapeHTML(t)}</option>`).join('');
  const chatReady = typeof toggleChat === 'function' && document.getElementById('chat-window');

  el.innerHTML = `
    <section class="track-page care-page">
      <h1 class="track-title">Customer care</h1>
      <p class="track-intro">We’re here to help with your orders, delivery, returns and anything else you need.</p>

      <div class="care-options">
        ${chatReady ? `<button type="button" class="care-option" onclick="openCustomerCareChat()">
          <span class="care-option-icon"><i class="ph ph-chat-circle" aria-hidden="true"></i></span>
          <span class="care-option-text"><span class="care-option-title">Chat with JAI</span><span class="care-option-desc">Instant answers, with our team available when you need further help</span></span>
          <i class="ph ph-caret-right care-option-chevron" aria-hidden="true"></i>
        </button>` : ''}
        <a class="care-option" href="mailto:${CUSTOMER_CARE_EMAIL}">
          <span class="care-option-icon"><i class="ph ph-envelope-simple" aria-hidden="true"></i></span>
          <span class="care-option-text"><span class="care-option-title">Email us</span><span class="care-option-desc">${CUSTOMER_CARE_EMAIL}</span></span>
          <i class="ph ph-caret-right care-option-chevron" aria-hidden="true"></i>
        </a>
      </div>

      <h2 class="track-heading">Send us a message</h2>
      <form class="track-form" id="care-form" onsubmit="submitCustomerCare(event)" novalidate>
        <label class="track-label" for="care-name">Name</label>
        <input class="track-input" id="care-name" autocomplete="name" maxlength="100" value="${escapeHTML(name)}">
        <label class="track-label" for="care-email">Email address</label>
        <input class="track-input" id="care-email" type="email" placeholder="you@example.com" autocomplete="email" maxlength="200" value="${escapeHTML(email)}">
        <label class="track-label" for="care-order">Order number (optional)</label>
        <input class="track-input" id="care-order" placeholder="JD-123456" autocomplete="off" autocapitalize="characters" maxlength="40" value="${escapeHTML(order)}">
        <label class="track-label" for="care-topic">What can we help with?</label>
        <select class="track-input" id="care-topic"><option value="">Choose a topic</option>${topics}</select>
        <label class="track-label" for="care-message">Message</label>
        <textarea class="track-input return-textarea care-textarea" id="care-message" maxlength="3000" placeholder="Tell us how we can help."></textarea>
        <input type="text" id="care-website" class="care-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="track-error" id="care-error" role="alert"></div>
        <button class="track-btn" id="care-btn" type="submit">Send message</button>
        <p class="track-hint">We’ll reply to the email address above. You’ll also receive a copy of your message.</p>
      </form>

      <div class="track-notice care-shortcuts">
        <strong>Helpful links</strong><br>
        <span class="track-link" onclick="navigateToContentPage('track-your-order')">Track your order</span><br>
        <span class="track-link" onclick="navigateToContentPage('log-a-return')">Log a return</span><br>
        <span class="track-link" onclick="navigateToContentPage('faq')">Frequently asked questions</span>
      </div>
    </section>`;
}

function openCustomerCareChat() {
  if (typeof toggleChat !== 'function') return;
  if (!(typeof chatOpen !== 'undefined' && chatOpen)) toggleChat();
}

async function submitCustomerCare(ev) {
  if (ev) ev.preventDefault();
  const val = id => (document.getElementById(id).value || '').trim();
  const payload = { name: val('care-name'), email: val('care-email'), orderNumber: val('care-order'), topic: val('care-topic'), message: val('care-message'), website: val('care-website') };
  const err = document.getElementById('care-error');
  const showError = msg => { err.textContent = msg || ''; err.style.display = msg ? 'block' : 'none'; };
  showError('');
  if (!payload.name) return showError('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return showError('Please enter a valid email address.');
  if (!payload.topic) return showError('Please choose a topic.');
  if (!payload.message) return showError('Please enter your message.');

  const btn = document.getElementById('care-btn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'We couldn’t send your message. Please try again, or email us at ' + CUSTOMER_CARE_EMAIL + '.');
    try { localStorage.setItem('janedore_checkout_email', payload.email); } catch (e) {}
    const form = document.getElementById('care-form');
    form.outerHTML = `<div class="returns-done care-done">
      <div class="returns-done-icon"><i class="ph ph-check" aria-hidden="true"></i></div>
      <h2 class="track-heading">Message sent</h2>
      <p class="track-intro">Thank you, ${escapeHTML(payload.name.split(' ')[0])}. A copy has been sent to ${escapeHTML(payload.email)}, and our team will respond to you by email.</p>
    </div>`;
    const heading = document.querySelector('.care-page > .track-heading');
    if (heading) heading.style.display = 'none';
  } catch (e) {
    showError(e.message);
    btn.disabled = false; btn.textContent = 'Send message';
  }
}

window.renderCustomerCarePage = renderCustomerCarePage;
window.openCustomerCareChat = openCustomerCareChat;
window.submitCustomerCare = submitCustomerCare;
