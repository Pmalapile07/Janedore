// ==================== LOGIN SYSTEM ====================

let loginMode = 'signin'; // 'signin' or 'signup'

function navigateToLogin() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const loginPage = document.getElementById("page-login");
  if (loginPage) {
    loginPage.classList.add("active");
    S.currentPage = "login";
    updateHash('login');
    window.scrollTo({ top: 0, behavior: "smooth" });
    ensureNavScrolled();
    
    // Check if already logged in
    const user = firebase.auth().currentUser;
    if (user) {
      showAccountView();
    } else {
      showLoginView();
    }
  }
}

function navigateToAccount() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const accountPage = document.getElementById("page-account");
  if (accountPage) {
    accountPage.classList.add("active");
    S.currentPage = "account";
    updateHash('account');
    window.scrollTo({ top: 0, behavior: "smooth" });
    ensureNavScrolled();
    
    const user = firebase.auth().currentUser;
    if (user) {
      showAccountView();
      loadAccountData();
    } else {
      navigateToLogin();
    }
  }
}

function showLoginView() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('account-view').style.display = 'none';
  loginMode = 'signin';
  updateLoginModeUI();
}

function showAccountView() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('account-view').style.display = 'block';
  loadAccountData();
}

function toggleLoginMode() {
  loginMode = loginMode === 'signin' ? 'signup' : 'signin';
  updateLoginModeUI();
}

function updateLoginModeUI() {
  const title = document.getElementById('login-mode-title');
  const submitBtn = document.getElementById('login-submit-btn');
  const toggleBtn = document.getElementById('toggle-mode-btn');
  const nameGroup = document.getElementById('name-group');
  const errorEl = document.getElementById('login-error');
  
  errorEl.style.display = 'none';
  
  if (loginMode === 'signin') {
    title.textContent = 'Sign In';
    submitBtn.textContent = 'Sign In';
    toggleBtn.textContent = 'Create an account';
    nameGroup.style.display = 'none';
  } else {
    title.textContent = 'Create Account';
    submitBtn.textContent = 'Create Account';
    toggleBtn.textContent = 'Already have an account? Sign in';
    nameGroup.style.display = 'block';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const name = document.getElementById('login-name').value.trim();
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');
  
  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Please wait...';
  
  try {
    if (loginMode === 'signup') {
      if (!name) {
        throw new Error('Please enter your full name.');
      }
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await userCredential.user.updateProfile({ displayName: name });
      // Save to Firestore
      await db.collection('customers').doc(userCredential.user.uid).set({
        name: name,
        email: email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    }
    
    // Success - show account view
    showAccountView();
    updateHash('account');
    
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = loginMode === 'signin' ? 'Sign In' : 'Create Account';
  }
}

async function handleLogout() {
  try {
    await firebase.auth().signOut();
    showLoginView();
    updateHash('login');
  } catch (e) {
    console.warn('Logout error:', e);
  }
}

async function loadAccountData() {
  const user = firebase.auth().currentUser;
  if (!user) return;
  
  // Display user info
  document.getElementById('account-name').textContent = user.displayName || 'Customer';
  document.getElementById('account-email').textContent = user.email;
  
  // Load orders
  try {
    const ordersSnap = await db.collection('orders')
      .where('customerEmail', '==', user.email)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    const ordersContainer = document.getElementById('account-orders');
    
    if (ordersSnap.empty) {
      ordersContainer.innerHTML = '<p class="account-muted">No orders yet.</p>';
    } else {
      let ordersHTML = '';
      ordersSnap.docs.forEach(d => {
        const o = d.data();
        const date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        ordersHTML += `<div class="account-order-card">
          <div class="account-order-number">Order #${o.orderNumber || d.id.substring(0, 12)}</div>
          <div style="margin-top:4px;">${o.itemCount || 0} items · R${o.total || o.subtotal || 0}</div>
          <div style="margin-top:2px;display:flex;justify-content:space-between;">
            <span class="account-order-status" style="color:${o.status === 'pending' ? '#e65100' : '#0a0'};">${o.status || 'pending'}</span>
            <span style="font-size:10px;color:#aaa;">${date}</span>
          </div>
        </div>`;
      });
      ordersContainer.innerHTML = ordersHTML;
    }
  } catch (e) {
    document.getElementById('account-orders').innerHTML = '<p class="account-muted">Unable to load orders.</p>';
  }
  
  // Load reviews
  try {
    const reviewsSnap = await db.collection('reviews')
      .where('email', '==', user.email)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    const reviewsContainer = document.getElementById('account-reviews');
    
    if (reviewsSnap.empty) {
      reviewsContainer.innerHTML = '<p class="account-muted">No reviews yet.</p>';
    } else {
      let reviewsHTML = '';
      reviewsSnap.docs.forEach(d => {
        const r = d.data();
        const date = r.createdAt ? new Date(r.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        reviewsHTML += `<div class="account-order-card">
          <div>${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</div>
          <div style="margin-top:2px;font-size:12px;">${r.text || 'No comment'}</div>
          <div style="margin-top:2px;font-size:10px;color:#aaa;">${date}</div>
        </div>`;
      });
      reviewsContainer.innerHTML = reviewsHTML;
    }
  } catch (e) {
    document.getElementById('account-reviews').innerHTML = '<p class="account-muted">Unable to load reviews.</p>';
  }
}

// Auth state listener
firebase.auth().onAuthStateChanged(user => {
  const loginPage = document.getElementById('page-login');
  const accountPage = document.getElementById('page-account');
  
  if (user) {
    // User is signed in
    if (S.currentPage === 'login') {
      showAccountView();
      updateHash('account');
    }
    if (S.currentPage === 'account') {
      showAccountView();
      loadAccountData();
    }
  } else {
    // User is signed out
    if (S.currentPage === 'login') {
      showLoginView();
    }
    if (S.currentPage === 'account') {
      navigateToLogin();
    }
  }
});
