// ==================== LOGIN SYSTEM ====================
// This module handles real Firebase email/password authentication.
// It deliberately ignores anonymous Firebase users (used by the support chat)
// via user.isAnonymous checks throughout — so chat auth never triggers
// account redirects or page state changes.

let loginMode = 'signin'; // 'signin', 'signup' or 'reset'

function navigateToLogin() {
  ++pageNavGeneration;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const loginPage = document.getElementById("page-login");
  if (loginPage) {
    loginPage.classList.add("active");
    S.currentPage = "login";
    updateHash('login');
    resetScrollToTop();
    ensureNavScrolled();
    // This function (not app.js's same-named one, which it shadows —
    // see the file-level comment) is what actually runs, so the
    // quick-links row's login-page hide (navigation.css) has to be
    // set here directly; setNavForPage() (app.js) is never reached on
    // this path.
    document.body.classList.add('on-login-page');

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
  ++pageNavGeneration;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const accountPage = document.getElementById("page-account");
  if (accountPage) {
    accountPage.classList.add("active");
    S.currentPage = "account";
    updateHash('account');
    resetScrollToTop();
    ensureNavScrolled();
    // Account page isn't one of the pages the quick-links row is
    // hidden on — clear the marker login set, in case this redirects
    // anywhere other than back into navigateToLogin() below.
    document.body.classList.remove('on-login-page');

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
  setLoginMode(loginMode === 'signin' ? 'signup' : 'signin');
}

// 'signin', 'signup' or 'reset' (forgot password: email only).
function setLoginMode(mode) {
  loginMode = mode;
  updateLoginModeUI();
}

function updateLoginModeUI() {
  const title = document.getElementById('login-mode-title');
  const submitBtn = document.getElementById('login-submit-btn');
  const toggleBtn = document.getElementById('toggle-mode-btn');
  const nameGroup = document.getElementById('name-group');
  const passwordGroup = document.getElementById('password-group');
  const passwordInput = document.getElementById('login-password');
  const forgotBtn = document.getElementById('forgot-password-btn');
  const social = document.getElementById('login-social');
  const errorEl = document.getElementById('login-error');

  if (errorEl) errorEl.style.display = 'none';
  showLoginNotice('');

  const labels = {
    signin: ['Sign In', 'Sign In', 'Create an account'],
    signup: ['Create Account', 'Create Account', 'Already have an account? Sign in'],
    reset: ['Reset Password', 'Send Reset Link', 'Back to sign in']
  }[loginMode];
  if (title) title.textContent = labels[0];
  if (submitBtn) submitBtn.textContent = labels[1];
  if (toggleBtn) toggleBtn.textContent = labels[2];
  if (nameGroup) nameGroup.style.display = loginMode === 'signup' ? 'block' : 'none';
  if (passwordGroup) passwordGroup.style.display = loginMode === 'reset' ? 'none' : 'block';
  if (passwordInput) passwordInput.required = loginMode !== 'reset';
  if (forgotBtn) forgotBtn.style.display = loginMode === 'signin' ? 'block' : 'none';
  if (social) social.style.display = loginMode === 'reset' ? 'none' : 'block';
  if (toggleBtn) toggleBtn.onclick = loginMode === 'reset' ? () => setLoginMode('signin') : toggleLoginMode;
}

function showLoginNotice(text) {
  const el = document.getElementById('login-notice');
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}

// Firebase's own messages read like "Firebase: Error (auth/invalid-credential)."
function friendlyAuthError(error) {
  const code = (error && error.code) || '';
  const messages = {
    'auth/invalid-credential': 'That email and password don’t match. Try again, or reset your password.',
    'auth/wrong-password': 'That email and password don’t match. Try again, or reset your password.',
    'auth/user-not-found': 'That email and password don’t match. Try again, or reset your password.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'There’s already an account with this email. Sign in instead.',
    'auth/weak-password': 'Please choose a password of at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/popup-closed-by-user': '',
    'auth/cancelled-popup-request': '',
    'auth/account-exists-with-different-credential': 'This email is already registered. Sign in with your email and password.',
    'auth/operation-not-allowed': 'This sign-in option isn’t available yet. Please use your email and password.',
    'auth/unauthorized-domain': 'This sign-in option isn’t available yet. Please use your email and password.',
    'auth/operation-not-supported-in-this-environment': 'Google sign-in doesn’t work inside this app’s browser. Open janedore.co.za in Safari or Chrome, or use your email and password.',
    'auth/web-storage-unsupported': 'Google sign-in doesn’t work inside this app’s browser. Open janedore.co.za in Safari or Chrome, or use your email and password.'
  };
  if (code in messages) return messages[code];
  return (error && error.message && !/firebase/i.test(error.message)) ? error.message : 'Something went wrong. Please try again.';
}

function showLoginError(error) {
  const errorEl = document.getElementById('login-error');
  const text = typeof error === 'string' ? error : friendlyAuthError(error);
  if (!errorEl || !text) return;
  errorEl.textContent = text;
  errorEl.style.display = 'block';
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
  const label = submitBtn ? submitBtn.textContent : '';

  if (errorEl) errorEl.style.display = 'none';
  showLoginNotice('');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait…'; }

  try {
    if (loginMode === 'reset') {
      // Firebase emails a link to its own reset page; after choosing a new
      // password the customer is sent back to sign in here. The same
      // message shows whether or not the email has an account, so the
      // form can't be used to find out who shops here.
      await firebase.auth().sendPasswordResetEmail(email, { url: window.location.origin + '/login' });
      showLoginNotice('If there’s an account for ' + email + ', we’ve sent a link to reset your password. Check your inbox and spam folder.');
      return;
    }
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
    if (loginMode === 'reset' && error && error.code === 'auth/user-not-found') {
      showLoginNotice('If there’s an account for ' + email + ', we’ve sent a link to reset your password. Check your inbox and spam folder.');
    } else {
      showLoginError(error);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  }
}

// "Continue with Google": a popup, so the customer stays on the page.
// First-time Google customers get the same customers/{uid} record an
// email sign-up creates.
async function handleGoogleSignIn() {
  const btn = document.getElementById('google-signin-btn');
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.style.display = 'none';
  showLoginNotice('');
  if (btn) btn.disabled = true;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;
    if (result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
      await db.collection('customers').doc(user.uid).set({
        name: user.displayName || '',
        email: (user.email || '').toLowerCase(),
        provider: 'google',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    showAccountView();
    updateHash('account');
  } catch (error) {
    showLoginError(error);
  } finally {
    if (btn) btn.disabled = false;
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
      ordersContainer.innerHTML = '<p class="account-muted">Unable to load orders.</p><p class="account-muted" style="font-size:10px;word-break:break-word;"></p>';
      ordersContainer.querySelector('p:last-child').textContent = (e && (e.message || e.code)) || '';
      console.error('[ACCOUNT_ORDERS]', e);
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
      reviewsContainer.innerHTML = '<p class="account-muted">Unable to load reviews.</p><p class="account-muted" style="font-size:10px;word-break:break-word;"></p>';
      reviewsContainer.querySelector('p:last-child').textContent = (e && (e.message || e.code)) || '';
      console.error('[ACCOUNT_REVIEWS]', e);
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
    if (typeof syncWishlistOnLogin === 'function') syncWishlistOnLogin(user.uid);
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
    if (typeof clearWishlistOnLogout === 'function') clearWishlistOnLogout();
    if (typeof clearChatIdentityOnLogout === 'function') clearChatIdentityOnLogout();
    if (S.currentPage === 'login') {
      showLoginView();
    }
    if (S.currentPage === 'account') {
      navigateToLogin();
    }
  }
});
