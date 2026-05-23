/* ================================================================
   JANEDORE STUDIO — Admin JS
   Multi-brand marketplace admin — rebuilt UI on top of original code.
   Original Firebase paths, chat system, product logic all preserved.
================================================================ */
(function () {
  'use strict';

  /* ── FIREBASE CONFIG ──────────────────────────────────────── */
  var firebaseConfig = {
    apiKey:            "AIzaSyBjtD9j-jKHtjMVmI2ENxy0T3ts9uf2JNI",
    authDomain:        "janedore-9f035.firebaseapp.com",
    projectId:         "janedore-9f035",
    storageBucket:     "janedore-9f035.firebasestorage.app",
    messagingSenderId: "571299748651",
    appId:             "1:571299748651:web:01463a772d47b39cc4036e",
    measurementId:     "G-Y9NMT0ZGKZ",
    databaseURL:       "https://janedore-9f035-default-rtdb.firebaseio.com"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  var db            = firebase.firestore();
  var rtdb          = firebase.database();
  var auth          = firebase.auth();
  var productsRef   = db.collection('products');
  var reviewsRef    = db.collection('reviews');
  var newsletterRef = db.collection('newsletter');
  var ordersRef     = db.collection('orders');
  var customersRef  = db.collection('customers');
  var vendorsRef    = db.collection('vendors');
  var adminsRef     = db.collection('admins');

  /* ── CHAT ROOT ────────────────────────────────────────────── */
  var CHAT_ROOT = 'live_chat';

  /* ── APP STATE ────────────────────────────────────────────── */
  var currentTab          = 'dashboard';
  var allProducts         = [];
  var currentUser         = null;
  var currentUserRole     = 'SUPER_ADMIN';
  var currentVendorId     = null;
  var activeChatSession   = null;
  var chatMsgRef          = null;
  var chatMsgCallback     = null;
  var chatTypingRef       = null;
  var chatTypingCallback  = null;
  var chatsMonitorRef     = null;
  var chatsMonitorCallback= null;
  var totalUnreadMessages = 0;
  var analyticsChart      = null;

  /* ── ORDER STATUSES ───────────────────────────────────────── */
  var ORDER_STATUSES = ['pending','paid','processing','packed','shipped','delivered','cancelled','refunded'];

  /* ── QUICK REPLIES ────────────────────────────────────────── */
  var QUICK_REPLIES = [
    'Hi! How can I help you today?',
    'Your order is being processed.',
    'Your order has been shipped!',
    'We\'ll get back to you shortly.',
    'Thank you for your patience.',
    'Could you share your order number?'
  ];

  /* ── HELPERS ──────────────────────────────────────────────── */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function safeEl(id) { return document.getElementById(id) || null; }
  function fmt(n) { return 'R' + Number(n||0).toLocaleString('en-ZA'); }
  function fmtDate(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', {day:'2-digit',month:'short',year:'numeric'});
  }
  function fmtDateShort(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', {day:'2-digit',month:'short'});
  }
  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }

  /* Avatar color cycling */
  function avatarClass(str) {
    var idx = 0;
    if (str) for (var i=0;i<str.length;i++) idx = (idx + str.charCodeAt(i)) % 8;
    return 'ca-' + idx;
  }
  function avatarInitials(str) {
    if (!str) return '?';
    return str.replace(/[^a-zA-Z0-9]/g,'').substring(0,2).toUpperCase() || '?';
  }

  function showToast(msg, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    var tc = safeEl('toast-container');
    if (tc) tc.appendChild(toast);
    setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 3200);
  }

  function closeModal() {
    var mc = safeEl('modal-container');
    if (mc) mc.innerHTML = '';
  }
  function closePanel() {
    var pc = safeEl('panel-container');
    if (pc) pc.innerHTML = '';
  }
  function isSuperAdmin() { return currentUserRole === 'SUPER_ADMIN'; }

  /* ── STATUS BADGE ─────────────────────────────────────────── */
  function statusBadge(status) {
    status = (status || 'pending').toLowerCase();
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>';
  }

  /* ── AUTH STATE ───────────────────────────────────────────── */
  auth.onAuthStateChanged(function(user) {
    if (user) {
      currentUser = user;
      safeEl('login-screen').style.display  = 'none';
      safeEl('admin-panel').style.display   = 'block';
      /* Set avatar initials */
      var initials = (user.email||'A').substring(0,1).toUpperCase();
      var iniEl = safeEl('admin-initials');
      if (iniEl) iniEl.textContent = initials;
      var emailEls = [safeEl('admin-email'), safeEl('admin-email-more')];
      emailEls.forEach(function(el){ if(el) el.textContent = user.email; });
      loadUserRole(user).then(function() {
        loadProducts();
        startChatMonitoring();
        renderRoleUI();
      });
    } else {
      currentUser = null;
      currentUserRole = 'SUPER_ADMIN';
      currentVendorId = null;
      safeEl('login-screen').style.display  = 'flex';
      safeEl('admin-panel').style.display   = 'none';
      stopChatMonitoring();
    }
  });

  /* ── LOAD USER ROLE ───────────────────────────────────────── */
  function loadUserRole(user) {
    return adminsRef.doc(user.uid).get().then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        currentUserRole = data.role || 'SUPER_ADMIN';
        currentVendorId = data.vendorId || null;
      } else {
        currentUserRole = 'SUPER_ADMIN';
        currentVendorId = null;
      }
    }).catch(function() {
      currentUserRole = 'SUPER_ADMIN';
    });
  }

  function renderRoleUI() {
    var badge = safeEl('admin-role-badge');
    if (badge) {
      badge.style.display = 'inline-block';
      badge.textContent   = currentUserRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Vendor';
      badge.className     = 'role-badge ' + (isSuperAdmin() ? 'badge-super' : 'badge-vendor');
    }
    var seedBtn   = safeEl('btn-seed');
    var seedMore  = safeEl('btn-seed-more');
    var vendorsBtn = safeEl('vendors-tab-btn');
    var vendorsMore = safeEl('vendors-more-item');
    if (seedBtn)     seedBtn.style.display     = isSuperAdmin() ? 'flex' : 'none';
    if (seedMore)    seedMore.style.display    = isSuperAdmin() ? 'flex' : 'none';
    if (vendorsBtn)  vendorsBtn.style.display  = isSuperAdmin() ? 'flex' : 'none';
    if (vendorsMore) vendorsMore.style.display = isSuperAdmin() ? 'flex' : 'none';
  }

  /* ── LOGIN / LOGOUT ───────────────────────────────────────── */
  window.handleLogin = function(e) {
    e.preventDefault();
    var email    = safeEl('login-email').value;
    var password = safeEl('login-password').value;
    var errorEl  = safeEl('login-error');
    errorEl.style.display = 'none';
    auth.signInWithEmailAndPassword(email, password).catch(function(err) {
      errorEl.textContent   = err.message;
      errorEl.style.display = 'block';
    });
  };
  window.handleLogout = function() { auth.signOut(); };

  /* ── PRODUCTS ─────────────────────────────────────────────── */
  function loadProducts() {
    var query = isSuperAdmin()
      ? productsRef.get()
      : productsRef.where('vendorId','==', currentVendorId || '__none__').get();

    query.then(function(snapshot) {
      allProducts = snapshot.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      var el = safeEl('product-count');
      if (el) el.textContent = allProducts.length + ' products';
      var dot = safeEl('status-dot');
      if (dot) dot.className = 'status-dot online';
      renderCurrentTab();
    }).catch(function(e) {
      var dot = safeEl('status-dot');
      if (dot) dot.className = 'status-dot offline';
      showToast('Firebase: ' + e.message, 'error');
    });
  }

  function saveProduct(productData) {
    var ref = productData.id
      ? productsRef.doc(productData.id)
      : productsRef.doc(productData.sku || ('prod-' + Date.now()));
    productData.id = ref.id;
    ref.set(productData, {merge:true}).then(function() {
      showToast('Product saved!');
      loadProducts();
      closeModal();
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  }

  window.deleteProduct = function(productId) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    productsRef.doc(productId).delete().then(function() {
      showToast('Product deleted');
      loadProducts();
      closeModal();
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.duplicateProduct = function(productId) {
    var p = allProducts.find(function(x){ return x.id === productId; });
    if (!p) return;
    var copy = Object.assign({}, p);
    copy.id   = '';
    copy.name = copy.name + ' (Copy)';
    copy.sku  = copy.sku  + '-COPY';
    copy.status    = 'draft';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    var ref = productsRef.doc();
    copy.id = ref.id;
    ref.set(copy).then(function() {
      showToast('Product duplicated');
      loadProducts();
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.archiveProduct = function(productId) {
    productsRef.doc(productId).update({ status: 'draft', updatedAt: new Date().toISOString() })
      .then(function(){ showToast('Product archived'); loadProducts(); closeModal(); })
      .catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  /* ── DEFAULT PRODUCTS (unchanged) ────────────────────────── */
  var DEFAULT_PRODUCTS = [
    { id:"nova-sunglasses", sku:"ACC-NSG-006", name:"Janedore Logo Nova Sunglasses", brand:"JANEDORE", vendorId:"janedore", category:"sunglasses", price:350, salePrice:null, badge:"sold", sizes:["OS"], stock:10, status:"active", featured:true, description:"Bold yet refined sunglasses with UV protection.", productFeatures:"UV400 lenses.", compositionCare:"Acetate frame.", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Warm Brown",swatch:"#AF3E06",images:{model:[],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/A4D53938-5246-4271-86A3-4980004734AA.png?v=1778858287","https://cdn.shopify.com/s/files/1/0705/5615/6145/files/C8DC66E1-BB21-4807-BC2C-C7F52A8005CE.png?v=1778858287"],detail:[]}}] },
    { id:"tenese-gold-earrings", sku:"JWL-TGE-005", name:"Stainless Steel Tenesè Gold Earrings", brand:"NIRIUS CO", vendorId:"nirius-co", category:"jewelry", price:380, salePrice:null, badge:"new", sizes:["Stainless Steel"], stock:10, status:"active", featured:true, description:"Sculptural gold earrings with a modern twist.", productFeatures:"18k gold-plated.", compositionCare:"Gold-plated stainless steel.", shippingReturns:"Free shipping over R1500.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Gold",swatch:"#d4af37",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6608.png?v=1778790153"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6607.png?v=1778790153"],detail:[]}}] },
    { id:"janedore-leather-pouch", sku:"ACC-JLP-007", name:"Janedore Debossed Leather Pouch", brand:"JANEDORE", vendorId:"janedore", category:"bags", price:50, salePrice:null, badge:null, sizes:["OS"], stock:50, status:"active", featured:false, description:"Supple debossed leather pouch.", productFeatures:"Genuine leather.", compositionCare:"100% Leather.", shippingReturns:"Free with sunglass purchase.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/026EDA9F-298C-41BB-9076-F133E69A87D8.png?v=1778779703"],detail:[]}}] },
    { id:"janedore-raffle-brandy-black-dress", sku:"DRS-RBB-001", name:"Janedore Raffle Brandy Black Dress", brand:"JANEDORE", vendorId:"janedore", category:"dresses", price:450, salePrice:null, badge:"new", sizes:["S","M","L"], stock:40, status:"active", featured:true, description:"The Raffle Brandy black dress.", productFeatures:"Weighted crepe fabric.", compositionCare:"100% Polyester.", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/9162BAA4-A86C-48DF-8F07-0E410D3CC2E0.png?v=1778858287"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/116AE49E-1C83-474E-B538-B3147C826859.png?v=1778858287"],detail:[]}}] },
    { id:"thato-rumination-tea-parfum", sku:"PRF-TRT-001", name:"Thato Rumination Tea Parfum", brand:"THATO", vendorId:"thato", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:30, status:"active", featured:true, description:"A contemplative fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Pale Linen",swatch:"#EBEDE0",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6691.png?v=1778920601"],detail:[]}}] },
    { id:"thato-pink-rain-parfum", sku:"PRF-TPR-002", name:"Thato Pink Rain Parfum", brand:"THATO", vendorId:"thato", category:"parfum", price:350, salePrice:null, badge:"new", sizes:["OS"], stock:25, status:"active", featured:true, description:"A delicate, romantic fragrance.", productFeatures:"Long-lasting eau de parfum. 50ml.", compositionCare:"Alcohol denat., parfum.", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Pink Rain",swatch:"#F3DBD7",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/IMG-6630.png?v=1778801279"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/FD9FBEA5-4CD8-421E-A549-F67099AD9B79.png?v=1778801677"],detail:[]}}] },
    { id:"janedore-studded-halter-dress", sku:"DRS-SHN-001", name:"Janedore Studded Halter Neck Dress", brand:"JANEDORE", vendorId:"janedore", category:"dresses", price:680, salePrice:null, badge:"new", sizes:["XS","S","M","L"], stock:20, status:"active", featured:true, description:"Refined edge meets feminine structure.", productFeatures:"Structured halter neckline.", compositionCare:"95% Polyester, 5% Elastane.", shippingReturns:"Free shipping over R1000.", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), variants:[{color:"Black",swatch:"#111",images:{model:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/BB8C5723-337D-4CB3-B9B8-9FC4BF36CBFE.png?v=1779001142"],ghost:["https://cdn.shopify.com/s/files/1/0705/5615/6145/files/27BAAA95-3B6D-4CCE-A2D8-FFF60326A881.png?v=1779001142"],detail:[]}}] }
  ];

  window.seedDefaultProducts = function() {
    if (!confirm('Seed all 7 default products to Firebase?')) return;
    var batch = db.batch();
    DEFAULT_PRODUCTS.forEach(function(p){ batch.set(productsRef.doc(p.id), p); });
    batch.commit()
      .then(function(){ showToast('7 products seeded!'); loadProducts(); })
      .catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  /* ================================================================
     CHAT SYSTEM — all original logic preserved, UI rebuilt
  ================================================================ */
  function startChatMonitoring() {
    stopChatMonitoring();
    chatsMonitorRef = rtdb.ref(CHAT_ROOT);
    chatsMonitorCallback = function(snapshot) {
      var unread = 0;
      snapshot.forEach(function(sessionSnap) {
        var messages = sessionSnap.child('messages');
        if (messages.exists()) {
          messages.forEach(function(msgSnap) {
            var msg = msgSnap.val();
            if (msg && msg.sender === 'customer' && msg.read === false) unread++;
          });
        }
      });
      totalUnreadMessages = unread;
      updateUnreadBadge();
    };
    chatsMonitorRef.on('value', chatsMonitorCallback, function(err) {
      console.warn('[ADMIN CHAT] monitor error:', err.message);
    });
  }

  function stopChatMonitoring() {
    if (chatsMonitorRef && chatsMonitorCallback) {
      chatsMonitorRef.off('value', chatsMonitorCallback);
      chatsMonitorRef = null; chatsMonitorCallback = null;
    }
    detachActiveChatListeners();
  }

  function updateUnreadBadge() {
    /* Top nav badge */
    var badge = safeEl('messages-unread-badge');
    if (badge) {
      badge.textContent   = totalUnreadMessages;
      badge.style.display = totalUnreadMessages > 0 ? 'inline-flex' : 'none';
    }
    /* Bottom nav badge */
    var bnavBadge = safeEl('bnav-msg-badge');
    if (bnavBadge) {
      bnavBadge.textContent   = totalUnreadMessages;
      bnavBadge.style.display = totalUnreadMessages > 0 ? 'inline-flex' : 'none';
    }
  }

  function detachActiveChatListeners() {
    if (chatMsgRef && chatMsgCallback) {
      chatMsgRef.off('value', chatMsgCallback);
      chatMsgRef = null; chatMsgCallback = null;
    }
    if (chatTypingRef && chatTypingCallback) {
      chatTypingRef.off('value', chatTypingCallback);
      chatTypingRef = null; chatTypingCallback = null;
    }
  }

  /* ── sendAdminReply (original path/structure preserved) ───── */
  window.sendAdminReply = function(sessionId) {
    var input = safeEl('reply-input-' + sessionId);
    var text  = input && input.value && input.value.trim();
    if (!text || !sessionId) return;
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping').set(false).catch(function(){});
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
      }).catch(function(){});
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  function markSessionAsRead(sessionId) {
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').once('value').then(function(snap) {
      var updates = {};
      snap.forEach(function(child) {
        var msg = child.val();
        if (msg && msg.sender === 'customer' && msg.read === false)
          updates[child.key + '/read'] = true;
      });
      if (Object.keys(updates).length > 0)
        rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages').update(updates).catch(function(){});
    }).catch(function(){});
  }

  window.handleAdminTyping = function(sessionId) {
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping').set(true).catch(function(){});
    clearTimeout(window._adminTypingTimeout);
    window._adminTypingTimeout = setTimeout(function() {
      rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminTyping').set(false).catch(function(){});
    }, 3000);
  };

  /* ── openChatSession ──────────────────────────────────────── */
  window.openChatSession = function(sessionId) {
    activeChatSession = sessionId;
    detachActiveChatListeners();
    markSessionAsRead(sessionId);

    var mc  = safeEl('main-content');
    var sid = esc(sessionId);
    var shortId = esc(sessionId.substring(0, 26));
    var avClass = avatarClass(sessionId);
    var avInit  = avatarInitials(sessionId);

    mc.innerHTML =
      '<button class="back-link" onclick="switchTab(\'messages\')">← Back to Inbox</button>' +

      '<div class="section-header">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="chat-avatar ' + avClass + '" style="width:36px;height:36px;font-size:12px;">' + avInit + '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:500;">' + shortId + '…</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:1px;">Live Session</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="pinChatSession(\'' + sid + '\')">📌 Pin</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="lookupOrderInChat(\'' + sid + '\')">🔍 Orders</button>' +
        '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr;gap:12px;">' +

        /* Chat wrap */
        '<div class="chat-view-wrap">' +
          '<div class="chat-messages-panel" id="chat-messages-panel">' +
            '<div style="text-align:center;color:var(--muted);font-size:11px;padding:24px;">Loading messages…</div>' +
          '</div>' +
          '<div class="typing-indicator" id="typing-indicator">Customer is typing…</div>' +
          '<div class="quick-replies" id="quick-replies-row">' +
            QUICK_REPLIES.map(function(r) {
              return '<button class="quick-reply-btn" onclick="applyQuickReply(\'' + sid + '\',\'' + esc(r) + '\')">' + esc(r) + '</button>';
            }).join('') +
          '</div>' +
          '<div class="reply-box">' +
            '<input id="reply-input-' + sid + '" placeholder="Write a reply…" ' +
              'onkeypress="if(event.key===\'Enter\')sendAdminReply(\'' + sid + '\')" ' +
              'oninput="handleAdminTyping(\'' + sid + '\')">' +
            '<button class="chat-send-btn" onclick="sendAdminReply(\'' + sid + '\')" title="Send">›</button>' +
          '</div>' +
        '</div>' +

        /* Side info */
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div class="card">' +
            '<div class="card-header"><span class="card-title">Customer Info</span></div>' +
            '<div style="padding:12px 14px;">' +
              '<div class="info-row" style="background:none;border:none;padding:4px 0;"><span class="label">Session</span><span style="font-size:10.5px;">' + esc(sessionId.substring(0,14)) + '…</span></div>' +
              '<div class="info-row" style="background:none;border:none;padding:4px 0;"><span class="label">Status</span><span style="color:var(--success);">Active</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-header"><span class="card-title">Support Notes</span></div>' +
            '<div style="padding:12px 14px;">' +
              '<textarea id="chat-note-' + sid + '" style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:var(--font);font-size:11.5px;font-weight:300;min-height:60px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;" placeholder="Internal notes…"></textarea>' +
              '<button class="btn btn-sm btn-ghost" style="margin-top:7px;width:100%;" onclick="saveChatNote(\'' + sid + '\')">Save Note</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>';

    chatMsgRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/messages');
    chatMsgCallback = function(snapshot) {
      var messages = [];
      snapshot.forEach(function(child) {
        messages.push(Object.assign({ _key: child.key }, child.val()));
      });
      messages.sort(function(a, b) { return (a.createdAt||0) - (b.createdAt||0); });
      renderChatMessages(messages);
    };
    chatMsgRef.on('value', chatMsgCallback, function(err) {
      console.warn('[ADMIN CHAT] message listener error:', err.message);
    });

    chatTypingRef = rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/customerTyping');
    chatTypingCallback = function(snapshot) {
      var indicator = safeEl('typing-indicator');
      if (indicator) indicator.style.display = snapshot.val() === true ? 'block' : 'none';
    };
    chatTypingRef.on('value', chatTypingCallback, function(err) {
      console.warn('[ADMIN CHAT] typing listener error:', err.message);
    });

    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminNote').once('value').then(function(snap) {
      var noteEl = safeEl('chat-note-' + sessionId);
      if (noteEl && snap.val()) noteEl.value = snap.val();
    }).catch(function(){});
  };

  window.applyQuickReply = function(sessionId, text) {
    var input = safeEl('reply-input-' + sessionId);
    if (input) { input.value = text; input.focus(); }
  };

  window.saveChatNote = function(sessionId) {
    var noteEl = safeEl('chat-note-' + sessionId);
    if (!noteEl) return;
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/adminNote').set(noteEl.value)
      .then(function(){ showToast('Note saved'); })
      .catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.pinChatSession = function(sessionId) {
    rtdb.ref(CHAT_ROOT + '/' + sessionId + '/meta/pinned').set(true)
      .then(function(){ showToast('Chat pinned'); })
      .catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.lookupOrderInChat = function(sessionId) {
    ordersRef.where('chatSessionId','==', sessionId).limit(10).get()
      .then(function(snap) {
        if (snap.empty) { showToast('No orders linked to this chat', 'info'); return; }
        showToast('Found ' + snap.size + ' order(s)', 'info');
        console.log('[ADMIN] Orders for session:', sessionId, snap.docs.map(function(d){return d.id;}));
      }).catch(function(){});
  };

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
      var time = m.createdAt ? fmtTime(m.createdAt) : '';
      var isAdmin = m.sender !== 'customer';
      var div = document.createElement('div');
      div.className = 'chat-msg-admin' + (isAdmin ? '' : ' customer-msg');
      div.innerHTML =
        '<div class="chat-bubble">' + esc(m.text) + '</div>' +
        '<div class="msg-meta">' + esc(m.sender||'') + ' · ' + time + '</div>';
      panel.appendChild(div);
    });
    if (wasAtBottom) panel.scrollTop = panel.scrollHeight;
  }

  /* ── MESSAGES TAB ─────────────────────────────────────────── */
  function renderMessagesTab() {
    var mc = safeEl('main-content');
    activeChatSession = null;
    detachActiveChatListeners();

    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Inbox</div>' +
        '<div class="section-actions">' +
          '<input class="search-input" id="chat-search" placeholder="Search sessions…" oninput="filterChatSessions()" style="min-width:140px;max-width:200px;">' +
        '</div>' +
      '</div>' +

      /* Tab bar — All / Unread / Pinned */
      '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
        '<button id="chat-tab-all"    class="btn btn-sm btn-primary" onclick="setChatTab(\'all\')"   >All</button>' +
        '<button id="chat-tab-unread" class="btn btn-sm btn-ghost"   onclick="setChatTab(\'unread\')">Unread</button>' +
        '<button id="chat-tab-pinned" class="btn btn-sm btn-ghost"   onclick="setChatTab(\'pinned\')">Pinned</button>' +
      '</div>' +

      '<div id="chat-sessions-wrap">' +
        '<div class="empty-state"><div class="empty-state-icon">✉</div><div class="empty-state-text">Loading sessions…</div></div>' +
      '</div>';

    window._chatFilterTab = 'all';

    rtdb.ref(CHAT_ROOT).once('value').then(function(snap) {
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
      var wrap = safeEl('chat-sessions-wrap');
      if (wrap) wrap.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: ' + esc(e.message) + '</p>';
    });
  }

  window.setChatTab = function(tab) {
    window._chatFilterTab = tab;
    ['all','unread','pinned'].forEach(function(t) {
      var btn = safeEl('chat-tab-' + t);
      if (btn) {
        btn.className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-ghost');
      }
    });
    if (window._chatSessionsData) renderChatSessionsList(window._chatSessionsData);
  };

  function renderChatSessionsList(sessions) {
    var filter = window._chatFilterTab || 'all';
    var search = ((safeEl('chat-search') || {}).value || '').toLowerCase();

    var sessionIds = Object.keys(sessions).sort(function(a,b) {
      if (sessions[b].pinned && !sessions[a].pinned) return 1;
      if (sessions[a].pinned && !sessions[b].pinned) return -1;
      return (sessions[b].lastTime||0) - (sessions[a].lastTime||0);
    });

    sessionIds = sessionIds.filter(function(sid) {
      var s = sessions[sid];
      if (filter === 'unread' && s.unreadCount === 0) return false;
      if (filter === 'pinned' && !s.pinned) return false;
      if (search && sid.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    var wrap = safeEl('chat-sessions-wrap');
    if (!wrap) return;

    if (sessionIds.length === 0) {
      wrap.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">✉</div>' +
        '<div class="empty-state-text">No sessions found.</div></div>';
      return;
    }

    wrap.innerHTML =
      '<div class="chat-sessions-wrap">' +
      sessionIds.map(function(sid) {
        var s = sessions[sid];
        var msgs = s.messages;
        var lastMsg = msgs[msgs.length-1];
        var preview = ((lastMsg&&lastMsg.text)||'').substring(0,70);
        var time = s.lastTime ? fmtDateShort(s.lastTime) : '';
        var avClass = avatarClass(sid);
        var avInit  = avatarInitials(sid);

        return '<div class="chat-session-card ' + (s.unreadCount>0?'unread':'') + '" onclick="openChatSession(\'' + esc(sid) + '\')">' +
          '<div class="chat-avatar ' + avClass + '">' + avInit + '</div>' +
          '<div class="session-info">' +
            '<div class="session-id-label">' + esc(sid.substring(0,22)) + '…</div>' +
            '<div class="session-preview">' + esc(preview) + (preview.length>=70?'…':'') + '</div>' +
          '</div>' +
          '<div class="session-right">' +
            '<span class="session-time">' + time + '</span>' +
            (s.unreadCount > 0
              ? '<span class="session-unread-count">' + s.unreadCount + '</span>'
              : (s.pinned ? '<span class="badge badge-processing" style="font-size:9px;">Pinned</span>' : '')) +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>';
  }

  window.filterChatSessions = function() {
    if (window._chatSessionsData) renderChatSessionsList(window._chatSessionsData);
  };

  /* ================================================================
     ORDERS TAB
  ================================================================ */
  function renderOrdersTab() {
    var mc = safeEl('main-content');
    mc.innerHTML = '';

    if (!isSuperAdmin()) {
      mc.innerHTML += '<div class="vendor-scope-bar">⬡ Showing orders for your brand only</div>';
    }

    mc.innerHTML += renderOrdersToolbar();

    var container = document.createElement('div');
    container.id = 'orders-table-wrap';
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">◫</div><div class="empty-state-text">Loading orders…</div></div>';
    mc.appendChild(container);

    var query = isSuperAdmin()
      ? ordersRef.orderBy('createdAt','desc').limit(100)
      : ordersRef.where('vendorIds','array-contains', currentVendorId || '__none__').orderBy('createdAt','desc').limit(100);

    query.get().then(function(ords) {
      window._ordersData = ords.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      renderOrdersTable(window._ordersData);
    }).catch(function(e) {
      container.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: ' + esc(e.message) + '</p>';
    });
  }

  function renderOrdersToolbar() {
    return '<div class="section-header" style="margin-bottom:10px;">' +
      '<div class="section-title">Orders</div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<input class="search-input" id="order-search" placeholder="Search orders, customers…" oninput="filterOrders()" style="min-width:180px;">' +
      '<select class="filter-select" id="order-status-filter" onchange="filterOrders()">' +
        '<option value="">All Statuses</option>' +
        ORDER_STATUSES.map(function(s){
          return '<option value="'+s+'">'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>';
        }).join('') +
      '</select>' +
      '<select class="filter-select" id="order-payment-filter" onchange="filterOrders()">' +
        '<option value="">All Payments</option>' +
        '<option value="paid">Paid</option>' +
        '<option value="unpaid">Unpaid</option>' +
        '<option value="refunded">Refunded</option>' +
      '</select>' +
      '<div class="toolbar-spacer"></div>' +
      '<span id="orders-count" class="ui-label"></span>' +
    '</div>';
  }

  function renderOrdersTable(orders) {
    var statusFilter  = (safeEl('order-status-filter')  || {}).value || '';
    var paymentFilter = (safeEl('order-payment-filter') || {}).value || '';
    var search        = ((safeEl('order-search') || {}).value || '').toLowerCase();

    var filtered = orders.filter(function(o) {
      if (statusFilter  && (o.status || 'pending') !== statusFilter) return false;
      if (paymentFilter && (o.paymentStatus || 'unpaid') !== paymentFilter) return false;
      if (search) {
        var hay = (o.id + (o.customerEmail||'') + (o.customerName||'')).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    var countEl = safeEl('orders-count');
    if (countEl) countEl.textContent = filtered.length + ' orders';

    var wrap = safeEl('orders-table-wrap');
    if (!wrap) return;

    if (filtered.length === 0) {
      wrap.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">◫</div>' +
        '<div class="empty-state-text">No orders found.</div></div>';
      return;
    }

    wrap.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
        '<th>Order</th><th>Customer</th><th>Items</th>' +
        '<th>Total</th><th>Status</th><th>Fulfillment</th>' +
        '<th>Date</th><th></th>' +
      '</tr></thead><tbody>' +
      filtered.map(function(o) {
        return '<tr onclick="openOrderDetail(\'' + esc(o.id) + '\')">' +
          '<td><span style="font-size:11.5px;font-weight:500;">#' + esc(o.id.substring(0,10)) + '</span></td>' +
          '<td><div style="font-weight:400;">' + esc(o.customerName||'Guest') + '</div>' +
            '<div class="cell-muted">' + esc(o.customerEmail||'') + '</div></td>' +
          '<td class="cell-muted">' + esc(String(o.itemCount||0)) + '</td>' +
          '<td style="font-weight:400;">' + fmt(o.subtotal||0) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td>' + statusBadge(o.fulfillmentStatus||'unfulfilled') + '</td>' +
          '<td class="cell-muted">' + fmtDate(o.createdAt) + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<button class="btn btn-xs btn-ghost" onclick="openOrderDetail(\'' + esc(o.id) + '\')" title="View">›</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window.filterOrders = function() {
    if (window._ordersData) renderOrdersTable(window._ordersData);
  };

  /* ── ORDER DETAIL SLIDE PANEL ─────────────────────────────── */
  window.openOrderDetail = function(orderId) {
    var o = (window._ordersData || []).find(function(x){ return x.id === orderId; });
    var pc = safeEl('panel-container');
    if (!pc) return;

    pc.innerHTML =
      '<div class="slide-panel-overlay" onclick="closePanel()"></div>' +
      '<div class="slide-panel">' +
        '<button class="slide-panel-close" onclick="closePanel()">✕</button>' +
        '<div class="ui-label" style="margin-bottom:4px;">Order</div>' +
        '<div style="font-family:var(--display);font-size:21px;font-weight:400;margin-bottom:18px;letter-spacing:.02em;">#' + esc(orderId.substring(0,14)) + '…</div>' +
        (o ? renderOrderDetailContent(o, orderId) : '<div id="order-detail-loading" style="color:var(--muted);font-size:13px;">Loading…</div>') +
      '</div>';

    if (!o) {
      ordersRef.doc(orderId).get().then(function(doc) {
        if (!doc.exists) return;
        var data = Object.assign({id:doc.id}, doc.data());
        var loadEl = safeEl('order-detail-loading');
        if (loadEl) loadEl.outerHTML = renderOrderDetailContent(data, orderId);
      }).catch(function(){});
    }
  };

  function renderOrderDetailContent(o, orderId) {
    var html = '';

    html += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">' +
      statusBadge(o.status) + statusBadge(o.fulfillmentStatus||'unfulfilled') +
    '</div>';

    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
      '<button class="btn btn-sm btn-ghost" onclick="copyOrderId(\'' + esc(orderId) + '\')">📋 Copy #</button>' +
      (o.customerPhone ? '<button class="btn btn-sm btn-ghost" onclick="whatsappCustomer(\'' + esc(o.customerPhone) + '\')">💬 WhatsApp</button>' : '') +
      '<button class="btn btn-sm btn-ghost" onclick="printOrderInvoice(\'' + esc(orderId) + '\')">🖨 Invoice</button>' +
      (isSuperAdmin() ? '<button class="btn btn-sm btn-danger" onclick="quickRefund(\'' + esc(orderId) + '\')">↩ Refund</button>' : '') +
    '</div>';

    html += '<div class="card-title" style="margin-bottom:7px;">Customer</div>';
    html += '<div class="info-panel" style="margin-bottom:14px;">' +
      '<div class="info-row"><span class="label">Name</span><span>' + esc(o.customerName||'—') + '</span></div>' +
      '<div class="info-row"><span class="label">Email</span><span>' + esc(o.customerEmail||'—') + '</span></div>' +
      '<div class="info-row"><span class="label">Phone</span><span>' + esc(o.customerPhone||'—') + '</span></div>' +
    '</div>';

    if (o.shippingAddress) {
      html += '<div class="card-title" style="margin-bottom:7px;">Shipping</div>';
      html += '<div class="info-panel" style="margin-bottom:14px;">' +
        '<div class="info-row"><span class="label">Address</span><span>' + esc(o.shippingAddress||'—') + '</span></div>' +
        '<div class="info-row"><span class="label">Tracking</span><span>' + esc(o.trackingNumber||'—') + '</span></div>' +
        '<div class="info-row"><span class="label">Courier</span><span>' + esc(o.courier||'—') + '</span></div>' +
        '<div class="info-row"><span class="label">ETA</span><span>' + esc(o.estimatedDelivery||'—') + '</span></div>' +
      '</div>';
    }

    html += '<div class="card-title" style="margin-bottom:7px;">Revenue</div>';
    html += '<div class="info-panel" style="margin-bottom:14px;">' +
      '<div class="info-row"><span class="label">Subtotal</span><span>' + fmt(o.subtotal||0) + '</span></div>' +
      (isSuperAdmin() ? '<div class="info-row"><span class="label">Platform Rev</span><span>' + fmt(o.platformRevenue||0) + '</span></div>' : '') +
      (isSuperAdmin() ? '<div class="info-row"><span class="label">Vendor Rev</span><span>' + fmt(o.vendorRevenue||0) + '</span></div>' : '') +
      '<div class="info-row"><span class="label">Payout</span><span>' + statusBadge(o.payoutStatus||'pending') + '</span></div>' +
    '</div>';

    if (isSuperAdmin()) {
      html += '<div class="card-title" style="margin-bottom:8px;">Update Status</div>';
      html += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px;">' +
        ORDER_STATUSES.map(function(s) {
          return '<button class="btn btn-xs ' + (o.status===s?'btn-primary':'btn-ghost') + '" onclick="updateOrderStatus(\'' + esc(orderId) + '\',\'' + s + '\')">' + s + '</button>';
        }).join('') +
      '</div>';

      html += '<div style="margin-bottom:12px;">' +
        '<div class="card-title" style="margin-bottom:7px;">Tracking Number</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<input id="tracking-input" value="' + esc(o.trackingNumber||'') + '" placeholder="Tracking #" ' +
            'style="flex:1;padding:8px 11px;border:0.5px solid var(--border-med);font-family:var(--font);font-size:12px;background:var(--surface2);outline:none;border-radius:7px;">' +
          '<button class="btn btn-sm" onclick="saveTracking(\'' + esc(orderId) + '\')">Save</button>' +
        '</div>' +
      '</div>';

      html += '<div>' +
        '<div class="card-title" style="margin-bottom:7px;">Internal Notes</div>' +
        '<textarea id="order-note-input" style="width:100%;border:0.5px solid var(--border-med);padding:9px 11px;font-family:var(--font);font-size:12px;font-weight:300;min-height:68px;background:var(--surface2);outline:none;border-radius:7px;resize:vertical;" placeholder="Internal notes…">' + esc(o.internalNotes||'') + '</textarea>' +
        '<button class="btn btn-sm btn-ghost" style="margin-top:7px;" onclick="saveOrderNote(\'' + esc(orderId) + '\')">Save Note</button>' +
      '</div>';
    }

    return html;
  }

  window.copyOrderId = function(orderId) {
    navigator.clipboard.writeText(orderId)
      .then(function(){ showToast('Order # copied'); })
      .catch(function(){ showToast('Could not copy', 'error'); });
  };
  window.whatsappCustomer = function(phone) {
    window.open('https://wa.me/' + phone.replace(/\D/g,''), '_blank');
  };
  window.printOrderInvoice = function() {
    showToast('Invoice print — add your template', 'info');
  };
  window.quickRefund = function(orderId) {
    if (!confirm('Mark order #' + orderId.substring(0,10) + '… as refunded?')) return;
    ordersRef.doc(orderId).update({ status:'refunded', updatedAt:new Date().toISOString() })
      .then(function(){
        showToast('Order marked as refunded');
        if (window._ordersData) {
          var o = window._ordersData.find(function(x){ return x.id===orderId; });
          if (o) o.status = 'refunded';
        }
        closePanel();
      }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };
  window.updateOrderStatus = function(orderId, status) {
    ordersRef.doc(orderId).update({ status:status, updatedAt:new Date().toISOString() })
      .then(function(){
        showToast('Status → ' + status);
        if (window._ordersData) {
          var o = window._ordersData.find(function(x){ return x.id===orderId; });
          if (o) { o.status = status; renderOrdersTable(window._ordersData); }
        }
        closePanel();
      }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };
  window.saveTracking = function(orderId) {
    var input = safeEl('tracking-input');
    if (!input) return;
    ordersRef.doc(orderId).update({ trackingNumber:input.value, updatedAt:new Date().toISOString() })
      .then(function(){ showToast('Tracking saved'); })
      .catch(function(e){ showToast('Error: '+e.message,'error'); });
  };
  window.saveOrderNote = function(orderId) {
    var input = safeEl('order-note-input');
    if (!input) return;
    ordersRef.doc(orderId).update({ internalNotes:input.value, updatedAt:new Date().toISOString() })
      .then(function(){ showToast('Note saved'); })
      .catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  /* ================================================================
     DASHBOARD TAB
  ================================================================ */
  function renderDashboardTab() {
    var mc = safeEl('main-content');
    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:14px;">' +
        '<div class="section-title">Overview</div>' +
        '<span class="ui-label" style="font-size:10px;">' + new Date().toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) + '</span>' +
      '</div>' +
      '<div class="stats-grid" id="dash-stats">' +
        Array(4).fill(
          '<div class="stat-card">' +
          '<div class="stat-number" style="opacity:.18;font-size:20px;">—</div>' +
          '<div class="stat-label">Loading</div></div>'
        ).join('') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr;gap:10px;">' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Orders – Last 30 Days</span></div>' +
          '<div class="chart-wrap"><canvas id="orders-chart" class="chart-canvas"></canvas></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Top Products</span></div>' +
          '<div id="top-products-list" style="padding:4px 0;"></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Low Stock</span></div>' +
          '<div id="low-stock-list" style="padding:4px 0;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:10px;" class="card">' +
        '<div class="card-header"><span class="card-title">Revenue by Brand</span></div>' +
        '<div class="chart-wrap"><canvas id="revenue-chart" class="chart-canvas"></canvas></div>' +
      '</div>';

    Promise.all([
      productsRef.get(),
      reviewsRef.get(),
      newsletterRef.get(),
      ordersRef.get()
    ]).then(function(results) {
      var products = results[0].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var orders   = results[3].docs.map(function(d){ return Object.assign({id:d.id},d.data()); });

      var totalRevenue  = orders.reduce(function(s,o){ return s+(o.subtotal||0); },0);
      var pendingOrders = orders.filter(function(o){ return (o.status||'pending')==='pending'; }).length;
      var avgOrder      = orders.length ? totalRevenue/orders.length : 0;

      var statsEl = safeEl('dash-stats');
      if (statsEl) {
        statsEl.className = 'stats-grid';
        statsEl.innerHTML =
          statCard(fmt(totalRevenue), 'Total Revenue') +
          statCard(orders.length, 'Total Orders') +
          statCard(fmt(avgOrder), 'Avg Order') +
          statCard(pendingOrders, 'Pending Orders') +
          statCard(results[0].size, 'Products') +
          statCard(results[1].size, 'Reviews') +
          statCard(results[2].size, 'Subscribers') +
          statCard(totalUnreadMessages, 'Unread Chats');
        statsEl.style.gridTemplateColumns = 'repeat(4,1fr)';
      }

      buildOrdersChart(orders);

      var topEl = safeEl('top-products-list');
      if (topEl) {
        var sorted = products.slice().sort(function(a,b){ return (b.unitsSold||0)-(a.unitsSold||0); }).slice(0,5);
        if (sorted.length === 0) {
          topEl.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-state-text">No data yet</div></div>';
        } else {
          topEl.innerHTML = sorted.map(function(p) {
            return '<div class="info-row"><span style="font-size:12.5px;">' +
              esc(p.name.substring(0,22)) + '…</span>' +
              '<span class="ui-label">' + esc(String(p.unitsSold||0)) + ' sold</span></div>';
          }).join('');
        }
      }

      buildRevenueChart(orders, products);

      var lowEl = safeEl('low-stock-list');
      if (lowEl) {
        var lowStock = products.filter(function(p){ return (p.stock||0) < 5; }).slice(0,6);
        if (lowStock.length === 0) {
          lowEl.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-state-text">All well stocked ✓</div></div>';
        } else {
          lowEl.innerHTML = lowStock.map(function(p) {
            return '<div class="info-row">' +
              '<span style="font-size:12.5px;">' + esc(p.name.substring(0,22)) + '…</span>' +
              '<span style="color:' + (p.stock===0?'var(--danger)':'var(--warning)') + ';font-size:11px;font-weight:600;">' +
              esc(String(p.stock||0)) + ' left</span></div>';
          }).join('');
        }
      }

    }).catch(function(e) {
      var statsEl = safeEl('dash-stats');
      if (statsEl) statsEl.innerHTML = '<p style="color:var(--danger);padding:16px;font-size:12px;">Error: ' + esc(e.message) + '</p>';
    });
  }

  function statCard(value, label) {
    return '<div class="stat-card">' +
      '<div class="stat-number sm">' + esc(String(value)) + '</div>' +
      '<div class="stat-label">' + esc(label) + '</div>' +
    '</div>';
  }

  function buildOrdersChart(orders) {
    var canvas = safeEl('orders-chart');
    if (!canvas || !window.Chart) return;
    if (analyticsChart) { analyticsChart.destroy(); analyticsChart = null; }

    var days = {}, now = Date.now(), DAY = 86400000;
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now - i * DAY);
      var key = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      days[key] = 0;
    }
    orders.forEach(function(o) {
      if (!o.createdAt) return;
      var d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      var key = d.toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
      if (days[key] !== undefined) days[key]++;
    });

    analyticsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Object.keys(days),
        datasets: [{
          label: 'Orders',
          data: Object.values(days),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.06)',
          borderWidth: 1.5,
          tension: 0.35,
          fill: true,
          pointRadius: 2,
          pointBackgroundColor: '#3b82f6'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family:'Manrope' }, maxTicksLimit: 8, color:'#aaa' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family:'Manrope' }, precision:0, color:'#aaa' }, beginAtZero: true }
        }
      }
    });
  }

  function buildRevenueChart(orders, products) {
    var canvas = safeEl('revenue-chart');
    if (!canvas || !window.Chart) return;

    var brandMap = {};
    products.forEach(function(p){ brandMap[p.id] = p.brand || 'Unknown'; });

    var brandRevenue = {};
    orders.forEach(function(o) {
      var brand = (o.brand || (o.items && o.items[0] && brandMap[o.items[0].productId]) || 'JANEDORE');
      brandRevenue[brand] = (brandRevenue[brand] || 0) + (o.subtotal || 0);
    });

    var labels = Object.keys(brandRevenue);
    var data   = Object.values(brandRevenue);
    if (labels.length === 0) { labels = ['No data']; data = [0]; }

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Revenue',
          data: data,
          backgroundColor: ['#1a56db','#3b82f6','#60a5fa','#93c5fd','#bfdbfe'].slice(0, labels.length),
          borderWidth: 0,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9, family:'Manrope' }, color:'#aaa' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9, family:'Manrope' }, callback: function(v){ return 'R'+v; }, color:'#aaa' }, beginAtZero: true }
        }
      }
    });
  }

  /* ================================================================
     CUSTOMERS TAB
  ================================================================ */
  function renderCustomersTab() {
    var mc = safeEl('main-content');
    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Customers</div>' +
        '<input class="search-input" id="customer-search" placeholder="Search name, email…" oninput="filterCustomers()" style="max-width:220px;">' +
      '</div>' +
      '<div id="customers-table-wrap">' +
        '<div class="empty-state"><div class="empty-state-icon">◯</div><div class="empty-state-text">Loading…</div></div>' +
      '</div>';

    ordersRef.orderBy('createdAt','desc').limit(200).get().then(function(ords) {
      var customerMap = {};
      ords.docs.forEach(function(d) {
        var o = Object.assign({id:d.id}, d.data());
        var email = o.customerEmail || '';
        if (!email) return;
        if (!customerMap[email]) {
          customerMap[email] = {
            name: o.customerName||'Guest', email:email,
            phone: o.customerPhone||'', orders:0, spent:0, lastOrder:o.createdAt||null
          };
        }
        customerMap[email].orders++;
        customerMap[email].spent += (o.subtotal||0);
        if (o.createdAt && (!customerMap[email].lastOrder || o.createdAt > customerMap[email].lastOrder))
          customerMap[email].lastOrder = o.createdAt;
      });
      window._customersData = Object.values(customerMap).sort(function(a,b){ return b.spent-a.spent; });
      renderCustomersTable(window._customersData);
    }).catch(function(e) {
      var wrap = safeEl('customers-table-wrap');
      if (wrap) wrap.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px;">Error: '+esc(e.message)+'</p>';
    });
  }

  function renderCustomersTable(customers) {
    var search   = ((safeEl('customer-search') || {}).value || '').toLowerCase();
    var filtered = search
      ? customers.filter(function(c){ return (c.name+c.email).toLowerCase().indexOf(search) !== -1; })
      : customers;

    var wrap = safeEl('customers-table-wrap');
    if (!wrap) return;

    if (filtered.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">◯</div><div class="empty-state-text">No customers found.</div></div>';
      return;
    }

    wrap.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Last Order</th></tr></thead>' +
      '<tbody>' +
      filtered.map(function(c) {
        return '<tr onclick="openCustomerDetail(\'' + esc(c.email) + '\')">' +
          '<td style="font-weight:400;">' + esc(c.name) + '</td>' +
          '<td class="cell-muted">' + esc(c.email) + '</td>' +
          '<td class="cell-muted">' + esc(c.phone||'—') + '</td>' +
          '<td>' + esc(String(c.orders)) + '</td>' +
          '<td style="font-weight:400;">' + fmt(c.spent) + '</td>' +
          '<td class="cell-muted">' + fmtDate(c.lastOrder) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window.filterCustomers = function() {
    if (window._customersData) renderCustomersTable(window._customersData);
  };

  window.openCustomerDetail = function(email) {
    var c = (window._customersData||[]).find(function(x){ return x.email===email; });
    if (!c) return;
    var pc = safeEl('panel-container');
    if (!pc) return;
    pc.innerHTML =
      '<div class="slide-panel-overlay" onclick="closePanel()"></div>' +
      '<div class="slide-panel">' +
        '<button class="slide-panel-close" onclick="closePanel()">✕</button>' +
        '<div class="ui-label" style="margin-bottom:4px;">Customer</div>' +
        '<div style="font-family:var(--display);font-size:22px;font-weight:400;margin-bottom:18px;letter-spacing:.02em;">' + esc(c.name) + '</div>' +
        '<div class="info-panel">' +
          '<div class="info-row"><span class="label">Email</span><span>' + esc(c.email) + '</span></div>' +
          '<div class="info-row"><span class="label">Phone</span><span>' + esc(c.phone||'—') + '</span></div>' +
          '<div class="info-row"><span class="label">Total Orders</span><span>' + esc(String(c.orders)) + '</span></div>' +
          '<div class="info-row"><span class="label">Total Spent</span><span>' + fmt(c.spent) + '</span></div>' +
          '<div class="info-row"><span class="label">Last Order</span><span>' + fmtDate(c.lastOrder) + '</span></div>' +
        '</div>' +
      '</div>';
  };

  /* ================================================================
     REVIEWS TAB
  ================================================================ */
  function renderReviewsTab() {
    var mc = safeEl('main-content');
    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Reviews</div>' +
        '<select class="filter-select" id="review-status-filter" onchange="filterReviews()">' +
          '<option value="">All</option>' +
          '<option value="approved">Approved</option>' +
          '<option value="pending">Pending</option>' +
          '<option value="hidden">Hidden</option>' +
        '</select>' +
      '</div>' +
      '<div id="reviews-list">' +
        '<div class="empty-state"><div class="empty-state-icon">★</div><div class="empty-state-text">Loading…</div></div>' +
      '</div>';

    reviewsRef.orderBy('createdAt','desc').limit(50).get().then(function(revs) {
      window._reviewsData = revs.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      renderReviewsList(window._reviewsData);
    }).catch(function() {
      var el = safeEl('reviews-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No reviews yet.</div></div>';
    });
  }

  function renderReviewsList(reviews) {
    var filter   = (safeEl('review-status-filter') || {}).value || '';
    var filtered = filter
      ? reviews.filter(function(r){ return (r.moderationStatus||'pending') === filter; })
      : reviews;
    var el = safeEl('reviews-list');
    if (!el) return;
    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">★</div><div class="empty-state-text">No reviews.</div></div>';
      return;
    }
    el.innerHTML = filtered.map(function(r) {
      return '<div class="card">' +
        '<div class="card-header">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="color:#f59e0b;font-size:13px;letter-spacing:.05em;">' + '★'.repeat(r.rating||0) + '</span>' +
            '<span style="font-size:10px;color:var(--muted);">' + esc(r.name||'Anonymous') + ' · ' + fmtDate(r.createdAt) + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
            statusBadge(r.moderationStatus||'pending') +
            (r.featured ? '<span class="badge badge-paid">Featured</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="padding:10px 14px;">' +
          '<p style="font-size:12.5px;font-weight:300;line-height:1.55;margin-bottom:10px;">' + esc(r.text||'') + '</p>' +
          (isSuperAdmin() ?
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
              '<button class="btn btn-xs btn-success" onclick="moderateReview(\'' + esc(r.id) + '\',\'approved\')">✓ Approve</button>' +
              '<button class="btn btn-xs btn-ghost" onclick="moderateReview(\'' + esc(r.id) + '\',\'hidden\')">Hide</button>' +
              '<button class="btn btn-xs btn-ghost" onclick="featureReview(\'' + esc(r.id) + '\',' + (!r.featured) + ')">' + (r.featured?'Unfeature':'Feature') + '</button>' +
              '<button class="btn btn-xs btn-danger" onclick="deleteReview(\'' + esc(r.id) + '\')">Delete</button>' +
            '</div>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.filterReviews = function() {
    if (window._reviewsData) renderReviewsList(window._reviewsData);
  };

  window.moderateReview = function(reviewId, status) {
    reviewsRef.doc(reviewId).update({ moderationStatus: status }).then(function() {
      showToast('Review ' + status);
      var r = (window._reviewsData||[]).find(function(x){ return x.id===reviewId; });
      if (r) { r.moderationStatus = status; renderReviewsList(window._reviewsData); }
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.featureReview = function(reviewId, featured) {
    reviewsRef.doc(reviewId).update({ featured: featured }).then(function() {
      showToast(featured ? 'Review featured' : 'Review unfeatured');
      var r = (window._reviewsData||[]).find(function(x){ return x.id===reviewId; });
      if (r) { r.featured = featured; renderReviewsList(window._reviewsData); }
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.deleteReview = function(reviewId) {
    if (!isSuperAdmin()) return;
    if (!confirm('Delete this review?')) return;
    reviewsRef.doc(reviewId).delete().then(function() {
      showToast('Review deleted');
      window._reviewsData = (window._reviewsData||[]).filter(function(x){ return x.id!==reviewId; });
      renderReviewsList(window._reviewsData);
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  /* ================================================================
     NEWSLETTER TAB
  ================================================================ */
  function renderNewsletterTab() {
    var mc = safeEl('main-content');
    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Newsletter</div>' +
        '<div class="section-actions">' +
          '<input class="search-input" id="nl-search" placeholder="Search emails…" oninput="filterNewsletter()" style="max-width:180px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="exportNewsletterCSV()">↓ CSV</button>' +
        '</div>' +
      '</div>' +
      '<div id="nl-stats" style="margin-bottom:12px;"></div>' +
      '<div id="nl-list"></div>';

    newsletterRef.orderBy('subscribedAt','desc').limit(200).get().then(function(subs) {
      window._nlData = subs.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      var countEl = safeEl('nl-stats');
      if (countEl) countEl.innerHTML = statCard(subs.size, 'Total Subscribers');
      renderNewsletterList(window._nlData);
    }).catch(function() {
      var el = safeEl('nl-list');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No subscribers yet.</div></div>';
    });
  }

  function renderNewsletterList(subs) {
    var search   = ((safeEl('nl-search') || {}).value || '').toLowerCase();
    var filtered = search ? subs.filter(function(s){ return (s.email||'').toLowerCase().indexOf(search) !== -1; }) : subs;
    var el = safeEl('nl-list');
    if (!el) return;
    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No subscribers found.</div></div>';
      return;
    }
    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Email</th><th>Subscribed</th><th>Tags</th></tr></thead>' +
      '<tbody>' +
      filtered.map(function(s) {
        return '<tr>' +
          '<td style="font-weight:400;">' + esc(s.email||'') + '</td>' +
          '<td class="cell-muted">' + fmtDate(s.subscribedAt) + '</td>' +
          '<td><span style="font-size:9.5px;color:var(--muted);">' + esc((s.tags||[]).join(', ')||'—') + '</span></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window.filterNewsletter = function() {
    if (window._nlData) renderNewsletterList(window._nlData);
  };

  window.exportNewsletterCSV = function() {
    var subs = window._nlData || [];
    if (subs.length === 0) { showToast('No subscribers to export', 'info'); return; }
    var rows = ['Email,Subscribed,Tags'];
    subs.forEach(function(s) {
      rows.push('"'+(s.email||'')+'","'+fmtDate(s.subscribedAt)+'","'+((s.tags||[]).join(';'))+'"');
    });
    var blob = new Blob([rows.join('\n')], {type:'text/csv'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url; a.download = 'janedore-subscribers.csv';
    a.click(); URL.revokeObjectURL(url);
    showToast('CSV exported');
  };

  /* ================================================================
     VENDORS TAB (SUPER_ADMIN only)
  ================================================================ */
  function renderVendorsTab() {
    if (!isSuperAdmin()) {
      safeEl('main-content').innerHTML = '<div class="empty-state"><div class="empty-state-text">Access denied.</div></div>';
      return;
    }
    var mc = safeEl('main-content');
    mc.innerHTML =
      '<div class="section-header" style="margin-bottom:12px;">' +
        '<div class="section-title">Vendors</div>' +
        '<button class="btn btn-sm btn-primary" onclick="openVendorModal(null)">+ Add Vendor</button>' +
      '</div>' +
      '<div id="vendors-list">' +
        '<div class="empty-state"><div class="empty-state-icon">⬡</div><div class="empty-state-text">Loading…</div></div>' +
      '</div>';

    vendorsRef.get().then(function(snap) {
      window._vendorsData = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
      renderVendorsList(window._vendorsData);
    }).catch(function() {
      safeEl('vendors-list').innerHTML =
        '<div class="empty-state"><div class="empty-state-text">No vendors yet.</div></div>';
    });
  }

  function renderVendorsList(vendors) {
    var el = safeEl('vendors-list');
    if (!el) return;
    if (vendors.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⬡</div><div class="empty-state-text">No vendors yet.</div></div>';
      return;
    }
    el.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Vendor</th><th>Brand</th><th>Email</th><th>Status</th><th>Products</th><th></th></tr></thead>' +
      '<tbody>' +
      vendors.map(function(v) {
        var productCount = allProducts.filter(function(p){ return p.vendorId===v.id; }).length;
        return '<tr>' +
          '<td style="font-weight:400;">' + esc(v.name||'—') + '</td>' +
          '<td class="cell-muted">' + esc(v.brand||'—') + '</td>' +
          '<td class="cell-muted">' + esc(v.email||'—') + '</td>' +
          '<td>' + statusBadge(v.status||'active') + '</td>' +
          '<td>' + productCount + '</td>' +
          '<td onclick="event.stopPropagation()">' +
            '<button class="btn btn-xs btn-ghost" onclick="openVendorModal(\'' + esc(v.id) + '\')">Edit</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  window.openVendorModal = function(vendorId) {
    var v = vendorId ? (window._vendorsData||[]).find(function(x){ return x.id===vendorId; }) : null;
    v = v || { id:'', name:'', brand:'', email:'', commissionRate:15, status:'active', notes:'' };
    var html =
      '<div class="modal-overlay" onclick="closeModal()">' +
      '<div class="modal modal-sm" onclick="event.stopPropagation()">' +
        '<div class="modal-handle"></div>' +
        '<button class="modal-close" onclick="closeModal()">✕</button>' +
        '<div class="modal-title">' + (vendorId?'Edit':'New') + ' Vendor</div>' +
        '<form id="vendor-form" onsubmit="handleVendorSubmit(event,\'' + esc(v.id) + '\')">' +
          '<div class="form-group"><label>Vendor Name</label><input name="name" value="' + esc(v.name) + '" required placeholder="e.g. Thato"></div>' +
          '<div class="form-group"><label>Brand Name</label><input name="brand" value="' + esc(v.brand) + '" placeholder="e.g. THATO"></div>' +
          '<div class="form-group"><label>Contact Email</label><input name="email" type="email" value="' + esc(v.email) + '" placeholder="vendor@brand.com"></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Commission %</label><input name="commissionRate" type="number" value="' + esc(String(v.commissionRate||15)) + '" min="0" max="100"></div>' +
            '<div class="form-group"><label>Status</label><select name="status"><option value="active"' + (v.status==='active'?' selected':'') + '>Active</option><option value="suspended"' + (v.status==='suspended'?' selected':'') + '>Suspended</option></select></div>' +
          '</div>' +
          '<div class="form-group"><label>Notes</label><textarea name="notes">' + esc(v.notes||'') + '</textarea></div>' +
          '<div style="display:flex;gap:10px;padding:14px 16px 4px;">' +
            '<button type="submit" class="btn btn-primary btn-sm">Save Vendor</button>' +
            (vendorId ? '<button type="button" class="btn btn-danger btn-sm" onclick="deleteVendor(\'' + esc(vendorId) + '\')">Delete</button>' : '') +
          '</div>' +
        '</form>' +
      '</div></div>';
    safeEl('modal-container').innerHTML = html;
  };

  window.handleVendorSubmit = function(e, existingId) {
    e.preventDefault();
    var form     = e.target;
    var vendorId = existingId || ('vendor-' + Date.now());
    var data = {
      id:             vendorId,
      name:           form.name.value,
      brand:          form.brand.value,
      email:          form.email.value,
      commissionRate: parseFloat(form.commissionRate.value) || 15,
      status:         form.status.value,
      notes:          form.notes.value,
      updatedAt:      new Date().toISOString()
    };
    if (!existingId) data.createdAt = new Date().toISOString();
    vendorsRef.doc(vendorId).set(data, {merge:true}).then(function() {
      showToast('Vendor saved');
      closeModal();
      renderVendorsTab();
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  window.deleteVendor = function(vendorId) {
    if (!confirm('Delete this vendor?')) return;
    vendorsRef.doc(vendorId).delete().then(function() {
      showToast('Vendor deleted');
      closeModal();
      renderVendorsTab();
    }).catch(function(e){ showToast('Error: '+e.message,'error'); });
  };

  /* ================================================================
     PRODUCTS TAB
  ================================================================ */
  function renderProductsTab() {
    var mc = safeEl('main-content');

    mc.innerHTML = (!isSuperAdmin()
      ? '<div class="vendor-scope-bar">⬡ Showing your brand\'s products only</div>'
      : '') +
      '<div class="section-header" style="margin-bottom:10px;">' +
        '<div class="section-title">Products</div>' +
        '<button class="btn btn-sm btn-primary" onclick="openNewProductModal()">+ Product</button>' +
      '</div>' +
      '<div class="toolbar">' +
        '<input class="search-input" id="product-search" placeholder="Search products…" oninput="filterProducts()">' +
        '<select class="filter-select" id="product-cat-filter" onchange="filterProducts()">' +
          '<option value="">All Categories</option>' +
          ['dresses','tops','bottoms','jackets','sets','sunglasses','jewelry','bags','parfum'].map(function(c){
            return '<option value="'+c+'">'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>';
          }).join('') +
        '</select>' +
        '<select class="filter-select" id="product-status-filter" onchange="filterProducts()">' +
          '<option value="">All Statuses</option>' +
          '<option value="active">Active</option>' +
          '<option value="draft">Draft</option>' +
        '</select>' +
        '<div class="toolbar-spacer"></div>' +
        '<span id="products-filtered-count" class="ui-label"></span>' +
      '</div>' +
      '<div class="product-list" id="products-list">' +
        allProducts.map(renderProductRow).join('') +
      '</div>';
  }

  function renderProductRow(p) {
    return '<div class="product-row">' +
      '<div onclick="openProductModal(' + esc(JSON.stringify(p)) + ')" style="flex:1;min-width:0;">' +
        '<div class="pi-name">' + esc(p.name) + '</div>' +
        '<div class="pi-meta">' + esc(p.brand||'') + ' · ' + esc(p.category||'') + ' · ' + fmt(p.price) +
          (p.stock <= 3
            ? ' · <span style="color:var(--danger);font-weight:600;">' + esc(String(p.stock)) + ' left</span>'
            : ' · ' + esc(String(p.stock)) + ' in stock') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span class="badge badge-' + (p.status==='active'?'active':'draft') + '">' + esc(p.status||'draft') + '</span>' +
        '<div class="pi-actions">' +
          '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();duplicateProduct(\'' + esc(p.id) + '\')" title="Duplicate">⊕</button>' +
          '<button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();archiveProduct(\'' + esc(p.id) + '\')" title="Archive">▽</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  window.filterProducts = function() {
    var search  = ((safeEl('product-search')        || {}).value || '').toLowerCase();
    var cat     = ((safeEl('product-cat-filter')    || {}).value || '');
    var status  = ((safeEl('product-status-filter') || {}).value || '');
    var filtered = allProducts.filter(function(p) {
      if (cat    && p.category !== cat)    return false;
      if (status && p.status   !== status) return false;
      if (search && (p.name+p.brand+p.sku).toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
    var countEl = safeEl('products-filtered-count');
    if (countEl) countEl.textContent = filtered.length + ' products';
    var listEl = safeEl('products-list');
    if (listEl) listEl.innerHTML = filtered.map(renderProductRow).join('');
  };

  /* ================================================================
     PRODUCT MODAL — original logic 100% preserved
  ================================================================ */
  window.openNewProductModal = function() { openProductModal(null); };
  window.openProductModal = function(product) {
    var p = product || {
      id:'', sku:'', name:'', brand:'JANEDORE', vendorId:'janedore',
      category:'dresses', price:0, salePrice:null, badge:'', sizes:[], stock:0,
      status:'active', featured:false, description:'', productFeatures:'',
      compositionCare:'', shippingReturns:'',
      variants:[{ color:'', swatch:'#111', images:{ model:[''], ghost:[''], detail:[] } }]
    };
    var html =
      '<div class="modal-overlay" id="product-modal-overlay" onclick="closeModal()">' +
      '<div class="modal" onclick="event.stopPropagation()">' +
        '<div class="modal-handle"></div>' +
        '<button class="modal-close" onclick="closeModal()">✕</button>' +
        '<div class="modal-title">' + (product?'Edit':'New') + ' Product</div>' +
        '<form id="product-form" onsubmit="handleProductSubmit(event,\'' + esc(p.id) + '\')">' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Name</label><input name="name" value="' + esc(p.name) + '" required></div>' +
            '<div class="form-group"><label>SKU</label><input name="sku" value="' + esc(p.sku) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Brand</label>' +
              '<select name="brand">' +
                ['JANEDORE','NIRIUS CO','THATO'].map(function(b){ return '<option value="'+b+'"'+(p.brand===b?' selected':'')+'>'+b+'</option>'; }).join('') +
              '</select></div>' +
            '<div class="form-group"><label>Category</label>' +
              '<select name="category">' +
                ['dresses','tops','bottoms','jackets','sets','sunglasses','jewelry','bags','parfum'].map(function(c){
                  return '<option value="'+c+'"'+(p.category===c?' selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>';
                }).join('') +
              '</select></div>' +
            '<div class="form-group"><label>Status</label>' +
              '<select name="status">' +
                '<option value="active"'+(p.status==='active'?' selected':'')+'>Active</option>' +
                '<option value="draft"'+(p.status==='draft'?' selected':'')+'>Draft</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Price (R)</label><input name="price" type="number" value="' + esc(String(p.price)) + '" required></div>' +
            '<div class="form-group"><label>Sale Price</label><input name="salePrice" type="number" value="' + esc(String(p.salePrice||'')) + '"></div>' +
            '<div class="form-group"><label>Stock</label><input name="stock" type="number" value="' + esc(String(p.stock)) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="form-group"><label>Badge</label>' +
              '<select name="badge">' +
                '<option value="">None</option>' +
                '<option value="new"'+(p.badge==='new'?' selected':'')+'>New</option>' +
                '<option value="sale"'+(p.badge==='sale'?' selected':'')+'>Sale</option>' +
                '<option value="sold"'+(p.badge==='sold'?' selected':'')+'>Sold Out</option>' +
              '</select></div>' +
            '<div class="form-group"><label>Sizes (comma)</label><input name="sizes" value="' + esc((p.sizes||[]).join(',')) + '"></div>' +
            '<div class="form-group"><label>Featured</label>' +
              '<select name="featured">' +
                '<option value="false"'+(p.featured?'':' selected')+'>No</option>' +
                '<option value="true"'+(p.featured?' selected':'')+'>Yes</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="form-group"><label>Description</label><textarea name="description">' + esc(p.description||'') + '</textarea></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Product Features</label><textarea name="productFeatures">' + esc(p.productFeatures||'') + '</textarea></div>' +
            '<div class="form-group"><label>Composition &amp; Care</label><textarea name="compositionCare">' + esc(p.compositionCare||'') + '</textarea></div>' +
          '</div>' +
          '<div class="form-group"><label>Shipping &amp; Returns</label><input name="shippingReturns" value="' + esc(p.shippingReturns||'') + '"></div>' +
          '<hr class="divider" style="margin:14px 16px;">' +
          '<div style="padding:0 16px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Variants</div>' +
          '<div id="variants-container" style="padding:0 16px;">' +
            (p.variants||[]).map(function(v,i){ return buildVariantBlock(v,i); }).join('') +
          '</div>' +
          '<div style="padding:0 16px;">' +
            '<button type="button" class="btn-underline" onclick="addVariant()" style="font-size:12px;">+ Add Variant</button>' +
          '</div>' +
          '<div style="padding:16px 16px 4px;display:flex;gap:10px;align-items:center;">' +
            '<button type="submit" class="btn btn-primary btn-sm">Save Product</button>' +
            (product && isSuperAdmin() ? '<button type="button" class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + esc(p.id) + '\')">Delete</button>' : '') +
            (product ? '<button type="button" class="btn btn-ghost btn-sm" onclick="duplicateProduct(\'' + esc(p.id) + '\');closeModal();">Duplicate</button>' : '') +
          '</div>' +
        '</form>' +
      '</div></div>';
    safeEl('modal-container').innerHTML = html;
  };

  function buildVariantBlock(v, index) {
    v = v || {};
    var images     = v.images  || {model:[],ghost:[],detail:[]};
    var modelUrls  = (images.model  && images.model.length)  ? images.model  : [''];
    var ghostUrls  = (images.ghost  && images.ghost.length)  ? images.ghost  : [''];
    var detailUrls = (images.detail && images.detail.length) ? images.detail : [];
    var modelRows  = modelUrls.map(function(u){ return buildImageUrlRow('model', index, u); }).join('');
    var ghostRows  = ghostUrls.map(function(u){ return buildImageUrlRow('ghost', index, u); }).join('');
    var detailRows = detailUrls.map(function(u){ return buildImageUrlRow('detail',index, u); }).join('');
    return '<div class="variant-block">' +
      '<h4>Variant ' + (index+1) + '</h4>' +
      '<div class="form-row" style="padding:0;">' +
        '<div class="form-group" style="padding:0 0 10px;"><label>Color Name</label>' +
          '<input name="variant-color-'+index+'" value="'+esc(v.color||'')+'" placeholder="e.g. Black"></div>' +
        '<div class="form-group" style="padding:0 0 10px;"><label>Swatch (hex)</label>' +
          '<div style="display:flex;gap:7px;align-items:center;">' +
            '<input name="variant-swatch-'+index+'" value="'+esc(v.swatch||'#111')+'" placeholder="#111" style="flex:1;">' +
            '<input type="color" value="'+esc(v.swatch||'#111')+'" style="width:34px;height:34px;padding:2px;border:0.5px solid var(--border-med);cursor:pointer;border-radius:6px;" oninput="document.querySelector(\'[name=variant-swatch-'+index+']\').value=this.value">' +
          '</div></div>' +
      '</div>' +
      '<div class="form-group" style="padding:0 0 8px;"><label>Model Images</label>' +
        '<div class="image-url-inputs" id="variant-model-'+index+'">'+modelRows+'</div>' +
        '<button type="button" class="btn-underline" onclick="addImageUrl(\'model\','+index+')" style="font-size:10px;margin-top:5px;">+ Add Model Image</button></div>' +
      '<div class="form-group" style="padding:0 0 8px;"><label>Ghost / Flat Lay</label>' +
        '<div class="image-url-inputs" id="variant-ghost-'+index+'">'+ghostRows+'</div>' +
        '<button type="button" class="btn-underline" onclick="addImageUrl(\'ghost\','+index+')" style="font-size:10px;margin-top:5px;">+ Add Ghost Image</button></div>' +
      '<div class="form-group" style="padding:0;"><label>Detail Images</label>' +
        '<div class="image-url-inputs" id="variant-detail-'+index+'">'+detailRows+'</div>' +
        '<button type="button" class="btn-underline" onclick="addImageUrl(\'detail\','+index+')" style="font-size:10px;margin-top:5px;">+ Add Detail Image</button></div>' +
    '</div>';
  }

  function buildImageUrlRow(type, variantIndex, url) {
    var placeholder = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%23f0ede8%22 width=%2248%22 height=%2248%22/></svg>';
    return '<div class="image-url-row">' +
      '<input name="variant-'+type+'-'+variantIndex+'[]" value="'+esc(url||'')+'" placeholder="https://…" oninput="this.nextElementSibling.src=this.value||\''+placeholder+'\'">' +
      '<img class="image-preview" src="'+(esc(url)||placeholder)+'" onerror="this.src=\''+placeholder+'\'">' +
    '</div>';
  }

  window.addVariant = function() {
    var c = safeEl('variants-container');
    if (c) c.insertAdjacentHTML('beforeend', buildVariantBlock({}, c.children.length));
  };

  window.addImageUrl = function(type, vi) {
    var container = safeEl('variant-' + type + '-' + vi);
    if (container) container.insertAdjacentHTML('beforeend', buildImageUrlRow(type, vi, ''));
  };

  window.handleProductSubmit = function(e, existingId) {
    e.preventDefault();
    var form = e.target;
    var data = {
      id:              existingId || form.sku.value || ('prod-' + Date.now()),
      sku:             form.sku.value,
      name:            form.name.value,
      brand:           form.brand.value,
      vendorId:        existingId
        ? ((allProducts.find(function(p){return p.id===existingId;})||{}).vendorId || currentVendorId || 'janedore')
        : (currentVendorId || 'janedore'),
      category:        form.category.value,
      price:           parseFloat(form.price.value),
      salePrice:       form.salePrice.value ? parseFloat(form.salePrice.value) : null,
      badge:           form.badge.value || null,
      sizes:           form.sizes.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      stock:           parseInt(form.stock.value, 10),
      status:          form.status.value,
      featured:        form.featured.value === 'true',
      description:     form.description.value,
      productFeatures: form.productFeatures.value,
      compositionCare: form.compositionCare.value,
      shippingReturns: form.shippingReturns.value,
      createdAt:       existingId
        ? ((allProducts.find(function(p){return p.id===existingId;})||{}).createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
      variants:        []
    };
    var vi = 0;
    while (form['variant-color-' + vi]) {
      var mI = form.querySelectorAll('[name="variant-model-'+vi+'[]"]');
      var gI = form.querySelectorAll('[name="variant-ghost-'+vi+'[]"]');
      var dI = form.querySelectorAll('[name="variant-detail-'+vi+'[]"]');
      data.variants.push({
        color:  form['variant-color-' + vi].value,
        swatch: form['variant-swatch-'+ vi].value,
        images: {
          model:  Array.from(mI).map(function(i){ return i.value; }).filter(Boolean),
          ghost:  Array.from(gI).map(function(i){ return i.value; }).filter(Boolean),
          detail: Array.from(dI).map(function(i){ return i.value; }).filter(Boolean)
        }
      });
      vi++;
    }
    saveProduct(data);
  };

  /* ================================================================
     TAB ROUTING
  ================================================================ */
  window.switchTab = function(tab) {
    currentTab = tab;
    if (tab !== 'messages') { activeChatSession = null; detachActiveChatListeners(); }

    /* Sync sidebar (desktop) */
    document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    /* Sync bottom nav */
    document.querySelectorAll('.bnav-btn[data-tab]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    /* Remove active from non-tab bnav btns */
    document.querySelectorAll('.bnav-btn:not([data-tab])').forEach(function(b) {
      b.classList.remove('active');
    });

    renderCurrentTab();
  };

  function renderCurrentTab() {
    var mc = safeEl('main-content');
    if (!mc) return;
    if (analyticsChart && currentTab !== 'dashboard') {
      analyticsChart.destroy(); analyticsChart = null;
    }
    switch (currentTab) {
      case 'dashboard':  renderDashboardTab();  break;
      case 'products':   renderProductsTab();   break;
      case 'messages':   renderMessagesTab();   break;
      case 'reviews':    renderReviewsTab();    break;
      case 'newsletter': renderNewsletterTab(); break;
      case 'orders':     renderOrdersTab();     break;
      case 'customers':  renderCustomersTab();  break;
      case 'vendors':    renderVendorsTab();    break;
      default: break;
    }
  }

})();
