let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let chatOpen = false, chatUnsub = null, chatMode = null;
let chatCurrentUser = null;
let anonAuthInProgress = false;
let isSendingMessage = false;
let typingTimeout = null;

function safeEl(id) {
  return document.getElementById(id) || null;
}

function setDisplay(id, value) {
  const el = safeEl(id);
  if (el) el.style.display = value;
}

firebase.auth().onAuthStateChanged((user) => {
  if (user && !user.isAnonymous && user.email) {
    chatCurrentUser = user;
    customerEmail = user.email.trim().toLowerCase();
    localStorage.setItem('janedore_chat_email', customerEmail);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    if (chatOpen) showOptionsScreen();
    return;
  }
  if (user && user.isAnonymous) {
    chatCurrentUser = user;
    return;
  }
  if (!user) {
    chatCurrentUser = null;
  }
});

async function ensureAnonymousAuth() {
  if (chatCurrentUser) return chatCurrentUser;
  const existing = firebase.auth().currentUser;
  if (existing) {
    chatCurrentUser = existing;
    return chatCurrentUser;
  }
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
    const actionCodeSettings = { url: window.location.href, handleCodeInApp: true };
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

function clearChatSession() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  const current = firebase.auth().currentUser;
  if (current && current.isAnonymous) {
    firebase.auth().signOut().catch(() => {});
  }
  chatCurrentUser = null;
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_session');
  localStorage.removeItem('janedore_chat_email_pending');
  customerEmail = '';
  chatSessionId = 'chat-' + Date.now();
  chatMode = null;
  clearTimeout(typingTimeout);
  updateTypingState(false);
  const el = safeEl('chat-messages');
  if (el) el.innerHTML = '';
  showEmailScreen();
}

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
  listenChat();
  const inputEl = safeEl('chat-input');
  if (inputEl) inputEl.focus();
}

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
    const exactSnap = await db.collection('orders')
      .where('orderNumber', '==', rawOrderNumber)
      .where('customerEmail', '==', customerEmail)
      .limit(1)
      .get();
    if (!exactSnap.empty) exactSnap.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
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

// ── Typing indicator ────────────────────────────────────────────────────────

function updateTypingState(isTyping) {
  if (!chatSessionId) return;
  db.collection('live_chat_typing').doc(chatSessionId).set({
    customerTyping: isTyping,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(() => {});
}

function listenTypingIndicator() {
  db.collection('live_chat_typing').doc(chatSessionId)
    .onSnapshot(snap => {
      const el = safeEl('chat-typing-indicator');
      if (!el) return;
      const data = snap.data();
      if (data && data.adminTyping) {
        el.textContent = 'JANEDORE is typing…';
        el.style.display = 'block';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    }, () => {});
}

function handleCustomerTyping() {
  updateTypingState(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => updateTypingState(false), 3000);
}

// ── Chat rendering ──────────────────────────────────────────────────────────

function renderMessages(docs) {
  const el = safeEl('chat-messages');
  if (!el) return;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;

  // Remove only confirmed bubbles, preserve any optimistic one still pending
  Array.from(el.querySelectorAll('.chat-msg:not([data-optimistic])')).forEach(n => n.remove());
  const welcomeEl = el.querySelector('.chat-welcome');

  if (docs.length === 0 && !welcomeEl) {
    el.insertAdjacentHTML('afterbegin', '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>');
    return;
  }

  if (welcomeEl && docs.length > 0) welcomeEl.remove();

  const firstOptimistic = el.querySelector('[data-optimistic]');
  docs.forEach(doc => {
    const m = doc.data();
    if (m.type === 'auth') return;
    const t = m.createdAt
      ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    const div = document.createElement('div');
    div.className = 'chat-msg ' + m.sender;
    div.dataset.docId = doc.id;
    div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
    if (firstOptimistic) {
      el.insertBefore(div, firstOptimistic);
    } else {
      el.appendChild(div);
    }
    if (!chatOpen && m.sender === 'admin') {
      const unreadDot = safeEl('chat-unread-dot');
      if (unreadDot) unreadDot.style.display = 'block';
    }
  });

  if (atBottom) el.scrollTop = el.scrollHeight;
}

function listenChat() {
  if (chatUnsub) chatUnsub();

  const el = safeEl('chat-messages');
  if (el && el.children.length === 0) {
    el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
  }

  listenTypingIndicator();

  chatUnsub = db.collection('live_chat')
    .where('sessionId', '==', chatSessionId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      renderMessages(snap.docs);
    }, err => {
      console.warn('Chat listener error:', err.code, err.message);
    });
}

// ── Send message ────────────────────────────────────────────────────────────

async function sendChatMessage() {
  const input = safeEl('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text || isSendingMessage) return;

  isSendingMessage = true;
  input.disabled = true;
  input.placeholder = 'Sending…';

  clearTimeout(typingTimeout);
  updateTypingState(false);

  const el = safeEl('chat-messages');
  let optimisticDiv = null;
  if (el) {
    const welcome = el.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    optimisticDiv = document.createElement('div');
    optimisticDiv.className = 'chat-msg customer';
    optimisticDiv.dataset.optimistic = 'true';
    optimisticDiv.innerHTML = text + '<div class="chat-msg-time">' + now + '</div>';
    el.appendChild(optimisticDiv);
    el.scrollTop = el.scrollHeight;
  }

  input.value = '';

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
    // Snapshot fires → renderMessages() replaces the optimistic bubble
  } catch (e) {
    console.warn('Chat send error:', e);
    if (optimisticDiv) optimisticDiv.remove();
    input.value = text;
  } finally {
    input.disabled = false;
    input.placeholder = 'Type a message…';
    input.focus();
    isSendingMessage = false;
  }
}

// ── Email link sign-in ──────────────────────────────────────────────────────

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
