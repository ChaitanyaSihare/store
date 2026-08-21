/*
  src/db.js — Backend / persistence layer (SOURCE — gets bundled by esbuild
  into www/js/db.js; don't edit www/js/db.js directly, it's generated).
*/
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

window.Ledger = window.Ledger || {};

Ledger.DB = (function () {
  const DB_NAME = 'stockledger';
  let sqlite, db;

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

    // Trying to "reuse" a connection across pages (index.html <->
    // groups.html) turned out to be fragile — bouncing between the two
    // pages repeatedly could leave the connection in a broken state,
    // which is what caused "storage unavailable" and the sheet appearing
    // empty even though the data was never actually lost on disk.
    // Simpler and more reliable: every page closes any leftover
    // connection first, then always opens its own fresh one. Each page
    // is expected to call Ledger.DB.close() when it's navigated away
    // from (wired up via the 'pagehide' event in app.js / groups.js).
    try {
      const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
      if (isConn) {
        await sqlite.closeConnection(DB_NAME, false);
      }
    } catch (e) {
      // Nothing to close, or the check itself isn't supported yet — fine,
      // createConnection below will surface any real problem.
    }

    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await db.execute(`CREATE TABLE IF NOT EXISTS sheet_data (id INTEGER PRIMARY KEY, json TEXT NOT NULL);`);
  }

  // Called when leaving a page, so the next page starts clean rather than
  // fighting over a shared connection.
  async function close() {
    try {
      if (sqlite) await sqlite.closeConnection(DB_NAME, false);
    } catch (e) {
      // Already closed or never opened — fine.
    }
  }

  async function loadState() {
    const res = await db.query('SELECT json FROM sheet_data WHERE id = 1;');
    if (res.values && res.values.length > 0) {
      try { return JSON.parse(res.values[0].json); }
      catch (e) { console.error('Corrupt sheet_data JSON, starting fresh.', e); return null; }
    }
    return null;
  }

  // Writes used to be debounced 400ms, which created a real bug: if you
  // navigated to another page within that window, the pending write was
  // silently dropped — "sometimes saved, sometimes not." Every call here
  // already comes from a discrete action (an input's onchange on blur, a
  // button tap) rather than every keystroke, so there's no need to
  // debounce — write immediately instead.
  async function saveState(state) {
    return flush(state);
  }

  async function flush(state) {
    const json = JSON.stringify(state);
    await db.run(
      `INSERT INTO sheet_data (id, json) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json;`,
      [json]
    );
    if (!isNative()) await sqlite.saveToStore(DB_NAME);
  }

  return { init, close, loadState, saveState, flush };
})();
