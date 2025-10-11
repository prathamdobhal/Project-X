/*
  # Fix RLS policies for chat functionality

  The current RLS policies require authenticated users, but the application
  doesn't have authentication set up. This migration updates the policies
  to allow anonymous users to use the chat functionality.

  1. Policy Changes
    - Update chat_sessions policies to allow anonymous users
    - Update chat_messages policies to allow anonymous users
    - Keep equipment and OEE data policies as read-only for all users

  2. Security Notes
    - This is appropriate for a demo/development environment
    - For production, proper authentication should be implemented
*/

-- Drop existing restrictive policies for chat tables
DROP POLICY IF EXISTS "Users can manage own chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users can manage own chat messages" ON chat_messages;

-- Create permissive policies for chat functionality
CREATE POLICY "Anyone can create and read chat sessions"
  ON chat_sessions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can create and read chat messages"
  ON chat_messages
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Keep equipment status logs as read-only for all users
DROP POLICY IF EXISTS "Users can read all equipment status logs" ON equipment_status_logs;
DROP POLICY IF EXISTS "Users can insert equipment status logs" ON equipment_status_logs;

CREATE POLICY "Anyone can read equipment status logs"
  ON equipment_status_logs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Update existing equipment and OEE data policies to be more permissive
DROP POLICY IF EXISTS "Users can read all equipment" ON equipment;
DROP POLICY IF EXISTS "Users can read all OEE data" ON oee_data;

CREATE POLICY "Anyone can read equipment data"
  ON equipment
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read OEE data"
  ON oee_data
  FOR SELECT
  TO anon, authenticated
  USING (true);