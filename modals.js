function openReviewModal() { DOM.reviewModalBackdrop.classList.add("open"); S.reviewRating=0; S.reviewImage=null; updateReviewStars(); DOM.reviewText.value=""; DOM.reviewName.value=""; DOM.reviewImagePreview.style.display="none"; DOM.reviewImageInput.value=""; const em=document.getElementById('review-email'); if(em) em.value=S.reviewEmail||''; const er=document.getElementById('review-error'); if(er) er.style.display='none'; }
function closeReviewModal() { DOM.reviewModalBackdrop.classList.remove("open"); }
function setReviewRating(r) { S.reviewRating=r; updateReviewStars(); }
function updateReviewStars() { document.querySelectorAll("#review-stars .review-star-btn").forEach((b,i)=>{ b.innerHTML = i < S.reviewRating ? '<i class="ph-fill ph-star"></i>' : '<i class="ph ph-star"></i>'; b.classList.toggle("filled", i < S.reviewRating); }); }
function handleReviewImage(event) { const file=event.target.files[0]; if(file){ S.reviewImage=file; const reader=new FileReader(); reader.onload=e=>{ DOM.reviewImagePreview.src=e.target.result; DOM.reviewImagePreview.style.display="block"; }; reader.readAsDataURL(file); } }
// Saved by the server (reviews-api.js), which checks the reviewer bought
// the product; the email they ordered with is required but never shown.
async function submitReview() {
  const err = document.getElementById('review-error');
  const fail = msg => { if (err) { err.textContent = msg; err.style.display = 'block'; } };
  if (S.reviewRating === 0) return fail('Please choose a star rating.');
  const email = (document.getElementById('review-email').value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter the email you ordered with.');
  if (!S.currentReviewProductId) { closeReviewModal(); return; }
  const btn = document.querySelector('#review-modal .review-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    // The photo from their device goes to Cloudinary first (the same
    // images-only upload the chat uses, chat.js), then its link is saved
    // with the review.
    let imageUrl = '';
    if (S.reviewImage) {
      if (S.reviewImage.size > 8000000) return fail('That photo is too big. Please choose one under 8MB.');
      imageUrl = await uploadChatImageToCloudinary(S.reviewImage);
    }
    const res = await fetch('/api/reviews', { method: 'POST', headers: await reviewAuthHeaders(), body: JSON.stringify({
      productId: S.currentReviewProductId, rating: S.reviewRating, text: DOM.reviewText.value.trim(),
      name: DOM.reviewName.value.trim(), email, imageUrl, orders: deviceOrdersForReviews() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data.error || 'Could not save your review. Please try again.');
  } catch (e) {
    return fail(e && e.message && /upload|image/i.test(e.message) ? 'Your photo could not be uploaded. Please try again.' : 'Could not save your review. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit review'; }
  }
  closeReviewModal();
  if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Thanks for your review', 'ph-star');
  if (S.currentPage === 'product-detail' && typeof loadProductReviewsSection === 'function') loadProductReviewsSection(S.currentReviewProductId);
}
