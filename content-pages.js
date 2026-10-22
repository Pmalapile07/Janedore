// ==================== CONTENT PAGES (Firestore-driven) ====================
// Generic template for footer policy/help pages. Content lives in the
// 'pages' Firestore collection, one doc per slug (e.g. 'shipping-policy').
// Doc shape: { title: string, content: string (HTML) }

async function navigateToContentPage(slug, replaceUrl) {
  // Client Support was renamed customer care; old links still work.
  if (slug === 'client-support') { slug = 'customer-care'; replaceUrl = true; }
  // Shared with every other page-navigation function (see the
  // pageNavGeneration comment in app.js) — without this, a slow fetch
  // for a policy/help page the user has since left can resolve later
  // and overwrite whatever page they've actually navigated to since.
  const myNavGen = ++pageNavGeneration;
  closeFilterPanel();
  closeSearch();
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-content").classList.add("active");
  S.currentPage = "content";
  S.currentContentSlug = slug;
  removeStickyBar();
  if (DOM.mainNav) { DOM.mainNav.classList.remove("product-page", "collection-page"); }
  document.body.classList.remove('on-collection-page');

  const newPath = '/pages/' + encodeURIComponent(slug);
  if (window.location.pathname !== newPath) {
    replaceUrl ? history.replaceState(null, null, newPath) : history.pushState(null, null, newPath);
  }

  const el = document.getElementById('content-page-body');
  if (el) el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  // Track your order, Log a return, Exchange an item, customer care, Brand partnerships and the Partner application are built in code, not Firestore pages
  // (track-order.js, returns.js).
  const formPage = slug === TRACK_ORDER_SLUG ? (typeof renderTrackOrderPage === 'function' && renderTrackOrderPage)
    : slug === 'log-a-return' ? (typeof renderReturnsPage === 'function' && renderReturnsPage)
    : slug === 'exchange-an-item' ? (typeof renderExchangesPage === 'function' && renderExchangesPage)
    : slug === 'customer-care' ? (typeof renderCustomerCarePage === 'function' && renderCustomerCarePage)
    : slug === 'brand-partnerships' ? (typeof renderBrandPartnershipsPage === 'function' && renderBrandPartnershipsPage)
    : slug === 'partner-application' ? (typeof renderPartnerApplicationPage === 'function' && renderPartnerApplicationPage)
    : slug === 'app' ? renderAppPage : null;
  if (formPage) {
    formPage();
    resetScrollToTop();
    ensureNavScrolled();
    updateChatVisibility();
    return;
  }

  try {
    const doc = await db.collection('pages').doc(slug).get();
    if (myNavGen !== pageNavGeneration) return;
    renderContentPage(doc.exists ? doc.data() : null, slug);
  } catch (e) {
    if (myNavGen !== pageNavGeneration) return;
    console.error('Error fetching content page:', e);
    renderContentPage(null, slug);
  }
  if (myNavGen !== pageNavGeneration) return;

  resetScrollToTop();
  ensureNavScrolled();
  updateChatVisibility();
}

// Menu > Download the app. There's no app yet.
function renderAppPage() {
  const el = document.getElementById('content-page-body');
  if (!el) return;
  el.innerHTML = `
    <section class="track-page">
      <h1 class="track-title">The Janedore app</h1>
      <p class="track-intro">Our app is coming soon. Until then, you can shop every brand, track your orders and manage your account right here on the website.</p>
      <button type="button" class="track-btn" onclick="navigateTo('products')">Continue shopping</button>
    </section>`;
}

function renderContentPage(data, slug) {
  const el = document.getElementById('content-page-body');
  if (!el) return;

  if (!data) {
    el.innerHTML = `
      <section style="padding:60px 18px;max-width:800px;margin:0 auto;">
        <div style="font-family:'Inter',sans-serif;font-size:var(--heading-size);font-weight:600;margin-bottom:20px;">Page not found</div>
        <p style="font-family:'Inter',sans-serif;font-size:12px;line-height:var(--body-line-height);letter-spacing:var(--body-letter-spacing);color:#666;">This page hasn't been added yet.</p>
      </section>
    `;
    return;
  }

  const title = data.title || slug;
  const content = data.content || '';

  el.innerHTML = `
    <section style="padding:60px 18px;max-width:800px;margin:0 auto;">
      <div style="font-family:'Inter',sans-serif;font-size:var(--heading-size);font-weight:600;margin-bottom:24px;">${escapeHTML(title)}</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;line-height:var(--body-line-height);letter-spacing:var(--body-letter-spacing);color:#333;">${content}</div>
    </section>
  `;
}

window.navigateToContentPage = navigateToContentPage;
