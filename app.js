// ===== Firestore-backed Finance App =====
// Requires firebase-init.js loaded first
// (exposes db, incomesCol, debtsCol, expensesCol, cyclesCol, metaDoc)

let incomes  = [];   // [{id, amount, label, date, createdAt}]
let debts    = [];   // [{id, amount, label, createdAt}]
let expenses = [];   // [{id, name, amount, date, createdAt}]
let cycles   = [];   // [{id, start, end, createdAt}]
let cycle = { start: "", end: "" }; // active cycle

const editingIncome  = new Set();
const editingDebt    = new Set();
const editingExpense = new Set();

// Selected cycle on the Expenses page (null = active cycle). Stored in localStorage so the user's pick persists across reloads/pages.
let selectedCycleKey = (typeof localStorage !== "undefined" && localStorage.getItem("selectedCycleKey")) || "";


// Records-page filters (date YYYY-MM-DD strings)
const filters = {
  incomeFrom: "", incomeTo: "",
  expenseFrom: "", expenseTo: ""
};

const fmt = n => Number(n || 0).toFixed(2);
const sum = arr => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
const ts  = () => firebase.firestore.FieldValue.serverTimestamp();
const today = () => new Date().toISOString().slice(0,10);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function inRange(dateStr, from, to) {
  if (!dateStr) return !from && !to;
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
}

function createdMillis(item) {
  return item.createdAt && typeof item.createdAt.toMillis === "function" ? item.createdAt.toMillis() : 0;
}

// ===== Realtime subscriptions =====
function subscribeAll() {
  incomesCol.onSnapshot(snap => {
    incomes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => createdMillis(a) - createdMillis(b));
    refreshAll();
  }, err => console.error("incomes:", err));

  debtsCol.onSnapshot(snap => {
    debts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => createdMillis(a) - createdMillis(b));
    refreshAll();
  }, err => console.error("debts:", err));

  expensesCol.onSnapshot(snap => {
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || createdMillis(a) - createdMillis(b));
    refreshAll();
  }, err => console.error("expenses:", err));

  cyclesCol.onSnapshot(snap => {
    cycles = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.start || "").localeCompare(b.start || "") || createdMillis(a) - createdMillis(b));
    refreshAll();
  }, err => console.error("cycles:", err));

  metaDoc.onSnapshot(snap => {
    cycle = snap.exists ? (snap.data() || { start: "", end: "" }) : { start: "", end: "" };
    refreshAll();
  }, err => console.error("cycle:", err));
}

function refreshAll() {
  if (document.getElementById("totalIncome")) renderPosition();
  if (document.getElementById("expTable"))    renderExpensesPage();
  if (document.getElementById("summaryBody"))   renderSummary();
  if (document.getElementById("incomeTable")) renderRecordsPage();
  if (document.getElementById("reportsBody")) renderReportsPage();
}

// ===== Financial position page =====
function renderPosition() {
  const td = sum(debts);
  // Position = Remaining Cash of last cycle - Total Debts
  const list = allCycles();
  const last = list.length ? list[list.length - 1] : null;
  const remaining = last ? remainingFor(last) : 0;
  const ti = sum(incomes.filter(i => !i.carryoverFor));
  const pos = remaining - td;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
  set("totalIncome", ti);
  set("totalDebts", td);
  set("position", pos);
  const note = document.getElementById("positionNote");
  if (note) {
    if (!last) note.textContent = "No cycle yet — save a cycle on the Expenses page.";
    else note.textContent = (pos >= 0 ? "Surplus" : "Deficit") +
      ` — based on remaining cash of cycle starting ${last.start}.`;
  }

  const renderList = (id, arr) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = arr.map(it =>
      `<li><span>${escapeHtml(it.label) || "—"}</span><span>${fmt(it.amount)}</span></li>`
    ).join("");
  };
  renderList("incomeList", incomes.filter(i => !i.carryoverFor));
  renderList("debtList", debts);
}


function addIncome() {
  const amt = parseFloat(document.getElementById("incomeInput").value);
  const lbl = document.getElementById("incomeLabel").value.trim();
  const dateEl = document.getElementById("incomeDate");
  const date = (dateEl && dateEl.value) ? dateEl.value : today();
  if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
  incomesCol.add({ amount: amt, label: lbl, date, createdAt: ts() })
    .catch(e => alert("Save failed: " + e.message));
  document.getElementById("incomeInput").value = "";
  document.getElementById("incomeLabel").value = "";
  if (dateEl) dateEl.value = "";
}
function addDebt() {
  const amt = parseFloat(document.getElementById("debtInput").value);
  const lbl = document.getElementById("debtLabel").value.trim();
  if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
  debtsCol.add({ amount: amt, label: lbl, createdAt: ts() })
    .catch(e => alert("Save failed: " + e.message));
  document.getElementById("debtInput").value = "";
  document.getElementById("debtLabel").value = "";
}
function undoIncome() {
  const last = incomes[incomes.length - 1];
  if (last) incomesCol.doc(last.id).delete();
}
function undoDebt() {
  const last = debts[debts.length - 1];
  if (last) debtsCol.doc(last.id).delete();
}
async function clearCollection(colRef) {
  const snap = await colRef.get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
function clearIncome() { if (confirm("Clear all income?")) clearCollection(incomesCol); }
function clearDebt()   { if (confirm("Clear all debts?"))  clearCollection(debtsCol);   }

// ===== Expenses page =====
function inCycle(dateStr) {
  if (!cycle.start || !cycle.end) return true;
  return dateStr >= cycle.start && dateStr <= cycle.end;
}

async function saveCycle() {
  const s = document.getElementById("cycleStart").value;
  const e = document.getElementById("cycleEnd").value;
  if (!s || !e) return alert("Pick both dates");
  if (s > e) return alert("Start must be before end");
  try {
    // Determine previous cycle (the most recent archived cycle ending before new start)
    const prev = cycles
      .filter(c => c.end && c.end < s)
      .sort((a,b) => (a.end || "").localeCompare(b.end || ""))
      .pop();

    await metaDoc.set({ start: s, end: e });

    // Archive new cycle if not already present
    const exists = cycles.some(c => c.start === s && c.end === e);
    if (!exists) await cyclesCol.add({ start: s, end: e, createdAt: ts() });

    // Carry over remaining cash from previous cycle into new cycle as income
    if (prev) {
      const prevInc = sum(incomes.filter(i => {
        const d = i.date || "";
        return d >= prev.start && d <= prev.end;
      }));
      const prevExp = sum(expenses.filter(x => {
        const d = x.date || "";
        return d >= prev.start && d <= prev.end;
      }));
      const remaining = prevInc - prevExp;

      // Avoid duplicates: check if a carryover income already exists for this new cycle
      const already = incomes.some(i => i.carryoverFor === s + "_" + e);
      if (!already && remaining > 0) {
        await incomesCol.add({
          amount: remaining,
          label: `Carryover from ${prev.start} → ${prev.end}`,
          date: s,
          carryoverFor: s + "_" + e,
          createdAt: ts()
        });
        alert(`Carried over ${fmt(remaining)} from previous cycle as income.`);
      }
    }
  } catch (err) { alert("Save failed: " + err.message); }
}


function addExpense() {
  const name = document.getElementById("expName").value.trim();
  const amount = parseFloat(document.getElementById("expAmount").value);
  const date = document.getElementById("expDate").value || today();
  if (!name) return alert("Enter expense name");
  if (isNaN(amount) || amount <= 0) return alert("Enter valid amount");
  expensesCol.add({ name, amount, date, createdAt: ts() })
    .catch(e => alert("Save failed: " + e.message));
  document.getElementById("expName").value = "";
  document.getElementById("expAmount").value = "";
  document.getElementById("expDate").value = "";
}

function removeExpense(id) {
  if (!confirm("Delete this expense?")) return;
  expensesCol.doc(id).delete();
}

function cycleKey(c) { return c ? (c.start + "_" + c.end) : ""; }

function getSelectedCycle() {
  const list = allCycles();
  if (!list.length) return null;
  const found = list.find(c => cycleKey(c) === selectedCycleKey);
  if (found) return found;
  // Default to the active cycle if set, otherwise the last cycle
  const active = list.find(c => c.start === cycle.start && c.end === cycle.end);
  return active || list[list.length - 1];
}

function onChangeCycleSelect() {
  const sel = document.getElementById("cycleSelect");
  if (!sel) return;
  selectedCycleKey = sel.value || "";
  try { localStorage.setItem("selectedCycleKey", selectedCycleKey); } catch (e) {}
  renderExpensesPage();
}

function renderExpensesPage() {
  const cs = document.getElementById("cycleStart");
  const ce = document.getElementById("cycleEnd");
  if (cs && cycle.start) cs.value = cycle.start;
  if (ce && cycle.end)   ce.value = cycle.end;
  const info = document.getElementById("cycleInfo");
  if (info) info.textContent = cycle.start && cycle.end
    ? `Active cycle: ${cycle.start} → ${cycle.end}`
    : "No active cycle set.";

  // Populate the cycle dropdown
  const sel = document.getElementById("cycleSelect");
  const list = allCycles();
  const selCycle = getSelectedCycle();
  const selKey = cycleKey(selCycle);
  if (sel) {
    sel.innerHTML = list.length
      ? list.map(c => {
          const k = cycleKey(c);
          const isActive = (c.start === cycle.start && c.end === cycle.end);
          const label = `${c.start} → ${c.end}${isActive ? " (active)" : ""}`;
          return `<option value="${escapeHtml(k)}"${k === selKey ? " selected" : ""}>${escapeHtml(label)}</option>`;
        }).join("")
      : `<option value="">No cycles yet</option>`;
  }

  // Filter expenses based on the selected cycle (fallback to all if none)
  const inSel = selCycle
    ? expenses.filter(e => (e.date || "") >= selCycle.start && (e.date || "") <= selCycle.end)
    : expenses.slice();
  const total = sum(inSel);
  const tEl = document.getElementById("totalExpenses");
  if (tEl) tEl.textContent = fmt(total);
  const lblEl = document.getElementById("selectedCycleLabel");
  if (lblEl) lblEl.textContent = selCycle ? `${selCycle.start} → ${selCycle.end}` : "all";

  const tbody = document.querySelector("#expTable tbody");
  if (tbody) {
    tbody.innerHTML = inSel
      .slice()
      .sort((a,b) => (a.date || "").localeCompare(b.date || ""))
      .map(e => `<tr>
          <td>${escapeHtml(cycleLabelFor(e.date))}</td>
          <td>${escapeHtml(e.date)}</td>
          <td>${escapeHtml(e.name)}</td>
          <td>${fmt(e.amount)}</td>
          <td><button onclick="removeExpense('${e.id}')">Delete</button></td>
        </tr>`).join("");
  }
}

// ===== Helpers =====
function allCycles() {
  let list = cycles.slice();
  if (cycle.start && cycle.end &&
      !list.some(c => c.start === cycle.start && c.end === cycle.end)) {
    list.push({ id: "active", start: cycle.start, end: cycle.end });
  }
  return list.sort((a,b) => (a.start || "").localeCompare(b.start || ""));
}

function cycleLabelFor(dateStr) {
  if (!dateStr) return "—";
  const c = allCycles().find(c => dateStr >= c.start && dateStr <= c.end);
  return c ? c.start : "—";
}

// Own income in a cycle (excludes any legacy carryover-tagged income records to avoid double counting).
function ownIncomeInCycle(c) {
  return sum(incomes.filter(i => {
    const d = i.date || "";
    if (i.carryoverFor) return false;
    return d >= c.start && d <= c.end;
  }));
}
function expensesInCycle(c) {
  return sum(expenses.filter(e => {
    const d = e.date || "";
    return d >= c.start && d <= c.end;
  }));
}
// Remaining cash for a cycle = own income + previous cycle's remaining cash − expenses (cumulative).
function remainingFor(c) {
  const list = allCycles();
  let carry = 0;
  for (const cur of list) {
    const inc = ownIncomeInCycle(cur) + carry;
    const exp = expensesInCycle(cur);
    const rem = inc - exp;
    if (cur.start === c.start && cur.end === c.end) return rem;
    carry = rem;
  }
  return 0;
}
// Cumulative income for a cycle = own income + previous cycle remaining cash.
function cumulativeIncomeFor(c) {
  const list = allCycles();
  const idx = list.findIndex(x => x.start === c.start && x.end === c.end);
  const prev = idx > 0 ? list[idx - 1] : null;
  return ownIncomeInCycle(c) + (prev ? remainingFor(prev) : 0);
}

// ===== Summary page (per-cycle rows) =====
function renderSummary() {
  const tbody = document.getElementById("summaryBody");
  if (!tbody) return;
  const list = allCycles();
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="note">No cycles yet. Save a cycle on the Expenses page.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    const exp = expensesInCycle(c);
    const cash = remainingFor(c);
    const cls = cash >= 0 ? "pos" : "neg";
    const active = (c.start === cycle.start && c.end === cycle.end) ? " (active)" : "";
    return `<tr>
      <td>${escapeHtml(c.start)}${active}</td>
      <td>${fmt(exp)}</td>
      <td class="${cls}"><strong>${fmt(cash)}</strong></td>
    </tr>`;
  }).join("");
}

// ===== Reports page (per-cycle) =====
function renderReportsPage() {
  const tbody = document.querySelector("#reportsTable tbody");
  if (!tbody) return;

  const list = allCycles();

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="note">No cycles yet. Save a cycle on the Expenses page.</td></tr>`;
    document.getElementById("reportsBody").dataset.empty = "1";
    return;
  }

  tbody.innerHTML = list.map(c => {
    const inc = cumulativeIncomeFor(c); // own income + previous cycle's remaining cash
    const exp = expensesInCycle(c);
    const remaining = inc - exp;
    const cls = remaining >= 0 ? "pos" : "neg";
    const active = (c.start === cycle.start && c.end === cycle.end) ? " (active)" : "";
    return `<tr>
      <td>${escapeHtml(c.start)} → ${escapeHtml(c.end)}${active}</td>
      <td>${fmt(inc)}</td>
      <td>${fmt(exp)}</td>
      <td class="${cls}"><strong>${fmt(remaining)}</strong></td>
      <td>${remaining >= 0 ? "Surplus" : "Deficit"}</td>
      <td>${c.id !== "active" ? `<button class="btn danger" onclick="deleteCycle('${c.id}')">Delete</button>` : ""}</td>
    </tr>`;
  }).join("");
}

function deleteCycle(id) {
  if (!confirm("Delete this archived cycle? (Income/expenses are not affected.)")) return;
  cyclesCol.doc(id).delete();
}


// ===== Records page (edit, delete, filters) =====
function editIncome(id)   { editingIncome.add(id);    renderRecordsPage(); }
function cancelIncome(id) { editingIncome.delete(id); renderRecordsPage(); }
function editDebt(id)     { editingDebt.add(id);      renderRecordsPage(); }
function cancelDebt(id)   { editingDebt.delete(id);   renderRecordsPage(); }
function editExpense(id)  { editingExpense.add(id);   renderRecordsPage(); }
function cancelExpense(id){ editingExpense.delete(id);renderRecordsPage(); }

function applyIncomeFilter() {
  filters.incomeFrom = document.getElementById("incFrom").value;
  filters.incomeTo   = document.getElementById("incTo").value;
  renderRecordsPage();
}
function clearIncomeFilter() {
  filters.incomeFrom = ""; filters.incomeTo = "";
  const a = document.getElementById("incFrom"); if (a) a.value = "";
  const b = document.getElementById("incTo");   if (b) b.value = "";
  renderRecordsPage();
}
function applyExpenseFilter() {
  filters.expenseFrom = document.getElementById("expFrom").value;
  filters.expenseTo   = document.getElementById("expTo").value;
  renderRecordsPage();
}
function clearExpenseFilter() {
  filters.expenseFrom = ""; filters.expenseTo = "";
  const a = document.getElementById("expFrom"); if (a) a.value = "";
  const b = document.getElementById("expTo");   if (b) b.value = "";
  renderRecordsPage();
}

function renderRecordsPage() {
  // Income table (with date + filter)
  const incomeBody = document.querySelector("#incomeTable tbody");
  if (incomeBody) {
    const filtered = incomes.filter(it => inRange(it.date || "", filters.incomeFrom, filters.incomeTo));
    incomeBody.innerHTML = filtered.length
      ? filtered.map(it => editingIncome.has(it.id) ? `
            <tr>
              <td><input type="date" id="inc-date-${it.id}" value="${escapeHtml(it.date || "")}"/></td>
              <td><input type="text" id="inc-label-${it.id}" value="${escapeHtml(it.label)}"/></td>
              <td><input type="number" id="inc-amt-${it.id}" value="${it.amount}"/></td>
              <td>
                <button class="btn primary" onclick="saveIncome('${it.id}')">Save</button>
                <button class="btn" onclick="cancelIncome('${it.id}')">Cancel</button>
              </td>
            </tr>` : `
            <tr>
              <td>${escapeHtml(it.date) || "—"}</td>
              <td>${escapeHtml(it.label) || "—"}</td>
              <td>${fmt(it.amount)}</td>
              <td>
                <button class="btn" onclick="editIncome('${it.id}')">Edit</button>
                <button class="btn danger" onclick="deleteIncome('${it.id}')">Delete</button>
              </td>
            </tr>`).join("")
      : `<tr><td colspan="4" class="note">No income records${filters.incomeFrom||filters.incomeTo?" in selected range":""}.</td></tr>`;
    const tot = document.getElementById("incFilterTotal");
    if (tot) tot.textContent = fmt(sum(filtered));
  }

  // Debt table
  const debtBody = document.querySelector("#debtTable tbody");
  if (debtBody) {
    debtBody.innerHTML = debts.length
      ? debts.map(it => editingDebt.has(it.id) ? `
            <tr>
              <td><input type="text" id="debt-label-${it.id}" value="${escapeHtml(it.label)}"/></td>
              <td><input type="number" id="debt-amt-${it.id}" value="${it.amount}"/></td>
              <td>
                <button class="btn primary" onclick="saveDebt('${it.id}')">Save</button>
                <button class="btn" onclick="cancelDebt('${it.id}')">Cancel</button>
              </td>
            </tr>` : `
            <tr>
              <td>${escapeHtml(it.label) || "—"}</td>
              <td>${fmt(it.amount)}</td>
              <td>
                <button class="btn" onclick="editDebt('${it.id}')">Edit</button>
                <button class="btn danger" onclick="deleteDebt('${it.id}')">Delete</button>
              </td>
            </tr>`).join("")
      : `<tr><td colspan="3" class="note">No debt records.</td></tr>`;
  }

  // Expense table (with filter)
  const expBody = document.querySelector("#expensesTable tbody");
  if (expBody) {
    const filtered = expenses.filter(it => inRange(it.date || "", filters.expenseFrom, filters.expenseTo));
    expBody.innerHTML = filtered.length
      ? filtered.map(it => editingExpense.has(it.id) ? `
            <tr>
              <td><input type="date" id="exp-date-${it.id}" value="${escapeHtml(it.date)}"/></td>
              <td><input type="text" id="exp-name-${it.id}" value="${escapeHtml(it.name)}"/></td>
              <td><input type="number" id="exp-amt-${it.id}" value="${it.amount}"/></td>
              <td>
                <button class="btn primary" onclick="saveExpense('${it.id}')">Save</button>
                <button class="btn" onclick="cancelExpense('${it.id}')">Cancel</button>
              </td>
            </tr>` : `
            <tr>
              <td>${escapeHtml(it.date)}</td>
              <td>${escapeHtml(it.name)}</td>
              <td>${fmt(it.amount)}</td>
              <td>
                <button class="btn" onclick="editExpense('${it.id}')">Edit</button>
                <button class="btn danger" onclick="deleteExpense('${it.id}')">Delete</button>
              </td>
            </tr>`).join("")
      : `<tr><td colspan="4" class="note">No expense records${filters.expenseFrom||filters.expenseTo?" in selected range":""}.</td></tr>`;
    const tot = document.getElementById("expFilterTotal");
    if (tot) tot.textContent = fmt(sum(filtered));
  }
}

function saveIncome(id) {
  const amt = parseFloat(document.getElementById(`inc-amt-${id}`).value);
  const lbl = document.getElementById(`inc-label-${id}`).value.trim();
  const dateEl = document.getElementById(`inc-date-${id}`);
  const date = dateEl ? dateEl.value : "";
  if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
  incomesCol.doc(id).update({ amount: amt, label: lbl, date })
    .then(() => editingIncome.delete(id))
    .catch(e => alert("Save failed: " + e.message));
}
function deleteIncome(id) {
  if (!confirm("Delete this income record?")) return;
  incomesCol.doc(id).delete();
  editingIncome.delete(id);
}
function saveDebt(id) {
  const amt = parseFloat(document.getElementById(`debt-amt-${id}`).value);
  const lbl = document.getElementById(`debt-label-${id}`).value.trim();
  if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
  debtsCol.doc(id).update({ amount: amt, label: lbl })
    .then(() => editingDebt.delete(id))
    .catch(e => alert("Save failed: " + e.message));
}
function deleteDebt(id) {
  if (!confirm("Delete this debt record?")) return;
  debtsCol.doc(id).delete();
  editingDebt.delete(id);
}
function saveExpense(id) {
  const name = document.getElementById(`exp-name-${id}`).value.trim();
  const amount = parseFloat(document.getElementById(`exp-amt-${id}`).value);
  const date = document.getElementById(`exp-date-${id}`).value;
  if (!name) return alert("Enter expense name");
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount");
  if (!date) return alert("Pick a date");
  expensesCol.doc(id).update({ name, amount, date })
    .then(() => editingExpense.delete(id))
    .catch(e => alert("Save failed: " + e.message));
}
function deleteExpense(id) {
  if (!confirm("Delete this expense record?")) return;
  expensesCol.doc(id).delete();
  editingExpense.delete(id);
}

// Kick off realtime subscriptions on every page
subscribeAll();
