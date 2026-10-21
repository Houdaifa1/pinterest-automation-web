import { expect, it } from "vitest";
import { pinOrder } from "../server/pin-order";
const product = (name:string,count:number)=>({kind:"exact product",title:name,url:`https://shop.example.com/${name}`,count});
it("rotates eight products across all 64 slots and resumes at a part boundary",()=>{
  const products=Array.from({length:8},(_,i)=>product(String.fromCharCode(65+i),8));
  const all=pinOrder(products,0,100);
  expect(all).toHaveLength(64);
  expect(all.map(p=>p.title)).toEqual(Array.from({length:8},()=>["A","B","C","D","E","F","G","H"]).flat());
  expect(all.map(p=>p.sequence)).toEqual(Array.from({length:64},(_,i)=>i+1));
  expect(pinOrder(products,25,25)).toEqual(all.slice(25,50));
  for(let i=1;i<all.length;i++) expect(all[i].url).not.toBe(all[i-1].url);
});
it("keeps exact unequal allocations and separates no-link and category overview slots",()=>{
 const inputs=[product("A",3),product("B",1),{kind:"no link",count:2,url:""},{kind:"category overview",count:2,url:"https://shop.example.com/category"}];
 const all=pinOrder(inputs,0,100);
 expect(all.map(x=>x.group)).toEqual([1,2,3,4,1,3,4,1]);
 for(let i=0;i<inputs.length;i++)expect(all.filter(x=>x.group===i+1)).toHaveLength(inputs[i].count);
 expect(pinOrder(inputs,all.length)).toEqual([]);
});
it("combines repeated product destinations while preserving their original group counts",()=>{
 const inputs=[product("A",2),product("A",2),product("B",4)];
 const all=pinOrder(inputs,0,100);
 expect(all.map(x=>x.title)).toEqual(["A","B","A","B","A","B","A","B"]);
 expect(all.filter(x=>x.title==="A").map(x=>[x.group,x.groupPin])).toEqual([[1,1],[1,2],[2,1],[2,2]]);
});
it("pages near the supported count limit without expanding preceding pins",()=>{
 const count=4_000_000_000_000_000,inputs=[product("A",count),product("B",count)];
 const tail=pinOrder(inputs,count*2-4,25);
 expect(tail.map(x=>x.title)).toEqual(["A","B","A","B"]);
 expect(tail[3].sequence).toBe(count*2);
 expect(tail[3].productPin).toBe(count);
 expect(()=>pinOrder(inputs,-1)).toThrow();
});
