import type { Destination } from "./batch-plan";

export type OrderedPin = {
  sequence: number;
  group: number;
  groupPin: number;
  productPin: number;
  title: string;
  url: string;
};

// Read a bounded page of the rotation without expanding the whole request.
export function pinOrder(destinations: Destination[], offset = 0, limit = 25): OrderedPin[] {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid order preview range.");
  const buckets: {key:string;count:number;groups:{index:number;count:number;title:string;url:string}[]}[] = [];
  const byKey = new Map<string, (typeof buckets)[number]>();
  let total = 0;
  for (const [index,d] of destinations.entries()) {
    if (!Number.isSafeInteger(d.count) || d.count < 1) throw new Error("Invalid pin allocation.");
    total += d.count;
    if (!Number.isSafeInteger(total)) throw new Error("Invalid pin total.");
    const key = d.url || "no-link";
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {key,count:0,groups:[]};
      byKey.set(key,bucket); buckets.push(bucket);
    }
    bucket.count += d.count;
    bucket.groups.push({index,count:d.count,title:d.title || d.url || "No-link idea",url:d.url});
  }
  if (offset >= total) return [];
  const through = (round:number) => buckets.reduce((sum,b)=>sum+Math.min(round,b.count),0);
  let low = 0, high = buckets.reduce((n,b)=>Math.max(n,b.count),0);
  while (low < high) {
    const mid = low + Math.ceil((high-low)/2);
    if (through(mid) <= offset) low=mid; else high=mid-1;
  }
  let round = low, skip = offset-through(round);
  const result:OrderedPin[] = [];
  while (result.length < limit && offset+result.length < total) {
    for (const bucket of buckets) {
      if (bucket.count <= round) continue;
      if (skip) { skip--; continue; }
      let local = round;
      for (const group of bucket.groups) {
        if (local >= group.count) { local-=group.count; continue; }
        result.push({sequence:offset+result.length+1,group:group.index+1,groupPin:local+1,productPin:round+1,title:group.title,url:group.url});
        break;
      }
      if (result.length === limit || offset+result.length === total) break;
    }
    round++;
  }
  return result;
}
export function orderInstructions(destinations: Destination[]) {
  const preview = pinOrder(destinations);
  return `POSTING ORDER — ROTATE PRODUCTS, NEVER GROUP THEM INTO BLOCKS
The destination list gives allocations, not posting order. Treat the same exact destination URL as one product even if it occurs in several source groups. All no-link allocations share one rotation slot. Rotate one pin per distinct product/destination in first-appearance order, then repeat the rotation with a genuinely new scene for each product. Skip exhausted allocations. Within a repeated destination, fill its source groups in their listed order while retaining each group's exact count. Category overviews get their own rotation slot; vary their featured products, avoiding the immediately adjacent product where possible.
For eight products with eight pins each: A1, B1, C1, D1, E1, F1, G1, H1, A2, B2 ... H8. Never A1 ... A8, then B1 ... B8. When only one requested product remains, a repeated tail can be unavoidable; report it rather than inventing extra products or changing counts.
The first ${preview.length} slots are fixed below (slot | allocation group | pin within that group | destination):
${preview.map(p=>`${p.sequence} | ${p.group} | ${p.groupPin} | ${p.url || "NO LINK"}`).join("\n")}
Continue the same rotation across 25-pin part boundaries; do not restart at product A for each part. Use the global slot in each stable batch Pin ID. Generate, upload and append Draft rows in this mixed order. Do not sort saved rows by product afterward, move existing rows, or change Publish after to defeat the order. Read back the new rows in Sheet order and compare them to this sequence. The posting engine takes eligible Ready rows in Sheet order; earlier queued content, review status or future Publish after values can delay a slot. Do not claim a changed live posting order until the actual saved queue has been checked.`;
}
