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
// function formatDateFromMMDDYYYY(dateStr) {
//   const [month, day, year] = dateStr.split(/[\/\-]/);
//   if (!month || !day || !year) return null;
//   return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
// }

// ✅ Fixed Date Formatting Function
// function formatDateFromMMDDYYYY(dateStr) {
//   if (!dateStr) return null;

//   console.log("📅 Raw date from Excel:", dateStr, typeof dateStr);

//   // Handle Excel numeric date (serial date like 45138)
//   if (typeof dateStr === 'number') {
//     // Excel serial date: days since January 1, 1900 (with leap year bug)
//     const excelEpoch = new Date(1900, 0, 1); // January 1, 1900
//     const date = new Date(excelEpoch.getTime() + (dateStr - 2) * 86400000); // -2 accounts for Excel's leap year bug
    
//     const yyyy = date.getFullYear();
//     const mm = String(date.getMonth() + 1).padStart(2, '0');
//     const dd = String(date.getDate()).padStart(2, '0');
    
//     console.log(`📅 Converted Excel serial ${dateStr} to ${yyyy}-${mm}-${dd}`);
//     return `${yyyy}-${mm}-${dd}`;
//   }

//   // If it's a Date object
//   if (dateStr instanceof Date) {
//     const yyyy = dateStr.getFullYear();
//     const mm = String(dateStr.getMonth() + 1).padStart(2, '0');
//     const dd = String(dateStr.getDate()).padStart(2, '0');
    
//     console.log(`📅 Converted Date object to ${yyyy}-${mm}-${dd}`);
//     return `${yyyy}-${mm}-${dd}`;
//   }

//   // If it's a string, clean it up first
//   if (typeof dateStr === 'string') {
//     const cleanStr = dateStr.trim().replace(/['"]+/g, '');
    
//     // Try to parse as ISO date first (YYYY-MM-DD)
//     if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
//       const testDate = new Date(cleanStr);
//       if (!isNaN(testDate.getTime())) {
//         console.log(`📅 Already in ISO format: ${cleanStr}`);
//         return cleanStr;
//       }
//     }
    
//     // Try MM/DD/YYYY or MM-DD-YYYY format
//     const parts = cleanStr.split(/[-/]/);
//     if (parts.length === 3) {
//       let [part1, part2, part3] = parts;
      
//       // Determine if it's MM/DD/YYYY or DD/MM/YYYY based on values
//       let month, day, year;
      
//       if (part3.length === 4) {
//         // Third part is year
//         year = part3;
        
//         // Check if first part is likely month (> 12 means it's probably day)
//         if (parseInt(part1) > 12) {
//           day = part1;
//           month = part2;
//         } else if (parseInt(part2) > 12) {
//           month = part1;
//           day = part2;
//         } else {
//           // Assume MM/DD/YYYY (US format)
//           month = part1;
//           day = part2;
//         }
//       } else {
//         console.warn(`❌ Unexpected date format: ${cleanStr}`);
//         return null;
//       }
      
//       const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
//       // Validate the date
//       const testDate = new Date(formattedDate);
//       if (isNaN(testDate.getTime())) {
//         console.warn(`❌ Invalid date created: ${formattedDate} from ${cleanStr}`);
//         return null;
//       }
      
//       console.log(`📅 Converted ${cleanStr} to ${formattedDate}`);
//       return formattedDate;
//     }
//   }
  
//   console.warn(`❌ Could not parse date: ${dateStr} (type: ${typeof dateStr})`);
//   return null;
// }


// ✅ Handle Forecast Excel Upload
// ✅ Forecast Excel Upload Support
let forecastPayload = [];

document.getElementById("forecastExcelInput").addEventListener("change", handleForecastExcelFile);
document.getElementById("uploadForecastToDB").addEventListener("click", uploadForecastData);





// ✅ Improved Excel File Reading
async function handleForecastExcelFile(event) {
  const file = event.target.files[0];
  if (!file) return alert("❌ No file selected");

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
// ✅ Improved Observation Data Upload
// document.getElementById("uploadObservationButton").addEventListener("click", async () => {
//   const fileInput = document.getElementById("observationUploadInput");
//   const file = fileInput.files[0];

//   if (!file) {
//     alert("Please select an Excel file.");
//     return;
//   }

//   const reader = new FileReader();
//   reader.onload = async (e) => {
//     const data = new Uint8Array(e.target.result);
    
//     // ✅ Better Excel reading options for observation data
//     const workbook = XLSX.read(data, { 
//       type: "array",
//       cellDates: true,  // ← This helps Excel parse dates as Date objects
//       dateNF: 'mm/dd/yyyy' // ← Expected date format
//     });
    
//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];
    
//     // ✅ Convert sheet to JSON with better options
//     const json = XLSX.utils.sheet_to_json(worksheet, {
//       defval: null, // Default value for empty cells
//       raw: false    // Don't use raw values, let XLSX handle formatting
//     });

//     if (json.length === 0) {
//       alert("Sheet is empty.");
//       return;
//     }

//     const entries = [];

//     for (let i = 0; i < json.length; i++) {
//       const row = json[i];
//       const {
//         "forecast_date": forecastDateRaw,
//         "district_name": district,
//         "rainfall": rainfall,
//         "temp_max_c": tempMax,
//         "temp_min_c": tempMin,
//         "humidity_1": humidity1,
//         "humidity_2": humidity2,
//         "wind_speed_kmph": windSpeed,
//         "wind_direction_deg": windDir,
//         "cloud_cover_octa": cloud
//       } = row;

//       console.log(`Processing observation row ${i + 1}:`, { 
//         district, 
//         forecastDateRaw, 
//         type: typeof forecastDateRaw 
//       });

//       if (!district || (forecastDateRaw === null || forecastDateRaw === undefined || forecastDateRaw === "")) {
//         console.warn(`❌ Observation row ${i + 2} skipped: missing district_name or forecast_date`, row);
//         continue;
//       }

//       const forecast_date = formatDateFromMMDDYYYY(forecastDateRaw);
//       if (!forecast_date) {
//         console.warn(`❌ Observation row ${i + 2} skipped: invalid date format - "${forecastDateRaw}" (type: ${typeof forecastDateRaw})`, row);
//         continue;
//       }

//       entries.push({
//         forecast_date,
//         district_name: district,
//         rainfall: parseNullableFloat(rainfall),
//         temp_max_c: parseNullableFloat(tempMax),
//         temp_min_c: parseNullableFloat(tempMin),
//         humidity_1: parseNullableFloat(humidity1),
//         humidity_2: parseNullableFloat(humidity2),
//         wind_speed_kmph: parseNullableFloat(windSpeed),
//         wind_direction_deg: parseNullableFloat(windDir),
//         cloud_cover_octa: parseNullableFloat(cloud),
//       });
//     }

//     console.log("📦 Uploading", entries.length, "observation rows to observation_data_flat");

//     if (entries.length === 0) {
//       alert("⚠️ No valid observation data rows found to upload.");
//       return;
//     }

//     const { error } = await client
//       .from("observation_data_flat")
//       .insert(entries);

//     if (error) {
//       console.error("❌ Observation upload failed:", error.message);
//       alert("Upload failed: " + error.message);
//     } else {
//       alert("✅ Observation data uploaded successfully.");
//       // Clear the file input and refresh the upload list
//       fileInput.value = "";
//       listObservationUploads();
//     }
//   };

//   reader.readAsArrayBuffer(file);
// });

// ✅ SINGLE, UNIFIED DATE FORMATTING FUNCTION
// Replace ALL existing formatDateFromMMDDYYYY functions with this one
function formatDateFromMMDDYYYY(dateStr) {
  if (!dateStr && dateStr !== 0) return null;

  console.log("📅 Raw date input:", dateStr, "Type:", typeof dateStr);

  // Handle Excel numeric date (serial date like 45138)
  if (typeof dateStr === 'number') {
    // Excel serial date: days since January 1, 1900
    // Excel incorrectly considers 1900 a leap year, so we need to account for that
    let date;
    if (dateStr > 59) {
      // After Feb 28, 1900, subtract 1 day to account for Excel's leap year bug
      date = new Date(1900, 0, dateStr - 1);
    } else {
      date = new Date(1900, 0, dateStr);
    }
    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    const result = `${yyyy}-${mm}-${dd}`;
    console.log(`📅 Converted Excel serial ${dateStr} to ${result}`);
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

        const forecast_date = formatDateFromMMDDYYYY(forecastDateRaw);
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
