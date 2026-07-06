const meals = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snacks: 'Otros / snacks'
};

const defaultGoals = { kcal: 2200, protein: 140, carbs: 250, fat: 70 };
const $ = selector => document.querySelector(selector);
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

const state = {
  day: todayISO(),
  data: loadDay(todayISO()),
  goals: loadGoals()
};

function storageKey(day) { return `ticket-macros:${day}`; }
function loadDay(day) {
  const empty = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  try { return { ...empty, ...JSON.parse(localStorage.getItem(storageKey(day)) || '{}') }; }
  catch { return empty; }
}
function saveDay() { localStorage.setItem(storageKey(state.day), JSON.stringify(state.data)); }
function loadGoals() {
  try { return { ...defaultGoals, ...JSON.parse(localStorage.getItem('ticket-macros:goals') || '{}') }; }
  catch { return defaultGoals; }
}
function saveGoals() { localStorage.setItem('ticket-macros:goals', JSON.stringify(state.goals)); }
function round(n, decimals = 1) { return Number(n || 0).toFixed(decimals).replace('.0', ''); }

function totals(items = Object.values(state.data).flat()) {
  return items.reduce((acc, item) => {
    acc.kcal += Number(item.kcal || 0);
    acc.protein += Number(item.protein || 0);
    acc.carbs += Number(item.carbs || 0);
    acc.fat += Number(item.fat || 0);
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function render() {
  $('#dayInput').value = state.day;
  $('#goalKcal').value = state.goals.kcal;
  $('#goalProtein').value = state.goals.protein;
  $('#goalCarbs').value = state.goals.carbs;
  $('#goalFat').value = state.goals.fat;

  const total = totals();
  $('#totalKcal').textContent = `${Math.round(total.kcal)} kcal`;
  $('#totalProtein').textContent = `P ${round(total.protein)}g`;
  $('#totalCarbs').textContent = `C ${round(total.carbs)}g`;
  $('#totalFat').textContent = `G ${round(total.fat)}g`;
  const pct = state.goals.kcal ? Math.min(140, total.kcal / state.goals.kcal * 100) : 0;
  $('#goalStatus').textContent = `${Math.round(pct)}%`;
  $('#kcalBar').style.width = `${Math.min(100, pct)}%`;

  $('#meals').innerHTML = Object.entries(meals).map(([key, title]) => mealHtml(key, title)).join('');
  document.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', openEdit));
}

function mealHtml(key, title) {
  const list = state.data[key] || [];
  const total = totals(list);
  return `<section class="meal">
    <h2><span>${title}</span><span>${Math.round(total.kcal)} kcal</span></h2>
    ${list.length ? list.map(item => foodHtml(key, item)).join('') : '<div class="empty">sin alimentos</div>'}
  </section>`;
}

function foodHtml(meal, item) {
  const photo = item.fromPhoto ? '<span class="badge">foto</span>' : '';
  const confidence = item.confidence ? `<span class="badge">${item.confidence}</span>` : '';
  return `<article class="food">
    <button data-edit="${meal}:${item.id}">
      <div class="food-main"><span class="food-name">${escapeHtml(item.name)}</span><strong>${Math.round(item.kcal || 0)} kcal</strong></div>
      <div class="food-sub"><span>${round(item.grams)}g · P ${round(item.protein)} C ${round(item.carbs)} G ${round(item.fat)}</span><span>${photo} ${confidence}</span></div>
      <div class="food-sub"><span>${escapeHtml(item.source || '')}</span></div>
    </button>
  </article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function changeDay(delta) {
  const d = new Date(`${state.day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  state.day = d.toISOString().slice(0, 10);
  state.data = loadDay(state.day);
  render();
}

async function addTextFood() {
  const text = $('#foodText').value.trim();
  if (!text) return setMessage('Escribe un alimento primero.');
  setBusy(true, 'Buscando nutrición...');
  try {
    const response = await fetch('/api/food/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error');
    addFoods(data, $('#mealSelect').value);
    $('#foodText').value = '';
    setMessage('Añadido al ticket.');
  } catch (error) {
    setMessage(error.message || 'No se pudo analizar.');
  } finally { setBusy(false); }
}

async function addPhotoFood(file) {
  if (!file) return;
  setBusy(true, 'Analizando foto...');
  try {
    const form = new FormData();
    form.append('photo', file);
    const response = await fetch('/api/food/photo', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error');
    addFoods(data, $('#mealSelect').value);
    setMessage('Foto añadida como estimación editable.');
  } catch (error) {
    setMessage(error.message || 'No se pudo analizar la foto.');
  } finally { setBusy(false); $('#photoInput').value = ''; }
}

function addFoods(items, meal) {
  const clean = items.map(item => ({ id: uid(), ...item }));
  state.data[meal].push(...clean);
  saveDay();
  render();
}

function setMessage(text) { $('#aiMessage').textContent = text; }
function setBusy(isBusy, text = '') {
  $('#addTextBtn').disabled = isBusy;
  $('#photoInput').disabled = isBusy;
  if (text) setMessage(text);
}

function openEdit(event) {
  const [meal, id] = event.currentTarget.dataset.edit.split(':');
  const item = state.data[meal].find(food => food.id === id);
  if (!item) return;
  $('#editMeal').value = meal;
  $('#editId').value = id;
  $('#editName').value = item.name || '';
  $('#editBrand').value = item.brand || '';
  $('#editGrams').value = item.grams || 0;
  $('#editKcal').value = item.kcal || 0;
  $('#editProtein').value = item.protein || 0;
  $('#editCarbs').value = item.carbs || 0;
  $('#editFat').value = item.fat || 0;
  $('#editDialog').showModal();
}

function saveEdit() {
  const meal = $('#editMeal').value;
  const id = $('#editId').value;
  const item = state.data[meal].find(food => food.id === id);
  if (!item) return;
  Object.assign(item, {
    name: $('#editName').value.trim() || 'Alimento',
    brand: $('#editBrand').value.trim(),
    grams: Number($('#editGrams').value),
    kcal: Number($('#editKcal').value),
    protein: Number($('#editProtein').value),
    carbs: Number($('#editCarbs').value),
    fat: Number($('#editFat').value)
  });
  saveDay();
  render();
}

function deleteEdit() {
  const meal = $('#editMeal').value;
  const id = $('#editId').value;
  state.data[meal] = state.data[meal].filter(food => food.id !== id);
  saveDay();
  render();
}

$('#prevDay').addEventListener('click', () => changeDay(-1));
$('#nextDay').addEventListener('click', () => changeDay(1));
$('#dayInput').addEventListener('change', event => {
  state.day = event.target.value || todayISO();
  state.data = loadDay(state.day);
  render();
});
['Kcal', 'Protein', 'Carbs', 'Fat'].forEach(name => {
  $(`#goal${name}`).addEventListener('input', event => {
    const key = name.toLowerCase();
    state.goals[key] = Number(event.target.value || 0);
    saveGoals();
    render();
  });
});
$('#addTextBtn').addEventListener('click', addTextFood);
$('#photoInput').addEventListener('change', event => addPhotoFood(event.target.files[0]));
$('#saveFoodBtn').addEventListener('click', saveEdit);
$('#deleteFoodBtn').addEventListener('click', deleteEdit);

render();
