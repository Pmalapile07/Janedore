/* ================================================================
   JANEDORE — AI SETTINGS PANEL (Admin)
   Controls settings/ai_config in Firestore.
   Self-contained. Requires window._adminDB to exist.
   ================================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (window._adminDB) return fn();
    setTimeout(function () { ready(fn); }, 200);
  }

  ready(function () {
    var db     = window._adminDB;
    var docRef = db.collection('settings').doc('ai_config');

    // ── Render ─────────────────────────────────────────────
    function render() {
      var host = document.getElementById('ai-settings-container');
      if (!host) return;

      host.innerHTML = ''
      + '<div class="card" style="margin-top:20px;">'
      +   '<div class="card-header">'
      +     '<span class="card-title">AI Assistant Settings</span>'
      +     '<span id="ai-status-badge" style="font-size:10px;color:var(--muted);margin-left:8px;">Loading…</span>'
      +   '</div>'
      +   '<div style="padding:16px;display:flex;flex-direction:column;gap:14px;">'

      +     '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--border);">'
      +       '<div>'
      +         '<div style="font-size:12px;font-weight:500;">Enable AI Assistant</div>'
      +         '<div style="font-size:10px;color:var(--muted);margin-top:2px;">When off, every message is routed to a human.</div>'
      +       '</div>'
      +       '<button class="btn btn-sm btn-ghost" id="ai-toggle-enabled" data-on="1">On</button>'
      +     '</div>'

      +     '<div>'
      +       '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px;">Model</div>'
      +       '<select id="ai-model" style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:Manrope,sans-serif;font-size:11.5px;background:var(--surface2);border-radius:7px;">'
      +         '<option value="gemini-2.5-flash">gemini-2.5-flash (fast, recommended)</option>'
      +         '<option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (cheapest)</option>'
      +         '<option value="gemini-2.5-pro">gemini-2.5-pro (smarter, slower)</option>'
      +         '<option value="gemini-3.7-flash">gemini-3.7-flash (newest — verify quota)</option>'
      +       '</select>'
      +     '</div>'

      +     '<div>'
      +       '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px;">Greeting (first message customers see)</div>'
      +       '<textarea id="ai-greeting" rows="3" style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:Manrope,sans-serif;font-size:11.5px;background:var(--surface2);border-radius:7px;resize:vertical;"></textarea>'
      +     '</div>'

      +     '<div>'
      +       '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px;">Handoff Phrase</div>'
      +       '<input id="ai-handoff" type="text" placeholder="speak to human" style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:Manrope,sans-serif;font-size:11.5px;background:var(--surface2);border-radius:7px;">'
      +     '</div>'

      +     '<div>'
      +       '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px;">System Prompt (how the AI behaves)</div>'
      +       '<textarea id="ai-prompt" rows="8" placeholder="You are the JANEDORE assistant..." style="width:100%;border:0.5px solid var(--border-med);padding:8px;font-family:Manrope,sans-serif;font-size:11.5px;background:var(--surface2);border-radius:7px;resize:vertical;line-height:1.6;"></textarea>'
      +     '</div>'

      +     '<div style="display:flex;gap:8px;">'
      +       '<button class="btn btn-sm btn-primary" id="ai-save-btn" style="flex:1;">Save Settings</button>'
      +       '<button class="btn btn-sm btn-ghost" id="ai-test-btn">Test AI</button>'
      +     '</div>'

      +     '<div id="ai-test-result" style="display:none;font-size:11px;padding:10px;border-radius:7px;background:var(--surface2);line-height:1.6;"></div>'
      +   '</div>'
      + '</div>';

      bind();
      load();
    }

    // ── Events ─────────────────────────────────────────────
    function bind() {
      var toggle = document.getElementById('ai-toggle-enabled');
      if (toggle) {
        toggle.addEventListener('click', function () {
          var on = toggle.getAttribute('data-on') === '1';
          toggle.setAttribute('data-on', on ? '0' : '1');
          toggle.textContent = on ? 'Off' : 'On';
          toggle.className = 'btn btn-sm ' + (on ? 'btn-ghost' : 'btn-primary');
        });
      }
      var saveBtn = document.getElementById('ai-save-btn');
      if (saveBtn) saveBtn.addEventListener('click', save);
      var testBtn = document.getElementById('ai-test-btn');
      if (testBtn) testBtn.addEventListener('click', testAI);
    }

    // ── Load ───────────────────────────────────────────────
    function load() {
      docRef.get().then(function (snap) {
        var cfg = snap.exists ? snap.data() : {};
        setVal('ai-prompt',   cfg.systemPrompt  || '');
        setVal('ai-greeting', cfg.greeting      || '');
        setVal('ai-handoff',  cfg.handoffPhrase || 'speak to human');
        setVal('ai-model',    cfg.model         || 'gemini-2.5-flash');
        var enabled = cfg.enabled !== false;
        var toggle  = document.getElementById('ai-toggle-enabled');
        if (toggle) {
          toggle.setAttribute('data-on', enabled ? '1' : '0');
          toggle.textContent = enabled ? 'On' : 'Off';
          toggle.className = 'btn btn-sm ' + (enabled ? 'btn-primary' : 'btn-ghost');
        }
        var badge = document.getElementById('ai-status-badge');
        if (badge) {
          badge.textContent = enabled ? 'Active' : 'Disabled';
          badge.style.color = enabled ? 'var(--success,#22c55e)' : 'var(--danger,#ef4444)';
        }
      }).catch(function (e) {
        console.warn('[AI settings] load failed', e.message);
      });
    }

    // ── Save ───────────────────────────────────────────────
    function save() {
      var payload = {
        enabled:       document.getElementById('ai-toggle-enabled').getAttribute('data-on') === '1',
        model:         val('ai-model'),
        systemPrompt:  val('ai-prompt'),
        greeting:      val('ai-greeting'),
        handoffPhrase: val('ai-handoff') || 'speak to human',
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:     firebase.auth().currentUser ? firebase.auth().currentUser.email : 'admin'
      };
      docRef.set(payload, { merge: true }).then(function () {
        if (window._showToast) window._showToast('AI settings saved');
        var badge = document.getElementById('ai-status-badge');
        if (badge) {
          badge.textContent = payload.enabled ? 'Active' : 'Disabled';
          badge.style.color = payload.enabled ? 'var(--success,#22c55e)' : 'var(--danger,#ef4444)';
        }
      }).catch(function (e) {
        if (window._showToast) window._showToast('Save failed: ' + e.message, 'error');
      });
    }

    // ── Test ───────────────────────────────────────────────
    function testAI() {
      var out = document.getElementById('ai-test-result');
      if (out) { out.style.display = 'block'; out.textContent = 'Testing…'; }

      var prompt = val('ai-prompt');
      var model  = val('ai-model');
      if (!prompt) { if (out) out.textContent = 'Add a system prompt first.'; return; }

      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-ai.js')
        .then(function (lib) {
          var app   = firebase.app();
          var ai    = lib.getAI(app, { backend: new lib.GoogleAIBackend() });
          var gm    = lib.getGenerativeModel(ai, { model: model, systemInstruction: prompt });
          return gm.generateContent('Hello, can you help me track my order?');
        })
        .then(function (r) { if (out) out.textContent = '✅ ' + r.response.text(); })
        .catch(function (e) { if (out) out.textContent = '❌ ' + e.message; });
    }

    function val(id)      { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function setVal(id,v) { var el = document.getElementById(id); if (el) el.value = v || ''; }

    render();
  });
})();
