/*
  groups.js — Groups/Sub-groups browsing
  This page is intentionally separate from index.html: it's a lighter DOM
  (no big editable spreadsheet), and images are paginated (PAGE_SIZE at a
  time via "Load more") so opening a group with hundreds of photos doesn't
  freeze the phone — directly answering the customer's "alag page main
  open hoga taki phone hang na ho" request.

  Navigation model: ?group=<id> in the URL is the current level. No group
  param = top level. Tapping a sub-group or the back button navigates to a
  new URL (a real page load), which is what keeps each level's DOM small.
*/
(function () {
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 30;

  const params = new URLSearchParams(location.search);
  const currentGroupId = params.get('group') || null;

  let state = null;
  let shownCount = PAGE_SIZE;

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function persist() {
    return Ledger.DB.saveState(state);
  }

  function childGroups(parentId) {
    return state.groups.filter(g => g.parentId === parentId);
  }

  function groupColumn() {
    return state.columns.find(c => c.type === 'group');
  }

  function itemsInGroup(groupId) {
    const col = groupColumn();
    if (!col) return [];
    return state.rows.filter(r => r.cells[col.id] === groupId);
  }

  function firstPhotoInGroup(groupId) {
    const photoCol = state.columns.find(c => c.type === 'image');
    if (!photoCol) return null;
    const items = itemsInGroup(groupId);
    const withPhoto = items.find(it => it.cells[photoCol.id]);
    return withPhoto ? withPhoto.cells[photoCol.id] : null;
  }

  // A sub-group's tile image is its own first item's photo if it has one,
  // otherwise the first photo found anywhere among its descendants — so a
  // parent category still shows a representative picture even if items
  // are only assigned to its sub-groups, not the parent itself.
  function representativePhoto(groupId) {
    const direct = firstPhotoInGroup(groupId);
    if (direct) return direct;
    for (const child of childGroups(groupId)) {
      const found = representativePhoto(child.id);
      if (found) return found;
    }
    return null;
  }

  function ancestorChain(groupId) {
    const chain = [];
    let g = state.groups.find(x => x.id === groupId);
    while (g) {
      chain.unshift(g);
      g = g.parentId ? state.groups.find(x => x.id === g.parentId) : null;
    }
    return chain;
  }

  // A group and every sub-group nested under it, however deep — needed so
  // deleting a parent group doesn't leave orphaned children behind.
  function descendantIds(groupId) {
    const ids = [groupId];
    childGroups(groupId).forEach(c => ids.push(...descendantIds(c.id)));
    return ids;
  }

  function render() {
    const current = state.groups.find(g => g.id === currentGroupId) || null;
    $('groupTitle').textContent = current ? current.name : 'Groups';
    $('groupMenuBtn').style.display = current ? 'inline-block' : 'none';

    // Breadcrumb: every ancestor is a clickable link, so you can jump
    // straight to any level — not just one step back — to reach a
    // sibling group without walking back up one tap at a time.
    const crumbZone = $('breadcrumb');
    const chain = current ? ancestorChain(currentGroupId) : [];
    const parts = ['<a href="groups.html">🏠 All Groups</a>'];
    chain.forEach((g, i) => {
      const isLast = i === chain.length - 1;
      parts.push(isLast
        ? `<span class="crumb-current">${esc(g.name)}</span>`
        : `<a href="?group=${g.id}">${esc(g.name)}</a>`);
    });
    crumbZone.innerHTML = parts.join(' <span class="crumb-sep">›</span> ');

    // Sub-groups — shown as image tiles (photo + label) like a shopping
    // app's category grid, not plain text pills.
    const subZone = $('subgroupList');
    subZone.innerHTML = '';
    const kids = childGroups(currentGroupId);
    if (kids.length === 0) {
      subZone.innerHTML = '<div class="empty-note">No sub-groups yet.</div>';
    } else {
      kids.forEach(g => {
        const photo = representativePhoto(g.id);
        const card = document.createElement('a');
        card.className = 'group-tile';
        card.href = `?group=${g.id}`;
        card.innerHTML = `
          ${photo
            ? `<img loading="lazy" decoding="async" src="${photo}" class="group-tile-img">`
            : `<div class="group-tile-img placeholder">📁</div>`}
          <div class="group-tile-label">${esc(g.name)}</div>
        `;
        subZone.appendChild(card);
      });
    }

    renderGallery();
  }

  function renderGallery() {
    const gallery = $('itemGallery');
    gallery.innerHTML = '';
    const gCol = groupColumn();

    if (!gCol) {
      gallery.innerHTML = '<div class="empty-note">No "Group" type column exists yet — add one from the sheet\'s column menu, then assign items to a group there.</div>';
      $('loadMoreBtn').style.display = 'none';
      return;
    }
    if (!currentGroupId) {
      gallery.innerHTML = '<div class="empty-note">Open a group to see its items.</div>';
      $('loadMoreBtn').style.display = 'none';
      return;
    }

    const allItems = itemsInGroup(currentGroupId);
    if (allItems.length === 0) {
      gallery.innerHTML = '<div class="empty-note">No items assigned to this group yet.</div>';
      $('loadMoreBtn').style.display = 'none';
      return;
    }

    const photoCol = state.columns.find(c => c.type === 'image');
    const nameCol = state.columns.find(c => /name/i.test(c.label)) || state.columns[0];
    const qtyCol = state.columns.find(c => /qty|quantity/i.test(c.label));
    const priceCol = state.columns.find(c => /sell|price/i.test(c.label));

    const visible = allItems.slice(0, shownCount);
    visible.forEach(it => {
      const photo = photoCol ? it.cells[photoCol.id] : null;
      const name = nameCol ? it.cells[nameCol.id] : '';
      const card = document.createElement('a');
      card.className = 'item-card';
      card.href = `index.html?q=${encodeURIComponent(name || '')}`;
      card.innerHTML = `
        ${photo ? `<img loading="lazy" decoding="async" src="${photo}" class="item-thumb">` : `<div class="item-thumb placeholder">No photo</div>`}
        <div class="item-card-name">${esc(name)}</div>
        <div class="item-card-sub mono">${qtyCol ? 'Qty ' + (it.cells[qtyCol.id] || 0) : ''} ${priceCol ? '· ₹' + (it.cells[priceCol.id] || 0) : ''}</div>
      `;
      gallery.appendChild(card);
    });

    $('loadMoreBtn').style.display = allItems.length > shownCount ? 'block' : 'none';
  }

  $('loadMoreBtn').onclick = () => {
    shownCount += PAGE_SIZE;
    renderGallery();
  };

  $('addGroupBtn').onclick = async () => {
    const name = $('newGroupInput').value.trim();
    if (!name) return;
    state.groups.push({ id: newId('g'), name, parentId: currentGroupId });
    $('newGroupInput').value = '';
    render(); // update the screen immediately — don't wait on the save
    try {
      await persist();
      Ledger.Gestures.toast('Group added');
    } catch (e) {
      console.error('Could not save new group:', e);
      Ledger.Gestures.toast('Group added, but not saved (storage error)');
    }
  };

  window.addEventListener('pagehide', () => { Ledger.DB.close(); });

  // ---------- Rename / delete the currently-viewed group ----------
  $('groupMenuBtn').onclick = () => {
    const current = state.groups.find(g => g.id === currentGroupId);
    if (!current) return;
    $('groupMenuNameInput').value = current.name;
    $('groupMenuOverlay').classList.add('open');
  };
  $('groupMenuOverlay').onclick = e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); };

  $('groupMenuSaveBtn').onclick = () => {
    const current = state.groups.find(g => g.id === currentGroupId);
    const name = $('groupMenuNameInput').value.trim();
    if (current && name) current.name = name;
    $('groupMenuOverlay').classList.remove('open');
    render(); // show the rename immediately
    persist()
      .then(() => Ledger.Gestures.toast('Group renamed'))
      .catch(e => { console.error('Could not save rename:', e); Ledger.Gestures.toast('Renamed, but not saved (storage error)'); });
  };

  $('groupDeleteBtn').onclick = async () => {
    const current = state.groups.find(g => g.id === currentGroupId);
    if (!current) return;

    // Cascade: remove this group and every sub-group beneath it, and
    // unassign (not delete) any items that pointed at any of them —
    // otherwise those items would silently point at a group ID that no
    // longer exists.
    const idsToRemove = new Set(descendantIds(current.id));
    const gCol = groupColumn();
    if (gCol) {
      state.rows.forEach(r => {
        if (idsToRemove.has(r.cells[gCol.id])) r.cells[gCol.id] = '';
      });
    }
    state.groups = state.groups.filter(g => !idsToRemove.has(g.id));
    $('groupMenuOverlay').classList.remove('open');

    // We're about to navigate away (this group no longer exists, so
    // there's nothing left to render here) — wait for the save to finish
    // first this time, so the deletion isn't lost the way the earlier
    // debounced-save bug used to lose changes on quick navigation.
    try { await persist(); } catch (e) { console.error('Could not save group deletion:', e); }
    location.href = current.parentId ? `?group=${current.parentId}` : 'groups.html';
  };

  async function boot() {
    try {
      await Ledger.DB.init();
      state = (await Ledger.DB.loadState()) || { columns: [], rows: [], groups: [] };
    } catch (err) {
      console.error('Could not load sheet data on Groups page — continuing unsaved:', err);
      state = { columns: [], rows: [], groups: [] };
      $('groupTitle').textContent = 'Groups (unsaved)';
    }
    state.groups = state.groups || [];
    render();
  }

  boot();
})();
