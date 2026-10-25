/* 비바리움 관찰 탭 — 저장된 도면(내 단면도 슬롯)을 읽기 전용으로 그리고 캐릭터를 올린다.
   원칙: 도면 데이터(S, SL)는 읽기만 한다. 캐릭터 정보는 viv-data.js 의 별도 저장소에만 쓴다.
   도면 그리기는 기존 render()/exportSvg() 를 그대로 재사용한다(문서를 잠시 바꿔 그린 뒤 반드시 원래 문서로 복원). */
(function(){
const NSV='http://www.w3.org/2000/svg';
const B=window.SectionBridge;   // app.js 가 내보낸 읽기 전용 연결부(편집기 내부 함수 재사용)
const {norm,render,exportSvg,EH,lvl,sl,fnameKo,OPT,STAIR_ASSET,art,ART,applyVP,persistNow,slotName,esc}=B;
const q=(s,r)=>(r||document).querySelector(s),qa=(s,r)=>[...(r||document).querySelectorAll(s)];
const G=Sim.GROUPS,REDUCE=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const HMIN=20,HMAX=400;
let mode='edit',houses=[],activeIdx=0,selChar=null,IMG={},token=0,clockT=0,simT=0,shareT=0,booted=false;
const SH=()=>window.VivShare||null;
const shareOn=()=>!!(SH()&&SH().enabled());
const curShare=()=>{const h=houses[activeIdx];return h&&h.shared?h.shared:null};    // 지금 보는 집이 공유 집이면 {hid,role}
const canEdit=c=>!c||!c.remote||!!c.canEdit;                                    // 공유 집 캐릭터는 등록한 사람과 집 주인만 수정(서버도 같은 규칙으로 검증)
const note=(m,kind)=>{const e=q('#vvNote');if(!e)return;e.textContent=m||'';e.className='vv-note2'+(kind?' '+kind:'');e.hidden=!m};

/* ---------- 저장된 도면 목록 (내 단면도 슬롯, 읽기 전용) ---------- */
function isBlank(slot){
  const d=slot&&slot.doc;if(!d||!d.b)return true;
  const empty=!(d.items&&d.items.length)&&!(d.parts&&d.parts.length)&&!(d.ops&&d.ops.length)&&!(d.stairs&&d.stairs.length);
  const def=norm({}).b;
  return empty&&!slot.name&&!d.title&&JSON.stringify(d.b)===JSON.stringify(def)}
function getHouses(){
  try{persistNow()}catch(e){}   // 편집 중인 내용을 슬롯에 먼저 반영(읽기 전용 표시를 최신으로)
  const linked=shareOn()?SH().linkedSlots():new Set();   // 공유 집과 연결된 내 단면도는 공유 집 하나로만 보여 준다(중복 표시 방지)
  const out=[];Object.entries(B.SL.slots||{}).sort((a,b)=>a[0]-b[0]).forEach(([id,s])=>{if(isBlank(s)||linked.has(String(id)))return;
    out.push({id:'slot:'+id,name:(typeof slotName==='function'?slotName(id):(s.name||'단면도 '+id)),doc:s.doc,key:id+':'+(s.t||0)+':'+JSON.stringify(s.doc).length})});
  if(shareOn())SH().sharedHouses().forEach(x=>out.push({id:'srv:'+x.hid,name:x.name,doc:x.doc,key:'srv:'+x.hid+':'+x.docRev+':'+x.name,shared:{hid:x.hid,role:x.role}}));
  return out}

/* ---------- 도면 → 그림 (기존 render/exportSvg 재사용) ---------- */
async function preload(doc){
  const urls=new Set(),addA=a=>{if(!a)return;Object.values(a.views||{}).forEach(v=>{if(v){urls.add(v.svg);if(v.fill)urls.add(v.fill)}})};
  (doc.items||[]).forEach(it=>{const a=B.AM[it.assetId],v=a&&a.views&&a.views[it.view];if(v){urls.add(v.svg);if(OPT.fill&&v.fill)urls.add(v.fill)}});
  (doc.stairs||[]).forEach(s=>{const k=STAIR_ASSET[s.type];if(k)addA(B.AM[k.id])});
  const t0=Date.now();
  while(Date.now()-t0<8000){let all=true;for(const u of urls){art(u,true);if(!(ART[u]&&ART[u].ready))all=false}if(all)break;await new Promise(r=>setTimeout(r,60))}}
/* 도면에서 시뮬레이션에 필요한 기하만 뽑는다: 층·방(내벽 구간)·문·창문·계단 끝점·가구(분류 메타 포함). S 를 읽기만 한다. */
function buildGeo(S,b){
  const geo={W:b.w,in0:b.t,in1:b.w-b.t,floors:[],rooms:[],stairs:[],items:[],windows:[],exits:[]},g0=B.BB();
  for(let k=0;k<b.f;k++)geo.floors.push({k,name:fnameKo(k),e:lvl(k),top:lvl(k+1)-sl(k+1)});
  const isDoor=(o,host,k)=>o.kind==='door'&&o.on===host&&o.f===k&&(+o.sill||0)<=15;
  for(let k=0;k<b.f;k++)B.roomsOf(k).forEach(r=>{const rp=r.rightPart;
    geo.rooms.push({key:r.key,f:k,left:r.left,right:r.right,name:(S.rooms&&S.rooms[r.key])||'',partX:rp?rp.x:null,doorRight:!!(rp&&S.ops.some(o=>isDoor(o,rp.id,k)))})});
  S.ops.forEach(o=>{if(o.f<0||o.f>=b.f||o.on==='back')return;
    if(o.kind==='door'&&(o.on==='L'||o.on==='R')&&o.f===g0&&(+o.sill||0)<=15)geo.exits.push({f:g0,x:o.on==='L'?b.t+12:b.w-b.t-12,side:o.on});
    if(o.kind==='window'){let x=null;if(o.on==='L')x=b.t+45;else if(o.on==='R')x=b.w-b.t-45;else{const p=S.parts.find(q=>q.id===o.on);if(p)x=p.x-p.t/2-40}
      if(x!=null)geo.windows.push({id:o.id,f:o.f,x})}});
  S.stairs.forEach(a=>{const g=B.stairGeo(a);if(!g)return;let xb,xt;const dir=a.dir>=0?1:-1;
    if(g.asset){const A=g.asset;if(a.type==='spiral'){xb=xt=A.x+A.w*.5}else{xb=dir>0?A.x+A.w*.12:A.x+A.w*.88;xt=dir>0?A.x+A.w*.88:A.x+A.w*.12}}
    else{xb=a.x;if(a.type==='U')xt=a.x;else if(g.land&&a.type!=='straight')xt=dir>0?g.land[1]:g.land[0];else xt=g.xt}
    geo.stairs.push({f:a.f,xb,xt})});
  S.items.forEach(i=>{const a=B.AM[i.assetId]||{},fv=a.views&&a.views.front;
    let f=0;geo.floors.forEach(fl=>{if(fl.e<=i.e+3)f=fl.k});
    geo.items.push({uid:i.uid,aid:i.assetId,x:i.x,e:i.e,w:i.w,h:i.h,f,name:a.nameKo||'가구',en:a.nameEn||'',cat:a.categoryId||'',sub:a.subcategoryId||'',tags:a.tags||[],sb:(fv&&fv.sourceBlock)||''})});
  return geo}
function drawDoc(doc){
  const keepS=B.S,keepSel=B.sel;
  try{
    B.S=norm(JSON.parse(JSON.stringify(doc)));B.sel=null;render();
    const S=B.S,ex=exportSvg(),b=S.b,top=EH()+(b.roof==='gable'?b.rh:b.roof==='flat'?30:0),dep=-lvl(0)+b.s;
    const x0=-110,y0=-(top+(S.title?110:60)),w=b.w+260,h=top+dep+(S.title?330:280);
    const geo=buildGeo(S,b);
    return {text:ex.text,x0,y0,w,h,geo}
  }finally{B.S=keepS;B.sel=keepSel;render()}}   // 편집기 문서 원상 복구

/* ---------- 위치·행동 문구 ---------- */
function floorOf(geo,f){return geo.floors[Math.max(0,Math.min(geo.floors.length-1,f|0))]}
function describe(c,p,snap,hname){
  if(p.mode==='out')return {loc:'집 밖',act:'외출 중',phrase:`${c.name}: ${p.say||'지금은 집에 없어요. 외출 중이에요'}`};
  if(!snap)return {loc:'배치되지 않음',act:'-',phrase:`${c.name}: 아직 집에 배치되지 않았어요.`};
  const geo=snap.geo,fl=floorOf(geo,p.f),x=p.x==null?geo.W/2:p.x,seg=snap.world.segAt(fl.k,x);
  let loc=`${hname} · ${fl.name}`+(seg&&seg.name!==fl.name?` · ${seg.name}`:'');
  let best=null,bd=1e9;geo.items.forEach(i=>{if(i.f!==fl.k)return;const d=Math.abs(x-i.x);if(d<=i.w/2+30&&d<bd){bd=d;best=i}});
  if(best)loc+=`, ${best.name} 근처`;
  return {loc,act:(G[p.action]||'휴식')+(p.verb==='moved'?' (직접 옮김)':''),phrase:p.say?`${c.name}: ${p.say}`:`${c.name}: 방금 도착했어요.`}}

/* ---------- 화면 뼈대 ---------- */
function build(){
  const sec=q('#viv');
  sec.innerHTML=`<div class="vv-wrap">
  <aside class="vv-side"><h3>캐릭터 <small id="vvCount"></small></h3><div id="vvChars"></div><button id="vvAdd" class="vv-primary">＋ 캐릭터 등록</button>
   <p class="vv-note"><b>저장 범위</b> 내 집의 캐릭터는 <b>이 브라우저(이 기기)에만</b> 저장돼요. 다른 기기에서는 보이지 않고, 사이트 데이터를 지우면 사라져요. 「집 공유하기」로 만든 공유 집의 캐릭터는 서버에 저장돼 초대 코드로 들어온 사람들과 함께 봐요. 도면 원본과는 따로 저장되며, 캐릭터를 올리거나 옮겨도 도면은 바뀌지 않아요.</p></aside>
  <section class="vv-main"><div class="vv-bar"><b id="vvHouse"></b><span class="vv-sp"></span><span id="vvClock" title="Asia/Seoul 기준"></span><button id="vvShare" title="초대 코드로 다른 사람과 이 집을 함께 쓰기">집 공유하기</button><button id="vvRefresh">도면 새로고침</button></div><div id="vvNote" class="vv-note2" hidden></div><div id="vvOuts" class="vv-outs" hidden></div>
   <div id="vvEmpty" class="vv-empty" hidden><h2>저장된 도면이 없어요</h2><p>비바리움은 「단면도 편집」 탭에서 만든 도면을 불러와 보여줘요.<br>먼저 단면도를 만들고 가구를 배치해 보세요. 편집 내용은 이 브라우저에 자동 저장되고, 「내 단면도」 목록에서 이름을 붙여 둘 수 있어요.</p><button id="vvGoEdit" class="vv-primary">단면도 편집으로 이동</button></div>
   <div id="vvCar" class="vv-car"><button class="vv-arrow" id="vvPrev" aria-label="이전 집">‹</button><div id="vvTrack" class="vv-track"></div><button class="vv-arrow" id="vvNext" aria-label="다음 집">›</button></div><div id="vvDots" class="vv-dots"></div></section>
  <aside class="vv-detail" id="vvDetail"></aside></div>`;
  const dlg=document.createElement('dialog');dlg.id='vvDlg';document.body.appendChild(dlg);
  q('#vvAdd').onclick=()=>openForm();
  q('#vvGoEdit').onclick=()=>go('edit');
  q('#vvRefresh').onclick=()=>enter(true);
  q('#vvShare').onclick=()=>openShare();
  q('#vvPrev').onclick=()=>scrollTo(activeIdx-1);q('#vvNext').onclick=()=>scrollTo(activeIdx+1);
  let st=0;q('#vvTrack').addEventListener('scroll',()=>{clearTimeout(st);st=setTimeout(()=>{const t=q('#vvTrack'),i=Math.round(t.scrollLeft/Math.max(1,t.clientWidth));if(i!==activeIdx)activate(i)},90)});
  window.addEventListener('resize',()=>{if(mode==='viv'){const t=q('#vvTrack');t.scrollLeft=activeIdx*t.clientWidth}});
  document.addEventListener('keydown',e=>{if(mode!=='viv'||e.target.closest('input,textarea,select,dialog'))return;if(e.key==='ArrowLeft'){scrollTo(activeIdx-1)}else if(e.key==='ArrowRight'){scrollTo(activeIdx+1)}});
}
function scrollTo(i){if(i<0||i>=houses.length)return;const t=q('#vvTrack');t.scrollTo({left:i*t.clientWidth,behavior:'smooth'})}

/* ---------- 탭 전환 ---------- */
function go(m){
  if(m==='viv'&&!booted){booted=true;build()}
  mode=m;document.body.classList.toggle('mode-viv',m==='viv');
  qa('.vnav button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  try{history.replaceState(null,'',m==='viv'?'#viv':location.pathname+location.search)}catch(e){}
  if(m==='viv')enter();else{clearInterval(clockT);clearInterval(simT);clearInterval(shareT);try{applyVP();render()}catch(e){}}
}
async function loadImages(){IMG={};for(const c of Viv.chars()){try{const u=await Viv.imageUrl(c.id);if(u)IMG[c.id]=u}catch(e){}}}
function tick(){const el=q('#vvClock');if(el)el.textContent='서울 '+Viv.seoul().text}
/* 편집기가 에셋 목록·저장 슬롯을 다 읽을 때까지 기다린다(비바리움 탭에서 새로고침했을 때 "저장된 도면 없음"으로 잘못 보이는 것을 막음) */
const whenReady=()=>new Promise(res=>{const t0=Date.now();(function chk(){if((B.ready&&Object.keys(B.AM).length)||Date.now()-t0>8000)res();else setTimeout(chk,80)})()});
async function enter(force){
  const my=++token;await whenReady();if(my!==token)return;tick();clearInterval(clockT);clockT=setInterval(tick,30000);
  if(shareOn()){await syncShared();if(my!==token)return}
  await loadImages();if(my!==token)return;
  const prev=houses[activeIdx]&&houses[activeIdx].id;
  houses=getHouses();
  const track=q('#vvTrack'),empty=!houses.length;
  q('#vvEmpty').hidden=!empty;q('#vvCar').hidden=empty;q('#vvDots').hidden=empty;q('#vvRefresh').hidden=empty;
  track.innerHTML='';qa('.vv-slide',track).forEach(s=>s._url&&URL.revokeObjectURL(s._url));
  houses.forEach((h,i)=>{const s=document.createElement('div');s.className='vv-slide';s.dataset.house=h.id;s.innerHTML=`<div class="vv-stagewrap"><div class="vv-wait">불러오는 중…</div></div>`;track.appendChild(s)});
  const want=(force&&prev)||Viv.getUi().house||prev;let i=Math.max(0,houses.findIndex(h=>h.id===want));
  activeIdx=i;renderDots();renderList();renderDetail();
  if(empty){q('#vvHouse').textContent='';return}
  await new Promise(r=>requestAnimationFrame(r));track.scrollLeft=i*track.clientWidth;
  await activate(i,true);
  clearInterval(simT);simT=setInterval(simTick,60000);
  clearInterval(shareT);   // 공유 집 변경 확인은 VivShare 가 15초마다(화면이 보일 때만) 가볍게 확인한다
}
function renderDots(){const d=q('#vvDots');d.innerHTML=houses.map((h,i)=>`<button class="${i===activeIdx?'on':''}" data-i="${i}" title="${esc(h.name)}"></button>`).join('');
  qa('button',d).forEach(b=>b.onclick=()=>scrollTo(+b.dataset.i));
  q('#vvPrev').disabled=activeIdx<=0;q('#vvNext').disabled=activeIdx>=houses.length-1;q('#vvPrev').hidden=q('#vvNext').hidden=houses.length<2;d.hidden=houses.length<2}
async function activate(i,silent){
  const my=token;activeIdx=i;const h=houses[i];if(!h)return;
  q('#vvHouse').textContent=`${h.name}${houses.length>1?`  (${i+1}/${houses.length})`:''}`;renderDots();Viv.setUi({house:h.id});
  const slide=qa('.vv-slide')[i];await ensureStage(slide,h);if(my!==token)return;
  if(selChar){const p=Viv.getPlace(selChar);if(p.house!==h.id&&!silent)selChar=null}
  runSim(i,false);   // 이 집을 열 때: 지금 서울 시각에 맞는 행동으로 한 번 갱신(오프라인 동안의 행동은 재생하지 않음)
  drawChars(slide);renderList();renderDetail();shareLabel()}
async function ensureStage(slide,h){
  if(slide._key===h.key&&slide._snap)return;
  const wrap=q('.vv-stagewrap',slide);
  try{
    await preload(h.doc);const snap=drawDoc(h.doc);snap.world=Sim.buildWorld(snap.geo);
    if(slide._url)URL.revokeObjectURL(slide._url);
    const url=URL.createObjectURL(new Blob([snap.text],{type:'image/svg+xml'}));slide._url=url;slide._snap=snap;slide._key=h.key;
    wrap.innerHTML=`<div class="vv-stage" style="--ar:${snap.w/snap.h};aspect-ratio:${snap.w}/${snap.h}"><img class="vv-bg" alt="${esc(h.name)} 단면도" src="${url}" draggable="false"><svg class="vv-ov" viewBox="${snap.x0} ${snap.y0} ${snap.w} ${snap.h}" xmlns="${NSV}"></svg></div>`;
    q('.vv-stage',slide).addEventListener('pointerdown',e=>{if(e.target.closest('.vv-ch'))return;if(selChar){selChar=null;drawChars(slide);renderList();renderDetail()}});
  }catch(e){wrap.innerHTML=`<div class="vv-wait">도면을 불러오지 못했어요 (${esc(e.message||e)})</div>`}}

/* ---------- 캐릭터 그리기·이동·크기·말풍선·걷기 ---------- */
const ANIM={},NODES={};let rafId=0;
const mkv=(n,a,par)=>{const e=document.createElementNS(NSV,n);Object.entries(a||{}).forEach(([k,v])=>e.setAttribute(k,v));par&&par.appendChild(e);return e};
const tw=(s,fs)=>[...s].reduce((a,ch)=>a+(ch.charCodeAt(0)>0x2e80?1:.58)*fs,0);
function wrapText(t,max){const out=[];let cur='';for(const w of String(t).split(' ')){if((cur+' '+w).trim().length>max&&cur){out.push(cur);cur=w}else cur=(cur+' '+w).trim()}if(cur)out.push(cur);
  if(out.length>1&&[...out[out.length-1]].length<=3){const l=out.pop();out[out.length-1]+=' '+l}return out.slice(0,3)}
function charBox(c,p,geo){const fl=floorOf(geo,p.f),ar=c.img?c.img.w/c.img.h:.6,h=p.h,w=h*ar,an=ANIM[c.id];
  const pose=an?'stand':(p.pose||'stand');let x=an?an.x:(p.x==null?geo.W/2:p.x),e=an?an.e:(p.e!=null?p.e:fl.e);
  if(!an){const half=(pose==='lie'?h:w)/2,lo=geo.in0+half,hi=geo.in1-half;x=lo<=hi?Math.min(Math.max(x,lo),hi):geo.W/2}
  return {x,w,h,e:e+(an?an.bob:0),f:fl.k,pose,vw:pose==='lie'?h:w,vh:pose==='lie'?w:h}}
function drawChars(slide){
  const snap=slide&&slide._snap;if(!snap)return;const ov=q('.vv-ov',slide);if(!ov)return;ov.innerHTML='';
  const hid=slide.dataset.house,geo=snap.geo,L1=mkv('g',{class:'vv-lc'},ov),L2=mkv('g',{class:'vv-lb2'},ov);Object.keys(NODES).forEach(k=>delete NODES[k]);
  const list=Viv.chars().filter(c=>{const p=Viv.getPlace(c.id);return p.house===hid&&(p.mode==='home'||ANIM[c.id])});
  list.sort((a,b)=>(a.id===selChar)-(b.id===selChar));
  list.forEach(c=>makeChar(c,Viv.getPlace(c.id),geo,ov,slide,L1,L2));
  if(slide===qa('.vv-slide')[activeIdx])renderOuts(slide)}
function renderOuts(slide){const el=q('#vvOuts');if(!el)return;const hid=slide.dataset.house;
  const outs=Viv.chars().filter(c=>{const p=Viv.getPlace(c.id);return p.house===hid&&p.mode==='out'&&!ANIM[c.id]});
  el.hidden=!outs.length;el.innerHTML=outs.map(c=>`<span><b>${esc(c.name)}</b> — ${esc(Viv.getPlace(c.id).say||'외출 중이에요')}</span>`).join('')}
function makeChar(c,p,geo,ov,slide,L1,L2){
  const g=mkv('g',{class:'vv-ch'+(selChar===c.id?' sel':''),'data-id':c.id},L1),rot=mkv('g',{},g);
  const img=IMG[c.id]?mkv('image',{href:IMG[c.id],preserveAspectRatio:'xMidYMid meet'},rot):null;
  const ph=img?null:mkv('rect',{rx:6,fill:'#ececea',stroke:'#1c1c1c','stroke-width':1.2},rot),ini=img?null:mkv('text',{'text-anchor':'middle','font-weight':'700',fill:'#444'},rot);if(ini)ini.textContent=[...c.name][0]||'?';
  const hit=mkv('rect',{fill:'transparent'},g),out=mkv('rect',{class:'vv-out',fill:'none','pointer-events':'none'},g),hd=mkv('circle',{class:'vv-handle'},g);
  const say=p.mode==='home'&&p.say?p.say:'',lines=say?wrapText(say,16):[];
  const bub=mkv('g',{class:'vv-bub'+(selChar===c.id?' sel':'')},L2),bTail=mkv('path',{},bub),bR=mkv('rect',{rx:4},bub),nm=mkv('text',{class:'nm'},bub),lt=lines.map(()=>mkv('text',{},bub));
  nm.textContent=c.name;lines.forEach((l,i)=>lt[i].textContent=l);
  const snap=slide._snap,ref={c,p:{...p},geo,lay};NODES[c.id]=ref;
  function lay(){const b=charBox(c,ref.p,geo),top=-b.e-b.h,fs=Math.max(9,geo.W/62),vx=b.x-b.vw/2,vt=-b.e-b.vh;
    if(b.pose==='lie')rot.setAttribute('transform',`translate(${b.h/2} ${-b.w/2}) rotate(-90 ${b.x} ${-b.e})`);else rot.removeAttribute('transform');
    if(img){img.setAttribute('x',b.x-b.w/2);img.setAttribute('y',top);img.setAttribute('width',b.w);img.setAttribute('height',b.h)}
    if(ph){ph.setAttribute('x',b.x-b.w/2);ph.setAttribute('y',top);ph.setAttribute('width',b.w);ph.setAttribute('height',b.h);ini.setAttribute('x',b.x);ini.setAttribute('y',top+b.h/2+b.h*.15);ini.setAttribute('font-size',b.h*.45)}
    for(const r of [hit,out]){r.setAttribute('x',vx);r.setAttribute('y',vt);r.setAttribute('width',b.vw);r.setAttribute('height',b.vh)}
    out.setAttribute('stroke-width',Math.max(1,geo.W/700));out.setAttribute('stroke-dasharray',`${geo.W/200} ${geo.W/300}`);
    hd.setAttribute('cx',vx+b.vw);hd.setAttribute('cy',vt);hd.setAttribute('r',Math.max(6,geo.W/130));hd.setAttribute('visibility',b.pose==='stand'&&!ANIM[c.id]&&canEdit(c)?'visible':'hidden');
    if(!say){bub.setAttribute('visibility','hidden');return b}
    bub.setAttribute('visibility','visible');
    const lh=fs*1.3,pad=fs*.55,w=Math.max(tw(c.name,fs),...lines.map(l=>tw(l,fs)))+pad*2,h=lh*(1+lines.length)+pad*1.1,tail=fs*.75;
    const bx=Math.min(Math.max(b.x-w/2,geo.in0-30),geo.in1+30-w),by=vt-tail-h-2,tx=Math.min(Math.max(b.x,bx+pad+fs*.4),bx+w-pad-fs*.4);
    bR.setAttribute('x',bx);bR.setAttribute('y',by);bR.setAttribute('width',w);bR.setAttribute('height',h);
    bTail.setAttribute('d',`M${tx-fs*.4} ${by+h-.5}L${b.x} ${by+h+tail}L${tx+fs*.4} ${by+h-.5}`);
    nm.setAttribute('font-size',fs);nm.setAttribute('x',bx+pad);nm.setAttribute('y',by+pad*.55+lh*.85);
    lt.forEach((t,i)=>{t.setAttribute('font-size',fs);t.setAttribute('x',bx+pad);t.setAttribute('y',by+pad*.55+lh*(1.85+i))});
    return b}
  lay();
  const pt=ov.createSVGPoint();const toS=ev=>{pt.x=ev.clientX;pt.y=ev.clientY;return pt.matrixTransform(ov.getScreenCTM().inverse())};
  const floorAt=y=>{let bk=0,bd=1e9;geo.floors.forEach(f=>{const d=Math.abs(-f.e-y);if(d<bd){bd=d;bk=f.k}});return bk};
  let drag=null;
  const end=ev=>{if(!drag)return;const d=drag;drag=null;try{g.releasePointerCapture(ev.pointerId)}catch(e){}
    if(d.moved){
      if(d.t==='size')Viv.setPlace(c.id,{h:Math.round(ref.p.h*10)/10});
      else{const seg=snap&&snap.world.segAt(ref.p.f,ref.p.x);   // 직접 옮기면 그 자리에서 잠시 쉬는 것으로 처리하고, 20분 뒤 다시 자율 행동
        Viv.setPlace(c.id,{x:Math.round(ref.p.x),f:ref.p.f,h:Math.round(ref.p.h*10)/10,pose:'stand',dy:0,e:null,tgt:null,verb:'moved',action:'wander',partner:null,say:`${seg?seg.name:'이곳'}에서 자리를 옮겨 잠시 쉬는 중`});
        Viv.setSim(c.id,{decideAt:Date.now()+20*60000,then:null})}
      drawChars(slide);renderDetail();renderList()}};
  g.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();const s=toS(ev),b=charBox(c,ref.p,geo);
    if(selChar!==c.id){selChar=c.id;qa('.vv-ch.sel',ov).forEach(n=>n.classList.remove('sel'));g.classList.add('sel');bub.classList.add('sel');renderList();renderDetail()}
    if(!canEdit(c))return;   // 남의 캐릭터는 선택해서 볼 수만 있음
    drag={t:ev.target===hd?'size':'move',dx:s.x-b.x,dy:s.y-(-b.e),moved:false};try{g.setPointerCapture(ev.pointerId)}catch(e){}});
  g.addEventListener('pointermove',ev=>{if(!drag)return;const s=toS(ev);drag.moved=true;
    if(drag.t==='size'){const b=charBox(c,ref.p,geo);ref.p.h=Math.min(HMAX,Math.max(HMIN,(-b.e)-s.y))}   // 머리 높이 = 바닥 y − 포인터 y (가로세로 비율은 이미지 비율로 고정)
    else{ref.p.x=s.x-drag.dx;ref.p.f=floorAt(s.y-drag.dy);ref.p.pose='stand';ref.p.e=null}
    lay()});
  g.addEventListener('pointerup',end);g.addEventListener('pointercancel',end);
  return g}
/* 걷기 애니메이션 — 상태는 이미 최종 위치로 저장돼 있고, 화면에서만 이전 위치에서 경로를 따라 걸어간다(계단은 높이도 함께 변함) */
function walk(slide,mv){
  const a=ANIM[mv.id],from=a?{x:a.x,e:a.e,f:a.f}:mv.from,pts=[from,...(mv.route||[])],segs=[];let tot=0;
  for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i].x-pts[i-1].x,(pts[i].e-pts[i-1].e)*.6);segs.push(d);tot+=d}
  if(tot<6||REDUCE){delete ANIM[mv.id];return}
  ANIM[mv.id]={pts,segs,tot,speed:Math.max(160,tot/7),t0:performance.now(),x:from.x,e:from.e,f:from.f,bob:0,slide};
  if(!rafId)rafId=requestAnimationFrame(loop)}
function loop(now){rafId=0;
  for(const id of Object.keys(ANIM)){const a=ANIM[id],dist=(now-a.t0)/1000*a.speed;
    if(dist>=a.tot){delete ANIM[id];if(a.slide&&a.slide.isConnected)drawChars(a.slide);continue}
    let d=dist,i=0;while(i<a.segs.length-1&&d>a.segs[i]){d-=a.segs[i];i++}
    const p0=a.pts[i],p1=a.pts[i+1],u=a.segs[i]?Math.min(1,d/a.segs[i]):1;
    a.x=p0.x+(p1.x-p0.x)*u;a.e=p0.e+(p1.e-p0.e)*u;a.f=u<.5?p0.f:p1.f;a.bob=Math.abs(Math.sin(dist/22))*2.5;
    const n=NODES[id];if(n)n.lay()}
  if(Object.keys(ANIM).length)rafId=requestAnimationFrame(loop)}

/* ---------- 생활 시뮬레이션 연결 ---------- */
const toSimChar=c=>({id:c.id,name:c.name,profile:c.profile||''});
const inHouse=hid=>Viv.chars().filter(c=>Viv.getPlace(c.id).house===hid);
function simCtx(h,snap){const all=inHouse(h.id).map(toSimChar);
  return {now:Date.now(),world:snap.world,houseId:h.id,chars:all,getPlace:Viv.getPlace,setPlace:Viv.setPlace,getSim:Viv.getSim,setSim:Viv.setSim,analysis:c=>Sim.analyze(c.profile,c.name,all)}}
/* 현재 서울 시각 기준으로 "지금 해야 할 행동"만 갱신. 이전 행동을 재생하지 않는다. */
/* 공유 집: 같은 캐릭터의 행동을 여러 브라우저가 따로 결정해 저장하지 않도록, 서버가 정한 '리더' 한 곳만 결정한다.
   나머지 브라우저는 서버에 저장된 캐릭터 상태를 그대로 보여 준다(사용자가 고른 바람은 리더가 곧 반영). */
function runSim(i,animate){
  const h=houses[i];if(h&&h.shared){
    if(SH().isLeader(h.shared.hid))return runSimNow(i,animate);
    stepShared(i,animate);return false}
  return runSimNow(i,animate)}
const leaseAt={};
async function stepShared(i,animate){
  const h=houses[i];if(!h||!h.shared||!shareOn())return false;
  const hid=h.shared.hid;let ok=false;
  if(SH().isLeader(hid)&&Date.now()-(leaseAt[hid]||0)<45000)ok=true;   // 리더 임대(120초)는 45초마다만 갱신 — 변경 알림마다 서버를 부르지 않는다
  else{try{ok=await SH().lease(hid)}catch(e){}if(ok)leaseAt[hid]=Date.now()}
  if(!ok||houses[i]!==h||mode!=='viv')return false;
  if(runSimNow(i,animate)){renderList();softDetail();return true}return false}
function runSimNow(i,animate){
  const h=houses[i],slide=qa('.vv-slide')[i];if(!h||!slide||!slide._snap||!slide._snap.world)return false;
  let moves;try{const go=()=>Sim.stepHouse(simCtx(h,slide._snap));moves=h.shared?SH().auto(go):go()}catch(e){console.error('[viv sim]',e);return false}
  if(!moves.length)return false;
  if(animate&&!REDUCE){drawChars(slide);moves.forEach(m=>walk(slide,m))}
  drawChars(slide);return true}
function simTick(){if(mode!=='viv'||document.hidden||!houses.length)return;tick();
  if(houses[activeIdx]&&houses[activeIdx].shared){stepShared(activeIdx,true).then(ok=>{if(!ok)renderDetailTimes()});return}
  if(runSim(activeIdx,true)){renderList();softDetail()}else{renderDetailTimes()}}

/* ---------- 목록·상세 패널 ---------- */
function houseOf(id){return houses.find(h=>h.id===id)||null}
function snapOf(hid){const i=houses.findIndex(h=>h.id===hid);if(i<0)return null;const s=qa('.vv-slide')[i];return s&&s._snap?s._snap:null}
function geoOf(hid){const s=snapOf(hid);return s?s.geo:null}
function visibleChars(){const sh=curShare();return Viv.chars().filter(c=>!c.remote||(sh&&c.hid===sh.hid))}
function addState(){   // 캐릭터 등록 버튼 상태(공유 집이면 서버의 인원 규칙)
  const sh=curShare();if(!sh){const n=Viv.localChars().length;return {n,max:Viv.MAX_CHARS,ok:n<Viv.MAX_CHARS}}
  const i=SH().info(sh.hid),cs=Viv.chars().filter(c=>c.remote&&c.hid===sh.hid),mine=cs.filter(c=>c.mine).length;
  const max=i?i.limits.chars:8,per=i?i.limits.perMember:4;
  return {n:cs.length,max,ok:cs.length<max&&(sh.role==='owner'||mine<per),why:cs.length>=max?`이 집에는 캐릭터를 ${max}명까지 둘 수 있어요`:`한 사람이 ${per}명까지 등록할 수 있어요`}}
function renderList(){
  const cs=visibleChars(),as=addState();q('#vvCount').textContent=`${as.n}/${as.max}`;q('#vvAdd').disabled=!as.ok;q('#vvAdd').title=as.ok?'':(as.why||'');
  q('#vvChars').innerHTML=cs.length?cs.map(c=>{const p=Viv.getPlace(c.id),h=houseOf(p.house);
    const st=p.mode==='out'?'외출 중':(h?`${esc(h.name)} · ${esc(G[p.action]||'')}`:'미배치');
    return `<button class="vv-chip${selChar===c.id?' on':''}" data-id="${c.id}">${IMG[c.id]?`<img src="${IMG[c.id]}" alt="">`:`<span class="vv-ini">${esc([...c.name][0]||'?')}</span>`}<span><b>${esc(c.name)}</b><small>${st}</small></span></button>`}).join(''):`<p class="hint">아직 등록한 캐릭터가 없어요.</p>`;
  qa('.vv-chip').forEach(b=>b.onclick=()=>selectChar(b.dataset.id))}
function selectChar(id){selChar=id;const p=Viv.getPlace(id),i=houses.findIndex(h=>h.id===p.house);
  if(i>=0&&i!==activeIdx&&p.mode==='home'){scrollTo(i)}else{const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();renderDetail()}}
const nextText=st=>{const m=st&&st.decideAt>Date.now()?Math.max(1,Math.round((st.decideAt-Date.now())/60000)):0;return m?`약 ${m>=90?Math.round(m/60)+'시간':m+'분'} 뒤에 다음 행동을 정해요`:'곧 다음 행동을 정해요'};
function renderDetailTimes(){const e=q('#vvNext');if(e&&selChar)e.textContent=nextText(Viv.getSim(selChar))}
/* 입력 중이면 패널 전체를 다시 그리지 않고 문구만 갱신(입력 포커스 유지) */
function softDetail(){const el=q('#vvDetail'),a=document.activeElement;
  if(el&&a&&el.contains(a)&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)){const c=selChar&&Viv.char(selChar);if(c){const p=Viv.getPlace(c.id),h=houseOf(p.house),d=describe(c,p,h?snapOf(h.id):null,h?h.name:''),ph=q('.vv-phrase',el);if(ph)ph.textContent=d.phrase}return}
  renderDetail()}
function renderDetail(){
  const el=q('#vvDetail'),c=selChar&&Viv.char(selChar);
  if(!c){el.innerHTML=`<h3>상세</h3><p class="hint">캐릭터를 선택하면 이름, 프로필, 현재 위치와 행동을 볼 수 있어요.<br><br>도면 위의 캐릭터는 끌어서 옮기고, 오른쪽 위 동그라미를 끌면 비율을 유지한 채 크기가 바뀌어요. 직접 옮기면 20분 동안 그 자리에서 쉬다가 다시 스스로 움직여요.</p>`;return}
  const p=Viv.getPlace(c.id),h=houseOf(p.house),snap=h?snapOf(h.id):null,d=describe(c,p,snap,h?h.name:'');
  const placed=!!h,out=p.mode==='out',A=Sim.analyze(c.profile,c.name,inHouse(p.house).map(toSimChar)),st=Viv.getSim(c.id);
  const ro=!canEdit(c),isRem=!!c.remote,owner=isRem?((SH().info(c.hid)||{members:[]}).members.find(m=>m.pid===c.owner)||{}).nick:'';
  const hopts=(isRem?'':`<option value="">미배치</option>`)+houses.filter(x=>isRem?x.id===p.house:!x.shared).map(x=>`<option value="${esc(x.id)}" ${x.id===p.house?'selected':''}>${esc(x.name)}</option>`).join('');
  let wishHtml='<p class="hint">집에 배치하면 행동 방향을 고를 수 있어요.</p>';
  if(ro)wishHtml='<p class="hint">다른 참여자의 캐릭터예요. 볼 수만 있고, 행동 방향 선택·이동·수정은 등록한 사람과 집 주인만 할 수 있어요.</p>';
  else if(placed&&out)wishHtml='<p class="hint">외출 중에는 행동 방향을 고를 수 없어요. 돌아오면 다시 고를 수 있어요.</p>';
  else if(placed&&snap){const opts=Sim.wishOptions(simCtx(h,snap),toSimChar(c));
    wishHtml=`<div class="vv-wishes">${opts.map(o=>`<button data-w="${o.id}" ${o.ok?'':'disabled'} title="${esc(o.ok?'':o.why)}">${esc(o.label)}</button>`).join('')}</div><div id="vvWmsg" class="vv-wmsg"></div>`+opts.filter(o=>!o.ok).map(o=>`<div class="vv-why">· ${esc(o.label)}: ${esc(o.why)}</div>`).join('')}
  const facts=A.factList.map(f=>`<span class="vv-tag fact">${esc(f.label)}: ${esc(f.text)}</span>`).join('')||'<span class="hint">명시된 사실이 없어요</span>';
  const traits=A.traitList.map(t=>`<span class="vv-tag${t.v<0?' neg':''}" title="찾은 단어: ${esc(t.words.join(', '))}">${esc(t.label)} <small>${esc(t.words.slice(0,2).join('·'))}</small></span>`).join('')||'<span class="hint">읽어 낼 단서가 없어 기본 생활 규칙으로 움직여요</span>';
  el.innerHTML=`<h3>${esc(c.name)}</h3>
  <div class="vv-pic">${IMG[c.id]?`<img src="${IMG[c.id]}" alt="${esc(c.name)}">`:'<span>이미지 없음</span>'}</div>
  <p class="vv-phrase">${esc(d.phrase)}</p>
  <dl><dt>현재 위치</dt><dd>${esc(d.loc)}</dd><dt>현재 행동</dt><dd>${esc(d.act)}</dd><dt>다음 행동</dt><dd id="vvNext">${placed?esc(nextText(st)):'-'}</dd>${isRem?`<dt>등록한 사람</dt><dd>${esc(owner||'참여자')}${c.mine?' (나)':''}</dd>`:''}<dt>프로필</dt><dd class="vv-prof">${c.profile?esc(c.profile):'<span class="hint">프로필이 비어 있어요</span>'}</dd></dl>
  <h4>행동 방향 선택</h4>${wishHtml}
  <p class="hint">고르면 가능한 조건(가구·길·서울 시각)을 확인해 바로 반영하고, 이후 한동안 그 방향이 조금 더 자주 나와요. 고르지 않아도 자율 행동은 계속돼요.</p>
  <h4>프로필 해석 <small>키워드 규칙 · AI 아님</small></h4>
  <div class="hint">프로필에 적힌 사실</div><div class="vv-an">${facts}</div>
  <div class="hint">규칙 추정 (행동 확률만 조정)</div><div class="vv-an">${traits}</div>
  <h4>배치</h4>
  <label>집 <select id="vdHouse" ${ro||isRem?'disabled':''}>${hopts}</select></label>
  <label>크기(높이 cm) <span class="row"><input type="range" id="vdSz" min="${HMIN}" max="${HMAX}" value="${Math.round(p.h)}" ${placed&&!out&&!ro?'':'disabled'}><input type="number" id="vdSzN" min="${HMIN}" max="${HMAX}" value="${Math.round(p.h)}" ${placed&&!out&&!ro?'':'disabled'}></span></label>
  <div class="vv-btns"><button id="vdEdit" ${ro?'disabled':''}>프로필 수정</button><button id="vdDel" class="vv-danger" ${ro?'disabled':''}>삭제</button></div>`;
  q('#vdEdit').onclick=()=>openForm(c.id);
  q('#vdDel').onclick=async()=>{if(!confirm(c.remote?`'${c.name}' 캐릭터를 삭제할까요? 서버에서 이미지와 프로필이 지워져요.`:`'${c.name}' 캐릭터를 삭제할까요? 이미지와 프로필이 이 브라우저에서 지워져요.`))return;
    try{if(c.remote)await SH().removeChar(c.id);else await Viv.removeChar(c.id)}catch(e){note(e.message,'warn');return}selChar=null;delete IMG[c.id];const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();renderDetail()};
  q('#vdHouse').onchange=e=>{const v=e.target.value;
    if(!v)Viv.setPlace(c.id,{house:null,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null});
    else{Viv.setPlace(c.id,{house:v,x:null,f:0,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null});Viv.setSim(c.id,{decideAt:0,then:null,outUntil:0})}
    refreshStage(v)};
  qa('.vv-wishes button',el).forEach(b=>b.onclick=()=>{
    const r=Sim.setWish(simCtx(h,snap),toSimChar(c),b.dataset.w);
    if(!r.ok){const m=q('#vvWmsg');m.textContent=r.why;m.className='vv-wmsg err';return}
    runSim(activeIdx,true);renderList();renderDetail();const m=q('#vvWmsg');if(m){m.textContent='선택을 반영했어요 — 이후 행동에도 조금 영향을 줘요'}});
  const apply=v=>{v=Math.min(HMAX,Math.max(HMIN,+v||HMIN));Viv.setPlace(c.id,{h:v});q('#vdSz').value=v;q('#vdSzN').value=v;const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);q('.vv-phrase',el).textContent=describe(c,Viv.getPlace(c.id),snapOf(p.house),h?h.name:'').phrase};
  const sz=q('#vdSz'),szn=q('#vdSzN');if(sz){sz.oninput=e=>apply(e.target.value);szn.onchange=e=>apply(e.target.value)}}
function refreshStage(hid){const i=houses.findIndex(h=>h.id===hid);if(i>=0&&i!==activeIdx){scrollTo(i);return}
  if(i>=0)runSim(i,false);const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();renderDetail()}

/* ---------- 등록·수정 대화상자 ---------- */
function openForm(id){
  const dlg=q('#vvDlg'),c=id?Viv.char(id):null;let prep=null;
  const sh=c&&c.remote?{hid:c.hid}:(!c?curShare():null),imgOpt=sh?{bytes:1100*1024}:undefined;   // 공유 집에는 서버 한도에 맞춰 이미지를 조금 더 작게 저장
  dlg.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>${c?'캐릭터 프로필 수정':'캐릭터 등록'}</h3>
  <label>이름 <input id="vfName" maxlength="${Viv.NAME_MAX}" value="${esc(c?c.name:'')}" placeholder="예) 보리"></label>
  <label>이미지 (PNG·JPEG·WebP·GIF, 5MB 이하) <input type="file" id="vfFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
  <div class="vv-prev"><div class="vv-chk">${c&&IMG[c.id]?`<img id="vfPrev" src="${IMG[c.id]}" alt="">`:'<img id="vfPrev" alt="" hidden>'}</div><div id="vfInfo" class="hint">${c&&c.img?`현재 이미지: ${c.img.w}×${c.img.h} · ${c.img.alpha?'투명 배경 있음':'투명 배경 없음'}`:'이미지를 고르면 미리보기가 나와요 (선택 사항)'}</div></div>
  ${sh?'<p class="hint"><b>공유 집 캐릭터</b>예요. 이름·프로필·이미지는 서버에 저장돼 이 집의 참여자 모두가 볼 수 있고, 수정·삭제는 나와 집 주인만 할 수 있어요.</p>':''}<label>프로필 — 성격, 생활 습관 등을 자유롭게 적어 주세요 <textarea id="vfProf" rows="7" maxlength="${Viv.PROFILE_MAX}" placeholder="예) 밤늦게까지 깨어 있는 올빼미형. 아침엔 커피부터 마시고, 비 오는 날엔 창가에서 책 읽는 걸 좋아해요.">${esc(c?c.profile:'')}</textarea></label>
  <div class="hint" id="vfCnt"></div><div class="vv-err" id="vfErr" role="alert"></div>
  <div class="vv-btns"><button type="button" id="vfCancel">취소</button><button type="button" id="vfSave" class="vv-primary">저장</button></div></form>`;
  const err=m=>{q('#vfErr',dlg).textContent=m||''},cnt=()=>{q('#vfCnt',dlg).textContent=`${q('#vfProf',dlg).value.length}/${Viv.PROFILE_MAX}자`};cnt();
  q('#vfProf',dlg).oninput=cnt;
  q('#vfFile',dlg).onchange=async e=>{err('');prep=null;const f=e.target.files[0];if(!f){return}
    q('#vfInfo',dlg).textContent='이미지를 확인하는 중…';
    try{prep=await Viv.prepareImage(f,imgOpt);const im=q('#vfPrev',dlg);if(im.dataset.u)URL.revokeObjectURL(im.dataset.u);im.dataset.u=im.src=URL.createObjectURL(prep.blob);im.hidden=false;
      q('#vfInfo',dlg).innerHTML=`${prep.srcType} · 원본 ${prep.srcW}×${prep.srcH} (${(prep.srcBytes/1048576).toFixed(2)}MB)<br>저장 크기 ${prep.w}×${prep.h} (${Math.round(prep.blob.size/1024)}KB) · <b>${prep.alpha?'투명 배경이 있어요(그대로 유지)':'투명 배경 없음'}</b>${prep.srcType==='GIF'?'<br>GIF 는 첫 장면만 사용해요':''}<br>원본 비율은 그대로 유지돼요`}
    catch(ex){e.target.value='';prep=null;q('#vfInfo',dlg).textContent='';err(ex.message)}};
  q('#vfCancel',dlg).onclick=()=>dlg.close();
  q('#vfSave',dlg).onclick=async()=>{err('');const btn=q('#vfSave',dlg);btn.disabled=true;
    try{const d={name:q('#vfName',dlg).value,profile:q('#vfProf',dlg).value};let ch;
      if(c&&c.remote){const v=Viv.validate?Viv.validate(d):d;await SH().updateChar(c.id,v,prep);ch=Viv.char(c.id)||c}
      else if(!c&&sh){const nm=d.name.trim();if(!nm)throw new Error('캐릭터 이름을 입력하세요');if(nm.length>Viv.NAME_MAX)throw new Error(`이름은 ${Viv.NAME_MAX}자 이하로 입력하세요`);if(d.profile.length>Viv.PROFILE_MAX)throw new Error(`프로필은 ${Viv.PROFILE_MAX}자 이하로 입력하세요`);
        const nid=await SH().createChar(sh.hid,{name:nm,profile:d.profile,place:{f:0,x:null,mode:'home'},sim:{decideAt:0}},prep);ch=Viv.char(nid);if(!ch)throw new Error('등록은 됐지만 목록을 새로 받지 못했어요. 새로고침해 주세요')}
      else ch=await Viv.saveChar(d,prep,c?c.id:null);
      if(prep){delete IMG[ch.id];const u=await Viv.imageUrl(ch.id);if(u)IMG[ch.id]=u}
      if(!c&&sh){const h=houses[activeIdx];Viv.setPlace(ch.id,{house:h.id,x:null,f:0,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null});Viv.setSim(ch.id,{decideAt:0});runSim(activeIdx,false)}
      else if(!c){const h=houses[activeIdx];if(h){Viv.setPlace(ch.id,{house:h.id,x:null,f:0,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null});Viv.setSim(ch.id,{decideAt:0});runSim(activeIdx,false)}}
      selChar=ch.id;dlg.close();const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();renderDetail();
    }catch(ex){err(ex.message||String(ex))}finally{btn.disabled=false}};
  dlg.showModal()}

/* ---------- 집 공유 (초대 코드) ---------- */
const fmtDate=t=>{try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(t))}catch(e){return ''}};
async function copyText(t,btn){try{await navigator.clipboard.writeText(t)}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e2){}ta.remove()}
  if(btn){const o=btn.textContent;btn.textContent='복사했어요';setTimeout(()=>btn.textContent=o,1400)}}
/* 서버와 맞추기 + 내 단면도 변경분 올리기(집 주인) + 안내 문구 */
async function syncShared(){
  const S=SH();let msgs=[];
  const r=await S.syncAll();
  S.takeLost().forEach(l=>msgs.push(`'${l.name}' 집에 더는 들어갈 수 없어요 (${l.why||'내보내졌거나 집이 삭제됐어요'})`));
  r.errors.forEach(e=>msgs.push(`'${e.name}' 집을 불러오지 못했어요: ${e.msg}`));
  note(msgs.join(' / '),msgs.length?'warn':'')}
let shT=0;
function onShareChange(){clearTimeout(shT);shT=setTimeout(async()=>{
  if(mode!=='viv'||!booted)return;
  const nh=getHouses();const same=nh.length===houses.length&&nh.every((h,i)=>h.key===houses[i].key&&h.id===houses[i].id);
  if(!same){enter(true);return}
  await loadImages();const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();softDetail();shareLabel();
  const h=houses[activeIdx];if(h&&h.shared&&!document.hidden){const i=SH().info(h.shared.hid);if(i&&(!i.leaderPid||i.leaderPid===i.me.pid))stepShared(activeIdx,true)}},150)}
function shareLabel(){const b=q('#vvShare');if(!b)return;
  if(!shareOn()){b.hidden=false;b.textContent='집 공유하기';return}
  const sh=curShare();if(!sh){b.textContent='집 공유하기';return}
  const i=SH().info(sh.hid);b.textContent=`공유 중 · ${i?i.members.length:'?'}명 · ${sh.role==='owner'?'관리':'정보'}`}

const dlgOf=()=>q('#vvDlg');
const errBox=d=>q('.vv-err',d);
const waitMsg=e=>e.status===429?`${e.message}${e.retryAfter?` (약 ${Math.max(1,Math.ceil(e.retryAfter/60))}분 뒤 다시 시도)`:''}`:e.message;
function notReady(){const d=dlgOf();d.innerHTML=`<form class="vv-form" method="dialog"><h3>공유 서버가 아직 연결되지 않았어요</h3><p class="hint">초대 코드로 집을 함께 쓰려면 공유 서버가 필요해요. 사이트 주소 설정(config.js 의 <code>VIV_API</code>)에 서버 주소를 넣으면 이 기능이 켜져요. 설정 방법은 README 의 「집 공유 서버」를 보세요.<br><br>서버가 없어도 지금처럼 이 브라우저에서 혼자 쓰는 기능은 그대로 동작해요.</p><div class="vv-btns"><button class="vv-primary">확인</button></div></form>`;d.showModal()}

/* 입장하기: 초대 코드 → 서버 검증 → 참여 */
function openJoin(){
  if(!shareOn())return notReady();
  const d=dlgOf();
  d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>입장하기</h3>
   <p class="hint">집 주인에게 받은 6자리 초대 코드를 입력하세요. 공개된 집 목록은 없어서 코드를 아는 사람만 들어올 수 있어요.</p>
   <label>초대 코드 <input id="vjCode" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="예) K7M2QX" style="text-transform:uppercase;letter-spacing:.25em;font-size:1.3em;text-align:center"></label>
   <label>내 별명 (선택) <input id="vjNick" maxlength="20" placeholder="예) 보리 친구"></label>
   <div class="vv-err" id="vjErr" role="alert"></div>
   <details class="vv-rec"><summary>다른 기기·브라우저에서 쓰던 집을 이어서 쓰려면 (복구 키)</summary>
    <p class="hint">공유 집의 「정보」창에서 복사한 복구 키를 붙여 넣으면, 같은 참여자로 다시 들어와 내 캐릭터를 이어서 관리할 수 있어요.</p>
    <input id="vjKey" placeholder="복구 키 붙여넣기" autocomplete="off"><button type="button" id="vjKeyGo">복구 키로 입장</button></details>
   <div class="vv-btns"><button type="button" id="vjCancel">취소</button><button type="button" id="vjGo" class="vv-primary">입장</button></div></form>`;
  const err=m=>{q('#vjErr',d).textContent=m||''},done=async r=>{d.close();await go('viv');await enter(true);const i=houses.findIndex(h=>h.shared&&h.shared.hid===r.hid);if(i>=0)scrollTo(i);
    note(r.rejoined?`이미 들어와 있는 집이에요: ${r.name}`:`'${r.name}' 집에 입장했어요`,'ok')};
  q('#vjCancel',d).onclick=()=>d.close();
  const go1=async()=>{err('');const code=q('#vjCode',d).value.trim();if(!code){err('초대 코드를 입력하세요');return}
    const b=q('#vjGo',d);b.disabled=true;try{done(await SH().join(code,q('#vjNick',d).value.trim()))}catch(e){err(waitMsg(e))}finally{b.disabled=false}};
  q('#vjGo',d).onclick=go1;q('#vjCode',d).addEventListener('keydown',e=>{if(e.key==='Enter')go1()});
  q('#vjKeyGo',d).onclick=async()=>{err('');try{done(await SH().joinRecovery(q('#vjKey',d).value))}catch(e){err(waitMsg(e))}};
  d.showModal();setTimeout(()=>q('#vjCode',d).focus(),30)}

/* 집 공유하기: 내 단면도를 서버에 올려 공유 집으로 만들고 초대 코드를 발급 */
function openShare(){
  if(!shareOn())return notReady();
  const h=houses[activeIdx];if(!h){return}
  if(h.shared)return openManage(h.shared.hid);
  const mine=Viv.localChars().filter(c=>Viv.getPlace(c.id).house===h.id),slotId=String(h.id).replace('slot:','');
  const d=dlgOf();
  d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>이 집을 공유하기</h3>
   <p class="hint">「${esc(h.name)}」 도면을 서버에 올려 공유 집을 만들고, 6자리 초대 코드를 발급해요. 코드를 가진 사람만 들어올 수 있고, 참여자는 누구나 편집기에서 도면을 고치고 <b>저장</b>할 수 있어요(저장한 버전만 공유돼요). 각자 자기 캐릭터를 등록·관리해요.</p>
   <label>집 이름 <input id="vsName" maxlength="40" value="${esc(h.name)}"></label>
   <label>내 별명 <input id="vsNick" maxlength="20" value="집주인"></label>
   ${mine.length?`<label class="chk"><input type="checkbox" id="vsMove" checked> 이 집에 있는 내 캐릭터 ${mine.length}명을 공유 집으로 옮기기 <small>(이 브라우저에서는 지워지고 서버로 옮겨져요)</small></label>`:''}
   <div class="vv-err" id="vsErr" role="alert"></div>
   <div class="vv-btns"><button type="button" id="vsCancel">취소</button><button type="button" id="vsGo" class="vv-primary">공유 시작</button></div></form>`;
  q('#vsCancel',d).onclick=()=>d.close();
  q('#vsGo',d).onclick=async()=>{const err=m=>q('#vsErr',d).textContent=m||'';err('');const b=q('#vsGo',d);b.disabled=true;b.textContent='만드는 중…';
    try{const name=q('#vsName',d).value.trim();if(!name){err('집 이름을 입력하세요');return}
      const r=await SH().createHouse({name,doc:h.doc,nick:q('#vsNick',d).value.trim()||'집주인',slot:slotId,savedHash:window.VivCollab?VivCollab.hashOf(h.doc):null});
      let moved=0,failed=[];
      if(mine.length&&q('#vsMove',d)&&q('#vsMove',d).checked){
        for(const c of mine){try{const p=Viv.getPlace(c.id);let prep=null;
          if(c.img){const blob=await Viv.imageBlob(c.id);if(blob){prep=blob.size>1100*1024?await Viv.prepareImage(blob,{bytes:1100*1024}):{blob,w:c.img.w,h:c.img.h,alpha:!!c.img.alpha}}}
          await SH().createChar(r.hid,{name:c.name,profile:c.profile||'',place:{x:p.x,f:p.f,h:p.h,mode:'home'},sim:{decideAt:0}},prep);
          await Viv.removeChar(c.id);delete IMG[c.id];moved++}catch(e){failed.push(`${c.name}: ${e.message}`)}}}
      await showCode(r.hid,r.code,moved,failed)}
    catch(e){err(waitMsg(e));b.disabled=false;b.textContent='공유 시작'}};
  d.showModal()}
async function showCode(hid,code,moved,failed){
  const d=dlgOf();
  d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>공유 집이 만들어졌어요</h3>
   <p class="hint">아래 초대 코드를 함께 쓸 사람에게 알려 주세요. 메인 화면의 「입장하기」에 코드를 입력하면 들어와요.${moved?`<br>내 캐릭터 ${moved}명을 옮겼어요.`:''}</p>
   <div class="vv-code">${esc(code)}</div>
   ${failed&&failed.length?`<div class="vv-err">옮기지 못한 캐릭터는 이 브라우저에 그대로 있어요:<br>${failed.map(esc).join('<br>')}</div>`:''}
   <p class="hint">코드는 30일 동안 유효하고, 「공유 정보」에서 언제든 폐기하거나 새로 발급할 수 있어요. 서버에는 코드 자체가 아니라 변환값만 저장돼서, 이 브라우저를 지우면 코드는 다시 볼 수 없어요(새로 발급하면 돼요).</p>
   <div class="vv-btns"><button type="button" id="scCopy">코드 복사</button><button type="button" id="scOk" class="vv-primary">확인</button></div></form>`;
  q('#scCopy',d).onclick=e=>copyText(code,e.target);q('#scOk',d).onclick=()=>d.close();
  if(!d.open)d.showModal();
  await enter(true);const i=houses.findIndex(x=>x.shared&&x.shared.hid===hid);if(i>=0)scrollTo(i)}

/* 공유 집 정보·관리 */
async function openManage(hid){
  const d=dlgOf();try{await SH().refresh(hid,true)}catch(e){}
  const render=()=>{
    const i=SH().info(hid);if(!i){d.close();return}
    const owner=i.me.role==='owner',inv=i.invite||{status:'none'};
    const stTxt={active:'사용할 수 있어요',revoked:'폐기됨',expired:'기간이 지났어요',none:'발급된 코드가 없어요'}[inv.status]||'';
    const showCodeNow=owner&&inv.status==='active'&&i.code;
    d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>공유 집 · ${esc(i.name)}</h3>
     <div class="vv-err" id="vmErr" role="alert"></div>
     ${owner?`<h4>초대 코드</h4>
      <p class="hint">상태: <b>${stTxt}</b>${inv.status==='active'&&inv.expiresAt?` · ${fmtDate(inv.expiresAt)}까지`:''}${inv.uses?` · 지금까지 ${inv.uses}번 사용`:''}</p>
      ${showCodeNow?`<div class="vv-code">${esc(i.code)}</div>`:(inv.status==='active'?'<p class="hint">이 브라우저에는 코드가 저장돼 있지 않아요. 새 코드를 발급하면 다시 볼 수 있어요.</p>':'')}
      <div class="vv-btns">${showCodeNow?'<button type="button" id="vmCopy">코드 복사</button>':''}<button type="button" id="vmRot">새 코드 발급 (기존 코드 폐기)</button>${inv.status==='active'?'<button type="button" id="vmRev" class="vv-danger">코드 폐기</button>':''}</div>
      <label>집 이름 <span class="row"><input id="vmName" maxlength="40" value="${esc(i.name)}"><button type="button" id="vmNameGo">저장</button></span></label>`:''}
     <h4>참여자 ${i.members.length}/${i.limits.members}</h4>
     <div class="vv-members">${i.members.map(m=>`<div><span>${esc(m.nick)} ${m.role==='owner'?'<small class="vv-tag fact">집 주인</small>':''}${m.pid===i.me.pid?' <small class="vv-tag">나</small>':''}</span>${owner&&m.pid!==i.me.pid?`<button type="button" class="vv-danger" data-kick="${esc(m.pid)}">내보내기</button>`:''}</div>`).join('')}</div>
     <label>내 별명 <span class="row"><input id="vmNick" maxlength="20" value="${esc(i.me.nick)}"><button type="button" id="vmNickGo">변경</button></span></label>
     <h4>도면</h4><p class="hint">지금 공유된 도면은 <b>v${i.docRev}</b>${i.docSavedBy?` · ${esc(i.docSavedBy)}님이 저장`:''}${i.docSavedAt?` · ${fmtDate(i.docSavedAt)}`:''}이에요. 참여자는 누구나 편집기에서 고치고 <b>저장</b>하면 모두에게 반영돼요. 저장하기 전의 변경은 다른 사람에게 보이지 않아요.</p><div class="vv-btns"><button type="button" id="vmEdit">편집기에서 열기</button></div>
     <h4>다른 기기에서 이어 쓰기</h4>
     <p class="hint">복구 키는 이 집의 <b>내 참여 자격</b>이에요. 다른 사람에게 보여 주지 마세요. 브라우저 데이터를 지우면 참여 자격이 사라져 내 캐릭터를 관리할 수 없게 되니, 필요하면 복구 키를 따로 적어 두세요.</p>
     <div class="vv-btns"><button type="button" id="vmKey">복구 키 복사</button></div>
     <div class="vv-btns" style="margin-top:14px"><button type="button" id="vmClose">닫기</button>${owner?'<button type="button" id="vmDel" class="vv-danger">집 삭제</button>':'<button type="button" id="vmLeave" class="vv-danger">이 집에서 나가기</button>'}</div></form>`;
    const err=m=>{const e=q('#vmErr',d);if(e)e.textContent=m||''};
    const run=(fn,after)=>async ev=>{err('');const b=ev.currentTarget;b.disabled=true;try{await fn();if(after)after();else render()}catch(e){err(e.message==='취소했어요'?'':waitMsg(e));b.disabled=false}};
    q('#vmClose',d).onclick=()=>{d.close();onShareChange()};
    q('#vmEdit',d).onclick=async()=>{d.close();await go('edit');if(window.VivCollab)await VivCollab.openForEdit(hid)};
    q('#vmNickGo',d).onclick=run(()=>SH().setNick(hid,q('#vmNick',d).value.trim()));
    q('#vmKey',d).onclick=e=>copyText(SH().recoveryKey(hid),e.currentTarget);
    if(owner){
      if(q('#vmCopy',d))q('#vmCopy',d).onclick=e=>copyText(i.code,e.currentTarget);
      q('#vmRot',d).onclick=run(async()=>{if(inv.status==='active'&&!confirm('기존 초대 코드는 바로 폐기돼요. 새 코드를 발급할까요?'))throw new Error('취소했어요');await SH().rotate(hid)});
      if(q('#vmRev',d))q('#vmRev',d).onclick=run(async()=>{if(!confirm('초대 코드를 폐기하면 이 코드로는 아무도 들어올 수 없어요. 이미 들어온 참여자는 그대로예요. 폐기할까요?'))throw new Error('취소했어요');await SH().revoke(hid)});
      q('#vmNameGo',d).onclick=run(()=>SH().rename(hid,q('#vmName',d).value.trim()));
      qa('[data-kick]',d).forEach(b=>b.onclick=run(async()=>{if(!confirm('이 참여자를 내보낼까요? 이 참여자가 등록한 캐릭터도 함께 삭제돼요.'))throw new Error('취소했어요');await SH().kick(hid,b.dataset.kick)}));
      q('#vmDel',d).onclick=run(async()=>{if(!confirm('이 공유 집과 안에 있는 모든 캐릭터·참여 정보가 서버에서 삭제돼요. 되돌릴 수 없어요. 삭제할까요?'))throw new Error('취소했어요');await SH().deleteHouse(hid)},()=>{d.close();enter(true)})}
    else q('#vmLeave',d).onclick=run(async()=>{if(!confirm('이 집에서 나가면 내가 등록한 캐릭터도 함께 삭제돼요. 나갈까요?'))throw new Error('취소했어요');await SH().leave(hid)},()=>{d.close();enter(true)})};
  render();if(!d.open)d.showModal()}

/* ---------- 시작 ---------- */
function init(){
  const nav=document.createElement('nav');nav.className='vnav';nav.innerHTML='<button data-m="edit" class="on">단면도 편집</button><button data-m="viv">비바리움 관찰</button><button class="vjoin" id="vvJoin" title="초대 코드로 다른 사람의 집에 들어가기">입장하기</button>';
  q('#top .logo').after(nav);qa('button[data-m]',nav).forEach(b=>b.onclick=()=>go(b.dataset.m));q('#vvJoin',nav).onclick=()=>{if(!booted){booted=true;build()}openJoin()};if(SH())SH().onChange(onShareChange);
  const sec=document.createElement('section');sec.id='viv';document.body.appendChild(sec);
  window.addEventListener('hashchange',()=>go(location.hash==='#viv'?'viv':'edit'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)simTick()});
  if(location.hash==='#viv')go('viv');
  window.VivUI={go,isBlank,getHouses,drawDoc,describe,runSim,simTick};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
