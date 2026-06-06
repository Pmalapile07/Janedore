(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc         = window._esc;
  var safeEl      = window._safeEl;
  var productsRef = window._productsRef;
  var ordersRef   = window._ordersRef;

  /* ─────────────────────────────────────────────────────────
     DOMAIN CHECK
     Marks complete when hostname is not a staging/dev domain.
  ───────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────
     STEP DEFINITIONS
     check() returns a Promise<boolean> or boolean.
  ───────────────────────────────────────────────────────── */
  var STEPS = [
    {
      number: '01',
      title:  'Add your first product',
      desc:   'Add at least one product to your store.',
      check:  function () {
        return productsRef.limit(1).get().then(function (snap) {
          return snap.size > 0;
        });
      }
    },
    {
      number: '02',
      title:  'Customise your online store',
      desc:   'Section and widget editor — coming soon.',
      check:  function () { return Promise.resolve(false); },
      disabled: true
    },
    {
      number: '03',
      title:  'Connect a custom domain',
      desc:   'Link your domain to make your store live.',
      check:  function () { return Promise.resolve(isCustomDomain()); }
    },
    {
      number: '04',
      title:  'Set up payments',
      desc:   'Confirm your checkout is receiving orders.',
      check:  function () {
        return ordersRef.limit(1).get().then(function (snap) {
          return snap.size > 0;
        });
      }
    }
  ];

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div class="setup-guide">' +

        '<div class="setup-guide-hd">' +
          '<h1 class="setup-guide-title">Get ready to sell</h1>' +
          '<p class="setup-guide-caption">Use this guide to get your store up and running.</p>' +
        '</div>' +

        '<div class="setup-guide-meta">' +
          '<div class="setup-progress-track">' +
            '<div class="setup-progress-fill" id="setup-fill" style="width:0%"></div>' +
          '</div>' +
          '<span class="setup-progress-count ui-label" id="setup-count">0 / ' + STEPS.length + ' complete</span>' +
        '</div>' +

        '<div class="setup-steps" id="setup-steps">' +
          STEPS.map(function (s, i) { return renderStep(s, i, false); }).join('') +
        '</div>' +

      '</div>';

    /* Resolve all checks then update */
    Promise.all(
      STEPS.map(function (s) { return s.check(); })
    ).then(function (results) {

      var done = results.filter(Boolean).length;

      var stepsEl = safeEl('setup-steps');
      if (stepsEl) {
        stepsEl.innerHTML = STEPS.map(function (s, i) {
          return renderStep(s, i, results[i]);
        }).join('');
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var fill  = safeEl('setup-fill');
          var count = safeEl('setup-count');
          if (fill)  fill.style.width = Math.round((done / STEPS.length) * 100) + '%';
          if (count) count.textContent = done + ' / ' + STEPS.length + ' complete';
        });
      });

    }).catch(function (e) {
      console.error('[DASHBOARD] setup guide error:', e);
    });
  };

  /* ─────────────────────────────────────────────────────────
     STEP ROW
  ───────────────────────────────────────────────────────── */
  function renderStep(step, index, done) {
    var rowClass = 'setup-step' +
      (done           ? ' setup-step--done'     : '') +
      (step.disabled  ? ' setup-step--disabled' : '');

    var checkMark = done
      ? '<svg class="setup-check-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<circle cx="8" cy="8" r="8" fill="var(--text)"/>' +
          '<path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>'
      : '<span class="setup-step-num">' + esc(step.number) + '</span>';

    return (
      '<div class="' + rowClass + '">' +
        '<div class="setup-step-indicator">' + checkMark + '</div>' +
        '<div class="setup-step-body">' +
          '<div class="setup-step-title">' + esc(step.title) + '</div>' +
          '<div class="setup-step-desc">' + esc(step.desc) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

})();
