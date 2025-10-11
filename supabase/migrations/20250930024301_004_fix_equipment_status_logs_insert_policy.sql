/*
  # Fix RLS policies for equipment_status_logs table

  1. Security Changes
    - Add INSERT policy for equipment_status_logs table to allow data import
    - Allow both anonymous and authenticated users to insert equipment status logs
    - This enables the CSV import functionality to work properly

  2. Policy Details
    - INSERT policy: Allows anyone to insert equipment status logs
    - Maintains existing SELECT policy for reading data
*/

-- Add INSERT policy for equipment_status_logs table
CREATE POLICY "Anyone can insert equipment status logs"
  ON equipment_status_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);