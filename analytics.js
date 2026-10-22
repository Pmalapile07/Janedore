// Store analytics: tells the server this visitor is here, for Live and
// Sessions in Admin > Home (analytics-api.js). A session is one visit
// and ends after 30 minutes without the store open and in view. The id
// is random and anonymous; nothing about the visitor is sent.
(function () {
  if (window.__adminPreview) return;
  var KEY = 'jd_session';
  var IDLE_MS = 30 * 60 * 1000;
  var memory = null; // used when the browser blocks localStorage

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || memory; } catch (e) { return memory; }
  }
  function write(s) {
    memory = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function ping() {
    if (document.visibilityState !== 'visible') return;
    var now = Date.now();
    var s = read();
    var isNew = !s || !s.id || now - (s.last || 0) > IDLE_MS;
    if (isNew) s = { id: newId() };
    s.last = now;
    write(s);
    try {
      fetch('/api/analytics/ping', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: s.id, newSession: isNew })
      }).catch(function () {});
    } catch (e) {}
  }

  ping();
  setInterval(ping, 30000);
  document.addEventListener('visibilitychange', ping);
})();
