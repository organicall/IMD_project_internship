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

let comparisonResults = [];
// Global variable for comprehensive results
let comprehensiveResults = [];

// Parameter names for display
const parameterNames = {
  'rainfall': 'Rainfall',
  'temp_max_c': 'Maximum Temperature',
  'temp_min_c': 'Minimum Temperature',
  'humidity_1': 'Max. Relative Humidity',
  'humidity_2': 'Min. Relative Humidity',
  'wind_speed_kmph': 'Wind Speed',
  'wind_direction_deg': 'Wind Direction',
  'cloud_cover_octa': 'Cloud Cover'
};

// Perform comprehensive analysis for all districts and parameters
async function performComprehensiveAnalysis() {
  const day = document.getElementById('comprehensiveDay').value;
  
  if (!day) {
    showComprehensiveStatus('❌ Please select a day for analysis.', 'error');
    return;
  }

  if (processedOutput.length === 0) {
    showComprehensiveStatus('❌ No forecast data available. Please process forecast data first.', 'error');
    return;
  }

  if (processedObservationOutput.length === 0) {
    showComprehensiveStatus('❌ No observation data available. Please process observation data first.', 'error');
    return;
  }

  showComprehensiveStatus('🔍 Performing comprehensive analysis for all districts and parameters...', 'info');

  try {
    const dayNumber = parseInt(day.replace('Day', ''));
    const results = [];
    
    // Get all unique districts
    const allDistricts = [...new Set(processedOutput.map(row => row.district_name))];
    const parameters = Object.keys(parameterNames);
    
    // For each district, analyze all parameters
    for (const district of allDistricts) {
      const districtResult = {
        district: district,
        parameters: {}
      };
      
      for (const parameter of parameters) {
        // Filter forecast data for this district and day
        const forecastData = processedOutput.filter(row => 
          row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
          row.day_number === dayNumber
        );

        // Filter observation data for this district and day
        const observationData = processedObservationOutput.filter(row => 
          row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
          row.day_number === dayNumber
        );

        if (forecastData.length > 0 && observationData.length > 0) {
          // Create comparison data for this parameter
          const comparisonData = createComparisonData(forecastData, observationData, parameter);
          const statistics = calculateStatistics(comparisonData, parameter);
          
          districtResult.parameters[parameter] = {
            correct: statistics.correct,
            usable: statistics.usable,
            unusable: statistics.unusable,
            correctPlusUsable: statistics.correct + statistics.usable,
            validDays: statistics.validDays,
            missingDays: statistics.missingDays,
            n1: statistics.n1,
            n2: statistics.n2,
            n3: statistics.n3
          };
        } else {
          // No data available
          districtResult.parameters[parameter] = {
            correct: 0,
            usable: 0,
            unusable: 0,
            correctPlusUsable: 0,
            validDays: 0,
            missingDays: 0,
            n1: 0,
            n2: 0,
            n3: 0
          };
        }
      }
      
      results.push(districtResult);
    }

    // Calculate state-wide averages
    const stateAverages = calculateStateAverages(results, parameters);
    
    // Store results globally
    comprehensiveResults = {
      day: day,
      districts: results,
      stateAverages: stateAverages,
      parameters: parameters
    };

    // Display results
    displayComprehensiveResults(comprehensiveResults);
    
    document.getElementById('comprehensiveResultsSection').style.display = 'block';
    showComprehensiveStatus(`✅ Comprehensive analysis completed for ${day}.`, 'success');

  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    showComprehensiveStatus('❌ Comprehensive analysis error: ' + error.message, 'error');
  }
}

// Calculate state-wide averages
function calculateStateAverages(results, parameters) {
  const stateAverages = {};
  
  for (const parameter of parameters) {
    let totalCorrect = 0;
    let totalUsable = 0;
    let totalUnusable = 0;
    let totalCorrectPlusUsable = 0;
    let districtsWithData = 0;
    
    results.forEach(district => {
      if (district.parameters[parameter].validDays > 0) {
        totalCorrect += district.parameters[parameter].correct;
        totalUsable += district.parameters[parameter].usable;
        totalUnusable += district.parameters[parameter].unusable;
        totalCorrectPlusUsable += district.parameters[parameter].correctPlusUsable;
        districtsWithData++;
      }
    });
    
    stateAverages[parameter] = {
      correct: districtsWithData > 0 ? totalCorrect / districtsWithData : 0,
      usable: districtsWithData > 0 ? totalUsable / districtsWithData : 0,
      unusable: districtsWithData > 0 ? totalUnusable / districtsWithData : 0,
      correctPlusUsable: districtsWithData > 0 ? totalCorrectPlusUsable / districtsWithData : 0,
      districtsWithData: districtsWithData
    };
  }
  
  return stateAverages;
}

// Display comprehensive results
function displayComprehensiveResults(results) {
  // Display summary
  const summaryDiv = document.getElementById('comprehensiveSummary');
  summaryDiv.innerHTML = `
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
      <h4>Analysis Summary for ${results.day}</h4>
      <p><strong>Total Districts Analyzed:</strong> ${results.districts.length}</p>
      <p><strong>Parameters Analyzed:</strong> ${results.parameters.length} (${Object.values(parameterNames).join(', ')})</p>
    </div>
  `;

  // Create comprehensive table
  const tableDiv = document.getElementById('comprehensiveTable');
  let tableHtml = `
    <table style="width: 100%; font-size: 12px;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th rowspan="2" style="min-width: 150px; vertical-align: middle;">District</th>`;

  // Add parameter headers
  results.parameters.forEach(param => {
    tableHtml += `
      <th colspan="4" style="text-align: center; background: #e9ecef; border: 1px solid #ccc;">
        ${parameterNames[param]}
      </th>`;
  });

  tableHtml += `
        </tr>
        <tr style="background: #f8f9fa;">`;

  // Add sub-headers for each parameter
  results.parameters.forEach(param => {
    tableHtml += `
      <th style="background: #d4edda; font-size: 10px;">Correct</th>
      <th style="background: #fff3cd; font-size: 10px;">Usable</th>
      <th style="background: #f8d7da; font-size: 10px;">Unusable</th>
      <th style="background: #cce5ff; font-size: 10px;">Correct+Usable</th>`;
  });

  tableHtml += `
        </tr>
      </thead>
      <tbody>`;

  // Add district rows
  results.districts.forEach(district => {
    tableHtml += `<tr>
      <td style="font-weight: bold; background: #f8f9fa;">${district.district}</td>`;
    
    results.parameters.forEach(param => {
      const data = district.parameters[param];
      const correctClass = data.correct >= 70 ? 'style="background: #d4edda; font-weight: bold;"' : 
                          data.correct >= 50 ? 'style="background: #fff3cd;"' : 
                          'style="background: #f8d7da;"';
      
      tableHtml += `
        <td ${correctClass}>${data.correct.toFixed(1)}</td>
        <td style="background: #fff3cd;">${data.usable.toFixed(1)}</td>
        <td style="background: #f8d7da;">${data.unusable.toFixed(1)}</td>
        <td style="background: #cce5ff; font-weight: bold;">${data.correctPlusUsable.toFixed(1)}</td>`;
    });
    
    tableHtml += '</tr>';
  });

  // Add state averages row
  tableHtml += `
    <tr style="background: #e9ecef; font-weight: bold; border-top: 3px solid #6c757d;">
      <td style="background: #6c757d; color: white;">Andhra Pradesh State Average</td>`;
  
  results.parameters.forEach(param => {
    const avg = results.stateAverages[param];
    const correctClass = avg.correct >= 70 ? 'style="background: #d4edda; font-weight: bold;"' : 
                        avg.correct >= 50 ? 'style="background: #fff3cd; font-weight: bold;"' : 
                        'style="background: #f8d7da; font-weight: bold;"';
    
    tableHtml += `
      <td ${correctClass}>${avg.correct.toFixed(1)}</td>
      <td style="background: #fff3cd; font-weight: bold;">${avg.usable.toFixed(1)}</td>
      <td style="background: #f8d7da; font-weight: bold;">${avg.unusable.toFixed(1)}</td>
      <td style="background: #cce5ff; font-weight: bold;">${avg.correctPlusUsable.toFixed(1)}</td>`;
  });
  
  tableHtml += '</tr>';

  // Add quality indicators
  tableHtml += `
    <tr style="border-top: 2px solid #6c757d;">
      <td colspan="${1 + results.parameters.length * 4}" style="padding: 15px; background: #f8f9fa;">
        <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
          <div><span style="background: #d4edda; padding: 5px 10px; border-radius: 5px;"><strong>GOOD:</strong> >=70%</span></div>
          <div><span style="background: #fff3cd; padding: 5px 10px; border-radius: 5px;"><strong>MODERATE:</strong> >50% & <70%</span></div>
          <div><span style="background: #f8d7da; padding: 5px 10px; border-radius: 5px;"><strong>POOR:</strong> <50%</span></div>
        </div>
      </td>
    </tr>`;

  tableHtml += '</tbody></table>';
  
  tableDiv.innerHTML = tableHtml;
}

// Export comprehensive results to Excel
function exportComprehensiveToExcel() {
  if (!comprehensiveResults || comprehensiveResults.districts.length === 0) {
    showComprehensiveStatus('❌ No comprehensive results to export.', 'error');
    return;
  }

  try {
    const results = comprehensiveResults;
    
    // Prepare data for export
    const exportData = [];
    
    // Add header row
    const headerRow = { 'District': 'District' };
    results.parameters.forEach(param => {
      const paramName = parameterNames[param];
      headerRow[`${paramName}_Correct`] = `${paramName} - Correct`;
      headerRow[`${paramName}_Usable`] = `${paramName} - Usable`;
      headerRow[`${paramName}_Unusable`] = `${paramName} - Unusable`;
      headerRow[`${paramName}_CorrectPlusUsable`] = `${paramName} - Correct+Usable`;
    });
    
    // Add district data
    results.districts.forEach(district => {
      const row = { 'District': district.district };
      
      results.parameters.forEach(param => {
        const data = district.parameters[param];
        const paramName = parameterNames[param];
        row[`${paramName}_Correct`] = data.correct.toFixed(2);
        row[`${paramName}_Usable`] = data.usable.toFixed(2);
        row[`${paramName}_Unusable`] = data.unusable.toFixed(2);
        row[`${paramName}_CorrectPlusUsable`] = data.correctPlusUsable.toFixed(2);
      });
      
      exportData.push(row);
    });

    // Add state averages
    const stateRow = { 'District': 'Andhra Pradesh State Average' };
    results.parameters.forEach(param => {
      const avg = results.stateAverages[param];
      const paramName = parameterNames[param];
      stateRow[`${paramName}_Correct`] = avg.correct.toFixed(2);
      stateRow[`${paramName}_Usable`] = avg.usable.toFixed(2);
      stateRow[`${paramName}_Unusable`] = avg.unusable.toFixed(2);
      stateRow[`${paramName}_CorrectPlusUsable`] = avg.correctPlusUsable.toFixed(2);
    });
    exportData.push(stateRow);

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const cols = Object.keys(exportData[0]).map(key => ({ width: 15 }));
    ws['!cols'] = cols;
    
    XLSX.utils.book_append_sheet(wb, ws, `${results.day} Analysis`);

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Comprehensive_Analysis_${results.day}_${timestamp}.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
    
    showComprehensiveStatus(`✅ Comprehensive analysis exported to ${filename}`, 'success');

  } catch (error) {
    console.error('Export error:', error);
    showComprehensiveStatus('❌ Error exporting comprehensive analysis: ' + error.message, 'error');
  }
}

// Show comprehensive status messages
function showComprehensiveStatus(message, type) {
  const statusDiv = document.getElementById('comprehensiveProcessingStatus');
  
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
    await loadExistingObservationSheetNames();
    setupEventListeners();
    setupObservationEventListeners();
    populateComparisonDropdowns(); // ADD THIS LINE
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
  
  function populateComparisonDropdowns() {
    // Populate district dropdown for comparison
    const comparisonDistrictSelect = document.getElementById('comparisonDistrict');
    if (comparisonDistrictSelect) {
      comparisonDistrictSelect.innerHTML = '<option value="">-- Select District --</option>';
      
      districts.forEach(district => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        comparisonDistrictSelect.appendChild(option);
      });
    }
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
    const date = new Date(trimmed);
    return !isNaN(date.getTime()) ? formatDate(date) : null;
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
    //document.getElementById('verificationSection').style.display = 'block';
    
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
            const date = new Date(trimmed);
            return !isNaN(date.getTime()) ? formatDate(date) : null;
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
    
    <div style="max-height: 500px; overflow: auto; border: 1px solid #ccc; border-radius: 8px;">

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
      <div style="max-height: 500px; overflow: auto; border: 1px solid #ccc; border-radius: 8px;">

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

// Save processed data to database for forecast
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


  async function performComparison() {
  const day = document.getElementById('comparisonDay').value;
  const district = document.getElementById('comparisonDistrict').value;
  const parameter = document.getElementById('comparisonParameter').value;
  
  if (!day || !district || !parameter) {
    showComparisonStatus('❌ Please select day, district, and parameter for comparison.', 'error');
    return;
  }

  if (processedOutput.length === 0) {
    showComparisonStatus('❌ No forecast data available. Please process forecast data first.', 'error');
    return;
  }

  if (processedObservationOutput.length === 0) {
    showComparisonStatus('❌ No observation data available. Please process observation data first.', 'error');
    return;
  }

  showComparisonStatus('🔍 Performing comparison analysis...', 'info');

  try {
    // Filter forecast data
    const dayNumber = parseInt(day.replace('Day', ''));
    const forecastData = processedOutput.filter(row => 
      row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
      row.day_number === dayNumber
    );

    // Filter observation data
    const observationData = processedObservationOutput.filter(row => 
      row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
      row.day_number === dayNumber
    );

    if (forecastData.length === 0) {
      showComparisonStatus('❌ No forecast data found for the selected criteria.', 'error');
      return;
    }

    if (observationData.length === 0) {
      showComparisonStatus('❌ No observation data found for the selected criteria.', 'error');
      return;
    }

    // Create comparison results
    const comparisonData = createComparisonData(forecastData, observationData, parameter);
    const statistics = calculateStatistics(comparisonData, parameter);

    // Store results globally for export
    comparisonResults = {
      data: comparisonData,
      statistics: statistics,
      metadata: {
        day: day,
        district: district,
        parameter: parameter
      }
    };

    // Display results
    displayComparisonResults(comparisonData, statistics, day, district, parameter);
    
    document.getElementById('comparisonResultsSection').style.display = 'block';
    showComparisonStatus(`✅ Comparison analysis completed for ${district} - ${parameter} - ${day}.`, 'success');

  } catch (error) {
    console.error('Comparison error:', error);
    showComparisonStatus('❌ Comparison error: ' + error.message, 'error');
  }
}

// Create comparison data by matching dates
function createComparisonData(forecastData, observationData, parameter) {
  const comparisonData = [];
  
  // Create a lookup for observation data
  const obsLookup = {};
  observationData.forEach(obs => {
    const dateKey = obs.observation_date || obs.forecasted_date;
    obsLookup[dateKey] = obs[parameter];
  });

  // Compare with forecast data
  forecastData.forEach(forecast => {
    const forecastDate = forecast.forecast_date || forecast.forecasted_date;
    const forecastValue = forecast[parameter];
    const observationValue = obsLookup[forecastDate];
    
    let absoluteDifference = null;
    if (forecastValue !== null && observationValue !== null) {
      absoluteDifference = Math.abs(forecastValue - observationValue);
    }

    comparisonData.push({
      date: forecastDate,
      forecastValue: forecastValue,
      observationValue: observationValue,
      absoluteDifference: absoluteDifference,
      isMissing: forecastValue === null || observationValue === null
    });
  });

  return comparisonData.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Calculate statistics based on absolute differences


// Calculate statistics based on absolute differences
function calculateStatistics(comparisonData, parameter) {
    const totalDays = comparisonData.length;
    const missingDays = comparisonData.filter(item => item.isMissing).length;
    const validDays = totalDays - missingDays; // N
    
    if (validDays === 0) {
      return {
        totalDays: totalDays,
        missingDays: missingDays,
        validDays: validDays,
        n1: 0, n2: 0, n3: 0, n11: 0,
        correct: 0,
        usable: 0,
        unusable: 0
      };
    }
  
    const validData = comparisonData.filter(item => !item.isMissing);
    
    // Calculate N1, N11, N3, N2 based on correct thresholds
    const n1 = validData.filter(item => item.absoluteDifference <= 1.0).length;  // Changed from 0.1 to 1.0
    const n11 = validData.filter(item => item.absoluteDifference > 1.0).length;  // Changed from 0.1 to 1.0
    const n3 = validData.filter(item => item.absoluteDifference > 2.0).length;   // This stays the same
    const n2 = n11 - n3;
  
    // Calculate percentages
    const correct = (n1 / validDays) * 100;
    const usable = (n2 / validDays) * 100;
    const unusable = (n3 / validDays) * 100;
  
    return {
      totalDays: totalDays,
      missingDays: missingDays,
      validDays: validDays,
      n1: n1,
      n2: n2,
      n3: n3,
      n11: n11,
      correct: correct,
      usable: usable,
      unusable: unusable
    };
  }


// Display comparison results

// Display comparison results
function displayComparisonResults(comparisonData, statistics, day, district, parameter) {
    // Display statistics cards
    const statsDiv = document.getElementById('comparisonStats');
    statsDiv.innerHTML = `
      <div style="background: #d4edda; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #155724; margin: 0;">Correct</h4>
        <div style="font-size: 24px; font-weight: bold; color: #155724;">${statistics.correct.toFixed(1)}%</div>
        <small>(≤ 1.0 difference)</small>
      </div>
      <div style="background: #fff3cd; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #856404; margin: 0;">Usable</h4>
        <div style="font-size: 24px; font-weight: bold; color: #856404;">${statistics.usable.toFixed(1)}%</div>
        <small>(1.0 < diff ≤ 2.0)</small>
      </div>
      <div style="background: #f8d7da; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #721c24; margin: 0;">Unusable</h4>
        <div style="font-size: 24px; font-weight: bold; color: #721c24;">${statistics.unusable.toFixed(1)}%</div>
        <small>(> 2.0 difference)</small>
      </div>
      <div style="background: #d1ecf1; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #0c5460; margin: 0;">Valid Days</h4>
        <div style="font-size: 24px; font-weight: bold; color: #0c5460;">${statistics.validDays}</div>
        <small>out of ${statistics.totalDays}</small>
      </div>
    `;
  
    // Display detailed table
    const tableDiv = document.getElementById('comparisonTable');
    let tableHtml = `
      <h4>Detailed Comparison: ${district} - ${parameter} - ${day}</h4>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Forecast Value</th>
            <th>Observation Value</th>
            <th>Absolute Difference</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>`;
  
    comparisonData.forEach(item => {
      let category = 'Missing';
      let categoryStyle = 'background: #6c757d; color: white;';
      
      if (!item.isMissing) {
        if (item.absoluteDifference <= 1.0) {  // Changed from 0.1 to 1.0
          category = 'Correct';
          categoryStyle = 'background: #28a745; color: white;';
        } else if (item.absoluteDifference <= 2.0) {  // Changed from 2 to 2.0 for clarity
          category = 'Usable';
          categoryStyle = 'background: #ffc107; color: black;';
        } else {
          category = 'Unusable';
          categoryStyle = 'background: #dc3545; color: white;';
        }
      }
  
      tableHtml += `<tr>
        <td>${item.date}</td>
        <td>${formatComparisonValue(item.forecastValue)}</td>
        <td>${formatComparisonValue(item.observationValue)}</td>
        <td>${formatComparisonValue(item.absoluteDifference)}</td>
        <td><span style="${categoryStyle} padding: 4px 8px; border-radius: 15px; font-size: 12px; font-weight: bold;">${category}</span></td>
      </tr>`;
    });
  
    tableHtml += '</tbody></table>';
    
    // Add the statistics summary table after the main table
    tableHtml += `
      <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
        <h4>Statistical Summary</h4>
        <table style="width: 100%; max-width: 600px;">
          <tbody>
            <tr>
              <td><strong>Missing days (M)</strong></td>
              <td style="text-align: right;"><strong>${statistics.missingDays}</strong></td>
            </tr>
            <tr>
              <td><strong>Total no. of forecast days (N)</strong></td>
              <td style="text-align: right;"><strong>${statistics.validDays}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values ≤ 1.0 (N1)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n1}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values > 1.0 (N11)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n11}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values > 2.0 (N3)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n3}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values 1.0 < diff ≤ 2.0 (N2)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n2}</strong></td>
            </tr>
            <tr style="border-top: 2px solid #dee2e6;">
              <td><strong>Correct = (N1/N) × 100</strong></td>
              <td style="text-align: right;"><strong>${statistics.correct.toFixed(2)}%</strong></td>
            </tr>
            <tr>
              <td><strong>Usable = (N2/N) × 100</strong></td>
              <td style="text-align: right;"><strong>${statistics.usable.toFixed(2)}%</strong></td>
            </tr>
            <tr>
              <td><strong>Unusable = (N3/N) × 100</strong></td>
              <td style="text-align: right;"><strong>${statistics.unusable.toFixed(2)}%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    
    tableDiv.innerHTML = tableHtml;
  }

// Format values for comparison display
function formatComparisonValue(value) {
  if (value === null || value === undefined) {
    return '<span style="color: #999; font-style: italic;">N/A</span>';
  }
  return typeof value === 'number' ? value.toFixed(2) : value;
}

// Export comparison results to Excel


// Export comparison results to Excel
function exportComparisonToExcel() {
    if (!comparisonResults || comparisonResults.data.length === 0) {
      showComparisonStatus('❌ No comparison results to export.', 'error');
      return;
    }
  
    try {
      const { data, statistics, metadata } = comparisonResults;
      
      // Prepare data for export
      const exportData = data.map(item => ({
        'Date': item.date,
        'Forecast Value': item.forecastValue,
        'Observation Value': item.observationValue,
        'Absolute Difference': item.absoluteDifference,
        'Status': item.isMissing ? 'Missing' : 
                  item.absoluteDifference <= 1.0 ? 'Correct' :  // Changed from 0.1 to 1.0
                  item.absoluteDifference <= 2.0 ? 'Usable' : 'Unusable'  // Changed from 2 to 2.0
      }));
  
      // Add statistics summary
      const summaryData = [
        { 'Metric': 'Total Days', 'Value': statistics.totalDays },
        { 'Metric': 'Missing Days (M)', 'Value': statistics.missingDays },
        { 'Metric': 'Valid Days (N)', 'Value': statistics.validDays },
        { 'Metric': 'N1 (≤ 1.0)', 'Value': statistics.n1 },
        { 'Metric': 'N11 (> 1.0)', 'Value': statistics.n11 },
        { 'Metric': 'N2 (1.0 < diff ≤ 2.0)', 'Value': statistics.n2 },
        { 'Metric': 'N3 (> 2.0)', 'Value': statistics.n3 },
        { 'Metric': 'Correct (%)', 'Value': statistics.correct.toFixed(2) },
        { 'Metric': 'Usable (%)', 'Value': statistics.usable.toFixed(2) },
        { 'Metric': 'Unusable (%)', 'Value': statistics.unusable.toFixed(2) }
      ];
  
      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Add detailed data sheet
      const ws1 = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Detailed Comparison');
      
      // Add summary sheet
      const ws2 = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Statistics Summary');
  
      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `Comparison_${metadata.district}_${metadata.parameter}_${metadata.day}_${timestamp}.xlsx`;
  
      // Save file
      XLSX.writeFile(wb, filename);
      
      showComparisonStatus(`✅ Comparison results exported to ${filename}`, 'success');
  
    } catch (error) {
      console.error('Export error:', error);
      showComparisonStatus('❌ Error exporting comparison results: ' + error.message, 'error');
    }
  }

// Show comparison status messages
function showComparisonStatus(message, type) {
  const statusDiv = document.getElementById('comparisonProcessingStatus');
  
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
  