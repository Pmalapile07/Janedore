// focus() must run synchronously inside the click handler, not after a
// setTimeout delay — mobile Safari only opens the keyboard automatically
// when focus happens within the same call stack as the user's tap. The
// old setTimeout(...,100) broke that, so the overlay opened with its
// input unfocused and no keyboard, making it look like an inert second
// screen that needed its own separate tap to actually start typing.
function openSearch() { DOM.searchOverlay.classList.add("open"); document.body.style.overflow="hidden"; DOM.searchInput.focus(); renderSearchDefault(); }
function closeSearch() { DOM.searchOverlay.classList.remove("open"); document.body.style.overflow=""; DOM.searchInput.value=""; }
function handleSearch(val) { const v=val.trim().toLowerCase(); if(!v){renderSearchDefault();return;} const results=PRODUCTS.filter(p=>p.status==='active'&&((p.name||'').toLowerCase().includes(v)||(p.brand||'').toLowerCase().includes(v)||(p.category||'').toLowerCase().includes(v))); DOM.searchBody.innerHTML=`<div class="search-results-title">${results.length} Result${results.length!==1?"s":""}</div>${results.length?`<div class="search-results-grid">${results.map(p=>productCard(p)).join("")}</div>`:'<div class="search-no-results">No pieces found.</div>'}`; }
// Blank until the customer actually types something — no pre-filled
// "Popular Searches" suggestions.
function renderSearchDefault() { DOM.searchBody.innerHTML=''; }
