

const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// District and parameter lists
const districts = [
  "ALLURI SITHARAMA RAJU", "ANAKAPALLI", "ANANTAPUR", "ANNAMAYYA", "BAPATLA",
  "CHITTOOR", "DR. B.R. AMBEDKAR KONASEEMA", "EAST GODAVARI", "ELURU", "GUNTUR",
  "KAKINADA", "KRISHNA", "KURNOOL", "NANDYAL", "NELLORE", "NTR", "PALNADU",
  "PARVATHIPURAM MANYAM", "PRAKASAM", "SRIKAKULAM", "SRI SATHYA SAI", "TIRUPATI",
  "VISAKHAPATNAM", "VIZIANAGARAM", "WEST GODAVARI", "YSR KADAPA"
];


// Parameter mapping: Display name -> Database column name
const parameterMapping = {
  "Rainfall (mm)": "rainfall_mm",
  "Temp Max (deg C)": "temp_max_c", 
  "Temp Min (deg C)": "temp_min_c",
  "Humidity-Morning(%)": "humidity_morning_percent",
  "Humidity-Evening": "humidity_evening",
  "Windspeed (kmph)": "windspeed_kmph",
  "WindDirection (deg)": "wind_direction_deg",
  "CloudCover (octa)": "cloud_cover_octa"
};

// Helper function to normalize date format
function normalizeDate(dateString) {
  if (!dateString) return null;
  
  // Convert to Date object first
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  
  // Return in YYYY-MM-DD format
  return date.toISOString().split('T')[0];
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Page loaded, initializing...");
  
  // Populate dropdowns
  populateDistrictDropdown();
  populateParameterDropdown();
  
  // Add event listener to compare button
  document.getElementById('compareBtn').addEventListener('click', async () => {
    const district = document.getElementById('districtDropdown').value;
    const parameter = document.getElementById('parameterDropdown').value;
    
    console.log("Compare button clicked:", { district, parameter });
    
    if (!district || !parameter) {
      alert('Please select both district and parameter');
      return;
    }
    
    await compareForecastAndObservation(district, parameter);
  });
});

// Populate district dropdown
function populateDistrictDropdown() {
  const dropdown = document.getElementById("districtDropdown");
  
  // Clear existing options except the first one
  while (dropdown.children.length > 1) {
    dropdown.removeChild(dropdown.lastChild);
  }
  
  districts.forEach(district => {
    const option = document.createElement("option");
    option.value = district;
    option.textContent = district;
    dropdown.appendChild(option);
  });
  
  console.log("District dropdown populated with", districts.length, "districts");
}

// Populate parameter dropdown
function populateParameterDropdown() {
  const dropdown = document.getElementById("parameterDropdown");
  
  // Clear existing options except the first one
  while (dropdown.children.length > 1) {
    dropdown.removeChild(dropdown.lastChild);
  }
  
  Object.keys(parameterMapping).forEach(param => {
    const option = document.createElement("option");
    option.value = param;
    option.textContent = param;
    dropdown.appendChild(option);
  });
  
  console.log("Parameter dropdown populated with", Object.keys(parameterMapping).length, "parameters");
}

// Main comparison function
async function compareForecastAndObservation(district, parameter) {
  console.log(`Starting comparison for ${district} - ${parameter}`);
  
  // Show loading message
  const loadingMsg = document.getElementById('loadingMessage');
  const errorMsg = document.getElementById('errorMessage');
  const table = document.getElementById('comparisonTable');
  
  if (loadingMsg) loadingMsg.style.display = 'block';
  if (errorMsg) errorMsg.style.display = 'none';
  if (table) table.style.display = 'none';
  
  // Get the database column name
  const dbColumn = parameterMapping[parameter];
  if (!dbColumn) {
    console.error("Unknown parameter:", parameter);
    showError("Unknown parameter selected");
    return;
  }
  
  console.log("Database column:", dbColumn);
  
  try {
    // Fetch forecast data
    console.log("Fetching forecast data...");
    const { data: forecastData, error: forecastError } = await client
      .from('forecast_excel_uploads')
      .select(`forecast_date, district_name, ${dbColumn}`)
      .eq('district_name', district) // Changed from ilike back to eq for exact match
      .not(dbColumn, 'is', null) // Exclude null values
      .order('forecast_date');
    
    if (forecastError) {
      console.error('Forecast data fetch error:', forecastError);
      showError('Error fetching forecast data: ' + forecastError.message);
      return;
    }
    
    console.log("Forecast data:", forecastData);
    console.log("Sample forecast dates:", forecastData.slice(0, 3).map(f => f.forecast_date));
    
    // Fetch observation data
    console.log("Fetching observation data...");
    const { data: observationData, error: observationError } = await client
      .from('observation_data_flat')
      .select(`forecast_date, district_name, ${dbColumn}`)
      .eq('district_name', district)
      .not(dbColumn, 'is', null) // Exclude null values
      .order('forecast_date');
    
    if (observationError) {
      console.error('Observation data fetch error:', observationError);
      showError('Error fetching observation data: ' + observationError.message);
      return;
    }
    
    console.log("Observation data:", observationData);
    console.log("Sample observation dates:", observationData.slice(0, 3).map(o => o.forecast_date));
    
    // Check if data exists
    if (!forecastData || forecastData.length === 0) {
      showError('No forecast data found for the selected district and parameter');
      return;
    }
    
    if (!observationData || observationData.length === 0) {
      showError('No observation data found for the selected district and parameter');
      return;
    }
    
    // Create observation map for quick lookup with normalized dates
    const obsMap = {};
    observationData.forEach(row => {
      const normalizedDate = normalizeDate(row.forecast_date);
      if (normalizedDate && row[dbColumn] !== null && row[dbColumn] !== undefined) {
        const value = parseFloat(row[dbColumn]);
        if (!isNaN(value)) {
          obsMap[normalizedDate] = value;
        }
      }
    });
    
    console.log("Observation map (first 5 entries):", Object.entries(obsMap).slice(0, 5));
    console.log("Total observation entries:", Object.keys(obsMap).length);
    
    // Clear and populate table
    const tbody = document.getElementById('comparisonBody');
    if (!tbody) {
      console.error("Could not find table body with id 'comparisonBody'");
      showError("Table body not found in HTML");
      return;
    }
    
    tbody.innerHTML = '';
    let matchedRows = 0;
    let totalProcessed = 0;
    
    // Process forecast data and match with observations
    forecastData.forEach(fc => {
      totalProcessed++;
      const normalizedDate = normalizeDate(fc.forecast_date);
      const forecastValue = parseFloat(fc[dbColumn]);
      
      if (!normalizedDate || isNaN(forecastValue)) {
        console.log(`Skipping invalid forecast entry: date=${fc.forecast_date}, value=${fc[dbColumn]}`);
        return;
      }
      
      const obsValue = obsMap[normalizedDate];
      
      // Skip rows with no matching observation
      if (obsValue === undefined || isNaN(obsValue)) {
        console.log(`No observation match for ${normalizedDate}: forecast=${forecastValue}, obs=${obsValue}`);
        return;
      }
      
      matchedRows++;
      
      // Calculate differences
      const absDiff = Math.abs(obsValue - forecastValue);
      const sqDiff = absDiff ** 2;
      
      // Create table row
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${normalizedDate}</td>
        <td>${forecastValue.toFixed(2)}</td>
        <td>${obsValue.toFixed(2)}</td>
        <td>${obsValue.toFixed(2)}</td>
        <td>${forecastValue.toFixed(2)}</td>
        <td>${absDiff.toFixed(2)}</td>
        <td>${sqDiff.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
    
    console.log(`Comparison complete. Processed ${totalProcessed} forecast entries, ${matchedRows} rows matched and displayed.`);
    
    // Hide loading and show results
    if (loadingMsg) loadingMsg.style.display = 'none';
    if (table) table.style.display = 'table';
    
    if (matchedRows === 0) {
      showError(`No matching data found between forecast and observation for ${district} - ${parameter}. 
        Forecast entries: ${forecastData.length}, Observation entries: ${observationData.length}`);
      // Add a row showing this message
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center; color: #666;">No matching data found</td>`;
      tbody.appendChild(tr);
      if (table) table.style.display = 'table'; // Still show table with message
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    showError('An unexpected error occurred: ' + error.message);
  }
}

// Helper function to show error messages
function showError(message) {
  const loadingMsg = document.getElementById('loadingMessage');
  const errorMsg = document.getElementById('errorMessage');
  const table = document.getElementById('comparisonTable');
  
  if (loadingMsg) loadingMsg.style.display = 'none';
  if (table) table.style.display = 'none';
  
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
  } else {
    alert(message);
  }
}