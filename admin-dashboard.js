(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var fmtDate   = window._fmtDate;
  var ordersRef = window._ordersRef;
  var db        = window._adminDB;
  var showToast = window._showToast;

  /* ─── BRAND IDENTITY ─────────────────────────────────────────────────────── */
  var HOUSE_BRANDS = [
    { key: 'JANEDORE',  color: '#1a56db', bg: 'rgba(26,86,219,0.07)'   },
    { key: 'NIRIUS CO', color: '#6e40c9', bg: 'rgba(110,64,201,0.07)'  },
    { key: 'THATO',     color: '#111111', bg: 'rgba(17,17,17,0.06)'    }
  ];

  var _activeFilters = { 'JANEDORE': true, 'NIRIUS CO': true, 'THATO': true };
  var _allOrders     = [];
  var _mcView        = 'overview';

  /* ─── FIRESTORE COLLECTIONS ──────────────────────────────────────────────── */
  var projectsRef     = db.collection('launch_projects');   // core object
  var suppliersRef    = db.collection('suppliers');
  var waitingOnRef    = db.collection('waiting_on');
  var founderNotesRef = db.collection('founder_notes');
  var winsRef         = db.collection('recent_wins');
  var milestonesRef   = db.collection('milestones');

  window._projectsRef     = projectsRef;
  window._suppliersRef    = suppliersRef;
  window._waitingOnRef    = waitingOnRef;
  window._founderNotesRef = founderNotesRef;
  window._winsRef         = winsRef;
  window._milestonesRef   = milestonesRef;

  /* ─── LAUNCH STAGE TEMPLATES ─────────────────────────────────────────────── */
  var STAGE_TEMPLATES = {
    'Product': [
      'Concept','Moodboard','Sketches','Supplier Found',
      'Sample Requested','Sample Shipped','Sample Received',
      'Revisions Complete','Production Approved',
      'Photography Complete','Product Upload Complete','Launch Ready'
    ],
    'Eyewear': [
      'Concept','Sketches','Supplier Found',
      'Sample Requested','Sample Shipped','Sample Received',
      'Pouch Design Complete','Photography Complete',
      'Product Upload Complete','Launch Ready'
    ],
    'Fragrance': [
      'Fragrance Direction','Formula Development',
      'Bottle Supplier','Bottle Design','Packaging Design',
      'Sample Bottles','Photography','Product Upload','Launch Ready'
    ],
    'Jewelry': [
      'Collection Direction','Piece Designs Complete',
      'Manufacturer Confirmed','Samples Requested','Samples Received',
      'Photography','Product Upload','Launch Ready'
    ],
    'Packaging': [
      'Design Concept','Supplier Identified','Quote Received',
      'Design Approved','Sample Ordered','Sample Received',
      'Sample Approved','Production Ordered','Received'
    ],
    'Campaign': [
      'Moodboard','Creative Direction Approved',
      'Models Confirmed','Photographer Confirmed','Studio Confirmed',
      'Shoot Complete','Editing Complete',
      'Content Scheduled','Campaign Ready'
    ],
    'Custom': []
  };

  var WAITING_CATEGORIES = ['Supplier','Manufacturer','Sample','Packaging','Design','Photography','Quote','Logistics','Other'];

  /* ══════════════════════════════════════════════════════════════════════════
     MAIN ENTRY POINT
  ══════════════════════════════════════════════════════════════════════════ */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    injectMCStyles();
    mc.innerHTML =
      '<div class="mc-shell">' +
        buildSideNav() +
        '<div class="mc-content-col">' +
          buildMobileNav() +
          '<div id="mc-view-area" class="mc-view-area"></div>' +
        '</div>' +
      '</div>';
    renderView();
  };

  /* ─── SIDE NAV ───────────────────────────────────────────────────────────── */
  function buildSideNav() {
    var items = [
      { id: 'overview',   icon: 'ph-squares-four',    label: 'Overview'     },
      { id: 'projects',   icon: 'ph-rocket-launch',   label: 'Projects'     },
      { id: 'suppliers',  icon: 'ph-factory',         label: 'Suppliers'    },
      { id: 'waiting',    icon: 'ph-hourglass-medium',label: 'Waiting On'   },
      { id: 'wins',       icon: 'ph-trophy',          label: 'Recent Wins'  },
      { id: 'milestones', icon: 'ph-calendar-check',  label: 'Milestones'   },
      { id: 'notes',      icon: 'ph-notebook-text',   label: 'Founder Notes'}
    ];

    return '<nav class="mc-sidenav">' +
      '<div class="mc-sidenav-brand">' +
        '<div class="mc-sidenav-wordmark">MISSION CONTROL</div>' +
        '<div class="mc-sidenav-date">' +
          new Date().toLocaleDateString('en-ZA',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase() +
        '</div>' +
      '</div>' +
      items.map(function(item){
        return '<button class="mc-sidenav-btn' + (_mcView === item.id ? ' mc-active' : '') + '" ' +
          'onclick="window._mcNav(\'' + item.id + '\')">' +
          '<i class="ph-light ' + item.icon + '"></i>' +
          '<span>' + item.label + '</span>' +
        '</button>';
      }).join('') +
    '</nav>';
  }

  /* ─── MOBILE NAV (always in DOM, hidden on desktop) ─────────────────────── */
  function buildMobileNav() {
    var items = [
      { id: 'overview',   label: 'Overview'  },
      { id: 'projects',   label: 'Projects'  },
      { id: 'suppliers',  label: 'Suppliers' },
      { id: 'waiting',    label: 'Waiting'   },
      { id: 'wins',       label: 'Wins'      },
      { id: 'milestones', label: 'Dates'     },
      { id: 'notes',      label: 'Notes'     }
    ];
    return '<div class="mc-mobile-nav-wrap">' +
      items.map(function(item){
        return '<button class="mc-mobile-pill' + (_mcView === item.id ? ' mc-active' : '') + '" ' +
          'onclick="window._mcNav(\'' + item.id + '\')">' + item.label + '</button>';
      }).join('') +
    '</div>';
  }

  window._mcNav = function(view) {
    _mcView = view;
    /* Update both navs by matching onclick attribute */
    document.querySelectorAll('.mc-sidenav-btn, .mc-mobile-pill').forEach(function(b){
      var match = b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'" + view + "'") > -1;
      b.classList.toggle('mc-active', match);
    });
    renderView();
  };

  function renderView() {
    var area = safeEl('mc-view-area');
    if (!area) return;
    area.innerHTML = '<div class="mc-spinner"><i class="ph-light ph-circle-notch mc-spin"></i></div>';
    switch (_mcView) {
      case 'overview':   viewOverview(area);   break;
      case 'projects':   viewProjects(area);   break;
      case 'suppliers':  viewSuppliers(area);  break;
      case 'waiting':    viewWaiting(area);    break;
      case 'wins':       viewWins(area);       break;
      case 'milestones': viewMilestones(area); break;
      case 'notes':      viewNotes(area);      break;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: OVERVIEW — the founder dashboard
  ══════════════════════════════════════════════════════════════════════════ */
  function viewOverview(area) {
    Promise.all([
      projectsRef.get(),
      suppliersRef.get(),
      waitingOnRef.where('resolved','==',false).get().catch(function(){ return {docs:[]}; }),
      winsRef.orderBy('createdAt','desc').limit(5).get().catch(function(){ return {docs:[]}; }),
      milestonesRef.orderBy('date','asc').limit(6).get().catch(function(){ return {docs:[]}; }),
      ordersRef.get().catch(function(){ return {docs:[]}; })
    ]).then(function(res){
      var projects   = res[0].docs.map(d2o);
      var suppliers  = res[1].docs.map(d2o);
      var waiting    = res[2].docs.map(d2o);
      var wins       = res[3].docs.map(d2o);
      var milestones = res[4].docs.map(d2o);
      var orders     = res[5].docs.map(d2o);
      _allOrders     = orders;

      /* Readiness scores */
      var readiness = calcReadiness(projects);

      /* Blocked projects = have incomplete stage but supplier waiting */
      var blocked = projects.filter(function(p){
        return p.stages && p.stages.some(function(s){ return !s.done; }) && p.blocked;
      });

      /* In transit */
      var inTransit = projects.filter(function(p){
        return p.stages && p.stages.some(function(s){
          return !s.done && (s.name === 'Sample Shipped' || s.name === 'Sample Received' || s.name === 'Sample Bottles');
        });
      });

      /* Today's priorities: next incomplete stage for each project, sorted by priority */
      var priorities = [];
      projects.forEach(function(p){
        if (!p.stages) return;
        var nextStage = p.stages.find(function(s){ return !s.done; });
        if (nextStage) priorities.push({ project: p, stage: nextStage.name });
      });
      priorities = priorities.slice(0, 8);

      area.innerHTML =

        /* ── Readiness hero ── */
        '<div class="ov-hero">' +
          '<div class="ov-hero-left">' +
            '<div class="ov-eyebrow">Fashion House Status</div>' +
            '<div class="ov-score-row">' +
              '<div class="ov-score">' + readiness.overall + '<span class="ov-score-unit">%</span></div>' +
              '<div class="ov-score-info">' +
                '<div class="ov-score-label">Launch Readiness</div>' +
                '<div class="ov-score-note">' + readiness.note + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ov-readiness-bars">' +
              ovBar('Product Readiness',  readiness.product)  +
              ovBar('Content Readiness',  readiness.content)  +
              ovBar('Packaging Readiness',readiness.packaging) +
              ovBar('Website Readiness',  readiness.website)  +
            '</div>' +
          '</div>' +
          '<div class="ov-hero-right">' +
            '<div class="ov-stats">' +
              ovStat(projects.length,          'Projects',        '#1a56db') +
              ovStat(readiness.launchReady,     'Launch Ready',    '#1a8742') +
              ovStat(inTransit.length,          'In Transit',      '#6e40c9') +
              ovStat(waiting.length,            'Waiting On',      '#c07000') +
              ovStat(blocked.length,            'Blocked',         '#c0392b') +
              ovStat(suppliers.length,          'Suppliers',       '#111111') +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ── Today's Priorities ── */
        '<div class="ov-section-row">' +
          '<div class="ov-section-title">Today\'s Priorities</div>' +
          '<button class="ov-section-link" onclick="window._mcNav(\'projects\')">View Projects</button>' +
        '</div>' +
        '<div class="ov-priorities">' +
          (priorities.length ?
            priorities.map(function(item){
              var brand = getBrandMeta(item.project.brand);
              return '<div class="ov-priority-row" onclick="window._mcOpenProject(\'' + item.project.id + '\')">' +
                '<span class="ov-priority-dot" style="background:' + brand.color + ';"></span>' +
                '<div class="ov-priority-info">' +
                  '<div class="ov-priority-name">' + esc(item.project.name) + '</div>' +
                  '<div class="ov-priority-stage">Next: ' + esc(item.stage) + '</div>' +
                '</div>' +
                (item.project.blocked ? '<span class="ov-blocked-badge">Blocked</span>' : '') +
                '<i class="ph-light ph-arrow-right ov-priority-arrow"></i>' +
              '</div>';
            }).join('') :
            '<div class="ov-empty-row"><i class="ph-light ph-check-circle" style="color:#1a8742;font-size:18px;"></i> All projects have been completed or no projects added yet.</div>'
          ) +
        '</div>' +

        /* ── In Transit ── */
        (inTransit.length ?
          '<div class="ov-section-row">' +
            '<div class="ov-section-title">In Transit</div>' +
          '</div>' +
          '<div class="ov-transit-list">' +
            inTransit.map(function(p){
              var brand = getBrandMeta(p.brand);
              var transitStage = p.stages.find(function(s){ return !s.done && (s.name === 'Sample Shipped' || s.name === 'Sample Received' || s.name === 'Sample Bottles'); });
              return '<div class="ov-transit-card">' +
                '<div class="ov-transit-dot" style="background:' + brand.color + ';"></div>' +
                '<div>' +
                  '<div class="ov-transit-name">' + esc(p.name) + '</div>' +
                  '<div class="ov-transit-stage">' + esc(transitStage ? transitStage.name : '—') + '</div>' +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' : ''
        ) +

        /* ── Waiting On ── */
        (waiting.length ?
          '<div class="ov-section-row">' +
            '<div class="ov-section-title">Waiting On</div>' +
            '<button class="ov-section-link" onclick="window._mcNav(\'waiting\')">View All</button>' +
          '</div>' +
          '<div class="ov-waiting-list">' +
            waiting.slice(0,5).map(function(w){
              var age = w.createdAt ? Math.round((Date.now() - (w.createdAt.toDate ? w.createdAt.toDate() : new Date(w.createdAt)).getTime()) / 86400000) : 0;
              return '<div class="ov-waiting-row' + (age >= 5 ? ' urgent' : '') + '" onclick="window._mcNav(\'waiting\')">' +
                '<i class="ph-light ph-hourglass" style="font-size:15px;flex-shrink:0;color:' + (age >= 5 ? '#c0392b' : 'var(--muted)') + ';"></i>' +
                '<span class="ov-waiting-text">' + esc(w.description) + '</span>' +
                '<span class="ov-waiting-age">' + age + 'd</span>' +
              '</div>';
            }).join('') +
          '</div>' : ''
        ) +

        /* ── Recent Wins ── */
        (wins.length ?
          '<div class="ov-section-row">' +
            '<div class="ov-section-title">Recent Wins</div>' +
            '<button class="ov-section-link" onclick="window._mcNav(\'wins\')">View All</button>' +
          '</div>' +
          '<div class="ov-wins-list">' +
            wins.map(function(w){
              return '<div class="ov-win-card">' +
                '<i class="ph-light ph-star ov-win-icon"></i>' +
                '<div>' +
                  '<div class="ov-win-text">' + esc(w.title) + '</div>' +
                  (w.createdAt ? '<div class="ov-win-date">' + fmtDate(w.createdAt) + '</div>' : '') +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' : ''
        ) +

        /* ── Upcoming Milestones ── */
        (milestones.length ?
          '<div class="ov-section-row">' +
            '<div class="ov-section-title">Upcoming Milestones</div>' +
            '<button class="ov-section-link" onclick="window._mcNav(\'milestones\')">View All</button>' +
          '</div>' +
          '<div class="ov-milestones-list">' +
            milestones.map(function(m){
              var d = m.date ? (m.date.toDate ? m.date.toDate() : new Date(m.date)) : null;
              var daysUntil = d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null;
              var urgent = daysUntil !== null && daysUntil <= 7;
              return '<div class="ov-milestone-row' + (urgent ? ' urgent' : '') + '">' +
                '<div class="ov-milestone-date">' +
                  (d ? d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'}) : '—') +
                '</div>' +
                '<div class="ov-milestone-title">' + esc(m.title) + '</div>' +
                (daysUntil !== null ? '<div class="ov-milestone-days' + (urgent ? ' urgent' : '') + '">' + (daysUntil > 0 ? daysUntil + 'd' : 'Today') + '</div>' : '') +
              '</div>';
            }).join('') +
          '</div>' : ''
        ) +

        /* ── Orders Chart ── */
        '<div class="ov-section-row" style="margin-top:6px;">' +
          '<div class="ov-section-title">Order Activity</div>' +
        '</div>' +
        '<div class="mc-card" style="margin-bottom:12px;">' +
          '<div class="mc-card-header">' +
            '<span class="mc-card-title">Orders — Last 30 Days</span>' +
            '<div style="display:flex;align-items:center;gap:7px;margin-left:auto;">' +
              '<div class="dash-live-pill" id="dash-live-pill"><span class="dash-live-dot"></span><span id="dash-live-count">Live</span></div>' +
              HOUSE_BRANDS.map(function(b){
                var safeKey = b.key.replace(/\s/g,'-');
                return '<button class="dash-brand-toggle active" id="dash-toggle-' + safeKey + '" ' +
                  'onclick="window._dashToggleBrand(\'' + b.key + '\')" style="--brand-color:' + b.color + ';">' +
                  '<span class="dash-brand-dot" style="background:' + b.color + ';"></span>' + b.key +
                '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
        '</div>' +

        /* ── Day popup (preserved) ── */
        '<div id="dash-day-popup" class="dash-day-popup" style="display:none;">' +
          '<div class="dash-day-popup-inner">' +
            '<div class="dash-day-popup-header">' +
              '<span class="dash-day-popup-title" id="dash-popup-title">—</span>' +
              '<button class="dash-day-popup-close" onclick="window._dashClosePopup()"><i class="ph-light ph-x"></i></button>' +
            '</div>' +
            '<div id="dash-popup-body" class="dash-day-popup-body"></div>' +
          '</div>' +
        '</div>';

      if (window._initLaunchCenter) window._initLaunchCenter();
      buildChart(orders);

    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  function ovBar(label, pct) {
    return '<div class="ov-bar-row">' +
      '<span class="ov-bar-label">' + label + '</span>' +
      '<div class="ov-bar-track"><div class="ov-bar-fill" style="width:' + pct + '%;"></div></div>' +
      '<span class="ov-bar-pct">' + pct + '%</span>' +
    '</div>';
  }

  function ovStat(value, label, color) {
    return '<div class="ov-stat-card">' +
      '<div class="ov-stat-value" style="color:' + color + ';">' + value + '</div>' +
      '<div class="ov-stat-label">' + label + '</div>' +
    '</div>';
  }

  /* ─── READINESS CALCULATOR ───────────────────────────────────────────────── */
  function calcReadiness(projects) {
    if (!projects.length) return { overall: 0, product: 0, content: 0, packaging: 0, website: 0, launchReady: 0, note: 'No projects yet — add your first launch project' };

    var productProjects   = projects.filter(function(p){ return p.type !== 'Campaign' && p.type !== 'Packaging'; });
    var campaignProjects  = projects.filter(function(p){ return p.type === 'Campaign'; });
    var packagingProjects = projects.filter(function(p){ return p.type === 'Packaging'; });
    var launchReady       = projects.filter(function(p){ return p.launchReady; }).length;

    function stagesPct(list) {
      if (!list.length) return 0;
      var total = 0, done = 0;
      list.forEach(function(p){
        if (!p.stages || !p.stages.length) return;
        total += p.stages.length;
        done  += p.stages.filter(function(s){ return s.done; }).length;
      });
      return total ? Math.round((done / total) * 100) : 0;
    }

    /* Website readiness: any project with 'Product Upload Complete' done */
    var uploadDone = projects.filter(function(p){
      return p.stages && p.stages.some(function(s){ return s.done && s.name === 'Product Upload Complete'; });
    }).length;
    var websitePct = projects.length ? Math.round((uploadDone / projects.length) * 100) : 0;

    var product   = stagesPct(productProjects);
    var content   = stagesPct(campaignProjects);
    var packaging = stagesPct(packagingProjects);
    var overall   = Math.round((product + content + packaging + websitePct) / 4);

    var note = overall < 20 ? 'Early stage — your launch journey begins here' :
               overall < 45 ? 'Building momentum — keep pushing' :
               overall < 70 ? 'Strong progress — finalise samples and campaigns' :
               overall < 90 ? 'Almost there — close the final gaps' :
                              'Near launch-ready — final checks';

    return { overall: overall, product: product, content: content, packaging: packaging, website: websitePct, launchReady: launchReady, note: note };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: PROJECTS — the core launch journey tracker
  ══════════════════════════════════════════════════════════════════════════ */
  function viewProjects(area) {
    projectsRef.get().then(function(snap){
      var projects = snap.docs.map(d2o);

      /* Group by brand */
      var byBrand = {};
      HOUSE_BRANDS.forEach(function(b){ byBrand[b.key] = []; });
      projects.forEach(function(p){
        var key = p.brand || 'JANEDORE';
        if (!byBrand[key]) byBrand[key] = [];
        byBrand[key].push(p);
      });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div>' +
            '<div class="mc-view-title">Launch Projects</div>' +
            '<div class="mc-view-sub">' + projects.length + ' projects tracked</div>' +
          '</div>' +
          '<button class="mc-action-btn" onclick="window._mcNewProject()"><i class="ph-light ph-plus"></i> New Project</button>' +
        '</div>' +

        HOUSE_BRANDS.map(function(brand){
          var list = byBrand[brand.key] || [];
          return '<div class="proj-brand-group">' +
            '<div class="proj-brand-header">' +
              '<div class="proj-brand-dot" style="background:' + brand.color + ';"></div>' +
              '<div class="proj-brand-name">' + brand.key + '</div>' +
              '<div class="proj-brand-count">' + list.length + ' project' + (list.length !== 1 ? 's' : '') + '</div>' +
              '<button class="mc-action-btn-sm" onclick="window._mcNewProjectFor(\'' + brand.key + '\')">+ Add</button>' +
            '</div>' +
            (list.length ?
              '<div class="proj-list">' +
                list.map(function(p){ return renderProjectCard(p, brand); }).join('') +
              '</div>' :
              '<div class="proj-empty-brand">No projects yet for ' + brand.key + '.</div>'
            ) +
          '</div>';
        }).join('');

    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  function renderProjectCard(p, brand) {
    var stages   = p.stages || [];
    var total    = stages.length;
    var done     = stages.filter(function(s){ return s.done; }).length;
    var pct      = total ? Math.round((done / total) * 100) : 0;
    var nextStage= stages.find(function(s){ return !s.done; });
    var isReady  = pct === 100 || p.launchReady;

    return '<div class="proj-card" onclick="window._mcOpenProject(\'' + p.id + '\')">' +
      '<div class="proj-card-top">' +
        '<div class="proj-card-info">' +
          '<div class="proj-card-name">' + esc(p.name) + '</div>' +
          '<div class="proj-card-meta">' + esc(p.type || 'Product') +
            (p.blocked ? ' · <span style="color:#c0392b;font-weight:600;">Blocked</span>' : '') +
          '</div>' +
        '</div>' +
        (isReady ?
          '<span class="proj-ready-badge">Launch Ready</span>' :
          '<span class="proj-pct-badge">' + pct + '%</span>'
        ) +
      '</div>' +
      '<div class="proj-progress-track"><div class="proj-progress-fill" style="width:' + pct + '%;background:' + (isReady ? '#1a8742' : brand.color) + ';"></div></div>' +
      '<div class="proj-stages-row">' +
        stages.map(function(s){
          return '<div class="proj-stage-dot' + (s.done ? ' done' : '') + '" title="' + esc(s.name) + '" style="' + (s.done ? 'background:' + brand.color + ';' : '') + '"></div>';
        }).join('') +
      '</div>' +
      (nextStage ? '<div class="proj-next-stage">Next: ' + esc(nextStage.name) + '</div>' : '') +
    '</div>';
  }

  /* ─── PROJECT DETAIL MODAL ───────────────────────────────────────────────── */
  window._mcOpenProject = function(id) {
    projectsRef.doc(id).get().then(function(doc){
      if (!doc.exists) return;
      var p     = Object.assign({ id: doc.id }, doc.data());
      var brand = getBrandMeta(p.brand);
      var stages= p.stages || [];
      var done  = stages.filter(function(s){ return s.done; }).length;
      var pct   = stages.length ? Math.round((done / stages.length) * 100) : 0;

      var html =
        '<div class="modal" style="max-width:600px;">' +
          '<div class="modal-handle"></div>' +
          '<div style="padding:16px 20px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
            '<div>' +
              '<div style="font-size:9px;font-weight:700;letter-spacing:.14em;color:' + brand.color + ';margin-bottom:4px;">' + esc(p.brand) + '</div>' +
              '<div class="modal-title" style="padding:0;border:none;font-size:22px;">' + esc(p.name) + '</div>' +
              '<div style="font-size:11px;color:var(--muted);margin-top:3px;">' + esc(p.type||'Product') + ' · ' + pct + '% complete</div>' +
            '</div>' +
            '<button class="modal-close" style="position:relative;top:0;right:0;" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
          '</div>' +

          /* Progress bar */
          '<div style="padding:12px 20px;">' +
            '<div style="height:4px;background:var(--border-med);border-radius:2px;overflow:hidden;">' +
              '<div style="height:100%;border-radius:2px;background:' + brand.color + ';width:' + pct + '%;transition:width .6s;"></div>' +
            '</div>' +
          '</div>' +
          '<hr class="divider" style="margin:0;">' +

          /* Checklist */
          '<div style="padding:8px 0 4px;">' +
            stages.map(function(s, idx){
              return '<div class="lc-task-row" onclick="window._mcToggleStage(\'' + id + '\',' + idx + ',' + !s.done + ')">' +
                '<div class="lc-checkbox' + (s.done ? ' checked' : '') + '">' +
                  (s.done ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : '') +
                '</div>' +
                '<span class="lc-task-label' + (s.done ? ' done' : '') + '">' + esc(s.name) + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<hr class="divider" style="margin:4px 0;">' +

          /* Notes + blocked toggle */
          '<div class="form-group">' +
            '<label>Project Notes</label>' +
            '<textarea id="proj-modal-notes">' + esc(p.notes || '') + '</textarea>' +
          '</div>' +
          '<div style="padding:0 16px 4px;display:flex;align-items:center;gap:10px;">' +
            '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text2);cursor:pointer;">' +
              '<input type="checkbox" id="proj-modal-blocked"' + (p.blocked ? ' checked' : '') + ' style="width:14px;height:14px;">' +
              'Mark as blocked' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text2);cursor:pointer;margin-left:10px;">' +
              '<input type="checkbox" id="proj-modal-ready"' + (p.launchReady ? ' checked' : '') + ' style="width:14px;height:14px;">' +
              'Launch Ready' +
            '</label>' +
          '</div>' +
          '<div style="padding:12px 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteProject(\'' + id + '\')">Delete</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Close</button>' +
            '<button class="btn btn-primary btn-sm" onclick="window._mcSaveProjectMeta(\'' + id + '\')">Save</button>' +
          '</div>' +
        '</div>';

      window._mountModal(html);
    });
  };

  window._mcToggleStage = function(id, idx, newVal) {
    projectsRef.doc(id).get().then(function(doc){
      if (!doc.exists) return;
      var stages = (doc.data().stages || []).slice();
      if (stages[idx]) stages[idx].done = newVal;
      return projectsRef.doc(id).update({ stages: stages });
    }).then(function(){
      /* Refresh the checkbox visually */
      var rows = document.querySelectorAll('.lc-task-row');
      if (rows[idx]) {
        var box   = rows[idx].querySelector('.lc-checkbox');
        var label = rows[idx].querySelector('.lc-task-label');
        if (box)   { box.classList.toggle('checked', newVal); box.innerHTML = newVal ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : ''; }
        if (label) label.classList.toggle('done', newVal);
        rows[idx].setAttribute('onclick', 'window._mcToggleStage(\'' + id + '\',' + idx + ',' + !newVal + ')');
      }
    }).catch(function(e){ showToast(e.message, 'error'); });
  };

  window._mcSaveProjectMeta = function(id) {
    var notes   = (safeEl('proj-modal-notes')   || {}).value || '';
    var blocked = !!(safeEl('proj-modal-blocked') || {}).checked;
    var ready   = !!(safeEl('proj-modal-ready')   || {}).checked;
    projectsRef.doc(id).update({ notes: notes, blocked: blocked, launchReady: ready })
      .then(function(){ window._closeModal(); showToast('Project saved'); })
      .catch(function(e){ showToast(e.message, 'error'); });
  };

  window._mcDeleteProject = function(id) {
    if (!confirm('Delete this project?')) return;
    projectsRef.doc(id).delete().then(function(){
      window._closeModal();
      showToast('Project deleted');
      window._mcNav('projects');
    }).catch(function(e){ showToast(e.message, 'error'); });
  };

  /* ─── NEW PROJECT MODAL ──────────────────────────────────────────────────── */
  window._mcNewProject    = function(){ showNewProjectModal(''); };
  window._mcNewProjectFor = function(brand){ showNewProjectModal(brand); };

  function showNewProjectModal(presetBrand) {
    var typeKeys = Object.keys(STAGE_TEMPLATES);
    var html =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">New Launch Project</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Project Name</label><input id="np-name" placeholder="e.g. Handbag Collection, SS26 Campaign"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Brand</label><select id="np-brand">' +
            HOUSE_BRANDS.map(function(b){ return '<option value="' + b.key + '"' + (b.key === presetBrand ? ' selected' : '') + '>' + b.key + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Type</label><select id="np-type" onchange="window._mcPreviewStages()">' +
            typeKeys.map(function(k){ return '<option value="' + k + '">' + k + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        /* Stage preview */
        '<div class="form-group">' +
          '<label>Launch Journey <span style="font-weight:400;color:var(--muted);text-transform:none;letter-spacing:0;">(edit after creating)</span></label>' +
          '<div id="np-stages-preview" class="np-stages-preview">' + renderStagePreview('Product') + '</div>' +
        '</div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcCreateProject()">Create Project</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  }

  window._mcPreviewStages = function() {
    var sel = safeEl('np-type');
    var preview = safeEl('np-stages-preview');
    if (sel && preview) preview.innerHTML = renderStagePreview(sel.value);
  };

  function renderStagePreview(type) {
    var stages = STAGE_TEMPLATES[type] || [];
    if (!stages.length) return '<div style="font-size:12px;color:var(--muted);padding:4px 0;">Custom — you\'ll add stages after creating.</div>';
    return stages.map(function(s){
      return '<div class="np-stage-item"><i class="ph-light ph-circle" style="font-size:13px;color:var(--muted2);"></i> ' + esc(s) + '</div>';
    }).join('');
  }

  window._mcCreateProject = function() {
    var name  = ((safeEl('np-name') || {}).value || '').trim();
    var brand = (safeEl('np-brand') || {}).value || 'JANEDORE';
    var type  = (safeEl('np-type')  || {}).value || 'Product';
    if (!name) { showToast('Enter a project name', 'error'); return; }
    var stageNames = STAGE_TEMPLATES[type] || [];
    var stages = stageNames.map(function(s){ return { name: s, done: false }; });
    projectsRef.add({
      name: name, brand: brand, type: type,
      stages: stages, notes: '',
      blocked: false, launchReady: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(ref){
      window._closeModal();
      showToast('Project created');
      /* Open it immediately */
      window._mcOpenProject(ref.id);
    }).catch(function(e){ showToast(e.message, 'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: SUPPLIERS
  ══════════════════════════════════════════════════════════════════════════ */
  function viewSuppliers(area) {
    suppliersRef.get().then(function(snap){
      var suppliers = snap.docs.map(d2o);
      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Suppliers</div><div class="mc-view-sub">' + suppliers.length + ' suppliers</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcNewSupplier()"><i class="ph-light ph-plus"></i> Add Supplier</button>' +
        '</div>' +
        (suppliers.length ?
          '<div class="mc-table-wrap">' +
            '<table class="mc-table">' +
              '<thead><tr><th>Supplier</th><th>Country</th><th>Category</th><th>MOQ</th><th>Lead Time</th><th>Status</th><th></th></tr></thead>' +
              '<tbody>' +
                suppliers.map(function(s){
                  return '<tr onclick="window._mcEditSupplier(\'' + s.id + '\')">' +
                    '<td><div style="font-weight:400;">' + esc(s.name||'—') + '</div>' +
                      (s.brand ? '<div class="cell-muted">' + esc(s.brand) + '</div>' : '') +
                    '</td>' +
                    '<td class="cell-muted">' + esc(s.country||'—') + '</td>' +
                    '<td class="cell-muted">' + esc(s.category||'—') + '</td>' +
                    '<td class="cell-muted">' + esc(s.moq||'—') + '</td>' +
                    '<td class="cell-muted">' + esc(s.leadTime||'—') + '</td>' +
                    '<td>' + statusPill(s.status) + '</td>' +
                    '<td><button class="mc-icon-btn" onclick="event.stopPropagation();window._mcEditSupplier(\'' + s.id + '\')"><i class="ph-light ph-pencil-simple"></i></button></td>' +
                  '</tr>';
                }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' :
          mcEmpty('ph-factory','No suppliers yet','Add your first supplier')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcNewSupplier  = function(){ showSupplierModal(null); };
  window._mcEditSupplier = function(id){
    suppliersRef.doc(id).get().then(function(doc){
      if (doc.exists) showSupplierModal(d2o(doc));
    });
  };

  function showSupplierModal(s) {
    var isEdit = !!s;
    var statuses = ['Prospecting','Contacted','Sampling','Confirmed','Active','Paused','Dropped'];
    var html =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Supplier' : 'Add Supplier') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Supplier Name</label><input id="ms-name" value="' + esc(s ? s.name : '') + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Country</label><input id="ms-country" value="' + esc(s ? s.country : '') + '"></div>' +
          '<div class="form-group"><label>Category</label><input id="ms-category" value="' + esc(s ? s.category : '') + '" placeholder="e.g. Leather goods, Packaging"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Brand / Project</label><input id="ms-brand" value="' + esc(s ? s.brand : '') + '" placeholder="e.g. JANEDORE Handbags"></div>' +
          '<div class="form-group"><label>Status</label><select id="ms-status">' +
            statuses.map(function(st){ return '<option' + (s && s.status === st ? ' selected' : '') + '>' + st + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>MOQ</label><input id="ms-moq" value="' + esc(s ? s.moq : '') + '"></div>' +
          '<div class="form-group"><label>Lead Time</label><input id="ms-lead" value="' + esc(s ? s.leadTime : '') + '" placeholder="e.g. 6–8 weeks"></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea id="ms-notes">' + esc(s ? (s.notes||'') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteSupplier(\'' + s.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveSupplier(\'' + (isEdit ? s.id : '') + '\')">' + (isEdit ? 'Save' : 'Add') + '</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  }

  window._mcSaveSupplier = function(id){
    var data = {
      name: (safeEl('ms-name')||{}).value||'', country: (safeEl('ms-country')||{}).value||'',
      category: (safeEl('ms-category')||{}).value||'', brand: (safeEl('ms-brand')||{}).value||'',
      status: (safeEl('ms-status')||{}).value||'Prospecting',
      moq: (safeEl('ms-moq')||{}).value||'', leadTime: (safeEl('ms-lead')||{}).value||'',
      notes: (safeEl('ms-notes')||{}).value||'',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var op = id ? suppliersRef.doc(id).update(data) : suppliersRef.add(Object.assign(data,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
    op.then(function(){ window._closeModal(); showToast(id ? 'Supplier updated' : 'Supplier added'); window._mcNav('suppliers'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteSupplier = function(id){
    if (!confirm('Delete supplier?')) return;
    suppliersRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Supplier removed'); window._mcNav('suppliers'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: WAITING ON
  ══════════════════════════════════════════════════════════════════════════ */
  function viewWaiting(area) {
    waitingOnRef.where('resolved','==',false).get().catch(function(){ return waitingOnRef.get(); })
    .then(function(snap){
      var items = snap.docs.map(d2o).filter(function(i){ return !i.resolved; });
      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Waiting On</div><div class="mc-view-sub">Items outside your control</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddWaiting()"><i class="ph-light ph-plus"></i> Add Item</button>' +
        '</div>' +
        (items.length ?
          '<div class="waiting-list">' +
            items.map(function(w){
              var age = w.createdAt ? Math.round((Date.now() - (w.createdAt.toDate ? w.createdAt.toDate() : new Date(w.createdAt)).getTime()) / 86400000) : 0;
              var urgent = age >= 5;
              return '<div class="waiting-card' + (urgent ? ' urgent' : '') + '">' +
                '<div class="waiting-card-top">' +
                  '<span class="waiting-cat-pill">' + esc(w.category||'Other') + '</span>' +
                  '<span class="waiting-age' + (urgent ? ' urgent' : '') + '">' + age + 'd ago</span>' +
                '</div>' +
                '<div class="waiting-desc">' + esc(w.description) + '</div>' +
                (w.project ? '<div class="waiting-project">Re: ' + esc(w.project) + '</div>' : '') +
                '<button class="waiting-resolve-btn" onclick="window._mcResolveWaiting(\'' + w.id + '\')">Mark Resolved</button>' +
              '</div>';
            }).join('') +
          '</div>' :
          mcEmpty('ph-hourglass','Nothing pending','All waiting items have been resolved')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcAddWaiting = function(){
    var html =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">Add Waiting Item</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>What are you waiting for?</label>' +
          '<textarea id="mw-desc" rows="3" placeholder="Waiting for supplier quote on 500 units leather handbags..."></textarea>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Category</label><select id="mw-cat">' +
            WAITING_CATEGORIES.map(function(c){ return '<option>' + c + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Related Project (optional)</label><input id="mw-project" placeholder="e.g. JANEDORE Handbags"></div>' +
        '</div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveWaiting()">Add</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  };
  window._mcSaveWaiting = function(){
    var data = {
      description: (safeEl('mw-desc')||{}).value||'',
      category:    (safeEl('mw-cat')||{}).value||'Other',
      project:     (safeEl('mw-project')||{}).value||'',
      resolved:    false,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    };
    waitingOnRef.add(data).then(function(){ window._closeModal(); showToast('Added'); window._mcNav('waiting'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcResolveWaiting = function(id){
    waitingOnRef.doc(id).update({ resolved: true })
      .then(function(){ showToast('Resolved'); window._mcNav('waiting'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: RECENT WINS
  ══════════════════════════════════════════════════════════════════════════ */
  function viewWins(area) {
    winsRef.orderBy('createdAt','desc').get().then(function(snap){
      var wins = snap.docs.map(d2o);
      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Recent Wins</div><div class="mc-view-sub">Celebrate progress</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddWin()"><i class="ph-light ph-plus"></i> Log Win</button>' +
        '</div>' +
        (wins.length ?
          '<div class="wins-grid">' +
            wins.map(function(w){
              return '<div class="win-card">' +
                '<div class="win-icon-wrap"><i class="ph-light ph-trophy"></i></div>' +
                '<div class="win-title">' + esc(w.title) + '</div>' +
                (w.note ? '<div class="win-note">' + esc(w.note) + '</div>' : '') +
                (w.createdAt ? '<div class="win-date">' + fmtDate(w.createdAt) + '</div>' : '') +
                '<button class="mc-icon-btn" style="margin-top:8px;" onclick="window._mcDeleteWin(\'' + w.id + '\')"><i class="ph-light ph-trash"></i></button>' +
              '</div>';
            }).join('') +
          '</div>' :
          mcEmpty('ph-trophy','No wins logged yet','Start celebrating your milestones')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcAddWin = function(){
    var html =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">Log a Win</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>What happened?</label><input id="mwin-title" placeholder="e.g. Supplier confirmed, Sample approved, Photoshoot booked"></div>' +
        '<div class="form-group"><label>Notes (optional)</label><textarea id="mwin-note" rows="2"></textarea></div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveWin()">Log It</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  };
  window._mcSaveWin = function(){
    var title = ((safeEl('mwin-title')||{}).value||'').trim();
    if (!title) { showToast('Add a title','error'); return; }
    winsRef.add({ title: title, note: (safeEl('mwin-note')||{}).value||'', createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function(){ window._closeModal(); showToast('Win logged'); window._mcNav('wins'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteWin = function(id){
    if (!confirm('Remove this win?')) return;
    winsRef.doc(id).delete().then(function(){ showToast('Removed'); window._mcNav('wins'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: MILESTONES
  ══════════════════════════════════════════════════════════════════════════ */
  function viewMilestones(area) {
    milestonesRef.orderBy('date','asc').get().catch(function(){ return milestonesRef.get(); })
    .then(function(snap){
      var items = snap.docs.map(d2o);
      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Milestones</div><div class="mc-view-sub">Key dates and deadlines</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddMilestone()"><i class="ph-light ph-plus"></i> Add Date</button>' +
        '</div>' +
        (items.length ?
          '<div class="milestone-list">' +
            items.map(function(m){
              var d = m.date ? (m.date.toDate ? m.date.toDate() : new Date(m.date)) : null;
              var daysUntil = d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null;
              var past = daysUntil !== null && daysUntil < 0;
              var soon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;
              return '<div class="milestone-row' + (soon ? ' soon' : past ? ' past' : '') + '">' +
                '<div class="milestone-date-col">' +
                  '<div class="milestone-day">' + (d ? d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'}) : '—') + '</div>' +
                  (daysUntil !== null ? '<div class="milestone-countdown' + (past ? ' past' : soon ? ' soon' : '') + '">' + (past ? 'Past' : daysUntil === 0 ? 'Today' : daysUntil + 'd') + '</div>' : '') +
                '</div>' +
                '<div class="milestone-info">' +
                  '<div class="milestone-title">' + esc(m.title) + '</div>' +
                  (m.project ? '<div class="cell-muted" style="font-size:11px;margin-top:2px;">' + esc(m.project) + '</div>' : '') +
                '</div>' +
                '<button class="mc-icon-btn" onclick="window._mcDeleteMilestone(\'' + m.id + '\')"><i class="ph-light ph-trash"></i></button>' +
              '</div>';
            }).join('') +
          '</div>' :
          mcEmpty('ph-calendar-check','No milestones yet','Add sample arrival dates, shoot dates, launch dates')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcAddMilestone = function(){
    var html =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">Add Milestone</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Title</label><input id="mm-title" placeholder="e.g. Sample arrival, Photoshoot, Launch date"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Date</label><input type="date" id="mm-date"></div>' +
          '<div class="form-group"><label>Related Project (optional)</label><input id="mm-project"></div>' +
        '</div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveMilestone()">Add</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  };
  window._mcSaveMilestone = function(){
    var title = ((safeEl('mm-title')||{}).value||'').trim();
    var dateVal = (safeEl('mm-date')||{}).value;
    if (!title || !dateVal) { showToast('Add a title and date','error'); return; }
    milestonesRef.add({
      title: title,
      date: firebase.firestore.Timestamp.fromDate(new Date(dateVal)),
      project: (safeEl('mm-project')||{}).value||'',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(){ window._closeModal(); showToast('Milestone added'); window._mcNav('milestones'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteMilestone = function(id){
    if (!confirm('Delete this milestone?')) return;
    milestonesRef.doc(id).delete().then(function(){ showToast('Deleted'); window._mcNav('milestones'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: FOUNDER NOTES
  ══════════════════════════════════════════════════════════════════════════ */
  function viewNotes(area) {
    founderNotesRef.orderBy('createdAt','desc').limit(60).get().then(function(snap){
      var notes = snap.docs.map(d2o);
      var tags  = ['General','Product','Packaging','Campaign','Supplier','Collection','Launch'];
      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Founder Notes</div><div class="mc-view-sub">Ideas, decisions, observations</div></div>' +
        '</div>' +
        '<div class="note-compose">' +
          '<textarea id="mc-note-input" class="note-textarea" placeholder="Found a better packaging supplier today. Need to compare pricing on the velvet pouches..."></textarea>' +
          '<div class="note-compose-footer">' +
            '<select id="mc-note-tag" class="note-tag-select">' +
              tags.map(function(t){ return '<option>' + t + '</option>'; }).join('') +
            '</select>' +
            '<button class="btn btn-primary btn-sm" onclick="window._mcSaveNote()"><i class="ph-light ph-pencil-line"></i> Save Note</button>' +
          '</div>' +
        '</div>' +
        (notes.length ?
          '<div class="notes-feed">' +
            notes.map(function(n){
              var d = n.createdAt ? (n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt)) : new Date();
              var ts = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
              return '<div class="note-card">' +
                '<div class="note-card-header">' +
                  (n.tag && n.tag !== 'General' ? '<span class="note-tag-badge">' + esc(n.tag) + '</span>' : '') +
                  '<span class="note-timestamp">' + ts + '</span>' +
                  '<button class="mc-icon-btn" onclick="window._mcDeleteNote(\'' + n.id + '\')"><i class="ph-light ph-trash"></i></button>' +
                '</div>' +
                '<div class="note-body">' + esc(n.text||'') + '</div>' +
              '</div>';
            }).join('') +
          '</div>' :
          mcEmpty('ph-notebook-text','No notes yet','Start capturing your ideas')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcSaveNote = function(){
    var text = ((safeEl('mc-note-input')||{}).value||'').trim();
    if (!text) { showToast('Write something first','error'); return; }
    founderNotesRef.add({ text: text, tag: (safeEl('mc-note-tag')||{}).value||'General', createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function(){ showToast('Note saved'); window._mcNav('notes'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteNote = function(id){
    if (!confirm('Delete note?')) return;
    founderNotesRef.doc(id).delete().then(function(){ showToast('Deleted'); window._mcNav('notes'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     ORDERS CHART (preserved from original)
  ══════════════════════════════════════════════════════════════════════════ */
  window._dashToggleBrand = function(key) {
    _activeFilters[key] = !_activeFilters[key];
    var safeKey = key.replace(/\s/g,'-');
    var btn = safeEl('dash-toggle-' + safeKey);
    if (btn) btn.classList.toggle('active', _activeFilters[key]);
    buildChart(_allOrders);
  };

  function buildDayMap() {
    var days = {}, now = Date.now(), DAY = 86400000;
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now - i * DAY);
      var k = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      days[k] = k;
    }
    return Object.keys(days);
  }

  function buildChart(orders) {
    var canvas = safeEl('orders-chart');
    if (!canvas || !window.Chart) return;
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }
    var labels = buildDayMap();
    var bdd = {}, bdo = {};
    HOUSE_BRANDS.forEach(function(b){
      bdd[b.key] = {}; bdo[b.key] = {};
      labels.forEach(function(l){ bdd[b.key][l] = 0; bdo[b.key][l] = []; });
    });
    orders.forEach(function(o){
      if (!o.createdAt) return;
      var d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      var lbl = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      var brand = (o.brand||'').toUpperCase();
      var matched = HOUSE_BRANDS.find(function(b){ return b.key === brand; });
      var key = matched ? matched.key : 'JANEDORE';
      if (bdd[key][lbl] === undefined) return;
      bdd[key][lbl]++; bdo[key][lbl].push(o);
    });
    window._dashBrandDayOrders = bdo;
    window._dashLabels = labels;
    var datasets = HOUSE_BRANDS.filter(function(b){ return _activeFilters[b.key]; }).map(function(b){
      return { label: b.key, data: labels.map(function(l){ return bdd[b.key][l]; }), borderColor: b.color, backgroundColor: b.bg, borderWidth: 1.5, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: b.color, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 };
    });
    window._analyticsChart = new Chart(canvas, {
      type: 'line', data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family: 'Manrope' }, maxTicksLimit: 8, color: '#bbb' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family: 'Manrope' }, precision: 0, color: '#bbb' }, beginAtZero: true }
        },
        onClick: function(evt, elements){ if (elements && elements.length) window._dashOpenDayPopup(labels[elements[0].index]); }
      }
    });
  }

  window._dashOpenDayPopup = function(dayLabel) {
    var popup = safeEl('dash-day-popup'), titleEl = safeEl('dash-popup-title'), bodyEl = safeEl('dash-popup-body');
    if (!popup||!titleEl||!bodyEl) return;
    var all = [];
    var bdo = window._dashBrandDayOrders || {};
    HOUSE_BRANDS.forEach(function(b){ if (bdo[b.key] && bdo[b.key][dayLabel]) bdo[b.key][dayLabel].forEach(function(o){ all.push(Object.assign({_color:b.color},o)); }); });
    titleEl.textContent = dayLabel;
    bodyEl.innerHTML = all.length ? all.map(function(o){
      var oid = (o.orderId||o.id||'—').toString().slice(-6).toUpperCase();
      return '<div class="dash-popup-row"><div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;"><span class="dash-popup-brand-dot" style="background:'+o._color+';"></span><div><div class="dash-popup-order-id">#'+esc(oid)+'</div><div class="dash-popup-customer">'+esc(o.customerName||o.email||'Customer')+'</div></div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;"><span class="dash-popup-amount">'+(o.subtotal!=null?'R'+Number(o.subtotal).toFixed(2):'—')+'</span><span class="badge badge-'+esc(o.status||'pending')+'">'+esc(o.status||'pending')+'</span></div></div>';
    }).join('') : '<div class="dash-popup-empty"><i class="ph-light ph-receipt" style="font-size:22px;opacity:.2;"></i><span>No orders on this day</span></div>';
    popup.style.display = 'block';
    requestAnimationFrame(function(){ popup.classList.add('open'); });
  };
  window._dashClosePopup = function(){
    var popup = safeEl('dash-day-popup');
    if (!popup) return;
    popup.classList.remove('open');
    setTimeout(function(){ popup.style.display = 'none'; }, 220);
  };
  document.addEventListener('click', function(e){
    var popup = safeEl('dash-day-popup');
    if (!popup || popup.style.display === 'none') return;
    if (!popup.contains(e.target) && !e.target.closest('#orders-chart')) window._dashClosePopup();
  });

  /* ══════════════════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════════════════ */
  function d2o(doc) { return Object.assign({ id: doc.id }, doc.data()); }
  function getBrandMeta(key) { return HOUSE_BRANDS.find(function(b){ return b.key === key; }) || HOUSE_BRANDS[0]; }

  function statusPill(status) {
    if (!status) return '';
    var map = { 'Active':'#1a8742','Confirmed':'#1a8742','Approved':'#1a8742','Delivered':'#1a56db','Shipped':'#6e40c9','Customs':'#c07000','Sampling':'#c07000','Contacted':'#c07000','Paused':'#c0392b','Dropped':'#c0392b' };
    var col = map[status] || '#8a8a8a';
    return '<span style="font-size:10px;font-weight:600;letter-spacing:.04em;padding:2px 9px;border-radius:20px;border:1px solid '+col+';color:'+col+';">'+esc(status)+'</span>';
  }
  function mcEmpty(icon, title, sub) {
    return '<div class="mc-empty"><i class="ph-light '+icon+'"></i><div class="mc-empty-title">'+title+'</div>'+(sub?'<div class="mc-empty-sub">'+sub+'</div>':'')+'</div>';
  }
  function mcError(e) {
    return '<div class="mc-error-banner"><i class="ph-light ph-warning"></i> '+esc(e?e.message:'Unknown error')+'</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CSS INJECTION
  ══════════════════════════════════════════════════════════════════════════ */
  function injectMCStyles() {
    if (document.getElementById('mc-styles')) return;
    var s = document.createElement('style');
    s.id = 'mc-styles';
    s.textContent = `

/* ══ SHELL ════════════════════════════════════════════════════════ */
.mc-shell {
  display: flex;
  align-items: flex-start;
  min-height: calc(100vh - var(--nav-h));
}
/* Content column: holds mobile nav + view area */
.mc-content-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mc-view-area {
  flex: 1;
  min-width: 0;
  padding: 0 0 80px;
  overflow-x: hidden;
  width: 100%;
  box-sizing: border-box;
}

/* ══ SIDE NAV ═════════════════════════════════════════════════════ */
.mc-sidenav {
  width: 196px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0 8px 20px;
  position: sticky;
  top: var(--nav-h);
  height: calc(100vh - var(--nav-h));
  overflow-y: auto;
}
@media(max-width:1023px){ .mc-sidenav { display: none; } }

.mc-sidenav-brand {
  padding: 16px 6px 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 8px;
}
.mc-sidenav-wordmark {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .2em;
  color: var(--muted2);
}
.mc-sidenav-date {
  font-size: 10px;
  color: var(--muted);
  margin-top: 3px;
  letter-spacing: .05em;
  font-weight: 500;
}
.mc-sidenav-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--r-sm);
  font-family: var(--font);
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text2);
  text-align: left;
  width: 100%;
  transition: background .12s, color .12s;
}
.mc-sidenav-btn:hover { background: var(--bg); color: var(--text); }
.mc-sidenav-btn.mc-active { background: var(--bg); color: var(--text); font-weight: 500; }
.mc-sidenav-btn i { font-size: 16px; width: 18px; flex-shrink: 0; opacity: .45; display: flex; align-items: center; justify-content: center; }
.mc-sidenav-btn.mc-active i { opacity: 1; }

/* Mobile nav pills */
.mc-mobile-nav-wrap {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 12px 0 10px;
  margin-bottom: 2px;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);
  border-bottom: 0.5px solid var(--border);
}
.mc-mobile-nav-wrap::-webkit-scrollbar { display: none; }
@media(min-width: 1024px) { .mc-mobile-nav-wrap { display: none; } }
.mc-mobile-pill {
  flex-shrink: 0;
  background: var(--surface);
  border: 0.5px solid var(--border-med);
  border-radius: 20px;
  padding: 7px 14px;
  font-family: var(--font);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all .12s;
}
.mc-mobile-pill:first-child { margin-left: 0; }
.mc-mobile-pill.mc-active {
  background: var(--text);
  border-color: var(--text);
  color: #fff;
  font-weight: 500;
}

/* ══ SPINNER ══════════════════════════════════════════════════════ */
.mc-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px;
  font-size: 22px;
  color: var(--muted2);
}
.mc-spin { animation: mcSpin .75s linear infinite; }
@keyframes mcSpin { to { transform: rotate(360deg); } }

/* ══ OVERVIEW HERO ════════════════════════════════════════════════ */
.ov-hero {
  display: flex;
  gap: 16px;
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 20px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-xs);
  flex-wrap: wrap;
}
.ov-hero-left { flex: 1; min-width: 0; width: 100%; }
.ov-hero-right { flex: 1; min-width: 0; width: 100%; }
.ov-eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--muted2);
  margin-bottom: 10px;
}
.ov-score-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  margin-bottom: 14px;
}
.ov-score {
  font-family: var(--font);
  font-size: 68px;
  font-weight: 200;
  color: var(--text);
  line-height: 1;
  letter-spacing: -.04em;
  flex-shrink: 0;
}
.ov-score-unit {
  font-size: 26px;
  font-weight: 300;
  opacity: .4;
  letter-spacing: 0;
}
.ov-score-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 3px;
}
.ov-score-note {
  font-size: 12px;
  color: var(--muted);
  font-weight: 300;
  line-height: 1.45;
}
.ov-readiness-bars { display: flex; flex-direction: column; gap: 8px; }
.ov-bar-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.ov-bar-label {
  font-size: 10.5px;
  color: var(--muted);
  width: 140px;
  flex-shrink: 0;
}
.ov-bar-track {
  flex: 1;
  height: 4px;
  background: var(--border-med);
  border-radius: 2px;
  overflow: hidden;
}
.ov-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width .8s cubic-bezier(.32,.72,0,1);
}
.ov-bar-pct {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text2);
  width: 30px;
  text-align: right;
  flex-shrink: 0;
}
.ov-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ov-stat-card {
  background: var(--surface2);
  border: 0.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 11px 12px;
}
.ov-stat-value {
  font-size: 26px;
  font-weight: 200;
  line-height: 1;
  font-family: var(--font);
  letter-spacing: -.02em;
}
.ov-stat-label {
  font-size: 9.5px;
  color: var(--muted);
  margin-top: 4px;
  font-weight: 500;
  letter-spacing: .05em;
}

/* ══ SECTION ROW ══════════════════════════════════════════════════ */
.ov-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.ov-section-title {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted2);
}
.ov-section-link {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font);
}

/* ══ PRIORITIES ══════════════════════════════════════════════════ */
.ov-priorities {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
  margin-bottom: 4px;
}
.ov-priority-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.ov-priority-row:last-child { border-bottom: none; }
.ov-priority-row:active { background: var(--surface2); }
.ov-priority-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ov-priority-info { flex: 1; min-width: 0; }
.ov-priority-name { font-size: 13px; font-weight: 400; color: var(--text); }
.ov-priority-stage { font-size: 11px; color: var(--muted); margin-top: 1px; }
.ov-priority-arrow { font-size: 16px; color: var(--muted2); flex-shrink: 0; }
.ov-blocked-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .05em;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--danger-soft);
  color: var(--danger);
  flex-shrink: 0;
}
.ov-empty-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-size: 13px;
  color: var(--muted);
}

/* ══ IN TRANSIT ══════════════════════════════════════════════════ */
.ov-transit-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.ov-transit-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 11px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: var(--shadow-xs);
}
.ov-transit-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ov-transit-name { font-size: 12.5px; font-weight: 400; }
.ov-transit-stage { font-size: 10.5px; color: var(--muted); margin-top: 2px; }

/* ══ WAITING ══════════════════════════════════════════════════════ */
.ov-waiting-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
  margin-bottom: 4px;
}
.ov-waiting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.ov-waiting-row:last-child { border-bottom: none; }
.ov-waiting-row.urgent { background: rgba(192,57,43,0.03); }
.ov-waiting-text { flex: 1; font-size: 12.5px; color: var(--text); }
.ov-waiting-age { font-size: 10.5px; color: var(--muted2); flex-shrink: 0; font-weight: 500; }
.ov-waiting-age.urgent { color: var(--danger); }

/* ══ WINS ═════════════════════════════════════════════════════════ */
.ov-wins-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.ov-win-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 9px;
  box-shadow: var(--shadow-xs);
  flex: 1;
  min-width: 180px;
}
.ov-win-icon { font-size: 16px; color: #c07000; flex-shrink: 0; }
.ov-win-text { font-size: 12.5px; color: var(--text); }
.ov-win-date { font-size: 10.5px; color: var(--muted2); margin-top: 1px; }

/* ══ MILESTONES ═══════════════════════════════════════════════════ */
.ov-milestones-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.ov-milestone-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
}
.ov-milestone-row:last-child { border-bottom: none; }
.ov-milestone-row.urgent { background: rgba(192,112,0,0.04); }
.ov-milestone-date { font-size: 11px; font-weight: 600; color: var(--muted); width: 52px; flex-shrink: 0; }
.ov-milestone-title { flex: 1; font-size: 12.5px; color: var(--text); }
.ov-milestone-days { font-size: 11px; font-weight: 600; color: var(--muted2); flex-shrink: 0; }
.ov-milestone-days.urgent { color: var(--warning); }

/* ══ VIEW HEADER ══════════════════════════════════════════════════ */
.mc-view-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.mc-view-title {
  font-family: var(--font);
  font-size: 22px;
  font-weight: 200;
  color: var(--text);
  letter-spacing: .02em;
}
.mc-view-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }
.mc-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  background: var(--text);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-family: var(--font);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity .15s;
}
.mc-action-btn:active { opacity: .8; }
.mc-action-btn-sm {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font);
  padding: 2px 0;
}

/* ══ PROJECTS ═════════════════════════════════════════════════════ */
.proj-brand-group { margin-bottom: 22px; }
.proj-brand-header {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 0.5px solid var(--border);
}
.proj-brand-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.proj-brand-name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--text);
  flex: 1;
}
.proj-brand-count { font-size: 11px; color: var(--muted); }
.proj-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.proj-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  cursor: pointer;
  transition: box-shadow .15s, transform .1s;
  box-shadow: var(--shadow-xs);
}
.proj-card:active { transform: scale(0.99); box-shadow: var(--shadow-sm); }
.proj-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.proj-card-name { font-size: 13.5px; font-weight: 400; color: var(--text); }
.proj-card-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
.proj-ready-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .05em;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--success-soft);
  color: var(--success);
  flex-shrink: 0;
  white-space: nowrap;
}
.proj-pct-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  flex-shrink: 0;
}
.proj-progress-track {
  height: 3px;
  background: var(--border-med);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 9px;
}
.proj-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .6s cubic-bezier(.32,.72,0,1);
}
.proj-stages-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 7px;
}
.proj-stage-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border-med);
  transition: background .2s;
}
.proj-stage-dot.done { opacity: 1; }
.proj-next-stage { font-size: 11px; color: var(--muted); }
.proj-empty-brand { font-size: 12px; color: var(--muted); padding: 10px 0; }

/* Stage preview in new project modal */
.np-stages-preview {
  background: var(--surface2);
  border: 0.5px solid var(--border);
  border-radius: var(--r-xs);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 200px;
  overflow-y: auto;
}
.np-stage-item { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 7px; }

/* ══ SUPPLIERS TABLE ══════════════════════════════════════════════ */
.mc-table-wrap {
  background: var(--surface);
  border-radius: var(--r);
  border: 0.5px solid var(--border);
  overflow: hidden;
  overflow-x: auto;
  box-shadow: var(--shadow-xs);
}
.mc-table { width: 100%; border-collapse: collapse; min-width: 520px; }
.mc-table thead tr { border-bottom: 0.5px solid var(--border); }
.mc-table th {
  padding: 9px 14px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
  text-align: left;
  white-space: nowrap;
  background: var(--surface2);
}
.mc-table td { padding: 10px 14px; font-size: 12.5px; border-bottom: 0.5px solid rgba(0,0,0,0.04); vertical-align: middle; }
.mc-table tbody tr:last-child td { border-bottom: none; }
.mc-table tbody tr { cursor: pointer; transition: background .1s; }
.mc-table tbody tr:hover { background: var(--surface2); }

/* ══ WAITING CARDS ════════════════════════════════════════════════ */
.waiting-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.waiting-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  box-shadow: var(--shadow-xs);
}
.waiting-card.urgent { border-color: rgba(192,57,43,0.25); background: rgba(192,57,43,0.02); }
.waiting-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.waiting-cat-pill {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .07em;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--surface3);
  color: var(--muted);
}
.waiting-age { font-size: 10.5px; color: var(--muted2); font-weight: 500; }
.waiting-age.urgent { color: var(--danger); font-weight: 700; }
.waiting-desc { font-size: 13px; color: var(--text); line-height: 1.5; margin-bottom: 6px; }
.waiting-project { font-size: 11px; color: var(--muted); margin-bottom: 10px; }
.waiting-resolve-btn {
  font-size: 11px;
  font-weight: 600;
  color: var(--success);
  background: var(--success-soft);
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: var(--font);
  transition: opacity .12s;
}
.waiting-resolve-btn:active { opacity: .7; }

/* ══ WINS GRID ════════════════════════════════════════════════════ */
.wins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.win-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
  box-shadow: var(--shadow-xs);
}
.win-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--warning-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  color: var(--warning);
  margin-bottom: 10px;
}
.win-title { font-size: 13.5px; font-weight: 400; color: var(--text); margin-bottom: 4px; }
.win-note { font-size: 12px; color: var(--muted); margin-bottom: 4px; line-height: 1.45; }
.win-date { font-size: 10.5px; color: var(--muted2); }

/* ══ MILESTONES LIST ══════════════════════════════════════════════ */
.milestone-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.milestone-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
}
.milestone-row:last-child { border-bottom: none; }
.milestone-row.soon { background: rgba(192,112,0,0.04); }
.milestone-row.past { opacity: .5; }
.milestone-date-col { width: 60px; flex-shrink: 0; text-align: center; }
.milestone-day { font-size: 11.5px; font-weight: 600; color: var(--text); }
.milestone-countdown { font-size: 10px; color: var(--muted2); margin-top: 2px; font-weight: 500; }
.milestone-countdown.soon { color: var(--warning); }
.milestone-countdown.past { color: var(--muted2); }
.milestone-info { flex: 1; }
.milestone-title { font-size: 13px; color: var(--text); }

/* ══ NOTES ════════════════════════════════════════════════════════ */
.note-compose {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-xs);
}
.note-textarea {
  width: 100%;
  background: var(--surface2);
  border: 0.5px solid var(--border-med);
  border-radius: var(--r-sm);
  padding: 11px 13px;
  font-family: var(--font);
  font-size: 13px;
  color: var(--text);
  resize: vertical;
  min-height: 80px;
  outline: none;
  transition: border-color .18s;
}
.note-textarea:focus { border-color: rgba(26,86,219,0.35); }
.note-compose-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  gap: 8px;
}
.note-tag-select {
  background: var(--surface2);
  border: 0.5px solid var(--border-med);
  border-radius: var(--r-xs);
  padding: 7px 10px;
  font-family: var(--font);
  font-size: 12px;
  color: var(--text2);
  outline: none;
}
.notes-feed { display: flex; flex-direction: column; gap: 8px; }
.note-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 13px 14px;
  box-shadow: var(--shadow-xs);
}
.note-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}
.note-tag-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .07em;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-soft);
  color: var(--accent);
}
.note-timestamp { font-size: 10.5px; color: var(--muted2); flex: 1; }
.note-body { font-size: 13px; color: var(--text); line-height: 1.55; font-weight: 300; }

/* ══ SHARED COMPONENTS ════════════════════════════════════════════ */
.mc-card {
  background: var(--surface);
  border-radius: var(--r);
  border: 0.5px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.mc-card-header {
  padding: 11px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.5px solid var(--border);
  flex-wrap: wrap;
  gap: 8px;
}
.mc-card-title {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
}
.mc-icon-btn {
  width: 26px; height: 26px;
  border-radius: 6px;
  background: var(--surface3);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--muted);
  transition: background .12s;
  flex-shrink: 0;
}
.mc-icon-btn:active { background: var(--border-med); }
.mc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 52px 20px;
  gap: 8px;
  color: var(--muted);
}
.mc-empty i { font-size: 28px; opacity: .2; }
.mc-empty-title { font-size: 15px; font-weight: 300; color: var(--text); }
.mc-empty-sub { font-size: 12px; color: var(--muted); max-width: 260px; line-height: 1.55; }
.mc-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-size: 12.5px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: var(--r-sm);
}

/* ══ MOBILE OVERRIDES ════════════════════════════════════════════ */
@media(max-width: 767px) {

  /* View area full width with proper padding */
  .mc-view-area {
    padding: 14px 14px 80px !important;
    width: 100% !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
  }

  /* Hero stacks vertically */
  .ov-hero {
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }
  .ov-hero-left, .ov-hero-right {
    width: 100%;
    min-width: 0;
  }

  /* Smaller score on mobile */
  .ov-score { font-size: 52px; }
  .ov-score-unit { font-size: 20px; }

  /* Bar label narrower */
  .ov-bar-label { width: 110px; font-size: 10px; }

  /* Stats 3 columns on mobile */
  .ov-stats { grid-template-columns: 1fr 1fr 1fr; }
  .ov-stat-value { font-size: 22px; }

  /* Projects single column */
  .proj-list { grid-template-columns: 1fr; }

  /* Waiting cards single column */
  .waiting-list { grid-template-columns: 1fr; }

  /* Wins cards single column */
  .wins-grid { grid-template-columns: 1fr; }

  /* Transit list wraps */
  .ov-transit-list { flex-direction: column; }
  .ov-transit-card { width: 100%; box-sizing: border-box; }

  /* Wins list full width */
  .ov-wins-list { flex-direction: column; }
  .ov-win-card { min-width: 0; width: 100%; box-sizing: border-box; }

  /* View header wraps cleanly */
  .mc-view-header { gap: 10px; }
  .mc-view-title { font-size: 20px; }

  /* Readiness score row stacks */
  .ov-score-row { flex-wrap: wrap; gap: 8px; }
}

    `;
    document.head.appendChild(s);

      }

})();
