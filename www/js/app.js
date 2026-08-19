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

      // Support deep links from groups.html (?q=Item Name) to jump straight
      // to that item in the main sheet.
      const params = new URLSearchParams(location.search);
      const q = params.get('q');
      if (q) {
        $('searchInput').value = q;
        Ledger.Sheet.search(q);
      }
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
