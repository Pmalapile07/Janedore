// ==================== CHAT LOGIC ====================
// Chats & live messages → Firebase Realtime Database (RTDB)
// Order lookups, stats → Firestore

let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let customerName  = localStorage.getItem('janedore_chat_name') || '';
let chatOpen = false, chatUnsub = null, chatMode = null;
let currentUser = null;
let anonAuthInProgress = false;
let typingTimeout = null;
let rtdbConnected = true;
let authReady = false; // Track when auth state is confirmed

// RTDB reference (reuses existing Firebase instance from main site)
const rtdb = firebase.database();

// Monitor RTDB connection state
rtdb.ref('.info/connected').on('value', (snap) => {
  const wasConnected = rtdbConnected;
  rtdbConnected = snap.val() === true;
  if (!rtdbConnected && wasConnected) {
    console.warn('[Chat] RTDB disconnected');
  } else if (rtdbConnected && !wasConnected) {
    console.log('[Chat] RTDB reconnected');
    // Reload messages on reconnect
    if (chatOpen && chatMode === 'chat') {
      loadAllMessages();
    }
  }
});

// ==================== HELPERS ====================
function safeEl(id) { return document.getElementById(id) || null; }
function setDisplay(id, value) { const el = safeEl(id); if (el) el.style.display = value; }

function showChatFeedback(message, isError = false) {
  const messagesEl = safeEl('chat-messages');
  if (!messagesEl) return;
  
  const existingFeedback = messagesEl.querySelector('.chat-feedback');
  if (existingFeedback) existingFeedback.remove();
  
  const feedbackDiv = document.createElement('div');
  feedbackDiv.className = 'chat-feedback';
  feedbackDiv.style.cssText = `
    text-align: center;
    padding: 8px 12px;
    margin: 8px 0;
    font-size: 11px;
    border-radius: 4px;
    background: ${isError ? '#fff0f0' : '#f0fff0'};
    color: ${isError ? '#cc0000' : '#006600'};
    border: 1px solid ${isError ? '#ffcccc' : '#ccffcc'};
  `;
  feedbackDiv.textContent = message;
  messagesEl.appendChild(feedbackDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  setTimeout(() => {
    if (feedbackDiv.parentNode) feedbackDiv.remove();
  }, 5000);
}

// ==================== FIREBASE AUTH ====================
// Wait for auth to be ready before using it
firebase.auth().onAuthStateChanged((user) => {
  currentUser = user;
  authReady = true;
  console.log('[Chat] Auth state changed:', user ? `User: ${user.uid} (${user.isAnonymous ? 'anonymous' : 'email'})` : 'No user');
  
  if (user && user.email) {
    customerEmail = user.email.trim().toLowerCase();
    localStorage.setItem('janedore_chat_email', customerEmail);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    if (chatOpen) showOptionsScreen();
  }
});

async function waitForAuth(timeoutMs = 10000) {
  if (authReady && currentUser) return currentUser;
  
  const startTime = Date.now();
  while (!authReady && (Date.now() - startTime) < timeoutMs) {
    await new Promise(r => setTimeout(r, 100));
  }
  
  if (currentUser) return currentUser;
  
  // If no user, try anonymous auth
  return await ensureAnonymousAuth();
}

async function ensureAnonymousAuth() {
  // If we already have a user, return immediately
  if (currentUser) {
    console.log('[Chat] Already authenticated as:', currentUser.uid);
    return currentUser;
  }
  
  // If auth is in progress, wait for it
  if (anonAuthInProgress) {
    console.log('[Chat] Auth in progress, waiting...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (currentUser) {
        console.log('[Chat] Auth completed during wait');
        return currentUser;
      }
    }
    console.warn('[Chat] Auth wait timed out');
    return null;
  }
  
  anonAuthInProgress = true;
  console.log('[Chat] Starting anonymous auth...');
  
  try {
    const result = await firebase.auth().signInAnonymously();
    currentUser = result.user;
    console.log('[Chat] Anonymous auth successful:', currentUser.uid);
    return currentUser;
  } catch (error) {
    console.error('[Chat] Anonymous auth failed:', error.code, error.message);
    
    // If already signed in (race condition), get current user
    if (error.code === 'auth/already-signed-in' || error.code === 'auth/credential-already-in-use') {
      currentUser = firebase.auth().currentUser;
      if (currentUser) {
        console.log('[Chat] Already signed in, using existing user');
        return currentUser;
      }
    }
    
    return null;
  } finally {
    anonAuthInProgress = false;
  }
}

async function signInWithEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const actionCodeSettings = { url: window.location.href, handleCodeInApp: true };
    await firebase.auth().sendSignInLinkToEmail(normalizedEmail, actionCodeSettings);
    localStorage.setItem('janedore_chat_email_pending', normalizedEmail);
    return { success: true, method: 'emailLink' };
  } catch (error) {
    console.warn('Email link auth failed:', error.message);
    // Fall back to anonymous
    const user = await ensureAnonymousAuth();
    if (user) return { success: true, method: 'anonymous' };
    return { success: false, error: error.message };
  }
}

// ==================== SESSION MANAGEMENT ====================
function clearChatSession() {
  firebase.auth().signOut().catch(() => {});
  currentUser = null;
  authReady = false;
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  localStorage.removeItem('janedore_chat_session');
  localStorage.removeItem('janedore_chat_email_pending');
  customerEmail = '';
  customerName  = '';
  chatSessionId = 'chat-' + Date.now();
  chatMode = null;
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }

  const nameInput = safeEl('chat-name-input');
  if (nameInput) nameInput.value = '';
  const emailInput = safeEl('chat-email-input');
  if (emailInput) emailInput.value = '';

  showEmailScreen();
}

// ==================== SCREEN CONTROL ====================
function toggleChat() {
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) return;
  win.classList.toggle('open', chatOpen);
  if (chatOpen) {
    setDisplay('chat-unread-dot', 'none');
    customerEmail ? showOptionsScreen() : showEmailScreen();
  } else {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  }
}

function showEmailScreen() {
  setDisplay('chat-email-screen',   'flex');
  setDisplay('chat-options',        'none');
  setDisplay('chat-messages',       'none');
  setDisplay('chat-input-wrap',     'none');
  setDisplay('chat-customer-info',  'none');
  setDisplay('chat-typing-indicator','none');
  setDisplay('order-lookup',        'none');
}

function showOptionsScreen() {
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
  const nameInputEl  = safeEl('chat-name-input');
  const emailInputEl = safeEl('chat-email-input');
  const errorEl      = safeEl('chat-email-error');

  const rawName  = (nameInputEl?.value  || '').trim();
  const rawEmail = (emailInputEl?.value || '').trim();
  const email    = rawEmail.toLowerCase();

  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errorEl) errorEl.style.display = 'block';
    return;
  }
  if (errorEl) errorEl.style.display = 'none';

  customerName  = rawName;
  customerEmail = email;
  localStorage.setItem('janedore_chat_name',  customerName);
  localStorage.setItem('janedore_chat_email', email);
  chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
  localStorage.setItem('janedore_chat_session', chatSessionId);

  // Sign in anonymously first so chat works immediately
  await ensureAnonymousAuth();
  showOptionsScreen();
}

// ==================== START CHAT ====================
async function startChat() {
  // Ensure we have auth before starting
  const user = await waitForAuth();
  console.log('[Chat] Starting chat, auth:', user ? user.uid : 'none');
  
  setDisplay('chat-email-screen',    'none');
  setDisplay('chat-options',         'none');
  setDisplay('chat-messages',        'flex');
  setDisplay('chat-input-wrap',      'flex');
  setDisplay('chat-customer-info',   'flex');
  setDisplay('chat-typing-indicator','none');
  setDisplay('order-lookup',         'none');

  const nameEl  = safeEl('chat-customer-name');
  const emailEl = safeEl('chat-customer-email');
  if (nameEl)  nameEl.textContent  = customerName  || '';
  if (emailEl) emailEl.textContent = customerEmail || '';

  loadCustomerStats();
  chatMode = 'chat';
  
  // Load messages after auth is confirmed
  if (rtdbConnected) {
    loadAllMessages();
    listenChat();
  } else {
    const el = safeEl('chat-messages');
    if (el) el.innerHTML = '<div class="chat-welcome"><strong>Connecting...</strong>Please wait while we connect to the chat server.</div>';
    // Wait for reconnection
    const checkConnection = setInterval(() => {
      if (rtdbConnected) {
        clearInterval(checkConnection);
        loadAllMessages();
        listenChat();
      }
    }, 1000);
    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkConnection), 10000);
  }
  
  listenTypingIndicator();
  const inputEl = safeEl('chat-input');
  if (inputEl) inputEl.focus();
}

// ==================== CUSTOMER STATS (Firestore) ====================
async function loadCustomerStats() {
  const statsEl = safeEl('chat-customer-stats');
  if (!statsEl) return;
  statsEl.textContent = '';

  if (!customerEmail) {
    statsEl.textContent = 'Customer';
    return;
  }

  try {
    const db = firebase.firestore();
    const parts = [];
    
    // Try orders with auth
    try {
      await ensureAnonymousAuth();
      // Since orders require email match and anonymous users don't have email,
      // this will likely fail for anonymous users - that's expected
      const ordersSnap = await db.collection('orders')
        .where('customerEmail', '==', customerEmail)
        .limit(10).get();
      if (!ordersSnap.empty) parts.push(`${ordersSnap.size} order${ordersSnap.size > 1 ? 's' : ''}`);
    } catch (e) { 
      console.log('[Chat] Orders stats skipped (expected for anonymous):', e.code); 
    }
    
    // Reviews - anyone can read
    try {
      const reviewsSnap = await db.collection('reviews').where('email', '==', customerEmail).limit(10).get();
      if (!reviewsSnap.empty) parts.push(`${reviewsSnap.size} review${reviewsSnap.size > 1 ? 's' : ''}`);
    } catch (e) { console.log('[Chat] Reviews stats failed:', e.code); }
    
    // Newsletter - anyone can read
    try {
      const newsletterSnap = await db.collection('newsletter').where('email', '==', customerEmail).limit(1).get();
      if (!newsletterSnap.empty) parts.push('subscribed');
    } catch (e) { console.log('[Chat] Newsletter stats failed:', e.code); }
    
    statsEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Customer';
  } catch (e) {
    console.warn('[Chat] Stats error:', e.message);
    statsEl.textContent = 'Customer';
  }
}

// ==================== ORDER LOOKUP (Firestore) ====================
function showOrderLookup() {
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
  if (!resultEl) return;

  const rawOrderNumber = (inputEl?.value || '').trim().toUpperCase();

  if (!rawOrderNumber) {
    resultEl.innerHTML = '<p style="color:#888;">Please enter your order number.</p>';
    return;
  }
  if (!customerEmail) {
    resultEl.innerHTML = '<p style="color:#888;">No email on file. Please enter your email in the chat first.</p>';
    return;
  }

  resultEl.textContent = 'Searching…';
  console.log('[Chat] Looking up order:', rawOrderNumber, 'for email:', customerEmail);

  try {
    const db = firebase.firestore();
    
    // IMPORTANT: Your Firestore rules for orders require:
    // 1. request.auth != null (must be authenticated)
    // 2. request.auth.token.email != null (must have email - anonymous users DON'T have this)
    // 3. resource.data.customerEmail.lower() == request.auth.token.email.lower()
    
    // Check if user has email auth (not anonymous)
    const user = firebase.auth().currentUser;
    const hasEmailAuth = user && !user.isAnonymous && user.email;
    
    console.log('[Chat] Auth check - User:', user?.uid, 'Anonymous:', user?.isAnonymous, 'Email:', user?.email);
    
    if (!hasEmailAuth) {
      // Anonymous users cannot read orders due to email requirement in rules
      resultEl.innerHTML = `
        <p style="color:#cc0000;">⚠️ Email Verification Required</p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          To look up your order, we need to verify your email address. 
          This is a security measure to protect your order information.
        </p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          <strong>Option 1:</strong> Click "Check Your Email" below and we'll send you a sign-in link.<br>
          <strong>Option 2:</strong> Contact us directly via chat and we'll help you find your order.
        </p>
        <button onclick="requestEmailVerification()" style="
          margin-top: 12px;
          padding: 8px 16px;
          background: #111;
          border: 1px solid #0f0;
          color: #0f0;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          text-transform: uppercase;
        ">📧 Send Verification Email</button>
      `;
      return;
    }
    
    // User has email auth - proceed with order lookup
    const orders = [];

    // Try exact match
    console.log('[Chat] Trying exact match:', rawOrderNumber);
    const exactSnap = await db.collection('orders')
      .where('orderNumber', '==', rawOrderNumber)
      .where('customerEmail', '==', customerEmail)
      .limit(1).get();
    console.log('[Chat] Exact match results:', exactSnap.size);
    if (!exactSnap.empty) exactSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));

    // Try without dashes
    if (orders.length === 0) {
      const normalized = rawOrderNumber.replace(/-/g, '');
      if (normalized !== rawOrderNumber) {
        console.log('[Chat] Trying without dashes:', normalized);
        const normSnap = await db.collection('orders')
          .where('orderNumber', '==', normalized)
          .where('customerEmail', '==', customerEmail)
          .limit(1).get();
        console.log('[Chat] No-dash results:', normSnap.size);
        if (!normSnap.empty) normSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
      }
    }

    // Try with dash after ORD
    if (orders.length === 0 && !rawOrderNumber.includes('-') && rawOrderNumber.startsWith('ORD')) {
      const dashed = rawOrderNumber.replace(/^(ORD)(\d)/, '$1-$2');
      console.log('[Chat] Trying with dash:', dashed);
      const dashedSnap = await db.collection('orders')
        .where('orderNumber', '==', dashed)
        .where('customerEmail', '==', customerEmail)
        .limit(1).get();
      console.log('[Chat] Dashed results:', dashedSnap.size);
      if (!dashedSnap.empty) dashedSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
    }

    if (orders.length === 0) {
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and ensure you\'re using the email you ordered with. Try formats: ORD-12345 or ORD12345</p>';
      return;
    }

    const o = orders[0];
    const date      = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
    const itemCount = o.items ? o.items.length : (o.itemCount || 0);
    const total     = o.subtotal || o.total || 0;
    
    resultEl.innerHTML = `
      <p style="margin-bottom:12px;font-size:10px;color:#006600;">✅ Order found</p>
      <div style="padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.6;">
        <strong>Order #${o.orderNumber || o.id.substring(0, 12)}</strong><br>
        Status: ${o.status || 'pending'}<br>
        Items: ${itemCount} · Total: R${total}<br>
        Date: ${date}
      </div>`;
      
  } catch (e) {
    console.error('[Chat] Order lookup error:', e.code, e.message);
    if (e.code === 'permission-denied' || (e.message && e.message.includes('permission'))) {
      resultEl.innerHTML = `
        <p style="color:#cc0000;">⚠️ Access Denied</p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          Order information requires email verification for security.
        </p>
        <button onclick="requestEmailVerification()" style="
          margin-top: 12px;
          padding: 8px 16px;
          background: #111;
          border: 1px solid #0f0;
          color: #0f0;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          text-transform: uppercase;
        ">📧 Send Verification Email</button>
      `;
    } else {
      resultEl.innerHTML = `<p style="color:#cc0000;">⚠️ Error</p><p style="font-size:10px;color:#888;margin-top:8px;">${e.message}</p>`;
    }
  }
}

// New function to request email verification
async function requestEmailVerification() {
  if (!customerEmail) {
    const resultEl = safeEl('order-result');
    if (resultEl) resultEl.innerHTML = '<p style="color:#888;">Please enter your email in the chat first.</p>';
    return;
  }
  
  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '<p style="color:#888;">Sending verification email...</p>';
  
  try {
    const actionCodeSettings = { 
      url: window.location.href, 
      handleCodeInApp: true 
    };
    await firebase.auth().sendSignInLinkToEmail(customerEmail, actionCodeSettings);
    localStorage.setItem('janedore_chat_email_pending', customerEmail);
    
    if (resultEl) {
      resultEl.innerHTML = `
        <p style="color:#006600;">✅ Verification email sent!</p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          Check your inbox for <strong>${customerEmail}</strong>. 
          Click the link in the email, then return here to look up your order.
        </p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          After clicking the link, refresh this page and try your order lookup again.
        </p>
      `;
    }
  } catch (error) {
    console.error('[Chat] Email verification send failed:', error.message);
    if (resultEl) {
      resultEl.innerHTML = `
        <p style="color:#cc0000;">⚠️ Could not send verification email</p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          ${error.message}. Please try again or contact us via chat.
        </p>
      `;
    }
  }
}

function backToChatOptions() { showOptionsScreen(); }

// ==================== MESSAGES (RTDB) ====================
async function loadAllMessages() {
  const el = safeEl('chat-messages');
  if (!el) return;
  el.innerHTML = '';

  // Check auth first since RTDB rules require auth != null
  if (!currentUser && !rtdbConnected) {
    el.innerHTML = '<div class="chat-welcome"><strong>Connecting...</strong>Establishing secure connection.</div>';
    return;
  }

  try {
    const snapshot = await rtdb
      .ref('live_chat/' + chatSessionId + '/messages')
      .orderByChild('createdAt')
      .once('value');

    if (!snapshot.exists()) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
      return;
    }

    const messages = [];
    snapshot.forEach(child => messages.push({ _key: child.key, ...child.val() }));
    messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    messages.forEach(m => {
      if (m.type === 'auth') return;
      appendMessageEl(el, m);
    });

    el.scrollTop = el.scrollHeight;
  } catch (e) {
    console.error('[Chat] Error loading messages:', e.code, e.message);
    if (e.code === 'PERMISSION_DENIED') {
      el.innerHTML = '<div class="chat-welcome"><strong>Authentication required</strong>Please wait while we authenticate you...</div>';
      // Try to re-authenticate
      ensureAnonymousAuth().then(() => {
        if (chatOpen && chatMode === 'chat') loadAllMessages();
      });
    } else {
      el.innerHTML = '<div class="chat-welcome"><strong>Unable to load messages</strong>Retrying...</div>';
      // Retry after a delay
      setTimeout(() => {
        if (chatOpen && chatMode === 'chat') loadAllMessages();
      }, 2000);
    }
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

const renderedMessageIds = new Set();

function listenChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  renderedMessageIds.clear();

  const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
  const startTime   = Date.now();

  const handler = messagesRef
    .orderByChild('createdAt')
    .startAt(startTime)
    .on('child_added', (snap) => {
      const m     = snap.val();
      const docId = snap.key;
      if (!m || m.type === 'auth') return;
      if (renderedMessageIds.has(docId)) return;
      renderedMessageIds.add(docId);

      const el = safeEl('chat-messages');
      if (!el) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      appendMessageEl(el, m);
      if (atBottom) el.scrollTop = el.scrollHeight;

      const unreadDot = safeEl('chat-unread-dot');
      if (!chatOpen && m.sender === 'admin' && unreadDot) unreadDot.style.display = 'block';
    }, (error) => {
      console.error('[Chat] Listener error:', error.code, error.message);
      // Retry listener on permission error
      if (error.code === 'PERMISSION_DENIED') {
        ensureAnonymousAuth().then(() => {
          if (chatOpen && chatMode === 'chat') listenChat();
        });
      }
    });

  chatUnsub = () => messagesRef.off('child_added', handler);
}

// ==================== TYPING INDICATOR (RTDB) ====================
function handleCustomerTyping() {
  if (!chatSessionId || !rtdbConnected || !currentUser) return;
  
  clearTimeout(typingTimeout);
  
  rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(true).catch((e) => {
    console.log('[Chat] Typing indicator write skipped:', e.code);
  });
  
  typingTimeout = setTimeout(() => {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false).catch(() => {});
  }, 3000);
}

function listenTypingIndicator() {
  const typingRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping');
  typingRef.on('value', (snap) => {
    const isTyping = snap.val() === true;
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) indicator.style.display = isTyping ? 'block' : 'none';
  }, (error) => {
    console.log('[Chat] Typing indicator listen skipped:', error.code);
  });
}

// ==================== SEND MESSAGE (RTDB) ====================
async function sendChatMessage() {
  const input = safeEl('chat-input');
  const sendBtn = safeEl('chat-send-btn');
  
  if (!input) {
    console.error('[Chat] Input element not found');
    return;
  }
  
  const text = input.value.trim();
  if (!text) return;

  // Disable send button while sending
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
  }
  
  console.log('[Chat] Sending message...');
  
  try {
    // Ensure authenticated - RTDB rules require auth != null
    const user = await waitForAuth();
    if (!user) {
      console.error('[Chat] Cannot send - not authenticated');
      showChatFeedback('⚠️ Cannot send message - not authenticated. Please refresh the page.', true);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
      }
      return;
    }
    
    console.log('[Chat] Authenticated as:', user.uid);
    
    const messageData = {
      sessionId:     chatSessionId,
      customerEmail: customerEmail || '',
      customerName:  customerName  || '',
      text:          text,
      sender:        'customer',
      createdAt:     firebase.database.ServerValue.TIMESTAMP,
      read:          false,
      userId:        user.uid
    };

    // Push message to RTDB
    const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
    const newMessageRef = await messagesRef.push(messageData);
    
    console.log('[Chat] Message sent, key:', newMessageRef.key);

    // Update session meta (non-critical)
    rtdb.ref('live_chat/' + chatSessionId + '/meta').update({
      customerEmail:   customerEmail || '',
      customerName:    customerName  || '',
      lastMessage:     text,
      lastMessageAt:   firebase.database.ServerValue.TIMESTAMP,
      userId:          user.uid,
      customerTyping:  false
    }).catch(err => {
      console.log('[Chat] Meta update non-critical:', err.code);
    });

    // Clear input
    input.value = '';
    clearTimeout(typingTimeout);
    
    // Show success
    showChatFeedback('✅ Message sent', false);
    
  } catch (e) {
    console.error('[Chat] Send failed:', e.code, e.message);
    
    let errorMsg = '⚠️ Failed to send. ';
    
    if (e.code === 'PERMISSION_DENIED') {
      errorMsg += 'Permission denied. Trying to re-authenticate...';
      // Try re-auth
      currentUser = null;
      const user = await ensureAnonymousAuth();
      if (user) {
        errorMsg = '⚠️ Re-authenticated. Please try sending again.';
        // Restore the message
        input.value = text;
      }
    } else if (e.message && e.message.includes('disconnected')) {
      errorMsg += 'Database disconnected. Please wait and try again.';
    } else if (e.message && e.message.includes('uninitialized')) {
      errorMsg += 'Firebase not ready. Please refresh the page.';
    } else {
      errorMsg += e.message;
    }
    
    showChatFeedback(errorMsg, true);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.opacity = '1';
    }
    if (input) input.focus();
  }
}

// ==================== EMAIL LINK SIGN-IN ====================
async function handleEmailLinkSignIn() {
  if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('janedore_chat_email_pending');
    if (!email) {
      email = customerEmail || window.prompt('Please enter your email for confirmation');
    }
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      try {
        const result = await firebase.auth().signInWithEmailLink(normalizedEmail, window.location.href);
        currentUser = result.user;
        localStorage.removeItem('janedore_chat_email_pending');
        customerEmail = normalizedEmail;
        localStorage.setItem('janedore_chat_email', normalizedEmail);
        chatSessionId = 'chat-' + normalizedEmail.replace(/[^a-zA-Z0-9]/g, '-');
        localStorage.setItem('janedore_chat_session', chatSessionId);
        window.history.replaceState({}, document.title, window.location.pathname);
        console.log('[Chat] Email link sign-in successful:', normalizedEmail);
      } catch (error) {
        console.error('[Chat] Email link sign-in failed:', error.code, error.message);
      }
    }
  }
}

// ==================== ENTER KEY HANDLER ====================
function handleChatKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Chat] DOM ready, initializing...');
  
  handleEmailLinkSignIn();
  
  // Pre-fill name/email if returning user
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  
  // Attach enter key handler
  const chatInput = safeEl('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', handleChatKeyPress);
  }
  
  // Attach click handler to send button
  const sendBtn = safeEl('chat-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', sendChatMessage);
  }
  
  // Initialize anonymous auth proactively
  ensureAnonymousAuth().then(user => {
    console.log('[Chat] Proactive auth result:', user ? 'authenticated' : 'failed');
  });
  
  console.log('[Chat] Initialization complete, session:', chatSessionId);
});
