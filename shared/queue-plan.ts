import { scheduleZone } from "../engine/panel/generator.js";
export const displayZone = (zone: string, at = Date.now() / 1000) =>
  scheduleZone(zone, new Date(at * 1000));
export function slotInput(at: number, zone: string) {
  return localStamp(at, zone).replace(" ", "T");
}
export function slotTime(at: number, zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: displayZone(zone, at),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at * 1000));
}
function localStamp(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: displayZone(zone, at),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at * 1000));
  const v = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}`;
}
export function plannedPins(
  pins: any[],
  jobs: any[],
  zone: string,
  active: boolean,
  at = Date.now() / 1000,
) {
  const remaining = pins
    .filter(
      (p) =>
        p.status === "Ready" &&
        !p.productPaused &&
        typeof p.publishAfter === "string" &&
        typeof p.rowNumber === "number" &&
        p.rowNumber <= 5000,
    )
    .map((p, i) => ({ ...p, sourceOrder: p.rowNumber ?? i }))
    .sort((a, b) => a.sourceOrder - b.sourceOrder);
  if (!active) return [];
  const plan: { pin: any; slot: any }[] = [];
  for (const slot of jobs
    .filter((j) => j.status === "pending" && j.planned_at >= at)
    .sort((a, b) => a.planned_at - b.planned_at)) {
    const stamp = localStamp(slot.planned_at, zone);
    const i = remaining.findIndex(
      (p) => !p.publishAfter || p.publishAfter <= stamp,
    );
    if (i < 0) continue;
    plan.push({ pin: remaining.splice(i, 1)[0], slot });
  }
  return plan;
}
export function queueCounts(counts: Record<string, number>) {
  return {
    ready: counts.Ready || 0,
    published: counts.Done || 0,
    held:
      (counts.Draft || 0) + (counts.Error || 0) + (counts["Needs review"] || 0),
    total: Object.values(counts).reduce((a, n) => a + n, 0),
  };
}
