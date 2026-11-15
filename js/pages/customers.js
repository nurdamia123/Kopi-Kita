/* ==========================================================
   Kopi Kita - js/pages/customers.js
   Purpose: Loyalty member list, 4 charts, search/filter/sort
            and the full customer profile popup.
   ========================================================== */
(function () {
  if (!KK.session()) return;
  const $ = id => document.getElementById(id);
  const list = CUSTOMERS.map(c => ({ c, ...DB.customerStats(c) }));

  /* ---------- Summary cards ---------- */
  const thisMonth = DB.monthKey(APP_TODAY);
  const prevMonth = DB.months()[DB.months().length - 2];
  const totalSpend = list.reduce((s, x) => s + x.spend, 0);
  const cards = [
    ['Members', list.length, 'bi-people', `${list.filter(x => DB.monthKey(x.c.joined) === prevMonth).length} joined last month`],
    ['Gold members', list.filter(x => x.tier === 'Gold').length, 'bi-award', 'Spent RM400 or more'],
    ['Avg spend / member', KK.rm(totalSpend / list.length), 'bi-wallet2', 'Since joining'],
    ['Points issued', KK.num(list.reduce((s, x) => s + x.points, 0)), 'bi-star', '1 point = RM1']
  ];
  $('kpiRow').innerHTML = cards.map(([l, v, i, f]) => `<div class="col-6 col-lg-3"><div class="kk-card kpi" data-k="${l}">
    <div class="d-flex justify-content-between"><div class="kpi-label">${l}</div><div class="kpi-icon"><i class="bi ${i}"></i></div></div>
    <div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div></div></div>`).join('');
  $('kpiRow').addEventListener('click', e => {
    const k = e.target.closest('[data-k]'); if (!k) return;
    if (k.dataset.k === 'Gold members') { $('cTier').value = 'Gold'; draw(); return; }
    /* other cards -> popup comparing tiers */
    const tiers = ['Gold', 'Silver', 'Bronze'];
    KK.modal({
      title: 'Membership summary',
      body: `<div class="table-responsive"><table class="table kk-table"><thead><tr><th>Tier</th><th class="text-end">Members</th><th class="text-end">Total spend</th><th class="text-end">Avg visits</th><th class="text-end">Points</th></tr></thead><tbody>
        ${tiers.map(t => { const l = list.filter(x => x.tier === t); return `<tr><td>${KK.badge(t)}</td><td class="text-end">${l.length}</td><td class="text-end">${KK.rm0(l.reduce((s, x) => s + x.spend, 0))}</td><td class="text-end">${l.length ? (l.reduce((s, x) => s + x.visits, 0) / l.length).toFixed(1) : 0}</td><td class="text-end">${KK.num(l.reduce((s, x) => s + x.points, 0))}</td></tr>`; }).join('')}
        </tbody></table></div><p class="small kk-muted mb-0">Tier rules: Bronze &lt; RM150, Silver RM150 - RM399, Gold RM400 and above.</p>`
    });
  });

  /* ---------- Charts ---------- */
  const tiers = ['Gold', 'Silver', 'Bronze'];
  KK.chart('tierChart', {
    type: 'doughnut',
    data: { labels: tiers, datasets: [{ data: tiers.map(t => list.filter(x => x.tier === t).length), backgroundColor: ['#c08a33', '#b8b2ac', '#b08968'], borderColor: '#fff', borderWidth: 2 }] },
    options: { cutout: '60%', plugins: { legend: { position: 'bottom' } }, onClick: (e, els) => { if (els.length) { $('cTier').value = tiers[els[0].index]; draw(); } } }
  });
  const months = [...new Set(CUSTOMERS.map(c => DB.monthKey(c.joined)))].sort();
  KK.chart('joinChart', {
    type: 'bar',
    data: { labels: months.map(m => DB.monthName(m).slice(0, 3)), datasets: [{ label: 'New members', data: months.map(m => CUSTOMERS.filter(c => DB.monthKey(c.joined) === m).length), backgroundColor: KK.colors[1], borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: KK.noGrid, y: { ticks: { precision: 0 } } } }
  });
  const areas = DB.groupSum(CUSTOMERS, c => c.area);
  const areaKeys = Object.keys(areas).sort((a, b) => areas[b] - areas[a]);
  KK.chart('areaChart', {
    type: 'bar',
    data: { labels: areaKeys, datasets: [{ label: 'Members', data: areaKeys.map(a => areas[a]), backgroundColor: KK.colors[2], borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: KK.noGrid, x: { ticks: { precision: 0 } } },
      onClick: (e, els) => { if (els.length) { $('cSearch').value = areaKeys[els[0].index]; draw(); } } }
  });
  const top10 = [...list].sort((a, b) => b.spend - a.spend).slice(0, 10);
  KK.chart('topChart', {
    type: 'bar',
    data: { labels: top10.map(x => x.c.name), datasets: [
      { label: 'Total spend (RM)', data: top10.map(x => x.spend), backgroundColor: KK.colors[0], borderRadius: 6, yAxisID: 'y' },
      { label: 'Visits', data: top10.map(x => x.visits), backgroundColor: KK.colors[4], borderRadius: 6, yAxisID: 'y1' }] },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: KK.rmAxis, y1: { position: 'right', grid: { display: false } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45 } } },
      onClick: (e, els) => els.length && KK.showCustomer(top10[els[0].index].c.id) }
  });

  /* ---------- Table ---------- */
  function filtered() {
    const q = $('cSearch').value.trim().toLowerCase(), t = $('cTier').value, s = $('cSort').value;
    const sorts = { spend: (a, b) => b.spend - a.spend, visits: (a, b) => b.visits - a.visits,
      recent: (a, b) => String(b.lastVisit).localeCompare(String(a.lastVisit)), name: (a, b) => a.c.name.localeCompare(b.c.name) };
    return list.filter(x => (!q || (x.c.name + x.c.email + x.c.area).toLowerCase().includes(q)) && (!t || x.tier === t)).sort(sorts[s]);
  }
  const pager = KK.paginate({
    rows: filtered(), tbody: $('custBody'), pager: $('custPager'), info: $('custInfo'), pageSize: 10, empty: 'No customers found.',
    render: x => `<tr class="clickable" data-id="${x.c.id}">
      <td><div class="d-flex align-items-center gap-2">${KK.avatar(x.c.name, 32)}<div class="lh-sm"><div class="fw-600">${KK.esc(x.c.name)}</div><div class="small kk-muted d-none d-sm-block">${x.c.email}</div></div></div></td>
      <td class="d-none d-md-table-cell">${x.c.area}</td><td class="text-center d-none d-sm-table-cell">${x.visits}</td>
      <td class="text-end text-nowrap fw-600">${KK.rm(x.spend)}</td><td class="text-end d-none d-lg-table-cell">${KK.num(x.points)}</td>
      <td>${KK.badge(x.tier)}</td><td class="d-none d-lg-table-cell">${KK.date(x.lastVisit)}</td></tr>`
  });
  function draw() { pager.update(filtered()); }
  ['cSearch', 'cTier', 'cSort'].forEach(id => $(id).addEventListener('input', draw));
  $('custBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) KK.showCustomer(tr.dataset.id); });

  $('btnExport').addEventListener('click', () => {
    KK.csv('kopikita-customers.csv', [['ID', 'Name', 'Email', 'Phone', 'Area', 'Joined', 'Visits', 'Spend (RM)', 'Points', 'Tier']]
      .concat(filtered().map(x => [x.c.id, x.c.name, x.c.email, x.c.phone, x.c.area, x.c.joined, x.visits, x.spend.toFixed(2), x.points, x.tier])));
    KK.toast('Customer list exported');
  });
})();
