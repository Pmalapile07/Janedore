(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var db        = window._adminDB;
  var showToast = window._showToast;

  /* ─── BRANDS ─────────────────────────────────────────────────────────────── */
  var BRANDS = [
    { key: 'JANEDORE',  color: '#1a56db', bg: 'rgba(26,86,219,0.08)',  operator: true  },
    { key: 'NIRIUS CO', color: '#6e40c9', bg: 'rgba(110,64,201,0.08)', operator: false },
    { key: 'THATO',     color: '#111111', bg: 'rgba(17,17,17,0.06)',   operator: false }
  ];

  var _view         = 'dashboard';
  var _allOrders    = [];
  var _brandFilters = { 'JANEDORE': true, 'NIRIUS CO': true, 'THATO': true };

  var productsRef      = window._productsRef || db.collection('products');
  var projectsRef      = db.collection('launch_projects');
  var suppliersRef     = db.collection('suppliers');
  var waitingRef       = db.collection('waiting_on');
  var notesRef         = db.collection('founder_notes');
  var ordersRef        = window._ordersRef   || db.collection('orders');
  var activityRef      = db.collection('activity_feed');
  var platformTasksRef = db.collection('platform_tasks');
  var brandUpdatesRef  = db.collection('brand_updates');

  window._projectsRef  = projectsRef;
  window._suppliersRef = suppliersRef;

  function currentUserBrand() { return window._currentUserBrand || null; }
  function isOperator() { return (window._currentUserRole || 'SUPER_ADMIN') === 'SUPER_ADMIN'; }

  var PROJECT_STAGES = {
    'Sample':          ['Requested','Shipped','In Customs','Delivered','Approved'],
    'Packaging':       ['Designed','Supplier Found','Ordered','In Production','Delivered','Approved'],
    'Campaign':        ['Moodboard','Direction','Shoot Booked','Shoot Complete','Edited','Published'],
    'Photoshoot':      ['Booked','Products Prepped','Shoot Complete','Edited','Delivered'],
    'Fragrance':       ['Direction','Formula','Bottle Design','Sample','Lab Approved','Production'],
    'Brand Initiative':['Concept','Research','Planning','In Progress','Complete'],
    'Platform':        ['Scoped','In Development','Testing','Deployed']
  };

  /* ── READINESS HELPERS ─────────────────────────────────────────────────── */
  function hasImage(p) {
    if (p.image_url && String(p.image_url).length > 4) return true;
    if (Array.isArray(p.images) && p.images.length > 0) return true;
    if (Array.isArray(p.variants)) {
      return p.variants.some(function (v) {
        if (!v.images) return false;
        return (Array.isArray(v.images.model)  && v.images.model.length  > 0) ||
               (Array.isArray(v.images.ghost)  && v.images.ghost.length  > 0) ||
               (Array.isArray(v.images.detail) && v.images.detail.length > 0);
      });
    }
    return false;
  }
  function hasPrice(p) {
    if (p.price && Number(p.price) > 0) return true;
    if (Array.isArray(p.variants)) return p.variants.some(function (v) { return v.price && Number(v.price) > 0; });
    return false;
  }
  function hasInventory(p) {
    if (p.inventory && Number(p.inventory) > 0) return true;
    if (p.stock     && Number(p.stock)     > 0) return true;
    if (p.quantity  && Number(p.quantity)  > 0) return true;
    if (Array.isArray(p.variants)) {
      return p.variants.some(function (v) {
        return (v.inventory && Number(v.inventory) > 0) || (v.stock && Number(v.stock) > 0) || (v.quantity && Number(v.quantity) > 0);
      });
    }
    return false;
  }
  function isPublished(p) {
    if (p.published === true || p.visible === true) return true;
    return p.status === 'active' || p.status === 'published' || p.status === 'live';
  }
  function scoreProduct(p) {
    var img = hasImage(p) ? 1 : 0, prc = hasPrice(p) ? 1 : 0, inv = hasInventory(p) ? 1 : 0, pub = isPublished(p) ? 1 : 0;
    return { img: img, prc: prc, inv: inv, pub: pub, total: img + prc + inv + pub };
  }
  function getPrice(p) {
    if (p.price && Number(p.price) > 0) return 'R' + Number(p.price).toLocaleString('en-ZA');
    if (Array.isArray(p.variants)) {
      var prices = p.variants.map(function (v) { return Number(v.price || 0); }).filter(function (x) { return x > 0; });
      if (prices.length) return 'R' + Math.min.apply(null, prices).toLocaleString('en-ZA');
    }
    return null;
  }
  function getBrand(p) {
    var b = (p.brand || p.vendorId || '').toUpperCase().trim();
    var match = BRANDS.find(function (br) { return br.key === b || b.indexOf(br.key) > -1; });
    return match ? match.key : (b || 'JANEDORE');
  }
  function brandMeta(key) { return BRANDS.find(function (b) { return b.key === key; }) || BRANDS[0]; }
  function d2o(doc) { return Object.assign({ id: doc.id }, doc.data()); }
  function tsMs(ts) { if (!ts) return 0; return (ts.toDate ? ts.toDate() : new Date(ts)).getTime(); }
  function relTime(ts) {
    if (!ts) return '';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return diff + 'm ago';
    if (diff < 1440) return Math.floor(diff / 60) + 'h ago';
    if (diff < 10080) return Math.floor(diff / 1440) + 'd ago';
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
  }
  function statusPill(status) {
    if (!status) return '';
    var map = { 'Active': '#1a8742', 'Confirmed': '#1a8742', 'Approved': '#1a8742', 'Shipped': '#6e40c9', 'Sampling': '#c07000', 'Contacted': '#c07000', 'Paused': '#c0392b', 'Dropped': '#c0392b' };
    var col = map[status] || '#8a8a8a';
    return '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;border:1px solid ' + col + ';color:' + col + ';">' + esc(status) + '</span>';
  }
  function emptyState(icon, title, sub) {
    return '<div class="mc-empty"><i class="ph-light ' + icon + '"></i><div class="mc-empty-title">' + title + '</div>' + (sub ? '<div class="mc-empty-sub">' + sub + '</div>' : '') + '</div>';
  }
  function errBanner(e) { return '<div class="mc-err"><i class="ph-light ph-warning"></i> ' + esc(e ? e.message : 'Error loading data') + '</div>'; }

  /* ── MAIN ENTRY ────────────────────────────────────────────────────────── */
  window._renderDashboardTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    injectStyles();
    mc.innerHTML =
      '<div class="mc-shell">' +
        buildSideNav() +
        '<div class="mc-body">' +
          buildMobileNav() +
          '<div id="mc-area"></div>' +
        '</div>' +
      '</div>';
    renderView();
  };

  var NAV_ITEMS = [
    { id: 'dashboard',   icon: 'ph-house',          label: 'Home'        },
    { id: 'collections', icon: 'ph-stack',           label: 'Collections' },
    { id: 'projects',    icon: 'ph-rocket-launch',   label: 'Projects'    },
    { id: 'orders',      icon: 'ph-receipt',         label: 'Orders'      },
    { id: 'suppliers',   icon: 'ph-factory',         label: 'Suppliers'   },
    { id: 'updates',     icon: 'ph-chat-circle',     label: 'Updates'     },
    { id: 'notes',       icon: 'ph-notebook-text',   label: 'Notes'       }
  ];

  function buildSideNav() {
    return '<nav class="mc-sidenav">' +
      '<div class="mc-sidenav-top">' +
        '<div class="mc-sidenav-brand">Janedore</div>' +
        '<div class="mc-sidenav-date">' + new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'2-digit', month:'long' }) + '</div>' +
      '</div>' +
      NAV_ITEMS.map(function (n) {
        return '<button class="mc-snav-btn' + (_view === n.id ? ' mc-on' : '') + '" onclick="window._mcGo(\'' + n.id + '\')">' +
          '<i class="ph-light ' + n.icon + '"></i><span>' + n.label + '</span></button>';
      }).join('') +
    '</nav>';
  }
  function buildMobileNav() {
    return '<div class="mc-mnav">' +
      NAV_ITEMS.map(function (n) {
        return '<button class="mc-mpill' + (_view === n.id ? ' mc-on' : '') + '" onclick="window._mcGo(\'' + n.id + '\')">' + n.label + '</button>';
      }).join('') +
    '</div>';
  }
  window._mcGo = function (v) {
    _view = v;
    document.querySelectorAll('.mc-snav-btn, .mc-mpill').forEach(function (b) {
      b.classList.toggle('mc-on', !!(b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'" + v + "'") > -1));
    });
    renderView();
  };
  function renderView() {
    var area = safeEl('mc-area');
    if (!area) return;
    area.innerHTML = '<div class="mc-loading"><i class="ph-light ph-circle-notch mc-spin"></i></div>';
    switch (_view) {
      case 'dashboard':   viewDashboard(area);   break;
      case 'collections': viewCollections(area); break;
      case 'projects':    viewProjects(area);    break;
      case 'orders':      viewOrders(area);      break;
      case 'suppliers':   viewSuppliers(area);   break;
      case 'updates':     viewUpdates(area);     break;
      case 'notes':       viewNotes(area);       break;
    }
  }

  /* ══ DASHBOARD ══════════════════════════════════════════════════════════════ */
  function viewDashboard(area) {
    Promise.all([
      productsRef.get(),
      waitingRef.get(),
      activityRef.orderBy('createdAt','desc').limit(8).get().catch(function(){ return {docs:[]}; }),
      projectsRef.get().catch(function(){ return {docs:[]}; }),
      platformTasksRef.get().catch(function(){ return {docs:[]}; }),
      brandUpdatesRef.orderBy('createdAt','desc').limit(6).get().catch(function(){ return {docs:[]}; })
    ]).then(function (res) {
      var products      = res[0].docs.map(d2o);
      var waiting       = res[1].docs.map(d2o).filter(function(w){ return !w.resolved; });
      var activity      = res[2].docs.map(d2o);
      var projects      = res[3].docs.map(d2o);
      var platformTasks = res[4].docs.map(d2o);
      var brandUpdates  = res[5].docs.map(d2o);

      var scored = products.map(function(p){ return Object.assign({},p,{_score:scoreProduct(p),_brand:getBrand(p)}); });
      var rd = calcReadiness(scored);
      var brandScores = {};
      BRANDS.forEach(function(b){
        var bp = scored.filter(function(p){ return p._brand === b.key; });
        brandScores[b.key] = bp.length ? calcReadiness(bp) : { overall:0, readyCount:0, total:0, bottleneck:null };
      });

      var blocked = scored.filter(function(p){ return p._score.total < 4; }).sort(function(a,b){ return b._score.total - a._score.total; });
      var nba = blocked[0] || null;
      var overdueProject = null;
      if (!nba) {
        var now = Date.now();
        overdueProject = projects.filter(function(p){
          if (!p.expectedDate) return false;
          var d = p.expectedDate.toDate ? p.expectedDate.toDate() : new Date(p.expectedDate);
          return d.getTime() < now;
        }).sort(function(a,b){
          return tsMs(a.expectedDate) - tsMs(b.expectedDate);
        })[0] || null;
      }

      var hour = new Date().getHours();
      var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

      area.innerHTML =
        '<div class="fd-page">' +
          '<div class="fd-greeting"><span class="fd-greeting-text">' + greeting + '</span></div>' +
          '<div class="fd-top-row">' + buildReadinessCard(rd, scored.length) + buildNextActionCard(nba, overdueProject) + '</div>' +
          buildPlatformSection(platformTasks) +
          buildBrandStatusSection(brandScores) +
          buildWaitingSection(waiting) +
          buildBrandUpdatesFeed(brandUpdates) +
          buildActivitySection(activity, products, projects) +
        '</div>';
    }).catch(function(e){ area.innerHTML = errBanner(e); });
  }

  function calcReadiness(scored) {
    var n = scored.length;
    if (!n) return { overall:0, readyCount:0, total:0, bottleneck:null };
    var t = { pts:0, img:0, prc:0, inv:0, pub:0 };
    scored.forEach(function(p){ t.pts+=p._score.total; t.img+=p._score.img; t.prc+=p._score.prc; t.inv+=p._score.inv; t.pub+=p._score.pub; });
    var checks = [
      { label:'photography', count: n - t.img },
      { label:'pricing',     count: n - t.prc },
      { label:'inventory',   count: n - t.inv },
      { label:'publishing',  count: n - t.pub }
    ].filter(function(c){ return c.count > 0; }).sort(function(a,b){ return b.count - a.count; });
    return { overall: Math.round((t.pts/(n*4))*100), readyCount: scored.filter(function(p){ return p._score.total===4; }).length, total:n, bottleneck: checks[0]||null };
  }

  function buildReadinessCard(rd, total) {
    var pct = rd.overall, circ = 226, dash = Math.round((pct/100)*circ);
    var col = pct >= 80 ? 'var(--fd-green)' : pct >= 50 ? 'var(--fd-amber)' : 'var(--fd-red)';
    var hint = rd.bottleneck ? '<div class="fd-ready-hint">Missing ' + rd.bottleneck.label + ' on ' + rd.bottleneck.count + ' product' + (rd.bottleneck.count>1?'s':'') + '</div>' : '';
    return '<div class="fd-card fd-readiness-card" onclick="window._mcGo(\'collections\')">' +
      '<div class="fd-card-label">Launch Readiness</div>' +
      '<div class="fd-readiness-body">' +
        '<div class="fd-arc-wrap">' +
          '<svg class="fd-arc-svg" viewBox="0 0 80 80">' +
            '<circle class="fd-arc-track" cx="40" cy="40" r="36" fill="none" stroke-width="5"/>' +
            '<circle class="fd-arc-fill" cx="40" cy="40" r="36" fill="none" stroke-width="5" stroke="' + col + '" stroke-dasharray="' + dash + ' ' + circ + '" stroke-dashoffset="0" transform="rotate(-90 40 40)"/>' +
          '</svg>' +
          '<div class="fd-arc-inner"><div class="fd-arc-pct" style="color:' + col + ';">' + pct + '</div><div class="fd-arc-unit">%</div></div>' +
        '</div>' +
        '<div class="fd-readiness-info">' +
          '<div class="fd-readiness-sub">' + rd.readyCount + ' of ' + total + ' products ready</div>' +
          hint +
          '<div class="fd-card-cta">View Collections <i class="ph-light ph-arrow-right"></i></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function buildNextActionCard(p, overdueProject) {
    if (!p && !overdueProject) {
      return '<div class="fd-card fd-next-card fd-next-clear">' +
        '<div class="fd-card-label">Next Action</div>' +
        '<div class="fd-next-body"><div class="fd-next-icon fd-next-icon-ok"><i class="ph-light ph-check-circle"></i></div>' +
        '<div class="fd-next-content"><div class="fd-next-title">You\'re all clear</div><div class="fd-next-desc">No immediate actions required. Keep it up.</div></div></div></div>';
    }
    if (!p && overdueProject) {
      return '<div class="fd-card fd-next-card" onclick="window._mcGo(\'projects\')">' +
        '<div class="fd-card-label">Next Action</div>' +
        '<div class="fd-next-body"><div class="fd-next-icon"><i class="ph-light ph-calendar-x"></i></div>' +
        '<div class="fd-next-content"><div class="fd-next-title">Follow up on overdue project</div>' +
        '<div class="fd-next-desc">' + esc(overdueProject.name||'—') + ' has passed its expected date.</div>' +
        '<div class="fd-next-cta">Open Projects <i class="ph-light ph-arrow-right"></i></div></div></div></div>';
    }
    var s = p._score;
    var icon = !s.img ? 'ph-camera' : !s.prc ? 'ph-tag' : !s.inv ? 'ph-package' : 'ph-globe';
    var verb = !s.img ? 'Add photography' : !s.prc ? 'Set a price' : !s.inv ? 'Add inventory' : 'Publish product';
    var steps = 4 - s.total;
    return '<div class="fd-card fd-next-card" onclick="window._openProductModal && window._openProductModal(\'' + p.id + '\')">' +
      '<div class="fd-card-label">Next Action</div>' +
      '<div class="fd-next-body"><div class="fd-next-icon"><i class="ph-light ' + icon + '"></i></div>' +
      '<div class="fd-next-content"><div class="fd-next-title">' + verb + '</div>' +
      '<div class="fd-next-desc">' + esc(p.name||'—') + ' · ' + (steps===1?'1 step from ready':steps+' steps from ready') + '</div>' +
      '<div class="fd-next-cta">Open product <i class="ph-light ph-arrow-right"></i></div></div></div></div>';
  }

  /* ── PLATFORM HEALTH ───────────────────────────────────────────────────── */
  /*
   * platform_tasks schema:
   * { title: string, area: "Storefront"|"Admin"|"Integrations"|"Content"|"Launch"|"Other",
   *   done: boolean, priority: "high"|"normal", updatedAt: timestamp }
   */
  function buildPlatformSection(tasks) {
    var done = tasks.filter(function(t){ return t.done; }).length, total = tasks.length;
    var pending = tasks.filter(function(t){ return !t.done; }).sort(function(a,b){ return (a.priority==='high'?0:1)-(b.priority==='high'?0:1); });
    var jdMeta = brandMeta('JANEDORE'), pct = total ? Math.round((done/total)*100) : 0;
    return '<div class="fd-platform-block">' +
      '<div class="fd-section-hdr">' +
        '<div class="fd-section-label"><span class="fd-brand-pip" style="background:' + jdMeta.color + ';"></span>Janedore Platform</div>' +
        '<button class="fd-text-btn" onclick="window._mcManagePlatformTasks()"><i class="ph-light ph-pencil-simple"></i> Manage</button>' +
      '</div>' +
      '<div class="fd-platform-card">' +
        '<div class="fd-platform-progress">' +
          '<div class="fd-platform-bar-wrap"><div class="fd-platform-bar" style="width:' + pct + '%;background:' + jdMeta.color + ';"></div></div>' +
          '<span class="fd-platform-pct">' + done + '/' + total + ' tasks</span>' +
        '</div>' +
        (pending.length ?
          '<div class="fd-platform-tasks">' +
            pending.slice(0,4).map(function(t){
              var hi = t.priority === 'high';
              return '<div class="fd-platform-task' + (hi?' fd-platform-task-high':'') + '" onclick="window._mcTogglePlatformTask(\'' + t.id + '\',' + t.done + ')">' +
                '<div class="fd-ptask-check"><i class="ph-light ph-square"></i></div>' +
                '<span class="fd-ptask-label">' + esc(t.title||'—') + '</span>' +
                (t.area ? '<span class="fd-ptask-area">' + esc(t.area) + '</span>' : '') +
                (hi ? '<span class="fd-ptask-high">!</span>' : '') +
              '</div>';
            }).join('') +
            (pending.length > 4 ? '<div class="fd-platform-more">+' + (pending.length-4) + ' more tasks</div>' : '') +
          '</div>'
          : (total > 0
            ? '<div class="fd-platform-clear"><i class="ph-light ph-check-circle"></i> All platform tasks complete</div>'
            : '<div class="fd-platform-clear fd-muted"><i class="ph-light ph-plus-circle"></i> No tasks yet — <button class="fd-inline-btn" onclick="window._mcManagePlatformTasks()">add your first</button></div>'
          )
        ) +
      '</div>' +
    '</div>';
  }

  window._mcTogglePlatformTask = function(id, currentDone) {
    platformTasksRef.doc(id).update({ done: !currentDone, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function(){ window._mcGo('dashboard'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  window._mcManagePlatformTasks = function() {
    platformTasksRef.get().then(function(snap){
      var tasks = snap.docs.map(d2o);
      var areas = ['Storefront','Admin','Integrations','Content','Launch','Other'];
      window._mountModal(
        '<div class="modal" style="max-width:560px;">' +
          '<div class="modal-handle"></div><div class="modal-title">Platform Tasks</div>' +
          '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
          '<div style="padding:0 16px 8px;">' +
            '<div id="pt-list">' +
              (tasks.length ? tasks.map(function(t){
                return '<div class="pt-modal-row" data-id="' + t.id + '">' +
                  '<div class="lc-checkbox' + (t.done?' checked':'') + '" onclick="this.classList.toggle(\'checked\')">' + (t.done?'<i class="ph-light ph-check" style="font-size:11px;"></i>':'') + '</div>' +
                  '<input class="pt-modal-input" value="' + esc(t.title||'') + '">' +
                  '<select class="pt-modal-area">' + areas.map(function(a){ return '<option'+(a===t.area?' selected':'')+'>'+a+'</option>'; }).join('') + '</select>' +
                  '<select class="pt-modal-pri"><option value="normal"'+(t.priority!=='high'?' selected':'')+'>Normal</option><option value="high"'+(t.priority==='high'?' selected':'')+'>High</option></select>' +
                  '<button class="mc-icon-btn" onclick="window._mcDelPlatformTask(\'' + t.id + '\')"><i class="ph-light ph-trash"></i></button>' +
                '</div>';
              }).join('') : '<div style="font-size:12px;color:var(--muted);padding:8px 0;">No tasks yet.</div>') +
            '</div>' +
          '</div>' +
          '<div style="padding:8px 16px 4px;border-top:0.5px solid var(--border);">' +
            '<div class="pt-add-row">' +
              '<input id="pt-new-title" placeholder="New task…" style="flex:1;">' +
              '<select id="pt-new-area">' + areas.map(function(a){ return '<option>'+a+'</option>'; }).join('') + '</select>' +
              '<select id="pt-new-pri"><option value="normal">Normal</option><option value="high">High</option></select>' +
              '<button class="mc-btn-primary" style="padding:8px 12px;" onclick="window._mcAddPlatformTask()"><i class="ph-light ph-plus"></i></button>' +
            '</div>' +
          '</div>' +
          '<div style="padding:12px 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
            '<button class="btn btn-primary btn-sm" onclick="window._mcSavePlatformTasks()">Save</button>' +
          '</div>' +
        '</div>'
      );
    });
  };

  window._mcAddPlatformTask = function() {
    var title = ((safeEl('pt-new-title')||{}).value||'').trim();
    if (!title) return;
    platformTasksRef.add({ title:title, area:(safeEl('pt-new-area')||{}).value||'Other', priority:(safeEl('pt-new-pri')||{}).value||'normal', done:false, createdAt:firebase.firestore.FieldValue.serverTimestamp(), updatedAt:firebase.firestore.FieldValue.serverTimestamp() })
      .then(function(){ window._closeModal(); showToast('Task added'); window._mcManagePlatformTasks(); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDelPlatformTask = function(id) {
    platformTasksRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Deleted'); window._mcManagePlatformTasks(); });
  };
  window._mcSavePlatformTasks = function() {
    var rows = document.querySelectorAll('.pt-modal-row'), batch = db.batch();
    rows.forEach(function(row){
      var id = row.getAttribute('data-id');
      batch.update(platformTasksRef.doc(id), {
        title: (row.querySelector('.pt-modal-input')||{}).value||'',
        area:  (row.querySelector('.pt-modal-area')||{}).value||'Other',
        priority: (row.querySelector('.pt-modal-pri')||{}).value||'normal',
        done: !!(row.querySelector('.lc-checkbox.checked')),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    batch.commit().then(function(){ window._closeModal(); showToast('Saved'); window._mcGo('dashboard'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ── BRAND STATUS ──────────────────────────────────────────────────────── */
  function buildBrandStatusSection(brandScores) {
    var vendorBrands = BRANDS.filter(function(b){ return !b.operator; });
    return '<div class="fd-brand-status-block">' +
      '<div class="fd-section-hdr">' +
        '<div class="fd-section-label">Brand Status</div>' +
        '<button class="fd-text-btn" onclick="window._mcGo(\'collections\')">All collections <i class="ph-light ph-arrow-right"></i></button>' +
      '</div>' +
      '<div class="fd-brand-status-row">' +
        vendorBrands.map(function(b){
          var bs = brandScores[b.key]||{overall:0,readyCount:0,total:0,bottleneck:null};
          var pct = bs.overall||0, circ=113, dash=Math.round((pct/100)*circ);
          var col = pct>=80?'var(--fd-green)':pct>=50?'var(--fd-amber)':'var(--fd-red)';
          return '<div class="fd-brand-status-card" onclick="window._mcGo(\'collections\')">' +
            '<div class="fd-bsc-top"><span class="fd-bsc-dot" style="background:' + b.color + ';"></span><span class="fd-bsc-name">' + b.key + '</span></div>' +
            '<div class="fd-bsc-arc-wrap">' +
              '<svg viewBox="0 0 40 40" width="56" height="56">' +
                '<circle cx="20" cy="20" r="18" fill="none" stroke="var(--border-med)" stroke-width="3"/>' +
                '<circle cx="20" cy="20" r="18" fill="none" stroke="' + col + '" stroke-width="3" stroke-dasharray="' + dash + ' ' + circ + '" transform="rotate(-90 20 20)" stroke-linecap="round"/>' +
              '</svg>' +
              '<div class="fd-bsc-pct" style="color:' + col + ';">' + pct + '%</div>' +
            '</div>' +
            '<div class="fd-bsc-sub">' + bs.readyCount + '/' + bs.total + ' ready</div>' +
            (bs.bottleneck ? '<div class="fd-bsc-hint">↳ ' + bs.bottleneck.label + '</div>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  /* ── WAITING ON ────────────────────────────────────────────────────────── */
  function buildWaitingSection(waiting) {
    var header = '<div class="fd-section-hdr"><div class="fd-section-label">Waiting On' +
      (waiting.length ? ' <span class="fd-badge">'+waiting.length+'</span>' : '') +
      '</div><button class="fd-text-btn" onclick="window._mcAddWaiting()"><i class="ph-light ph-plus"></i> Add</button></div>';
    if (!waiting.length) return header + '<div class="fd-empty-row"><i class="ph-light ph-hourglass"></i><span>Nothing waiting on external parties</span></div>';
    var now = Date.now();
    var sorted = waiting.slice().sort(function(a,b){ return tsMs(a.createdAt)-tsMs(b.createdAt); });
    return header + '<div class="fd-waiting-list">' +
      sorted.map(function(w){
        var age = w.createdAt ? Math.round((now - tsMs(w.createdAt))/86400000) : 0;
        var urgent = age >= 5, ageLabel = age===0?'today':age===1?'1 day':age+' days';
        return '<div class="fd-waiting-row' + (urgent?' fd-waiting-urgent':'') + '">' +
          '<div class="fd-waiting-main"><span class="fd-waiting-dot' + (urgent?' urgent':'') + '"></span><span class="fd-waiting-text">' + esc(w.description||'—') + '</span></div>' +
          '<div class="fd-waiting-meta"><span class="fd-waiting-age">' + ageLabel + '</span>' +
          '<button class="fd-resolve-btn" onclick="event.stopPropagation();window._mcResolveWaiting(\'' + w.id + '\')">Done</button></div>' +
        '</div>';
      }).join('') +
    '</div>';
  }
  window._mcResolveWaiting = function(id) {
    waitingRef.doc(id).update({resolved:true}).then(function(){ showToast('Resolved'); window._mcGo('dashboard'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcAddWaiting = function() {
    var cats = ['Supplier','Manufacturer','Sample','Packaging','Design','Photography','Quote','Logistics','Other'];
    window._mountModal(
      '<div class="modal modal-sm"><div class="modal-handle"></div><div class="modal-title">Add Waiting Item</div>' +
      '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
      '<div class="form-group"><label>What are you waiting for?</label><textarea id="mw-desc" rows="3" placeholder="Waiting for supplier quote on MOQ…"></textarea></div>' +
      '<div class="form-row"><div class="form-group"><label>Category</label><select id="mw-cat">' + cats.map(function(c){ return '<option>'+c+'</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Related to (optional)</label><input id="mw-rel" placeholder="e.g. JANEDORE Handbag"></div></div>' +
      '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
        '<button class="btn btn-primary btn-sm" onclick="window._mcSaveWaiting()">Add</button>' +
      '</div></div>'
    );
  };
  window._mcSaveWaiting = function() {
    var desc = ((safeEl('mw-desc')||{}).value||'').trim();
    if (!desc){ showToast('Describe what you are waiting for','error'); return; }
    waitingRef.add({ description:desc, category:(safeEl('mw-cat')||{}).value||'Other', relatedTo:(safeEl('mw-rel')||{}).value||'', resolved:false, createdAt:firebase.firestore.FieldValue.serverTimestamp() })
      .then(function(){ window._closeModal(); showToast('Added'); window._mcGo('dashboard'); }).catch(function(e){ showToast(e.message,'error'); });
  };

  /* ── BRAND UPDATES FEED (dashboard preview) ────────────────────────────── */
  /*
   * brand_updates schema:
   * { brand: 'NIRIUS CO'|'THATO', text: string,
   *   status: 'done'|'in_progress'|'blocked',
   *   createdAt: timestamp, authorId: string }
   */
  var STATUS_MAP = { done:{label:'Done',col:'var(--fd-green)'}, in_progress:{label:'In Progress',col:'var(--fd-amber)'}, blocked:{label:'Blocked',col:'var(--fd-red)'} };
  function buildBrandUpdatesFeed(updates) {
    var header = '<div class="fd-section-hdr" style="margin-top:24px;"><div class="fd-section-label">Brand Updates</div>' +
      '<button class="fd-text-btn" onclick="window._mcGo(\'updates\')">All updates <i class="ph-light ph-arrow-right"></i></button></div>';
    if (!updates.length) return header + '<div class="fd-empty-row"><i class="ph-light ph-chat-circle"></i><span>No updates from brands yet</span></div>';
    return header + '<div class="fd-updates-list">' +
      updates.map(function(u){
        var bm = brandMeta(u.brand||''), st = STATUS_MAP[u.status]||STATUS_MAP['in_progress'];
        return '<div class="fd-update-row">' +
          '<div class="fd-update-brand-dot" style="background:' + bm.color + ';margin-top:5px;"></div>' +
          '<div class="fd-update-body">' +
            '<div class="fd-update-meta">' +
              '<span class="fd-update-brand-name">' + esc(u.brand||'—') + '</span>' +
              '<span class="fd-update-status" style="color:' + st.col + ';border-color:' + st.col + ';">' + st.label + '</span>' +
              '<span class="fd-update-time">' + relTime(u.createdAt) + '</span>' +
            '</div>' +
            '<div class="fd-update-text">' + esc(u.text||'') + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  /* ── ACTIVITY ──────────────────────────────────────────────────────────── */
  function buildActivitySection(activity, products, projects) {
    var header = '<div class="fd-section-hdr" style="margin-top:24px;"><div class="fd-section-label">Recent Activity</div></div>';
    var events = activity.slice();
    if (!events.length) {
      products.filter(function(p){ return p.updatedAt||p.createdAt; }).sort(function(a,b){ return tsMs(b.updatedAt||b.createdAt)-tsMs(a.updatedAt||a.createdAt); }).slice(0,4)
        .forEach(function(p){ events.push({type:'product',text:(p.name||'Product')+' updated',createdAt:p.updatedAt||p.createdAt,icon:'ph-cube'}); });
      projects.filter(function(p){ return p.updatedAt||p.createdAt; }).sort(function(a,b){ return tsMs(b.updatedAt||b.createdAt)-tsMs(a.updatedAt||a.createdAt); }).slice(0,3)
        .forEach(function(p){ events.push({type:'project',text:(p.name||'Project')+' · '+(p.type||'Project'),createdAt:p.updatedAt||p.createdAt,icon:'ph-rocket-launch'}); });
      events.sort(function(a,b){ return tsMs(b.createdAt)-tsMs(a.createdAt); });
      events = events.slice(0,6);
    }
    if (!events.length) return header + '<div class="fd-empty-row"><i class="ph-light ph-activity"></i><span>No recent activity yet</span></div>';
    return header + '<div class="fd-activity-list">' +
      events.map(function(e){
        var icon = e.icon||(e.type==='order'?'ph-receipt':e.type==='product'?'ph-cube':'ph-rocket-launch');
        return '<div class="fd-activity-row"><div class="fd-activity-icon"><i class="ph-light ' + icon + '"></i></div><div class="fd-activity-text">' + esc(e.text||'—') + '</div><div class="fd-activity-time">' + relTime(e.createdAt) + '</div></div>';
      }).join('') +
    '</div>';
  }

  /* ══ UPDATES VIEW ════════════════════════════════════════════════════════ */
  function viewUpdates(area) {
    var userBrand = currentUserBrand(), isSA = isOperator();
    brandUpdatesRef.orderBy('createdAt','desc').limit(40).get().catch(function(){ return {docs:[]}; }).then(function(snap){
      var updates = snap.docs.map(d2o);
      var postFormHtml = '';
      if (!isSA) {
        var brand = userBrand||'NIRIUS CO', bm = brandMeta(brand);
        postFormHtml =
          '<div class="fd-update-compose">' +
            '<div class="fd-update-compose-brand"><span style="width:8px;height:8px;border-radius:50%;background:' + bm.color + ';display:inline-block;margin-right:6px;"></span><strong>' + brand + '</strong></div>' +
            '<textarea id="bu-text" class="note-textarea" rows="3" placeholder="Photography shoot completed. Files sent to Dropbox."></textarea>' +
            '<div class="fd-update-compose-footer">' +
              '<div style="display:flex;gap:6px;">' +
                '<button class="bu-status-btn active" data-status="in_progress" onclick="window._buSelectStatus(this)">In Progress</button>' +
                '<button class="bu-status-btn" data-status="done" onclick="window._buSelectStatus(this)">Done</button>' +
                '<button class="bu-status-btn" data-status="blocked" onclick="window._buSelectStatus(this)">Blocked</button>' +
              '</div>' +
              '<button class="mc-btn-primary" onclick="window._mcPostBrandUpdate(\'' + brand + '\')"><i class="ph-light ph-paper-plane-tilt"></i> Post Update</button>' +
            '</div>' +
          '</div>';
      }
      var filterHtml = '';
      if (isSA) {
        filterHtml = '<div class="fd-updates-filter"><button class="bu-filter-btn active" data-brand="all" onclick="window._buFilterUpdates(this)">All</button>' +
          BRANDS.filter(function(b){ return !b.operator; }).map(function(b){
            return '<button class="bu-filter-btn" data-brand="' + b.key + '" onclick="window._buFilterUpdates(this)" style="--brand-color:' + b.color + ';">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:' + b.color + ';display:inline-block;margin-right:5px;"></span>' + b.key + '</button>';
          }).join('') + '</div>';
      }
      area.innerHTML =
        '<div class="mc-view-hdr"><div><div class="mc-view-title">Brand Updates</div>' +
          '<div class="mc-view-sub">' + (isSA ? 'Check-ins from NIRIUS CO and THATO' : 'Post your latest progress') + '</div></div></div>' +
        '<div style="padding:0 20px;">' + postFormHtml + filterHtml +
          '<div id="bu-feed">' + renderUpdatesList(updates, isSA ? null : userBrand) + '</div>' +
        '</div>';
      window._buUpdatesCache = updates;
    });
  }

  function renderUpdatesList(updates, filterBrand) {
    var list = filterBrand ? updates.filter(function(u){ return u.brand===filterBrand; }) : updates;
    if (!list.length) return '<div class="fd-empty-row" style="margin-top:16px;"><i class="ph-light ph-chat-circle"></i><span>No updates yet</span></div>';
    return '<div class="bu-feed-list">' +
      list.map(function(u){
        var bm = brandMeta(u.brand||''), st = STATUS_MAP[u.status]||STATUS_MAP['in_progress'];
        return '<div class="bu-feed-row">' +
          '<div class="bu-feed-left"><div class="bu-feed-brand-pip" style="background:' + bm.color + ';"></div></div>' +
          '<div class="bu-feed-body">' +
            '<div class="bu-feed-meta">' +
              '<span class="bu-feed-brand">' + esc(u.brand||'—') + '</span>' +
              '<span class="bu-feed-status" style="color:' + st.col + ';border-color:' + st.col + ';">' + st.label + '</span>' +
              '<span class="bu-feed-time">' + relTime(u.createdAt) + '</span>' +
              (isOperator() ? '<button class="mc-icon-btn" style="margin-left:auto;" onclick="window._mcDelBrandUpdate(\'' + u.id + '\')"><i class="ph-light ph-trash"></i></button>' : '') +
            '</div>' +
            '<div class="bu-feed-text">' + esc(u.text||'') + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  window._buSelectedStatus = 'in_progress';
  window._buSelectStatus = function(btn) {
    document.querySelectorAll('.bu-status-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    window._buSelectedStatus = btn.getAttribute('data-status')||'in_progress';
  };
  window._buFilterUpdates = function(btn) {
    document.querySelectorAll('.bu-filter-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    var brand = btn.getAttribute('data-brand');
    var feed = safeEl('bu-feed');
    if (feed) feed.innerHTML = renderUpdatesList(window._buUpdatesCache||[], brand==='all'?null:brand);
  };
  window._mcPostBrandUpdate = function(brand) {
    var text = ((safeEl('bu-text')||{}).value||'').trim();
    if (!text){ showToast('Write something first','error'); return; }
    brandUpdatesRef.add({ brand:brand, text:text, status:window._buSelectedStatus||'in_progress', createdAt:firebase.firestore.FieldValue.serverTimestamp(), authorId:(firebase.auth().currentUser||{}).uid||'' })
      .then(function(){ showToast('Update posted'); window._mcGo('updates'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDelBrandUpdate = function(id) {
    if (!confirm('Delete this update?')) return;
    brandUpdatesRef.doc(id).delete().then(function(){ showToast('Deleted'); window._mcGo('updates'); });
  };

  /* ══ COLLECTIONS ════════════════════════════════════════════════════════ */
  function viewCollections(area) {
    productsRef.get().then(function(snap){
      var products = snap.docs.map(d2o);
      var scored = products.map(function(p){ return Object.assign({},p,{_score:scoreProduct(p),_brand:getBrand(p)}); });
      var byBrand = {};
      BRANDS.forEach(function(b){ byBrand[b.key]=[]; });
      scored.forEach(function(p){ if (!byBrand[p._brand]) byBrand[p._brand]=[]; byBrand[p._brand].push(p); });
      area.innerHTML =
        '<div class="mc-view-hdr"><div><div class="mc-view-title">Collections</div><div class="mc-view-sub">' + products.length + ' products · readiness by brand</div></div></div>' +
        BRANDS.map(function(b){
          var list = byBrand[b.key]||[];
          var rdpct = list.length ? Math.round(list.reduce(function(s,p){ return s+p._score.total; },0)/(list.length*4)*100) : 0;
          return '<div class="coll-brand-block">' +
            '<div class="coll-brand-hdr">' +
              '<div class="coll-brand-dot" style="background:' + b.color + ';"></div>' +
              '<div class="coll-brand-name">' + b.key + (b.operator ? ' <span class="coll-op-tag">Platform</span>' : '') + '</div>' +
              '<div class="coll-brand-pct" style="color:' + b.color + ';">' + rdpct + '% ready</div>' +
              '<div class="coll-brand-count">' + list.length + ' products</div>' +
            '</div>' +
            (list.length ?
              '<div class="coll-table-wrap"><table class="coll-table"><thead><tr><th>Product</th><th>Photo</th><th>Price</th><th>Stock</th><th>Live</th><th>Score</th></tr></thead><tbody>' +
                list.map(function(p){
                  var s=p._score, price=getPrice(p), allReady=s.total===4;
                  return '<tr class="coll-row' + (allReady?' coll-row-ready':'') + '" onclick="window._openProductModal && window._openProductModal(\'' + p.id + '\')">' +
                    '<td><div class="coll-prod-name">' + esc(p.name||'—') + '</div>' + (price?'<div class="coll-prod-price">'+esc(price)+'</div>':'') + '</td>' +
                    '<td>'+checkX(s.img)+'</td><td>'+checkX(s.prc)+'</td><td>'+checkX(s.inv)+'</td><td>'+checkX(s.pub)+'</td>' +
                    '<td><div class="coll-score-pill' + (allReady?' ready':'') + '">' + s.total + '/4</div></td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>' :
              '<div class="coll-empty">No products for ' + b.key + ' yet.</div>'
            ) +
          '</div>';
        }).join('');
    }).catch(function(e){ area.innerHTML = errBanner(e); });
  }
  function checkX(val){ return val ? '<span class="coll-check">&#10003;</span>' : '<span class="coll-cross">&#10007;</span>'; }

  /* ══ PROJECTS ══════════════════════════════════════════════════════════ */
  function viewProjects(area) {
    projectsRef.get().then(function(snap){
      var projects = snap.docs.map(d2o), byBrand = {};
      BRANDS.forEach(function(b){ byBrand[b.key]=[]; });
      projects.forEach(function(p){ var k=(p.brand||'JANEDORE').toUpperCase(); if(!byBrand[k])byBrand[k]=[]; byBrand[k].push(p); });
      area.innerHTML =
        '<div class="mc-view-hdr"><div><div class="mc-view-title">Projects</div><div class="mc-view-sub">Campaigns, samples, packaging, photoshoots</div></div>' +
        '<button class="mc-btn-primary" onclick="window._mcNewProject()"><i class="ph-light ph-plus"></i> New Project</button></div>' +
        BRANDS.map(function(b){
          var list = byBrand[b.key]||[];
          return '<div class="proj-brand-group"><div class="proj-brand-hdr">' +
            '<span class="proj-brand-dot" style="background:' + b.color + ';"></span><span class="proj-brand-lbl">' + b.key + '</span>' +
            '<span class="proj-brand-ct">' + list.length + '</span>' +
            '<button class="mc-link-btn" onclick="window._mcNewProjectFor(\'' + b.key + '\')">+ Add</button></div>' +
            (list.length ? '<div class="proj-cards">' + list.map(function(p){ return renderProjCard(p,b); }).join('') + '</div>' : '<div class="proj-brand-empty">No projects for ' + b.key + '</div>') +
          '</div>';
        }).join('');
    }).catch(function(e){ area.innerHTML = errBanner(e); });
  }
  function renderProjCard(p, brand) {
    var stages=p.stages||[], done=stages.filter(function(s){ return s.done; }).length, total=stages.length;
    var pct=total?Math.round((done/total)*100):0, nextStage=stages.find(function(s){ return !s.done; });
    var daysUntil=null;
    if (p.expectedDate){ var d=p.expectedDate.toDate?p.expectedDate.toDate():new Date(p.expectedDate); daysUntil=Math.ceil((d.getTime()-Date.now())/86400000); }
    return '<div class="proj-card" onclick="window._mcOpenProject(\'' + p.id + '\')">' +
      '<div class="proj-card-top"><div><div class="proj-card-type">' + esc(p.type||'Project') + '</div><div class="proj-card-name">' + esc(p.name||'—') + '</div></div>' +
      (daysUntil!==null?'<div class="proj-card-date" style="color:'+(daysUntil<=3?'#c0392b':daysUntil<=7?'#c07000':'#1a8742')+'">'+(daysUntil===0?'Today':daysUntil<0?'Overdue':daysUntil+'d')+'</div>':'') + '</div>' +
      (total?'<div class="proj-track-wrap"><div class="proj-track"><div class="proj-fill" style="width:' + pct + '%;background:' + brand.color + ';"></div></div><span class="proj-pct">' + pct + '%</span></div>':'') +
      (nextStage?'<div class="proj-next">Next: ' + esc(nextStage.name) + '</div>':'') +
    '</div>';
  }
  window._mcNewProject    = function(){ showProjectModal(null,''); };
  window._mcNewProjectFor = function(brand){ showProjectModal(null,brand); };
  window._mcOpenProject   = function(id){ projectsRef.doc(id).get().then(function(doc){ if(doc.exists) showProjectModal(d2o(doc),''); }); };
  function showProjectModal(p, presetBrand) {
    var isEdit=!!p, types=Object.keys(PROJECT_STAGES), curType=p?(p.type||'Sample'):'Sample';
    var stages=p?(p.stages||[]):PROJECT_STAGES[curType].map(function(s){ return {name:s,done:false}; });
    var dateVal='';
    if(p&&p.expectedDate){ var d=p.expectedDate.toDate?p.expectedDate.toDate():new Date(p.expectedDate); dateVal=d.toISOString().split('T')[0]; }
    window._mountModal(
      '<div class="modal" style="max-width:580px;"><div class="modal-handle"></div><div class="modal-title">' + (isEdit?'Edit Project':'New Project') + '</div>' +
      '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
      '<div class="form-group"><label>Project Name</label><input id="pj-name" value="' + esc(p?p.name:'') + '" placeholder="e.g. Handbag Sample Round 1"></div>' +
      '<div class="form-row"><div class="form-group"><label>Brand</label><select id="pj-brand">' +
        BRANDS.map(function(b){ return '<option value="' + b.key + '"' + ((p?p.brand:presetBrand)===b.key?' selected':'') + '>' + b.key + '</option>'; }).join('') +
      '</select></div><div class="form-group"><label>Type</label><select id="pj-type" onchange="window._mcRefreshStages()">' +
        types.map(function(t){ return '<option value="' + t + '"' + (t===curType?' selected':'') + '>' + t + '</option>'; }).join('') +
      '</select></div></div>' +
      '<div class="form-group"><label>Expected Date</label><input type="date" id="pj-date" value="' + dateVal + '"></div>' +
      '<div class="form-group"><label>Stages</label><div id="pj-stages" class="pj-stages-list">' + stages.map(pjStageRow).join('') + '</div></div>' +
      '<div class="form-group"><label>Notes</label><textarea id="pj-notes">' + esc(p?(p.notes||''):'') + '</textarea></div>' +
      '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
        (isEdit?'<button class="btn btn-danger btn-sm" onclick="window._mcDeleteProject(\'' + p.id + '\')">Delete</button>':'') +
        '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
        '<button class="btn btn-primary btn-sm" onclick="window._mcSaveProject(\'' + (isEdit?p.id:'') + '\')">' + (isEdit?'Save':'Create') + '</button>' +
      '</div></div>'
    );
  }
  function pjStageRow(s){
    return '<div class="pj-stage-row"><div class="lc-checkbox' + (s.done?' checked':'') + '" onclick="this.classList.toggle(\'checked\')">' + (s.done?'<i class="ph-light ph-check" style="font-size:11px;"></i>':'') + '</div><span class="pj-stage-name">' + esc(s.name) + '</span></div>';
  }
  window._mcRefreshStages = function(){
    var type=(safeEl('pj-type')||{}).value||'Sample', stageList=safeEl('pj-stages');
    if(!stageList) return;
    stageList.innerHTML=(PROJECT_STAGES[type]||[]).map(function(s){ return pjStageRow({name:s,done:false}); }).join('');
  };
  window._mcSaveProject = function(id){
    var name=((safeEl('pj-name')||{}).value||'').trim();
    if(!name){ showToast('Enter a project name','error'); return; }
    var stages=[];
    document.querySelectorAll('.pj-stage-row').forEach(function(row){
      var nameEl=row.querySelector('.pj-stage-name'), box=row.querySelector('.lc-checkbox');
      if(nameEl) stages.push({name:nameEl.textContent.trim(),done:!!(box&&box.classList.contains('checked'))});
    });
    var data={name:name,brand:(safeEl('pj-brand')||{}).value||'JANEDORE',type:(safeEl('pj-type')||{}).value||'Sample',notes:(safeEl('pj-notes')||{}).value||'',stages:stages,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    var dateVal=(safeEl('pj-date')||{}).value||'';
    if(dateVal) data.expectedDate=firebase.firestore.Timestamp.fromDate(new Date(dateVal));
    var op=id?projectsRef.doc(id).update(data):projectsRef.add(Object.assign(data,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
    op.then(function(){ window._closeModal(); showToast(id?'Project saved':'Project created'); window._mcGo('projects'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDeleteProject = function(id){
    if(!confirm('Delete this project?')) return;
    projectsRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Deleted'); window._mcGo('projects'); });
  };

  /* ══ ORDERS ════════════════════════════════════════════════════════════ */
  function viewOrders(area) {
    ordersRef.get().catch(function(){ return {docs:[]}; }).then(function(snap){
      var orders = snap.docs.map(d2o);
      _allOrders = orders;
      area.innerHTML =
        '<div class="mc-view-hdr"><div><div class="mc-view-title">Orders</div><div class="mc-view-sub">Last 30 days</div></div></div>' +
        '<div class="mc-card" style="margin:0 20px 12px;">' +
          '<div class="mc-card-hdr"><span class="mc-card-ttl">Order Activity</span>' +
            '<div style="display:flex;align-items:center;gap:7px;margin-left:auto;flex-wrap:wrap;">' +
              '<div class="dash-live-pill" id="dash-live-pill"><span class="dash-live-dot"></span><span id="dash-live-count">Live</span></div>' +
              BRANDS.map(function(b){ var k=b.key.replace(/\s/g,'-'); return '<button class="dash-brand-toggle active" id="dash-toggle-' + k + '" onclick="window._dashToggleBrand(\'' + b.key + '\')" style="--brand-color:' + b.color + ';"><span class="dash-brand-dot" style="background:' + b.color + ';"></span>' + b.key + '</button>'; }).join('') +
            '</div>' +
          '</div>' +
          '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
        '</div>' +
        '<div id="dash-day-popup" class="dash-day-popup" style="display:none;"><div class="dash-day-popup-inner"><div class="dash-day-popup-header">' +
          '<span class="dash-day-popup-title" id="dash-popup-title">—</span>' +
          '<button class="dash-day-popup-close" onclick="window._dashClosePopup()"><i class="ph-light ph-x"></i></button>' +
        '</div><div id="dash-popup-body" class="dash-day-popup-body"></div></div></div>';
      buildChart(orders);
    });
  }
  window._dashToggleBrand = function(key){
    _brandFilters[key]=!_brandFilters[key];
    var btn=safeEl('dash-toggle-'+key.replace(/\s/g,'-'));
    if(btn) btn.classList.toggle('active',_brandFilters[key]);
    buildChart(_allOrders);
  };
  function buildDayLabels(){
    var days={},now=Date.now(),DAY=86400000;
    for(var i=29;i>=0;i--){ var d=new Date(now-i*DAY); var k=d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'}); days[k]=k; }
    return Object.keys(days);
  }
  function buildChart(orders){
    var canvas=safeEl('orders-chart');
    if(!canvas||!window.Chart) return;
    if(window._analyticsChart){ window._analyticsChart.destroy(); window._analyticsChart=null; }
    var labels=buildDayLabels(),bdd={},bdo={};
    BRANDS.forEach(function(b){ bdd[b.key]={}; bdo[b.key]={}; labels.forEach(function(l){ bdd[b.key][l]=0; bdo[b.key][l]=[]; }); });
    orders.forEach(function(o){
      if(!o.createdAt) return;
      var d=o.createdAt.toDate?o.createdAt.toDate():new Date(o.createdAt);
      var lbl=d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      var key=(BRANDS.find(function(b){ return b.key===(o.brand||'').toUpperCase(); })||BRANDS[0]).key;
      if(bdd[key][lbl]===undefined) return;
      bdd[key][lbl]++; bdo[key][lbl].push(o);
    });
    window._dashBrandDayOrders=bdo; window._dashLabels=labels;
    var datasets=BRANDS.filter(function(b){ return _brandFilters[b.key]; }).map(function(b){
      return {label:b.key,data:labels.map(function(l){ return bdd[b.key][l]; }),borderColor:b.color,backgroundColor:b.bg,borderWidth:1.5,tension:0.4,fill:true,pointRadius:0,pointHoverRadius:5,pointHoverBackgroundColor:b.color,pointHoverBorderColor:'#fff',pointHoverBorderWidth:2};
    });
    window._analyticsChart=new Chart(canvas,{
      type:'line',data:{labels:labels,datasets:datasets},
      options:{responsive:true,maintainAspectRatio:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{enabled:false}},
        scales:{x:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:9,family:'Manrope'},maxTicksLimit:8,color:'#bbb'}},y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:9,family:'Manrope'},precision:0,color:'#bbb'},beginAtZero:true}},
        onClick:function(evt,elements){ if(elements&&elements.length) window._dashOpenDayPopup(labels[elements[0].index]); }}
    });
  }
  window._dashOpenDayPopup=function(dayLabel){
    var popup=safeEl('dash-day-popup'),titleEl=safeEl('dash-popup-title'),bodyEl=safeEl('dash-popup-body');
    if(!popup||!titleEl||!bodyEl) return;
    var all=[]; var bdo=window._dashBrandDayOrders||{};
    BRANDS.forEach(function(b){ (bdo[b.key]&&bdo[b.key][dayLabel]||[]).forEach(function(o){ all.push(Object.assign({_color:b.color},o)); }); });
    titleEl.textContent=dayLabel;
    bodyEl.innerHTML=all.length?all.map(function(o){
      var oid=(o.orderId||o.id||'—').toString().slice(-6).toUpperCase();
      return '<div class="dash-popup-row"><div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;"><span class="dash-popup-brand-dot" style="background:' + o._color + ';"></span><div><div class="dash-popup-order-id">#' + esc(oid) + '</div><div class="dash-popup-customer">' + esc(o.customerName||o.email||'Customer') + '</div></div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;"><span class="dash-popup-amount">' + (o.subtotal!=null?'R'+Number(o.subtotal).toFixed(2):'—') + '</span><span class="badge badge-' + esc(o.status||'pending') + '">' + esc(o.status||'pending') + '</span></div></div>';
    }).join(''):'<div class="dash-popup-empty"><i class="ph-light ph-receipt" style="font-size:22px;opacity:.2;"></i><span>No orders on this day</span></div>';
    popup.style.display='block'; requestAnimationFrame(function(){ popup.classList.add('open'); });
  };
  window._dashClosePopup=function(){
    var popup=safeEl('dash-day-popup'); if(!popup) return;
    popup.classList.remove('open'); setTimeout(function(){ popup.style.display='none'; },220);
  };
  document.addEventListener('click',function(e){
    var popup=safeEl('dash-day-popup');
    if(!popup||popup.style.display==='none') return;
    if(!popup.contains(e.target)&&!e.target.closest('#orders-chart')) window._dashClosePopup();
  });

  /* ══ SUPPLIERS ════════════════════════════════════════════════════════ */
  function viewSuppliers(area){
    suppliersRef.get().then(function(snap){
      var suppliers=snap.docs.map(d2o);
      area.innerHTML='<div class="mc-view-hdr"><div><div class="mc-view-title">Suppliers</div><div class="mc-view-sub">'+suppliers.length+' suppliers</div></div><button class="mc-btn-primary" onclick="window._mcNewSupplier()"><i class="ph-light ph-plus"></i> Add</button></div>' +
        (suppliers.length?
          '<div class="mc-table-wrap"><table class="mc-table"><thead><tr><th>Supplier</th><th>Country</th><th>Category</th><th>MOQ</th><th>Lead Time</th><th>Status</th><th></th></tr></thead><tbody>' +
            suppliers.map(function(s){
              return '<tr onclick="window._mcEditSupplier(\''+s.id+'\')">' +
                '<td><div style="font-weight:400;">'+esc(s.name||'—')+'</div></td>' +
                '<td class="cell-muted">'+esc(s.country||'—')+'</td><td class="cell-muted">'+esc(s.category||'—')+'</td>' +
                '<td class="cell-muted">'+esc(s.moq||'—')+'</td><td class="cell-muted">'+esc(s.leadTime||'—')+'</td>' +
                '<td>'+statusPill(s.status)+'</td>' +
                '<td><button class="mc-icon-btn" onclick="event.stopPropagation();window._mcEditSupplier(\''+s.id+'\')"><i class="ph-light ph-pencil-simple"></i></button></td>' +
              '</tr>';
            }).join('')+'</tbody></table></div>':
          emptyState('ph-factory','No suppliers yet','Add your first supplier')
        );
    }).catch(function(e){ area.innerHTML=errBanner(e); });
  }
  window._mcNewSupplier=function(){ showSupplierModal(null); };
  window._mcEditSupplier=function(id){ suppliersRef.doc(id).get().then(function(doc){ if(doc.exists) showSupplierModal(d2o(doc)); }); };
  function showSupplierModal(s){
    var isEdit=!!s, statuses=['Prospecting','Contacted','Sampling','Confirmed','Active','Paused','Dropped'];
    window._mountModal(
      '<div class="modal modal-sm"><div class="modal-handle"></div><div class="modal-title">'+(isEdit?'Edit Supplier':'Add Supplier')+'</div>' +
      '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
      '<div class="form-group"><label>Name</label><input id="sp-name" value="'+esc(s?s.name:'')+'"></div>' +
      '<div class="form-row"><div class="form-group"><label>Country</label><input id="sp-country" value="'+esc(s?s.country:'')+'"></div><div class="form-group"><label>Category</label><input id="sp-cat" value="'+esc(s?s.category:'')+'" placeholder="Leather, Packaging…"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>MOQ</label><input id="sp-moq" value="'+esc(s?s.moq:'')+'"></div><div class="form-group"><label>Lead Time</label><input id="sp-lead" value="'+esc(s?s.leadTime:'')+'" placeholder="e.g. 6–8 weeks"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Status</label><select id="sp-status">'+statuses.map(function(st){ return '<option'+(s&&s.status===st?' selected':'')+'>'+st+'</option>'; }).join('')+'</select></div></div>' +
      '<div class="form-group"><label>Notes</label><textarea id="sp-notes">'+esc(s?(s.notes||''):'')+'</textarea></div>' +
      '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
        (isEdit?'<button class="btn btn-danger btn-sm" onclick="window._mcDelSupplier(\''+s.id+'\')">Delete</button>':'') +
        '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
        '<button class="btn btn-primary btn-sm" onclick="window._mcSaveSupplier(\''+(isEdit?s.id:'')+'\')">'+( isEdit?'Save':'Add')+'</button>' +
      '</div></div>'
    );
  }
  window._mcSaveSupplier=function(id){
    var data={name:(safeEl('sp-name')||{}).value||'',country:(safeEl('sp-country')||{}).value||'',category:(safeEl('sp-cat')||{}).value||'',moq:(safeEl('sp-moq')||{}).value||'',leadTime:(safeEl('sp-lead')||{}).value||'',status:(safeEl('sp-status')||{}).value||'Prospecting',notes:(safeEl('sp-notes')||{}).value||'',updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    var op=id?suppliersRef.doc(id).update(data):suppliersRef.add(Object.assign(data,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
    op.then(function(){ window._closeModal(); showToast(id?'Saved':'Added'); window._mcGo('suppliers'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDelSupplier=function(id){
    if(!confirm('Delete supplier?')) return;
    suppliersRef.doc(id).delete().then(function(){ window._closeModal(); showToast('Deleted'); window._mcGo('suppliers'); });
  };

  /* ══ NOTES ════════════════════════════════════════════════════════════ */
  function viewNotes(area){
    notesRef.orderBy('createdAt','desc').limit(60).get().then(function(snap){
      var notes=snap.docs.map(d2o), tags=['General','Product','Packaging','Campaign','Supplier','Collection','Launch'];
      area.innerHTML=
        '<div class="mc-view-hdr"><div><div class="mc-view-title">Founder Notes</div><div class="mc-view-sub">Ideas, decisions, observations</div></div></div>' +
        '<div class="note-compose"><textarea id="note-input" class="note-textarea" placeholder="Packaging direction should feel more minimal…"></textarea>' +
        '<div class="note-footer"><select id="note-tag" class="note-tag-sel">'+tags.map(function(t){ return '<option>'+t+'</option>'; }).join('')+'</select>' +
        '<button class="mc-btn-primary" onclick="window._mcSaveNote()"><i class="ph-light ph-pencil-line"></i> Save</button></div></div>' +
        (notes.length?
          '<div class="notes-feed">'+notes.map(function(n){
            var d=n.createdAt?(n.createdAt.toDate?n.createdAt.toDate():new Date(n.createdAt)):new Date();
            var ts=d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'})+' · '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
            return '<div class="note-card"><div class="note-card-hdr">'+(n.tag&&n.tag!=='General'?'<span class="note-tag-badge">'+esc(n.tag)+'</span>':'')+'<span class="note-ts">'+ts+'</span><button class="mc-icon-btn" onclick="window._mcDelNote(\''+n.id+'\')"><i class="ph-light ph-trash"></i></button></div><div class="note-body">'+esc(n.text||'')+'</div></div>';
          }).join('')+'</div>':
          emptyState('ph-notebook-text','No notes yet','Start capturing ideas and decisions')
        );
    }).catch(function(e){ area.innerHTML=errBanner(e); });
  }
  window._mcSaveNote=function(){
    var text=((safeEl('note-input')||{}).value||'').trim();
    if(!text){ showToast('Write something first','error'); return; }
    notesRef.add({text:text,tag:(safeEl('note-tag')||{}).value||'General',createdAt:firebase.firestore.FieldValue.serverTimestamp()})
      .then(function(){ showToast('Saved'); window._mcGo('notes'); }).catch(function(e){ showToast(e.message,'error'); });
  };
  window._mcDelNote=function(id){
    if(!confirm('Delete note?')) return;
    notesRef.doc(id).delete().then(function(){ showToast('Deleted'); window._mcGo('notes'); });
  };

  /* ══ CSS ══════════════════════════════════════════════════════════════ */
  function injectStyles(){
    if(document.getElementById('mc-styles')) return;
    var s=document.createElement('style'); s.id='mc-styles';
    s.textContent=`
:root{--fd-green:#1a7a42;--fd-amber:#b06000;--fd-red:#c0392b;}
.mc-shell{display:flex;align-items:flex-start;min-height:calc(100vh - var(--nav-h));width:100%;}
.mc-body{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;width:100%;}
#mc-area{flex:1;min-width:0;width:100%;padding:0 0 80px;box-sizing:border-box;overflow-x:hidden;}
.mc-sidenav{width:200px;flex-shrink:0;background:var(--surface);border-right:0.5px solid var(--border);display:flex;flex-direction:column;padding:0 10px 24px;position:sticky;top:var(--nav-h);height:calc(100vh - var(--nav-h));overflow-y:auto;z-index:5;}
@media(max-width:1023px){.mc-sidenav{display:none;}}
.mc-sidenav-top{padding:20px 6px 16px;border-bottom:0.5px solid var(--border);margin-bottom:10px;}
.mc-sidenav-brand{font-family:var(--font);font-size:13px;font-weight:500;letter-spacing:.12em;color:var(--text);text-transform:uppercase;}
.mc-sidenav-date{font-size:10.5px;color:var(--muted);margin-top:4px;}
.mc-snav-btn{display:flex;align-items:center;gap:10px;padding:9px 10px;border:none;background:none;cursor:pointer;border-radius:var(--r-sm);font-family:var(--font);font-size:13px;font-weight:400;color:var(--text2);text-align:left;width:100%;transition:background .12s,color .12s;white-space:nowrap;}
.mc-snav-btn:hover{background:var(--bg);color:var(--text);}
.mc-snav-btn.mc-on{background:var(--bg);color:var(--text);font-weight:500;}
.mc-snav-btn i{font-size:16px;width:18px;flex-shrink:0;opacity:.4;}
.mc-snav-btn.mc-on i{opacity:1;}
.mc-mnav{display:none;gap:6px;overflow-x:auto;scrollbar-width:none;padding:12px 16px 10px;border-bottom:0.5px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:10;}
.mc-mnav::-webkit-scrollbar{display:none;}
@media(max-width:1023px){.mc-mnav{display:flex;}}
.mc-mpill{flex-shrink:0;background:var(--surface);border:0.5px solid var(--border-med);border-radius:20px;padding:7px 14px;font-family:var(--font);font-size:12px;font-weight:400;color:var(--muted);cursor:pointer;white-space:nowrap;transition:all .12s;}
.mc-mpill.mc-on{background:var(--text);border-color:var(--text);color:#fff;font-weight:500;}
.mc-loading{display:flex;align-items:center;justify-content:center;padding:60px;font-size:22px;color:var(--muted2);}
.mc-spin{animation:mcSpin .75s linear infinite;display:inline-block;}
@keyframes mcSpin{to{transform:rotate(360deg);}}
.mc-err{display:flex;align-items:center;gap:8px;padding:16px;background:var(--danger-soft);color:var(--danger);border-radius:var(--r-sm);font-size:12.5px;margin:16px;}
.mc-view-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;padding:20px 20px 0;}
.mc-view-title{font-family:var(--font);font-size:22px;font-weight:200;color:var(--text);letter-spacing:.02em;}
.mc-view-sub{font-size:11px;color:var(--muted);margin-top:3px;}
.mc-btn-primary{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;background:var(--text);color:#fff;border:none;border-radius:var(--r-sm);font-family:var(--font);font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:opacity .15s;}
.mc-btn-primary:active{opacity:.8;}
.mc-link-btn{display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font-family:var(--font);font-size:11.5px;font-weight:500;color:var(--accent);padding:2px 0;}
.mc-icon-btn{width:26px;height:26px;border-radius:6px;background:var(--surface3);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--muted);transition:background .12s;flex-shrink:0;}
.mc-icon-btn:active{background:var(--border-med);}
.mc-card{background:var(--surface);border-radius:var(--r);border:0.5px solid var(--border);overflow:hidden;box-shadow:var(--shadow-xs);}
.mc-card-hdr{padding:11px 16px;display:flex;align-items:center;border-bottom:0.5px solid var(--border);flex-wrap:wrap;gap:8px;}
.mc-card-ttl{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.mc-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:48px 20px;gap:8px;}
.mc-empty i{font-size:28px;opacity:.18;}
.mc-empty-title{font-size:15px;font-weight:300;color:var(--text);}
.mc-empty-sub{font-size:12px;color:var(--muted);max-width:260px;line-height:1.55;}
.mc-table-wrap{background:var(--surface);border-radius:var(--r);border:0.5px solid var(--border);overflow:hidden;overflow-x:auto;box-shadow:var(--shadow-xs);margin:0 20px;}
.mc-table{width:100%;border-collapse:collapse;min-width:500px;}
.mc-table thead tr{border-bottom:0.5px solid var(--border);}
.mc-table th{padding:9px 14px;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;white-space:nowrap;background:var(--surface2);}
.mc-table td{padding:10px 14px;font-size:12.5px;border-bottom:0.5px solid rgba(0,0,0,0.04);vertical-align:middle;}
.mc-table tbody tr:last-child td{border-bottom:none;}
.mc-table tbody tr{cursor:pointer;transition:background .1s;}
.mc-table tbody tr:hover{background:var(--surface2);}
.cell-muted{color:var(--muted);font-size:12px;}
.chart-wrap{padding:12px 16px 16px;}
.chart-canvas{max-height:220px;}
/* ── DASHBOARD ─────────────────────────────────────── */
.fd-page{max-width:720px;margin:0 auto;padding:28px 24px 80px;}
.fd-greeting{margin-bottom:22px;}
.fd-greeting-text{font-family:var(--font);font-size:22px;font-weight:200;color:var(--text);letter-spacing:.01em;}
.fd-top-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
@media(max-width:600px){.fd-top-row{grid-template-columns:1fr;}}
.fd-card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:18px;box-shadow:var(--shadow-xs);}
.fd-card-label{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted2);margin-bottom:14px;}
.fd-card-cta{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--accent);margin-top:10px;cursor:pointer;}
.fd-readiness-card{cursor:pointer;transition:box-shadow .15s;}
.fd-readiness-card:active{box-shadow:var(--shadow-md);}
.fd-readiness-body{display:flex;align-items:center;gap:16px;}
.fd-arc-wrap{position:relative;width:72px;height:72px;flex-shrink:0;}
.fd-arc-svg{width:72px;height:72px;}
.fd-arc-track{stroke:var(--border-med);}
.fd-arc-fill{stroke-linecap:round;transition:stroke-dasharray .8s cubic-bezier(.32,.72,0,1);}
.fd-arc-inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.fd-arc-pct{font-family:var(--font);font-size:20px;font-weight:300;line-height:1;letter-spacing:-.04em;}
.fd-arc-unit{font-size:9px;color:var(--muted2);font-weight:600;margin-top:1px;letter-spacing:.04em;}
.fd-readiness-info{flex:1;min-width:0;}
.fd-readiness-sub{font-size:12px;color:var(--muted);line-height:1.45;}
.fd-ready-hint{font-size:11px;color:var(--fd-amber);margin-top:5px;font-weight:500;}
.fd-next-card{cursor:pointer;transition:box-shadow .15s;border-left:2.5px solid var(--accent);}
.fd-next-card:active{box-shadow:var(--shadow-md);}
.fd-next-clear{border-left-color:var(--fd-green);cursor:default;}
.fd-next-body{display:flex;align-items:flex-start;gap:12px;}
.fd-next-icon{width:36px;height:36px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--accent);flex-shrink:0;}
.fd-next-icon-ok{color:var(--fd-green);}
.fd-next-content{flex:1;min-width:0;}
.fd-next-title{font-size:14px;font-weight:500;color:var(--text);line-height:1.3;margin-bottom:5px;}
.fd-next-desc{font-size:12px;color:var(--muted);line-height:1.45;}
.fd-next-cta{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--accent);margin-top:10px;}
.fd-section-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.fd-section-label{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted2);display:flex;align-items:center;gap:7px;}
.fd-brand-pip{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0;}
.fd-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--fd-amber);color:#fff;font-size:9px;font-weight:700;letter-spacing:0;}
.fd-text-btn{display:inline-flex;align-items:center;gap:4px;background:none;border:none;font-family:var(--font);font-size:11.5px;font-weight:500;color:var(--accent);cursor:pointer;padding:2px 0;}
.fd-empty-row{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12.5px;padding:4px 2px 16px;}
.fd-empty-row i{opacity:.25;font-size:16px;}
.fd-muted{color:var(--muted);}
.fd-inline-btn{background:none;border:none;font-family:var(--font);font-size:inherit;color:var(--accent);cursor:pointer;font-weight:500;padding:0;text-decoration:underline;}
/* platform */
.fd-platform-block{margin-bottom:20px;}
.fd-platform-card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-xs);}
.fd-platform-progress{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:0.5px solid var(--border);}
.fd-platform-bar-wrap{flex:1;height:4px;background:var(--border-med);border-radius:2px;overflow:hidden;}
.fd-platform-bar{height:100%;border-radius:2px;transition:width .7s cubic-bezier(.32,.72,0,1);}
.fd-platform-pct{font-size:10.5px;font-weight:600;color:var(--muted2);flex-shrink:0;}
.fd-platform-tasks{padding:4px 0 8px;}
.fd-platform-task{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;transition:background .1s;}
.fd-platform-task:hover{background:var(--surface2);}
.fd-platform-task-high{background:rgba(176,96,0,0.03);}
.fd-ptask-check{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--border-med);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted2);flex-shrink:0;}
.fd-ptask-label{flex:1;font-size:13px;color:var(--text);font-weight:300;}
.fd-ptask-area{font-size:9.5px;font-weight:600;letter-spacing:.06em;padding:2px 7px;border-radius:20px;background:var(--surface3);color:var(--muted2);flex-shrink:0;}
.fd-ptask-high{font-size:10px;font-weight:700;color:var(--fd-amber);flex-shrink:0;width:14px;text-align:center;}
.fd-platform-more{font-size:11px;color:var(--muted);padding:6px 16px 8px;}
.fd-platform-clear{display:flex;align-items:center;gap:8px;padding:14px 16px;font-size:12.5px;color:var(--muted);}
.fd-platform-clear i{font-size:16px;color:var(--fd-green);}
.pt-modal-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border);}
.pt-modal-row:last-child{border-bottom:none;}
.pt-modal-input{flex:1;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-xs);padding:6px 9px;font-family:var(--font);font-size:12.5px;color:var(--text);outline:none;}
.pt-modal-area,.pt-modal-pri{background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-xs);padding:5px 7px;font-family:var(--font);font-size:11.5px;color:var(--text2);outline:none;}
.pt-add-row{display:flex;align-items:center;gap:7px;padding:8px 0 4px;}
.pt-add-row input{background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-xs);padding:8px 10px;font-family:var(--font);font-size:12.5px;color:var(--text);outline:none;}
.pt-add-row select{background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-xs);padding:8px 7px;font-family:var(--font);font-size:11.5px;color:var(--text2);outline:none;}
/* brand status */
.fd-brand-status-block{margin-bottom:20px;}
.fd-brand-status-row{display:flex;gap:10px;}
.fd-brand-status-card{flex:1;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:14px;box-shadow:var(--shadow-xs);cursor:pointer;transition:box-shadow .15s;display:flex;flex-direction:column;align-items:center;text-align:center;}
.fd-brand-status-card:active{box-shadow:var(--shadow-md);}
.fd-bsc-top{display:flex;align-items:center;gap:6px;margin-bottom:10px;}
.fd-bsc-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.fd-bsc-name{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);}
.fd-bsc-arc-wrap{position:relative;margin-bottom:6px;}
.fd-bsc-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:300;font-family:var(--font);}
.fd-bsc-sub{font-size:10.5px;color:var(--muted);}
.fd-bsc-hint{font-size:10px;color:var(--fd-amber);margin-top:3px;font-weight:500;}
/* waiting */
.fd-waiting-list{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-xs);margin-bottom:4px;}
.fd-waiting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:0.5px solid rgba(0,0,0,0.04);}
.fd-waiting-row:last-child{border-bottom:none;}
.fd-waiting-row.fd-waiting-urgent{background:rgba(192,57,43,0.02);}
.fd-waiting-main{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}
.fd-waiting-dot{width:6px;height:6px;border-radius:50%;background:var(--muted2);flex-shrink:0;}
.fd-waiting-dot.urgent{background:var(--fd-red);}
.fd-waiting-text{font-size:13px;color:var(--text);font-weight:300;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fd-waiting-meta{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.fd-waiting-age{font-size:11px;color:var(--muted2);font-weight:500;}
.fd-resolve-btn{font-size:10.5px;font-weight:600;color:var(--success);background:var(--success-soft);border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-family:var(--font);transition:opacity .12s;}
.fd-resolve-btn:active{opacity:.7;}
/* updates */
.fd-updates-list{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-xs);margin-bottom:4px;}
.fd-update-row{display:flex;align-items:flex-start;gap:10px;padding:11px 16px;border-bottom:0.5px solid rgba(0,0,0,0.04);}
.fd-update-row:last-child{border-bottom:none;}
.fd-update-brand-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.fd-update-body{flex:1;min-width:0;}
.fd-update-meta{display:flex;align-items:center;gap:7px;margin-bottom:4px;flex-wrap:wrap;}
.fd-update-brand-name{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text2);}
.fd-update-status{font-size:9.5px;font-weight:600;border:1px solid;border-radius:20px;padding:1px 7px;}
.fd-update-time{font-size:10.5px;color:var(--muted2);margin-left:auto;}
.fd-update-text{font-size:13px;color:var(--text);font-weight:300;line-height:1.5;}
/* updates page */
.fd-update-compose{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:14px;box-shadow:var(--shadow-xs);}
.fd-update-compose-brand{font-size:12px;font-weight:500;margin-bottom:10px;display:flex;align-items:center;}
.fd-update-compose-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap;}
.bu-status-btn{font-size:11px;font-weight:500;border:0.5px solid var(--border-med);background:var(--surface2);color:var(--muted);border-radius:20px;padding:5px 12px;cursor:pointer;font-family:var(--font);transition:all .12s;}
.bu-status-btn.active{background:var(--text);border-color:var(--text);color:#fff;}
.fd-updates-filter{display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap;}
.bu-filter-btn{font-size:11px;font-weight:500;border:0.5px solid var(--border-med);background:var(--surface);color:var(--muted);border-radius:20px;padding:5px 13px;cursor:pointer;font-family:var(--font);transition:all .12s;display:flex;align-items:center;}
.bu-filter-btn.active{background:var(--text);border-color:var(--text);color:#fff;}
.bu-feed-list{display:flex;flex-direction:column;background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-xs);}
.bu-feed-row{display:flex;align-items:flex-start;gap:10px;padding:13px 16px;border-bottom:0.5px solid rgba(0,0,0,0.05);}
.bu-feed-row:last-child{border-bottom:none;}
.bu-feed-left{padding-top:4px;}
.bu-feed-brand-pip{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.bu-feed-body{flex:1;min-width:0;}
.bu-feed-meta{display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap;}
.bu-feed-brand{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text2);}
.bu-feed-status{font-size:9.5px;font-weight:600;border:1px solid;border-radius:20px;padding:1px 7px;}
.bu-feed-time{font-size:10.5px;color:var(--muted2);}
.bu-feed-text{font-size:13px;color:var(--text);font-weight:300;line-height:1.5;}
/* activity */
.fd-activity-list{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-xs);}
.fd-activity-row{display:flex;align-items:center;gap:11px;padding:10px 16px;border-bottom:0.5px solid rgba(0,0,0,0.04);}
.fd-activity-row:last-child{border-bottom:none;}
.fd-activity-icon{width:28px;height:28px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--muted);flex-shrink:0;}
.fd-activity-text{flex:1;font-size:12.5px;color:var(--text);font-weight:300;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fd-activity-time{font-size:10.5px;color:var(--muted2);flex-shrink:0;}
/* collections */
.coll-brand-block{margin:0 20px 24px;}
.coll-brand-hdr{display:flex;align-items:center;gap:9px;padding-bottom:9px;border-bottom:0.5px solid var(--border);margin-bottom:10px;}
.coll-brand-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.coll-brand-name{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;flex:1;display:flex;align-items:center;gap:7px;}
.coll-op-tag{font-size:9px;font-weight:600;padding:1px 7px;border-radius:20px;background:rgba(26,86,219,.08);color:var(--accent);letter-spacing:.05em;text-transform:uppercase;}
.coll-brand-pct{font-size:11.5px;font-weight:600;}
.coll-brand-count{font-size:11px;color:var(--muted);}
.coll-table-wrap{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;overflow-x:auto;box-shadow:var(--shadow-xs);}
.coll-table{width:100%;border-collapse:collapse;min-width:400px;}
.coll-table thead tr{border-bottom:0.5px solid var(--border);}
.coll-table th{padding:8px 14px;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;background:var(--surface2);}
.coll-table td{padding:11px 14px;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:12.5px;vertical-align:middle;}
.coll-row{cursor:pointer;transition:background .1s;}
.coll-row:hover{background:var(--surface2);}
.coll-row:last-child td{border-bottom:none;}
.coll-row-ready td:first-child{border-left:2.5px solid #1a8742;}
.coll-prod-name{font-size:13px;font-weight:400;color:var(--text);}
.coll-prod-price{font-size:11px;color:var(--muted);margin-top:2px;}
.coll-check{color:#1a8742;font-size:14px;font-weight:700;}
.coll-cross{color:#c0392b;font-size:14px;font-weight:700;opacity:.7;}
.coll-score-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--surface3);color:var(--muted);display:inline-block;}
.coll-score-pill.ready{background:var(--success-soft);color:var(--success);}
.coll-empty{font-size:12px;color:var(--muted);padding:12px 0;}
/* projects */
.proj-brand-group{margin:0 20px 22px;}
.proj-brand-hdr{display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:0.5px solid var(--border);margin-bottom:10px;}
.proj-brand-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.proj-brand-lbl{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;flex:1;}
.proj-brand-ct{font-size:11px;color:var(--muted);}
.proj-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}
.proj-card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:14px;cursor:pointer;transition:box-shadow .15s;box-shadow:var(--shadow-xs);}
.proj-card:active{box-shadow:var(--shadow-md);}
.proj-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;}
.proj-card-type{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted2);margin-bottom:3px;}
.proj-card-name{font-size:13.5px;font-weight:400;color:var(--text);line-height:1.35;}
.proj-card-date{font-size:12px;font-weight:700;flex-shrink:0;}
.proj-track-wrap{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
.proj-track{flex:1;height:3px;background:var(--border-med);border-radius:2px;overflow:hidden;}
.proj-fill{height:100%;border-radius:2px;transition:width .5s cubic-bezier(.32,.72,0,1);}
.proj-pct{font-size:10.5px;font-weight:600;color:var(--muted);flex-shrink:0;}
.proj-next{font-size:11px;color:var(--muted);}
.proj-brand-empty{font-size:12px;color:var(--muted);padding:10px 0;}
.pj-stages-list{display:flex;flex-direction:column;gap:6px;background:var(--surface2);border:0.5px solid var(--border);border-radius:var(--r-xs);padding:10px 12px;max-height:220px;overflow-y:auto;}
.pj-stage-row{display:flex;align-items:center;gap:9px;}
.pj-stage-name{font-size:12.5px;color:var(--text2);}
/* notes */
.note-compose{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:14px;margin:0 20px 14px;box-shadow:var(--shadow-xs);}
.note-textarea{width:100%;background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-sm);padding:11px 13px;font-family:var(--font);font-size:13px;color:var(--text);resize:vertical;min-height:80px;outline:none;transition:border-color .18s;box-sizing:border-box;}
.note-textarea:focus{border-color:rgba(26,86,219,.35);}
.note-footer{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:8px;}
.note-tag-sel{background:var(--surface2);border:0.5px solid var(--border-med);border-radius:var(--r-xs);padding:7px 10px;font-family:var(--font);font-size:12px;color:var(--text2);outline:none;}
.notes-feed{display:flex;flex-direction:column;gap:8px;padding:0 20px;}
.note-card{background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:13px 14px;box-shadow:var(--shadow-xs);}
.note-card-hdr{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
.note-tag-badge{font-size:9.5px;font-weight:700;letter-spacing:.07em;padding:2px 8px;border-radius:20px;background:var(--accent-soft);color:var(--accent);}
.note-ts{font-size:10.5px;color:var(--muted2);flex:1;}
.note-body{font-size:13px;color:var(--text);line-height:1.55;font-weight:300;}
@media(max-width:767px){
  .fd-page{padding:20px 16px 80px;}
  .fd-greeting-text{font-size:18px;}
  .fd-arc-wrap{width:60px;height:60px;}
  .fd-arc-svg{width:60px;height:60px;}
  .fd-arc-pct{font-size:17px;}
  .fd-brand-status-row{gap:8px;}
  .fd-bsc-name{font-size:9px;}
  .mc-view-hdr{padding:16px 16px 0;}
  .mc-table-wrap,.coll-brand-block,.proj-brand-group,.note-compose,.notes-feed{margin-left:16px;margin-right:16px;}
  .proj-cards{grid-template-columns:1fr;}
}
    `;
    document.head.appendChild(s);
  }

})();
