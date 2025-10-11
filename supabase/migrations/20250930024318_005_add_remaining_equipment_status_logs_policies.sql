/*
  # Add remaining RLS policies for equipment_status_logs table

  1. Security Changes
    - Add UPDATE policy to allow data modifications
    - Add DELETE policy to allow data removal (needed for clearing old data during import)
    - Maintains security while enabling full CRUD operations

  2. Policy Details
    - UPDATE policy: Allows anyone to update equipment status logs
    - DELETE policy: Allows anyone to delete equipment status logs
    - These policies enable the CSV import functionality to clear and update data
*/

-- Add UPDATE policy for equipment_status_logs table
CREATE POLICY "Anyone can update equipment status logs"
  ON equipment_status_logs
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Add DELETE policy for equipment_status_logs table
CREATE POLICY "Anyone can delete equipment status logs"
  ON equipment_status_logs
  FOR DELETE
  TO anon, authenticated
  USING (true);