// ==================== JANEDORE LOGIN & ACCOUNT SYSTEM ====================
let loginState = {
  isAuthenticated: false,
  currentUser: null,
  customerEmail: '',
  customerData: null
};

// Initialize Firebase Auth listener
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    loginState.isAuthenticated = true;
    loginState.currentUser = user;
    loginState.customerEmail = user.email || localStorage.getItem('janedore_chat_email') || '';
    
    // Update UI
    updateLoginUI();
    
    // Load customer data
    await loadCustomerData();
    
    // If on login page, redirect to account
    if (S.currentPage === 'login') {
      navigateTo('account');
    }
  } else {
    loginState.isAuthenticated = false;
    loginState.currentUser = null;
    loginState.customerData = null;
    updateLoginUI();
  }
});

function updateLoginUI() {
  const loginLinks = document.querySelectorAll('.utility-text-link, .drawer-link');
  loginLinks.forEach(link => {
    if (link.textContent.trim() === 'Login' || link.textContent.trim() === 'Track Order') {
      if (loginState.isAuthenticated) {
        if (link.textContent.trim() === 'Login') {
          link.textContent = 'Account';
          link.onclick = () => navigateTo('account');
        }
        if (link.textContent.trim() === 'Track Order') {
          link.textContent = 'My Orders';
          link.onclick = () => showOrderHistory();
        }
      } else {
        if (link.textContent.trim() === 'Account') {
          link.textContent = 'Login';
          link.onclick = () => navigateTo('login');
        }
        if (link.textContent.trim() === 'My Orders') {
          link.textContent = 'Track Order';
          link.onclick = () => navigateTo('track-order');
        }
      }
    }
  });
}

async function loadCustomerData() {
  if (!loginState.customerEmail) return;
  
  try {
    const customerEmailLower = loginState.customerEmail.toLowerCase();
    
    // Get orders
    const ordersSnap = await db.collection('orders').get();
    const orders = [];
    
    if (!ordersSnap.empty) {
      ordersSnap.docs.forEach(doc => {
        const data = doc.data();
        const docEmail = data.customerEmail || '';
        if (docEmail.toLowerCase() === customerEmailLower) {
          orders.push({ id: doc.id, ...data });
        }
      });
    }
    
    // Get reviews
    const reviewsSnap = await db.collection('reviews')
      .where('email', '==', loginState.customerEmail)
      .get();
    const reviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Get newsletter subscription
    const newsletterSnap = await db.collection('newsletter')
      .where('email', '==', loginState.customerEmail)
      .get();
    
    loginState.customerData = {
      orders: orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
      reviews: reviews,
      isSubscribed: !newsletterSnap.empty,
      orderCount: orders.length,
      totalSpent: orders.reduce((sum, o) => sum + (o.subtotal || o.total || 0), 0)
    };
  } catch (e) {
    console.warn('Error loading customer data:', e);
  }
}

async function signInWithEmailLink(email) {
  try {
    const actionCodeSettings = {
      url: window.location.origin + '/#login',
      handleCodeInApp: true
    };
    
    await firebase.auth().sendSignInLinkToEmail(email, actionCodeSettings);
    localStorage.setItem('janedore_chat_email', email);
    
    return { success: true, message: 'Sign-in link sent! Check your email.' };
  } catch (error) {
    console.warn('Email link error:', error);
    
    // Fallback to anonymous auth
    try {
      await firebase.auth().signInAnonymously();
      localStorage.setItem('janedore_chat_email', email);
      return { success: true, message: 'Signed in successfully!' };
    } catch (fallbackError) {
      return { success: false, message: 'Unable to sign in. Please try again.' };
    }
  }
}

async function signOut() {
  try {
    await firebase.auth().signOut();
    loginState.isAuthenticated = false;
    loginState.currentUser = null;
    loginState.customerData = null;
    localStorage.removeItem('janedore_chat_email');
    updateLoginUI();
    navigateTo('home');
  } catch (e) {
    console.warn('Sign out error:', e);
  }
}

// Handle email link sign-in when page loads
async function handleEmailLinkSignIn() {
  if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('janedore_chat_email');
    
    if (!email) {
      email = window.prompt('Please enter your email to confirm sign-in');
    }
    
    if (email) {
      try {
        await firebase.auth().signInWithEmailLink(email, window.location.href);
        localStorage.setItem('janedore_chat_email', email);
        loginState.customerEmail = email;
        window.history.replaceState({}, document.title, window.location.pathname + '#account');
        navigateTo('account');
      } catch (error) {
        console.warn('Email link sign-in failed:', error);
      }
    }
  }
}

function navigateToLogin() {
  navigateTo('login');
}

function navigateToAccount() {
  navigateTo('account');
}

// Add login page to navigation
document.addEventListener('DOMContentLoaded', () => {
  handleEmailLinkSignIn();
  
  // Add login/account page container
  const loginPage = document.createElement('div');
  loginPage.className = 'page';
  loginPage.id = 'page-login';
  document.body.appendChild(loginPage);
  
  const accountPage = document.createElement('div');
  accountPage.className = 'page';
  accountPage.id = 'page-account';
  document.body.appendChild(accountPage);
  
  // Extend navigateTo function
  const originalNavigateTo = navigateTo;
  navigateTo = function(page) {
    if (page === 'login' && loginState.isAuthenticated) {
      page = 'account';
    }
    if (page === 'account' && !loginState.isAuthenticated) {
      page = 'login';
    }
    
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    
    if (page === 'login') {
      renderLoginPage();
      const loginPg = document.getElementById('page-login');
      if (loginPg) loginPg.classList.add('active');
    } else if (page === 'account') {
      renderAccountPage();
      const accountPg = document.getElementById('page-account');
      if (accountPg) accountPg.classList.add('active');
    } else {
      const pageEl = document.getElementById(`page-${page}`);
      if (pageEl) pageEl.classList.add('active');
    }
    
    S.currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (page === 'products') {
      renderAllProducts();
      ensureNavScrolled();
      S.previousCollectionPage = 'products';
    }
    if (page === 'cart') {
      renderCartPage();
      ensureNavScrolled();
    }
    if (page === 'wishlist') {
      renderWishlistPage();
      ensureNavScrolled();
    }
    if (page === 'home') {
      setTimeout(checkNavForHome, 50);
    }
    if (page === 'editorial') {
      ensureNavScrolled();
    }
    
    updateHash(page === 'home' ? '' : page);
    setTimeout(refreshSwipeTracks, 50);
  };
});

function renderLoginPage() {
  const loginPage = document.getElementById('page-login');
  if (!loginPage) return;
  
  loginPage.innerHTML = `
    <style>
      .auth-section {
        max-width: 480px;
        margin: 80px auto 60px;
        padding: 0 24px;
      }
      .auth-header {
        text-align: center;
        margin-bottom: 48px;
      }
      .auth-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 36px;
        font-weight: 300;
        color: #111;
        margin-bottom: 12px;
      }
      .auth-subtitle {
        font-size: 12px;
        font-weight: 300;
        color: #888;
        line-height: 1.6;
        letter-spacing: 0.03em;
      }
      .auth-form {
        margin-bottom: 32px;
      }
      .auth-input-group {
        margin-bottom: 20px;
      }
      .auth-label {
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        color: #888;
        display: block;
        margin-bottom: 8px;
      }
      .auth-input {
        width: 100%;
        border: none;
        border-bottom: 0.8px solid #ddd;
        padding: 14px 0;
        font-family: 'Manrope', sans-serif;
        font-size: 14px;
        font-weight: 300;
        color: #111;
        outline: none;
        background: transparent;
        transition: border-color 0.3s;
        letter-spacing: 0.02em;
      }
      .auth-input:focus {
        border-color: #111;
      }
      .auth-input::placeholder {
        color: #aaa;
      }
      .auth-btn {
        width: 100%;
        background: #111;
        color: #fff;
        border: none;
        padding: 16px;
        font-family: 'Manrope', sans-serif;
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        cursor: pointer;
        transition: background 0.3s;
        margin-top: 12px;
      }
      .auth-btn:hover {
        background: #333;
      }
      .auth-btn.secondary {
        background: #fff;
        color: #111;
        border: 0.8px solid #111;
        margin-top: 8px;
      }
      .auth-btn.secondary:hover {
        background: #f5f5f5;
      }
      .auth-message {
        text-align: center;
        margin-top: 16px;
        font-size: 11px;
        font-weight: 300;
        color: #888;
        letter-spacing: 0.03em;
      }
      .auth-divider {
        display: flex;
        align-items: center;
        margin: 32px 0;
        color: #ccc;
        font-size: 10px;
        letter-spacing: 0.1em;
      }
      .auth-divider::before,
      .auth-divider::after {
        content: '';
        flex: 1;
        height: 0.5px;
        background: #e5e5e5;
      }
      .auth-divider span {
        padding: 0 16px;
        color: #aaa;
      }
      .auth-benefits {
        margin-top: 48px;
        padding-top: 32px;
        border-top: 0.5px solid #e5e5e5;
      }
      .auth-benefits-title {
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        color: #111;
        margin-bottom: 20px;
        text-align: center;
      }
      .auth-benefit-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .auth-benefit-item {
        font-size: 11px;
        font-weight: 300;
        color: #888;
        display: flex;
        align-items: center;
        gap: 12px;
        letter-spacing: 0.03em;
      }
      .auth-benefit-item svg {
        width: 16px;
        height: 16px;
        stroke: #888;
        flex-shrink: 0;
      }
    </style>
    
    <div class="auth-section">
      <div class="auth-header">
        <h1 class="auth-title">Welcome to JANEDORE</h1>
        <p class="auth-subtitle">Sign in to track orders, save favorites, and checkout faster.</p>
      </div>
      
      <div class="auth-form">
        <div class="auth-input-group">
          <label class="auth-label">Email Address</label>
          <input type="email" class="auth-input" id="login-email" placeholder="your@email.com" autocomplete="email">
        </div>
        
        <button class="auth-btn" onclick="handleLogin()">
          Continue with Email
        </button>
        
        <div id="login-message" class="auth-message" style="display:none;"></div>
      </div>
      
      <div class="auth-divider">
        <span>OR</span>
      </div>
      
      <button class="auth-btn secondary" onclick="continueAsGuest()">
        Continue as Guest
      </button>
      
      <div class="auth-benefits">
        <div class="auth-benefits-title">Account Benefits</div>
        <ul class="auth-benefit-list">
          <li class="auth-benefit-item">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Track your orders in real-time
          </li>
          <li class="auth-benefit-item">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Faster checkout with saved information
          </li>
          <li class="auth-benefit-item">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            View your complete order history
          </li>
          <li class="auth-benefit-item">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Exclusive early access to new drops
          </li>
        </ul>
      </div>
    </div>
    
    <div class="back-btn-wrap">
      <button class="back-btn" onclick="navigateTo('home')">Back Home</button>
    </div>
    
    <footer id="login-footer"></footer>
  `;
  
  buildFooter('login-footer');
  
  // Add enter key handler
  setTimeout(() => {
    const emailInput = document.getElementById('login-email');
    if (emailInput) {
      emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
      });
    }
  }, 100);
}

async function handleLogin() {
  const emailInput = document.getElementById('login-email');
  const messageEl = document.getElementById('login-message');
  
  if (!emailInput || !messageEl) return;
  
  const email = emailInput.value.trim();
  
  if (!email || !email.includes('@') || !email.includes('.')) {
    messageEl.textContent = 'Please enter a valid email address.';
    messageEl.style.color = '#c00';
    messageEl.style.display = 'block';
    return;
  }
  
  messageEl.textContent = 'Sending sign-in link...';
  messageEl.style.color = '#888';
  messageEl.style.display = 'block';
  
  const result = await signInWithEmailLink(email);
  
  if (result.success) {
    messageEl.textContent = result.message;
    messageEl.style.color = '#111';
    
    if (result.message.includes('sent')) {
      // Email link sent - show confirmation
      setTimeout(() => {
        loginState.customerEmail = email;
        localStorage.setItem('janedore_chat_email', email);
        navigateTo('account');
      }, 2000);
    }
  } else {
    messageEl.textContent = result.message;
    messageEl.style.color = '#c00';
  }
}

function continueAsGuest() {
  navigateTo('home');
}

function renderAccountPage() {
  const accountPage = document.getElementById('page-account');
  if (!accountPage) return;
  
  if (!loginState.isAuthenticated) {
    renderLoginPage();
    return;
  }
  
  const customerData = loginState.customerData || {};
  const orders = customerData.orders || [];
  const reviews = customerData.reviews || [];
  
  accountPage.innerHTML = `
    <style>
      .account-section {
        max-width: 800px;
        margin: 60px auto;
        padding: 0 24px;
      }
      .account-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 48px;
        flex-wrap: wrap;
        gap: 16px;
      }
      .account-welcome {
        flex: 1;
      }
      .account-name {
        font-family: 'Cormorant Garamond', serif;
        font-size: 32px;
        font-weight: 300;
        color: #111;
        margin-bottom: 8px;
      }
      .account-email {
        font-size: 11px;
        font-weight: 300;
        color: #888;
        letter-spacing: 0.03em;
      }
      .account-signout {
        background: none;
        border: 0.8px solid #ddd;
        padding: 10px 20px;
        font-family: 'Manrope', sans-serif;
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        color: #888;
        cursor: pointer;
        transition: all 0.3s;
      }
      .account-signout:hover {
        border-color: #111;
        color: #111;
      }
      .account-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        margin-bottom: 48px;
      }
      .account-stat-card {
        padding: 24px;
        background: #fafaf9;
        text-align: center;
      }
      .account-stat-value {
        font-family: 'Cormorant Garamond', serif;
        font-size: 32px;
        font-weight: 300;
        color: #111;
        margin-bottom: 4px;
      }
      .account-stat-label {
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        color: #888;
      }
      .account-section-title {
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        color: #111;
        margin-bottom: 24px;
        padding-bottom: 12px;
        border-bottom: 0.5px solid #e5e5e5;
      }
      .account-order-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 48px;
      }
      .account-order-item {
        padding: 20px;
        background: #fff;
        border: 0.8px solid #e5e5e5;
        cursor: pointer;
        transition: all 0.3s;
      }
      .account-order-item:hover {
        border-color: #111;
      }
      .account-order-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .account-order-number {
        font-size: 11px;
        font-weight: 500;
        color: #111;
        letter-spacing: 0.04em;
      }
      .account-order-date {
        font-size: 10px;
        color: #888;
        letter-spacing: 0.03em;
      }
      .account-order-status {
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        padding: 4px 12px;
        display: inline-block;
      }
      .account-order-status.pending {
        background: #f5f5f5;
        color: #888;
      }
      .account-order-status.processing {
        background: #f0f0f0;
        color: #111;
      }
      .account-order-status.shipped {
        background: #e8f4e8;
        color: #2d6a2d;
      }
      .account-order-status.delivered {
        background: #e0f0e0;
        color: #1a4a1a;
      }
      .account-order-details {
        display: flex;
        gap: 16px;
        align-items: center;
      }
      .account-order-items {
        font-size: 11px;
        font-weight: 300;
        color: #888;
        letter-spacing: 0.03em;
      }
      .account-order-total {
        font-size: 12px;
        font-weight: 500;
        color: #111;
        letter-spacing: 0.04em;
        margin-left: auto;
      }
      .account-empty {
        text-align: center;
        padding: 60px 20px;
        color: #888;
      }
      .account-empty-title {
        font-family: 'Manrope', sans-serif;
        font-size: 12px;
        font-weight: 500;
        color: #111;
        margin-bottom: 12px;
      }
      .account-empty-text {
        font-size: 11px;
        font-weight: 300;
        letter-spacing: 0.03em;
        margin-bottom: 24px;
      }
      .account-quick-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-bottom: 48px;
      }
      .account-quick-action {
        padding: 20px;
        background: #fff;
        border: 0.8px solid #e5e5e5;
        cursor: pointer;
        transition: all 0.3s;
        text-align: center;
      }
      .account-quick-action:hover {
        border-color: #111;
      }
      .account-quick-action-icon {
        font-size: 24px;
        margin-bottom: 12px;
        color: #111;
      }
      .account-quick-action-label {
        font-size: var(--ui-font-size, 9px);
        letter-spacing: var(--ui-letter-spacing, 0.2em);
        font-weight: var(--ui-font-weight, 400);
        text-transform: uppercase;
        color: #111;
      }
    </style>
    
    <div class="account-section">
      <div class="account-header">
        <div class="account-welcome">
          <h1 class="account-name">Your Account</h1>
          <div class="account-email">${loginState.customerEmail || ''}</div>
        </div>
        <button class="account-signout" onclick="signOut()">Sign Out</button>
      </div>
      
      <div class="account-stats">
        <div class="account-stat-card">
          <div class="account-stat-value">${customerData.orderCount || 0}</div>
          <div class="account-stat-label">Orders</div>
        </div>
        <div class="account-stat-card">
          <div class="account-stat-value">R${(customerData.totalSpent || 0).toLocaleString()}</div>
          <div class="account-stat-label">Total Spent</div>
        </div>
        <div class="account-stat-card">
          <div class="account-stat-value">${reviews.length || 0}</div>
          <div class="account-stat-label">Reviews</div>
        </div>
        <div class="account-stat-card">
          <div class="account-stat-value">${customerData.isSubscribed ? 'Yes' : 'No'}</div>
          <div class="account-stat-label">Subscribed</div>
        </div>
      </div>
      
      <div class="account-quick-actions">
        <div class="account-quick-action" onclick="navigateTo('cart')">
          <div class="account-quick-action-icon">
            <i class="ph-thin ph-shopping-bag"></i>
          </div>
          <div class="account-quick-action-label">Shopping Bag</div>
        </div>
        <div class="account-quick-action" onclick="navigateTo('wishlist')">
          <div class="account-quick-action-icon">
            <i class="ph-thin ph-bookmark-simple"></i>
          </div>
          <div class="account-quick-action-label">Wishlist</div>
        </div>
        <div class="account-quick-action" onclick="navigateTo('products')">
          <div class="account-quick-action-icon">
            <i class="ph-thin ph-magnifying-glass"></i>
          </div>
          <div class="account-quick-action-label">Shop New Arrivals</div>
        </div>
      </div>
      
      <div class="account-section-title">Recent Orders</div>
      
      ${orders.length > 0 ? `
        <div class="account-order-list">
          ${orders.slice(0, 5).map(order => {
            const date = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('en-ZA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }) : 'N/A';
            const itemCount = order.items ? order.items.length : (order.itemCount || 0);
            const total = order.subtotal || order.total || 0;
            const status = order.status || 'pending';
            
            return `
              <div class="account-order-item" onclick="viewOrderDetails('${order.id}')">
                <div class="account-order-header">
                  <div>
                    <div class="account-order-number">${order.orderNumber || 'ORDER-' + order.id.substring(0, 8)}</div>
                    <div class="account-order-date">${date}</div>
                  </div>
                  <div class="account-order-status ${status}">${status}</div>
                </div>
                <div class="account-order-details">
                  <div class="account-order-items">${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
                  <div class="account-order-total">R${total.toLocaleString()}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="account-empty">
          <div class="account-empty-title">No orders yet</div>
          <div class="account-empty-text">Your order history will appear here once you make your first purchase.</div>
        </div>
      `}
      
      <div class="account-section-title">Quick Links</div>
      <div class="account-quick-actions">
        <div class="account-quick-action" onclick="openChat()">
          <div class="account-quick-action-icon">
            <i class="ph-thin ph-chat"></i>
          </div>
          <div class="account-quick-action-label">Customer Support</div>
        </div>
        <div class="account-quick-action" onclick="navigateTo('editorial')">
          <div class="account-quick-action-icon">
            <i class="ph-thin ph-book-open"></i>
          </div>
          <div class="account-quick-action-label">Editorial</div>
        </div>
      </div>
    </div>
    
    <div class="back-btn-wrap">
      <button class="back-btn" onclick="navigateTo('home')">Back Home</button>
    </div>
    
    <footer id="account-footer"></footer>
  `;
  
  buildFooter('account-footer');
}

function viewOrderDetails(orderId) {
  if (!loginState.customerData || !loginState.customerData.orders) return;
  
  const order = loginState.customerData.orders.find(o => o.id === orderId);
  if (!order) return;
  
  // Create modal for order details
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;
  
  const date = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'N/A';
  
  const items = order.items || [];
  
  modal.innerHTML = `
    <div style="
      background: #fff;
      max-width: 600px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      padding: 40px;
      position: relative;
    " onclick="event.stopPropagation()">
      <button onclick="this.closest('div[style*=fixed]').remove()" style="
        position: absolute;
        top: 16px;
        right: 16px;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #888;
      ">×</button>
      
      <div style="margin-bottom: 32px;">
        <div style="
          font-size: var(--ui-font-size, 9px);
          letter-spacing: var(--ui-letter-spacing, 0.2em);
          font-weight: var(--ui-font-weight, 400);
          text-transform: uppercase;
          color: #888;
          margin-bottom: 8px;
        ">Order Details</div>
        <div style="font-size: 11px; color: #111; margin-bottom: 4px;">
          <strong>Order:</strong> ${order.orderNumber || 'ORDER-' + order.id.substring(0, 8)}
        </div>
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">${date}</div>
        <div style="font-size: 11px; color: #111; margin-bottom: 4px;">
          Status: <span style="text-transform: uppercase;">${order.status || 'pending'}</span>
        </div>
        ${order.shippingAddress ? `
          <div style="font-size: 11px; color: #888; margin-top: 12px;">
            <strong>Shipping Address:</strong><br>
            ${order.shippingAddress.address || ''}<br>
            ${order.shippingAddress.city || ''}, ${order.shippingAddress.postalCode || ''}
          </div>
        ` : ''}
      </div>
      
      ${items.length > 0 ? `
        <div style="margin-bottom: 24px;">
          <div style="
            font-size: var(--ui-font-size, 9px);
            letter-spacing: var(--ui-letter-spacing, 0.2em);
            font-weight: var(--ui-font-weight, 400);
            text-transform: uppercase;
            color: #888;
            margin-bottom: 16px;
          ">Items</div>
          ${items.map(item => `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 0.5px solid #f0f0f0; font-size: 11px;">
              <span style="color: #111;">${item.name || 'Item'} ${item.size ? '· ' + item.size : ''} × ${item.qty || 1}</span>
              <span style="color: #111;">R${((item.price || 0) * (item.qty || 1)).toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; justify-content: space-between; padding-top: 16px; font-size: 12px;">
          <strong style="color: #111;">Total</strong>
          <strong style="color: #111;">R${(order.subtotal || order.total || 0).toLocaleString()}</strong>
        </div>
      ` : `
        <div style="font-size: 11px; color: #888;">No items found for this order.</div>
      `}
    </div>
  `;
  
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function showOrderHistory() {
  navigateTo('account');
}

function openChat() {
  if (typeof toggleChat === 'function') {
    if (!document.getElementById('chat-window')?.classList.contains('open')) {
      toggleChat();
    }
  }
}
