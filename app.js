// Порції визначаються з даних (batch1, batch2, …): нова порція в questions.js з’явиться автоматично.
function batchNumber(key){return Number(key.replace('batch',''))}
function questionLabel(q){return `Порція ${batchNumber(q.batch)} · №${q.batchOrdinal}`}
// Українські форми числа: 1 питання, 3 порції, 5 питань.
function plural(n,one,few,many){const d=n%10,dd=n%100;return `${n} ${d===1&&dd!==11?one:d>=2&&d<=4&&(dd<12||dd>14)?few:many}`}
function questionsCount(n){return plural(n,'питання','питання','питань')}
function batchesCount(n){return plural(n,'порція','порції','порцій')}
const BATCHES=[...new Set(questions.map(q=>q.batch))].sort((a,b)=>batchNumber(a)-batchNumber(b))
 .map(key=>({key,name:'Порція '+batchNumber(key),ids:questions.filter(q=>q.batch===key).map(q=>q.id)}));
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
// Запис історії: {wrongs, streak, active, lastWrong, updatedAt}; updatedAt — час останньої зміни (для синхронізації).
function cleanMistake(entry){
 if(!entry||typeof entry!=='object')return null;
 const wrongs=Math.max(0,Math.floor(Number(entry.wrongs)||0));
 const streak=Math.max(0,Math.min(MASTERED_AT,Math.floor(Number(entry.streak)||0)));
 return wrongs>0?{wrongs,streak,active:!!entry.active&&streak<MASTERED_AT,lastWrong:Number(entry.lastWrong)||0,updatedAt:Number(entry.updatedAt)||0}:null;
}
try{
 const stored=JSON.parse(localStorage.getItem(MISTAKES_KEY)||'{}');
 if(stored && typeof stored==='object' && !Array.isArray(stored))for(const [rawId,entry] of Object.entries(stored)){
  const id=Number(rawId),m=Number.isInteger(id)&&Q[id]&&cleanMistake(entry);
  if(m)mistakeHistory[id]=m;
 }
}catch(e){}
function activeMistakeIds(){
 return Object.keys(mistakeHistory).map(Number).filter(id=>mistakeHistory[id].active).sort((a,b)=>
  mistakeHistory[b].wrongs-mistakeHistory[a].wrongs || mistakeHistory[b].lastWrong-mistakeHistory[a].lastWrong || a-b);
}
const SCOPE_IDS={...Object.fromEntries(BATCHES.map(b=>[b.key,b.ids])),all:questions.map(q=>q.id),saved:[...savedQuestions],mistakes:activeMistakeIds(),commented:[]};
const SCOPE_NAMES={...Object.fromEntries(BATCHES.map(b=>[b.key,b.name])),all:'Усі питання',saved:'Збережені питання',mistakes:'Найчастіші помилки',commented:'З моїми коментарями'};
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
function persistSaved(){SCOPE_IDS.saved=[...savedQuestions];try{localStorage.setItem(BOOKMARKS_KEY,JSON.stringify(SCOPE_IDS.saved))}catch(e){notice('Закладки не вдалося зберегти. Перевірте налаштування браузера.')}scheduleSync()}

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
function newSession(scope){const ids=[...SCOPE_IDS[scope]];return {order:(scope.startsWith(MIX_PREFIX)||scope==='mistakes')?shuffledIndices(ids.length).map(i=>ids[i]):ids,index:0,answers:{},seen:[],mode:'normal'}}
function cleanSession(s,scope){
 if(!s||!Array.isArray(s.order)||!s.order.length)return newSession(scope);
 // Списки помилок і коментарів змінюються під час роботи (коментарі ще й вантажаться асинхронно),
 // тож їхні сесії не скидаємо, а підганяємо пізніше через syncSessionOrder.
 const dynamic=scope==='mistakes'||scope==='commented';
 const allowed=dynamic?new Set(questions.map(q=>q.id)):new Set(SCOPE_IDS[scope]);
  if(s.order.some(id=>!allowed.has(id))||new Set(s.order).size!==s.order.length)return newSession(scope);
 // Regular run should contain exactly the selected scope. Review runs can be shorter.
 // Нові питання (наприклад, додані в порцію) дописуємо в кінець, не скидаючи прогрес.
 // У тренуванні помилок засвоєне питання залишається на екрані до переходу далі.
 if(s.mode!=='review'&&!dynamic&&s.order.length!==allowed.size)s.order=[...s.order,...SCOPE_IDS[scope].filter(id=>!s.order.includes(id))];
 const answers={};for(const [id,val] of Object.entries(s.answers||{})){
  const q=Q[id];if(allowed.has(Number(id))&&Number.isInteger(val)&&val>=0&&val<q.answers.length)answers[id]=val;
 }
 const index=Math.max(0,Math.min(Number(s.index)||0,s.order.length)),inOrder=new Set(s.order);
 // seen — питання, які вже відкривали (для пагінації). У старих сесіях його немає: вважаємо відкритими всі до поточного.
 const seen=Array.isArray(s.seen)?s.seen.filter(id=>inOrder.has(id)):s.order.slice(0,index);
 return {order:s.order,index,answers,seen,mode:s.mode==='review'?'review':'normal'};
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
 scheduleSync(15000);
}
// Підганяє сесію під новий список питань: прибирає зайві, дописує нові в кінець,
// зберігає порядок, відповіді й поточне питання для тих, що залишились.
function syncSessionOrder(s,ids){
 const allowed=new Set(ids),before=Array.isArray(s.order)?s.order:[];
 const after=[...before.filter(id=>allowed.has(id)),...ids.filter(id=>!before.includes(id))];
 if(before.length===after.length && before.every((id,i)=>id===after[i]))return;
 const current=before[s.index],answers={};
 for(const [key,val] of Object.entries(s.answers||{}))if(allowed.has(Number(key)))answers[key]=val;
 s.order=after;s.answers=answers;s.seen=(s.seen||[]).filter(id=>allowed.has(id));s.mode='normal';
 s.index=current!==undefined&&after.includes(current)?after.indexOf(current):Math.min(Number(s.index)||0,Math.max(0,after.length-1));
}
// Коли тренування типових помилок не відкрите, оновлюємо його набір:
// прибираємо засвоєні й додаємо нові, не чіпаючи прогрес інших порцій.
function reconcileMistakeSession(){if(activeScope!=='mistakes'&&root.sessions.mistakes)syncSessionOrder(root.sessions.mistakes,SCOPE_IDS.mistakes)}
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
 info.updatedAt=Date.now();persistMistakes();
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
function exportMistakes(){downloadJson({type:'pdr-typical-mistakes',version:1,records:mistakeHistory,exportedAt:new Date().toISOString()},'pdr-typovi-pomylky.json')}
async function importMistakes(file){
 if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(data?.type!=='pdr-typical-mistakes'||data.version!==1||!data.records||typeof data.records!=='object'||Array.isArray(data.records))throw Error('invalid');
  const valid=Object.entries(data.records).filter(([id,v])=>Q[Number(id)]&&v&&Number.isFinite(Number(v.wrongs))&&Number(v.wrongs)>0);
  if(!await askConfirm(`У файлі ${questionsCount(valid.length)} з історією помилок. Поточну статистику буде замінено даними з файлу.`,{title:'Імпортувати статистику?',ok:'Імпортувати',danger:true}))return;
  for(const id of Object.keys(mistakeHistory))delete mistakeHistory[id];
  for(const [id,v] of valid){const m=cleanMistake(v);if(m)mistakeHistory[id]={...m,updatedAt:m.updatedAt||Date.now()}}
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
 actions.append(...fileButton('Імпорт статистики','application/json,.json','Імпортувати статистику типових помилок',files=>importMistakes(files[0])));head.append(actions);section.append(head);
 if(!SCOPE_IDS.mistakes.length){
  section.append(h('p',{class:'mastery-note',text:'Активних типових помилок поки немає. Список автоматично поповниться, щойно ти даси хоча б одну неправильну відповідь.'}));return;
 }
 section.append(h('p',{class:'mastery-note',text:'Список відсортовано за кількістю неправильних спроб. Для кожного питання видно прогрес засвоєння (0/3, 1/3, 2/3). Кнопка «Повторити» відкриває його для нової спроби.'}));
 const items=h('div',{class:'mistake-items'});
 for(const id of SCOPE_IDS.mistakes){
  const q=Q[id],entry=mistakeHistory[id];const item=h('div',{class:'mistake-item'});
  const row=h('div',{class:'mistake-item-head'});
  row.append(h('span',{class:'mistake-id',text:questionLabel(q)}));
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
// Кнопка вибору файлів із прихованим <input type=file>; повертає [кнопка, input] для append(...).
function fileButton(text,accept,label,onFiles,multiple=false){
 const input=h('input',{type:'file',accept,'aria-label':label});input.hidden=true;input.multiple=multiple;
 input.addEventListener('change',()=>{const files=[...input.files];input.value='';if(files.length)onFiles(files)});
 return [button(text,'',()=>input.click()),input];
}
// Власне вікно підтвердження замість window.confirm. <dialog> сам тримає фокус усередині, закривається Esc
// і затемнює фон. Для руйнівних дій (danger) фокус на «Скасувати», щоб випадковий Enter нічого не зламав.
function askConfirm(text,{title='Підтвердіть дію',ok='Так',cancel='Скасувати',danger=false}={}){
 return new Promise(resolve=>{
  const dialog=h('dialog',{class:'confirm-dialog','aria-labelledby':'confirm-title','aria-describedby':'confirm-text'}),box=h('div',{class:'confirm-box'});
  const okBtn=button(ok,danger?'danger':'primary',()=>dialog.close('ok')),cancelBtn=button(cancel,'',()=>dialog.close('cancel'));
  const actions=h('div',{class:'confirm-actions'});actions.append(cancelBtn,okBtn);
  box.append(h('h2',{id:'confirm-title',text:title}),h('p',{id:'confirm-text',text}),actions);dialog.append(box);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close('cancel')}); // клік по затемненому фону
  dialog.addEventListener('close',()=>{dialog.remove();resolve(dialog.returnValue==='ok')});
  document.body.append(dialog);dialog.showModal();(danger?cancelBtn:okBtn).focus();
 });
}
function downloadJson(payload,filename){
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function notice(str){const box=document.getElementById('notice');box.textContent=str;box.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.style.display='none',2400)}
function renderScopes(){
 document.querySelectorAll('.batch-card').forEach(b=>{
  const active=b.dataset.scope==='multi'?activeScope.startsWith(MIX_PREFIX):b.dataset.scope===activeScope;
  b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');
  if(b.dataset.scope==='multi')b.setAttribute('aria-expanded',mixedPickerOpen?'true':'false');
 });
 const picked=getValidMixedBatches(activeScope);
 document.getElementById('multi-summary').textContent=picked
  ? `${picked.map(b=>b.name).join(' + ')} · ${questionsCount(SCOPE_IDS[activeScope].length)}`
  : (mixedDraft.size>=2?`${BATCHES.filter(b=>mixedDraft.has(b.key)).map(b=>b.name).join(' + ')} · вибрати`: 'Обрати 2 або більше порцій');
 // Лічильник у картці й узгоджене слово після нього: «1 питання», «5 питань».
 for(const [elId,n] of [['saved-count',savedQuestions.size],['mistake-count',SCOPE_IDS.mistakes.length],['commented-count',SCOPE_IDS.commented.length]]){
  const el=document.getElementById(elId);el.textContent=n;el.nextSibling.textContent=el.nextSibling.textContent.replace(/^\s*\S+/,' '+questionsCount(n).replace(/^\d+ /,''));
 }
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
  const cb=h('input',{type:'checkbox',value:batch.key,'aria-label':`${batch.name} (${questionsCount(batch.ids.length)})`});
  cb.checked=mixedDraft.has(batch.key);
  cb.addEventListener('change',()=>{if(cb.checked)mixedDraft.add(batch.key);else mixedDraft.delete(batch.key);renderMixedPicker()});
  const content=h('span');content.append(h('b',{text:batch.name}),h('small',{text:questionsCount(batch.ids.length)}));
  label.append(cb,content);options.append(label);
 }
 section.append(options);
 const chosen=BATCHES.filter(batch=>mixedDraft.has(batch.key));
 const count=chosen.reduce((sum,batch)=>sum+batch.ids.length,0);
 section.append(h('p',{class:'mixed-summary',text:chosen.length>=2?`Обрано: ${batchesCount(chosen.length)} · ${questionsCount(count)}`:`Обрано: ${chosen.length} із ${BATCHES.length}. Потрібно щонайменше 2 порції.`}));
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
 syncSessionOrder(existing,SCOPE_IDS.saved);
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
// Відкриває питання зі списку («Збережені», «З моїми коментарями») у відповідному наборі.
function openInScope(scope,id){
 if(activeScope!==scope)switchScope(scope);
 if(!state.order.includes(id)){
  state.order=[...SCOPE_IDS[scope]];state.mode='normal';
 }
 state.index=state.order.indexOf(id);openOriginal=false;render();
 document.getElementById('panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function exportSaved(){downloadJson({type:'pdr-bookmarks',version:1,questionIds:[...savedQuestions],exportedAt:new Date().toISOString()},'pdr-zberezheni-pytannia.json')}
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
 actions.append(...fileButton('Імпортувати','application/json,.json','Імпортувати закладки з JSON-файлу',files=>importSaved(files[0])));head.append(actions);section.append(head);
 if(!savedQuestions.size){section.append(h('p',{class:'saved-empty',text:'Поки немає збережених питань. Натисніть «☆ Зберегти питання» біля будь-якого питання у будь-якій порції.'}));return}
 section.append(h('p',{class:'saved-library-note',text:'Натисніть на питання, щоб відкрити його в тренуванні. Позначки зберігаються незалежно від правильності відповідей.'}));
 const items=h('div',{class:'saved-items'});
 for(const id of SCOPE_IDS.saved){
  const q=Q[id];const item=h('div',{class:'saved-item'});
  const link=h('button',{class:'saved-jump',type:'button',title:q.question});
  link.append(h('span',{class:'saved-item-num',text:questionLabel(q)}));
  link.append(h('span',{text:q.question}));link.addEventListener('click',()=>openInScope('saved',id));
  const del=button('Прибрати','remove-saved',()=>toggleSaved(id));del.setAttribute('aria-label',`Прибрати зі збережених: ${q.question}`);
  item.append(link,del);items.append(item);
 }
 section.append(items);
}

// ===== Мої коментарі до питань =====
// Форматований текст і власні картинки до будь-якого питання в будь-якому наборі. Зберігаються в IndexedDB
// (картинки як Blob), бо localStorage замалий для зображень. Ключ — id питання.
const COMMENTS_DB='pdr-quiz-comments-v1',COMMENTS_STORE='comments';
const comments=new Map(); // id → {html, images:[{blob,url}], updatedAt}
const commentDrafts=new Map(); // id → {html, images, dirty} — відкриті редактори; переживають перехід між питаннями
const commentHidden=new Set(); // id, де коментар згорнули після відповіді; нова відповідь знову його показує
let commentsDb=null,commentOpen=null,commentsReady=false; // commentOpen — id питання, де коментар розгорнуто ще до відповіді
function openCommentsDb(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(COMMENTS_DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore(COMMENTS_STORE,{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
function commentsTx(mode,fn){
 return new Promise((resolve,reject)=>{
  const tx=commentsDb.transaction(COMMENTS_STORE,mode),req=fn(tx.objectStore(COMMENTS_STORE));
  tx.oncomplete=()=>resolve(req?.result);tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}
function commentEntry(record){return {html:cleanCommentHtml(record.html||''),updatedAt:record.updatedAt,images:(record.images||[]).filter(b=>b instanceof Blob).map(blob=>({blob,url:URL.createObjectURL(blob)}))}}
async function loadComments(){
 try{
  commentsDb=await openCommentsDb();
  for(const record of await commentsTx('readonly',store=>store.getAll())){
   if(record.id===SYNC_RECORD){const {id,...saved}=record;sync={...emptySync(),...saved}}
   else if(Q[record.id])comments.set(record.id,commentEntry(record));
  }
 }catch(e){commentsDb=null;notice('Коментарі недоступні: браузер не дозволяє зберігати дані.')}
 commentsReady=true;reconcileCommentedSession();render();syncNow();
}
// Набір «З моїми коментарями» — питання з коментарем у порядку порцій. Оновлюється після кожної зміни коментарів.
function reconcileCommentedSession(){
 SCOPE_IDS.commented=questions.filter(q=>comments.has(q.id)).map(q=>q.id);
 const s=activeScope==='commented'?state:root.sessions.commented;
 if(s)syncSessionOrder(s,SCOPE_IDS.commented);
}
// Текст коментаря для попереднього перегляду: між блоками ставимо пробіли, щоб слова не злипалися.
function commentPreview(c){
 const text=commentText(c.html.replace(/<(br|\/p|\/div|\/li|\/h3|\/h4|\/blockquote)\b[^>]*>/gi,' $&')).replace(/\s+/g,' ');
 const pics=c.images.length?` 🖼 ${plural(c.images.length,'картинка','картинки','картинок')}`:'';
 return '📝 '+text+pics;
}
function renderCommentedLibrary(){
 const section=document.getElementById('commented-library');section.hidden=activeScope!=='commented';section.replaceChildren();
 if(activeScope!=='commented')return;
 const head=h('div',{class:'saved-library-head'});head.append(h('h3',{text:`📝 Питання з моїми коментарями (${SCOPE_IDS.commented.length})`}));section.append(head);
 if(!SCOPE_IDS.commented.length){section.append(h('p',{class:'saved-empty',text:commentsReady?'Поки немає коментарів. Натисніть «📝 Додати коментар» біля будь-якого питання в будь-якому наборі.':'Завантажую коментарі…'}));return}
 section.append(h('p',{class:'saved-library-note',text:'Тут видно початок кожного коментаря. Натисніть на питання, щоб відкрити його в тренуванні: повний коментар з’явиться після відповіді або за кнопкою «📝 Мій коментар».'}));
 const items=h('div',{class:'saved-items'});
 for(const id of SCOPE_IDS.commented){
  const q=Q[id],item=h('div',{class:'saved-item'}),link=h('button',{class:'saved-jump',type:'button',title:q.question});
  link.append(h('span',{class:'saved-item-num',text:questionLabel(q)}),h('span',{text:q.question}),h('span',{class:'comment-snippet',text:commentPreview(comments.get(id))}));
  link.addEventListener('click',()=>openInScope('commented',id));item.append(link);items.append(item);
 }
 section.append(items);
}
function revokeUnused(images,keep){for(const img of images)if(!keep.includes(img))URL.revokeObjectURL(img.url)}

// Дозволене форматування: жирний, курсив, підкреслення, списки, відступи, заголовки, кольори.
// Усе інше (скрипти, посилання, картинки, чужі стилі) прибирається — і з вставленого тексту, і з імпорту.
const COMMENT_TAGS=new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','SUB','SUP','BR','HR','P','DIV','UL','OL','LI','BLOCKQUOTE','H3','H4','MARK','SPAN','FONT']);
const COMMENT_DROP=new Set(['SCRIPT','STYLE','TEMPLATE','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','PICTURE','VIDEO','AUDIO','CANVAS','FORM','INPUT','BUTTON','SELECT','TEXTAREA','HEAD','TITLE','META','LINK','NOSCRIPT']);
const COMMENT_STYLES=['color','background-color','font-weight','font-style','text-decoration','text-align','margin-left','padding-left'];
// Колір і накреслення з блоків (p, div, li…) переносимо на внутрішній span: Chrome відкидає стилі блоку,
// коли вставляє його всередину іншого (наприклад, абзац у пункт списку).
const COMMENT_BLOCKS=new Set(['P','DIV','LI','BLOCKQUOTE','H3','H4','UL','OL']),COMMENT_BLOCK_STYLES=['text-align','margin-left','padding-left'];
function cleanCommentHtml(html){
 const tpl=document.createElement('template');tpl.innerHTML=html;
 (function walk(node){
  for(const el of [...node.childNodes]){
   if(el.nodeType===Node.TEXT_NODE)continue;
   const tag=el.nodeType===Node.ELEMENT_NODE?el.tagName.toUpperCase():'';
   if(!tag||COMMENT_DROP.has(tag)){el.remove();continue}
   walk(el);
   if(!COMMENT_TAGS.has(tag)){el.replaceWith(...el.childNodes);continue}
   let style=COMMENT_STYLES.map(p=>[p,el.style.getPropertyValue(p)]).filter(([,v])=>v&&/^[#\w\s(),.%-]+$/.test(v));
   const color=tag==='FONT'&&el.getAttribute('color');
   for(const attr of [...el.attributes])el.removeAttribute(attr.name);
   if(color&&/^#?\w+$/.test(color))style.push(['color',color]);
   if(COMMENT_BLOCKS.has(tag)){
    const inline=style.filter(([p])=>!COMMENT_BLOCK_STYLES.includes(p));
    if(inline.length&&el.firstChild){const span=el.ownerDocument.createElement('span');span.setAttribute('style',inline.map(([p,v])=>`${p}:${v}`).join(';'));span.append(...el.childNodes);el.append(span)}
    style=style.filter(([p])=>COMMENT_BLOCK_STYLES.includes(p));
   }
   if(style.length)el.setAttribute('style',style.map(([p,v])=>`${p}:${v}`).join(';'));
  }
 })(tpl.content);
 return tpl.innerHTML;
}
function commentText(html){const tpl=document.createElement('template');tpl.innerHTML=html;return tpl.content.textContent.trim()}
// Фото з телефону зменшуємо до 1600 px і стискаємо у WebP, щоб не забивати сховище браузера.
async function shrinkImage(file,max=1600){
 const bitmap=await createImageBitmap(file),scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));
 return blob&&blob.size<file.size?blob:file;
}

function editComment(id){
 if(!commentsDb){notice('Коментарі недоступні в цьому браузері.');return}
 if(!commentDrafts.has(id)){const c=comments.get(id);commentDrafts.set(id,{html:c?.html||'',images:[...(c?.images||[])],dirty:false})}
 commentOpen=id;render();focusCommentEditor();
}
function focusCommentEditor(){
 const editor=document.querySelector('.comment-editor');if(!editor)return;
 editor.scrollIntoView({behavior:'smooth',block:'center'});editor.focus();
 const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
 const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
}
function updateDraft(id,editor){const draft=commentDrafts.get(id);if(draft){draft.html=editor.innerHTML;draft.dirty=true}}
async function addCommentImages(id,files){
 const draft=commentDrafts.get(id);if(!draft)return;
 for(const file of files.filter(f=>f.type.startsWith('image/'))){
  try{const blob=await shrinkImage(file);draft.images.push({blob,url:URL.createObjectURL(blob)});draft.dirty=true}
  catch(e){notice(`Не вдалося відкрити картинку «${file.name}».`)}
 }
 render();
}
function removeDraftImage(id,img){
 const draft=commentDrafts.get(id);draft.images=draft.images.filter(i=>i!==img);draft.dirty=true;
 revokeUnused([img],comments.get(id)?.images||[]);render();
}
async function saveComment(id){
 const draft=commentDrafts.get(id),html=cleanCommentHtml(draft.html),empty=!commentText(html)&&!draft.images.length,updatedAt=Date.now();
 try{await commentsTx('readwrite',store=>empty?store.delete(id):store.put({id,html,images:draft.images.map(i=>i.blob),updatedAt}))}
 catch(e){notice('Не вдалося зберегти коментар. Можливо, у браузері закінчилося місце.');return}
 revokeUnused(comments.get(id)?.images||[],draft.images);
 if(empty)comments.delete(id);else comments.set(id,{html,images:draft.images,updatedAt});
 commentDrafts.delete(id);reconcileCommentedSession();render();notice(empty?'Порожній коментар видалено.':'Коментар збережено.');scheduleSync();
}
async function cancelComment(id){
 const draft=commentDrafts.get(id);
 if(draft.dirty&&!await askConfirm('Незбережені зміни в коментарі буде втрачено.',{title:'Скасувати зміни?',ok:'Скасувати зміни',cancel:'Продовжити редагування',danger:true}))return;
 revokeUnused(draft.images,comments.get(id)?.images||[]);commentDrafts.delete(id);render();
}
async function deleteComment(id){
 if(!await askConfirm('Ваш коментар до цього питання буде видалено разом із картинками. Відновити його можна лише з резервної копії.',{title:'Видалити коментар?',ok:'Видалити',danger:true}))return;
 try{await commentsTx('readwrite',store=>store.delete(id))}catch(e){notice('Не вдалося видалити коментар.');return}
 revokeUnused(comments.get(id)?.images||[],[]);comments.delete(id);reconcileCommentedSession();render();notice('Коментар видалено.');scheduleSync();
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
const dataUrls=new WeakMap(); // Blob → dataURL: при кожній синхронізації картинки не кодуються заново
async function dataUrlOf(blob){if(!dataUrls.has(blob))dataUrls.set(blob,await blobToDataUrl(blob));return dataUrls.get(blob)}
// Коментар у JSON-форматі (той самий в експорті й у gist) і назад — у IndexedDB та пам’ять. Картинки — лише data:image/…
async function commentRecord(c){return {html:c.html,updatedAt:c.updatedAt,images:await Promise.all(c.images.map(i=>dataUrlOf(i.blob)))}}
async function storeCommentRecord(id,r){
 const sources=r.images.filter(src=>typeof src==='string'&&src.startsWith('data:image/'));
 const images=await Promise.all(sources.map(async src=>{const blob=await (await fetch(src)).blob();dataUrls.set(blob,src);return blob}));
 const record={id,html:cleanCommentHtml(r.html),images,updatedAt:Number(r.updatedAt)||Date.now()};
 await commentsTx('readwrite',store=>store.put(record));
 revokeUnused(comments.get(id)?.images||[],commentDrafts.get(id)?.images||[]);comments.set(id,commentEntry(record));
}
async function exportComments(){
 const records={};
 for(const [id,c] of comments)records[id]=await commentRecord(c);
 downloadJson({type:'pdr-comments',version:1,records,exportedAt:new Date().toISOString()},'pdr-moi-komentari.json');
}
async function importComments(file){
 try{
  const data=JSON.parse(await file.text());
  if(data?.type!=='pdr-comments'||data.version!==1||!data.records||typeof data.records!=='object'||Array.isArray(data.records))throw Error('invalid');
  const valid=Object.entries(data.records).filter(([id,r])=>Q[Number(id)]&&r&&typeof r.html==='string'&&Array.isArray(r.images));
  const replaced=valid.filter(([id])=>comments.has(Number(id))).length;
  if(!await askConfirm(`Питань із коментарями у файлі: ${valid.length}.${replaced?` Для ${replaced} з них ваші поточні коментарі буде замінено.`:''}`,{title:'Імпортувати коментарі?',ok:'Імпортувати',danger:replaced>0}))return;
  for(const [rawId,r] of valid)await storeCommentRecord(Number(rawId),r);
  reconcileCommentedSession();render();notice(`Імпортовано коментарі: ${valid.length}.`);scheduleSync();
 }catch(e){notice('Не вдалося імпортувати коментарі. Перевірте JSON-файл.')}
}

const COMMENT_TOOLS=[
 ['B','bold','Жирний (Ctrl+B)'],['I','italic','Курсив (Ctrl+I)'],['U','underline','Підкреслений (Ctrl+U)'],['S','strikeThrough','Закреслений'],
 ['H','formatBlock','Заголовок','<h3>'],['¶','formatBlock','Звичайний текст','<div>'],
 ['•','insertUnorderedList','Маркований список'],['1.','insertOrderedList','Нумерований список'],
 ['⇤','outdent','Зменшити відступ (Shift+Tab)'],['⇥','indent','Збільшити відступ (Tab)'],
 ['A','foreColor','Червоний текст','#c62828'],['A','foreColor','Зелений текст','#1b7f4b'],['A','foreColor','Синій текст','#176ac3'],
 ['A','hiliteColor','Виділити маркером','#fff59d'],['🧹','removeFormat','Очистити форматування']
];
const COMMENT_ICONS=['⚠️','❗','❓','✅','❌','💡','📌','⭐','👉','➡️','⬅️','⬆️','⬇️','↩️','🔄','🚗','🚚','🚌','🏍️','🚲','🚶','🚦','🛑','⛔','🚸','🅿️','👮','📏','⏱️','🔢'];
function commentToolbar(id,editor){
 const bar=h('div',{class:'comment-toolbar',role:'toolbar','aria-label':'Форматування коментаря'});
 // mousedown не забирає фокус і виділення з редактора.
 bar.addEventListener('mousedown',e=>{if(e.target.closest('.tool,summary'))e.preventDefault()});
 const run=(cmd,value)=>{editor.focus();document.execCommand('styleWithCSS',false,cmd==='foreColor'||cmd==='hiliteColor');document.execCommand(cmd,false,value);updateDraft(id,editor)};
 for(const [label,cmd,title,value] of COMMENT_TOOLS){
  const tool=h('button',{type:'button',class:'tool tool-'+cmd,title,'aria-label':title,text:label});
  if(cmd==='foreColor')tool.style.color=value;else if(cmd==='hiliteColor')tool.style.background=value;
  tool.addEventListener('click',()=>run(cmd,value));bar.append(tool);
 }
 const icons=h('details',{class:'comment-icons'}),grid=h('div',{class:'comment-icon-grid'});
 icons.append(h('summary',{text:'😀 Іконки',title:'Вставити іконку'}),grid);
 for(const icon of COMMENT_ICONS){const tool=h('button',{type:'button',class:'tool',text:icon,'aria-label':'Вставити '+icon});tool.addEventListener('click',()=>{run('insertText',icon);icons.open=false});grid.append(tool)}
 bar.append(icons,...fileButton('🖼 Картинка','image/*','Додати картинку до коментаря',files=>addCommentImages(id,files),true));
 return bar;
}
function commentImages(images,onRemove){
 const list=h('div',{class:'comment-images'});
 images.forEach((img,i)=>{
  const item=h('figure',{class:'comment-image'}),link=h('a',{href:img.url,target:'_blank',rel:'noopener',title:'Відкрити в повному розмірі'});
  link.append(h('img',{src:img.url,alt:`Моя картинка ${i+1}`}));item.append(link);
  if(onRemove)item.append(button('✕ Прибрати','',()=>onRemove(img)));
  list.append(item);
 });
 return list;
}
function renderCommentEditor(id,draft){
 const box=h('section',{class:'comment-section editing','aria-label':'Редагування мого коментаря'});
 box.append(h('h3',{text:'📝 Мій коментар'}));
 const editor=h('div',{class:'comment-editor',contenteditable:'true',role:'textbox','aria-multiline':'true','aria-label':'Текст коментаря','data-placeholder':'Напишіть своє пояснення, підказку чи правило…'});
 editor.innerHTML=cleanCommentHtml(draft.html);
 editor.addEventListener('input',()=>updateDraft(id,editor));
 editor.addEventListener('keydown',e=>{
  if(e.key==='Tab'){e.preventDefault();document.execCommand(e.shiftKey?'outdent':'indent');updateDraft(id,editor)}
  else if(e.key==='Escape')editor.blur();
 });
 editor.addEventListener('paste',e=>{
  const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();addCommentImages(id,files);return}
  const html=e.clipboardData?.getData('text/html');if(html){e.preventDefault();document.execCommand('insertHTML',false,cleanCommentHtml(html))}
 });
 editor.addEventListener('drop',e=>{const files=[...(e.dataTransfer?.files||[])];if(files.length){e.preventDefault();addCommentImages(id,files)}});
 box.append(commentToolbar(id,editor),editor);
 if(draft.images.length)box.append(commentImages(draft.images,img=>removeDraftImage(id,img)));
 const actions=h('div',{class:'comment-actions'});
 actions.append(button('Зберегти коментар','primary',()=>saveComment(id)),button('Скасувати','',()=>cancelComment(id)));
 box.append(actions,h('p',{class:'comment-help',text:'Tab — більший відступ, Shift+Tab — менший. Ctrl+B / Ctrl+I / Ctrl+U — жирний, курсив, підкреслення. Картинку можна вставити з буфера обміну (Ctrl+V) або перетягнути в поле.'}));
 return box;
}
function renderCommentView(id,c){
 const box=h('section',{class:'comment-section','aria-label':'Мій коментар'});
 const head=h('div',{class:'comment-head'}),actions=h('div',{class:'comment-actions'});
 actions.append(button('✎ Редагувати','',()=>editComment(id)),button('Видалити','',()=>deleteComment(id)));
 actions.append(button('Згорнути','',()=>collapseComment(id)));
 head.append(h('h3',{text:'📝 Мій коментар'}),actions);box.append(head);
 if(commentText(c.html)){const text=h('div',{class:'comment-body'});text.innerHTML=c.html;box.append(text)}
 if(c.images.length)box.append(commentImages(c.images));
 return box;
}
function renderComment(id,done){
 const draft=commentDrafts.get(id);if(draft)return renderCommentEditor(id,draft);
 const c=comments.get(id);
 if(c&&commentVisible(id))return renderCommentView(id,c);
 if(!c&&done&&commentsDb){const add=h('button',{type:'button',class:'link',text:'📝 Додати свій коментар до цього питання'});add.addEventListener('click',()=>editComment(id));return h('div',{},[add])}
 return null;
}
// До відповіді коментар захований (щоб не підказував) — його відкриває кнопка «📝 Мій коментар».
// Після відповіді показується сам, доки його не згорнули; нова відповідь на питання знову його показує.
function commentVisible(id){return commentOpen===id||(state.answers[id]!==undefined&&!commentHidden.has(id))}
function collapseComment(id){if(commentOpen===id)commentOpen=null;commentHidden.add(id);render()}
function commentButton(id){
 const has=comments.has(id),shown=has&&commentVisible(id);
 const b=h('button',{type:'button',class:'comment-btn'+(has?' has-comment':''),text:has?'📝 Мій коментар':'📝 Додати коментар','aria-label':has?(shown?'Згорнути мій коментар':'Показати мій коментар'):'Додати мій коментар до питання'});
 if(has)b.setAttribute('aria-expanded',String(shown));
 b.addEventListener('click',()=>{
  if(commentDrafts.has(id))return focusCommentEditor();
  if(!has)return editComment(id);
  if(shown)return collapseComment(id);
  commentOpen=id;commentHidden.delete(id);render();document.querySelector('.comment-section')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 return b;
}
function renderCommentsBar(){
 const bar=document.getElementById('comments-bar');bar.hidden=!commentsDb;bar.replaceChildren();if(!commentsDb)return;
 const info=h('div'),actions=h('div',{class:'comments-bar-actions'});info.append(h('b',{text:`📝 Мої коментарі: ${comments.size}`}));
 if(sync.token){
  const status=h('small',{class:'sync-status'+(syncState==='error'?' error':'')});
  status.append(syncState==='busy'?'☁️ Синхронізую з GitHub…':syncState==='error'?'⚠️ '+syncFail.text:`☁️ Синхронізовано з GitHub${sync.at?' '+syncTime(sync.at):''}. Коментарі, збережені питання й найчастіші помилки однакові на всіх пристроях, де підключено той самий токен.`);
  if(sync.gistId)status.append(' ',h('a',{href:'https://gist.github.com/'+sync.gistId,target:'_blank',rel:'noopener',text:'Gist із коментарями'}));
  info.append(status);
  actions.append(syncFail.status===401&&syncState==='error'?button('Ввести новий токен','soft',openSyncSetup):button('🔄 Синхронізувати','',()=>syncNow(),syncState==='busy'),button('Вимкнути синхронізацію','',disconnectSync));
 }else{
  info.append(h('small',{text:'Коментарі, збережені питання й статистика помилок зберігаються лише в цьому браузері. Увімкніть синхронізацію, щоб бачити їх на всіх своїх пристроях, або перенесіть коментарі файлом через експорт та імпорт.'}));
  actions.append(button('☁️ Синхронізація між пристроями','soft',openSyncSetup));
 }
 actions.append(button('Експорт коментарів','',exportComments,!comments.size),...fileButton('Імпорт коментарів','application/json,.json','Імпортувати коментарі з JSON-файлу',files=>importComments(files[0])));
 bar.append(info,actions);
}

// ===== Синхронізація між пристроями через GitHub Gist: коментарі, збережені питання, найчастіші помилки =====
// Сервера в сайту немає, тому дані лежать у секретних gist на GitHub користувача, а доступ дає його токен
// (лише з дозволом gist). Gist два: коментарі з картинками (великий, змінюється рідко) і «прогрес» — saved.json
// та mistakes.json (маленький, змінюється після кожної помилки), щоб відповідь не тягнула завантаження картинок.
// Прогрес проходження порцій не синхронізується — він у кожного пристрою свій.
// Коментарі: файл на кожне питання (q042.json у форматі запису експорту) — збереження одного коментаря перезаписує
// лише свій файл. Злиття трибічне: base — стан на момент останньої синхронізації, тож між пристроями переносяться
// й видалення. Змінили на обох пристроях — перемагає новіша версія, а правка сильніша за видалення.
// Base лежить поруч із даними, щоб зникати разом із ними: коментарів — в IndexedDB (запис id:'sync', там і токен),
// закладок і помилок — у localStorage (PROGRESS_SYNC_KEY). Тоді стерті браузером дані не «видаляться» з gist,
// а завантажаться заново.
const SYNC_RECORD='sync',GIST_API='https://api.github.com/gists',PROGRESS_SYNC_KEY='pdr-quiz-progress-sync-v1';
const SYNC_GISTS={
 comments:{mark:'pdr-comments-sync.json',title:'мої коментарі',about:'Мої коментарі до питань тренажера ПДР: файл qNNN.json на кожне питання.'},
 progress:{mark:'pdr-progress-sync.json',title:'збережені питання й найчастіші помилки',about:'Збережені питання (saved.json) і статистика найчастіших помилок (mistakes.json) тренажера ПДР.'}
};
const SYNC_TOKEN_URL='https://github.com/settings/tokens/new?scopes=gist&description='+encodeURIComponent('Тренажер ПДР — синхронізація');
function emptySync(){return {token:'',gistId:'',version:'',base:{},at:0}} // version — версія gist після останньої синхронізації, at — її час
let sync=emptySync(),syncState='',syncFail={},syncRun=null,syncAgain=false,syncTimer=null;
function saveSync(s){return commentsTx('readwrite',store=>store.put({...s,id:SYNC_RECORD}))}
function commentFile(id){return `q${String(id).padStart(3,'0')}.json`}
function syncTime(at){const d=new Date(at),time=d.toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
 return d.toDateString()===new Date().toDateString()?'о '+time:d.toLocaleDateString('uk-UA',{day:'numeric',month:'long'})+' о '+time}
function syncError(status,message){return Object.assign(Error(message||'GitHub '+status),{status})}
async function gistApi(s,path='',{method='GET',body}={}){
 let res;
 try{res=await fetch(GIST_API+path,{method,cache:'no-store',body:body&&JSON.stringify(body),
  headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+s.token,...(body&&{'Content-Type':'application/json'})}})}
 catch(e){throw syncError('offline')}
 if(!res.ok)throw syncError(res.status);
 return res.json();
}
// Gist із позначкою (mark), створений раніше (зокрема на іншому пристрої), або новий секретний.
// Якщо таких кілька (два пристрої створили одночасно), усі пристрої обирають найстаріший.
async function findSyncGist(s,kind){
 const {mark,title,about}=SYNC_GISTS[kind],found=[];
 for(let page=1;;page++){
  const list=await gistApi(s,`?per_page=100&page=${page}`);found.push(...list.filter(g=>g.files?.[mark]));
  if(list.length<100)break;
 }
 if(found.length)return found.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))[0].id;
 const files={[mark]:{content:JSON.stringify({type:mark.replace('.json',''),version:1,about},null,2)}};
 return (await gistApi(s,'',{method:'POST',body:{description:`Тренажер ПДР: ${title} (синхронізація між пристроями). Не видаляйте файл ${mark}.`,public:false,files}})).id;
}
async function gistFileText(file){
 if(!file.truncated)return file.content;
 let res;try{res=await fetch(file.raw_url)}catch(e){throw syncError('offline')} // файли понад 1 МБ API обрізає — повний текст за raw_url
 if(!res.ok)throw syncError(res.status);
 return res.text();
}
function parseJson(text){try{return JSON.parse(text)}catch(e){return null}}
async function readSyncGist(s){
 const gist=await gistApi(s,'/'+s.gistId),records=new Map();
 if(gist.truncated)throw syncError('files'); // GitHub віддає не більше 300 файлів
 for(const [name,file] of Object.entries(gist.files||{})){
  const id=Number(/^q(\d+)\.json$/.exec(name)?.[1]);if(!Q[id])continue;
  const r=parseJson(await gistFileText(file));
  if(typeof r?.html!=='string'||!Array.isArray(r.images)||!Number.isFinite(r.updatedAt))throw syncError('format','Пошкоджений файл '+name);
  records.set(id,r);
 }
 return {records,version:gist.history?.[0]?.version};
}
// Надсилаємо файли порціями до ~2 МБ, щоб не впертися в розмір запиту, коли в коментарях багато картинок.
function chunkFiles(files,limit=2e6){
 const chunks=[];let chunk={},size=0;
 for(const [name,file] of Object.entries(files)){
  const n=file?file.content.length:0;if(size&&size+n>limit){chunks.push(chunk);chunk={};size=0}
  chunk[name]=file;size+=n;
 }
 if(Object.keys(chunk).length)chunks.push(chunk);
 return chunks;
}
async function syncCommentsOnce(s,retried=false){
 if(!s.gistId){s.gistId=await findSyncGist(s,'comments');s.version='';s.base={};await saveSync(s)}
 let latest;
 try{[latest]=await gistApi(s,`/${s.gistId}/commits?per_page=1`)}
 catch(e){if(e.status!==404||retried)throw e;s.gistId='';return syncCommentsOnce(s,true)} // gist видалили на GitHub — створимо новий
 // Знімок коментарів: те, що збережуть під час синхронізації, піде наступним проходом.
 const local=new Map(comments);let remote=null,version=s.version;
 if(latest?.version!==s.version){const read=await readSyncGist(s);remote=read.records;version=read.version||latest?.version||''}
 // Якщо gist не змінювався з минулого разу, у ньому саме те, що записано в base.
 const times=remote?new Map([...remote].map(([id,r])=>[id,r.updatedAt])):new Map(Object.entries(s.base).map(([id,t])=>[Number(id),t]));
 const base={},pull=[],push={},pushed=[];
 for(const id of new Set([...local.keys(),...times.keys(),...Object.keys(s.base).map(Number)])){
  if(!Q[id])continue;
  const L=local.get(id)?.updatedAt,R=times.get(id),B=s.base[id];
  if(L===R){if(L!==undefined)base[id]=L;continue}
  // Змінилося лише на одному боці — беремо цей бік; на обох — новішу правку (правка сильніша за видалення).
  const takeRemote=L===B?true:R===B?false:L===undefined?true:R===undefined?false:R>L;
  if(takeRemote){pull.push(id);if(R!==undefined)base[id]=R}
  else{push[commentFile(id)]=L===undefined?null:{content:JSON.stringify(await commentRecord(local.get(id)))};pushed.push([id,L])}
 }
 let pulled=0;
 for(const id of pull){
  if(comments.get(id)!==local.get(id))continue; // змінили під час синхронізації: base=R, тож наступний прохід надішле правку
  if(remote.has(id))await storeCommentRecord(id,remote.get(id));
  else{await commentsTx('readwrite',store=>store.delete(id));revokeUnused(comments.get(id)?.images||[],commentDrafts.get(id)?.images||[]);comments.delete(id)}
  pulled++;
 }
 if(pushed.length){
  // Якщо між читанням і записом gist змінив інший пристрій, його правки ми не бачили — наступного разу читаємо gist повністю.
  let expected=version,raced=false;
  for(const files of chunkFiles(push)){
   const gist=await gistApi(s,'/'+s.gistId,{method:'PATCH',body:{files}}),[now,prev]=gist.history||[];
   raced=raced||!now||prev?.version!==expected;expected=now?.version;
  }
  version=raced?'':expected;
  for(const [id,L] of pushed)if(L!==undefined)base[id]=L;
 }
 if(s!==sync)return 0; // синхронізацію вимкнули або змінили токен, поки чекали на GitHub
 Object.assign(s,{version,base,at:Date.now()});await saveSync(s);
 return pulled;
}

// Закладки й помилки. Обидва — словники id → значення; base — їхні «відбитки» (fp) на момент останньої синхронізації.
const savedFp=()=>'1',mistakeFp=m=>[m.wrongs,m.streak,m.active?1:0,m.lastWrong,m.updatedAt||0].join('/');
const mistakeTime=m=>m.updatedAt||m.lastWrong||0;
function fpMap(obj,fp){return Object.fromEntries(Object.entries(obj).map(([id,v])=>[id,fp(v)]))}
function sameFp(a,b){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>a[k]===b[k])}
// Трибічне злиття: змінилося на одному боці — беремо цей бік; на обох — localNewer(L,R) вирішує, чи лишити локальне
// (правка сильніша за видалення).
function merge3(local,remote,base,fp,localNewer){
 const out={};
 for(const id of new Set([...Object.keys(local),...Object.keys(remote),...Object.keys(base)])){
  if(!Q[id])continue;
  const L=local[id],R=remote[id],l=L&&fp(L),r=R&&fp(R),b=base[id];
  const v=l===r||r===b?L:l===b?R:!L?R:!R?L:localNewer(L,R)?L:R;
  if(v)out[id]=v;
 }
 return out;
}
function readProgressSync(){
 const p=parseJson(localStorage.getItem(PROGRESS_SYNC_KEY));
 return {gistId:'',version:'',saved:{},mistakes:{},...(p&&typeof p==='object'?p:{})};
}
function progressFromGist(texts){
 const saved=texts.saved===null?{ids:[]}:parseJson(texts.saved),mistakes=texts.mistakes===null?{}:parseJson(texts.mistakes);
 if(!Array.isArray(saved?.ids))throw syncError('format','Пошкоджений файл saved.json');
 if(!mistakes||typeof mistakes!=='object'||Array.isArray(mistakes))throw syncError('format','Пошкоджений файл mistakes.json');
 const order=saved.ids.filter(id=>Number.isInteger(id)&&Q[id]),m={};
 for(const [id,v] of Object.entries(mistakes)){const entry=Q[id]&&cleanMistake(v);if(entry)m[id]=entry}
 return {order,saved:Object.fromEntries(order.map(id=>[id,true])),mistakes:m};
}
// Повертає назви того, що оновилося з інших пристроїв (для повідомлення).
async function syncProgressOnce(s,p=readProgressSync(),retried=false){
 if(!p.gistId)p={gistId:await findSyncGist(s,'progress'),version:'',saved:{},mistakes:{}};
 let latest;
 try{[latest]=await gistApi(s,`/${p.gistId}/commits?per_page=1`)}
 catch(e){if(e.status!==404||retried)throw e;return syncProgressOnce(s,{gistId:''},true)} // gist видалили — створимо новий
 let remote=null,version=p.version;
 if(latest?.version!==p.version){
  const gist=await gistApi(s,'/'+p.gistId),file=name=>gist.files?.[name]?gistFileText(gist.files[name]):null;
  remote=progressFromGist({saved:await file('saved.json'),mistakes:await file('mistakes.json')});
  version=gist.history?.[0]?.version||latest?.version||'';
 }
 if(s!==sync)return [];
 // Від знімка до запису — без await, щоб не загубити відповідь, дану під час синхронізації.
 const localSaved=Object.fromEntries([...savedQuestions].map(id=>[id,true])),localMistakes={...mistakeHistory};
 const savedOut=remote?merge3(localSaved,remote.saved,p.saved,savedFp,()=>true):localSaved;
 const mistakesOut=remote?merge3(localMistakes,remote.mistakes,p.mistakes,mistakeFp,(L,R)=>mistakeTime(L)>=mistakeTime(R)):localMistakes;
 const savedPrints=fpMap(savedOut,savedFp),mistakePrints=fpMap(mistakesOut,mistakeFp);
 // Порядок закладок: як на цьому пристрої, нові з інших — у кінці.
 const order=[...[...savedQuestions].filter(id=>savedOut[id]),...(remote?.order||[]).filter(id=>savedOut[id]&&!savedQuestions.has(id))];
 const files={},changed=[];
 if(!sameFp(savedPrints,remote?fpMap(remote.saved,savedFp):p.saved))files['saved.json']={content:JSON.stringify({ids:order})};
 if(!sameFp(mistakePrints,remote?fpMap(remote.mistakes,mistakeFp):p.mistakes))files['mistakes.json']={content:JSON.stringify(mistakesOut)};
 syncApplying=true; // власні записи в localStorage не мають запускати нову синхронізацію
 try{
  if(!sameFp(savedPrints,fpMap(localSaved,savedFp))){
   savedQuestions.clear();for(const id of order)savedQuestions.add(id);
   persistSaved();reconcileSavedSession();changed.push('збережені питання');
  }
  if(!sameFp(mistakePrints,fpMap(localMistakes,mistakeFp))){
   for(const id of Object.keys(mistakeHistory))delete mistakeHistory[id];
   Object.assign(mistakeHistory,mistakesOut);persistMistakes();reconcileMistakeSession();changed.push('найчастіші помилки');
  }
 }finally{syncApplying=false}
 if(Object.keys(files).length){
  const gist=await gistApi(s,'/'+p.gistId,{method:'PATCH',body:{files}}),[now,prev]=gist.history||[];
  version=now&&prev?.version===version?now.version:''; // хтось записав між читанням і записом — наступного разу читаємо повністю
 }
 if(s===sync)try{localStorage.setItem(PROGRESS_SYNC_KEY,JSON.stringify({gistId:p.gistId,version,saved:savedPrints,mistakes:mistakePrints}))}catch(e){}
 return changed;
}
function syncErrorText(e){
 if(e.status===401)return 'GitHub не приймає токен: можливо, його скопійовано не повністю, відкликано або закінчився термін дії.';
 if(e.status===404)return 'Токену бракує дозволу gist. Створіть новий токен із позначкою gist.';
 if(e.status===403||e.status===429)return 'GitHub відмовив у доступі або тимчасово обмежив запити. Спробуйте пізніше.';
 if(e.status==='offline')return 'Немає зв’язку з GitHub. Зміни збережено в цьому браузері — їх буде надіслано, коли з’явиться інтернет.';
 if(e.status==='files')return 'У gist понад 300 файлів — GitHub не віддає їх усі, тож синхронізація неможлива.';
 if(e.status==='format')return e.message+' у gist — синхронізацію зупинено, щоб нічого не втратити.';
 return `Не вдалося синхронізувати${typeof e.status==='number'?` (помилка GitHub ${e.status})`:''}.`;
}
// Одночасно йде лише одна синхронізація; запит під час неї — ще один прохід після неї.
function syncNow(){
 if(!sync.token||!commentsReady||!commentsDb)return Promise.resolve(); // до завантаження коментарів локально «порожньо» — не синхронізуємо
 clearTimeout(syncTimer);syncTimer=null;
 if(syncRun){syncAgain=true;return syncRun}
 syncState='busy';renderCommentsBar();
 syncRun=(async()=>{
  try{
   do{
    syncAgain=false;const s=sync,changed=await syncProgressOnce(s),pulled=await syncCommentsOnce(s);
    if(pulled)changed.unshift(`коментарі (${pulled})`);
    if(changed.length&&s===sync){
     reconcileCommentedSession();
     if(document.activeElement?.isContentEditable)renderCommentsBar();else render(); // не перебудовуємо редактор, у якому друкують
     notice(`☁️ Оновлено з інших пристроїв: ${changed.join(', ')}.`);
    }
   }while(syncAgain&&sync.token);
   syncState='ok';syncFail={};
  }
  catch(e){syncState='error';syncFail={status:e.status,text:syncErrorText(e)};console.warn('Синхронізація:',e)}
  finally{syncRun=null;renderCommentsBar()}
 })();
 return syncRun;
}
// Після зміни — синхронізація із затримкою; нова зміна відкладає її. Помилки — довша пауза (15 с), щоб під час
// тренування не писати в gist після кожної відповіді (піти зі сторінки — надіслати одразу, див. visibilitychange).
let syncApplying=false;
function scheduleSync(ms=1500){if(sync.token&&!syncApplying){clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,ms)}}
// Токен перевіряємо одразу: знаходимо gist (зокрема створений на іншому пристрої) або створюємо новий.
// Саме злиття йде вже у фоні — зі статусом у панелі коментарів.
async function connectSync(token){
 const s={...emptySync(),token};s.gistId=await findSyncGist(s,'comments');
 await saveSync(s);try{localStorage.removeItem(PROGRESS_SYNC_KEY)}catch(e){}
 sync=s;syncState='';syncFail={};syncNow();
}
async function disconnectSync(){
 if(!await askConfirm('Коментарі, збережені питання й статистика помилок залишаться і в цьому браузері, і на GitHub, але цей пристрій перестане їх синхронізувати. Увімкнути знову можна тим самим токеном.',{title:'Вимкнути синхронізацію?',ok:'Вимкнути'}))return;
 clearTimeout(syncTimer);sync=emptySync();syncState='';syncFail={};
 try{await commentsTx('readwrite',store=>store.delete(SYNC_RECORD))}catch(e){}
 try{localStorage.removeItem(PROGRESS_SYNC_KEY)}catch(e){}
 renderCommentsBar();notice('Синхронізацію вимкнено.');
}
function openSyncSetup(){
 const dialog=h('dialog',{class:'confirm-dialog sync-dialog','aria-labelledby':'sync-title'}),form=h('form',{class:'confirm-box'});
 const first=h('li');first.append('Відкрийте ',h('a',{href:SYNC_TOKEN_URL,target:'_blank',rel:'noopener',text:'сторінку створення токена на GitHub'}),' (потрібен акаунт GitHub — той самий для всіх пристроїв).');
 const steps=h('ol',{class:'sync-steps'},[first,
  h('li',{text:'Позначка «gist» там уже стоїть — більше нічого не вмикайте. В Expiration оберіть термін дії (наприклад, No expiration) і натисніть Generate token унизу сторінки.'}),
  h('li',{text:'Скопіюйте токен (починається з ghp_) і вставте нижче. На інших пристроях вставте той самий токен — усе підтягнеться само.'})]);
 const input=h('input',{type:'password',class:'sync-token',autocomplete:'off',spellcheck:'false',placeholder:'ghp_…','aria-label':'Токен GitHub'});
 const error=h('p',{class:'sync-error',role:'alert'});error.hidden=true;
 const ok=h('button',{type:'submit',class:'btn primary',text:'Підключити'}),cancel=button('Скасувати','',()=>dialog.close());
 form.append(h('h2',{id:'sync-title',text:'☁️ Синхронізація між пристроями'}),
  h('p',{text:'Коментарі з картинками, збережені питання й статистика найчастіших помилок зберігатимуться ще й у секретних gist на вашому GitHub і оновлюватимуться на всіх пристроях, де підключено той самий токен. Прогрес проходження порцій у кожного пристрою свій.'}),
  steps,input,error,h('p',{class:'sync-note',text:'Токен зберігається лише в цьому браузері й дає доступ тільки до ваших gist. Секретні gist не видно в пошуку, але їх може відкрити кожен, хто знає посилання.'}),
  h('div',{class:'confirm-actions'},[cancel,ok]));
 const showError=text=>{error.textContent=text;error.hidden=false};
 form.addEventListener('submit',async e=>{
  e.preventDefault();const token=input.value.trim();
  if(!/^[\x21-\x7e]{20,}$/.test(token)){showError('Це не схоже на токен GitHub. Скопіюйте його повністю — він починається з ghp_ або github_pat_.');input.focus();return}
  ok.disabled=cancel.disabled=input.disabled=true;ok.textContent='Перевіряю токен…';error.hidden=true;
  try{await connectSync(token);dialog.close();notice('Синхронізацію увімкнено.')}
  catch(err){showError(syncErrorText(err))}
  finally{ok.disabled=cancel.disabled=input.disabled=false;ok.textContent='Підключити'}
 });
 dialog.addEventListener('click',e=>{if(e.target===dialog&&!ok.disabled)dialog.close()}); // клік по затемненому фону
 dialog.addEventListener('close',()=>dialog.remove());
 dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();
}
// Коли повертаємося на вкладку — забираємо зміни з інших пристроїв; коли йдемо — одразу надсилаємо незбережене в gist.
// Поки сторінка відкрита, перевіряємо gist раз на 2 хвилини (запит версії — легкий).
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(syncTimer)syncNow()}else if(Date.now()-sync.at>30000)syncNow()});
window.addEventListener('online',()=>syncNow());
setInterval(()=>{if(!document.hidden)syncNow()},120000);

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
 if(scope==='commented')reconcileCommentedSession();
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
// Пагінація: номер кожного питання набору з кольором стану; клік відкриває питання.
// Пропущене — відкривали, але не відповіли; поточне без відповіді рахується окремо.
const PAGE_STATUS={correct:'Правильно',wrong:'Неправильно',skipped:'Пропущено',unseen:'Не відкривали'};
function markSeen(){if(!Array.isArray(state.seen))state.seen=[];const id=state.order[state.index];if(id!==undefined&&!state.seen.includes(id))state.seen.push(id)}
function renderPager(){
 const seen=new Set(state.seen),current=state.order[state.index],counts={correct:0,wrong:0,skipped:0,unseen:0};
 const pager=h('nav',{class:'pager','aria-label':'Номери питань набору'});
 state.order.forEach((id,i)=>{
  const answer=state.answers[id],isCurrent=id===current;
  const status=answer!==undefined?(answer===Q[id].correct?'correct':'wrong'):isCurrent?'unseen':seen.has(id)?'skipped':'unseen';
  if(!isCurrent||answer!==undefined)counts[status]++;
  const label=`Питання ${i+1}: ${isCurrent&&answer===undefined?'поточне':PAGE_STATUS[status].toLowerCase()} · ${questionLabel(Q[id])}`;
  const item=h('button',{type:'button',class:`page-item ${status}${isCurrent?' current':''}`,title:label,'aria-label':label,text:String(i+1)});
  if(isCurrent)item.setAttribute('aria-current','step');
  item.addEventListener('click',()=>{state.index=i;openOriginal=false;render()});
  pager.append(item);
 });
 const wrap=h('div',{class:'pager-wrap'});
 const prev=h('button',{type:'button',class:'pager-arrow',text:'‹',title:'Попередні номери','aria-label':'Попередні номери питань'});
 const next=h('button',{type:'button',class:'pager-arrow',text:'›',title:'Наступні номери','aria-label':'Наступні номери питань'});
 prev.addEventListener('click',()=>pagerStep(pager,-1));next.addEventListener('click',()=>pagerStep(pager,1));
 pager.addEventListener('scroll',()=>updatePagerArrows(pager));
 wrap.append(prev,pager,next);
 const legend=h('div',{class:'pager-legend'});
 for(const [status,name] of Object.entries(PAGE_STATUS))legend.append(h('span',{class:'legend-item '+status,text:`${name}: ${counts[status]}`}));
 return [wrap,legend];
}
// Стрічка показує стільки цілих номерів, скільки влазить у ширину; решта — прокруткою або стрілками ‹ ›,
// які гортають по сторінці. Поточне питання завжди на видимій сторінці. Викликається після кожного render і resize.
function layoutPagers(){
 for(const pager of panel.querySelectorAll('.pager')){
  const wrap=pager.parentElement,items=pager.children.length,first=pager.firstElementChild;if(!first)continue;
  wrap.classList.remove('fits');pager.style.maxWidth='';
  const stride=first.offsetWidth+parseFloat(getComputedStyle(pager).columnGap);
  const fit=Math.max(1,Math.floor(pager.clientWidth/stride)),shown=Math.min(fit,items);
  wrap.classList.toggle('fits',items<=fit);
  pager.style.maxWidth=shown*stride+'px';pager.dataset.page=fit*stride;
  const cur=[...pager.children].findIndex(b=>b.classList.contains('current'));
  pager.scrollLeft=cur>0?Math.floor(cur/fit)*fit*stride:0;
  updatePagerArrows(pager);
 }
}
function pagerStep(pager,dir){
 const page=Number(pager.dataset.page)||pager.clientWidth,at=pager.scrollLeft/page;
 const target=dir>0?Math.floor(at+0.01)+1:Math.ceil(at-0.01)-1;
 pager.scrollTo({left:Math.max(0,target)*page,behavior:'smooth'});
}
function updatePagerArrows(pager){
 pager.previousElementSibling.disabled=pager.scrollLeft<=1;
 pager.nextElementSibling.disabled=pager.scrollLeft+pager.clientWidth>=pager.scrollWidth-1;
}
function render(){
 markSeen();save();renderScopes();renderSavedLibrary();renderMistakeLibrary();renderCommentedLibrary();renderCommentsBar();const st=stats();panel.replaceChildren();
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
  if(activeScope==='commented'&&!state.order.length){
   const empty=h('div',{class:'complete'});
   empty.append(h('h2',{text:'📝 Тут будуть питання з вашими коментарями'}),h('p',{text:commentsReady?'Натисніть «📝 Додати коментар» біля будь-якого питання в будь-якому наборі — воно з’явиться тут, і ці питання можна буде переглядати й проходити окремо.':'Завантажую коментарі…'}));
   if(commentsReady)empty.append(button('Перейти до порції 1','primary',()=>switchScope('batch1')));panel.append(empty);return;
  }
  const id=state.order[state.index];if(id===undefined){results(st);return}
 const q=Q[id],selected=state.answers[id],done=selected!==undefined;
 const top=h('div',{class:'bar'}),line=h('div',{class:'barline'});
 const headline=h('div',{class:'question-heading'});headline.append(h('b',{text:`Питання ${state.index+1} із ${state.order.length}`}));
 const mark=h('button',{type:'button',class:'bookmark-btn'+(savedQuestions.has(id)?' is-saved':''),
   'aria-pressed':savedQuestions.has(id)?'true':'false',
   'aria-label':savedQuestions.has(id)?'Прибрати питання зі збережених':'Зберегти питання для повторення',
   text:savedQuestions.has(id)?'★ У збережених':'☆ Зберегти питання'});
 mark.addEventListener('click',()=>toggleSaved(id));headline.append(mark,commentButton(id));
  if(mistakeHistory[id]?.active){const m=mistakeHistory[id];headline.append(h('span',{class:'question-mastering',text:`⚠ У типових помилках · ${m.streak}/${MASTERED_AT}`}))}
 line.append(headline,h('small',{text:`${SCOPE_NAMES[activeScope]} · ${state.mode==='review'?'Повторення помилок · ':''}Порція ${batchNumber(q.batch)}, №${q.batchOrdinal}`}));top.append(line);
 const pr=h('div',{class:'progress'});pr.append(h('div',{class:'fill',style:`width:${100*(state.index+1)/state.order.length}%`}));top.append(pr,...renderPager());panel.append(top);
 // Навігація над питанням: її положення не залежить від висоти питання.
 const footer=h('div',{class:'foot'});footer.append(button('← Попереднє','',()=>{openOriginal=false;state.index--;render()},state.index===0));
 const controls=h('div',{class:'right'});if(!done)controls.append(button('Пропустити','',()=>{openOriginal=false;state.index++;render()}));
 controls.append(button(state.index===state.order.length-1?'Результати →':'Наступне →','primary',()=>{openOriginal=false;state.index++;render()}));footer.append(controls);panel.append(footer);
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
  opt.addEventListener('click',()=>{if(state.answers[id]!==undefined)return;state.answers[id]=originalIndex;recordAttempt(id,originalIndex===q.correct);commentHidden.delete(id);openOriginal=false;render()});choices.append(opt);
 });layout.append(choices);body.append(layout);
 if(done){const good=selected===q.correct;const m=mistakeHistory[id];
   const feedback=good?(m&&!m.active&&m.streak===MASTERED_AT?'✓ Правильно! Три правильні поспіль — питання засвоєно й прибрано з типових помилок.':`✓ Правильно!${m?.active?' Прогрес засвоєння: '+m.streak+'/'+MASTERED_AT+'.':''}`):'✕ Неправильно. Правильну відповідь позначено зеленим. Питання у типових помилках, прогрес 0/3.';
   body.append(h('div',{class:'message '+(good?'good':'bad'),text:feedback}));
  if(q.original){const link=h('button',{class:'link',text:openOriginal?'Приховати оригінальний скриншот':'Показати оригінальний скриншот і пояснення'});link.addEventListener('click',()=>{openOriginal=!openOriginal;render()});body.append(link);
   if(openOriginal){const orig=h('div',{class:'original-section'});orig.append(h('img',{src:q.original,alt:'Оригінальний скриншот із відповіддю'}));if(q.notes?.length){orig.append(h('h3',{text:'Додаткові пояснення з архіву'}));q.notes.forEach((src,i)=>orig.append(h('img',{src,alt:`Пояснення ${i+1}`})))}body.append(orig)}
  }
 }else body.append(h('div',{class:'hint',text:'Оберіть відповідь. Варіанти відповіді щоразу перемішуються; їхня оригінальна нумерація збережена для питань із варіантами «1 і 2».'}));
 const comment=renderComment(id,done);if(comment)body.append(comment);
 panel.append(body);layoutPagers();
}
function results(st){const end=h('div',{class:'complete'});end.append(h('h2',{text:'🏁 Результати тренування'}),h('p',{text:`${SCOPE_NAMES[activeScope]}. Правильно: ${st.ok} із ${state.order.length}. Помилок: ${st.bad}. Без відповіді: ${st.pending}.` }),...renderPager());
 const actions=h('div',{class:'buttons'});let missing=state.order.findIndex(id=>state.answers[id]===undefined);
 if(missing>=0)actions.append(button('Пройти пропущені','soft',()=>{state.index=missing;render()}));
 if(st.bad)actions.append(button(`Повторити помилки (${st.bad})`,'primary',()=>{
  state.order=state.order.filter(id=>state.answers[id]!==undefined&&state.answers[id]!==Q[id].correct);
  for(const id of state.order)delete state.answers[id];state.seen=[];state.index=0;state.mode='review';answerOrders=createAnswerOrders(answerOrders);render();
 }));
 if(activeScope==='mistakes')end.append(h('p',{text:`Залишилося активних типових помилок: ${SCOPE_IDS.mistakes.length}. Прогрес 1/3 і 2/3 зберігається під час повторних проходжень.`}));
  actions.append(button(`${SCOPE_NAMES[activeScope]} заново`,'',()=>reset(true)));end.append(actions);panel.append(end);layoutPagers();
}
async function reset(confirmIt=true){if(confirmIt&&!await askConfirm(`Прогрес набору «${SCOPE_NAMES[activeScope]}» буде втрачено. Інші набори залишаться без змін. Історія типових помилок і серія правильних відповідей збережуться.`,{title:'Почати заново?',ok:'Почати заново',danger:true}))return;
 state=newSession(activeScope);answerOrders=createAnswerOrders(answerOrders);openOriginal=false;render()}
async function shuffleAll(){if(!SCOPE_IDS[activeScope].length){notice({mistakes:'У списку типових помилок поки немає питань.',commented:'Спочатку додайте хоча б один коментар.'}[activeScope]||'Спочатку збережіть хоча б одне питання.');return}if(!await askConfirm(`Питання й відповіді набору «${SCOPE_NAMES[activeScope]}» буде перемішано, а прогрес цього набору — скинуто.`,{title:'Перемішати й почати заново?',ok:'Перемішати',danger:true}))return;
 const arr=[...SCOPE_IDS[activeScope]];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
 state={order:arr,index:0,answers:{},seen:[],mode:'normal'};answerOrders=createAnswerOrders(answerOrders);openOriginal=false;render()}
const ARCHIVE_ORDINALS=['перший','другий','третій','четвертий','п’ятий','шостий','сьомий','восьмий','дев’ятий','десятий'];
// Картки порцій і лічильники в шапці будуються з даних.
function renderBatchCards(){
 const all=document.querySelector('.batch-card[data-scope="all"]');
 BATCHES.forEach((b,i)=>{
  const card=h('button',{type:'button',class:'batch-card','data-scope':b.key});
  card.append(h('b',{text:b.name}),h('span',{text:`${questionsCount(b.ids.length)} · ${ARCHIVE_ORDINALS[i]?ARCHIVE_ORDINALS[i]+' архів':'архів '+(i+1)}`}));
  all.before(card);
 });
 const total=questionsCount(questions.length),batches=batchesCount(BATCHES.length);
 document.getElementById('all-summary').textContent=`${total} · усі ${batches}`;
 document.getElementById('summary-counts').textContent=`${batches} · ${total}`;
 document.title=`Тренажер ПДР — ${total}, ${batches}, типові помилки`;
}
reconcileSavedSession();
renderBatchCards();
for(const btn of document.querySelectorAll('.batch-card'))btn.addEventListener('click',()=>switchScope(btn.dataset.scope));
document.getElementById('reset').addEventListener('click',()=>reset(true));
document.getElementById('shuffle').addEventListener('click',shuffleAll);
// Стрілки ← → гортають питання, якщо фокус не в полі введення чи редакторі коментаря (кнопки не заважають).
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable||document.querySelector('dialog[open]'))return;
 if(e.key==='ArrowRight'&&state.index<state.order.length){state.index++;openOriginal=false;render()}
 if(e.key==='ArrowLeft'&&state.index>0){state.index--;openOriginal=false;render()}});
// Лише зміна ширини: на телефоні resize спрацьовує й тоді, коли ховається адресний рядок.
let pagerWidth=innerWidth;window.addEventListener('resize',()=>{if(innerWidth!==pagerWidth){pagerWidth=innerWidth;layoutPagers()}});
window.addEventListener('beforeunload',e=>{if([...commentDrafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue=''}});
render();
loadComments();
