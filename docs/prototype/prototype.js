'use strict';

const $ = (selector, parent = document) => parent.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mark = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 10a10 10 0 0 1 17-2M25 22a10 10 0 0 1-17 2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 3v6h-6M8 29v-6h6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const storageKey = 'pinterest-automation-preview-v2';
const legacyStorageKey = 'autopilot-clickable-preview-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const examples = [1,2,3].map(i => ({name:`example-pin-${i}.svg`,src:`assets/style-${i}.svg`,example:true}));
const initial = {
  theme:'light', draft:false, draftFor:'stunning', draftNotes:[],
  automations:[
    {id:'main',name:'Crochet posting',icon:'↻',accounts:['hdrahm','crochet'],status:'needs',posted:5,waiting:0,last:'12:03',category:'Crochet & knitting'},
    {id:'stunning',name:'Daily posting',icon:'↻',accounts:['stunning'],status:'running',posted:4,waiting:13,last:'12:01',category:'Crochet & knitting'},
  ],
  accounts:{
    hdrahm:{name:'hdrahm',handle:'hdrahm',category:'Crochet & knitting',niche:'Crochet patterns and cozy handmade projects',daily:4,source:'niche',site:'',hours:['08:00','12:00','16:00','20:00'],brand:'Warm, natural and handmade.',refs:[],styleVersion:1,enabled:true},
    crochet:{name:'Crochet Simplified',handle:'crochet_simplified',category:'Crochet & knitting',niche:'Easy crochet patterns',daily:4,source:'website',site:'https://crochetsimplified.com',hours:['08:00','12:00','16:00','20:00'],brand:'Clear, welcoming, beginner friendly.',refs:[],styleVersion:1,enabled:true},
    stunning:{name:'Stunning Crochet',handle:'stunningcrochet',category:'Crochet & knitting',niche:'Cozy crochet ideas and beginner projects',daily:4,source:'niche',site:'',hours:['08:00','12:00','16:00','20:00'],brand:'Warm cream, soft terracotta, natural textures. Keep it calm and handmade.',refs:examples,styleVersion:1,enabled:true},
  },
  notifications:{email:true,telegram:true,report:'21:00'},
  batches:[{id:'sample-batch',account:'stunning',title:'Cozy crochet ideas',total:12,mode:'no-link',topic:'Cozy crochet ideas',rows:[],rounds:2,perRound:6,refs:examples,brand:'Warm cream, soft terracotta, natural textures.',styleVersion:1,status:'ready',copies:1,date:'Today, 10:42',fingerprint:'sample'}],
  versions:[{id:'v3',title:'Posting times changed',detail:'4 pins a day · 08:00, 12:00, 16:00, 20:00',date:'Today, 09:10',account:'stunning',snapshot:{daily:4,hours:['08:00','12:00','16:00','20:00']}},{id:'v2',title:'Posting times changed',detail:'3 pins a day · 09:00, 14:00, 19:00',date:'Yesterday, 18:24',account:'stunning',snapshot:{daily:3,hours:['09:00','14:00','19:00']}}],
  runs:[{id:'run-1',time:'Today, 12:01',status:'success',summary:'2 pins posted',duration:'18s'},{id:'run-2',time:'Today, 11:02',status:'success',summary:'Nothing due yet',duration:'6s'},{id:'run-3',time:'Today, 10:01',status:'success',summary:'1 pin posted',duration:'14s'},{id:'run-4',time:'Yesterday, 17:03',status:'failed',summary:'Pinterest login expired',duration:'4s'}],
  members:[{id:'owner',name:'Houdaifa',email:'owner@example.com',status:'active',joined:'19 Oct 2026',last:'Now',automations:2,accounts:3,deployed:2,owner:true},{id:'salma',name:'Salma Bennani',email:'salma@example.com',status:'active',joined:'18 Oct 2026',last:'2 hours ago',automations:1,accounts:2,deployed:1},{id:'omar',name:'Omar',email:'omar@example.com',status:'active',joined:'18 Oct 2026',last:'Yesterday',automations:1,accounts:1,deployed:0},{id:'test',name:'New member',email:'member@example.com',status:'blocked',joined:'17 Oct 2026',last:'2 days ago',automations:0,accounts:0,deployed:0}],
  setup:{connected:false,telegram:false,telegramVerified:false,botStarted:false,logins:false,mismatch:false,name:'My automation',daily:4,category:'Crochet & knitting',deployed:false}
};
function migratePreview(saved) {
  for(const data of [saved,saved?.draftSnapshot].filter(Boolean)) {
    if(!data.automations&&Array.isArray(data.autopilots))data.automations=data.autopilots;
    delete data.autopilots;
    if(Array.isArray(data.automations)) {
      data.automations=data.automations.filter(a=>a.id!=='kitchen');
      for(const a of data.automations) {
        if(a.id==='main'&&a.name==='Main')a.name='Crochet posting';
        if(a.id==='stunning'&&a.name==='Stunning Crochet')a.name='Daily posting';
        a.name=a.name.replace(/autopilot/gi,'automation');
      }
    }
    if(data.accounts?.kitchen?.handle==='moroccankitchen')delete data.accounts.kitchen;
  }
  for(const m of saved?.members||[]) {
    if(m.automations===undefined)m.automations=m.autopilots||0;
    delete m.autopilots;
  }
  if(saved?.setup?.name)saved.setup.name=saved.setup.name.replace(/autopilot/gi,'automation');
  return saved;
}
let state;
try {
  const saved=migratePreview(JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem(legacyStorageKey)));
  state=saved?.accounts?.stunning&&Array.isArray(saved.automations)?saved:clone(initial);
} catch {state=clone(initial);}

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
function currentAutomation() { return state.automations.find(a=>a.id===page[1]) || state.automations[1] || state.automations[0]; }
function automationForAccount(id) { return state.automations.find(a=>a.accounts.includes(id)) || state.automations[1] || state.automations[0]; }
function accountOptions(selected) { return Object.entries(state.accounts).map(([id,a])=>`<option value="${id}"${id===selected?' selected':''}>${esc(a.name)} · @${esc(a.handle)}</option>`).join(''); }
function header(active='overview',automation) {
  const nav=automation?['Summary','Pinterest accounts','New pins','Runs','History','Settings']:['Automations','New pins','History','Settings','Admin'];
  return `<header><div class="top"><a class="brand-mark" href="#overview" aria-label="Automation home">${mark}</a>${automation?`<div class="automation-crumb"><a href="#overview">Automations</a><span class="slash" aria-hidden="true">/</span><span class="crumb-current">${esc(automation.name)}</span></div>`:'<span class="slash" aria-hidden="true">/</span><span class="workspace">Houdaifa’s automations</span>'}<span class="badge">Free</span><div class="top-right">${button('Help','help','', 'quiet')}<a class="avatar" href="#settings" aria-label="Your profile">H</a></div></div><nav class="tabs" aria-label="${automation?'Automation':'Main'} navigation">${nav.map(n=>{const slug=['Automations','Summary'].includes(n)?'overview':n==='Pinterest accounts'?'accounts':n.toLowerCase().replace(' ','-');return `<a href="#${automation?`automation/${automation.id}/`:''}${slug}"${active===slug?' aria-current="page"':''}>${n}</a>`;}).join('')}</nav></header>`;
}
function wizardHeader(step) {
  return `<header><div class="top"><a class="brand-mark" href="#overview" aria-label="Automation home">${mark}</a><span class="workspace">Automations</span>${step>1?'<span class="slash" aria-hidden="true">/</span><span class="muted small">Setup</span>':''}<div class="top-right">${step>1?link('Save & exit','#overview'):''}${button('Help','setup-help','','quiet')}</div></div></header>`;
}
function draftBar() {
  if(!state.draft)return '';
  return `<aside class="draft-bar" aria-label="Draft changes"><div><b>Changes ready</b><p>Draft saved. Apply to make it live.</p></div><div class="actions">${button('Undo','discard-draft','','quiet')}${button('Review & apply','review-apply','','primary')}</div></aside>`;
}
function saveDraft(account, note) {
  if(!state.draft)state.draftSnapshot={accounts:clone(state.accounts),notifications:clone(state.notifications),automations:clone(state.automations)};
  state.draft=true;state.draftFor=automationForAccount(account).id;
  if(!state.draftNotes.includes(note))state.draftNotes.push(note);
  persist();
  const old=$('.draft-bar'); if(old)old.remove();
  $('#app').insertAdjacentHTML('beforeend',draftBar());
}
function overview(empty=false) {
  const active=state.automations.filter(a=>a.status!=='setup');
  const needs=state.automations.find(a=>a.status==='needs');
  return `${header()}<main id="main-content">${title('Your automations','One automation can post to several Pinterest accounts.',link('＋ Create automation','#setup/2','primary'))}${empty?`<section class="panel empty">${icon('↻')}<h2>Your first automation starts here</h2><p>Connect your accounts once. We’ll guide you through the rest.</p>${link('Set up my automation','#setup/2','primary')}</section>`:`${needs?`<section class="notice warning" aria-label="Needs you"><span class="notice-icon">!</span><div><strong>${esc(needs.name)} needs new pins</strong><p>@hdrahm and @crochet_simplified have no pins left.</p></div>${link('Make new pins →','#automation/main/new-pins','primary')}</section>`:''}<div class="dashboard"><section class="panel stats"><h2>Last 24 hours</h2><div class="numbers">${[['Pins posted',active.reduce((n,a)=>n+a.posted,0)],['Pins waiting',active.reduce((n,a)=>n+a.waiting,0)],['Next post','15:00'],['Errors','0']].map(([k,v])=>`<div class="number"><span>${k}</span><b>${v}</b></div>`).join('')}</div><p class="stats-foot">Next post: @stunningcrochet.<br>Times in Africa/Casablanca.</p></section><section aria-label="Automations"><div class="section-heading"><h2>Automations <span class="count">${state.automations.length}</span></h2>${search('Search automations','automation-search')}</div><div class="cards" id="automation-cards">${state.automations.map(automationCard).join('')}</div><p id="no-automations" class="hint" hidden>No matching automations.</p></section></div>`}</main>`;
}
function pinterestCount(count) {return `${count} Pinterest ${count===1?'account':'accounts'}`;}
function connectedAccounts(a) {
  return `<div class="connected-accounts"><p>${pinterestCount(a.accounts.length)}</p><ul>${a.accounts.map(id=>`<li><span class="pinterest-symbol" aria-hidden="true">P</span><span>@${esc(state.accounts[id].handle)}</span></li>`).join('')}</ul></div>`;
}
function automationCard(a) {
  const label=a.status==='running'?`Running · ${a.waiting} pins waiting`:a.status==='needs'?'Needs pins':a.status==='setup'?'Setup · step 4 of 6':'Paused';
  return `<article class="card automation-card" data-search="${esc((a.name+' '+a.accounts.map(id=>state.accounts[id].handle).join(' ')).toLowerCase())}"><div class="card-body"><div class="identity">${icon('↻')}<div><span class="entity-kind">Automation</span><h3>${esc(a.name)}</h3></div></div>${connectedAccounts(a)}<div class="mt">${button('＋ Add Pinterest account','add-pinterest',`data-id="${a.id}"`,'quiet small')}</div>${status(label,a.status==='needs'?'warning':a.status==='running'?'':'neutral')}<p class="detail">${a.status==='setup'?'Not live yet':`Last post <span class="mono">${a.last}</span>`}</p></div><div class="card-footer"><span>${esc(a.category)}</span>${link(a.status==='setup'?'Continue setup →':'Open automation →',a.status==='setup'?'#setup/4':`#automation/${a.id}/overview`)}</div></article>`;
}
function automationOverview(a) {
  const running=a.status==='running';
  return `${header('overview',a)}<main id="main-content">${title(a.name,`Automation for ${a.accounts.length} Pinterest ${a.accounts.length===1?'account':'accounts'}.`,`<div class="actions">${button(running?'Pause':'Resume','toggle-automation',`data-id="${a.id}"`)}${button('Run now','run-now',`data-id="${a.id}"`,'primary')}</div>`)}${a.status==='needs'?`<section class="notice warning"><div><strong>Your queue is empty</strong><p>Add pins so your next posting time is ready.</p></div>${link('Make new pins',`#automation/${a.id}/new-pins`,'primary')}</section>`:`<section class="notice ${running?'success':''}"><div>${status(running?'Your automation is running':'Your automation is paused',running?'':'neutral')}<p>${running?'We’ll post from your queue at your saved times.':'Your waiting pins are safe. Resume when you’re ready.'}</p></div>${link('New pins',`#automation/${a.id}/new-pins`)}</section>`}<div class="metrics">${[['Posted today',a.posted],['Waiting',a.waiting],['Next post',running?'15:00':'—'],['Needs fixing','0']].map(([k,v])=>`<div class="metric"><span>${k}</span><b class="mono">${v}</b></div>`).join('')}</div><div class="two-col"><section class="panel"><div class="panel-heading"><h2>Pinterest accounts</h2>${link('Manage',`#automation/${a.id}/accounts`)}</div>${a.accounts.map(id=>`<div class="subtle-row"><div class="mini-account">${icon('🧶')}<div><strong>${esc(state.accounts[id].name)}</strong><p>${state.accounts[id].daily} pins a day · @${esc(state.accounts[id].handle)}</p></div></div>${status(state.accounts[id].enabled?'On':'Off',state.accounts[id].enabled?'':'neutral')}</div>`).join('')}</section><section class="panel"><h2>Latest run</h2>${status('Finished')}<p class="mt">2 pins posted</p><p class="hint">Today, 12:01 · 18 seconds</p>${link('See runs →',`#automation/${a.id}/runs`,'full-width mt')}</section></div></main>${draftBar()}`;
}
function accountsPage(a) {
  return `${header('accounts',a)}<main id="main-content">${title('Pinterest accounts',`Connected to the “${a.name}” automation. Each has its own schedule and style.`,button('＋ Add Pinterest account','add-pinterest',`data-id="${a.id}"`,'primary'))}<div class="cards">${a.accounts.map(id=>{const c=state.accounts[id];return `<article class="card"><div class="card-body"><div class="split"><div class="identity">${icon('🧶')}<div><span class="entity-kind">Pinterest account</span><h3>${esc(c.name)}</h3><div class="handle">@${esc(c.handle)}</div></div></div><label class="check"><span class="sr-only">Posting for ${esc(c.name)}</span><input class="switch" type="checkbox" data-account-enabled="${id}"${c.enabled?' checked':''}></label></div><div class="mt">${status(c.enabled?'Posting on':'Posting off',c.enabled?'':'neutral')}</div><div class="subtle-row mt"><div><strong>${c.daily} pins a day</strong><p>${esc(c.hours.join(' · '))}</p></div>${button('Edit','edit-account',`data-id="${id}"`)}</div><div class="subtle-row"><div><strong>Pin style</strong><p>${c.refs.length?`${c.refs.length} reference pins · style ${c.styleVersion}`:'Add your examples or describe your style'}</p></div>${link('Edit style',`#style/${id}`)}</div>${refsStrip(c.refs)}<p class="hint mt">${esc(c.category)} · ${c.source==='website'?'From your website':'Niche ideas'}</p></div></article>`;}).join('')}</div><p class="hint mt">Your connected Pinterest accounts appear here automatically.</p></main>${draftBar()}`;
}
function stylePage(id) {
  const c=state.accounts[id]||state.accounts.stunning,a=automationForAccount(id);
  return `${header('accounts',a)}<main id="main-content" class="narrow"><a class="back-link" href="#automation/${a.id}/accounts">← Pinterest accounts</a>${title('Your pin style',c.name+' · @'+c.handle)}<section class="panel"><div class="panel-heading"><h2>Show us your style</h2><span class="badge">Style ${c.styleVersion}</span></div><p class="muted">Add examples. Codex will read their style for you.</p><div class="reference-grid">${c.refs.map((r,i)=>`<figure><img src="${esc(r.src)}" alt="${esc(r.name)}"><figcaption><span>${r.example?'Example '+(i+1):esc(r.name)}</span>${button('Remove','remove-ref',`data-id="${id}" data-index="${i}"`)}</figcaption></figure>`).join('')}</div><div class="upload-zone" id="upload-zone" data-account="${id}"><strong>Add your reference pins</strong><p>Drop images here, or choose files.<br>Preview limit: 6 images, 5 MB each.</p><label class="button" for="reference-upload">＋ Choose images</label><input class="sr-only" id="reference-upload" type="file" multiple accept="image/png,image/jpeg,image/webp" data-account="${id}"></div><div class="style-summary"><strong>Same identity. Fresh ideas.</strong><p>Codex uses your examples to choose the colors, feel and lettering. Each pin gets a fresh layout and idea.</p></div><p class="hint mt">The illustrated pins above are examples. Add your own references for your account.</p></section><p class="hint mt">Draft saves on this device in the preview. Apply makes changes live in the finished product.</p></main>${draftBar()}`;
}
function batchTotal() { return batchMode==='links'?builder.rows.reduce((n,r)=>n+Number(r.count||0),0):batchMode==='no-link'?Number(builder.count||0):Number(builder.rounds||0)*Number(builder.perRound||0); }
function newPinsPage(a) {
  if(a && !a.accounts.includes(batchAccount))batchAccount=a.accounts[0];
  const c=state.accounts[batchAccount],total=batchTotal();
  return `${header('new-pins',a)}<main id="main-content">${title('Make new pins','Choose what to make. Your saved style comes with it.')}<div class="two-col"><section class="panel">${field('Pinterest account',`<select id="batch-account">${a?a.accounts.map(id=>`<option value="${id}"${id===batchAccount?' selected':''}>${esc(state.accounts[id].name)} · @${esc(state.accounts[id].handle)}</option>`).join(''):accountOptions(batchAccount)}</select>`)}<div class="segmented" aria-label="Pin source">${[['links','Page links'],['no-link','Without links'],['website','My website']].map(([mode,label])=>button(label,'batch-mode',`data-mode="${mode}" aria-pressed="${batchMode===mode}"`)).join('')}</div><div id="batch-fields">${batchMode==='links'?`<p class="hint">Add a page and choose how many pins to make for it.</p><div id="batch-rows">${builder.rows.map((r,i)=>`<div class="batch-row">${field('Page link',`<input type="url" data-row="${i}" data-kind="url" value="${esc(r.url)}" placeholder="https://your-site.com/page">`)}${field('Pins',`<input type="number" min="1" max="60" data-row="${i}" data-kind="count" value="${r.count}">`)}${button('<span aria-hidden="true">×</span>','remove-link',`data-index="${i}" aria-label="Remove link ${i+1}"${builder.rows.length===1?' disabled':''}`)}</div>`).join('')}</div>${button('＋ Add another link','add-link')}`:batchMode==='no-link'?`<div class="style-summary"><strong>Ideas from your account’s niche</strong><p>${esc(c.niche)}</p></div><div class="mt"></div>${field('How many pins?',`<input id="batch-count" type="number" min="1" max="60" value="${builder.count}">`)}`:`${field('Your website',`<input id="batch-website" type="url" value="${esc(c.site)}" placeholder="https://your-site.com">`)}<div class="form-row">${field('Next rounds',`<input id="batch-rounds" type="number" min="1" max="10" value="${builder.rounds}">`)}${field('Pins per round',`<input id="batch-per-round" type="number" min="1" max="12" value="${builder.perRound}">`)}</div><p class="hint mt">Continue your saved plan with fresh products and ideas.</p>`}</div></section><aside class="stack"><section class="panel"><h2>Your batch</h2><div class="subtle-row"><span>New pins</span><strong class="mono" id="batch-total">${total}</strong></div><div class="subtle-row"><span>About</span><strong id="batch-days">${Math.ceil(total/c.daily)} days of posts</strong></div><div class="mt">${button('Get Codex prompt →','prepare-batch','','primary full-width')}</div><p class="hint">Next: paste the prompt into Codex to create your pins.</p></section><section class="panel"><div class="panel-heading"><h2>Your saved style</h2><a class="text-link small" href="#style/${batchAccount}">Edit</a></div>${c.refs.length?`<p class="hint">Uses ${c.refs.length} reference pins · style ${c.styleVersion}</p>${refsStrip(c.refs)}`:`<p class="hint">Codex will choose a style from your account’s niche.</p>`}<p class="hint mt">No style brief to write.</p></section><section class="panel"><h2>What happens next?</h2><ol class="journey-list"><li><strong>Get your prompt</strong><span>Account, links, pin count and style instructions.</span></li><li><strong>Create pins in Codex</strong><span>Codex makes images and adds pins to your sheet.</span></li><li><strong>Automation posts them</strong><span>At your saved posting times.</span></li></ol></section></aside></div></main>`;
}
function historyPage(a) {
  const batches=state.batches.filter(b=>!a||a.accounts.includes(b.account));
  const versions=state.versions.filter(v=>!a||a.accounts.includes(v.account));
  return `${header('history',a)}<main id="main-content">${title('History','Your batches and changes, easy to find again.')}<div class="segmented" aria-label="History type">${button('Pin batches','history-tab','data-tab="batches" aria-pressed="'+(historyTab==='batches')+'"')}${button('Setup changes','history-tab','data-tab="versions" aria-pressed="'+(historyTab==='versions')+'"')}</div><section class="panel" style="padding:0">${historyTab==='batches'?batches.length?batches.map(b=>`<article class="history-card">${icon('▧')}<div><div class="label-line"><h3 class="mb0">${esc(b.title)}</h3><span class="badge">${b.total} pins</span></div><p>${esc(state.accounts[b.account].name)} · ${esc(b.date)}<br>Style ${b.styleVersion} · copied ${b.copies}×${b.refs.length?` · ${b.refs.length} images`:''}</p><div class="actions">${button('Copy again','copy-batch',`data-id="${b.id}"`)}${button(b.status==='sent'?'Marked as sent':'Mark as sent','mark-sent',`data-id="${b.id}"${b.status==='sent'?' disabled':''}`)}${button('Make similar','similar-batch',`data-id="${b.id}"`)}${button('Delete','delete-batch',`data-id="${b.id}"`,'quiet danger')}</div></div>${status(b.status==='sent'?'Sent':'Ready',b.status==='sent'?'':'neutral')}</article>`).join(''):`<div class="empty"><h2>Your batches will appear here</h2><p>Copying a batch again updates the same entry.</p>${link('Make new pins',a?`#automation/${a.id}/new-pins`:'#new-pins','primary')}</div>`:versions.map(v=>`<article class="history-card">${icon('↻')}<div><h3>${esc(v.title)}</h3><p>${esc(v.detail)}<br>${esc(v.date)}</p></div>${button('Restore','restore-version',`data-id="${v.id}"`)}</article>`).join('')}</section></main>${draftBar()}`;
}
function runsPage(a) {
  return `${header('runs',a)}<main id="main-content">${title('Runs','See what happened, in plain words.',button('Run now','run-now',`data-id="${a.id}"`,'primary'))}<div class="table-toolbar"><p class="hint mb0">Times in Africa/Casablanca</p><label><span class="sr-only">Filter runs</span><select id="run-filter"><option value="all">All runs</option><option value="success">Finished</option><option value="failed">Needs fixing</option></select></label></div><div class="table-wrap"><table><thead><tr><th>When</th><th>Result</th><th>What happened</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${state.runs.map(r=>`<tr data-run-status="${r.status}"><td class="mono">${esc(r.time)}</td><td>${status(r.status==='failed'?'Needs fixing':'Finished',r.status==='failed'?'error':'')}</td><td>${esc(r.summary)}<p>${r.duration}</p></td><td>${button(r.status==='failed'?'Fix':'View','run-detail',`data-id="${r.id}"`)}</td></tr>`).join('')}</tbody></table></div></main>`;
}
function settingsPage(a) {
  return `${header('settings',a)}<main id="main-content" class="narrow">${title(a?'Automation settings':'Your settings',a?'Saved as a draft until you apply.':'Your profile and preferences.')}<section class="panel">${a?`<div class="settings-group"><div><h2>Notifications</h2><p>Choose where updates go.</p></div><div><div class="switch-row"><div><strong>Email reports</strong><p>Your connected Gmail account</p></div><label><span class="sr-only">Email reports</span><input type="checkbox" class="switch" data-notification="email"${state.notifications.email?' checked':''}></label></div><div class="switch-row"><div><strong>Telegram</strong><p>Connected · @example_bot</p></div><label><span class="sr-only">Telegram reports</span><input type="checkbox" class="switch" data-notification="telegram"${state.notifications.telegram?' checked':''}></label></div>${field('Daily report time',`<input type="time" id="report-time" value="${state.notifications.report}">`)}</div></div><div class="settings-group"><div><h2>Connected logins</h2><p>Names only. No technical IDs.</p></div><div>${field('Google Sheets',`<select class="draft-setting"><option>Example Google account · Connected</option></select>`)}${field('Gmail',`<select class="draft-setting"><option>Example Google account · Connected</option></select>`)}${button('Check connections','detect-accounts')}</div></div><div class="settings-group"><div><h2>Time zone</h2><p>All posting times use this.</p></div><div>${field('Time zone',`<select id="automation-zone">${options(['Africa/Casablanca','Europe/Paris','America/New_York'],a.zone||'Africa/Casablanca')}</select>`)}</div></div><div class="settings-group"><div><h2>Automation</h2><p>You can pause at any time.</p></div><div class="actions">${button(a.status==='paused'?'Resume automation':'Pause automation','toggle-automation',`data-id="${a.id}"`)}${button('Delete automation','delete-automation',`data-id="${a.id}"`,'danger')}</div></div>`:`<div class="settings-group"><div><h2>Profile</h2><p>Signed in with Google.</p></div><div><strong>Houdaifa</strong><p class="hint">owner@example.com · Example profile</p>${button('Sign out','sign-out')}</div></div><div class="settings-group"><div><h2>Appearance</h2><p>Choose what feels comfortable.</p></div><div>${field('Appearance',`<select id="theme"><option value="auto"${state.theme==='auto'?' selected':''}>Match device</option><option value="light"${state.theme==='light'?' selected':''}>Light</option><option value="dark"${state.theme==='dark'?' selected':''}>Dark</option></select>`)}</div></div><div class="settings-group"><div><h2>Language</h2><p>One language at a time.</p></div><div>${field('Language','<select id="language"><option>English</option><option disabled>Français — preview to follow</option><option disabled>العربية — preview to follow</option></select>','This review covers the English journey. French and Arabic follow in the build.')}</div></div><div class="settings-group"><div><h2>Your account</h2><p>You control your website data.</p></div><div>${button('Delete my website account','delete-website-account','','danger')}<p class="hint">Your Google and Pinterest accounts are separate.</p></div></div>`}</section></main>${a?draftBar():''}`;
}
function syncOwnerCounts(){const owner=state.members.find(m=>m.owner);if(owner){owner.automations=state.automations.length;owner.accounts=new Set(state.automations.flatMap(a=>a.accounts)).size;owner.deployed=state.automations.filter(a=>a.status!=='setup').length;}}
function adminPage() {
  syncOwnerCounts();
  return `${header('admin')}<main id="main-content">${title('Members','Review who has access to the website.')}<div class="metrics">${[['Members',state.members.length],['Active',state.members.filter(m=>m.status==='active').length],['Blocked',state.members.filter(m=>m.status==='blocked').length],['Live automations',state.members.reduce((n,m)=>n+m.deployed,0)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b class="mono">${v}</b></div>`).join('')}</div><div class="table-toolbar">${search('Search members','member-search')}<label><span class="sr-only">Filter members</span><select id="member-filter"><option value="all">All members</option><option value="active">Active</option><option value="blocked">Blocked</option></select></label></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Member</th><th>Access</th><th class="hide-phone">Automations</th><th class="hide-phone">Last active</th><th><span class="sr-only">Review</span></th></tr></thead><tbody>${state.members.map(m=>`<tr data-member="${m.id}" data-search="${esc((m.name+' '+m.email).toLowerCase())}" data-member-status="${m.status}"><td><strong>${esc(m.name)}${m.owner?' <span class="badge">You</span>':''}</strong><p>${esc(m.email)}</p></td><td>${status(m.status==='active'?'Active':'Blocked',m.status==='active'?'':'neutral')}</td><td class="hide-phone">${m.automations}<p>${m.accounts} Pinterest accounts · ${m.deployed} live</p></td><td class="hide-phone">${esc(m.last)}</td><td>${button('Review','member-detail',`data-id="${m.id}"`)}</td></tr>`).join('')}</tbody></table></div><p class="hint mt">Only the owner can see this page. All members shown here are fictional.</p></main>`;
}
function setupPage(step) {
  const s=state.setup;
  const names=['Google sign-in','Activepieces','Notifications','Connect logins','Pinterest accounts','Go live'];
  if(step===1)return `${wizardHeader(step)}<main id="main-content"><section class="login"><span class="brand-mark">${mark}</span><h1>Your pins.<br>Posted on time.</h1><p>A little setup. More time for what you love.</p>${button('<span class="google-mark" aria-hidden="true">G</span> Continue with Google','google-signin','','primary')}<p class="hint mt">Anyone with a Google account can join.</p><p class="privacy">See how we use your information in our <a class="text-link" href="#privacy">privacy notice</a>.</p></section></main>`;
  let content='';
  if(step===2)content=`<h1>Connect Activepieces</h1><p class="wizard-intro">One key connects your automation workspace.</p><section class="panel"><details><summary>Where do I find my key? <span aria-hidden="true">↗</span></summary><ol><li>Open Activepieces → Platform → API keys.</li><li>Create a key called “Automation website”.</li><li>Copy it and paste it below.</li></ol><a class="text-link" href="https://cloud.activepieces.com/platform/api-keys" target="_blank" rel="noreferrer">Open API keys ↗</a></details>${field('Activepieces API key','<input id="setup-key" type="password" autocomplete="off" placeholder="Use a sample key in this preview">','Preview only. Do not enter a real key here.')}<div class="actions">${button('Use sample key','sample-key')}${button('Connect','verify-key','','primary')}</div>${s.connected?`<div class="notice success mt mb0"><div>${status('Connected to Hdrahm’s Platform')}<p>We found your workspace and connected accounts.</p></div></div>`:''}</section>`;
  if(step===3)content=`<h1>Stay in the loop</h1><p class="wizard-intro">Get a short update when your pins are posted.</p><section class="panel"><div class="switch-row"><div><strong>Email reports</strong><p>On · Your connected Gmail account</p></div>${status('Ready')}</div><div class="switch-row"><div><strong>Also use Telegram</strong><p>Optional. You can add it later.</p></div><label><span class="sr-only">Also use Telegram</span><input id="setup-telegram" class="switch" type="checkbox"${s.telegram?' checked':''}></label></div>${s.telegram?`<div class="mt">${field('Bot token','<input id="setup-bot-token" type="password" placeholder="Sample token only" autocomplete="off">','Get a bot from @BotFather, then paste its token.')}<div class="actions">${button('Use sample token','sample-token')}${button('Connect bot','verify-bot','','primary')}</div>${s.telegramVerified?`<div class="notice success mt mb0"><div>${status('Bot connected')}<p>${s.botStarted?'Your test message is ready in this preview.':'Open the bot and tap Start so it can reach you.'}</p></div></div><div class="mt">${button(s.botStarted?'Test message preview':'Open bot & tap Start','start-bot')}</div>`:''}</div>`:''}</section>`;
  if(step===4)content=`<h1>Connect your logins</h1><p class="wizard-intro">Sign in once. This checklist updates for you.</p><section class="panel"><ul class="list check-list">${[['Google Sheets','Example Google account'],['Gmail',s.mismatch?'Different Google account':'Example Google account'],['Pinterest','@stunningcrochet']].map(([n,d])=>`<li><span class="tick ${!s.logins?'pending':''}">${s.logins?'✓':'○'}</span><div><strong>${n}</strong><p>${s.logins?d:'Waiting for your login'}</p></div>${status(s.logins?'Connected':'Not connected',s.logins?'':'neutral')}</li>`).join('')}</ul>${s.mismatch?`<div class="notice warning mt"><div><strong>Use the same Google account</strong><p>Gmail and Sheets need to belong to your bot account.</p></div></div>${button('Fix Google login','fix-google','','primary')}`:`<div class="mt">${button(s.logins?'Check again':'Connect in Activepieces','setup-logins','','primary')}</div>`}</section><p class="hint mt">We only use these logins for your automation.</p>${button('Preview a login mismatch','preview-mismatch','','quiet small')}`;
  if(step===5)content=`<h1>Your Pinterest account</h1><p class="wizard-intro">A few defaults. You can change them any time.</p><section class="panel">${field('Automation name',`<input id="setup-name" value="${esc(s.name)}">`)}<div class="identity mb0">${icon('🧶')}<div><strong>Stunning Crochet</strong><p class="hint">@stunningcrochet · Detected from Pinterest</p></div></div><div class="form-row mt">${field('Pins per day',`<select id="setup-daily">${[2,3,4,6].map(n=>`<option value="${n}"${s.daily===n?' selected':''}>${n} pins</option>`).join('')}</select>`)}${field('Category',`<select id="setup-category">${options(['Crochet & knitting','Food & recipes','Home & garden','Printables','DIY & crafts','Other'],s.category||'Crochet & knitting')}</select>`)}</div><p class="hint mt">Spread evenly through your day. Africa/Casablanca.</p><div class="style-summary"><strong>Have a pin style in mind?</strong><p>Add your reference images after setup.</p></div></section>`;
  if(step===6)content=s.deployed?`<section class="panel deployment-success"><div class="success-mark">✓</div><h1>Your automation is connected</h1><p>Your posting automation and Google Sheet are ready. Next, create your first pins in Codex.</p><div class="actions">${link('Get my first Codex prompt','#automation/stunning/new-pins','primary')}${button('Open spreadsheet','spreadsheet-preview')}</div><p class="hint mt">Codex creates the pins → fills your sheet → your automation posts them. Connect Codex to the bot’s Google Drive once.</p></section>`:`<h1>Finish your setup</h1><p class="wizard-intro">We’ll create your posting automation and Google Sheet.</p><section class="panel"><div class="subtle-row"><div><strong>${esc(s.name)}</strong><p>@stunningcrochet</p></div><a class="text-link small" href="#setup/5">Edit</a></div><div class="subtle-row"><div><strong>${s.daily} pins a day</strong><p>Spread evenly · Africa/Casablanca</p></div></div><div class="subtle-row"><div><strong>Email${s.telegram?' + Telegram':''} reports</strong><p>Daily at 21:00</p></div><a class="text-link small" href="#setup/3">Edit</a></div><div class="subtle-row"><div><strong>Logins checked</strong><p>Google Sheets, Gmail and Pinterest</p></div><span class="tick">✓</span></div></section><p class="hint mt">After setup: create your first pins in Codex. Posting starts when your sheet has pins ready.</p>`;
  const ready=step===2?s.connected:step===3?!s.telegram||(s.telegramVerified&&s.botStarted):step===4?s.logins&&!s.mismatch:true;
  return `${wizardHeader(step)}<main id="main-content" class="wizard"><ol class="wizard-steps">${names.map((n,i)=>`<li class="${i+1===step?'current':i+1<step?'done':''}"><span class="step-number">${i+1<step?'✓':i+1}</span>${n}</li>`).join('')}</ol><div><p class="step-label">Step ${step} of 6 · Progress saved in this preview</p>${content}${!s.deployed||step!==6?`<div class="wizard-footer">${link('← Back',`#setup/${step-1}`)}${step===6?button('Finish setup','deploy','','primary'):button('Continue →','setup-next',`data-step="${step}"${ready?'':' disabled'}`,'primary')}${!ready?`<p class="hint">${step===2?'Connect your key to continue.':step===3?'Connect your bot and tap Start to continue.':'Connect all three logins with the same Google account.'}</p>`:''}</div>`:''}</div></main>`;
}
function privacyPage() {
  return `${wizardHeader(1)}<main id="main-content" class="privacy-copy"><a href="#setup/1" class="back-link">← Sign in</a><h1>Your privacy</h1><p>This is a preview of the privacy screen. The final notice needs review before launch.</p><h2>Google sign-in</h2><p>We request your name, email and profile picture to create your website account. Google sign-in does not grant access to your Drive or Gmail.</p><h2>Your automation</h2><p>Your Activepieces key connects your own automation workspace. The finished website will encrypt it and keep it on the server. Other members cannot access your setup.</p><h2>Your pin references</h2><p>Your reference images belong to your account. Private storage and image delivery will be verified before launch.</p><h2>Control your data</h2><p>You can remove your website account from Settings. Google and Pinterest accounts remain separate. Contact and retention details will be added before launch.</p></main>`;
}
function render(preservePosition=true) {
  const previousY=window.scrollY;
  const focused=document.activeElement;
  const focusId=focused?.id;
  const focusAction=focused?.dataset?.action;
  const focusMode=focused?.dataset?.mode;
  const focusEntity=focused?.dataset?.id;
  page=(location.hash.slice(1)||'overview').split('/');
  if(page[0]==='autopilot'){page[0]='automation';history.replaceState(null,'','#'+page.join('/'));}
  let html;
  const a=page[0]==='automation'?currentAutomation():undefined;
  const tab=page[2]||'overview';
  if(page[0]==='setup')html=setupPage(Math.min(6,Math.max(1,Number(page[1])||1)));
  else if(page[0]==='style')html=stylePage(Object.hasOwn(state.accounts,page[1])?page[1]:'stunning');
  else if(page[0]==='privacy')html=privacyPage();
  else if(page[0]==='empty')html=overview(true);
  else if(page[0]==='admin')html=adminPage();
  else if(a)html=tab==='accounts'?accountsPage(a):tab==='new-pins'?newPinsPage(a):tab==='runs'?runsPage(a):tab==='history'?historyPage(a):tab==='settings'?settingsPage(a):automationOverview(a);
  else html=page[0]==='new-pins'?newPinsPage():page[0]==='history'?historyPage():page[0]==='settings'?settingsPage():overview();
  $('#app').innerHTML=html;
  $('#main-content').tabIndex=-1;
  if(a)$('#main-content').insertAdjacentHTML('afterbegin','<a class="back-link" href="#overview">← All automations</a>');
  document.documentElement.dataset.theme=state.theme;
  document.title=`${$('h1')?.textContent||'Automation'} — clickable preview`;
  if(preservePosition){
    let next=focusId?document.getElementById(focusId):null;
    if(!next&&focusAction)next=[...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===focusAction&&el.dataset.mode===focusMode&&el.dataset.id===focusEntity);
    next?.focus({preventScroll:true});
    window.scrollTo(0,previousY);
  }else window.scrollTo(0,0);
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
  return `Create ${b.total} original Pinterest pins for ${state.accounts[b.account].name} (@${state.accounts[b.account].handle}).\n\nAccount: ${b.account}. Use only this account.\nCategory: ${b.category||state.accounts[b.account].category}. Niche: ${b.niche||state.accounts[b.account].niche}.\nBatch: ${b.title}.\n${b.mode==='links'?b.rows.map(r=>r.url+' — '+r.count+' pins').join('\n'):b.mode==='website'?`${b.rounds} rounds, ${b.perRound} pins per round. Website: ${b.website}`:`Topic: ${b.topic}. Pins without destination links.`}\n\nSTYLE VERSION ${b.styleVersion}\n${b.refs.length?`Open these attached reference images before planning: ${b.refs.map(r=>r.name).join(', ')}. If any cannot be read, stop and ask for the missing attachment. Infer the palette, lettering, textures, mood and brand details from the images yourself. Do not ask the user to describe a style or write a design brief.`:'Develop a clear, recognizable style from this account’s niche and recent profile. Do not require a written style brief.'}\n\nKeep the palette, mood and brand details. Vary scenes, layout, crop and headline structure. Do not copy a complete reference composition. Use at least ${Math.min(b.total,5)} distinct formats when the batch size allows.\n\nResearch current relevant trends and record source links and dates. If research is unavailable, say so. Check the recent profile and queued pins to avoid duplicates. Do not change the core identity just because a trend is popular.\n\nPreview the batch for visual review before posting. This prototype package demonstrates reference handoff only; it is not a live spreadsheet instruction or the final production prompt.`;
}
function readBuilder() {
  const selected=$('#batch-account');if(selected)batchAccount=selected.value;
  document.querySelectorAll('[data-row]').forEach(el=>{builder.rows[Number(el.dataset.row)][el.dataset.kind]=el.dataset.kind==='count'?safeNumber(el.value):el.value.trim();});
  if(batchMode==='no-link')builder.topic=state.accounts[batchAccount].niche;
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
  const b={account:batchAccount,total:batchTotal(),mode:batchMode,topic:builder.topic,rows:clone(builder.rows),rounds:builder.rounds,perRound:builder.perRound,website:c.site,refs:clone(c.refs),category:c.category,niche:c.niche,styleMode:'automatic',briefVersion:2,styleVersion:c.styleVersion};
  b.title=batchMode==='links'?`${b.total} pins from page links`:batchMode==='website'?`${b.rounds} website rounds`:b.topic;
  b.fingerprint=JSON.stringify(b);
  preparedBatch=state.batches.find(x=>x.fingerprint===b.fingerprint)||{...b,id:'batch-'+Date.now(),status:'ready',copies:0,date:'Just now'};
  batchModal(preparedBatch);
}
function batchModal(b) {
  preparedBatch=b;
  modal('Your Codex prompt',`<p>Ready-to-paste instructions for <strong>${b.total} pins</strong> for ${esc(state.accounts[b.account].name)}.</p><ol class="journey-list"><li><strong>Copy the prompt</strong><span>Paste it into Codex.</span></li>${b.refs.length?'<li><strong>Attach your style images</strong><span>Download the files below, unzip, and attach them in Codex.</span></li>':''}<li><strong>Let Codex create the pins</strong><span>Review the images. Codex then fills your sheet with the finished pins.</span></li></ol>${refsStrip(b.refs)}<p class="hint mt">${b.refs.length?`The download includes your prompt and ${b.refs.length} reference images.`:'Codex chooses a style from your account’s niche.'} Sample prompt for this preview.</p>`,`${b.refs.length?button('Download prompt + images','download-package'):''}${button('Copy Codex prompt','copy-prepared','','primary')}`);
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
    const url=URL.createObjectURL(zipStore(files));const a=document.createElement('a');a.href=url;a.download=`automation-${b.account}-style-${b.styleVersion}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
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
let addingTo;
function addPinterest(id) {
  const available=state.automations.filter(a=>a.status!=='setup');
  if(!available.length){location.hash='setup/2';return;}
  addingTo=available.find(a=>a.id===id)?.id||available[0].id;
  modal('Add Pinterest account',`${available.length>1&&!id?field('Choose automation',`<select id="add-to-automation">${available.map(a=>`<option value="${a.id}"${a.id===addingTo?' selected':''}>${esc(a.name)} · ${pinterestCount(a.accounts.length)}</option>`).join('')}</select>`):''}<p>Connect in Activepieces once. Your account will appear here automatically.</p><ol class="journey-list"><li><strong>Open Activepieces</strong><span>We’ll take you to Connections.</span></li><li><strong>Choose New Connection → Pinterest</strong><span>Sign in to your Pinterest account, then click Save.</span></li><li><strong>Come back here</strong><span>We’ll find it and fill in the settings.</span></li></ol><p class="hint mt">This preview uses a sample connection. No live account changes.</p><a class="text-link small" href="#setup/2">Use another Activepieces workspace</a>`,`${button('Cancel','close-dialog')}${button('Open Activepieces','preview-pinterest-login','','primary')}`);
}
function pinterestLoginPreview() {
  addingTo=$('#add-to-automation')?.value||addingTo;
  modal('Activepieces · connection preview',`<p>On the Connections page:</p><ol class="journey-list"><li><strong>New Connection</strong></li><li><strong>Pinterest</strong></li><li><strong>Sign in to Pinterest, then Save</strong></li></ol><div class="style-summary"><strong>Sample Pinterest account</strong><p>@cozy_stitches_demo</p></div><p class="hint mt">This button simulates finishing that sign-in.</p>`,`${button('Back','add-pinterest',`data-id="${addingTo}"`)}${button('Preview saved connection','finish-add-pinterest','','primary')}`);
}
function finishAddPinterest() {
  const a=state.automations.find(x=>x.id===addingTo);if(!a)return;
  const id='cozy-demo',existing=state.accounts[id];
  if(existing){const current=automationForAccount(id);modal('Already connected',`<p>Cozy Stitches is already in ${esc(current.name)}.</p>`,`${button('Close','close-dialog')}${link('Open account',`#automation/${current.id}/accounts`,'primary')}`);return;}
  if(!existing){
    const source=state.accounts[a.accounts[0]];
    saveDraft(a.accounts[0],'Pinterest account added');
    state.accounts[id]={name:'Cozy Stitches',handle:'cozy_stitches_demo',category:source.category,niche:source.niche,daily:4,source:'niche',site:'',hours:['08:00','12:00','16:00','20:00'],refs:[],styleVersion:1,enabled:true};
    a.accounts.push(id);persist();
  }
  closeModal();history.replaceState(null,'',`#automation/${a.id}/accounts`);render(false);
  modal('Pinterest connected',`<div class="identity">${icon('🧶')}<div><strong>Cozy Stitches</strong><p class="hint">@cozy_stitches_demo</p></div></div><ul class="list check-list"><li><span class="tick">✓</span><div>4 pins a day, spread evenly</div></li><li><span class="tick">✓</span><div>Settings filled in for you</div></li></ul><p class="hint mt">Add style examples now, or use the account’s niche. Review & apply makes the new account live in the finished product.</p>`,`${link('Add style examples',`#style/${id}`)}${button('Review & activate','review-apply','','primary')}`);
}
function memberModal(id) {
  syncOwnerCounts();
  const m=state.members.find(x=>x.id===id);if(!m)return;
  modal(esc(m.name),`<p>${esc(m.email)}</p>${status(m.status==='active'?'Website access active':'Website access blocked',m.status==='active'?'':'neutral')}<div class="metrics">${[['Automations',m.automations],['Pinterest accounts',m.accounts],['Live automations',m.deployed],['Joined',m.joined]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div><h3>Their automations</h3><div class="style-summary">${m.automations?`<strong>${esc(m.owner?state.automations.map(a=>a.name).join(' · '):m.id==='salma'?'Everyday recipes':'Moroccan Kitchen')}</strong><p>${m.accounts} connected Pinterest accounts · ${m.deployed} deployed</p>`:'<p>No automations yet.</p>'}</div><p class="hint mt">Last active: ${esc(m.last)}. Website access controls do not delete Google or Pinterest accounts. Independently running automations keep running.</p>`,m.owner?button('Close','close-dialog'):`${button('Remove access','remove-member',`data-id="${m.id}"`,'danger')}${button(m.status==='blocked'?'Unblock member':'Block member','toggle-member',`data-id="${m.id}"`,'primary')}`);
}
async function simulateProgress(kind,id) {
  if(busy)return;busy=true;
  const stages=kind==='deploy'?['Create automation','Publish settings','First run','Prepare spreadsheet']:kind==='apply'?['Update settings','Publish changes','Check the first run']:['Check connections','Read the queue','Finish run'];
  const heading=kind==='deploy'?'Setting up your automation':kind==='apply'?'Applying your changes':'Running your automation';
  for(let i=0;i<=stages.length;i++){
    modal(heading,`<p>Simulated preview. No live changes.</p><div class="steps-progress">${stages.map((s,j)=>`<div class="subtle-row">${j<i?'<span class="tick">✓</span>':j===i?'<span class="spinner" aria-hidden="true"></span>':'<span class="tick pending">○</span>'}<span>${s}</span><span class="sr-only">${j<i?'Finished':j===i?'In progress':'Waiting'}</span></div>`).join('')}</div>`);
    if(i<stages.length)await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(kind==='deploy'){state.setup.deployed=true;let a=state.automations.find(x=>x.id==='stunning');if(!a){a=clone(initial.automations[1]);state.automations.push(a);}const c=state.accounts.stunning;a.name=state.setup.name;a.category=state.setup.category||c.category;c.category=a.category;c.daily=state.setup.daily;c.hours=Array.from({length:c.daily},(_,i)=>`${String(Math.round(6+i*17/Math.max(1,c.daily-1))).padStart(2,'0')}:00`);busy=false;closeModal();persist();render();toast('Preview setup finished.');}
  else if(kind==='apply'){
    const changed=state.automations.find(a=>a.id===state.draftFor);
    for(const account of changed?.accounts||[]){const c=state.accounts[account];state.versions.unshift({id:'v'+Date.now()+'-'+account,title:'Settings applied',detail:state.draftNotes.join(' · '),date:'Just now',account,snapshot:clone(c)});}
    state.draft=false;state.draftNotes=[];delete state.draftSnapshot;busy=false;persist();render();
    modal('Changes applied',`<p>Preview complete. Next post: <strong>15:00</strong>.</p>`,button('Done','close-dialog','','primary'));
  }else{
    state.runs.unshift({id:'run-'+Date.now(),time:'Just now',status:'success',summary:'Queue checked · no pins due',duration:'2s'});busy=false;persist();render();
    modal('Run finished',`<div class="notice success mb0"><div>${status('Your queue was checked')}<p>No pins are due right now. Next post: 15:00.</p></div></div><p class="hint mt">Simulated result. This preview does not publish pins.</p>`,`${link('See runs',`#automation/${id}/runs`)}${button('Done','close-dialog','','primary')}`);
  }
}
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip')){event.preventDefault();$('#main-content').focus();return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action,id=target.dataset.id;
  if(target.disabled)return;
  if(action==='close-dialog')return closeModal();
  if(action==='add-pinterest')return addPinterest(id);
  if(action==='preview-pinterest-login')return pinterestLoginPreview();
  if(action==='finish-add-pinterest')return finishAddPinterest();
  if(action==='undo'){if(pendingUndo)pendingUndo();$('#toast').classList.remove('visible');return;}
  if(action==='reset'){modal('Reset the preview?','<p>This clears only the sample changes on this device.</p>',`${button('Keep changes','close-dialog')}${button('Reset preview','confirm-reset','','primary')}`);return;}
  if(action==='confirm-reset'){state=clone(initial);persist();closeModal();location.hash='overview';render();return;}
  if(action==='setup-help'){modal('One step at a time','<p>Your progress saves automatically in this preview. Use Back to change an earlier choice, or Save & exit to return home.</p>',button('Got it','close-dialog','','primary'));return;}
  if(action==='help'){modal('What would you like to do?',`<div class="stack">${link('Set up an automation →','#setup/2')}${link('Make new pins →','#new-pins')}${link('See an empty home →','#empty')}</div><p class="hint mt">This preview uses sample data. No live account is changed.</p>`);return;}
  if(action==='toggle-automation'){
    const a=state.automations.find(x=>x.id===id);if(!a)return;
    modal(a.status==='paused'?'Resume '+esc(a.name)+'?':'Pause '+esc(a.name)+'?',`<p>${a.status==='paused'?'Posting will follow your saved times.':'Scheduled posting will stop. Your waiting pins stay in the queue.'}</p>`,`${button('Cancel','close-dialog')}${button(a.status==='paused'?'Resume automation':'Pause automation','confirm-toggle',`data-id="${id}"`,'primary')}`);return;
  }
  if(action==='confirm-toggle'){const a=state.automations.find(x=>x.id===id);a.status=a.status==='paused'?'running':'paused';persist();closeModal();render();toast(a.status==='paused'?'Automation paused in this preview.':'Automation resumed in this preview.');return;}
  if(action==='run-now')return simulateProgress('run',id);
  if(action==='deploy')return simulateProgress('deploy');
  if(action==='review-apply'){modal('Apply these changes?',`<p>Your draft is saved. Applying updates your automation.</p><ul>${state.draftNotes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`,`${button('Keep editing','close-dialog')}${button('Apply changes','apply','','primary')}`);return;}
  if(action==='apply')return simulateProgress('apply');
  if(action==='discard-draft'){if(state.draftSnapshot){state.accounts=clone(state.draftSnapshot.accounts);state.notifications=clone(state.draftSnapshot.notifications);if(state.draftSnapshot.automations)state.automations=clone(state.draftSnapshot.automations);}state.draft=false;state.draftNotes=[];delete state.draftSnapshot;persist();render();toast('Draft changes undone.');return;}
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
  if(action==='confirm-bot-start'){state.setup.botStarted=true;persist();modal('Test message preview',`<div class="style-summary"><strong>Your automation is connected ✓</strong><p>You’ll receive posting updates here.</p></div><p class="hint mt">No Telegram message was sent by this prototype.</p>`,button('Done','finish-bot-preview','','primary'));return;}
  if(action==='finish-bot-preview'){closeModal();render();return;}
  if(action==='setup-logins'){state.setup.logins=true;persist();render();toast('Sample logins detected.');return;}
  if(action==='preview-mismatch'){state.setup.logins=true;state.setup.mismatch=true;persist();render();return;}
  if(action==='fix-google'){state.setup.mismatch=false;persist();render();toast('The sample Google accounts now match.');return;}
  if(action==='setup-next'){persist();location.hash=`setup/${Number(target.dataset.step)+1}`;return;}
  if(action==='spreadsheet-preview'){modal('Your spreadsheet',`<p>A sample of the connected spreadsheet.</p><div class="table-wrap"><table><thead><tr><th>Pin title</th><th>Status</th></tr></thead><tbody><tr><td>Your first pin goes here</td><td>Waiting for pins</td></tr></tbody></table></div><p class="hint mt">The finished website opens your real Google Sheet.</p>`,button('Done','close-dialog','','primary'));return;}
  if(action==='sign-out'){location.hash='setup/1';toast('Signed out of the preview.');return;}
  if(action==='delete-automation'){modal('Delete '+esc(state.automations.find(x=>x.id===id).name)+'?',`<p>In the finished website, this removes its Activepieces flow and website setup. Your Pinterest account and spreadsheet stay separate.</p>${field('Type DELETE to confirm','<input id="delete-confirm" autocomplete="off">')}`,`${button('Cancel','close-dialog')}${button('Delete automation','confirm-delete-automation',`data-id="${id}"`,'destructive')}`);return;}
  if(action==='confirm-delete-automation'){if($('#delete-confirm').value!=='DELETE')return toast('Type DELETE to confirm.');state.automations=state.automations.filter(a=>a.id!==id);persist();closeModal();location.hash='overview';return;}
  if(action==='delete-website-account'){modal('Delete your website account?',`<p>Your website setup and saved history will be removed. Google and Pinterest accounts stay separate.</p>${field('Type DELETE to confirm','<input id="delete-confirm" autocomplete="off">')}`,`${button('Keep account','close-dialog')}${button('Delete website account','confirm-delete-website','','destructive')}`);return;}
  if(action==='confirm-delete-website'){if($('#delete-confirm').value!=='DELETE')return toast('Type DELETE to confirm.');state=clone(initial);persist();closeModal();location.hash='setup/1';toast('Sample website account cleared.');return;}
});
document.addEventListener('input',event=>{
  const t=event.target;
  if(t.id==='automation-search'){let visible=0;document.querySelectorAll('#automation-cards .card').forEach(c=>{c.hidden=!c.dataset.search.includes(t.value.toLowerCase());if(!c.hidden)visible++;});$('#no-automations').hidden=visible>0;}
  if(t.id==='member-search'||t.id==='member-filter')filterMembers();
  if(t.matches('[data-row],#batch-count,#batch-rounds,#batch-per-round')){readBuilder();const total=batchTotal();$('#batch-total').textContent=total;$('#batch-days').textContent=Math.ceil(total/state.accounts[batchAccount].daily)+' days of posts';}
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
  if(t.dataset.notification){saveDraft(currentAutomation().accounts[0],'Notifications updated');state.notifications[t.dataset.notification]=t.checked;persist();}
  if(t.id==='automation-zone'){const a=currentAutomation();saveDraft(a.accounts[0],'Time zone updated');a.zone=t.value;persist();}
  if(t.id==='report-time'){saveDraft(currentAutomation().accounts[0],'Report time updated');state.notifications.report=t.value;persist();}
  if(t.classList.contains('draft-setting')){saveDraft(currentAutomation().accounts[0],'Connection or time zone changed');persist();}
  if(t.id==='setup-telegram'){state.setup.telegram=t.checked;persist();render();}
  if(t.id==='setup-daily'){state.setup.daily=Number(t.value);persist();}
  if(t.id==='setup-category'){state.setup.category=t.value;persist();}
});
function filterMembers(){const query=$('#member-search')?.value.toLowerCase()||'',filter=$('#member-filter')?.value||'all';document.querySelectorAll('[data-member]').forEach(row=>row.hidden=!row.dataset.search.includes(query)||(filter!=='all'&&row.dataset.memberStatus!==filter));}
document.addEventListener('dragover',event=>{const zone=event.target.closest('#upload-zone');if(zone){event.preventDefault();zone.classList.add('dragging');}});
document.addEventListener('dragleave',event=>event.target.closest('#upload-zone')?.classList.remove('dragging'));
document.addEventListener('drop',event=>{const zone=event.target.closest('#upload-zone');if(zone){event.preventDefault();zone.classList.remove('dragging');uploadReferences([...event.dataTransfer.files],zone.dataset.account);}});
$('#dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
window.addEventListener('hashchange',()=>{if($('#dialog').open&&!busy)closeModal();render(false);$('#main-content').focus({preventScroll:true});});
persist();
render(false);
