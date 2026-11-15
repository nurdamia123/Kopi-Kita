/* ==========================================================
   Kopi Kita - js/pages/inventory.js
   Purpose: Inventory management for the admin
     - stock list: search, filter, sort, pagination
     - add / edit / delete stock items
     - restock and stock adjustment (wastage, expired, count fix)
     - purchase orders: create, auto-create for low stock,
       receive (adds stock) and cancel
     - suppliers directory
     - stock history log with export
     - 3 charts and summary cards
   ========================================================== */
(function () {
  if (!KK.session()) return;
  const $ = id => document.getElementById(id);
  const isLow = i => i.stock < i.reorder;
  const pct = i => Math.min(100, Math.round(i.stock / i.max * 100));
  const levelCls = i => isLow(i) ? 'low' : pct(i) < 40 ? 'mid' : '';
  const statusBadge = i => i.stock <= 0 ? KK.badge('Out of stock', 'cancelled') : isLow(i) ? KK.badge('Low', 'low') : KK.badge('In stock', 'in');
  const unitsWhole = ['pcs', 'can', 'tray', 'box', 'pack', 'bottle', 'tub', 'loaf'];
  const step = unit => unitsWhole.includes(unit) ? 1 : 0.1;
  let poFilter = 'All';
  let stockPager, logPager;

  /* read ?status=low from the link (e.g. from the dashboard) */
  const qs = new URLSearchParams(location.search).get('status');
  if (qs) $('iStatus').value = qs;

  /* ---------- Summary cards ---------- */
  function drawKpis() {
    const inv = DB.inventory();
    const low = inv.filter(isLow);
    const out = inv.filter(i => i.stock <= 0);
    const value = inv.reduce((s, i) => s + i.stock * i.unitCost, 0);
    const pending = DB.purchaseOrders().filter(p => p.status === 'Pending');
    const cards = [
      ['items', 'Stock items', inv.length, 'bi-box-seam', `${new Set(inv.map(i => i.category)).size} categories`],
      ['low', 'Low stock', low.length, 'bi-exclamation-triangle', 'Below reorder level'],
      ['out', 'Out of stock', out.length, 'bi-x-octagon', out.length ? 'Order now' : 'None - good'],
      ['value', 'Stock value', KK.rm0(value), 'bi-cash-stack', 'At cost price'],
      ['po', 'Pending orders', pending.length, 'bi-truck', KK.rm0(pending.reduce((s, p) => s + DB.poTotal(p), 0)) + ' on the way']
    ];
    $('kpiRow').innerHTML = cards.map(([k, l, v, i, f]) => `<div class="col-6 col-md-4 col-xl"><div class="kk-card kpi" role="button" tabindex="0" data-k="${k}">
      <div class="d-flex justify-content-between"><div class="kpi-label">${l}</div><div class="kpi-icon"><i class="bi ${i}"></i></div></div>
      <div class="kpi-value ${(k === 'low' || k === 'out') && v ? 'text-danger' : ''}">${v}</div><div class="kpi-foot">${f}</div></div></div>`).join('');
  }
  $('kpiRow').addEventListener('click', e => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === 'low') { $('iStatus').value = 'low'; showTab('stock'); drawTable(); }
    if (k === 'items') { $('iStatus').value = ''; $('iCat').value = ''; showTab('stock'); drawTable(); }
    if (k === 'out') { $('iStatus').value = 'low'; $('iSort').value = 'level'; showTab('stock'); drawTable(); }
    if (k === 'po') { poFilter = 'Pending'; showTab('po'); drawPOs(); }
    if (k === 'value') { $('iSort').value = 'value'; showTab('stock'); drawTable(); }
  });
  const showTab = name => bootstrap.Tab.getOrCreateInstance(document.querySelector(`[data-bs-target="#tab-${name}"]`)).show();

  /* ---------- Charts ---------- */
  function drawCharts() {
    const inv = DB.inventory();
    const sorted = [...inv].sort((a, b) => pct(a) - pct(b));
    KK.chart('levelChart', {
      type: 'bar',
      data: { labels: sorted.map(i => i.name), datasets: [{ label: '% of max stock', data: sorted.map(pct), backgroundColor: sorted.map(i => isLow(i) ? '#b5534a' : pct(i) < 40 ? '#c08a33' : '#a3b18a'), borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const i = sorted[c.dataIndex]; return ` ${i.stock} ${i.unit} of ${i.max} (${c.raw}%)`; } } } },
        scales: { x: { max: 100, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 10 } } } },
        onClick: (e, els) => els.length && showItem(sorted[els[0].index].id)
      }
    });
    const g = DB.groupSum(inv, i => i.category, i => i.stock * i.unitCost);
    const cats = Object.keys(g);
    KK.chart('valueChart', {
      type: 'doughnut',
      data: { labels: cats, datasets: [{ data: Object.values(g), backgroundColor: KK.colors }] },
      options: { cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${KK.rm(c.raw)}` } } },
        onClick: (e, els) => { if (els.length) { $('iCat').value = cats[els[0].index]; showTab('stock'); drawTable(); } } }
    });
    const spend = DB.groupSum(DB.stockLog().filter(l => l.type === 'Restock'), l => DB.monthKey(l.date), l => l.cost || 0);
    const months = Object.keys(spend).sort();
    KK.chart('spendChart', {
      type: 'bar',
      data: { labels: months.map(DB.monthName), datasets: [{ label: 'Spending', data: months.map(m => spend[m]), backgroundColor: KK.colors[1], borderRadius: 6 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + KK.rm(c.raw) } } }, scales: { y: KK.rmAxis, x: KK.noGrid } }
    });
  }

  /* ---------- Stock table ---------- */
  function filteredStock() {
    const q = $('iSearch').value.trim().toLowerCase(), c = $('iCat').value, st = $('iStatus').value, sort = $('iSort').value;
    const sorts = {
      status: (a, b) => isLow(b) - isLow(a) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      value: (a, b) => b.stock * b.unitCost - a.stock * a.unitCost,
      level: (a, b) => pct(a) - pct(b)
    };
    return DB.inventory().filter(i => (!q || (i.name + i.supplier).toLowerCase().includes(q)) && (!c || i.category === c)
      && (!st || (st === 'low' ? isLow(i) : !isLow(i)))).sort(sorts[sort]);
  }
  const stockRow = i => `<tr class="clickable" data-id="${i.id}">
    <td><div class="fw-600">${KK.esc(i.name)}</div><div class="small kk-muted">${i.id} &middot; ${KK.esc(i.category)}</div></td>
    <td class="text-nowrap">${i.stock} ${i.unit}</td>
    <td class="d-none d-md-table-cell"><div class="stock-bar" title="${pct(i)}%"><span class="${levelCls(i)}" style="width:${pct(i)}%"></span></div></td>
    <td class="text-end d-none d-sm-table-cell text-nowrap">${i.reorder} ${i.unit}</td>
    <td class="text-end d-none d-lg-table-cell text-nowrap">${KK.rm(i.stock * i.unitCost)}</td>
    <td class="d-none d-xl-table-cell">${KK.esc(i.supplier)}</td>
    <td>${statusBadge(i)}</td>
    <td class="text-end"><div class="row-actions">
      <button class="btn btn-light btn-icon" data-act="restock" title="Restock" aria-label="Restock ${KK.esc(i.name)}"><i class="bi bi-plus-circle"></i></button>
      <button class="btn btn-light btn-icon d-none d-sm-inline-grid" data-act="adjust" title="Adjust / wastage" aria-label="Adjust ${KK.esc(i.name)}"><i class="bi bi-dash-circle"></i></button>
      <button class="btn btn-light btn-icon d-none d-md-inline-grid" data-act="edit" title="Edit" aria-label="Edit ${KK.esc(i.name)}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-light btn-icon d-none d-md-inline-grid text-danger" data-act="delete" title="Delete" aria-label="Delete ${KK.esc(i.name)}"><i class="bi bi-trash"></i></button>
    </div></td></tr>`;
  function drawTable() { stockPager.update(filteredStock()); }

  $('invBody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = tr.dataset.id;
    ({ restock: restockForm, adjust: adjustForm, edit: itemForm, delete: deleteItem }[act] || showItem)(id);
  });
  ['iSearch', 'iCat', 'iStatus', 'iSort'].forEach(id => $(id).addEventListener('input', drawTable));

  /* ---------- Item details popup ---------- */
  function showItem(id) {
    const i = DB.inventory().find(x => x.id === id); if (!i) return;
    const sup = DB.supplierByName(i.supplier);
    const hist = DB.stockLog().filter(l => l.item === id).slice(0, 8);
    const el = KK.modal({
      title: `${KK.esc(i.name)} ${statusBadge(i)}`,
      body: `<div class="detail-grid cols-3 mb-3">
          <div><div class="dl">Item code</div><div class="dv">${i.id}</div></div>
          <div><div class="dl">Category</div><div class="dv">${KK.esc(i.category)}</div></div>
          <div><div class="dl">Unit cost</div><div class="dv">${KK.rm(i.unitCost)} / ${i.unit}</div></div>
          <div><div class="dl">In stock</div><div class="dv ${isLow(i) ? 'text-danger' : ''}">${i.stock} ${i.unit}</div></div>
          <div><div class="dl">Reorder at</div><div class="dv">${i.reorder} ${i.unit}</div></div>
          <div><div class="dl">Maximum</div><div class="dv">${i.max} ${i.unit}</div></div>
          <div><div class="dl">Stock value</div><div class="dv">${KK.rm(i.stock * i.unitCost)}</div></div>
          <div><div class="dl">Last restock</div><div class="dv">${KK.date(i.lastRestock)}</div></div>
          <div><div class="dl">Supplier</div><div class="dv">${KK.esc(i.supplier)}${sup ? `<div class="small kk-muted fw-normal">${sup.contact} &middot; ${sup.phone}</div>` : ''}</div></div></div>
        <div class="d-flex justify-content-between small mb-1"><span>Stock level</span><span>${pct(i)}%</span></div>
        <div class="stock-bar mb-4" style="height:10px"><span class="${levelCls(i)}" style="width:${pct(i)}%"></span></div>
        <div class="fw-600 mb-2">Recent movements</div>
        ${hist.length ? `<div class="table-responsive"><table class="table kk-table table-sm"><thead><tr><th>Date</th><th>Type</th><th class="text-end">Qty</th><th class="d-none d-sm-table-cell">Note</th></tr></thead><tbody>
          ${hist.map(l => `<tr><td>${KK.date(l.date)}</td><td>${typeBadge(l.type)}</td><td class="text-end ${l.qty < 0 ? 'text-danger' : ''}">${l.qty > 0 ? '+' : ''}${l.qty || '-'}</td><td class="d-none d-sm-table-cell small">${KK.esc(l.note)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="kk-muted small">No movements yet.</p>'}`,
      footer: `<button class="btn btn-light text-danger me-auto" data-a="delete"><i class="bi bi-trash me-1"></i>Delete</button>
        <button class="btn btn-light" data-a="edit"><i class="bi bi-pencil me-1"></i>Edit</button>
        <button class="btn btn-light" data-a="adjust"><i class="bi bi-dash-circle me-1"></i>Adjust</button>
        <button class="btn btn-primary" data-a="restock"><i class="bi bi-plus-circle me-1"></i>Restock</button>`
    });
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      el.addEventListener('hidden.bs.modal', () => ({ restock: restockForm, adjust: adjustForm, edit: itemForm, delete: deleteItem })[b.dataset.a](id), { once: true });
      el._modal.hide();
    }));
  }

  /* ---------- Restock ---------- */
  function restockForm(id) {
    const i = DB.inventory().find(x => x.id === id);
    const room = +(i.max - i.stock).toFixed(2);
    const el = KK.modal({
      title: `Restock: ${KK.esc(i.name)}`, size: 'md',
      body: `<form id="rsForm" novalidate>
        <p class="small kk-muted">Now ${i.stock} ${i.unit} &middot; maximum ${i.max} ${i.unit} &middot; space for ${room} ${i.unit}</p>
        <div class="row g-3">
          <div class="col-sm-6"><label class="form-label" for="rsQty">Quantity (${i.unit})</label>
            <input type="number" class="form-control" id="rsQty" min="${step(i.unit)}" step="${step(i.unit)}" max="${room}" value="${Math.max(step(i.unit), room)}" required>
            <div class="invalid-feedback">Between ${step(i.unit)} and ${room} ${i.unit}.</div></div>
          <div class="col-sm-6"><label class="form-label">Cost</label><div class="form-control bg-transparent fw-600" id="rsCost"></div></div>
          <div class="col-12"><label class="form-label" for="rsNote">Note</label><input class="form-control" id="rsNote" value="Delivery from ${KK.esc(i.supplier)}" maxlength="80"></div>
        </div></form>`,
      footer: `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="rsSave" ${room <= 0 ? 'disabled' : ''}>Restock</button>`
    });
    const qty = el.querySelector('#rsQty');
    const cost = () => el.querySelector('#rsCost').textContent = KK.rm((+qty.value || 0) * i.unitCost);
    cost(); qty.addEventListener('input', cost);
    el.querySelector('#rsSave').addEventListener('click', () => {
      const f = el.querySelector('#rsForm'); f.classList.add('was-validated');
      if (!f.checkValidity()) return;
      DB.restock(id, +qty.value, el.querySelector('#rsNote').value.trim() || 'Manual restock');
      el._modal.hide(); KK.toast(`${KK.esc(i.name)} +${qty.value} ${i.unit}`); refresh();
    });
  }

  /* ---------- Adjust (wastage / correction) ---------- */
  function adjustForm(id) {
    const i = DB.inventory().find(x => x.id === id);
    const el = KK.modal({
      title: `Adjust stock: ${KK.esc(i.name)}`, size: 'md',
      body: `<form id="adForm" novalidate><div class="row g-3">
          <div class="col-12"><label class="form-label">Change</label><div class="d-flex gap-3">
            <div class="form-check"><input class="form-check-input" type="radio" name="adDir" id="adMinus" value="-1" checked><label class="form-check-label" for="adMinus">Remove stock</label></div>
            <div class="form-check"><input class="form-check-input" type="radio" name="adDir" id="adPlus" value="1"><label class="form-check-label" for="adPlus">Add stock (count correction)</label></div></div></div>
          <div class="col-sm-6"><label class="form-label" for="adQty">Quantity (${i.unit})</label>
            <input type="number" class="form-control" id="adQty" min="${step(i.unit)}" step="${step(i.unit)}" max="${i.stock}" required><div class="invalid-feedback" id="adQtyMsg">Enter a valid quantity.</div></div>
          <div class="col-sm-6"><label class="form-label" for="adReason">Reason</label><select class="form-select" id="adReason" required>
            <option value="">Choose...</option><option>Expired</option><option>Spoiled</option><option>Damaged packaging</option><option>Spilled</option><option>Stock count correction</option><option>Other</option></select>
            <div class="invalid-feedback">Choose a reason.</div></div>
          <div class="col-12"><label class="form-label" for="adNote">Extra note (optional)</label><input class="form-control" id="adNote" maxlength="80"></div>
          <div class="col-12 small kk-muted">Now in stock: <strong>${i.stock} ${i.unit}</strong> &rarr; after: <strong id="adAfter">${i.stock}</strong> ${i.unit}</div>
        </div></form>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="adSave">Save adjustment</button>'
    });
    const q = el.querySelector('#adQty');
    const dir = () => +el.querySelector('input[name="adDir"]:checked').value;
    const upd = () => {
      q.max = dir() < 0 ? i.stock : i.max * 2;
      el.querySelector('#adAfter').textContent = Math.max(0, +(i.stock + dir() * (+q.value || 0)).toFixed(2));
    };
    el.querySelectorAll('input[name="adDir"], #adQty').forEach(x => x.addEventListener('input', upd));
    el.querySelector('#adSave').addEventListener('click', () => {
      const f = el.querySelector('#adForm'); f.classList.add('was-validated');
      if (!f.checkValidity()) return;
      const reason = el.querySelector('#adReason').value + (el.querySelector('#adNote').value.trim() ? ' - ' + el.querySelector('#adNote').value.trim() : '');
      DB.adjustStock(id, dir() * +q.value, reason);
      el._modal.hide(); KK.toast(`${KK.esc(i.name)} adjusted (${dir() < 0 ? '-' : '+'}${q.value} ${i.unit})`); refresh();
    });
  }

  /* ---------- Add / edit item ---------- */
  function itemForm(id) {
    const i = id ? DB.inventory().find(x => x.id === id) : null;
    const cats = [...new Set(DB.inventory().map(x => x.category))].sort();
    const sups = DB.suppliers().map(s => s.name);
    const v = (k, d = '') => i ? KK.esc(i[k]) : d;
    const el = KK.modal({
      title: i ? `Edit ${KK.esc(i.name)}` : 'Add stock item',
      body: `<form id="itForm" novalidate><div class="row g-3">
          <div class="col-md-8"><label class="form-label" for="itName">Item name</label><input class="form-control" id="itName" value="${v('name')}" required minlength="3" maxlength="40"><div class="invalid-feedback" id="itNameMsg">3-40 characters.</div></div>
          <div class="col-md-4"><label class="form-label" for="itCat">Category</label><input class="form-control" id="itCat" list="itCats" value="${v('category')}" required><datalist id="itCats">${cats.map(c => `<option value="${c}">`).join('')}</datalist><div class="invalid-feedback">Choose or type a category.</div></div>
          <div class="col-6 col-md-3"><label class="form-label" for="itUnit">Unit</label><select class="form-select" id="itUnit" required>${['kg', 'L', 'pcs', 'can', 'tray', 'box', 'pack', 'bottle', 'tub', 'loaf'].map(u => `<option ${i && i.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
          <div class="col-6 col-md-3"><label class="form-label" for="itCost">Unit cost (RM)</label><input type="number" class="form-control" id="itCost" min="0.01" step="0.01" value="${v('unitCost')}" required><div class="invalid-feedback">More than 0.</div></div>
          <div class="col-6 col-md-3"><label class="form-label" for="itReorder">Reorder level</label><input type="number" class="form-control" id="itReorder" min="0" step="0.1" value="${v('reorder')}" required><div class="invalid-feedback">Must be lower than maximum.</div></div>
          <div class="col-6 col-md-3"><label class="form-label" for="itMax">Maximum stock</label><input type="number" class="form-control" id="itMax" min="1" step="0.1" value="${v('max')}" required><div class="invalid-feedback">At least 1.</div></div>
          ${i ? '' : `<div class="col-6 col-md-4"><label class="form-label" for="itStock">Opening stock</label><input type="number" class="form-control" id="itStock" min="0" step="0.1" value="0" required><div class="invalid-feedback">0 up to the maximum.</div></div>`}
          <div class="${i ? 'col-12' : 'col-6 col-md-8'}"><label class="form-label" for="itSup">Supplier</label><select class="form-select" id="itSup" required><option value="">Choose...</option>${sups.map(s => `<option ${i && i.supplier === s ? 'selected' : ''}>${KK.esc(s)}</option>`).join('')}</select><div class="invalid-feedback">Choose a supplier.</div></div>
        </div></form>`,
      footer: `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="itSave">${i ? 'Save changes' : 'Add item'}</button>`
    });
    el.querySelector('#itSave').addEventListener('click', () => {
      const f = el.querySelector('#itForm');
      const g = x => el.querySelector('#' + x);
      const name = g('itName').value.trim();
      const dup = DB.inventory().some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== id);
      g('itName').setCustomValidity(dup ? 'dup' : ''); g('itNameMsg').textContent = dup ? 'An item with this name already exists.' : '3-40 characters.';
      g('itReorder').setCustomValidity(+g('itReorder').value < +g('itMax').value ? '' : 'bad');
      if (g('itStock')) g('itStock').setCustomValidity(+g('itStock').value <= +g('itMax').value ? '' : 'bad');
      f.classList.add('was-validated');
      if (!f.checkValidity()) return;
      const data = { name, category: g('itCat').value.trim(), unit: g('itUnit').value, unitCost: +(+g('itCost').value).toFixed(2),
        reorder: +g('itReorder').value, max: +g('itMax').value, supplier: g('itSup').value };
      if (i) { DB.updateStockItem(id, data); KK.toast(`${KK.esc(name)} updated`); }
      else { DB.addStockItem({ ...data, stock: +g('itStock').value }); KK.toast(`${KK.esc(name)} added`); }
      el._modal.hide(); refresh();
    });
  }

  /* ---------- Delete item ---------- */
  function deleteItem(id) {
    const i = DB.inventory().find(x => x.id === id);
    const inPO = DB.purchaseOrders().some(p => p.status === 'Pending' && p.lines.some(([x]) => x === id));
    if (inPO) {
      KK.modal({ title: 'Cannot delete', size: 'sm', body: `<p class="mb-0"><strong>${KK.esc(i.name)}</strong> is in a pending purchase order. Receive or cancel that order first.</p>`, footer: '<button class="btn btn-primary" data-bs-dismiss="modal">OK</button>' });
      return;
    }
    const el = KK.modal({
      title: 'Delete stock item?', size: 'sm',
      body: `<p class="mb-0">Delete <strong>${KK.esc(i.name)}</strong> (${i.stock} ${i.unit}, ${KK.rm(i.stock * i.unitCost)})? This cannot be undone.</p>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-danger" id="delYes"><i class="bi bi-trash me-1"></i>Delete</button>'
    });
    el.querySelector('#delYes').addEventListener('click', () => { DB.deleteStockItem(id); el._modal.hide(); KK.toast(`${KK.esc(i.name)} deleted`); refresh(); });
  }

  /* ---------- Purchase orders ---------- */
  const poBadge = s => KK.badge(s, { Pending: 'pending', Received: 'completed', Cancelled: 'cancelled' }[s]);
  function drawPOs() {
    const all = DB.purchaseOrders();
    const pend = all.filter(p => p.status === 'Pending').length;
    $('poCount').textContent = pend || '';
    $('poPills').innerHTML = ['All', 'Pending', 'Received', 'Cancelled'].map(s => `<button class="pill ${s === poFilter ? 'active' : ''}" data-s="${s}">${s} <span class="kk-muted">${s === 'All' ? all.length : all.filter(p => p.status === s).length}</span></button>`).join('');
    const list = all.filter(p => poFilter === 'All' || p.status === poFilter);
    $('poBody').innerHTML = list.length ? list.map(p => `<tr class="clickable" data-po="${p.id}">
      <td class="fw-600 text-nowrap">${p.id}</td><td class="text-nowrap">${KK.date(p.date)}</td><td>${KK.esc(p.supplier)}</td>
      <td class="text-center d-none d-sm-table-cell">${p.lines.length}</td><td class="text-end text-nowrap">${KK.rm(DB.poTotal(p))}</td>
      <td class="d-none d-md-table-cell text-nowrap">${p.status === 'Received' ? '<span class="kk-muted">-</span>' : KK.date(p.expected)}</td><td>${poBadge(p.status)}</td>
      <td class="text-end">${p.status === 'Pending' ? `<div class="row-actions"><button class="btn btn-light btn-icon" data-pa="receive" title="Mark received" aria-label="Mark ${p.id} received"><i class="bi bi-check2-circle"></i></button>
        <button class="btn btn-light btn-icon text-danger" data-pa="cancel" title="Cancel order" aria-label="Cancel ${p.id}"><i class="bi bi-x-circle"></i></button></div>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="8"><div class="empty-state"><img src="assets/img/empty.svg" alt=""><div>No purchase orders.</div></div></td></tr>`;
  }
  $('poPills').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { poFilter = b.dataset.s; drawPOs(); } });
  $('poBody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-po]'); if (!tr) return;
    const a = e.target.closest('[data-pa]')?.dataset.pa;
    if (a === 'receive') receivePO(tr.dataset.po); else if (a === 'cancel') cancelPO(tr.dataset.po); else showPO(tr.dataset.po);
  });
  function showPO(id) {
    const p = DB.purchaseOrders().find(x => x.id === id);
    const inv = DB.inventory(), sup = DB.supplierByName(p.supplier);
    const el = KK.modal({
      title: `${p.id} ${poBadge(p.status)}`,
      body: `<div class="detail-grid cols-3 mb-3">
          <div><div class="dl">Supplier</div><div class="dv">${KK.esc(p.supplier)}</div></div>
          <div><div class="dl">Order date</div><div class="dv">${KK.date(p.date)}</div></div>
          <div><div class="dl">${p.status === 'Received' && p.received ? 'Received' : 'Expected'}</div><div class="dv">${KK.date(p.received || p.expected)}</div></div>
          ${sup ? `<div><div class="dl">Contact</div><div class="dv">${sup.contact}</div></div><div><div class="dl">Phone</div><div class="dv">${sup.phone}</div></div><div><div class="dl">Payment terms</div><div class="dv">${sup.terms}</div></div>` : ''}</div>
        <div class="receipt"><div class="table-responsive"><table class="table kk-table table-sm mb-2"><thead><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Unit cost</th><th class="text-end">Subtotal</th></tr></thead><tbody>
          ${p.lines.map(([iid, q, c]) => { const it = inv.find(x => x.id === iid); return `<tr><td>${it ? KK.esc(it.name) : iid}</td><td class="text-end">${q} ${it ? it.unit : ''}</td><td class="text-end">${KK.rm(c)}</td><td class="text-end fw-600">${KK.rm(q * c)}</td></tr>`; }).join('')}
          </tbody></table></div><hr class="my-2"><div class="d-flex justify-content-between fw-bold fs-5"><span>Total</span><span class="text-accent">${KK.rm(DB.poTotal(p))}</span></div></div>
        ${p.note ? `<p class="small kk-muted mt-3 mb-0">Note: ${KK.esc(p.note)}</p>` : ''}`,
      footer: p.status === 'Pending' ? `<button class="btn btn-light text-danger me-auto" data-x="cancel">Cancel order</button><button class="btn btn-primary" data-x="receive"><i class="bi bi-check2-circle me-1"></i>Mark as received</button>`
        : '<button class="btn btn-light" data-bs-dismiss="modal">Close</button>'
    });
    el.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
      el.addEventListener('hidden.bs.modal', () => (b.dataset.x === 'receive' ? receivePO : cancelPO)(id), { once: true });
      el._modal.hide();
    }));
  }
  function receivePO(id) {
    const p = DB.purchaseOrders().find(x => x.id === id);
    const el = KK.modal({ title: 'Mark as received?', size: 'sm', body: `<p class="mb-0">All items in <strong>${p.id}</strong> will be added to stock (${KK.rm(DB.poTotal(p))}).</p>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="rcYes">Received</button>' });
    el.querySelector('#rcYes').addEventListener('click', () => { DB.receivePO(id); el._modal.hide(); KK.toast(`${id} received - stock updated`); refresh(); });
  }
  function cancelPO(id) {
    const el = KK.modal({ title: 'Cancel purchase order?', size: 'sm', body: `<p class="mb-0">Cancel <strong>${id}</strong>? Stock will not change.</p>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Keep</button><button class="btn btn-danger" id="cnYes">Cancel order</button>' });
    el.querySelector('#cnYes').addEventListener('click', () => { DB.cancelPO(id); el._modal.hide(); KK.toast(`${id} cancelled`, 'info'); refresh(); });
  }

  /* New purchase order: choose a supplier, then quantities for each of its items */
  function newPO(supplier = '') {
    const sups = DB.suppliers();
    const el = KK.modal({
      title: 'New purchase order',
      body: `<div class="row g-3 mb-2">
          <div class="col-md-6"><label class="form-label" for="poSup">Supplier</label><select class="form-select" id="poSup"><option value="">Choose...</option>
            ${sups.map(s => `<option ${s.name === supplier ? 'selected' : ''}>${KK.esc(s.name)}</option>`).join('')}</select></div>
          <div class="col-md-6"><label class="form-label" for="poNote">Note (optional)</label><input class="form-control" id="poNote" maxlength="80"></div></div>
        <div id="poLines" class="mt-2"><p class="kk-muted small">Choose a supplier to see its items.</p></div>
        <div class="text-danger small d-none" id="poErr">Enter a quantity for at least one item.</div>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="poSave"><i class="bi bi-cart-check me-1"></i>Create order</button>'
    });
    const box = el.querySelector('#poLines');
    function lines() {
      const s = el.querySelector('#poSup').value;
      const items = DB.inventory().filter(i => i.supplier === s);
      const sup = DB.supplierByName(s);
      box.innerHTML = !s ? '<p class="kk-muted small">Choose a supplier to see its items.</p>' : !items.length ? '<p class="kk-muted small">No stock items from this supplier.</p>' :
        `${sup ? `<p class="small kk-muted">Delivery in about ${sup.leadDays} day(s) &middot; ${sup.terms}. Low items are pre-filled up to their maximum.</p>` : ''}
        <div class="table-responsive"><table class="table kk-table table-sm"><thead><tr><th>Item</th><th class="text-end">In stock</th><th style="width:120px">Order qty</th><th class="text-end">Subtotal</th></tr></thead><tbody>
        ${items.map(i => `<tr data-i="${i.id}" data-c="${i.unitCost}"><td>${KK.esc(i.name)} ${isLow(i) ? KK.badge('Low', 'low') : ''}</td><td class="text-end text-nowrap">${i.stock} ${i.unit}</td>
          <td><input type="number" class="form-control form-control-sm" min="0" step="${step(i.unit)}" value="${isLow(i) ? +(i.max - i.stock).toFixed(1) : 0}" aria-label="Quantity for ${KK.esc(i.name)}"></td><td class="text-end sub"></td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="3" class="text-end fw-600">Total</td><td class="text-end fw-bold text-accent" id="poTotal"></td></tr></tfoot></table></div>`;
      calc();
    }
    function calc() {
      let t = 0;
      box.querySelectorAll('tr[data-i]').forEach(r => { const v = (+r.querySelector('input').value || 0) * +r.dataset.c; t += v; r.querySelector('.sub').textContent = KK.rm(v); });
      const tt = box.querySelector('#poTotal'); if (tt) tt.textContent = KK.rm(t);
    }
    el.querySelector('#poSup').addEventListener('change', lines);
    box.addEventListener('input', calc);
    lines();
    el.querySelector('#poSave').addEventListener('click', () => {
      const s = el.querySelector('#poSup').value;
      const ls = [...box.querySelectorAll('tr[data-i]')].map(r => [r.dataset.i, +(+r.querySelector('input').value).toFixed(2), +r.dataset.c]).filter(([, q]) => q > 0);
      el.querySelector('#poErr').classList.toggle('d-none', !!(s && ls.length));
      if (!s || !ls.length) return;
      const po = DB.createPO(s, ls, el.querySelector('#poNote').value.trim());
      el._modal.hide(); KK.toast(`${po.id} created for ${KK.esc(s)}`); poFilter = 'Pending'; refresh(); showTab('po');
    });
  }
  $('btnNewPO').addEventListener('click', () => newPO());

  /* Auto-create one PO per supplier for every low item not already on order */
  $('btnAutoPO').addEventListener('click', () => {
    const onOrder = new Set(DB.purchaseOrders().filter(p => p.status === 'Pending').flatMap(p => p.lines.map(([i]) => i)));
    const low = DB.inventory().filter(i => isLow(i) && !onOrder.has(i.id));
    if (!low.length) { KK.toast('All low items are already on order', 'info'); return; }
    const bySup = {};
    low.forEach(i => (bySup[i.supplier] = bySup[i.supplier] || []).push(i));
    const el = KK.modal({
      title: 'Auto-create purchase orders',
      body: `<p class="small kk-muted">${low.length} low item(s) will be ordered up to their maximum, one order per supplier:</p>
        ${Object.entries(bySup).map(([s, items]) => `<div class="receipt mb-2"><div class="fw-600 mb-1">${KK.esc(s)}</div>
          ${items.map(i => `<div class="d-flex justify-content-between small"><span>${KK.esc(i.name)}</span><span>${+(i.max - i.stock).toFixed(1)} ${i.unit} &middot; ${KK.rm((i.max - i.stock) * i.unitCost)}</span></div>`).join('')}</div>`).join('')}`,
      footer: `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="autoYes">Create ${Object.keys(bySup).length} order(s)</button>`
    });
    el.querySelector('#autoYes').addEventListener('click', () => {
      Object.entries(bySup).forEach(([s, items]) => DB.createPO(s, items.map(i => [i.id, +(i.max - i.stock).toFixed(1), i.unitCost]), 'Auto-created for low stock'));
      el._modal.hide(); KK.toast(`${Object.keys(bySup).length} purchase order(s) created`); poFilter = 'Pending'; refresh();
    });
  });

  /* ---------- Suppliers ---------- */
  function drawSuppliers() {
    const inv = DB.inventory(), pos = DB.purchaseOrders();
    $('supGrid').innerHTML = DB.suppliers().map(s => {
      const items = inv.filter(i => i.supplier === s.name);
      const pend = pos.filter(p => p.supplier === s.name && p.status === 'Pending').length;
      const spent = pos.filter(p => p.supplier === s.name && p.status === 'Received').reduce((t, p) => t + DB.poTotal(p), 0);
      return `<div class="col-sm-6 col-xl-4"><div class="kk-card supplier-card">
        <div class="d-flex justify-content-between align-items-start mb-2"><div><div class="fw-600">${KK.esc(s.name)}</div>
          <div class="small kk-muted"><i class="bi bi-star-fill text-warning"></i> ${s.rating} &middot; ${s.leadDays} day delivery</div></div>
          ${pend ? KK.badge(pend + ' pending', 'pending') : ''}</div>
        <div class="meta mb-2"><span><i class="bi bi-person me-1"></i>${s.contact}</span><span><i class="bi bi-telephone me-1"></i>${s.phone}</span>
          <span class="text-break"><i class="bi bi-envelope me-1"></i>${s.email}</span><span><i class="bi bi-credit-card me-1"></i>${s.terms}</span></div>
        <div class="small mb-2"><span class="kk-muted">Supplies:</span> ${items.map(i => KK.esc(i.name)).join(', ') || '-'}</div>
        <div class="d-flex justify-content-between align-items-center"><span class="small kk-muted">Received orders: ${KK.rm0(spent)}</span>
          <button class="btn btn-sm btn-outline-primary" data-sup="${KK.esc(s.name)}" ${items.length ? '' : 'disabled'}><i class="bi bi-cart-plus me-1"></i>Order</button></div>
      </div></div>`;
    }).join('');
  }
  $('supGrid').addEventListener('click', e => { const b = e.target.closest('[data-sup]'); if (b) newPO(b.dataset.sup); });

  /* ---------- Stock history ---------- */
  const typeBadge = t => KK.badge(t, { Restock: 'completed', Adjustment: 'pending', 'New item': 'preparing', Edited: 'neutral', Deleted: 'cancelled' }[t] || 'neutral');
  function filteredLog() {
    const q = $('lSearch').value.trim().toLowerCase(), t = $('lType').value;
    const inv = DB.inventory();
    return DB.stockLog().map(l => ({ ...l, name: l.itemName || inv.find(i => i.id === l.item)?.name || l.item }))
      .filter(l => (!t || l.type === t) && (!q || (l.name + ' ' + l.note + ' ' + l.by).toLowerCase().includes(q)));
  }
  const logRow = l => `<tr><td class="text-nowrap">${KK.date(l.date)}</td><td>${KK.esc(l.name)}</td><td>${typeBadge(l.type)}</td>
    <td class="text-end ${l.qty < 0 ? 'text-danger' : ''}">${l.qty > 0 ? '+' : ''}${l.qty || '-'}</td><td class="text-end d-none d-sm-table-cell">${l.cost ? KK.rm(l.cost) : '-'}</td>
    <td class="d-none d-md-table-cell small">${KK.esc(l.note)}</td><td class="d-none d-lg-table-cell small">${KK.esc(l.by)}</td></tr>`;
  ['lSearch', 'lType'].forEach(id => $(id).addEventListener('input', () => logPager.update(filteredLog())));
  $('btnLogExport').addEventListener('click', () => {
    KK.csv('kopikita-stock-history.csv', [['Date', 'Item', 'Type', 'Qty', 'Cost (RM)', 'Note', 'By']].concat(filteredLog().map(l => [l.date, l.name, l.type, l.qty, (l.cost || 0).toFixed(2), l.note, l.by])));
    KK.toast('Stock history exported');
  });

  /* ---------- Export stock list ---------- */
  $('btnExport').addEventListener('click', () => {
    KK.csv('kopikita-inventory.csv', [['Code', 'Item', 'Category', 'Stock', 'Unit', 'Reorder', 'Max', 'Unit cost (RM)', 'Value (RM)', 'Supplier', 'Status']]
      .concat(filteredStock().map(i => [i.id, i.name, i.category, i.stock, i.unit, i.reorder, i.max, i.unitCost.toFixed(2), (i.stock * i.unitCost).toFixed(2), i.supplier, isLow(i) ? 'Low' : 'In stock'])));
    KK.toast('Inventory exported');
  });
  $('btnAddItem').addEventListener('click', () => itemForm(null));

  /* ---------- Start ---------- */
  function fillCategories() {
    const cur = $('iCat').value;
    $('iCat').innerHTML = '<option value="">All categories</option>' + [...new Set(DB.inventory().map(i => i.category))].sort().map(c => `<option>${KK.esc(c)}</option>`).join('');
    $('iCat').value = cur;
  }
  function refresh() {
    fillCategories(); drawKpis(); drawCharts(); drawTable(); drawPOs(); drawSuppliers();
    logPager.update(filteredLog());
  }
  fillCategories();
  stockPager = KK.paginate({ rows: filteredStock(), tbody: $('invBody'), pager: $('invPager'), info: $('invInfo'), pageSize: 10, render: stockRow, empty: 'No stock items found.' });
  logPager = KK.paginate({ rows: filteredLog(), tbody: $('logBody'), pager: $('logPager'), info: $('logInfo'), pageSize: 12, render: logRow, empty: 'No stock movements found.' });
  drawKpis(); drawCharts(); drawPOs(); drawSuppliers();
})();
