(function () {
  'use strict';
  if (!window._adminDB) return;

  var db = window._adminDB;
  var esc = window._esc || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]); }); };
  var safeEl = window._safeEl || function (id) { return document.getElementById(id); };
  var showToast = window._showToast || function (msg) { alert(msg); };
  var seoRef = db.collection('settings').doc('seo');
  var defaults = {
    metaTitle: 'JANEDORE | Curated Fashion & Independent Brands',
    metaDescription: 'Discover considered fashion, accessories, homeware and scent from JANEDORE and independent brands, curated in South Africa.',
    googleSiteVerification: '',
    instagramUrl: '',
    tiktokUrl: '',
    canonicalHost: 'https://janedore.co.za'
  };
  var current = Object.assign({}, defaults);

  function loadSeo() {
    return seoRef.get().then(function (doc) {
      if (doc.exists) current = Object.assign({}, defaults, doc.data() || {});
      return current;
    }).catch(function (e) {
      console.warn('[SEO] Could not load SEO settings:', e.message);
      return current;
    });
  }

  function field(name, label, value, hint, type) {
    return '<div class="form-group" style="padding:0;">' +
      '<label for="seo-' + name + '">' + label + '</label>' +
      (name === 'metaDescription'
        ? '<textarea id="seo-' + name + '" name="' + name + '" maxlength="320" rows="3" style="min-height:88px;">' + esc(value) + '</textarea>'
        : '<input id="seo-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value) + '" maxlength="' + (name === 'metaTitle' ? '120' : '300') + '">') +
      (hint ? '<div style="font-size:11px;color:var(--muted);margin-top:5px;">' + hint + '</div>' : '') +
      '</div>';
  }

  window._renderSeoTab = function () {
    var mc = safeEl('main-content');
    if (!mc) return;
    if (!window._isSuperAdmin || !window._isSuperAdmin()) {
      mc.innerHTML = '<div class="empty-state"><div class="empty-state-text">Only Super Admin can access SEO settings.</div></div>';
      return;
    }
    mc.innerHTML = '<div class="section-header" style="margin-bottom:16px;"><div><div class="section-title">SEO</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">Search visibility, page metadata and crawler discovery for JANEDORE.</div></div><button class="btn btn-primary" type="button" onclick="document.getElementById(\'seo-form\').requestSubmit()">Save SEO</button></div>' +
      '<form id="seo-form" onsubmit="window._saveSeoSettings(event)">' +
        '<div class="card" style="margin-bottom:12px;"><div class="card-header"><span class="card-title">Search appearance</span></div><div style="padding:16px;display:flex;flex-direction:column;gap:14px;">' +
          field('metaTitle', 'Homepage title', current.metaTitle, 'Aim for roughly 50–60 characters. This is the default title for the homepage.') +
          '<div id="seo-title-count" style="font-size:11px;color:var(--muted);margin-top:-10px;"></div>' +
          field('metaDescription', 'Homepage meta description', current.metaDescription, 'Write a useful, accurate summary in about 140–160 characters. Google may choose a different snippet.') +
          '<div id="seo-description-count" style="font-size:11px;color:var(--muted);margin-top:-10px;"></div>' +
        '</div></div>' +
        '<div class="card" style="margin-bottom:12px;"><div class="card-header"><span class="card-title">Google Search Console</span></div><div style="padding:16px;display:flex;flex-direction:column;gap:14px;">' +
          field('googleSiteVerification', 'Google site verification token', current.googleSiteVerification, 'Paste only the content/token value from Google Search Console’s HTML-tag verification method, not the whole meta tag.') +
          '<div style="font-size:12px;line-height:1.6;color:var(--muted);">After saving, deploy the changes, then open <a href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer">Google Search Console</a> and verify the domain. Sitemap submission still happens in Search Console.</div>' +
        '</div></div>' +
        '<div class="card" style="margin-bottom:12px;"><div class="card-header"><span class="card-title">Social profiles</span></div><div style="padding:16px;display:flex;flex-direction:column;gap:14px;">' +
          field('instagramUrl', 'Instagram profile URL', current.instagramUrl, 'Full public profile URL, including https://') +
          field('tiktokUrl', 'TikTok profile URL', current.tiktokUrl, 'Full public profile URL, including https://') +
        '</div></div>' +
        '<div class="card" style="margin-bottom:12px;"><div class="card-header"><span class="card-title">Crawler files</span></div><div style="padding:16px;display:flex;flex-direction:column;gap:12px;">' +
          '<div><strong style="font-size:13px;">Sitemap</strong><div style="font-size:12px;color:var(--muted);margin:4px 0 8px;">A server-generated sitemap lists the homepage and eligible published product/collection URLs. Product URLs are excluded while Coming Soon mode is enabled.</div><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">Open sitemap.xml</a> <button type="button" class="btn btn-secondary" style="margin-left:8px;" onclick="navigator.clipboard.writeText(location.origin + \'/sitemap.xml\').then(function(){window._showToast(\'Sitemap URL copied\')}).catch(function(){window._showToast(\'Copy failed\',\'error\')})">Copy URL</button></div>' +
          '<div><strong style="font-size:13px;">Robots file</strong><div style="font-size:12px;color:var(--muted);margin:4px 0 8px;">Provides crawler guidance and points search engines to the sitemap.</div><a href="/robots.txt" target="_blank" rel="noopener noreferrer">Open robots.txt</a></div>' +
          '<div style="font-size:12px;color:var(--muted);">These URLs are served by the website server. If either returns an error after deployment, the deployment needs checking before submitting to Google.</div>' +
        '</div></div>' +
        '<div class="card" style="margin-bottom:12px;"><div class="card-header"><span class="card-title">Launch SEO checks</span></div><div style="padding:16px;display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.5;">' +
          '<label style="display:flex;gap:8px;align-items:flex-start;"><input type="checkbox"> Confirm the store is live (Coming Soon mode is off) before requesting indexing of products.</label>' +
          '<label style="display:flex;gap:8px;align-items:flex-start;"><input type="checkbox"> Verify the domain in Google Search Console and submit /sitemap.xml.</label>' +
          '<label style="display:flex;gap:8px;align-items:flex-start;"><input type="checkbox"> Inspect the homepage, one collection and one product URL in URL Inspection.</label>' +
          '<label style="display:flex;gap:8px;align-items:flex-start;"><input type="checkbox"> Check mobile performance and image alt text; metadata alone does not complete SEO.</label>' +
          '<label style="display:flex;gap:8px;align-items:flex-start;"><input type="checkbox"> Review Google Search Console indexing issues after Google has crawled the site.</label>' +
        '</div></div>' +
        '<button type="submit" class="btn btn-primary" style="width:100%;margin-bottom:80px;">Save SEO Settings</button>' +
      '</form>';
    var titleEl = safeEl('seo-metaTitle');
    var descEl = safeEl('seo-metaDescription');
    function updateCounts() {
      var tc = safeEl('seo-title-count'), dc = safeEl('seo-description-count');
      if (tc && titleEl) tc.textContent = titleEl.value.length + ' characters' + (titleEl.value.length > 60 ? ' — consider shortening it.' : '');
      if (dc && descEl) dc.textContent = descEl.value.length + ' characters' + (descEl.value.length > 160 ? ' — consider shortening it.' : '');
    }
    if (titleEl) titleEl.addEventListener('input', updateCounts);
    if (descEl) descEl.addEventListener('input', updateCounts);
    updateCounts();
  };

  window._saveSeoSettings = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!window._isSuperAdmin || !window._isSuperAdmin()) return;
    var form = safeEl('seo-form');
    if (!form) return;
    var data = {
      metaTitle: String(form.metaTitle.value || '').trim().slice(0, 120),
      metaDescription: String(form.metaDescription.value || '').trim().slice(0, 320),
      canonicalHost: defaults.canonicalHost,
      googleSiteVerification: String(form.googleSiteVerification.value || '').trim().replace(/^["']|["']$/g, ''),
      instagramUrl: String(form.instagramUrl.value || '').trim(),
      tiktokUrl: String(form.tiktokUrl.value || '').trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    seoRef.set(data, { merge: true }).then(function () {
      current = Object.assign({}, current, data);
      showToast('SEO settings saved. Public metadata updates shortly after saving.');
      if (data.metaTitle) document.title = data.metaTitle;
    }).catch(function (err) {
      console.error('[SEO_SAVE]', err);
      showToast('Could not save SEO settings: ' + (err.message || 'Unknown error'), 'error');
    });
  };

  loadSeo().then(function () {
    if (window._currentTab === 'seo') window._renderSeoTab();
  });
})();