import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Activity, Zap, Shield } from 'lucide-react'
import { supabase, Equipment, OEEData } from '../lib/supabase'

interface OEEDashboardProps {
  onInsightRequest: (insight: string) => void
}

interface EquipmentWithOEE extends Equipment {
  latest_oee?: OEEData
}

export function OEEDashboard({ onInsightRequest }: OEEDashboardProps) {
  const [equipment, setEquipment] = useState<EquipmentWithOEE[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEquipmentData()
  }, [])

  const loadEquipmentData = async () => {
    try {
      // Get equipment with their latest OEE data
      const { data: equipmentData, error: equipmentError } = await supabase
        .from('equipment')
        .select(`
          *,
          oee_data(*)
        `)
        .order('created_at', { ascending: true })

      if (equipmentError) throw equipmentError

      // Process data to get latest OEE for each equipment
      const processedData = equipmentData?.map(eq => ({
        ...eq,
        latest_oee: eq.oee_data?.[eq.oee_data.length - 1] || null
      })) || []

      setEquipment(processedData)
    } catch (error) {
      console.error('Error loading equipment data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getOEEColor = (score: number) => {
    if (score >= 85) return 'text-green-600'
    if (score >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getOEEBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-50 border-green-200'
    if (score >= 70) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  const avgOEE = equipment.reduce((sum, eq) => sum + (eq.latest_oee?.oee_score || 0), 0) / equipment.length || 0

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">OEE Dashboard</h2>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Activity className="w-4 h-4" />
            <span>Average OEE: {avgOEE.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span>{equipment.filter(eq => (eq.latest_oee?.oee_score || 0) >= 85).length} High Performing</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown className="w-4 h-4 text-red-600" />
            <span>{equipment.filter(eq => (eq.latest_oee?.oee_score || 0) < 70).length} Need Attention</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {equipment.map((eq) => {
          const oee = eq.latest_oee
          return (
            <div
              key={eq.id}
              className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${
                oee ? getOEEBgColor(oee.oee_score) : 'bg-gray-50 border-gray-200'
              }`}
              onClick={() => onInsightRequest(`Analyze the performance of ${eq.name}. What can be improved?`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{eq.name}</h3>
                  <p className="text-xs text-gray-600">{eq.location}</p>
                </div>
                {oee && (
                  <span className={`text-lg font-bold ${getOEEColor(oee.oee_score)}`}>
                    {oee.oee_score.toFixed(1)}%
                  </span>
                )}
              </div>

              {oee ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-blue-600" />
                      <span>Availability</span>
                    </div>
                    <span className="font-medium">{oee.availability.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-orange-600" />
                      <span>Performance</span>
                    </div>
                    <span className="font-medium">{oee.performance.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Shield className="w-3 h-3 text-green-600" />
                      <span>Quality</span>
                    </div>
                    <span className="font-medium">{oee.quality.toFixed(1)}%</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500">No data available</div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onInsightRequest("What are the main factors affecting OEE across all equipment?")}
          className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
        >
          <div className="text-sm font-medium text-gray-900 mb-1">Performance Analysis</div>
          <div className="text-xs text-gray-600">Get insights on factors affecting OEE</div>
        </button>

        <button
          onClick={() => onInsightRequest("Show me a trend analysis for the past week")}
          className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
        >
          <div className="text-sm font-medium text-gray-900 mb-1">Trend Analysis</div>
          <div className="text-xs text-gray-600">View performance trends over time</div>
        </button>

        <button
          onClick={() => onInsightRequest("Recommend optimization strategies for underperforming equipment")}
          className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
        >
          <div className="text-sm font-medium text-gray-900 mb-1">Optimization Tips</div>
          <div className="text-xs text-gray-600">Get improvement recommendations</div>
        </button>
      </div>
    </div>
  )
}