export function roundToQuarterHour(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4;
}

export type WorkSchedulePeriod = {
  valid_from: string;
  valid_until: string | null;
  regular_start: string;
  regular_end: string;
};

export function resolveWorkSchedule(
  date: Date,
  regularStart: string,
  regularEnd: string,
  periods: WorkSchedulePeriod[],
) {
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const period = periods.find(
    (item) =>
      item.valid_from <= dateKey &&
      (item.valid_until === null || item.valid_until >= dateKey),
  );

  return {
    regularStart: period?.regular_start.slice(0, 5) || regularStart,
    regularEnd: period?.regular_end.slice(0, 5) || regularEnd,
  };
}

export function calculateWorkHours(
  start: Date,
  end: Date,
  regularStart = "09:00",
  regularEnd = "18:00",
): { baseHours: number; overtimeHours: number } {
  const timeToMinutes = (value: string, fallback: number) => {
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return fallback;
    }
    return hours * 60 + minutes;
  };
  const baseStartMinutes = timeToMinutes(regularStart, 9 * 60);
  const baseEndMinutes = timeToMinutes(regularEnd, 18 * 60);

  let baseMinutes = 0;
  let overtimeMinutes = 0;
  const cursor = new Date(start);

  while (cursor < end) {
    const dayStart = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
    );
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const segmentEnd = end < nextDay ? end : nextDay;
    const segmentMinutes = Math.max(
      0,
      (segmentEnd.getTime() - cursor.getTime()) / 60_000,
    );
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;

    if (isWeekend) {
      overtimeMinutes += segmentMinutes;
    } else {
      const regularStartAt = new Date(dayStart);
      regularStartAt.setMinutes(baseStartMinutes);
      const regularEndAt = new Date(dayStart);
      regularEndAt.setMinutes(baseEndMinutes);
      const overlapStart = cursor > regularStartAt ? cursor : regularStartAt;
      const overlapEnd = segmentEnd < regularEndAt ? segmentEnd : regularEndAt;
      const regularMinutes = Math.max(
        0,
        (overlapEnd.getTime() - overlapStart.getTime()) / 60_000,
      );

      baseMinutes += regularMinutes;
      overtimeMinutes += segmentMinutes - regularMinutes;
    }

    cursor.setTime(segmentEnd.getTime());
  }

  return {
    baseHours: roundToQuarterHour(baseMinutes),
    overtimeHours: roundToQuarterHour(overtimeMinutes),
  };
}

export function applyWeekdayLunchDeduction(
  baseHours: number,
  date: Date,
  deductLunch: boolean,
): number {
  const day = date.getDay();
  const isWeekday = day >= 1 && day <= 5;

  return deductLunch && isWeekday && baseHours > 0
    ? Math.max(0, baseHours - 1)
    : baseHours;
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
