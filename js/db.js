/* ==========================================================
   Kopi Kita - js/db.js
   Purpose: Helper functions to read and calculate from data.js.
            Every change the admin makes (menu items, stock,
            purchase orders, staff, roster, targets) is saved in
            the browser's localStorage, so the prototype
            "remembers" it after a refresh. No real database.
   ========================================================== */

const DB = (() => {
  /* ---------- localStorage helpers ---------- */
  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const copy = obj => JSON.parse(JSON.stringify(obj));

  /* ======================================================
     1. MENU & ORDERS
     ====================================================== */
  /* Items added by the admin use codes like N001 so they never clash with the sample menu (M001...).
     Any old saved item whose code is already used by the sample menu is ignored. */
  const menu = () => MENU.concat(load('kk_menu_new', []).filter(c => !MENU.some(m => m.id === c.id)));
  function orders() {
    const status = load('kk_order_status', {});
    return ORDERS.map(o => status[o.id] ? { ...o, status: status[o.id] } : o);
  }
  const menuById = id => menu().find(m => m.id === id);
  const customerById = id => CUSTOMERS.find(c => c.id === id);

  function orderTotal(o) {
    return o.items.reduce((sum, [id, qty]) => sum + (menuById(id)?.price || 0) * qty, 0);
  }
  function orderCost(o) {
    return o.items.reduce((sum, [id, qty]) => sum + (menuById(id)?.cost || 0) * qty, 0);
  }
  const itemCount = o => o.items.reduce((s, [, q]) => s + q, 0);
  /* Revenue only counts orders that were not cancelled */
  const paidOrders = (list = orders()) => list.filter(o => o.status !== 'Cancelled');

  /* Generic "group by" -> returns { key: total } */
  function groupSum(list, keyFn, valFn = () => 1) {
    const out = {};
    list.forEach(x => { const k = keyFn(x); out[k] = (out[k] || 0) + valFn(x); });
    return out;
  }
  /* Sales per menu item -> [{item, qty, revenue}] sorted by qty */
  function itemSales(list = paidOrders()) {
    const map = {};
    list.forEach(o => o.items.forEach(([id, qty]) => {
      const m = menuById(id); if (!m) return;
      map[id] = map[id] || { item: m, qty: 0, revenue: 0 };
      map[id].qty += qty;
      map[id].revenue += qty * m.price;
    }));
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }

  /* Menu items added by the admin (only these can be deleted) */
  function addMenuItem(item) {
    const list = load('kk_menu_new', []);
    const maxNo = Math.max(0, ...list.filter(m => m.id.startsWith('N')).map(m => parseInt(m.id.slice(1), 10)));
    item.id = 'N' + String(maxNo + 1).padStart(3, '0');
    list.push(item); save('kk_menu_new', list);
    return item;
  }
  const isCustomItem = id => load('kk_menu_new', []).some(m => m.id === id);
  const deleteMenuItem = id => save('kk_menu_new', load('kk_menu_new', []).filter(m => m.id !== id));

  /* ======================================================
     2. CUSTOMERS
     ====================================================== */
  function customerStats(c) {
    const list = orders().filter(o => o.customer === c.id);
    const paid = paidOrders(list);
    const spend = paid.reduce((s, o) => s + orderTotal(o), 0);
    const fav = itemSales(paid)[0];
    const points = Math.floor(spend);            // 1 point for every RM1
    const tier = spend >= 400 ? 'Gold' : spend >= 150 ? 'Silver' : 'Bronze';
    const last = list.map(o => o.date).sort().pop() || null;
    return { orders: list, visits: paid.length, spend, points, tier, lastVisit: last, favourite: fav ? fav.item.name : '-' };
  }

  /* ======================================================
     3. STAFF, ROSTER & PAYROLL
     ====================================================== */
  const staff = () => load('kk_staff', null) || copy(STAFF);
  const saveStaff = list => save('kk_staff', list);
  const staffById = id => staff().find(s => s.id === id);
  function addStaff(s) {
    const list = staff();
    const maxNo = Math.max(0, ...list.map(x => parseInt(x.id.slice(1), 10)));
    s.id = 'S' + String(maxNo + 1).padStart(2, '0');
    list.push(s); saveStaff(list);
    return s;
  }
  function updateStaff(id, changes) {
    saveStaff(staff().map(s => s.id === id ? { ...s, ...changes } : s));
  }
  const deleteStaff = id => saveStaff(staff().filter(s => s.id !== id));
  function staffStats(s) {
    const list = paidOrders().filter(o => o.staff === s.id);
    return { orders: list, count: list.length, revenue: list.reduce((t, o) => t + orderTotal(o), 0) };
  }

  /* Roster: { weekStart: { staffId: [7 shift codes Mon..Sun] } }
     Shift codes: M = Morning (7.5h), E = Evening (7.5h), F = Full day (8h), O = Off, L = Leave (paid hours, breaks excluded) */
  const SHIFT_HOURS = { M: 7.5, E: 7.5, F: 8, O: 0, L: 0 };
  function defaultWeek(s) {
    const base = { Manager: 'F', Barista: s.shift === 'Evening' ? 'E' : 'M', Cashier: s.shift === 'Evening' ? 'E' : 'M', Kitchen: s.shift === 'Evening' ? 'E' : 'M' }[s.role];
    if (s.role === 'Part-timer') return ['O', 'O', 'O', 'O', 'O', 'F', 'F'];
    /* one day off: Managers on Sunday, others spread through the week */
    const off = s.role === 'Manager' ? 6 : (parseInt(s.id.slice(1), 10) % 5);
    return Array.from({ length: 7 }, (_, i) => i === off ? 'O' : base);
  }
  function roster(weekStart) {
    const all = load('kk_roster', {});
    const week = all[weekStart] || {};
    const out = {};
    staff().filter(s => s.status !== 'Inactive').forEach(s => { out[s.id] = week[s.id] || defaultWeek(s); });
    return out;
  }
  function saveRoster(weekStart, week) {
    const all = load('kk_roster', {});
    all[weekStart] = week; save('kk_roster', all);
  }
  const hasSavedRoster = weekStart => !!load('kk_roster', {})[weekStart];

  /* ======================================================
     4. INVENTORY, SUPPLIERS, PURCHASE ORDERS, STOCK HISTORY
     ====================================================== */
  const inventory = () => load('kk_inventory', null) || copy(INVENTORY);
  const saveInventory = list => save('kk_inventory', list);
  const suppliers = () => copy(SUPPLIERS);
  const supplierByName = name => SUPPLIERS.find(s => s.name === name);
  const stockLog = () => load('kk_stock_log', null) || copy(STOCK_LOG);
  function logStock(entry) {
    const list = stockLog();
    list.unshift({ date: APP_TODAY, by: (window.KK && KK.session && KK.session()?.name) || 'Admin', cost: 0, note: '', ...entry });
    save('kk_stock_log', list);
  }
  const round2 = n => +Number(n).toFixed(2);

  function restock(id, qty, note = 'Manual restock') {
    const list = inventory();
    const it = list.find(i => i.id === id); if (!it) return;
    it.stock = round2(it.stock + qty);
    it.lastRestock = APP_TODAY;
    saveInventory(list);
    logStock({ item: id, type: 'Restock', qty: round2(qty), cost: round2(qty * it.unitCost), note });
  }
  /* Wastage / correction: qty can be negative (remove) or positive (found extra) */
  function adjustStock(id, qty, reason) {
    const list = inventory();
    const it = list.find(i => i.id === id); if (!it) return;
    it.stock = Math.max(0, round2(it.stock + qty));
    saveInventory(list);
    logStock({ item: id, type: 'Adjustment', qty: round2(qty), note: reason });
  }
  function addStockItem(item) {
    const list = inventory();
    const maxNo = Math.max(0, ...list.map(x => parseInt(x.id.slice(1), 10)));
    item.id = 'I' + String(maxNo + 1).padStart(2, '0');
    item.lastRestock = APP_TODAY;
    list.push(item); saveInventory(list);
    logStock({ item: item.id, itemName: item.name, type: 'New item', qty: item.stock, cost: round2(item.stock * item.unitCost), note: 'Added to inventory' });
    return item;
  }
  function updateStockItem(id, changes) {
    saveInventory(inventory().map(i => i.id === id ? { ...i, ...changes } : i));
    logStock({ item: id, type: 'Edited', qty: 0, note: 'Item details updated' });
  }
  function deleteStockItem(id) {
    const it = inventory().find(i => i.id === id);
    saveInventory(inventory().filter(i => i.id !== id));
    logStock({ item: id, itemName: it ? it.name : id, type: 'Deleted', qty: 0, note: 'Removed from inventory' });
  }

  const purchaseOrders = () => load('kk_pos', null) || copy(PURCHASE_ORDERS);
  const savePOs = list => save('kk_pos', list);
  const poTotal = po => po.lines.reduce((s, [, q, c]) => s + q * c, 0);
  function createPO(supplier, lines, note = '') {
    const list = purchaseOrders();
    const maxNo = Math.max(0, ...list.map(p => parseInt(p.id.split('-')[2], 10)));
    const lead = supplierByName(supplier)?.leadDays || 3;
    const exp = new Date(APP_TODAY); exp.setDate(exp.getDate() + lead);
    const po = { id: 'PO-2026-' + String(maxNo + 1).padStart(3, '0'), date: APP_TODAY, supplier, lines, status: 'Pending', expected: exp.toISOString().slice(0, 10), note };
    list.unshift(po); savePOs(list);
    return po;
  }
  function receivePO(id) {
    const list = purchaseOrders();
    const po = list.find(p => p.id === id); if (!po || po.status !== 'Pending') return;
    po.lines.forEach(([itemId, qty]) => restock(itemId, qty, `Received ${po.id}`));
    po.status = 'Received'; po.received = APP_TODAY;
    savePOs(list);
  }
  function cancelPO(id) {
    savePOs(purchaseOrders().map(p => p.id === id ? { ...p, status: 'Cancelled' } : p));
  }

  /* ======================================================
     5. TARGETS (Reports page)
     ====================================================== */
  /* default target RM1,800 for any month that has no saved target */
  const targets = () => ({ [APP_TODAY.slice(0, 7)]: 1800, ...load('kk_targets', {}) });
  const setTarget = (month, value) => save('kk_targets', { ...targets(), [month]: value });

  /* ======================================================
     6. DATES
     ====================================================== */
  const monthKey = d => d.slice(0, 7);                         // e.g. "2026-05"
  const monthName = key => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' });
  };
  /* Date helpers work on "YYYY-MM-DD" strings (no time zone surprises) */
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.toISOString().slice(0, 10);
  }
  const daysAgo = n => addDays(APP_TODAY, -n);
  const dayOfWeek = iso => { const [y, m, d] = iso.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }; // Mon=0
  const weekStart = iso => addDays(iso, -dayOfWeek(iso));
  const months = () => [...new Set(orders().map(o => monthKey(o.date)))].sort();
  const firstDate = () => orders().reduce((m, o) => o.date < m ? o.date : m, APP_TODAY);   // oldest order date

  /* ======================================================
     7. RESET & BACKUP
     ====================================================== */
  const DATA_KEYS = ['kk_menu_new', 'kk_order_status', 'kk_inventory', 'kk_stock_log', 'kk_pos', 'kk_staff', 'kk_roster', 'kk_targets'];
  const resetDemoData = () => DATA_KEYS.forEach(k => localStorage.removeItem(k));
  function exportBackup() {
    const data = {};
    DATA_KEYS.concat(['kk_admin_edits']).forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); });
    return { app: 'Kopi Kita', exportedAt: new Date().toISOString(), data };
  }
  function importBackup(obj) {
    if (!obj || obj.app !== 'Kopi Kita' || typeof obj.data !== 'object') throw new Error('This is not a Kopi Kita backup file.');
    Object.entries(obj.data).forEach(([k, v]) => { if (DATA_KEYS.includes(k) || k === 'kk_admin_edits') save(k, v); });
  }

  return {
    load, save,
    menu, orders, menuById, customerById, orderTotal, orderCost, itemCount, paidOrders, groupSum, itemSales,
    addMenuItem, isCustomItem, deleteMenuItem, customerStats,
    staff, staffById, addStaff, updateStaff, deleteStaff, staffStats, roster, saveRoster, hasSavedRoster, defaultWeek, SHIFT_HOURS,
    inventory, suppliers, supplierByName, stockLog, restock, adjustStock, addStockItem, updateStockItem, deleteStockItem,
    purchaseOrders, poTotal, createPO, receivePO, cancelPO,
    targets, setTarget,
    monthKey, monthName, addDays, daysAgo, dayOfWeek, weekStart, months, firstDate,
    resetDemoData, exportBackup, importBackup
  };
})();
