const firebaseConfig = { apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI", authDomain: "janedore-9f035.firebaseapp.com", projectId: "janedore-9f035", storageBucket: "janedore-9f035.firebasestorage.app", messagingSenderId: "571299748651", appId: "1:571299748651:web:01463a772d47b39cc4036e", measurementId: "G-Y9NMT0ZGKZ" };
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function getProductReviews(productId) {
  try { 
    const s = await db.collection('reviews').where('productId','==',productId).get(); 
    const reviews = s.docs.map(d=>({id:d.id,...d.data()}));
    reviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return reviews;
  } catch(e) { return []; }
}
async function addProductReview(productId, review) {
  try {
    const country = await getVisitorCountry();
    await db.collection('reviews').add({ productId, rating:review.rating, text:review.text, name:review.name||'Anonymous', country, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
  } catch(e) {
    const all = JSON.parse(localStorage.getItem('janedore_reviews')||'{}');
    if(!all[productId]) all[productId]=[]; all[productId].push(review);
    localStorage.setItem('janedore_reviews', JSON.stringify(all));
  }
}
async function subscribeNewsletter(email) {
  if(!email||!email.includes('@')) return;
  try { await db.collection('newsletter').add({ email, subscribedAt:firebase.firestore.FieldValue.serverTimestamp(), source:'website' }); const i=document.getElementById('newsletter-email'); if(i){i.value='';i.placeholder='Subscribed!';setTimeout(()=>i.placeholder='Enter your email',2000);} } catch(e) {}
}
async function saveOrder(orderData) { try { await db.collection('orders').add({...orderData, createdAt:firebase.firestore.FieldValue.serverTimestamp(), status:'pending'}); } catch(e) {} }
async function getVisitorCountry() { try { const r=await fetch('https://ipapi.co/json/'); const d=await r.json(); return d.country_name||'Unknown'; } catch(e) { return 'Unknown'; } }

const DOM = {
  cartBadge: document.getElementById("cart-badge"), wishBadge: document.getElementById("wish-badge"),
  cartItemCount: document.getElementById("cart-item-count"), searchOverlay: document.getElementById("search-overlay"),
  searchInput: document.getElementById("search-input"), searchBody: document.getElementById("search-body"),
  menuBackdrop: document.getElementById("menu-backdrop"), menuDrawer: document.getElementById("menu-drawer"),
  cartBackdrop: document.getElementById("cart-backdrop"), cartPanel: document.getElementById("cart-panel"),
  arrivalsGrid: document.getElementById("arrivals-grid"), allProductsGrid: document.getElementById("all-products-grid"),
  categoryProductsGrid: document.getElementById("category-products-grid"), categoryNameTag: document.getElementById("category-name-tag"),
  categoryDescriptionWrap: document.getElementById("category-description-wrap"), productDetail: document.getElementById("page-product-detail"),
  cartBody: document.getElementById("cart-body"), cartFoot: document.getElementById("cart-foot"),
  cartPageContent: document.getElementById("cart-page-content"), wishPageContent: document.getElementById("wish-page-content"),
  campaignSlides: document.getElementById("campaign-slides"), reviewStars: document.getElementById("review-stars"),
  reviewText: document.getElementById("review-text"), reviewName: document.getElementById("review-name"),
  reviewImageInput: document.getElementById("review-image-input"), reviewImagePreview: document.getElementById("review-image-preview"),
  reviewModalBackdrop: document.getElementById("review-modal-backdrop"), gridToggleSvg: document.getElementById("grid-toggle-svg"),
  catGridToggleSvg: document.getElementById("cat-grid-toggle-svg"), announceText0: document.getElementById("announce-text-0"),
  announceText1: document.getElementById("announce-text-1"), mainNav: document.getElementById("main-nav"),
  homepageNewsletterSection: document.getElementById("homepage-newsletter-section"),
  heroBg: document.getElementById("hero-bg"), hero: null
};

let PRODUCTS = [];
const BANNER_ITEMS = ["Complimentary Shipping on Orders Over R1500", "Free Returns Within 30 Days", "New Collection — Discover 'Dawning' Now Live"];
const CURRENCIES = { ZAR:{label:"ZAR R",symbol:"R"}, BWP:{label:"BWP P",symbol:"P"}, USD:{label:"USD $",symbol:"$"}, LSL:{label:"LSL M",symbol:"M"}, NAD:{label:"NAD N$",symbol:"N$"} };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect fill='%23f0ede8' width='400' height='500'/%3E%3C/svg%3E";

// Collection descriptions
const COLLECTION_DESCRIPTIONS = {
  'all-clothing': 'Our complete clothing edit — refined silhouettes for the modern wardrobe.',
  'dresses': 'Effortless dresses that balance structure and fluidity.',
  'tops': 'Elevated essentials, from sculptural blouses to relaxed knits.',
  'bottoms': 'Tailored trousers and fluid skirts with quiet intention.',
  'jackets': 'Outerwear that defines the silhouette — sharp, soft, and considered.',
  'sets': 'Coordinated pieces designed to be worn together or styled apart.',
  'bags': 'Understated accessories that complete the look without saying too much.',
  'jewelry': 'Sculptural adornments — timeless pieces with modern sensibility.',
  'sunglasses': 'Bold yet refined eyewear for the discerning gaze.',
  'parfum': 'A study in scent. THATO parfums are crafted for the considered wearer.',
  'all': 'All pieces — a curated view of everything in store.'
};

function loadCartFromStorage() {
  try { const saved = localStorage.getItem('janedore_cart'); if (saved) S.cart = JSON.parse(saved); } catch(e) { S.cart = []; }
}
function saveCartToStorage() {
  try { localStorage.setItem('janedore_cart', JSON.stringify(S.cart)); } catch(e) {}
}
function loadWishlistFromStorage() {
  try {
    const saved = localStorage.getItem('janedore_wishlist');
    if (saved) { const ids = JSON.parse(saved); S.wishlist = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean); }
  } catch(e) { S.wishlist = []; }
}
function saveWishlistToStorage() {
  try { const ids = S.wishlist.map(p => p.id); localStorage.setItem('janedore_wishlist', JSON.stringify(ids)); } catch(e) {}
}
function cleanCartOrphans() {
  S.cart = S.cart.filter(item => PRODUCTS.some(p => p.id === item.productId));
  saveCartToStorage();
}

const S = {
  cart:[], wishlist:[], currentPage:"home", currentCategoryPage:null, selectedSize:null,
  productVariantSelections:{}, imageMode:"ghost", gridCols:2, gridColsCat:2,
  filter:{cat:"all",size:"all",price:"all"}, catFilter:{size:"all",price:"all"},
  campaignSlideIndex:0, recentlyViewed:[], currentSlide:0, announceIdx:0, announceTimer:null,
  currency:"ZAR", reviewRating:0, reviewImage:null, touchStartX:0, touchEndX:0,
  cardTouchStartX:{}, cardSlideIndex:{}, swipeState:{}, previousCollectionPage:null,
  currentReviewProductId:null, saleMode:false
};

async function fetchProducts() {
  try {
    const snapshot = await db.collection('products').where('status','==','active').get();
    if(!snapshot.empty) return snapshot.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e) {}
  await new Promise(r=>setTimeout(r,600));
  return [
    { id:"nova-sunglasses", sku:"ACC-NSG-006", name:"Janedore Logo Nova Sunglasses", brand:"JANEDORE", category:"sunglasses", price:350, salePrice:280, badge:"sale", sizes:["OS"], stock:10, status:"active", featured:true, description:"Bold yet refined sunglasses.", productFeatures:"UV400 lenses.", compositionCare:"Acetate frame.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Warm Brown", swatch:"#AF3E06", images:{ model:[], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/C8DC66E1-BB21-4807-BC2C-C7F52A8005CE.png?v=1778858287"], detail:[] } }] },
    { id:"tenese-gold-earrings", sku:"JWL-TGE-005", name:"Stainless Steel Tenesè Gold Earrings", brand:"NIRIUS CO", category:"jewelry", price:380, salePrice:null, badge:"new", sizes:["Stainless Steel"], stock:10, status:"active", featured:true, description:"Sculptural gold earrings.", productFeatures:"18k gold-plated.", compositionCare:"Gold-plated stainless steel.", shippingReturns:"Free shipping over R1500.", variants:[{ color:"Gold", swatch:"#d4af37", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6607.png?v=1778790153"], detail:[] } }] },
    { id:"janedore-leather-pouch", sku:"ACC-JLP-007", name:"Janedore Debossed Leather Pouch", brand:"JANEDORE", category:"bags", price:50, salePrice:null, badge:null, sizes:["OS"], stock:50, status:"active", featured:false, description:"Supple debossed leather pouch.", productFeatures:"Genuine leather.", compositionCare:"100% Leather.", shippingReturns:"Free with sunglass purchase.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"], detail:[] } }] },
    { id:"janedore-raffle-brandy-black-dress", sku:"DRS-RBB-001", name:"Janedore Raffle Brandy Black Dress", brand:"JANEDORE", category:"dresses", price:450, salePrice:380, badge:"sale", sizes:["S","M","L"], stock:40, status:"active", featured:true, description:"Fluid silhouette and quiet tension.", productFeatures:"Weighted crepe fabric.", compositionCare:"100% Polyester.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/116AE49E-1C83-474E-B538-B3147C826859.png?v=1778858287"], detail:[] } }] },
    { id:"thato-rumination-tea-parfum", sku:"PRF-TRT-001", name:"Thato Rumination Tea Parfum", brand:"THATO", category:"parfum", price:350, salePrice:299, badge:"sale", sizes:["OS"], stock:30, status:"active", featured:true, description:"A contemplative fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Pale Linen", swatch:"#EBEDE0", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"], detail:[] } }] },
    { id:"thato-pink-rain-parfum", sku:"PRF-TPR-002", name:"Thato Pink Rain Parfum", brand:"THATO", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:25, status:"active", featured:true, description:"A delicate, romantic fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Pink Rain", swatch:"#F3DBD7", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6630.png?v=1778801279"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/FD9FBEA5-4CD8-421E-A549-F67099AD9B79.png?v=1778801677"], detail:[] } }] },
    { id:"janedore-studded-halter-dress", sku:"DRS-SHN-001", name:"Janedore Studded Halter Neck Dress", brand:"JANEDORE", category:"dresses", price:680, salePrice:null, badge:"new", sizes:["XS","S","M","L"], stock:20, status:"active", featured:true, description:"Refined edge meets feminine structure.", productFeatures:"Structured halter neckline.", compositionCare:"95% Polyester, 5% Elastane.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/BB8C5723-337D-4CB3-B9B8-9FC4BF36CBFE.png?v=1779001142"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/27BAAA95-3B6D-4CCE-A2D8-FFF60326A881.png?v=1779001142"], detail:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_1.png?v=1779001150","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_2.png?v=1779001160","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_3.png?v=1779001170"] } }] }
  ];
}

function navigateToSale() {
  S.saleMode = true;
  updateHash('products');
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-products").classList.add("active");
  S.currentPage = "products";
  if(document.getElementById("page-products").querySelector(".toolbar-center")) {
    document.getElementById("page-products").querySelector(".toolbar-center").textContent = "SALE";
  }
  renderSaleProducts();
  window.scrollTo({top:0,behavior:"smooth"});
  ensureNavScrolled();
}

function renderSaleProducts() {
  if(!DOM.allProductsGrid) return;
  const saleProds = merchandiseProducts(PRODUCTS.filter(p => p.status === 'active' && p.salePrice));
  DOM.allProductsGrid.style.gridTemplateColumns = S.gridCols===1?"1fr":S.gridCols===2?"repeat(2,1fr)":"repeat(3,1fr)";
  DOM.allProductsGrid.innerHTML = saleProds.length ? saleProds.map(p=>productCard(p, S.gridCols===3, true)).join("") : '<div style="grid-column:1/-1;text-align:center;padding:40px;font-size:12px;color:#888;">No sale items at the moment.</div>';
  updateGridToggleSVG("grid-toggle-svg", S.gridCols);
}

function updateHash(hash) { if (window.location.hash !== hash) history.pushState(null, null, hash || '#'); }
function getRouteFromHash() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return { page: 'home' };
  if (hash === 'products') return { page: 'products' };
  if (hash === 'campaign') return { page: 'campaign' };
  if (hash === 'cart') return { page: 'cart' };
  if (hash === 'wishlist') return { page: 'wishlist' };
  if (hash === 'checkout') return { page: 'checkout' };
  if (hash === 'editorial') return { page: 'editorial' };
  if (hash === 'login') return { page: 'login' };
  if (hash === 'account') return { page: 'account' };
  if (hash.startsWith('category-')) return { page: 'category', cat: hash.replace('category-', '') };
  if (hash.startsWith('product-')) return { page: 'product-detail', productId: hash.replace('product-', '') };
  return { page: 'home' };
}

window.addEventListener('popstate', () => {
  const route = getRouteFromHash();
  if (route.page === 'product-detail') goToProduct(route.productId);
  else if (route.page === 'category') navigateToCategory(route.cat);
  else if (route.page === 'login') navigateToLogin();
  else if (route.page === 'account') navigateToAccount();
  else navigateTo(route.page);
});

function navigateTo(page) {
  S.saleMode = false;
  updateHash(page === 'home' ? '' : page);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  S.currentPage = page; window.scrollTo({top:0,behavior:"smooth"});
  if(page==="products"){renderAllProducts();ensureNavScrolled();S.previousCollectionPage='products';}
  if(page==="cart"){renderCartPage();ensureNavScrolled();}
  if(page==="wishlist"){renderWishlistPage();ensureNavScrolled();}
  if(page==="checkout"){navigateToCheckout();}
  if(page==="home") setTimeout(checkNavForHome,50);
  if(page==="editorial") ensureNavScrolled();
  if(page==="login"||page==="account") ensureNavScrolled();
  setTimeout(refreshSwipeTracks,50);
}
function navigateToCategory(cat) {
  S.saleMode = false;
  updateHash(`category-${cat}`);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-category").classList.add("active"); S.currentPage="category"; S.currentCategoryPage=cat;
  S.previousCollectionPage = cat;
  if(DOM.categoryNameTag) DOM.categoryNameTag.textContent = (cat.charAt(0).toUpperCase()+cat.slice(1)).replace(/-/g,' ').toUpperCase();
  renderCategoryProducts(); window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled(); setTimeout(refreshSwipeTracks,50);
}
function goToProduct(productId) {
  S.saleMode = false;
  updateHash(`product-${productId}`);
  closeCart(); const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  S.recentlyViewed=S.recentlyViewed.filter(p=>p.id!==productId); S.recentlyViewed.unshift(product); if(S.recentlyViewed.length>6) S.recentlyViewed.pop();
  if (S.currentPage === 'category' || S.currentPage === 'products') S.previousCollectionPage = S.currentCategoryPage || 'products';
  S.currentReviewProductId = productId;
  renderProductPage(product);
}

function initNavScroll() {
  DOM.hero = document.getElementById("hero");
  window.addEventListener("scroll", () => {
    if (!DOM.hero) { DOM.mainNav.classList.add("scrolled"); return; }
    DOM.mainNav.classList.toggle("scrolled", DOM.hero.getBoundingClientRect().bottom <= 0);
  }, { passive: true });
}
function ensureNavScrolled() { DOM.mainNav.classList.add("scrolled"); }
function checkNavForHome() {
  DOM.hero = document.getElementById("hero");
  if (!DOM.hero) { DOM.mainNav.classList.add("scrolled"); return; }
  DOM.mainNav.classList.toggle("scrolled", DOM.hero.getBoundingClientRect().bottom <= 0);
}
function isDesktop() { return window.innerWidth >= 769; }
function setHeroImage() { if(DOM.heroBg) DOM.heroBg.style.backgroundImage = isDesktop() ? "url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6700.png?v=1778930159')" : "url('https://cdn.shopify.com/s/files/1/0705/5615/6145/files/1B332189-93D3-46B2-A719-F5CCBAEAF139.png?v=1778858287')"; }
window.addEventListener('resize', setHeroImage);

function safeImage(url) { return url || PLACEHOLDER_IMAGE; }
function getProductImages(product, variantIndex) {
  const idx = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[product.id] ?? 0);
  const variant = product?.variants?.[idx] ?? product?.variants?.[0] ?? {};
  if (product.category === 'jewelry') return [...(variant.images?.model||[]), ...(variant.images?.ghost||[])].filter(Boolean).length ? [...(variant.images?.model||[]), ...(variant.images?.ghost||[])].filter(Boolean) : [PLACEHOLDER_IMAGE];
  return variant.images?.[S.imageMode] || variant.images?.ghost || variant.images?.model || [PLACEHOLDER_IMAGE];
}
function getProductThumbnail(product, variantIndex) { return safeImage(getProductImages(product, variantIndex)[0]); }
function getAllProductImages(product, variantIndex) {
  const idx = variantIndex !== undefined ? variantIndex : (S.productVariantSelections[product.id] ?? 0);
  const variant = product?.variants?.[idx] ?? product?.variants?.[0] ?? {};
  const detail = (variant.images?.detail || []).filter(Boolean);
  if (product.category === 'jewelry') return [...(variant.images?.model||[]), ...(variant.images?.ghost||[]), ...detail].map(safeImage).filter(Boolean).length ? [...(variant.images?.model||[]), ...(variant.images?.ghost||[]), ...detail].map(safeImage) : [PLACEHOLDER_IMAGE];
  return [...(variant.images?.ghost||[]), ...(variant.images?.model||[]), ...detail].map(safeImage) || [PLACEHOLDER_IMAGE];
}
function truncateName(name) { if(!name) return ''; const w=name.split(' '); return w.length<=3?name:w.slice(0,3).join(' ')+'<br>'+w.slice(3).join(' '); }
function truncateNameEllipsis(name) { if(!name) return ''; const w=name.split(' '); return w.length<=3?name:w.slice(0,3).join(' ')+'…'; }
function formatPrice(amount) { return `${CURRENCIES[S.currency]?.symbol??"R"}${(amount??0).toLocaleString()}`; }
function isProductSoldOut(product) { return (product?.stock??0)<=0; }
function cartHasMultipleTypes() { const types = new Set(S.cart.map(i=>PRODUCTS.find(p=>p.id===i.productId)?.category).filter(Boolean)); return types.size>1; }

function variantSwatchesHtml(product, selectedIndex) {
  const variants = product?.variants || [];
  const si = selectedIndex !== undefined ? selectedIndex : (S.productVariantSelections[product.id] ?? 0);
  const soldOut = isProductSoldOut(product);
  return variants.slice(0,2).map((v,i)=>{
    let cls = `variant-swatch${i===si?" selected":""}${soldOut?" sold-out":""}`;
    let style = v.dualColor ? `--swatch-color1:${v.swatch||'#ccc'};--swatch-color2:${v.swatchColor2||'#999'};` : `background:${v.swatch||'#ccc'};`;
    if(v.dualColor) cls += ' dual-color';
    return `<span class="${cls}" style="${style}" onclick="event.stopPropagation();selectVariant('${product.id}',${i},event)"></span>`;
  }).join("") + (variants.length>2?`<span class="variant-plus">+${variants.length-2}</span>`:'');
}

function selectVariant(productId, variantIndex, evt) {
  if(evt){evt.stopPropagation();evt.preventDefault();}
  S.productVariantSelections[productId]=variantIndex;
  const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  const allImages = getAllProductImages(product, variantIndex);
  document.querySelectorAll(`.product-card[data-product-id="${productId}"]`).forEach(card=>{
    const slidesEl = card.querySelector(".product-card-slides");
    if(slidesEl) slidesEl.innerHTML = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
    const barsEl = card.querySelector(".card-slider-bars");
    if(barsEl) barsEl.innerHTML = allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("");
    const dotsEl = card.querySelector(".product-variant-dots");
    if(dotsEl) dotsEl.innerHTML=variantSwatchesHtml(product, variantIndex);
    const slidesContainer = card.querySelector(".product-card-slides");
    if(slidesContainer) { slidesContainer.style.transform = "translateX(0)"; S.cardSlideIndex[productId] = 0; }
  });
  if(S.currentPage==="product-detail"){
    const images=getAllProductImages(product, variantIndex);
    const slidesEl = document.getElementById("product-slides");
    if(slidesEl) {
      slidesEl.innerHTML = images.map(u=>`<div class="product-slide" style="background-image:url('${u}');"></div>`).join("");
      if (isDesktop() && images.length >= 4) slidesEl.classList.remove('single-image');
      else if (isDesktop()) slidesEl.classList.add('single-image');
    }
    document.querySelectorAll(".product-info .modal-variant-dots .variant-swatch").forEach((dot,i)=>{ dot.classList.toggle("selected", i===variantIndex); });
  }
}

function productCard(product, compactMode=false, isCollectionPage=false) {
  if(!product) return '';
  if(isCollectionPage && product.id === 'janedore-leather-pouch' && S.currentCategoryPage !== 'sunglasses') return '';
  const vi = S.productVariantSelections[product.id] ?? 0;
  const allImages = getAllProductImages(product, vi);
  const isWished = S.wishlist.some(w => w.id === product.id);
  const priceHtml = product.salePrice ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>` : formatPrice(product.price);
  const badgeLabel = product.badge==="sold"?"Sold Out":product.badge==="new"?"New":product.salePrice?"Sale":"";
  const badgeHtml = badgeLabel ? `<div class="product-badge-wrap"><span class="badge-${product.badge==='sold'?'sold':product.salePrice?'sale':'new'}">${badgeLabel}</span></div>` : "";
  const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
  const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : '';
  const soldOutClass = isProductSoldOut(product) ? ' sold-out' : '';
  const nameClass = isCollectionPage ? ' collection-name' : '';
  const displayName = isCollectionPage ? truncateName(product.name) : (product.name || '');
  return `<div class="product-card${soldOutClass}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')">
    <div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')">
      <div class="product-card-slides" id="card-slides-${product.id}">${slidesHtml}</div>${barsHtml}${badgeHtml}
    </div>
    ${compactMode ? '' : `<div class="product-meta-row"><div class="product-brand-tag">${product.brand||''}</div><div class="product-variant-dots">${variantSwatchesHtml(product, vi)}</div></div><div class="product-name${nameClass}">${displayName}</div><div class="product-price-row"><div class="product-price">${priceHtml}</div><button class="price-bookmark${isWished?' wished':''}" onclick="event.stopPropagation();toggleWish('${product.id}')"><i class="${isWished?'ph-fill ph-bookmark-simple':'ph-thin ph-bookmark-simple'}"></i></button></div>`}
  </div>`;
}

function productCardHome(product) {
  if(!product) return '';
  const vi = S.productVariantSelections[product.id] ?? 0;
  const allImages = getAllProductImages(product, vi);
  const isWished = S.wishlist.some(w => w.id === product.id);
  const priceHtml = product.salePrice ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>` : formatPrice(product.price);
  const badgeLabel = product.badge==="sold"?"Sold Out":product.badge==="new"?"New":product.salePrice?"Sale":"";
  const badgeHtml = badgeLabel ? `<div class="product-badge-wrap"><span class="badge-${product.badge==='sold'?'sold':product.salePrice?'sale':'new'}">${badgeLabel}</span></div>` : "";
  const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
  const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : '';
  return `<div class="product-card${isProductSoldOut(product)?' sold-out':''}" data-product-id="${product.id}" onclick="goToProduct('${product.id}')">
    <div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')">
      <div class="product-card-slides" id="card-slides-home-${product.id}">${slidesHtml}</div>${barsHtml}${badgeHtml}
    </div>
    <div class="product-meta-row"><div class="product-brand-tag">${product.brand||''}</div><div class="product-variant-dots">${variantSwatchesHtml(product, vi)}</div></div>
    <div class="product-name collection-name">${truncateName(product.name)}</div>
    <div class="product-price-row"><div class="product-price">${priceHtml}</div><button class="price-bookmark${isWished?' wished':''}" onclick="event.stopPropagation();toggleWish('${product.id}')"><i class="${isWished?'ph-fill ph-bookmark-simple':'ph-thin ph-bookmark-simple'}"></i></button></div>
  </div>`;
}

function cardTouchStart(e, productId) { S.cardTouchStartX[productId] = e.touches[0].clientX; }
function cardTouchEnd(e, productId) {
  const startX = S.cardTouchStartX[productId]; if(!startX) return;
  const diff = startX - e.changedTouches[0].clientX; if(Math.abs(diff) < 30) return;
  const product = PRODUCTS.find(p=>p.id===productId); if(!product) return;
  const vi = S.productVariantSelections[productId] ?? 0;
  const allImages = getAllProductImages(product, vi); const total = allImages.length;
  const cur = S.cardSlideIndex[productId] ?? 0; let nxt = cur;
  if(diff > 0 && cur < total - 1) nxt = cur + 1; else if(diff < 0 && cur > 0) nxt = cur - 1;
  S.cardSlideIndex[productId] = nxt;
  document.querySelectorAll(`#card-slides-${productId}, #card-slides-home-${productId}`).forEach(el => { if(el) el.style.transform = `translateX(-${nxt*100}%)`; });
  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  if(card) card.querySelectorAll(".card-slider-bar").forEach((d,i)=>d.classList.toggle("active",i===nxt));
}

function getCompleteLookProducts(currentProduct) {
  if (!currentProduct) return [];
  const active = PRODUCTS.filter(p => p.status === 'active' && p.id !== currentProduct.id);
  const pouch = active.find(p => p.id === 'janedore-leather-pouch');
  const clothing = active.filter(p => ['dresses','tops','bottoms','jackets','sets'].includes(p.category));
  const tops = clothing.filter(p => p.category === 'tops'), bottoms = clothing.filter(p => p.category === 'bottoms');
  const dresses = clothing.filter(p => p.category === 'dresses'), jewelry = active.filter(p => p.category === 'jewelry');
  const bags = active.filter(p => p.category === 'bags' && p.id !== 'janedore-leather-pouch');
  const sunglasses = active.filter(p => p.category === 'sunglasses'), parfum = active.filter(p => p.category === 'parfum');
  let s = []; const cat = currentProduct.category;
  if (cat === 'sunglasses') { if (pouch) s.push(pouch); s = s.concat(tops.slice(0,2)); if (s.length < 3) s = s.concat(bottoms.slice(0,1)); }
  else if (['tops','bottoms','dresses','jackets','sets'].includes(cat)) {
    if (cat === 'tops') { s = s.concat(bottoms.slice(0,1)); s = s.concat(jewelry.slice(0,1)); if (pouch) s.push(pouch); }
    else if (cat === 'bottoms') { s = s.concat(tops.slice(0,2)); s = s.concat(jewelry.slice(0,1)); }
    else if (cat === 'dresses') { s = s.concat(jewelry.slice(0,2)); }
    else { s = s.concat(tops.slice(0,1)); s = s.concat(bottoms.slice(0,1)); }
    if (s.length < 4) s = s.concat(bags.slice(0,1));
  } else if (cat === 'parfum') { s = s.concat(clothing.slice(0,2)); s = s.concat(sunglasses.slice(0,1)); }
  else if (cat === 'bags') { s = s.concat(jewelry.slice(0,2)); s = s.concat(sunglasses.slice(0,1)); if (pouch && currentProduct.id !== 'janedore-leather-pouch') s.push(pouch); }
  else if (cat === 'jewelry') { if (pouch) s.push(pouch); s = s.concat(tops.slice(0,2)); }
  return [...new Set(s)].slice(0,6);
}

function buildSwipeSection(title, products, containerId) {
  const id = containerId || `swipe-${Date.now()}`;
  const cards = products.map(p => `<div class="product-card" data-product-id="${p.id}" onclick="goToProduct('${p.id}')">${buildSwipeCardInner(p)}</div>`).join('');
  const perView = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2;
  const maxIdx = Math.max(0, products.length - perView);
  const bars = Array.from({length: maxIdx+1}, (_,i) => `<div class="swipe-bar${i===0?' active':''}" onclick="goSwipe('${id}',${i})"></div>`).join('');
  return `<div class="swipe-section"><div class="swipe-section-title">${title}</div><div class="swipe-track-wrap" id="wrap-${id}" ontouchstart="swipeTouchStart(event,'${id}')" ontouchend="swipeTouchEnd(event,'${id}')" onmousedown="swipeMouseDown(event,'${id}')"><div class="swipe-track" id="track-${id}">${cards}</div></div><div class="swipe-bars" id="bars-${id}">${bars}</div></div>`;
}
function buildSwipeCardInner(product) {
  if(!product) return '';
  const vi = S.productVariantSelections[product.id] ?? 0; const allImages = getAllProductImages(product, vi);
  const isWished = S.wishlist.some(w => w.id === product.id);
  const priceHtml = product.salePrice ? `<span class="product-price-sale">${formatPrice(product.salePrice)}</span><span class="product-price-original">${formatPrice(product.price)}</span>` : formatPrice(product.price);
  const badgeLabel = product.badge==="sold"?"Sold Out":product.badge==="new"?"New":product.salePrice?"Sale":"";
  const badgeHtml = badgeLabel ? `<div class="product-badge-wrap"><span class="badge-${product.badge==='sold'?'sold':product.salePrice?'sale':'new'}">${badgeLabel}</span></div>` : "";
  const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
  const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : '';
  return `<div class="product-img-wrap${isProductSoldOut(product)?' sold-out':''}" ontouchstart="cardTouchStart(event,'${product.id}')" ontouchend="cardTouchEnd(event,'${product.id}')"><div class="product-card-slides">${slidesHtml}</div>${barsHtml}${badgeHtml}</div><div class="product-meta-row"><div class="product-brand-tag">${product.brand||''}</div><div class="product-variant-dots">${variantSwatchesHtml(product, vi)}</div></div><div class="product-name">${product.name||''}</div><div class="product-price-row"><div class="product-price">${priceHtml}</div><button class="price-bookmark${isWished?' wished':''}" onclick="event.stopPropagation();toggleWish('${product.id}')"><i class="${isWished?'ph-fill ph-bookmark-simple':'ph-thin ph-bookmark-simple'}"></i></button></div>`;
}

function getSwipePerView() { return window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2; }
function swipeGo(id, idx) {
  const track = document.getElementById(`track-${id}`), wrap = document.getElementById(`wrap-${id}`);
  if (!track || !wrap) return;
  const cards = track.querySelectorAll('.product-card'); if (!cards.length) return;
  const perView = getSwipePerView(); idx = Math.max(0, Math.min(idx, Math.max(0, cards.length - perView)));
  S.swipeState[id] = idx;
  track.style.transform = `translateX(-${idx * (wrap.offsetWidth / perView + 8)}px)`;
  document.querySelectorAll(`#bars-${id} .swipe-bar`).forEach((b,i)=>b.classList.toggle('active',i===idx));
}
function goSwipe(id, idx) { swipeGo(id, idx); }
function swipeTouchStart(e, id) { S.swipeState[`${id}_startX`] = e.touches[0].clientX; }
function swipeTouchEnd(e, id) {
  const startX = S.swipeState[`${id}_startX`]; if (startX === undefined) return;
  const diff = startX - e.changedTouches[0].clientX; if (Math.abs(diff) < 30) return;
  const cur = S.swipeState[id] || 0; if (diff > 0) swipeGo(id, cur + 1); else swipeGo(id, cur - 1);
}
function swipeMouseDown(e, id) {
  S.swipeState[`${id}_mouseX`] = e.clientX; S.swipeState[`${id}_dragging`] = true;
  const onUp = (ev) => {
    if (!S.swipeState[`${id}_dragging`]) return; S.swipeState[`${id}_dragging`] = false;
    const diff = S.swipeState[`${id}_mouseX`] - ev.clientX;
    if (Math.abs(diff) < 20) { document.removeEventListener('mouseup', onUp); return; }
    const cur = S.swipeState[id] || 0; if (diff > 0) swipeGo(id, cur + 1); else swipeGo(id, cur - 1);
    document.removeEventListener('mouseup', onUp);
  }; document.addEventListener('mouseup', onUp);
}
function refreshSwipeTracks() {
  document.querySelectorAll('.swipe-track-wrap').forEach(wrap => {
    const id = wrap.id.replace('wrap-', ''); const track = document.getElementById(`track-${id}`); if (track) track.style.transform = 'translateX(0)';
    document.getElementById(`bars-${id}`)?.querySelectorAll('.swipe-bar').forEach((b,i)=>b.classList.toggle('active',i===0));
    S.swipeState[id] = 0;
  });
}

function merchandiseProducts(products) {
  if(!products?.length) return [];
  const filtered = products.filter(p => p.id !== 'janedore-leather-pouch');
  const clothingCats = ['dresses','tops','bottoms','jackets','sets'];
  const clothing = filtered.filter(p => clothingCats.includes(p.category));
  const accessories = filtered.filter(p => ['sunglasses','jewelry','bags'].includes(p.category));
  const parfum = filtered.filter(p => p.category === 'parfum');
  const other = filtered.filter(p => !clothingCats.includes(p.category) && !['sunglasses','jewelry','bags'].includes(p.category) && p.category !== 'parfum');
  const result = []; let ci=0, ai=0, oi=0, patIdx=0;
  const pattern = ['clothing','accessory','accessory','clothing','accessory'];
  const allRem = [...parfum, ...other];
  while(ci < clothing.length || ai < accessories.length || oi < allRem.length) {
    const slot = pattern[patIdx % pattern.length]; patIdx++;
    if(slot==='clothing' && ci < clothing.length) result.push(clothing[ci++]);
    else if(slot==='accessory' && ai < accessories.length) result.push(accessories[ai++]);
    else { if(ci < clothing.length) result.push(clothing[ci++]); else if(ai < accessories.length) result.push(accessories[ai++]); else if(oi < allRem.length) result.push(allRem[oi++]); else break; }
  }
  while(oi < allRem.length) result.push(allRem[oi++]);
  return result;
}

function showLoading(container) { if(container) container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>'; }

function buildAllProductsHomeSlider() {
  const track = document.getElementById('track-all-products-home');
  const bars = document.getElementById('bars-all-products-home');
  if (!track || !bars) return;
  const active = PRODUCTS.filter(p => p.status === 'active');
  const prods = merchandiseProducts(active);
  const cards = prods.map(p => `<div class="product-card" data-product-id="${p.id}" onclick="goToProduct('${p.id}')">${buildSwipeCardInner(p)}</div>`).join('');
  track.innerHTML = cards;
  const perView = getSwipePerView();
  const maxIdx = Math.max(0, prods.length - perView);
  bars.innerHTML = Array.from({length: maxIdx+1}, (_,i) => `<div class="swipe-bar${i===0?' active':''}" onclick="goSwipe('all-products-home',${i})"></div>`).join('');
  S.swipeState['all-products-home'] = 0;
}

function buildArrivals() {
  buildAllProductsHomeSlider();
  const categoriesGrid = document.getElementById('home-categories-grid');
  if (categoriesGrid) {
    const categories = [
      { label: 'Clothing', img: 'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287', cat: 'all-clothing' },
      { label: 'Jewellery', img: 'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153', cat: 'jewelry' },
      { label: 'Sunglasses', img: 'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287', cat: 'sunglasses' },
      { label: 'Scent', img: 'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601', cat: 'parfum' },
      { label: 'Bags', img: 'https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703', cat: 'bags' }
    ];
    categoriesGrid.innerHTML = categories.map(c => 
      `<div class="home-category-card" onclick="navigateToCategory('${c.cat}')"><div class="home-category-img" style="background-image:url('${c.img}');background-size:cover;background-position:center;"></div><div class="home-category-label">${c.label}</div></div>`
    ).join('');
  }
  buildNewsletterSection();
}

function navigateToJanedoreOnly() {
  navigateTo('products');
}
function buildNewsletterSection() {
  if(!DOM.homepageNewsletterSection) return;
  DOM.homepageNewsletterSection.innerHTML = `<div class="newsletter-section"><div class="newsletter-title">Subscribe to our newsletter</div><div class="newsletter-form"><input class="newsletter-input" type="email" placeholder="Enter your email" id="newsletter-email"><button class="newsletter-btn" onclick="subscribeNewsletter(document.getElementById('newsletter-email').value)"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button></div><p class="newsletter-disclaimer">By signing up, you agree to our privacy policy.</p></div>`;
}

function applyFilter(type, value) { S.filter[type] = value; if(S.saleMode) renderSaleProducts(); else renderAllProducts(); }
function applyCatFilter(type, value) { S.catFilter[type] = value; renderCategoryProducts(); }
function toggleFilterDropdown(source) {
  const id = source === 'category' ? 'filter-options-category' : 'filter-options-products';
  const el = document.getElementById(id);
  if(el) { el.classList.toggle("open"); if(el.classList.contains("open")) setTimeout(() => document.addEventListener("click", function cf(e) { if(!el.contains(e.target) && !e.target.classList.contains("filter-trigger")) { el.classList.remove("open"); document.removeEventListener("click", cf); } }), 10); }
}
function getFilteredProducts() { return PRODUCTS.filter(p=>{ if(p.status!=='active') return false; if(S.filter.cat!=='all' && p.category!==S.filter.cat) return false; if(S.filter.size!=='all' && !(p.sizes||[]).includes(S.filter.size)) return false; const price = p.salePrice ?? p.price; if(S.filter.price==='low' && price >= 500) return false; if(S.filter.price==='high' && price < 500) return false; return true; }); }
function getCatFilteredProducts() {
  const isAllClothing = S.currentCategoryPage === 'all-clothing';
  const clothingCats = ['dresses','tops','bottoms','jackets','sets'];
  return PRODUCTS.filter(p=>{ if(p.status!=='active') return false; if(p.id==='janedore-leather-pouch' && S.currentCategoryPage !== 'sunglasses') return false; if(isAllClothing) { if(!clothingCats.includes(p.category)) return false; } else if(S.currentCategoryPage && p.category !== S.currentCategoryPage) return false; if(S.catFilter.size!=='all' && !(p.sizes||[]).includes(S.catFilter.size)) return false; const price = p.salePrice ?? p.price; if(S.catFilter.price==='low' && price >= 500) return false; if(S.catFilter.price==='high' && price < 500) return false; return true; });
}
function renderAllProducts() { if(!DOM.allProductsGrid) return; let prods = merchandiseProducts(getFilteredProducts()); DOM.allProductsGrid.style.gridTemplateColumns = S.gridCols===1?"1fr":S.gridCols===2?"repeat(2,1fr)":"repeat(3,1fr)"; DOM.allProductsGrid.innerHTML = prods.map(p=>productCard(p, S.gridCols===3, true)).join(""); updateGridToggleSVG("grid-toggle-svg", S.gridCols); }
function renderCategoryProducts() {
  if(!S.currentCategoryPage || !DOM.categoryProductsGrid) return;
  let catProducts;
  if (S.currentCategoryPage === 'parfum') catProducts = getCatFilteredProducts().filter(p => p.category === 'parfum');
  else if (S.currentCategoryPage === 'jewelry') catProducts = getCatFilteredProducts().filter(p => p.category === 'jewelry');
  else if (S.currentCategoryPage === 'sunglasses') catProducts = getCatFilteredProducts().filter(p => p.category === 'sunglasses' || p.id === 'janedore-leather-pouch');
  else if (S.currentCategoryPage === 'all-clothing') catProducts = getCatFilteredProducts().filter(p => ['dresses','tops','bottoms','jackets','sets'].includes(p.category));
  else if (['dresses','tops','bottoms','jackets','sets'].includes(S.currentCategoryPage)) catProducts = getCatFilteredProducts().filter(p => p.category === S.currentCategoryPage);
  else if (S.currentCategoryPage === 'bags') catProducts = getCatFilteredProducts().filter(p => p.category === S.currentCategoryPage && p.id !== 'janedore-leather-pouch');
  else catProducts = getCatFilteredProducts();
  let prods = merchandiseProducts(catProducts);
  DOM.categoryProductsGrid.style.gridTemplateColumns = S.gridColsCat===1?"1fr":S.gridColsCat===2?"repeat(2,1fr)":"repeat(3,1fr)";
  DOM.categoryProductsGrid.innerHTML = prods.map(p => productCard(p, S.gridColsCat===3, true)).join("");
  updateGridToggleSVG("cat-grid-toggle-svg", S.gridColsCat);
  if (DOM.categoryDescriptionWrap) {
    const desc = COLLECTION_DESCRIPTIONS[S.currentCategoryPage] || COLLECTION_DESCRIPTIONS['all'] || '';
    DOM.categoryDescriptionWrap.innerHTML = desc ? `<p class="collection-description">${desc}</p>` : '';
  }
}

function goBackFromProduct() {
  if (S.previousCollectionPage && S.previousCollectionPage !== 'products') navigateToCategory(S.previousCollectionPage);
  else navigateTo('products');
}
function goBackHome() { navigateTo('home'); }

async function renderProductPage(product) {
  document.querySelectorAll(".page").forEach(pg=>pg.classList.remove("active")); DOM.productDetail.classList.add("active"); S.currentPage="product-detail"; S.selectedSize=null;
  showLoading(DOM.productDetail);
  const vi=S.productVariantSelections[product.id]??0; const images=getAllProductImages(product, vi); const isWished=S.wishlist.some(w=>w.id===product.id); const soldOut=isProductSoldOut(product);
  const sizeLabel = product.category === 'jewelry' ? 'Material' : 'Size';
  const related = merchandiseProducts(PRODUCTS.filter(p => p.id !== product.id && p.category === product.category && p.status === 'active')).slice(0,6);
  const relatedSection = related.length ? buildSwipeSection('You May Also Like', related, `related-${product.id}`) : '';
  const ctl = getCompleteLookProducts(product);
  const ctlSection = ctl.length ? buildSwipeSection('Complete the Look', ctl, `ctl-${product.id}`) : '';
  const rv = S.recentlyViewed.filter(p => p.id !== product.id).slice(0,6);
  const rvSection = rv.length ? buildSwipeSection('Recently Viewed', rv, `rv-${product.id}`) : '';
  const reviews = await getProductReviews(product.id);
  const reviewsHtml = reviews.length ? reviews.map(r=>`<div style="font-size:12px;font-weight:300;color:#555;margin-bottom:10px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)} — ${r.text||'No comment'}<br><small style="color:#aaa;">${r.name||'Anonymous'} · ${r.country||'Unknown'} · ${r.createdAt?new Date(r.createdAt.seconds*1000).toLocaleDateString():'Recently'}</small></div>`).join('') : '<p class="no-reviews">No reviews yet.</p>';
  const slidesClass = (isDesktop() && images.length >= 4) ? '' : 'single-image';
  DOM.productDetail.innerHTML=`
    <div class="product-slider" id="product-slider"><div class="product-slides ${slidesClass}" id="product-slides">${images.map(u=>`<div class="product-slide" style="background-image:url('${u}');"></div>`).join("")}</div><div class="slider-bars" id="slider-bars">${images.map((_,i)=>`<button class="slider-bar${i===0?" active":""}" onclick="goToSlide(${i})"></button>`).join("")}</div></div>
    <div class="product-info">
      <div class="modal-brand-row"><div class="modal-brand">${product.brand||''}</div><div class="modal-variant-dots">${variantSwatchesHtml(product, vi)}</div></div>
      <div class="modal-title">${product.name||''}</div>
      <div class="modal-price-row"><div class="modal-price">${product.salePrice?`<span>${formatPrice(product.salePrice)}</span> <span style="text-decoration:line-through;color:#aaa;">${formatPrice(product.price)}</span>`:formatPrice(product.price)}</div><button class="modal-wish-btn${isWished?" wished":""}" onclick="toggleWish('${product.id}')"><i class="${isWished?'ph-fill ph-bookmark-simple':'ph-thin ph-bookmark-simple'}"></i></button></div>
      <p class="modal-desc">${product.description||''}</p>
      <div class="modal-size-label">${sizeLabel}</div><div class="modal-sizes">${(product.sizes||[]).map(s=>`<button class="modal-size-btn" onclick="selectSize(this,'${s}')">${s}</button>`).join("")}</div>
      <div class="product-actions"><button class="modal-add-btn" onclick="addToCartFromDetail('${product.id}')" style="width:100%;"${soldOut?' disabled':''}>${soldOut?'Sold Out':'Add to Cart'}</button></div>
      <div class="ai-disclaimer-notice"><span>*</span><p>Select imagery may include AI-assisted production.<br><strong>Product accuracy remains a priority.</strong></p></div>
      <div class="info-collapse" id="collapse-shipping"><div class="info-collapse-header" onclick="toggleInfoCollapse('shipping')">Shipping & Returns <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div><div class="info-collapse-body">${product.shippingReturns||''}<div class="shipping-calc"><input id="postal-code-input" placeholder="Enter postal code"><button onclick="calculateShipping()">Calculate</button></div><div class="shipping-result" id="shipping-result"></div></div></div>
      <div class="info-collapse" id="collapse-features"><div class="info-collapse-header" onclick="toggleInfoCollapse('features')">Product Features <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div><div class="info-collapse-body">${product.productFeatures||''}</div></div>
      <div class="info-collapse" id="collapse-care"><div class="info-collapse-header" onclick="toggleInfoCollapse('care')">Composition & Care <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div><div class="info-collapse-body">${product.compositionCare||''}</div></div>
      <div class="info-collapse" id="collapse-sizing"><div class="info-collapse-header" onclick="toggleInfoCollapse('sizing')">Sizing & Fit <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div><div class="info-collapse-body"><p>Model wears size S. Please refer to our size guide for detailed measurements.</p></div></div>
      ${ctlSection}${relatedSection}
      <div class="reviews-section"><div class="reviews-title">Reviews</div>${reviewsHtml}<button class="write-review-btn" onclick="openReviewModal()">Write a Review</button></div>
      ${rvSection}
    </div>
    <div class="back-btn-wrap"><button class="back-btn" onclick="goBackFromProduct()">Back</button></div>
    <footer id="product-footer"></footer>`;
  buildFooter("product-footer"); S.currentSlide=0; setupProductSliderTouch(); window.scrollTo({top:0,behavior:"smooth"}); ensureNavScrolled(); setTimeout(refreshSwipeTracks,50);
}

function setupProductSliderTouch() { const slider = document.getElementById("product-slider"); if(!slider) return; slider.addEventListener("touchstart", e => S.touchStartX = e.touches[0].clientX); slider.addEventListener("touchend", e => { S.touchEndX = e.changedTouches[0].clientX; handleSwipe(); }); }
function handleSwipe() { const diff = S.touchStartX - S.touchEndX; if(Math.abs(diff) < 30) return; const slides = document.querySelectorAll("#product-slides .product-slide"); if(diff > 0 && S.currentSlide < slides.length-1) goToSlide(S.currentSlide+1); else if(diff < 0 && S.currentSlide > 0) goToSlide(S.currentSlide-1); }
function goToSlide(i) { S.currentSlide=i; document.getElementById("product-slides").style.transform = isDesktop() ? 'none' : `translateX(-${i*100}%)`; document.querySelectorAll("#slider-bars .slider-bar").forEach((d,j)=>d.classList.toggle("active",j===i)); }
function toggleInfoCollapse(id) { document.getElementById(`collapse-${id}`)?.classList.toggle("open"); }
function selectSize(btn, size) { document.querySelectorAll(".modal-size-btn").forEach(b=>b.classList.remove("sel")); btn.classList.add("sel"); S.selectedSize=size; }
function addToCartFromDetail(id) { if(!S.selectedSize) return; const product = PRODUCTS.find(p=>p.id===id); if(product && isProductSoldOut(product)) return; addToCart(id, S.selectedSize); openCart(); }

function addToCart(productId, size) {
  const product=PRODUCTS.find(p=>p.id===productId); if(!product || isProductSoldOut(product)) return;
  const vi=S.productVariantSelections[productId]??0; const variant=(product.variants||[])[vi]??{};
  const existing=S.cart.find(i=>i.productId===productId&&i.size===(size||product.sizes[0])&&i.variantIndex===vi);
  if(existing) existing.qty++; else S.cart.push({productId,variantIndex:vi,size:size||product.sizes[0]||'OS',qty:1,name:product.name,brand:product.brand,price:product.price,salePrice:product.salePrice,color:variant.color||'Default',thumbnail:getProductThumbnail(product,vi)});
  updateBadges(); renderCart(); saveCartToStorage();
}
function removeFromCart(productId, size, vi) { S.cart=S.cart.filter(i=>!(i.productId===productId&&i.size===size&&i.variantIndex===vi)); updateBadges(); renderCart(); saveCartToStorage(); }
function changeQty(productId, size, delta, vi) {
  const item=S.cart.find(i=>i.productId===productId&&i.size===size&&i.variantIndex===vi);
  if(!item) return;
  const newQty = item.qty + delta;
  if(newQty <= 0) {
    removeFromCart(productId, size, vi);
  } else {
    item.qty = newQty;
    renderCart();
    saveCartToStorage();
  }
}
function addPouchToCart() { const pouch = PRODUCTS.find(p => p.id === 'janedore-leather-pouch'); if (pouch) { addToCart('janedore-leather-pouch', 'OS'); renderCart(); } }
function hasSunglassesInCart() { return S.cart.some(item => PRODUCTS.find(p => p.id === item.productId)?.category === 'sunglasses'); }
function pouchAlreadyInCart() { return S.cart.some(item => item.productId === 'janedore-leather-pouch'); }

function renderCart() {
  if(!DOM.cartBody || !DOM.cartFoot) return;
  const total = S.cart.reduce((a,i)=>a+i.qty,0); if(DOM.cartItemCount) DOM.cartItemCount.textContent = total;
  if(!S.cart.length) { DOM.cartBody.innerHTML='<div class="cart-empty-state"><div class="cart-empty-msg">Your bag is empty</div><button class="btn-continue-shopping" onclick="closeCart();navigateTo(\'products\');">Continue Shopping</button></div>'; DOM.cartFoot.innerHTML=''; return; }
  let html = S.cart.map(item=>{
    const thumbnail = item.thumbnail && item.thumbnail !== PLACEHOLDER_IMAGE ? item.thumbnail : (item.productId ? getProductThumbnail(PRODUCTS.find(p=>p.id===item.productId), item.variantIndex) : PLACEHOLDER_IMAGE);
    return `<div class="cart-item-row" onclick="goToProduct('${item.productId}')"><div class="cart-item-img-placeholder" style="background-image:url('${thumbnail}');"></div><div style="flex:1"><div class="ci-brand">${item.brand||''}</div><div class="ci-name">${truncateNameEllipsis(item.name)}</div><div class="ci-meta">${item.color||''} · ${item.size||''}</div><div class="ci-qty"><button class="ci-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',-1,${item.variantIndex})">−</button><span class="ci-qty-num">${item.qty}</span><button class="ci-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',1,${item.variantIndex})">+</button></div></div><span class="ci-price">${formatPrice((item.salePrice??item.price??0)*item.qty)}</span><button class="ci-remove" onclick="event.stopPropagation();removeFromCart('${item.productId}','${item.size}',${item.variantIndex})">×</button></div>`;
  }).join("");
  if (hasSunglassesInCart() && !pouchAlreadyInCart()) {
    const pouch = PRODUCTS.find(p => p.id === 'janedore-leather-pouch');
    if (pouch) html += `<div class="cart-addon-section"><div class="cart-addon-title">ADD-ON</div><div class="cart-addon-item"><div class="cart-addon-img" style="background-image:url('${getProductThumbnail(pouch)}');"></div><div class="cart-addon-info"><div class="cart-addon-name">${pouch.name}</div><div class="cart-addon-price">${formatPrice(pouch.price)}</div></div><button class="cart-addon-btn" onclick="event.stopPropagation();addPouchToCart();">Add</button></div></div>`;
  }
  DOM.cartBody.innerHTML = html;
  const sub = S.cart.reduce((a,i)=>a+(i.salePrice??i.price??0)*i.qty,0);
  DOM.cartFoot.innerHTML = `<div class="cart-subtotal"><span class="cart-subtotal-label">Subtotal</span><span class="cart-subtotal-val">${formatPrice(sub)}</span></div><div class="cart-ship-note">${sub>=1500?"Free shipping applied":`R150 shipping · Free over ${formatPrice(1500)}`}</div>${cartHasMultipleTypes()?'<div class="cart-multi-package-note">contents may arrive in multiple packages</div>':''}<button class="btn-view-cart" onclick="closeCart();navigateTo('cart');">View Bag</button><button class="btn-checkout-main" onclick="closeCart();navigateTo('checkout');">Checkout</button><div class="cart-security-note"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Secure & Encrypted Payment</div>`;
}

function toggleWish(productId) {
  const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  const idx=S.wishlist.findIndex(w=>w.id===productId); if(idx>=0) S.wishlist.splice(idx,1); else S.wishlist.push(product);
  updateBadges(); renderWishlistPage(); saveWishlistToStorage();
  const isWished = S.wishlist.some(w=>w.id===productId); const iconClass = isWished ? "ph-fill ph-bookmark-simple" : "ph-thin ph-bookmark-simple";
  document.querySelectorAll(`.price-bookmark[onclick*="toggleWish('${productId}')"]`).forEach(btn=>{ btn.classList.toggle("wished", isWished); const icon=btn.querySelector("i"); if(icon) icon.className = iconClass; });
  const modalBtn = document.querySelector(".modal-wish-btn"); if(modalBtn && S.currentPage==="product-detail"){ modalBtn.classList.toggle("wished", isWished); const icon = modalBtn.querySelector("i"); if(icon) icon.className = iconClass; }
}
function renderWishlistPage() {
  if(!DOM.wishPageContent) return;
  if(!S.wishlist.length) { DOM.wishPageContent.innerHTML = '<div class="wish-page-empty"><div class="wish-page-empty-title">Your wishlist is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>'; return; }
  DOM.wishPageContent.innerHTML = `<div class="wish-page-title">Wishlist (${S.wishlist.length})</div><div class="wish-page-grid">${S.wishlist.map(p=>{
    const vi=S.productVariantSelections[p.id]??0;
    const isWished = S.wishlist.some(w=>w.id===p.id);
    const priceHtml=p.salePrice?`<span class="product-price-sale">${formatPrice(p.salePrice)}</span><span class="product-price-original">${formatPrice(p.price)}</span>`:formatPrice(p.price);
    const badgeLabel=p.badge==="sold"?"Sold Out":p.badge==="new"?"New":p.salePrice?"Sale":"";
    const badgeHtml=badgeLabel?`<div class="product-badge-wrap"><span class="badge-${p.badge==='sold'?'sold':p.salePrice?'sale':'new'}">${badgeLabel}</span></div>`:"";
    const allImages = getAllProductImages(p, vi);
    const slidesHtml = allImages.map(u=>`<div class="product-card-slide" style="background-image:url('${u}');"></div>`).join("");
    const barsHtml = allImages.length > 1 ? `<div class="card-slider-bars">${allImages.map((_,i)=>`<div class="card-slider-bar${i===0?' active':''}"></div>`).join("")}</div>` : '';
    return `<div class="product-card${isProductSoldOut(p)?' sold-out':''}" data-product-id="${p.id}" onclick="goToProduct('${p.id}')">
      <div class="product-img-wrap" ontouchstart="cardTouchStart(event,'${p.id}')" ontouchend="cardTouchEnd(event,'${p.id}')">
        <div class="product-card-slides" id="card-slides-wish-${p.id}">${slidesHtml}</div>${barsHtml}${badgeHtml}
      </div>
      <div class="product-meta-row"><div class="product-brand-tag">${p.brand||''}</div><div class="product-variant-dots">${variantSwatchesHtml(p, vi)}</div></div>
      <div class="product-name collection-name">${truncateName(p.name)}</div>
      <div class="product-price-row"><div class="product-price">${priceHtml}</div><button class="price-bookmark${isWished?' wished':''}" onclick="event.stopPropagation();toggleWish('${p.id}')"><i class="${isWished?'ph-fill ph-bookmark-simple':'ph-thin ph-bookmark-simple'}"></i></button></div>
    </div>`;
  }).join("")}</div>`;
}

function buildFooter(id) {
  const el=document.getElementById(id); if(!el) return;
  const currLabel=CURRENCIES[S.currency]?.label??"ZAR R";
  const sections = ["shop","brands","policies","help"];
  const collapseHTML = sections.map(sec => {
    const links = { shop:["New In","Dresses","Tops","Bottoms","Jackets","Sets","Bags","Jewelry","Scent","Sale"], brands:["JANEDORE","NIRIUS CO","THATO"], policies:["About","Shipping Policy","Return Policy","Privacy Policy","Terms & Conditions"], help:["FAQ","Size Guide","Shipping","Returns","Contact"] }[sec];
    return `<div class="footer-collapse" id="footer-collapse-${sec}-${id}"><div class="footer-collapse-header" onclick="toggleFooterCollapse('${sec}-${id}')">${sec.charAt(0).toUpperCase()+sec.slice(1)} <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div><div class="footer-collapse-body"><ul class="footer-links">${links.map(l=>`<li><a>${l}</a></li>`).join("")}</ul></div></div>`;
  }).join("");
  el.innerHTML = `<div class="footer-top">${collapseHTML}</div><p class="footer-about">Janedore is a curated multi-brand fashion destination rooted in South Africa.</p><div class="footer-currency-lang"><div class="footer-currency" onclick="toggleFooterDropdown('currency-${id}','${id}')"><span class="footer-currency-label">${currLabel}</span><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><div class="currency-dropdown" id="currency-dropdown-${id}"><div class="dropdown-option" onclick="event.stopPropagation();selectCurrency('ZAR')">ZAR R</div><div class="dropdown-option" onclick="event.stopPropagation();selectCurrency('BWP')">BWP P</div><div class="dropdown-option" onclick="event.stopPropagation();selectCurrency('USD')">USD $</div><div class="dropdown-option" onclick="event.stopPropagation();selectCurrency('LSL')">LSL M</div><div class="dropdown-option" onclick="event.stopPropagation();selectCurrency('NAD')">NAD N$</div></div></div><div class="footer-lang" onclick="toggleFooterDropdown('lang-${id}','${id}')">EN <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><div class="lang-dropdown" id="lang-dropdown-${id}">EN</div></div></div><div class="footer-bottom"><div class="footer-copy">© 2025 JANEDORE. ALL RIGHTS RESERVED.</div></div>`;
}
function toggleFooterCollapse(id) { document.getElementById(`footer-collapse-${id}`)?.classList.toggle("open"); }
function toggleFooterDropdown(type, footerId) { const dd = document.getElementById(type.includes("currency")?`currency-dropdown-${footerId}`:`lang-dropdown-${footerId}`); if(dd){dd.classList.toggle("open");setTimeout(()=>dd.classList.remove("open"),4000);} }
function selectCurrency(code) { S.currency=code; document.querySelectorAll(".footer-currency-label").forEach(el=>el.textContent=CURRENCIES[code]?.label??code); if(S.currentPage==="home") buildArrivals(); if(S.currentPage==="products") { if(S.saleMode) renderSaleProducts(); else renderAllProducts(); } if(S.currentPage==="category") renderCategoryProducts(); renderCart(); }

function openSearch() { DOM.searchOverlay.classList.add("open"); document.body.style.overflow="hidden"; setTimeout(()=>DOM.searchInput.focus(),100); renderSearchDefault(); }
function closeSearch() { DOM.searchOverlay.classList.remove("open"); document.body.style.overflow=""; DOM.searchInput.value=""; }
function handleSearch(val) {
  const v=val.trim().toLowerCase(); if(!v){renderSearchDefault();return;}
  const results=PRODUCTS.filter(p=>p.status==='active'&&((p.name||'').toLowerCase().includes(v)||(p.brand||'').toLowerCase().includes(v)||(p.category||'').toLowerCase().includes(v)));
  DOM.searchBody.innerHTML=`<div class="search-results-title">${results.length} Result${results.length!==1?"s":""}</div>${results.length?`<div class="search-results-grid">${results.map(p=>productCard(p)).join("")}</div>`:'<div class="search-no-results">No pieces found.</div>'}`;
}
function renderSearchDefault() { DOM.searchBody.innerHTML='<div class="search-suggestions"><div class="search-suggestions-title">Popular Searches</div><div class="search-suggestion-pills">'+["Sunglasses","Jewelry","Pouch","Earrings","Scent"].map(s=>`<button class="search-pill" onclick="searchFor('${s}')">${s}</button>`).join("")+'</div></div>'; }
function searchFor(term) { DOM.searchInput.value=term; handleSearch(term); }
function openMenu() { DOM.menuBackdrop.classList.add("open"); DOM.menuDrawer.classList.add("open"); }
function closeMenu() { DOM.menuBackdrop.classList.remove("open"); DOM.menuDrawer.classList.remove("open"); }
function toggleBrandsCollapse() { document.getElementById("brands-collapse").classList.toggle("open"); }
function toggleSubmenuCollapse(id) { document.getElementById(`${id}-collapse`)?.classList.toggle("open"); }
function openCart() { DOM.cartBackdrop.classList.add("open"); DOM.cartPanel.classList.add("open"); renderCart(); }
function closeCart() { DOM.cartBackdrop.classList.remove("open"); DOM.cartPanel.classList.remove("open"); }
function openReviewModal() { DOM.reviewModalBackdrop.classList.add("open"); S.reviewRating=0; S.reviewImage=null; updateReviewStars(); DOM.reviewText.value=""; DOM.reviewName.value=""; DOM.reviewImagePreview.style.display="none"; DOM.reviewImageInput.value=""; }
function closeReviewModal() { DOM.reviewModalBackdrop.classList.remove("open"); }
function setReviewRating(r) { S.reviewRating=r; updateReviewStars(); }
function updateReviewStars() { document.querySelectorAll("#review-stars .review-star-btn").forEach((b,i)=>{ b.innerHTML = i < S.reviewRating ? '<i class="ph-fill ph-star"></i>' : '<i class="ph-thin ph-star"></i>'; b.classList.toggle("filled", i < S.reviewRating); }); }
function handleReviewImage(event) { const file=event.target.files[0]; if(file){ S.reviewImage=file; const reader=new FileReader(); reader.onload=e=>{ DOM.reviewImagePreview.src=e.target.result; DOM.reviewImagePreview.style.display="block"; }; reader.readAsDataURL(file); } }
async function submitReview() { if(S.reviewRating===0) return; const text=DOM.reviewText.value.trim(); const name=DOM.reviewName.value.trim(); if(!S.currentReviewProductId){closeReviewModal();return;} await addProductReview(S.currentReviewProductId,{rating:S.reviewRating,text:text,name:name||'Anonymous'}); closeReviewModal(); if(S.currentPage==='product-detail'){const product=PRODUCTS.find(p=>p.id===S.currentReviewProductId); if(product) renderProductPage(product);} }
async function checkout() { if(!S.cart.length) return; await saveOrder({ items: S.cart.map(i=>({ productId:i.productId,name:i.name,brand:i.brand,size:i.size,color:i.color,qty:i.qty,price:i.salePrice||i.price,variantIndex:i.variantIndex })), subtotal: S.cart.reduce((a,i)=>a+(i.salePrice??i.price??0)*i.qty,0), currency:S.currency, itemCount:S.cart.reduce((a,i)=>a+i.qty,0) }); S.cart=[]; updateBadges(); renderCart(); saveCartToStorage(); alert('Order placed successfully! (Demo mode)'); }
function navigateToCheckout() { closeCart(); navigateTo('checkout'); }
function calculateShipping() { const postal=document.getElementById("postal-code-input")?.value.trim(); const res=document.getElementById("shipping-result"); if(!res) return; if(!postal||postal.length<3){res.textContent="Please enter a valid postal code.";return;} res.textContent=`Estimated shipping: ${formatPrice(Math.floor(Math.random()*150)+50)} (3-5 business days)`; }
function updateBadges() { const cc=S.cart.reduce((a,i)=>a+i.qty,0); DOM.cartBadge.style.display=cc>0?"flex":"none"; DOM.cartBadge.textContent=cc; DOM.wishBadge.style.display=S.wishlist.length>0?"flex":"none"; DOM.wishBadge.textContent=S.wishlist.length; }
function renderCartPage() {
  if(!DOM.cartPageContent) return;
  if(!S.cart.length){DOM.cartPageContent.innerHTML='<div class="cart-page-empty"><div class="cart-page-empty-title">Your bag is empty</div><button class="btn-continue-shopping" onclick="navigateTo(\'products\')">Continue Shopping</button></div>';return;}
  const total=S.cart.reduce((a,i)=>a+i.qty,0);
  let html=S.cart.map(item=>{
    const thumbnail = item.thumbnail && item.thumbnail !== PLACEHOLDER_IMAGE ? item.thumbnail : (item.productId ? getProductThumbnail(PRODUCTS.find(p=>p.id===item.productId), item.variantIndex) : PLACEHOLDER_IMAGE);
    return `<div class="cart-page-item" onclick="goToProduct('${item.productId}')"><div class="cart-page-img" style="background-image:url('${thumbnail}');"></div><div class="cart-page-details"><div class="cart-page-brand">${item.brand||''}</div><div class="cart-page-name">${item.name}</div><div class="cart-page-meta">${item.color||''} · Size ${item.size||''}</div><div class="cart-page-qty-wrap"><button class="cart-page-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',-1,${item.variantIndex});renderCartPage();">−</button><span class="cart-page-qty-num">${item.qty}</span><button class="cart-page-qty-btn" onclick="event.stopPropagation();changeQty('${item.productId}','${item.size}',1,${item.variantIndex});renderCartPage();">+</button></div></div><span class="cart-page-price">${formatPrice((item.salePrice??item.price??0)*item.qty)}</span><button class="cart-page-remove" onclick="event.stopPropagation();removeFromCart('${item.productId}','${item.size}',${item.variantIndex});renderCartPage();">×</button></div>`;
  }).join("");
  if(hasSunglassesInCart() && !pouchAlreadyInCart()){const pouch=PRODUCTS.find(p=>p.id==='janedore-leather-pouch');if(pouch)html+=`<div class="cart-addon-section"><div class="cart-addon-title">ADD-ON</div><div class="cart-addon-item"><div class="cart-addon-img" style="background-image:url('${getProductThumbnail(pouch)}');"></div><div class="cart-addon-info"><div class="cart-addon-name">${pouch.name}</div><div class="cart-addon-price">${formatPrice(pouch.price)}</div></div><button class="cart-addon-btn" onclick="event.stopPropagation();addPouchToCart();renderCartPage();">Add</button></div></div>`;}
  DOM.cartPageContent.innerHTML=`<div class="cart-page-title">Your Bag (${total} item${total!==1?"s":""})</div>${html}<div class="cart-page-promo"><input class="cart-page-promo-input" type="text" placeholder="PROMO CODE"><button class="cart-page-promo-btn" onclick="applyPromoCode()">Apply</button></div><div class="cart-page-summary"><div class="cart-page-subtotal">Subtotal <strong>${formatPrice(S.cart.reduce((a,i)=>a+(i.salePrice??i.price??0)*i.qty,0))}</strong></div>${cartHasMultipleTypes()?'<div class="cart-multi-package-note">contents may arrive in multiple packages</div>':''}<div class="cart-page-actions"><button class="cart-page-btn secondary" onclick="navigateTo('products')">Continue Shopping</button><button class="cart-page-btn primary" onclick="closeCart();navigateTo('checkout');">Proceed to Checkout</button></div><div class="cart-page-security-note"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Secure & Encrypted Payment</div></div>`;
}
function applyPromoCode(){}
function buildBanner(){if(!DOM.announceText0||!DOM.announceText1)return;DOM.announceText0.textContent=BANNER_ITEMS[0];DOM.announceText0.classList.add("active");DOM.announceText1.classList.remove("active");S.announceIdx=0;if(S.announceTimer)clearInterval(S.announceTimer);S.announceTimer=setInterval(()=>{const n=(S.announceIdx+1)%BANNER_ITEMS.length;document.getElementById(`announce-text-${S.announceIdx%2}`)?.classList.remove("active");const ne=document.getElementById(`announce-text-${n%2}`);if(ne){ne.textContent=BANNER_ITEMS[n];ne.classList.add("active");}S.announceIdx=n;},2000);}
function updateGridToggleSVG(svgId,cols){const svg=document.getElementById(svgId);if(svg)svg.querySelectorAll(".grid-block").forEach((b,i)=>b.classList.toggle("active",i<cols));}
function toggleGrid(){S.gridCols=S.gridCols===1?2:S.gridCols===2?3:1;if(S.saleMode) renderSaleProducts(); else renderAllProducts();}
function toggleGridCat(){S.gridColsCat=S.gridColsCat===1?2:S.gridColsCat===2?3:1;renderCategoryProducts();}
function buildCampaignSlider(){if(!DOM.campaignSlides)return;const prods=merchandiseProducts(PRODUCTS.filter(p=>p.status==='active'));const pages=Math.ceil(prods.length/4);DOM.campaignSlides.innerHTML=Array.from({length:pages},(_,i)=>`<div class="campaign-slide">${prods.slice(i*4,(i+1)*4).map(p=>productCard(p)).join("")}</div>`).join("");}
function moveCampaignSlider(dir){const total=Math.ceil(PRODUCTS.filter(p=>p.status==='active').length/4)||1;S.campaignSlideIndex=(S.campaignSlideIndex+dir+total)%total;if(DOM.campaignSlides)DOM.campaignSlides.style.transform=`translateX(-${S.campaignSlideIndex*100}%)`;}

async function init() {
  if (DOM.mainNav) DOM.mainNav.classList.add("scrolled");
  buildBanner(); initNavScroll();
  showLoading(DOM.arrivalsGrid); showLoading(DOM.allProductsGrid);
  loadCartFromStorage(); updateBadges();
  PRODUCTS = await fetchProducts();
  cleanCartOrphans();
  loadWishlistFromStorage(); updateBadges();
  setHeroImage(); buildArrivals();
  ["main-footer","products-footer","category-footer","campaign-footer","cart-footer","wishlist-footer","editorial-footer","checkout-footer","login-footer","account-footer"].forEach(buildFooter);
  buildCampaignSlider();
  const route = getRouteFromHash();
  if (route.page === 'product-detail') goToProduct(route.productId);
  else if (route.page === 'category') navigateToCategory(route.cat);
  else if (route.page === 'login') navigateToLogin();
  else if (route.page === 'account') navigateToAccount();
  else navigateTo(route.page);
  setTimeout(checkNavForHome, 100);
}
init();
