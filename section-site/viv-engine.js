/* 비바리움 생활 엔진 — 한 번의 '틱'(행동 결정 → 감정·관계·기억 → 위화감)을 화면·저장소와 무관하게 실행한다.
   브라우저(로컬 집·화면 표시)와 서버(Cloudflare Workers, 공유 집)가 이 함수 하나를 그대로 쓴다 → 같은 입력이면 같은 결과.
   - 상태 읽기/쓰기는 호출자가 넘기는 host 로만 한다: getPlace/setPlace/getSim/setSim, mind(감정·관계·기억 상태), unc(위화감 상태).
   - 시각은 항상 t(ms)를 인자로 받는다. 지금 시각을 직접 읽지 않으므로 과거 시각을 순서대로 재생(catch-up)해도 된다.
   - 손님: host.guests = [{id:'vg:원래id', realId, name, profile}] — 이웃집에서 놀러 온 캐릭터가 이 집의 가구·사람과 실제로 상호작용한다.
   반환: {moves, notes, fx} — notes/fx 는 화면 알림·연출용이며 서버는 무시한다. */
(function(root){
'use strict';
const Sim=root.Sim,Mind=root.Mind,Unc=root.Uncanny;
const raw=id=>String(id||'').startsWith('vg:')?String(id).slice(3):id;

/* 갈 수 있는 곳(구역 연결): 출구에 닿지 못하면 '갇힘' */
function reachInfo(W,sg){if(!sg||!W.reach)return {};
  try{const R=W.reach(sg.id);const exitOK=!W.exits.length||W.exits.some(e=>{const s2=W.segAt(e.f,e.x);return s2&&R.has(s2.id)});
    return {trap:!exitOK,rch:[...R],fk:new Set((W.items||[]).filter(it=>R.has(it.seg)).flatMap(it=>(it.kinds||[]).filter(k=>k!=='door'&&k!=='window'))).size,ph:(W.items||[]).some(it=>it.kinds&&it.kinds.includes('phone')&&R.has(it.seg))}}
  catch(e){return {}}}

/* 손님 사본('vg:…')도 원래 캐릭터의 마음으로 지문이 붙도록, 지문 훅에 넘기는 id 를 원래 id 로 바꾼다 */
function guestMind(m,nameOf){if(!m)return m;
  const nmW=nm=>typeof nm==='function'?(id=>nm(id)||nm('vg:'+id)||nameOf(raw(id))):nm;
  const w=(k,f)=>{const o=m[k];if(typeof o==='function')m[k]=f(o)};
  w('tone',o=>(c,v,A,nm)=>o(raw(c),v,A,nmW(nm)));w('alt',o=>(c,v,A,room,nm)=>o(raw(c),v,A,room,nmW(nm)));
  w('talk',o=>(c,pid,A,nm)=>o(raw(c),raw(pid),A,nmW(nm)));w('petTone',o=>(c,pn,A,nm)=>o(raw(c),pn,A,nmW(nm)));w('out',o=>(c,A,nm)=>o(raw(c),A,nmW(nm)));
  w('groupMul',o=>(c,g)=>o(raw(c),g));return m}

const emoOf=(mind,cid,k)=>{try{const e=mind.emo[cid];return e&&e.lv[k]?e.lv[k].v:0}catch(x){return 0}};

/* host: {world, houseId, residents:[simChar], guests:[{id,realId,name,profile}], getPlace,setPlace,getSim,setSim, mind, unc, neighbors, isMiss(id), watch} */
function simCtx(h,t){
  const all=h.residents.filter(c=>!(h.isMiss&&h.isMiss(c.id))).concat(h.guests.map(g=>({id:g.id,name:g.name,profile:g.profile||'',pet:null})));
  const nameOf=id=>{const o=all.find(x=>x.id===id)||h.residents.find(x=>x.id===id);return o?o.name:''};
  const humans=all.filter(o=>!o.pet);
  return {now:t,world:h.world,houseId:h.houseId,guests:h.srvGuests||[],chars:all,getPlace:h.getPlace,setPlace:h.setPlace,getSim:h.getSim,setSim:h.setSim,
    neighbors:h.neighbors||[],analysis:c=>Sim.analyze(c.profile,c.name,humans),
    mind:h.mind?guestMind(Mind.hooks(h.mind,t),nameOf):null,
    unc:h.unc?Unc.hooks(h.unc,t,{emo:(cid,k)=>emoOf(h.mind||{emo:{}},cid,k),watch:h.watch||null}):null}}

function snapPrev(h){const o={};
  h.residents.filter(c=>!c.pet).forEach(c=>{const st=h.getSim(c.id);o[c.id]={n:st.n||0,outAt:st.outAt||0}});
  h.guests.forEach(g=>{const st=h.getSim(g.id);o[g.realId]={n:st.n||0,outAt:st.outAt||0}});return o}

/* 감정·관계·기억 갱신(예전 viv.js mindStep) */
function mindStep(h,t,prev,out){
  if(!h.mind||!h.world)return;
  const chars=h.residents.filter(c=>!c.pet&&!(h.isMiss&&h.isMiss(c.id))&&!(h.awayIds&&h.awayIds.has(c.id)));   // 이웃집에 놀러 가 있는 동안은 그 집 쪽에서 계산
  if(!chars.length)return;
  const W=h.world,cur={},gsts=[];
  for(const g of h.guests){if(chars.some(c=>c.id===g.realId))continue;chars.push({id:g.realId,name:g.name,profile:g.profile||'',pet:null});gsts.push(g)}
  const row=(id,rid)=>{const p=h.getPlace(id),st=h.getSim(id),sg=p.mode==='home'?W.segAt(p.f|0,p.x==null?W.mid:p.x):null;
    cur[rid]={mode:p.mode,action:p.action,verb:p.verb,seg:sg?sg.id:null,segName:sg?sg.name:'',partner:chars.some(o=>o.id===raw(p.partner))?raw(p.partner):null,say:p.say||'',n:st.n||0,outAt:st.outAt||0,...reachInfo(W,sg),wh:st.wishHist||[]}};
  gsts.forEach(g=>row(g.id,g.realId));
  chars.forEach(c=>{if(gsts.some(g=>g.realId===c.id))return;row(c.id,c.id)});
  const sp=Sim.seoul(t),A=c=>Sim.analyze(c.profile,c.name,chars);
  Mind.update(h.mind,{now:t,hour:sp.hour+sp.minute/60,day:`${sp.year}-${sp.month}-${sp.day}`,chars,A,cur,prev:prev||{},__cu:1,
    unc:cid=>h.unc&&Unc.mood?Unc.mood(h.unc,cid,t):null,
    stay:cid=>{if(!h.unc||!Unc.dayNum)return 0;try{const u=(h.unc.u||{})[cid];return u&&u.since!=null?Math.max(0,Unc.dayNum(t)-Unc.dayNum(u.since)):0}catch(e){return 0}}});
  /* 고백·프로포즈 결과: 화면 알림 후보(알림 표시 여부는 화면 쪽 상태라서 여기서는 표시하지 않음) */
  try{const ids=new Set(chars.map(c=>c.id));
    for(const k of Object.keys(h.mind.rev||{})){const rv=h.mind.rev[k],g=rv&&rv.sug;if(!g||g.shown)continue;const [x,y]=k.split('|');if(!ids.has(x)||!ids.has(y))continue;out.sug.push({k,text:g.text,g})}}catch(e){}
  /* 아르바이트 중 수상한 제안: 불안함에 반영(한 번만 — ptOddSeen 으로 표시) */
  try{chars.forEach(c=>{const sm=h.getSim(c.id);if(sm.ptOdd&&sm.ptOddAt&&sm.ptOddSeen!==sm.ptOddAt){h.setSim(c.id,{ptOddSeen:sm.ptOddAt});
    Mind.addEmo(h.mind,c.id,'anxious',34,'아르바이트 중 수상한 제안을 받아서',t,A(c));out.notes.push(c.name+'이(가) 알바 중 수상한 제안을 받았지만 거절했어요. 한동안 마음이 불안할 수 있어요')}})}catch(e){}}

/* 위화감(예전 viv.js uncStep) */
function uncStep(h,t,out){
  if(!h.unc||!Unc)return;
  try{const chars=h.residents.filter(c=>!c.pet);if(!chars.length)return;
    const env={now:t,chars:chars.map(c=>{const p=h.getPlace(c.id);return {id:c.id,A:Sim.analyze(c.profile,c.name,chars),home:p.mode==='home',sleeping:p.action==='sleep',verb:p.verb}}),emo:(cid,k)=>emoOf(h.mind||{emo:{}},cid,k),watch:h.watch||null};
    const r=Unc.update(h.unc,env);
    for(const f of r.fx){out.fx.push(f);if(f.k==='return'&&f.cid){const p=h.getPlace(f.cid);if(p.mode==='home')h.setSim(f.cid,{dirty:true})}}}   // 복귀 후 곧바로 다음 행동을 정함
  catch(e){if(root.console)console.error('[viv unc]',e)}}

const MARK=15*60000;   // 감정·관계·위화감은 서울 시계의 15분 격자에서만 한 번씩 갱신 → 몇 초마다 부르든, 서버가 15분마다 부르든 결과가 같다
function tick(h,t){
  const out={moves:[],notes:[],fx:[],sug:[]};
  const prev=snapPrev(h);
  out.moves=Sim.stepHouse(simCtx(h,t));
  const mk=Math.floor(t/MARK)*MARK;
  if(!(h.mindAt>=mk)){h.mindAt=mk;mindStep(h,mk,prev,out);uncStep(h,mk,out)}
  return out}

/* 지난 시각들을 순서대로 재생: from(마지막으로 확정한 시각) 다음 격자부터 to 까지 stepMs 간격으로 tick.
   반환: 마지막으로 처리한 시각(여러 번에 나눠 이어서 돌릴 수 있음). maxSteps/deadline 으로 한 번에 처리하는 양을 제한한다. */
function replay(h,from,to,opt){
  opt=opt||{};const step=opt.stepMs||MARK,max=opt.maxSteps||Infinity,dl=opt.deadline||Infinity;
  let t=Math.floor(from/step)*step+step,n=0,last=from;
  for(;t<=to&&n<max;t+=step,n++){
    if(Date.now()>dl)break;
    const r=tick(h,t);if(opt.onTick)opt.onTick(t,r);last=t}
  return {last,steps:n,done:last+step>to}}

root.VivEngine={tick,replay,simCtx,reachInfo,raw};
if(typeof module!=='undefined'&&module.exports)module.exports=root.VivEngine;
})(typeof window!=='undefined'?window:globalThis);
