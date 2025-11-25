// ====== GLOBAL DATA ======
let parts = [];               // { partNumber, family, commonName, description, status }
let partsByNumber = {};       // partNumber -> part
let operators = [];           // { name, trainings: { [partNumber]: level } }
let families = [];            // list of unique family names
let familyToParts = {};       // familyName -> [partNumber]

// ====== CSV CONFIG (same as main app) ======
const HEADER_ROW_INDEX = 12;       // zero-based index
const FIRST_DATA_ROW_INDEX = 13;   // first row with actual part data
const OPERATOR_COL_START = 16;     // "Eden" column index
const OPERATOR_COL_END   = 38;     // "Nikki, NPI" column index

// ====== TRAINING LEVEL LOGIC ======
function levelPriority(level) {
  if (!level) return 5;
  const l = level.trim().toLowerCase();

  if (l === "trainer 1") return 1;
  if (l === "trainer 2") return 2;
  if (l === "trained")   return 3;
  if (l === "in process") return 4;
  return 5;
}

function isLevelTrained(level) {
  if (!level) return false;
  const v = level.trim().toLowerCase();
  return v === "trained" || v === "trainer 1" || v === "trainer 2";
}

// ====== DOM ELEMENTS ======
const csvInputFamily = document.getElementById("csvInputFamily");
const loadStatusFamily = document.getElementById("loadStatusFamily");

const familySelect = document.getElementById("familySelect");
const familySummary = document.getElementById("familySummary");
const familyPartsTableBody = document.querySelector("#familyPartsTable tbody");

// ====== CSV LOAD & PARSE ======
csvInputFamily.addEventListener("change", () => {
  const file = csvInputFamily.files[0];
  if (!file) return;

  loadStatusFamily.textContent = "Loading and parsing CSV...";
  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      try {
        buildDataFromCsvRows(results.data);
        loadStatusFamily.textContent = "CSV loaded. Families are ready.";
      } catch (err) {
        console.error(err);
        loadStatusFamily.textContent = "Error parsing CSV. Check console.";
      }
    }
  });
});

function buildDataFromCsvRows(rows) {
  parts = [];
  partsByNumber = {};
  operators = [];
  families = [];
  familyToParts = {};

  const headerRow = rows[HEADER_ROW_INDEX];
  if (!headerRow) {
    throw new Error("Header row not found at index " + HEADER_ROW_INDEX);
  }

  const operatorNames = headerRow
    .slice(OPERATOR_COL_START, OPERATOR_COL_END + 1)
    .map(name => (name || "").toString().trim())
    .filter(name => name !== "");

  const operatorsMap = {}; // name -> { name, trainings: {} }

  // Build parts & operators
  for (let r = FIRST_DATA_ROW_INDEX; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const partNumber = (row[2] || "").toString().trim();
    if (!partNumber) continue;

    const family = (row[1] || "").toString().trim();
    const commonName = (row[3] || "").toString().trim();
    const description = (row[4] || "").toString().trim();
    const status = (row[7] || "").toString().trim();

    if (!partsByNumber[partNumber]) {
      const part = { partNumber, family, commonName, description, status };
      parts.push(part);
      partsByNumber[partNumber] = part;

      if (family) {
        if (!familyToParts[family]) {
          familyToParts[family] = [];
        }
        familyToParts[family].push(partNumber);
      }
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

  // Build families list
  families = Object.keys(familyToParts).sort((a, b) => a.localeCompare(b));

  refreshFamilyDropdown();
  clearFamilyView();
}

// ====== UI: FAMILY DROPDOWN ======
function refreshFamilyDropdown() {
  familySelect.innerHTML = "";
  const baseOption = document.createElement("option");
  baseOption.value = "";
  baseOption.textContent = "(Select part family)";
  familySelect.appendChild(baseOption);

  families.forEach(fam => {
    const opt = document.createElement("option");
    opt.value = fam;
    opt.textContent = fam;
    familySelect.appendChild(opt);
  });
}

function clearFamilyView() {
  familySummary.textContent = "Select a part family to see parts and training coverage.";
  familyPartsTableBody.innerHTML = "";
}

familySelect.addEventListener("change", () => {
  const fam = familySelect.value;
  if (!fam) {
    clearFamilyView();
    return;
  }
  renderFamilyView(fam);
});

// ====== FAMILY VIEW ======
function renderFamilyView(familyName) {
  const partNumbers = familyToParts[familyName] || [];
  familyPartsTableBody.innerHTML = "";

  if (partNumbers.length === 0) {
    familySummary.textContent = `No parts found for family: ${familyName}`;
    return;
  }

  // For summary: count trained parts and operators
  let totalParts = partNumbers.length;
  let totalFullyTrainedLinks = 0; // part-operator links with trained level
  let totalOperatorsWithAnyInFamily = 0;

  // Track operators that have any training in this family
  const familyOperatorSet = new Set();

  partNumbers.forEach(pn => {
    const part = partsByNumber[pn];
    if (!part) return;

    // Count training levels for this part
    let trainer1 = 0;
    let trainer2 = 0;
    let trained = 0;
    let inProcess = 0;
    let other = 0;

    operators.forEach(op => {
      const level = op.trainings[pn];
      if (!level) return;

      const l = level.trim().toLowerCase();
      if (l === "trainer 1") trainer1++;
      else if (l === "trainer 2") trainer2++;
      else if (l === "trained") trained++;
      else if (l === "in process") inProcess++;
      else other++;

      familyOperatorSet.add(op.name);
      if (isLevelTrained(level)) {
        totalFullyTrainedLinks++;
      }
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${part.partNumber}</td>
      <td>${part.commonName || ""}</td>
      <td>${part.status || ""}</td>
      <td>${trainer1}</td>
      <td>${trainer2}</td>
      <td>${trained}</td>
      <td>${inProcess}</td>
      <td>${other}</td>
    `;
    familyPartsTableBody.appendChild(tr);
  });

  totalOperatorsWithAnyInFamily = familyOperatorSet.size;

  familySummary.innerHTML = `
    <strong>${familyName}</strong><br/>
    <span class="text-muted">
      Parts in family: <strong>${totalParts}</strong> |
      Operators with any training in this family: <strong>${totalOperatorsWithAnyInFamily}</strong> |
      Fully-trained links (Trained / Trainer 1 / Trainer 2): <strong>${totalFullyTrainedLinks}</strong>
    </span>
  `;
}
