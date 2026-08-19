/*
  src/db.js — Backend / persistence layer (SOURCE — gets bundled by esbuild
  into www/js/db.js; don't edit www/js/db.js directly, it's generated).

  The previous version assumed `window.CapacitorSQLite` would just exist in
  the page. It doesn't — the plugin ships as an npm package meant to be
  imported and bundled, which is exactly what was missing. That's the real
  cause of "storage unavailable": the import silently failed, db.init()
  threw, and app.js fell back to in-memory-only mode.
*/
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

window.Ledger = window.Ledger || {};

Ledger.DB = (function () {
  const DB_NAME = 'stockledger';
  let sqlite, db;
  let saveTimer = null;

  function isNative() {
    return Capacitor.isNativePlatform();
  }

  async function init() {
    sqlite = new SQLiteConnection(CapacitorSQLite);

    if (!isNative()) {
      // Browser/dev mode only: jeep-sqlite web component backs the plugin with IndexedDB.
      await customElements.whenDefined('jeep-sqlite');
      const jeepEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepEl);
      await jeepEl.componentOnReady?.();
      await sqlite.initWebStore();
    }

    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    if (isConn) {
      db = await sqlite.retrieveConnection(DB_NAME, false);
    } else {
      db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    }
    await db.open();
    await db.execute(`CREATE TABLE IF NOT EXISTS sheet_data (id INTEGER PRIMARY KEY, json TEXT NOT NULL);`);
  }

  async function loadState() {
    const res = await db.query('SELECT json FROM sheet_data WHERE id = 1;');
    if (res.values && res.values.length > 0) {
      try { return JSON.parse(res.values[0].json); }
      catch (e) { console.error('Corrupt sheet_data JSON, starting fresh.', e); return null; }
    }
    return null;
  }

  function saveState(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush(state), 400);
  }

  async function flush(state) {
    clearTimeout(saveTimer);
    const json = JSON.stringify(state);
    await db.run(
      `INSERT INTO sheet_data (id, json) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json;`,
      [json]
    );
    if (!isNative()) await sqlite.saveToStore(DB_NAME);
  }

  return { init, loadState, saveState, flush };
})();
