// daily_analysis.js

// Supabase Setup
const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Districts and Parameters
const districts = [
  "ALLURI SITHARAMA RAJU", "ANAKAPALLI", "ANANTAPUR", "ANNAMAYYA", "BAPATLA",
  "CHITTOOR", "DR. B.R. AMBEDKAR KONASEEMA", "EAST-GODAVARI","WEST-GODAVARI", "ELURU", "GUNTUR",
  "KAKINADA", "KRISHNA", "KURNOOL", "NANDYAL", "NELLORE", "NTR", "PALNADU",
  "PARVATHIPURAM MANYAM", "PRAKASAM", "SRIKAKULAM", "SRI SATHYA SAI", "TIRUPATHI",
  "VISAKHAPATNAM", "VIZIANAGARAM", "WEST GODAVARI", "YSR KADAPA"
];

const parameterMapping = {
  "Rainfall (mm)": "rainfall",
  "Temp Max (deg C)": "temp_max_c", 
  "Temp Min (deg C)": "temp_min_c",
  "Humidity-Morning(%)": "humidity_1",
  "Humidity-Evening(%)": "humidity_2",
  "Windspeed (kmph)": "wind_speed_kmph",
  "WindDirection (deg)": "wind_direction_deg",
  "CloudCover (octa)": "cloud_cover_octa"
};

let forecastPayload = [];
let observationPayload = [];
let existingForecastSheets = [];
let existingObservationSheets = [];

// --- Excel Upload Handlers ---

document.addEventListener('DOMContentLoaded', async () => {
  await loadForecastUploadList();
  await loadObservationUploadList();

  document.getElementById('forecastExcelInput').addEventListener('change', handleForecastExcelFile);
  document.getElementById('forecastSheetNameInput').addEventListener('input', validateForecastSheetName);
  document.getElementById('uploadForecastBtn').addEventListener('click', uploadForecastData);

  document.getElementById('observationExcelInput').addEventListener('change', handleObservationExcelFile);
  document.getElementById('observationSheetNameInput').addEventListener('input', validateObservationSheetName);
  document.getElementById('uploadObservationBtn').addEventListener('click', uploadObservationData);

  document.getElementById('analyzeBtn').addEventListener('click', performDailyAnalysis);
});

// --- Forecast Excel Upload ---

async function handleForecastExcelFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const byteData = new Uint8Array(e.target.result);
    const workbook = XLSX.read(byteData, { type: "array", cellDates: true, dateNF: 'mm/dd/yyyy' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

    const parsed = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const district = (row["district_name"] || "").trim();
      const dateRaw = row["forecast_date"];
      const dayRaw = row["day"] || row["day_number"];

      if (!district || !dateRaw || !dayRaw) continue;

      const formattedDate = formatDateFromMMDDYYYY(dateRaw);
      const dayNumbers = parseDayNumbersImproved(dayRaw);

      if (!formattedDate || dayNumbers.length === 0) continue;

      for (const dayNumber of dayNumbers) {
        parsed.push({
          day_number: dayNumber,
          forecast_date: formattedDate,
          district_name: district,
          rainfall: parseNullableFloatImproved(row["rainfall"]),
          temp_max_c: parseNullableFloatImproved(row["temp_max_c"]),
          temp_min_c: parseNullableFloatImproved(row["temp_min_c"]),
          humidity_1: parseNullableFloatImproved(row["humidity_1"]),
          humidity_2: parseNullableFloatImproved(row["humidity_2"]),
          wind_speed_kmph: parseNullableFloatImproved(row["wind_speed_kmph"]),
          wind_direction_deg: parseNullableFloatImproved(row["wind_direction_deg"]),
          cloud_cover_octa: parseNullableFloatImproved(row["cloud_cover_octa"])
        });
      }
    }

    forecastPayload = parsed;
    document.getElementById('forecastUploadStatus').textContent =
      parsed.length > 0
        ? `✅ Ready to upload ${parsed.length} forecast rows.`
        : "⚠️ No valid rows found.";
  };
  reader.readAsArrayBuffer(file);
}

// --- Observation Excel Upload (Fixed) ---

async function handleObservationExcelFile(event) {
    const file = event.target.files[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = (e) => {
      const byteData = new Uint8Array(e.target.result);
      const workbook = XLSX.read(byteData, { 
        type: "array",
        cellDates: true,
        cellStyles: true
      });
  
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: false
      });
  
      console.log("Raw observation rows:", rows);
      console.log("First few rows:", rows.slice(0, 3));
  
      const parsed = [];
      let skippedMissingFields = 0;
      let skippedInvalidDateOrDay = 0;
  
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        // Try multiple possible column names for district
        const district = (
          row["district_name"] || 
          row["District"] || 
          row["DISTRICT"] || 
          row["district"] ||
          ""
        ).toString().trim();
        
        // Try multiple possible column names for date
        const dateRaw = 
          row["forecast_date"] || 
          row["date"] || 
          row["Date"] || 
          row["DATE"] ||
          row["observation_date"] ||
          row["obs_date"];
        
        // Try multiple possible column names for day
        const dayRaw = 
          row["day"] || 
          row["Day"] || 
          row["DAY"] ||
          row["day_number"] || 
          row["Day_Number"] ||
          row["DAY_NUMBER"];
  
        console.log(`Row ${i}:`, { 
          district, 
          dateRaw: dateRaw, 
          dayRaw: dayRaw,
          originalRow: row 
        });
  
        if (!district || !dateRaw || (!dayRaw && dayRaw !== 0)) {
          console.warn(`Row ${i} skipped: missing required fields`, {
            district: !!district,
            dateRaw: !!dateRaw,
            dayRaw: !!dayRaw,
            row
          });
          skippedMissingFields++;
          continue;
        }
  
        // Format the date - use the improved formatter
        let formattedDate = formatDateObservationImproved(dateRaw);
        
        // Parse day numbers with improved logic
        const dayNumbers = parseDayNumbersImproved(dayRaw);
  
        console.log(`Row ${i}: formattedDate=${formattedDate}, dayNumbers=`, dayNumbers);
  
        if (!formattedDate || dayNumbers.length === 0) {
          console.warn(`Row ${i} skipped: invalid date or day format`, { 
            formattedDate, 
            dayNumbers, 
            dateRaw,
            dayRaw,
            row 
          });
          skippedInvalidDateOrDay++;
          continue;
        }
  
        // Create a row for each day number
        for (const dayNumber of dayNumbers) {
          parsed.push({
            day_number: dayNumber,
            forecast_date: formattedDate,
            district_name: district,
            rainfall: parseNullableFloatImproved(row["rainfall"] || row["Rainfall"] || row["RAINFALL"]),
            temp_max_c: parseNullableFloatImproved(row["temp_max_c"] || row["Temp_Max_C"] || row["TEMP_MAX_C"] || row["temp_max"] || row["max_temp"]),
            temp_min_c: parseNullableFloatImproved(row["temp_min_c"] || row["Temp_Min_C"] || row["TEMP_MIN_C"] || row["temp_min"] || row["min_temp"]),
            humidity_1: parseNullableFloatImproved(row["humidity_1"] || row["Humidity_1"] || row["HUMIDITY_1"] || row["humidity_morning"] || row["morning_humidity"]),
            humidity_2: parseNullableFloatImproved(row["humidity_2"] || row["Humidity_2"] || row["HUMIDITY_2"] || row["humidity_evening"] || row["evening_humidity"]),
            wind_speed_kmph: parseNullableFloatImproved(row["wind_speed_kmph"] || row["Wind_Speed_Kmph"] || row["WIND_SPEED_KMPH"] || row["wind_speed"] || row["windspeed"]),
            wind_direction_deg: parseNullableFloatImproved(row["wind_direction_deg"] || row["Wind_Direction_Deg"] || row["WIND_DIRECTION_DEG"] || row["wind_direction"] || row["wind_dir"]),
            cloud_cover_octa: parseNullableFloatImproved(row["cloud_cover_octa"] || row["Cloud_Cover_Octa"] || row["CLOUD_COVER_OCTA"] || row["cloud_cover"] || row["cloudcover"])
          });
        }
      }
  
      console.log(`Observation parsing complete: ${parsed.length} valid rows, ${skippedMissingFields} skipped (missing fields), ${skippedInvalidDateOrDay} skipped (invalid date/day)`);
      console.log("Sample parsed data:", parsed.slice(0, 3));
  
      observationPayload = parsed;
      document.getElementById('observationUploadStatus').textContent =
        parsed.length > 0
          ? `✅ Ready to upload ${parsed.length} observation rows.`
          : "⚠️ No valid rows found.";
    };
  
    reader.readAsArrayBuffer(file);
}

// --- Improved Day Parsing Helper ---

function parseDayNumbersImproved(dayRaw) {
  if (!dayRaw && dayRaw !== 0) return [];
  
  const dayStr = dayRaw.toString().toLowerCase().trim().replace(/\s+/g, '');
  console.log("Parsing day string:", dayStr);
  
  // Handle "day14" format (day 1 and day 4)
  if (dayStr.startsWith('day') && dayStr.length > 3) {
    const digits = dayStr.substring(3);
    console.log("Extracted digits from day string:", digits);
    
    // Parse each digit as a separate day
    const dayNumbers = [];
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits[i]);
      if (digit >= 1 && digit <= 7) {
        dayNumbers.push(digit);
      }
    }
    
    // Remove duplicates and sort
    const uniqueDays = [...new Set(dayNumbers)].sort((a, b) => a - b);
    console.log("Parsed day numbers:", uniqueDays);
    return uniqueDays;
  }
  
  // Handle "day 1", "day1", etc.
  const dayMatch = dayStr.match(/day\s*(\d+)/);
  if (dayMatch) {
    const dayNum = parseInt(dayMatch[1]);
    if (dayNum >= 1 && dayNum <= 7) {
      return [dayNum];
    }
  }
  
  // Handle direct numbers "1", "2", etc.
  const directNum = parseInt(dayStr);
  if (!isNaN(directNum) && directNum >= 1 && directNum <= 7) {
    return [directNum];
  }
  
  console.warn("Could not parse day string:", dayStr);
  return [];
}

// --- Sheet Name Validation ---

function validateForecastSheetName() {
  const sheetName = document.getElementById('forecastSheetNameInput').value;
  const validationDiv = document.getElementById('forecastSheetValidation');
  if (!sheetName.trim()) {
    validationDiv.textContent = "Please enter a sheet name.";
    validationDiv.style.display = "block";
    return false;
  }
  if (existingForecastSheets.includes(sheetName.trim())) {
    validationDiv.textContent = `Sheet name "${sheetName}" already exists. Please choose a different name.`;
    validationDiv.style.display = "block";
    return false;
  }
  validationDiv.style.display = "none";
  return true;
}

function validateObservationSheetName() {
  const sheetName = document.getElementById('observationSheetNameInput').value;
  const validationDiv = document.getElementById('observationSheetValidation');
  if (!sheetName.trim()) {
    validationDiv.textContent = "Please enter a sheet name.";
    validationDiv.style.display = "block";
    return false;
  }
  if (existingObservationSheets.includes(sheetName.trim())) {
    validationDiv.textContent = `Sheet name "${sheetName}" already exists. Please choose a different name.`;
    validationDiv.style.display = "block";
    return false;
  }
  validationDiv.style.display = "none";
  return true;
}

// --- Upload to Supabase ---

async function uploadForecastData() {
  if (forecastPayload.length === 0) {
    alert("Please select a forecast file first.");
    return;
  }
  const sheetName = document.getElementById('forecastSheetNameInput').value.trim();
  if (!sheetName) {
    alert("Please enter a sheet name.");
    return;
  }
  if (existingForecastSheets.includes(sheetName)) {
    alert("Sheet name already exists. Please choose a different name.");
    return;
  }
  const finalPayload = forecastPayload.map(row => ({ ...row, sheet_name: sheetName }));
  const { error } = await client.from('forecast_daily_data').insert(finalPayload);
  if (error) {
    alert("Upload failed: " + error.message);
  } else {
    alert(`✅ Forecast data uploaded successfully (${finalPayload.length} rows).`);
    forecastPayload = [];
    document.getElementById('forecastExcelInput').value = '';
    document.getElementById('forecastSheetNameInput').value = '';
    document.getElementById('forecastUploadStatus').textContent = '';
    document.getElementById('forecastSheetValidation').style.display = 'none';
    await loadForecastUploadList();
  }
}

async function uploadObservationData() {
  if (observationPayload.length === 0) {
    alert("Please select an observation file first.");
    return;
  }
  const sheetName = document.getElementById('observationSheetNameInput').value.trim();
  if (!sheetName) {
    alert("Please enter a sheet name.");
    return;
  }
  if (existingObservationSheets.includes(sheetName)) {
    alert("Sheet name already exists. Please choose a different name.");
    return;
  }
  const finalPayload = observationPayload.map(row => ({ ...row, sheet_name: sheetName }));
  const { error } = await client.from('observation_daily_data').insert(finalPayload);
  if (error) {
    alert("Upload failed: " + error.message);
  } else {
    alert(`✅ Observation data uploaded successfully (${finalPayload.length} rows).`);
    observationPayload = [];
    document.getElementById('observationExcelInput').value = '';
    document.getElementById('observationSheetNameInput').value = '';
    document.getElementById('observationUploadStatus').textContent = '';
    document.getElementById('observationSheetValidation').style.display = 'none';
    await loadObservationUploadList();
  }
}

// --- Load Existing Sheet Names ---

async function loadForecastUploadList() {
  const listEl = document.getElementById('forecastUploadList');
  listEl.innerHTML = '<li>Loading...</li>';
  const { data, error } = await client
    .from('forecast_daily_data')
    .select('sheet_name')
    .not('sheet_name', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    listEl.innerHTML = `<li style="color:red;">Error loading forecast uploads: ${error.message}</li>`;
    return;
  }
  const uniqueSheets = [...new Set(data?.map(row => row.sheet_name) || [])];
  existingForecastSheets = uniqueSheets;
  listEl.innerHTML = '';
  if (uniqueSheets.length === 0) {
    listEl.innerHTML = '<li>No forecast uploads yet.</li>';
    return;
  }
  uniqueSheets.forEach(sheet => {
    const li = document.createElement('li');
    li.textContent = sheet;
    listEl.appendChild(li);
  });
}

async function loadObservationUploadList() {
  const listEl = document.getElementById('observationUploadList');
  listEl.innerHTML = '<li>Loading...</li>';
  const { data, error } = await client
    .from('observation_daily_data')
    .select('sheet_name')
    .not('sheet_name', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    listEl.innerHTML = `<li style="color:red;">Error loading observation uploads: ${error.message}</li>`;
    return;
  }
  const uniqueSheets = [...new Set(data?.map(row => row.sheet_name) || [])];
  existingObservationSheets = uniqueSheets;
  listEl.innerHTML = '';
  if (uniqueSheets.length === 0) {
    listEl.innerHTML = '<li>No observation uploads yet.</li>';
    return;
  }
  uniqueSheets.forEach(sheet => {
    const li = document.createElement('li');
    li.textContent = sheet;
    listEl.appendChild(li);
  });
}

// --- Analysis ---

async function performDailyAnalysis() {
  const selectedDay = document.getElementById('daySelect').value;
  if (!selectedDay) {
    alert('Please select a day for analysis.');
    return;
  }
  const loadingMsg = document.getElementById('analysisLoadingMsg');
  const errorMsg = document.getElementById('analysisErrorMsg');
  const resultsSection = document.getElementById('analysisResultsSection');
  loadingMsg.style.display = 'block';
  errorMsg.style.display = 'none';
  resultsSection.style.display = 'none';

  try {
    const dayNumber = parseInt(selectedDay);
    const analysisResults = [];
    for (const district of districts) {
      const districtResults = await analyzeDistrictForDay(district, dayNumber);
      if (districtResults) {
        analysisResults.push({ district: district, ...districtResults });
      }
    }
    buildAnalysisResultsTable(dayNumber, analysisResults);
    loadingMsg.style.display = 'none';
    resultsSection.style.display = 'block';
  } catch (error) {
    errorMsg.textContent = 'An unexpected error occurred: ' + error.message;
    errorMsg.style.display = 'block';
    loadingMsg.style.display = 'none';
  }
}

async function analyzeDistrictForDay(district, dayNumber) {
  try {
    const { data: forecastData } = await client
      .from('forecast_daily_data')
      .select('*')
      .eq('district_name', district)
      .eq('day_number', dayNumber)
      .order('forecast_date');
    const { data: observationData } = await client
      .from('observation_daily_data')
      .select('*')
      .eq('district_name', district)
      .eq('day_number', dayNumber)
      .order('forecast_date');
    const parameterResults = {};
    for (const [paramName, dbColumn] of Object.entries(parameterMapping)) {
      const stats = computeParameterStats(forecastData, observationData, dbColumn);
      parameterResults[paramName] = stats;
    }
    return parameterResults;
  } catch (error) {
    return null;
  }
}

function computeParameterStats(forecastData, observationData, dbColumn) {
  const forecastMap = {};
  const obsMap = {};
  forecastData.forEach(fc => {
    const date = normalizeDate(fc.forecast_date);
    if (date && fc[dbColumn] != null && !isNaN(parseFloat(fc[dbColumn]))) {
      forecastMap[date] = parseFloat(fc[dbColumn]);
    }
  });
  observationData.forEach(obs => {
    const date = normalizeDate(obs.forecast_date);
    if (date && obs[dbColumn] != null && !isNaN(parseFloat(obs[dbColumn]))) {
      obsMap[date] = parseFloat(obs[dbColumn]);
    }
  });
  const allDates = new Set([...Object.keys(forecastMap), ...Object.keys(obsMap)]);
  let M = 0, N = 0, N1 = 0, N11 = 0, N3 = 0;
  allDates.forEach(date => {
    const fc = forecastMap[date];
    const obs = obsMap[date];
    if (fc == null || obs == null || isNaN(fc) || isNaN(obs)) {
      M++;
      return;
    }
    N++;
    const absDiff = Math.abs(obs - fc);
    if (absDiff <= 0.1) {
      N1++;
    } else {
      N11++;
      if (absDiff > 2) {
        N3++;
      }
    }
  });
  const N2 = N11 - N3;
  const correct = N === 0 ? 0 : (N1 / N) * 100;
  const usable = N === 0 ? 0 : (N2 / N) * 100;
  const unusable = N === 0 ? 0 : (N3 / N) * 100;
  const correctUsable = correct + usable;
  return { M, N, N1, N11, N2, N3, correct, usable, unusable, correctUsable };
}

function buildAnalysisResultsTable(dayNumber, analysisResults) {
  const table = document.getElementById('analysisResultsTable');
  let headerHtml = `
    <thead>
      <tr>
        <th colspan="${Object.keys(parameterMapping).length + 1}">
          Day ${dayNumber} Analysis - All Districts & Parameters
          <br><small>Error Structure: |obs - fc| ≤ 0.1 (Correct), > 0.1 & ≤ 2 (Usable), > 2 (Unusable)</small>
        </th>
      </tr>
      <tr>
        <th>District</th>`;
  Object.keys(parameterMapping).forEach(param => {
    headerHtml += `<th>${param}</th>`;
  });
  headerHtml += `</tr>
      <tr>
        <th></th>`;
  Object.keys(parameterMapping).forEach(() => {
    headerHtml += `<th>Correct + Usable (%)</th>`;
  });
  headerHtml += `</tr>
    </thead>`;
  let bodyHtml = '<tbody>';
  analysisResults.forEach(result => {
    bodyHtml += `<tr><td>${result.district}</td>`;
    Object.keys(parameterMapping).forEach(paramName => {
      const stats = result[paramName];
      if (!stats || stats.N === 0) {
        bodyHtml += `<td style="color: #999;">No Data</td>`;
        return;
      }
      let cellStyle = 'font-weight: bold;';
      if (stats.correctUsable >= 75) {
        cellStyle += 'background-color: #d4edda; color: #155724;';
      } else if (stats.correctUsable > 50) {
        cellStyle += 'background-color: #fff3cd; color: #856404;';
      } else {
        cellStyle += 'background-color: #f8d7da; color: #721c24;';
      }
      bodyHtml += `<td style="${cellStyle}" title="Correct: ${stats.correct.toFixed(1)}% | Usable: ${stats.usable.toFixed(1)}% | Unusable: ${stats.unusable.toFixed(1)}% | Total Pairs: ${stats.N}">${stats.correctUsable.toFixed(1)}%</td>`;
    });
    bodyHtml += '</tr>';
  });
  // Overall row
  if (analysisResults.length > 0) {
    const overallStats = computeOverallStats(analysisResults);
    bodyHtml += `<tr style="font-weight: bold; background-color: #e2e3e5;">
      <td>Overall Avg</td>`;
    Object.keys(parameterMapping).forEach(paramName => {
      const avg = overallStats[paramName];
      if (avg === null) {
        bodyHtml += `<td style="color: #999;">No Data</td>`;
      } else {
        let cellStyle = 'font-weight: bold;';
        if (avg >= 75) {
          cellStyle += 'background-color: #d4edda; color: #155724;';
        } else if (avg > 50) {
          cellStyle += 'background-color: #fff3cd; color: #856404;';
        } else {
          cellStyle += 'background-color: #f8d7da; color: #721c24;';
        }
        bodyHtml += `<td style="${cellStyle}">${avg.toFixed(1)}%</td>`;
      }
    });
    bodyHtml += '</tr>';
  }
  bodyHtml += '</tbody>';
  table.innerHTML = headerHtml + bodyHtml;
}

function computeOverallStats(analysisResults) {
  const paramNames = Object.keys(parameterMapping);
  const summary = {};
  paramNames.forEach(param => {
    let sum = 0, count = 0;
    analysisResults.forEach(result => {
      const stats = result[param];
      if (stats && stats.N > 0) {
        sum += stats.correctUsable;
        count++;
      }
    });
    summary[param] = count > 0 ? (sum / count) : null;
  });
  return summary;
}

// --- Utility Functions ---

function normalizeDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function formatDateFromMMDDYYYY(dateStr) {
  if (!dateStr && dateStr !== 0) return null;
  if (typeof dateStr === 'number') {
    const baseDate = new Date(1899, 11, 30);
    baseDate.setDate(baseDate.getDate() + dateStr + 1);
    const yyyy = baseDate.getFullYear();
    const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
    const dd = String(baseDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    const yyyy = dateStr.getFullYear();
    const mm = String(dateStr.getMonth() + 1).padStart(2, '0');
    const dd = String(dateStr.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof dateStr === 'string') {
    const cleanStr = dateStr.trim().replace(/['"]+/g, '');
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
      const testDate = new Date(cleanStr);
      if (!isNaN(testDate.getTime())) return cleanStr;
    }
    const parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) {
      let [part1, part2, part3] = parts.map(p => p.trim());
      let month, day, year;
      if (part3.length === 4) {
        year = part3;
        month = part1;
        day = part2;
      } else if (part1.length === 4) {
        year = part1;
        month = part2;
        day = part3;
      } else {
        return null;
      }
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);
      if (monthNum < 1 || monthNum > 12) return null;
      if (dayNum < 1 || dayNum > 31) return null;
      const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const testDate = new Date(result);
      if (isNaN(testDate.getTime())) return null;
      return result;
    }
  }
  return null;
}

// Improved date formatting function for observations
function formatDateObservationImproved(dateStr) {
    if (!dateStr && dateStr !== 0) return null;
    
    console.log("Formatting date:", dateStr, "Type:", typeof dateStr);
    
    let parsedDate = null;
    
    // Handle Excel serial number
    if (typeof dateStr === 'number') {
      console.log("Processing Excel serial number:", dateStr);
      const baseDate = new Date(1899, 11, 30); // Excel epoch
      baseDate.setDate(baseDate.getDate() + dateStr);
      parsedDate = baseDate;
      console.log("Parsed from serial number:", parsedDate);
    } 
    // Handle Date object
    else if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      parsedDate = new Date(dateStr);
      console.log("Using Date object:", parsedDate);
    } 
    // Handle string
    else if (typeof dateStr === 'string') {
      const cleanStr = dateStr.trim().replace(/['"]+/g, '');
      console.log("Processing string date:", cleanStr);
      
      // Try ISO format first (YYYY-MM-DD)
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
        parsedDate = new Date(cleanStr);
        console.log("Parsed as ISO format:", parsedDate);
      } else {
        // Try parsing various date formats
        const parts = cleanStr.split(/[-/]/);
        if (parts.length === 3) {
          let [part1, part2, part3] = parts.map(p => p.trim());
          let year, month, day;
          
          console.log("Date parts:", { part1, part2, part3 });
          
          // Handle different year formats
          if (part3.length === 4) {
            // MM/DD/YYYY or DD/MM/YYYY
            year = part3;
            month = part1;
            day = part2;
          } else if (part1.length === 4) {
            // YYYY/MM/DD
            year = part1;
            month = part2;
            day = part3;
          } else if (part3.length === 2) {
            // MM/DD/YY format - convert 2-digit year to 4-digit
            let yearNum = parseInt(part3);
            // Assume years 00-30 are 2000s, 31-99 are 1900s
            if (yearNum <= 30) {
              year = (2000 + yearNum).toString();
            } else {
              year = (1900 + yearNum).toString();
            }
            month = part1;
            day = part2;
            console.log("Converted 2-digit year:", part3, "to", year);
          } else if (part1.length === 2 && parseInt(part1) > 31) {
            // YY/MM/DD format
            let yearNum = parseInt(part1);
            if (yearNum <= 30) {
              year = (2000 + yearNum).toString();
            } else {
              year = (1900 + yearNum).toString();
            }
            month = part2;
            day = part3;
            console.log("Converted 2-digit year:", part1, "to", year);
          } else {
            console.warn("Could not determine date format for:", cleanStr);
            return null;
          }
          
          console.log("Final parts:", { year, month, day });
          
          // Ensure month and day are valid
          const monthNum = parseInt(month);
          const dayNum = parseInt(day);
          
          if (monthNum < 1 || monthNum > 12) {
            console.warn("Invalid month:", monthNum);
            return null;
          }
          if (dayNum < 1 || dayNum > 31) {
            console.warn("Invalid day:", dayNum);
            return null;
          }
          
          const tryDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          if (!isNaN(tryDate.getTime())) {
            parsedDate = tryDate;
            console.log("Parsed from parts:", parsedDate);
          } else {
            console.warn("Invalid date constructed:", `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          }
        } else {
          console.warn("Could not split date string into 3 parts:", cleanStr);
        }
      }
    }
    
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      console.warn("Could not parse date:", dateStr);
      return null;
    }
    
    // Format as YYYY-MM-DD
    const yyyy = parsedDate.getFullYear();
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    const result = `${yyyy}-${mm}-${dd}`;
    
    console.log("Final formatted date:", result);
    return result;
  }
  
  // Updated parseNullableFloat to handle more edge cases
  function parseNullableFloatImproved(val) {
    if (val === null || val === undefined || val === '' || val === 'N/A' || val === 'NA' || val === '-') {
      return null;
    }
    
    // Handle string values
    if (typeof val === 'string') {
      val = val.trim();
      if (val === '' || val.toLowerCase() === 'null' || val.toLowerCase() === 'na') {
        return null;
      }
    }
    
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }