// ==================== STORE ANALYTICS ====================
// Live visitors and sessions for Admin > Home, counted by the store
// itself (no Google Analytics). The storefront (analytics.js) pings
// /api/analytics/ping when a session starts and every 30 seconds while a
// tab is open and visible.
//
// Live: tabs that pinged in the last 60 seconds, kept in memory (a
// restart empties it for at most a minute).
// Sessions: one per visit; a visit ends after 30 minutes without
// activity, the same rule Shopify and Google Analytics use. Counted per
// South African day in analyticsDaily/{YYYY-MM-DD} { sessions }.
//
// Nothing personal is stored: the session id is random, made in the
// browser, and only lives in memory here.

module.exports = function registerAnalytics(app, deps) {
  const { adminDb, admin, rateLimited, verifyPlatformStaff } = deps;
  const LIVE_WINDOW_MS = 60 * 1000;
  const live = new Map(); // session id -> last ping time
  const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime/i;

  // Today's date in South Africa (UTC+2, no daylight saving).
  function saDay(ms) {
    return new Date((ms || Date.now()) + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function liveCount() {
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    for (const [id, at] of live) if (at < cutoff) live.delete(id);
    return live.size;
  }

  app.post('/api/analytics/ping', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (BOT_RE.test(String(req.headers['user-agent'] || ''))) return res.json({ ok: true });
    if (rateLimited(req, 'analytics-ping', 120, 10 * 60 * 1000)) return res.json({ ok: true });
    const b = req.body || {};
    const sid = String(b.sid || '');
    if (!/^[a-z0-9]{12,40}$/i.test(sid)) return res.status(400).json({ ok: false });
    live.set(sid, Date.now());
    if (b.newSession && adminDb) {
      try {
        await adminDb.collection('analyticsDaily').doc(saDay()).set(
          { sessions: admin.firestore.FieldValue.increment(1) }, { merge: true });
      } catch (e) { console.error('[ANALYTICS] Session count failed:', e.message); }
    }
    res.json({ ok: true });
  });

  // Admin > Home: live visitors now, and sessions per day for the last
  // `days` days (oldest first). Super Admin and Admin only.
  app.get('/api/admin/analytics', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!adminDb) return res.status(503).json({ error: 'Not configured' });
    if (!(await verifyPlatformStaff(req))) return res.status(403).json({ error: 'Not authorized' });
    const days = Math.min(366, Math.max(1, parseInt(req.query.days, 10) || 30));
    const dates = [];
    for (let i = days - 1; i >= 0; i--) dates.push(saDay(Date.now() - i * 86400000));
    try {
      const docs = await adminDb.getAll(...dates.map(d => adminDb.collection('analyticsDaily').doc(d)));
      const daily = docs.map((d, i) => ({ date: dates[i], sessions: (d.exists && Number(d.data().sessions)) || 0 }));
      res.json({ live: liveCount(), daily, sessions: daily.reduce((n, d) => n + d.sessions, 0) });
    } catch (e) {
      console.error('[ANALYTICS] Read failed:', e.message);
      res.status(500).json({ error: 'Could not load analytics' });
    }
  });
};
