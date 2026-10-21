import { expect, it } from "vitest";
import {
  automaticSpacing,
  normalizedSpacing,
  resizeExactTimes,
  validSchedule,
} from "../shared/posting-schedule";
import { dailyMinutes, scheduleSchema } from "../server/schedule-plan";

it("fits automatic spacing to daily amount and hours without overriding explicit custom gaps", () => {
  expect([5, 10, 12].map((n) => automaticSpacing("09:00", "21:00", n))).toEqual(
    [120, 65, 55],
  );
  expect(automaticSpacing("09:00", "10:00", 10)).toBe(5);
  const custom = scheduleSchema.parse({
    spacingMode: "custom",
    minSpacing: 120,
  });
  expect(normalizedSpacing(custom, 10).minSpacing).toBe(120);
  expect(validSchedule(custom, 10)).toBe(false);
  const auto = { ...custom, spacingMode: "auto" as const };
  expect(normalizedSpacing(auto, 10).minSpacing).toBe(65);
  expect(validSchedule(auto, 10)).toBe(true);
});
it("keeps varied slots inside the window, spaced across adjacent days and stable at capacity", () => {
  for (const count of [1, 3, 5, 10, 12, 1440]) {
    const s = scheduleSchema.parse({
      start: "00:00",
      end: "23:59",
      spacingMode: "auto",
    });
    const gap = normalizedSpacing(s, count).minSpacing;
    const early = dailyMinutes(s, count, () => 0),
      late = dailyMinutes(s, count, () => 0.999999);
    for (const times of [early, late]) {
      expect(new Set(times).size).toBe(count);
      expect(times[0]).toBeGreaterThanOrEqual(0);
      expect(times.at(-1)!).toBeLessThanOrEqual(1439);
      expect(times.every((t, i) => !i || t - times[i - 1] >= gap)).toBe(true);
    }
    expect(1440 - late.at(-1)! + early[0]).toBeGreaterThanOrEqual(gap);
  }
  expect(
    validSchedule(
      scheduleSchema.parse({ start: "00:00", end: "23:59", minSpacing: 130 }),
      12,
    ),
  ).toBe(false);
});
it("resizes exact times without losing retained choices and rejects invalid or duplicate times", () => {
  expect(resizeExactTimes([], 3)).toEqual(["09:00", "15:00", "21:00"]);
  expect(resizeExactTimes(["09:00"], 12)).toContain("21:00");
  const original = ["08:05", "12:37", "21:00"];
  const times = resizeExactTimes(original, 12);
  expect(times).toHaveLength(12);
  expect(new Set(times).size).toBe(12);
  expect(times).toEqual(expect.arrayContaining(original));
  const s = scheduleSchema.parse({ mode: "fixed", spacingMode: "auto", times });
  expect(validSchedule(s, 12)).toBe(true);
  for (const bad of [
    ["08:05", "08:05"],
    ["25:00", "12:00"],
    ["", "12:00"],
  ])
    expect(validSchedule({ ...s, times: bad }, 2)).toBe(false);
  expect(
    validSchedule(
      {
        ...s,
        times: ["23:59", "00:01"],
        spacingMode: "custom",
        minSpacing: 10,
      },
      2,
    ),
  ).toBe(false);
  expect(resizeExactTimes(original, 2)).toEqual(["08:05", "12:37"]);
  for (const count of [0, -1, 1.5, 1441])
    expect(validSchedule(s, count)).toBe(false);
});
