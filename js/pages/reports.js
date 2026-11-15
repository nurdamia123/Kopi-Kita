/* ==========================================================
   Kopi Kita - js/pages/reports.js
   Purpose: Reports & analytics for the admin
     - any period (presets or custom dates)
     - every number compared with the previous period
     - monthly revenue target with projection
     - revenue trend, category, customers, payment, order type
     - busy-times heatmap (day x hour)
     - automatic insights
     - sortable item performance table, CSV export, print
   ========================================================== */
(function () {
  if (!KK.session()) return;
  const $ = id => document.getElementById(id);
  const FIRST = DB.firstDate();                         // oldest order (dates follow today's date)
  ['dFrom', 'dTo'].forEach(id => { $(id).min = FIRST; $(id).max = APP_TODAY; });
  const ALL = DB.orders();
  const rev = l => l.reduce((s, o) => s + DB.orderTotal(o), 0);
  const cost = l => l.reduce((s, o) => s + DB.orderCost(o), 0);
  const between = (from, to) => ALL.filter(o => o.date >= from && o.date <= to);
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  let sortKey = 'revenue', sortDir = -1;
  let current = null;                                   // data for the selected period

  /* First order date of every member (to tell new vs returning customers) */
  const firstOrder = {};
  ALL.forEach(o => { if (o.customer && (!firstOrder[o.customer] || o.date < firstOrder[o.customer])) firstOrder[o.customer] = o.date; });

  /* ---------- Period ---------- */
  function presetRange(p) {
    const t = APP_TODAY, mk = DB.monthKey(t);
    if (p === 'today') return [t, t];
    if (p === 'yesterday') return [DB.daysAgo(1), DB.daysAgo(1)];
    if (p === 'thismonth') return [mk + '-01', t];
    if (p === 'lastmonth') { const s = DB.addDays(mk + '-01', -1).slice(0, 7) + '-01'; return [s, DB.addDays(mk + '-01', -1)]; }
    if (p === 'all') return [FIRST, t];
    if (/^\d+$/.test(p)) return [DB.daysAgo(+p - 1), t];
    return [$('dFrom').value || DB.daysAgo(29), $('dTo').value || t];
  }
  function compute() {
    let [from, to] = presetRange($('preset').value);
    if (from > to) [from, to] = [to, from];
    $('dFrom').value = from; $('dTo').value = to;
    const len = daysBetween(from, to);
    const pTo = DB.addDays(from, -1), pFrom = DB.addDays(from, -len);
    const list = between(from, to), prev = between(pFrom, pTo);
    current = { from, to, len, pFrom, pTo, list, prev, paid: DB.paidOrders(list), prevPaid: DB.paidOrders(prev), compare: $('compare').checked && pTo >= FIRST };
    $('periodLabel').innerHTML = `<i class="bi bi-calendar-range me-1"></i>${KK.date(from)} - ${KK.date(to)} (${len} day${len > 1 ? 's' : ''}, ${list.length} orders)` +
      (current.compare ? ` &middot; compared with ${KK.date(pFrom)} - ${KK.date(pTo)}` : $('compare').checked ? ' &middot; no earlier data to compare' : '');
    drawAll();
  }

  /* ---------- Summary cards with % change ---------- */
  function metrics(list, paid) {
    const R = rev(paid), C = cost(paid);
    const members = [...new Set(paid.filter(o => o.customer).map(o => o.customer))];
    const repeat = members.filter(c => paid.filter(o => o.customer === c).length > 1).length;
    return {
      revenue: R, profit: R - C, margin: R ? (R - C) / R * 100 : 0, orders: paid.length, aov: paid.length ? R / paid.length : 0,
      items: paid.reduce((s, o) => s + DB.itemCount(o), 0), cancel: list.length ? (list.length - paid.length) / list.length * 100 : 0,
      repeat: members.length ? repeat / members.length * 100 : 0
    };
  }
  function change(now, before, lowerIsBetter = false, points = false) {
    if (!current.compare) return '';
    if (!before && !now) return '<span class="kpi-change flat">0%</span>';
    const d = points ? now - before : before ? (now - before) / before * 100 : 100;
    const good = lowerIsBetter ? d < 0 : d > 0;
    const cls = Math.abs(d) < 0.5 ? 'flat' : good ? 'up' : 'down';
    return `<span class="kpi-change ${cls}"><i class="bi ${d > 0 ? 'bi-arrow-up' : d < 0 ? 'bi-arrow-down' : 'bi-dash'}"></i>${Math.abs(d).toFixed(1)}${points ? ' pt' : '%'}</span>`;
  }
  function drawKpis() {
    const m = metrics(current.list, current.paid), p = metrics(current.prev, current.prevPaid);
    const cards = [
      ['Revenue', KK.rm0(m.revenue), change(m.revenue, p.revenue), 'bi-cash-stack'],
      ['Gross profit', KK.rm0(m.profit), change(m.profit, p.profit), 'bi-graph-up-arrow'],
      ['Profit margin', m.margin.toFixed(1) + '%', change(m.margin, p.margin, false, true), 'bi-percent'],
      ['Paid orders', KK.num(m.orders), change(m.orders, p.orders), 'bi-receipt'],
      ['Avg order value', KK.rm(m.aov), change(m.aov, p.aov), 'bi-basket'],
      ['Items sold', KK.num(m.items), change(m.items, p.items), 'bi-cup-hot'],
      ['Cancellation rate', m.cancel.toFixed(1) + '%', change(m.cancel, p.cancel, true, true), 'bi-x-circle'],
      ['Repeat customers', m.repeat.toFixed(0) + '%', change(m.repeat, p.repeat, false, true), 'bi-arrow-repeat']
    ];
    $('kpiRow').innerHTML = cards.map(([l, v, c, i]) => `<div class="col-6 col-md-3"><div class="kk-card kpi" style="cursor:default">
      <div class="d-flex justify-content-between"><div class="kpi-label">${l}</div><div class="kpi-icon"><i class="bi ${i}"></i></div></div>
      <div class="kpi-value">${v}</div><div class="kpi-foot">${c || '&nbsp;'}${current.compare ? ' vs previous' : ''}</div></div></div>`).join('');
  }

  /* ---------- Revenue trend (with previous period) ---------- */
  function drawTrend() {
    const monthly = current.len > 62;
    let keys, prevKeys, pick;
    if (monthly) {
      keys = [...new Set(current.list.map(o => DB.monthKey(o.date)))].sort();
      prevKeys = [...new Set(current.prev.map(o => DB.monthKey(o.date)))].sort().slice(-keys.length);
      pick = (l, k) => l.filter(o => DB.monthKey(o.date) === k);
    } else {
      keys = Array.from({ length: current.len }, (_, i) => DB.addDays(current.from, i));
      prevKeys = Array.from({ length: current.len }, (_, i) => DB.addDays(current.pFrom, i));
      pick = (l, k) => l.filter(o => o.date === k);
    }
    const ds = [{ label: 'This period', data: keys.map(k => rev(pick(current.paid, k))), borderColor: KK.colors[0], backgroundColor: 'rgba(122,82,53,.1)', fill: true, tension: .3, pointRadius: keys.length > 40 ? 0 : 3 }];
    if (current.compare) ds.push({ label: 'Previous period', data: prevKeys.map(k => rev(pick(current.prevPaid, k))), borderColor: KK.colors[1], borderDash: [6, 5], tension: .3, pointRadius: 0 });
    KK.chart('trendChart', {
      type: 'line',
      data: { labels: keys.map(k => monthly ? DB.monthName(k) : KK.date(k).slice(0, -5)), datasets: ds },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${KK.rm(c.raw)}` } } },
        scales: { y: KK.rmAxis, x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } } },
        onClick: (e, els) => { if (els.length) { const k = keys[els[0].index]; KK.showOrderList(monthly ? DB.monthName(k) : KK.date(k), pick(current.list, k)); } } }
    });
  }

  /* ---------- Monthly target ---------- */
  function drawTarget() {
    const mk = DB.monthKey(APP_TODAY);
    const target = DB.targets()[mk] || 0;
    const actual = rev(DB.paidOrders(ALL.filter(o => DB.monthKey(o.date) === mk)));
    const day = +APP_TODAY.slice(8), [y, m] = mk.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    const projected = actual / day * dim;
    const pctDone = target ? Math.min(100, actual / target * 100) : 0;
    const need = target > actual ? (target - actual) / (dim - day) : 0;
    $('targetBox').innerHTML = `
      <label class="form-label" for="targetIn">Target for ${DB.monthName(mk)}</label>
      <div class="input-group mb-3"><span class="input-group-text">RM</span><input type="number" class="form-control" id="targetIn" min="0" step="100" value="${target}">
        <button class="btn btn-primary" id="targetSave">Save</button></div>
      <div class="d-flex justify-content-between small mb-1"><span>${KK.rm0(actual)} so far</span><span class="fw-600">${pctDone.toFixed(0)}%</span></div>
      <div class="kk-progress mb-3"><span style="width:${pctDone}%"></span></div>
      <div class="list-row"><span class="kk-muted small">Day</span><span class="fw-600">${day} of ${dim}</span></div>
      <div class="list-row"><span class="kk-muted small">Daily average</span><span class="fw-600">${KK.rm(actual / day)}</span></div>
      <div class="list-row"><span class="kk-muted small">Projected month end</span><span class="fw-600 ${projected >= target ? 'text-success' : 'text-danger'}">${KK.rm0(projected)}</span></div>
      <div class="list-row"><span class="kk-muted small">Needed per day to hit target</span><span class="fw-600">${need ? KK.rm(need) : '<span class="text-success">Target reached</span>'}</span></div>`;
    $('targetSave').addEventListener('click', () => {
      const v = +$('targetIn').value;
      if (!(v >= 0)) { KK.toast('Enter a valid amount', 'error'); return; }
      DB.setTarget(mk, v); KK.toast('Target saved'); drawTarget();
    });
  }

  /* ---------- Category, customers, payment, type ---------- */
  function drawBreakdowns() {
    const cats = ['Coffee', 'Non-Coffee', 'Tea', 'Pastry', 'Food', 'Dessert'];
    const s = DB.itemSales(current.paid), ps = DB.itemSales(current.prevPaid);
    const catRev = (list, c) => list.filter(x => x.item.category === c).reduce((t, x) => t + x.revenue, 0);
    const ds = [{ label: 'This period', data: cats.map(c => catRev(s, c)), backgroundColor: KK.colors[0], borderRadius: 6 }];
    if (current.compare) ds.push({ label: 'Previous', data: cats.map(c => catRev(ps, c)), backgroundColor: KK.colors[2], borderRadius: 6 });
    KK.chart('catChart', {
      type: 'bar', data: { labels: cats, datasets: ds },
      options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${KK.rm(c.raw)}` } } }, scales: { y: KK.rmAxis, x: KK.noGrid },
        onClick: (e, els) => {
          if (!els.length) return;
          const cat = cats[els[0].index], l = s.filter(x => x.item.category === cat);
          KK.modal({ title: `${cat} items`, body: l.length ? `<div class="table-responsive"><table class="table kk-table"><thead><tr><th>Item</th><th class="text-end">Sold</th><th class="text-end">Revenue</th><th class="text-end">Profit</th></tr></thead><tbody>
            ${l.map(x => `<tr><td>${KK.esc(x.item.name)}</td><td class="text-end">${x.qty}</td><td class="text-end">${KK.rm(x.revenue)}</td><td class="text-end fw-600">${KK.rm(x.revenue - x.qty * x.item.cost)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="kk-muted">No sales in this period.</p>' });
        } }
    });
    const members = [...new Set(current.paid.filter(o => o.customer).map(o => o.customer))];
    const fresh = members.filter(c => firstOrder[c] >= current.from).length;
    const walkin = current.paid.filter(o => !o.customer).length;
    KK.chart('custChart', {
      type: 'doughnut',
      data: { labels: ['New members', 'Returning members', 'Walk-in orders'], datasets: [{ data: [fresh, members.length - fresh, walkin], backgroundColor: [KK.colors[3], KK.colors[0], KK.colors[2]] }] },
      options: { cutout: '58%', plugins: { legend: { position: 'bottom' } } }
    });
    const pie = (id, key) => {
      const g = DB.groupSum(current.paid, o => o[key], o => DB.orderTotal(o));
      const labels = Object.keys(g), R = rev(current.paid);
      KK.chart(id, { type: 'doughnut', data: { labels, datasets: [{ data: Object.values(g), backgroundColor: KK.colors }] },
        options: { cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${KK.rm0(c.raw)} (${(c.raw / R * 100).toFixed(0)}%)` } } },
          onClick: (e, els) => { if (els.length) { const k = labels[els[0].index]; KK.showOrderList(`${k} orders`, current.list.filter(o => o[key] === k)); } } } });
    };
    pie('payChart', 'payment');
    pie('typeChart', 'type');
  }

  /* ---------- Heatmap: orders by day of week and hour ---------- */
  function drawHeatmap() {
    const hours = Array.from({ length: 15 }, (_, i) => i + 7);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const grid = days.map((_, d) => hours.map(h => current.list.filter(o => DB.dayOfWeek(o.date) === d && +o.time.slice(0, 2) === h)));
    const max = Math.max(1, ...grid.flat().map(c => c.length));
    const color = n => n ? `rgba(122, 82, 53, ${0.12 + 0.88 * n / max})` : 'var(--kk-bg)';
    $('heatmap').innerHTML = `<thead><tr><th></th>${hours.map(h => `<th>${h > 12 ? h - 12 : h}${h >= 12 ? 'p' : 'a'}</th>`).join('')}</tr></thead><tbody>
      ${days.map((d, di) => `<tr><th class="day">${d}</th>${grid[di].map((c, hi) => `<td class="${c.length ? 'has' : ''}" style="background:${color(c.length)}" data-d="${di}" data-h="${hi}" title="${d} ${hours[hi]}:00 - ${c.length} orders">${c.length || ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('heatLegend').innerHTML = 'Fewer' + [0.15, 0.35, 0.55, 0.75, 1].map(a => `<span style="background:rgba(122,82,53,${a})"></span>`).join('') + 'More orders';
    $('heatmap').onclick = e => {
      const td = e.target.closest('td[data-d]'); if (!td) return;
      const list = grid[+td.dataset.d][+td.dataset.h];
      if (list.length) KK.showOrderList(`${days[+td.dataset.d]}, ${hours[+td.dataset.h]}:00 - ${hours[+td.dataset.h]}:59`, list);
    };
  }

  /* ---------- Automatic insights ---------- */
  function drawInsights() {
    const p = current.paid;
    if (!p.length) { $('insights').innerHTML = '<p class="kk-muted small mb-0">No paid orders in this period.</p>'; return; }
    const byDate = DB.groupSum(p, o => o.date, o => DB.orderTotal(o));
    const bestDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
    const byHour = DB.groupSum(p, o => +o.time.slice(0, 2));
    const peak = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    const sales = DB.itemSales(p);
    const best = sales[0];
    const margin = [...sales].sort((a, b) => (b.revenue - b.qty * b.item.cost) - (a.revenue - a.qty * a.item.cost))[0];
    const items = [
      ['bi-calendar-star', 'Best day', `${KK.date(bestDay[0])} with ${KK.rm0(bestDay[1])}`],
      ['bi-clock', 'Busiest hour', `${peak[0]}:00 - ${peak[0]}:59 (${peak[1]} orders)`],
      ['bi-trophy', 'Best seller', `${best.item.name} - ${best.qty} sold`],
      ['bi-piggy-bank', 'Most profitable item', `${margin.item.name} - ${KK.rm0(margin.revenue - margin.qty * margin.item.cost)} profit`]
    ];
    if (current.compare) {
      const now = rev(p), before = rev(current.prevPaid);
      const d = before ? (now - before) / before * 100 : 0;
      items.push([d >= 0 ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow', 'Compared with before', `Revenue ${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)}% (${KK.rm0(now - before)})`]);
    }
    $('insights').innerHTML = items.map(([i, t, d]) => `<div class="insight"><div class="ic"><i class="bi ${i}"></i></div><div><div class="fw-600 small">${t}</div><div class="small kk-muted">${KK.esc(d)}</div></div></div>`).join('');
  }

  /* ---------- Item performance table ---------- */
  const COLS = [['name', 'Item', false], ['category', 'Category', false, 'd-none d-md-table-cell'], ['qty', 'Sold', true], ['revenue', 'Revenue', true],
    ['cost', 'Cost', true, 'd-none d-lg-table-cell'], ['profit', 'Profit', true], ['margin', 'Margin', true, 'd-none d-sm-table-cell'], ['share', 'Share', true, 'd-none d-md-table-cell']];
  function itemRows() {
    const s = DB.itemSales(current.paid), R = s.reduce((t, x) => t + x.revenue, 0);
    const q = $('itemSearch').value.trim().toLowerCase();
    return s.map(x => ({ id: x.item.id, name: x.item.name, category: x.item.category, qty: x.qty, revenue: x.revenue, cost: x.qty * x.item.cost,
      profit: x.revenue - x.qty * x.item.cost, margin: x.revenue ? (1 - x.qty * x.item.cost / x.revenue) * 100 : 0, share: R ? x.revenue / R * 100 : 0, img: x.item }))
      .filter(r => !q || (r.name + r.category).toLowerCase().includes(q))
      .sort((a, b) => (typeof a[sortKey] === 'string' ? a[sortKey].localeCompare(b[sortKey]) : a[sortKey] - b[sortKey]) * sortDir);
  }
  function drawItems() {
    $('itemHead').innerHTML = COLS.map(([k, l, num, cls = '']) => `<th class="sortable ${num ? 'text-end' : ''} ${cls}" data-k="${k}">${l}<i class="bi ${sortKey === k ? (sortDir > 0 ? 'bi-caret-up-fill' : 'bi-caret-down-fill') : 'bi-chevron-expand'}"></i></th>`).join('');
    const rows = itemRows();
    $('itemBody').innerHTML = rows.length ? rows.map(r => `<tr class="clickable" data-id="${r.id}">
      <td><div class="d-flex align-items-center gap-2"><img src="${KK.menuImg(r.img)}" class="thumb" width="28" height="28" alt="">${KK.esc(r.name)}</div></td>
      <td class="d-none d-md-table-cell">${r.category}</td><td class="text-end">${r.qty}</td><td class="text-end text-nowrap">${KK.rm(r.revenue)}</td>
      <td class="text-end text-nowrap d-none d-lg-table-cell">${KK.rm(r.cost)}</td><td class="text-end text-nowrap fw-600">${KK.rm(r.profit)}</td>
      <td class="text-end d-none d-sm-table-cell">${r.margin.toFixed(0)}%</td>
      <td class="text-end d-none d-md-table-cell"><div class="d-flex align-items-center gap-2 justify-content-end"><div class="kk-progress" style="width:60px;height:6px"><span style="width:${r.share}%"></span></div>${r.share.toFixed(1)}%</div></td></tr>`).join('')
      : `<tr><td colspan="8"><div class="empty-state"><img src="assets/img/empty.svg" alt=""><div>No item sales in this period.</div></div></td></tr>`;
    const sum = k => rows.reduce((t, r) => t + r[k], 0);
    const R = sum('revenue');
    $('itemFoot').innerHTML = rows.length ? `<tr class="fw-bold"><td>Total</td><td class="d-none d-md-table-cell"></td><td class="text-end">${sum('qty')}</td><td class="text-end text-nowrap">${KK.rm(R)}</td>
      <td class="text-end text-nowrap d-none d-lg-table-cell">${KK.rm(sum('cost'))}</td><td class="text-end text-nowrap">${KK.rm(sum('profit'))}</td>
      <td class="text-end d-none d-sm-table-cell">${R ? (sum('profit') / R * 100).toFixed(0) : 0}%</td><td class="d-none d-md-table-cell"></td></tr>` : '';
  }
  $('itemHead').addEventListener('click', e => {
    const th = e.target.closest('[data-k]'); if (!th) return;
    if (sortKey === th.dataset.k) sortDir *= -1; else { sortKey = th.dataset.k; sortDir = typeof itemRows()[0]?.[sortKey] === 'string' ? 1 : -1; }
    drawItems();
  });
  $('itemSearch').addEventListener('input', drawItems);
  $('itemBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) KK.showMenuItem(tr.dataset.id); });

  /* ---------- Export & print ---------- */
  $('btnExport').addEventListener('click', () => {
    const m = metrics(current.list, current.paid);
    const rows = [['Kopi Kita report', `${current.from} to ${current.to}`], [], ['Revenue (RM)', m.revenue.toFixed(2)], ['Gross profit (RM)', m.profit.toFixed(2)],
      ['Margin (%)', m.margin.toFixed(1)], ['Paid orders', m.orders], ['Avg order value (RM)', m.aov.toFixed(2)], ['Items sold', m.items], ['Cancellation rate (%)', m.cancel.toFixed(1)], [],
      ['Item', 'Category', 'Sold', 'Revenue (RM)', 'Cost (RM)', 'Profit (RM)', 'Margin (%)', 'Share (%)']]
      .concat(itemRows().map(r => [r.name, r.category, r.qty, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1), r.share.toFixed(1)]));
    KK.csv(`kopikita-report-${current.from}-to-${current.to}.csv`, rows);
    KK.toast('Report exported');
  });
  $('btnPrint').addEventListener('click', () => window.print());

  /* ---------- Events ---------- */
  function drawAll() { drawKpis(); drawTrend(); drawTarget(); drawBreakdowns(); drawHeatmap(); drawInsights(); drawItems(); }
  $('preset').addEventListener('change', compute);
  $('compare').addEventListener('change', compute);
  ['dFrom', 'dTo'].forEach(id => $(id).addEventListener('change', () => { $('preset').value = 'custom'; compute(); }));
  compute();
})();