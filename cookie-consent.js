// ==================== COOKIE CONSENT (POPIA) ====================
// Gates Google Analytics (GA4) behind explicit consent, as POPIA
// (South Africa's data-protection law, same idea as the EU's GDPR)
// requires for non-essential tracking cookies. The banner shows once
// per browser until Accept/Decline is chosen; the choice is
// remembered in localStorage so it isn't asked again. Accepting loads
// GA4 immediately and on every later visit; declining never loads it.
(function () {
  'use strict';
  // Paused — holding off on both the banner and GA4 for now. Flip to
  // true to turn it back on; everything below is untouched.
  const ENABLED = false;
  if (!ENABLED) return;

  const GA4_ID = 'G-Y9NMT0ZGKZ';
  const STORAGE_KEY = 'janedore_cookie_consent';

  function loadGA4() {
    if (window._ga4Loaded) return;
    window._ga4Loaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID);
  }

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  window.setCookieConsent = function (granted) {
    setConsent(granted ? 'granted' : 'denied');
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.remove('open');
    if (granted) loadGA4();
  };

  const existing = getConsent();
  if (existing === 'granted') {
    loadGA4();
  } else if (existing !== 'denied') {
    // No decision yet — this script is deferred, so the DOM (including
    // #cookie-banner) is already parsed by the time this runs.
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('open');
  }
})();
