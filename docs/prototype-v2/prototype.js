'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const uid = prefix => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const storageKey = 'automation-black-prototype-v2';
const day = 86400000;
const today = new Date(); today.setHours(0, 0, 0, 0);
const sampleSlots = [558, 726, 942, 1097, 1265];
const products = [
  {id:'fox',title:'Woodland fox pattern',slug:'woodland-fox',cover:'FOX',angle:'A handmade woodland gift'},
  {id:'basket',title:'Everyday crochet basket',slug:'crochet-basket',cover:'COZY',angle:'A useful small-space project'},
  {id:'leaves',title:'Autumn leaf garland',slug:'autumn-leaf-garland',cover:'FALL',angle:'Seasonal decoration'},
  {id:'rabbit',title:'Little rabbit pattern',slug:'little-rabbit',cover:'SOFT',angle:'A new take on a familiar pattern'},
  {id:'planner',title:'Printable project planner',slug:'project-planner',cover:'PLAN',angle:'A practical way to organize projects'}
];
const button = (label, action, extra = '', kind = '') => `<button class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const link = (label, route, kind = '') => `<a class="button ${kind}" href="#${route}">${label}</a>`;
const initials = handle => handle==='@stunningcrochet'?'SC':handle.replace(/^@/,'').slice(0,2).toUpperCase();
const cover = (index = 0, compact = false, title = '') => `<div class="cover ${['','alt','third'][index % 3]} ${compact ? 'compact' : ''}" aria-label="Illustrated example pin"><span class="cover-tag">THE HANDMADE EDIT</span><span class="cover-title">${esc(title || (compact ? products[index % products.length].cover : 'Small stitches.\nWoodland charm.')).replace(/\n/g,'<br>')}</span><span class="cover-caption">ILLUSTRATED EXAMPLE</span></div>`;

function fixturePins() {
  return Array.from({length:120}, (_, i) => {
    const p = products[i % products.length];
    const ready = i >= 84;
    const pos = i - 84 + 2;
    const time = ready ? today.getTime() + Math.floor(pos / 5) * day + sampleSlots[pos % 5] * 60000 : i>=82 ? today.getTime()+sampleSlots[i-82]*60000 : today.getTime() - (Math.floor(i / 5) + 1) * day;
    return {id:`pin-${i}`,title:i % 7 === 0 ? 'A neater crochet finish' : p.title,account:'pinterest-1',status:ready?'ready':'published',time,type:i % 7 === 0?'free':'product',url:i % 7 === 0?'':`https://shop.example/products/${p.slug}`,product:p.id,cover:i % 3};
  });
}
function freshState() {
  return {version:2,signedIn:true,connected:true,automations:[{id:'stunning',name:'Stunning Crochet',status:'scheduled',flow:true,accounts:[{id:'pinterest-1',handle:'@stunningcrochet',niche:'Crochet & knitting',daily:5,start:'09:00',end:'22:00',spacing:90,zone:'Africa/Casablanca'}],pins:fixturePins(),email:true,telegram:true,bot:'Saved Telegram bot',removed:false}],batches:[],events:[],removedPins:[],wizard:null,builders:{},scenario:'normal',members:[{id:'owner',name:'You',email:'owner@example.com',status:'Active',owner:true},{id:'friend',name:'Example member',email:'member@example.com',status:'Active'}]};
}
let state;
try { const saved = JSON.parse(localStorage.getItem(storageKey)); state = saved?.version === 2 ? saved : freshState(); } catch { state = freshState(); }
let current = {page:'home',id:null};
let accountDraft = null;
let catalogDraft = null;
let currentBatch = null;
let noticeTimer;
let returnFocus;
let currentMenu = null;
let keyEditing = false;
let queueFilter = 'ready';
let queueLimit = 8;

function dailySlots(ac, date = today) {
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const start=minutes(ac.start),end=minutes(ac.end),n=Number(ac.daily);
  let seed=[...`${ac.id}:${date.toDateString()}:${ac.daily}:${ac.start}:${ac.end}:${ac.spacing}`].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
  const weights=Array.from({length:n+1},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return 1+seed/4294967296;});
  const spare=end-start-(n-1)*ac.spacing,sum=weights.reduce((a,b)=>a+b,0);
  let cursor=start;
  return Array.from({length:n},(_,i)=>{cursor+=weights[i]/sum*spare+(i?ac.spacing:0);return Math.round(cursor);});
}
function plannedTime(ac,index) {
  const offset=Math.floor(index/ac.daily),date=new Date(today.getTime()+offset*day);
  const slots=ac.slots&&offset===0?ac.slots:dailySlots(ac,date);
  return date.getTime()+slots[index%ac.daily]*60000;
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
  catch { notify('This device could not save the preview. Download your prompt before closing.'); return false; }
}
function notify(message) {
  clearTimeout(noticeTimer); $('#notice').textContent = message; $('#notice').hidden = false;
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 5000);
}
function event(title, detail, automation = current.id) {
  state.events.unshift({id:uid('event'),title,detail,automation,time:Date.now()});
  persist();
}
function automation(id = current.id) { return state.automations.find(a => a.id === id && !a.removed); }
function route(id, page = 'queue') { return `/automation/${id}/${page}`; }
function fmtTime(time) { return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(time)); }
function fmtDate(time) { return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(time)); }
function validUrl(value) {
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
function integer(value, minimum = 1) { const n = Number(value); return Number.isSafeInteger(n) && n >= minimum; }
function counts(a, account) {
  const pins = a.pins.filter(p => !account || p.account === account);
  const ready = pins.filter(p => p.status === 'ready').length;
  const published = pins.filter(p => p.status === 'published').length;
  const review = pins.filter(p => p.status === 'review').length;
  const daily = a.accounts.filter(p => !account || p.id === account).reduce((n,p) => n + p.daily,0);
  const coverage=account?(daily?Math.floor(ready/daily):0):a.accounts.length?Math.min(...a.accounts.map(ac=>Math.floor(a.pins.filter(p=>p.account===ac.id&&p.status==='ready').length/ac.daily))):0;
  return {ready,published,review,total:pins.length,days:coverage,daily};
}
function title(titleText, subtitle, actions = '') {
  return `<div class="title-row"><div><h1>${esc(titleText)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;
}
function status(a) { return `<span class="status ${a.status==='paused'?'paused':''}">${state.scenario==='expired'?'Connection needed':state.scenario==='external'?'Review changes':a.status==='draft'?'Setup unfinished':a.status==='paused'?'Paused':'Scheduled'}</span>`; }
function track(c) {
  return `<div class="track" role="img" aria-label="${c.published} published, ${c.ready} ready, ${c.review} need review, ${c.total} tracked"><span class="published" style="width:${c.total?c.published/c.total*100:0}%"></span><span class="ready" style="width:${c.total?c.ready/c.total*100:0}%"></span><span class="review" style="width:${c.total?c.review/c.total*100:0}%"></span></div><div class="track-labels"><span>${c.published} published${c.review?` · ${c.review} need review`:''}</span><span>${c.total} tracked · ${c.ready} ready</span></div>`;
}
function empty(titleText, subtitle, action = '') { return `<div class="empty"><div class="empty-symbol" aria-hidden="true">◇</div><h2>${esc(titleText)}</h2><p>${esc(subtitle)}</p>${action}</div>`; }
function shell(content) {
  const a = automation();
  const local = a && ['queue','new','accounts','activity','settings'].includes(current.page);
  const nav = local ? [['queue','▤','Queue'],['new','＋','New pins'],['accounts','◎','Accounts'],['activity','◷','Activity']] : [['home','▦','Automations'],['members','◉','Members']];
  return `<div class="shell"><aside class="sidebar"><a class="brand" href="#/home"><span class="mark">↗</span>Automation</a><div><div class="sidebar-label">${local?'Your workspace':'Your space'}</div><nav aria-label="${local?'Automation':'Main'} navigation">${nav.map(([page,symbol,label])=>`<a href="#${local?route(a.id,page):'/'+page}" ${page===current.page?'aria-current="page"':''}><span class="nav-symbol" aria-hidden="true">${symbol}</span>${label}</a>`).join('')}</nav></div><div class="sidebar-foot">${local?`<a class="text-button" href="#${route(a.id,'settings')}">Automation settings</a>`:''}<div class="owner"><span class="avatar">HD</span><span>Demo owner</span></div><button class="text-button" data-action="signout">Sign out</button></div></aside><main class="main" id="content" tabindex="-1"><div class="topbar"><div class="crumbs"><a href="#/home">Automations</a>${local?`<span>/</span><span>${esc(a.name)}</span>`:''}</div><div class="row">${local?status(a):''}<button class="icon-button round small" data-action="profile" aria-label="Your account">HD</button></div></div>${state.scenario==='expired'&&local?`<div class="inline-message error" role="alert">Activepieces needs reconnecting. Last confirmed data is shown. ${button('Reconnect','reconnect')}</div>`:''}${state.scenario==='external'&&local?`<div class="inline-message">Settings changed in Activepieces. ${button('Review changes','review-external')}</div>`:''}${content}<div class="footer-note">Example workspace · changes stay in this prototype</div></main></div>`;
}
function homePage() {
  const active = state.automations.filter(a=>!a.removed);
  const removed = state.automations.filter(a=>a.removed);
  return title('Your automations','Everything you run, in one place.',button('＋ Create automation','create','','primary')) + (active.length?`<div class="grid">${active.map(a=>{
    const c=counts(a); return `<article class="home-card"><a href="#${a.status==='draft'?`/setup/${a.id}/1`:route(a.id)}" aria-label="Open ${esc(a.name)} automation">${status(a)}<h2>${esc(a.name)} <span class="quiet">↗</span></h2><p class="small">${a.accounts.length ? a.accounts.map(p=>esc(p.handle)).join(' · ') : 'No Pinterest accounts yet'}</p><div class="metric-pair"><div><strong>${c.ready}</strong><span>Pins ready</span></div><div><strong>${c.days} days</strong><span>Queue coverage</span></div></div>${track(c)}</a><button class="icon-button" data-action="automation-menu" data-id="${a.id}" aria-label="Options for ${esc(a.name)}">⋯</button></article>`;
  }).join('')}</div>`:empty('A clear place to start','Create an automation, or bring in one you already use.',button('Create automation','create','','primary'))) + (removed.length?`<details class="notes mt"><summary>Removed automations · ${removed.length}</summary>${removed.map(a=>`<div class="removed-row row between"><div><h3>${esc(a.name)}</h3><p class="small">${a.remoteDeleted?'Flow deleted; restore setup as a draft.':'Queue and settings kept.'}</p></div>${button('Restore','restore-automation',`data-id="${a.id}"`)}</div>`).join('')}</details>`:'');
}
function pinRow(p, a) {
  const type = {free:'Without a link',product:'Product link',category:'Category link'}[p.type] || 'Product link';
  return `<div class="pin-row" data-pin="${p.id}">${cover(p.cover,true)}<div><h3>${esc(p.title)}</h3><p>${type} · ${esc(a.accounts.find(ac=>ac.id===p.account)?.handle||'Account unavailable')}</p></div><div class="row"><span class="time">${p.status==='ready'?`${fmtDate(p.time)} · ${fmtTime(p.time)}`:p.status==='review'?'Needs review':'Published'}</span><button class="icon-button" data-action="edit-pin" data-pin="${p.id}" aria-label="${p.status==='published'?'View':'Edit'} ${esc(p.title)}">${p.status==='published'?'↗':'⋯'}</button></div></div>`;
}
function queuePage(a) {
  if (!a.accounts.length) return title('Connect a Pinterest account','Choose which profile this automation will publish to.')+empty('No accounts connected','Saved logins are available. You choose which one to add.',button('Add Pinterest account','add-account','','primary'));
  if (state.scenario==='loading') {const c=counts(a);return title('Checking your queue','Last confirmed counts stay visible while refreshing.')+`<div class="surface" aria-busy="true"><div class="big-number">${c.ready}</div><p class="small mb">pins ready · last confirmed</p>${track(c)}<p class="mt" role="status">Reading the example queue…</p>${button('Finish preview loading','finish-loading','class="mt"')}</div>`;}
  const c=counts(a);
  let pins=a.pins.filter(p=>queueFilter==='all'||p.status===queueFilter);
  const next=a.pins.find(p=>p.status==='ready');
  const slots=a.accounts[0].slots||sampleSlots;
  const dayPins=a.pins.filter(p=>p.account===a.accounts[0].id&&p.time>=today.getTime()&&p.time<today.getTime()+day&&['published','ready'].includes(p.status)).sort((x,y)=>x.time-y.time);
  const firstReady=dayPins.find(p=>p.status==='ready')?.id;
  const timeline=dayPins.length?dayPins.map(p=>({minute:new Date(p.time).getHours()*60+new Date(p.time).getMinutes(),label:p.status==='published'?'Published':a.status==='paused'?'Paused':p.id===firstReady?'Next':'Scheduled',next:p.id===firstReady&&a.status!=='paused'})):slots.map(minute=>({minute,label:a.status==='paused'?'Paused':'No pin',next:false}));
  const heading=a.status==='paused'?'Your queue is paused.':c.ready?'Your next pins are ready.':'Time for something new.';
  return title(heading,a.status==='paused'?'Your pins stay here until you resume.':c.ready?'A little planning. A steady presence.':'Create a batch to refill your queue.',button('More','automation-menu',`data-id="${a.id}"`)+link('＋ New pins',route(a.id,'new'),'primary'))+
    (state.scenario==='sync-error'?`<div class="inline-message error" role="alert">Could not refresh. These are the last confirmed counts; they are not a live update. ${button('Try again','retry-sync')}</div>`:'')+
    `<div class="queue-layout"><div><section class="surface queue-hero"><div class="row between"><div><div class="big-number num">${c.ready}</div><span class="small muted">pins ready</span></div><div style="text-align:right"><div class="coverage">${c.days ? `About ${c.days} days covered` : 'Ready for a refill'}</div><p class="small">${c.daily} pins a day</p></div></div>${track(c)}${a.accounts.length>1?`<div class="account-coverage">${a.accounts.map(ac=>`<span>${esc(ac.handle)} · ${counts(a,ac.id).days} days</span>`).join('')}</div>`:''}<div class="row between schedule-head"><h3>${a.status==='paused'?'Saved posting plan':"Today's posting plan"}</h3><span class="small muted">${esc(a.accounts[0].zone.split('/').at(-1).replaceAll('_',' '))}</span></div><div class="slots">${timeline.map(slot=>`<div class="slot ${slot.next?'next':''}"><strong>${String(Math.floor(slot.minute/60)).padStart(2,'0')}:${String(slot.minute%60).padStart(2,'0')}</strong>${slot.label}</div>`).join('')}</div><p class="hint">Varied times within your hours. ${a.status==='paused'?'No future posts while paused.':'Last example sync: just now.'}</p></section><div class="section-head"><h2>Your pins</h2><span class="small muted">${c.ready} ready to publish</span></div><div class="filters" aria-label="Pin status">${[['ready','Ready'],['published','Published'],['review','Needs review'],['all','All']].map(([v,t])=>`<button class="filter" data-action="filter-pins" data-filter="${v}" aria-pressed="${queueFilter===v}">${t}</button>`).join('')}</div><div data-pin-list>${pins.length?pins.slice(0,queueLimit).map(p=>pinRow(p,a)).join(''):empty(queueFilter==='review'?'Nothing needs review':'No pins here yet','New pin batches arrive here after creation and review.',link('Make new pins',route(a.id,'new'),'primary'))}</div>${pins.length>queueLimit?button('Show more pins','more-pins','class="mt"'):''}</div><aside class="next-preview">${cover(next?.cover||0,false,next?.title||'Your next idea.')}<div class="account-strip"><span class="avatar">${esc(initials(a.accounts[0].handle))}</span><span>${esc(a.accounts[0].handle)}</span></div><p>${a.status==='paused'?'Posting paused':next?`Next saved slot · ${fmtTime(next.time)}`:'Your next batch starts here'}</p>${link('Posting settings',route(a.id,'accounts'))}</aside></div>`;
}
function newRow(kind) {
  return {id:uid('source'),kind,count:5,url:'',includeProducts:true,includeCategory:false,perProduct:3,categoryPins:3,selected:[],catalogUrl:null,catalogState:'idle'};
}
function builder(a) {
  if (!state.builders[a.id]) state.builders[a.id]={account:a.accounts[0]?.id||'',rows:[newRow('free')],notes:'',refs:[]};
  return state.builders[a.id];
}
function sourceTotal(r) {
  if(r.kind==='category') return (r.includeProducts&&r.catalogUrl===r.url?r.selected.length*Number(r.perProduct):0)+(r.includeCategory?Number(r.categoryPins):0);
  return Number(r.count);
}
function total(b) { return b.rows.reduce((n,r)=>n+sourceTotal(r),0); }
function sourceErrors(r) {
  const errors=[];
  if(r.kind!=='free'&&!validUrl(r.url)) errors.push('Add a complete https:// link.');
  if(['free','product','store'].includes(r.kind)&&!integer(r.count)) errors.push('Use a positive whole number of pins.');
  if(r.kind==='category') {
    if(!r.includeProducts&&!r.includeCategory) errors.push('Choose products, the category itself, or both.');
    if(r.includeProducts&&(!r.selected.length||r.catalogUrl!==r.url)) errors.push('Choose the products for this category.');
    if(r.includeProducts&&!integer(r.perProduct)) errors.push('Use a positive whole number per product.');
    if(r.includeCategory&&!integer(r.categoryPins)) errors.push('Use a positive whole number of category pins.');
  }
  if(r.kind==='store'&&(!r.selected.length||r.catalogUrl!==r.url)) errors.push('Review the catalog and choose products.');
  return errors;
}
function sourceMarkup(r) {
  const name={free:'Without links',product:'Single product',category:'Category',store:'Website or shop'}[r.kind];
  let fields='';
  if(r.kind==='free') fields=`<label>Pins<input data-field="count" type="number" min="1" step="1" value="${r.count}"></label><p class="hint">Ideas use this account's niche. No destination links.</p>`;
  if(r.kind==='product') fields=`<div class="fields"><label>Product link<input data-field="url" type="url" placeholder="https://your-shop.com/product" value="${esc(r.url)}"></label><label>Pins<input data-field="count" type="number" min="1" step="1" value="${r.count}"></label></div><p class="hint">Fresh pins for this exact product. Each links to its product page.</p>`;
  if(r.kind==='category'||r.kind==='store') fields=`<label>${r.kind==='category'?'Category link':'Website, Etsy shop or Gumroad store'}<input data-field="url" type="url" placeholder="https://your-shop.com/collection" value="${esc(r.url)}"></label>${r.kind==='category'?`<div class="source-choices"><label class="check"><input type="checkbox" data-field="includeProducts" ${r.includeProducts?'checked':''}>Individual products</label><label class="check"><input type="checkbox" data-field="includeCategory" ${r.includeCategory?'checked':''}>Category itself</label></div><div data-product-options ${r.includeProducts?'':'hidden'}><div class="selected-products"><span data-product-count>${r.catalogUrl===r.url?r.selected.length:0} products selected</span>${button('Choose products','catalog',`data-source="${r.id}"`)}</div><label class="mt">Pins per product<input data-field="perProduct" type="number" min="1" step="1" value="${r.perProduct}"></label></div><label class="mt" data-category-options ${r.includeCategory?'':'hidden'}>Category overview pins<input data-field="categoryPins" type="number" min="1" step="1" value="${r.categoryPins}"></label><p class="hint">Product pins → product pages. Category pins → this category.</p>`:`<div class="selected-products"><span data-product-count>${r.catalogUrl===r.url?r.selected.length:0} products in your plan</span>${button('Review catalog','catalog',`data-source="${r.id}"`)}</div><label class="mt">Pins in this batch<input data-field="count" type="number" min="1" step="1" value="${r.count}"></label><p class="hint">Rotate selected products using the saved content plan.</p>`}`;
  return `<section class="source" data-source="${r.id}"><div class="source-head"><h3>${name}</h3><button class="text-button" data-action="remove-source" data-source="${r.id}" aria-label="Remove ${name} source">×</button></div>${fields}<div class="error" data-source-error role="alert" hidden></div></section>`;
}
function refsMarkup(refs) {
  return refs.map((r,i)=>`<div class="ref"><img src="${esc(r.src)}" alt="Batch style reference ${i+1}"><button data-action="remove-ref" data-ref="${r.id}" aria-label="Remove reference ${i+1}">×</button><span>${esc(r.name)}</span></div>`).join('');
}
function newPinsPage(a) {
  if(!a.accounts.length) return title('Make your first pins','Connect a Pinterest account first.')+empty('Which account are these for?','Add a saved Pinterest login to this automation.',button('Add Pinterest account','add-account','','primary'));
  const b=builder(a), n=total(b);
  return title('What shall we make next?','Mix sources. Set your amounts. Make something fresh.')+`<div class="account-select"><label>Pinterest account<select id="batch-account">${a.accounts.map(ac=>`<option value="${ac.id}" ${b.account===ac.id?'selected':''}>${esc(ac.handle)}</option>`).join('')}</select></label></div><div class="builder-layout"><div><div class="source-list">${b.rows.map(sourceMarkup).join('')}</div><div class="add-sources" aria-label="Add a content source">${[['free','Without links'],['product','Product'],['category','Category'],['store','Website / shop']].map(([kind,label])=>button('＋ '+label,'add-source',`data-kind="${kind}"`)).join('')}</div><details class="notes" ${b.notes||b.refs.length?'open':''}><summary>Notes & example pins <span class="quiet">· optional</span></summary><div class="stack"><label>Anything specific for this batch?<textarea id="batch-notes" placeholder="For example: autumn gifts, warm colors, simple headlines.">${esc(b.notes)}</textarea></label><label>Example pins<input type="file" id="reference-files" accept="image/jpeg,image/png,image/webp" multiple></label><p class="hint">Use the style, with fresh layouts. Up to 6 images; kept on this device in the preview.</p><div class="refs" id="batch-refs">${refsMarkup(b.refs)}</div>${button('Use example images','example-refs')}</div></details></div><aside class="request-summary"><div><div class="big-number num" id="request-total" aria-live="polite">${n}</div><p>pins requested</p></div><p id="request-days">About ${Math.floor(n/(a.accounts.find(ac=>ac.id===b.account)?.daily||5))} days of content.</p><hr class="summary-rule"><div class="summary-details"><p>One request.<br>The right link on every pin.</p><ul class="subtle-list"><li>Fresh creative each time</li><li>Your product stays accurate</li></ul></div>${button('Review request','review-request','','primary')}<p class="summary-bottom small">Prompt → create → review → queue</p><div id="builder-error" class="error summary-bottom" role="alert" hidden></div></aside></div>`;
}
function accountsPage(a) {
  return title('Pinterest accounts','Identity and posting settings. Nothing extra.',button('＋ Add account','add-account','','primary'))+`<div class="stack">${a.accounts.map(ac=>`<section class="account-card" data-account="${ac.id}"><div class="account-header"><div class="account-identity"><span class="avatar">${esc(initials(ac.handle))}</span><div><h2>${esc(ac.handle)}</h2><p class="small">Connected · ${ac.daily} pins a day</p></div></div>${button('Settings','account-settings',`data-account="${ac.id}"`)}</div><div class="account-editor" hidden></div></section>`).join('')||empty('No Pinterest accounts yet','Choose a saved connection when you are ready.',button('Add account','add-account','','primary'))}</div>`;
}
function accountEditor(ac) {
  return `<div class="fields"><label>Default niche<input name="niche" data-account-field="niche" value="${esc(ac.niche)}"></label><label>Pins each day<input name="daily" data-account-field="daily" type="number" min="1" step="1" value="${ac.daily}"></label></div><div class="fields"><label>Posting starts<input data-account-field="start" type="time" value="${ac.start}"></label><label>Posting ends<input data-account-field="end" type="time" value="${ac.end}"></label></div><div class="fields"><label>Time zone<select data-account-field="zone">${['Africa/Casablanca','Europe/London','America/New_York','UTC'].map(z=>`<option ${z===ac.zone?'selected':''}>${z}</option>`).join('')}</select></label><label>Minimum spacing (minutes)<input type="number" min="1" step="1" data-account-field="spacing" value="${ac.spacing}"></label></div><p class="hint">Times vary within your hours. Website links and pin examples belong in New pins.</p><div data-account-error class="error" role="alert" hidden></div><div class="actions"><button class="button save" data-action="save-account" hidden>Save changes</button><button class="button" data-action="cancel-account">Hide settings</button><button class="text-button danger" data-action="disconnect-account" data-account="${ac.id}">Remove account</button></div>`;
}
function activityPage(a) {
  const batches=state.batches.filter(b=>b.automation===a.id);
  const events=state.events.filter(e=>e.automation===a.id);
  return title('Activity','Requests, published pins and saved changes.')+`<h2 class="mb">Pin requests</h2>${batches.length?batches.map(b=>`<article class="batch"><div class="row between"><div><h3>${b.total} pins · ${esc(b.accountHandle)}</h3><p class="small">${fmtDate(b.time)} · ${b.copies} ${b.copies===1?'copy':'copies'}</p></div><span class="badge">${b.queued&&b.status!=='queued'?`${b.queued} / ${b.total} queued`:({prepared:'Prompt ready',creating:'Waiting for creation',received:'Ready for review',queued:'Added to queue'}[b.status])}</span></div><div class="actions mt">${button('Open request','open-batch',`data-batch="${b.id}"`)}${button('Make similar','similar-batch',`data-batch="${b.id}"`)}${b.status==='received'?button('Review pins','review-created',`data-batch="${b.id}"`,'primary'):''}</div></article>`).join(''):empty('No requests yet','Your prompts appear here. Copying again keeps the same request.',link('New pins',route(a.id,'new'),'primary'))}<h2 class="mt">Recent changes</h2><div class="timeline">${events.map(e=>`<article class="event"><time>${fmtTime(e.time)}</time><div><h3>${esc(e.title)}</h3><p>${esc(e.detail)}</p></div></article>`).join('')||'<p class="small mt">No changes in this preview yet.</p>'}</div>${state.removedPins.some(p=>p.automation===a.id)?`<details class="notes"><summary>Removed queue pins</summary>${state.removedPins.filter(p=>p.automation===a.id).map(p=>`<div class="removed-row row between"><h3>${esc(p.title)}</h3>${button('Restore pin','restore-pin',`data-pin="${p.id}"`)}</div>`).join('')}</details>`:''}`;
}
function settingsPage(a) {
  return title('Automation settings','Connections and notifications stay out of the daily workflow.')+`<div class="stack"><section class="surface"><h2 class="mb">Details</h2><label>Name<input id="automation-name" value="${esc(a.name)}"></label><div class="actions mt">${button('Save name','save-name')}</div></section><section class="surface"><div class="row between"><div><h2>Activepieces</h2><p class="small mt">Connected to Example platform</p></div>${button('Change API key','change-key')}</div><p class="hint">Your saved key is never displayed.</p><div id="replacement-key" hidden><label class="mt">Example API key<input id="settings-key" type="password" autocomplete="off" placeholder="Use example text; never a real key"></label>${button('Save example key','save-key','class="mt"')}</div></section><section class="surface"><h2>Notifications</h2><div class="stack mt"><label class="check"><input type="checkbox" id="notify-email" ${a.email?'checked':''}>Email updates</label><label class="check"><input type="checkbox" id="notify-telegram" ${a.telegram?'checked':''}>Telegram updates</label><div class="connection-box"><div class="row between"><div><h3>${esc(a.bot)}</h3><p class="small">Existing connection kept. No token needed.</p></div>${button('Change bot','change-bot')}</div></div>${button('Save notifications','save-notifications')}</div></section><section class="surface"><div class="row between"><div><h2>Delete automation</h2><p class="small mt">Review exactly what will be removed.</p></div>${button('Delete automation','delete-automation',`data-id="${a.id}"`,'danger')}</div></section></div>`;
}
function wizardPage(id, step) {
  const a=automation(id);
  if(!a) return empty('This setup is no longer here','Return to your automations.',link('Automations','/home'));
  if(!state.wizard||state.wizard.id!==id) state.wizard={id,step:1,selected:[],telegram:true,bot:'Saved Telegram bot'};
  const w=state.wizard;
  w.step=step;
  let body='', heading='',sub='';
  if(step===1) {
    heading='Your connection is ready.';sub='Keep your saved Activepieces connection, or change it.';
    body=`<div class="surface"><div class="connection-row"><div><h3>${state.connected?'Example platform':'Connect Activepieces'}</h3><p>${state.connected?'Connected · saved key kept':'Use the example connection for this preview.'}</p></div><span class="connected-mark">${state.connected?'✓ Connected':''}</span></div>${state.connected?button('Change API key','wizard-change-key'):button('Use example connection','wizard-example-key','','primary')}<div id="wizard-key-form" ${keyEditing?'':'hidden'}><label class="mt">Example API key<input id="wizard-key" type="password" autocomplete="off" placeholder="Example text only — no real keys"></label><div class="actions mt">${button('Save example key','wizard-save-key')}${button('Cancel','wizard-cancel-key')}</div></div></div>`;
  } else if(step===2) {
    heading='Choose a Pinterest account.';sub='A new automation starts empty. Select the account you want.';
    body=`<div class="surface"><label>Automation name<input id="setup-name" value="${esc(a.name)}"></label><h3 class="mt">Saved connections</h3>${[['pinterest-1','@stunningcrochet'],['pinterest-demo','@demo_printables']].map(([account,handle])=>{
      const used=state.automations.some(other=>other.id!==id&&!other.removed&&other.status!=='draft'&&other.accounts.some(ac=>ac.id===account));
      return `<div class="connection-row"><label class="check"><input type="checkbox" data-wizard-account="${account}" ${w.selected.includes(account)?'checked':''} ${used?'disabled':''}><span>${handle}<p>${used?'Already managed by Stunning Crochet':'Available example connection'}</p></span></label>${used?link('Open existing',route('stunning')):''}</div>`;
    }).join('')}<p class="hint">These are example connections. Nothing is selected automatically.</p>${button('Connect another Pinterest account','new-connection-guide')}</div>`;
  } else if(step===3) {
    heading='Keep your notifications.';sub='Your existing Telegram connection is already available.';
    body=`<div class="surface"><div class="retained"><span class="avatar">TG</span><div><h3>${esc(w.bot)}</h3><p class="small">Saved connection · token stays hidden</p></div></div><label class="check mt"><input type="checkbox" id="setup-telegram" ${w.telegram?'checked':''}>Keep Telegram updates</label>${button('Use a different bot','change-bot','class="mt"')}<p class="hint">Email updates stay on. You can change this later.</p></div>`;
  } else {
    heading='Ready for your first pins.';sub='Review your setup before starting the automation.';
    body=`<div class="surface"><div class="review-line"><strong>${esc(a.name)}</strong><p>Activepieces · Example platform</p></div><div class="review-line"><strong>${w.selected.length} Pinterest ${w.selected.length===1?'account':'accounts'}</strong><p>${w.selected.map(p=>p==='pinterest-1'?'@stunningcrochet':'@demo_printables').join(', ')}</p></div><div class="review-line"><strong>5 pins each day</strong><p>Varied times · 09:00–22:00 · Casablanca</p></div><div class="review-line"><strong>${w.telegram?'Telegram and email':'Email only'}</strong><p>${w.telegram?'Uses your saved bot':'No bot token required'}</p></div><p class="hint">Starting creates the automation and its content sheet. An empty queue publishes nothing.</p></div>`;
  }
  return `<div class="wizard"><div class="wizard-top"><span class="wizard-step">Step ${step} of 4</span><div class="step-line"><span style="width:${step*25}%"></span></div></div><h1>${heading}</h1><p class="lead">${sub}</p>${body}<div id="wizard-error" class="error" role="alert" hidden></div><div class="wizard-actions">${step===1?link('Back','/home'):link('Back',`/setup/${id}/${step-1}`)}${button(step===4?'Start automation':'Continue','wizard-next',`data-step="${step}"`, 'primary')}</div></div>`;
}
function membersPage() {
  return title('Members','Public Google sign-up. You control website access.')+`<div class="table-wrap"><table><thead><tr><th>Member</th><th>Access</th><th>Actions</th></tr></thead><tbody>${state.members.map(m=>`<tr><td>${esc(m.name)}<p class="small">${esc(m.email)}</p></td><td>${esc(m.status)}</td><td>${m.owner?'Owner':button(m.status==='Blocked'?'Unblock':'Block','member-access',`data-member="${m.id}"`)+button('Remove access','member-remove',`data-member="${m.id}"`,'danger')}</td></tr>`).join('')}</tbody></table></div><p class="hint">Blocking website access does not stop a separately running Activepieces flow. No member credentials are shown.</p>`;
}
function render() {
  const parts=(location.hash.slice(1)||'/home').split('/').filter(Boolean);
  const nextId=parts[0]==='automation'?parts[1]:null;
  if(current.id!==nextId){queueFilter='ready';queueLimit=8;}
  current=parts[0]==='automation'?{page:parts[2]||'queue',id:parts[1]}:{page:parts[0]||'home',id:parts[0]==='setup'?parts[1]:null};
  const a=automation();
  if(!state.signedIn||current.page==='signin') {
    $('#app').innerHTML=`<main class="signin" id="content" tabindex="-1"><a class="brand" href="#/home"><span class="mark">↗</span>Automation</a><h1>Your next pin starts here.</h1><p>Plan content. Keep your queue moving.</p>${button('Continue with Google','signin','','primary')}<p class="small quiet">Open sign-up. No invitation needed.</p><a class="small link" href="#/privacy">Privacy</a></main>`;
    if(current.page!=='privacy') return;
  }
  let content;
  if(current.page==='home') content=homePage();
  else if(current.page==='setup') content=wizardPage(parts[1],Math.min(4,Math.max(1,Number(parts[2])||1)));
  else if(current.page==='members') content=membersPage();
  else if(current.page==='privacy') content=title('Privacy','A short explanation of the intended product.')+'<div class="legal"><p>Google sign-in uses your name, email and profile picture. It does not grant access to your store, Drive or Pinterest.</p><p>Automation connections are separate. Stored credentials stay private. The owner can remove website access.</p><p>This local prototype has no sign-in server. Use example connections and avoid real keys or tokens.</p>'+link('Back','/home')+'</div>';
  else if(a) content=current.page==='new'?newPinsPage(a):current.page==='accounts'?accountsPage(a):current.page==='activity'?activityPage(a):current.page==='settings'?settingsPage(a):queuePage(a);
  else content=empty('This automation is not here','It may have been removed. You can restore it from Automations.',link('All automations','/home'));
  $('#app').innerHTML=shell(content);
}

function modal(heading, body, actions='', wide=false) {
  const dialog=$('#dialog');
  if(!dialog.open) returnFocus=document.activeElement;
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML=`<div class="dialog-header"><h2 id="dialog-title">${heading}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div><div class="dialog-body">${body}</div>${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
  if(!dialog.open) dialog.showModal();
}
function closeModal() { const dialog=$('#dialog');dialog.close();if(returnFocus?.isConnected)returnFocus.focus(); }

function openCreate() {
  modal('How would you like to start?',`<p>Choose the setup you need.</p><button class="choice-card" data-action="choose-existing"><span class="arrow">↗</span><strong>Edit existing automation</strong><p>Keep its accounts, schedule and notifications.</p></button><button class="choice-card" data-action="choose-new"><span class="arrow">＋</span><strong>Create new automation</strong><p>A fresh setup. Choose from your saved connections.</p></button>`);
}
function openExisting() {
  modal('Your saved automation',`<p>Example Activepieces discovery. Importing reads settings; it does not republish.</p><button class="choice-card" data-action="open-existing"><strong>Stunning Crochet</strong><p>@stunningcrochet · saved schedule and Telegram</p></button>`);
}
function openAutomationMenu(id) {
  const a=automation(id);if(!a)return;currentMenu=id;
  modal(esc(a.name),`<div class="stack">${link('Open automation',a.status==='draft'?`/setup/${id}/1`:route(id))}${a.status!=='draft'?button(a.status==='paused'?'Resume automation':'Pause automation','toggle-pause',`data-id="${id}"`):''}${a.status!=='draft'?link('Settings',route(id,'settings')):''}${a.status!=='draft'?button('Check queue now','check-queue',`data-id="${id}"`):''}${button('Delete automation','delete-automation',`data-id="${id}"`,'danger')}</div><p class="hint">Scheduled posting runs automatically. Checking the queue is optional.</p>`);
}
function openDelete(id) {
  const a=automation(id);if(!a)return;currentMenu=id;
  modal('Delete this automation?',`<p><strong>${esc(a.name)}</strong> moves to Removed automations. Its queue and settings stay recoverable. Future posting is paused.</p><p class="mt">Pinterest accounts, products and published pins stay untouched.</p>${a.flow?'<label class="check mt"><input type="checkbox" id="delete-remote">Also delete its Activepieces flow</label><p class="hint">Deleting the remote flow cannot be undone. Restoring later creates an unfinished setup.</p>':''}`,button('Keep automation','close-dialog')+button('Delete automation','confirm-delete',`data-id="${id}"`,'danger'));
}
function openAccount(ac) {
  if(accountDraft&&accountDraft.id!==ac.id&&accountChanged()) return modal('Keep your unfinished changes?',`<p>Save or cancel the open account settings first.</p>`,button('Return to settings','close-dialog'));
  accountDraft=clone(ac);
  $$('.account-card').forEach(card=>{ $('.account-editor',card).hidden=true; $('.account-header .button',card).hidden=false; card.classList.remove('dirty'); });
  const card=$(`[data-account="${ac.id}"].account-card`);
  $('.account-editor',card).innerHTML=accountEditor(ac);$('.account-editor',card).hidden=false;$('.account-header .button',card).hidden=true;
}
function accountChanged() {
  if(!accountDraft)return false;
  const original=automation()?.accounts.find(ac=>ac.id===accountDraft.id);
  return original&&['niche','daily','start','end','zone','spacing'].some(key=>String(accountDraft[key]).trim()!==String(original[key]).trim());
}
function dirtyAccount() {
  const changed=accountChanged(),card=$('.account-editor:not([hidden])')?.closest('.account-card');
  if(!card)return;
  card.classList.toggle('dirty',changed);$('[data-action="save-account"]',card).hidden=!changed;$('[data-action="cancel-account"]',card).textContent=changed?'Cancel':'Hide settings';
}
function closeAccount() {
  if(!accountDraft)return;const card=$(`.account-card[data-account="${accountDraft.id}"]`);
  if(card){$('.account-editor',card).hidden=true;$('.account-header .button',card).hidden=false;card.classList.remove('dirty');}
  accountDraft=null;
}
function validateAccount(d) {
  if(!d.niche.trim())return 'Choose a default niche.';
  if(!integer(d.daily)||!integer(d.spacing))return 'Use positive whole numbers.';
  if(!d.start||!d.end||d.start>=d.end)return 'Choose an end time after the start time.';
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  if((d.daily-1)*d.spacing>minutes(d.end)-minutes(d.start))return 'These pins do not fit. Widen your hours or reduce the amount or spacing.';
  return null;
}
function addAccountDialog() {
  const a=automation();
  modal('Add a Pinterest account',`<p>Choose a saved connection, or connect another profile.</p><div class="mt">${[['pinterest-1','@stunningcrochet'],['pinterest-demo','@demo_printables']].map(([id,handle])=>{
    const used=state.automations.find(other=>!other.removed&&other.accounts.some(ac=>ac.id===id));
    return `<div class="connection-row"><div><h3>${handle}</h3><p>${used?used.id===a.id?'Already added here':`Managed by ${esc(used.name)}`:'Available example connection'}</p></div>${used?button(used.id===a.id?'View account':'Open existing','open-connected',`data-id="${used.id}"`):button('Add account','confirm-add-account',`data-account="${id}"`,'primary')}</div>`;
  }).join('')}</div>`,button('Connect another profile','new-connection-guide'));
}
function connectionGuide() {
  modal('Connect Pinterest',`<ol class="guide"><li>Open Connections in Activepieces.</li><li>Choose New connection → Pinterest.</li><li>Sign in to the Pinterest profile you want.</li><li>Click Save, then return here.</li></ol><p class="hint">This prototype uses example detection and opens no live login.</p>`,button('Back','back-account-guide')+button('Preview detected connection','detect-example','','primary'));
}
function catalogDialog(sourceId) {
  const b=builder(automation()),r=b.rows.find(r=>r.id===sourceId);if(!r)return;
  if(!validUrl(r.url)){const box=$(`[data-source="${sourceId}"]`);$('[data-source-error]',box).textContent='Add the category or store link first.';$('[data-source-error]',box).hidden=false;return;}
  const external=/etsy\.com|gumroad\.com/.test(new URL(r.url).hostname);
  if(external&&r.catalogState==='idle') {
    catalogDraft={source:sourceId,selected:[]};
    modal('Catalog access',`<p>A shop URL does not grant access to its full catalog.</p><div class="connection-box mt"><h3>${/etsy/.test(r.url)?'Etsy':'Gumroad'} shop</h3><p class="small mt">The real build must verify a supported connection. You can also supply product links directly.</p></div><p class="hint">Continue below uses fictional products, not a live shop scan.</p>`,button('Use product links instead','catalog-product-fallback')+button('Use example catalog','catalog-authorize',`data-source="${sourceId}"`,'primary'));return;
  }
  catalogDraft={source:sourceId,selected:r.catalogUrl===r.url?[...r.selected]:products.slice(0,3).map(p=>p.id)};
  renderCatalog(r);
}
function renderCatalog(r) {
  modal(r.kind==='store'?'Review your product plan':'Choose category products',`<p class="break small">${esc(r.url)}</p><div class="catalog-note">Example catalog · 5 products. Pinterest history is incomplete. No sales or trend ranking is claimed.</div><div class="row between"><span class="small muted" id="catalog-selected">${catalogDraft.selected.length} selected</span>${button('Select all','catalog-all')}</div><ul class="list">${products.map((p,i)=>`<li class="product-option">${cover(i,true)}<label class="check"><input type="checkbox" data-catalog-product="${p.id}" ${catalogDraft.selected.includes(p.id)?'checked':''}><span><strong>${esc(p.title)}</strong><p>${esc(p.angle)}</p><span class="product-url">shop.example/products/${p.slug}</span></span></label></li>`).join('')}</ul><p class="hint">Product pins keep individual product URLs. Unselected products are excluded.</p>`,button('Cancel','close-dialog')+button('Use selected products','catalog-save','','primary'),true);
}
function updateBuilder() {
  const a=automation();if(!a||!$('#request-total'))return;
  const list=$('.source-list');list.style.minHeight=`${Math.max(list.offsetHeight,parseFloat(list.style.minHeight)||0)}px`;
  const b=builder(a),n=total(b);$('#request-total').textContent=Number.isSafeInteger(n)&&n>=0?n:'—';
  $('#request-days').textContent=`About ${Number.isSafeInteger(n)?Math.floor(n/(a.accounts.find(ac=>ac.id===b.account)?.daily||5)):0} days of content.`;
  b.rows.forEach(r=>{const box=$(`[data-source="${r.id}"]`);if(!box)return;
    const po=$('[data-product-options]',box),co=$('[data-category-options]',box);
    if(po)po.hidden=!r.includeProducts;if(co)co.hidden=!r.includeCategory;
    const count=$('[data-product-count]',box);if(count)count.textContent=`${r.catalogUrl===r.url?r.selected.length:0} products ${r.kind==='store'?'in your plan':'selected'}`;
    const error=$('[data-source-error]',box);if(!error.hidden){const errors=sourceErrors(r);error.textContent=errors.join(' ');error.hidden=!errors.length;}
  });persist();
}
function groupsFor(b) {
  const groups=[];
  for(const r of b.rows) {
    if(r.kind==='free'||r.kind==='product')groups.push({source:r.kind,title:r.kind==='free'?'Niche ideas without links':'Single product',amount:Number(r.count),url:r.kind==='free'?'':r.url});
    if(r.kind==='category') {
      if(r.includeProducts)for(const id of r.selected){const p=products.find(p=>p.id===id);groups.push({source:'product',title:p.title,product:id,amount:Number(r.perProduct),url:`https://shop.example/products/${p.slug}`});}
      if(r.includeCategory)groups.push({source:'category',title:'Category overview',amount:Number(r.categoryPins),url:r.url});
    }
    if(r.kind==='store') {
      r.selected.forEach((id,i)=>{const p=products.find(p=>p.id===id);const amount=Math.floor(r.count/r.selected.length)+(i<r.count%r.selected.length?1:0);if(amount)groups.push({source:'product',title:p.title,product:id,amount,url:`https://shop.example/products/${p.slug}`});});
    }
  }return groups;
}
function reviewRequest() {
  const a=automation(),b=builder(a);let invalid=false;
  b.rows.forEach(r=>{const errors=sourceErrors(r),box=$(`[data-source="${r.id}"]`);$('[data-source-error]',box).hidden=!errors.length;$('[data-source-error]',box).textContent=errors.join(' ');invalid ||= errors.length>0;});
  const n=total(b);
  if(!b.rows.length||!integer(n)){invalid=true;$('#builder-error').textContent='Add sources with valid whole amounts.';$('#builder-error').hidden=false;}
  if(invalid)return;
  $('#builder-error').hidden=true;
  modal('Review your request',`<div class="row between"><div><h3>${esc(a.accounts.find(ac=>ac.id===b.account)?.handle)}</h3><p class="small">One mixed request</p></div><span class="big-number num">${n}</span></div>${groupsFor(b).map(g=>`<div class="review-line"><strong>${g.amount} × ${esc(g.title)}</strong><p class="break">${g.url?esc(g.url):'Without a destination link'}</p></div>`).join('')}<p class="hint">${b.refs.length} reference images · ${b.notes?'Batch instructions included':'No extra instructions'}. Large requests can continue in parts. Creating pins does not change your daily posting volume.</p>`,button('Back to editing','close-dialog')+button('Get Codex prompt','prepare-prompt','','primary'),true);
}
function promptFor(b) {
  return `EXAMPLE CONTENT REQUEST — ${b.id}\nAccount: ${b.accountHandle}\nDefault niche: ${b.niche||'Use the verified account niche'}\nRequested pins: ${b.total}\nAlready queued: ${b.queued||0}\nRemaining: ${b.total-(b.queued||0)}\n\nCreate and review the pins before adding them to the content queue. Do not post directly.\n\n${b.groups.map(g=>`${g.amount} pins — ${g.title}\nDestination: ${g.url||'NONE; do not add a destination link.'}`).join('\n\n')}\n\nBatch instructions: ${b.notes||'Use the account niche. No extra brief required.'}\n\nReferences: ${b.refs.length?b.refs.map(r=>r.name).join(', '):'No uploaded references.'}\n${b.refs.length?'Open every attached reference. Stop and ask if an image is missing. Copying this text does not attach images.':''}\n\nResearch permitted sources and record dates. An example shop URL is not a real catalog. Keep product facts and destinations exact; never invent offers. For category products, use each product URL. For a category overview, use the category URL.\n\nFor category overview pins, keep the category link and feature a varied selection of its real products. Rotate featured products across batches. Keep single-product pins faithful to that exact product. Keep recognizable identity while varying layouts, headlines, crops and supported uses. Check queued and accessible published pins for repeated creative. Keep a progress journal; continue large requests in resumable parts. Do not infer never-posted from incomplete history.\n\nReturn batch ID, completed/remaining counts, product ID, title, description, destination, account and accessible media for each pin. Confirm actual queue receipt separately. This prototype cannot receive real output.\n`;
}
function preparePrompt() {
  const a=automation(),b=builder(a);
  const normalizedRows=b.rows.map(r=>({...r,count:Number(r.count),perProduct:Number(r.perProduct),categoryPins:Number(r.categoryPins),url:r.url.trim()}));
  const signature=JSON.stringify({account:b.account,rows:normalizedRows,notes:b.notes.trim(),refs:b.refs});
  if(b.signature===signature&&state.batches.some(request=>request.id===b.preparedId)){openBatch(b.preparedId);return;}
  const request={id:uid('batch'),automation:a.id,account:b.account,accountHandle:a.accounts.find(ac=>ac.id===b.account)?.handle,niche:a.accounts.find(ac=>ac.id===b.account)?.niche,total:total(b),sources:clone(b.rows),groups:groupsFor(b),notes:b.notes,refs:clone(b.refs),time:Date.now(),copies:0,status:'prepared'};
  b.signature=signature;b.preparedId=request.id;
  state.batches.unshift(request);persist();openBatch(request.id);
}
function openBatch(id) {
  const b=state.batches.find(b=>b.id===id);if(!b)return;currentBatch=id;
  modal('Your Codex prompt',`<p><strong>${b.total} pins</strong> for ${esc(b.accountHandle)}. This is a request, not finished pins.</p><ol class="guide"><li>Copy the prompt into Codex.</li>${b.refs.length?'<li>Download the package, unzip it and attach the reference images.</li>':''}<li>Review the created pins, then confirm their arrival in the queue.</li></ol><label>Prompt<textarea class="prompt" readonly id="prompt-text">${esc(promptFor(b))}</textarea></label><p class="hint" id="copy-result">${b.copies} ${b.copies===1?'copy':'copies'} · same batch ID when copied again</p><p class="small mt">${b.status==='queued'?'Added to the example queue.':b.status==='received'?'Example output is ready for review.':'Waiting for creation. Nothing has been added to the queue.'}</p><a id="package-download" hidden>Download package</a>`,button('Download prompt + images','download-package')+button('Copy prompt','copy-prompt','','primary'),true);
}
function reviewCreated(id) {
  const b=state.batches.find(b=>b.id===id);if(!b)return;currentBatch=id;
  modal('Review created pins',`<p>${b.available||Math.min(b.total,25)} example pins received for ${esc(b.accountHandle)}. ${b.queued||0} of ${b.total} already queued.</p><p class="hint">Large requests continue in parts. Check creative and destination before queuing.</p><div class="grid mt">${b.groups.slice(0,3).map((g,i)=>`<div>${cover(i,false,g.title)}<p class="hint break">${g.url?esc(g.url):'No destination link'}</p></div>`).join('')}</div><p class="hint">Illustrated samples only. Actual product-image fidelity still needs live acceptance.</p>`,button('Keep in review','close-dialog')+button('Add reviewed pins to queue','queue-created','','primary'),true);
}

function crc32(bytes) {let c=-1;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^-1)>>>0;}
function zipStore(files) {
  const chunks=[],central=[];let offset=0,centralSize=0;
  const header=n=>{const a=new Uint8Array(n);return{a,v:new DataView(a.buffer)};};
  for(const file of files){const name=new TextEncoder().encode(file.name),data=file.bytes,crc=crc32(data),h=header(30);h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,name.length,true);chunks.push(h.a,name,data);const d=header(46);d.v.setUint32(0,0x02014b50,true);d.v.setUint16(4,20,true);d.v.setUint16(6,20,true);d.v.setUint16(8,0x800,true);d.v.setUint32(16,crc,true);d.v.setUint32(20,data.length,true);d.v.setUint32(24,data.length,true);d.v.setUint16(28,name.length,true);d.v.setUint32(42,offset,true);central.push(d.a,name);centralSize+=46+name.length;offset+=30+name.length+data.length;}
  const end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,centralSize,true);end.v.setUint32(16,offset,true);return new Blob([...chunks,...central,end.a],{type:'application/zip'});
}
async function downloadPackage(b) {
  try {
    const encode=s=>new TextEncoder().encode(s),files=[{name:'prompt.txt',bytes:encode(promptFor(b))},{name:'manifest.json',bytes:encode(JSON.stringify({preview:true,batch:b.id,total:b.total,groups:b.groups,references:b.refs.map(r=>r.name)},null,2))}];
    for(const r of b.refs){const response=await fetch(r.src);if(!response.ok)throw new Error();files.push({name:r.name.replace(/[^a-zA-Z0-9._-]/g,'_'),bytes:new Uint8Array(await response.arrayBuffer())});}
    const anchor=$('#package-download');if(anchor.href.startsWith('blob:'))URL.revokeObjectURL(anchor.href);anchor.href=URL.createObjectURL(zipStore(files));anchor.download=`automation-${b.id}.zip`;anchor.click();notify('Package prepared. Unzip and attach its images with the prompt.');
  } catch {notify('A reference image is unavailable. Add it again before copying this request.');}
}
async function addReferences(files) {
  const b=builder(automation());
  for(const file of files) {
    if(b.refs.length>=6){notify('Keep up to 6 references for one clear style.');break;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){notify('Use a JPG, PNG or WebP image below 8 MB.');continue;}
    try {
      const bitmap=await createImageBitmap(file),scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      b.refs.push({id:uid('ref'),name:`reference-${uid('image')}.jpg`,src:canvas.toDataURL('image/jpeg',.8)});
    } catch {notify('That image could not be opened. Try another image.');}
  }
  persist();$('#batch-refs').innerHTML=refsMarkup(b.refs);
}

function wizardNext(step) {
  const a=automation(),w=state.wizard,error=$('#wizard-error');
  let message='';
  if(step===1&&!state.connected)message='Use the example connection to continue.';
  if(step===1&&keyEditing)message='Save the replacement key, or Cancel to keep your saved connection.';
  if(step===2&&!a.name.trim())message='Give this automation a name.';
  if(step===2&&!w.selected.length)message='Select at least one available Pinterest account.';
  if([2,4].includes(step)&&w.selected.some(id=>state.automations.some(other=>other.id!==a.id&&!other.removed&&other.status!=='draft'&&other.accounts.some(ac=>ac.id===id))))message='An account is already managed by another automation. Open its existing setup.';
  if(message){error.textContent=message;error.hidden=false;return;}
  if(step<4){persist();location.hash=`/setup/${a.id}/${step+1}`;return;}
  a.accounts=w.selected.map(id=>({id,handle:id==='pinterest-1'?'@stunningcrochet':'@demo_printables',niche:id==='pinterest-1'?'Crochet & knitting':'Printables',daily:5,start:'09:00',end:'22:00',spacing:90,zone:'Africa/Casablanca'}));
  a.status='scheduled';a.flow=true;a.telegram=w.telegram;a.bot=w.bot;persist();
  modal('Your automation is ready',`<ul class="progress-list"><li>✓ Example flow created</li><li>✓ Content sheet ready</li><li>✓ Schedule saved</li></ul><p>No pins are queued yet. Create your first batch next.</p><p class="hint">All results are simulated in this prototype.</p>`,link('Open queue',route(a.id))+link('Make first pins',route(a.id,'new'),'primary'));
  event('Automation started','Example setup completed; the queue is empty.',a.id);
}
function editPin(id) {
  const a=automation(),p=a.pins.find(p=>p.id===id);if(!p)return;currentMenu=id;
  if(p.status==='published'){modal('Published pin',`<h3>${esc(p.title)}</h3><p class="mt break">${p.url?esc(p.url):'Without a destination link'}</p><p class="hint">This is a confirmed-publication example record. Published pins cannot be removed by editing the queue.</p>`,button('Close','close-dialog'));return;}
  modal('Edit queued pin',`<div class="form-grid"><label>Title<input id="pin-title" value="${esc(p.title)}"></label><label>Destination type<select id="pin-type"><option value="free" ${p.type==='free'?'selected':''}>Without a link</option><option value="product" ${p.type==='product'?'selected':''}>Product page</option><option value="category" ${p.type==='category'?'selected':''}>Category page</option></select></label><label id="pin-url-label" ${p.type==='free'?'hidden':''}>Destination link<input id="pin-url" type="url" value="${esc(p.url)}"></label><p class="hint">Planned for ${fmtDate(p.time)}, ${fmtTime(p.time)}. Changing the title keeps that time.</p><div id="pin-error" class="error" role="alert" hidden></div></div>`,button('Remove from queue','remove-pin',`data-pin="${p.id}"`,'danger')+button('Save pin','save-pin',`data-pin="${p.id}"`,'primary'));
}
function scenarioDialog() {
  modal('Preview states',`<p>Review sample states without changing live services.</p><div class="scenario-list mt">${[['normal','Normal queue'],['empty-queue','Empty queue'],['sync-error','Queue sync failed'],['expired','Connection expired'],['external','Changed in Activepieces'],['save-error','Next account save fails'],['loading','Queue loading'],['received','Example batch received']].map(([id,label])=>button(label,'set-scenario',`data-scenario="${id}"`)).join('')}${button('Reset all example data','reset-preview','','danger')}</div>`);
}

document.addEventListener('click',async e=>{
  const anchor=e.target.closest('a[href^="#"]');
  if(anchor){
    if(anchor.getAttribute('href')==='#content'){e.preventDefault();$('#content').focus();return;}
    if(accountChanged()){
      e.preventDefault();pendingRoute=anchor.getAttribute('href');
      modal('Leave these changes?',`<p>Your account settings have not been saved.</p>`,button('Keep editing','close-dialog')+button('Discard changes','discard-and-leave','','danger'));return;
    }
    if($('#dialog').open)closeModal();
  }
  const target=e.target.closest('button[data-action]');if(!target||target.disabled)return;
  clearTimeout(noticeTimer);$('#notice').hidden=true;
  const action=target.dataset.action,a=automation();
  if(action==='close-dialog'){closeModal();return;}
  if(action==='profile'){modal('Your account',`<div class="stack">${link('All automations','/home')}${a?link('Automation settings',route(a.id,'settings')):''}${link('Members','/members')}${link('Privacy','/privacy')}${button('Sign out','signout')}</div>`);return;}
  if(action==='signin'){state.signedIn=true;persist();location.hash='/home';render();return;}
  if(action==='signout'){state.signedIn=false;persist();location.hash='/signin';return;}
  if(action==='create'){openCreate();return;}
  if(action==='choose-existing'){openExisting();return;}
  if(action==='open-existing'){
    let existing=state.automations.find(a=>a.id==='stunning');
    if(existing.removed){existing.removed=false;existing.status='paused';persist();}
    closeModal();location.hash=route(existing.id);return;
  }
  if(action==='choose-new'){
    const id=uid('automation');state.automations.push({id,name:'New automation',status:'draft',flow:false,accounts:[],pins:[],email:true,telegram:true,bot:'Saved Telegram bot',removed:false});
    state.wizard={id,step:1,selected:[],telegram:true,bot:'Saved Telegram bot'};keyEditing=false;persist();closeModal();location.hash=`/setup/${id}/1`;return;
  }
  if(action==='wizard-change-key'){keyEditing=true;$('#wizard-key-form').hidden=false;return;}
  if(action==='wizard-cancel-key'){keyEditing=false;$('#wizard-key-form').hidden=true;$('#wizard-key').value='';return;}
  if(action==='wizard-example-key'||action==='wizard-save-key'){
    if(action==='wizard-save-key'&&!$('#wizard-key').value.trim()){notify('Use example text for this preview.');return;}
    state.connected=true;keyEditing=false;persist();render();notify('Example connection saved.');return;
  }
  if(action==='wizard-next'){wizardNext(Number(target.dataset.step));return;}
  if(action==='automation-menu'){openAutomationMenu(target.dataset.id);return;}
  if(action==='delete-automation'){openDelete(target.dataset.id);return;}
  if(action==='confirm-delete'){
    const item=automation(target.dataset.id);item.removed=true;item.remoteDeleted=$('#delete-remote')?.checked||false;item.status='paused';persist();closeModal();location.hash='/home';render();notify('Moved to Removed automations.');return;
  }
  if(action==='restore-automation'){
    const item=state.automations.find(a=>a.id===target.dataset.id);item.removed=false;
    if(item.remoteDeleted){item.status='draft';item.flow=false;state.wizard={id:item.id,step:1,selected:item.accounts.map(ac=>ac.id),telegram:item.telegram,bot:item.bot};}
    persist();render();notify(item.remoteDeleted?'Setup restored as a draft.':'Restored. Posting stays paused.');return;
  }
  if(action==='toggle-pause'){
    const item=automation(target.dataset.id),paused=item.status==='paused';
    modal(paused?'Resume scheduled posting?':'Pause this automation?',`<p>${paused?'Future slots continue with their saved spacing. Missed posts will not be sent as a burst.':'Future scheduled runs stop. Your queue stays here. A post already running may finish.'}</p>`,button('Cancel','close-dialog')+button(paused?'Resume automation':'Pause automation','confirm-pause',`data-id="${item.id}"`,'primary'));return;
  }
  if(action==='confirm-pause'){
    const item=automation(target.dataset.id);item.status=item.status==='paused'?'scheduled':'paused';event(item.status==='paused'?'Automation paused':'Automation resumed','Example future scheduling updated.',item.id);closeModal();render();return;
  }
  if(action==='check-queue'){closeModal();notify('Example queue checked. This does not force a pin to publish.');return;}
  if(action==='review-external'){
    modal('Changed in Activepieces',`<p>Review the difference before saving over it.</p><div class="review-line"><strong>Pins each day</strong><p>Your draft: ${a.accounts[0].daily} · Activepieces example: ${a.accounts[0].daily+1}</p></div><p class="hint">Keeping the remote version reads its settings. Reviewing your draft does not overwrite anything.</p>`,button('Review my draft','review-local-draft')+button('Keep Activepieces version','keep-remote','','primary'));return;
  }
  if(action==='review-local-draft'){state.scenario='normal';persist();closeModal();location.hash=route(a.id,'accounts');return;}
  if(action==='keep-remote'){
    const ac=a.accounts[0],candidate={...ac,daily:ac.daily+1};if(validateAccount(candidate)){notify('The example schedule needs wider posting hours. Review your settings.');return;}Object.assign(ac,candidate);ac.slots=dailySlots(ac);let index=a.pins.filter(p=>p.account===ac.id&&p.status==='published'&&p.time>=today.getTime()).length;a.pins.filter(p=>p.account===ac.id&&p.status==='ready').forEach(p=>p.time=plannedTime(ac,index++));state.scenario='normal';event('External settings kept','Example read-only reconciliation; no flow republish.');closeModal();render();return;
  }
  if(action==='retry-sync'||action==='finish-loading'||action==='reconnect'){state.scenario='normal';persist();render();return;}
  if(action==='more-pins'){queueLimit+=8;const y=scrollY;render();window.scrollTo(0,y);return;}
  if(action==='filter-pins'){queueLimit=8;queueFilter=target.dataset.filter;const y=scrollY;render();window.scrollTo(0,y);return;}
  if(action==='edit-pin'){editPin(target.dataset.pin);return;}
  if(action==='save-pin'){
    const p=a.pins.find(p=>p.id===target.dataset.pin),kind=$('#pin-type').value,url=$('#pin-url').value.trim();
    if(!$('#pin-title').value.trim()||(kind!=='free'&&!validUrl(url))){$('#pin-error').textContent='Add a title and a valid destination link.';$('#pin-error').hidden=false;return;}
    p.title=$('#pin-title').value.trim();p.type=kind;p.url=kind==='free'?'':url;p.status='ready';event('Queued pin updated',p.title);closeModal();render();return;
  }
  if(action==='remove-pin'){
    const p=a.pins.find(p=>p.id===target.dataset.pin);state.removedPins.push({...p,automation:a.id});a.pins=a.pins.filter(pin=>pin.id!==p.id);event('Pin removed from queue','Restore it from Activity.');closeModal();render();notify('Removed. You can restore it in Activity.');return;
  }
  if(action==='restore-pin'){
    const p=state.removedPins.find(p=>p.id===target.dataset.pin);a.pins.push({...p,status:'review'});state.removedPins=state.removedPins.filter(p=>p.id!==target.dataset.pin);event('Pin restored','Check the pin and its posting time before saving it back to Ready.');render();notify('Restored to Needs review.');return;
  }
  if(action==='add-source'){
    const b=builder(a),row=newRow(target.dataset.kind);b.rows.push(row);$('.source-list').insertAdjacentHTML('beforeend',sourceMarkup(row));updateBuilder();return;
  }
  if(action==='remove-source'){
    const b=builder(a);b.rows=b.rows.filter(r=>r.id!==target.dataset.source);target.closest('.source').remove();updateBuilder();return;
  }
  if(action==='catalog'){catalogDialog(target.dataset.source);return;}
  if(action==='catalog-authorize'){
    const r=builder(a).rows.find(r=>r.id===target.dataset.source);r.catalogState='example';catalogDialog(r.id);return;
  }
  if(action==='catalog-product-fallback'){
    closeModal();notify('Add individual Product sources below, using the product links you have.');return;
  }
  if(action==='catalog-all'){
    const all=catalogDraft.selected.length===products.length;catalogDraft.selected=all?[]:products.map(p=>p.id);$$('[data-catalog-product]').forEach(i=>i.checked=!all);$('#catalog-selected').textContent=`${catalogDraft.selected.length} selected`;target.textContent=all?'Select all':'Clear selection';return;
  }
  if(action==='catalog-save'){
    if(!catalogDraft.selected.length){notify('Select at least one product.');return;}
    const r=builder(a).rows.find(r=>r.id===catalogDraft.source);r.selected=[...catalogDraft.selected];r.catalogUrl=r.url;r.catalogState='example';closeModal();updateBuilder();return;
  }
  if(action==='example-refs'){
    const b=builder(a);for(let i=1;i<=3;i++)if(b.refs.length<6&&!b.refs.some(r=>r.name===`example-${i}.svg`))b.refs.push({id:uid('ref'),name:`example-${i}.svg`,src:`assets/style-${i}.svg`});persist();$('#batch-refs').innerHTML=refsMarkup(b.refs);return;
  }
  if(action==='remove-ref'){
    const b=builder(a);b.refs=b.refs.filter(r=>r.id!==target.dataset.ref);persist();$('#batch-refs').innerHTML=refsMarkup(b.refs);return;
  }
  if(action==='review-request'){reviewRequest();return;}
  if(action==='prepare-prompt'){preparePrompt();return;}
  if(action==='open-batch'){openBatch(target.dataset.batch);return;}
  if(action==='copy-prompt'){
    const b=state.batches.find(b=>b.id===currentBatch);
    try{await navigator.clipboard.writeText(promptFor(b));b.copies++;persist();$('#copy-result').textContent=`${b.copies} ${b.copies===1?'copy':'copies'} · same batch ID`;notify('Prompt copied. Creating pins is the next step.');}
    catch{$('#prompt-text').focus();$('#prompt-text').select();notify('Select and copy the prompt, or download its package.');}return;
  }
  if(action==='download-package'){await downloadPackage(state.batches.find(b=>b.id===currentBatch));return;}
  if(action==='similar-batch'){
    const b=state.batches.find(b=>b.id===target.dataset.batch);state.builders[a.id]={account:b.account,rows:clone(b.sources),notes:b.notes,refs:clone(b.refs)};persist();location.hash=route(a.id,'new');return;
  }
  if(action==='review-created'){reviewCreated(target.dataset.batch);return;}
  if(action==='queue-created'){
    const b=state.batches.find(b=>b.id===currentBatch);if(b.status==='queued'){notify('This batch is already queued.');return;}
    if(b.status!=='received'){notify('Wait for the next created part before adding more pins.');return;}
    const ac=a.accounts.find(ac=>ac.id===b.account);if(!ac){notify('This account is no longer connected. Choose an account before queuing.');return;}
    let index=a.pins.filter(p=>p.account===b.account&&(p.status==='ready'||p.status==='published'&&p.time>=today.getTime())).length;
    let skip=b.queued||0,remaining=Math.min(b.available||25,b.total-skip),added=0;
    for(const g of b.groups){if(skip>=g.amount){skip-=g.amount;continue;}const amount=Math.min(g.amount-skip,remaining);skip=0;for(let i=0;i<amount;i++){a.pins.push({id:uid('pin'),title:g.title,account:b.account,status:'ready',time:plannedTime(ac,index),type:g.source,url:g.url,product:g.product,cover:index%3,batch:b.id});index++;added++;}remaining-=amount;if(!remaining)break;}
    b.queued=(b.queued||0)+added;b.available=0;b.status=b.queued===b.total?'queued':'prepared';event('Reviewed pins added',`${added} example pins; ${b.queued} of ${b.total} queued. Each keeps its destination.`);closeModal();location.hash=route(a.id);render();notify(`${added} example pins queued. ${b.total-b.queued} remain in the request.`);return;
  }
  if(action==='account-settings'){openAccount(a.accounts.find(ac=>ac.id===target.dataset.account));return;}
  if(action==='cancel-account'){closeAccount();return;}
  if(action==='save-account'){
    const err=validateAccount(accountDraft),box=$('.account-editor:not([hidden])'),error=$('[data-account-error]',box);
    if(err){error.textContent=err;error.hidden=false;return;}
    if(state.scenario==='save-error'){state.scenario='normal';error.textContent='Example update failed. Your edits are kept. Try Save changes again.';error.hidden=false;persist();return;}
    const saved=a.accounts.find(ac=>ac.id===accountDraft.id);Object.assign(saved,clone(accountDraft),{niche:accountDraft.niche.trim()});saved.slots=dailySlots(saved);let index=a.pins.filter(p=>p.account===saved.id&&p.status==='published'&&p.time>=today.getTime()).length;a.pins.filter(p=>p.account===saved.id&&p.status==='ready').forEach(p=>{p.time=plannedTime(saved,index++);});event('Account settings saved',`${saved.handle} · website and example flow updated.`);accountDraft=null;render();notify('Example settings saved.');return;
  }
  if(action==='disconnect-account'){
    const ac=a.accounts.find(ac=>ac.id===target.dataset.account);currentMenu=ac.id;
    modal('Remove this account?',`<p>${esc(ac.handle)} leaves this automation. Its queued pins move to Needs review. The Pinterest profile and published pins stay untouched.</p>`,button('Keep account','close-dialog')+button('Remove account','confirm-disconnect',`data-account="${ac.id}"`,'danger'));return;
  }
  if(action==='confirm-disconnect'){
    a.pins.forEach(p=>{if(p.account===target.dataset.account&&p.status==='ready')p.status='review';});a.accounts=a.accounts.filter(ac=>ac.id!==target.dataset.account);accountDraft=null;event('Account removed','Queued pins held for review.');closeModal();render();return;
  }
  if(action==='add-account'){addAccountDialog();return;}
  if(action==='new-connection-guide'){connectionGuide();return;}
  if(action==='back-account-guide'){if(current.page==='setup'){closeModal();return;}addAccountDialog();return;}
  if(action==='detect-example'){
    modal('Pinterest connection detected',`<div class="retained"><span class="avatar">DP</span><div><h3>@demo_printables</h3><p class="small">Example saved Pinterest connection</p></div></div><p class="hint">Choose this profile explicitly before adding it.</p>`,button('Cancel','close-dialog')+button('Use this account',current.page==='setup'?'wizard-detected':'confirm-add-account','data-account="pinterest-demo"','primary'));return;
  }
  if(action==='wizard-detected'){state.wizard.selected=['pinterest-demo'];persist();closeModal();render();return;}
  if(action==='open-connected'){closeModal();location.hash=route(target.dataset.id,'accounts');return;}
  if(action==='confirm-add-account'){
    const id=target.dataset.account;
    if(state.automations.some(other=>!other.removed&&other.accounts.some(ac=>ac.id===id))){notify('That account is already managed. Open its existing automation.');return;}
    a.accounts.push({id,handle:id==='pinterest-1'?'@stunningcrochet':'@demo_printables',niche:id==='pinterest-1'?'Crochet & knitting':'Printables',daily:5,start:'09:00',end:'22:00',spacing:90,zone:'Africa/Casablanca'});event('Pinterest account added','Example connection selected; existing profiles stay unchanged.');closeModal();location.hash=route(a.id,'accounts');render();notify('Example account added and automation updated.');return;
  }
  if(action==='save-name'){
    const name=$('#automation-name').value.trim();if(!name){notify('Add an automation name.');return;}a.name=name;event('Automation renamed',name);render();notify('Name saved.');return;
  }
  if(action==='change-key'){$('#replacement-key').hidden=!$('#replacement-key').hidden;return;}
  if(action==='save-key'){
    if(!$('#settings-key').value.trim()){notify('Use example text, never a real key.');return;}$('#settings-key').value='';$('#replacement-key').hidden=true;notify('Example key replaced. Existing account choices stay saved.');return;
  }
  if(action==='save-notifications'){a.email=$('#notify-email').checked;a.telegram=$('#notify-telegram').checked;event('Notifications saved','Example preferences updated.');notify('Notifications saved.');return;}
  if(action==='change-bot'){
    modal('Choose a Telegram bot',`<button class="choice-card" data-action="keep-bot"><strong>Saved Telegram bot</strong><p>Keep the existing connection. No token needed.</p></button><button class="choice-card" data-action="new-bot"><strong>Add another bot</strong><p>Use an example token in this preview.</p></button>`);return;
  }
  if(action==='keep-bot'){if(current.page==='setup')state.wizard.bot='Saved Telegram bot';else a.bot='Saved Telegram bot';persist();closeModal();if(current.page==='settings')render();return;}
  if(action==='new-bot'){
    modal('Add a different bot',`<label>Example bot token<input id="example-bot-token" type="password" autocomplete="off" placeholder="Example text only; never a real token"></label><p class="hint">The real flow verifies the bot and private recipient before saving. This preview sends no messages.</p>`,button('Back','change-bot')+button('Preview verified bot','save-bot','','primary'));return;
  }
  if(action==='save-bot'){
    if(!$('#example-bot-token').value.trim()){notify('Use an example token.');return;}
    if(current.page==='setup')state.wizard.bot='Example replacement bot';else a.bot='Example replacement bot';persist();closeModal();render();notify('Example bot and recipient verified. No message sent.');return;
  }
  if(action==='member-access'){const m=state.members.find(m=>m.id===target.dataset.member);m.status=m.status==='Blocked'?'Active':'Blocked';persist();render();return;}
  if(action==='member-remove'){
    currentMenu=target.dataset.member;modal('Remove website access?',`<p>This example member loses website access. Their Google and Pinterest accounts stay unchanged. An external flow is not automatically stopped.</p>`,button('Keep member','close-dialog')+button('Remove access','confirm-member-remove','','danger'));return;
  }
  if(action==='confirm-member-remove'){state.members=state.members.filter(m=>m.id!==currentMenu);persist();closeModal();render();return;}
  if(action==='scenarios'){scenarioDialog();return;}
  if(action==='set-scenario'){
    const s=target.dataset.scenario;
    if(s==='received'){
      const b=state.batches.find(b=>b.automation===a?.id&&b.status!=='queued');
      if(!b){notify('Prepare a pin request first, then preview its received output.');return;}
      b.available=Math.min(25,b.total-(b.queued||0));b.status='received';persist();closeModal();location.hash=route(a.id,'activity');render();return;
    }
    if(!a){notify('Open an automation first.');return;}
    if(a.scenarioPins){a.pins=a.scenarioPins;delete a.scenarioPins;}
    if(s==='empty-queue'){a.scenarioPins=clone(a.pins);a.pins=a.pins.filter(p=>p.status!=='ready');}
    state.scenario=s;persist();closeModal();location.hash=route(a.id);render();return;
  }
  if(action==='reset-preview'){
    modal('Reset this prototype?',`<p>Clear the sample edits, requests and uploaded examples stored on this device. Live data is not involved.</p>`,button('Keep preview','close-dialog')+button('Reset example data','confirm-reset','','danger'));return;
  }
  if(action==='confirm-reset'){state=freshState();accountDraft=null;queueFilter='ready';persist();closeModal();location.hash='/home';render();return;}
  if(action==='discard-and-leave'){closeAccount();const next=pendingRoute;pendingRoute=null;closeModal();location.hash=next;return;}
});

document.addEventListener('input',e=>{
  const input=e.target,a=automation();
  if(input.dataset.accountField&&accountDraft){accountDraft[input.dataset.accountField]=['daily','spacing'].includes(input.dataset.accountField)?Number(input.value):input.value;dirtyAccount();return;}
  if(input.dataset.field&&a){
    const row=builder(a).rows.find(r=>r.id===input.closest('.source').dataset.source);row[input.dataset.field]=input.type==='checkbox'?input.checked:input.dataset.field==='url'?input.value.trim():input.value;
    if(input.dataset.field==='url'&&row.catalogUrl!==row.url)row.catalogState='idle';updateBuilder();return;
  }
  if(input.id==='batch-notes'){builder(a).notes=input.value;persist();return;}
  if(input.id==='setup-name'){a.name=input.value;persist();return;}
  if(input.dataset.catalogProduct){catalogDraft.selected=input.checked?[...new Set([...catalogDraft.selected,input.dataset.catalogProduct])]:catalogDraft.selected.filter(id=>id!==input.dataset.catalogProduct);$('#catalog-selected').textContent=`${catalogDraft.selected.length} selected`;return;}
  if(input.dataset.wizardAccount){const selected=state.wizard.selected;state.wizard.selected=input.checked?[...new Set([...selected,input.dataset.wizardAccount])]:selected.filter(id=>id!==input.dataset.wizardAccount);persist();return;}
  if(input.id==='setup-telegram'){state.wizard.telegram=input.checked;persist();return;}
});
document.addEventListener('change',e=>{
  if(e.target.id==='batch-account'){
    const b=builder(automation()),next=e.target.value;
    if(b.account!==next){state.builderDrafts??={};state.builderDrafts[automation().id]??={};const drafts=state.builderDrafts[automation().id];drafts[b.account]=clone(b);state.builders[automation().id]=drafts[next]?clone(drafts[next]):{account:next,rows:[newRow('free')],notes:'',refs:[]};persist();render();notify('Switched account. Each account keeps its own pin-request draft.');}
  }
  if(e.target.id==='reference-files')addReferences([...e.target.files]);
  if(e.target.id==='pin-type')$('#pin-url-label').hidden=e.target.value==='free';
});
let previousHash=location.hash||'#/home';
let pendingRoute=null;
window.addEventListener('hashchange',()=>{
  if(accountChanged()){
    pendingRoute=location.hash;history.replaceState(null,'',previousHash);
    modal('Leave these changes?',`<p>Your account settings have not been saved.</p>`,button('Keep editing','close-dialog')+button('Discard changes','discard-and-leave','','danger'));return;
  }
  accountDraft=null;previousHash=location.hash;closeModal();render();window.scrollTo(0,0);
});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeModal();}});
render();
