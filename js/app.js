/* ==========================================================
   Kopi Kita - js/app.js
   Purpose: Shared code used by EVERY page
     1. Settings (student details shown in the footer)
     2. Admin login / logout (hardcoded, one admin account)
     3. Page guard (blocks pages if not logged in)
     4. Shared sidebar navigation, top bar and footer
     5. Popup (modal), toast, chart, table and format helpers
   ========================================================== */

const KK = {};

/* ---------- 1. Settings - CHANGE THESE TO YOUR OWN DETAILS ---------- */
KK.config = {
  appName: 'Kopi Kita',
  tagline: 'Cafe Ordering & Sales System',
  slogan: 'Di setiap hirupan, ada cerita kita',
  version: '1.0.0',
  studentName: 'Nur Damia Izzati Binti Hassan',
  studentId: '2025124987',
  course: 'CDIM262',
  subject: 'IMS566 Advanced Web Design Development and Content Management',
  university: 'UiTM Puncak Perdana',
  github: 'https://github.com/nurdamia123/Kopi-Kita'
};

/* ---------- 2. Authentication (hardcoded, no database) ---------- */
/* Admin-only system: ONE account with a set password. There is no register page.
   The password can be changed later in Account settings (saved in this browser). */
const ADMIN_ACCOUNT = {
  username: 'Damia',
  password: 'Kopikita123',
  name: 'Admin Kopi Kita',
  role: 'Administrator',
  email: 'admin@kopikita.my',
  phone: '03-3258 0566'
};

KK.admin = () => ({ ...ADMIN_ACCOUNT, ...DB.load('kk_admin_edits', {}) });
KK.findUser = username => {
  const a = KK.admin();
  return a.username.toLowerCase() === String(username).trim().toLowerCase() ? a : null;
};
KK.updateUser = function (username, changes) {
  DB.save('kk_admin_edits', { ...DB.load('kk_admin_edits', {}), ...changes });
  const s = KK.session();
  if (s) KK.saveSession({ ...s, ...changes }, !!localStorage.getItem('kk_session'));
};

/* Lock the login for 30 seconds after 5 wrong passwords */
KK.LOCK_AFTER = 5;
KK.LOCK_SECONDS = 30;
KK.lockInfo = () => DB.load('kk_login_lock', { fails: 0, until: 0 });
KK.lockedFor = () => Math.max(0, Math.ceil((KK.lockInfo().until - Date.now()) / 1000));

KK.login = function (username, password, remember) {
  if (KK.lockedFor() > 0) return { locked: true };
  const u = KK.findUser(username);
  if (!u || u.password !== password) {
    const info = KK.lockInfo();
    info.fails = (info.fails || 0) + 1;
    if (info.fails >= KK.LOCK_AFTER) { info.until = Date.now() + KK.LOCK_SECONDS * 1000; info.fails = 0; }
    DB.save('kk_login_lock', info);
    return { error: true, left: KK.LOCK_AFTER - info.fails };
  }
  DB.save('kk_login_lock', { fails: 0, until: 0 });
  const session = { username: u.username, name: u.name, role: u.role, email: u.email, loginAt: new Date().toISOString() };
  KK.saveSession(session, remember);
  const log = DB.load('kk_login_log', []);
  log.unshift({ at: session.loginAt, device: /Mobi/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop' });
  DB.save('kk_login_log', log.slice(0, 20));
  sessionStorage.removeItem('kk_welcome_seen');
  return { ok: true, session };
};
KK.saveSession = function (s, remember) {
  const { password, ...safe } = s;              // never keep the password in the session
  (remember ? localStorage : sessionStorage).setItem('kk_session', JSON.stringify(safe));
};
KK.session = function () {
  try { return JSON.parse(sessionStorage.getItem('kk_session') || localStorage.getItem('kk_session')); }
  catch (e) { return null; }
};
KK.logout = function () {
  sessionStorage.removeItem('kk_session');
  localStorage.removeItem('kk_session');
  window.location.href = 'index.html';
};
KK.confirmLogout = function () {
  KK.modal({
    title: 'Log out?',
    size: 'sm',
    body: '<p class="mb-0">You will need to sign in again to use Kopi Kita.</p>',
    footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" onclick="KK.logout()">Log out</button>'
  });
};

/* ---------- 3. Page guard ---------- */
(function guard() {
  const protectedPage = document.body.hasAttribute('data-protected');
  const authPage = document.body.hasAttribute('data-auth');
  if (protectedPage && !KK.session()) { window.location.replace('index.html'); return; }
  if (authPage && KK.session()) { window.location.replace('dashboard.html'); }
})();

/* ---------- 4. Formatting helpers ---------- */
KK.rm = n => 'RM ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
KK.rm0 = n => 'RM ' + Math.round(n).toLocaleString('en-MY');
KK.num = n => Number(n).toLocaleString('en-MY');
KK.date = iso => {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
KK.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
KK.badge = (text, cls) => `<span class="kk-badge b-${cls || String(text).toLowerCase().replace(/\s+/g, '-')}">${KK.esc(text)}</span>`;
/* Picture for a menu item: its own SVG if it has one, otherwise the category picture */
KK.menuImg = item => 'assets/img/' + (item.img || 'menu-' + item.category.toLowerCase().replace(/\s+/g, '-')) + '.svg';

/* Avatar = small SVG circle with initials (so no photo files are needed) */
KK.avatar = function (name, size = 36) {
  const initials = String(name).split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const tones = [['#f3ece6', '#7a5235'], ['#e8f1e9', '#3f6b46'], ['#e9eef6', '#3c5a85'], ['#f8eed7', '#85651b'], ['#efe9f5', '#5d4585']];
  const [bg, fg] = tones[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  return `<svg class="kk-avatar" width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${KK.esc(name)}">
    <circle cx="20" cy="20" r="20" fill="${bg}"/>
    <text x="20" y="25" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="600" fill="${fg}">${initials}</text></svg>`;
};

/* ---------- 4b. Light / dark mode ---------- */
/* The <head> of every page sets data-bs-theme before the page draws, so there is no white flash.
   Bootstrap 5.3 switches its own colours with data-bs-theme; css/style.css switches ours. */
KK.theme = () => document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
KK.setTheme = function (mode) {
  document.documentElement.setAttribute('data-bs-theme', mode);
  try { localStorage.setItem('kk_theme', mode); } catch (e) { /* storage blocked: theme lasts for this page only */ }
  document.querySelectorAll('.kk-theme-btn i').forEach(i => { i.className = 'bi ' + (mode === 'dark' ? 'bi-sun' : 'bi-moon-stars'); });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#1a1411' : '#7a5235');
  KK.restyleCharts && KK.restyleCharts();
};
KK.toggleTheme = () => KK.setTheme(KK.theme() === 'dark' ? 'light' : 'dark');

/* ---------- 5. Shared layout: sidebar, top bar, footer ---------- */
KK.navItems = [
  { group: 'Main' },
  { key: 'dashboard', href: 'dashboard.html', icon: 'bi-grid', label: 'Dashboard' },
  { key: 'orders', href: 'orders.html', icon: 'bi-receipt', label: 'Orders' },
  { key: 'menu', href: 'menu.html', icon: 'bi-cup-hot', label: 'Menu' },
  { key: 'customers', href: 'customers.html', icon: 'bi-people', label: 'Customers' },
  { group: 'Management' },
  { key: 'inventory', href: 'inventory.html', icon: 'bi-box-seam', label: 'Inventory' },
  { key: 'staff', href: 'staff.html', icon: 'bi-person-badge', label: 'Staff & Roster' },
  { key: 'reports', href: 'reports.html', icon: 'bi-graph-up-arrow', label: 'Reports' }
];

KK.renderShell = function () {
  const page = document.body.dataset.page;
  const user = KK.session();

  /* Sidebar - on mobile it becomes a slide-in menu (Bootstrap offcanvas) */
  const side = document.getElementById('kk-sidebar');
  if (side && user) {
    const links = KK.navItems.map(n => n.group
      ? `<div class="kk-nav-label">${n.group}</div>`
      : `<a class="nav-link ${n.key === page ? 'active' : ''}" href="${n.href}" ${n.key === page ? 'aria-current="page"' : ''}>
           <i class="bi ${n.icon}"></i><span>${n.label}</span></a>`).join('');
    side.outerHTML = `
    <aside class="kk-sidebar offcanvas-lg offcanvas-start" tabindex="-1" id="sidebarMenu" aria-label="Main navigation">
      <div class="offcanvas-header border-bottom">
        <a class="kk-brand" href="dashboard.html"><img src="brand/kopikita_mark_light.svg" alt="Kopi Kita logo">Kopi Kita</a>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" data-bs-target="#sidebarMenu" aria-label="Close"></button>
      </div>
      <div class="d-none d-lg-flex px-3 py-3 border-bottom">
        <a class="kk-brand" href="dashboard.html"><img src="brand/kopikita_mark_light.svg" alt="Kopi Kita logo">Kopi Kita</a>
      </div>
      <div class="offcanvas-body d-flex flex-column p-3">
        <nav class="kk-nav nav flex-column">${links}</nav>
        <div class="mt-auto pt-3">
          <div class="kk-side-user d-flex align-items-center gap-2 p-2 rounded-3">
            ${KK.avatar(user.name, 34)}
            <div class="lh-sm overflow-hidden"><div class="fw-600 text-truncate kk-side-name">${KK.esc(user.name)}</div><div class="small-2 kk-side-role">${KK.esc(user.role)}</div></div>
          </div>
          <button class="btn kk-side-logout w-100 mt-2" onclick="KK.confirmLogout()"><i class="bi bi-box-arrow-right me-1"></i>Log out</button>
        </div>
      </div>
    </aside>`;
  }

  /* Top bar */
  const top = document.getElementById('kk-topbar');
  if (top && user) {
    const today = KK.date(APP_TODAY);
    top.outerHTML = `
    <header class="kk-topbar">
      <div class="d-flex align-items-center gap-2 px-3 px-sm-4 py-2" style="min-height:60px">
        <button class="btn kk-top-btn d-lg-none" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebarMenu" aria-controls="sidebarMenu" aria-label="Open menu">
          <i class="bi bi-list fs-5"></i></button>
        <a class="kk-brand d-lg-none" href="dashboard.html"><img src="brand/kopikita_mark.svg" alt="Kopi Kita logo"><span class="d-none d-sm-inline">Kopi Kita</span></a>
        <div class="ms-auto d-flex align-items-center gap-2">
          <span class="kk-date d-none d-md-inline-flex"><i class="bi bi-calendar3"></i>${today}</span>
          <div class="dropdown">
            <button class="btn kk-top-btn position-relative" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label="Notifications" title="Notifications">
              <i class="bi bi-bell"></i><span class="kk-notif-badge d-none" id="kkNotifBadge"></span></button>
            <div class="dropdown-menu dropdown-menu-end kk-notif-menu p-0" id="kkNotifMenu"></div>
          </div>
          <button class="btn kk-top-btn kk-fs-btn ${KK.canFullscreen() ? '' : 'd-none'}" type="button" onclick="KK.toggleFullscreen()" aria-label="Full screen" title="Full screen">
            <i class="bi ${document.fullscreenElement ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}"></i></button>
          <button class="btn kk-top-btn kk-theme-btn" type="button" onclick="KK.toggleTheme()" aria-label="Switch light or dark mode" title="Light / dark mode">
            <i class="bi ${KK.theme() === 'dark' ? 'bi-sun' : 'bi-moon-stars'}"></i></button>
          <div class="dropdown">
            <button class="btn kk-top-btn kk-user-btn d-flex align-items-center gap-2 py-1 px-2" data-bs-toggle="dropdown" aria-expanded="false">
              ${KK.avatar(user.name, 28)}<span class="d-none d-sm-inline small fw-600">${KK.esc(user.name.split(' ')[0])}</span><i class="bi bi-chevron-down small"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end kk-user-menu">
              <li><h6 class="dropdown-header">${KK.esc(user.email || user.username)}</h6></li>
              <li><span class="dropdown-item-text small kk-muted"><i class="bi bi-shield-lock me-2"></i>${KK.esc(user.role)}</span></li>
              <li><button class="dropdown-item" onclick="KK.showSettings()"><i class="bi bi-gear me-2"></i>Account settings</button></li>
              <li><button class="dropdown-item" onclick="KK.showSettings('data')"><i class="bi bi-database me-2"></i>Backup &amp; reset data</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger" onclick="KK.confirmLogout()"><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li>
            </ul>
          </div>
        </div>
      </div>
    </header>`;
  }

  /* Footer (used on every page, including the login page) */
  const foot = document.getElementById('kk-footer');
  if (foot) {
    const c = KK.config;
    const links = user
      ? KK.navItems.filter(n => n.key)
          .map(n => `<li><a href="${n.href}">${n.label}</a></li>`).join('')
      : '<li><a href="index.html">Admin login</a></li>';
    foot.outerHTML = `
    <footer class="kk-footer" role="contentinfo">
      <div class="row g-4">
        <div class="col-md-5">
          <img src="brand/kopikita_logo.svg" alt="Kopi Kita logo" style="height:96px;width:auto" class="mb-2">
          <p class="mb-0">${c.tagline}. An admin system to monitor orders and manage the menu, customers, stock, staff and reports.</p>
        </div>
        <div class="col-6 col-md-3">
          <div class="fw-600 kk-foot-title mb-2">Quick links</div>
          <ul class="list-unstyled mb-0 d-grid gap-1">${links}</ul>
        </div>
        <div class="col-6 col-md-4">
          <div class="fw-600 kk-foot-title mb-2">Contact</div>
          <ul class="list-unstyled mb-0 d-grid gap-1">
            <li><i class="bi bi-geo-alt me-1"></i>No. 8, Jalan Kenari 2/1, Seksyen 7, 40000 Shah Alam, Selangor</li>
            <li><i class="bi bi-envelope me-1"></i><a href="mailto:hello@kopikita.my">hello@kopikita.my</a></li>
            <li><i class="bi bi-clock me-1"></i>Daily, 7:00 am - 10:00 pm</li>
          </ul>
        </div>
      </div>
      <hr class="my-3">
      <div class="d-flex flex-column flex-md-row justify-content-between gap-2">
        <div>&copy; 2026 <strong>${c.appName}</strong> &middot; v${c.version} &middot; Prototype for academic purposes, sample data only.</div>
        <div>Developed by <strong>${KK.esc(c.studentName)}</strong> (${c.studentId}) &middot; ${c.course} &middot; IMS566 &middot; ${c.university}
          &middot; <a href="${c.github}" target="_blank" rel="noopener"><i class="bi bi-github"></i> GitHub</a></div>
      </div>
    </footer>`;
  }
  if (top && user) KK.renderNotifs();
  document.body.classList.add('ready');
};

/* ---------- 5b. Notifications (bell icon in the top bar) ---------- */
/* Built live from the data, so they always match what is in the system.
   Each notification has an id that includes today's date; ids the admin has
   read are kept in localStorage (kk_notif_read) so the red badge goes away. */
KK.notifications = function () {
  const list = [];
  const today = APP_TODAY;

  /* 1. Ingredients below their reorder level */
  const low = DB.inventory().filter(i => i.stock < i.reorder);
  low.forEach(i => list.push({
    id: `low-${i.id}-${today}`, icon: 'bi-exclamation-triangle', tone: 'danger',
    title: `Low stock: ${i.name}`,
    text: `Only ${i.stock} ${i.unit} left (reorder at ${i.reorder} ${i.unit}).`,
    href: 'inventory.html'
  }));

  /* 2. Purchase orders that are late */
  DB.purchaseOrders().filter(p => p.status === 'Pending' && p.expected < today).forEach(p => {
    const late = Math.round((Date.parse(today) - Date.parse(p.expected)) / 864e5);
    list.push({
      id: `po-${p.id}-${today}`, icon: 'bi-truck', tone: 'warning',
      title: `${p.id} is ${late} day${late > 1 ? 's' : ''} late`,
      text: `From ${p.supplier}, expected ${KK.date(p.expected)}.`,
      href: 'inventory.html'
    });
  });

  /* 3. Today's sales so far */
  const todays = DB.paidOrders().filter(o => o.date === today);
  const sales = todays.reduce((s, o) => s + DB.orderTotal(o), 0);
  list.push({
    id: `today-${today}-${todays.length}`, icon: 'bi-receipt', tone: 'info',
    title: `${todays.length} order${todays.length === 1 ? '' : 's'} today`,
    text: todays.length ? `Sales so far: ${KK.rm(sales)}.` : 'No orders recorded yet today.',
    href: 'orders.html'
  });

  /* 4. Progress towards this month's sales target */
  const month = today.slice(0, 7);
  const target = DB.targets()[month] || 0;
  if (target) {
    const done = DB.paidOrders().filter(o => o.date.slice(0, 7) === month).reduce((s, o) => s + DB.orderTotal(o), 0);
    const pct = Math.round(done / target * 100);
    list.push({
      id: `target-${month}-${pct >= 100 ? 'hit' : Math.floor(pct / 25)}`,
      icon: pct >= 100 ? 'bi-trophy' : 'bi-bullseye', tone: pct >= 100 ? 'success' : 'info',
      title: pct >= 100 ? 'Monthly target reached!' : `${pct}% of monthly target`,
      text: `${KK.rm(done)} of ${KK.rm(target)} for ${DB.monthName(month)}.`,
      href: 'reports.html'
    });
  }
  return list;
};

KK.notifRead = () => { try { return JSON.parse(localStorage.getItem('kk_notif_read')) || []; } catch (e) { return []; } };
KK.setNotifRead = ids => { try { localStorage.setItem('kk_notif_read', JSON.stringify(ids.slice(-300))); } catch (e) { /* ignore */ } };

KK.renderNotifs = function () {
  const menu = document.getElementById('kkNotifMenu');
  const badge = document.getElementById('kkNotifBadge');
  if (!menu || !badge) return;
  const list = KK.notifications();
  const read = new Set(KK.notifRead());
  const unread = list.filter(n => !read.has(n.id)).length;

  badge.textContent = unread > 9 ? '9+' : unread;
  badge.classList.toggle('d-none', unread === 0);

  menu.innerHTML = `
    <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
      <span class="fw-600">Notifications</span>
      ${unread ? `<button class="btn btn-link btn-sm p-0 text-decoration-none kk-notif-markall" onclick="KK.markAllNotifs()">Mark all as read</button>` : '<span class="small kk-muted">All caught up</span>'}
    </div>
    <div class="kk-notif-list">
      ${list.map(n => `
        <a class="kk-notif-item ${read.has(n.id) ? '' : 'unread'}" href="${n.href}" onclick="KK.readNotif('${n.id}')">
          <span class="kk-notif-icon text-${n.tone} bg-${n.tone}-subtle"><i class="bi ${n.icon}"></i></span>
          <span class="flex-grow-1 lh-sm"><span class="d-block fw-600 small">${KK.esc(n.title)}</span>
            <span class="d-block small-2 kk-muted mt-1">${KK.esc(n.text)}</span></span>
          ${read.has(n.id) ? '' : '<span class="kk-notif-dot" aria-label="Unread"></span>'}
        </a>`).join('')}
    </div>`;
};
KK.readNotif = id => { KK.setNotifRead([...new Set([...KK.notifRead(), id])]); };
KK.markAllNotifs = () => { KK.setNotifRead([...new Set([...KK.notifRead(), ...KK.notifications().map(n => n.id)])]); KK.renderNotifs(); };

/* ---------- 5c. Full screen ---------- */
/* Uses the browser Fullscreen API. Press Esc (or the button again) to leave.
   iPhones do not support full screen for web pages, so the button is hidden there. */
KK.canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
KK.toggleFullscreen = function () {
  const el = document.documentElement;
  const isFull = document.fullscreenElement || document.webkitFullscreenElement;
  if (!isFull) (el.requestFullscreen || el.webkitRequestFullscreen).call(el)?.catch?.(() => KK.toast('Full screen is not allowed here.', 'danger'));
  else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
};
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.querySelectorAll('.kk-fs-btn i').forEach(i => { i.className = 'bi ' + (on ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'); });
  document.querySelectorAll('.kk-fs-btn').forEach(b => b.title = on ? 'Exit full screen' : 'Full screen');
}));

/* ---------- 6. Popup (modal) helper ---------- */
/* KK.modal({ title, body, footer, size: 'sm'|'lg'|'xl', onShown(el) })
   - On phones the popup opens full screen so it is easy to read. */
KK.modal = function ({ title, body, footer = '', size = 'lg', onShown } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal fade';
  wrap.tabIndex = -1;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <div class="modal-dialog modal-${size} modal-dialog-centered modal-dialog-scrollable ${size !== 'sm' ? 'modal-fullscreen-sm-down' : ''}">
      <div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">${title}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const m = new bootstrap.Modal(wrap);
  wrap.addEventListener('shown.bs.modal', () => onShown && onShown(wrap));
  wrap.addEventListener('hidden.bs.modal', () => {
    /* clean up charts inside the popup, then remove it */
    wrap.querySelectorAll('canvas').forEach(c => { const ch = window.Chart && Chart.getChart(c); if (ch) ch.destroy(); });
    m.dispose(); wrap.remove();
  });
  m.show();
  wrap._modal = m;
  return wrap;
};

/* ---------- 7. Toast (small message at the corner) ---------- */
KK.toast = function (msg, type = 'success') {
  let box = document.querySelector('.toast-container');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(box);
  }
  const icon = { success: 'bi-check-circle text-success', error: 'bi-x-circle text-danger', info: 'bi-info-circle text-accent' }[type];
  const t = document.createElement('div');
  t.className = 'toast align-items-center border';
  t.setAttribute('role', 'status');
  t.innerHTML = `<div class="d-flex"><div class="toast-body"><i class="bi ${icon} me-2"></i>${msg}</div>
    <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  box.appendChild(t);
  const bt = new bootstrap.Toast(t, { delay: 3000 });
  t.addEventListener('hidden.bs.toast', () => t.remove());
  bt.show();
};

/* ---------- 8. Chart helper (Chart.js) ---------- */
KK.colors = ['#7a5235', '#b08968', '#ddb892', '#5f8a66', '#a3b18a', '#9c8f86', '#c08a33', '#d6ccc2'];
/* Text, grid and slice-border colours for the current theme */
KK.chartTheme = () => KK.theme() === 'dark'
  ? { text: '#b3a69b', grid: 'rgba(255,255,255,.08)', surface: '#241c17' }
  : { text: '#857c75', grid: '#f1eeea', surface: '#ffffff' };
const ROUND_CHARTS = ['pie', 'doughnut', 'polarArea'];
KK.chart = function (canvas, config) {
  if (!window.Chart) return null;
  const el = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  const old = Chart.getChart(el); if (old) old.destroy();
  const t = KK.chartTheme();
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = t.text;
  Chart.defaults.borderColor = t.grid;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = '#2a2522';
  Chart.defaults.plugins.tooltip.padding = 10;
  /* pie / doughnut slices get a border in the card colour (white or dark) */
  if (ROUND_CHARTS.includes(config.type)) config.data.datasets.forEach(d => { d.borderColor = t.surface; d.borderWidth = 2; });
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
  return new Chart(el, config);
};
/* Re-colour every chart on the page after the theme changes (no page reload needed) */
KK.restyleCharts = function () {
  if (!window.Chart) return;
  const t = KK.chartTheme();
  Chart.defaults.color = t.text;
  Chart.defaults.borderColor = t.grid;
  Object.values(Chart.instances).forEach(ch => {
    Object.values(ch.options.scales || {}).forEach(sc => {
      if (sc.ticks) sc.ticks.color = t.text;
      if (sc.grid) sc.grid.color = t.grid;
    });
    if (ch.options.plugins?.legend?.labels) ch.options.plugins.legend.labels.color = t.text;
    if (ROUND_CHARTS.includes(ch.config.type)) ch.data.datasets.forEach(d => { d.borderColor = t.surface; });
    ch.update('none');
  });
};
/* Axis that shows "RM" values */
/* (getters give every chart its own fresh copy of the settings) */
Object.defineProperty(KK, 'rmAxis', { get: () => ({ beginAtZero: true, ticks: { callback: v => 'RM ' + (v >= 1000 ? (v / 1000) + 'k' : v) }, grid: { color: KK.chartTheme().grid } }) });
Object.defineProperty(KK, 'noGrid', { get: () => ({ grid: { display: false } }) });

/* ---------- 9. Table pagination helper ---------- */
/* KK.paginate({ rows, tbody, pager, info, pageSize, render }) */
KK.paginate = function ({ rows, tbody, pager, info, pageSize = 10, render, empty = 'No records found.' }) {
  let page = 1;
  const pages = () => Math.max(1, Math.ceil(rows.length / pageSize));
  function draw() {
    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);
    tbody.innerHTML = slice.length ? slice.map(render).join('')
      : `<tr><td colspan="20"><div class="empty-state"><img src="assets/img/empty.svg" alt=""><div>${empty}</div></div></td></tr>`;
    if (info) info.textContent = rows.length ? `Showing ${start + 1}-${Math.min(start + pageSize, rows.length)} of ${rows.length}` : '0 records';
    if (pager) {
      const p = pages(), btn = (n, label, dis, act) =>
        `<li class="page-item ${dis ? 'disabled' : ''} ${act ? 'active' : ''}"><a class="page-link" href="#" data-p="${n}">${label}</a></li>`;
      let html = btn(page - 1, '&lsaquo;', page === 1);
      const from = Math.max(1, Math.min(page - 2, p - 4)), to = Math.min(p, from + 4);
      for (let i = from; i <= to; i++) html += btn(i, i, false, i === page);
      html += btn(page + 1, '&rsaquo;', page === p);
      pager.innerHTML = html;
    }
  }
  pager && pager.addEventListener('click', e => {
    const a = e.target.closest('[data-p]'); if (!a) return;
    e.preventDefault();
    const n = +a.dataset.p; if (n >= 1 && n <= pages()) { page = n; draw(); }
  });
  draw();
  return { update(newRows) { rows = newRows; page = 1; draw(); }, redraw: draw };
};

/* ---------- 10. Export table data to CSV ---------- */
KK.csv = function (filename, rows) {
  const text = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
};

/* ---------- 11. Shared popups used by several pages ---------- */
/* Full order details popup (used on Dashboard, Orders, Customers, Staff) */
KK.showOrder = function (id) {
  const o = DB.orders().find(x => x.id === id); if (!o) return;
  const c = o.customer ? DB.customerById(o.customer) : null;
  const s = DB.staffById(o.staff);
  const total = DB.orderTotal(o);
  const rows = o.items.map(([mid, q]) => {
    const m = DB.menuById(mid);
    return `<tr><td><div class="d-flex align-items-center gap-2"><img src="${KK.menuImg(m)}" alt="" class="thumb" width="28" height="28">${KK.esc(m.name)}</div></td>
      <td class="text-center">${q}</td><td class="text-end text-nowrap">${KK.rm(m.price)}</td><td class="text-end text-nowrap fw-600">${KK.rm(m.price * q)}</td></tr>`;
  }).join('');
  /* Admin only monitors orders - orders are taken and updated by staff at the counter */
  KK.modal({
    title: `Order ${o.id} ${KK.badge(o.status)}`,
    body: `
      <div class="detail-grid cols-3 mb-3">
        <div><div class="dl">Date</div><div class="dv">${KK.date(o.date)}</div></div>
        <div><div class="dl">Time</div><div class="dv">${o.time}</div></div>
        <div><div class="dl">Order type</div><div class="dv">${o.type}</div></div>
        <div><div class="dl">Payment</div><div class="dv">${o.payment}</div></div>
        <div><div class="dl">Customer</div><div class="dv">${c ? KK.esc(c.name) : 'Walk-in customer'}</div></div>
        <div><div class="dl">Served by</div><div class="dv">${s ? KK.esc(s.name) + ' <span class="kk-muted fw-normal">(' + s.role + ')</span>' : '-'}</div></div>
      </div>
      <div class="receipt">
        <div class="table-responsive"><table class="table kk-table table-sm mb-2">
          <thead><tr><th>Item</th><th class="text-center">Qty</th><th class="text-end">Price</th><th class="text-end">Subtotal</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div class="d-flex justify-content-between small kk-muted"><span>Items</span><span>${DB.itemCount(o)}</span></div>
        <div class="d-flex justify-content-between small kk-muted"><span>Estimated cost</span><span>${KK.rm(DB.orderCost(o))}</span></div>
        <div class="d-flex justify-content-between small kk-muted"><span>Gross profit</span><span>${KK.rm(total - DB.orderCost(o))}</span></div>
        <hr class="my-2"><div class="d-flex justify-content-between fs-5 fw-bold"><span>Total</span><span class="text-accent">${KK.rm(total)}</span></div>
      </div>
      ${c ? `<div class="mt-3 small kk-muted"><i class="bi bi-telephone me-1"></i>${c.phone} &nbsp; <i class="bi bi-envelope me-1"></i>${c.email}</div>` : ''}`,
    footer: `<span class="small kk-muted me-auto"><i class="bi bi-eye me-1"></i>View only - orders are handled by staff at the counter</span>
      <button class="btn btn-light" data-bs-dismiss="modal">Close</button>`
  });
};

/* Popup with a list of orders + summary (used when clicking charts / cards) */
KK.showOrderList = function (title, list, note = '') {
  list = [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const paid = DB.paidOrders(list);
  const rev = paid.reduce((s, o) => s + DB.orderTotal(o), 0);
  const items = paid.reduce((s, o) => s + DB.itemCount(o), 0);
  const el = KK.modal({
    title,
    size: 'lg',
    body: `${note ? `<p class="kk-muted small">${note}</p>` : ''}
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.num(list.length)}</div><div class="l">Orders</div></div></div>
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.rm0(rev)}</div><div class="l">Revenue</div></div></div>
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.rm(paid.length ? rev / paid.length : 0)}</div><div class="l">Avg / order</div></div></div>
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.num(items)}</div><div class="l">Items sold</div></div></div>
      </div>
      <div class="table-responsive"><table class="table kk-table table-hover">
        <thead><tr><th>Order</th><th>Date</th><th class="d-none d-sm-table-cell">Customer</th><th class="text-end">Total</th><th>Status</th></tr></thead>
        <tbody id="olBody"></tbody></table></div>
      <div class="d-flex justify-content-between align-items-center"><small class="kk-muted" id="olInfo"></small><ul class="pagination pagination-sm mb-0" id="olPager"></ul></div>`
  });
  KK.paginate({
    rows: list, pageSize: 8, tbody: el.querySelector('#olBody'), pager: el.querySelector('#olPager'), info: el.querySelector('#olInfo'),
    render: o => `<tr class="clickable" data-id="${o.id}"><td class="fw-600">${o.id}</td><td>${KK.date(o.date)} <span class="kk-muted">${o.time}</span></td>
      <td class="d-none d-sm-table-cell">${o.customer ? KK.esc(DB.customerById(o.customer).name) : '<span class="kk-muted">Walk-in</span>'}</td>
      <td class="text-end">${KK.rm(DB.orderTotal(o))}</td><td>${KK.badge(o.status)}</td></tr>`
  });
  el.querySelector('#olBody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    el.addEventListener('hidden.bs.modal', () => KK.showOrder(tr.dataset.id), { once: true });
    el._modal.hide();
  });
};

/* Menu item details popup (used on Menu and Dashboard)
   onChange (optional) runs after the item is deleted, so the page can refresh. */
KK.showMenuItem = function (id, onChange) {
  const m = DB.menuById(id); if (!m) return;
  const paid = DB.paidOrders();
  const withItem = paid.filter(o => o.items.some(([i]) => i === id));
  const sale = DB.itemSales(paid).find(s => s.item.id === id) || { qty: 0, revenue: 0 };
  const rank = DB.itemSales(paid).findIndex(s => s.item.id === id) + 1;
  const margin = m.price ? ((m.price - m.cost) / m.price * 100) : 0;
  const months = DB.months();
  const perMonth = months.map(mk => withItem.filter(o => DB.monthKey(o.date) === mk)
    .reduce((s, o) => s + o.items.filter(([i]) => i === id).reduce((a, [, q]) => a + q, 0), 0));
  /* Only items added with the "Add item" form can be deleted (the 24 original items are protected) */
  const canDelete = DB.isCustomItem(id);
  const el = KK.modal({
    title: KK.esc(m.name) + (canDelete ? ' ' + KK.badge('Added by you', 'neutral') : ''),
    footer: canDelete
      ? '<button class="btn btn-light text-danger me-auto" id="miDelete"><i class="bi bi-trash me-1"></i>Delete item</button><button class="btn btn-light" data-bs-dismiss="modal">Close</button>'
      : '',
    body: `
      <div class="row g-3">
        <div class="col-md-4">${m.img
          ? `<img src="${KK.menuImg(m)}" alt="${KK.esc(m.name)}" class="w-100 rounded-3" style="aspect-ratio:1/1;object-fit:cover">`
          : `<div class="rounded-3 d-grid p-4" style="background:var(--kk-accent-soft);place-items:center"><img src="${KK.menuImg(m)}" alt="${KK.esc(m.category)}" style="width:70%"></div>`}</div>
        <div class="col-md-8">
          <div class="d-flex flex-wrap gap-1 mb-2">${KK.badge(m.category, 'neutral')} ${m.available ? KK.badge('Available', 'completed') : KK.badge('Sold out', 'cancelled')}
            ${(m.tags || []).map(t => KK.badge(t, 'neutral')).join(' ')}</div>
          <p class="kk-muted">${KK.esc(m.desc || '')}</p>
          <div class="detail-grid cols-3">
            <div><div class="dl">Price</div><div class="dv text-accent">${KK.rm(m.price)}</div></div>
            <div><div class="dl">Cost</div><div class="dv">${KK.rm(m.cost)}</div></div>
            <div><div class="dl">Margin</div><div class="dv">${margin.toFixed(0)}%</div></div>
            <div><div class="dl">Calories</div><div class="dv">${m.kcal || '-'} kcal</div></div>
            <div><div class="dl">Rating</div><div class="dv"><i class="bi bi-star-fill text-warning"></i> ${m.rating || '-'}</div></div>
            <div><div class="dl">Item code</div><div class="dv">${m.id}</div></div>
          </div>
        </div>
      </div>
      <div class="row g-2 my-3">
        <div class="col-4"><div class="mini-stat"><div class="v">${KK.num(sale.qty)}</div><div class="l">Units sold</div></div></div>
        <div class="col-4"><div class="mini-stat"><div class="v">${KK.rm0(sale.revenue)}</div><div class="l">Revenue</div></div></div>
        <div class="col-4"><div class="mini-stat"><div class="v">#${rank || '-'}</div><div class="l">Popularity rank</div></div></div>
      </div>
      <div class="fw-600 mb-2">Units sold per month</div>
      <div class="chart-box sm"><canvas id="miChart"></canvas></div>`,
    onShown: el => KK.chart(el.querySelector('#miChart'), {
      type: 'bar',
      data: { labels: months.map(DB.monthName), datasets: [{ label: 'Units', data: perMonth, backgroundColor: KK.colors[1], borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: KK.noGrid } }
    })
  });

  /* Delete: ask to confirm in a second popup */
  el.querySelector('#miDelete')?.addEventListener('click', () => {
    el.addEventListener('hidden.bs.modal', () => {
      const used = DB.orders().filter(o => o.items.some(([i]) => i === id)).length;
      if (used) {
        KK.modal({
          title: 'Cannot delete this item', size: 'sm',
          body: `<p class="mb-0"><strong>${KK.esc(m.name)}</strong> is used in ${used} order(s), so it cannot be deleted. You can still keep it on the menu.</p>`,
          footer: '<button class="btn btn-primary" data-bs-dismiss="modal">OK</button>'
        });
        return;
      }
      const c = KK.modal({
        title: 'Delete item?', size: 'sm',
        body: `<p class="mb-0">Delete <strong>${KK.esc(m.name)}</strong> from the menu? This cannot be undone.</p>`,
        footer: '<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-danger" id="miConfirm"><i class="bi bi-trash me-1"></i>Delete</button>'
      });
      c.querySelector('#miConfirm').addEventListener('click', () => {
        DB.deleteMenuItem(id);
        c._modal.hide();
        KK.toast(`${KK.esc(m.name)} deleted from the menu`);
        onChange && onChange();
      });
    }, { once: true });
    el._modal.hide();
  });
};

/* Customer profile popup (used on Customers and Dashboard) */
KK.showCustomer = function (id) {
  const c = DB.customerById(id); if (!c) return;
  const st = DB.customerStats(c);
  const months = DB.months();
  const spendByMonth = months.map(mk => DB.paidOrders(st.orders).filter(o => DB.monthKey(o.date) === mk).reduce((s, o) => s + DB.orderTotal(o), 0));
  const fav = DB.itemSales(DB.paidOrders(st.orders)).slice(0, 3);
  const hist = [...st.orders].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const el = KK.modal({
    title: 'Customer profile',
    body: `
      <div class="d-flex align-items-center gap-3 mb-3">${KK.avatar(c.name, 56)}
        <div><h5 class="mb-0">${KK.esc(c.name)}</h5><div class="kk-muted small">${c.id} &middot; Member since ${KK.date(c.joined)}</div>
        <div class="mt-1">${KK.badge(st.tier)}</div></div></div>
      <div class="detail-grid cols-3 mb-3">
        <div><div class="dl">Email</div><div class="dv text-break">${c.email}</div></div>
        <div><div class="dl">Phone</div><div class="dv">${c.phone}</div></div>
        <div><div class="dl">Area</div><div class="dv">${c.area}</div></div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${st.visits}</div><div class="l">Visits</div></div></div>
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.rm0(st.spend)}</div><div class="l">Total spend</div></div></div>
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.num(st.points)}</div><div class="l">Points</div></div></div>
        <div class="col-6 col-md-3"><div class="mini-stat"><div class="v">${KK.rm(st.visits ? st.spend / st.visits : 0)}</div><div class="l">Avg / visit</div></div></div>
      </div>
      <div class="row g-3">
        <div class="col-md-7"><div class="fw-600 mb-2">Spending per month</div><div class="chart-box sm"><canvas id="cuChart"></canvas></div></div>
        <div class="col-md-5"><div class="fw-600 mb-2">Favourite items</div>
          ${fav.map(f => `<div class="list-row"><div class="d-flex align-items-center gap-2"><img src="${KK.menuImg(f.item)}" class="thumb" width="26" height="26" alt="">${KK.esc(f.item.name)}</div><span class="kk-muted small">${f.qty}x</span></div>`).join('') || '<p class="kk-muted">No orders yet.</p>'}
          <div class="small kk-muted mt-2">Last visit: ${KK.date(st.lastVisit)}</div></div>
      </div>
      <div class="fw-600 mt-3 mb-2">Order history (${hist.length})</div>
      <div class="table-responsive"><table class="table kk-table table-hover table-sm">
        <thead><tr><th>Order</th><th>Date</th><th class="text-end">Total</th><th>Status</th></tr></thead>
        <tbody id="cuBody"></tbody></table></div>
      <div class="d-flex justify-content-end"><ul class="pagination pagination-sm mb-0" id="cuPager"></ul></div>`,
    onShown: el => KK.chart(el.querySelector('#cuChart'), {
      type: 'line',
      data: { labels: months.map(DB.monthName), datasets: [{ label: 'Spend', data: spendByMonth, borderColor: KK.colors[0], backgroundColor: 'rgba(122,82,53,.08)', fill: true, tension: .35 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: KK.rmAxis, x: KK.noGrid } }
    })
  });
  KK.paginate({
    rows: hist, pageSize: 5, tbody: el.querySelector('#cuBody'), pager: el.querySelector('#cuPager'),
    render: o => `<tr class="clickable" data-id="${o.id}"><td class="fw-600">${o.id}</td><td>${KK.date(o.date)}</td><td class="text-end">${KK.rm(DB.orderTotal(o))}</td><td>${KK.badge(o.status)}</td></tr>`
  });
  el.querySelector('#cuBody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    el.addEventListener('hidden.bs.modal', () => KK.showOrder(tr.dataset.id), { once: true });
    el._modal.hide();
  });
};

/* ---------- 12. Account settings popup (profile, password, theme, data) ---------- */
KK.passwordRules = pw => [
  ['At least 8 characters', pw.length >= 8],
  ['An uppercase letter (A-Z)', /[A-Z]/.test(pw)],
  ['A lowercase letter (a-z)', /[a-z]/.test(pw)],
  ['A number (0-9)', /\d/.test(pw)],
  ['A symbol (e.g. @ # !)', /[^A-Za-z0-9]/.test(pw)]
];
KK.showSettings = function (tab = 'profile') {
  const a = KK.admin();
  const log = DB.load('kk_login_log', []);
  const tabs = [['profile', 'bi-person', 'Profile'], ['password', 'bi-shield-lock', 'Password'], ['appearance', 'bi-palette', 'Appearance'], ['data', 'bi-database', 'Data'], ['history', 'bi-clock-history', 'Login history']];
  const el = KK.modal({
    title: '<i class="bi bi-gear me-2"></i>Account settings',
    size: 'lg',
    body: `
      <ul class="nav nav-pills kk-pills mb-3 flex-nowrap overflow-auto" role="tablist">
        ${tabs.map(([k, i, l]) => `<li class="nav-item"><button class="nav-link ${k === tab ? 'active' : ''} text-nowrap" data-bs-toggle="pill" data-bs-target="#st-${k}" type="button"><i class="bi ${i} me-1"></i>${l}</button></li>`).join('')}
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade ${tab === 'profile' ? 'show active' : ''}" id="st-profile">
          <form id="stProfile" novalidate><div class="row g-3">
            <div class="col-md-6"><label class="form-label" for="stName">Display name</label><input class="form-control" id="stName" value="${KK.esc(a.name)}" required minlength="3"><div class="invalid-feedback">At least 3 characters.</div></div>
            <div class="col-md-6"><label class="form-label" for="stUser">Username</label><input class="form-control" id="stUser" value="${KK.esc(a.username)}" disabled><div class="form-text">Username is fixed for the admin account.</div></div>
            <div class="col-md-6"><label class="form-label" for="stEmail">Email</label><input type="email" class="form-control" id="stEmail" value="${KK.esc(a.email)}" required><div class="invalid-feedback">Enter a valid email.</div></div>
            <div class="col-md-6"><label class="form-label" for="stPhone">Phone</label><input class="form-control" id="stPhone" value="${KK.esc(a.phone)}" pattern="^0[0-9]{1,2}-?[0-9]{3,4} ?[0-9]{4}$"><div class="invalid-feedback">Example: 03-3258 0566</div></div>
          </div><button class="btn btn-primary mt-3" type="submit"><i class="bi bi-check2 me-1"></i>Save profile</button></form>
        </div>
        <div class="tab-pane fade ${tab === 'password' ? 'show active' : ''}" id="st-password">
          <form id="stPw" novalidate><div class="row g-3">
            <div class="col-12"><label class="form-label" for="stOld">Current password</label><input type="password" class="form-control" id="stOld" required autocomplete="current-password"><div class="invalid-feedback">Current password is wrong.</div></div>
            <div class="col-md-6"><label class="form-label" for="stNew">New password</label><input type="password" class="form-control" id="stNew" required autocomplete="new-password"><div class="invalid-feedback">Please meet all the rules below.</div></div>
            <div class="col-md-6"><label class="form-label" for="stConfirm">Confirm new password</label><input type="password" class="form-control" id="stConfirm" required autocomplete="new-password"><div class="invalid-feedback">Passwords do not match.</div></div>
          </div>
          <ul class="list-unstyled small mt-3 mb-0" id="stRules"></ul>
          <button class="btn btn-primary mt-3" type="submit"><i class="bi bi-shield-check me-1"></i>Change password</button></form>
        </div>
        <div class="tab-pane fade ${tab === 'appearance' ? 'show active' : ''}" id="st-appearance">
          <p class="kk-muted small">Choose how Kopi Kita looks on this browser.</p>
          <div class="row g-3">
            ${[['light', 'bi-sun', 'Light', 'Off-white background'], ['dark', 'bi-moon-stars', 'Dark', 'Dark chocolate background']].map(([v, i, l, d]) => `
            <div class="col-6"><label class="kk-theme-option w-100">
              <input type="radio" name="stTheme" value="${v}" ${KK.theme() === v ? 'checked' : ''}>
              <span class="kk-theme-card ${v}"><span class="kk-theme-preview"><span></span><span></span><span></span></span>
                <span class="fw-600"><i class="bi ${i} me-1"></i>${l}</span><span class="small kk-muted d-block">${d}</span></span></label></div>`).join('')}
          </div>
        </div>
        <div class="tab-pane fade ${tab === 'data' ? 'show active' : ''}" id="st-data">
          <div class="list-row"><div><div class="fw-600">Download backup</div><div class="small kk-muted">Save all your changes (menu, stock, staff, roster, targets) as a .json file.</div></div>
            <button class="btn btn-outline-primary text-nowrap" id="stExport"><i class="bi bi-download me-1"></i>Backup</button></div>
          <div class="list-row"><div><div class="fw-600">Restore backup</div><div class="small kk-muted">Load a Kopi Kita .json backup file.</div></div>
            <label class="btn btn-outline-primary text-nowrap mb-0"><i class="bi bi-upload me-1"></i>Restore<input type="file" accept=".json,application/json" id="stImport" hidden></label></div>
          <div class="list-row"><div><div class="fw-600 text-danger">Reset demo data</div><div class="small kk-muted">Remove all changes and go back to the original sample data. Your password is kept.</div></div>
            <button class="btn btn-light text-danger text-nowrap" id="stReset"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset</button></div>
          <div class="alert alert-warning small mt-3 mb-0 d-none" id="stResetConfirm">Are you sure? This cannot be undone.
            <div class="mt-2"><button class="btn btn-sm btn-danger" id="stResetYes">Yes, reset</button> <button class="btn btn-sm btn-light" id="stResetNo">Cancel</button></div></div>
        </div>
        <div class="tab-pane fade ${tab === 'history' ? 'show active' : ''}" id="st-history">
          <div class="table-responsive"><table class="table kk-table mb-0"><thead><tr><th>#</th><th>Date &amp; time</th><th>Device</th></tr></thead><tbody>
          ${log.length ? log.map((l, i) => `<tr><td>${i + 1}</td><td>${new Date(l.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td><td><i class="bi ${l.device === 'Mobile' ? 'bi-phone' : 'bi-laptop'} me-1"></i>${l.device}</td></tr>`).join('') : '<tr><td colspan="3" class="kk-muted">No sign-ins yet.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>`
  });
  const $ = id => el.querySelector('#' + id);

  /* Profile */
  $('stProfile').addEventListener('submit', e => {
    e.preventDefault(); e.target.classList.add('was-validated');
    if (!e.target.checkValidity()) return;
    KK.updateUser(a.username, { name: $('stName').value.trim(), email: $('stEmail').value.trim(), phone: $('stPhone').value.trim() });
    KK.toast('Profile saved'); setTimeout(() => location.reload(), 600);
  });

  /* Password with live rule checklist */
  const drawRules = () => { $('stRules').innerHTML = KK.passwordRules($('stNew').value).map(([t, ok]) =>
    `<li class="${ok ? 'text-success' : 'kk-muted'}"><i class="bi ${ok ? 'bi-check-circle-fill' : 'bi-circle'} me-2"></i>${t}</li>`).join(''); };
  drawRules();
  $('stNew').addEventListener('input', drawRules);
  ['stOld', 'stNew', 'stConfirm'].forEach(id => $(id).addEventListener('input', () => $(id).setCustomValidity('')));
  $('stPw').addEventListener('submit', e => {
    e.preventDefault();
    const nv = $('stNew').value;
    $('stOld').setCustomValidity($('stOld').value === KK.admin().password ? '' : 'wrong');
    $('stNew').setCustomValidity(KK.passwordRules(nv).every(([, ok]) => ok) ? '' : 'weak');
    $('stConfirm').setCustomValidity(nv && $('stConfirm').value === nv ? '' : 'mismatch');
    e.target.classList.add('was-validated');
    if (!e.target.checkValidity()) return;
    KK.updateUser(a.username, { password: nv });
    e.target.reset(); e.target.classList.remove('was-validated'); drawRules();
    KK.toast('Password changed. Use the new password next time you sign in.');
  });

  /* Theme */
  el.querySelectorAll('input[name="stTheme"]').forEach(r => r.addEventListener('change', () => KK.setTheme(r.value)));

  /* Backup / restore / reset */
  $('stExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DB.exportBackup(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `kopikita-backup-${APP_TODAY}.json`; link.click();
    URL.revokeObjectURL(link.href);
    KK.toast('Backup downloaded');
  });
  $('stImport').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { DB.importBackup(JSON.parse(reader.result)); KK.toast('Backup restored'); setTimeout(() => location.reload(), 700); }
      catch (err) { KK.toast(err.message || 'Invalid backup file', 'error'); }
    };
    reader.readAsText(file);
  });
  $('stReset').addEventListener('click', () => $('stResetConfirm').classList.remove('d-none'));
  $('stResetNo').addEventListener('click', () => $('stResetConfirm').classList.add('d-none'));
  $('stResetYes').addEventListener('click', () => { DB.resetDemoData(); KK.toast('Demo data reset'); setTimeout(() => location.reload(), 600); });
};

/* Run the shared layout as soon as this file loads */
KK.renderShell();