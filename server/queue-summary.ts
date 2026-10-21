import { queueCounts } from "../shared/queue-plan";
import type { Env } from "./types";
import { now } from "./security";
export async function memberQueueSummaries(env: Env, userId: string) {
  const [snapshots, jobs] = await env.DB.batch([
    env.DB.prepare(
      "SELECT q.* FROM queue_snapshots q JOIN automations a ON a.id=q.automation_id WHERE a.user_id=? AND a.archived_at IS NULL",
    ).bind(userId),
    env.DB.prepare(
      "SELECT j.automation_id,j.account_id,MIN(CASE WHEN j.status='pending' AND j.planned_at>=? THEN j.planned_at END) AS next_at,SUM(CASE WHEN j.status IN('review','missed') AND j.planned_at>=? THEN 1 ELSE 0 END) AS attention FROM schedule_jobs j JOIN automations a ON a.id=j.automation_id WHERE a.user_id=? AND a.archived_at IS NULL GROUP BY j.automation_id,j.account_id",
    ).bind(now(), now() - 86400, userId),
  ]);
  const result: Record<string, any[]> = {};
  for (const s of snapshots.results as any[]) {
    const data = JSON.parse(s.data),
      j = (jobs.results as any[]).find(
        (j) =>
          j.automation_id === s.automation_id && j.account_id === s.account_id,
      );
    (result[s.automation_id] ||= []).push({
      accountId: s.account_id,
      ...queueCounts(data.counts || {}),
      syncedAt: s.synced_at,
      complete: Boolean(s.complete),
      nextAt: j?.next_at || null,
      attention: j?.attention || 0,
    });
  }
  return result;
}
