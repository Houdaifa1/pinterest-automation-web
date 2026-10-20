import { Hono } from "hono";
import { z } from "zod";
import { owned } from "./access";
import { publicURL } from "./batch-plan";
import { PublicError, rateLimit } from "./security";
import type { AppEnv } from "./types";
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
export function extractLinks(html: string, base: string) {
  const origin = new URL(base).origin;
  const found = new Map<string, string>();
  const add = (raw: string, title = "") => {
    try {
      const u = publicURL(new URL(decode(raw), base).href);
      if (
        new URL(u).origin !== origin ||
        /\.(pdf|jpg|png|jpeg|gif|svg|webp|zip|css|js)(\?|$)/i.test(u)
      )
        return;
      found.set(
        u,
        title
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200) ||
          decode(
            new URL(u).pathname.split("/").filter(Boolean).pop() || "Home",
          ).replace(/[-_]/g, " "),
      );
    } catch {}
  };
  for (const m of html.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) add(m[1]);
  for (const m of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  ))
    add(m[1], decode(m[2]));
  return [...found].map(([url, title]) => ({ url, title }));
}
async function readPublic(url: string, sameOrigin: string) {
  for (let redirect = 0; redirect < 4; redirect++) {
    url = publicURL(url);
    if (new URL(url).origin !== sameOrigin)
      throw new PublicError(
        "source_redirect",
        "This source redirects to another website. Use its final public address.",
      );
    if (/(^|\.)(etsy\.com|gumroad\.com)$/i.test(new URL(url).hostname))
      throw new PublicError(
        "shop_access",
        "For Etsy or Gumroad, add individual product links or supply a catalog export. Full store access needs an approved store connection.",
        409,
      );
    const r = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "text/html,application/xml,text/xml" },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("Location");
      await r.body?.cancel();
      if (!loc) break;
      url = new URL(loc, url).href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new PublicError(
        "source_unavailable",
        "This page could not be read. Check the address or add product links manually.",
        409,
      );
    }
    if (!/(html|xml|text\/plain)/i.test(r.headers.get("content-type") || "")) {
      await r.body?.cancel();
      throw new PublicError(
        "source_type",
        "Use a public category or catalog page.",
      );
    }
    const reader = r.body?.getReader();
    if (!reader) throw new PublicError("source_empty", "This page is empty.");
    let size = 0;
    const decoder = new TextDecoder();
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1000000)
          throw new PublicError(
            "source_large",
            "This catalog page is too large. Use a smaller category or add product links.",
            409,
          );
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel();
    }
    return { url, text };
  }
  throw new PublicError(
    "source_redirect",
    "This source has too many redirects.",
  );
}
export const catalog = new Hono<AppEnv>();
catalog.post("/:id/catalog", async (c) => {
  await owned(c);
  await rateLimit(c, `catalog:${c.get("user").id}`, 15, 3600);
  const { url: raw } = z
    .object({ url: z.string().max(2048) })
    .parse(await c.req.json());
  const url = publicURL(raw),
    origin = new URL(url).origin;
  const { text } = await readPublic(url, origin);
  const links = extractLinks(text, url).filter(
    (p) => p.url !== url && new URL(p.url).pathname !== "/",
  );
  // This is deliberately a bounded page scan. Selection remains explicit; no full-catalog claim.
  return c.json({
    products: links.slice(0, 500),
    complete: false,
    scannedAt: Date.now(),
    source: url,
    notice:
      "Links found on this page. Select actual products and add missing links. Pagination, private products and Pinterest history are not included.",
  });
});
