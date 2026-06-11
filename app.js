// ===== Firestore-backed Finance App (monthly model) =====
// Requires firebase-init.js loaded first
// (exposes db, incomesCol, debtsCol, expensesCol, metaDoc)

let incomes  = [];   // [{id, amount, label, date}]
let debts    = [];   // [{id, amount, label}]
let expenses = [];   // [{id, name, amount, date}]

let selectedYear = String(new Date().getFullYear());
const expandedMonths = new Set();   // YYYY-MM
const editingIncome  = new Set();
const editingExpense = new Set();
const editingDebt    = new Set();

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

const fmt = n => Number(n || 0).toFixed(2);
const sum = arr => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
const ts  = () => firebase.firestore.FieldValue.serverTimestamp();
const today = () => new Date().toISOString().slice(0,10);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function monthKey(dateStr) { return dateStr ? dateStr.slice(0,7) : ""; }
function yearOf(dateStr)   { return dateStr ? dateStr.slice(0,4) : ""; }
function createdMs(it) { return it.createdAt && it.createdAt.toMillis ? it.createdAt.toMillis() : 0; }

// ===== Realtime subscriptions =====
function subscribeAll() {
  incomesCol.onSnapshot(snap => {
    incomes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (a.date||"").localeCompare(b.date||"") || createdMs(a)-createdMs(b));
    refreshAll();
  });
  debtsCol.onSnapshot(snap => {
    debts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => createdMs(a)-createdMs(b));
    refreshAll();
  });
  expensesCol.onSnapshot(snap => {
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (a.date||"").localeCompare(b.date||"") || createdMs(a)-createdMs(b));
    refreshAll();
  });
}

function refreshAll() {
  if (document.getElementById("position"))      renderPosition();
  if (document.getElementById("recordsTable"))  renderRecords();
  if (document.getElementById("debtsReportTable")) renderReports();
}

// ===== Month math =====
// Returns sorted list of all months (YYYY-MM) that have any activity.
function allActiveMonths() {
  const set = new Set();
  incomes.forEach(i => { const k = monthKey(i.date); if (k) set.add(k); });
  expenses.forEach(e => { const k = monthKey(e.date); if (k) set.add(k); });
  return [...set].sort();
}
function incomeOfMonth(ym)   { return incomes.filter(i => monthKey(i.date) === ym); }
function expenseOfMonth(ym)  { return expenses.filter(e => monthKey(e.date) === ym); }

// Walk all activity months chronologically; carry remaining cash forward.
// Returns Map<YYYY-MM, { ownCashIn, cashIn (cumulative), expenses, remaining }>
function computeAllMonths() {
  const months = allActiveMonths();
  const out = new Map();
  let carry = 0;
  for (const m of months) {
    const own = sum(incomeOfMonth(m));
    const exp = sum(expenseOfMonth(m));
    const cashIn = own + carry;
    const remaining = cashIn - exp;
    out.set(m, { ownCashIn: own, cashIn, expenses: exp, remaining });
    carry = remaining;
  }
  return out;
}

function latestMonthWithActivity() {
  const months = allActiveMonths();
  return months.length ? months[months.length - 1] : null;
}

// ===== Financial Position page =====
function renderPosition() {
  const td = sum(debts);
  const computed = computeAllMonths();
  const last = latestMonthWithActivity();
  const remaining = last ? computed.get(last).remaining : 0;
  const pos = remaining - td;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
  set("latestRemaining", remaining);
  set("totalDebts", td);
  set("position", pos);
  const note = document.getElementById("latestMonthNote");
  if (note) note.textContent = last ? `Based on ${formatMonthLabel(last)}` : "No records yet.";
  const pn = document.getElementById("positionNote");
  if (pn) pn.textContent = last ? (pos >= 0 ? "Surplus" : "Deficit") : "";
  const list = document.getElementById("debtList");
  if (list) list.innerHTML = debts.map(d =>
    `<li><span>${escapeHtml(d.label) || "—"}</span><span>${fmt(d.amount)}</span></li>`
  ).join("");
}

function formatMonthLabel(ym) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m)-1]} ${y}`;
}

// ===== Records page (monthly grid) =====
function onChangeYear() {
  const sel = document.getElementById("yearSelect");
  selectedYear = sel.value;
  renderRecords();
}

function availableYears() {
  const years = new Set([String(new Date().getFullYear()), selectedYear]);
  allActiveMonths().forEach(m => years.add(m.slice(0,4)));
  return [...years].sort();
}

function toggleMonth(ym) {
  if (expandedMonths.has(ym)) expandedMonths.delete(ym);
  else expandedMonths.add(ym);
  renderRecords();
}

function renderRecords() {
  // year dropdown
  const ysel = document.getElementById("yearSelect");
  if (ysel) {
    const years = availableYears();
    ysel.innerHTML = years.map(y =>
      `<option value="${y}"${y === selectedYear ? " selected" : ""}>${y}</option>`
    ).join("");
  }
  const tbody = document.querySelector("#recordsTable tbody");
  if (!tbody) return;

  const computed = computeAllMonths();
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const ym = `${selectedYear}-${String(i).padStart(2,'0')}`;
    const incs = incomeOfMonth(ym);
    const exps = expenseOfMonth(ym);
    const c = computed.get(ym) || { ownCashIn: 0, cashIn: 0, expenses: 0, remaining: 0 };
    const incDesc = incs.map(x => escapeHtml(x.label || "—")).join(", ");
    const expDesc = exps.map(x => escapeHtml(x.name  || "—")).join(", ");
    const remCls = c.remaining >= 0 ? "pos" : "neg";
    const isOpen = expandedMonths.has(ym);
    rows.push(`<tr>
      <td><strong>${MONTH_NAMES[i-1]}</strong></td>
      <td>${fmt(c.ownCashIn)}</td>
      <td>${incDesc || "—"}</td>
      <td>${fmt(c.expenses)}</td>
      <td>${expDesc || "—"}</td>
      <td class="${remCls}"><strong>${fmt(c.remaining)}</strong></td>
      <td>
        <button class="btn" onclick="toggleMonth('${ym}')">${isOpen ? "Hide" : "View"}</button>
      </td>
    </tr>`);
    if (isOpen) rows.push(renderMonthDetail(ym, incs, exps));
  }
  tbody.innerHTML = rows.join("");
}

function renderMonthDetail(ym, incs, exps) {
  const incRows = incs.length ? incs.map(it => editingIncome.has(it.id) ? `
      <li>
        <input type="date" id="inc-date-${it.id}" value="${escapeHtml(it.date||"")}"/>
        <input type="number" id="inc-amt-${it.id}" value="${it.amount}"/>
        <input type="text"   id="inc-lbl-${it.id}" value="${escapeHtml(it.label||"")}"/>
        <button class="btn primary" onclick="saveIncome('${it.id}')">Save</button>
        <button class="btn" onclick="cancelIncome('${it.id}')">Cancel</button>
      </li>` : `
      <li>
        ${escapeHtml(it.date)} — <strong>${fmt(it.amount)}</strong> ${escapeHtml(it.label||"")}
        <button class="btn" onclick="editIncome('${it.id}')">Edit</button>
        <button class="btn danger" onclick="deleteIncome('${it.id}')">Delete</button>
      </li>`).join("") : `<li class="note">No cash in.</li>`;

  const expRows = exps.length ? exps.map(it => editingExpense.has(it.id) ? `
      <li>
        <input type="date" id="exp-date-${it.id}" value="${escapeHtml(it.date||"")}"/>
        <input type="number" id="exp-amt-${it.id}" value="${it.amount}"/>
        <input type="text"   id="exp-name-${it.id}" value="${escapeHtml(it.name||"")}"/>
        <button class="btn primary" onclick="saveExpense('${it.id}')">Save</button>
        <button class="btn" onclick="cancelExpense('${it.id}')">Cancel</button>
      </li>` : `
      <li>
        ${escapeHtml(it.date)} — <strong>${fmt(it.amount)}</strong> ${escapeHtml(it.name||"")}
        <button class="btn" onclick="editExpense('${it.id}')">Edit</button>
        <button class="btn danger" onclick="deleteExpense('${it.id}')">Delete</button>
      </li>`).join("") : `<li class="note">No expenses.</li>`;

  const defaultDate = `${ym}-01`;
  return `<tr class="detail-row"><td colspan="7">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <strong>Cash In — ${formatMonthLabel(ym)}</strong>
        <ul class="mini-list">${incRows}</ul>
        <div class="mini-form">
          <input type="date" id="new-inc-date-${ym}" value="${defaultDate}"/>
          <input type="number" id="new-inc-amt-${ym}" placeholder="Amount"/>
          <input type="text"   id="new-inc-lbl-${ym}" placeholder="Description"/>
          <button class="btn primary" onclick="addIncomeFor('${ym}')">Add Cash In</button>
        </div>
      </div>
      <div>
        <strong>Expenses — ${formatMonthLabel(ym)}</strong>
        <ul class="mini-list">${expRows}</ul>
        <div class="mini-form">
          <input type="date" id="new-exp-date-${ym}" value="${defaultDate}"/>
          <input type="number" id="new-exp-amt-${ym}" placeholder="Amount"/>
          <input type="text"   id="new-exp-name-${ym}" placeholder="Description"/>
          <button class="btn primary" onclick="addExpenseFor('${ym}')">Add Expense</button>
        </div>
      </div>
    </div>
  </td></tr>`;
}

// ===== Income operations =====
function addIncomeFor(ym) {
  const date = document.getElementById(`new-inc-date-${ym}`).value || `${ym}-01`;
  const amount = parseFloat(document.getElementById(`new-inc-amt-${ym}`).value);
  const label = document.getElementById(`new-inc-lbl-${ym}`).value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  incomesCol.add({ amount, label, date, createdAt: ts() })
    .catch(e => alert("Save failed: " + e.message));
}
function editIncome(id)   { editingIncome.add(id); renderRecords(); }
function cancelIncome(id) { editingIncome.delete(id); renderRecords(); }
function saveIncome(id) {
  const date = document.getElementById(`inc-date-${id}`).value;
  const amount = parseFloat(document.getElementById(`inc-amt-${id}`).value);
  const label  = document.getElementById(`inc-lbl-${id}`).value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  incomesCol.doc(id).update({ amount, label, date })
    .then(() => editingIncome.delete(id))
    .catch(e => alert("Save failed: " + e.message));
}
function deleteIncome(id) {
  if (!confirm("Delete this Cash In entry?")) return;
  incomesCol.doc(id).delete();
  editingIncome.delete(id);
}

// ===== Expense operations =====
function addExpenseFor(ym) {
  const date = document.getElementById(`new-exp-date-${ym}`).value || `${ym}-01`;
  const amount = parseFloat(document.getElementById(`new-exp-amt-${ym}`).value);
  const name = document.getElementById(`new-exp-name-${ym}`).value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  if (!name) return alert("Enter a description");
  expensesCol.add({ name, amount, date, createdAt: ts() })
    .catch(e => alert("Save failed: " + e.message));
}
function editExpense(id)   { editingExpense.add(id); renderRecords(); }
function cancelExpense(id) { editingExpense.delete(id); renderRecords(); }
function saveExpense(id) {
  const date = document.getElementById(`exp-date-${id}`).value;
  const amount = parseFloat(document.getElementById(`exp-amt-${id}`).value);
  const name   = document.getElementById(`exp-name-${id}`).value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  if (!name) return alert("Enter a description");
  expensesCol.doc(id).update({ name, amount, date })
    .then(() => editingExpense.delete(id))
    .catch(e => alert("Save failed: " + e.message));
}
function deleteExpense(id) {
  if (!confirm("Delete this Expense entry?")) return;
  expensesCol.doc(id).delete();
  editingExpense.delete(id);
}

// ===== Debts (Reports page) =====
function addDebt() {
  const amount = parseFloat(document.getElementById("debtInput").value);
  const label = document.getElementById("debtLabel").value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  debtsCol.add({ amount, label, createdAt: ts() })
    .catch(e => alert("Save failed: " + e.message));
  document.getElementById("debtInput").value = "";
  document.getElementById("debtLabel").value = "";
}
function editDebt(id)   { editingDebt.add(id); renderReports(); }
function cancelDebt(id) { editingDebt.delete(id); renderReports(); }
function saveDebt(id) {
  const amount = parseFloat(document.getElementById(`debt-amt-${id}`).value);
  const label  = document.getElementById(`debt-lbl-${id}`).value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  debtsCol.doc(id).update({ amount, label })
    .then(() => editingDebt.delete(id))
    .catch(e => alert("Save failed: " + e.message));
}
function deleteDebt(id) {
  if (!confirm("Delete this debt?")) return;
  debtsCol.doc(id).delete();
  editingDebt.delete(id);
}

function renderReports() {
  const tbody = document.querySelector("#debtsReportTable tbody");
  if (!tbody) return;
  tbody.innerHTML = debts.length ? debts.map(d => editingDebt.has(d.id) ? `
    <tr>
      <td><input type="number" id="debt-amt-${d.id}" value="${d.amount}"/></td>
      <td><input type="text"   id="debt-lbl-${d.id}" value="${escapeHtml(d.label||"")}"/></td>
      <td>
        <button class="btn primary" onclick="saveDebt('${d.id}')">Save</button>
        <button class="btn" onclick="cancelDebt('${d.id}')">Cancel</button>
      </td>
    </tr>` : `
    <tr>
      <td>${fmt(d.amount)}</td>
      <td>${escapeHtml(d.label||"—")}</td>
      <td>
        <button class="btn" onclick="editDebt('${d.id}')">Edit</button>
        <button class="btn danger" onclick="deleteDebt('${d.id}')">Delete</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="3" class="note">No debts yet.</td></tr>`;
  const tot = document.getElementById("debtsTotal");
  if (tot) tot.textContent = fmt(sum(debts));
}

// Kick off realtime subscriptions on every page
subscribeAll();
