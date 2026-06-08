(function () {
  'use strict';

  function initWhenReady(attempts) {
    attempts = attempts || 0;
    if (window._adminDB && window._adminRTDB) {
      initInbox();
      console.log('[admin-inbox] Initialized successfully');
    } else if (attempts < 50) {
      setTimeout(function() { initWhenReady(attempts + 1); }, 200);
    } else {
      console.error('[admin-inbox] Failed to initialize - dependencies missing');
    }
  }

  function initInbox() {

  var rtdb           = window._adminRTDB;
  var CHAT_ROOT      = window._CHAT_ROOT      || 'live_chat';
  var INBOX_ROOT     = window._CHAT_INBOX_ROOT || 'chat_inbox';
  var ordersRef      = window._ordersRef;
  var esc            = window._esc;
  var safeEl         = window._safeEl;
  var fmtTime        = window._fmtTime;
  var fmtDateShort   = window._fmtDateShort;
  var showToast      = window._showToast;
  var avatarClass    = window._avatarClass;
  var avatarInitials = window._avatarInitials;
  var QUICK_REPLIES  = window._QUICK_REPLIES || [];

  // ── Notification sound (Web Audio API — iOS PWA safe) ───────────
  var _audioCtx = null;

  // iOS requires AudioContext to be created AND resumed inside a user gesture.
  // We create it on the first tap anywhere, then reuse it for every ping.
  function _unlockAudio() {
    if (_audioCtx) return;
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = _audioCtx.createBuffer(1, 1, 22050);
      var src = _audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_audioCtx.destination);
      src.start(0);
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume().catch(function () {});
      }
    } catch (_) {}
  }
  document.addEventListener('touchstart', _unlockAudio, { once: true });
  document.addEventListener('mousedown',  _unlockAudio, { once: true });

  function _playNotifSound() {
    try {
      if (!_audioCtx) return;
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume().catch(function () {});
      }
      var oscillator = _audioCtx.createOscillator();
      var gainNode   = _audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(_audioCtx.destination);
      oscillator.type            = 'sine';
      oscillator.frequency.value = 1200;
      gainNode.gain.setValueAtTime(0.15, _audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(_audioCtx.currentTime + 0.3);
    } catch (_) {}
  }
  // ────────────────────────────────────────────────────────────────

  var Cfg = Object.freeze({
    MSG_INITIAL:        80,
    MSG_PAGE:           50,
    MSG_MAX_MEMORY:     500,
    INBOX_PAGE:         100,
    TYPING_MS:          3000,
    SEARCH_DEBOUNCE_MS: 300,
    LS_DEBOUNCE_MS:     2000,
    SCROLL_THRESH:      60,
    RETRY_BASE_MS:      1000,
    RETRY_MAX_MS:       30000,
    RETRY_MAX_ATTEMPTS: 5,
    LS_KEY:             'jd_chat_inbox_v4',
    LS_TTL_MS:          5 * 60 * 1000,
  });

  function getAdminId() {
    try {
      var user = firebase.auth().currentUser;
      return (user && user.uid) ? user.uid : 'admin';
    } catch (_) { return 'admin'; }
  }

  var U = {
    debounce: function (fn, ms) {
      var t;
      return function () {
        var args = arguments;
        var ctx  = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, ms);
      };
    },
    retryDelay: function (n) {
      return Math.min(Cfg.RETRY_BASE_MS * Math.pow(2, n), Cfg.RETRY_MAX_MS);
    },
    isNearBottom: function (el) {
      return el.scrollTop + el.clientHeight >= el.scrollHeight - Cfg.SCROLL_THRESH;
    },
    scrollToBottom: function (el, smooth) {
      try { el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }
      catch (_) { el.scrollTop = el.scrollHeight; }
    },
    groupMessages: function (msgs) {
      var groups = [];
      var cur = null;
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (!cur || cur.sender !== m.sender) {
          cur = { sender: m.sender, items: [] };
          groups.push(cur);
        }
        cur.items.push(m);
      }
      return groups;
    },
    replaceChildren: function (parent, newChild) {
      if (typeof parent.replaceChildren === 'function') {
        newChild !== undefined ? parent.replaceChildren(newChild) : parent.replaceChildren();
      } else {
        while (parent.firstChild) parent.removeChild(parent.firstChild);
        if (newChild !== undefined) parent.appendChild(newChild);
      }
    },
    cssEscape: function (s) {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
      return String(s).replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
    },
    // FIX #5: don't rely on startAfter detection — use a safer limitToLast approach
    // We keep this flag for informational purposes only; the live listener now uses
    // a different strategy that works on both SDK v8 and v9-compat.
    sdkHasStartAfter: (function () {
      try {
        var testRef = rtdb.ref('/');
        var q = testRef.orderByKey();
        return typeof q.startAfter === 'function';
      } catch (_) { return false; }
    }()),
    lsSet: (function () {
      var pending = {};
      var timers = {};
      return function (key, data) {
        pending[key] = data;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(function () {
          try {
            var nowTs = Date.now();
            var existing = U._lsRaw(key);
            if (existing && existing._ts > nowTs) return;
            localStorage.setItem(key, JSON.stringify({ _ts: nowTs, data: pending[key] }));
          } catch (_) {}
          delete pending[key];
          delete timers[key];
        }, Cfg.LS_DEBOUNCE_MS);
      };
    }()),
    lsGet: function (key, ttl) {
      var raw = this._lsRaw(key);
      if (!raw) return null;
      if (Date.now() - raw._ts > ttl) {
        try { localStorage.removeItem(key); } catch (_) {}
        return null;
      }
      return raw.data;
    },
    _lsRaw: function (key) {
      try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
      catch (_) { return null; }
    },
    raf: function (fn) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
      else setTimeout(fn, 16);
    }
  };

  var ChatState = (function () {
    var _sessions = {};
    var _activeSid = null;
    var _activeMsgs = [];
    var _seenKeys = new Set();
    var _optimisticKeys = new Set();
    var _oldestKey = null;
    var _hasMore = false;
    var _isLoadingOlder = false;
    var _filterTab = 'all';
    var _searchQuery = '';
    var _isSending = false;
    var _subs = { inboxAdded: null, inboxChanged: null, inboxRemoved: null, msgAdded: null, typing: null, connected: null };
    var _typingTimer = null;
    var _readGeneration = 0;

    return {
      getSessions:       function () { return Object.assign({}, _sessions); },
      getActiveSid:      function () { return _activeSid; },
      getOldestKey:      function () { return _oldestKey; },
      hasMore:           function () { return _hasMore; },
      isLoadingOlder:    function () { return _isLoadingOlder; },
      getFilterTab:      function () { return _filterTab; },
      getSearchQuery:    function () { return _searchQuery; },
      isSending:         function () { return _isSending; },
      getReadGen:        function () { return _readGeneration; },
      getActiveMessages: function () { return _activeMsgs.slice(); },
      getSub:            function (n) { return _subs[n] || null; },
      getTypingTimer:    function () { return _typingTimer; },
      setFilterTab:      function (v) { _filterTab = v; },
      setSearchQuery:    function (v) { _searchQuery = v; },
      setActiveSid:      function (v) { _activeSid = v; },
      setTypingTimer:    function (v) { _typingTimer = v; },
      setSending:        function (v) { _isSending = v; },
      setLoadingOlder:   function (v) { _isLoadingOlder = v; },
      setHasMore:        function (v) { _hasMore = v; },
      bumpReadGen:       function () { return ++_readGeneration; },
      upsertSession: function (sid, data) {
        _sessions[sid] = Object.assign({}, _sessions[sid] || {}, data);
        return Object.assign({}, _sessions[sid]);
      },
      getSession:    function (sid) { return _sessions[sid] ? Object.assign({}, _sessions[sid]) : null; },
      removeSession: function (sid) { delete _sessions[sid]; },
      setSessions:   function (obj) { _sessions = Object.assign({}, obj); },
      setActiveMessages: function (msgs) {
        if (msgs.length > Cfg.MSG_MAX_MEMORY) msgs = msgs.slice(msgs.length - Cfg.MSG_MAX_MEMORY);
        _activeMsgs    = msgs;
        _seenKeys      = new Set(msgs.map(function (m) { return m._key; }));
        _oldestKey     = msgs.length > 0 ? msgs[0]._key : null;
        _optimisticKeys = new Set();
      },
      registerOptimistic: function (tempKey) { _seenKeys.add(tempKey); _optimisticKeys.add(tempKey); },
      confirmOptimistic: function (realMsg) {
        if (_optimisticKeys.size === 0) return null;
        var tempKey = _optimisticKeys.values().next().value;
        _seenKeys.delete(tempKey);
        _optimisticKeys.delete(tempKey);
        _activeMsgs = _activeMsgs.filter(function (m) { return m._key !== tempKey; });
        return tempKey;
      },
      appendMessage: function (msg) {
        if (!msg._key || _seenKeys.has(msg._key)) return false;
        _seenKeys.add(msg._key);
        _activeMsgs.push(msg);
        if (_activeMsgs.length > Cfg.MSG_MAX_MEMORY) {
          var removed = _activeMsgs.shift();
          _seenKeys.delete(removed._key);
          _oldestKey = _activeMsgs.length > 0 ? _activeMsgs[0]._key : null;
        }
        return true;
      },
      prependMessages: function (msgs) {
        var newMsgs = msgs.filter(function (m) { return m._key && !_seenKeys.has(m._key); });
        newMsgs.forEach(function (m) { _seenKeys.add(m._key); });
        _activeMsgs = newMsgs.concat(_activeMsgs);
        if (newMsgs.length > 0) _oldestKey = newMsgs[0]._key;
        return newMsgs;
      },
      registerSub: function (name, sub) { _subs[name] = sub; },
      clearSub:    function (name) { _subs[name] = null; },
      resetSession: function () {
        _activeSid = null; _activeMsgs = []; _seenKeys = new Set();
        _optimisticKeys = new Set(); _oldestKey = null; _hasMore = false;
        _isLoadingOlder = false; _isSending = false;
      }
    };
  }());

  var ChatDB = {
    detach: function (sub, eventType) {
      if (!sub || !sub.ref || !sub.cb) return;
      try { sub.ref.off(eventType, sub.cb); } catch (e) {}
    },
    subscribeInbox: function (onAdded, onChanged, onRemoved, onError) {
      // orderByChild requires an index — see database rules note in README.
      // If you haven't added the index yet, this falls back gracefully but
      // ordering will be client-side only (Firebase will still deliver all items).
      var ref = rtdb.ref(INBOX_ROOT).orderByChild('lastMessageAt').limitToLast(Cfg.INBOX_PAGE);
      var addedCb   = function (s) { if (s.val()) onAdded(s.key,   s.val()); };
      var changedCb = function (s) { if (s.val()) onChanged(s.key, s.val()); };
      var removedCb = function (s) { onRemoved(s.key); };
      ref.on('child_added',   addedCb,   function (e) { onError && onError(e); });
      ref.on('child_changed', changedCb, function (e) { onError && onError(e); });
      ref.on('child_removed', removedCb, function (e) { onError && onError(e); });
      return {
        added:   { ref: ref, cb: addedCb,   event: 'child_added'   },
        changed: { ref: ref, cb: changedCb, event: 'child_changed' },
        removed: { ref: ref, cb: removedCb, event: 'child_removed' }
      };
    },

    // FIX #5: replaced the startAfter/startAt live-listener with a simple
    // limitToLast(1) gap-listener that uses the dedup set — works on ALL SDK versions.
    loadAndSubscribeMessages: function (sessionId, onInitial, onNewMessage, onSubReady, onError) {
      var msgsRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages');

      // Step 1 — load the initial batch synchronously via once('value')
      msgsRef.orderByKey().limitToLast(Cfg.MSG_INITIAL).once('value').then(function (snap) {
        var msgs = [];
        snap.forEach(function (child) {
          msgs.push(Object.assign({ _key: child.key }, child.val()));
        });
        msgs.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

        var hasMore = snap.numChildren() >= Cfg.MSG_INITIAL;
        onInitial(msgs, hasMore);

        // Step 2 — subscribe to ALL new children after this point.
        // Using orderByKey with no startAt/startAfter — dedup set in ChatState
        // handles ignoring already-seen keys. This is the safest cross-version approach.
        var liveRef = msgsRef.orderByKey();
        var liveCb  = function (childSnap) {
          onNewMessage(Object.assign({ _key: childSnap.key }, childSnap.val()));
        };
        liveRef.on('child_added', liveCb, function (e) { onError && onError(e); });
        onSubReady({ ref: liveRef, cb: liveCb, event: 'child_added' });

      }).catch(function (err) { onError && onError(err); });
    },

    loadOlderMessages: function (sessionId, beforeKey, onMessages, onError) {
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages')
        .orderByKey().endBefore(beforeKey).limitToLast(Cfg.MSG_PAGE)
        .once('value').then(function (snap) {
          var msgs = [];
          snap.forEach(function (child) { msgs.push(Object.assign({ _key: child.key }, child.val())); });
          msgs.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
          onMessages(msgs, msgs.length >= Cfg.MSG_PAGE);
        }).catch(function (err) { onError && onError(err); });
    },

    subscribeTyping: function (sessionId, onChange) {
      var ref = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/customerTyping');
      var cb  = function (snap) { onChange(snap.val() === true); };
      ref.on('value', cb);
      return { ref: ref, cb: cb, event: 'value' };
    },

    subscribeConnected: function (onChange) {
      var ref = rtdb.ref('.info/connected');
      var cb  = function (snap) { onChange(snap.val() === true); };
      ref.on('value', cb);
      return { ref: ref, cb: cb, event: 'value' };
    },

    sendMessage: function (sessionId, text) {
      var msgRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').push();
      var ts     = firebase.database.ServerValue.TIMESTAMP;
      var updates = {};
      updates[CHAT_ROOT  + '/' + sessionId + '/messages/' + msgRef.key]          = { text: text, sender: 'admin', createdAt: ts, read: true, delivered: true, sessionId: sessionId };
      updates[CHAT_ROOT  + '/' + sessionId + '/meta/adminTyping/' + getAdminId()] = null;
      updates[INBOX_ROOT + '/' + sessionId + '/lastMessage']                      = text;
      updates[INBOX_ROOT + '/' + sessionId + '/lastMessageAt']                    = ts;
      // When admin replies, reset the unread counter
      updates[INBOX_ROOT + '/' + sessionId + '/unreadCount']                      = 0;
      return rtdb.ref('/').update(updates);
    },

    // FIX #3: replaced orderByChild('read').equalTo(false) with a simple scan
    // to avoid requiring a Firebase index on 'read'. Reads all messages in the
    // session and filters client-side — safe for typical chat volumes.
    markSessionAsRead: function (sessionId, gen) {
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').once('value').then(function (snap) {
        if (ChatState.getReadGen() !== gen) return;
        var updates = {};
        snap.forEach(function (child) {
          var msg = child.val();
          if (msg && msg.sender === 'customer' && msg.read === false) {
            updates[CHAT_ROOT + '/' + sessionId + '/messages/' + child.key + '/read'] = true;
          }
        });
        if (Object.keys(updates).length > 0) {
          updates[INBOX_ROOT + '/' + sessionId + '/unreadCount'] = 0;
          return rtdb.ref('/').update(updates);
        }
      }).catch(function (e) { console.warn('[admin-inbox] markSessionAsRead error:', e.message); });
    },

    setAdminTyping: function (sessionId, val) {
      return rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping/' + getAdminId())
        .set(val ? true : null).catch(function (e) {});
    },
    saveNote: function (sessionId, text) {
      var updates = {};
      updates[CHAT_ROOT + '/' + sessionId + '/meta/adminNote']   = text;
      updates[CHAT_ROOT + '/' + sessionId + '/meta/noteLocked']  = null;
      return rtdb.ref('/').update(updates);
    },
    loadNote: function (sessionId) {
      return rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminNote').once('value');
    },
    lockNote: function (sessionId) {
      var ref = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/noteLocked');
      return ref.once('value').then(function (snap) {
        var lock    = snap.val();
        var adminId = getAdminId();
        if (lock && lock.adminId && lock.adminId !== adminId) {
          var since = lock.ts ? Math.round((Date.now() - lock.ts) / 1000) : '?';
          return { locked: true, by: lock.adminId, since: since };
        }
        return ref.set({ adminId: adminId, ts: firebase.database.ServerValue.TIMESTAMP })
          .then(function () { return { locked: false }; });
      });
    },
    unlockNote: function (sessionId) {
      var ref = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/noteLocked');
      return ref.once('value').then(function (snap) {
        var lock = snap.val();
        if (lock && lock.adminId === getAdminId()) return ref.set(null);
      }).catch(function (e) {});
    },
    togglePin: function (sessionId, currentlyPinned) {
      var pinned  = !currentlyPinned;
      var updates = {};
      updates[CHAT_ROOT  + '/' + sessionId + '/meta/pinned']  = pinned;
      updates[INBOX_ROOT + '/' + sessionId + '/pinned']        = pinned;
      return rtdb.ref('/').update(updates).then(function () { return pinned; });
    },
    lookupOrders: function (sessionId) {
      return ordersRef.where('chatSessionId', '==', sessionId).limit(10).get();
    }
  };

  // ==================== RENDERER (unchanged) ====================
  var ChatRenderer = {
    renderInboxShell: function (container) {
      container.innerHTML = '<div class="section-header" style="margin-bottom:12px;"><div class="section-title">Inbox</div><div class="section-actions"><input class="search-input" id="chat-search" placeholder="Search…" autocomplete="off" style="min-width:140px;max-width:200px;"></div></div><div id="chat-offline-banner" style="display:none;background:var(--warning,#f59e0b);color:#fff;font-size:11px;padding:6px 12px;border-radius:4px;margin-bottom:8px;">⚠️ Offline — showing cached data</div><div style="display:flex;gap:6px;margin-bottom:12px;" id="chat-tab-bar"><button class="btn btn-sm btn-primary" data-tab="all" id="chat-tab-all">All</button><button class="btn btn-sm btn-ghost" data-tab="unread" id="chat-tab-unread">Unread</button><button class="btn btn-sm btn-ghost" data-tab="pinned" id="chat-tab-pinned">Pinned</button></div><div id="chat-sessions-wrap" class="chat-sessions-wrap"></div>';
    },
    renderSessionsList: function (sessions) {
      var wrap = safeEl('chat-sessions-wrap');
      if (!wrap) return;
      var ids = this._filteredSortedIds(sessions);
      if (ids.length === 0) { wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✉</div><div class="empty-state-text">No conversations yet</div></div>'; return; }
      var frag = document.createDocumentFragment();
      for (var i = 0; i < ids.length; i++) frag.appendChild(this._buildCard(ids[i], sessions[ids[i]]));
      wrap.innerHTML = '';
      wrap.appendChild(frag);
    },
    updateCard: function (sid, data, sessions) {
      var wrap = safeEl('chat-sessions-wrap');
      if (!wrap) return;
      var existing = wrap.querySelector('[data-sid="' + U.cssEscape(sid) + '"]');
      var newCard  = this._buildCard(sid, data);
      if (existing) existing.replaceWith(newCard);
      else wrap.appendChild(newCard);
      this._repositionCard(sid, sessions, wrap);
    },
    _repositionCard: function (sid, sessions, wrap) {
      var card = wrap.querySelector('[data-sid="' + U.cssEscape(sid) + '"]');
      if (!card) return;
      var ids  = this._filteredSortedIds(sessions);
      var pos  = ids.indexOf(sid);
      if (pos === -1) { card.remove(); return; }
      var allCards = wrap.querySelectorAll('[data-sid]');
      var domSids  = [];
      for (var i = 0; i < allCards.length; i++) { if (allCards[i] !== card) domSids.push(allCards[i].dataset.sid); }
      var insertBefore = null;
      for (var j = 0; j < domSids.length; j++) {
        if (ids.indexOf(domSids[j]) > pos) { insertBefore = wrap.querySelector('[data-sid="' + U.cssEscape(domSids[j]) + '"]'); break; }
      }
      if (insertBefore) wrap.insertBefore(card, insertBefore);
      else wrap.appendChild(card);
    },
    removeCard: function (sid) {
      var el = (safeEl('chat-sessions-wrap') || document).querySelector('[data-sid="' + U.cssEscape(sid) + '"]');
      if (el) el.remove();
    },
    _filteredSortedIds: function (sessions) {
      var tab    = ChatState.getFilterTab();
      var search = ChatState.getSearchQuery().toLowerCase();
      var ids    = Object.keys(sessions).filter(function (sid) {
        var s = sessions[sid];
        if (tab === 'unread' && !s.unreadCount) return false;
        if (tab === 'pinned' && !s.pinned)      return false;
        if (search && ((s.customerName || '') + ' ' + sid).toLowerCase().indexOf(search) === -1) return false;
        return true;
      });
      ids.sort(function (a, b) {
        var sa = sessions[a], sb = sessions[b];
        if (sb.pinned && !sa.pinned) return  1;
        if (sa.pinned && !sb.pinned) return -1;
        return (sb.lastMessageAt || 0) - (sa.lastMessageAt || 0);
      });
      return ids;
    },
    _buildCard: function (sid, s) {
      var avClass = avatarClass(sid);
      var avInit  = avatarInitials(sid);
      var time    = s.lastMessageAt ? fmtDateShort(s.lastMessageAt) : '';
      var preview = (s.lastMessage || '').substring(0, 70);
      var name    = s.customerName || sid.substring(0, 22);
      var badge   = s.unreadCount > 0
        ? '<span class="session-unread-count">' + Number(s.unreadCount) + '</span>'
        : (s.pinned ? '<span class="badge badge-processing" style="font-size:9px;">Pinned</span>' : '');
      var card = document.createElement('div');
      card.className = 'chat-session-card' + (s.unreadCount > 0 ? ' unread' : '');
      card.setAttribute('data-sid',    sid);
      card.setAttribute('role',        'button');
      card.setAttribute('tabindex',    '0');
      card.innerHTML = '<div class="chat-avatar ' + esc(avClass) + '">' + esc(avInit) + '</div><div class="session-info"><div class="session-id-label">' + esc(name) + '</div><div class="session-preview">' + esc(preview) + (preview.length >= 70 ? '…' : '') + '</div></div><div class="session-right"><span class="session-time">' + esc(time) + '</span>' + badge + '</div>';
      return card;
    },
    renderSessionShell: function (container, sessionId, isPinned) {
      var avClass = esc(avatarClass(sessionId));
      var avInit  = esc(avatarInitials(sessionId));
      var name    = esc(sessionId.substring(0, 26));
      container.innerHTML = '<button class="back-link" id="chat-back-btn">← Inbox</button><div class="section-header"><div style="display:flex;align-items:center;gap:10px;"><div class="chat-avatar ' + avClass + '" style="width:36px;height:36px;font-size:12px;">' + avInit + '</div><div><div style="font-size:14px;font-weight:500;" id="session-name-label">' + name + '</div><div id="session-status-label" style="font-size:11px;color:var(--muted);margin-top:1px;">Live Session</div></div></div><div style="display:flex;gap:8px;"><button class="btn btn-sm btn-ghost" id="chat-pin-btn" data-pinned="' + (isPinned ? '1' : '0') + '">' + (isPinned ? 'Unpin' : 'Pin') + '</button><button class="btn btn-sm btn-ghost" id="chat-orders-btn">Orders</button></div></div><div style="display:grid;grid-template-columns:1fr;gap:12px;"><div class="chat-view-wrap"><div id="chat-load-more-wrap" style="text-align:center;padding:6px;display:none;"><button class="btn btn-sm btn-ghost" id="chat-load-more-btn">Load older messages</button></div><div id="chat-history-start" style="display:none;text-align:center;color:var(--muted);font-size:10.5px;padding:8px 0;">— Beginning of conversation —</div><div class="chat-messages-panel" id="chat-messages-panel"><div style="text-align:center;color:var(--muted);font-size:11px;padding:24px;">Loading…</div></div><div id="chat-new-msg-banner" style="display:none;text-align:center;padding:4px 0;"><button class="btn btn-sm btn-primary" id="chat-scroll-down-btn">↓ New messages</button></div><div class="typing-indicator" id="typing-indicator" style="display:none;align-items:center;gap:2px;"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span><em style="font-size:10px;margin-left:6px;">Customer is typing…</em></div><div class="quick-replies" id="quick-replies-row">' + QUICK_REPLIES.map(function (r) { return '<button class="quick-reply-btn" data-reply="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div><div class="reply-box"><input id="reply-input" placeholder="Write a reply…" autocomplete="off"><button class="chat-send-btn" id="chat-send-btn">Send</button></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="card"><div class="card-header"><span class="card-title">Customer Info</span></div><div style="padding:12px 14px;"><div class="info-row" style="background:none;border:none;padding:4px 0;"><span class="label">Session</span><span style="font-size:10.5px;">' + esc(sessionId.substring(0, 14)) + '</span></div><div class="info-row" style="background:none;border:none;padding:4px 0;"><span class="label">Status</span><span style="color:var(--success);">Active</span></div></div></div><div class="card"><div class="card-header"><span class="card-title">Support Notes</span><span id="note-lock-indicator" style="font-size:9px;color:var(--warning,#f59e0b);margin-left:8px;display:none;">⚠️ Locked by another admin</span></div><div style="padding:12px 14px;"><textarea id="chat-note" style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:Manrope,sans-serif;font-size:11.5px;font-weight:300;min-height:60px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;" placeholder="Internal notes…"></textarea><button class="btn btn-sm btn-ghost" id="chat-save-note-btn" style="margin-top:7px;width:100%;">Save Note</button></div></div></div></div>';
    },
    renderMessages: function (msgs, panel) {
      if (!panel) return;
      if (!msgs || msgs.length === 0) { panel.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:24px;">No messages yet.</div>'; return; }
      var frag   = document.createDocumentFragment();
      var groups = U.groupMessages(msgs);
      for (var i = 0; i < groups.length; i++) frag.appendChild(this._buildGroup(groups[i]));
      panel.innerHTML = '';
      panel.appendChild(frag);
      U.scrollToBottom(panel);
    },
    appendMessage: function (msg, panel, tempKey) {
      if (!panel) return;
      var wasAtBottom = U.isNearBottom(panel);
      if (tempKey) {
        var optEl = panel.querySelector('[data-key="' + tempKey + '"]');
        if (optEl) { optEl.replaceWith(this._buildBubble(msg)); if (wasAtBottom) U.scrollToBottom(panel, true); return; }
      }
      var isAdmin   = msg.sender !== 'customer';
      var groupCls  = isAdmin ? 'msg-group--admin' : 'msg-group--customer';
      var lastGroup = panel.querySelector('.msg-group:last-child');
      if (lastGroup && lastGroup.classList.contains(groupCls)) lastGroup.appendChild(this._buildBubble(msg));
      else { var g = document.createElement('div'); g.className = 'msg-group ' + groupCls; g.appendChild(this._buildBubble(msg)); panel.appendChild(g); }
      if (wasAtBottom) { U.scrollToBottom(panel, true); var banner = safeEl('chat-new-msg-banner'); if (banner) banner.style.display = 'none'; }
      else { var banner2 = safeEl('chat-new-msg-banner'); if (banner2) banner2.style.display = 'block'; }
    },
    prependMessages: function (msgs, panel) {
      if (!panel || !msgs || msgs.length === 0) return;
      var prevTop  = panel.scrollTop;
      var groups   = U.groupMessages(msgs);
      var frag     = document.createDocumentFragment();
      var firstOldGroup = panel.querySelector('.msg-group:first-child');
      for (var i = 0; i < groups.length; i++) {
        var group   = groups[i];
        var isAdmin = group.sender !== 'customer';
        var cls     = isAdmin ? 'msg-group--admin' : 'msg-group--customer';
        if (i === groups.length - 1 && firstOldGroup && firstOldGroup.classList.contains(cls)) {
          for (var j = 0; j < group.items.length; j++) firstOldGroup.insertBefore(this._buildBubble(group.items[j]), firstOldGroup.firstChild);
          break;
        }
        frag.appendChild(this._buildGroup(group));
      }
      panel.insertBefore(frag, panel.firstChild);
      U.raf(function () { panel.scrollTop = prevTop + (panel.scrollHeight - prevTop - panel.clientHeight); });
    },
    appendOptimisticMessage: function (text, panel) {
      if (!panel) return null;
      var tempKey = '__opt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var bubble  = this._buildBubble({ _key: tempKey, text: text, sender: 'admin', createdAt: Date.now(), read: false, delivered: false });
      bubble.style.opacity = '0.6';
      var lastGroup = panel.querySelector('.msg-group:last-child');
      if (lastGroup && lastGroup.classList.contains('msg-group--admin')) lastGroup.appendChild(bubble);
      else { var g = document.createElement('div'); g.className = 'msg-group msg-group--admin'; g.appendChild(bubble); panel.appendChild(g); }
      U.scrollToBottom(panel, true);
      return tempKey;
    },
    _buildGroup: function (group) {
      var el = document.createElement('div');
      el.className = 'msg-group' + (group.sender !== 'customer' ? ' msg-group--admin' : ' msg-group--customer');
      for (var i = 0; i < group.items.length; i++) el.appendChild(this._buildBubble(group.items[i]));
      return el;
    },
    _buildBubble: function (m) {
      var isAdmin = m.sender !== 'customer';
      var wrap    = document.createElement('div');
      wrap.className = 'chat-msg-admin' + (isAdmin ? '' : ' customer-msg');
      if (m._key) wrap.setAttribute('data-key', m._key);
      var bubble = document.createElement('div');
      bubble.className  = 'chat-bubble';
      bubble.textContent = m.text || '';
      var statusHtml = '';
      if (isAdmin) {
        if (m.read)      statusHtml = '<span class="msg-status msg-status--read"      title="Read">✓✓</span>';
        else if (m.delivered) statusHtml = '<span class="msg-status msg-status--delivered" title="Delivered">✓✓</span>';
        else             statusHtml = '<span class="msg-status msg-status--sent"      title="Sent">✓</span>';
      }
      var meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML  = esc(m.sender || '') + ' · ' + esc(m.createdAt ? fmtTime(m.createdAt) : '') + statusHtml;
      wrap.appendChild(bubble);
      wrap.appendChild(meta);
      return wrap;
    },
    setTypingVisible:  function (v) { var el = safeEl('typing-indicator'); if (el) el.style.display = v ? 'flex' : 'none'; },
    setLoadMoreVisible: function (v) { var w = safeEl('chat-load-more-wrap'); if (w) w.style.display = v ? 'block' : 'none'; var h = safeEl('chat-history-start'); if (h) h.style.display = v ? 'none' : 'block'; },
    setSendLock:       function (locked) { var input = safeEl('reply-input'); var btn = safeEl('chat-send-btn'); if (input) input.disabled = locked; if (btn) btn.disabled = locked; },
    setOfflineBanner:  function (offline) { var el = safeEl('chat-offline-banner'); if (el) el.style.display = offline ? 'block' : 'none'; },
    setPinButton:      function (pinned)  { var btn = safeEl('chat-pin-btn'); if (btn) { btn.textContent = pinned ? 'Unpin' : 'Pin'; btn.setAttribute('data-pinned', pinned ? '1' : '0'); } },
    setTabActive:      function (tab)     { ['all','unread','pinned'].forEach(function (t) { var b = safeEl('chat-tab-' + t); if (b) b.className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-ghost'); }); },
    setNoteLock:       function (locked)  { var indicator = safeEl('note-lock-indicator'); var noteEl = safeEl('chat-note'); var saveBtn = safeEl('chat-save-note-btn'); if (indicator) indicator.style.display = locked ? 'inline' : 'none'; if (noteEl) noteEl.disabled = locked; if (saveBtn) saveBtn.disabled = locked; }
  };

  var ChatController = {
    _detachInbox: function () {
      var map = { inboxAdded: 'child_added', inboxChanged: 'child_changed', inboxRemoved: 'child_removed' };
      Object.keys(map).forEach(function (name) { var sub = ChatState.getSub(name); if (sub) { ChatDB.detach(sub, map[name]); ChatState.clearSub(name); } });
    },
    _detachMsgSub: function () { var sub = ChatState.getSub('msgAdded'); if (sub) { ChatDB.detach(sub, 'child_added'); ChatState.clearSub('msgAdded'); } },
    _detachSession: function (sessionId) {
      this._detachMsgSub();
      var typing = ChatState.getSub('typing');
      if (typing) { ChatDB.detach(typing, 'value'); ChatState.clearSub('typing'); }
      if (sessionId) { ChatDB.setAdminTyping(sessionId, false); ChatDB.unlockNote(sessionId); }
      var t = ChatState.getTypingTimer(); if (t) { clearTimeout(t); ChatState.setTypingTimer(null); }
    },
    _initConnectionMonitor: function () {
      var existing = ChatState.getSub('connected'); if (existing) { ChatDB.detach(existing, 'value'); ChatState.clearSub('connected'); }
      var firstEvent = true;
      ChatState.registerSub('connected', ChatDB.subscribeConnected(function (online) {
        if (firstEvent) { firstEvent = false; return; }
        ChatRenderer.setOfflineBanner(!online);
        if (online) { var sid = ChatState.getActiveSid(); if (sid) { var gen = ChatState.bumpReadGen(); ChatDB.markSessionAsRead(sid, gen); } }
      }));
    },
    loadInbox: function () {
      var self = this;
      var mc   = safeEl('main-content');
      if (!mc) return;
      self._detachSession(ChatState.getActiveSid());
      self._detachInbox();
      ChatState.resetSession();
      ChatRenderer.renderInboxShell(mc);
      self._bindInboxEvents();
      self._initConnectionMonitor();
      var cached = U.lsGet(Cfg.LS_KEY, Cfg.LS_TTL_MS);
      if (cached) { ChatState.setSessions(cached); ChatRenderer.renderSessionsList(cached); }
      else { var wrap = safeEl('chat-sessions-wrap'); if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✉</div><div class="empty-state-text">Loading…</div></div>'; }
      self._subscribeInbox();
    },
    _subscribeInbox: function () {
      var self = this;
      self._detachInbox();
      var subs = ChatDB.subscribeInbox(
        function (sid, data) { var entry = ChatState.upsertSession(sid, data); ChatRenderer.updateCard(sid, entry, ChatState.getSessions()); U.lsSet(Cfg.LS_KEY, ChatState.getSessions()); },
        function (sid, data) { var entry = ChatState.upsertSession(sid, data); ChatRenderer.updateCard(sid, entry, ChatState.getSessions()); U.lsSet(Cfg.LS_KEY, ChatState.getSessions()); },
        function (sid)       { ChatState.removeSession(sid); ChatRenderer.removeCard(sid); U.lsSet(Cfg.LS_KEY, ChatState.getSessions()); },
        function ()          { self._retryInbox(0); }
      );
      ChatState.registerSub('inboxAdded',   subs.added);
      ChatState.registerSub('inboxChanged', subs.changed);
      ChatState.registerSub('inboxRemoved', subs.removed);
    },
    _retryInbox: function (attempt) {
      var self = this;
      if (attempt >= Cfg.RETRY_MAX_ATTEMPTS) { showToast('Inbox connection lost. Please reload.', 'error'); return; }
      setTimeout(function () { self._subscribeInbox(); }, U.retryDelay(attempt));
    },
    openSession: function (sessionId) {
      var self = this;
      if (!sessionId || ChatState.getActiveSid() === sessionId) return;
      self._detachSession(ChatState.getActiveSid());
      ChatState.resetSession();
      ChatState.setActiveSid(sessionId);
      var mc = safeEl('main-content'); if (!mc) return;
      var sessionData = ChatState.getSession(sessionId);
      ChatRenderer.renderSessionShell(mc, sessionId, sessionData ? !!sessionData.pinned : false);
      self._bindSessionEvents(sessionId);
      ChatRenderer.setTypingVisible(false);
      var gen = ChatState.bumpReadGen(); ChatDB.markSessionAsRead(sessionId, gen);
      ChatDB.loadNote(sessionId).then(function (snap) { var el = safeEl('chat-note'); if (el && snap.val()) el.value = snap.val(); }).catch(function () {});
      if (sessionData && sessionData.customerName) { var nameEl = safeEl('session-name-label'); if (nameEl) nameEl.textContent = sessionData.customerName; }
      ChatDB.loadAndSubscribeMessages(sessionId,
        function (msgs, hasMore) {
          if (ChatState.getActiveSid() !== sessionId) return;
          ChatState.setActiveMessages(msgs);
          ChatState.setHasMore(hasMore);
          ChatRenderer.renderMessages(msgs, safeEl('chat-messages-panel'));
          ChatRenderer.setLoadMoreVisible(hasMore);
        },
        function (msg) {
          if (ChatState.getActiveSid() !== sessionId) return;
          var tempKey = (msg.sender === 'admin') ? ChatState.confirmOptimistic(msg) : null;
          var added   = ChatState.appendMessage(msg);
          if (!added && !tempKey) return;
          ChatRenderer.appendMessage(msg, safeEl('chat-messages-panel'), tempKey);
          if (msg.sender === 'customer') {
            _playNotifSound();
            ChatDB.markSessionAsRead(sessionId, ChatState.bumpReadGen());
          }
        },
        function (sub) {
          if (ChatState.getActiveSid() !== sessionId) { ChatDB.detach(sub, 'child_added'); return; }
          var existing = ChatState.getSub('msgAdded');
          if (existing) ChatDB.detach(existing, 'child_added');
          ChatState.clearSub('msgAdded');
          ChatState.registerSub('msgAdded', sub);
        },
        function () {
          if (ChatState.getActiveSid() !== sessionId) return;
          self._retryMsgSub(sessionId, 0);
        }
      );
      ChatState.registerSub('typing', ChatDB.subscribeTyping(sessionId, function (isTyping) {
        if (ChatState.getActiveSid() === sessionId) ChatRenderer.setTypingVisible(isTyping);
      }));
    },
    _retryMsgSub: function (sessionId, attempt) {
      var self = this;
      if (attempt >= Cfg.RETRY_MAX_ATTEMPTS || ChatState.getActiveSid() !== sessionId) return;
      self._detachMsgSub();
      setTimeout(function () {
        if (ChatState.getActiveSid() !== sessionId) return;
        ChatDB.loadAndSubscribeMessages(sessionId,
          function (msgs, hasMore) { if (ChatState.getActiveSid() !== sessionId) return; ChatState.setActiveMessages(msgs); ChatState.setHasMore(hasMore); ChatRenderer.renderMessages(msgs, safeEl('chat-messages-panel')); ChatRenderer.setLoadMoreVisible(hasMore); },
          function (msg) { if (ChatState.getActiveSid() !== sessionId) return; var tempKey = (msg.sender === 'admin') ? ChatState.confirmOptimistic(msg) : null; var added = ChatState.appendMessage(msg); if (!added && !tempKey) return; ChatRenderer.appendMessage(msg, safeEl('chat-messages-panel'), tempKey); },
          function (sub) { if (ChatState.getActiveSid() !== sessionId) { ChatDB.detach(sub, 'child_added'); return; } var existing = ChatState.getSub('msgAdded'); if (existing) ChatDB.detach(existing, 'child_added'); ChatState.clearSub('msgAdded'); ChatState.registerSub('msgAdded', sub); },
          function () { self._retryMsgSub(sessionId, attempt + 1); }
        );
      }, U.retryDelay(attempt));
    },
    sendMessage: function (sessionId) {
      if (ChatState.isSending()) return;
      var input = safeEl('reply-input'); var text = input && input.value.trim();
      if (!text || !sessionId) return;
      ChatState.setSending(true); ChatRenderer.setSendLock(true); input.value = '';
      var panel   = safeEl('chat-messages-panel');
      var tempKey = ChatRenderer.appendOptimisticMessage(text, panel);
      if (tempKey) ChatState.registerOptimistic(tempKey);
      ChatDB.sendMessage(sessionId, text).catch(function (err) {
        showToast('Failed to send: ' + err.message, 'error');
        if (tempKey && panel) { var el = panel.querySelector('[data-key="' + tempKey + '"]'); if (el) el.remove(); }
        if (tempKey) ChatState.confirmOptimistic({ _key: '__evict__' });
        if (input) input.value = text;
      }).finally(function () { ChatState.setSending(false); ChatRenderer.setSendLock(false); if (input && !input.disabled) input.focus(); });
    },
    handleAdminTyping: function (sessionId) {
      ChatDB.setAdminTyping(sessionId, true);
      var t = ChatState.getTypingTimer(); if (t) clearTimeout(t);
      ChatState.setTypingTimer(setTimeout(function () { ChatDB.setAdminTyping(sessionId, false); ChatState.setTypingTimer(null); }, Cfg.TYPING_MS));
    },
    loadOlderMessages: function (sessionId) {
      if (ChatState.isLoadingOlder() || !ChatState.hasMore() || !ChatState.getOldestKey()) return;
      ChatState.setLoadingOlder(true);
      var btn = safeEl('chat-load-more-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
      ChatDB.loadOlderMessages(sessionId, ChatState.getOldestKey(), function (msgs, hasMore) {
        ChatState.setLoadingOlder(false);
        if (ChatState.getActiveSid() !== sessionId) return;
        var added = ChatState.prependMessages(msgs); ChatState.setHasMore(hasMore);
        ChatRenderer.prependMessages(added, safeEl('chat-messages-panel')); ChatRenderer.setLoadMoreVisible(hasMore);
        if (btn) { btn.disabled = false; btn.textContent = 'Load older messages'; }
      }, function () { ChatState.setLoadingOlder(false); showToast('Failed to load older messages', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Load older messages'; } });
    },
    togglePin:  function (sessionId) {
      var btn = safeEl('chat-pin-btn');
      ChatDB.togglePin(sessionId, btn ? btn.getAttribute('data-pinned') === '1' : false)
        .then(function (newPinned) { ChatRenderer.setPinButton(newPinned); showToast(newPinned ? 'Chat pinned' : 'Chat unpinned'); })
        .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
    },
    saveNote:   function (sessionId) { var el = safeEl('chat-note'); if (el) ChatDB.saveNote(sessionId, el.value).then(function () { showToast('Note saved'); }).catch(function (e) { showToast('Error: ' + e.message, 'error'); }); },
    handleNoteFocus: function (sessionId) { ChatDB.lockNote(sessionId).then(function (result) { if (result.locked) { ChatRenderer.setNoteLock(true); showToast('Note is being edited by another admin', 'info'); } }).catch(function () {}); },
    handleNoteBlur:  function (sessionId) { ChatDB.unlockNote(sessionId); ChatRenderer.setNoteLock(false); },
    lookupOrders:    function (sessionId) { ChatDB.lookupOrders(sessionId).then(function (snap) { showToast(snap.empty ? 'No orders linked' : 'Found ' + snap.size + ' order(s)', 'info'); }).catch(function () {}); },
    setFilterTab: function (tab) { ChatState.setFilterTab(tab); ChatRenderer.setTabActive(tab); ChatRenderer.renderSessionsList(ChatState.getSessions()); },
    setSearchQuery: U.debounce(function (q) { ChatState.setSearchQuery(q); ChatRenderer.renderSessionsList(ChatState.getSessions()); }, Cfg.SEARCH_DEBOUNCE_MS),
    _bindInboxEvents: function () {
      var self = this;
      var tabBar   = safeEl('chat-tab-bar'); if (tabBar)   tabBar.addEventListener('click', function (e) { var btn = e.target.closest('[data-tab]'); if (btn) self.setFilterTab(btn.dataset.tab); });
      var searchEl = safeEl('chat-search');  if (searchEl) searchEl.addEventListener('input', function (e) { self.setSearchQuery(e.target.value || ''); });
      var wrap     = safeEl('chat-sessions-wrap');
      if (wrap) {
        wrap.addEventListener('click',   function (e) { var card = e.target.closest('[data-sid]'); if (card) self.openSession(card.dataset.sid); });
        wrap.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var card = e.target.closest('[data-sid]'); if (card) self.openSession(card.dataset.sid); } });
      }
    },
    _bindSessionEvents: function (sessionId) {
      var self = this;
      var on = function (id, ev, fn) { var el = safeEl(id); if (el) el.addEventListener(ev, fn); };
      on('chat-back-btn',    'click',   function () { self._detachSession(sessionId); ChatState.resetSession(); if (typeof window.switchTab === 'function') window.switchTab('messages'); });
      on('chat-pin-btn',     'click',   function () { self.togglePin(sessionId); });
      on('chat-orders-btn',  'click',   function () { self.lookupOrders(sessionId); });
      on('chat-send-btn',    'click',   function () { self.sendMessage(sessionId); });
      on('chat-save-note-btn','click',  function () { self.saveNote(sessionId); });
      on('chat-load-more-btn','click',  function () { self.loadOlderMessages(sessionId); });
      on('reply-input', 'keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendMessage(sessionId); } });
      on('reply-input', 'input',   function ()  { self.handleAdminTyping(sessionId); });
      on('chat-note',   'focus',   function ()  { self.handleNoteFocus(sessionId); });
      on('chat-note',   'blur',    function ()  { self.handleNoteBlur(sessionId); });
      on('quick-replies-row', 'click', function (e) { var btn = e.target.closest('[data-reply]'); if (btn) { var input = safeEl('reply-input'); if (input) { input.value = btn.dataset.reply; input.focus(); } } });
      on('chat-scroll-down-btn', 'click', function () { var panel = safeEl('chat-messages-panel'); if (panel) U.scrollToBottom(panel, true); var banner = safeEl('chat-new-msg-banner'); if (banner) banner.style.display = 'none'; });
    }
  };

  window._renderMessagesTab       = function () { ChatController.loadInbox(); };
  window._openChatSession         = function (sid) { ChatController.openSession(sid); };
  window._detachActiveChatListeners = function () { ChatController._detachSession(ChatState.getActiveSid()); ChatController._detachInbox(); };

  }

  initWhenReady();

})();
