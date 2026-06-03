(function () {
  'use strict';

  if (!window._adminDB) return;

  var db    = window._adminDB;
  var esc   = window._esc;
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
  var launchRef = db.collection('launch_checklist').doc('state');

  /* ─────────────────────────────────────────────────────────
     CALCULATE STATS FROM STATE
  ───────────────────────────────────────────────────────── */
  function calcStats(state) {
    var total     = 0;
    var completed = 0;
    var nextTask  = null;

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

    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total: total, completed: completed, pct: pct, nextTask: nextTask };
  }

  /* ─────────────────────────────────────────────────────────
     UPDATE DASHBOARD CARD (called after any state change)
  ───────────────────────────────────────────────────────── */
  function syncDashboardCard(state) {
    var stats = calcStats(state);

    var bar     = safeEl('launch-bar');
    var pctNum  = safeEl('launch-pct-num');
    var pctSub  = safeEl('launch-pct-label');
    var nextEl  = safeEl('launch-next-text');
    var progEl  = safeEl('launch-progress-detail');

    if (bar)    bar.style.width = stats.pct + '%';
    if (pctNum) pctNum.textContent = stats.pct + '%';
    if (pctSub) pctSub.textContent = 'Complete';
    if (nextEl) nextEl.textContent = stats.nextTask || 'All tasks complete';
    if (progEl) progEl.textContent = stats.completed + ' / ' + stats.total + ' tasks';

    window._launchStats = stats;
  }

  /* ─────────────────────────────────────────────────────────
     SAVE TASK TOGGLE TO FIRESTORE
  ───────────────────────────────────────────────────────── */
  function toggleTask(taskId, checked, state) {
    state[taskId] = checked;
    syncDashboardCard(state);

    var update = {};
    update[taskId] = checked;
    launchRef.set(update, { merge: true }).catch(function (e) {
      console.error('[LAUNCH] save error', e);
    });
  }

  /* ─────────────────────────────────────────────────────────
     RENDER LAUNCH CENTER SCREEN
  ───────────────────────────────────────────────────────── */
  window._openLaunchCenter = function () {
    launchRef.get().then(function (snap) {
      var state = snap.exists ? snap.data() : {};
      renderLaunchScreen(state);
    }).catch(function () {
      renderLaunchScreen({});
    });
  };

  function renderLaunchScreen(state) {
    var mc = safeEl('main-content');
    if (!mc) return;

    var stats = calcStats(state);

    /* Switch active tab indicator to none (we're on a sub-screen) */
    document.querySelectorAll('.bnav-btn, .sidebar-btn').forEach(function (b) {
      b.classList.remove('active');
    });

    mc.innerHTML =
      /* ── BACK + HEADER ── */
      '<button class="back-link" onclick="window._exitLaunchCenter()">' +
        '<i class="ph-light ph-arrow-left"></i> Dashboard' +
      '</button>' +

      '<div class="section-header" style="margin-bottom:6px;">' +
        '<div class="section-title">Launch Center</div>' +
      '</div>' +

      /* ── PROGRESS SUMMARY CARD ── */
      '<div class="launch-summary-card" id="lc-summary">' +
        '<div class="lc-summary-left">' +
          '<div class="lc-summary-pct" id="lc-pct-display">' + stats.pct + '%</div>' +
          '<div class="lc-summary-sub" id="lc-tasks-display">' + stats.completed + ' / ' + stats.total + ' tasks complete</div>' +
        '</div>' +
        '<div class="lc-summary-right">' +
          '<div class="lc-progress-ring-wrap">' +
            '<svg class="lc-ring-svg" viewBox="0 0 44 44">' +
              '<circle class="lc-ring-bg" cx="22" cy="22" r="18" fill="none" stroke-width="3"/>' +
              '<circle class="lc-ring-fill" id="lc-ring-fill" cx="22" cy="22" r="18" fill="none" stroke-width="3"' +
                ' stroke-dasharray="113.1" stroke-dashoffset="' + (113.1 - (113.1 * stats.pct / 100)) + '"' +
                ' transform="rotate(-90 22 22)"/>' +
            '</svg>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── NEXT TASK BANNER ── */
      (stats.nextTask
        ? '<div class="lc-next-banner">' +
            '<i class="ph-light ph-arrow-circle-right" style="font-size:16px;flex-shrink:0;"></i>' +
            '<div>' +
              '<div class="lc-next-banner-label">Next Task</div>' +
              '<div class="lc-next-banner-text" id="lc-next-display">' + esc(stats.nextTask) + '</div>' +
            '</div>' +
          '</div>'
        : '<div class="lc-complete-banner">' +
            '<i class="ph-light ph-check-circle" style="font-size:16px;flex-shrink:0;color:var(--success);"></i>' +
            '<div class="lc-next-banner-text">All tasks complete — ready to launch!</div>' +
          '</div>') +

      /* ── SECTIONS ── */
      LAUNCH_SECTIONS.map(function (section) {
        var sectionDone = section.tasks.filter(function (t) { return state[t.id]; }).length;
        var sectionTotal = section.tasks.length;

        return '<div class="card" style="margin-bottom:10px;">' +
          '<div class="card-header">' +
            '<div style="display:flex;align-items:center;gap:9px;">' +
              '<span style="font-size:17px;opacity:.6;display:flex;align-items:center;"><i class="ph-light ' + section.icon + '"></i></span>' +
              '<span class="card-title">' + esc(section.label) + '</span>' +
            '</div>' +
            '<span class="lc-section-count">' + sectionDone + '<span style="color:var(--muted2);">/' + sectionTotal + '</span></span>' +
          '</div>' +
          '<div style="padding:4px 0;">' +
            section.tasks.map(function (task) {
              var checked = !!state[task.id];
              return '<label class="lc-task-row" data-task="' + task.id + '">' +
                '<div class="lc-checkbox' + (checked ? ' checked' : '') + '" id="lc-cb-' + task.id + '">' +
                  (checked ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : '') +
                '</div>' +
                '<span class="lc-task-label' + (checked ? ' done' : '') + '" id="lc-label-' + task.id + '">' +
                  esc(task.label) +
                '</span>' +
                '<input type="checkbox" style="display:none;" ' + (checked ? 'checked' : '') +
                  ' onchange="window._lcToggle(\'' + task.id + '\',this.checked)">' +
              '</label>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');

    /* Store state reference for toggles */
    window._lcState = state;

    /* Animate ring on load */
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
     TASK TOGGLE (called from inline onchange)
  ───────────────────────────────────────────────────────── */
  window._lcToggle = function (taskId, checked) {
    var state = window._lcState || {};
    state[taskId] = checked;
    toggleTask(taskId, checked, state);

    /* Update checkbox visual */
    var cb    = safeEl('lc-cb-' + taskId);
    var label = safeEl('lc-label-' + taskId);
    if (cb) {
      cb.className = 'lc-checkbox' + (checked ? ' checked' : '');
      cb.innerHTML = checked ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : '';
    }
    if (label) {
      label.className = 'lc-task-label' + (checked ? ' done' : '');
    }

    /* Update section counts */
    var stats = calcStats(state);
    updateLCSummary(stats);
  };

  function updateLCSummary(stats) {
    var pctEl  = safeEl('lc-pct-display');
    var taskEl = safeEl('lc-tasks-display');
    var nextEl = safeEl('lc-next-display');
    var ring   = safeEl('lc-ring-fill');

    if (pctEl)  pctEl.textContent  = stats.pct + '%';
    if (taskEl) taskEl.textContent = stats.completed + ' / ' + stats.total + ' tasks complete';
    if (nextEl) nextEl.textContent = stats.nextTask || 'All tasks complete';
    if (ring)   ring.setAttribute('stroke-dashoffset', String(113.1 - (113.1 * stats.pct / 100)));

    /* Update section count badges */
    LAUNCH_SECTIONS.forEach(function (section) {
      var done  = section.tasks.filter(function (t) { return (window._lcState || {})[t.id]; }).length;
      var total = section.tasks.length;
      /* Re-render section counts by finding them — simplest approach */
      document.querySelectorAll('.lc-section-count').forEach(function (el, i) {
        if (LAUNCH_SECTIONS[i]) {
          var s = LAUNCH_SECTIONS[i];
          var d = s.tasks.filter(function (t) { return (window._lcState || {})[t.id]; }).length;
          el.innerHTML = d + '<span style="color:var(--muted2);">/' + s.tasks.length + '</span>';
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────
     EXIT LAUNCH CENTER → BACK TO DASHBOARD
  ───────────────────────────────────────────────────────── */
  window._exitLaunchCenter = function () {
    if (window.switchTab) window.switchTab('dashboard');
  };

  /* ─────────────────────────────────────────────────────────
     INIT — load state on boot and sync dashboard card
  ───────────────────────────────────────────────────────── */
  window._initLaunchCenter = function () {
    launchRef.get().then(function (snap) {
      var state = snap.exists ? snap.data() : {};
      window._lcState = state;
      syncDashboardCard(state);
    }).catch(function (e) {
      console.error('[LAUNCH] init error', e);
    });
  };

})();
