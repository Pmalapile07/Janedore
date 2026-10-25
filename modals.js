function openReviewModal() { DOM.reviewModalBackdrop.classList.add("open"); S.reviewRating=0; setReviewPhotos([]); updateReviewStars(); DOM.reviewText.value=""; DOM.reviewName.value=""; DOM.reviewImageInput.value=""; const em=document.getElementById('review-email'); if(em) em.value=S.reviewEmail||''; const er=document.getElementById('review-error'); if(er) er.style.display='none'; }
function closeReviewModal() { DOM.reviewModalBackdrop.classList.remove("open"); }
function setReviewRating(r) { S.reviewRating=r; updateReviewStars(); }
function updateReviewStars() { document.querySelectorAll("#review-stars .review-star-btn").forEach((b,i)=>{ b.innerHTML = i < S.reviewRating ? '<i class="ph-fill ph-star"></i>' : '<i class="ph ph-star"></i>'; b.classList.toggle("filled", i < S.reviewRating); }); }

// ==================== REVIEW PHOTOS ====================
// Up to 4 photos (reviews-api.js keeps the same limit), shown in the
// order they'll appear on the review. The × in each corner removes it;
// dragging one onto another moves it there (pointer events, so it works
// with a finger as well as a mouse).
const MAX_REVIEW_PHOTOS = 4;
function setReviewPhotos(list) {
  (S.reviewImages || []).forEach(p => { if (!list.includes(p)) URL.revokeObjectURL(p.src); });
  S.reviewImages = list;
  renderReviewPhotos();
}
function renderReviewPhotos() {
  const wrap = document.getElementById('review-photos');
  if (!wrap) return;
  const photos = S.reviewImages || [];
  wrap.innerHTML = photos.map((p, i) => `<div class="review-photo" data-index="${i}"><img src="${p.src}" alt="Photo ${i + 1}" draggable="false"><button type="button" class="review-photo-remove" aria-label="Remove photo ${i + 1}" onclick="removeReviewPhoto(${i})"><i class="ph ph-x"></i></button></div>`).join('');
  wrap.querySelectorAll('.review-photo').forEach(el => el.addEventListener('pointerdown', startReviewPhotoDrag));
  const upload = document.querySelector('#review-modal .review-image-upload');
  if (upload) upload.style.display = photos.length >= MAX_REVIEW_PHOTOS ? 'none' : '';
}
function handleReviewImage(event) {
  const err = document.getElementById('review-error');
  const files = Array.from(event.target.files || []).filter(f => /^image\//.test(f.type));
  event.target.value = '';
  const room = MAX_REVIEW_PHOTOS - (S.reviewImages || []).length;
  const tooBig = files.filter(f => f.size > 8000000);
  const added = files.filter(f => f.size <= 8000000).slice(0, Math.max(0, room)).map(file => ({ file, src: URL.createObjectURL(file) }));
  setReviewPhotos((S.reviewImages || []).concat(added));
  const note = tooBig.length ? 'Photos must be under 8MB each.' : files.length - tooBig.length > room ? 'You can add up to ' + MAX_REVIEW_PHOTOS + ' photos.' : '';
  if (err) { err.textContent = note; err.style.display = note ? 'block' : 'none'; }
}
function removeReviewPhoto(i) {
  setReviewPhotos((S.reviewImages || []).filter((_, n) => n !== i));
}
function startReviewPhotoDrag(e) {
  if (e.target.closest('.review-photo-remove') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const el = e.currentTarget;
  const from = Number(el.dataset.index);
  const startX = e.clientX, startY = e.clientY;
  let dragging = false;
  el.setPointerCapture(e.pointerId);
  const targetAt = (x, y) => Array.from(document.querySelectorAll('#review-photos .review-photo')).find(t => {
    if (t === el) return false;
    const r = t.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const move = ev => {
    const dx = ev.clientX - startX, dy = ev.clientY - startY;
    if (!dragging && Math.abs(dx) + Math.abs(dy) < 6) return;
    dragging = true;
    el.classList.add('dragging');
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    document.querySelectorAll('#review-photos .review-photo').forEach(t => t.classList.toggle('drop-target', t === targetAt(ev.clientX, ev.clientY)));
  };
  const end = ev => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    const target = dragging && ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
    if (target) {
      const list = (S.reviewImages || []).slice();
      const [moved] = list.splice(from, 1);
      list.splice(Number(target.dataset.index), 0, moved);
      setReviewPhotos(list);
    } else {
      renderReviewPhotos();
    }
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
// Tapping a photo on a review opens that review's photos here, starting
// with the one tapped.
function openPhotoViewer(img) {
  const photos = Array.from(img.parentNode.querySelectorAll('img'));
  const track = document.getElementById('photo-viewer-track');
  const viewer = document.getElementById('photo-viewer');
  if (!track || !viewer) return;
  track.innerHTML = '';
  photos.forEach(p => { const i = document.createElement('img'); i.src = p.src; i.alt = p.alt; i.onclick = e => e.stopPropagation(); track.appendChild(i); });
  viewer.classList.add('open');
  track.scrollLeft = photos.indexOf(img) * track.clientWidth;
}
function closePhotoViewer() {
  const viewer = document.getElementById('photo-viewer');
  if (viewer) viewer.classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhotoViewer(); });

// Each photo goes to Cloudinary before the review is saved: with the
// storefront's images-only preset when there is one (the chat's upload,
// chat.js), otherwise with a signed upload the server gives buyers
// (/api/reviews/photo-signature, reviews-api.js).
async function uploadReviewPhotos(files) {
  if (!files.length) return [];
  if (window.CLOUDINARY_UPLOAD_PRESET) {
    try { const urls = []; for (const f of files) urls.push(await uploadChatImageToCloudinary(f)); return urls; } catch (e) {}
  }
  const res = await fetch('/api/reviews/photo-signature', { method: 'POST', headers: await reviewAuthHeaders(),
    body: JSON.stringify({ productId: S.currentReviewProductId, orders: deviceOrdersForReviews(), reviewLink: reviewLinkForReviews() }) });
  const sig = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('upload: ' + (sig.error || res.status));
  const urls = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', sig.apiKey);
    fd.append('timestamp', sig.timestamp);
    fd.append('signature', sig.signature);
    fd.append('folder', sig.folder);
    fd.append('allowed_formats', sig.allowedFormats);
    const up = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body: fd });
    const result = await up.json().catch(() => ({}));
    if (!result.secure_url) throw new Error('upload: ' + ((result.error && result.error.message) || up.status));
    urls.push(result.secure_url);
  }
  return urls;
}
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
    let imageUrls;
    try { imageUrls = await uploadReviewPhotos((S.reviewImages || []).map(p => p.file)); }
    catch (e) { console.warn('[REVIEWS] Photo upload failed:', e.message); return fail('Your photos could not be uploaded. Remove them to post your review without photos, or try again later.'); }
    const res = await fetch('/api/reviews', { method: 'POST', headers: await reviewAuthHeaders(), body: JSON.stringify({
      productId: S.currentReviewProductId, rating: S.reviewRating, text: DOM.reviewText.value.trim(),
      name: DOM.reviewName.value.trim(), email, imageUrls, orders: deviceOrdersForReviews(), reviewLink: reviewLinkForReviews() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data.error || 'We couldn’t submit your review. Please try again.');
  } catch (e) {
    return fail('We couldn’t submit your review. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit review'; }
  }
  closeReviewModal();
  if (typeof showAddedToCartToast === 'function') showAddedToCartToast('Thank you for your review', 'ph-star');
  if (S.currentPage === 'product-detail' && typeof loadProductReviewsSection === 'function') loadProductReviewsSection(S.currentReviewProductId);
}
