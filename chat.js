/* ================================================================
   JANEDORE — CUSTOMER CHAT WIDGET
   Full file. Drop-in replacement for the previous widget JS.
   Includes: live chat, order lookup, AI assistant, human handoff.
   ================================================================ */

// ==================== STATE ====================
let chatSessionId    = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
localStorage.setItem('janedore_chat_session', chatSessionId);
let customerEmail    = (localStorage.getItem('janedore_chat_email') || '').toLowerCase();
let customerName     = localStorage.getItem('janedore_chat_name') || '';
let chatOpen         = false;
let chatMode         = null;             // 'ai' | 'human' | 'chat'
let currentUser      = null;
let typingTimeout    = null;
let loadedMessageKeys = new Set();

let _chatListenerRef   = null, _chatListenerCb   = null;
let _typingListenerRef = null, _typingListenerCb = null;
let _statusListenerRef = null, _statusListenerCb = null;
let _satisfactionShown = false;
let _resolvedActive    = false;

// AI cache
let _aiConfigCache    = null;
let _aiConfigFetchedAt = 0;
let _aiModel          = null;
let _aiModelName      = null;
let _aiGreetedSessions = new Set();

// ==================== HELPERS ====================
function getRTDB()      { try { return firebase.database(); }      catch(e) { console.error('[Chat] RTDB:', e.message);      return null; } }
function getFirestore() { try { return firebase.firestore(); }     catch(e) { console.error('[Chat] Firestore:', e.message); return null; } }
function safeEl(id)     { return document.getElementById(id) || null; }

// ==================== AUTH ====================
async function ensureAuth() {
  try {
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    const r = await firebase.auth().signInAnonymously();
    return r.user;
  } catch(e) { console.warn('[Chat] Auth:', e.message); return null; }
}

// ==================== LISTENER CLEANUP ====================
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

// ==================== AI CONFIG ====================
async function loadAIConfig() {
  const now = Date.now();
  if (_aiConfigCache && (now - _aiConfigFetchedAt) < 30000) return _aiConfigCache;
  try {
    const db   = getFirestore();
    if (!db) throw new Error('Firestore unavailable');
    const snap = await db.collection('settings').doc('ai_config').get();
    _aiConfigCache     = snap.exists ? snap.data() : { enabled: false };
    _aiConfigFetchedAt = now;
  } catch (e) {
    console.warn('[Chat] AI config load failed:', e.message);
    _aiConfigCache     = { enabled: false };
    _aiConfigFetchedAt = now;
  }
  return _aiConfigCache;
}

function wantsHuman(text, handoffPhrase) {
  const t = (text || '').toLowerCase();
  const phrase = (handoffPhrase || 'speak to human').toLowerCase();
  return t.includes(phrase)
      || /(talk|speak)\s*to\s*(a\s*)?(human|person|agent|someone)/.test(t)
      || /real\s*person/.test(t)
      || /\bhuman\b/.test(t);
}

async function getAIModel(cfg) {
  const modelName = cfg.model || 'gemini-2.5-flash';
  if (_aiModel && _aiModelName === modelName) return _aiModel;
  const lib  = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-ai.js');
  const app  = firebase.app();
  const ai   = lib.getAI(app, { backend: new lib.GoogleAIBackend() });
  _aiModel = lib.getGenerativeModel(ai, {
    model: modelName,
    systemInstruction: cfg.systemPrompt || 'You are a helpful assistant for JANEDORE.'
  });
  _aiModelName = modelName;
  return _aiModel;
}

// ==================== AI REPLY ====================
async function askAI(customerText) {
  const rtdb = getRTDB();
  if (!rtdb) return;

  const cfg = await loadAIConfig();
  if (!cfg.enabled) { await escalateToHuman(); return; }

  let model;
  try { model = await getAIModel(cfg); }
  catch (e) { console.error('[Chat] AI model init failed:', e.message); await escalateToHuman(); return; }

  // Short history for context.
  let history = [];
  try {
    const snap = await rtdb.ref('live_chat/' + chatSessionId + '/messages')
      .orderByChild('createdAt').limitToLast(8).once('value');
    snap.forEach(c => {
      const m = c.val();
      if (!m || m.type === 'auth' || m.type === 'resolved' || m.sender === 'system') return;
      history.push({
        role: m.sender === 'customer' ? 'user' : 'model',
        parts: [{ text: m.text || '' }]
      });
    });
  } catch(_) {}

  let reply = '';
  try {
    const r = await model.generateContent({ contents: history });
    reply = (r.response.text() || '').trim();
  } catch (e) {
    console.error('[Chat] AI generate failed:', e.message);
    await escalateToHuman();
    return;
  }

  if (/^HANDOFF\b/i.test(reply) || reply.toUpperCase() === 'HANDOFF') {
    await escalateToHuman();
    return;
  }

  const msgRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
  const ts     = firebase.database.ServerValue.TIMESTAMP;
  await rtdb.ref('/').update({
    ['live_chat/' + chatSessionId + '/messages/' + msgRef.key]: {
      sessionId: chatSessionId,
      customerEmail, customerName,
      text: reply,
      sender: 'admin',
      senderName: 'Janedore Assistant',
      isAI: true,
      createdAt: ts,
      read: true,
      delivered: true
    },
    ['chat_inbox/' + chatSessionId + '/lastMessage']:   reply,
    ['chat_inbox/' + chatSessionId + '/lastMessageAt']: ts
  });
}

async function escalateToHuman() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  const ts     = firebase.database.ServerValue.TIMESTAMP;
  const sysRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
  await rtdb.ref('/').update({
    ['live_chat/' + chatSessionId + '/messages/' + sysRef.key]: {
      sessionId: chatSessionId,
      text: 'Connecting you to a team member. One moment…',
      sender: 'system',
      createdAt: ts, read: true, delivered: true
    },
    ['live_chat/' + chatSessionId + '/meta/status']: 'escalated',
    ['chat_inbox/' + chatSessionId + '/status']:     'escalated',
    ['chat_inbox/' + chatSessionId + '/needsHuman']: true,
    ['chat_inbox/' + chatSessionId + '/unreadCount']:
      firebase.database.ServerValue.increment(1),
    ['chat_inbox/' + chatSessionId + '/lastMessage']:   'Customer requested a human.',
    ['chat_inbox/' + chatSessionId + '/lastMessageAt']: ts
  });
}

async function maybeSendAIGreeting() {
  if (_aiGreetedSessions.has(chatSessionId)) return;
  const cfg = await loadAIConfig();
  if (!cfg.enabled || !cfg.greeting) return;

  const rtdb = getRTDB();
  if (!rtdb) return;

  const flagRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/greeted');
  const snap    = await flagRef.once('value');
  if (snap.val()) { _aiGreetedSessions.add(chatSessionId); return; }
  await flagRef.set(true);
  _aiGreetedSessions.add(chatSessionId);

  const msgRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
  const ts     = firebase.database.ServerValue.TIMESTAMP;
  await rtdb.ref('/').update({
    ['live_chat/' + chatSessionId + '/messages/' + msgRef.key]: {
      sessionId: chatSessionId, customerEmail, customerName,
      text: cfg.greeting,
      sender: 'admin', senderName: 'Janedore Assistant',
      isAI: true, createdAt: ts, read: true, delivered: true
    },
    ['chat_inbox/' + chatSessionId + '/lastMessage']:   cfg.greeting,
    ['chat_inbox/' + chatSessionId + '/lastMessageAt']: ts
  });
}

// ==================== FAQ TOGGLE ====================
function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = answer.classList.contains('open');
  document.querySelectorAll('.chat-faq-answer').forEach(a => a.classList.remove('open'));
  document.querySelectorAll('.chat-faq-question').forEach(q => q.classList.remove('active'));
  if (!isOpen) { answer.classList.add('open'); btn.classList.add('active'); }
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

    if (chatMode === 'ai' || chatMode === 'human' || chatMode === 'chat') {
      showScreen('chat-messages');
      const inputWrap = safeEl('chat-input-wrap');
      const infoBar   = safeEl('chat-customer-info');
      if (inputWrap) inputWrap.style.display = 'flex';
      if (infoBar)   infoBar.style.display   = 'flex';
      if (!_chatListenerRef) {
        detachChatListener(); detachTypingListener(); detachStatusListener();
        listenChat(); listenTyping(); listenStatus();
      }
    } else {
      showWelcomeScreen();
    }
    ensureAuth();
  } else {
    win.classList.remove('open');
    detachChatListener(); detachTypingListener(); detachStatusListener();
  }
}

function showScreen(id) {
  ['chat-welcome-screen','chat-email-screen','chat-options','chat-messages','chat-input-wrap',
   'chat-customer-info','chat-typing-indicator','order-lookup'].forEach(s => {
    const el = safeEl(s);
    if (el) el.style.display = 'none';
  });
  const el = safeEl(id);
  if (el) el.style.display =
    (id === 'chat-messages' || id === 'order-lookup' ||
     id === 'chat-email-screen' || id === 'chat-options' ||
     id === 'chat-welcome-screen') ? 'flex' : 'block';
}

function showWelcomeScreen() { showScreen('chat-welcome-screen'); }
function showEmailScreen()   { showScreen('chat-email-screen'); }
function showOptionsScreen() { showScreen('chat-options'); }

function submitEmail() {
  const nameEl  = safeEl('chat-name-input');
  const emailEl = safeEl('chat-email-input');
  const errorEl = safeEl('chat-email-error');
  const name    = (nameEl?.value || '').trim();
  const email   = (emailEl?.value || '').trim().toLowerCase();

  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errorEl) errorEl.style.display = 'block';
    return;
  }
  if (errorEl) errorEl.style.display = 'none';

  customerName  = name;
  customerEmail = email;
  localStorage.setItem('janedore_chat_name',  name);
  localStorage.setItem('janedore_chat_email', email);
  chatSessionId = 'chat-' + email.replace(/[^a-zA-Z0-9]/g, '-');
  localStorage.setItem('janedore_chat_session', chatSessionId);

  showOptionsScreen();
}

// ---- Entry: AI ----
function startAIChat() {
  chatMode = 'ai';
  startChat();
  maybeSendAIGreeting();
}

// ---- Entry: Human ----
async function startHumanChat() {
  chatMode = 'human';
  startChat();
  await escalateToHuman();
}

// ---- Shared starter ----
function startChat() {
  showScreen('chat-messages');
  const inputWrap = safeEl('chat-input-wrap');
  const infoBar   = safeEl('chat-customer-info');
  if (inputWrap) inputWrap.style.display = 'flex';
  if (infoBar)   infoBar.style.display   = 'flex';

  const nameEl  = safeEl('chat-customer-name');
  const emailEl = safeEl('chat-customer-email');
  if (nameEl)  nameEl.textContent  = customerName  || 'Guest';
  if (emailEl) emailEl.textContent = customerEmail || '';

  loadedMessageKeys.clear();
  detachChatListener(); detachTypingListener(); detachStatusListener();
  _satisfactionShown = false; _resolvedActive = false;
  removeResolvedBanner();
  loadMessages();
  listenChat(); listenTyping(); listenStatus();

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

function backToWelcome()     { showWelcomeScreen(); }
function backToChatOptions() { showWelcomeScreen(); }

function clearChatSession() {
  firebase.auth().signOut().catch(() => {});
  localStorage.removeItem('janedore_chat_email');
  localStorage.removeItem('janedore_chat_name');
  localStorage.removeItem('janedore_chat_session');
  customerEmail = ''; customerName = '';
  chatSessionId = 'chat-' + Date.now();
  chatMode      = null;
  detachChatListener(); detachTypingListener(); detachStatusListener();
  _satisfactionShown = false; _resolvedActive = false;
  removeResolvedBanner();
  loadedMessageKeys.clear();
  showWelcomeScreen();
}

// ==================== MESSAGES ====================
async function loadMessages() {
  const rtdb = getRTDB();
  const el   = safeEl('chat-messages');
  if (!rtdb || !el) return;

  el.innerHTML = '<div class="chat-welcome"><strong>Loading...</strong></div>';

  try {
    const snap = await rtdb.ref('live_chat/' + chatSessionId + '/messages')
      .orderByChild('createdAt').once('value');
    el.innerHTML = '';

    if (!snap.exists()) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
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
    el.scrollTop = el.scrollHeight;
  } catch(e) {
    console.error('[Chat] Load messages error:', e.message);
    el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything.</div>';
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
      '<span style="font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:300;letter-spacing:0.03em;">'
        + (m.text || '') + '</span>';
    el.appendChild(pill);
    return;
  }

  const time = m.createdAt
    ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const isCustomer = m.sender === 'customer';

  const div = document.createElement('div');
  div.className = 'chat-msg ' + (isCustomer ? 'customer' : 'admin');

  var rawName  = (!isCustomer && m.senderName) ? m.senderName : '';
  var safeName = (rawName && rawName.indexOf('@') === -1) ? rawName : 'Janedore';
  var showName = !isCustomer && rawName;
  const nameHtml = showName
    ? '<div style="font-size:9px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.6;margin-bottom:3px;font-weight:400;">' + safeName + '</div>'
    : '';

  div.innerHTML = nameHtml + m.text + '<div class="chat-msg-time">' + time + '</div>';
  el.appendChild(div);
}

function listenChat() {
  const rtdb = getRTDB();
  if (!rtdb) return;

  _chatListenerRef = rtdb.ref('live_chat/' + chatSessionId + '/messages');
  _chatListenerCb  = snap => {
    const key = snap.key;
    const m   = snap.val();
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
  };
  _chatListenerRef.on('child_added', _chatListenerCb);
}

// ==================== SEND ====================
async function sendChatMessage() {
  const rtdb  = getRTDB();
  const input = safeEl('chat-input');
  if (!rtdb || !input) return;

  const text = input.value.trim();
  if (!text) return;

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
        '<span style="font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:300;letter-spacing:0.03em;">Reopening chat…</span>';
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
    const ts     = firebase.database.ServerValue.TIMESTAMP;

    const updates = {};
    updates['live_chat/' + chatSessionId + '/messages/' + msgRef.key] = {
      sessionId: chatSessionId,
      customerEmail: customerEmail,
      customerName:  customerName,
      text: text,
      sender: 'customer',
      createdAt: ts,
      read: false, delivered: false,
      userId: user ? user.uid : 'anonymous'
    };

    updates['chat_inbox/' + chatSessionId + '/lastMessage']    = text;
    updates['chat_inbox/' + chatSessionId + '/lastMessageAt']  = ts;
    updates['chat_inbox/' + chatSessionId + '/customerEmail']  = customerEmail;
    updates['chat_inbox/' + chatSessionId + '/customerName']   = customerName || 'Guest';
    updates['chat_inbox/' + chatSessionId + '/unreadCount']    = firebase.database.ServerValue.increment(1);
    updates['live_chat/' + chatSessionId + '/meta/status']     = 'open';
    updates['chat_inbox/' + chatSessionId + '/status']         = 'open';

    if (wasResolved) {
      const reopenRef = rtdb.ref('live_chat/' + chatSessionId + '/messages').push();
      updates['live_chat/' + chatSessionId + '/messages/' + reopenRef.key] = {
        text: 'Customer reopened the conversation.',
        sender: 'system',
        createdAt: ts, read: true, delivered: true,
        sessionId: chatSessionId
      };
    }

    try {
      const rawCart = localStorage.getItem('janedore_cart');
      const cart    = rawCart ? JSON.parse(rawCart) : [];
      updates['chat_inbox/' + chatSessionId + '/cart'] = cart.length > 0
        ? cart.map(i => ({
            name: i.name || '', brand: i.brand || '', color: i.color || '',
            size: i.size || '', qty: i.qty || 1,
            price: i.salePrice != null ? i.salePrice : (i.price || 0),
            productId: i.productId || ''
          }))
        : [];
    } catch(_) {}

    await rtdb.ref('/').update(updates);
    input.value = '';

    const reopenPill = document.getElementById('chat-reopening-pill');
    if (reopenPill) reopenPill.remove();

    input.disabled = false;
    input.placeholder = 'Type your message...';
    _satisfactionShown = false;
    _resolvedActive = false;

    // ---- AI layer ----
    const cfg = await loadAIConfig();
    if (cfg.enabled && chatMode === 'ai') {
      if (wantsHuman(text, cfg.handoffPhrase)) {
        await escalateToHuman();
      } else {
        askAI(text); // fire-and-forget
      }
    }

  } catch(e) {
    console.error('[Chat] Send error:', e.message);
    alert('Failed to send message. Please try again.');
    const reopenPill = document.getElementById('chat-reopening-pill');
    if (reopenPill) reopenPill.remove();
    if (wasResolved) {
      _satisfactionShown = true; _resolvedActive = true;
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
  _typingListenerCb  = snap => {
    const val      = snap.val();
    const isTyping = val !== null && typeof val === 'object'
      ? Object.values(val).some(v => v === true)
      : val === true;
    const indicator = safeEl('chat-typing-indicator');
    if (indicator) indicator.style.display = isTyping ? 'block' : 'none';
    if (indicator && isTyping && val && typeof val === 'object') {
      const names = Object.keys(val).filter(k => val[k] === true);
      indicator.textContent = names.length > 0 ? names[0] + ' is typing...' : 'JANEDORE is typing...';
    } else if (indicator && isTyping) {
      indicator.textContent = 'JANEDORE is typing...';
    }
  };
  _typingListenerRef.on('value', _typingListenerCb);
}

// ==================== STATUS / SATISFACTION ====================
function listenStatus() {
  const rtdb = getRTDB();
  if (!rtdb) return;
  _statusListenerRef = rtdb.ref('live_chat/' + chatSessionId + '/meta/status');
  _statusListenerCb  = snap => {
    const status = snap.val();
    if (status === 'resolved' && !_satisfactionShown) {
      _satisfactionShown = true; _resolvedActive = true;
      showSatisfactionPrompt();
    }
    if (status !== 'resolved') {
      _satisfactionShown = false; _resolvedActive = false;
      const input   = safeEl('chat-input');
      const sendBtn = safeEl('chat-send-btn');
      if (input)   { input.disabled = false; input.placeholder = 'Type your message...'; }
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
    '<span style="font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:300;letter-spacing:0.03em;">Resolved.</span>';
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
    '<div style="font-size:11px;font-weight:400;margin-bottom:10px;line-height:1.6;">We\'re glad we could help. Was your issue resolved?</div>'
    + '<div style="display:flex;gap:8px;justify-content:center;">'
      + '<button id="sat-yes" style="background:none;border:0.5px solid currentColor;padding:6px 18px;border-radius:20px;font-family:Manrope,sans-serif;font-size:11px;font-weight:400;cursor:pointer;letter-spacing:0.04em;">Yes</button>'
      + '<button id="sat-no"  style="background:none;border:0.5px solid currentColor;padding:6px 18px;border-radius:20px;font-family:Manrope,sans-serif;font-size:11px;font-weight:400;cursor:pointer;letter-spacing:0.04em;">Not really</button>'
    + '</div>';
  el.appendChild(prompt);
  el.scrollTop = el.scrollHeight;

  const yesBtn = document.getElementById('sat-yes');
  const noBtn  = document.getElementById('sat-no');
  if (yesBtn) yesBtn.addEventListener('click', function () { submitSatisfaction(true);  });
  if (noBtn)  noBtn .addEventListener('click', function () { submitSatisfaction(false); });
}

async function submitSatisfaction(satisfied) {
  const rtdb   = getRTDB();
  const prompt = document.getElementById('satisfaction-prompt');
  const el     = safeEl('chat-messages');
  if (!el) return;
  if (prompt) prompt.remove();

  try {
    if (rtdb) {
      await rtdb.ref('live_chat/' + chatSessionId + '/meta/satisfaction').set({
        satisfied: satisfied,
        respondedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
  } catch(e) { console.warn('[Chat] Satisfaction write failed:', e.message); }

  const thanks = document.createElement('div');
  thanks.className = 'chat-msg admin';
  thanks.innerHTML =
    '<div style="font-size:11px;font-weight:300;line-height:1.6;">'
      + (satisfied
          ? 'Thank you for letting us know. We hope to see you again soon.'
          : 'We\'re sorry to hear that. A member of the Janedore team will follow up with you shortly.')
    + '</div>';
  el.appendChild(thanks);
  el.scrollTop = el.scrollHeight;
}

// ==================== ORDER LOOKUP ====================
async function lookupOrder() {
  const db       = getFirestore();
  const input    = safeEl('order-lookup-input');
  const resultEl = safeEl('order-result');
  if (!db || !input || !resultEl) return;

  const orderNum = input.value.trim().toUpperCase();
  if (!orderNum) {
    resultEl.innerHTML = '<div style="color:#888;margin-top:12px;">Please enter an order number</div>';
    return;
  }
  resultEl.innerHTML = '<div style="color:#888;margin-top:12px;">Searching...</div>';

  try {
    const snap = await db.collection('orders').where('orderNumber', '==', orderNum).limit(1).get();
    if (snap.empty) {
      resultEl.innerHTML = `
        <div style="margin-top:16px;color:#888;line-height:1.8;">
          <div style="font-family:'Manrope',sans-serif;font-size:11px;font-weight:300;letter-spacing:0.03em;">No order found</div>
          <div style="font-family:'Manrope',sans-serif;font-size:9px;font-weight:300;letter-spacing:0.03em;margin-top:4px;opacity:0.7;">Check your order number and try again</div>
        </div>`;
      return;
    }
    const o = snap.docs[0].data();
    const date = o.createdAt
      ? new Date(o.createdAt.seconds * 1000).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    const status = (o.status || 'pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1);

    resultEl.innerHTML = `
      <div style="margin-top:20px;width:100%;text-align:left;font-family:'Manrope',sans-serif;line-height:1.8;">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:0.15em;color:#111;margin-bottom:12px;border-bottom:0.5px solid #e5e5e5;padding-bottom:8px;">Order Details</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;"><span style="color:#888;">Order</span><span style="color:#111;">#${o.orderNumber || snap.docs[0].id}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;"><span style="color:#888;">Status</span><span style="color:#111;">${status}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;"><span style="color:#888;">Items</span><span style="color:#111;">${o.items?.length || o.itemCount || 0}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;margin-bottom:6px;"><span style="color:#888;">Total</span><span style="color:#111;">R${(o.subtotal || o.total || 0).toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:300;letter-spacing:0.03em;"><span style="color:#888;">Date</span><span style="color:#111;">${date}</span></div>
      </div>`;
  } catch(e) {
    console.error('[Chat] Order lookup error:', e.message);
    resultEl.innerHTML = '<div style="color:#c00;font-size:10px;font-weight:300;margin-top:16px;">Unable to look up order. Please try again.</div>';
  }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  const nameInput  = safeEl('chat-name-input');
  const emailInput = safeEl('chat-email-input');
  if (nameInput  && customerName)  nameInput.value  = customerName;
  if (emailInput && customerEmail) emailInput.value = customerEmail;
  ensureAuth();
});
