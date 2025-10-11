import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Line, Pie, Doughnut, Chart as ChartComponent } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

export interface ChartData {
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

interface ChartProps {
  chartData: ChartData
  height?: number
}

export function Chart({ chartData, height = 400 }: ChartProps) {
  const { type, title, labels, datasets } = chartData

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: title,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
    },
  }

  const chartProps = {
    data: { labels, datasets },
    options: commonOptions,
  }

  // For Pareto chart, we need to create a combination of bar and line
  if (type === 'pareto') {
    // Sort data by value for Pareto
    const sortedData = labels
      .map((label, index) => ({
        label,
        value: datasets[0].data[index],
      }))
      .sort((a, b) => b.value - a.value)

    const sortedLabels = sortedData.map(item => item.label)
    const sortedValues = sortedData.map(item => item.value)

    // Calculate cumulative percentages
    const total = sortedValues.reduce((sum, val) => sum + val, 0)
    const cumulativePercentages = sortedValues.reduce((acc: number[], _val, index) => {
      const cumSum = sortedValues.slice(0, index + 1).reduce((sum, v) => sum + v, 0)
      acc.push((cumSum / total) * 100)
      return acc
    }, [])

    const paretoChartProps = {
      data: {
        labels: sortedLabels,
        datasets: [
          {
            type: 'bar' as const,
            label: datasets[0].label || 'Count',
            data: sortedValues,
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
            yAxisID: 'y',
          },
          {
            type: 'line' as const,
            label: 'Cumulative %',
            data: cumulativePercentages,
            borderColor: 'rgba(239, 68, 68, 1)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        ...commonOptions,
        scales: {
          y: {
            type: 'linear' as const,
            display: true,
            position: 'left' as const,
            title: {
              display: true,
              text: datasets[0].label || 'Count',
            },
          },
          y1: {
            type: 'linear' as const,
            display: true,
            position: 'right' as const,
            max: 100,
            title: {
              display: true,
              text: 'Cumulative %',
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    }

    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div style={{ height }}>
          <ChartComponent type="bar" data={paretoChartProps.data} options={paretoChartProps.options} />
        </div>
      </div>
    )
  }

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return <Bar {...chartProps} />
      case 'line':
        return <Line {...chartProps} />
      case 'pie':
        return <Pie {...chartProps} />
      case 'doughnut':
        return <Doughnut {...chartProps} />
      default:
        return <Bar {...chartProps} />
    }
  }

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <div style={{ height }}>
        {renderChart()}
      </div>
    </div>
  )
}