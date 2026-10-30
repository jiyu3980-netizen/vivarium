/* 비바리움 관찰 탭 — 저장된 도면(내 단면도 슬롯)을 읽기 전용으로 그리고 캐릭터를 올린다.
   원칙: 도면 데이터(S, SL)는 읽기만 한다. 캐릭터 정보는 viv-data.js 의 별도 저장소에만 쓴다.
   도면 그리기는 기존 render()/exportSvg() 를 그대로 재사용한다(문서를 잠시 바꿔 그린 뒤 반드시 원래 문서로 복원). */
(function(){
const NSV='http://www.w3.org/2000/svg';
const B=window.SectionBridge;   // app.js 가 내보낸 읽기 전용 연결부(편집기 내부 함수 재사용)
const {norm,render,exportSvg,EH,lvl,sl,fnameKo,OPT,STAIR_ASSET,art,ART,applyVP,persistNow,slotName,esc}=B;
const q=(s,r)=>(r||document).querySelector(s),qa=(s,r)=>[...(r||document).querySelectorAll(s)];
const G=Sim.GROUPS,REDUCE=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const HMIN=8,HMAX=400;
let editFitted=false,mode='viv',houses=[],activeIdx=0,selChar=null,IMG={},token=0,clockT=0,simT=0,shareT=0,booted=false;
const SH=()=>window.VivShare||null;
const shareOn=()=>!!(SH()&&SH().enabled());
const curShare=()=>{const h=houses[activeIdx];return h&&h.shared?h.shared:null};    // 지금 보는 집이 공유 집이면 {hid,role}
const canSetC=c=>!c||!c.remote||!!c.canSet;
const canEdit=c=>!c||!c.remote||!!c.canEdit;                                    // 공유 집 캐릭터는 등록한 사람과 집 주인만 수정(서버도 같은 규칙으로 검증)
const note=(m,kind)=>{const e=q('#vvNote');if(!e)return;e.textContent=m||'';e.className='vv-note2'+(kind?' '+kind:'');e.hidden=!m;
  if(m){const x=document.createElement('button');x.type='button';x.className='vv-note-x';x.textContent='×';x.title='닫기';x.setAttribute('aria-label','알림 닫기');x.onclick=()=>{e.hidden=true};e.appendChild(x)}};   // 알림창 오른쪽 끝 × 로 닫기

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
  const tries={};let bad=false;
  while(Date.now()-t0<8000){let all=true,wait=60;bad=false;for(const u of urls){art(u,true);const e=ART[u];if(!(e&&e.ready))all=false;else if(e.err){bad=true;tries[u]=(tries[u]||0)+1;if(tries[u]<=3){delete ART[u];all=false;wait=500}}}   // 읽기 실패한 그림은 몇 번 다시 시도 (빈 그림이 굳어 저장되지 않게)
    if(all)return !bad;await new Promise(r=>setTimeout(r,wait))}return false}   // 시간 안에 다 못 읽으면 false (빈 상자로 그려진 그림을 저장해 두지 않기 위해)
/* 도면에서 시뮬레이션에 필요한 기하만 뽑는다: 층·방(내벽 구간)·문·창문·계단 끝점·가구(분류 메타 포함). S 를 읽기만 한다. */
function buildGeo(S,b){
  const ex_=b.ext||[],lo_=Math.min(...(ex_.length?ex_.map(e=>e.l):[0])),hi_=Math.max(...(ex_.length?ex_.map(e=>e.r):[b.w]));
  const geo={W:b.w,t:b.t,in0:lo_+b.t,in1:hi_-b.t,mid:(lo_+hi_)/2,ext:ex_.map(e=>({l:e.l,r:e.r})),floors:[],rooms:[],stairs:[],items:[],windows:[],exits:[]},g0=B.BB();
  const XL_=k=>(ex_[k]?ex_[k].l:0),XR_=k=>(ex_[k]?ex_[k].r:b.w);
  for(let k=0;k<b.f;k++)geo.floors.push({k,name:fnameKo(k),e:lvl(k),top:lvl(k+1)-sl(k+1)});
  const isDoor=(o,host,k)=>o.kind==='door'&&o.on===host&&o.f===k&&(+o.sill||0)<=15;
  for(let k=0;k<b.f;k++)B.roomsOf(k).forEach(r=>{const rp=r.rightPart;
    geo.rooms.push({key:r.key,f:k,left:r.left,right:r.right,name:(S.rooms&&S.rooms[r.key])||'',partX:rp?rp.x:null,doorRight:!!(rp&&S.ops.some(o=>isDoor(o,rp.id,k)))})});
  S.ops.forEach(o=>{if(o.f<0||o.f>=b.f||o.on==='back')return;
    if(o.kind==='door'&&(o.on==='L'||o.on==='R')&&o.f===g0&&(+o.sill||0)<=15)geo.exits.push({f:g0,x:o.on==='L'?XL_(g0)+b.t+12:XR_(g0)-b.t-12,side:o.on});
    if(o.kind==='window'){let x=null;if(o.on==='L')x=XL_(o.f)+b.t+45;else if(o.on==='R')x=XR_(o.f)-b.t-45;else{const p=S.parts.find(q=>q.id===o.on);if(p)x=p.x-p.t/2-40}
      if(x!=null)geo.windows.push({id:o.id,f:o.f,x})}});
  S.stairs.forEach(a=>{if(a.type==='outer')return;const g=B.stairGeo(['straight','L','U'].includes(a.type||'straight')&&(a.sv==='front'||a.sv==='back')?{...a,sv:'side'}:a);if(!g)return;let xb,xt;const dir=a.dir>=0?1:-1;
    if(g.asset){const A=g.asset;if(a.type==='spiral'){xb=xt=A.x+A.w*.5}else{xb=dir>0?A.x+A.w*.12:A.x+A.w*.88;xt=dir>0?A.x+A.w*.88:A.x+A.w*.12}}
    else{xb=a.x;if(a.type==='U')xt=a.x;else if(g.land&&a.type!=='straight')xt=dir>0?g.land[1]:g.land[0];else xt=g.xt}
    geo.stairs.push({f:a.f,xb,xt})});
  /* v23.17: 외벽 밖 마당 — 1층(지면) 외벽 바깥, 지면 높이에 놓인 에셋이 있는 쪽마다 구역을 만든다(캐릭터가 문으로 나가 상호작용) */
  const gE=-(b.rz||0),X0=XL_(g0),X1=XR_(g0);geo.groundE=gE;geo.g0=g0;
  const yl=[],yr=[],isYard=i=>Math.abs((+i.e||0)-gE)<=14&&(i.x+(i.w||0)/2<=X0-2||i.x-(i.w||0)/2>=X1+2);
  S.items.forEach(i=>{if(!isYard(i))return;(i.x<X0?yl:yr).push(i)});
  if(yl.length||yr.length){geo.yard={};
    if(yl.length)geo.yard.L={l:Math.max(X0-3000,Math.min(X0-262,...yl.map(i=>i.x-(i.w||0)/2-80))),r:X0-2};
    if(yr.length)geo.yard.R={l:X1+2,r:Math.min(X1+3000,Math.max(X1+262,...yr.map(i=>i.x+(i.w||0)/2+80)))}}
  S.items.forEach(i=>{const a=B.AM[i.assetId]||{},fv=a.views&&a.views.front;
    let f=0;geo.floors.forEach(fl=>{if(fl.e<=i.e+3)f=fl.k});if(isYard(i))f=g0;
    geo.items.push({uid:i.uid,aid:i.assetId,x:i.x,e:i.e,w:i.w,h:i.h,f,name:a.nameKo||'가구',en:a.nameEn||'',cat:a.categoryId||'',sub:a.subcategoryId||'',tags:a.tags||[],sb:(fv&&fv.sourceBlock)||''})});
  return geo}
/* ---------- 색감 팔레트 (보는 사람 개인 설정: 이 브라우저에만 저장, 공유·서버·도면 원본과 무관) ---------- */
const PALS={
 none:{n:'기본',sw:['#f7f6f2','#1c1c1c','#8d8d89']},
 coral:{n:'코랄 핑크',bg:'#fff1ea',line:'#e5483f',room:'#fffaf5',paper:'#ffffff',hatch:'#ffd2c6',ground:'#f7b7a8',tint:'#fde3d8',glass:'#fff1b8',sw:['#fff1ea','#e5483f','#f7b7a8']},
 blue:{n:'블루프린트',bg:'#cfeafa',line:'#1f84d4',room:'#e8f6ff',paper:'#f4fbff',hatch:'#fff8c2',ground:'#79bdea',tint:'#cfe9fa',glass:'#b9e2fb',sw:['#cfeafa','#1f84d4','#fff8c2']},
 dream:{n:'드림코어 그린',bg:'#d3e1d0',line:'#2f5d57',room:'#e4eee1',paper:'#f3f7f0',hatch:'#8fb89f',ground:'#6b7f74',tint:'#c8d9c6',glass:'#b7c9d6',sw:['#c8d9c6','#7fa98c','#2f5d57']},
 mint:{n:'핑크 & 민트',bg:'#fdeef2',line:'#16918f',room:'#fff7f9',paper:'#ffffff',hatch:'#ffb9cb',ground:'#ffc7d6',tint:'#ffe0e8',glass:'#c8f0ee',sw:['#fdeef2','#16918f','#ffb9cb']}};
const PAL_KEY='sectionSite.vivPalette';
const palAcc=()=>{try{const p=PALS[palId];return p&&p.line&&palId!=='none'?p.line:'#d0382c'}catch(e){return '#d0382c'}};   // 선택된 말풍선 테두리색 = 지금 팔레트의 강조색
let palId=(()=>{try{const v=localStorage.getItem(PAL_KEY);return PALS[v]?v:'none'}catch(e){return 'none'}})();
function palSvg(t,P){
  if(!P||!P.line)return t;
  const rep=s=>s
    .replace(/(<pattern id="hat_[^>]*>\s*<rect [^>]*?)fill="#fff"/g,'$1fill="@H@"')
    .replace(/fill="#ffffff"/g,'fill="@R@"').replace(/#fff(?![0-9a-fA-F])/g,'@P@')
    .replace(/#f7f6f2/g,P.bg).replace(/#8d8d89/g,P.ground)
    .replace(/#(e4e4e1|e6e6e3|f6f6f3|e6e6e6|f4f4f4)(?![0-9a-fA-F])/g,P.tint).replace(/#(c3c8cc|a2a9ae|c6c6c6|a5a5a5)(?![0-9a-fA-F])/g,P.glass)
    .replace(/#(1c1c1c|80878c|656b70|b4b4ad|808080|686868|b2b2b2|555)(?![0-9a-fA-F])/g,P.line)
    .replace(/@H@/g,P.hatch).replace(/@R@/g,P.room).replace(/@P@/g,P.paper);
  // 마스크 안의 흰색/검정은 '보이기/가리기' 신호이므로 건드리지 않음
  return t.split(/(<mask[\s\S]*?<\/mask>)/).map((s,i)=>i%2?s:rep(s)).join('')}
function palCss(sec){const P=PALS[palId];if(!sec)return;
  if(P&&P.line){sec.style.setProperty('--vp-bg',P.bg);sec.style.setProperty('--vp-gnd',P.ground);sec.style.setProperty('--vp-line',P.line);sec.dataset.pal=palId}
  else{['--vp-bg','--vp-gnd','--vp-line'].forEach(k=>sec.style.removeProperty(k));delete sec.dataset.pal}}
function palUrl(snap){return URL.createObjectURL(new Blob([palSvg(snap.text,PALS[palId])],{type:'image/svg+xml'}))}
function palApply(){
  palCss(q('#viv'));
  qa('#vvPal button').forEach(b=>b.classList.toggle('on',b.dataset.pal===palId));
  qa('.vv-slide').forEach(sl=>{if(!sl._snap)return;const im=q('.vv-bg',sl);if(!im)return;const old=sl._url;sl._url=palUrl(sl._snap);im.src=sl._url;if(old)URL.revokeObjectURL(old);bake(sl)})}
function palPick(id){if(!PALS[id])return;palId=id;try{localStorage.setItem(PAL_KEY,id)}catch(e){}palApply()}
function drawDoc(doc){
  const keepS=B.S,keepSel=B.sel;
  try{
    B.S=norm(JSON.parse(JSON.stringify(doc)));B.sel=null;render();
    const S=B.S,ex=exportSvg(),b=S.b,top=EH()+(b.roof==='gable'?b.rh:b.roof==='flat'?30:0),dep=-lvl(0)+b.s;
    const x0=ex.x0,y0=ex.y0,w=ex.w,h=ex.h;
    const geo=buildGeo(S,b);
    const text=ex.text.replace(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="#f7f6f2"\/>/,'');   // 도면 바깥 종이색 사각형(집 둘레의 테두리처럼 보이던 것)은 관찰 화면에서 뺌
    return {text,x0,y0,w,h,geo,gy:b.rz||0,dk:JSON.stringify(doc)}
  }finally{B.S=keepS;B.sel=keepSel;render()}}   // 편집기 문서 원상 복구

/* ---------- 위치·행동 문구 ---------- */
function floorOf(geo,f){return geo.floors[Math.max(0,Math.min(geo.floors.length-1,f|0))]}
function describe(c,p,snap,hname){
  if(p.mode==='out')return {loc:'집 밖',act:'외출 중',phrase:`${c.name}: ${p.say||'지금은 집에 없어요. 외출 중이에요'}`};
  if(!snap)return {loc:'배치되지 않음',act:'-',phrase:`${c.name}: 아직 집에 배치되지 않았어요.`};
  const geo=snap.geo,fl=floorOf(geo,p.f),x=p.x==null?geo.mid:p.x,seg=snap.world.segAt(fl.k,x);
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
  <section class="vv-main"><div class="vv-bar"><b id="vvHouse"></b><select id="vvRoomSel" class="vv-roomsel" title="방별 보기" aria-label="방별 보기" hidden></select><span class="vv-sp"></span><span id="vvPal" class="vv-pal" title="내 화면의 색감 (다른 사람에게는 영향 없음)"><small>색감</small>${Object.keys(PALS).map(k=>`<button type="button" data-pal="${k}" title="${PALS[k].n}" aria-label="${PALS[k].n}" style="background:linear-gradient(135deg,${PALS[k].sw[0]} 0 38%,${PALS[k].sw[1]} 38% 68%,${PALS[k].sw[2]} 68%)"></button>`).join('')}</span><span id="vvClock" title="Asia/Seoul 기준"></span><button id="vvHood" hidden title="이웃으로 등록한 집들을 나란히 놓고 보기">동네 보기</button><button id="vvShare" title="초대 코드로 다른 사람과 이 집을 함께 쓰기">집 공유하기</button><button id="vvRefresh">도면 새로고침</button></div><div id="vvNote" class="vv-note2" hidden></div><div id="vvOuts" class="vv-outs" hidden></div>
   <div id="vvEmpty" class="vv-empty" hidden><h2>아직 내 집이 없어요!</h2><p>직접 단면도를 만들어 집을 꾸미거나, 받은 초대 코드로 「입장하기」를 눌러 다른 사람의 집에 들어갈 수 있어요.</p><button id="vvGoEdit" class="vv-primary">집 만들기</button></div>
   <div id="vvCar" class="vv-car"><button class="vv-arrow" id="vvPrev" aria-label="이전 집">‹</button><div id="vvTrack" class="vv-track"></div><button class="vv-arrow" id="vvNext" aria-label="다음 집">›</button></div><div id="vvDots" class="vv-dots"></div></section>
  <aside class="vv-detail" id="vvDetail"></aside></div>`;
  const dlg=document.createElement('dialog');dlg.id='vvDlg';document.body.appendChild(dlg);
  q('#vvAdd').onclick=()=>openForm();
  q('#vvGoEdit').onclick=()=>go('edit');
  q('#vvRefresh').onclick=()=>enter(true);
  qa('#vvPal button').forEach(b=>b.onclick=()=>palPick(b.dataset.pal));palApply();
  q('#vvShare').onclick=()=>openShare();
  q('#vvHood').onclick=()=>{nbSave({view:!nbState().view});hoodUi();const sl=qa('.vv-slide')[activeIdx];sl&&renderHood(sl)};
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
  try{history.replaceState(null,'',m==='viv'?'#viv':'#edit')}catch(e){}
  if(m==='viv')enter();else{clearInterval(clockT);clearInterval(simT);clearInterval(shareT);try{applyVP();render();if(!editFitted){editFitted=true;requestAnimationFrame(()=>{try{B.fit&&B.fit()}catch(e){}})}}catch(e){}}
}
/* v23.4 이미지가 비어 있거나(아직 못 받음) 깨진(만료된 blob 주소) 캐릭터는 다시 받아 와 그 자리에 채움 — 외출 중·손님 캐릭터도 포함 */
let imgTry={};
function imgFill(){for(const c of Viv.chars()){if(!c.img||IMG[c.id])continue;const t=imgTry[c.id]||0;if(Date.now()-t<15000)continue;imgTry[c.id]=Date.now();
  (async()=>{try{const u=await Viv.imageUrl(c.id);if(u){IMG[c.id]=u;const sl=qa('.vv-slide')[activeIdx];if(sl)drawChars(sl);renderList();softDetail()}}catch(e){}})()}}
function imgBad(id){delete IMG[id];delete imgTry[id];imgFill()}
async function loadImages(){IMG={};for(const c of Viv.chars()){try{const u=await Viv.imageUrl(c.id);if(u)IMG[c.id]=u}catch(e){}}}
function tick(){const el=q('#vvClock');if(el)el.textContent=(clockFx>Date.now()?'서울 --:--':'서울 '+Viv.seoul().text)}
/* 편집기가 에셋 목록·저장 슬롯을 다 읽을 때까지 기다린다(비바리움 탭에서 새로고침했을 때 "저장된 도면 없음"으로 잘못 보이는 것을 막음) */
const whenReady=()=>new Promise(res=>{const t0=Date.now();(function chk(){if((B.ready&&Object.keys(B.AM).length)||Date.now()-t0>8000)res();else setTimeout(chk,80)})()});
async function enter(force){
  const my=++token;await whenReady();if(my!==token)return;tick();clearInterval(clockT);clockT=setInterval(tick,30000);
  if(shareOn()){await syncShared();if(my!==token)return}
  await loadImages();if(my!==token)return;
  const prev=houses[activeIdx]&&houses[activeIdx].id;
  houses=getHouses();nbMigrate();
  const track=q('#vvTrack'),empty=!houses.length;
  q('#vvEmpty').hidden=!empty;q('#vvCar').hidden=empty;q('#vvDots').hidden=empty;q('#vvRefresh').hidden=empty;
  track.innerHTML='';qa('.vv-slide',track).forEach(s=>{s._url&&URL.revokeObjectURL(s._url);s._rast&&URL.revokeObjectURL(s._rast)});
  houses.forEach((h,i)=>{const s=document.createElement('div');s.className='vv-slide';s.dataset.house=h.id;s.innerHTML=`<div class="vv-stagewrap"><div class="vv-wait">불러오는 중…</div></div>`;track.appendChild(s)});
  const want=(force&&prev)||Viv.getUi().house||prev;let i=Math.max(0,houses.findIndex(h=>h.id===want));
  activeIdx=i;renderDots();renderList();renderDetail();
  if(empty){q('#vvHouse').textContent='';return}
  await new Promise(r=>requestAnimationFrame(r));track.scrollLeft=i*track.clientWidth;
  await activate(i,true);
  clearInterval(simT);simT=setInterval(simTick,60000);clearInterval(nbT);nbT=setInterval(()=>{if(mode==='viv'&&!document.hidden)nbPoll()},60000);setTimeout(nbPoll,800);
  clearInterval(shareT);   // 공유 집 변경 확인은 VivShare 가 15초마다(화면이 보일 때만) 가볍게 확인한다
}
function renderDots(){const d=q('#vvDots');d.innerHTML=houses.map((h,i)=>`<button class="${i===activeIdx?'on':''}" data-i="${i}" title="${esc(h.name)}"></button>`).join('');
  qa('button',d).forEach(b=>b.onclick=()=>scrollTo(+b.dataset.i));
  q('#vvPrev').disabled=activeIdx<=0;q('#vvNext').disabled=activeIdx>=houses.length-1;q('#vvPrev').hidden=q('#vvNext').hidden=houses.length<2;d.hidden=houses.length<2}
async function activate(i,silent){
  const my=token;activeIdx=i;const h=houses[i];if(!h)return;
  q('#vvHouse').textContent=`${h.name}${houses.length>1?`  (${i+1}/${houses.length})`:''}`;renderDots();Viv.setUi({house:h.id});fillRoomTop();
  const slide=qa('.vv-slide')[i];await ensureStage(slide,h);if(my!==token)return;
  if(selChar){const p=Viv.getPlace(selChar);if(p.house!==h.id&&!silent)selChar=null}
  runSim(i,false);   // 이 집을 열 때: 지금 서울 시각에 맞는 행동으로 한 번 갱신(오프라인 동안의 행동은 재생하지 않음)
  drawChars(slide);renderList();renderDetail();shareLabel();
  (window.requestIdleCallback||setTimeout)(()=>{if(my!==token)return;[i+1,i-1].forEach(j=>{const h2=houses[j],sl2=qa('.vv-slide')[j];if(h2&&sl2&&!sl2._snap)ensureStage(sl2,h2)})},{timeout:2500})}   // 옆 집도 미리 그려 둠(넘길 때 기다리지 않게)
const YARD_WARNED=new Set();
async function ensureStage(slide,h){
  if(slide._key===h.key&&slide._snap)return;
  const wrap=q('.vv-stagewrap',slide);
  try{
    const okArt=await preload(h.doc);const snap=drawDoc(h.doc);snap.inc=!okArt;snap.world=Sim.buildWorld(snap.geo);
    if(h.shared&&SH().geoNeeded&&SH().geoNeeded(h.shared.hid)&&okArt){const hs=SH().info(h.shared.hid);if(hs)SH().uploadGeo(h.shared.hid,snap.geo,hs.docRev)}   // 서버 생활 엔진용 지형 올리기(도면 버전당 한 번)
    if(!h.shared&&snap.world.segs.some(sg=>sg.yard&&!sg.door)&&!YARD_WARNED.has(h.id)){YARD_WARNED.add(h.id);setTimeout(()=>note('외벽 밖에 놓인 에셋이 있지만 1층 외벽에 문이 없어서 캐릭터가 나갈 수 없어요. 단면도 편집에서 1층 외벽에 문을 달아 주세요.','warn'),700)}
    if(slide._url)URL.revokeObjectURL(slide._url);if(slide._rast){URL.revokeObjectURL(slide._rast);slide._rast=null}
    const url=palUrl(snap);slide._url=url;slide._snap=snap;slide._key=h.key;
    wrap.innerHTML=`<div class="vv-stage" style="--ar:${snap.w/snap.h};aspect-ratio:${snap.w}/${snap.h}"><div class="vv-gnd" style="top:${((snap.gy-snap.y0)/snap.h*100).toFixed(3)}%"></div><img class="vv-bg" alt="${esc(h.name)} 단면도" src="${url}" draggable="false" decoding="async"><svg class="vv-ov" viewBox="${snap.x0} ${snap.y0} ${snap.w} ${snap.h}" xmlns="${NSV}"></svg></div>`;
    q('.vv-stage',slide).addEventListener('pointerdown',e=>{if(e.target.closest('.vv-ch'))return;if(selChar){selChar=null;drawChars(slide);renderList();renderDetail()}});
    initZoom(slide,wrap);bake(slide);
    if(snap.inc&&(slide._retry=(slide._retry||0)+1)<=4){const key0=slide._key;setTimeout(()=>{if(slide._key===key0&&slide._snap===snap){slide._key=null;ensureStage(slide,h).then(()=>{if(slide===qa('.vv-slide')[activeIdx]){drawChars(slide)}})}},2500)}else if(!snap.inc)slide._retry=0
  }catch(e){wrap.innerHTML=`<div class="vv-wait">도면을 불러오지 못했어요 (${esc(e.message||e)})</div>`}}

/* ---------- 성능: 도면을 한 번만 비트맵으로 구워서 보여 줌 ----------
   도면 SVG 는 연필 번짐 필터·해칭 패턴이 무거워서, 확대·이동할 때마다 다시 그리면 버벅인다.
   → 한 번 그림(WebP/PNG)으로 구워 두고 그 그림만 움직인다. 아주 크게 확대했을 때만 가만히 멈춘 순간에 원본 벡터로 바꿔 또렷하게 보여 준다. */
const MOBILE=()=>matchMedia('(max-width:900px)').matches||(('ontouchstart' in window)&&Math.min(innerWidth,innerHeight)<820);
/* 구운 도면 그림 저장소(IndexedDB, 최근 8장만). 실패하면 조용히 건너뛰고 매번 굽는다 */
const BAKE_DB='viv-bake-v1';let _bdb=null;
function bakeDb(){return _bdb||(_bdb=new Promise(res=>{try{const r=indexedDB.open(BAKE_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('b',{keyPath:'k'});r.onsuccess=()=>res(r.result);r.onerror=r.onblocked=()=>res(null)}catch(e){res(null)}}))}
const BAKE_VER='23.22';   // 도면을 그리는 방식이 바뀌면 올려서 옛 저장본을 쓰지 않게 함
function bakeKey(doc,W,H){let h=2166136261;const t=BAKE_VER+'|'+doc+'|'+palId;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+'.'+t.length+'.'+W+'x'+H}
async function bakeGet(k){try{const db=await bakeDb();if(!db)return null;return await new Promise(res=>{const r=db.transaction('b').objectStore('b').get(k);r.onsuccess=()=>res(r.result&&r.result.blob||null);r.onerror=()=>res(null)})}catch(e){return null}}
async function bakePut(k,blob){try{const db=await bakeDb();if(!db)return;const tx=db.transaction('b','readwrite'),os=tx.objectStore('b');os.put({k,blob,t:Date.now()});
  const all=os.getAll();all.onsuccess=()=>{const rows=(all.result||[]).sort((a,b)=>b.t-a.t);rows.slice(8).forEach(r=>os.delete(r.k))}}catch(e){}}
async function bake(slide){
  const snap=slide&&slide._snap,im=slide&&q('.vv-bg',slide);if(!im||!snap)return;const key=slide._url;
  try{
    const st=q('.vv-stage',slide),dpr=Math.min(window.devicePixelRatio||1,2),cap=MOBILE()?1800:2800;
    let W=Math.min(cap,Math.round(Math.max(st&&st.offsetWidth||0,500)*dpr*2)),H=Math.round(W*snap.h/snap.w);if(H>cap){H=cap;W=Math.round(H*snap.w/snap.h)}
    /* 새로고침 때마다 다시 굽지 않도록 같은 도면·팔레트·크기면 저장해 둔 그림을 바로 재사용 (굽는 데 모바일에서 1초 이상 걸림) */
    const ck=bakeKey(snap.dk||snap.text,W,H);let blob=await bakeGet(ck);
    if(slide._url!==key)return;
    if(!blob){
      if(!im.complete)await new Promise((r,j)=>{im.addEventListener('load',r,{once:true});im.addEventListener('error',j,{once:true})});
      await new Promise(r=>(window.requestIdleCallback||setTimeout)(r,{timeout:700}));
      if(slide._url!==key)return;
      const cv=document.createElement('canvas');cv.width=W;cv.height=H;cv.getContext('2d').drawImage(im,0,0,W,H);
      blob=await new Promise(r=>cv.toBlob(r,'image/webp',.88));if(!blob||blob.type!=='image/webp')blob=await new Promise(r=>cv.toBlob(r,'image/png'));
      if(blob&&slide._url===key&&!snap.inc)bakePut(ck,blob)}
    if(!blob||slide._url!==key||!im.isConnected)return;
    const u=URL.createObjectURL(blob),old=slide._rast;slide._rast=u;slide._rastW=W;
    await new Promise(r=>{const t=new Image();t.onload=r;t.onerror=r;t.src=u});   // 화면에 바꾸기 전에 미리 디코딩
    if(slide._url!==key)return;
    slide._bgMode='rast';im.src=u;if(old)URL.revokeObjectURL(old);
    const g=q('.vv-stage',slide);if(g)g.dataset.baked='1';
    if(slide._z&&slide._z.recheck)slide._z.recheck()
  }catch(e){/* 구울 수 없으면 벡터 그대로 */}}
/* 큰 확대일 때만 원본 벡터로(멈춘 순간), 움직이는 동안은 비트맵 */
function bgMode(slide,mode){const im=q('.vv-bg',slide);if(!im||!slide._rast||slide._bgMode===mode)return;
  slide._bgMode=mode;im.src=mode==='vec'?slide._url:slide._rast}

/* ---------- 관찰 화면 확대/축소·이동 (내 화면에서만. 서버나 다른 사람에게는 전혀 공유되지 않음) ---------- */
function fillRoomTop(){const sel=q('#vvRoomSel');if(!sel)return;const sl=qa('.vv-slide')[activeIdx];const o=sl&&sl._roomOpts;sel.hidden=!o;sel.innerHTML=o||'';sel.value=''}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='vvRoomSel'){const sl=qa('.vv-slide')[activeIdx];if(sl&&sl._roomGo)sl._roomGo(e.target.value)}});
function initZoom(slide,wrap){
  const Z=slide._z||(slide._z={k:1,x:0,y:0});const st=()=>q('.vv-stage',slide);
  let raf=0,idleT=0,D=null;
  const dims=()=>{const e=st();if(!e)return null;const r=wrap.getBoundingClientRect();return D={e,rw:r.width,rh:r.height,w:e.offsetWidth,h:e.offsetHeight,ox:e.offsetLeft,oy:e.offsetTop}};
  const settle=()=>{clearTimeout(idleT);idleT=setTimeout(()=>{wrap.classList.remove('vv-moving');   // 움직임이 멈추면: 많이 확대된 상태일 때만 벡터로
    const need=slide._rastW?Z.k*Math.min(window.devicePixelRatio||1,2)*(D?D.w:0)>slide._rastW*.9:false;bgMode(slide,need?'vec':'rast')},170)};
  const apply=(fresh)=>{const d=(fresh||!D)?dims():D;if(!d)return;const e=d.e;const w=d.w*Z.k,h=d.h*Z.k;
    const mx=Math.max(60,d.rw*.2),my=Math.max(60,d.rh*.2),ox=d.ox,oy=d.oy;
    Z.x=Math.min(d.rw-mx-ox,Math.max(mx-w-ox,Z.x));Z.y=Math.min(d.rh-my-oy,Math.max(my-h-oy,Z.y));
    e.style.transform=Z.k===1&&!Z.x&&!Z.y?'':`translate3d(${Z.x}px,${Z.y}px,0) scale(${Z.k})`;const b=q('.vv-zreset',wrap);if(b)b.hidden=Z.k===1&&!Z.x&&!Z.y};
  const later=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;apply(false)})};   // 프레임당 한 번만 반영
  const moving=()=>{wrap.classList.add('vv-moving');if(slide._bgMode==='vec')bgMode(slide,'rast');settle()};
  Z.recheck=()=>{dims();settle()};
  wrap.classList.add('vv-zoomable');
  {const rb=document.createElement('button');rb.type='button';rb.className='vv-zreset';rb.textContent='보기 맞춤';rb.hidden=true;rb.title='확대·이동 되돌리기 (휠·두 손가락으로 확대/축소, 빈 곳을 끌어서 이동)';
  rb.onclick=()=>{Z.k=1;Z.x=0;Z.y=0;apply(true);settle();const zs=q('#vvRoomSel');if(zs)zs.value=''};wrap.appendChild(rb)}
  /* 방별 보기: 방을 고르면 그 방이 화면에 차게 부드럽게 이동 (내 화면에서만). 선택창은 단면도 제목 줄(#vvRoomSel)에 있음 */
  {const sn=slide._snap,g=sn&&sn.geo;slide._roomGo=null;slide._roomOpts='';if(g&&g.rooms&&g.rooms.length){
    let h='<option value="">전체 보기</option>';for(let k=g.floors.length-1;k>=0;k--)g.rooms.filter(r=>r.f===k).forEach((r,i)=>{h+=`<option value="${esc(r.key)}">${esc(g.floors[k].name)} · ${esc(r.name||'방 '+(i+1))}</option>`});
    slide._roomOpts=h;
    let tw=0;const goTo=(k1,x1,y1)=>{cancelAnimationFrame(tw);const a={k:Z.k,x:Z.x,y:Z.y},t0=performance.now(),Dm=matchMedia('(prefers-reduced-motion:reduce)').matches?0:260;
      const step=n=>{const u=Dm?1:Math.min(1,(n-t0)/Dm),e=u<1?1-Math.pow(1-u,3):1;Z.k=a.k+(k1-a.k)*e;Z.x=a.x+(x1-a.x)*e;Z.y=a.y+(y1-a.y)*e;moving();apply(false);if(u<1)tw=requestAnimationFrame(step)};tw=requestAnimationFrame(step)};
    slide._roomGo=key=>{if(!key){goTo(1,0,0);return}const r=g.rooms.find(q_=>q_.key===key),fl=r&&g.floors[r.f];if(!r||!fl)return;
      const d=dims();if(!d)return;const fx=d.w/sn.w,fy=d.h/sn.h;   // 세계 cm → 화면 px (확대 전)
      const px0=(r.left-sn.x0)*fx,px1=(r.right-sn.x0)*fx,py0=(-fl.top-sn.y0)*fy,py1=(-fl.e-sn.y0)*fy,mg=1.12;
      const k=Math.max(.5,Math.min(8,Math.min(d.rw/((px1-px0)*mg),d.rh/((py1-py0)*mg))));
      goTo(k,d.rw/2-d.ox-k*(px0+px1)/2,d.rh/2-d.oy-k*(py0+py1)/2)}}
    if(slide===qa('.vv-slide')[activeIdx])fillRoomTop()}
  apply(true);
  if(wrap._zi){wrap._zr=apply;return}
  wrap._zi=true;wrap._zr=apply;
  wrap.addEventListener('wheel',ev=>{const e=st();if(!e)return;ev.preventDefault();const d=dims();
    const r=wrap.getBoundingClientRect(),px=ev.clientX-r.left,py=ev.clientY-r.top,ox=d.ox,oy=d.oy;
    const f=Math.exp(-Math.max(-120,Math.min(120,ev.deltaY))*.0016),nk=Math.min(8,Math.max(.5,Z.k*f)),q_=nk/Z.k;
    Z.x=px-ox-(px-ox-Z.x)*q_;Z.y=py-oy-(py-oy-Z.y)*q_;Z.k=nk;moving();later()},{passive:false});
  const P=new Map();let pan=null,pin=null;
  wrap.addEventListener('pointerdown',ev=>{if(ev.button>1||ev.target.closest('.vv-ch,.vv-zreset,.vv-zroom'))return;
    P.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});try{wrap.setPointerCapture(ev.pointerId)}catch(e){}dims();
    if(P.size===2){const [a,b]=[...P.values()];const r=wrap.getBoundingClientRect();pan=null;pin={d0:Math.hypot(a.x-b.x,a.y-b.y)||1,k0:Z.k,cx:(a.x+b.x)/2-r.left,cy:(a.y+b.y)/2-r.top,x0:Z.x,y0:Z.y};wrap.classList.add('vv-panning');moving()}
    else if(P.size===1)pan={sx:ev.clientX,sy:ev.clientY,x:Z.x,y:Z.y,moved:false}});
  wrap.addEventListener('pointermove',ev=>{if(!P.has(ev.pointerId))return;P.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(pin&&P.size>=2){const [a,b]=[...P.values()],r=wrap.getBoundingClientRect(),d=D||dims();
      const nk=Math.min(8,Math.max(.5,pin.k0*Math.hypot(a.x-b.x,a.y-b.y)/pin.d0)),q_=nk/pin.k0,mx=(a.x+b.x)/2-r.left,my=(a.y+b.y)/2-r.top;
      Z.x=mx-d.ox-(pin.cx-d.ox-pin.x0)*q_;Z.y=my-d.oy-(pin.cy-d.oy-pin.y0)*q_;Z.k=nk;moving();later();return}
    if(!pan)return;const dx=ev.clientX-pan.sx,dy=ev.clientY-pan.sy;if(!pan.moved&&Math.hypot(dx,dy)<3)return;
    pan.moved=true;wrap.classList.add('vv-panning');Z.x=pan.x+dx;Z.y=pan.y+dy;moving();later()});
  const endp=ev=>{P.delete(ev.pointerId);if(P.size<2)pin=null;if(!P.size){pan=null;wrap.classList.remove('vv-panning')}else if(P.size===1){const [a]=[...P.values()];pan={sx:a.x,sy:a.y,x:Z.x,y:Z.y,moved:true}}settle()};
  wrap.addEventListener('pointerup',endp);wrap.addEventListener('pointercancel',endp);
  wrap.addEventListener('dblclick',ev=>{if(ev.target.closest('.vv-ch'))return;Z.k=1;Z.x=0;Z.y=0;apply(true);settle()});
  window.addEventListener('resize',()=>{apply(true)})}
/* ---------- 캐릭터 그리기·이동·크기·말풍선·걷기 ---------- */
const ANIM={},NODES={};let rafId=0;
const mkv=(n,a,par)=>{const e=document.createElementNS(NSV,n);Object.entries(a||{}).forEach(([k,v])=>e.setAttribute(k,v));par&&par.appendChild(e);return e};
/* 말풍선 줄 나누기: 실제 글꼴(Noto Sans KR 등)로 폭을 재서 나눈다. 두 줄을 넘으면 두 줄까지만 보이고 끝에 '...(더보기)'(작고 연한 글씨)가 붙는다. */
const MCV=(()=>{try{return document.createElement('canvas').getContext('2d')}catch(e){return null}})();
const mw=(s,fs)=>{if(!MCV)return tw(s,fs);MCV.font=`${fs}px "Noto Sans KR",Arial,sans-serif`;return MCV.measureText(s).width};
function wrapPx(text,maxW,fs){const out=[];let cur='';
  for(const w of String(text).split(' ')){const t=cur?cur+' '+w:w;if(mw(t,fs)<=maxW){cur=t;continue}
    if(cur){out.push(cur);cur=''}
    let pc='';for(const ch of w){if(pc&&mw(pc+ch,fs)>maxW){out.push(pc);pc=ch}else pc+=ch}cur=pc}
  if(cur)out.push(cur);return out}
const BUBX={};   // 펼친 말풍선: {캐릭터id:{open,text}} — 펼친 동안은 읽던 문장을 그대로 두고, 접으면 최신 문장으로 돌아간다
try{document.fonts&&document.fonts.ready.then(()=>{try{if(typeof mode!=='undefined'&&mode==='viv'){const sl=qa('.vv-slide')[activeIdx];sl&&sl._snap&&drawChars(sl)}}catch(e){}})}catch(e){}
const tw=(s,fs)=>[...s].reduce((a,ch)=>a+(ch.charCodeAt(0)>0x2e80?1:.58)*fs,0);
function wrapText(t,max){const out=[];let cur='';for(const w of String(t).split(' ')){if((cur+' '+w).trim().length>max&&cur){out.push(cur);cur=w}else cur=(cur+' '+w).trim()}if(cur)out.push(cur);
  if(out.length>1&&[...out[out.length-1]].length<=3){const l=out.pop();out[out.length-1]+=' '+l}return out.slice(0,3)}
function charBox(c,p,geo){const fl=floorOf(geo,p.f),ar=c.img?c.img.w/c.img.h:.6,h=p.h,w=h*ar,an=ANIM[c.id];
  const pose=an?'stand':(p.pose||'stand');let x=an?an.x:(p.x==null?geo.mid:p.x),e=an?an.e:(p.e!=null?p.e:fl.e);
  if(!an){const half=(pose==='lie'?h:w)/2,E=geo.ext&&geo.ext[fl.k],Y=geo.yard&&fl.k===geo.g0?geo.yard:null,lo=(Y&&Y.L?Y.L.l:(E?E.l+geo.t:geo.in0))+half,hi=(Y&&Y.R?Y.R.r:(E?E.r-geo.t:geo.in1))-half;x=lo<=hi?Math.min(Math.max(x,lo),hi):geo.mid}
  return {x,w,h,e:e+(an?an.bob:0),f:fl.k,pose,vw:pose==='lie'?h:w,vh:pose==='lie'?w:h}}
/* v22 이웃집 손님: 위치는 (손님 id + 방문 시작 시각)으로 정해 둬서, 같은 방문은 보는 사람마다 같은 자리에 보임. 방문 시작 90초 이내에 처음 그려질 때만 현관에서 걸어 들어오는 모습을 보여 줌 */
const GUEST_SEEN=new Set();
function guestSpot(c,snap,peek){const st=c.srvVisit?{outAt:c.startedAt}:Viv.getSim(c.id),p=c.srvVisit?{say:c.say,h:c.h||170,mode:'out'}:Viv.getPlace(c.id),geo=snap.geo,key=c.id+':'+(st.outAt||0);
  let h=0;for(const ch of key+':'+Math.floor(Date.now()/900000))h=(h*31+ch.charCodeAt(0))>>>0;   // v25: 15분마다 다른 가구 곁으로 옮겨 다님
  const ex=(snap.world&&snap.world.exits||[])[0],f0=ex&&ex.f!=null?ex.f:0,fl=floorOf(geo,f0),its=(geo.items||[]).filter(i=>i.f===f0&&i.w>0);
  const it=its.length?its[h%its.length]:null,lo=geo.in0+60,hi=geo.in1-60;
  let x=it?it.x+(((h>>4)%2)?1:-1)*(it.w/2+45):geo.mid;x=Math.min(Math.max(x,lo),hi);
  const doorX=ex&&ex.x!=null?Math.min(Math.max(ex.x,lo),hi):(((h>>3)%2)?hi:lo);
  const first=!GUEST_SEEN.has(key);if(!peek)GUEST_SEEN.add(key);if(GUEST_SEEN.size>200)GUEST_SEEN.clear();
  const fresh=first&&Date.now()-(st.outAt||0)<90000&&!REDUCE;
  const nm=it&&(it.name||it.label||'').replace(/\s*\d+$/,''),say=nm?['','구경하는 중','앞에 서서 둘러보는 중','곁에서 이야기하며 쉬는 중'][1+(h>>6)%3]:'',gsay=nm?`${nm} 곁에서 ${say}`:(p.say||'');
  return {p:{...p,house:snap.hid||p.house,mode:'home',f:f0,x,e:null,pose:'stand',dy:0,h:p.h,say:gsay},enter:fresh,from:{x:doorX,e:fl.e,f:f0},route:[{x,e:fl.e,f:f0}]}}
/* 서버가 계산하는 집의 걸음 연출: 서버가 남겨 둔 이동(현관으로 나가기·들어오기·방 사이 걷기)을 처음 받았을 때 한 번 보여 준다 */
const MVSEEN={},MVBOOT={},MVPLAYED=[];
function mvPlay(slide,hid){const first=!MVBOOT[hid];MVBOOT[hid]=1;const items=[];
  Viv.chars().forEach(c=>{if(!c.remote)return;const p=Viv.getPlace(c.id);if(p&&p.mv&&p.house===hid)items.push([c.id,p.mv])});
  visitorsOf(hid).filter(c=>c.srvVisit&&c.gp&&c.gp.mv).forEach(c=>items.push([c.id,c.gp.mv]));
  for(const [id,mv] of items){if(MVSEEN[id]===mv.t)continue;MVSEEN[id]=mv.t;if(first||Date.now()-mv.t>20*60000)continue;const pr=PRED[id];if(pr&&Math.abs(pr.t-mv.t)<8000&&Math.abs((mv.route[mv.route.length-1]||{}).x-pr.x)<40){delete PRED[id];continue}   // 이미 예상으로 걷고 있던 같은 이동이면 다시 시작하지 않음
      walk(slide,{id,from:mv.from,route:mv.route});MVPLAYED.push(id+':'+(mv.leave?'leave':mv.enter?'enter':'walk')+(ANIM[id]?':anim':':short'))}}
function drawChars(slide){try{imgFill()}catch(e){}
  const snap=slide&&slide._snap;if(!snap)return;const ov=q('.vv-ov',slide);if(!ov)return;ov.innerHTML='';
  const hid=slide.dataset.house,geo=snap.geo,L1=mkv('g',{class:'vv-lc'},ov),L2=mkv('g',{class:'vv-lb2'},ov);Object.keys(NODES).forEach(k=>delete NODES[k]);
  try{mvPlay(slide,hid)}catch(e){console.warn('[viv mv]',e)}
  const list=Viv.chars().filter(c=>{const p=Viv.getPlace(c.id);return p.house===hid&&(p.mode==='home'||ANIM[c.id])});
  list.sort((a,b)=>(a.id===selChar)-(b.id===selChar));
  if(!q('#vvucscan',ov)){const df=mkv('defs',{},ov),pt=mkv('pattern',{id:'vvucscan',width:4,height:4,patternUnits:'userSpaceOnUse'},df);mkv('rect',{width:4,height:1.2,fill:'rgba(255,255,255,.07)'},pt)}
  list.forEach(c=>{const v=ucView(c.id);if(v.miss&&v.miss.vanished){makeMiss(c,Viv.getPlace(c.id),geo,ov,slide,L1,v);return}makeChar(c,Viv.getPlace(c.id),geo,ov,slide,L1,L2)});
  guestChars(hid).forEach(c=>{const p=Viv.getPlace(c.id);if(p.house===hid&&(p.mode==='home'||ANIM[c.id]))makeChar(c,p,geo,ov,slide,L1,L2,true)});   // v25: 시뮬레이션에 참여하는 손님
  visitorsOf(hid).filter(c=>c.srvVisit).forEach(c=>{
    /* 서버가 그 집에서 실제로 계산한 손님의 위치·행동(가구·집 사람과 어울림)이 있으면 그대로 그리고, 아직 없으면(상대 집 계산 전) 임시 자리에 세운다 */
    if(c.gp&&c.gp.mode==='home'&&c.gp.x!=null){makeChar(c,{...c.gp,house:hid,mode:'home',h:c.gp.h||c.h||170,e:c.gp.e==null?null:c.gp.e,dy:0},geo,ov,slide,L1,L2,true);return}
    const gs=guestSpot(c,snap);makeChar(c,gs.p,geo,ov,slide,L1,L2,true);   // v22: 이웃집에 놀러 온 손님 — 현관으로 들어와 그 집 안에 서 있음(화면 표시 전용, 이 집 데이터는 바꾸지 않음)
    if(gs.enter){walk(slide,{id:c.id,from:gs.from,route:gs.route});const nd=NODES[c.id];if(nd)nd.lay()}});
  if(slide===qa('.vv-slide')[activeIdx]){renderOuts(slide);renderHood(slide);updNote(slide)}}
/* v18.1: 다음 행동 갱신까지 남은 시간 — 도면 화면 오른쪽 아래에 작은 글씨로 */
function updNote(slide){slide=slide||qa('.vv-slide')[activeIdx];if(!slide)return;const wrap=q('.vv-stagewrap',slide);if(!wrap||!slide._snap)return;
  let el=q('.vv-upd',wrap);const hid=slide.dataset.house;
  const ids=Viv.chars().filter(c=>{const p=Viv.getPlace(c.id);return p.house===hid&&p.mode==='home'&&!isMiss(c.id)}).map(c=>c.id);
  const now=Date.now(),ts=(selChar&&ids.includes(selChar)?[selChar]:ids).map(id=>{const st=Viv.getSim(id);return st&&st.decideAt>now?st.decideAt:0}).filter(Boolean);
  if(!ids.length){if(el)el.remove();return}
  if(!el){el=document.createElement('div');el.className='vv-upd';wrap.appendChild(el)}
  const m=ts.length?Math.max(1,Math.round((Math.min(...ts)-now)/60000)):0;
  el.textContent=m?`${m>=90?Math.round(m/60)+'시간':m+'분'} 뒤 행동이 갱신됩니다.`:'곧 행동이 갱신됩니다.'}
setInterval(()=>{if(typeof mode!=='undefined'&&mode==='viv'&&!document.hidden)updNote()},15000);
/* 집 밖·손님 말풍선(HTML): 두 줄을 넘으면 두 줄까지만 보이고 끝에 '...(더보기)'. 눌러서(또는 Enter/Space) 펼치고 접는다. 펼친 동안은 읽던 문장을 그대로 둔다. */
function bubClamp(box){qa('.bub .bt',box).forEach(t=>{const k=t.dataset.k,key='h:'+k.replace(/^g:/,''),bub=t.parentNode,st=BUBX[key];
    const full=[...t.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');bub.querySelectorAll('.bm').forEach(n=>n.remove());t.classList.remove('open');
    const open=!!(st&&st.open);if(open){t.classList.add('open')}
    else{t.classList.add('clamp');if(t.scrollHeight<=t.clientHeight+1){t.classList.remove('clamp');return}}
    const b=document.createElement('button');b.type='button';b.className='bm';b.textContent=open?'(접기)':'...(더보기)';b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'말풍선 접기':'말풍선 더보기');
    b.onclick=ev=>{ev.preventDefault();ev.stopPropagation();const s2=BUBX[key]||(BUBX[key]={});if(s2.open){s2.open=false;s2.text=null}else{s2.open=true;s2.text=full}bubClamp(box)};
    b.onpointerdown=ev=>ev.stopPropagation();(open?bub:t).appendChild(b);t.classList.toggle('clamp',!open)})}
function renderOuts(slide){const el=q('#vvOuts');if(el){el.hidden=true;el.innerHTML=''}
  const wrap=q('.vv-stagewrap',slide);if(!wrap)return;let box=q('.vv-outtop',wrap);
  const hid=slide.dataset.house;const outs=Viv.chars().filter(c=>{const p=Viv.getPlace(c.id);return p.house===hid&&p.mode==='out'&&!ANIM[c.id]});
  const gh=guestHtml(hid);
  if(!outs.length&&!gh){if(box)box.remove();return}
  if(!box){box=document.createElement('div');box.className='vv-outtop';wrap.appendChild(box)}
  // 집 밖에 있는 캐릭터: 도면에는 없고, 화면 왼쪽 위에 그림과 말풍선으로 나란히 보임 (같이 나간 사이면 붙어서)
  box.innerHTML=outs.map(c=>{const p=Viv.getPlace(c.id),img=IMG[c.id];return `<div class="vv-out1" data-id="${esc(c.id)}">${img?`<img src="${img}" alt="" onerror="VivUI.imgBad('${esc(c.id)}')">`:`<span class="ph">${esc([...c.name][0]||'?')}</span>`}<div class="bub"><b>${esc(c.name)}</b><span class="bt" data-k="${esc(c.id)}">${esc(BUBX['h:'+c.id]&&BUBX['h:'+c.id].open&&BUBX['h:'+c.id].text?BUBX['h:'+c.id].text:outSay(c,p))}</span></div></div>`}).join('')+gh;bubClamp(box);qa('.vv-g1',box).forEach(e=>{e.style.cursor='pointer';e.onclick=()=>{selChar=e.dataset.id;try{drawChars(slide)}catch(x){}renderList();renderDetail()}})}   // 손님 칩을 눌러도 그 손님이 선택됨(도면 위 캐릭터를 눌러야만 선택되던 것 보완)
/* 이웃집에 놀러 간 캐릭터: 그 집에서 실제로 하고 있는 행동 문구를 우리 집 화면에도 똑같이 보여 줌 */
function outSay(c,p){if(p.verb==='out_visit'&&Viv.guestHas&&Viv.guestHas('vg:'+c.id)){const gp=Viv.getPlace('vg:'+c.id);if(gp&&gp.mode==='home'&&gp.say){const hn=houseOf(gp.house);return (hn?hn.name+' · ':'')+gp.say}}return p.say||'외출 중이에요'}
function makeChar(c,p,geo,ov,slide,L1,L2,guest){
  const g=mkv('g',{class:'vv-ch'+(selChar===c.id?' sel':''),'data-id':c.id},L1),rot=mkv('g',{},g);
  const img=IMG[c.id]?mkv('image',{href:IMG[c.id],preserveAspectRatio:'xMidYMid meet'},rot):null;if(img)img.addEventListener('error',()=>imgBad(c.id));
  const ph=img?null:mkv('rect',{rx:6,fill:'#ececea',stroke:'#1c1c1c','stroke-width':1.2},rot),ini=img?null:mkv('text',{'text-anchor':'middle','font-weight':'700',fill:'#444'},rot);if(ini)ini.textContent=[...c.name][0]||'?';
  const hit=mkv('rect',{fill:'transparent'},g),out=mkv('rect',{class:'vv-out',fill:'none','pointer-events':'none'},g),hd=mkv('circle',{class:'vv-handle'},g);
  const fx0=sayFx[c.id]&&sayFx[c.id].until>Date.now()?sayFx[c.id].text:null;let say=p.mode==='home'&&(fx0||p.say)?(fx0||p.say):'',bx0=BUBX[c.id],sayNow=()=>bx0&&bx0.open&&bx0.text?bx0.text:say;
  const bub=mkv('g',{class:'vv-bub'+(selChar===c.id?' sel':'')},L2),bR=mkv('path',{},bub),nm=mkv('text',{class:'nm'},bub),lt=[],mt=mkv('text',{class:'more'},bub);
  bub.style.setProperty('--vv-acc',palAcc());nm.textContent=c.name+(guest?' · 손님':'');
  const tog=ev=>{ev.preventDefault();ev.stopPropagation();const s2=BUBX[c.id]||(BUBX[c.id]={});if(s2.open){s2.open=false;s2.text=null}else{s2.open=true;s2.text=say}bx0=s2;lay()};   // 드래그·이동·크기·행동에는 영향 없음
  bub.addEventListener('pointerdown',ev=>{if(bub.classList.contains('more'))ev.stopPropagation()});bub.addEventListener('click',tog);
  bub.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){tog(ev)}});
  const snap=slide._snap,ref={c,p:{...p},geo,lay};NODES[c.id]=ref;
  function lay(){const b=charBox(c,ref.p,geo),top=-b.e-b.h,fs=Math.max(9,geo.W/62),vx=b.x-b.vw/2,vt=-b.e-b.vh;
    if(b.pose==='lie')rot.setAttribute('transform',`translate(${b.h/2} ${-b.w/2}) rotate(-90 ${b.x} ${-b.e})`);else rot.removeAttribute('transform');
    if(img){img.setAttribute('x',b.x-b.w/2);img.setAttribute('y',top);img.setAttribute('width',b.w);img.setAttribute('height',b.h)}
    if(ph){ph.setAttribute('x',b.x-b.w/2);ph.setAttribute('y',top);ph.setAttribute('width',b.w);ph.setAttribute('height',b.h);ini.setAttribute('x',b.x);ini.setAttribute('y',top+b.h/2+b.h*.15);ini.setAttribute('font-size',b.h*.45)}
    for(const r of [hit,out]){r.setAttribute('x',vx);r.setAttribute('y',vt);r.setAttribute('width',b.vw);r.setAttribute('height',b.vh)}
    out.setAttribute('stroke-width',Math.max(1,geo.W/700));out.setAttribute('stroke-dasharray',`${geo.W/200} ${geo.W/300}`);
    hd.setAttribute('cx',vx+b.vw);hd.setAttribute('cy',vt);hd.setAttribute('r',Math.max(6,geo.W/130));hd.setAttribute('visibility',!guest&&b.pose==='stand'&&!ANIM[c.id]&&canEdit(c)?'visible':'hidden');
    if(!say){bub.setAttribute('visibility','hidden');return b}
    bub.setAttribute('visibility','visible');
    const full=wrapPx(sayNow(),fs*16,fs),opened=!!(bx0&&bx0.open&&bx0.text),long_=full.length>2;let lines=full,mtxt='',mfs=fs*.78;
    if(long_&&!opened){const suf='...(더보기)';let l2=full[1];while(l2&&mw(l2,fs)+mw(suf,mfs)>fs*16)l2=l2.slice(0,-1);lines=[full[0],l2];mtxt=suf}
    else if(long_&&opened){lines=full.concat(['']);mtxt='(접기)'}
    while(lt.length<lines.length)lt.push(mkv('text',{},bub));while(lt.length>lines.length)lt.pop().remove();
    lines.forEach((l,i)=>lt[i].textContent=l);
    bub.classList.toggle('more',long_);if(long_){bub.setAttribute('tabindex','0');bub.setAttribute('role','button');bub.setAttribute('aria-expanded',String(opened));bub.setAttribute('aria-label',(opened?'말풍선 접기: ':'말풍선 더보기: ')+c.name)}else{bub.removeAttribute('tabindex');bub.removeAttribute('role');bub.removeAttribute('aria-expanded');bub.removeAttribute('aria-label')}
    const lh=fs*1.3,pad=fs*.55,w=Math.max(mw(c.name,fs),...lines.map(l=>mw(l,fs)),long_&&!opened?mw(lines[1]||'',fs)+mw(mtxt,mfs):0)+pad*2,h=lh*(1+lines.length)+pad*1.1,tail=fs*.75;
    const yL=geo.yard&&geo.yard.L?geo.yard.L.l:geo.in0,yR=geo.yard&&geo.yard.R?geo.yard.R.r:geo.in1,bx=Math.min(Math.max(b.x-w/2,Math.min(geo.in0,yL)-30),Math.max(geo.in1,yR)+30-w),by=vt-tail-h-2,tx=Math.min(Math.max(b.x,bx+pad+fs*.4),bx+w-pad-fs*.4);
    {const r=4,x2=bx+w,y2=by+h,t1=tx-fs*.4,t2=tx+fs*.4;   // 말풍선과 꼬리를 하나의 윤곽선으로 그려 꼬리 밑에 가로선이 남지 않게 함
     bR.setAttribute('d',`M${bx+r} ${by}H${x2-r}Q${x2} ${by} ${x2} ${by+r}V${y2-r}Q${x2} ${y2} ${x2-r} ${y2}H${t2}L${b.x} ${y2+tail}L${t1} ${y2}H${bx+r}Q${bx} ${y2} ${bx} ${y2-r}V${by+r}Q${bx} ${by} ${bx+r} ${by}Z`)}
    nm.setAttribute('font-size',fs);nm.setAttribute('x',bx+pad);nm.setAttribute('y',by+pad*.55+lh*.85);
    lt.forEach((t,i)=>{t.setAttribute('font-size',fs);t.setAttribute('x',bx+pad);t.setAttribute('y',by+pad*.55+lh*(1.85+i))});
    mt.textContent=mtxt;mt.setAttribute('font-size',mfs);mt.setAttribute('visibility',mtxt?'visible':'hidden');
    if(mtxt){const li=lines.length-1;mt.setAttribute('x',opened?bx+pad:bx+pad+mw(lines[li],fs)+1);mt.setAttribute('y',by+pad*.55+lh*(1.85+li))}
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
    if(selChar!==c.id){selChar=c.id;qa('.vv-ch.sel',ov).forEach(n=>n.classList.remove('sel'));qa('.vv-bub.sel',ov).forEach(n=>n.classList.remove('sel'));g.classList.add('sel');bub.classList.add('sel');renderList();renderDetail()}
    if(guest||!canEdit(c))return;   // 남의 캐릭터·방문 중인 손님은 선택해서 볼 수만 있음
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
/* v17: 반려동물은 프로필 맨 앞의 표식([반려:종|반려인id])으로 구분 — 화면에는 표식을 뺀 프로필만 보여 줌 */
const toSimChar=c=>{const t=Sim.parsePet(c.profile||'');return {id:c.id,name:c.name,profile:t.profile,pet:t.pet}};
const petOfChar=c=>Sim.parsePet(c.profile||'').pet;
const profText=c=>Sim.parsePet(c.profile||'').profile;
/* 프로필 탭의 「종류」: 사람 ↔ 반려동물, 동물 종, 반려인을 바로 고친다(프로필 앞머리의 [반려:종|반려인] 표시를 바꾸는 방식이라 기존 저장 경로·서버 공유 그대로) */
function kindEditHtml(c,pet){
  const owners=(c.remote?Viv.chars().filter(x=>x.remote&&x.hid===c.hid):Viv.localChars()).filter(x=>!petOfChar(x)&&x.id!==c.id);
  return `<div class="vv-kind vd-kind" id="vdKind"><div class="vv-kindrow"><span>종류</span><label class="inl"><input type="radio" name="vdKindR" value="person" ${pet?'':'checked'}> 사람</label><label class="inl"><input type="radio" name="vdKindR" value="pet" ${pet?'checked':''}> 반려동물</label></div>
  <div id="vdPetOpt" ${pet?'':'hidden'}><label>동물 종 <select id="vdSp">${Sim.SPECIES_IDS.map(k=>`<option value="${k}" ${pet&&pet.sp===k?'selected':''}>${esc(Sim.SPECIES[k].n)}</option>`).join('')}</select></label>
  <label>반려인 <select id="vdOwner"><option value="">(아직 정하지 않음)</option>${owners.map(o=>`<option value="${esc(o.id)}" ${pet&&pet.owner===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label></div></div>`}
function kindEditBind(el,c,pet,quick){
  const box=q('#vdKind',el);if(!box)return;
  const apply=async(toPet,spChanged)=>{
    const sp=q('#vdSp',box).value,ow=q('#vdOwner',box).value||null;
    if(toPet&&!pet){const mine=Viv.chars().filter(o=>{const t=petOfChar(o);return t&&t.owner===c.id}).length;
      if(mine&&!confirm(`'${c.name}'을(를) 반려인으로 둔 반려동물이 ${mine}마리 있어요. 반려동물로 바꾸면 그 연결이 사라져요. 계속할까요?`)){renderDetail();return}}
    try{await quick({name:c.name,profile:(toPet?Sim.petTag(sp,ow):'')+profText(c)},null);
      if(toPet&&(!pet||spChanged))Viv.setPlace(c.id,{h:Sim.SPECIES[sp].h});   // 사람→동물, 종 변경이면 그 종의 기본 크기로
      else if(!toPet&&pet)Viv.setPlace(c.id,{h:120});                          // 동물→사람이면 사람 기본 크기로
      if(!toPet||!pet)Viv.setSim(c.id,{decideAt:0,then:null,wish:null,outUntil:0});
      const i=houses.findIndex(h2=>h2.id===Viv.getPlace(c.id).house);if(i>=0)runSim(i,false);
      const s2=qa('.vv-slide')[activeIdx];s2&&drawChars(s2);renderList();renderDetail()}
    catch(ex){note(ex.message||String(ex),'warn');renderDetail()}};
  qa('input[name=vdKindR]',box).forEach(r=>r.onchange=()=>{const toPet=q('input[name=vdKindR]:checked',box).value==='pet';q('#vdPetOpt',box).hidden=!toPet;apply(toPet,false)});
  q('#vdSp',box).onchange=()=>{if(q('input[name=vdKindR]:checked',box).value==='pet')apply(true,true)};
  q('#vdOwner',box).onchange=()=>{if(q('input[name=vdKindR]:checked',box).value==='pet')apply(true,false)}}
const withTag=(c,text)=>{const t=petOfChar(c);return t?Sim.petTag(t.sp,t.owner)+text:text};
const humansIn=hid=>inHouse(hid).map(toSimChar).filter(c=>!c.pet);
const inHouse=hid=>Viv.chars().filter(c=>Viv.getPlace(c.id).house===hid);
function simCtx(h,snap){const all=inHouse(h.id).filter(c=>!isMiss(c.id)).map(toSimChar).concat(guestChars(h.id).map(toSimChar));
  return {now:Date.now(),world:snap.world,houseId:h.id,guests:(()=>{try{return visitorsOf(h.id).filter(c=>c.srvVisit).map(c=>{const g=guestSpot(c,snap,true);return {id:c.id,name:c.name,f:g.p.f,x:g.p.x}})}catch(e){return []}})(),chars:all,getPlace:Viv.getPlace,setPlace:Viv.setPlace,getSim:Viv.getSim,setSim:Viv.setSim,neighbors:nbFor(h.id).map(x=>({hid:x.id,name:x.name})),analysis:c=>Sim.analyze(c.profile,c.name,all.filter(o=>!o.pet)),mind:window.Mind?guestMind(Mind.hooks(Mind.store.get(),Date.now())):null,unc:ucHooks()}}
/* 이웃집에 놀러 간 손님('vg:…' 사본)도 원래 캐릭터의 마음으로 지문(혼자 있을 때·대화·외출·서성임)이 붙도록, 지문 훅에 넘기는 id 를 원래 id 로 바꾼다 */
function guestMind(m){if(!m)return m;const raw=id=>String(id||'').startsWith('vg:')?String(id).slice(3):id,nmW=nm=>typeof nm==='function'?(id=>nm(id)||nm('vg:'+id)||((Viv.char(raw(id))||{}).name||'')):nm;
  const w=(k,f)=>{const o=m[k];if(typeof o==='function')m[k]=f(o)};
  w('tone',o=>(c,v,A,nm)=>o(raw(c),v,A,nmW(nm)));w('alt',o=>(c,v,A,room,nm)=>o(raw(c),v,A,room,nmW(nm)));
  w('talk',o=>(c,pid,A,nm)=>o(raw(c),raw(pid),A,nmW(nm)));w('petTone',o=>(c,pn,A,nm)=>o(raw(c),pn,A,nmW(nm)));w('out',o=>(c,A,nm)=>o(raw(c),A,nmW(nm)));
  w('groupMul',o=>(c,g)=>o(raw(c),g));return m}

/* ---------- v23 위화감 (viv-uncanny.js · 별도 저장소 viv.unc.v1) ----------
   모든 연출은 화면 위의 임시 요소/클래스로만 그리고, 이미지 파일·캐릭터 데이터·도면은 바꾸지 않는다.
   '존재 오류(404)'는 캐릭터를 지우는 게 아니라 viv.unc.v1 에 표시 상태만 기록한다(복구되면 그대로 다시 보임). */
const UC=()=>window.Uncanny||null;
const ucView=id=>{const U=UC();return U?U.view(U.store.get(),id,Date.now()):{st:'stable',miss:null,flash:null}};
const isMiss=id=>!!ucView(id).miss;
const calmMotion=()=>{try{return matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){return false}};
let watch={cid:null,since:0};
function ucWatch(){const now=Date.now();if(document.hidden||mode!=='viv'||!selChar||isMiss(selChar)){watch={cid:null,since:0};return null}   // 실제로 추적되는 행동: 지금 선택해서 보고 있는 캐릭터와 그 시간
  if(watch.cid!==selChar)watch={cid:selChar,since:now};return {cid:watch.cid,sec:Math.round((now-watch.since)/1000)}}
const ucEmo=(cid,k)=>{const M=MD();if(!M)return 0;try{const e=M.store.get().emo[cid];return e&&e.lv[k]?e.lv[k].v:0}catch(x){return 0}};
function ucHooks(){const U=UC();return U?U.hooks(U.store.get(),Date.now(),{emo:ucEmo,watch:ucWatch()}):null}
const ucRand=(()=>{let a=(Date.now()&0xffffff)|1;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();
/* 이름·문구 일부를 손상된 것처럼 보이게(표시 전용) */
function ucGarble(t,seed){t=String(t||'');const ch=[...t],r=(()=>{let a=(seed|0)+7;return()=>{a=a+0x6D2B79F5|0;let x=Math.imul(a^a>>>15,1|a);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296}})();
  const out=ch.map((c,i)=>/\s/.test(c)?c:(r()<.45?'█▓▒░?#'[Math.floor(r()*6)]:c));if(out.join('')===t&&out.length)out[Math.floor(r()*out.length)]='█';return out.join('')}
/* 한 캐릭터의 이미지에 잠깐 생기는 글리치(수평 조각 이동·색 분리·블록 누락·투명도 변화). 원본 <image> 위에 임시 복사본만 얹고 끝나면 모두 지운다. */
let GID=0;
function ucGlitch(cid,sev,ms){
  if(calmMotion())return;
  const slide=qa('.vv-slide')[activeIdx],ov=slide&&q('.vv-ov',slide),g=ov&&ov.querySelector(`.vv-ch[data-id="${(window.CSS&&CSS.escape)?CSS.escape(cid):cid}"]`);if(!g)return;
  const rot=g.firstChild,img=rot&&rot.querySelector('image');if(!img)return;
  const X=+img.getAttribute('x'),Y=+img.getAttribute('y'),W=+img.getAttribute('width'),H=+img.getAttribute('height');if(!(W>0&&H>0))return;
  if(sev>=2){ucPixStage(img,ms||(260+sev*140),sev)}   // 크게 깨질 때는 픽셀 단위 효과를 함께
  const added=[],id=++GID,href=img.getAttribute('href');ms=ms||(180+sev*110);
  const defs=mkv('defs',{},rot);added.push(defs);
  const n=2+sev,r=ucRand;
  for(let i=0;i<n;i++){const y0=Y+r()*H*.85,h=H*(.03+r()*.09),cp=mkv('clipPath',{id:`uc${id}_${i}`},defs);mkv('rect',{x:X-W*.4,y:y0,width:W*1.8,height:h},cp);
    const cp2=mkv('image',{href,x:X+(r()-.5)*W*.4,y:Y,width:W,height:H,preserveAspectRatio:'xMidYMid meet','clip-path':`url(#uc${id}_${i})`},rot);added.push(cp2)}
  if(sev>=2||r()<.4){[['sepia(1) saturate(7) hue-rotate(-55deg)',-1],['sepia(1) saturate(7) hue-rotate(150deg)',1]].forEach(([f,d])=>{const c2=mkv('image',{href,x:X+d*W*.035,y:Y,width:W,height:H,preserveAspectRatio:'xMidYMid meet',opacity:.5,style:`filter:${f};mix-blend-mode:screen`},rot);added.push(c2)})}
  const mk=mkv('mask',{id:`ucm${id}`,maskUnits:'userSpaceOnUse',x:X-W,y:Y-H*.1,width:W*3,height:H*1.2},defs);mkv('rect',{x:X-W,y:Y-H*.1,width:W*3,height:H*1.2,fill:'#fff'},mk);
  for(let i=0;i<sev*3;i++){const bw=W*(.06+r()*.12),bh=H*(.03+r()*.07);mkv('rect',{x:X+r()*(W-bw),y:Y+r()*(H-bh),width:bw,height:bh,fill:'#000'},mk)}
  img.setAttribute('mask',`url(#ucm${id})`);const op0=img.style.opacity;if(r()<.5)img.style.opacity=String(.55+r()*.3);
  setTimeout(()=>{added.forEach(n2=>n2.remove());try{img.removeAttribute('mask');img.style.opacity=op0||''}catch(e){}},ms)}
/* 화면 전체에 잠깐 지나가는 노이즈(404 직전). 도면·UI 레이어 위에 얹는 임시 요소 */
function ucNoise(ms){if(calmMotion())return;const w=q('.vv-stagewrap',qa('.vv-slide')[activeIdx]||document);if(!w)return;
  const d=document.createElement('div');d.className='vv-ucnoise';w.appendChild(d);setTimeout(()=>d.remove(),ms||900)}
let sayFx={},clockFx=0;
const ucSlide=()=>qa('.vv-slide')[activeIdx];
function ucRefresh(){const s=ucSlide();if(s)drawChars(s);renderList();renderDetail()}
function ucFx(f){
  const U=UC();if(!U)return;
  if(f.k==='blip'){if(f.cid&&!isMiss(f.cid))ucGlitch(f.cid,f.sev||1)}
  else if(f.k==='vanish'){   // 5-1: 멈춤 → 글리치/노이즈 → 사라짐 → 오류 문구
    const c=Viv.char(f.cid);if(!c)return;sayFx[f.cid]={text:'…',until:Date.now()+8000};
    const s=ucSlide();if(s)drawChars(s);
    const van=f.van||2200;[0,.28,.55,.8].forEach((t,i)=>setTimeout(()=>ucGlitch(f.cid,i<2?2:3,260),van*t));
    setTimeout(()=>ucNoise(Math.min(1100,van)),Math.max(0,van*.3));
    setTimeout(()=>{ucRefresh()},van+40)}
  else if(f.k==='return'){const c=Viv.char(f.cid);if(!c)return;const v=ucView(f.cid);if(v.flash&&v.flash.say&&v.flash.say[0])sayFx[f.cid]={text:v.flash.say[0],until:Date.now()+9000};
    const p=Viv.getPlace(f.cid);if(p.mode==='home'){const st=Viv.getSim(f.cid);Viv.setSim(f.cid,{dirty:true})}   // 복귀 후 곧바로 다음 행동을 정함(원본 위치·진행 상황은 그대로)
    ucRefresh();setTimeout(()=>{ucGlitch(f.cid,2,300);ucNoise(500)},120)}
  else if(f.k==='stare'){const U2=UC();sayFx[f.cid]={text:'화면 너머를 바라보듯 정면을 가만히 응시하는 중',until:Date.now()+110000};const s=ucSlide();if(s)drawChars(s);setTimeout(()=>ucGlitch(f.cid,1,200),300)}
  else if(f.k==='misread'){if(selChar!==f.cid)return;const t=q('#vvDetail h3,#vvDetail .vx-head h3');if(!t||t.dataset.uc)return;const c=Viv.char(f.cid);if(!c)return;
    const orig=t.textContent;t.dataset.uc='1';t.textContent=ucGarble(orig,Date.now()%997);const dd=qa('#vvDetail dd').slice(0,2).map(e=>[e,e.textContent]);dd.forEach(([e])=>{e.textContent='ENTITY STATUS: UNKNOWN'});
    setTimeout(()=>{if(t.dataset.uc){t.textContent=orig;delete t.dataset.uc;dd.forEach(([e,v])=>{if(e.isConnected)e.textContent=v})}},calmMotion()?1500:2200)}
  else if(f.k==='clock'){clockFx=Date.now()+5000;tick();setTimeout(tick,5100)}
  else if(f.k==='sky'){const st=q('.vv-stage',ucSlide()||document);if(st){st.classList.add('unc-sky');setTimeout(()=>st.classList.remove('unc-sky'),calmMotion()?4000:22000)}}
  else if(f.k==='shift'){const s=ucSlide(),im=s&&q('.vv-bg',s);if(!im||calmMotion())return;const gh=im.cloneNode(false);gh.removeAttribute('id');gh.className='vv-bg vv-ucghost';gh.style.cssText=`position:absolute;inset:0;width:100%;height:100%;opacity:.18;mix-blend-mode:multiply;transform:scaleX(-1);pointer-events:none;z-index:2`;
    im.parentNode.appendChild(gh);setTimeout(()=>{gh.style.opacity='.0'},1100);setTimeout(()=>gh.remove(),1700)}}
/* 틱마다: 심리 상태 갱신 → 화면 연출 */
function uncStep(h){
  const U=UC();if(!U)return;
  try{const st=U.store.get(),now=Date.now(),chars=humansIn(h.id);if(!chars.length)return;
    const env={now,chars:chars.map(c=>{const p=Viv.getPlace(c.id);return {id:c.id,A:Sim.analyze(c.profile,c.name,chars),home:p.mode==='home',sleeping:p.action==='sleep',verb:p.verb}}),emo:ucEmo,watch:ucWatch()};
    const r=U.update(st,env);if(r.dirty||r.fx.length)U.store.save();else U.store.save();
    r.fx.forEach(ucFx)}catch(e){console.error('[viv unc]',e)}}
/* 존재 오류 상태의 캐릭터 표시(도면): 원래 자리에 오류 문구 상자. 클릭하면 선택됨 */
function makeMiss(c,p,geo,ov,slide,L1,v){
  const b=charBox(c,p,geo),fs=Math.max(8,geo.W/80),g=mkv('g',{class:'vv-ucx'+(selChar===c.id?' sel':''),'data-id':c.id,style:'cursor:pointer'},L1);
  const w=Math.max(b.w,fs*9),x=b.x-w/2,y=-b.e-b.h;
  mkv('rect',{x,y,width:w,height:b.h,fill:'rgba(12,12,14,.88)',stroke:'#7c7c7c','stroke-width':Math.max(1,geo.W/800),'stroke-dasharray':`${geo.W/220} ${geo.W/330}`},g);
  const words=String(v.miss.msgStage).split(/(?<= )|(?<=—)/),lines=[];let cur='';words.forEach(wd=>{if((cur+wd).length*fs*.62>w-fs){if(cur)lines.push(cur.trim());cur=wd}else cur+=wd});if(cur)lines.push(cur.trim());
  const ty=y+b.h/2-(lines.length-1)*fs*.6;
  lines.forEach((l,i)=>{const t=mkv('text',{x:b.x,y:ty+i*fs*1.25,'text-anchor':'middle','font-family':'ui-monospace,Menlo,Consolas,monospace','font-size':fs,fill:'#d7d7d2'},g);t.textContent=l});
  const er=mkv('text',{x:x+fs*.4,y:y+fs*1.1,'font-family':'ui-monospace,Menlo,Consolas,monospace','font-size':fs*.8,fill:'#b0443c'},g);er.textContent='ERR';
  mkv('rect',{x,y,width:w,height:b.h,fill:'url(#vvucscan)'},g);
  /* 계속 흔들리는 표시: 글씨의 빨강·청록 색 분리, 가로 찢김 막대, 깜빡이는 픽셀 블록 (CSS 애니메이션만 사용 — 눌러볼 수 있는 동작은 그대로) */
  {const o=(fs*.16).toFixed(2),rr=(()=>{let a=(v.miss.nid|0)+3;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();
   g.style.setProperty('--o',o+'px');
   [['ucx-r','#ff2a55'],['ucx-c','#18e0d0']].forEach(([k,col])=>lines.forEach((l,i)=>{const t=mkv('text',{x:b.x,y:ty+i*fs*1.25,'text-anchor':'middle','font-family':'ui-monospace,Menlo,Consolas,monospace','font-size':fs,fill:col,class:'ucx-ch '+k},g);t.textContent=l}));
   for(let i=0;i<5;i++){const bh=Math.max(1,b.h*(.02+rr()*.05)),by=y+rr()*(b.h-bh);const bar=mkv('rect',{x:x-w*.05,y:by,width:w*(.5+rr()*.6),height:bh,class:'ucx-bar',fill:rr()<.5?'#ff2a55':'#18e0d0'},g);bar.style.animationDelay=(rr()*3).toFixed(2)+'s'}
   const px=Math.max(2,Math.min(w,b.h)/9);for(let i=0;i<16;i++){const sq=mkv('rect',{x:x+Math.floor(rr()*(w/px))*px,y:y+Math.floor(rr()*(b.h/px))*px,width:px,height:px,class:'ucx-px',fill:['#d7d7d2','#ff2a55','#18e0d0','#444'][Math.floor(rr()*4)]},g);sq.style.animationDelay=(rr()*2.4).toFixed(2)+'s'}}
  g.addEventListener('click',()=>{if(selChar!==c.id){selChar=c.id;qa('.vv-ucx.sel',ov).forEach(n=>n.classList.remove('sel'));g.classList.add('sel');renderList();renderDetail()}})}

/* ---------- v16 감정·관계·기억 (viv-mind.js · 도면/캐릭터/시뮬레이션 상태와 별도 저장소 viv.mind.v1) ---------- */
const MD=()=>window.Mind||null;
const gRaw=id=>String(id||'').startsWith('vg:')?String(id).slice(3):id;   // 방문 손님 사본('vg:…')은 마음 기록에서는 원래 캐릭터 id 로 다룸
function mindSnap(hid){const o={};inHouse(hid).filter(c=>!petOfChar(c)).forEach(c=>{const st=Viv.getSim(c.id);o[c.id]={n:st.n||0,outAt:st.outAt||0}});
  try{guestChars(hid).forEach(g=>{const st=Viv.getSim(g.id);o[g.realId]={n:st.n||0,outAt:st.outAt||0}})}catch(e){}return o}
/* v29 갈 수 있는 곳(구역 연결) 정보: 출구에 닿을 수 없으면 '갇힘', 닿을 수 있는 구역·전화기 유무를 마음 쪽에 넘김 */
function reachInfo(W,sg){if(!sg||!W.reach)return {};try{const R=W.reach(sg.id);const exitOK=!W.exits.length||W.exits.some(e=>{const s2=W.segAt(e.f,e.x);return s2&&R.has(s2.id)});
  return {trap:!exitOK,rch:[...R],fk:new Set((W.items||[]).filter(it=>R.has(it.seg)).flatMap(it=>(it.kinds||[]).filter(k=>k!=='door'&&k!=='window'))).size,ph:(W.items||[]).some(it=>it.kinds&&it.kinds.includes('phone')&&R.has(it.seg))}}catch(e){return {}}}
function mindStep(h,snap,prev){
  const M=MD();if(!M||!snap||!snap.world)return;
  try{const chars=humansIn(h.id).filter(c=>!isMiss(c.id)&&!Viv.guestHas('vg:'+c.id));   // 이웃집에 놀러 가 있는 동안은 그 집 쪽에서 계산
    if(!chars.length)return;
    const W=snap.world,cur={};
    /* v24 이웃 방문: 놀러 온 손님도 이 집 캐릭터와 같은 방에 있으면 감정·관계·기억이 쌓인다(원래 캐릭터 id 로 저장되어 방문이 끝난 뒤에도 남음) */
    const gsts=[];try{guestChars(h.id).forEach(g=>{if(chars.some(c=>c.id===g.realId))return;const rc=Viv.char(g.realId);if(!rc)return;chars.push(toSimChar(rc));gsts.push(g)})}catch(e){}
    gsts.forEach(g=>{const p=Viv.getPlace(g.id),st=Viv.getSim(g.id),sg=p.mode==='home'?W.segAt(p.f|0,p.x==null?W.mid:p.x):null;
      cur[g.realId]={mode:p.mode,action:p.action,verb:p.verb,seg:sg?sg.id:null,segName:sg?sg.name:'',partner:chars.some(o=>o.id===gRaw(p.partner))?gRaw(p.partner):null,say:p.say||'',n:st.n||0,outAt:st.outAt||0,...reachInfo(W,sg),wh:st.wishHist||[]}});
    chars.forEach(c=>{if(gsts.some(g=>g.realId===c.id))return;const p=Viv.getPlace(c.id),st=Viv.getSim(c.id),sg=p.mode==='home'?W.segAt(p.f|0,p.x==null?W.mid:p.x):null;
      cur[c.id]={mode:p.mode,action:p.action,verb:p.verb,seg:sg?sg.id:null,segName:sg?sg.name:'',partner:chars.some(o=>o.id===gRaw(p.partner))?gRaw(p.partner):null,say:p.say||'',n:st.n||0,outAt:st.outAt||0,...reachInfo(W,sg),wh:st.wishHist||[]}});
    const sp=Viv.seoul(new Date()),A=c=>Sim.analyze(c.profile,c.name,chars);
    M.update(M.store.get(),{now:Date.now(),hour:sp.hour+sp.minute/60,day:`${sp.year}-${sp.month}-${sp.day}`,chars,A,cur,prev:prev||{},unc:cid=>{const U2=UC();return U2&&U2.mood?U2.mood(U2.store.get(),cid,Date.now()):null},stay:cid=>{const U2=UC();if(!U2||!U2.dayNum)return 0;try{const u=(U2.store.get().u||{})[cid];return u&&u.since!=null?Math.max(0,U2.dayNum(Date.now())-U2.dayNum(u.since)):0}catch(e){return 0}}});
    /* v19: 고백·프로포즈 결과가 새로 생기면 한 번 알려 준다(관계 상태는 직접 확인하기 전에는 바뀌지 않음) */
    try{const st=M.store.get(),ids=new Set(chars.map(c=>c.id));
      for(const k of Object.keys(st.rev||{})){const rv=st.rev[k],g=rv&&rv.sug;if(!g||g.shown)continue;const [x,y]=k.split('|');if(!ids.has(x)||!ids.has(y))continue;g.shown=1;note(g.text+' (캐릭터를 누르고 관계에서 확인할 수 있어요)')}}catch(e){}
    /* v20: 아르바이트 중 희귀 사건(수상한 제안)이 생기면 불안함에 반영하고 한 번 알려 준다 — 캐릭터는 제안을 거절함 */
    try{const st0=M.store.get();chars.forEach(c=>{const sm=Viv.getSim(c.id);if(sm.ptOdd&&sm.ptOddAt&&sm.ptOddSeen!==sm.ptOddAt){Viv.setSim(c.id,{ptOddSeen:sm.ptOddAt});
      M.addEmo(st0,c.id,'anxious',34,'아르바이트 중 수상한 제안을 받아서',Date.now(),A(c));note(c.name+'이(가) 알바 중 수상한 제안을 받았지만 거절했어요. 한동안 마음이 불안할 수 있어요')}})}catch(e){}
    M.store.save()}catch(e){console.error('[viv mind]',e)}}
const mindTime=ts=>{if(!ts)return '-';const sp=Viv.seoul(new Date(ts)),ago=Date.now()-ts;
  const r=ago<60000?'방금':ago<3600000?Math.round(ago/60000)+'분 전':ago<86400000?Math.floor(ago/3600000)+'시간 전':Math.floor(ago/86400000)+'일 전';return `${sp.month}/${sp.day} ${sp.text} · ${r}`};
let mindSel=null;
const powLabel=p=>p>=60?'큼':p>=30?'보통':'작음';
/* v19: 연애 상태(짝사랑·맞짝사랑·외사랑·연인·부부) 세부 설정. 이 두 캐릭터 쌍에만 적용되고 다른 관계는 그대로다 */
function romPanel(M,r,c,other){
  const R=r.rom||{k:'none',label:'',from:null,me:{lv:0,kn:0},them:{lv:0,kn:0},sug:null};
  const jg=n=>{const ch=String(n).trim().slice(-1).charCodeAt(0);return ch>=0xAC00&&ch<=0xD7A3&&(ch-0xAC00)%28!==0};
  const eul=n=>n+(jg(n)?'을':'를'),eun=n=>n+(jg(n)?'은':'는'),iga=n=>n+(jg(n)?'이':'가');
  const cn=esc(c.name),on=esc(other);
  const cur=R.k==='none'?'none':R.k==='crush'?(R.from===c.id?'crush_c':'crush_o'):R.k==='oneside'?(R.from===c.id?'oneside_c':'oneside_o'):R.k;
  const opts=[['none','없음 (연애 감정 없음)'],['crush_c',`짝사랑 — ${c.name}만 ${eul(other)} 좋아함 (${eun(other)} 몰라요)`],['crush_o',`짝사랑 — ${other}만 ${eul(c.name)} 좋아함 (${eun(c.name)} 몰라요)`],
    ['mutual','맞짝사랑 — 서로 좋아하지만 둘 다 모름'],['oneside_c',`외사랑 — ${c.name}만 좋아함 (${eun(other)} 알면서 친구·가족으로만 대함)`],['oneside_o',`외사랑 — ${other}만 좋아함 (${eun(c.name)} 알면서 친구·가족으로만 대함)`],['lover','연인 — 서로 좋아하고 서로 마음을 앎'],['spouse','부부 — 결혼한 사이']];
  const known=!opts.some(x=>x[0]===cur);
  const desc={none:'연애 감정이 설정되어 있지 않아요. 이 쌍에만 적용되고 다른 캐릭터와의 관계는 바뀌지 않아요.',crush:`${esc(R.from===c.id?c.name:other)}만 ${esc(eul(R.from===c.id?other:c.name))} 좋아해요. 상대는 그 마음을 몰라요.`,
    oneside:`${esc(R.from===c.id?c.name:other)}만 ${esc(eul(R.from===c.id?other:c.name))} 좋아해요. 상대는 그 마음을 알지만 친구·가족으로만 대해요.`,mutual:'서로 좋아하지만 상대의 마음을 아직 몰라요.'+(R.half?' (한쪽은 이미 알고 있어요)':''),lover:'서로 좋아하고 서로의 마음을 알아요.',spouse:'결혼한 사이예요.'}[R.k]||'';
  const chk=(id,v,t)=>`<label class="chk"><input type="checkbox" class="vmRb" id="${id}" ${v?'checked':''}> ${t}</label>`;
  return `<div class="vm-rom"><label class="vm-type">연애 상태 <select id="vmRom">${known?'<option value="" selected>직접 세부 설정</option>':''}${opts.map(x=>`<option value="${x[0]}" ${x[0]===cur?'selected':''}>${esc(x[1])}</option>`).join('')}</select></label>
   <div class="vm-sub">${desc}</div>
   ${R.sug?`<div class="vm-sug"><b>${esc(R.sug.text)}</b><div class="vm-sugb"><button type="button" id="vmSugOk" class="vv-primary">바꾸기</button><button type="button" id="vmSugNo">그대로 두기</button></div><small>고백·프로포즈의 결과는 직접 확인하기 전에는 관계를 바꾸지 않아요.</small></div>`:''}
   ${R.k!=='none'||known?`<details class="vm-romd" open><summary>세부 설정 (누가 누구를 좋아하고, 마음을 아는지)</summary>
    ${chk('vmRb1',R.me.lv,`${esc(iga(c.name))} ${esc(eul(other))} 좋아함`)}${chk('vmRb2',R.me.kn,`${esc(iga(c.name))} ${on}의 마음을 앎`)}${chk('vmRb3',R.them.lv,`${esc(iga(other))} ${esc(eul(c.name))} 좋아함`)}${chk('vmRb4',R.them.kn,`${esc(iga(other))} ${cn}의 마음을 앎`)}</details>`:''}</div>`}
/* v28 마음의 움직임: 의도(자율 의사결정)·갈등/이별 상태·마음의 결·최근 일(원인 포함)을 보여 줌. 알림이 아니라 열어 볼 때만 읽는 화면 */
const INT_P={affiliate:'함께 시간을 보내고 싶은 마음',comfort:'위로받고 싶은 마음',reconcile:'화해하고 싶은 마음',romance:'마음을 전하고 싶은 마음',care:'마음을 살피고 싶은 마음'};
const INT_W={pride:'자존심이 앞서',timid:'쑥스러워서',fear:'거절당할까 불안해서'};
const eulK=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?n+'을':n+'를'};
function awBox(M,s,c){const W=M._awr&&M._awr.view?M._awr.view(s,c.id,Date.now()):null;if(!W||(W.b<15&&W.ph<1))return '';
  const lv=W.b>=70?'거의 확신해요':W.b>=40?'의심이 커졌어요':W.b>=15?'가끔 어색하게 느껴요':'특별히 이상하다고 느끼지 않아요';
  const cp={rationalize:'착각이라고 스스로 설명하며 달래는 중',avoid:'생각을 피해 다른 일에 몰두하는 중',accept:'이상함을 받아들이고 가라앉힌 상태',seek:'다른 사람의 생각이 궁금한 상태'}[W.cp];
  return `<h4>세계에 대한 생각 <small>규칙 기반 해석 · 논문 재현 아님</small></h4><div class="vm-box"><div class="vm-cause">이 세계가 이상하다는 생각: ${lv}</div><div class="vm-bar"><i style="width:${Math.max(3,W.b)}%"></i></div><div class="vm-sub">${W.dis>=.4&&cp?cp+' · ':''}집 전체 V ${W.v} (${W.phn})${W.fis?' · 틈 '+W.fis+'곳':''}</div></div>`}
function socIntent(M,s,c,nm){const D=M._dec;if(!D)return '';const tp=M._chn&&M._chn.trapOf?M._chn.trapOf(s,c.id):null;if(tp){const h=Math.max(0,Math.round((Date.now()-tp.since)/36e5));return `<h4>지금의 마음 <small>무엇을 하고 싶은지</small></h4><div class="vm-box"><div class="vm-cause">${h>=1?h+'시간째 ':''}나가고 싶은데 길이 막혀 있어 답답하고 불안해해요</div><div class="vm-sub">왜 막혔는지는 본인도 몰라요</div></div>`}
  const ap=M._chn&&M._chn.apprOf?M._chn.apprOf(s,c.id):null;if(ap&&ap.mn>=30){const st=ap.mn>=85?'아무것도 하고 싶지 않을 만큼 무기력해요':ap.mn>=60?'매너리즘에 빠져 의욕이 떨어졌어요':'같은 일이 되풀이되어 단조롭게 느끼고 있어요';return `<h4>지금의 마음 <small>무엇을 하고 싶은지</small></h4><div class="vm-box"><div class="vm-cause">${st}</div><div class="vm-sub">${ap.fk!=null&&ap.fk<=2?'할 수 있는 일이 거의 없는 공간이라 더 그래요 · ':''}왜 그런지는 본인도 잘 몰라요</div></div>`}
  const it=D.view(s,c.id);if(!it||Date.now()>it.until)return '';let t=null;
  if(it.torn&&it.k!=='approach')t=`${nm(it.torn.to)}에게 ${INT_P[it.torn.p]||'다가가고 싶은 마음'}이 있지만 ${INT_W[it.torn.why]||'망설여서'} 다가가지 못하고 있어요`;
  else if(it.k==='approach'&&it.to)t=`${nm(it.to)}에게 다가가려는 중이에요 — ${INT_P[it.p]||'마음이 가서'}`;
  else if(it.k==='avoid'&&it.to)t=`${eulK(nm(it.to))} 피하고 싶은 마음이에요`;
  else if(it.k==='solitude')t='혼자 조용히 있고 싶어 해요';
  if(!t)return '';return `<h4>지금의 마음 <small>무엇을 하고 싶은지</small></h4><div class="vm-box"><div class="vm-cause">${esc(t)}</div>${it.drv?`<div class="vm-sub">가장 큰 이유: ${esc(it.drv)}</div>`:''}<div class="vm-sub">이 마음은 확정된 명령이 아니라 행동을 고를 때의 경향이에요. 직접 정한 행동이 항상 먼저예요.</div></div>`}
function socTags(M,s,a,b){const SO=M._soc;if(!SO)return '';const v=SO.view(s,a,b),o=[];
  if(v.conflict)o.push(`갈등 중${v.conflict.branch&&SO.BRANCH_NAME[v.conflict.branch]?' · '+SO.BRANCH_NAME[v.conflict.branch]:''}`);
  if(v.sep)o.push(v.sep.kind==='divorce'?'헤어진 부부':'헤어진 사이');
  return o.map(x=>` <span class="vv-tag vm-soctag">${esc(x)}</span>`).join('')}
const FEEL_LAB=[['tr','신뢰'],['att','애착'],['rs','서운함·원망'],['wr','경계'],['jl','질투']];
const SHOW_T=new Set(['conflict','conf_branch','apology','talk_out','bicker_end','breakup','divorce','reunion','sep','confess_ok','confess_no','propose_ok','propose_no','witness','gossip','check','care','contagion','intent','trap','strain','mannerism','deja','reflect','dislike','aware']);
function socDetail(M,s,c,o,nm){const SO=M._soc;if(!SO)return '';const f=SO.feelOf(s,c.id,o),S=SO.soc(s),by=new Map(S.log.map(e=>[e.id,e]));
  const bars=FEEL_LAB.map(([k,l])=>`<div class="vm-fl"><span>${l}</span><div class="vm-bar"><i style="width:${Math.max(2,Math.round(f[k]))}%"></i></div></div>`).join('');
  const evs=S.log.filter(x=>SHOW_T.has(x.type)&&(x.a===c.id&&x.b===o||x.a===o&&x.b===c.id||(x.pair||[]).includes(o)&&(x.a===c.id||x.b===c.id)||x.type==='witness'&&x.a===c.id&&(x.pair||[]).includes(o))).slice(-6).reverse();
  const li=evs.map(x=>{const par=x.cause&&by.get(x.cause);return `<li><span class="vm-ms">${esc(x.why)}${x.off?' <small>(접속하지 않은 동안)</small>':''}${x.place?` <small>· ${esc(x.place)}</small>`:''}${par?`<br><small>↳ 원인: ${esc(par.why)}</small>`:''}</span><span class="vm-mt">${esc(mindTime(x.t))}</span></li>`}).join('');
  return `<h4>마음의 결 <small>${esc(c.name)}이(가) ${esc(nm(o))}에게 느끼는 것</small></h4><div class="vm-box vm-feel">${bars}<div class="vm-sub">숫자가 아니라 쌓인 사건으로 움직여요. 서운함·질투·경계는 시간이 지나며 가라앉아요.</div></div>
   <h4>최근 있었던 일 <small>원인과 함께</small></h4>${li?`<ul class="vm-mem">${li}</ul>`:'<p class="hint">아직 기록할 만한 일이 없어요.</p>'}`}
/* 관찰 일지: 서울 시각 자정에 캐릭터·날짜마다 확정된 '하루 한 줄'. 캐릭터·날짜로만 거른다(예전의 분류 선택은 없앰).
   공유 집(서버 생활 엔진이 켜진 집)은 서버가 접속자가 없어도 날마다 확정한 기록을 그대로 보여 준다. 이 기기에만 있는 집은 이 기기에 쌓인 사건 기록을 날짜별로 보여 준다. */
function openJournal(){
  const d=dlgOf(),cur=houses[activeIdx];if(!d||!cur)return;
  const mem=inHouse(cur.id).filter(c=>!c.remote||(cur.shared&&c.hid===cur.shared.hid)),nmOf={};Viv.chars().forEach(c=>{nmOf[c.id]=c.name});
  const srv=cur.shared&&SH().engineOn&&SH().engineOn(cur.shared.hid);
  d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>관찰일지 <small>${esc(cur.name)}</small></h3>
   <p class="hint">${srv?'서버가 서울 시각 자정마다 캐릭터별로 그날의 일을 한 줄로 확정해요. 접속하지 않은 날도 날짜 순서대로 채워지고, 한 번 확정된 문장은 바뀌지 않아요.':'이 기기에만 있는 집이에요. 이 기기에서 실제로 있었던 사건 중 그날 가장 큰 일 한 문장만 날짜별로 보여 줘요(오늘 일은 서울 자정이 지나면 확정돼요. 기록이 없는 날은 보이지 않아요). 서버 공유 집과 달리 이 브라우저를 열어 둔 시간만 기록돼요.'}</p>
   <div class="vj-f"><label>캐릭터 <select id="vjWho"><option value="">모든 캐릭터</option>${mem.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
   <label>날짜 <input type="date" id="vjDay"></label><button type="button" id="vjAll" class="vj-go">조회</button></div>
   <ul class="vj-list" id="vjList"></ul><div class="vv-btns"><button type="button" id="vjMore">더 보기</button><button type="button" id="vjClose">닫기</button></div></form>`;
  let who='',day='',lim=60,rows=[],seq=0;
  const draw=()=>{let h='',last='';rows=rows.filter(r=>r.kind!=='sparse'&&r.text!=='기록 부족');   /* 기록이 없던 날은 보여 주지 않는다(없던 과거를 채워 넣지 않음) */
    for(const r of rows.slice(0,lim)){if(r.day!==last){last=r.day;h+=`<li class="vj-day">${esc(r.day)}</li>`}
      h+=`<li class="vj-${esc(r.kind||'life')}"><b>${esc(nmOf[r.char]||'')}</b> ${esc(r.text)}</li>`}
    q('#vjList',d).innerHTML=h||`<li class="hint">${srv?'조건에 맞는 기록이 없어요. 서울 시각 자정이 지나면 그날 일이 확정돼요(기록이 쌓이기 전 날짜는 비어 있어요).':'아직 기록된 일이 없어요.'}</li>`;q('#vjMore',d).hidden=rows.length<=lim};
  const load=async()=>{const my=++seq;
    if(srv){try{const r=await SH().journal(cur.shared.hid,{char:who,from:day,to:day,limit:400});if(my!==seq)return;r.chars.forEach(c=>{nmOf[c.id]=c.name});rows=r.days}catch(e){rows=[];q('#vjList',d).innerHTML='<li class="hint">일지를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</li>';return}}
    else{const M=MD();rows=[];if(M&&M._soc){const ids=new Set(mem.map(c=>c.id)),S=M._soc.soc(M.store.get());
      /* 로컬 집: 서버와 같은 규칙 — 캐릭터·날짜마다 한 문장(그날 관계에 가장 영향이 큰 사건), 오늘은 자정에 끝나야 확정, 사건이 없는 날은 '기록 부족' */
      const SC={breakup:100,divorce:100,reunion:96,propose_ok:98,propose_no:84,confess_ok:94,confess_no:86,confess_fail:60,conflict:78,apology:74,talk_out:72,comfort:70,affection:62,date:64,ignore:58,care:56},sp0=Viv.seoul(new Date()),dkOf=t=>{const q2=Viv.seoul(new Date(t));return q2.year+'-'+String(q2.month).padStart(2,'0')+'-'+String(q2.day).padStart(2,'0')},today=dkOf(Date.now()),best={};let first='';
      for(const e of S.log){const dk=dkOf(e.t);if(dk>=today)continue;if(!first||dk<first)first=dk;
        for(const w of [e.a,e.b].filter(x=>x&&ids.has(x))){const k=w+'|'+dk,sc=(SC[e.type]||20),o=best[k];if(!o||sc>o.sc||(sc===o.sc&&e.t<o.t))best[k]={sc,t:e.t,text:e.why,char:w,day:dk}}}
      if(first){const DAYMS=86400000,t0=Date.parse(first+'T00:00:00+09:00'),t1=Date.parse(today+'T00:00:00+09:00');
        for(let t=t0;t<t1;t+=DAYMS){const dk=dkOf(t+3600000);for(const w of ids){if(who&&w!==who)continue;if(day&&dk!==day)continue;const o=best[w+'|'+dk];if(o)rows.push({char:w,day:dk,text:o.text,kind:'life',t:o.t})}}}
      rows.sort((a,b)=>b.t-a.t)}}
    draw()};
  q('#vjAll',d).onclick=()=>{who=q('#vjWho',d).value;day=q('#vjDay',d).value;lim=60;load()};   // 고른 캐릭터·날짜로 「조회」를 눌렀을 때만 불러옴(날짜를 비우면 전체 날짜)
  q('#vjMore',d).onclick=()=>{lim+=60;draw()};q('#vjClose',d).onclick=()=>d.close();
  load();if(!d.open)d.showModal()}
const NRL={},nrAt={};
/* 관계 탭 필터: 집(우리집/각 이웃집) · 등록한 사람(내가 등록 / 다른 사람이 등록) */
let relFH='all',relFW='all';
const relPass=o=>!o||((relFH==='all'||o.hk===relFH)&&(relFW==='all'||(relFW==='mine'?o.mine:!o.mine)));
function relFilterBar(others){
  const hs=new Map([['own','우리집']]);others.forEach(o=>{if(!hs.has(o.hk))hs.set(o.hk,o.hname)});   // 우리집은 같은 집 상대가 없어도 항상 고를 수 있게
  const nbH=hs.size>1,othW=others.some(o=>!o.mine);if(!nbH&&!othW){relFH=relFW='all';return ''}   // 이웃이 없으면 집 필터를, 남이 등록한 캐릭터가 없으면 등록자 필터를 보여 주지 않음
  if(relFH!=='all'&&!hs.has(relFH))relFH='all';
  return `<div class="vm-flt">${nbH?`<select id="vmFH" aria-label="집 필터"><option value="all">모든 집</option>${[...hs].map(([k,n])=>`<option value="${esc(k)}" ${relFH===k?'selected':''}>${esc(n)}</option>`).join('')}</select>`:''}${othW?`<select id="vmFW" aria-label="등록한 사람 필터"><option value="all">모든 캐릭터</option><option value="mine" ${relFW==='mine'?'selected':''}>내가 등록한 캐릭터</option><option value="other" ${relFW==='other'?'selected':''}>다른 사람이 등록한 캐릭터</option></select>`:''}</div>`}
function nrKick(h){if(!h||!h.shared||!shareOn())return;const hid=h.shared.hid,now=Date.now();if(now-(nrAt[hid]||0)<15000)return;nrAt[hid]=now;
  SH().neighborRel(hid).then(r=>{if(!r)return;const old=JSON.stringify(NRL[hid]||null);NRL[hid]=r;if(JSON.stringify(r)!==old){try{mindRefresh()}catch(e){}}})}
function mindFill(el,c){
  const M=MD();if(!M||!el)return;
  const p=Viv.getPlace(c.id);
  if(!p.house){el.innerHTML='<p class="hint">집에 배치하면 감정과 관계가 생겨요.</p>';return}
  const s=M.store.get(),now=Date.now(),same=inHouse(p.house).filter(o=>o.id!==c.id&&!petOfChar(o));
  /* 이웃집 캐릭터와 쌓인 관계: 서버가 두 집 기록을 합쳐 알려 주는 것(보기 전용)을 이 화면에서만 합쳐 보여 준다 */
  const hh0=houses.find(x=>x.id===p.house),nr=hh0&&hh0.shared?NRL[hh0.shared.hid]:null;nrKick(hh0);
  const crossIds=nr?[...new Set(Object.keys(nr.rel).map(k=>k.split('>')).filter(([a,b])=>a===c.id||b===c.id).map(([a,b])=>a===c.id?b:a))].filter(id=>nr.chars[id]&&!same.some(o=>o.id===id)):[];
  const crossO=crossIds.map(id=>({id,name:nr.chars[id].name,cross:true,hname:nr.chars[id].hname,hk:nr.chars[id].house,mine:!!nr.chars[id].mine}));same.forEach(o=>{o.hk='own';o.mine=canSetC(o)});
  const others=same.concat(crossO),sv=nr?{...s,rel:{...nr.rel,...s.rel},th:{...nr.th,...s.th},rom:{...nr.rom,...s.rom},rev:{...nr.rev,...s.rev}}:s,V=M.view(sv,c.id,now,others.map(o=>o.id));
  if(mindSel&&!others.some(o=>o.id===mindSel))mindSel=null;
  const isCross=!!(mindSel&&crossO.some(o=>o.id===mindSel));
  const e=V.emo;
  const nm=id=>{const o=others.find(x=>x.id===id);return o?o.name:'상대'};
  let h=`<h4>현재 감정 <small>지금의 기분</small></h4>
   <div class="vm-box"><div class="vm-emo"><span class="vm-ename vm-${e.id}">${esc(e.name)}</span><span class="vm-lvl">${esc(e.level)}</span></div>
   <div class="vm-bar"><i style="width:${Math.max(4,e.v)}%"></i></div>
   <div class="vm-cause">원인: ${esc(e.cause)}</div>
   <div class="vm-sub">${e.at?`시작 ${esc(mindTime(e.at))} · `:''}마지막 갱신 ${esc(mindTime(e.upd))}</div>
   ${e.others.length?`<div class="vm-oth">그 밖의 기분: ${e.others.map(o=>`<span class="vv-tag">${esc(o.name)} <small>${esc(o.level)}</small></span>`).join('')}</div>`:''}</div>
   ${socIntent(M,s,c,nm)}${awBox(M,s,c)}
   <h4>관계 <small>${esc(c.name)}이(가) 상대를 어떻게 느끼는지</small></h4>`;
  if(!others.length)h+='<p class="hint">같은 집에 다른 캐릭터가 있으면 관계가 만들어져요.</p>';
  else h+=`<p class="hint vm-top">각 캐릭터를 누르면 세부 내용 확인 및 관계 설정이 가능해요 <small>(같은 집 캐릭터와, 이웃집에 놀러 가서 쌓인 이웃집 캐릭터가 나와요. 반려동물은 돌봄 기능으로 따로 다뤄요.)</small></p>${relFilterBar(others)}<div class="vm-rels">${V.rels.filter(r=>relPass(others.find(x=>x.id===r.id))).map(r=>{const oo=others.find(x=>x.id===r.id)||{};return `<button type="button" class="vm-rel${mindSel===r.id?' on':''}" data-o="${r.id}">
     <span class="vm-rn"><b>${esc(nm(r.id))}</b> ${oo.cross?`<span class="vv-tag vm-nb">이웃</span> <span class="vv-tag">${esc(oo.hname||'')}</span>`:`<span class="vv-tag${r.lock?' fact':''}">${esc(r.typeName)}${r.lock?' · 고정':''}</span>`}${r.rom&&r.rom.k!=='none'?` <span class="vv-tag vm-romtag">♥ ${esc(r.rom.label)}</span>`:''}${socTags(M,s,c.id,r.id)}</span>
     <span class="vm-aff" title="친밀도 ${r.aff} (−100 ~ +100)"><i class="${r.aff<0?'neg':'pos'}" style="width:${Math.min(50,Math.abs(r.aff)/2)}%;${r.aff<0?'right:50%':'left:50%'}"></i></span><span class="vm-num">${r.aff>0?'+':''}${r.aff}</span>
     <small>${r.why?esc(r.why)+(r.whyAt?' · '+esc(mindTime(r.whyAt)):''):'아직 이렇다 할 일이 없어요'}</small></button>`}).join('')}</div>`;
  if(mindSel){const r=V.rels.find(x=>x.id===mindSel),ms=M.memories(s,c.id,mindSel,now),other=nm(mindSel);
    h+=`<h4>${esc(other)}에 대한 생각 <small>지금 어떻게 보는지</small></h4>
     <div class="vm-box"><b class="vm-th">${r.th?esc(r.th.name):'아직 잘 모르겠는 사람'}</b><div class="vm-cause">${r.th?esc(r.th.why):'아직 겪은 일이 많지 않아서'}</div>${r.th?`<div class="vm-sub">이 생각을 갖게 된 때: ${esc(mindTime(r.th.since))}</div>`:''}
     <label class="vm-type">친밀도 <span class="vm-affw"><input type="range" id="vmAff" min="-100" max="100" step="5" value="${r.aff}"><output id="vmAffO">${r.aff>0?'+':''}${r.aff}</output></span></label>
     <label class="vm-type">관계 유형 <select id="vmType"><option value="">자동으로 (프로필·사건에 따라)</option>${Object.keys(M.REL_TYPES).map(k=>`<option value="${k}" ${r.lock==='user'&&r.type===k?'selected':''}>${esc(M.REL_TYPES[k].n)}</option>`).join('')}</select></label>
     <div class="vm-sub">${r.lock==='profile'?'프로필에 적힌 관계라서 자동으로 바뀌지 않아요.':r.lock==='user'?'직접 정한 관계라서 자동으로 바뀌지 않아요.':'관계 유형은 친밀도 점수만으로 정하지 않고, 쌓인 사건과 기억으로 천천히 바뀌어요.'} ${r.origin?'· '+esc(r.origin):''}</div></div>
     ${romPanel(M,r,c,other)}
     ${socDetail(M,s,c,mindSel,nm)}
     <h4>감정적 기억 <small>지나간 일 — 지금 기분과는 별개</small></h4>
     ${ms.length?`<ul class="vm-mem">${ms.map(m=>`<li class="${m.val>0?'pos':'neg'}"><span class="vm-ms">${esc(m.sum)}${m.cnt>1?` <small>(${m.cnt}번)</small>`:''}</span><span class="vm-mt">${esc(mindTime(m.at))}</span><span class="vm-mp" title="지금 남은 영향력 ${m.pow}/100"><i style="width:${Math.max(4,m.pow)}%"></i></span><small>영향력 ${powLabel(m.pow)}${m.fading?' · 점점 희미해지는 중':''}${m.open?' · 아직 풀리지 않음':''}</small></li>`).join('')}</ul>`:'<p class="hint">아직 남아 있는 기억이 없어요. 함께한 일이 쌓이면 기억이 생기고, 시간이 지나면 희미해져요.</p>'}`}
  h+=`<p class="hint vm-foot">${c.remote?'공유 집 캐릭터의 감정·관계는 시뮬레이션을 돌리는 기기에서 갱신되고 서버를 통해 함께 보여요. ':'이 기기에만 저장돼요. '}<button type="button" id="vmReset" class="vm-link">감정·관계 기록 지우기</button></p>`;
  el.innerHTML=h;
  {const a=q('#vmFH',el),b=q('#vmFW',el);if(a)a.onchange=()=>{relFH=a.value;mindFill(el,c)};if(b)b.onchange=()=>{relFW=b.value;mindFill(el,c)}}
  if(isCross){qa('#vmAff,#vmBoth,#vmType,#vmRom,.vmRb,#vmSugOk,#vmSugNo',el).forEach(x=>{x.disabled=true});const bx=q('#vmAff',el)||q('#vmType',el);const bb=bx&&(bx.closest('.vm-box')||bx.parentNode);if(bb)bb.insertAdjacentHTML('beforeend','<div class="vm-sub vm-lock">다른 집 캐릭터와 지내며 쌓인 관계예요. 이 화면에서는 보기만 할 수 있어요</div>')}
  /* 친밀도·관계 유형·연애 상태 등은 이 캐릭터를 등록한 사람만 바꿀 수 있다(코드로 입장한 사람·이웃·공동 집주인은 보기만) */
  const ctl=canSetC(c);
  if(!ctl){qa('#vmAff,#vmBoth,#vmType,#vmRom,.vmRb,#vmSugOk,#vmSugNo',el).forEach(x=>{x.disabled=true});
    const sel=q('#vmAff',el)||q('#vmType',el);const box=sel&&(sel.closest('.vm-box')||sel.parentNode);if(box)box.insertAdjacentHTML('beforeend','<div class="vm-sub vm-lock">이 캐릭터를 등록한 사람만 관계를 바꿀 수 있어요</div>')}
  /* 연애 상태를 정한 사람이 따로 있으면 다른 사람은 보기만 한다(서버도 같은 규칙으로 거절) */
  try{if(c.remote&&c.hid&&mindSel){const rm0=M.store.get().rom||{},ent=rm0[c.id+'>'+mindSel]||rm0[mindSel+'>'+c.id],by=ent&&ent.by,me0=SH().info(c.hid),myp=me0&&me0.me&&me0.me.pid;
    if(by&&myp&&by!==myp){qa('#vmRom,.vmRb,#vmSugOk,#vmSugNo',el).forEach(x=>{x.disabled=true});const sel=q('#vmRom',el);if(sel)sel.closest('.vm-rom').insertAdjacentHTML('beforeend','<div class="vm-sub vm-lock">다른 참여자가 정한 연애 상태라서 보기만 할 수 있어요</div>')}}}catch(e){}
  qa('.vm-rel',el).forEach(b=>b.onclick=()=>{mindSel=mindSel===b.dataset.o?null:b.dataset.o;mindFill(el,c)});
  const mkEnv=()=>{const chars=humansIn(p.house),sp=Viv.seoul(new Date());return M.env(chars,ch=>Sim.analyze(ch.profile||'',ch.name||'',chars),Date.now(),`${sp.year}-${sp.month}-${sp.day}`)};
    /* 공유 집 캐릭터의 관계 변경은 서버가 '등록한 사람'을 확인해 받아들인다(리더의 저장으로는 바뀌지 않음) */
  const relSave=()=>{M.store.save();const o=mindSel;if(!c.remote||!c.hid||!o)return;const sl=M.slice(M.store.get(),[c.id,o]);SH().mindRel(c.hid,{a:c.id,b:o,rel:sl.rel,rom:sl.rom,clearRom:true}).then(r=>{if(r&&r.error)alert(r.error)})};
  const ty=q('#vmType',el);if(ty)ty.onchange=()=>{const env=mkEnv(),v=ty.value||null;
    if(v==='lover'||v==='spouse'){M.setRomance(s,c.id,mindSel,v,env)}   // 연인·부부는 연애 상태와 함께 정해짐(세부 설정이 아래에 열림)
    else{const st=M.romState(s,c.id,mindSel);M.setRelType(s,c.id,mindSel,v,env);if(v&&(st.k==='lover'||st.k==='spouse'))M.setRomance(s,c.id,mindSel,'none',env)}
    relSave();mindFill(el,c)};
  const rm=q('#vmRom',el);if(rm)rm.onchange=()=>{const env=mkEnv(),v=rm.value;const o=mindSel;
    const map={none:[c.id,o,'none'],crush_c:[c.id,o,'crush'],crush_o:[o,c.id,'crush'],oneside_c:[c.id,o,'oneside'],oneside_o:[o,c.id,'oneside'],mutual:[c.id,o,'mutual'],lover:[c.id,o,'lover'],spouse:[c.id,o,'spouse']}[v];
    if(map){M.setRomance(s,map[0],map[1],map[2],env);relSave();mindFill(el,c)}};
  const rb=qa('.vmRb',el);if(rb.length)rb.forEach(x=>x.onchange=()=>{const env=mkEnv(),g=id=>q('#'+id,el).checked;
    M.setRomBits(s,c.id,mindSel,{lv:g('vmRb1'),kn:g('vmRb2')},{lv:g('vmRb3'),kn:g('vmRb4')},env);relSave();mindFill(el,c)});
  const sa=q('#vmSugOk',el);if(sa)sa.onclick=()=>{M.romSugApply(s,c.id,mindSel,mkEnv());relSave();mindFill(el,c)};
  const sd=q('#vmSugNo',el);if(sd)sd.onclick=()=>{M.romSugDismiss(s,c.id,mindSel,mkEnv());relSave();mindFill(el,c)};
  const af=q('#vmAff',el);if(af){af.oninput=()=>{const o=q('#vmAffO',el);if(o)o.textContent=(+af.value>0?'+':'')+af.value};
    af.onchange=()=>{const env=mkEnv();M.setRelAff(s,c.id,mindSel,af.value,env);relSave();mindFill(el,c)}}
  const rs=q('#vmReset',el);if(rs)rs.onclick=()=>{if(!confirm('이 기기에 저장된 모든 캐릭터의 감정·관계·기억 기록을 지울까요? 캐릭터와 도면은 그대로예요.'))return;M.store.reset();mindSel=null;mindFill(el,c)}}
function mindRefresh(){const el=q('#vvMind'),c=selChar&&Viv.char(selChar);if(!el||!c)return;const a=document.activeElement;if(a&&el.contains(a)&&/SELECT/.test(a.tagName))return;mindFill(el,c)}
const mindEmoTag=id=>{const M=MD();if(!M)return '';const s=M.store.get();if(!s.emo[id])return '';return ' · '+M.rep(s,id,Date.now()).name};

/* 현재 서울 시각 기준으로 "지금 해야 할 행동"만 갱신. 이전 행동을 재생하지 않는다. */
/* 공유 집: 같은 캐릭터의 행동을 여러 브라우저가 따로 결정해 저장하지 않도록, 서버가 정한 '리더' 한 곳만 결정한다.
   나머지 브라우저는 서버에 저장된 캐릭터 상태를 그대로 보여 준다(사용자가 고른 바람은 리더가 곧 반영). */
/* 서버가 계산하는 집에서 내가 방금 내린 명령(행동 지정·돌아오기 등)은 서버 결과를 기다리지 않고, 같은 엔진으로 이 브라우저에서 먼저 한 번 돌려 바로 걷기 시작하게 한다.
   저장·확정은 서버만 한다(여기서는 화면용 '예상'만 만들고 서버에 보내지 않음). 서버 결과가 오면 그 값으로 바뀐다. */
const PRED={};
function predictEngine(i,animate){
  const h=houses[i];if(!h||!h.shared||!window.VivEngine||!SH().pendingUser)return false;
  const ids=SH().pendingUser(h.shared.hid);if(!ids.length)return false;
  const slide=qa('.vv-slide')[i];if(!slide||!slide._snap||!slide._snap.world)return false;
  try{const now=Date.now(),ov={p:{},s:{}},res=inHouse(h.id).map(toSimChar),M=MD();
    const gp=id=>ov.p[id]||Viv.getPlace(id),gs=id=>ov.s[id]||Viv.getSim(id);
    const host={world:slide._snap.world,houseId:h.id,residents:res,guests:[],awayIds:new Set(),isMiss,
      getPlace:gp,getSim:gs,
      setPlace:(id,o)=>{const nx={...gp(id),...o};if(o.mode||o.action||o.house!==undefined)nx.since=now;ov.p[id]=nx},
      setSim:(id,o)=>{ov.s[id]={...gs(id),...o}},
      mind:M?JSON.parse(JSON.stringify(M.store.get())):null,unc:null,neighbors:nbFor(h.id).map(x=>({hid:x.id,name:x.name})),watch:null,mindAt:Infinity};   // mindAt 을 크게 두어 감정·관계 갱신은 건너뜀(서버만 함)
    const tr=VivEngine.tick(host,now);
    const mine=new Set(ids);let any=false;
    for(const id of mine){if(!ov.p[id]&&!ov.s[id])continue;SH().store.predict(id,ov.p[id]||Viv.getPlace(id),ov.s[id]||Viv.getSim(id));any=true}
    if(!any)return false;
    drawChars(slide);
    if(animate!==false&&!REDUCE)for(const m of tr.moves||[]){if(!mine.has(m.id))continue;PRED[m.id]={t:now,x:(m.route[m.route.length-1]||{}).x};walk(slide,{id:m.id,from:m.from,route:m.route})}
    renderList();softDetail();return true}
  catch(e){console.warn('[viv predict]',e);return false}}
function runSim(i,animate){
  const h=houses[i];if(h&&h.shared){
    if(SH().engineOn&&SH().engineOn(h.shared.hid)){mindLead[h.shared.hid]=0;predictEngine(i,animate);mindSync(h,false);return false}   // 서버가 계산하는 집: 이 브라우저는 계산하지 않고 서버 상태를 보여 주기만 한다
    if(SH().isLeader(h.shared.hid)){const hid=h.shared.hid;if(!mindLead[hid]){mindLead[hid]=1;mindSync(h,false).then(()=>{if(houses[i]===h)runSimNow(i,animate)});return false}return runSimNow(i,animate)}
    mindLead[h.shared.hid]=0;
    mindSync(h,false);stepShared(i,animate);return false}
  return runSimNow(i,animate)}
const leaseAt={};
async function stepShared(i,animate){
  const h=houses[i];if(!h||!h.shared||!shareOn())return false;
  const hid=h.shared.hid;let ok=false;
  if(SH().engineOn&&SH().engineOn(hid)){predictEngine(i,animate);if(mode==='viv')mindSync(h,false);return false}
  if(SH().isLeader(hid)&&Date.now()-(leaseAt[hid]||0)<45000)ok=true;   // 리더 임대(120초)는 45초마다만 갱신 — 변경 알림마다 서버를 부르지 않는다
  else{try{ok=await SH().lease(hid)}catch(e){}if(ok)leaseAt[hid]=Date.now()}
  if(!ok&&houses[i]===h&&mode==='viv'){mindLead[hid]=0;mindSync(h,false)}   // v28: 리더가 아닌 브라우저도 1분마다 서버의 감정·관계·기억을 받아 온다(전에는 집을 열 때만 받음)
  if(!ok||houses[i]!==h||mode!=='viv')return false;
  if(!mindLead[hid]){mindLead[hid]=1;await mindSync(h,false);if(houses[i]!==h||mode!=='viv')return false}
  if(runSimNow(i,animate)){renderList();softDetail();return true}return false}
/* v24 공유 집의 감정·관계·기억: 리더는 계산 뒤 서버에 올리고, 나머지(와 새로 리더가 된 쪽)는 서버 것을 받아 그 집 캐릭터 부분만 바꿔 넣는다 */
const mindBusy={},mindLead={};
function mindIds(h){return humansIn(h.id).map(c=>c.id)}
/* 서버가 계산하는 집의 위화감: 서버의 상태를 이 브라우저 저장소에 반영하고, 서버가 남긴 연출(사라짐·응시·돌아옴 등)과 알림을 아직 못 본 것만 재생한다 */
const UQSEEN={};
async function uncSyncSrv(h,hid,ids){
  const U=UC();if(!U)return;const d=await SH().uncPull(hid);if(!d)return;
  try{const st=U.store.get();for(const id of ids){if(d.u&&d.u[id])st.u[id]=d.u[id]}U.store.save()}catch(e){}
  const q=Array.isArray(d.q)?d.q:[],now=Date.now();
  if(UQSEEN[hid]==null){UQSEEN[hid]=q.reduce((m,x)=>Math.max(m,x.t||0),0);   // 처음 연 화면은 지난 연출을 한꺼번에 재생하지 않는다(2분 이내만)
    q.filter(x=>x.t>now-120000).forEach(x=>playUq(x));return}
  const seen=UQSEEN[hid];q.filter(x=>x.t>seen&&x.t>now-15*60000).forEach(x=>playUq(x));
  UQSEEN[hid]=q.reduce((m,x)=>Math.max(m,x.t||0),seen);
  try{renderList();softDetail()}catch(e){}}
function playUq(x){try{if(x.f)ucFx(x.f);else if(x.n)note(x.n,'bad')}catch(e){console.error('[viv uq]',e)}}
async function mindSync(h,push){
  const M=MD();if(!M||!h||!h.shared||!shareOn()||mindBusy[h.shared.hid])return;const hid=h.shared.hid;mindBusy[hid]=1;
  try{const ids=mindIds(h);
    if(push&&SH().isLeader(hid)){
      const res=await SH().mindPush(hid,M.slice(M.store.get(),ids));
      if(res&&(res.conflict||res.fixed)&&res.data){M.mergeSlice(M.store.get(),res.data,ids);M.store.save()}}
    else{const d=await SH().mindPull(hid);if(d){M.mergeSlice(M.store.get(),d,ids);M.store.save();try{renderList();softDetail()}catch(e){}}
      if(SH().engineOn&&SH().engineOn(hid))await uncSyncSrv(h,hid,ids)}}
  catch(e){console.warn('[viv mind sync]',e.message)}finally{mindBusy[hid]=0}}
/* 이 기기에만 있는 집의 '자리 비운 동안' 따라잡기: 서버와 같은 엔진(VivEngine)으로 지난 시각을 15분 격자 순서대로 실제로 재생한다(예전의 간이 보정은 없앰).
   마지막 실행 시각은 집별로 기록해 두고, 기록이 없던 집은 지금부터 기록을 시작한다(없던 과거를 지어내지 않음). 최대 90일까지, 한 번에 조금씩 나눠 처리한다. */
const LASTRUN_K='viv.lastrun.v1';
const lrGet=()=>{try{return JSON.parse(localStorage.getItem(LASTRUN_K)||'{}')}catch(e){return {}}};
const lrSet=(id,t)=>{try{const o=lrGet();o[id]=t;localStorage.setItem(LASTRUN_K,JSON.stringify(o))}catch(e){}};
let lrSaved={};
function localHost(h,snap){const M=MD(),U=UC(),res=inHouse(h.id).map(toSimChar);
  return {world:snap.world,houseId:h.id,residents:res,guests:[],awayIds:new Set(res.filter(c=>Viv.guestHas('vg:'+c.id)).map(c=>c.id)),isMiss,
    getPlace:Viv.getPlace,setPlace:Viv.setPlace,getSim:Viv.getSim,setSim:Viv.setSim,mind:M?M.store.get():null,unc:U?U.store.get():null,
    neighbors:nbFor(h.id).map(x=>({hid:x.id,name:x.name})),watch:null,mindAt:lrSaved['m:'+h.id]||0}}
function catchUpLocal(h,snap){
  if(h.shared||!window.VivEngine||!snap||!snap.world)return false;
  const now=Date.now(),last=lrGet()[h.id];
  if(!last){lrSet(h.id,now);return false}
  if(now-last<20*60000){if(now-(lrSaved[h.id]||0)>30000){lrSaved[h.id]=now;lrSet(h.id,now)}return false}
  const host=localHost(h,snap),from=Math.max(last,now-90*86400000);
  const r=VivEngine.replay(host,from,now,{maxSteps:4000,deadline:Date.now()+300});
  lrSaved['m:'+h.id]=host.mindAt;
  try{const M=MD(),U=UC();M&&M.store.save();U&&U.store.save()}catch(e){}
  lrSet(h.id,r.done?now:r.last);if(r.done){lrSaved[h.id]=now;note('자리를 비운 동안의 생활을 이어서 계산했어요');}
  return !r.done}
function runSimNow(i,animate){
  const h=houses[i],slide=qa('.vv-slide')[i];if(!h||!slide||!slide._snap||!slide._snap.world)return false;
  if(catchUpLocal(h,slide._snap)){drawChars(slide);return true}
  const outSig=()=>Viv.chars().map(c=>{const p=Viv.getPlace(c.id);return p.mode==='out'?c.id+p.say:''}).join('|'),sig0=outSig();   // 외출 중 문구만 바뀐 경우에도 화면을 갱신
  try{guestGC()}catch(e){}
  const mprev=mindSnap(h.id);let moves;try{const go=()=>Sim.stepHouse(simCtx(h,slide._snap));moves=h.shared?SH().auto(go):go()}catch(e){console.error('[viv sim]',e);return false}
  mindStep(h,slide._snap,mprev);uncStep(h);if(h.shared)mindSync(h,true);
  /* 이웃집에 놀러 온 손님의 지문은 '그 집에서 계산한 문장' 하나만 진짜로 둔다: 원래 캐릭터의 말풍선에 복사해 서버로 올라가 상대 브라우저에도 같은 문장이 보이게 함 */
  try{for(const gid of Viv.guestIds()){const gp=Viv.getPlace(gid);if(gp.house!==h.id||gp.mode!=='home'||!gp.say)continue;const rid=gid.slice(3),rp=Viv.getPlace(rid);if(rp.mode==='out'&&rp.verb==='out_visit'&&rp.say!==gp.say){const put=()=>Viv.setPlace(rid,{...rp,say:gp.say});SH()&&SH().auto?SH().auto(put):put()}}}catch(e){}
  if(!moves.length){if(outSig()!==sig0){drawChars(slide);return true}return false}
  if(animate&&!REDUCE){drawChars(slide);moves.forEach(m=>walk(slide,m))}
  drawChars(slide);return true}
/* 방문 중인 캐릭터의 행동 문구는 방문자 쪽(원래 집의 기기)이 집 탭 유무와 상관없이 계속 갱신해 서버로 올린다 → 주인 브라우저도 같은 문구를 본다.
   그 집이 이 기기에 있으면 그 집의 실제 계산(runSim)을 돌리고, 없으면 15분마다 방문 행동 문구를 새로 고른다. */
function visitKeep(){const now=Date.now(),mark=Math.floor(now/900000);
  for(const c of Viv.chars()){const p=Viv.getPlace(c.id),st=Viv.getSim(c.id);if(p.mode!=='out'||p.verb!=='out_visit'||!st.outTo)continue;
    if(Viv.guestHas('vg:'+c.id)){const i=houses.findIndex(h=>h.id===Viv.getPlace('vg:'+c.id).house);if(i>=0&&i!==activeIdx)runSim(i,false);continue}
    if(!String(st.outTo).startsWith('srv:')||st.vMark===mark)continue;
    const W=(Sim.OUT_WHY||[]).find(x=>x.id==='visit');if(!W||!W.d||!W.d.length)continue;
    let say=W.d[Sim.hash(c.id+'|v|'+mark)%W.d.length].replace(/\{n\}/g,st.outNb||'이웃');if(window.Ko)say=Ko.fix(say);
    const put=()=>{Viv.setSim(c.id,{...st,vMark:mark});Viv.setPlace(c.id,{...p,say})};SH()&&SH().auto?SH().auto(put):put()}}
function simTick(){if(mode!=='viv'||document.hidden||!houses.length)return;tick();try{visitKeep()}catch(e){console.warn('[viv visitKeep]',e.message)}
  /* 이웃집을 보고 있는 동안에도, 방문 시간이 끝난 손님은 자기 집에서 돌아와야 한다(전에는 보고 있는 집만 갱신해서 제 집을 열 때까지 손님이 남아 있었음) */
  try{const now=Date.now();houses.forEach((hh,i)=>{if(i===activeIdx)return;if(inHouse(hh.id).some(c=>{const p=Viv.getPlace(c.id),st=Viv.getSim(c.id);return p.mode==='out'&&p.verb==='out_visit'&&st.outUntil&&st.outUntil<=now}))runSim(i,false)})}catch(e){console.warn('[viv visit return]',e.message)}
  if(houses[activeIdx]&&houses[activeIdx].shared){stepShared(activeIdx,true).then(ok=>{if(!ok)renderDetailTimes()});return}
  if(runSim(activeIdx,true)){renderList();softDetail()}else{renderDetailTimes()}}

/* ---------- 목록·상세 패널 ---------- */
function houseOf(id){return houses.find(h=>h.id===id)||null}
function snapOf(hid){const i=houses.findIndex(h=>h.id===hid);if(i<0)return null;const s=qa('.vv-slide')[i];return s&&s._snap?s._snap:null}
function visibleChars(){const sh=curShare();return Viv.chars().filter(c=>!c.remote||(sh&&c.hid===sh.hid))}
function addState(){   // 캐릭터 등록 버튼 상태(공유 집이면 서버의 인원 규칙)
  const sh=curShare();if(!sh){const n=Viv.localChars().length;return {n,max:Viv.MAX_CHARS,ok:n<Viv.MAX_CHARS}}
  const i=SH().info(sh.hid),cs=Viv.chars().filter(c=>c.remote&&c.hid===sh.hid),mine=cs.filter(c=>c.mine).length;
  const max=i?i.limits.chars:8,per=i?i.limits.perMember:4;
  const rh=(SH().reg().houses||{})[sh.hid];if(rh&&(rh.codeFrom==='neighbor'||rh.role==='guest')&&sh.role!=='owner'&&sh.role!=='co')return {n:cs.length,max,ok:false,why:'이웃집에는 캐릭터를 등록할 수 없어요 (놀러가기만 가능). 함께 쓰려면 「입장하기」로 들어오세요'};
  return {n:cs.length,max,ok:cs.length<max&&(sh.role==='owner'||mine<per),why:cs.length>=max?`이 집에는 캐릭터를 ${max}명까지 둘 수 있어요`:`한 사람이 ${per}명까지 등록할 수 있어요`}}
function renderList(){
  const cs=visibleChars(),as=addState();q('#vvCount').textContent=`${as.n}/${as.max}`;q('#vvAdd').disabled=!as.ok;q('#vvAdd').title=as.ok?'':(as.why||'');
  q('#vvChars').innerHTML=cs.length?cs.map(c=>{const p=Viv.getPlace(c.id),h=houseOf(p.house),mv=ucView(c.id).miss;
    const pt=petOfChar(c),st=(p.mode==='out'?'외출 중':(h?`${esc(h.name)} · ${esc(G[p.action]||'')}`:'미배치'))+(h&&!pt?esc(mindEmoTag(c.id)):'')+(pt?` · ${esc(Sim.SPECIES[pt.sp].n)}`:'');
    return `<button class="vv-chip${selChar===c.id?' on':''}${mv?' unc-miss':''}" data-id="${c.id}">${IMG[c.id]?`<img src="${IMG[c.id]}" alt="" onerror="VivUI.imgBad('${esc(c.id)}')">`:`<span class="vv-ini">${esc([...c.name][0]||'?')}</span>`}<span><b>${esc(mv?ucGarble(c.name,mv.nid):c.name)}</b><small>${mv?'ENTITY STATUS: UNKNOWN':st}</small></span></button>`}).join(''):`<p class="hint">아직 등록한 캐릭터가 없어요.</p>`;
  qa('.vv-chip').forEach(b=>b.onclick=()=>selectChar(b.dataset.id))}
function selectChar(id){selChar=id;const p=Viv.getPlace(id),i=houses.findIndex(h=>h.id===p.house);
  if(i>=0&&i!==activeIdx&&p.mode==='home'){scrollTo(i)}else{const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();renderDetail()}}
const nextText=st=>{const m=st&&st.decideAt>Date.now()?Math.max(1,Math.round((st.decideAt-Date.now())/60000)):0;return m?(m>=90?Math.round(m/60)+'시간':m+'분')+' 뒤':'곧'};
function renderDetailTimes(){updNote();if(selChar&&/^(vg|vis):/.test(selChar)){const e0=q('#vvDetail');if(e0)guestDetail(e0,selChar,true);return}const e=q('#vvNextAct');if(e&&selChar)e.textContent=nextText(Viv.getSim(selChar));mindRefresh()}
/* 입력 중이면 패널 전체를 다시 그리지 않고 문구만 갱신(입력 포커스 유지) */
function softDetail(){const el=q('#vvDetail'),a=document.activeElement;
  if(el&&a&&el.contains(a)&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)){const c=selChar&&Viv.char(selChar);if(c){const p=Viv.getPlace(c.id),h=houseOf(p.house),d=describe(c,p,h?snapOf(h.id):null,h?h.name:''),ph=q('.vv-phrase',el);if(ph)ph.textContent=d.phrase;mindRefresh()}return}
  renderDetail()}
/* ---------- v17 반려동물 ---------- */
const PET_NOTE='반려인 캐릭터를 먼저 등록해야 반려동물이 원활하게 움직여요.';
function petStateRows(c,pet){
  const S=Sim.SPECIES[pet.sp],sc=toSimChar(c),ps=Viv.getSim(c.id).pet;if(!ps)return null;const n=Sim.petNeeds(sc,ps,Date.now()),rows=[];
  const lv=(v,a,b)=>v<a?0:v<b?1:2,cls=['ok','mid','bad'];
  const row=(lab,v,t3,l)=>rows.push({lab,w:Math.min(1,v/1.6),t:t3[l],c:cls[l]});
  row('배고픔',n.hunger,['든든해요','출출해요','배고파요'],lv(n.hunger,.4,1));
  if(S.care.includes('water'))row('목마름',n.thirst,['괜찮아요','목이 말라요','물이 필요해요'],lv(n.thirst,.4,1));
  rows.push({lab:'배변',w:Math.min(1,n.dirty/3),t:n.dirty?`치울 것 ${n.dirty}개`:'깨끗해요',c:n.dirty?(n.dirty>1?'bad':'mid'):'ok'});
  row('애정',n.love,['만족해요','심심해요','외로워요'],lv(n.love,.6,1.4));
  if(S.walk)row('산책',n.walk,['충분해요','나가고 싶어요','산책이 필요해요'],lv(n.walk,.4,1));
  return {rows,n}}
const petBars=rows=>rows.map(r=>`<div class="vp-row"><span>${esc(r.lab)}</span><span class="vp-bar"><i class="${r.c}" style="width:${Math.round(r.w*100)}%"></i></span><b>${esc(r.t)}</b></div>`).join('');
function petPanel(c,pet){
  const S=Sim.SPECIES[pet.sp],p=Viv.getPlace(c.id),ow=pet.owner?Viv.chars().find(o=>o.id===pet.owner&&!petOfChar(o)):null,owP=ow?Viv.getPlace(ow.id):null,here=!!(owP&&owP.house&&owP.house===p.house);
  const st=petStateRows(c,pet);
  return `<h4>반려동물 <small>${esc(S.n)}</small></h4><div class="vm-box vp-box">
   <div><b>반려인</b> ${ow?esc(ow.name):'<span class="hint">아직 정하지 않았어요</span>'}${ow&&!here?' <span class="hint">· 다른 집에 있어요</span>':''}</div>
   ${here?'':`<p class="vp-warn">${PET_NOTE} ${ow?'반려인이 이 집에 오면':'반려인을 정해 같은 집에 두면'} 돌봄 상호작용이 생기고, 그 전에는 쉬거나 자고 배고파하는 정도만 해요.</p>`}
   ${st?petBars(st.rows):'<span class="hint">집에 배치하면 상태가 생겨요</span>'}
   <p class="hint">행동은 ${esc(S.n)}에 맞게 단순하게 구성돼요${S.room?' · 있는 방 안에서만 움직여요':''}. 이 기기에만 저장돼요.</p></div>`}
function petCarePanel(c){
  const mine=Viv.chars().filter(o=>{const t=petOfChar(o);return t&&t.owner===c.id});if(!mine.length)return '';
  const p=Viv.getPlace(c.id);
  return `<h4>반려동물 <small>${esc(c.name)}이(가) 돌보는 친구들</small></h4><div class="vm-box vp-box">${mine.map(o=>{const t=petOfChar(o),S=Sim.SPECIES[t.sp],pp=Viv.getPlace(o.id),st=petStateRows(o,t),here=pp.house&&pp.house===p.house;
    const short=st?st.rows.filter(r=>r.c!=='ok').map(r=>r.lab+' '+r.t).join(' · '):'';
    return `<div class="vp-pet"><b>${esc(o.name)}</b> <span class="vv-tag">${esc(S.n)}</span>${here?'':' <span class="hint">· 다른 집/외출</span>'}<div class="hint">${esc(short||'지금은 모두 괜찮아요')}</div></div>`}).join('')}
   <p class="hint">밥주기·물 주기·똥 치우기·산책·쓰다듬기·안아주기·놀아주기 같은 돌봄이 자율 행동에 추가되고, 아래 '직접 행동 지정하기'에서 고를 수도 있어요.</p></div>`}
function anHtml(A){
  const facts=A.factList.map(f=>`<span class="vv-tag fact">${esc(f.label)}: ${esc(f.text)}</span>`).join('')||'<span class="hint">명시된 사실이 없어요</span>';
  const traits=A.traitList.map(t=>`<span class="vv-tag${t.v<0?' neg':''}" title="찾은 단어: ${esc(t.words.join(', '))}">${esc(t.label)} <small>${esc(t.words.slice(0,2).join('·'))}</small></span>`).join('')||'<span class="hint">읽어 낼 단서가 없어 기본 생활 규칙으로 움직여요</span>';
  const cls=(A.clauseList||[]).filter(x=>x.labels.length).map(x=>`<li>“${esc(x.text)}” → ${x.labels.map(l=>esc(l)).join(' · ')}</li>`).join('');
  const hob=(Sim.hobbyPool?Sim.hobbyPool(A):[]);
  return `<div class="hint">프로필에 적힌 사실</div><div class="vv-an">${facts}</div>
  <div class="hint">규칙 추정 (행동 확률만 조정)</div><div class="vv-an">${traits}</div>
  ${cls?`<div class="hint">문장별로 읽은 행동 패턴</div><ul class="vv-cl">${cls}</ul>`:''}
  ${(!A.status&&A.job&&A.job.kind==='parttime')?`<div class="hint">일하기 규칙</div><div class="vv-an"><span class="vv-tag fact">알바: 「알바하러 가기」를 누르면 아르바이트를 하러 나가요</span></div>`:A.status?`<div class="hint">일하기 규칙</div><div class="vv-an"><span class="vv-tag fact">${esc(({student:'학생',jobseeker:'취준생',jobless:'백수',unemployed:'무직'})[A.status.kind])}: 「알바하러 가기」를 누르면 아르바이트를 하러 나가요 (프리랜서·직장인으로 보지 않아요)</span></div>`:A.job?`<div class="hint">일하기 규칙</div><div class="vv-an"><span class="vv-tag fact">${A.job.kind==='freelance'?'프리랜서: 집에서 컴퓨터·책상으로 일하는 모습이 나와요':'평일(공휴일 제외) 오전 9시~오후 6시에 일하러 나가요'}${A.job.night?' · 밤·새벽 근무 단어가 있어 18시 이후에도 일할 수 있어요':''}</span></div>`:''}
  ${hob.length?`<div class="hint">가구 없이도 즐길 수 있는 취미·좋아하는 것</div><div class="vv-an">${hob.map(w=>`<span class="vv-tag">${esc(w)}</span>`).join('')}</div>`:''}`}
/* 존재 오류(NOT FOUND) 상태의 상세 화면: 글자가 깨지고 error 문구가 군데군데 섞여 보임. 표시만 손상(원본 데이터는 그대로)이며, 눌러볼 수 있는 것은 '삭제'뿐 */
const UC_GL='█▓▒░#?¿Ω§¤ǝʇ■□@%&';
const UC_ERR=['errorr','ERR0R','err_0x80004005','NULL','undefined','[404]','FAULT','nan','⟨corrupt⟩','0xDEAD'];
function ucCorruptText(t,rnd,heavy){return String(t).split(/(\s+)/).map(w=>{if(!w.trim())return w;let o=[...w].map(ch=>rnd()<(heavy?.34:.2)?UC_GL[Math.floor(rnd()*UC_GL.length)]:ch).join('');if(rnd()<(heavy?.26:.14))o+=' '+UC_ERR[Math.floor(rnd()*UC_ERR.length)];return o}).join('')}
/* 존재 오류 이미지 효과(픽셀 단위): 가로 조각 밀림, RGB 채널 분리(빨강·파랑이 따로 어긋남), 모자이크 블록, 누락 블록, 주사선.
   원본 이미지 파일·캐릭터 데이터는 바꾸지 않고 화면의 임시 <canvas>/그림만 쓴다. 상세 서랍 이미지와 단면도 위 캐릭터가 같은 함수를 쓴다. */
const ucRng=()=>{let seed=(Date.now()&0xffff)|1;return()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
function ucPixFrame(cx,src,W,H,burst,r){
  cx.clearRect(0,0,W,H);cx.drawImage(src,0,0);
  const nS=burst?3+Math.floor(r()*5):Math.floor(r()*2);
  for(let i=0;i<nS;i++){const y=Math.floor(r()*H*.95),h=Math.max(2,Math.floor(H*(.02+r()*.09))),dx=Math.round((r()-.5)*W*(burst?.5:.12));cx.clearRect(0,y,W,h);cx.drawImage(src,0,y,W,h,dx,y,W,h)}
  const nB=burst?2+Math.floor(r()*4):0;cx.imageSmoothingEnabled=false;
  for(let i=0;i<nB;i++){const bw=Math.floor(W*(.12+r()*.28)),bh=Math.floor(H*(.05+r()*.12)),bx=Math.floor(r()*(W-bw)),by=Math.floor(r()*(H-bh)),k=6+Math.floor(r()*8),t=document.createElement('canvas');t.width=Math.max(1,Math.floor(bw/k));t.height=Math.max(1,Math.floor(bh/k));
    t.getContext('2d').drawImage(cx.canvas,bx,by,bw,bh,0,0,t.width,t.height);cx.clearRect(bx,by,bw,bh);cx.drawImage(t,0,0,t.width,t.height,bx,by,bw,bh)}
  cx.imageSmoothingEnabled=true;
  const d=Math.max(2,Math.round(W*(burst?.025+r()*.03:.012))),id=cx.getImageData(0,0,W,H),a=id.data,o=new Uint8ClampedArray(a);
  for(let y=0;y<H;y++){const row=y*W*4;for(let x=0;x<W;x++){const i=row+x*4,xr=Math.max(0,x-d),xb=Math.min(W-1,x+d);o[i]=a[row+xr*4];o[i+2]=a[row+xb*4+2];o[i+3]=Math.max(a[i+3],a[row+xr*4+3],a[row+xb*4+3])}}
  id.data.set(o);cx.putImageData(id,0,0);
  if(burst){const nD=1+Math.floor(r()*3);for(let i=0;i<nD;i++){const bw=Math.floor(W*(.05+r()*.14)),bh=Math.floor(H*(.02+r()*.05));cx.clearRect(Math.floor(r()*(W-bw)),Math.floor(r()*(H-bh)),bw,bh)}
    cx.globalCompositeOperation='source-atop';cx.fillStyle=`rgba(${r()<.5?255:0},${r()<.5?255:0},${r()<.5?255:0},.22)`;cx.fillRect(0,Math.floor(r()*H),W,Math.floor(H*.05));cx.globalCompositeOperation='source-over'}
  cx.globalCompositeOperation='source-atop';cx.fillStyle='rgba(0,0,0,.16)';for(let y=0;y<H;y+=3)cx.fillRect(0,y,W,1);cx.globalCompositeOperation='source-over'}
function ucPicGlitch(img){
  if(!img||img.dataset.ucg)return;img.dataset.ucg='1';
  const go=()=>{const W=Math.min(260,img.naturalWidth||200),H=Math.round(W*(img.naturalHeight||250)/(img.naturalWidth||200));if(!(W>8&&H>8))return;
    const src=document.createElement('canvas');src.width=W;src.height=H;src.getContext('2d').drawImage(img,0,0,W,H);
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;cv.className='vv-ucg';cv.style.cssText='display:block;width:100%;height:auto';cv.setAttribute('role','img');cv.setAttribute('aria-label',img.alt||'');
    const cx=cv.getContext('2d',{willReadFrequently:true});img.replaceWith(cv);const r=ucRng();
    ucPixFrame(cx,src,W,H,true,r);if(calmMotion())return;
    let last=0,hold=0;const loop=t=>{if(!cv.isConnected)return;if(t-last>=90){last=t;if(hold>0)hold--;else{const b=r()<.32;ucPixFrame(cx,src,W,H,b,r);if(!b)hold=Math.floor(r()*4)}}requestAnimationFrame(loop)};requestAnimationFrame(loop)};
  if(img.complete&&img.naturalWidth)go();else img.addEventListener('load',go,{once:true})}
/* 단면도 위 캐릭터: 같은 픽셀 효과를 ms 동안 프레임마다 바꿔 끼움(끝나면 원래 그림으로 복구). sev 가 클수록 더 자주·세게 */
function ucPixStage(imgEl,ms,sev){
  if(!imgEl||calmMotion())return;const href=imgEl.getAttribute('href');if(!href)return;
  const hold=new Image();hold.onload=()=>{const W=Math.min(260,hold.naturalWidth||200),H=Math.round(W*(hold.naturalHeight||250)/(hold.naturalWidth||200));if(!(W>8&&H>8))return;
    const src=document.createElement('canvas');src.width=W;src.height=H;src.getContext('2d').drawImage(hold,0,0,W,H);
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d',{willReadFrequently:true}),r=ucRng();let t0=performance.now(),last=0;
    const loop=t=>{if(!imgEl.isConnected)return;if(t-t0>=ms){imgEl.setAttribute('href',href);return}
      if(t-last>=80){last=t;ucPixFrame(cx,src,W,H,r()<.4+sev*.15,r);imgEl.setAttribute('href',cv.toDataURL('image/png'))}requestAnimationFrame(loop)};requestAnimationFrame(loop)};
  hold.src=href}
function ucCorruptDetail(el,c,mm){
  const r=(()=>{let a=((mm.nid|0)+11)|0;return()=>{a=a+0x6D2B79F5|0;let x=Math.imul(a^a>>>15,1|a);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296}})();
  const box=q('#vvMind',el);
  if(box)box.innerHTML=`<h4>현재 감정</h4><div class="vm-box"><p>EMO_STATE = undefined</p><p>errorr 0x80004005 — 감정 데이터를 읽을 수 없습니다</p><p>관계: ░▒▓ NULL_REF[?] / 기억: RECORD CORRUPTED</p><p>SEGMENT FAULT (core dumped)</p></div>`;
  qa('textarea',el).forEach(t=>{const d=document.createElement('div');d.className='vv-ucprof';d.textContent=t.value||' ';t.replaceWith(d)});
  const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:n=>(n.nodeValue.trim().length>1&&!/ENTITY STATUS|CHARACTER DATA UNAVAILABLE|RECORD CORRUPTED/.test(n.nodeValue)&&!(n.parentElement&&n.parentElement.closest('#vdDel,script,style')))?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}),ns=[];while(w.nextNode())ns.push(w.currentNode);
  ns.forEach((n,i)=>{n.nodeValue=ucCorruptText(n.nodeValue,r,i%3===0)});
  qa('button,input,select,textarea',el).forEach(b=>{if(b.id!=='vdDel')b.disabled=true});
  if(!document.getElementById('ucTearSvg')){const s=document.createElement('div');s.id='ucTearSvg';s.setAttribute('aria-hidden','true');s.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
    s.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><filter id="ucTear" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0 0.7" numOctaves="1" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"><animate attributeName="scale" dur="3.4s" repeatCount="indefinite" values="0;0;0;0;16;0;0;26;0;0;0;10;0" keyTimes="0;.2;.4;.5;.52;.54;.7;.72;.74;.85;.9;.92;1"/></feDisplacementMap></filter></svg>';document.body.appendChild(s)}
  ucPicGlitch(q('.vv-pic img',el));
  el.classList.add('vv-uc-corrupt');qa('h3,h4,dt,dd,p,.vv-tag,.vm-box',el).forEach((n,i)=>{if(i%2===0)n.style.setProperty('--ucd',(r()*3).toFixed(2)+'s')})}
/* 이웃집에서 놀러 온 손님: 선택하면 이름·현재 위치·행동을 보고, 내 브라우저에서 등록한 캐릭터('vg:' 사본)는 그 집 가구·다른 사람이 등록한 캐릭터와 하는 행동을 직접 지정할 수 있다 */
const GUEST_WISH=['read','eat','rest','work','tv','study','hobby','care','chat'];   // 잠자기·일하러 나가기·산책·친구 연락·반려동물 돌봄은 남의 집에서는 하지 않음
const raw0=id=>String(id).replace(/^(vg|vis):/,'');
function guestInfo(id){
  const h=houses[activeIdx],raw=String(id).replace(/^vg:/,''),g=h&&visitorsOf(h.id).find(x=>x.id===raw||x.id===id);if(!g)return null;
  const srv=!!g.srvVisit,p=srv?null:Viv.getPlace(id),snap=h?snapOf(h.id):null;
  const d=srv?{loc:h.name,act:g.say||'집 구경 중',phrase:`${g.name}: ${g.say||'놀러 왔어요'}`}:describe(g,p&&p.house===h.id&&p.mode!=='out'?p:{...p,mode:'home'},snap,h.name);
  const from=srv?(g.fromName||'다른 집'):((houses.find(x=>x.id===(Viv.getPlace(raw)||{}).house)||{}).name||'다른 집');
  return {h,g,srv,snap,d,from,raw}}
function guestDetail(el,id,soft){
  const I=guestInfo(id);if(!I){selChar=null;el.innerHTML='<h3>상세</h3><p class="hint">손님이 돌아갔어요.</p>';return}
  const {h,g,srv,snap,d,from}=I;
  if(soft&&el.dataset.guest===id){const ph=q('.vv-phrase',el),dd=qa('dd',el);if(ph)ph.textContent=d.phrase;if(dd[0])dd[0].textContent=d.loc;if(dd[1])dd[1].textContent=d.act;return}
  el.dataset.guest=id;
  const own=srv?Viv.char(raw0(id)):null,canS=!!(srv&&own&&canSetC(own)&&own.remote&&(g.gp&&g.gp.mode==='home'));   // 서버가 계산하는 이웃집 방문: 내가 등록한 캐릭터가 그 집에 도착해 있으면 행동 지정 가능
  const canW=(!srv&&snap&&Viv.guestHas(id)&&(Viv.getPlace(id)||{}).mode!=='out')||canS;
  let wish='<p class="hint">놀러 온 손님이라 이름·프로필 수정은 원래 집에서 할 수 있어요.</p>';
  if(canW){const sc=toSimChar({...g,id:srv?'vg:'+raw0(id):id}),opts=(()=>{try{return Sim.wishOptions(simCtx(h,snap),sc).filter(o=>GUEST_WISH.includes(o.id)).map(o=>srv?{...o,ok:true}:o)}catch(e){return GUEST_WISH.map(k=>({id:k,label:k,ok:true}))}})(),
      wb=o=>`<button data-w="${o.id}" ${o.ok?'':'disabled'} title="${esc(o.ok?'':o.why)}">${esc(o.id==='chat'?'이 집의 다른 캐릭터와 대화하기':o.label)}</button>`;
    wish=`<h4>직접 행동 지정하기 <small>이 집의 가구·캐릭터와</small></h4><div class="vv-wishes">${opts.map(wb).join('')}</div><div id="vvWmsg" class="vv-wmsg"></div><p class="hint">고르면 이 집에 있는 가구와 다른 사람이 등록한 캐릭터를 포함해 가능한 조건을 확인하고 바로 반영해요.</p>`}
  el.innerHTML=`<h3><span class="vv-nm">${esc(g.name)}</span> <small class="vv-tag fact">손님</small></h3>
  <div class="vv-pic">${IMG[id]||IMG[g.id]?`<img src="${IMG[id]||IMG[g.id]}" alt="${esc(g.name)}">`:'<span>이미지 없음</span>'}</div>
  <p class="vv-phrase">${esc(d.phrase)}</p>
  <dl><dt>현재 위치</dt><dd>${esc(d.loc)}</dd><dt>현재 행동</dt><dd>${esc(d.act)}</dd><dt>방문</dt><dd>${esc(from)}에서 놀러 왔어요</dd></dl>${wish}`;
  qa('.vv-wishes button',el).forEach(b=>b.onclick=()=>{
    if(srv){const m=q('#vvWmsg',el);m.textContent='반영하는 중…';m.className='vv-wmsg';
      SH().guestWish(own.hid,raw0(id),b.dataset.w).then(r=>{const m2=q('#vvWmsg',el);if(!m2)return;if(r.ok){m2.textContent='선택을 반영했어요';m2.className='vv-wmsg'}else{m2.textContent=r.why;m2.className='vv-wmsg err'}});return}
    const ctx=simCtx(h,snap),r=Sim.setWish(ctx,toSimChar({...g,id}),b.dataset.w);
    if(!r.ok){const m=q('#vvWmsg',el);m.textContent=r.why;m.className='vv-wmsg err';return}
    runSim(activeIdx,true);renderList();guestDetail(el,id);const m=q('#vvWmsg',el);if(m)m.textContent='선택을 반영했어요'})}
function renderDetail(){
  const el=q('#vvDetail'),c=selChar&&Viv.char(selChar);el.classList.remove('vv-uc-corrupt');
  if(!c&&selChar&&/^(vg|vis):/.test(selChar)){guestDetail(el,selChar);return}
  if(!c){el.innerHTML=`<h3>상세</h3><p class="hint">캐릭터를 선택하면 이름, 프로필, 현재 위치와 행동을 볼 수 있어요.<br><br>도면 위의 캐릭터는 끌어서 옮기고, 오른쪽 위 동그라미를 끌면 비율을 유지한 채 크기가 바뀌어요. 직접 옮기면 20분 동안 그 자리에서 쉬다가 다시 스스로 움직여요.</p>`;return}
  const p=Viv.getPlace(c.id),h=houseOf(p.house),snap=h?snapOf(h.id):null,d=describe(c,p,snap,h?h.name:'');
  const pet=petOfChar(c),placed=!!h,out=p.mode==='out',A=Sim.analyze(profText(c),c.name,humansIn(p.house)),st=Viv.getSim(c.id);
  const UVw=ucView(c.id),mm=UVw.miss;let dispName=c.name;
  if(mm){dispName=ucGarble(c.name,mm.nid);d.phrase=mm.msgProfile;d.loc='UNKNOWN';d.act='ENTITY STATUS: UNKNOWN'}   // 존재 오류: 표시만 손상(원본 프로필·관계·위치 데이터는 그대로)
  const ro=!canEdit(c),isRem=!!c.remote,owner=isRem?((SH().info(c.hid)||{members:[]}).members.find(m=>m.pid===c.owner)||{}).nick:'';
  const hopts=(isRem?'':`<option value="">미배치</option>`)+houses.filter(x=>isRem?x.id===p.house:!x.shared).map(x=>`<option value="${esc(x.id)}" ${x.id===p.house?'selected':''}>${esc(x.name)}</option>`).join('');
  let wishHtml='<p class="hint">집에 배치하면 행동 방향을 고를 수 있어요.</p>';
  if(mm)wishHtml='<p class="vv-ucmono">CHARACTER DATA UNAVAILABLE</p>';
  else if(ro)wishHtml='<p class="hint">다른 참여자의 캐릭터예요. 볼 수만 있고, 직접 행동 지정하기·이동·수정은 등록한 사람과 집 주인만 할 수 있어요.</p>';
  else if(placed&&out)wishHtml='<p class="hint">외출 중에는 행동 방향을 고를 수 없어요. 돌아오면 다시 고를 수 있어요.</p><div class="vv-btns"><button type="button" id="vvRecall" class="vv-primary">집으로 돌아오게 하기</button></div>';
  else if(placed&&snap){const opts=Sim.wishOptions(simCtx(h,snap),toSimChar(c));
    const wb=o=>`<button data-w="${o.id}" ${o.ok?'':'disabled'} title="${esc(o.ok?'':o.why)}">${esc(o.label)}</button>`,care=opts.filter(o=>/^care:/.test(o.id)),base=opts.filter(o=>!/^care:/.test(o.id));
    wishHtml=`<div class="vv-wishes">${base.map(wb).join('')}</div>${care.length?`<div class="hint vv-carehd">반려동물 돌보기</div><div class="vv-wishes">${care.map(wb).join('')}</div>`:''}<div id="vvWmsg" class="vv-wmsg"></div>`+opts.filter(o=>!o.ok).map(o=>`<div class="vv-why">· ${esc(o.label)}: ${esc(o.why)}</div>`).join('')}
  const facts=A.factList.map(f=>`<span class="vv-tag fact">${esc(f.label)}: ${esc(f.text)}</span>`).join('')||'<span class="hint">명시된 사실이 없어요</span>';
  const traits=A.traitList.map(t=>`<span class="vv-tag${t.v<0?' neg':''}" title="찾은 단어: ${esc(t.words.join(', '))}">${esc(t.label)} <small>${esc(t.words.slice(0,2).join('·'))}</small></span>`).join('')||'<span class="hint">읽어 낼 단서가 없어 기본 생활 규칙으로 움직여요</span>';
  const canPen=!ro&&!mm&&canSetC(c);
  el.innerHTML=`<h3><span class="vv-nm">${esc(dispName)}</span>${canPen?'<button type="button" class="vv-pen" id="vdPenN" title="이름 수정" aria-label="이름 수정">✎</button>':''}</h3>
  <div class="vv-pic${mm?' vv-uc-bad':(UVw.st==='damaged'?' vv-uc-dmg':'')}">${IMG[c.id]?`<img src="${IMG[c.id]}" alt="${esc(c.name)}" onerror="VivUI.imgBad('${esc(c.id)}')">`:'<span>이미지 없음</span>'}</div>${canPen?'<button type="button" class="vv-pen vv-pen-img" id="vdPenI" title="이미지 수정" aria-label="이미지 수정">✎</button><input type="file" id="vdImgF" accept="image/png,image/jpeg,image/webp,image/gif" hidden>':''}
  <p class="vv-phrase">${esc(d.phrase)}</p>
  <dl><dt>현재 위치</dt><dd>${esc(d.loc)}</dd><dt>현재 행동</dt><dd>${esc(d.act)}</dd><dt>다음 행동</dt><dd id="vvNextAct">${placed?esc(nextText(st)):'-'}</dd>${isRem?`<dt>등록한 사람</dt><dd>${esc(owner||'참여자')}${c.mine?' (나)':''}</dd>`:''}<dt>프로필</dt><dd class="vv-prof">${ro?(profText(c)?esc(profText(c)):'<span class="hint">프로필이 비어 있어요</span>'):`<textarea id="vdProf" rows="5" maxlength="${Viv.PROFILE_MAX}" placeholder="성격·직업·취미·생활 습관을 적어 주세요. 고치면 아래 해석이 바로 바뀌고 자동 저장돼요.">${esc(profText(c))}</textarea><span class="hint" id="vdProfSt">고치면 자동으로 저장돼요</span>`}</dd></dl>
  ${pet?'':'<div id="vvMind"></div>'}${pet?petPanel(c,pet):petCarePanel(c)}
  <h4>직접 행동 지정하기</h4>${wishHtml}
  <p class="hint">고르면 가능한 조건(가구·길·서울 시각)을 확인해 바로 반영하고, 이후 한동안 그 방향이 조금 더 자주 나와요. 고르지 않아도 자율 행동은 계속돼요.</p>
  ${pet?'':`<h4>프로필 해석 <small>키워드 규칙 · AI 아님</small></h4>
  <div id="vdAn">${anHtml(A)}</div>`}
  ${canPen?kindEditHtml(c,pet):''}
  <label>크기(높이 cm) <span class="row"><input type="range" id="vdSz" min="${HMIN}" max="${HMAX}" value="${Math.round(p.h)}" ${placed&&!out&&!ro?'':'disabled'}><input type="number" id="vdSzN" min="${HMIN}" max="${HMAX}" value="${Math.round(p.h)}" ${placed&&!out&&!ro?'':'disabled'}></span></label>
  <div class="vv-btns"><button id="vdDel" class="vv-danger" ${ro||!canSetC(c)?'disabled':''}>삭제</button></div>`;
  if(mm)ucCorruptDetail(el,c,mm);else if(!pet)mindFill(q('#vvMind',el),c);
  /* 이름·이미지는 상세 머리말의 연필로 바로 고침(수정 대화상자 없이 같은 저장 경로 사용) */
  const quick=async(d,prep)=>{if(c.remote)await SH().updateChar(c.id,Viv.validate?Viv.validate(d):d,prep);else await Viv.saveChar(d,prep,c.id);
    if(prep){delete IMG[c.id];const u=await Viv.imageUrl(c.id);if(u)IMG[c.id]=u}
    const s2=qa('.vv-slide')[activeIdx];s2&&drawChars(s2);renderList();renderDetail()};
  {const pn=q('#vdPenN',el);if(pn)pn.onclick=()=>{const nm=q('.vv-nm',el);if(!nm||q('input',nm))return;
    const inp=document.createElement('input');inp.className='vv-nmin';inp.maxLength=Viv.NAME_MAX;inp.value=c.name;nm.textContent='';nm.appendChild(inp);inp.focus();inp.select();pn.hidden=true;
    let done=false;const end=async ok=>{if(done)return;done=true;const v2=inp.value.trim();
      if(!ok||!v2||v2===c.name){renderDetail();return}
      try{await quick({name:v2,profile:withTag(c,profText(c))},null)}catch(ex){note(ex.message||String(ex),'warn');renderDetail()}};
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();end(true)}else if(e.key==='Escape'){e.stopPropagation();end(false)}};inp.onblur=()=>end(true)}}
  {const pi2=q('#vdPenI',el),fi=q('#vdImgF',el);if(pi2&&fi){pi2.onclick=()=>fi.click();
    fi.onchange=async()=>{const f=fi.files[0];if(!f)return;
      try{const prep=await Viv.prepareImage(f,c.remote?{bytes:1100*1024}:undefined);await quick({name:c.name,profile:withTag(c,profText(c))},prep)}catch(ex){note(ex.message||String(ex),'warn')}}}}
  {const ta=q('#vdProf',el);if(ta){let tm=0,last=profText(c);const stEl=q('#vdProfSt',el);
    ta.oninput=()=>{   // 입력하는 즉시 해석을 새로 읽어 보여 주고, 잠시 멈추면 자동 저장
      const an=q('#vdAn',el);if(an)an.innerHTML=anHtml(Sim.analyze(ta.value,c.name,humansIn(p.house)));
      stEl.textContent='저장 대기 중…';clearTimeout(tm);tm=setTimeout(save,900)};
    async function save(){const v=ta.value;if(v===last)return stEl.textContent='저장됨';stEl.textContent='저장 중…';const vt=withTag(c,v);
      try{if(c.remote){await SH().updateChar(c.id,Viv.validate?Viv.validate({name:c.name,profile:vt}):{name:c.name,profile:vt},null)}else{await Viv.saveChar({name:c.name,profile:vt},null,c.id)}
        last=v;stEl.textContent='저장됨 — 해석이 바로 반영돼요';const s2=qa('.vv-slide')[activeIdx];s2&&drawChars(s2);renderList()}
      catch(ex){stEl.textContent='저장하지 못했어요: '+(ex.message||ex)}}
    ta.onblur=()=>{clearTimeout(tm);if(ta.value!==last)save()}}}
  q('#vdDel').onclick=async()=>{if(!confirm(c.remote?`'${c.name}' 캐릭터를 삭제할까요? 서버에서 이미지와 프로필이 지워져요.`:`'${c.name}' 캐릭터를 삭제할까요? 이미지와 프로필이 이 브라우저에서 지워져요.`))return;
    try{if(c.remote)await SH().removeChar(c.id);else await Viv.removeChar(c.id)}catch(e){note(e.message,'warn');return}if(MD()){MD().forget(MD().store.get(),c.id);MD().store.save()}if(UC()){UC().forget(UC().store.get(),c.id);UC().store.save()}if(mindSel===c.id)mindSel=null;selChar=null;delete IMG[c.id];const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();renderDetail()};
  kindEditBind(el,c,pet,quick);
  const hsel=q('#vdHouse');if(hsel)hsel.onchange=e=>{const v=e.target.value;
    if(!v)Viv.setPlace(c.id,{house:null,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null});
    else{Viv.setPlace(c.id,{house:v,x:null,f:0,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null});Viv.setSim(c.id,{decideAt:0,then:null,outUntil:0})}
    refreshStage(v)};
  const rc=q('#vvRecall',el);if(rc)rc.onclick=async()=>{const js=Sim.jobSlot(A,Date.now()),nj=js?Date.now()+Math.max(30,Math.round((js.end-Sim.seoul(Date.now()).hm)*60))*60000:0;   // 직접 지정이 일하기 규칙보다 우선: 오늘 근무 시간이 끝날 때까지 자동 출근을 멈춤
    Viv.setSim(c.id,{outUntil:0,decideAt:0,then:null,wish:null,noJobUntil:nj,homeUntil:Date.now()+3*3600000});   // 돌아온 뒤 3시간은 스스로 다시 나가지 않음
    const hh=houses[activeIdx];if(hh&&hh.shared){await stepShared(activeIdx,true)}else runSim(activeIdx,true);renderList();renderDetail();const ws=q('.vv-wishes');if(ws){ws.scrollIntoView({block:'center',behavior:'smooth'});ws.classList.add('vv-flash');setTimeout(()=>ws.classList.remove('vv-flash'),2200);const m=q('#vvWmsg');if(m)m.textContent=nj?'돌아왔어요. 오늘 근무 시간에는 자동 출근을 쉬고, 아래에서 직접 행동을 정할 수 있어요.':'돌아왔어요. 아래에서 직접 행동을 정해 주세요.'}};
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
  const dlg=q('#vvDlg'),c=id?Viv.char(id):null;let prep=null;const pi=c?petOfChar(c):null;
  const sh=c&&c.remote?{hid:c.hid}:(!c?curShare():null),imgOpt=sh?{bytes:1100*1024}:undefined;
  const owners=(sh?Viv.chars().filter(x=>x.remote&&x.hid===sh.hid):Viv.localChars()).filter(x=>!petOfChar(x)&&(!c||x.id!==c.id));   // 반려인 후보: 같은 범위의 사람 캐릭터   // 공유 집에는 서버 한도에 맞춰 이미지를 조금 더 작게 저장
  dlg.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>${c?'캐릭터 프로필 수정':'캐릭터 등록'}</h3>
  <label>이름 <input id="vfName" maxlength="${Viv.NAME_MAX}" value="${esc(c?c.name:'')}" placeholder="예) 보리"></label>
  ${(!c||pi)?`<div class="vv-kind">${c?'':'<div class="vv-kindrow"><span>종류</span><label class="inl"><input type="radio" name="vfKind" value="person" checked> 사람</label><label class="inl"><input type="radio" name="vfKind" value="pet"> 반려동물</label></div>'}
   <div id="vfPetBox" ${pi?'':'hidden'}><p class="vp-warn"><b>${PET_NOTE}</b><br>반려인이 없으면 쉬거나 자고 배고파하는 정도만 해요. 반려인이 있으면 밥주기·물 주기·똥 치우기·산책하기·쓰다듬기·안아주기·놀아주기 같은 상호작용이 생겨요.</p>
   <label>동물 종 <select id="vfSp">${Sim.SPECIES_IDS.map(k=>`<option value="${k}" ${pi&&pi.sp===k?'selected':''}>${esc(Sim.SPECIES[k].n)}</option>`).join('')}</select></label>
   <label>반려인 <select id="vfOwner"><option value="">(아직 정하지 않음)</option>${owners.map(o=>`<option value="${esc(o.id)}" ${pi&&pi.owner===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
   ${owners.length?'':'<p class="hint">등록된 사람 캐릭터가 없어요. 먼저 반려인 캐릭터를 등록한 뒤 반려동물을 등록하면 좋아요.</p>'}</div></div>`:''}
  <label>이미지 (PNG·JPEG·WebP·GIF, 5MB 이하) <input type="file" id="vfFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
  <label class="vv-chkrow"><input type="checkbox" id="vfCut" checked> 배경 자동 제거 (단색 배경이면 투명 PNG처럼 등록돼요)</label>
  <div class="vv-prev"><div class="vv-chk">${c&&IMG[c.id]?`<img id="vfPrev" src="${IMG[c.id]}" alt="">`:'<img id="vfPrev" alt="" hidden>'}</div><div id="vfInfo" class="hint">${c&&c.img?`현재 이미지: ${c.img.w}×${c.img.h} · ${c.img.alpha?'투명 배경 있음':'투명 배경 없음'}`:'이미지를 고르면 미리보기가 나와요 (선택 사항)'}</div></div>
  ${sh?'<p class="hint"><b>공유 집 캐릭터</b>예요. 이름·프로필·이미지는 서버에 저장돼 이 집의 참여자 모두가 볼 수 있고, 수정·삭제는 나와 집 주인만 할 수 있어요.</p>':''}<label>프로필 — 성격, 생활 습관 등을 자유롭게 적어 주세요 <textarea id="vfProf" rows="7" maxlength="${Viv.PROFILE_MAX}" placeholder="예) 밤늦게까지 깨어 있는 올빼미형. 아침엔 커피부터 마시고, 비 오는 날엔 창가에서 책 읽는 걸 좋아해요.">${esc(c?profText(c):'')}</textarea></label>
  <div class="hint" id="vfCnt"></div><div class="vv-err" id="vfErr" role="alert"></div>
  <div class="vv-btns"><button type="button" id="vfCancel">취소</button><button type="button" id="vfSave" class="vv-primary">저장</button></div></form>`;
  const err=m=>{q('#vfErr',dlg).textContent=m||''},cnt=()=>{q('#vfCnt',dlg).textContent=`${q('#vfProf',dlg).value.length}/${Viv.PROFILE_MAX}자`};cnt();
  q('#vfProf',dlg).oninput=cnt;
  qa('input[name=vfKind]',dlg).forEach(r=>r.onchange=()=>{const pet=q('input[name=vfKind]:checked',dlg).value==='pet';q('#vfPetBox',dlg).hidden=!pet});
  q('#vfFile',dlg).onchange=async e=>{err('');prep=null;const f=e.target.files[0];if(!f){return}
    q('#vfInfo',dlg).textContent='이미지를 확인하는 중…';
    try{prep=await Viv.prepareImage(f,{...(imgOpt||{}),cutout:q('#vfCut',dlg).checked});const im=q('#vfPrev',dlg);if(im.dataset.u)URL.revokeObjectURL(im.dataset.u);im.dataset.u=im.src=URL.createObjectURL(prep.blob);im.hidden=false;
      q('#vfInfo',dlg).innerHTML=`${prep.srcType} · 원본 ${prep.srcW}×${prep.srcH} (${(prep.srcBytes/1048576).toFixed(2)}MB)<br>저장 크기 ${prep.w}×${prep.h} (${Math.round(prep.blob.size/1024)}KB) · <b>${prep.cut&&prep.cut.ok?'배경을 자동으로 지웠어요':prep.alpha?'투명 배경이 있어요(그대로 유지)':'투명 배경 없음'+(prep.cut?' ('+prep.cut.why+')':'')}</b>${prep.srcType==='GIF'?'<br>GIF 는 첫 장면만 사용해요':''}<br>원본 비율은 그대로 유지돼요`}
    catch(ex){e.target.value='';prep=null;q('#vfInfo',dlg).textContent='';err(ex.message)}};
  q('#vfCut',dlg).onchange=()=>{const f=q('#vfFile',dlg).files[0];if(f)q('#vfFile',dlg).onchange({target:q('#vfFile',dlg)})};
  q('#vfCancel',dlg).onclick=()=>dlg.close();
  q('#vfSave',dlg).onclick=async()=>{err('');const btn=q('#vfSave',dlg);btn.disabled=true;
    try{const kindPet=pi||(!c&&q('input[name=vfKind]:checked',dlg)&&q('input[name=vfKind]:checked',dlg).value==='pet');const spv=kindPet?q('#vfSp',dlg).value:null,owv=kindPet?q('#vfOwner',dlg).value:null;
      const d={name:q('#vfName',dlg).value,profile:(kindPet?Sim.petTag(spv,owv):'')+q('#vfProf',dlg).value};let ch;
      if(c&&c.remote){const v=Viv.validate?Viv.validate(d):d;await SH().updateChar(c.id,v,prep);ch=Viv.char(c.id)||c}
      else if(!c&&sh){const nm=d.name.trim();if(!nm)throw new Error('캐릭터 이름을 입력하세요');if(nm.length>Viv.NAME_MAX)throw new Error(`이름은 ${Viv.NAME_MAX}자 이하로 입력하세요`);if(d.profile.length>Viv.PROFILE_MAX)throw new Error(`프로필은 ${Viv.PROFILE_MAX}자 이하로 입력하세요`);
        const nid=await SH().createChar(sh.hid,{name:nm,profile:d.profile,place:{f:0,x:null,mode:'home'},sim:{decideAt:0}},prep);ch=Viv.char(nid);if(!ch)throw new Error('등록은 됐지만 목록을 새로 받지 못했어요. 새로고침해 주세요')}
      else ch=await Viv.saveChar(d,prep,c?c.id:null);
      if(prep){delete IMG[ch.id];const u=await Viv.imageUrl(ch.id);if(u)IMG[ch.id]=u}
      const hz=kindPet&&!c?{h:Sim.SPECIES[spv].h}:{};
      if(!c&&sh){const h=houses[activeIdx];Viv.setPlace(ch.id,{house:h.id,x:null,f:0,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null,...hz});Viv.setSim(ch.id,{decideAt:0});runSim(activeIdx,false)}
      else if(!c){let h=houses[activeIdx];const oh=owv&&houseOf(Viv.getPlace(owv).house);if(oh&&!oh.shared)h=oh;   // 반려동물은 반려인이 사는 집에 배치
        if(h){Viv.setPlace(ch.id,{house:h.id,x:null,f:0,mode:'home',say:'',tgt:null,verb:'',pose:'stand',dy:0,e:null,...hz});Viv.setSim(ch.id,{decideAt:0});if(h!==houses[activeIdx]){const i2=houses.indexOf(h);i2>=0&&runSim(i2,false)}else runSim(activeIdx,false)}}
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
function onShareChange(ev){if(ev&&ev.type==='saveerr'){try{note(ev.msg,'bad')}catch(e){}return}clearTimeout(shT);shT=setTimeout(async()=>{
  if(mode!=='viv'||!booted)return;
  const nh=getHouses();const same=nh.length===houses.length&&nh.every((h,i)=>h.key===houses[i].key&&h.id===houses[i].id);
  if(!same){enter(true);return}
  await loadImages();const s=qa('.vv-slide')[activeIdx];s&&drawChars(s);renderList();softDetail();shareLabel();
  const h=houses[activeIdx];if(h&&h.shared&&!document.hidden){const i=SH().info(h.shared.hid);if(i&&(!i.leaderPid||i.leaderPid===i.me.pid))stepShared(activeIdx,true)}},150)}
function shareLabel(){hoodUi();const b=q('#vvShare');if(!b)return;
  if(!shareOn()){b.hidden=false;b.textContent='집 공유하기';return}
  const sh=curShare();if(!sh){b.textContent='집 공유하기';return}
  const i=SH().info(sh.hid);b.textContent=`공유 중 · ${i?i.members.length:'?'}명 · ${sh.role==='owner'?'관리':'공유·정보'}`}

const dlgOf=()=>q('#vvDlg');
const waitMsg=e=>e.status===429?`${e.message}${e.retryAfter?` (약 ${Math.max(1,Math.ceil(e.retryAfter/60))}분 뒤 다시 시도)`:''}`:e.message;
function notReady(){const d=dlgOf();d.innerHTML=`<form class="vv-form" method="dialog"><h3>공유 서버가 아직 연결되지 않았어요</h3><p class="hint">초대 코드로 집을 함께 쓰려면 공유 서버가 필요해요. 사이트 주소 설정(config.js 의 <code>VIV_API</code>)에 서버 주소를 넣으면 이 기능이 켜져요. 설정 방법은 README 의 「집 공유 서버」를 보세요.<br><br>서버가 없어도 지금처럼 이 브라우저에서 혼자 쓰는 기능은 그대로 동작해요.</p><div class="vv-btns"><button class="vv-primary">확인</button></div></form>`;d.showModal()}

/* ---------- v20 이웃하기: 집 단위 연결. '우리집'과 '이웃집'을 짝지은 연결(두 집의 id 쌍)만 이웃으로 인정 — 한 집을 이웃과 연결해도 다른 집에는 영향이 없음 ---------- */
const normCode=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const nbState=()=>{const u=Viv.getUi().nb||{};
  const links=Array.isArray(u.links)?u.links.filter(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='string'&&typeof p[1]==='string'&&p[0]!==p[1]).slice(0,300):[];
  const codes=Array.isArray(u.codes)?u.codes.filter(x=>typeof x==='string').slice(0,20):[];     // v19 이전 방식(모든 집의 이웃)으로 등록해 둔 코드 — 아래 nbMigrate 가 집별 연결로 바꾸고 비움
  return {codes,view:!!u.view,ids:u.ids&&typeof u.ids==='object'?u.ids:{},links}};
const nbSave=p=>Viv.setUi({nb:{...nbState(),...p}});
/* 예전에 코드만 등록해 모든 집에서 이웃으로 보이던 집들을, 이 기기의 모든 집과의 개별 연결로 한 번만 바꿔 줌(동네 보기가 그대로 유지되고, 이후에는 집별로 해제할 수 있음) */
function nbMigrate(){const st=nbState();if(!st.codes.length&&!st.links.length)return;nbSave({codes:[],ids:{},links:[]})}   // v23: 예전 코드·기기 내 연결은 자동 동네를 만들지 않도록 비움 — 이웃은 서버에서 수락된 신청만 인정
/* v22: 이웃 = (1) 서버에 저장된 쌍방 연결(이웃 신청 수락) + (2) 예전 방식으로 이 기기에 저장된 연결. 서버 연결은 양쪽 집에서 모두 보임 */
let nbSrv={},nbIn=[],nbOut=[],nbSeen=new Set(),nbBusy=false,nbT=0,nbDlg=null;
const nbFor=hid=>{const out=[],add=h=>{if(h&&h.id!==hid&&!out.includes(h))out.push(h)};
  const me=houses.find(x=>x.id===hid);
  if(me&&me.shared){(nbSrv[me.shared.hid]||[]).forEach(n=>add(houses.find(x=>x.shared&&x.shared.hid===n)));
    Object.entries(nbSrv).forEach(([k,list])=>{if(list.includes(me.shared.hid))add(houses.find(x=>x.shared&&x.shared.hid===k))})}
  return out};
function hoodUi(){const b=q('#vvHood');if(!b)return;const h=houses[activeIdx],has=!!(h&&nbFor(h.id).length);b.hidden=!has;b.textContent=nbState().view?'동네 닫기':'동네 보기';b.classList.toggle('on',nbState().view)}
async function nbRebuild(){const nh=getHouses();if(nh.length!==houses.length||nh.some((h,i)=>h.id!==houses[i].id))await enter(true)}   // 새 이웃집에 들어가면 집 목록을 다시 그림
const nbOwn=()=>houses.filter(h=>h.shared&&(h.shared.role==='owner'||h.shared.role==='co'));   // 이웃 신청을 보낼 수 있는 '우리집': 내가 주인인 공유 집
function nbBadge(){const b=q('#vvNb');if(b)b.textContent=nbIn.length?`이웃하기 ●${nbIn.length}`:'이웃하기'}
/* 서버와 맞추기(60초마다·열 때): 이웃 목록, 받은 신청, 내가 보낸 신청의 수락 확인(수락되면 상대 집 참여 권한을 자동으로 받아 옴) */
async function nbPoll(){
  if(nbBusy||!shareOn()||!houses.length)return;nbBusy=true;
  try{const S=SH(),srv={},inc=[],out=[],joined=[],news=[];let changed=false;
    for(const h of houses.filter(x=>x.shared)){const hid=h.shared.hid;
      try{const r=await S.api('GET',`/api/houses/${hid}/neighbors`,{hid});srv[hid]=r.neighbors.map(n=>n.houseId)}catch(e){if(nbSrv[hid])srv[hid]=nbSrv[hid]}}
    for(const h of nbOwn()){const hid=h.shared.hid;
      try{const r=await S.api('GET',`/api/houses/${hid}/neighbor-requests`,{hid});
        r.incoming.forEach(x=>inc.push({...x,hid,hname:h.name}));
        for(const o of r.outgoing){out.push({...o,hid,hname:h.name});
          if(o.status==='accepted'&&!o.claimed){try{const c=await S.api('POST',`/api/houses/${hid}/neighbor-requests/${o.id}/claim`,{hid});await S.adopt(c.neighbor);joined.push(c.neighbor.name);changed=true}catch(e){}}
          const key=o.id+':'+o.status;if(o.status==='rejected'&&!nbSeen.has(key)){nbSeen.add(key);news.push(`'${o.toName}' 집이 이웃 신청을 거절했어요`)}}
      }catch(e){}}
    const same=JSON.stringify(srv)===JSON.stringify(nbSrv);nbSrv=srv;nbIn=inc;nbOut=out;
    inc.forEach(x=>{if(!nbSeen.has(x.id)){nbSeen.add(x.id);news.push(`'${x.fromName}' 집에서 이웃 신청이 왔어요 — 「이웃하기」에서 수락·거절할 수 있어요`)}});
    joined.forEach(n=>news.push(`'${n}' 집과 이웃이 됐어요`));
    if(changed)await nbRebuild();nbBadge();if(!same||changed)nbChanged();if(nbDlg&&nbDlg.open&&nbDlg.render)nbDlg.render();
    if(news.length)note(news.join(' / '),'ok');
    if(changed)setTimeout(nbPoll,1500);
  }catch(e){console.warn('[viv nb]',e)}finally{nbBusy=false}}
/* 이사 제안(이웃 집으로 옮겨 살기): 보내기=캐릭터를 등록한 사람 / 수락·거절=받는 집 집주인·공동 집주인 / 수락되면 보낸 사람 브라우저에서 '새 집 받기'.
   자동 수락·자동 이동 없음 — 사람이 누르기 전에는 아무 일도 일어나지 않아요 */
let mvBusy=false;
async function mvRender(d,msg){const box=q('#nbMoves',d);if(!box||mvBusy)return;mvBusy=true;
  try{const S=SH(),sh=houses.filter(h=>h.shared&&(nbSrv[h.shared.hid]||[]).length);
    const offers=[];for(const h of houses.filter(x=>x.shared)){try{const r=await S.api('GET',`/api/houses/${h.shared.hid}/move-offers`,{hid:h.shared.hid});r.offers.forEach(o=>offers.push({...o,hid:h.shared.hid}))}catch(e){}}
    const seen=new Set(),uniq=offers.filter(o=>((o.incoming&&o.hid===o.to)||(!o.incoming&&o.hid===o.from))&&!seen.has(o.id)&&seen.add(o.id));
    const mineCs=Viv.chars().filter(c=>c.remote&&c.mine&&sh.some(h=>h.shared.hid===c.hid));
    const nm=id=>{const h=houses.find(x=>x.shared&&x.shared.hid===id);return h?h.name:'이웃집'};
    const lab={pending:'답을 기다리는 중',done:'수락됨',rejected:'거절됨',cancelled:'취소됨',expired:'기한 지남',void:'무효'};
    const live=uniq.filter(o=>o.status==='pending'||(o.status==='done'&&!o.claimed&&!o.incoming));
    box.innerHTML=(mineCs.length?`<h4>이사 제안 보내기</h4><div class="hint">내가 등록한 캐릭터를 이웃 집으로 옮겨 살게 해요. 상대 집의 집주인이 수락해야 이사가 일어나요.</div>
      <div class="vv-btns" style="justify-content:flex-start;gap:6px;flex-wrap:wrap"><select id="mvC">${mineCs.map(c=>`<option value="${esc(c.id)}" data-h="${esc(c.hid)}">${esc(c.name)}</option>`).join('')}</select><select id="mvT"></select><button type="button" id="mvGo" class="vv-primary">제안 보내기</button></div>`:'')+
      (live.length?`<h4>이사 제안</h4><ul class="nb-list">${live.map(o=>`<li data-o="${esc(o.id)}" data-h="${esc(o.hid)}"><span><b>${esc(o.name||'캐릭터')}</b> : ${esc(o.fromName)} → ${esc(o.toName)} <span class="hint">${lab[o.status]||o.status}</span></span><span>${o.incoming&&o.status==='pending'?'<button type="button" class="mvOk vv-primary">수락</button><button type="button" class="mvNo">거절</button>':o.status==='pending'?'<button type="button" class="mvCx">취소</button>':'<button type="button" class="mvCl vv-primary">새 집 받기</button>'}</span></li>`).join('')}</ul>`:'');
    const cs=q('#mvC',box),ts=q('#mvT',box);
    if(cs){const fill=()=>{const hid=cs.selectedOptions[0].dataset.h;ts.innerHTML=(nbSrv[hid]||[]).map(id=>`<option value="${esc(id)}">${esc(nm(id))}</option>`).join('')};cs.onchange=fill;fill();
      q('#mvGo',box).onclick=async e=>{const hid=cs.selectedOptions[0].dataset.h;if(!ts.value)return msg('옮겨 갈 이웃 집이 없어요',1);e.target.disabled=true;
        try{await S.api('POST',`/api/houses/${hid}/chars/${cs.value}/move-offer`,{hid,body:{toHouse:ts.value}});msg('이사 제안을 보냈어요. 상대 집주인이 수락하면 이사해요');mvBusy=false;mvRender(d,msg)}catch(er){e.target.disabled=false;msg(er.message||'보내지 못했어요',1)}}}
    qa('.mvOk,.mvNo,.mvCx,.mvCl',box).forEach(b=>b.onclick=async()=>{const li=b.closest('li'),oid=li.dataset.o,hid=li.dataset.h,act=b.classList.contains('mvOk')?'accept':b.classList.contains('mvNo')?'reject':b.classList.contains('mvCx')?'cancel':'claim';b.disabled=true;
      try{const r=await S.api('POST',`/api/houses/${hid}/move-offers/${oid}/${act}`,{hid});
        if(act==='claim'){await S.adopt(r);await nbRebuild();msg('새 집을 받았어요. 캐릭터가 이사했어요')}else msg(act==='accept'?'수락했어요 — 캐릭터가 이사했어요':act==='reject'?'거절했어요':'취소했어요');
        mvBusy=false;await mvRender(d,msg);nbPoll()}catch(er){b.disabled=false;msg(waitMsg(er)||er.message||'처리하지 못했어요',1)}});
  }catch(e){console.warn('[viv mv]',e)}finally{mvBusy=false}}
function openNb(){
  if(!shareOn())return notReady();
  const d=dlgOf(),cur=houses[activeIdx];
  const mine=nbOwn(),locals=houses.filter(h=>!h.shared);
  const first=mine.find(h=>cur&&h.id===cur.id)||mine[0]||null;
  d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>이웃하기</h3>
    <p class="hint">내 집과 이웃집 코드로 신청을 보내요. 상대가 수락하면 두 집이 연결돼요.</p>
    <label><span>내 집</span><select id="nbMine">${mine.length||locals.length?mine.map(h=>`<option value="${esc(h.id)}" ${first&&h.id===first.id?'selected':''}>${esc(h.name)}</option>`).join('')+locals.map(h=>`<option value="" disabled>${esc(h.name)} (먼저 「집 공유하기」 필요)</option>`).join(''):'<option value="">(내 집이 없어요)</option>'}</select></label>
    <div class="vv-mycode" id="nbMy"></div>
    <label><span>이웃집 코드</span><input id="nbCode" class="vv-codein" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="6자리 코드"></label>
    <div class="hint" id="nbMsg" role="alert"></div>
    <div id="nbIncoming"></div><div id="nbOutgoing"></div><div id="nbNbrs"></div><div id="nbMoves"></div>
    <div class="vv-btns"><button type="button" id="nbClose">닫기</button><button type="button" id="nbAdd" class="vv-primary">이웃 신청 보내기</button></div></form>`;
  const msg=(t,bad)=>{const m=q('#nbMsg',d);if(!m)return;m.className=bad?'vv-err':'hint';m.textContent=t||''};
  const btn=q('#nbAdd',d),sel=q('#nbMine',d),inp=q('#nbCode',d);let busy=false;
  btn.disabled=!mine.length;if(!mine.length)msg(locals.length?'먼저 「집 공유하기」로 내 집을 공유해 주세요':'먼저 내 집을 만들고 공유해 주세요',1);
  const myCode=()=>{const h=houses.find(x=>x.id===sel.value),box=q('#nbMy',d);if(!box)return;
    if(!h||!h.shared){box.innerHTML='';return}
    const rh=(SH().reg().houses||{})[h.shared.hid]||{},ok=rh.nbCode&&(!rh.nbCodeExp||rh.nbCodeExp>Date.now());
    box.innerHTML=`<div class="hint">이 집의 <b>이웃 코드</b> (입장 코드와 달라요 — 이 코드로는 편집·캐릭터 등록이 안 되고 놀러가기만 가능)</div><div class="vv-btns" style="justify-content:flex-start;gap:8px">${ok?`<b class="vv-codeshow">${esc(rh.nbCode)}</b><button type="button" id="nbCopy">복사</button>`:''}<button type="button" id="nbNew">${ok?'새 코드 발급':'이웃 코드 발급'}</button></div>`;
    const cp=q('#nbCopy',box);if(cp)cp.onclick=()=>copyText(rh.nbCode,cp);
    q('#nbNew',box).onclick=async e=>{e.target.disabled=true;try{await SH().rotateNb(h.shared.hid);myCode()}catch(er){msg(waitMsg(er)||'발급하지 못했어요',1);e.target.disabled=false}}};
  sel.onchange=myCode;myCode();
  const render=()=>{
    const inc=q('#nbIncoming',d),outg=q('#nbOutgoing',d),nb=q('#nbNbrs',d);if(!inc)return;
    inc.innerHTML=nbIn.length?`<h4>받은 이웃 신청</h4><ul class="nb-list">${nbIn.map(x=>`<li data-r="${esc(x.id)}" data-h="${esc(x.hid)}"><span><b>${esc(x.fromName)}</b> → ${esc(x.hname)}</span><span><button type="button" class="nbOk vv-primary">수락</button> <button type="button" class="nbNo">거절</button></span></li>`).join('')}</ul>`:'';
    const lab={pending:'대기 중',accepted:'수락됨',rejected:'거절됨'};
    outg.innerHTML=nbOut.length?`<h4>보낸 이웃 신청</h4><ul class="nb-list">${nbOut.slice(0,6).map(o=>`<li><span>${esc(o.hname)} → <b>${esc(o.toName)}</b></span><span class="hint">${lab[o.status]||o.status}</span></li>`).join('')}</ul>`:'';
    const rows=[];houses.forEach(h=>nbFor(h.id).forEach(n=>{if(houses.indexOf(h)<houses.indexOf(n))rows.push([h,n])}));
    nb.innerHTML=rows.length?`<h4>연결된 이웃</h4><ul class="nb-list">${rows.map(([a,b])=>`<li data-a="${esc(a.id)}" data-b="${esc(b.id)}"><span><b>${esc(a.name)}</b> ↔ <b>${esc(b.name)}</b></span><button type="button" class="nbDel" title="연결 해제">해제</button></li>`).join('')}</ul>`:'';
    qa('.nbOk,.nbNo',inc).forEach(b=>b.onclick=async()=>{const li=b.closest('li'),rid=li.dataset.r,hid=li.dataset.h,ok=b.classList.contains('nbOk');b.disabled=true;
      try{const r=await SH().api('POST',`/api/houses/${hid}/neighbor-requests/${rid}/${ok?'accept':'reject'}`,{hid});if(ok&&r.neighbor){await SH().adopt(r.neighbor);await nbRebuild()}msg(ok?'수락했어요 — 두 집이 연결됐어요':'거절했어요');await nbPoll()}
      catch(e){b.disabled=false;msg(waitMsg(e)||'처리하지 못했어요',1)}});
    qa('.nbDel',nb).forEach(b=>b.onclick=async()=>{const li=b.closest('li'),A=houses.find(x=>x.id===li.dataset.a),Bh=houses.find(x=>x.id===li.dataset.b);if(!A||!Bh)return;
      try{
        const local=nbState().links.some(p=>(p[0]===A.id&&p[1]===Bh.id)||(p[0]===Bh.id&&p[1]===A.id));
        if(local)nbSave({links:nbState().links.filter(p=>!((p[0]===A.id&&p[1]===Bh.id)||(p[0]===Bh.id&&p[1]===A.id)))});
        if(A.shared&&Bh.shared){const own=[A,Bh].find(x=>x.shared.role==='owner'||x.shared.role==='co');
          if(own){const other=own===A?Bh:A;try{await SH().api('DELETE',`/api/houses/${own.shared.hid}/neighbors/${other.shared.hid}`,{hid:own.shared.hid})}catch(e){if(!local)throw e}}
          else if(!local)throw new Error('집 주인만 서버 연결을 해제할 수 있어요')}
        msg('연결을 해제했어요');await nbPoll();nbChanged();render()}catch(e){msg(waitMsg(e)||'해제하지 못했어요',1)}})};
  d.mv=()=>mvRender(d,msg);nbDlg=d;d.render=()=>{render();mvRender(d,msg)};
  inp.oninput=()=>msg('');
  q('#nbClose',d).onclick=()=>d.close();   // 신청하지 않고 닫으면 아무것도 보내지 않음
  btn.onclick=async()=>{
    if(busy)return;const h=houses.find(x=>x.id===sel.value),code=normCode(inp.value);
    if(!h||!h.shared)return msg('우리집을 고르세요',1);
    if(code.length<6)return msg('이웃집 코드는 6자리예요',1);
    busy=true;btn.disabled=true;btn.textContent='보내는 중…';
    try{const r=await SH().api('POST',`/api/houses/${h.shared.hid}/neighbor-requests`,{hid:h.shared.hid,body:{code}});
      inp.value='';btn.textContent='신청 완료';msg(`'${h.name}' → '${r.toName}' 이웃 신청을 보냈어요. 상대가 수락하면 자동으로 연결돼요`);await nbPoll();
      setTimeout(()=>{if(d.open){btn.textContent='이웃 신청 보내기';btn.disabled=false}},1500)}
    catch(e){btn.disabled=false;btn.textContent='이웃 신청 보내기';msg(waitMsg(e)||'신청하지 못했어요',1)}
    finally{busy=false}};
  render();d.showModal();setTimeout(()=>inp.focus(),30);nbPoll()}
function nbChanged(){hoodUi();const sl=qa('.vv-slide')[activeIdx];if(sl){drawChars(sl)}renderDetail()}
/* 놀러 간 캐릭터는 놀러 간 집 화면의 오른쪽 위에 '손님'으로 보임 (이 기기에서만) */
function visitTargetOf(c,p){const st=Viv.getSim(c.id);if(st.outTo)return st.outTo;const say=p.say||'',h=nbFor(p.house).find(x=>say.startsWith(x.name));return h?h.id:null}
function visitorsOf(hid){const h0=houses.find(x=>x.id===hid),i0=h0&&h0.shared&&SH().info(h0.shared.hid),sv=new Set(((i0&&i0.visitors)||[]).map(v=>v.charId));
  /* 내가 조작하지 못하는(다른 브라우저 주인의) 손님은 이 브라우저에서 따로 시뮬레이션하지 않고 서버가 알려 준 모습·지문 하나만 따름 → 주인·방문자 화면의 지문이 같아짐 */
  const loc=Viv.chars().filter(c=>{const p=Viv.getPlace(c.id);return p.mode==='out'&&p.house!==hid&&p.verb==='out_visit'&&visitTargetOf(c,p)===hid&&!(c.remote&&!c.mine&&sv.has(c.id))&&!(h0&&h0.shared&&SH().engineOn&&SH().engineOn(h0.shared.hid))});   // 서버가 계산하는 집에서는 이 브라우저가 손님 복사본을 따로 만들지 않고 서버가 알려 주는 손님만 보여 준다(복사본이 생기면 행동 지정이 막히고 서버와 따로 움직임)
  /* v24: 서버가 알려 주는 방문 캐릭터 — 보낸 집 토큰이 없는 사람(다른 브라우저의 공동 집주인·이웃 방문자)도 같은 손님을 봄 */
  const h=houses.find(x=>x.id===hid),i=h&&h.shared&&SH().info(h.shared.hid);if(!i||!i.visitors||!i.visitors.length)return loc;
  const have=new Set(loc.map(c=>c.id)),now=Date.now(),extra=[];
  for(const v of i.visitors){if(v.until<now||have.has(v.charId))continue;
    const id='vis:'+v.charId;let u=VIS_IMG[id];
    if(u===undefined){VIS_IMG[id]=null;if(v.img)SH().visitorImageUrl(h.shared.hid,v.charId,v.img.rev).then(url=>{VIS_IMG[id]=url;IMG[id]=url;const sl=qa('.vv-slide')[activeIdx];if(sl)drawChars(sl);renderList()}).catch(()=>{VIS_IMG[id]=false})}
    else if(u)IMG[id]=u;
    extra.push({id,name:v.name,remote:true,srvVisit:true,img:v.img,fromHouse:v.fromHouse,fromName:v.fromName,startedAt:v.startedAt,say:(v.gp&&v.gp.mode==="home"&&v.gp.say)||v.say,h:v.h,gp:v.gp||null})}
  return loc.concat(extra)}
const VIS_IMG={};
/* v25: 같은 브라우저에 있는 집끼리의 방문 — 손님의 '복사본'(vg:id)이 이웃집 시뮬레이션에 실제로 참여(앉기·대화 등). 원래 집의 데이터·저장소는 바뀌지 않고, 방문이 끝나면 사라짐 */
function guestChars(hid){const out=[];
  for(const c of visitorsOf(hid)){if(c.srvVisit)continue;const id='vg:'+c.id;
    if(!Viv.guestHas(id)){const now=Date.now();Viv.setPlace(id,{house:hid,mode:'out',verb:'out_visit',x:null,f:0,h:Viv.getPlace(c.id).h||120,say:'',pose:'stand',tgt:null,partner:null});Viv.setSim(id,{outAt:now-1,outUntil:now-1,decideAt:0,guestOf:c.id})}
    if(IMG[c.id])IMG[id]=IMG[c.id];
    out.push({...c,id,realId:c.id,guest:true})}
  return out}
function guestGC(){const live=new Set();houses.forEach(h=>visitorsOf(h.id).forEach(c=>{if(!c.srvVisit)live.add('vg:'+c.id)}));
  Viv.guestIds().forEach(id=>{if(!live.has(id)){Viv.guestDrop(id);delete IMG[id]}})}
/* 놀러 온 손님은 외출 중인 캐릭터와 같은 왼쪽 위 줄에, 그림과 함께 '어디서 놀러 왔는지·지금 하는 행동'을 보여 줌 */
function guestHtml(hid){const gs=visitorsOf(hid);
  return gs.map(c=>{const p=c.srvVisit?{house:null}:Viv.getPlace(c.id),gp=c.srvVisit?null:Viv.getPlace('vg:'+c.id),img=IMG[c.id]||IMG['vg:'+c.id],hn=c.srvVisit?{name:c.fromName}:houseOf(p.house),act=c.srvVisit?(c.say||''):((gp&&gp.mode==='home'&&gp.say)||'');
    return `<div class="vv-out1 vv-g1" data-id="${esc(c.id)}">${img?`<img src="${img}" alt="" onerror="VivUI.imgBad('${esc(c.id)}')">`:`<span class="ph">${esc([...c.name][0]||'?')}</span>`}<div class="bub"><b>${esc(c.name)} · 손님</b><span class="bt" data-k="g:${esc(c.id)}">${esc((hn?hn.name+'에서 ':'')+'놀러 왔어요'+(act?' — '+act:''))}</span></div></div>`}).join('')}
/* 동네 보기: 이웃 집들을 같은 축척으로, 땅 높이를 맞춰 작은 간격으로 나란히 보여 줌 (눌러서 그 집으로 이동) */
async function renderHood(slide){
  const wrap=q('.vv-stagewrap',slide);if(!wrap)return;let box=q('.vv-hood',wrap);
  const act=houses[activeIdx],nbs=act&&nbState().view&&slide===qa('.vv-slide')[activeIdx]?nbFor(act.id):[];
  if(!nbs.length){if(box)box.remove();wrap.classList.remove('hooded');return}
  const sls=qa('.vv-slide');
  for(const nh of nbs){const sl=sls[houses.indexOf(nh)];if(sl&&!sl._snap)await ensureStage(sl,nh)}
  if(houses[activeIdx]!==act||!nbState().view)return;
  const half=Math.ceil(nbs.length/2),order=[...nbs.slice(0,half),act,...nbs.slice(half)];
  const its=order.map(h=>{const i=houses.indexOf(h),sl=sls[i],sn=sl&&sl._snap;return sn&&sl._url?{h,i,sn,url:sl._rast||sl._url}:null}).filter(Boolean);
  if(!its.length)return;
  const gap=Math.max(...its.map(o=>o.sn.w))*.035;let X=0,up=0,down=0;
  its.forEach(o=>{o.X=X;X+=o.sn.w+gap;o.up=o.sn.gy-o.sn.y0;o.down=o.sn.y0+o.sn.h-o.sn.gy;up=Math.max(up,o.up);down=Math.max(down,o.down)});
  const W=X-gap,pad=Math.max(...its.map(o=>o.sn.h))*.09,fs=pad*.5;
  let g='';
  {const gp=(its[0].sn.text.match(/<pattern id="groundg"[\s\S]*?<\/pattern>/)||[''])[0];   // 땅은 집 사이에도 끊기지 않고 이어지게(바닥 무늬 그대로), 하늘은 배경색이 그대로 이어짐
   g+=(gp?`<defs>${palSvg(gp,PALS[palId])}</defs>`:'')+`<rect x="${-W*3}" y="0" width="${W*7}" height="${down+pad*60}" style="fill:var(--vp-gnd,#8d8d89)"/>`+(gp?`<rect x="${-W*3}" y="0" width="${W*7}" height="${down+pad*60}" fill="url(#groundg)"/>`:'')+`<line x1="${-W*3}" x2="${W*4}" y1="0" y2="0" stroke="#1c1c1c" stroke-width="${W/700}"/>`}
  for(const o of its){const sn=o.sn,geo=sn.geo,here=o.h===act;
    let ch='';
    for(const c of Viv.chars()){const p=Viv.getPlace(c.id);if(p.house!==o.h.id||p.mode!=='home')continue;
      const b=charBox(c,p,geo),top=-b.e-b.h,im=IMG[c.id];
      const tf=b.pose==='lie'?` transform="translate(${b.h/2} ${-b.w/2}) rotate(-90 ${b.x} ${-b.e})"`:'';
      ch+=im?`<image href="${im}" x="${b.x-b.w/2}" y="${top}" width="${b.w}" height="${b.h}" preserveAspectRatio="xMidYMid meet"${tf}/>`:`<rect x="${b.x-b.w/2}" y="${top}" width="${b.w}" height="${b.h}" rx="6" fill="#ececea" stroke="#1c1c1c"${tf}/><text x="${b.x}" y="${top+b.h*.62}" text-anchor="middle" font-size="${b.h*.45}" font-weight="700" fill="#444">${esc([...c.name][0]||'?')}</text>`}
    const gs=visitorsOf(o.h.id);let gi=0;
    for(const c of gs){const p=Viv.getPlace(c.id),im=IMG[c.id],ar=c.img?c.img.w/c.img.h:.6,hh=p.h,ww=hh*ar,fl=floorOf(geo,0),x=geo.in0+60+ww/2+gi*(ww+30),top=-fl.e-hh;gi++;
      ch+=(im?`<image href="${im}" x="${x-ww/2}" y="${top}" width="${ww}" height="${hh}" preserveAspectRatio="xMidYMid meet"/>`:`<rect x="${x-ww/2}" y="${top}" width="${ww}" height="${hh}" rx="6" fill="#ececea" stroke="#1c1c1c"/>`)+`<rect x="${x-ww/2}" y="${top}" width="${ww}" height="${hh}" fill="none" stroke="#c0583f" stroke-width="${geo.W/500}" stroke-dasharray="${geo.W/150} ${geo.W/250}"/><text x="${x}" y="${top-fs*.3}" text-anchor="middle" font-size="${fs*.8}" fill="#c0583f" font-weight="700">손님 ${esc(c.name)}</text>`}
    g+=`<g class="hood-b${here?' on':''}" data-i="${o.i}" transform="translate(${o.X-sn.x0} ${-o.up-sn.y0})"><image href="${o.url}" x="${sn.x0}" y="${sn.y0}" width="${sn.w}" height="${sn.h}" preserveAspectRatio="none"/>${ch}</g>`+
       `<text class="hood-nm${here?' on':''}" x="${o.X+sn.w/2}" y="${-up-pad*.35}" text-anchor="middle" font-size="${fs}" font-weight="700">${esc(o.h.name)}${here?' (지금 보는 집)':''}</text>`;
    g+=`<rect class="hood-hit" data-i="${o.i}" x="${o.X}" y="${-o.up}" width="${sn.w}" height="${o.up+o.down}" fill="transparent"/>`}
  const svg=`<svg class="vv-hood-svg" viewBox="0 ${-up-pad} ${W} ${up+down+pad}" preserveAspectRatio="xMidYMid meet" style="overflow:visible" xmlns="${NSV}">${g}</svg>`;
  if(!box){box=document.createElement('div');box.className='vv-hood';wrap.appendChild(box)}
  wrap.classList.add('hooded');box.innerHTML=svg;
  qa('.hood-hit',box).forEach(r=>r.onclick=()=>{const i=+r.dataset.i;if(i===activeIdx){nbSave({view:false});hoodUi();renderHood(slide)}else scrollTo(i)})}

/* 입장하기: 초대 코드 → 서버 검증 → 참여 */
function openJoin(){
  if(!shareOn())return notReady();
  const d=dlgOf();
  d.innerHTML=`<form class="vv-form" onsubmit="return false"><h3>입장하기</h3>
   <p class="hint">집 주인에게 받은 6자리 초대 코드를 입력하세요.</p>
   <label><span>초대 코드</span><input id="vjCode" class="vv-codein" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7M2QX"></label>
   <label><span>내 별명 <small>(선택)</small></span><input id="vjNick" maxlength="20" placeholder="예) 보리 친구"></label>
   <div class="vv-err" id="vjErr" role="alert"></div>
   <details class="vv-rec"><summary>복구 키로 입장</summary>
    <p class="hint">공유 집 「정보」창에서 복사한 복구 키를 붙여 넣어요.</p>
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
     ${!owner?`<h4>이 집 공유하기</h4>${i.code?`<p class="hint">내가 입장할 때 쓴 초대 코드예요. 다른 사람에게 알려 주면 같은 집에 들어올 수 있어요. 집 주인이 코드를 새로 바꾸거나 폐기하면 이 코드는 더 이상 쓸 수 없어요.</p><div class="vv-code">${esc(i.code)}</div><div class="vv-btns"><button type="button" id="vmCopy">코드 복사</button></div>`:`<p class="hint">이 브라우저에는 입장 코드가 저장돼 있지 않아요(복구 키로 들어왔거나 기존에 입장한 집). 집 주인에게 초대 코드를 받아 전달하세요.</p>`}`:''}
     <h4>참여자 ${i.members.length}/${i.limits.members}</h4>
     <div class="vv-members">${i.members.map(m=>`<div><span>${esc(m.nick)} ${m.role==='owner'?'<small class="vv-tag fact">집 주인</small>':m.role==='co'?'<small class="vv-tag fact">공동 집주인</small>':m.role==='guest'?'<small class="vv-tag">이웃 방문</small>':''}${m.pid===i.me.pid?' <small class="vv-tag">나</small>':''}</span>${owner&&m.pid!==i.me.pid?`<button type="button" class="vv-danger" data-kick="${esc(m.pid)}">내보내기</button>`:''}</div>`).join('')}</div>
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
    if(!owner&&q('#vmCopy',d))q('#vmCopy',d).onclick=e=>copyText(i.code,e.currentTarget);
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
  const nav=document.createElement('nav');nav.className='vnav';nav.innerHTML='<button data-m="viv">비바리움 관찰</button><button data-m="edit" class="on">단면도 편집</button><button class="vjoin" id="vvJoin" title="초대 코드로 다른 사람의 집에 들어가기">입장하기</button><button class="vjoin vnb" id="vvNb" title="초대 코드를 등록한 집과 이웃이 되어 서로 놀러 가기">이웃하기</button><button class="vjoin vjico" id="vvJr" title="관찰일지 — 캐릭터별·날짜별로 하루의 기록 보기" aria-label="관찰일지"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.4l2 2.2h8.6A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>';
  q('#top .logo').after(nav);qa('button[data-m]',nav).forEach(b=>b.onclick=()=>go(b.dataset.m));q('#vvJoin',nav).onclick=()=>{if(!booted){booted=true;build()}openJoin()};q('#vvNb',nav).onclick=()=>{if(!booted){booted=true;build()}openNb()};q('#vvJr',nav).onclick=()=>{if(!booted){booted=true;build()}openJournal()};if(SH())SH().onChange(onShareChange);
  const sec=document.createElement('section');sec.id='viv';document.body.appendChild(sec);
  window.addEventListener('hashchange',()=>go(location.hash==='#edit'?'edit':'viv'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)simTick()});
  go(location.hash==='#edit'?'edit':'viv');   // v23.15 처음 열면 「비바리움 관찰」 탭(집이 없으면 「아직 내 집이 없어요!」 안내)
  window.VivUI={goHouse:i=>scrollTo(i),mvSeen:()=>({...MVSEEN}),mvPlayed:()=>MVPLAYED.slice(),redraw:()=>{const sl=qa(".vv-slide")[activeIdx];if(sl)drawChars(sl)},nbFor:id=>nbFor(id).map(h=>h.name),nbDump:()=>({srv:nbSrv,houses:houses.map(h=>h.id+"|"+h.name),idx:activeIdx}),go,isBlank,getHouses,drawDoc,describe,runSim,simTick,note,imgBad,uc:{fx:ucFx,view:ucView,isMiss,refresh:ucRefresh,garble:ucGarble}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
