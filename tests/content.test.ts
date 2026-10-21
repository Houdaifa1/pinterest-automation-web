import { env } from "cloudflare:test";
import { it, expect } from "vitest";
import app from "../server/app";
import { cleanJpeg } from "../server/images.mjs";
const origin = "http://localhost:8788";
async function login(account: string) {
  const r = await app.request(
    origin + "/auth/dev",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ account }),
    },
    env,
  );
  const cookie = r.headers.get("Set-Cookie")!.split(";")[0];
  const me = (await (
    await app.request(origin + "/api/me", { headers: { Cookie: cookie } }, env)
  ).json()) as any;
  return { cookie, ...me };
}
async function request(
  path: string,
  session: any,
  method = "GET",
  body?: unknown,
  raw = false,
) {
  return app.request(
    origin + path,
    {
      method,
      headers: {
        Cookie: session.cookie,
        Origin: origin,
        "X-CSRF-Token": session.csrf,
        "Content-Type": raw ? "image/jpeg" : "application/json",
      },
      body:
        body === undefined
          ? undefined
          : raw
            ? (body as Uint8Array)
            : JSON.stringify(body),
    },
    env,
  );
}
async function setup() {
  const user = await login("member-a"),
    other = await login("member-b");
  const response = await request("/api/automations", user, "POST", {
    name: "Saved style",
  });
  const { automation } = (await response.json()) as any;
  const config = {
    emailTo: "member-a@example.test",
    botEmail: "bot@example.test",
    timeZone: "UTC",
    accounts: [
      {
        id: "profile",
        name: "testprofile",
        username: "testprofile",
        niche: "crochet",
        general: false,
        category: "crochet",
        source: "niche",
        pinsPerProduct: 6,
        pinsPerDay: 5,
        hours: [9, 12, 15, 18, 21],
        on: true,
      },
    ],
  };
  await env.DB.prepare("UPDATE automations SET config=?,sheet_url=? WHERE id=?")
    .bind(
      JSON.stringify(config),
      "https://docs.google.com/spreadsheets/d/testsheet/edit",
      automation.id,
    )
    .run();
  return { user, other, automation, base: `/api/automations/${automation.id}` };
}
const fixture = () =>
  Uint8Array.from(atob(env.TEST_JPEG as string), (c) => c.charCodeAt(0));
it("accepts bounded image content and strips metadata before storing it", () => {
  const image = fixture(),
    app1 = Uint8Array.from([255, 225, 0, 10, 69, 120, 105, 102, 0, 0, 0, 0]);
  const withMetadata = new Uint8Array(image.length + app1.length);
  withMetadata.set(image.slice(0, 2));
  withMetadata.set(app1, 2);
  withMetadata.set(image.slice(2), 2 + app1.length);
  expect(cleanJpeg(withMetadata).bytes).toEqual(cleanJpeg(image).bytes);
  expect(() =>
    cleanJpeg(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
  ).toThrow();
  expect(() => cleanJpeg(image.slice(0, -2))).toThrow();
});
it("keeps uploaded references private to their owner", async () => {
  const { user, other, base } = await setup();
  const upload = await request(
    base + "/accounts/profile/media",
    user,
    "POST",
    fixture(),
    true,
  );
  expect(upload.status).toBe(201);
  const { id } = (await upload.json()) as any;
  const own = await request(base + "/media/" + id, user);
  expect(own.status).toBe(200);
  expect(own.headers.get("Content-Type")).toBe("image/jpeg");
  expect((await own.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await request(base + "/media/" + id, other)).status).toBe(404);
  expect((await request(base + "/media/" + id, other, "DELETE")).status).toBe(
    404,
  );
  expect(
    (
      await request(
        base + "/accounts/profile/media",
        other,
        "POST",
        fixture(),
        true,
      )
    ).status,
  ).toBe(404);
});
it("recopying a batch keeps one history entry, with immutable reference snapshots and expiring scoped links", async () => {
  const { user, other, base } = await setup();
  const upload = await request(
    base + "/accounts/profile/media",
    user,
    "POST",
    fixture(),
    true,
  );
  const media = (await upload.json()) as any;
  const input = {
    accountId: "profile",
    lines: [{ kind: "free", count: 5, url: "" }],
  };
  const first = await request(base + "/batches", user, "POST", input);
  expect(first.status).toBe(200);
  const { batch } = (await first.json()) as any;
  const second = (await (
    await request(base + "/batches", user, "POST", input)
  ).json()) as any;
  expect(second.batch.id).toBe(batch.id);
  await request(base + `/batches/${batch.id}/copy`, user, "POST", {});
  await request(base + `/batches/${batch.id}/copy`, user, "POST", {});
  const list = (await (await request(base + "/batches", user)).json()) as any;
  expect(list.batches).toHaveLength(1);
  expect(list.batches[0].copies).toBe(2);
  expect((await request(base + `/batches/${batch.id}`, other)).status).toBe(
    404,
  );
  const link = batch.prompt.match(
    /http:\/\/localhost:8788\/api\/reference\/[^\s]+/,
  )?.[0];
  expect(link).toBeTruthy();
  expect((await app.request(link, {}, env)).status).toBe(200);
  await request(base + "/media/" + media.id, user, "DELETE");
  expect((await app.request(link, {}, env)).status).toBe(200);
  const changed = (await (
    await request(base + "/batches", user, "POST", input)
  ).json()) as any;
  expect(changed.batch.id).not.toBe(batch.id);
  const wrong = link.slice(0, link.lastIndexOf("/") + 1) + "wrong-reference";
  expect((await app.request(wrong, {}, env)).status).toBe(404);
  await env.DB.prepare("UPDATE batches SET capability_expires=1 WHERE id=?")
    .bind(batch.id)
    .run();
  expect((await app.request(link, {}, env)).status).toBe(404);
});
it("rejects bad image content and batches before a Sheet exists", async () => {
  const { user, base, automation } = await setup();
  expect(
    (
      await request(
        base + "/accounts/profile/media",
        user,
        "POST",
        new Uint8Array([1, 2, 3]),
        true,
      )
    ).status,
  ).toBe(400);
  await env.DB.prepare("UPDATE automations SET sheet_url=NULL WHERE id=?")
    .bind(automation.id)
    .run();
  expect(
    (
      await request(base + "/batches", user, "POST", {
        accountId: "profile",
        lines: [{ kind: "free", count: 5 }],
      })
    ).status,
  ).toBe(409);
});
it("revokes reference links immediately when the owner is blocked", async () => {
  const { user, base } = await setup();
  await request(
    base + "/accounts/profile/media",
    user,
    "POST",
    fixture(),
    true,
  );
  const { batch } = (await (
    await request(base + "/batches", user, "POST", {
      accountId: "profile",
      lines: [{ kind: "free", count: 5 }],
    })
  ).json()) as any;
  const link = batch.prompt.match(
    /http:\/\/localhost:8788\/api\/reference\/[^\s]+/,
  )[0];
  await env.DB.prepare("UPDATE users SET status='blocked' WHERE id=?")
    .bind(user.user.id)
    .run();
  expect((await app.request(link, {}, env)).status).toBe(404);
});
it("restores a saved picture style without changing an earlier batch snapshot", async () => {
  const { user, other, base } = await setup();
  const media = (await (
    await request(
      base + "/accounts/profile/media",
      user,
      "POST",
      fixture(),
      true,
    )
  ).json()) as any;
  const styles = (await (
    await request(base + "/accounts/profile/styles", user)
  ).json()) as any;
  expect(styles.styles[0].count).toBe(1);
  const { batch } = (await (
    await request(base + "/batches", user, "POST", {
      accountId: "profile",
      lines: [{ kind: "free", count: 5 }],
    })
  ).json()) as any;
  await request(base + "/media/" + media.id, user, "DELETE");
  expect(
    (
      (await (
        await request(base + "/accounts/profile/media", user)
      ).json()) as any
    ).media,
  ).toHaveLength(0);
  expect(
    (
      await request(
        base + `/accounts/profile/styles/${styles.styles[0].id}/restore`,
        other,
        "POST",
        {},
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await request(
        base + `/accounts/profile/styles/${styles.styles[0].id}/restore`,
        user,
        "POST",
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (
      (await (
        await request(base + "/accounts/profile/media", user)
      ).json()) as any
    ).media,
  ).toHaveLength(1);
  const restored = (await (
    await request(base + "/batches", user, "POST", {
      accountId: "profile",
      lines: [{ kind: "free", count: 5 }],
    })
  ).json()) as any;
  expect(restored.batch.id).toBe(batch.id);
  expect(restored.batch.styleVersion).toBeTruthy();
  const similar = (await (
    await request(base + "/batches", user, "POST", {
      accountId: "profile",
      variant: crypto.randomUUID(),
      lines: [{ kind: "free", count: 5 }],
    })
  ).json()) as any;
  expect(similar.batch.id).not.toBe(batch.id);
});
it("requires evidence for page offers instead of assuming every crochet pattern is free", async () => {
  const { user, base } = await setup();
  const { batch } = (await (
    await request(base + "/batches", user, "POST", {
      accountId: "profile",
      lines: [
        { kind: "link", count: 1, url: "https://example.com/paid-pattern" },
      ],
    })
  ).json()) as any;
  expect(batch.prompt).toContain(
    "Say FREE only after verifying the offer is free",
  );
  expect(batch.prompt).not.toContain("the patterns are free, so it is true");
  expect(batch.prompt).toContain("Cite research sources with dates");
  expect(batch.prompt).not.toContain("saved reference images below");
  expect(batch.prompt).not.toContain("Tap to download the free PDF pattern.");
  expect(batch.prompt).not.toContain("Find the free PDF pattern");
  expect(batch.prompt).toContain("Use 1 different format across this batch");
});

it("builds one immutable mixed request with correct individual and category destinations",async()=>{
  const {user,base}=await setup();
  const sources=[
    {kind:"free",count:5},
    {kind:"product",url:"https://shop.example.com/bag",count:5},
    {kind:"category",url:"https://shop.example.com/summer",products:["one","two","three"].map(x=>({url:`https://shop.example.com/${x}`,title:x})),perProduct:4,categoryCount:3}
  ];
  const input={accountId:"profile",notes:"Warm backgrounds",sources};
  const first=await request(base+"/batches",user,"POST",input);
  expect(first.status).toBe(200);
  const {batch}=await first.json() as any;
  expect(batch.total).toBe(25);
  expect(batch.input.destinations.map((d:any)=>d.count)).toEqual([5,5,4,4,4,3]);
  expect(batch.input.destinations[2].url).toBe("https://shop.example.com/one");
  expect(batch.input.destinations[5].url).toBe("https://shop.example.com/summer");
  expect(batch.prompt).toContain("set that pin's Status to Ready in the same run without asking for approval");
  expect(batch.prompt).toContain("Warm backgrounds");
  for (const requirement of [
    "https://www.pinterest.com/testprofile/",
    "Pinterest Trends", "Google Trends", "Public search rank", 
    "30–60 days", "236 px", "exact product", "Do not overwrite a mismatching existing ID",
    "Cite research sources with dates", "queued, Draft, Ready, posted and skipped",
    "do not reuse one product picture across different templates",
    "believable on-body fashion mockups", "Small crochet color variations are allowed",
    "Keep the exact artwork, words, proportions and colors", "genuine screenshots",
  ]) expect(batch.prompt.toLowerCase()).toContain(requirement.toLowerCase());
  expect(batch.prompt).not.toContain("Keep new Sheet rows as Draft for review");

  const again=await (await request(base+"/batches",user,"POST",input)).json() as any;
  expect(again.batch.id).toBe(batch.id);
  const explicitManual=await (await request(base+"/batches",user,"POST",{...input,sources:sources.map(s=>s.kind === "category" ? {...s,selection:"manual"} : s)})).json() as any;
  expect(explicitManual.batch.id).toBe(batch.id);
  const changed=await (await request(base+"/batches",user,"POST",{...input,notes:"Bold headlines"})).json() as any;
  expect(changed.batch.id).not.toBe(batch.id);
  const old=await (await request(base+`/batches/${batch.id}`,user)).json() as any;
  expect(old.batch.prompt).toContain("Warm backgrounds");
  await env.DB.prepare("UPDATE batches SET prompt=? WHERE id=?")
    .bind("Create 25 original Pinterest pins. Old short instructions.",batch.id).run();
  const refreshed = await (await request(base+`/batches/${batch.id}`,user)).json() as any;
  expect(refreshed.batch.id).toBe(batch.id);
  expect(refreshed.batch.prompt).toContain("PINTEREST — RESEARCH, PLAN AND CREATE");
  expect(refreshed.batch.prompt).toContain("Warm backgrounds");
});

it("supports large resumable requests and rejects fractional, unsafe and empty amounts",async()=>{
  const {user,base}=await setup();
  const good=await (await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"free",count:5000}]})).json() as any;
  expect(good.batch.total).toBe(5000);
  expect(good.batch.prompt).toContain("resumable parts of at most 25");
  for(const count of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])
    expect((await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"free",count}]})).status).toBe(400);
  expect((await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"catalog",selection:"manual",url:"https://store.example.com"}]})).status).toBe(400);
  for(const url of ["http://example.com","https://127.0.0.1/","https://user:password@example.com/","https://example.com:8443/"])
    expect((await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"product",url}]})).status).toBe(400);
});

it("delivers a 64-pin mixed-product rotation rather than eight product blocks",async()=>{
 const {user,base}=await setup();
 const sources=[{kind:"category",url:"https://shop.example.com/flowers",products:Array.from({length:8},(_,i)=>({url:`https://shop.example.com/product-${i+1}`,title:`Product ${i+1}`})),perProduct:8,categoryCount:0}];
 const result=await request(base+"/batches",user,"POST",{accountId:"profile",sources});
 expect(result.status).toBe(200);const {batch}=await result.json() as any;
 expect(batch.total).toBe(64);
 expect(batch.postingOrder.map((p:any)=>p.group)).toEqual(Array.from({length:25},(_,i)=>i%8+1));
 expect(batch.postingOrder[24]).toMatchObject({sequence:25,group:1,groupPin:4});
 expect(batch.prompt).toContain("FREE CROCHET PATTERN");
 expect(batch.prompt).toContain("free shipping");
 expect(batch.prompt).toContain("positive minimum is paid");
 expect(batch.prompt).toContain("Continue the same rotation across 25-pin part boundaries");
 expect(batch.prompt).toContain("Generate, upload and append rows in this mixed order, then verify and set passing rows Ready automatically");
});

it("adapts no-link animal and food requests without requiring products or an offer",async()=>{
 const {user,base,automation}=await setup();
 const saved=await env.DB.prepare("SELECT config FROM automations WHERE id=?").bind(automation.id).first<any>();
 const config=JSON.parse(saved.config);
 for(const [category,niche] of [["other","wild animals and nature"],["food","Moroccan family recipes"]]){
  config.accounts[0].category=category;config.accounts[0].niche=niche;
  await env.DB.prepare("UPDATE automations SET config=? WHERE id=?").bind(JSON.stringify(config),automation.id).run();
  const response=await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"free",count:4}]});
  expect(response.status).toBe(200);const {batch}=await response.json() as any;
  expect(batch.prompt).toContain(`Niche: ${niche}`);
  expect(batch.prompt).toContain("CONTENT WITHOUT DESTINATION LINKS");
  expect(batch.input.destinations).toEqual([{kind:"no link",count:4,url:""}]);
  expect(batch.postingOrder.every((p:any)=>p.url==="")).toBe(true);
 }
});

it("accepts a whole shop URL without product selection and does not invent final product links",async()=>{
 const {user,base}=await setup();
 for(const url of ["https://www.etsy.com/shop/ExampleCreator","https://examplecreator.gumroad.com/","https://shop.example.com/patterns/"]){
  const response=await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"catalog",url,count:12}]});
  expect(response.status).toBe(200);const {batch}=await response.json() as any;
  expect(batch.total).toBe(12);expect(batch.selectionPending).toBe(true);expect(batch.postingOrder).toEqual([]);
  expect(batch.input.destinations).toEqual([{kind:"research-selected products",count:12,url,auto:true,scope:"catalog",title:"Choose products during research"}]);
  expect(batch.prompt).toContain("not final pin destinations");
  expect(batch.prompt).toContain("Reuse that resolved plan on resume");
  expect(batch.prompt).toContain("recent listings");
  expect(batch.prompt).toContain("reuse verified facts");
 }
});
it("keeps selected product counts and category overviews when mixing them with research-selected products",async()=>{
 const {user,base}=await setup();
 const response=await request(base+"/batches",user,"POST",{accountId:"profile",sources:[{kind:"product",url:"https://shop.example.com/exact",count:8},{kind:"category",selection:"auto",url:"https://shop.example.com/flowers",count:12,categoryCount:2,products:[{url:"not a product URL",title:"stale hidden selection"}]}]});
 expect(response.status).toBe(200);const {batch}=await response.json() as any;
 expect(batch.total).toBe(22);expect(batch.input.destinations.map((d:any)=>d.count)).toEqual([8,12,2]);
 expect(batch.input.destinations[0]).toMatchObject({kind:"exact product",url:"https://shop.example.com/exact"});
 expect(batch.input.destinations[1]).toMatchObject({auto:true,scope:"category"});
 expect(batch.input.destinations[2]).toMatchObject({kind:"category overview",url:"https://shop.example.com/flowers"});
 expect(batch.input.sources[1].products).toEqual([]);expect(batch.selectionPending).toBe(true);
});
it("keeps a standard mixed-product prompt within a compact instruction budget",async()=>{
 const {user,base}=await setup();
 const sources=[{kind:"category",url:"https://shop.example.com/flowers",products:Array.from({length:8},(_,i)=>({url:`https://shop.example.com/product-${i+1}`,title:`Product ${i+1}`})),perProduct:8}];
 const {batch}=await(await request(base+"/batches",user,"POST",{accountId:"profile",sources})).json() as any;
 expect(batch.prompt.length).toBeLessThan(16000);
 expect(batch.prompt).toContain("read only needed");
});


it("delivers access-first automatic Ready instructions for both prompt formats and refreshes older Draft requests", async () => {
  const { user, base } = await setup();
  for (const input of [
    { accountId: "profile", lines: [{ kind: "free", count: 2 }] },
    { accountId: "profile", sources: [{ kind: "catalog", url: "https://shop.example.com/patterns/", count: 2 }] },
  ]) {
    const response = await request(base + "/batches", user, "POST", input);
    expect(response.status).toBe(200);
    const { batch } = await response.json() as any;
    const check = (prompt: string) => {
      for (const requirement of [
        "Pin ID is an internal queue key", "the engine fills it if blank", "Never invent a Pinterest Pin ID",
        "Before research or image generation", "Google Drive and Google Sheets are connected in this creation session",
        "Website sign-in and an Activepieces Google connection do not prove this session has access",
        "Confirm Sheet edit and folder upload permissions", "stop before generation",
        "Stage new rows as Draft only while verifying", "set that pin's Status to Ready in the same run without asking for approval",
        "Count it as Ready only when the read-back confirms Ready", "never reset it to Ready", "Leave any incomplete or failed pin Draft",
        "never bulk-promote unrelated old Drafts", "Do not call Pinterest publishing or Run now",
        "Work through all parts in one run without asking for approval",
      ]) expect(prompt).toContain(requirement);
      expect(prompt).toContain("bot@example.test");
      expect(prompt).toContain("https://docs.google.com/spreadsheets/d/testsheet/edit");
      expect(prompt).not.toContain("Keep new Sheet rows as Draft for review");
      expect(prompt).not.toContain("never set Ready");
      expect(prompt.indexOf("1. Access first")).toBeLessThan(prompt.indexOf("6. Create and inspect"));
    };
    check(batch.prompt);
    await env.DB.prepare("UPDATE batches SET prompt=? WHERE id=?")
      .bind("Workflow revision: 2026-10-21.7\nKeep new Sheet rows as Draft for review", batch.id).run();
    const refreshed = await (await request(base + `/batches/${batch.id}`, user)).json() as any;
    expect(refreshed.batch.id).toBe(batch.id);
    expect(refreshed.batch.total).toBe(2);
    check(refreshed.batch.prompt);
  }
});

it("saves a temporary batch schedule repeat-safely without replacing account defaults", async () => {
  const { user, automation, base } = await setup();
  const postingSchedule = {
    pinsPerDay: 6,
    schedule: {
      mode: "varied",
      start: "09:00",
      end: "21:00",
      spacingMode: "auto",
      minSpacing: 100,
      times: [],
    },
  };
  const body = {
    accountId: "profile",
    sources: [{ kind: "free", count: 12 }],
    postingSchedule,
  };
  const response = await request(base + "/batches", user, "POST", body);
  expect(response.status).toBe(200);
  const data: any = await response.json();
  expect(data.needsScheduleUpdate).toBe(true);
  expect(data.batch.input.postingSchedule).toMatchObject({
    pinsPerDay: 6,
    schedule: { mode: "varied" },
  });
  expect(data.batch.prompt).toContain(
    `Set the Sheet Batch column to exactly this ID`,
  );
  expect(data.batch.prompt).toContain("This batch only");
  expect(data.batch.prompt).toContain('Product pins must have the verified individual product URL in Link');
  expect(data.batch.prompt).toContain('Every verified free linked product or resource needs an obvious FREE');
  expect(data.batch.prompt).toContain('Omit prices by default');
  expect(data.batch.prompt).toContain('Visit site, View pattern or Explore collection');
  const again: any = await (
    await request(base + "/batches", user, "POST", body)
  ).json();
  expect(again.batch.id).toBe(data.batch.id);
  const saved: any = await env.DB.prepare(
    "SELECT * FROM batch_schedules WHERE automation_id=?",
  )
    .bind(automation.id)
    .first();
  expect(saved.pins_per_day).toBe(6);
  const config: any = await env.DB.prepare(
    "SELECT config FROM automations WHERE id=?",
  )
    .bind(automation.id)
    .first();
  expect(JSON.parse(config.config).accounts[0].pinsPerDay).toBe(5);
  expect(
    (
      await request(base + "/batches", user, "POST", {
        ...body,
        postingSchedule: { ...postingSchedule, pinsPerDay: 0 },
      })
    ).status,
  ).toBe(400);
});
