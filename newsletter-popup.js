// ==================== NEWSLETTER POPUP ====================
// Replaces the old always-visible newsletter section that sat above
// the footer: this shows the same signup as a modal, once, the first
// time ANY page's footer actually scrolls into view — never just
// because someone landed on the site. Shown once (dismissed or
// subscribed, either way) means never again for that browser.
(function () {
  'use strict';
  const STORAGE_KEY = 'janedore_newsletter_popup_shown';

  function alreadyShown() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }
  function markShown() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  function showPopup() {
    if (alreadyShown()) return;
    const backdrop = document.getElementById('newsletter-popup-backdrop');
    if (!backdrop) return;
    backdrop.classList.add('open');
    markShown();
  }

  window.dismissNewsletterPopup = function () {
    const backdrop = document.getElementById('newsletter-popup-backdrop');
    if (backdrop) backdrop.classList.remove('open');
  };

  // Same per-page footer ids app.js's buildFooter() loop uses — only
  // one is ever present/visible at a time (one .page is active), so a
  // single observer watching all of them just fires for whichever one
  // the visitor actually reaches.
  const FOOTER_IDS = ["main-footer","products-footer","category-footer","campaign-footer","cart-footer","wishlist-footer","editorial-footer","checkout-footer","login-footer","account-footer","vendor-footer","content-footer"];

  function watchFooters() {
    if (alreadyShown()) return true;
    let found = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          showPopup();
          observer.disconnect();
        }
      });
    }, { root: null, threshold: 0 });
    FOOTER_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) { observer.observe(el); found = true; }
    });
    return found;
  }

  if (!watchFooters()) {
    const retry = new MutationObserver(() => {
      if (watchFooters()) retry.disconnect();
    });
    retry.observe(document.body, { childList: true, subtree: true });
  }
})();
