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

// ✅ Populate District Dropdown
document.addEventListener("DOMContentLoaded", () => {
  const districtSelect = document.getElementById("filterDistrict");
  districts.forEach(d => {
    const option = document.createElement("option");
    option.value = d;
    option.textContent = d;
    districtSelect.appendChild(option);
  });
});

// ✅ Handle Filter Button
document.getElementById("filterButton").addEventListener("click", async () => {
  const selectedDay = document.getElementById("filterDay").value;
  const selectedDistrict = document.getElementById("filterDistrict").value;
  const resultDiv = document.getElementById("filteredResult");
  resultDiv.innerHTML = "";

  if (!selectedDay || !selectedDistrict) {
    alert("⚠️ Please select both a day and a district.");
    return;
  }

  const forecastDayNumber = parseInt(selectedDay.split(" ")[1]);

  const { data, error } = await client
    .from("data_entry_table")
    .select("*")
    .eq("district", selectedDistrict)
    .eq("forecast_day", forecastDayNumber)
    .order("base_date", { ascending: true });

  if (error) {
    console.error("❌ Supabase fetch error:", error);
    resultDiv.innerHTML = "<p style='color:red;'>Failed to fetch data. Check console.</p>";
    return;
  }

  if (data.length === 0) {
    resultDiv.innerHTML = "<p>No data found for selected filters.</p>";
    return;
  }

  const grouped = {};
  data.forEach(row => {
    if (!grouped[row.base_date]) {
      grouped[row.base_date] = {
        base_date: row.base_date,
        forecast_date: row.forecast_date,
        values: {}
      };
    }
    grouped[row.base_date].values[row.parameter] = row.value;
  });

  const table = document.createElement("table");
  const header = document.createElement("tr");
  ["Base Date", "Forecast Date", ...parameters].forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    header.appendChild(th);
  });
  table.appendChild(header);

  for (const baseDate in grouped) {
    const row = grouped[baseDate];
    const tr = document.createElement("tr");

    const baseDateCell = document.createElement("td");
    baseDateCell.textContent = row.base_date;
    tr.appendChild(baseDateCell);

    const forecastDateCell = document.createElement("td");
    forecastDateCell.textContent = row.forecast_date;
    tr.appendChild(forecastDateCell);

    parameters.forEach(param => {
      const td = document.createElement("td");
      td.textContent = row.values[param] !== undefined ? row.values[param] : "";
      tr.appendChild(td);
    });

    table.appendChild(tr);
  }

  resultDiv.appendChild(table);
});

// ✅ Format MM/DD/YYYY to YYYY-MM-DD
function formatDateFromMMDDYYYY(dateStr) {
  const [month, day, year] = dateStr.split(/[\/\-]/);
  if (!month || !day || !year) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// ✅ Handle Forecast Excel Upload
// ✅ Forecast Excel Upload Support
let forecastPayload = [];

document.getElementById("forecastExcelInput").addEventListener("change", handleForecastExcelFile);
document.getElementById("uploadForecastToDB").addEventListener("click", uploadForecastData);

async function handleForecastExcelFile(event) {
  const file = event.target.files[0];
  if (!file) return alert("❌ No file selected");

  const reader = new FileReader();
  reader.onload = (e) => {
    const byteData = new Uint8Array(e.target.result);
    const workbook = XLSX.read(byteData, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const parsed = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const district = (row["district_name"] || "").trim();
      const dateRaw = row["forecast_date"];

      if (!district || !dateRaw) {
        console.warn(`❌ Row ${i + 2} skipped: missing district_name or forecast_date`, row);
        continue;
      }

      const formattedDate = formatDateFromMMDDYYYY(dateRaw);
      if (!formattedDate) {
        console.warn(`❌ Row ${i + 2} skipped: invalid date format`, row);
        continue;
      }

      parsed.push({
        forecast_date: formattedDate,
        district_name: district,
        rainfall: parseNullableFloat(row["rainfall"]),
        temp_max_c: parseNullableFloat(row["temp_max_c"]),
        temp_min_c: parseNullableFloat(row["temp_min_c"]),
        humidity_1: parseNullableFloat(row["humidity_1"]),
        humidity_2: parseNullableFloat(row["humidity_2"]),
        wind_speed_kmph: parseNullableFloat(row["wind_speed_kmph"]),
        wind_direction_deg: parseNullableFloat(row["wind_direction_deg"]),
        cloud_cover_octa: parseNullableFloat(row["cloud_cover_octa"])
      });
    }

    forecastPayload = parsed;
    document.getElementById("uploadForecastToDB").disabled = parsed.length === 0;
    document.getElementById("forecastUploadStatus").textContent =
      parsed.length > 0
        ? `✅ Ready to upload ${parsed.length} rows.`
        : "⚠️ No valid rows found.";
  };

  reader.readAsArrayBuffer(file);
}

async function uploadForecastData() {
  if (forecastPayload.length === 0) {
    alert("No data to upload.");
    return;
  }

  const { error } = await client
    .from("forecast_excel_uploads")
    .insert(forecastPayload);

  if (error) {
    console.error("❌ Upload failed:", error);
    alert("Upload failed: " + error.message);
  } else {
    alert("✅ Forecast data uploaded successfully.");
    forecastPayload = [];
    document.getElementById("forecastExcelInput").value = "";
    document.getElementById("uploadForecastToDB").disabled = true;
    document.getElementById("forecastUploadStatus").textContent = "";
  }
}







//observsation data upload 
document.getElementById("uploadObservationButton").addEventListener("click", async () => {
  const fileInput = document.getElementById("observationUploadInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select an Excel file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet);

    if (json.length === 0) {
      alert("Sheet is empty.");
      return;
    }

    const entries = [];

    for (const row of json) {
      const {
        "forecast_date": forecastDateRaw,
        "district_name": district,
        "rainfall": rainfall,
        "temp_max_c": tempMax,
        "temp_min_c": tempMin,
        "humidity_1": humidity1,
        "humidity_2": humidity2,
        "wind_speed_kmph": windSpeed,
        "wind_direction_deg": windDir,
        "cloud_cover_octa": cloud
      } = row;

      if (!forecastDateRaw || !district) {
        console.warn("❌ Row skipped: missing date or district", row);
        continue;
      }

      const forecast_date = formatDateFromMMDDYYYY(row['forecast_date']);
      if (!forecast_date) {
        console.warn(`❌ Skipping row due to invalid date:`, row['forecast_date']);
        continue;
      }
      


      entries.push({
        forecast_date,
        district_name: district,
        rainfall: parseNullableFloat(rainfall),
        temp_max_c: parseNullableFloat(tempMax),
        temp_min_c: parseNullableFloat(tempMin),
        humidity_1: parseNullableFloat(humidity1),
        humidity_2: parseNullableFloat(humidity2),
        wind_speed_kmph: parseNullableFloat(windSpeed),
        wind_direction_deg: parseNullableFloat(windDir),
        cloud_cover_octa: parseNullableFloat(cloud),
      });
    }

    console.log("📦 Uploading", entries.length, "rows to observation_data_flat");

    const { error } = await client
      .from("observation_data_flat")
      .insert(entries);

    if (error) {
      console.error("❌ Upload failed:", error.message);
      alert("Upload failed: " + error.message);
    } else {
      alert("✅ Observation data uploaded successfully.");
    }
  };

  reader.readAsArrayBuffer(file);
});

// Helper functions
// function formatDateFromMMDDYYYY(dateStr) {
//   if (!dateStr) return null;

//   // Remove stray spaces/quotes
//   dateStr = dateStr.trim().replace(/['"]+/g, '');

//   const parts = dateStr.split(/[-\/]/); // supports both "/" and "-" separators
//   if (parts.length !== 3) return null;

//   let [mm, dd, yyyy] = parts;

//   mm = mm.padStart(2, "0");
//   dd = dd.padStart(2, "0");

//   const isoDate = `${yyyy}-${mm}-${dd}`;
//   const testDate = new Date(isoDate);

//   return isNaN(testDate.getTime()) ? null : isoDate;
// }

function formatDateFromMMDDYYYY(dateStr) {
  if (!dateStr) return null;

  // Convert to string if it’s not already
  if (typeof dateStr !== 'string') {
    // If it's a Date object from xlsx, convert to formatted string
    const d = new Date(dateStr);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // If it's already a string, continue as usual
  const [month, day, year] = dateStr.trim().split(/[-/]/);
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}



function parseNullableFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}


// 🔄 Load on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  listObservationUploads();
  listForecastUploads();
});

// ✅ Observation Upload Listing
async function listObservationUploads() {
  const { data, error } = await client
    .from("observation_data_flat")
    .select("forecast_date")
    .order("forecast_date", { ascending: false });

  if (error) {
    console.error("❌ Failed to fetch observation upload dates", error);
    return;
  }

  const dates = [...new Set(data.map(d => d.forecast_date))];
  const section = document.getElementById("observationUploadList");
  section.innerHTML = "<h4>📄 Observation Uploads</h4>";

  dates.forEach(date => {
    const container = document.createElement("div");
    container.style.marginBottom = "10px";

    const label = document.createElement("span");
    label.textContent = `📅 ${date}`;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️ Delete";
    deleteBtn.style.marginLeft = "10px";
    deleteBtn.style.backgroundColor = "#ff4d4d";
    deleteBtn.style.color = "white";
    deleteBtn.onclick = () => deleteObservationByDate(date);

    container.appendChild(label);
    container.appendChild(deleteBtn);
    section.appendChild(container);
  });
}

async function deleteObservationByDate(date) {
  if (!confirm(`Delete all observation entries for ${date}?`)) return;

  const { error } = await supabase
    .from("observation_data_flat")
    .delete()
    .eq("forecast_date", date);

  if (error) {
    alert("❌ Delete failed: " + error.message);
  } else {
    alert(`✅ Deleted observation entries for ${date}`);
    listObservationUploads();
  }
}

// ✅ Forecast Upload Listing
async function listForecastUploads() {
  const { data, error } = await client
    .from("forecast_excel_uploads")
    .select("forecast_date")
    .order("forecast_date", { ascending: false });

  if (error) {
    console.error("❌ Failed to fetch forecast upload dates", error);
    return;
  }

  const dates = [...new Set(data.map(d => d.forecast_date))];
  const section = document.getElementById("forecastUploadList");
  section.innerHTML = "<h4>📄 Forecast Uploads</h4>";

  dates.forEach(date => {
    const container = document.createElement("div");
    container.style.marginBottom = "10px";

    const label = document.createElement("span");
    label.textContent = `📅 ${date}`;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️ Delete";
    deleteBtn.style.marginLeft = "10px";
    deleteBtn.style.backgroundColor = "#ff4d4d";
    deleteBtn.style.color = "white";
    deleteBtn.onclick = () => deleteForecastByDate(date);

    container.appendChild(label);
    container.appendChild(deleteBtn);
    section.appendChild(container);
  });
}

async function deleteForecastByDate(date) {
  if (!confirm(`Delete all forecast entries for ${date}?`)) return;

  const { error } = await client
    .from("forecast_excel_uploads")
    .delete()
    .eq("forecast_date", date);

  if (error) {
    alert("❌ Delete failed: " + error.message);
  } else {
    alert(`✅ Deleted forecast entries for ${date}`);
    listForecastUploads();
  }
}
