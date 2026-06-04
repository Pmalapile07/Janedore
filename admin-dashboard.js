(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var fmtDate   = window._fmtDate;
  var db        = window._adminDB;
  var showToast = window._showToast;

  /* ─── HOUSE BRANDS ───────────────────────────────────────────────────────── */
  var BRANDS = [
    { key: 'JANEDORE',  color: '#1a56db', bg: 'rgba(26,86,219,0.08)'  },
    { key: 'NIRIUS CO', color: '#6e40c9', bg: 'rgba(110,64,201,0.08)' },
    { key: 'THATO',     color: '#111111', bg: 'rgba(17,17,17,0.06)'   }
  ];

  var _view         = 'dashboard';
  var _allOrders    = [];
  var _brandFilters = { 'JANEDORE': true, 'NIRIUS CO': true, 'THATO': true };

  /* ─── COLLECTION REFS ────────────────────────────────────────────────────── */
  var productsRef   = window._productsRef  || db.collection('products');
  var projectsRef   = db.collection('launch_projects');
  var suppliersRef  = db.collection('suppliers');
  var milestonesRef = db.collection('milestones');
  var waitingRef    = db.collection('waiting_on');
  var notesRef      = db.collection('founder_notes');
  var ordersRef     = window._ordersRef    || db.collection('orders');

  window._projectsRef  = projectsRef;
  window._suppliersRef = suppliersRef;

  /* ─── PROJECT TYPE STAGES ────────────────────────────────────────────────── */
  var PROJECT_STAGES = {
    'Sample':          ['Requested','Shipped','In Customs','Delivered','Approved'],
    'Packaging':       ['Designed','Supplier Found','Ordered','In Production','Delivered','Approved'],
    'Campaign':        ['Moodboard','Direction','Shoot Booked','Shoot Complete','Edited','Published'],
    'Photoshoot':      ['Booked','Products Prepped','Shoot Complete','Edited','Delivered'],
    'Fragrance':       ['Direction','Formula','Bottle Design','Sample','Lab Approved','Production'],
    'Brand Initiative':['Concept','Research','Planning','In Progress','Complete']
  };

  /* ══════════════════════════════════════════════════════════════════════════
     PRODUCT READINESS HELPERS
  ══════════════════════════════════════════════════════════════════════════ */
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
    if (Array.isArray(p.variants)) {
      return p.variants.some(function (v) { return v.price && Number(v.price) > 0; });
    }
    return false;
  }

  function hasInventory(p) {
    if (p.inventory && Number(p.inventory) > 0) return true;
    if (p.stock     && Number(p.stock)     > 0) return true;
    if (p.quantity  && Number(p.quantity)  > 0) return true;
    if (Array.isArray(p.variants)) {
      return p.variants.some(function (v) {
        return (v.inventory && Number(v.inventory) > 0) ||
               (v.stock     && Number(v.stock)     > 0) ||
               (v.quantity  && Number(v.quantity)  > 0);
      });
    }
    return false;
  }

  function isPublished(p) {
    if (p.published === true)  return true;
    if (p.visible   === true)  return true;
    if (p.status === 'active' || p.status === 'published' || p.status === 'live') return true;
    return false;
  }

  function scoreProduct(p) {
    var img = hasImage(p)     ? 1 : 0;
    var prc = hasPrice(p)     ? 1 : 0;
    var inv = hasInventory(p) ? 1 : 0;
    var pub = isPublished(p)  ? 1 : 0;
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

  function brandMeta(key) {
    return BRANDS.find(function (b) { return b.key === key; }) || BRANDS[0];
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MAIN ENTRY — called by admin.js switchTab
  ══════════════════════════════════════════════════════════════════════════ */
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

  /* ─── NAV ────────────────────────────────────────────────────────────────── */
  var NAV_ITEMS = [
    { id: 'dashboard',    icon: 'ph-squares-four',  label: 'Dashboard'   },
    { id: 'collections',  icon: 'ph-stack',         label: 'Collections' },
    { id: 'projects',     icon: 'ph-rocket-launch',  label: 'Projects'    },
    { id: 'orders',       icon: 'ph-receipt',        label: 'Orders'      },
    { id: 'suppliers',    icon: 'ph-factory',        label: 'Suppliers'   },
    { id: 'notes',        icon: 'ph-notebook-text',  label: 'Notes'       }
  ];

  function buildSideNav() {
    return '<nav class="mc-sidenav">' +
      '<div class="mc-sidenav-top">' +
        '<div class="mc-sidenav-word">MISSION CONTROL</div>' +
        '<div class="mc-sidenav-date">' +
          new Date().toLocaleDateString('en-ZA', { weekday:'short', day:'2-digit', month:'short' }).toUpperCase() +
        '</div>' +
      '</div>' +
      NAV_ITEMS.map(function (n) {
        return '<button class="mc-snav-btn' + (_view === n.id ? ' mc-on' : '') + '" ' +
          'onclick="window._mcGo(\'' + n.id + '\')">' +
          '<i class="ph-light ' + n.icon + '"></i><span>' + n.label + '</span>' +
        '</button>';
      }).join('') +
    '</nav>';
  }

  function buildMobileNav() {
    return '<div class="mc-mnav">' +
      NAV_ITEMS.map(function (n) {
        return '<button class="mc-mpill' + (_view === n.id ? ' mc-on' : '') + '" ' +
          'onclick="window._mcGo(\'' + n.id + '\')">' + n.label + '</button>';
      }).join('') +
    '</div>';
  }

  window._mcGo = function (v) {
    _view = v;
    document.querySelectorAll('.mc-snav-btn, .mc-mpill').forEach(function (b) {
      var hit = b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'" + v + "'") > -1;
      b.classList.toggle('mc-on', hit);
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
      case 'notes':       viewNotes(area);       break;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: DASHBOARD — the 8am founder view
  ══════════════════════════════════════════════════════════════════════════ */
  function viewDashboard(area) {
    Promise.all([
      productsRef.get(),
      projectsRef.get(),
      milestonesRef.orderBy('date', 'asc').limit(6).get().catch(function () { return milestonesRef.get(); }),
      waitingRef.get(),
      ordersRef.get().catch(function () { return { docs: [] }; })
    ]).then(function (res) {

      var products   = res[0].docs.map(d2o);
      var projects   = res[1].docs.map(d2o);
      var milestones = res[2].docs.map(d2o);
      var waiting    = res[3].docs.map(d2o).filter(function (w) { return !w.resolved; });
      var orders     = res[4].docs.map(d2o);
      _allOrders     = orders;

      /* Score every product */
      var scored = products.map(function (p) {
        return Object.assign({}, p, { _score: scoreProduct(p), _brand: getBrand(p) });
      });

      /* Readiness calculations */
      var total = scored.length;
      var rd    = calcReadiness(scored);

      /* Ready vs blocked */
      var ready   = scored.filter(function (p) { return p._score.total === 4; });
      var blocked = scored.filter(function (p) { return p._score.total < 4; })
                          .sort(function (a, b) { return b._score.total - a._score.total; });

      /* Next best action: product with highest score < 4 */
      var nba = blocked[0] || null;

      /* Incoming: projects with expectedDate, sorted soonest first */
      var now = Date.now();
      var incoming = projects
        .filter(function (p) { return p.expectedDate; })
        .map(function (p) {
          var d   = p.expectedDate.toDate ? p.expectedDate.toDate() : new Date(p.expectedDate);
          var dif = Math.ceil((d.getTime() - now) / 86400000);
          return Object.assign({}, p, { _daysUntil: dif, _date: d });
        })
        .filter(function (p) { return p._daysUntil >= -1; })
        .sort(function (a, b) { return a._daysUntil - b._daysUntil })
        .slice(0, 6);

      /* Deadlines */
      var deadlines = milestones
        .map(function (m) {
          var d   = m.date ? (m.date.toDate ? m.date.toDate() : new Date(m.date)) : null;
          var dif = d ? Math.ceil((d.getTime() - now) / 86400000) : 999;
          return Object.assign({}, m, { _daysUntil: dif, _date: d });
        })
        .filter(function (m) { return m._daysUntil >= 0; })
        .slice(0, 5);

      area.innerHTML =

        /* ── A: Launch Readiness ── */
        sectionA(rd, scored) +

        /* ── B: Ready To Sell ── */
        sectionB(ready) +

        /* ── C: Blockers ── */
        sectionC(blocked) +

        /* ── D: Next Best Action ── */
        sectionD(nba) +

        /* ── E: Incoming ── */
        sectionE(incoming) +

        /* ── F: Deadlines ── */
        sectionF(deadlines) +

        /* ── G: External Blockers ── */
        sectionG(waiting) +

        /* ── H: Orders ── */
        sectionH(orders);

      /* Init launch center if exists */
      if (window._initLaunchCenter) window._initLaunchCenter();
      buildChart(orders);

    }).catch(function (e) { area.innerHTML = errBanner(e); });
  }

  /* ─── SECTION A: LAUNCH READINESS ───────────────────────────────────────── */
  function calcReadiness(scored) {
    var n = scored.length;
    if (!n) return { overall: 0, img: 0, prc: 0, inv: 0, pub: 0, brands: {} };
    var totals = { pts: 0, img: 0, prc: 0, inv: 0, pub: 0 };
    scored.forEach(function (p) {
      totals.pts += p._score.total;
      totals.img += p._score.img;
      totals.prc += p._score.prc;
      totals.inv += p._score.inv;
      totals.pub += p._score.pub;
    });
    var pct = function (x) { return Math.round((x / n) * 100); };
    var brands = {};
    BRANDS.forEach(function (b) {
      var bp = scored.filter(function (p) { return p._brand === b.key; });
      if (!bp.length) { brands[b.key] = 0; return; }
      var bpts = bp.reduce(function (s, p) { return s + p._score.total; }, 0);
      brands[b.key] = Math.round((bpts / (bp.length * 4)) * 100);
    });
    return {
      overall: Math.round((totals.pts / (n * 4)) * 100),
      img: pct(totals.img), prc: pct(totals.prc),
      inv: pct(totals.inv), pub: pct(totals.pub),
      brands: brands, total: n,
      readyCount: scored.filter(function (p) { return p._score.total === 4; }).length
    };
  }

  function sectionA(rd, scored) {
    var n = scored.length;
    return '<div class="ds-readiness-hero">' +
      '<div class="ds-rh-top">' +
        '<div class="ds-rh-left">' +
          '<div class="ds-rh-eyebrow">Launch Readiness</div>' +
          '<div class="ds-rh-score">' + rd.overall + '<span class="ds-rh-unit">%</span></div>' +
          '<div class="ds-rh-sub">' + rd.readyCount + ' of ' + n + ' products ready to sell</div>' +
          '<div class="ds-rh-bar-wrap"><div class="ds-rh-bar" style="width:' + rd.overall + '%;"></div></div>' +
        '</div>' +
        '<div class="ds-rh-right">' +
          '<div class="ds-subscore-grid">' +
            dsSubscore('Photography', rd.img,  'ph-camera') +
            dsSubscore('Pricing',     rd.prc,  'ph-tag') +
            dsSubscore('Inventory',   rd.inv,  'ph-package') +
            dsSubscore('Live',        rd.pub,  'ph-globe') +
          '</div>' +
          '<div class="ds-brand-scores">' +
            BRANDS.map(function (b) {
              var pct = rd.brands[b.key] || 0;
              return '<div class="ds-brand-score-row">' +
                '<span class="ds-brand-dot" style="background:' + b.color + ';"></span>' +
                '<span class="ds-brand-score-name">' + b.key + '</span>' +
                '<div class="ds-brand-score-track"><div class="ds-brand-score-fill" style="width:' + pct + '%;background:' + b.color + ';"></div></div>' +
                '<span class="ds-brand-score-pct">' + pct + '%</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function dsSubscore(label, pct, icon) {
    var color = pct >= 80 ? '#1a8742' : pct >= 50 ? '#c07000' : '#c0392b';
    return '<div class="ds-subscore-card">' +
      '<i class="ph-light ' + icon + '" style="font-size:16px;color:' + color + ';margin-bottom:3px;"></i>' +
      '<div class="ds-subscore-pct" style="color:' + color + ';">' + pct + '%</div>' +
      '<div class="ds-subscore-label">' + label + '</div>' +
    '</div>';
  }

  /* ─── SECTION B: READY TO SELL ──────────────────────────────────────────── */
  function sectionB(ready) {
    if (!ready.length) {
      return dsLabel('Ready to Sell') +
        '<div class="ds-empty-gentle">' +
          '<i class="ph-light ph-storefront"></i>' +
          '<span>No products are fully ready yet — blockers below show what to fix.</span>' +
        '</div>';
    }
    return dsLabel('Ready to Sell') +
      '<div class="ds-ready-list">' +
        ready.map(function (p) {
          var bm = brandMeta(p._brand);
          var price = getPrice(p);
          return '<div class="ds-ready-row" onclick="window._openProductModal && window._openProductModal(\'' + p.id + '\')">' +
            '<span class="ds-ready-dot" style="background:' + bm.color + ';"></span>' +
            '<div class="ds-ready-info">' +
              '<div class="ds-ready-name">' + esc(p.name || '—') + '</div>' +
              '<div class="ds-ready-brand">' + esc(p._brand) + '</div>' +
            '</div>' +
            (price ? '<div class="ds-ready-price">' + esc(price) + '</div>' : '') +
            '<span class="ds-live-badge">Live</span>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  /* ─── SECTION C: BLOCKERS ────────────────────────────────────────────────── */
  function sectionC(blocked) {
    if (!blocked.length) return '';
    return dsLabel('Blockers') +
      '<div class="ds-blockers">' +
        blocked.map(function (p) {
          var bm   = brandMeta(p._brand);
          var s    = p._score;
          var tags = [];
          if (!s.img) tags.push(['Missing Photography', '#c0392b']);
          if (!s.prc) tags.push(['Missing Price',       '#c07000']);
          if (!s.inv) tags.push(['Missing Inventory',   '#c07000']);
          if (!s.pub) tags.push(['Not Published',       '#8a8a8a']);
          return '<div class="ds-blocker-row" onclick="window._openProductModal && window._openProductModal(\'' + p.id + '\')">' +
            '<div class="ds-blocker-left">' +
              '<span class="ds-blocker-dot" style="background:' + bm.color + ';"></span>' +
              '<div class="ds-blocker-info">' +
                '<div class="ds-blocker-name">' + esc(p.name || '—') + '</div>' +
                '<div class="ds-blocker-brand">' + esc(p._brand) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ds-blocker-tags">' +
              tags.map(function (t) {
                return '<span class="ds-blocker-tag" style="color:' + t[1] + ';border-color:' + t[1] + ';">' + t[0] + '</span>';
              }).join('') +
            '</div>' +
            '<i class="ph-light ph-arrow-right ds-blocker-arrow"></i>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  /* ─── SECTION D: NEXT BEST ACTION ───────────────────────────────────────── */
  function sectionD(p) {
    if (!p) return '';
    var s    = p._score;
    var miss = !s.img ? 'photography' : !s.prc ? 'pricing' : !s.inv ? 'inventory' : 'publishing';
    var verb = !s.img ? 'Add photography' : !s.prc ? 'Set a price' : !s.inv ? 'Add inventory' : 'Publish the product';
    var steps = 4 - s.total;
    return '<div class="ds-nba-card" onclick="window._openProductModal && window._openProductModal(\'' + p.id + '\')">' +
      '<div class="ds-nba-label">Next Best Action</div>' +
      '<div class="ds-nba-text">' +
        '<strong>' + esc(p.name || '—') + '</strong> is ' +
        (steps === 1 ? 'one step' : steps + ' steps') +
        ' from being ready to sell. ' + verb + ' to' + (steps === 1 ? ' unlock it.' : ' move forward.') +
      '</div>' +
      '<div class="ds-nba-footer">' +
        '<span class="ds-nba-action">' + verb + ' <i class="ph-light ph-arrow-right"></i></span>' +
      '</div>' +
    '</div>';
  }

  /* ─── SECTION E: INCOMING ────────────────────────────────────────────────── */
  function sectionE(incoming) {
    if (!incoming.length) return '';
    return dsLabel('Incoming') +
      '<div class="ds-incoming-list">' +
        incoming.map(function (p) {
          var d   = p._daysUntil;
          var bm  = brandMeta(p.brand || '');
          var txt = d === 0 ? 'arriving today' : d === 1 ? 'arriving tomorrow' :
                    d < 0  ? 'overdue by ' + Math.abs(d) + ' day' + (Math.abs(d) > 1 ? 's' : '') :
                    'arriving in ' + d + ' day' + (d > 1 ? 's' : '');
          var urg = d <= 0 ? '#c0392b' : d <= 3 ? '#c07000' : '#1a8742';
          return '<div class="ds-incoming-row" onclick="window._mcGo(\'projects\')">' +
            '<div class="ds-incoming-icon" style="background:' + bm.bg + ';color:' + bm.color + ';">' +
              '<i class="ph-light ph-arrow-down"></i>' +
            '</div>' +
            '<div class="ds-incoming-info">' +
              '<div class="ds-incoming-name">' + esc(p.name || '—') + '</div>' +
              '<div class="ds-incoming-type">' + esc(p.type || '') + (p.brand ? ' · ' + esc(p.brand) : '') + '</div>' +
            '</div>' +
            '<div class="ds-incoming-when" style="color:' + urg + ';">' + txt + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  /* ─── SECTION F: DEADLINES ───────────────────────────────────────────────── */
  function sectionF(deadlines) {
    if (!deadlines.length) return '';
    return dsLabel('Upcoming Deadlines') +
      '<div class="ds-deadlines">' +
        deadlines.map(function (m) {
          var d   = m._daysUntil;
          var col = d > 14 ? '#1a8742' : d > 7 ? '#c07000' : '#c0392b';
          var bg  = d > 14 ? 'rgba(26,135,66,0.07)' : d > 7 ? 'rgba(192,112,0,0.07)' : 'rgba(192,57,43,0.07)';
          var dateStr = m._date ? m._date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) : '—';
          return '<div class="ds-deadline-card" style="border-color:' + col + ';background:' + bg + ';">' +
            '<div class="ds-deadline-date" style="color:' + col + ';">' + dateStr + '</div>' +
            '<div class="ds-deadline-title">' + esc(m.title || '—') + '</div>' +
            '<div class="ds-deadline-days" style="color:' + col + ';">' +
              (d === 0 ? 'Today' : d + 'd') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  /* ─── SECTION G: EXTERNAL BLOCKERS ──────────────────────────────────────── */
  function sectionG(waiting) {
    if (!waiting.length) return '';
    return dsLabel('Waiting On') +
      '<div class="ds-waiting-list">' +
        waiting.slice(0, 6).map(function (w) {
          var age = w.createdAt ? Math.round((Date.now() - (w.createdAt.toDate ? w.createdAt.toDate() : new Date(w.createdAt)).getTime()) / 86400000) : 0;
          var urg = age >= 5;
          return '<div class="ds-waiting-row' + (urg ? ' urgent' : '') + '">' +
            '<i class="ph-light ph-hourglass" style="font-size:15px;flex-shrink:0;color:' + (urg ? '#c0392b' : 'var(--muted)') + '"></i>' +
            '<span class="ds-waiting-text">' + esc(w.description || '—') + '</span>' +
            '<span class="ds-waiting-age' + (urg ? ' urgent' : '') + '">' + age + 'd</span>' +
            '<button class="ds-resolve-btn" onclick="event.stopPropagation();window._mcResolveWaiting(\'' + w.id + '\')">Resolve</button>' +
          '</div>';
        }).join('') +
        '<div style="padding:8px 16px 12px;">' +
          '<button class="mc-link-btn" onclick="window._mcAddWaiting()"><i class="ph-light ph-plus"></i> Add waiting item</button>' +
        '</div>' +
      '</div>';
  }

  window._mcResolveWaiting = function (id) {
    waitingRef.doc(id).update({ resolved: true })
      .then(function () { showToast('Resolved'); window._mcGo('dashboard'); })
      .catch(function (e) { showToast(e.message, 'error'); });
  };

  window._mcAddWaiting = function () {
    var cats = ['Supplier','Manufacturer','Sample','Packaging','Design','Photography','Quote','Logistics','Other'];
    window._mountModal(
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">Add Waiting Item</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>What are you waiting for?</label>' +
          '<textarea id="mw-desc" rows="3" placeholder="Waiting for supplier quote on MOQ..."></textarea>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Category</label><select id="mw-cat">' + cats.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-group"><label>Related to (optional)</label><input id="mw-rel" placeholder="e.g. JANEDORE Handbag"></div>' +
        '</div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveWaiting()">Add</button>' +
        '</div>' +
      '</div>'
    );
  };

  window._mcSaveWaiting = function () {
    var desc = ((safeEl('mw-desc') || {}).value || '').trim();
    if (!desc) { showToast('Describe what you are waiting for', 'error'); return; }
    waitingRef.add({
      description: desc,
      category: (safeEl('mw-cat') || {}).value || 'Other',
      relatedTo:  (safeEl('mw-rel') || {}).value || '',
      resolved: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () { window._closeModal(); showToast('Added'); window._mcGo('dashboard'); })
      .catch(function (e) { showToast(e.message, 'error'); });
  };

  /* ─── SECTION H: ORDERS CHART ────────────────────────────────────────────── */
  function sectionH(orders) {
    return dsLabel('Order Activity') +
      '<div class="mc-card" style="margin-bottom:12px;">' +
        '<div class="mc-card-hdr">' +
          '<span class="mc-card-ttl">Orders — Last 30 Days</span>' +
          '<div style="display:flex;align-items:center;gap:7px;margin-left:auto;flex-wrap:wrap;">' +
            '<div class="dash-live-pill" id="dash-live-pill"><span class="dash-live-dot"></span><span id="dash-live-count">Live</span></div>' +
            BRANDS.map(function (b) {
              var k = b.key.replace(/\s/g, '-');
              return '<button class="dash-brand-toggle active" id="dash-toggle-' + k + '" ' +
                'onclick="window._dashToggleBrand(\'' + b.key + '\')" style="--brand-color:' + b.color + ';">' +
                '<span class="dash-brand-dot" style="background:' + b.color + ';"></span>' + b.key +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
      '</div>' +
      '<div id="dash-day-popup" class="dash-day-popup" style="display:none;">' +
        '<div class="dash-day-popup-inner">' +
          '<div class="dash-day-popup-header">' +
            '<span class="dash-day-popup-title" id="dash-popup-title">—</span>' +
            '<button class="dash-day-popup-close" onclick="window._dashClosePopup()"><i class="ph-light ph-x"></i></button>' +
          '</div>' +
          '<div id="dash-popup-body" class="dash-day-popup-body"></div>' +
        '</div>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: COLLECTIONS — product readiness detail
  ══════════════════════════════════════════════════════════════════════════ */
  function viewCollections(area) {
    productsRef.get().then(function (snap) {
      var products = snap.docs.map(d2o);
      var scored   = products.map(function (p) {
        return Object.assign({}, p, { _score: scoreProduct(p), _brand: getBrand(p) });
      });

      var byBrand = {};
      BRANDS.forEach(function (b) { byBrand[b.key] = []; });
      scored.forEach(function (p) {
        if (!byBrand[p._brand]) byBrand[p._brand] = [];
        byBrand[p._brand].push(p);
      });

      area.innerHTML =
        '<div class="mc-view-hdr">' +
          '<div><div class="mc-view-title">Collections</div>' +
            '<div class="mc-view-sub">' + products.length + ' products · readiness by brand</div>' +
          '</div>' +
        '</div>' +
        BRANDS.map(function (b) {
          var list = byBrand[b.key] || [];
          var rdpct = list.length ? Math.round(list.reduce(function (s, p) { return s + p._score.total; }, 0) / (list.length * 4) * 100) : 0;
          return '<div class="coll-brand-block">' +
            '<div class="coll-brand-hdr">' +
              '<div class="coll-brand-dot" style="background:' + b.color + ';"></div>' +
              '<div class="coll-brand-name">' + b.key + '</div>' +
              '<div class="coll-brand-pct" style="color:' + b.color + ';">' + rdpct + '% ready</div>' +
              '<div class="coll-brand-count">' + list.length + ' products</div>' +
            '</div>' +
            (list.length ?
              '<div class="coll-table-wrap">' +
                '<table class="coll-table">' +
                  '<thead><tr><th>Product</th><th>Photo</th><th>Price</th><th>Stock</th><th>Live</th><th>Score</th></tr></thead>' +
                  '<tbody>' +
                    list.map(function (p) {
                      var s   = p._score;
                      var price = getPrice(p);
                      var allReady = s.total === 4;
                      return '<tr class="coll-row' + (allReady ? ' coll-row-ready' : '') + '" ' +
                        'onclick="window._openProductModal && window._openProductModal(\'' + p.id + '\')">' +
                        '<td><div class="coll-prod-name">' + esc(p.name || '—') + '</div>' +
                          (price ? '<div class="coll-prod-price">' + esc(price) + '</div>' : '') +
                        '</td>' +
                        '<td>' + checkX(s.img) + '</td>' +
                        '<td>' + checkX(s.prc) + '</td>' +
                        '<td>' + checkX(s.inv) + '</td>' +
                        '<td>' + checkX(s.pub) + '</td>' +
                        '<td><div class="coll-score-pill' + (allReady ? ' ready' : '') + '">' + s.total + '/4</div></td>' +
                      '</tr>';
                    }).join('') +
                  '</tbody>' +
                '</table>' +
              '</div>' :
              '<div class="coll-empty">No products for ' + b.key + ' yet.</div>'
            ) +
          '</div>';
        }).join('');

    }).catch(function (e) { area.innerHTML = errBanner(e); });
  }

  function checkX(val) {
    return val
      ? '<span class="coll-check">&#10003;</span>'
      : '<span class="coll-cross">&#10007;</span>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: PROJECTS — non-product operational work
  ══════════════════════════════════════════════════════════════════════════ */
  function viewProjects(area) {
    projectsRef.get().then(function (snap) {
      var projects = snap.docs.map(d2o);
      var byBrand  = {};
      BRANDS.forEach(function (b) { byBrand[b.key] = []; });
      projects.forEach(function (p) {
        var k = (p.brand || 'JANEDORE').toUpperCase();
        if (!byBrand[k]) byBrand[k] = [];
        byBrand[k].push(p);
      });

      area.innerHTML =
        '<div class="mc-view-hdr">' +
          '<div><div class="mc-view-title">Projects</div>' +
            '<div class="mc-view-sub">Campaigns, samples, packaging, photoshoots</div>' +
          '</div>' +
          '<button class="mc-btn-primary" onclick="window._mcNewProject()"><i class="ph-light ph-plus"></i> New Project</button>' +
        '</div>' +
        BRANDS.map(function (b) {
          var list = byBrand[b.key] || [];
          return '<div class="proj-brand-group">' +
            '<div class="proj-brand-hdr">' +
              '<span class="proj-brand-dot" style="background:' + b.color + ';"></span>' +
              '<span class="proj-brand-lbl">' + b.key + '</span>' +
              '<span class="proj-brand-ct">' + list.length + '</span>' +
              '<button class="mc-link-btn" onclick="window._mcNewProjectFor(\'' + b.key + '\')">+ Add</button>' +
            '</div>' +
            (list.length ?
              '<div class="proj-cards">' +
                list.map(function (p) { return renderProjCard(p, b); }).join('') +
              '</div>' :
              '<div class="proj-brand-empty">No projects for ' + b.key + '</div>'
            ) +
          '</div>';
        }).join('');

    }).catch(function (e) { area.innerHTML = errBanner(e); });
  }

  function renderProjCard(p, brand) {
    var stages   = p.stages || [];
    var done     = stages.filter(function (s) { return s.done; }).length;
    var total    = stages.length;
    var pct      = total ? Math.round((done / total) * 100) : 0;
    var nextStage= stages.find(function (s) { return !s.done; });

    var now = Date.now();
    var daysUntil = null;
    if (p.expectedDate) {
      var d = p.expectedDate.toDate ? p.expectedDate.toDate() : new Date(p.expectedDate);
      daysUntil = Math.ceil((d.getTime() - now) / 86400000);
    }

    return '<div class="proj-card" onclick="window._mcOpenProject(\'' + p.id + '\')">' +
      '<div class="proj-card-top">' +
        '<div>' +
          '<div class="proj-card-type">' + esc(p.type || 'Project') + '</div>' +
          '<div class="proj-card-name">' + esc(p.name || '—') + '</div>' +
        '</div>' +
        (daysUntil !== null ?
          '<div class="proj-card-date" style="color:' + (daysUntil <= 3 ? '#c0392b' : daysUntil <= 7 ? '#c07000' : '#1a8742') + ';">' +
            (daysUntil === 0 ? 'Today' : daysUntil < 0 ? 'Overdue' : daysUntil + 'd') +
          '</div>' : ''
        ) +
      '</div>' +
      (total ?
        '<div class="proj-track-wrap">' +
          '<div class="proj-track"><div class="proj-fill" style="width:' + pct + '%;background:' + brand.color + ';"></div></div>' +
          '<span class="proj-pct">' + pct + '%</span>' +
        '</div>' : ''
      ) +
      (nextStage ? '<div class="proj-next">Next: ' + esc(nextStage.name) + '</div>' : '') +
    '</div>';
  }

  window._mcNewProject    = function () { showProjectModal(null, ''); };
  window._mcNewProjectFor = function (brand) { showProjectModal(null, brand); };

  window._mcOpenProject = function (id) {
    projectsRef.doc(id).get().then(function (doc) {
      if (doc.exists) showProjectModal(d2o(doc), '');
    });
  };

  function showProjectModal(p, presetBrand) {
    var isEdit   = !!p;
    var types    = Object.keys(PROJECT_STAGES);
    var curType  = p ? (p.type || 'Sample') : 'Sample';
    var stages   = p ? (p.stages || []) : PROJECT_STAGES[curType].map(function (s) { return { name: s, done: false }; });
    var dateVal  = '';
    if (p && p.expectedDate) {
      var d = p.expectedDate.toDate ? p.expectedDate.toDate() : new Date(p.expectedDate);
      dateVal = d.toISOString().split('T')[0];
    }

    var html =
      '<div class="modal" style="max-width:580px;">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Project' : 'New Project') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Project Name</label>' +
          '<input id="pj-name" value="' + esc(p ? p.name : '') + '" placeholder="e.g. Handbag Sample Round 1"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Brand</label><select id="pj-brand">' +
            BRANDS.map(function (b) {
              var sel = (p ? p.brand : presetBrand) === b.key ? ' selected' : '';
              return '<option value="' + b.key + '"' + sel + '>' + b.key + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Type</label><select id="pj-type" onchange="window._mcRefreshStages()">' +
            types.map(function (t) { return '<option value="' + t + '"' + (t === curType ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        '<div class="form-group"><label>Expected Date <span style="font-weight:400;color:var(--muted);">(feeds Incoming on Dashboard)</span></label>' +
          '<input type="date" id="pj-date" value="' + dateVal + '"></div>' +
        '<div class="form-group">' +
          '<label>Stages</label>' +
          '<div id="pj-stages" class="pj-stages-list">' +
            stages.map(function (s, i) { return pjStageRow(s, i); }).join('') +
          '</div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label>' +
          '<textarea id="pj-notes">' + esc(p ? (p.notes || '') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDeleteProject(\'' + p.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveProject(\'' + (isEdit ? p.id : '') + '\')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '</div>' +
      '</div>';
    window._mountModal(html);
  }

  function pjStageRow(s, i) {
    return '<div class="pj-stage-row">' +
      '<div class="lc-checkbox' + (s.done ? ' checked' : '') + '" onclick="this.classList.toggle(\'checked\')" data-idx="' + i + '">' +
        (s.done ? '<i class="ph-light ph-check" style="font-size:11px;"></i>' : '') +
      '</div>' +
      '<span class="pj-stage-name">' + esc(s.name) + '</span>' +
    '</div>';
  }

  window._mcRefreshStages = function () {
    var type = (safeEl('pj-type') || {}).value || 'Sample';
    var stageList = safeEl('pj-stages');
    if (!stageList) return;
    var stages = (PROJECT_STAGES[type] || []).map(function (s) { return { name: s, done: false }; });
    stageList.innerHTML = stages.map(pjStageRow).join('');
  };

  window._mcSaveProject = function (id) {
    var name    = ((safeEl('pj-name')  || {}).value || '').trim();
    var brand   = (safeEl('pj-brand') || {}).value || 'JANEDORE';
    var type    = (safeEl('pj-type')  || {}).value || 'Sample';
    var dateVal = (safeEl('pj-date')  || {}).value || '';
    var notes   = (safeEl('pj-notes') || {}).value || '';
    if (!name) { showToast('Enter a project name', 'error'); return; }

    /* Collect stages from DOM */
    var stages = [];
    document.querySelectorAll('.pj-stage-row').forEach(function (row) {
      var nameEl = row.querySelector('.pj-stage-name');
      var box    = row.querySelector('.lc-checkbox');
      if (nameEl) stages.push({ name: nameEl.textContent.trim(), done: !!(box && box.classList.contains('checked')) });
    });

    var data = {
      name: name, brand: brand, type: type, notes: notes, stages: stages,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (dateVal) data.expectedDate = firebase.firestore.Timestamp.fromDate(new Date(dateVal));

    var op = id
      ? projectsRef.doc(id).update(data)
      : projectsRef.add(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));

    op.then(function () { window._closeModal(); showToast(id ? 'Project saved' : 'Project created'); window._mcGo('projects'); })
      .catch(function (e) { showToast(e.message, 'error'); });
  };

  window._mcDeleteProject = function (id) {
    if (!confirm('Delete this project?')) return;
    projectsRef.doc(id).delete().then(function () {
      window._closeModal(); showToast('Deleted'); window._mcGo('projects');
    }).catch(function (e) { showToast(e.message, 'error'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: ORDERS
  ══════════════════════════════════════════════════════════════════════════ */
  function viewOrders(area) {
    ordersRef.get().catch(function () { return { docs: [] }; }).then(function (snap) {
      var orders = snap.docs.map(d2o);
      _allOrders = orders;
      area.innerHTML =
        '<div class="mc-view-hdr">' +
          '<div><div class="mc-view-title">Orders</div>' +
            '<div class="mc-view-sub">Last 30 days</div></div>' +
        '</div>' +
        '<div class="mc-card" style="margin-bottom:12px;">' +
          '<div class="mc-card-hdr">' +
            '<span class="mc-card-ttl">Order Activity</span>' +
            '<div style="display:flex;align-items:center;gap:7px;margin-left:auto;flex-wrap:wrap;">' +
              '<div class="dash-live-pill" id="dash-live-pill"><span class="dash-live-dot"></span><span id="dash-live-count">Live</span></div>' +
              BRANDS.map(function (b) {
                var k = b.key.replace(/\s/g, '-');
                return '<button class="dash-brand-toggle active" id="dash-toggle-' + k + '" ' +
                  'onclick="window._dashToggleBrand(\'' + b.key + '\')" style="--brand-color:' + b.color + ';">' +
                  '<span class="dash-brand-dot" style="background:' + b.color + ';"></span>' + b.key +
                '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
        '</div>' +
        '<div id="dash-day-popup" class="dash-day-popup" style="display:none;">' +
          '<div class="dash-day-popup-inner">' +
            '<div class="dash-day-popup-header">' +
              '<span class="dash-day-popup-title" id="dash-popup-title">—</span>' +
              '<button class="dash-day-popup-close" onclick="window._dashClosePopup()"><i class="ph-light ph-x"></i></button>' +
            '</div>' +
            '<div id="dash-popup-body" class="dash-day-popup-body"></div>' +
          '</div>' +
        '</div>';
      buildChart(orders);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: SUPPLIERS
  ══════════════════════════════════════════════════════════════════════════ */
  function viewSuppliers(area) {
    suppliersRef.get().then(function (snap) {
      var suppliers = snap.docs.map(d2o);
      area.innerHTML =
        '<div class="mc-view-hdr">' +
          '<div><div class="mc-view-title">Suppliers</div><div class="mc-view-sub">' + suppliers.length + ' suppliers</div></div>' +
          '<button class="mc-btn-primary" onclick="window._mcNewSupplier()"><i class="ph-light ph-plus"></i> Add</button>' +
        '</div>' +
        (suppliers.length ?
          '<div class="mc-table-wrap"><table class="mc-table">' +
            '<thead><tr><th>Supplier</th><th>Country</th><th>Category</th><th>MOQ</th><th>Lead Time</th><th>Status</th><th></th></tr></thead>' +
            '<tbody>' +
              suppliers.map(function (s) {
                return '<tr onclick="window._mcEditSupplier(\'' + s.id + '\')">' +
                  '<td><div style="font-weight:400;">' + esc(s.name || '—') + '</div></td>' +
                  '<td class="cell-muted">' + esc(s.country || '—') + '</td>' +
                  '<td class="cell-muted">' + esc(s.category || '—') + '</td>' +
                  '<td class="cell-muted">' + esc(s.moq || '—') + '</td>' +
                  '<td class="cell-muted">' + esc(s.leadTime || '—') + '</td>' +
                  '<td>' + statusPill(s.status) + '</td>' +
                  '<td><button class="mc-icon-btn" onclick="event.stopPropagation();window._mcEditSupplier(\'' + s.id + '\')"><i class="ph-light ph-pencil-simple"></i></button></td>' +
                '</tr>';
              }).join('') +
            '</tbody></table></div>' :
          emptyState('ph-factory', 'No suppliers yet', 'Add your first supplier')
        );
    }).catch(function (e) { area.innerHTML = errBanner(e); });
  }

  window._mcNewSupplier  = function () { showSupplierModal(null); };
  window._mcEditSupplier = function (id) { suppliersRef.doc(id).get().then(function (doc) { if (doc.exists) showSupplierModal(d2o(doc)); }); };

  function showSupplierModal(s) {
    var isEdit    = !!s;
    var statuses  = ['Prospecting','Contacted','Sampling','Confirmed','Active','Paused','Dropped'];
    window._mountModal(
      '<div class="modal modal-sm">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">' + (isEdit ? 'Edit Supplier' : 'Add Supplier') + '</div>' +
        '<button class="modal-close" onclick="window._closeModal()"><i class="ph-light ph-x"></i></button>' +
        '<div class="form-group"><label>Name</label><input id="sp-name" value="' + esc(s ? s.name : '') + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Country</label><input id="sp-country" value="' + esc(s ? s.country : '') + '"></div>' +
          '<div class="form-group"><label>Category</label><input id="sp-cat" value="' + esc(s ? s.category : '') + '" placeholder="Leather, Packaging…"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>MOQ</label><input id="sp-moq" value="' + esc(s ? s.moq : '') + '"></div>' +
          '<div class="form-group"><label>Lead Time</label><input id="sp-lead" value="' + esc(s ? s.leadTime : '') + '" placeholder="e.g. 6–8 weeks"></div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Status</label><select id="sp-status">' +
            statuses.map(function (st) { return '<option' + (s && s.status === st ? ' selected' : '') + '>' + st + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea id="sp-notes">' + esc(s ? (s.notes || '') : '') + '</textarea></div>' +
        '<div style="padding:0 16px 20px;display:flex;gap:8px;justify-content:flex-end;">' +
          (isEdit ? '<button class="btn btn-danger btn-sm" onclick="window._mcDelSupplier(\'' + s.id + '\')">Delete</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="window._closeModal()">Cancel</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._mcSaveSupplier(\'' + (isEdit ? s.id : '') + '\')">' + (isEdit ? 'Save' : 'Add') + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  window._mcSaveSupplier = function (id) {
    var data = {
      name: (safeEl('sp-name') || {}).value || '', country: (safeEl('sp-country') || {}).value || '',
      category: (safeEl('sp-cat') || {}).value || '', moq: (safeEl('sp-moq') || {}).value || '',
      leadTime: (safeEl('sp-lead') || {}).value || '', status: (safeEl('sp-status') || {}).value || 'Prospecting',
      notes: (safeEl('sp-notes') || {}).value || '', updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var op = id ? suppliersRef.doc(id).update(data) : suppliersRef.add(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    op.then(function () { window._closeModal(); showToast(id ? 'Saved' : 'Added'); window._mcGo('suppliers'); })
      .catch(function (e) { showToast(e.message, 'error'); });
  };

  window._mcDelSupplier = function (id) {
    if (!confirm('Delete supplier?')) return;
    suppliersRef.doc(id).delete().then(function () { window._closeModal(); showToast('Deleted'); window._mcGo('suppliers'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     VIEW: NOTES
  ══════════════════════════════════════════════════════════════════════════ */
  function viewNotes(area) {
    notesRef.orderBy('createdAt', 'desc').limit(60).get().then(function (snap) {
      var notes = snap.docs.map(d2o);
      var tags  = ['General','Product','Packaging','Campaign','Supplier','Collection','Launch'];
      area.innerHTML =
        '<div class="mc-view-hdr">' +
          '<div><div class="mc-view-title">Founder Notes</div><div class="mc-view-sub">Ideas, decisions, observations</div></div>' +
        '</div>' +
        '<div class="note-compose">' +
          '<textarea id="note-input" class="note-textarea" placeholder="Packaging direction should feel more minimal. Considering switching to matte kraft…"></textarea>' +
          '<div class="note-footer">' +
            '<select id="note-tag" class="note-tag-sel">' + tags.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
            '<button class="mc-btn-primary" onclick="window._mcSaveNote()"><i class="ph-light ph-pencil-line"></i> Save</button>' +
          '</div>' +
        '</div>' +
        (notes.length ?
          '<div class="notes-feed">' +
            notes.map(function (n) {
              var d  = n.createdAt ? (n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt)) : new Date();
              var ts = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return '<div class="note-card">' +
                '<div class="note-card-hdr">' +
                  (n.tag && n.tag !== 'General' ? '<span class="note-tag-badge">' + esc(n.tag) + '</span>' : '') +
                  '<span class="note-ts">' + ts + '</span>' +
                  '<button class="mc-icon-btn" onclick="window._mcDelNote(\'' + n.id + '\')"><i class="ph-light ph-trash"></i></button>' +
                '</div>' +
                '<div class="note-body">' + esc(n.text || '') + '</div>' +
              '</div>';
            }).join('') +
          '</div>' :
          emptyState('ph-notebook-text', 'No notes yet', 'Start capturing ideas and decisions')
        );
    }).catch(function (e) { area.innerHTML = errBanner(e); });
  }

  window._mcSaveNote = function () {
    var text = ((safeEl('note-input') || {}).value || '').trim();
    if (!text) { showToast('Write something first', 'error'); return; }
    notesRef.add({ text: text, tag: (safeEl('note-tag') || {}).value || 'General', createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { showToast('Saved'); window._mcGo('notes'); })
      .catch(function (e) { showToast(e.message, 'error'); });
  };

  window._mcDelNote = function (id) {
    if (!confirm('Delete note?')) return;
    notesRef.doc(id).delete().then(function () { showToast('Deleted'); window._mcGo('notes'); });
  };

  /* ══════════════════════════════════════════════════════════════════════════
     ORDERS CHART — preserved exactly from original
  ══════════════════════════════════════════════════════════════════════════ */
  window._dashToggleBrand = function (key) {
    _brandFilters[key] = !_brandFilters[key];
    var btn = safeEl('dash-toggle-' + key.replace(/\s/g, '-'));
    if (btn) btn.classList.toggle('active', _brandFilters[key]);
    buildChart(_allOrders);
  };

  function buildDayLabels() {
    var days = {}, now = Date.now(), DAY = 86400000;
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now - i * DAY);
      var k = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
      days[k] = k;
    }
    return Object.keys(days);
  }

  function buildChart(orders) {
    var canvas = safeEl('orders-chart');
    if (!canvas || !window.Chart) return;
    if (window._analyticsChart) { window._analyticsChart.destroy(); window._analyticsChart = null; }
    var labels = buildDayLabels();
    var bdd = {}, bdo = {};
    BRANDS.forEach(function (b) {
      bdd[b.key] = {}; bdo[b.key] = {};
      labels.forEach(function (l) { bdd[b.key][l] = 0; bdo[b.key][l] = []; });
    });
    orders.forEach(function (o) {
      if (!o.createdAt) return;
      var d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      var lbl = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
      var key = (BRANDS.find(function (b) { return b.key === (o.brand || '').toUpperCase(); }) || BRANDS[0]).key;
      if (bdd[key][lbl] === undefined) return;
      bdd[key][lbl]++; bdo[key][lbl].push(o);
    });
    window._dashBrandDayOrders = bdo;
    window._dashLabels = labels;
    var datasets = BRANDS.filter(function (b) { return _brandFilters[b.key]; }).map(function (b) {
      return { label: b.key, data: labels.map(function (l) { return bdd[b.key][l]; }), borderColor: b.color, backgroundColor: b.bg, borderWidth: 1.5, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: b.color, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 };
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
        onClick: function (evt, elements) { if (elements && elements.length) window._dashOpenDayPopup(labels[elements[0].index]); }
      }
    });
  }

  window._dashOpenDayPopup = function (dayLabel) {
    var popup = safeEl('dash-day-popup'), titleEl = safeEl('dash-popup-title'), bodyEl = safeEl('dash-popup-body');
    if (!popup || !titleEl || !bodyEl) return;
    var all = [];
    var bdo = window._dashBrandDayOrders || {};
    BRANDS.forEach(function (b) { (bdo[b.key] && bdo[b.key][dayLabel] || []).forEach(function (o) { all.push(Object.assign({ _color: b.color }, o)); }); });
    titleEl.textContent = dayLabel;
    bodyEl.innerHTML = all.length ? all.map(function (o) {
      var oid = (o.orderId || o.id || '—').toString().slice(-6).toUpperCase();
      return '<div class="dash-popup-row">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
          '<span class="dash-popup-brand-dot" style="background:' + o._color + ';"></span>' +
          '<div><div class="dash-popup-order-id">#' + esc(oid) + '</div>' +
            '<div class="dash-popup-customer">' + esc(o.customerName || o.email || 'Customer') + '</div></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">' +
          '<span class="dash-popup-amount">' + (o.subtotal != null ? 'R' + Number(o.subtotal).toFixed(2) : '—') + '</span>' +
          '<span class="badge badge-' + esc(o.status || 'pending') + '">' + esc(o.status || 'pending') + '</span>' +
        '</div></div>';
    }).join('') :
    '<div class="dash-popup-empty"><i class="ph-light ph-receipt" style="font-size:22px;opacity:.2;"></i><span>No orders on this day</span></div>';
    popup.style.display = 'block';
    requestAnimationFrame(function () { popup.classList.add('open'); });
  };

  window._dashClosePopup = function () {
    var popup = safeEl('dash-day-popup');
    if (!popup) return;
    popup.classList.remove('open');
    setTimeout(function () { popup.style.display = 'none'; }, 220);
  };

  document.addEventListener('click', function (e) {
    var popup = safeEl('dash-day-popup');
    if (!popup || popup.style.display === 'none') return;
    if (!popup.contains(e.target) && !e.target.closest('#orders-chart')) window._dashClosePopup();
  });

  /* ══════════════════════════════════════════════════════════════════════════
     SHARED HELPERS
  ══════════════════════════════════════════════════════════════════════════ */
  function d2o(doc) { return Object.assign({ id: doc.id }, doc.data()); }

  function dsLabel(text) {
    return '<div class="ds-section-label">' + text + '</div>';
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

  function errBanner(e) {
    return '<div class="mc-err"><i class="ph-light ph-warning"></i> ' + esc(e ? e.message : 'Error loading data') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('mc-styles')) return;
    var s = document.createElement('style');
    s.id  = 'mc-styles';
    s.textContent = `

/* ── SHELL ────────────────────────────────────────────────────────── */
.mc-shell {
  display: flex;
  align-items: flex-start;
  min-height: calc(100vh - var(--nav-h));
  width: 100%;
}
.mc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
}
#mc-area {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 16px 16px 80px;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* ── SIDE NAV ─────────────────────────────────────────────────────── */
.mc-sidenav {
  width: 192px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0 8px 24px;
  position: sticky;
  top: var(--nav-h);
  height: calc(100vh - var(--nav-h));
  overflow-y: auto;
  z-index: 5;
}
@media(max-width:1023px) { .mc-sidenav { display: none; } }

.mc-sidenav-top {
  padding: 16px 6px 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 8px;
}
.mc-sidenav-word {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .2em;
  color: var(--muted2);
  text-transform: uppercase;
}
.mc-sidenav-date {
  font-size: 10px;
  color: var(--muted);
  margin-top: 3px;
  letter-spacing: .06em;
  font-weight: 500;
}
.mc-snav-btn {
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
  white-space: nowrap;
}
.mc-snav-btn:hover  { background: var(--bg); color: var(--text); }
.mc-snav-btn.mc-on  { background: var(--bg); color: var(--text); font-weight: 500; }
.mc-snav-btn i { font-size: 16px; width: 18px; flex-shrink: 0; opacity: .45; }
.mc-snav-btn.mc-on i { opacity: 1; }

/* ── MOBILE NAV ───────────────────────────────────────────────────── */
.mc-mnav {
  display: none;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 12px 0 10px;
  border-bottom: 0.5px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}
.mc-mnav::-webkit-scrollbar { display: none; }
@media(max-width:1023px) { .mc-mnav { display: flex; } }

.mc-mpill {
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
.mc-mpill:first-child { margin-left: 0; }
.mc-mpill.mc-on {
  background: var(--text);
  border-color: var(--text);
  color: #fff;
  font-weight: 500;
}

/* ── LOADING / ERROR ──────────────────────────────────────────────── */
.mc-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px;
  font-size: 22px;
  color: var(--muted2);
}
.mc-spin { animation: mcSpin .75s linear infinite; display: inline-block; }
@keyframes mcSpin { to { transform: rotate(360deg); } }
.mc-err {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--r-sm);
  font-size: 12.5px;
}

/* ── SECTION LABEL ────────────────────────────────────────────────── */
.ds-section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--muted2);
  margin: 18px 0 8px;
  padding: 0 2px;
}
.ds-section-label:first-child { margin-top: 0; }

/* ── VIEW HEADER ──────────────────────────────────────────────────── */
.mc-view-hdr {
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

/* ── BUTTONS ──────────────────────────────────────────────────────── */
.mc-btn-primary {
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
.mc-btn-primary:active { opacity: .8; }
.mc-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--accent);
  padding: 2px 0;
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

/* ── CARDS ────────────────────────────────────────────────────────── */
.mc-card { background: var(--surface); border-radius: var(--r); border: 0.5px solid var(--border); overflow: hidden; box-shadow: var(--shadow-xs); }
.mc-card-hdr { padding: 11px 16px; display: flex; align-items: center; border-bottom: 0.5px solid var(--border); flex-wrap: wrap; gap: 8px; }
.mc-card-ttl { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }

/* ── EMPTY STATE ──────────────────────────────────────────────────── */
.mc-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 20px; gap: 8px; }
.mc-empty i { font-size: 28px; opacity: .18; }
.mc-empty-title { font-size: 15px; font-weight: 300; color: var(--text); }
.mc-empty-sub { font-size: 12px; color: var(--muted); max-width: 260px; line-height: 1.55; }

/* ── TABLE ────────────────────────────────────────────────────────── */
.mc-table-wrap { background: var(--surface); border-radius: var(--r); border: 0.5px solid var(--border); overflow: hidden; overflow-x: auto; box-shadow: var(--shadow-xs); }
.mc-table { width: 100%; border-collapse: collapse; min-width: 500px; }
.mc-table thead tr { border-bottom: 0.5px solid var(--border); }
.mc-table th { padding: 9px 14px; font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); text-align: left; white-space: nowrap; background: var(--surface2); }
.mc-table td { padding: 10px 14px; font-size: 12.5px; border-bottom: 0.5px solid rgba(0,0,0,0.04); vertical-align: middle; }
.mc-table tbody tr:last-child td { border-bottom: none; }
.mc-table tbody tr { cursor: pointer; transition: background .1s; }
.mc-table tbody tr:hover { background: var(--surface2); }

/* ══ DASHBOARD SECTIONS ═══════════════════════════════════════════════ */

/* ── A: READINESS HERO ────────────────────────────────────────────── */
.ds-readiness-hero {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 20px;
  margin-bottom: 4px;
  box-shadow: var(--shadow-xs);
  position: relative;
  overflow: hidden;
}
.ds-readiness-hero::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent) 0%, #60a5fa 100%);
}
.ds-rh-top {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.ds-rh-left { flex: 1; min-width: 200px; }
.ds-rh-right { flex: 1; min-width: 200px; }
.ds-rh-eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--muted2);
  margin-bottom: 8px;
}
.ds-rh-score {
  font-family: var(--font);
  font-size: 64px;
  font-weight: 200;
  color: var(--text);
  line-height: 1;
  letter-spacing: -.04em;
}
.ds-rh-unit { font-size: 24px; font-weight: 300; opacity: .4; letter-spacing: 0; }
.ds-rh-sub { font-size: 12px; color: var(--muted); margin: 6px 0 12px; font-weight: 300; }
.ds-rh-bar-wrap {
  height: 4px;
  background: var(--border-med);
  border-radius: 2px;
  overflow: hidden;
  max-width: 240px;
}
.ds-rh-bar {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), #60a5fa);
  transition: width .8s cubic-bezier(.32,.72,0,1);
}
.ds-subscore-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.ds-subscore-card {
  background: var(--surface2);
  border: 0.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 10px 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ds-subscore-pct { font-size: 18px; font-weight: 200; line-height: 1; font-family: var(--font); }
.ds-subscore-label { font-size: 9px; color: var(--muted); margin-top: 3px; font-weight: 600; letter-spacing: .05em; }
.ds-brand-scores { display: flex; flex-direction: column; gap: 7px; }
.ds-brand-score-row { display: flex; align-items: center; gap: 8px; }
.ds-brand-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.ds-brand-score-name { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; color: var(--text2); width: 72px; flex-shrink: 0; }
.ds-brand-score-track { flex: 1; height: 4px; background: var(--border-med); border-radius: 2px; overflow: hidden; }
.ds-brand-score-fill { height: 100%; border-radius: 2px; transition: width .7s cubic-bezier(.32,.72,0,1); }
.ds-brand-score-pct { font-size: 10.5px; font-weight: 600; color: var(--text2); width: 30px; text-align: right; flex-shrink: 0; }

/* ── B: READY TO SELL ─────────────────────────────────────────────── */
.ds-ready-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.ds-ready-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.ds-ready-row:last-child { border-bottom: none; }
.ds-ready-row:active { background: var(--surface2); }
.ds-ready-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ds-ready-info { flex: 1; min-width: 0; }
.ds-ready-name { font-size: 13px; font-weight: 400; color: var(--text); }
.ds-ready-brand { font-size: 10.5px; color: var(--muted); margin-top: 1px; letter-spacing: .04em; }
.ds-ready-price { font-size: 13px; font-weight: 500; color: var(--text); flex-shrink: 0; }
.ds-live-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .06em;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--success-soft);
  color: var(--success);
  flex-shrink: 0;
}
.ds-empty-gentle {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
  font-size: 12.5px;
  color: var(--muted);
  box-shadow: var(--shadow-xs);
}
.ds-empty-gentle i { font-size: 20px; opacity: .3; flex-shrink: 0; }

/* ── C: BLOCKERS ──────────────────────────────────────────────────── */
.ds-blockers {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.ds-blocker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.ds-blocker-row:last-child { border-bottom: none; }
.ds-blocker-row:active { background: var(--surface2); }
.ds-blocker-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.ds-blocker-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ds-blocker-info { min-width: 0; }
.ds-blocker-name { font-size: 13px; font-weight: 400; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ds-blocker-brand { font-size: 10.5px; color: var(--muted); margin-top: 1px; letter-spacing: .04em; }
.ds-blocker-tags { display: flex; gap: 5px; flex-wrap: wrap; flex-shrink: 0; }
.ds-blocker-tag {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: .04em;
  padding: 2px 7px;
  border-radius: 20px;
  border: 1px solid;
  white-space: nowrap;
}
.ds-blocker-arrow { font-size: 15px; color: var(--muted2); flex-shrink: 0; }

/* ── D: NEXT BEST ACTION ──────────────────────────────────────────── */
.ds-nba-card {
  background: var(--surface);
  border: 0.5px solid rgba(26,86,219,0.2);
  border-left: 3px solid var(--accent);
  border-radius: var(--r);
  padding: 16px 18px;
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: box-shadow .15s;
}
.ds-nba-card:active { box-shadow: var(--shadow-md); }
.ds-nba-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 7px;
}
.ds-nba-text {
  font-size: 13.5px;
  color: var(--text);
  line-height: 1.55;
  font-weight: 300;
}
.ds-nba-footer { margin-top: 12px; }
.ds-nba-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: .02em;
}

/* ── E: INCOMING ──────────────────────────────────────────────────── */
.ds-incoming-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.ds-incoming-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background .1s;
}
.ds-incoming-row:last-child { border-bottom: none; }
.ds-incoming-row:active { background: var(--surface2); }
.ds-incoming-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
.ds-incoming-info { flex: 1; min-width: 0; }
.ds-incoming-name { font-size: 13px; font-weight: 400; color: var(--text); }
.ds-incoming-type { font-size: 11px; color: var(--muted); margin-top: 1px; }
.ds-incoming-when { font-size: 11px; font-weight: 600; flex-shrink: 0; white-space: nowrap; }

/* ── F: DEADLINES ─────────────────────────────────────────────────── */
.ds-deadlines {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.ds-deadline-card {
  flex: 1;
  min-width: 110px;
  background: var(--surface);
  border: 1px solid;
  border-radius: var(--r-sm);
  padding: 12px 14px;
  box-shadow: var(--shadow-xs);
}
.ds-deadline-date { font-size: 10px; font-weight: 700; letter-spacing: .07em; margin-bottom: 4px; }
.ds-deadline-title { font-size: 12.5px; font-weight: 400; color: var(--text); line-height: 1.35; margin-bottom: 5px; }
.ds-deadline-days { font-size: 20px; font-weight: 200; font-family: var(--font); line-height: 1; letter-spacing: -.02em; }

/* ── G: WAITING ───────────────────────────────────────────────────── */
.ds-waiting-list {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.ds-waiting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.04);
}
.ds-waiting-row:last-child { border-bottom: none; }
.ds-waiting-row.urgent { background: rgba(192,57,43,0.03); }
.ds-waiting-text { flex: 1; font-size: 12.5px; color: var(--text); }
.ds-waiting-age { font-size: 10.5px; color: var(--muted2); flex-shrink: 0; font-weight: 500; }
.ds-waiting-age.urgent { color: var(--danger); font-weight: 700; }
.ds-resolve-btn {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--success);
  background: var(--success-soft);
  border: none;
  border-radius: 6px;
  padding: 3px 9px;
  cursor: pointer;
  font-family: var(--font);
  flex-shrink: 0;
  transition: opacity .12s;
}
.ds-resolve-btn:active { opacity: .7; }

/* ══ COLLECTIONS ══════════════════════════════════════════════════════ */
.coll-brand-block { margin-bottom: 24px; }
.coll-brand-hdr {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-bottom: 9px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 10px;
}
.coll-brand-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.coll-brand-name { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; flex: 1; }
.coll-brand-pct { font-size: 11.5px; font-weight: 600; }
.coll-brand-count { font-size: 11px; color: var(--muted); }
.coll-table-wrap { background: var(--surface); border: 0.5px solid var(--border); border-radius: var(--r); overflow: hidden; overflow-x: auto; box-shadow: var(--shadow-xs); }
.coll-table { width: 100%; border-collapse: collapse; min-width: 400px; }
.coll-table thead tr { border-bottom: 0.5px solid var(--border); }
.coll-table th { padding: 8px 14px; font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); text-align: left; background: var(--surface2); }
.coll-table td { padding: 11px 14px; border-bottom: 0.5px solid rgba(0,0,0,0.04); font-size: 12.5px; vertical-align: middle; }
.coll-row { cursor: pointer; transition: background .1s; }
.coll-row:hover { background: var(--surface2); }
.coll-row:last-child td { border-bottom: none; }
.coll-row-ready td:first-child { border-left: 2.5px solid #1a8742; }
.coll-prod-name { font-size: 13px; font-weight: 400; color: var(--text); }
.coll-prod-price { font-size: 11px; color: var(--muted); margin-top: 2px; }
.coll-check { color: #1a8742; font-size: 14px; font-weight: 700; }
.coll-cross { color: #c0392b; font-size: 14px; font-weight: 700; opacity: .7; }
.coll-score-pill { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: var(--surface3); color: var(--muted); display: inline-block; }
.coll-score-pill.ready { background: var(--success-soft); color: var(--success); }
.coll-empty { font-size: 12px; color: var(--muted); padding: 12px 0; }

/* ══ PROJECTS ════════════════════════════════════════════════════════ */
.proj-brand-group { margin-bottom: 22px; }
.proj-brand-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 10px;
}
.proj-brand-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.proj-brand-lbl { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; flex: 1; }
.proj-brand-ct { font-size: 11px; color: var(--muted); }
.proj-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.proj-card {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  cursor: pointer;
  transition: box-shadow .15s;
  box-shadow: var(--shadow-xs);
}
.proj-card:active { box-shadow: var(--shadow-md); }
.proj-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.proj-card-type { font-size: 9.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--muted2); margin-bottom: 3px; }
.proj-card-name { font-size: 13.5px; font-weight: 400; color: var(--text); line-height: 1.35; }
.proj-card-date { font-size: 12px; font-weight: 700; flex-shrink: 0; }
.proj-track-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.proj-track { flex: 1; height: 3px; background: var(--border-med); border-radius: 2px; overflow: hidden; }
.proj-fill { height: 100%; border-radius: 2px; transition: width .5s cubic-bezier(.32,.72,0,1); }
.proj-pct { font-size: 10.5px; font-weight: 600; color: var(--muted); flex-shrink: 0; }
.proj-next { font-size: 11px; color: var(--muted); }
.proj-brand-empty { font-size: 12px; color: var(--muted); padding: 10px 0; }
.pj-stages-list { display: flex; flex-direction: column; gap: 6px; background: var(--surface2); border: 0.5px solid var(--border); border-radius: var(--r-xs); padding: 10px 12px; max-height: 220px; overflow-y: auto; }
.pj-stage-row { display: flex; align-items: center; gap: 9px; }
.pj-stage-name { font-size: 12.5px; color: var(--text2); }

/* ══ NOTES ═══════════════════════════════════════════════════════════ */
.note-compose { background: var(--surface); border: 0.5px solid var(--border); border-radius: var(--r); padding: 14px; margin-bottom: 14px; box-shadow: var(--shadow-xs); }
.note-textarea { width: 100%; background: var(--surface2); border: 0.5px solid var(--border-med); border-radius: var(--r-sm); padding: 11px 13px; font-family: var(--font); font-size: 13px; color: var(--text); resize: vertical; min-height: 80px; outline: none; transition: border-color .18s; box-sizing: border-box; }
.note-textarea:focus { border-color: rgba(26,86,219,.35); }
.note-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; gap: 8px; }
.note-tag-sel { background: var(--surface2); border: 0.5px solid var(--border-med); border-radius: var(--r-xs); padding: 7px 10px; font-family: var(--font); font-size: 12px; color: var(--text2); outline: none; }
.notes-feed { display: flex; flex-direction: column; gap: 8px; }
.note-card { background: var(--surface); border: 0.5px solid var(--border); border-radius: var(--r); padding: 13px 14px; box-shadow: var(--shadow-xs); }
.note-card-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.note-tag-badge { font-size: 9.5px; font-weight: 700; letter-spacing: .07em; padding: 2px 8px; border-radius: 20px; background: var(--accent-soft); color: var(--accent); }
.note-ts { font-size: 10.5px; color: var(--muted2); flex: 1; }
.note-body { font-size: 13px; color: var(--text); line-height: 1.55; font-weight: 300; }

/* ══ MOBILE OVERRIDES ════════════════════════════════════════════════ */
@media(max-width: 767px) {
  #mc-area { padding: 14px 14px 80px; }

  /* Hero stacks */
  .ds-rh-top { flex-direction: column; gap: 16px; }
  .ds-rh-left, .ds-rh-right { min-width: 0; width: 100%; }
  .ds-rh-score { font-size: 52px; }
  .ds-rh-bar-wrap { max-width: 100%; }

  /* Subscores 2x2 on small */
  .ds-subscore-grid { grid-template-columns: repeat(2, 1fr); }

  /* Deadlines scroll horizontal */
  .ds-deadlines { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
  .ds-deadlines::-webkit-scrollbar { display: none; }
  .ds-deadline-card { min-width: 110px; flex-shrink: 0; }

  /* Projects single column */
  .proj-cards { grid-template-columns: 1fr; }

  /* Blocker tags wrap */
  .ds-blocker-tags { max-width: 140px; }

  /* Brand score name shorter */
  .ds-brand-score-name { width: 60px; font-size: 9.5px; }
}

    `;
    document.head.appendChild(s);
  }

})();
