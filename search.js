// focus() must run synchronously inside the click handler, not after a
// setTimeout delay — mobile Safari only opens the keyboard automatically
// when focus happens within the same call stack as the user's tap. The
// old setTimeout(...,100) broke that, so the overlay opened with its
// input unfocused and no keyboard, making it look like an inert second
// screen that needed its own separate tap to actually start typing.
function openSearch() { DOM.searchOverlay.classList.add("open"); document.body.style.overflow="hidden"; DOM.searchInput.focus(); renderSearchDefault(); }

// Closing after typing something that found results counts as a search,
// so it's in Recent searches next time. Opening a product, brand or page
// from the results closes search too, so that counts as well.
function closeSearch() {
  if (DOM.searchOverlay.classList.contains("open")) rememberTypedSearch();
  DOM.searchOverlay.classList.remove("open"); document.body.style.overflow=""; DOM.searchInput.value="";
}

// ==================== RECENT SEARCHES ====================
// What the customer searched for: typed words, and brands, products and
// categories they opened from search. Newest first, at most
// RECENT_SEARCH_MAX. Guests keep them in this browser (localStorage).
// Signed-in customers also keep them on customers/{uid}.recentSearches,
// so they follow them to any device; synced by login.js's auth listener
// (syncRecentSearchesOnLogin/clearRecentSearchesOnLogout), same as the
// wishlist (wishlist.js).
const RECENT_SEARCH_KEY = 'janedore_recent_searches';
const RECENT_SEARCH_MAX = 10;
let _recentSearchesSyncedUid = null;

function loadRecentSearches() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
    return Array.isArray(list) ? list.filter(e => e && e.type && e.label) : [];
  } catch (e) { return []; }
}

function saveRecentSearches(list) {
  try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list)); } catch (e) {}
  syncRecentSearchesToAccount(list);
}

function recentSearchKey(e) { return e.type + ':' + String(e.value || e.label).toLowerCase(); }

function addRecentSearch(entry) {
  const key = recentSearchKey(entry);
  const list = [entry].concat(loadRecentSearches().filter(e => recentSearchKey(e) !== key)).slice(0, RECENT_SEARCH_MAX);
  saveRecentSearches(list);
  logSearchTerm(entry.label);
}

// Counts towards Trending searches (server.js /api/search-log, which
// ignores anything not sold here). keepalive: opening a result navigates
// away straight after.
function logSearchTerm(term) {
  try {
    fetch('/api/search-log', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ term }) }).catch(() => {});
  } catch (e) {}
}

function removeRecentSearch(index) {
  const list = loadRecentSearches();
  list.splice(index, 1);
  saveRecentSearches(list);
  renderSearchDefault();
}

function clearRecentSearches() {
  saveRecentSearches([]);
  renderSearchDefault();
}

// Fire-and-forget; no-op for guests and chat's anonymous sessions.
function syncRecentSearchesToAccount(list) {
  const user = firebase.auth().currentUser;
  if (!user || user.isAnonymous) return;
  db.collection('customers').doc(user.uid).set({ recentSearches: list }, { merge: true }).catch(function (err) {
    console.warn('[SEARCH] Could not save recent searches to account:', err.message);
  });
}

// Once per sign-in: the account's searches first, then any made in this
// browser before signing in, so nothing is lost either way.
async function syncRecentSearchesOnLogin(uid) {
  if (_recentSearchesSyncedUid === uid) return;
  try {
    const doc = await db.collection('customers').doc(uid).get();
    const remote = (doc.exists && Array.isArray(doc.data().recentSearches)) ? doc.data().recentSearches.filter(e => e && e.type && e.label) : [];
    const seen = new Set();
    const merged = remote.concat(loadRecentSearches()).filter(e => {
      const key = recentSearchKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, RECENT_SEARCH_MAX);
    try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(merged)); } catch (e) {}
    _recentSearchesSyncedUid = uid;
    if (merged.length !== remote.length) syncRecentSearchesToAccount(merged);
  } catch (e) {
    console.warn('[SEARCH] Could not load recent searches from account:', e.message);
  }
}

// The account keeps its searches; this browser forgets them so the next
// person using it doesn't see them.
function clearRecentSearchesOnLogout() {
  if (!_recentSearchesSyncedUid) return;
  _recentSearchesSyncedUid = null;
  try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch (e) {}
}

// ==================== SUGGESTIONS ====================
// Brands, products and categories whose name matches what's typed. Names
// that start with it come first, then a word inside that starts with it
// ("a" finds "Apples"); from three letters, a match anywhere in the name
// too ("ana" finds "Banana").

let _searchSuggestions = [];

function searchMatchRank(label, v) {
  const s = String(label || '').toLowerCase();
  if (s.startsWith(v)) return 0;
  if (s.split(/[\s\-\/&]+/).some(w => w.startsWith(v))) return 1;
  return v.length >= 3 && s.includes(v) ? 2 : -1;
}

function searchCategoryLabel(slug) { return JDTaxonomy.label(slug); }

function getSearchSuggestions(v) {
  const found = [];
  const add = (entry, rank) => { if (rank >= 0) found.push(Object.assign(entry, { rank })); };
  const active = PRODUCTS.filter(p => p.status === 'active');
  const brands = new Map();
  (S.vendors || []).forEach(vendor => {
    const name = vendor.name || vendor.brandName || vendor.brand;
    if (name) brands.set(name.toLowerCase(), { type: 'brand', label: name, value: vendor.slug || vendor.id });
  });
  brands.forEach(b => add(b, searchMatchRank(b.label, v)));
  new Set(active.map(p => p.category).filter(Boolean)).forEach(slug => {
    const label = searchCategoryLabel(slug);
    add({ type: 'category', label, value: slug }, searchMatchRank(label, v));
  });
  active.forEach(p => add({ type: 'product', label: p.name || '', value: p.id }, searchMatchRank(p.name, v)));
  const order = { brand: 0, category: 1, product: 2 };
  return found.sort((a, b) => a.rank - b.rank || order[a.type] - order[b.type] || a.label.localeCompare(b.label)).slice(0, 8);
}

// Bolds the typed part of a suggestion.
function searchHighlight(label, v) {
  const i = label.toLowerCase().indexOf(v);
  if (i < 0) return escapeHTML(label);
  return escapeHTML(label.slice(0, i)) + '<strong>' + escapeHTML(label.slice(i, i + v.length)) + '</strong>' + escapeHTML(label.slice(i + v.length));
}

const SEARCH_TYPE_LABEL = { brand: 'Brand', category: 'Category', product: 'Product' };

function searchEntryIcon(e) {
  if (e.type === 'product') {
    const product = PRODUCTS.find(p => p.id === e.value);
    if (product) return `<span class="search-row-thumb" style="background-image:url('${escapeForCssUrl(getProductThumbnail(product, 0))}')"></span>`;
  }
  const icon = e.type === 'brand' ? 'ph-storefront' : e.type === 'category' ? 'ph-squares-four' : e.type === 'query' ? 'ph-clock-counter-clockwise' : 'ph-magnifying-glass';
  return `<span class="search-row-icon"><i class="ph ${icon}" aria-hidden="true"></i></span>`;
}

// ==================== SEARCH ====================

function getSearchResults(v) {
  return PRODUCTS.filter(p => p.status === 'active' && ((p.name || '').toLowerCase().includes(v) || (p.brand || '').toLowerCase().includes(v) || (p.category || '').toLowerCase().includes(v)));
}

function handleSearch(val) {
  const v = val.trim().toLowerCase();
  if (!v) { renderSearchDefault(); return; }
  const results = getSearchResults(v);
  _searchSuggestions = getSearchSuggestions(v);
  const suggestions = _searchSuggestions.length ? `<div class="search-section-title">Suggestions</div><ul class="search-rows">${_searchSuggestions.map((s, i) => `
    <li><button type="button" class="search-row" onclick="openSearchSuggestion(${i})">${searchEntryIcon(s)}<span class="search-row-label">${searchHighlight(s.label, v)}</span><span class="search-row-type">${SEARCH_TYPE_LABEL[s.type]}</span></button></li>`).join('')}</ul>` : '';
  DOM.searchBody.innerHTML = suggestions + `<div class="search-results-title">${results.length} Result${results.length!==1?"s":""}</div>${results.length?`<div class="search-results-grid">${results.map(p=>productCard(p)).join("")}</div>`:'<div class="search-no-results">No pieces found.</div>'}`;
}

// What was typed, as a recent search. A brand's exact name is kept as
// that brand, so it opens the brand page next time.
function rememberTypedSearch() {
  const typed = (DOM.searchInput.value || '').trim();
  if (typed.length < 2 || !getSearchResults(typed.toLowerCase()).length) return;
  const vendor = (S.vendors || []).find(x => String(x.name || x.brandName || x.brand || '').toLowerCase() === typed.toLowerCase());
  addRecentSearch(vendor ? { type: 'brand', label: vendor.name || vendor.brandName || vendor.brand, value: vendor.slug || vendor.id } : { type: 'query', label: typed });
}

function openSearchEntry(e) {
  if (e.type === 'query') {
    DOM.searchInput.value = e.label;
    handleSearch(e.label);
    addRecentSearch({ type: 'query', label: e.label });
    return;
  }
  addRecentSearch({ type: e.type, label: e.label, value: e.value });
  DOM.searchInput.value = '';
  if (e.type === 'brand') navigateToVendor(e.value);
  else if (e.type === 'category') { closeSearch(); navigateToCategory(e.value); }
  else if (e.type === 'product') { closeSearch(); goToProduct(e.value); }
}

function openSearchSuggestion(i) { if (_searchSuggestions[i]) openSearchEntry(_searchSuggestions[i]); }
function openRecentSearch(i) { const e = loadRecentSearches()[i]; if (e) openSearchEntry(e); }

// Enter in the search box.
function submitSearch() { rememberTypedSearch(); DOM.searchInput.blur(); }

// ==================== TRENDING SEARCHES ====================
// What shoppers searched for most over the last 30 days (server.js
// /api/trending-searches), shown when there are no recent searches.
// While there's little search data yet, it's topped up with the brands
// and categories with the most products, so it's never empty.

let _trendingSearches = null;
let _trendingPromise = null;

function loadTrendingSearches() {
  if (_trendingSearches) return Promise.resolve(_trendingSearches);
  if (!_trendingPromise) {
    _trendingPromise = fetch('/api/trending-searches').then(r => r.json()).catch(() => ({ terms: [] })).then(data => {
      const entries = (data.terms || []).map(label => ({ type: 'query', label: String(label) }));
      _trendingSearches = entries.concat(catalogueTrendingFill(entries)).slice(0, 8);
      return _trendingSearches;
    });
  }
  return _trendingPromise;
}

function catalogueTrendingFill(have) {
  const taken = new Set(have.map(e => e.label.toLowerCase()));
  const active = PRODUCTS.filter(p => p.status === 'active');
  const count = (key) => { const m = new Map(); active.forEach(p => { const k = key(p); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const brands = count(p => p.vendorId || p.brand).map(([id]) => {
    const vendor = (S.vendors || []).find(v => v.id === id);
    const product = active.find(p => (p.vendorId || p.brand) === id);
    const label = vendor ? (vendor.name || vendor.brandName || vendor.brand) : (product && product.brand);
    return label && vendor ? { type: 'brand', label, value: vendor.slug || vendor.id } : (label ? { type: 'query', label } : null);
  }).filter(Boolean);
  const cats = count(p => p.category).map(([slug]) => ({ type: 'category', label: searchCategoryLabel(slug), value: slug }));
  const fill = [];
  for (let i = 0; fill.length < 8 && (i < brands.length || i < cats.length); i++) {
    [brands[i], cats[i]].forEach(e => { if (e && !taken.has(e.label.toLowerCase())) { taken.add(e.label.toLowerCase()); fill.push(e); } });
  }
  return fill;
}

function openTrendingSearch(i) { if (_trendingSearches && _trendingSearches[i]) openSearchEntry(_trendingSearches[i]); }

function renderTrendingSearches() {
  DOM.searchBody.innerHTML = '';
  loadTrendingSearches().then(list => {
    // Still open, nothing typed and no recent searches since.
    if (!list.length || !DOM.searchOverlay.classList.contains('open') || DOM.searchInput.value.trim() || loadRecentSearches().length) return;
    DOM.searchBody.innerHTML = `<div class="search-section-head"><div class="search-section-title">Trending searches</div></div>
      <ul class="search-rows">${list.map((e, i) => `<li><button type="button" class="search-row" onclick="openTrendingSearch(${i})"><span class="search-row-icon"><i class="ph ph-trend-up" aria-hidden="true"></i></span><span class="search-row-label">${escapeHTML(e.label)}</span>${e.type !== 'query' ? `<span class="search-row-type">${SEARCH_TYPE_LABEL[e.type]}</span>` : ''}</button></li>`).join('')}</ul>`;
  });
}

// Before anything's typed: Recent searches, or Trending searches when
// there are none.
function renderSearchDefault() {
  // A product that's since been removed from the shop isn't shown.
  const all = loadRecentSearches();
  const recent = all.filter(e => e.type !== 'product' || PRODUCTS.some(p => p.id === e.value));
  if (!recent.length) { renderTrendingSearches(); return; }
  DOM.searchBody.innerHTML = `<div class="search-section-head"><div class="search-section-title">Recent searches</div><button type="button" class="search-clear-btn" onclick="clearRecentSearches()">Clear</button></div>
    <ul class="search-rows">${recent.map(e => {
      const i = all.indexOf(e);
      return `<li class="search-row-wrap"><button type="button" class="search-row" onclick="openRecentSearch(${i})">${searchEntryIcon(e)}<span class="search-row-label">${escapeHTML(e.label)}</span>${e.type !== 'query' ? `<span class="search-row-type">${SEARCH_TYPE_LABEL[e.type]}</span>` : ''}</button>
        <button type="button" class="search-row-remove" onclick="removeRecentSearch(${i})" aria-label="Remove ${escapeHTML(e.label)} from recent searches"><i class="ph ph-x" aria-hidden="true"></i></button></li>`;
    }).join('')}</ul>`;
}
