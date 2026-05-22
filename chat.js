// ==================== JANEDORE CHATBOT - FIXED & STABILIZED ====================
// Chats & live messages → Firebase Realtime Database (RTDB)
// Order lookups, stats → Firestore

// ==================== DEBUG PANEL ====================
(function initDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'janedore-debug-panel';
  panel.innerHTML = `
    <div style="position:fixed;left:10px;top:10px;width:300px;max-height:400px;background:#1a1a2e;color:#e0e0e0;font:11px monospace;border-radius:6px;z-index:999999;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.5);">
      <div style="background:#16213e;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #0f3460;">
        <span style="font-weight:bold;color:#e94560;">🐛 Debug</span>
        <button onclick="document.getElementById('janedore-debug-panel').style.display='none'" style="background:none;border:none;color:#e0e0e0;cursor:pointer;font-size:14px;">×</button>
      </div>
      <div id="debug-content" style="padding:10px;max-height:350px;overflow-y:auto;line-height:1.6;">
        <div style="color:#888;">Initializing...</div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  
  // Expose debug functions
  window.debugLog = function(message, type = 'info') {
    const content = document.getElementById('debug-content');
    if (!content) return;
    const colors = { error: '#ff6b6b', warn: '#ffd93d', info: '#6c5ce7', success: '#51cf66', firebase: '#ff922b' };
    const color = colors[type] || '#e0e0e0';
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.style.cssText = `padding:2px 0;border-bottom:1px solid #16213e;color:${color};`;
    entry.textContent = `[${time}] ${message}`;
    content.appendChild(entry);
    content.scrollTop = content.scrollHeight;
    if (content.children.length > 50) content.removeChild(content.firstChild);
  };
  
  window.debugChatState = function() {
    console.log('=== CHAT STATE ===');
    console.log('currentUser:', currentUser?.uid || 'null');
    console.log('customerEmail:', customerEmail);
    console.log('chatSessionId:', chatSessionId);
    console.log('chatOpen:', chatOpen);
    console.log('chatMode:', chatMode);
    console.log('hasListener:', !!chatUnsub);
    console.log('anonInProgress:', anonAuthInProgress);
    window.debugLog('State logged to console', 'info');
  };
  
  window.testSendMessage = function(text = 'Test message ' + Date.now()) {
    const input = safeEl('chat-input');
    if (input) {
      input.value = text;
      sendChatMessage();
      window.debugLog(`Test message sent: "${text}"`, 'info');
    } else {
      window.debugLog('Chat input not found - chat not open', 'error');
    }
  };
  
  window.testOrderLookup = function(orderNum = 'ORD-12345') {
    const input = safeEl('order-lookup-input');
    if (input) {
      input.value = orderNum;
      lookupOrder();
      window.debugLog(`Test order lookup: "${orderNum}"`, 'info');
    } else {
      window.debugLog('Order input not found', 'error');
    }
  };
  
  window.resetChat = function() {
    clearChatSession();
    window.debugLog('Chat reset complete', 'success');
  };
})();

// ==================== FIREBASE INITIALIZATION ====================
let db = null;
let rtdb = null;
let firebaseReady = false;

function initializeFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded');
    }
    
    // Validate Firebase app initialization
    if (!firebase.apps || !firebase.apps.length) {
      throw new Error('Firebase not initialized - check your config');
    }
    
    db = firebase.firestore();
    rtdb = firebase.database();
    
    // Test connections
    Promise.all([
      db.collection('_health_check').doc('test').get().catch(() => null),
      rtdb.ref('.info/connected').once('value')
    ]).then(([firestoreResult, rtdbResult]) => {
      const rtdbConnected = rtdbResult.val() === true;
      const firestoreWorking = firestoreResult !== null || true; // Firestore might need indexes
      
      if (rtdbConnected) {
        firebaseReady = true;
        window.debugLog('✅ Firebase initialized - RTDB connected', 'success');
      } else {
        window.debugLog('⚠️ Firebase initialized but RTDB not connected', 'warn');
      }
    }).catch(err => {
      window.debugLog('❌ Firebase connection test failed: ' + err.message, 'error');
    });
    
    window.debugLog('Firebase instances created', 'firebase');
    return true;
  } catch (error) {
    window.debugLog('❌ Firebase init error: ' + error.message, 'error');
    console.error('Firebase initialization failed:', error);
    return false;
  }
}

// Initialize immediately
initializeFirebase();

// ==================== STATE MANAGEMENT ====================
let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase().trim();
let customerName  = localStorage.getItem('janedore_chat_name') || '';
let chatOpen = false, chatUnsub = null, chatMode = null;
let currentUser = null;
let anonAuthInProgress = false;
let typingTimeout = null;
let authReady = false;
let pendingAuthQueue = [];

// RTDB listener tracking
let activeListeners = {
  messages: null,
  adminTyping: null
};

// ==================== HELPERS ====================
function safeEl(id) { 
  return document.getElementById(id) || null; 
}

function setDisplay(id, value) { 
  const el = safeEl(id); 
  if (el) {
    el.style.display = value;
    window.debugLog(`Display ${id}: ${value}`, 'info');
  } else {
    window.debugLog(`Element not found: ${id}`, 'warn');
  }
}

function normalizeOrderNumber(orderNum) {
  if (!orderNum) return '';
  let normalized = orderNum.trim().toUpperCase();
  // Remove all spaces
  normalized = normalized.replace(/\s+/g, '');
  return normalized;
}

function normalizeEmail(email) {
  if (!email) return '';
  return email.trim().toLowerCase();
}

// ==================== AUTH QUEUE PROCESSOR ====================
function processAuthQueue() {
  while (pendingAuthQueue.length > 0) {
    const callback = pendingAuthQueue.shift();
    try {
      callback(currentUser);
    } catch (e) {
      window.debugLog('Auth queue callback error: ' + e.message, 'error');
    }
  }
}

// ==================== FIREBASE AUTH ====================
firebase.auth().onAuthStateChanged((user) => {
  window.debugLog(`Auth state changed: ${user ? user.uid : 'null'}`, 'firebase');
  currentUser = user;
  authReady = true;
  
  if (user && user.email) {
    customerEmail = normalizeEmail(user.email);
    localStorage.setItem('janedore_chat_email', customerEmail);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    window.debugLog(`User authenticated: ${customerEmail}`, 'success');
    if (chatOpen) showOptionsScreen();
  } else if (user && user.isAnonymous) {
    window.debugLog('Anonymous user active', 'info');
  }
  
  processAuthQueue();
});

async function ensureAnonymousAuth() {
  // Wait for auth to be ready
  if (!authReady) {
    window.debugLog('Auth not ready, waiting...', 'warn');
    await new Promise(resolve => {
      const checkAuth = () => {
        if (authReady) {
          resolve();
        } else {
          setTimeout(checkAuth, 100);
        }
      };
      checkAuth();
    });
  }
  
  if (currentUser) {
    window.debugLog('Already authenticated: ' + currentUser.uid, 'success');
    return currentUser;
  }
  
  if (anonAuthInProgress) {
    window.debugLog('Anonymous auth in progress, waiting...', 'warn');
    // Wait for existing auth attempt
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (currentUser) return currentUser;
      if (!anonAuthInProgress) break;
    }
    if (currentUser) return currentUser;
  }
  
  anonAuthInProgress = true;
  window.debugLog('Starting anonymous auth...', 'firebase');
  
  try {
    const result = await firebase.auth().signInAnonymously();
    currentUser = result.user;
    window.debugLog('Anonymous auth successful: ' + result.user.uid, 'success');
    return currentUser;
  } catch (error) {
    window.debugLog('❌ Anonymous auth failed: ' + error.message, 'error');
    console.error('Anonymous auth error:', error);
    return null;
  } finally {
    anonAuthInProgress = false;
  }
}

async function signInWithEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  window.debugLog(`Sign in attempt: ${normalizedEmail}`, 'firebase');
  
  try {
    const actionCodeSettings = { 
      url: window.location.href.split('?')[0], // Remove any existing query params
      handleCodeInApp: true 
    };
    await firebase.auth().sendSignInLinkToEmail(normalizedEmail, actionCodeSettings);
    localStorage.setItem('janedore_chat_email_pending', normalizedEmail);
    window.debugLog('Email link sent successfully', 'success');
    return { success: true, method: 'emailLink' };
  } catch (error) {
    window.debugLog('❌ Email link auth failed: ' + error.message, 'error');
    console.warn('Email link auth failed:', error.message);
    
    // Fallback to anonymous
    try {
      window.debugLog('Falling back to anonymous auth...', 'warn');
      const user = await ensureAnonymousAuth();
      if (user) {
        window.debugLog('Anonymous fallback successful', 'success');
        return { success: true, method: 'anonymous' };
      }
    } catch (fallbackError) {
      window.debugLog('❌ Anonymous fallback failed: ' + fallbackError.message, 'error');
      console.warn('Anonymous fallback failed:', fallbackError.message);
    }
    return { success: false, error: error.message };
  }
}

// ==================== SESSION MANAGEMENT ====================
function clearChatSession() {
  window.debugLog('Clearing chat session...', 'info');
  
  firebase.auth().signOut().catch((err) => {
    window.debugLog('Sign out error: ' + err.message, 'warn');
  });
  
  // Clean up all listeners
  if (activeListeners.messages) {
    rtdb.ref('live_chat/' + chatSessionId + '/messages').off('child_added', activeListeners.messages);
    activeListeners.messages = null;
  }
  if (activeListeners.adminTyping) {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping').off('value', activeListeners.adminTyping);
    activeListeners.adminTyping = null;
  }
  
  if (chatUnsub) { 
    chatUnsub(); 
    chatUnsub = null; 
  }
  
  currentUser = null;
  authReady = false;
  renderedMessageIds.clear();
  
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  localStorage.removeItem('janedore_chat_session');
  localStorage.removeItem('janedore_chat_email_pending');
  
  customerEmail = '';
  customerName  = '';
  chatSessionId = 'chat-' + Date.now();
  localStorage.setItem('janedore_chat_session', chatSessionId);
  chatMode = null;

  // Clear inputs
  const nameInput = safeEl('chat-name-input');
  if (nameInput) nameInput.value = '';
  const emailInput = safeEl('chat-email-input');
  if (emailInput) emailInput.value = '';

  showEmailScreen();
  window.debugLog('Chat session cleared', 'success');
}

// ==================== SCREEN CONTROL ====================
function toggleChat() {
  window.debugLog('Toggle chat', 'info');
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) {
    window.debugLog('❌ Chat window element not found!', 'error');
    return;
  }
  win.classList.toggle('open', chatOpen);
  if (chatOpen) {
    setDisplay('chat-unread-dot', 'none');
    if (customerEmail) {
      showOptionsScreen();
    } else {
      showEmailScreen();
    }
  } else {
    // Don't unsubscribe on close to maintain real-time updates
    window.debugLog('Chat closed, keeping listeners active', 'info');
  }
}

function showEmailScreen() {
  window.debugLog('Showing email screen', 'info');
  setDisplay('chat-email-screen',   'flex');
  setDisplay('chat-options',        'none');
  setDisplay('chat-messages',       'none');
  setDisplay('chat-input-wrap',     'none');
  setDisplay('chat-customer-info',  'none');
  setDisplay('chat-typing-indicator','none');
  setDisplay('order-lookup',        'none');
}

function showOptionsScreen() {
  window.debugLog('Showing options screen', 'info');
  setDisplay('chat-email-screen',   'none');
  setDisplay('chat-options',        'flex');
  setDisplay('chat-messages',       'none');
  setDisplay('chat-input-wrap',     'none');
  setDisplay('chat-customer-info',  'none');
  setDisplay('chat-typing-indicator','none');
  setDisplay('order-lookup',        'none');
}

// ==================== EMAIL SUBMIT ====================
async function submitEmail() {
  window.debugLog('Submit email called', 'info');
  
  const nameInputEl  = safeEl('chat-name-input');
  const emailInputEl = safeEl('chat-email-input');
  const errorEl      = safeEl('chat-email-error');

  const rawName  = (nameInputEl?.value  || '').trim();
  const rawEmail = (emailInputEl?.value || '').trim();
  const email    = normalizeEmail(rawEmail);

  window.debugLog(`Email submission: "${email}", name: "${rawName}"`, 'info');

  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errorEl) {
      errorEl.style.display = 'block';
      window.debugLog('Invalid email format', 'warn');
    }
    return;
  }
  if (errorEl) errorEl.style.display = 'none';

  // Persist name + email
  customerName  = rawName;
  customerEmail = email;
  localStorage.setItem('janedore_chat_name',  customerName);
  localStorage.setItem('janedore_chat_email', email);
  chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
  localStorage.setItem('janedore_chat_session', chatSessionId);

  window.debugLog(`Session ID set: ${chatSessionId}`, 'info');

  const authResult = await signInWithEmail(email);

  if (authResult.success && authResult.method === 'emailLink') {
    const emailScreen = safeEl('chat-email-screen');
    if (emailScreen) {
      emailScreen.innerHTML = `
        <div class="chat-email-title">Check Your Email</div>
        <div class="chat-email-subtitle">We sent a sign-in link to ${email}. Click the link to continue, or proceed below.</div>
        <button class="chat-email-btn" onclick="showOptionsScreen()">Continue to Chat</button>
      `;
      window.debugLog('Email link sent, showing confirmation', 'success');
    }
  } else {
    showOptionsScreen();
  }
}

// ==================== START CHAT ====================
function startChat() {
  window.debugLog('Starting chat...', 'info');
  
  // Validate Firebase readiness
  if (!firebaseReady) {
    window.debugLog('⚠️ Firebase not ready, will retry...', 'warn');
  }
  
  setDisplay('chat-email-screen',    'none');
  setDisplay('chat-options',         'none');
  setDisplay('chat-messages',        'flex');
  setDisplay('chat-input-wrap',      'flex');
  setDisplay('chat-customer-info',   'flex');
  setDisplay('chat-typing-indicator','none');
  setDisplay('order-lookup',         'none');

  // Populate the info bar
  const nameEl  = safeEl('chat-customer-name');
  const emailEl = safeEl('chat-customer-email');
  if (nameEl)  nameEl.textContent  = customerName  || '';
  if (emailEl) emailEl.textContent = customerEmail || '';

  loadCustomerStats();
  chatMode = 'chat';
  loadAllMessages();
  listenChat();
  listenTypingIndicator();
  
  const inputEl = safeEl('chat-input');
  if (inputEl) {
    inputEl.focus();
    // Ensure enter key works
    inputEl.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    };
  }
  
  window.debugLog(`Chat started with session: ${chatSessionId}`, 'success');
}

// ==================== CUSTOMER STATS (Firestore) ====================
async function loadCustomerStats() {
  const statsEl = safeEl('chat-customer-stats');
  if (!statsEl) return;
  statsEl.textContent = '';

  window.debugLog(`Loading stats for: ${customerEmail}`, 'info');

  try {
    const parts = [];
    
    // Load orders
    try {
      const ordersSnap = await db.collection('orders')
        .where('customerEmail', '==', customerEmail)
        .limit(10)
        .get();
      if (!ordersSnap.empty) {
        parts.push(`${ordersSnap.size} order${ordersSnap.size > 1 ? 's' : ''}`);
        window.debugLog(`Found ${ordersSnap.size} orders`, 'success');
      }
    } catch (e) {
      window.debugLog('Orders stats failed: ' + e.message, 'warn');
    }
    
    // Load reviews
    try {
      const reviewsSnap = await db.collection('reviews')
        .where('email', '==', customerEmail)
        .limit(10)
        .get();
      if (!reviewsSnap.empty) {
        parts.push(`${reviewsSnap.size} review${reviewsSnap.size > 1 ? 's' : ''}`);
      }
    } catch (e) {
      window.debugLog('Reviews stats failed: ' + e.message, 'warn');
    }
    
    // Load newsletter
    try {
      const newsletterSnap = await db.collection('newsletter')
        .where('email', '==', customerEmail)
        .limit(1)
        .get();
      if (!newsletterSnap.empty) parts.push('subscribed');
    } catch (e) {
      window.debugLog('Newsletter stats failed: ' + e.message, 'warn');
    }
    
    statsEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Customer';
    window.debugLog(`Stats loaded: ${statsEl.textContent}`, 'success');
  } catch (e) {
    window.debugLog('Stats error: ' + e.message, 'error');
    if (statsEl) statsEl.textContent = 'Customer';
  }
}

// ==================== ORDER LOOKUP (Firestore) ====================
function showOrderLookup() {
  window.debugLog('Showing order lookup', 'info');
  setDisplay('chat-email-screen',   'none');
  setDisplay('chat-options',        'none');
  setDisplay('chat-messages',       'none');
  setDisplay('chat-input-wrap',     'none');
  setDisplay('chat-customer-info',  'none');
  setDisplay('chat-typing-indicator','none');
  setDisplay('order-lookup',        'flex');
  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '';
}

async function lookupOrder() {
  const resultEl  = safeEl('order-result');
  const inputEl   = safeEl('order-lookup-input');
  if (!resultEl) {
    window.debugLog('❌ Order result element not found', 'error');
    return;
  }

  const rawOrderNumber = normalizeOrderNumber(inputEl?.value || '');

  window.debugLog(`Order lookup: "${rawOrderNumber}" for ${customerEmail}`, 'info');

  if (!rawOrderNumber) {
    resultEl.innerHTML = '<p style="color:#888;">Please enter your order number.</p>';
    window.debugLog('Empty order number', 'warn');
    return;
  }
  
  if (!customerEmail) {
    resultEl.innerHTML = '<p style="color:#888;">No email on file. Please restart the chat.</p>';
    window.debugLog('No email for order lookup', 'error');
    return;
  }

  resultEl.textContent = 'Searching…';

  try {
    // Ensure authentication before querying
    const authUser = await ensureAnonymousAuth();
    if (!authUser) {
      resultEl.innerHTML = '<p style="color:#888;">Authentication required.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please contact us via chat for order support.</p>';
      window.debugLog('❌ Authentication failed for order lookup', 'error');
      return;
    }

    const orders = [];
    const searchAttempts = [];
    
    // Build search variations
    const normalizedEmail = normalizeEmail(customerEmail);
    const searchVariations = [
      rawOrderNumber,
      rawOrderNumber.replace(/-/g, ''),
      rawOrderNumber.startsWith('ORD') && !rawOrderNumber.includes('-') ? 
        rawOrderNumber.replace(/^(ORD)(\d)/, '$1-$2') : null
    ].filter(Boolean);

    window.debugLog(`Searching variations: ${searchVariations.join(', ')}`, 'info');

    // Try each variation
    for (const searchTerm of searchVariations) {
      if (orders.length > 0) break;
      
      searchAttempts.push(searchTerm);
      
      try {
        const snap = await db.collection('orders')
          .where('orderNumber', '==', searchTerm)
          .where('customerEmail', '==', normalizedEmail)
          .limit(1)
          .get();
        
        if (!snap.empty) {
          snap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
          window.debugLog(`Found order with term: "${searchTerm}"`, 'success');
        }
      } catch (e) {
        window.debugLog(`Search failed for "${searchTerm}": ${e.message}`, 'warn');
        
        // Check for permission errors
        if (e.message && (e.message.includes('permission') || e.message.includes('Missing or insufficient'))) {
          window.debugLog('❌ Firestore permission denied - check security rules', 'error');
          resultEl.innerHTML = '<p style="color:#888;">Authentication required.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please contact us via chat for order support.</p>';
          return;
        }
      }
    }

    if (orders.length === 0) {
      window.debugLog(`No orders found after trying: ${searchAttempts.join(', ')}`, 'warn');
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and ensure you\'re using the email you ordered with.</p>';
      return;
    }

    const o = orders[0];
    const date      = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
    const itemCount = o.items ? o.items.length : (o.itemCount || 0);
    
    resultEl.innerHTML = `
      <p style="margin-bottom:12px;font-size:10px;">Order found</p>
      <div style="padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.6;">
        <strong>Order #${o.orderNumber || o.id.substring(0, 12)}</strong><br>
        Status: ${o.status || 'pending'}<br>
        Items: ${itemCount} · Total: R${o.subtotal || o.total || 0}<br>
        Date: ${date}
      </div>`;
    
    window.debugLog(`Order displayed: ${o.orderNumber}`, 'success');
  } catch (e) {
    window.debugLog('❌ Order lookup error: ' + e.message, 'error');
    console.error('Order lookup error:', e);
    
    if (e.message && (e.message.includes('permission') || e.message.includes('Missing or insufficient'))) {
      resultEl.innerHTML = '<p style="color:#888;">Authentication required.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please contact us via chat for order support.</p>';
    } else {
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and try again.</p>';
    }
  }
}

function backToChatOptions() { 
  window.debugLog('Back to chat options', 'info');
  showOptionsScreen(); 
}

// ==================== MESSAGES (RTDB) ====================
const renderedMessageIds = new Set();

async function loadAllMessages() {
  const el = safeEl('chat-messages');
  if (!el) {
    window.debugLog('❌ Chat messages element not found', 'error');
    return;
  }
  el.innerHTML = '';
  renderedMessageIds.clear();

  window.debugLog(`Loading messages for: ${chatSessionId}`, 'info');

  try {
    const snapshot = await rtdb
      .ref('live_chat/' + chatSessionId + '/messages')
      .orderByChild('createdAt')
      .once('value');

    if (!snapshot.exists()) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
      window.debugLog('No messages yet, showing welcome', 'info');
      return;
    }

    const messages = [];
    snapshot.forEach(child => {
      messages.push({ _key: child.key, ...child.val() });
      renderedMessageIds.add(child.key);
    });
    messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    messages.forEach(m => {
      if (m.type === 'auth') return;
      appendMessageEl(el, m);
    });

    el.scrollTop = el.scrollHeight;
    window.debugLog(`Loaded ${messages.length} messages`, 'success');
  } catch (e) {
    window.debugLog('❌ Error loading messages: ' + e.message, 'error');
    console.error('Error loading messages:', e);
  }
}

function appendMessageEl(container, m) {
  const t = m.createdAt
    ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (m.sender || 'customer');
  div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
  container.appendChild(div);
}

function listenChat() {
  window.debugLog('Setting up chat listener...', 'info');
  
  // Clean up existing listener
  if (activeListeners.messages) {
    rtdb.ref('live_chat/' + chatSessionId + '/messages').off('child_added', activeListeners.messages);
    activeListeners.messages = null;
    window.debugLog('Removed existing message listener', 'info');
  }
  
  if (chatUnsub) { 
    chatUnsub(); 
    chatUnsub = null; 
  }

  const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
  const startTime   = Date.now();

  const handler = messagesRef
    .orderByChild('createdAt')
    .startAt(startTime)
    .on('child_added', (snap) => {
      const m     = snap.val();
      const docId = snap.key;
      
      if (!m || m.type === 'auth') return;
      if (renderedMessageIds.has(docId)) {
        window.debugLog(`Duplicate message prevented: ${docId}`, 'warn');
        return;
      }
      
      renderedMessageIds.add(docId);
      window.debugLog(`New message from ${m.sender}: "${m.text?.substring(0, 30)}..."`, 'info');

      const el = safeEl('chat-messages');
      if (!el) return;
      
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      appendMessageEl(el, m);
      if (atBottom) el.scrollTop = el.scrollHeight;

      const unreadDot = safeEl('chat-unread-dot');
      if (!chatOpen && m.sender === 'admin' && unreadDot) {
        unreadDot.style.display = 'block';
        window.debugLog('Unread dot shown for admin message', 'info');
      }
    });

  activeListeners.messages = handler;
  
  chatUnsub = () => {
    messagesRef.off('child_added', handler);
    activeListeners.messages = null;
    window.debugLog('Chat listener removed', 'info');
  };
  
  window.debugLog('Chat listener active', 'success');
}

// ==================== TYPING INDICATOR (RTDB) ====================
function handleCustomerTyping() {
  if (!chatSessionId) return;
  
  rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false);
  }, 2000);
}

function listenTypingIndicator() {
  window.debugLog('Setting up typing indicator listener', 'info');
  
  // Clean up existing listener
  if (activeListeners.adminTyping) {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping').off('value', activeListeners.adminTyping);
    activeListeners.adminTyping = null;
  }
  
  const typingRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping');
  const handler = typingRef.on('value', (snap) => {
    const isTyping = snap.val() === true;
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) {
      indicator.style.display = isTyping ? 'block' : 'none';
      if (isTyping) window.debugLog('Admin typing...', 'info');
    }
  });
  
  activeListeners.adminTyping = handler;
}

// ==================== SEND MESSAGE (RTDB) ====================
async function sendChatMessage() {
  window.debugLog('Send message called', 'info');
  
  const input = safeEl('chat-input');
  if (!input) {
    window.debugLog('❌ Chat input not found', 'error');
    return;
  }
  
  const text = input.value.trim();
  if (!text) {
    window.debugLog('Empty message, not sending', 'warn');
    return;
  }

  window.debugLog(`Sending message: "${text.substring(0, 30)}..."`, 'info');

  try {
    // Ensure Firebase is initialized
    if (!db || !rtdb) {
      window.debugLog('❌ Firebase not initialized', 'error');
      initializeFirebase();
      if (!db || !rtdb) {
        window.debugLog('❌ Firebase initialization failed, cannot send', 'error');
        return;
      }
    }
    
    const authUser = await ensureAnonymousAuth();
    if (!authUser) {
      window.debugLog('❌ No auth for sending message', 'error');
      return;
    }

    window.debugLog(`Sending to path: live_chat/${chatSessionId}/messages`, 'firebase');

    const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
    const messageData = {
      sessionId:     chatSessionId,
      customerEmail: customerEmail || '',
      customerName:  customerName  || '',
      text:          text,
      sender:        'customer',
      createdAt:     firebase.database.ServerValue.TIMESTAMP, // Use server timestamp
      read:          false,
      userId:        currentUser ? currentUser.uid : 'anonymous'
    };

    await messagesRef.push(messageData);
    window.debugLog('Message sent successfully', 'success');

    // Update session meta
    await rtdb.ref('live_chat/' + chatSessionId + '/meta').update({
      customerEmail:   customerEmail || '',
      customerName:    customerName  || '',
      lastMessage:     text,
      lastMessageAt:   firebase.database.ServerValue.TIMESTAMP,
      userId:          currentUser ? currentUser.uid : 'anonymous',
      customerTyping:  false
    });

    input.value = '';
    // Clear typing state
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false);
    clearTimeout(typingTimeout);
    
    // Refocus input
    input.focus();
    
  } catch (e) {
    window.debugLog('❌ Chat send error: ' + e.message, 'error');
    console.error('Chat send error:', e);
    
    // Show error to user
    const el = safeEl('chat-messages');
    if (el) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'chat-msg system';
      errorDiv.innerHTML = '<div style="color:#ff6b6b;">Message failed to send. Please try again.</div>';
      el.appendChild(errorDiv);
      setTimeout(() => errorDiv.remove(), 5000);
    }
  }
}

// ==================== EMAIL LINK SIGN-IN ====================
async function handleEmailLinkSignIn() {
  try {
    if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
      window.debugLog('Email link detected in URL', 'firebase');
      
      let email = localStorage.getItem('janedore_chat_email_pending');
      if (!email) {
        email = window.prompt('Please enter your email for confirmation');
      }
      
      if (email) {
        const normalizedEmail = normalizeEmail(email);
        window.debugLog(`Completing sign-in for: ${normalizedEmail}`, 'info');
        
        try {
          await firebase.auth().signInWithEmailLink(normalizedEmail, window.location.href);
          localStorage.removeItem('janedore_chat_email_pending');
          customerEmail = normalizedEmail;
          localStorage.setItem('janedore_chat_email', normalizedEmail);
          chatSessionId = 'chat-' + normalizedEmail.replace(/[^a-zA-Z0-9]/g, '-');
          localStorage.setItem('janedore_chat_session', chatSessionId);
          window.history.replaceState({}, document.title, window.location.pathname);
          window.debugLog('Email link sign-in successful', 'success');
        } catch (error) {
          window.debugLog('❌ Email link sign-in failed: ' + error.message, 'error');
          console.warn('Email link sign-in failed:', error.message);
        }
      }
    }
  } catch (error) {
    window.debugLog('❌ Email link handler error: ' + error.message, 'error');
  }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  window.debugLog('DOM Content Loaded - initializing chat', 'info');
  
  handleEmailLinkSignIn();
  
  // Pre-fill name/email if returning user
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  
  // Add keyboard event listener to send button
  const sendButton = safeEl('chat-send-btn');
  if (sendButton) {
    window.debugLog('Send button found and enhanced', 'success');
  } else {
    window.debugLog('⚠️ Send button not found - chat may not work', 'warn');
  }
  
  window.debugLog('Chat initialization complete', 'success');
  window.debugChatState();
});

// Global error handler for uncaught Firebase errors
window.addEventListener('error', (event) => {
  if (event.error && event.error.message && 
      (event.error.message.includes('firebase') || event.error.message.includes('Firestore'))) {
    window.debugLog('❌ Firebase error: ' + event.error.message, 'error');
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  window.debugLog('❌ Unhandled rejection: ' + (event.reason?.message || event.reason), 'error');
});
