'use strict';

// PWA-додаток без фреймворків. Усі дані зберігаються локально у localStorage.
const STORAGE_KEY = 'warehouse_order_pwa_v1';
const APP_VERSION = 'v44';
const CORE_ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];
const UNITS = ['кг', 'г', 'т', 'шт', 'мішки', 'коробки', 'ящики', 'піддони', 'літри', 'власна одиниця'];
const CATEGORIES = ['Сировина', 'Жири', 'Молочна продукція', 'Крохмалі', 'Какао-продукти', 'Пакування', 'Тара', 'Допоміжні матеріали', 'Інше'];
const URGENCY = ['звичайно', 'важливо', 'терміново', 'критично'];

const DEFAULT_POSITIONS = [
  ['Клейковина пшенична', 'Сировина', 'кг'], ['Крохмаль пшеничний Weizita', 'Крохмалі', 'кг'],
  ['Крохмаль картопляний', 'Крохмалі', 'кг'], ['Крохмаль кукурудзяний', 'Крохмалі', 'кг'],
  ['UltraTex', 'Крохмалі', 'кг'], ['Какао-порошок 10-12 NA-55', 'Какао-продукти', 'кг'],
  ['Какао-порошок GT50', 'Какао-продукти', 'кг'], ['Какао терте', 'Какао-продукти', 'кг'],
  ['Какао 470', 'Какао-продукти', 'кг'], ['Масло какао дезодороване', 'Какао-продукти', 'кг'],
  ['Молоко сухе 26%', 'Молочна продукція', 'кг'], ['Молоко сухе 0%', 'Молочна продукція', 'кг'],
  ['Лактоза', 'Молочна продукція', 'кг'], ['Пермеат', 'Молочна продукція', 'кг'],
  ['Жир AcoCream', 'Жири', 'кг'], ['Олія соняшникова', 'Жири', 'кг'], ['Жир для фритюра', 'Жири', 'кг'],
  ['Кокосова стружка', 'Сировина', 'кг'], ['Глюкоза', 'Сировина', 'кг'], ['Сіль', 'Сировина', 'кг'],
  ['Метабісульфіт', 'Допоміжні матеріали', 'кг'], ['Короб гофрований', 'Пакування', 'шт'],
  ['Плівка пакувальна', 'Пакування', 'кг'], ['Піддон деревʼяний', 'Тара', 'піддони'], ['Ящик пластиковий', 'Тара', 'ящики']
];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const nowTime = () => new Date().toTimeString().slice(0, 5);

let state = loadState();
let deferredPrompt = null;
let draggedIndex = null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return migrateState(JSON.parse(saved)); }
    catch { localStorage.removeItem(STORAGE_KEY); }
  }
  return migrateState({
    positions: DEFAULT_POSITIONS.map(([name, category, unit]) => ({ id: uid(), name, category, unit, note: '', favorite: false, usage: 0, createdAt: Date.now() })),
    currentOrder: { meta: { date: today(), responsible: '', notes: '' }, items: [], dirty: false, activeWarehouse: '1711', warehouses: ['1711', '1719'] },
    history: [],
    templates: [],
    settings: { defaultResponsible: '', pdfSignature: '' },
    actions: []
  });
}

function migrateState(data) {
  data.positions ||= DEFAULT_POSITIONS.map(([name, category, unit]) => ({ id: uid(), name, category, unit, note: '', favorite: false, usage: 0, createdAt: Date.now() }));
  data.currentOrder ||= { meta: {}, items: [] };
  data.currentOrder.meta ||= {};
  delete data.currentOrder.meta.time;
  delete data.currentOrder.meta.shift;
  data.currentOrder.items ||= [];
  data.currentOrder.warehouses ||= ['1711', '1719'];
  data.currentOrder.activeWarehouse ||= data.currentOrder.warehouses[0] || '1711';
  data.currentOrder.items.forEach(i => { i.warehouse ||= data.currentOrder.activeWarehouse || '1711'; });
  data.history ||= [];
  data.history.forEach(h => (h.items || []).forEach(i => { i.warehouse ||= (h.warehouses?.[0] || h.meta?.warehouse || '1711'); }));
  data.templates ||= [];
  data.templates.forEach(t => (t.items || []).forEach(i => { i.warehouse ||= '1711'; }));
  data.settings ||= {};
  if (data.settings.autoNewDay === undefined) data.settings.autoNewDay = true;
  if (data.settings.autoUpdateCache === undefined) data.settings.autoUpdateCache = true;
  delete data.settings.defaultShift;
  data.actions ||= [];
  return data;
}

function saveState(action = null) {
  if (action) logAction(action);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  $('#storageStatus').textContent = `Збережено локально • ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
}

function snapshot() { sessionStorage.setItem('warehouse_undo', JSON.stringify(state)); }
function undo() {
  const prev = sessionStorage.getItem('warehouse_undo');
  if (!prev) return alert('Немає дії для скасування.');
  state = JSON.parse(prev);
  saveState('Скасовано останню дію');
  renderAll();
}
function logAction(text) {
  state.actions.unshift({ id: uid(), text, at: new Date().toISOString() });
  state.actions = state.actions.slice(0, 50);
}
function markDirty() { state.currentOrder.dirty = true; saveState(); }
function confirmAction(text) { return confirm(text); }
function normalize(v) { return String(v || '').toLowerCase().trim(); }
function sortedPositions() { return [...state.positions].sort((a, b) => a.name.localeCompare(b.name, 'uk')); }

function init() {
  fillSelects();
  rolloverOrderForNewDay();
  initMeta();
  bindNavigation();
  bindOrderEvents();
  bindDirectoryEvents();
  bindTemplateEvents();
  bindHistoryEvents();
  bindDataEvents();
  bindHotkeys();
  bindPWA();
  checkDailyAppUpdate();
  restoreDraftNotice();
  renderAll();
  finishStartupAnimation();
}

document.addEventListener('DOMContentLoaded', init);

function finishStartupAnimation() {
  const splash = $('#startupSplash');
  if (!splash) return;
  const close = () => {
    splash.classList.add('is-hiding');
    setTimeout(() => splash.remove(), 420);
  };
  splash.addEventListener('click', close, { once: true });
  splash.addEventListener('touchstart', close, { once: true, passive: true });
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  setTimeout(close, reducedMotion ? 900 : 4200);
}

function fillSelects() {
  ['#positionCategory'].forEach(sel => $(sel).innerHTML = CATEGORIES.map(v => `<option>${v}</option>`).join(''));
  ['#positionUnit', '#itemUnit'].forEach(sel => $(sel).innerHTML = UNITS.map(v => `<option>${v}</option>`).join(''));
  $('#itemUrgency').innerHTML = URGENCY.map(v => `<option>${v}</option>`).join('');
}

function initMeta() {
  const meta = state.currentOrder.meta;
  meta.date ||= today();
  meta.responsible ||= state.settings.defaultResponsible;
  syncMetaToForm();
}

function syncMetaToForm() {
  const m = state.currentOrder.meta;
  $('#orderDate').value = m.date || today();
  $('#responsible').value = m.responsible || '';
  $('#orderNotes').value = m.notes || '';
}

function readMetaFromForm() {
  state.currentOrder.meta = {
    date: $('#orderDate').value,
    responsible: $('#responsible').value.trim(),
    notes: $('#orderNotes').value.trim()
  };
}

function bindNavigation() {
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
    showScreen(btn.dataset.screen);
    const navModal = $('#navMenuModal');
    if (navModal?.open) navModal.close();
  }));
  const openNav = () => {
    const modal = $('#navMenuModal');
    if (!modal) return;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  };
  $('#openNavMenuBtn')?.addEventListener('click', openNav);
  $('#openGlobalNavMenuBtn')?.addEventListener('click', openNav);
  $('#closeNavMenuBtn')?.addEventListener('click', () => $('#navMenuModal')?.close());
}
function showScreen(name) {
  const target = $(`#screen-${name}`);
  if (!target) return;
  $$('.screen').forEach(s => s.classList.remove('active'));
  target.classList.add('active');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}

function bindOrderEvents() {
  document.addEventListener('click', closeMoreActionsOnOutsideClick, true);
  bindExclusiveMoreActions();
  $('#positionSearch').addEventListener('focus', renderSearchResults);
  $('#positionSearch').addEventListener('input', renderSearchResults);
  $('#clearSearchBtn').addEventListener('click', () => { $('#positionSearch').value = ''; hideSearchResults(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) hideSearchResults(); });
  $('#addWarehouseBtn')?.addEventListener('click', addWarehouse);
  $('#manageWarehousesBtn')?.addEventListener('click', openWarehouseManager);
  $('#closeWarehouseModal')?.addEventListener('click', () => $('#warehouseModal')?.close());
  $('#orderMetaForm').addEventListener('input', () => { readMetaFromForm(); markDirty(); });
  $('#itemForm').addEventListener('submit', saveItemFromModal);
  $('#closeItemModal').addEventListener('click', () => $('#itemModal').close());
  $('#copyTextBtn').addEventListener('click', () => copyText(formatOrderText()));
  $('#copyTableBtn').addEventListener('click', () => copyText(formatOrderTable()));
  $('#saveHistoryBtn').addEventListener('click', saveToHistory);
  $$('.more-actions-menu button').forEach(btn => btn.addEventListener('click', () => btn.closest('details')?.removeAttribute('open')));
  const pdfBtn = $('#pdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', exportPDF);
  $('#exportWordBtn')?.addEventListener('click', () => exportEditableDocument('word'));
  $('#exportExcelBtn')?.addEventListener('click', () => exportEditableDocument('excel'));
  $('#newOrderBtn')?.addEventListener('click', createNewOrder);
  $('#shareBtn').addEventListener('click', shareOrder);
  const printBtn = $('#printBtn');
  if (printBtn) printBtn.addEventListener('click', () => exportPDF());
  $('#clearOrderBtn').addEventListener('click', clearOrder);
  $('#sortAlphaBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items.sort((a,b)=>a.name.localeCompare(b.name,'uk')); markDirty(); renderOrderItems(); });
  $('#sortCategoryBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items.sort((a,b)=>`${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`,'uk')); markDirty(); renderOrderItems(); });
  $('#clearCommentsBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items.forEach(i => i.comment = ''); markDirty(); renderOrderItems(); });
  $('#duplicateOrderBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items = state.currentOrder.items.map(i => ({...i, id: uid()})); markDirty(); renderOrderItems(); });
}

function closeMoreActions() {
  $$('.more-actions[open]').forEach(menu => menu.removeAttribute('open'));
}

function bindExclusiveMoreActions() {
  $$('.more-actions').forEach(menu => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      $$('.more-actions[open]').forEach(otherMenu => {
        if (otherMenu !== menu) otherMenu.removeAttribute('open');
      });
    });
  });
}

function closeMoreActionsOnOutsideClick(e) {
  if (e.target.closest('.more-actions')) return;
  closeMoreActions();
}

function renderSearchResults() {
  const q = normalize($('#positionSearch').value);
  const results = sortedPositions().filter(p => !q || normalize(`${p.name} ${p.category}`).includes(q));
  $('#searchResults').innerHTML = results.map(p => `<button class="result-row" data-add="${p.id}"><span class="result-title">${escapeHtml(p.name)}</span><span class="meta">${p.category} • ${p.unit}</span></button>`).join('') || '<div class="result-row">Нічого не знайдено</div>';
  $('#searchResults').classList.remove('hidden');
  document.body.classList.add('search-open');
  $$('[data-add]').forEach(b => b.addEventListener('click', () => openItemModalByPosition(b.dataset.add)));
}

function hideSearchResults() {
  $('#searchResults').classList.add('hidden');
  document.body.classList.remove('search-open');
}

function openItemModalByPosition(id) {
  const p = state.positions.find(x => x.id === id);
  if (!p) return;
  $('#itemEditIndex').value = '';
  $('#itemModalTitle').textContent = 'Додати в замовлення';
  $('#itemName').value = p.name;
  $('#itemQty').value = '';
  $('#itemUnit').value = p.unit;
  $('#itemComment').value = '';
  $('#itemUrgency').value = 'звичайно';
  $('#itemNeedDate').value = state.currentOrder.meta.date || today();
  hideSearchResults();
  $('#itemModal').showModal();
  setTimeout(() => $('#itemQty').focus(), 60);
}

function saveItemFromModal(e) {
  e.preventDefault();
  snapshot();
  const item = {
    id: uid(),
    name: $('#itemName').value.trim(),
    qty: Number($('#itemQty').value),
    unit: $('#itemUnit').value,
    comment: $('#itemComment').value.trim(),
    urgency: $('#itemUrgency').value,
    needDate: $('#itemNeedDate').value,
    category: state.positions.find(p => p.name === $('#itemName').value.trim())?.category || 'Інше',
    warehouse: state.currentOrder.activeWarehouse || '1711'
  };
  if (!item.name || !item.qty) return alert('Заповни найменування і кількість. Магія без цифр не працює.');
  const editIndex = $('#itemEditIndex').value;
  if (editIndex !== '') state.currentOrder.items[Number(editIndex)] = { ...state.currentOrder.items[Number(editIndex)], ...item, id: state.currentOrder.items[Number(editIndex)].id, warehouse: state.currentOrder.items[Number(editIndex)].warehouse || item.warehouse };
  else state.currentOrder.items.push(item);
  const pos = state.positions.find(p => p.name === item.name);
  if (pos) pos.usage = (pos.usage || 0) + 1;
  markDirty();
  saveState(editIndex !== '' ? 'Відредаговано позицію замовлення' : 'Додано позицію в замовлення');
  $('#itemModal').close();
  renderAll();
}

function orderWarehouses(source = state.currentOrder) {
  const order = [...(source.warehouses || [])];
  (source.items || []).forEach(i => {
    const w = i.warehouse || source.activeWarehouse || '1711';
    if (!order.includes(w)) order.push(w);
  });
  return order.filter(Boolean);
}
function warehouseItems(source, warehouse) {
  return (source.items || []).map((item, idx) => ({ item, idx })).filter(x => (x.item.warehouse || source.activeWarehouse || '1711') === warehouse);
}
function renderWarehouseTabs() {
  const warehouses = orderWarehouses();
  if (!warehouses.includes(state.currentOrder.activeWarehouse)) state.currentOrder.activeWarehouse = warehouses[0] || '1711';
  $('#warehouseTabs').innerHTML = warehouses.map(w => `<button class="warehouse-tab ${w === state.currentOrder.activeWarehouse ? 'active' : ''}" data-warehouse="${escapeAttr(w)}">Склад ${escapeHtml(w)}</button>`).join('');
  $('#activeWarehouseLabel').textContent = `Замовлення на склад: ${state.currentOrder.activeWarehouse}`;
  $$('[data-warehouse]').forEach(b => b.addEventListener('click', () => { state.currentOrder.activeWarehouse = b.dataset.warehouse; markDirty(); renderOrderItems(); }));
  renderWarehouseManager();
}
function openWarehouseManager() {
  renderWarehouseManager();
  $('#warehouseModal')?.showModal();
}

function renderWarehouseManager() {
  const box = $('#warehouseManageList');
  if (!box) return;
  const warehouses = orderWarehouses();
  box.innerHTML = warehouses.map(w => {
    const count = warehouseItems(state.currentOrder, w).length;
    return `<div class="warehouse-manage-row">
      <div><b>Склад ${escapeHtml(w)}</b><div class="meta">Позицій: ${count}${w === state.currentOrder.activeWarehouse ? ' • активний' : ''}</div></div>
      <div class="warehouse-manage-actions">
        <button class="ghost" type="button" data-rename-warehouse="${escapeAttr(w)}">Перейменувати</button>
        <button class="danger" type="button" data-delete-warehouse="${escapeAttr(w)}">Видалити</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-rename-warehouse]').forEach(b => b.addEventListener('click', () => renameWarehouse(b.dataset.renameWarehouse)));
  $$('[data-delete-warehouse]').forEach(b => b.addEventListener('click', () => deleteWarehouse(b.dataset.deleteWarehouse)));
}

function renameWarehouse(oldName) {
  const value = prompt('Нова назва складу:', oldName);
  if (value === null) return;
  const newName = value.trim();
  if (!newName) return alert('Назва складу не може бути порожньою. Склад без назви — це вже квест, не робота.');
  if (newName === oldName) return;
  const warehouses = orderWarehouses();
  if (warehouses.includes(newName)) return alert('Такий склад уже є.');
  snapshot();
  state.currentOrder.warehouses = warehouses.map(w => w === oldName ? newName : w);
  state.currentOrder.items.forEach(i => { if ((i.warehouse || state.currentOrder.activeWarehouse || '1711') === oldName) i.warehouse = newName; });
  if (state.currentOrder.activeWarehouse === oldName) state.currentOrder.activeWarehouse = newName;
  markDirty();
  renderOrderItems();
}

function addWarehouse() {
  const value = ($('#newWarehouseInput').value || '').trim();
  if (!value) return alert('Введи номер або назву складу.');
  state.currentOrder.warehouses ||= [];
  if (!state.currentOrder.warehouses.includes(value)) state.currentOrder.warehouses.push(value);
  state.currentOrder.activeWarehouse = value;
  $('#newWarehouseInput').value = '';
  markDirty();
  renderOrderItems();
  renderWarehouseManager();
}

function deleteWarehouse(warehouse) {
  const warehouses = orderWarehouses();
  if (warehouses.length <= 1) return alert('Останній склад видалити не можна. Має залишитися хоча б один склад.');
  const count = warehouseItems(state.currentOrder, warehouse).length;
  const message = count
    ? `У складі ${warehouse} є позицій: ${count}. Видалити склад разом із цими позиціями?`
    : `Видалити склад ${warehouse}?`;
  if (!confirmAction(message)) return;
  snapshot();
  state.currentOrder.items = state.currentOrder.items.filter(i => (i.warehouse || state.currentOrder.activeWarehouse || '1711') !== warehouse);
  state.currentOrder.warehouses = warehouses.filter(w => w !== warehouse);
  if (state.currentOrder.activeWarehouse === warehouse) state.currentOrder.activeWarehouse = state.currentOrder.warehouses[0] || '1711';
  markDirty();
  renderOrderItems();
  renderWarehouseManager();
}

function renderOrderItems() {
  renderWarehouseTabs();
  const items = state.currentOrder.items;
  const sections = orderWarehouses().map(w => {
    const list = warehouseItems(state.currentOrder, w);
    const body = list.map(({item: i, idx}, sectionIdx) => `
    <div class="order-item" draggable="true" data-index="${idx}">
      <div class="item-main">
        <div class="item-line"><span class="item-name">${sectionIdx + 1}. ${escapeHtml(i.name)}</span></div>
        <div class="meta">${i.category || 'Інше'} • склад: ${escapeHtml(i.warehouse || w)} • потреба: ${i.needDate || 'не вказано'}</div>
        <div class="inline-edit">
          <input data-qty="${idx}" type="number" step="1" min="0" value="${i.qty}">
          <select data-unit="${idx}">${UNITS.map(u => `<option ${u === i.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
        </div>
        <input data-comment="${idx}" value="${escapeAttr(i.comment || '')}" placeholder="Коментар">
      </div>
      <div class="item-actions">
        <button class="ghost" data-move-warehouse="${idx}">В інший склад</button>
        <button class="ghost" data-up="${idx}">↑</button><button class="ghost" data-down="${idx}">↓</button>
        <button class="ghost" data-edit-item="${idx}">Ред.</button><button class="ghost" data-dup-item="${idx}">Дубль</button>
        <button class="danger" data-del-item="${idx}">Видалити</button>
      </div>
    </div>`).join('') || '<p class="hint">У цьому складі поки немає позицій.</p>';
    return `<section class="warehouse-section"><h3>Склад ${escapeHtml(w)}</h3>${body}</section>`;
  }).join('');
  $('#orderItems').innerHTML = items.length ? sections : '<p class="hint">Позицій ще немає. Обери склад зверху, знайди позицію і додай першу. Не гальмуй — це швидше, ніж шукати ручку. 🙂</p>';
  $('#totalItems').textContent = items.length;
  $('#urgentItems').textContent = items.filter(i => ['терміново','критично'].includes(i.urgency)).length;
  bindItemButtons();
}


function bindItemButtons() {
  $$('[data-edit-item]').forEach(b => b.addEventListener('click', () => editItem(Number(b.dataset.editItem))));
  $$('[data-del-item]').forEach(b => b.addEventListener('click', () => deleteItem(Number(b.dataset.delItem))));
  $$('[data-dup-item]').forEach(b => b.addEventListener('click', () => duplicateItem(Number(b.dataset.dupItem))));
  $$('[data-move-warehouse]').forEach(b => b.addEventListener('click', () => moveItemToWarehouse(Number(b.dataset.moveWarehouse))));
  $$('[data-up]').forEach(b => b.addEventListener('click', () => moveItem(Number(b.dataset.up), -1)));
  $$('[data-down]').forEach(b => b.addEventListener('click', () => moveItem(Number(b.dataset.down), 1)));
  $$('[data-qty]').forEach(inp => inp.addEventListener('input', () => { state.currentOrder.items[Number(inp.dataset.qty)].qty = Number(inp.value); markDirty(); }));
  $$('[data-unit]').forEach(sel => sel.addEventListener('change', () => { state.currentOrder.items[Number(sel.dataset.unit)].unit = sel.value; markDirty(); }));
  $$('[data-comment]').forEach(inp => inp.addEventListener('input', () => { state.currentOrder.items[Number(inp.dataset.comment)].comment = inp.value; markDirty(); }));
  $$('.order-item').forEach(card => {
    card.addEventListener('dragstart', () => { draggedIndex = Number(card.dataset.index); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', () => { const target = Number(card.dataset.index); if (draggedIndex !== null && draggedIndex !== target) reorder(draggedIndex, target); draggedIndex = null; });
  });
}
function urgencyClass(v) { return ({ 'важливо': 'important', 'терміново': 'urgent', 'критично': 'critical' })[v] || ''; }
function isUrgentItem(i) { return ['терміново','критично'].includes(i.urgency); }
function urgencyMark(i) { return String(i.urgency || 'звичайно').toUpperCase(); }
function qtyWithUnit(i) { return `${Number(i.qty).toLocaleString('uk-UA', { maximumFractionDigits: 3 })} ${i.unit}`; }
function editItem(idx) {
  const i = state.currentOrder.items[idx];
  $('#itemEditIndex').value = idx; $('#itemModalTitle').textContent = 'Редагувати позицію';
  $('#itemName').value = i.name; $('#itemQty').value = i.qty; $('#itemUnit').value = i.unit;
  $('#itemComment').value = i.comment || ''; $('#itemUrgency').value = i.urgency; $('#itemNeedDate').value = i.needDate || '';
  $('#itemModal').showModal();
}
function deleteItem(idx) { if (!confirmAction('Видалити позицію із замовлення?')) return; snapshot(); state.currentOrder.items.splice(idx,1); markDirty(); saveState('Видалено позицію із замовлення'); renderOrderItems(); }
function duplicateItem(idx) { snapshot(); state.currentOrder.items.splice(idx+1,0,{...state.currentOrder.items[idx], id: uid()}); markDirty(); renderOrderItems(); }
function moveItemToWarehouse(idx) {
  const warehouses = orderWarehouses();
  const current = state.currentOrder.items[idx]?.warehouse || state.currentOrder.activeWarehouse || '1711';
  const target = prompt(`Перенести в який склад? Доступні: ${warehouses.join(', ')}`, current);
  if (!target) return;
  snapshot();
  if (!state.currentOrder.warehouses.includes(target)) state.currentOrder.warehouses.push(target);
  state.currentOrder.items[idx].warehouse = target;
  state.currentOrder.activeWarehouse = target;
  markDirty();
  renderOrderItems();
}
function moveItem(idx, dir) { const n = idx + dir; if (n < 0 || n >= state.currentOrder.items.length) return; reorder(idx, n); }
function reorder(from, to) { snapshot(); const [it] = state.currentOrder.items.splice(from,1); state.currentOrder.items.splice(to,0,it); markDirty(); renderOrderItems(); }
function toggleFavorite(id) { const p = state.positions.find(x => x.id === id); if (p) { p.favorite = !p.favorite; saveState('Змінено обране'); renderAll(); } }

function bindDirectoryEvents() {
  $('#positionForm').addEventListener('submit', savePosition);
  $('#closePositionModal').addEventListener('click', () => $('#positionModal').close());
  $('#directorySearch').addEventListener('input', renderDirectory);
  const bulkAddBtn = $('#bulkAddPositionsBtn');
  const bulkClearBtn = $('#bulkClearPositionsBtn');
  if (bulkAddBtn) {
    bulkAddBtn.dataset.bound = '1';
    bulkAddBtn.addEventListener('click', addPositionsFromText);
  }
  if (bulkClearBtn) bulkClearBtn.dataset.bound = '1';
  bulkClearBtn?.addEventListener('click', () => {
    $('#bulkPositionsInput').value = '';
    $('#bulkAddResult').textContent = '';
  });
}
function openPositionModal(p = null) {
  $('#modalTitle').textContent = p ? 'Редагувати позицію' : 'Нова позиція';
  $('#positionId').value = p?.id || ''; $('#positionName').value = p?.name || '';
  $('#positionCategory').value = p?.category || 'Сировина'; $('#positionUnit').value = p?.unit || 'кг'; $('#positionNote').value = p?.note || '';
  $('#positionModal').showModal();
}
function savePosition(e) {
  e.preventDefault(); snapshot();
  const id = $('#positionId').value;
  const data = { name: $('#positionName').value.trim(), category: $('#positionCategory').value, unit: $('#positionUnit').value, note: $('#positionNote').value.trim() };
  if (!data.name) return alert('Назва позиції обовʼязкова. Без назви це не позиція, а привид на складі.');
  if (id) Object.assign(state.positions.find(p => p.id === id), data);
  else state.positions.push({ id: uid(), ...data, favorite: false, usage: 0, createdAt: Date.now() });
  saveState(id ? 'Відредаговано позицію довідника' : 'Додано позицію в довідник');
  $('#positionModal').close(); renderAll();
}
function renderDirectory() {
  const q = normalize($('#directorySearch').value);
  const list = sortedPositions().filter(p => !q || normalize(`${p.name} ${p.category} ${p.note}`).includes(q));
  $('#directoryList').innerHTML = list.map(p => `<div class="record-card"><b>${escapeHtml(p.name)} ${Date.now() - (p.createdAt || 0) < 604800000 ? '<span class="badge">нова</span>' : ''}</b><div class="meta">${p.category} • ${p.unit}</div><p class="hint">${escapeHtml(p.note || '')}</p><div class="card-actions"><button class="primary" data-edit-pos="${p.id}">Редагувати</button><button class="danger" data-del-pos="${p.id}">Видалити</button></div></div>`).join('');
  $$('[data-edit-pos]').forEach(b => b.addEventListener('click', () => openPositionModal(state.positions.find(p => p.id === b.dataset.editPos))));
  $$('[data-del-pos]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити позицію з довідника?')) { snapshot(); state.positions = state.positions.filter(p => p.id !== b.dataset.delPos); saveState('Видалено позицію з довідника'); renderAll(); }}));
}

function addPositionsFromText() {
  const input = $('#bulkPositionsInput');
  const result = $('#bulkAddResult');
  const names = input.value
    .split(/\r?\n/)
    .map(v => v.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const uniqueNames = [];
  const seenInput = new Set();
  names.forEach(name => {
    const key = normalize(name);
    if (!seenInput.has(key)) {
      seenInput.add(key);
      uniqueNames.push(name);
    }
  });

  if (!uniqueNames.length) {
    result.textContent = 'Впиши назву товару або встав список.';
    return;
  }

  snapshot();
  const existing = new Set(state.positions.map(p => normalize(p.name)));
  let added = 0;
  let skipped = 0;

  uniqueNames.forEach(name => {
    const key = normalize(name);
    if (existing.has(key)) {
      skipped++;
      return;
    }
    state.positions.push({
      id: uid(),
      name,
      category: 'Сировина',
      unit: 'кг',
      note: '',
      favorite: false,
      usage: 0,
      createdAt: Date.now()
    });
    existing.add(key);
    added++;
  });

  saveState('Додано товари в довідник');
  input.value = '';
  result.textContent = `Додано: ${added}. Пропущено дублікатів: ${skipped}.`;
  renderAll();
}

function bindTemplateEvents() { $('#saveTemplateBtn').addEventListener('click', saveTemplate); }
function saveTemplate() {
  if (!state.currentOrder.items.length) return alert('Немає позицій для шаблону.');
  const name = prompt('Назва шаблону:', 'Нове замовлення');
  if (!name) return;
  snapshot(); state.templates.unshift({ id: uid(), name, activeWarehouse: state.currentOrder.activeWarehouse, warehouses: structuredClone(orderWarehouses()), items: structuredClone(state.currentOrder.items), createdAt: new Date().toISOString() });
  saveState('Створено шаблон'); renderTemplates();
}
function renderTemplates() {
  $('#templatesList').innerHTML = state.templates.map(t => `<div class="record-card"><b>${escapeHtml(t.name)}</b><div class="meta">${t.items.length} позицій • ${new Date(t.createdAt).toLocaleString('uk-UA')}</div><div class="card-actions"><button class="success" data-load-template="${t.id}">Завантажити</button><button class="ghost" data-dup-template="${t.id}">Дублювати</button><button class="danger" data-del-template="${t.id}">Видалити</button></div></div>`).join('') || '<p class="hint">Шаблонів ще немає.</p>';
  $$('[data-load-template]').forEach(b => b.addEventListener('click', () => loadTemplate(b.dataset.loadTemplate)));
  $$('[data-dup-template]').forEach(b => b.addEventListener('click', () => { const t = state.templates.find(x=>x.id===b.dataset.dupTemplate); state.templates.unshift({...structuredClone(t), id:uid(), name:t.name+' — копія'}); saveState('Дубльовано шаблон'); renderTemplates(); }));
  $$('[data-del-template]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити шаблон?')) { state.templates = state.templates.filter(t=>t.id!==b.dataset.delTemplate); saveState('Видалено шаблон'); renderTemplates(); }}));
}
function loadTemplate(id) { const t = state.templates.find(x=>x.id===id); if (!t) return; snapshot(); state.currentOrder.items = structuredClone(t.items).map(i=>({...i,id:uid()})); state.currentOrder.warehouses = t.warehouses || orderWarehouses({items: state.currentOrder.items, warehouses: []}); state.currentOrder.activeWarehouse = t.activeWarehouse || state.currentOrder.warehouses[0] || '1711'; markDirty(); showScreen('order'); renderAll(); }

function bindHistoryEvents() { $('#historySearch').addEventListener('input', renderHistory); $('#clearHistoryBtn').addEventListener('click', () => { if(confirmAction('Очистити всю історію?')) { snapshot(); state.history=[]; saveState('Очищено історію'); renderHistory(); }}); }
function historyRecordFromCurrentOrder() {
  readMetaFromForm();
  if (!state.currentOrder.meta.date || !state.currentOrder.meta.responsible) return alert('Заповни дату замовлення і відповідального.');
  if (!state.currentOrder.items.length) return alert('Додай хоча б одну позицію. Порожня заявка — це вже філософія, не виробництво.');
  return { id: uid(), createdAt: new Date().toISOString(), meta: structuredClone(state.currentOrder.meta), activeWarehouse: state.currentOrder.activeWarehouse, warehouses: structuredClone(orderWarehouses()), items: structuredClone(state.currentOrder.items) };
}
function saveToHistory() {
  const record = historyRecordFromCurrentOrder();
  if (!record) return;
  snapshot();
  state.history.unshift(record);
  state.currentOrder.dirty = false; saveState('Замовлення збережено в історію'); renderAll(); alert('Замовлення збережено.');
}
function archiveCurrentOrderSilently(reason) {
  if (!state.currentOrder.items.length) return false;
  const meta = state.currentOrder.meta || {};
  if (!meta.date) meta.date = today();
  state.history.unshift({ id: uid(), createdAt: new Date().toISOString(), meta: structuredClone(meta), activeWarehouse: state.currentOrder.activeWarehouse, warehouses: structuredClone(orderWarehouses()), items: structuredClone(state.currentOrder.items) });
  saveState(reason);
  return true;
}
function blankOrder(date = today()) {
  return { meta: { date, responsible: state.settings.defaultResponsible || '', notes: '' }, items: [], dirty: false, activeWarehouse: '1711', warehouses: ['1711', '1719'] };
}
function createNewOrder() {
  const hasItems = state.currentOrder.items.length > 0;
  const message = hasItems
    ? 'Створити нове замовлення? Поточне замовлення буде збережено в історію.'
    : 'Створити нове порожнє замовлення?';
  if (!confirmAction(message)) return;
  snapshot();
  if (hasItems) archiveCurrentOrderSilently('Поточне замовлення збережено перед створенням нового');
  state.currentOrder = blankOrder();
  syncMetaToForm();
  saveState('Створено нове замовлення');
  renderAll();
}
function rolloverOrderForNewDay() {
  if (state.settings.autoNewDay === false) return;
  const orderDate = state.currentOrder?.meta?.date;
  const todayValue = today();
  if (!orderDate || orderDate === todayValue) return;
  if (state.currentOrder.items?.length) archiveCurrentOrderSilently('Автоматично збережено замовлення попереднього дня');
  state.currentOrder = blankOrder(todayValue);
  saveState('Автоматично створено замовлення на новий день');
}
function renderHistory() {
  const q = normalize($('#historySearch').value);
  const list = state.history.filter(h => !q || normalize(`${h.meta.date} ${h.meta.responsible}`).includes(q));
  $('#historyList').innerHTML = list.map(h => `<div class="record-card"><b>Замовлення на: ${h.meta.date}</b><div class="meta">Відповідальний: ${escapeHtml(h.meta.responsible || '-')} • позицій: ${h.items.length}</div><div class="card-actions"><button class="primary" data-view-h="${h.id}">Перегляд</button><button class="success" data-open-h="${h.id}">Відкрити</button><button class="ghost" data-load-h="${h.id}">Повторити</button><button class="ghost" data-copy-h="${h.id}">Копіювати</button><button class="danger" data-del-h="${h.id}">Видалити</button></div></div>`).join('') || '<p class="hint">Історія порожня.</p>';
  $$('[data-view-h]').forEach(b => b.addEventListener('click', () => viewHistory(b.dataset.viewH)));
  $$('[data-open-h]').forEach(b => b.addEventListener('click', () => openHistoryForEdit(b.dataset.openH)));
  $$('[data-load-h]').forEach(b => b.addEventListener('click', () => loadHistoryAsNew(b.dataset.loadH)));
  $$('[data-copy-h]').forEach(b => b.addEventListener('click', () => copyText(formatOrderText(state.history.find(h=>h.id===b.dataset.copyH)))));
  $$('[data-del-h]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити запис історії?')) { state.history = state.history.filter(h=>h.id!==b.dataset.delH); saveState('Видалено запис історії'); renderHistory(); }}));
}
function viewHistory(id) { const h = state.history.find(x=>x.id===id); $('#viewTitle').textContent = 'Замовлення з історії'; $('#viewContent').textContent = formatOrderText(h); $('#viewModal').showModal(); }
function orderFromHistory(h, dirty = true) {
  return migrateState({ currentOrder: { meta: structuredClone(h.meta), items: structuredClone(h.items).map(i=>({...i,id:uid()})), dirty, activeWarehouse: h.activeWarehouse || '1711', warehouses: h.warehouses || orderWarehouses(h) } }).currentOrder;
}
function openHistoryForEdit(id) {
  const h = state.history.find(x=>x.id===id);
  if (!h) return;
  if (state.currentOrder.items.length && !confirmAction('Відкрити це замовлення на головному екрані? Поточне незбережене замовлення буде замінено.')) return;
  snapshot();
  state.currentOrder = orderFromHistory(h, true);
  syncMetaToForm();
  saveState('Замовлення з історії відкрито для редагування');
  showScreen('order');
  renderAll();
}
function loadHistoryAsNew(id) { const h = state.history.find(x=>x.id===id); if (!h) return; snapshot(); state.currentOrder = orderFromHistory(h, true); syncMetaToForm(); saveState('Історію завантажено для повторного використання'); showScreen('order'); renderAll(); }
$('#closeViewModal').addEventListener('click', () => $('#viewModal').close());


function formatDateUa(value) {
  if (!value) return '';
  const parts = String(value).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('uk-UA');
}
function pdfTitleDate(value) {
  return formatDateUa(value) || new Date().toLocaleDateString('uk-UA');
}

function formatOrderText(source = state.currentOrder) {
  const m = source.meta;
  const urgent = source.items.filter(isUrgentItem).length;
  const sections = orderWarehouses(source).map(w => {
    const rows = warehouseItems(source, w).map(({item: i}, idx) => `${idx + 1}. [${urgencyMark(i)}] ${i.name} | ${qtyWithUnit(i)} | ${i.comment || '-'}`).join('\n') || 'Позицій немає';
    return `\nСКЛАД ${w}\n№ | Статус | Найменування | Кількість | Коментар\n${rows}`;
  }).join('\n');
  return `ЗАМОВЛЕННЯ ЗІ СКЛАДУ\nЗамовлення на: ${m.date}\n\nВідповідальний: ${m.responsible}\n${sections}\n\nВсього позицій: ${source.items.length}\nТермінових: ${urgent}\nПримітки: ${m.notes || '-'}\n\nДата формування: ${new Date().toLocaleDateString('uk-UA')}\nПідпис відповідального: ____________________`;
}
function formatOrderTable(source = state.currentOrder) {
  const lines = [];
  orderWarehouses(source).forEach(w => {
    lines.push(`Склад ${w}`);
    lines.push('№\tСтатус\tНайменування\tКількість\tКоментар');
    warehouseItems(source, w).forEach(({item: i}, idx) => lines.push(`${idx+1}\t${urgencyMark(i)}\t${i.name}\t${qtyWithUnit(i)}\t${i.comment || ''}`));
    lines.push('');
  });
  return lines.join('\n');
}
async function copyText(text) { await navigator.clipboard.writeText(text); alert('Скопійовано.'); }
function shareOrder() { const text = formatOrderText(); if (navigator.share) navigator.share({ title: 'Замовлення зі складу', text }); else copyText(text); }
function exportPDF() {
  try {
    readMetaFromForm();
    if (!state.currentOrder.items.length) {
      alert('У замовленні немає позицій для PDF.');
      return;
    }
    const html = buildPrintHtml();
    const w = window.open('', '_blank');
    if (!w) {
      alert('Браузер заблокував відкриття PDF-вікна. Дозволь спливаючі вікна для цього додатка і натисни ще раз.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch (e) { console.error(e); }
    }, 500);
  } catch (err) {
    console.error('PDF error:', err);
    alert('PDF не сформовано: ' + (err && err.message ? err.message : err));
  }
}
function buildPrintHtml() {
  const m = state.currentOrder.meta || {};
  const visibleWarehouses = orderWarehouses().filter(w => warehouseItems(state.currentOrder, w).length);
  const longestNameLength = Math.max(12, ...state.currentOrder.items.map(i => String(i.name || '').length));
  const nameColumnWidth = Math.min(25, Math.max(16, Math.round(longestNameLength * 0.55)));
  const sections = visibleWarehouses.map(w => {
    const rows = warehouseItems(state.currentOrder, w).map(({item: i}, idx) => {
      const status = urgencyMark(i);
      const rowClass = i.urgency === 'критично' ? ' class="critical-row"' : (i.urgency === 'терміново' ? ' class="urgent-row"' : (i.urgency === 'важливо' ? ' class="important-row"' : ''));
      return `<tr${rowClass}><td class="center">${idx+1}</td><td class="status-cell">${escapeHtml(status)}</td><td class="name-cell"><span>${escapeHtml(i.name)}</span></td><td class="qty-cell">${escapeHtml(qtyWithUnit(i))}</td><td>${escapeHtml(i.comment || '')}</td></tr>`;
    }).join('');
    return `<section class="pdf-warehouse"><h2>СКЛАД ${escapeHtml(w)}</h2><table><colgroup><col class="c-num"><col class="c-status"><col class="c-name"><col class="c-qty"><col class="c-comment"></colgroup><thead><tr><th>№</th><th>Статус</th><th>Найменування</th><th>Кількість</th><th>Коментар</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  const formedDate = new Date().toLocaleDateString('uk-UA');
  const titleDate = pdfTitleDate(m.date);
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Замовлення на ${titleDate}</title><style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:8px;margin:0;background:#fff}h1{font-size:20px;text-align:center;margin:0 0 11px;text-transform:uppercase;letter-spacing:.2px}.meta{display:block;margin:0 0 11px;font-size:12px;line-height:1.35}.meta div{margin:1px 0}.pdf-warehouse{margin:0 0 12px;padding:0;break-inside:avoid}.pdf-warehouse h2{font-size:15px;margin:0 0 4px;padding:5px 7px;border:1px solid #333;background:#eef2f7;text-align:left;font-weight:800}.pdf-warehouse table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px;line-height:1.25;margin:0 0 8px}.pdf-warehouse th,.pdf-warehouse td{border:1px solid #333;padding:8px 6px;vertical-align:top;text-align:left;min-height:34px}.pdf-warehouse th{background:#f8fafc;font-size:14px;font-weight:900}.pdf-warehouse td{font-weight:700}.c-num{width:34px}.c-status{width:86px}.c-name{width:${nameColumnWidth}%}.c-qty{width:88px}.c-comment{width:auto}.center{text-align:center!important;font-size:14px;font-weight:900}.status-cell{font-weight:900;font-size:11px;white-space:nowrap}.name-cell span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qty-cell{white-space:nowrap;font-weight:900}.urgent-row{background:#fff7ed}.critical-row{background:#fee2e2}.important-row{background:#fffbeb}.foot{margin-top:8px;font-size:12px;line-height:1.3}.foot p{margin:3px 0}@media print{@page{size:A4;margin:8mm}body{padding:0}.pdf-warehouse{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><h1>ЗАМОВЛЕННЯ НА ${titleDate}</h1><div class="meta"><div>Відповідальний: <b>${escapeHtml(m.responsible || '-')}</b></div><div>Дата формування: <b>${formedDate}</b></div></div>${sections}<div class="foot"><p>Примітки: ${escapeHtml(m.notes || '-')}</p><p>Підпис відповідального: ____________________ ${escapeHtml(state.settings.pdfSignature || '')}</p></div></body></html>`;
}
function exportEditableDocument(type) {
  readMetaFromForm();
  if (!state.currentOrder.items.length) {
    alert('У замовленні немає позицій для вивантаження.');
    return;
  }
  const isExcel = type === 'excel';
  const content = isExcel ? buildExcelWorkbookXml() : buildWordDocumentHtml();
  const date = safeFilePart(state.currentOrder.meta?.date || today());
  const ext = isExcel ? 'xls' : 'doc';
  const mime = isExcel ? 'application/vnd.ms-excel;charset=utf-8' : 'application/msword;charset=utf-8';
  downloadBlob(`zamovlennia-${date}.${ext}`, content, mime);
}
function buildWordDocumentHtml() {
  const m = state.currentOrder.meta || {};
  const visibleWarehouses = orderWarehouses().filter(w => warehouseItems(state.currentOrder, w).length);
  const formedDate = new Date().toLocaleDateString('uk-UA');
  const titleDate = pdfTitleDate(m.date);
  const sections = visibleWarehouses.map(w => {
    const rows = warehouseItems(state.currentOrder, w).map(({item: i}, idx) => {
      const rowClass = i.urgency === 'критично' ? ' class="critical-row"' : (i.urgency === 'терміново' ? ' class="urgent-row"' : (i.urgency === 'важливо' ? ' class="important-row"' : ''));
      return `<tr${rowClass}><td class="center">${idx + 1}</td><td class="status-cell">${escapeHtml(urgencyMark(i))}</td><td class="name-cell">${escapeHtml(i.name)}</td><td class="qty-cell">${escapeHtml(qtyWithUnit(i))}</td><td>${escapeHtml(i.comment || '')}</td></tr>`;
    }).join('');
    return `<section class="doc-warehouse"><h2>СКЛАД ${escapeHtml(w)}</h2><table><colgroup><col class="c-num"><col class="c-status"><col class="c-name"><col class="c-qty"><col class="c-comment"></colgroup><thead><tr><th>№</th><th>Статус</th><th>Найменування</th><th>Кількість</th><th>Коментар</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>Замовлення на ${titleDate}</title><style>
@page WordSection1{size:841.95pt 595.35pt;margin:28.35pt 22.7pt 28.35pt 22.7pt}body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;margin:0}div.WordSection1{page:WordSection1}h1{font-size:18pt;text-align:center;margin:0 0 8pt;text-transform:uppercase}.meta{font-size:10pt;line-height:1.25;margin:0 0 8pt}.doc-warehouse{margin:0 0 10pt;page-break-inside:avoid}.doc-warehouse h2{font-size:12pt;margin:0 0 3pt;padding:4pt 5pt;border:1pt solid #333;background:#eef2f7;font-weight:800}.doc-warehouse table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10pt;line-height:1.2;margin:0 0 6pt}.doc-warehouse th,.doc-warehouse td{border:1pt solid #333;padding:6pt 5pt;vertical-align:top;text-align:left;height:28pt}.doc-warehouse th{background:#f8fafc;font-size:10.5pt;font-weight:900}.doc-warehouse td{font-weight:700}.c-num{width:5%}.c-status{width:12%}.c-name{width:25%}.c-qty{width:13%}.c-comment{width:45%}.center{text-align:center!important;font-size:11pt;font-weight:900}.status-cell{font-weight:900;font-size:9pt;white-space:nowrap}.name-cell{white-space:normal;word-break:normal}.qty-cell{white-space:nowrap;font-weight:900}.urgent-row{background:#fff7ed}.critical-row{background:#fee2e2}.important-row{background:#fffbeb}.foot{margin-top:6pt;font-size:10pt;line-height:1.25}.foot p{margin:2pt 0}
</style></head><body><div class="WordSection1"><h1>ЗАМОВЛЕННЯ НА ${titleDate}</h1><div class="meta"><div>Відповідальний: <b>${escapeHtml(m.responsible || '-')}</b></div><div>Дата формування: <b>${formedDate}</b></div></div>${sections}<div class="foot"><p>Примітки: ${escapeHtml(m.notes || '-')}</p><p>Підпис відповідального: ____________________ ${escapeHtml(state.settings.pdfSignature || '')}</p></div></div></body></html>`;
}
function buildExcelWorkbookXml() {
  const m = state.currentOrder.meta || {};
  const titleDate = pdfTitleDate(m.date);
  const formedDate = new Date().toLocaleDateString('uk-UA');
  const rows = [
    `<Row ss:Height="24"><Cell ss:MergeAcross="4" ss:StyleID="title"><Data ss:Type="String">ЗАМОВЛЕННЯ НА ${escapeXml(titleDate)}</Data></Cell></Row>`,
    `<Row><Cell ss:MergeAcross="4" ss:StyleID="meta"><Data ss:Type="String">Відповідальний: ${escapeXml(m.responsible || '-')}</Data></Cell></Row>`,
    `<Row><Cell ss:MergeAcross="4" ss:StyleID="meta"><Data ss:Type="String">Дата формування: ${escapeXml(formedDate)}</Data></Cell></Row>`,
    '<Row></Row>'
  ];
  orderWarehouses().filter(w => warehouseItems(state.currentOrder, w).length).forEach(w => {
    rows.push(`<Row ss:Height="22"><Cell ss:MergeAcross="4" ss:StyleID="warehouse"><Data ss:Type="String">СКЛАД ${escapeXml(w)}</Data></Cell></Row>`);
    rows.push('<Row ss:Height="24"><Cell ss:StyleID="head"><Data ss:Type="String">№</Data></Cell><Cell ss:StyleID="head"><Data ss:Type="String">Статус</Data></Cell><Cell ss:StyleID="head"><Data ss:Type="String">Найменування</Data></Cell><Cell ss:StyleID="head"><Data ss:Type="String">Кількість</Data></Cell><Cell ss:StyleID="head"><Data ss:Type="String">Коментар</Data></Cell></Row>');
    warehouseItems(state.currentOrder, w).forEach(({item: i}, idx) => {
      const style = i.urgency === 'критично' ? 'critical' : (i.urgency === 'терміново' ? 'urgent' : (i.urgency === 'важливо' ? 'important' : 'cell'));
      rows.push(`<Row ss:Height="34"><Cell ss:StyleID="num"><Data ss:Type="Number">${idx + 1}</Data></Cell><Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(urgencyMark(i))}</Data></Cell><Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(i.name)}</Data></Cell><Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(qtyWithUnit(i))}</Data></Cell><Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(i.comment || '')}</Data></Cell></Row>`);
    });
    rows.push('<Row></Row>');
  });
  rows.push(`<Row><Cell ss:MergeAcross="4" ss:StyleID="meta"><Data ss:Type="String">Примітки: ${escapeXml(m.notes || '-')}</Data></Cell></Row>`);
  rows.push(`<Row><Cell ss:MergeAcross="4" ss:StyleID="meta"><Data ss:Type="String">Підпис відповідального: ____________________ ${escapeXml(state.settings.pdfSignature || '')}</Data></Cell></Row>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="title"><Alignment ss:Horizontal="Center"/><Font ss:Bold="1" ss:Size="15"/></Style>
  <Style ss:ID="meta"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:Size="10"/></Style>
  <Style ss:ID="warehouse"><Alignment ss:Vertical="Center"/><Interior ss:Color="#EEF2F7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="12"/></Style>
  <Style ss:ID="head"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="11"/></Style>
  <Style ss:ID="cell"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="10"/></Style>
  <Style ss:ID="num"><Alignment ss:Horizontal="Center" ss:Vertical="Top"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="11"/></Style>
  <Style ss:ID="important"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Interior ss:Color="#FFFBEB" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="10"/></Style>
  <Style ss:ID="urgent"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Interior ss:Color="#FFF7ED" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="10"/></Style>
  <Style ss:ID="critical"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:Bold="1" ss:Size="10"/></Style>
 </Styles>
 <Worksheet ss:Name="Замовлення">
  <Table>
   <Column ss:Width="34"/>
   <Column ss:Width="74"/>
   <Column ss:Width="190"/>
   <Column ss:Width="82"/>
   <Column ss:Width="340"/>
   ${rows.join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`;
}
function safeFilePart(value) {
  return String(value || '').trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'document';
}
function escapeXml(value) {
  return String(value ?? '').replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}
function downloadBlob(name, content, mime) {
  const blob = new Blob(['\ufeff', content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
function clearOrder() { if(!confirmAction('Очистити поточне замовлення?')) return; snapshot(); state.currentOrder = { meta: { date: today(), responsible: state.settings.defaultResponsible, notes: '' }, items: [], dirty: false, activeWarehouse: '1711', warehouses: ['1711', '1719'] }; syncMetaToForm(); saveState('Очищено поточне замовлення'); renderAll(); }

function bindDataEvents() {
  $('#backupBtn').addEventListener('click', () => downloadJson(`warehouse-backup-${today()}.json`, state));
  $('#restoreBackupBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importJson);
  $('#wipeDataBtn').addEventListener('click', () => { if(confirmAction('Повністю очистити всі дані? Назад дороги не буде.')) { localStorage.removeItem(STORAGE_KEY); location.reload(); }});
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
  $('#refreshAppBtn')?.addEventListener('click', () => refreshAppCache(false));
  $('#installAppBtn')?.addEventListener('click', installApp);
}
function downloadJson(name, data) { downloadBlob(name, JSON.stringify(data, null, 2), 'application/json'); }
function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const backup = data.positions || data.history || data.currentOrder || data.templates || data.settings
        ? data
        : null;
      if (!backup) throw new Error('wrong-format');
      if (!confirmAction('Імпортувати резервну копію і замінити поточні локальні дані?')) return;
      snapshot();
      state = migrateState({
        positions: backup.positions,
        currentOrder: backup.currentOrder,
        history: backup.history,
        templates: backup.templates,
        settings: backup.settings,
        actions: backup.actions
      });
      saveState('Імпортовано резервну копію');
      renderAll();
      alert('Резервну копію імпортовано.');
    } catch {
      alert('Не вдалося імпортувати файл. Обери резервну копію цього додатка у форматі JSON.');
    } finally {
      e.target.value = '';
    }
  };
  r.readAsText(file);
}
function saveSettings() {
  state.settings = {
    ...state.settings,
    defaultShift: '',
    defaultResponsible: $('#defaultResponsible').value.trim(),
    pdfSignature: $('#pdfSignature').value.trim(),
    autoNewDay: $('#autoNewDay').checked,
    autoUpdateCache: $('#autoUpdateCache').checked
  };
  saveState('Збережено налаштування');
  alert('Налаштування збережено.');
}
function renderSettings() {
  $('#defaultResponsible').value = state.settings.defaultResponsible || '';
  $('#pdfSignature').value = state.settings.pdfSignature || '';
  $('#autoNewDay').checked = state.settings.autoNewDay !== false;
  $('#autoUpdateCache').checked = state.settings.autoUpdateCache !== false;
  $('#appInfo').textContent = `Версія: ${APP_VERSION} • остання перевірка оновлень: ${state.settings.lastCacheRefresh || 'ще не виконувалась'}`;
  $('#actionsLog').innerHTML = state.actions.map(a => `<div>${new Date(a.at).toLocaleString('uk-UA')} — ${escapeHtml(a.text)}</div>`).join('') || '<p class="hint">Журнал порожній.</p>';
}

function bindHotkeys() {
  document.addEventListener('keydown', e => {
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if (e.key === 'Escape') { $('#searchResults').classList.add('hidden'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
    if (e.key === 'Enter' && document.activeElement === $('#positionSearch')) { const first = $('#searchResults [data-add]'); if (first) first.click(); }
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveToHistory(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'c' && !inInput) { e.preventDefault(); copyText(formatOrderText()); }
  });
  window.addEventListener('beforeunload', e => { if (state.currentOrder.dirty && state.currentOrder.items.length) { e.preventDefault(); e.returnValue = ''; } });
}

function bindPWA() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').classList.remove('hidden'); });
  $('#installBtn').addEventListener('click', installApp);
}
async function installApp() {
  if (!deferredPrompt) {
    alert('Автоматичне встановлення зараз недоступне в цьому браузері. Android/Chrome або Windows/Mac Chrome/Edge зазвичай показують кнопку встановлення. На iPhone відкрий Safari: Поділитися → На екран Домівки.');
    return;
  }
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null;
  $('#installBtn').classList.add('hidden');
}
async function refreshAppCache(silent = true) {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    }
    await Promise.all(CORE_ASSETS.map(path => fetch(`${path}?refresh=${Date.now()}`, { cache: 'reload' }).catch(() => null)));
    state.settings.lastCacheRefresh = today();
    saveState('Оновлено кеш додатка');
    if (!silent) {
      alert('Кеш оновлено. Сторінка перезавантажиться, локальні дані залишаться на місці.');
      location.reload();
    }
  } catch {
    if (!silent) alert('Не вдалося оновити кеш. Перевір підключення або відкрий додаток через сайт.');
  }
}
function checkDailyAppUpdate() {
  if (state.settings.autoUpdateCache === false) return;
  if (state.settings.lastCacheRefresh === today()) return;
  refreshAppCache(true);
}
function restoreDraftNotice() { if (state.currentOrder.items.length && state.currentOrder.dirty) setTimeout(() => alert('Знайдено незавершену чернетку. Вона вже відновлена.'), 350); }
function renderAll() { syncMetaToForm(); renderOrderItems(); renderDirectory(); renderTemplates(); renderHistory(); renderSettings(); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
