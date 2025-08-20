-- Quick Setup Script for Comprehensive Analysis System
-- Run this in your PostgreSQL database to set up the system

-- 1. Create the main comprehensive analysis table
CREATE TABLE IF NOT EXISTS comprehensive_analysis (
    id SERIAL PRIMARY KEY,
    sheet_name VARCHAR(255) NOT NULL,
    analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 5),
    district_name VARCHAR(255) NOT NULL,
    parameter_name VARCHAR(50) NOT NULL,
    
    -- Rainfall specific fields
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

-- 2. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_sheet_name ON comprehensive_analysis(sheet_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_day_number ON comprehensive_analysis(day_number);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_district ON comprehensive_analysis(district_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_analysis_parameter ON comprehensive_analysis(parameter_name);

-- 3. Create a view for easier querying
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
    analysis_date
FROM comprehensive_analysis;

-- 4. Create a summary table for quick access
CREATE TABLE IF NOT EXISTS comprehensive_summary (
    id SERIAL PRIMARY KEY,
    sheet_name VARCHAR(255) NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 5),
    total_districts INTEGER NOT NULL,
    total_parameters INTEGER NOT NULL DEFAULT 8,
    
    -- Average percentages for each parameter
    avg_rainfall_correct DECIMAL(5,2),
    avg_temp_max_correct DECIMAL(5,2),
    avg_temp_min_correct DECIMAL(5,2),
    avg_humidity_1_correct DECIMAL(5,2),
    avg_humidity_2_correct DECIMAL(5,2),
    avg_wind_speed_correct DECIMAL(5,2),
    avg_wind_direction_correct DECIMAL(5,2),
    avg_cloud_cover_correct DECIMAL(5,2),
    
    -- Metadata
    analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create indexes for summary table
CREATE INDEX IF NOT EXISTS idx_comprehensive_summary_sheet_name ON comprehensive_summary(sheet_name);
CREATE INDEX IF NOT EXISTS idx_comprehensive_summary_day_number ON comprehensive_summary(day_number);

-- 6. Insert sample data for testing (optional)
INSERT INTO comprehensive_analysis (
    sheet_name, day_number, district_name, parameter_name,
    parameter_correct, parameter_usable, parameter_unusable, parameter_correct_plus_usable,
    parameter_valid_days, parameter_missing_days
) VALUES 
('test_sheet', 1, 'VISAKHAPATNAM', 'rainfall', 85.5, 10.2, 4.3, 95.7, 30, 0),
('test_sheet', 1, 'VISAKHAPATNAM', 'temp_max_c', 78.3, 15.6, 6.1, 93.9, 30, 0),
('test_sheet', 2, 'VISAKHAPATNAM', 'rainfall', 82.1, 12.8, 5.1, 94.9, 30, 0),
('test_sheet', 2, 'VISAKHAPATNAM', 'temp_max_c', 75.9, 18.2, 5.9, 94.1, 30, 0);

-- 7. Create summary for test data
INSERT INTO comprehensive_summary (
    sheet_name, day_number, total_districts, total_parameters,
    avg_rainfall_correct, avg_temp_max_correct
) VALUES 
('test_sheet', 1, 1, 8, 85.5, 78.3),
('test_sheet', 2, 1, 8, 82.1, 75.9);

-- 8. Display setup confirmation
SELECT 
    'Comprehensive Analysis System Setup Complete!' as status,
    COUNT(*) as tables_created,
    'You can now use the system to analyze data across all days' as next_step
FROM information_schema.tables 
WHERE table_name IN ('comprehensive_analysis', 'comprehensive_summary');

-- 9. Show sample data
SELECT 
    'Sample data available for testing' as info,
    sheet_name,
    day_number,
    district_name,
    parameter_name,
    COALESCE(rainfall_correct, parameter_correct) as correct_percentage
FROM comprehensive_analysis 
ORDER BY day_number, parameter_name;

