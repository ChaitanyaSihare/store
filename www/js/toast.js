/*
  toast.js — tiny status-message helper used instead of alert()/confirm()
  for things like "Row deleted" or "Keep at least one column".
*/
window.Ledger = window.Ledger || {};

Ledger.Gestures = (function () {
  let timer = null;
  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 1800);
  }
  return { toast };
})();
