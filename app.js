const $ = (id) => document.getElementById(id);

function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0,10);
}
function formatDateUA(iso){
  if(!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function escapeHtml(str){
  return (str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

const DEFAULT_MEAL_NAMES = ["Сніданок","Обід","Перекус","Вечеря"];

function getMealNames(){
  const raw = localStorage.getItem("mealplan:mealNames");
  if(!raw) return [...DEFAULT_MEAL_NAMES];
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length===4) return arr.map(x=>String(x||"").trim() || "");
  }catch(e){}
  return [...DEFAULT_MEAL_NAMES];
}
function setMealNames(names){
  localStorage.setItem("mealplan:mealNames", JSON.stringify(names));
}

function applyMealNamesToUI(){
  const names = getMealNames();
  // inputs
  for(let i=0;i<4;i++){
    const el = $("mealName"+i);
    if(el) el.value = names[i] || DEFAULT_MEAL_NAMES[i];
  }
  // tab buttons
  const btns = document.querySelectorAll("#mealTabs .meal-tabs__btn");
  btns.forEach((b, idx)=>{ b.textContent = names[idx] || DEFAULT_MEAL_NAMES[idx]; });
}

function getData(){
  return {
    titleName: $("titleName").value.trim(),
    kcalLine: $("kcalLine").value.trim(),
    planDate: $("planDate").value,
    goal: $("goal").value.trim(),
    water: $("water").value.trim(),
    note: $("note").value.trim(),
    m0: $("m0").value,
    m1: $("m1").value,
    m2: $("m2").value,
    m3: $("m3").value,
  };
}
function setData(data){
  $("titleName").value = data.titleName ?? "Аліна";
  $("kcalLine").value = data.kcalLine ?? "K-1527, Б/Ж/У-110/50/159";
  $("planDate").value = data.planDate ?? todayISO();
  $("goal").value = data.goal ?? "Дефіцит";
  $("water").value = data.water ?? "2 - 2,5 л/добу";
  $("note").value = data.note ?? "Усі каші написані в сухому вигляді. М'ясо та риба в готовому.";
  $("m0").value = data.m0 ?? "";
  $("m1").value = data.m1 ?? "";
  $("m2").value = data.m2 ?? "";
  $("m3").value = data.m3 ?? "";
}

function buildSheet(data){
  const names = getMealNames();
  const dateUA = formatDateUA(data.planDate);
  return `
    <div class="sheet__title">План харчування - ${escapeHtml(data.titleName)}</div>
    <div class="sheet__kcal">${escapeHtml(data.kcalLine)}</div>
    <div class="sheet__date">${escapeHtml(dateUA)} ${escapeHtml(data.goal)}</div>

    <table class="table">
      <thead>
        <tr>
          <th>${escapeHtml(names[0] || DEFAULT_MEAL_NAMES[0])}</th>
          <th>${escapeHtml(names[1] || DEFAULT_MEAL_NAMES[1])}</th>
          <th>${escapeHtml(names[2] || DEFAULT_MEAL_NAMES[2])}</th>
          <th>${escapeHtml(names[3] || DEFAULT_MEAL_NAMES[3])}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(data.m0)}</td>
          <td>${escapeHtml(data.m1)}</td>
          <td>${escapeHtml(data.m2)}</td>
          <td>${escapeHtml(data.m3)}</td>
        </tr>
      </tbody>
    </table>

    <div class="sheet__footer">
      Води в чистому вигляді - ${escapeHtml(data.water)}
      <small>${escapeHtml(data.note)}</small>
    </div>
  `;
}

function renderSheet(){
  $("sheet").innerHTML = buildSheet(getData());
}

function persistLast(){
  localStorage.setItem("mealplan:last", JSON.stringify(getData()));
}

function filenameBase(){
  const data = getData();
  const date = data.planDate || todayISO();
  const name = (data.titleName || "plan").replaceAll(" ", "_");
  return `plan_${name}_${date}`;
}

function openInNewTab(blob, mime){
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  // if popup blocked, fallback to navigate
  if(!w) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportPNG(){
  renderSheet();
  persistLast();

  const sheet = $("sheet");
  const canvas = await html2canvas(sheet, { backgroundColor:"#ffffff", scale:2, useCORS:true });

  // iOS Safari often blocks "download" for blob urls from file://,
  // so we OPEN the image in a new tab. User can save/share from there.
  await new Promise(resolve => {
    canvas.toBlob((blob) => {
      if(!blob){ alert("Не вдалося згенерувати PNG."); return; }
      openInNewTab(blob, "image/png");
      resolve();
    }, "image/png");
  });
}

async function exportPDF(){
  renderSheet();
  persistLast();

  const sheet = $("sheet");
  const canvas = await html2canvas(sheet, { backgroundColor:"#ffffff", scale:2, useCORS:true });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const pageW = 210, pageH = 297;
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;

  pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
  heightLeft -= pageH;

  while (heightLeft > 0) {
    pdf.addPage();
    position = heightLeft - imgH;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  // Open PDF in new tab (works better on iOS than forced download)
  const blob = pdf.output("blob");
  openInNewTab(blob, "application/pdf");
}

function activateMeal(meal){
  document.querySelectorAll(".meal-tabs__btn").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.meal === meal);
  });
  document.querySelectorAll(".meal-panel").forEach(p=>{
    p.classList.toggle("is-active", p.dataset.mealPanel === meal);
  });
}

function bindTabs(){
  document.querySelectorAll(".meal-tabs__btn").forEach(b=>{
    b.addEventListener("click", () => activateMeal(b.dataset.meal));
  });
}

function clearAll(){
  setData({ planDate: todayISO(), m0:"", m1:"", m2:"", m3:"" });
  persistLast();
}

$("btnExportPNG").addEventListener("click", exportPNG);
$("btnExportPDF").addEventListener("click", exportPDF);
$("btnClear").addEventListener("click", clearAll);

$("btnSaveMealNames").addEventListener("click", () => {
  const names = [0,1,2,3].map(i => ($("mealName"+i).value || "").trim());
  setMealNames(names.map((n,i)=> n || DEFAULT_MEAL_NAMES[i]));
  applyMealNamesToUI();
  alert("Назви збережено ✅");
});

$("btnResetMealNames").addEventListener("click", () => {
  setMealNames([...DEFAULT_MEAL_NAMES]);
  applyMealNamesToUI();
  alert("Скинуто ✅");
});

// Init
applyMealNamesToUI();
bindTabs();

const saved = localStorage.getItem("mealplan:last");
if(saved){
  try{ setData(JSON.parse(saved)); }catch(e){ setData({}); }
}else{
  setData({});
}
activateMeal("m0");
renderSheet();
