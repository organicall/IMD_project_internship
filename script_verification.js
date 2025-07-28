

// const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co';
// const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';
// const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// // District and parameter lists
// const districts = [
//   "ALLURI SITHARAMA RAJU", "ANAKAPALLI", "ANANTAPUR", "ANNAMAYYA", "BAPATLA",
//   "CHITTOOR", "DR. B.R. AMBEDKAR KONASEEMA", "EAST GODAVARI", "ELURU", "GUNTUR",
//   "KAKINADA", "KRISHNA", "KURNOOL", "NANDYAL", "NELLORE", "NTR", "PALNADU",
//   "PARVATHIPURAM MANYAM", "PRAKASAM", "SRIKAKULAM", "SRI SATHYA SAI", "TIRUPATI",
//   "VISAKHAPATNAM", "VIZIANAGARAM", "WEST GODAVARI", "YSR KADAPA"
// ];

// // Parameter mapping: Display name -> Database column name
// const parameterMapping = {
//   "Rainfall (mm)": "rainfall",
//   "Temp Max (deg C)": "temp_max_c", 
//   "Temp Min (deg C)": "temp_min_c",
//   "Humidity-Morning(%)": "humidity_1",
//   "Humidity-Evening(%)": "humidity_2", // Fixed: added _percent
//   "Windspeed (kmph)": "wind_speed_kmph",
//   "WindDirection (deg)": "wind_direction_deg",
//   "CloudCover (octa)": "cloud_cover_octa"
// };

// // Parameter-specific thresholds for error classification
// const parameterThresholds = {
//   "rainfall": { correct: 5.0, unusable: 20.0 },
//   "temp_max_c": { correct: 2.0, unusable: 5.0 },
//   "temp_min_c": { correct: 2.0, unusable: 5.0 },
//   "humidity_1": { correct: 10.0, unusable: 30.0 },
//   "humidity_2": { correct: 10.0, unusable: 30.0 },
//   "wind_speed_kmph": { correct: 5.0, unusable: 15.0 },
//   "wind_direction_deg": { correct: 30.0, unusable: 90.0 },
//   "cloud_cover_octa": { correct: 1.0, unusable: 3.0 }
// };

// // Helper function to normalize date format
// function normalizeDate(dateString) {
//   if (!dateString) return null;
//   const date = new Date(dateString);
//   if (isNaN(date.getTime())) return null;
//   return date.toISOString().split('T')[0];
// }

// // Initialize page
// document.addEventListener('DOMContentLoaded', async () => {
//   console.log("Page loaded, initializing...");
//   populateDistrictDropdown();
//   populateParameterDropdown();
//   document.getElementById('compareBtn').addEventListener('click', async () => {
//     const district = document.getElementById('districtDropdown').value;
//     const parameter = document.getElementById('parameterDropdown').value;
//     console.log("Compare button clicked:", { district, parameter });
//     if (!district || !parameter) {
//       alert('Please select both district and parameter');
//       return;
//     }
//     await compareForecastAndObservation(district, parameter);
//   });
// });

// // Populate district dropdown
// function populateDistrictDropdown() {
//   const dropdown = document.getElementById("districtDropdown");
//   while (dropdown.children.length > 1) {
//     dropdown.removeChild(dropdown.lastChild);
//   }
//   districts.forEach(district => {
//     const option = document.createElement("option");
//     option.value = district;
//     option.textContent = district;
//     dropdown.appendChild(option);
//   });
//   console.log("District dropdown populated with", districts.length, "districts");
// }

// // Populate parameter dropdown
// function populateParameterDropdown() {
//   const dropdown = document.getElementById("parameterDropdown");
//   while (dropdown.children.length > 1) {
//     dropdown.removeChild(dropdown.lastChild);
//   }
//   Object.keys(parameterMapping).forEach(param => {
//     const option = document.createElement("option");
//     option.value = param;
//     option.textContent = param;
//     dropdown.appendChild(option);
//   });
//   console.log("Parameter dropdown populated with", Object.keys(parameterMapping).length, "parameters");
// }

// // Main comparison function
// async function compareForecastAndObservation(district, parameter) {
//   console.log(`Starting comparison for ${district} - ${parameter}`);
//   const loadingMsg = document.getElementById('loadingMessage');
//   const errorMsg = document.getElementById('errorMessage');
//   const table = document.getElementById('comparisonTable');
//   const summaryTable = document.getElementById('districtSummaryTable');
  
//   if (loadingMsg) loadingMsg.style.display = 'block';
//   if (errorMsg) errorMsg.style.display = 'none';
//   if (table) table.style.display = 'none';
//   if (summaryTable) summaryTable.style.display = 'none';

//   const dbColumn = parameterMapping[parameter];
//   if (!dbColumn) {
//     console.error("Unknown parameter:", parameter);
//     showError("Unknown parameter selected");
//     return;
//   }

//   try {
//     // Fetch forecast data with case-insensitive district matching
//     const { data: forecastData, error: forecastError } = await client
//       .from('forecast_excel_uploads')
//       .select(`forecast_date, district_name, ${dbColumn}`)
//       .ilike('district_name', district)
//       .not(dbColumn, 'is', null)
//       .order('forecast_date');
    
//     if (forecastError) {
//       console.error('Forecast data fetch error:', forecastError);
//       showError('Error fetching forecast data: ' + forecastError.message);
//       return;
//     }

//     // Fetch observation data with exact district matching
//     const { data: observationData, error: observationError } = await client
//       .from('observation_data_flat')
//       .select(`forecast_date, district_name, ${dbColumn}`)
//       .eq('district_name', district)
//       .not(dbColumn, 'is', null)
//       .order('forecast_date');
    
//     if (observationError) {
//       console.error('Observation data fetch error:', observationError);
//       showError('Error fetching observation data: ' + observationError.message);
//       return;
//     }

//     console.log(`Fetched ${forecastData?.length || 0} forecast records and ${observationData?.length || 0} observation records`);

//     if (!forecastData || forecastData.length === 0) {
//       showError('No forecast data found for the selected district and parameter');
//       return;
//     }
//     if (!observationData || observationData.length === 0) {
//       showError('No observation data found for the selected district and parameter');
//       return;
//     }

//     // Create observation map for quick lookup with normalized dates
//     const obsMap = {};
//     observationData.forEach(row => {
//       const normalizedDate = normalizeDate(row.forecast_date);
//       if (normalizedDate && row[dbColumn] !== null && row[dbColumn] !== undefined) {
//         const value = parseFloat(row[dbColumn]);
//         if (!isNaN(value)) {
//           obsMap[normalizedDate] = value;
//         }
//       }
//     });

//     // Only keep the last forecast entry for each date
//     const forecastMap = {};
//     forecastData.forEach(fc => {
//       const normalizedDate = normalizeDate(fc.forecast_date);
//       if (normalizedDate && fc[dbColumn] !== null && fc[dbColumn] !== undefined) {
//         const value = parseFloat(fc[dbColumn]);
//         if (!isNaN(value)) {
//           // Always overwrite, so the last occurrence for each date is kept
//           forecastMap[normalizedDate] = fc;
//         }
//       }
//     });

//     // Clear and populate table
//     const tbody = document.getElementById('comparisonBody');
//     if (!tbody) {
//       console.error("Could not find table body with id 'comparisonBody'");
//       showError("Table body not found in HTML");
//       return;
//     }
    
//     tbody.innerHTML = '';
//     let matchedRows = 0;
//     let totalProcessed = 0;

//     // Sort dates for chronological display
//     const sortedDates = Object.keys(forecastMap).sort();

//     // Only process the last forecast entry for each date
//     sortedDates.forEach(normalizedDate => {
//       const fc = forecastMap[normalizedDate];
//       totalProcessed++;
      
//       const forecastValue = parseFloat(fc[dbColumn]);
//       if (!normalizedDate || isNaN(forecastValue)) {
//         console.log(`Skipping invalid forecast entry: date=${fc.forecast_date}, value=${fc[dbColumn]}`);
//         return;
//       }
      
//       const obsValue = obsMap[normalizedDate];
//       if (obsValue === undefined || isNaN(obsValue)) {
//         console.log(`No observation match for ${normalizedDate}: forecast=${forecastValue}, obs=${obsValue}`);
//         return;
//       }
      
//       matchedRows++;
//       const absDiff = Math.abs(obsValue - forecastValue);
//       const sqDiff = absDiff ** 2;
      
//       const tr = document.createElement('tr');
//       tr.innerHTML = `
//         <td>${normalizedDate}</td>
//         <td>${forecastValue.toFixed(2)}</td>
//         <td>${obsValue.toFixed(2)}</td>
//         <td>${obsValue.toFixed(2)}</td>
//         <td>${forecastValue.toFixed(2)}</td>
//         <td>${absDiff.toFixed(2)}</td>
//         <td>${sqDiff.toFixed(2)}</td>
//       `;
//       tbody.appendChild(tr);
//     });

//     console.log(`Comparison complete. Processed ${totalProcessed} forecast entries, ${matchedRows} rows matched and displayed.`);
    
//     if (loadingMsg) loadingMsg.style.display = 'none';
    
//     if (matchedRows === 0) {
//       showError(`No matching data found between forecast and observation for ${district} - ${parameter}. 
//         Forecast entries: ${forecastData.length}, Observation entries: ${observationData.length}`);
//       const tr = document.createElement('tr');
//       tr.innerHTML = `<td colspan="7" style="text-align: center; color: #666;">No matching data found</td>`;
//       tbody.appendChild(tr);
//     }
    
//     if (table) table.style.display = 'table';

//     // Show summary for all districts
//     await buildDistrictSummaryTable(parameter);

//   } catch (error) {
//     console.error('Unexpected error:', error);
//     showError('An unexpected error occurred: ' + error.message);
//   }
// }

// // Helper function to show error messages
// function showError(message) {
//   const loadingMsg = document.getElementById('loadingMessage');
//   const errorMsg = document.getElementById('errorMessage');
//   const table = document.getElementById('comparisonTable');
//   const summaryTable = document.getElementById('districtSummaryTable');
  
//   if (loadingMsg) loadingMsg.style.display = 'none';
//   if (table) table.style.display = 'none';
//   if (summaryTable) summaryTable.style.display = 'none';
  
//   if (errorMsg) {
//     errorMsg.textContent = message;
//     errorMsg.style.display = 'block';
//   } else {
//     alert(message);
//   }
// }

// // Enhanced error structure computation with parameter-specific thresholds
// function computeErrorStructure(forecastMap, obsMap, dbColumn) {
//   const thresholds = parameterThresholds[dbColumn] || { correct: 2.0, unusable: 5.0 };
  
//   // Get all unique dates from both forecast and observation
//   const allDates = new Set([
//     ...Object.keys(forecastMap),
//     ...Object.keys(obsMap)
//   ]);
  
//   let M = 0, N = 0, N1 = 0, N11 = 0, N3 = 0;
  
//   allDates.forEach(date => {
//     const fc = forecastMap[date] ? parseFloat(forecastMap[date][dbColumn]) : null;
//     const obs = obsMap[date];
    
//     if (fc == null || obs == null || isNaN(fc) || isNaN(obs)) {
//       M++; // Missing data
//       return;
//     }
    
//     N++; // Valid data pairs
//     const absDiff = Math.abs(obs - fc);
    
//     if (absDiff <= thresholds.correct) {
//       N1++; // Correct
//     } else {
//       N11++; // Not correct
//       if (absDiff > thresholds.unusable) {
//         N3++; // Unusable
//       }
//     }
//   });
  
//   const N2 = N11 - N3; // Usable but not correct
  
//   const correct = N === 0 ? 0 : (N1 / N) * 100;
//   const usable = N === 0 ? 0 : (N2 / N) * 100;
//   const unusable = N === 0 ? 0 : (N3 / N) * 100;
//   const correctUsable = correct + usable;
  
//   return { 
//     M, N, N1, N11, N2, N3, 
//     correct, usable, unusable, correctUsable,
//     thresholds 
//   };
// }

// // Build district summary table for all districts
// async function buildDistrictSummaryTable(parameter) {
//   console.log(`Building district summary table for parameter: ${parameter}`);
  
//   const dbColumn = parameterMapping[parameter];
//   const table = document.getElementById('districtSummaryTable');
//   const thresholds = parameterThresholds[dbColumn] || { correct: 2.0, unusable: 5.0 };
  
//   table.innerHTML = `
//     <thead>
//       <tr>
//         <th colspan="6" style="text-align: center; background-color: #f0f0f0; padding: 10px;">
//           District Summary for ${parameter}
//           <br><small>Thresholds: Correct ≤ ${thresholds.correct}, Unusable > ${thresholds.unusable}</small>
//         </th>
//       </tr>
//       <tr>
//         <th>District</th>
//         <th>Total Pairs</th>
//         <th>Correct (%)</th>
//         <th>Usable (%)</th>
//         <th>Unusable (%)</th>
//         <th>Correct+Usable (%)</th>
//       </tr>
//     </thead>
//     <tbody id="districtSummaryBody"></tbody>
//   `;
  
//   const tbody = document.getElementById('districtSummaryBody');
//   tbody.innerHTML = '';
  
//   let overallStats = { totalPairs: 0, totalCorrect: 0, totalUsable: 0, totalUnusable: 0 };
  
//   for (const district of districts) {
//     try {
//       console.log(`Processing district: ${district}`);
      
//       // Fetch forecast data
//       const { data: forecastData, error: forecastError } = await client
//         .from('forecast_excel_uploads')
//         .select(`forecast_date, district_name, ${dbColumn}`)
//         .ilike('district_name', district)
//         .not(dbColumn, 'is', null)
//         .order('forecast_date');
      
//       if (forecastError) {
//         console.error(`Error fetching forecast data for ${district}:`, forecastError);
//         continue;
//       }

//       // Fetch observation data
//       const { data: observationData, error: observationError } = await client
//         .from('observation_data_flat')
//         .select(`forecast_date, district_name, ${dbColumn}`)
//         .eq('district_name', district)
//         .not(dbColumn, 'is', null)
//         .order('forecast_date');
      
//       if (observationError) {
//         console.error(`Error fetching observation data for ${district}:`, observationError);
//         continue;
//       }

//       // Build observation map
//       const obsMap = {};
//       (observationData || []).forEach(row => {
//         const normalizedDate = normalizeDate(row.forecast_date);
//         if (normalizedDate && row[dbColumn] != null && !isNaN(parseFloat(row[dbColumn]))) {
//           obsMap[normalizedDate] = parseFloat(row[dbColumn]);
//         }
//       });

//       // Build forecast map (keep last entry for each date)
//       const forecastMap = {};
//       (forecastData || []).forEach(fc => {
//         const normalizedDate = normalizeDate(fc.forecast_date);
//         if (normalizedDate && fc[dbColumn] != null && !isNaN(parseFloat(fc[dbColumn]))) {
//           forecastMap[normalizedDate] = fc;
//         }
//       });

//       // Compute error structure
//       const stats = computeErrorStructure(forecastMap, obsMap, dbColumn);
      
//       // Update overall statistics
//       overallStats.totalPairs += stats.N;
//       overallStats.totalCorrect += stats.N1;
//       overallStats.totalUsable += stats.N2;
//       overallStats.totalUnusable += stats.N3;

//       // Determine row color based on performance
//       let rowStyle = '';
//       if (stats.correctUsable >= 75) {
//         rowStyle = 'background-color: #d4edda;'; // Green - Good
//       } else if (stats.correctUsable >= 50) {
//         rowStyle = 'background-color: #fff3cd;'; // Yellow - Fair  
//       } else {
//         rowStyle = 'background-color: #f8d7da;'; // Red - Poor
//       }

//       // Add row to table
//       const tr = document.createElement('tr');
//       tr.innerHTML = `
//         <td>${district}</td>
//         <td>${stats.N}</td>
//         <td>${stats.correct.toFixed(1)}%</td>
//         <td>${stats.usable.toFixed(1)}%</td>
//         <td>${stats.unusable.toFixed(1)}%</td>
//         <td style="${rowStyle} font-weight: bold;">${stats.correctUsable.toFixed(1)}%</td>
//       `;
//       tbody.appendChild(tr);
      
//     } catch (error) {
//       console.error(`Error processing district ${district}:`, error);
//     }
//   }
  
//   // Add overall summary row
//   if (overallStats.totalPairs > 0) {
//     const overallCorrect = (overallStats.totalCorrect / overallStats.totalPairs) * 100;
//     const overallUsable = (overallStats.totalUsable / overallStats.totalPairs) * 100;
//     const overallUnusable = (overallStats.totalUnusable / overallStats.totalPairs) * 100;
//     const overallCorrectUsable = overallCorrect + overallUsable;
    
//     let overallStyle = '';
//     if (overallCorrectUsable >= 75) {
//       overallStyle = 'background-color: #d4edda;';
//     } else if (overallCorrectUsable >= 50) {
//       overallStyle = 'background-color: #fff3cd;';
//     } else {
//       overallStyle = 'background-color: #f8d7da;';
//     }
    
//     const overallRow = document.createElement('tr');
//     overallRow.style.borderTop = '2px solid #333';
//     overallRow.style.fontWeight = 'bold';
//     overallRow.innerHTML = `
//       <td>OVERALL</td>
//       <td>${overallStats.totalPairs}</td>
//       <td>${overallCorrect.toFixed(1)}%</td>
//       <td>${overallUsable.toFixed(1)}%</td>
//       <td>${overallUnusable.toFixed(1)}%</td>
//       <td style="${overallStyle}">${overallCorrectUsable.toFixed(1)}%</td>
//     `;
//     tbody.appendChild(overallRow);
//   }
  
//   table.style.display = 'table';
//   console.log('District summary table completed');
// }



const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// District and parameter lists
const districts = [
  "ALLURI SITHARAMA RAJU", "ANAKAPALLI", "ANANTAPUR", "ANNAMAYYA", "BAPATLA",
  "CHITTOOR", "DR. B.R. AMBEDKAR KONASEEMA", "EAST-GODAVARI","WEST-GODAVARI", "ELURU", "GUNTUR",
  "KAKINADA", "KRISHNA", "KURNOOL", "NANDYAL", "NELLORE", "NTR", "PALNADU",
  "PARVATHIPURAM MANYAM", "PRAKASAM", "SRIKAKULAM", "SRI SATHYA SAI", "TIRUPATHI",
  "VISAKHAPATNAM", "VIZIANAGARAM", "WEST GODAVARI", "YSR KADAPA"
];

// Parameter mapping: Display name -> Database column name
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

// Helper function to normalize date format
function normalizeDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Page loaded, initializing...");
  populateDistrictDropdown();
  populateParameterDropdown();
  populateDistrictOnlyDropdown();
  
  // Event listener for district + parameter comparison
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

  // Event listener for district-only analysis
  document.getElementById('analyzeDistrictBtn').addEventListener('click', async () => {
    const district = document.getElementById('districtOnlyDropdown').value;
    console.log("Analyze district button clicked:", { district });
    if (!district) {
      alert('Please select a district');
      return;
    }
    await analyzeDistrictAllParameters(district);
  });
});

// Populate district dropdown for comparison
function populateDistrictDropdown() {
  const dropdown = document.getElementById("districtDropdown");
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

// Populate district dropdown for district-only analysis
function populateDistrictOnlyDropdown() {
  const dropdown = document.getElementById("districtOnlyDropdown");
  while (dropdown.children.length > 1) {
    dropdown.removeChild(dropdown.lastChild);
  }
  districts.forEach(district => {
    const option = document.createElement("option");
    option.value = district;
    option.textContent = district;
    dropdown.appendChild(option);
  });
  console.log("District-only dropdown populated with", districts.length, "districts");
}

// Populate parameter dropdown
function populateParameterDropdown() {
  const dropdown = document.getElementById("parameterDropdown");
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

// Main comparison function (existing functionality)
async function compareForecastAndObservation(district, parameter) {
  console.log(`Starting comparison for ${district} - ${parameter}`);
  const loadingMsg = document.getElementById('loadingMessage');
  const errorMsg = document.getElementById('errorMessage');
  const table = document.getElementById('comparisonTable');
  const summaryTable = document.getElementById('districtSummaryTable');
  
  // Hide district analysis section
  const districtAnalysisSection = document.getElementById('districtAnalysisSection');
  if (districtAnalysisSection) districtAnalysisSection.style.display = 'none';
  
  if (loadingMsg) loadingMsg.style.display = 'block';
  if (errorMsg) errorMsg.style.display = 'none';
  if (table) table.style.display = 'none';
  if (summaryTable) summaryTable.style.display = 'none';

  const dbColumn = parameterMapping[parameter];
  if (!dbColumn) {
    console.error("Unknown parameter:", parameter);
    showError("Unknown parameter selected");
    return;
  }

  try {
    // Fetch forecast data with case-insensitive district matching
    const { data: forecastData, error: forecastError } = await client
      .from('forecast_excel_uploads')
      .select(`forecast_date, district_name, ${dbColumn}`)
      .ilike('district_name', district)
      .not(dbColumn, 'is', null)
      .order('forecast_date');
    
    if (forecastError) {
      console.error('Forecast data fetch error:', forecastError);
      showError('Error fetching forecast data: ' + forecastError.message);
      return;
    }

    // Fetch observation data with exact district matching
    const { data: observationData, error: observationError } = await client
      .from('observation_data_flat')
      .select(`forecast_date, district_name, ${dbColumn}`)
      .eq('district_name', district)
      .not(dbColumn, 'is', null)
      .order('forecast_date');
    
    if (observationError) {
      console.error('Observation data fetch error:', observationError);
      showError('Error fetching observation data: ' + observationError.message);
      return;
    }

    console.log(`Fetched ${forecastData?.length || 0} forecast records and ${observationData?.length || 0} observation records`);

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

    // Only keep the last forecast entry for each date
    const forecastMap = {};
    forecastData.forEach(fc => {
      const normalizedDate = normalizeDate(fc.forecast_date);
      if (normalizedDate && fc[dbColumn] !== null && fc[dbColumn] !== undefined) {
        const value = parseFloat(fc[dbColumn]);
        if (!isNaN(value)) {
          // Always overwrite, so the last occurrence for each date is kept
          forecastMap[normalizedDate] = fc;
        }
      }
    });

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

    // Sort dates for chronological display
    const sortedDates = Object.keys(forecastMap).sort();

    // Only process the last forecast entry for each date
    sortedDates.forEach(normalizedDate => {
      const fc = forecastMap[normalizedDate];
      totalProcessed++;
      
      const forecastValue = parseFloat(fc[dbColumn]);
      if (!normalizedDate || isNaN(forecastValue)) {
        console.log(`Skipping invalid forecast entry: date=${fc.forecast_date}, value=${fc[dbColumn]}`);
        return;
      }
      
      const obsValue = obsMap[normalizedDate];
      if (obsValue === undefined || isNaN(obsValue)) {
        console.log(`No observation match for ${normalizedDate}: forecast=${forecastValue}, obs=${obsValue}`);
        return;
      }
      
      matchedRows++;
      const absDiff = Math.abs(obsValue - forecastValue);
      const sqDiff = absDiff ** 2;
      
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
    
    if (loadingMsg) loadingMsg.style.display = 'none';
    
    if (matchedRows === 0) {
      showError(`No matching data found between forecast and observation for ${district} - ${parameter}. 
        Forecast entries: ${forecastData.length}, Observation entries: ${observationData.length}`);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center; color: #666;">No matching data found</td>`;
      tbody.appendChild(tr);
    }
    
    if (table) table.style.display = 'table';

    // Show summary for all districts
    await buildDistrictSummaryTable(parameter);

  } catch (error) {
    console.error('Unexpected error:', error);
    showError('An unexpected error occurred: ' + error.message);
  }
}

// NEW FUNCTION: District-only analysis for all parameters
async function analyzeDistrictAllParameters(district) {
  console.log(`Starting district analysis for ${district}`);
  const loadingMsg2 = document.getElementById('loadingMessage2');
  const errorMsg2 = document.getElementById('errorMessage2');
  const analysisTable = document.getElementById('districtAnalysisTable');
  const analysisSection = document.getElementById('districtAnalysisSection');
  
  // Hide comparison section
  const comparisonTable = document.getElementById('comparisonTable');
  const summaryTable = document.getElementById('districtSummaryTable');
  if (comparisonTable) comparisonTable.style.display = 'none';
  if (summaryTable) summaryTable.style.display = 'none';
  
  if (loadingMsg2) loadingMsg2.style.display = 'block';
  if (errorMsg2) errorMsg2.style.display = 'none';
  if (analysisTable) analysisTable.style.display = 'none';
  if (analysisSection) analysisSection.style.display = 'block';

  try {
    const analysisResults = [];

    // Analyze each parameter
    for (const [parameterName, dbColumn] of Object.entries(parameterMapping)) {
      console.log(`Analyzing ${parameterName} for ${district}`);

      // Fetch forecast data
      const { data: forecastData, error: forecastError } = await client
        .from('forecast_excel_uploads')
        .select(`forecast_date, district_name, ${dbColumn}`)
        .ilike('district_name', district)
        .not(dbColumn, 'is', null)
        .order('forecast_date');

      if (forecastError) {
        console.error(`Forecast error for ${parameterName}:`, forecastError);
        continue;
      }

      // Fetch observation data
      const { data: observationData, error: observationError } = await client
        .from('observation_data_flat')
        .select(`forecast_date, district_name, ${dbColumn}`)
        .eq('district_name', district)
        .not(dbColumn, 'is', null)
        .order('forecast_date');

      if (observationError) {
        console.error(`Observation error for ${parameterName}:`, observationError);
        continue;
      }

      // Build maps
      const obsMap = {};
      (observationData || []).forEach(row => {
        const normalizedDate = normalizeDate(row.forecast_date);
        if (normalizedDate && row[dbColumn] != null && !isNaN(parseFloat(row[dbColumn]))) {
          obsMap[normalizedDate] = parseFloat(row[dbColumn]);
        }
      });

      const forecastMap = {};
      (forecastData || []).forEach(fc => {
        const normalizedDate = normalizeDate(fc.forecast_date);
        if (normalizedDate && fc[dbColumn] != null && !isNaN(parseFloat(fc[dbColumn]))) {
          forecastMap[normalizedDate] = fc;
        }
      });

      // Compute error structure using your specific logic
      const errorStats = computeErrorStructureSpecific(forecastMap, obsMap, dbColumn);
      
      analysisResults.push({
        parameter: parameterName,
        ...errorStats
      });
    }

    // Build the analysis table
    buildDistrictAnalysisTable(district, analysisResults);

    if (loadingMsg2) loadingMsg2.style.display = 'none';
    if (analysisTable) analysisTable.style.display = 'table';

  } catch (error) {
    console.error('Unexpected error in district analysis:', error);
    showError2('An unexpected error occurred: ' + error.message);
  }
}

// Error structure computation using your specific logic
function computeErrorStructureSpecific(forecastMap, obsMap, dbColumn) {
  // Get all unique dates from both forecast and observation
  const allDates = new Set([
    ...Object.keys(forecastMap),
    ...Object.keys(obsMap)
  ]);

  let M = 0;  // Missing days
  let N = 0;  // Total forecast days (total - missing)
  let N1 = 0; // |obs - fc| <= 0.1
  let N11 = 0; // |obs - fc| > 0.1
  let N3 = 0; // |obs - fc| > 2

  allDates.forEach(date => {
    const fc = forecastMap[date] ? parseFloat(forecastMap[date][dbColumn]) : null;
    const obs = obsMap[date];

    if (fc == null || obs == null || isNaN(fc) || isNaN(obs)) {
      M++; // Missing data
      return;
    }

    N++; // Valid forecast-observation pair
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

  // Calculate N2: |obs-fc| > 1 and <= 2
  // But according to your formula: N2 = N11 - N3
  const N2 = N11 - N3;

  // Calculate percentages
  const correct = N === 0 ? 0 : (N1 / N) * 100;
  const usable = N === 0 ? 0 : (N2 / N) * 100;
  const unusable = N === 0 ? 0 : (N3 / N) * 100;
  const correctUsable = correct + usable;

  return {
    M, N, N1, N11, N2, N3,
    correct, usable, unusable, correctUsable
  };
}

// Build district analysis table
function buildDistrictAnalysisTable(district, results) {
  const table = document.getElementById('districtAnalysisTable');
  
  table.innerHTML = `
    <thead>
      <tr>
        <th colspan="5" style="text-align: center; background-color: #f0f0f0; padding: 15px; font-size: 1.1em;">
          Parameter Analysis for ${district}
          <br><small>Error Structure: |obs - fc| ≤ 0.1 (Correct), > 0.1 & ≤ 2 (Usable), > 2 (Unusable)</small>
        </th>
      </tr>
      <tr>
        <th>Parameter</th>
        <th>Correct (%)</th>
        <th>Usable (%)</th>
        <th>Unusable (%)</th>
        <th>Correct + Usable (%)</th>
      </tr>
    </thead>
    <tbody id="districtAnalysisBody"></tbody>
  `;

  const tbody = document.getElementById('districtAnalysisBody');
  tbody.innerHTML = '';

  results.forEach(result => {
    // Determine color based on Correct + Usable percentage
    let cellStyle = '';
    if (result.correctUsable >= 75) {
      cellStyle = 'background-color: #d4edda; color: #155724; font-weight: bold;'; // Green
    } else if (result.correctUsable > 50) {
      cellStyle = 'background-color: #fff3cd; color: #856404; font-weight: bold;'; // Yellow
    } else {
      cellStyle = 'background-color: #f8d7da; color: #721c24; font-weight: bold;'; // Red/Poor
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${result.parameter}</td>
      <td>${result.correct.toFixed(1)}%</td>
      <td>${result.usable.toFixed(1)}%</td>
      <td>${result.unusable.toFixed(1)}%</td>
      <td style="${cellStyle}">${result.correctUsable.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });

  console.log(`District analysis table completed for ${district}`);
}

// Enhanced error structure computation with parameter-specific thresholds (for summary table)
function computeErrorStructure(forecastMap, obsMap, dbColumn) {
  // Get all unique dates from both forecast and observation
  const allDates = new Set([
    ...Object.keys(forecastMap),
    ...Object.keys(obsMap)
  ]);
  
  let M = 0, N = 0, N1 = 0, N11 = 0, N3 = 0;
  
  allDates.forEach(date => {
    const fc = forecastMap[date] ? parseFloat(forecastMap[date][dbColumn]) : null;
    const obs = obsMap[date];
    
    if (fc == null || obs == null || isNaN(fc) || isNaN(obs)) {
      M++; // Missing data
      return;
    }
    
    N++; // Valid data pairs
    const absDiff = Math.abs(obs - fc);
    
    // Using your specific thresholds
    if (absDiff <= 0.1) {
      N1++; // Correct
    } else {
      N11++; // Not correct
      if (absDiff > 2) {
        N3++; // Unusable
      }
    }
  });
  
  const N2 = N11 - N3; // Usable but not correct
  
  const correct = N === 0 ? 0 : (N1 / N) * 100;
  const usable = N === 0 ? 0 : (N2 / N) * 100;
  const unusable = N === 0 ? 0 : (N3 / N) * 100;
  const correctUsable = correct + usable;
  
  return { 
    M, N, N1, N11, N2, N3, 
    correct, usable, unusable, correctUsable
  };
}

// Build district summary table for all districts (existing functionality)
async function buildDistrictSummaryTable(parameter) {
  console.log(`Building district summary table for parameter: ${parameter}`);
  
  const dbColumn = parameterMapping[parameter];
  const table = document.getElementById('districtSummaryTable');
  
  table.innerHTML = `
    <thead>
      <tr>
        <th colspan="6" style="text-align: center; background-color: #f0f0f0; padding: 10px;">
          District Summary for ${parameter}
          <br><small>Thresholds: |obs - fc| ≤ 0.1 (Correct), > 0.1 & ≤ 2 (Usable), > 2 (Unusable)</small>
        </th>
      </tr>
      <tr>
        <th>District</th>
        <th>Total Pairs</th>
        <th>Correct (%)</th>
        <th>Usable (%)</th>
        <th>Unusable (%)</th>
        <th>Correct+Usable (%)</th>
      </tr>
    </thead>
    <tbody id="districtSummaryBody"></tbody>
  `;
  
  const tbody = document.getElementById('districtSummaryBody');
  tbody.innerHTML = '';
  
  let overallStats = { totalPairs: 0, totalCorrect: 0, totalUsable: 0, totalUnusable: 0 };
  
  for (const district of districts) {
    try {
      console.log(`Processing district: ${district}`);
      
      // Fetch forecast data
      const { data: forecastData, error: forecastError } = await client
        .from('forecast_excel_uploads')
        .select(`forecast_date, district_name, ${dbColumn}`)
        .ilike('district_name', district)
        .not(dbColumn, 'is', null)
        .order('forecast_date');
      
      if (forecastError) {
        console.error(`Error fetching forecast data for ${district}:`, forecastError);
        continue;
      }

      // Fetch observation data
      const { data: observationData, error: observationError } = await client
        .from('observation_data_flat')
        .select(`forecast_date, district_name, ${dbColumn}`)
        .eq('district_name', district)
        .not(dbColumn, 'is', null)
        .order('forecast_date');
      
      if (observationError) {
        console.error(`Error fetching observation data for ${district}:`, observationError);
        continue;
      }

      // Build observation map
      const obsMap = {};
      (observationData || []).forEach(row => {
        const normalizedDate = normalizeDate(row.forecast_date);
        if (normalizedDate && row[dbColumn] != null && !isNaN(parseFloat(row[dbColumn]))) {
          obsMap[normalizedDate] = parseFloat(row[dbColumn]);
        }
      });

      // Build forecast map (keep last entry for each date)
      const forecastMap = {};
      (forecastData || []).forEach(fc => {
        const normalizedDate = normalizeDate(fc.forecast_date);
        if (normalizedDate && fc[dbColumn] != null && !isNaN(parseFloat(fc[dbColumn]))) {
          forecastMap[normalizedDate] = fc;
        }
      });

      // Compute error structure
      const stats = computeErrorStructure(forecastMap, obsMap, dbColumn);
      
      // Update overall statistics
      overallStats.totalPairs += stats.N;
      overallStats.totalCorrect += stats.N1;
      overallStats.totalUsable += stats.N2;
      overallStats.totalUnusable += stats.N3;

      // Determine row color based on performance
      let rowStyle = '';
      if (stats.correctUsable >= 75) {
        rowStyle = 'background-color: #d4edda;'; // Green - Good
      } else if (stats.correctUsable >= 50) {
        rowStyle = 'background-color: #fff3cd;'; // Yellow - Fair  
      } else {
        rowStyle = 'background-color: #f8d7da;'; // Red - Poor
      }

      // Add row to table
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${district}</td>
        <td>${stats.N}</td>
        <td>${stats.correct.toFixed(1)}%</td>
        <td>${stats.usable.toFixed(1)}%</td>
        <td>${stats.unusable.toFixed(1)}%</td>
        <td style="${rowStyle} font-weight: bold;">${stats.correctUsable.toFixed(1)}%</td>
      `;
      tbody.appendChild(tr);
      
    } catch (error) {
      console.error(`Error processing district ${district}:`, error);
    }
  }
  
  // Add overall summary row
  if (overallStats.totalPairs > 0) {
    const overallCorrect = (overallStats.totalCorrect / overallStats.totalPairs) * 100;
    const overallUsable = (overallStats.totalUsable / overallStats.totalPairs) * 100;
    const overallUnusable = (overallStats.totalUnusable / overallStats.totalPairs) * 100;
    const overallCorrectUsable = overallCorrect + overallUsable;
    
    let overallStyle = '';
    if (overallCorrectUsable >= 75) {
      overallStyle = 'background-color: #d4edda;';
    } else if (overallCorrectUsable >= 50) {
      overallStyle = 'background-color: #fff3cd;';
    } else {
      overallStyle = 'background-color: #f8d7da;';
    }
    
    const overallRow = document.createElement('tr');
    overallRow.style.borderTop = '2px solid #333';
    overallRow.style.fontWeight = 'bold';
    overallRow.innerHTML = `
      <td>OVERALL</td>
      <td>${overallStats.totalPairs}</td>
      <td>${overallCorrect.toFixed(1)}%</td>
      <td>${overallUsable.toFixed(1)}%</td>
      <td>${overallUnusable.toFixed(1)}%</td>
      <td style="${overallStyle}">${overallCorrectUsable.toFixed(1)}%</td>
    `;
    tbody.appendChild(overallRow);
  }
  
  table.style.display = 'table';
  console.log('District summary table completed');
}

// Helper function to show error messages
function showError(message) {
  const loadingMsg = document.getElementById('loadingMessage');
  const errorMsg = document.getElementById('errorMessage');
  const table = document.getElementById('comparisonTable');
  const summaryTable = document.getElementById('districtSummaryTable');
  
  if (loadingMsg) loadingMsg.style.display = 'none';
  if (table) table.style.display = 'none';
  if (summaryTable) summaryTable.style.display = 'none';
  
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
  } else {
    alert(message);
  }
}

// Helper function to show error messages for district analysis
function showError2(message) {
  const loadingMsg2 = document.getElementById('loadingMessage2');
  const errorMsg2 = document.getElementById('errorMessage2');
  const analysisTable = document.getElementById('districtAnalysisTable');
  
  if (loadingMsg2) loadingMsg2.style.display = 'none';
  if (analysisTable) analysisTable.style.display = 'none';
  
  if (errorMsg2) {
    errorMsg2.textContent = message;
    errorMsg2.style.display = 'block';
  } else {
    alert(message);
  }
}