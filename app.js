const BATCHES=[{key:'batch1',name:'Порція 1',ids:questions.filter(q=>q.batch==='batch1').map(q=>q.id)},
               {key:'batch2',name:'Порція 2',ids:questions.filter(q=>q.batch==='batch2').map(q=>q.id)},
               {key:'batch3',name:'Порція 3',ids:questions.filter(q=>q.batch==='batch3').map(q=>q.id)},
               {key:'batch4',name:'Порція 4',ids:questions.filter(q=>q.batch==='batch4').map(q=>q.id)},
               {key:'batch5',name:'Порція 5',ids:questions.filter(q=>q.batch==='batch5').map(q=>q.id)}];
const Q=Object.fromEntries(questions.map(q=>[q.id,q]));
const BOOKMARKS_KEY='pdr-quiz-saved-questions-v1';
let savedIds=[];
try{const stored=JSON.parse(localStorage.getItem(BOOKMARKS_KEY)||'[]');if(Array.isArray(stored))savedIds=stored.filter(id=>Number.isInteger(id)&&!!Q[id]);}catch(e){}
const savedQuestions=new Set(savedIds);

// Облік типових помилок не залежить від порції, закладок чи поточного тренування.
// Три ПОСЛІДОВНІ правильні відповіді після останньої помилки = питання засвоєно.
const MISTAKES_KEY='pdr-quiz-typical-mistakes-v1';
const MASTERED_AT=3;
const mistakeHistory=Object.create(null);
try{
 const stored=JSON.parse(localStorage.getItem(MISTAKES_KEY)||'{}');
 if(stored && typeof stored==='object' && !Array.isArray(stored))for(const [rawId,entry] of Object.entries(stored)){
  const id=Number(rawId);if(!Number.isInteger(id)||!Q[id]||!entry||typeof entry!=='object')continue;
  const wrongs=Math.max(0,Math.floor(Number(entry.wrongs)||0));
  const streak=Math.max(0,Math.min(MASTERED_AT,Math.floor(Number(entry.streak)||0)));
  if(wrongs>0)mistakeHistory[id]={wrongs,streak,active:!!entry.active&&streak<MASTERED_AT,lastWrong:Number(entry.lastWrong)||0};
 }
}catch(e){}
function activeMistakeIds(){
 return Object.keys(mistakeHistory).map(Number).filter(id=>mistakeHistory[id].active).sort((a,b)=>
  mistakeHistory[b].wrongs-mistakeHistory[a].wrongs || mistakeHistory[b].lastWrong-mistakeHistory[a].lastWrong || a-b);
}
const SCOPE_IDS={batch1:BATCHES[0].ids,batch2:BATCHES[1].ids,batch3:BATCHES[2].ids,batch4:BATCHES[3].ids,batch5:BATCHES[4].ids,all:questions.map(q=>q.id),saved:[...savedQuestions],mistakes:activeMistakeIds()};
const SCOPE_NAMES={batch1:'Порція 1',batch2:'Порція 2',batch3:'Порція 3',batch4:'Порція 4',batch5:'Порція 5',all:'Усі питання',saved:'Збережені питання',mistakes:'Найчастіші помилки'};
// Кожна комбінація має власний ключ сесії: mix:batch1+batch3, mix:batch2+batch3 тощо.
// Це зберігає незалежний прогрес без зміни існуючих порцій, all і saved.
const MIX_PREFIX='mix:';
function getValidMixedBatches(scope){
 if(typeof scope!=='string'||!scope.startsWith(MIX_PREFIX))return null;
 const selected=scope.slice(MIX_PREFIX.length).split('+');
 if(selected.length<2||new Set(selected).size!==selected.length)return null;
 if(selected.some(key=>!BATCHES.some(batch=>batch.key===key)))return null;
 const sorted=BATCHES.filter(batch=>selected.includes(batch.key));
 if(sorted.map(batch=>batch.key).join('+')!==selected.join('+'))return null;
 return sorted;
}
function ensureMixedScope(scope){
 const selected=getValidMixedBatches(scope);
 if(!selected)return false;
 SCOPE_IDS[scope]=selected.flatMap(batch=>batch.ids);
 SCOPE_NAMES[scope]='Порції '+selected.map(batch=>batch.name.replace('Порція ','')).join(' + ');
 return true;
}
function getMixedKey(selected){
 const list=BATCHES.filter(batch=>selected.includes(batch.key)).map(batch=>batch.key);
 return list.length>=2?MIX_PREFIX+list.join('+'):null;
}
function persistSaved(){SCOPE_IDS.saved=[...savedQuestions];try{localStorage.setItem(BOOKMARKS_KEY,JSON.stringify(SCOPE_IDS.saved))}catch(e){notice('Закладки не вдалося зберегти. Перевірте налаштування браузера.')}}

const STORAGE_KEY='pdr-quiz-batches-v1';
const LAYOUT_KEY='pdr-quiz-batch-answer-layouts-v1';
function shuffledIndices(n){
 const arr=Array.from({length:n},(_,i)=>i);
 for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
 return arr;
}
function createAnswerOrders(previous={}){
 const layouts={};for(const q of questions){
  const n=q.answers.length,order=shuffledIndices(n),old=previous[q.id];
  if(n>1&&Array.isArray(old)&&old.length===n&&order.every((a,i)=>a===old[i])){
   const shift=1+Math.floor(Math.random()*(n-1));order.push(...order.splice(0,shift));
  }
  layouts[q.id]=order;
 }
 try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(layouts))}catch(e){}
 return layouts;
}
let previousOrders={};try{previousOrders=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')||{}}catch(e){}
let answerOrders=createAnswerOrders(previousOrders);
function newSession(scope){const ids=[...SCOPE_IDS[scope]];return {order:(scope.startsWith(MIX_PREFIX)||scope==='mistakes')?shuffledIndices(ids.length).map(i=>ids[i]):ids,index:0,answers:{},mode:'normal'}}
function cleanSession(s,scope){
 if(!s||!Array.isArray(s.order)||!s.order.length)return newSession(scope);
 const allowed=scope==='mistakes'?new Set(questions.map(q=>q.id)):new Set(SCOPE_IDS[scope]);
  if(s.order.some(id=>!allowed.has(id))||new Set(s.order).size!==s.order.length)return newSession(scope);
 // Regular run should contain exactly the selected scope. Review runs can be shorter.
 if(s.mode!=='review'&&s.order.length!==allowed.size){
  if(scope==='mistakes'){/* Під час тренування засвоєне питання залишається на екрані до переходу далі. */}
   else if(scope==='all'&&s.order.every(id=>allowed.has(id)))s.order=[...s.order,...SCOPE_IDS.all.filter(id=>!s.order.includes(id))];
   else return newSession(scope);
 }
 const answers={};for(const [id,val] of Object.entries(s.answers||{})){
  const q=Q[id];if(allowed.has(Number(id))&&Number.isInteger(val)&&val>=0&&val<q.answers.length)answers[id]=val;
 }
 return {order:s.order,index:Math.max(0,Math.min(Number(s.index)||0,s.order.length)),answers,mode:s.mode==='review'?'review':'normal'};
}
let root={active:'batch1',sessions:{},mixedSelection:[]};
try{let found=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(found&&found.sessions)root={...root,...found}}catch(e){}
// Переносимо прогрес старої версії лише тоді, коли ще не створена нова сесія порції 1.
if(!root.sessions.batch1){try{
 const legacy=JSON.parse(localStorage.getItem('my-pdr-quiz-standalone-v3')||'null');
 if(legacy&&Array.isArray(legacy.order)&&legacy.order.length&&legacy.order.every(id=>SCOPE_IDS.batch1.includes(id))){
  root.sessions.batch1=cleanSession({order:legacy.order,index:legacy.index,answers:legacy.answers,mode:legacy.mode==='review'?'review':'normal'},'batch1');
 }
}catch(e){}}
if(typeof root.active==='string'&&root.active.startsWith(MIX_PREFIX))ensureMixedScope(root.active);
if(!SCOPE_IDS[root.active])root.active='batch1';
let activeScope=root.active,state=cleanSession(root.sessions[activeScope],activeScope);
let mixedPickerOpen=false;
let mixedDraft=new Set(Array.isArray(root.mixedSelection)?root.mixedSelection.filter(key=>BATCHES.some(b=>b.key===key)):[]);
if(activeScope.startsWith(MIX_PREFIX))mixedDraft=new Set(getValidMixedBatches(activeScope).map(batch=>batch.key));
// Migrate and reconcile the saved run after loading the existing session state.

const panel=document.getElementById('panel');let openOriginal=false,toastTimer;
function save(){root.active=activeScope;root.sessions[activeScope]=state;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(root))}catch(e){}}

function persistMistakes(){
 SCOPE_IDS.mistakes=activeMistakeIds();
 try{localStorage.setItem(MISTAKES_KEY,JSON.stringify(mistakeHistory))}
 catch(e){notice('Не вдалося зберегти статистику помилок. Перевірте налаштування браузера.')}
}
// Коли тренування типових помилок не відкрите, оновлюємо його набір:
// прибираємо засвоєні й додаємо нові, не чіпаючи прогрес інших порцій.
function reconcileMistakeSession(){
 if(activeScope==='mistakes'||!root.sessions.mistakes)return;
 const s=root.sessions.mistakes;const allowed=new Set(SCOPE_IDS.mistakes);
 const before=Array.isArray(s.order)?s.order:[];
 const after=[...before.filter(id=>allowed.has(id)),...SCOPE_IDS.mistakes.filter(id=>!before.includes(id))];
 if(before.length===after.length && before.every((id,i)=>id===after[i]))return;
 const current=before[s.index],answers={};
 for(const [key,val] of Object.entries(s.answers||{}))if(allowed.has(Number(key)))answers[key]=val;
 s.order=after;s.answers=answers;s.mode='normal';
 s.index=current!==undefined&&after.includes(current)?after.indexOf(current):Math.min(Number(s.index)||0,Math.max(0,after.length-1));
}
// Єдина точка зміни глобальної історії. Викликається ТІЛЬКИ на перший клік відповіді.
function recordAttempt(id,isCorrect){
 let info=mistakeHistory[id];
 if(!isCorrect){
  if(!info)info=mistakeHistory[id]={wrongs:0,streak:0,active:true,lastWrong:0};
  info.wrongs++;info.streak=0;info.active=true;info.lastWrong=Date.now();
 }else if(info?.active){
  info.streak=Math.min(MASTERED_AT,info.streak+1);
  if(info.streak===MASTERED_AT)info.active=false;
 }else return;
 persistMistakes();
 reconcileMistakeSession();
}
function openMistakeQuestion(id){
 if(activeScope!=='mistakes')switchScope('mistakes');
 if(!SCOPE_IDS.mistakes.includes(id))return;
 if(!state.order.includes(id))state.order.push(id);
 // Даємо змогу відпрацювати конкретне питання навіть якщо воно вже розв'язане у цьому сеансі.
 delete state.answers[id];state.mode='normal';state.index=state.order.indexOf(id);
 answerOrders=createAnswerOrders(answerOrders);openOriginal=false;render();
 document.getElementById('panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function exportMistakes(){
 const payload={type:'pdr-typical-mistakes',version:1,records:mistakeHistory,exportedAt:new Date().toISOString()};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pdr-typovi-pomylky.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importMistakes(file){
 if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(data?.type!=='pdr-typical-mistakes'||data.version!==1||!data.records||typeof data.records!=='object'||Array.isArray(data.records))throw Error('invalid');
  const valid=Object.entries(data.records).filter(([id,v])=>Q[Number(id)]&&v&&Number.isFinite(Number(v.wrongs))&&Number(v.wrongs)>0);
  if(!confirm(`Імпортувати статистику (${valid.length} питань із історією помилок)? Поточна статистика буде замінена даними з файлу.`))return;
  for(const id of Object.keys(mistakeHistory))delete mistakeHistory[id];
  for(const [id,v] of valid){
   const streak=Math.max(0,Math.min(MASTERED_AT,Math.floor(Number(v.streak)||0)));
   mistakeHistory[id]={wrongs:Math.max(1,Math.floor(Number(v.wrongs))),streak,active:!!v.active&&streak<MASTERED_AT,lastWrong:Number(v.lastWrong)||0};
  }
  persistMistakes();if(activeScope==='mistakes')state=newSession('mistakes');else reconcileMistakeSession();
  openOriginal=false;render();notice(`Історію відновлено. Активних типових помилок: ${SCOPE_IDS.mistakes.length}.`);
 }catch(e){notice('Не вдалося прочитати резервну копію типових помилок.');}
}
function renderMistakeLibrary(){
 const section=document.getElementById('mistake-library');section.hidden=activeScope!=='mistakes';section.replaceChildren();
 if(activeScope!=='mistakes')return;
 const head=h('div',{class:'mistake-library-head'});
 const info=h('div');info.append(h('h3',{text:`⚠ Найчастіші помилки (${SCOPE_IDS.mistakes.length})`}));
 info.append(h('p',{text:'Неправильна відповідь у будь-якому режимі → 0/3. Три правильні поспіль у будь-яких тренуваннях → питання засвоєно й зникає зі списку. Нова помилка знову додає його.'}));head.append(info);
 const actions=h('div',{class:'mistake-library-actions'});
 actions.append(button('Експорт статистики','',exportMistakes,Object.keys(mistakeHistory).length===0));
 const importer=h('input',{type:'file',accept:'application/json,.json','aria-label':'Імпортувати статистику типових помилок'});importer.hidden=true;
 importer.addEventListener('change',()=>{importMistakes(importer.files?.[0]);importer.value=''});
 actions.append(button('Імпорт статистики','',()=>importer.click()),importer);head.append(actions);section.append(head);
 if(!SCOPE_IDS.mistakes.length){
  section.append(h('p',{class:'mastery-note',text:'Активних типових помилок поки немає. Список автоматично поповниться, щойно ти даси хоча б одну неправильну відповідь.'}));return;
 }
 section.append(h('p',{class:'mastery-note',text:'Список відсортовано за кількістю неправильних спроб. Для кожного питання видно прогрес засвоєння (0/3, 1/3, 2/3). Кнопка «Повторити» відкриває його для нової спроби.'}));
 const items=h('div',{class:'mistake-items'});
 for(const id of SCOPE_IDS.mistakes){
  const q=Q[id],entry=mistakeHistory[id];const item=h('div',{class:'mistake-item'});
  const row=h('div',{class:'mistake-item-head'});
  row.append(h('span',{class:'mistake-id',text:`Порція ${Number(q.batch.replace('batch',''))} · №${q.batchOrdinal}`}));
  row.append(h('span',{class:'mistake-wrongs',text:`Помилок: ${entry.wrongs}`}));item.append(row);
  item.append(h('p',{class:'mistake-question',text:q.question}));
  item.append(h('div',{class:'mastery-label',text:`Правильних поспіль: ${entry.streak} із ${MASTERED_AT}`}));
  const bar=h('div',{class:'mastery-track'});bar.append(h('span',{style:`width:${100*entry.streak/MASTERED_AT}%`}));item.append(bar);
  item.append(button('Повторити питання →','',()=>openMistakeQuestion(id)));items.append(item);
 }
 section.append(items);
}

function h(tag,props={},children=[]){const node=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')node.className=v;else if(k==='text')node.textContent=v;else node.setAttribute(k,v)}for(const c of children)node.append(c);return node}
function button(text,css,handler,disabled=false){const b=h('button',{class:'btn '+css,text,type:'button'});b.disabled=disabled;b.addEventListener('click',handler);return b}
function notice(str){const box=document.getElementById('notice');box.textContent=str;box.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.style.display='none',2400)}
function renderScopes(){
 document.querySelectorAll('.batch-card').forEach(b=>{
  const active=b.dataset.scope==='multi'?activeScope.startsWith(MIX_PREFIX):b.dataset.scope===activeScope;
  b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');
  if(b.dataset.scope==='multi')b.setAttribute('aria-expanded',mixedPickerOpen?'true':'false');
 });
 const picked=getValidMixedBatches(activeScope);
 document.getElementById('multi-summary').textContent=picked
  ? `${picked.map(b=>b.name).join(' + ')} · ${SCOPE_IDS[activeScope].length} питань`
  : (mixedDraft.size>=2?`${BATCHES.filter(b=>mixedDraft.has(b.key)).map(b=>b.name).join(' + ')} · вибрати`: 'Обрати 2 або більше порцій');
 document.getElementById('saved-count').textContent=savedQuestions.size;
  document.getElementById('mistake-count').textContent=SCOPE_IDS.mistakes.length;
  renderMixedPicker();
}
function renderMixedPicker(){
 const section=document.getElementById('mixed-picker');section.hidden=!mixedPickerOpen;section.replaceChildren();
 if(!mixedPickerOpen)return;
 const header=h('div',{class:'mixed-picker-head'});
 header.append(h('h3',{text:'Скласти тренування з кількох порцій'}));section.append(header);
 section.append(h('p',{class:'mixed-picker-note',text:'Позначте потрібні порції. Питання з них перемішаються в один тест, а відповіді також залишаться випадковими.'}));
 const options=h('div',{class:'mixed-options'});
 for(const batch of BATCHES){
  const label=h('label',{class:'mixed-option'});
  const cb=h('input',{type:'checkbox',value:batch.key,'aria-label':`${batch.name} (${batch.ids.length} питань)`});
  cb.checked=mixedDraft.has(batch.key);
  cb.addEventListener('change',()=>{if(cb.checked)mixedDraft.add(batch.key);else mixedDraft.delete(batch.key);renderMixedPicker()});
  const content=h('span');content.append(h('b',{text:batch.name}),h('small',{text:`${batch.ids.length} питань`}));
  label.append(cb,content);options.append(label);
 }
 section.append(options);
 const chosen=BATCHES.filter(batch=>mixedDraft.has(batch.key));
 const count=chosen.reduce((sum,batch)=>sum+batch.ids.length,0);
 section.append(h('p',{class:'mixed-summary',text:chosen.length>=2?`Обрано: ${chosen.length} порції · ${count} питань`:`Обрано: ${chosen.length} із ${BATCHES.length}. Потрібно щонайменше 2 порції.`}));
 const actions=h('div',{class:'mixed-actions'});
 const key=getMixedKey([...mixedDraft]);
 const existing=key&&root.sessions[key];
 const start=button(existing?'Продовжити обраний тест →':'Почати змішаний тест →','primary',()=>{
  const scope=getMixedKey([...mixedDraft]);if(!scope||!ensureMixedScope(scope))return;
  root.mixedSelection=BATCHES.filter(batch=>mixedDraft.has(batch.key)).map(batch=>batch.key);
  mixedPickerOpen=false;
  if(scope===activeScope){render();notice('Змішаний тест уже відкритий.');return}
  switchScope(scope);
 },!key);
 actions.append(start,button('Скасувати','',()=>{mixedPickerOpen=false;renderScopes()}));
 section.append(actions);
 section.append(h('p',{class:'mixed-help',text:'Кожна комбінація зберігає свій прогрес окремо. Повторне відкриття продовжує тест; «Почати заново» та «Перемішати все» перезапускають лише цю комбінацію.'}));
}
function reconcileSavedSession(){
 // Keep the progress of still-saved questions; add new saved IDs and remove unbookmarked ones.
 const existing=activeScope==='saved'?state:(root.sessions.saved||newSession('saved'));
 const before=existing.order||[],current=before[existing.index];
 const after=[...before.filter(id=>savedQuestions.has(id)),...SCOPE_IDS.saved.filter(id=>!before.includes(id))];
 if(before.length!==after.length || before.some((id,i)=>id!==after[i])){
  const answers={};for(const [key,value] of Object.entries(existing.answers||{}))if(savedQuestions.has(Number(key)))answers[key]=value;
  existing.order=after;existing.answers=answers;existing.mode='normal';
  existing.index=current!==undefined&&after.includes(current)?after.indexOf(current):Math.min(Number(existing.index)||0,Math.max(0,after.length-1));
 }
 root.sessions.saved=existing;
 if(activeScope==='saved')state=existing;
}
function toggleSaved(id){
 const wasSaved=savedQuestions.has(id);
 if(wasSaved)savedQuestions.delete(id);else savedQuestions.add(id);
 persistSaved();reconcileSavedSession();
 openOriginal=false;render();
 notice(wasSaved?'Питання прибрано зі збережених.':'Питання додано до збережених.');
}
function openSavedQuestion(id){
 if(activeScope!=='saved')switchScope('saved');
 if(!state.order.includes(id)){
  state.order=[...SCOPE_IDS.saved];state.mode='normal';
 }
 state.index=state.order.indexOf(id);openOriginal=false;render();
 document.getElementById('panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function exportSaved(){
 const payload={type:'pdr-bookmarks',version:1,questionIds:[...savedQuestions],exportedAt:new Date().toISOString()};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pdr-zberezheni-pytannia.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importSaved(file){
 if(!file)return;
 try{
  const contents=JSON.parse(await file.text());
  if(contents.type!=='pdr-bookmarks'||!Array.isArray(contents.questionIds))throw new Error('Невідомий формат резервної копії');
  const valid=contents.questionIds.filter(id=>Number.isInteger(id)&&!!Q[id]);
  const before=savedQuestions.size;for(const id of valid)savedQuestions.add(id);
  persistSaved();reconcileSavedSession();render();
  notice(`Імпортовано: ${savedQuestions.size-before} нових питань. Збережено загалом: ${savedQuestions.size}.`);
 }catch(e){notice('Не вдалося імпортувати закладки. Перевірте JSON-файл.');}
}
function renderSavedLibrary(){
 const section=document.getElementById('saved-library');section.hidden=activeScope!=='saved';section.replaceChildren();
 if(activeScope!=='saved')return;
 const head=h('div',{class:'saved-library-head'});head.append(h('h3',{text:`Мої збережені питання (${savedQuestions.size})`}));
 const actions=h('div',{class:'saved-library-actions'});
 actions.append(button('Експортувати закладки','',exportSaved,savedQuestions.size===0));
 const importer=h('input',{type:'file',accept:'application/json,.json',id:'saved-import','aria-label':'Імпортувати закладки з JSON-файлу'});importer.hidden=true;
 importer.addEventListener('change',()=>{importSaved(importer.files?.[0]);importer.value=''});
 const importButton=button('Імпортувати','',()=>importer.click());actions.append(importButton,importer);head.append(actions);section.append(head);
 if(!savedQuestions.size){section.append(h('p',{class:'saved-empty',text:'Поки немає збережених питань. Натисніть «☆ Зберегти питання» біля будь-якого питання у будь-якій порції.'}));return}
 section.append(h('p',{class:'saved-library-note',text:'Натисніть на питання, щоб відкрити його в тренуванні. Позначки зберігаються незалежно від правильності відповідей.'}));
 const items=h('div',{class:'saved-items'});
 for(const id of SCOPE_IDS.saved){
  const q=Q[id];const item=h('div',{class:'saved-item'});
  const link=h('button',{class:'saved-jump',type:'button',title:q.question});
  link.append(h('span',{class:'saved-item-num',text:`Порція ${Number(q.batch.replace('batch',''))} · №${q.batchOrdinal}`}));
  link.append(h('span',{text:q.question}));link.addEventListener('click',()=>openSavedQuestion(id));
  const del=button('Прибрати','remove-saved',()=>toggleSaved(id));del.setAttribute('aria-label',`Прибрати зі збережених: ${q.question}`);
  item.append(link,del);items.append(item);
 }
 section.append(items);
}

function switchScope(scope){
 if(scope==='multi'){
  mixedPickerOpen=!mixedPickerOpen;
  renderScopes();
  if(mixedPickerOpen)document.getElementById('mixed-picker').scrollIntoView({behavior:'smooth',block:'nearest'});
  return;
 }
 if(!SCOPE_IDS[scope]&&!ensureMixedScope(scope))return;
  if(scope==='mistakes' && activeScope!=='mistakes')reconcileMistakeSession();
  if(scope===activeScope){mixedPickerOpen=false;renderScopes();return}
 save();activeScope=scope;state=cleanSession(root.sessions[scope],scope);
 if(scope==='saved')reconcileSavedSession();
 if(scope.startsWith(MIX_PREFIX)){
  root.mixedSelection=getValidMixedBatches(scope).map(b=>b.key);
  mixedDraft=new Set(root.mixedSelection);
 }
 mixedPickerOpen=false;openOriginal=false;render();notice(`Відкрито: ${SCOPE_NAMES[scope]}`);
}
function stats(){const answered=state.order.filter(id=>state.answers[id]!==undefined),ok=answered.filter(id=>state.answers[id]===Q[id].correct).length,bad=answered.length-ok;
 document.getElementById('total').textContent=state.order.length;
 document.getElementById('ok').textContent=ok;
 document.getElementById('bad').textContent=bad;
 document.getElementById('pending').textContent=state.order.length-answered.length;
 return {ok,bad,pending:state.order.length-answered.length};
}
function render(){
 save();renderScopes();renderSavedLibrary();renderMistakeLibrary();const st=stats();panel.replaceChildren();
 if(activeScope==='saved'&&!savedQuestions.size){
  const empty=h('div',{class:'complete'});
   empty.append(h('h2',{text:'☆ Тут будуть питання для повторення'}),h('p',{text:'Збережіть будь-яке питання з інших порцій за допомогою кнопки ☆. Воно з’явиться тут, і ви зможете тренуватися на ньому скільки завгодно разів.'}));
  empty.append(button('Перейти до порції 1','primary',()=>switchScope('batch1')));panel.append(empty);return;
 }
   if(activeScope==='mistakes' && state.order.length===0){
   const empty=h('div',{class:'complete'});
   empty.append(h('h2',{text:'✓ Немає типових помилок'}),h('p',{text:'Кожна неправильна відповідь із будь-якої порції, змішаного тренування або зі збережених автоматично з’явиться тут. Питання буде вилучено лише після трьох правильних відповідей поспіль.'}));
   empty.append(button('Перейти до порції 1','primary',()=>switchScope('batch1')));panel.append(empty);return;
  }
  const id=state.order[state.index];if(id===undefined){results(st);return}
 const q=Q[id],selected=state.answers[id],done=selected!==undefined;
 const top=h('div',{class:'bar'}),line=h('div',{class:'barline'});
 const headline=h('div',{class:'question-heading'});headline.append(h('b',{text:`Питання ${state.index+1} із ${state.order.length}`}));
 const mark=h('button',{type:'button',class:'bookmark-btn'+(savedQuestions.has(id)?' is-saved':''),
   'aria-pressed':savedQuestions.has(id)?'true':'false',
   'aria-label':savedQuestions.has(id)?'Прибрати питання зі збережених':'Зберегти питання для повторення',
   text:savedQuestions.has(id)?'★ У збережених':'☆ Зберегти питання'});
 mark.addEventListener('click',()=>toggleSaved(id));headline.append(mark);
  if(mistakeHistory[id]?.active){const m=mistakeHistory[id];headline.append(h('span',{class:'question-mastering',text:`⚠ У типових помилках · ${m.streak}/${MASTERED_AT}`}))}
 line.append(headline,h('small',{text:`${SCOPE_NAMES[activeScope]} · ${state.mode==='review'?'Повторення помилок · ':''}Порція ${Number(q.batch.replace('batch',''))}, №${q.batchOrdinal}`}));top.append(line);
 const pr=h('div',{class:'progress'});pr.append(h('div',{class:'fill',style:`width:${100*(state.index+1)/state.order.length}%`}));top.append(pr);panel.append(top);
 const body=h('div',{class:'body'});body.append(h('h2',{class:'question',text:q.question}));
 const layout=h('div',{class:'question-layout '+(!q.diagram?'no-art':'')});
 if(q.diagram){const art=h('div',{class:'picture'});art.append(h('img',{src:q.diagram,alt:'Ілюстрація з оригінального скриншота'}));layout.append(art)}
 const choices=h('div',{class:'answers',role:'group','aria-label':'Варіанти відповіді'});
 const choiceOrder=answerOrders[id]||shuffledIndices(q.answers.length);
 choiceOrder.forEach((originalIndex)=>{
  const answer=q.answers[originalIndex],css='choice'+(done?(originalIndex===q.correct?' correct':originalIndex===selected?' wrong':''):'');
  const opt=h('button',{class:css,type:'button'});opt.disabled=done;
  opt.append(h('span',{class:'num',text:`${originalIndex+1}:`}),h('span',{class:'label',text:answer}));
  if(done&&originalIndex===q.correct)opt.append(h('span',{class:'endicon',text:'✓'}));else if(done&&originalIndex===selected)opt.append(h('span',{class:'endicon',text:'✕'}));
  opt.addEventListener('click',()=>{if(state.answers[id]!==undefined)return;state.answers[id]=originalIndex;recordAttempt(id,originalIndex===q.correct);openOriginal=false;render()});choices.append(opt);
 });layout.append(choices);body.append(layout);
 if(done){const good=selected===q.correct;const m=mistakeHistory[id];
   const feedback=good?(m&&!m.active&&m.streak===MASTERED_AT?'✓ Правильно! Три правильні поспіль — питання засвоєно й прибрано з типових помилок.':`✓ Правильно!${m?.active?' Прогрес засвоєння: '+m.streak+'/'+MASTERED_AT+'.':''}`):'✕ Неправильно. Правильну відповідь позначено зеленим. Питання у типових помилках, прогрес 0/3.';
   body.append(h('div',{class:'message '+(good?'good':'bad'),text:feedback}));
  if(q.original){const link=h('button',{class:'link',text:openOriginal?'Приховати оригінальний скриншот':'Показати оригінальний скриншот і пояснення'});link.addEventListener('click',()=>{openOriginal=!openOriginal;render()});body.append(link);
   if(openOriginal){const orig=h('div',{class:'original-section'});orig.append(h('img',{src:q.original,alt:'Оригінальний скриншот із відповіддю'}));if(q.notes?.length){orig.append(h('h3',{text:'Додаткові пояснення з архіву'}));q.notes.forEach((src,i)=>orig.append(h('img',{src,alt:`Пояснення ${i+1}`})))}body.append(orig)}
  }
 }else body.append(h('div',{class:'hint',text:'Оберіть відповідь. Варіанти відповіді щоразу перемішуються; їхня оригінальна нумерація збережена для питань із варіантами «1 і 2».'}));
 panel.append(body);
 const footer=h('div',{class:'foot'});footer.append(button('← Попереднє','',()=>{openOriginal=false;state.index--;render()},state.index===0));
 const controls=h('div',{class:'right'});if(!done)controls.append(button('Пропустити','',()=>{openOriginal=false;state.index++;render()}));
 controls.append(button(state.index===state.order.length-1?'Результати →':'Наступне →','primary',()=>{openOriginal=false;state.index++;render()}));footer.append(controls);panel.append(footer);
}
function results(st){const end=h('div',{class:'complete'});end.append(h('h2',{text:'🏁 Результати тренування'}),h('p',{text:`${SCOPE_NAMES[activeScope]}. Правильно: ${st.ok} із ${state.order.length}. Помилок: ${st.bad}. Пропущено: ${st.pending}.` }));
 const actions=h('div',{class:'buttons'});let missing=state.order.findIndex(id=>state.answers[id]===undefined);
 if(missing>=0)actions.append(button('Пройти пропущені','soft',()=>{state.index=missing;render()}));
 if(st.bad)actions.append(button(`Повторити помилки (${st.bad})`,'primary',()=>{
  state.order=state.order.filter(id=>state.answers[id]!==undefined&&state.answers[id]!==Q[id].correct);
  for(const id of state.order)delete state.answers[id];state.index=0;state.mode='review';answerOrders=createAnswerOrders(answerOrders);render();
 }));
 if(activeScope==='mistakes')end.append(h('p',{text:`Залишилося активних типових помилок: ${SCOPE_IDS.mistakes.length}. Прогрес 1/3 і 2/3 зберігається під час повторних проходжень.`}));
  actions.append(button(`${SCOPE_NAMES[activeScope]} заново`,'',()=>reset(true)));end.append(actions);panel.append(end);
}
function reset(confirmIt=true){if(confirmIt&&!confirm(`Почати заново: «${SCOPE_NAMES[activeScope]}»? Прогрес цього набору буде втрачено. Інші набори залишаться без змін. Історія типових помилок і серія правильних відповідей збережуться.`))return;
 state=newSession(activeScope);answerOrders=createAnswerOrders(answerOrders);openOriginal=false;render()}
function shuffleAll(){if(!SCOPE_IDS[activeScope].length){notice(activeScope==='mistakes'?'У списку типових помилок поки немає питань.':'Спочатку збережіть хоча б одне питання.');return}if(!confirm(`Перемішати всі питання та відповіді набору «${SCOPE_NAMES[activeScope]}» і почати заново?`))return;
 const arr=[...SCOPE_IDS[activeScope]];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
 state={order:arr,index:0,answers:{},mode:'normal'};answerOrders=createAnswerOrders(answerOrders);openOriginal=false;render()}
reconcileSavedSession();
for(const btn of document.querySelectorAll('.batch-card'))btn.addEventListener('click',()=>switchScope(btn.dataset.scope));
document.getElementById('reset').addEventListener('click',()=>reset(true));
document.getElementById('shuffle').addEventListener('click',shuffleAll);
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement?.tagName))return;
 if(e.key==='ArrowRight'&&state.index<state.order.length){state.index++;openOriginal=false;render()}
 if(e.key==='ArrowLeft'&&state.index>0){state.index--;openOriginal=false;render()}});
render();
