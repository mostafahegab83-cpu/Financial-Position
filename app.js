// ===== Firestore Finance App — Records + Reports only =====
let entries = []; // {id, year, month(1-12), cashAmount, cashDesc, expAmount, expDesc, createdAt}
let debts   = []; // {id, amount, label}

let selectedYear = String(new Date().getFullYear());
const editingEntries = new Set();  // entry IDs currently in edit mode
const newRows = {};                // { "year-month": tempId } draft new rows not yet saved
const editingDebt = new Set();
const collapsedMonths = new Set(); // keys "year-month" that are collapsed

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","March","April","May","June",
                     "July","August","September","October","November","December"];

const fmt = n => Number(n || 0).toFixed(2);
const ts  = () => firebase.firestore.FieldValue.serverTimestamp();
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const createdMs = it => it.createdAt && it.createdAt.toMillis ? it.createdAt.toMillis() : 0;

// ===== Realtime subscriptions =====
function subscribeAll() {
  entriesCol.onSnapshot(snap => {
    entries = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => createdMs(a) - createdMs(b));
    refreshAll();
  });
  debtsCol.onSnapshot(snap => {
    debts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => createdMs(a) - createdMs(b));
    refreshAll();
  });
}
function refreshAll() {
  if (document.getElementById("recordsTable"))     renderRecords();
  if (document.getElementById("debtsReportTable")) renderReports();
}

// ===== Helpers =====
function entriesOf(year, month) {
  return entries.filter(e => String(e.year) === String(year) && Number(e.month) === Number(month));
}
function availableYears() {
  const years = new Set([String(new Date().getFullYear()), selectedYear]);
  entries.forEach(e => years.add(String(e.year)));
  return [...years].sort();
}
function onChangeYear() {
  selectedYear = document.getElementById("yearSelect").value;
  renderRecords();
}

// ===== Collapse / Expand =====
function toggleMonth(month) {
  const key = `${selectedYear}-${month}`;
  if (collapsedMonths.has(key)) collapsedMonths.delete(key);
  else collapsedMonths.add(key);
  renderRecords();
}
function collapseAllMonths() {
  for (let m = 1; m <= 12; m++) collapsedMonths.add(`${selectedYear}-${m}`);
  renderRecords();
}
function expandAllMonths() {
  for (let m = 1; m <= 12; m++) collapsedMonths.delete(`${selectedYear}-${m}`);
  renderRecords();
}

// ===== Records page =====
function renderRecords() {
  const ysel = document.getElementById("yearSelect");
  if (ysel) {
    const years = availableYears();
    ysel.innerHTML = years.map(y =>
      `<option value="${y}"${y === selectedYear ? " selected" : ""}>${y}</option>`
    ).join("");
  }
  const tbody = document.querySelector("#recordsTable tbody");
  if (!tbody) return;

  let running = 0; // cumulative carry-over across months
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const list = entriesOf(selectedYear, m);
    const key = `${selectedYear}-${m}`;
    const hasDraft = !!newRows[key];
    const isCollapsed = collapsedMonths.has(key);

    if (isCollapsed) {
      // Compute month totals and advance running balance
      const cashTot = list.reduce((a,e) => a + Number(e.cashAmount || 0), 0);
      const expTot  = list.reduce((a,e) => a + Number(e.expAmount  || 0), 0);
      running = running + cashTot - expTot;
      rows.push(renderCollapsedRow(m, list.length, cashTot, expTot, running));
      continue;
    }

    const totalRowsForMonth = list.length + (hasDraft ? 1 : 0) || 1;
    let first = true;
    if (list.length === 0 && !hasDraft) {
      rows.push(renderMonthRow(m, null, true, 1, false, true, running));
    } else {
      list.forEach(e => {
        running = running + Number(e.cashAmount || 0) - Number(e.expAmount || 0);
        rows.push(renderMonthRow(m, e, first, totalRowsForMonth, false, false, running));
        first = false;
      });
      if (hasDraft) {
        rows.push(renderMonthRow(m, { id: newRows[key], _draft: true }, first, totalRowsForMonth, true, false, running));
      }
    }
  }
  tbody.innerHTML = rows.join("");
}

function monthCellHtml(month, rowspan, isCollapsed) {
  const caret = isCollapsed ? "▸" : "▾";
  return `
    <td class="month-cell" rowspan="${rowspan}">
      <div class="month-name">
        <button type="button" class="toggle-btn" onclick="toggleMonth(${month})" aria-label="Toggle ${MONTH_SHORT[month-1]}">${caret}</button>
        ${MONTH_SHORT[month-1]}
      </div>
      <a href="javascript:void(0)" class="add-link" onclick="addRow(${month})">+ Add</a>
    </td>`;
}

function renderCollapsedRow(month, count, cashTot, expTot, running) {
  const runCls = running > 0 ? "pos" : (running < 0 ? "neg" : "muted");
  const label = count === 0 ? `<span class="muted">No entries</span>` : `${count} ${count === 1 ? "entry" : "entries"}`;
  return `<tr class="collapsed-row">${monthCellHtml(month, 1, true)}
    <td><div class="display-amount">${fmt(cashTot)}</div><div class="display-desc">${label}</div></td>
    <td><div class="display-amount">${fmt(expTot)}</div><div class="display-desc">Month totals</div></td>
    <td class="${runCls}"><strong>${fmt(running)}</strong></td>
    <td class="actions"><button class="btn" onclick="toggleMonth(${month})">Expand</button></td>
  </tr>`;
}

function renderMonthRow(month, entry, isFirst, rowspan, isDraft, isEmpty, running) {
  const monthCell = isFirst ? monthCellHtml(month, rowspan, false) : "";

  if (isEmpty) {
    const runCls = running > 0 ? "pos" : (running < 0 ? "neg" : "muted");
    return `<tr>${monthCell}
      <td class="muted">—</td>
      <td class="muted">—</td>
      <td class="${runCls}">${fmt(running)}</td>
      <td></td>
    </tr>`;
  }

  const id = entry.id;
  const isEditing = isDraft || editingEntries.has(id);
  const cashAmt = entry.cashAmount ?? "";
  const cashDesc = entry.cashDesc ?? "";
  const expAmt = entry.expAmount ?? "";
  const expDesc = entry.expDesc ?? "";
  const rem = Number(running || 0);
  const remCls = rem > 0 ? "pos" : (rem < 0 ? "neg" : "");

  if (isEditing) {
    return `<tr data-id="${id}">${monthCell}
      <td>
        <div class="field-label">Amount</div>
        <input type="number" step="0.01" min="0" class="cell-input" id="ca-${id}" value="${escapeHtml(cashAmt)}" placeholder="Amount"/>
        <div class="field-label">Description</div>
        <input type="text" class="cell-input" id="cd-${id}" value="${escapeHtml(cashDesc)}" placeholder="Description"/>
      </td>
      <td>
        <div class="field-label">Amount</div>
        <input type="number" step="0.01" min="0" class="cell-input" id="ea-${id}" value="${escapeHtml(expAmt)}" placeholder="Amount"/>
        <div class="field-label">Description</div>
        <input type="text" class="cell-input" id="ed-${id}" value="${escapeHtml(expDesc)}" placeholder="Description"/>
      </td>
      <td class="${remCls}"><strong>${fmt(rem)}</strong></td>
      <td class="actions">
        <button class="btn primary" onclick="saveEntry('${id}', ${month}, ${isDraft})">Save</button>
        <button class="btn" onclick="cancelEntry('${id}', ${month}, ${isDraft})">Cancel</button>
      </td>
    </tr>`;
  }

  return `<tr data-id="${id}">${monthCell}
    <td>
      <div class="display-amount">${fmt(cashAmt)}</div>
      <div class="display-desc">${escapeHtml(cashDesc) || "—"}</div>
    </td>
    <td>
      <div class="display-amount">${fmt(expAmt)}</div>
      <div class="display-desc">${escapeHtml(expDesc) || "—"}</div>
    </td>
    <td class="${remCls}"><strong>${fmt(rem)}</strong></td>
    <td class="actions">
      <button class="btn primary" onclick="viewEntry('${id}')">View</button>
      <button class="btn primary" onclick="editEntry('${id}')">Edit</button>
      <button class="btn danger" onclick="deleteEntry('${id}')">Delete</button>
    </td>
  </tr>`;
}

function addRow(month) {
  const key = `${selectedYear}-${month}`;
  // expand the month so the new draft row is visible
  collapsedMonths.delete(key);
  if (newRows[key]) { renderRecords(); return; }
  newRows[key] = `draft-${Date.now()}`;
  renderRecords();
}

function editEntry(id) { editingEntries.add(id); renderRecords(); }

function cancelEntry(id, month, isDraft) {
  if (isDraft) {
    delete newRows[`${selectedYear}-${month}`];
  } else {
    editingEntries.delete(id);
  }
  renderRecords();
}

function saveEntry(id, month, isDraft) {
  const cashAmt = parseFloat(document.getElementById(`ca-${id}`).value) || 0;
  const cashDesc = document.getElementById(`cd-${id}`).value.trim();
  const expAmt = parseFloat(document.getElementById(`ea-${id}`).value) || 0;
  const expDesc = document.getElementById(`ed-${id}`).value.trim();

  if (cashAmt < 0 || expAmt < 0) return alert("Amounts must be 0 or greater.");
  if (cashAmt === 0 && expAmt === 0) return alert("Enter at least a Cash In or Expense amount.");
  if (cashAmt > 0 && !cashDesc) return alert("Please add a description for Cash In.");
  if (expAmt > 0 && !expDesc)  return alert("Please add a description for the Expense.");

  const payload = {
    year: String(selectedYear),
    month: Number(month),
    cashAmount: cashAmt,
    cashDesc,
    expAmount: expAmt,
    expDesc,
  };

  if (isDraft) {
    payload.createdAt = ts();
    entriesCol.add(payload)
      .then(() => { delete newRows[`${selectedYear}-${month}`]; })
      .catch(e => alert("Save failed: " + e.message));
  } else {
    entriesCol.doc(id).update(payload)
      .then(() => editingEntries.delete(id))
      .catch(e => alert("Save failed: " + e.message));
  }
}

function deleteEntry(id) {
  if (!confirm("Delete this entry? This clears its values.")) return;
  entriesCol.doc(id).delete().catch(e => alert("Delete failed: " + e.message));
}

function viewEntry(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const rem = Number(e.cashAmount || 0) - Number(e.expAmount || 0);
  const remCls = rem > 0 ? "pos" : (rem < 0 ? "neg" : "");
  const html = `
    <h3>${MONTH_NAMES[(e.month||1)-1]} ${e.year}</h3>
    <div class="view-block">
      <h4>Cash In</h4>
      <p><strong>${fmt(e.cashAmount)}</strong> — ${escapeHtml(e.cashDesc) || "—"}</p>
    </div>
    <div class="view-block">
      <h4>Expenses</h4>
      <p><strong>${fmt(e.expAmount)}</strong> — ${escapeHtml(e.expDesc) || "—"}</p>
    </div>
    <div class="view-block">
      <h4>Remaining Cash</h4>
      <p class="${remCls}"><strong>${fmt(rem)}</strong></p>
    </div>`;
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modal").classList.add("open");
}
function closeModal() { document.getElementById("modal").classList.remove("open"); }

// ===== Reports page (Debts) =====
function addDebt() {
  const amount = parseFloat(document.getElementById("debtInput").value);
  const label  = document.getElementById("debtLabel").value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Amount must be greater than 0.");
  if (!label) return alert("Description is required.");
  debtsCol.add({ amount, label, createdAt: ts() })
    .then(() => {
      document.getElementById("debtInput").value = "";
      document.getElementById("debtLabel").value = "";
    })
    .catch(e => alert("Save failed: " + e.message));
}
function editDebt(id)   { editingDebt.add(id); renderReports(); }
function cancelDebt(id) { editingDebt.delete(id); renderReports(); }
function saveDebt(id) {
  const amount = parseFloat(document.getElementById(`debt-amt-${id}`).value);
  const label  = document.getElementById(`debt-lbl-${id}`).value.trim();
  if (isNaN(amount) || amount <= 0) return alert("Amount must be greater than 0.");
  if (!label) return alert("Description is required.");
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
      <td class="num"><input type="number" min="0.01" step="0.01" id="debt-amt-${d.id}" value="${d.amount}"/></td>
      <td><input type="text" id="debt-lbl-${d.id}" value="${escapeHtml(d.label||"")}"/></td>
      <td class="actions">
        <button class="btn primary" onclick="saveDebt('${d.id}')">Save</button>
        <button class="btn" onclick="cancelDebt('${d.id}')">Cancel</button>
      </td>
    </tr>` : `
    <tr>
      <td class="num">${fmt(d.amount)}</td>
      <td>${escapeHtml(d.label||"—")}</td>
      <td class="actions">
        <button class="btn" onclick="editDebt('${d.id}')">Edit</button>
        <button class="btn danger" onclick="deleteDebt('${d.id}')">Delete</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="3" class="note">No debts yet.</td></tr>`;
  const tot = debts.reduce((a,b) => a + Number(b.amount || 0), 0);
  const totEl = document.getElementById("debtsTotal");
  if (totEl) totEl.textContent = fmt(tot);
}

subscribeAll();
