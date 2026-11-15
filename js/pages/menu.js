/* ==========================================================
   Kopi Kita - js/pages/menu.js
   Purpose: Menu grid with category filter, search and sort,
            2 charts, item popup and "Add item" form popup.
   ========================================================== */
(function () {
  if (!KK.session()) return;
  const $ = id => document.getElementById(id);
  const CATS = ['Coffee', 'Non-Coffee', 'Tea', 'Pastry', 'Food', 'Dessert'];
  let category = 'All';

  function stats() {
    const sales = DB.itemSales();
    return { sales, sold: id => (sales.find(s => s.item.id === id) || { qty: 0 }).qty };
  }

  /* ---------- Summary cards ---------- */
  function drawKpis() {
    const menu = DB.menu(), { sales } = stats();
    const cards = [
      ['Menu items', menu.length, 'bi-cup-hot', `${menu.filter(m => !m.available).length} sold out`],
      ['Categories', CATS.length, 'bi-tags', 'Drinks & food'],
      ['Average price', KK.rm(menu.reduce((s, m) => s + m.price, 0) / menu.length), 'bi-tag', 'Across all items'],
      ['Best seller', sales[0].item.name, 'bi-trophy', `${sales[0].qty} sold`]
    ];
    $('kpiRow').innerHTML = cards.map(([l, v, i, f]) => `<div class="col-6 col-lg-3"><div class="kk-card kpi" ${l === 'Best seller' ? `data-id="${sales[0].item.id}"` : ''}>
      <div class="d-flex justify-content-between"><div class="kpi-label">${l}</div><div class="kpi-icon"><i class="bi ${i}"></i></div></div>
      <div class="kpi-value text-truncate">${v}</div><div class="kpi-foot">${f}</div></div></div>`).join('');
    $('kpiRow').querySelector('[data-id]').addEventListener('click', e => KK.showMenuItem(e.currentTarget.dataset.id, refresh));
  }

  /* ---------- Charts ---------- */
  function drawCharts() {
    const { sales } = stats();
    KK.chart('catChart', {
      type: 'bar',
      data: { labels: CATS, datasets: [{ label: 'Units sold', data: CATS.map(c => sales.filter(s => s.item.category === c).reduce((t, s) => t + s.qty, 0)), backgroundColor: KK.colors, borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: KK.noGrid },
        onClick: (e, els) => { if (els.length) { category = CATS[els[0].index]; drawPills(); drawGrid(); } } }
    });
    const top = [...sales].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    KK.chart('topChart', {
      type: 'bar',
      data: { labels: top.map(s => s.item.name), datasets: [{ label: 'Revenue', data: top.map(s => s.revenue), backgroundColor: KK.colors[1], borderRadius: 6 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + KK.rm(c.raw) } } },
        scales: { x: KK.rmAxis, y: KK.noGrid }, onClick: (e, els) => els.length && KK.showMenuItem(top[els[0].index].item.id, refresh) }
    });
  }

  /* ---------- Filter pills ---------- */
  function drawPills() {
    const menu = DB.menu();
    $('catPills').innerHTML = ['All', ...CATS].map(c => `<button class="pill ${c === category ? 'active' : ''}" data-c="${c}" aria-pressed="${c === category}">
      ${c} <span class="kk-muted">${c === 'All' ? menu.length : menu.filter(m => m.category === c).length}</span></button>`).join('');
  }
  $('catPills').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { category = b.dataset.c; drawPills(); drawGrid(); } });

  /* ---------- Menu grid ---------- */
  function drawGrid() {
    const { sold } = stats();
    const q = $('mSearch').value.trim().toLowerCase();
    let list = DB.menu().filter(m => (category === 'All' || m.category === category) && (!q || (m.name + ' ' + m.desc).toLowerCase().includes(q)));
    const sorts = {
      popular: (a, b) => sold(b.id) - sold(a.id), priceAsc: (a, b) => a.price - b.price, priceDesc: (a, b) => b.price - a.price,
      rating: (a, b) => (b.rating || 0) - (a.rating || 0), name: (a, b) => a.name.localeCompare(b.name)
    };
    list.sort(sorts[$('mSort').value]);
    $('menuGrid').innerHTML = list.length ? list.map(m => `
      <div class="col-6 col-md-4 col-xl-3">
        <article class="kk-card menu-card ${m.available ? '' : 'unavailable'}" role="button" tabindex="0" data-id="${m.id}" aria-label="${KK.esc(m.name)} details">
          <div class="menu-img ${m.img ? 'photo' : ''}"><img src="${KK.menuImg(m)}" alt="${KK.esc(m.img ? m.name : m.category + ' illustration')}" loading="lazy"></div>
          <div class="p-3">
            <div class="d-flex justify-content-between align-items-start gap-1">
              <h3 class="h6 mb-1">${KK.esc(m.name)}</h3>${m.available ? '' : KK.badge('Sold out', 'cancelled')}</div>
            <div class="small kk-muted mb-2">${m.category} &middot; <i class="bi bi-star-fill text-warning"></i> ${m.rating || '-'}</div>
            <div class="d-flex justify-content-between align-items-center"><span class="price">${KK.rm(m.price)}</span><span class="small kk-muted">${sold(m.id)} sold</span></div>
          </div>
        </article></div>`).join('')
      : `<div class="col-12"><div class="kk-card empty-state"><img src="assets/img/empty.svg" alt=""><div>No menu items found.</div></div></div>`;
  }
  $('menuGrid').addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) KK.showMenuItem(c.dataset.id, refresh); });
  $('menuGrid').addEventListener('keydown', e => { const c = e.target.closest('[data-id]'); if (c && e.key === 'Enter') KK.showMenuItem(c.dataset.id, refresh); });
  $('mSearch').addEventListener('input', drawGrid);
  $('mSort').addEventListener('change', drawGrid);

  /* ---------- Add item popup ---------- */
  $('btnAdd').addEventListener('click', () => {
    const el = KK.modal({
      title: 'Add menu item',
      body: `<form id="aiForm" novalidate><div class="row g-3">
        <div class="col-md-8"><label class="form-label" for="aiName">Item name</label><input class="form-control" id="aiName" required minlength="3" maxlength="40"><div class="invalid-feedback">3-40 characters.</div></div>
        <div class="col-md-4"><label class="form-label" for="aiCat">Category</label><select class="form-select" id="aiCat" required><option value="">Choose...</option>${CATS.map(c => `<option>${c}</option>`).join('')}</select><div class="invalid-feedback">Choose a category.</div></div>
        <div class="col-4"><label class="form-label" for="aiPrice">Price (RM)</label><input type="number" step="0.10" min="1" max="100" class="form-control" id="aiPrice" required><div class="invalid-feedback">RM1 - RM100.</div></div>
        <div class="col-4"><label class="form-label" for="aiCost">Cost (RM)</label><input type="number" step="0.10" min="0.1" class="form-control" id="aiCost" required><div class="invalid-feedback">Must be lower than price.</div></div>
        <div class="col-4"><label class="form-label" for="aiKcal">Calories</label><input type="number" min="0" max="2000" class="form-control" id="aiKcal" value="200"></div>
        <div class="col-12"><label class="form-label" for="aiDesc">Description</label><textarea class="form-control" id="aiDesc" rows="2" maxlength="120" required></textarea><div class="invalid-feedback">Please write a short description.</div></div>
        <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="aiAvail" checked><label class="form-check-label" for="aiAvail">Available for sale</label></div></div>
      </div></form>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="aiSave">Save item</button>'
    });
    el.querySelector('#aiSave').addEventListener('click', () => {
      const form = el.querySelector('#aiForm');
      const price = el.querySelector('#aiPrice'), cost = el.querySelector('#aiCost');
      cost.setCustomValidity(+cost.value > 0 && +cost.value < +price.value ? '' : 'invalid');
      form.classList.add('was-validated');
      if (!form.checkValidity()) return;
      const item = DB.addMenuItem({
        name: el.querySelector('#aiName').value.trim(), category: el.querySelector('#aiCat').value,
        price: +(+price.value).toFixed(2), cost: +(+cost.value).toFixed(2), kcal: +el.querySelector('#aiKcal').value || 0,
        desc: el.querySelector('#aiDesc').value.trim(), tags: ['new'], rating: null, available: el.querySelector('#aiAvail').checked
      });
      el._modal.hide();
      KK.toast(`${KK.esc(item.name)} added to the menu`);
      category = 'All'; drawKpis(); drawPills(); drawGrid();
    });
  });

  /* Redraw everything after an item is deleted */
  function refresh() { drawKpis(); drawCharts(); drawPills(); drawGrid(); }

  drawKpis(); drawCharts(); drawPills(); drawGrid();
})();
