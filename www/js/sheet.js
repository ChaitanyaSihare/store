/*
  sheet.js — The spreadsheet engine
  Data shape:
    state = {
      columns: [{ id, label, type }],   // type: 'text' | 'number' | 'image'
      rows:    [{ id, cells: { [columnId]: value } }]
    }
  Nothing here is hardcoded as a fixed schema — columns are just data,
  same as rows. Persistence (Ledger.DB) is called after every change.
*/
window.Ledger = window.Ledger || {};

Ledger.Sheet = (function () {
  const $ = id => document.getElementById(id);
  let state = null;
  let currentQuery = '';
  let menuColId = null; // column currently open in the options sheet

  function defaultTemplate() {
    const col = (label, type = 'text') => ({ id: newId('c'), label, type });
    return {
      columns: [
        col('Name'), col('Category'), col('Size'), col('Color'),
        col('Qty', 'number'), col('Cost', 'number'), col('Sell', 'number'),
        col('Photo', 'image'), col('Group', 'group')
      ],
      rows: [],
      groups: []
    };
  }

  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function groupPath(groupId) {
    const g = state.groups.find(x => x.id === groupId);
    if (!g) return '';
    return g.parentId ? groupPath(g.parentId) + ' / ' + g.name : g.name;
  }

  let viewerRowId = null, viewerColId = null; // photo lightbox state

  // Builds the text actually worth searching for a row: group cells are
  // resolved to their human-readable path (not the internal ID stored in
  // the cell — searching "Girl's" plain-text was silently failing before
  // this, because the raw cell value is an opaque ID like "g1a2b3"), and
  // image cells are skipped since their stored value is base64 photo
  // data, not text worth matching against.
  function rowSearchText(row) {
    return state.columns.map(col => {
      const val = row.cells[col.id];
      if (col.type === 'group') return groupPath(val);
      if (col.type === 'image') return '';
      return val == null ? '' : String(val);
    }).join(' ').toLowerCase();
  }

  // Supports plain substring search across all cells, and a hierarchical
  // form using "/": e.g. "Girl's/Shoe/6" matches rows whose Group column
  // path contains "Girl's" and "Shoe", AND whose remaining cells contain
  // "6" — lets you narrow by group/sub-group before the final term.
  function rowMatchesQuery(row, rawQuery) {
    const q = rawQuery.trim();
    if (!q) return true;
    const hay = rowSearchText(row);

    const segments = q.split('/').map(s => s.trim()).filter(Boolean);
    if (segments.length > 1) {
      const groupCol = state.columns.find(c => c.type === 'group');
      const pathTerms = segments.slice(0, -1);
      const restTerm = segments[segments.length - 1].toLowerCase();
      let groupOk = true;
      if (groupCol) {
        const gPath = groupPath(row.cells[groupCol.id]).toLowerCase();
        groupOk = pathTerms.every(t => gPath.includes(t.toLowerCase()));
      }
      return groupOk && hay.includes(restTerm);
    }
    return hay.includes(q.toLowerCase());
  }

  function init(loadedState) {
    state = loadedState || defaultTemplate();
    state.groups = state.groups || []; // tolerate sheets saved before Groups existed
    render();
    wireModals();
  }

  function persist() {
    return Ledger.DB.saveState(state);
  }

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---------- Mutations ----------
  function addRow() {
    const cells = {};
    state.columns.forEach(c => { cells[c.id] = ''; });
    state.rows.push({ id: newId('r'), cells });
    persist(); render();
  }
  function deleteRow(rowId) {
    state.rows = state.rows.filter(r => r.id !== rowId);
    persist(); render();
    Ledger.Gestures?.toast?.('Row deleted');
  }
  function addColumn(label, type) {
    const col = { id: newId('c'), label: label || 'New column', type: type || 'text' };
    state.columns.push(col);
    state.rows.forEach(r => { r.cells[col.id] = ''; });
    persist(); render();
  }
  function deleteColumn(colId) {
    if (state.columns.length <= 1) { toast('Keep at least one column'); return; }
    state.columns = state.columns.filter(c => c.id !== colId);
    state.rows.forEach(r => { delete r.cells[colId]; });
    persist(); render();
  }
  function updateColumn(colId, label, type) {
    const col = state.columns.find(c => c.id === colId);
    if (!col) return;
    col.label = label;
    col.type = type;
    persist(); render();
  }
  function setCell(rowId, colId, value) {
    const row = state.rows.find(r => r.id === rowId);
    if (row) { row.cells[colId] = value; persist(); }
  }

  function toast(msg) {
    if (window.Ledger.Gestures && Ledger.Gestures.toast) Ledger.Gestures.toast(msg);
  }

  // ---------- Rendering ----------
  function render() {
    const wrap = $('sheetWrap');
    wrap.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'sheet';

    // Header
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    trh.innerHTML = '<th class="row-handle mono">#</th>';
    state.columns.forEach(col => {
      const th = document.createElement('th');
      th.innerHTML = `
        <div class="col-head">
          <input class="col-label" value="${esc(col.label)}" data-col="${col.id}" data-role="rename">
          <button class="col-menu-btn" data-col="${col.id}" data-role="colmenu">⋮</button>
        </div>`;
      trh.appendChild(th);
    });
    const thAdd = document.createElement('th');
    thAdd.className = 'add-col-th';
    thAdd.innerHTML = '<button id="addColOpenBtn">+</button>';
    trh.appendChild(thAdd);
    thead.appendChild(trh);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    let shown = 0;
    state.rows.forEach((row, i) => {
      if (!rowMatchesQuery(row, currentQuery)) return;
      shown++;
      const tr = document.createElement('tr');
      const tdHandle = document.createElement('td');
      tdHandle.className = 'row-handle';
      tdHandle.innerHTML = `<span class="mono">${i + 1}</span><button class="row-del" data-row="${row.id}" data-role="delrow">✕</button>`;
      tr.appendChild(tdHandle);

      state.columns.forEach(col => {
        const td = document.createElement('td');
        const val = row.cells[col.id];
        if (col.type === 'image') {
          td.className = 'cell-image';
          td.innerHTML = val
            ? `<img src="${val}" class="thumb" data-row="${row.id}" data-col="${col.id}" data-role="photo-view">`
            : `<button class="photo-add" data-row="${row.id}" data-col="${col.id}" data-role="photo-add">📷</button>`;
        } else if (col.type === 'group') {
          const options = ['<option value="">—</option>']
            .concat(state.groups.map(g => `<option value="${g.id}" ${g.id === val ? 'selected' : ''}>${esc(groupPath(g.id))}</option>`));
          td.innerHTML = `<select class="cell-input" data-row="${row.id}" data-col="${col.id}" data-role="cell">${options.join('')}</select>`;
        } else {
          td.innerHTML = `<input class="cell-input" type="${col.type === 'number' ? 'number' : 'text'}"
            value="${esc(val)}" data-row="${row.id}" data-col="${col.id}" data-role="cell">`;
        }
        tr.appendChild(td);
      });
      tr.appendChild(document.createElement('td'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    const addRowBar = document.createElement('button');
    addRowBar.className = 'add-row-bar';
    addRowBar.textContent = '+ Add row';
    addRowBar.onclick = addRow;
    wrap.appendChild(addRowBar);

    wireRowEvents();
    updateSummary(shown);
  }

  function updateSummary(shownCount) {
    const qtyCol = state.columns.find(c => /qty|quantity/i.test(c.label));
    const costCol = state.columns.find(c => /cost/i.test(c.label));
    let value = 0;
    if (qtyCol && costCol) {
      state.rows.forEach(r => {
        value += (Number(r.cells[qtyCol.id]) || 0) * (Number(r.cells[costCol.id]) || 0);
      });
    }
    $('totalCount').textContent = shownCount;
    $('totalValue').textContent = '₹' + value.toLocaleString('en-IN');
  }

  function wireRowEvents() {
    document.querySelectorAll('[data-role="cell"]').forEach(inp => {
      inp.addEventListener('change', e => setCell(e.target.dataset.row, e.target.dataset.col, e.target.value));
    });
    document.querySelectorAll('[data-role="rename"]').forEach(inp => {
      inp.addEventListener('change', e => {
        const col = state.columns.find(c => c.id === e.target.dataset.col);
        if (col) { col.label = e.target.value || col.label; persist(); }
      });
    });
    document.querySelectorAll('[data-role="delrow"]').forEach(btn => {
      btn.addEventListener('click', e => deleteRow(e.target.dataset.row));
    });
    document.querySelectorAll('[data-role="colmenu"]').forEach(btn => {
      btn.addEventListener('click', e => openColumnMenu(e.target.dataset.col));
    });
    document.querySelectorAll('[data-role="photo-view"]').forEach(el => {
      el.addEventListener('click', e => {
        openPhotoViewer(e.currentTarget.dataset.row, e.currentTarget.dataset.col);
      });
    });
    document.querySelectorAll('[data-role="photo-add"]').forEach(el => {
      el.addEventListener('click', async e => {
        const row = e.currentTarget.dataset.row, col = e.currentTarget.dataset.col;
        const dataUrl = await Ledger.Photo.pick();
        if (dataUrl) { setCell(row, col, dataUrl); render(); }
      });
    });
    const addColOpenBtn = $('addColOpenBtn');
    if (addColOpenBtn) addColOpenBtn.onclick = () => $('newColOverlay').classList.add('open');
  }

  // ---------- Photo lightbox ----------
  function openPhotoViewer(rowId, colId) {
    viewerRowId = rowId; viewerColId = colId;
    const row = state.rows.find(r => r.id === rowId);
    if (!row) return;
    $('photoViewImg').src = row.cells[colId];
    $('photoViewOverlay').classList.add('open');
  }

  // ---------- Column menu (existing column) ----------
  function openColumnMenu(colId) {
    menuColId = colId;
    const col = state.columns.find(c => c.id === colId);
    if (!col) return;
    $('colMenuTitle').textContent = 'Column: ' + col.label;
    $('colMenuLabelInput').value = col.label;
    document.querySelectorAll('#colMenuOverlay .type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === col.type);
    });
    $('colMenuOverlay').classList.add('open');
  }

  function wireModals() {
    // Photo lightbox
    $('photoViewEditBtn').onclick = async () => {
      const dataUrl = await Ledger.Photo.pick();
      if (dataUrl) {
        setCell(viewerRowId, viewerColId, dataUrl);
        $('photoViewOverlay').classList.remove('open');
        render();
      }
    };
    $('photoViewCloseBtn').onclick = () => $('photoViewOverlay').classList.remove('open');
    $('photoViewOverlay').onclick = e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); };

    // Existing column menu
    document.querySelectorAll('#colMenuOverlay .type-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#colMenuOverlay .type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    $('colMenuSaveBtn').onclick = () => {
      const label = $('colMenuLabelInput').value.trim() || 'Column';
      const type = document.querySelector('#colMenuOverlay .type-btn.active')?.dataset.type || 'text';
      updateColumn(menuColId, label, type);
      $('colMenuOverlay').classList.remove('open');
    };
    $('colDeleteBtn').onclick = () => {
      deleteColumn(menuColId);
      $('colMenuOverlay').classList.remove('open');
    };
    $('colMenuOverlay').onclick = e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); };

    // New column sheet
    document.querySelectorAll('#newColTypeOptions .type-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#newColTypeOptions .type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    $('newColSaveBtn').onclick = () => {
      const label = $('newColLabelInput').value.trim() || 'New column';
      const type = document.querySelector('#newColTypeOptions .type-btn.active')?.dataset.type || 'text';
      addColumn(label, type);
      $('newColLabelInput').value = '';
      $('newColOverlay').classList.remove('open');
    };
    $('newColCancelBtn').onclick = () => $('newColOverlay').classList.remove('open');
    $('newColOverlay').onclick = e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); };
  }

  function search(query) {
    currentQuery = query;
    render();
  }

  return { init, addRow, search };
})();
