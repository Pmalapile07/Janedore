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
let authReady = false;

// RTDB reference (reuses existing Firebase instance from main site)
const rtdb = firebase.database();

// Monitor RTDB connection state
rtdb.ref('.info/connected').on('value', (snap) => {
  rtdbConnected = snap.val() === true;
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
// Start anonymous auth immediately, don't wait for it
ensureAnonymousAuth();

firebase.auth().onAuthStateChanged((user) => {
  currentUser = user;
  authReady = true;
  console.log('[Chat] Auth state:', user ? (user.isAnonymous ? 'anonymous' : user.email) : 'none');
  
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
    // Wait briefly for in-progress auth
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (currentUser) return currentUser;
    }
    return currentUser;
  }
  
  anonAuthInProgress = true;
  
  try {
    const result = await firebase.auth().signInAnonymously();
    currentUser = result.user;
    console.log('[Chat] Anonymous auth done:', currentUser.uid);
    return currentUser;
  } catch (error) {
    // If already signed in, get current user
    if (error.code === 'auth/already-signed-in') {
      currentUser = firebase.auth().currentUser;
      if (currentUser) return currentUser;
    }
    console.error('[Chat] Anonymous auth failed:', error.code);
    return null;
  } finally {
    anonAuthInProgress = false;
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
    // Show immediately - don't wait for anything
    if (customerEmail) {
      showOptionsScreen();
    } else {
      showEmailScreen();
    }
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

  showOptionsScreen();
}

// ==================== START CHAT ====================
function startChat() {
  // Show chat UI immediately
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

  chatMode = 'chat';
  
  // Load customer stats (non-blocking)
  loadCustomerStats();
  
  // Load messages and start listening
  loadAllMessages();
  listenChat();
  listenTypingIndicator();
  
  const inputEl = safeEl('chat-input');
  if (inputEl) inputEl.focus();
  
  // Auth happens in background, doesn't block UI
  ensureAnonymousAuth();
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
    
    // Reviews - anyone can read (public)
    try {
      const reviewsSnap = await db.collection('reviews').where('email', '==', customerEmail).limit(10).get();
      if (!reviewsSnap.empty) parts.push(`${reviewsSnap.size} review${reviewsSnap.size > 1 ? 's' : ''}`);
    } catch (e) { /* reviews are public so this should work */ }
    
    // Newsletter - anyone can read (public)
    try {
      const newsletterSnap = await db.collection('newsletter').where('email', '==', customerEmail).limit(1).get();
      if (!newsletterSnap.empty) parts.push('subscribed');
    } catch (e) { /* newsletter is public */ }
    
    // Orders - might fail for anonymous, that's ok
    try {
      const ordersSnap = await db.collection('orders').where('customerEmail', '==', customerEmail).limit(10).get();
      if (!ordersSnap.empty) parts.push(`${ordersSnap.size} order${ordersSnap.size > 1 ? 's' : ''}`);
    } catch (e) { /* orders need email auth, skip silently */ }
    
    statsEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Customer';
  } catch (e) {
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
    resultEl.innerHTML = '<p style="color:#888;">Please enter your email in the chat first to look up orders.</p>';
    return;
  }

  resultEl.textContent = 'Searching…';

  try {
    const db = firebase.firestore();
    
    // Strategy: Try to read orders collection.
    // If the user has email auth, the rules allow it.
    // If anonymous, the rules deny it (because request.auth.token.email is null).
    // In that case, we fall back to writing a lookup request that an admin can see.
    
    let orders = [];
    let permissionDenied = false;
    
    try {
      // Try exact match
      const exactSnap = await db.collection('orders')
        .where('orderNumber', '==', rawOrderNumber)
        .where('customerEmail', '==', customerEmail)
        .limit(1).get();
      if (!exactSnap.empty) exactSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));

      // Try without dashes
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

      // Try with dash after ORD
      if (orders.length === 0 && !rawOrderNumber.includes('-') && rawOrderNumber.startsWith('ORD')) {
        const dashed = rawOrderNumber.replace(/^(ORD)(\d)/, '$1-$2');
        const dashedSnap = await db.collection('orders')
          .where('orderNumber', '==', dashed)
          .where('customerEmail', '==', customerEmail)
          .limit(1).get();
        if (!dashedSnap.empty) dashedSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
      }
    } catch (e) {
      if (e.code === 'permission-denied') {
        permissionDenied = true;
      } else {
        throw e;
      }
    }
    
    if (permissionDenied) {
      // Anonymous user - can't read orders directly due to Firestore rules
      // Write a lookup request to a collection that anonymous CAN write to
      // Then check if an admin already processed it
      
      const lookupRef = db.collection('order_lookups').doc();
      await lookupRef.set({
        orderNumber: rawOrderNumber,
        customerEmail: customerEmail,
        customerName: customerName || '',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        sessionId: chatSessionId
      });
      
      // Listen for the response
      resultEl.innerHTML = `
        <p style="color:#006600;">🔍 Looking up your order...</p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          Order #${rawOrderNumber} for ${customerEmail}
        </p>
        <p style="font-size:10px;color:#888;margin-top:8px;">
          This may take a moment. If you don't see results, our team will assist you shortly via chat.
        </p>
      `;
      
      // Poll for the result
      let attempts = 0;
      const checkResult = setInterval(async () => {
        attempts++;
        try {
          const doc = await lookupRef.get();
          if (doc.exists && doc.data().status === 'completed') {
            clearInterval(checkResult);
            const data = doc.data();
            if (data.orderData) {
              const o = data.orderData;
              const date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
              const itemCount = o.items ? o.items.length : (o.itemCount || 0);
              const total = o.subtotal || o.total || 0;
              resultEl.innerHTML = `
                <p style="margin-bottom:12px;font-size:10px;color:#006600;">✅ Order found</p>
                <div style="padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.6;">
                  <strong>Order #${o.orderNumber || o.id?.substring(0, 12)}</strong><br>
                  Status: ${o.status || 'pending'}<br>
                  Items: ${itemCount} · Total: R${total}<br>
                  Date: ${date}
                </div>`;
            } else {
              resultEl.innerHTML = '<p style="color:#888;">No order found matching those details.</p>';
            }
            // Clean up
            lookupRef.delete().catch(() => {});
          }
        } catch (e) {
          clearInterval(checkResult);
        }
        if (attempts > 30) {
          clearInterval(checkResult);
          resultEl.innerHTML = `
            <p style="color:#888;">Still looking...</p>
            <p style="font-size:10px;color:#aaa;margin-top:8px;">
              Our team will assist you shortly. You can also ask in the chat.
            </p>
          `;
        }
      }, 2000);
      
      return;
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
    resultEl.innerHTML = `<p style="color:#cc0000;">⚠️ Error</p><p style="font-size:10px;color:#888;margin-top:8px;">${e.message}</p>`;
  }
}

// IMPORTANT: Add this collection to your Firestore rules so anonymous users can write lookup requests:
// match /order_lookups/{doc} {
//   allow read: if request.auth != null;
//   allow write: if true;
// }

function backToChatOptions() { showOptionsScreen(); }

// ==================== MESSAGES (RTDB) ====================
async function loadAllMessages() {
  const el = safeEl('chat-messages');
  if (!el) return;
  el.innerHTML = '<div class="chat-welcome"><strong>Loading messages...</strong></div>';

  // Start auth if not ready, but don't block
  ensureAnonymousAuth();

  try {
    const snapshot = await rtdb
      .ref('live_chat/' + chatSessionId + '/messages')
      .orderByChild('createdAt')
      .once('value');

    if (!snapshot.exists()) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
      return;
    }

    el.innerHTML = '';
    const messages = [];
    snapshot.forEach(child => messages.push({ _key: child.key, ...child.val() }));
    messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    messages.forEach(m => {
      if (m.type === 'auth') return;
      appendMessageEl(el, m);
    });

    el.scrollTop = el.scrollHeight;
  } catch (e) {
    console.error('[Chat] Load messages error:', e.code, e.message);
    if (e.code === 'PERMISSION_DENIED') {
      el.innerHTML = '<div class="chat-welcome"><strong>Authenticating...</strong>Please wait a moment.</div>';
      // Auth will complete and then messages will load via listener
      ensureAnonymousAuth().then(() => {
        setTimeout(() => {
          if (chatOpen && chatMode === 'chat') loadAllMessages();
        }, 1000);
      });
    } else {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
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
      console.error('[Chat] Listener error:', error.code);
      // Retry on permission error after auth
      if (error.code === 'PERMISSION_DENIED') {
        ensureAnonymousAuth().then(() => {
          setTimeout(() => {
            if (chatOpen && chatMode === 'chat') listenChat();
          }, 1500);
        });
      }
    });

  chatUnsub = () => messagesRef.off('child_added', handler);
}

// ==================== TYPING INDICATOR (RTDB) ====================
function handleCustomerTyping() {
  if (!chatSessionId || !rtdbConnected) return;
  
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
  }, () => {});
}

// ==================== SEND MESSAGE (RTDB) ====================
async function sendChatMessage() {
  const input = safeEl('chat-input');
  const sendBtn = safeEl('chat-send-btn');
  
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
  }
  
  try {
    // Make sure we're authenticated for RTDB write (rules require auth != null)
    let user = currentUser;
    if (!user) {
      user = await ensureAnonymousAuth();
    }
    
    if (!user) {
      showChatFeedback('⚠️ Connecting... Please try again in a moment.', true);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
      }
      return;
    }
    
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

    const messagesRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
    await messagesRef.push(messageData);

    // Update session meta (non-critical, catch errors silently)
    rtdb.ref('live_chat/' + chatSessionId + '/meta').update({
      customerEmail:   customerEmail || '',
      customerName:    customerName  || '',
      lastMessage:     text,
      lastMessageAt:   firebase.database.ServerValue.TIMESTAMP,
      userId:          user.uid,
      customerTyping:  false
    }).catch(() => {});

    input.value = '';
    clearTimeout(typingTimeout);
    
    showChatFeedback('✅ Sent', false);
    
  } catch (e) {
    console.error('[Chat] Send failed:', e.code, e.message);
    
    if (e.code === 'PERMISSION_DENIED') {
      // Re-auth and try again
      currentUser = null;
      const user = await ensureAnonymousAuth();
      if (user) {
        input.value = text; // Restore message
        showChatFeedback('⚠️ Please try sending again.', true);
      } else {
        showChatFeedback('⚠️ Unable to send. Please refresh the page.', true);
      }
    } else {
      showChatFeedback('⚠️ Failed to send. Try again.', true);
    }
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
      } catch (error) {
        console.error('[Chat] Email link sign-in failed:', error.message);
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
  handleEmailLinkSignIn();
  
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  
  const chatInput = safeEl('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', handleChatKeyPress);
  }
  
  const sendBtn = safeEl('chat-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', sendChatMessage);
  }
});
