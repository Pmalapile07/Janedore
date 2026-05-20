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
  firstDropSection: document.getElementById("first-drop-section"), homepageNewsletterSection: document.getElementById("homepage-newsletter-section"),
  heroBg: document.getElementById("hero-bg"), hero: null
};

let PRODUCTS = [];
const BANNER_ITEMS = ["Complimentary Shipping on Orders Over R1500", "Free Returns Within 30 Days", "New Collection — Discover 'Dawning' Now Live"];
const CURRENCIES = { ZAR:{label:"ZAR R",symbol:"R"}, BWP:{label:"BWP P",symbol:"P"}, USD:{label:"USD $",symbol:"$"}, LSL:{label:"LSL M",symbol:"M"}, NAD:{label:"NAD N$",symbol:"N$"} };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect fill='%23f0ede8' width='400' height='500'/%3E%3C/svg%3E";

// Cart persistence - load from localStorage
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('janedore_cart');
    if (saved) S.cart = JSON.parse(saved);
  } catch(e) { S.cart = []; }
}
function saveCartToStorage() {
  try {
    localStorage.setItem('janedore_cart', JSON.stringify(S.cart));
  } catch(e) {}
}

// Wishlist persistence
function loadWishlistFromStorage() {
  try {
    const saved = localStorage.getItem('janedore_wishlist');
    if (saved) {
      const ids = JSON.parse(saved);
      S.wishlist = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    }
  } catch(e) { S.wishlist = []; }
}
function saveWishlistToStorage() {
  try {
    const ids = S.wishlist.map(p => p.id);
    localStorage.setItem('janedore_wishlist', JSON.stringify(ids));
  } catch(e) {}
}

const S = {
  cart:[], wishlist:[], currentPage:"home", currentCategoryPage:null, selectedSize:null,
  productVariantSelections:{}, imageMode:"ghost", gridCols:2, gridColsCat:2,
  filter:{cat:"all",size:"all",price:"all"}, catFilter:{size:"all",price:"all"},
  campaignSlideIndex:0, recentlyViewed:[], currentSlide:0, announceIdx:0, announceTimer:null,
  currency:"ZAR", reviewRating:0, reviewImage:null, touchStartX:0, touchEndX:0,
  cardTouchStartX:{}, cardSlideIndex:{}, swipeState:{}, previousCollectionPage:null,
  currentReviewProductId:null
};

async function fetchProducts() {
  try {
    const snapshot = await db.collection('products').where('status','==','active').get();
    if(!snapshot.empty) {
      const prods = snapshot.docs.map(d=>({id:d.id,...d.data()}));
      return prods;
    }
  } catch(e) { console.warn('Firebase fetch failed, using fallback:', e); }
  await new Promise(r=>setTimeout(r,600));
  return [
    { id:"nova-sunglasses", sku:"ACC-NSG-006", name:"Janedore Logo Nova Sunglasses", brand:"JANEDORE", category:"sunglasses", price:350, salePrice:null, badge:"sold", sizes:["OS"], stock:10, status:"active", featured:true, description:"Bold yet refined sunglasses.", productFeatures:"UV400 lenses.", compositionCare:"Acetate frame.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Warm Brown", swatch:"#AF3E06", images:{ model:[], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/C8DC66E1-BB21-4807-BC2C-C7F52A8005CE.png?v=1778858287"], detail:[] } }] },
    { id:"tenese-gold-earrings", sku:"JWL-TGE-005", name:"Stainless Steel Tenesè Gold Earrings", brand:"NIRIUS CO", category:"jewelry", price:380, salePrice:null, badge:"new", sizes:["Stainless Steel"], stock:10, status:"active", featured:true, description:"Sculptural gold earrings.", productFeatures:"18k gold-plated.", compositionCare:"Gold-plated stainless steel.", shippingReturns:"Free shipping over R1500.", variants:[{ color:"Gold", swatch:"#d4af37", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6607.png?v=1778790153"], detail:[] } }] },
    { id:"janedore-leather-pouch", sku:"ACC-JLP-007", name:"Janedore Debossed Leather Pouch", brand:"JANEDORE", category:"bags", price:50, salePrice:null, badge:null, sizes:["OS"], stock:50, status:"active", featured:false, description:"Supple debossed leather pouch.", productFeatures:"Genuine leather.", compositionCare:"100% Leather.", shippingReturns:"Free with sunglass purchase.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"], detail:[] } }] },
    { id:"janedore-raffle-brandy-black-dress", sku:"DRS-RBB-001", name:"Janedore Raffle Brandy Black Dress", brand:"JANEDORE", category:"dresses", price:450, salePrice:null, badge:"new", sizes:["S","M","L"], stock:40, status:"active", featured:true, description:"Fluid silhouette and quiet tension.", productFeatures:"Weighted crepe fabric.", compositionCare:"100% Polyester.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/116AE49E-1C83-474E-B538-B3147C826859.png?v=1778858287"], detail:[] } }] },
    { id:"thato-rumination-tea-parfum", sku:"PRF-TRT-001", name:"Thato Rumination Tea Parfum", brand:"THATO", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:30, status:"active", featured:true, description:"A contemplative fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Pale Linen", swatch:"#EBEDE0", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"], detail:[] } }] },
    { id:"thato-pink-rain-parfum", sku:"PRF-TPR-002", name:"Thato Pink Rain Parfum", brand:"THATO", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:25, status:"active", featured:true, description:"A delicate, romantic fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Pink Rain", swatch:"#F3DBD7", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6630.png?v=1778801279"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/FD9FBEA5-4CD8-421E-A549-F67099AD9B79.png?v=1778801677"], detail:[] } }] },
    { id:"janedore-studded-halter-dress", sku:"DRS-SHN-001", name:"Janedore Studded Halter Neck Dress", brand:"JANEDORE", category:"dresses", price:680, salePrice:null, badge:"new", sizes:["XS","S","M","L"], stock:20, status:"active", featured:true, description:"Refined edge meets feminine structure.", productFeatures:"Structured halter neckline.", compositionCare:"95% Polyester, 5% Elastane.", shippingReturns:"Free shipping over R1000.", variants:[{ color:"Black", swatch:"#111", images:{ model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/BB8C5723-337D-4CB3-B9B8-9FC4BF36CBFE.png?v=1779001142"], ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/27BAAA95-3B6D-4CCE-A2D8-FFF60326A881.png?v=1779001142"], detail:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_1.png?v=1779001150","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_2.png?v=1779001160","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/studded_detail_3.png?v=1779001170"] } }] }
  ];
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
  if(page==="login"){ ensureNavScrolled(); }
  if(page==="account"){ ensureNavScrolled(); }
  setTimeout(refreshSwipeTracks,50);
}

// ... [Keep all existing functions unchanged until addToCart] ...

function addToCart(productId, size) {
  const product=PRODUCTS.find(p=>p.id===productId); if(!product || isProductSoldOut(product)) return;
  const vi=S.productVariantSelections[productId]??0; const variant=(product.variants||[])[vi]??{};
  const existing=S.cart.find(i=>i.productId===productId&&i.size===(size||product.sizes[0])&&i.variantIndex===vi);
  if(existing) existing.qty++; else S.cart.push({productId,variantIndex:vi,size:size||product.sizes[0]||'OS',qty:1,name:product.name,brand:product.brand,price:product.price,salePrice:product.salePrice,color:variant.color||'Default',thumbnail:getProductThumbnail(product,vi)});
  updateBadges(); renderCart(); saveCartToStorage();
}
function removeFromCart(productId, size, vi) { S.cart=S.cart.filter(i=>!(i.productId===productId&&i.size===size&&i.variantIndex===vi)); updateBadges(); renderCart(); saveCartToStorage(); }
function changeQty(productId, size, delta, vi) { const item=S.cart.find(i=>i.productId===productId&&i.size===size&&i.variantIndex===vi); if(item) item.qty=Math.max(1,item.qty+delta); renderCart(); saveCartToStorage(); }

// ... [Keep all existing functions unchanged until toggleWish] ...

function toggleWish(productId) {
  const product=PRODUCTS.find(p=>p.id===productId); if(!product) return;
  const idx=S.wishlist.findIndex(w=>w.id===productId); if(idx>=0) S.wishlist.splice(idx,1); else S.wishlist.push(product);
  updateBadges(); renderWishlistPage(); saveWishlistToStorage();
  const isWished = S.wishlist.some(w=>w.id===productId); const iconClass = isWished ? "ph-fill ph-bookmark-simple" : "ph-thin ph-bookmark-simple";
  document.querySelectorAll(`.price-bookmark[onclick*="toggleWish('${productId}')"]`).forEach(btn=>{ btn.classList.toggle("wished", isWished); const icon=btn.querySelector("i"); if(icon) icon.className = iconClass; });
  const modalBtn = document.querySelector(".modal-wish-btn"); if(modalBtn && S.currentPage==="product-detail"){ modalBtn.classList.toggle("wished", isWished); const icon = modalBtn.querySelector("i"); if(icon) icon.className = iconClass; }
}

async function init() {
  // Set nav scrolled immediately so header is visible
  if (DOM.mainNav) DOM.mainNav.classList.add("scrolled");
  
  buildBanner(); initNavScroll();
  showLoading(DOM.arrivalsGrid); showLoading(DOM.allProductsGrid);
  
  // Load cart from storage first
  loadCartFromStorage();
  updateBadges();
  
  PRODUCTS = await fetchProducts();
  
  // Load wishlist after products are available
  loadWishlistFromStorage();
  updateBadges();
  
  setHeroImage(); buildArrivals();
  ["main-footer","products-footer","category-footer","campaign-footer","cart-footer","wishlist-footer","editorial-footer","checkout-footer","login-footer","account-footer"].forEach(buildFooter);
  buildCampaignSlider();
  
  const route = getRouteFromHash();
  if (route.page === 'product-detail') goToProduct(route.productId);
  else if (route.page === 'category') navigateToCategory(route.cat);
  else if (route.page === 'login') navigateToLogin();
  else if (route.page === 'account') navigateToAccount();
  else navigateTo(route.page);
  
  // Check nav state after a short delay for home page
  setTimeout(checkNavForHome, 100);
}
init();
