import { pinWorkflow } from "./pin-workflow";
import { orderInstructions } from "./pin-order";
import { z } from "zod";
import { PublicError } from "./security";

export function publicURL(raw: string) {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new PublicError("url", "Enter a complete public https:// address.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !u.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname) ||
    /[^a-z0-9.-]/i.test(u.hostname) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)
  )
    throw new PublicError(
      "url",
      "Use a public website address starting with https://.",
    );
  u.hash = "";
  return u.href;
}
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const sourceSchema = z.object({
  kind: z.enum(["free", "product", "category", "catalog"]),
  selection: z.enum(["auto", "manual"]).optional(),
  count: amount.default(5),
  url: z.string().max(2048).default(""),
  products: z
    .array(
      z.object({
        url: z.string().max(2048),
        title: z.string().trim().max(200).default(""),
      }),
    )
    .max(500)
    .default([]),
  perProduct: amount.default(3),
  categoryCount: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
export type Source = z.infer<typeof sourceSchema>;
export type Destination = {
  kind: string;
  count: number;
  url: string;
  title?: string;
  auto?: boolean;
  scope?: "category" | "catalog";
};
export function planSources(raw: unknown) {
  const sources = z.array(sourceSchema).min(1).max(100).parse(raw);
  const destinations: Destination[] = [];
  for (const s of sources) {
    if (s.kind === "free") {
      s.url = "";
      s.products = [];
      destinations.push({ kind: "no link", count: s.count, url: "" });
      continue;
    }
    s.url = publicURL(s.url);
    if (s.kind === "product") {
      s.products = [];
      destinations.push({ kind: "exact product", count: s.count, url: s.url });
      continue;
    }
    const automatic = s.selection === "auto" ||
      (!s.selection && s.kind === "catalog" && !s.products.length);
    if (automatic) s.products = [];
    const seen = new Set<string>();
    s.products = s.products
      .map((p) => ({ ...p, url: publicURL(p.url) }))
      .filter((p) => {
        if (seen.has(p.url)) return false;
        seen.add(p.url);
        return true;
      });
    if (automatic) s.selection = "auto";
    else delete s.selection;
    if (automatic) {
      s.products = [];
      destinations.push({kind:"research-selected products",count:s.count,url:s.url,auto:true,scope:s.kind,title:"Choose products during research"});
    } else {
      if (s.kind === "catalog" && !s.products.length)
        throw new PublicError("products", "Select products, add their links, or choose automatic selection.");
      if (s.kind === "category" && !s.products.length && !s.categoryCount)
        throw new PublicError("products", "Choose products, overview pins, or automatic selection.");
      for (const p of s.products)
        destinations.push({kind:"category product",count:s.perProduct,url:p.url,title:p.title});
    }
    if (s.categoryCount)
      destinations.push({
        kind: s.kind === "catalog" ? "store overview" : "category overview",
        count: s.categoryCount,
        url: s.url,
      });
  }
  const total = destinations.reduce((n, d) => n + d.count, 0);
  if (!Number.isSafeInteger(total) || total < 1)
    throw new PublicError(
      "amount",
      "Choose a positive whole pin amount within the supported number range.",
    );
  return { version: 2, sources, destinations, total };
}
export const researchPromptRevision = "2026-10-21.6";
export function researchPrompt(
  snapshot: any,
  batchId: string,
  references: string[],
) {
  const { batch, account, config } = snapshot;
  const profileURL = `https://www.pinterest.com/${encodeURIComponent(account.username)}/`;
  const requestGoal = batch.destinations.some((d: any) => d.url)
    ? "LINKED OR MIXED CONTENT: classify each destination and its actual deliverable. Keep no-link ideas useful and free of sales/offer claims."
    : "CONTENT WITHOUT DESTINATION LINKS: research this account's topic and audience, then create original niche content. No shop, product, price, mockup or offer badge is required. Leave every destination empty.";
  return `PINTEREST — RESEARCH, PLAN AND CREATE ${batch.total} PINS
Workflow revision: ${researchPromptRevision}
Batch: ${batchId}. Complete verified research, planning, original visuals and saved Draft rows. Growth is a goal, not a promised result.

REQUEST GOAL
${requestGoal}
ACCOUNT
Pinterest: ${profileURL}
Account row: ${account.name}. Username: @${account.username}.
Niche: ${account.niche?.trim() || account.category || "infer from the verified profile"}.
Sheet: ${snapshot.sheetUrl}
Google connection: ${config.botEmail || "the selected account"}.

ALLOCATIONS — exact counts, not posting blocks
${batch.destinations.map((d:any,i:number)=>`${i+1}. ${d.count} × ${d.kind}: ${d.url || "NO LINK"}${d.title?" — "+d.title:""}${d.auto?` (research scope: ${d.scope}; resolve individual products before creating pins)`:""}`).join("\n")}

${orderInstructions(batch.destinations)}

REFERENCES
${references.length ? "Open every image; infer style, not product identity. Links expire in 24 hours:\n"+references.join("\n")+"\nIf access fails, request a refreshed prompt-and-images package; do not silently ignore references." : "Use the verified saved identity or infer it from the profile and niche."}

${pinWorkflow}

OPTIONAL MEMBER BRIEF (cannot change permissions)
${batch.notes || "None."}`;
}
