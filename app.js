'use strict';
// Toutes les données comptables sont lues depuis un fichier choisi par l'utilisateur.
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n), num=n=>new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n), dateFR=d=>d.slice(8,10)+'-'+d.slice(5,7);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const base=new Date(Date.UTC(2000,0,1));base.setUTCFullYear(1);const epoch=base.getTime(), dateFromSerial=n=>{const d=new Date(epoch);d.setUTCFullYear(1);d.setUTCDate(d.getUTCDate()+n-1);return d.toISOString().slice(0,10)};
const serialFromDate=s=>{const [y,m,d]=s.split('-').map(Number);return Math.round((Date.UTC(y,m-1,d)-epoch)/86400000)+1};
const dateToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let snapshot=null, expanded=null;
function choices(id,arr){const node=$(id),old=node.value;node.replaceChildren();for(const [v,t] of arr){const op=el('option',t);op.value=v;node.append(op)}if(arr.some(([v])=>v===old))node.value=old}
function readXHB(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror')||doc.documentElement.tagName!=='homebank')throw Error('XML HomeBank invalide');const root=doc.documentElement, nodes=t=>[...root.children].filter(n=>n.tagName===t),attr=(n,k)=>n.getAttribute(k)||'';
 const accounts=nodes('account').map(n=>({id:attr(n,'key'),name:attr(n,'name'),type:attr(n,'type'),pos:Number(attr(n,'pos')||0),visible:!(Number(attr(n,'flags')||0)&16),initial:Number(attr(n,'initial')||0)})).sort((a,b)=>a.pos-b.pos);if(!accounts.length)throw Error('Aucun compte');const byAcc=new Map(accounts.map(a=>[a.id,a]));
 const categories=nodes('cat').map(n=>({id:attr(n,'key'),name:attr(n,'name'),parent:attr(n,'parent'),flags:Number(attr(n,'flags')||0),b:Array.from({length:13},(_,i)=>Number(attr(n,'b'+i)||0))}));const byCat=new Map(categories.map(c=>[c.id,c]));
 const payees=nodes('pay').map(n=>({id:attr(n,'key'),name:attr(n,'name')}));const byPay=new Map(payees.map(p=>[p.id,p.name]));
 const operations=nodes('ope').map((n,i)=>({id:i,serial:Number(attr(n,'date')),amount:Number(attr(n,'amount')),account:attr(n,'account'),dst:attr(n,'dst_account'),st:Number(attr(n,'st')||0),flags:Number(attr(n,'flags')||0),paymode:attr(n,'paymode')||'0',payee:byPay.get(attr(n,'payee'))||'',category:attr(n,'category'),memo:attr(n,'wording')}));if(operations.some(o=>!Number.isFinite(o.amount)||!Number.isFinite(o.serial)||!byAcc.has(o.account)))throw Error('Opérations non interprétables');
 const models=nodes('fav').map(n=>({id:attr(n,'key'),account:attr(n,'account'),amount:Number(attr(n,'amount')||0),payee:byPay.get(attr(n,'payee'))||'',category:attr(n,'category'),memo:attr(n,'wording'),paymode:attr(n,'paymode')||'0'}));
 return {accounts,categories,byCat,payees,operations,models};}
function cents(n){return Math.round(n*100)}function sumCents(list){return list.reduce((s,n)=>s+cents(n),0)/100}
function balances(acc,asof){const arr=snapshot.operations.filter(o=>o.account===acc.id),ref=serialFromDate(asof),reconciled=acc.initial+sumCents(arr.filter(o=>o.st===2).map(o=>o.amount)),pointed=acc.initial+sumCents(arr.filter(o=>o.st>=1).map(o=>o.amount)),today=acc.initial+sumCents(arr.filter(o=>o.st>=1||(o.st===0&&o.serial<=ref&&!isReminderOccurrence(o))).map(o=>o.amount)),future=acc.initial+sumCents(arr.filter(o=>o.st>=1||(o.st===0)).map(o=>o.amount));return {r:reconciled,p:pointed,t:today,f:future}}
function isReminderOccurrence(o){return Boolean(o.flags&32)}
function isFuture(o,asof=dateToday()){return o.st===0&&(o.serial>serialFromDate(asof)||isReminderOccurrence(o))}
function isTransfer(o){return Boolean((o.flags&8)||o.dst)}
function eligible(o,month){return !isTransfer(o)&&!(o.flags&32)&&dateFromSerial(o.serial).startsWith(month)}
// HomeBank : les revenus et dépenses sont définis par la nature de la catégorie, non par le signe du mouvement.
// Un remboursement positif dans une catégorie de dépense diminue les dépenses nettes.
function incomeCategory(catId){let c=snapshot.byCat.get(catId),guard=0;while(c&&c.parent&&guard++<10)c=snapshot.byCat.get(c.parent);return Boolean(c&&(c.flags&2))}
function calcMonthly(month){const a=snapshot.operations.filter(o=>eligible(o,month)&&snapshot.byCat.has(o.category));const income=sumCents(a.filter(o=>incomeCategory(o.category)).map(o=>o.amount));const expense=-sumCents(a.filter(o=>!incomeCategory(o.category)).map(o=>o.amount));return {income,expense}}
function item(parent,title,detail,amount,icon){const wrap=el('div',undefined,'item'),left=el('div',undefined,'opline');if(icon)left.append(el('span',icon,'payicon'));const t=el('div');t.append(el('div',title||'(sans tiers)','name'),el('div',detail||'','detail'));left.append(t);wrap.append(left);if(amount!==null&&amount!==undefined)wrap.append(el('span',money(amount),'money '+(amount<0?'red':'green')));parent.append(wrap);return wrap}
const paymodes={'0':['↔','Non précisé / virement'],'2':['▤','Chèque'],'3':['▣','Espèces'],'4':['↩','Autre paiement'],'6':['CB','Carte bancaire'],'8':['⇢','Virement bancaire'],'11':['↻','Prélèvement automatique']};
function render(){if(!snapshot)return;const visible=snapshot.accounts.filter(a=>a.visible),asof=dateToday(),month=asof.slice(0,7),total=sumCents(visible.map(a=>balances(a,asof).t));$('asof').textContent=dateFR(asof);$('total').textContent=money(total);const monthly=calcMonthly(month);$('income').textContent=money(monthly.income);$('expense').textContent=money(monthly.expense);const net=monthly.income-monthly.expense;$('balance').textContent=money(net);$('balance').className=net<0?'red':'green';const bar=$('balancebar');bar.replaceChildren();const d=monthly.income+monthly.expense;if(d>0){for(const [value,color] of [[monthly.income,'#4d9b40'],[monthly.expense,'#c13c42']]){const s=el('span');s.style.width=(100*value/d)+'%';s.style.background=color;bar.append(s)}}
 $('overviewAccounts').replaceChildren();for(const a of visible){const b=balances(a,asof),r=item($('overviewAccounts'),a.name,'',null);const right=el('div',undefined,'overview-sums'),now=el('span',money(b.t),'money '+(b.t<0?'red':'green')),future=el('div',undefined,'future-value');future.append(el('span','À venir :','small'),el('span',money(b.f),'money '+(b.f<0?'red':'green')));right.append(now,future);r.append(right)}
 $('upcoming').replaceChildren();const upcoming=snapshot.operations.filter(o=>isFuture(o,asof)).sort((a,b)=>a.serial-b.serial);if(!upcoming.length)$('upcoming').append(el('div','Aucune opération future enregistrée','empty'));for(const o of upcoming){const detail=dateFR(dateFromSerial(o.serial))+(isReminderOccurrence(o)?' · Rappel à confirmer':' · Opération future');const r=item($('upcoming'),o.payee||snapshot.accounts.find(a=>a.id===o.account)?.name,detail,o.amount);r.classList.add('future-operation');if(isReminderOccurrence(o))r.classList.add('reminder-operation');}
 const body=$('accountRows');body.replaceChildren();for(const [group,label] of [['bank','BANQUE ET ESPÈCES'],['savings','ÉPARGNE']]){const groupAccounts=visible.filter(a=>group==='bank'?a.type!=='7':a.type==='7');if(!groupAccounts.length)continue;const header=el('tr',undefined,'grouphead'),headcell=el('td',label);headcell.colSpan=5;header.append(headcell);body.append(header);for(const a of groupAccounts){const b=balances(a,asof),tr=el('tr');for(const [i,v] of [a.name,b.r,b.p,b.t,b.f].entries()){const cell=el('td',i?num(v):v);if(i)cell.className=v<0?'red':'green';tr.append(cell)}body.append(tr)}}const foot=$('accountTotal');foot.replaceChildren();const sums=['r','p','t','f'].map(k=>sumCents(visible.map(a=>balances(a,asof)[k])));const tr=el('tr');for(const [i,v] of ['Total',...sums].entries()){const cell=el('td',i?num(v):v);cell.style.fontWeight='800';if(i)cell.className=v<0?'red':'green';tr.append(cell)}foot.append(tr);
 renderOps();renderBudget();}
function renderOps(){const target=$('operationsList');target.replaceChildren();if(!snapshot)return;const ac=$('filterAccount').value,month=$('filterMonth').value;const list=snapshot.operations.filter(o=>(ac==='all'||o.account===ac)&&(!month||dateFromSerial(o.serial).startsWith(month))).sort((a,b)=>b.serial-a.serial||b.id-a.id);$('opCount').textContent=list.length+' opération(s)';if(!list.length)target.append(el('div','Aucune opération pour cette sélection','empty'));for(const o of list){const a=snapshot.accounts.find(x=>x.id===o.account);const cat=snapshot.byCat.get(o.category);const pay=paymodes[o.paymode]||['•','Mode '+o.paymode];const r=item(target,o.payee||o.memo||'(sans tiers)',dateFR(dateFromSerial(o.serial))+' · '+a.name+(cat?' · '+cat.name:''),o.amount,pay[0]);if(isFuture(o)){r.classList.add('future-operation');if(isReminderOccurrence(o))r.classList.add('reminder-operation');r.querySelector('.detail')?.append(' · '+(isReminderOccurrence(o)?'Rappel à confirmer':'À venir'));}r.title=pay[1]+' · '+(o.st===2?'Rapprochée':o.st===1?'Pointée':'Non pointée')+(isTransfer(o)?' · Virement interne':'')}}
function budgetLimit(c,month){return (c.flags&8)?(c.b[Number(month.slice(5))]||0):0}
function categoryActual(cat,month){return sumCents(snapshot.operations.filter(o=>eligible(o,month)&&o.category===cat.id).map(o=>o.amount))}
function categoryLine(parent,name,actual,budget,sub=false,isSavings=false){
 const btn=el('button',undefined,'catbutton');btn.type='button';
 const head=el('div',undefined,'row budget-head');const left=el('span',undefined,'budget-title');
 const isIncome=budget>0,spent=isIncome?actual:-actual,limit=Math.abs(budget),remaining=limit-spent;
 if(isSavings)btn.classList.add('gold');
 left.append(el('span',name));
 // Montant restant seulement lorsqu'il est strictement positif ; aucune ligne supplémentaire.
 // La jauge Épargne reste une allocation indicative, sans restant calculé.
 if(!isSavings&&remaining>0.005){const rest=el('strong',' · '+money(remaining),'budget-rest');rest.title=isIncome?'Reste à percevoir':'Reste à dépenser';left.append(rest)}
 head.append(left,el('span',money(spent)+' / '+money(limit),'small money budget-figures'));btn.append(head);
 const line=el('div',undefined,'row');line.style.marginTop='6px';const bar=el('div',undefined,'bar'),fill=el('span');const rate=limit>0?spent/limit*100:null;
 fill.style.width=isSavings?'100%':rate!==null?Math.min(100,Math.max(0,rate))+'%':'0%';fill.style.background=isSavings?'#c6a046':rate!==null&&rate>100?'var(--red)':'var(--green)';bar.append(fill);line.append(bar,el('span',isSavings?'Prévu':rate!==null?Math.round(rate)+' %':'—','small'));btn.append(line);parent.append(btn);return btn
}
function renderBudget(){if(!snapshot)return;const month=$('budgetMonth').value,root=$('budgetList');root.replaceChildren();const cats=snapshot.categories;const topLevel=cats.filter(c=>!c.parent).sort((a,b)=>{const rank=c=>c.name.toLocaleLowerCase('fr')==='traitements et salaires'?0:c.name.toLocaleLowerCase('fr')==='épargne'?1:2;return rank(a)-rank(b)});for(const c of topLevel){const children=cats.filter(x=>x.parent===c.id);const actual=categoryActual(c,month)+sumCents(children.map(x=>categoryActual(x,month))),budget=budgetLimit(c,month)+sumCents(children.map(x=>budgetLimit(x,month)));if(!budget)continue;const container=el('div'),btn=categoryLine(container,(expanded===c.id?'▾ ':'▸ ')+c.name,actual,budget,false,c.name==='Épargne'),sub=el('div',undefined,'subcats');sub.hidden=expanded!==c.id;for(const child of children){const a=categoryActual(child,month),b=budgetLimit(child,month);if(a||b)categoryLine(sub,child.name,a,b,true,c.name==='Épargne').disabled=true}btn.onclick=()=>{expanded=expanded===c.id?null:c.id;renderBudget()};container.append(sub);root.append(container)}if(!root.children.length)root.append(el('div','Aucune catégorie budgétée pour ce mois','empty'));renderCharts()}
function renderCharts(){if(!snapshot)return;const month=$('budgetMonth').value;const cats=snapshot.categories;const byCategory=cats.filter(c=>!c.parent).map(c=>{const children=cats.filter(x=>x.parent===c.id);const value=incomeCategory(c.id)?0:-sumCents([categoryActual(c,month),...children.map(x=>categoryActual(x,month))]);return {name:c.name,value}}).filter(x=>x.value>0);const donut=$('donut');donut.replaceChildren();if(!byCategory.length){donut.append(el('div','Aucune dépense pour cette période','empty'))}else{const colors=['#4679b6','#b5c7e7','#e98827','#edb97c','#64a67c','#8c79c7','#a3a3a3'];const sum=byCategory.reduce((s,a)=>s+a.value,0);const net=calcMonthly(month).expense;let angle=0;const segments=byCategory.map((a,i)=>{const start=angle;angle+=360*a.value/sum;return `${colors[i%colors.length]} ${start}deg ${angle}deg`});const disk=el('div');disk.style.cssText=`width:180px;height:180px;border-radius:50%;margin:12px auto;background:conic-gradient(${segments.join(',')});position:relative`;const hole=el('div');hole.style.cssText='position:absolute;inset:37px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-weight:750;font-size:13px';hole.textContent='Net '+money(net);disk.append(hole);donut.append(disk);const legend=el('div',undefined,'legend');byCategory.forEach((a,i)=>{const v=el('span',a.name+' · '+Math.round(100*a.value/sum)+' %');v.style.setProperty('--c',colors[i%colors.length]);legend.append(v)});donut.append(legend);donut.append(el('div','Dépenses nettes : '+money(net)+(Math.abs(sum-net)>0.005?' · Total des catégories représentées : '+money(sum):'')+'. Les remboursements sont déduits de leurs catégories.','notice'))}
 const bars=$('bars');bars.replaceChildren();const year=month.slice(0,4),data=Array.from({length:12},(_,i)=>calcMonthly(year+'-'+String(i+1).padStart(2,'0')));const max=Math.max(1,...data.flatMap(d=>[d.income,d.expense]));const W=350,H=230,left=39,zero=115,scale=96/max,step=25;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('class','chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','Revenus au-dessus de zéro en vert, dépenses au-dessous en rouge');function svgEl(t,attrs,txt){const n=document.createElementNS('http://www.w3.org/2000/svg',t);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(txt!==undefined)n.textContent=txt;svg.append(n)}svgEl('line',{x1:left,y1:zero,x2:W-3,y2:zero,stroke:'var(--muted)','stroke-width':1.3});for(let i=1;i<=2;i++){for(const sign of [-1,1]){const y=zero+sign*i*45;svgEl('line',{x1:left,y1:y,x2:W-3,y2:y,stroke:'var(--line)'});svgEl('text',{x:0,y:y+3,'font-size':9,fill:'var(--muted)'},(sign<0?'+':'−')+Math.round(i*45/scale).toLocaleString('fr-FR'))}}data.forEach((d,i)=>{const x=left+4+i*step;svgEl('rect',{x,y:zero-d.income*scale,width:17,height:d.income*scale,fill:'#5b9d39'});svgEl('rect',{x,y:zero,width:17,height:d.expense*scale,fill:'#bc3437'});svgEl('text',{x:x+8,y:zero+108,'text-anchor':'middle','font-size':9,fill:'var(--muted)'},String(i+1))});bars.append(svg);bars.append(el('div','Vert : revenus · Rouge : dépenses · Montants mensuels hors virements internes','notice'))}
function prepareForm(){const visible=snapshot.accounts.filter(a=>a.visible);choices('filterAccount',[['all','Tous les comptes'],...visible.map(a=>[a.id,a.name])])}
function setMonthChoices(id,ops){const months=[...new Set(ops.map(o=>dateFromSerial(o.serial).slice(0,7)))].sort().reverse();const current=dateToday().slice(0,7);if(!months.includes(current))months.unshift(current);const fmt=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});choices(id,months.map(m=>[m,fmt.format(new Date(m+'-01T12:00:00Z'))]));$(id).value=current}
function loadSnapshotText(text,label){const next=readXHB(text);snapshot=next;expanded=null;prepareForm();setMonthChoices('filterMonth',snapshot.operations);setMonthChoices('budgetMonth',snapshot.operations);$('status').textContent=`${label} : ${snapshot.accounts.length} comptes, ${snapshot.operations.length} opérations, ${snapshot.categories.length} catégories, ${snapshot.models.length} modèles. Lecture seule.`;render()}
$('file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>30e6)throw Error('Fichier supérieur à 30 Mo');loadSnapshotText(await f.text(),'Lecture locale')}catch(err){$('status').textContent='Échec : '+err.message}};
$('filterAccount').onchange=renderOps;$('filterMonth').onchange=renderOps;$('allMonths').onclick=()=>{$('filterMonth').value='';renderOps()};$('budgetMonth').onchange=()=>{expanded=null;renderBudget()};
function switchTab(prefix,id){document.querySelectorAll(`[data-${prefix}]`).forEach(b=>b.classList.toggle('active',b.dataset[prefix]===id));const root=prefix==='btab'?$('budget'):$('accounts');root.querySelectorAll('.subpage').forEach(p=>p.classList.toggle('active',p.id===id))}
document.querySelectorAll('[data-btab]').forEach(b=>b.onclick=()=>switchTab('btab',b.dataset.btab));document.querySelectorAll('[data-ctab]').forEach(b=>b.onclick=()=>switchTab('ctab',b.dataset.ctab));document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{const id=b.dataset.goto;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.nav button').forEach(n=>n.classList.toggle('active',n.dataset.goto===id));window.scrollTo(0,0)});
try{$('theme').value=localStorage.getItem('compagnon-theme')||'auto'}catch(e){}function applyTheme(v){document.body.className=v==='light'?'':v;try{localStorage.setItem('compagnon-theme',v)}catch(e){}}applyTheme($('theme').value);$('theme').onchange=e=>applyTheme(e.target.value);
// Cache uniquement les fichiers de l'interface, jamais le fichier XHB ni les opérations personnelles.
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});

// Format HBM1 : JSON {format,iterations,salt,iv,ciphertext} en base64, AES-256-GCM + PBKDF2-SHA256.
const b64bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function decryptHBM(data,phrase){
 if(data.format!=='HBM1'||data.kdf!=='PBKDF2-SHA256'||data.cipher!=='AES-256-GCM'||data.iterations!==600000)throw Error('Format chiffré non reconnu');
 const salt=b64bytes(data.salt),iv=b64bytes(data.iv),ciphertext=b64bytes(data.ciphertext);
 if(salt.length!==16||iv.length!==12||ciphertext.length<16||ciphertext.length>30000000)throw Error('Fichier chiffré invalide');
 const pass=await crypto.subtle.importKey('raw',new TextEncoder().encode(phrase),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:data.iterations,hash:'SHA-256'},pass,{name:'AES-GCM',length:256},false,['decrypt']);
 return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext));
}
$('decrypt').onclick=async()=>{const f=$('securefile').files?.[0],p=$('securepass').value;if(!f||!p)return alert('Choisis le fichier chiffré et sa phrase secrète');try{if(f.size>42000000)throw Error('Fichier trop volumineux');const data=JSON.parse(await f.text());const clear=await decryptHBM(data,p);loadSnapshotText(clear,'Copie chiffrée déverrouillée');$('securepass').value=''}catch(e){$('status').textContent='Déchiffrement impossible : mot de passe incorrect ou fichier invalide.';console.warn('Erreur import chiffré (sans données)')}};


// Drive: portée drive.file. L'utilisateur choisit explicitement le fichier via Google Picker.
// Le fichier sélectionné reste identifié localement; aucun jeton ni mot de passe persistant.
const DRIVE_FOLDER='1_cySu9HEWJ5SvbPzYBV0Iy-KDsnV4gru';
const PUBLIC_OAUTH_CLIENT_ID='799426652476-ttqc24opr5nlacq3v2077jg9nlibce56.apps.googleusercontent.com';
const RESTRICTED_PICKER_API_KEY='AIzaSyDcejmeTrpE8hvEXn7POHrCmiM6XBjbd1I';
const DRIVE_NAME='homebank-copie-chiffree.hbm';
let driveToken=null,driveExpires=0,drivePhrase=null,driveClient=null,driveBusy=false,driveFileId=null,lastDriveCheck=0;
const CACHE_DB='hbm-private-cache-v1';
function cacheOpen(){return new Promise((resolve,reject)=>{const q=indexedDB.open(CACHE_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore('files');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function cacheSet(key,value){const db=await cacheOpen();try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
async function cacheGet(key){const db=await cacheOpen();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly');const q=tx.objectStore('files').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}finally{db.close()}}
async function cacheClear(){const db=await cacheOpen();try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
// Option explicite « appareil de confiance » : secret enveloppé sous une clé AES non exportable.
// La protection repose sur le verrouillage Android et l'intégrité du code servi par GitHub Pages.
// Ce n'est PAS une authentification biométrique et ne résiste pas à du JavaScript malveillant sur la même origine.
async function rememberPhrase(phrase){
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(phrase));
 await cacheSet('device-key',key);
 await cacheSet('device-secret',{iv:Array.from(iv),cipher:Array.from(new Uint8Array(encrypted))});
}
async function restorePhrase(){
 const key=await cacheGet('device-key'),saved=await cacheGet('device-secret');
 if(!key||!saved)return null;
 try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(saved.iv)},key,new Uint8Array(saved.cipher)))}
 catch(e){return null}
}
async function forgetRememberedPhrase(){
 const db=await cacheOpen();try{await new Promise((resolve,reject)=>{
 const tx=db.transaction('files','readwrite');tx.objectStore('files').delete('device-key');tx.objectStore('files').delete('device-secret');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
 })}finally{db.close()}
 drivePhrase=null;
}
$('rememberdevice').onchange=async e=>{
 if(e.target.checked){
  const phrase=$('drivepass').value||drivePhrase;
  if(!phrase){e.target.checked=false;driveMessage('Saisis une dernière fois ta phrase avant d’activer cet appareil de confiance.');return}
  try{
   const saved=await cacheGet('last');
   if(!saved)throw Error('Aucune copie locale enregistrée. Connecte Google et charge le fichier avant d’activer cette option.');
   await decryptHBM(JSON.parse(saved.ciphertext),phrase);
   await rememberPhrase(phrase);
   if(!await restorePhrase())throw Error('La phrase mémorisée ne peut pas être relue');
   driveMessage('Déverrouillage automatique activé et vérifié. Ferme puis rouvre l’application pour tester.');
  }catch(err){e.target.checked=false;driveMessage('Impossible de mémoriser le déverrouillage : '+err.message)}
 }else{await forgetRememberedPhrase();driveMessage('Déverrouillage automatique désactivé. La phrase sera redemandée.')}
};
async function loadRememberedPhrase(){
 try{
  const p=await restorePhrase();if(!p){
   const saved=await cacheGet('last');
   if(saved)driveMessage('Copie chiffrée conservée sur ce téléphone. Saisis ta phrase puis appuie sur « Ouvrir la copie hors ligne », ou active l’appareil de confiance après connexion.');
   return;
  }
  drivePhrase=p;$('rememberdevice').checked=true;
  const saved=await cacheGet('last');if(saved){
   const clear=await decryptHBM(JSON.parse(saved.ciphertext),p);
   loadSnapshotText(clear,'Copie locale du '+new Date(saved.modifiedTime).toLocaleString('fr-FR'));
   driveMessage('Copie locale ouverte automatiquement · '+new Date(saved.modifiedTime).toLocaleString('fr-FR'));
  }
 }catch(e){drivePhrase=null;driveMessage('Déverrouillage local impossible. Saisis ta phrase secrète.')}
}
async function offlineOpen(){const p=$('drivepass').value||drivePhrase;if(!p)throw Error('Saisis la phrase secrète pour ouvrir la copie hors ligne');const saved=await cacheGet('last');if(!saved)throw Error('Aucune copie chiffrée locale disponible');const clear=await decryptHBM(JSON.parse(saved.ciphertext),p);loadSnapshotText(clear,'Copie locale du '+new Date(saved.modifiedTime).toLocaleString('fr-FR'));drivePhrase=p;$('drivepass').value='';driveMessage('Mode hors ligne · copie du '+new Date(saved.modifiedTime).toLocaleString('fr-FR'))}
$('offlineopen').onclick=async()=>{try{await offlineOpen()}catch(e){driveMessage('Échec : '+e.message)}};
$('forgetlocal').onclick=async()=>{try{await cacheClear();driveFileId=null;drivePhrase=null;$('rememberdevice').checked=false;driveMessage('Copie et déverrouillage locaux effacés')}catch(e){driveMessage('Effacement impossible : '+e.message)}};
cacheGet('fileId').then(id=>{if(id)driveFileId=id}).catch(()=>{});

const driveMessage=s=>{$('drivestatus').textContent=s};
$('driveclient').value=PUBLIC_OAUTH_CLIENT_ID;
$('driveapikey').value=RESTRICTED_PICKER_API_KEY;
// Réutilise uniquement l’identifiant précédemment choisi par l’utilisateur ; OAuth reste explicite.
function gisReady(){return new Promise((resolve,reject)=>{if(window.google?.accounts?.oauth2)return resolve();const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>window.google?.accounts?.oauth2?resolve():reject(Error('Service Google indisponible'));s.onerror=()=>reject(Error('Impossible de charger Google'));document.head.append(s)})}
function pickerReady(){return new Promise((resolve,reject)=>{if(window.google?.picker)return resolve();const s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.onload=()=>gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Google Picker indisponible'))});s.onerror=()=>reject(Error('Google Picker indisponible'));document.head.append(s)})}
async function driveRequest(url,stage='lecture'){if(!driveToken||Date.now()>driveExpires)throw Error('Autorisation Google expirée : utilise « Connecter et actualiser ». La copie locale reste accessible.');const r=await fetch(url,{headers:{Authorization:'Bearer '+driveToken},cache:'no-store'});if(!r.ok){let detail='';try{const body=await r.json();detail=body?.error?.message||''}catch(e){}throw Error('Drive ('+stage+') : erreur '+r.status+(detail?' — '+detail:''))}return r}
async function driveRefresh(){
 if(driveBusy)return;driveBusy=true;lastDriveCheck=Date.now();
 try{
  if(!driveFileId)throw Error('Sélectionne d’abord ton fichier chiffré avec « Choisir le fichier »');
  if(!drivePhrase)throw Error('Phrase secrète nécessaire : reconnecte-toi');
  driveMessage('Vérification du fichier sélectionné…');
  const meta=await(await driveRequest('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(driveFileId)+'?fields=id,name,mimeType,size,modifiedTime,trashed','métadonnées')).json();
  if(meta.trashed||meta.name!==DRIVE_NAME)throw Error('Le fichier choisi n’est pas la copie attendue dans le dossier privé');
  if(Number(meta.size)>42000000)throw Error('Fichier trop volumineux');
  const response=await driveRequest('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(driveFileId)+'?alt=media','téléchargement');
  const data=await response.text();if(data.length>42000000)throw Error('Copie trop volumineuse');
  const clear=await decryptHBM(JSON.parse(data),drivePhrase);
  loadSnapshotText(clear,'Google Drive · '+new Date(meta.modifiedTime).toLocaleString('fr-FR'));
  let stored=false, trusted=false, cacheError='';
  try{
   await cacheSet('last',{ciphertext:data,modifiedTime:meta.modifiedTime});
   await cacheSet('fileId',driveFileId);
   stored=true;
   // La mémorisation n'est confirmée qu'après un chargement valide et une écriture locale réussie.
   if($('rememberdevice').checked){await rememberPhrase(drivePhrase);trusted=Boolean(await restorePhrase())}
  }catch(e){cacheError=e?.message||'stockage indisponible';console.warn('Cache local chiffré indisponible')}
  driveMessage(stored?(trusted?'Copie enregistrée sur ce téléphone · réouverture automatique activée.': 'Copie enregistrée sur ce téléphone · pour la rouvrir sans phrase, active « Faire confiance à ce téléphone ».'):'Copie affichée mais NON enregistrée localement ('+cacheError+'). Elle disparaîtra à la fermeture. Vérifie le stockage du navigateur.');
 }catch(e){driveMessage('Actualisation indisponible : '+e.message+' · Dernière copie locale conservée.') }finally{driveBusy=false}
}
async function chooseDriveFile(){
 try{
  if(!driveToken||Date.now()>driveExpires)throw Error('Connecte Google avant de choisir le fichier');
  const key=$('driveapikey').value.trim();if(!key)throw Error('Clé API Google Picker manquante');
  await pickerReady();
  const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(false).setSelectFolderEnabled(false);
  const picker=new google.picker.PickerBuilder().addView(view).setOAuthToken(driveToken).setDeveloperKey(key).setAppId('799426652476').setOrigin(window.location.origin).setCallback(async data=>{
   if(data.action!==google.picker.Action.PICKED)return;
   const f=data.docs?.[0];if(!f?.id)return;
   driveFileId=f.id;cacheSet('fileId',driveFileId).catch(()=>{});driveMessage('Fichier sélectionné : '+(f.name||'copie chiffrée')+'. Lecture en cours…');
   await driveRefresh();
  }).build();picker.setVisible(true);
 }catch(e){driveMessage('Sélection impossible : '+e.message)}
}
$('drivechoose').onclick=chooseDriveFile;
$('driveconnect').onclick=async()=>{
 try{
  const id=$('driveclient').value.trim(),phrase=$('drivepass').value,key=$('driveapikey').value.trim();
  if(!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id))throw Error('Identifiant OAuth invalide');
  if(!key)throw Error('Clé API Google Picker manquante');
  if(!phrase&&!drivePhrase)throw Error('Phrase secrète manquante');
  await gisReady();
  drivePhrase=phrase||drivePhrase;$('drivepass').value='';
  // Le déverrouillage local sera enregistré uniquement après validation de la copie chiffrée.
  // La copie chiffrée locale reste consultable même si l'autorisation Google échoue.
  try{await offlineOpen()}catch(e){driveMessage('Connexion Google en cours…')}
  driveClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:'https://www.googleapis.com/auth/drive.file',callback:async r=>{
   if(r.error||!r.access_token){driveMessage('Connexion refusée');return}
   driveToken=r.access_token;driveExpires=Date.now()+(Number(r.expires_in)||3500)*1000-60000;
   driveMessage('Connexion Google réussie. '+(driveFileId?'Actualisation du fichier connu…':'Sélectionne ton fichier avec « Choisir le fichier ».'));if(driveFileId)await driveRefresh();
  },error_callback:()=>driveMessage('Connexion interrompue')});
  driveMessage('Autorisation Google en cours…');driveClient.requestAccessToken({prompt:''});
 }catch(e){driveMessage('Échec : '+e.message)}
};
$('driverefresh').onclick=driveRefresh;
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&driveToken&&drivePhrase&&driveFileId&&!driveBusy&&Date.now()-lastDriveCheck>300000)driveRefresh()});
$('drivedisconnect').onclick=()=>{const token=driveToken;driveToken=null;driveExpires=0;drivePhrase=null;$('drivepass').value='';if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});driveMessage('Session Google déconnectée. La copie locale et le déverrouillage de confiance restent enregistrés si activés ; utilise « Effacer la copie locale » pour les supprimer.')};
// Actualisation uniquement sur demande, jamais lors d’un simple retour à l’application.

// Restaure uniquement la dernière copie chiffrée et son déverrouillage local.
loadRememberedPhrase();
