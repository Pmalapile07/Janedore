// ==================== JANEDORE CHAT — REALTIME DATABASE ====================
// Production-ready. Firebase only initializes once (in main HTML).
// This file assumes firebase, db (Firestore), rtdb (Realtime DB) are
// already initialized globally before this script is loaded.

(function () {
  'use strict';

  // ── Session state ────────────────────────────────────────────────
  var chatSessionId = localStorage.getItem('janedore_chat_session') || ('chat-' + Date.now());
  localStorage.setItem('janedore_chat_session', chatSessionId);
  var customerEmail = (localStorage.getItem('janedore_chat_email') || '').toLowerCase().trim();
  var customerName  = localStorage.getItem('janedore_chat_name') || '';
  var chatOpen      = false;
  var chatMsgUnsub  = null; // .off() handle for RTDB messages listener
  var chatTypingUnsub = null; // .off() handle for RTDB typing listener
  var isSending     = false;
  var typingTimeout = null;
  var messagesRef   = null; // cached RTDB ref for current session
  var typingRef     = null; // cached RTDB ref for current session typing

  // ── Safe DOM helpers ─────────────────────────────────────────────
  function safeEl(id) { return document.getElementById(id) || null; }
  function setDisplay(id, value) {
    var el = safeEl(id);
    if (el) el.style.display = value;
  }
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Wait for Firebase to be ready ───────────────────────────────
  // Polls until window.rtdb and window.db are available (set by main HTML).
  function waitForFirebase(cb) {
    if (window.rtdb && window.db) { cb(); return; }
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      if (window.rtdb && window.db) {
        clearInterval(poll);
        cb();
      } else if (attempts > 50) {
        clearInterval(poll);
        console.error('[JANEDORE CHAT] Firebase not initialized after 5s.');
      }
    }, 100);
  }

  // ── Auth state listener ─────────────────────────────────────────
  function initAuthListener() {
    if (!window.firebase || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(function (user) {
      if (user && !user.isAnonymous && user.email) {
        customerEmail = user.email.trim().toLowerCase();
        customerName  = user.displayName || '';
        localStorage.setItem('janedore_chat_email', customerEmail);
        if (user.displayName) localStorage.setItem('janedore_chat_name', customerName);
        chatSessionId = 'chat-' + customerEmail.replace(/[^a-zA-Z0-9]/g, '-');
        localStorage.setItem('janedore_chat_session', chatSessionId);
        if (chatOpen) showOptionsScreen();
      }
    });
  }

  // ── Open / Close ─────────────────────────────────────────────────
  window.toggleChat = function () {
    chatOpen = !chatOpen;
    var win = safeEl('chat-window');
    if (!win) return;
    win.classList.toggle('open', chatOpen);
    if (chatOpen) {
      setDisplay('chat-unread-dot', 'none');
      if (customerEmail) showOptionsScreen();
      else showEmailScreen();
    } else {
      detachChatListeners();
    }
  };

  // ── Listener cleanup ────────────────────────────────────────────
  function detachChatListeners() {
    if (messagesRef && chatMsgUnsub !== null) {
      messagesRef.off('value', chatMsgUnsub);
      chatMsgUnsub = null;
    }
    if (typingRef && chatTypingUnsub !== null) {
      typingRef.off('value', chatTypingUnsub);
      chatTypingUnsub = null;
    }
    clearTimeout(typingTimeout);
  }

  // ── Screens ──────────────────────────────────────────────────────
  function showEmailScreen() {
    setDisplay('chat-email-screen', 'flex');
    setDisplay('chat-options',      'none');
    setDisplay('chat-messages',     'none');
    setDisplay('chat-input-wrap',   'none');
    setDisplay('chat-customer-info','none');
    setDisplay('order-lookup',      'none');
  }

  function showOptionsScreen() {
    setDisplay('chat-email-screen', 'none');
    setDisplay('chat-options',      'flex');
    setDisplay('chat-messages',     'none');
    setDisplay('chat-input-wrap',   'none');
    setDisplay('chat-customer-info','none');
    setDisplay('order-lookup',      'none');
  }

  window.submitEmail = function () {
    var inputEl = safeEl('chat-email-input');
    var errorEl = safeEl('chat-email-error');
    if (!inputEl) return;
    var email = inputEl.value.trim().toLowerCase();
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
  };

  window.startChat = function () {
    setDisplay('chat-email-screen', 'none');
    setDisplay('chat-options',      'none');
    setDisplay('chat-messages',     'flex');
    setDisplay('chat-input-wrap',   'flex');
    setDisplay('chat-customer-info','flex');
    setDisplay('order-lookup',      'none');
    var emailEl = safeEl('chat-customer-email');
    if (emailEl) emailEl.textContent = escapeHtml(customerEmail);
    listenChat();
    var inputEl = safeEl('chat-input');
    if (inputEl) setTimeout(function () { inputEl.focus(); }, 50);
  };

  // ── Listen to RTDB messages ──────────────────────────────────────
  function listenChat() {
    if (!window.rtdb) {
      console.error('[JANEDORE CHAT] rtdb not available');
      return;
    }

    // Detach any existing listeners before reattaching
    detachChatListeners();

    var el = safeEl('chat-messages');
    if (el) {
      el.innerHTML = '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>';
    }

    messagesRef = window.rtdb.ref('chats/' + chatSessionId + '/messages');
    typingRef   = window.rtdb.ref('chats/' + chatSessionId + '/typing');

    // Messages listener — store the callback ref for cleanup
    chatMsgUnsub = function (snapshot) {
      var messages = [];
      snapshot.forEach(function (child) {
        messages.push(Object.assign({ _key: child.key }, child.val()));
      });
      messages.sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
      renderMessages(messages);
    };
    messagesRef.on('value', chatMsgUnsub, function (err) {
      console.warn('[JANEDORE CHAT] messages listener error:', err.message);
    });

    // Typing listener
    chatTypingUnsub = function (snapshot) {
      var data = snapshot.val();
      var indicator = safeEl('chat-typing-indicator');
      if (indicator) {
        var show = !!(data && data.admin);
        indicator.style.display = show ? 'block' : 'none';
        if (show) indicator.textContent = 'JANEDORE is typing...';
      }
    };
    typingRef.on('value', chatTypingUnsub, function (err) {
      console.warn('[JANEDORE CHAT] typing listener error:', err.message);
    });
  }

  // ── Render messages ──────────────────────────────────────────────
  function renderMessages(messages) {
    var el = safeEl('chat-messages');
    if (!el) return;
    var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;

    // Remove optimistic messages and real message divs
    el.querySelectorAll('.chat-msg').forEach(function (n) { n.remove(); });
    var welcome = el.querySelector('.chat-welcome');

    if (messages.length === 0) {
      if (!welcome) {
        el.insertAdjacentHTML('afterbegin', '<div class="chat-welcome"><strong>Welcome to JANEDORE</strong>Ask us anything — sizing, styling, shipping.</div>');
      }
      return;
    }

    if (welcome) welcome.remove();

    messages.forEach(function (m) {
      var time = m.timestamp
        ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      var div = document.createElement('div');
      div.className = 'chat-msg ' + (m.sender || 'customer');
      div.innerHTML = escapeHtml(m.text || '') + '<div class="chat-msg-time">' + time + '</div>';
      el.appendChild(div);

      if (!chatOpen && m.sender === 'admin') {
        var dot = safeEl('chat-unread-dot');
        if (dot) dot.style.display = 'block';
      }
    });

    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  // ── Send message ─────────────────────────────────────────────────
  window.sendChatMessage = function () {
    if (!window.rtdb) {
      console.error('[JANEDORE CHAT] rtdb not available for send');
      return;
    }
    var input = safeEl('chat-input');
    if (!input || isSending) return;
    var text = input.value.trim();
    if (!text) return;

    isSending = true;
    input.disabled = true;
    input.placeholder = 'Sending...';

    // Clear typing state
    clearTimeout(typingTimeout);
    if (typingRef) {
      typingRef.set({ customer: false }).catch(function () {});
    }

    input.value = '';

    var msgRef = window.rtdb.ref('chats/' + chatSessionId + '/messages');
    msgRef.push({
      text: text,
      sender: 'customer',
      customerEmail: customerEmail,
      customerName: customerName,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      read: false
    }).then(function () {
      // listener will update UI — nothing needed here
    }).catch(function (e) {
      console.warn('[JANEDORE CHAT] send error:', e.message);
      input.value = text; // restore on failure
      var el = safeEl('chat-messages');
      if (el) {
        var errDiv = document.createElement('div');
        errDiv.className = 'chat-msg system';
        errDiv.textContent = 'Message failed. Please try again.';
        el.appendChild(errDiv);
      }
    }).finally(function () {
      input.disabled = false;
      input.placeholder = 'Type a message...';
      setTimeout(function () { if (input) input.focus(); }, 50);
      isSending = false;
    });
  };

  // ── Typing indicator ─────────────────────────────────────────────
  window.handleCustomerTyping = function () {
    if (!typingRef) return;
    typingRef.set({ customer: true }).catch(function () {});
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function () {
      if (typingRef) typingRef.set({ customer: false }).catch(function () {});
    }, 3000);
  };

  // ── Order Lookup ─────────────────────────────────────────────────
  window.showOrderLookup = function () {
    setDisplay('chat-email-screen', 'none');
    setDisplay('chat-options',      'none');
    setDisplay('chat-messages',     'none');
    setDisplay('chat-input-wrap',   'none');
    setDisplay('chat-customer-info','none');
    setDisplay('order-lookup',      'flex');
    var resultEl = safeEl('order-result');
    if (resultEl) resultEl.innerHTML = '';
  };

  window.lookupOrder = function () {
    if (!window.db) {
      console.error('[JANEDORE CHAT] Firestore db not available for order lookup');
      return;
    }
    var resultEl  = safeEl('order-result');
    var inputEl   = safeEl('order-lookup-input');
    if (!resultEl) return;

    var rawOrderNumber = ((inputEl && inputEl.value) || '').trim().toUpperCase();
    if (!rawOrderNumber) {
      resultEl.innerHTML = '<p style="color:#888;">Please enter your order number.</p>';
      return;
    }
    if (!customerEmail) {
      resultEl.innerHTML = '<p style="color:#888;">No email on file. Please restart the chat.</p>';
      return;
    }
    resultEl.textContent = 'Searching...';

    window.db.collection('orders')
      .where('customerEmail', '==', customerEmail)
      .get()
      .then(function (snap) {
        var orders = [];
        snap.docs.forEach(function (d) {
          var data = d.data();
          var orderNum = (data.orderNumber || '').toUpperCase();
          var cleanInput = rawOrderNumber.replace('ORD-', '');
          if (orderNum.includes(rawOrderNumber) || rawOrderNumber.includes(orderNum.replace('ORD-', '')) || orderNum.includes(cleanInput)) {
            orders.push(Object.assign({ _id: d.id }, data));
          }
        });
        if (orders.length === 0) {
          resultEl.innerHTML = '<p style="color:#888;">No order found. Check the order number.</p>';
          return;
        }
        var o    = orders[0];
        var date = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        resultEl.innerHTML =
          '<p style="margin-bottom:12px;font-size:10px;">Order found</p>' +
          '<div style="padding:10px;background:#fafaf9;text-align:left;font-size:10px;line-height:1.6;">' +
          '<strong>Order #' + escapeHtml(o.orderNumber || o._id.substring(0, 12)) + '</strong><br>' +
          'Status: ' + escapeHtml(o.status || 'pending') + '<br>' +
          'Items: ' + escapeHtml(String(o.itemCount || 0)) + ' · Total: R' + escapeHtml(String(o.subtotal || o.total || 0)) + '<br>' +
          'Date: ' + escapeHtml(date) +
          '</div>';
      })
      .catch(function (e) {
        console.warn('[JANEDORE CHAT] order lookup error:', e.message);
        resultEl.innerHTML = '<p style="color:#888;">No order found.</p>';
      });
  };

  window.backToChatOptions = function () { showOptionsScreen(); };

  window.clearChatSession = function () {
    detachChatListeners();
    messagesRef = null;
    typingRef   = null;
    localStorage.removeItem('janedore_chat_email');
    localStorage.removeItem('janedore_chat_name');
    customerEmail = '';
    customerName  = '';
    chatSessionId = 'chat-' + Date.now();
    localStorage.setItem('janedore_chat_session', chatSessionId);
    var el = safeEl('chat-messages');
    if (el) el.innerHTML = '';
    showEmailScreen();
  };

  // ── Bootstrap ────────────────────────────────────────────────────
  waitForFirebase(initAuthListener);

})();
