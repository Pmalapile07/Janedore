(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc          = window._esc;
  var safeEl       = window._safeEl;
  var fmtDate      = window._fmtDate;
  var showToast    = window._showToast;
  var statusBadge  = window._statusBadge;
  var isSuperAdmin = window._isSuperAdmin;
  var reviewsRef   = window._reviewsRef;
  var productsRef  = window._productsRef;

  var role = null;

  /* ─────────────────────────────────────────────────────────
     RENDER REVIEWS TAB
  ───────────────────────────────────────────────────────── */
  window._renderReviewsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    role = window._currentUserRole;

    var canModerate = window._can('reviews', 'moderate');
    var isVendor    = role === 'VENDOR';
    var vendorId    = window._currentVendorId;

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Reviews</div>' +
        '<select class="filter-select" id="review-status-filter" onchange="window._filterReviews()">' +
          '<option value="">All</option>' +
          '<option value="approved">Approved</option>' +
          '<option value="pending">Pending</option>' +
          '<option value="hidden">Hidden</option>' +
        '</select>' +
      '</div>' +
      '<div id="reviews-list"><div class="empty-state"><div class="empty-state-text">Loading reviews...</div></div></div>';

    // Build a product lookup map first so we can show product names
    var productMap = {};
    productsRef.get().then(function(snap) {
      snap.docs.forEach(function(d) {
        productMap[d.id] = d.data().name || 'Unknown product';
      });

      // Now load reviews
      var query = reviewsRef.orderBy('createdAt', 'desc').limit(100);

      // Vendor: scope to their own vendorId
      if (isVendor && vendorId) {
        query = query.where('vendorId', '==', vendorId);
      }

      return query.get();
    }).then(function(revs) {
      window._reviewsData = revs.docs.map(function(d) {
        var r = Object.assign({ id: d.id }, d.data());
        r.productName = productMap[r.productId] || 'Unknown product';
        return r;
      });
      renderReviewsList(window._reviewsData);
    }).catch(function(e) {
      console.error('[REVIEWS_TAB]', e);
      var el = safeEl('reviews-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Could not load reviews.</div></div>';
    });
  };

  /* ─────────────────────────────────────────────────────────
     RENDER LIST
  ───────────────────────────────────────────────────────── */
  function renderReviewsList(reviews) {
    var filter = (safeEl('review-status-filter') || {}).value || '';
    var filtered = filter
      ? reviews.filter(function(r) { return (r.moderationStatus || 'pending') === filter; })
      : reviews;

    var el = safeEl('reviews-list');
    if (!el) return;

    if (filtered.length === 0) {
      var message = filter
        ? 'No ' + filter + ' reviews.'
        : (role === 'VENDOR' ? 'No reviews for your products yet.' : 'No reviews yet.');
      el.innerHTML = '<div class="orders-empty-state">' +
        '<div class="orders-empty-icon"><i class="ph-light ph-star"></i></div>' +
        '<div class="orders-empty-title">' + (filter ? 'No matches' : 'All clear') + '</div>' +
        '<div class="orders-empty-sub">' + message + '</div>' +
      '</div>';
      return;
    }

    var canModerate = window._can('reviews', 'moderate');
    var canDelete   = isSuperAdmin();

    el.innerHTML = filtered.map(function(r) {
      var stars = '';
      var rating = Math.min(5, Math.max(0, parseInt(r.rating) || 0));
      for (var i = 0; i < 5; i++) {
        stars += i < rating ? '★' : '☆';
      }

      return '<div class="card" style="margin-bottom:10px;">' +
        '<div class="card-header">' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
            '<span style="color:#f59e0b;font-size:14px;white-space:nowrap;">' + stars + '</span>' +
            '<span style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
              esc(r.name || 'Anonymous') +
            '</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">' +
            statusBadge(r.moderationStatus || 'pending') +
            (r.featured ? '<span class="badge badge-paid">Featured</span>' : '') +
          '</div>' +
        '</div>' +

        '<div style="padding:12px 14px;">' +

          // Product name
          '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted2);margin-bottom:6px;">' +
            esc(r.productName || 'Unknown product') +
            (r.variant ? ' · ' + esc(r.variant) : '') +
          '</div>' +

          // Review text
          (r.text
            ? '<p style="font-size:12.5px;font-weight:300;line-height:1.55;margin-bottom:10px;color:var(--text);">' +
                esc(r.text) +
              '</p>'
            : '') +

          // Date
          '<div style="font-size:10px;color:var(--muted);margin-bottom:10px;">' +
            fmtDate(r.createdAt) +
          '</div>' +

          // Vendor reply
          (r.vendorReply
            ? '<div style="background:var(--accent-soft);border-radius:var(--r-xs);padding:8px 12px;margin-bottom:8px;">' +
                '<div style="font-size:10px;font-weight:600;letter-spacing:0.06em;color:var(--accent);margin-bottom:4px;">Brand reply</div>' +
                '<div style="font-size:12px;color:var(--text);line-height:1.45;">' + esc(r.vendorReply) + '</div>' +
              '</div>'
            : '') +

          // Action buttons
          (canModerate || canDelete
            ? '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                (canModerate
                  ? '<button class="btn btn-xs btn-success" onclick="window._approveReview(\'' + esc(r.id) + '\')">Approve</button>' +
                    '<button class="btn btn-xs btn-ghost" onclick="window._hideReview(\'' + esc(r.id) + '\')">Hide</button>' +
                    '<button class="btn btn-xs btn-ghost" onclick="window._featureReview(\'' + esc(r.id) + '\',' + (!r.featured) + ')">' +
                      (r.featured ? 'Unfeature' : 'Feature') +
                    '</button>'
                  : '') +
                (canDelete
                  ? '<button class="btn btn-xs btn-danger" onclick="window._deleteReview(\'' + esc(r.id) + '\')">Delete</button>'
                  : '') +
              '</div>'
            : '') +

        '</div>' +
      '</div>';
    }).join('');
  }

  window._filterReviews = function() {
    if (window._reviewsData) renderReviewsList(window._reviewsData);
  };

  /* ─────────────────────────────────────────────────────────
     REVIEW ACTIONS
  ───────────────────────────────────────────────────────── */

  window._approveReview = function(reviewId) {
    if (!window._guard('reviews', 'moderate')) return;
    reviewsRef.doc(reviewId).update({ moderationStatus: 'approved' }).then(function() {
      showToast('Review approved');
      updateLocalReview(reviewId, { moderationStatus: 'approved' });
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._hideReview = function(reviewId) {
    if (!window._guard('reviews', 'moderate')) return;
    reviewsRef.doc(reviewId).update({ moderationStatus: 'hidden' }).then(function() {
      showToast('Review hidden');
      updateLocalReview(reviewId, { moderationStatus: 'hidden' });
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._featureReview = function(reviewId, featured) {
    if (!window._guard('reviews', 'moderate')) return;
    reviewsRef.doc(reviewId).update({ featured: !!featured }).then(function() {
      showToast(featured ? 'Review featured' : 'Review unfeatured');
      updateLocalReview(reviewId, { featured: !!featured });
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  window._deleteReview = function(reviewId) {
    if (!isSuperAdmin()) {
      showToast('Only Super Admin can delete reviews.', 'error');
      return;
    }
    if (!confirm('Delete this review? This cannot be undone.')) return;
    reviewsRef.doc(reviewId).delete().then(function() {
      showToast('Review deleted');
      window._reviewsData = (window._reviewsData || []).filter(function(x) { return x.id !== reviewId; });
      renderReviewsList(window._reviewsData);
    }).catch(function(e) { showToast('Error: ' + e.message, 'error'); });
  };

  function updateLocalReview(reviewId, updates) {
    var r = (window._reviewsData || []).find(function(x) { return x.id === reviewId; });
    if (r) {
      Object.keys(updates).forEach(function(key) { r[key] = updates[key]; });
      renderReviewsList(window._reviewsData);
    }
  }

})();
