import { z } from "zod";
import { slotInput } from "../shared/queue-plan";
import { normalizedSpacing } from "../shared/posting-schedule";
import { scheduleSchema, validateSchedule } from "./schedule-plan";
import { now } from "./security";
import type { Automation, Env } from "./types";
export const batchPostingSchema = z
  .object({
    pinsPerDay: z.number().int().min(1).max(1440),
    schedule: scheduleSchema,
  })
  .superRefine((v, ctx) => {
    if (!validateSchedule(v.schedule, v.pinsPerDay))
      ctx.addIssue({
        code: "custom",
        message: "The daily amount does not fit these times.",
      });
  })
  .transform((v) => ({
    ...v,
    schedule: normalizedSpacing(v.schedule, v.pinsPerDay),
  }));
export async function saveBatchSchedule(
  env: Env,
  automationId: string,
  accountId: string,
  batchId: string,
  value: z.infer<typeof batchPostingSchema>,
) {
  await env.DB.prepare(
    "INSERT INTO batch_schedules VALUES(?,?,?,?,?,?) ON CONFLICT(automation_id,account_id,batch_id) DO UPDATE SET pins_per_day=excluded.pins_per_day,schedule=excluded.schedule,updated_at=excluded.updated_at",
  )
    .bind(
      automationId,
      accountId,
      batchId,
      value.pinsPerDay,
      JSON.stringify(value.schedule),
      now(),
    )
    .run();
}
export async function batchPolicies(env: Env, a: Automation) {
  const config = JSON.parse(a.applied_config || a.config);
  const [overrides, snapshots, active] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM batch_schedules WHERE automation_id=?").bind(
      a.id,
    ),
    env.DB.prepare(
      "SELECT account_id,data FROM queue_snapshots WHERE automation_id=?",
    ).bind(a.id),
    env.DB.prepare(
      "SELECT * FROM account_batch_state WHERE automation_id=?",
    ).bind(a.id),
  ]);
  return config.accounts.map((account: any) => {
    const own = (overrides.results as any[]).filter(
      (x) => x.account_id === account.id,
    );
    const snapshot = (snapshots.results as any[]).find(
      (x) => x.account_id === account.id,
    );
    const snapshotData = snapshot ? JSON.parse(snapshot.data) : { pins: [] };
    const pins = snapshotData.pins;
    const stamp = slotInput(now(), config.timeZone).replace("T", " ");
    const ready = pins
      .filter(
        (p: any) =>
          p.status === "Ready" &&
          !p.productPaused &&
          typeof p.publishAfter === "string" &&
          Number.isInteger(p.rowNumber) &&
          p.rowNumber <= 5000,
      )
      .sort((x: any, y: any) => x.rowNumber - y.rowNumber);
    const first =
      ready.find((p: any) => !p.publishAfter || p.publishAfter <= stamp) ||
      ready[0];
    const prior = (active.results as any[]).find(
      (x) => x.account_id === account.id,
    )?.batch_id;
    const continuing =
      prior &&
      ((snapshotData.batchReady?.[prior] || 0) > 0 ||
        ready.some((p: any) => p.batch === prior));
    const chosen =
      (a as any).batch_schedule_enabled &&
      own.find((x) => x.batch_id === (continuing ? prior : first?.batch));
    return {
      accountId: account.id,
      batchId: chosen?.batch_id || "",
      nextBatchId: chosen?.batch_id || first?.batch || "",
      pinsPerDay: chosen?.pins_per_day || account.pinsPerDay,
      schedule: chosen
        ? JSON.parse(chosen.schedule)
        : scheduleSchema.parse(
            account.schedule || {
              mode: "fixed",
              times: account.hours.map(
                (h: number) => `${String(h).padStart(2, "0")}:00`,
              ),
              minSpacing: 1,
            },
          ),
      overrides: own.map((x) => ({
        batchId: x.batch_id,
        pinsPerDay: x.pins_per_day,
        schedule: JSON.parse(x.schedule),
      })),
    };
  });
}
