// ==================== CHAT LOGIC ====================
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
  };
  
  window.testSendMessage = function(text) {
    const input = safeEl('chat-input');
    if (input) {
      input.value = text || 'Test message ' + Date.now();
      sendChatMessage();
    }
  };
  
  window.testOrderLookup = function(orderNum) {
    const input = safeEl('order-lookup-input');
    if (input) {
      input.value = orderNum || 'ORD-12345';
      lookupOrder();
    }
  };
  
  window.resetChat = function() {
    clearChatSession();
  };
  
  window.debugLog('Debug panel ready', 'success');
})();

// ==================== FIREBASE (uses your existing initialized app) ====================
const db = firebase.firestore();
const rtdb = firebase.database();

// ==================== STATE ====================
let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase().trim();
let customerName  = localStorage.getItem('janedore_chat_name') || '';
let chatOpen = false, chatUnsub = null, chatMode = null;
let currentUser = null;
let anonAuthInProgress = false;
let typingTimeout = null;
let authReady = false;

const renderedMessageIds = new Set();

// ==================== HELPERS ====================
function safeEl(id) { return document.getElementById(id) || null; }
function setDisplay(id, value) { const el = safeEl(id); if (el) el.style.display = value; }

// ==================== FIREBASE AUTH ====================
firebase.auth().onAuthStateChanged((user) => {
  currentUser = user;
  authReady = true;
  window.debugLog('Auth state: ' + (user ? user.uid : 'null'), 'firebase');
  
  if (user && user.email) {
    customerEmail = user.email.trim().toLowerCase();
    localStorage.setItem('janedore_chat_email', customerEmail);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    if (chatOpen) showOptionsScreen();
  }
});

async function ensureAnonymousAuth() {
  if (currentUser) return currentUser;
  if (anonAuthInProgress) {
    await new Promise(r => setTimeout(r, 600));
    return currentUser;
  }
  anonAuthInProgress = true;
  try {
    const result = await firebase.auth().signInAnonymously();
    currentUser = result.user;
    window.debugLog('Anonymous auth success', 'success');
    return currentUser;
  } catch (error) {
    window.debugLog('Anonymous auth failed: ' + error.message, 'error');
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
    window.debugLog('Email link failed: ' + error.message, 'warn');
    try {
      const user = await ensureAnonymousAuth();
      if (user) return { success: true, method: 'anonymous' };
    } catch (fallbackError) {
      window.debugLog('Anonymous fallback failed: ' + fallbackError.message, 'error');
    }
    return { success: false, error: error.message };
  }
}

// ==================== SESSION MANAGEMENT ====================
function clearChatSession() {
  firebase.auth().signOut().catch(() => {});
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
  chatMode = null;
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }

  const nameInput = safeEl('chat-name-input');
  if (nameInput) nameInput.value = '';
  const emailInput = safeEl('chat-email-input');
  if (emailInput) emailInput.value = '';

  showEmailScreen();
  window.debugLog('Chat session cleared', 'success');
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

  const authResult = await signInWithEmail(email);

  if (authResult.success && authResult.method === 'emailLink') {
    const emailScreen = safeEl('chat-email-screen');
    if (emailScreen) {
      emailScreen.innerHTML = `
        <div class="chat-email-title">Check Your Email</div>
        <div class="chat-email-subtitle">We sent a sign-in link to ${email}. Click the link to continue, or proceed below.</div>
        <button class="chat-email-btn" onclick="showOptionsScreen()">Continue to Chat</button>
      `;
    }
  } else {
    showOptionsScreen();
  }
}

// ==================== START CHAT ====================
function startChat() {
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
  loadAllMessages();
  listenChat();
  listenTypingIndicator();
  
  const inputEl = safeEl('chat-input');
  if (inputEl) {
    inputEl.focus();
    inputEl.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    };
  }
}

// ==================== CUSTOMER STATS (Firestore) ====================
async function loadCustomerStats() {
  const statsEl = safeEl('chat-customer-stats');
  if (!statsEl) return;
  statsEl.textContent = '';

  try {
    const parts = [];
    try {
      const ordersSnap = await db.collection('orders').where('customerEmail', '==', customerEmail).limit(10).get();
      if (!ordersSnap.empty) parts.push(`${ordersSnap.size} order${ordersSnap.size > 1 ? 's' : ''}`);
    } catch (e) { console.warn('Orders stats failed:', e.message); }
    try {
      const reviewsSnap = await db.collection('reviews').where('email', '==', customerEmail).limit(10).get();
      if (!reviewsSnap.empty) parts.push(`${reviewsSnap.size} review${reviewsSnap.size > 1 ? 's' : ''}`);
    } catch (e) { console.warn('Reviews stats failed:', e.message); }
    try {
      const newsletterSnap = await db.collection('newsletter').where('email', '==', customerEmail).limit(1).get();
      if (!newsletterSnap.empty) parts.push('subscribed');
    } catch (e) { console.warn('Newsletter stats failed:', e.message); }
    statsEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Customer';
  } catch (e) {
    console.warn('Stats error:', e.message);
    if (statsEl) statsEl.textContent = 'Customer';
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
    resultEl.innerHTML = '<p style="color:#888;">No email on file. Please restart the chat.</p>';
    return;
  }

  resultEl.textContent = 'Searching…';

  try {
    await ensureAnonymousAuth();
    const orders = [];

    // Primary: exact match
    const exactSnap = await db.collection('orders')
      .where('orderNumber', '==', rawOrderNumber)
      .where('customerEmail', '==', customerEmail)
      .limit(1).get();
    if (!exactSnap.empty) exactSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));

    // Secondary: strip dashes
    if (orders.length === 0) {
      const normalized = rawOrderNumber.replace(/-/g, '');
      if (normalized !== rawOrderNumber) {
        const normSnap = await db.collection('orders')
          .where('orderNumber', '==', normalized)
          .where('customerEmail', '==', customerEmail)
          .limit(1).get();
        if (!normSnap.empty) normSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
      }
    }

    // Tertiary: add dash after ORD
    if (orders.length === 0 && !rawOrderNumber.includes('-') && rawOrderNumber.startsWith('ORD')) {
      const dashed = rawOrderNumber.replace(/^(ORD)(\d)/, '$1-$2');
      const dashedSnap = await db.collection('orders')
        .where('orderNumber', '==', dashed)
        .where('customerEmail', '==', customerEmail)
        .limit(1).get();
      if (!dashedSnap.empty) dashedSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
    }

    if (orders.length === 0) {
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and ensure you\'re using the email you ordered with.</p>';
      window.debugLog('Order not found: ' + rawOrderNumber, 'warn');
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
    window.debugLog('Order found: ' + o.orderNumber, 'success');
  } catch (e) {
    window.debugLog('Order lookup error: ' + e.message, 'error');
    if (e.message && e.message.includes('permission')) {
      resultEl.innerHTML = '<p style="color:#888;">Authentication required.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Please contact us via chat for order support.</p>';
    } else {
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and try again.</p>';
    }
  }
}

function backToChatOptions() { showOptionsScreen(); }

// ==================== MESSAGES (RTDB) ====================
async function loadAllMessages() {
  const el = safeEl('chat-messages');
  if (!el) return;
  el.innerHTML = '';
  renderedMessageIds.clear();

  try {
    const snapshot = await rtdb
      .ref('chats/' + chatSessionId + '/messages')
      .orderByChild('timestamp')
      .once('value');

    if (!snapshot.exists()) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
      return;
    }

    const messages = [];
    snapshot.forEach(child => messages.push({ _key: child.key, ...child.val() }));
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    messages.forEach(m => {
      if (m.type === 'auth') return;
      appendMessageEl(el, m);
    });

    el.scrollTop = el.scrollHeight;
    window.debugLog('Loaded ' + messages.length + ' messages', 'success');
  } catch (e) {
    window.debugLog('Error loading messages: ' + e.message, 'error');
  }
}

function appendMessageEl(container, m) {
  const t = m.timestamp
    ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (m.sender || 'customer');
  div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
  container.appendChild(div);
}

function listenChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }

  const messagesRef = rtdb.ref('chats/' + chatSessionId + '/messages');
  const startTime   = Date.now();

  const handler = messagesRef
    .orderByChild('timestamp')
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
    });

  chatUnsub = () => messagesRef.off('child_added', handler);
  window.debugLog('Chat listener active', 'success');
}

// ==================== TYPING INDICATOR (RTDB) ====================
function handleCustomerTyping() {
  if (!chatSessionId) return;
  rtdb.ref('chats/' + chatSessionId + '/typing/customer').set(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    rtdb.ref('chats/' + chatSessionId + '/typing/customer').set(false);
  }, 2000);
}

function listenTypingIndicator() {
  const typingRef = rtdb.ref('chats/' + chatSessionId + '/typing/admin');
  typingRef.on('value', (snap) => {
    const isTyping = snap.val() === true;
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) indicator.style.display = isTyping ? 'block' : 'none';
  });
}

// ==================== SEND MESSAGE (RTDB) ====================
async function sendChatMessage() {
  const input = safeEl('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  try {
    await ensureAnonymousAuth();

    const messagesRef = rtdb.ref('chats/' + chatSessionId + '/messages');
    await messagesRef.push({
      sessionId:     chatSessionId,
      customerEmail: customerEmail || '',
      customerName:  customerName  || '',
      text:          text,
      sender:        'customer',
      timestamp:     firebase.database.ServerValue.TIMESTAMP,
      read:          false,
      userId:        currentUser ? currentUser.uid : 'anonymous'
    });

    input.value = '';
    rtdb.ref('chats/' + chatSessionId + '/typing/customer').set(false);
    clearTimeout(typingTimeout);
    window.debugLog('Message sent', 'success');
  } catch (e) {
    window.debugLog('Send error: ' + e.message, 'error');
  }
}

// ==================== EMAIL LINK SIGN-IN ====================
async function handleEmailLinkSignIn() {
  if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('janedore_chat_email_pending');
    if (!email) email = window.prompt('Please enter your email for confirmation');
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      try {
        await firebase.auth().signInWithEmailLink(normalizedEmail, window.location.href);
        localStorage.removeItem('janedore_chat_email_pending');
        customerEmail = normalizedEmail;
        localStorage.setItem('janedore_chat_email', normalizedEmail);
        chatSessionId = 'chat-' + normalizedEmail.replace(/[^a-zA-Z0-9]/g, '-');
        localStorage.setItem('janedore_chat_session', chatSessionId);
        window.history.replaceState({}, document.title, window.location.pathname);
        window.debugLog('Email link sign-in success', 'success');
      } catch (error) {
        window.debugLog('Email link sign-in failed: ' + error.message, 'error');
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  handleEmailLinkSignIn();
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  window.debugLog('Chat ready', 'success');
});
