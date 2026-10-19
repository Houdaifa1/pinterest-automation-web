import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv, User, Session } from "./types";
import {
  hash,
  id,
  isLocal,
  now,
  ownOrigin,
  cookieName,
  PublicError,
  randomToken,
  rateLimit,
  requireOrigin,
} from "./security";

const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const cookieOptions = (secure: boolean, maxAge: number) => ({
  httpOnly: true,
  secure,
  sameSite: "Lax" as const,
  path: "/",
  maxAge,
});
export async function createSession(
  c: Parameters<typeof ownOrigin>[0],
  user: User,
) {
  const token = randomToken();
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)",
  )
    .bind(await hash(token), user.id, randomToken(), now() + 60 * 60 * 24 * 14)
    .run();
  setCookie(
    c,
    cookieName(c, "session"),
    token,
    cookieOptions(!isLocal(c), 60 * 60 * 24 * 14),
  );
}
export async function signIn(
  c: Parameters<typeof ownOrigin>[0],
  identity: { sub: string; email: string; name: string },
) {
  const previous = await c.env.DB.prepare(
    "SELECT * FROM users WHERE google_sub=? OR email=?",
  )
    .bind(identity.sub, identity.email)
    .first<User & { google_sub: string }>();
  if (
    previous &&
    (previous.google_sub !== identity.sub || previous.status !== "active")
  )
    throw new PublicError(
      "access_denied",
      "Website access is unavailable. Contact the owner.",
      403,
    );
  const userId = previous?.id || id();
  await c.env.DB.prepare(
    `INSERT INTO users(id,google_sub,email,name,created_at,last_active) VALUES(?,?,?,?,?,?)
 ON CONFLICT(google_sub) DO UPDATE SET name=excluded.name,last_active=excluded.last_active`,
  )
    .bind(
      userId,
      identity.sub,
      identity.email,
      identity.name.slice(0, 100),
      now(),
      now(),
    )
    .run();
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id=?")
    .bind(userId)
    .first<User>();
  await createSession(c, user!);
}
export const auth = new Hono<AppEnv>();
auth.get("/start", async (c) => {
  if (!isLocal(c) && new URL(c.req.url).origin !== c.env.APP_ORIGIN)
    return c.redirect(c.env.APP_ORIGIN + "/auth/start");
  await rateLimit(
    c,
    `login:${c.req.header("CF-Connecting-IP") || "local"}`,
    30,
    600,
  );
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET)
    throw new PublicError(
      "sign_in_unavailable",
      "Google sign-in is being connected. Please try again shortly.",
      503,
    );
  const state = randomToken(),
    verifier = randomToken(),
    nonce = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?").bind(now()),
    c.env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?,?)").bind(
      await hash(state),
      verifier,
      nonce,
      now() + 600,
    ),
  ]);
  setCookie(
    c,
    cookieName(c, "oauth_state"),
    state,
    cookieOptions(!isLocal(c), 600),
  );
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${ownOrigin(c)}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: await hash(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
auth.get("/callback", async (c) => {
  const state = c.req.query("state");
  const saved = getCookie(c, cookieName(c, "oauth_state"));
  deleteCookie(c, cookieName(c, "oauth_state"), {
    path: "/",
    secure: !isLocal(c),
  });
  if (!state || state !== saved)
    throw new PublicError(
      "sign_in_expired",
      "Sign-in expired. Please continue with Google again.",
      400,
    );
  const proof = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE token_hash=? AND expires_at>? RETURNING verifier,nonce",
  )
    .bind(await hash(state), now())
    .first<{ verifier: string; nonce: string }>();
  if (!proof || !c.req.query("code"))
    throw new PublicError(
      "sign_in_expired",
      "Sign-in was cancelled or expired. Please try again.",
      400,
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code: c.req.query("code")!,
      code_verifier: proof.verifier,
      grant_type: "authorization_code",
      redirect_uri: `${ownOrigin(c)}/auth/callback`,
    }),
  });
  const token = (await response.json()) as { id_token?: string };
  if (!response.ok || !token.id_token)
    throw new PublicError(
      "sign_in_failed",
      "Google sign-in could not finish. Please try again.",
      400,
    );
  const { payload } = await jwtVerify(token.id_token, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: c.env.GOOGLE_CLIENT_ID,
    algorithms: ["RS256"],
  });
  if (
    payload.nonce !== proof.nonce ||
    payload.email_verified !== true ||
    !payload.sub ||
    typeof payload.email !== "string"
  )
    throw new PublicError(
      "identity",
      "Google could not verify this account.",
      403,
    );
  await signIn(c, {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name:
      typeof payload.name === "string"
        ? payload.name
        : payload.email.split("@")[0],
  });
  return c.redirect("/");
});
auth.post("/dev", async (c) => {
  if (!isLocal(c)) return c.notFound();
  requireOrigin(c);
  const body = await c.req.json<{ account?: string }>();
  const account = ["owner", "member-a", "member-b"].includes(body.account || "")
    ? body.account!
    : "member-a";
  await signIn(c, {
    sub: `dev-${account}`,
    email: account === "owner" ? c.env.OWNER_EMAIL : `${account}@example.test`,
    name: account === "owner" ? "Houdaifa" : account,
  });
  return c.json({ ok: true });
});
export async function requireSession(
  c: Parameters<typeof ownOrigin>[0],
  next: () => Promise<void>,
) {
  const token = getCookie(c, cookieName(c, "session"));
  if (!token)
    throw new PublicError("sign_in", "Please sign in to continue.", 401);
  const session = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), now())
    .first<Session>();
  const user =
    session &&
    (await c.env.DB.prepare(
      "SELECT id,email,name,status,created_at,last_active FROM users WHERE id=?",
    )
      .bind(session.user_id)
      .first<User>());
  if (!session || !user || user.status !== "active") {
    deleteCookie(c, cookieName(c, "session"), {
      path: "/",
      secure: !isLocal(c),
    });
    throw new PublicError("sign_in", "Please sign in to continue.", 401);
  }
  c.set("user", user);
  c.set("session", session);
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    requireOrigin(c);
    if (c.req.header("X-CSRF-Token") !== session.csrf)
      throw new PublicError("csrf", "Refresh this page and try again.", 403);
    await rateLimit(c, `write:${user.id}`, 120, 60);
  }
  if (user.last_active < now() - 300)
    await c.env.DB.prepare("UPDATE users SET last_active=? WHERE id=?")
      .bind(now(), user.id)
      .run();
  await next();
}
