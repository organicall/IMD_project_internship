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
let comprehensiveResults = [];

let forecastSheets = [];
let observationSheets = [];
let currentlyDeleting = {};

let currentDisplayedData = [];
let currentDisplayedObservationData = [];


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
            const statistics = calculateStatistics(comparisonData, parameter); // This now uses parameter-specific thresholds
            
            districtResult.parameters[parameter] = {
              correct: statistics.correct,
              usable: statistics.usable,
              unusable: statistics.unusable,
              correctPlusUsable: statistics.correct + statistics.usable,
              validDays: statistics.validDays,
              missingDays: statistics.missingDays,
              n1: statistics.n1,
              n2: statistics.n2,
              n3: statistics.n3,
              threshold1: statistics.threshold1,
              threshold2: statistics.threshold2,
              useN11ForUnusable: statistics.useN11ForUnusable
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
              n3: 0,
              threshold1: 0,
              threshold2: 0,
              useN11ForUnusable: false
            };
          }
        }
        
        results.push(districtResult);
      }
      // Calculate state-wide averages
      const stateAverages = calculateStateAverages(results, parameters);   
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



function displayComprehensiveResults(results) {
  const summaryDiv = document.getElementById('comprehensiveSummary');
  summaryDiv.innerHTML = `
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
      <h4>Analysis Summary for ${results.day}</h4>
      <p><strong>Total Districts Analyzed:</strong> ${results.districts.length}</p>
      <p><strong>Parameters Analyzed:</strong> ${results.parameters.length} (${Object.values(parameterNames).join(', ')})</p>
      <p><strong>Note:</strong> Rainfall uses YY/YN/NY/NN methodology; other parameters use threshold-based analysis</p>
    </div>
  `;
  
  // Create comprehensive table
  const tableDiv = document.getElementById('comprehensiveTable');
  let tableHtml = `
    <table style="width: 100%; font-size: 11px;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th rowspan="2" style="min-width: 150px; vertical-align: middle;">District</th>`;
  
  // Add parameter headers
  results.parameters.forEach(param => {
    const colSpan = param === 'rainfall' ? '3' : '4'; // Rainfall has no unusable column
    tableHtml += `
      <th colspan="${colSpan}" style="text-align: center; background: #e9ecef; border: 1px solid #ccc;">
        ${parameterNames[param]}
      </th>`;
  });
  
  tableHtml += `
        </tr>
        <tr style="background: #f8f9fa;">`;
  
  // Add sub-headers for each parameter
  results.parameters.forEach(param => {
    if (param === 'rainfall') {
      tableHtml += `
        <th style="background: #d4edda; font-size: 10px;">Correct (YY+NN)</th>
        <th style="background: #fff3cd; font-size: 10px;">Usable (YN+NY)</th>
        <th style="background: #cce5ff; font-size: 10px;">Correct+Usable</th>`;
    } else {
      tableHtml += `
        <th style="background: #d4edda; font-size: 10px;">Correct</th>
        <th style="background: #fff3cd; font-size: 10px;">Usable</th>
        <th style="background: #f8d7da; font-size: 10px;">Unusable</th>
        <th style="background: #cce5ff; font-size: 10px;">Correct+Usable</th>`;
    }
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
      const correctClass = data.correct >= 75 ? 'style="background: #d4edda; font-weight: bold;"' : 
                          data.correct >= 50 ? 'style="background: #fff3cd;"' : 
                          'style="background: #f8d7da;"';
      
      if (param === 'rainfall') {
        const totalClass = (data.correct + data.usable) >= 75 ? 'style="background: #d4edda; font-weight: bold;"' : 
                          (data.correct + data.usable) >= 50 ? 'style="background: #fff3cd;"' : 
                          'style="background: #f8d7da;"';
        
        tableHtml += `
          <td ${correctClass}>${data.correct.toFixed(1)}%</td>
          <td style="background: #fff3cd;">${data.usable.toFixed(1)}%</td>
          <td ${totalClass}>${(data.correct + data.usable).toFixed(1)}%</td>`;
      } else {
        const totalClass = (data.correct + data.usable) >= 75 ? 'style="background: #d4edda; font-weight: bold;"' : 
                          (data.correct + data.usable) >= 50 ? 'style="background: #fff3cd;"' : 
                          'style="background: #f8d7da;"';
        
        tableHtml += `
          <td ${correctClass}>${data.correct.toFixed(1)}%</td>
          <td style="background: #fff3cd;">${data.usable.toFixed(1)}%</td>
          <td style="background: #f8d7da;">${data.unusable.toFixed(1)}%</td>
          <td ${totalClass}>${(data.correct + data.usable).toFixed(1)}%</td>`;
      }
    });
    
    tableHtml += `</tr>`;
  });
  
  tableHtml += `
      </tbody>
    </table>`;
  
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
  "ALLURI SITHARAMA RAJU", "ANAKAPALLI", "ANANTPUR", "ANNAMAYYA", "BAPATLA",
  "CHITTOOR", "DR. B.R. AMBEDKAR KONASEEMA", "EAST-GODAVARI","WEST GODAVARI", "ELURU", "GUNTUR",
  "KAKINADA", "KRISHNA", "KURNOOL", "NANDYAL", "NELLORE", "NTR", "PALNADU",
  "PARVATHIPURAM MANYAM", "PRAKASAM", "SRIKAKULAM", "SRI SATHYA SAI", "TIRUPATHI",
  "VISAKHAPATNAM", "VIZIANAGARAM", "WEST GODAVARI", "KADAPA"
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
    populateComparisonDropdowns(); 
    await loadSheetInformation();
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
    //document.getElementById('forecastExportSection').style.display = 'block';

    
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
  currentDisplayedData = data; // Track what's currently displayed
  
  let forecastResultsSection = document.getElementById('resultsSection');
  if (!forecastResultsSection) {
    forecastResultsSection = document.createElement('div');
    forecastResultsSection.id = 'resultsSection';
    forecastResultsSection.className = 'section';
    
    // Insert after the filter section
    const filterSection = document.getElementById('filterSection');
    if (filterSection) {
      filterSection.insertAdjacentElement('afterend', forecastResultsSection);
    }
  }
  
  if (data.length === 0) {
    forecastResultsSection.innerHTML = `
      <h2>📊 Processed Forecast Data</h2>
      <p>No data to display.</p>
    `;
    return;
  }

  let html = `
    <h2>📊 Processed Forecast Data</h2>
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

  html += `</tbody></table></div>
    
    <!-- Export buttons for forecast -->
    <div style="margin-top: 20px;" id="forecastExportButtons">
      <h4 style="margin-bottom: 10px;">📁 Export Forecast Data</h4>
      <div style="margin-bottom: 15px;">
        <h5 style="margin-bottom: 10px;">Export Current View:</h5>
        <button class="btn" onclick="exportCurrentForecastView()">📁 Export Current View</button>
        <p style="font-size: 12px; color: #666; margin-top: 5px;">Exports whatever is currently displayed in the table above</p>
      </div>
      
      <div>
        <h5 style="margin-bottom: 10px;">Export Specific Days:</h5>
        <button class="btn" onclick="exportForecastToExcel('All')">📁 Export All Days</button>
        <button class="btn" onclick="exportForecastToExcel('Day1')">📁 Export Day 1</button>
        <button class="btn" onclick="exportForecastToExcel('Day2')">📁 Export Day 2</button>
        <button class="btn" onclick="exportForecastToExcel('Day3')">📁 Export Day 3</button>
        <button class="btn" onclick="exportForecastToExcel('Day4')">📁 Export Day 4</button>
        <button class="btn" onclick="exportForecastToExcel('Day5')">📁 Export Day 5</button>
      </div>
    </div>`;
  
  forecastResultsSection.innerHTML = html;
  forecastResultsSection.style.display = 'block';
}

function renderObservationTable(data) {
  currentDisplayedObservationData = data; // Track what's currently displayed
  
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
      <!-- Export buttons for observation -->
      <div style="margin-top: 20px;" id="observationExportButtons">
        <button class="btn" onclick="exportCurrentObservationView()">📁 Export Current View</button>
        <button class="btn" onclick="exportObservationToExcel('All')">📁 Export All</button>
        <button class="btn" onclick="exportObservationToExcel('Day1')">📁 Export Day 1</button>
        <button class="btn" onclick="exportObservationToExcel('Day2')">📁 Export Day 2</button>
        <button class="btn" onclick="exportObservationToExcel('Day3')">📁 Export Day 3</button>
        <button class="btn" onclick="exportObservationToExcel('Day4')">📁 Export Day 4</button>
        <button class="btn" onclick="exportObservationToExcel('Day5')">📁 Export Day 5</button>
      </div>
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


function exportCurrentForecastView() {
  if (currentDisplayedData.length === 0) {
    showStatus('❌ No data currently displayed to export.', 'error');
    return;
  }

  try {
    // Determine what's being displayed
    const dayTypes = [...new Set(currentDisplayedData.map(row => row.day))];
    const viewType = dayTypes.length === 1 ? dayTypes[0] : 'Filtered_View';
    
    const exportData = currentDisplayedData.map(row => ({
      'Forecasted Date': row.forecasted_date,
      'Day': row.day,
      'Forecast Taken On': row.forecast_taken_on,
      'District': row.district_name,
      'Rainfall (mm)': row.rainfall,
      'Temp Max (°C)': row.temp_max_c,
      'Temp Min (°C)': row.temp_min_c,
      'Humidity Morning (%)': row.humidity_1,
      'Humidity Evening (%)': row.humidity_2,
      'Wind Speed (kmph)': row.wind_speed_kmph,
      'Wind Direction (deg)': row.wind_direction_deg,
      'Cloud Cover (octa)': row.cloud_cover_octa
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const cols = Object.keys(exportData[0]).map(key => ({ width: 15 }));
    ws['!cols'] = cols;
    
    XLSX.utils.book_append_sheet(wb, ws, viewType);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Forecast_${viewType}_${timestamp}.xlsx`;

    XLSX.writeFile(wb, filename);
    showStatus(`✅ Current view exported to ${filename}`, 'success');

  } catch (error) {
    console.error('Export error:', error);
    showStatus('❌ Error exporting current view: ' + error.message, 'error');
  }
}

// Export current view for observation data
function exportCurrentObservationView() {
  if (currentDisplayedObservationData.length === 0) {
    showObservationStatus('❌ No observation data currently displayed to export.', 'error');
    return;
  }

  try {
    // Determine what's being displayed
    const dayTypes = [...new Set(currentDisplayedObservationData.map(row => row.day))];
    const viewType = dayTypes.length === 1 ? dayTypes[0] : 'Filtered_View';
    
    const exportData = currentDisplayedObservationData.map(row => ({
      'Forecasted Date': row.forecasted_date,
      'Day': row.day,
      'Forecast Taken On': row.forecast_taken_on,
      'District': row.district_name,
      'Rainfall (mm)': row.rainfall,
      'Temp Max (°C)': row.temp_max_c,
      'Temp Min (°C)': row.temp_min_c,
      'Humidity Morning (%)': row.humidity_1,
      'Humidity Evening (%)': row.humidity_2,
      'Wind Speed (kmph)': row.wind_speed_kmph,
      'Wind Direction (deg)': row.wind_direction_deg,
      'Cloud Cover (octa)': row.cloud_cover_octa
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const cols = Object.keys(exportData[0]).map(key => ({ width: 15 }));
    ws['!cols'] = cols;
    
    XLSX.utils.book_append_sheet(wb, ws, viewType);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Observation_${viewType}_${timestamp}.xlsx`;

    XLSX.writeFile(wb, filename);
    showObservationStatus(`✅ Current view exported to ${filename}`, 'success');

  } catch (error) {
    console.error('Export error:', error);
    showObservationStatus('❌ Error exporting current view: ' + error.message, 'error');
  }
}

function exportForecastToExcel(dayFilter) {
  if (processedOutput.length === 0) {
    showStatus('❌ No forecast data to export.', 'error');
    return;
  }

  try {
    let dataToExport = processedOutput;
    
    if (dayFilter !== 'All') {
      dataToExport = processedOutput.filter(row => row.day === dayFilter);
    }

    if (dataToExport.length === 0) {
      showStatus(`❌ No data found for ${dayFilter}.`, 'error');
      return;
    }

    const exportData = dataToExport.map(row => ({
      'Forecasted Date': row.forecasted_date,
      'Day': row.day,
      'Forecast Taken On': row.forecast_taken_on,
      'District': row.district_name,
      'Rainfall (mm)': row.rainfall,
      'Temp Max (°C)': row.temp_max_c,
      'Temp Min (°C)': row.temp_min_c,
      'Humidity Morning (%)': row.humidity_1,
      'Humidity Evening (%)': row.humidity_2,
      'Wind Speed (kmph)': row.wind_speed_kmph,
      'Wind Direction (deg)': row.wind_direction_deg,
      'Cloud Cover (octa)': row.cloud_cover_octa
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const cols = Object.keys(exportData[0]).map(key => ({ width: 15 }));
    ws['!cols'] = cols;
    
    XLSX.utils.book_append_sheet(wb, ws, dayFilter);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Forecast_${dayFilter}_${timestamp}.xlsx`;

    XLSX.writeFile(wb, filename);
    showStatus(`✅ Forecast data exported to ${filename}`, 'success');

  } catch (error) {
    console.error('Export error:', error);
    showStatus('❌ Error exporting forecast data: ' + error.message, 'error');
  }
}

// New function for exporting observation data
function exportObservationToExcel(dayFilter) {
  if (processedObservationOutput.length === 0) {
    showObservationStatus('❌ No observation data to export.', 'error');
    return;
  }

  try {
    let dataToExport = processedObservationOutput;
    
    if (dayFilter !== 'All') {
      dataToExport = processedObservationOutput.filter(row => row.day === dayFilter);
    }

    if (dataToExport.length === 0) {
      showObservationStatus(`❌ No data found for ${dayFilter}.`, 'error');
      return;
    }

    const exportData = dataToExport.map(row => ({
      'Forecasted Date': row.forecasted_date,
      'Day': row.day,
      'Forecast Taken On': row.forecast_taken_on,
      'District': row.district_name,
      'Rainfall (mm)': row.rainfall,
      'Temp Max (°C)': row.temp_max_c,
      'Temp Min (°C)': row.temp_min_c,
      'Humidity Morning (%)': row.humidity_1,
      'Humidity Evening (%)': row.humidity_2,
      'Wind Speed (kmph)': row.wind_speed_kmph,
      'Wind Direction (deg)': row.wind_direction_deg,
      'Cloud Cover (octa)': row.cloud_cover_octa
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const cols = Object.keys(exportData[0]).map(key => ({ width: 15 }));
    ws['!cols'] = cols;
    
    XLSX.utils.book_append_sheet(wb, ws, dayFilter);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Observation_${dayFilter}_${timestamp}.xlsx`;

    XLSX.writeFile(wb, filename);
    showObservationStatus(`✅ Observation data exported to ${filename}`, 'success');

  } catch (error) {
    console.error('Export error:', error);
    showObservationStatus('❌ Error exporting observation data: ' + error.message, 'error');
  }
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
  const useDateRange = document.getElementById('useDateRangeComparison').checked;
  const startDate = document.getElementById('comparisonStartDate').value;
  const endDate = document.getElementById('comparisonEndDate').value;
  
  if (!day || !district || !parameter) {
    showComparisonStatus('❌ Please select day, district, and parameter for comparison.', 'error');
    return;
  }

  let forecastData, observationData;

  if (useDateRange) {
    // Validate date range
    const validation = validateDateRange(startDate, endDate);
    if (!validation.valid) {
      showComparisonStatus('❌ ' + validation.message, 'error');
      return;
    }

    showComparisonStatus('🔍 Loading data from database for date range...', 'info');

    try {
      // Load data from database
      const [dbForecastData, dbObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

      // Filter by district and day
      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = dbForecastData.filter(row => 
        row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
        row.day_number === dayNumber
      );

      observationData = dbObservationData.filter(row => 
        row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
        row.day_number === dayNumber
      );

    } catch (error) {
      showComparisonStatus('❌ Error loading data from database: ' + error.message, 'error');
      return;
    }
  } else {
    // Use existing processed data
    if (processedOutput.length === 0) {
      showComparisonStatus('❌ No forecast data available. Please process forecast data first.', 'error');
      return;
    }

    if (processedObservationOutput.length === 0) {
      showComparisonStatus('❌ No observation data available. Please process observation data first.', 'error');
      return;
    }

    const dayNumber = parseInt(day.replace('Day', ''));
    forecastData = processedOutput.filter(row => 
      row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
      row.day_number === dayNumber
    );

    observationData = processedObservationOutput.filter(row => 
      row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
      row.day_number === dayNumber
    );
  }

  if (forecastData.length === 0) {
    showComparisonStatus('❌ No forecast data found for the selected criteria.', 'error');
    return;
  }

  if (observationData.length === 0) {
    showComparisonStatus('❌ No observation data found for the selected criteria.', 'error');
    return;
  }

  showComparisonStatus('🔍 Performing comparison analysis...', 'info');

  try {
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
        parameter: parameter,
        useDateRange: useDateRange,
        startDate: startDate,
        endDate: endDate
      }
    };

    // Display results
    displayComparisonResults(comparisonData, statistics, day, district, parameter);
    
    document.getElementById('comparisonResultsSection').style.display = 'block';
    
    const dateRangeText = useDateRange ? ` (${startDate} to ${endDate})` : '';
    showComparisonStatus(`✅ Comparison analysis completed for ${district} - ${parameter} - ${day}${dateRangeText}.`, 'success');

  } catch (error) {
    console.error('Comparison error:', error);
    showComparisonStatus('❌ Comparison error: ' + error.message, 'error');
  }
}



function createComparisonData(forecastData, observationData, parameter) {
  const comparisonData = [];
  
  // Create a lookup for observation data
  const obsLookup = {};
  observationData.forEach(obs => {
    const dateKey = obs.observation_date || obs.forecasted_date || obs.forecast_date;
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

// Calculate statistics based on parameter-specific thresholds
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
    
    let threshold1, threshold2;
    let useN11ForUnusable = false; 
    
    switch (parameter) {
      case 'temp_max_c':
      case 'temp_min_c':
        threshold1 = 1.0;
        threshold2 = 2.0;
        break;
        
      case 'humidity_1':
      case 'humidity_2':
        threshold1 = 10.0;
        threshold2 = 20.0;
        break;
        
      case 'wind_speed_kmph':
      case 'wind_direction_deg':
        threshold1 = 7.2;
        threshold2 = 14.4;
        useN11ForUnusable = true; 
        break;
        
      case 'cloud_cover_octa':
        threshold1 = 2.0;
        threshold2 = 3.0;
        break;
        
      case 'rainfall':
        threshold1 = 1.0;
        threshold2 = 2.0;
        break;
        
      default:
        threshold1 = 1.0;
        threshold2 = 2.0;
        break;
    }
    
    // Calculate N1, N11, N3, N2 based on parameter-specific thresholds
    const n1 = validData.filter(item => item.absoluteDifference <= threshold1).length;  
    const n11 = validData.filter(item => item.absoluteDifference > threshold1).length;  
    const n3 = validData.filter(item => item.absoluteDifference > threshold2).length;   
    const n2 = n11 - n3;
  
    // Calculate percentages based on parameter type
    const correct = (n1 / validDays) * 100;
    const usable = (n2 / validDays) * 100;
    const unusable = useN11ForUnusable ? (n11 / validDays) * 100 : (n3 / validDays) * 100;
  
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
      unusable: unusable,
      threshold1: threshold1,
      threshold2: threshold2,
      useN11ForUnusable: useN11ForUnusable
    };
}

// Add this function after the existing calculateStatistics function
function calculateRainfallStatistics(comparisonData) {
  const totalDays = comparisonData.length;
  const missingDays = comparisonData.filter(item => item.isMissing).length;
  const validDays = totalDays - missingDays; // N
  
  if (validDays === 0) {
    return {
      totalDays: totalDays,
      missingDays: missingDays,
      validDays: validDays,
      YY: 0, YN: 0, NY: 0, NN: 0,
      matchingCases: 0,
      correct: 0,
      usable: 0,
      unusable: 0,
      isRainfall: true
    };
  }

  const validData = comparisonData.filter(item => !item.isMissing);
  
  let YY = 0; 
  let YN = 0; 
  let NY = 0; 
  let NN = 0; 
  
  validData.forEach(item => {
      const forecastRain = item.forecastValue > 0;
      const observedRain = item.observationValue > 0;
      
      if (forecastRain && observedRain) {
          YY++;
      } else if (forecastRain && !observedRain) {
          YN++;
      } else if (!forecastRain && observedRain) {
          NY++;
      } else if (!forecastRain && !observedRain) {
          NN++;
      }
  });
  
  const matchingCases = YY + NN; 
  
  // Calculate percentages for rainfall
  const correct = (matchingCases / validDays) * 100;
  const usable = ((validDays - matchingCases) / validDays) * 100;
  const unusable = 0; 
  
  return {
      totalDays: totalDays,
      missingDays: missingDays,
      validDays: validDays,
      YY: YY,
      YN: YN,
      NY: NY,
      NN: NN,
      matchingCases: matchingCases,
      correct: correct,
      usable: usable,
      unusable: unusable,
      isRainfall: true
  };
}


function calculateStatistics(comparisonData, parameter) {
  // Check if this is rainfall parameter
  if (parameter === 'rainfall') {
      return calculateRainfallStatistics(comparisonData);
  }
  
  // Existing logic for other parameters
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
      unusable: 0,
      isRainfall: false
    };
  }

  const validData = comparisonData.filter(item => !item.isMissing);
  
  let threshold1, threshold2;
  let useN11ForUnusable = false; 
  
  switch (parameter) {
    case 'temp_max_c':
    case 'temp_min_c':
      threshold1 = 1.0;
      threshold2 = 2.0;
      break;
      
    case 'humidity_1':
    case 'humidity_2':
      threshold1 = 10.0;
      threshold2 = 20.0;
      break;
      
    case 'wind_speed_kmph':
    case 'wind_direction_deg':
      threshold1 = 7.2;
      threshold2 = 14.4;
      useN11ForUnusable = true; 
      break;
      
    case 'cloud_cover_octa':
      threshold1 = 2.0;
      threshold2 = 3.0;
      break;
      
    default:
      threshold1 = 1.0;
      threshold2 = 2.0;
      break;
  }
  
  
  const n1 = validData.filter(item => item.absoluteDifference <= threshold1).length;  
  const n11 = validData.filter(item => item.absoluteDifference > threshold1).length;  
  const n3 = validData.filter(item => item.absoluteDifference > threshold2).length;   
  const n2 = n11 - n3;

  const correct = (n1 / validDays) * 100;
  const usable = (n2 / validDays) * 100;
  const unusable = useN11ForUnusable ? (n11 / validDays) * 100 : (n3 / validDays) * 100;

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
    unusable: unusable,
    threshold1: threshold1,
    threshold2: threshold2,
    useN11ForUnusable: useN11ForUnusable,
    isRainfall: false
  };
}

function displayComparisonResults(comparisonData, statistics, day, district, parameter) {
  const statsDiv = document.getElementById('comparisonStats');
  
  if (statistics.isRainfall) {
      statsDiv.innerHTML = `
        <div style="background: #d4edda; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #155724; margin: 0;">Correct</h4>
          <div style="font-size: 24px; font-weight: bold; color: #155724;">${statistics.correct.toFixed(1)}%</div>
          <small>(Matching cases: YY + NN)</small>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #856404; margin: 0;">Usable</h4>
          <div style="font-size: 24px; font-weight: bold; color: #856404;">${statistics.usable.toFixed(1)}%</div>
          <small>(Non-matching cases: YN + NY)</small>
        </div>
        <div style="background: #cce5ff; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #0c5460; margin: 0;">Valid Days</h4>
          <div style="font-size: 24px; font-weight: bold; color: #0c5460;">${statistics.validDays}</div>
          <small>out of ${statistics.totalDays}</small>
        </div>
        <div style="background: #e9ecef; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #495057; margin: 0;">Matching Cases</h4>
          <div style="font-size: 24px; font-weight: bold; color: #495057;">${statistics.matchingCases}</div>
          <small>(YY: ${statistics.YY} + NN: ${statistics.NN})</small>
        </div>
      `;
  } else {
      let threshold1Label, threshold2Label, unusableLabel;
      
      switch (parameter) {
        case 'temp_max_c':
        case 'temp_min_c':
          threshold1Label = '≤ 1.0 difference';
          threshold2Label = '1.0 < diff ≤ 2.0';
          unusableLabel = '> 2.0 difference';
          break;
          
        case 'humidity_1':
        case 'humidity_2':
          threshold1Label = '≤ 10 difference';
          threshold2Label = '10 < diff ≤ 20';
          unusableLabel = '> 20 difference';
          break;
          
        case 'wind_speed_kmph':
        case 'wind_direction_deg':
          threshold1Label = '≤ 7.2 difference';
          threshold2Label = '7.2 < diff ≤ 14.4';
          unusableLabel = '> 7.2 difference';
          break;
          
        case 'cloud_cover_octa':
          threshold1Label = '≤ 2 difference';
          threshold2Label = '2 < diff ≤ 3';
          unusableLabel = '> 3 difference';
          break;
          
        default:
          threshold1Label = '≤ 1.0 difference';
          threshold2Label = '1.0 < diff ≤ 2.0';
          unusableLabel = '> 2.0 difference';
          break;
      }

      statsDiv.innerHTML = `
        <div style="background: #d4edda; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #155724; margin: 0;">Correct</h4>
          <div style="font-size: 24px; font-weight: bold; color: #155724;">${statistics.correct.toFixed(1)}%</div>
          <small>(${threshold1Label})</small>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #856404; margin: 0;">Usable</h4>
          <div style="font-size: 24px; font-weight: bold; color: #856404;">${statistics.usable.toFixed(1)}%</div>
          <small>(${threshold2Label})</small>
        </div>
        <div style="background: #f8d7da; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #721c24; margin: 0;">Unusable</h4>
          <div style="font-size: 24px; font-weight: bold; color: #721c24;">${statistics.unusable.toFixed(1)}%</div>
          <small>(${unusableLabel})</small>
        </div>
        <div style="background: #d1ecf1; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #0c5460; margin: 0;">Valid Days</h4>
          <div style="font-size: 24px; font-weight: bold; color: #0c5460;">${statistics.validDays}</div>
          <small>out of ${statistics.totalDays}</small>
        </div>
      `;
  }

  const tableDiv = document.getElementById('comparisonTable');
  let tableHtml = `
    <h4>Detailed Comparison: ${district} - ${parameterNames[parameter] || parameter} - ${day}</h4>`;
  
  if (statistics.isRainfall) {
      tableHtml += `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Forecast Value</th>
              <th>Observation Value</th>
              <th>Rain Status</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>`;

      comparisonData.forEach(item => {
        let category = 'Missing';
        let categoryStyle = 'background: #6c757d; color: white;';
        let rainStatus = 'Missing';
        
        if (!item.isMissing) {
          const forecastRain = item.forecastValue > 0;
          const observedRain = item.observationValue > 0;
          
          if (forecastRain && observedRain) {
            rainStatus = 'YY (Both Rain)';
            category = 'Correct';
            categoryStyle = 'background: #28a745; color: white;';
          } else if (forecastRain && !observedRain) {
            rainStatus = 'YN (Forecast Only)';
            category = 'Usable';
            categoryStyle = 'background: #ffc107; color: black;';
          } else if (!forecastRain && observedRain) {
            rainStatus = 'NY (Observed Only)';
            category = 'Usable';
            categoryStyle = 'background: #ffc107; color: black;';
          } else {
            rainStatus = 'NN (No Rain)';
            category = 'Correct';
            categoryStyle = 'background: #28a745; color: white;';
          }
        }

        tableHtml += `<tr>
          <td>${item.date}</td>
          <td>${formatComparisonValue(item.forecastValue)}</td>
          <td>${formatComparisonValue(item.observationValue)}</td>
          <td>${rainStatus}</td>
          <td><span style="${categoryStyle} padding: 4px 8px; border-radius: 15px; font-size: 12px; font-weight: bold;">${category}</span></td>
        </tr>`;
      });

      tableHtml += '</tbody></table>';
      
      tableHtml += `
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
          <h4>Rainfall Statistical Summary</h4>
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
                <td><strong>Rain forecasted and observed (YY)</strong></td>
                <td style="text-align: right;"><strong>${statistics.YY}</strong></td>
              </tr>
              <tr>
                <td><strong>Rain forecasted but not observed (YN)</strong></td>
                <td style="text-align: right;"><strong>${statistics.YN}</strong></td>
              </tr>
              <tr>
                <td><strong>Rain observed but not forecasted (NY)</strong></td>
                <td style="text-align: right;"><strong>${statistics.NY}</strong></td>
              </tr>
              <tr>
                <td><strong>No rain forecasted and observed (NN)</strong></td>
                <td style="text-align: right;"><strong>${statistics.NN}</strong></td>
              </tr>
              <tr>
                <td><strong>Matching cases (YY + NN)</strong></td>
                <td style="text-align: right;"><strong>${statistics.matchingCases}</strong></td>
              </tr>
              <tr style="border-top: 2px solid #dee2e6;">
                <td><strong>Correct = ((YY + NN)/N) × 100</strong></td>
                <td style="text-align: right;"><strong>${statistics.correct.toFixed(2)}%</strong></td>
              </tr>
              <tr>
                <td><strong>Usable = ((YN + NY)/N) × 100</strong></td>
                <td style="text-align: right;"><strong>${statistics.usable.toFixed(2)}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
  } else {
      tableHtml += `
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
          if (item.absoluteDifference <= statistics.threshold1) {
            category = 'Correct';
            categoryStyle = 'background: #28a745; color: white;';
          } else if (item.absoluteDifference <= statistics.threshold2) {
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
      
      const unusableCalculation = statistics.useN11ForUnusable ? 
        `<strong>Unusable = (N11/N) × 100</strong>` : 
        `<strong>Unusable = (N3/N) × 100</strong>`;
      
      tableHtml += `
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
          <h4>Statistical Summary for ${parameterNames[parameter] || parameter}</h4>
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
                <td><strong>No. of absolute values ≤ ${statistics.threshold1} (N1)</strong></td>
                <td style="text-align: right;"><strong>${statistics.n1}</strong></td>
              </tr>
              <tr>
                <td><strong>No. of absolute values > ${statistics.threshold1} (N11)</strong></td>
                <td style="text-align: right;"><strong>${statistics.n11}</strong></td>
              </tr>
              <tr>
                <td><strong>No. of absolute values > ${statistics.threshold2} (N3)</strong></td>
                <td style="text-align: right;"><strong>${statistics.n3}</strong></td>
              </tr>
              <tr>
                <td><strong>No. of absolute values ${statistics.threshold1} < diff ≤ ${statistics.threshold2} (N2)</strong></td>
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
                <td>${unusableCalculation}</td>
                <td style="text-align: right;"><strong>${statistics.unusable.toFixed(2)}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
  }
  
  tableDiv.innerHTML = tableHtml;
}



async function performComprehensiveAnalysis() {
  const day = document.getElementById('comprehensiveDay').value;
  const useDateRange = document.getElementById('useDateRangeComprehensive').checked;
  const startDate = document.getElementById('comprehensiveStartDate').value;
  const endDate = document.getElementById('comprehensiveEndDate').value;
  
  if (!day) {
    showComprehensiveStatus('❌ Please select a day for analysis.', 'error');
    return;
  }

  let allForecastData, allObservationData;

  if (useDateRange) {
    // Validate date range
    const validation = validateDateRange(startDate, endDate);
    if (!validation.valid) {
      showComprehensiveStatus('❌ ' + validation.message, 'error');
      return;
    }

    showComprehensiveStatus('🔍 Loading data from database for date range...', 'info');

    try {
      // Load data from database
      [allForecastData, allObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

    } catch (error) {
      showComprehensiveStatus('❌ Error loading data from database: ' + error.message, 'error');
      return;
    }
  } else {
    // Use existing processed data
    if (processedOutput.length === 0) {
      showComprehensiveStatus('❌ No forecast data available. Please process forecast data first.', 'error');
      return;
    }

    if (processedObservationOutput.length === 0) {
      showComprehensiveStatus('❌ No observation data available. Please process observation data first.', 'error');
      return;
    }

    allForecastData = processedOutput;
    allObservationData = processedObservationOutput;
  }

  showComprehensiveStatus('🔍 Performing comprehensive analysis for all districts and parameters...', 'info');

  try {
    const dayNumber = parseInt(day.replace('Day', ''));
    const results = [];
    
    // Get all unique districts from the data
    const allDistricts = [...new Set(allForecastData.map(row => row.district_name))];
    const parameters = Object.keys(parameterNames);
    
    // For each district, analyze all parameters
    for (const district of allDistricts) {
      const districtResult = {
        district: district,
        parameters: {}
      };
      
      for (const parameter of parameters) {
        // Filter forecast data for this district and day
        const forecastData = allForecastData.filter(row => 
          row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
          row.day_number === dayNumber
        );

        // Filter observation data for this district and day
        const observationData = allObservationData.filter(row => 
          row.district_name.toUpperCase().trim() === district.toUpperCase().trim() &&
          row.day_number === dayNumber
        );

        if (forecastData.length > 0 && observationData.length > 0) {
          // Create comparison data for this parameter
          const comparisonData = createComparisonData(forecastData, observationData, parameter);
          const statistics = calculateStatistics(comparisonData, parameter);
          
          if (statistics.isRainfall) {
            districtResult.parameters[parameter] = {
              correct: statistics.correct,
              usable: statistics.usable,
              unusable: 0,
              correctPlusUsable: statistics.correct + statistics.usable,
              validDays: statistics.validDays,
              missingDays: statistics.missingDays,
              YY: statistics.YY,
              YN: statistics.YN,
              NY: statistics.NY,
              NN: statistics.NN,
              matchingCases: statistics.matchingCases,
              isRainfall: true
            };
          } else {
            districtResult.parameters[parameter] = {
              correct: statistics.correct,
              usable: statistics.usable,
              unusable: statistics.unusable,
              correctPlusUsable: statistics.correct + statistics.usable,
              validDays: statistics.validDays,
              missingDays: statistics.missingDays,
              n1: statistics.n1,
              n2: statistics.n2,
              n3: statistics.n3,
              threshold1: statistics.threshold1,
              threshold2: statistics.threshold2,
              useN11ForUnusable: statistics.useN11ForUnusable,
              isRainfall: false
            };
          }
        } else {
          // No data available
          districtResult.parameters[parameter] = {
            correct: 0,
            usable: 0,
            unusable: 0,
            correctPlusUsable: 0,
            validDays: 0,
            missingDays: 0,
            isRainfall: parameter === 'rainfall'
          };
        }
      }
      
      results.push(districtResult);
    }

    // Calculate state-wide averages
    const stateAverages = calculateStateAverages(results, parameters);   
    comprehensiveResults = {
      day: day,
      districts: results,
      stateAverages: stateAverages,
      parameters: parameters,
      useDateRange: useDateRange,
      startDate: startDate,
      endDate: endDate
    };

    // Display results
    displayComprehensiveResults(comprehensiveResults);
    
    document.getElementById('comprehensiveResultsSection').style.display = 'block';
    
    const dateRangeText = useDateRange ? ` (${startDate} to ${endDate})` : '';
    showComprehensiveStatus(`✅ Comprehensive analysis completed for ${day}${dateRangeText}.`, 'success');

  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    showComprehensiveStatus('❌ Comprehensive analysis error: ' + error.message, 'error');
  }
}



function displayComparisonResults(comparisonData, statistics, day, district, parameter) {
    let threshold1Label, threshold2Label, unusableLabel;
    
    switch (parameter) {
      case 'temp_max_c':
      case 'temp_min_c':
        threshold1Label = '≤ 1.0 difference';
        threshold2Label = '1.0 < diff ≤ 2.0';
        unusableLabel = '> 2.0 difference';
        break;
        
      case 'humidity_1':
      case 'humidity_2':
        threshold1Label = '≤ 10 difference';
        threshold2Label = '10 < diff ≤ 20';
        unusableLabel = '> 20 difference';
        break;
        
      case 'wind_speed_kmph':
      case 'wind_direction_deg':
        threshold1Label = '≤ 7.2 difference';
        threshold2Label = '7.2 < diff ≤ 14.4';
        unusableLabel = '> 7.2 difference';
        break;
        
      case 'cloud_cover_octa':
        threshold1Label = '≤ 2 difference';
        threshold2Label = '2 < diff ≤ 3';
        unusableLabel = '> 3 difference';
        break;
        
      case 'rainfall':
      default:
        threshold1Label = '≤ 1.0 difference';
        threshold2Label = '1.0 < diff ≤ 2.0';
        unusableLabel = '> 2.0 difference';
        break;
    }

    const statsDiv = document.getElementById('comparisonStats');
    statsDiv.innerHTML = `
      <div style="background: #d4edda; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #155724; margin: 0;">Correct</h4>
        <div style="font-size: 24px; font-weight: bold; color: #155724;">${statistics.correct.toFixed(1)}%</div>
        <small>(${threshold1Label})</small>
      </div>
      <div style="background: #fff3cd; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #856404; margin: 0;">Usable</h4>
        <div style="font-size: 24px; font-weight: bold; color: #856404;">${statistics.usable.toFixed(1)}%</div>
        <small>(${threshold2Label})</small>
      </div>
      <div style="background: #f8d7da; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #721c24; margin: 0;">Unusable</h4>
        <div style="font-size: 24px; font-weight: bold; color: #721c24;">${statistics.unusable.toFixed(1)}%</div>
        <small>(${unusableLabel})</small>
      </div>
      <div style="background: #d1ecf1; padding: 15px; border-radius: 10px; text-align: center;">
        <h4 style="color: #0c5460; margin: 0;">Valid Days</h4>
        <div style="font-size: 24px; font-weight: bold; color: #0c5460;">${statistics.validDays}</div>
        <small>out of ${statistics.totalDays}</small>
      </div>
    `;
  
    const tableDiv = document.getElementById('comparisonTable');
    let tableHtml = `
      <h4>Detailed Comparison: ${district} - ${parameterNames[parameter] || parameter} - ${day}</h4>
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
        if (item.absoluteDifference <= statistics.threshold1) {
          category = 'Correct';
          categoryStyle = 'background: #28a745; color: white;';
        } else if (item.absoluteDifference <= statistics.threshold2) {
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
    const unusableCalculation = statistics.useN11ForUnusable ? 
      `<strong>Unusable = (N11/N) × 100</strong>` : 
      `<strong>Unusable = (N3/N) × 100</strong>`;
    
    tableHtml += `
      <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
        <h4>Statistical Summary for ${parameterNames[parameter] || parameter}</h4>
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
              <td><strong>No. of absolute values ≤ ${statistics.threshold1} (N1)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n1}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values > ${statistics.threshold1} (N11)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n11}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values > ${statistics.threshold2} (N3)</strong></td>
              <td style="text-align: right;"><strong>${statistics.n3}</strong></td>
            </tr>
            <tr>
              <td><strong>No. of absolute values ${statistics.threshold1} < diff ≤ ${statistics.threshold2} (N2)</strong></td>
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
              <td>${unusableCalculation}</td>
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
                  item.absoluteDifference <= 1.0 ? 'Correct' :  
                  item.absoluteDifference <= 2.0 ? 'Usable' : 'Unusable'  
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
  


async function loadSheetInformation() {
  try {
    // Load forecast sheet information
    await loadForecastSheetInfo();
    // Load observation sheet information  
    await loadObservationSheetInfo();
  } catch (error) {
    console.error('Error loading sheet information:', error);
  }
}

async function loadForecastSheetInfo() {
  try {
    const { data, error } = await client
      .from('full_forecast')
      .select('sheet_name, forecast_date, district_name')
      .not('sheet_name', 'is', null)
      .order('sheet_name', { ascending: true });
    
    if (error) throw error;
    
    // Group by sheet_name and calculate metadata
    const sheetGroups = {};
    data.forEach(row => {
      if (!sheetGroups[row.sheet_name]) {
        sheetGroups[row.sheet_name] = {
          name: row.sheet_name,
          records: 0,
          districts: new Set(),
          dates: new Set(),
          uploadDate: null
        };
      }
      
      sheetGroups[row.sheet_name].records++;
      sheetGroups[row.sheet_name].districts.add(row.district_name);
      sheetGroups[row.sheet_name].dates.add(row.forecast_date);
    });
    
    // Convert to array and add computed metadata
    forecastSheets = Object.values(sheetGroups).map(sheet => ({
      ...sheet,
      districts: Array.from(sheet.districts),
      dates: Array.from(sheet.dates).sort(),
      districtCount: sheet.districts.size,
      dateRange: sheet.dates.size > 0 ? {
        start: Array.from(sheet.dates).sort()[0],
        end: Array.from(sheet.dates).sort()[sheet.dates.size - 1]
      } : null
    }));
    
    updateForecastSheetDisplay();
    
  } catch (error) {
    console.error('Error loading forecast sheet info:', error);
  }
}


async function loadObservationSheetInfo() {
  try {
    const { data, error } = await client
      .from('full_observation')
      .select('sheet_name, observation_date, district_name')
      .not('sheet_name', 'is', null)
      .order('sheet_name', { ascending: true });
    
    if (error) throw error;
    
    // Group by sheet_name and calculate metadata
    const sheetGroups = {};
    data.forEach(row => {
      if (!sheetGroups[row.sheet_name]) {
        sheetGroups[row.sheet_name] = {
          name: row.sheet_name,
          records: 0,
          districts: new Set(),
          dates: new Set(),
          uploadDate: null
        };
      }
      
      sheetGroups[row.sheet_name].records++;
      sheetGroups[row.sheet_name].districts.add(row.district_name);
      sheetGroups[row.sheet_name].dates.add(row.observation_date);
    });
    
    // Convert to array and add computed metadata
    observationSheets = Object.values(sheetGroups).map(sheet => ({
      ...sheet,
      districts: Array.from(sheet.districts),
      dates: Array.from(sheet.dates).sort(),
      districtCount: sheet.districts.size,
      dateRange: sheet.dates.size > 0 ? {
        start: Array.from(sheet.dates).sort()[0],
        end: Array.from(sheet.dates).sort()[sheet.dates.size - 1]
      } : null
    }));
    
    updateObservationSheetDisplay();
    
  } catch (error) {
    console.error('Error loading observation sheet info:', error);
  }
}

function toggleSheetList(type) {
  const listId = type === 'forecast' ? 'forecastSheetList' : 'observationSheetList';
  const btnId = type === 'forecast' ? 'toggleForecastBtn' : 'toggleObservationBtn';
  
  const listElement = document.getElementById(listId);
  const btnElement = document.getElementById(btnId);
  
  if (listElement.style.display === 'none') {
    listElement.style.display = 'block';
    btnElement.innerHTML = btnElement.innerHTML.replace('📂 Show', '📁 Hide');
  } else {
    listElement.style.display = 'none';
    btnElement.innerHTML = btnElement.innerHTML.replace('📁 Hide', '📂 Show');
  }
}


function updateForecastSheetDisplay() {
  const contentDiv = document.getElementById('forecastSheetContent');
  const countSpan = document.getElementById('forecastSheetCount');
  
  countSpan.textContent = forecastSheets.length;
  
  if (forecastSheets.length === 0) {
    contentDiv.innerHTML = '<p style="color: #666; font-style: italic; padding: 15px;">No sheets uploaded yet.</p>';
    return;
  }
  
  let html = '';
  forecastSheets.forEach(sheet => {
    const dateRangeText = sheet.dateRange ? 
      `${formatDate(new Date(sheet.dateRange.start))} to ${formatDate(new Date(sheet.dateRange.end))}` : 
      'No dates';
      
    html += `
      <div class="sheet-item">
        <div class="sheet-info">
          <div class="sheet-name">📊 ${sheet.name}</div>
          <div class="sheet-meta">
            ${sheet.records} records • ${sheet.districtCount} districts • ${dateRangeText}
          </div>
        </div>
        <div class="sheet-actions">
          <button class="btn-info" onclick="showSheetDetails('forecast', '${sheet.name}')">
            ℹ️ Info
          </button>
          <button class="btn-delete" onclick="confirmDeleteSheet('forecast', '${sheet.name}')" 
                  ${currentlyDeleting[`forecast_${sheet.name}`] ? 'disabled' : ''}>
            ${currentlyDeleting[`forecast_${sheet.name}`] ? '⏳ Deleting...' : '🗑️ Delete'}
          </button>
        </div>
      </div>
    `;
  });
  
  contentDiv.innerHTML = html;
}


function updateObservationSheetDisplay() {
  const contentDiv = document.getElementById('observationSheetContent');
  const countSpan = document.getElementById('observationSheetCount');
  
  countSpan.textContent = observationSheets.length;
  
  if (observationSheets.length === 0) {
    contentDiv.innerHTML = '<p style="color: #666; font-style: italic; padding: 15px;">No sheets uploaded yet.</p>';
    return;
  }
  
  let html = '';
  observationSheets.forEach(sheet => {
    const dateRangeText = sheet.dateRange ? 
      `${formatDate(new Date(sheet.dateRange.start))} to ${formatDate(new Date(sheet.dateRange.end))}` : 
      'No dates';
      
    html += `
      <div class="sheet-item">
        <div class="sheet-info">
          <div class="sheet-name">📈 ${sheet.name}</div>
          <div class="sheet-meta">
            ${sheet.records} records • ${sheet.districtCount} districts • ${dateRangeText}
          </div>
        </div>
        <div class="sheet-actions">
          <button class="btn-info" onclick="showSheetDetails('observation', '${sheet.name}')">
            ℹ️ Info
          </button>
          <button class="btn-delete" onclick="confirmDeleteSheet('observation', '${sheet.name}')" 
                  ${currentlyDeleting[`observation_${sheet.name}`] ? 'disabled' : ''}>
            ${currentlyDeleting[`observation_${sheet.name}`] ? '⏳ Deleting...' : '🗑️ Delete'}
          </button>
        </div>
      </div>
    `;
  });
  
  contentDiv.innerHTML = html;
}

// Show detailed sheet information
function showSheetDetails(type, sheetName) {
  const sheets = type === 'forecast' ? forecastSheets : observationSheets;
  const sheet = sheets.find(s => s.name === sheetName);
  
  if (!sheet) {
    alert('Sheet not found!');
    return;
  }
  
  const dateRangeText = sheet.dateRange ? 
    `From: ${formatDate(new Date(sheet.dateRange.start))}\nTo: ${formatDate(new Date(sheet.dateRange.end))}` : 
    'No dates available';
  
  const message = `
Sheet: ${sheet.name}
Type: ${type.charAt(0).toUpperCase() + type.slice(1)}

📊 Statistics:
• Total Records: ${sheet.records}
• Districts: ${sheet.districtCount}
• Date Range: ${sheet.dateRange ? `${sheet.dates.length} days` : 'No dates'}

📅 Date Range:
${dateRangeText}

🏘️ Districts:
${sheet.districts.join(', ')}
  `;
  
  alert(message);
}

// Confirm sheet deletion
function confirmDeleteSheet(type, sheetName) {
  const message = `Are you sure you want to delete the sheet "${sheetName}" and all its associated ${type} data?\n\nThis action cannot be undone.`;
  
  if (confirm(message)) {
    deleteSheet(type, sheetName);
  }
}

// Delete sheet and all associated data
async function deleteSheet(type, sheetName) {
  const deleteKey = `${type}_${sheetName}`;
  
  // Prevent multiple simultaneous deletes
  if (currentlyDeleting[deleteKey]) {
    return;
  }
  
  currentlyDeleting[deleteKey] = true;
  
  // Update UI to show deleting state
  if (type === 'forecast') {
    updateForecastSheetDisplay();
  } else {
    updateObservationSheetDisplay();
  }
  
  try {
    const tableName = type === 'forecast' ? 'full_forecast' : 'full_observation';
    
    // Delete all records with this sheet name
    const { error } = await client
      .from(tableName)
      .delete()
      .eq('sheet_name', sheetName);
    
    if (error) throw error;
    
    // Remove from local arrays
    if (type === 'forecast') {
      forecastSheets = forecastSheets.filter(s => s.name !== sheetName);
      existingSheetNames = existingSheetNames.filter(name => name !== sheetName);
      updateForecastSheetDisplay();
    } else {
      observationSheets = observationSheets.filter(s => s.name !== sheetName);
      existingObservationSheetNames = existingObservationSheetNames.filter(name => name !== sheetName);
      updateObservationSheetDisplay();
    }
    
    // Show success message
    const statusFunction = type === 'forecast' ? showStatus : showObservationStatus;
    statusFunction(`✅ Successfully deleted sheet "${sheetName}" and all associated data.`, 'success');
    
  } catch (error) {
    console.error(`Error deleting ${type} sheet:`, error);
    const statusFunction = type === 'forecast' ? showStatus : showObservationStatus;
    statusFunction(`❌ Error deleting sheet "${sheetName}": ${error.message}`, 'error');
  } finally {
    delete currentlyDeleting[deleteKey];
    
    // Update UI to remove deleting state
    if (type === 'forecast') {
      updateForecastSheetDisplay();
    } else {
      updateObservationSheetDisplay();
    }
  }
}

// Modify the existing saveToDatabase function to refresh the sheet list
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
    
    existingSheetNames.push(sheetName);
    document.getElementById('saveToDatabaseBtn').disabled = true;
    document.getElementById('sheetNameInput').value = '';
    validateSheetName();

    await loadForecastSheetInfo();

  } catch (error) {
    console.error('Database save error:', error);
    showStatus('❌ Error saving to database: ' + error.message, 'error');
  }
}

// Modify the existing saveObservationToDatabase function to refresh the sheet list
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

      // NEW: Refresh sheet information
      await loadObservationSheetInfo();
  
    } catch (error) {
      console.error('Database save error for observation:', error);
      showObservationStatus('❌ Error saving observation to database: ' + error.message, 'error');
    }
}

// Load forecast data from database by date range
async function loadForecastDataByDateRange(startDate, endDate) {
  try {
    const { data, error } = await client
      .from('full_forecast')
      .select('*')
      .gte('forecast_date', startDate)
      .lte('forecast_date', endDate)
      .order('forecast_date');
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error loading forecast data by date range:', error);
    throw error;
  }
}

// Load observation data from database by date range
async function loadObservationDataByDateRange(startDate, endDate) {
  try {
    const { data, error } = await client
      .from('full_observation')
      .select('*')
      .gte('observation_date', startDate)
      .lte('observation_date', endDate)
      .order('observation_date');
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error loading observation data by date range:', error);
    throw error;
  }
}

// Validate date range
function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return { valid: false, message: 'Please select both start and end dates.' };
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    return { valid: false, message: 'Start date must be before end date.' };
  }
  
  return { valid: true };
}