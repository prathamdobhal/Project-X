/*
  # OEE Copilot Database Schema

  This migration creates the foundation for an OEE (Overall Equipment Effectiveness) copilot application.

  ## Tables Created:

  1. **equipment**
     - Stores equipment/machine information
     - Fields: id, name, description, location, created_at

  2. **oee_data** 
     - Stores OEE metrics for equipment
     - Fields: id, equipment_id, availability, performance, quality, oee_score, timestamp
     - Tracks the three OEE pillars and calculated overall score

  3. **chat_sessions**
     - Manages chat conversation sessions
     - Fields: id, title, created_at, updated_at

  4. **chat_messages**
     - Stores individual chat messages within sessions
     - Fields: id, session_id, role (user/assistant), content, timestamp
     - Links to chat sessions for conversation history

  ## Security:
  - All tables have RLS (Row Level Security) enabled
  - Policies allow authenticated users to access all data (simplified for demo)
  - In production, implement proper user-based access controls

  ## Features Enabled:
  - Equipment tracking and management
  - OEE metrics storage and analysis
  - Chat history persistence
  - Session-based conversations
*/

-- Equipment table for storing machine/equipment information
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  location text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- OEE data table for storing equipment effectiveness metrics
CREATE TABLE IF NOT EXISTS oee_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES equipment(id) ON DELETE CASCADE,
  availability decimal(5,2) NOT NULL DEFAULT 0.00,
  performance decimal(5,2) NOT NULL DEFAULT 0.00,
  quality decimal(5,2) NOT NULL DEFAULT 0.00,
  oee_score decimal(5,2) GENERATED ALWAYS AS (availability * performance * quality / 10000) STORED,
  timestamp timestamptz DEFAULT now()
);

-- Chat sessions table for managing conversation sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New Chat',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chat messages table for storing individual messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  timestamp timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE oee_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (simplified for demo)
CREATE POLICY "Authenticated users can read equipment"
  ON equipment FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert equipment"
  ON equipment FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update equipment"
  ON equipment FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete equipment"
  ON equipment FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read oee_data"
  ON oee_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert oee_data"
  ON oee_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update oee_data"
  ON oee_data FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete oee_data"
  ON oee_data FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read chat_sessions"
  ON chat_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert chat_sessions"
  ON chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update chat_sessions"
  ON chat_sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete chat_sessions"
  ON chat_sessions FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read chat_messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert chat_messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update chat_messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete chat_messages"
  ON chat_messages FOR DELETE
  TO authenticated
  USING (true);

-- Insert some sample equipment data
INSERT INTO equipment (name, description, location) VALUES
  ('CNC Machine 01', 'High precision CNC machining center', 'Production Floor A'),
  ('Assembly Line 02', 'Main product assembly line', 'Production Floor B'),
  ('Packaging Unit 03', 'Automated packaging system', 'Packaging Area'),
  ('Quality Scanner 04', 'Automated quality inspection system', 'Quality Control');

-- Insert some sample OEE data
INSERT INTO oee_data (equipment_id, availability, performance, quality) 
SELECT 
  e.id,
  85.5 + (random() * 10),  -- Random availability between 85.5-95.5%
  92.3 + (random() * 5),   -- Random performance between 92.3-97.3%
  98.1 + (random() * 1.5)  -- Random quality between 98.1-99.6%
FROM equipment e;