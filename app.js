const DOM = {
  get cartBadge() { return document.getElementById("cart-badge"); },
  get wishBadge() { return document.getElementById("wish-badge"); },
  get cartItemCount() { return document.getElementById("cart-item-count"); },
  get searchOverlay() { return document.getElementById("search-overlay"); },
  get searchInput() { return document.getElementById("search-input"); },
  get searchBody() { return document.getElementById("search-body"); },
  get menuBackdrop() { return document.getElementById("menu-backdrop"); },
  get menuDrawer() { return document.getElementById("menu-drawer"); },
  get cartBackdrop() { return document.getElementById("cart-backdrop"); },
  get cartPanel() { return document.getElementById("cart-panel"); },
  get arrivalsGrid() { return document.getElementById("arrivals-grid"); },
  get allProductsGrid() { return document.getElementById("all-products-grid"); },
  get categoryProductsGrid() { return document.getElementById("category-products-grid"); },
  get categoryNameTag() { return document.getElementById("category-name-tag"); },
  get categoryDescriptionWrap() { return document.getElementById("category-description-wrap"); },
  get productDetail() { return document.getElementById("page-product-detail"); },
  get cartBody() { return document.getElementById("cart-body"); },
  get cartFoot() { return document.getElementById("cart-foot"); },
  get cartPageContent() { return document.getElementById("cart-page-content"); },
  get wishPageContent() { return document.getElementById("wish-page-content"); },
  get campaignSlides() { return document.getElementById("campaign-slides"); },
  get reviewStars() { return document.getElementById("review-stars"); },
  get reviewText() { return document.getElementById("review-text"); },
  get reviewName() { return document.getElementById("review-name"); },
  get reviewImageInput() { return document.getElementById("review-image-input"); },
  get reviewImagePreview() { return document.getElementById("review-image-preview"); },
  get reviewModalBackdrop() { return document.getElementById("review-modal-backdrop"); },
  get gridToggleSvg() { return document.getElementById("grid-toggle-svg"); },
  get catGridToggleSvg() { return document.getElementById("cat-grid-toggle-svg"); },
  get mainNav() { return document.getElementById("main-nav"); },
  get homepageNewsletterSection() { return document.getElementById("homepage-newsletter-section"); },
  get heroBg() { return document.getElementById("hero-bg"); },
  hero: null,
  get chatBubble() { return document.getElementById("live-chat-bubble"); }
};

let PRODUCTS = [];
const CURRENCIES = { ZAR:{label:"ZAR R",symbol:"R"}, BWP:{label:"BWP P",symbol:"P"}, USD:{label:"USD $",symbol:"$"}, LSL:{label:"LSL M",symbol:"M"}, NAD:{label:"NAD N$",symbol:"N$"} };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect fill='%23f0ede8' width='400' height='500'/%3E%3C/svg%3E";

function formatPrice(price, currency) {
  if (currency && CURRENCIES[currency]) {
    const sym = CURRENCIES[currency].symbol;
    return sym + ' ' + (price || 0).toLocaleString();
  }
  return 'R ' + (price || 0).toLocaleString();
}

const S = {
  cart:[], wishlist:[], currentPage:"home", currentCategoryPage:null, selectedSize:null, productVariantSelections:{}, imageMode:"ghost", gridCols:2, gridColsCat:2, filter:{cat:"all",size:"all",price:"all",vendor:null}, catFilter:{size:"all",price:"all"}, campaignSlideIndex:0, recentlyViewed:[], currentSlide:0, cardTouchStartX:{}, cardSlideIndex:{}, swipeState:{}, previousCollectionPage:null, currentReviewProductId:null, saleMode:false, categoriesSlideIndex:0, productInfoTab:'description', stickyExtended:false, stickyWishHidden:false, activeSortTab:null
};
