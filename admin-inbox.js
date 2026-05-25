(function () {
  'use strict';

  if (!window._adminDB) return;

  var rtdb       = window._adminRTDB;
  var CHAT_ROOT  = window._CHAT_ROOT;
  var esc        = window._esc;
  var safeEl     = window._safeEl;
  var fmtTime    = window._fmtTime;
  var fmtDateShort = window._fmtDateShort;
  var showToast  = window._showToast;
  var avatarClass   = window._avatarClass;
  var avatarInitials= window._avatarInitials;
  var QUICK_REPLIES = window._QUICK_REPLIES;
  var ordersRef  = window._ordersRef;

  var activeChatSession   = null;
  var chatMsgRef          = null;
  var chatMsgCallback     = null;
  var chatTypingRef       = null;
  var chatTypingCallback  = null;

  window._activeChatSession = null;

  function detachActiveChatListeners() {
    if (chatMsgRef && chatMsgCallback) {
      chatMsgRef.off('value', chatMsgCallback);
      chatMsgRef = null;
      chatMsgCallback = null;
    }
    if (chatTypingRef && chatTypingCallback) {
      chatTypingRef.off('value', chatTypingCallback);
      chatTypingRef = null;
      chatTypingCallback = null;
    }
    if (window._adminTypingTimeout) {
      clearTimeout(window._adminTypingTimeout);
      window._adminTypingTimeout = null;
    }
  }
  window._detachActiveChatListeners = detachActiveChatListeners;

  function markSessionAsRead(sessionId) {
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').once('value').then(function(snap) {
      var updates = {};
      snap.forEach(function(child) {
        var msg = child.val();
        if (msg && msg.sender === 'customer' && msg.read === false)
          updates[child.key + '/read'] = true;
      });
      if (Object.keys(updates).length > 0) {
        rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').update(updates)
          .catch(function(e){ console.error('[CHAT_MARK_READ]', e); });
      }
    }).catch(function(e){ console.error('[CHAT_MARK_READ_FETCH]', e); });
  }

  function renderChatMessages(messages) {
    var panel = safeEl('chat-messages-panel');
    if (!panel) return;
    var wasAtBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 40;
    panel.innerHTML = '';
    if (!messages || messages.length === 0) {
      panel.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:24px;">No messages yet.</div>';
      return;
    }
    messages.forEach(function(m) {
      var time    = m.createdAt ? fmtTime(m.createdAt) : '';
      var isAdmin = m.sender !== 'customer';
      var div     = document.createElement('div');
      div.className = 'chat-msg-admin' + (isAdmin ? '' : ' customer-msg');
      div.innerHTML =
        '<div class="chat-bubble">' + esc(m.text) + '</div>' +
        '<div class="msg-meta">' + esc(m.sender||'') + ' - ' + esc(time) + '</div>';
      panel.appendChild(div);
    });
    if (wasAtBottom) panel.scrollTop = panel.scrollHeight;
  }

  /* ─────────────────────────────────────────────────────────
     RENDER INBOX TAB
  ───────────────────────────────────────────────────────── */
  window._renderMessagesTab = function() {
    var mc = safeEl('main-content');
    if (!mc) return;

    activeChatSession = null;
    window._activeChatSession = null;
    detachActiveChatListeners();

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Inbox</div>' +
        '<div class="section-actions">' +
          '<input class="search-input" id="chat-search" placeholder="Search sessions..." oninput="window._filterChatSessions()" style="min-width:140px;max-width:200px;">' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
        '<button id="chat-tab-all"    class="btn btn-sm btn-primary" onclick="window._setChatTab(\'all\')"   >All</button>' +
        '<button id="chat-tab-unread" class="btn btn-sm btn-ghost"   onclick="window._setChatTab(\'unread\')">Unread</button>' +
        '<button id="chat-tab-pinned" class="btn btn-sm btn-ghost"   onclick="window._setChatTab(\'pinned\')">Pinned</button>' +
      '</div>' +
      '<div id="chat-sessions-wrap">' +
        '<div class="empty-state"><div class="empty-state-icon">✉</div><div class="empty-state-text">Loading sessions...</div></div>' +
      '</div>';

    window._chatFilterTab = 'all';

    rtdb.ref(CHAT_ROOT).limitToLast(100).once('value').then(function(snap) {
      window._chatSessionsData = {};
      snap.forEach(function(sessionSnap) {
        var sessionId    = sessionSnap.key;
        var messagesSnap = sessionSnap.child('messages');
        var metaSnap     = sessionSnap.child('meta');
        if (!messagesSnap.exists()) return;
        var meta = metaSnap.val() || {};
        window._chatSessionsData[sessionId] = {
          messages: [], lastTime: 0, unreadCount: 0, pinned: meta.pinned || false
        };
        messagesSnap.forEach(function(msgSnap) {
          var msg = msgSnap.val();
          if (!msg) return;
          window._chatSessionsData[sessionId].messages.push(msg);
          var msgTime = msg.createdAt || 0;
          if (msgTime > window._chatSessionsData[sessionId].lastTime)
            window._chatSessionsData[sessionId].lastTime = msgTime;
          if (msg.sender === 'customer' && msg.read === false)
            window._chatSessionsData[sessionId].unreadCount++;
        });
      });
      renderChatSessionsList(window._chatSessionsData);
    }).catch(function(e) {
      console.error('[MESSAGES_TAB]', e);
      var wrap = safeEl('chat-sessions-wrap');
      if (wrap) wrap.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: ' + esc(e.message) + '</p>';
    });
  };

  window._setChatTab = function(tab) {
    window._chatFilterTab = tab;
    ['all','unread','pinned'].forEach(function(t) {
      var btn = safeEl('chat-tab-' + t);
      if (btn) btn.className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-ghost');
    });
    if (window._chatSessionsData) renderChatSessionsList(window._chatSessionsData);
  };

  function renderChatSessionsList(sessions) {
    var filter   = window._chatFilterTab || 'all';
    var searchEl = safeEl('chat-search');
    var search   = searchEl ? (searchEl.value || '').toLowerCase() : '';

    var sessionIds = Object.keys(sessions).sort(function(a,b) {
      if (sessions[b].pinned && !sessions[a].pinned) return 1;
      if (sessions[a].pinned && !sessions[b].pinned) return -1;
      return (sessions[b].lastTime||0) - (sessions[a].lastTime||0);
    }).filter(function(sid) {
      var s = sessions[sid];
      if (filter === 'unread' && s.unreadCount === 0) return false;
      if (filter === 'pinned' && !s.pinned) return false;
      if (search && sid.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    var wrap = safeEl('chat-sessions-wrap');
    if (!wrap) return;

    if (sessionIds.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✉</div><div class="empty-state-text">No sessions found.</div></div>';
      return;
    }

    wrap.innerHTML =
      '<div class="chat-sessions-wrap">' +
      sessionIds.map(function(sid) {
        var s       = sessions[sid];
        var msgs    = s.messages;
        var lastMsg = msgs[msgs.length-1];
        var preview = ((lastMsg && lastMsg.text) || '').substring(0,70);
        var time    = s.lastTime ? fmtDateShort(s.lastTime) : '';
        var avClass = avatarClass(sid);
        var avInit  = avatarInitials(sid);

        return '<div class="chat-session-card ' + (s.unreadCount>0?'unread':'') + '" onclick="window._openChatSession(\'' + esc(sid) + '\')">' +
          '<div class="chat-avatar ' + avClass + '">' + avInit + '</div>' +
          '<div class="session-info">' +
            '<div class="session-id-label">' + esc(sid.substring(0,22)) + '</div>' +
            '<div class="session-preview">' + esc(preview) + (preview.length>=70?'...':'') + '</div>' +
          '</div>' +
          '<div class="session-right">' +
            '<span class="session-time">' + esc(time) + '</span>' +
            (s.unreadCount > 0
              ? '<span class="session-unread-count">' + s.unreadCount + '</span>'
              : (s.pinned ? '<span class="badge badge-processing" style="font-size:9px;">Pinned</span>' : '')) +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>';
  }

  window._filterChatSessions = function() {
    if (window._chatSessionsData) renderChatSessionsList(window._chatSessionsData);
  };

  /* ─────────────────────────────────────────────────────────
     OPEN CHAT SESSION
  ───────────────────────────────────────────────────────── */
  window._openChatSession = function(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return;
    activeChatSession = sessionId;
    window._activeChatSession = sessionId;
    detachActiveChatListeners();
    markSessionAsRead(sessionId);

    var mc = safeEl('main-content');
    if (!mc) return;

    var sid      = esc(sessionId);
    var shortId  = esc(sessionId.substring(0, 26));
    var avClass  = avatarClass(sessionId);
    var avInit   = avatarInitials(sessionId);

    mc.innerHTML =
      '<button class="back-link" onclick="switchTab(\'messages\')">Back to Inbox</button>' +
      '<div class="section-header">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="chat-avatar ' + avClass + '" style="width:36px;height:36px;font-size:12px;">' + avInit + '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:500;">' + shortId + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:1px;">Live Session</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="window._pinChatSession(\'' + sid + '\')">Pin</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="window._lookupOrderInChat(\'' + sid + '\')">Orders</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr;gap:12px;">' +
        '<div class="chat-view-wrap">' +
          '<div class="chat-messages-panel" id="chat-messages-panel">' +
            '<div style="text-align:center;color:var(--muted);font-size:11px;padding:24px;">Loading messages...</div>' +
          '</div>' +
          '<div class="typing-indicator" id="typing-indicator">Customer is typing...</div>' +
          '<div class="quick-replies" id="quick-replies-row">' +
            QUICK_REPLIES.map(function(r) {
              return '<button class="quick-reply-btn" onclick="window._applyQuickReply(\'' + sid + '\',\'' + esc(r) + '\')">' + esc(r) + '</button>';
            }).join('') +
          '</div>' +
          '<div class="reply-box">' +
            '<input id="reply-input-' + sid + '" placeholder="Write a reply..." ' +
              'onkeypress="if(event.key===\'Enter\')window._sendAdminReply(\'' + sid + '\')" ' +
              'oninput="window._handleAdminTyping(\'' + sid + '\')">' +
            '<button class="chat-send-btn" onclick="window._sendAdminReply(\'' + sid + '\')" title="Send">Send</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div class="card">' +
            '<div class="card-header"><span class="card-title">Customer Info</span></div>' +
            '<div style="padding:12px 14px;">' +
              '<div class="info-row" style="background:none;border:none;padding:4px 0;"><span class="label">Session</span><span style="font-size:10.5px;">' + esc(sessionId.substring(0,14)) + '</span></div>' +
              '<div class="info-row" style="background:none;border:none;padding:4px 0;"><span class="label">Status</span><span style="color:var(--success);">Active</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-header"><span class="card-title">Support Notes</span></div>' +
            '<div style="padding:12px 14px;">' +
              '<textarea id="chat-note-' + sid + '" style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:Manrope,sans-serif;font-size:11.5px;font-weight:300;min-height:60px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;" placeholder="Internal notes..."></textarea>' +
              '<button class="btn btn-sm btn-ghost" style="margin-top:7px;width:100%;" onclick="window._saveChatNote(\'' + sid + '\')">Save Note</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    chatMsgRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').limitToLast(200);
    chatMsgCallback = function(snapshot) {
      var messages = [];
      snapshot.forEach(function(child) {
        messages.push(Object.assign({ _key: child.key }, child.val()));
      });
      messages.sort(function(a, b){ return (a.createdAt||0) - (b.createdAt||0); });
      renderChatMessages(messages);
    };
    chatMsgRef.on('value', chatMsgCallback, function(err) {
      console.error('[CHAT_MSG_LISTENER]', err);
    });

    chatTypingRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/customerTyping');
    chatTypingCallback = function(snapshot) {
      var indicator = safeEl('typing-indicator');
      if (indicator) indicator.style.display = snapshot.val() === true ? 'block' : 'none';
    };
    chatTypingRef.on('value', chatTypingCallback, function(err) {
      console.error('[CHAT_TYPING_LISTENER]', err);
    });

    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminNote').once('value').then(function(snap) {
      var noteEl = safeEl('chat-note-' + sessionId);
      if (noteEl && snap.val()) noteEl.value = snap.val();
    }).catch(function(e){ console.error('[CHAT_NOTE_FETCH]', e); });
  };

  window._sendAdminReply = function(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return;
    var input = safeEl('reply-input-' + sessionId);
    var text  = input && input.value && input.value.trim();
    if (!text) return;

    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping').set(false).catch(function(e){
      console.error('[CHAT_TYPING_CLEAR]', e);
    });

    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').push({
      text:      text,
      sender:    'admin',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      read:      true,
      sessionId: sessionId
    }).then(function() {
      if (input) input.value = '';
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta').update({
        lastMessage:   text,
        lastMessageAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(e){ console.error('[CHAT_META_UPDATE]', e); });
    }).catch(function(e) {
      console.error('[CHAT_SEND]', e);
      showToast('Error: ' + e.message, 'error');
    });
  };

  window._handleAdminTyping = function(sessionId) {
    if (!sessionId) return;
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping').set(true)
      .catch(function(e){ console.error('[CHAT_TYPING_SET]', e); });
    if (window._adminTypingTimeout) clearTimeout(window._adminTypingTimeout);
    window._adminTypingTimeout = setTimeout(function() {
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping').set(false)
        .catch(function(e){ console.error('[CHAT_TYPING_RESET]', e); });
      window._adminTypingTimeout = null;
    }, 3000);
  };

  window._applyQuickReply = function(sessionId, text) {
    var input = safeEl('reply-input-' + sessionId);
    if (input) { input.value = text; input.focus(); }
  };

  window._saveChatNote = function(sessionId) {
    if (!sessionId) return;
    var noteEl = safeEl('chat-note-' + sessionId);
    if (!noteEl) return;
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminNote').set(noteEl.value)
      .then(function(){ showToast('Note saved'); })
      .catch(function(e) {
        console.error('[CHAT_NOTE_SAVE]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._pinChatSession = function(sessionId) {
    if (!sessionId) return;
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/pinned').set(true)
      .then(function(){ showToast('Chat pinned'); })
      .catch(function(e) {
        console.error('[CHAT_PIN]', e);
        showToast('Error: ' + e.message, 'error');
      });
  };

  window._lookupOrderInChat = function(sessionId) {
    ordersRef.where('chatSessionId','==', sessionId).limit(10).get()
      .then(function(snap) {
        if (snap.empty) { showToast('No orders linked to this chat', 'info'); return; }
        showToast('Found ' + snap.size + ' order(s)', 'info');
      }).catch(function(e){ console.error('[CHAT_ORDER_LOOKUP]', e); });
  };

})();
