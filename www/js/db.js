/*
  db.js — Backend / persistence layer
  Single responsibility: load and save the sheet's state (columns + rows)
  to real storage. sheet.js never touches SQLite directly — it only calls
  Ledger.DB.loadState() / Ledger.DB.saveState(state).

  Native (Android via Capacitor): uses @capacitor-community/sqlite,
  writing to a real on-device SQLite database.

  Browser (plain `npx cap serve` or opening in a desktop browser to test
  before building the APK): uses the same plugin's web support via the
  jeep-sqlite web component, which itself persists to IndexedDB. This
  means the data layer is identical on device and in the browser — no
  separate "demo mode" to maintain.
*/
window.Ledger = window.Ledger || {};

Ledger.DB = (function () {
  const DB_NAME = 'stockledger';
  let sqlite, db;
  let saveTimer = null;

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  async function init() {
    const { SQLiteConnection, CapacitorSQLite } = window.CapacitorSQLite || {};
    if (!SQLiteConnection) {
      throw new Error('capacitor-community/sqlite JS bridge not found. Did npm install run and npx cap sync complete?');
    }
    sqlite = new SQLiteConnection(CapacitorSQLite);

    if (!isNative()) {
      // Browser/dev mode: jeep-sqlite web component backs the plugin with IndexedDB.
      await customElements.whenDefined('jeep-sqlite');
      const jeepEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepEl);
      await jeepEl.componentOnReady?.();
      await sqlite.initWebStore();
    }

    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
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

  // Debounced so rapid keystrokes/cell edits don't hammer disk writes.
  function saveState(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const json = JSON.stringify(state);
      await db.run(
        `INSERT INTO sheet_data (id, json) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json;`,
        [json]
      );
      if (!isNative()) await sqlite.saveToStore(DB_NAME);
    }, 400);
  }

  // Force an immediate write (e.g. before the app is backgrounded).
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
