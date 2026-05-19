// ==================== CHAT LOGIC ====================
let chatSessionId = localStorage.getItem('janedore_chat') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat', chatSessionId);
let chatOpen = false, chatUnsub = null, chatMode = null;

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-window').classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-unread-dot').style.display = 'none';
    resetChatToOptions();
  } else {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  }
}

function resetChatToOptions() {
  document.getElementById('chat-options').style.display = 'flex';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'none';
  chatMode = null;
}

function startChat() {
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'flex';
  document.getElementById('chat-input-wrap').style.display = 'flex';
  document.getElementById('order-lookup').style.display = 'none';
  chatMode = 'chat';
  listenChat();
  document.getElementById('chat-input').focus();
}

function showOrderLookup() {
  document.getElementById('chat-options').style.display = 'none';
  document.getElementById('chat-messages').style.display = 'none';
  document.getElementById('chat-input-wrap').style.display = 'none';
  document.getElementById('order-lookup').style.display = 'block';
  chatMode = 'order';
}

function backToChatOptions() { resetChatToOptions(); }

async function lookupOrder() {
  const orderId = document.getElementById('order-lookup-input').value.trim();
  const resultEl = document.getElementById('order-result');
  if (!orderId) { resultEl.textContent = 'Please enter an order number.'; return; }
  resultEl.textContent = 'Searching...';
  try {
    const snapshot = await db.collection('orders').where('orderNumber', '==', orderId).get();
    if (snapshot.empty) resultEl.textContent = 'Order not found.';
    else {
      const order = snapshot.docs[0].data();
      resultEl.innerHTML = `Order <strong>${orderId}</strong><br>Status: <strong>${order.status || 'Processing'}</strong><br>Items: ${order.itemCount || 'N/A'}<br>Total: ${order.currency} ${order.subtotal}`;
    }
  } catch (e) { resultEl.textContent = 'Unable to look up order.'; }
}

function listenChat() {
  if (chatUnsub) chatUnsub();
  chatUnsub = db.collection('live_chat').where('sessionId', '==', chatSessionId).orderBy('createdAt', 'asc').onSnapshot(snap => {
    const el = document.getElementById('chat-messages');
    const welcome = el.querySelector('.chat-welcome');
    const scroll = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    snap.docChanges().forEach(c => {
      if (c.type === 'added') {
        const m = c.doc.data();
        const t = m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
        const div = document.createElement('div');
        div.className = 'chat-msg ' + m.sender;
        div.innerHTML = m.text + '<div class="chat-msg-time">' + t + '</div>';
        if (welcome) welcome.remove();
        el.appendChild(div);
        if (!chatOpen && m.sender === 'admin') document.getElementById('chat-unread-dot').style.display = 'block';
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
      text: text,
      sender: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    input.value = '';
  } catch (e) { console.warn('Chat error:', e); }
}
