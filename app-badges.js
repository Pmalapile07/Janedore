// ==================== APP DOWNLOAD BADGES ====================
// The official App Store and Google Play badges, linking to the app's
// store pages (admin > Homepage > App download, siteContent/homepage
// .apps). Each shows only once its link is set, and nothing shows inside
// the app: not in the native app (Capacitor) nor the site saved to the
// home screen (standalone display).
// - Footer: "Get the app" with both badges (buildFooter, footer.js).
// - Phones: a slim bar above the header with Get, to the store for the
//   phone's own system; closing it hides it for 30 days.
// The badge artwork is Apple's and Google's own, loaded from their
// badge links unchanged, as both require.

const APP_STORE_BADGE = 'https://tools.applemarketingtools.com/api/badges/download-on-the-app-store/black/en-us?size=250x83';
const PLAY_STORE_BADGE = 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
const APP_BAR_DISMISS_KEY = 'janedore_app_bar_closed';
const APP_BAR_DISMISS_DAYS = 30;
// Preview before the app is published: opening the site with
// ?app-preview=1 shows the bar and badges on that phone only (links go
// nowhere); ?app-preview=0 turns it off. Visitors never see it, since
// Apple and Google only allow the badges for an app in their stores.
const APP_PREVIEW_KEY = 'janedore_app_preview';
(function () {
  const m = location.search.match(/[?&]app-preview=([01])/);
  if (!m) return;
  try { m[1] === '1' ? localStorage.setItem(APP_PREVIEW_KEY, '1') : localStorage.removeItem(APP_PREVIEW_KEY); } catch (e) {}
})();
function appPreviewOn() { try { return localStorage.getItem(APP_PREVIEW_KEY) === '1'; } catch (e) { return false; } }

function isInsideApp() {
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true;
  if (window.navigator.standalone === true) return true;
  return ['standalone', 'fullscreen', 'minimal-ui'].some(m => window.matchMedia && window.matchMedia('(display-mode: ' + m + ')').matches);
}

function appStoreLinks() {
  const apps = (window._siteContent && window._siteContent.homepage && window._siteContent.homepage.apps) || {};
  const links = {
    apple: /^https:\/\/apps\.apple\.com\//i.test(apps.appStoreUrl || '') ? apps.appStoreUrl : '',
    google: /^https:\/\/play\.google\.com\//i.test(apps.playStoreUrl || '') ? apps.playStoreUrl : ''
  };
  if (appPreviewOn()) { links.apple = links.apple || '#'; links.google = links.google || '#'; }
  return links;
}

// A store link opens in a new tab; a preview one (#) does nothing.
function appLinkAttrs(link) {
  return link === '#' ? 'href="#" onclick="return false"' : `href="${escapeHTML(link)}" target="_blank" rel="noopener"`;
}

function appBadgesHtml(links) {
  return (links.apple ? `<a class="app-badge app-badge-apple" ${appLinkAttrs(links.apple)}><img src="${APP_STORE_BADGE}" alt="Download on the App Store"></a>` : '') +
    (links.google ? `<a class="app-badge app-badge-google" ${appLinkAttrs(links.google)}><img src="${PLAY_STORE_BADGE}" alt="Get it on Google Play"></a>` : '');
}

function phoneSystem() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'apple';
  if (/Android/i.test(ua)) return 'google';
  return '';
}

function appBarDismissed() {
  try { return Date.now() - Number(localStorage.getItem(APP_BAR_DISMISS_KEY) || 0) < APP_BAR_DISMISS_DAYS * 864e5; } catch (e) { return false; }
}

function closeAppBar() {
  try { localStorage.setItem(APP_BAR_DISMISS_KEY, String(Date.now())); } catch (e) {}
  const bar = document.getElementById('app-bar');
  if (bar) bar.remove();
}

function renderAppBadges() {
  const links = appStoreLinks();
  const inApp = isInsideApp();

  document.querySelectorAll('[data-app-badges]').forEach(el => {
    const badges = inApp ? '' : appBadgesHtml(links);
    el.innerHTML = badges ? `<div class="footer-apps-title">Get the app</div><div class="footer-apps-badges">${badges}</div>` : '';
    el.hidden = !badges;
  });

  const system = phoneSystem();
  const link = system ? links[system] : '';
  const existing = document.getElementById('app-bar');
  if (inApp || !link || (appBarDismissed() && !appPreviewOn())) { if (existing) existing.remove(); return; }
  if (existing) return;
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  const bar = document.createElement('div');
  bar.id = 'app-bar';
  bar.className = 'app-bar';
  bar.innerHTML = `<button type="button" class="app-bar-close" onclick="closeAppBar()" aria-label="Close"><i class="ph ph-x"></i></button>` +
    `<span class="app-bar-icon" aria-hidden="true">J</span>` +
    `<span class="app-bar-text"><strong>JANEDORE</strong><span>Shop faster in the app</span></span>` +
    `<a class="app-bar-get" ${appLinkAttrs(link)}>Get</a>`;
  nav.parentNode.insertBefore(bar, nav);
}
