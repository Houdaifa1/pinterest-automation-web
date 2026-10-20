import type { Context } from "hono";
import type { AppEnv, Automation } from "./types";
import { PublicError } from "./security";
export async function owned(c: Context<AppEnv>, includeRemoved = false) {
  const automation = await c.env.DB.prepare(
    "SELECT * FROM automations WHERE id=? AND user_id=?" +
      (includeRemoved ? "" : " AND archived_at IS NULL"),
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<Automation>();
  if (!automation)
    throw new PublicError("not_found", "This automation was not found.", 404);
  return automation;
}
