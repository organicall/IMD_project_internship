// Supabase Setup
const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co';
const SUPABASE_KEY =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Fetch all rows for a given Supabase query by paging in chunks (default 1000).
 * This bypasses the PostgREST default max rows per request.
 *
 * baseQueryBuilder: a Supabase query with all filters/selects
applied, but without range/order.
 * orderByColumn: a stable column name to order by while paginating
(e.g., 'forecast_date').
 * isAscending: set to false for descending.
 * pageSize: typically 1000 (Supabase default limit per page).
 */
async function fetchAllRows(baseQueryBuilder, orderByColumn,
isAscending = true, pageSize = 1000) {
  const aggregatedRows = [];
  let offset = 0;
  // Defensive check
  if (!orderByColumn || typeof orderByColumn !== 'string') {
    throw new Error('fetchAllRows requires a valid orderByColumn');
  }

  // Loop until a page returns less than pageSize
  while (true) {
    const { data, error } = await baseQueryBuilder
      .order(orderByColumn, { ascending: isAscending })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) break;

    aggregatedRows.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return aggregatedRows;
}

// ------------------------------
// District name normalization
// ------------------------------
const CORRECT_DISTRICTS = [
  'ALLURI SITHARAMA RAJU', 'ANAKAPALLI', 'ANANTPUR', 'ANNAMAYYA', 'BAPATLA',
  'CHITTOOR', 'DR. B.R. AMBEDKAR KONASEEMA', 'EAST-GODAVARI', 'ELURU', 'GUNTUR',
  'KAKINADA', 'KRISHNA', 'KURNOOL', 'NANDYAL', 'NELLORE', 'NTR', 'PALNADU',
  'PARVATHIPURAM MANYAM', 'PRAKASAM', 'SRIKAKULAM', 'SRI SATHYA SAI',
'TIRUPATHI',
  'VISAKHAPATNAM', 'VIZIANAGARAM', 'WEST-GODAVARI', 'KADAPA'
];

const DISTRICT_ALIASES = {
  // Common variations -> canonical name
  'ANANTAPUR': 'ANANTPUR',
  'YSR KADAPA': 'KADAPA',
  'YSR': 'KADAPA',
  'YSR KADAP': 'KADAPA',
  'SPSR NELLORE': 'NELLORE',
  'SPSR-NELLORE': 'NELLORE',
  'WEST GODAVARI': 'WEST-GODAVARI',
  'VISAKHA': 'VISAKHAPATNAM',
  'VSKP': 'VISAKHAPATNAM',
  'VISAKHAPATANAM' : 'VISAKHAPATNAM'
};

function normalizeKey(name) {
  return name
    .toUpperCase()
    .trim()
    .replace(/\./g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9 ]/g, '') // remove other punctuation
    .trim();
}

const NORMALIZED_CORRECT_MAP = (() => {
  const map = new Map();
  for (const d of CORRECT_DISTRICTS) {
    map.set(normalizeKey(d), d);
  }
  return map;
})();

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function normalizeDistrictName(inputName) {
  if (!inputName) return '';
  const original = inputName.toString().trim();
  const upper = original.toUpperCase();

  // 1) Alias direct mapping
  if (DISTRICT_ALIASES[upper]) return DISTRICT_ALIASES[upper];

  // 2) Exact match against canonical list
  if (CORRECT_DISTRICTS.includes(upper)) return upper;

  // 3) Normalize keys and compare
  const key = normalizeKey(original);
  if (NORMALIZED_CORRECT_MAP.has(key)) return NORMALIZED_CORRECT_MAP.get(key);

  // 4) Fuzzy match via Levenshtein
  let best = null;
  let bestDist = Infinity;
  for (const d of CORRECT_DISTRICTS) {
    const dist = levenshteinDistance(key, normalizeKey(d));
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  // Accept close matches only (tuned threshold)
  if (best && (bestDist <= 3 || bestDist / Math.max(key.length, 1) <= 0.2)) {
    return best;
  }

  // 5) Fallback to upper-trimmed original if no good match found
  return upper;
}


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

// Large data handling: pagination state and workers
let forecastView = { data: [], pageIndex: 0, pageSize: 200 };
let observationView = { data: [], pageIndex: 0, pageSize: 200 };
let forecastWorker = null;
let observationWorker = null;


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
            normalizeDistrictName(row.district_name) === normalizeDistrictName(district) &&
            row.day_number === dayNumber
          );

          // Filter observation data for this district and day
          const observationData = processedObservationOutput.filter(row =>
            normalizeDistrictName(row.district_name) === normalizeDistrictName(district) &&
            row.day_number === dayNumber
          );

          if (forecastData.length > 0 && observationData.length > 0) {
            // Create comparison data for this parameter
            const comparisonData = createComparisonData(forecastData, observationData, parameter);
            const statistics = calculateStatistics(comparisonData, parameter); // This now uses parameter-specific thresholds
            if (parameter === 'rainfall') {
              // Use new rainfall scoring based on sums over matching cases (YY + NN)
              const matchingCases = (statistics.YY || 0) + (statistics.NN || 0);
              const denom = matchingCases;
              const newCorrect = denom > 0 ? (statistics.correctSum / denom) * 100 : 0;
              const newUsable = denom > 0 ? (statistics.usableSum / denom) * 100 : 0;
              const newUnusable = denom > 0 ? (statistics.unusableSum / denom) * 100 : 0;

              districtResult.parameters[parameter] = {
                correct: newCorrect,
                usable: newUsable,
                unusable: newUnusable,
                correctPlusUsable: newCorrect + newUsable,
                validDays: statistics.validDays,
                missingDays: statistics.missingDays,
                YY: statistics.YY,
                YN: statistics.YN,
                NY: statistics.NY,
                NN: statistics.NN,
                YU: statistics.YU,
                NU: statistics.NU,
                matchingCases: matchingCases,
                totalDays: statistics.totalDays,
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
                useN11ForUnusable: statistics.useN11ForUnusable
              };
            }
          } else {
            // No data available
            if (parameter === 'rainfall') {
              districtResult.parameters[parameter] = {
                correct: 0,
                usable: 0,
                unusable: 0,
                correctPlusUsable: 0,
                validDays: 0,
                missingDays: 0,
                YY: 0,
                YN: 0,
                NY: 0,
                NN: 0,
                YU: 0,
                NU: 0,
                matchingCases: 0,
                totalDays: 0,
                isRainfall: true
              };
            } else {
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

      // Store raw data globally for performance graphs
      window.lastComprehensiveData = [];

      // Store the raw forecast and observation data for the selected day
      const rawData = processedOutput.filter(row => row.day_number === dayNumber);
      const rawObservationData = processedObservationOutput.filter(row => row.day_number === dayNumber);

      console.log('Raw data for performance graphs:', {
        dayNumber: dayNumber,
        rawDataLength: rawData.length,
        rawObservationDataLength: rawObservationData.length,
        processedOutputLength: processedOutput.length,
        processedObservationOutputLength: processedObservationOutput.length
      });

      // Combine and format the data for performance analysis
      rawData.forEach(forecastRow => {
        const observationRow = rawObservationData.find(obs =>
          normalizeDistrictName(obs.district_name) === normalizeDistrictName(forecastRow.district_name)
        );

        if (observationRow) {
          window.lastComprehensiveData.push({
            day: day,
            district: forecastRow.district_name,
            rainfall: observationRow.rainfall,
            temp_max_c: observationRow.temp_max_c,
            temp_min_c: observationRow.temp_min_c,
            humidity_1: observationRow.humidity_1,
            humidity_2: observationRow.humidity_2,
            wind_speed_kmph: observationRow.wind_speed_kmph,
            wind_direction_deg: observationRow.wind_direction_deg,
            cloud_cover_octa: observationRow.cloud_cover_octa
          });
        }
      });

      console.log('Stored performance data:', window.lastComprehensiveData);

      // Also store in a more accessible location
      window.comprehensivePerformanceData = window.lastComprehensiveData;

      // Store in a global variable for easier access
      if (typeof window.globalComprehensiveData === 'undefined') {
        window.globalComprehensiveData = {};
      }
      window.globalComprehensiveData[day] = window.lastComprehensiveData;

      console.log('Global data storage:', window.globalComprehensiveData);

      // Display results
      displayComprehensiveResults(comprehensiveResults);

      document.getElementById('comprehensiveResultsSection').style.display = 'block';
      document.getElementById('graphSection').style.display = 'block';
      showComprehensiveStatus(`✅ Comprehensive analysis completed for ${day}. You can now generate performance graphs.`, 'success');

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
  let summaryHtml = `
    <div style="background: #f8f9fa; padding: 20px; border-radius:
10px; margin-bottom: 20px;">
      <h4>Analysis Summary for ${results.day}</h4>
      <p><strong>Total Districts Analyzed:</strong>${results.districts.length}</p>
      <p><strong>Parameters Analyzed:</strong>${results.parameters.length} (${Object.values(parameterNames).join(',')})</p>
      <p><strong>Note:</strong> Rainfall uses YY/YN/NY/NN methodology;
other parameters use threshold-based analysis</p>
    </div>
  `;

  // Add rainfall-specific summary for each district if rainfall is present
  if (results.parameters.includes('rainfall')) {
    summaryHtml += `<div style="margin-bottom: 10px;">
      <h5>Rainfall Statistical Summary (YY/YN/NY/NN):</h5>
      <table style="font-size: 12px; border-collapse: collapse;">
        <thead>
          <tr style="background: #e9ecef;">
            <th style="padding: 4px 8px; border: 1px solid #ccc;">District</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Missing Days</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Total Days</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Valid Days (N)</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">YY</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">YN</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">NY</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">NN</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Matching Cases (YY+NN)</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Correct (%)</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Usable (%)</th>
            <th style="padding: 4px 8px; border: 1px solid #ccc;">Unusable (%)</th>
          </tr>
        </thead>
        <tbody>`;
    results.districts.forEach(district => {
      const rain = district.parameters['rainfall'];
      if (rain) {
        summaryHtml += `<tr>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${district.district}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.missingDays}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.totalDays}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.validDays}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.YY}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.YN}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.NY}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.NN}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.matchingCases}</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.correct.toFixed(1)}%</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.usable.toFixed(1)}%</td>
          <td style="padding: 4px 8px; border: 1px solid #ccc;">${rain.unusable.toFixed(1)}%</td>
        </tr>`;
      }
    });
    summaryHtml += `</tbody></table></div>`;
  }

  summaryDiv.innerHTML = summaryHtml;

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
  "CHITTOOR", "DR. B.R. AMBEDKAR KONASEEMA", "EAST-GODAVARI", "ELURU", "GUNTUR",
  "KAKINADA", "KRISHNA", "KURNOOL", "NANDYAL", "NELLORE", "NTR", "PALNADU",
  "PARVATHIPURAM MANYAM", "PRAKASAM", "SRIKAKULAM", "SRI SATHYA SAI",
"TIRUPATHI",
  "VISAKHAPATNAM", "VIZIANAGARAM", "WEST-GODAVARI", "KADAPA"
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
    await refreshComprehensiveSheetsUI();

    const useSpecificSheetsComparison = document.getElementById('useSpecificSheetsComparison');
    const useSpecificSheetsComprehensive = document.getElementById('useSpecificSheetsComprehensive');

    if (useSpecificSheetsComparison) {
        useSpecificSheetsComparison.addEventListener('change', () => toggleSheetSelection('comparison'));
    }
    if (useSpecificSheetsComprehensive) {
        useSpecificSheetsComprehensive.addEventListener('change', () => toggleSheetSelection('comprehensive'));
    }
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('fileInput').addEventListener('change', handleFileUpload);
  document.getElementById('sheetNameInput').addEventListener('input', validateSheetName);
  // Add event listener for comprehensive sheet name validation
  const comprehensiveSheetNameInput = document.getElementById('comprehensiveSheetName');
  if (comprehensiveSheetNameInput) {
    comprehensiveSheetNameInput.addEventListener('input', validateComprehensiveSheetName);
  }
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

// Load existing sheet names for validation


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
function initForecastWorker() {
  if (!forecastWorker) {
    forecastWorker = new Worker('excel_worker.js');
  }
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  showStatus('📂 Reading Excel file...', 'info');

  initForecastWorker();
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      forecastWorker.onmessage = (msg) => {
        const { ok, rows, error } = msg.data || {};
        if (!ok) {
          showStatus('❌ Error reading Excel file: ' + (error || 'Unknown error'), 'error');
          return;
        }

        console.log('Raw Excel data (first 3):', rows.slice(0, 3));

        // Process and normalize the data in batches to keep UI responsive
        const batchSize = 2000;
        forecastRows = [];
        let index = 0;

        const processBatch = () => {
          const slice = rows.slice(index, index + batchSize);
          for (let i = 0; i < slice.length; i++) {
            const row = slice[i];
            const forecastDate = parseDate(row.forecast_date);
            if (!forecastDate) continue;
            const districtRaw = (row.district_name || '').toString().trim();
            const districtNormalized = normalizeDistrictName(districtRaw);
            const dateKey = formatDateYMD(forecastDate);
            forecastRows.push({
              district_name: districtNormalized,
              forecast_date: forecastDate,
              forecast_date_key: dateKey,
              rainfall: parseNullableFloat(row.rainfall),
              temp_max_c: parseNullableFloat(row.temp_max_c),
              temp_min_c: parseNullableFloat(row.temp_min_c),
              humidity_1: parseNullableFloat(row.humidity_1),
              humidity_2: parseNullableFloat(row.humidity_2),
              wind_speed_kmph: parseNullableFloat(row.wind_speed_kmph),
              wind_direction_deg: parseNullableFloat(row.wind_direction_deg),
              cloud_cover_octa: parseNullableFloat(row.cloud_cover_octa)
            });
          }
          index += batchSize;
          if (index < rows.length) {
            setTimeout(processBatch, 0);
          } else {
            // Final filter
            forecastRows = forecastRows.filter(r => r.district_name);

            if (forecastRows.length === 0) {
              showStatus('❌ No valid data found in the Excel file. Please check the format.', 'error');
              return;
            }

            showStatus(`✅ Successfully loaded ${forecastRows.length} forecast records.`, 'success');
          }
        };
        processBatch();
      };

      forecastWorker.postMessage({ type: 'parse', arrayBuffer: evt.target.result }, [evt.target.result]);
    } catch (error) {
      console.error('Error reading Excel file:', error);
      showStatus('❌ Error reading Excel file: ' + error.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function initObservationWorker() {
  if (!observationWorker) {
    observationWorker = new Worker('excel_worker.js');
  }
}

function handleObservationFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  showObservationStatus('📂 Reading Excel file...', 'info');

  initObservationWorker();
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      observationWorker.onmessage = (msg) => {
        const { ok, rows, error } = msg.data || {};
        if (!ok) {
          showObservationStatus('❌ Error reading Excel file: ' + (error || 'Unknown error'), 'error');
          return;
        }

        console.log('Raw Observation Excel data (first 3):', rows.slice(0, 3));

        // Process and normalize in batches
        const batchSize = 2000;
        observationRows = [];
        let index = 0;

        const processBatch = () => {
          const slice = rows.slice(index, index + batchSize);
          for (let i = 0; i < slice.length; i++) {
            const row = slice[i];
            const observationDate = parseDate(row.observation_date || row.forecast_date);
            if (!observationDate) continue;
            const districtRaw = (row.district_name || '').toString().trim();
            const districtNormalized = normalizeDistrictName(districtRaw);
            const dateKey = formatDateYMD(observationDate);
            observationRows.push({
              district_name: districtNormalized,
              observation_date: observationDate,
              observation_date_key: dateKey,
              rainfall: parseNullableFloat(row.rainfall),
              temp_max_c: parseNullableFloat(row.temp_max_c),
              temp_min_c: parseNullableFloat(row.temp_min_c),
              humidity_1: parseNullableFloat(row.humidity_1),
              humidity_2: parseNullableFloat(row.humidity_2),
              wind_speed_kmph: parseNullableFloat(row.wind_speed_kmph),
              wind_direction_deg: parseNullableFloat(row.wind_direction_deg),
              cloud_cover_octa: parseNullableFloat(row.cloud_cover_octa)
            });
          }
          index += batchSize;
          if (index < rows.length) {
            setTimeout(processBatch, 0);
          } else {
            observationRows = observationRows.filter(r => r.district_name);

            if (observationRows.length === 0) {
              showObservationStatus('❌ No valid data found in the Excel file. Please check the format.', 'error');
              return;
            }

            showObservationStatus(`✅ Successfully loaded ${observationRows.length} observation records.`, 'success');
          }
        };
        processBatch();
      };

      observationWorker.postMessage({ type: 'parse', arrayBuffer: evt.target.result }, [evt.target.result]);
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
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${m}/${d}/${y}`; // fast MM/DD/YYYY
}

function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`; // YYYY-MM-DD for stable keys and comparisons
}

// Check if date is a holiday
function isHoliday(dateStr, holidays) {
  return holidays.includes(dateStr);
}

// Process forecast data and allocate days
async function processForecast() {
  if (forecastRows.length === 0) {
    showStatus('❌ No forecast data loaded. Please upload a file first.', 'error');
    return;
  }

  // Show memory warning for large datasets
  if (forecastRows.length > 10000) {
    const warning = document.createElement('div');
    warning.className = 'memory-warning';
    warning.innerHTML = `
      <strong>⚠️ Large Dataset Detected:</strong>
      Processing ${forecastRows.length.toLocaleString()} records.
      This may take several minutes. The browser will remain responsive.
    `;
    document.getElementById('loadingIndicator').insertAdjacentElement('beforebegin', warning);
  }

  showStatus(`🔄 Processing ${forecastRows.length.toLocaleString()} forecast records...`, 'info');
  document.getElementById('loadingIndicator').classList.add('show');

  // Create progress indicator for large datasets
  let progressContainer = null;
  if (forecastRows.length > 5000) {
    progressContainer = createProgressIndicator('Processing forecast data...');
    document.getElementById('loadingIndicator').insertAdjacentElement('beforebegin', progressContainer);
  }

  try {
    const holidaysInput = document.getElementById('holidayInput').value; const holidays = holidaysInput
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
    const uniqueDistricts = [...new Set(forecastRows.map(row => normalizeDistrictName(row.district_name)))];
    console.log('Districts found:', uniqueDistricts);

    // 4. Create a lookup map for faster data access (chunked)
    const dataLookup = {};
    const lookupBatch = 5000;
    for (let i = 0; i < forecastRows.length; i++) {
      const row = forecastRows[i];
      const key = `${row.district_name}|${row.forecast_date_key}`;
      dataLookup[key] = row; // Keep the latest entry for each district-date combination

      // Update progress for large datasets
      if (progressContainer && i % lookupBatch === 0) {
        const progress = Math.round((i / forecastRows.length) * 50);
// First 50% of progress
        updateProgressIndicator(progressContainer, progress, 'Creating data lookup...');
      }

      if (i % lookupBatch === 0 && i > 0) {
        // Yield to the UI
        await new Promise(r => setTimeout(r, 0));
      }
    }

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
    // 6. Generate outputs in batches to keep UI responsive
    const batchTarget = 5000; // target number of output rows per yield
    let generatedSinceYield = 0;
    for (let dIdx = 0; dIdx < uniqueDistricts.length; dIdx++) {
      const district = uniqueDistricts[dIdx];
      for (let fIdx = 0; fIdx < forecastDates.length; fIdx++) {
        const forecastDate = forecastDates[fIdx];
        let adjustedForecastDate = new Date(forecastDate);
        if (isHoliday(formatDate(forecastDate), holidays)) {
          adjustedForecastDate.setDate(adjustedForecastDate.getDate() - 1);
        }
        for (let i = 1; i <= 5; i++) {
          let forecastedDate = new Date(adjustedForecastDate);
          forecastedDate.setDate(forecastedDate.getDate() + i);
          if (forecastedDate >= firstDate && forecastedDate <= lastDate) {
            const lookupKey =`${district.toUpperCase().trim()}|${formatDateYMD(forecastedDate)}`;
            const matchingRow = dataLookup[lookupKey];
            output.push({
              forecasted_date: formatDate(forecastedDate),
              day: 'Day' + i,
              day_number: i,
              forecast_taken_on: formatDate(adjustedForecastDate),
              forecast_date: formatDate(forecastedDate),
              district_name: district,
              rainfall: matchingRow ? matchingRow.rainfall : null,
              temp_max_c: matchingRow ? matchingRow.temp_max_c : null,
              temp_min_c: matchingRow ? matchingRow.temp_min_c : null,
              humidity_1: matchingRow ? matchingRow.humidity_1 : null,
              humidity_2: matchingRow ? matchingRow.humidity_2 : null,
              wind_speed_kmph: matchingRow ? matchingRow.wind_speed_kmph : null,
              wind_direction_deg: matchingRow ? matchingRow.wind_direction_deg : null,
              cloud_cover_octa: matchingRow ? matchingRow.cloud_cover_octa : null
            });
            generatedSinceYield++;
            if (generatedSinceYield >= batchTarget) {
              showStatus(`🔄 Processing... ${output.length} rows generated`, 'info');
              await new Promise(r => setTimeout(r, 0));
              generatedSinceYield = 0;
            }
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

async function processObservation() {
    if (observationRows.length === 0) {
      showObservationStatus('❌ No observation data loaded. Please upload a file first.', 'error');
      return;
    }

    showObservationStatus('🔄 Processing observation allocation...', 'info');

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
        const uniqueDistricts = [...new Set(observationRows.map(row => normalizeDistrictName(row.district_name)))];
        console.log('Districts found in observation:', uniqueDistricts);

        // 4. Create a lookup map for faster data access (chunked)
        const dataLookup = {};
        const lookupBatch = 5000;
        for (let i = 0; i < observationRows.length; i++) {
          const row = observationRows[i];
          const key = `${row.district_name}|${row.observation_date_key}`;
          dataLookup[key] = row;
          if (i % lookupBatch === 0 && i > 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }

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
        // 6. Generate outputs in batches to keep UI responsive
        const batchTarget = 5000;
        let generatedSinceYield = 0;
        for (let dIdx = 0; dIdx < uniqueDistricts.length; dIdx++) {
          const district = uniqueDistricts[dIdx];
          for (let fIdx = 0; fIdx < forecastDates.length; fIdx++) {
            const forecastDate = forecastDates[fIdx];
            let adjustedForecastDate = new Date(forecastDate);
            if (isHoliday(formatDate(forecastDate), holidays)) {
              adjustedForecastDate.setDate(adjustedForecastDate.getDate() - 1);
            }
            for (let i = 1; i <= 5; i++) {
              let forecastedDate = new Date(adjustedForecastDate);
              forecastedDate.setDate(forecastedDate.getDate() + i);
              if (forecastedDate >= firstDate && forecastedDate <= lastDate) {
                const lookupKey = `${district.toUpperCase().trim()}|${formatDateYMD(forecastedDate)}`;
                const matchingRow = dataLookup[lookupKey];
                output.push({
                  forecasted_date: formatDate(forecastedDate),
                  day: 'Day' + i,
                  day_number: i,
                  forecast_taken_on: formatDate(adjustedForecastDate),
                  observation_date: formatDate(forecastedDate),
                  district_name: district,
                  rainfall: matchingRow ? matchingRow.rainfall : null,
                  temp_max_c: matchingRow ? matchingRow.temp_max_c : null,
                  temp_min_c: matchingRow ? matchingRow.temp_min_c : null,
                  humidity_1: matchingRow ? matchingRow.humidity_1 : null,
                  humidity_2: matchingRow ? matchingRow.humidity_2 : null,
                  wind_speed_kmph: matchingRow ? matchingRow.wind_speed_kmph : null,
                  wind_direction_deg: matchingRow ? matchingRow.wind_direction_deg : null,
                  cloud_cover_octa: matchingRow ? matchingRow.cloud_cover_octa : null
                });
                generatedSinceYield++;
                if (generatedSinceYield >= batchTarget) {
                  showObservationStatus(`🔄 Processing... ${output.length} rows generated`, 'info');
                  await new Promise(r => setTimeout(r, 0));
                  generatedSinceYield = 0;
                }
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
        showObservationStatus('❌ Error processing observation: ' +
error.message, 'error');
      }
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
      const filtered = processedObservationOutput.filter(row =>
row.day === dayName);
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
  // Save full dataset to view with pagination
  forecastView.data = data;
  forecastView.pageIndex = 0;
  currentDisplayedData = getForecastPage();

  ensureForecastSectionAndRender();
}

function getForecastPage() {
  const { data, pageIndex, pageSize } = forecastView;
  const start = pageIndex * pageSize;
  return data.slice(start, start + pageSize);
}

function ensureForecastSectionAndRender() {
  let forecastResultsSection = document.getElementById('resultsSection');
  if (!forecastResultsSection) {
    forecastResultsSection = document.createElement('div');
    forecastResultsSection.id = 'resultsSection';
    forecastResultsSection.className = 'section';
    const filterSection = document.getElementById('filterSection');
    if (filterSection) filterSection.insertAdjacentElement('afterend',
forecastResultsSection);
  }

  const total = forecastView.data.length;
  if (total === 0) {
    forecastResultsSection.innerHTML = `
      <h2>📊 Processed Forecast Data</h2>
      <p>No data to display.</p>
    `;
    return;
  }

  const pageData = getForecastPage();
  currentDisplayedData = pageData;
  const totalPages = Math.ceil(total / forecastView.pageSize) || 1;
  const page = forecastView.pageIndex + 1;

  let html = `
    <h2>📊 Processed Forecast Data</h2>
    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px; gap: 12px; flex-wrap: wrap;">
      <div><strong>Total Records: ${total}</strong> · Showing ${pageData.length} rows</div>
      <div>
        <button class="btn" onclick="changeForecastPage('first')" ${page <= 1 ? 'disabled' : ''}>⏮ First</button>
        <button class="btn" onclick="changeForecastPage('prev')" ${page <= 1 ? 'disabled' : ''}>◀ Prev</button>
        <span style="margin: 0 8px;">Page ${page} / ${totalPages}</span>
        <button class="btn" onclick="changeForecastPage('next')" ${page >= totalPages ? 'disabled' : ''}>Next ▶</button>
        <button class="btn" onclick="changeForecastPage('last')" ${page >= totalPages ? 'disabled' : ''}>Last ⏭</button>
      </div>
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

  for (let row of pageData) {
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

function changeForecastPage(action) {
  const totalPages = Math.ceil(forecastView.data.length /
forecastView.pageSize) || 1;
  if (action === 'first') forecastView.pageIndex = 0;
  else if (action === 'prev') forecastView.pageIndex = Math.max(0,
forecastView.pageIndex - 1);
  else if (action === 'next') forecastView.pageIndex =
Math.min(totalPages - 1, forecastView.pageIndex + 1);
  else if (action === 'last') forecastView.pageIndex = totalPages - 1;
  ensureForecastSectionAndRender();
}

function renderObservationTable(data) {
  observationView.data = data;
  observationView.pageIndex = 0;
  currentDisplayedObservationData = getObservationPage();
  ensureObservationSectionAndRender();
}

function getObservationPage() {
  const { data, pageIndex, pageSize } = observationView;
  const start = pageIndex * pageSize;
  return data.slice(start, start + pageSize);
}

function ensureObservationSectionAndRender() {
  let observationResultsSection =
document.getElementById('observationResultsSection');
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
      <div style="margin-top: 20px;" id="observationExportButtons">
        <button class="btn" onclick="exportCurrentObservationView()">📁 Export Current View</button>
        <button class="btn" onclick="exportObservationToExcel('All')">📁 Export All</button>
        <button class="btn" onclick="exportObservationToExcel('Day1')">📁 Export Day 1</button>
        <button class="btn" onclick="exportObservationToExcel('Day2')">📁 Export Day 2</button>
        <button class="btn"
onclick="exportObservationToExcel('Day3')">📁 Export Day 3</button>
        <button class="btn"
onclick="exportObservationToExcel('Day4')">📁 Export Day 4</button>
        <button class="btn"
onclick="exportObservationToExcel('Day5')">📁 Export Day 5</button>
      </div>
    `;
    const observationUploadSection =
document.querySelector('.section:has(#observationFileInput)');
    if (observationUploadSection) {
      observationUploadSection.insertAdjacentElement('afterend',
observationResultsSection);
    }
  }

  observationResultsSection.style.display = 'block';
  const resultDiv = document.getElementById('observationResult');

  const total = observationView.data.length;
  if (total === 0) {
    resultDiv.innerHTML = '<p>No observation data to display.</p>';
    return;
  }

  const pageData = getObservationPage();
  currentDisplayedObservationData = pageData;
  const totalPages = Math.ceil(total / observationView.pageSize) || 1;
  const page = observationView.pageIndex + 1;

  let html = `
    <div style=\"display:flex; justify-content: space-between;
align-items:center; margin-bottom: 10px; gap: 12px; flex-wrap:
wrap;\">
      <div><strong>Total Observation Records: ${total}</strong> ·
Showing ${pageData.length} rows</div>
      <div>
        <button class=\"btn\"
onclick=\"changeObservationPage('first')\" ${page <= 1 ? 'disabled' :
''}>⏮ First</button>
        <button class=\"btn\"
onclick=\"changeObservationPage('prev')\" ${page <= 1 ? 'disabled' :
''}>◀ Prev</button>
        <span style=\"margin: 0 8px;\">Page ${page} / ${totalPages}</span>
        <button class=\"btn\"
onclick=\"changeObservationPage('next')\" ${page >= totalPages ?
'disabled' : ''}>Next ▶</button>
        <button class=\"btn\"
onclick=\"changeObservationPage('last')\" ${page >= totalPages ?
'disabled' : ''}>Last ⏭</button>
      </div>
    </div>
    <div style="max-height: 500px; overflow: auto; border: 1px solid
#ccc; border-radius: 8px;">
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

  for (let row of pageData) {
    html += `<tr>
      <td>${row.forecasted_date}</td>
      <td><span style="background: linear-gradient(45deg, #28a745,
#20c997); color: white; padding: 4px 8px; border-radius: 15px;
font-size: 12px;">${row.day}</span></td>
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

function changeObservationPage(action) {
  const totalPages = Math.ceil(observationView.data.length /
observationView.pageSize) || 1;
  if (action === 'first') observationView.pageIndex = 0;
  else if (action === 'prev') observationView.pageIndex = Math.max(0,
observationView.pageIndex - 1);
  else if (action === 'next') observationView.pageIndex =
Math.min(totalPages - 1, observationView.pageIndex + 1);
  else if (action === 'last') observationView.pageIndex = totalPages - 1;
  ensureObservationSectionAndRender();
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
    const dayTypes = [...new
Set(currentDisplayedObservationData.map(row => row.day))];
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
    showObservationStatus('❌ Error exporting current view: ' +
error.message, 'error');
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
      dataToExport = processedObservationOutput.filter(row => row.day
=== dayFilter);
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
    showObservationStatus(`✅ Observation data exported to
${filename}`, 'success');

  } catch (error) {
    console.error('Export error:', error);
    showObservationStatus('❌ Error exporting observation data: ' +
error.message, 'error');
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

    showStatus(`✅ Successfully saved ${dbData.length} records to
database with sheet name "${sheetName}".`, 'success');

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
    normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
    row.day === day
  );

  // Update the database query to include day_number filter
  const dayNumber = parseInt(day.replace('Day', ''));
  const { data: dbData, error } = await client
    .from('full_forecast')
    .select(`forecast_date, district_name, day_number, ${dbColumn}, sheet_name`)
    // Use ilike for broad match but filter client-side with normalized names
    .ilike('district_name', `%${district}%`)
    .eq('day_number', dayNumber)
    .not(dbColumn, 'is', null)
    .order('forecast_date');

    if (error) {
      throw error;
    }

    // Build verification results
    const verificationResults = buildVerificationTable(currentData,
dbData, parameter, dbColumn);
    displayVerificationResults(verificationResults, district, parameter);

    showStatus(`✅ Verification completed for ${district} -
${parameter}.`, 'success');

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
    <div style="display: grid; grid-template-columns: repeat(auto-fit,
minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
      <div style="background: #d4edda; padding: 15px; border-radius:
10px; text-align: center;">
        <h4 style="color: #155724; margin: 0;">Matches</h4>
        <div style="font-size: 24px; font-weight: bold; color:
#155724;">${results.matches}</div>
      </div>
      <div style="background: #f8d7da; padding: 15px; border-radius:
10px; text-align: center;">
        <h4 style="color: #721c24; margin: 0;">Differences</h4>
        <div style="font-size: 24px; font-weight: bold; color:
#721c24;">${results.differences}</div>
      </div>
      <div style="background: #d1ecf1; padding: 15px; border-radius:
10px; text-align: center;">
        <h4 style="color: #0c5460; margin: 0;">New Entries</h4>
        <div style="font-size: 24px; font-weight: bold; color:
#0c5460;">${results.newEntries}</div>
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
      <td><span style="${statusStyle} padding: 4px 8px; border-radius:
15px; font-size: 12px; font-weight: bold;">${statusText}</span></td>
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



// ===================== Forecast vs Observation Comparison Workflow =====================
/**
 * Part: Forecast vs Observation Comparison
 * Function: performComparison
 * Purpose: Orchestrate the comparison flow for a selected day,
district, and parameter.
 * Inputs: UI selections (day, district, parameter, date range/sheet options)
 * Output: Populates global comparisonResults and triggers
displayComparisonResults.
 * Preceded by: Data loading utilities (validateDateRange,
loadDataBySheets, load*ByDateRange)
 * Followed by: createComparisonData ->
calculateStatistics/calculateRainfallStatistics ->
displayComparisonResults -> (optional) exportComparisonToExcel
 */
async function performComparison() {
  const day = document.getElementById('comparisonDay').value;
  const district = document.getElementById('comparisonDistrict').value;
  const parameter = document.getElementById('comparisonParameter').value;
  const useDateRange =
document.getElementById('useDateRangeComparison').checked;
  const useSpecificSheets =
document.getElementById('useSpecificSheetsComparison').checked;
  const startDate = document.getElementById('comparisonStartDate').value;
  const endDate = document.getElementById('comparisonEndDate').value;

  if (!day || !district || !parameter) {
    showComparisonStatus('❌ Please select day, district, and parameter for comparison.', 'error');
    return;
  }

  let forecastData, observationData;

  try {
    if (useSpecificSheets) {
            // Use specific sheets
      const sheetSelection = validateSheetSelection('comparison');

      if (!sheetSelection.isValid) {
        if (sheetSelection.forecastCount === 0) {
          showComparisonStatus('❌ Please select at least one forecast sheet.', 'error');
        } else {
          showComparisonStatus('❌ Please select at least one observation sheet.', 'error');
        }
        return;
      }

      const forecastSheets = sheetSelection.forecastSheets;
      const observationSheets = sheetSelection.observationSheets;

      showComparisonStatus('🔍 Loading data from selected sheets...', 'info');

      const dateRangeStart = useDateRange ? startDate : null;
      const dateRangeEnd = useDateRange ? endDate : null;

      if (useDateRange) {
        const validation = validateDateRange(startDate, endDate);
        if (!validation.valid) {
          showComparisonStatus('❌ ' + validation.message, 'error');
          return;
        }
      }

      const { forecastData: dbForecastData, observationData:
dbObservationData } =
        await loadDataBySheets(forecastSheets, observationSheets,
dateRangeStart, dateRangeEnd);

      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = dbForecastData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

      observationData = dbObservationData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

    } else if (useDateRange) {
      // Use date range with all data
      const validation = validateDateRange(startDate, endDate);
      if (!validation.valid) {
        showComparisonStatus('❌ ' + validation.message, 'error');
        return;
      }

      showComparisonStatus('🔍 Loading data from database for date range...', 'info');

      const [dbForecastData, dbObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = dbForecastData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

      observationData = dbObservationData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

    } else {
      // Use existing processed data
      if (processedOutput.length === 0) {
        showComparisonStatus('❌ No forecast data available. Please process forecast data first or enable date range/sheet selection.',
'error');
        return;
      }

      if (processedObservationOutput.length === 0) {
        showComparisonStatus('❌ No observation data available. Please process observation data first or enable date range/sheet selection.',
'error');
        return;
      }

      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = processedOutput.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

      observationData = processedObservationOutput.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
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

    // Create comparison results
    const comparisonData = createComparisonData(forecastData,
observationData, parameter);
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
        useSpecificSheets: useSpecificSheets,
        forecastSheets: useSpecificSheets ? forecastSheets : null,
        observationSheets: useSpecificSheets ? observationSheets : null,
        startDate: startDate,
        endDate: endDate
      }
    };

    // Display results
    displayComparisonResults(comparisonData, statistics, day,
district, parameter);

    document.getElementById('comparisonResultsSection').style.display = 'block';

    const analysisType = useSpecificSheets ? 'specific sheets' :
useDateRange ? `date range (${startDate} to ${endDate})` : 'processed data';
    showComparisonStatus(`✅ Comparison analysis completed for
${district} - ${parameter} - ${day} using ${analysisType}.`,
'success');

  } catch (error) {
    console.error('Comparison error:', error);
    showComparisonStatus('❌ Comparison error: ' + error.message, 'error');
  }
}

// Export Rainfall Correct/Usable/Unusable for all Days × Districts using FvO logic
async function computeAllDaysAllDistrictsRainfallFromFvO() {
  try {
    const days = [1,2,3,4,5];

    // Require user to select specific sheets under the comparison section
    const sheetSelection = validateSheetSelection('comparison');
    if (!sheetSelection.isValid) {
      alert('Please select at least one Forecast sheet and one Observation sheet (Use Specific Sheets).');
      return;
    }

    // Pull distinct districts limited to the selected forecast sheets
    const { data: districtsData, error: dErr } = await client
      .from('full_forecast')
      .select('district_name')
      .in('sheet_name', sheetSelection.forecastSheets)
      .not('district_name','is',null);
    if (dErr) throw dErr;
    const districts = [...new Set((districtsData||[]).map(r =>
r.district_name).filter(Boolean))].sort();

    // Fetch all rainfall pairs up front
    const fcQuery = client
      .from('full_forecast')
      .select('day_number, district_name, forecast_date, rainfall')
      .in('day_number', days)
      .in('sheet_name', sheetSelection.forecastSheets);
    const obsQuery = client
      .from('full_observation')
      .select('day_number, district_name, observation_date, rainfall')
      .in('day_number', days)
      .in('sheet_name', sheetSelection.observationSheets);

    const [fcRows, obsRows] = await Promise.all([
      fetchAllRows(fcQuery, 'forecast_date', true),
      fetchAllRows(obsQuery, 'observation_date', true)
    ]);

    // Group by day/district
    const fcMap = {};
    fcRows.forEach(r => {
      const d = r.day_number, dist = r.district_name;
      if (!fcMap[d]) fcMap[d] = {};
      if (!fcMap[d][dist]) fcMap[d][dist] = [];
      fcMap[d][dist].push({ forecast_date: r.forecast_date, rainfall:
r.rainfall });
    });
    const obsMap = {};
    obsRows.forEach(r => {
      const d = r.day_number, dist = r.district_name;
      if (!obsMap[d]) obsMap[d] = {};
      if (!obsMap[d][dist]) obsMap[d][dist] = [];
      obsMap[d][dist].push({ observation_date: r.observation_date,
rainfall: r.rainfall });
    });

    // Build result rows and global map for reuse in All Days Comprehensive view
    const resultRows = [];
    if (!window.fvoRainfallMap) window.fvoRainfallMap = {};
    // Reset map
    window.fvoRainfallMap = {};
    for (const day of days) {
      for (const dist of districts) {
        const fcArr = (fcMap[day] && fcMap[day][dist]) ? fcMap[day][dist] : [];
        const obArr = (obsMap[day] && obsMap[day][dist]) ?
obsMap[day][dist] : [];
        if (fcArr.length === 0 && obArr.length === 0) {
          resultRows.push({ Day: `Day ${day}`, District: dist,
Correct: '-', Usable: '-', Unusable: '-', CorrectUsable: '-' });
          if (!window.fvoRainfallMap[day]) window.fvoRainfallMap[day] = {};
          window.fvoRainfallMap[day][dist] = null;
          continue;
        }
        const { correct, usable, unusable, correctPlusUsable } =
computeRainfallCUUFromPairs(fcArr, obArr);
        if (!window.fvoRainfallMap[day]) window.fvoRainfallMap[day] = {};
        window.fvoRainfallMap[day][dist] = { correct, usable,
unusable, correctPlusUsable };
        resultRows.push({
          Day: `Day ${day}`,
          District: dist,
          Correct: isNaN(correct) ? '-' : correct.toFixed(1)+"%",
          Usable: isNaN(usable) ? '-' : usable.toFixed(1)+"%",
          Unusable: isNaN(unusable) ? '-' : unusable.toFixed(1)+"%",
          CorrectUsable: isNaN(correctPlusUsable) ? '-' :
correctPlusUsable.toFixed(1)+"%"
        });
      }
    }

    // Render to page
    const section = document.getElementById('rainfallAllDaysResultsSection');
    const summary = document.getElementById('rainfallAllDaysSummary');
    const tableDiv = document.getElementById('rainfallAllDaysTable');
    if (section) section.style.display = 'none';

    summary.innerHTML = `<div
style="background:#f8f9fa;padding:10px;border-radius:8px;">Computed
using Forecast vs Observation rainfall formula for all districts and
days.</div>`;

    // Build HTML table
    let html = '<table style="width:100%;font-size:12px;">';
    html += '<thead><tr><th>Day</th><th>District</th><th>Correct</th><th>Usable</th><th>Unusable</th><th>Correct+Usable</th></tr></thead><tbody>';
    resultRows.forEach(r => {
      html += `<tr>
        <td>${r.Day}</td>
        <td>${r.District}</td>
        <td>${r.Correct}</td>
        <td>${r.Usable}</td>
        <td>${r.Unusable}</td>
        <td>${r.CorrectUsable}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
    if (section) section.style.display = 'block';
  } catch (e) {
    alert('Compute failed: ' + e.message);
    console.error('computeAllDaysAllDistrictsRainfallFromFvO error:', e);
  }
}

function exportRainfallAllDaysAllDistrictsComputed() {
  try {
    const table = document.getElementById('rainfallAllDaysTable');
    if (!table || !table.querySelector('table')) {
      alert('No computed rainfall results to export.');
      return;
    }
    // Extract from DOM table into JSON
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const tds = tr.querySelectorAll('td');
      return {
        Day: tds[0]?.textContent || '',
        District: tds[1]?.textContent || '',
        Correct: tds[2]?.textContent || '',
        Usable: tds[3]?.textContent || '',
        Unusable: tds[4]?.textContent || '',
        CorrectUsable: tds[5]?.textContent || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rainfall_All_Days_Districts');
    XLSX.writeFile(wb, 'Rainfall_FvO_AllDays_Districts.xlsx');
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}

// Compute Rainfall Statistical Summary metrics (RS, HK, FAR, POD, CSI, HSS, MR, C NON, BAIS, PC)
// for all Days × Districts using FvO logic and display as a table
async function computeAllDaysAllDistrictsRainfallStatsFromFvO() {
  try {
    const days = [1,2,3,4,5];

    // Require user to select specific sheets under the comparison section
    const sheetSelection = validateSheetSelection('comparison');
    if (!sheetSelection.isValid) {
      alert('Please select at least one Forecast sheet and one Observation sheet (Use Specific Sheets).');
      return;
    }

    // Pull distinct districts limited to the selected forecast sheets
    const { data: districtsData, error: dErr } = await client
      .from('full_forecast')
      .select('district_name')
      .in('sheet_name', sheetSelection.forecastSheets)
      .not('district_name','is',null);
    if (dErr) throw dErr;
    const districts = [...new Set((districtsData||[]).map(r =>
r.district_name).filter(Boolean))].sort();

    // Fetch all rainfall pairs up front
    const fcQuery = client
      .from('full_forecast')
      .select('day_number, district_name, forecast_date, rainfall')
      .in('day_number', days)
      .in('sheet_name', sheetSelection.forecastSheets);
    const obsQuery = client
      .from('full_observation')
      .select('day_number, district_name, observation_date, rainfall')
      .in('day_number', days)
      .in('sheet_name', sheetSelection.observationSheets);

    const [fcRows, obsRows] = await Promise.all([
      fetchAllRows(fcQuery, 'forecast_date', true),
      fetchAllRows(obsQuery, 'observation_date', true)
    ]);

    // Group by day/district
    const fcMap = {};
    fcRows.forEach(r => {
      const d = r.day_number, dist = r.district_name;
      if (!fcMap[d]) fcMap[d] = {};
      if (!fcMap[d][dist]) fcMap[d][dist] = [];
      fcMap[d][dist].push({ forecast_date: r.forecast_date, rainfall:
r.rainfall });
    });
    const obsMap = {};
    obsRows.forEach(r => {
      const d = r.day_number, dist = r.district_name;
      if (!obsMap[d]) obsMap[d] = {};
      if (!obsMap[d][dist]) obsMap[d][dist] = [];
      obsMap[d][dist].push({ observation_date: r.observation_date,
rainfall: r.rainfall });
    });

    // Build result rows
    const resultRows = [];
    for (const day of days) {
      for (const dist of districts) {
        const fcArr = (fcMap[day] && fcMap[day][dist]) ? fcMap[day][dist] : [];
        const obArr = (obsMap[day] && obsMap[day][dist]) ?
obsMap[day][dist] : [];

        if (fcArr.length === 0 && obArr.length === 0) {
          resultRows.push({
            Day: `Day ${day}`,
            District: dist,
            RS: '-', HK: '-', FAR: '-', POD: '-', CSI: '-', HSS: '-',
MR: '-', CNON: '-', BAIS: '-', PC: '-'
          });
          continue;
        }

        const comp = createComparisonData(fcArr, obArr, 'rainfall');
        const statistics = calculateRainfallStatistics(comp);

        resultRows.push({
          Day: `Day ${day}`,
          District: dist,
          RS: isNaN(statistics.rs) ? '-' : statistics.rs.toFixed(2) + '%',
          HK: isNaN(statistics.hk) ? '-' : statistics.hk.toFixed(3),
          FAR: isNaN(statistics.far) ? '-' : statistics.far.toFixed(3),
          POD: isNaN(statistics.pod) ? '-' : statistics.pod.toFixed(3),
          CSI: isNaN(statistics.csi) ? '-' : statistics.csi.toFixed(3),
          HSS: isNaN(statistics.hss) ? '-' : statistics.hss.toFixed(3),
          MR: isNaN(statistics.mr) ? '-' : statistics.mr.toFixed(3),
          CNON: isNaN(statistics.cnon) ? '-' : statistics.cnon.toFixed(3),
          BAIS: isNaN(statistics.bias) ? '-' : statistics.bias.toFixed(3),
          PC: isNaN(statistics.pc) ? '-' : statistics.pc.toFixed(2) + '%'
        });
      }
    }

    // Render to page
    const section = document.getElementById('rainfallAllDaysStatsSection');
    const summary = document.getElementById('rainfallAllDaysStatsSummary');
    const tableDiv = document.getElementById('rainfallAllDaysStatsTable');
    if (section) section.style.display = 'none';

    summary.innerHTML = `<div
style="background:#f8f9fa;padding:10px;border-radius:8px;">Computed
using Rainfall Statistical Summary metrics for all districts and
days.</div>`;

    // Build HTML table
    let html = '<table style="width:100%;font-size:12px;">';
    html += '<thead><tr><th>Day</th><th>District</th><th>RS</th><th>H.K.Score</th><th>FAR</th><th>POD</th><th>CSI</th><th>HSS</th><th>MR</th><th>C NON</th><th>BAIS</th><th>PC</th></tr></thead><tbody>';
    resultRows.forEach(r => {
      html += `<tr>
        <td>${r.Day}</td>
        <td>${r.District}</td>
        <td>${r.RS}</td>
        <td>${r.HK}</td>
        <td>${r.FAR}</td>
        <td>${r.POD}</td>
        <td>${r.CSI}</td>
        <td>${r.HSS}</td>
        <td>${r.MR}</td>
        <td>${r.CNON}</td>
        <td>${r.BAIS}</td>
        <td>${r.PC}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
    if (section) section.style.display = 'block';
  } catch (e) {
    alert('Compute failed: ' + e.message);
    console.error('computeAllDaysAllDistrictsRainfallStatsFromFvO error:', e);
  }
}

function exportRainfallAllDaysAllDistrictsStats() {
  try {
    const table = document.getElementById('rainfallAllDaysStatsTable');
    if (!table || !table.querySelector('table')) {
      alert('No statistical summary to export.');
      return;
    }
    // Extract from DOM table into JSON
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const tds = tr.querySelectorAll('td');
      return {
        Day: tds[0]?.textContent || '',
        District: tds[1]?.textContent || '',
        RS: tds[2]?.textContent || '',
        HK: tds[3]?.textContent || '',
        FAR: tds[4]?.textContent || '',
        POD: tds[5]?.textContent || '',
        CSI: tds[6]?.textContent || '',
        HSS: tds[7]?.textContent || '',
        MR: tds[8]?.textContent || '',
        CNON: tds[9]?.textContent || '',
        BAIS: tds[10]?.textContent || '',
        PC: tds[11]?.textContent || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rainfall_Stats_All_Days_Districts');
    XLSX.writeFile(wb, 'Rainfall_FvO_AllDays_Districts_Stats.xlsx');
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}


/**
 * Part: Forecast vs Observation Comparison
 * Function: createComparisonData
 * Purpose: Join forecast and observation series by date for a
parameter and compute absolute differences.
 * Inputs: forecastData[], observationData[], parameter key
 * Output: comparisonData[] with { date, forecastValue,
observationValue, absoluteDifference, isMissing }
 * Preceded by: performComparison / performComparisonOptimized (data
loading done)
 * Followed by: calculateStatistics or calculateRainfallStatistics
 */
function createComparisonData(forecastData, observationData, parameter) {
  const comparisonData = [];

  // Create a lookup for observation data
  const obsLookup = {};
  observationData.forEach(obs => {
    const dateKey = obs.observation_date || obs.forecasted_date ||
obs.forecast_date;
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

// Calculate statistics based on parameter-specific thresholds}

/**
 * Part: Forecast vs Observation Comparison (Rainfall)
 * Function: calculateRainfallStatistics
 * Purpose: Compute rainfall verification using YY/YN/NY/NN framework
and derived metrics.
 * Inputs: comparisonData[] from createComparisonData
 * Output: statistics object with YY, YN, NY, NN, YU, NU and 13+
metrics; isRainfall=true
 * Preceded by: createComparisonData
 * Followed by: displayComparisonResults (rainfall branch)
 */
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
      YU: 0, NU: 0,
      // New scoring system
      correctSum: 0,
      usableSum: 0,
      unusableSum: 0,
      // 13 metrics
      correct: 0,
      usable: 0,
      unusable: 0,
      rs: 0,
      hk: 0,
      pod: 0,
      far: 0,
      csi: 0,
      hss: 0,
      mr: 0,
      cnon: 0,
      bias: 0,
      pc: 0,
      isRainfall: true
    };
  }

  const validData = comparisonData.filter(item => !item.isMissing);

  let YY = 0, YN = 0, NY = 0, NN = 0;
  let YU = 0, NU = 0;
  let correctSum = 0, usableSum = 0, unusableSum = 0;

  validData.forEach(item => {
    const forecastNonZero = (item.forecastValue || 0) !== 0;
    const observedNonZero = (item.observationValue || 0) !== 0;
    const absDiff = Math.abs((item.forecastValue || 0) -
(item.observationValue || 0));

    // Determine YY/NY/YN/NN status
    let status = '';
    if (forecastNonZero && observedNonZero) {
      status = 'YY';
      YY++;
      if (absDiff <= 5) YU++;
    } else if (forecastNonZero && !observedNonZero) {
      status = 'YN';
      YN++;
    } else if (!forecastNonZero && observedNonZero) {
      status = 'NY';
      NY++;
    } else if (!forecastNonZero && !observedNonZero) {
      status = 'NN';
      NN++;
      if (absDiff <= 5) NU++;
    }

    // Calculate scores based on new logic
    if (status === 'NN') {
      correctSum += 1;
    } else if (status === 'YN' || status === 'NY') {
      correctSum += 0;
    } else if (status === 'YY') {
      if (absDiff <= 2.5) {
        correctSum += 1;
      } else {
        correctSum += 0;
      }
    }

    // Usable logic
    if (status === 'NN') {
      usableSum += 0;
    } else if (status === 'YN' || status === 'NY') {
      usableSum += 0;
    } else if (status === 'YY') {
      if (absDiff > 2.5 && absDiff <= 5) {
        usableSum += 1;
      } else {
        usableSum += 0;
      }
    }

    // Unusable logic
    if (status === 'NN') {
      unusableSum += 0;
    } else if (status === 'YN' || status === 'NY') {
      unusableSum += 0;
    } else if (status === 'YY') {
      if (absDiff > 5) {
        unusableSum += 1;
      } else {
        unusableSum += 0;
      }
    }
  });

  const N = validDays;
  // 1. Correct (%)
  const correct = (YY + NN) / (YY + NN + NY + YN) * 100;
  // 2. Usable (%)
  const usable = (YY + NN) > 0 ? ((YU + NU) / (YY + NN)) * 100 : 0;
  // 3. Unusable (%)
  const unusable = (YY + NN) > 0 ? (((YY + NN) - (YU + NU)) / (YY +
NN)) * 100 : 0;
  // 4. Skill Score or Ratio Score of rainfall (RS)
  const rs = ((YY + NN) / N) * 100;
  // 5. Hanssen & Kuipers index (H.K. Score)
  const hk = ((YY * NN) - (YN * NY)) / (((YY + NY) * (YN + NN)) || 1);
  // 6. Probability of detection (POD)
  const pod = (YY + NY) > 0 ? YY / (YY + NY) : 0;
  // 7. False alarm ratio (FAR)
  const far = (YN + YY) > 0 ? YN / (YN + YY) : 0;
  // 8. Critical Success index (CSI)
  const csi = (YY + YN + NY) > 0 ? YY / (YY + YN + NY) : 0;
  // 9. Heidke Skill Score (HSS)
  const hss = (((2 * ((YY * NN) - (YN * NY))) / ((((YY + NY) * (NY +
NN)) + ((YY + YN) * (YN + NN))) || 1)));
  // 10. Missing Rate (MR)
  const mr = (YN + NY) > 0 ? YN / (YN + NY) : 0;
  // 11. Correct non Occurrence (C NON)
  const cnon = (NN + YY) > 0 ? NN / (NN + YY) : 0;
  // 12. Bias (BAIS)
  const bias = (NN + YY) > 0 ? (YY + YN) / (NN + YY) : 0;
  // 13. Percentage Correct (PC)
  const pc = (NN + YY + YN + NY) > 0 ? ((NN + YY) / (NN + YY + YN +
NY)) * 100 : 0;

  return {
    totalDays: totalDays,
    missingDays: missingDays,
    validDays: validDays,
    YY: YY,
    YN: YN,
    NY: NY,
    NN: NN,
    YU: YU,
    NU: NU,
    // New scoring system
    correctSum: correctSum,
    usableSum: usableSum,
    unusableSum: unusableSum,
    // 13 metrics
    correct: correct,
    usable: usable,
    unusable: unusable,
    rs: rs,
    hk: hk,
    pod: pod,
    far: far,
    csi: csi,
    hss: hss,
    mr: mr,
    cnon: cnon,
    bias: bias,
    pc: pc,
    isRainfall: true
  };
}


/**
 * Part: Forecast vs Observation Comparison (Non-rainfall)
 * Function: calculateStatistics
 * Purpose: Compute threshold-based correctness metrics for
non-rainfall parameters.
 * Inputs: comparisonData[] from createComparisonData, parameter key
 * Output: statistics object with N1/N2/N3/N11 and % metrics; isRainfall=false
 * Preceded by: createComparisonData
 * Followed by: displayComparisonResults (non-rainfall branch)
 */
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

// --- WIND DIRECTION SPECIAL LOGIC ---
if (parameter === 'wind_direction_deg') {
  // Apply the new formula as per your description
  const N = validDays;
  let N1 = 0, N3 = 0, N11 = 0;
  for (let i = 0; i < validData.length; i++) {
    const diff = Math.abs(validData[i].observationValue -
validData[i].forecastValue);
    if (diff <= 30) N1++;
    if (diff > 30) N3++;
    if (diff > 40) N11++;
  }
  const N2 = Math.abs(N11 - N3);
  const correct = N ? (N1 / N) * 100 : 0;
  const usable = N ? (N2 / N) * 100 : 0;
  const unusable = N ? (N11 / N) * 100 : 0;
  return {
    totalDays: totalDays,
    missingDays: missingDays,
    validDays: N,
    n1: N1,
    n2: N2,
    n3: N3,
    n11: N11,
    correct: correct,
    usable: usable,
    unusable: unusable,
    threshold1: 30,
    threshold2: 40,
    useN11ForUnusable: true,
    isRainfall: false
  };
}
// --- END WIND DIRECTION SPECIAL LOGIC ---

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
      useN11ForUnusable = false;
      break;

    // case 'wind_direction_deg':
    //   threshold1 = 30.0; 
    //   threshold2 = 40.0; 
    //   useN11ForUnusable = true;  
    //   break;

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

/**
 * Part: Forecast vs Observation Comparison
 * Function: displayComparisonResults
 * Purpose: Render UI: summary tiles + detailed table based on
statistics (rainfall/non-rainfall)
 * Inputs: comparisonData[], statistics, day label, district name, parameter key
 * Output: Updates DOM nodes: #comparisonStats, #comparisonTable
 * Preceded by: calculateStatistics / calculateRainfallStatistics
 * Followed by: exportComparisonToExcel (optional)
 */
function displayComparisonResults(comparisonData, statistics, day,
district, parameter) {
  const statsDiv = document.getElementById('comparisonStats');

  if (statistics.isRainfall) {
      // For rainfall: show new calculated percentages based on sums
      const newCorrectPercent = (statistics.YY + statistics.NN) > 0 ? (statistics.correctSum / (statistics.YY + statistics.NN)) * 100 : 0;
      const newUsablePercent = (statistics.YY + statistics.NN) > 0 ? (statistics.usableSum / (statistics.YY + statistics.NN)) * 100 : 0;
      const newUnusablePercent = (statistics.YY + statistics.NN) > 0 ? (statistics.unusableSum / (statistics.YY + statistics.NN)) * 100 : 0;

      statsDiv.innerHTML = `
        <div style="background: #d4edda; padding: 15px; border-radius: 10px; text-align: center;">
          <h4 style="color: #155724; margin: 0;">Correct</h4>
          <div style="font-size: 24px; font-weight: bold; color: #155724;">${newCorrectPercent.toFixed(1)}%</div>
          <small>Based on new scoring system</small>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #856404; margin: 0;">Usable</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#856404;">${newUsablePercent.toFixed(1)}%</div>
          <small>Based on new scoring system</small>
        </div>
        <div style="background: #f8d7da; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #721c24; margin: 0;">Unusable</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#721c24;">${newUnusablePercent.toFixed(1)}%</div>
          <small>Based on new scoring system</small>
        </div>
        <div style="background: #d1ecf1; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #0c5460; margin: 0;">Valid Days</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#0c5460;">${statistics.validDays}</div>
          <small>out of ${statistics.totalDays}</small>
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
        //case 'wind_direction_deg':
          threshold1Label = '≤ 7.2 difference';
          threshold2Label = '7.2 < diff ≤ 14.4';
          unusableLabel = '> 7.2 difference';
          break;
        
          case 'wind_direction_deg':
            threshold1Label = '≤ 30 difference';
          threshold2Label = '30 < diff ≤ 40';
          unusableLabel = '> 30 difference';
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
        <div style="background: #d4edda; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #155724; margin: 0;">Correct</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#155724;">${statistics.correct.toFixed(1)}%</div>
          <small>(${threshold1Label})</small>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #856404; margin: 0;">Usable</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#856404;">${statistics.usable.toFixed(1)}%</div>
          <small>(${threshold2Label})</small>
        </div>
        <div style="background: #f8d7da; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #721c24; margin: 0;">Unusable</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#721c24;">${statistics.unusable.toFixed(1)}%</div>
          <small>(${unusableLabel})</small>
        </div>
        <div style="background: #d1ecf1; padding: 15px; border-radius:
10px; text-align: center;">
          <h4 style="color: #0c5460; margin: 0;">Valid Days</h4>
          <div style="font-size: 24px; font-weight: bold; color:
#0c5460;">${statistics.validDays}</div>
          <small>out of ${statistics.totalDays}</small>
        </div>
      `;
  }

  const tableDiv = document.getElementById('comparisonTable');
  let tableHtml = `
    <h4>Detailed Comparison: ${district} - ${parameterNames[parameter]
|| parameter} - ${day}</h4>`;

  if (statistics.isRainfall) {
      tableHtml += `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Forecast Value</th>
              <th>Observation Value</th>
              <th>Absolute Difference</th>
              <th>YY/NY/YN/NN</th>
              <th>2.5</th>
              <th>5</th>
              <th>Logic Flags</th>
              <th>Correct</th>
              <th>Usable</th>
              <th>Unusable</th>
            </tr>
          </thead>
          <tbody>`;

      comparisonData.forEach(item => {
        if (!item.isMissing) {
          const forecastNonZero = (item.forecastValue || 0) !== 0;
          const observedNonZero = (item.observationValue || 0) !== 0;
          const absDiff = Math.abs((item.forecastValue || 0) -
(item.observationValue || 0));

          // Determine YY/NY/YN/NN status
          let status = '';
          if (forecastNonZero && observedNonZero) {
            status = 'YY';
          } else if (forecastNonZero && !observedNonZero) {
            status = 'YN';
          } else if (!forecastNonZero && observedNonZero) {
            status = 'NY';
          } else if (!forecastNonZero && !observedNonZero) {
            status = 'NN';
          }

          // Calculate logic flags
          let logicFlag = 0;
          if (status === 'NN') {
            logicFlag = 1;
          } else if (status === 'YN' || status === 'NY') {
            logicFlag = 0;
          } else if (status === 'YY') {
            if (absDiff < 2.5) {
              logicFlag = 1;
            } else {
              logicFlag = 0;
            }
          }

          // Calculate correct score
          let correctScore = 0;
          if (status === 'NN') {
            correctScore = 1;
          } else if (status === 'YN' || status === 'NY') {
            correctScore = 0;
          } else if (status === 'YY') {
            if (absDiff < 2.5) {
              correctScore = 1;
            } else {
              correctScore = 0;
            }
          }

          // Calculate usable score
          let usableScore = 0;
          if (status === 'NN') {
            usableScore = 0;
          } else if (status === 'YN' || status === 'NY') {
            usableScore = 0;
          } else if (status === 'YY') {
            if (absDiff >= 2.5 && absDiff < 5) {
              usableScore = 1;
            } else {
              usableScore = 0;
            }
          }

          // Calculate unusable score
          let unusableScore = 0;
          if (status === 'NN') {
            unusableScore = 0;
          } else if (status === 'YN' || status === 'NY') {
            unusableScore = 0;
          } else if (status === 'YY') {
            if (absDiff >= 5) {
              unusableScore = 1;
            } else {
              unusableScore = 0;
            }
          }

          tableHtml += `<tr>
            <td>${item.date}</td>
            <td>${formatComparisonValue(item.forecastValue)}</td>
            <td>${formatComparisonValue(item.observationValue)}</td>
            <td>${formatComparisonValue(absDiff)}</td>
            <td>${status}</td>
            <td>2.5</td>
            <td>5</td>
            <td>${logicFlag}</td>
            <td>${correctScore}</td>
            <td>${usableScore}</td>
            <td>${unusableScore}</td>
          </tr>`;
        }
      });

      tableHtml += '</tbody></table>';

      // Add summary row with totals
      tableHtml += `
        <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
          <h5 style="margin: 0 0 10px 0;">Table Summary</h5>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f8f9fa;">
              <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Total Correct Score:</strong></td>
              <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;"><strong>${statistics.correctSum}</strong></td>
              <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Total Usable Score:</strong></td>
              <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;"><strong>${statistics.usableSum}</strong></td>
              <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Total Unusable Score:</strong></td>
              <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;"><strong>${statistics.unusableSum}</strong></td>
            </tr>
          </table>
        </div>
      `;

      // Rainfall Statistical Summary with detailed metrics table
      tableHtml += `
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
          <h4>Rainfall Statistical Summary</h4>
          <div style="overflow-x:auto; margin-bottom: 20px;">
            <table style="width:100%; border-collapse:collapse; background:#f8f9fa;">
              <thead>
                <tr style="background:#e9ecef;">
                  <th style="padding:8px; border:1px solid #dee2e6;">Metric</th>
                  <th style="padding:8px; border:1px solid #dee2e6;">Formula</th>
                  <th style="padding:8px; border:1px solid #dee2e6;">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>YY</td><td>Rain forecast & observed (&ne;0)</td><td>${statistics.YY}</td></tr>
                <tr><td>YN</td><td>Rain forecast, not observed (forecast &ne;0, obs=0)</td><td>${statistics.YN}</td></tr>
                <tr><td>NY</td><td>No rain forecast, rain observed (forecast=0, obs &ne;0)</td><td>${statistics.NY}</td></tr>
                <tr><td>NN</td><td>No rain forecast & not observed (both=0)</td><td>${statistics.NN}</td></tr>
                <tr><td>N</td><td>Total forecast days</td><td>${statistics.validDays}</td></tr>
                <tr><td>Correct (%)</td><td>(Correct Sum / (YY+NN))&times;100</td><td>${((statistics.correctSum / (statistics.YY + statistics.NN)) * 100).toFixed(2)}%</td></tr>
                <tr><td>Usable (%)</td><td>(Usable Sum / (YY+NN))&times;100</td><td>${((statistics.usableSum / (statistics.YY + statistics.NN)) * 100).toFixed(2)}%</td></tr>
                <tr><td>Unusable (%)</td><td>(Unusable Sum / (YY+NN))&times;100</td><td>${((statistics.unusableSum / (statistics.YY + statistics.NN)) * 100).toFixed(2)}%</td></tr>
                <tr><td>RS (%)</td><td>((YY+NN)/N)&times;100</td><td>${statistics.rs.toFixed(2)}%</td></tr>
                <tr><td>H.K.Score</td><td>((YY&times;NN)-(YN&times;NY))/((YY+NY)&times;(YN+NN))</td><td>${statistics.hk.toFixed(3)}</td></tr>
                <tr><td>POD</td><td>YY/(YY+NY)</td><td>${statistics.pod.toFixed(3)}</td></tr>
                <tr><td>FAR</td><td>YN/(YN+YY)</td><td>${statistics.far.toFixed(3)}</td></tr>
                <tr><td>CSI</td><td>YY/(YY+YN+NY)</td><td>${statistics.csi.toFixed(3)}</td></tr>
                <tr><td>HSS</td><td>2&times;((YY&times;NN)-(YN&times;NY))/[((YY+NY)&times;(NY+NN))+((YY+YN)&times;(YN+NN))]</td><td>${statistics.hss.toFixed(3)}</td></tr>
                <tr><td>MR</td><td>YN/(YN+NY)</td><td>${statistics.mr.toFixed(3)}</td></tr>
                <tr><td>C NON</td><td>NN/(NN+YY)</td><td>${statistics.cnon.toFixed(3)}</td></tr>
                <tr><td>BAIS</td><td>(YY+YN)/(NN+YY)</td><td>${statistics.bias.toFixed(3)}</td></tr>
                <tr><td>PC (%)</td><td>((NN+YY)/(NN+YY+YN+NY))&times;100</td><td>${statistics.pc.toFixed(2)}%</td></tr>
              </tbody>
            </table>
          </div>

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
                <td style="text-align: right;"><strong>${statistics.YY + statistics.NN}</strong></td>
              </tr>
              <tr style="border-top: 2px solid #dee2e6;">
                <td><strong>Sum from Correct column</strong></td>
                <td style="text-align: right;"><strong>${statistics.correctSum}</strong></td>
              </tr>
              <tr>
                <td><strong>Sum from Usable column</strong></td>
                <td style="text-align: right;"><strong>${statistics.usableSum}</strong></td>
              </tr>
              <tr>
                <td><strong>Sum from Unusable column</strong></td>
                <td style="text-align: right;"><strong>${statistics.unusableSum}</strong></td>
              </tr>
              <tr style="border-top: 2px solid #dee2e6;">
                <td><strong>Correct % = (Correct Sum / (YY + NN)) × 100</strong></td>
                <td style="text-align: right;"><strong>${((statistics.correctSum / (statistics.YY + statistics.NN)) * 100).toFixed(2)}%</strong></td>
              </tr>
              <tr>
                <td><strong>Usable % = (Usable Sum / (YY + NN)) × 100</strong></td>
                <td style="text-align: right;"><strong>${((statistics.usableSum / (statistics.YY + statistics.NN)) * 100).toFixed(2)}%</strong></td>
              </tr>
              <tr>
                <td><strong>Unusable % = (Unusable Sum / (YY + NN)) × 100</strong></td>
                <td style="text-align: right;"><strong>${((statistics.unusableSum / (statistics.YY + statistics.NN)) * 100).toFixed(2)}%</strong></td>
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
                <td style="text-align:
right;"><strong>${statistics.n2}</strong></td>
              </tr>
              <tr style="border-top: 2px solid #dee2e6;">
                <td><strong>Correct = (N1/N) × 100</strong></td>
                <td style="text-align:
right;"><strong>${statistics.correct.toFixed(2)}%</strong></td>
              </tr>
              <tr>
                <td><strong>Usable = (N2/N) × 100</strong></td>
                <td style="text-align:
right;"><strong>${statistics.usable.toFixed(2)}%</strong></td>
              </tr>
              <tr>
                <td>${unusableCalculation}</td>
                <td style="text-align:
right;"><strong>${statistics.unusable.toFixed(2)}%</strong></td>
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
  const useDateRange =
document.getElementById('useDateRangeComprehensive').checked;
  const useSpecificSheets =
document.getElementById('useSpecificSheetsComprehensive').checked;
  const startDate = document.getElementById('comprehensiveStartDate').value;
  const endDate = document.getElementById('comprehensiveEndDate').value;

  if (!day) {
    showComprehensiveStatus('❌ Please select a day for analysis.', 'error');
    return;
  }

  let allForecastData, allObservationData;

  try {
    if (useSpecificSheets) {
      // Use specific sheets
      const sheetSelection = validateSheetSelection('comprehensive');

      if (!sheetSelection.isValid) {
        if (sheetSelection.forecastCount === 0) {
          showComprehensiveStatus('❌ Please select at least one forecast sheet.', 'error');
        } else {
          showComprehensiveStatus('❌ Please select at least one observation sheet.', 'error');
        }
        return;
      }

      const forecastSheets = sheetSelection.forecastSheets;
      const observationSheets = sheetSelection.observationSheets;

      showComprehensiveStatus('🔍 Loading data from selected sheets...', 'info');

      const dateRangeStart = useDateRange ? startDate : null;
      const dateRangeEnd = useDateRange ? endDate : null;

      if (useDateRange) {
        const validation = validateDateRange(startDate, endDate);
        if (!validation.valid) {
          showComprehensiveStatus('❌ ' + validation.message, 'error');
          return;
        }
      }

      const { forecastData: dbForecastData, observationData:
dbObservationData } =
        await loadDataBySheets(forecastSheets, observationSheets,
dateRangeStart, dateRangeEnd);

      allForecastData = dbForecastData;
      allObservationData = dbObservationData;

    } else if (useDateRange) {
      // Use date range with all data
      const validation = validateDateRange(startDate, endDate);
      if (!validation.valid) {
        showComprehensiveStatus('❌ ' + validation.message, 'error');
        return;
      }

      showComprehensiveStatus('🔍 Loading data from database for date range...', 'info');

      [allForecastData, allObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

    } else {
      // Use existing processed data
      if (processedOutput.length === 0) {
        showComprehensiveStatus('❌ No forecast data available. Please process forecast data first or enable date range/sheet selection.',
'error');
        return;
      }

      if (processedObservationOutput.length === 0) {
        showComprehensiveStatus('❌ No observation data available. Please process observation data first or enable date range/sheet selection.', 'error');
        return;
      }

      allForecastData = processedOutput;
      allObservationData = processedObservationOutput;
    }

    showComprehensiveStatus('🔍 Performing comprehensive analysis for all districts and parameters...', 'info');

    const dayNumber = parseInt(day.replace('Day', ''));
    const results = [];

    // Get all unique districts from the data
    const allDistricts = [...new Set(allForecastData.map(row =>
row.district_name))];
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
          normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
          row.day_number === dayNumber
        );

        // Filter observation data for this district and day
        const observationData = allObservationData.filter(row =>
          normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
          row.day_number === dayNumber
        );

        if (forecastData.length > 0 && observationData.length > 0) {
          // Create comparison data for this parameter
          const comparisonData = createComparisonData(forecastData,
observationData, parameter);
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
              YU: statistics.YU,
              NU: statistics.NU,
              matchingCases: statistics.matchingCases,
              totalDays: statistics.totalDays,
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
              useN11ForUnusable: statistics.useN11ForUnusable
            };
          }
        } else {
          // No data available
          if (parameter === 'rainfall') {
            districtResult.parameters[parameter] = {
              correct: 0,
              usable: 0,
              unusable: 0,
              correctPlusUsable: 0,
              validDays: 0,
              missingDays: 0,
              YY: 0,
              YN: 0,
              NY: 0,
              NN: 0,
              YU: 0,
              NU: 0,
              matchingCases: 0,
              totalDays: 0,
              isRainfall: true
            };
          } else {
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
      useSpecificSheets: useSpecificSheets,
        forecastSheets: useSpecificSheets ?
validateSheetSelection('comprehensive').forecastSheets : null,
        observationSheets: useSpecificSheets ?
validateSheetSelection('comprehensive').observationSheets : null,
      startDate: startDate,
      endDate: endDate
    };

    // Display results
    displayComprehensiveResults(comprehensiveResults);

    document.getElementById('comprehensiveResultsSection').style.display
= 'block';

    const analysisType = useSpecificSheets ? 'specific sheets' :
useDateRange ? `date range (${startDate} to ${endDate})` : 'processed data';
    showComprehensiveStatus(`✅ Comprehensive analysis completed for
${day} using ${analysisType}.`, 'success');

  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    showComprehensiveStatus('❌ Comprehensive analysis error: ' +
error.message, 'error');
  }
}


// (Removed duplicate displayComparisonResults — unified rainfall-aware version is defined earlier.)

// Format values for comparison display
function formatComparisonValue(value) {
  if (value === null || value === undefined) {
    return '<span style="color: #999; font-style: italic;">N/A</span>';
  }
  return typeof value === 'number' ? value.toFixed(2) : value;
}


// Shared helper: compute rainfall Correct/Usable/Unusable using FvO logic
function computeRainfallCUUFromPairs(forecastPairs, observationPairs) {
  const comp = createComparisonData(forecastPairs, observationPairs,
'rainfall');
  const stats = calculateRainfallStatistics(comp);
  const denom = (stats.YY || 0) + (stats.NN || 0);
  const correct = denom > 0 ? (stats.correctSum / denom) * 100 : 0;
  const usable  = denom > 0 ? (stats.usableSum  / denom) * 100 : 0;
  const unusable= denom > 0 ? (stats.unusableSum/ denom) * 100 : 0;
  return { correct, usable, unusable, correctPlusUsable: correct + usable };
}



/**
 * Part: Forecast vs Observation Comparison
 * Function: exportComparisonToExcel
 * Purpose: Export the current comparison table and summary statistics
to an Excel workbook.
 * Inputs: global comparisonResults populated by
performComparison/performComparisonOptimized
 * Output: XLSX file saved to disk
 * Preceded by: displayComparisonResults (comparisonResults set)
 * Followed by: N/A
 */
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
      const filename =
`Comparison_${metadata.district}_${metadata.parameter}_${metadata.day}_${timestamp}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);

      showComparisonStatus(`✅ Comparison results exported to
${filename}`, 'success');

    } catch (error) {
      console.error('Export error:', error);
      showComparisonStatus('❌ Error exporting comparison results: ' +
error.message, 'error');
    }
  }

/**
 * Part: Forecast vs Observation Comparison
 * Function: showComparisonStatus
 * Purpose: Present toast-like status messages for comparison workflow.
 * Inputs: message string, type ('success'|'error'|'info')
 * Output: Updates DOM node #comparisonProcessingStatus
 * Preceded by: performComparison/performComparisonOptimized steps
 * Followed by: N/A
 */
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
    const baseQuery = client
      .from('full_forecast')
      .select('sheet_name, forecast_date, district_name')
      .not('sheet_name', 'is', null);

    const data = await fetchAllRows(baseQuery, 'sheet_name', true);

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
    const baseQuery = client
      .from('full_observation')
      .select('sheet_name, observation_date, district_name')
      .not('sheet_name', 'is', null);

    const data = await fetchAllRows(baseQuery, 'sheet_name', true);

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
  const listId = type === 'forecast' ? 'forecastSheetList' :
'observationSheetList';
  const btnId = type === 'forecast' ? 'toggleForecastBtn' :
'toggleObservationBtn';

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
      `${formatDate(new Date(sheet.dateRange.start))} to
${formatDate(new Date(sheet.dateRange.end))}` :
      'No dates';

    html += `
      <div class="sheet-item">
        <div class="sheet-info">
          <div class="sheet-name">📊 ${sheet.name}</div>
          <div class="sheet-meta">
            ${sheet.records} records • ${sheet.districtCount}
districts • ${dateRangeText}
          </div>
        </div>
        <div class="sheet-actions">
          <button class="btn-info"
onclick="showSheetDetails('forecast', '${sheet.name}')">
            ℹ️ Info
          </button>
          <button class="btn-delete"
onclick="confirmDeleteSheet('forecast', '${sheet.name}')"
                  ${currentlyDeleting[`forecast_${sheet.name}`] ?
'disabled' : ''}>
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
      `${formatDate(new Date(sheet.dateRange.start))} to
${formatDate(new Date(sheet.dateRange.end))}` :
      'No dates';

    html += `
      <div class="sheet-item">
        <div class="sheet-info">
          <div class="sheet-name">📈 ${sheet.name}</div>
          <div class="sheet-meta">
            ${sheet.records} records • ${sheet.districtCount}
districts • ${dateRangeText}
          </div>
        </div>
        <div class="sheet-actions">
          <button class="btn-info"
onclick="showSheetDetails('observation', '${sheet.name}')">
            ℹ️ Info
          </button>
          <button class="btn-delete"
onclick="confirmDeleteSheet('observation', '${sheet.name}')"
                  ${currentlyDeleting[`observation_${sheet.name}`] ?
'disabled' : ''}>
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
    `From: ${formatDate(new Date(sheet.dateRange.start))}\nTo:
${formatDate(new Date(sheet.dateRange.end))}` :
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
  const message = `Are you sure you want to delete the sheet
"${sheetName}" and all its associated ${type} data?\n\nThis action
cannot be undone.`;

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
    const tableName = type === 'forecast' ? 'full_forecast' :
'full_observation';

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
      existingObservationSheetNames =
existingObservationSheetNames.filter(name => name !== sheetName);
      updateObservationSheetDisplay();
    }

    // Show success message
    const statusFunction = type === 'forecast' ? showStatus :
showObservationStatus;
    statusFunction(`✅ Successfully deleted sheet "${sheetName}" and
all associated data.`, 'success');

  } catch (error) {
    console.error(`Error deleting ${type} sheet:`, error);
    const statusFunction = type === 'forecast' ? showStatus :
showObservationStatus;
    statusFunction(`❌ Error deleting sheet "${sheetName}":
${error.message}`, 'error');
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

    showStatus(`✅ Successfully saved ${dbData.length} records to
database with sheet name "${sheetName}".`, 'success');

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

    const sheetName =
document.getElementById('observationSheetNameInput').value.trim();

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

      showObservationStatus(`✅ Successfully saved ${dbData.length}
observation records to database with sheet name "${sheetName}".`,
'success');

      // Update existing sheet names and disable save button
      existingObservationSheetNames.push(sheetName);
      document.getElementById('saveObservationToDatabaseBtn').disabled = true;
      document.getElementById('observationSheetNameInput').value = '';
      validateObservationSheetName();

      // NEW: Refresh sheet information
      await loadObservationSheetInfo();

    } catch (error) {
      console.error('Database save error for observation:', error);
      showObservationStatus('❌ Error saving observation to database: '
+ error.message, 'error');
    }
}

// Load forecast data from database by date range
async function loadForecastDataByDateRange(startDate, endDate) {
  try {
    const baseQuery = client
      .from('full_forecast')
      .select('*')
      .gte('forecast_date', startDate)
      .lte('forecast_date', endDate);

    return await fetchAllRows(baseQuery, 'forecast_date', true);
  } catch (error) {
    console.error('Error loading forecast data by date range:', error);
    throw error;
  }
}

// Load observation data from database by date range
async function loadObservationDataByDateRange(startDate, endDate) {
  try {
    const baseQuery = client
      .from('full_observation')
      .select('*')
      .gte('observation_date', startDate)
      .lte('observation_date', endDate);

    return await fetchAllRows(baseQuery, 'observation_date', true);
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

function toggleSheetSelection(type) {
  const checkboxId = `useSpecificSheets${type.charAt(0).toUpperCase()
+ type.slice(1)}`;
  const selectionId = `sheetSelection${type.charAt(0).toUpperCase() +
type.slice(1)}`;

  const checkbox = document.getElementById(checkboxId);
  const selectionDiv = document.getElementById(selectionId);

  if (checkbox.checked) {
    selectionDiv.style.display = 'block';
    populateSheetDropdowns(type);
  } else {
    selectionDiv.style.display = 'none';
    // Remove any existing summary when hiding the selection
    const existingSummary = document.getElementById(`sheetSummary_${type}`);
    if (existingSummary) {
      existingSummary.remove();
    }
  }
}

function populateSheetDropdowns(type) {
  let forecastCheckboxId, observationCheckboxId;

  if (type === 'comparison') {
    forecastCheckboxId = 'forecastSheetCheckboxes';
    observationCheckboxId = 'observationSheetCheckboxes';
  } else {
    forecastCheckboxId = 'forecastSheetCheckboxesComp';
    observationCheckboxId = 'observationSheetCheckboxesComp';
  }

  const forecastCheckboxDiv = document.getElementById(forecastCheckboxId);
  const observationCheckboxDiv = document.getElementById(observationCheckboxId);

  // Show loading indicator
  forecastCheckboxDiv.innerHTML = '<div class="loading">Loading forecast sheets...</div>';
  observationCheckboxDiv.innerHTML = '<div class="loading">Loading observation sheets...</div>';

  // Use setTimeout to allow the loading indicator to show
  setTimeout(() => {
    populateForecastCheckboxes(type, forecastCheckboxDiv);
    populateObservationCheckboxes(type, observationCheckboxDiv);

    // Add summary section after both checkbox groups are populated
    addSheetSelectionSummary(type);
  }, 100);
}

// Calculate and Store All Days Data for Comprehensive Analysis
async function calculateAndStoreAllDaysData() {
  try {
    // Get sheet name and validate
    const sheetNameInput = document.getElementById('comprehensiveSheetName');
    const sheetName = sheetNameInput ? sheetNameInput.value.trim() : '';

    if (!sheetName) {
      showAllDaysStatus('❌ Please enter a sheet name for storage.', 'error');
      return;
    }

    // Check if sheet name already exists
    const { data: existingSheets } = await client
      .from('comprehensive_analysis')
      .select('sheet_name')
      .eq('sheet_name', sheetName)
      .limit(1);

    if (existingSheets && existingSheets.length > 0) {
      showAllDaysStatus(`❌ Sheet name "${sheetName}" already exists. Please choose a different name.`, 'error');
      return;
    }

    // Get data source options
    const useDateRange = document.getElementById('useDateRangeComprehensive') ? document.getElementById('useDateRangeComprehensive').checked : false;
    const useSpecificSheets = document.getElementById('useSpecificSheetsComprehensive') ? document.getElementById('useSpecificSheetsComprehensive').checked : false;

    let forecastData = [];
    let observationData = [];

    showAllDaysStatus('🔍 Loading data for comprehensive analysis...', 'info');

    if (useSpecificSheets) {
      // Use specific sheets
      const sheetSelection = validateSheetSelection('comprehensive');
      if (!sheetSelection.isValid) {
        if (sheetSelection.forecastCount === 0) {
          showAllDaysStatus('❌ Please select at least one forecast sheet.', 'error');
        } else {
          showAllDaysStatus('❌ Please select at least one observation sheet.', 'error');
        }
        return;
      }

      const forecastSheets = sheetSelection.forecastSheets;
      const observationSheets = sheetSelection.observationSheets;

      // Get date range if specified
      let dateRangeStart = null;
      let dateRangeEnd = null;
      if (useDateRange) {
        const startDate = document.getElementById('comprehensiveStartDate') ?
          document.getElementById('comprehensiveStartDate').value : '';
        const endDate = document.getElementById('comprehensiveEndDate') ?
          document.getElementById('comprehensiveEndDate').value : '';

        if (!startDate || !endDate) {
          showAllDaysStatus('❌ Please enter both start and end dates when using date range.', 'error');
          return;
        }
        dateRangeStart = startDate;
        dateRangeEnd = endDate;
      }

      const { forecastData: dbForecastData, observationData: dbObservationData } =
        await loadDataBySheets(forecastSheets, observationSheets, dateRangeStart, dateRangeEnd);

      forecastData = dbForecastData;
      observationData = dbObservationData;

    } else if (useDateRange) {
      // Use date range with all data
      const startDate = document.getElementById('comprehensiveStartDate') ?
        document.getElementById('comprehensiveStartDate').value : '';
      const endDate = document.getElementById('comprehensiveEndDate') ?
        document.getElementById('comprehensiveEndDate').value : '';

      if (!startDate || !endDate) {
        showAllDaysStatus('❌ Please enter both start and end dates.', 'error');
        return;
      }

      const [dbForecastData, dbObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

      forecastData = dbForecastData;
      observationData = dbObservationData;

    } else {
      // Use existing processed data
      if (processedOutput.length === 0) {
        showAllDaysStatus('❌ No forecast data available. Please process forecast data first or enable date range/sheet selection.',
'error');
        return;
      }

      if (processedObservationOutput.length === 0) {
        showAllDaysStatus('❌ No observation data available. Please process observation data first or enable date range/sheet selection.',
'error');
        return;
      }

      forecastData = processedOutput;
      observationData = processedObservationOutput;
    }

    if (forecastData.length === 0) {
      showAllDaysStatus('❌ No forecast data found for the selected criteria.', 'error');
      return;
    }

    if (observationData.length === 0) {
      showAllDaysStatus('❌ No observation data found for the selected criteria.', 'error');
      return;
    }

    showAllDaysStatus('🔍 Performing comprehensive analysis for all days...', 'info');

    // Get all unique districts and parameters
    const allDistricts = [...new Set(forecastData.map(row => row.district_name))];
    const parameters = ['rainfall', 'temp_max_c', 'temp_min_c', 'humidity_1', 'humidity_2', 'wind_speed_kmph', 'wind_direction_deg', 'cloud_cover_octa'];

    // Prepare data for database insertion
    const dbData = [];

    // Process each day (1-5)
    for (let dayNumber = 1; dayNumber <= 5; dayNumber++) {
      showAllDaysStatus(`🔍 Processing Day ${dayNumber}...`, 'info');

      for (const district of allDistricts) {
        // Filter data for this district and day
        const dayForecastData = forecastData.filter(row =>
          normalizeDistrictName(row.district_name) === normalizeDistrictName(district) &&
          row.day_number === dayNumber
        );

        const dayObservationData = observationData.filter(row =>
          normalizeDistrictName(row.district_name) === normalizeDistrictName(district) &&
          row.day_number === dayNumber
        );

        if (dayForecastData.length === 0 || dayObservationData.length === 0) {
          continue; // Skip if no data for this district/day combination
        }

        // Analyze each parameter
        for (const parameter of parameters) {
          const comparisonData = createComparisonData(dayForecastData, dayObservationData, parameter);
          const statistics = calculateStatistics(comparisonData, parameter);

          const dbRow = {
            sheet_name: sheetName,
            day_number: dayNumber,
            district_name: district,
            parameter_name: parameter
          };

          if (parameter === 'rainfall') {
            // Use new rainfall scoring based on sums over matching cases (YY + NN)
            const matchingCases = (statistics.YY || 0) + (statistics.NN || 0);
            const denom = matchingCases;
            const newCorrect = denom > 0 ? (statistics.correctSum / denom) * 100 : 0;
            const newUsable = denom > 0 ? (statistics.usableSum / denom) * 100 : 0;
            const newUnusable = denom > 0 ? (statistics.unusableSum / denom) * 100 : 0;

            Object.assign(dbRow, {
              rainfall_correct: newCorrect,
              rainfall_usable: newUsable,
              rainfall_unusable: newUnusable,
              rainfall_correct_plus_usable: newCorrect + newUsable,
              rainfall_valid_days: statistics.validDays,
              rainfall_missing_days: statistics.missingDays,
              rainfall_yy: statistics.YY,
              rainfall_yn: statistics.YN,
              rainfall_ny: statistics.NY,
              rainfall_nn: statistics.NN,
              rainfall_yu: statistics.YU,
              rainfall_nu: statistics.NU,
              rainfall_matching_cases: matchingCases,
              rainfall_total_days: statistics.totalDays
            });
          } else {
            Object.assign(dbRow, {
              parameter_correct: statistics.correct,
              parameter_usable: statistics.usable,
              parameter_unusable: statistics.unusable,
              parameter_correct_plus_usable: statistics.correct +
statistics.usable,
              parameter_valid_days: statistics.validDays,
              parameter_missing_days: statistics.missingDays,
              parameter_n1: statistics.n1,
              parameter_n2: statistics.n2,
              parameter_n3: statistics.n3,
              parameter_threshold1: statistics.threshold1,
              parameter_threshold2: statistics.threshold2,
              parameter_use_n11_for_unusable: statistics.useN11ForUnusable
            });
          }

          dbData.push(dbRow);
        }
      }
    }

    if (dbData.length === 0) {
      showAllDaysStatus('❌ No analysis data generated. Please check your data and criteria.', 'error');
      return;
    }

    showAllDaysStatus('💾 Storing analysis results in database...', 'info');

    // Insert data into comprehensive_analysis table
    const { error } = await client
      .from('comprehensive_analysis')
      .insert(dbData);

    if (error) {
      throw error;
    }

    showAllDaysStatus(`✅ Successfully stored ${dbData.length} analysis
records for sheet "${sheetName}".`, 'success');

    // Clear the sheet name input
    if (sheetNameInput) {
      sheetNameInput.value = '';
    }

    // Refresh the comprehensive sheets list
    await refreshComprehensiveSheetsUI();
    await loadComprehensiveSheetNames();

  } catch (error) {
    console.error('Error in calculateAndStoreAllDaysData:', error);
    showAllDaysStatus('❌ Error calculating and storing all days data: ' + error.message, 'error');
  }
}

// Helper function to show status messages for all days processing
function showAllDaysStatus(message, type) {
  const statusDiv = document.getElementById('allDaysProcessingStatus');
  if (!statusDiv) return;

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

// Validate comprehensive sheet name
function validateComprehensiveSheetName() {
  const sheetName =
document.getElementById('comprehensiveSheetName').value.trim();
  const validationDiv =
document.getElementById('comprehensiveSheetNameValidation');

  if (!sheetName) {
    validationDiv.textContent = "Please enter a sheet name for comprehensive analysis.";
    validationDiv.style.display = "block";
    return false;
  }

  // Check if sheet name already exists in comprehensive_analysis table
  // This will be checked again when the function is called, but we can do a basic validation here
  if (sheetName.length < 3) {
    validationDiv.textContent = "Sheet name must be at least 3 characters long.";
    validationDiv.style.display = "block";
    return false;
  }

  validationDiv.style.display = "none";
  return true;
}

// Load distinct comprehensive sheet names and populate Step 2/3 dropdowns
async function loadComprehensiveSheetNames() {
  try {
    // Collect sheet names from both analysis and summary tables and merge
    const analysisQuery = client
      .from('comprehensive_analysis')
      .select('sheet_name, created_at')
      .not('sheet_name', 'is', null);
    const summaryQuery = client
      .from('comprehensive_summary')
      .select('sheet_name, analysis_date')
      .not('sheet_name', 'is', null);

    const [analysisData, summaryData] = await Promise.all([
      fetchAllRows(analysisQuery, 'sheet_name', true),
      fetchAllRows(summaryQuery, 'sheet_name', true)
    ]);

    const names = [];
    (analysisData || []).forEach(r => names.push((r.sheet_name || '').trim()));
    (summaryData || []).forEach(r => names.push((r.sheet_name || '').trim()));
    const uniqueSheets = [...new Set(names.filter(n => n))].sort();

    const viewSel = document.getElementById('viewSheetName');
    const graphSel = document.getElementById('graphSheetName');
    if (viewSel) {
      // Reset options, preserve the placeholder
      viewSel.innerHTML = '<option value="">-- Select Sheet --</option>';
      uniqueSheets.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        viewSel.appendChild(opt);
      });
    }
    if (graphSel) {
      graphSel.innerHTML = '<option value="">-- Select Sheet --</option>';
      uniqueSheets.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        graphSel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Error loading comprehensive sheet names:', e);
  }
}

// Manage Comprehensive Sheets: load and display list
async function loadComprehensiveSheetInfo() {
  try {
    const baseQuery = client
      .from('comprehensive_analysis')
      .select('sheet_name, day_number, district_name, parameter_name, created_at')
      .not('sheet_name', 'is', null);

    const data = await fetchAllRows(baseQuery, 'sheet_name', true);

    const sheetGroups = {};
    data.forEach(row => {
      const key = (row.sheet_name || '').trim();
      if (!key) return;
      if (!sheetGroups[key]) {
        sheetGroups[key] = {
          name: key,
          records: 0,
          districts: new Set(),
          parameters: new Set(),
          days: new Set(),
          createdAt: row.created_at || null
        };
      }
      sheetGroups[key].records++;
      if (row.district_name) sheetGroups[key].districts.add(row.district_name);
      if (row.parameter_name)
sheetGroups[key].parameters.add(row.parameter_name);
      if (row.day_number != null) sheetGroups[key].days.add(row.day_number);
    });

    const compSheets = Object.values(sheetGroups).map(s => ({
      ...s,
      districtCount: s.districts.size,
      parameterCount: s.parameters.size,
      daysList: Array.from(s.days).sort((a,b)=>a-b)
    }));

    updateComprehensiveSheetDisplay(compSheets);
  } catch (error) {
    console.error('Error loading comprehensive sheet info:', error);
  }
}

function updateComprehensiveSheetDisplay(sheets) {
  const contentDiv = document.getElementById('comprehensiveSheetContent');
  const countSpan = document.getElementById('comprehensiveSheetCount');
  if (!contentDiv || !countSpan) return;

  countSpan.textContent = sheets.length;
  if (sheets.length === 0) {
    contentDiv.innerHTML = '<p style="color: #666; font-style: italic; padding: 15px;">No comprehensive sheets yet.</p>';
    return;
  }

  let html = '';
  sheets.forEach(s => {
    html += `
      <div class="sheet-item">
        <div class="sheet-info">
          <div class="sheet-name">🧾 ${s.name}</div>
          <div class="sheet-meta">
            ${s.records} rows • ${s.districtCount} districts •
${s.parameterCount} parameters • Days: ${s.daysList.join(', ')}
          </div>
        </div>
        <div class="sheet-actions">
          <button class="btn-info"
onclick="confirmDeleteComprehensiveSheet('${s.name}')">🗑️
Delete</button>
        </div>
      </div>
    `;
  });
  contentDiv.innerHTML = html;
}

function toggleComprehensiveSheetList() {
  const listElement = document.getElementById('comprehensiveSheetList');
  const btnElement = document.getElementById('toggleComprehensiveBtn');
  if (!listElement || !btnElement) return;
  if (listElement.style.display === 'none') {
    listElement.style.display = 'block';
    btnElement.innerHTML = btnElement.innerHTML.replace('📂 Show', '📁 Hide');
  } else {
    listElement.style.display = 'none';
    btnElement.innerHTML = btnElement.innerHTML.replace('📁 Hide', '📂 Show');
  }
}

function confirmDeleteComprehensiveSheet(sheetName) {
  if (confirm(`Delete comprehensive sheet "${sheetName}" from all
comprehensive tables? This cannot be undone.`)) {
    deleteComprehensiveSheet(sheetName);
  }
}

async function deleteComprehensiveSheet(sheetName) {
  try {
    await client.from('comprehensive_analysis').delete().eq('sheet_name',
sheetName);
    await client.from('comprehensive_raw_data').delete().eq('sheet_name',
sheetName);
    await client.from('comprehensive_summary').delete().eq('sheet_name',
sheetName);
  } catch (e) {
    console.error('Error deleting comprehensive sheet:', e);
  } finally {
    await refreshComprehensiveSheetsUI();
  }
}

async function refreshComprehensiveSheetsUI() {
  await loadComprehensiveSheetNames();
  await loadComprehensiveSheetInfo();
}

// Step 2: View Stored Comprehensive Data
async function viewStoredComprehensiveData() {
  try {
    const sheetSel = document.getElementById('viewSheetName');
    const daySel = document.getElementById('viewDaySelection');
    const status = document.getElementById('viewDataStatus');
    if (status) status.textContent = '';

    const sheetName = sheetSel ? sheetSel.value.trim() : '';
    const dayFilter = daySel ? daySel.value : 'all';
    if (!sheetName) {
      if (status) status.textContent = 'Please select a sheet.';
      return;
    }

    // Load rows from comprehensive_analysis for this sheet (optionally by day)
    let query = client
      .from('comprehensive_analysis')
      .select('*')
      .eq('sheet_name', sheetName);
    if (dayFilter !== 'all') {
      const dayNum = parseInt(dayFilter, 10);
      if (!isNaN(dayNum)) query = query.eq('day_number', dayNum);
    }

    // Use paginator to fetch all
    const data = await fetchAllRows(query, 'id', true);

    // Load raw comprehensive data for rainfall recomputation (if available)
    let rawQuery = client
      .from('comprehensive_raw_data')
      .select('sheet_name, day_number, district_name, forecast_date, observation_date, rainfall_forecast, rainfall_observation')
      .eq('sheet_name', sheetName);
    if (dayFilter !== 'all') {
      const dayNum = parseInt(dayFilter, 10);
      if (!isNaN(dayNum)) rawQuery = rawQuery.eq('day_number', dayNum);
    }
    const rawData = await fetchAllRows(rawQuery, 'day_number', true);

    // Group by day and district for display
    const grouped = {};
    data.forEach(r => {
      const day = r.day_number;
      const district = r.district_name;
      if (!grouped[day]) grouped[day] = {};
      if (!grouped[day][district]) grouped[day][district] = {};
      grouped[day][district][r.parameter_name] = r;
    });

    // Group raw rainfall rows by day and district for recompute
    const rawGrouped = {};
    rawData.forEach(r => {
      const day = r.day_number;
      const district = r.district_name;
      if (!rawGrouped[day]) rawGrouped[day] = {};
      if (!rawGrouped[day][district]) rawGrouped[day][district] = [];
      rawGrouped[day][district].push(r);
    });

    // Prepare fallback data direct from full_forecast/full_observation if raw is unavailable
    const allDays = Object.keys(grouped).map(n => parseInt(n,
10)).filter(n => !isNaN(n));
    const allDistricts = Array.from(new Set(
      Object.values(grouped).flatMap(dmap => Object.keys(dmap))
    ));

    let fallbackForecast = {};
    let fallbackObservation = {};
    if (allDays.length > 0 && allDistricts.length > 0) {
      // Load all forecast/observation records for the selected days and districts
      const fcQuery = client
        .from('full_forecast')
        .select('day_number, district_name, forecast_date, rainfall')
        .in('day_number', allDays)
        .in('district_name', allDistricts);
      const obsQuery = client
        .from('full_observation')
        .select('day_number, district_name, observation_date, rainfall')
        .in('day_number', allDays)
        .in('district_name', allDistricts);

      const [fcRows, obsRows] = await Promise.all([
        fetchAllRows(fcQuery, 'forecast_date', true),
        fetchAllRows(obsQuery, 'observation_date', true)
      ]);

      // Group by day/district for fast access
      fcRows.forEach(r => {
        const d = r.day_number, dist = r.district_name;
        if (!fallbackForecast[d]) fallbackForecast[d] = {};
        if (!fallbackForecast[d][dist]) fallbackForecast[d][dist] = [];
        fallbackForecast[d][dist].push({ forecast_date:
r.forecast_date, rainfall: r.rainfall });
      });
      obsRows.forEach(r => {
        const d = r.day_number, dist = r.district_name;
        if (!fallbackObservation[d]) fallbackObservation[d] = {};
        if (!fallbackObservation[d][dist]) fallbackObservation[d][dist] = [];
        fallbackObservation[d][dist].push({ observation_date:
r.observation_date, rainfall: r.rainfall });
      });
    }

    // Prepare for rendering but do not show yet until after computations
    const container =
document.getElementById('allDaysComprehensiveResultsSection');
    const tableDiv = document.getElementById('allDaysComprehensiveTable');
    const summaryDiv = document.getElementById('allDaysComprehensiveSummary');
    if (container) container.style.display = 'none';
    if (summaryDiv) summaryDiv.innerHTML = '';

    const params =
['rainfall','temp_max_c','temp_min_c','humidity_1','humidity_2','wind_speed_kmph','wind_direction_deg','cloud_cover_octa'];

    let html = '<table style="width:100%;font-size:12px;">';
    // Header with four sub-columns per parameter (rainfall driven by FvO map if available)
    html += '<thead>';
    html += '<tr><th rowspan="2">Day</th><th rowspan="2">District</th>';
    params.forEach(p => {
      const label = parameterNames[p] || p;
      html += `<th colspan="4" style="text-align:center;">${label}</th>`;
    });
    html += '</tr>';
    html += '<tr>';
    params.forEach(() => {
      html += '<th>Correct</th><th>Usable</th><th>Unusable</th><th>C+U</th>';
    });
    html += '</tr>';
    html += '</thead><tbody>';

    const days = Object.keys(grouped).map(n=>parseInt(n,10)).sort((a,b)=>a-b);
    days.forEach(day=>{
      const districts = Object.keys(grouped[day]).sort();
      districts.forEach(district=>{
        html += `<tr><td>Day ${day}</td><td>${district}</td>`;
        params.forEach(p=>{
          const rec = grouped[day][district][p];
          let correct=0, usable=0, unusable=0;
          if (p==='rainfall') {
            // Prefer precomputed FvO rainfall map if user ran the compute button
            const fromMap = window.fvoRainfallMap &&
window.fvoRainfallMap[day] && window.fvoRainfallMap[day][district];
            if (fromMap) {
              correct = fromMap.correct; usable = fromMap.usable;
unusable = fromMap.unusable;
            } else {
              // Fallback to recomputing from comprehensive raw pairs only (no stored values)
              const rows = (rawGrouped[day] &&
rawGrouped[day][district]) ? rawGrouped[day][district] : [];
              if (rows.length > 0) {
                const forecastData = rows
                  .filter(r => r.forecast_date)
                  .map(r => ({ forecast_date: r.forecast_date,
rainfall: r.rainfall_forecast }))
                  .filter(x => x.rainfall != null);
                const observationData = rows
                  .filter(r => r.observation_date)
                  .map(r => ({ observation_date: r.observation_date,
rainfall: r.rainfall_observation }))
                  .filter(x => x.rainfall != null);
                const cuu = computeRainfallCUUFromPairs(forecastData,
observationData);
                correct = cuu.correct; usable  = cuu.usable; unusable=
cuu.unusable;
              } else {
                correct = NaN; usable = NaN; unusable = NaN;
              }
            }
          } else if (rec) {
            correct = Number(rec.parameter_correct||0);
            usable  = Number(rec.parameter_usable||0);
            unusable= Number(rec.parameter_unusable||0);
          }
          const cu = (correct||0) + (usable||0);
          // Four cells per parameter
          html += `<td>${isNaN(correct)?'-':correct.toFixed(1)}%</td>`;
          html += `<td>${isNaN(usable)?'-':usable.toFixed(1)}%</td>`;
          html += `<td>${isNaN(unusable)?'-':unusable.toFixed(1)}%</td>`;
          let style = 'font-weight:bold;';
          if (cu >= 75) style += 'background:#d4edda;color:#155724;';
          else if (cu > 50) style += 'background:#fff3cd;color:#856404;';
          else style += 'background:#f8d7da;color:#721c24;';
          html += `<td style="${style}">${isNaN(cu)?'-':cu.toFixed(1)}%</td>`;
        });
        html += '</tr>';
      });
    });
    html += '</tbody></table>';
    if (summaryDiv) summaryDiv.innerHTML = `<div
style="background:#f8f9fa;padding:10px;border-radius:8px;">Viewing
sheet: <strong>${sheetName}</strong>${dayFilter==='all'?'':' • Day '+dayFilter}</div>`;
    if (tableDiv) tableDiv.innerHTML = html;
    if (container) container.style.display = 'block';
  } catch (e) {
    const status = document.getElementById('viewDataStatus');
    if (status) status.textContent = 'Error: ' + e.message;
    console.error('viewStoredComprehensiveData error:', e);
  }
}

// Export the rendered All Days Comprehensive Analysis Results table to Excel
function exportAllDaysComprehensiveToExcel() {
  try {
    const tableContainer = document.getElementById('allDaysComprehensiveTable');
    if (!tableContainer || !tableContainer.querySelector('table')) {
      alert('No All Days Comprehensive Results to export. Please view stored data first.');
      return;
    }
    const table = tableContainer.querySelector('table');
    exportTableAsExcelHtml(table, 'AllDays_Comprehensive_Results.xls');
  } catch (e) {
    alert('Export failed: ' + e.message);
    console.error('exportAllDaysComprehensiveToExcel error:', e);
  }
}

// Generic: export an HTML table as Excel (preserves inline colors/styles)
function exportTableAsExcelHtml(tableElement, filename) {
  // Clone table and inline critical computed styles so Excel preserves colors
  const cloned = tableElement.cloneNode(true);
  const origCells = tableElement.querySelectorAll('th,td');
  const cloneCells = cloned.querySelectorAll('th,td');
  for (let i = 0; i < cloneCells.length; i++) {
    const src = origCells[i];
    const dst = cloneCells[i];
    if (!src || !dst) continue;
    const cs = window.getComputedStyle(src);
    const styleParts = [];
    // Preserve background and text color
    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')
styleParts.push(`background-color:${bg}`);
    const fg = cs.color;
    if (fg) styleParts.push(`color:${fg}`);
    // Preserve font-weight and alignment
    if (cs.fontWeight) styleParts.push(`font-weight:${cs.fontWeight}`);
    if (cs.textAlign) styleParts.push(`text-align:${cs.textAlign}`);
    if (cs.verticalAlign) styleParts.push(`vertical-align:${cs.verticalAlign}`);
    // Basic borders to improve readability in Excel
    styleParts.push('border:1px solid #ccc');
    styleParts.push('mso-number-format:\@');
    const existing = dst.getAttribute('style') || '';
    dst.setAttribute('style', existing + (existing &&
styleParts.length ? ';' : '') + styleParts.join(';'));
  }

  const excelHtml = `<!DOCTYPE html>
  <html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type"
content="application/vnd.ms-excel; charset=UTF-8"/>
      <!--[if gte mso 9]><xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>
          <x:ExcelWorksheet>
            <x:Name>Sheet1</x:Name>
            <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
          </x:ExcelWorksheet>
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
      </xml><![endif]-->
      <style>table,th,td{border-collapse:collapse;border:1px solid
#ccc;}</style>
    </head>
    <body>${cloned.outerHTML}</body>
  </html>`;

  const blob = new Blob([excelHtml], { type:
'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Generate Good/Moderate/Poor counts by day and parameter from All Days table, then build graphs
// function generateColorCountsAndGraphsFromAllDays() {
//   try {
//     const section =
// document.getElementById('allDaysComprehensiveResultsSection');
//     const tableContainer = document.getElementById('allDaysComprehensiveTable');
//     if (!section || !tableContainer || !tableContainer.querySelector('table')) {
//       alert('Please view the All Days Comprehensive results first.');
//       return;
//     }

//     // Parse table to get day, district and parameter blocks
//     const table = tableContainer.querySelector('table');
//     const headerRows = table.querySelectorAll('thead tr');
//     if (headerRows.length < 2) {
//       alert('Unexpected table format.');
//       return;
//     }

//     // Build parameter column ranges (each parameter has 4 sub-columns: Correct, Usable, Unusable, C+U)
//     const paramNames = [];
//     const paramColRanges = [];
//     const topHeaderCells = Array.from(headerRows[0].querySelectorAll('th'));
//     // Skip first two headers (Day, District)
//     let colIndex = 2;
//     for (let i = 2; i < topHeaderCells.length; i++) {
//       const th = topHeaderCells[i];
//       const span = parseInt(th.getAttribute('colspan') || '1', 10);
//       const label = th.textContent.trim();
//       paramNames.push(label);
//       paramColRanges.push({ start: colIndex, end: colIndex + span - 1 });
//       colIndex += span;
//     }

//     // Initialize counts: days 1..5 × parameters × categories
//     const days = [1,2,3,4,5];
//     const categories = ['Good', 'Moderate', 'Poor'];
//     const counts = {};
//     days.forEach(d => {
//       counts[d] = {};
//       paramNames.forEach(p => { counts[d][p] = { Good: 0, Moderate: 0,
// Poor: 0 }; });
//     });

//     // We classify by the C+U cell background color (same thresholds as UI coloring)
//     const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
//     bodyRows.forEach(tr => {
//       const tds = Array.from(tr.querySelectorAll('td'));
//       if (tds.length < 2) return;
//       const dayText = tds[0].textContent.trim();
//       const dayMatch = dayText.match(/Day\s*(\d+)/i);
//       if (!dayMatch) return;
//       const dayNum = parseInt(dayMatch[1], 10);
//       if (!days.includes(dayNum)) return;

//       // For each parameter, look at the C+U column cell style
//       paramColRanges.forEach((range, idx) => {
//         const cuIndex = range.end; // C+U is last of the 4 subcolumns
//         const cell = tds[cuIndex];
//         if (!cell) return;
//         const bg = window.getComputedStyle(cell).backgroundColor;
//         let cat = null;
//         if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
//           // Match colors used in UI: green (#d4edda), yellowc(#fff3cd), red (#f8d7da)
//           if (bg.includes('212, 237, 218')) cat = 'Good';
//           else if (bg.includes('255, 243, 205')) cat = 'Moderate';
//           else if (bg.includes('248, 215, 218')) cat = 'Poor';
//         }
//         if (cat) counts[dayNum][paramNames[idx]][cat] += 1;
//       });
//     });

//     // Build counts table
//     const countsSection = document.getElementById('colorCountsSection');
//     const countsDiv = document.getElementById('colorCountsTable');
//     countsSection.style.display = 'block';
//     let html = '<table style="width:100%; font-size:12px;">';
//     html += '<thead><tr><th>Parameter / Category</th>' + days.map(d =>
// `<th>Day ${d}</th>`).join('') + '</tr></thead><tbody>';
//     paramNames.forEach(p => {
//       categories.forEach(cat => {
//         html += `<tr><td>${p} — ${cat}</td>` + days.map(d =>
// `<td>${counts[d][p][cat]}</td>`).join('') + '</tr>';
//       });
//     });
//     html += '</tbody></table>';
//     countsDiv.innerHTML = html;

//     // Build bar charts
//     const chartsSection = document.getElementById('colorChartsSection');
//     const chartsContainer = document.getElementById('colorChartsContainer');
//     chartsSection.style.display = 'block';
//     chartsContainer.innerHTML = '';

//     const dayColors = 
//     paramNames.forEach((p, idx) => {
//       ['Good','Moderate','Poor'].forEach(cat => {
//         const canvas = document.createElement('canvas');
//         canvas.width = 400; canvas.height = 240;
//         chartsContainer.appendChild(canvas);
//         const ctx = canvas.getContext('2d');
//         const data = days.map(d => counts[d][p][cat]);
//         const color = cat === 'Good' ? '#28a745' : (cat === 'Moderate'
// ? '#ffc107' : '#dc3545');
//         new Chart(ctx, {
//           type: 'bar',
//           data: {
//             labels: days.map(d => `Day ${d}`),
//             datasets: [{ label: `${p} — ${cat}`, data, backgroundColor: color }]
//           },
//           options: {
//             responsive: false,
//             scales: {
//               y: { beginAtZero: true, suggestedMax: 30, ticks: { stepSize: 5 } }
//             }
//           }
//         });
//       });
//     });
//   } catch (e) {
//     alert('Failed to generate color counts/graphs: ' + e.message);
//     console.error(e);
//   }
// }

// // Export all generated color charts as PNGs in a single ZIP-like download (simplified sequential)
// async function exportAllColorCharts() {
//   try {
//     const container = document.getElementById('colorChartsContainer');
//     if (!container) return alert('No charts to export.');
//     const canvases = Array.from(container.querySelectorAll('canvas'));
//     if (canvases.length === 0) return alert('No charts to export.');

//     // Download each canvas as a PNG
//     for (let i = 0; i < canvases.length; i++) {
//       const canvas = canvases[i];
//       const link = document.createElement('a');
//       link.href = canvas.toDataURL('image/png');
//       link.download = `chart_${i+1}.png`;
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//       await new Promise(r => setTimeout(r, 200));
//     }
//   } catch (e) {
//     alert('Failed to export charts: ' + e.message);
//   }
// }

// // Export all charts embedded into an Excel workbook
// function exportAllColorChartsToExcel() {
//   try {
//     const container = document.getElementById('colorChartsContainer');
//     if (!container) return alert('No charts to export.');
//     const canvases = Array.from(container.querySelectorAll('canvas'));
//     if (canvases.length === 0) return alert('No charts to export.');

//     // Use ExcelJS to embed images into worksheets
//     const wb = new ExcelJS.Workbook();
//     wb.creator = 'CWC Vizag';
//     wb.created = new Date();

//     const index = wb.addWorksheet('Index');
//     index.columns = [{ header: 'Chart Sheet', key: 'name', width: 30 }];

//     canvases.forEach((c, idx) => {
//       const wsName = `Chart_${idx+1}`;
//       const ws = wb.addWorksheet(wsName);
//       // Convert canvas to PNG buffer
//       const dataUrl = c.toDataURL('image/png');
//       const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
//       const imageId = wb.addImage({ base64: base64, extension: 'png' });
//       // Add image to sheet and size it
//       ws.addImage(imageId, {
//         tl: { col: 0, row: 0 },
//         ext: { width: Math.max(600, c.width), height: Math.max(350, c.height) }
//       });
//       index.addRow({ name: wsName });
//     });

//     wb.xlsx.writeBuffer().then(buffer => {
//       const blob = new Blob([buffer], { type:
// 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
// });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = 'Color_Charts.xlsx';
//       document.body.appendChild(a);
//       a.click();
//       document.body.removeChild(a);
//       URL.revokeObjectURL(url);
//     });
//   } catch (e) {
//     alert('Failed to export charts to Excel: ' + e.message);
//   }
// }
function generateColorCountsAndGraphsFromAllDays() {
  try {
    const section =
document.getElementById('allDaysComprehensiveResultsSection');
    const tableContainer = document.getElementById('allDaysComprehensiveTable');
    if (!section || !tableContainer || !tableContainer.querySelector('table')) {
      alert('Please view the All Days Comprehensive results first.');
      return;
    }

    // Parse table to get day, district and parameter blocks
    const table = tableContainer.querySelector('table');
    const headerRows = table.querySelectorAll('thead tr');
    if (headerRows.length < 2) {
      alert('Unexpected table format.');
      return;
    }

    // Build parameter column ranges (each parameter has 4 sub-columns: Correct, Usable, Unusable, C+U)
    const paramNames = [];
    const paramColRanges = [];
    const topHeaderCells = Array.from(headerRows[0].querySelectorAll('th'));
    // Skip first two headers (Day, District)
    let colIndex = 2;
    for (let i = 2; i < topHeaderCells.length; i++) {
      const th = topHeaderCells[i];
      const span = parseInt(th.getAttribute('colspan') || '1', 10);
      const label = th.textContent.trim();
      paramNames.push(label);
      paramColRanges.push({ start: colIndex, end: colIndex + span - 1 });
      colIndex += span;
    }

    // Initialize counts: days 1..5 × parameters × categories
    const days = [1,2,3,4,5];
    const categories = ['Good', 'Moderate', 'Poor'];
    const counts = {};
    days.forEach(d => {
      counts[d] = {};
      paramNames.forEach(p => { counts[d][p] = { Good: 0, Moderate: 0,
Poor: 0 }; });
    });

    // We classify by the C+U cell background color (same thresholds as UI coloring)
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    bodyRows.forEach(tr => {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length < 2) return;
      const dayText = tds[0].textContent.trim();
      const dayMatch = dayText.match(/Day\s*(\d+)/i);
      if (!dayMatch) return;
      const dayNum = parseInt(dayMatch[1], 10);
      if (!days.includes(dayNum)) return;

      // For each parameter, look at the C+U column cell style
      paramColRanges.forEach((range, idx) => {
        const cuIndex = range.end; // C+U is last of the 4 subcolumns
        const cell = tds[cuIndex];
        if (!cell) return;
        const bg = window.getComputedStyle(cell).backgroundColor;
        let cat = null;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          // Match colors used in UI: green (#d4edda), yellow (#fff3cd), red (#f8d7da)
          if (bg.includes('212, 237, 218')) cat = 'Good';
          else if (bg.includes('255, 243, 205')) cat = 'Moderate';
          else if (bg.includes('248, 215, 218')) cat = 'Poor';
        }
        if (cat) counts[dayNum][paramNames[idx]][cat] += 1;
      });
    });

    // Build counts table
    const countsSection = document.getElementById('colorCountsSection');
    const countsDiv = document.getElementById('colorCountsTable');
    countsSection.style.display = 'block';
    let html = '<table style="width:100%; font-size:12px;">';
    html += '<thead><tr><th>Parameter / Category</th>' + days.map(d =>
`<th>Day ${d}</th>`).join('') + '</tr></thead><tbody>';
    paramNames.forEach(p => {
      categories.forEach(cat => {
        html += `<tr><td>${p} — ${cat}</td>` + days.map(d =>
`<td>${counts[d][p][cat]}</td>`).join('') + '</tr>';
      });
    });
    html += '</tbody></table>';
    countsDiv.innerHTML = html;

    // Build bar charts
    const chartsSection = document.getElementById('colorChartsSection');
    const chartsContainer = document.getElementById('colorChartsContainer');
    chartsSection.style.display = 'block';
    chartsContainer.innerHTML = '';

    // Define day colors (avoiding green, red, yellow)
    //const dayColors = ['#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#34495e'];
    const dayColors = ['#e74c3c', '#3498db', '#27ae60', '#b7950b', '#fff9b0'];

    paramNames.forEach((p, idx) => {
      ['Good','Moderate','Poor'].forEach(cat => {
        const canvas = document.createElement('canvas');
        canvas.width = 400; canvas.height = 240;
        chartsContainer.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const data = days.map(d => counts[d][p][cat]);

        // Create datasets where each day has its own color
        const datasets = days.map((d, dayIdx) => ({
          label: `Day ${d}`,
          data: [counts[d][p][cat]],
          backgroundColor: dayColors[dayIdx % dayColors.length]
        }));

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: [cat],
            datasets: datasets
          },
          options: {
            responsive: false,
            scales: {
              y: { beginAtZero: true, suggestedMax: 30, ticks: { stepSize: 5 } }
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  usePointStyle: true
                }
              }
            }
          }
        });
      });
    });
  } catch (e) {
    alert('Failed to generate color counts/graphs: ' + e.message);
    console.error(e);
  }
}

// Export all generated color charts as PNGs in a single ZIP-like download (simplified sequential)
async function exportAllColorCharts() {
  try {
    const container = document.getElementById('colorChartsContainer');
    if (!container) return alert('No charts to export.');
    const canvases = Array.from(container.querySelectorAll('canvas'));
    if (canvases.length === 0) return alert('No charts to export.');

    // Download each canvas as a PNG
    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `chart_${i+1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    alert('Failed to export charts: ' + e.message);
  }
}

// Export all charts embedded into an Excel workbook
function exportAllColorChartsToExcel() {
  try {
    const container = document.getElementById('colorChartsContainer');
    if (!container) return alert('No charts to export.');
    const canvases = Array.from(container.querySelectorAll('canvas'));
    if (canvases.length === 0) return alert('No charts to export.');

    // Use ExcelJS to embed images into worksheets
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CWC Vizag';
    wb.created = new Date();

    const index = wb.addWorksheet('Index');
    index.columns = [{ header: 'Chart Sheet', key: 'name', width: 30 }];

    canvases.forEach((c, idx) => {
      const wsName = `Chart_${idx+1}`;
      const ws = wb.addWorksheet(wsName);
      // Convert canvas to PNG buffer
      const dataUrl = c.toDataURL('image/png');
      const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
      const imageId = wb.addImage({ base64: base64, extension: 'png' });
      // Add image to sheet and size it
      ws.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: Math.max(600, c.width), height: Math.max(350, c.height) }
      });
      index.addRow({ name: wsName });
    });

    wb.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type:
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Color_Charts.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  } catch (e) {
    alert('Failed to export charts to Excel: ' + e.message);
  }
}


function populateForecastCheckboxes(type, forecastCheckboxDiv) {
  forecastCheckboxDiv.innerHTML = '';

  // Add select all/clear all buttons for forecast sheets
  const forecastControls = document.createElement('div');
  forecastControls.className = 'checkbox-controls';
  forecastControls.style.cssText = 'margin-bottom: 10px; display: flex; gap: 10px;';

  const selectAllForecast = document.createElement('button');
  selectAllForecast.type = 'button';
  selectAllForecast.textContent = 'Select All';
  selectAllForecast.className = 'btn btn-sm btn-outline-primary';
  selectAllForecast.onclick = () => {
    forecastCheckboxDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    updateSheetSelectionSummary(type);
  };

  const clearAllForecast = document.createElement('button');
  clearAllForecast.type = 'button';
  clearAllForecast.textContent = 'Clear All';
  clearAllForecast.className = 'btn btn-sm btn-outline-secondary';
  clearAllForecast.onclick = () => {
    forecastCheckboxDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateSheetSelectionSummary(type);
  };

  forecastControls.appendChild(selectAllForecast);
  forecastControls.appendChild(clearAllForecast);
  forecastCheckboxDiv.appendChild(forecastControls);

  // Populate forecast sheets with checkboxes
  forecastSheets.forEach(sheet => {
    const checkboxItem = document.createElement('div');
    checkboxItem.className = 'checkbox-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = sheet.name;
    checkbox.id = `forecast_${type}_${sheet.name}`;
    checkbox.onchange = () => updateSheetSelectionSummary(type);

    const label = document.createElement('label');
    label.htmlFor = `forecast_${type}_${sheet.name}`;
    label.textContent = sheet.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'sheet-count';
    countSpan.textContent = `${sheet.records} records`;

    checkboxItem.appendChild(checkbox);
    checkboxItem.appendChild(label);
    checkboxItem.appendChild(countSpan);
    forecastCheckboxDiv.appendChild(checkboxItem);
  });
}

function populateObservationCheckboxes(type, observationCheckboxDiv) {
  observationCheckboxDiv.innerHTML = '';

  // Add select all/clear all buttons for observation sheets
  const observationControls = document.createElement('div');
  observationControls.className = 'checkbox-controls';
  observationControls.style.cssText = 'margin-bottom: 10px; display: flex; gap: 10px;';

  const selectAllObservation = document.createElement('button');
  selectAllObservation.type = 'button';
  selectAllObservation.textContent = 'Select All';
  selectAllObservation.className = 'btn btn-sm btn-outline-primary';
  selectAllObservation.onclick = () => {
    observationCheckboxDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    updateSheetSelectionSummary(type);
  };

  const clearAllObservation = document.createElement('button');
  clearAllObservation.type = 'button';
  clearAllObservation.textContent = 'Clear All';
  clearAllObservation.className = 'btn btn-sm btn-outline-secondary';
  clearAllObservation.onclick = () => {
    observationCheckboxDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateSheetSelectionSummary(type);
  };

  observationControls.appendChild(selectAllObservation);
  observationControls.appendChild(clearAllObservation);
  observationCheckboxDiv.appendChild(observationControls);

  // Populate observation sheets with checkboxes
  observationSheets.forEach(sheet => {
    const checkboxItem = document.createElement('div');
    checkboxItem.className = 'checkbox-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = sheet.name;
    checkbox.id = `observation_${type}_${sheet.name}`;
    checkbox.onchange = () => updateSheetSelectionSummary(type);

    const label = document.createElement('label');
    label.htmlFor = `observation_${type}_${sheet.name}`;
    label.textContent = sheet.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'sheet-count';
    countSpan.textContent = `${sheet.records} records`;

    checkboxItem.appendChild(checkbox);
    checkboxItem.appendChild(label);
    checkboxItem.appendChild(countSpan);
    observationCheckboxDiv.appendChild(checkboxItem);
  });


}

function validateSheetSelection(type) {
  let forecastCheckboxId, observationCheckboxId;

  if (type === 'comparison') {
    forecastCheckboxId = 'forecastSheetCheckboxes';
    observationCheckboxId = 'observationSheetCheckboxes';
  } else {
    forecastCheckboxId = 'forecastSheetCheckboxesComp';
    observationCheckboxId = 'observationSheetCheckboxesComp';
  }

  const selectedForecastSheets =
Array.from(document.querySelectorAll(`#${forecastCheckboxId}
input[type="checkbox"]:checked`)).map(cb => cb.value);
  const selectedObservationSheets =
Array.from(document.querySelectorAll(`#${observationCheckboxId}
input[type="checkbox"]:checked`)).map(cb => cb.value);

  return {
    forecastSheets: selectedForecastSheets,
    observationSheets: selectedObservationSheets,
    isValid: selectedForecastSheets.length > 0 &&
selectedObservationSheets.length > 0,
    forecastCount: selectedForecastSheets.length,
    observationCount: selectedObservationSheets.length
  };
}

async function loadDataBySheets(forecastSheetsOrOne,
observationSheetsOrOne, startDate = null, endDate = null) {
  try {
    let forecastQuery = client.from('full_forecast').select('*');
    let observationQuery = client.from('full_observation').select('*');

    // Apply sheet filters if specified
    const forecastSheets = Array.isArray(forecastSheetsOrOne) ?
forecastSheetsOrOne : (forecastSheetsOrOne ? [forecastSheetsOrOne] :
[]);
    const observationSheets = Array.isArray(observationSheetsOrOne) ?
observationSheetsOrOne : (observationSheetsOrOne ?
[observationSheetsOrOne] : []);
    if (forecastSheets.length > 0) {
      forecastQuery = forecastQuery.in('sheet_name', forecastSheets);
    }
    if (observationSheets.length > 0) {
      observationQuery = observationQuery.in('sheet_name', observationSheets);
    }

    // Apply date range filters if specified
    if (startDate && endDate) {
      forecastQuery = forecastQuery.gte('forecast_date',
startDate).lte('forecast_date', endDate);
      observationQuery = observationQuery.gte('observation_date',
startDate).lte('observation_date', endDate);
    }

    // Execute queries with pagination to fetch all rows
    const [forecastData, observationData] = await Promise.all([
      fetchAllRows(forecastQuery, 'forecast_date', true),
      fetchAllRows(observationQuery, 'observation_date', true)
    ]);

    return { forecastData, observationData };
  } catch (error) {
    console.error('Error loading data by sheets:', error);
    throw error;
  }
}

function addSheetSelectionSummary(type) {
  // Check if summary already exists
  const existingSummary = document.getElementById(`sheetSummary_${type}`);
  if (existingSummary) {
    // If summary exists, just update it and return
    updateSheetSelectionSummary(type);
    return;
  }

  // Add summary section
  const summaryDiv = document.createElement('div');
  summaryDiv.id = `sheetSummary_${type}`;
  summaryDiv.className = 'sheet-selection-summary';
  summaryDiv.style.cssText = 'margin-top: 15px; padding: 10px; background-color: #e8f4fd; border: 1px solid #bee5eb; border-radius: 4px; font-size: 13px;';

  const summaryTitle = document.createElement('strong');
  summaryTitle.textContent = 'Selected Sheets Summary: ';
  summaryDiv.appendChild(summaryTitle);

  const summaryText = document.createElement('span');
  summaryText.id = `summaryText_${type}`;
  summaryText.textContent = 'No sheets selected';
  summaryDiv.appendChild(summaryText);

  if (type === 'comparison') {
    document.getElementById('sheetSelectionComparison').appendChild(summaryDiv);
  } else {
    document.getElementById('sheetSelectionComprehensive').appendChild(summaryDiv);
  }

  // Initialize summary
  updateSheetSelectionSummary(type);
}

function updateSheetSelectionSummary(type) {
  let forecastCheckboxId, observationCheckboxId, summaryTextId;

  if (type === 'comparison') {
    forecastCheckboxId = 'forecastSheetCheckboxes';
    observationCheckboxId = 'observationSheetCheckboxes';
    summaryTextId = 'summaryText_comparison';
  } else {
    forecastCheckboxId = 'forecastSheetCheckboxesComp';
    observationCheckboxId = 'observationSheetCheckboxesComp';
    summaryTextId = 'summaryText_comprehensive';
  }

  const selectedForecastSheets =
Array.from(document.querySelectorAll(`#${forecastCheckboxId}
input[type="checkbox"]:checked`)).map(cb => cb.value);
  const selectedObservationSheets =
Array.from(document.querySelectorAll(`#${observationCheckboxId}
input[type="checkbox"]:checked`)).map(cb => cb.value);

  const summaryText = document.getElementById(summaryTextId);

  if (selectedForecastSheets.length === 0 &&
selectedObservationSheets.length === 0) {
    summaryText.textContent = 'No sheets selected';
    summaryText.style.color = '#dc3545';
  } else {
    let summary = '';

    // Calculate total records for forecast sheets
    if (selectedForecastSheets.length > 0) {
      const forecastRecords = selectedForecastSheets.reduce((total,
sheetName) => {
        const sheet = forecastSheets.find(s => s.name === sheetName);
        return total + (sheet ? sheet.records : 0);
      }, 0);
      summary += `Forecast: ${selectedForecastSheets.length} sheet(s) - ${forecastRecords} records`;
    }

    // Calculate total records for observation sheets
    if (selectedObservationSheets.length > 0) {
      if (summary) summary += ' | ';
      const observationRecords =
selectedObservationSheets.reduce((total, sheetName) => {
        const sheet = observationSheets.find(s => s.name === sheetName);
        return total + (sheet ? sheet.records : 0);
      }, 0);
      summary += `Observation: ${selectedObservationSheets.length}
sheet(s) - ${observationRecords} records`;
    }

    summaryText.textContent = summary;
    summaryText.style.color = '#28a745';
  }
}

// Performance optimization for large datasets
const CHUNK_SIZE = 1000; // Process 1000 records at a time
const RENDER_LIMIT = 5000; // Only render first 5000 rows in table
const MAX_MEMORY_THRESHOLD = 50000000; // 50MB memory threshold
const STREAMING_CHUNK_SIZE = 500; // Smaller chunks for streaming
const CACHE_SIZE_LIMIT = 10000; // Maximum records to keep in memory cache

async function processLargeDataset(data, processFunction,
progressCallback = null) {
  const totalRecords = data.length;
  const chunks = Math.ceil(totalRecords / CHUNK_SIZE);
  let processedRecords = 0;

  if (progressCallback) {
    progressCallback(0, totalRecords, 'Starting processing...');
  }

  const results = [];

  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalRecords);
    const chunk = data.slice(start, end);

    // Process chunk
    const chunkResults = await processFunction(chunk, i);
    results.push(...chunkResults);

    processedRecords += chunk.length;

    if (progressCallback) {
      const progress = Math.round((processedRecords / totalRecords) * 100);
      progressCallback(progress, totalRecords, `Processed
${processedRecords}/${totalRecords} records...`);
    }

    // Allow UI to update by yielding control
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  if (progressCallback) {
    progressCallback(100, totalRecords, 'Processing complete!');
  }

  return results;
}

function createVirtualTable(data, containerId, maxVisibleRows = 100) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (data.length === 0) {
    container.innerHTML = '<p>No data to display</p>';
    return;
  }

  // Show data summary
  const summary = document.createElement('div');
  summary.className = 'data-summary';
  summary.innerHTML = `
    <div style="background: #e8f4fd; padding: 10px; border-radius:
6px; margin-bottom: 15px;">
      <strong>📊 Data Summary:</strong>
${data.length.toLocaleString()} total records
      ${data.length > maxVisibleRows ? `(showing first
${maxVisibleRows.toLocaleString()} rows)` : ''}
    </div>
  `;
  container.appendChild(summary);

  // Create table with limited rows
  const table = document.createElement('table');
  table.className = 'data-table';

  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = Object.keys(data[0] || {});

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    th.style.cssText = 'padding: 8px; border: 1px solid #ddd; background: #f8f9fa; font-weight: 600;';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body with limited rows
  const tbody = document.createElement('tbody');
  const rowsToShow = Math.min(data.length, maxVisibleRows);

  for (let i = 0; i < rowsToShow; i++) {
    const row = document.createElement('tr');
    headers.forEach(header => {
      const td = document.createElement('td');
      td.textContent = formatValue(data[i][header]);
      td.style.cssText = 'padding: 6px; border: 1px solid #ddd; font-size: 12px;';
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  container.appendChild(table);

  // Add pagination controls if needed
  if (data.length > maxVisibleRows) {
    const pagination = createPaginationControls(data.length,
maxVisibleRows, (page) => {
      showTablePage(data, tbody, page, maxVisibleRows, headers);
    });
    container.appendChild(pagination);
  }

  // Add export button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = '📁 Export All Data';
  exportBtn.onclick = () => exportLargeDataset(data);
  exportBtn.style.cssText = 'margin-top: 15px;';
  container.appendChild(exportBtn);
}

function showTablePage(data, tbody, page, pageSize, headers) {
  const start = page * pageSize;
  const end = Math.min(start + pageSize, data.length);

  tbody.innerHTML = '';

  for (let i = start; i < end; i++) {
    const row = document.createElement('tr');
    headers.forEach(header => {
      const td = document.createElement('td');
      td.textContent = formatValue(data[i][header]);
      td.style.cssText = 'padding: 6px; border: 1px solid #ddd; font-size: 12px;';
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
}

function createPaginationControls(totalRecords, pageSize, onPageChange) {
  const totalPages = Math.ceil(totalRecords / pageSize);
  const container = document.createElement('div');
  container.className = 'pagination-controls';
  container.style.cssText = 'margin-top: 15px; text-align: center;';

  const info = document.createElement('div');
  info.style.cssText = 'margin-bottom: 10px; color: #666; font-size: 14px;';
  info.textContent = `Page 1 of ${totalPages}
(${totalRecords.toLocaleString()} total records)`;
  container.appendChild(info);

  const controls = document.createElement('div');
  controls.style.cssText = 'display: flex; justify-content: center; gap: 5px;';

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Previous';
  prevBtn.className = 'btn btn-sm';
  prevBtn.onclick = () => {
    const currentPage = Math.max(0, parseInt(info.dataset.currentPage
|| 1) - 2);
    onPageChange(currentPage);
    updatePaginationInfo(info, currentPage + 1, totalPages);
  };
  controls.appendChild(prevBtn);

  // Page numbers
  for (let i = 1; i <= Math.min(totalPages, 10); i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = 'btn btn-sm';
    pageBtn.style.cssText = i === 1 ? 'background: #007bff; color: white;' : '';
    pageBtn.onclick = () => {
      onPageChange(i - 1);
      updatePaginationInfo(info, i, totalPages);
      // Update button styles
      controls.querySelectorAll('button').forEach(btn => {
        if (btn !== pageBtn && btn !== prevBtn) {
          btn.style.cssText = '';
        }
      });
      pageBtn.style.cssText = 'background: #007bff; color: white;';
    };
    controls.appendChild(pageBtn);
  }

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.className = 'btn btn-sm';
  nextBtn.onclick = () => {
    const currentPage = Math.min(totalPages - 1,
parseInt(info.dataset.currentPage || 1));
    onPageChange(currentPage);
    updatePaginationInfo(info, currentPage + 1, totalPages);
  };
  controls.appendChild(nextBtn);

  container.appendChild(controls);

  // Store current page info
  info.dataset.currentPage = '1';

  return container;
}

function updatePaginationInfo(infoElement, currentPage, totalPages) {
  infoElement.textContent = `Page ${currentPage} of ${totalPages}`;
  infoElement.dataset.currentPage = currentPage.toString();
}

async function exportLargeDataset(data) {
  try {
    showStatus('📊 Preparing export for large dataset...', 'info');

    // Use Web Worker for large exports to prevent freezing
    if (data.length > 10000) {
      await exportWithWorker(data);
    } else {
      await exportToExcel(data);
    }

    showStatus('✅ Export completed successfully!', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showStatus('❌ Export failed: ' + error.message, 'error');
  }
}

async function exportWithWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(URL.createObjectURL(new Blob([`
      self.onmessage = function(e) {
        const { data, filename } = e.data;

        try {
          // Convert data to CSV
          const csv = convertToCSV(data);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

          // Create download link
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          link.click();

          self.postMessage({ success: true });
        } catch (error) {
          self.postMessage({ success: false, error: error.message });
        }
      };

      function convertToCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];

        for (const row of data) {
          const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') ?
'"' + value + '"' : value;
          });
          csvRows.push(values.join(','));
        }

        return csvRows.join('\\n');
      }
    `], { type: 'application/javascript' })));

    worker.onmessage = function(e) {
      if (e.data.success) {
        resolve();
      } else {
        reject(new Error(e.data.error));
      }
      worker.terminate();
    };

    worker.onerror = function(error) {
      reject(error);
      worker.terminate();
    };

    const filename = `export_${new Date().toISOString().split('T')[0]}.csv`;
    worker.postMessage({ data, filename });
  });
}

// Progress indicator functions for large dataset processing
function createProgressIndicator(message) {
  const container = document.createElement('div');
  container.className = 'progress-container';

  const title = document.createElement('div');
  title.textContent = message;
  title.style.cssText = 'font-weight: 600; margin-bottom: 10px; color: #495057;';

  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';

  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressFill.style.width = '0%';

  const progressText = document.createElement('div');
  progressText.className = 'progress-text';
  progressText.textContent = '0%';

  progressBar.appendChild(progressFill);
  container.appendChild(title);
  container.appendChild(progressBar);
  container.appendChild(progressText);

  // Store references for updates
  container.progressFill = progressFill;
  container.progressText = progressText;

  return container;
}

function updateProgressIndicator(container, percentage, message = '') {
  if (!container || !container.progressFill || !container.progressText) return;

  container.progressFill.style.width = `${percentage}%`;
  container.progressText.textContent = `${percentage}%`;

  if (message) {
    container.querySelector('div').textContent = message;
  }
}

function removeProgressIndicator(container) {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

// Memory management and optimization

// Memory management and optimization
class MemoryManager {
  constructor() {
    this.cache = new Map();
    this.memoryUsage = 0;
    this.lastCleanup = Date.now();
  }

  // Estimate memory usage of an object
  estimateMemoryUsage(obj) {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  }

  // Add data to cache with memory management
  addToCache(key, data) {
    const memoryUsage = this.estimateMemoryUsage(data);

    // Check if adding this would exceed memory threshold
    if (this.memoryUsage + memoryUsage > MAX_MEMORY_THRESHOLD) {
      this.performCleanup();
    }

    // If still too much memory, remove oldest entries
    if (this.memoryUsage + memoryUsage > MAX_MEMORY_THRESHOLD) {
      this.removeOldestEntries();
    }

    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      memoryUsage: memoryUsage
    });

    this.memoryUsage += memoryUsage;
  }

  // Get data from cache
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached) {
      // Update timestamp for LRU behavior
      cached.timestamp = Date.now();
      return cached.data;
    }
    return null;
  }

  // Remove oldest cache entries
  removeOldestEntries() {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (const [key, value] of entries) {
      this.cache.delete(key);
      this.memoryUsage -= value.memoryUsage;

      if (this.memoryUsage < MAX_MEMORY_THRESHOLD * 0.7) {
        break; // Stop when we're well below threshold
      }
    }
  }

  // Perform periodic cleanup
  performCleanup() {
    const now = Date.now();
    if (now - this.lastCleanup > 30000) { // Cleanup every 30 seconds
      this.removeOldestEntries();
      this.lastCleanup = now;
    }
  }

  // Clear all cache
  clearCache() {
    this.cache.clear();
    this.memoryUsage = 0;
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      memoryUsage: this.memoryUsage,
      maxMemory: MAX_MEMORY_THRESHOLD
    };
  }
}

// Initialize memory manager
const memoryManager = new MemoryManager();

// Enhanced streaming data processor for very large datasets
class StreamingDataProcessor {
  constructor() {
    this.processors = new Map();
    this.isProcessing = false;
  }

  // Register a data processor
  registerProcessor(name, processor) {
    this.processors.set(name, processor);
  }

  // Process data in streaming fashion
  async processStreaming(data, processorName, options = {}) {
    const processor = this.processors.get(processorName);
    if (!processor) {
      throw new Error(`Processor '${processorName}' not found`);
    }

    const {
      chunkSize = STREAMING_CHUNK_SIZE,
      progressCallback = null,
      memoryOptimization = true
    } = options;

    const totalRecords = data.length;
    const chunks = Math.ceil(totalRecords / chunkSize);
    let processedRecords = 0;
    let results = [];

    if (progressCallback) {
      progressCallback(0, totalRecords, 'Starting streaming processing...');
    }

    // Process data in small chunks to minimize memory usage
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalRecords);
      const chunk = data.slice(start, end);

      try {
        // Process chunk
        const chunkResults = await processor(chunk, i, {
          totalChunks: chunks,
          currentChunk: i,
          isLastChunk: i === chunks - 1
        });

        results.push(...chunkResults);
        processedRecords += chunk.length;

        // Memory optimization: clear chunk from memory
        if (memoryOptimization) {
          chunk.length = 0;
        }

        if (progressCallback) {
          const progress = Math.round((processedRecords / totalRecords) * 100);
          progressCallback(progress, totalRecords,
            `Processed
${processedRecords.toLocaleString()}/${totalRecords.toLocaleString()}
records...`);
        }

        // Allow UI to update and prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));

        // Check memory usage and perform cleanup if needed
        if (memoryOptimization && i % 10 === 0) {
          memoryManager.performCleanup();
        }

      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error);
        throw error;
      }
    }

    if (progressCallback) {
      progressCallback(100, totalRecords, 'Streaming processing complete!');
    }

    return results;
  }

  // Stop processing
  stop() {
    this.isProcessing = false;
  }
}

// Initialize streaming processor
const streamingProcessor = new StreamingDataProcessor();

// Register built-in processors
streamingProcessor.registerProcessor('comparison', async (chunk,
chunkIndex, context) => {
  // Process comparison data chunk
  const results = [];

  for (const row of chunk) {
    // Process each row for comparison
    const processed = await processComparisonRow(row);
    if (processed) {
      results.push(processed);
    }
  }

  return results;
});

streamingProcessor.registerProcessor('comprehensive', async (chunk,
chunkIndex, context) => {
  // Process comprehensive analysis chunk
  const results = [];

  for (const row of chunk) {
    // Process each row for comprehensive analysis
    const processed = await processComprehensiveRow(row);
    if (processed) {
      results.push(processed);
    }
  }

  return results;
});

// Helper function to process comparison row
async function processComparisonRow(row) {
  // Add your comparison logic here
  return row;
}

// Helper function to process comprehensive row
async function processComprehensiveRow(row) {
  // Add your comprehensive analysis logic here
  return row;
}

// Enhanced large dataset processing with memory management
async function processLargeDatasetOptimized(data, processFunction,
options = {}) {
  const {
    useStreaming = false,
    chunkSize = CHUNK_SIZE,
    progressCallback = null,
    memoryOptimization = true,
    processorName = null
  } = options;

  // Check if we should use streaming for very large datasets
  if (useStreaming && data.length > 50000) {
    if (!processorName) {
      throw new Error('Processor name required for streaming mode');
    }

    return await streamingProcessor.processStreaming(data, processorName, {
      chunkSize: STREAMING_CHUNK_SIZE,
      progressCallback,
      memoryOptimization
    });
  }

  // Use traditional chunked processing for smaller datasets
  return await processLargeDataset(data, processFunction, progressCallback);
}

// Data compression and optimization utilities
class DataOptimizer {
  // Compress data by removing unnecessary fields and optimizing structure
  static compressData(data, fieldsToKeep = null) {
    if (!Array.isArray(data) || data.length === 0) return data;

    const sample = data[0];
    const fields = fieldsToKeep || Object.keys(sample);

    return data.map(row => {
      const compressed = {};
      for (const field of fields) {
        if (row.hasOwnProperty(field)) {
          compressed[field] = row[field];
        }
      }
      return compressed;
    });
  }

  // Optimize data types for better memory usage
  static optimizeDataTypes(data) {
    if (!Array.isArray(data) || data.length === 0) return data;

    return data.map(row => {
      const optimized = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string' && value.length > 0) {
          // Convert short strings to more efficient format
          optimized[key] = value;
        } else if (typeof value === 'number') {
          // Keep numbers as is
          optimized[key] = value;
        } else if (value === null || value === undefined) {
          // Remove null/undefined values
          continue;
        } else {
          optimized[key] = value;
        }
      }
      return optimized;
    });
  }

  // Create data index for faster lookups
  static createIndex(data, keyField) {
    const index = new Map();

    for (let i = 0; i < data.length; i++) {
      const key = data[i][keyField];
      if (key !== undefined && key !== null) {
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key).push(i);
      }
    }

    return index;
  }

  // Filter data efficiently using index
  static filterWithIndex(data, index, keyValue) {
    const indices = index.get(keyValue);
    if (!indices) return [];

    return indices.map(i => data[i]);
  }
}

// Enhanced data loading with memory management
async function loadDataBySheetsOptimized(forecastSheetsOrOne,
observationSheetsOrOne, startDate = null, endDate = null, options =
{}) {
  const {
    useCache = true,
    compressData = true,
    optimizeTypes = true,
    maxRecords = null
  } = options;

  try {
    // Check cache first
    const cacheKey =
`sheets_${JSON.stringify(forecastSheetsOrOne)}_${JSON.stringify(observationSheetsOrOne)}_${startDate}_${endDate}`;

    if (useCache) {
      const cached = memoryManager.getFromCache(cacheKey);
      if (cached) {
        console.log('Using cached data');
        return cached;
      }
    }

    let forecastQuery = client.from('full_forecast').select('*');
    let observationQuery = client.from('full_observation').select('*');

    // Apply sheet filters if specified
    const forecastSheets = Array.isArray(forecastSheetsOrOne) ?
forecastSheetsOrOne : (forecastSheetsOrOne ? [forecastSheetsOrOne] :
[]);
    const observationSheets = Array.isArray(observationSheetsOrOne) ?
observationSheetsOrOne : (observationSheetsOrOne ?
[observationSheetsOrOne] : []);

    if (forecastSheets.length > 0) {
      forecastQuery = forecastQuery.in('sheet_name', forecastSheets);
    }
    if (observationSheets.length > 0) {
      observationQuery = observationQuery.in('sheet_name', observationSheets);
    }

    // Apply date range filters if specified
    if (startDate && endDate) {
      forecastQuery = forecastQuery.gte('forecast_date',
startDate).lte('forecast_date', endDate);
      observationQuery = observationQuery.gte('observation_date',
startDate).lte('observation_date', endDate);
    }

    // Apply record limit if specified
    if (maxRecords) {
      forecastQuery = forecastQuery.limit(maxRecords);
      observationQuery = observationQuery.limit(maxRecords);
    }

    // Execute queries with pagination to fetch all rows
    const [forecastData, observationData] = await Promise.all([
      fetchAllRows(forecastQuery, 'forecast_date', true),
      fetchAllRows(observationQuery, 'observation_date', true)
    ]);

    let result = { forecastData, observationData };

    // Optimize data if requested
    if (compressData) {
      result.forecastData = DataOptimizer.compressData(result.forecastData);
      result.observationData =
DataOptimizer.compressData(result.observationData);
    }

    if (optimizeTypes) {
      result.forecastData =
DataOptimizer.optimizeDataTypes(result.forecastData);
      result.observationData =
DataOptimizer.optimizeDataTypes(result.observationData);
    }

    // Cache the result
    if (useCache) {
      memoryManager.addToCache(cacheKey, result);
    }

    return result;
  } catch (error) {
    console.error('Error loading data by sheets:', error);
    throw error;
  }
}

// Memory usage monitoring
function monitorMemoryUsage() {
  if ('memory' in performance) {
    const memoryInfo = performance.memory;
    const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
    const totalMB = Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024);
    const limitMB = Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024);

    console.log(`Memory Usage: ${usedMB}MB / ${totalMB}MB (Limit:
${limitMB}MB)`);

    // Show warning if memory usage is high
    if (usedMB > limitMB * 0.8) {
      showMemoryWarning(usedMB, limitMB);
    }

    return { used: usedMB, total: totalMB, limit: limitMB };
  }
  return null;
}

// Show memory warning
function showMemoryWarning(used, limit) {
  const warningDiv = document.createElement('div');
  warningDiv.className = 'memory-warning';
  warningDiv.innerHTML = `
    <strong>⚠️ Memory Warning:</strong>
    High memory usage detected (${used}MB / ${limit}MB).
    Consider processing smaller datasets or clearing cache.
    <button onclick="this.parentElement.remove()" style="float: right;
background: none; border: none; color: #721c24; cursor:
pointer;">×</button>
  `;

  // Insert at top of page
  const container = document.querySelector('.container') || document.body;
  container.insertBefore(warningDiv, container.firstChild);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (warningDiv.parentElement) {
      warningDiv.parentElement.removeChild(warningDiv);
    }
  }, 10000);
}

// Enhanced comprehensive analysis with large dataset support
async function performComprehensiveAnalysisOptimized() {
  const day = document.getElementById('comprehensiveDay').value;
  const useDateRange =
document.getElementById('useDateRangeComprehensive').checked;
  const useSpecificSheets =
document.getElementById('useSpecificSheetsComprehensive').checked;
  const startDate = document.getElementById('comprehensiveStartDate').value;
  const endDate = document.getElementById('comprehensiveEndDate').value;

  if (!day) {
    showComprehensiveStatus('❌ Please select a day for analysis.', 'error');
    return;
  }

  let allForecastData, allObservationData;

  try {
    if (useSpecificSheets) {
      // Use specific sheets
      const sheetSelection = validateSheetSelection('comprehensive');

      if (!sheetSelection.isValid) {
        if (sheetSelection.forecastCount === 0) {
          showComprehensiveStatus('❌ Please select at least one forecast sheet.', 'error');
        } else {
          showComprehensiveStatus('❌ Please select at least one observation sheet.', 'error');
        }
        return;
      }

      const forecastSheets = sheetSelection.forecastSheets;
      const observationSheets = sheetSelection.observationSheets;

      showComprehensiveStatus('🔍 Loading data from selected sheets...', 'info');

      const dateRangeStart = useDateRange ? startDate : null;
      const dateRangeEnd = useDateRange ? endDate : null;

      if (useDateRange) {
        const validation = validateDateRange(startDate, endDate);
        if (!validation.valid) {
          showComprehensiveStatus('❌ ' + validation.message, 'error');
          return;
        }
      }

      // Use optimized data loading
      const { forecastData: dbForecastData, observationData:
dbObservationData } =
        await loadDataBySheetsOptimized(forecastSheets,
observationSheets, dateRangeStart, dateRangeEnd, {
          useCache: true,
          compressData: true,
          optimizeTypes: true
        });

      allForecastData = dbForecastData;
      allObservationData = dbObservationData;

    } else if (useDateRange) {
      // Use date range with all data
      const validation = validateDateRange(startDate, endDate);
      if (!validation.valid) {
        showComprehensiveStatus('❌ ' + validation.message, 'error');
        return;
      }

      showComprehensiveStatus('🔍 Loading data from database for date range...', 'info');

      [allForecastData, allObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

    } else {
      // Use existing processed data
      if (processedOutput.length === 0) {
        showComprehensiveStatus('❌ No forecast data available. Please process forecast data first or enable date range/sheet selection.',
'error');
        return;
      }

      if (processedObservationOutput.length === 0) {
        showComprehensiveStatus('❌ No observation data available. Please process observation data first or enable date range/sheet selection.', 'error');
        return;
      }

      allForecastData = processedOutput;
      allObservationData = processedObservationOutput;
    }

    // Check data size and use appropriate processing method
    const totalRecords = allForecastData.length + allObservationData.length;
    const useStreaming = totalRecords > 50000;

    if (useStreaming) {
      showComprehensiveStatus('🔍 Large dataset detected. Using streaming analysis...', 'info');
    }

    showComprehensiveStatus('🔍 Performing comprehensive analysis for all districts and parameters...', 'info');

    const dayNumber = parseInt(day.replace('Day', ''));
    const results = [];

    // Get all unique districts from the data
    const allDistricts = [...new Set(allForecastData.map(row =>
row.district_name))];
    const parameters = Object.keys(parameterNames);

    // Create progress indicator for large datasets
    let progressContainer = null;
    if (totalRecords > 10000) {
      progressContainer = createProgressIndicator('Processing comprehensive analysis...');
      document.getElementById('comprehensiveResultsSection').appendChild(progressContainer);
    }

    let processedDistricts = 0;

    // For each district, analyze all parameters
    for (const district of allDistricts) {
      const districtResult = {
        district: district,
        parameters: {}
      };

      for (const parameter of parameters) {
        // Filter forecast data for this district and day
        const forecastData = allForecastData.filter(row =>
          normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
          row.day_number === dayNumber
        );

        // Filter observation data for this district and day
        const observationData = allObservationData.filter(row =>
          normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
          row.day_number === dayNumber
        );

        if (forecastData.length > 0 && observationData.length > 0) {
          // Create comparison data for this parameter
          const comparisonData = createComparisonData(forecastData,
observationData, parameter);
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
              YU: statistics.YU,
              NU: statistics.NU,
              matchingCases: statistics.matchingCases,
              totalDays: statistics.totalDays,
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
          if (parameter === 'rainfall') {
            districtResult.parameters[parameter] = {
              correct: 0,
              usable: 0,
              unusable: 0,
              correctPlusUsable: 0,
              validDays: 0,
              missingDays: 0,
              YY: 0,
              YN: 0,
              NY: 0,
              NN: 0,
              YU: 0,
              NU: 0,
              matchingCases: 0,
              totalDays: 0,
              isRainfall: true
            };
          } else {
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
      }

      results.push(districtResult);
      processedDistricts++;

      // Update progress for large datasets
      if (progressContainer && totalRecords > 10000) {
        const progress = Math.round((processedDistricts /
allDistricts.length) * 100);
        updateProgressIndicator(progressContainer, progress,
          `Processed ${processedDistricts}/${allDistricts.length}
districts...`);
      }

      // Allow UI to update for large datasets
      if (totalRecords > 10000 && processedDistricts % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Calculate state-wide averages
    const stateAverages = calculateStateAverages(results, parameters);

    comprehensiveResults = {
      day: day,
      districts: results,
      stateAverages: stateAverages,
      parameters: parameters,
      useDateRange: useDateRange,
      useSpecificSheets: useSpecificSheets,
      forecastSheets: useSpecificSheets ?
validateSheetSelection('comprehensive').forecastSheets : null,
      observationSheets: useSpecificSheets ?
validateSheetSelection('comprehensive').observationSheets : null,
      startDate: startDate,
      endDate: endDate,
      totalRecords: totalRecords,
      processingMethod: useStreaming ? 'streaming' : 'standard'
    };

    // Display results
    displayComprehensiveResults(comprehensiveResults);

    document.getElementById('comprehensiveResultsSection').style.display
= 'block';

    // Remove progress indicator
    if (progressContainer) {
      removeProgressIndicator(progressContainer);
    }

    const analysisType = useSpecificSheets ? 'specific sheets' :
useDateRange ? `date range (${startDate} to ${endDate})` : 'processed data';
    const methodInfo = useStreaming ? ' using streaming processing' : '';
    showComprehensiveStatus(`✅ Comprehensive analysis completed for
${day} using ${analysisType}${methodInfo}.`, 'success');

    // Monitor memory usage
    monitorMemoryUsage();

  } catch (error) {
    console.error('Error in comprehensive analysis:', error);
    showComprehensiveStatus(`❌ Error during analysis:
${error.message}`, 'error');
  }
}

// Enhanced comparison function with large dataset support
/**
 * Part: Forecast vs Observation Comparison
 * Function: performComparisonOptimized
 * Purpose: Optimized variant of performComparison for large datasets
(streaming/caching).
 * Inputs: UI selections (day, district, parameter, date range/sheet options)
 * Output: Displays comparison results with improved performance
 * Preceded by: Data loading and cache utilities
 * Followed by: createComparisonData ->
calculateStatistics/calculateRainfallStatistics ->
displayComparisonResults
 */
async function performComparisonOptimized() {
  const day = document.getElementById('comparisonDay').value;
  const district = document.getElementById('comparisonDistrict').value;
  const parameter = document.getElementById('comparisonParameter').value;
  const useDateRange =
document.getElementById('useDateRangeComparison').checked;
  const useSpecificSheets =
document.getElementById('useSpecificSheetsComparison').checked;
  const startDate = document.getElementById('comparisonStartDate').value;
  const endDate = document.getElementById('comparisonEndDate').value;

  if (!day || !district || !parameter) {
    showComparisonStatus('❌ Please select day, district, and parameter for comparison.', 'error');
    return;
  }

  let forecastData, observationData;

  try {
    if (useSpecificSheets) {
      // Use specific sheets
      const sheetSelection = validateSheetSelection('comparison');

      if (!sheetSelection.isValid) {
        if (sheetSelection.forecastCount === 0) {
          showComparisonStatus('❌ Please select at least one forecast sheet.', 'error');
        } else {
          showComparisonStatus('❌ Please select at least one observation sheet.', 'error');
        }
        return;
      }

      const forecastSheets = sheetSelection.forecastSheets;
      const observationSheets = sheetSelection.observationSheets;

      showComparisonStatus('🔍 Loading data from selected sheets...', 'info');

      const dateRangeStart = useDateRange ? startDate : null;
      const dateRangeEnd = useDateRange ? endDate : null;

      if (useDateRange) {
        const validation = validateDateRange(startDate, endDate);
        if (!validation.valid) {
          showComparisonStatus('❌ ' + validation.message, 'error');
          return;
        }
      }

      // Use optimized data loading
      const { forecastData: dbForecastData, observationData:
dbObservationData } =
        await loadDataBySheetsOptimized(forecastSheets,
observationSheets, dateRangeStart, dateRangeEnd, {
          useCache: true,
          compressData: true,
          optimizeTypes: true
        });

      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = dbForecastData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

      observationData = dbObservationData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

    } else if (useDateRange) {
      // Use date range with all data
      const validation = validateDateRange(startDate, endDate);
      if (!validation.valid) {
        showComparisonStatus('❌ ' + validation.message, 'error');
        return;
      }

      showComparisonStatus('🔍 Loading data from database for date range...', 'info');

      const [dbForecastData, dbObservationData] = await Promise.all([
        loadForecastDataByDateRange(startDate, endDate),
        loadObservationDataByDateRange(startDate, endDate)
      ]);

      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = dbForecastData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

      observationData = dbObservationData.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

    } else {
      // Use existing processed data
      if (processedOutput.length === 0) {
        showComparisonStatus('❌ No forecast data available. Please process forecast data first or enable date range/sheet selection.',
'error');
        return;
      }

      if (processedObservationOutput.length === 0) {
        showComparisonStatus('❌ No observation data available. Please process observation data first or enable date range/sheet selection.',
'error');
        return;
      }

      const dayNumber = parseInt(day.replace('Day', ''));
      forecastData = processedOutput.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );

      observationData = processedObservationOutput.filter(row =>
        normalizeDistrictName(row.district_name) ===
normalizeDistrictName(district) &&
        row.day_number === dayNumber
      );
    }

    // Check if we have data to compare
    if (forecastData.length === 0) {
      showComparisonStatus('❌ No forecast data found for the selected criteria.', 'error');
      return;
    }

    if (observationData.length === 0) {
      showComparisonStatus('❌ No observation data found for the selected criteria.', 'error');
      return;
    }

    showComparisonStatus('🔍 Performing comparison analysis...', 'info');

    // Create comparison data
    const comparisonData = createComparisonData(forecastData,
observationData, parameter);
    const statistics = calculateStatistics(comparisonData, parameter);

    // Display results
    displayComparisonResults(comparisonData, statistics, day,
district, parameter);

    document.getElementById('comparisonResultsSection').style.display = 'block';

    const analysisType = useSpecificSheets ? 'specific sheets' :
useDateRange ? `date range (${startDate} to ${endDate})` : 'processed data';
    showComparisonStatus(`✅ Comparison completed for ${day},
${district}, ${parameter} using ${analysisType}.`, 'success');

    // Monitor memory usage
    monitorMemoryUsage();

  } catch (error) {
    console.error('Error in comparison:', error);
    showComparisonStatus(`❌ Error during comparison:
${error.message}`, 'error');
  }
}

// Cache management functions
function clearDataCache() {
  memoryManager.clearCache();
  showStatus('✅ Data cache cleared successfully.', 'success');
  console.log('Cache cleared');
}

function showCacheStats() {
  const stats = memoryManager.getCacheStats();
  const memoryMB = Math.round(stats.memoryUsage / 1024 / 1024);
  const maxMB = Math.round(MAX_MEMORY_THRESHOLD / 1024 / 1024);

  showStatus(`📊 Cache Stats: ${stats.size} entries, ${memoryMB}MB /
${maxMB}MB used`, 'info');
  console.log('Cache stats:', stats);
}

// Add cache management to the UI
function addCacheManagementUI() {
  // Add cache management buttons to the header or a suitable location
  const header = document.querySelector('header.header');
  if (header) {
    const cacheControls = document.createElement('div');
    cacheControls.style.cssText = 'margin-left: auto; display: flex; gap: 10px; align-items: center;';

    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.textContent = 'Clear Cache';
    clearCacheBtn.className = 'btn btn-sm btn-outline-warning';
    clearCacheBtn.onclick = clearDataCache;

    const cacheStatsBtn = document.createElement('button');
    cacheStatsBtn.textContent = 'Cache Stats';
    cacheStatsBtn.className = 'btn btn-sm btn-outline-info';
    cacheStatsBtn.onclick = showCacheStats;

    cacheControls.appendChild(cacheStatsBtn);
    cacheControls.appendChild(clearCacheBtn);

    header.appendChild(cacheControls);
  }
}

// Initialize cache management UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  addCacheManagementUI();

  // Monitor memory usage periodically
  setInterval(monitorMemoryUsage, 30000); // Check every 30 seconds
});

// Performance Graph Functions
async function generatePerformanceGraphs() {
  // No parameter selection anymore; we render charts for all parameters

  showGraphStatus('Generating performance graphs...', 'info');

  try {
    // Get the current comprehensive analysis data from multiple sources
    let comprehensiveData = window.lastComprehensiveData;

    // Debug logging
    console.log('window.lastComprehensiveData:', window.lastComprehensiveData);
    console.log('window.comprehensivePerformanceData:',
window.comprehensivePerformanceData);
    console.log('window.globalComprehensiveData:',
window.globalComprehensiveData);
    console.log('comprehensiveResults:', typeof comprehensiveResults
!== 'undefined' ? comprehensiveResults : 'undefined');

    // If window.lastComprehensiveData is not available, try to get it from multiple sources
    if (!comprehensiveData || !comprehensiveData.length) {
      // Try the alternative storage location
      if (window.comprehensivePerformanceData &&
window.comprehensivePerformanceData.length) {
        comprehensiveData = window.comprehensivePerformanceData;
        console.log('Using comprehensivePerformanceData:', comprehensiveData);
      } else if (window.globalComprehensiveData &&
Object.keys(window.globalComprehensiveData).length > 0) {
        // Try to get data from global storage
        const availableDays = Object.keys(window.globalComprehensiveData);
        console.log('Available days in global storage:', availableDays);
        if (availableDays.length > 0) {
          comprehensiveData = window.globalComprehensiveData[availableDays[0]];
          console.log('Using data from global storage:', comprehensiveData);
        }
      } else if (typeof comprehensiveResults !== 'undefined' &&
comprehensiveResults && comprehensiveResults.districts) {
        // Try to reconstruct the data from comprehensiveResults
        comprehensiveData = reconstructPerformanceData(comprehensiveResults);
        console.log('Reconstructed data:', comprehensiveData);
      }
    }

    if (!comprehensiveData || !comprehensiveData.length) {
      showGraphStatus('No comprehensive analysis data available. Please run comprehensive analysis first.', 'error');
      return;
    }

    // Build GOOD/MODERATE/POOR matrix using Correct+Usable % from comparison logic (>=75 good, 50-75 moderate, <50 poor)
    let matrix = null;
    if (Array.isArray(processedOutput) && processedOutput.length > 0
&& Array.isArray(processedObservationOutput) &&
processedObservationOutput.length > 0) {
      matrix = buildGmpMatrixAllDaysFromComparison(processedOutput,
processedObservationOutput);
    }
    // Fallbacks if needed
    if (!matrix) {
      if (Array.isArray(processedObservationOutput) &&
processedObservationOutput.length > 0) {
        matrix =
buildPerformanceMatrixFromProcessedObservation(processedObservationOutput);
      } else {
        matrix = buildPerformanceMatrixFromData(comprehensiveData);
      }
    }
    window.performanceMatrix = matrix;

    // Render the full table (all parameters, Good/Moderate/Poor under each)
    renderPerformanceMatrixTable(matrix);

    // Render grouped charts for all parameters
    renderAllParametersGroupedCharts(matrix);

    // Show the graph section
    document.getElementById('graphSection').style.display = 'none';
    document.getElementById('graphResultsSection').style.display = 'block';

    showGraphStatus('Performance graphs generated successfully!', 'success');
  } catch (error) {
    console.error('Error generating performance graphs:', error);
    showGraphStatus('Error generating performance graphs: ' +
error.message, 'error');
  }
}

function reconstructPerformanceData(comprehensiveResults) {
  // This function tries to reconstruct the performance data from the comprehensive results
  // It's a fallback when the raw data is not directly available

  if (!comprehensiveResults || !comprehensiveResults.districts) {
    return null;
  }

  const reconstructedData = [];
  const day = comprehensiveResults.day;

  // For each district, create a sample data point
  // Note: This is a simplified reconstruction - the actual values will be estimates
  comprehensiveResults.districts.forEach(district => {
    // Create a sample data point with estimated values based on performance
    reconstructedData.push({
      day: day,
      district: district.district,
      rainfall: 5, // Default sample value
      temp_max_c: 30, // Default sample value
      temp_min_c: 20, // Default sample value
      humidity_1: 60, // Default sample value
      humidity_2: 50, // Default sample value
      wind_speed_kmph: 15, // Default sample value
      wind_direction_deg: 180, // Default sample value
      cloud_cover_octa: 3 // Default sample value
    });
  });

  return reconstructedData;
}

// Build counts of Good/Moderate/Poor per day per parameter
function buildPerformanceMatrixFromData(rows) {
  const days = ['Day1', 'Day2', 'Day3', 'Day4', 'Day5'];
  const categories = ['GOOD', 'MODERATE', 'POOR'];
  const params = Object.keys(parameterNames);

  const matrix = { days, categories, parameters: params, counts: {} };
  params.forEach(p => {
    matrix.counts[p] = {};
    categories.forEach(c => {
      matrix.counts[p][c] = {};
      days.forEach(d => { matrix.counts[p][c][d] = 0; });
    });
  });

  function classify(parameter, value) {
    if (value === null || value === undefined ||
Number.isNaN(Number(value))) return null;
    const v = Number(value);
    switch (parameter) {
      case 'rainfall':
        return v === 0 ? 'GOOD' : v <= 10 ? 'MODERATE' : 'POOR';
      case 'temp_max_c':
        return v >= 25 && v <= 35 ? 'GOOD' : v >= 20 && v <= 40 ?
'MODERATE' : 'POOR';
      case 'temp_min_c':
        return v >= 15 && v <= 25 ? 'GOOD' : v >= 10 && v <= 30 ?
'MODERATE' : 'POOR';
      case 'humidity_1':
      case 'humidity_2':
        return v >= 40 && v <= 80 ? 'GOOD' : v >= 30 && v <= 90 ?
'MODERATE' : 'POOR';
      case 'wind_speed_kmph':
        return v <= 20 ? 'GOOD' : v <= 40 ? 'MODERATE' : 'POOR';
      case 'cloud_cover_octa':
        return v <= 4 ? 'GOOD' : v <= 6 ? 'MODERATE' : 'POOR';
      case 'wind_direction_deg':
        return 'MODERATE';
      default:
        return v >= 0 && v <= 100 ? 'GOOD' : v >= -50 && v <= 150 ?
'MODERATE' : 'POOR';
    }
  }

  rows.forEach(r => {
    const day = r.day;
    if (!days.includes(day)) return;
    params.forEach(p => {
      const cat = classify(p, r[p]);
      if (cat) matrix.counts[p][cat][day] += 1;
    });
  });

  return matrix;
}

// Build matrix directly from processed observation output (covers all days for each district)
function buildPerformanceMatrixFromProcessedObservation(obsRows) {
  // Map observation records to the simplified row format expected by
buildPerformanceMatrixFromData
  const rows = obsRows.map(r => ({
    day: `Day${r.day_number}`,
    district: r.district_name,
    rainfall: r.rainfall,
    temp_max_c: r.temp_max_c,
    temp_min_c: r.temp_min_c,
    humidity_1: r.humidity_1,
    humidity_2: r.humidity_2,
    wind_speed_kmph: r.wind_speed_kmph,
    wind_direction_deg: r.wind_direction_deg,
    cloud_cover_octa: r.cloud_cover_octa
  }));
  return buildPerformanceMatrixFromData(rows);
}

// NEW: Build matrix using Correct+Usable percentage from the same comparison logic as the
// "Forecast vs Observation Comparison" screen, aggregated per day and parameter, across all districts.
// Classification: >=75 -> GOOD, >50 && <75 -> MODERATE, <=50 -> POOR
function buildGmpMatrixAllDaysFromComparison(forecastRows, observationRows) {
  const days = ['Day1', 'Day2', 'Day3', 'Day4', 'Day5'];
  const categories = ['GOOD', 'MODERATE', 'POOR'];
  const parameters = Object.keys(parameterNames);

  const matrix = { days, categories, parameters, counts: {} };
  parameters.forEach(p => {
    matrix.counts[p] = {};
    categories.forEach(c => {
      matrix.counts[p][c] = {};
      days.forEach(d => { matrix.counts[p][c][d] = 0; });
    });
  });

  // Group by district and day for ALL days 1..5
  const byDistrictDay = new Map();
  forecastRows.forEach(fr => {
    const key = `${normalizeDistrictName(fr.district_name)}|${fr.day_number}`;
    if (!byDistrictDay.has(key)) byDistrictDay.set(key, { forecast:
[], observation: [] });
    byDistrictDay.get(key).forecast.push(fr);
  });
  observationRows.forEach(orow => {
    const key =
`${normalizeDistrictName(orow.district_name)}|${orow.day_number}`;
    if (!byDistrictDay.has(key)) byDistrictDay.set(key, { forecast:
[], observation: [] });
    byDistrictDay.get(key).observation.push(orow);
  });

  const dayLabel = (n) => `Day${n}`;

  // Iterate across all dayNumbers 1..5 to ensure we fill every day
  for (let dayNum = 1; dayNum <= 5; dayNum++) {
    // For every district seen in either forecast or observation, compute stats
    const districtKeysForDay = new Set();
    forecastRows.forEach(fr => { if (fr.day_number === dayNum)
districtKeysForDay.add(normalizeDistrictName(fr.district_name)); });
    observationRows.forEach(orow => { if (orow.day_number === dayNum)
districtKeysForDay.add(normalizeDistrictName(orow.district_name)); });

    districtKeysForDay.forEach(distKey => {
      const bundle = byDistrictDay.get(`${distKey}|${dayNum}`) || {
forecast: [], observation: [] };

      parameters.forEach(param => {
        const forecastData = bundle.forecast.filter(r => r.day_number
=== dayNum);
        const observationData = bundle.observation.filter(r =>
r.day_number === dayNum);
        if (!forecastData.length || !observationData.length) return;

        const comp = createComparisonData(forecastData, observationData, param);
        const stats = calculateStatistics(comp, param);
        const correctUsable = (stats.correct || 0) + (stats.usable || 0);

        let category = 'POOR';
        if (correctUsable >= 75) category = 'GOOD';
        else if (correctUsable > 50 && correctUsable < 75) category =
'MODERATE';
        else category = 'POOR';

        matrix.counts[param][category][dayLabel(dayNum)] += 1;
      });
    });
  }

  return matrix;
}

// Render the matrix as a table: columns grouped by parameter with sub-columns Good/Moderate/Poor
function renderPerformanceMatrixTable(matrix) {
  const container = document.getElementById('performanceTable');
  if (!container) return;

  let html = '';
  html += '<table class="data-table" style="width:100%; border-collapse:collapse; font-size:12px">';
  html += '<thead>';
  html += '<tr style="background:#f8f9fa">';
  html += '<th rowspan="2" style="min-width:120px; border:1px solid #dee2e6">Day</th>';
  matrix.parameters.forEach(p => {
    html += `<th colspan="3" style="text-align:center; border:1px
solid #ccc; background:#e9ecef">${parameterNames[p] || p}</th>`;
  });
  html += '</tr>';
  html += '<tr style="background:#f8f9fa">';
  matrix.parameters.forEach(() => {
    html += '<th style="background:#d4edda">GOOD</th><thstyle="background:#fff3cd">MODERATE</th><thstyle="background:#f8d7da">POOR</th>';
  });
  html += '</tr>';
  html += '</thead>';
  html += '<tbody>';
  matrix.days.forEach(d => {
    html += '<tr>';
    html += `<td style="font-weight:600; background:#fff3cd;
border:1px solid #dee2e6; text-align:center">${d}</td>`;
    matrix.parameters.forEach(p => {
      html += `<td style="text-align:center; border:1px solid
#dee2e6">${matrix.counts[p]['GOOD'][d]}</td>`;
      html += `<td style="text-align:center; border:1px solid
#dee2e6">${matrix.counts[p]['MODERATE'][d]}</td>`;
      html += `<td style="text-align:center; border:1px solid
#dee2e6">${matrix.counts[p]['POOR'][d]}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  html += '</table>';
  container.innerHTML = html;
}

// Render grouped chart for a single parameter: x-axis Good/Moderate/Poor, bars per day
function renderParameterGroupedChart(matrix, parameter) {
  const chartsContainer = document.getElementById('performanceCharts');
  if (!chartsContainer) return;

  const wrapper = document.createElement('div');
  wrapper.style.width = '900px';
  wrapper.style.maxWidth = '100%';
  wrapper.style.height = '420px';
  wrapper.style.margin = '10px auto';
  const title = document.createElement('h4');
  title.textContent = `${getParameterDisplayName(parameter)} performance`;
  title.style.textAlign = 'center';
  title.style.marginBottom = '10px';
  wrapper.appendChild(title);
  const canvas = document.createElement('canvas');
  canvas.id = `parameter_grouped_chart_${parameter}`;
  wrapper.appendChild(canvas);
  chartsContainer.appendChild(wrapper);

  const ctx = canvas.getContext('2d');
  const xCats = ['GOOD', 'MODERATE', 'POOR'];
  const dayColors = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6'];
  const datasets = matrix.days.map((d, idx) => ({
    label: d,
    data: xCats.map(c => matrix.counts[parameter][c][d]),
    backgroundColor: dayColors[idx % dayColors.length]
  }));

  new Chart(ctx, {
    type: 'bar',
    data: { labels: xCats, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 30, ticks: { stepSize: 2 } },
        x: { stacked: false }
      },
      plugins: { legend: { position: 'top' } }
    }
  });
}

// Render all parameters grouped charts in a grid
function renderAllParametersGroupedCharts(matrix) {
  const chartsContainer = document.getElementById('performanceCharts');
  if (!chartsContainer) return;
  chartsContainer.innerHTML = '';

  matrix.parameters.forEach(param => {
    renderParameterGroupedChart(matrix, param);
  });
}

function getParameterDisplayName(parameter) {
  const displayNames = {
    'rainfall': 'Rainfall',
    'temp_max_c': 'Maximum Temperature',
    'temp_min_c': 'Minimum Temperature',
    'humidity_1': 'Maximum Relative Humidity',
    'humidity_2': 'Minimum Relative Humidity',
    'wind_speed_kmph': 'Wind Speed',
    'wind_direction_deg': 'Wind Direction',
    'cloud_cover_octa': 'Cloud Cover'
  };
  return displayNames[parameter] || parameter;
}

function exportPerformanceToExcel() {
  try {
    // Get the performance data from the current display
    const performanceTable = document.getElementById('performanceTable');
    if (!performanceTable) {
      showGraphStatus('No performance data to export', 'error');
      return;
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(performanceTable.querySelector('table'));

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Performance_Analysis');

    // Save the file
    XLSX.writeFile(wb, `Performance_Analysis_${new
Date().toISOString().split('T')[0]}.xlsx`);

    showGraphStatus('Performance analysis exported successfully!', 'success');
  } catch (error) {
    console.error('Error exporting performance data:', error);
    showGraphStatus('Error exporting performance data: ' +
error.message, 'error');
  }
}

function showGraphStatus(message, type) {
  const statusElement = document.getElementById('graphProcessingStatus');
  if (statusElement) {
    statusElement.innerHTML = `<div class="status-message
status-${type}">${message}</div>`;
    setTimeout(() => {
      statusElement.innerHTML = '';
    }, 5000);
  }
}

function debugPerformanceData() {
  console.log('=== DEBUG PERFORMANCE DATA ===');
  console.log('window.lastComprehensiveData:', window.lastComprehensiveData);
  console.log('window.comprehensivePerformanceData:',
window.comprehensivePerformanceData);
  console.log('typeof comprehensiveResults:', typeof comprehensiveResults);
  console.log('comprehensiveResults:', comprehensiveResults);
  console.log('typeof processedOutput:', typeof processedOutput);
  console.log('processedOutput length:', processedOutput ?
processedOutput.length : 'undefined');
  console.log('typeof processedObservationOutput:', typeof
processedObservationOutput);
  console.log('processedObservationOutput length:',
processedObservationOutput ? processedObservationOutput.length :
'undefined');

  // Show debug info in the UI
  let debugInfo = '<div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 10px; font-family: monospace; font-size: 12px;">';
  debugInfo += '<strong>Debug Information:</strong><br>';
  debugInfo += `lastComprehensiveData: ${window.lastComprehensiveData
? window.lastComprehensiveData.length : 'undefined'} items<br>`;
  debugInfo += `comprehensivePerformanceData:
${window.comprehensivePerformanceData ?
window.comprehensivePerformanceData.length : 'undefined'} items<br>`;
  debugInfo += `globalComprehensiveData:
${window.globalComprehensiveData ?
Object.keys(window.globalComprehensiveData).length : 'undefined'}
days<br>`;
  debugInfo += `comprehensiveResults: ${typeof comprehensiveResults
!== 'undefined' ? 'defined' : 'undefined'}<br>`;
  debugInfo += `processedOutput: ${processedOutput ?
processedOutput.length : 'undefined'} items<br>`;
  debugInfo += `processedObservationOutput:
${processedObservationOutput ? processedObservationOutput.length :
'undefined'} items<br>`;

  // Add more detailed info
  if (window.lastComprehensiveData && window.lastComprehensiveData.length > 0) {
    debugInfo += `<br><strong>Sample Data:</strong><br>`;
    debugInfo += `First item:
${JSON.stringify(window.lastComprehensiveData[0])}<br>`;
  }

  if (window.globalComprehensiveData &&
Object.keys(window.globalComprehensiveData).length > 0) {
    debugInfo += `<br><strong>Global Storage:</strong><br>`;
    Object.keys(window.globalComprehensiveData).forEach(day => {
      debugInfo += `${day}:
${window.globalComprehensiveData[day].length} items<br>`;
    });
  }

  debugInfo += '</div>';

  const statusElement = document.getElementById('graphProcessingStatus');
  if (statusElement) {
    statusElement.innerHTML = debugInfo;
  }
}

function recreatePerformanceData() {
  console.log('=== RECREATING PERFORMANCE DATA ===');

  if (typeof comprehensiveResults === 'undefined' ||
!comprehensiveResults || !comprehensiveResults.districts) {
    showGraphStatus('No comprehensive results available. Please run comprehensive analysis first.', 'error');
    return;
  }

  try {
    // Get the current day from comprehensive results
    const day = comprehensiveResults.day;
    const dayNumber = parseInt(day.replace('Day', ''));

    // Check if we have the processed data
    if (typeof processedOutput === 'undefined' || !processedOutput ||
processedOutput.length === 0) {
      showGraphStatus('No processed forecast data available.', 'error');
      return;
    }

    if (typeof processedObservationOutput === 'undefined' ||
!processedObservationOutput || processedObservationOutput.length ===
0) {
      showGraphStatus('No processed observation data available.', 'error');
      return;
    }

    // Recreate the performance data
    const rawData = processedOutput.filter(row => row.day_number === dayNumber);
    const rawObservationData = processedObservationOutput.filter(row => row.day_number === dayNumber);

    console.log('Recreating with:', {
      dayNumber: dayNumber,
      rawDataLength: rawData.length,
      rawObservationDataLength: rawObservationData.length
    });

    window.lastComprehensiveData = [];

    // Combine and format the data for performance analysis
    rawData.forEach(forecastRow => {
      const observationRow = rawObservationData.find(obs =>
        normalizeDistrictName(obs.district_name) ===
normalizeDistrictName(forecastRow.district_name)
      );

      if (observationRow) {
        window.lastComprehensiveData.push({
          day: day,
          district: forecastRow.district_name,
          rainfall: observationRow.rainfall,
          temp_max_c: observationRow.temp_max_c,
          temp_min_c: observationRow.temp_min_c,
          humidity_1: observationRow.humidity_1,
          humidity_2: observationRow.humidity_2,
          wind_speed_kmph: observationRow.wind_speed_kmph,
          wind_direction_deg: observationRow.wind_direction_deg,
          cloud_cover_octa: observationRow.cloud_cover_octa
        });
      }
    });

    // Also store in the alternative location
    window.comprehensivePerformanceData = window.lastComprehensiveData;

    console.log('Recreated performance data:', window.lastComprehensiveData);
    showGraphStatus(`✅ Performance data recreated with
${window.lastComprehensiveData.length} items. You can now generate
graphs.`, 'success');

  } catch (error) {
    console.error('Error recreating performance data:', error);
    showGraphStatus('Error recreating performance data: ' +
error.message, 'error');
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load existing sheet names
    await loadExistingSheetNames();
    await loadExistingObservationSheetNames();

    // Setup event listeners
    setupEventListeners();
    setupObservationEventListeners();

    // Populate comparison dropdowns
    populateComparisonDropdowns();

    // Load sheet information
    await loadSheetInformation();

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Error initializing application:', error);
  }
});