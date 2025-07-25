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

function normalizeDate(date) {
  return new Date(date).toISOString().split('T')[0]; // returns 'YYYY-MM-DD'
}



// ✅ Handle Forecast Excel Upload
// ✅ Forecast Excel Upload Support
let forecastPayload = [];

document.getElementById("forecastExcelInput").addEventListener("change", handleForecastExcelFile);
document.getElementById("uploadForecastToDB").addEventListener("click", uploadForecastData);


// ✅ Improved Excel File Reading
async function handleForecastExcelFile(event) {
  const file = event.target.files[0];
  if (!file) return alert("❌ No file selected");

  //window.forecastSheetName = file.name.split('.')[0]; // e.g., "forecast_july25"

  const reader = new FileReader();
  reader.onload = (e) => {
    const byteData = new Uint8Array(e.target.result);
    
    // ✅ Better Excel reading options
    const workbook = XLSX.read(byteData, { 
      type: "array",
      cellDates: true,  // ← This helps Excel parse dates as Date objects
      dateNF: 'mm/dd/yyyy' // ← Expected date format
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // ✅ Convert sheet to JSON with better options
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null, // Default value for empty cells
      raw: false    // Don't use raw values, let XLSX handle formatting
    });

    const parsed = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const district = (row["district_name"] || "").trim();
      const dateRaw = row["forecast_date"];

      console.log(`Processing row ${i + 1}:`, { district, dateRaw, type: typeof dateRaw });

      if (!district || (dateRaw === null || dateRaw === undefined || dateRaw === "")) {
        console.warn(`❌ Row ${i + 2} skipped: missing district_name or forecast_date`, row);
        continue;
      }

      const formattedDate = formatDateFromMMDDYYYY(dateRaw);
      if (!formattedDate) {
        console.warn(`❌ Row ${i + 2} skipped: invalid date format - "${dateRaw}" (type: ${typeof dateRaw})`, row);
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

  const sheetNameInput = document.getElementById("forecastSheetNameInput").value.trim();
  if (!sheetNameInput) {
    alert("⚠️ Please enter a sheet name.");
    return;
  }

  const finalPayload = forecastPayload.map(row => ({
    ...row,
    sheet_name: sheetNameInput
  }));

  const { error } = await client
    .from("forecast_excel_uploads")
    .insert(finalPayload);

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

async function loadForecastUploadList() {
  const listEl = document.getElementById("forecastUploadList");
  listEl.innerHTML = "<li>Loading...</li>";

  const { data, error } = await client
    .from("forecast_excel_uploads")
    .select("sheet_name", {distinct: true})
    .neq("sheet_name", null)
    .limit(1000);
    
  

  if (error) {
    listEl.innerHTML = `<li style="color:red;">Error: ${error.message}</li>`;
    return;
  }

  console.log("Fetched rows from Supabase:", data.map(d => d.sheet_name));


  const uniqueSheets = [...new Set(data.map(row => row.sheet_name))];
  listEl.innerHTML = '';

  if (uniqueSheets.length === 0) {
    listEl.innerHTML = "<li>No uploads yet.</li>";
    return;
  }

  uniqueSheets.forEach(sheet => {
    const li = document.createElement("li");
    li.textContent = sheet;
  
    const btn = document.createElement("button");
    btn.textContent = "Delete";
    btn.style.marginLeft = "10px";
    btn.onclick = () => deleteForecastSheet(sheet);
  
    li.appendChild(btn);
    listEl.appendChild(li);
    console.log("Creating <li> for:", sheet);

  });
  
}

async function deleteForecastSheet(sheetName) {
  const confirmDelete = confirm(`Are you sure you want to delete all data for "${sheetName}"?`);
  if (!confirmDelete) return;

  const { error } = await client
    .from("forecast_excel_uploads")
    .delete()
    .eq("sheet_name", sheetName);

  if (error) {
    alert("❌ Error deleting sheet: " + error.message);
  } else {
    alert(`✅ Deleted all forecast data for "${sheetName}"`);

    // ✅ Refresh the list to remove it from view
    await loadForecastUploadList();
  }
}





//DATE FORMATTING 

//FOR FORECAST
function formatDateFromMMDDYYYY(dateStr) {
  if (!dateStr && dateStr !== 0) return null;

  console.log("📅 Raw date input:", dateStr, "Type:", typeof dateStr);

  // Handle Excel numeric date (serial date like 45138)
  if (typeof dateStr === 'number') {
    console.log("🔍 DEBUGGING Excel serial date:", dateStr);
    
    // Let's try multiple approaches and see which one works
    
    // Method 1: Standard Excel epoch (Dec 30, 1899)
    const method1Date = new Date(1899, 11, 30);
    method1Date.setDate(method1Date.getDate() + dateStr);
    console.log("Method 1 result:", method1Date.toISOString().split('T')[0]);
    
    // Method 2: Excel epoch with +1 day correction
    const method2Date = new Date(1899, 11, 30);
    method2Date.setDate(method2Date.getDate() + dateStr + 1);
    console.log("Method 2 result:", method2Date.toISOString().split('T')[0]);
    
    // Method 3: Using Unix timestamp calculation
    const method3Date = new Date((dateStr - 25569) * 86400 * 1000);
    console.log("Method 3 result:", method3Date.toISOString().split('T')[0]);
    
    // Method 4: Simple date calculation
    const baseDate = new Date('1900-01-01');
    const method4Date = new Date(baseDate.getTime() + (dateStr - 1) * 24 * 60 * 60 * 1000);
    console.log("Method 4 result:", method4Date.toISOString().split('T')[0]);
    
    // For now, let's use Method 2 (seems most likely to work)
    const yyyy = method2Date.getFullYear();
    const mm = String(method2Date.getMonth() + 1).padStart(2, '0');
    const dd = String(method2Date.getDate()).padStart(2, '0');
    const result = `${yyyy}-${mm}-${dd}`;
    
    console.log(`📅 FINAL RESULT: Excel serial ${dateStr} converted to ${result}`);
    return result;
  }

  // If it's a Date object
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    const yyyy = dateStr.getFullYear();
    const mm = String(dateStr.getMonth() + 1).padStart(2, '0');
    const dd = String(dateStr.getDate()).padStart(2, '0');
    
    const result = `${yyyy}-${mm}-${dd}`;
    console.log(`📅 Converted Date object to ${result}`);
    return result;
  }

  // If it's a string
  if (typeof dateStr === 'string') {
    const cleanStr = dateStr.trim().replace(/['"]+/g, '');
    
    // If it's already in ISO format (YYYY-MM-DD)
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
      const testDate = new Date(cleanStr);
      if (!isNaN(testDate.getTime())) {
        console.log(`📅 Already in ISO format: ${cleanStr}`);
        return cleanStr;
      }
    }
    
    // Parse MM/DD/YYYY, MM-DD-YYYY, or similar formats
    const parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) {
      let [part1, part2, part3] = parts.map(p => p.trim());
      
      let month, day, year;
      
      // Determine which part is the year (should be 4 digits)
      if (part3.length === 4) {
        year = part3;
        // Assume MM/DD/YYYY format (US standard)
        month = part1;
        day = part2;
      } else if (part1.length === 4) {
        // YYYY/MM/DD format
        year = part1;
        month = part2;
        day = part3;
      } else {
        console.warn(`❌ Cannot determine year from: ${cleanStr}`);
        return null;
      }
      
      // Validate month and day ranges
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);
      
      if (monthNum < 1 || monthNum > 12) {
        console.warn(`❌ Invalid month ${monthNum} in: ${cleanStr}`);
        return null;
      }
      
      if (dayNum < 1 || dayNum > 31) {
        console.warn(`❌ Invalid day ${dayNum} in: ${cleanStr}`);
        return null;
      }
      
      const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Final validation
      const testDate = new Date(result);
      if (isNaN(testDate.getTime())) {
        console.warn(`❌ Invalid date created: ${result} from ${cleanStr}`);
        return null;
      }
      
      console.log(`📅 Converted "${cleanStr}" to ${result}`);
      return result;
    }
  }
  
  console.warn(`❌ Could not parse date: "${dateStr}" (type: ${typeof dateStr})`);
  return null;
}

//FOR OBSERVATION
function formatDateObservation(dateStr) {
  if (!dateStr && dateStr !== 0) return null;

  let parsedDate = null;

  // If it's a number (Excel serial)
  if (typeof dateStr === 'number') {
    const baseDate = new Date(1899, 11, 30);
    baseDate.setDate(baseDate.getDate() + dateStr);
    parsedDate = baseDate;
  }

  // If it's a Date object
  else if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    parsedDate = new Date(dateStr);
  }

  // If it's a string
  else if (typeof dateStr === 'string') {
    const cleanStr = dateStr.trim().replace(/['"]+/g, '');

    // Already ISO?
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
      parsedDate = new Date(cleanStr);
    } else {
      const parts = cleanStr.split(/[-/]/);
      if (parts.length === 3) {
        let [part1, part2, part3] = parts.map(p => p.trim());

        let year, month, day;
        if (part3.length === 4) {
          year = part3;
          month = part1;
          day = part2;
        } else if (part1.length === 4) {
          year = part1;
          month = part2;
          day = part3;
        }

        const tryDate = new Date(`${year}-${month}-${day}`);
        if (!isNaN(tryDate.getTime())) {
          parsedDate = tryDate;
        }
      }
    }
  }

  if (!parsedDate || isNaN(parsedDate.getTime())) {
    console.warn(`❌ Could not parse date:`, dateStr);
    return null;
  }

  // ✅ Add 1 day to fix observation date shift
  parsedDate.setDate(parsedDate.getDate() + 1);

  // Format to yyyy-mm-dd
  const yyyy = parsedDate.getFullYear();
  const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(parsedDate.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}



// ✅ UPDATED OBSERVATION UPLOAD FUNCTION
document.getElementById("uploadObservationButton").addEventListener("click", async () => {
  const fileInput = document.getElementById("observationUploadInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select an Excel file.");
    return;
  }

  console.log("📂 Starting observation file upload...");

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      
      // Read Excel with specific options
      const workbook = XLSX.read(data, { 
        type: "array",
        cellDates: true,
        cellStyles: true,
        sheetStubs: false
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      console.log("📊 Sheet name:", sheetName);
      
      // Get the raw data first to see what we're working with
      const jsonRaw = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        blankrows: false
      });
      
      console.log("📋 First few raw rows:", jsonRaw.slice(0, 3));
      
      // Now get structured data
      const json = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        blankrows: false
      });

      

      console.log("📋 First structured row:", json[0]);
      console.log("📋 Total rows found:", json.length);

      if (json.length === 0) {
        alert("Sheet is empty or has no valid data.");
        return;
      }

      const entries = [];
      let skippedCount = 0;

      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        
        // Try different possible column names for date
        const forecastDateRaw = row["forecast_date"] || 
                               row["date"] || 
                               row["Date"] || 
                               row["Forecast_Date"] ||
                               row["FORECAST_DATE"];
                               
        // Try different possible column names for district
        const district = (row["district_name"] || 
                         row["district"] || 
                         row["District"] || 
                         row["District_Name"] ||
                         row["DISTRICT_NAME"] || "").toString().trim();

        console.log(`🔍 Row ${i + 1} - Date raw:`, forecastDateRaw, "District:", district);

        if (!district || (!forecastDateRaw && forecastDateRaw !== 0)) {
          console.warn(`⚠️ Row ${i + 1} skipped: missing district or date`, { district, forecastDateRaw });
          skippedCount++;
          continue;
        }

        const forecast_date = formatDateObservation(forecastDateRaw);
        if (!forecast_date) {
          console.warn(`⚠️ Row ${i + 1} skipped: could not parse date "${forecastDateRaw}"`);
          skippedCount++;
          continue;
        }

        entries.push({
          forecast_date,
          district_name: district,
          rainfall: parseNullableFloat(row["rainfall"]),
          temp_max_c: parseNullableFloat(row["temp_max_c"]),
          temp_min_c: parseNullableFloat(row["temp_min_c"]),
          humidity_1: parseNullableFloat(row["humidity_1"]),
          humidity_2: parseNullableFloat(row["humidity_2"]),
          wind_speed_kmph: parseNullableFloat(row["wind_speed_kmph"]),
          wind_direction_deg: parseNullableFloat(row["wind_direction_deg"]),
          cloud_cover_octa: parseNullableFloat(row["cloud_cover_octa"]),
        });
      }

      console.log(`📊 Processing complete: ${entries.length} valid entries, ${skippedCount} skipped`);

      if (entries.length === 0) {
        alert(`⚠️ No valid observation data found. ${skippedCount} rows were skipped. Please check the console for details.`);
        return;
      }

      // Show a sample of what we're about to upload
      console.log("📤 Sample entry to upload:", entries[0]);

      const { error } = await client
        .from("observation_data_flat")
        .insert(entries);

      if (error) {
        console.error("❌ Observation upload failed:", error);
        alert("Upload failed: " + error.message);
      } else {
        alert(`✅ Successfully uploaded ${entries.length} observation records!`);
        fileInput.value = "";
        listObservationUploads();
      }
      
    } catch (err) {
      console.error("❌ File processing error:", err);
      alert("Error processing file: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
});

// ✅ Helper function (keep this the same)
function parseNullableFloat(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}





function parseNullableFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}


// 🔄 Load on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  loadForecastUploadList();
});








