async function websiteRequest(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('The website could not confirm this action. No unconfirmed publish should be retried.');
  return response.json();
}
async function applyWebsiteCommands(gTok, sheetId, config, commands) {
  const results = [];
  for (const cmd of commands || []) {
    try {
      const a = config.accounts.find(a => a.websiteId === cmd.account_id);
      if (!a) throw new Error('Account changed; refresh the queue.');
      const [accounts] = await sheets.batchGet(gTok, sheetId, [`${quoteTab(TABS.accounts)}!A1:Z200`]);
      const ah = headerMap(accounts[0], ACCOUNT_COLUMNS), ar = accounts.slice(1).find(r => cellText(r[ah.idx('Account')]) === a.name);
      if (!ar) throw new Error('Account row missing.');
      const tab = cellText(ar[ah.idx('Pins tab')]) || `${PINS_TAB_PREFIX}${a.name}`;
      const [pins] = await sheets.batchGet(gTok, sheetId, [`${quoteTab(tab)}!A1:AZ10001`]);
      const h = headerMap(pins[0], PIN_COLUMNS), matches = pins.slice(1).map((r,i)=>({r,n:i+2})).filter(x=>cellText(x.r[h.idx('Pin ID')])===cmd.pin_id);
      if (matches.length !== 1) throw new Error('Pin missing or duplicate identity; refresh the queue.');
      const {r,n} = matches[0];
      const fields = {status:'Status',title:'Title',description:'Description',link:'Link',media:'Media',board:'Board'};
      if (['done','posting'].includes(cellText(r[h.idx('Status')]).toLowerCase()) || cellText(r[h.idx('Pin URL')])) throw new Error('This pin is published or publishing.');
      for (const [key,col] of Object.entries(fields)) if (cellText(r[h.idx(col)]) !== cmd.expected[key]) throw new Error('This pin changed in the Sheet. Refresh before editing again.');
      const writes = [];
      for (const [key,value] of Object.entries(cmd.patch)) {
        const col = fields[key];
        if (!col || h.idx(col) === undefined) throw new Error('Unsupported change.');
        writes.push({range:`${quoteTab(tab)}!${colLetter(h.idx(col))}${n}`,values:[[value]]});
      }
      await sheets.write(gTok,sheetId,writes);
      results.push({id:cmd.id,ok:true,detail:'Applied to the Sheet'});
    } catch(e) { results.push({id:cmd.id,ok:false,detail:String(e.message).slice(0,300)}); }
  }
  return results;
}
async function websiteSnapshot(inputs) {
  const config = typeof inputs.config === 'string' ? JSON.parse(inputs.config) : inputs.config;
  const base = config.settings?.website;
  if (!base) return {synced:false};
  const gTok = tokenOf(inputs.google), match = String(inputs.spreadsheet || '').match(/\/spreadsheets\/d\/([\w-]+)\/edit$/);
  if (!gTok || !match) throw new Error('Queue sync needs the confirmed Google Sheet.');
  const sheetId = match[1];
  const [accounts] = await sheets.batchGet(gTok,sheetId,[`${quoteTab(TABS.accounts)}!A1:Z200`]);
  const ah = headerMap(accounts[0],ACCOUNT_COLUMNS), snapshots = [];
  const [products] = await sheets.batchGet(gTok,sheetId,[`${quoteTab(TABS.products)}!A1:H5000`]);
  const ph = headerMap(products[0],PRODUCT_COLUMNS), productStates=new Map();
  for(const p of products.slice(1)) productStates.set(`${normalizeName(cellText(p[ph.idx('Account')]))}|${normalizeName(cellText(p[ph.idx('Product')]))}`,normalizeName(cellText(p[ph.idx('Status')])));
  for (const a of config.accounts) {
    const row = accounts.slice(1).find(r=>cellText(r[ah.idx('Account')])===a.name);
    if(!row)continue;
    const tab = cellText(row[ah.idx('Pins tab')]) || `${PINS_TAB_PREFIX}${a.name}`;
    const [rows] = await sheets.batchGet(gTok,sheetId,[`${quoteTab(tab)}!A1:AZ10001`]);
    const h=headerMap(rows[0],PIN_COLUMNS),counts={},pins=[];
    let complete=rows.length<10001;
    for (let index=1; index<rows.length; index++) {
      const r=rows[index];
      if (!r.some(v=>cellText(v))) continue;
      const get=(col)=>h.idx(col)===undefined?'':cellText(r[h.idx(col)]);
      const status=Object.values(STATUS).find(s=>s.toLowerCase()===get('Status').toLowerCase())||'Unknown';
      counts[status]=(counts[status]||0)+1;
      const pinId=get('Pin ID');if(!pinId){complete=false;continue;}
      const productState=get('Product')?productStates.get(`${normalizeName(a.name)}|${normalizeName(get('Product'))}`):'';
      pins.push({rowNumber:index+1,publishAfter:cellToLocalStamp(r[h.idx('Publish after')]),productPaused:productState==='paused' ,id:pinId.slice(0,100),status,title:get('Title').slice(0,500),description:get('Description').slice(0,3000),link:get('Link').slice(0,2048),media:get('Media').slice(0,2000),board:get('Board').slice(0,300),batch:get('Batch').slice(0,100),pinUrl:get('Pin URL').slice(0,300),postedAt:get('Posted at').slice(0,100),error:get('Error').slice(0,1000)});
    }
    // Read all counted rows; only the first 500 are sent as previews. Counts carry completeness separately.
    const priority=p=>p.status==='Ready'?0:['Error','Needs review','Draft','Posting'].includes(p.status)?1:2;
    pins.sort((a,b)=>priority(a)-priority(b)||a.rowNumber-b.rowNumber);
    const data={name:a.name,counts,complete,health:cellText(row[ah.idx('Health')]).slice(0,300),lastRun:cellText(row[ah.idx('Last run')]).slice(0,100),lastPost:cellText(row[ah.idx('Last post')]).slice(0,100),pins:pins.slice(0,500)};
    await websiteRequest(base,'/snapshot',{accounts:[data],commands:snapshots.length?[]:(inputs.commands||[])});
    snapshots.push(data);
  }
  if(!snapshots.length) await websiteRequest(base,'/snapshot',{accounts:[],commands:inputs.commands||[]});
  for(const job of inputs.jobs||[]){
    await websiteRequest(base,'/finish',{id:job.id,token:job.token,outcome:job.name==='_sync'?'queue synced':'run finished without publication'});
  }
  return {synced:true,accounts:snapshots.length};
}
