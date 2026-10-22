// ==================== LOGIN SYSTEM ====================
// This module handles real Firebase email/password authentication.
// It deliberately ignores anonymous Firebase users (used by the support chat)
// via user.isAnonymous checks throughout — so chat auth never triggers
// account redirects or page state changes.

let loginMode = 'signin'; // 'signin', 'signup' or 'reset'

// Signed-in customers never see the sign-in form: the account icon,
// /login and a fresh sign-in all land on My Account (account.js).
function realUser() {
  const user = firebase.auth().currentUser;
  return user && !user.isAnonymous ? user : null;
}

function showPage(id, page) {
  ++pageNavGeneration;
  if (typeof closeFilterPanel === 'function') closeFilterPanel();
  if (typeof closeSearch === 'function') closeSearch();
  if (typeof removeStickyBar === 'function') removeStickyBar();
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  S.currentPage = page;
  if (typeof setNavForPage === 'function') setNavForPage(page);
  resetScrollToTop();
  ensureNavScrolled();
  if (typeof updateChatVisibility === 'function') updateChatVisibility();
}

function setPath(path, replaceUrl) {
  if (window.location.pathname === path && !window.location.hash) return;
  replaceUrl ? history.replaceState(null, null, path) : history.pushState(null, null, path);
}

function navigateToLogin(replaceUrl) {
  if (realUser()) { navigateToAccount(replaceUrl); return; }
  showPage('page-login', 'login');
  setPath('/login', replaceUrl);
  showLoginView();
}

// replaceUrl comes from the router (load / back / forward): keep the URL,
// so /account/orders/JD-123456 opens that order.
function navigateToAccount(replaceUrl) {
  if (!realUser()) { navigateToLogin(replaceUrl); return; }
  showPage('page-account', 'account');
  if (!(replaceUrl && /^\/account(\/|$)/.test(window.location.pathname))) setPath('/account', replaceUrl);
  if (typeof renderAccountPage === 'function') renderAccountPage();
}

function showLoginView() {
  setLoginMode('signin');
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

  // [title, button, line under the title: before, link, after]
  const labels = {
    signin: ['Sign In', 'Sign In', 'New customer?', 'Create an account', ' to save your wishlist, track your orders and check out faster.'],
    signup: ['Create Account', 'Create Account', 'Already have an account?', 'Sign in', ''],
    reset: ['Reset Password', 'Send Reset Link', 'Remembered your password?', 'Back to sign in', '']
  }[loginMode];
  const switchText = document.getElementById('login-switch-text');
  const switchAfter = document.getElementById('login-switch-after');
  const legal = document.getElementById('login-legal');
  const legalLead = document.getElementById('login-legal-lead');
  if (switchText) switchText.textContent = labels[2];
  if (switchAfter) switchAfter.textContent = labels[4];
  if (legal) legal.style.display = loginMode === 'reset' ? 'none' : 'block';
  if (legalLead) legalLead.textContent = loginMode === 'signup' ? 'By creating an account' : 'By signing in';
  if (title) title.textContent = labels[0];
  if (submitBtn) submitBtn.textContent = labels[1];
  if (toggleBtn) toggleBtn.textContent = labels[3];
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
    // Signing in with Google on an email that has an unverified password
    // makes Firebase drop that password, so point people to both ways back in.
    'auth/invalid-credential': 'That email and password don’t match. If you signed up with Google, use Continue with Google, or reset your password to add one.',
    'auth/wrong-password': 'That email and password don’t match. If you signed up with Google, use Continue with Google, or reset your password to add one.',
    'auth/user-not-found': 'That email and password don’t match. If you signed up with Google, use Continue with Google, or reset your password to add one.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'There’s already an account with this email. Sign in instead.',
    'auth/weak-password': 'Please choose a password of at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/popup-closed-by-user': '',
    'auth/cancelled-popup-request': '',
    'auth/account-exists-with-different-credential': 'This email is already registered. Sign in with your email and password.',
    'auth/operation-not-allowed': 'This sign-in option isn’t available right now. Please try another way to sign in, or contact Customer Care.',
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
      // The link back to /login needs this domain in Firebase's authorised
      // domains; if it isn't, send the plain reset email instead.
      try {
        await firebase.auth().sendPasswordResetEmail(email, { url: window.location.origin + '/login' });
      } catch (err) {
        if (!['auth/unauthorized-continue-uri', 'auth/invalid-continue-uri', 'auth/unauthorized-domain', 'auth/missing-continue-uri'].includes(err && err.code)) throw err;
        await firebase.auth().sendPasswordResetEmail(email);
      }
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

    navigateToAccount();

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
    navigateToAccount();
  } catch (error) {
    showLoginError(error);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    // The chat module re-establishes anonymous auth on its next Firestore access.
    await firebase.auth().signOut();
    if (typeof clearAccountCache === 'function') clearAccountCache();
    navigateToLogin();
  } catch (e) {
    console.warn('Logout error:', e);
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
    if (typeof syncRecentSearchesOnLogin === 'function') syncRecentSearchesOnLogin(user.uid);
    if (S.currentPage === 'login') navigateToAccount(true);
    else if (S.currentPage === 'account' && typeof renderAccountPage === 'function') renderAccountPage();
  } else {
    // Signed out (real user)
    if (typeof clearWishlistOnLogout === 'function') clearWishlistOnLogout();
    if (typeof clearRecentSearchesOnLogout === 'function') clearRecentSearchesOnLogout();
    if (typeof clearChatIdentityOnLogout === 'function') clearChatIdentityOnLogout();
    if (typeof clearAccountCache === 'function') clearAccountCache();
    if (S.currentPage === 'account') navigateToLogin(true);
  }
});
