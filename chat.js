// ==================== JANEDORE CHAT — REALTIME DATABASE ====================

let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let customerName = localStorage.getItem('janedore_chat_name') || '';
let chatOpen = false;
let chatUnsub = null;
let isSending = false;
let typingTimeout = null;

// Realtime DB reference
const rtdb = firebase.database();
const chatPath = (sessionId) => `chats/${sessionId}/messages`;
const typingPath = (sessionId) => `chats/${sessionId}/typing`;

function safeEl(id) { return document.getElementById(id) || null; }
function setDisplay(id, value) { const el = safeEl(id); if (el) el.style.display = value; }

// ── Handle auth state ─────────────────────────────────────────────
firebase.auth().onAuthStateChanged((user) => {
  if (user && !user.isAnonymous && user.email) {
    customerEmail = user.email.trim().toLowerCase();
    customerName = user.displayName || '';
    localStorage.setItem('janedore_chat_email', customerEmail);
    if (user.displayName) localStorage.setItem('janedore_chat_name', customerName);
    chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
    localStorage.setItem('janedore_chat_session', chatSessionId);
    if (chatOpen) showOptionsScreen();
  }
});

// ── Open / Close ──────────────────────────────────────────────────
function toggleChat() {
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) return;
  win.classList.toggle('open', chatOpen);
  if (chatOpen) {
    setDisplay('chat-unread-dot', 'none');
    if (customerEmail) showOptionsScreen();
    else showEmailScreen();
  } else {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  }
}

// ── Screens ───────────────────────────────────────────────────────
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

function submitEmail() {
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
  showOptionsScreen();
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
  listenChat();
  const inputEl = safeEl('chat-input');
  if (inputEl) inputEl.focus();
}

// ── Listen to chat messages (Realtime DB) ─────────────────────────
function listenChat() {
  if (chatUnsub) chatUnsub();

  const el = safeEl('chat-messages');
  if (el) el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';

  const messagesRef = rtdb.ref(chatPath(chatSessionId));

  chatUnsub = messagesRef.on('value', (snapshot) => {
    const messages = [];
    snapshot.forEach((child) => {
      messages.push({ id: child.key, ...child.val() });
    });
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    renderMessages(messages);
  }, (error) => {
    console.warn('Chat listener error:', error.message);
  });

  // Listen for admin typing
  const typingRef = rtdb.ref(typingPath(chatSessionId));
  typingRef.on('value', (snapshot) => {
    const data = snapshot.val();
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) {
      indicator.style.display = (data && data.admin) ? 'block' : 'none';
      if (data && data.admin) indicator.textContent = 'JANEDORE is typing...';
    }
  });
}

// ── Render messages ────────────────────────────────────────────────
function renderMessages(messages) {
  const el = safeEl('chat-messages');
  if (!el) return;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;

  // Remove all message divs
  el.querySelectorAll('.chat-msg').forEach(n => n.remove());
  const welcome = el.querySelector('.chat-welcome');

  if (messages.length === 0) {
    if (!welcome) {
      el.insertAdjacentHTML('afterbegin', '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>');
    }
    return;
  }

  if (welcome) welcome.remove();

  messages.forEach((m) => {
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.sender || 'customer');
    div.innerHTML = (m.text || '') + '<div class="chat-msg-time">' + time + '</div>';
    el.appendChild(div);

    if (!chatOpen && m.sender === 'admin') {
      const dot = safeEl('chat-unread-dot');
      if (dot) dot.style.display = 'block';
    }
  });

  if (atBottom) el.scrollTop = el.scrollHeight;
}

// ── Send message ───────────────────────────────────────────────────
async function sendChatMessage() {
  const input = safeEl('chat-input');
  if (!input || isSending) return;
  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  input.disabled = true;
  input.placeholder = 'Sending...';

  // Clear typing indicator
  clearTimeout(typingTimeout);
  rtdb.ref(typingPath(chatSessionId)).set({ customer: false });

  // Optimistic local display
  const el = safeEl('chat-messages');
  if (el) {
    const welcome = el.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'chat-msg customer';
    div.innerHTML = text + '<div class="chat-msg-time">' + now + '</div>';
    div.style.opacity = '0.6';
    div.dataset.optimistic = 'true';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  input.value = '';

  try {
    await rtdb.ref(chatPath(chatSessionId)).push({
      text: text,
      sender: 'customer',
      customerEmail: customerEmail,
      customerName: customerName,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      read: false
    });
    // The listener will update the UI with the real message
  } catch (e) {
    console.warn('Chat send error:', e.message);
    // Remove optimistic message
    const optimistic = el?.querySelector('[data-optimistic]');
    if (optimistic) optimistic.remove();
    input.value = text;
    alert('Message failed to send. Please try again.');
  } finally {
    input.disabled = false;
    input.placeholder = 'Type a message...';
    input.focus();
    isSending = false;
  }
}

// ── Typing indicator ───────────────────────────────────────────────
function handleCustomerTyping() {
  rtdb.ref(typingPath(chatSessionId)).set({ customer: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    rtdb.ref(typingPath(chatSessionId)).set({ customer: false });
  }, 3000);
}

// ── Order Lookup (unchanged) ──────────────────────────────────────
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
  resultEl.textContent = 'Searching...';
  try {
    const orders = [];
    const snap = await db.collection('orders')
      .where('customerEmail', '==', customerEmail)
      .get();
    snap.docs.forEach(d => {
      const data = d.data();
      const orderNum = data.orderNumber || '';
      if (orderNum.toUpperCase().includes(rawOrderNumber) || rawOrderNumber.includes(orderNum.toUpperCase().replace('ORD-', ''))) {
        orders.push({ id: d.id, ...data });
      }
    });
    if (orders.length === 0) {
      resultEl.innerHTML = '<p style="color:#888;">No order found. Check the order number.</p>';
      return;
    }
    const o = orders[0];
    const date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
    resultEl.innerHTML = `
      <p style="margin-bottom:12px;font-size:10px;">Order found</p>
      <div style="padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.6;">
        <strong>Order #${o.orderNumber || o.id.substring(0, 12)}</strong><br>
        Status: ${o.status || 'pending'}<br>
        Items: ${o.itemCount || 0} · Total: R${o.subtotal || o.total || 0}<br>
        Date: ${date}
      </div>`;
  } catch (e) {
    resultEl.innerHTML = '<p style="color:#888;">No order found.</p>';
  }
}

function backToChatOptions() { showOptionsScreen(); }
function clearChatSession() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  customerEmail = '';
  customerName = '';
  chatSessionId = 'chat-' + Date.now();
  localStorage.setItem('janedore_chat_session', chatSessionId);
  clearTimeout(typingTimeout);
  const el = safeEl('chat-messages');
  if (el) el.innerHTML = '';
  showEmailScreen();
}
