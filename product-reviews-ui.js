// JANEDORE product review presentation.
// Loaded after product-detail.js. The existing accordion, eligibility check,
// review modal, Firebase documents and moderation endpoints remain unchanged.
(function () {
  let items = [];
  let sort = 'newest';
  let activeProductId = '';

  function time(review) {
    return review && review.createdAt && review.createdAt.toDate
      ? review.createdAt.toDate().getTime() : 0;
  }

  function stars(rating) {
    return Array.from({ length: 5 }, (_, i) =>
      '<i class="' + (i < Math.round(rating) ? 'ph-fill' : 'ph') +
      ' ph-star" aria-hidden="true"></i>'
    ).join('');
  }

  function renderList() {
    const list = document.getElementById('product-review-list');
    if (!list) return;
    const sorted = [...items].sort((a, b) => {
      if (sort === 'highest') return (Number(b.rating) || 0) - (Number(a.rating) || 0) || time(b) - time(a);
      if (sort === 'lowest') return (Number(a.rating) || 0) - (Number(b.rating) || 0) || time(b) - time(a);
      return time(b) - time(a);
    });

    list.innerHTML = sorted.map(review => {
      const createdAt = time(review);
      const date = createdAt
        ? new Date(createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      const clock = createdAt
        ? new Date(createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '';
      const authorName = String(review.name || 'Anonymous');
      const author = [authorName, review.city]
        .filter(Boolean).map(escapeHTML).join(' · ');
      const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));
      const verified = review.verified === true
        ? '<span class="product-review-verified"><i class="ph ph-check-circle" aria-hidden="true"></i> Verified purchase</span>' : '';
      const featured = review.featured === true
        ? '<span class="product-review-featured">Featured</span>' : '';
      const reply = review.vendorReply
        ? '<div class="product-review-brand-reply"><span>Brand reply</span><p>' + escapeHTML(review.vendorReply) + '</p></div>' : '';

      return '<article class="product-review-card">' +
        '<div class="product-review-card-head"><span class="product-review-avatar" aria-hidden="true"><i class="ph ph-user" aria-hidden="true"></i></span>' +
        '<div class="product-review-author-wrap">' +
        '<div class="product-review-author-line"><p class="product-review-author">' + author + '</p>' + featured + '</div>' +
        (date ? '<p class="product-review-date">' + escapeHTML(date) + (clock ? ' · ' + escapeHTML(clock) : '') + '</p>' : '') +
        '</div><p class="product-review-stars" aria-label="' + rating + ' out of 5">' + stars(rating) + '</p></div>' +
        (review.text ? '<p class="product-review-text">' + escapeHTML(review.text) + '</p>' : '') +
        (review.rewarded ? '<p class="product-review-reward">Received a thank-you voucher for this review</p>' : '') +
        reply + reviewPhotosHtml(review, 'Photo from ' + escapeHTML(review.name || 'a customer')) +
        (verified ? '<div class="product-review-verification-row">' + verified + '</div>' : '') +
        '</article>';
    }).join('');
  }

  window.sortProductReviews = function (value) {
    if (!['newest', 'highest', 'lowest'].includes(value)) return;
    sort = value;
    renderList();
  };

  window.loadProductReviewsSection = async function (productId) {
    let reviews = [];
    try {
      const snap = await db.collection('reviews').where('productId', '==', productId).limit(100).get();
      reviews = snap.docs.map(doc => doc.data());
    } catch (error) {
      console.warn('[REVIEWS]', error.message);
    }

    if (S.currentReviewProductId !== productId) return;
    const body = document.getElementById('product-reviews-body');
    const count = document.getElementById('product-review-count');
    if (!body) return;

    reviews.sort((a, b) => time(b) - time(a));
    if (count) count.textContent = reviews.length ? '(' + reviews.length + ')' : '';

    const writeButton = '<div id="product-review-write" hidden style="margin:0 0 20px;">' +
      '<button type="button" class="cart-empty-btn" onclick="openReviewModal()">Write a review</button></div>' +
      '<div id="product-review-edit" hidden style="margin:0 0 12px;">' +
      '<button type="button" class="cart-empty-btn" onclick="openReviewEditModal()">Edit your review</button></div>' +
      '<p id="product-review-edit-note" hidden class="product-review-edit-note"></p>';

    if (!reviews.length) {
      items = [];
      activeProductId = productId;
      body.innerHTML = '<div class="product-reviews-empty"><p>There are no reviews for this product yet.</p></div>' + writeButton;
      showReviewButtonIfBought(productId);
      return;
    }

    const ratings = reviews.map(review => Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0))));
    const average = reviews.reduce((total, review) => total + (Number(review.rating) || 0), 0) / reviews.length;
    const breakdown = [5, 4, 3, 2, 1].map(star => {
      const amount = ratings.filter(rating => rating === star).length;
      const width = Math.round(amount / reviews.length * 100);
      return '<div class="product-review-breakdown-row"><span>' + star +
        ' <i class="ph-fill ph-star" aria-hidden="true"></i></span>' +
        '<span class="product-review-breakdown-track"><span style="width:' + width + '%"></span></span>' +
        '<span>' + amount + '</span></div>';
    }).join('');

    items = reviews;
    if (activeProductId !== productId) sort = 'newest';
    activeProductId = productId;

    body.innerHTML = '<section class="product-reviews-summary" aria-label="Customer rating summary">' +
      '<div class="product-reviews-average"><strong>' + average.toFixed(1) + '</strong>' +
      '<span class="product-review-stars" aria-label="' + average.toFixed(1) + ' out of 5">' + stars(average) + '</span>' +
      '<p>' + reviews.length + ' customer review' + (reviews.length === 1 ? '' : 's') + '</p></div>' +
      '<div class="product-review-breakdown">' + breakdown + '</div></section>' +
      writeButton +
      '<div class="product-reviews-toolbar">' +
      '<label for="product-review-sort">Sort by</label>' +
      '<select id="product-review-sort" onchange="sortProductReviews(this.value)">' +
      '<option value="newest">Most recent</option><option value="highest">Highest rating</option>' +
      '<option value="lowest">Lowest rating</option></select></div>' +
      '<div id="product-review-list" class="product-review-list"></div>';

    const select = document.getElementById('product-review-sort');
    if (select) select.value = sort;
    renderList();
    showReviewButtonIfBought(productId);
  };
})();
