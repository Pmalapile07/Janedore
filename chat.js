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
let rtdbConnected = true; // Track RTDB connection state

// RTDB reference (reuses existing Firebase instance from main site)
const rtdb = firebase.database();

// Monitor RTDB connection state to prevent disconnect/reconnect loops
rtdb.ref('.info/connected').on('value', (snap) => {
  rtdbConnected = snap.val() === true;
  if (!rtdbConnected) {
    console.warn('[Chat] RTDB disconnected - messages will be queued');
  }
});

// ==================== HELPERS ====================
function safeEl(id) { return document.getElementById(id) || null; }
function setDisplay(id, value) { const el = safeEl(id); if (el) el.style.display = value; }

// Show feedback message in chat window
function showChatFeedback(message, isError = false) {
  const messagesEl = safeEl('chat-messages');
  if (!messagesEl) return;
  
  // Remove any existing feedback
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
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (feedbackDiv.parentNode) feedbackDiv.remove();
  }, 5000);
}

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
    // Wait for existing auth attempt to complete
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (currentUser) return currentUser;
      if (!anonAuthInProgress) break;
    }
    return currentUser;
  }
  anonAuthInProgress = true;
  try {
    const result = await firebase.auth().signInAnonymously();
    currentUser = result.user;
    console.log('[Chat] Anonymous auth successful:', currentUser.uid);
    return currentUser;
  } catch (error) {
    console.error('[Chat] Anonymous auth failed:', error.message);
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
    const db = firebase.firestore();
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
  console.log('[Chat] Looking up order:', rawOrderNumber, 'for email:', customerEmail);

  try {
    // Ensure we're authenticated before querying Firestore
    const user = await ensureAnonymousAuth();
    console.log('[Chat] Auth state for order lookup:', user ? 'authenticated' : 'anonymous failed');
    
    const db = firebase.firestore();
    const orders = [];

    // Try exact match first
    console.log('[Chat] Trying exact match for:', rawOrderNumber);
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

    // Try adding dash after ORD
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

    // Fallback: search by customer email only (if orderNumber field doesn't exist)
    if (orders.length === 0) {
      console.log('[Chat] Trying email-only search as fallback');
      const emailSnap = await db.collection('orders')
        .where('customerEmail', '==', customerEmail)
        .limit(5).get();
      console.log('[Chat] Email-only results:', emailSnap.size);
      if (!emailSnap.empty) {
        emailSnap.docs.forEach(d => {
          const data = d.data();
          // Check if any order number field matches
          const orderId = data.orderNumber || data.orderId || data.id || d.id;
          if (orderId && orderId.toString().toUpperCase().includes(rawOrderNumber.replace(/-/g, ''))) {
            orders.push({ id: d.id, ...data });
          }
        });
      }
    }

    if (orders.length === 0) {
      console.log('[Chat] No orders found for', rawOrderNumber);
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and ensure you\'re using the email you ordered with. Try formats: ORD-12345 or ORD12345</p>';
      return;
    }

    console.log('[Chat] Order found:', orders[0].orderNumber || orders[0].id);
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
      resultEl.innerHTML = '<p style="color:#cc0000;">⚠️ Permission denied</p><p style="font-size:10px;color:#888;margin-top:8px;">Firestore security rules may require authentication. Please try again or contact support.</p>';
    } else if (e.code === 'unavailable' || e.message.includes('network')) {
      resultEl.innerHTML = '<p style="color:#cc0000;">⚠️ Network error</p><p style="font-size:10px;color:#888;margin-top:8px;">Could not connect to database. Check your internet connection and try again.</p>';
    } else {
      resultEl.innerHTML = `<p style="color:#cc0000;">⚠️ Error looking up order</p><p style="font-size:10px;color:#888;margin-top:8px;">${e.message}</p>`;
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
    console.error('[Chat] Error loading messages:', e.message);
    el.innerHTML = '<div class="chat-welcome"><strong>Unable to load messages</strong>Please check your connection and try again.</div>';
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
      console.error('[Chat] Listener error:', error.message);
    });

  chatUnsub = () => messagesRef.off('child_added', handler);
}

// ==================== TYPING INDICATOR (RTDB) ====================
function handleCustomerTyping() {
  if (!chatSessionId || !rtdbConnected) return;
  
  // Debounce typing updates to reduce RTDB writes
  clearTimeout(typingTimeout);
  
  rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(true).catch(() => {});
  
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
    console.warn('[Chat] Typing indicator error:', error.message);
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
  if (!text) {
    console.log('[Chat] Empty message, not sending');
    return;
  }

  // Disable send button while sending
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
  }
  
  console.log('[Chat] Sending message:', text.substring(0, 50));
  
  try {
    // Ensure authenticated
    const user = await ensureAnonymousAuth();
    if (!user) {
      console.error('[Chat] Cannot send - not authenticated');
      showChatFeedback('⚠️ Cannot send message - authentication failed. Please refresh and try again.', true);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
      }
      return;
    }
    
    // Check RTDB connection
    if (!rtdbConnected) {
      console.warn('[Chat] RTDB disconnected, attempting to send anyway...');
    }
    
    const userId = user ? user.uid : 'anonymous';
    console.log('[Chat] Sending as user:', userId);

    const messageData = {
      sessionId:     chatSessionId,
      customerEmail: customerEmail || '',
      customerName:  customerName  || '',
      text:          text,
      sender:        'customer',
      createdAt:     firebase.database.ServerValue.TIMESTAMP,
      read:          false,
      userId:        userId
    };

    // Push message to RTDB
    const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
    const newMessageRef = await messagesRef.push(messageData);
    
    console.log('[Chat] Message sent successfully, key:', newMessageRef.key);

    // Update session meta
    await rtdb.ref('live_chat/' + chatSessionId + '/meta').update({
      customerEmail:   customerEmail || '',
      customerName:    customerName  || '',
      lastMessage:     text,
      lastMessageAt:   firebase.database.ServerValue.TIMESTAMP,
      userId:          userId,
      customerTyping:  false
    }).catch(err => {
      console.warn('[Chat] Meta update failed (non-critical):', err.message);
    });

    // Clear input
    input.value = '';
    clearTimeout(typingTimeout);
    
    // Show success feedback
    showChatFeedback('✅ Message sent', false);
    
    console.log('[Chat] Message send complete');
    
  } catch (e) {
    console.error('[Chat] Send failed:', e.code, e.message);
    
    let errorMsg = '⚠️ Failed to send message. ';
    
    if (e.code === 'PERMISSION_DENIED' || e.message.includes('permission')) {
      errorMsg += 'Permission denied. Check RTDB rules.';
    } else if (e.code === 'NETWORK_ERROR' || e.message.includes('network')) {
      errorMsg += 'Network error. Check your connection.';
    } else if (e.message.includes('disconnected')) {
      errorMsg += 'Database disconnected. Retrying...';
      // Retry once after a delay
      setTimeout(() => {
        input.value = text; // Restore the message
        console.log('[Chat] Retrying send...');
      }, 2000);
    } else {
      errorMsg += e.message;
    }
    
    showChatFeedback(errorMsg, true);
  } finally {
    // Re-enable send button
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.opacity = '1';
    }
    // Refocus input
    if (input) input.focus();
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

// ==================== ENTER KEY HANDLER ====================
function handleChatKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Chat] Initializing chat widget');
  
  handleEmailLinkSignIn();
  
  // Pre-fill name/email if returning user
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  
  // Attach enter key handler to chat input
  const chatInput = safeEl('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', handleChatKeyPress);
  }
  
  // Attach click handler to send button if it exists
  const sendBtn = safeEl('chat-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', sendChatMessage);
  }
  
  console.log('[Chat] Widget initialized, session:', chatSessionId);
});
