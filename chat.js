// ==================== CHAT LOGIC ====================
// Chats & live messages → Firebase Realtime Database (RTDB)
// Order lookups → Firestore
//
// NOTE: This file renders a live on-screen diagnostic panel INSIDE
// the chat window. It is collapsible (tap the "DEBUG" bar). It is
// meant for development — disable _ScreenDebug.enabled = false before
// shipping to real customers.

// ==================== CONSTANTS ====================
const MAX_CUSTOMER_MSG_LENGTH = 1000;   // RTDB + AI input
const MAX_AI_INPUT_LENGTH     = 1000;   // AI input hard cap
const MAX_NAME_LENGTH         = 60;
const MAX_EMAIL_LENGTH        = 120;
const MAX_SESSION_ID_LENGTH   = 80;
const SESSION_ID_REGEX        = /^chat-\d{10,16}$/;

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

  // FIX #10: build rows with textContent, not innerHTML
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
    el.style.cssText = 'padding:1px 0;border-bottom:1px solid #1e1e1e;word-break:break-word;';

    const tsSpan = document.createElement('span');
    tsSpan.style.color = '#555';
    tsSpan.textContent = ts;

    const areaSpan = document.createElement('span');
    areaSpan.style.color = c.area;
    areaSpan.style.fontWeight = '700';
    areaSpan.textContent = '[' + area + '] ';

    const msgSpan = document.createElement('span');
    msgSpan.style.color = c.msg;
    msgSpan.textContent = msg;

    el.appendChild(tsSpan);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(areaSpan);
    el.appendChild(msgSpan);

    this.logEl.appendChild(el);
    while (this.logEl.children.length > this.maxRows) {
      this.logEl.removeChild(this.logEl.firstChild);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;

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
let chatSessionId = sanitizeSessionId(localStorage.getItem('janedore_chat_session'));
localStorage.setItem('janedore_chat_session', chatSessionId);

let customerEmail = sanitizeEmail(localStorage.getItem('janedore_chat_email') || '');
let customerName  = sanitizeName(localStorage.getItem('janedore_chat_name') || '');
let chatOpen = false;
let typingTimeout = null;
let loadedMessageKeys = new Set();
let hasLoadedOnce = false;
let _aiBridgeReady = false;
let _aiDisabledUntil = 0;
let _aiDisabledReason = '';
let _aiInFlight = false;              // FIX #3: concurrency guard
let _currentAIRequestId = null;       // FIX #4: dedup guard
let _currentAIAbort = null;           // FIX #15: abort controller
let _chatListenerRef = null;
let _chatListenerCb  = null;
let _typingListenerRef = null;
let _typingListenerCb  = null;
let _statusListenerRef = null;
let _statusListenerCb  = null;
let _satisfactionShown = false;
let _resolvedActive = false;
let _pageScrollLockY = 0;             // page scroll lock: saved Y position

// ==================== VALIDATORS / SANITIZERS ====================

// FIX #11: validate session id — must match "chat-<digits>"
function sanitizeSessionId(raw) {
  if (!raw || typeof raw !== 'string') return 'chat-' + Date.now();
  if (raw.length > MAX_SESSION_ID_LENGTH) return 'chat-' + Date.now();
  if (!SESSION_ID_REGEX.test(raw)) return 'chat-' + Date.now();
  return raw;
}

// FIX #11: email — trim, lowercase, enforce length + shape
function sanitizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return '';
  return trimmed;
}

// FIX #11: name — trim, strip control chars, enforce length
function sanitizeName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_NAME_LENGTH);
}

// FIX #1: precise quota classifier — inspect actual message
function classifyAIError(e) {
  const msg  = ((e && e.message) || String(e) || '').toLowerCase();
  const code = ((e && e.code) || '').toString().toUpperCase();

  // Daily quota — SPECIFIC indicators only
  const hasDailyQuota =
    msg.includes('generaterequestsperday') ||
    msg.includes('generaterequestsperdayperprojectpermodel') ||
    msg.includes('generate_content_free_tier_requests') ||
    msg.includes('perday') ||
    msg.includes('per day') ||
    (code === 'RESOURCE_EXHAUSTED' && msg.includes('daily')) ||
    (code === 'RESOURCE_EXHAUSTED' && msg.includes('quota') && msg.includes('day'));

  if (hasDailyQuota) return 'daily-quota';

  // Bridge-imposed timeout
  if (msg.includes('ai bridge timeout')) return 'timeout';

  // Transient server errors — one retry allowed
  if (
    msg.includes('high demand') ||
    msg.includes('internal') ||
    msg.includes(' 500 ') ||
    msg.includes('status 500') ||
    code === 'INTERNAL'
  ) {
    return 'transient';
  }

  // Temporary 429 / rate-limit that is NOT daily quota — one retry allowed
  if (code === 'RESOURCE_EXHAUSTED' || msg.includes('resource_exhausted')) return 'temporary-rate';

  return 'unknown';
}

// FIX #16: which categories are retryable
function isRetryable(kind) {
  return kind === 'transient' || kind === 'timeout' || kind === 'temporary-rate' || kind === 'unknown';
}

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

// ==================== PAGE SCROLL LOCK ====================
// Freezes the page behind the widget without losing scroll position.
// Uses position:fixed + saved Y so iOS/Android URL bars behave too.
function lockPageScroll() {
  _pageScrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.style.setProperty('position', 'fixed', 'important');
  document.body.style.setProperty('top', -_pageScrollLockY + 'px', 'important');
  document.body.style.setProperty('left', '0', 'important');
  document.body.style.setProperty('right', '0', 'important');
  document.body.style.setProperty('width', '100%', 'important');
  document.body.style.setProperty('overflow', 'hidden', 'important');
  document.documentElement.style.setProperty('overflow', 'hidden', 'important');
}

function unlockPageScroll() {
  document.body.style.removeProperty('position');
  document.body.style.removeProperty('top');
  document.body.style.removeProperty('left');
  document.body.style.removeProperty('right');
  document.body.style.removeProperty('width');
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  window.scrollTo(0, _pageScrollLockY);
}

// ==================== SCREEN CONTROL ====================
function toggleChat() {
  _ScreenDebug.ensurePanel();
  chatOpen = !chatOpen;
  const win = safeEl('chat-window');
  if (!win) { _ScreenDebug.err('UI', 'chat-window element not found'); return; }

  if (chatOpen) {
    win.classList.add('open');
    document.body.classList.add('chat-is-open');   // hides launcher via CSS
    lockPageScroll();                              // freeze page behind widget

    // Re-apply true full-screen sizing every time we open
    if (typeof window._forceChatFullScreen === 'function') {
      window._forceChatFullScreen();
    }

    _ScreenDebug.info('UI', 'Chat opened');
    const dot = safeEl('chat-unread-dot');
    if (dot) dot.style.display = 'none';

    showScreen('chat-messages');
    setHeaderIcon('ph-light ph-x');
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
    document.body.classList.remove('chat-is-open'); // launcher reappears
    unlockPageScroll();                             // restore page scroll

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
    // FIX #5: use textContent, not innerHTML/textContent on untrusted values
    if (nameEl)  nameEl.textContent  = customerName  || 'Guest';
    if (emailEl) emailEl.textContent = customerEmail || '';
    infoBar.style.display = 'flex';
  } else {
    infoBar.style.display = 'none';
  }
}

function showOrderLookup() {
  _ScreenDebug.info('UI', 'Order lookup screen');
  showScreen('order-lookup');
  const inputWrap = safeEl('chat-input-wrap');
  if (inputWrap) inputWrap.style.display = 'none';
  setHeaderIcon('ph-light ph-arrow-up-left');
  const resultEl = safeEl('order-result');
  if (resultEl) resultEl.innerHTML = '';
  const input = safeEl('order-lookup-input');
  if (input) setTimeout(() => input.focus(), 100);
}

function setHeaderIcon(iconClass) {
  const icon = safeEl('chat-header-icon');
  if (icon) icon.className = iconClass;
}

function handleHeaderButtonClick() {
  const orderLookup = safeEl('order-lookup');
  if (orderLookup && orderLookup.style.display !== 'none') {
    backToChat();
  } else {
    toggleChat();
  }
}

function backToChat() {
  _ScreenDebug.info('UI', 'Back to chat');
  showScreen('chat-messages');
  const inputWrap = safeEl('chat-input-wrap');
  if (inputWrap) inputWrap.style.display = 'flex';
  setHeaderIcon('ph-light ph-x');
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
    '<div style="margin-bottom:10px;font-weight:500;">'
    + 'Hi, I\'m the janedore Assistant. I can help with sizing, shipping, returns, product questions, or finding the right piece.'
    + '<br><br>'
    + 'Looking for an existing order? Track it below.'
    + '</div>'
    + '<button class="chat-pill-btn filled" id="ai-greeting-track-btn">Track Order</button>';
  el.appendChild(greeting);
  const trackBtn = document.getElementById('ai-greeting-track-btn');
  if (trackBtn) trackBtn.addEventListener('click', showOrderLookup);
}

// ==================== AI REPLY (STRICT RETRY + LOCKING) ====================
async function getAIReply(customerText) {
  const MAX_ATTEMPTS = 2;

  if (Date.now() < _aiDisabledUntil) {
    const secs = Math.ceil((_aiDisabledUntil - Date.now()) / 1000);
    _ScreenDebug.warn('AI', 'AI temporarily disabled — ' + _aiDisabledReason + ' (local cooldown, retry in ' + secs + 's)');
    return null;
  }

  if (!window._aiBridge) {
    _ScreenDebug.err('AI', 'Bridge not available on window._aiBridge');
    return null;
  }

  // FIX #3: in-flight lock
  if (_aiInFlight) {
    _ScreenDebug.warn('AI', 'Concurrent AI request blocked — previous request still in flight');
    return null;
  }

  // FIX #8: truncate input length
  const safeText = (customerText || '').slice(0, MAX_AI_INPUT_LENGTH);
  if (safeText.length < (customerText || '').length) {
    _ScreenDebug.warn('AI', 'AI input truncated to ' + MAX_AI_INPUT_LENGTH + ' chars');
  }

  // FIX #4: request id for dedup
  const requestId = 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  _currentAIRequestId = requestId;
  _aiInFlight = true;

  // FIX #15: AbortController for cancellation
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  _currentAIAbort = controller;

  try {
    let attempt = 1;
    while (attempt <= MAX_ATTEMPTS) {
      // FIX #15: if a newer request started or aborted, bail
      if (_currentAIRequestId !== requestId) {
        _ScreenDebug.warn('AI', 'Request ' + requestId + ' superseded — bailing');
        return null;
      }
      if (controller && controller.signal.aborted) {
        _ScreenDebug.warn('AI', 'Request ' + requestId + ' aborted');
        return null;
      }

      try {
        _ScreenDebug.ai('AI', 'Calling getReply attempt ' + attempt + '/' + MAX_ATTEMPTS + ' — textLength=' + safeText.length);
        const t0 = Date.now();
        const reply = await window._aiBridge.getReply('customer-support-chat', {
          customerText: safeText
        });
        const dt = Date.now() - t0;

        // FIX #15: check superseded before returning
        if (_currentAIRequestId !== requestId) {
          _ScreenDebug.warn('AI', 'Late reply discarded — request superseded');
          return null;
        }
        if (controller && controller.signal.aborted) {
          _ScreenDebug.warn('AI', 'Late reply discarded — aborted');
          return null;
        }

        if (!reply) {
          _ScreenDebug.warn('AI', 'Bridge returned null/empty after ' + dt + 'ms');
          return null;
        }

        _ScreenDebug.ok('AI', 'Reply in ' + dt + 'ms (' + reply.length + ' chars)');
        return reply;

      } catch (e) {
        const msg  = (e && e.message) || String(e);
        const code = (e && e.code) || '';
        const kind = classifyAIError(e);

        // FIX #9: don't log full message text — just length + classification
        _ScreenDebug.err('AI', 'Attempt ' + attempt + ' threw [' + code + ']: ' + msg);
        _ScreenDebug.info('AI', 'Classified as: ' + kind);

        if (kind === 'daily-quota') {
          _aiDisabledUntil  = Date.now() + (24 * 60 * 60 * 1000);
          _aiDisabledReason = 'daily free-tier quota exhausted';
          _ScreenDebug.err('AI', 'Daily quota exhausted — AI DISABLED for this session. No further retries. Local cooldown: 24h. Actual reset is controlled by Google.');
          _ScreenDebug.setStatus('AI quota hit', '#f66');
          return null;
        }

        if (!isRetryable(kind)) {
          _ScreenDebug.err('AI', 'Non-retryable error (' + kind + ') — stopping immediately.');
          return null;
        }

        if (attempt < MAX_ATTEMPTS) {
          const backoff = 1200;
          _ScreenDebug.warn('AI', 'Retrying once in ' + backoff + 'ms…');
          await new Promise(r => setTimeout(r, backoff));
          attempt++;
          continue;
        }

        _ScreenDebug.err('AI', 'Retry limit reached — no AI reply for this message. Leaving for admin.');
        return null;
      }
    }
    return null;
  } finally {
    // FIX #3: release lock only if this request owns it
    if (_currentAIRequestId === requestId) {
      _aiInFlight = false;
      _currentAIAbort = null;
      _currentAIRequestId = null;
    }
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
  _ScreenDebug.info('RTDB', 'Loading history for session ' + chatSessionId.slice(0, 20));

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

// FIX #5: sanitize all message rendering — no innerHTML with untrusted values
function appendMessage(m) {
  const el = safeEl('chat-messages');
  if (!el) return;

  // System messages — still use a pill, but textContent for text
  if (m.sender === 'system') {
    if (m.type === 'resolved') return;
    const pill = document.createElement('div');
    pill.style.cssText = 'text-align:center;padding:6px 0;width:100%;';
    const pillSpan = document.createElement('span');
    pillSpan.style.cssText = 'font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:400;';
    pillSpan.textContent = String(m.text || '');
    pill.appendChild(pillSpan);
    el.appendChild(pill);
    return;
  }

  const time = m.createdAt
    ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const isCustomer = m.sender === 'customer';

  const div = document.createElement('div');
  div.className = 'chat-msg ' + (isCustomer ? 'customer' : 'admin');

  // Sender name — sanitized, no @
  const rawName = (!isCustomer && m.senderName) ? String(m.senderName) : '';
  const safeName = (rawName && rawName.indexOf('@') === -1) ? rawName.slice(0, MAX_NAME_LENGTH) : 'Janedore';
  const showName = !isCustomer && rawName;

  if (showName) {
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size:9px;text-transform:uppercase;opacity:0.6;margin-bottom:3px;font-weight:500;';
    nameDiv.textContent = safeName;
    div.appendChild(nameDiv);
  }

  // Message text — textContent, never innerHTML
  const textNode = document.createElement('span');
  textNode.textContent = String(m.text || '');
  div.appendChild(textNode);

  // Timestamp
  const timeDiv = document.createElement('div');
  timeDiv.className = 'chat-msg-time';
  timeDiv.textContent = time;
  div.appendChild(timeDiv);

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

  // FIX #7: enforce customer message length
  let text = input.value.trim();
  if (text.length > MAX_CUSTOMER_MSG_LENGTH) {
    _ScreenDebug.warn('SEND', 'Message too long (' + text.length + ' chars). Truncating to ' + MAX_CUSTOMER_MSG_LENGTH);
    text = text.slice(0, MAX_CUSTOMER_MSG_LENGTH);
  }
  if (!text) return;

  // FIX #9: don't log full text — log length only
  _ScreenDebug.info('SEND', 'User sent message (length=' + text.length + ')');

  // FIX #3: block concurrent sends
  if (_aiInFlight) {
    _ScreenDebug.warn('SEND', 'Message blocked — AI request already in flight');
    return;
  }

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
      const pillSpan = document.createElement('span');
      pillSpan.style.cssText = 'font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:400;';
      pillSpan.textContent = 'Reopening chat…';
      pill.appendChild(pillSpan);
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
    } catch (_) {} // FIX #19: cart parsing silent catch is fine — optional data

    await rtdb.ref('/').update(updates);
    _ScreenDebug.ok('SEND', 'Customer message saved to RTDB');
    input.value = '';

    const reopenPill = document.getElementById('chat-reopening-pill');
    if (reopenPill) reopenPill.remove();

    input.disabled = false;
    input.placeholder = 'Type your message...';
    _satisfactionShown = false;
    _resolvedActive = false;

    // FIX #14: customer message is already saved — AI failure never blocks it
    if (!customerWantsHuman(text)) {
      _ScreenDebug.ai('AI', 'Attempting AI reply…');
      const aiText = await getAIReply(text);

      if (aiText) {
        _ScreenDebug.info('SEND', 'Writing AI reply to RTDB');

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
        _ScreenDebug.warn('SEND', 'No AI reply — message already saved, leaving for admin');
      }
    } else {
      _ScreenDebug.info('SEND', 'Customer requested human — AI skipped by design');
    }
  } catch (e) {
    // FIX #19: never swallow message-write failures
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
  const span = document.createElement('span');
  span.style.cssText = 'font-size:10px;color:#888;background:#f5f5f5;padding:3px 12px;border-radius:20px;font-family:Manrope,sans-serif;font-weight:400;';
  span.textContent = 'Resolved.';
  banner.appendChild(span);
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

  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '10px';
  msgDiv.textContent = 'We\'re glad we could help. Was your issue resolved?';
  prompt.appendChild(msgDiv);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '8px';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'chat-pill-btn';
  yesBtn.id = 'sat-yes';
  yesBtn.textContent = 'Yes';
  yesBtn.addEventListener('click', function () { submitSatisfaction(true); });

  const noBtn = document.createElement('button');
  noBtn.className = 'chat-pill-btn';
  noBtn.id = 'sat-no';
  noBtn.textContent = 'Not really';
  noBtn.addEventListener('click', function () { submitSatisfaction(false); });

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  prompt.appendChild(btnRow);

  el.appendChild(prompt);
  el.scrollTop = el.scrollHeight;
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
  const thanksText = document.createElement('div');
  thanksText.textContent = satisfied
    ? 'Thank you for letting us know. We hope to see you again soon.'
    : 'We\'re sorry to hear that. A member of the Janedore team will follow up with you shortly.';
  thanks.appendChild(thanksText);
  el.appendChild(thanks);
  el.scrollTop = el.scrollHeight;
}

// ==================== ORDER LOOKUP ====================
// FIX #6: build result with textContent, not innerHTML
async function lookupOrder() {
  const db = getFirestore();
  const input = safeEl('order-lookup-input');
  const resultEl = safeEl('order-result');
  if (!db || !input || !resultEl) return;

  const orderNum = input.value.trim().toUpperCase();
  if (!orderNum) {
    resultEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#888;margin-top:12px;';
    msg.textContent = 'Please enter an order number';
    resultEl.appendChild(msg);
    return;
  }

  resultEl.innerHTML = '';
  const searching = document.createElement('div');
  searching.style.cssText = 'color:#888;margin-top:12px;';
  searching.textContent = 'Searching...';
  resultEl.appendChild(searching);

  _ScreenDebug.info('FS', 'Order lookup requested');

  try {
    const snap = await db.collection('orders')
      .where('orderNumber', '==', orderNum).limit(1).get();

    resultEl.innerHTML = '';

    if (snap.empty) {
      _ScreenDebug.warn('FS', 'No matching order');
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:16px;color:#888;line-height:1.8;';

      const l1 = document.createElement('div');
      l1.style.cssText = "font-family:'Manrope',sans-serif;font-size:12px;font-weight:400;";
      l1.textContent = 'No order found';

      const l2 = document.createElement('div');
      l2.style.cssText = "font-family:'Manrope',sans-serif;font-size:10px;font-weight:400;margin-top:4px;opacity:0.7;";
      l2.textContent = 'Check your order number and try again';

      wrap.appendChild(l1);
      wrap.appendChild(l2);
      resultEl.appendChild(wrap);
      return;
    }

    _ScreenDebug.ok('FS', 'Order found');
    const o = snap.docs[0].data();
    const date = o.createdAt
      ? new Date(o.createdAt.seconds * 1000).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    const status = (o.status || 'pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1);

    // FIX #6: build each row with textContent for Firestore-controlled values
    const container = document.createElement('div');
    container.style.cssText = "margin-top:20px;width:100%;text-align:left;font-family:'Manrope',sans-serif;line-height:1.8;";

    const header = document.createElement('div');
    header.style.cssText = 'font-size:9px;color:#111;margin-bottom:12px;border-bottom:0.5px solid #e5e5e5;padding-bottom:8px;font-weight:600;';
    header.textContent = 'Order Details';
    container.appendChild(header);

    const rows = [
      ['Order',  '#' + String(o.orderNumber || snap.docs[0].id || '')],
      ['Status', String(status)],
      ['Items',  String(o.items?.length || o.itemCount || 0)],
      ['Total',  'R' + Number(o.subtotal || o.total || 0).toLocaleString()],
      ['Date',   String(date)]
    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;font-weight:400;margin-bottom:6px;';

      const labelEl = document.createElement('span');
      labelEl.style.color = '#888';
      labelEl.textContent = label;

      const valueEl = document.createElement('span');
      valueEl.style.color = '#111';
      valueEl.textContent = value;

      row.appendChild(labelEl);
      row.appendChild(valueEl);
      container.appendChild(row);
    });

    resultEl.appendChild(container);
  } catch (e) {
    _ScreenDebug.err('FS', 'Lookup failed: ' + (e.code || '') + ' ' + e.message);
    resultEl.innerHTML = '';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color:#c00;font-size:11px;font-weight:400;margin-top:16px;';
    errDiv.textContent = 'Unable to look up order. Please try again.';
    resultEl.appendChild(errDiv);
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

// ============================================================
// CHAT WIDGET — TRUE FULL SCREEN FIX
// Neutralizes ancestor CSS that traps position:fixed, and
// forces #chat-window to cover the exact viewport on open,
// resize, and orientation change. Self-contained — no other
// file needs to change.
// ============================================================
(function () {
  'use strict';

  function stripTraps(el) {
    if (!el || !el.style) return;
    el.style.setProperty('position', 'static', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('filter', 'none', 'important');
    el.style.setProperty('perspective', 'none', 'important');
    el.style.setProperty('contain', 'none', 'important');
    el.style.setProperty('will-change', 'auto', 'important');
  }

  function fixAncestors(startEl) {
    let el = startEl;
    while (el && el !== document.documentElement) {
      stripTraps(el);
      el = el.parentElement;
    }
  }

  function forceFullScreen() {
    const win = document.getElementById('chat-window');
    if (!win) return;

    fixAncestors(win.parentElement);

    const vw = window.innerWidth  || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    win.style.setProperty('position', 'fixed', 'important');
    win.style.setProperty('top', '0', 'important');
    win.style.setProperty('left', '0', 'important');
    win.style.setProperty('right', '0', 'important');
    win.style.setProperty('bottom', '0', 'important');
    win.style.setProperty('width', vw + 'px', 'important');
    win.style.setProperty('height', vh + 'px', 'important');
    win.style.setProperty('max-width', vw + 'px', 'important');
    win.style.setProperty('max-height', vh + 'px', 'important');
    win.style.setProperty('margin', '0', 'important');
    win.style.setProperty('border-radius', '0', 'important');
  }

  function onResize() {
    const win = document.getElementById('chat-window');
    if (win && win.classList.contains('open')) {
      forceFullScreen();
    }
  }

  // Widget HTML is injected asynchronously — watch for it to appear.
  const observer = new MutationObserver(function () {
    if (document.getElementById('chat-window')) {
      forceFullScreen();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forceFullScreen);
  } else {
    forceFullScreen();
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () {
    setTimeout(onResize, 150);
  });

  // Expose so toggleChat() can re-apply on every open
  window._forceChatFullScreen = forceFullScreen;
})();
