// ===== Storage helpers =====
const store = {
  get(k, fallback) {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

let incomes = store.get("incomes", []);
let debts   = store.get("debts", []);
let expenses = store.get("expenses", []);
let cycle = store.get("cycle", { start: "", end: "" });

const fmt = n => Number(n || 0).toFixed(2);
const sum = arr => arr.reduce((a, b) => a + Number(b.amount || 0), 0);

// ===== Financial position page =====
function renderPosition() {
  const ti = sum(incomes), td = sum(debts);
  const pos = ti - td;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
  set("totalIncome", ti);
  set("totalDebts", td);
  set("position", pos);
  const note = document.getElementById("positionNote");
  if (note) note.textContent = pos >= 0 ? "Surplus — you're in the positive." : "Deficit — debts exceed income.";

  const renderList = (id, arr) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = arr.map((it, i) =>
      `<li><span>${it.label || "—"}</span><span>${fmt(it.amount)}</span></li>`
    ).join("");
  };
  renderList("incomeList", incomes);
  renderList("debtList", debts);
}

function addIncome() {
  const amt = parseFloat(document.getElementById("incomeInput").value);
  const lbl = document.getElementById("incomeLabel").value.trim();
  if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
  incomes.push({ amount: amt, label: lbl });
  store.set("incomes", incomes);
  document.getElementById("incomeInput").value = "";
  document.getElementById("incomeLabel").value = "";
  renderPosition();
}
function addDebt() {
  const amt = parseFloat(document.getElementById("debtInput").value);
  const lbl = document.getElementById("debtLabel").value.trim();
  if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
  debts.push({ amount: amt, label: lbl });
  store.set("debts", debts);
  document.getElementById("debtInput").value = "";
  document.getElementById("debtLabel").value = "";
  renderPosition();
}
function undoIncome() { incomes.pop(); store.set("incomes", incomes); renderPosition(); }
function undoDebt()   { debts.pop();   store.set("debts", debts);     renderPosition(); }
function clearIncome(){ if(confirm("Clear all income?")){ incomes = []; store.set("incomes", incomes); renderPosition(); } }
function clearDebt()  { if(confirm("Clear all debts?"))  { debts = [];   store.set("debts", debts);   renderPosition(); } }

// ===== Expenses page =====
function inCycle(dateStr) {
  if (!cycle.start || !cycle.end) return true;
  return dateStr >= cycle.start && dateStr <= cycle.end;
}

function saveCycle() {
  const s = document.getElementById("cycleStart").value;
  const e = document.getElementById("cycleEnd").value;
  if (!s || !e) return alert("Pick both dates");
  if (s > e) return alert("Start must be before end");
  cycle = { start: s, end: e };
  store.set("cycle", cycle);
  renderExpensesPage();
}

function addExpense() {
  const name = document.getElementById("expName").value.trim();
  const amount = parseFloat(document.getElementById("expAmount").value);
  const date = document.getElementById("expDate").value || new Date().toISOString().slice(0,10);
  if (!name) return alert("Enter expense name");
  if (isNaN(amount) || amount <= 0) return alert("Enter valid amount");
  expenses.push({ name, amount, date });
  store.set("expenses", expenses);
  document.getElementById("expName").value = "";
  document.getElementById("expAmount").value = "";
  document.getElementById("expDate").value = "";
  renderExpensesPage();
}

function removeExpense(i) {
  expenses.splice(i, 1);
  store.set("expenses", expenses);
  renderExpensesPage();
}

function renderExpensesPage() {
  const cs = document.getElementById("cycleStart");
  const ce = document.getElementById("cycleEnd");
  if (cs && cycle.start) cs.value = cycle.start;
  if (ce && cycle.end)   ce.value = cycle.end;
  const info = document.getElementById("cycleInfo");
  if (info) info.textContent = cycle.start && cycle.end
    ? `Current cycle: ${cycle.start} → ${cycle.end}`
    : "No cycle set — showing all expenses.";

  const inCycleList = expenses.filter(e => inCycle(e.date));
  const total = sum(inCycleList);
  const tEl = document.getElementById("totalExpenses");
  if (tEl) tEl.textContent = fmt(total);

  const tbody = document.querySelector("#expTable tbody");
  if (tbody) {
    tbody.innerHTML = inCycleList
      .slice()
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(e => {
        const idx = expenses.indexOf(e);
        return `<tr>
          <td>${e.date}</td>
          <td>${e.name}</td>
          <td>${fmt(e.amount)}</td>
          <td><button onclick="removeExpense(${idx})">Delete</button></td>
        </tr>`;
      }).join("");
  }
}

// ===== Summary page =====
function renderSummary() {
  const ti = sum(incomes), td = sum(debts);
  const te = sum(expenses.filter(e => inCycle(e.date)));
  const net = ti - td - te;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
  set("sumIncome", ti);
  set("sumDebts", td);
  set("sumExp", te);
  set("sumNet", net);
}

// auto-init for position page
if (document.getElementById("totalIncome")) renderPosition();
