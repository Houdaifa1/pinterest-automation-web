import { expect, it } from "vitest";
import { plannedPins, queueCounts } from "../shared/queue-plan";
const stamp = (hour: number) => Date.UTC(2026, 9, 21, hour) / 1000;
it("pairs Sheet order with stored slots while respecting future dates and paused products", () => {
  const pins = [
    {
      id: "later",
      rowNumber: 2,
      status: "Ready",
      publishAfter: "2026-10-21 15:00",
    },
    { id: "now", rowNumber: 4, status: "Ready", publishAfter: "" },
    { id: "held", rowNumber: 3, status: "Ready", productPaused: true },
    { id: "draft", rowNumber: 5, status: "Draft" },
  ];
  const jobs = [
    { id: "b", planned_at: stamp(16), status: "pending" },
    { id: "a", planned_at: stamp(12), status: "pending" },
    { id: "old", planned_at: stamp(9), status: "missed" },
  ];
  const plan = plannedPins(pins, jobs, "UTC", true, stamp(10));
  expect(plan.map((p) => [p.pin.id, p.slot.id])).toEqual([
    ["now", "a"],
    ["later", "b"],
  ]);
  expect(plannedPins(pins, jobs, "UTC", false, stamp(10))).toEqual([]);
  expect(pins[0].id).toBe("later");
});
it("does not invent pin slots from missing data, completed jobs or unreadable dates", () => {
  expect(
    plannedPins(
      [{ id: "bad", status: "Ready", publishAfter: null }],
      [{ status: "pending", planned_at: stamp(12) }],
      "UTC",
      true,
      stamp(10),
    ),
  ).toEqual([]);
  expect(
    plannedPins(
      [{ id: "ready", status: "Ready" }],
      [{ status: "completed", planned_at: stamp(12) }],
      "UTC",
      true,
      stamp(10),
    ),
  ).toEqual([]);
  expect(
    queueCounts({ Ready: 8, Done: 3, Draft: 2, Error: 1, Skip: 4 }),
  ).toEqual({ ready: 8, published: 3, held: 3, total: 18 });
});
