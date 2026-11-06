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

  function relativeReviewDate(timestamp) {
    const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 7) return days + ' days ago';
    if (days < 14) return '1 week ago';
    if (days < 30) return Math.floor(days / 7) + ' weeks ago';
    if (days < 60) return '1 month ago';
    if (days < 365) return Math.floor(days / 30) + ' months ago';
    if (days < 730) return '1 year ago';
    return Math.floor(days / 365) + ' years ago';
  }

  function reviewVisitorId() {
    const key = 'janedore_review_visitor';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = window.crypto && crypto.randomUUID ? crypto.randomUUID() :
          'xxxxxxxxyxxx4xxxyxxxyxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 3 | 8)).toString(16);
          });
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) { return ''; }
  }

  function getReviewInteraction(reviewId) {
    try {
      const saved = JSON.parse(localStorage.getItem('janedore_review_interactions') || '{}');
      return saved[reviewId] || {};
    } catch (_) { return {}; }
  }

  function saveReviewInteraction(reviewId, interaction) {
    try {
      const saved = JSON.parse(localStorage.getItem('janedore_review_interactions') || '{}');
      saved[reviewId] = Object.assign({}, saved[reviewId], interaction);
      localStorage.setItem('janedore_review_interactions', JSON.stringify(saved));
      return true;
    } catch (_) { return false; }
  }

  function findReview(reviewId) {
    return items.find(review => review.id === reviewId);
  }

  window.submitReviewFeedback = async function(reviewId, helpful, button) {
    const visitorId = reviewVisitorId();
    if (!visitorId) return alert('Please enable site storage to vote.');
    button.disabled = true;
    try {
      const response = await fetch('/api/reviews/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, helpful, visitorId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your vote.');
      saveReviewInteraction(reviewId, { vote: helpful ? 'helpful' : 'notHelpful' });
      const review = findReview(reviewId);
      if (review) {
        const countKey = helpful ? 'helpfulCount' : 'notHelpfulCount';
        review[countKey] = (Number(review[countKey]) || 0) + 1;
      }
      renderList();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  };

  window.flagProductReview = async function(reviewId, button) {
    const visitorId = reviewVisitorId();
    if (!visitorId) return alert('Please enable site storage to report a review.');
    button.disabled = true;
    try {
      const response = await fetch('/api/reviews/flag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, visitorId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not report this review.');
      saveReviewInteraction(reviewId, { flagged: true });
      renderList();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  };

  function formatPersonName(value) {
    return String(value || 'Anonymous')
      .trim()
      .toLocaleLowerCase('en-ZA')
      .replace(/(^|[\s'-])([\p{L}])/gu, (_, separator, letter) =>
        separator + letter.toLocaleUpperCase('en-ZA')
      );
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
      const date = createdAt ? relativeReviewDate(createdAt) : '';
      const authorName = formatPersonName(review.name);
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
        '<div class="product-review-card-head">' +
        '<div class="product-review-author-wrap">' +
        '<div class="product-review-author-line"><p class="product-review-author">' + author + '</p>' + featured + '</div>' +
        '<div class="product-review-meta">' +
        (date ? '<span class="product-review-date">' + escapeHTML(date) + '</span>' : '') +
        verified + '</div></div></div>' +
        '<p class="product-review-stars" aria-label="' + rating + ' out of 5">' + stars(rating) + '</p>' +
        (review.text ? '<p class="product-review-text">' + escapeHTML(review.text) + '</p>' : '') +
        (review.rewarded ? '<p class="product-review-reward">Received a thank-you voucher for this review</p>' : '') +
        reviewPhotosHtml(review, 'Photo from ' + escapeHTML(authorName === 'Anonymous' ? 'a customer' : authorName)) +
        reply +
        (() => {
          const interaction = getReviewInteraction(review.id || '');
          const vote = interaction.vote || '';
          const flagged = interaction.flagged === true;
          const reviewId = escapeHTML(review.id || '');
          return '<div class="product-review-actions">' +
            '<span class="product-review-helpful-label">Was this helpful to you?</span>' +
            '<div class="product-review-votes">' +
              '<button type="button" class="product-review-action' + (vote === 'helpful' ? ' is-selected' : '') + '"' + (vote ? ' disabled' : '') + ' aria-pressed="' + (vote === 'helpful') + '" aria-label="Yes, helpful" onclick="submitReviewFeedback(\'' + reviewId + '\',true,this)"><i class="ph ph-thumbs-up" aria-hidden="true"></i><span>' + (Number(review.helpfulCount) || 0) + '</span></button>' +
              '<button type="button" class="product-review-action' + (vote === 'notHelpful' ? ' is-selected' : '') + '"' + (vote ? ' disabled' : '') + ' aria-pressed="' + (vote === 'notHelpful') + '" aria-label="No, not helpful" onclick="submitReviewFeedback(\'' + reviewId + '\',false,this)"><i class="ph ph-thumbs-down" aria-hidden="true"></i><span>' + (Number(review.notHelpfulCount) || 0) + '</span></button>' +
            '</div>' +
            '<button type="button" class="product-review-flag' + (flagged ? ' is-selected' : '') + '"' + (flagged ? ' disabled' : '') + ' aria-pressed="' + flagged + '" onclick="flagProductReview(\'' + reviewId + '\',this)"><i class="ph-fill ph-flag" aria-hidden="true"></i><span>' + (flagged ? 'Review flagged' : 'Flag review') + '</span></button>' +
          '</div>';
        })() +
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
      reviews = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
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

    const sortToolbar = reviews.length > 1
      ? '<div class="product-reviews-toolbar">' +
        '<label for="product-review-sort">Sort by</label>' +
        '<select id="product-review-sort" onchange="sortProductReviews(this.value)">' +
        '<option value="newest">Most recent</option><option value="highest">Highest rating</option>' +
        '<option value="lowest">Lowest rating</option></select></div>'
      : '';

    body.innerHTML = '<section class="product-reviews-summary" aria-label="Customer rating summary">' +
      '<div class="product-reviews-average"><strong>' + average.toFixed(1) + '</strong>' +
      '<span class="product-review-stars" aria-label="' + average.toFixed(1) + ' out of 5">' + stars(average) + '</span>' +
      '<p>' + reviews.length + ' customer review' + (reviews.length === 1 ? '' : 's') + '</p></div>' +
      '<div class="product-review-breakdown">' + breakdown + '</div></section>' +
      writeButton +
      sortToolbar +
      '<div id="product-review-list" class="product-review-list"></div>';

    const select = document.getElementById('product-review-sort');
    if (select) select.value = sort;
    renderList();
    showReviewButtonIfBought(productId);
  };
})();
