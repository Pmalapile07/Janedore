*/

(function () {
  'use strict';

  if (!window._adminDB) return;

  /* ─────────────────────────────────────────
     DEPENDENCIES
  ───────────────────────────────────────── */
  var rtdb           = window._adminRTDB;
  var CHAT_ROOT      = window._CHAT_ROOT;
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

  /* ─────────────────────────────────────────
     CONFIG
  ───────────────────────────────────────── */
  var Cfg = Object.freeze({
    MSG_INITIAL:        80,
    MSG_PAGE:           50,
    MSG_MAX_MEMORY:     500,
    INBOX_PAGE:         100,
    TYPING_MS:          3000,
    SEARCH_DEBOUNCE_MS: 300,
    LS_DEBOUNCE_MS:     2000,   // [R10] debounce localStorage writes
    SCROLL_THRESH:      60,
    RETRY_BASE_MS:      1000,
    RETRY_MAX_MS:       30000,
    RETRY_MAX_ATTEMPTS: 5,
    LS_KEY:             'jd_chat_inbox_v4',
    LS_TTL_MS:          5 * 60 * 1000,
  });

  /* ─────────────────────────────────────────
     ADMIN IDENTITY
     Used for per-admin typing and note locking.
  ───────────────────────────────────────── */
  function getAdminId() {
    try {
      var user = firebase.auth().currentUser;
      return (user && user.uid) ? user.uid : 'admin';
    } catch (_) { return 'admin'; }
  }

  /* ─────────────────────────────────────────
     UTILS
  ───────────────────────────────────────── */
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
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      } catch (_) {
        el.scrollTop = el.scrollHeight;
      }
    },

    groupMessages: function (msgs) {
      var groups = [];
      var cur    = null;
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

    /* [R18] CSS.escape polyfill */
    cssEscape: function (s) {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(s);
      }
      // Minimal polyfill for data-sid values
      return s.replace(/([\0-\x1f\x7f]|^[0-9]|[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    },

    /* [R12] SDK capability check without a live ref */
    sdkHasStartAfter: (function () {
      try {
        // Modular SDK v9+ re-exported as compat: startAfter exists on Query prototype
        var db = rtdb;
        // Access via the internal prototype — no network call
        var testRef = db.ref('/');
        var q = testRef.orderByKey();
        return typeof q.startAfter === 'function';
      } catch (_) { return false; }
    }()),

    /* [R10] Debounced localStorage write */
    lsSet: (function () {
      var pending = {};
      var timers  = {};
      return function (key, data) {
        pending[key] = data;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(function () {
          try {
            var nowTs    = Date.now();
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
      try {
        var s = localStorage.getItem(key);
        return s ? JSON.parse(s) : null;
      } catch (_) { return null; }
    },

    lsClear: function (key) {
      try { localStorage.removeItem(key); } catch (_) {}
    },

    raf: function (fn) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
      else setTimeout(fn, 16);
    },
  };

  /* ─────────────────────────────────────────
     STATE
  ───────────────────────────────────────── */
  var ChatState = (function () {

    var _sessions      = {};
    var _activeSid     = null;
    var _activeMsgs    = [];
    var _seenKeys      = new Set();
    var _optimisticKeys = new Set();  // [R2] track optimistic msg keys separately
    var _oldestKey     = null;
    var _hasMore       = false;
    var _isLoadingOlder = false;      // [R16]
    var _filterTab     = 'all';
    var _searchQuery   = '';
    var _isSending     = false;

    var _subs = {
      inboxAdded:   null,
      inboxChanged: null,
      inboxRemoved: null,
      msgAdded:     null,
      typing:       null,
      connected:    null,
    };

    var _typingTimer    = null;
    var _readGeneration = 0;

    return {

      getSessions:      function () { return Object.assign({}, _sessions); },
      getActiveSid:     function () { return _activeSid; },
      getOldestKey:     function () { return _oldestKey; },
      hasMore:          function () { return _hasMore; },
      isLoadingOlder:   function () { return _isLoadingOlder; },
      getFilterTab:     function () { return _filterTab; },
      getSearchQuery:   function () { return _searchQuery; },
      isSending:        function () { return _isSending; },
      getReadGen:       function () { return _readGeneration; },
      getActiveMessages:function () { return _activeMsgs.slice(); },
      getSub:           function (n) { return _subs[n] || null; },
      getTypingTimer:   function ()  { return _typingTimer; },

      setFilterTab:     function (v) { _filterTab = v; },
      setSearchQuery:   function (v) { _searchQuery = v; },
      setActiveSid:     function (v) { _activeSid = v; },
      setTypingTimer:   function (v) { _typingTimer = v; },
      setSending:       function (v) { _isSending = v; },
      setLoadingOlder:  function (v) { _isLoadingOlder = v; },
      setHasMore:       function (v) { _hasMore = v; },
      bumpReadGen:      function ()  { return ++_readGeneration; },

      upsertSession: function (sid, data) {
        _sessions[sid] = Object.assign({}, _sessions[sid] || {}, data);
        return Object.assign({}, _sessions[sid]);
      },

      getSession: function (sid) {
        return _sessions[sid] ? Object.assign({}, _sessions[sid]) : null;
      },

      removeSession: function (sid) { delete _sessions[sid]; },

      setSessions: function (obj) { _sessions = Object.assign({}, obj); },

      setActiveMessages: function (msgs) {
        if (msgs.length > Cfg.MSG_MAX_MEMORY) {
          msgs = msgs.slice(msgs.length - Cfg.MSG_MAX_MEMORY);
        }
        _activeMsgs  = msgs;
        _seenKeys    = new Set(msgs.map(function (m) { return m._key; }));
        _oldestKey   = msgs.length > 0 ? msgs[0]._key : null;
        _optimisticKeys = new Set();
      },

      /**
       * [R2] Register an optimistic key so the real confirmed message
       * can be identified and used to swap the DOM node in-place.
       */
      registerOptimistic: function (tempKey) {
        _seenKeys.add(tempKey);
        _optimisticKeys.add(tempKey);
      },

      isOptimistic: function (key) {
        return _optimisticKeys.has(key);
      },

      /**
       * Append a real message. If there's a pending optimistic bubble,
       * returns its tempKey so the renderer can swap it. Otherwise returns null.
       * The optimistic key is evicted from seenKeys so the real message is accepted.
       */
      confirmOptimistic: function (realMsg) {
        // Find any optimistic key — there's at most one in-flight at a time due to send lock
        if (_optimisticKeys.size === 0) return null;
        var tempKey = _optimisticKeys.values().next().value;
        // Remove optimistic from seen so appendMessage accepts the real message
        _seenKeys.delete(tempKey);
        _optimisticKeys.delete(tempKey);
        // Also remove from _activeMsgs to avoid ghost entry
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
        var newMsgs = msgs.filter(function (m) {
          return m._key && !_seenKeys.has(m._key);
        });
        newMsgs.forEach(function (m) { _seenKeys.add(m._key); });
        _activeMsgs = newMsgs.concat(_activeMsgs);
        if (newMsgs.length > 0) _oldestKey = newMsgs[0]._key;
        return newMsgs;
      },

      registerSub: function (name, sub) {
        if (_subs[name]) {
          console.warn('[ChatState] Overwriting un-detached sub: ' + name);
        }
        _subs[name] = sub;
      },

      clearSub: function (name) { _subs[name] = null; },

      resetSession: function () {
        _activeSid      = null;
        _activeMsgs     = [];
        _seenKeys       = new Set();
        _optimisticKeys = new Set();
        _oldestKey      = null;
        _hasMore        = false;
        _isLoadingOlder = false;
        _isSending      = false;
      },

      snapshot: function () {
        return {
          sessionsCount:  Object.keys(_sessions).length,
          activeSid:      _activeSid,
          messagesCount:  _activeMsgs.length,
          hasMore:        _hasMore,
          filterTab:      _filterTab,
          isSending:      _isSending,
          activeSubs:     Object.keys(_subs).filter(function (k) { return !!_subs[k]; }),
        };
      },
    };

  }());

  /* ─────────────────────────────────────────
     FIREBASE DATA LAYER
  ───────────────────────────────────────── */
  var ChatDB = {

    detach: function (sub, eventType) {
      if (!sub || !sub.ref || !sub.cb) return;
      try { sub.ref.off(eventType, sub.cb); }
      catch (e) { console.error('[ChatDB.detach]', eventType, e); }
    },

    subscribeInbox: function (onAdded, onChanged, onRemoved, onError) {
      var ref = rtdb.ref(INBOX_ROOT)
        .orderByChild('lastMessageAt')
        .limitToLast(Cfg.INBOX_PAGE);

      var addedCb   = function (s) { if (s.val()) onAdded(s.key, s.val()); };
      var changedCb = function (s) { if (s.val()) onChanged(s.key, s.val()); };
      var removedCb = function (s) { onRemoved(s.key); };

      ref.on('child_added',   addedCb,   function (e) { onError && onError(e); });
      ref.on('child_changed', changedCb, function (e) { onError && onError(e); });
      ref.on('child_removed', removedCb, function (e) { onError && onError(e); });

      return {
        added:   { ref: ref, cb: addedCb,   event: 'child_added'   },
        changed: { ref: ref, cb: changedCb, event: 'child_changed' },
        removed: { ref: ref, cb: removedCb, event: 'child_removed' },
      };
    },

    /**
     * [R4] Buffer-before-once, fixed for high-traffic sessions.
     *
     * The broad liveRef now uses limitToLast(1) during buffering phase —
     * it only buffers brand-new messages, not the entire history.
     * The initial batch is loaded via .once() separately.
     * After initial load, liveRef is replaced with startAfter(lastKey).
     *
     * This prevents the buffer from accumulating 80 messages in high-traffic
     * sessions, while still closing the gap window.
     */
    loadAndSubscribeMessages: function (sessionId, onInitial, onNewMessage, onSubReady, onError) {
      var msgsPath   = CHAT_ROOT + '/' + sessionId + '/messages';
      var msgsRef    = rtdb.ref(msgsPath);

      var buffer      = [];
      var initialDone = false;
      var initialKeys = new Set();

      // Phase 1: Attach a minimal live listener (only catches brand-new messages)
      // This ref fires child_added for at most 1 existing message — not the whole history.
      // Its sole purpose is to catch messages arriving during the .once() round-trip.
      var gapRef = msgsRef.orderByKey().limitToLast(1);
      var gapCb  = function (childSnap) {
        var msg = Object.assign({ _key: childSnap.key }, childSnap.val());
        if (!initialDone) {
          buffer.push(msg);
        } else if (!initialKeys.has(msg._key)) {
          onNewMessage(msg);
        }
      };
      gapRef.on('child_added', gapCb, function (e) {
        console.error('[ChatDB.gap]', e);
        onError && onError(e);
      });

      // Register gap sub immediately so it can be detached if session changes
      onSubReady({ ref: gapRef, cb: gapCb, event: 'child_added' });

      // Phase 2: Load initial batch
      msgsRef.orderByKey()
        .limitToLast(Cfg.MSG_INITIAL)
        .once('value')
        .then(function (snap) {
          var msgs = [];
          snap.forEach(function (child) {
            var msg = Object.assign({ _key: child.key }, child.val());
            msgs.push(msg);
            initialKeys.add(child.key);
          });
          msgs.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

          var hasMore = snap.numChildren() >= Cfg.MSG_INITIAL;
          initialDone = true;

          onInitial(msgs, hasMore);

          // Replay any buffered messages not in initial batch
          buffer.forEach(function (msg) {
            if (!initialKeys.has(msg._key)) onNewMessage(msg);
          });
          buffer = [];

          // Phase 3: Replace gap listener with precise startAfter listener
          gapRef.off('child_added', gapCb);

          var lastKey  = msgs.length > 0 ? msgs[msgs.length - 1]._key : null;
          var liveRef;

          if (lastKey) {
            liveRef = U.sdkHasStartAfter
              ? msgsRef.orderByKey().startAfter(lastKey)
              : msgsRef.orderByKey().startAt(lastKey); // inclusive — dedup handles re-delivery
          } else {
            liveRef = msgsRef.orderByKey().limitToLast(1);
          }

          var liveCb = function (childSnap) {
            onNewMessage(Object.assign({ _key: childSnap.key }, childSnap.val()));
          };

          liveRef.on('child_added', liveCb, function (e) {
            console.error('[ChatDB.live]', e);
            onError && onError(e);
          });

          // Update registered sub to the precise listener
          onSubReady({ ref: liveRef, cb: liveCb, event: 'child_added' });
        })
        .catch(function (err) {
          console.error('[ChatDB.loadAndSubscribeMessages]', err);
          gapRef.off('child_added', gapCb);
          onError && onError(err);
        });
    },

    loadOlderMessages: function (sessionId, beforeKey, onMessages, onError) {
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages')
        .orderByKey()
        .endBefore(beforeKey)
        .limitToLast(Cfg.MSG_PAGE)
        .once('value')
        .then(function (snap) {
          var msgs = [];
          snap.forEach(function (child) {
            msgs.push(Object.assign({ _key: child.key }, child.val()));
          });
          msgs.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
          onMessages(msgs, msgs.length >= Cfg.MSG_PAGE);
        })
        .catch(function (err) {
          console.error('[ChatDB.loadOlderMessages]', err);
          onError && onError(err);
        });
    },

    subscribeTyping: function (sessionId, onChange) {
      var ref = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/customerTyping');
      var cb  = function (snap) { onChange(snap.val() === true); };
      ref.on('value', cb, function (e) { console.error('[ChatDB.typing]', e); });
      return { ref: ref, cb: cb, event: 'value' };
    },

    subscribeConnected: function (onChange) {
      var ref = rtdb.ref('.info/connected');
      var cb  = function (snap) { onChange(snap.val() === true); };
      ref.on('value', cb, function (e) { console.error('[ChatDB.connected]', e); });
      return { ref: ref, cb: cb, event: 'value' };
    },

    sendMessage: function (sessionId, text) {
      var msgRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').push();
      var ts     = firebase.database.ServerValue.TIMESTAMP;
      var updates = {};
      updates[CHAT_ROOT + '/' + sessionId + '/messages/' + msgRef.key] = {
        text: text, sender: 'admin', createdAt: ts,
        read: true, delivered: true, sessionId: sessionId,
      };
      // Clear this admin's typing flag atomically
      updates[CHAT_ROOT + '/' + sessionId + '/meta/adminTyping/' + getAdminId()] = null;
      // Update flat inbox index (unreadCount NOT touched — Cloud Function owns it)
      updates[INBOX_ROOT + '/' + sessionId + '/lastMessage']   = text;
      updates[INBOX_ROOT + '/' + sessionId + '/lastMessageAt'] = ts;

      return rtdb.ref('/').update(updates);
    },

    /**
     * [R1][R7] markSessionAsRead:
     * - Queries messages with read===false (requires .indexOn:["read"] in rules)
     * - Filters customer messages client-side
     * - Only writes unreadCount:0 if at least one message was found
     * - Generation guard prevents stale writes from concurrent calls
     */
    markSessionAsRead: function (sessionId, gen) {
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages')
        .orderByChild('read')
        .equalTo(false)
        .once('value')
        .then(function (snap) {
          if (ChatState.getReadGen() !== gen) return; // stale — bail

          var updates = {};
          snap.forEach(function (child) {
            var msg = child.val();
            if (msg && msg.sender === 'customer') {
              updates[CHAT_ROOT + '/' + sessionId + '/messages/' + child.key + '/read'] = true;
            }
          });

          // [R1] Only zero unreadCount if we actually found messages to mark
          if (Object.keys(updates).length > 0) {
            updates[INBOX_ROOT + '/' + sessionId + '/unreadCount'] = 0;
            return rtdb.ref('/').update(updates);
          }
        })
        .catch(function (e) { console.error('[ChatDB.markSessionAsRead]', e); });
    },

    /**
     * [R9] Per-admin typing: write to adminTyping/{adminId} not adminTyping (bool).
     * Customer app should watch adminTyping and show indicator if any child is true.
     * Multiple admins can type simultaneously without clobbering each other.
     */
    setAdminTyping: function (sessionId, val) {
      var adminId = getAdminId();
      return rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping/' + adminId)
        .set(val ? true : null)  // null removes the key entirely
        .catch(function (e) { console.error('[ChatDB.setAdminTyping]', e); });
    },

    saveNote: function (sessionId, text) {
      var updates = {};
      updates[CHAT_ROOT + '/' + sessionId + '/meta/adminNote']       = text;
      updates[CHAT_ROOT + '/' + sessionId + '/meta/noteLocked']      = null; // [R8] release lock
      return rtdb.ref('/').update(updates);
    },

    loadNote: function (sessionId) {
      return rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminNote').once('value');
    },

    /**
     * [R8] Note locking for multi-admin.
     */
    lockNote: function (sessionId) {
      var ref = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/noteLocked');
      return ref.once('value').then(function (snap) {
        var lock = snap.val();
        var adminId = getAdminId();
        if (lock && lock.adminId && lock.adminId !== adminId) {
          // Another admin has the lock
          var since = lock.ts ? Math.round((Date.now() - lock.ts) / 1000) : '?';
          return { locked: true, by: lock.adminId, since: since };
        }
        // Acquire lock
        return ref.set({ adminId: adminId, ts: firebase.database.ServerValue.TIMESTAMP })
          .then(function () { return { locked: false }; });
      });
    },

    unlockNote: function (sessionId) {
      var ref  = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/noteLocked');
      var adId = getAdminId();
      return ref.once('value').then(function (snap) {
        var lock = snap.val();
        // Only release if we own the lock
        if (lock && lock.adminId === adId) return ref.set(null);
      }).catch(function (e) { console.error('[ChatDB.unlockNote]', e); });
    },

    /**
     * [R6] Pin toggle — reads current state and inverts.
     */
    togglePin: function (sessionId, currentlyPinned) {
      var pinned  = !currentlyPinned;
      var updates = {};
      updates[CHAT_ROOT + '/' + sessionId + '/meta/pinned'] = pinned;
      updates[INBOX_ROOT + '/' + sessionId + '/pinned']     = pinned;
      return rtdb.ref('/').update(updates).then(function () { return pinned; });
    },

    lookupOrders: function (sessionId) {
      return ordersRef.where('chatSessionId', '==', sessionId).limit(10).get();
    },
  };

  /* ─────────────────────────────────────────
     RENDERER
  ───────────────────────────────────────── */
  var ChatRenderer = {

    renderInboxShell: function (container) {
      container.innerHTML = [
        '<div class="section-header" style="margin-bottom:12px;">',
          '<div class="section-title">Inbox</div>',
          '<div class="section-actions">',
            '<input class="search-input" id="chat-search" placeholder="Search\u2026"',
              ' autocomplete="off" style="min-width:140px;max-width:200px;">',
          '</div>',
        '</div>',
        '<div id="chat-offline-banner" style="display:none;background:var(--warning,#f59e0b);',
          'color:#fff;font-size:11px;padding:6px 12px;border-radius:4px;margin-bottom:8px;">',
          '\u26a0\ufe0f Offline \u2014 showing cached data',
        '</div>',
        '<div style="display:flex;gap:6px;margin-bottom:12px;" id="chat-tab-bar">',
          '<button class="btn btn-sm btn-primary" data-tab="all"    id="chat-tab-all">All</button>',
          '<button class="btn btn-sm btn-ghost"   data-tab="unread" id="chat-tab-unread">Unread</button>',
          '<button class="btn btn-sm btn-ghost"   data-tab="pinned" id="chat-tab-pinned">Pinned</button>',
        '</div>',
        '<div id="chat-sessions-wrap" class="chat-sessions-wrap"></div>',
      ].join('');
    },

    renderSessionsList: function (sessions) {
      var wrap = safeEl('chat-sessions-wrap');
      if (!wrap) return;
      var ids  = this._filteredSortedIds(sessions);
      if (ids.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="empty-state-icon">\u2709</div>' +
          '<div class="empty-state-text">No sessions found.</div>';
        U.replaceChildren(wrap, empty);
        return;
      }
      var frag = document.createDocumentFragment();
      for (var i = 0; i < ids.length; i++) {
        frag.appendChild(this._buildCard(ids[i], sessions[ids[i]]));
      }
      U.replaceChildren(wrap, frag);
    },

    /**
     * [R5] updateCard + repositionCard: querySelector runs AFTER replaceWith
     * to get the fresh node reference, not the stale pre-replace one.
     */
    updateCard: function (sid, data, sessions) {
      var wrap    = safeEl('chat-sessions-wrap');
      if (!wrap) return;
      var escaped = U.cssEscape(sid);
      var existing = wrap.querySelector('[data-sid="' + escaped + '"]');
      var newCard  = this._buildCard(sid, data);

      if (existing) {
        existing.replaceWith(newCard);
        // [R5] repositionCard now queries the DOM again — finds the NEW node
      } else {
        wrap.appendChild(newCard);
      }

      this._repositionCard(sid, sessions, wrap);
    },

    _repositionCard: function (sid, sessions, wrap) {
      var escaped = U.cssEscape(sid);
      // [R5] Query AFTER replaceWith — gets the fresh node
      var card = wrap.querySelector('[data-sid="' + escaped + '"]');
      if (!card) return;

      var ids     = this._filteredSortedIds(sessions);
      var pos     = ids.indexOf(sid);

      if (pos === -1) {
        card.parentNode && card.parentNode.removeChild(card);
        return;
      }

      // Build ordered list of current DOM sids (excluding the card being moved)
      var allCards = wrap.querySelectorAll('[data-sid]');
      var domSids  = [];
      for (var i = 0; i < allCards.length; i++) {
        if (allCards[i] !== card) domSids.push(allCards[i].dataset.sid);
      }

      // Find the first card in DOM order whose target position is > pos
      // — insert the moved card before it
      var insertBefore = null;
      for (var j = 0; j < domSids.length; j++) {
        var targetPos = ids.indexOf(domSids[j]);
        if (targetPos > pos) {
          insertBefore = wrap.querySelector('[data-sid="' + U.cssEscape(domSids[j]) + '"]');
          break;
        }
      }

      if (insertBefore) {
        wrap.insertBefore(card, insertBefore);
      } else {
        wrap.appendChild(card);
      }
    },

    removeCard: function (sid) {
      var wrap = safeEl('chat-sessions-wrap');
      if (!wrap) return;
      var el = wrap.querySelector('[data-sid="' + U.cssEscape(sid) + '"]');
      if (el) el.parentNode.removeChild(el);
    },

    _filteredSortedIds: function (sessions) {
      var tab    = ChatState.getFilterTab();
      var search = ChatState.getSearchQuery().toLowerCase();

      var ids = Object.keys(sessions).filter(function (sid) {
        var s = sessions[sid];
        if (tab === 'unread' && !s.unreadCount) return false;
        if (tab === 'pinned' && !s.pinned)      return false;
        var target = ((s.customerName || '') + ' ' + sid).toLowerCase();
        if (search && target.indexOf(search) === -1) return false;
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
        : s.pinned
          ? '<span class="badge badge-processing" style="font-size:9px;">Pinned</span>'
          : '';

      var card = document.createElement('div');
      card.className = 'chat-session-card' + (s.unreadCount > 0 ? ' unread' : '');
      card.setAttribute('data-sid', sid);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<div class="chat-avatar ' + esc(avClass) + '">' + esc(avInit) + '</div>' +
        '<div class="session-info">' +
          '<div class="session-id-label">' + esc(name) + '</div>' +
          '<div class="session-preview">' + esc(preview) +
            (preview.length >= 70 ? '\u2026' : '') + '</div>' +
        '</div>' +
        '<div class="session-right">' +
          '<span class="session-time">' + esc(time) + '</span>' + badge +
        '</div>';
      return card;
    },

    renderSessionShell: function (container, sessionId, isPinned) {
      var avClass = esc(avatarClass(sessionId));
      var avInit  = esc(avatarInitials(sessionId));
      var name    = esc(sessionId.substring(0, 26));

      container.innerHTML = [
        '<button class="back-link" id="chat-back-btn">\u2190 Inbox</button>',
        '<div class="section-header">',
          '<div style="display:flex;align-items:center;gap:10px;">',
            '<div class="chat-avatar ' + avClass + '"',
              ' style="width:36px;height:36px;font-size:12px;">' + avInit + '</div>',
            '<div>',
              '<div style="font-size:14px;font-weight:500;" id="session-name-label">' + name + '</div>',
              '<div id="session-status-label"',
                ' style="font-size:11px;color:var(--muted);margin-top:1px;">Live Session</div>',
            '</div>',
          '</div>',
          '<div style="display:flex;gap:8px;">',
            '<button class="btn btn-sm btn-ghost" id="chat-pin-btn"',
              ' data-pinned="' + (isPinned ? '1' : '0') + '">',
              isPinned ? 'Unpin' : 'Pin',
            '</button>',
            '<button class="btn btn-sm btn-ghost" id="chat-orders-btn">Orders</button>',
          '</div>',
        '</div>',
        '<div style="display:grid;grid-template-columns:1fr;gap:12px;">',
          '<div class="chat-view-wrap">',
            '<div id="chat-load-more-wrap" style="text-align:center;padding:6px;display:none;">',
              '<button class="btn btn-sm btn-ghost" id="chat-load-more-btn">Load older messages</button>',
            '</div>',
            '<div id="chat-history-start"',
              ' style="display:none;text-align:center;color:var(--muted);',
              'font-size:10.5px;padding:8px 0;">\u2014 Beginning of conversation \u2014</div>',
            '<div class="chat-messages-panel" id="chat-messages-panel">',
              '<div style="text-align:center;color:var(--muted);font-size:11px;padding:24px;">Loading\u2026</div>',
            '</div>',
            '<div id="chat-new-msg-banner" style="display:none;text-align:center;padding:4px 0;">',
              '<button class="btn btn-sm btn-primary" id="chat-scroll-down-btn">\u2193 New messages</button>',
            '</div>',
            '<div class="typing-indicator" id="typing-indicator"',
              ' style="display:none;align-items:center;gap:2px;" aria-live="polite">',
              '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>',
              '<em style="font-size:10px;margin-left:6px;">Customer is typing\u2026</em>',
            '</div>',
            '<div class="quick-replies" id="quick-replies-row">',
              QUICK_REPLIES.map(function (r) {
                return '<button class="quick-reply-btn" data-reply="' + esc(r) + '">' + esc(r) + '</button>';
              }).join(''),
            '</div>',
            '<div class="reply-box">',
              '<input id="reply-input" placeholder="Write a reply\u2026" autocomplete="off">',
              '<button class="chat-send-btn" id="chat-send-btn">Send</button>',
            '</div>',
          '</div>',
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
            '<div class="card">',
              '<div class="card-header"><span class="card-title">Customer Info</span></div>',
              '<div style="padding:12px 14px;">',
                '<div class="info-row" style="background:none;border:none;padding:4px 0;">',
                  '<span class="label">Session</span>',
                  '<span style="font-size:10.5px;">' + esc(sessionId.substring(0, 14)) + '</span>',
                '</div>',
                '<div class="info-row" style="background:none;border:none;padding:4px 0;">',
                  '<span class="label">Status</span><span style="color:var(--success);">Active</span>',
                '</div>',
              '</div>',
            '</div>',
            '<div class="card">',
              '<div class="card-header">',
                '<span class="card-title">Support Notes</span>',
                '<span id="note-lock-indicator"',
                  ' style="font-size:9px;color:var(--warning,#f59e0b);margin-left:8px;display:none;">',
                  '\u26a0\ufe0f Locked by another admin',
                '</span>',
              '</div>',
              '<div style="padding:12px 14px;">',
                '<textarea id="chat-note"',
                  ' style="width:100%;border:0.5px solid var(--border-med);padding:8px;',
                  'font-family:Manrope,sans-serif;font-size:11.5px;font-weight:300;',
                  'min-height:60px;background:var(--surface2);outline:none;',
                  'border-radius:7px;resize:vertical;" placeholder="Internal notes\u2026"></textarea>',
                '<button class="btn btn-sm btn-ghost" id="chat-save-note-btn"',
                  ' style="margin-top:7px;width:100%;">Save Note</button>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',
      ].join('');
    },

    renderMessages: function (msgs, panel) {
      if (!panel) return;
      if (!msgs || msgs.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;padding:24px;';
        empty.textContent = 'No messages yet.';
        U.replaceChildren(panel, empty);
        return;
      }
      var frag   = document.createDocumentFragment();
      var groups = U.groupMessages(msgs);
      for (var i = 0; i < groups.length; i++) {
        frag.appendChild(this._buildGroup(groups[i]));
      }
      U.replaceChildren(panel, frag);
      U.scrollToBottom(panel);
    },

    /**
     * [R2] appendMessage: if there is an optimistic bubble for this sender,
     * swap it in-place rather than appending a new one.
     */
    appendMessage: function (msg, panel, tempKey) {
      if (!panel) return;
      var wasAtBottom = U.isNearBottom(panel);

      if (tempKey) {
        // Swap optimistic bubble in-place
        var optEl = panel.querySelector('[data-key="' + tempKey + '"]');
        if (optEl) {
          var realBubble = this._buildBubble(msg);
          optEl.parentNode.replaceChild(realBubble, optEl);
          if (wasAtBottom) U.scrollToBottom(panel, true);
          return;
        }
      }

      // Normal append (no optimistic to swap)
      var isAdmin   = msg.sender !== 'customer';
      var groupCls  = isAdmin ? 'msg-group--admin' : 'msg-group--customer';
      var lastGroup = panel.querySelector('.msg-group:last-child');

      if (lastGroup && lastGroup.classList.contains(groupCls)) {
        lastGroup.appendChild(this._buildBubble(msg));
      } else {
        var g = document.createElement('div');
        g.className = 'msg-group ' + groupCls;
        g.appendChild(this._buildBubble(msg));
        panel.appendChild(g);
      }

      if (wasAtBottom) {
        U.scrollToBottom(panel, true);
        var banner = safeEl('chat-new-msg-banner');
        if (banner) banner.style.display = 'none';
      } else {
        var banner2 = safeEl('chat-new-msg-banner');
        if (banner2) banner2.style.display = 'block';
      }
    },

    /**
     * [R13] Prepend with rAF-based scroll restoration to avoid mobile Safari
     * scrollHeight instability during layout.
     */
    prependMessages: function (msgs, panel) {
      if (!panel || !msgs || msgs.length === 0) return;
      var prevTop = panel.scrollTop;

      var groups = U.groupMessages(msgs);
      var frag   = document.createDocumentFragment();
      var firstOldGroup = panel.querySelector('.msg-group:first-child');

      for (var i = 0; i < groups.length; i++) {
        var group   = groups[i];
        var isAdmin = group.sender !== 'customer';
        var cls     = isAdmin ? 'msg-group--admin' : 'msg-group--customer';

        if (i === groups.length - 1 && firstOldGroup && firstOldGroup.classList.contains(cls)) {
          // Merge boundary group
          var ref = firstOldGroup.firstChild || null;
          for (var j = 0; j < group.items.length; j++) {
            firstOldGroup.insertBefore(this._buildBubble(group.items[j]), ref);
          }
          break;
        }
        frag.appendChild(this._buildGroup(group));
      }

      var addedH = 0;
      // Measure height of fragment before insertion
      var measure = document.createElement('div');
      measure.style.cssText = 'position:absolute;visibility:hidden;';
      measure.appendChild(frag.cloneNode(true));
      document.body.appendChild(measure);
      addedH = measure.offsetHeight;
      document.body.removeChild(measure);

      panel.insertBefore(frag, panel.firstChild);

      // [R13] Use rAF to restore scroll after layout is complete
      U.raf(function () {
        panel.scrollTop = prevTop + addedH;
      });
    },

    appendOptimisticMessage: function (text, panel) {
      if (!panel) return null;
      var tempKey = '__opt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var fakeMsg = {
        _key: tempKey, text: text, sender: 'admin',
        createdAt: Date.now(), read: false, delivered: false,
      };
      // Don't go through state.appendMessage — optimistic is tracked separately
      var isAdmin   = true;
      var lastGroup = panel.querySelector('.msg-group:last-child');
      var bubble    = this._buildBubble(fakeMsg);
      // Style optimistic differently (dimmed)
      bubble.style.opacity = '0.6';

      if (lastGroup && lastGroup.classList.contains('msg-group--admin')) {
        lastGroup.appendChild(bubble);
      } else {
        var g = document.createElement('div');
        g.className = 'msg-group msg-group--admin';
        g.appendChild(bubble);
        panel.appendChild(g);
      }
      U.scrollToBottom(panel, true);
      return tempKey;
    },

    _buildGroup: function (group) {
      var isAdmin = group.sender !== 'customer';
      var el = document.createElement('div');
      el.className = 'msg-group' + (isAdmin ? ' msg-group--admin' : ' msg-group--customer');
      for (var i = 0; i < group.items.length; i++) {
        el.appendChild(this._buildBubble(group.items[i]));
      }
      return el;
    },

    _buildBubble: function (m) {
      var isAdmin = m.sender !== 'customer';
      var wrap    = document.createElement('div');
      wrap.className = 'chat-msg-admin' + (isAdmin ? '' : ' customer-msg');
      if (m._key) wrap.setAttribute('data-key', m._key);

      var bubble = document.createElement('div');
      bubble.className   = 'chat-bubble';
      bubble.textContent = m.text || '';

      var statusHtml = '';
      if (isAdmin) {
        if (m.read)
          statusHtml = '<span class="msg-status msg-status--read" title="Read">\u2713\u2713</span>';
        else if (m.delivered)
          statusHtml = '<span class="msg-status msg-status--delivered" title="Delivered">\u2713\u2713</span>';
        else
          statusHtml = '<span class="msg-status msg-status--sent" title="Sent">\u2713</span>';
      }

      var meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML = esc(m.sender || '') + ' \u00b7 ' +
        esc(m.createdAt ? fmtTime(m.createdAt) : '') + statusHtml;

      wrap.appendChild(bubble);
      wrap.appendChild(meta);
      return wrap;
    },

    setTypingVisible: function (v) {
      var el = safeEl('typing-indicator');
      if (el) el.style.display = v ? 'flex' : 'none';
    },

    setLoadMoreVisible: function (v) {
      var w = safeEl('chat-load-more-wrap');
      if (w) w.style.display = v ? 'block' : 'none';
      var h = safeEl('chat-history-start');
      if (h) h.style.display = v ? 'none' : 'block';
    },

    setSendLock: function (locked) {
      var input = safeEl('reply-input');
      var btn   = safeEl('chat-send-btn');
      if (input) input.disabled = locked;
      if (btn)   btn.disabled   = locked;
    },

    setOfflineBanner: function (offline) {
      var el = safeEl('chat-offline-banner');
      if (el) el.style.display = offline ? 'block' : 'none';
    },

    setPinButton: function (pinned) {
      var btn = safeEl('chat-pin-btn');
      if (!btn) return;
      btn.textContent = pinned ? 'Unpin' : 'Pin';
      btn.setAttribute('data-pinned', pinned ? '1' : '0');
    },

    setTabActive: function (tab) {
      ['all', 'unread', 'pinned'].forEach(function (t) {
        var b = safeEl('chat-tab-' + t);
        if (b) b.className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-ghost');
      });
    },

    setNoteLock: function (locked, byWhom) {
      var indicator = safeEl('note-lock-indicator');
      var noteEl    = safeEl('chat-note');
      var saveBtn   = safeEl('chat-save-note-btn');
      if (indicator) indicator.style.display = locked ? 'inline' : 'none';
      if (noteEl)    noteEl.disabled          = locked;
      if (saveBtn)   saveBtn.disabled         = locked;
    },
  };

  /* ─────────────────────────────────────────
     CONTROLLER
  ───────────────────────────────────────── */
  var ChatController = {

    _detachInbox: function () {
      var map = { inboxAdded: 'child_added', inboxChanged: 'child_changed', inboxRemoved: 'child_removed' };
      Object.keys(map).forEach(function (name) {
        var sub = ChatState.getSub(name);
        if (sub) { ChatDB.detach(sub, map[name]); ChatState.clearSub(name); }
      });
    },

    _detachMsgSub: function () {
      var sub = ChatState.getSub('msgAdded');
      if (sub) { ChatDB.detach(sub, 'child_added'); ChatState.clearSub('msgAdded'); }
    },

    _detachSession: function (sessionId) {
      this._detachMsgSub();
      var typing = ChatState.getSub('typing');
      if (typing) { ChatDB.detach(typing, 'value'); ChatState.clearSub('typing'); }
      if (sessionId) {
        ChatDB.setAdminTyping(sessionId, false);
        ChatDB.unlockNote(sessionId);
      }
      var t = ChatState.getTypingTimer();
      if (t) { clearTimeout(t); ChatState.setTypingTimer(null); }
    },

    /* [R15] Connection monitor — skip first event (initial subscription fire) */
    _initConnectionMonitor: function () {
      var existing = ChatState.getSub('connected');
      if (existing) { ChatDB.detach(existing, 'value'); ChatState.clearSub('connected'); }
      var firstEvent = true;
      var sub = ChatDB.subscribeConnected(function (online) {
        if (firstEvent) { firstEvent = false; return; } // [R15] skip initial fire
        ChatRenderer.setOfflineBanner(!online);
        if (online) {
          var sid = ChatState.getActiveSid();
          if (sid) {
            var gen = ChatState.bumpReadGen();
            ChatDB.markSessionAsRead(sid, gen);
          }
        }
      });
      ChatState.registerSub('connected', sub);
    },

    /* ── Inbox ── */

    loadInbox: function () {
      var self    = this;
      var mc      = safeEl('main-content');
      if (!mc) return;

      self._detachSession(ChatState.getActiveSid());
      self._detachInbox();
      ChatState.resetSession();

      ChatRenderer.renderInboxShell(mc);
      self._bindInboxEvents();
      self._initConnectionMonitor();

      var cached = U.lsGet(Cfg.LS_KEY, Cfg.LS_TTL_MS);
      if (cached) {
        ChatState.setSessions(cached);
        ChatRenderer.renderSessionsList(cached);
      } else {
        var wrap = safeEl('chat-sessions-wrap');
        if (wrap) wrap.innerHTML =
          '<div class="empty-state"><div class="empty-state-icon">\u2709</div>' +
          '<div class="empty-state-text">Loading\u2026</div></div>';
      }

      self._subscribeInbox();
    },

    /* [R3][R11] Inbox subscription isolated so retry re-subscribes only, not re-renders */
    _subscribeInbox: function () {
      var self = this;

      // Detach any partial subs before re-subscribing
      self._detachInbox();

      var subs = ChatDB.subscribeInbox(
        function (sid, data) {
          var entry = ChatState.upsertSession(sid, data);
          ChatRenderer.updateCard(sid, entry, ChatState.getSessions());
          U.lsSet(Cfg.LS_KEY, ChatState.getSessions());
        },
        function (sid, data) {
          var entry = ChatState.upsertSession(sid, data);
          ChatRenderer.updateCard(sid, entry, ChatState.getSessions());
          U.lsSet(Cfg.LS_KEY, ChatState.getSessions());
        },
        function (sid) {
          ChatState.removeSession(sid);
          ChatRenderer.removeCard(sid);
          U.lsSet(Cfg.LS_KEY, ChatState.getSessions());
        },
        function (err) {
          console.error('[ChatController._subscribeInbox]', err);
          self._retryInbox(0);
        }
      );

      ChatState.registerSub('inboxAdded',   subs.added);
      ChatState.registerSub('inboxChanged', subs.changed);
      ChatState.registerSub('inboxRemoved', subs.removed);
    },

    /* [R11] Retry is local — does not exhaust across independent loadInbox calls */
    _retryInbox: function (attempt) {
      var self = this;
      if (attempt >= Cfg.RETRY_MAX_ATTEMPTS) {
        showToast('Inbox connection lost. Please reload.', 'error');
        return;
      }
      var delay = U.retryDelay(attempt);
      console.warn('[ChatController] Retrying inbox in ' + delay + 'ms (attempt ' + (attempt + 1) + ')');
      setTimeout(function () {
        self._subscribeInbox(); // re-subscribe only, no shell re-render
      }, delay);
    },

    /* ── Open session ── */

    openSession: function (sessionId) {
      var self = this;
      if (!sessionId || typeof sessionId !== 'string') return;
      if (ChatState.getActiveSid() === sessionId) return;

      self._detachSession(ChatState.getActiveSid());
      ChatState.resetSession();
      ChatState.setActiveSid(sessionId);

      var mc = safeEl('main-content');
      if (!mc) return;

      var sessionData = ChatState.getSession(sessionId);
      var isPinned    = sessionData ? !!sessionData.pinned : false;

      ChatRenderer.renderSessionShell(mc, sessionId, isPinned);
      self._bindSessionEvents(sessionId);
      ChatRenderer.setTypingVisible(false);

      // Mark as read
      var gen = ChatState.bumpReadGen();
      ChatDB.markSessionAsRead(sessionId, gen);

      // Load note
      ChatDB.loadNote(sessionId)
        .then(function (snap) {
          var el = safeEl('chat-note');
          if (el && snap.val()) el.value = snap.val();
        })
        .catch(function (e) { console.error('[openSession:note]', e); });

      // Show customer name if known
      if (sessionData && sessionData.customerName) {
        var nameEl = safeEl('session-name-label');
        if (nameEl) nameEl.textContent = sessionData.customerName;
      }

      // Message subscription
      ChatDB.loadAndSubscribeMessages(
        sessionId,
        function (msgs, hasMore) {
          if (ChatState.getActiveSid() !== sessionId) return;
          ChatState.setActiveMessages(msgs);
          ChatState.setHasMore(hasMore);
          var panel = safeEl('chat-messages-panel');
          ChatRenderer.renderMessages(msgs, panel);
          ChatRenderer.setLoadMoreVisible(hasMore);
        },
        function (msg) {
          if (ChatState.getActiveSid() !== sessionId) return;
          // [R2] Check for optimistic bubble to swap
          var tempKey = (msg.sender === 'admin') ? ChatState.confirmOptimistic(msg) : null;
          var added   = ChatState.appendMessage(msg);
          if (!added && !tempKey) return;
          var panel = safeEl('chat-messages-panel');
          ChatRenderer.appendMessage(msg, panel, tempKey);
          if (msg.sender === 'customer') {
            var g = ChatState.bumpReadGen();
            ChatDB.markSessionAsRead(sessionId, g);
          }
        },
        function (sub) {
          if (ChatState.getActiveSid() !== sessionId) {
            ChatDB.detach(sub, 'child_added');
            return;
          }
          var existing = ChatState.getSub('msgAdded');
          if (existing) ChatDB.detach(existing, 'child_added');
          ChatState.clearSub('msgAdded');
          ChatState.registerSub('msgAdded', sub);
        },
        function (err) {
          if (ChatState.getActiveSid() !== sessionId) return;
          console.error('[openSession:messages]', err);
          self._retryMsgSub(sessionId, 0);
        }
      );

      // Typing
      var typingSub = ChatDB.subscribeTyping(sessionId, function (isTyping) {
        if (ChatState.getActiveSid() === sessionId) {
          ChatRenderer.setTypingVisible(isTyping);
        }
      });
      ChatState.registerSub('typing', typingSub);
    },

    _retryMsgSub: function (sessionId, attempt) {
      var self = this;
      if (attempt >= Cfg.RETRY_MAX_ATTEMPTS || ChatState.getActiveSid() !== sessionId) return;

      self._detachMsgSub(); // always detach before retry

      var delay = U.retryDelay(attempt);
      console.warn('[ChatController] Retrying msg sub in ' + delay + 'ms');

      setTimeout(function () {
        if (ChatState.getActiveSid() !== sessionId) return;
        ChatDB.loadAndSubscribeMessages(
          sessionId,
          function (msgs, hasMore) {
            if (ChatState.getActiveSid() !== sessionId) return;
            ChatState.setActiveMessages(msgs);
            ChatState.setHasMore(hasMore);
            var panel = safeEl('chat-messages-panel');
            ChatRenderer.renderMessages(msgs, panel);
            ChatRenderer.setLoadMoreVisible(hasMore);
          },
          function (msg) {
            if (ChatState.getActiveSid() !== sessionId) return;
            var tempKey = (msg.sender === 'admin') ? ChatState.confirmOptimistic(msg) : null;
            var added   = ChatState.appendMessage(msg);
            if (!added && !tempKey) return;
            ChatRenderer.appendMessage(msg, safeEl('chat-messages-panel'), tempKey);
          },
          function (sub) {
            if (ChatState.getActiveSid() !== sessionId) { ChatDB.detach(sub, 'child_added'); return; }
            var existing = ChatState.getSub('msgAdded');
            if (existing) ChatDB.detach(existing, 'child_added');
            ChatState.clearSub('msgAdded');
            ChatState.registerSub('msgAdded', sub);
          },
          function (err) { self._retryMsgSub(sessionId, attempt + 1); }
        );
      }, delay);
    },

    /* ── Send ── */

    sendMessage: function (sessionId) {
      if (ChatState.isSending()) return;
      var input = safeEl('reply-input');
      var text  = input && input.value.trim();
      if (!text || !sessionId) return;

      ChatState.setSending(true);
      ChatRenderer.setSendLock(true);
      input.value = '';

      var panel   = safeEl('chat-messages-panel');
      var tempKey = ChatRenderer.appendOptimisticMessage(text, panel);
      // [R2] Register optimistic key in state
      if (tempKey) ChatState.registerOptimistic(tempKey);

      ChatDB.sendMessage(sessionId, text)
        .catch(function (err) {
          console.error('[sendMessage]', err);
          showToast('Failed to send: ' + err.message, 'error');
          // Remove optimistic bubble on failure
          if (tempKey && panel) {
            var el = panel.querySelector('[data-key="' + tempKey + '"]');
            if (el) el.parentNode && el.parentNode.removeChild(el);
          }
          // Evict from optimistic set
          if (tempKey) ChatState.confirmOptimistic({ _key: '__evict__' });
          if (input) input.value = text;
        })
        .finally(function () {
          ChatState.setSending(false);
          ChatRenderer.setSendLock(false);
          if (input && !input.disabled) input.focus();
        });
    },

    /* ── Typing ── */

    handleAdminTyping: function (sessionId) {
      ChatDB.setAdminTyping(sessionId, true);
      var t = ChatState.getTypingTimer();
      if (t) clearTimeout(t);
      ChatState.setTypingTimer(setTimeout(function () {
        ChatDB.setAdminTyping(sessionId, false);
        ChatState.setTypingTimer(null);
      }, Cfg.TYPING_MS));
    },

    /* [R16] Pagination with in-flight guard */
    loadOlderMessages: function (sessionId) {
      if (ChatState.isLoadingOlder() || !ChatState.hasMore() || !ChatState.getOldestKey()) return;
      ChatState.setLoadingOlder(true);

      var btn = safeEl('chat-load-more-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Loading\u2026'; }

      ChatDB.loadOlderMessages(
        sessionId,
        ChatState.getOldestKey(),
        function (msgs, hasMore) {
          ChatState.setLoadingOlder(false);
          if (ChatState.getActiveSid() !== sessionId) return;
          var added = ChatState.prependMessages(msgs);
          ChatState.setHasMore(hasMore);
          var panel = safeEl('chat-messages-panel');
          ChatRenderer.prependMessages(added, panel);
          ChatRenderer.setLoadMoreVisible(hasMore);
          if (btn) { btn.disabled = false; btn.textContent = 'Load older messages'; }
        },
        function (err) {
          ChatState.setLoadingOlder(false);
          console.error('[loadOlderMessages]', err);
          showToast('Failed to load older messages', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Load older messages'; }
        }
      );
    },

    /* [R6] Pin toggle */
    togglePin: function (sessionId) {
      var btn       = safeEl('chat-pin-btn');
      var currently = btn ? btn.getAttribute('data-pinned') === '1' : false;
      ChatDB.togglePin(sessionId, currently)
        .then(function (newPinned) {
          ChatRenderer.setPinButton(newPinned);
          showToast(newPinned ? 'Chat pinned' : 'Chat unpinned');
        })
        .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
    },

    saveNote: function (sessionId) {
      var el = safeEl('chat-note');
      if (!el) return;
      ChatDB.saveNote(sessionId, el.value)
        .then(function () { showToast('Note saved'); })
        .catch(function (e) { showToast('Error: ' + e.message, 'error'); });
    },

    /* [R8] Acquire note lock on focus */
    handleNoteFocus: function (sessionId) {
      ChatDB.lockNote(sessionId).then(function (result) {
        if (result.locked) {
          ChatRenderer.setNoteLock(true, result.by);
          showToast('Note is being edited by another admin (' + result.since + 's ago)', 'info');
        }
      }).catch(function (e) { console.error('[handleNoteFocus]', e); });
    },

    handleNoteBlur: function (sessionId) {
      ChatDB.unlockNote(sessionId);
      ChatRenderer.setNoteLock(false);
    },

    lookupOrders: function (sessionId) {
      ChatDB.lookupOrders(sessionId)
        .then(function (snap) {
          showToast(snap.empty ? 'No orders linked' : 'Found ' + snap.size + ' order(s)', 'info');
        })
        .catch(function (e) { console.error('[lookupOrders]', e); });
    },

    setFilterTab: function (tab) {
      ChatState.setFilterTab(tab);
      ChatRenderer.setTabActive(tab);
      ChatRenderer.renderSessionsList(ChatState.getSessions());
    },

    setSearchQuery: U.debounce(function (q) {
      ChatState.setSearchQuery(q);
      ChatRenderer.renderSessionsList(ChatState.getSessions());
    }, Cfg.SEARCH_DEBOUNCE_MS),

    /* ── Event binding ── */

    _bindInboxEvents: function () {
      var self = this;

      var tabBar = safeEl('chat-tab-bar');
      if (tabBar) {
        tabBar.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-tab]');
          if (btn) self.setFilterTab(btn.dataset.tab);
        });
      }

      var searchEl = safeEl('chat-search');
      if (searchEl) {
        searchEl.addEventListener('input', function (e) {
          self.setSearchQuery(e.target.value || '');
        });
      }

      var wrap = safeEl('chat-sessions-wrap');
      if (wrap) {
        wrap.addEventListener('click', function (e) {
          var card = e.target.closest('[data-sid]');
          if (card) self.openSession(card.dataset.sid);
        });
        wrap.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            var card = e.target.closest('[data-sid]');
            if (card) self.openSession(card.dataset.sid);
          }
        });
      }
    },

    _bindSessionEvents: function (sessionId) {
      var self = this;
      var on   = function (id, ev, fn) {
        var el = safeEl(id);
        if (el) el.addEventListener(ev, fn);
      };

      on('chat-back-btn', 'click', function () {
        self._detachSession(sessionId);
        ChatState.resetSession();
        if (typeof window.switchTab === 'function') window.switchTab('messages');
      });

      on('chat-pin-btn',       'click', function () { self.togglePin(sessionId); });       // [R6]
      on('chat-orders-btn',    'click', function () { self.lookupOrders(sessionId); });
      on('chat-send-btn',      'click', function () { self.sendMessage(sessionId); });
      on('chat-save-note-btn', 'click', function () { self.saveNote(sessionId); });
      on('chat-load-more-btn', 'click', function () { self.loadOlderMessages(sessionId); });

      on('reply-input', 'keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendMessage(sessionId); }
      });
      on('reply-input', 'input', function () { self.handleAdminTyping(sessionId); });

      // [R8] Note locking
      on('chat-note', 'focus', function () { self.handleNoteFocus(sessionId); });
      on('chat-note', 'blur',  function () { self.handleNoteBlur(sessionId); });

      on('quick-replies-row', 'click', function (e) {
        var btn = e.target.closest('[data-reply]');
        if (btn) {
          var input = safeEl('reply-input');
          if (input) { input.value = btn.dataset.reply; input.focus(); }
        }
      });

      on('chat-scroll-down-btn', 'click', function () {
        var panel = safeEl('chat-messages-panel');
        if (panel) U.scrollToBottom(panel, true);
        var banner = safeEl('chat-new-msg-banner');
        if (banner) banner.style.display = 'none';
      });
    },
  };

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  window._renderMessagesTab = function () { ChatController.loadInbox(); };
  window._openChatSession   = function (sid) { ChatController.openSession(sid); };
  window._detachActiveChatListeners = function () {
    ChatController._detachSession(ChatState.getActiveSid());
    ChatController._detachInbox();
  };
  window.__chatDebug = function () { return ChatState.snapshot(); };

}());
