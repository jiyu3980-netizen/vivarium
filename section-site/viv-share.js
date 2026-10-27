/* 비바리움 집 공유 — 클라이언트 (서버: section-server/worker.js)
   - 서버 주소는 config.js 의 VIV_API. 비어 있으면 공유 기능이 꺼지고 기존처럼 이 브라우저에만 저장된다.
   - 로그인 없음. 입장하면 서버가 익명 참여자 토큰을 주고, 이 브라우저(localStorage 'viv.sh.v1')에 보관한다.
     브라우저 데이터를 지우면 토큰이 사라지므로 '복구 키'로 다른 기기·브라우저에서 이어서 쓸 수 있다.
   - 캐릭터의 위치·행동·시뮬레이션 상태는 서버 값이 기준(단일 상태). 이 파일은 그 사본을 메모리에 두고,
     바뀐 부분만 모아서 보낸다(초 단위 저장 없음).
   - 도면·캐릭터 데이터를 복제해 두지 않는다: 집 ID 에 연결된 서버 데이터를 읽어 올 뿐이다. */
(function(){
const KEY='viv.sh.v1';
const jget=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};
let reg=jget(KEY,null);if(!reg||typeof reg!=='object'||!reg.houses)reg={v:1,houses:{}};
const saveReg=()=>jset(KEY,reg);
const base=()=>String(window.VIV_API||'').trim().replace(/\/+$/,'');
const enabled=()=>!!base();
const H={},C={};          // H: 집 id → 상태 사본, C: 캐릭터 id → 사본
const listeners=[];const emit=(why)=>listeners.forEach(f=>{try{f(why)}catch(e){console.error(e)}});
const imgCache={};         // 캐릭터 id → {rev,url}
let lost=[];               // 접근 권한이 사라진 집(안내용)

class ShareErr extends Error{constructor(status,msg,extra){super(msg);this.status=status;Object.assign(this,extra||{})}}
async function api(method,path,o){o=o||{};
  if(!enabled())throw new ShareErr(0,'공유 서버가 설정되어 있지 않아요');
  const h={};const tok=o.token||(o.hid&&reg.houses[o.hid]&&reg.houses[o.hid].token);if(tok)h.Authorization='Bearer '+tok;
  let body;if(o.raw){body=o.raw;if(o.mime)h['Content-Type']=o.mime}else if(o.body!==undefined){body=JSON.stringify(o.body);h['Content-Type']='application/json'}
  let r;try{r=await fetch(base()+path,{method,headers:h,body})}catch(e){throw new ShareErr(0,'서버에 연결할 수 없어요. 인터넷 연결이나 서버 주소를 확인해 주세요')}
  if(o.blob&&r.ok)return r.blob();
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){const ra=+r.headers.get('Retry-After')||0;
    throw new ShareErr(r.status,(j&&j.error)||`서버 오류 (${r.status})`,{retryAfter:ra,data:j})}
  return j}

/* ---------- 상태 사본 ---------- */
function noteDoc(hid,s,prevRev){   // 다른 참여자가 도면을 저장했다는 알림(집 ID·새 버전·저장 시각·변경 요약)
  const r=reg.houses[hid];if(!r||prevRev==null||s.docRev===prevRev)return;
  const mine=r.lastSavedRev===s.docRev;
  pendingDocEvents.push({hid,name:H[hid].name,docRev:s.docRev,prevRev,savedAt:s.docSavedAt,savedBy:s.docSavedBy,summary:s.docSummary,mine})}
const pendingDocEvents=[];
function applyState(hid,s){
  const prev=H[hid]||{};
  H[hid]={...prev,hid,rev:s.rev,docRev:s.docRev,docSavedAt:s.docSavedAt,docSavedBy:s.docSavedBy,docSummary:s.docSummary,leaderPid:s.leader?s.leader.pid:null,name:s.house.name,me:s.me,members:s.members,invite:s.invite||null,limits:s.limits,ok:true};
  if(prev.ok)noteDoc(hid,s,prev.docRev);
  const seen=new Set();
  for(const sc of s.chars){seen.add(sc.id);
    const mine=sc.owner===s.me.pid,canEdit=mine||s.me.role==='owner';let c=C[sc.id];
    if(!c){c=C[sc.id]={id:sc.id,hid,remote:true,pend:null}}
    Object.assign(c,{hid,name:sc.name,profile:sc.profile,owner:sc.owner,mine,canEdit,img:sc.img,updatedAt:sc.updatedAt});
    if(c.pend&&canEdit){c.rev=sc.rev;   /* 내가 바꾼 값(대기 중)은 유지: 주인의 직접 조작이 우선 */}
    else{c.pend=null;c.place=sc.place;c.sim=sc.sim;c.rev=sc.rev}}
  for(const id of Object.keys(C))if(C[id].hid===hid&&!seen.has(id)){if(imgCache[id]){URL.revokeObjectURL(imgCache[id].url);delete imgCache[id]}delete C[id]}}
/* 서버에서 받은 도면이 형식에 맞는지 확인(서버도 저장 시 검사하지만, 손상·변조된 응답이 화면을 망가뜨리지 않게 한 번 더 확인) */
function docShapeOk(d){
  if(!d||typeof d!=='object'||!d.b||!(+d.b.w>0)||!(+d.b.f>=1))return false;
  for(const k of ['items','parts','ops','stairs'])if(!Array.isArray(d[k]))return false;
  return d.items.every(i=>i&&i.uid!=null&&typeof i.assetId==='string'&&Number.isFinite(+i.x)&&Number.isFinite(+i.e)&&+i.w>0&&+i.h>0)}
async function fetchDoc(hid){const d=await api('GET',`/api/houses/${hid}/doc`,{hid});
  if(!d||!docShapeOk(d.doc))throw new ShareErr(502,'서버에서 받은 도면 형식이 올바르지 않아요. 이전 도면을 그대로 보여 드려요');
  H[hid].doc=d.doc;H[hid].loadedDocRev=d.docRev}
async function refresh(hid,force){
  const h=H[hid];const s=await api('GET',`/api/houses/${hid}/state${!force&&h&&h.ok?`?rev=${h.rev}`:''}`,{hid});
  if(s.unchanged){h.leaderPid=s.leader?s.leader.pid:null;return false}
  applyState(hid,s);if(H[hid].loadedDocRev!==H[hid].docRev){try{await fetchDoc(hid)}catch(e){H[hid].rev=-1;throw e}}return true}
const takeDocEvents=()=>pendingDocEvents.splice(0);
function dropHouse(hid,why){delete reg.houses[hid];saveReg();for(const id of Object.keys(C))if(C[id].hid===hid)delete C[id];const n=H[hid]&&H[hid].name;delete H[hid];lost.push({hid,name:n||'공유 집',why})}
/* 등록된 모든 집을 서버와 맞춘다. 실패한 집은 마지막으로 받아 둔 사본을 그대로 쓴다(없으면 목록에서 빠짐). */
async function syncAll(){
  if(!enabled())return {changed:false,errors:[]};
  let changed=false;const errors=[];
  await Promise.all(Object.keys(reg.houses).map(async hid=>{
    try{if(await refresh(hid))changed=true;if(H[hid])H[hid].err=null}
    catch(e){if(e.status===401||e.status===404){dropHouse(hid,'내보내졌거나 삭제된 집이에요');changed=true}
      else{errors.push({hid,name:reg.houses[hid].name,msg:e.message});if(H[hid])H[hid].err=e.message}}}));
  return {changed,errors}}
const takeLost=()=>{const l=lost;lost=[];return l};

/* ---------- 캐릭터 저장소(viv-data.js 의 Viv 가 위임해서 사용) ---------- */
const store={
  chars:()=>Object.values(C),
  char:id=>C[id]||null,
  place:id=>(C[id]&&C[id].place)||{},
  sim:id=>(C[id]&&C[id].sim)||{},
  setPlace(id,patch,next){const c=C[id];if(!c)return;c.place=next;c.pend=c.pend||{place:{},sim:{},kind:'auto'};Object.assign(c.pend.place,patch);if(!autoDepth)c.pend.kind='user';queue()},
  setSim(id,patch,next){const c=C[id];if(!c)return;c.sim=next;c.pend=c.pend||{place:{},sim:{},kind:'auto'};Object.assign(c.pend.sim,patch);if(!autoDepth)c.pend.kind='user';queue()},
  async imageUrl(id){const c=C[id];if(!c||!c.img)return null;const u=imgCache[id];if(u&&u.rev===c.img.rev)return u.url;
    const b=await api('GET',`/api/houses/${c.hid}/chars/${id}/image`,{hid:c.hid,blob:true});
    if(u)URL.revokeObjectURL(u.url);const url=URL.createObjectURL(b);imgCache[id]={rev:c.img.rev,url};return url}
};
let ft=0,flushing=null,autoDepth=0;
/* 시뮬레이션 엔진이 쓰는 값('자율 행동')과 사용자의 직접 조작을 구분: 자율 행동은 대표만 저장할 수 있다 */
const auto=fn=>{autoDepth++;try{return fn()}finally{autoDepth--}};
function queue(){clearTimeout(ft);ft=setTimeout(()=>{flush()},400)}
/* 바뀐 상태만 모아서 집마다 한 번에 보낸다. 자율 행동은 baseRev 가 맞을 때만 반영되고, 충돌하면 서버 상태를 받아 쓴다. */
function flush(){
  if(flushing)return flushing;
  const run=(async()=>{try{
    const by={};for(const c of Object.values(C))if(c.pend){(by[c.hid]=by[c.hid]||[]).push(c)}
    let adopted=false;
    for(const hid of Object.keys(by)){const list=by[hid];const send=list.map(c=>{const p=c.pend;c.pend=null;return {c,body:{id:c.id,baseRev:c.rev,kind:p.kind,place:p.place,sim:p.sim},p}});
      try{const r=await api('PUT',`/api/houses/${hid}/states`,{hid,body:{states:send.map(s=>s.body)}});
        r.results.forEach((res,i)=>{const {c,p}=send[i];if(res.gone){delete C[c.id];adopted=true}
          else if(res.ok)c.rev=res.rev;
          else if(res.conflict||res.notLeader){c.rev=res.rev;c.place=res.place;c.sim=res.sim;adopted=true;if(res.notLeader&&H[hid])H[hid].leaderPid=null}})}
      catch(e){if(e.status===401||e.status===404){dropHouse(hid,'내보내졌거나 삭제된 집이에요');adopted=true}
        else{console.warn('[viv share] 상태 저장 실패, 다시 시도해요:',e.message);send.forEach(({c,p})=>{if(C[c.id]&&!C[c.id].pend)C[c.id].pend=p})}}}   // 네트워크 오류: 다음 기회에 다시 보냄
    if(adopted)emit('adopt')
  }finally{}})();
  const pr=run.finally(()=>{if(flushing===pr)flushing=null;if(Object.values(C).some(c=>c.pend))queue()});   // 보내는 동안 새로 쌓인 변경도 이어서 보냄
  flushing=pr;return pr}

/* ---------- 집·참여 ---------- */
const docHash=d=>{const s=JSON.stringify(d);let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return h+':'+s.length};
function remember(hid,r,extra){reg.houses[hid]={...(reg.houses[hid]||{}),name:r.name,token:r.token,pid:r.pid,role:r.role,...(extra||{})};saveReg()}
async function createHouse({name,doc,nick,slot,savedHash}){
  const r=await api('POST','/api/houses',{body:{name,doc,nick}});
  remember(r.houseId,r,{code:r.code,codeExp:r.codeExpiresAt,linkSlot:slot==null?null:String(slot),baseRev:1,savedHash:savedHash||null,lastSavedRev:1});
  await refresh(r.houseId,true);return {hid:r.houseId,code:r.code}}
async function join(code,nick){
  const tokens=Object.values(reg.houses).map(h=>h.token).filter(Boolean);   // 이미 입장한 집이면 서버가 알아보고 중복 참여자를 만들지 않음
  const r=await api('POST','/api/join',{body:{code,nick,tokens}});
  remember(r.houseId,r,r.rejoined?null:{code:String(code).toUpperCase().replace(/[^A-Z0-9]/g,''),codeFrom:'join'});await refresh(r.houseId,true);return {hid:r.houseId,name:r.name,rejoined:!!r.rejoined}}
/* v22 이웃 신청 — 수락/신청 확인 때 서버가 내려 주는 상대 집 참여 토큰을 이 브라우저에 보관(입장하기와 같은 참여자 권한) */
async function adopt(r){if(!r||!r.houseId||!r.token)return false;
  if(reg.houses[r.houseId]&&reg.houses[r.houseId].token)return true;   // 이미 이 집에 들어와 있으면 그대로 사용
  remember(r.houseId,r,{codeFrom:'neighbor'});await refresh(r.houseId,true);return true}
const recoveryKey=hid=>{const h=reg.houses[hid];return h?btoa(hid+':'+h.token).replace(/=+$/,''):''};
async function joinRecovery(key){
  let s='';try{s=atob(String(key).trim())}catch(e){}const m=/^(h_[0-9a-f]{24}):([A-Za-z0-9_-]{30,64})$/.exec(s);
  if(!m)throw new ShareErr(400,'복구 키 형식이 올바르지 않아요');
  const st=await api('GET',`/api/houses/${m[1]}/state`,{token:m[2]});
  remember(m[1],{name:st.house.name,token:m[2],pid:st.me.pid,role:st.me.role});await refresh(m[1],true);return {hid:m[1],name:st.house.name}}
async function leave(hid){await api('POST',`/api/houses/${hid}/leave`,{hid});dropHouse(hid);takeLost()}
async function deleteHouse(hid){await api('DELETE',`/api/houses/${hid}`,{hid});dropHouse(hid);takeLost()}
async function rename(hid,name){await api('PATCH',`/api/houses/${hid}`,{hid,body:{name}});reg.houses[hid].name=name;saveReg();await refresh(hid,true)}
async function setNick(hid,nick){await api('PATCH',`/api/houses/${hid}/me`,{hid,body:{nick}});await refresh(hid,true)}
async function rotate(hid){const r=await api('POST',`/api/houses/${hid}/invite/rotate`,{hid});Object.assign(reg.houses[hid],{code:r.code,codeExp:r.expiresAt});saveReg();await refresh(hid,true);return r.code}
async function revoke(hid){await api('POST',`/api/houses/${hid}/invite/revoke`,{hid});Object.assign(reg.houses[hid],{code:null,codeExp:null});saveReg();await refresh(hid,true)}
async function kick(hid,pid){await api('DELETE',`/api/houses/${hid}/members/${pid}`,{hid});await refresh(hid,true)}
/* 도면 저장(참여자 누구나). baseRev 가 서버 최신과 같을 때만 성공하고, 다르면 409 와 함께 최신 버전 정보를 받는다.
   성공했을 때만 서버 사본(H)과 기준 버전(baseRev)을 새 값으로 바꾼다. */
async function saveDoc(hid,doc,baseRev,summary){
  const r=await api('PUT',`/api/houses/${hid}/doc`,{hid,body:{doc,baseRev,summary}});
  const h=reg.houses[hid];if(h){h.baseRev=r.docRev;h.lastSavedRev=r.docRev;saveReg()}
  if(H[hid]){H[hid].docRev=r.docRev;H[hid].loadedDocRev=r.docRev;H[hid].doc=doc;H[hid].docSavedAt=r.savedAt;H[hid].docSavedBy=r.savedBy}
  return r}
async function getDoc(hid,rev){const d=await api('GET',`/api/houses/${hid}/doc${rev?`?rev=${rev}`:''}`,{hid});if(!d||!docShapeOk(d.doc))throw new ShareErr(502,'서버에서 받은 도면 형식이 올바르지 않아요');return d}
function setLink(hid,patch){const h=reg.houses[hid];if(!h)return;Object.assign(h,patch);saveReg()}
/* 시뮬레이션 대표: 한 번에 한 화면만 캐릭터 행동을 계산해 저장 */
async function lease(hid){try{const r=await api('POST',`/api/houses/${hid}/lease`,{hid});if(H[hid])H[hid].leaderPid=r.leader?H[hid].me.pid:(H[hid].leaderPid===H[hid].me.pid?null:H[hid].leaderPid);return !!r.leader}catch(e){return false}}
const isLeader=hid=>!!(H[hid]&&H[hid].me&&H[hid].leaderPid===H[hid].me.pid);
let polling=null;
async function poll(){if(!enabled()||!Object.keys(reg.houses).length)return false;if(polling)return polling;
  polling=(async()=>{try{const r=await syncAll();const ev=takeDocEvents();if(ev.length)emit({type:'doc',events:ev});if(r.changed||ev.length)emit('poll');return r.changed}finally{polling=null}})();return polling}
/* 저장 알림을 놓치지 않도록: 화면이 보이는 동안 15초마다 '바뀐 게 있는지'만 가볍게 확인하고, 화면이 다시 보이거나 네트워크가 돌아오면 즉시 확인한다 */
let autoT=0;
function startAuto(){clearInterval(autoT);autoT=setInterval(()=>{if(!document.hidden)poll().catch(()=>{})},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll().catch(()=>{})});addEventListener('online',()=>poll().catch(()=>{}));addEventListener('focus',()=>poll().catch(()=>{}))}
if(enabled())startAuto();

/* ---------- 캐릭터 만들기·수정·삭제 ---------- */
async function uploadImage(hid,cid,prep){
  await api('PUT',`/api/houses/${hid}/chars/${cid}/image?w=${prep.w}&h=${prep.h}&alpha=${prep.alpha?1:0}`,{hid,raw:prep.blob,mime:prep.blob.type})}
async function createChar(hid,d,prep){
  const r=await api('POST',`/api/houses/${hid}/chars`,{hid,body:{name:d.name,profile:d.profile,place:d.place||{},sim:d.sim||{}}});
  if(prep){try{await uploadImage(hid,r.id,prep)}catch(e){await api('DELETE',`/api/houses/${hid}/chars/${r.id}`,{hid}).catch(()=>{});throw e}}
  await refresh(hid,true);return r.id}
async function updateChar(id,d,prep){const c=C[id];if(!c)throw new ShareErr(404,'캐릭터를 찾을 수 없어요');
  await api('PATCH',`/api/houses/${c.hid}/chars/${id}`,{hid:c.hid,body:{name:d.name,profile:d.profile}});
  if(prep)await uploadImage(c.hid,id,prep);await refresh(c.hid,true)}
async function removeChar(id){const c=C[id];if(!c)return;await api('DELETE',`/api/houses/${c.hid}/chars/${id}`,{hid:c.hid});
  if(imgCache[id]){URL.revokeObjectURL(imgCache[id].url);delete imgCache[id]}delete C[id];await refresh(c.hid,true)}

/* ---------- 화면용 조회 ---------- */
const regHouses=()=>Object.entries(reg.houses).map(([hid,h])=>({hid,...h}));
const info=hid=>{const h=H[hid],r=reg.houses[hid];return h&&r?{...h,code:r.code,codeExp:r.codeExp,linkSlot:r.linkSlot,token:undefined}:null};
const sharedHouses=()=>Object.keys(reg.houses).filter(hid=>H[hid]&&H[hid].doc).map(hid=>({hid,name:H[hid].name,doc:H[hid].doc,docRev:H[hid].docRev,role:reg.houses[hid].role,rev:H[hid].rev}));
const linkedSlots=()=>new Set(Object.entries(reg.houses).filter(([hid,h])=>h.linkSlot!=null&&H[hid]&&H[hid].doc).map(([hid,h])=>String(h.linkSlot)));   // 서버 사본을 받은 집만(못 받았으면 내 단면도를 그대로 보여 줌)

const notify=()=>emit('poll');
window.VivShare={notify,enabled,store,api,syncAll,poll,refresh,flush,takeLost,onChange:f=>listeners.push(f),
  createHouse,join,joinRecovery,recoveryKey,leave,deleteHouse,rename,setNick,rotate,revoke,kick,saveDoc,getDoc,setLink,lease,isLeader,auto,takeDocEvents,docHash,
  adopt,createChar,updateChar,removeChar,info,sharedHouses,linkedSlots,regHouses,reg:()=>reg,saveReg,ShareErr};
})();
