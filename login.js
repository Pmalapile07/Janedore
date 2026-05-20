// ==================== LOGIN SYSTEM ====================
// This module handles real Firebase email/password authentication.
// It deliberately ignores anonymous Firebase users (used by the support chat)
// via user.isAnonymous checks throughout — so chat auth never triggers
// account redirects or page state changes.

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

    // Only treat as signed in if this is a real (non-anonymous) user
    const user = firebase.auth().currentUser;
    if (user && !user.isAnonymous) {
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
    if (user && !user.isAnonymous) {
      showAccountView();
      loadAccountData();
    } else {
      // Anonymous or signed-out — redirect to login
      navigateToLogin();
    }
  }
}

function showLoginView() {
  const loginView = document.getElementById('login-view');
  const accountView = document.getElementById('account-view');
  if (loginView) loginView.style.display = 'block';
  if (accountView) accountView.style.display = 'none';
  loginMode = 'signin';
  updateLoginModeUI();
}

function showAccountView() {
  const loginView = document.getElementById('login-view');
  const accountView = document.getElementById('account-view');
  if (loginView) loginView.style.display = 'none';
  if (accountView) accountView.style.display = 'block';
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

  if (errorEl) errorEl.style.display = 'none';

  if (loginMode === 'signin') {
    if (title) title.textContent = 'Sign In';
    if (submitBtn) submitBtn.textContent = 'Sign In';
    if (toggleBtn) toggleBtn.textContent = 'Create an account';
    if (nameGroup) nameGroup.style.display = 'none';
  } else {
    if (title) title.textContent = 'Create Account';
    if (submitBtn) submitBtn.textContent = 'Create Account';
    if (toggleBtn) toggleBtn.textContent = 'Already have an account? Sign in';
    if (nameGroup) nameGroup.style.display = 'block';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const nameInput = document.getElementById('login-name');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const name = nameInput ? nameInput.value.trim() : '';

  if (errorEl) errorEl.style.display = 'none';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait…'; }

  try {
    if (loginMode === 'signup') {
      if (!name) throw new Error('Please enter your full name.');
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await userCredential.user.updateProfile({ displayName: name });
      await db.collection('customers').doc(userCredential.user.uid).set({
        name: name,
        email: email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    }

    showAccountView();
    updateHash('account');

  } catch (error) {
    if (errorEl) { errorEl.textContent = error.message; errorEl.style.display = 'block'; }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = loginMode === 'signin' ? 'Sign In' : 'Create Account';
    }
  }
}

async function handleLogout() {
  try {
    // Sign out the real account user.
    // The chat module will re-establish anonymous auth on its next Firestore access.
    await firebase.auth().signOut();
    showLoginView();
    updateHash('login');
  } catch (e) {
    console.warn('Logout error:', e);
  }
}

async function loadAccountData() {
  const user = firebase.auth().currentUser;
  // Guard: never load account data for anonymous (chat) users
  if (!user || user.isAnonymous) return;

  const nameEl = document.getElementById('account-name');
  const emailEl = document.getElementById('account-email');
  if (nameEl) nameEl.textContent = user.displayName || 'Customer';
  if (emailEl) emailEl.textContent = user.email;

  const userEmail = user.email.trim().toLowerCase();

  // Load orders — secure exact-match query, no full collection scan
  const ordersContainer = document.getElementById('account-orders');
  if (ordersContainer) {
    try {
      const ordersSnap = await db.collection('orders')
        .where('customerEmail', '==', userEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

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
      ordersContainer.innerHTML = '<p class="account-muted">Unable to load orders.</p>';
    }
  }

  // Load reviews — exact-match query
  const reviewsContainer = document.getElementById('account-reviews');
  if (reviewsContainer) {
    try {
      const reviewsSnap = await db.collection('reviews')
        .where('email', '==', userEmail)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

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
      reviewsContainer.innerHTML = '<p class="account-muted">Unable to load reviews.</p>';
    }
  }
}

// ==================== AUTH STATE LISTENER ====================
// Single listener for the account system.
// Anonymous users (support chat) are explicitly ignored so chat auth
// never triggers account page changes.
firebase.auth().onAuthStateChanged(user => {
  // Ignore anonymous auth entirely — that belongs to the chat module
  if (user && user.isAnonymous) return;

  if (user) {
    // Real signed-in user
    if (S.currentPage === 'login') {
      showAccountView();
      updateHash('account');
    }
    if (S.currentPage === 'account') {
      showAccountView();
      loadAccountData();
    }
  } else {
    // Signed out (real user)
    if (S.currentPage === 'login') {
      showLoginView();
    }
    if (S.currentPage === 'account') {
      navigateToLogin();
    }
  }
});
