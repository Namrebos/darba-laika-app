'use client'

type DayData = {
  baseHours: number
  overtimeHours: number
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

type SummaryCardProps = {
  label: string
  value: string | number
  emphasize?: boolean
}

function SummaryCard({
  label,
  value,
  emphasize = false,
}: SummaryCardProps) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        emphasize
          ? 'border-2 border-zinc-500 bg-background/60 shadow-md dark:border-zinc-400'
          : 'border-border bg-background/60'
      }`}
    >
      <div
        className={`${emphasize ? 'text-sm' : 'text-xs'} ${
          emphasize
            ? 'font-bold uppercase tracking-wide text-foreground'
            : 'text-muted-foreground'
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-2 leading-none ${
          emphasize
            ? 'text-2xl font-extrabold text-foreground'
            : 'text-lg font-semibold sm:text-xl'
        }`}
      >
        {value}
      </div>
    </div>
  )
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Darba dienas" value={totals.workDays} />
        <SummaryCard label="Darba stundas" value={hoursToHM(totals.baseHours)} />
        <SummaryCard label="Virsstundas" value={hoursToHM(totals.overtimeHours)} />
        <SummaryCard
          label="Grand Total"
          value={hoursToHM(grandTotal)}
          emphasize
        />
      </div>
    </div>
  )
}
