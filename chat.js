// ==================== LIVE CHAT FUNCTIONALITY ====================
let chatSessionId = localStorage.getItem('janedore_chat') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat', chatSessionId);
let chatOpen = false, chatUnsub = null;

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-window').classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-unread-dot').style.display = 'none';
    listenChat();
    document.getElementById('chat-input').focus();
  } else { 
    if (chatUnsub) { chatUnsub(); chatUnsub = null; } 
  }
}

function listenChat() {
  if (chatUnsub) chatUnsub();
  chatUnsub = db.collection('live_chat')
    .where('sessionId', '==', chatSessionId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
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
          if (!chatOpen && m.sender === 'admin') {
            document.getElementById('chat-unread-dot').style.display = 'block';
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
      text: text,
      sender: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    input.value = '';
  } catch (e) { 
    console.warn('Chat error:', e); 
  }
}
