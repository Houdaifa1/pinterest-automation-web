'use strict';

const $ = (selector, parent = document) => parent.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mark = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 10a10 10 0 0 1 17-2M25 22a10 10 0 0 1-17 2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 3v6h-6M8 29v-6h6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const storageKey = 'autopilot-clickable-preview-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const examples = [1,2,3].map(i => ({name:`example-pin-${i}.svg`,src:`assets/style-${i}.svg`,example:true}));
const initial = {
  theme:'light', draft:false, draftFor:'stunning', draftNotes:[],
  autopilots:[
    {id:'main',name:'Main',icon:'🧶',accounts:['hdrahm','crochet'],status:'needs',posted:5,waiting:0,last:'12:03',category:'Crochet & knitting'},
    {id:'stunning',name:'Stunning Crochet',icon:'🧸',accounts:['stunning'],status:'running',posted:4,waiting:13,last:'12:01',category:'Crochet & knitting'},
    {id:'kitchen',name:'Moroccan Kitchen',icon:'🍲',accounts:['kitchen'],status:'setup',posted:0,waiting:0,last:'—',category:'Food & recipes'}
  ],
  accounts:{
    hdrahm:{name:'hdrahm',handle:'hdrahm',category:'Crochet & knitting',niche:'Crochet patterns and cozy handmade projects',daily:4,source:'niche',site:'',hours:['08:00','12:00','16:00','20:00'],brand:'Warm, natural and handmade.',refs:[],styleVersion:1,enabled:true},
    crochet:{name:'Crochet Simplified',handle:'crochet_simplified',category:'Crochet & knitting',niche:'Easy crochet patterns',daily:4,source:'website',site:'https://crochetsimplified.com',hours:['08:00','12:00','16:00','20:00'],brand:'Clear, welcoming, beginner friendly.',refs:[],styleVersion:1,enabled:true},
    stunning:{name:'Stunning Crochet',handle:'stunningcrochet',category:'Crochet & knitting',niche:'Cozy crochet ideas and beginner projects',daily:4,source:'niche',site:'',hours:['08:00','12:00','16:00','20:00'],brand:'Warm cream, soft terracotta, natural textures. Keep it calm and handmade.',refs:examples,styleVersion:1,enabled:true},
    kitchen:{name:'Moroccan Kitchen',handle:'moroccankitchen',category:'Food & recipes',niche:'Traditional Moroccan recipes for home cooks',daily:3,source:'niche',site:'',hours:['09:00','14:00','19:00'],brand:'Warm food photography and clear recipe steps.',refs:[],styleVersion:1,enabled:true}
  },
  notifications:{email:true,telegram:true,report:'21:00'},
  batches:[{id:'sample-batch',account:'stunning',title:'Cozy crochet ideas',total:12,mode:'no-link',topic:'Cozy crochet ideas',rows:[],rounds:2,perRound:6,refs:examples,brand:'Warm cream, soft terracotta, natural textures.',styleVersion:1,status:'ready',copies:1,date:'Today, 10:42',fingerprint:'sample'}],
  versions:[{id:'v3',title:'Posting times changed',detail:'4 pins a day · 08:00, 12:00, 16:00, 20:00',date:'Today, 09:10',account:'stunning',snapshot:{daily:4,hours:['08:00','12:00','16:00','20:00']}},{id:'v2',title:'Posting times changed',detail:'3 pins a day · 09:00, 14:00, 19:00',date:'Yesterday, 18:24',account:'stunning',snapshot:{daily:3,hours:['09:00','14:00','19:00']}}],
  runs:[{id:'run-1',time:'Today, 12:01',status:'success',summary:'2 pins posted',duration:'18s'},{id:'run-2',time:'Today, 11:02',status:'success',summary:'Nothing due yet',duration:'6s'},{id:'run-3',time:'Today, 10:01',status:'success',summary:'1 pin posted',duration:'14s'},{id:'run-4',time:'Yesterday, 17:03',status:'failed',summary:'Pinterest login expired',duration:'4s'}],
  members:[{id:'owner',name:'Houdaifa',email:'owner@example.com',status:'active',joined:'19 Oct 2026',last:'Now',autopilots:3,accounts:4,deployed:2,owner:true},{id:'salma',name:'Salma Bennani',email:'salma@example.com',status:'active',joined:'18 Oct 2026',last:'2 hours ago',autopilots:1,accounts:2,deployed:1},{id:'omar',name:'Omar',email:'omar@example.com',status:'active',joined:'18 Oct 2026',last:'Yesterday',autopilots:1,accounts:1,deployed:0},{id:'test',name:'New member',email:'member@example.com',status:'blocked',joined:'17 Oct 2026',last:'2 days ago',autopilots:0,accounts:0,deployed:0}],
  setup:{connected:false,telegram:false,telegramVerified:false,botStarted:false,logins:false,mismatch:false,name:'My autopilot',daily:4,deployed:false}
};
let state;
try { const saved=JSON.parse(localStorage.getItem(storageKey)); state=saved?.accounts?.stunning ? saved : clone(initial); } catch { state=clone(initial); }
let page = [], batchMode='links', batchAccount='stunning', historyTab='batches', toastTimer, dialogReturnFocus, busy=false, preparedBatch;
let builder={rows:[{url:'',count:6}],topic:'Cozy crochet ideas',count:12,rounds:2,perRound:6};
let pendingUndo, fieldSequence=0;

function persist() {
  try { localStorage.setItem(storageKey,JSON.stringify(state)); }
  catch { toast('Preview storage is full. Your current changes are still on this page.'); }
  document.documentElement.dataset.theme=state.theme;
}
function toast(message, undo) {
  clearTimeout(toastTimer);
  $('#toast').innerHTML=`<span>${esc(message)}</span>${undo?'<button data-action="undo">Undo</button>':''}`;
  $('#toast').classList.add('visible');
  pendingUndo=undo;
  toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),6000);
}
function button(label, action, data='', cls='') { return `<button type="button" class="${cls}" data-action="${action}" ${data}>${label}</button>`; }
function link(label, href, cls='') { return `<a class="button ${cls}" href="${href}">${label}</a>`; }
function status(text, type='') { return `<span class="status ${type}">${esc(text)}</span>`; }
function icon(symbol) { return `<span class="account-icon" aria-hidden="true">${symbol}</span>`; }
function title(heading, subtitle='', action='') { return `<div class="heading"><div><h1>${esc(heading)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${action}</div>`; }
function search(label, id) { return `<label class="search"><span class="sr-only">${label}</span><input type="search" id="${id}" placeholder="${label}…"></label>`; }
function field(label, input, hint='') {
  const id=input.match(/\bid="([^"]+)"/)?.[1]||'preview-field-'+(++fieldSequence);
  const described=hint?` aria-describedby="${id}-hint"`:'';
  const control=input.replace(/^<(input|select|textarea)(\s|>)/,(_,tag,end)=>`<${tag}${input.includes('id="'+id+'"')?'':` id="${id}"`}${described}${end}`);
  return `<div class="field"><label for="${id}">${label}</label>${control}${hint?`<p id="${id}-hint" class="hint">${hint}</p>`:''}</div>`;
}
function options(values,current) { return values.map(v=>`<option${v===current?' selected':''}>${esc(v)}</option>`).join(''); }
function refsStrip(refs) { return `<div class="reference-strip">${refs.map(r=>`<div class="reference-thumb"><img src="${esc(r.src)}" alt="${esc(r.name)}"></div>`).join('')}</div>`; }
function currentAutopilot() { return state.autopilots.find(a=>a.id===page[1]) || state.autopilots[1] || state.autopilots[0]; }
function autopilotForAccount(id) { return state.autopilots.find(a=>a.accounts.includes(id)) || state.autopilots[1] || state.autopilots[0]; }
function accountOptions(selected) { return Object.entries(state.accounts).map(([id,a])=>`<option value="${id}"${id===selected?' selected':''}>${esc(a.name)} · @${esc(a.handle)}</option>`).join(''); }
function header(active='overview',autopilot) {
  const nav=autopilot?['Overview','Accounts','New pins','Runs','History','Settings']:['Overview','New pins','History','Settings','Admin'];
  return `<header><div class="top"><a class="brand-mark" href="#overview" aria-label="Autopilot home">${mark}</a><span class="slash" aria-hidden="true">/</span><a class="workspace" href="#overview">${autopilot?esc(autopilot.name):'Houdaifa’s autopilots'}</a><span class="badge">Free</span><div class="top-right">${button('Help','help','', 'quiet')}<a class="avatar" href="#settings" aria-label="Your profile">H</a></div></div><nav class="tabs" aria-label="${autopilot?'Autopilot':'Main'} navigation">${nav.map(n=>{const slug=n.toLowerCase().replace(' ','-');return `<a href="#${autopilot?`autopilot/${autopilot.id}/`:''}${slug}"${active===slug?' aria-current="page"':''}>${n}</a>`;}).join('')}</nav></header>`;
}
function wizardHeader(step) {
  return `<header><div class="top"><a class="brand-mark" href="#overview" aria-label="Autopilot home">${mark}</a><span class="workspace">Autopilot</span>${step>1?'<span class="slash" aria-hidden="true">/</span><span class="muted small">Setup</span>':''}<div class="top-right">${step>1?link('Save & exit','#overview'):''}${button('Help','setup-help','','quiet')}</div></div></header>`;
}
function draftBar() {
  if(!state.draft)return '';
  return `<aside class="draft-bar" aria-label="Draft changes"><div><b>Changes ready</b><p>Draft saved. Apply to make it live.</p></div><div class="actions">${button('Undo','discard-draft','','quiet')}${button('Review & apply','review-apply','','primary')}</div></aside>`;
}
function saveDraft(account, note) {
  if(!state.draft)state.draftSnapshot={accounts:clone(state.accounts),notifications:clone(state.notifications),autopilots:clone(state.autopilots)};
  state.draft=true;state.draftFor=autopilotForAccount(account).id;
  if(!state.draftNotes.includes(note))state.draftNotes.push(note);
  persist();
  const old=$('.draft-bar'); if(old)old.remove();
  $('#app').insertAdjacentHTML('beforeend',draftBar());
}
function overview(empty=false) {
  const active=state.autopilots.filter(a=>a.status!=='setup');
  const needs=state.autopilots.find(a=>a.status==='needs');
  return `${header()}<main id="main-content">${title('Your autopilots','See what’s posting and what needs you.',link('＋ Add autopilot','#setup/2','primary'))}${empty?`<section class="panel empty">${icon('↻')}<h2>Your first autopilot starts here</h2><p>Connect your accounts once. We’ll guide you through the rest.</p>${link('Set up my autopilot','#setup/2','primary')}</section>`:`${needs?`<section class="notice warning" aria-label="Needs you"><span class="notice-icon">!</span><div><strong>${esc(needs.name)} needs new pins</strong><p>hdrahm and crochet have no pins left.</p></div>${link('Make new pins →','#autopilot/main/new-pins','primary')}</section>`:''}<div class="dashboard"><section class="panel stats"><h2>Last 24 hours</h2><div class="numbers">${[['Pins posted',active.reduce((n,a)=>n+a.posted,0)],['Pins waiting',active.reduce((n,a)=>n+a.waiting,0)],['Next post','15:00'],['Errors','0']].map(([k,v])=>`<div class="number"><span>${k}</span><b>${v}</b></div>`).join('')}</div><p class="stats-foot">Next post: Stunning Crochet.<br>Times in Africa/Casablanca.</p></section><section aria-label="Autopilots"><div class="section-heading"><h2>Autopilots <span class="count">${state.autopilots.length}</span></h2>${search('Search autopilots','autopilot-search')}</div><div class="cards" id="autopilot-cards">${state.autopilots.map(autopilotCard).join('')}</div><p id="no-autopilots" class="hint" hidden>No matching autopilots.</p></section></div>`}</main>`;
}
function autopilotCard(a) {
  const label=a.status==='running'?`Running · ${a.waiting} waiting`:a.status==='needs'?'Needs pins':a.status==='setup'?'Setup · step 4 of 6':'Paused';
  return `<article class="card" data-search="${esc((a.name+' '+a.accounts.join(' ')).toLowerCase())}"><div class="card-body"><div class="identity">${icon(a.icon)}<div><h3>${esc(a.name)}</h3><div class="handle">${esc(a.accounts.map(id=>state.accounts[id].handle).join(' · '))}</div></div></div>${status(label,a.status==='needs'?'warning':a.status==='running'?'':'neutral')}<p class="detail">${a.status==='setup'?'Not live yet':`Last post <span class="mono">${a.last}</span>`}</p></div><div class="card-footer"><span>${esc(a.category)}</span>${link(a.status==='setup'?'Continue setup →':'Open →',a.status==='setup'?'#setup/4':`#autopilot/${a.id}/overview`)}</div></article>`;
}
function autopilotOverview(a) {
  const running=a.status==='running';
  return `${header('overview',a)}<main id="main-content">${title(a.name,running?'Your next post is at 15:00.':a.status==='needs'?'Add pins to get your next post ready.':'Resume when you’re ready to post.',`<div class="actions">${button(running?'Pause':'Resume','toggle-autopilot',`data-id="${a.id}"`)}${button('Run now','run-now',`data-id="${a.id}"`,'primary')}</div>`)}${a.status==='needs'?`<section class="notice warning"><div><strong>Your queue is empty</strong><p>Add pins so your next posting time is ready.</p></div>${link('Make new pins',`#autopilot/${a.id}/new-pins`,'primary')}</section>`:`<section class="notice ${running?'success':''}"><div>${status(running?'Your autopilot is running':'Your autopilot is paused',running?'':'neutral')}<p>${running?'We’ll post from your queue at your saved times.':'Your waiting pins are safe. Resume when you’re ready.'}</p></div>${link('New pins',`#autopilot/${a.id}/new-pins`)}</section>`}<div class="metrics">${[['Posted today',a.posted],['Waiting',a.waiting],['Next post',running?'15:00':'—'],['Needs fixing','0']].map(([k,v])=>`<div class="metric"><span>${k}</span><b class="mono">${v}</b></div>`).join('')}</div><div class="two-col"><section class="panel"><div class="panel-heading"><h2>Pinterest accounts</h2>${link('Manage',`#autopilot/${a.id}/accounts`)}</div>${a.accounts.map(id=>`<div class="subtle-row"><div class="mini-account">${icon('🧶')}<div><strong>${esc(state.accounts[id].name)}</strong><p>${state.accounts[id].daily} pins a day · @${esc(state.accounts[id].handle)}</p></div></div>${status(state.accounts[id].enabled?'On':'Off',state.accounts[id].enabled?'':'neutral')}</div>`).join('')}</section><section class="panel"><h2>Latest run</h2>${status('Finished')}<p class="mt">2 pins posted</p><p class="hint">Today, 12:01 · 18 seconds</p>${link('See runs →',`#autopilot/${a.id}/runs`,'full-width mt')}</section></div></main>${draftBar()}`;
}
function accountsPage(a) {
  return `${header('accounts',a)}<main id="main-content">${title('Pinterest accounts','Each account keeps its own schedule and style.',button('Check for new accounts','detect-accounts'))}<div class="cards">${a.accounts.map(id=>{const c=state.accounts[id];return `<article class="card"><div class="card-body"><div class="split"><div class="identity">${icon('🧶')}<div><h3>${esc(c.name)}</h3><div class="handle">@${esc(c.handle)}</div></div></div><label class="check"><span class="sr-only">Posting for ${esc(c.name)}</span><input class="switch" type="checkbox" data-account-enabled="${id}"${c.enabled?' checked':''}></label></div><div class="mt">${status(c.enabled?'Posting on':'Posting off',c.enabled?'':'neutral')}</div><div class="subtle-row mt"><div><strong>${c.daily} pins a day</strong><p>${esc(c.hours.join(' · '))}</p></div>${button('Edit','edit-account',`data-id="${id}"`)}</div><div class="subtle-row"><div><strong>Pin style</strong><p>${c.refs.length?`${c.refs.length} reference pins · style ${c.styleVersion}`:'Add your examples or describe your style'}</p></div>${link('Edit style',`#style/${id}`)}</div>${refsStrip(c.refs)}<p class="hint mt">${esc(c.category)} · ${c.source==='website'?'From your website':'Niche ideas'}</p></div></article>`;}).join('')}</div><p class="hint mt">New Pinterest logins in Activepieces appear here after a check.</p></main>${draftBar()}`;
}
function stylePage(id) {
  const c=state.accounts[id]||state.accounts.stunning,a=autopilotForAccount(id);
  return `${header('accounts',a)}<main id="main-content" class="narrow"><a class="back-link" href="#autopilot/${a.id}/accounts">← Accounts</a>${title('Your pin style',c.name+' · @'+c.handle)}<section class="panel"><div class="panel-heading"><h2>Show us your style</h2><span class="badge">Style ${c.styleVersion}</span></div><p class="muted">Add pins you like. We’ll keep the feel and bring variety.</p><div class="reference-grid">${c.refs.map((r,i)=>`<figure><img src="${esc(r.src)}" alt="${esc(r.name)}"><figcaption><span>${r.example?'Example '+(i+1):esc(r.name)}</span>${button('Remove','remove-ref',`data-id="${id}" data-index="${i}"`)}</figcaption></figure>`).join('')}</div><div class="upload-zone" id="upload-zone" data-account="${id}"><strong>Add your reference pins</strong><p>Drop images here, or choose files.<br>Preview limit: 6 images, 5 MB each.</p><label class="button" for="reference-upload">＋ Choose images</label><input class="sr-only" id="reference-upload" type="file" multiple accept="image/png,image/jpeg,image/webp" data-account="${id}"></div>${field('What should we keep? <span class="muted small">Optional</span>',`<textarea id="style-notes" data-account="${id}" placeholder="Colors, mood, lettering…">${esc(c.brand)}</textarea>`,'You can leave this empty and let your examples lead.')}<div class="style-summary"><strong>Same identity. Fresh ideas.</strong><p>Keep your colors and feel. Vary layouts, scenes and headlines. Check current trends and avoid repeating your recent pins.</p></div><p class="hint mt">The illustrated pins above are examples. Add your own references for your account.</p></section><p class="hint mt">Draft saves on this device in the preview. Apply makes changes live in the finished product.</p></main>${draftBar()}`;
}
function batchTotal() { return batchMode==='links'?builder.rows.reduce((n,r)=>n+Number(r.count||0),0):batchMode==='no-link'?Number(builder.count||0):Number(builder.rounds||0)*Number(builder.perRound||0); }
function newPinsPage(a) {
  if(a && !a.accounts.includes(batchAccount))batchAccount=a.accounts[0];
  const c=state.accounts[batchAccount],total=batchTotal();
  return `${header('new-pins',a)}<main id="main-content">${title('Make new pins','Choose what to make. Your saved style comes with it.')}<div class="two-col"><section class="panel">${field('Pinterest account',`<select id="batch-account">${a?a.accounts.map(id=>`<option value="${id}"${id===batchAccount?' selected':''}>${esc(state.accounts[id].name)} · @${esc(state.accounts[id].handle)}</option>`).join(''):accountOptions(batchAccount)}</select>`)}<div class="segmented" aria-label="Pin source">${[['links','Page links'],['no-link','Without links'],['website','My website']].map(([mode,label])=>button(label,'batch-mode',`data-mode="${mode}" aria-pressed="${batchMode===mode}"`)).join('')}</div><div id="batch-fields">${batchMode==='links'?`<p class="hint">Add a page and choose how many pins to make for it.</p><div id="batch-rows">${builder.rows.map((r,i)=>`<div class="batch-row">${field('Page link',`<input type="url" data-row="${i}" data-kind="url" value="${esc(r.url)}" placeholder="https://your-site.com/page">`)}${field('Pins',`<input type="number" min="1" max="60" data-row="${i}" data-kind="count" value="${r.count}">`)}${button('<span aria-hidden="true">×</span>','remove-link',`data-index="${i}" aria-label="Remove link ${i+1}"${builder.rows.length===1?' disabled':''}`)}</div>`).join('')}</div>${button('＋ Add another link','add-link')}`:batchMode==='no-link'?`${field('What should the pins be about?',`<input id="batch-topic" value="${esc(builder.topic)}" placeholder="Cozy crochet ideas">`)}${field('How many pins?',`<input id="batch-count" type="number" min="1" max="60" value="${builder.count}">`)}`:`${field('Your website',`<input id="batch-website" type="url" value="${esc(c.site)}" placeholder="https://your-site.com">`)}<div class="form-row">${field('Next rounds',`<input id="batch-rounds" type="number" min="1" max="10" value="${builder.rounds}">`)}${field('Pins per round',`<input id="batch-per-round" type="number" min="1" max="12" value="${builder.perRound}">`)}</div><p class="hint mt">Continue your saved plan with fresh products and ideas.</p>`}</div></section><aside class="stack"><section class="panel"><h2>Your batch</h2><div class="subtle-row"><span>New pins</span><strong class="mono" id="batch-total">${total}</strong></div><div class="subtle-row"><span>About</span><strong id="batch-days">${Math.ceil(total/c.daily)} days of posts</strong></div><div class="mt">${button('Prepare batch →','prepare-batch','','primary full-width')}</div><p class="hint">You’ll create the pins with your prompt, then review them before posting.</p></section><section class="panel"><div class="panel-heading"><h2>Your saved style</h2><a class="text-link small" href="#style/${batchAccount}">Edit</a></div>${c.refs.length?`<p class="hint">Uses ${c.refs.length} reference pins · style ${c.styleVersion}</p>${refsStrip(c.refs)}`:`<p class="hint">${esc(c.brand||'A new style will be created for this account.')}</p>`}<p class="hint mt">A consistent look, with different layouts and ideas.</p></section></aside></div></main>`;
}
function historyPage(a) {
  const batches=state.batches.filter(b=>!a||a.accounts.includes(b.account));
  const versions=state.versions.filter(v=>!a||a.accounts.includes(v.account));
  return `${header('history',a)}<main id="main-content">${title('History','Your batches and changes, easy to find again.')}<div class="segmented" aria-label="History type">${button('Pin batches','history-tab','data-tab="batches" aria-pressed="'+(historyTab==='batches')+'"')}${button('Setup changes','history-tab','data-tab="versions" aria-pressed="'+(historyTab==='versions')+'"')}</div><section class="panel" style="padding:0">${historyTab==='batches'?batches.length?batches.map(b=>`<article class="history-card">${icon('▧')}<div><div class="label-line"><h3 class="mb0">${esc(b.title)}</h3><span class="badge">${b.total} pins</span></div><p>${esc(state.accounts[b.account].name)} · ${esc(b.date)}<br>Style ${b.styleVersion} · copied ${b.copies}×${b.refs.length?` · ${b.refs.length} images`:''}</p><div class="actions">${button('Copy again','copy-batch',`data-id="${b.id}"`)}${button(b.status==='sent'?'Marked as sent':'Mark as sent','mark-sent',`data-id="${b.id}"${b.status==='sent'?' disabled':''}`)}${button('Make similar','similar-batch',`data-id="${b.id}"`)}${button('Delete','delete-batch',`data-id="${b.id}"`,'quiet danger')}</div></div>${status(b.status==='sent'?'Sent':'Ready',b.status==='sent'?'':'neutral')}</article>`).join(''):`<div class="empty"><h2>Your batches will appear here</h2><p>Copying a batch again updates the same entry.</p>${link('Make new pins',a?`#autopilot/${a.id}/new-pins`:'#new-pins','primary')}</div>`:versions.map(v=>`<article class="history-card">${icon('↻')}<div><h3>${esc(v.title)}</h3><p>${esc(v.detail)}<br>${esc(v.date)}</p></div>${button('Restore','restore-version',`data-id="${v.id}"`)}</article>`).join('')}</section></main>${draftBar()}`;
}
function runsPage(a) {
  return `${header('runs',a)}<main id="main-content">${title('Runs','See what happened, in plain words.',button('Run now','run-now',`data-id="${a.id}"`,'primary'))}<div class="table-toolbar"><p class="hint mb0">Times in Africa/Casablanca</p><label><span class="sr-only">Filter runs</span><select id="run-filter"><option value="all">All runs</option><option value="success">Finished</option><option value="failed">Needs fixing</option></select></label></div><div class="table-wrap"><table><thead><tr><th>When</th><th>Result</th><th>What happened</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${state.runs.map(r=>`<tr data-run-status="${r.status}"><td class="mono">${esc(r.time)}</td><td>${status(r.status==='failed'?'Needs fixing':'Finished',r.status==='failed'?'error':'')}</td><td>${esc(r.summary)}<p>${r.duration}</p></td><td>${button(r.status==='failed'?'Fix':'View','run-detail',`data-id="${r.id}"`)}</td></tr>`).join('')}</tbody></table></div></main>`;
}
function settingsPage(a) {
  return `${header('settings',a)}<main id="main-content" class="narrow">${title(a?'Autopilot settings':'Your settings',a?'Saved as a draft until you apply.':'Your profile and preferences.')}<section class="panel">${a?`<div class="settings-group"><div><h2>Notifications</h2><p>Choose where updates go.</p></div><div><div class="switch-row"><div><strong>Email reports</strong><p>Your connected Gmail account</p></div><label><span class="sr-only">Email reports</span><input type="checkbox" class="switch" data-notification="email"${state.notifications.email?' checked':''}></label></div><div class="switch-row"><div><strong>Telegram</strong><p>Connected · @example_bot</p></div><label><span class="sr-only">Telegram reports</span><input type="checkbox" class="switch" data-notification="telegram"${state.notifications.telegram?' checked':''}></label></div>${field('Daily report time',`<input type="time" id="report-time" value="${state.notifications.report}">`)}</div></div><div class="settings-group"><div><h2>Connected logins</h2><p>Names only. No technical IDs.</p></div><div>${field('Google Sheets',`<select class="draft-setting"><option>Example Google account · Connected</option></select>`)}${field('Gmail',`<select class="draft-setting"><option>Example Google account · Connected</option></select>`)}${button('Check connections','detect-accounts')}</div></div><div class="settings-group"><div><h2>Time zone</h2><p>All posting times use this.</p></div><div>${field('Time zone',`<select id="autopilot-zone">${options(['Africa/Casablanca','Europe/Paris','America/New_York'],a.zone||'Africa/Casablanca')}</select>`)}</div></div><div class="settings-group"><div><h2>Autopilot</h2><p>You can pause at any time.</p></div><div class="actions">${button(a.status==='paused'?'Resume autopilot':'Pause autopilot','toggle-autopilot',`data-id="${a.id}"`)}${button('Delete autopilot','delete-autopilot',`data-id="${a.id}"`,'danger')}</div></div>`:`<div class="settings-group"><div><h2>Profile</h2><p>Signed in with Google.</p></div><div><strong>Houdaifa</strong><p class="hint">owner@example.com · Example profile</p>${button('Sign out','sign-out')}</div></div><div class="settings-group"><div><h2>Appearance</h2><p>Choose what feels comfortable.</p></div><div>${field('Appearance',`<select id="theme"><option value="auto"${state.theme==='auto'?' selected':''}>Match device</option><option value="light"${state.theme==='light'?' selected':''}>Light</option><option value="dark"${state.theme==='dark'?' selected':''}>Dark</option></select>`)}</div></div><div class="settings-group"><div><h2>Language</h2><p>One language at a time.</p></div><div>${field('Language','<select id="language"><option>English</option><option disabled>Français — preview to follow</option><option disabled>العربية — preview to follow</option></select>','This review covers the English journey. French and Arabic follow in the build.')}</div></div><div class="settings-group"><div><h2>Your account</h2><p>You control your website data.</p></div><div>${button('Delete my website account','delete-website-account','','danger')}<p class="hint">Your Google and Pinterest accounts are separate.</p></div></div>`}</section></main>${a?draftBar():''}`;
}
function adminPage() {
  return `${header('admin')}<main id="main-content">${title('Members','Review who has access to the website.')}<div class="metrics">${[['Members',state.members.length],['Active',state.members.filter(m=>m.status==='active').length],['Blocked',state.members.filter(m=>m.status==='blocked').length],['Live autopilots',state.members.reduce((n,m)=>n+m.deployed,0)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b class="mono">${v}</b></div>`).join('')}</div><div class="table-toolbar">${search('Search members','member-search')}<label><span class="sr-only">Filter members</span><select id="member-filter"><option value="all">All members</option><option value="active">Active</option><option value="blocked">Blocked</option></select></label></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Member</th><th>Access</th><th class="hide-phone">Autopilots</th><th class="hide-phone">Last active</th><th><span class="sr-only">Review</span></th></tr></thead><tbody>${state.members.map(m=>`<tr data-member="${m.id}" data-search="${esc((m.name+' '+m.email).toLowerCase())}" data-member-status="${m.status}"><td><strong>${esc(m.name)}${m.owner?' <span class="badge">You</span>':''}</strong><p>${esc(m.email)}</p></td><td>${status(m.status==='active'?'Active':'Blocked',m.status==='active'?'':'neutral')}</td><td class="hide-phone">${m.autopilots}<p>${m.accounts} Pinterest accounts · ${m.deployed} live</p></td><td class="hide-phone">${esc(m.last)}</td><td>${button('Review','member-detail',`data-id="${m.id}"`)}</td></tr>`).join('')}</tbody></table></div><p class="hint mt">Only the owner can see this page. All members shown here are fictional.</p></main>`;
}
function setupPage(step) {
  const s=state.setup;
  const names=['Google sign-in','Activepieces','Notifications','Connect logins','Pinterest accounts','Go live'];
  if(step===1)return `${wizardHeader(step)}<main id="main-content"><section class="login"><span class="brand-mark">${mark}</span><h1>Your pins.<br>On autopilot.</h1><p>A little setup. More time for what you love.</p>${button('<span class="google-mark" aria-hidden="true">G</span> Continue with Google','google-signin','','primary')}<p class="hint mt">Anyone with a Google account can join.</p><p class="privacy">See how we use your information in our <a class="text-link" href="#privacy">privacy notice</a>.</p></section></main>`;
  let content='';
  if(step===2)content=`<h1>Connect Activepieces</h1><p class="wizard-intro">One key connects your automation workspace.</p><section class="panel"><details><summary>Where do I find my key? <span aria-hidden="true">↗</span></summary><ol><li>Open Activepieces → Platform → API keys.</li><li>Create a key called “Autopilot website”.</li><li>Copy it and paste it below.</li></ol><a class="text-link" href="https://cloud.activepieces.com/platform/api-keys" target="_blank" rel="noreferrer">Open API keys ↗</a></details>${field('Activepieces API key','<input id="setup-key" type="password" autocomplete="off" placeholder="Use a sample key in this preview">','Preview only. Do not enter a real key here.')}<div class="actions">${button('Use sample key','sample-key')}${button('Connect','verify-key','','primary')}</div>${s.connected?`<div class="notice success mt mb0"><div>${status('Connected to Hdrahm’s Platform')}<p>We found your workspace and connected accounts.</p></div></div>`:''}</section>`;
  if(step===3)content=`<h1>Stay in the loop</h1><p class="wizard-intro">Get a short update when your pins are posted.</p><section class="panel"><div class="switch-row"><div><strong>Email reports</strong><p>On · Your connected Gmail account</p></div>${status('Ready')}</div><div class="switch-row"><div><strong>Also use Telegram</strong><p>Optional. You can add it later.</p></div><label><span class="sr-only">Also use Telegram</span><input id="setup-telegram" class="switch" type="checkbox"${s.telegram?' checked':''}></label></div>${s.telegram?`<div class="mt">${field('Bot token','<input id="setup-bot-token" type="password" placeholder="Sample token only" autocomplete="off">','Get a bot from @BotFather, then paste its token.')}<div class="actions">${button('Use sample token','sample-token')}${button('Connect bot','verify-bot','','primary')}</div>${s.telegramVerified?`<div class="notice success mt mb0"><div>${status('Bot connected')}<p>${s.botStarted?'Your test message is ready in this preview.':'Open the bot and tap Start so it can reach you.'}</p></div></div><div class="mt">${button(s.botStarted?'Test message preview':'Open bot & tap Start','start-bot')}</div>`:''}</div>`:''}</section>`;
  if(step===4)content=`<h1>Connect your logins</h1><p class="wizard-intro">Sign in once. This checklist updates for you.</p><section class="panel"><ul class="list check-list">${[['Google Sheets','Example Google account'],['Gmail',s.mismatch?'Different Google account':'Example Google account'],['Pinterest','@stunningcrochet']].map(([n,d])=>`<li><span class="tick ${!s.logins?'pending':''}">${s.logins?'✓':'○'}</span><div><strong>${n}</strong><p>${s.logins?d:'Waiting for your login'}</p></div>${status(s.logins?'Connected':'Not connected',s.logins?'':'neutral')}</li>`).join('')}</ul>${s.mismatch?`<div class="notice warning mt"><div><strong>Use the same Google account</strong><p>Gmail and Sheets need to belong to your bot account.</p></div></div>${button('Fix Google login','fix-google','','primary')}`:`<div class="mt">${button(s.logins?'Check again':'Connect in Activepieces','setup-logins','','primary')}</div>`}</section><p class="hint mt">We only use these logins for your automation.</p>${button('Preview a login mismatch','preview-mismatch','','quiet small')}`;
  if(step===5)content=`<h1>Your Pinterest account</h1><p class="wizard-intro">A few defaults. You can change them any time.</p><section class="panel">${field('Autopilot name',`<input id="setup-name" value="${esc(s.name)}">`)}<div class="identity mb0">${icon('🧶')}<div><strong>Stunning Crochet</strong><p class="hint">@stunningcrochet · Detected from Pinterest</p></div></div><div class="form-row mt">${field('Pins per day',`<select id="setup-daily">${[2,3,4,6].map(n=>`<option value="${n}"${s.daily===n?' selected':''}>${n} pins</option>`).join('')}</select>`)}${field('Category','<select><option>Crochet & knitting</option><option>Food & recipes</option><option>Home & garden</option><option>Printables</option><option>Other</option></select>')}</div><p class="hint mt">Spread evenly through your day. Africa/Casablanca.</p><div class="style-summary"><strong>Have a pin style in mind?</strong><p>Add your reference images after setup.</p></div></section>`;
  if(step===6)content=s.deployed?`<section class="panel deployment-success"><div class="success-mark">✓</div><h1>You’re ready for your first pins</h1><p>Your autopilot is set up. Let’s fill your queue.</p><div class="actions">${link('Make my first pins','#autopilot/stunning/new-pins','primary')}${button('Open spreadsheet','spreadsheet-preview')}</div><p class="hint mt">One more thing: connect your content workspace to the bot’s Google Drive.</p></section>`:`<h1>Ready to go live?</h1><p class="wizard-intro">Review once. We’ll handle the setup.</p><section class="panel"><div class="subtle-row"><div><strong>${esc(s.name)}</strong><p>@stunningcrochet</p></div><a class="text-link small" href="#setup/5">Edit</a></div><div class="subtle-row"><div><strong>${s.daily} pins a day</strong><p>Spread evenly · Africa/Casablanca</p></div></div><div class="subtle-row"><div><strong>Email${s.telegram?' + Telegram':''} reports</strong><p>Daily at 21:00</p></div><a class="text-link small" href="#setup/3">Edit</a></div><div class="subtle-row"><div><strong>Logins checked</strong><p>Google Sheets, Gmail and Pinterest</p></div><span class="tick">✓</span></div></section><p class="hint mt">First setup may take a few minutes. We’ll show each step.</p>`;
  const ready=step===2?s.connected:step===3?!s.telegram||(s.telegramVerified&&s.botStarted):step===4?s.logins&&!s.mismatch:true;
  return `${wizardHeader(step)}<main id="main-content" class="wizard"><ol class="wizard-steps">${names.map((n,i)=>`<li class="${i+1===step?'current':i+1<step?'done':''}"><span class="step-number">${i+1<step?'✓':i+1}</span>${n}</li>`).join('')}</ol><div><p class="step-label">Step ${step} of 6 · Progress saved in this preview</p>${content}${!s.deployed||step!==6?`<div class="wizard-footer">${link('← Back',`#setup/${step-1}`)}${step===6?button('Deploy autopilot','deploy','','primary'):button('Continue →','setup-next',`data-step="${step}"${ready?'':' disabled'}`,'primary')}${!ready?`<p class="hint">${step===2?'Connect your key to continue.':step===3?'Connect your bot and tap Start to continue.':'Connect all three logins with the same Google account.'}</p>`:''}</div>`:''}</div></main>`;
}
function privacyPage() {
  return `${wizardHeader(1)}<main id="main-content" class="privacy-copy"><a href="#setup/1" class="back-link">← Sign in</a><h1>Your privacy</h1><p>This is a preview of the privacy screen. The final notice needs review before launch.</p><h2>Google sign-in</h2><p>We request your name, email and profile picture to create your website account. Google sign-in does not grant access to your Drive or Gmail.</p><h2>Your automation</h2><p>Your Activepieces key connects your own automation workspace. The finished website will encrypt it and keep it on the server. Other members cannot access your setup.</p><h2>Your pin references</h2><p>Your reference images belong to your account. Private storage and image delivery will be verified before launch.</p><h2>Control your data</h2><p>You can remove your website account from Settings. Google and Pinterest accounts remain separate. Contact and retention details will be added before launch.</p></main>`;
}
function render() {
  page=(location.hash.slice(1)||'overview').split('/');
  let html;
  const a=page[0]==='autopilot'?currentAutopilot():undefined;
  const tab=page[2]||'overview';
  if(page[0]==='setup')html=setupPage(Math.min(6,Math.max(1,Number(page[1])||1)));
  else if(page[0]==='style')html=stylePage(Object.hasOwn(state.accounts,page[1])?page[1]:'stunning');
  else if(page[0]==='privacy')html=privacyPage();
  else if(page[0]==='empty')html=overview(true);
  else if(page[0]==='admin')html=adminPage();
  else if(a)html=tab==='accounts'?accountsPage(a):tab==='new-pins'?newPinsPage(a):tab==='runs'?runsPage(a):tab==='history'?historyPage(a):tab==='settings'?settingsPage(a):autopilotOverview(a);
  else html=page[0]==='new-pins'?newPinsPage():page[0]==='history'?historyPage():page[0]==='settings'?settingsPage():overview();
  $('#app').innerHTML=html;
  $('#main-content').tabIndex=-1;
  document.documentElement.dataset.theme=state.theme;
  document.title=`${$('h1')?.textContent||'Autopilot'} — clickable preview`;
  window.scrollTo(0,0);
}
function modal(heading, body, actions='') {
  const d=$('#dialog');
  if(!d.open)dialogReturnFocus=document.activeElement;
  d.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${heading}</h2>${button('×','close-dialog','aria-label="Close dialog"')}</div><div class="dialog-body">${body}${actions?`<div class="dialog-actions">${actions}</div>`:''}</div>`;
  if(!d.open)d.showModal();
}
function closeModal() { if(busy)return;$('#dialog').close();if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus(); }
function safeNumber(value,min=1,max=60) { return Math.min(max,Math.max(min,Math.trunc(Number(value)||min))); }
function isWebUrl(value) {try { return ['https:','http:'].includes(new URL(value).protocol); } catch {return false;} }
function promptFor(b) {
  return `Create ${b.total} original Pinterest pins for ${state.accounts[b.account].name} (@${state.accounts[b.account].handle}).\n\nAccount: ${b.account}. Use only this account.\nBatch: ${b.title}.\n${b.mode==='links'?b.rows.map(r=>r.url+' — '+r.count+' pins').join('\n'):b.mode==='website'?`${b.rounds} rounds, ${b.perRound} pins per round. Website: ${b.website}`:`Topic: ${b.topic}. Pins without destination links.`}\n\nSTYLE VERSION ${b.styleVersion}\n${b.brand}\n${b.refs.length?`Open these attached reference images before planning: ${b.refs.map(r=>r.name).join(', ')}. If any cannot be read, stop and ask for the missing attachment.`:'Develop a clear, recognizable style for this account.'}\n\nKeep the palette, mood and brand details. Vary scenes, layout, crop and headline structure. Do not copy a complete reference composition. Use at least ${Math.min(b.total,5)} distinct formats when the batch size allows.\n\nResearch current relevant trends and record source links and dates. If research is unavailable, say so. Check the recent profile and queued pins to avoid duplicates. Do not change the core identity just because a trend is popular.\n\nPreview the batch for visual review before posting. This prototype package demonstrates reference handoff only; it is not a live spreadsheet instruction or the final production prompt.`;
}
function readBuilder() {
  const selected=$('#batch-account');if(selected)batchAccount=selected.value;
  document.querySelectorAll('[data-row]').forEach(el=>{builder.rows[Number(el.dataset.row)][el.dataset.kind]=el.dataset.kind==='count'?safeNumber(el.value):el.value.trim();});
  if($('#batch-topic'))builder.topic=$('#batch-topic').value.trim();
  if($('#batch-count'))builder.count=safeNumber($('#batch-count').value);
  if($('#batch-rounds'))builder.rounds=safeNumber($('#batch-rounds').value,1,10);
  if($('#batch-per-round'))builder.perRound=safeNumber($('#batch-per-round').value,1,12);
  if($('#batch-website'))state.accounts[batchAccount].site=$('#batch-website').value.trim();
}
function prepareBatch() {
  readBuilder();
  if(batchMode==='links'&&builder.rows.some(r=>!isWebUrl(r.url)))return toast('Add a complete page link, starting with https://.');
  if(batchMode==='website'&&!isWebUrl(state.accounts[batchAccount].site))return toast('Add your website link, starting with https://.');
  if(batchMode==='no-link'&&!builder.topic)return toast('Add a topic for your pins.');
  const c=state.accounts[batchAccount];
  const b={account:batchAccount,total:batchTotal(),mode:batchMode,topic:builder.topic,rows:clone(builder.rows),rounds:builder.rounds,perRound:builder.perRound,website:c.site,refs:clone(c.refs),brand:c.brand,styleVersion:c.styleVersion};
  b.title=batchMode==='links'?`${b.total} pins from page links`:batchMode==='website'?`${b.rounds} website rounds`:b.topic;
  b.fingerprint=JSON.stringify(b);
  preparedBatch=state.batches.find(x=>x.fingerprint===b.fingerprint)||{...b,id:'batch-'+Date.now(),status:'ready',copies:0,date:'Just now'};
  batchModal(preparedBatch);
}
function batchModal(b) {
  preparedBatch=b;
  modal('Your batch is ready',`<p>${b.total} pins for ${esc(state.accounts[b.account].name)}${b.refs.length?` · ${b.refs.length} reference images`:''}.</p>${refsStrip(b.refs)}${b.refs.length?`<div class="style-summary"><strong>Take the images with your prompt</strong><p>Download the package, unzip it, and attach its files in your content workspace.</p></div>`:'<p>Your written style is included in the prompt.</p>'}<p class="hint mt">Preview package only. Private automatic delivery will be checked during the real build.</p>`,`${button('Copy prompt','copy-prepared')}${button('Download prompt + images','download-package','','primary')}`);
}
function recordBatch(b,copied=false) {
  let entry=state.batches.find(x=>x.id===b.id||x.fingerprint===b.fingerprint);
  if(!entry){entry=clone(b);state.batches.unshift(entry);}
  if(copied)entry.copies++;
  persist();return entry;
}
async function copyBatch(b) {
  try { await navigator.clipboard.writeText(promptFor(b));recordBatch(b,true);toast(b.refs.length?'Prompt copied. Attach the reference images too.':'Prompt copied.'); }
  catch { modal('Copy your prompt',`<p>Your browser could not copy it. Select the text below.</p><textarea readonly rows="9" aria-label="Your prompt">${esc(promptFor(b))}</textarea>`); }
}
function crc32(bytes) { let c=-1;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^-1)>>>0; }
function zipStore(files) {
  const chunks=[],central=[];let offset=0,centralSize=0;
  const header=(n)=>{const a=new Uint8Array(n);return {a,v:new DataView(a.buffer)};};
  for(const file of files){
    const name=new TextEncoder().encode(file.name),data=file.bytes,crc=crc32(data);
    const h=header(30);h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,name.length,true);
    chunks.push(h.a,name,data);
    const d=header(46);d.v.setUint32(0,0x02014b50,true);d.v.setUint16(4,20,true);d.v.setUint16(6,20,true);d.v.setUint16(8,0x800,true);d.v.setUint32(16,crc,true);d.v.setUint32(20,data.length,true);d.v.setUint32(24,data.length,true);d.v.setUint16(28,name.length,true);d.v.setUint32(42,offset,true);central.push(d.a,name);centralSize+=46+name.length;offset+=30+name.length+data.length;
  }
  const end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,centralSize,true);end.v.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end.a],{type:'application/zip'});
}
async function downloadPackage(b) {
  try {
    const encode=text=>new TextEncoder().encode(text);
    const manifest={preview:true,account:b.account,styleVersion:b.styleVersion,references:b.refs.map(r=>r.name),batch:b.title,total:b.total};
    const files=[{name:'prompt.txt',bytes:encode(promptFor(b))},{name:'manifest.json',bytes:encode(JSON.stringify(manifest,null,2))}];
    for(const r of b.refs){const response=await fetch(r.src);if(!response.ok)throw new Error('Missing image');files.push({name:r.name.replace(/[^a-zA-Z0-9._-]/g,'_'),bytes:new Uint8Array(await response.arrayBuffer())});}
    const url=URL.createObjectURL(zipStore(files));const a=document.createElement('a');a.href=url;a.download=`autopilot-${b.account}-style-${b.styleVersion}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    recordBatch(b);toast('Package downloaded. Unzip and attach its files with your prompt.');
  } catch {toast('An image could not be read. Add it again in Pin style.');}
}
async function uploadReferences(files,id) {
  const c=state.accounts[id];if(!c)return;
  if(c.refs.length+files.length>6)return toast('Choose up to 6 reference images in this preview.');
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)return toast('Use JPG, PNG or WebP images smaller than 5 MB.');
  }
  const additions=[];
  for(const file of files){
    const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const valid=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.width>0&&img.height>0);img.onerror=()=>resolve(false);img.src=src;});
    if(!valid)return toast('That file could not be opened as an image. Try another one.');
    additions.push({name:`reference-${Date.now()}-${additions.length}.${file.type==='image/jpeg'?'jpg':file.type.split('/')[1]}`,src,example:false});
  }
  saveDraft(id,'Pin style updated');c.refs.push(...additions);c.styleVersion++;persist();render();toast('Reference images added to your draft.');
}
function editAccount(id) {
  const c=state.accounts[id];
  modal('Edit '+esc(c.name),`${field('Category',`<select id="edit-category">${options(['Crochet & knitting','Food & recipes','Home & garden','Printables','DIY & crafts','Other'],c.category)}</select>`)}${field('What are your pins about?',`<input id="edit-niche" value="${esc(c.niche)}">`)}<div class="form-row">${field('Pins per day',`<input id="edit-daily" type="number" min="1" max="12" value="${c.daily}">`)}${field('Pins come from',`<select id="edit-source"><option value="niche"${c.source==='niche'?' selected':''}>Niche ideas</option><option value="website"${c.source==='website'?' selected':''}>My website</option></select>`)}</div><div class="mt">${field('Website <span class="muted small">If used</span>',`<input id="edit-site" type="url" value="${esc(c.site)}" placeholder="https://your-site.com">`)}</div><strong>Posting times</strong><p class="hint">Choose hours, or spread your daily pins evenly.</p><div class="hours">${Array.from({length:18},(_,i)=>`${String(i+6).padStart(2,'0')}:00`).map(h=>button(h,'toggle-hour',`data-hour="${h}" aria-pressed="${c.hours.includes(h)}"`)).join('')}</div><div class="mt">${button('Spread evenly','spread-hours')}</div><p class="hint mt">Times in Africa/Casablanca.</p>`,`${button('Cancel','close-dialog')}${button('Save draft','save-account',`data-id="${id}"`,'primary')}`);
}
function memberModal(id) {
  const m=state.members.find(x=>x.id===id);if(!m)return;
  modal(esc(m.name),`<p>${esc(m.email)}</p>${status(m.status==='active'?'Website access active':'Website access blocked',m.status==='active'?'':'neutral')}<div class="metrics">${[['Autopilots',m.autopilots],['Pinterest accounts',m.accounts],['Live autopilots',m.deployed],['Joined',m.joined]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div><h3>Their autopilots</h3><div class="style-summary">${m.autopilots?`<strong>${esc(m.owner?state.autopilots.map(a=>a.name).join(' · '):m.id==='salma'?'Everyday recipes':'Moroccan Kitchen')}</strong><p>${m.accounts} connected Pinterest accounts · ${m.deployed} deployed</p>`:'<p>No autopilots yet.</p>'}</div><p class="hint mt">Last active: ${esc(m.last)}. Website access controls do not delete Google or Pinterest accounts. Independently running automations keep running.</p>`,m.owner?button('Close','close-dialog'):`${button('Remove access','remove-member',`data-id="${m.id}"`,'danger')}${button(m.status==='blocked'?'Unblock member':'Block member','toggle-member',`data-id="${m.id}"`,'primary')}`);
}
async function simulateProgress(kind,id) {
  if(busy)return;busy=true;
  const stages=kind==='deploy'?['Create automation','Publish settings','First run','Prepare spreadsheet']:kind==='apply'?['Update settings','Publish changes','Check the first run']:['Check connections','Read the queue','Finish run'];
  const heading=kind==='deploy'?'Setting up your autopilot':kind==='apply'?'Applying your changes':'Running your autopilot';
  for(let i=0;i<=stages.length;i++){
    modal(heading,`<p>Simulated preview. No live changes.</p><div class="steps-progress">${stages.map((s,j)=>`<div class="subtle-row">${j<i?'<span class="tick">✓</span>':j===i?'<span class="spinner" aria-hidden="true"></span>':'<span class="tick pending">○</span>'}<span>${s}</span><span class="sr-only">${j<i?'Finished':j===i?'In progress':'Waiting'}</span></div>`).join('')}</div>`);
    if(i<stages.length)await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(kind==='deploy'){state.setup.deployed=true;state.autopilots[1].name=state.setup.name;busy=false;closeModal();persist();render();toast('Preview setup finished.');}
  else if(kind==='apply'){
    const changed=state.autopilots.find(a=>a.id===state.draftFor);
    for(const account of changed?.accounts||[]){const c=state.accounts[account];state.versions.unshift({id:'v'+Date.now()+'-'+account,title:'Settings applied',detail:state.draftNotes.join(' · '),date:'Just now',account,snapshot:clone(c)});}
    state.draft=false;state.draftNotes=[];delete state.draftSnapshot;busy=false;persist();render();
    modal('Changes applied',`<p>Preview complete. Next post: <strong>15:00</strong>.</p>`,button('Done','close-dialog','','primary'));
  }else{
    state.runs.unshift({id:'run-'+Date.now(),time:'Just now',status:'success',summary:'Queue checked · no pins due',duration:'2s'});busy=false;persist();render();
    modal('Run finished',`<div class="notice success mb0"><div>${status('Your queue was checked')}<p>No pins are due right now. Next post: 15:00.</p></div></div><p class="hint mt">Simulated result. This preview does not publish pins.</p>`,`${link('See runs',`#autopilot/${id}/runs`)}${button('Done','close-dialog','','primary')}`);
  }
}
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip')){event.preventDefault();$('#main-content').focus();return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action,id=target.dataset.id;
  if(target.disabled)return;
  if(action==='close-dialog')return closeModal();
  if(action==='undo'){if(pendingUndo)pendingUndo();$('#toast').classList.remove('visible');return;}
  if(action==='reset'){modal('Reset the preview?','<p>This clears only the sample changes on this device.</p>',`${button('Keep changes','close-dialog')}${button('Reset preview','confirm-reset','','primary')}`);return;}
  if(action==='confirm-reset'){state=clone(initial);persist();closeModal();location.hash='overview';render();return;}
  if(action==='setup-help'){modal('One step at a time','<p>Your progress saves automatically in this preview. Use Back to change an earlier choice, or Save & exit to return home.</p>',button('Got it','close-dialog','','primary'));return;}
  if(action==='help'){modal('What would you like to do?',`<div class="stack">${link('Set up an autopilot →','#setup/2')}${link('Make new pins →','#new-pins')}${link('See an empty home →','#empty')}</div><p class="hint mt">This preview uses sample data. No live account is changed.</p>`);return;}
  if(action==='toggle-autopilot'){
    const a=state.autopilots.find(x=>x.id===id);if(!a)return;
    modal(a.status==='paused'?'Resume '+esc(a.name)+'?':'Pause '+esc(a.name)+'?',`<p>${a.status==='paused'?'Posting will follow your saved times.':'Scheduled posting will stop. Your waiting pins stay in the queue.'}</p>`,`${button('Cancel','close-dialog')}${button(a.status==='paused'?'Resume autopilot':'Pause autopilot','confirm-toggle',`data-id="${id}"`,'primary')}`);return;
  }
  if(action==='confirm-toggle'){const a=state.autopilots.find(x=>x.id===id);a.status=a.status==='paused'?'running':'paused';persist();closeModal();render();toast(a.status==='paused'?'Autopilot paused in this preview.':'Autopilot resumed in this preview.');return;}
  if(action==='run-now')return simulateProgress('run',id);
  if(action==='deploy')return simulateProgress('deploy');
  if(action==='review-apply'){modal('Apply these changes?',`<p>Your draft is saved. Applying updates your automation.</p><ul>${state.draftNotes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`,`${button('Keep editing','close-dialog')}${button('Apply changes','apply','','primary')}`);return;}
  if(action==='apply')return simulateProgress('apply');
  if(action==='discard-draft'){if(state.draftSnapshot){state.accounts=clone(state.draftSnapshot.accounts);state.notifications=clone(state.draftSnapshot.notifications);if(state.draftSnapshot.autopilots)state.autopilots=clone(state.draftSnapshot.autopilots);}state.draft=false;state.draftNotes=[];delete state.draftSnapshot;persist();render();toast('Draft changes undone.');return;}
  if(action==='edit-account')return editAccount(id);
  if(action==='toggle-hour'){target.setAttribute('aria-pressed',target.getAttribute('aria-pressed')!=='true');return;}
  if(action==='spread-hours'){const n=safeNumber($('#edit-daily').value,1,12);const hours=Array.from({length:n},(_,i)=>`${String(Math.round(6+i*17/Math.max(1,n-1))).padStart(2,'0')}:00`);document.querySelectorAll('[data-hour]').forEach(b=>b.setAttribute('aria-pressed',hours.includes(b.dataset.hour)));return;}
  if(action==='save-account'){
    const c=state.accounts[id],hours=[...document.querySelectorAll('[data-hour][aria-pressed=true]')].map(b=>b.dataset.hour),source=$('#edit-source').value,site=$('#edit-site').value.trim();
    if(!hours.length)return toast('Choose at least one posting time.');if(source==='website'&&!isWebUrl(site))return toast('Add your website link, starting with https://.');
    saveDraft(id,'Account settings updated');Object.assign(c,{category:$('#edit-category').value,niche:$('#edit-niche').value.trim(),daily:safeNumber($('#edit-daily').value,1,12),source,site,hours});persist();closeModal();render();toast('Draft saved. Review and apply when you’re ready.');return;
  }
  if(action==='remove-ref'){const c=state.accounts[id],index=Number(target.dataset.index),removed=c.refs[index];saveDraft(id,'Pin style updated');c.refs.splice(index,1);c.styleVersion++;persist();render();toast('Reference removed from your draft.',()=>{c.refs.splice(index,0,removed);c.styleVersion++;persist();render();});return;}
  if(action==='detect-accounts'){modal('Accounts checked',`<p>Your current connections are up to date.</p><ul class="list check-list"><li><span class="tick">✓</span><div>Google Sheets</div>${status('Connected')}</li><li><span class="tick">✓</span><div>Gmail</div>${status('Connected')}</li><li><span class="tick">✓</span><div>Pinterest</div>${status('Connected')}</li></ul><p class="hint mt">Simulated connection check.</p>`,button('Done','close-dialog','','primary'));return;}
  if(action==='batch-mode'){readBuilder();batchMode=target.dataset.mode;render();return;}
  if(action==='add-link'){readBuilder();builder.rows.push({url:'',count:6});render();return;}
  if(action==='remove-link'){readBuilder();builder.rows.splice(Number(target.dataset.index),1);render();return;}
  if(action==='prepare-batch')return prepareBatch();
  if(action==='copy-prepared')return copyBatch(preparedBatch);
  if(action==='download-package')return downloadPackage(preparedBatch);
  if(action==='copy-batch'){const b=state.batches.find(x=>x.id===id);batchModal(b);return;}
  if(action==='mark-sent'){const b=state.batches.find(x=>x.id===id);b.status='sent';persist();render();toast('Batch marked as sent.',()=>{b.status='ready';persist();render();});return;}
  if(action==='similar-batch'){const b=state.batches.find(x=>x.id===id);batchAccount=b.account;batchMode=b.mode;builder={rows:clone(b.rows.length?b.rows:[{url:'',count:6}]),topic:b.topic+' — fresh ideas',count:b.total,rounds:b.rounds,perRound:b.perRound};location.hash='new-pins';return;}
  if(action==='delete-batch'){modal('Delete this batch?',`<p>This removes its history entry. Queued pins are separate.</p>`,`${button('Keep batch','close-dialog')}${button('Delete batch','confirm-delete-batch',`data-id="${id}"`,'destructive')}`);return;}
  if(action==='confirm-delete-batch'){const i=state.batches.findIndex(x=>x.id===id),removed=state.batches.splice(i,1)[0];persist();closeModal();render();toast('Batch deleted.',()=>{state.batches.splice(i,0,removed);persist();render();});return;}
  if(action==='history-tab'){historyTab=target.dataset.tab;render();return;}
  if(action==='restore-version'){const v=state.versions.find(x=>x.id===id);modal('Restore this setup?',`<p>${esc(v.detail)}</p><p>It becomes a draft. Review and apply to make it live.</p>`,`${button('Cancel','close-dialog')}${button('Restore as draft','confirm-restore',`data-id="${id}"`,'primary')}`);return;}
  if(action==='confirm-restore'){const v=state.versions.find(x=>x.id===id);saveDraft(v.account,'Previous posting times restored');Object.assign(state.accounts[v.account],clone(v.snapshot));persist();closeModal();render();toast('Previous setup restored as a draft.');return;}
  if(action==='run-detail'){const r=state.runs.find(x=>x.id===id);modal(r.status==='failed'?'Reconnect Pinterest':'Run finished',r.status==='failed'?`<p>Your Pinterest login expired. Your queue and settings are safe.</p><div class="style-summary"><strong>One step to fix it</strong><p>Reconnect Pinterest in Activepieces, then check again.</p></div>`:`<p>${esc(r.time)} · ${r.duration}</p><ul class="list check-list">${['Connected to Google Sheets','Checked posting times',r.summary,'Finished'].map(s=>`<li><span class="tick">✓</span><div>${esc(s)}</div></li>`).join('')}</ul>`,r.status==='failed'?`${button('Close','close-dialog')}${button('Reconnect Pinterest','reconnect-pinterest',`data-id="${id}"`,'primary')}`:button('Done','close-dialog','','primary'));return;}
  if(action==='reconnect-pinterest'){modal('Pinterest reconnected',`<p>Preview recovery complete. Your next scheduled check will try again.</p><p class="hint">In the finished website, this opens the official Pinterest login in Activepieces.</p>`,button('Done','close-dialog','','primary'));return;}
  if(action==='member-detail')return memberModal(id);
  if(action==='toggle-member'){const m=state.members.find(x=>x.id===id);modal(m.status==='blocked'?'Unblock '+esc(m.name)+'?':'Block '+esc(m.name)+'?',`<p>${m.status==='blocked'?'They can sign in and use the website again.':'Their website sessions end and website actions stop. Their independent automation keeps running.'}</p>`,`${button('Cancel','close-dialog')}${button(m.status==='blocked'?'Unblock':'Block access','confirm-toggle-member',`data-id="${id}"`,'primary')}`);return;}
  if(action==='confirm-toggle-member'){const m=state.members.find(x=>x.id===id);m.status=m.status==='blocked'?'active':'blocked';persist();closeModal();render();toast(m.status==='blocked'?'Member blocked in this preview.':'Member unblocked in this preview.');return;}
  if(action==='remove-member'){modal('Remove website access?',`<p>${esc(state.members.find(x=>x.id===id).email)} will lose website access. Google and Pinterest accounts are not deleted.</p>`,`${button('Cancel','close-dialog')}${button('Remove access','confirm-remove-member',`data-id="${id}"`,'destructive')}`);return;}
  if(action==='confirm-remove-member'){state.members=state.members.filter(m=>m.id!==id||m.owner);persist();closeModal();render();toast('Member removed from the preview.');return;}
  if(action==='google-signin'){persist();location.hash='setup/2';toast('Signed in with the sample Google profile.');return;}
  if(action==='sample-key'){$('#setup-key').value='sample-key-for-preview';return;}
  if(action==='verify-key'){if(!$('#setup-key').value.trim())return toast('Use the sample key to try connecting.');state.setup.connected=true;persist();render();return;}
  if(action==='sample-token'){$('#setup-bot-token').value='sample-token-for-preview';return;}
  if(action==='verify-bot'){if(!$('#setup-bot-token').value.trim())return toast('Use the sample token first.');state.setup.telegramVerified=true;persist();render();return;}
  if(action==='start-bot'){modal('Start your Telegram bot',`<p>This is a sample of the bot screen.</p><div class="style-summary"><strong>@example_bot</strong><p>Tap Start to allow reports from your bot.</p></div>`,button(state.setup.botStarted?'Preview test message':'Start bot','confirm-bot-start','','primary'));return;}
  if(action==='confirm-bot-start'){state.setup.botStarted=true;persist();modal('Test message preview',`<div class="style-summary"><strong>Your autopilot is connected ✓</strong><p>You’ll receive posting updates here.</p></div><p class="hint mt">No Telegram message was sent by this prototype.</p>`,button('Done','finish-bot-preview','','primary'));return;}
  if(action==='finish-bot-preview'){closeModal();render();return;}
  if(action==='setup-logins'){state.setup.logins=true;persist();render();toast('Sample logins detected.');return;}
  if(action==='preview-mismatch'){state.setup.logins=true;state.setup.mismatch=true;persist();render();return;}
  if(action==='fix-google'){state.setup.mismatch=false;persist();render();toast('The sample Google accounts now match.');return;}
  if(action==='setup-next'){persist();location.hash=`setup/${Number(target.dataset.step)+1}`;return;}
  if(action==='spreadsheet-preview'){modal('Your spreadsheet',`<p>A sample of the connected spreadsheet.</p><div class="table-wrap"><table><thead><tr><th>Pin title</th><th>Status</th></tr></thead><tbody><tr><td>Your first pin goes here</td><td>Waiting for pins</td></tr></tbody></table></div><p class="hint mt">The finished website opens your real Google Sheet.</p>`,button('Done','close-dialog','','primary'));return;}
  if(action==='sign-out'){location.hash='setup/1';toast('Signed out of the preview.');return;}
  if(action==='delete-autopilot'){modal('Delete '+esc(state.autopilots.find(x=>x.id===id).name)+'?',`<p>In the finished website, this removes its Activepieces flow and website setup. Your Pinterest account and spreadsheet stay separate.</p>${field('Type DELETE to confirm','<input id="delete-confirm" autocomplete="off">')}`,`${button('Cancel','close-dialog')}${button('Delete autopilot','confirm-delete-autopilot',`data-id="${id}"`,'destructive')}`);return;}
  if(action==='confirm-delete-autopilot'){if($('#delete-confirm').value!=='DELETE')return toast('Type DELETE to confirm.');state.autopilots=state.autopilots.filter(a=>a.id!==id);persist();closeModal();location.hash='overview';return;}
  if(action==='delete-website-account'){modal('Delete your website account?',`<p>Your website setup and saved history will be removed. Google and Pinterest accounts stay separate.</p>${field('Type DELETE to confirm','<input id="delete-confirm" autocomplete="off">')}`,`${button('Keep account','close-dialog')}${button('Delete website account','confirm-delete-website','','destructive')}`);return;}
  if(action==='confirm-delete-website'){if($('#delete-confirm').value!=='DELETE')return toast('Type DELETE to confirm.');state=clone(initial);persist();closeModal();location.hash='setup/1';toast('Sample website account cleared.');return;}
});
document.addEventListener('input',event=>{
  const t=event.target;
  if(t.id==='autopilot-search'){let visible=0;document.querySelectorAll('#autopilot-cards .card').forEach(c=>{c.hidden=!c.dataset.search.includes(t.value.toLowerCase());if(!c.hidden)visible++;});$('#no-autopilots').hidden=visible>0;}
  if(t.id==='member-search'||t.id==='member-filter')filterMembers();
  if(t.matches('[data-row],#batch-count,#batch-rounds,#batch-per-round')){readBuilder();const total=batchTotal();$('#batch-total').textContent=total;$('#batch-days').textContent=Math.ceil(total/state.accounts[batchAccount].daily)+' days of posts';}
  if(t.id==='style-notes'){const id=t.dataset.account;saveDraft(id,'Pin style updated');if(!t.dataset.changed){state.accounts[id].styleVersion++;t.dataset.changed='true';}state.accounts[id].brand=t.value;persist();}
  if(t.id==='setup-name'){state.setup.name=t.value;persist();}
});
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.id==='theme'){state.theme=t.value;persist();}
  if(t.id==='batch-account'){readBuilder();render();}
  if(t.id==='run-filter')document.querySelectorAll('[data-run-status]').forEach(row=>row.hidden=t.value!=='all'&&row.dataset.runStatus!==t.value);
  if(t.id==='member-filter')filterMembers();
  if(t.id==='reference-upload')uploadReferences([...t.files],t.dataset.account);
  if(t.dataset.accountEnabled){const id=t.dataset.accountEnabled;saveDraft(id,'Account posting changed');state.accounts[id].enabled=t.checked;persist();render();}
  if(t.dataset.notification){saveDraft(currentAutopilot().accounts[0],'Notifications updated');state.notifications[t.dataset.notification]=t.checked;persist();}
  if(t.id==='autopilot-zone'){const a=currentAutopilot();saveDraft(a.accounts[0],'Time zone updated');a.zone=t.value;persist();}
  if(t.id==='report-time'){saveDraft(currentAutopilot().accounts[0],'Report time updated');state.notifications.report=t.value;persist();}
  if(t.classList.contains('draft-setting')){saveDraft(currentAutopilot().accounts[0],'Connection or time zone changed');persist();}
  if(t.id==='setup-telegram'){state.setup.telegram=t.checked;persist();render();}
  if(t.id==='setup-daily'){state.setup.daily=Number(t.value);persist();}
});
function filterMembers(){const query=$('#member-search')?.value.toLowerCase()||'',filter=$('#member-filter')?.value||'all';document.querySelectorAll('[data-member]').forEach(row=>row.hidden=!row.dataset.search.includes(query)||(filter!=='all'&&row.dataset.memberStatus!==filter));}
document.addEventListener('dragover',event=>{const zone=event.target.closest('#upload-zone');if(zone){event.preventDefault();zone.classList.add('dragging');}});
document.addEventListener('dragleave',event=>event.target.closest('#upload-zone')?.classList.remove('dragging'));
document.addEventListener('drop',event=>{const zone=event.target.closest('#upload-zone');if(zone){event.preventDefault();zone.classList.remove('dragging');uploadReferences([...event.dataTransfer.files],zone.dataset.account);}});
$('#dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
window.addEventListener('hashchange',()=>{if($('#dialog').open&&!busy)closeModal();render();$('#main-content').focus({preventScroll:true});});
render();
