function openSearch() { DOM.searchOverlay.classList.add("open"); document.body.style.overflow="hidden"; setTimeout(()=>DOM.searchInput.focus(),100); renderSearchDefault(); }
function closeSearch() { DOM.searchOverlay.classList.remove("open"); document.body.style.overflow=""; DOM.searchInput.value=""; }
function handleSearch(val) { const v=val.trim().toLowerCase(); if(!v){renderSearchDefault();return;} const results=PRODUCTS.filter(p=>p.status==='active'&&((p.name||'').toLowerCase().includes(v)||(p.brand||'').toLowerCase().includes(v)||(p.category||'').toLowerCase().includes(v))); DOM.searchBody.innerHTML=`<div class="search-results-title">${results.length} Result${results.length!==1?"s":""}</div>${results.length?`<div class="search-results-grid">${results.map(p=>productCard(p)).join("")}</div>`:'<div class="search-no-results">No pieces found.</div>'}`; }
// Blank until the customer actually types something — no pre-filled
// "Popular Searches" suggestions.
function renderSearchDefault() { DOM.searchBody.innerHTML=''; }
