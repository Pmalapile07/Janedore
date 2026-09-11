// ==================== CONTENT PAGES (Firestore-driven) ====================
// Generic template for footer policy/help pages. Content lives in the
// 'pages' Firestore collection, one doc per slug (e.g. 'shipping-policy').
// Doc shape: { title: string, content: string (HTML) }

async function navigateToContentPage(slug, replaceUrl) {
  closeFilterPanel();
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

  try {
    const doc = await db.collection('pages').doc(slug).get();
    renderContentPage(doc.exists ? doc.data() : null, slug);
  } catch (e) {
    console.error('Error fetching content page:', e);
    renderContentPage(null, slug);
  }

  window.scrollTo({ top: 0, behavior: "instant" });
  ensureNavScrolled();
  updateChatVisibility();
}

function renderContentPage(data, slug) {
  const el = document.getElementById('content-page-body');
  if (!el) return;

  if (!data) {
    el.innerHTML = `
      <section style="padding:60px 18px;max-width:800px;margin:0 auto;">
        <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#888;margin-bottom:14px;">Janedore</div>
        <div style="font-size:28px;font-weight:600;margin-bottom:20px;">Page not found</div>
        <p style="font-size:14px;color:#666;line-height:1.7;">This page hasn't been added yet.</p>
      </section>
    `;
    return;
  }

  const title = data.title || slug;
  const content = data.content || '';

  el.innerHTML = `
    <section style="padding:60px 18px;max-width:800px;margin:0 auto;">
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#888;margin-bottom:14px;">Janedore</div>
      <div style="font-size:28px;font-weight:600;margin-bottom:24px;">${escapeHTML(title)}</div>
      <div style="font-size:14px;color:#333;line-height:1.8;">${content}</div>
    </section>
  `;
}

window.navigateToContentPage = navigateToContentPage;
