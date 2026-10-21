import {env} from "cloudflare:test";
import {expect,it,vi,afterEach} from "vitest";
import app from "../server/app";
import {parseCatalog} from "../server/catalog";
afterEach(()=>vi.restoreAllMocks());
const origin="http://localhost:8788",source="https://store.example.com/patterns/category/flowers/";
const card=(slug:string,title=slug)=>`<a class="card rise" href="/patterns/${slug}/"><picture><img src="/${slug}.jpg"></picture><h3>${title}</h3><span>Flowers</span></a>`;
const page=(cards:string,next="",count=3)=>`<html><head></head><body><header><a href="/privacy/">Privacy</a></header><main><nav><a class="card" href="/patterns/unrelated/"><img><h3>Wrong category</h3></a></nav><div class="bar"><p class="count">${count} patterns</p></div><div class="grid">${cards}</div>${next?`<nav class="pager" aria-label="Pages"><a href="${next}" rel="next">Next</a></nav>`:""}<footer><a href="/terms/">Terms</a></footer></main><footer><a href="/contact/">Contact</a></footer></body></html>`;
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

it("excludes recommendations and unrelated structured products from a category listing",()=>{
 const html=page(card("rose"))+`<script type="application/ld+json">{"@type":"ItemList","url":"https://store.example.com/all-products/","itemListElement":[{"item":{"url":"https://store.example.com/patterns/bag/","name":"Unrelated bag"}}]}</script>`;
 const withRelated=html.replace('</main>','<section class="related-products"><div><a class="card" href="/patterns/cardigan/"><img><h3>Cardigan</h3></a></div></section></main>');
 expect(parseCatalog(withRelated,source).products.map(p=>p.title)).toEqual(["rose"]);
});
it("prefers visible product cards over unrelated global structured lists",()=>{
 const html=page(card("rose"))+`<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"url":"https://store.example.com/patterns/bag/","name":"Unrelated bag"}}]}</script>`;
 expect(parseCatalog(html,source).products.map(p=>p.title)).toEqual(["rose"]);
});
it("does not follow a Next link into another category selected by query filter",async()=>{
 const scan=await setup(),url="https://store.example.com/shop/?category=flowers",seen:string[]=[];
 vi.spyOn(globalThis,"fetch").mockImplementation(async input=>{seen.push(String(input));return new Response(page(card("rose"),"/shop/?category=bags&page=2",2),{headers:{"Content-Type":"text/html"}})});
 const body=await(await scan({url,kind:"category"})).json() as any;
 expect(seen).toEqual([url]);expect(body.products).toHaveLength(1);expect(body.complete).toBe(false);
});
it("rejects a category redirected to an unrelated whole-store page",async()=>{
 const scan=await setup();
 vi.spyOn(globalThis,"fetch").mockImplementation(async input=>String(input)===source?new Response(null,{status:301,headers:{Location:"/patterns/"}}):new Response(page(card("bag")),{headers:{"Content-Type":"text/html"}}));
 const response=await scan({url:source,kind:"category"});expect(response.status).toBe(409);
 expect((await response.json() as any).error).toBe("category_redirect");
});

it("follows query pagination only when it retains the selected category",async()=>{
 const scan=await setup(),url="https://store.example.com/shop/?category=flowers";
 vi.spyOn(globalThis,"fetch").mockImplementation(async input=>new Response(String(input)===url?page(card("rose"),"/shop/?category=flowers&page=2",2):page(card("tulip"),"",2),{headers:{"Content-Type":"text/html"}}));
 const body=await(await scan({url,kind:"category"})).json() as any;
 expect(body.products.map((p:any)=>p.title)).toEqual(["rose","tulip"]);expect(body.complete).toBe(true);
});
it("does not claim a full inventory when the listing exposes no total",async()=>{
 const scan=await setup();
 vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(`<main>${card("rose")}</main>`,{headers:{"Content-Type":"text/html"}}));
 const body=await(await scan({url:source,kind:"category"})).json() as any;
 expect(body.products).toHaveLength(1);expect(body.complete).toBe(false);expect(body.expected).toBeNull();
});
