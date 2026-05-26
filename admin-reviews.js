(function () {
  'use strict';

  if (!window._adminDB) return;

  var esc = window._esc;
  var safeEl = window._safeEl;
  var fmtDate = window._fmtDate;
  var showToast = window._showToast;
  var statusBadge = window._statusBadge;
  var isSuperAdmin = window._isSuperAdmin;
  var requireSuperAdmin = window._requireSuperAdmin;
  var reviewsRef = window._reviewsRef;

  window._renderReviewsTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="section-header" style="margin-bottom:12px;"><div class="section-title">Reviews</div><select class="filter-select" id="review-status-filter" onchange="filterReviews()"><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="hidden">Hidden</option></select></div><div id="reviews-list"><div class="empty-state"><div class="empty-state-icon">★</div><div class="empty-state-text">Loading...</div></div></div>';
    reviewsRef.orderBy('createdAt','desc').limit(50).get().then(function(revs) { window._reviewsData = revs.docs.map(function(d){ return Object.assign({id:d.id},d.data()); }); renderReviewsList(window._reviewsData); }).catch(function(e) { console.error('[REVIEWS_TAB]', e); });
  };

  function renderReviewsList(reviews) {
    var filter = (safeEl('review-status-filter')||{}).value || '';
    var filtered = filter ? reviews.filter(function(r){ return (r.moderationStatus||'pending') === filter; }) : reviews;
    var el = safeEl('reviews-list');
    if (!el) return;
    if (filtered.length === 0) { el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">★</div><div class="empty-state-text">No reviews.</div></div>'; return; }
    el.innerHTML = filtered.map(function(r) {
      var stars = '★'.repeat(Math.min(5, Math.max(0, parseInt(r.rating)||0)));
      return '<div class="card"><div class="card-header"><div style="display:flex;align-items:center;gap:8px;"><span style="color:#f59e0b;font-size:13px;">' + stars + '</span><span style="font-size:10px;color:var(--muted);">' + esc(r.name||'Anonymous') + ' - ' + fmtDate(r.createdAt) + '</span></div><div style="display:flex;gap:6px;align-items:center;">' + statusBadge(r.moderationStatus||'pending') + (r.featured ? '<span class="badge badge-paid">Featured</span>' : '') + '</div></div><div style="padding:10px 14px;"><p style="font-size:12.5px;font-weight:300;line-height:1.55;margin-bottom:10px;">' + esc(r.text||'') + '</p>' + (isSuperAdmin() ? '<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-xs btn-success" onclick="moderateReview(\'' + esc(r.id) + '\',\'approved\')">Approve</button><button class="btn btn-xs btn-ghost" onclick="moderateReview(\'' + esc(r.id) + '\',\'hidden\')">Hide</button><button class="btn btn-xs btn-ghost" onclick="featureReview(\'' + esc(r.id) + '\',' + (!r.featured) + ')">' + (r.featured?'Unfeature':'Feature') + '</button><button class="btn btn-xs btn-danger" onclick="deleteReview(\'' + esc(r.id) + '\')">Delete</button></div>' : '') + '</div></div>';
    }).join('');
  }

  window.filterReviews = function() { if (window._reviewsData) renderReviewsList(window._reviewsData); };
  window.moderateReview = function(reviewId, status) { if (!{approved:true,pending:true,hidden:true}[status]) { showToast('Invalid moderation status', 'error'); return; } reviewsRef.doc(reviewId).update({ moderationStatus: status }).then(function() { showToast('Review ' + status); var r = (window._reviewsData||[]).find(function(x){ return x.id===reviewId; }); if (r) { r.moderationStatus = status; renderReviewsList(window._reviewsData); } }).catch(function(e) { console.error('[MODERATE_REVIEW]', e); showToast('Error: ' + e.message, 'error'); }); };
  window.featureReview = function(reviewId, featured) { reviewsRef.doc(reviewId).update({ featured: !!featured }).then(function() { showToast(featured ? 'Review featured' : 'Review unfeatured'); var r = (window._reviewsData||[]).find(function(x){ return x.id===reviewId; }); if (r) { r.featured = !!featured; renderReviewsList(window._reviewsData); } }).catch(function(e) { console.error('[FEATURE_REVIEW]', e); showToast('Error: ' + e.message, 'error'); }); };
  window.deleteReview = function(reviewId) { if (!requireSuperAdmin('deleteReview')) return; if (!confirm('Delete this review?')) return; reviewsRef.doc(reviewId).delete().then(function() { showToast('Review deleted'); window._reviewsData = (window._reviewsData||[]).filter(function(x){ return x.id!==reviewId; }); renderReviewsList(window._reviewsData); }).catch(function(e) { console.error('[DELETE_REVIEW]', e); showToast('Error: ' + e.message, 'error'); }); };

})();
