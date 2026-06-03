(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var fmt       = window._fmt;
  var fmtDate   = window._fmtDate;
  var ordersRef = window._ordersRef;
  var db        = window._adminDB;
  var showToast = window._showToast;

  var BRANDS = [
    { key: 'JANEDORE', color: '#1a56db', bg: 'rgba(26,86,219,0.07)' },
    { key: 'NIRIUS CO', color: '#6e40c9', bg: 'rgba(110,64,201,0.07)' },
    { key: 'THATO',    color: '#111111', bg: 'rgba(17,17,17,0.06)'  }
  ];

  var _activeFilters = { 'JANEDORE': true, 'NIRIUS CO': true, 'THATO': true };
  var _allOrders = [];

  /* ─── FIRESTORE REFS ────────────────────────────────────────────────────── */
  var brandsRef          = db.collection('brands');
  var suppliersRef       = db.collection('suppliers');
  var samplesRef         = db.collection('samples');
  var campaignsRef       = db.collection('campaigns');
  var founderNotesRef    = db.collection('founder_notes');
  var waitingOnRef       = db.collection('waiting_on');
  var launchMilestonesRef= db.collection('launch_milestones');

  window._brandsRef           = brandsRef;
  window._suppliersRef        = suppliersRef;
  window._samplesRef          = samplesRef;
  window._campaignsRef        = campaignsRef;
  window._founderNotesRef     = founderNotesRef;
  window._waitingOnRef        = waitingOnRef;
  window._launchMilestonesRef = launchMilestonesRef;

  /* ─── PIPELINE STAGES ───────────────────────────────────────────────────── */
  var BRAND_STAGES = ['Discovered','Researching','Contacted','In Discussion','Samples Requested','Approved','Contract Signed','Onboarding','Live'];
  var SAMPLE_STATUSES = ['Requested','In Production','Shipped','Customs','Delivered','Approved','Rejected'];
  var CAMPAIGN_STAGES = ['Moodboard','Creative Direction','Models Booked','Photographer Booked','Studio Booked','Shoot Complete','Editing','Content Scheduled','Campaign Ready'];
  var JANEDORE_STAGES = ['Supplier Confirmed','Sample Requested','Sample Shipped','Sample Received','Production Approved','Photography Scheduled','Campaign Ready'];

  /* ─── ACTIVE SUB-VIEW ───────────────────────────────────────────────────── */
  var _mcView = 'overview'; // overview | brands | janedore | suppliers | samples | campaigns | notes | waiting

  /* ══════════════════════════════════════════════════════════════════════════
     MAIN RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;

    injectMCStyles();

    mc.innerHTML =
      '<div class="mc-shell">' +
        renderMCNav() +
        '<div id="mc-view-area"></div>' +
      '</div>';

    renderMCView();
  };

  /* ─── MISSION CONTROL NAV ───────────────────────────────────────────────── */
  function renderMCNav() {
    var items = [
      { id: 'overview',   icon: 'ph-radar',             label: 'Overview'   },
      { id: 'brands',     icon: 'ph-handshake',         label: 'Brands'     },
      { id: 'janedore',   icon: 'ph-crown-simple',      label: 'JANEDORE'   },
      { id: 'suppliers',  icon: 'ph-factory',           label: 'Suppliers'  },
      { id: 'samples',    icon: 'ph-package',           label: 'Samples'    },
      { id: 'campaigns',  icon: 'ph-camera',            label: 'Campaigns'  },
      { id: 'waiting',    icon: 'ph-hourglass',         label: 'Waiting On' },
      { id: 'notes',      icon: 'ph-notebook',          label: 'Notes'      }
    ];

    return '<nav class="mc-nav">' +
      '<div class="mc-nav-header">' +
        '<div class="mc-nav-wordmark">MISSION CONTROL</div>' +
        '<div class="mc-nav-date">' + new Date().toLocaleDateString('en-ZA',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase() + '</div>' +
      '</div>' +
      '<div class="mc-nav-items">' +
        items.map(function(item) {
          return '<button class="mc-nav-item' + (_mcView === item.id ? ' active' : '') + '" onclick="window._mcSwitchView(\'' + item.id + '\')">' +
            '<i class="ph-light ' + item.icon + '"></i>' +
            '<span>' + item.label + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</nav>';
  }

  window._mcSwitchView = function(view) {
    _mcView = view;
    /* Update nav active states */
    document.querySelectorAll('.mc-nav-item').forEach(function(btn) {
      btn.classList.remove('active');
    });
    var activeBtn = document.querySelector('.mc-nav-item[onclick*="\'' + view + '\'"]');
    if (activeBtn) activeBtn.classList.add('active');
    renderMCView();
  };

  function renderMCView() {
    var area = safeEl('mc-view-area');
    if (!area) return;
    area.innerHTML = '<div class="mc-loading"><i class="ph-light ph-spinner mc-spin"></i></div>';

    switch (_mcView) {
      case 'overview':   renderOverview(area);   break;
      case 'brands':     renderBrands(area);     break;
      case 'janedore':   renderJanedore(area);   break;
      case 'suppliers':  renderSuppliers(area);  break;
      case 'samples':    renderSamples(area);    break;
      case 'campaigns':  renderCampaigns(area);  break;
      case 'waiting':    renderWaiting(area);    break;
      case 'notes':      renderNotes(area);      break;
      default:           renderOverview(area);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 1 — OVERVIEW (FASHION HOUSE HQ)
  ══════════════════════════════════════════════════════════════════════════ */
  function renderOverview(area) {
    Promise.all([
      brandsRef.get(),
      suppliersRef.get(),
      samplesRef.get(),
      campaignsRef.get(),
      waitingOnRef.where('resolved','==',false).get().catch(function(){ return { docs: [] }; }),
      ordersRef.get().catch(function(){ return { docs: [] }; })
    ]).then(function(results) {
      var brands    = results[0].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var suppliers = results[1].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var samples   = results[2].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var campaigns = results[3].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var waiting   = results[4].docs;
      var orders    = results[5].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      /* Launch readiness score */
      var score = calcLaunchScore(brands, suppliers, samples, campaigns);

      var approvedBrands = brands.filter(function(b){ return b.stage === 'Approved' || b.stage === 'Contract Signed' || b.stage === 'Onboarding' || b.stage === 'Live'; });
      var reviewBrands   = brands.filter(function(b){ return b.stage !== 'Live' && b.stage !== 'Rejected'; });
      var approvedSamples= samples.filter(function(s){ return s.status === 'Approved'; });
      var readyCampaigns = campaigns.filter(function(c){ return c.stage === 'Campaign Ready'; });

      _allOrders = orders;

      area.innerHTML =
        /* ── Hero readiness ── */
        '<div class="mc-hero">' +
          '<div class="mc-hero-left">' +
            '<div class="mc-hero-eyebrow">Fashion House Status</div>' +
            '<div class="mc-hero-score">' + score.pct + '<span class="mc-hero-score-unit">%</span></div>' +
            '<div class="mc-hero-label">Launch Readiness</div>' +
            '<div class="mc-hero-bar-wrap"><div class="mc-hero-bar" style="width:' + score.pct + '%"></div></div>' +
            '<div class="mc-hero-sublabel">' + score.note + '</div>' +
          '</div>' +
          '<div class="mc-hero-right">' +
            '<div class="mc-kpi-grid">' +
              mcKpi('ph-buildings', approvedBrands.length, 'Brands Approved',   '#1a56db') +
              mcKpi('ph-clock',     reviewBrands.length,   'In Review',          '#c07000') +
              mcKpi('ph-package',   approvedSamples.length,'Samples Approved',   '#1a8742') +
              mcKpi('ph-camera',    readyCampaigns.length, 'Campaigns Ready',    '#6e40c9') +
              mcKpi('ph-hourglass', waiting.length,        'Waiting On',         '#c0392b') +
              mcKpi('ph-receipt',   orders.length,         'Total Orders',       '#111111') +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ── Today's Focus ── */
        renderFocusArea(brands, suppliers, samples, campaigns, waiting) +

        /* ── Orders chart ── */
        '<div class="mc-section-label">Order Activity</div>' +
        '<div class="mc-card" style="margin-bottom:10px;">' +
          '<div class="mc-card-header">' +
            '<span class="mc-card-title">Orders — Last 30 Days</span>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;">' +
              '<div class="dash-live-pill" id="dash-live-pill"><span class="dash-live-dot"></span><span id="dash-live-count">Live View</span></div>' +
              BRANDS.map(function(b){
                var key = b.key.replace(/\s/g,'-');
                return '<button class="dash-brand-toggle active" id="dash-toggle-' + key + '"' +
                  ' onclick="window._dashToggleBrand(\'' + b.key + '\')"' +
                  ' style="--brand-color:' + b.color + ';">' +
                  '<span class="dash-brand-dot" style="background:' + b.color + ';"></span>' +
                  b.key +
                '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="chart-wrap" style="position:relative;"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
        '</div>' +

        /* ── Curation pipeline funnel ── */
        '<div class="mc-section-label">Curation Pipeline</div>' +
        renderCurationFunnel(brands) +

        /* ── Day popup ── */
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

    }).catch(function(e) {
      area.innerHTML = '<div class="mc-error"><i class="ph-light ph-warning"></i> ' + esc(e.message) + '</div>';
    });
  }

  function mcKpi(icon, value, label, color) {
    return '<div class="mc-kpi-card">' +
      '<div class="mc-kpi-icon" style="color:' + color + ';"><i class="ph-light ' + icon + '"></i></div>' +
      '<div class="mc-kpi-value">' + value + '</div>' +
      '<div class="mc-kpi-label">' + label + '</div>' +
    '</div>';
  }

  function calcLaunchScore(brands, suppliers, samples, campaigns) {
    var points = 0, max = 0;
    /* Brands */
    max += 30;
    var live = brands.filter(function(b){ return b.stage === 'Live'; }).length;
    var approved = brands.filter(function(b){ return b.stage === 'Approved' || b.stage === 'Contract Signed' || b.stage === 'Onboarding'; }).length;
    points += Math.min(live * 6 + approved * 3, 30);
    /* Suppliers */
    max += 20;
    var confirmedSuppliers = suppliers.filter(function(s){ return s.status === 'Confirmed' || s.status === 'Active'; }).length;
    points += Math.min(confirmedSuppliers * 5, 20);
    /* Samples */
    max += 25;
    var approvedSamples = samples.filter(function(s){ return s.status === 'Approved'; }).length;
    points += Math.min(approvedSamples * 5, 25);
    /* Campaigns */
    max += 25;
    var readyCampaigns = campaigns.filter(function(c){ return c.stage === 'Campaign Ready'; }).length;
    points += Math.min(readyCampaigns * 8, 25);

    var pct = max > 0 ? Math.round((points / max) * 100) : 0;
    var note = pct < 25 ? 'Early stage — build your brand pipeline' :
               pct < 50 ? 'Gaining momentum — keep sourcing' :
               pct < 75 ? 'Strong progress — finalise campaigns' :
               pct < 95 ? 'Almost launch-ready' : 'Ready to launch';
    return { pct: pct, note: note };
  }

  function renderFocusArea(brands, suppliers, samples, campaigns, waiting) {
    var items = [];
    /* Stalled brands */
    var stalled = brands.filter(function(b){
      if (!b.lastContact) return false;
      var d = b.lastContact.toDate ? b.lastContact.toDate() : new Date(b.lastContact);
      return (Date.now() - d.getTime()) > 5 * 86400000 && b.stage !== 'Live';
    });
    if (stalled.length) items.push({ icon:'ph-hand-pointing', color:'#c07000', text: stalled.length + ' brand' + (stalled.length>1?'s':'') + ' not contacted in 5+ days', action:'brands' });
    /* Samples in transit */
    var inTransit = samples.filter(function(s){ return s.status === 'Shipped' || s.status === 'Customs'; });
    if (inTransit.length) items.push({ icon:'ph-airplane-takeoff', color:'#6e40c9', text: inTransit.length + ' sample' + (inTransit.length>1?'s':'') + ' in transit', action:'samples' });
    /* Campaign deadlines */
    var nearCampaigns = campaigns.filter(function(c){ return c.stage && c.stage !== 'Campaign Ready'; });
    if (nearCampaigns.length) items.push({ icon:'ph-camera', color:'#1a56db', text: nearCampaigns.length + ' campaign' + (nearCampaigns.length>1?'s':'') + ' in production', action:'campaigns' });
    /* Waiting items */
    if (waiting.length) items.push({ icon:'ph-hourglass', color:'#c0392b', text: waiting.length + ' item' + (waiting.length>1?'s':'') + ' waiting on external reply', action:'waiting' });

    if (!items.length) {
      return '<div class="mc-focus-empty"><i class="ph-light ph-check-circle" style="font-size:22px;color:#1a8742;"></i><span>All clear — no urgent items today</span></div>';
    }

    return '<div class="mc-section-label">Focus Today</div>' +
      '<div class="mc-focus-list">' +
        items.map(function(item) {
          return '<div class="mc-focus-item" onclick="window._mcSwitchView(\'' + item.action + '\')">' +
            '<span class="mc-focus-dot" style="background:' + item.color + ';"></span>' +
            '<span class="mc-focus-text">' + esc(item.text) + '</span>' +
            '<i class="ph-light ph-arrow-right mc-focus-arrow"></i>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function renderCurationFunnel(brands) {
    var stageCounts = {};
    BRAND_STAGES.forEach(function(s){ stageCounts[s] = 0; });
    brands.forEach(function(b){ if (stageCounts[b.stage] !== undefined) stageCounts[b.stage]++; });
    var max = Math.max.apply(null, Object.values(stageCounts).concat([1]));

    return '<div class="mc-funnel">' +
      BRAND_STAGES.map(function(stage) {
        var count = stageCounts[stage] || 0;
        var pct = Math.round((count / max) * 100);
        var isLive = stage === 'Live';
        return '<div class="mc-funnel-row" onclick="window._mcSwitchView(\'brands\')">' +
          '<div class="mc-funnel-label">' + stage + '</div>' +
          '<div class="mc-funnel-bar-wrap">' +
            '<div class="mc-funnel-bar' + (isLive ? ' live' : '') + '" style="width:' + Math.max(pct, 2) + '%"></div>' +
          '</div>' +
          '<div class="mc-funnel-count">' + count + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 2 — BRAND ACQUISITION PIPELINE
  ══════════════════════════════════════════════════════════════════════════ */
  function renderBrands(area) {
    brandsRef.orderBy('createdAt','desc').get().catch(function(){
      return brandsRef.get();
    }).then(function(snap) {
      var brands = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div>' +
            '<div class="mc-view-title">Brand Acquisition Pipeline</div>' +
            '<div class="mc-view-sub">' + brands.length + ' brands tracked</div>' +
          '</div>' +
          '<button class="mc-action-btn" onclick="window._mcAddBrand()"><i class="ph-light ph-plus"></i> Add Brand</button>' +
        '</div>' +

        /* Stage filter pills */
        '<div class="mc-stage-pills">' +
          '<button class="mc-stage-pill active" onclick="window._mcFilterBrands(this, \'\')" data-stage="">All (' + brands.length + ')</button>' +
          BRAND_STAGES.map(function(s) {
            var cnt = brands.filter(function(b){ return b.stage === s; }).length;
            return cnt > 0 ? '<button class="mc-stage-pill" onclick="window._mcFilterBrands(this, \'' + s + '\')" data-stage="' + s + '">' + s + ' <span class="mc-pill-count">' + cnt + '</span></button>' : '';
          }).join('') +
        '</div>' +

        '<div id="mc-brands-grid" class="mc-brands-grid">' +
          (brands.length ? renderBrandCards(brands) : mcEmpty('ph-handshake','No brands yet','Start building your curation pipeline')) +
        '</div>';

    }).catch(function(e){
      area.innerHTML = mcError(e);
    });
  }

  function renderBrandCards(brands) {
    return brands.map(function(b) {
      var daysSince = b.lastContact ? Math.round((Date.now() - (b.lastContact.toDate ? b.lastContact.toDate() : new Date(b.lastContact)).getTime()) / 86400000) : null;
      var stageClass = b.stage === 'Live' ? 'mc-stage-live' : b.stage === 'Approved' || b.stage === 'Contract Signed' ? 'mc-stage-approved' : 'mc-stage-default';
      var priorityDot = b.priority === 'High' ? '#c0392b' : b.priority === 'Medium' ? '#c07000' : '#b0b0b0';

      return '<div class="mc-brand-card" onclick="window._mcViewBrand(\'' + b.id + '\')">' +
        '<div class="mc-brand-card-top">' +
          '<div class="mc-brand-avatar">' + (b.name || '?').substring(0,2).toUpperCase() + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="mc-brand-name">' + esc(b.name || '—') + '</div>' +
            '<div class="mc-brand-meta">' + esc(b.country || '—') + ' · ' + esc(b.category || '—') + '</div>' +
          '</div>' +
          '<span class="mc-priority-dot" style="background:' + priorityDot + ';" title="' + (b.priority||'Low') + ' priority"></span>' +
        '</div>' +
        '<div class="mc-brand-stage ' + stageClass + '">' + esc(b.stage || 'Discovered') + '</div>' +
        (b.notes ? '<div class="mc-brand-notes">' + esc(b.notes.substring(0,80)) + (b.notes.length > 80 ? '…' : '') + '</div>' : '') +
        '<div class="mc-brand-card-footer">' +
          (daysSince !== null ? '<span class="mc-brand-since">Last contact ' + daysSince + 'd ago</span>' : '<span class="mc-brand-since">No contact recorded</span>') +
          '<button class="mc-icon-btn" onclick="event.stopPropagation();window._mcEditBrand(\'' + b.id + '\')"><i class="ph-light ph-pencil-simple"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window._mcFilterBrands = function(btn, stage) {
    document.querySelectorAll('.mc-stage-pill').forEach(function(p){ p.classList.remove('active'); });
    btn.classList.add('active');
    var grid = safeEl('mc-brands-grid');
    if (!grid) return;
    brandsRef.get().then(function(snap) {
      var brands = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var filtered = stage ? brands.filter(function(b){ return b.stage === stage; }) : brands;
      grid.innerHTML = filtered.length ? renderBrandCards(filtered) : mcEmpty('ph-handshake','No brands in this stage','');
    });
  };

  window._mcAddBrand = function() {
    showBrandModal(null);
  };
  window._mcEditBrand = function(id) {
    brandsRef.doc(id).get().then(function(doc){
      if (doc.exists) showBrandModal(Object.assign({id:doc.id}, doc.data()));
    });
  };
  window._mcViewBrand = function(id) {
    window._mcEditBrand(id);
  };

  function showBrandModal(brand) {
    var isEdit = !!brand;
    var html =
      '<div class="modal">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Brand' : 'Add Brand') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Brand Name</label><input id="mb-name" value="' + esc(brand ? brand.name : '') + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Country</label><input id="mb-country" value="' + esc(brand ? brand.country : '') + '"></div>' +
          '<div class="form-group"><label>Category</label><input id="mb-category" value="' + esc(brand ? brand.category : '') + '" placeholder="e.g. Ready-to-wear"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Stage</label><select id="mb-stage">' + BRAND_STAGES.map(function(s){ return '<option value="' + s + '"' + (brand && brand.stage === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-group"><label>Priority</label><select id="mb-priority"><option value="Low"' + (brand && brand.priority === 'Low' ? ' selected' : '') + '>Low</option><option value="Medium"' + (brand && brand.priority === 'Medium' ? ' selected' : '') + '>Medium</option><option value="High"' + (brand && brand.priority === 'High' ? ' selected' : '') + '>High</option></select></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea id="mb-notes" rows="3">' + esc(brand ? (brand.notes||'') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 16px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteBrand(\'' + brand.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveBrand(\'' + (isEdit ? brand.id : '') + '\')">' + (isEdit ? 'Save' : 'Add Brand') + '</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  }

  window._mcSaveBrand = function(id) {
    var data = {
      name:        (safeEl('mb-name') || {}).value || '',
      country:     (safeEl('mb-country') || {}).value || '',
      category:    (safeEl('mb-category') || {}).value || '',
      stage:       (safeEl('mb-stage') || {}).value || 'Discovered',
      priority:    (safeEl('mb-priority') || {}).value || 'Low',
      notes:       (safeEl('mb-notes') || {}).value || '',
      lastContact: firebase.firestore.FieldValue.serverTimestamp()
    };
    var op = id ? brandsRef.doc(id).update(data) : brandsRef.add(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    op.then(function(){
      window._closeModal();
      showToast(id ? 'Brand updated' : 'Brand added');
      window._mcSwitchView('brands');
    }).catch(function(e){ showToast(e.message, 'error'); });
  };

  window._mcDeleteBrand = function(id) {
    if (!confirm('Delete this brand?')) return;
    brandsRef.doc(id).delete().then(function(){
      window._closeModal();
      showToast('Brand removed');
      window._mcSwitchView('brands');
    }).catch(function(e){ showToast(e.message, 'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 3 — JANEDORE HOUSE BRAND
  ══════════════════════════════════════════════════════════════════════════ */
  function renderJanedore(area) {
    Promise.all([
      suppliersRef.where('brand','==','JANEDORE').get().catch(function(){ return suppliersRef.get(); }),
      samplesRef.where('brand','==','JANEDORE').get().catch(function(){ return { docs: [] }; })
    ]).then(function(results) {
      var suppliers = results[0].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var samples   = results[1].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      /* Track JANEDORE milestone stages */
      var stageProgress = {};
      JANEDORE_STAGES.forEach(function(s){ stageProgress[s] = false; });
      suppliers.forEach(function(s){ if (s.status === 'Confirmed' || s.status === 'Active') stageProgress['Supplier Confirmed'] = true; });
      samples.forEach(function(s){
        if (s.status === 'Requested' || s.status === 'In Production') stageProgress['Sample Requested'] = true;
        if (s.status === 'Shipped' || s.status === 'Customs') stageProgress['Sample Shipped'] = true;
        if (s.status === 'Delivered') stageProgress['Sample Received'] = true;
        if (s.status === 'Approved') stageProgress['Production Approved'] = true;
      });

      var completedCount = Object.values(stageProgress).filter(Boolean).length;
      var pct = Math.round((completedCount / JANEDORE_STAGES.length) * 100);

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div>' +
            '<div class="mc-view-title">JANEDORE House Brand</div>' +
            '<div class="mc-view-sub">In-house private label — launch readiness</div>' +
          '</div>' +
        '</div>' +

        /* Readiness ring */
        '<div class="mc-jd-hero">' +
          '<div class="mc-jd-ring-wrap">' +
            '<svg viewBox="0 0 80 80" class="mc-jd-ring-svg">' +
              '<circle cx="40" cy="40" r="32" class="mc-jd-ring-bg"/>' +
              '<circle cx="40" cy="40" r="32" class="mc-jd-ring-fill" style="stroke-dasharray:' + (2*Math.PI*32).toFixed(1) + ';stroke-dashoffset:' + ((2*Math.PI*32) * (1 - pct/100)).toFixed(1) + '"/>' +
            '</svg>' +
            '<div class="mc-jd-ring-label"><div class="mc-jd-ring-pct">' + pct + '%</div><div class="mc-jd-ring-sub">Ready</div></div>' +
          '</div>' +
          '<div class="mc-jd-stages">' +
            JANEDORE_STAGES.map(function(s) {
              var done = stageProgress[s];
              return '<div class="mc-jd-stage-row">' +
                '<div class="mc-jd-stage-check' + (done ? ' done' : '') + '"><i class="ph-light ' + (done ? 'ph-check' : 'ph-circle') + '"></i></div>' +
                '<span class="mc-jd-stage-label' + (done ? ' done' : '') + '">' + s + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +

        /* Suppliers */
        '<div class="mc-section-label">Supplier Relationships</div>' +
        '<div class="mc-card" style="margin-bottom:10px;">' +
          '<div class="mc-card-header"><span class="mc-card-title">Suppliers</span>' +
            '<button class="mc-action-btn-sm" onclick="window._mcSwitchView(\'suppliers\')">View All</button>' +
          '</div>' +
          (suppliers.length ?
            '<div>' + suppliers.slice(0,4).map(function(s){
              return '<div class="mc-supplier-row">' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-size:13px;font-weight:400;">' + esc(s.name||'—') + '</div>' +
                  '<div class="mc-row-meta">' + esc(s.country||'—') + ' · MOQ ' + esc(s.moq||'—') + '</div>' +
                '</div>' +
                statusPill(s.status) +
              '</div>';
            }).join('') + '</div>' :
            '<div style="padding:18px 16px;font-size:12px;color:var(--muted);">No JANEDORE suppliers yet.</div>'
          ) +
        '</div>' +

        /* Samples */
        '<div class="mc-section-label">Sampling</div>' +
        '<div class="mc-card">' +
          '<div class="mc-card-header"><span class="mc-card-title">Samples</span>' +
            '<button class="mc-action-btn-sm" onclick="window._mcSwitchView(\'samples\')">View All</button>' +
          '</div>' +
          (samples.length ?
            '<div>' + samples.slice(0,4).map(function(s){
              return '<div class="mc-supplier-row">' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-size:13px;">' + esc(s.productName||'—') + '</div>' +
                  '<div class="mc-row-meta">' + esc(s.material||'—') + '</div>' +
                '</div>' +
                statusPill(s.status) +
              '</div>';
            }).join('') + '</div>' :
            '<div style="padding:18px 16px;font-size:12px;color:var(--muted);">No samples tracked yet.</div>'
          ) +
        '</div>';

    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 4 — SUPPLIER CENTER
  ══════════════════════════════════════════════════════════════════════════ */
  function renderSuppliers(area) {
    suppliersRef.get().then(function(snap) {
      var suppliers = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Supplier Center</div><div class="mc-view-sub">' + suppliers.length + ' suppliers tracked</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddSupplier()"><i class="ph-light ph-plus"></i> Add Supplier</button>' +
        '</div>' +
        (suppliers.length ?
          '<div class="mc-table-wrap">' +
            '<table class="mc-table">' +
              '<thead><tr><th>Supplier</th><th>Country</th><th>MOQ</th><th>Lead Time</th><th>Last Contact</th><th>Status</th><th></th></tr></thead>' +
              '<tbody>' +
                suppliers.map(function(s){
                  return '<tr onclick="window._mcEditSupplier(\'' + s.id + '\')">' +
                    '<td><div style="font-weight:400;">' + esc(s.name||'—') + '</div><div class="cell-muted">' + esc(s.brand||'—') + '</div></td>' +
                    '<td class="cell-muted">' + esc(s.country||'—') + '</td>' +
                    '<td class="cell-muted">' + esc(s.moq||'—') + '</td>' +
                    '<td class="cell-muted">' + esc(s.leadTime||'—') + '</td>' +
                    '<td class="cell-muted">' + (s.lastContact ? fmtDate(s.lastContact) : '—') + '</td>' +
                    '<td>' + statusPill(s.status) + '</td>' +
                    '<td><button class="mc-icon-btn" onclick="event.stopPropagation();window._mcEditSupplier(\'' + s.id + '\')"><i class="ph-light ph-pencil-simple"></i></button></td>' +
                  '</tr>';
                }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' :
          mcEmpty('ph-factory','No suppliers yet','Add your first supplier to begin sourcing')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcAddSupplier = function(){ showSupplierModal(null); };
  window._mcEditSupplier = function(id){
    suppliersRef.doc(id).get().then(function(doc){
      if (doc.exists) showSupplierModal(Object.assign({id:doc.id},doc.data()));
    });
  };

  function showSupplierModal(sup) {
    var isEdit = !!sup;
    var html =
      '<div class="modal">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Supplier' : 'Add Supplier') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Supplier Name</label><input id="ms-name" value="' + esc(sup ? sup.name : '') + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Country</label><input id="ms-country" value="' + esc(sup ? sup.country : '') + '"></div>' +
          '<div class="form-group"><label>Brand</label><input id="ms-brand" value="' + esc(sup ? sup.brand : '') + '" placeholder="e.g. JANEDORE"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>MOQ</label><input id="ms-moq" value="' + esc(sup ? sup.moq : '') + '" placeholder="Minimum order qty"></div>' +
          '<div class="form-group"><label>Lead Time</label><input id="ms-lead" value="' + esc(sup ? sup.leadTime : '') + '" placeholder="e.g. 6-8 weeks"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Status</label><select id="ms-status"><option value="Prospecting">Prospecting</option><option value="Contacted">Contacted</option><option value="Sampling">Sampling</option><option value="Confirmed">Confirmed</option><option value="Active">Active</option><option value="Paused">Paused</option></select></div>' +
          '<div class="form-group"><label>Sample Status</label><input id="ms-sample" value="' + esc(sup ? sup.sampleStatus : '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea id="ms-notes">' + esc(sup ? (sup.notes||'') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 16px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteSupplier(\'' + sup.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveSupplier(\'' + (isEdit ? sup.id : '') + '\')">' + (isEdit ? 'Save' : 'Add') + '</button>' +
        '</div>' +
      '</div>';
    if (sup && sup.status) { setTimeout(function(){ var el = safeEl('ms-status'); if(el) el.value = sup.status; }, 0); }
    window._mountModal(html);
  }

  window._mcSaveSupplier = function(id){
    var data = {
      name:         (safeEl('ms-name')||{}).value||'',
      country:      (safeEl('ms-country')||{}).value||'',
      brand:        (safeEl('ms-brand')||{}).value||'',
      moq:          (safeEl('ms-moq')||{}).value||'',
      leadTime:     (safeEl('ms-lead')||{}).value||'',
      status:       (safeEl('ms-status')||{}).value||'Prospecting',
      sampleStatus: (safeEl('ms-sample')||{}).value||'',
      notes:        (safeEl('ms-notes')||{}).value||'',
      lastContact:  firebase.firestore.FieldValue.serverTimestamp()
    };
    var op = id ? suppliersRef.doc(id).update(data) : suppliersRef.add(Object.assign(data,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
    op.then(function(){ window._closeModal(); showToast(id ? 'Supplier updated' : 'Supplier added'); window._mcSwitchView('suppliers'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteSupplier = function(id){
    if (!confirm('Delete supplier?')) return;
    suppliersRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Supplier removed'); window._mcSwitchView('suppliers'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 5 — SAMPLE TRACKER
  ══════════════════════════════════════════════════════════════════════════ */
  function renderSamples(area) {
    samplesRef.get().then(function(snap) {
      var samples = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      var statusCounts = {};
      SAMPLE_STATUSES.forEach(function(s){ statusCounts[s] = 0; });
      samples.forEach(function(s){ if (statusCounts[s.status] !== undefined) statusCounts[s.status]++; });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Sample Tracker</div><div class="mc-view-sub">' + samples.length + ' samples total</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddSample()"><i class="ph-light ph-plus"></i> Add Sample</button>' +
        '</div>' +

        /* Status swimlane counters */
        '<div class="mc-sample-lanes">' +
          SAMPLE_STATUSES.map(function(s) {
            var cnt = statusCounts[s];
            var active = cnt > 0;
            return '<div class="mc-sample-lane' + (active ? ' active' : '') + '" onclick="window._mcFilterSamples(\'' + s + '\')">' +
              '<div class="mc-sample-lane-count">' + cnt + '</div>' +
              '<div class="mc-sample-lane-label">' + s + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +

        '<div id="mc-samples-list">' +
          (samples.length ? renderSampleCards(samples) : mcEmpty('ph-package','No samples tracked','Begin sampling with your first request')) +
        '</div>';
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcFilterSamples = function(status) {
    samplesRef.get().then(function(snap){
      var all = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var filtered = all.filter(function(s){ return s.status === status; });
      var list = safeEl('mc-samples-list');
      if (list) list.innerHTML = filtered.length ? renderSampleCards(filtered) : mcEmpty('ph-package','No samples in this status','');
    });
  };

  function renderSampleCards(samples) {
    return '<div class="mc-sample-grid">' +
      samples.map(function(s) {
        var statusColors = { 'Approved':'#1a8742','Rejected':'#c0392b','Delivered':'#1a56db','Shipped':'#6e40c9','Customs':'#c07000','In Production':'#c07000','Requested':'#8a8a8a' };
        var col = statusColors[s.status] || '#8a8a8a';
        return '<div class="mc-sample-card" onclick="window._mcEditSample(\'' + s.id + '\')">' +
          '<div class="mc-sample-card-top">' +
            (s.imageUrl ? '<img src="' + esc(s.imageUrl) + '" class="mc-sample-img" alt="">' : '<div class="mc-sample-img-placeholder"><i class="ph-light ph-package"></i></div>') +
            '<div style="flex:1;min-width:0;">' +
              '<div class="mc-sample-name">' + esc(s.productName||'—') + '</div>' +
              '<div class="mc-row-meta">' + esc(s.brand||'—') + ' · ' + esc(s.supplier||'—') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="mc-sample-status" style="border-color:' + col + ';color:' + col + ';">' + esc(s.status||'Requested') + '</div>' +
          (s.qualityNotes ? '<div class="mc-sample-notes">' + esc(s.qualityNotes.substring(0,60)) + '…</div>' : '') +
        '</div>';
      }).join('') +
    '</div>';
  }

  window._mcAddSample = function(){ showSampleModal(null); };
  window._mcEditSample = function(id){
    samplesRef.doc(id).get().then(function(doc){
      if (doc.exists) showSampleModal(Object.assign({id:doc.id},doc.data()));
    });
  };

  function showSampleModal(s) {
    var isEdit = !!s;
    var html =
      '<div class="modal">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Sample' : 'Add Sample') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Product Name</label><input id="msp-name" value="' + esc(s ? s.productName : '') + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Brand</label><input id="msp-brand" value="' + esc(s ? s.brand : '') + '"></div>' +
          '<div class="form-group"><label>Supplier</label><input id="msp-supplier" value="' + esc(s ? s.supplier : '') + '"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Status</label><select id="msp-status">' + SAMPLE_STATUSES.map(function(st){ return '<option value="' + st + '"' + (s && s.status === st ? ' selected' : '') + '>' + st + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-group"><label>Material</label><input id="msp-material" value="' + esc(s ? s.material : '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label>Image URL</label><input id="msp-img" value="' + esc(s ? s.imageUrl : '') + '" placeholder="https://..."></div>' +
        '<div class="form-group"><label>Quality Notes</label><textarea id="msp-quality">' + esc(s ? (s.qualityNotes||'') : '') + '</textarea></div>' +
        '<div class="form-group"><label>Fit Notes</label><textarea id="msp-fit">' + esc(s ? (s.fitNotes||'') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 16px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteSample(\'' + s.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveSample(\'' + (isEdit ? s.id : '') + '\')">' + (isEdit ? 'Save' : 'Add') + '</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  }

  window._mcSaveSample = function(id){
    var data = {
      productName:  (safeEl('msp-name')||{}).value||'',
      brand:        (safeEl('msp-brand')||{}).value||'',
      supplier:     (safeEl('msp-supplier')||{}).value||'',
      status:       (safeEl('msp-status')||{}).value||'Requested',
      material:     (safeEl('msp-material')||{}).value||'',
      imageUrl:     (safeEl('msp-img')||{}).value||'',
      qualityNotes: (safeEl('msp-quality')||{}).value||'',
      fitNotes:     (safeEl('msp-fit')||{}).value||'',
      updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
    };
    var op = id ? samplesRef.doc(id).update(data) : samplesRef.add(Object.assign(data,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
    op.then(function(){ window._closeModal(); showToast(id ? 'Sample updated' : 'Sample added'); window._mcSwitchView('samples'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteSample = function(id){
    if (!confirm('Delete sample?')) return;
    samplesRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Sample removed'); window._mcSwitchView('samples'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 6 — CAMPAIGN PRODUCTION
  ══════════════════════════════════════════════════════════════════════════ */
  function renderCampaigns(area) {
    campaignsRef.get().then(function(snap) {
      var campaigns = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Campaign Production</div><div class="mc-view-sub">' + campaigns.length + ' campaigns tracked</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddCampaign()"><i class="ph-light ph-plus"></i> New Campaign</button>' +
        '</div>' +
        (campaigns.length ?
          '<div class="mc-campaign-list">' +
            campaigns.map(function(c){
              var stageIdx = CAMPAIGN_STAGES.indexOf(c.stage);
              var pct = stageIdx < 0 ? 0 : Math.round(((stageIdx + 1) / CAMPAIGN_STAGES.length) * 100);
              var isReady = c.stage === 'Campaign Ready';
              return '<div class="mc-campaign-card" onclick="window._mcEditCampaign(\'' + c.id + '\')">' +
                '<div class="mc-campaign-card-top">' +
                  '<div>' +
                    '<div class="mc-campaign-name">' + esc(c.name||'—') + '</div>' +
                    '<div class="mc-row-meta">' + esc(c.brand||'—') + (c.season ? ' · ' + esc(c.season) : '') + '</div>' +
                  '</div>' +
                  (isReady ? '<span class="mc-campaign-ready-badge">Ready</span>' : '') +
                '</div>' +
                '<div class="mc-campaign-progress-wrap">' +
                  '<div class="mc-campaign-progress-bar" style="width:' + pct + '%;background:' + (isReady ? '#1a8742' : 'var(--accent)') + ';"></div>' +
                '</div>' +
                '<div class="mc-campaign-stages">' +
                  CAMPAIGN_STAGES.map(function(s) {
                    var done = CAMPAIGN_STAGES.indexOf(s) <= stageIdx;
                    return '<div class="mc-cam-stage' + (done ? ' done' : '') + '" title="' + s + '">' +
                      '<i class="ph-light ' + (done ? 'ph-check-circle' : 'ph-circle') + '"></i>' +
                      '<span>' + s.split(' ')[0] + '</span>' +
                    '</div>';
                  }).join('') +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' :
          mcEmpty('ph-camera','No campaigns in production','Create your first campaign to begin production tracking')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcAddCampaign = function(){ showCampaignModal(null); };
  window._mcEditCampaign = function(id){
    campaignsRef.doc(id).get().then(function(doc){
      if (doc.exists) showCampaignModal(Object.assign({id:doc.id},doc.data()));
    });
  };

  function showCampaignModal(c) {
    var isEdit = !!c;
    var html =
      '<div class="modal">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Campaign' : 'New Campaign') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Campaign Name</label><input id="mc-name" value="' + esc(c ? c.name : '') + '" placeholder="e.g. Winter 2026 Editorial"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Brand</label><input id="mc-brand" value="' + esc(c ? c.brand : '') + '"></div>' +
          '<div class="form-group"><label>Season</label><input id="mc-season" value="' + esc(c ? c.season : '') + '" placeholder="e.g. SS26"></div>' +
        '</div>' +
        '<div class="form-group"><label>Current Stage</label><select id="mc-stage">' + CAMPAIGN_STAGES.map(function(s){ return '<option value="' + s + '"' + (c && c.stage === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-group"><label>Notes</label><textarea id="mc-notes">' + esc(c ? (c.notes||'') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 16px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteCampaign(\'' + c.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveCampaign(\'' + (isEdit ? c.id : '') + '\')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  }

  window._mcSaveCampaign = function(id){
    var data = {
      name:      (safeEl('mc-name')||{}).value||'',
      brand:     (safeEl('mc-brand')||{}).value||'',
      season:    (safeEl('mc-season')||{}).value||'',
      stage:     (safeEl('mc-stage')||{}).value||'Moodboard',
      notes:     (safeEl('mc-notes')||{}).value||'',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var op = id ? campaignsRef.doc(id).update(data) : campaignsRef.add(Object.assign(data,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
    op.then(function(){ window._closeModal(); showToast(id ? 'Campaign updated' : 'Campaign created'); window._mcSwitchView('campaigns'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteCampaign = function(id){
    if (!confirm('Delete campaign?')) return;
    campaignsRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Campaign removed'); window._mcSwitchView('campaigns'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 8 — WAITING ON
  ══════════════════════════════════════════════════════════════════════════ */
  function renderWaiting(area) {
    waitingOnRef.where('resolved','==',false).get().catch(function(){
      return waitingOnRef.get();
    }).then(function(snap) {
      var items = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      var cats = ['Brands','Suppliers','Samples','Campaigns','Operations','Launch','JANEDORE'];
      var grouped = {};
      cats.forEach(function(c){ grouped[c] = []; });
      items.forEach(function(item){
        var cat = item.category || 'Operations';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Waiting On</div><div class="mc-view-sub">Items outside your control</div></div>' +
          '<button class="mc-action-btn" onclick="window._mcAddWaiting()"><i class="ph-light ph-plus"></i> Add Item</button>' +
        '</div>' +
        (items.length ?
          cats.filter(function(c){ return grouped[c] && grouped[c].length; }).map(function(cat) {
            return '<div class="mc-section-label">' + cat + '</div>' +
              '<div class="mc-card" style="margin-bottom:10px;">' +
                grouped[cat].map(function(item) {
                  var daysSince = item.createdAt ? Math.round((Date.now() - (item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt)).getTime()) / 86400000) : 0;
                  var urgent = daysSince >= 5;
                  return '<div class="mc-waiting-row' + (urgent ? ' urgent' : '') + '">' +
                    '<i class="ph-light ph-hourglass" style="font-size:16px;color:' + (urgent ? '#c0392b' : 'var(--muted)') + ';flex-shrink:0;"></i>' +
                    '<div style="flex:1;min-width:0;">' +
                      '<div class="mc-waiting-text">' + esc(item.description||'—') + '</div>' +
                      '<div class="mc-row-meta">Added ' + daysSince + ' day' + (daysSince !== 1 ? 's' : '') + ' ago</div>' +
                    '</div>' +
                    '<button class="mc-resolve-btn" onclick="window._mcResolveWaiting(\'' + item.id + '\')">Resolve</button>' +
                  '</div>';
                }).join('') +
              '</div>';
          }).join('') :
          mcEmpty('ph-hourglass','Nothing waiting','All external items are resolved')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcAddWaiting = function(){
    var cats = ['Brands','Suppliers','Samples','Campaigns','Operations','Launch','JANEDORE'];
    var html =
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">Waiting On</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Description</label><textarea id="mw-desc" rows="3" placeholder="Waiting for supplier reply re: fabric MOQ..."></textarea></div>' +
        '<div class="form-group"><label>Category</label><select id="mw-cat">' + cats.map(function(c){ return '<option>' + c + '</option>'; }).join('') + '</select></div>' +
        '<div style="padding:0 16px 16px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveWaiting()">Add</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  };
  window._mcSaveWaiting = function(){
    var data = {
      description: (safeEl('mw-desc')||{}).value||'',
      category:    (safeEl('mw-cat')||{}).value||'Operations',
      resolved:    false,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    };
    waitingOnRef.add(data).then(function(){ window._closeModal(); showToast('Added to waiting list'); window._mcSwitchView('waiting'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcResolveWaiting = function(id){
    waitingOnRef.doc(id).update({ resolved: true }).then(function(){ showToast('Resolved'); window._mcSwitchView('waiting'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     SECTION 9 — FOUNDER NOTES
  ══════════════════════════════════════════════════════════════════════════ */
  function renderNotes(area) {
    founderNotesRef.orderBy('createdAt','desc').limit(50).get().then(function(snap) {
      var notes = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      area.innerHTML =
        '<div class="mc-view-header">' +
          '<div><div class="mc-view-title">Founder Notes</div><div class="mc-view-sub">Your running journal</div></div>' +
        '</div>' +

        /* Quick note entry */
        '<div class="mc-card" style="margin-bottom:14px;padding:16px;">' +
          '<textarea id="mc-note-input" class="mc-note-textarea" placeholder="Note something down... Found a better supplier today. Campaign direction needs work."></textarea>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;">' +
            '<select id="mc-note-tag" class="mc-note-tag-select">' +
              '<option value="">General</option>' +
              '<option value="Brand">Brand</option>' +
              '<option value="Supplier">Supplier</option>' +
              '<option value="Campaign">Campaign</option>' +
              '<option value="JANEDORE">JANEDORE</option>' +
              '<option value="Operations">Operations</option>' +
            '</select>' +
            '<button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="window._mcSaveNote()"><i class="ph-light ph-pencil-line"></i> Save Note</button>' +
          '</div>' +
        '</div>' +

        (notes.length ?
          '<div class="mc-notes-feed">' +
            notes.map(function(note) {
              var d = note.createdAt ? (note.createdAt.toDate ? note.createdAt.toDate() : new Date(note.createdAt)) : new Date();
              var timeStr = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) + ' at ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
              return '<div class="mc-note-card">' +
                '<div class="mc-note-card-top">' +
                  (note.tag ? '<span class="mc-note-tag">' + esc(note.tag) + '</span>' : '') +
                  '<span class="mc-note-time">' + timeStr + '</span>' +
                  '<button class="mc-icon-btn" onclick="window._mcDeleteNote(\'' + note.id + '\')"><i class="ph-light ph-trash"></i></button>' +
                '</div>' +
                '<div class="mc-note-body">' + esc(note.text||'') + '</div>' +
              '</div>';
            }).join('') +
          '</div>' :
          mcEmpty('ph-notebook','No notes yet','Your first note will appear here')
        );
    }).catch(function(e){ area.innerHTML = mcError(e); });
  }

  window._mcSaveNote = function(){
    var text = (safeEl('mc-note-input')||{}).value||'';
    if (!text.trim()) { showToast('Write something first','error'); return; }
    var tag = (safeEl('mc-note-tag')||{}).value||'';
    founderNotesRef.add({ text: text.trim(), tag: tag, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function(){ showToast('Note saved'); window._mcSwitchView('notes'); })
      .catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteNote = function(id){
    if (!confirm('Delete this note?')) return;
    founderNotesRef.doc(id).delete().then(function(){ showToast('Note deleted'); window._mcSwitchView('notes'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     CHART (from original dashboard)
  ══════════════════════════════════════════════════════════════════════════ */
  window._dashToggleBrand = function(key) {
    _activeFilters[key] = !_activeFilters[key];
    var btnKey = key.replace(/\s/g,'-');
    var btn = safeEl('dash-toggle-' + btnKey);
    if (btn) btn.classList.toggle('active', _activeFilters[key]);
    buildChart(_allOrders);
  };

  function buildDayMap() {
    var days = {}, now = Date.now(), DAY = 86400000;
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now - i * DAY);
      var key = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      days[key] = key;
    }
    return Object.keys(days);
  }

  function buildChart(orders) {
    var canvas = safeEl('orders-chart');
    if (!canvas || !window.Chart) return;
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }

    var labels = buildDayMap();
    var brandDayData   = {};
    var brandDayOrders = {};

    BRANDS.forEach(function(b){
      brandDayData[b.key] = {};
      brandDayOrders[b.key] = {};
      labels.forEach(function(lbl){ brandDayData[b.key][lbl] = 0; brandDayOrders[b.key][lbl] = []; });
    });

    orders.forEach(function(o){
      if (!o.createdAt) return;
      var d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      var lbl = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      var brand = (o.brand||'').toUpperCase();
      var matched = BRANDS.find(function(b){ return b.key === brand; });
      var key = matched ? matched.key : 'JANEDORE';
      if (brandDayData[key][lbl] === undefined) return;
      brandDayData[key][lbl]++;
      brandDayOrders[key][lbl].push(o);
    });

    window._dashBrandDayOrders = brandDayOrders;
    window._dashLabels = labels;

    var datasets = BRANDS.filter(function(b){ return _activeFilters[b.key]; }).map(function(b){
      return { label: b.key, data: labels.map(function(lbl){ return brandDayData[b.key][lbl]; }), borderColor: b.color, backgroundColor: b.bg, borderWidth: 1.5, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: b.color, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 };
    });

    window._analyticsChart = new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family: 'Manrope' }, maxTicksLimit: 8, color: '#bbb' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family: 'Manrope' }, precision: 0, color: '#bbb' }, beginAtZero: true }
        },
        onClick: function(evt, elements){ if (elements && elements.length) { var idx = elements[0].index; window._dashOpenDayPopup(labels[idx]); } }
      }
    });
  }

  window._dashOpenDayPopup = function(dayLabel) {
    var popup = safeEl('dash-day-popup'), titleEl = safeEl('dash-popup-title'), bodyEl = safeEl('dash-popup-body');
    if (!popup || !titleEl || !bodyEl) return;
    var allDayOrders = [];
    var bdOrders = window._dashBrandDayOrders || {};
    BRANDS.forEach(function(b){
      if (bdOrders[b.key] && bdOrders[b.key][dayLabel]) {
        bdOrders[b.key][dayLabel].forEach(function(o){ allDayOrders.push(Object.assign({_brand:b.key,_color:b.color},o)); });
      }
    });
    titleEl.textContent = dayLabel;
    if (!allDayOrders.length) {
      bodyEl.innerHTML = '<div class="dash-popup-empty"><i class="ph-light ph-receipt" style="font-size:22px;opacity:.2;"></i><span>No orders on this day</span></div>';
    } else {
      bodyEl.innerHTML = allDayOrders.map(function(o){
        var orderId = (o.orderId||o.id||'—').toString().slice(-6).toUpperCase();
        var customer = o.customerName||o.email||'Customer';
        var amount = o.subtotal != null ? 'R'+Number(o.subtotal).toFixed(2) : '—';
        var status = o.status||'pending';
        return '<div class="dash-popup-row"><div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;"><span class="dash-popup-brand-dot" style="background:'+o._color+';"></span><div><div class="dash-popup-order-id">#'+esc(orderId)+'</div><div class="dash-popup-customer">'+esc(customer)+'</div></div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;"><span class="dash-popup-amount">'+esc(amount)+'</span><span class="badge badge-'+esc(status)+'">'+esc(status)+'</span></div></div>';
      }).join('');
    }
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

  /* ─── HELPERS ────────────────────────────────────────────────────────────── */
  function statusPill(status) {
    if (!status) return '';
    var colors = { 'Active':'#1a8742','Confirmed':'#1a8742','Approved':'#1a8742','Live':'#1a8742','Delivered':'#1a56db','Shipped':'#6e40c9','Customs':'#c07000','In Production':'#c07000','Sampling':'#c07000','Contacted':'#c07000','Campaign Ready':'#1a8742','Rejected':'#c0392b','Paused':'#c0392b' };
    var col = colors[status] || '#8a8a8a';
    return '<span style="font-size:10px;font-weight:600;letter-spacing:.04em;padding:2px 8px;border-radius:20px;border:1px solid ' + col + ';color:' + col + ';white-space:nowrap;">' + esc(status) + '</span>';
  }

  function mcEmpty(icon, title, sub) {
    return '<div class="mc-empty"><i class="ph-light ' + icon + '"></i><div class="mc-empty-title">' + title + '</div>' + (sub ? '<div class="mc-empty-sub">' + sub + '</div>' : '') + '</div>';
  }

  function mcError(e) {
    return '<div class="mc-error"><i class="ph-light ph-warning"></i> ' + esc(e ? e.message : 'Error') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CSS INJECTION — Mission Control styles
  ══════════════════════════════════════════════════════════════════════════ */
  function injectMCStyles() {
    if (document.getElementById('mc-styles')) return;
    var style = document.createElement('style');
    style.id = 'mc-styles';
    style.textContent = `

/* ── MC SHELL ── */
.mc-shell {
  display: flex;
  gap: 0;
  min-height: calc(100vh - var(--nav-h));
}

/* ── MC NAV (left rail) ── */
.mc-nav {
  width: 200px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0 0 20px;
  position: sticky;
  top: var(--nav-h);
  height: calc(100vh - var(--nav-h));
  overflow-y: auto;
}
@media(max-width: 1023px) {
  .mc-nav { display: none; }
}
.mc-nav-header {
  padding: 16px 14px 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 8px;
}
.mc-nav-wordmark {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .18em;
  color: var(--muted2);
  margin-bottom: 3px;
}
.mc-nav-date {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: .06em;
  font-weight: 500;
}
.mc-nav-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 8px;
}
.mc-nav-item {
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
.mc-nav-item:hover { background: var(--bg); color: var(--text); }
.mc-nav-item.active { background: var(--bg); color: var(--text); font-weight: 500; }
.mc-nav-item i { font-size: 16px; width: 18px; text-align: center; flex-shrink: 0; opacity: .5; }
.mc-nav-item.active i { opacity: 1; }

/* ── MC VIEW AREA ── */
#mc-view-area {
  flex: 1;
  min-width: 0;
  padding: 0 0 40px;
}

/* ── MC LOADING ── */
.mc-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted2);
  font-size: 22px;
}
.mc-spin { animation: mcSpin .8s linear infinite; }
@keyframes mcSpin { to { transform: rotate(360deg); } }

/* ── HERO ── */
.mc-hero {
  display: flex;
  gap: 16px;
  background: var(--surface);
  border-radius: var(--r);
  border: 0.5px solid var(--border);
  padding: 20px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-xs);
  flex-wrap: wrap;
}
.mc-hero-left {
  flex: 1;
  min-width: 180px;
}
.mc-hero-right {
  flex: 1;
  min-width: 200px;
}
.mc-hero-eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--muted2);
  margin-bottom: 8px;
}
.mc-hero-score {
  font-family: var(--font);
  font-size: 64px;
  font-weight: 200;
  color: var(--text);
  line-height: 1;
  letter-spacing: -.03em;
}
.mc-hero-score-unit {
  font-size: 28px;
  font-weight: 300;
  letter-spacing: 0;
  opacity: .45;
}
.mc-hero-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 8px 0 10px;
}
.mc-hero-bar-wrap {
  height: 3px;
  background: var(--border-med);
  border-radius: 2px;
  overflow: hidden;
  max-width: 220px;
  margin-bottom: 8px;
}
.mc-hero-bar {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), #60a5fa);
  transition: width .8s cubic-bezier(.32,.72,0,1);
}
.mc-hero-sublabel {
  font-size: 12px;
  color: var(--muted);
  font-weight: 300;
}
.mc-kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.mc-kpi-card {
  background: var(--surface2);
  border: 0.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mc-kpi-icon { font-size: 16px; margin-bottom: 2px; }
.mc-kpi-value {
  font-family: var(--font);
  font-size: 22px;
  font-weight: 200;
  color: var(--text);
  line-height: 1;
}
.mc-kpi-label {
  font-size: 9.5px;
  color: var(--muted);
  font-weight: 500;
  letter-spacing: .04em;
}

/* ── FOCUS ── */
.mc-focus-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  margin-bottom: 12px;
  box-shadow: var(--shadow-xs);
}
.mc-focus-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.mc-focus-item:last-child { border-bottom: none; }
.mc-focus-item:active { background: var(--surface2); }
.mc-focus-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mc-focus-text { font-size: 13px; color: var(--text); flex: 1; }
.mc-focus-arrow { font-size: 16px; color: var(--muted2); }
.mc-focus-empty {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 16px 18px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
  box-shadow: var(--shadow-xs);
}

/* ── FUNNEL ── */
.mc-funnel {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  margin-bottom: 12px;
  box-shadow: var(--shadow-xs);
}
.mc-funnel-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.mc-funnel-row:last-child { border-bottom: none; }
.mc-funnel-row:active { background: var(--surface2); }
.mc-funnel-label {
  font-size: 11.5px;
  color: var(--muted);
  width: 130px;
  flex-shrink: 0;
  font-weight: 400;
}
.mc-funnel-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--surface3);
  border-radius: 3px;
  overflow: hidden;
}
.mc-funnel-bar {
  height: 100%;
  border-radius: 3px;
  background: var(--border-med);
  transition: width .5s cubic-bezier(.32,.72,0,1);
}
.mc-funnel-bar.live { background: #1a8742; }
.mc-funnel-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  width: 24px;
  text-align: right;
  flex-shrink: 0;
}

/* ── SECTION LABELS ── */
.mc-section-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted2);
  margin: 16px 0 7px;
  padding: 0 2px;
}

/* ── MC CARD ── */
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
}
.mc-card-title {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
}
.mc-action-btn-sm {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font);
  letter-spacing: .02em;
}

/* ── VIEW HEADER ── */
.mc-view-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.mc-view-title {
  font-family: var(--font);
  font-size: 22px;
  font-weight: 200;
  color: var(--text);
  letter-spacing: .02em;
}
.mc-view-sub {
  font-size: 11px;
  color: var(--muted);
  margin-top: 3px;
}
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
  letter-spacing: .02em;
  transition: opacity .15s;
  white-space: nowrap;
}
.mc-action-btn:active { opacity: .8; }

/* ── STAGE PILLS ── */
.mc-stage-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 14px;
  padding-bottom: 2px;
}
.mc-stage-pills::-webkit-scrollbar { display: none; }
.mc-stage-pill {
  flex-shrink: 0;
  background: var(--surface);
  border: 0.5px solid var(--border-med);
  border-radius: 20px;
  padding: 5px 12px;
  font-family: var(--font);
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
  cursor: pointer;
  transition: all .12s;
  white-space: nowrap;
}
.mc-stage-pill.active {
  background: var(--text);
  border-color: var(--text);
  color: #fff;
  font-weight: 500;
}
.mc-pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  background: rgba(255,255,255,0.25);
  border-radius: 8px;
  font-size: 9.5px;
  font-weight: 700;
  padding: 0 4px;
  margin-left: 3px;
}
.mc-stage-pill:not(.active) .mc-pill-count {
  background: var(--surface3);
  color: var(--text2);
}

/* ── BRAND CARDS ── */
.mc-brands-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.mc-brand-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  cursor: pointer;
  transition: box-shadow .15s, transform .1s;
  box-shadow: var(--shadow-xs);
}
.mc-brand-card:active { transform: scale(0.99); box-shadow: var(--shadow-md); }
.mc-brand-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.mc-brand-avatar {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--surface3);
  border: 0.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  flex-shrink: 0;
  letter-spacing: .04em;
}
.mc-brand-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mc-brand-meta { font-size: 11px; color: var(--muted); margin-top: 1px; }
.mc-priority-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mc-brand-stage {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  padding: 3px 10px;
  border-radius: 20px;
  display: inline-flex;
  margin-bottom: 8px;
}
.mc-stage-live { background: var(--success-soft); color: var(--success); }
.mc-stage-approved { background: var(--accent-soft); color: var(--accent); }
.mc-stage-default { background: var(--surface3); color: var(--muted); }
.mc-brand-notes {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
  margin-bottom: 9px;
  font-style: italic;
}
.mc-brand-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 0.5px solid rgba(0,0,0,0.05);
  padding-top: 9px;
  margin-top: 4px;
}
.mc-brand-since { font-size: 10.5px; color: var(--muted2); }
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
}
.mc-icon-btn:active { background: var(--border-med); }

/* ── JANEDORE RING ── */
.mc-jd-hero {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 20px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-xs);
  flex-wrap: wrap;
}
.mc-jd-ring-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}
.mc-jd-ring-svg { width: 80px; height: 80px; transform: rotate(-90deg); }
.mc-jd-ring-bg { fill: none; stroke: var(--border-med); stroke-width: 6; }
.mc-jd-ring-fill { fill: none; stroke: var(--accent); stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset .8s cubic-bezier(.32,.72,0,1); }
.mc-jd-ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.mc-jd-ring-pct { font-size: 18px; font-weight: 200; color: var(--text); line-height: 1; }
.mc-jd-ring-sub { font-size: 9px; color: var(--muted); margin-top: 1px; font-weight: 500; letter-spacing: .06em; }
.mc-jd-stages { flex: 1; display: flex; flex-direction: column; gap: 7px; }
.mc-jd-stage-row { display: flex; align-items: center; gap: 9px; }
.mc-jd-stage-check { font-size: 16px; color: var(--muted2); flex-shrink: 0; }
.mc-jd-stage-check.done { color: var(--success); }
.mc-jd-stage-label { font-size: 12.5px; color: var(--text2); }
.mc-jd-stage-label.done { color: var(--muted); text-decoration: line-through; }

/* ── TABLE ── */
.mc-table-wrap {
  background: var(--surface);
  border-radius: var(--r);
  border: 0.5px solid var(--border);
  overflow: hidden;
  overflow-x: auto;
  box-shadow: var(--shadow-xs);
}
.mc-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 540px;
}
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
.mc-table td {
  padding: 10px 14px;
  font-size: 12.5px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  vertical-align: middle;
}
.mc-table tbody tr:last-child td { border-bottom: none; }
.mc-table tbody tr { cursor: pointer; transition: background .1s; }
.mc-table tbody tr:hover { background: var(--surface2); }

/* ── SAMPLE LANES ── */
.mc-sample-lanes {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 14px;
}
.mc-sample-lanes::-webkit-scrollbar { display: none; }
.mc-sample-lane {
  flex: 1;
  min-width: 80px;
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 10px 10px 9px;
  text-align: center;
  cursor: pointer;
  transition: all .12s;
  box-shadow: var(--shadow-xs);
  opacity: .5;
}
.mc-sample-lane.active { opacity: 1; border-color: var(--accent); }
.mc-sample-lane-count { font-size: 20px; font-weight: 200; color: var(--text); line-height: 1; }
.mc-sample-lane-label { font-size: 9px; color: var(--muted); margin-top: 3px; font-weight: 600; letter-spacing: .05em; }

/* ── SAMPLE CARDS ── */
.mc-sample-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.mc-sample-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 12px;
  cursor: pointer;
  transition: box-shadow .15s;
  box-shadow: var(--shadow-xs);
}
.mc-sample-card:active { box-shadow: var(--shadow-md); }
.mc-sample-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.mc-sample-img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; border: 0.5px solid var(--border); flex-shrink: 0; }
.mc-sample-img-placeholder { width: 42px; height: 42px; border-radius: 8px; background: var(--surface3); display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--muted2); flex-shrink: 0; }
.mc-sample-name { font-size: 13px; font-weight: 400; color: var(--text); }
.mc-sample-status { font-size: 10px; font-weight: 600; letter-spacing: .05em; padding: 2px 8px; border-radius: 20px; border: 1px solid; display: inline-flex; margin-bottom: 6px; }
.mc-sample-notes { font-size: 11px; color: var(--muted); font-style: italic; line-height: 1.4; }

/* ── CAMPAIGN CARDS ── */
.mc-campaign-list { display: flex; flex-direction: column; gap: 10px; }
.mc-campaign-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  transition: box-shadow .15s;
}
.mc-campaign-card:active { box-shadow: var(--shadow-md); }
.mc-campaign-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 11px; }
.mc-campaign-name { font-size: 14px; font-weight: 400; color: var(--text); }
.mc-campaign-ready-badge {
  font-size: 10px; font-weight: 600; letter-spacing: .05em;
  padding: 3px 9px; border-radius: 20px;
  background: var(--success-soft); color: var(--success);
  flex-shrink: 0;
}
.mc-campaign-progress-wrap { height: 3px; background: var(--border-med); border-radius: 2px; overflow: hidden; margin-bottom: 12px; }
.mc-campaign-progress-bar { height: 100%; border-radius: 2px; transition: width .6s cubic-bezier(.32,.72,0,1); }
.mc-campaign-stages { display: flex; gap: 6px; flex-wrap: wrap; }
.mc-cam-stage {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--muted2);
  font-weight: 400;
}
.mc-cam-stage.done { color: var(--text2); }
.mc-cam-stage i { font-size: 13px; }

/* ── WAITING ROWS ── */
.mc-waiting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
}
.mc-waiting-row:last-child { border-bottom: none; }
.mc-waiting-row.urgent { background: rgba(192,57,43,0.03); }
.mc-waiting-text { font-size: 13px; color: var(--text); }
.mc-resolve-btn {
  font-size: 11px; font-weight: 600;
  color: var(--success);
  background: var(--success-soft);
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: var(--font);
  flex-shrink: 0;
  transition: opacity .12s;
}
.mc-resolve-btn:active { opacity: .75; }

/* ── NOTES ── */
.mc-note-textarea {
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
.mc-note-textarea:focus { border-color: rgba(26,86,219,0.35); }
.mc-note-tag-select {
  background: var(--surface2);
  border: 0.5px solid var(--border-med);
  border-radius: var(--r-xs);
  padding: 7px 10px;
  font-family: var(--font);
  font-size: 12px;
  color: var(--text2);
  outline: none;
}
.mc-notes-feed { display: flex; flex-direction: column; gap: 8px; }
.mc-note-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 13px 14px;
  box-shadow: var(--shadow-xs);
}
.mc-note-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.mc-note-tag {
  font-size: 9.5px; font-weight: 700;
  letter-spacing: .07em;
  padding: 2px 8px; border-radius: 20px;
  background: var(--accent-soft); color: var(--accent);
}
.mc-note-time { font-size: 10.5px; color: var(--muted2); }
.mc-note-body { font-size: 13px; color: var(--text); line-height: 1.55; font-weight: 300; }

/* ── SUPPLIER ROW ── */
.mc-supplier-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
}
.mc-supplier-row:last-child { border-bottom: none; }
.mc-row-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }

/* ── EMPTY / ERROR ── */
.mc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 20px;
  gap: 8px;
  color: var(--muted);
}
.mc-empty i { font-size: 30px; opacity: .2; }
.mc-empty-title { font-size: 15px; font-weight: 300; color: var(--text); }
.mc-empty-sub { font-size: 12px; color: var(--muted); max-width: 280px; line-height: 1.55; }
.mc-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 16px;
  font-size: 12.5px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: var(--r-sm);
}

/* ── RESPONSIVE: mobile MC nav becomes horizontal scroll ── */
@media(max-width: 1023px) {
  .mc-shell { flex-direction: column; }
  .mc-mobile-nav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0 0 10px;
    margin-bottom: 4px;
  }
  .mc-mobile-nav::-webkit-scrollbar { display: none; }
}
    `;
    document.head.appendChild(style);

    /* On mobile, inject a horizontal nav above the view */
    if (window.innerWidth < 1024) {
      var mobileNav = document.getElementById('mc-mobile-nav');
      if (!mobileNav) {
        var shell = document.querySelector('.mc-shell');
        if (shell) {
          var navDiv = document.createElement('div');
          navDiv.id = 'mc-mobile-nav';
          navDiv.className = 'mc-mobile-nav';
          var items = [
            {id:'overview',label:'Overview'},
            {id:'brands',label:'Brands'},
            {id:'janedore',label:'JANEDORE'},
            {id:'suppliers',label:'Suppliers'},
            {id:'samples',label:'Samples'},
            {id:'campaigns',label:'Campaigns'},
            {id:'waiting',label:'Waiting'},
            {id:'notes',label:'Notes'}
          ];
          navDiv.innerHTML = items.map(function(i){
            return '<button class="mc-stage-pill' + (_mcView === i.id ? ' active' : '') + '" onclick="window._mcSwitchView(\'' + i.id + '\')">' + i.label + '</button>';
          }).join('');
          shell.insertBefore(navDiv, shell.firstChild);
        }
      }
    }
  }

})();
