export interface PostingSchedule {
  mode: "varied" | "fixed";
  start: string;
  end: string;
  minSpacing: number;
  spacingMode?: "auto" | "custom";
  times: string[];
}
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function automaticSpacing(start: string, end: string, count: number) {
  const span = minutes(end) - minutes(start);
  if (
    !Number.isFinite(span) ||
    span < 0 ||
    !Number.isInteger(count) ||
    count < 1
  )
    return 1;
  const gap = Math.min(120, Math.max(1, Math.floor(span / (count + 1))));
  return gap >= 10 ? Math.floor(gap / 5) * 5 : gap;
}
export function normalizedSpacing(
  schedule: PostingSchedule,
  count: number,
): PostingSchedule {
  return schedule.spacingMode === "auto"
    ? {
        ...schedule,
        minSpacing:
          schedule.mode === "fixed"
            ? 1
            : automaticSpacing(schedule.start, schedule.end, count),
      }
    : schedule;
}
export function variedBounds(schedule: PostingSchedule) {
  const start = minutes(schedule.start),
    end = minutes(schedule.end);
  const reserve = Math.max(0, schedule.minSpacing - (1440 - (end - start)));
  return [start + Math.ceil(reserve / 2), end - Math.floor(reserve / 2)];
}
export function validSchedule(schedule: PostingSchedule, count: number) {
  const validTime = (t: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1440 ||
    !validTime(schedule.start) ||
    !validTime(schedule.end) ||
    !Number.isInteger(schedule.minSpacing) ||
    schedule.minSpacing < 1 ||
    schedule.minSpacing > 1440
  )
    return false;
  const s = normalizedSpacing(schedule, count);
  if (s.mode === "fixed") {
    if (!s.times.every(validTime)) return false;
    const times = [...new Set(s.times.map(minutes))].sort((a, b) => a - b);
    return (
      times.length === count &&
      times.every((t, i) => !i || t - times[i - 1] >= s.minSpacing) &&
      1440 - times[times.length - 1] + times[0] >= s.minSpacing
    );
  }
  const [start, end] = variedBounds(s);
  return (
    minutes(s.end) >= minutes(s.start) &&
    end - start >= (count - 1) * s.minSpacing
  );
}
export function resizeExactTimes(
  times: string[],
  count: number,
  start = "09:00",
  end = "21:00",
) {
  if (!Number.isInteger(count) || count < 1 || count > 1440) return times;
  const values = [
    ...new Set(
      times.filter((t) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)).map(minutes),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, count);
  let lower = minutes(start),
    upper = minutes(end);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
    lower = 540;
    upper = 1260;
  }
  if (count > upper - lower + 1) {
    lower = 0;
    upper = 1439;
  }
  if (!values.length)
    return Array.from({ length: count }, (_, i) =>
      timeLabel(
        count === 1
          ? lower
          : lower + Math.floor((i * (upper - lower)) / (count - 1)),
      ),
    );
  while (values.length < count) {
    let widest = 1,
      candidate = -1;
    for (let i = 1; i < values.length; i++) {
      const gap = values[i] - values[i - 1];
      if (gap > widest) {
        widest = gap;
        candidate = Math.floor((values[i] + values[i - 1]) / 2);
      }
    }
    if (values[0] - lower > widest) {
      widest = values[0] - lower;
      candidate = lower;
    }
    if (upper - values[values.length - 1] > widest) {
      candidate = upper;
    }
    if (candidate < 0) {
      candidate = values[values.length - 1] + (values.length === 1 ? 120 : 1);
      if (candidate > 1439)
        candidate = values[0] - (values.length === 1 ? 120 : 1);
    }
    if (candidate < 0 || candidate > 1439) break;
    values.push(candidate);
    values.sort((a, b) => a - b);
  }
  return values.map(timeLabel);
}
