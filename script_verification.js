const SUPABASE_URL = 'https://ndbsshedsranhvdsspyb.supabase.co'; // ⬅️ REPLACE
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnNzaGVkc3Jhbmh2ZHNzcHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTM2NTgsImV4cCI6MjA2ODA2OTY1OH0.2aGvJfaPVqiwXR_hPWbgSXl_BphvkEtAsg1rkOM-eVY';                    // ⬅️ REPLACE
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ District Dropdown List
const districts = [
  "Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla",
  "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur",
  "Kakinada", "Krishna", "Kurnool", "Nandyal", "Nellore", "NTR", "Palnadu",
  "Parvathipuram Manyam", "Prakasam", "Srikakulam", "Sri Sathya Sai", "Tirupati",
  "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"
];

const parameters = [
  "Rainfall (mm)", "Temp Max (deg C)", "Temp Min (deg C)",
  "Humidity-Morning(%)", "Humidity-Evening",
  "Windspeed (kmph)", "WindDirection (deg)", "CloudCover (octa)"
];

// ✅ Populate Dropdown
const dropdown = document.getElementById("districtDropdown");
districts.forEach(d => {
  const option = document.createElement("option");
  option.value = d;
  option.textContent = d;
  dropdown.appendChild(option);
});

// ✅ Handle Dropdown Change
dropdown.addEventListener("change", async () => {
  const district = dropdown.value;
  if (!district) return;

  // 🗂️ Fetch Forecast Data
  const { data: forecastData, error: fcError } = await client
    .from("forecast_excel_uploads")
    .select("forecast_date, district_name, temp_max_c")
    .eq("district_name", district);

  // 🗂️ Fetch Observation Data
  const { data: obsData, error: obsError } = await client
    .from("observation_data_flat")
    .select("forecast_date, district_name, temp_max_c")
    .eq("district_name", district);

  if (fcError || obsError) {
    console.error("Error fetching data:", fcError || obsError);
    return;
  }

  // 🔁 Match forecast and observed data by date
  const obsMap = {};
  obsData.forEach(row => {
    obsMap[row.forecast_date] = parseFloat(row.temp_max_c);
  });

  const tbody = document.querySelector("#comparisonTable tbody");
  tbody.innerHTML = "";

  forecastData.forEach(row => {
    const date = row.forecast_date;
    const fc = parseFloat(row.temp_max_c);
    const obs = obsMap[date];

    if (!isNaN(fc) && !isNaN(obs)) {
      const obsCorr = obs;
      const fcCorr = fc;
      const diff = Math.abs(obs - fc);
      const diffSq = diff ** 2;

      const tr = document.createElement("tr");
      [date, fc, obs, obsCorr, fcCorr, diff.toFixed(2), diffSq.toFixed(2)].forEach(val => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  });
});


//to add data in the table display
document.addEventListener('DOMContentLoaded', async () => {
    await populateDistrictDropdown();
  
    document.getElementById('compareBtn').addEventListener('click', async () => {
      const district = document.getElementById('districtDropdown').value;
      const parameter = document.getElementById('parameterDropdown').value;
  
      if (!district || !parameter) {
        alert('Please select both district and parameter');
        return;
      }
  
      await compareForecastAndObservation(district, parameter);
    });
  });
  
  // 🔻 Populate dropdown with distinct districts
  async function populateDistrictDropdown() {
    const { data, error } = await client
      .from('forecast_excel_uploads')
      .select('district_name');
  
    if (error) {
      console.error('Failed to fetch districts:', error.message);
      return;
    }
  
    const uniqueDistricts = [...new Set(data.map(d => d.district_name))];
    const dropdown = document.getElementById('districtDropdown');
  
    uniqueDistricts.forEach(district => {
      const option = document.createElement('option');
      option.value = district;
      option.textContent = district;
      dropdown.appendChild(option);
    });
  }
  
  // 🔁 Compare forecast and observation data
  async function compareForecastAndObservation(district, parameter) {
    const { data: forecastData, error: forecastError } = await client
      .from('forecast_excel_uploads')
      .select(`forecast_date, ${parameter}`)
      .eq('district_name', district);
  
    const { data: observationData, error: observationError } = await client
      .from('observation_data_flat')
      .select(`forecast_date, ${parameter}`)
      .eq('district_name', district);
  
    if (forecastError || observationError) {
      console.error('Data fetch error:', forecastError || observationError);
      return;
    }
  
    const obsMap = {};
    observationData.forEach(row => {
      obsMap[row.forecast_date] = parseFloat(row[parameter]);
    });
  
    const tbody = document.getElementById('comparisonBody');
    tbody.innerHTML = '';
  
    forecastData.forEach(fc => {
      const date = fc.forecast_date;
      const forecastValue = parseFloat(fc[parameter]);
      const obsValue = obsMap[date];
  
      if (isNaN(forecastValue) || isNaN(obsValue)) return;
  
      const absDiff = Math.abs(obsValue - forecastValue);
      const sqDiff = absDiff ** 2;
  
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${date}</td>
        <td>${forecastValue.toFixed(2)}</td>
        <td>${obsValue.toFixed(2)}</td>
        <td>${obsValue.toFixed(2)}</td>
        <td>${forecastValue.toFixed(2)}</td>
        <td>${absDiff.toFixed(2)}</td>
        <td>${sqDiff.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  