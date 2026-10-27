/* 비바리움 관찰 — 데이터 계층 (도면 데이터 S·저장 슬롯과 완전히 분리)
   저장 범위: 기본은 이 브라우저(localStorage + IndexedDB). 「공유 집」에 있는 캐릭터(id 가 c_ 로 시작)만 viv-share.js 의 서버 사본으로 위임한다.
   - viv.chars.v1 : 캐릭터 프로필(이름·자유 서술 프로필·이미지 메타)  ← 이미지 본문은 IndexedDB('vivarium'/'img')
   - viv.place.v1 : 캐릭터 위치·현재 행동(집, x, 층, 표시 크기, 집 안/외출 상태)
   - viv.sim.v1   : 생활 시뮬레이션 상태(다음 단계에서 사용, 지금은 빈 구조)
   - viv.ui.v1    : 마지막으로 본 집
   이 파일은 sectionSite.* 키와 SL(저장 슬롯)을 읽지도 쓰지도 않는다. */
(function(){
const K={chars:'viv.chars.v1',place:'viv.place.v1',sim:'viv.sim.v1',ui:'viv.ui.v1'};
const MAX_CHARS=8,MAX_UPLOAD=5*1024*1024,MAX_PIXELS=40e6,OUT_MAX=512,OUT_BYTES=1.5*1024*1024,MIN_SIDE=16,NAME_MAX=30,PROFILE_MAX=2000;
const TYPES={'image/png':'PNG','image/jpeg':'JPEG','image/webp':'WebP','image/gif':'GIF'};
const jget=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};
const mb=n=>(n/1048576).toFixed(1);
const RM=()=>(window.VivShare&&window.VivShare.store)||null;      // 공유 집 캐릭터 저장소(서버 상태 사본). 없으면 로컬만.
const isRemote=id=>typeof id==='string'&&id.startsWith('c_')&&!!RM()&&!!RM().char(id);
const newId=()=>'ch_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------- 이미지 본문 저장(IndexedDB, 실패 시 localStorage 데이터 URL) ---------- */
let dbp=null;
const db=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open('vivarium',1);r.onupgradeneeded=()=>r.result.createObjectStore('img');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('blocked'))}catch(e){rej(e)}}));
const idb=(mode,fn)=>db().then(d=>new Promise((res,rej)=>{const t=d.transaction('img',mode),q=fn(t.objectStore('img'));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)}));
const blobToUrl=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(b)});
const urlToBlob=u=>{const m=/^data:([^;]+);base64,(.*)$/.exec(u);if(!m)return null;const s=atob(m[2]),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:m[1]})};
async function imgPut(id,blob){
  try{await idb('readwrite',s=>s.put(blob,id));try{localStorage.removeItem('viv.img.'+id)}catch(e){}return 'idb'}
  catch(e){const u=await blobToUrl(blob);try{localStorage.setItem('viv.img.'+id,u);return 'ls'}catch(e2){throw new Error('브라우저 저장 공간이 부족해서 이미지를 저장하지 못했어요')}}}
async function imgGet(id){
  try{const b=await idb('readonly',s=>s.get(id));if(b)return b}catch(e){}
  try{const u=localStorage.getItem('viv.img.'+id);return u?urlToBlob(u):null}catch(e){return null}}
async function imgDel(id){try{await idb('readwrite',s=>s.delete(id))}catch(e){}try{localStorage.removeItem('viv.img.'+id)}catch(e){}}

/* ---------- 이미지 검증·축소 ---------- */
function sniff(h){
  if(h[0]===0x89&&h[1]===0x50&&h[2]===0x4E&&h[3]===0x47)return 'PNG';
  if(h[0]===0xFF&&h[1]===0xD8&&h[2]===0xFF)return 'JPEG';
  if(h[0]===0x47&&h[1]===0x49&&h[2]===0x46&&h[3]===0x38)return 'GIF';
  if(h[0]===0x52&&h[1]===0x49&&h[2]===0x46&&h[3]===0x46&&h[8]===0x57&&h[9]===0x45&&h[10]===0x42&&h[11]===0x50)return 'WebP';
  return null}
const toBlob=(cv,type,q)=>new Promise(r=>cv.toBlob(r,type,q));
function hasAlpha(cx,w,h){const d=cx.getImageData(0,0,w,h).data;for(let i=3;i<d.length;i+=4)if(d[i]<250)return true;return false}
/* 반환: {blob,w,h,alpha,mime,srcType,srcBytes,srcW,srcH}  — 실패하면 사용자에게 보여줄 문장으로 Error */
async function prepareImage(file,opts){opts=opts||{};const OB=opts.bytes||OUT_BYTES;
  if(!file)throw new Error('이미지 파일을 선택하세요');
  if(file.size>MAX_UPLOAD)throw new Error(`파일이 너무 커요 (${mb(file.size)}MB). 5MB 이하만 등록할 수 있어요`);
  if(file.size<64)throw new Error('파일이 비어 있거나 너무 작아요');
  if(file.type&&!TYPES[file.type])throw new Error('PNG, JPEG, WebP, GIF 파일만 등록할 수 있어요 (SVG 등은 지원하지 않아요)');
  const head=new Uint8Array(await file.slice(0,16).arrayBuffer()),kind=sniff(head);
  if(!kind)throw new Error('이미지 파일이 아니에요. PNG, JPEG, WebP, GIF 파일만 등록할 수 있어요');
  let bmp;try{bmp=await createImageBitmap(file)}catch(e){throw new Error('이미지를 읽을 수 없어요 (손상된 파일일 수 있어요)')}
  const W=bmp.width,H=bmp.height;
  if(W<MIN_SIDE||H<MIN_SIDE){bmp.close&&bmp.close();throw new Error(`이미지가 너무 작아요 (${W}×${H}). 가로·세로 ${MIN_SIDE}px 이상이어야 해요`)}
  if(W*H>MAX_PIXELS){bmp.close&&bmp.close();throw new Error(`이미지 해상도가 너무 커요 (${W}×${H})`)}
  let max=OUT_MAX,alpha=false;
  for(let i=0;i<4;i++){
    const k=Math.min(1,max/Math.max(W,H)),w=Math.max(1,Math.round(W*k)),h=Math.max(1,Math.round(H*k));
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(bmp,0,0,w,h);
    if(i===0)alpha=hasAlpha(cx,w,h);
    let blob=await toBlob(cv,alpha?'image/png':'image/webp',.92);
    if(!blob||blob.type!==(alpha?'image/png':'image/webp'))blob=await toBlob(cv,alpha?'image/png':'image/jpeg',.9);
    if(blob&&blob.size<=OB){bmp.close&&bmp.close();return {blob,w,h,alpha,mime:blob.type,srcType:kind,srcBytes:file.size,srcW:W,srcH:H}}
    max=Math.round(max*.75)}
  bmp.close&&bmp.close();throw new Error('이미지가 너무 복잡해서 용량을 줄일 수 없어요. 더 단순한 이미지를 써 주세요')}

/* ---------- 캐릭터(프로필) ---------- */
const readChars=()=>{const a=jget(K.chars,[]);return Array.isArray(a)?a.filter(c=>c&&c.id):[]};
const writeChars=a=>{if(!jset(K.chars,a))throw new Error('브라우저 저장 공간이 부족해요')};
const urls={};   // charId → {rev, url}  (이미지 본문 → object URL 캐시)
async function imageUrl(id){if(isRemote(id))return RM().imageUrl(id);const c=readChars().find(x=>x.id===id);if(!c||!c.img)return null;const u=urls[id];if(u&&u.rev===c.img.rev)return u.url;
  const b=await imgGet(id);if(!b)return null;if(u)URL.revokeObjectURL(u.url);const url=URL.createObjectURL(b);urls[id]={rev:c.img.rev,url};return url}
function validate(d){
  const name=String(d.name||'').trim(),profile=String(d.profile||'');
  if(!name)throw new Error('캐릭터 이름을 입력하세요');
  if(name.length>NAME_MAX)throw new Error(`이름은 ${NAME_MAX}자 이하로 입력하세요`);
  if(profile.length>PROFILE_MAX)throw new Error(`프로필은 ${PROFILE_MAX}자 이하로 입력하세요 (현재 ${profile.length}자)`);
  return {name,profile}}
/* 새 캐릭터: prep 은 prepareImage 결과(없으면 이미지 없이 등록). 기존 캐릭터 수정: id 를 넘기면 이름·프로필 갱신, prep 이 있으면 이미지 교체 */
async function saveChar(d,prep,id){
  const v=validate(d),all=readChars(),now=Date.now();
  if(!id&&all.length>=MAX_CHARS)throw new Error(`캐릭터는 최대 ${MAX_CHARS}개까지 등록할 수 있어요`);
  let c=id?all.find(x=>x.id===id):null;if(id&&!c)throw new Error('수정할 캐릭터를 찾을 수 없어요');
  const isNew=!c;if(isNew)c={id:newId(),img:null,createdAt:now};
  Object.assign(c,v,{updatedAt:now});
  if(prep){await imgPut(c.id,prep.blob);c.img={mime:prep.mime,w:prep.w,h:prep.h,alpha:!!prep.alpha,bytes:prep.blob.size,srcType:prep.srcType,rev:now}}
  if(isNew)all.push(c);writeChars(all);
  const sim=jget(K.sim,{});if(!sim[c.id]){sim[c.id]={v:1,updatedAt:now,needs:{}};jset(K.sim,sim)}
  return c}
async function removeChar(id){
  writeChars(readChars().filter(c=>c.id!==id));await imgDel(id);if(urls[id]){URL.revokeObjectURL(urls[id].url);delete urls[id]}
  const p=jget(K.place,{});delete p[id];jset(K.place,p);const s=jget(K.sim,{});delete s[id];jset(K.sim,s)}

/* ---------- 위치·행동 / 시뮬레이션 상태 (캐릭터 프로필과도, 도면과도 별도 키) ---------- */
/* 위치·현재 행동(저장은 결과만: 초 단위 기록 없음). action=행동 그룹, verb=세부 행동, tgt=쓰고 있는 가구 uid, pose=stand|sit|lie, e=바닥 위 높이(cm), say=말풍선 문구 */
const DEF_PLACE={house:null,x:null,f:0,h:120,mode:'home',action:'rest',since:0,verb:'',tgt:null,pose:'stand',dy:0,e:null,say:'',partner:null,seg:null};
const placeAll=()=>jget(K.place,{});
const getPlace=id=>isRemote(id)?{...DEF_PLACE,...RM().place(id)}:({...DEF_PLACE,...(placeAll()[id]||{})});
function setPlace(id,patch){
  if(isRemote(id)){const cur={...DEF_PLACE,...RM().place(id)};const next={...cur,...patch};if(patch.mode||patch.action||patch.house!==undefined){next.since=Date.now();patch={...patch,since:next.since}}RM().setPlace(id,patch,next);return next}
  const all=placeAll();const cur={...DEF_PLACE,...(all[id]||{})};const next={...cur,...patch};
  if(patch.mode||patch.action||patch.house!==undefined)next.since=Date.now();all[id]=next;jset(K.place,all);return next}
/* 시뮬레이션 상태: decideAt(다음 결정 시각)·n(결정 횟수)·recent(최근 행동)·then(후속 행동)·wish(사용자 선택)·bias·outUntil … */
const getSim=id=>isRemote(id)?{v:1,updatedAt:0,needs:{},...RM().sim(id)}:((jget(K.sim,{})[id])||{v:1,updatedAt:0,needs:{}});
function setSim(id,patch){
  if(isRemote(id)){const next={...getSim(id),...patch};RM().setSim(id,patch,next);return next}
  const all=jget(K.sim,{});const cur=all[id]||{v:1,updatedAt:0,needs:{}};all[id]={...cur,...patch};jset(K.sim,all);return all[id]}
const getUi=()=>jget(K.ui,{});const setUi=p=>jset(K.ui,{...getUi(),...p});

/* ---------- 서울 시각 (다음 단계 시뮬레이션의 기준) ---------- */
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'});
function seoul(d){const o={};fmt.formatToParts(d||new Date(Date.now())).forEach(p=>o[p.type]=p.value);return {year:+o.year,month:+o.month,day:+o.day,hour:+o.hour,minute:+o.minute,weekday:o.weekday,text:`${o.hour}:${o.minute}`}}

window.Viv={validate,K,MAX_CHARS,MAX_UPLOAD,NAME_MAX,PROFILE_MAX,TYPES,prepareImage,chars:()=>readChars().concat(RM()?RM().chars():[]),localChars:readChars,isRemote,imageBlob:imgGet,
  char:id=>isRemote(id)?RM().char(id):(readChars().find(c=>c.id===id)||null),saveChar,removeChar,imageUrl,
  getPlace,setPlace,getSim,setSim,getUi,setUi,seoul,sniff,idbAvailable:()=>db().then(()=>true,()=>false)};
})();
