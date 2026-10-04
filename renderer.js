const $ = (s) => document.querySelector(s);
let closeTimer = null;
const autoOn = () => S.autoClose !== false;
let S = { theme: 'dark', groups: [] }, cur = null, editing = false;
const id = () => Math.random().toString(36).slice(2, 9);
const persist = () => api.save(S);

function toast(t,ms=2600){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),ms)}
function ask(title, value=''){return new Promise(res=>{
  $('#dlgT').textContent=title;const i=$('#dlgIn');i.value=value;$('#dlg').showModal();i.select();
  const done=v=>{$('#dlg').close();$('#dlgOk').onclick=$('#dlgNo').onclick=i.onkeydown=null;res(v)};
  $('#dlgOk').onclick=()=>done(i.value.trim()||null);$('#dlgNo').onclick=()=>done(null);
  i.onkeydown=e=>{if(e.key==='Enter')done(i.value.trim()||null)};})}
function confirmBox(title, text, okLabel){return new Promise(res=>{
  const d=$('#cfm');$('#cfmT').textContent=title;$('#cfmP').textContent=text;$('#cfmOk').textContent=okLabel;
  d.showModal();$('#cfmNo').focus();
  const done=v=>{d.close();$('#cfmOk').onclick=$('#cfmNo').onclick=d.oncancel=null;res(v)};
  $('#cfmOk').onclick=()=>done(true);$('#cfmNo').onclick=()=>done(false);d.oncancel=()=>done(false)})}

// Draw the group image (cover-cropped, like the rail icon) at several sizes for the .ico
function toPngs(src){return new Promise(res=>{const im=new Image();im.onerror=()=>res(null);im.onload=()=>{
  const out=[];for(const s of [16,32,48,64,128,256]){
    const c=document.createElement('canvas');c.width=c.height=s;const x=c.getContext('2d');x.imageSmoothingQuality='high';
    const k=Math.max(s/im.width,s/im.height),w=im.width*k,h=im.height*k;x.drawImage(im,(s-w)/2,(s-h)/2,w,h);
    out.push({size:s,data:c.toDataURL('image/png').split(',')[1]})}
  res(out)};im.src=src})}

function applyTheme(){document.documentElement.dataset.theme=S.theme;$('#theme').textContent=S.theme==='dark'?'Switch to light':'Switch to dark'}
function badge(label,fn){const b=document.createElement('button');b.className='badge';b.textContent='✕';b.title=label;b.setAttribute('aria-label',label);b.onclick=e=>{e.stopPropagation();fn()};return b}

function render(){
  document.body.classList.toggle('editing',editing);
  $('#settings').classList.toggle('active',editing);
  $('#editMode').textContent=editing?'Done removing':'Remove items';
  const rail=$('#rail');rail.innerHTML='';
  S.groups.forEach(g=>{
    const w=document.createElement('div');w.className='gw';
    const b=document.createElement('button');b.className='g'+(g.id===cur?' on':'');b.title=g.name;b.setAttribute('aria-label',g.name);
    if(g.icon){b.innerHTML=`<img src="${g.icon}" alt="">`}else b.textContent=g.name[0].toUpperCase();
    b.onclick=()=>{cur=g.id;render()};
    b.oncontextmenu=e=>menu(e,[['Rename group',()=>rename(g)],['Change icon',()=>setIcon(g)]]);
    w.append(b);if(editing)w.append(badge(`Delete group ${g.name}`,()=>delGroup(g)));
    rail.append(w)});
  rail.insertAdjacentHTML('beforeend','<div class="sp"></div>');
  const a=document.createElement('button');a.className='g add';a.title='New group';a.setAttribute('aria-label','New group');a.textContent='+';a.onclick=newGroup;rail.append(a);

  const g=S.groups.find(x=>x.id===cur),grid=$('#grid');grid.innerHTML='';
  const n=g?g.items.length:0;
  $('#tName').textContent=g?g.name:'Program Launcher';$('#tCount').textContent=g?`${n} Program${n===1?'':'s'}`:'';
  $('#mkShortcut').disabled=!g;
  $('#autoClose').textContent=`Auto-close: ${autoOn()?'On':'Off'}`;$('#addGames').style.display=g?'':'none';
  if(!g){grid.innerHTML='<p class="empty">Create a group with the + button to get started.</p>';return}
  if(!g.items.length){grid.innerHTML='<p class="empty">This group is empty. Choose Add Program to pick your executables or shortcuts.</p>';return}
  g.items.forEach(it=>{
    const w=document.createElement('div');w.className='xw';
    const b=document.createElement('button');b.className='x';b.title=it.target||it.path;
    b.innerHTML=`<img alt=""><span></span>`;b.querySelector('span').textContent=it.name;
    api.fileIcon(it).then(u=>{const i=b.querySelector('img');if(u)i.src=u;else i.style.visibility='hidden'});
    api.exists(it).then(ok=>{if(!ok)b.classList.add('gone')});
    b.onclick=()=>launch(it);
    b.oncontextmenu=e=>menu(e,[['Rename',()=>renameItem(it)]]);
    w.append(b);if(editing)w.append(badge(`Remove ${it.name}`,()=>delItem(g,it)));
    grid.append(w)});
}

async function launch(it){
  if(editing)return;
  const e=await api.launch(it);
  if(e){toast(`Couldn't start ${it.name}: ${e}`);return}
  clearTimeout(closeTimer);
  if(autoOn()){toast(`Starting ${it.name}. Closing the launcher in 5 seconds.`,5000);closeTimer=setTimeout(()=>api.quit(),5000)}
  else toast(`Starting ${it.name}`)}

function menu(e,items){e.preventDefault();const m=$('#menu');m.innerHTML='';
  items.forEach(([t,f])=>{const b=document.createElement('button');b.textContent=t;b.onclick=()=>{m.style.display='none';f()};m.append(b)});
  m.style.display='block';m.style.left=Math.min(e.clientX,innerWidth-190)+'px';m.style.top=Math.min(e.clientY,innerHeight-m.offsetHeight-8)+'px'}

const dd=$('#ddMenu');
function setDD(open){dd.hidden=!open;$('#settings').setAttribute('aria-expanded',open)}
$('#settings').onclick=e=>{e.stopPropagation();setDD(dd.hidden)};
addEventListener('click',()=>{$('#menu').style.display='none';setDD(false)});
addEventListener('keydown',e=>{if(e.key==='Escape')setDD(false)});

async function newGroup(){const n=await ask('Name the group');if(!n)return;const g={id:id(),name:n,icon:null,items:[]};S.groups.push(g);cur=g.id;persist();render()}
async function rename(g){const n=await ask('Rename group',g.name);if(n){g.name=n;persist();render()}}
async function renameItem(it){const n=await ask('Rename',it.name);if(n){it.name=n;persist();render()}}
async function setIcon(g){const i=await api.pickImage();if(i){g.icon=i;persist();render()}}
async function delGroup(g){
  const n=g.items.length;
  if(!await confirmBox(`Delete “${g.name}”?`,`This removes the group and its ${n} program${n===1?'':'s'} from the launcher. The programs stay installed on your PC.`,'Delete group'))return;
  S.groups=S.groups.filter(x=>x!==g);if(cur===g.id)cur=S.groups[0]?.id||null;persist();render()}
async function delItem(g,it){
  if(!await confirmBox(`Remove “${it.name}”?`,`It will be removed from “${g.name}”. The program stays installed on your PC.`,'Remove'))return;
  g.items=g.items.filter(x=>x!==it);persist();render()}

$('#addGames').onclick=async()=>{const g=S.groups.find(x=>x.id===cur);if(!g)return;
  const {items,blocked}=await api.pickExes();
  for(const it of items)if(!g.items.some(i=>i.path===it.path))g.items.push(it);
  persist();render();if(blocked)toast("The launcher can't be added as a program.")};
$('#autoClose').onclick=()=>{S.autoClose=!autoOn();if(closeTimer){clearTimeout(closeTimer);closeTimer=null;toast('Auto-close cancelled')}persist();render()};
$('#mkShortcut').onclick=async()=>{const g=S.groups.find(x=>x.id===cur);if(!g)return;
  const pngs=g.icon?await toPngs(g.icon):null;
  const e=await api.makeShortcut({id:g.id,name:g.name,icon:g.icon,pngs});toast(e?`Couldn't create the shortcut: ${e}`:`Shortcut for “${g.name}” added to your desktop`)};
$('#theme').onclick=()=>{S.theme=S.theme==='dark'?'light':'dark';applyTheme();persist()};
$('#editMode').onclick=()=>{editing=!editing;render()};

api.onSelectGroup(id=>{if(S.groups.some(x=>x.id===id)){cur=id;render()}});
(async()=>{S=await api.load();const sg=await api.startupGroup();
  cur=S.groups.find(x=>x.id===sg)?.id||S.groups[0]?.id||null;applyTheme();render()})();
