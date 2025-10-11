import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Equipment = {
  id: string
  name: string
  description: string
  location: string
  created_at: string
}

export type OEEData = {
  id: string
  equipment_id: string
  availability: number
  performance: number
  quality: number
  oee_score: number
  timestamp: string
}

export type ChatSession = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type ChartData = {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'pareto'
  title: string
  labels: string[]
  datasets: {
    label: string
    data: number[]
    backgroundColor?: string | string[]
    borderColor?: string | string[]
    borderWidth?: number
    fill?: boolean
  }[]
}

export type ChatMessage = {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  chart?: ChartData
}