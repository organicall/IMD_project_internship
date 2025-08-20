-- PostgreSQL Database Schema for IMD Excel Project Comprehensive Analysis
-- This schema stores comprehensive analysis results for all days and parameters

-- Create the comprehensive_analysis table to store results for all days
CREATE TABLE IF NOT EXISTS comprehensive_analysis (
    id SERIAL PRIMARY KEY,
    sheet_name VARCHAR(255) NOT NULL,
    analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 5),
    district_name VARCHAR(255) NOT NULL,
    parameter_name VARCHAR(50) NOT NULL,
    
    -- Rainfall specific fields (when parameter_name = 'rainfall')
    rainfall_correct DECIMAL(5,2),
    rainfall_usable DECIMAL(5,2),
    rainfall_unusable DECIMAL(5,2),
    rainfall_correct_plus_usable DECIMAL(5,2),
    rainfall_valid_days INTEGER,
    rainfall_missing_days INTEGER,
    rainfall_yy INTEGER,
    rainfall_yn INTEGER,
    rainfall_ny INTEGER,
    rainfall_nn INTEGER,
    rainfall_yu INTEGER,
    rainfall_nu INTEGER,
    rainfall_matching_cases INTEGER,
    rainfall_total_days INTEGER,
    
    -- Non-rainfall parameter fields
    parameter_correct DECIMAL(5,2),
    parameter_usable DECIMAL(5,2),
    parameter_unusable DECIMAL(5,2),
    parameter_correct_plus_usable DECIMAL(5,2),
    parameter_valid_days INTEGER,
    parameter_missing_days INTEGER,
    parameter_n1 INTEGER,
    parameter_n2 INTEGER,
    parameter_n3 INTEGER,
    parameter_threshold1 DECIMAL(10,2),
    parameter_threshold2 DECIMAL(10,2),
    parameter_use_n11_for_unusable BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_sheet_name ON comprehensive_analysis(sheet_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_day_number ON comprehensive_analysis(day_number);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_district ON comprehensive_analysis(district_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_parameter ON comprehensive_analysis(parameter_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_sheet_day ON comprehensive_analysis(sheet_name, day_number);

-- Create a view for easier querying of comprehensive results
CREATE OR REPLACE VIEW comprehensive_results_view AS
SELECT 
    sheet_name,
    day_number,
    district_name,
    parameter_name,
    CASE 
        WHEN parameter_name = 'rainfall' THEN rainfall_correct
        ELSE parameter_correct
    END as correct_percentage,
    CASE 
        WHEN parameter_name = 'rainfall' THEN rainfall_usable
        ELSE parameter_usable
    END as usable_percentage,
    CASE 
        WHEN parameter_name = 'rainfall' THEN rainfall_unusable
        ELSE parameter_unusable
    END as unusable_percentage,
    CASE 
        WHEN parameter_name = 'rainfall' THEN rainfall_correct_plus_usable
        ELSE parameter_correct_plus_usable
    END as correct_plus_usable_percentage,
    CASE 
        WHEN parameter_name = 'rainfall' THEN rainfall_valid_days
        ELSE parameter_valid_days
    END as valid_days,
    CASE 
        WHEN parameter_name = 'rainfall' THEN rainfall_missing_days
        ELSE parameter_missing_days
    END as missing_days,
    analysis_date,
    created_at
FROM comprehensive_analysis;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_comprehensive_analysis_updated_at 
    BEFORE UPDATE ON comprehensive_analysis 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a table to store the raw data used for comprehensive analysis
CREATE TABLE IF NOT EXISTS comprehensive_raw_data (
    id SERIAL PRIMARY KEY,
    sheet_name VARCHAR(255) NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 5),
    district_name VARCHAR(255) NOT NULL,
    forecast_date DATE NOT NULL,
    observation_date DATE NOT NULL,
    
    -- Parameter values
    rainfall_forecast DECIMAL(10,2),
    rainfall_observation DECIMAL(10,2),
    temp_max_c_forecast DECIMAL(10,2),
    temp_max_c_observation DECIMAL(10,2),
    temp_min_c_forecast DECIMAL(10,2),
    temp_min_c_observation DECIMAL(10,2),
    humidity_1_forecast DECIMAL(10,2),
    humidity_1_observation DECIMAL(10,2),
    humidity_2_forecast DECIMAL(10,2),
    humidity_2_observation DECIMAL(10,2),
    wind_speed_kmph_forecast DECIMAL(10,2),
    wind_speed_kmph_observation DECIMAL(10,2),
    wind_direction_deg_forecast DECIMAL(10,2),
    wind_direction_deg_observation DECIMAL(10,2),
    cloud_cover_octa_forecast DECIMAL(10,2),
    cloud_cover_octa_observation DECIMAL(10,2),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for raw data table
CREATE INDEX IF NOT EXISTS idx_comprehensive_raw_data_sheet_name ON comprehensive_raw_data(sheet_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_raw_data_day_number ON comprehensive_raw_data(day_number);
CREATE INDEX IF NOT EXISTS idx_comprehensive_raw_data_district ON comprehensive_raw_data(district_name);

-- Create a summary table for quick access to analysis results
CREATE TABLE IF NOT EXISTS comprehensive_summary (
    id SERIAL PRIMARY KEY,
    sheet_name VARCHAR(255) NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 5),
    total_districts INTEGER NOT NULL,
    total_parameters INTEGER NOT NULL DEFAULT 8,
    
    -- Average percentages across all districts for each parameter
    avg_rainfall_correct DECIMAL(5,2),
    avg_rainfall_usable DECIMAL(5,2),
    avg_rainfall_unusable DECIMAL(5,2),
    avg_rainfall_correct_plus_usable DECIMAL(5,2),
    
    avg_temp_max_correct DECIMAL(5,2),
    avg_temp_max_usable DECIMAL(5,2),
    avg_temp_max_unusable DECIMAL(5,2),
    avg_temp_max_correct_plus_usable DECIMAL(5,2),
    
    avg_temp_min_correct DECIMAL(5,2),
    avg_temp_min_usable DECIMAL(5,2),
    avg_temp_min_unusable DECIMAL(5,2),
    avg_temp_min_correct_plus_usable DECIMAL(5,2),
    
    avg_humidity_1_correct DECIMAL(5,2),
    avg_humidity_1_usable DECIMAL(5,2),
    avg_humidity_1_unusable DECIMAL(5,2),
    avg_humidity_1_correct_plus_usable DECIMAL(5,2),
    
    avg_humidity_2_correct DECIMAL(5,2),
    avg_humidity_2_usable DECIMAL(5,2),
    avg_humidity_2_unusable DECIMAL(5,2),
    avg_humidity_2_correct_plus_usable DECIMAL(5,2),
    
    avg_wind_speed_correct DECIMAL(5,2),
    avg_wind_speed_usable DECIMAL(5,2),
    avg_wind_speed_unusable DECIMAL(5,2),
    avg_wind_speed_correct_plus_usable DECIMAL(5,2),
    
    avg_wind_direction_correct DECIMAL(5,2),
    avg_wind_direction_usable DECIMAL(5,2),
    avg_wind_direction_unusable DECIMAL(5,2),
    avg_wind_direction_correct_plus_usable DECIMAL(5,2),
    
    avg_cloud_cover_correct DECIMAL(5,2),
    avg_cloud_cover_usable DECIMAL(5,2),
    avg_cloud_cover_unusable DECIMAL(5,2),
    avg_cloud_cover_correct_plus_usable DECIMAL(5,2),
    
    -- Metadata
    analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for summary table
CREATE INDEX IF NOT EXISTS idx_comprehensive_summary_sheet_name ON comprehensive_summary(sheet_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_summary_day_number ON comprehensive_summary(day_number);

-- Create a function to calculate and store comprehensive analysis for all days
CREATE OR REPLACE FUNCTION calculate_comprehensive_analysis_all_days(
    p_sheet_name VARCHAR(255)
)
RETURNS VOID AS $$
DECLARE
    v_day INTEGER;
    v_district RECORD;
    v_parameter VARCHAR(50);
    v_forecast_data RECORD;
    v_observation_data RECORD;
    v_analysis_result RECORD;
BEGIN
    -- Clear existing analysis for this sheet
    DELETE FROM comprehensive_analysis WHERE sheet_name = p_sheet_name;
    DELETE FROM comprehensive_raw_data WHERE sheet_name = p_sheet_name;
    DELETE FROM comprehensive_summary WHERE sheet_name = p_sheet_name;
    
    -- Loop through all 5 days
    FOR v_day IN 1..5 LOOP
        -- Process each district
        FOR v_district IN 
            SELECT DISTINCT district_name 
            FROM full_forecast 
            WHERE sheet_name = p_sheet_name
        LOOP
            -- Process each parameter
            FOREACH v_parameter IN ARRAY ARRAY['rainfall', 'temp_max_c', 'temp_min_c', 'humidity_1', 'humidity_2', 'wind_speed_kmph', 'wind_direction_deg', 'cloud_cover_octa']
            LOOP
                -- Get forecast and observation data for this day, district, and parameter
                SELECT * INTO v_forecast_data
                FROM full_forecast 
                WHERE sheet_name = p_sheet_name 
                AND day_number = v_day 
                AND district_name = v_district.district_name;
                
                SELECT * INTO v_observation_data
                FROM full_observation 
                WHERE sheet_name = p_sheet_name 
                AND day_number = v_day 
                AND district_name = v_district.district_name;
                
                -- Calculate analysis and store results
                -- This is a simplified version - the actual calculation logic will be in JavaScript
                INSERT INTO comprehensive_analysis (
                    sheet_name, day_number, district_name, parameter_name,
                    rainfall_correct, rainfall_usable, rainfall_unusable, rainfall_correct_plus_usable,
                    parameter_correct, parameter_usable, parameter_unusable, parameter_correct_plus_usable
                ) VALUES (
                    p_sheet_name, v_day, v_district.district_name, v_parameter,
                    0, 0, 0, 0,  -- rainfall values (to be calculated)
                    0, 0, 0, 0   -- parameter values (to be calculated)
                );
            END LOOP;
        END LOOP;
    END LOOP;
    
    -- Calculate summary statistics
    INSERT INTO comprehensive_summary (
        sheet_name, day_number, total_districts,
        avg_rainfall_correct, avg_rainfall_usable, avg_rainfall_unusable, avg_rainfall_correct_plus_usable
    )
    SELECT 
        sheet_name,
        day_number,
        COUNT(DISTINCT district_name) as total_districts,
        AVG(CASE WHEN parameter_name = 'rainfall' THEN rainfall_correct ELSE parameter_correct END) as avg_rainfall_correct,
        AVG(CASE WHEN parameter_name = 'rainfall' THEN rainfall_usable ELSE parameter_usable END) as avg_rainfall_usable,
        AVG(CASE WHEN parameter_name = 'rainfall' THEN rainfall_unusable ELSE parameter_unusable END) as avg_rainfall_unusable,
        AVG(CASE WHEN parameter_name = 'rainfall' THEN rainfall_correct_plus_usable ELSE parameter_correct_plus_usable END) as avg_rainfall_correct_plus_usable
    FROM comprehensive_analysis 
    WHERE sheet_name = p_sheet_name
    GROUP BY sheet_name, day_number;
    
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_user;

-- Insert sample data for testing (optional)
-- INSERT INTO comprehensive_analysis (sheet_name, day_number, district_name, parameter_name, parameter_correct, parameter_usable, parameter_unusable, parameter_correct_plus_usable)
-- VALUES ('test_sheet', 1, 'VISAKHAPATNAM', 'rainfall', 85.5, 10.2, 4.3, 95.7);

