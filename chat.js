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

// RTDB reference
const rtdb = firebase.database();
// Firestore reference (WAS MISSING - caused ReferenceError: db is not defined)
const db = firebase.firestore();

// ==================== HELPERS ====================
function safeEl(id) { return document.getElementById(id) || null; }
function setDisplay(id, value) { const el = safeEl(id); if (el) el.style.display = value; }

// ==================== FIREBASE AUTH ====================
firebase.auth().onAuthStateChanged((user) => {
  currentUser = user;
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
    return currentUser;
  } catch (error) {
    console.warn('Anonymous auth failed:', error.message);
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
    try {
      const user = await ensureAnonymousAuth();
      if (user) return { success: true, method: 'anonymous' };
    } catch (fallbackError) {
      console.warn('Anonymous fallback failed:', fallbackError.message);
    }
    return { success: false, error: error.message };
  }
}

// ==================== SESSION MANAGEMENT ====================
function clearChatSession() {
  firebase.auth().signOut().catch(() => {});
  currentUser = null;
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  localStorage.removeItem('janedore_chat_session');
  localStorage.removeItem('janedore_chat_email_pending');
  customerEmail = '';
  customerName  = '';
  chatSessionId = 'chat-' + Date.now();
  chatMode = null;
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }

  // Clear the name input so it's fresh
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

  // Persist name + email
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

  // Populate the info bar with name + email
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
  if (inputEl) inputEl.focus();
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
  } catch (e) {
    console.warn('Order lookup error:', e.message);
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
    console.warn('Error loading messages:', e);
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
    });

  chatUnsub = () => messagesRef.off('child_added', handler);
}

// ==================== TYPING INDICATOR (RTDB) ====================
function handleCustomerTyping() {
  // Write customer typing state to RTDB so admin panel can see it (optional)
  if (!chatSessionId) return;
  rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false);
  }, 2000);
}

function listenTypingIndicator() {
  // Listen for admin typing state and show indicator to customer
  const typingRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping');
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

    const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
    await messagesRef.push({
      sessionId:     chatSessionId,
      customerEmail: customerEmail || '',
      customerName:  customerName  || '',
      text:          text,
      sender:        'customer',
      createdAt:     Date.now(),
      read:          false,
      userId:        currentUser ? currentUser.uid : 'anonymous'
    });

    // Update session meta for admin panel listing
    await rtdb.ref('live_chat/' + chatSessionId + '/meta').update({
      customerEmail:   customerEmail || '',
      customerName:    customerName  || '',
      lastMessage:     text,
      lastMessageAt:   Date.now(),
      userId:          currentUser ? currentUser.uid : 'anonymous',
      customerTyping:  false
    });

    input.value = '';
    // Clear typing state immediately after send
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false);
    clearTimeout(typingTimeout);
  } catch (e) {
    console.warn('Chat send error:', e);
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
      } catch (error) {
        console.warn('Email link sign-in failed:', error.message);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  handleEmailLinkSignIn();
  // Pre-fill name/email if returning user
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
});
