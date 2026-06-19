'use strict';

// PWA-додаток без фреймворків. Усі дані зберігаються локально у localStorage.
const STORAGE_KEY = 'warehouse_order_pwa_v1';
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
const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

let state = loadState();
let deferredPrompt = null;
let currentFilter = 'all';
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
  initMeta();
  bindNavigation();
  bindOrderEvents();
  bindDirectoryEvents();
  bindTemplateEvents();
  bindHistoryEvents();
  bindDataEvents();
  bindHotkeys();
  bindPWA();
  restoreDraftNotice();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

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
  $('#positionSearch').addEventListener('focus', renderSearchResults);
  $('#positionSearch').addEventListener('input', renderSearchResults);
  $('#clearSearchBtn').addEventListener('click', () => { $('#positionSearch').value = ''; renderSearchResults(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) $('#searchResults').classList.add('hidden'); });
  $$('.chip').forEach(c => c.addEventListener('click', () => { currentFilter = c.dataset.filter; $$('.chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); renderQuickList(); }));
  $('#addWarehouseBtn')?.addEventListener('click', addWarehouse);
  $('#manageWarehousesBtn')?.addEventListener('click', openWarehouseManager);
  $('#closeWarehouseModal')?.addEventListener('click', () => $('#warehouseModal')?.close());
  $('#orderMetaForm').addEventListener('input', () => { readMetaFromForm(); markDirty(); });
  $('#itemForm').addEventListener('submit', saveItemFromModal);
  $('#closeItemModal').addEventListener('click', () => $('#itemModal').close());
  $('#copyTextBtn').addEventListener('click', () => copyText(formatOrderText()));
  $('#copyTableBtn').addEventListener('click', () => copyText(formatOrderTable()));
  $('#saveHistoryBtn').addEventListener('click', saveToHistory);
  const pdfBtn = $('#pdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', exportPDF);
  $('#shareBtn').addEventListener('click', shareOrder);
  const printBtn = $('#printBtn');
  if (printBtn) printBtn.addEventListener('click', () => exportPDF());
  $('#clearOrderBtn').addEventListener('click', clearOrder);
  $('#sortAlphaBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items.sort((a,b)=>a.name.localeCompare(b.name,'uk')); markDirty(); renderOrderItems(); });
  $('#sortCategoryBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items.sort((a,b)=>`${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`,'uk')); markDirty(); renderOrderItems(); });
  $('#clearCommentsBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items.forEach(i => i.comment = ''); markDirty(); renderOrderItems(); });
  $('#duplicateOrderBtn').addEventListener('click', () => { snapshot(); state.currentOrder.items = state.currentOrder.items.map(i => ({...i, id: uid()})); markDirty(); renderOrderItems(); });
  $('#undoBtn').addEventListener('click', undo);
}

function renderSearchResults() {
  const q = normalize($('#positionSearch').value);
  const results = sortedPositions().filter(p => !q || normalize(`${p.name} ${p.category}`).includes(q));
  $('#searchResults').innerHTML = results.map(p => `<button class="result-row" data-add="${p.id}"><span class="result-title">${escapeHtml(p.name)}</span><span class="meta">${p.category} • ${p.unit}</span></button>`).join('') || '<div class="result-row">Нічого не знайдено</div>';
  $('#searchResults').classList.remove('hidden');
  $$('[data-add]').forEach(b => b.addEventListener('click', () => openItemModalByPosition(b.dataset.add)));
}

function renderQuickList() {
  let list = sortedPositions();
  if (currentFilter === 'favorites') list = list.filter(p => p.favorite);
  if (currentFilter === 'top10') list = [...state.positions].sort((a,b)=>b.usage-a.usage).slice(0,10);
  if (currentFilter === 'top20') list = [...state.positions].sort((a,b)=>b.usage-a.usage).slice(0,20);
  $('#quickList').innerHTML = list.map(p => `<div class="quick-card"><div><b>${escapeHtml(p.name)}</b><div class="meta">${p.category} • ${p.unit} • використано: ${p.usage || 0}</div></div><div class="card-actions"><button class="primary" data-add="${p.id}">Додати</button><button class="ghost" data-fav="${p.id}">${p.favorite ? '★' : '☆'}</button></div></div>`).join('');
  $$('[data-add]').forEach(b => b.addEventListener('click', () => openItemModalByPosition(b.dataset.add)));
  $$('[data-fav]').forEach(b => b.addEventListener('click', () => toggleFavorite(b.dataset.fav)));
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
  $('#addPositionBtn').addEventListener('click', () => openPositionModal());
  $('#positionForm').addEventListener('submit', savePosition);
  $('#closePositionModal').addEventListener('click', () => $('#positionModal').close());
  $('#directorySearch').addEventListener('input', renderDirectory);
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
  $('#directoryList').innerHTML = list.map(p => `<div class="record-card"><b>${escapeHtml(p.name)} ${Date.now() - (p.createdAt || 0) < 604800000 ? '<span class="badge">нова</span>' : ''}</b><div class="meta">${p.category} • ${p.unit}</div><p class="hint">${escapeHtml(p.note || '')}</p><div class="card-actions"><button class="ghost" data-fav="${p.id}">${p.favorite ? '★ Обране' : '☆ В обране'}</button><button class="primary" data-edit-pos="${p.id}">Редагувати</button><button class="danger" data-del-pos="${p.id}">Видалити</button></div></div>`).join('');
  $$('[data-edit-pos]').forEach(b => b.addEventListener('click', () => openPositionModal(state.positions.find(p => p.id === b.dataset.editPos))));
  $$('[data-del-pos]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити позицію з довідника?')) { snapshot(); state.positions = state.positions.filter(p => p.id !== b.dataset.delPos); saveState('Видалено позицію з довідника'); renderAll(); }}));
  $$('[data-fav]').forEach(b => b.addEventListener('click', () => toggleFavorite(b.dataset.fav)));
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
function saveToHistory() {
  readMetaFromForm();
  if (!state.currentOrder.meta.date || !state.currentOrder.meta.responsible) return alert('Заповни дату замовлення і відповідального.');
  if (!state.currentOrder.items.length) return alert('Додай хоча б одну позицію. Порожня заявка — це вже філософія, не виробництво.');
  snapshot();
  state.history.unshift({ id: uid(), createdAt: new Date().toISOString(), meta: structuredClone(state.currentOrder.meta), activeWarehouse: state.currentOrder.activeWarehouse, warehouses: structuredClone(orderWarehouses()), items: structuredClone(state.currentOrder.items) });
  state.currentOrder.dirty = false; saveState('Замовлення збережено в історію'); renderAll(); alert('Замовлення збережено.');
}
function renderHistory() {
  const q = normalize($('#historySearch').value);
  const list = state.history.filter(h => !q || normalize(`${h.meta.date} ${h.meta.responsible}`).includes(q));
  $('#historyList').innerHTML = list.map(h => `<div class="record-card"><b>Замовлення на: ${h.meta.date}</b><div class="meta">Відповідальний: ${escapeHtml(h.meta.responsible || '-')} • позицій: ${h.items.length}</div><div class="card-actions"><button class="primary" data-view-h="${h.id}">Перегляд</button><button class="success" data-load-h="${h.id}">Дублювати як нове</button><button class="ghost" data-copy-h="${h.id}">Копіювати</button><button class="danger" data-del-h="${h.id}">Видалити</button></div></div>`).join('') || '<p class="hint">Історія порожня.</p>';
  $$('[data-view-h]').forEach(b => b.addEventListener('click', () => viewHistory(b.dataset.viewH)));
  $$('[data-load-h]').forEach(b => b.addEventListener('click', () => loadHistoryAsNew(b.dataset.loadH)));
  $$('[data-copy-h]').forEach(b => b.addEventListener('click', () => copyText(formatOrderText(state.history.find(h=>h.id===b.dataset.copyH)))));
  $$('[data-del-h]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити запис історії?')) { state.history = state.history.filter(h=>h.id!==b.dataset.delH); saveState('Видалено запис історії'); renderHistory(); }}));
}
function viewHistory(id) { const h = state.history.find(x=>x.id===id); $('#viewTitle').textContent = 'Замовлення з історії'; $('#viewContent').textContent = formatOrderText(h); $('#viewModal').showModal(); }
function loadHistoryAsNew(id) { const h = state.history.find(x=>x.id===id); snapshot(); state.currentOrder = migrateState({ currentOrder: { meta: {...h.meta, date: today()}, items: structuredClone(h.items).map(i=>({...i,id:uid()})), dirty: true, activeWarehouse: h.activeWarehouse || '1711', warehouses: h.warehouses || orderWarehouses(h) } }).currentOrder; syncMetaToForm(); saveState('Історію завантажено як нове замовлення'); showScreen('order'); renderAll(); }
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
    const rows = warehouseItems(source, w).map(({item: i}, idx) => `${idx + 1}. [${urgencyMark(i)}] ${i.name} | ${qtyWithUnit(i)} |  | ${i.comment || '-'}`).join('\n') || 'Позицій немає';
    return `\nСКЛАД ${w}\n№ | Статус | Найменування | Кількість | Видано | Коментар\n${rows}`;
  }).join('\n');
  return `ЗАМОВЛЕННЯ ЗІ СКЛАДУ\nЗамовлення на: ${m.date}\n\nВідповідальний: ${m.responsible}\n${sections}\n\nВсього позицій: ${source.items.length}\nТермінових: ${urgent}\nПримітки: ${m.notes || '-'}\n\nДата формування: ${new Date().toLocaleDateString('uk-UA')}\nПідпис відповідального: ____________________`;
}
function formatOrderTable(source = state.currentOrder) {
  const lines = [];
  orderWarehouses(source).forEach(w => {
    lines.push(`Склад ${w}`);
    lines.push('№\tСтатус\tНайменування\tКількість\tВидано\tКоментар');
    warehouseItems(source, w).forEach(({item: i}, idx) => lines.push(`${idx+1}\t${urgencyMark(i)}\t${i.name}\t${qtyWithUnit(i)}\t\t${i.comment || ''}`));
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
  const sections = visibleWarehouses.map(w => {
    const rows = warehouseItems(state.currentOrder, w).map(({item: i}, idx) => {
      const status = urgencyMark(i);
      const rowClass = i.urgency === 'критично' ? ' class="critical-row"' : (i.urgency === 'терміново' ? ' class="urgent-row"' : (i.urgency === 'важливо' ? ' class="important-row"' : ''));
      return `<tr${rowClass}><td class="center">${idx+1}</td><td class="status-cell">${escapeHtml(status)}</td><td>${escapeHtml(i.name)}</td><td class="qty-cell">${escapeHtml(qtyWithUnit(i))}</td><td class="issued-cell"></td><td>${escapeHtml(i.comment || '')}</td></tr>`;
    }).join('');
    return `<section class="pdf-warehouse"><h2>СКЛАД ${escapeHtml(w)}</h2><table><colgroup><col class="c-num"><col class="c-status"><col class="c-name"><col class="c-qty"><col class="c-issued"><col class="c-comment"></colgroup><thead><tr><th>№</th><th>Статус</th><th>Найменування</th><th>Кількість</th><th>Видано</th><th>Коментар</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  const formedDate = new Date().toLocaleDateString('uk-UA');
  const titleDate = pdfTitleDate(m.date);
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Замовлення на ${titleDate}</title><style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:8px;margin:0;background:#fff}h1{font-size:18px;text-align:center;margin:0 0 10px;text-transform:uppercase;letter-spacing:.2px}.meta{display:block;margin:0 0 10px;font-size:11px;line-height:1.35}.meta div{margin:1px 0}.pdf-warehouse{margin:0 0 10px;padding:0;break-inside:avoid}.pdf-warehouse h2{font-size:12px;margin:0 0 3px;padding:3px 5px;border:1px solid #333;background:#eef2f7;text-align:left}.pdf-warehouse table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:9.5px;line-height:1.15;margin:0 0 6px}.pdf-warehouse th,.pdf-warehouse td{border:1px solid #333;padding:3px 4px;vertical-align:top;text-align:left}.pdf-warehouse th{background:#f8fafc;font-weight:700}.c-num{width:24px}.c-status{width:70px}.c-name{width:40%}.c-qty{width:74px}.c-issued{width:64px}.c-comment{width:auto}.center{text-align:center!important}.status-cell{font-weight:700;font-size:8.8px;white-space:nowrap}.qty-cell{white-space:nowrap}.issued-cell{height:18px}.urgent-row{background:#fff7ed}.critical-row{background:#fee2e2}.important-row{background:#fffbeb}.foot{margin-top:7px;font-size:10.5px;line-height:1.25}.foot p{margin:2px 0}@media print{@page{size:A4;margin:8mm}body{padding:0}.pdf-warehouse{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><h1>ЗАМОВЛЕННЯ НА ${titleDate}</h1><div class="meta"><div>Відповідальний: <b>${escapeHtml(m.responsible || '-')}</b></div><div>Дата формування: <b>${formedDate}</b></div></div>${sections}<div class="foot"><p>Примітки: ${escapeHtml(m.notes || '-')}</p><p>Підпис відповідального: ____________________ ${escapeHtml(state.settings.pdfSignature || '')}</p></div></body></html>`;
}
function clearOrder() { if(!confirmAction('Очистити поточне замовлення?')) return; snapshot(); state.currentOrder = { meta: { date: today(), responsible: state.settings.defaultResponsible, notes: '' }, items: [], dirty: false, activeWarehouse: '1711', warehouses: ['1711', '1719'] }; syncMetaToForm(); saveState('Очищено поточне замовлення'); renderAll(); }

function bindDataEvents() {
  $('#exportAllBtn').addEventListener('click', () => downloadJson('warehouse-order-all.json', state));
  $('#exportDirectoryBtn').addEventListener('click', () => downloadJson('warehouse-directory.json', { positions: state.positions }));
  $('#exportHistoryBtn').addEventListener('click', () => downloadJson('warehouse-history.json', { history: state.history }));
  $('#backupBtn').addEventListener('click', () => downloadJson(`backup-${today()}.json`, state));
  $('#importFile').addEventListener('change', importJson);
  $('#wipeDataBtn').addEventListener('click', () => { if(confirmAction('Повністю очистити всі дані? Назад дороги не буде.')) { localStorage.removeItem(STORAGE_KEY); location.reload(); }});
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
}
function downloadJson(name, data) { const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
function importJson(e) { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(r.result); snapshot(); if(data.positions) state.positions = data.positions; if(data.history) state.history = data.history; if(data.currentOrder) state.currentOrder = data.currentOrder; if(data.templates) state.templates = data.templates; if(data.settings) state.settings = data.settings; state = migrateState(state); saveState('Імпортовано JSON'); renderAll(); alert('Імпорт завершено.'); } catch { alert('Файл JSON пошкоджений або неправильний.'); } }; r.readAsText(file); }
function saveSettings() { state.settings = { defaultShift: '', defaultResponsible: $('#defaultResponsible').value.trim(), pdfSignature: $('#pdfSignature').value.trim() }; saveState('Збережено налаштування'); alert('Налаштування збережено.'); }
function renderSettings() { $('#defaultResponsible').value = state.settings.defaultResponsible || ''; $('#pdfSignature').value = state.settings.pdfSignature || ''; $('#actionsLog').innerHTML = state.actions.map(a => `<div>${new Date(a.at).toLocaleString('uk-UA')} — ${escapeHtml(a.text)}</div>`).join('') || '<p class="hint">Журнал порожній.</p>'; }

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
  $('#installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt = null; $('#installBtn').classList.add('hidden'); });
}
function restoreDraftNotice() { if (state.currentOrder.items.length && state.currentOrder.dirty) setTimeout(() => alert('Знайдено незавершену чернетку. Вона вже відновлена.'), 350); }
function renderAll() { syncMetaToForm(); renderQuickList(); renderOrderItems(); renderDirectory(); renderTemplates(); renderHistory(); renderSettings(); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }


/* v27 bulk add fix */
function bindBulkImportPositions(){
  const btn = document.getElementById('bulkAddPositionsBtn');
  if(!btn || btn.dataset.boundV27) return;
  btn.dataset.boundV27='1';

  btn.addEventListener('click', () => {
    const ta = document.getElementById('bulkPositionsInput');
    const result = document.getElementById('bulkAddResult');
    if(!ta) return;

    const lines = ta.value.split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean);

    let added = 0;

    lines.forEach(name => {
      const exists = state.positions.some(p =>
        String(p.name || '').trim().toLowerCase() === name.toLowerCase()
      );

      if(!exists){
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
        added++;
      }
    });

    saveState('Масово додано позиції');
    renderAll();

    if(result){
      result.textContent = 'Додано позицій: ' + added;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(bindBulkImportPositions, 500);
});


/* v28: правильне видалення всіх позицій із довідника */
function bindDeleteAllPositionsFixed(){
  const btn = document.getElementById('deleteAllPositionsBtn');
  if(!btn || btn.dataset.boundV28) return;
  btn.dataset.boundV28 = '1';

  const cleanBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(cleanBtn, btn);

  cleanBtn.addEventListener('click', () => {
    if(!confirm('Видалити всі позиції з довідника?')) return;
    if(!confirm('Точно видалити весь список позицій?')) return;

    state.positions = [];
    saveState('Видалено всі позиції');
    renderAll();

    const result = document.getElementById('bulkAddResult');
    if(result) result.textContent = 'Усі позиції видалено.';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(bindDeleteAllPositionsFixed, 600);
});
