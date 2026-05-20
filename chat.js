// ==================== CHAT LOGIC ====================
// NOTE: This module uses Firebase Anonymous Auth for Firestore access.
// It NEVER calls firebase.auth().signOut() — account sign-out is handled
// only by the account module. Chat auth is isolated via user.isAnonymous checks.

let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let chatOpen = false, chatUnsub = null, chatMode = null;
let chatCurrentUser = null; // Scoped to chat — never touches account state
let anonAuthInProgress = false;

// ==================== HELPERS ====================
function safeEl(id) {
  return document.getElementById(id) || null;
}

function setDisplay(id, value) {
  const el = safeEl(id);
  if (el) el.style.display = value;
}

// ==================== CHAT AUTH LISTENER ====================
// Only reacts to real (non-anonymous) Firebase auth changes.
// Anonymous sign-ins (used by this chat module) are ignored here
// so they don't interfere with account page state.
firebase.auth().onAuthStateChanged((user) => {
  // If a real (email/password) account signs in, sync chat email
  if (user && !user.isAnonymous && user.email) {
    chatCurrentUser = user;
    customerEmail = user.email.trim().toLowerCase();
    localStorage.setItem('janedore_chat_email', customerEmail);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    if (chatOpen) showOptionsScreen();
    return;
  }

  // If user is anonymous, keep chatCurrentUser updated but don't touch UI
  if (user && user.isAnonymous) {
    chatCurrentUser = user;
    return;
  }

  // Signed out — only clear chatCurrentUser, do not redirect any page
  if (!user) {
    chatCurrentUser = null;
    // Do not call showEmailScreen() here — sign-out may be from account logout,
    // not from a chat action. Chat session email persists in localStorage.
  }
});

// ==================== ANONYMOUS AUTH ====================
// Used only by the chat module for Firestore access.
// Guaranteed not to affect account pages (isAnonymous guard in account listener).
async function ensureAnonymousAuth() {
  // If already have any user (anon or real), reuse it
  if (chatCurrentUser) return chatCurrentUser;

  // Check Firebase's own current user in case onAuthStateChanged hasn't fired yet
  const existing = firebase.auth().currentUser;
  if (existing) {
    chatCurrentUser = existing;
    return chatCurrentUser;
  }

  // Prevent concurrent auth calls
  if (anonAuthInProgress) {
    let waited = 0;
    while (anonAuthInProgress && waited < 3000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
    return chatCurrentUser;
  }

  anonAuthInProgress = true;
  try {
    const result = await firebase.auth().signInAnonymously();
    chatCurrentUser = result.user;
    return chatCurrentUser;
  } catch (error) {
    console.warn('Chat: anonymous auth failed:', error.message);
    return null;
  } finally {
    anonAuthInProgress = false;
  }
}

async function signInWithEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true
    };
    await firebase.auth().sendSignInLinkToEmail(normalizedEmail, actionCodeSettings);
    localStorage.setItem('janedore_chat_email_pending', normalizedEmail);
    return { success: true, method: 'emailLink' };
  } catch (error) {
    console.warn('Chat: email link auth failed:', error.message);
    try {
      const user = await ensureAnonymousAuth();
      if (user) return { success: true, method: 'anonymous' };
    } catch (fallbackError) {
      console.warn('Chat: anonymous fallback failed:', fallbackError.message);
    }
    return { success: false, error: error.message };
  }
}

// ==================== SESSION MANAGEMENT ====================
// IMPORTANT: Does NOT call firebase.auth().signOut().
// Signing out of Firebase would log the real account user out too.
// We only clear the chat session — anonymous auth is stateless enough
// that a new one will be created on next Firestore access.
function clearChatSession() {
  // Unsubscribe any active Firestore listener
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }

  // If the current user is anonymous, sign out only that anonymous session.
  // If they're a real account user, leave Firebase auth untouched.
  const current = firebase.auth().currentUser;
  if (current && current.isAnonymous) {
    firebase.auth().signOut().catch(() => {});
  }
  chatCurrentUser = null;

  // Clear all chat-specific localStorage keys
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_session');
  localStorage.removeItem('janedore_chat_email_pending');

  // Reset in-memory state
  customerEmail = '';
  chatSessionId = 'chat-' + Date.now();
  chatMode = null;

  // Return user to email entry
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
  setDisplay('chat-email-screen', 'flex');
  setDisplay('chat-options', 'none');
  setDisplay('chat-messages', 'none');
  setDisplay('chat-input-wrap', 'none');
  setDisplay('chat-customer-info', 'none');
  setDisplay('order-lookup', 'none');
}

function showOptionsScreen() {
  setDisplay('chat-email-screen', 'none');
  setDisplay('chat-options', 'flex');
  setDisplay('chat-messages', 'none');
  setDisplay('chat-input-wrap', 'none');
  setDisplay('chat-customer-info', 'none');
  setDisplay('order-lookup', 'none');
}

// ==================== EMAIL SUBMIT ====================
async function submitEmail() {
  const inputEl = safeEl('chat-email-input');
  const errorEl = safeEl('chat-email-error');
  if (!inputEl) return;

  const email = inputEl.value.trim().toLowerCase();

  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errorEl) errorEl.style.display = 'block';
    return;
  }
  if (errorEl) errorEl.style.display = 'none';

  customerEmail = email;
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
  setDisplay('chat-email-screen', 'none');
  setDisplay('chat-options', 'none');
  setDisplay('chat-messages', 'flex');
  setDisplay('chat-input-wrap', 'flex');
  setDisplay('chat-customer-info', 'flex');
  setDisplay('order-lookup', 'none');

  const emailEl = safeEl('chat-customer-email');
  if (emailEl) emailEl.textContent = customerEmail;
  loadCustomerStats();

  chatMode = 'chat';
  loadAllMessages();
  listenChat();
  const inputEl = safeEl('chat-input');
  if (inputEl) inputEl.focus();
}

// ==================== CUSTOMER STATS ====================
async function loadCustomerStats() {
  const statsEl = safeEl('chat-customer-stats');
  if (!statsEl) return;
  statsEl.textContent = '';

  try {
    const parts = [];

    try {
      const ordersSnap = await db.collection('orders')
        .where('customerEmail', '==', customerEmail)
        .limit(10)
        .get();
      if (!ordersSnap.empty) parts.push(`${ordersSnap.size} order${ordersSnap.size > 1 ? 's' : ''}`);
    } catch (e) { console.warn('Chat stats - orders:', e.message); }

    try {
      const reviewsSnap = await db.collection('reviews')
        .where('email', '==', customerEmail)
        .limit(10)
        .get();
      if (!reviewsSnap.empty) parts.push(`${reviewsSnap.size} review${reviewsSnap.size > 1 ? 's' : ''}`);
    } catch (e) { console.warn('Chat stats - reviews:', e.message); }

    try {
      const newsletterSnap = await db.collection('newsletter')
        .where('email', '==', customerEmail)
        .limit(1)
        .get();
      if (!newsletterSnap.empty) parts.push('subscribed');
    } catch (e) { console.warn('Chat stats - newsletter:', e.message); }

    statsEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Customer';
  } catch (e) {
    console.warn('Chat stats error:', e.message);
    if (statsEl) statsEl.textContent = 'Customer';
  }
}

// ==================== ORDER LOOKUP ====================
function showOrderLookup() {
  setDisplay('chat-email-screen', 'none');
  setDisplay('chat-options', 'none');
  setDisplay('chat-messages', 'none');
  setDisplay('chat-input-wrap', 'none');
  setDisplay('chat-customer-info', 'none');
  setDisplay('order-lookup', 'flex');

  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '';
}

async function lookupOrder() {
  const resultEl = safeEl('order-result');
  const inputEl = safeEl('order-lookup-input');
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

    // Primary: exact match — order number + customer email
    const exactSnap = await db.collection('orders')
      .where('orderNumber', '==', rawOrderNumber)
      .where('customerEmail', '==', customerEmail)
      .limit(1)
      .get();
    if (!exactSnap.empty) exactSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));

    // Secondary: no-dash variant
    if (orders.length === 0) {
      const normalized = rawOrderNumber.replace(/-/g, '');
      if (normalized !== rawOrderNumber) {
        const normSnap = await db.collection('orders')
          .where('orderNumber', '==', normalized)
          .where('customerEmail', '==', customerEmail)
          .limit(1)
          .get();
        if (!normSnap.empty) normSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
      }
    }

    // Tertiary: add dash variant (ORD12345 → ORD-12345)
    if (orders.length === 0 && !rawOrderNumber.includes('-') && rawOrderNumber.startsWith('ORD')) {
      const dashed = rawOrderNumber.replace(/^(ORD)(\d)/, '$1-$2');
      const dashedSnap = await db.collection('orders')
        .where('orderNumber', '==', dashed)
        .where('customerEmail', '==', customerEmail)
        .limit(1)
        .get();
      if (!dashedSnap.empty) dashedSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
    }

    if (orders.length === 0) {
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;color:#aaa;margin-top:8px;">Check the order number and ensure you\'re using the email you ordered with.</p>';
      return;
    }

    const o = orders[0];
    const date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
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

// ==================== MESSAGES ====================
async function loadAllMessages() {
  const el = safeEl('chat-messages');
  if (!el) return;
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
      if (m.type === 'auth') return;
      const t = m.createdAt
        ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
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

// Track rendered doc IDs to prevent duplicates across snapshot batches
const renderedMessageIds = new Set();

function listenChat() {
  if (chatUnsub) chatUnsub();
  renderedMessageIds.clear();

  chatUnsub = db.collection('live_chat')
    .where('sessionId', '==', chatSessionId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const el = safeEl('chat-messages');
      if (!el) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;

      snap.docChanges().forEach(c => {
        if (c.type !== 'added') return;
        const m = c.doc.data();
        const docId = c.doc.id;
        if (m.type === 'auth') return;
        if (renderedMessageIds.has(docId)) return;
        renderedMessageIds.add(docId);

        const t = m.createdAt
          ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        const div = document.createElement('div');
        div.className = 'chat-msg ' + m.sender;
        div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
        el.appendChild(div);

        const unreadDot = safeEl('chat-unread-dot');
        if (!chatOpen && m.sender === 'admin' && unreadDot) {
          unreadDot.style.display = 'block';
        }
      });

      if (atBottom) el.scrollTop = el.scrollHeight;
    });
}

async function sendChatMessage() {
  const input = safeEl('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  try {
    await ensureAnonymousAuth();

    await db.collection('live_chat').add({
      sessionId: chatSessionId,
      customerEmail: customerEmail || '',
      text: text,
      sender: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false,
      userId: chatCurrentUser ? chatCurrentUser.uid : 'anonymous'
    });
    input.value = '';
  } catch (e) {
    console.warn('Chat send error:', e);
  }
}

// ==================== EMAIL LINK SIGN-IN ====================
async function handleEmailLinkSignIn() {
  if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('janedore_chat_email_pending');
    if (!email) {
      email = window.prompt('Please enter your email for confirmation');
    }
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
});
