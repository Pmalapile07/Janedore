(function () {
  'use strict';

  if (!window._adminDB) {
    console.error('[LAUNCH] window._adminDB is not defined — launch center will not work');
    return;
  }

  var db     = window._adminDB;
  var esc    = window._esc;
  var safeEl = window._safeEl;

  /* ─────────────────────────────────────────────────────────
     LAUNCH TASKS CONFIG
  ───────────────────────────────────────────────────────── */
  var LAUNCH_SECTIONS = [
    {
      id: 'store-setup',
      label: 'Store Setup',
      icon: 'ph-storefront',
      tasks: [
        { id: 'domain',   label: 'Domain connected' },
        { id: 'payment',  label: 'Payment gateway configured' },
        { id: 'shipping', label: 'Shipping rates set up' },
        { id: 'policies', label: 'Policies added (Returns, Privacy, Terms)' }
      ]
    },
    {
      id: 'products',
      label: 'Products',
      icon: 'ph-package',
      tasks: [
        { id: 'prod-created',   label: 'At least 1 product created' },
        { id: 'prod-images',    label: 'Product images uploaded' },
        { id: 'prod-inventory', label: 'Inventory quantities added' },
        { id: 'prod-pricing',   label: 'Pricing completed on all products' }
      ]
    },
    {
      id: 'branding',
      label: 'Branding & Content',
      icon: 'ph-palette',
      tasks: [
        { id: 'hero',        label: 'Homepage hero complete' },
        { id: 'about',       label: 'About page complete' },
        { id: 'collections', label: 'Collection descriptions written' },
        { id: 'contact',     label: 'Contact information added' }
      ]
    },
    {
      id: 'marketing',
      label: 'Marketing',
      icon: 'ph-megaphone',
      tasks: [
        { id: 'newsletter',    label: 'Newsletter signup enabled' },
        { id: 'welcome-email', label: 'Welcome email set up' },
        { id: 'social-links',  label: 'Social links added' }
      ]
    }
  ];

  /* ─────────────────────────────────────────────────────────
     FIRESTORE REF
  ───────────────────────────────────────────────────────── */
  var launchRef = db.collection('admin_launch').doc('checklist');

  /* ─────────────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────────────── */
  window._lcState = window._lcState || {};
  var _stateLoaded = false;

  /* ─────────────────────────────────────────────────────────
     CALC STATS
  ───────────────────────────────────────────────────────── */
  function calcStats(state) {
    var total = 0, completed = 0, nextTask = null;
    LAUNCH_SECTIONS.forEach(function (section) {
      section.tasks.forEach(function (task) {
        total++;
        if (state[task.id]) {
          completed++;
        } else if (!nextTask) {
          nextTask = task.label;
        }
      });
    });
    return {
      total: total,
      completed: completed,
      pct: total > 0 ? Math.round((completed / total) * 100) : 0,
      nextTask: nextTask,
      allDone: completed === total && total > 0
    };
  }

  /* ─────────────────────────────────────────────────────────
     SYNC DASHBOARD CARD
  ───────────────────────────────────────────────────────── */
  function syncDashboardCard(state) {
    var stats = calcStats(state);

    var bar       = safeEl('launch-bar');
    var pctNum    = safeEl('launch-pct-num');
    var pctLabel  = safeEl('launch-pct-label');
    var nextLabel = safeEl('launch-next-label');
    var nextText  = safeEl('launch-next-text');
    var detail    = safeEl('launch-progress-detail');

    requestAnimationFrame(function () {
      if (bar)    bar.style.width = stats.pct + '%';
      if (detail) detail.textContent = stats.completed + ' / ' + stats.total + ' tasks';

      if (stats.allDone) {
        /* 100% complete state */
        if (pctNum)   pctNum.textContent  = '100%';
        if (pctLabel) pctLabel.textContent = 'Complete';
        if (nextLabel) nextLabel.textContent = '';
        if (nextText) {
          nextText.innerHTML =
            '<div class="launch-ready-state">' +
              '<i class="ph-light ph-flag-checkered" style="font-size:15px;flex-shrink:0;"></i>' +
              '<span>You\'re ready to launch. Time to go live.</span>' +
            '</div>';
        }
      } else {
        if (pctNum)    pctNum.textContent   = stats.pct + '%';
        if (pctLabel)  pctLabel.textContent  = 'Complete';
        if (nextLabel) nextLabel.textContent = 'Next Task';
        if (nextText)  nextText.textContent  = stats.nextTask || '';
      }
    });

    window._launchStats = stats;
  }

  /* ─────────────────────────────────────────────────────────
     SAVE TO FIRESTORE
  ───────────────────────────────────────────────────────── */
  function saveToFirestore(state) {
    console.log('[LAUNCH] Saving to Firestore:', state);
    launchRef.set(state)
      .then(function () {
        console.log('[LAUNCH] Saved successfully');
      })
      .catch(function (e) {
        console.error('[LAUNCH] Firestore save FAILED:', e.code, e.message);
        var el = safeEl('lc-save-status');
        if (el) {
          el.textContent = 'Save failed — check Firestore rules';
          el.style.color = 'var(--danger)';
          el.style.display = 'block';
          setTimeout(function () { el.style.display = 'none'; }, 4000);
        }
      });
  }

  /* ─────────────────────────────────────────────────────────
     INIT — load from Firestore once, use cache after
  ───────────────────────────────────────────────────────── */
  window._initLaunchCenter = function () {
    if (_stateLoaded) {
      syncDashboardCard(window._lcState);
      return;
    }
    console.log('[LAUNCH] Loading state from Firestore...');
    launchRef.get()
      .then(function (snap) {
        window._lcState = snap.exists ? snap.data() : {};
        console.log('[LAUNCH] Loaded:', window._lcState);
        _stateLoaded = true;
        syncDashboardCard(window._lcState);
      })
      .catch(function (e) {
        console.error('[LAUNCH] Load failed:', e.code, e.message);
        window._lcState = {};
        _stateLoaded = true;
        syncDashboardCard(window._lcState);
      });
  };

  /* ─────────────────────────────────────────────────────────
     OPEN LAUNCH CENTER SCREEN
  ───────────────────────────────────────────────────────── */
  window._openLaunchCenter = function () {
    renderLaunchScreen(window._lcState);
  };

  function renderLaunchScreen(state) {
    var mc = safeEl('main-content');
    if (!mc) return;

    var stats = calcStats(state);

    document.querySelectorAll('.bnav-btn, .sidebar-btn').forEach(function (b) {
      b.classList.remove('active');
    });

    mc.innerHTML =
      '<button class="back-link" onclick="window._exitLaunchCenter()">' +
        '<i class="ph-light ph-arrow-left"></i> Dashboard' +
      '</button>' +

      '<div class="section-header" style="margin-bottom:6px;">' +
        '<div class="section-title">Launch Center</div>' +
      '</div>' +

      '<div id="lc-save-status" style="display:none;font-size:11px;padding:6px 0;margin-bottom:6px;"></div>' +

      /* ── PROGRESS SUMMARY CARD ── */
      '<div class="launch-summary-card">' +
        '<div class="lc-summary-left">' +
          '<div class="lc-summary-pct" id="lc-pct-display">' + stats.pct + '%</div>' +
          '<div class="lc-summary-sub" id="lc-tasks-display">' +
            stats.completed + ' / ' + stats.total + ' tasks complete' +
          '</div>' +
          (stats.allDone
            ? '<div class="lc-all-done-text">Ready to launch.</div>'
            : '') +
        '</div>' +
        '<div class="lc-summary-right">' +
          '<div class="lc-progress-ring-wrap">' +
            '<svg class="lc-ring-svg" viewBox="0 0 44 44">' +
              '<circle class="lc-ring-bg" cx="22" cy="22" r="18" fill="none" stroke-width="3"/>' +
              '<circle class="lc-ring-fill' + (stats.allDone ? ' complete' : '') + '" id="lc-ring-fill"' +
                ' cx="22" cy="22" r="18" fill="none" stroke-width="3"' +
                ' stroke-dasharray="113.1"' +
                ' stroke-dashoffset="' + (113.1 - (113.1 * stats.pct / 100)) + '"' +
                ' transform="rotate(-90 22 22)"/>' +
            '</svg>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── NEXT TASK / READY BANNER ── */
      (stats.allDone
        ? '<div class="lc-complete-banner">' +
            '<i class="ph-light ph-flag-checkered" style="font-size:16px;flex-shrink:0;"></i>' +
            '<div>' +
              '<div class="lc-next-banner-label" style="color:var(--success);">Ready to Launch</div>' +
              '<div class="lc-next-banner-text">Everything is set. Your store is ready to go live.</div>' +
            '</div>' +
          '</div>'
        : '<div class="lc-next-banner">' +
            '<i class="ph-light ph-arrow-circle-right" style="font-size:16px;flex-shrink:0;margin-top:1px;"></i>' +
            '<div>' +
              '<div class="lc-next-banner-label">Next Task</div>' +
              '<div class="lc-next-banner-text" id="lc-next-display">' + esc(stats.nextTask || '') + '</div>' +
            '</div>' +
          '</div>') +

      /* ── TASK SECTIONS ── */
      LAUNCH_SECTIONS.map(function (section) {
        var sectionDone = section.tasks.filter(function (t) { return state[t.id]; }).length;
        return '<div class="card" style="margin-bottom:10px;">' +
          '<div class="card-header">' +
            '<div style="display:flex;align-items:center;gap:9px;">' +
              '<span style="font-size:17px;opacity:.55;display:flex;align-items:center;">' +
                '<i class="ph-light ' + section.icon + '"></i>' +
              '</span>' +
              '<span class="card-title">' + esc(section.label) + '</span>' +
            '</div>' +
            '<span class="lc-section-count" id="lc-sec-' + section.id + '">' +
              sectionDone + '<span style="color:var(--muted2);">/' + section.tasks.length + '</span>' +
            '</span>' +
          '</div>' +
          '<div style="padding:4px 0;">' +
            section.tasks.map(function (task) {
              var checked = !!state[task.id];
              return '<label class="lc-task-row">' +
                '<div class="lc-checkbox' + (checked ? ' checked' : '') + '" id="lc-cb-' + task.id + '">' +
                  (checked ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : '') +
                '</div>' +
                '<span class="lc-task-label' + (checked ? ' done' : '') + '" id="lc-lbl-' + task.id + '">' +
                  esc(task.label) +
                '</span>' +
                '<input type="checkbox" style="display:none;"' + (checked ? ' checked' : '') +
                  ' onchange="window._lcToggle(\'' + task.id + '\',\'' + section.id + '\',this.checked)">' +
              '</label>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');

    /* Animate ring */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var ring = safeEl('lc-ring-fill');
        if (ring) {
          ring.style.transition = 'stroke-dashoffset .7s cubic-bezier(.32,.72,0,1)';
          ring.setAttribute('stroke-dashoffset', String(113.1 - (113.1 * stats.pct / 100)));
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────
     TASK TOGGLE
  ───────────────────────────────────────────────────────── */
  window._lcToggle = function (taskId, sectionId, checked) {
    window._lcState[taskId] = checked;
    saveToFirestore(window._lcState);

    var cb  = safeEl('lc-cb-' + taskId);
    var lbl = safeEl('lc-lbl-' + taskId);
    if (cb) {
      cb.className = 'lc-checkbox' + (checked ? ' checked' : '');
      cb.innerHTML = checked ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : '';
    }
    if (lbl) lbl.className = 'lc-task-label' + (checked ? ' done' : '');

    var stats = calcStats(window._lcState);

    /* Update summary */
    var pctEl  = safeEl('lc-pct-display');
    var taskEl = safeEl('lc-tasks-display');
    var nextEl = safeEl('lc-next-display');
    var ring   = safeEl('lc-ring-fill');

    if (pctEl)  pctEl.textContent  = stats.pct + '%';
    if (taskEl) taskEl.textContent = stats.completed + ' / ' + stats.total + ' tasks complete';
    if (ring) {
      ring.setAttribute('stroke-dashoffset', String(113.1 - (113.1 * stats.pct / 100)));
      if (stats.allDone) {
        ring.classList.add('complete');
      } else {
        ring.classList.remove('complete');
      }
    }

    /* Update next task or show ready banner */
    var bannerWrap = safeEl('lc-next-display');
    if (nextEl && !stats.allDone) nextEl.textContent = stats.nextTask || '';

    /* If just hit 100%, re-render the banner area */
    if (stats.allDone) {
      var banner = document.querySelector('.lc-next-banner');
      if (banner) {
        banner.className = 'lc-complete-banner';
        banner.innerHTML =
          '<i class="ph-light ph-flag-checkered" style="font-size:16px;flex-shrink:0;"></i>' +
          '<div>' +
            '<div class="lc-next-banner-label" style="color:var(--success);">Ready to Launch</div>' +
            '<div class="lc-next-banner-text">Everything is set. Your store is ready to go live.</div>' +
          '</div>';
      }
    } else {
      var completeBanner = document.querySelector('.lc-complete-banner');
      if (completeBanner) {
        completeBanner.className = 'lc-next-banner';
        completeBanner.innerHTML =
          '<i class="ph-light ph-arrow-circle-right" style="font-size:16px;flex-shrink:0;margin-top:1px;"></i>' +
          '<div>' +
            '<div class="lc-next-banner-label">Next Task</div>' +
            '<div class="lc-next-banner-text" id="lc-next-display">' + esc(stats.nextTask || '') + '</div>' +
          '</div>';
      }
    }

    /* Update section count */
    var section = LAUNCH_SECTIONS.find(function (s) { return s.id === sectionId; });
    if (section) {
      var secEl = safeEl('lc-sec-' + sectionId);
      if (secEl) {
        var done = section.tasks.filter(function (t) { return window._lcState[t.id]; }).length;
        secEl.innerHTML = done + '<span style="color:var(--muted2);">/' + section.tasks.length + '</span>';
      }
    }

    syncDashboardCard(window._lcState);
  };

  /* ─────────────────────────────────────────────────────────
     EXIT TO DASHBOARD
  ───────────────────────────────────────────────────────── */
  window._exitLaunchCenter = function () {
    if (window.switchTab) window.switchTab('dashboard');
  };

})();
