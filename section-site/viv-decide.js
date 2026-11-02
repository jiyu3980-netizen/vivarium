/* 비바리움 관찰 v26 — 자율 의사결정 엔진 (욕구 → 충돌 → 가중 효용 → 의도)
   - viv-mind.js / viv-social.js 위에 얹는 규칙 기반 모듈(AI·외부 호출 없음). BDI(믿음·욕구·의도)와 PAD/VAD 정서, LASSI식 성향(주도성·친화성)에서 영감을 받은 규칙이며
     논문 결과의 재현이 아니다. 계수는 이 사이트에서 정한 값이다.
   - 믿음 = 감정·관계 감정(신뢰/애착/원망/경계/질투)·갈등/이별 상태·연애 상태(모두 그 캐릭터가 실제로 겪은 것)
   - 욕구 = 어울림·휴식·위로·자극 + 상대별(화해·다가가기·피하기·연애 감정)
   - 의도 = 다가가기(어울림/위로/화해/연애) · 피하기 · 혼자 있기 · 평소처럼. 욕구가 부딪히면(화해하고 싶지만 자존심, 고백하고 싶지만 수줍음) 성격이 정하고,
     망설임이 선택되면 그 사실을 기록으로 남긴다. 의도는 확정 명령이 아니라 sim.js 의 가중치에만 반영된다(사용자 지정 행동이 항상 우선).
   - 의도는 40~90분 유지(약속·고집)되고, 상태는 s.soc.int 에 저장되지만 서버 동기화 대상이 아니다(다시 계산됨). */
(function(root){
'use strict';
const M=root.Mind;if(!M||!M._soc)return;
const MIN=60000,HOUR=3600000,DAY=86400000;
const I=M._i,SO=M._soc,{clamp,hash,mulberry,tvOf,ensureEmo,pk,pairKey}=I;
const lv=(s,c,k)=>{const e=ensureEmo(s,c);return e&&e.lv[k]?e.lv[k].v:0};
const P=v=>Math.max(0,v||0);
const eul=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return n+(c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?'을':'를')};
const dec=s=>{const S=SO.soc(s);return S.int||(S.int={})};

/* 성격에서 읽는 값(0~1). 프로필에 없으면 0 */
function persona(A){const t=k=>P(tvOf(A,k));
  return {pride:clamp(1.6*(.5*t('smug')+.4*t('tsun')+.3*t('harsh')+.3*t('aloof')),0,1),
    timid:clamp(1.6*(.55*t('shy')+.25*t('inexpr'))-.5*t('bold'),0,1),
    bold:t('bold'),caring:t('caring'),social:t('social'),solitary:t('solitary'),lazy:t('lazy'),worker:t('worker'),
    hot:clamp(t('angry')+.4*t('harsh'),0,1),play:t('playful'),cynic:t('cynic')}}

const WHY_TORN={pride:'자존심이 앞서',timid:'쑥스럽고 두려워서',fear:'거절당할까 불안해서'};
const WHY_P={affiliate:'외로워서',comfort:'위로받고 싶어서',care:'걱정되거나 기뻐서 마음을 건네려',reconcile:'화해하고 싶어서',romance:'마음이 끌려서'};

function deliberate(s,c,A,others,now,env){
  const S=SO.soc(s),pc=persona(A),rng=mulberry(hash(c+'|dec|'+Math.floor(now/(15*MIN))));
  const L=k=>lv(s,c,k)/100;
  const dAff=clamp(L('lonely')*.8+pc.social*.25-pc.solitary*.3+L('bored')*.15,0,1);
  const dRest=clamp(L('tired')*.9+pc.lazy*.15,0,1);
  const dComf=clamp((L('sad')+L('anxious'))*.55,0,1);
  const dStim=clamp((L('bored')+L('curious'))*.5,0,1);
  const fear=clamp(L('anxious')*.5+pc.timid*.5,0,1);
  const cands=[];let maxAvoid=0;
  const cand=(o)=>{
    const f=SO.feelOf(s,c,o),R=s.rel[pk(c,o)],aff=R?R.aff:0,key=pairKey(c,o);
    const cf=S.conf[key]&&S.conf[key].open?S.conf[key]:null,sp=S.sep[key]||null,es=S.estr[key]||null;
    const rom=I.romState(s,c,o),loves=rom.loves&&rom.loves.includes(c)&&(rom.k==='crush'||rom.k==='oneside'||rom.k==='mutual');
    const nm=env.name(o);
    /* 다가가기 */
    const ap=[];
    ap.push({p:'affiliate',g:dAff*(.45+.35*P(aff/100)+.3*f.tr/100),c:fear*.12});
    if(dComf>.15)ap.push({p:'comfort',g:dComf*(.3+.7*f.tr/100),c:fear*.3+pc.pride*.2});
    if(cf||es||(sp&&now-sp.at<20*DAY)){
      const sev=cf?.5+cf.lvl/200:.5;
      ap.push({p:'reconcile',g:clamp((.3+f.att/200+P(aff)/300-f.rs/170)*sev+pc.caring*.12,0,1),c:pc.pride*.55+fear*.3+(cf&&cf.branch==='crisis'?.15:0)})}
    const tdc=S.todo.find(t=>!t.done&&t.w===c&&t.to===o&&(t.k==='comfort'||t.k==='cheer')&&now>=t.due);
    if(tdc)ap.push({p:'care',g:clamp(.5+.3*pc.caring,0,1),c:pc.timid*.2});
    {const rf=M._rfx&&M._rfx.dec?M._rfx.dec(s,c,o,pc,L('lonely')):null;if(rf)ap.push(rf)}   // 연애 상태×성격: 연인·부부·맞짝사랑의 다가감
    if(loves)ap.push({p:'romance',g:clamp(.14+L('excited')*.4+f.att/150+(rom.k==='mutual'?.15:0),0,1),c:pc.timid*.6+fear*.4-pc.bold*.25});
    for(const a of ap)cands.push({k:'approach',to:o,nm,p:a.p,g:a.g,c:clamp(a.c,0,1),u:a.g-.8*clamp(a.c,0,1)});
    /* 피하기 */
    let av=f.rs/100*.6+f.wr/100*.5+f.jl/100*.3+(cf&&(cf.branch==='crisis'||cf.branch==='unresolved')?.3:0)+(sp&&now-sp.at<10*DAY?.2:0);
    av*=1-.25*pc.caring;if(f.tr>70)av*=.7;av*=1+.4*pc.pride;
    av=clamp(av,0,1.2);maxAvoid=Math.max(maxAvoid,av);
    if(av>.12)cands.push({k:'avoid',to:o,nm,p:'avoid',g:av,c:0,u:av*.95})};
  others.forEach(cand);
  cands.push({k:'solitude',p:'solitude',g:dRest*.7+dComf*.15*(1-.5*dAff)+maxAvoid*.4+pc.solitary*.25+L('irritated')*.3,c:0,u:0});
  cands[cands.length-1].u=cands[cands.length-1].g;
  cands.push({k:'routine',p:'routine',g:.22+dStim*.3+pc.worker*.12,c:0,u:.22+dStim*.3+pc.worker*.12});
  /* 성격이 정함: 충동적일수록 온도가 높아 덜 계산적으로 고름 */
  const T=.07+.12*(pc.hot+.5*pc.play+.5*pc.bold),mx=Math.max(...cands.map(x=>x.u));
  const ws=cands.map(x=>Math.exp((x.u-mx)/T));let sum=ws.reduce((a,b)=>a+b,0),r=rng()*sum,pick=cands[cands.length-1];
  for(let i=0;i<cands.length;i++){r-=ws[i];if(r<=0){pick=cands[i];break}}
  /* 마음은 있지만 비용 때문에 다가가지 못한 경우(내적 갈등) */
  let torn=null;
  if(pick.k!=='approach'){
    const t=cands.filter(x=>x.k==='approach'&&x.g>=.2&&x.c>=.22).sort((a,b)=>b.g-a.g)[0];
    if(t){const why=t.p==='reconcile'||t.p==='comfort'?(pc.pride>=fear&&pc.pride>=pc.timid?'pride':'timid'):(pc.timid>=fear?'timid':'fear');
      torn={to:t.to,nm:t.nm,p:t.p,why}}}
  const dur=(40+Math.floor(rng()*51))*MIN;
  const top=[['외로움',dAff],['피곤함',dRest],['위로받고 싶은 마음',dComf],['지루함',dStim]].sort((a,b)=>b[1]-a[1])[0];
  return {k:pick.k,to:pick.to||null,p:pick.p,u:Math.round(pick.u*100)/100,at:now,until:now+dur,torn,drv:top[1]>.25?top[0]:null}}

function step(s,inp,env){
  const D=dec(s),now=inp.now,ids=inp.chars.map(c=>c.id);
  const home=ids.filter(id=>inp.cur[id]&&inp.cur[id].mode==='home');
  for(const c of inp.chars){const id=c.id,cu=inp.cur[id];
    if(!cu||cu.mode!=='home'){continue}
    if(cu.action==='sleep'){delete D[id];continue}
    const cur=D[id];if(cur&&now<cur.until)continue;
    const A=env.A(id);if(!A)continue;
    const it=deliberate(s,id,A,home.filter(o=>o!==id),now,env);D[id]=it;
    /* 관찰 일지용 기록: 눈에 띄는 마음의 움직임만(캐릭터당 3시간에 한 번) */
    const lg=D._lg||(D._lg={});
    const noteworthy=(it.k==='approach'&&(it.p==='reconcile'||it.p==='romance'||it.p==='comfort')&&it.u>=.3)||(it.k==='avoid'&&it.u>=.35)||it.torn;
    if(noteworthy&&(!lg[id]||now-lg[id]>3*HOUR)){lg[id]=now;
      const nm=it.to?env.name(it.to):it.torn?it.torn.nm:'';const pn=A?env.name(id):'';let why;
      if(it.torn&&it.k!=='approach')why=`${nm}에게 ${it.torn.p==='reconcile'?'화해하러 가고':it.torn.p==='romance'?'마음을 전하고':'다가가고'} 싶지만 ${WHY_TORN[it.torn.why]} 망설임`;
      else if(it.k==='approach')why=`${nm}에게 다가가기로 함(${WHY_P[it.p]})`;
      else why=`${eul(nm)} 피하기로 함(마음이 풀리지 않아서)`;
      SO.jr(s,'intent',id,it.to||(it.torn&&it.torn.to)||null,why,now,{k:it.k,p:it.torn&&it.k!=='approach'?'torn:'+it.torn.p:it.p})}}
  for(const id of Object.keys(D)){if(id==='_lg')continue;if(!ids.includes(id))delete D[id]}}

const LINES={
  torn_pride:['{p}에게 먼저 말을 걸고 싶지만 자존심에 괜히 딴청을 피우는 중','{p} 쪽을 힐끗거리다 모른 척 고개를 돌리는 중'],
  torn_timid:['{p}에게 다가가려다 망설이며 주변을 맴도는 중','{p}에게 할 말을 속으로 되뇌다 입을 다무는 중'],
  torn_fear:['{p}가 어떻게 받아들일까 걱정하며 선뜻 다가가지 못하는 중'],
  approach_reconcile:['{p}에게 먼저 다가가 화해의 말을 꺼낼 기회를 보는 중'],
  approach_comfort:['{p} 곁에 앉아 위로받고 싶은 마음에 말을 건네는 중'],
  approach_care:['{p} 곁으로 다가가 마음을 살피려고 말을 고르는 중'],
  approach_romance:['{p} 곁을 맴돌며 눈이 마주칠 때마다 웃음이 새어 나오는 중'],
  avoid:['{p}와 마주치지 않으려고 일부러 다른 일에 몰두하는 중','{p} 쪽은 쳐다보지 않고 자리를 지키는 중']};

function extend(H,s,now){
  const D=dec(s);
  const baseGM=H.groupMul,basePM=H.partnerMul,baseRL=H.relLine;
  H.groupMul=(c,g)=>{let m=baseGM(c,g);const it=D[c];if(!it||now>it.until)return m;
    if(it.k==='solitude'){if(g==='chat')m*=.45;else if(g==='rest'||g==='hobby'||g==='read'||g==='tv')m*=1.25}
    else if(it.k==='approach'){if(g==='chat')m*=1+it.u*1.2}
    else if(it.k==='avoid'){if(g==='chat')m*=.7}
    else if(it.k==='routine'){if(g==='work'||g==='study')m*=1.12}
    return clamp(m,.3,3)};
  H.partnerMul=(c,o)=>{let m=basePM(c,o);const it=D[c];if(!it||now>it.until)return m;
    if(it.k==='approach'){m*=it.to===o?1.5+2*it.u:.85}
    else if(it.k==='avoid'){m*=it.to===o?.2:1}
    else if(it.torn&&it.torn.to===o)m*=1.15;     // 망설이는 상대 곁을 맴돈다
    return clamp(m,.05,4.5)};
  H.relLine=(c,o,A,B,rng,cname,oname,room)=>{const base=baseRL?baseRL(c,o,A,B,rng,cname,oname,room):null;if(base)return base;
    const it=D[c];if(!it||now>it.until||rng()>.6)return null;
    let pool=null;
    if(it.torn&&it.torn.to===o)pool=LINES['torn_'+it.torn.why];
    else if(it.k==='approach'&&it.to===o)pool=LINES['approach_'+it.p];
    else if(it.k==='avoid'&&it.to===o)pool=LINES.avoid;
    if(!pool)return null;
    const t=pool[Math.floor(rng()*pool.length)].replace(/\{p\}(를|가|와|는)?/g,(m,j)=>{const n=oname,f=(n.charCodeAt(n.length-1)-0xAC00)%28;return n+(({'를':f?'을':'를','가':f?'이':'가','와':f?'과':'와','는':f?'은':'는'})[j]||'')});
    return (room?room+'에서 ':'')+t};
  H.intentOf=c=>{const it=D[c];return it&&now<=it.until?it:null};
  return H}

const view=(s,c)=>{const it=dec(s)[c];return it?{...it}:null};
M._dec={step,extend,view,deliberate,persona};
})(typeof window!=='undefined'?window:globalThis);
