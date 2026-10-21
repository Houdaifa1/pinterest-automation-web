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
const plain = (html: string) =>
  decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
function attribute(attrs: string, name: string) {
  return (
    attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ||
    ""
  );
}
function normalize(raw: string, base: string) {
  if (!raw || raw.startsWith("#")) return null;
  try {
    const url = new URL(publicURL(new URL(decode(raw), base).href));
    if (url.origin !== new URL(base).origin) return null;
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}
function isUtility(url: string) {
  const p = new URL(url).pathname;
  return (
    /\.(pdf|jpg|jpeg|png|webp|avif|gif|svg|zip|xml|css|js)$/i.test(p) ||
    /(?:^|\/)(?:privacy|privacy-policy|terms|terms-of-service|about|contact|cart|checkout|account|login|sign-in|search|feed|rss|sitemap)(?:\/|$)/i.test(
      p,
    )
  );
}
function isListing(url: string) {
  const path = new URL(url).pathname;
  return (
    (/(?:^|\/)(?:category|categories|collections|page|tag)(?:\/|$)/i.test(
      path,
    ) &&
      !/(?:\/products?\/)[^/]+\/?$/i.test(path)) ||
    /^\/(?:patterns?|products?|shop|store)\/?$/i.test(path)
  );
}
export function parseCatalog(html: string, base: string) {
  const clean = html.replace(/<!--[^]*?-->/g, ""),
    main = clean.match(/<main\b[^>]*>([^]*?)<\/main>/i)?.[1] || "";
  const content = main.replace(
    /<(?:nav|header|footer|aside)\b[^>]*>[^]*?<\/(?:nav|header|footer|aside)>/gi,
    "",
  );
  const products = new Map<string, { url: string; title: string }>(),
    next = new Set<string>(),
    catalogs = new Set<string>();
  const add = (raw: string, title: string, structured = false) => {
    const url = normalize(raw, base);
    if (
      !url ||
      url === publicURL(base) ||
      isUtility(url) ||
      isListing(url) ||
      new URL(url).pathname === "/"
    )
      return;
    if (!title && !structured) return;
    products.set(url, {
      url,
      title:
        plain(title).slice(0, 200) ||
        decode(
          new URL(url).pathname.split("/").filter(Boolean).pop() || "",
        ).replace(/-/g, " "),
    });
  };
  // Product/ItemList data is allowed; breadcrumbs and site navigation are deliberately ignored.
  for (const script of clean.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([^]*?)<\/script>/gi,
  )) {
    try {
      const root = JSON.parse(script[1]),
        nodes = Array.isArray(root)
          ? root
          : Array.isArray(root["@graph"])
            ? root["@graph"]
            : [root];
      for (const node of nodes) {
        const types = Array.isArray(node["@type"])
          ? node["@type"]
          : [node["@type"]];
        if (types.includes("Product"))
          add(node.url || node["@id"], node.name || "", true);
        if (types.includes("ItemList"))
          for (const item of node.itemListElement || []) {
            const product = item.item || item;
            add(
              typeof product === "string" ? product : product.url || item.url,
              product.name || item.name || "",
              true,
            );
          }
      }
    } catch {}
  }
  for (const m of content.matchAll(/<a\b([^>]*?)>([^]*?)<\/a>/gi)) {
    const raw = attribute(m[1], "href"),
      url = normalize(raw, base);
    if (!url || isUtility(url)) continue;
    const title = plain(m[2]),
      classes = attribute(m[1], "class"),
      rel = attribute(m[1], "rel");
    if (
      /\bnext\b/i.test(rel) ||
      /^next(?: page| results)?\b/i.test(title) ||
      /^next(?: page)?$/i.test(attribute(m[1], "aria-label"))
    ) {
      next.add(url);
      continue;
    }
    if (isListing(url)) {
      if (!/\/(?:page|tag)\//i.test(new URL(url).pathname)) catalogs.add(url);
      continue;
    }
    const heading = m[2].match(/<h[23]\b[^>]*>([^]*?)<\/h[23]>/i)?.[1];
    const productRoute =
      /(?:^|\/)(?:patterns?|products?|listing)\/[^/]+\/?$/i.test(
        new URL(url).pathname,
      );
    const productCard =
      /(?:^|\s)(?:card|product[-_\w]*|pattern[-_\w]*)(?:\s|$)/i.test(classes) ||
      /\bitemtype=["'][^"']*Product/i.test(m[1]);
    if (
      (productRoute && /<img\b/i.test(m[2])) ||
      (productCard && (heading || /<img\b/i.test(m[2])))
    )
      add(raw, heading || title);
  }
  for (const m of clean.matchAll(/<link\b([^>]+)>/gi))
    if (/\bnext\b/i.test(attribute(m[1], "rel"))) {
      const u = normalize(attribute(m[1], "href"), base);
      if (u) next.add(u);
    }
  const count = content.match(
    /<(?:p|span|div)\b[^>]*class=["'][^"']*\b(?:count|product-count|results-count)\b[^"']*["'][^>]*>([^]*?)<\/(?:p|span|div)>/i,
  )?.[1];
  const expected = count
    ? Number(
        plain(count)
          .match(/[\d,]+/)?.[0]
          .replace(/,/g, ""),
      ) || null
    : null;
  return {
    products: [...products.values()],
    next: [...next],
    catalogs: [...catalogs],
    expected,
  };
}
export function extractLinks(html: string, base: string) {
  return parseCatalog(html, base).products;
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
  const { url: raw, kind } = z
    .object({
      url: z.string().max(2048),
      kind: z.enum(["category", "catalog"]).default("category"),
    })
    .parse(await c.req.json());
  const url = publicURL(raw),
    origin = new URL(url).origin;
  const pending = [url],
    seen = new Set<string>(),
    products = new Map<string, { url: string; title: string }>();
  let expected: number | null = null,
    failed = 0,
    listingRoot = url;
  const started = Date.now();
  while (pending.length && seen.size < 30 && Date.now() - started < 18000) {
    const page = pending.shift()!;
    if (seen.has(page)) continue;
    seen.add(page);
    let text: string;
    try {
      text = (await readPublic(page, origin)).text;
    } catch (e) {
      if (seen.size === 1) throw e;
      failed++;
      continue;
    }
    if (/<title>[^<]*(?:page not found|404|access denied)/i.test(text))
      throw new PublicError(
        "source_unavailable",
        "This address is not a readable catalog page. Use the category or shop listing address.",
        409,
      );
    const parsed = parseCatalog(text, page);
    if (expected === null && parsed.expected !== null)
      expected = parsed.expected;
    for (const p of parsed.products) products.set(p.url, p);
    for (const next of parsed.next) {
      // Follow only this listing's own pages. Never use a whole-site sitemap for a category.
      const rootPath = new URL(listingRoot).pathname.replace(/\/$/, ""),
        path = new URL(next).pathname;
      if (
        (path === rootPath ||
          path === rootPath + "/" ||
          path.startsWith(rootPath + "/page/")) &&
        !seen.has(next)
      )
        pending.push(next);
    }
    if (
      kind === "catalog" &&
      seen.size === 1 &&
      new URL(url).pathname === "/"
    ) {
      const listing = parsed.catalogs.find((u) =>
        /^\/(patterns?|products?|shop|store)\/?$/i.test(new URL(u).pathname),
      );
      if (listing) {
        listingRoot = listing;
        products.clear();
        expected = null;
        pending.unshift(listing);
      }
    }
  }
  if (!products.size)
    throw new PublicError(
      "catalog_empty",
      "No product cards could be verified on this page. Use the actual product listing or add product links. Navigation and privacy links are not products.",
      409,
    );
  const complete =
    !pending.length &&
    !failed &&
    (expected === null || expected === products.size);
  return c.json({
    products: [...products.values()],
    complete,
    listingComplete: complete,
    expected,
    discovered: products.size,
    pagesRead: seen.size,
    scannedAt: Date.now(),
    source: url,
    notice: complete
      ? `${products.size} product links found across ${seen.size} page${seen.size === 1 ? "" : "s"}. Select the products for this batch. Pinterest history is checked separately.`
      : `${products.size}${expected ? " of " + expected : ""} product links found. This scan is incomplete; missing pages were not treated as an empty catalog. Use a smaller category or add missing product links.`,
  });
});
