import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import { auth, requireSession } from "./auth";
import { owned } from "./access";
import { integrations } from "./integrations";
import { discovery, existingSetups } from "./discovery";
import { configSchema } from "./config";
import { telegramChecks } from "./telegram";
import { callbacks, deployment } from "./deployment";
import { bodyLimit } from "hono/body-limit";
import { catalog } from "./catalog";
import { content, referenceAccess } from "./content";
import { id, isLocal, now, PublicError, cookieName } from "./security";
import type { AppEnv, Automation } from "./types";

export const app = new Hono<AppEnv>();
app.use(
  "*",
  bodyLimit({
    maxSize: 350000,
    onError: (c) =>
      c.json(
        {
          error: "too_large",
          message: "This upload is too large. Choose a smaller image.",
        },
        413,
      ),
  }),
);
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Cache-Control", "no-store");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});
app.onError((error, c) => {
  if (c.req.path.startsWith("/auth/") && c.req.path !== "/auth/dev")
    return c.redirect(
      "/?signin=" +
        (error instanceof PublicError
          ? encodeURIComponent(error.code)
          : "unavailable"),
    );
  if (error instanceof z.ZodError)
    return c.json(
      {
        error: "validation",
        message: "Check the highlighted settings and try again.",
      },
      400,
    );
  if (error instanceof PublicError)
    return c.json(
      { error: error.code, message: error.message },
      error.status as 400,
    );
  return c.json(
    {
      error: "unavailable",
      message: "This action could not finish. Please try again.",
    },
    503,
  );
});
app.route("/auth", auth);
app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/environment", (c) => c.json({ local: isLocal(c) }));
app.route("/api/callback", callbacks);
app.route("/api/reference", referenceAccess);
app.use("/api/*", requireSession);
app.get("/api/me", (c) =>
  c.json({
    user: {
      id: c.get("user").id,
      name: c.get("user").name,
      email: c.get("user").email,
      admin: c.get("user").email === c.env.OWNER_EMAIL,
    },
    csrf: c.get("session").csrf,
  }),
);
app.post("/api/logout", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(c.get("session").token_hash)
    .run();
  deleteCookie(c, cookieName(c, "session"), { path: "/", secure: !isLocal(c) });
  return c.json({ ok: true });
});
function publicAutomation(a: Automation) {
  return {
    id: a.id,
    name: a.name,
    config: JSON.parse(a.config),
    revision: a.revision,
    appliedRevision: a.applied_revision,
    status: a.status,
    setupStep: (a as any).setup_step,
    errorCode: (a as any).error_code,
    sheetUrl: a.sheet_url,
    connected: Boolean(a.integration_id),
    deployed: Boolean(a.flow_id),
    imported: a.workspace_id !== null && a.workspace_id !== undefined,
    intent: (a as any).setup_intent || "new",
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}
app.get("/api/automations", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE user_id=? ORDER BY created_at DESC",
  )
    .bind(c.get("user").id)
    .all<Automation>();
  return c.json({
    automations: rows.results
      .filter((a) => !a.archived_at)
      .map(publicAutomation),
    removedDrafts: rows.results
      .filter((a) => a.archived_at && !a.flow_id)
      .map(publicAutomation),
  });
});
app.post("/api/automations", async (c) => {
  const { name, requestId, intent } = z
    .object({
      name: z.string().trim().min(1).max(60),
      requestId: z.uuid().optional(),
      intent: z.enum(["new", "existing"]).default("new"),
    })
    .parse(await c.req.json());
  const userId = c.get("user").id,
    automationId = requestId || id();
  const existing = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE id=? AND user_id=?",
  )
    .bind(automationId, userId)
    .first<Automation>();
  if (existing) return c.json({ automation: publicAutomation(existing) });
  const integrations = (
    await c.env.DB.prepare(
      "SELECT id FROM integrations WHERE user_id=? LIMIT 2",
    )
      .bind(userId)
      .all<{ id: string }>()
  ).results;
  const saved = await c.env.DB.prepare(
    `INSERT INTO automations(id,user_id,name,integration_id,created_at,updated_at,setup_intent)
 SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM automations WHERE user_id=? AND archived_at IS NULL)<20 ON CONFLICT(id) DO NOTHING RETURNING *`,
  )
    .bind(
      automationId,
      userId,
      name,
      integrations.length === 1 ? integrations[0].id : null,
      now(),
      now(),
      intent,
      userId,
    )
    .first<Automation>();
  if (!saved) {
    const repeated = await c.env.DB.prepare(
      "SELECT * FROM automations WHERE id=? AND user_id=?",
    )
      .bind(automationId, userId)
      .first<Automation>();
    if (repeated) return c.json({ automation: publicAutomation(repeated) });
    throw new PublicError("limit", "You can create up to 20 automations.", 409);
  }
  return c.json({ automation: publicAutomation(saved) }, 201);
});
app.get("/api/automations/:id", async (c) =>
  c.json({ automation: publicAutomation(await owned(c)) }),
);
app.post("/api/automations/:id/restore-draft", async (c) => {
  const a = await owned(c, true);
  if (!a.archived_at || a.flow_id)
    throw new PublicError(
      "draft",
      "Only a removed draft can be restored.",
      409,
    );
  const result = await c.env.DB.prepare(
    "UPDATE automations SET archived_at=NULL WHERE id=? AND user_id=? AND flow_id IS NULL AND operation_id IS NULL AND (SELECT COUNT(*) FROM automations WHERE user_id=? AND archived_at IS NULL)<20",
  )
    .bind(a.id, c.get("user").id, c.get("user").id)
    .run();
  if (!result.meta.changes)
    throw new PublicError(
      "limit",
      "Finish or remove another draft before restoring this one.",
      409,
    );
  return c.json({ restored: true });
});
app.put("/api/automations/:id", async (c) => {
  const automation = await owned(c);
  const body = z
    .object({
      name: z.string().trim().min(1).max(60),
      revision: z.number().int(),
      config: configSchema,
    })
    .parse(await c.req.json());
  if (body.revision !== automation.revision)
    throw new PublicError(
      "conflict",
      "Settings changed in another tab. Reload to see the latest version.",
      409,
    );
  for (const field of ["id", "name", "connection"] as const) {
    const values = body.config.accounts.map((a) => a[field].toLowerCase());
    if (new Set(values).size !== values.length)
      throw new PublicError(
        "duplicate_account",
        "Each Pinterest account can appear only once.",
      );
  }
  const selected = [
    body.config.google,
    body.config.gmail,
    body.config.telegram,
    ...body.config.accounts.map((a) => a.connection),
  ].filter(Boolean);
  for (const connectionId of selected) {
    const connection = await c.env.DB.prepare(
      "SELECT id FROM connections WHERE id=? AND user_id=? AND integration_id=?",
    )
      .bind(connectionId, c.get("user").id, automation.integration_id)
      .first();
    if (!connection)
      throw new PublicError(
        "connection",
        "Choose a connected account from this automation.",
        400,
      );
  }
  for (const account of body.config.accounts) {
    if (
      new Set(account.hours).size !== account.pinsPerDay ||
      account.hours.length !== account.pinsPerDay
    )
      throw new PublicError(
        "schedule",
        "Choose one posting time for each daily pin.",
      );
    if (
      account.source === "website" &&
      !/^https:\/\/[^\s/]+\.[^\s]+$/.test(account.website)
    )
      throw new PublicError(
        "website",
        "Enter a complete website address starting with https://.",
      );
  }
  const config = JSON.stringify(body.config);
  if (automation.name === body.name && automation.config === config)
    return c.json({ automation: publicAutomation(automation) });
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE automations SET name=?,config=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *",
    ).bind(
      body.name,
      config,
      now(),
      automation.id,
      c.get("user").id,
      body.revision,
    ),
    c.env.DB.prepare(
      "INSERT INTO versions SELECT ?,user_id,id,revision,config,? FROM automations WHERE id=? AND user_id=? AND revision=? AND changes()=1",
    ).bind(id(), now(), automation.id, c.get("user").id, body.revision + 1),
    c.env.DB.prepare(
      "DELETE FROM versions WHERE automation_id=? AND user_id=? AND revision NOT IN (SELECT revision FROM versions WHERE automation_id=? ORDER BY revision DESC LIMIT 100)",
    ).bind(automation.id, c.get("user").id, automation.id),
  ]);
  const updated = result[0].results[0] as unknown as Automation | undefined;
  if (!updated)
    throw new PublicError(
      "conflict",
      "Settings changed in another tab. Reload to see the latest version.",
      409,
    );
  return c.json({ automation: publicAutomation(updated) });
});
app.post("/api/automations/:id/setup-step", async (c) => {
  const a = await owned(c),
    { step } = z
      .object({ step: z.number().int().min(0).max(3) })
      .parse(await c.req.json());
  await c.env.DB.prepare(
    "UPDATE automations SET setup_step=? WHERE id=? AND user_id=?",
  )
    .bind(step, a.id, c.get("user").id)
    .run();
  return c.json({ ok: true });
});
app.get("/api/automations/:id/versions", async (c) => {
  const a = await owned(c);
  const rows = await c.env.DB.prepare(
    "SELECT id,revision,created_at FROM versions WHERE automation_id=? AND user_id=? ORDER BY revision DESC LIMIT 100",
  )
    .bind(a.id, c.get("user").id)
    .all();
  return c.json({ versions: rows.results });
});
app.get("/api/admin/users", async (c) => {
  if (c.get("user").email !== c.env.OWNER_EMAIL)
    throw new PublicError("not_found", "Page not found.", 404);
  const users = await c.env.DB.prepare(
    `SELECT u.id,u.email,u.name,u.status,u.created_at,u.last_active,
 (SELECT count(*) FROM automations a WHERE a.user_id=u.id) AS automations,
 (SELECT count(*) FROM automations a WHERE a.user_id=u.id AND a.flow_id IS NOT NULL) AS deployed,
 (SELECT coalesce(sum(json_array_length(a.config,'$.accounts')),0) FROM automations a WHERE a.user_id=u.id) AS accounts
 FROM users u ORDER BY u.created_at DESC LIMIT 500`,
  ).all();
  return c.json({ users: users.results });
});
app.post("/api/admin/users/:userId", async (c) => {
  if (c.get("user").email !== c.env.OWNER_EMAIL)
    throw new PublicError("not_found", "Page not found.", 404);
  const { action } = z
    .object({ action: z.enum(["block", "unblock", "remove"]) })
    .parse(await c.req.json());
  const target = c.req.param("userId");
  if (target === c.get("user").id)
    throw new PublicError("owner", "The owner account must keep access.");
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE id=?")
    .bind(target)
    .first();
  if (!exists) throw new PublicError("not_found", "Member not found.", 404);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(
      action === "unblock"
        ? "active"
        : action === "block"
          ? "blocked"
          : "removed",
      target,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target),
    c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").bind(
      id(),
      c.get("user").id,
      target,
      action,
      now(),
    ),
  ]);
  return c.json({ ok: true });
});
app.delete("/api/me", async (c) => {
  const { confirm } = z
    .object({ confirm: z.literal(true) })
    .parse(await c.req.json());
  if (c.get("user").email === c.env.OWNER_EMAIL)
    throw new PublicError("owner", "The owner account must keep access.");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM audit WHERE actor_id=?").bind(
      c.get("user").id,
    ),
    c.env.DB.prepare("DELETE FROM users WHERE id=?").bind(c.get("user").id),
  ]);
  deleteCookie(c, cookieName(c, "session"), { path: "/", secure: !isLocal(c) });
  return c.json({ ok: confirm });
});
app.route("/api/automations", integrations);
app.route("/api/automations", discovery);
app.route("/api/existing-automations", existingSetups);
app.route("/api/automations", telegramChecks);
app.route("/api/automations", deployment);
app.route("/api/automations", content);
app.route("/api/automations", catalog);
export default app;
