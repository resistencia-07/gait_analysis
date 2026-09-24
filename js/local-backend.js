/* ============================================================
   NDURANCE — Local backend shim (NEW FILE — does not modify
   api.js or any other existing script).

   Problem: api.js calls fetch('tables/<table>...') expecting a
   real REST backend. When this app is opened as static files
   (e.g. VS Code Live Server on 127.0.0.1:5501) there is no such
   backend, so every call 404s and sign in / sign up can never
   succeed.

   Fix: wrap window.fetch so any request whose URL starts with
   "tables/" is answered locally instead of going over the
   network — backed by localStorage so data survives reloads.
   Every other fetch (fonts, CDN scripts, future real APIs)
   passes straight through untouched.
   ============================================================ */
'use strict';

(function () {
  const DB_PREFIX = 'ndurance.localdb.';
  const realFetch = window.fetch.bind(window);

  function uuid() {
    return (crypto.randomUUID) ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  function readTable(table) {
    try { return JSON.parse(localStorage.getItem(DB_PREFIX + table) || '[]'); }
    catch { return []; }
  }

  function writeTable(table, rows) {
    localStorage.setItem(DB_PREFIX + table, JSON.stringify(rows));
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' }
    });
  }

  function parsePath(url) {
    // url looks like "tables/users" or "tables/users/abc123?limit=100"
    const [pathPart, queryPart] = url.split('?');
    const parts = pathPart.split('/').filter(Boolean); // ["tables","users","abc123"?]
    const table = parts[1];
    const id = parts[2] || null;
    const params = new URLSearchParams(queryPart || '');
    return { table, id, limit: params.get('limit') ? parseInt(params.get('limit'), 10) : null };
  }

  async function handle(url, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const { table, id, limit } = parsePath(url);
    if (!table) return jsonResponse({ error: 'Invalid table request' }, 400);

    let rows = readTable(table);

    if (method === 'GET' && !id) {
      const data = limit ? rows.slice(0, limit) : rows;
      return jsonResponse({ data, total: rows.length });
    }

    if (method === 'GET' && id) {
      const row = rows.find(r => r.id === id);
      return row ? jsonResponse(row) : jsonResponse({ error: 'Not found' }, 404);
    }

    if (method === 'POST') {
      let body = {};
      try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
      const record = { ...body, id: body.id || uuid(), created_at: body.created_at || new Date().toISOString() };
      rows.push(record);
      writeTable(table, rows);
      return jsonResponse(record, 201);
    }

    if (method === 'PATCH') {
      const idx = rows.findIndex(r => r.id === id);
      if (idx === -1) return jsonResponse({ error: 'Not found' }, 404);
      let body = {};
      try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
      rows[idx] = { ...rows[idx], ...body, updated_at: new Date().toISOString() };
      writeTable(table, rows);
      return jsonResponse(rows[idx]);
    }

    if (method === 'DELETE') {
      rows = rows.filter(r => r.id !== id);
      writeTable(table, rows);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unsupported method' }, 405);
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.startsWith('tables/')) {
      return handle(url, init || {});
    }
    return realFetch(input, init);
  };

  window.NLocalBackend = {
    DB_PREFIX,
    dump(table) { return readTable(table); },
    clearAll() {
      Object.keys(localStorage)
        .filter(k => k.startsWith(DB_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    }
  };
})();
