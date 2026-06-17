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
  if (saved) return JSON.parse(saved);
  return {
    positions: DEFAULT_POSITIONS.map(([name, category, unit]) => ({ id: uid(), name, category, unit, note: '', favorite: false, usage: 0, createdAt: Date.now() })),
    currentOrder: { meta: { date: today(), time: nowTime(), workshop: '', shift: '', responsible: '', notes: '' }, items: [], dirty: false },
    history: [],
    templates: [],
    settings: { defaultWorkshop: '', defaultShift: '', defaultResponsible: '', pdfSignature: '' },
    actions: []
  };
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
  meta.date ||= today(); meta.time ||= nowTime();
  meta.workshop ||= state.settings.defaultWorkshop;
  meta.shift ||= state.settings.defaultShift;
  meta.responsible ||= state.settings.defaultResponsible;
  syncMetaToForm();
}

function syncMetaToForm() {
  const m = state.currentOrder.meta;
  $('#orderDate').value = m.date || today();
  $('#orderTime').value = m.time || nowTime();
  $('#workshop').value = m.workshop || '';
  $('#shift').value = m.shift || '';
  $('#responsible').value = m.responsible || '';
  $('#orderNotes').value = m.notes || '';
}

function readMetaFromForm() {
  state.currentOrder.meta = {
    date: $('#orderDate').value,
    time: $('#orderTime').value,
    workshop: $('#workshop').value.trim(),
    shift: $('#shift').value.trim(),
    responsible: $('#responsible').value.trim(),
    notes: $('#orderNotes').value.trim()
  };
}

function bindNavigation() {
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => showScreen(btn.dataset.screen)));
}
function showScreen(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#screen-${name}`).classList.add('active');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  renderAll();
}

function bindOrderEvents() {
  $('#positionSearch').addEventListener('focus', renderSearchResults);
  $('#positionSearch').addEventListener('input', renderSearchResults);
  $('#clearSearchBtn').addEventListener('click', () => { $('#positionSearch').value = ''; renderSearchResults(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) $('#searchResults').classList.add('hidden'); });
  $$('.chip').forEach(c => c.addEventListener('click', () => { currentFilter = c.dataset.filter; $$('.chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); renderQuickList(); }));
  $('#orderMetaForm').addEventListener('input', () => { readMetaFromForm(); markDirty(); });
  $('#itemForm').addEventListener('submit', saveItemFromModal);
  $('#closeItemModal').addEventListener('click', () => $('#itemModal').close());
  $('#copyTextBtn').addEventListener('click', () => copyText(formatOrderText()));
  $('#copyTableBtn').addEventListener('click', () => copyText(formatOrderTable()));
  $('#saveHistoryBtn').addEventListener('click', saveToHistory);
  $('#pdfBtn').addEventListener('click', exportPDF);
  $('#shareBtn').addEventListener('click', shareOrder);
  $('#printBtn').addEventListener('click', () => window.print());
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
    category: state.positions.find(p => p.name === $('#itemName').value.trim())?.category || 'Інше'
  };
  if (!item.name || !item.qty) return alert('Заповни найменування і кількість. Магія без цифр не працює.');
  const editIndex = $('#itemEditIndex').value;
  if (editIndex !== '') state.currentOrder.items[Number(editIndex)] = { ...state.currentOrder.items[Number(editIndex)], ...item, id: state.currentOrder.items[Number(editIndex)].id };
  else state.currentOrder.items.push(item);
  const pos = state.positions.find(p => p.name === item.name);
  if (pos) pos.usage = (pos.usage || 0) + 1;
  markDirty();
  saveState(editIndex !== '' ? 'Відредаговано позицію замовлення' : 'Додано позицію в замовлення');
  $('#itemModal').close();
  renderAll();
}

function renderOrderItems() {
  const items = state.currentOrder.items;
  $('#orderItems').innerHTML = items.map((i, idx) => `
    <div class="order-item ${urgencyClass(i.urgency)}" draggable="true" data-index="${idx}">
      <div class="item-main">
        <div class="item-line"><span class="item-name">${idx + 1}. ${escapeHtml(i.name)}</span><span class="badge">${i.urgency}</span></div>
        <div class="meta">${i.category || 'Інше'} • потреба: ${i.needDate || 'не вказано'}</div>
        <div class="inline-edit">
          <input data-qty="${idx}" type="number" step="0.001" min="0" value="${i.qty}">
          <select data-unit="${idx}">${UNITS.map(u => `<option ${u === i.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
        </div>
        <input data-comment="${idx}" value="${escapeAttr(i.comment || '')}" placeholder="Коментар">
      </div>
      <div class="item-actions">
        <button class="ghost" data-up="${idx}">↑</button><button class="ghost" data-down="${idx}">↓</button>
        <button class="ghost" data-edit-item="${idx}">Ред.</button><button class="ghost" data-dup-item="${idx}">Дубль</button>
        <button class="danger" data-del-item="${idx}">Видалити</button>
      </div>
    </div>`).join('') || '<p class="hint">Позицій ще немає. Натисни пошук і додай першу. Не гальмуй — це швидше, ніж шукати ручку. 🙂</p>';
  $('#totalItems').textContent = items.length;
  $('#urgentItems').textContent = items.filter(i => ['терміново','критично'].includes(i.urgency)).length;
  bindItemButtons();
}

function bindItemButtons() {
  $$('[data-edit-item]').forEach(b => b.addEventListener('click', () => editItem(Number(b.dataset.editItem))));
  $$('[data-del-item]').forEach(b => b.addEventListener('click', () => deleteItem(Number(b.dataset.delItem))));
  $$('[data-dup-item]').forEach(b => b.addEventListener('click', () => duplicateItem(Number(b.dataset.dupItem))));
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
function editItem(idx) {
  const i = state.currentOrder.items[idx];
  $('#itemEditIndex').value = idx; $('#itemModalTitle').textContent = 'Редагувати позицію';
  $('#itemName').value = i.name; $('#itemQty').value = i.qty; $('#itemUnit').value = i.unit;
  $('#itemComment').value = i.comment || ''; $('#itemUrgency').value = i.urgency; $('#itemNeedDate').value = i.needDate || '';
  $('#itemModal').showModal();
}
function deleteItem(idx) { if (!confirmAction('Видалити позицію із замовлення?')) return; snapshot(); state.currentOrder.items.splice(idx,1); markDirty(); saveState('Видалено позицію із замовлення'); renderOrderItems(); }
function duplicateItem(idx) { snapshot(); state.currentOrder.items.splice(idx+1,0,{...state.currentOrder.items[idx], id: uid()}); markDirty(); renderOrderItems(); }
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
  const name = prompt('Назва шаблону:', state.currentOrder.meta.workshop || 'Новий шаблон');
  if (!name) return;
  snapshot(); state.templates.unshift({ id: uid(), name, items: structuredClone(state.currentOrder.items), createdAt: new Date().toISOString() });
  saveState('Створено шаблон'); renderTemplates();
}
function renderTemplates() {
  $('#templatesList').innerHTML = state.templates.map(t => `<div class="record-card"><b>${escapeHtml(t.name)}</b><div class="meta">${t.items.length} позицій • ${new Date(t.createdAt).toLocaleString('uk-UA')}</div><div class="card-actions"><button class="success" data-load-template="${t.id}">Завантажити</button><button class="ghost" data-dup-template="${t.id}">Дублювати</button><button class="danger" data-del-template="${t.id}">Видалити</button></div></div>`).join('') || '<p class="hint">Шаблонів ще немає.</p>';
  $$('[data-load-template]').forEach(b => b.addEventListener('click', () => loadTemplate(b.dataset.loadTemplate)));
  $$('[data-dup-template]').forEach(b => b.addEventListener('click', () => { const t = state.templates.find(x=>x.id===b.dataset.dupTemplate); state.templates.unshift({...structuredClone(t), id:uid(), name:t.name+' — копія'}); saveState('Дубльовано шаблон'); renderTemplates(); }));
  $$('[data-del-template]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити шаблон?')) { state.templates = state.templates.filter(t=>t.id!==b.dataset.delTemplate); saveState('Видалено шаблон'); renderTemplates(); }}));
}
function loadTemplate(id) { const t = state.templates.find(x=>x.id===id); if (!t) return; snapshot(); state.currentOrder.items = structuredClone(t.items).map(i=>({...i,id:uid()})); markDirty(); showScreen('order'); renderAll(); }

function bindHistoryEvents() { $('#historySearch').addEventListener('input', renderHistory); $('#clearHistoryBtn').addEventListener('click', () => { if(confirmAction('Очистити всю історію?')) { snapshot(); state.history=[]; saveState('Очищено історію'); renderHistory(); }}); }
function saveToHistory() {
  readMetaFromForm();
  if (!state.currentOrder.meta.date || !state.currentOrder.meta.time || !state.currentOrder.meta.workshop || !state.currentOrder.meta.shift || !state.currentOrder.meta.responsible) return alert('Заповни дату, час, цех, зміну і відповідального.');
  if (!state.currentOrder.items.length) return alert('Додай хоча б одну позицію. Порожня заявка — це вже філософія, не виробництво.');
  snapshot();
  state.history.unshift({ id: uid(), createdAt: new Date().toISOString(), meta: structuredClone(state.currentOrder.meta), items: structuredClone(state.currentOrder.items) });
  state.currentOrder.dirty = false; saveState('Замовлення збережено в історію'); renderAll(); alert('Замовлення збережено.');
}
function renderHistory() {
  const q = normalize($('#historySearch').value);
  const list = state.history.filter(h => !q || normalize(`${h.meta.date} ${h.meta.time} ${h.meta.workshop} ${h.meta.shift} ${h.meta.responsible}`).includes(q));
  $('#historyList').innerHTML = list.map(h => `<div class="record-card"><b>${h.meta.date} ${h.meta.time} • ${escapeHtml(h.meta.workshop)}</b><div class="meta">Зміна: ${escapeHtml(h.meta.shift)} • позицій: ${h.items.length}</div><div class="card-actions"><button class="primary" data-view-h="${h.id}">Перегляд</button><button class="success" data-load-h="${h.id}">Дублювати як нове</button><button class="ghost" data-copy-h="${h.id}">Копіювати</button><button class="danger" data-del-h="${h.id}">Видалити</button></div></div>`).join('') || '<p class="hint">Історія порожня.</p>';
  $$('[data-view-h]').forEach(b => b.addEventListener('click', () => viewHistory(b.dataset.viewH)));
  $$('[data-load-h]').forEach(b => b.addEventListener('click', () => loadHistoryAsNew(b.dataset.loadH)));
  $$('[data-copy-h]').forEach(b => b.addEventListener('click', () => copyText(formatOrderText(state.history.find(h=>h.id===b.dataset.copyH)))));
  $$('[data-del-h]').forEach(b => b.addEventListener('click', () => { if(confirmAction('Видалити запис історії?')) { state.history = state.history.filter(h=>h.id!==b.dataset.delH); saveState('Видалено запис історії'); renderHistory(); }}));
}
function viewHistory(id) { const h = state.history.find(x=>x.id===id); $('#viewTitle').textContent = 'Замовлення з історії'; $('#viewContent').textContent = formatOrderText(h); $('#viewModal').showModal(); }
function loadHistoryAsNew(id) { const h = state.history.find(x=>x.id===id); snapshot(); state.currentOrder = { meta: {...h.meta, date: today(), time: nowTime()}, items: structuredClone(h.items).map(i=>({...i,id:uid()})), dirty: true }; syncMetaToForm(); saveState('Історію завантажено як нове замовлення'); showScreen('order'); renderAll(); }
$('#closeViewModal').addEventListener('click', () => $('#viewModal').close());

function formatOrderText(source = state.currentOrder) {
  const m = source.meta;
  const urgent = source.items.filter(i => ['терміново','критично'].includes(i.urgency)).length;
  const rows = source.items.map((i, idx) => `${idx + 1}. ${i.name} | ${i.qty} ${i.unit} | ${i.comment || '-'}${i.urgency !== 'звичайно' ? ' | ' + i.urgency.toUpperCase() : ''}`).join('\n');
  return `ЗАМОВЛЕННЯ ЗІ СКЛАДУ В ЦЕХ\n\nДата: ${m.date}\nЧас: ${m.time}\nЦех: ${m.workshop}\nЗміна: ${m.shift}\nВідповідальний: ${m.responsible}\n\n№ | Найменування | Кількість | Од. виміру | Коментар\n${rows}\n\nВсього позицій: ${source.items.length}\nТермінових: ${urgent}\nПримітки: ${m.notes || '-'}\n\nДата формування: ${new Date().toLocaleString('uk-UA')}\nПідпис відповідального: ____________________`;
}
function formatOrderTable(source = state.currentOrder) {
  return ['№\tНайменування\tКількість\tОд. виміру\tКоментар', ...source.items.map((i, idx) => `${idx+1}\t${i.name}\t${i.qty}\t${i.unit}\t${i.comment || ''}`)].join('\n');
}
async function copyText(text) { await navigator.clipboard.writeText(text); alert('Скопійовано.'); }
function shareOrder() { const text = formatOrderText(); if (navigator.share) navigator.share({ title: 'Замовлення зі складу', text }); else copyText(text); }
function exportPDF() {
  const html = buildPrintHtml();
  const w = window.open('', '_blank');
  w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
function buildPrintHtml() {
  const m = state.currentOrder.meta;
  const rows = state.currentOrder.items.map((i, idx) => `<tr><td>${idx+1}</td><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>${i.unit}</td><td>${escapeHtml(i.comment || '')}</td></tr>`).join('');
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Замовлення</title><style>body{font-family:Arial,sans-serif;color:#111;padding:18px}h1{font-size:20px;text-align:center}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #333;padding:6px;vertical-align:top}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:12px 0}.foot{margin-top:18px;font-size:12px}@media print{@page{size:A4;margin:12mm}}</style></head><body><h1>ЗАМОВЛЕННЯ ЗІ СКЛАДУ В ЦЕХ</h1><div class="meta"><div>Дата: <b>${m.date}</b></div><div>Час: <b>${m.time}</b></div><div>Цех: <b>${escapeHtml(m.workshop)}</b></div><div>Зміна: <b>${escapeHtml(m.shift)}</b></div><div>Відповідальний: <b>${escapeHtml(m.responsible)}</b></div><div>Дата формування: <b>${new Date().toLocaleString('uk-UA')}</b></div></div><table><thead><tr><th>№</th><th>Найменування</th><th>Кількість</th><th>Од. виміру</th><th>Коментар</th></tr></thead><tbody>${rows}</tbody></table><div class="foot"><p>Всього позицій: ${state.currentOrder.items.length}</p><p>Термінових: ${state.currentOrder.items.filter(i=>['терміново','критично'].includes(i.urgency)).length}</p><p>Примітки: ${escapeHtml(m.notes || '-')}</p><p>Підпис відповідального: ____________________ ${escapeHtml(state.settings.pdfSignature || '')}</p></div></body></html>`;
}
function clearOrder() { if(!confirmAction('Очистити поточне замовлення?')) return; snapshot(); state.currentOrder = { meta: { date: today(), time: nowTime(), workshop: state.settings.defaultWorkshop, shift: state.settings.defaultShift, responsible: state.settings.defaultResponsible, notes: '' }, items: [], dirty: false }; syncMetaToForm(); saveState('Очищено поточне замовлення'); renderAll(); }

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
function importJson(e) { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(r.result); snapshot(); if(data.positions) state.positions = data.positions; if(data.history) state.history = data.history; if(data.currentOrder) state.currentOrder = data.currentOrder; if(data.templates) state.templates = data.templates; if(data.settings) state.settings = data.settings; saveState('Імпортовано JSON'); renderAll(); alert('Імпорт завершено.'); } catch { alert('Файл JSON пошкоджений або неправильний.'); } }; r.readAsText(file); }
function saveSettings() { state.settings = { defaultWorkshop: $('#defaultWorkshop').value.trim(), defaultShift: $('#defaultShift').value.trim(), defaultResponsible: $('#defaultResponsible').value.trim(), pdfSignature: $('#pdfSignature').value.trim() }; saveState('Збережено налаштування'); alert('Налаштування збережено.'); }
function renderSettings() { $('#defaultWorkshop').value = state.settings.defaultWorkshop || ''; $('#defaultShift').value = state.settings.defaultShift || ''; $('#defaultResponsible').value = state.settings.defaultResponsible || ''; $('#pdfSignature').value = state.settings.pdfSignature || ''; $('#actionsLog').innerHTML = state.actions.map(a => `<div>${new Date(a.at).toLocaleString('uk-UA')} — ${escapeHtml(a.text)}</div>`).join('') || '<p class="hint">Журнал порожній.</p>'; }

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
