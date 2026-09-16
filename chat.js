// ==================== CHAT LOGIC ====================
// Chats & live messages → Firebase Realtime Database (RTDB)
// Order lookups → Firestore
//
// NOTE: This file renders a live on-screen diagnostic panel INSIDE
// the chat window. It is collapsible (tap the "DEBUG" bar). It is
// meant for development — disable _ScreenDebug.enabled = false before
// shipping to real customers.

// ==================== ON-SCREEN DEBUG PANEL ====================
const _ScreenDebug = {
  enabled: true,
  maxRows: 60,
  panel: null,
  logEl: null,
  statusEl: null,
  collapsed: false,

  ensurePanel() {
    if (this.panel) return;
    const win = document.getElementById('chat-window');
    if (!win) return;

    const panel = document.createElement('div');
    panel.id = 'chat-debug-panel';
    panel.style.cssText = [
      'border-bottom:1px solid #e0e0e0',
      'background:#0d0d0d',
      'color:#e6e6e6',
      'font-family: ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size:10px',
      'line-height:1.5',
      'flex-shrink:0',
      'max-height:180px',
      'display:flex',
      'flex-direction:column'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex',
      'justify-content:space-between',
      'align-items:center',
      'padding:6px 10px',
      'background:#1a1a1a',
      'border-bottom:1px solid #333',
      'cursor:pointer',
      'user-select:none',
      'color:#8ff'
    ].join(';');
    header.innerHTML = '<span style="font-weight:700;letter-spacing:0.05em;">DEBUG · tap to toggle</span><span id="chat-debug-status" style="color:#888;">…</span>';
    header.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.logEl.style.display = this.collapsed ? 'none' : 'block';
    });
    panel.appendChild(header);

    const logEl = document.createElement('div');
    logEl.id = 'chat-debug-log';
    logEl.style.cssText = [
      'padding:6px 10px',
      'overflow-y:auto',
      'flex:1',
      'min-height:0'
    ].join(';');
    panel.appendChild(logEl);

    // Insert at top of window (below header)
    const headerEl = win.querySelector('.chat-header');
    if (headerEl && headerEl.nextSibling) {
      win.insertBefore(panel, headerEl.nextSibling);
    } else {
      win.insertBefore(panel, win.firstChild);
    }

    this.panel = panel;
    this.logEl = logEl;
    this.statusEl = panel.querySelector('#chat-debug-status');
  },

  setStatus(text, color) {
    this.ensurePanel();
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.style.color = color || '#888';
    }
  },

  row(area, msg, level) {
    if (!this.enabled) return;
    this.ensurePanel();
    if (!this.logEl) return;

    const colors = {
      ok:    { area:'#7f7', msg:'#cfc' },
      warn:  { area:'#fd0', msg:'#ffd' },
      err:   { area:'#f66', msg:'#fbb' },
      ai:    { area:'#4af', msg:'#bdf' },
      info:  { area:'#8af', msg:'#def' }
    };
    const c = colors[level] || colors.info;
    const ts = new Date().toTimeString().slice(0, 8);

    const el = document.createElement('div');
    el.style.cssText = 'padding:1px 0;border-bottom:1px solid #1e1e1e;';
    el.innerHTML =
      '<span style="color:#555;">' + ts + '</span> ' +
      '<span style="color:' + c.area + ';font-weight:700;">[' + area + ']</span> ' +
      '<span style="color:' + c.msg + ';">' + msg + '</span>';

    this.logEl.appendChild(el);
    while (this.logEl.children.length > this.maxRows) {
      this.logEl.removeChild(this.logEl.firstChild);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;

    // Mirror to browser console too
    const tag = '[Chat/' + area + ']';
    if (level === 'err') console.error(tag, msg);
    else if (level === 'warn') console.warn(tag, msg);
    else console.log(tag, msg);
  },

  ok(area, msg)   { this.row(area, msg, 'ok'); },
  warn(area, msg) { this.row(area, msg, 'warn'); },
  err(area, msg)  { this.row(area, msg, 'err'); },
  ai(area, msg)   { this.row(area, msg, 'ai'); },
  info(area, msg) { this.row(area, msg, 'info'); }
};

// ==================== STATE ====================
let chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let customerName  = localStorage.getItem('janedore_chat_name') || '';
let chatOpen = false;
let typingTimeout = null;
let loadedMessageKeys = new Set();
let hasLoadedOnce = false;
let _aiBridgeReady = false;
let _aiFailCount = 0;
let _aiDisabledUntil = 0;
let _chatListenerRef = null;
let _chatListenerCb  = null;
let _typingListenerRef = null;
let _typingListenerCb  = null;
let _statusListenerRef = null;
let _statusListenerCb  = null;
let _satisfactionShown = false;
let _resolvedActive = false;

function getRTDB() {
  try { return firebase.database(); }
  catch (e) { _ScreenDebug.err('RTDB', 'Not available: ' + e.message); return null; }
}
function getFirestore() {
  try { return firebase.firestore(); }
  catch (e) { _ScreenDebug.err('FS', 'Not available: ' + e.message); return null; }
}
function safeEl(id) { return document.getElementById(id) || null; }

// ==================== ENV SNAPSHOT ====================
function logEnvironmentSnapshot() {
  const snap = {
    firebase:  typeof firebase !== 'undefined',
    compatApp: typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0,
    _firebaseConfig: typeof window._firebaseConfig === 'object' && window._firebaseConfig !== null,
    _aiBridge: !!window._aiBridge,
    auth:      typeof firebase !== 'undefined' && !!firebase.auth,
    database:  typeof firebase !== 'undefined' && !!firebase.database,
    firestore: typeof firebase !== 'undefined' && !!firebase.firestore,
    appCheck:  typeof firebase !== 'undefined' && !!firebase.appCheck
  };
  _ScreenDebug.info('ENV', 'firebase=' + snap.firebase + ' compatApp=' + snap.compatApp + ' _firebaseConfig=' + snap._firebaseConfig);
  _ScreenDebug.info('ENV', '_aiBridge=' + snap._aiBridge + ' auth=' + snap.auth + ' database=' + snap.database + ' firestore=' + snap.firestore + ' appCheck=' + snap.appCheck);
  if (!snap._firebaseConfig) {
    _ScreenDebug.err('ENV', 'window._firebaseConfig is MISSING. AI Bridge cannot initialize. Add "window._firebaseConfig = firebaseConfig;" to firebase.js');
  }
  return snap;
}

// ==================== AI BRIDGE READINESS ====================
function checkAIBridge() {
  if (window._aiBridge) {
    if (!_aiBridgeReady) {
      _aiBridgeReady = true;
      _ScreenDebug.ok('AI', 'Bridge is live (window._aiBridge present)');
      _ScreenDebug.setStatus('AI ready', '#7f7');
    }
    return true;
  }
  return false;
}

function waitForAIBridge(maxWaitMs = 8000) {
  return new Promise((resolve) => {
    if (checkAIBridge()) { resolve(true); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (checkAIBridge()) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > maxWaitMs) {
        clearInterval(interval);
        const reason = window._firebaseConfig
          ? 'module failed to load (check Network tab for gstatic)'
          : 'window._firebaseConfig missing (fix firebase.js first)';
        _ScreenDebug.err('AI', 'Bridge not ready after ' + maxWaitMs + 'ms — ' + reason);
        _ScreenDebug.setStatus('AI offline', '#f66');
        resolve(false);
      }
    }, 250);
  });
}

// ==================== AUTH ====================
async function ensureAuth() {
  try {
    if (firebase.auth().currentUser) {
      _ScreenDebug.ok('AUTH', 'Already signed in: ' + firebase.auth().currentUser.uid.slice(0, 12));
      return firebase.auth().currentUser;
    }
    const result = await firebase.auth().signInAnonymously();
    _ScreenDebug.ok('AUTH', 'Anonymous sign-in OK: ' + result.user.uid.slice(0, 12));
    return result.user;
  } catch (e) {
    _ScreenDebug.err('AUTH', 'Sign-in FAILED: ' + (e.code || '') + ' ' + e.message);
    return null;
  }
}

// ==================== DETACH LISTENERS ====================
function detachChatListener() {
  if (_chatListenerRef && _chatListenerCb) {
    _chatListenerRef.off('child_added', _chatListenerCb);
    _chatListenerRef = null; _chatListenerCb = null;
  }
}
function detachTypingListener() {
  if (_typingListenerRef && _typingListenerCb) {
    _typingListenerRef.off('value', _typingListenerCb);
    _typingListenerRef = null; _typingListenerCb = null;
  }
}
function detachStatusListener() {
  if (_statusListenerRef && _statusListenerCb) {
    _statusListenerRef.off('value', _statusListenerCb);
    _statusListenerRef = null; _statusListenerCb = null;
  }
}

// ==================== SCREEN CONTROL ====================
function toggleChat() {
  _ScreenDebug.ensurePanel();
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) { _ScreenDebug.err('UI', 'chat-window element not found'); return; }

  if (chatOpen) {
    win.classList.add('open');
    _ScreenDebug.info('UI', 'Chat opened');
    const dot = safeEl('chat-unread-dot');
    if (dot) dot.style.display = 'none';

    showScreen('chat-messages');
    const inputWrap = safeEl('chat-input-wrap');
    if (inputWrap) inputWrap.style.display = 'flex';

    if (!hasLoadedOnce) {
      hasLoadedOnce = true;
      loadedMessageKeys.clear();
      detachChatListener();
      detachTypingListener();
      detachStatusListener();
      _satisfactionShown = false;
      _resolvedActive = false;
      removeResolvedBanner();
      loadMessages();
      listenChat();
      listenTyping();
      listenStatus();
    } else if (!_chatListenerRef) {
      detachChatListener();
      detachTypingListener();
      listenChat();
      listenTyping();
      listenStatus();
    }

    updateCustomerInfoBar();
    ensureAuth();
    const input = safeEl('chat-input');
    if (input) setTimeout(() => input.focus(), 100);
  } else {
    win.classList.remove('open');
    _ScreenDebug.info('UI', 'Chat closed');
    detachChatListener();
    detachTypingListener();
    detachStatusListener();
  }
}

function showScreen(id) {
  ['chat-messages', 'order-lookup'].forEach(s => {
    const el = safeEl(s);
    if (el) el.style.display = 'none';
  });
  const el = safeEl(id);
  if (el) el.style.display = 'flex';
}

function updateCustomerInfoBar() {
  const infoBar = safeEl('chat-customer-info');
  const nameEl = safeEl('chat-customer-name');
  const emailEl = safeEl('chat-customer-email');
  if (!infoBar) return;
  if (customerName || customerEmail) {
    if (nameEl) nameEl.textContent = customerName || 'Guest';
    if (emailEl) emailEl.textContent = customerEmail || '';
    infoBar.style.display = 'flex';
  } else {
    infoBar.style.display = 'none';
  }
}

function showOrderLookup() {
  _ScreenDebug.info('UI', 'Order lookup screen');
  showScreen('order-lookup');
  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '';
  const input = safeEl('order-lookup-input');
  if (input) setTimeout(() => input.focus(), 100);
}

function backToChat() {
  _ScreenDebug.info('UI', 'Back to chat');
  showScreen('chat-messages');
  const inputWrap = safeEl('chat-input-wrap');
  if (inputWrap) inputWrap.style.display = 'flex';
}

function clearChatSession() {
  firebase.auth().signOut().catch(() => {});
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  localStorage.removeItem('janedore_chat_session');
  customerEmail = ''; customerName = '';
  chatSessionId = 'chat-' + Date.now();
  detachChatListener();
  detachTypingListener();
  detachStatusListener();
  _satisfactionShown = false;
  _resolvedActive = false;
  removeResolvedBanner();
  loadedMessageKeys.clear();
  hasLoadedOnce = false;
  updateCustomerInfoBar();
  _ScreenDebug.info('UI', 'Session cleared — new sessionId: ' + chatSessionId);
  if (chatOpen) {
    hasLoadedOnce = true;
    loadMessages();
    listenChat();
    listenTyping();
    listenStatus();
  }
}

// ==================== AI GREETING ====================
function renderAIGreeting() {
  const el = safeEl('chat-messages');
  if (!el) return;
  const greeting = document.createElement('div');
  greeting.className = 'chat-msg admin';
  greeting.innerHTML =
    '<div style="margin-bottom:10px;">'
    + 'Hi, I\'m the JANEDORE assistant. I can help with sizing, shipping, returns, or finding the right piece — just ask. '
    + 'You can also track an existing order below.'
    + '</div>'
    + '<button class="chat-pill-btn" id="ai-greeting-track-btn">Track Order</button>';
  el.appendChild(greeting);
  const trackBtn = document.getElementById('ai-greeting-track-btn');
  if (trackBtn) trackBtn.addEventListener('click', showOrderLookup);
}

// ==================== AI REPLY ====================
async function getAIReply(customerText, attempt = 1) {
  const MAX_ATTEMPTS = 3;

  if (Date.now() < _aiDisabledUntil) {
    const secs = Math.ceil((_aiDisabledUntil - Date.now()) / 1000);
    _ScreenDebug.warn('AI', 'Circuit breaker active — skipping (retry in ' + secs + 's)');
    return null;
  }

  if (!window._aiBridge) {
    _ScreenDebug.err('AI', 'Bridge not available on window._aiBridge');
    return null;
  }

  try {
    _ScreenDebug.ai('AI', 'Calling getReply attempt ' + attempt + '/' + MAX_ATTEMPTS + ' — text: "' + customerText.slice(0, 40) + '"');
    const t0 = Date.now();
    const reply = await window._aiBridge.getReply('customer-support-chat', {
      customerText: customerText
    });
    const dt = Date.now() - t0;

    if (!reply) {
      _ScreenDebug.warn('AI', 'Bridge returned null/empty after ' + dt + 'ms');
      return null;
    }

    _ScreenDebug.ok('AI', 'Reply in ' + dt + 'ms (' + reply.length + ' chars): "' + reply.slice(0, 60) + '"');
    _aiFailCount = 0;
    return reply;

  } catch (e) {
    const msg = (e && e.message) || String(e);
    const code = (e && e.code) || '';
    _ScreenDebug.err('AI', 'Attempt ' + attempt + ' threw [' + code + ']: ' + msg);

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 800 * attempt;
      _ScreenDebug.warn('AI', 'Retrying in ' + backoff + 'ms…');
      await new Promise(r => setTimeout(r, backoff));
      return getAIReply(customerText, attempt + 1);
    }

    _aiFailCount++;
    if (_aiFailCount >= 2) {
      _aiDisabledUntil = Date.now() + 60000;
      _ScreenDebug.err('AI', 'Circuit breaker tripped — AI disabled for 60s');
    }
    return null;
  }
}

function customerWantsHuman(text) {
  const t = (text || '').toLowerCase();
  return t.includes('human') || t.includes('agent') || t.includes('real person') || t.includes('speak to someone');
}

// ==================== MESSAGES ====================
async function loadMessages() {
  const rtdb = getRTDB();
  const el = safeEl('chat-messages');
  if (!rtdb || !el) { _ScreenDebug.err('RTDB', 'Cannot load — rtdb or el missing'); return; }

  el.innerHTML = '<div class="chat-welcome"><strong>Loading...</strong></div>';
  _ScreenDebug.info('RTDB', 'Loading history for ' + chatSessionId);

  try {
    const snap = await rtdb.ref('live_chat/' + chatSessionId + '/messages')
      .orderByChild('createdAt').once('value');
    el.innerHTML = '';
    _ScreenDebug.ok('RTDB', 'History read OK — exists=' + snap.exists());

    if (!snap.exists()) {
      renderAIGreeting();
      return;
    }

    const messages = [];
    snap.forEach(child => {
      const key = child.key;
      loadedMessageKeys.add(key);
      messages.push({ _key: key, ...child.val() });
    });
    messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    messages.forEach(m => { if (m.type !== 'auth') appendMessage(m); });
    _ScreenDebug.info('RTDB', 'Rendered ' + messages.length + ' stored messages');

    el.scrollTop = el.scrollHeight;
  } catch (e) {
    _ScreenDebug.err('RTDB', 'Load failed: ' + (e.code || '') + ' ' + e.message);
    renderAIGreeting();
  }
}

function appendMessage(m) {
  const el = safeEl('chat-messages');
  if (!el) return;

  if (m.sender === 'system') {
    if (m.type === 'resolved') return;
    const pill = document.createElement('div');
    pill.style.cssText = 'text-align:center;padding:6px 0;width:100%;';
    pill.innerHTML =
      '<span style="font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:400;">'
      + (m.text || '')
      + '</span>';
    el.appendChild(pill);
    return;
  }

  const time = m.createdAt
    ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const isCustomer = m.sender === 'customer';

  const div = document.createElement('div');
  div.className = 'chat-msg ' + (isCustomer ? 'customer' : 'admin');

  var rawName = (!isCustomer && m.senderName) ? m.senderName : '';
  var safeName = (rawName && rawName.indexOf('@') === -1) ? rawName : 'Janedore';
  var showName = !isCustomer && rawName;
  const nameHtml = showName
    ? '<div style="font-size:9px;text-transform:uppercase;opacity:0.6;margin-bottom:3px;font-weight:500;">' + safeName + '</div>'
    : '';

  div.innerHTML = nameHtml + m.text + '<div class="chat-msg-time">' + time + '</div>';
  el.appendChild(div);
}

function listenChat() {
  const rtdb = getRTDB();
  if (!rtdb) return;

  _chatListenerRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
  _chatListenerCb = snap => {
    const key = snap.key;
    const m = snap.val();
    if (loadedMessageKeys.has(key)) return;
    loadedMessageKeys.add(key);
    if (!m || m.type === 'auth') return;

    _ScreenDebug.info('RTDB', 'New message from ' + (m.sender || 'unknown'));
    appendMessage(m);

    const el = safeEl('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;

    if (!chatOpen && m.sender === 'admin') {
      const dot = safeEl('chat-unread-dot');
      if (dot) dot.style.display = 'block';
    }
  };
  _chatListenerRef.on('child_added', _chatListenerCb);
  _ScreenDebug.info('RTDB', 'Listening for new messages');
}

// ==================== SEND MESSAGE ====================
async function sendChatMessage() {
  const rtdb = getRTDB();
  const input = safeEl('chat-input');
  if (!rtdb || !input) return;

  const text = input.value.trim();
  if (!text) return;

  _ScreenDebug.info('SEND', 'User sent: "' + text.slice(0, 50) + '"');

  const wasResolved = _resolvedActive;
  if (wasResolved) {
    input.placeholder = 'Type your message...';
    const sendBtnEarly = safeEl('chat-send-btn');
    if (sendBtnEarly) sendBtnEarly.disabled = false;
    input.disabled = false;
    _satisfactionShown = false;
    _resolvedActive = false;
    const prompt = document.getElementById('satisfaction-prompt');
    if (prompt) prompt.remove();
    removeResolvedBanner();

    const el = safeEl('chat-messages');
    if (el) {
      const pill = document.createElement('div');
      pill.id = 'chat-reopening-pill';
      pill.style.cssText = 'text-align:center;padding:6px 0;width:100%;';
      pill.innerHTML =
        '<span style="font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:400;">'
        + 'Reopening chat…'
        + '</span>';
      el.appendChild(pill);
      el.scrollTop = el.scrollHeight;
    }
  }

  const btn = safeEl('chat-send-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }

  try {
    await ensureAuth();
    const user = firebase.auth().currentUser;

    const msgRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
    const ts = firebase.database.ServerValue.TIMESTAMP;

    const updates = {};
    updates['live_chat/' + chatSessionId + '/messages/' + msgRef.key] = {
      sessionId: chatSessionId,
      customerEmail: customerEmail,
      customerName: customerName,
      text: text,
      sender: 'customer',
      createdAt: ts,
      read: false,
      delivered: false,
      userId: user ? user.uid : 'anonymous'
    };

    updates['chat_inbox/' + chatSessionId + '/lastMessage'] = text;
    updates['chat_inbox/' + chatSessionId + '/lastMessageAt'] = ts;
    updates['chat_inbox/' + chatSessionId + '/customerEmail'] = customerEmail;
    updates['chat_inbox/' + chatSessionId + '/customerName'] = customerName || 'Guest';
    updates['chat_inbox/' + chatSessionId + '/unreadCount'] = firebase.database.ServerValue.increment(1);

    updates['live_chat/' + chatSessionId + '/meta/status'] = 'open';
    updates['chat_inbox/' + chatSessionId + '/status'] = 'open';

    if (wasResolved) {
      const reopenRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
      updates['live_chat/' + chatSessionId + '/messages/' + reopenRef.key] = {
        text: 'Customer reopened the conversation.',
        sender: 'system',
        createdAt: ts,
        read: true,
        delivered: true,
        sessionId: chatSessionId
      };
    }

    try {
      const rawCart = localStorage.getItem('janedore_cart');
      const cart = rawCart ? JSON.parse(rawCart) : [];
      updates['chat_inbox/' + chatSessionId + '/cart'] = cart.length > 0
        ? cart.map(i => ({
          name: i.name || '', brand: i.brand || '', color: i.color || '',
          size: i.size || '', qty: i.qty || 1,
          price: i.salePrice != null ? i.salePrice : (i.price || 0),
          productId: i.productId || ''
        }))
        : [];
    } catch (_) {}

    await rtdb.ref('/').update(updates);
    _ScreenDebug.ok('SEND', 'Customer message saved to RTDB');
    input.value = '';

    const reopenPill = document.getElementById('chat-reopening-pill');
    if (reopenPill) reopenPill.remove();

    input.disabled = false;
    input.placeholder = 'Type your message...';
    _satisfactionShown = false;
    _resolvedActive = false;

    if (!customerWantsHuman(text)) {
      _ScreenDebug.ai('AI', 'Attempting AI reply…');
      const aiText = await getAIReply(text);

      if (aiText) {
        _ScreenDebug.info('SEND', 'Writing AI reply to RTDB');
        await new Promise(r => setTimeout(r, 0));

        const aiRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
        const aiTs = firebase.database.ServerValue.TIMESTAMP;
        loadedMessageKeys.add(aiRef.key);

        await rtdb.ref('/').update({
          ['live_chat/' + chatSessionId + '/messages/' + aiRef.key]: {
            text: aiText,
            sender: 'admin',
            senderName: 'JANEDORE AI',
            createdAt: aiTs,
            read: true,
            delivered: true,
            sessionId: chatSessionId
          },
          ['chat_inbox/' + chatSessionId + '/lastMessage']: aiText,
          ['chat_inbox/' + chatSessionId + '/lastMessageAt']: aiTs
        });
        _ScreenDebug.ok('SEND', 'AI reply written to RTDB');
      } else {
        _ScreenDebug.warn('SEND', 'No AI reply — leaving message for admin');
      }
    } else {
      _ScreenDebug.info('SEND', 'Customer requested human — AI skipped by design');
    }
  } catch (e) {
    _ScreenDebug.err('SEND', 'Failed: ' + (e.code || '') + ' ' + e.message);
    alert('Failed to send message. Please try again.');

    const reopenPill = document.getElementById('chat-reopening-pill');
    if (reopenPill) reopenPill.remove();

    if (wasResolved) {
      _satisfactionShown = true;
      _resolvedActive = true;
      showResolvedBanner();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    if (input) { input.disabled = false; input.focus(); }
  }
}

// ==================== TYPING ====================
function handleCustomerTyping() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  clearTimeout(typingTimeout);
  rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(true).catch(() => {});
  typingTimeout = setTimeout(() => {
    rtdb.ref('live_chat/' + chatSessionId + '/meta/customerTyping').set(false).catch(() => {});
  }, 3000);
}

function listenTyping() {
  const rtdb = getRTDB();
  if (!rtdb) return;

  _typingListenerRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/adminTyping');
  _typingListenerCb = snap => {
    const val = snap.val();
    const isTyping = val !== null && typeof val === 'object'
      ? Object.values(val).some(v => v === true)
      : val === true;
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) indicator.style.display = isTyping ? 'block' : 'none';
    if (indicator && isTyping && val && typeof val === 'object') {
      const names = Object.keys(val).filter(k => val[k] === true);
      indicator.textContent = names.length > 0
        ? names[0] + ' is typing...'
        : 'JANEDORE is typing...';
    } else if (indicator && isTyping) {
      indicator.textContent = 'JANEDORE is typing...';
    }
  };
  _typingListenerRef.on('value', _typingListenerCb);
}

// ==================== RESOLVE / SATISFACTION ====================
function listenStatus() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  _statusListenerRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/status');
  _statusListenerCb = snap => {
    const status = snap.val();
    _ScreenDebug.info('RTDB', 'Status changed: ' + status);

    if (status === 'resolved' && !_satisfactionShown) {
      _satisfactionShown = true;
      _resolvedActive = true;
      showSatisfactionPrompt();
    }

    if (status !== 'resolved') {
      _satisfactionShown = false;
      _resolvedActive = false;
      const input = safeEl('chat-input');
      const sendBtn = safeEl('chat-send-btn');
      if (input) { input.disabled = false; input.placeholder = 'Type your message...'; }
      if (sendBtn) sendBtn.disabled = false;
      const prompt = document.getElementById('satisfaction-prompt');
      if (prompt) prompt.remove();
      removeResolvedBanner();
      const reopenPill = document.getElementById('chat-reopening-pill');
      if (reopenPill) reopenPill.remove();
    }
  };
  _statusListenerRef.on('value', _statusListenerCb);
}

function showResolvedBanner() {
  const wrap = safeEl('chat-input-wrap');
  if (!wrap || document.getElementById('chat-resolved-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'chat-resolved-banner';
  banner.style.cssText = 'width:100%;text-align:center;padding:6px 0;';
  banner.innerHTML =
    '<span style="font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:400;">'
    + 'Resolved.'
    + '</span>';
  wrap.insertBefore(banner, wrap.firstChild);
}

function removeResolvedBanner() {
  const banner = document.getElementById('chat-resolved-banner');
  if (banner) banner.remove();
}

function showSatisfactionPrompt() {
  const el = safeEl('chat-messages');
  if (!el) return;

  const input = safeEl('chat-input');
  if (input) input.placeholder = 'Conversation resolved — send a message to reopen';

  const prompt = document.createElement('div');
  prompt.id = 'satisfaction-prompt';
  prompt.className = 'chat-msg admin';
  prompt.innerHTML =
    '<div style="margin-bottom:10px;">'
    + 'We\'re glad we could help. Was your issue resolved?'
    + '</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="chat-pill-btn" id="sat-yes">Yes</button>'
    + '<button class="chat-pill-btn" id="sat-no">Not really</button>'
    + '</div>';

  el.appendChild(prompt);
  el.scrollTop = el.scrollHeight;

  const yesBtn = document.getElementById('sat-yes');
  const noBtn  = document.getElementById('sat-no');
  if (yesBtn) yesBtn.addEventListener('click', function () { submitSatisfaction(true); });
  if (noBtn)  noBtn.addEventListener('click',  function () { submitSatisfaction(false); });
}

async function submitSatisfaction(satisfied) {
  const rtdb = getRTDB();
  const prompt = document.getElementById('satisfaction-prompt');
  const el = safeEl('chat-messages');
  if (!el) return;

  if (prompt) prompt.remove();

  try {
    if (rtdb) {
      await rtdb.ref('live_chat/' + chatSessionId + '/meta/satisfaction').set({
        satisfied: satisfied,
        respondedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
    _ScreenDebug.ok('RTDB', 'Satisfaction saved: ' + satisfied);
  } catch (e) {
    _ScreenDebug.warn('RTDB', 'Satisfaction write failed: ' + e.message);
  }

  const thanks = document.createElement('div');
  thanks.className = 'chat-msg admin';
  thanks.innerHTML =
    '<div>'
    + (satisfied
      ? 'Thank you for letting us know. We hope to see you again soon.'
      : 'We\'re sorry to hear that. A member of the Janedore team will follow up with you shortly.')
    + '</div>';
  el.appendChild(thanks);
  el.scrollTop = el.scrollHeight;
}

// ==================== ORDER LOOKUP ====================
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

  resultEl.innerHTML = '<div style="color:#888;margin-top:12px;">Searching...</div>';
  _ScreenDebug.info('FS', 'Order lookup: ' + orderNum);

  try {
    const snap = await db.collection('orders')
      .where('orderNumber', '==', orderNum).limit(1).get();

    if (snap.empty) {
      _ScreenDebug.warn('FS', 'No order for ' + orderNum);
      resultEl.innerHTML = `
        <div style="margin-top:16px;color:#888;line-height:1.8;">
          <div style="font-family:'Manrope',sans-serif;font-size:12px;font-weight:400;">No order found</div>
          <div style="font-family:'Manrope',sans-serif;font-size:10px;font-weight:400;margin-top:4px;opacity:0.7;">Check your order number and try again</div>
        </div>`;
      return;
    }

    _ScreenDebug.ok('FS', 'Order found: ' + orderNum);
    const o = snap.docs[0].data();
    const date = o.createdAt
      ? new Date(o.createdAt.seconds * 1000).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    const status = (o.status || 'pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1);

    resultEl.innerHTML = `
      <div style="margin-top:20px;width:100%;text-align:left;font-family:'Manrope',sans-serif;line-height:1.8;">
        <div style="font-size:9px;color:#111;margin-bottom:12px;border-bottom:0.5px solid #e5e5e5;padding-bottom:8px;font-weight:600;">Order Details</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:400;margin-bottom:6px;">
          <span style="color:#888;">Order</span><span style="color:#111;">#${o.orderNumber || snap.docs[0].id}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:400;margin-bottom:6px;">
          <span style="color:#888;">Status</span><span style="color:#111;">${status}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:400;margin-bottom:6px;">
          <span style="color:#888;">Items</span><span style="color:#111;">${o.items?.length || o.itemCount || 0}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:400;margin-bottom:6px;">
          <span style="color:#888;">Total</span><span style="color:#111;">R${(o.subtotal || o.total || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:400;">
          <span style="color:#888;">Date</span><span style="color:#111;">${date}</span>
        </div>
      </div>`;
  } catch (e) {
    _ScreenDebug.err('FS', 'Lookup failed: ' + (e.code || '') + ' ' + e.message);
    resultEl.innerHTML = '<div style="color:#c00;font-size:11px;font-weight:400;margin-top:16px;">Unable to look up order. Please try again.</div>';
  }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  _ScreenDebug.ensurePanel();
  _ScreenDebug.info('INIT', 'Chat module loaded at ' + new Date().toTimeString().slice(0,8));

  const env = logEnvironmentSnapshot();
  updateCustomerInfoBar();
  ensureAuth();

  if (!env._aiBridge) {
    _ScreenDebug.info('AI', 'Waiting for AI Bridge (max 8s)…');
  }

  waitForAIBridge().then(ready => {
    _ScreenDebug.setStatus(ready ? 'AI ready' : 'AI offline', ready ? '#7f7' : '#f66');
  });
});
