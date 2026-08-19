/*
  app.js — Glue layer
  Boots the DB, loads any previously saved sheet, hands it to Sheet.init,
  and wires the one global control (search) that lives outside the grid.
*/
(function () {
  const $ = id => document.getElementById(id);

  async function boot() {
    try {
      await Ledger.DB.init();
      const saved = await Ledger.DB.loadState();
      Ledger.Sheet.init(saved);
      $('statusText').textContent = 'saved on device';
    } catch (err) {
      console.error('DB init failed, running unsaved in-memory only:', err);
      $('statusText').textContent = 'unsaved (storage unavailable)';
      Ledger.Sheet.init(null);
    }
  }

  $('searchInput').addEventListener('input', e => Ledger.Sheet.search(e.target.value));
  $('addRowBtn').onclick = () => Ledger.Sheet.addRow();

  boot();
})();
