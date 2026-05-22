// ==================== CHAT LOGIC ====================
// Chats & live messages → Firebase Realtime Database (RTDB)
// Order lookups, stats → Firestore

let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let customerName  = localStorage.getItem('janedore_chat_name') || '';
let chatOpen = false, chatUnsub = null, chatMode = null;
let currentUser = null;
let typingTimeout = null;
let loadedMessageKeys = new Set(); // Track which messages we've already displayed

// Wait for Firebase to be ready
function getRTDB() {
  try {
    return firebase.database();
  } catch(e) {
    console.error('[Chat] Firebase database not available:', e.message);
    return null;
  }
}

function getFirestore() {
  try {
    return firebase.firestore();
  } catch(e) {
    console.error('[Chat] Firebase firestore not available:', e.message);
    return null;
  }
}

// ==================== HELPERS ====================
function safeEl(id) { return document.getElementById(id) || null; }

// ==================== AUTH ====================
async function ensureAuth() {
  try {
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    const result = await firebase.auth().signInAnonymously();
    return result.user;
  } catch(e) {
    console.warn('[Chat] Auth failed:', e.message);
    return null;
  }
}

// ==================== CHAT WIDGET CREATION ====================
function createChatWidget() {
  const existing = document.getElementById('chat-widget-container');
  if (existing) existing.remove();

  const widget = document.createElement('div');
  widget.id = 'chat-widget-container';
  widget.innerHTML = `
    <div id="chat-window" style="display:none;position:fixed;bottom:80px;right:20px;width:360px;max-width:90vw;height:520px;max-height:70vh;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);z-index:9998;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;">
      
      <div style="background:#111;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:13px;font-weight:600;">JANEDORE</div>
          <div style="font-size:10px;color:#aaa;">We reply within minutes</div>
        </div>
        <button onclick="toggleChat()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;">✕</button>
      </div>

      <div id="chat-email-screen" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;flex:1;gap:12px;">
        <div style="font-size:28px;">💬</div>
        <div style="font-size:15px;font-weight:600;text-align:center;">Start a conversation</div>
        <div style="font-size:12px;color:#888;text-align:center;">Enter your details to begin chatting with us</div>
        <input id="chat-name-input" type="text" placeholder="Your name" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;">
        <input id="chat-email-input" type="email" placeholder="Your email" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;">
        <div id="chat-email-error" style="display:none;color:red;font-size:11px;">Please enter a valid email address</div>
        <button onclick="submitEmail()" style="width:100%;padding:12px;background:#111;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">Continue</button>
      </div>

      <div id="chat-options" style="display:none;flex-direction:column;flex:1;padding:24px;gap:12px;">
        <div style="font-size:15px;font-weight:600;">How can we help?</div>
        <button onclick="startChat()" style="width:100%;padding:14px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;text-align:left;font-size:13px;">💬 Start a conversation</button>
        <button onclick="showOrderLookup()" style="width:100%;padding:14px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;text-align:left;font-size:13px;">📦 Track my order</button>
        <button onclick="clearChatSession()" style="width:100%;padding:10px;background:none;border:none;color:#888;cursor:pointer;font-size:11px;margin-top:auto;">↩ Start over</button>
      </div>

      <div id="chat-messages" style="display:none;flex:1;overflow-y:auto;padding:16px;flex-direction:column;gap:8px;background:#fafafa;"></div>
      
      <div id="chat-customer-info" style="display:none;padding:8px 16px;background:#f0f0f0;font-size:10px;color:#666;border-top:1px solid #e0e0e0;">
        <span id="chat-customer-name"></span> · <span id="chat-customer-email"></span> · <span id="chat-customer-stats"></span>
      </div>

      <div id="chat-typing-indicator" style="display:none;padding:4px 16px;font-size:10px;color:#888;background:#fafafa;">Admin is typing...</div>

      <div id="order-lookup" style="display:none;flex-direction:column;padding:24px;flex:1;gap:12px;">
        <div style="font-size:15px;font-weight:600;">Track Your Order</div>
        <div style="font-size:12px;color:#888;">Enter your order number (e.g., ORD-12345)</div>
        <input id="order-lookup-input" type="text" placeholder="Order number" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;">
        <button onclick="lookupOrder()" style="width:100%;padding:12px;background:#111;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Look Up Order</button>
        <div id="order-result" style="font-size:12px;"></div>
        <button onclick="backToChatOptions()" style="width:100%;padding:10px;background:none;border:none;color:#888;cursor:pointer;font-size:11px;margin-top:auto;">↩ Back</button>
      </div>

      <div id="chat-input-wrap" style="display:none;padding:12px;border-top:1px solid #e0e0e0;background:#fff;">
        <div style="display:flex;gap:8px;">
          <input id="chat-input" type="text" placeholder="Type your message..." onkeypress="handleChatKeyPress(event)" oninput="handleCustomerTyping()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:20px;font-size:13px;outline:none;">
          <button id="chat-send-btn" onclick="sendChatMessage()" style="width:40px;height:40px;border-radius:50%;background:#111;color:#fff;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">➤</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(widget);
}

// ==================== SCREEN CONTROL ====================
function toggleChat() {
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) return;
  win.style.display = chatOpen ? 'flex' : 'none';
  if (chatOpen) {
    const dot = safeEl('chat-unread-dot');
    if (dot) dot.style.display = 'none';
    if (customerEmail) {
      showOptionsScreen();
    } else {
      showEmailScreen();
    }
    ensureAuth();
  } else {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  }
}

function showScreen(id) {
  ['chat-email-screen','chat-options','chat-messages','chat-input-wrap','chat-customer-info','chat-typing-indicator','order-lookup'].forEach(s => {
    const el = safeEl(s);
    if (el) el.style.display = 'none';
  });
  const el = safeEl(id);
  if (el) el.style.display = 'flex';
}

function showEmailScreen() { showScreen('chat-email-screen'); }
function showOptionsScreen() { showScreen('chat-options'); }

function submitEmail() {
  const nameEl = safeEl('chat-name-input');
  const emailEl = safeEl('chat-email-input');
  const errorEl = safeEl('chat-email-error');
  
  const name = (nameEl?.value || '').trim();
  const email = (emailEl?.value || '').trim().toLowerCase();
  
  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errorEl) errorEl.style.display = 'block';
    return;
  }
  if (errorEl) errorEl.style.display = 'none';
  
  customerName = name;
  customerEmail = email;
  localStorage.setItem('janedore_chat_name', name);
  localStorage.setItem('janedore_chat_email', email);
  chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
  localStorage.setItem('janedore_chat_session', chatSessionId);
  
  showOptionsScreen();
}

function startChat() {
  showScreen('chat-messages');
  const inputWrap = safeEl('chat-input-wrap');
  const infoBar = safeEl('chat-customer-info');
  if (inputWrap) inputWrap.style.display = 'flex';
  if (infoBar) infoBar.style.display = 'block';
  
  const nameEl = safeEl('chat-customer-name');
  const emailEl = safeEl('chat-customer-email');
  if (nameEl) nameEl.textContent = customerName || '';
  if (emailEl) emailEl.textContent = customerEmail || '';
  
  chatMode = 'chat';
  loadedMessageKeys.clear(); // Reset seen messages
  loadMessages();
  listenChat();
  
  const input = safeEl('chat-input');
  if (input) input.focus();
}

function showOrderLookup() {
  showScreen('order-lookup');
  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '';
}

function backToChatOptions() { showOptionsScreen(); }

function clearChatSession() {
  firebase.auth().signOut().catch(()=>{});
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  localStorage.removeItem('janedore_chat_session');
  customerEmail = '';
  customerName = '';
  chatSessionId = 'chat-' + Date.now();
  chatMode = null;
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  loadedMessageKeys.clear();
  showEmailScreen();
}

// ==================== MESSAGES ====================
async function loadMessages() {
  const rtdb = getRTDB();
  const el = safeEl('chat-messages');
  if (!rtdb || !el) return;
  
  el.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Loading messages...</div>';
  
  try {
    const snap = await rtdb.ref('live_chat/' + chatSessionId + '/messages').orderByChild('createdAt').once('value');
    el.innerHTML = '';
    
    if (!snap.exists()) {
      el.innerHTML = '<div style="text-align:center;color:#888;padding:40px 20px;"><strong>Welcome to JANEDORE</strong><br><span style="font-size:12px;">Ask us anything — sizing, styling, shipping.</span></div>';
      return;
    }
    
    const messages = [];
    snap.forEach(child => {
      const msg = child.val();
      const key = child.key;
      loadedMessageKeys.add(key);
      messages.push({ _key: key, ...msg });
    });
    messages.sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    
    messages.forEach(m => {
      if (m.type === 'auth') return;
      appendMessage(el, m);
    });
    
    el.scrollTop = el.scrollHeight;
  } catch(e) {
    console.error('[Chat] Load messages error:', e.message);
    el.innerHTML = '<div style="text-align:center;color:#888;padding:40px 20px;"><strong>Welcome to JANEDORE</strong><br><span style="font-size:12px;">Ask us anything.</span></div>';
  }
}

function appendMessage(container, m) {
  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
  const isCustomer = m.sender === 'customer';
  const div = document.createElement('div');
  div.style.cssText = `
    max-width:80%;
    padding:10px 14px;
    border-radius:18px;
    font-size:13px;
    line-height:1.4;
    align-self:${isCustomer ? 'flex-end' : 'flex-start'};
    background:${isCustomer ? '#111' : '#e8e8e8'};
    color:${isCustomer ? '#fff' : '#333'};
    margin-bottom:4px;
  `;
  div.innerHTML = m.text + `<div style="font-size:9px;opacity:0.6;margin-top:4px;">${time}</div>`;
  container.appendChild(div);
}

function listenChat() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  if (chatUnsub) chatUnsub();
  
  const ref = rtdb.ref('live_chat/' + chatSessionId + '/messages');
  
  // Listen for ALL new messages (child_added fires for each existing child initially,
  // then for new ones. We use loadedMessageKeys to skip ones we already displayed.)
  chatUnsub = ref.on('child_added', snap => {
    const key = snap.key;
    const m = snap.val();
    
    // Skip messages we already loaded
    if (loadedMessageKeys.has(key)) return;
    loadedMessageKeys.add(key);
    
    if (!m || m.type === 'auth') return;
    
    const el = safeEl('chat-messages');
    if (!el) return;
    
    appendMessage(el, m);
    el.scrollTop = el.scrollHeight;
    
    // Show unread dot for admin messages when chat is closed
    if (!chatOpen && m.sender === 'admin') {
      const dot = safeEl('chat-unread-dot');
      if (dot) dot.style.display = 'block';
    }
  });
  
  console.log('[Chat] Listening for messages on session:', chatSessionId);
}

// ==================== SEND MESSAGE ====================
async function sendChatMessage() {
  const rtdb = getRTDB();
  const input = safeEl('chat-input');
  if (!rtdb || !input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  const btn = safeEl('chat-send-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  
  try {
    await ensureAuth();
    const user = firebase.auth().currentUser;
    
    await rtdb.ref('live_chat/' + chatSessionId + '/messages').push({
      sessionId: chatSessionId,
      customerEmail: customerEmail,
      customerName: customerName,
      text: text,
      sender: 'customer',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      userId: user ? user.uid : 'anonymous'
    });
    
    input.value = '';
  } catch(e) {
    console.error('[Chat] Send error:', e.message);
    alert('Failed to send message. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    if (input) input.focus();
  }
}

// ==================== TYPING ====================
function handleCustomerTyping() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  clearTimeout(typingTimeout);
  rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(true).catch(()=>{});
  typingTimeout = setTimeout(() => {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false).catch(()=>{});
  }, 3000);
}

// Listen for admin typing
function listenTyping() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping').on('value', snap => {
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) {
      indicator.style.display = snap.val() === true ? 'block' : 'none';
    }
  });
}

function handleChatKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

// ==================== ORDER LOOKUP ====================
async function lookupOrder() {
  const db = getFirestore();
  const input = safeEl('order-lookup-input');
  const resultEl = safeEl('order-result');
  if (!db || !input || !resultEl) return;
  
  const orderNum = input.value.trim().toUpperCase();
  if (!orderNum) { resultEl.textContent = 'Please enter an order number.'; return; }
  if (!customerEmail) { resultEl.textContent = 'Please enter your email in chat first.'; return; }
  
  resultEl.textContent = 'Searching...';
  
  try {
    const snap = await db.collection('orders')
      .where('orderNumber', '==', orderNum)
      .where('customerEmail', '==', customerEmail)
      .limit(1).get();
    
    if (snap.empty) {
      resultEl.innerHTML = '<p style="color:#888;">No order found.</p><p style="font-size:10px;">Check your order number and email.</p>';
      return;
    }
    
    const o = snap.docs[0].data();
    const date = o.createdAt ? new Date(o.createdAt.seconds*1000).toLocaleDateString() : 'N/A';
    resultEl.innerHTML = `
      <p style="color:green;">✅ Order found</p>
      <div style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;">
        <strong>#${o.orderNumber || snap.docs[0].id}</strong><br>
        Status: ${o.status || 'pending'}<br>
        Items: ${o.items?.length || o.itemCount || 0}<br>
        Total: R${o.subtotal || o.total || 0}<br>
        Date: ${date}
      </div>`;
  } catch(e) {
    console.error('[Chat] Order lookup error:', e.message);
    resultEl.innerHTML = '<p style="color:red;">Unable to look up order. Please try again or contact us via chat.</p>';
  }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Chat] Initializing...');
  createChatWidget();
  
  const nameInput = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput && customerName) nameInput.value = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  
  ensureAuth().then(u => console.log('[Chat] Auth ready:', u ? u.uid : 'failed'));
  
  console.log('[Chat] Ready');
});
