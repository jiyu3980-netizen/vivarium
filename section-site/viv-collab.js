/* 단면도 편집기 ↔ 공유 집 연결 (공동 편집)
   원칙
   - 편집기에서 하는 모든 변경(추가·이동·크기·회전·삭제·속성·구조)은 이 브라우저의 작업 사본(내 단면도 칸)에만 반영된다.
   - 「저장」 버튼을 눌러 서버가 받아들였을 때만 공유 도면의 최신 버전이 바뀐다. 실패하면 서버 도면은 그대로고 내 작업 사본은 보존된다.
   - 저장할 때 '내가 편집을 시작한 기준 버전(baseRev)'을 같이 보낸다. 그사이 다른 사람이 저장했다면 서버는 거부(409)하고,
     여기서 기준·내 것·서버 최신을 3-way 로 비교해 안전하면 합치고, 위험하면 사용자에게 물어본다(doc-merge.js).
   - 비바리움 관찰 탭은 편집기 상태가 아니라 서버에 저장된 최신 버전만 본다(viv.js). */
(function(){
const B=window.SectionBridge,M=window.DocMerge;if(!B||!M)return;
const SH=()=>window.VivShare||null;
const $=s=>document.querySelector(s);
const esc=B.esc,clone=o=>JSON.parse(JSON.stringify(o));
const hashStr=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return h+':'+s.length};
const canon=doc=>M.stable(B.norm(clone(doc)));
const hashOf=doc=>hashStr(canon(doc));
const busy={},err={},banner={};   // 집 ID → 저장 중 / 마지막 실패 메시지 / 새 저장본 알림
const regOf=hid=>{const S=SH();if(!S)return null;return S.reg().houses[hid]||null};
/* 현재 편집 중인 단면도 칸이 어느 공유 집의 작업 사본인지 */
function curLink(){const S=SH();if(!S||!S.enabled())return null;const cur=String(B.SL.cur);
  for(const [hid,h] of Object.entries(S.reg().houses))if(h.linkSlot!=null&&String(h.linkSlot)===cur&&B.SL.slots[cur])return hid;return null}
const houseName=hid=>{const i=SH().info(hid);return i?i.name:(regOf(hid)||{}).name||'공유 집'};
function status(hid){const r=regOf(hid);if(busy[hid])return 'saving';if(err[hid])return 'failed';
  const slot=B.SL.slots[r.linkSlot];if(!slot)return 'saved';return hashOf(String(B.SL.cur)===String(r.linkSlot)?B.S:slot.doc)!==r.savedHash?'dirty':'saved'}

/* ---------- 화면 ---------- */
const LAB={saved:'저장됨',dirty:'저장되지 않은 변경 사항',saving:'저장 중…',failed:'저장 실패'};
let bar=null,toast=null;
function ensureUi(){
  if(bar)return;
  bar=document.createElement('span');bar.id='shStat';bar.hidden=true;
  const g=$('#bSave').closest('.grp');g.after(bar);
  toast=document.createElement('div');toast.id='shToast';toast.hidden=true;document.body.appendChild(toast);
  addEventListener('beforeunload',e=>{const S=SH();if(!S)return;for(const hid of Object.keys(S.reg().houses))if(regOf(hid).linkSlot!=null&&['dirty','failed','saving'].includes(status(hid))){e.preventDefault();e.returnValue='';return ''}})}
function paint(){
  ensureUi();const hid=curLink(),btn=$('#bSave');
  if(!hid){bar.hidden=true;toast.hidden=true;btn.textContent='저장';btn.disabled=false;btn.title='이름을 정해 저장';return}
  const st=status(hid),r=regOf(hid);
  bar.hidden=false;bar.className='sh-'+st;
  bar.innerHTML=`<b>공유 집 · ${esc(houseName(hid))}</b> <span class="sh-dot"></span><span class="sh-lab">${LAB[st]}</span> <small>v${r.baseRev||'?'}</small>${st==='failed'?` <button id="shRetry">다시 시도</button> <small class="sh-e">${esc(err[hid])}</small>`:''}`;
  btn.textContent=st==='saving'?'저장 중…':'저장 (공유)';btn.disabled=st==='saving';
  btn.title='저장하면 이 집의 모든 참여자에게 반영돼요. 저장 전의 변경은 나만 볼 수 있어요';
  const rt=$('#shRetry');if(rt)rt.onclick=()=>save();
  const b=banner[hid];
  if(b){toast.hidden=false;toast.innerHTML=`<b>${esc(b.by||'다른 참여자')}</b>님이 도면을 저장했어요 (v${b.rev}${b.sum?` · ${esc(b.sum)}`:''}).<br>${st==='dirty'?'내 변경은 아직 저장 전이에요. 저장할 때 자동으로 합치거나, 겹치면 물어볼게요.':''} <button id="shLoad">${st==='dirty'?'지금 병합해서 불러오기':'최신 도면 불러오기'}</button> <button id="shX">닫기</button>`;
    $('#shX').onclick=()=>{delete banner[hid];paint()};$('#shLoad').onclick=()=>pullLatest(hid,true)}
  else toast.hidden=true}

/* ---------- 검증 ---------- */
function validate(doc){
  const p=[];const j=JSON.stringify(doc);
  if(j.length>700*1024)p.push(`도면이 너무 커요 (${Math.round(j.length/1024)}KB / 최대 700KB)`);
  if(!doc.b||!(+doc.b.w>0)||!(+doc.b.f>=1))p.push('건물 크기 정보가 올바르지 않아요');
  for(const k of ['items','parts','ops','stairs'])if(!Array.isArray(doc[k]))p.push(`${k} 목록이 없어요`);
  if(Array.isArray(doc.items)){if(doc.items.length>800)p.push('가구가 너무 많아요 (최대 800개)');
    const u=new Set();doc.items.forEach(i=>{if(!i||i.uid==null||!i.assetId)p.push('가구 정보가 손상됐어요');else if(u.has(i.uid))p.push('가구 ID가 겹쳐요');else u.add(i.uid);if(i&&!(Number.isFinite(+i.x)&&Number.isFinite(+i.e)))p.push('가구 위치가 올바르지 않아요')})}
  if(Array.isArray(doc.parts)){const ids=new Set(doc.parts.map(x=>x.id));if(ids.size!==doc.parts.length)p.push('내벽 ID가 겹쳐요');
    (doc.ops||[]).forEach(o=>{if(o.on&&!['L','R','back'].includes(o.on)&&!ids.has(o.on))p.push('없는 벽에 붙은 문·창문이 있어요')})}
  return [...new Set(p)]}
const nameOf=(k,o)=>k==='items'?((B.AM[o.assetId]||{}).nameKo||''):(k==='parts'?'내벽':(k==='ops'?(o.kind==='door'?'문':'창문'):(k==='stairs'?'계단':'')));

/* ---------- 저장 ---------- */
let again=null;
async function save(){
  const S=SH(),hid=curLink();if(!hid)return false;
  if(busy[hid])return true;            // 처리 중에는 중복 저장 방지
  B.persistNow();
  if(!err[hid]&&hashOf(B.S)===regOf(hid).savedHash){B.msg('저장할 변경 사항이 없어요 (이미 최신으로 저장돼 있어요)');return true}
  busy[hid]=true;err[hid]=null;paint();
  try{
    let doc=B.norm(clone(B.S));
    const problems=validate(doc);if(problems.length)throw Object.assign(new Error('저장할 수 없는 도면이에요: '+problems.join(' / ')),{local:true});
    for(let attempt=0;attempt<4;attempt++){
      const r=regOf(hid),base=r.baseRev||0,hs=H(hid);
      const baseDoc=hs&&hs.loadedDocRev===base?hs.doc:null;
      try{
        const res=await S.saveDoc(hid,doc,base,baseDoc?M.summarize(baseDoc,doc):{});
        S.setLink(hid,{savedHash:hashOf(doc),baseRev:res.docRev,lastSavedRev:res.docRev});delete banner[hid];err[hid]=null;
        B.msg(`공유 집에 저장했어요 (v${res.docRev})`);
        S.refresh(hid,true).then(()=>S.notify&&S.notify()).catch(()=>{});
        return true}
      catch(e){
        if(e.status!==409)throw e;
        /* 다른 참여자가 먼저 저장함 → 서버 도면은 그대로. 기준·내 것·최신을 비교 */
        const latest=await S.getDoc(hid);let bdoc=null;try{bdoc=(await S.getDoc(hid,base)).doc}catch(e2){}
        let res=bdoc?M.merge3(bdoc,doc,latest.doc,{nameOf}):null;
        if(res&&res.clean){doc=B.norm(res.merged);adopt(hid,doc,latest.docRev,false);B.msg('다른 참여자의 변경과 자동으로 합쳤어요. 합친 결과로 저장해요');continue}
        const choice=await askConflict(hid,res,latest,!bdoc);
        if(choice==='cancel'){err[hid]=null;banner[hid]={rev:latest.docRev,by:latest.savedBy,sum:''};S.setLink(hid,{});return true}
        if(choice==='theirs'){backup(hid,doc);adopt(hid,B.norm(clone(latest.doc)),latest.docRev,true);B.msg('최신 공유 도면을 불러왔어요 (내 변경은 백업해 뒀어요)');delete banner[hid];return true}
        // 'mine': 충돌 항목은 내 쪽으로 — 합치되 서버 쪽에서 안전하게 합쳐진 부분은 유지
        const m2=bdoc?M.merge3(bdoc,doc,latest.doc,{nameOf,prefer:'mine'}).merged:doc;
        backup(hid,doc);doc=B.norm(m2);adopt(hid,doc,latest.docRev,false);continue}}
    throw new Error('다른 참여자가 계속 저장하고 있어요. 잠시 후 다시 시도해 주세요')}
  catch(e){err[hid]=e.status===0||!e.status?e.message:e.message;return true}
  finally{busy[hid]=false;paint()}}
const H=hid=>{const i=SH().info(hid);return i};
function backup(hid,doc){try{localStorage.setItem('viv.collab.backup.'+hid,JSON.stringify({t:Date.now(),doc}))}catch(e){}}
/* 편집기의 작업 사본을 doc 로 바꾸고 기준 버전을 갱신(저장 성공이 아니므로 savedHash 는 'discard'일 때만 갱신) */
function adopt(hid,doc,rev,asSaved){
  const r=regOf(hid),isCur=String(B.SL.cur)===String(r.linkSlot);
  if(isCur)B.loadDoc(doc);else{B.SL.slots[r.linkSlot].doc=clone(doc);B.persistNow()}
  SH().setLink(hid,{baseRev:rev,...(asSaved?{savedHash:hashOf(doc)}:{})})}

/* 충돌 안내 대화상자 */
function askConflict(hid,res,latest,noBase){
  return new Promise(resolve=>{
    const d=$('#dlg');const list=res?res.conflicts.slice(0,8).map(c=>`<li>${esc(c.what)} — ${c.kind==='deleted-by-them'?'다른 참여자가 지웠는데 나는 고쳤어요':c.kind==='deleted-by-me'?'내가 지웠는데 다른 참여자가 고쳤어요':c.kind==='orphan'?'지워진 벽에 붙은 문·창문이에요':'둘 다 다르게 바꿨어요'}</li>`).join(''):'';
    d.innerHTML=`<h3>다른 참여자가 먼저 저장했어요</h3>
     <p class="hint"><b>${esc(latest.savedBy||'다른 참여자')}</b>님이 v${latest.docRev}을(를) 저장해서, 내 작업의 기준 버전보다 새로워졌어요. 서버의 도면은 아직 그대로예요.</p>
     ${noBase?'<p class="hint">내가 편집을 시작한 버전이 더 이상 보관되어 있지 않아 자동으로 합칠 수 없어요.</p>':`<p class="hint">자동으로 합칠 수 없는 항목 ${res.conflicts.length}개:</p><ul style="margin:4px 0 8px 18px">${list}${res.conflicts.length>8?'<li>…</li>':''}</ul>`}
     <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
      <button data-c="mine">${noBase?'내 도면으로 덮어써서 저장':'겹치는 항목은 내 쪽으로 해서 저장'}</button>
      <button data-c="theirs">내 변경을 버리고 최신 공유 도면 불러오기</button>
      <button data-c="cancel">취소 (편집 계속, 내 변경은 그대로 보존)</button></div>
     <p class="hint">'내 쪽으로' 를 고르면 서로 겹치지 않는 다른 참여자의 변경은 유지하고, 겹치는 항목만 내 값으로 저장돼요. 내 변경은 이 브라우저에 백업해 둬요.</p>`;
    let done=false;const fin=v=>{if(done)return;done=true;d.onclose=null;if(d.open)d.close();resolve(v)};
    d.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>fin(b.dataset.c));d.onclose=()=>fin('cancel');d.showModal()})}

/* ---------- 최신 저장본 받기 ---------- */
async function pullLatest(hid,force){
  const S=SH(),r=regOf(hid);if(!r||r.linkSlot==null)return;
  const latest=await S.getDoc(hid);if(latest.docRev<=(r.baseRev||0)){delete banner[hid];paint();return}
  { const bad=validate(latest.doc); if(bad.length){B.msg('최신 공유 도면을 불러오지 못했어요: '+bad[0]);return} }
  const st=status(hid);
  if(st==='dirty'&&force){ // 지금 병합해서 불러오기: 안전하면 합치고 아니면 물어본다(저장은 하지 않음)
    const slotDoc=String(B.SL.cur)===String(r.linkSlot)?B.norm(clone(B.S)):B.SL.slots[r.linkSlot].doc;
    let bdoc=null;try{bdoc=(await S.getDoc(hid,r.baseRev)).doc}catch(e){}
    const res=bdoc?M.merge3(bdoc,slotDoc,latest.doc,{nameOf}):null;
    if(res&&res.clean){adopt(hid,B.norm(res.merged),latest.docRev,false);delete banner[hid];B.msg('최신 도면과 합쳤어요. 저장하면 공유돼요');paint();return}
    const c=await askConflict(hid,res,latest,!bdoc);
    if(c==='theirs'){backup(hid,slotDoc);adopt(hid,B.norm(clone(latest.doc)),latest.docRev,true);delete banner[hid]}
    else if(c==='mine'){backup(hid,slotDoc);const m2=bdoc?M.merge3(bdoc,slotDoc,latest.doc,{nameOf,prefer:'mine'}).merged:slotDoc;adopt(hid,B.norm(m2),latest.docRev,false);delete banner[hid]}
    paint();return}
  if(st==='saved'||st==='failed'&&false){adopt(hid,B.norm(clone(latest.doc)),latest.docRev,true);delete banner[hid];B.msg(`최신 공유 도면을 불러왔어요 (v${latest.docRev})`);paint()}}

/* 저장 알림(다른 참여자가 저장함) 처리 */
function onShareEvent(why){
  if(!why||why.type!=='doc')return;
  for(const ev of why.events){
    if(ev.mine)continue;const r=regOf(ev.hid);if(!r||r.linkSlot==null)continue;
    banner[ev.hid]={rev:ev.docRev,by:ev.savedBy,sum:M.summaryText(ev.summary),at:ev.savedAt};
    if(status(ev.hid)==='saved'){pullLatest(ev.hid,false).catch(()=>{})}   // 내 작업이 저장된 상태면 자동으로 최신을 불러옴
  }
  paint()}

/* ---------- 편집 시작 / 탭 전환 ---------- */
async function openForEdit(hid){
  const S=SH(),r=regOf(hid);if(!r)return false;
  await S.refresh(hid,true).catch(()=>{});
  const i=S.info(hid);
  if(r.linkSlot!=null&&B.SL.slots[r.linkSlot]){B.slotOpen(String(r.linkSlot));await pullLatest(hid,false).catch(()=>{});paint();return true}
  if(!i||!i.doc){B.msg('서버에서 도면을 받지 못했어요. 연결을 확인해 주세요');return false}
  const doc=B.norm(clone(i.doc));
  const id=B.slotCreate(doc,i.name);if(!id){B.msg('내 단면도 칸이 가득 찼어요. 하나를 지운 뒤 다시 시도하세요');return false}
  S.setLink(hid,{linkSlot:id,baseRev:i.docRev,savedHash:hashOf(doc)});paint();return true}
function onEnterEdit(){paint();const hid=curLink();if(hid)pullLatest(hid,false).catch(()=>{})}

/* 슬롯 목록에서 지워진 작업 사본은 연결을 끊는다(서버 도면은 그대로) */
function cleanup(){const S=SH();if(!S)return;for(const [hid,h] of Object.entries(S.reg().houses))if(h.linkSlot!=null&&!B.SL.slots[h.linkSlot])S.setLink(hid,{linkSlot:null})}

B.HK.save=save;
B.HK.change.push(()=>{cleanup();paint()});
if(SH())SH().onChange(onShareEvent);
addEventListener('DOMContentLoaded',paint);setTimeout(paint,600);
const css=document.createElement('style');css.textContent=`#shStat{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 8px;border-radius:12px;background:#eef3f8}
#shStat .sh-dot{width:8px;height:8px;border-radius:50%;background:#2a8}#shStat.sh-dirty .sh-dot{background:#e90}#shStat.sh-saving .sh-dot{background:#59f;animation:shp 1s infinite}#shStat.sh-failed{background:#fde8e8}#shStat.sh-failed .sh-dot{background:#d33}
#shStat .sh-e{color:#a22;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#shToast{position:fixed;right:14px;top:56px;z-index:50;max-width:340px;background:#fff8e1;border:1px solid #e0b84a;border-radius:8px;padding:10px 12px;font-size:13px;box-shadow:0 4px 14px #0003}
@keyframes shp{50%{opacity:.3}}`;document.head.appendChild(css);
window.VivCollab={hashOf,status,curLink,save,openForEdit,onEnterEdit,paint,pullLatest,validate,_banner:banner};
})();
