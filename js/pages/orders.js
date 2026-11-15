/* ==========================================================
   Kopi Kita - js/pages/orders.js
   Purpose: Order monitoring for the admin (view only): search,
            filters, pagination, 3 charts, receipt popup, CSV export.
            Orders are taken by staff at the counter, not by the admin.
   ========================================================== */
(function () {
  if (!KK.session()) return;
  const $ = id => document.getElementById(id);
  const STATUSES = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
  let all = [];
  let pager;
  let activeOnly = false;

  /* Date filters can only pick days that have orders */
  ['fFrom', 'fTo'].forEach(id => { $(id).min = DB.firstDate(); $(id).max = APP_TODAY; });

  /* Read filters from the link, e.g. orders.html?status=Pending */
  const qs = new URLSearchParams(location.search).get('status');
  if (qs === 'active') activeOnly = true; else if (qs) $('fStatus').value = qs;

  function load() {
    all = DB.orders().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }

  /* ---------- Summary cards ---------- */
  function drawKpis() {
    const count = s => all.filter(o => s.includes(o.status)).length;
    const cards = [
      { label: 'All orders', value: all.length, icon: 'bi-receipt', f: '' },
      { label: 'Active now', value: count(['Pending', 'Preparing', 'Ready']), icon: 'bi-hourglass-split', f: 'active' },
      { label: 'Completed', value: count(['Completed']), icon: 'bi-check2-circle', f: 'Completed' },
      { label: 'Cancelled', value: count(['Cancelled']), icon: 'bi-x-circle', f: 'Cancelled' }
    ];
    $('kpiRow').innerHTML = cards.map(c => `<div class="col-6 col-lg-3"><div class="kk-card kpi" role="button" tabindex="0" data-f="${c.f}">
      <div class="d-flex justify-content-between"><div class="kpi-label">${c.label}</div><div class="kpi-icon"><i class="bi ${c.icon}"></i></div></div>
      <div class="kpi-value">${KK.num(c.value)}</div><div class="kpi-foot">Click to filter</div></div></div>`).join('');
    $('kpiRow').querySelectorAll('[data-f]').forEach(c => c.addEventListener('click', () => {
      activeOnly = c.dataset.f === 'active';
      $('fStatus').value = activeOnly ? '' : c.dataset.f;
      applyFilters();
      $('orderBody').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  /* ---------- Charts ---------- */
  function drawCharts() {
    const counts = STATUSES.map(s => all.filter(o => o.status === s).length);
    KK.chart('statusChart', {
      type: 'bar',
      data: { labels: STATUSES, datasets: [{ label: 'Orders', data: counts, backgroundColor: ['#c08a33', '#3c5a85', '#5d4585', '#5f8a66', '#b5534a'], borderRadius: 6 }] },
      options: {
        plugins: { legend: { display: false } }, scales: { x: KK.noGrid, y: { type: 'logarithmic', ticks: { callback: v => [1, 5, 10, 50, 100, 500].includes(v) ? v : '' } } },
        onClick: (e, els) => { if (els.length) { activeOnly = false; $('fStatus').value = STATUSES[els[0].index]; applyFilters(); KK.toast('Filtered by ' + STATUSES[els[0].index], 'info'); } }
      }
    });
    const days = Array.from({ length: 14 }, (_, i) => DB.daysAgo(13 - i));
    KK.chart('dailyChart', {
      type: 'line',
      data: { labels: days.map(d => KK.date(d).slice(0, -5)),
        datasets: [{ label: 'Orders', data: days.map(d => all.filter(o => o.date === d).length), borderColor: KK.colors[0], backgroundColor: 'rgba(122,82,53,.08)', fill: true, tension: .35 }] },
      options: {
        plugins: { legend: { display: false } }, scales: { x: KK.noGrid, y: { beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (e, els) => { if (els.length) { const d = days[els[0].index]; KK.showOrderList(`Orders on ${KK.date(d)}`, all.filter(o => o.date === d)); } }
      }
    });
    const types = ['Dine-in', 'Takeaway', 'Delivery'];
    KK.chart('typeChart', {
      type: 'doughnut',
      data: { labels: types, datasets: [{ data: types.map(t => all.filter(o => o.type === t).length), backgroundColor: KK.colors, borderColor: '#fff', borderWidth: 2 }] },
      options: { cutout: '60%', plugins: { legend: { position: 'bottom' } },
        onClick: (e, els) => { if (els.length) { $('fType').value = types[els[0].index]; applyFilters(); } } }
    });
  }

  /* ---------- Table + filters ---------- */
  function filtered() {
    const q = $('fSearch').value.trim().toLowerCase();
    const st = $('fStatus').value, ty = $('fType').value, from = $('fFrom').value, to = $('fTo').value;
    return all.filter(o => {
      const c = o.customer ? DB.customerById(o.customer).name.toLowerCase() : 'walk-in';
      return (!q || o.id.toLowerCase().includes(q) || c.includes(q))
        && (!st || o.status === st)
        && (!activeOnly || ['Pending', 'Preparing', 'Ready'].includes(o.status))
        && (!ty || o.type === ty)
        && (!from || o.date >= from) && (!to || o.date <= to);
    });
  }
  const row = o => `<tr class="clickable" data-id="${o.id}">
    <td class="fw-600 text-nowrap">${o.id}</td><td class="text-nowrap">${KK.date(o.date)} <span class="kk-muted">${o.time}</span></td>
    <td class="d-none d-md-table-cell">${o.customer ? KK.esc(DB.customerById(o.customer).name) : '<span class="kk-muted">Walk-in</span>'}</td>
    <td class="d-none d-sm-table-cell text-center">${DB.itemCount(o)}</td><td class="d-none d-lg-table-cell">${o.type}</td>
    <td class="d-none d-lg-table-cell">${o.payment}</td><td class="text-end text-nowrap">${KK.rm(DB.orderTotal(o))}</td><td>${KK.badge(o.status)}</td></tr>`;

  function applyFilters() { pager.update(filtered()); }


  load(); drawKpis(); drawCharts();
  pager = KK.paginate({ rows: filtered(), tbody: $('orderBody'), pager: $('orderPager'), info: $('orderInfo'), pageSize: 12, render: row, empty: 'No orders match your filters.' });
  ['fSearch', 'fStatus', 'fType', 'fFrom', 'fTo'].forEach(id => $(id).addEventListener('input', () => { if (id === 'fStatus') activeOnly = false; applyFilters(); }));
  $('orderBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) KK.showOrder(tr.dataset.id); });

  /* ---------- Export ---------- */
  $('btnExport').addEventListener('click', () => {
    const rows = [['Order', 'Date', 'Time', 'Customer', 'Items', 'Type', 'Payment', 'Total (RM)', 'Status']]
      .concat(filtered().map(o => [o.id, o.date, o.time, o.customer ? DB.customerById(o.customer).name : 'Walk-in', DB.itemCount(o), o.type, o.payment, DB.orderTotal(o).toFixed(2), o.status]));
    KK.csv('kopikita-orders.csv', rows);
    KK.toast(`Exported ${rows.length - 1} orders`);
  });

})();