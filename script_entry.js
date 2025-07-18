// ✅ Supabase Setup
const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co'; // ⬅️ REPLACE
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';                    // ⬅️ REPLACE
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);



// ✅ Parameters and Districts
const parameters = [
  "Rainfall (mm)", "Temp Max (deg C)", "Temp Min (deg C)",
  "Humidity-Morning(%)", "Humidity-Evening",
  "Windspeed (kmph)", "WindDirection (deg)", "CloudCover (octa)"
];

const districts = [
  "Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla",
  "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur",
  "Kakinada", "Krishna", "Kurnool", "Nandyal", "Nellore", "NTR", "Palnadu",
  "Parvathipuram Manyam", "Prakasam", "Srikakulam", "Sri Sathya Sai", "Tirupati",
  "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"
];

//  Dropdown Setup
const dropdown = document.getElementById("dropdownList");
districts.forEach(d => {
  const option = document.createElement("option");
  option.value = d;
  option.textContent = d;
  dropdown.appendChild(option);
});
const dsName = document.getElementById("dsName");
dropdown.addEventListener("change", () => {
  dsName.textContent = `Selected District: ${dropdown.value}`;
});

//  Entry Table Setup
const tableBody = document.querySelector("#entryTable tbody");
parameters.forEach(param => {
  const row = document.createElement("tr");
  const paramCell = document.createElement("td");
  paramCell.textContent = param;
  row.appendChild(paramCell);
  for (let i = 0; i < 5; i++) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    cell.appendChild(input);
    row.appendChild(cell);
  }
  tableBody.appendChild(row);
});

// ✅ Calendar Logic
const calendarBtn = document.getElementById("calendarBtn");
const calendar = document.getElementById("calendar");
const calendarBody = document.getElementById("calendarBody");
const monthYear = document.getElementById("monthYear");
const selectedDateDisplay = document.getElementById("selectedDate");
const selectedDateCell = document.getElementById("selectedDateCell");
const dateDisplay = document.getElementById("dateDisplay");
let currentDate = new Date();

calendarBtn.addEventListener("click", () => {
  calendar.classList.toggle("hidden");
  generateCalendar(currentDate);
});

document.getElementById("prevMonth").addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  generateCalendar(currentDate);
});
document.getElementById("nextMonth").addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  generateCalendar(currentDate);
});

function generateCalendar(date) {
  calendarBody.innerHTML = "";
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  monthYear.textContent = `${date.toLocaleString('default', { month: 'long' })} ${year}`;

  let row = document.createElement("tr");
  for (let i = 0; i < firstDay; i++) row.appendChild(document.createElement("td"));

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("td");
    cell.textContent = day;
    cell.addEventListener("click", () => {
      const selected = new Date(year, month, day);
      const formatted = selected.toDateString();
      selectedDateDisplay.textContent = formatted;
      selectedDateCell.textContent = formatted;
      dateDisplay.textContent = formatted;
      calendar.classList.add("hidden");
    });
    row.appendChild(cell);
    if ((firstDay + day) % 7 === 0) {
      calendarBody.appendChild(row);
      row = document.createElement("tr");
    }
  }
  calendarBody.appendChild(row);
}

document.addEventListener("click", function (event) {
  const isClickInside = calendar.contains(event.target) || calendarBtn.contains(event.target);
  if (!isClickInside) calendar.classList.add("hidden");
});

function formatDateISO(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split("T")[0];
}

// ✅ Entry Submission
document.getElementById("submitButton").addEventListener("click", async () => {
  const selectedDistrict = dropdown.value;
  const selectedDateStr = selectedDateCell.textContent;
  if (!selectedDistrict || !selectedDateStr) {
    alert("Please select a district and date.");
    return;
  }

  const baseDateISO = formatDateISO(selectedDateStr);
  const baseDateObj = new Date(selectedDateStr);
  const entryTableRows = document.querySelectorAll("#entryTable tbody tr");
  const entries = [];

  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    const forecastDate = new Date(baseDateObj);
    forecastDate.setDate(baseDateObj.getDate() + dayIndex + 1);
    const forecastDateISO = forecastDate.toISOString().split("T")[0];

    entryTableRows.forEach((row, paramIndex) => {
      const param = parameters[paramIndex];
      const input = row.querySelectorAll("input")[dayIndex];
      const value = parseFloat(input.value);
      if (!isNaN(value)) {
        entries.push({
          district: selectedDistrict,
          base_date: baseDateISO,
          forecast_day: dayIndex + 1,
          forecast_date: forecastDateISO,
          parameter: param,
          value: value
        });
      }
    });
  }

  const { data, error } = await client
    .from('data_entry_table')
    .upsert(entries, { onConflict: ['district', 'base_date', 'forecast_day', 'parameter'] });

  if (error) {
    console.error("❌ Supabase Insert Error:", error.message, error.details);
    alert("❌ Failed to submit data: " + error.message);
    return;
  } else {
    alert("✅ Data submitted successfully!");
    displayInOutputTable(entries);
    loadBaseDatesForExport(); // Refresh date list
  }
  document.querySelectorAll("#entryTable input").forEach(input => {
    input.value = "";
  })
});

// ✅ Output Table
const outputTableBody = document.querySelector("#excelSheet tbody");
function clearOutputTable() {
  outputTableBody.innerHTML = "";
}

function displayInOutputTable(entries) {
  clearOutputTable();
  let sectionIndex = 0;
  const grouped = {};
  entries.forEach(entry => {
    const key = `${entry.district}|${entry.base_date}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  });

  for (const [key, rows] of Object.entries(grouped)) {
    const color = sectionIndex % 2 === 0 ? "white" : "#d4fcd4";
    sectionIndex++;
    rows.sort((a, b) => a.forecast_day - b.forecast_day);
    for (let day = 1; day <= 5; day++) {
      const dayData = rows.filter(r => r.forecast_day === day);
      const tr = document.createElement("tr");
      tr.style.backgroundColor = color;

      const districtCell = document.createElement("td");
      districtCell.textContent = dayData[0]?.district || "";
      tr.appendChild(districtCell);

      const dateCell = document.createElement("td");
      dateCell.textContent = dayData[0]?.forecast_date || "";
      tr.appendChild(dateCell);

      parameters.forEach(param => {
        const val = dayData.find(d => d.parameter === param)?.value || "";
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });

      const warningCell = document.createElement("td");
      warningCell.textContent = "";
      tr.appendChild(warningCell);
      outputTableBody.appendChild(tr);
    }
  }
}

// ✅ Export Date List with Download and Delete
async function loadBaseDatesForExport() {
  const { data, error } = await client
    .from('data_entry_table')
    .select('base_date')
    .order('base_date', { ascending: false });

  if (error) {
    console.error("❌ Failed to load dates:", error);
    return;
  }

  const uniqueDates = [...new Set(data.map(d => d.base_date))];
  const exportSection = document.getElementById("exportDatesList") || document.createElement("div");
  exportSection.id = "exportDatesList";
  exportSection.innerHTML = "<h3>Download or Clear Submitted Data</h3>";
  const list = document.createElement("ul");

  uniqueDates.forEach(date => {
    const li = document.createElement("li");
    li.id = `entry-${date}`;
    li.style.marginBottom = "10px";

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = `📥 Download sheet for ${date}`;
    downloadBtn.onclick = () => exportBaseDateToExcel(date);

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "🗑️ Clear data";
    clearBtn.style.marginLeft = "10px";
    clearBtn.style.backgroundColor = "#ff4d4d";
    clearBtn.style.color = "white";
    clearBtn.onclick = () => confirmAndDeleteBaseDate(date);

    li.appendChild(downloadBtn);
    li.appendChild(clearBtn);
    list.appendChild(li);
  });

  exportSection.appendChild(list);
  document.body.appendChild(exportSection);
}

// ✅ Export to Excel
async function exportBaseDateToExcel(baseDate) {
  const { data, error } = await client
    .from('data_entry_table')
    .select('*')
    .eq('base_date', baseDate);

  if (error) {
    console.error("❌ Failed to fetch entries:", error);
    return;
  }

  const rows = [];
  const grouped = {};
  data.forEach(row => {
    const key = `${row.district}|${row.forecast_date}`;
    if (!grouped[key]) grouped[key] = { district: row.district, forecast_date: row.forecast_date, parameters: {} };
    grouped[key].parameters[row.parameter] = row.value;
  });

  for (const entry of Object.values(grouped)) {
    rows.push({
      "District": entry.district,
      "Forecast Date": entry.forecast_date,
      "Rainfall (mm)": entry.parameters["Rainfall (mm)"] || "",
      "Temp Max (deg C)": entry.parameters["Temp Max (deg C)"] || "",
      "Temp Min (deg C)": entry.parameters["Temp Min (deg C)"] || "",
      "Humidity-Morning(%)": entry.parameters["Humidity-Morning(%)"] || "",
      "Humidity-Evening": entry.parameters["Humidity-Evening"] || "",
      "Windspeed (kmph)": entry.parameters["Windspeed (kmph)"] || "",
      "WindDirection (deg)": entry.parameters["WindDirection (deg)"] || "",
      "CloudCover (octa)": entry.parameters["CloudCover (octa)"] || ""
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Forecast");
  XLSX.writeFile(wb, `forecast_${baseDate}.xlsx`);
}

// ✅ Clear data for base date and 5 forecast days
async function confirmAndDeleteBaseDate(baseDate) {
    const confirmed = confirm(`Are you sure you want to delete all entries for base date ${baseDate} and its 5-day forecast?`);
    if (!confirmed) return;
  
    try {
      const base = new Date(baseDate);
      const forecastDates = [];
  
      for (let i = 1; i <= 5; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        forecastDates.push(d.toISOString().split("T")[0]);
      }
  
      // 1. Delete rows with the exact base_date
      const { error: baseError } = await client
        .from("data_entry_table")
        .delete()
        .eq("base_date", baseDate);
  
      if (baseError) {
        console.error("❌ Failed to delete base_date rows:", baseError);
      }
  
      // 2. Delete rows where forecast_date is in the 5-day window
      const { error: forecastError } = await client
        .from("data_entry_table")
        .delete()
        .in("forecast_date", forecastDates);
  
      if (forecastError) {
        console.error("❌ Failed to delete forecast_date rows:", forecastError);
      }
  
      if (!baseError && !forecastError) {
        alert(`✅ Cleared all data for base date ${baseDate}`);
        document.getElementById(`entry-${baseDate}`)?.remove();
      } else {
        alert("❌ Something failed during deletion. See console.");
      }
  
    } catch (err) {
      console.error("❌ Unexpected error:", err);
      alert("Unexpected error during deletion.");
    }
  }
  
  

// ✅ Auto-run on load
document.addEventListener("DOMContentLoaded", () => {
  loadBaseDatesForExport();
});
