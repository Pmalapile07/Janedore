// ==================== FIREBASE INITIALIZATION ====================

const firebaseConfig = {
  apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI",
  authDomain: "janedore-9f035.firebaseapp.com",
  projectId: "janedore-9f035",
  storageBucket: "janedore-9f035.firebasestorage.app",
  messagingSenderId: "571299748651",
  appId: "1:571299748651:web:01463a772d47b39cc4036e",
  measurementId: "G-Y9NMT0ZGKZ"
};

console.log('[FIREBASE.JS] +0ms — start');
var _fbT0 = Date.now();

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('[FIREBASE.JS] +' + (Date.now() - _fbT0) + 'ms — initializeApp() complete');
} else {
  console.log('[FIREBASE.JS] +' + (Date.now() - _fbT0) + 'ms — app already initialized, skipping');
}

// NOTE: setPersistence(LOCAL) removed — LOCAL is Firebase default.
// Calling it explicitly on every page load was causing an unnecessary
// async IndexedDB operation that delayed authStateReady() resolution.

window.db = firebase.firestore();
const db = window.db;
console.log('[FIREBASE.JS] +' + (Date.now() - _fbT0) + 'ms — Firestore db ready');

// ==================== FIREBASE FUNCTIONS ====================

async function getProductReviews(productId) {
  try {
    const snapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.warn("Firebase reviews fetch failed:", e);
    return [];
  }
}

async function addProductReview(productId, review) {
  try {
    const country = await getVisitorCountry();
    await db.collection('reviews').add({
      productId,
      rating: review.rating,
      text: review.text,
      name: review.name || 'Anonymous',
      country: country,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("Review saved to Firebase");
  } catch (e) {
    console.warn("Firebase review save failed:", e);
    const all = JSON.parse(localStorage.getItem('janedore_reviews') || '{}');
    if (!all[productId]) all[productId] = [];
    all[productId].push(review);
    localStorage.setItem('janedore_reviews', JSON.stringify(all));
  }
}

async function subscribeNewsletter(email) {
  if (!email || !email.includes('@')) return;
  try {
    await db.collection('newsletter').add({
      email,
      subscribedAt: firebase.firestore.FieldValue.serverTimestamp(),
      source: 'website'
    });
    console.log("Newsletter subscription saved to Firebase");
    const input = document.getElementById('newsletter-email');
    if (input) {
      input.value = '';
      input.placeholder = 'Subscribed!';
      setTimeout(() => { input.placeholder = 'Enter your email'; }, 2000);
    }
  } catch (e) {
    console.warn("Firebase newsletter save failed:", e);
  }
}

async function saveOrder(orderData) {
  try {
    await db.collection('orders').add({
      ...orderData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });
    console.log("Order saved to Firebase");
  } catch (e) {
    console.warn("Firebase order save failed:", e);
  }
}

async function getVisitorCountry() {
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    return data.country_name || 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

function loadReviewsFromStorage() {
  try { return JSON.parse(localStorage.getItem('janedore_reviews') || '{}'); }
  catch (e) { return {}; }
}

function saveReviewsToStorage(reviews) {
  localStorage.setItem('janedore_reviews', JSON.stringify(reviews));
}

// ==================== GLOBAL EXPORTS ====================

window.db = db;
window.getProductReviews = getProductReviews;
window.addProductReview = addProductReview;
window.subscribeNewsletter = subscribeNewsletter;
window.saveOrder = saveOrder;

console.log('[FIREBASE.JS] +' + (Date.now() - _fbT0) + 'ms — firebase.js fully loaded');
