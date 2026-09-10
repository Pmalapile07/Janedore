(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc       = window._esc;
  var safeEl    = window._safeEl;
  var showToast = window._showToast;
  var db        = window._adminDB;

  var pagesRef = db.collection('pages');
  window._pagesRef = pagesRef;

  // Slugs match the footer.js "policies" and "help" links exactly —
  // keep these two lists in sync if a footer link is ever renamed.
  var PAGE_GROUPS = [
    { group: 'Policies', items: [
      { slug: 'about',             label: 'About' },
      { slug: 'shipping-policy',   label: 'Shipping Policy' },
      { slug: 'return-policy',     label: 'Return Policy' },
      { slug: 'privacy-policy',    label: 'Privacy Policy' },
      { slug: 'terms-conditions',  label: 'Terms & Conditions' }
    ]},
    { group: 'Help', items: [
      { slug: 'faq',         label: 'FAQ' },
      { slug: 'size-guide',  label: 'Size Guide' },
      { slug: 'shipping',    label: 'Shipping' },
      { slug: 'returns',     label: 'Returns' },
      { slug: 'contact',     label: 'Contact' }
    ]}
  ];

  var _pagesData = {}; // slug -> { title, content, updatedAt }

  function loadPagesData() {
    return pagesRef.get().then(function(snapshot) {
      _pagesData = {};
      snapshot.docs.forEach(function(d) { _pagesData[d.id] = d.data(); });
    }).catch(function(e) {
      showToast('Error loading pages: ' + e.message, 'error');
    });
  }

  window._renderPagesTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    loadPagesData().then(renderPagesList);
  };

  function renderPagesList() {
    var mc = safeEl('main-content');
    if (!mc) return;

    var groupsHtml = PAGE_GROUPS.map(function(g) {
      var rowsHtml = g.items.map(function(item) {
        var data = _pagesData[item.slug];
        var hasContent = !!(data && data.content && data.content.trim());
        return '<div class="product-row" onclick="window._openPageForm(\'' + esc(item.slug) + '\')" style="cursor:pointer;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="pi-name">' + esc(item.label) + '</div>' +
            '<div class="pi-meta">/pages/' + esc(item.slug) + '</div>' +
          '</div>' +
          '<span class="badge badge-' + (hasContent ? 'active' : 'draft') + '">' + (hasContent ? 'Published' : 'Empty') + '</span>' +
        '</div>';
      }).join('');

      return '<div class="card" style="margin-bottom:12px;">' +
        '<div class="card-header"><span class="card-title">' + esc(g.group) + '</span></div>' +
        '<div class="product-list">' + rowsHtml + '</div>' +
      '</div>';
    }).join('');

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Pages</div>' +
      '</div>' +
      groupsHtml;
  }

  window._openPageForm = function(slug) {
    var allItems = PAGE_GROUPS.reduce(function(acc, g) { return acc.concat(g.items); }, []);
    var item = allItems.find(function(i) { return i.slug === slug; });
    if (!item) { showToast('Page not found', 'error'); return; }
    var data = _pagesData[slug] || {};

    var mc = safeEl('main-content');
    if (!mc) return;

    mc.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<button type="button" class="btn btn-ghost" onclick="window._renderPagesTab()"><i class="ph-light ph-arrow-left" style="margin-right:4px;"></i> Cancel</button>' +
        '<div style="font-size:13px;font-weight:500;color:var(--text);">' + esc(item.label) + '</div>' +
        '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'page-form\').requestSubmit()"><i class="ph-light ph-check" style="margin-right:4px;"></i> Save</button>' +
      '</div>' +

      '<form id="page-form" onsubmit="window._handlePageSubmit(event,\'' + esc(slug) + '\')">' +
        '<div class="card" style="margin-bottom:12px;">' +
          '<div class="card-header"><span class="card-title">Content</span></div>' +
          '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">' +
            '<div class="form-group" style="padding:0;"><label>Title</label><input name="title" value="' + esc(data.title || item.label) + '" required></div>' +
            '<div class="form-group" style="padding:0;"><label>Body <span style="font-size:10px;color:var(--muted);">— HTML supported</span></label><textarea name="content" style="min-height:280px;">' + esc(data.content || '') + '</textarea></div>' +
          '</div>' +
        '</div>' +
      '</form>';
  };

  window._handlePageSubmit = function(e, slug) {
    e.preventDefault();
    var form = e.target;
    var data = {
      title: form.title.value,
      content: form.content.value,
      updatedAt: new Date().toISOString()
    };
    pagesRef.doc(slug).set(data, { merge: true }).then(function() {
      _pagesData[slug] = data;
      showToast('Page saved');
      window._renderPagesTab();
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

})();
