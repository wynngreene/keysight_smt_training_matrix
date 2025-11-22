// ====== GLOBAL DATA ======
let parts = [];               // { partNumber, family, commonName, description, status }
let partsByNumber = {};       // partNumber -> part object
let operators = [];           // { name, trainings: { [partNumber]: level } }

// ====== PAGINATION CONFIG ======
const OPERATOR_PAGE_SIZE = 15;
let currentOperatorName = null;
let currentOperatorPage = 1;

// ====== CSV CONFIG FOR YOUR LAYOUT ======
// Row 13 in Excel (zero-based index 12) = real header row with Eden, Lourdes, etc.
const HEADER_ROW_INDEX = 12;       // zero-based index
const FIRST_DATA_ROW_INDEX = 13;   // first row with actual part data
const OPERATOR_COL_START = 16;     // "Eden" column index
const OPERATOR_COL_END   = 38;     // "Nikki, NPI" column index

// ====== TRAINING LEVEL LOGIC ======
// "In Process" = NOT trained; status only.
// "Trained", "Trainer 1", "Trainer 2" = count as trained.
function isLevelTrained(level) {
  if (!level) return false;
  const v = level.trim().toLowerCase();
  return v === "trained" || v === "trainer 1" || v === "trainer 2";
}

// Priority for sorting in 3B Training by Part
// 1. Trainer 1
// 2. Trainer 2
// 3. Trained
// 4. In Process
// 5. Everything else (alphabetical after these)
function levelPriority(level) {
  if (!level) return 5;
  const l = level.trim().toLowerCase();

  if (l === "trainer 1") return 1;
  if (l === "trainer 2") return 2;
  if (l === "trained")   return 3;
  if (l === "in process") return 4;

  return 5;
}

// ====== DOM ELEMENTS ======
const csvInput = document.getElementById("csvInput");
const loadStatus = document.getElementById("loadStatus");

const operatorSelect = document.getElementById("operatorSelect");
const operatorViewTitle = document.getElementById("operatorViewTitle");
const operatorTableBody = document.querySelector("#operatorTable tbody");
const operatorTable = document.getElementById("operatorTable");

const partScanInput = document.getElementById("partScanInput");
const searchPartBtn = document.getElementById("searchPartBtn");
const partHeader = document.getElementById("partHeader");
const partResultBody = document.querySelector("#partResultTable tbody");

const clearFiltersBtn = document.getElementById("clearFiltersBtn");

const newOperatorNameInput = document.getElementById("newOperatorName");
const addOperatorBtn = document.getElementById("addOperatorBtn");
const addOperatorMsg = document.getElementById("addOperatorMsg");

const editOperatorSelect = document.getElementById("editOperatorSelect");
const editPartInput = document.getElementById("editPartInput");
const editLevelSelect = document.getElementById("editLevelSelect");
const saveTrainingBtn = document.getElementById("saveTrainingBtn");
const saveTrainingMsg = document.getElementById("saveTrainingMsg");

// Create / grab pagination container for operator view
let operatorPagination = document.getElementById("operatorPagination");
if (!operatorPagination && operatorTable) {
  const tableWrapper = operatorTable.parentElement; // .table-responsive
  if (tableWrapper && tableWrapper.parentElement) {
    operatorPagination = document.createElement("div");
    operatorPagination.id = "operatorPagination";
    operatorPagination.className = "mt-2";
    tableWrapper.parentElement.appendChild(operatorPagination);
  }
}

// ====== CSV LOAD & PARSE ======

csvInput.addEventListener("change", () => {
  const file = csvInput.files[0];
  if (!file) return;

  loadStatus.textContent = "Loading and parsing CSV...";
  parseTrainingCsv(file);
});

function parseTrainingCsv(file) {
  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      try {
        buildDataFromCsvRows(results.data);
        loadStatus.textContent = "CSV loaded. Parts and operators are ready.";
      } catch (err) {
        console.error(err);
        loadStatus.textContent = "Error parsing CSV. Check console for details.";
      }
    }
  });
}

function buildDataFromCsvRows(rows) {
  parts = [];
  partsByNumber = {};
  operators = [];

  const headerRow = rows[HEADER_ROW_INDEX];
  if (!headerRow) {
    throw new Error("Header row not found at index " + HEADER_ROW_INDEX);
  }

  const operatorNames = headerRow
    .slice(OPERATOR_COL_START, OPERATOR_COL_END + 1)
    .map(name => (name || "").toString().trim())
    .filter(name => name !== "");

  const operatorsMap = {}; // name -> { name, trainings: {} }

  for (let r = FIRST_DATA_ROW_INDEX; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const partNumber = (row[2] || "").toString().trim();  // Col 2 = Part Number
    if (!partNumber) continue;

    const family = (row[1] || "").toString().trim();
    const commonName = (row[3] || "").toString().trim();
    const description = (row[4] || "").toString().trim();
    const status = (row[7] || "").toString().trim();

    if (!partsByNumber[partNumber]) {
      const part = { partNumber, family, commonName, description, status };
      parts.push(part);
      partsByNumber[partNumber] = part;
    }

    operatorNames.forEach((opName, idx) => {
      const colIndex = OPERATOR_COL_START + idx;
      const cell = (row[colIndex] || "").toString().trim();
      if (!cell) return;

      if (!operatorsMap[opName]) {
        operatorsMap[opName] = {
          name: opName,
          trainings: {}
        };
      }

      operatorsMap[opName].trainings[partNumber] = cell;
    });
  }

  operators = Object.values(operatorsMap);

  refreshOperatorDropdowns();
  clearViews();
}

// ====== DATA HELPERS ======

function getOperatorByName(name) {
  const target = name.trim().toLowerCase();
  return (
    operators.find(op => op.name.trim().toLowerCase() === target) || null
  );
}

function partExists(partNumber) {
  return !!partsByNumber[partNumber.trim()];
}

function addOperator(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, message: "Operator name cannot be empty." };
  }

  if (getOperatorByName(trimmed)) {
    return { success: false, message: "Operator already exists." };
  }

  const newOp = {
    name: trimmed,
    trainings: {}
  };
  operators.push(newOp);
  refreshOperatorDropdowns();

  return { success: true, message: `Operator "${trimmed}" added.` };
}

function setOperatorTraining(operatorName, partNumber, level, options = {}) {
  const {
    createOperatorIfMissing = true,
    allowUnknownPart = false
  } = options;

  const opName = operatorName.trim();
  const pn = partNumber.trim();
  const lvl = level.trim();

  if (!opName || !pn || !lvl) {
    return { success: false, message: "Operator, part, and level are required." };
  }

  if (!allowUnknownPart && !partExists(pn)) {
    return { success: false, message: `Part "${pn}" does not exist.` };
  }

  let operator = getOperatorByName(opName);
  if (!operator) {
    if (!createOperatorIfMissing) {
      return { success: false, message: `Operator "${opName}" does not exist.` };
    }
    const result = addOperator(opName);
    if (!result.success) return result;
    operator = getOperatorByName(opName);
  }

  operator.trainings[pn] = lvl;

  return {
    success: true,
    message: `Training updated: ${opName} - ${pn} (${lvl})`
  };
}

// ====== UI HELPERS ======

function refreshOperatorDropdowns() {
  populateSelectWithOperators(operatorSelect, "(Select operator)");
  populateSelectWithOperators(editOperatorSelect, "(Select operator)");
}

function populateSelectWithOperators(selectElem, placeholder) {
  const currentValue = selectElem.value;

  selectElem.innerHTML = "";
  const baseOption = document.createElement("option");
  baseOption.value = "";
  baseOption.textContent = placeholder || "(Select)";
  selectElem.appendChild(baseOption);

  operators
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(op => {
      const opt = document.createElement("option");
      opt.value = op.name;
      opt.textContent = op.name;
      selectElem.appendChild(opt);
    });

  const exists = operators.some(op => op.name === currentValue);
  if (exists) {
    selectElem.value = currentValue;
  } else {
    selectElem.value = "";
  }
}

function clearViews() {
  operatorTableBody.innerHTML = "";
  operatorViewTitle.textContent = "Select an operator to see their trained parts.";
  if (operatorPagination) operatorPagination.innerHTML = "";

  partResultBody.innerHTML = "";
  partHeader.textContent = "Scan or enter a part number to see who is trained.";
}

// ====== RENDERING: BY OPERATOR (WITH PAGINATION & CLICKABLE PARTS) ======

operatorSelect.addEventListener("change", () => {
  const opName = operatorSelect.value;
  if (!opName) {
    operatorTableBody.innerHTML = "";
    operatorViewTitle.textContent = "Select an operator to see their trained parts.";
    if (operatorPagination) operatorPagination.innerHTML = "";
    currentOperatorName = null;
    currentOperatorPage = 1;
    return;
  }
  currentOperatorName = opName;
  currentOperatorPage = 1;
  renderOperatorView(opName, 1);
});

function renderOperatorView(operatorName, page = 1) {
  const op = getOperatorByName(operatorName);
  if (!op) return;

  currentOperatorName = op.name;
  currentOperatorPage = page;

  operatorTableBody.innerHTML = "";
  if (operatorPagination) operatorPagination.innerHTML = "";

  const entries = Object.entries(op.trainings); // [ [partNumber, level], ... ]
  const totalItems = entries.length;

  // Count only levels that are truly "trained"
  const trainedCount = entries.filter(([, level]) => isLevelTrained(level)).length;

  operatorViewTitle.textContent =
    `Showing training for: ${op.name} — ${trainedCount} trained part(s)`;

  if (totalItems === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="text-muted">No training data for this operator yet.</td>`;
    operatorTableBody.appendChild(tr);
    return;
  }

  const totalPages = Math.ceil(totalItems / OPERATOR_PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * OPERATOR_PAGE_SIZE;
  const endIndex = Math.min(startIndex + OPERATOR_PAGE_SIZE, totalItems);
  const pageEntries = entries.slice(startIndex, endIndex);

  pageEntries.forEach(([partNumber, level]) => {
    const part = partsByNumber[partNumber] || {
      partNumber,
      family: "",
      commonName: "",
      description: "",
      status: ""
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <button
          type="button"
          class="btn btn-link p-0 operator-part-btn"
          data-part-number="${part.partNumber}"
        >
          ${part.partNumber}
        </button>
      </td>
      <td>${part.commonName}</td>
      <td>${part.family}</td>
      <td>${part.status}</td>
      <td>${level}</td>
    `;
    operatorTableBody.appendChild(tr);
  });

  // Make part numbers clickable → populate Scan input + update part view
  const partButtons = operatorTableBody.querySelectorAll(".operator-part-btn");
  partButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pn = e.currentTarget.dataset.partNumber;
      if (!pn) return;
      partScanInput.value = pn;
      renderPartView(pn);
    });
  });

  renderOperatorPagination(totalItems, safePage, startIndex + 1, endIndex);
}

function renderOperatorPagination(totalItems, page, from, to) {
  if (!operatorPagination) return;

  const totalPages = Math.ceil(totalItems / OPERATOR_PAGE_SIZE);
  operatorPagination.innerHTML = "";
  if (totalPages <= 1) return;

  const row = document.createElement("div");
  row.className = "d-flex justify-content-between align-items-center mt-2";

  const infoSpan = document.createElement("span");
  infoSpan.className = "small text-muted";
  infoSpan.textContent = `Showing ${from}-${to} of ${totalItems} part(s)`;
  row.appendChild(infoSpan);

  const navDiv = document.createElement("div");
  const ul = document.createElement("ul");
  ul.className = "pagination pagination-sm mb-0";

  function addPage(label, targetPage, disabled = false, active = false) {
    const li = document.createElement("li");
    li.className = "page-item";
    if (disabled) li.classList.add("disabled");
    if (active) li.classList.add("active");

    const a = document.createElement("a");
    a.className = "page-link";
    a.href = "#";
    a.textContent = label;

    if (!disabled && !active) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!currentOperatorName) return;
        renderOperatorView(currentOperatorName, targetPage);
      });
    }

    li.appendChild(a);
    ul.appendChild(li);
  }

  // Prev
  addPage("«", page - 1, page === 1, false);

  // Page numbers
  for (let p = 1; p <= totalPages; p++) {
    addPage(String(p), p, false, p === page);
  }

  // Next
  addPage("»", page + 1, page === totalPages, false);

  navDiv.appendChild(ul);
  row.appendChild(navDiv);

  operatorPagination.appendChild(row);
}

// ====== RENDERING: BY PART (WITH SORTED LEVEL ORDER) ======

searchPartBtn.addEventListener("click", () => {
  const pn = partScanInput.value.trim();
  if (!pn) return;
  renderPartView(pn);
});

partScanInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    const pn = partScanInput.value.trim();
    if (!pn) return;
    renderPartView(pn);
  }
});

function renderPartView(partNumber) {
  const pn = partNumber.trim();
  const part = partsByNumber[pn];

  partResultBody.innerHTML = "";

  if (!part) {
    partHeader.textContent = `Part "${pn}" not found.`;
    return;
  }

  partHeader.innerHTML = `
    <strong>${part.partNumber}</strong> — ${part.commonName || "(no name)"}<br/>
    <span class="text-muted">
      Family: ${part.family || "-"} | Status: ${part.status || "-"}
    </span>
  `;

  let trainedList = operators
    .map(op => {
      const level = op.trainings[pn];
      if (!level) return null;
      return { name: op.name, level };
    })
    .filter(Boolean);

  if (trainedList.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="text-muted">No operators trained on this part yet.</td>`;
    partResultBody.appendChild(tr);
    return;
  }

  // Sort by training level priority, then by operator name
  trainedList.sort((a, b) => {
    const prA = levelPriority(a.level);
    const prB = levelPriority(b.level);

    if (prA !== prB) return prA - prB;
    return a.name.localeCompare(b.name);
  });

  trainedList.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.level}</td>
    `;
    partResultBody.appendChild(tr);
  });
}

// ====== CLEAR FILTERS ======

clearFiltersBtn.addEventListener("click", () => {
  operatorSelect.value = "";
  partScanInput.value = "";
  currentOperatorName = null;
  currentOperatorPage = 1;
  clearViews();
});

// ====== ADD OPERATOR (UI) ======

addOperatorBtn.addEventListener("click", () => {
  const name = newOperatorNameInput.value;
  const result = addOperator(name);
  addOperatorMsg.textContent = result.message;
  if (result.success) {
    newOperatorNameInput.value = "";
  }
});

// ====== SAVE / UPDATE TRAINING (UI) ======

saveTrainingBtn.addEventListener("click", () => {
  const opName = editOperatorSelect.value || "";
  const pn = editPartInput.value || "";
  const lvl = editLevelSelect.value || "";

  const result = setOperatorTraining(opName, pn, lvl, {
    createOperatorIfMissing: false,
    allowUnknownPart: false
  });

  saveTrainingMsg.textContent = result.message;

  if (result.success) {
    if (operatorSelect.value === opName) {
      renderOperatorView(opName, currentOperatorPage || 1);
    }
    if (partScanInput.value.trim() === pn.trim()) {
      renderPartView(pn);
    }
  }
});
