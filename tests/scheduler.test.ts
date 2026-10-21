import { env } from "cloudflare:test";
import { expect, it, vi, afterEach } from "vitest";
import app from "../server/app";
import {
  dailyMinutes,
  scheduleSchema,
  utcFor,
  validateSchedule,
} from "../server/schedule-plan";
import {
  ensurePlan,
  dispatchAutomation,
  pendingPlanChanges,
} from "../server/scheduler";
import { hash, encrypt, now } from "../server/security";
const origin = "http://localhost:8788";
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const r = await app.request(
    origin + "/auth/dev",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ account: "member-a" }),
    },
    env,
  );
  const cookie = r.headers.get("Set-Cookie")!.split(";")[0];
  const me = (await (
    await app.request(origin + "/api/me", { headers: { Cookie: cookie } }, env)
  ).json()) as any;
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(
      origin + path,
      {
        method,
        headers: {
          Cookie: cookie,
          Origin: origin,
          "X-CSRF-Token": me.csrf,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    );
  const { automation } = (await (
    await request("/api/automations", "POST", { name: "Scheduled" })
  ).json()) as any;
  const config = {
    timeZone: "UTC",
    accounts: [
      {
        id: "profile",
        name: "profile",
        username: "testprofile",
        on: true,
        pinsPerDay: 3,
        hours: [9, 15, 21],
        schedule: scheduleSchema.parse({}),
      },
    ],
  };
  const integration = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO integrations VALUES(?,?,?,?,?,?)")
    .bind(
      integration,
      me.user.id,
      await encrypt(env, "private-key", me.user.id),
      "project",
      "Workspace",
      now(),
    )
    .run();
  await env.DB.prepare(
    "UPDATE automations SET config=?,applied_config=?,revision=2,applied_revision=2,scheduler_enabled=1,status='running',flow_id='flow',flow_version_id='version',seed_run_id='seed',integration_id=?,callback_hash=? WHERE id=?",
  )
    .bind(
      JSON.stringify(config),
      JSON.stringify(config),
      integration,
      await hash("private-callback"),
      automation.id,
    )
    .run();
  const a = await env.DB.prepare("SELECT * FROM automations WHERE id=?")
    .bind(automation.id)
    .first<any>();
  const callback = (path: string, body: any = {}, token = "private-callback") =>
    app.request(
      origin + `/api/execute/${a.id}/${token}/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  const job = async (status = "pending", at = now()) => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status) VALUES(?,?,?,'profile',2,?,'2026-10-20',?)",
    )
      .bind(id, a.id, "profile", at, status)
      .run();
    return id;
  };
  return { a, request, callback, job, user: me.user };
}
it("creates spaced varied times and supports arbitrary fixed minutes including midnight", () => {
  const s = scheduleSchema.parse({});
  for (let i = 0; i < 100; i++) {
    const times = dailyMinutes(s, 3);
    expect(times.length).toBe(3);
    expect(times[0]).toBeGreaterThanOrEqual(540);
    expect(times[2]).toBeLessThanOrEqual(1260);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(120);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(120);
  }
  expect(
    dailyMinutes(
      scheduleSchema.parse({
        mode: "fixed",
        times: ["00:01", "12:37", "23:59"],
        minSpacing: 1,
      }),
      3,
    ),
  ).toEqual([1, 757, 1439]);
  expect(
    validateSchedule(
      scheduleSchema.parse({ start: "09:00", end: "10:00", minSpacing: 120 }),
      3,
    ),
  ).toBe(false);
  expect(utcFor("2026-10-20", 9 * 60 + 17, "Africa/Casablanca")).toBe(
    Date.parse("2026-10-20T09:17:00Z") / 1000,
  );
  expect(utcFor("2026-03-08", 150, "America/New_York")).toBeNull();
});
it("stores the posting plan once, so refreshes do not reroll it", async () => {
  const { a } = await setup();
  await ensurePlan(env, a);
  const before = await env.DB.prepare(
    "SELECT id,planned_at FROM schedule_jobs WHERE automation_id=? ORDER BY planned_at",
  )
    .bind(a.id)
    .all();
  const fresh = await env.DB.prepare("SELECT * FROM automations WHERE id=?")
    .bind(a.id)
    .first<any>();
  await ensurePlan(env, fresh);
  const after = await env.DB.prepare(
    "SELECT id,planned_at FROM schedule_jobs WHERE automation_id=? ORDER BY planned_at",
  )
    .bind(a.id)
    .all();
  expect(before.results).toHaveLength(6);
  expect(after.results).toEqual(before.results);
});
it("claims and authorizes each scheduled job once, rejects forged callbacks and stops paused work", async () => {
  const { a, callback, job } = await setup(),
    jobId = await job("dispatched");
  expect((await callback("claim", {}, "wrong-token")).status).toBe(404);
  const claims = await Promise.all([callback("claim"), callback("claim")]);
  const bodies = (await Promise.all(claims.map((r) => r.json()))) as any[];
  expect(bodies.reduce((n, b) => n + b.jobs.length, 0)).toBe(1);
  const j = bodies.find((b) => b.jobs.length).jobs[0];
  expect(j.id).toBe(jobId);
  expect(
    (
      (await (
        await callback("authorize", { id: j.id, token: "forged" })
      ).json()) as any
    ).allowed,
  ).toBe(false);
  await env.DB.prepare("UPDATE automations SET status='paused' WHERE id=?")
    .bind(a.id)
    .run();
  expect(((await (await callback("authorize", j)).json()) as any).allowed).toBe(
    false,
  );
  await env.DB.prepare("UPDATE automations SET status='running' WHERE id=?")
    .bind(a.id)
    .run();
  expect(((await (await callback("authorize", j)).json()) as any).allowed).toBe(
    true,
  );
  expect(((await (await callback("authorize", j)).json()) as any).allowed).toBe(
    false,
  );
  await callback("finish", { ...j, outcome: "published" });
  const status = await env.DB.prepare(
    "SELECT status FROM schedule_jobs WHERE id=?",
  )
    .bind(j.id)
    .first();
  expect(status?.status).toBe("completed");
});
it("holds an uncertain provider response instead of dispatching it again", async () => {
  const { a, job } = await setup();
  const jobId = await job();
  let retries = 0;
  vi.stubGlobal("fetch", async (input: any) => {
    if (String(input).endsWith("/retry")) {
      retries++;
      throw Error("lost response");
    }
    return Response.json({
      id: "flow",
      status: "ENABLED",
      publishedVersionId: "version",
      version: { id: "version" },
    });
  });
  expect(await dispatchAutomation(env, a)).toBe(false);
  expect(
    (
      await env.DB.prepare("SELECT status FROM schedule_jobs WHERE id=?")
        .bind(jobId)
        .first()
    )?.status,
  ).toBe("review");
  await dispatchAutomation(env, a);
  expect(retries).toBe(1);
});
it("does not run a remote flow changed outside the website", async () => {
  const { a, job } = await setup();
  await job();
  let retries = 0;
  vi.stubGlobal("fetch", async (input: any) => {
    if (String(input).endsWith("/retry")) retries++;
    return Response.json({ status: "ENABLED", publishedVersionId: "changed" });
  });
  expect(await dispatchAutomation(env, a)).toBe(false);
  expect(retries).toBe(0);
  expect(
    (
      await env.DB.prepare("SELECT status FROM automations WHERE id=?")
        .bind(a.id)
        .first()
    )?.status,
  ).toBe("problem");
});
it("accepts only scoped queue snapshots and refuses stale or published-pin edits", async () => {
  const { a, callback, request } = await setup();
  const pin = {
    id: "pin-1",
    status: "Draft",
    title: "Bag",
    description: "Pattern",
    link: "https://example.com/bag",
    media: "file",
    board: "Bags",
    batch: "batch",
    pinUrl: "",
    postedAt: "",
    error: "",
  };
  expect(
    (
      await callback("snapshot", {
        accounts: [
          {
            name: "profile",
            complete: true,
            counts: { Draft: 1 },
            pins: [pin],
          },
        ],
      })
    ).status,
  ).toBe(200);
  const route = `/api/automations/${a.id}/queue/commands`,
    body = {
      requestId: crypto.randomUUID(),
      accountId: "profile",
      pinId: "pin-1",
      patch: { status: "Ready" },
    };
  expect((await request(route, "POST", body)).status).toBe(202);
  expect((await request(route, "POST", body)).status).toBe(202);
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM queue_commands").first())
      ?.n,
  ).toBe(1);
  await env.DB.prepare("UPDATE queue_snapshots SET synced_at=0").run();
  expect(
    (await request(route, "POST", { ...body, requestId: crypto.randomUUID() }))
      .status,
  ).toBe(409);
  await callback("snapshot", {
    accounts: [
      {
        name: "profile",
        complete: true,
        counts: { Done: 1 },
        pins: [
          {
            ...pin,
            status: "Done",
            pinUrl: "https://www.pinterest.com/pin/123/",
          },
        ],
      },
    ],
  });
  expect(
    (await request(route, "POST", { ...body, requestId: crypto.randomUUID() }))
      .status,
  ).toBe(409);
});

it("replaces cancelled future slots at the same minutes and preserves other profiles and completed jobs", async () => {
  const { a } = await setup();
  const config = JSON.parse(a.applied_config);
  config.accounts[0].schedule = scheduleSchema.parse({
    mode: "fixed",
    spacingMode: "auto",
    times: ["08:05", "13:07", "20:11"],
  });
  config.accounts.push({
    ...structuredClone(config.accounts[0]),
    id: "other",
    name: "other",
    username: "other",
  });
  const at = Date.parse("2030-01-10T00:00:00Z") / 1000;
  await env.DB.prepare(
    "UPDATE automations SET config=?,applied_config=?,planned_through=NULL WHERE id=?",
  )
    .bind(JSON.stringify(config), JSON.stringify(config), a.id)
    .run();
  const before = await env.DB.prepare("SELECT * FROM automations WHERE id=?")
    .bind(a.id)
    .first<any>();
  await ensurePlan(env, before, at);
  const originals = (
    await env.DB.prepare(
      "SELECT * FROM schedule_jobs WHERE automation_id=? ORDER BY account_id,planned_at",
    )
      .bind(a.id)
      .all<any>()
  ).results;
  const completed = originals.find((j) => j.account_id === "profile")!;
  await env.DB.prepare("UPDATE schedule_jobs SET status='done' WHERE id=?")
    .bind(completed.id)
    .run();
  const next = structuredClone(config);
  next.accounts[0].pinsPerDay = 4;
  next.accounts[0].schedule.times.push("21:30");
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE automations SET config=?,applied_config=?,revision=3,applied_revision=3 WHERE id=?",
    ).bind(JSON.stringify(next), JSON.stringify(next), a.id),
    ...pendingPlanChanges(env, before, JSON.stringify(next), 3, at),
  ]);
  const current = await env.DB.prepare("SELECT * FROM automations WHERE id=?")
    .bind(a.id)
    .first<any>();
  await ensurePlan(env, current, at);
  const after = (
    await env.DB.prepare(
      "SELECT * FROM schedule_jobs WHERE automation_id=? ORDER BY account_id,planned_at",
    )
      .bind(a.id)
      .all<any>()
  ).results;
  expect(after).toHaveLength(14);
  expect(after.find((j) => j.id === completed.id)).toMatchObject({
    status: "done",
    schedule_revision: 2,
  });
  const others = originals.filter((j) => j.account_id === "other");
  expect(
    after
      .filter((j) => j.account_id === "other")
      .map((j) => [j.id, j.planned_at]),
  ).toEqual(others.map((j) => [j.id, j.planned_at]));
  expect(
    after
      .filter((j) => j.status === "pending")
      .every((j) => j.schedule_revision === 3),
  ).toBe(true);
  expect(
    after.filter((j) => j.account_id === "profile" && j.status === "pending"),
  ).toHaveLength(7);
});

it("normalizes automatic spacing on save and rejects impossible explicit spacing before changing settings", async () => {
  const { a, request, user } = await setup();
  const connection = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(
      connection,
      user.id,
      a.integration_id,
      "pin",
      "pin",
      "pinterest",
      "Profile",
      "testprofile",
      "ACTIVE",
    )
    .run();
  const config = {
    timeZone: "UTC",
    accounts: [
      {
        id: "profile",
        name: "profile",
        username: "testprofile",
        connection,
        niche: "",
        category: "other",
        source: "niche",
        pinsPerDay: 10,
        hours: [9, 15, 21],
        schedule: {
          mode: "varied",
          start: "09:00",
          end: "21:00",
          spacingMode: "auto",
          minSpacing: 999,
          times: [],
        },
      },
    ],
  };
  const good = await request(`/api/automations/${a.id}`, "PUT", {
    name: "Scheduled",
    revision: 2,
    config,
  });
  expect(good.status).toBe(200);
  const saved = (await good.json()) as any;
  expect(saved.automation.config.accounts[0].schedule.minSpacing).toBe(65);
  expect(saved.automation.appliedRevision).toBe(2);
  const badConfig = structuredClone(config);
  badConfig.accounts[0].schedule.spacingMode = "custom";
  badConfig.accounts[0].schedule.minSpacing = 120;
  const bad = await request(`/api/automations/${a.id}`, "PUT", {
    name: "Scheduled",
    revision: saved.automation.revision,
    config: badConfig,
  });
  expect(bad.status).toBe(400);
  const unchanged = await env.DB.prepare(
    "SELECT revision,config FROM automations WHERE id=?",
  )
    .bind(a.id)
    .first<any>();
  expect(unchanged.revision).toBe(saved.automation.revision);
  expect(JSON.parse(unchanged.config).accounts[0].schedule.minSpacing).toBe(65);
});

it("shows real member-scoped home counts and past missed/review outcomes alongside the stored future plan", async () => {
  const { a, request, callback, job } = await setup();
  await callback("snapshot", {
    accounts: [
      {
        name: "profile",
        complete: true,
        counts: { Ready: 8, Done: 3, Draft: 2 },
        health: "OK",
        lastRun: "2026-10-21 10:00",
        pins: [],
      },
    ],
  });
  await job("missed", now() - 3600);
  await job("review", now() - 1800);
  await job("pending", now() + 300);
  const queue: any = await (
    await request(`/api/automations/${a.id}/queue`)
  ).json();
  expect(queue.recent.map((j: any) => j.status)).toEqual(["review", "missed"]);
  expect(queue.snapshots[0].health).toBe("OK");
  const home: any = await (await request("/api/automations")).json();
  const summary = home.automations.find((x: any) => x.id === a.id)
    .queueSummary[0];
  expect(summary).toMatchObject({
    accountId: "profile",
    ready: 8,
    published: 3,
    held: 2,
    total: 13,
    attention: 2,
  });
  expect(summary.nextAt).toBeGreaterThan(now());
});

it("moves one pending posting slot without changing the daily settings or calling the provider", async () => {
  const { a, request, job } = await setup();
  const day = new Date((now() + 86400) * 1000).toISOString().slice(0, 10),
    original = utcFor(day, 15 * 60, "UTC")!,
    target = utcFor(day, 14 * 60 + 12, "UTC")!;
  const id = await job("pending", original);
  await env.DB.prepare("UPDATE schedule_jobs SET local_day=? WHERE id=?")
    .bind(day, id)
    .run();
  const result = await request(
    `/api/automations/${a.id}/queue/schedule/${id}`,
    "POST",
    { expectedAt: original, time: day + "T14:12" },
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ saved: true, plannedAt: target });
  const saved = await env.DB.prepare("SELECT * FROM schedule_jobs WHERE id=?")
    .bind(id)
    .first<any>();
  expect(saved).toMatchObject({
    planned_at: target,
    status: "pending",
    schedule_revision: a.applied_revision,
  });
  const unchanged = await env.DB.prepare(
    "SELECT config,revision FROM automations WHERE id=?",
  )
    .bind(a.id)
    .first<any>();
  expect(unchanged.config).toBe(a.config);
  expect(unchanged.revision).toBe(a.revision);
  expect(
    (
      await request(`/api/automations/${a.id}/queue/schedule/${id}`, "POST", {
        expectedAt: original,
        time: day + "T14:13",
      })
    ).status,
  ).toBe(409);
});
it("rejects past, invalid, conflicting, unowned and already-started slot edits", async () => {
  const { a, request, job } = await setup();
  const day = new Date((now() + 86400) * 1000).toISOString().slice(0, 10),
    original = utcFor(day, 15 * 60, "UTC")!;
  const id = await job("pending", original);
  await env.DB.prepare("UPDATE schedule_jobs SET local_day=? WHERE id=?")
    .bind(day, id)
    .run();
  const move = (time: string, jobId = id) =>
    request(`/api/automations/${a.id}/queue/schedule/${jobId}`, "POST", {
      expectedAt: original,
      time,
    });
  expect((await move("2026-99-99T14:12")).status).toBe(400);
  expect((await move("2020-01-01T14:12")).status).toBe(400);
  const anotherDay = new Date((now() + 2 * 86400) * 1000)
    .toISOString()
    .slice(0, 10);
  expect((await move(anotherDay + "T14:12")).status).toBe(409);
  expect((await move(day + "T14:12", crypto.randomUUID())).status).toBe(404);
  await job("pending", utcFor(day, 14 * 60, "UTC")!);
  expect((await move(day + "T14:12")).status).toBe(409);
  await env.DB.prepare("UPDATE schedule_jobs SET status='started' WHERE id=?")
    .bind(id)
    .run();
  expect((await move(day + "T17:12")).status).toBe(409);
  expect(
    (
      await env.DB.prepare("SELECT planned_at FROM schedule_jobs WHERE id=?")
        .bind(id)
        .first<any>()
    ).planned_at,
  ).toBe(original);
});

it("adds a single day's extra slot repeat-safely and authorizes its increased day allowance without changing recurring settings", async () => {
  const { a, request, callback } = await setup();
  await env.DB.prepare("UPDATE automations SET day_slots_enabled=1 WHERE id=?")
    .bind(a.id)
    .run();
  const day = new Date((now() + 86400) * 1000).toISOString().slice(0, 10);
  const before: any = await (
    await request(`/api/automations/${a.id}/queue?day=${day}`)
  ).json();
  expect(before.daySlots).toHaveLength(3);
  const requestId = crypto.randomUUID(),
    body = { requestId, accountId: "profile", time: day + "T00:01" };
  expect(
    (await request(`/api/automations/${a.id}/queue/schedule`, "POST", body))
      .status,
  ).toBe(200);
  expect(
    (await request(`/api/automations/${a.id}/queue/schedule`, "POST", body))
      .status,
  ).toBe(200);
  expect(
    (
      await request(`/api/automations/${a.id}/queue/schedule`, "POST", {
        ...body,
        time: day + "T00:02",
      })
    ).status,
  ).toBe(409);
  const after: any = await (
    await request(`/api/automations/${a.id}/queue?day=${day}`)
  ).json();
  expect(after.daySlots).toHaveLength(4);
  expect(
    JSON.parse(
      (
        await env.DB.prepare("SELECT config FROM automations WHERE id=?")
          .bind(a.id)
          .first<any>()
      ).config,
    ).accounts[0].pinsPerDay,
  ).toBe(3);
  await env.DB.prepare(
    "INSERT INTO schedule_jobs(id,automation_id,account_id,account_name,schedule_revision,planned_at,local_day,status,detail,origin) VALUES(?,?,?,?,?,?,?,'completed','published','manual')",
  )
    .bind(
      crypto.randomUUID(),
      a.id,
      "profile",
      "profile",
      a.applied_revision,
      Date.parse(day + "T00:02:00Z") / 1000,
      day,
    )
    .run();
  await env.DB.prepare(
    "UPDATE schedule_jobs SET status='dispatched' WHERE id=?",
  )
    .bind(requestId)
    .run();
  const claimed: any = await (await callback("claim")).json(),
    job = claimed.jobs.find((j: any) => j.id === requestId);
  const allowed: any = await (
    await callback("authorize", { id: job.id, token: job.token })
  ).json();
  expect(allowed).toMatchObject({ allowed: true, dailyCap: 4 });
  expect(
    (
      await request(
        `/api/automations/${a.id}/queue/schedule/${requestId}`,
        "DELETE",
        { expectedAt: Date.parse(day + "T00:01:00Z") / 1000 },
      )
    ).status,
  ).toBe(409);
});
it("removes a future slot without changing its pins and keeps next-day planning separate from the near-term horizon", async () => {
  const { a, request } = await setup();
  const day = new Date((now() + 5 * 86400) * 1000).toISOString().slice(0, 10);
  const result: any = await (
    await request(`/api/automations/${a.id}/queue?day=${day}`)
  ).json();
  expect(result.daySlots).toHaveLength(3);
  const stored = await env.DB.prepare(
    "SELECT planned_through FROM automations WHERE id=?",
  )
    .bind(a.id)
    .first<any>();
  expect(stored.planned_through < day).toBe(true);
  const j = result.daySlots[0];
  expect(
    (
      await request(
        `/api/automations/${a.id}/queue/schedule/${j.id}`,
        "DELETE",
        { expectedAt: j.planned_at },
      )
    ).status,
  ).toBe(200);
  const refreshed: any = await (
    await request(`/api/automations/${a.id}/queue?day=${day}`)
  ).json();
  expect(refreshed.daySlots.find((s: any) => s.id === j.id).status).toBe(
    "cancelled",
  );
  expect(
    (await request(`/api/automations/${a.id}/queue?day=2026-99-99`)).status,
  ).toBe(400);
});

it("uses a batch's six varied slots, keeps defaults unchanged, preserves saved randomness and falls back after its final Ready row", async () => {
  const { a, request, callback } = await setup();
  await env.DB.prepare(
    "UPDATE automations SET batch_schedule_enabled=1 WHERE id=?",
  )
    .bind(a.id)
    .run();
  const pin = {
    id: "batch-pin",
    batch: "batch-six",
    rowNumber: 2,
    publishAfter: "",
    productPaused: false,
    status: "Ready",
    title: "One",
    description: "",
    link: "",
    media: "",
    board: "",
    pinUrl: "",
    postedAt: "",
    error: "",
  };
  const snapshot = (pins: any[], batchReady?: Record<string, number>) =>
    callback("snapshot", {
      accounts: [
        {
          name: "profile",
          complete: true,
          counts: pins.length
            ? {
                Ready: batchReady
                  ? Object.values(batchReady).reduce((a, b) => a + b, 0)
                  : 1,
              }
            : { Done: 1 },
          batchReady,
          pins,
        },
      ],
    });
  expect((await snapshot([pin])).status).toBe(200);
  const before = (
    await env.DB.prepare("SELECT applied_config FROM automations WHERE id=?")
      .bind(a.id)
      .first<any>()
  ).applied_config;
  const result = await request(
    `/api/automations/${a.id}/accounts/profile/batch-schedule`,
    "PUT",
    {
      batchId: "batch-six",
      posting: {
        pinsPerDay: 6,
        schedule: {
          mode: "varied",
          start: "09:00",
          end: "21:00",
          spacingMode: "auto",
          times: [],
          minSpacing: 120,
        },
      },
    },
  );
  expect(result.status).toBe(200);
  const day = new Date((now() + 86400) * 1000).toISOString().slice(0, 10);
  const read = async () =>
    (await (
      await request(`/api/automations/${a.id}/queue?day=${day}`)
    ).json()) as any;
  const first = await read(),
    slots = first.daySlots.filter((j: any) => j.status === "pending");
  expect(slots).toHaveLength(6);
  expect(first.batchSchedules[0]).toMatchObject({
    batchId: "batch-six",
    pinsPerDay: 6,
  });
  const again = await read();
  expect(
    again.daySlots
      .filter((j: any) => j.status === "pending")
      .map((j: any) => j.planned_at),
  ).toEqual(slots.map((j: any) => j.planned_at));
  const target = slots[0];
  await env.DB.prepare(
    "UPDATE schedule_jobs SET status='dispatched' WHERE id=?",
  )
    .bind(target.id)
    .run();
  const claimed: any = await (await callback("claim")).json();
  const job = claimed.jobs.find((j: any) => j.id === target.id);
  // Authorize only a due slot; this fixture marks it dispatched to exercise its scoped contract.
  const allowed: any = await (
    await callback("authorize", { id: job.id, token: job.token })
  ).json();
  expect(allowed).toMatchObject({
    allowed: true,
    dailyCap: 6,
    batchPolicy: { batchId: "batch-six", excludedBatches: ["batch-six"] },
  });
  await callback("finish", {
    id: job.id,
    token: job.token,
    outcome: "published",
  });
  await snapshot(
    [{ ...pin, id: "other-batch", batch: "other", rowNumber: 2 }],
    { "batch-six": 1, other: 1 },
  );
  expect((await read()).batchSchedules[0].batchId).toBe("batch-six");
  expect((await snapshot([])).status).toBe(200);
  const fallback = await read();
  expect(fallback.batchSchedules[0]).toMatchObject({
    batchId: "",
    pinsPerDay: 3,
  });
  expect(
    fallback.daySlots.filter((j: any) => j.status === "pending"),
  ).toHaveLength(3);
  expect(
    (
      await env.DB.prepare("SELECT applied_config FROM automations WHERE id=?")
        .bind(a.id)
        .first<any>()
    ).applied_config,
  ).toBe(before);
});
it("does not activate a batch schedule from a copied request or an unknown queue identity", async () => {
  const { a, request } = await setup();
  const path = `/api/automations/${a.id}/accounts/profile/batch-schedule`;
  expect(
    (
      await request(path, "PUT", {
        batchId: "unknown",
        posting: { pinsPerDay: 6, schedule: { mode: "varied" } },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request(path, "PUT", {
        batchId: "unknown",
        posting: { pinsPerDay: 0, schedule: { mode: "varied" } },
      })
    ).status,
  ).toBe(400);
});
it("concurrent planners cannot double a varied daily amount", async () => {
  const { a } = await setup();
  await Promise.all([ensurePlan(env, a), ensurePlan(env, a)]);
  const jobs = (
    await env.DB.prepare(
      "SELECT local_day,COUNT(*) AS n FROM schedule_jobs WHERE automation_id=? AND status<>'cancelled' GROUP BY local_day",
    )
      .bind(a.id)
      .all()
  ).results;
  expect(jobs.length).toBe(2);
  expect(jobs.every((d: any) => d.n === 3)).toBe(true);
});
it("fallback restores edited default times and removals after a batch reuses their minutes, without rerolling another profile", async () => {
  const { a, request, callback } = await setup();
  const config = JSON.parse(a.applied_config);
  config.accounts[0].schedule = scheduleSchema.parse({
    mode: "fixed",
    times: ["09:00", "15:00", "21:00"],
    minSpacing: 1,
  });
  config.accounts.push({
    ...config.accounts[0],
    id: "other-profile",
    name: "other-profile",
    pinsPerDay: 2,
    hours: [8, 20],
    schedule: scheduleSchema.parse({
      mode: "fixed",
      times: ["08:00", "20:00"],
      minSpacing: 1,
    }),
  });
  await env.DB.prepare(
    "UPDATE automations SET config=?,applied_config=?,batch_schedule_enabled=1 WHERE id=?",
  )
    .bind(JSON.stringify(config), JSON.stringify(config), a.id)
    .run();
  const day = new Date((now() + 86400) * 1000).toISOString().slice(0, 10);
  const read = async () =>
    (await (
      await request(`/api/automations/${a.id}/queue?day=${day}`)
    ).json()) as any;
  const initial = await read(),
    slots = initial.daySlots.filter((j: any) => j.account_id === "profile");
  const others = initial.daySlots.filter(
    (j: any) => j.account_id === "other-profile",
  );
  expect(
    (
      await request(
        `/api/automations/${a.id}/queue/schedule/${slots[0].id}`,
        "POST",
        { expectedAt: slots[0].planned_at, time: day + "T10:12" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/api/automations/${a.id}/queue/schedule/${slots[1].id}`,
        "DELETE",
        { expectedAt: slots[1].planned_at },
      )
    ).status,
  ).toBe(200);
  const pin = {
    id: "scoped-pin",
    batch: "scoped",
    rowNumber: 2,
    publishAfter: "",
    productPaused: false,
    status: "Ready",
    title: "One",
    description: "",
    link: "",
    media: "",
    board: "",
    pinUrl: "",
    postedAt: "",
    error: "",
  };
  const snapshot = (pins: any[]) =>
    callback("snapshot", {
      accounts: [
        {
          name: "profile",
          complete: true,
          counts: pins.length ? { Ready: 1 } : { Done: 1 },
          pins,
        },
      ],
    });
  await snapshot([pin]);
  expect(
    (
      await request(
        `/api/automations/${a.id}/accounts/profile/batch-schedule`,
        "PUT",
        {
          batchId: "scoped",
          posting: {
            pinsPerDay: 6,
            schedule: {
              mode: "fixed",
              times: ["09:00", "12:00", "15:00", "17:00", "19:00", "21:00"],
              minSpacing: 1,
            },
          },
        },
      )
    ).status,
  ).toBe(200);
  expect(
    (await read()).daySlots.filter(
      (j: any) => j.account_id === "profile" && j.status === "pending",
    ),
  ).toHaveLength(6);
  await snapshot([]);
  const after = await read(),
    pending = after.daySlots.filter(
      (j: any) => j.account_id === "profile" && j.status === "pending",
    );
  expect(pending.map((j: any) => j.planned_at)).toEqual([
    utcFor(day, 612, "UTC"),
    utcFor(day, 1260, "UTC"),
  ]);
  expect(after.daySlots.find((j: any) => j.id === slots[1].id).status).toBe(
    "cancelled",
  );
  expect(
    after.daySlots.filter((j: any) => j.account_id === "other-profile"),
  ).toEqual(others);
});
