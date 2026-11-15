/* ==========================================================
   Kopi Kita - js/pages/dashboard.js
   Purpose: Summary cards, 6 interactive charts, low stock list,
            recent orders and a "Today" welcome popup.
   ========================================================== */
(function () {
  const user = KK.session(); if (!user) return;
  const all = DB.orders();
  const paid = DB.paidOrders(all);
  const revenue = paid.reduce((s, o) => s + DB.orderTotal(o), 0);
  const today = all.filter(o => o.date === APP_TODAY);
  const todayRev = DB.paidOrders(today).reduce((s, o) => s + DB.orderTotal(o), 0);
  const active = all.filter(o => ['Pending', 'Preparing', 'Ready'].includes(o.status));
  const low = DB.inventory().filter(i => i.stock < i.reorder);
  const months = DB.months();
  const thisMonth = DB.monthKey(APP_TODAY);
  const lastMonth = months[months.indexOf(thisMonth) - 1];
  const revOf = list => DB.paidOrders(list).reduce((s, o) => s + DB.orderTotal(o), 0);

  /* Greeting */
  const h = new Date().getHours();
  document.getElementById('greet').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${user.name.split(' ')[0]}`;

  /* ---------- Summary cards (each one opens a popup) ---------- */
  const kpis = [
    { key: 'rev', icon: 'bi-cash-stack', label: 'Total revenue', value: KK.rm0(revenue), foot: 'Since ' + KK.date(DB.firstDate()) },
    { key: 'orders', icon: 'bi-receipt', label: 'Total orders', value: KK.num(all.length), foot: `${KK.num(paid.length)} paid` },
    { key: 'aov', icon: 'bi-basket', label: 'Avg order value', value: KK.rm(revenue / paid.length), foot: 'Per paid order' },
    { key: 'cust', icon: 'bi-people', label: 'Loyalty members', value: CUSTOMERS.length, foot: `${Math.round(paid.filter(o => o.customer).length / paid.length * 100)}% of orders` },
    { key: 'today', icon: 'bi-sun', label: "Today's sales", value: KK.rm0(todayRev), foot: `${today.length} orders today` },
    { key: 'low', icon: 'bi-exclamation-triangle', label: 'Low stock items', value: low.length, foot: 'Need restock' }
  ];
  document.getElementById('kpiRow').innerHTML = kpis.map(k => `
    <div class="col-6 col-md-4 col-xl-2">
      <div class="kk-card kpi" role="button" tabindex="0" data-kpi="${k.key}" aria-label="${k.label} details">
        <div class="d-flex justify-content-between align-items-start"><div class="kpi-label">${k.label}</div><div class="kpi-icon"><i class="bi ${k.icon}"></i></div></div>
        <div class="kpi-value">${k.value}</div><div class="kpi-foot">${k.foot}</div>
      </div></div>`).join('');

  const kpiPopups = {
    rev() {
      const rows = months.map(m => {
        const list = all.filter(o => DB.monthKey(o.date) === m);
        return `<tr><td>${DB.monthName(m)}</td><td class="text-end">${list.length}</td><td class="text-end fw-600">${KK.rm(revOf(list))}</td></tr>`;
      }).join('');
      const change = lastMonth ? (revOf(all.filter(o => DB.monthKey(o.date) === lastMonth))) : 0;
      KK.modal({
        title: 'Revenue breakdown',
        body: `<div class="row g-2 mb-3">
            <div class="col-4"><div class="mini-stat"><div class="v">${KK.rm0(revenue)}</div><div class="l">Total</div></div></div>
            <div class="col-4"><div class="mini-stat"><div class="v">${KK.rm0(change)}</div><div class="l">Last full month</div></div></div>
            <div class="col-4"><div class="mini-stat"><div class="v">${KK.rm0(revenue - paid.reduce((s, o) => s + DB.orderCost(o), 0))}</div><div class="l">Gross profit</div></div></div></div>
          <div class="table-responsive"><table class="table kk-table"><thead><tr><th>Month</th><th class="text-end">Orders</th><th class="text-end">Revenue</th></tr></thead><tbody>${rows}</tbody></table></div>`
      });
    },
    orders() {
      const by = DB.groupSum(all, o => o.status);
      KK.modal({
        title: 'Orders by status',
        body: `<div class="row g-2">${Object.entries(by).map(([s, n]) => `
          <div class="col-6 col-md-4"><a class="mini-stat d-block text-reset" href="orders.html?status=${s}"><div class="v">${n}</div><div class="l">${s}</div></a></div>`).join('')}</div>
          <p class="small kk-muted mt-3 mb-0">Click a status to open the filtered order list.</p>`
      });
    },
    aov() {
      const types = ['Dine-in', 'Takeaway', 'Delivery'];
      KK.modal({
        title: 'Average order value',
        body: `<div class="table-responsive"><table class="table kk-table"><thead><tr><th>Order type</th><th class="text-end">Orders</th><th class="text-end">Avg value</th><th class="text-end">Avg items</th></tr></thead><tbody>
          ${types.map(t => { const l = paid.filter(o => o.type === t); return `<tr><td>${t}</td><td class="text-end">${l.length}</td><td class="text-end fw-600">${KK.rm(revOf(l) / l.length)}</td><td class="text-end">${(l.reduce((s, o) => s + DB.itemCount(o), 0) / l.length).toFixed(1)}</td></tr>`; }).join('')}
          </tbody></table></div>`
      });
    },
    cust() {
      const stats = CUSTOMERS.map(c => ({ c, ...DB.customerStats(c) })).sort((a, b) => b.spend - a.spend);
      const tiers = DB.groupSum(stats, s => s.tier);
      const el = KK.modal({
        title: 'Loyalty members',
        body: `<div class="row g-2 mb-3">${['Gold', 'Silver', 'Bronze'].map(t => `<div class="col-4"><div class="mini-stat"><div class="v">${tiers[t] || 0}</div><div class="l">${t}</div></div></div>`).join('')}</div>
          <div class="fw-600 mb-2">Top 5 customers</div>
          ${stats.slice(0, 5).map(s => `<div class="list-row clickable" role="button" data-c="${s.c.id}"><div class="d-flex align-items-center gap-2">${KK.avatar(s.c.name, 30)}<div><div class="fw-600">${KK.esc(s.c.name)}</div><div class="small kk-muted">${s.visits} visits</div></div></div><div class="text-end"><div class="fw-600">${KK.rm(s.spend)}</div>${KK.badge(s.tier)}</div></div>`).join('')}`
      });
      el.querySelectorAll('[data-c]').forEach(r => r.addEventListener('click', () => {
        el.addEventListener('hidden.bs.modal', () => KK.showCustomer(r.dataset.c), { once: true });
        el._modal.hide();
      }));
    },
    today() { KK.showOrderList(`Today's orders (${KK.date(APP_TODAY)})`, today); },
    low() { showLowStock(); }
  };
  document.querySelectorAll('[data-kpi]').forEach(c => {
    const open = () => kpiPopups[c.dataset.kpi]();
    c.addEventListener('click', open);
    c.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });

  /* Low stock popup: full list with a restock button for each item */
  function showLowStock() {
    const rows = low.map(i => `<tr data-id="${i.id}">
        <td><div class="fw-600">${i.name}</div><div class="small kk-muted">${i.supplier}</div></td>
        <td class="text-end text-danger text-nowrap">${i.stock} ${i.unit}</td>
        <td class="text-end text-nowrap d-none d-sm-table-cell">${i.reorder} ${i.unit}</td>
        <td class="text-end text-nowrap">+${+(i.max - i.stock).toFixed(2)} ${i.unit}<div class="small kk-muted">${KK.rm((i.max - i.stock) * i.unitCost)}</div></td>
        <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-restock="${i.id}">Restock</button></td></tr>`).join('');
    const total = low.reduce((s, i) => s + (i.max - i.stock) * i.unitCost, 0);
    const el = KK.modal({
      title: `Low stock items (${low.length})`,
      body: low.length ? `<p class="small kk-muted">These ingredients are below their reorder level. Restock fills each item up to its maximum.</p>
        <div class="table-responsive"><table class="table kk-table"><thead><tr><th>Item</th><th class="text-end">In stock</th>
        <th class="text-end d-none d-sm-table-cell">Reorder at</th><th class="text-end">To order</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="receipt d-flex justify-content-between"><span>Estimated cost to restock all</span><span class="fw-bold text-accent">${KK.rm(total)}</span></div>`
        : '<div class="empty-state"><img src="assets/img/empty.svg" alt=""><div>All items are in stock.</div></div>',
      footer: low.length ? '<button class="btn btn-light" data-bs-dismiss="modal">Close</button><button class="btn btn-primary" id="restockAll"><i class="bi bi-arrow-repeat me-1"></i>Restock all</button>'
        : '<button class="btn btn-primary" data-bs-dismiss="modal">OK</button>'
    });
    const done = msg => { el._modal.hide(); KK.toast(msg); setTimeout(() => location.reload(), 700); };
    el.querySelectorAll('[data-restock]').forEach(b => b.addEventListener('click', () => {
      const i = low.find(x => x.id === b.dataset.restock);
      DB.restock(i.id, +(i.max - i.stock).toFixed(2));
      done(`${i.name} restocked`);
    }));
    el.querySelector('#restockAll')?.addEventListener('click', () => {
      low.forEach(i => DB.restock(i.id, +(i.max - i.stock).toFixed(2)));
      done(`${low.length} items restocked`);
    });
  }

  /* ---------- Chart 1: monthly revenue (click a point) ---------- */
  const monthRev = months.map(m => revOf(all.filter(o => DB.monthKey(o.date) === m)));
  const monthOrders = months.map(m => all.filter(o => DB.monthKey(o.date) === m).length);
  KK.chart('revChart', {
    type: 'line',
    data: {
      labels: months.map(m => DB.monthName(m) + (m === thisMonth ? ' *' : '')),
      datasets: [
        { label: 'Revenue (RM)', data: monthRev, borderColor: KK.colors[0], backgroundColor: 'rgba(122,82,53,.08)', fill: true, tension: .35, pointRadius: 4, pointHoverRadius: 7, yAxisID: 'y' },
        { label: 'Orders', data: monthOrders, borderColor: KK.colors[3], borderDash: [5, 4], tension: .35, pointRadius: 3, yAxisID: 'y1' }
      ]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { footer: () => '* this month = up to today' } } },
      scales: { y: KK.rmAxis, y1: { position: 'right', grid: { display: false } }, x: KK.noGrid },
      onClick: (e, els) => { if (els.length) { const m = months[els[0].index]; KK.showOrderList(`Orders in ${DB.monthName(m)}`, all.filter(o => DB.monthKey(o.date) === m)); } }
    }
  });

  /* ---------- Chart 2: sales by category (click a slice) ---------- */
  const sales = DB.itemSales(paid);
  const cats = [...new Set(MENU.map(m => m.category))];
  const catRev = cats.map(c => sales.filter(s => s.item.category === c).reduce((t, s) => t + s.revenue, 0));
  KK.chart('catChart', {
    type: 'doughnut',
    data: { labels: cats, datasets: [{ data: catRev, backgroundColor: KK.colors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      cutout: '62%',
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${KK.rm0(c.raw)}` } } },
      onClick: (e, els) => {
        if (!els.length) return;
        const cat = cats[els[0].index];
        const list = sales.filter(s => s.item.category === cat);
        KK.modal({
          title: `${cat} - sales by item`,
          body: `<div class="table-responsive"><table class="table kk-table table-hover"><thead><tr><th>Item</th><th class="text-end">Sold</th><th class="text-end">Revenue</th></tr></thead><tbody>
            ${list.map(s => `<tr><td><div class="d-flex align-items-center gap-2"><img src="${KK.menuImg(s.item)}" class="thumb" width="26" height="26" alt="">${s.item.name}</div></td><td class="text-end">${s.qty}</td><td class="text-end fw-600">${KK.rm(s.revenue)}</td></tr>`).join('')}
            </tbody></table></div>`
        });
      }
    }
  });

  /* ---------- Chart 3: orders per hour ---------- */
  const hours = Array.from({ length: 15 }, (_, i) => i + 7);
  const perHour = hours.map(hr => all.filter(o => +o.time.slice(0, 2) === hr).length);
  const peak = Math.max(...perHour);
  KK.chart('hourChart', {
    type: 'bar',
    data: { labels: hours.map(x => (x > 12 ? x - 12 : x) + (x >= 12 ? 'pm' : 'am')),
      datasets: [{ label: 'Orders', data: perHour, backgroundColor: perHour.map(v => v === peak ? KK.colors[0] : KK.colors[2]), borderRadius: 6 }] },
    options: {
      plugins: { legend: { display: false } }, scales: { x: KK.noGrid },
      onClick: (e, els) => { if (els.length) { const hr = hours[els[0].index]; KK.showOrderList(`Orders between ${hr}:00 and ${hr}:59`, all.filter(o => +o.time.slice(0, 2) === hr)); } }
    }
  });

  /* ---------- Chart 4: top 5 items (click opens item popup) ---------- */
  const top5 = sales.slice(0, 5);
  KK.chart('topChart', {
    type: 'bar',
    data: { labels: top5.map(s => s.item.name), datasets: [{ label: 'Units sold', data: top5.map(s => s.qty), backgroundColor: KK.colors[1], borderRadius: 6 }] },
    options: {
      indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: KK.noGrid },
      onClick: (e, els) => els.length && KK.showMenuItem(top5[els[0].index].item.id)
    }
  });

  /* ---------- Chart 5 & 6: order type, payment ---------- */
  function pie(id, keyFn, type = 'pie') {
    const g = DB.groupSum(paid, keyFn);
    const labels = Object.keys(g);
    KK.chart(id, {
      type,
      data: { labels, datasets: [{ data: Object.values(g), backgroundColor: KK.colors, borderColor: '#fff', borderWidth: 2 }] },
      options: {
        plugins: { legend: { position: 'right' } }, cutout: type === 'doughnut' ? '60%' : 0,
        onClick: (e, els) => { if (els.length) { const k = labels[els[0].index]; KK.showOrderList(`${k} orders`, paid.filter(o => keyFn(o) === k)); } }
      }
    });
  }
  pie('typeChart', o => o.type);
  pie('payChart', o => o.payment, 'doughnut');

  /* ---------- Low stock list ---------- */
  document.getElementById('lowList').innerHTML = low.slice(0, 5).map(i => `
    <div class="list-row clickable" role="button"><div><div class="fw-600">${i.name}</div><div class="small kk-muted">Reorder at ${i.reorder} ${i.unit}</div></div>
    ${KK.badge(i.stock + ' ' + i.unit, 'low')}</div>`).join('') + (low.length > 5 ? `<button class="btn btn-light btn-sm w-100 mt-2" id="moreLow">+${low.length - 5} more</button>` : '') || '<p class="kk-muted small mb-0">All items are in stock.</p>';
  document.getElementById('moreLow')?.addEventListener('click', showLowStock);
  document.getElementById('btnLowAll').addEventListener('click', showLowStock);
  /* clicking an item in the list also opens the popup */
  document.getElementById('lowList').addEventListener('click', e => { if (e.target.closest('.list-row')) showLowStock(); });

  /* ---------- Recent orders ---------- */
  const recent = [...all].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 8);
  const body = document.getElementById('recentBody');
  body.innerHTML = recent.map(o => `
    <tr class="clickable" data-id="${o.id}"><td class="fw-600">${o.id}</td><td>${KK.date(o.date)} <span class="kk-muted">${o.time}</span></td>
      <td class="d-none d-md-table-cell">${o.customer ? KK.esc(DB.customerById(o.customer).name) : '<span class="kk-muted">Walk-in</span>'}</td>
      <td class="d-none d-lg-table-cell">${o.type}</td><td class="text-end">${KK.rm(DB.orderTotal(o))}</td><td>${KK.badge(o.status)}</td></tr>`).join('');
  body.addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) KK.showOrder(tr.dataset.id); });

  /* ---------- "Today" popup - opens straight after login ---------- */
  function welcome() {
    const best = DB.itemSales(DB.paidOrders(today))[0];
    const el = KK.modal({
      title: `<i class="bi bi-sun me-2 text-accent"></i>Today at Kopi Kita`,
      body: `<p class="kk-muted">${KK.date(APP_TODAY)} &middot; here is your quick summary.</p>
        <div class="row g-2 mb-3">
          <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${today.length}</div><div class="l">Orders today</div></div></div>
          <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.rm0(todayRev)}</div><div class="l">Sales today</div></div></div>
          <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${active.length}</div><div class="l">Active orders</div></div></div>
          <div class="col-6 col-md-3"><div class="mini-stat"><div class="v text-danger">${low.length}</div><div class="l">Low stock</div></div></div>
        </div>
        <div class="list-row"><span><i class="bi bi-trophy me-2 text-accent"></i>Best seller today</span><span class="fw-600">${best ? best.item.name + ' (' + best.qty + ')' : '-'}</span></div>
        <div class="list-row"><span><i class="bi bi-hourglass-split me-2 text-accent"></i>Being prepared by staff</span><span class="fw-600">${active.map(o => o.id).join(', ') || 'None'}</span></div>
        <div class="list-row"><span><i class="bi bi-box-seam me-2 text-accent"></i>Restock soon</span><span class="fw-600 text-end">${low.slice(0, 3).map(i => i.name).join(', ')}${low.length > 3 ? '...' : ''}</span></div>`,
      footer: `<button class="btn btn-light" id="wLow">Check stock</button><a class="btn btn-primary" href="orders.html?status=active">View active orders</a>`
    });
    el.querySelector('#wLow').addEventListener('click', () => {
      el.addEventListener('hidden.bs.modal', showLowStock, { once: true });
      el._modal.hide();
    });
    return el;
  }
  document.getElementById('btnWelcome').addEventListener('click', welcome);
  if (!sessionStorage.getItem('kk_welcome_seen')) {
    sessionStorage.setItem('kk_welcome_seen', '1');
    welcome();
  }
})();
