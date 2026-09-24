/* ============================================================
   NDURANCE — AutoSave add-on (NEW FILE — does not modify any
   existing script). Wraps LiveSession.stop() so that whenever a
   test completes:
     1. A .zip (report.json + left/back/right.webm) is generated,
        the same way the app already downloads files today.
     2. The zip blob is cached in IndexedDB (large local storage).
     3. A lightweight metadata record is written to localStorage.
     4. The zip is written into a local folder named after the
        athlete's username, via the File System Access API
        (Chrome/Edge). One-time folder permission is requested
        the first time, via the "Enable folder auto-save" button
        this file injects — after that it's fully silent.
     5. If the File System Access API is unavailable (Firefox/
        Safari) or permission was never granted, it falls back to
        a normal zip download, same as the rest of the app does.
   ============================================================ */
'use strict';

const NAutoSave = {
  DB_NAME: 'ndurance_autosave',
  DB_VERSION: 1,
  STORE_ZIPS: 'zips',
  STORE_HANDLES: 'dir_handles',
  LS_KEY: 'ndurance.autosave.sessions',
  ROOT_KEY: '_root',

  _dbPromise: null,

  db() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE_ZIPS)) db.createObjectStore(this.STORE_ZIPS, { keyPath: 'sessionId' });
        if (!db.objectStoreNames.contains(this.STORE_HANDLES)) db.createObjectStore(this.STORE_HANDLES, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._dbPromise;
  },

  async idbPut(store, value) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async idbGet(store, key) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  /* ---- localStorage metadata index (small, safe size) ---- */
  appendMeta(entry) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(this.LS_KEY) || '[]'); } catch { arr = []; }
    arr.unshift(entry);
    if (arr.length > 200) arr = arr.slice(0, 200);
    localStorage.setItem(this.LS_KEY, JSON.stringify(arr));
  },

  getMetaIndex() {
    try { return JSON.parse(localStorage.getItem(this.LS_KEY) || '[]'); } catch { return []; }
  },

  /* ---- File System Access folder handling ---- */
  supportsFS() { return 'showDirectoryPicker' in window; },

  async getStoredRootHandle() {
    const rec = await this.idbGet(this.STORE_HANDLES, this.ROOT_KEY);
    return rec ? rec.handle : null;
  },

  async hasFolderPermission() {
    if (!this.supportsFS()) return false;
    const handle = await this.getStoredRootHandle();
    if (!handle) return false;
    try { return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; }
    catch { return false; }
  },

  /* Must be called from within a real click handler (user gesture). */
  async requestFolderAccess() {
    if (!this.supportsFS()) throw new Error('Folder auto-save is not supported in this browser (Chrome or Edge required).');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await this.idbPut(this.STORE_HANDLES, { key: this.ROOT_KEY, handle });
    return handle;
  },

  async getUserFolder(username) {
    let root = await this.getStoredRootHandle();
    if (!root) throw new Error('No folder selected yet');
    const perm = await root.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const req = await root.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') throw new Error('Folder permission not granted');
    }
    const safeName = 'NDURANCE_' + String(username || 'athlete').replace(/[^a-zA-Z0-9_-]/g, '_');
    return root.getDirectoryHandle(safeName, { create: true });
  },

  /* ---- zip + save on session complete ---- */
  buildReportObject(result, user) {
    return {
      id: U.uuid(),
      session_id: result.sessionId,
      user_id: user.id,
      athlete_name: user.full_name || user.username,
      generated_at: new Date().toISOString(),
      overall_score: result.summary?.avg_overall ?? 0,
      grade: result.summary?.grade || '—',
      report_json: JSON.stringify({
        summary: result.summary,
        timeline_points: (result.timeline || []).length,
        session: {
          started_at: result.record?.started_at,
          duration_s: result.summary?.duration_s
        }
      })
    };
  },

  async handleSessionComplete(result, user) {
    if (!result || !result.sessionId) return;
    try {
      const reportRecord = this.buildReportObject(result, user);

      // Also persist to the app's own reports table so it appears
      // on the Reports page automatically (same shape the manual
      // "Generate Report" button already writes).
      try { await API.create('reports', reportRecord); } catch (e) { console.warn('AutoSave: report table write failed', e); }

      const zip = new JSZip();
      zip.file('report.json', JSON.stringify({ ...reportRecord, report_json: JSON.parse(reportRecord.report_json) }, null, 2));
      const videoFiles = result.videoFiles || {};
      for (const [view, blob] of Object.entries(videoFiles)) {
        zip.file(`${view}.webm`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const username = user.username || 'athlete';
      const filename = `${username}_${ts}_${result.sessionId.slice(0, 8)}.zip`;

      // 1. IndexedDB — the actual zip blob (no size ceiling like localStorage)
      await this.idbPut(this.STORE_ZIPS, {
        sessionId: result.sessionId, username, filename, blob: zipBlob,
        size: zipBlob.size, createdAt: new Date().toISOString()
      });

      // 2. localStorage — small metadata record, per your request
      this.appendMeta({
        sessionId: result.sessionId, username, filename,
        size: zipBlob.size, score: result.summary?.avg_overall ?? 0,
        grade: result.summary?.grade || '—', savedAt: new Date().toISOString(),
        folderSaved: false
      });

      // 3. Try writing straight into NDURANCE_<username>/ on disk
      let folderSaved = false;
      if (await this.hasFolderPermission()) {
        try {
          const dirHandle = await this.getUserFolder(username);
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(zipBlob);
          await writable.close();
          folderSaved = true;
        } catch (e) { console.warn('AutoSave: folder write failed, falling back to download', e); }
      }

      if (folderSaved) {
        const idx = this.getMetaIndex();
        if (idx[0] && idx[0].sessionId === result.sessionId) { idx[0].folderSaved = true; localStorage.setItem(this.LS_KEY, JSON.stringify(idx)); }
        U.toast(`Saved to NDURANCE_${username}/${filename}`, 'ok');
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        const msg = this.supportsFS()
          ? `Zip downloaded as ${filename} — click "Enable folder auto-save" to save future tests directly to a folder.`
          : `Zip downloaded as ${filename} (this browser doesn't support direct folder saving).`;
        U.toast(msg, 'info');
      }
    } catch (e) {
      console.error('AutoSave failed', e);
      U.toast('Auto-save failed: ' + e.message, 'err');
    }
  },

  /* ---- floating "enable folder" button, persists across page navigation ---- */
  injectButton() {
    if (document.getElementById('autosave-enable-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'autosave-enable-btn';
    btn.type = 'button';
    btn.textContent = 'Enable folder auto-save';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 16px;border-radius:10px;border:none;background:#7f77dd;color:#fff;font:500 13px Inter,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    btn.onclick = async () => {
      try {
        await this.requestFolderAccess();
        U.toast('Folder access granted — future tests save automatically', 'ok');
        btn.remove();
      } catch (e) { U.toast(e.message, 'err'); }
    };
    document.body.appendChild(btn);
  },

  async refreshButtonVisibility() {
    if (!this.supportsFS()) return; // nothing to offer on Firefox/Safari
    if (!window.Auth || !Auth.isAuthenticated) { const b = document.getElementById('autosave-enable-btn'); if (b) b.remove(); return; }
    const granted = await this.hasFolderPermission();
    if (granted) { const b = document.getElementById('autosave-enable-btn'); if (b) b.remove(); }
    else this.injectButton();
  },

  init() {
    if (!window.LiveSession) { console.warn('AutoSave: LiveSession not found, skipping init'); return; }
    const originalStop = LiveSession.stop.bind(LiveSession);
    LiveSession.stop = async (...args) => {
      const result = await originalStop(...args);
      if (result) {
        try { await this.handleSessionComplete(result, Auth.user); }
        catch (e) { console.error('AutoSave error', e); }
      }
      return result;
    };
    this.refreshButtonVisibility();
    setInterval(() => this.refreshButtonVisibility(), 2000);
  }
};

window.NAutoSave = NAutoSave;
document.addEventListener('DOMContentLoaded', () => NAutoSave.init());
