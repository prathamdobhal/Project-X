/*
  # Create equipment status logs table

  This migration creates the equipment_status_logs table to store actual equipment operational data
  from the three datasets provided (export 25, 26, 27).

  1. New Tables
    - `equipment_status_logs`
      - `id` (uuid, primary key)
      - `equipment_name` (text) - Name of the equipment/machine
      - `status` (text) - Current operational status (Running, Down, etc.)
      - `date` (date) - Date of the log entry
      - `start_time` (time) - Start time of the status period
      - `end_time` (time) - End time of the status period
      - `duration_minutes` (integer) - Duration in minutes
      - `alert` (text) - Any alerts generated
      - `reason` (text) - Reason for status/downtime
      - `issue` (text) - Specific issue description
      - `comment` (text) - Additional comments
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on `equipment_status_logs` table
    - Add policy for authenticated users to read all logs
    - Add policy for authenticated users to insert new logs
*/

CREATE TABLE IF NOT EXISTS equipment_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name text NOT NULL,
  status text NOT NULL,
  date date NOT NULL,
  start_time time,
  end_time time,
  duration_minutes integer,
  alert text,
  reason text,
  issue text,
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE equipment_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all equipment status logs"
  ON equipment_status_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert equipment status logs"
  ON equipment_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_equipment_status_logs_equipment_name ON equipment_status_logs(equipment_name);
CREATE INDEX IF NOT EXISTS idx_equipment_status_logs_date ON equipment_status_logs(date);
CREATE INDEX IF NOT EXISTS idx_equipment_status_logs_status ON equipment_status_logs(status);