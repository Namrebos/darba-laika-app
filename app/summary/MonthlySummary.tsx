'use client'

type DayData = {
  baseHours: number
  overtimeHours: number
  callHours?: number
}

type Props = {
  data?: Record<string, DayData>
}

type Totals = {
  baseHours: number
  overtimeHours: number
  workDays: number
}

function hoursToHM(hours: number) {
  const totalMin = Math.round(hours * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h ${mm}m`
}

export default function MonthlySummary({ data }: Props) {
  const safeData = data ?? {}

  const totals: Totals = Object.values(safeData).reduce<Totals>(
    (acc, day) => {
      const baseHours = day.baseHours ?? 0
      const overtimeHours = day.overtimeHours ?? 0
      const hasWorkday = baseHours > 0 || overtimeHours > 0

      return {
        baseHours: acc.baseHours + baseHours,
        overtimeHours: acc.overtimeHours + overtimeHours,
        workDays: acc.workDays + (hasWorkday ? 1 : 0),
      }
    },
    {
      baseHours: 0,
      overtimeHours: 0,
      workDays: 0,
    }
  )

  const grandTotal = totals.baseHours + totals.overtimeHours

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Mēneša kopsavilkums</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2 font-medium">Darba dienas</th>
              <th className="px-3 py-2 font-medium">Darba stundas</th>
              <th className="px-3 py-2 font-medium">Virsstundas</th>
              <th className="px-3 py-2 font-medium">Grand Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="px-3 py-3">{totals.workDays}</td>
              <td className="px-3 py-3">{hoursToHM(totals.baseHours)}</td>
              <td className="px-3 py-3">{hoursToHM(totals.overtimeHours)}</td>
              <td className="px-3 py-3 font-semibold">{hoursToHM(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}