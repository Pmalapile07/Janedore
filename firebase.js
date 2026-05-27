const firebaseConfig = { apiKey: "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI", authDomain: "janedore-9f035.firebaseapp.com", projectId: "janedore-9f035", storageBucket: "janedore-9f035.firebasestorage.app", messagingSenderId: "571299748651", appId: "1:571299748651:web:01463a772d47b39cc4036e", measurementId: "G-Y9NMT0ZGKZ" };
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function getProductReviews(productId) {
  try { const s = await db.collection('reviews').where('productId','==',productId).get(); const reviews = s.docs.map(d=>({id:d.id,...d.data()})); reviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); return reviews; } catch(e) { return []; }
}
async function addProductReview(productId, review) {
  try { const country = await getVisitorCountry(); await db.collection('reviews').add({ productId, rating:review.rating, text:review.text, name:review.name||'Anonymous', country, createdAt:firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) { const all = JSON.parse(localStorage.getItem('janedore_reviews')||'{}'); if(!all[productId]) all[productId]=[]; all[productId].push(review); localStorage.setItem('janedore_reviews', JSON.stringify(all)); }
}
async function subscribeNewsletter(email) { if(!email||!email.includes('@')) return; try { await db.collection('newsletter').add({ email, subscribedAt:firebase.firestore.FieldValue.serverTimestamp(), source:'website' }); const i=document.getElementById('newsletter-email'); if(i){i.value='';i.placeholder='Subscribed!';setTimeout(()=>i.placeholder='Enter your email',2000);} } catch(e) {} }
async function saveOrder(orderData) { try { await db.collection('orders').add({...orderData, createdAt:firebase.firestore.FieldValue.serverTimestamp(), status:'pending'}); } catch(e) {} }
async function getVisitorCountry() { try { const r=await fetch('https://ipapi.co/json/'); const d=await r.json(); return d.country_name||'Unknown'; } catch(e) { return 'Unknown'; } }
