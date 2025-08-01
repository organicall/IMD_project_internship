// forecast_allocator.js

// Supabase Setup
const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global variables
let forecastRows = [];
let processedOutput = [];
let existingSheetNames = [];

let observationRows = [];
let processedObservationOutput = [];
let existingObservationSheetNames = [];

// Districts and Parameters for verification
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

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadExistingSheetNames();
    await loadExistingObservationSheetNames(); // ADD THIS LINE
    setupEventListeners();
    setupObservationEventListeners(); // ADD THIS LINE
    populateDropdowns();
  });

// Setup event listeners
function setupEventListeners() {
  document.getElementById('fileInput').addEventListener('change', handleFileUpload);
  document.getElementById('sheetNameInput').addEventListener('input', validateSheetName);
}
function setupObservationEventListeners() {
    document.getElementById('observationFileInput').addEventListener('change', handleObservationFileUpload);
    document.getElementById('observationSheetNameInput').addEventListener('input', validateObservationSheetName);
  }

// Populate dropdowns for verification
function populateDropdowns() {
  // Populate district dropdown
  const districtSelect = document.getElementById('verificationDistrict');
  districts.forEach(district => {
    const option = document.createElement('option');
    option.value = district;
    option.textContent = district;
    districtSelect.appendChild(option);
  });

  // Populate parameter dropdown
  const parameterSelect = document.getElementById('verificationParameter');
  Object.keys(parameterMapping).forEach(param => {
    const option = document.createElement('option');
    option.value = param;
    option.textContent = param;
    parameterSelect.appendChild(option);
  });
}

// Load existing sheet names for validation
async function loadExistingSheetNames() {
  try {
    const { data, error } = await client
    //   .from('forecast_daily_data')
      .from("full_forecast")
      .select('sheet_name')
      .not('sheet_name', 'is', null);
    
    if (error) throw error;
    
    existingSheetNames = [...new Set(data?.map(row => row.sheet_name) || [])];
  } catch (error) {
    console.error('Error loading existing sheet names:', error);
  }
}

async function loadExistingObservationSheetNames() {
    try {
      const { data, error } = await client
        .from("full_observation")
        .select('sheet_name')
        .not('sheet_name', 'is', null);
      
      if (error) throw error;
      
      existingObservationSheetNames = [...new Set(data?.map(row => row.sheet_name) || [])];
    } catch (error) {
      console.error('Error loading existing observation sheet names:', error);
    }
  }

// Validate sheet name
function validateSheetName() {
  const sheetName = document.getElementById('sheetNameInput').value.trim();
  const validationDiv = document.getElementById('sheetNameValidation');
  const saveBtn = document.getElementById('saveToDatabaseBtn');
  
  if (!sheetName) {
    validationDiv.textContent = "Please enter a sheet name.";
    validationDiv.style.display = "block";
    saveBtn.disabled = true;
    return false;
  }
  
  if (existingSheetNames.includes(sheetName)) {
    validationDiv.textContent = `Sheet name "${sheetName}" already exists. Please choose a different name.`;
    validationDiv.style.display = "block";
    saveBtn.disabled = true;
    return false;
  }
  
  validationDiv.style.display = "none";
  saveBtn.disabled = processedOutput.length === 0;
  return true;
}

function validateObservationSheetName() {
    const sheetName = document.getElementById('observationSheetNameInput').value.trim();
    const validationDiv = document.getElementById('observationSheetNameValidation');
    const saveBtn = document.getElementById('saveObservationToDatabaseBtn');
    
    if (!sheetName) {
      validationDiv.textContent = "Please enter a sheet name.";
      validationDiv.style.display = "block";
      saveBtn.disabled = true;
      return false;
    }
    
    if (existingObservationSheetNames.includes(sheetName)) {
      validationDiv.textContent = `Sheet name "${sheetName}" already exists. Please choose a different name.`;
      validationDiv.style.display = "block";
      saveBtn.disabled = true;
      return false;
    }
    
    validationDiv.style.display = "none";
    saveBtn.disabled = processedObservationOutput.length === 0;
    return true;
  }

// Handle file upload
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  showStatus('📂 Reading Excel file...', 'info');
  
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const workbook = XLSX.read(evt.target.result, { 
        type: 'array',
        cellDates: true,
        dateNF: 'mm/dd/yyyy'
      });
      
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { 
        defval: null,
        raw: false 
      });

      console.log('Raw Excel data:', jsonData.slice(0, 3));

      // Process and normalize the data
      forecastRows = jsonData.map(row => {
        const forecastDate = parseDate(row.forecast_date);
        
        if (!forecastDate) {
          console.warn('Invalid date found:', row.forecast_date);
          return null;
        }

        return {
          district_name: (row.district_name || '').toString().trim(),
          forecast_date: forecastDate,
          rainfall: parseNullableFloat(row.rainfall),
          temp_max_c: parseNullableFloat(row.temp_max_c),
          temp_min_c: parseNullableFloat(row.temp_min_c),
          humidity_1: parseNullableFloat(row.humidity_1),
          humidity_2: parseNullableFloat(row.humidity_2),
          wind_speed_kmph: parseNullableFloat(row.wind_speed_kmph),
          wind_direction_deg: parseNullableFloat(row.wind_direction_deg),
          cloud_cover_octa: parseNullableFloat(row.cloud_cover_octa)
        };
      }).filter(row => row !== null && row.district_name); // Remove invalid rows

      console.log(`Processed ${forecastRows.length} valid rows from Excel`);
      
      if (forecastRows.length === 0) {
        showStatus('❌ No valid data found in the Excel file. Please check the format.', 'error');
        return;
      }

      showStatus(`✅ Successfully loaded ${forecastRows.length} forecast records.`, 'success');
      
    } catch (error) {
      console.error('Error reading Excel file:', error);
      showStatus('❌ Error reading Excel file: ' + error.message, 'error');
    }
  };
  
  reader.readAsArrayBuffer(file);
}

function handleObservationFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
  
    showObservationStatus('📂 Reading Excel file...', 'info');
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { 
          type: 'array',
          cellDates: true,
          dateNF: 'mm/dd/yyyy'
        });
        
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { 
          defval: null,
          raw: false 
        });
  
        console.log('Raw Observation Excel data:', jsonData.slice(0, 3));
  
        // Process and normalize the data
        observationRows = jsonData.map(row => {
          const observationDate = parseDate(row.observation_date || row.forecast_date); // Handle both column names
          
          if (!observationDate) {
            console.warn('Invalid date found:', row.observation_date || row.forecast_date);
            return null;
          }
  
          return {
            district_name: (row.district_name || '').toString().trim(),
            observation_date: observationDate,
            rainfall: parseNullableFloat(row.rainfall),
            temp_max_c: parseNullableFloat(row.temp_max_c),
            temp_min_c: parseNullableFloat(row.temp_min_c),
            humidity_1: parseNullableFloat(row.humidity_1),
            humidity_2: parseNullableFloat(row.humidity_2),
            wind_speed_kmph: parseNullableFloat(row.wind_speed_kmph),
            wind_direction_deg: parseNullableFloat(row.wind_direction_deg),
            cloud_cover_octa: parseNullableFloat(row.cloud_cover_octa)
          };
        }).filter(row => row !== null && row.district_name); // Remove invalid rows
  
        console.log(`Processed ${observationRows.length} valid observation rows from Excel`);
        
        if (observationRows.length === 0) {
          showObservationStatus('❌ No valid data found in the Excel file. Please check the format.', 'error');
          return;
        }
  
        showObservationStatus(`✅ Successfully loaded ${observationRows.length} observation records.`, 'success');
        
      } catch (error) {
        console.error('Error reading observation Excel file:', error);
        showObservationStatus('❌ Error reading Excel file: ' + error.message, 'error');
      }
    };
    
    reader.readAsArrayBuffer(file);
  }

// Improved date parsing function
function parseDate(dateValue) {
  if (!dateValue && dateValue !== 0) return null;

  let parsedDate = null;

  // Handle Excel serial number
  if (typeof dateValue === 'number') {
    const baseDate = new Date(1899, 11, 30);
    baseDate.setDate(baseDate.getDate() + dateValue);
    parsedDate = baseDate;
  }
  // Handle Date object
  else if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    parsedDate = new Date(dateValue);
  }
  // Handle string
  else if (typeof dateValue === 'string') {
    const cleanStr = dateValue.trim().replace(/['"]+/g, '');
    
    // Try ISO format first
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
      parsedDate = new Date(cleanStr);
    } else {
      // Try parsing MM/DD/YYYY or similar formats
      const parts = cleanStr.split(/[-/]/);
      if (parts.length === 3) {
        let [part1, part2, part3] = parts.map(p => p.trim());
        let year, month, day;
        
        if (part3.length === 4) {
          // MM/DD/YYYY
          year = part3;
          month = part1;
          day = part2;
        } else if (part1.length === 4) {
          // YYYY/MM/DD
          year = part1;
          month = part2;
          day = part3;
        } else {
          return null;
        }
        
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        
        if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
          return null;
        }
        
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      }
    }
  }

  if (!parsedDate || isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

// Parse nullable float values
function parseNullableFloat(val) {
  if (val === null || val === undefined || val === '' || val === 'N/A' || val === 'NA' || val === '-') {
    return null;
  }
  
  if (typeof val === 'string') {
    val = val.trim();
    if (val === '' || val.toLowerCase() === 'null' || val.toLowerCase() === 'na') {
      return null;
    }
  }
  
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// Format date for display
function formatDate(date) {
  if (!(date instanceof Date)) return '';
  return date.toLocaleDateString('en-US');
}

// Check if date is a holiday
function isHoliday(dateStr, holidays) {
  return holidays.includes(dateStr);
}

// Process forecast data and allocate days
function processForecast() {
  if (forecastRows.length === 0) {
    showStatus('❌ No forecast data loaded. Please upload a file first.', 'error');
    return;
  }

  showStatus('🔄 Processing forecast allocation...', 'info');
  document.getElementById('loadingIndicator').classList.add('show');

  try {
    const holidaysInput = document.getElementById('holidayInput').value;
    const holidays = holidaysInput
      .split(',')
      .map(h => {
        const trimmed = h.trim();
        if (!trimmed) return null;
        const date = parseDate(trimmed);
        return date ? formatDate(date) : null;
      })
      .filter(h => h !== null);

    console.log('Parsed holidays:', holidays);

    // 1. Find the earliest and latest date in the sheet
    const allDates = forecastRows.map(row => row.forecast_date);
    allDates.sort((a, b) => a - b);
    const firstDate = new Date(allDates[0]);
    const lastDate = new Date(allDates[allDates.length - 1]);

    console.log('Date range:', formatDate(firstDate), 'to', formatDate(lastDate));

    // 2. Find the last Tuesday or Friday BEFORE the first date in the sheet
    let startDate = new Date(firstDate);
    startDate.setDate(startDate.getDate() - 1);
    while (startDate.getDay() !== 2 && startDate.getDay() !== 5) {
      startDate.setDate(startDate.getDate() - 1);
    }

    console.log('Start date for forecasting:', formatDate(startDate));

    // 3. Get all unique district names from the sheet
    const uniqueDistricts = [...new Set(forecastRows.map(row => row.district_name))];
    console.log('Districts found:', uniqueDistricts);

    // 4. Create a lookup map for faster data access
    const dataLookup = {};
    forecastRows.forEach(row => {
      const dateKey = formatDate(row.forecast_date);
      const districtKey = row.district_name.toUpperCase().trim();
      const key = `${districtKey}|${dateKey}`;
      
      // Keep the latest entry for each district-date combination
      dataLookup[key] = row;
    });

    console.log('Created lookup with', Object.keys(dataLookup).length, 'unique entries');

    // 5. Generate all Tuesday/Friday dates from startDate to beyond lastDate
    const extendedLastDate = new Date(lastDate);
    extendedLastDate.setDate(extendedLastDate.getDate() + 10);
    
    const forecastDates = [];
    let currentDate = new Date(startDate);
    while (currentDate <= extendedLastDate) {
      forecastDates.push(new Date(currentDate));
      
      // Move to next Tuesday or Friday
      do {
        currentDate.setDate(currentDate.getDate() + 1);
      } while (currentDate.getDay() !== 2 && currentDate.getDay() !== 5 && currentDate <= extendedLastDate);
    }

    console.log('Generated', forecastDates.length, 'forecast dates');

    const output = [];

    // 6. For each district and each forecast date, generate the 5-day forecasts
    for (const district of uniqueDistricts) {
      for (const forecastDate of forecastDates) {
        // Adjust for holiday
        let adjustedForecastDate = new Date(forecastDate);
        if (isHoliday(formatDate(forecastDate), holidays)) {
          adjustedForecastDate.setDate(adjustedForecastDate.getDate() - 1);
        }

        // Generate 5-day forecasts
        for (let i = 1; i <= 5; i++) {
          let forecastedDate = new Date(adjustedForecastDate);
          forecastedDate.setDate(forecastedDate.getDate() + i);
          
          // Only include forecasts that fall within the original data date range
          if (forecastedDate >= firstDate && forecastedDate <= lastDate) {
            // Look up data for this district and forecasted date
            const lookupKey = `${district.toUpperCase().trim()}|${formatDate(forecastedDate)}`;
            const matchingRow = dataLookup[lookupKey];

            const outputRow = {
              forecasted_date: formatDate(forecastedDate),
              day: 'Day' + i,
              day_number: i,
              forecast_taken_on: formatDate(adjustedForecastDate),
              forecast_date: formatDate(forecastedDate), // For database compatibility
              district_name: district,
              rainfall: matchingRow ? matchingRow.rainfall : null,
              temp_max_c: matchingRow ? matchingRow.temp_max_c : null,
              temp_min_c: matchingRow ? matchingRow.temp_min_c : null,
              humidity_1: matchingRow ? matchingRow.humidity_1 : null,
              humidity_2: matchingRow ? matchingRow.humidity_2 : null,
              wind_speed_kmph: matchingRow ? matchingRow.wind_speed_kmph : null,
              wind_direction_deg: matchingRow ? matchingRow.wind_direction_deg : null,
              cloud_cover_octa: matchingRow ? matchingRow.cloud_cover_octa : null
            };

            output.push(outputRow);
          }
        }
      }
    }

    processedOutput = output.sort(
      (a, b) => new Date(a.forecasted_date) - new Date(b.forecasted_date)
    );

    console.log('Generated', processedOutput.length, 'forecast allocations');

    document.getElementById('loadingIndicator').classList.remove('show');
    document.getElementById('filterSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('verificationSection').style.display = 'block';
    
    // Enable save button if sheet name is valid
    if (validateSheetName()) {
      document.getElementById('saveToDatabaseBtn').disabled = false;
    }

    renderTable(processedOutput);
    showStatus(`✅ Successfully processed ${processedOutput.length} forecast allocations.`, 'success');

  } catch (error) {
    console.error('Error processing forecast:', error);
    document.getElementById('loadingIndicator').classList.remove('show');
    showStatus('❌ Error processing forecast: ' + error.message, 'error');
  }
}

function processObservation() {
    if (observationRows.length === 0) {
      showObservationStatus('❌ No observation data loaded. Please upload a file first.', 'error');
      return;
    }
  
    showObservationStatus('🔄 Processing observation allocation...', 'info');
    
    // Use setTimeout to prevent UI freezing
    setTimeout(() => {
      try {
        // Get holidays from the OBSERVATION holiday input field
        const holidaysInput = document.getElementById('observationHolidayInput').value;
        const holidays = holidaysInput
          .split(',')
          .map(h => {
            const trimmed = h.trim();
            if (!trimmed) return null;
            const date = parseDate(trimmed);
            return date ? formatDate(date) : null;
          })
          .filter(h => h !== null);
  
        console.log('Parsed holidays for observation:', holidays);
  
        // 1. Find the earliest and latest date in the sheet
        const allDates = observationRows.map(row => row.observation_date);
        allDates.sort((a, b) => a - b);
        const firstDate = new Date(allDates[0]);
        const lastDate = new Date(allDates[allDates.length - 1]);
  
        console.log('Observation date range:', formatDate(firstDate), 'to', formatDate(lastDate));
  
        // 2. Find the last Tuesday or Friday BEFORE the first date in the sheet
        let startDate = new Date(firstDate);
        startDate.setDate(startDate.getDate() - 1);
        while (startDate.getDay() !== 2 && startDate.getDay() !== 5) {
          startDate.setDate(startDate.getDate() - 1);
        }
  
        console.log('Start date for observation forecasting:', formatDate(startDate));
  
        // 3. Get all unique district names from the sheet
        const uniqueDistricts = [...new Set(observationRows.map(row => row.district_name))];
        console.log('Districts found in observation:', uniqueDistricts);
  
        // 4. Create a lookup map for faster data access
        const dataLookup = {};
        observationRows.forEach(row => {
          const dateKey = formatDate(row.observation_date);
          const districtKey = row.district_name.toUpperCase().trim();
          const key = `${districtKey}|${dateKey}`;
          
          // Keep the latest entry for each district-date combination
          dataLookup[key] = row;
        });
  
        console.log('Created observation lookup with', Object.keys(dataLookup).length, 'unique entries');
  
        // 5. Generate all Tuesday/Friday dates from startDate to beyond lastDate
        const extendedLastDate = new Date(lastDate);
        extendedLastDate.setDate(extendedLastDate.getDate() + 10);
        
        const forecastDates = [];
        let currentDate = new Date(startDate);
        while (currentDate <= extendedLastDate) {
          forecastDates.push(new Date(currentDate));
          
          // Move to next Tuesday or Friday
          do {
            currentDate.setDate(currentDate.getDate() + 1);
          } while (currentDate.getDay() !== 2 && currentDate.getDay() !== 5 && currentDate <= extendedLastDate);
        }
  
        console.log('Generated', forecastDates.length, 'observation forecast dates');
  
        const output = [];
  
        // 6. For each district and each forecast date, generate the 5-day forecasts
        for (const district of uniqueDistricts) {
          for (const forecastDate of forecastDates) {
            // Adjust for holiday
            let adjustedForecastDate = new Date(forecastDate);
            if (isHoliday(formatDate(forecastDate), holidays)) {
              adjustedForecastDate.setDate(adjustedForecastDate.getDate() - 1);
            }
  
            // Generate 5-day forecasts
            for (let i = 1; i <= 5; i++) {
              let forecastedDate = new Date(adjustedForecastDate);
              forecastedDate.setDate(forecastedDate.getDate() + i);
              
              // Only include forecasts that fall within the original data date range
              if (forecastedDate >= firstDate && forecastedDate <= lastDate) {
                // Look up data for this district and forecasted date
                const lookupKey = `${district.toUpperCase().trim()}|${formatDate(forecastedDate)}`;
                const matchingRow = dataLookup[lookupKey];
  
                const outputRow = {
                  forecasted_date: formatDate(forecastedDate),
                  day: 'Day' + i,
                  day_number: i,
                  forecast_taken_on: formatDate(adjustedForecastDate),
                  observation_date: formatDate(forecastedDate), // For database compatibility
                  district_name: district,
                  rainfall: matchingRow ? matchingRow.rainfall : null,
                  temp_max_c: matchingRow ? matchingRow.temp_max_c : null,
                  temp_min_c: matchingRow ? matchingRow.temp_min_c : null,
                  humidity_1: matchingRow ? matchingRow.humidity_1 : null,
                  humidity_2: matchingRow ? matchingRow.humidity_2 : null,
                  wind_speed_kmph: matchingRow ? matchingRow.wind_speed_kmph : null,
                  wind_direction_deg: matchingRow ? matchingRow.wind_direction_deg : null,
                  cloud_cover_octa: matchingRow ? matchingRow.cloud_cover_octa : null
                };
  
                output.push(outputRow);
              }
            }
          }
        }
  
        processedObservationOutput = output.sort(
          (a, b) => new Date(a.forecasted_date) - new Date(b.forecasted_date)
        );
  
        console.log('Generated', processedObservationOutput.length, 'observation forecast allocations');
  
        // Enable save button if sheet name is valid
        if (validateObservationSheetName()) {
          document.getElementById('saveObservationToDatabaseBtn').disabled = false;
        }
  
        renderObservationTable(processedObservationOutput);
        showObservationStatus(`✅ Successfully processed ${processedObservationOutput.length} observation forecast allocations.`, 'success');
  
      } catch (error) {
        console.error('Error processing observation:', error);
        showObservationStatus('❌ Error processing observation: ' + error.message, 'error');
      }
    }, 100); // Small delay to prevent UI freezing
  }
// Filter results by day
function filterByDay(dayName) {
  if (dayName === 'All') {
    renderTable(processedOutput);
  } else {
    const filtered = processedOutput.filter(row => row.day === dayName);
    renderTable(filtered);
  }
}

function filterObservationByDay(dayName) {
    if (dayName === 'All') {
      renderObservationTable(processedObservationOutput);
    } else {
      const filtered = processedObservationOutput.filter(row => row.day === dayName);
      renderObservationTable(filtered);
    }
  }
  
  // Add this function after saveToDatabase()
  async function saveObservationToDatabase() {
    if (processedObservationOutput.length === 0) {
      showObservationStatus('❌ No processed observation data to save.', 'error');
      return;
    }
  
    if (!validateObservationSheetName()) {
      return;
    }
  
    const sheetName = document.getElementById('observationSheetNameInput').value.trim();
    
    try {
      showObservationStatus('💾 Saving observation data to database...', 'info');
      
      // Prepare data for database
      const dbData = processedObservationOutput.map(row => ({
        day_number: row.day_number,
        observation_date: row.observation_date,
        district_name: row.district_name,
        rainfall: row.rainfall,
        temp_max_c: row.temp_max_c,
        temp_min_c: row.temp_min_c,
        humidity_1: row.humidity_1,
        humidity_2: row.humidity_2,
        wind_speed_kmph: row.wind_speed_kmph,
        wind_direction_deg: row.wind_direction_deg,
        cloud_cover_octa: row.cloud_cover_octa,
        sheet_name: sheetName
      }));
  
      const { error } = await client
        .from('full_observation')
        .insert(dbData);
  
      if (error) {
        throw error;
      }
  
      showObservationStatus(`✅ Successfully saved ${dbData.length} observation records to database with sheet name "${sheetName}".`, 'success');
      
      // Update existing sheet names and disable save button
      existingObservationSheetNames.push(sheetName);
      document.getElementById('saveObservationToDatabaseBtn').disabled = true;
      document.getElementById('observationSheetNameInput').value = '';
      validateObservationSheetName();
  
    } catch (error) {
      console.error('Database save error for observation:', error);
      showObservationStatus('❌ Error saving observation to database: ' + error.message, 'error');
    }
  }

// Render table with processed data
function renderTable(data) {
  const resultDiv = document.getElementById('result');
  
  if (data.length === 0) {
    resultDiv.innerHTML = '<p>No data to display.</p>';
    return;
  }

  let html = `
    <div style="margin-bottom: 15px;">
      <strong>Total Records: ${data.length}</strong>
    </div>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>Forecasted Date</th>
            <th>Day</th>
            <th>Forecast Taken On</th>
            <th>District</th>
            <th>Rainfall (mm)</th>
            <th>Temp Max (°C)</th>
            <th>Temp Min (°C)</th>
            <th>Humidity Morning (%)</th>
            <th>Humidity Evening (%)</th>
            <th>Wind Speed (kmph)</th>
            <th>Wind Direction (deg)</th>
            <th>Cloud Cover (octa)</th>
          </tr>
        </thead>
        <tbody>`;

  for (let row of data) {
    html += `<tr>
      <td>${row.forecasted_date}</td>
      <td><span style="background: linear-gradient(45deg, #667eea, #764ba2); color: white; padding: 4px 8px; border-radius: 15px; font-size: 12px;">${row.day}</span></td>
      <td>${row.forecast_taken_on}</td>
      <td><strong>${row.district_name}</strong></td>
      <td>${formatValue(row.rainfall)}</td>
      <td>${formatValue(row.temp_max_c)}</td>
      <td>${formatValue(row.temp_min_c)}</td>
      <td>${formatValue(row.humidity_1)}</td>
      <td>${formatValue(row.humidity_2)}</td>
      <td>${formatValue(row.wind_speed_kmph)}</td>
      <td>${formatValue(row.wind_direction_deg)}</td>
      <td>${formatValue(row.cloud_cover_octa)}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  resultDiv.innerHTML = html;
}

function renderObservationTable(data) {
    // Create a results section for observation if it doesn't exist
    let observationResultsSection = document.getElementById('observationResultsSection');
    if (!observationResultsSection) {
      observationResultsSection = document.createElement('div');
      observationResultsSection.id = 'observationResultsSection';
      observationResultsSection.className = 'section';
      observationResultsSection.innerHTML = `
        <h2>📈 Processed Observation Data</h2>
        <div class="filter-buttons" id="observationFilterButtons">
          <button class="btn" onclick="filterObservationByDay('All')">Show All</button>
          <button class="btn" onclick="filterObservationByDay('Day1')">Day 1</button>
          <button class="btn" onclick="filterObservationByDay('Day2')">Day 2</button>
          <button class="btn" onclick="filterObservationByDay('Day3')">Day 3</button>
          <button class="btn" onclick="filterObservationByDay('Day4')">Day 4</button>
          <button class="btn" onclick="filterObservationByDay('Day5')">Day 5</button>
        </div>
        <div id="observationResult"></div>
      `;
      
      // Insert after the observation upload section
      const observationUploadSection = document.querySelector('.section:has(#observationFileInput)');
      if (observationUploadSection) {
        observationUploadSection.insertAdjacentElement('afterend', observationResultsSection);
      }
    }
    
    observationResultsSection.style.display = 'block';
    const resultDiv = document.getElementById('observationResult');
    
    if (data.length === 0) {
      resultDiv.innerHTML = '<p>No observation data to display.</p>';
      return;
    }
  
    let html = `
      <div style="margin-bottom: 15px;">
        <strong>Total Observation Records: ${data.length}</strong>
      </div>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Forecasted Date</th>
              <th>Day</th>
              <th>Forecast Taken On</th>
              <th>District</th>
              <th>Rainfall (mm)</th>
              <th>Temp Max (°C)</th>
              <th>Temp Min (°C)</th>
              <th>Humidity Morning (%)</th>
              <th>Humidity Evening (%)</th>
              <th>Wind Speed (kmph)</th>
              <th>Wind Direction (deg)</th>
              <th>Cloud Cover (octa)</th>
            </tr>
          </thead>
          <tbody>`;
  
    for (let row of data) {
      html += `<tr>
        <td>${row.forecasted_date}</td>
        <td><span style="background: linear-gradient(45deg, #28a745, #20c997); color: white; padding: 4px 8px; border-radius: 15px; font-size: 12px;">${row.day}</span></td>
        <td>${row.forecast_taken_on}</td>
        <td><strong>${row.district_name}</strong></td>
        <td>${formatValue(row.rainfall)}</td>
        <td>${formatValue(row.temp_max_c)}</td>
        <td>${formatValue(row.temp_min_c)}</td>
        <td>${formatValue(row.humidity_1)}</td>
        <td>${formatValue(row.humidity_2)}</td>
        <td>${formatValue(row.wind_speed_kmph)}</td>
        <td>${formatValue(row.wind_direction_deg)}</td>
        <td>${formatValue(row.cloud_cover_octa)}</td>
      </tr>`;
    }
  
    html += '</tbody></table></div>';
    resultDiv.innerHTML = html;
  }

// Format value for display
function formatValue(value) {
  if (value === null || value === undefined) {
    return '<span style="color: #999; font-style: italic;">N/A</span>';
  }
  return typeof value === 'number' ? value.toFixed(2) : value;
}

// Save processed data to database
async function saveToDatabase() {
  if (processedOutput.length === 0) {
    showStatus('❌ No processed data to save.', 'error');
    return;
  }

  if (!validateSheetName()) {
    return;
  }

  const sheetName = document.getElementById('sheetNameInput').value.trim();
  
  try {
    showStatus('💾 Saving data to database...', 'info');
    
    // Prepare data for database
    const dbData = processedOutput.map(row => ({
      day_number: row.day_number,
      forecast_date: row.forecast_date,
      district_name: row.district_name,
      rainfall: row.rainfall,
      temp_max_c: row.temp_max_c,
      temp_min_c: row.temp_min_c,
      humidity_1: row.humidity_1,
      humidity_2: row.humidity_2,
      wind_speed_kmph: row.wind_speed_kmph,
      wind_direction_deg: row.wind_direction_deg,
      cloud_cover_octa: row.cloud_cover_octa,
      sheet_name: sheetName
    }));

    const { error } = await client
      .from('full_forecast')
      .insert(dbData);

    if (error) {
      throw error;
    }

    showStatus(`✅ Successfully saved ${dbData.length} records to database with sheet name "${sheetName}".`, 'success');
    
    // Update existing sheet names and disable save button
    existingSheetNames.push(sheetName);
    document.getElementById('saveToDatabaseBtn').disabled = true;
    document.getElementById('sheetNameInput').value = '';
    validateSheetName();

  } catch (error) {
    console.error('Database save error:', error);
    showStatus('❌ Error saving to database: ' + error.message, 'error');
  }
}

// Verification functionality
async function performVerification() {
  const district = document.getElementById('verificationDistrict').value;
  const parameter = document.getElementById('verificationParameter').value;
  const day = document.getElementById('verificationDay').value;
  
  if (!district || !parameter || !day) {
    showStatus('❌ Please select district, parameter, and day for verification.', 'error');
    return;
  }

  showStatus('🔍 Performing data verification...', 'info');

  try {
    const dbColumn = parameterMapping[parameter];
    

   // Update the currentData filter to include day
const currentData = processedOutput.filter(row => 
    row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
    row.day === day
  );
  
  // Update the database query to include day_number filter
  const dayNumber = parseInt(day.replace('Day', ''));
  const { data: dbData, error } = await client
    .from('full_forecast')
    .select(`forecast_date, district_name, day_number, ${dbColumn}, sheet_name`)
    .ilike('district_name', district)
    .eq('day_number', dayNumber)
    .not(dbColumn, 'is', null)
    .order('forecast_date');

    if (error) {
      throw error;
    }

    // Build verification results
    const verificationResults = buildVerificationTable(currentData, dbData, parameter, dbColumn);
    displayVerificationResults(verificationResults, district, parameter);

    showStatus(`✅ Verification completed for ${district} - ${parameter}.`, 'success');

  } catch (error) {
    console.error('Verification error:', error);
    showStatus('❌ Verification error: ' + error.message, 'error');
  }
}

// Build verification comparison table
function buildVerificationTable(currentData, dbData, parameter, dbColumn) {
  const results = {
    matches: 0,
    differences: 0,
    newEntries: 0,
    details: []
  };

  // Create lookup for database data
  const dbLookup = {};
  dbData.forEach(row => {
    const key = `${row.forecast_date}|${row.day_number}`;
    if (!dbLookup[key]) {
      dbLookup[key] = [];
    }
    dbLookup[key].push(row);
  });

  // Compare current data with database data
  currentData.forEach(current => {
    const key = `${current.forecast_date}|${current.day_number}`;
    const dbEntries = dbLookup[key] || [];
    
    const currentValue = current[parameterMapping[parameter]];
    
    if (dbEntries.length === 0) {
      results.newEntries++;
      results.details.push({
        date: current.forecast_date,
        day: current.day,
        currentValue: currentValue,
        dbValue: null,
        status: 'New',
        sheets: []
      });
    } else {
      let foundMatch = false;
      const sheets = [...new Set(dbEntries.map(e => e.sheet_name))];
      
      for (const dbEntry of dbEntries) {
        const dbValue = dbEntry[dbColumn];
        
        if (Math.abs((currentValue || 0) - (dbValue || 0)) < 0.01) {
          foundMatch = true;
          break;
        }
      }
      
      if (foundMatch) {
        results.matches++;
        results.details.push({
          date: current.forecast_date,
          day: current.day,
          currentValue: currentValue,
          dbValue: dbEntries[0][dbColumn],
          status: 'Match',
          sheets: sheets
        });
      } else {
        results.differences++;
        results.details.push({
          date: current.forecast_date,
          day: current.day,
          currentValue: currentValue,
          dbValue: dbEntries[0][dbColumn],
          status: 'Different',
          sheets: sheets
        });
      }
    }
  });

  return results;
}

// Display verification results
function displayVerificationResults(results, district, parameter) {
  const resultsDiv = document.getElementById('verificationResults');
  const tableDiv = document.getElementById('verificationTable');

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
      <div style="background: #d4edda; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #155724; margin: 0;">Matches</h4>
        <div style="font-size: 24px; font-weight: bold; color: #155724;">${results.matches}</div>
      </div>
      <div style="background: #f8d7da; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #721c24; margin: 0;">Differences</h4>
        <div style="font-size: 24px; font-weight: bold; color: #721c24;">${results.differences}</div>
      </div>
      <div style="background: #d1ecf1; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #0c5460; margin: 0;">New Entries</h4>
        <div style="font-size: 24px; font-weight: bold; color: #0c5460;">${results.newEntries}</div>
      </div>
    </div>
    
    <h4>Detailed Comparison for ${district} - ${parameter}</h4>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Day</th>
            <th>Current Value</th>
            <th>Database Value</th>
            <th>Status</th>
            <th>Database Sheets</th>
          </tr>
        </thead>
        <tbody>`;

  results.details.forEach(detail => {
    let statusStyle = '';
    let statusText = detail.status;
    
    switch (detail.status) {
      case 'Match':
        statusStyle = 'background: #d4edda; color: #155724;';
        break;
      case 'Different':
        statusStyle = 'background: #f8d7da; color: #721c24;';
        break;
      case 'New':
        statusStyle = 'background: #d1ecf1; color: #0c5460;';
        break;
    }

    html += `<tr>
      <td>${detail.date}</td>
      <td>${detail.day}</td>
      <td>${formatValue(detail.currentValue)}</td>
      <td>${formatValue(detail.dbValue)}</td>
      <td><span style="${statusStyle} padding: 4px 8px; border-radius: 15px; font-size: 12px; font-weight: bold;">${statusText}</span></td>
      <td>${detail.sheets.join(', ') || 'None'}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  
  tableDiv.innerHTML = html;
  resultsDiv.style.display = 'block';
}

// Utility function to show status messages
function showStatus(message, type) {
  const statusDiv = document.getElementById('processingStatus');
  
  let className = 'status-message ';
  switch (type) {
    case 'success':
      className += 'status-success';
      break;
    case 'error':
      className += 'status-error';
      break;
    case 'info':
    default:
      className += 'status-info';
      break;
  }
  
  statusDiv.innerHTML = `<div class="${className}">${message}</div>`;
  
  // Auto-hide success/info messages after 5 seconds
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      if (statusDiv.innerHTML.includes(message)) {
        statusDiv.innerHTML = '';
      }
    }, 5000);
  }
}

function showObservationStatus(message, type) {
    const statusDiv = document.getElementById('observationProcessingStatus');
    
    let className = 'status-message ';
    switch (type) {
      case 'success':
        className += 'status-success';
        break;
      case 'error':
        className += 'status-error';
        break;
      case 'info':
      default:
        className += 'status-info';
        break;
    }
    
    statusDiv.innerHTML = `<div class="${className}">${message}</div>`;
    
    // Auto-hide success/info messages after 5 seconds
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (statusDiv.innerHTML.includes(message)) {
          statusDiv.innerHTML = '';
        }
      }, 5000);
    }
  }

