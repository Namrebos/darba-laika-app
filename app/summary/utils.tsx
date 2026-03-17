export function roundToQuarterHour(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4;
}

export function calculateWorkHours(
  start: Date,
  end: Date,
): { baseHours: number; overtimeHours: number } {
  const BASE_START = 9;
  const BASE_END = 18;

  let baseMinutes = 0;
  let overtimeMinutes = 0;
  const cur = new Date(start);

  while (cur < end) {
    const hour = cur.getHours();
    const next = new Date(cur.getTime() + 15 * 60 * 1000);

    if (next > end) break;

    if (hour >= BASE_START && hour < BASE_END) {
      baseMinutes += 15;
    } else {
      overtimeMinutes += 15;
    }

    cur.setMinutes(cur.getMinutes() + 15);
  }

  return {
    baseHours: roundToQuarterHour(baseMinutes),
    overtimeHours: roundToQuarterHour(overtimeMinutes),
  };
}

export function calculateTaskHoursByDate(
  taskLogs: Array<{
    start_time: string;
    end_time: string | null;
  }>,
): Record<string, number> {
  const byDate: Record<string, number> = {};

  for (const t of taskLogs) {
    if (!t.start_time) continue;

    const start = new Date(t.start_time);
    const end = new Date(t.end_time ?? t.start_time);

    const dayKey = start.toISOString().slice(0, 10);
    const minutes = Math.max(
      0,
      (end.getTime() - start.getTime()) / (1000 * 60),
    );
    const hours = roundToQuarterHour(minutes);

    byDate[dayKey] = (byDate[dayKey] ?? 0) + hours;
  }

  return byDate;
}
