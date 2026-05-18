// ==================== FIREBASE INITIALIZATION & BACKEND SERVICES ====================
const firebaseConfig = {
  apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI",
  authDomain: "janedore-9f035.firebaseapp.com",
  projectId: "janedore-9f035",
  storageBucket: "janedore-9f035.firebasestorage.app",
  messagingSenderId: "571299748651",
  appId: "1:571299748651:web:01463a772d47b39cc4036e",
  measurementId: "G-Y9NMT0ZGKZ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==================== FIREBASE FUNCTIONS ====================

// Get product reviews from Firebase
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

// Add a product review to Firebase
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

// Subscribe newsletter email to Firebase
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

// Save order to Firebase
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

// Get visitor country via IP API
async function getVisitorCountry() {
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    return data.country_name || 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

// Load reviews from localStorage fallback
function loadReviewsFromStorage() { 
  try { return JSON.parse(localStorage.getItem('janedore_reviews') || '{}'); } 
  catch(e) { return {}; } 
}

// Save reviews to localStorage fallback
function saveReviewsToStorage(reviews) { 
  localStorage.setItem('janedore_reviews', JSON.stringify(reviews)); 
}
