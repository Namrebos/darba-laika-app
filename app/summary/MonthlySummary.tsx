'use client'

type DayData = {
  baseHours: number       // 9–18
  overtimeHours: number   // ārpus 9–18
  taskHours?: number      // laiks pildot taskus (NE call)
}

type Props = {
  data: { [date: string]: DayData } // 'YYYY-MM-DD' -> DayData
}

function hoursToHM(h: number) {
  const totalMin = Math.round((h || 0) * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h ${mm}m`
}

export default function MonthlySummary({ data }: Props) {
  const byMonth = new Map<string, { baseMin: number; overMin: number; taskMin: number }>()

  Object.entries(data || {}).forEach(([date, d]) => {
    const key = date.slice(0, 7) // YYYY-MM
    const prev = byMonth.get(key) || { baseMin: 0, overMin: 0, taskMin: 0 }
    byMonth.set(key, {
      baseMin: prev.baseMin + Math.round((d.baseHours || 0) * 60),
      overMin: prev.overMin + Math.round((d.overtimeHours || 0) * 60),
      taskMin: prev.taskMin + Math.round((d.taskHours || 0) * 60),
    })
  })

  const rows = Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => {
      const baseH = v.baseMin / 60
      const overH = v.overMin / 60
      const taskH = v.taskMin / 60
      const grandTotal = baseH + overH // bez taskH
      return { month, baseH, overH, grandTotal, taskH }
    })

  if (rows.length === 0) {
    return (
      <div className="border rounded p-4 mb-4 bg-white dark:bg-zinc-900">
        <p className="text-sm text-gray-600 dark:text-gray-300">Nav datu mēneša kopsavilkumam.</p>
      </div>
    )
  }

  return (
    <div className="border rounded p-4 mb-4 bg-white dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 dark:text-gray-300 border-b">
              <th className="py-2 pr-4">Mēnesis</th>
              <th className="py-2 pr-4">Darba stundas</th>
              <th className="py-2 pr-4">Virsstundas</th>
              <th className="py-2 pr-4">Grand Total (darbs+virs)</th>
              <th className="py-2">Tasku stundas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{r.month}</td>
                <td className="py-2 pr-4">{hoursToHM(r.baseH)}</td>
                <td className="py-2 pr-4">{hoursToHM(r.overH)}</td>
                <td className="py-2 pr-4 font-semibold">{hoursToHM(r.grandTotal)}</td>
                <td className="py-2">
                  <span className="text-gray-500">{hoursToHM(r.taskH)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
