import { z } from "zod";
import { scheduleZone } from "../engine/panel/generator.js";
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z.object({
  mode: z.enum(["varied", "fixed"]).default("varied"),
  start: time.default("09:00"),
  end: time.default("21:00"),
  minSpacing: z.number().int().min(1).max(1440).default(120),
  times: z.array(time).max(1440).default([]),
});
export type PostingSchedule = z.infer<typeof scheduleSchema>;
export const minutes = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function validateSchedule(schedule: PostingSchedule, count: number) {
  const start = minutes(schedule.start),
    end = minutes(schedule.end);
  if (schedule.mode === "fixed") {
    const times = [...new Set(schedule.times.map(minutes))].sort(
      (a, b) => a - b,
    );
    return (
      times.length === count &&
      times.every((t, i) => !i || t - times[i - 1] >= schedule.minSpacing)
    );
  }
  return end >= start && (count - 1) * schedule.minSpacing <= end - start;
}
export function localDay(at: number, zone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: scheduleZone(zone, new Date(at * 1000)),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at * 1000));
  const get = (x: string) => p.find((v) => v.type === x)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function nextDay(day: string, n = 1) {
  return new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
function localParts(at: number, zone: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: scheduleZone(zone, new Date(at)),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (x: string) => Number(p.find((v) => v.type === x)!.value);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
  );
}
export function utcFor(day: string, minute: number, zone: string) {
  const wanted = Date.parse(day + "T00:00:00Z") + minute * 60000;
  let guess = wanted;
  for (let i = 0; i < 4; i++) {
    const delta = wanted - localParts(guess, zone);
    if (!delta) return Math.floor(guess / 1000);
    guess += delta;
  }
  // A nonexistent local minute during a clock change is skipped, never silently shifted.
  return null;
}
export function dailyMinutes(
  schedule: PostingSchedule,
  count: number,
  random = () => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 4294967296;
  },
) {
  if (!validateSchedule(schedule, count))
    throw Error("The daily amount does not fit the posting hours and spacing.");
  if (schedule.mode === "fixed")
    return [...new Set(schedule.times.map(minutes))].sort((a, b) => a - b);
  const start = minutes(schedule.start),
    end = minutes(schedule.end),
    slack = end - start - (count - 1) * schedule.minSpacing;
  // Ordered random offsets preserve the requested minimum spacing without rejection loops.
  return Array.from({ length: count }, () => Math.floor(random() * (slack + 1)))
    .sort((a, b) => a - b)
    .map((offset, i) => start + i * schedule.minSpacing + offset);
}
