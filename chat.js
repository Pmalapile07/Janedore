<script>
// ==================== CHAT LOGIC ====================
let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = localStorage.getItem('janedore_chat_email') || '';
let chatOpen = false, chatUnsub = null, chatMode = null;
let currentUser = null;

// ==================== FIREBASE AUTH ====================
// Initialize auth state listener
firebase.auth().onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    // User is signed in
    customerEmail = user.email || customerEmail;
    localStorage.setItem('janedore_chat_email', customerEmail);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    
    if (chatOpen) {
      showOptionsScreen();
    }
  } else {
    // User is signed out
    currentUser = null;
  }
});

async function signInAnonymously() {
  try {
    const result = await firebase.auth().signInAnonymously();
    currentUser = result.user;
    return result.user;
  } catch (error) {
    console.warn('Anonymous auth failed:', error.message);
    return null;
  }
}

async function signInWithEmail(email) {
  try {
    // Try to sign in with email link (passwordless)
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true
    };
    
    await firebase.auth().sendSignInLinkToEmail(email, actionCodeSettings);
    
    // Store email for later use
    localStorage.setItem('janedore_chat_email_pending', email);
    return { success: true, method: 'emailLink' };
  } catch (error) {
    console.warn('Email link auth failed:', error.message);
    
    // Fall back to anonymous auth with email stored
    try {
      const user = await signInAnonymously();
      if (user) {
        // Store email in user profile via chat document
        await db.collection('live_chat').add({
          sessionId: chatSessionId,
          customerEmail: email,
          text: 'Customer authenticated',
          sender: 'system',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          read: true,
          type: 'auth'
        });
        return { success: true, method: 'anonymous' };
      }
    } catch (fallbackError) {
      console.warn('Anonymous fallback failed:', fallbackError.message);
    }
    
    return { success: false, error: error.message };
  }
}

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chat-window');
  win.classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-unread-dot').style.display = 'none';
    if (currentUser && customerEmail) {
      showOptionsScreen();
    } else {
      showLoginRequiredScreen();
    }
  } else {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  }
}

function showLoginRequiredScreen() {
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-login-screen').style.display = 'flex';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'none';
}

function showEmailScreen() {
  document.getElementById('chat-email-screen').style.display = 'flex';
  document.getElementById('chat-login-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'none';
}

function showOptionsScreen() {
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-login-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'flex';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'none';
}

async function submitEmail() {
  const email = document.getElementById('chat-email-input').value.trim();
  const errorEl = document.getElementById('chat-email-error');
  
  if (!email || !email.includes('@') || !email.includes('.')) {
    errorEl.style.display = 'block';
    return;
  }
  
  errorEl.style.display = 'none';
  customerEmail = email;
  localStorage.setItem('janedore_chat_email', email);
  chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
  localStorage.setItem('janedore_chat_session', chatSessionId);
  
  // Try to authenticate with email
  const authResult = await signInWithEmail(email);
  
  if (authResult.success && authResult.method === 'emailLink') {
    // Show email sent confirmation
    const emailScreen = document.getElementById('chat-email-screen');
    emailScreen.innerHTML = `
      <div class="chat-email-title">Check Your Email</div>
      <div class="chat-email-subtitle">We sent a sign-in link to ${email}. Click the link to continue, or use the chat below.</div>
      <button class="chat-email-btn" onclick="showOptionsScreen()">Continue to Chat</button>
    `;
  } else {
    // Continue with anonymous auth or direct access
    showOptionsScreen();
  }
}

function startChat() {
  if (!currentUser) {
    showLoginRequiredScreen();
    return;
  }
  
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-login-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'flex';
  document.getElementById('chat-input-wrap').style.display = 'flex';
  document.getElementById('chat-customer-info').style.display = 'flex';
  document.getElementById('order-lookup').style.display = 'none';
  
  document.getElementById('chat-customer-email').textContent = customerEmail;
  loadCustomerStats();
  
  chatMode = 'chat';
  loadAllMessages();
  listenChat();
  document.getElementById('chat-input').focus();
}

function normalizeOrderNumber(orderNum) {
  if (!orderNum) return '';
  // Remove all dashes and spaces, convert to uppercase
  return orderNum.replace(/[-\s]/g, '').toUpperCase();
}

async function loadCustomerStats() {
  try {
    const customerEmailLower = customerEmail ? customerEmail.toLowerCase() : '';
    
    let orderCount = 0;
    let reviewsCount = 0;
    let newsletterCount = 0;
    
    // Query orders (now works with auth)
    try {
      const ordersSnap = await db.collection('orders').get();
      if (!ordersSnap.empty) {
        ordersSnap.docs.forEach(doc => {
          const data = doc.data();
          const docEmail = data.customerEmail || '';
          if (docEmail.toLowerCase() === customerEmailLower) {
            orderCount++;
          }
        });
      }
    } catch (e) {
      console.warn('Orders query failed:', e.message);
    }
    
    // Query reviews (public access)
    try {
      const reviewsSnap = await db.collection('reviews').where('email', '==', customerEmail).get();
      reviewsCount = reviewsSnap.size || 0;
    } catch (e) {
      console.warn('Reviews query failed:', e.message);
    }
    
    // Query newsletter (requires auth)
    try {
      const newsletterSnap = await db.collection('newsletter').where('email', '==', customerEmail).get();
      newsletterCount = newsletterSnap.size || 0;
    } catch (e) {
      console.warn('Newsletter query failed:', e.message);
    }
    
    const parts = [];
    if (orderCount > 0) parts.push(`${orderCount} orders`);
    if (reviewsCount > 0) parts.push(`${reviewsCount} reviews`);
    if (newsletterCount > 0) parts.push('subscribed');
    
    document.getElementById('chat-customer-stats').textContent = parts.length > 0 ? parts.join(' · ') : 'Customer';
  } catch (e) {
    console.warn('Stats error:', e.message);
    document.getElementById('chat-customer-stats').textContent = 'Customer';
  }
}

function showOrderLookup() {
  if (!currentUser) {
    showLoginRequiredScreen();
    return;
  }
  
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-login-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'flex';
  
  // Clear previous results and show input prompt
  const resultEl = document.getElementById('order-result');
  const inputEl = document.getElementById('order-lookup-input');
  if (resultEl) resultEl.innerHTML = '<p style="color:#888;font-size:10px;">Enter your order number above to track your order.</p>';
  if (inputEl) inputEl.value = '';
  if (inputEl) inputEl.focus();
}

async function lookupOrder() {
  // Check if user is logged in
  if (!currentUser) {
    showLoginRequiredScreen();
    return;
  }
  
  const resultEl = document.getElementById('order-result');
  const inputEl = document.getElementById('order-lookup-input');
  const searchValue = inputEl?.value?.trim() || '';
  
  if (!searchValue) {
    resultEl.innerHTML = '<p style="color:#888;font-size:10px;">Please enter an order number to search.</p>';
    return;
  }
  
  resultEl.textContent = 'Searching...';
  
  try {
    let orders = [];
    
    // Try by normalized order number first (with and without dash)
    const normalizedSearch = normalizeOrderNumber(searchValue);
    
    // Try exact match with original format
    let orderSnap = await db.collection('orders')
      .where('orderNumber', '==', searchValue)
      .get();
    
    if (!orderSnap.empty) {
      orderSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
    }
    
    // If no results, try normalized version
    if (orders.length === 0 && normalizedSearch !== searchValue) {
      orderSnap = await db.collection('orders')
        .where('orderNumber', '==', normalizedSearch)
        .get();
      
      if (!orderSnap.empty) {
        orderSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
      }
    }
    
    // Try with dash format if not found
    if (orders.length === 0 && !searchValue.includes('-') && searchValue.startsWith('ORD')) {
      const dashedVersion = searchValue.replace(/^(ORD)/, '$1-');
      orderSnap = await db.collection('orders')
        .where('orderNumber', '==', dashedVersion)
        .get();
      
      if (!orderSnap.empty) {
        orderSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
      }
    }
    
    // If still no results, search all orders manually
    if (orders.length === 0) {
      const allSnap = await db.collection('orders').get();
      const customerEmailLower = customerEmail ? customerEmail.toLowerCase() : '';
      
      allSnap.docs.forEach(d => {
        const data = d.data();
        const docOrderNumber = data.orderNumber || '';
        const normalizedDocOrder = normalizeOrderNumber(docOrderNumber);
        const docEmail = (data.customerEmail || '').toLowerCase();
        
        // Match by order number (normalized comparison)
        const orderMatch = (
          docOrderNumber === searchValue ||
          normalizedDocOrder === normalizedSearch ||
          normalizedDocOrder === normalizedSearch.replace('-', '') ||
          normalizedDocOrder === normalizedSearch.replace(/(ORD)(\d)/, '$1-$2')
        );
        
        // Match by email (only if customer is logged in with matching email)
        const emailMatch = customerEmailLower && docEmail === customerEmailLower;
        
        if (orderMatch || emailMatch) {
          if (!orders.find(o => o.id === d.id)) {
            orders.push({ id: d.id, ...data });
          }
        }
      });
    }
    
    if (orders.length === 0) {
      resultEl.innerHTML = '<p style="color:#888;">No orders found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please check your order number and try again.</p>';
      return;
    }
    
    // Remove duplicates
    const uniqueOrders = [];
    const seenIds = new Set();
    orders.forEach(o => {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id);
        uniqueOrders.push(o);
      }
    });
    
    uniqueOrders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    
    let html = '<p style="margin-bottom:12px;font-size:10px;">' + (uniqueOrders.length === 1 ? '1 order found' : uniqueOrders.length + ' orders found') + '</p>';
    uniqueOrders.forEach(o => {
      const date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
      const itemCount = o.items ? o.items.length : (o.itemCount || 0);
      html += `<div style="margin-top:8px;padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.5;">
        <strong>Order #${o.orderNumber || (o.id || '').substring(0, 12)}</strong><br>
        Status: ${o.status || 'pending'}<br>
        Items: ${itemCount} · Total: R${o.subtotal || o.total || 0}<br>
        ${o.customerEmail ? 'Email: ' + o.customerEmail + '<br>' : ''}${o.customerPhone ? 'Phone: ' + o.customerPhone + '<br>' : ''}${date}
      </div>`;
    });
    resultEl.innerHTML = html;
    
  } catch (e) {
    console.warn('Order lookup:', e.message);
    if (e.message && e.message.includes('permission')) {
      resultEl.innerHTML = '<p style="color:#888;">Order lookup requires authentication.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please log in to track your orders.</p>';
    } else {
      resultEl.innerHTML = '<p style="color:#888;">No orders found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please check your order number and try again.</p>';
    }
  }
}

function backToChatOptions() { 
  if (!currentUser) {
    showLoginRequiredScreen();
    return;
  }
  showOptionsScreen(); 
}

async function loadAllMessages() {
  if (!currentUser) return;
  
  const el = document.getElementById('chat-messages');
  el.innerHTML = '';
  
  try {
    const snapshot = await db.collection('live_chat')
      .where('sessionId', '==', chatSessionId)
      .get();
    
    const messages = [];
    snapshot.docs.forEach(d => messages.push(d.data()));
    messages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    
    if (messages.length === 0) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
      return;
    }
    
    messages.forEach(m => {
      if (m.type === 'auth') return; // Skip auth system messages
      const t = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
      const div = document.createElement('div');
      div.className = 'chat-msg ' + m.sender;
      div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
      el.appendChild(div);
    });
    
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    console.warn('Error loading messages:', e);
  }
}

function listenChat() {
  if (!currentUser) return;
  if (chatUnsub) chatUnsub();
  
  chatUnsub = db.collection('live_chat')
    .where('sessionId', '==', chatSessionId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const el = document.getElementById('chat-messages');
      const scroll = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      
      snap.docChanges().forEach(c => {
        if (c.type === 'added') {
          const m = c.doc.data();
          if (m.type === 'auth') return; // Skip auth system messages
          
          const existingTexts = Array.from(el.querySelectorAll('.chat-msg')).map(div => div.textContent);
          const isDuplicate = existingTexts.some(t => t.includes(m.text));
          
          if (!isDuplicate) {
            const t = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
            const div = document.createElement('div');
            div.className = 'chat-msg ' + m.sender;
            div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
            el.appendChild(div);
            
            if (!chatOpen && m.sender === 'admin') {
              document.getElementById('chat-unread-dot').style.display = 'block';
            }
          }
        }
      });
      
      if (scroll) el.scrollTop = el.scrollHeight;
    });
}

async function sendChatMessage() {
  if (!currentUser) {
    showLoginRequiredScreen();
    return;
  }
  
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  
  try {
    await db.collection('live_chat').add({
      sessionId: chatSessionId,
      customerEmail: customerEmail || '',
      text: text,
      sender: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false,
      userId: currentUser ? currentUser.uid : 'anonymous'
    });
    input.value = '';
  } catch (e) { 
    console.warn('Chat error:', e); 
  }
}

// Handle email link sign-in when page loads
async function handleEmailLinkSignIn() {
  if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('janedore_chat_email_pending');
    
    if (!email) {
      // Ask user for email
      email = window.prompt('Please enter your email for confirmation');
    }
    
    if (email) {
      try {
        const result = await firebase.auth().signInWithEmailLink(email, window.location.href);
        localStorage.removeItem('janedore_chat_email_pending');
        customerEmail = email;
        localStorage.setItem('janedore_chat_email', email);
        chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
        localStorage.setItem('janedore_chat_session', chatSessionId);
        
        // Clear the URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (error) {
        console.warn('Email link sign-in failed:', error.message);
      }
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  handleEmailLinkSignIn();
});
</script>
