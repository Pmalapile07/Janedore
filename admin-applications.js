/* ─────────────────────────────────────────────────────────
   APPLICATIONS — brand partner applications from
   /pages/partner-application. Read and updated through
   partner-applications-api.js (/api/admin/partner-applications), which
   checks the caller's role, so no Firestore rules change is needed.
   Only Super Admin sees this tab and decides:
   Mark under review, then Accept, Accept with conditions (a list of
   what the brand must change) or Decline. The brand is emailed on
   every decision; from Accept with conditions you can still Accept or
   Decline once they have made the changes.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;

  var apps = [];
  var role = '';
  var filter = 'open';
  var openId = null;

  var STATUS = {
    received:     ['New', 'pending'],
    under_review: ['Under review', 'processing'],
    conditional:  ['Accepted with conditions', 'refund_pending'],
    accepted:     ['Accepted', 'fulfilled'],
    declined:     ['Declined', 'cancelled']
  };
  var OPEN = ['received', 'under_review', 'conditional'];

  function api(path, opts) {
    var user = window._currentUser;
    if (!user || !user.getIdToken) return Promise.reject(new Error('Not signed in'));
    return user.getIdToken().then(function (token) {
      opts = opts || {};
      opts.headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {});
      return fetch(path, opts);
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  window._renderApplicationsTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;">Loading...</div>';
    api('/api/admin/partner-applications').then(function (data) {
      apps = data.applications || [];
      role = data.role || '';
      draw();
    }).catch(function (e) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load applications: ' + esc(e.message) + '</div></div>';
    });
  };

  function draw() {
    var mc = safeEl('main-content');
    if (!mc || window._currentTab !== 'applications') return;
    var counts = { open: 0, done: 0, all: apps.length };
    apps.forEach(function (a) { counts[OPEN.indexOf(a.status) !== -1 ? 'open' : 'done']++; });
    var shown = apps.filter(function (a) {
      var isOpen = OPEN.indexOf(a.status) !== -1;
      return filter === 'all' || (filter === 'open' ? isOpen : !isOpen);
    });
    var tabs = [['open', 'Open'], ['done', 'Decided'], ['all', 'All']].map(function (t) {
      return '<button class="reports-filter' + (filter === t[0] ? ' active' : '') + '" onclick="window._setApplicationsFilter(\'' + t[0] + '\')">' + t[1] + ' <span>' + counts[t[0]] + '</span></button>';
    }).join('');
    var list = shown.length ? shown.map(card).join('') :
      '<div class="empty-state"><div class="empty-state-text">' + (filter === 'open'
        ? 'No open applications. When a brand applies on Brand Partnerships, it shows up here and in your email.' : 'Nothing here yet.') + '</div></div>';
    mc.innerHTML = '<div class="reports-page returns-admin">' +
      '<div class="section-header" style="margin-bottom:10px;"><div class="section-title">Applications</div></div>' +
      '<div class="reports-filters">' + tabs + '</div>' + list + '</div>';
  }

  function section(title, html) {
    return '<div class="return-admin-section"><div class="return-admin-title">' + esc(title) + '</div>' + html + '</div>';
  }

  function card(a) {
    var st = STATUS[a.status] || [a.status, 'muted'];
    var expanded = openId === a.id;
    var head = '<div class="report-card-head return-card-head" onclick="window._toggleApplication(\'' + esc(a.id) + '\')">' +
      '<div><div class="report-brand">' + esc(a.brandName) + ' · ' + esc(a.reference || a.id) + '</div>' +
      '<div class="report-reason">' + esc((a.categories || []).join(', ')) + ' · ' + esc(a.priceBand || '') + ' · ' + esc(a.location || '') + '</div>' +
      '<div class="report-meta">' + esc(fmtDate(a.createdAt)) + ' · ' + esc(a.contactName || '') + '</div></div>' +
      '<span class="badge badge-' + esc(st[1]) + '">' + esc(st[0]) + '</span>' +
    '</div>';
    if (!expanded) return '<div class="card report-card return-card">' + head + '</div>';

    var link = function (url, label) { return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label || url) + '</a>'; };
    var ig = (a.instagram || '').replace(/^@/, '');
    var brand = '<div class="report-details">' +
      (a.website ? 'Website: ' + link(a.website) + '<br>' : '') +
      (ig ? 'Instagram: ' + link('https://instagram.com/' + ig, '@' + ig) + '<br>' : '') +
      'Based in: ' + esc(a.location || '') + (a.founded ? ' · Founded ' + esc(a.founded) : '') + '<br>' +
      'Categories: ' + esc((a.categories || []).join(', ')) + '<br>Average price: ' + esc(a.priceBand || '') +
      '<br><br><span class="return-pre">' + esc(a.story || '') + '</span></div>';
    var ops = '<div class="report-details">Channels: ' + esc((a.channels || []).join(', ')) + '<br>Range: ' + esc(a.rangeSize || '') + '<br>Fulfilment: ' + esc(a.fulfilment || '') +
      (a.goals ? '<br><br><span class="return-pre">' + esc(a.goals) + '</span>' : '') + '</div>';
    var images = (a.images || []).map(function (u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener" class="return-admin-photo" style="background-image:url(\'' + esc(u) + '\')"></a>';
    }).join('');
    var contact = '<div class="report-details">' + esc(a.contactName || '') + (a.role ? ', ' + esc(a.role) : '') +
      '<br><a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a><br>' + esc(a.phone || '') + '</div>';
    var decision = '';
    if (a.status === 'conditional' && (a.conditions || []).length) {
      decision = section('Conditions sent to the brand', '<ol class="app-admin-conditions">' + a.conditions.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' +
        (a.decisionMessage ? '<div class="report-details return-pre">' + esc(a.decisionMessage) + '</div>' : ''));
    } else if ((a.status === 'accepted' || a.status === 'declined') && a.decisionMessage) {
      decision = section('Note sent to the brand', '<div class="report-details return-pre">' + esc(a.decisionMessage) + '</div>');
    }
    var timeline = (a.timeline || []).slice().reverse().map(function (t) {
      return '<div class="return-admin-log"><span>' + esc(fmtDate(t.at)) + '</span> ' + esc(t.text) + (t.by ? ' <em>(' + esc(t.by) + ')</em>' : '') + '</div>';
    }).join('');

    return '<div class="card report-card return-card is-open">' + head +
      '<div class="return-admin-body">' +
        section('Brand', brand) +
        section('Sales and operations', ops) +
        (images ? section('Product imagery', '<div class="return-admin-photos">' + images + '</div>') : '') +
        section('Contact', contact) +
        decision +
        actions(a) +
        section('Activity', timeline) +
      '</div></div>';
  }

  function actions(a) {
    if (role !== 'SUPER_ADMIN' || OPEN.indexOf(a.status) === -1) return '';
    var id = esc(a.id);
    var btn = function (action, label, primary) {
      return '<button class="btn btn-sm ' + (primary ? 'btn-primary' : 'btn-ghost') + '" onclick="window._applicationAction(\'' + id + '\',\'' + action + '\',this)">' + label + '</button>';
    };
    var review = a.status === 'received'
      ? '<div class="report-actions" style="margin-bottom:12px;">' + btn('review', 'Mark as under review', false) + '</div>' : '';
    var conditional = a.status === 'conditional' ? '' :
      '<label class="return-admin-radio"><strong>Accept with conditions:</strong> one condition per line</label>' +
      '<textarea class="return-admin-input" id="app-conditions-' + id + '" placeholder="e.g. Update product photography to a consistent white background\nUpgrade packaging to a branded box or dust bag"></textarea>';
    return section('Your decision',
      review +
      '<div class="return-admin-form">' +
        (a.status === 'conditional' ? '<div class="return-help">Once the brand has made the changes, Accept them. If not, Decline.</div>' : '') +
        conditional +
        '<label class="return-admin-radio"><strong>Note to the brand</strong> (optional, included in the email)</label>' +
        '<textarea class="return-admin-input" id="app-text-' + id + '" placeholder="A personal note, e.g. what you liked, or why you declined."></textarea>' +
        '<div class="report-actions">' + btn('accept', 'Accept', true) + (a.status === 'conditional' ? '' : btn('conditional', 'Accept with conditions', false)) + btn('decline', 'Decline', false) + '</div>' +
      '</div>');
  }

  window._setApplicationsFilter = function (f) { filter = f; draw(); };
  window._toggleApplication = function (id) { openId = openId === id ? null : id; draw(); };

  var CONFIRM = {
    review: 'Mark this application as under review? The brand sees this when they check their status. No email is sent.',
    accept: 'Accept this brand? They will be emailed that they have been accepted and that the team will be in touch about terms and onboarding.',
    conditional: 'Accept with conditions? The brand will be emailed the list of conditions.',
    decline: 'Decline this application? The brand will be emailed. This cannot be undone.'
  };

  window._applicationAction = function (id, action, el) {
    var payload = { action: action };
    var textEl = safeEl('app-text-' + id);
    payload.text = textEl ? textEl.value.trim() : '';
    if (action === 'conditional') {
      var condEl = safeEl('app-conditions-' + id);
      payload.conditions = (condEl ? condEl.value : '').split('\n').map(function (s) { return s.replace(/^\s*[-*\d.)]+\s*/, '').trim(); }).filter(Boolean);
      if (!payload.conditions.length) { showToast('List at least one condition, one per line.', 'error'); return; }
    }
    if (!confirm(CONFIRM[action])) return;
    if (el) el.disabled = true;
    api('/api/admin/partner-applications/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(payload) })
      .then(function (data) {
        if (data.emailFailed) showToast('Saved, but the email to the brand did not send. Please email them directly.', 'error');
        else showToast(action === 'review' ? 'Marked as under review' : 'Decision saved and emailed to the brand', 'success');
        window._renderApplicationsTab();
      })
      .catch(function (e) {
        if (el) el.disabled = false;
        showToast('Error: ' + e.message, 'error');
      });
  };
})();
