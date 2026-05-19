// ==================== CHAT LOGIC ====================
let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = localStorage.getItem('janedore_chat_email') || '';
let chatOpen = false, chatUnsub = null, chatMode = null;

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chat-window');
  win.classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-unread-dot').style.display = 'none';
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
  document.getElementById('chat-email-screen').style.display = 'flex';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'none';
}

function showOptionsScreen() {
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'flex';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'none';
}

async function submitEmail() {
  const email = document.getElementById('chat-email-input').value.trim();
  const errorEl = document.getElementById('chat-email-error');
  
  if (!email || !email.includes('@') || !email.includes('.')) {
    errorEl.style.display = 'block';
    return;
  }
  
  errorEl.style.display = 'none';
  customerEmail = email;
  localStorage.setItem('janedore_chat_email', email);
  chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
  localStorage.setItem('janedore_chat_session', chatSessionId);
  
  showOptionsScreen();
}

function startChat() {
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'flex';
  document.getElementById('chat-input-wrap').style.display = 'flex';
  document.getElementById('chat-customer-info').style.display = 'flex';
  document.getElementById('order-lookup').style.display = 'none';
  
  document.getElementById('chat-customer-email').textContent = customerEmail;
  loadCustomerStats();
  
  chatMode = 'chat';
  loadAllMessages();
  listenChat();
  document.getElementById('chat-input').focus();
}

async function loadCustomerStats() {
  try {
    const [ordersSnap, reviewsSnap, newsletterSnap] = await Promise.all([
      db.collection('orders').where('customerEmail', '==', customerEmail).get(),
      db.collection('reviews').where('email', '==', customerEmail).get(),
      db.collection('newsletter').where('email', '==', customerEmail).get()
    ]);
    
    const parts = [];
    if (ordersSnap.size > 0) parts.push(`${ordersSnap.size} orders`);
    if (reviewsSnap.size > 0) parts.push(`${reviewsSnap.size} reviews`);
    if (newsletterSnap.size > 0) parts.push('subscribed');
    
    document.getElementById('chat-customer-stats').textContent = parts.length > 0 ? parts.join(' · ') : 'New customer';
  } catch (e) {
    document.getElementById('chat-customer-stats').textContent = '';
  }
}

async function showOrderLookup() {
  document.getElementById('chat-email-screen').style.display = 'none';
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('chat-customer-info').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'flex';
  
  const resultEl = document.getElementById('order-result');
  resultEl.textContent = 'Searching...';
  
  try {
    // Removed orderBy to avoid composite index - sort in JavaScript instead
    const snapshot = await db.collection('orders')
      .where('customerEmail', '==', customerEmail)
      .get();
    
    if (snapshot.empty) {
      resultEl.innerHTML = '<p>No orders found for<br><strong>' + customerEmail + '</strong></p>';
      return;
    }
    
    // Sort in JavaScript instead of using orderBy
    const orders = [];
    snapshot.docs.forEach(d => orders.push({ id: d.id, ...d.data() }));
    orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    
    let html = '<p style="margin-bottom:12px;">Orders for <strong>' + customerEmail + '</strong></p>';
    orders.forEach(o => {
      const date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
      html += `<div style="margin-top:8px;padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.5;">
        <strong>Order #${(o.id || '').substring(0, 12)}...</strong><br>
        Status: ${o.status || 'pending'}<br>
        Items: ${o.itemCount || 0} · Total: R${o.subtotal || 0}<br>
        ${date}
      </div>`;
    });
    resultEl.innerHTML = html;
  } catch (e) {
    resultEl.textContent = 'Unable to look up orders. Check your connection.';
    console.warn('Order lookup error:', e);
  }
}

function backToChatOptions() { showOptionsScreen(); }

async function loadAllMessages() {
  const el = document.getElementById('chat-messages');
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
      const t = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
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

function listenChat() {
  if (chatUnsub) chatUnsub();
  
  chatUnsub = db.collection('live_chat')
    .where('sessionId', '==', chatSessionId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const el = document.getElementById('chat-messages');
      const scroll = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      
      snap.docChanges().forEach(c => {
        if (c.type === 'added') {
          const m = c.doc.data();
          const existingTexts = Array.from(el.querySelectorAll('.chat-msg')).map(div => div.textContent);
          const isDuplicate = existingTexts.some(t => t.includes(m.text));
          
          if (!isDuplicate) {
            const t = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
            const div = document.createElement('div');
            div.className = 'chat-msg ' + m.sender;
            div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
            el.appendChild(div);
            
            if (!chatOpen && m.sender === 'admin') {
              document.getElementById('chat-unread-dot').style.display = 'block';
            }
          }
        }
      });
      
      if (scroll) el.scrollTop = el.scrollHeight;
    });
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  try {
    await db.collection('live_chat').add({
      sessionId: chatSessionId,
      customerEmail: customerEmail,
      text: text,
      sender: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    input.value = '';
  } catch (e) { console.warn('Chat error:', e); }
}
