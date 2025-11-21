// ====== GLOBAL DATA ======
let parts = [];               // { partNumber, family, commonName, description, status }
let partsByNumber = {};       // partNumber -> part object
let operators = [];           // { name, trainings: { [partNumber]: level } }

// Config for your current CSV layout (you can tweak if your sheet changes)
const HEADER_ROW_INDEX = 12;       // zero-based; row 12 in Excel
const FIRST_DATA_ROW_INDEX = 13;   // first row with actual part data
const OPERATOR_COL_START = 16;     // "Eden" column index
const OPERATOR_COL_END   = 38;     // "Nikki, NPI" column index

// ====== DOM ELEMENTS ======
const csvInput = document.getElementById("csvInput");
const loadStatus = document.getElementById("loadStatus");

const operatorSelect = document.getElementById("operatorSelect");
const operatorViewTitle = document.getElementById("operatorViewTitle");
const operatorTableBody = document.querySelector("#operatorTable tbody");

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

  // Get header row
  const headerRow = rows[HEADER_ROW_INDEX];
  if (!headerRow) {
    throw new Error("Header row not found at index " + HEADER_ROW_INDEX);
  }

  // Operator names from header
  const operatorNames = headerRow
    .slice(OPERATOR_COL_START, OPERATOR_COL_END + 1)
    .map(name => (name || "").toString().trim())
    .filter(name => name !== "");

  // Temp map for building operators
  const operatorsMap = {}; // name -> { name, trainings: {} }

  // Walk data rows
  for (let r = FIRST_DATA_ROW_INDEX; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const partNumber = (row[2] || "").toString().trim();  // Col 2 = Part Number
    if (!partNumber) continue; // skip empty lines

    const family = (row[1] || "").toString().trim();
    const commonName = (row[3] || "").toString().trim();
    const description = (row[4] || "").toString().trim();
    const status = (row[7] || "").toString().trim();

    // Ensure part exists in our list
    if (!partsByNumber[partNumber]) {
      const part = { partNumber, family, commonName, description, status };
      parts.push(part);
      partsByNumber[partNumber] = part;
    }

    // For each operator column, if there's a value, assign training
    operatorNames.forEach((opName, idx) => {
      const colIndex = OPERATOR_COL_START + idx;
      const cell = (row[colIndex] || "").toString().trim();
      if (!cell) return; // no training info

      if (!operatorsMap[opName]) {
        operatorsMap[opName] = {
          name: opName,
          trainings: {}
        };
      }

      // Example: "Trainer 1", "OJT", etc.
      operatorsMap[opName].trainings[partNumber] = cell;
    });
  }

  // Convert operators map to array
  operators = Object.values(operatorsMap);

  // Refresh dropdowns and clear views
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

/**
 * Set/update training level for operator on a part.
 */
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
    if (!result.success) {
      return result;
    }
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
  // For main filter dropdown
  populateSelectWithOperators(operatorSelect, "(Select operator)");
  // For edit-training dropdown
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

  // Try to keep previous value if still valid
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

  partResultBody.innerHTML = "";
  partHeader.textContent = "Scan or enter a part number to see who is trained.";
}

// ====== RENDERING: BY OPERATOR ======

operatorSelect.addEventListener("change", () => {
  const opName = operatorSelect.value;
  if (!opName) {
    operatorTableBody.innerHTML = "";
    operatorViewTitle.textContent = "Select an operator to see their trained parts.";
    return;
  }
  renderOperatorView(opName);
});

function renderOperatorView(operatorName) {
  const op = getOperatorByName(operatorName);
  if (!op) return;

  operatorViewTitle.textContent = `Showing training for: ${op.name}`;

  operatorTableBody.innerHTML = "";

  const entries = Object.entries(op.trainings); // [ [partNumber, level], ... ]

  if (entries.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="text-muted">No training data for this operator yet.</td>`;
    operatorTableBody.appendChild(tr);
    return;
  }

  entries.forEach(([partNumber, level]) => {
    const part = partsByNumber[partNumber] || {
      partNumber,
      family: "",
      commonName: "",
      description: "",
      status: ""
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${part.partNumber}</td>
      <td>${part.commonName}</td>
      <td>${part.family}</td>
      <td>${part.status}</td>
      <td>${level}</td>
    `;
    operatorTableBody.appendChild(tr);
  });
}

// ====== RENDERING: BY PART ======

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

  // Header info
  partHeader.innerHTML = `
    <strong>${part.partNumber}</strong> — ${part.commonName || "(no name)"}<br/>
    <span class="text-muted">
      Family: ${part.family || "-"} | Status: ${part.status || "-"}
    </span>
  `;

  // Find operators trained on this part
  const trainedList = operators
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
    // Clear selection if you want
    // editLevelSelect.value = "";

    // Refresh views if currently filtered
    if (operatorSelect.value === opName) {
      renderOperatorView(opName);
    }
    if (partScanInput.value.trim() === pn.trim()) {
      renderPartView(pn);
    }
  }
});

