(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc         = window._esc;
  var safeEl      = window._safeEl;
  var productsRef = window._productsRef;

  /* ─────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────── */

  /**
   * Returns true if the current hostname looks like a real
   * custom domain (not localhost / Render / Firebase Hosting).
   */
  function isCustomDomain() {
    var host = window.location.hostname;
    if (!host) return false;
    var staging = [
      'localhost',
      '127.0.0.1',
      '.onrender.com',
      '.web.app',
      '.firebaseapp.com',
      '.github.io',
      '.netlify.app',
      '.vercel.app'
    ];
    return !staging.some(function (s) {
      return host === s || host.endsWith(s);
    });
  }

  /**
   * Returns true if a payment provider key / config has been
   * set on window (populated by checkout.js).
   * Extend the checks below once checkout.js is wired up.
   */
  function isPaymentConfigured() {
    return !!(
      window._paymentProvider ||   // generic flag checkout.js can set
      window._payfastConfig  ||   // PayFast
      window._yocoKey        ||   // Yoco
      window._stripeKey            // Stripe
    );
  }

  /* ─────────────────────────────────────────────────────────
     STEP DEFINITIONS
  ───────────────────────────────────────────────────────── */
  var STEPS = [
    {
      icon: '📦',
      title: 'Add your first product',
      desc:  'List something you want to sell.',
      check: function () {
        /* resolved asynchronously – returns a Promise */
        return productsRef.limit(1).get().then(function (snap) {
          return snap.size > 0;
        });
      },
      async: true
    },
    {
      icon: '🎨',
      title: 'Customise your online store',
      desc:  'Coming soon — section & widget editor.',
      check: function () { return false; }, /* placeholder */
      async: false,
      disabled: true
    },
    {
      icon: '🌐',
      title: 'Connect a custom domain',
      desc:  'Link janedore.com to your store.',
      check: function () { return isCustomDomain(); },
      async: false
    },
    {
      icon: '💳',
      title: 'Set up a payment provider',
      desc:  'Accept payments from your customers.',
      check: function () { return isPaymentConfigured(); },
      async: false
    }
  ];

  /* ─────────────────────────────────────────────────────────
     RENDER DASHBOARD TAB
  ───────────────────────────────────────────────────────── */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="setup-guide-wrap">' +

        '<div class="setup-guide-header">' +
          '<h1 class="setup-guide-heading">Get ready to sell</h1>' +
          '<p class="setup-guide-sub">Use this guide to get your store up and running.</p>' +
        '</div>' +

        '<div class="setup-guide-progress" id="setup-progress-row">' +
          '<div class="setup-progress-bar-bg">' +
            '<div class="setup-progress-bar-fill" id="setup-progress-fill" style="width:0%"></div>' +
          '</div>' +
          '<span class="setup-progress-label" id="setup-progress-label">0 / ' + STEPS.length + ' complete</span>' +
        '</div>' +

        '<div class="setup-steps-list" id="setup-steps-list">' +
          STEPS.map(function (s, i) {
            return renderStep(s, i, false); /* render unchecked initially */
          }).join('') +
        '</div>' +

      '</div>';

    /* Resolve all checks (some async) then update UI */
    var checks = STEPS.map(function (s) {
      if (s.async) return s.check();
      return Promise.resolve(s.check());
    });

    Promise.all(checks).then(function (results) {
      var completed = results.filter(Boolean).length;

      /* Update steps */
      var listEl = safeEl('setup-steps-list');
      if (listEl) {
        listEl.innerHTML = STEPS.map(function (s, i) {
          return renderStep(s, i, results[i]);
        }).join('');
      }

      /* Animate progress bar */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var pct   = Math.round((completed / STEPS.length) * 100);
          var fill  = safeEl('setup-progress-fill');
          var label = safeEl('setup-progress-label');
          if (fill)  fill.style.width = pct + '%';
          if (label) label.textContent = completed + ' / ' + STEPS.length + ' complete';
        });
      });

    }).catch(function (e) {
      console.error('[DASHBOARD_TAB] setup guide check failed:', e);
    });
  };

  /* ─────────────────────────────────────────────────────────
     STEP CARD BUILDER
  ───────────────────────────────────────────────────────── */
  function renderStep(step, index, done) {
    var doneClass     = done     ? ' step-done'     : '';
    var disabledClass = step.disabled && !done ? ' step-disabled' : '';

    return (
      '<div class="setup-step' + doneClass + disabledClass + '">' +

        '<div class="setup-step-check">' +
          (done
            ? '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<circle cx="8" cy="8" r="8" fill="currentColor"/>' +
                '<path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
              '</svg>'
            : '<span class="setup-step-num">' + (index + 1) + '</span>'
          ) +
        '</div>' +

        '<div class="setup-step-icon">' + step.icon + '</div>' +

        '<div class="setup-step-body">' +
          '<div class="setup-step-title">' + esc(step.title) + '</div>' +
          '<div class="setup-step-desc">' + esc(step.desc) + '</div>' +
        '</div>' +

      '</div>'
    );
  }

})();
