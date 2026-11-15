/* ==========================================================
   Kopi Kita - js/pages/staff.js
   Purpose: Staff management for the admin
     - team list (grid or list view), search and filters
     - add / edit / deactivate / delete staff
     - weekly shift roster: click to change shifts, week
       navigation, copy last week, coverage check per shift
     - payroll estimate from the roster (overtime after 45h)
     - 4 charts and summary cards
   ========================================================== */
(function () {
  if (!KK.session()) return;
  const $ = id => document.getElementById(id);
  const SHIFTS = { M: 'Morning', E: 'Evening', F: 'Full day', O: 'Off', L: 'Leave' };
  const ORDER = ['M', 'E', 'F', 'O', 'L'];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const NORMAL_HOURS = 45;                       // normal hours per week, then overtime x1.5
  const THIS_WEEK = DB.weekStart(APP_TODAY);
  let week = THIS_WEEK;
  let view = 'grid';

  const active = () => DB.staff().filter(s => s.status !== 'Inactive');
  const hoursOf = codes => codes.reduce((t, c) => t + DB.SHIFT_HOURS[c], 0);
  const pay = (s, hours) => {
    const normal = Math.min(hours, NORMAL_HOURS) * s.hourlyRate;
    const ot = Math.max(0, hours - NORMAL_HOURS) * s.hourlyRate * 1.5;
    return { normal, ot, total: normal + ot };
  };
  const weekLabel = w => `${KK.date(w)} - ${KK.date(DB.addDays(w, 6))}`;

  /* ---------- Summary cards ---------- */
  function drawKpis() {
    const team = active();
    const r = DB.roster(THIS_WEEK);
    const todayIdx = DB.dayOfWeek(APP_TODAY);
    const onShift = team.filter(s => ['M', 'E', 'F'].includes((r[s.id] || [])[todayIdx]));
    const stats = team.map(s => ({ s, ...DB.staffStats(s) })).sort((a, b) => b.revenue - a.revenue);
    const payroll = team.reduce((t, s) => t + pay(s, hoursOf(r[s.id] || [])).total, 0);
    const cards = [
      ['Active staff', team.length, 'bi-people', `${DB.staff().length - team.length} inactive`],
      ['On shift today', onShift.length, 'bi-person-check', KK.date(APP_TODAY)],
      ['Avg rating', (team.reduce((t, s) => t + s.rating, 0) / (team.length || 1)).toFixed(2), 'bi-star', 'Customer feedback'],
      ['Top performer', stats[0] ? stats[0].s.name.split(' ')[0] : '-', 'bi-trophy', stats[0] ? KK.rm0(stats[0].revenue) + ' sales' : ''],
      ['Payroll this week', KK.rm0(payroll), 'bi-cash-coin', 'Estimate from roster']
    ];
    $('kpiRow').innerHTML = cards.map(([l, v, i, f], n) => `<div class="col-6 col-md-4 col-xl"><div class="kk-card kpi" role="button" tabindex="0" data-n="${n}">
      <div class="d-flex justify-content-between"><div class="kpi-label">${l}</div><div class="kpi-icon"><i class="bi ${i}"></i></div></div>
      <div class="kpi-value text-truncate">${v}</div><div class="kpi-foot">${f}</div></div></div>`).join('');
    $('kpiRow').onclick = e => {
      const n = +e.target.closest('[data-n]')?.dataset.n;
      if (n === 1) KK.modal({ title: `On shift today (${KK.date(APP_TODAY)})`, size: 'md',
        body: onShift.length ? onShift.map(s => `<div class="list-row"><div class="d-flex align-items-center gap-2">${KK.avatar(s.name, 30)}<div><div class="fw-600">${KK.esc(s.name)}</div><div class="small kk-muted">${s.role}</div></div></div>${shiftChip(r[s.id][todayIdx])}</div>`).join('') : '<p class="kk-muted">Nobody is rostered today.</p>' });
      if (n === 3 && stats[0]) showStaff(stats[0].s.id);
      if (n === 4) showTab('pay');
      if (n === 0) showTab('team');
    };
  }
  const showTab = name => bootstrap.Tab.getOrCreateInstance(document.querySelector(`[data-bs-target="#tab-${name}"]`)).show();
  const shiftChip = c => `<span class="shift ${c} d-inline-block w-auto px-2" style="cursor:default">${SHIFTS[c]}</span>`;

  /* ---------- Charts ---------- */
  function drawCharts() {
    const stats = DB.staff().map(s => ({ s, ...DB.staffStats(s) })).filter(x => x.count).sort((a, b) => b.count - a.count);
    KK.chart('ordersChart', {
      type: 'bar',
      data: { labels: stats.map(x => x.s.name.split(' ')[0]), datasets: [
        { label: 'Orders handled', data: stats.map(x => x.count), backgroundColor: KK.colors[1], borderRadius: 6, yAxisID: 'y' },
        { label: 'Sales (RM)', data: stats.map(x => Math.round(x.revenue)), type: 'line', borderColor: KK.colors[0], pointBackgroundColor: KK.colors[0], tension: .3, yAxisID: 'y1' }] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { x: KK.noGrid, y: { beginAtZero: true }, y1: { ...KK.rmAxis, position: 'right', grid: { display: false } } },
        onClick: (e, els) => els.length && showStaff(stats[els[0].index].s.id) }
    });
    const rc = DB.groupSum(active(), s => s.role);
    const roles = Object.keys(rc);
    KK.chart('roleChart', {
      type: 'doughnut', data: { labels: roles, datasets: [{ data: Object.values(rc), backgroundColor: KK.colors }] },
      options: { cutout: '58%', plugins: { legend: { position: 'bottom' } }, onClick: (e, els) => { if (els.length) { $('sRole').value = roles[els[0].index]; showTab('team'); drawTeam(); } } }
    });
    const r = DB.roster(THIS_WEEK), team = active();
    const hrs = team.map(s => hoursOf(r[s.id] || []));
    KK.chart('hoursChart', {
      type: 'bar',
      data: { labels: team.map(s => s.name.split(' ')[0]), datasets: [{ label: 'Hours', data: hrs, backgroundColor: hrs.map(h => h > NORMAL_HOURS ? '#c08a33' : KK.colors[2]), borderRadius: 6 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => c.raw > NORMAL_HOURS ? `Overtime: ${c.raw - NORMAL_HOURS}h` : '' } } }, scales: { x: KK.noGrid, y: { beginAtZero: true, suggestedMax: 54 } } }
    });
    KK.chart('ratingChart', {
      type: 'bar',
      data: { labels: team.map(s => s.name.split(' ')[0]), datasets: [{ label: 'Rating', data: team.map(s => s.rating), backgroundColor: KK.colors[3], borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: KK.noGrid, y: { min: 3.5, max: 5 } } }
    });
  }

  /* ---------- Team (grid or list) ---------- */
  function filteredTeam() {
    const q = $('sSearch').value.trim().toLowerCase(), r = $('sRole').value, st = $('sStatus').value;
    return DB.staff().filter(s => (!q || (s.name + s.email + s.role).toLowerCase().includes(q)) && (!r || s.role === r) && (!st || (s.status || 'Active') === st));
  }
  function drawTeam() {
    const list = filteredTeam();
    const counts = Object.fromEntries(DB.staff().map(s => [s.id, DB.staffStats(s).count]));
    if (!list.length) { $('teamWrap').innerHTML = '<div class="empty-state"><img src="assets/img/empty.svg" alt=""><div>No staff found.</div></div>'; return; }
    $('teamWrap').innerHTML = view === 'grid'
      ? `<div class="row g-3">${list.map(s => `<div class="col-6 col-md-4 col-xl-3"><div class="kk-card staff-card ${s.status === 'Inactive' ? 'opacity-50' : ''}" role="button" tabindex="0" data-id="${s.id}">
          ${KK.avatar(s.name, 60)}<h3 class="h6 mt-2 mb-0">${KK.esc(s.name)}</h3>
          <div class="small kk-muted mb-2">${s.role} &middot; ${s.shift}</div>
          <div class="d-flex justify-content-center gap-3 small"><span><i class="bi bi-star-fill text-warning"></i> ${s.rating}</span><span><i class="bi bi-receipt kk-muted"></i> ${counts[s.id]}</span><span>${KK.rm(s.hourlyRate)}/h</span></div>
          ${s.status === 'Inactive' ? '<div class="mt-2">' + KK.badge('Inactive', 'cancelled') + '</div>' : ''}</div></div>`).join('')}</div>`
      : `<div class="table-responsive"><table class="table kk-table table-hover mb-0"><thead><tr><th>Staff</th><th>Role</th><th class="d-none d-md-table-cell">Shift</th><th class="d-none d-lg-table-cell">Phone</th><th class="text-end d-none d-sm-table-cell">Rate</th><th class="text-center d-none d-md-table-cell">Orders</th><th>Status</th></tr></thead><tbody>
          ${list.map(s => `<tr class="clickable" data-id="${s.id}"><td><div class="d-flex align-items-center gap-2">${KK.avatar(s.name, 30)}<div><div class="fw-600">${KK.esc(s.name)}</div><div class="small kk-muted d-none d-sm-block">${s.email}</div></div></div></td>
            <td>${s.role}</td><td class="d-none d-md-table-cell">${s.shift}</td><td class="d-none d-lg-table-cell">${s.phone}</td><td class="text-end d-none d-sm-table-cell">${KK.rm(s.hourlyRate)}</td>
            <td class="text-center d-none d-md-table-cell">${counts[s.id]}</td><td>${s.status === 'Inactive' ? KK.badge('Inactive', 'cancelled') : KK.badge('Active', 'completed')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  ['sSearch', 'sRole', 'sStatus'].forEach(id => $(id).addEventListener('input', drawTeam));
  document.querySelectorAll('input[name="sView"]').forEach(r => r.addEventListener('change', () => { view = r.value; drawTeam(); }));
  $('teamWrap').addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) showStaff(c.dataset.id); });
  $('teamWrap').addEventListener('keydown', e => { const c = e.target.closest('[data-id]'); if (c && e.key === 'Enter') showStaff(c.dataset.id); });

  /* ---------- Staff details popup ---------- */
  function showStaff(id) {
    const s = DB.staffById(id); if (!s) return;
    const st = DB.staffStats(s);
    const months = DB.months();
    const per = months.map(m => st.orders.filter(o => DB.monthKey(o.date) === m).length);
    const wk = DB.roster(THIS_WEEK)[s.id];
    const recent = [...st.orders].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5);
    const el = KK.modal({
      title: 'Staff details',
      body: `<div class="d-flex align-items-center gap-3 mb-3">${KK.avatar(s.name, 60)}
          <div><h5 class="mb-0">${KK.esc(s.name)}</h5><div class="kk-muted small">${s.id} &middot; ${s.role} &middot; ${s.status === 'Inactive' ? KK.badge('Inactive', 'cancelled') : KK.badge('Active', 'completed')}</div>
          <div class="small mt-1"><i class="bi bi-star-fill text-warning"></i> ${s.rating} / 5</div></div></div>
        <div class="detail-grid cols-3 mb-3">
          <div><div class="dl">Usual shift</div><div class="dv">${s.shift}</div></div><div><div class="dl">Hours</div><div class="dv">${s.hours}</div></div>
          <div><div class="dl">Joined</div><div class="dv">${KK.date(s.joined)}</div></div>
          <div><div class="dl">Email</div><div class="dv text-break">${s.email}</div></div><div><div class="dl">Phone</div><div class="dv">${s.phone}</div></div>
          <div><div class="dl">Rate</div><div class="dv">${KK.rm(s.hourlyRate)} / hour</div></div></div>
        <div class="row g-2 mb-3">
          <div class="col-4"><div class="mini-stat"><div class="v">${st.count}</div><div class="l">Orders handled</div></div></div>
          <div class="col-4"><div class="mini-stat"><div class="v">${KK.rm0(st.revenue)}</div><div class="l">Sales value</div></div></div>
          <div class="col-4"><div class="mini-stat"><div class="v">${wk ? hoursOf(wk) + 'h' : '-'}</div><div class="l">Hours this week</div></div></div></div>
        ${wk ? `<div class="fw-600 mb-2">This week's shifts</div><div class="d-flex flex-wrap gap-1 mb-3">${wk.map((c, i) => `<div class="text-center"><div class="small kk-muted">${DAYS[i]}</div>${shiftChip(c)}</div>`).join('')}</div>` : ''}
        ${st.count ? `<div class="fw-600 mb-2">Orders per month</div><div class="chart-box sm mb-3"><canvas id="stChart"></canvas></div>
          <div class="fw-600 mb-2">Latest orders</div>${recent.map(o => `<div class="list-row clickable" role="button" data-o="${o.id}"><span class="fw-600">${o.id}</span><span class="kk-muted small">${KK.date(o.date)}</span><span>${KK.rm(DB.orderTotal(o))}</span></div>`).join('')}`
          : '<p class="kk-muted small mb-0">This staff member does not take orders at the counter.</p>'}`,
      footer: `<button class="btn btn-light text-danger me-auto" data-a="delete"><i class="bi bi-trash me-1"></i>Delete</button>
        <button class="btn btn-light" data-a="status">${s.status === 'Inactive' ? '<i class="bi bi-person-check me-1"></i>Activate' : '<i class="bi bi-person-dash me-1"></i>Deactivate'}</button>
        <button class="btn btn-primary" data-a="edit"><i class="bi bi-pencil me-1"></i>Edit</button>`,
      onShown: el => st.count && KK.chart(el.querySelector('#stChart'), {
        type: 'line', data: { labels: months.map(DB.monthName), datasets: [{ label: 'Orders', data: per, borderColor: KK.colors[0], backgroundColor: 'rgba(122,82,53,.08)', fill: true, tension: .35 }] },
        options: { plugins: { legend: { display: false } }, scales: { x: KK.noGrid, y: { beginAtZero: true, ticks: { precision: 0 } } } }
      })
    });
    el.querySelectorAll('[data-o]').forEach(r => r.addEventListener('click', () => {
      el.addEventListener('hidden.bs.modal', () => KK.showOrder(r.dataset.o), { once: true }); el._modal.hide();
    }));
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      el.addEventListener('hidden.bs.modal', () => {
        if (b.dataset.a === 'edit') staffForm(id);
        if (b.dataset.a === 'status') { const to = s.status === 'Inactive' ? 'Active' : 'Inactive'; DB.updateStaff(id, { status: to }); KK.toast(`${KK.esc(s.name)} is now ${to}`); refresh(); }
        if (b.dataset.a === 'delete') deleteStaff(id);
      }, { once: true });
      el._modal.hide();
    }));
  }

  /* ---------- Add / edit staff ---------- */
  function staffForm(id) {
    const s = id ? DB.staffById(id) : null;
    const v = (k, d = '') => s ? KK.esc(s[k]) : d;
    const roles = ['Manager', 'Barista', 'Cashier', 'Kitchen', 'Part-timer'];
    const shifts = [['Morning', '07:00-15:00'], ['Evening', '14:00-22:00'], ['Full day', '08:00-17:00'], ['Weekend', '10:00-18:00']];
    const el = KK.modal({
      title: s ? `Edit ${KK.esc(s.name)}` : 'Add staff',
      body: `<form id="sfForm" novalidate><div class="row g-3">
          <div class="col-md-6"><label class="form-label" for="sfName">Full name</label><input class="form-control" id="sfName" value="${v('name')}" required minlength="3" maxlength="50" pattern="[A-Za-z@'.\\s\\/\\-]+"><div class="invalid-feedback">Letters only, at least 3.</div></div>
          <div class="col-md-6"><label class="form-label" for="sfRole">Role</label><select class="form-select" id="sfRole" required><option value="">Choose...</option>${roles.map(r => `<option ${s && s.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select><div class="invalid-feedback">Choose a role.</div></div>
          <div class="col-md-6"><label class="form-label" for="sfEmail">Email</label><input type="email" class="form-control" id="sfEmail" value="${v('email')}" required><div class="invalid-feedback" id="sfEmailMsg">Enter a valid email.</div></div>
          <div class="col-md-6"><label class="form-label" for="sfPhone">Phone</label><input class="form-control" id="sfPhone" value="${v('phone')}" required pattern="^0[0-9]{1,2}-?[0-9]{3,4} ?[0-9]{4}$" placeholder="012-345 6789"><div class="invalid-feedback">Example: 012-345 6789</div></div>
          <div class="col-md-4"><label class="form-label" for="sfShift">Usual shift</label><select class="form-select" id="sfShift">${shifts.map(([n]) => `<option ${s && s.shift === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="col-6 col-md-4"><label class="form-label" for="sfRate">Rate (RM / hour)</label><input type="number" class="form-control" id="sfRate" min="7.21" max="100" step="0.01" value="${v('hourlyRate', '10')}" required><div class="invalid-feedback">At least RM7.21 (minimum wage).</div></div>
          <div class="col-6 col-md-4"><label class="form-label" for="sfJoined">Date joined</label><input type="date" class="form-control" id="sfJoined" value="${v('joined', APP_TODAY)}" max="${APP_TODAY}" required><div class="invalid-feedback">Not in the future.</div></div>
        </div></form>`,
      footer: `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="sfSave">${s ? 'Save changes' : 'Add staff'}</button>`
    });
    el.querySelector('#sfSave').addEventListener('click', () => {
      const g = x => el.querySelector('#' + x), f = el.querySelector('#sfForm');
      const email = g('sfEmail').value.trim().toLowerCase();
      const dup = DB.staff().some(x => x.email.toLowerCase() === email && x.id !== id);
      g('sfEmail').setCustomValidity(dup ? 'dup' : ''); g('sfEmailMsg').textContent = dup ? 'Another staff member uses this email.' : 'Enter a valid email.';
      f.classList.add('was-validated');
      if (!f.checkValidity()) return;
      const shift = g('sfShift').value;
      const data = { name: g('sfName').value.trim(), role: g('sfRole').value, email, phone: g('sfPhone').value.trim(), shift,
        hours: shifts.find(([n]) => n === shift)[1], hourlyRate: +g('sfRate').value, joined: g('sfJoined').value };
      if (s) { DB.updateStaff(id, data); KK.toast(`${KK.esc(data.name)} updated`); }
      else { DB.addStaff({ ...data, rating: 4.5, status: 'Active' }); KK.toast(`${KK.esc(data.name)} added to the team`); }
      el._modal.hide(); refresh();
    });
  }
  $('btnAddStaff').addEventListener('click', () => staffForm(null));

  function deleteStaff(id) {
    const s = DB.staffById(id), n = DB.staffStats(s).count;
    if (n) {
      const el = KK.modal({ title: 'Cannot delete', size: 'sm',
        body: `<p class="mb-0"><strong>${KK.esc(s.name)}</strong> has handled ${n} orders, so the record must be kept. You can deactivate this staff member instead.</p>`,
        footer: `<button class="btn btn-light" data-bs-dismiss="modal">Close</button>${s.status !== 'Inactive' ? '<button class="btn btn-primary" id="deact">Deactivate</button>' : ''}` });
      el.querySelector('#deact')?.addEventListener('click', () => { DB.updateStaff(id, { status: 'Inactive' }); el._modal.hide(); KK.toast(`${KK.esc(s.name)} deactivated`); refresh(); });
      return;
    }
    const el = KK.modal({ title: 'Delete staff?', size: 'sm', body: `<p class="mb-0">Delete <strong>${KK.esc(s.name)}</strong>? This cannot be undone.</p>`,
      footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-danger" id="delYes">Delete</button>' });
    el.querySelector('#delYes').addEventListener('click', () => { DB.deleteStaff(id); el._modal.hide(); KK.toast(`${KK.esc(s.name)} deleted`); refresh(); });
  }

  /* ---------- Weekly roster ---------- */
  $('shiftLegend').innerHTML = ORDER.map(c => `<span class="shift ${c} d-inline-block w-auto px-2" style="cursor:default">${c} = ${SHIFTS[c]} (${DB.SHIFT_HOURS[c]}h)</span>`).join('');
  function drawRoster() {
    const r = DB.roster(week);
    const team = active();
    const todayIdx = week === THIS_WEEK ? DB.dayOfWeek(APP_TODAY) : -1;
    $('wkLabel').textContent = weekLabel(week) + (week === THIS_WEEK ? ' (this week)' : '');
    const head = `<thead><tr><th>Staff</th>${DAYS.map((d, i) => `<th class="${i === todayIdx ? 'today-col' : ''}">${d}<div class="small kk-muted fw-normal">${+DB.addDays(week, i).slice(8)}</div></th>`).join('')}<th>Hours</th></tr></thead>`;
    const body = team.map(s => {
      const codes = r[s.id];
      const h = hoursOf(codes);
      return `<tr><td><div class="d-flex align-items-center gap-2">${KK.avatar(s.name, 28)}<div class="lh-sm"><div class="fw-600 small">${KK.esc(s.name)}</div><div class="small-2 kk-muted">${s.role}</div></div></div></td>
        ${codes.map((c, i) => `<td class="${i === todayIdx ? 'today-col' : ''}"><button class="shift ${c}" data-s="${s.id}" data-d="${i}" title="${SHIFTS[c]} - click to change" aria-label="${KK.esc(s.name)} ${DAYS[i]}: ${SHIFTS[c]}">${c}</button></td>`).join('')}
        <td class="fw-600 ${h > NORMAL_HOURS ? 'text-warning' : ''}">${h}h</td></tr>`;
    }).join('');
    const cover = (codes, set) => team.filter(s => set.includes(r[s.id][codes])).length;
    const foot = ['Morning', 'Evening'].map(name => {
      const set = name === 'Morning' ? ['M', 'F'] : ['E', 'F'];
      return `<tr><td class="small fw-600">${name} cover</td>${DAYS.map((_, i) => { const n = cover(i, set); return `<td class="${n < 2 ? 'cover-low' : 'cover-ok'}">${n}${n < 2 ? ' <i class="bi bi-exclamation-triangle"></i>' : ''}</td>`; }).join('')}<td></td></tr>`;
    }).join('');
    $('rosterTable').innerHTML = head + `<tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
  }
  $('rosterTable').addEventListener('click', e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const r = DB.roster(week);
    const codes = r[b.dataset.s];
    codes[+b.dataset.d] = ORDER[(ORDER.indexOf(codes[+b.dataset.d]) + 1) % ORDER.length];
    DB.saveRoster(week, r);
    drawRoster(); drawPayroll(); if (week === THIS_WEEK) { drawKpis(); drawCharts(); }
  });
  $('wkPrev').addEventListener('click', () => { week = DB.addDays(week, -7); drawRoster(); drawPayroll(); });
  $('wkNext').addEventListener('click', () => { week = DB.addDays(week, 7); drawRoster(); drawPayroll(); });
  $('wkThis').addEventListener('click', () => { week = THIS_WEEK; drawRoster(); drawPayroll(); });
  $('wkCopy').addEventListener('click', () => {
    DB.saveRoster(week, DB.roster(DB.addDays(week, -7)));
    KK.toast('Copied last week\'s shifts'); refresh();
  });
  $('wkReset').addEventListener('click', () => {
    const r = {}; active().forEach(s => { r[s.id] = DB.defaultWeek(s); });
    DB.saveRoster(week, r); KK.toast('Default shifts restored', 'info'); refresh();
  });

  /* ---------- Payroll (for the week shown in the roster) ---------- */
  function payRows() {
    const r = DB.roster(week);
    return active().map(s => { const h = hoursOf(r[s.id]); return { s, h, ...pay(s, h) }; });
  }
  function drawPayroll() {
    const rows = payRows();
    $('payNote').innerHTML = `<i class="bi bi-info-circle me-1"></i>Week <strong>${weekLabel(week)}</strong> (from the roster). Normal hours up to ${NORMAL_HOURS}h per week; extra hours are paid 1.5x. Estimate only.`;
    $('payBody').innerHTML = rows.map(x => `<tr class="clickable" data-id="${x.s.id}"><td><div class="d-flex align-items-center gap-2">${KK.avatar(x.s.name, 28)}<span class="fw-600">${KK.esc(x.s.name)}</span></div></td>
      <td class="d-none d-sm-table-cell">${x.s.role}</td><td class="text-end">${KK.rm(x.s.hourlyRate)}</td><td class="text-end ${x.h > NORMAL_HOURS ? 'text-warning fw-600' : ''}">${x.h}h</td>
      <td class="text-end d-none d-md-table-cell">${KK.rm(x.normal)}</td><td class="text-end d-none d-md-table-cell">${x.ot ? KK.rm(x.ot) : '-'}</td><td class="text-end fw-600">${KK.rm(x.total)}</td></tr>`).join('');
    const sum = k => rows.reduce((t, x) => t + x[k], 0);
    $('payFoot').innerHTML = `<tr class="fw-bold"><td>Total (${rows.length} staff)</td><td class="d-none d-sm-table-cell"></td><td></td><td class="text-end">${sum('h')}h</td>
      <td class="text-end d-none d-md-table-cell">${KK.rm(sum('normal'))}</td><td class="text-end d-none d-md-table-cell">${KK.rm(sum('ot'))}</td><td class="text-end text-accent">${KK.rm(sum('total'))}</td></tr>`;
  }
  $('payBody').addEventListener('click', e => { const tr = e.target.closest('[data-id]'); if (tr) showStaff(tr.dataset.id); });
  $('btnPayExport').addEventListener('click', () => {
    KK.csv(`kopikita-payroll-${week}.csv`, [['Week starting', 'Staff ID', 'Name', 'Role', 'Rate (RM/h)', 'Hours', 'Normal pay (RM)', 'Overtime (RM)', 'Total (RM)']]
      .concat(payRows().map(x => [week, x.s.id, x.s.name, x.s.role, x.s.hourlyRate.toFixed(2), x.h, x.normal.toFixed(2), x.ot.toFixed(2), x.total.toFixed(2)])));
    KK.toast('Payroll exported');
  });

  /* ---------- Start ---------- */
  function fillRoles() {
    const cur = $('sRole').value;
    $('sRole').innerHTML = '<option value="">All roles</option>' + [...new Set(DB.staff().map(s => s.role))].map(r => `<option>${r}</option>`).join('');
    $('sRole').value = cur;
  }
  function refresh() { fillRoles(); drawKpis(); drawCharts(); drawTeam(); drawRoster(); drawPayroll(); }
  refresh();
})();
