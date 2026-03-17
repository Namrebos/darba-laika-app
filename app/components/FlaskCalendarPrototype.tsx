"use client";

import { Zen_Dots } from "next/font/google";

const dateFont = Zen_Dots({
  subsets: ["latin"],
  weight: ["400"],
});

type Segment = {
  startHour: number;
  endHour: number;
};

type FlaskProps = {
  isWeekend?: boolean;
  isHoliday?: boolean;
  segments?: Segment[];
};

type CalendarCellData = {
  day: number;
  isWeekend?: boolean;
  isHoliday?: boolean;
  segments?: Segment[];
};

const VISUAL_9 = 6;
const VISUAL_18 = 15;

function clampHour(value: number) {
  return Math.max(0, Math.min(24, value));
}

function toVisualHour(realHour: number) {
  const h = clampHour(realHour);

  if (h <= 9) return (h / 9) * VISUAL_9;

  if (h <= 18) {
    return VISUAL_9 + ((h - 9) / 9) * (VISUAL_18 - VISUAL_9);
  }

  return VISUAL_18 + ((h - 18) / 6) * (24 - VISUAL_18);
}

function hourToBottomPercent(hour: number) {
  return (hour / 24) * 100;
}

function getSegmentStyle(startHour: number, endHour: number) {
  const visualStart = toVisualHour(startHour);
  const visualEnd = toVisualHour(endHour);

  return {
    bottom: `${hourToBottomPercent(visualStart)}%`,
    height: `${hourToBottomPercent(visualEnd - visualStart)}%`,
  };
}

function splitSegmentByWorkHours(segment: Segment) {
  const start = clampHour(segment.startHour);
  const end = clampHour(segment.endHour);

  if (end <= start) return [];

  return [
    {
      startHour: start,
      endHour: Math.min(end, 9),
      color: "red" as const,
    },
    {
      startHour: Math.max(start, 9),
      endHour: Math.min(end, 18),
      color: "blue" as const,
    },
    {
      startHour: Math.max(start, 18),
      endHour: end,
      color: "red" as const,
    },
  ].filter((part) => part.endHour > part.startHour);
}

function resolveColoredParts(
  segment: Segment,
  isWeekend: boolean,
  isHoliday: boolean
) {
  if (isWeekend || isHoliday) {
    return [
      {
        startHour: segment.startHour,
        endHour: segment.endHour,
        color: "red" as const,
      },
    ];
  }

  return splitSegmentByWorkHours(segment);
}

function getColorClass(color: "blue" | "red") {
  return color === "blue" ? "bg-blue-500" : "bg-red-500";
}

function Flask({
  isWeekend = false,
  isHoliday = false,
  segments = [],
}: FlaskProps) {
  const coloredParts = segments.flatMap((segment) =>
    resolveColoredParts(segment, isWeekend, isHoliday)
  );

  return (
    <div className="relative h-[120px] w-[24px]">
      <div className="absolute inset-0 overflow-hidden rounded-[14px] border-2 border-zinc-500 bg-white transition-all duration-200 group-hover:border-zinc-700">
        {coloredParts.map((part, index) => (
          <div
            key={index}
            className={`absolute left-0 right-0 ${getColorClass(part.color)}`}
            style={getSegmentStyle(part.startHour, part.endHour)}
          />
        ))}

        <div
          className="absolute left-0 right-0 z-20 border-t-2 border-black"
          style={{ bottom: `${hourToBottomPercent(VISUAL_9)}%` }}
        />

        <div
          className="absolute left-0 right-0 z-20 border-t-2 border-black"
          style={{ bottom: `${hourToBottomPercent(VISUAL_18)}%` }}
        />

        <div className="pointer-events-none absolute left-[2px] top-[2px] bottom-[2px] z-30 w-[7px] rounded-full bg-white/35 blur-[0.5px] transition-all duration-200 group-hover:bg-white/60" />
        <div className="pointer-events-none absolute left-[3px] right-[3px] top-[3px] h-[16px] rounded-t-[10px] bg-white/20 transition-all duration-200 group-hover:bg-white/40" />
      </div>
    </div>
  );
}

type CalendarCellProps = {
  day?: number;
  isWeekend?: boolean;
  isHoliday?: boolean;
  segments?: Segment[];
};

function CalendarDayCell({
  day,
  isWeekend = false,
  isHoliday = false,
  segments = [],
}: CalendarCellProps) {
  if (!day) {
    return (
      <div className="h-[150px] rounded-2xl border border-transparent bg-transparent" />
    );
  }

  return (
    <div className="group grid h-[150px] grid-cols-[28px_1fr] items-center gap-1 rounded-2xl border border-zinc-500 bg-gradient-to-br from-zinc-100 to-zinc-200 px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className="flex justify-start">
        <Flask
          isWeekend={isWeekend}
          isHoliday={isHoliday}
          segments={segments}
        />
      </div>

      <div
        className={`${dateFont.className} w-full text-right text-[70px] leading-none ${
          isHoliday ? "text-red-600" : "text-zinc-900"
        }`}
      >
        {day}
      </div>
    </div>
  );
}

const monthData: CalendarCellData[] = [
  { day: 1, isWeekend: true, segments: [] },
  { day: 2, isWeekend: true, segments: [{ startHour: 10, endHour: 14 }] },
  { day: 3, segments: [{ startHour: 9, endHour: 17 }] },
  { day: 4, segments: [{ startHour: 7, endHour: 19 }] },
  { day: 5, segments: [{ startHour: 9, endHour: 13 }, { startHour: 14, endHour: 18 }] },
  { day: 6, segments: [{ startHour: 9, endHour: 18 }, { startHour: 21, endHour: 23 }] },
  { day: 7, segments: [] },

  { day: 8, isWeekend: true, segments: [{ startHour: 11, endHour: 16 }] },
  { day: 9, isWeekend: true, segments: [] },
  { day: 10, segments: [{ startHour: 9, endHour: 17 }] },
  { day: 11, segments: [{ startHour: 8, endHour: 18 }] },
  { day: 12, segments: [{ startHour: 9, endHour: 17 }] },
  { day: 13, segments: [{ startHour: 9, endHour: 15 }] },
  { day: 14, segments: [] },

  { day: 15, isWeekend: true, segments: [] },
  { day: 16, isWeekend: true, segments: [{ startHour: 12, endHour: 18 }] },
  { day: 17, isHoliday: true, segments: [{ startHour: 8, endHour: 12 }] },
  { day: 18, segments: [{ startHour: 9, endHour: 17 }, { startHour: 18, endHour: 20 }] },
  { day: 19, segments: [{ startHour: 6, endHour: 17 }] },
  { day: 20, segments: [{ startHour: 9, endHour: 18 }] },
  { day: 21, segments: [] },

  { day: 22, isWeekend: true, segments: [{ startHour: 9, endHour: 12 }] },
  { day: 23, isWeekend: true, segments: [] },
  { day: 24, segments: [{ startHour: 9, endHour: 17 }] },
  { day: 25, segments: [{ startHour: 9, endHour: 19 }] },
  { day: 26, segments: [{ startHour: 10, endHour: 16 }] },
  { day: 27, segments: [{ startHour: 9, endHour: 17 }] },
  { day: 28, segments: [] },

  { day: 29, isWeekend: true, segments: [] },
  { day: 30, isWeekend: true, segments: [{ startHour: 14, endHour: 20 }] },
  { day: 31, segments: [{ startHour: 9, endHour: 17 }] },
];

export default function FlaskCalendarPrototype() {
  const leadingEmptyDays = 5; // piemēram, mēnesis sākas sestdienā
  const cells = [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...monthData,
  ];

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900">Marts</h1>
        </div>

        <div className="mb-4 grid grid-cols-7 gap-4">
          {["P", "O", "T", "C", "Pk", "S", "Sv"].map((label) => (
            <div
              key={label}
              className="text-center text-sm font-medium text-zinc-500"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-4">
          {cells.map((cell, index) => (
            <CalendarDayCell
              key={index}
              day={cell?.day}
              isWeekend={cell?.isWeekend}
              isHoliday={cell?.isHoliday}
              segments={cell?.segments}
            />
          ))}
        </div>
      </div>
    </div>
  );
}