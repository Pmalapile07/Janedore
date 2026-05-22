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
let loadedMessageKeys = new Set();

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

// ==================== SCREEN CONTROL ====================
function toggleChat() {
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) return;
  
  if (chatOpen) {
    win.classList.add('open');
    const dot = safeEl('chat-unread-dot');
    if (dot) dot.style.display = 'none';
    if (customerEmail) {
      showOptionsScreen();
    } else {
      showEmailScreen();
    }
    ensureAuth();
  } else {
    win.classList.remove('open');
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  }
}

function showScreen(id) {
  ['chat-email-screen','chat-options','chat-messages','chat-input-wrap','chat-customer-info','chat-typing-indicator','order-lookup'].forEach(s => {
    const el = safeEl(s);
    if (el) el.style.display = 'none';
  });
  const el = safeEl(id);
  if (el) el.style.display = (id === 'chat-messages' || id === 'order-lookup' || id === 'chat-email-screen' || id === 'chat-options') ? 'flex' : 'block';
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
  if (infoBar) infoBar.style.display = 'flex';
  
  const nameEl = safeEl('chat-customer-name');
  const emailEl = safeEl('chat-customer-email');
  if (nameEl) nameEl.textContent = customerName || 'Guest';
  if (emailEl) emailEl.textContent = customerEmail || '';
  
  chatMode = 'chat';
  loadedMessageKeys.clear();
  loadMessages();
  listenChat();
  listenTyping();
  
  const input = safeEl('chat-input');
  if (input) setTimeout(() => input.focus(), 100);
}

function showOrderLookup() {
  showScreen('order-lookup');
  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '';
  const input = safeEl('order-lookup-input');
  if (input) setTimeout(() => input.focus(), 100);
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
  
  el.innerHTML = '<div class="chat-welcome"><strong>Loading…</strong></div>';
  
  try {
    const snap = await rtdb.ref('live_chat/' + chatSessionId + '/messages').orderByChild('createdAt').once('value');
    el.innerHTML = '';
    
    if (!snap.exists()) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
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
      appendMessage(m);
    });
    
    el.scrollTop = el.scrollHeight;
  } catch(e) {
    console.error('[Chat] Load messages error:', e.message);
    el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything.</div>';
  }
}

function appendMessage(m) {
  const el = safeEl('chat-messages');
  if (!el) return;
  
  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
  const isCustomer = m.sender === 'customer';
  
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (isCustomer ? 'customer' : 'admin');
  div.innerHTML = m.text + '<div class="chat-msg-time">' + time + '</div>';
  el.appendChild(div);
}

function listenChat() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  if (chatUnsub) chatUnsub();
  
  const ref = rtdb.ref('live_chat/' + chatSessionId + '/messages');
  
  chatUnsub = ref.on('child_added', snap => {
    const key = snap.key;
    const m = snap.val();
    
    if (loadedMessageKeys.has(key)) return;
    loadedMessageKeys.add(key);
    
    if (!m || m.type === 'auth') return;
    
    appendMessage(m);
    
    const el = safeEl('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
    
    if (!chatOpen && m.sender === 'admin') {
      const dot = safeEl('chat-unread-dot');
      if (dot) dot.style.display = 'block';
    }
  });
}

// ==================== SEND MESSAGE ====================
async function sendChatMessage() {
  const rtdb = getRTDB();
  const input = safeEl('chat-input');
  if (!rtdb || !input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  const btn = safeEl('chat-send-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
  
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

// ==================== ORDER LOOKUP (READ-ONLY) ====================
async function lookupOrder() {
  const db = getFirestore();
  const input = safeEl('order-lookup-input');
  const resultEl = safeEl('order-result');
  if (!db || !input || !resultEl) return;
  
  const orderNum = input.value.trim().toUpperCase();
  if (!orderNum) { 
    resultEl.innerHTML = '<div style="color:#888;margin-top:12px;">Please enter an order number</div>'; 
    return; 
  }
  
  resultEl.innerHTML = '<div style="color:#888;margin-top:12px;">Searching…</div>';
  
  try {
    const snap = await db.collection('orders')
      .where('orderNumber', '==', orderNum)
      .limit(1)
      .get();
    
    if (snap.empty) {
      resultEl.innerHTML = `
        <div style="margin-top:16px;color:#888;line-height:1.8;">
          <div style="font-family:'Manrope',sans-serif;font-size:11px;font-weight:300;letter-spacing:0.03em;">No order found</div>
          <div style="font-family:'Manrope',sans-serif;font-size:9px;font-weight:300;letter-spacing:0.03em;margin-top:4px;opacity:0.7;">Check your order number and try again</div>
        </div>`;
      return;
    }
    
    const o = snap.docs[0].data();
    const date = o.createdAt ? new Date(o.createdAt.seconds*1000).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}) : '—';
    const status = (o.status || 'pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1);
    
    resultEl.innerHTML = `
      <div style="margin-top:20px;width:100%;text-align:left;font-family:'Manrope',sans-serif;line-height:1.8;">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:0.15em;color:#111;margin-bottom:12px;border-bottom:0.5px solid #e5e5e5;padding-bottom:8px;">Order Details</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;">
          <span style="color:#888;">Order</span>
          <span style="color:#111;">#${o.orderNumber || snap.docs[0].id}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;">
          <span style="color:#888;">Status</span>
          <span style="color:#111;">${status}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;">
          <span style="color:#888;">Items</span>
          <span style="color:#111;">${o.items?.length || o.itemCount || 0}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;">
          <span style="color:#888;">Total</span>
          <span style="color:#111;">R${(o.subtotal || o.total || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;">
          <span style="color:#888;">Date</span>
          <span style="color:#111;">${date}</span>
        </div>
      </div>`;
  } catch(e) {
    console.error('[Chat] Order lookup error:', e.message);
    resultEl.innerHTML = '<div style="color:#c00;font-size:10px;font-weight:300;margin-top:16px;">Unable to look up order. Please try again.</div>';
  }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput && customerName) nameInput.value = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  
  ensureAuth();
});
