import {env} from "cloudflare:test";
import {expect,it,vi,afterEach} from "vitest";
import app from "../server/app";
import {parseCatalog} from "../server/catalog";
afterEach(()=>vi.restoreAllMocks());
const origin="http://localhost:8788",source="https://store.example.com/patterns/category/flowers/";
const card=(slug:string,title=slug)=>`<a class="card rise" href="/patterns/${slug}/"><picture><img src="/${slug}.jpg"></picture><h3>${title}</h3><span>Flowers</span></a>`;
const page=(cards:string,next="",count=3)=>`<html><head>${next?`<link rel="next" href="${next}">`:""}</head><body><header><a href="/privacy/">Privacy</a></header><main><nav><a class="card" href="/patterns/unrelated/"><img><h3>Wrong category</h3></a></nav><div class="bar"><p class="count">${count} patterns</p></div><div class="grid">${cards}</div><footer><a href="/terms/">Terms</a></footer></main><footer><a href="/contact/">Contact</a></footer></body></html>`;
async function setup(){
 const login=await app.request(origin+"/auth/dev",{method:"POST",headers:{Origin:origin},body:JSON.stringify({account:"member-a"})},env),cookie=login.headers.get("Set-Cookie")!.split(";")[0];
 const me=await(await app.request(origin+"/api/me",{headers:{Cookie:cookie}},env)).json() as any;
 const request=(path:string,body:any)=>app.request(origin+path,{method:"POST",headers:{Cookie:cookie,Origin:origin,"X-CSRF-Token":me.csrf,"Content-Type":"application/json"},body:JSON.stringify(body)},env);
 const {automation}=await(await request("/api/automations",{name:"Catalog"})).json() as any;
 return(body:any)=>request(`/api/automations/${automation.id}/catalog`,body);
}
it("returns product cards only, excluding privacy, navigation, category chips and breadcrumbs",()=>{
 const html=page(card("rose","Red Rose")+'<a href="/patterns/category/bags/">Bags</a><a href="/privacy-policy/">Privacy</a>')+'<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"item":"https://store.example.com/privacy/"}]}</script>';
 const parsed=parseCatalog(html,source);expect(parsed.products).toEqual([{url:"https://store.example.com/patterns/rose/",title:"Red Rose"}]);
 expect(parsed.expected).toBe(3);
});
it("reads every page of the selected category and keeps each individual product destination",async()=>{
 const scan=await setup(),seen:string[]=[];
 vi.spyOn(globalThis,"fetch").mockImplementation(async input=>{
  const url=String(input);seen.push(url);
  return new Response(url===source?page(card("rose")+card("daisy"),"/patterns/category/flowers/page/2/"):page(card("tulip")),{headers:{"Content-Type":"text/html"}});
 });
 const result=await scan({url:source,kind:"category"});expect(result.status).toBe(200);
 const body=await result.json() as any;expect(body.products.map((p:any)=>p.url)).toEqual(["rose","daisy","tulip"].map(s=>`https://store.example.com/patterns/${s}/`));expect(body.complete).toBe(true);expect(body.pagesRead).toBe(2);expect(seen).toHaveLength(2);
});
it("reports partial pagination instead of claiming missing products do not exist",async()=>{
 const scan=await setup();vi.spyOn(globalThis,"fetch").mockImplementation(async input=>String(input)===source?new Response(page(card("rose"),"/patterns/category/flowers/page/2/"),{headers:{"Content-Type":"text/html"}}):new Response("Unavailable",{status:503}));
 const body=await(await scan({url:source,kind:"category"})).json() as any;expect(body.complete).toBe(false);expect(body.products).toHaveLength(1);expect(body.expected).toBe(3);
});
it("does not offer generic body links when there is no verifiable product listing",async()=>{
 const scan=await setup();vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response('<main><a href="/privacy/">Privacy</a><a href="/about/">About</a></main>',{headers:{"Content-Type":"text/html"}}));
 expect((await scan({url:source})).status).toBe(409);
});
