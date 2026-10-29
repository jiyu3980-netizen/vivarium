/* 비바리움 관찰 v27 — 사건 연쇄 (감정 전염 · 소식이 만드는 돌봄 행동 · 원인 추적)
   - viv-social.js 위에 얹는 규칙 기반 모듈(AI 아님). 상호작용 의례(정서 에너지)·감정 전염·사건의 시공간 기록 구조에서 영감을 받은 규칙이며 논문 결과의 재현이 아니다. 계수는 이 사이트에서 정한 값이다.
   - 연쇄는 그 캐릭터가 '아는' 정보에서만 이어진다: 이별 소식을 직접 보거나 전해 들은 캐릭터만 가까운 사람을 걱정해 찾아가고, 모르는 캐릭터는 아무 일도 하지 않는다.
   - 감정 전염은 같은 방에 있을 때만, 친할수록·공감 잘하는 성격일수록 크게, 무심한 성격은 작게 번진다(상대가 더 약한 정도까지만, 15분에 한 번).
   - 연쇄 기록: 사건마다 id·시각·장소·참여자·원인(cause)이 남고, trace() 로 원인 사슬을 따라가 볼 수 있다(관찰 일지용). */
(function(root){
'use strict';
const M=root.Mind;if(!M||!M._soc)return;
const MIN=60000,HOUR=3600000;
const I=M._i,SO=M._soc,{clamp,hash,mulberry,tvOf,addEmo,ensureEmo,pk,pairKey,applyEvent}=I;
const P0=v=>Math.max(0,v||0);
const lv=(s,c,k)=>{const e=ensureEmo(s,c);return e&&e.lv[k]?e.lv[k].v:0};
const chn=s=>{const S=SO.soc(s);return S.chn||(S.chn={cs:{}})};
const jong=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28};
const ga=n=>n+(jong(n)?'이':'가');

/* 번지는 감정(긍정·부정) — 이 값 이상일 때만 번지기 시작 */
const SPREAD={sad:{th:50,k:.08,n:'슬픈 기분'},anxious:{th:50,k:.08,n:'불안한 기분'},irritated:{th:55,k:.07,n:'짜증난 기분'},happy:{th:60,k:.07,n:'즐거운 기분'},excited:{th:60,k:.06,n:'들뜬 기분'}};

function contagion(s,env,inp){
  const S=chn(s),now=env.now,slice=Math.floor(now/(15*MIN));
  const home=inp.chars.map(c=>c.id).filter(id=>inp.cur[id]&&inp.cur[id].mode==='home'&&inp.cur[id].seg!=null&&inp.cur[id].action!=='sleep');
  for(const a of home)for(const b of home){if(a===b||inp.cur[a].seg!==inp.cur[b].seg)continue;
    const B=env.A(b),f=SO.feelOf(s,b,a),R=s.rel[pk(b,a)],aff=R?R.aff:0;
    const tie=clamp(.25+f.tr/200+Math.max(0,aff)/250+f.att/300,.1,1.1);
    const sus=clamp(.7+.5*P0(tvOf(B,'caring'))+.25*P0(tvOf(B,'curious'))-.45*P0(tvOf(B,'aloof'))-.25*P0(tvOf(B,'cynic')),.25,1.4);
    for(const k in SPREAD){const sp=SPREAD[k],va=lv(s,a,k),vb=lv(s,b,k);if(va<sp.th||va-vb<12)continue;
      const key=pairKey(a,b)+'>'+a+'>'+k;if(S.cs[key]===slice)continue;S.cs[key]=slice;
      const amt=(va-vb)*sp.k*tie*sus;if(amt<1)continue;
      addEmo(s,b,k,amt,`${env.name(a)}의 ${sp.n}이 곁에서 전해져서`,now,B);
      if(amt>=1.5){const L2=SO.soc(s).lg2||(SO.soc(s).lg2={});L2[b+'c']={at:now,from:a,k}}     // 지문용: 최근 누구의 기분이 옮았는지
      const lg=S.lg||(S.lg={}),lk=a+'>'+b+'>'+k;
      if(amt>=4&&(!lg[lk]||now-lg[lk]>3*HOUR)){lg[lk]=now;SO.jr(s,'contagion',b,a,`${env.name(b)}에게 ${env.name(a)}의 ${sp.n}이 번짐`,now,{emo:k,amt:Math.round(amt)})}}}
  for(const k of Object.keys(S.cs))if(S.cs[k]<slice-8)delete S.cs[k]}

/* 소식(직접 본 것·전해 들은 것)이 가까운 사람에 대한 돌봄 행동 후보를 만든다 */
function ripple(s,env,inp){
  const S=SO.soc(s),now=env.now;
  for(const w of Object.keys(S.know||{})){if(!env.char(w))continue;const A=env.A(w);
    for(const it of S.know[w]){if(it.ch||now-it.at>12*HOUR)continue;it.ch=1;
      const rng=mulberry(hash('rp|'+w+'|'+it.k+'|'+it.a+'|'+it.b+'|'+it.at));
      if(it.k!=='breakup'&&it.k!=='reunion')continue;
      const ties=[it.a,it.b].filter(z=>z!==w&&env.char(z)).map(z=>({z,f:SO.feelOf(s,w,z),aff:((s.rel[pk(w,z)]||{}).aff||0)})).filter(t=>t.f.tr>=50||t.aff>=25).sort((x,y)=>(y.f.tr+y.aff)-(x.f.tr+x.aff));
      if(!ties.length)continue;
      const t=ties[0],p=(.3+.45*P0(tvOf(A,'caring'))+.15*P0(tvOf(A,'social'))-.3*P0(tvOf(A,'aloof')))*it.conf*(t.f.tr/100+.4);
      if(rng()>clamp(p,.05,.9))continue;
      const kind=it.k==='breakup'?'comfort':'cheer';
      if(S.todo.some(x=>!x.done&&x.w===w&&x.to===t.z&&(x.k==='comfort'||x.k==='cheer')))continue;
      S.todo.push({k:kind,w,to:t.z,at:now,due:now+(30+Math.floor(rng()*150))*MIN,exp:now+18*HOUR,src:it.src,pair:[it.a,it.b]})}}}

/* 돌봄 행동 실행: 같은 방에 있게 되면 위로하거나 축하해 주고, 그 결과가 감정·관계 기억으로 남는다 */
function care(s,env,inp,log){
  const S=SO.soc(s),now=env.now;
  for(const t of S.todo){if(t.done||(t.k!=='comfort'&&t.k!=='cheer')||now<t.due)continue;
    const cw=inp.cur[t.w],cz=inp.cur[t.to];if(!cw||!cz||cw.mode!=='home'||cz.mode!=='home'||cw.seg==null||cw.seg!==cz.seg||cw.action==='sleep'||cz.action==='sleep')continue;
    const rng=mulberry(hash('cr|'+t.w+'|'+t.to+'|'+Math.floor(now/(30*MIN))));if(rng()>.5)continue;
    t.done=true;const other=(t.pair||[]).find(x=>x!==t.to);
    if(t.k==='comfort'){
      const r=applyEvent(s,{id:`chn|cm|${pairKey(t.w,t.to)}|${now}`,type:'comfort',a:t.w,b:t.to,at:now},env);if(r)log.push(r);
      SO.jr(s,'care',t.w,t.to,`${ga(env.name(t.w))} ${env.name(t.to)}${other?'의 이별 소식을 듣고':''}${t.src==='heard'?'(전해 들음)':''} 곁에서 위로해 줌`,now,{kind:'comfort',about:[t.to].concat(other?[other]:[])})}
    else{
      addEmo(s,t.to,'happy',14,`${env.name(t.w)}가 다시 만난 일을 함께 기뻐해 줘서`,now,env.A(t.to));addEmo(s,t.w,'happy',8,null,now,env.A(t.w));
      const r=applyEvent(s,{id:`chn|ch|${pairKey(t.w,t.to)}|${now}`,type:'talk',a:t.w,b:t.to,at:now},env);if(r)log.push(r);
      SO.jr(s,'care',t.w,t.to,`${ga(env.name(t.w))} ${env.name(t.to)}의 재회 소식에 함께 기뻐해 줌`,now,{kind:'cheer',about:[t.to].concat(other?[other]:[])})}}}


/* ---------- v32 합산 구조: 갇힘·지정 행동 부담·매너리즘·기시감이 같은 감정을 따로따로 올리지 않고, 한 걸음에 한 번 모아서 반영한다 ----------
   - 감정마다 한 걸음의 총량에 상한(포화)을 두어 여러 원인이 겹쳐도 폭주하지 않는다.
   - 위화감(viv-uncanny)은 이미 감정 목표값에 반영되므로 읽기만 한다: 위화감이 클수록 같은 불안·짜증을 여기서 덜 더해 이중 계산을 막는다.
   - 체류일수에 따른 둔감→민감 곡선(felt)은 지정 행동 부담·매너리즘·기시감이 함께 쓴다. */
let BUF=[];
const emit=(id,emo,amt,why,now,A)=>{if(amt>0)BUF.push({id,emo,amt,why,now,A})};
const unease=(env,id)=>{try{const U=env.unc?env.unc(id):null;if(!U||!U.st||U.st==='stable')return 0;return Math.min(55,(U.b||0)*.55+Math.min(12,Math.max(0,(U.days||0)-2)*.8))/55}catch(e){return 0}};
const CAP=14;
function settle(s,env){
  const S=SO.soc(s),by=new Map();
  for(const e of BUF){const k=e.id+'|'+e.emo;const o=by.get(k)||{id:e.id,emo:e.emo,sum:0,why:null,now:e.now,A:e.A};o.sum+=e.amt;if(!o.why&&e.why)o.why=e.why;by.set(k,o)}
  BUF=[];
  for(const o of by.values()){let a=o.sum;const u=unease(env,o.id);if(u>0&&(o.emo==='anxious'||o.emo==='irritated'))a*=1-.4*u;
    a=CAP*(1-Math.exp(-a/CAP));if(a>=.3)addEmo(s,o.id,o.emo,a,o.why,o.now,o.A)}
  const AX=S.axes||(S.axes={});for(const id of Object.keys(S.apr||{})){const z=S.apr[id];AX[id]={mono:z.mono||0,mn:Math.round(z.mn||0),trap:!!(S.trapst||{})[id],unease:Math.round(unease(env,id)*100)/100}}}
/* 기시감: 같은 곳에서 같은 일을 하루 사이에 여러 번 겪으면 '이 장면을 전에도 본 것 같은' 느낌이 든다(드물게, 12시간에 한 번). 체류가 길어질수록 크게 느낀다 */
function deja(s,inp,env){
  const S=SO.soc(s),now=env.now,D=S.dj||(S.dj={});
  for(const c of inp.chars){const id=c.id,cu=inp.cur[id];if(!cu||cu.action==='sleep'||cu.mode!=='home')continue;
    const z=D[id]||(D[id]={last:null,ring:[],cd:0,at:0}),key=(cu.verb||cu.action||'')+'@'+(cu.seg==null?'':cu.seg);
    if(key===z.last)continue;z.last=key;
    const prior=z.ring.filter(r=>now-r[0]<24*HOUR&&r[1]===key).length;z.ring.push([now,key]);z.ring=z.ring.filter(r=>now-r[0]<24*HOUR).slice(-60);
    const stay=typeof inp.stay==='function'?+inp.stay(id)||0:0,f=felt(stay);
    if(prior>=3&&f>0&&now-z.cd>12*HOUR){const A=env.A(id),nm=env.name(id),st=clamp((prior-2)/4,.3,1)*f,mul=clamp(1+.3*P0(tvOf(A,'negative'))+.3*P0(tvOf(A,'shy'))+.3*P0(tvOf(A,'curious'))-.3*P0(tvOf(A,'lazy'))-.2*P0(tvOf(A,'aloof')),.6,1.5);
      z.cd=now;z.at=now;emit(id,'anxious',5*st*mul,'이 장면을 전에도 겪은 것 같은 묘한 느낌이 들어서',now,A);emit(id,'curious',4*st*mul,null,now,A);
      SO.jr(s,'deja',id,null,`${nm}: 같은 장면이 되풀이된다는 묘한 기시감을 느낌`,now,{n:prior+1,stay:Math.round(stay*10)/10,felt:Math.round(f*100)/100})}}}

/* ---------- v29 갇힘: 출구에 닿을 수 없게 된 캐릭터의 심리와 행동(그 이유는 캐릭터가 모른다) ----------
   - 시간이 지날수록 불안·짜증·(같이 있던 사람과 끊기면)외로움·지루함이 쌓인다. 차분한 성격은 더디게, 예민한 성격은 빠르게. 자는 동안은 쌓이지 않는다.
   - 전화기에 닿을 수 있으면 친한 사람에게 도움을 청한다(그 사람만 알게 되어 걱정함). 전화기가 없으면 아무도 모른다(정보 비대칭).
   - 다시 갈 수 있게 되면 안도한다. 기록에는 시각·장소·원인(막힘 → 불안 → 도움 요청 → 걱정)이 이어서 남는다. */
const TRAP_STAGES=[[3,'몇 시간째 갇혀 있어 불안이 커지고 있음'],[12,'반나절 넘게 나가지 못해 지쳐 가는 중'],[24,'하루가 넘도록 같은 곳에 갇혀 지냄']];
function trap(s,inp,env,log){
  const S=SO.soc(s),now=env.now,T=S.trapst||(S.trapst={});
  const ids=inp.chars.map(c=>c.id);
  for(const id of ids){const cu=inp.cur[id];if(!cu)continue;const A=env.A(id),nm=env.name(id),st=T[id];
    if(cu.mode==='home'&&cu.trap){
      if(!st){const e=SO.jr(s,'trap',id,null,`${nm}: 갈 수 있는 곳이 막혀 집 밖으로 나가지 못하게 됨`,now,{});T[id]={since:now,last:now,stage:0,logId:e.id,help:0};continue}
      const dt=Math.min(30,Math.max(0,(now-st.last)/MIN));st.last=now;const hrs=(now-st.since)/HOUR;
      /* 같이 있던 사람들과 끊겼는가 */
      const rch=new Set(cu.rch||[]);const cut=ids.some(o=>o!==id&&inp.cur[o]&&inp.cur[o].mode==='home'&&inp.cur[o].seg!=null&&!rch.has(inp.cur[o].seg));
      if(cu.action!=='sleep'&&dt>0){
        const vul=clamp(1+.45*P0(tvOf(A,'shy'))+.4*P0(tvOf(A,'negative'))+.2*P0(tvOf(A,'jealous'))-.35*P0(tvOf(A,'aloof'))-.3*P0(tvOf(A,'solitary'))-.25*P0(tvOf(A,'lazy'))-.2*P0(tvOf(A,'bold')),.5,1.7);
        const g=(emo,k,cap,why)=>{if(lv(s,id,emo)<cap)emit(id,emo,Math.max(.3,dt/60*k*vul),why,now,A)};
        g('anxious',7,75,'갈 수 있는 곳이 막혀 밖으로 나갈 수 없어서');g('irritated',3.5+Math.min(4,hrs*.4),65,'나가려 해도 길이 없어서');g('bored',3,70,'같은 곳에만 머물러야 해서');
        if(cut)g('lonely',5,75,'같이 있던 사람들과 만날 수 없어서')}
      /* 단계 기록 */
      while(st.stage<TRAP_STAGES.length&&hrs>=TRAP_STAGES[st.stage][0]){SO.jr(s,'trap',id,null,`${nm}: ${TRAP_STAGES[st.stage][1]}`,now,{cause:st.logId,hrs:Math.round(hrs)});st.stage++}
      /* 전화기로 도움 청하기 */
      if(cu.ph&&hrs>=1.5&&now-(st.callAt||0)>12*HOUR&&cu.action!=='sleep'){
        const rng=mulberry(hash('tp|'+id+'|'+Math.floor(now/(30*MIN))));
        const p=clamp(.1+.2*P0(tvOf(A,'social'))+.15*P0(tvOf(A,'bold'))-.15*P0(tvOf(A,'shy'))+Math.min(.3,hrs*.03),.05,.6);
        if(rng()<p){
          const cand=ids.filter(o=>o!==id&&env.char(o)).map(o=>({o,f:SO.feelOf(s,o,id),aff:((s.rel[pk(o,id)]||{}).aff||0)})).filter(x=>x.f.tr>=40||x.aff>=20).sort((a,b)=>(b.f.tr+b.aff)-(a.f.tr+a.aff));
          st.callAt=now;
          if(cand.length){const w=cand[0].o;
            SO.addKnow(s,w,{k:'trapped',a:id,b:id,at:now,src:'heard',conf:1,from:id});
            addEmo(s,w,'anxious',16,`${nm}이(가) 갇혀서 도움을 청해 와서`,now,env.A(w));
            SO.jr(s,'care',w,id,`${env.name(w)}: ${nm}의 도움 요청 전화를 받고 걱정함`,now,{kind:'help_call',cause:st.logId,about:[id,w],place:undefined})}
          else SO.jr(s,'trap',id,null,`${nm}: 도움을 청하고 싶었지만 연락할 사람이 없음`,now,{cause:st.logId})}}
    }else if(st){
      /* 다시 갈 수 있게 됨(또는 집을 떠남) */
      if(cu.mode==='home'&&!cu.trap){emit(id,'calm',16,'막혔던 길이 다시 열려서',now,A);emit(id,'happy',8,null,now,A);
        SO.jr(s,'trap',id,null,`${env.name(id)}: 다시 갈 수 있게 되어 한숨 돌림(${Math.round((now-st.since)/HOUR)}시간 만)`,now,{cause:st.logId,freed:1})}
      delete T[id]}}}
const trapOf=(s,id)=>{const t=(SO.soc(s).trapst||{})[id];return t?{since:t.since}:null};

/* ---------- v29 지정 행동의 부담: 짧은 시간에 너무 자주 바뀌거나 같은 지정만 되풀이되면 캐릭터가 어리둥절·불쾌해한다 ----------
   - 캐릭터는 '왜 이런 일이 자꾸 생기는지' 모른다(원인은 하던 일이 계속 바뀌는 느낌·같은 일의 되풀이로만 느낀다).
   - 체류 일수에 따라 느끼는 정도가 달라진다: 초반(첫 이틀)에는 느끼지 못하고, 날이 쌓일수록 차츰 크게 느낀다.
   - 이미 있는 감정(짜증·불안·지루함)에 더해지므로 감정 전염·위화감 부담·의사결정에도 그대로 이어진다. */
const FELT=[[0,0],[1.5,0],[3,.2],[7,.5],[14,.8],[30,1.1]];
const felt=d=>{for(let i=1;i<FELT.length;i++)if(d<=FELT[i][0]){const [x0,y0]=FELT[i-1],[x1,y1]=FELT[i];return y0+(y1-y0)*(d-x0)/(x1-x0)}return FELT[FELT.length-1][1]};
function strain(s,inp,env){
  const S=SO.soc(s),now=env.now,Z=S.strain||(S.strain={}),lg=S.lg2||(S.lg2={});
  for(const c of inp.chars){const id=c.id,cu=inp.cur[id];if(!cu||!Array.isArray(cu.wh)||!cu.wh.length)continue;
    const wh=cu.wh,last=wh[wh.length-1].at,z=Z[id]||(Z[id]={seen:0});if(last<=z.seen)continue;z.seen=last;
    const w5=wh.filter(h=>now-h.at<5*MIN),w10=wh.filter(h=>now-h.at<10*MIN),w30=wh.filter(h=>now-h.at<30*MIN),w3h=wh.filter(h=>now-h.at<3*HOUR);
    const kinds=new Set(w10.map(h=>h.k)).size,sameN=Math.max(...[...new Set(w30.map(h=>h.k))].map(k=>w30.filter(h=>h.k===k).length));
    const busy=(w5.length>=3||kinds>=4)?(w5.length-2)+(kinds-3):0;
    const rep=(sameN>=4||w3h.filter(h=>h.k===wh[wh.length-1].k).length>=7)?Math.max(sameN-3,w3h.filter(h=>h.k===wh[wh.length-1].k).length-6):0;
    if(busy<=0&&rep<=0)continue;
    const stay=typeof inp.stay==='function'?+inp.stay(id)||0:0,f=felt(stay);if(f<=0)continue;   // 초반에는 아직 느끼지 않는다
    const A=env.A(id),nm=env.name(id);
    const mul=clamp(1+.4*P0(tvOf(A,'negative'))+.3*P0(tvOf(A,'shy'))+.3*P0(tvOf(A,'angry'))-.3*P0(tvOf(A,'playful'))-.2*P0(tvOf(A,'lazy')),.5,1.6)*f;
    if(busy>0){const k=Math.min(2.5,1+.35*(busy-1));emit(id,'irritated',3.5*k*mul,'하던 일을 계속 바꾸게 되어 정신이 없고 어리둥절해서',now,A);emit(id,'anxious',2.5*k*mul,null,now,A)}
    if(rep>0){const k=Math.min(2.5,1+.3*(rep-1));emit(id,'anxious',3.5*k*mul,'같은 일을 자꾸 되풀이하게 되어 이상하고 불쾌한 기분이 들어서',now,A);emit(id,'irritated',2.5*k*mul,null,now,A);emit(id,'bored',2.5*k*mul,null,now,A)}
    const key=id+(busy>0?'b':'r');
    if(!lg[key]||now-lg[key]>HOUR){lg[key]=now;SO.jr(s,'strain',id,null,busy>0?`${nm}: 하던 일이 짧은 시간에 계속 바뀌어 어리둥절하고 불쾌해함`:`${nm}: 같은 일만 되풀이하게 되어 이상하고 불쾌한 기분을 느낌`,now,{kind:busy>0?'busy':'repeat',stay:Math.round(stay*10)/10,felt:Math.round(f*100)/100})}}}

/* ---------- v30 상황 해석(appraisal): 상황을 하나하나 지정하지 않아도, 캐릭터가 겪는 환경을 공통 축으로 읽어 감정·무기력으로 옮긴다 ----------
   축: 다양성(최근 반나절 동안 머문 곳·한 일의 폭), 선택지(닿을 수 있는 곳에 놓인 가구의 종류), 체류일수(초반엔 둔하고 차츰 크게 느낌)
   단조로움 = 폭이 좁고 선택지가 적은 정도 → 쌓이면 '매너리즘'(느린 변수) → 지루함·무기력으로 번지고, 이미 있는 감정 연쇄(전염·의사결정)에 그대로 이어진다.
   캐릭터는 원인을 모른다. 기록에는 상태의 변화만 남긴다. */
const MN_STAGES=[[30,'같은 일이 되풀이되어 단조롭게 느끼기 시작함'],[60,'매너리즘에 빠져 의욕이 떨어짐'],[85,'깊은 무기력에 빠져 아무것도 하고 싶지 않아 함']];
const effN=m=>{let t=0;for(const k in m)t+=m[k];if(t<=0)return 1;let h=0;for(const k in m){const p=m[k]/t;if(p>0)h-=p*Math.log(p)}return Math.exp(h)};
function appraise(s,inp,env){
  const S=SO.soc(s),now=env.now,AP=S.apr||(S.apr={});
  for(const c of inp.chars){const id=c.id,cu=inp.cur[id];if(!cu)continue;const z=AP[id]||(AP[id]={t:now,sw:{},aw:{},mn:0,stage:0,lg:0});
    const dt=Math.min(30,Math.max(0,(now-z.t)/MIN));z.t=now;if(dt<=0)continue;
    const dec=Math.pow(.5,dt/360);for(const k in z.sw){z.sw[k]*=dec;if(z.sw[k]<.01)delete z.sw[k]}for(const k in z.aw){z.aw[k]*=dec;if(z.aw[k]<.01)delete z.aw[k]}
    if(cu.action==='sleep')continue;
    const sk=cu.mode==='home'?(cu.seg||'?'):'OUT',ak=cu.mode==='home'?(cu.action||'idle'):'OUT';
    z.sw[sk]=(z.sw[sk]||0)+dt;z.aw[ak]=(z.aw[ak]||0)+dt;
    const tot=Object.values(z.sw).reduce((a,b)=>a+b,0);if(tot<120)continue;      // 아직 판단할 만큼 지켜보지 못함
    const A=env.A(id),nm=env.name(id),stay=typeof inp.stay==='function'?+inp.stay(id)||0:0,f=felt(stay);
    const varS=clamp((effN(z.sw)-1)/2.5,0,1),varA=clamp((effN(z.aw)-1)/3,0,1),vr=.5*varS+.5*varA;
    const rich=cu.fk==null?1:clamp(cu.fk/6,0,1);
    const mono=clamp((1-vr)*.7+(1-rich)*.5,0,1);z.mono=Math.round(mono*100)/100;z.fk=cu.fk==null?null:cu.fk;
    const out=cu.mode!=='home';
    if(f>0&&!out){
      const r=mono-.45;
      if(r>0){const tr=clamp(1+.4*P0(tvOf(A,'curious'))+.4*P0(tvOf(A,'playful'))+.3*P0(tvOf(A,'bold'))+.2*P0(tvOf(A,'negative'))-.3*P0(tvOf(A,'lazy'))-.3*P0(tvOf(A,'aloof'))-.25*P0(tvOf(A,'solitary')),.5,1.7);
        z.mn=Math.min(100,z.mn+dt/60*r*3*f*tr)}
      else z.mn=Math.max(0,z.mn-dt/60*(.45-mono)*10)}
    else if(out)z.mn=Math.max(0,z.mn-dt/60*6);     // 밖에 나가 있는 동안은 풀린다
    if(z.mn>=20){const sc=z.mn/100,why=(z.fk!=null&&z.fk<=2)?'이 공간에선 할 수 있는 일이 거의 없고 늘 같은 일뿐이라서':'늘 같은 곳에서 같은 일만 되풀이하게 되어서';
      if(lv(s,id,'bored')<80)emit(id,'bored',Math.max(.3,dt/60*sc*5),why,now,A);
      if(z.mn>=50&&lv(s,id,'sad')<50)emit(id,'sad',Math.max(.3,dt/60*(z.mn-50)/50*2.5),'아무것도 달라지지 않는 것 같아 의욕이 없어서',now,A);
      if(z.mn>=70&&lv(s,id,'irritated')<45)emit(id,'irritated',dt/60*(z.mn-70)/30*2,null,now,A)}
    while(z.stage<MN_STAGES.length&&z.mn>=MN_STAGES[z.stage][0]){SO.jr(s,'mannerism',id,null,`${nm}: ${MN_STAGES[z.stage][1]}`,now,{mn:Math.round(z.mn),mono:z.mono,stay:Math.round(stay*10)/10});z.stage++}
    while(z.stage>0&&z.mn<MN_STAGES[z.stage-1][0]-12){z.stage--;if(z.stage===0)SO.jr(s,'mannerism',id,null,`${nm}: 단조로운 기분에서 벗어남`,now,{mn:Math.round(z.mn),freed:1})}}}
const apprOf=(s,id)=>{const z=(SO.soc(s).apr||{})[id];return z?{mn:z.mn,mono:z.mono||0,fk:z.fk}:null};

/* ---------- v31 마음이 행동과 지문에 드러나게: 감정·상태 → 행동 선택 가중치(모든 행동 종류) + 혼자 있을 때 지문의 표정·몸짓 ----------
   - 확정 명령이 아니라 확률 가중치다(기존 groupMul 위에 곱함). 불안은 서성임·덜 먹음, 짜증은 거친 집안일·서성임, 지루함과 매너리즘은 늘어짐·TV·휴식 쪽으로, 갇힘은 서성임.
   - 지문: 혼자 하는 행동에는 지금 가장 두드러진 상태에 맞는 짧은 관찰 문구가 붙는다(성격에 따라 표현이 달라짐, 같은 문구가 연달아 나오지 않음). 연인·관계 장면과 위화감 행동은 기존 지문을 그대로 둔다. */
/* ---------- v33 행동별 문구: 서성임·휴식·TV·식사·집안일은 그 행동에 맞는 마음 표현만 붙고(맞는 문구가 없으면 붙이지 않음), 서성임은 상태별 문장으로 통째로 바뀐다 ---------- */
const GT={
 rest:{
  anxious:['쉬는 것 같지만 마음은 여전히 불안해 보임','가만히 있지 못하고 자세를 자꾸 바꿈','쉬면서도 문득 시계를 확인함'],
  irritated:['쉬는 중에도 미간이 펴지지 않음','작은 소리에도 고개를 홱 돌림'],
  sad:['쉬면서도 표정이 가라앉아 있음','한참 멍하니 한 곳만 바라봄'],
  lonely:['곁이 허전한 듯 자꾸 주위를 둘러봄','휴대폰을 쥐었다 놓았다 함'],
  bored:['쉬는 것도 지루한 듯 하품이 나옴','딱히 하고 싶은 것 없이 시간만 보냄'],
  tired:['눈이 반쯤 감긴 채 몸을 맡기고 있음','깊이 숨을 내쉬며 몸을 늘어뜨림'],
  excited:['쉬면서도 들뜬 기분에 입꼬리가 올라감'],happy:['여유롭게 미소를 띠고 있음','편안한 얼굴로 숨을 고름'],
  mn1:['어제도 그제도 이랬다는 듯 무덤덤한 얼굴','같은 자세로 같은 시간을 보냄'],mn2:['아무것도 하고 싶지 않은 듯 늘어져 있음','시선이 풀린 채 가만히 있음'],
  trap:['나가고 싶은 마음에 쉬어도 쉰 것 같지 않아 함','출입구 쪽을 자꾸 힐끗거림'],busy:['방금까지 하던 일이 뭐였는지 잠시 헷갈려 함'],rep:['같은 일만 되풀이하는 것 같다는 듯 고개를 갸웃함'],
  deja:['이 장면을 전에도 본 것만 같은 표정'],unease:['어딘가 어색한 공기에 주위를 살핌']},
 tv:{
  anxious:['화면을 보는 듯하지만 내용이 머리에 들어오지 않음','채널만 자꾸 돌림'],
  irritated:['리모컨을 거칠게 쥐고 채널을 휙휙 넘김','화면을 노려보듯 봄'],
  sad:['화면을 멍하니 보다 한숨을 쉼','웃음소리가 나와도 표정이 그대로임'],
  lonely:['소리라도 있어야 한다는 듯 볼륨을 키움','화면 속 사람들을 부러운 듯 바라봄'],
  bored:['볼 것이 없다는 듯 채널을 계속 넘김','하품을 하며 화면만 바라봄'],
  tired:['화면 앞에서 고개가 자꾸 꺼덕거림','눈을 비비며 졸음을 참음'],
  excited:['화면에 푹 빠져 몸을 앞으로 기울임'],happy:['웃음을 터뜨리며 즐겁게 봄'],
  mn1:['어제 본 것과 비슷하다는 듯 심드렁하게 봄','습관처럼 화면을 켜 둠'],mn2:['화면은 켜 놓았지만 보고 있지 않은 듯함','아무 감흥 없이 화면 빛만 받고 있음'],
  trap:['화면을 보면서도 자꾸 출입구 쪽에 신경이 감'],busy:['보던 것을 놓친 듯 되감아 봄'],rep:['본 것을 또 보는 것 같다며 고개를 갸웃함'],
  deja:['이 장면을 전에도 본 것 같다며 멈칫함'],unease:['화면 속 풍경이 어딘가 어색하게 느껴지는 듯 눈을 찌푸림']},
 chore:{
  anxious:['손을 놀리면서도 마음은 딴 데 가 있음','일에 집중하지 못하고 같은 곳을 자꾸 만짐'],
  irritated:['손길이 평소보다 거칠어짐','물건을 내려놓는 소리가 커짐'],
  sad:['기운 없이 느릿느릿 손을 움직임','하다 말고 멍하니 서 있음'],
  lonely:['혼자 하는 일이 문득 쓸쓸한 듯 주위를 둘러봄'],
  bored:['시킨 일이라도 하듯 건성으로 손을 움직임','하품을 하며 억지로 마무리함'],
  tired:['몸이 무거워 자꾸 손을 멈춤','허리를 두드리며 숨을 고름'],
  excited:['콧노래를 흥얼거리며 신나게 손을 놀림'],happy:['기분 좋은 얼굴로 가볍게 손을 움직임'],
  mn1:['매일 하는 일이라는 듯 기계적으로 손을 움직임','같은 동작을 되풀이함'],mn2:['의욕 없이 시늉만 함','손만 움직일 뿐 마음은 딴 데 가 있는 듯함'],
  trap:['일을 하면서도 자꾸 출입구 쪽을 힐끗거림'],busy:['하던 일을 잠시 잊은 듯 멈칫함'],rep:['같은 일만 되풀이하는 것 같다며 고개를 갸웃함'],
  deja:['이 장면을 전에도 본 것 같아 멈칫함'],unease:['익숙한 물건이 어딘가 낯설게 느껴지는 듯 만져 봄']},
 hobby_make:{
  anxious:['손은 움직이지만 마음이 딴 데 가 있어 자꾸 실수함','집중하려다 자꾸 손을 멈추고 숨을 고름'],irritated:['마음에 안 드는 듯 만든 것을 거칠게 밀어 놓음','한숨을 쉬며 처음부터 다시 함'],
  sad:['하던 손을 멈추고 한참 멍하니 있음','결과물이 마음에 들지 않는 듯 쓸쓸한 표정'],lonely:['혼자 하는 일이 문득 허전한 듯 손을 멈춤','보여 줄 사람이 없다는 듯 작품을 바라봄'],
  bored:['흥이 나지 않는 듯 건성으로 손을 움직임','시간을 때우듯 이어 감'],tired:['눈이 피곤한 듯 자꾸 눈을 비빔','집중이 흐트러져 자꾸 손이 느려짐'],
  excited:['신이 나서 시간 가는 줄 모르는 얼굴','아이디어가 떠오른 듯 손이 빨라짐'],happy:['즐거운 얼굴로 몰입함','흥얼거리며 손을 움직임'],
  mn1:['늘 하던 대로 손만 움직임','새로운 시도 없이 같은 것만 반복함'],mn2:['의욕 없이 시늉만 함','손을 움직이면서도 아무 흥미가 없어 보임'],
  trap:['손을 움직이면서도 출입구 쪽을 자꾸 힐끗거림'],deja:['이 장면을 전에도 본 것 같아 멈칫함']},
 hobby_play:{
  anxious:['판에 집중하지 못하고 자꾸 딴 곳을 봄','손을 대면서도 마음이 불안해 보임'],irritated:['잘 안 풀리자 거칠게 내려놓음','입술을 깨물며 승부에 짜증을 냄'],
  sad:['즐거운 것 같지 않은 표정으로 이어 감','한 판이 끝나도 멍하니 앉아 있음'],lonely:['같이 할 사람이 없는 게 아쉬운 듯 둘러봄','혼자 하는 것이 허전한 표정'],
  bored:['재미가 없는 듯 하품을 함','건성으로 몇 번 건드리다 말다 함'],tired:['졸린 눈으로 겨우 이어 감','집중이 흐트러져 자꾸 놓침'],
  excited:['승부에 푹 빠져 몸을 앞으로 기울임','신이 나서 웃음이 터짐'],happy:['즐거운 얼굴로 몰입함'],
  mn1:['늘 하던 방식 그대로 이어 감','같은 판을 되풀이하는 느낌으로 함'],mn2:['아무 흥미 없이 손만 움직임'],
  trap:['하면서도 자꾸 출입구 쪽에 신경이 감'],deja:['이 장면을 전에도 본 것 같아 멈칫함']},
 hobby_music:{
  anxious:['리듬에 몸을 맡기지 못하고 안절부절못함','가만히 있지 못하고 발끝만 까딱임'],irritated:['마음에 안 드는 듯 곡을 휙 넘김','볼륨을 올려 짜증을 덮으려 함'],
  sad:['가라앉은 표정으로 가사를 곱씹음','음악이 끝나도 한참 멍하니 있음'],lonely:['노래 속 이야기가 남 일 같지 않은 듯 눈을 감음','혼자 듣는 음악이 쓸쓸해 보임'],
  bored:['곡을 계속 넘기며 마음에 드는 것을 못 찾음','흥이 없는 얼굴로 흘려 들음'],tired:['눈을 감고 늘어진 채 듣고 있음'],
  excited:['리듬에 몸이 절로 들썩임','입꼬리가 올라가 노래를 따라 흥얼거림'],happy:['기분 좋은 얼굴로 박자를 맞춤','가볍게 어깨를 흔듦'],
  mn1:['늘 듣던 곡을 습관처럼 다시 틂','같은 곡을 되풀이해서 들음'],mn2:['아무것도 들리지 않는 듯 멍하니 있음'],
  trap:['음악 속에서도 출입구 쪽을 힐끗거림'],deja:['이 곡을 전에도 이 자리에서 들은 것 같아 멈칫함']},
 work:{
  anxious:['일에 집중하지 못하고 자꾸 시계를 봄','같은 문장을 몇 번이나 다시 확인함'],irritated:['자판을 두드리는 소리가 거칠어짐','미간을 찌푸린 채 화면을 노려봄'],
  sad:['손이 느려지고 한숨이 잦음','화면을 보다 멍하니 시선이 풀림'],lonely:['혼자 일하는 시간이 길게 느껴지는 듯 주위를 둘러봄'],
  bored:['집중이 안 되는 듯 자꾸 딴 곳을 봄','하품을 하며 의무감으로 이어 감'],tired:['눈이 피곤한 듯 자꾸 눈을 비빔','어깨를 두드리며 숨을 고름'],
  excited:['의욕이 넘쳐 속도가 빨라짐'],happy:['가벼운 얼굴로 술술 풀어 감'],
  mn1:['매일 하던 일이라는 듯 기계적으로 처리함','같은 일의 되풀이라는 듯 무덤덤하게 이어 감'],mn2:['의욕 없이 시늉만 함','화면만 바라보며 손이 멈춰 있음'],
  trap:['일을 하면서도 자꾸 출입구 쪽을 힐끗거림'],busy:['하던 일을 잠시 잊은 듯 화면을 되돌려 봄'],rep:['같은 일만 되풀이하는 것 같다며 고개를 갸웃함'],
  deja:['이 장면을 전에도 본 것 같아 멈칫함'],unease:['익숙한 화면이 어딘가 낯설게 느껴지는 듯 눈을 찌푸림']},
 read:{
  anxious:['글자는 보지만 내용이 머리에 들어오지 않음','같은 줄을 몇 번이나 다시 읽음'],irritated:['책장을 거칠게 넘김','집중이 안 되는 듯 책을 탁 덮었다 다시 폄'],
  sad:['책 속 문장에 오래 머물며 한숨을 쉼','페이지를 넘기지 못한 채 멍하니 있음'],lonely:['책 속 인물이 부러운 듯 오래 들여다봄','읽다가 문득 주위를 둘러봄'],
  bored:['책장을 넘기는 속도가 빨라짐','하품을 하며 건성으로 읽음'],tired:['눈꺼풀이 자꾸 내려와 같은 줄을 맴돎','책을 든 손에 힘이 빠짐'],
  excited:['책 속에 푹 빠져 시간 가는 줄 모름'],happy:['미소를 머금고 읽어 감'],
  mn1:['이미 아는 이야기를 다시 읽는 듯 무덤덤함'],mn2:['글자만 따라갈 뿐 아무것도 담지 못하는 듯함'],
  trap:['읽으면서도 자꾸 출입구 쪽을 힐끗거림'],deja:['이 장면을 전에도 본 것 같아 멈칫함']},
 study:{
  anxious:['공부에 집중하지 못하고 자꾸 시계를 봄','같은 문제를 몇 번이나 다시 봄'],irritated:['필기하는 손이 거칠어짐','안 풀리는 듯 펜을 탁 내려놓음'],
  sad:['펜을 쥔 채 멍하니 시선이 풀림'],lonely:['혼자 하는 공부가 길게 느껴지는 듯 주위를 둘러봄'],
  bored:['하품을 하며 자꾸 딴짓을 하려 함','집중이 안 되는 듯 펜을 돌림'],tired:['졸음을 참으며 눈을 비빔','고개가 자꾸 꺼덕거림'],
  excited:['의욕이 넘쳐 빠르게 써 내려감'],happy:['가벼운 얼굴로 술술 풀어 감'],
  mn1:['매일 하던 공부라는 듯 기계적으로 함'],mn2:['의욕 없이 책만 펴 놓고 있음'],trap:['공부하면서도 자꾸 출입구 쪽을 힐끗거림'],deja:['이 장면을 전에도 본 것 같아 멈칫함']},
 wake:{
  anxious:['서두르는 손길이 어딘가 불안해 보임','거울 속 얼굴을 한참 살핌'],irritated:['동작이 거칠고 말수가 적음','괜히 한숨을 쉬며 서두름'],
  sad:['기운 없이 느릿느릿 준비함','거울 속 자기 얼굴을 멍하니 바라봄'],lonely:['혼자 준비하는 아침이 허전한 듯 주위를 둘러봄'],
  bored:['하품을 하며 느릿느릿 움직임'],tired:['아직 잠이 덜 깬 듯 눈을 비빔','몸이 무거워 동작이 느림'],
  excited:['들뜬 기분에 콧노래를 흥얼거림'],happy:['기분 좋은 얼굴로 가볍게 움직임'],
  mn1:['매일 반복하는 일과라는 듯 기계적으로 움직임'],mn2:['의욕 없이 겨우 몸을 움직임'],trap:['준비하면서도 자꾸 출입구 쪽을 힐끗거림'],deja:['이 장면을 전에도 본 것 같아 멈칫함']},
 dining:{
  anxious:['입맛이 없는 듯 음식을 깨작거림','먹으면서도 자꾸 시계를 봄'],irritated:['음식을 거칠게 베어 묾','말없이 빠르게 먹어 치움'],
  sad:['먹는 둥 마는 둥 수저를 내려놓음','입맛이 없는 듯 느리게 씹음'],lonely:['혼자 먹는 식사가 쓸쓸한 듯 둘러봄','맞은편 빈자리를 바라봄'],
  bored:['딱히 먹고 싶은 것이 없는 듯 뒤적거림','심드렁하게 씹고 있음'],tired:['씹는 것도 힘든 듯 느릿하게 먹음'],
  excited:['들뜬 기분에 맛을 음미하며 먹음'],happy:['맛있게 먹으며 기분이 좋아 보임'],
  mn1:['늘 먹던 것을 습관처럼 먹음','맛을 느끼지 못한 채 먹음'],mn2:['아무 맛도 안 나는 듯 기계적으로 먹음'],
  trap:['먹으면서도 출입구 쪽을 힐끗거림'],deja:['이 식사 장면을 전에도 본 것 같아 멈칫함']},
 prep:{
  anxious:['손이 급해져 물건을 자꾸 떨어뜨림','일을 하면서도 마음이 딴 데 가 있음'],irritated:['그릇 부딪히는 소리가 거칠어짐','한숨을 쉬며 투덜거림'],
  sad:['기운 없이 느릿느릿 움직임'],lonely:['혼자 준비하는 게 쓸쓸한 듯 주위를 둘러봄'],
  bored:['건성으로 손을 움직임','하품을 하며 억지로 해냄'],tired:['몸이 무거워 자꾸 손을 멈춤'],
  excited:['콧노래를 흥얼거리며 즐겁게 준비함'],happy:['기분 좋은 얼굴로 가볍게 움직임'],
  mn1:['매일 하는 일이라는 듯 기계적으로 손을 움직임'],mn2:['의욕 없이 시늉만 함'],
  trap:['일을 하면서도 자꾸 출입구 쪽을 힐끗거림'],deja:['이 장면을 전에도 본 것 같아 멈칫함']},
 sleep:{
  anxious:['자는 중에도 미간이 펴지지 않음','잠결에 몇 번이나 뒤척임'],irritated:['잠결에도 인상을 쓰고 있음','이불을 거칠게 끌어당기며 돌아누움'],
  sad:['잠든 얼굴에 그늘이 져 있음','자면서 가끔 숨이 불규칙해짐'],lonely:['빈자리 쪽으로 손을 뻗은 채 잠들어 있음'],
  tired:['지쳐서 깊이 잠들어 미동도 없음'],happy:['입가에 미소를 머금은 채 잠들어 있음'],excited:['들뜬 기분 탓인지 잠이 얕아 보임'],
  mn1:['꿈도 없이 습관처럼 잠들어 있음'],mn2:['깨어나도 달라질 게 없다는 듯 이불 속에 파묻혀 있음'],trap:['잠결에도 출입구 쪽으로 몸을 돌리고 있음'],deja:['낯익은 꿈이라도 꾸는 듯 몸을 뒤척임']},
 drink:{
  anxious:['잔을 든 손이 가만히 있지 못함'],irritated:['잔을 내려놓는 소리가 거칠어짐'],sad:['한 모금 마시고 멍하니 잔을 바라봄'],
  lonely:['곁에 누가 있었으면 하는 듯 잔만 만지작거림'],bored:['딱히 마시고 싶지도 않은 듯 잔을 돌림'],tired:['따뜻한 김에 눈을 감고 숨을 돌림'],
  excited:['들뜬 기분에 건배라도 하고 싶은 얼굴'],happy:['한 모금 마시고 만족스러운 미소를 지음'],
  mn1:['늘 마시던 것을 습관처럼 마심'],mn2:['아무 맛도 안 나는 듯 멍하니 마심'],trap:['마시면서도 출입구 쪽을 힐끗거림']}};
const GROUP_SUB=(v)=>{const g=v.g,id=v.id||'';
  if(/^(f_recipe|f_plantinfo|vase_smell|plant_smell|f_style|home_workout|f_stretch|f_likes|boiler|window_open)$/.test(id))return null;   // 장면과 맞지 않는 문구가 붙을 수 있는 행동은 붙이지 않음
  if(g==='eat'){if(/^(eat_table|snack|f_snack|toast|fridge)$/.test(id))return 'dining';if(/^(coffee|tea_kettle|water|drink_)/.test(id))return 'drink';return 'prep'}
  if(g==='hobby'){if(/^(piano|guitar|paint|craft|chair_hobby|sew|photo|f_doodle)$/.test(id))return 'hobby_make';if(/^(f_dance|f_sing|f_listen|music|f_hum|f_workout)$/.test(id))return 'hobby_music';return 'hobby_play'}
  if(g==='work'){return /^(job_break|job_daydream|job_game|job_procrast|f_plan)$/.test(id)?null:'work'}
  if(g==='read'){return /^(read_shelf|tidy_books)$/.test(id)?null:'read'}
  if(g==='wake'){return id==='toilet'?null:'wake'}
  return GT[g]?g:null};
const WL={
 anxious:['안절부절못하고 서성이는 중','불안한 듯 이리저리 오가는 중','괜히 출입구 쪽을 살피며 서성이는 중'],
 irritated:['짜증이 난 듯 거칠게 오가는 중','한숨을 쉬며 이리저리 걷는 중'],sad:['힘없이 천천히 걷는 중','목적 없이 발길 닿는 대로 걷는 중'],
 lonely:['말 걸 사람을 찾는 듯 서성이는 중','빈 자리를 둘러보며 걷는 중'],bored:['할 일을 찾아 어슬렁거리는 중','이것저것 건드려 보며 돌아다니는 중'],
 tired:['느릿느릿 발을 끌며 걷는 중'],excited:['들뜬 걸음으로 돌아다니는 중'],happy:['가벼운 걸음으로 거니는 중'],
 mn1:['늘 같은 길을 맴도는 중','같은 자리를 되풀이해 오가는 중'],mn2:['아무 의욕 없이 같은 자리를 맴도는 중'],
 trap:['막힌 길 앞을 서성이며 답답해하는 중','나갈 길을 찾는 듯 이리저리 오가는 중','닿을 수 없는 곳을 바라보며 서성이는 중'],
 busy:['방금 뭘 하려 했는지 헷갈려 서성이는 중'],rep:['같은 일만 되풀이하는 것 같다며 고개를 갸웃하는 중'],
 deja:['이 장면을 전에도 본 것 같아 멈칫하는 중'],unease:['어딘가 어색한 공기에 주위를 살피는 중']};

/* ---------- v34 관계·의도·소식이 지문에 드러남(3단계 내용 연결): 지금의 의도(다가가기·피하기·혼자 있기·망설임), 갈등, 이별 뒤의 마음, 짝사랑, 질투·서운함·경계, 전해 들은 소식에 대한 걱정
   - 전부 그 캐릭터 자신이 아는 것에서만 나온다(자기 갈등·자기 이별·자기 의도·전해 들은 소식). 문구에 상대 이름이 들어간다. ---------- */
const REL={
 torn:['{o:with} 마주쳐도 먼저 다가가지 못할 것 같아 마음이 복잡해 보임','{o:obj} 떠올리다 입을 떼려다 마는 얼굴'],
 avoid:['{o:obj} 마주칠까 봐 인기척에 신경을 곤두세움','{o:obj} 피하려는 듯 소리가 나는 쪽을 살핌'],
 ap_reconcile:['{o:with} 화해할 방법을 곰곰이 생각함','{o:obj} 만나면 뭐라고 말할지 속으로 되뇜'],
 ap_care:['{o:obj} 걱정하는 듯 자꾸 그쪽을 신경 씀','{o:sub} 괜찮은지 마음이 쓰이는 얼굴'],
 ap_romance:['{o:obj} 떠올리며 슬며시 미소를 지음','{o:obj} 볼 생각에 마음이 들뜬 얼굴'],
 ap_affiliate:['누군가와 이야기하고 싶은 듯 주위를 둘러봄','말을 걸 만한 사람이 없나 인기척에 귀를 기울임','혼자 있는 시간이 길게 느껴지는 듯 손이 겉돎','누가 지나가면 먼저 말을 걸까 망설이는 얼굴'],ap_comfort:['{o:obj} 찾아가 위로받고 싶은 얼굴','{o:with} 이야기하면 마음이 풀릴까 생각하는 듯함'],
 solitude:['지금은 혼자 있고 싶은 듯 조용히 있음','방해받고 싶지 않다는 듯 문 쪽을 신경 씀','혼자만의 시간을 지키려는 듯 말수가 줄어듦','조용한 공기가 오히려 편안한 듯 숨을 고름'],
 conflict:['{o:with} 다툰 일이 자꾸 떠오르는 듯 표정이 굳음','{o:sub} 한 말이 머릿속에서 맴도는 듯함'],
 sep:['{o:with} 헤어진 일이 문득 떠오른 듯 멈칫함','{o:obj} 잊으려 애쓰는 듯 다른 데로 신경을 돌림'],
 crush:['{o:obj} 떠올리다 괜히 볼이 붉어짐','{o:sub} 생각나 혼자 슬며시 웃음'],
 jealous:['{o:sub} 다른 사람과 가까워 보인 일이 마음에 걸리는 듯함'],resent:['{o:obj} 향한 서운함이 가시지 않은 듯 입을 닫고 있음'],wary:['{o:obj} 경계하는 듯 인기척에 신경이 곤두섬'],
 worry:['{o:sub} 힘들어한다는 소식이 자꾸 마음에 걸리는 듯함','{o:obj} 찾아가 볼까 망설이는 듯함'],
 /* v37 곁의 기분이 옮음(감정 전염) */
 cg_sad:['{o:sub} 가라앉아 있는 걸 보다 덩달아 기운이 빠지는 듯함','{o:sub} 풀 죽은 기색이 옮은 듯 말수가 줄어듦'],
 cg_anxious:['{o:sub} 불안해하는 기색에 덩달아 마음이 술렁임','{o:sub} 초조해 보이자 이유 없이 자꾸 주위를 살핌'],
 cg_irritated:['{o:top} 날 선 분위기에 덩달아 신경이 곤두섬','{o:sub} 짜증내는 기운이 번진 듯 표정이 굳음'],
 cg_happy:['{o:top} 웃는 모습을 보다 덩달아 입꼬리가 올라감','{o:sub} 기분 좋아 보여 덩달아 마음이 가벼워짐'],
 cg_excited:['{o:top} 들뜬 기운이 옮은 듯 마음이 들썩임','{o:sub} 신나 하는 걸 보고 덩달아 설렘'],
 /* v37 전해 들은 소문 */
 rm_romantic:['{o:sub} 가까워졌다는 이야기가 자꾸 떠오르는 듯 슬쩍 웃음','{o:top} 정말 그런 사이인지 궁금해하는 얼굴'],
 rm_conflict:['{o:sub} 다퉜다는 소문이 마음에 걸리는 듯 조심스러운 기색','{o:top} 무슨 일이 있었는지 궁금해하는 얼굴'],
 rm_breakup:['{o:sub} 헤어졌다는 이야기가 머릿속을 맴도는 듯함','{o:top} 어쩌다 그렇게 됐는지 곰곰이 생각함'],
 rm_reunion:['{o:sub} 다시 만난다는 소식에 슬며시 웃음','{o:top} 잘 풀려 다행이라는 듯 표정이 풀림']};
const WREL={
 torn:['{o:with} 어떻게 풀지 망설이며 서성이는 중'],avoid:['{o:obj} 마주칠까 봐 눈치를 보며 서성이는 중'],ap_reconcile:['화해할 말을 고르며 서성이는 중'],
 ap_care:['{o:obj} 걱정하며 서성이는 중'],ap_romance:['설레는 얼굴로 {o:obj} 찾는 듯 서성이는 중'],ap_affiliate:['말 걸 사람을 찾는 듯 서성이는 중'],ap_comfort:['{o:obj} 찾아가고 싶은 듯 서성이는 중'],
 solitude:['조용한 곳을 찾아 서성이는 중'],conflict:['다툰 일을 곱씹으며 서성이는 중'],sep:['헤어진 일이 떠오른 듯 서성이는 중'],crush:['{o:obj} 떠올리며 들뜬 걸음으로 서성이는 중'],
 jealous:['마음이 편치 않은 듯 서성이는 중'],resent:['서운한 마음을 삭이려는 듯 서성이는 중'],wary:['{o:obj} 경계하며 서성이는 중'],worry:['{o:obj} 걱정하며 서성이는 중'],
 cg_sad:['{o:sub} 가라앉은 기운이 옮은 듯 힘없이 서성이는 중'],cg_anxious:['{o:sub} 불안해하는 기색에 덩달아 서성이는 중'],cg_irritated:['{o:top} 날 선 분위기에 덩달아 거칠게 오가는 중'],
 cg_happy:['{o:sub} 웃는 걸 보고 덩달아 가볍게 거니는 중'],cg_excited:['{o:top} 들뜬 기운에 덩달아 들뜬 걸음으로 돌아다니는 중'],
 rm_romantic:['{o:sub} 가까워졌다는 이야기를 곱씹으며 서성이는 중'],rm_conflict:['{o:sub} 다퉜다는 소문이 마음에 걸려 서성이는 중'],rm_breakup:['{o:sub} 헤어졌다는 이야기를 곱씹으며 서성이는 중'],rm_reunion:['{o:sub} 다시 만난다는 소식에 들뜬 걸음으로 서성이는 중']};
const josaFill=(t,name)=>t.replace(/\{o:(obj|sub|with|top)\}/g,(m,k)=>name+({obj:jong(name)?'을':'를',sub:jong(name)?'이':'가',with:jong(name)?'과':'와',top:jong(name)?'은':'는'})[k]);
function relStates(s,id,now){
  const S=SO.soc(s),o=[],D=M._dec&&M._dec.view?M._dec.view(s,id):null;
  if(D&&now<=D.until){
    if(D.torn&&D.k!=='approach')o.push(['torn',72,D.torn.to]);
    else if(D.k==='approach'&&D.to)o.push(['ap_'+(D.p||'affiliate'),58,D.to]);
    else if(D.k==='avoid'&&D.to)o.push(['avoid',70,D.to]);
    else if(D.k==='solitude')o.push(['solitude',55,null])}
  for(const key of Object.keys(S.conf||{})){const c=S.conf[key];if(!c||!c.open)continue;const [a,b]=key.split('|');if(a!==id&&b!==id)continue;o.push(['conflict',66,a===id?b:a])}
  for(const key of Object.keys(S.sep||{})){const sp=S.sep[key];if(!sp)continue;const [a,b]=key.split('|');if(a!==id&&b!==id)continue;const days=(now-sp.at)/(24*HOUR);if(days<30)o.push(['sep',Math.max(50,64-days),a===id?b:a])}
  for(const k of Object.keys(s.rel||{})){if(k.indexOf(id+'>')!==0)continue;const other=k.slice(id.length+1);
    try{const r=M.romState?M.romState(s,id,other):null;if(r&&(r.k==='crush'||r.k==='oneside'||r.k==='mutual')&&r.loves&&r.loves.includes(id)&&!r.half)o.push(['crush',52,other])}catch(e){}
    const f=SO.feelOf(s,id,other);if(f){if(f.jl>=45)o.push(['jealous',30+f.jl*.4,other]);if(f.rs>=50)o.push(['resent',34+f.rs*.35,other]);if(f.wr>=55)o.push(['wary',34+f.wr*.35,other])}}
  const t=(S.todo||[]).find(x=>x.w===id&&!x.done&&(x.k==='comfort'||x.k==='cheer')&&(!x.exp||x.exp>now));if(t&&t.to)o.push(['worry',66,t.to]);
  const cg=(S.lg2||{})[id+'c'];if(cg&&now-cg.at<60*MIN&&REL['cg_'+cg.k])o.push(['cg_'+cg.k,56,cg.from]);          // 곁의 기분이 옮음
  for(const it of (S.know&&S.know[id])||[]){if(it.src!=='heard'||now-it.at>8*HOUR||it.a===id||it.b===id||!REL['rm_'+it.k])continue;o.push(['rm_'+it.k,50+(it.conf||0)*8,it.a+'&'+it.b]);break}   // 전해 들은 소문
  return o}

/* ---------- v35 캐릭터 고유의 결: 성격 버릇 + 자기 기록에서 나온 성찰 ----------
   - 감정·관계 같은 두드러진 상태가 없을 때(평온할 때)도 지문이 달라지게 한다: 그 캐릭터의 성격에서 나온 버릇, 그리고 최근 며칠 자기 생활을 규칙으로 요약한 성찰("요즘 취미에 시간을 많이 쓴다")이 가끔 붙는다.
   - 성찰은 최근 며칠의 활동 비율·외출 비율·가장 자주 어울린 상대에서 만들고(6시간에 한 번 점검), 기록(reflect)으로도 남는다. 문장은 템플릿이며 외부 AI 호출은 없다. */
const QK={social:['누가 말을 걸어 주길 기다리는 듯한 기색','혼자 있어도 은근히 인기척을 신경 씀'],solitary:['혼자만의 시간이 편한 듯 느긋함','조용한 게 좋다는 듯 숨을 고름'],worker:['쉬면서도 할 일을 머릿속으로 정리함','손이 쉬는 게 어색한 듯 괜히 뭔가를 확인함'],foodie:['문득 다음 끼니를 생각하는 듯 입맛을 다심'],tidy:['눈에 띈 흐트러진 물건을 슬쩍 바로잡음','주변이 정돈돼야 마음이 놓이는 듯함'],lazy:['틈만 나면 몸을 늘어뜨리려 함','서두를 이유가 없다는 듯 느긋함'],curious:['문득 눈에 띈 것에 시선을 빼앗김','궁금한 게 생기면 바로 들여다봄'],shy:['누가 볼까 신경 쓰는 듯 조심스럽게 움직임'],bold:['망설임 없이 거침없이 움직임'],caring:['집 안의 다른 사람들을 은근히 신경 씀','필요한 게 없을까 슬쩍 둘러봄'],playful:['혼자서도 장난기 어린 표정이 스침','괜히 콧노래를 흥얼거림'],harsh:['사소한 것에 혀를 차려다 참는 듯함'],negative:['안 좋은 쪽으로 먼저 생각하는 듯 미간이 좁아짐'],aloof:['주변에 별 관심 없다는 듯 무덤덤함'],inexpr:['속마음을 드러내지 않으려는 듯 표정이 없음'],sleepy:['틈만 나면 하품이 나옴'],jealous:['남의 일이 괜히 신경 쓰이는 듯함'],creative:['문득 떠오른 생각을 머릿속에서 굴리는 듯함'],homebody:['집이 가장 편하다는 듯 느긋함'],outgoing:['바깥 날씨가 괜히 신경 쓰이는 듯 창 쪽을 봄']};
const GN={hobby:'취미',work:'일',read:'독서',study:'공부',tv:'TV 보는 시간',eat:'먹는 일',chore:'집안일',rest:'쉬는 시간',chat:'이야기 나누는 시간'};
const RF={dom:['요즘 {G}에 시간을 많이 쓴다는 생각이 스치는 듯함','{G}만 하고 있다는 걸 문득 깨달은 듯함'],home:['며칠째 집 안에서만 지낸다는 생각에 잠김','바깥 공기를 못 쐰 지 오래됐다는 듯 창 쪽을 봄'],out:['요즘 밖에 나가는 일이 잦다는 걸 느끼는 듯함'],with:['요즘 {o:with} 자주 어울린다는 생각이 스침']};
const PAIR_T=new Set(['talk','cozy','meal','play','affection','date','chat','help']);
function history(s,inp,env){
  const S=SO.soc(s),now=env.now,H=S.hist||(S.hist={}),RFL=S.refl||(S.refl={});
  for(const c of inp.chars){const id=c.id,cu=inp.cur[id];if(!cu)continue;const z=H[id]||(H[id]={t:now,lw:{},chk:now});
    const dt=Math.min(30,Math.max(0,(now-z.t)/MIN));z.t=now;if(dt<=0)continue;
    const dec=Math.pow(.5,dt/4320);for(const k in z.lw){z.lw[k]*=dec;if(z.lw[k]<.5)delete z.lw[k]}
    if(cu.action!=='sleep')z.lw[cu.mode==='home'?(cu.action||'idle'):'out']=(z.lw[cu.mode==='home'?(cu.action||'idle'):'out']||0)+dt;
    if(now-z.chk<6*HOUR)continue;z.chk=now;
    const tot=Object.values(z.lw).reduce((a,b)=>a+b,0);if(tot<720)continue;
    let r=null;const nm=env.name(id);
    const cnt={};for(const e of S.log||[]){if(now-e.t>72*HOUR||!PAIR_T.has(e.type)||e.a==null||e.b==null)continue;const o=e.a===id?e.b:e.b===id?e.a:null;if(o)cnt[o]=(cnt[o]||0)+1}
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
    const dom=Object.entries(z.lw).filter(([k])=>GN[k]).sort((a,b)=>b[1]-a[1])[0];
    if(top&&top[1]>=4)r={k:'with',o:top[0],txt:`${nm}: 요즘 ${env.name(top[0])}와(과) 자주 어울렸다고 돌아봄`};
    else if(dom&&dom[1]/tot>=.4)r={k:'dom',g:dom[0],txt:`${nm}: 요즘 ${GN[dom[0]]}에 시간을 많이 썼다고 돌아봄`};
    else if(tot>=1440&&!(z.lw.out>tot*.03))r={k:'home',txt:`${nm}: 며칠째 집 안에서만 지냈다고 돌아봄`};
    else if(z.lw.out>tot*.25)r={k:'out',txt:`${nm}: 요즘 밖에 나가는 일이 잦았다고 돌아봄`};
    const prev=RFL[id];if(r&&(!prev||prev.k!==r.k||prev.g!==r.g||prev.o!==r.o||now-prev.at>24*HOUR)){r.at=now;RFL[id]=r;SO.jr(s,'reflect',id,r.o||null,r.txt,now,{k:r.k})}}}

/* ---------- v36 프로필·기억에서 나온 지문: 좋아하는 것·싫어하는 것·버릇·기억·하는 일 + 쌓인 관계 기억 ----------
   - 프로필에 적힌 말을 그대로 구절로 써서 문장을 짓는다(분석: sim.js 의 bits). 적혀 있지 않은 것은 만들어 내지 않는다.
   - 버릇은 마음이 조급할 때(불안·짜증·지루함·외로움) 특히 자주 나온다. */
const obj=n=>n+(jong(n)?'을':'를'),fixJosa=t=>t.replace(/([가-힣]+)와\(과\)/g,(m,n)=>n+(jong(n)?'과':'와'));
const hourOf=now=>(Math.floor(now/HOUR)+9)%24;
const whenOK=(w,now)=>{const h=hourOf(now);if(/자기 전|잠자리|잠들기|취침|밤/.test(w))return h>=21||h<2;if(/아침|기상|일어나/.test(w))return h>=6&&h<10;if(/저녁/.test(w))return h>=17&&h<22;return true};   // 시간대가 적힌 버릇은 그 시간대에만
function profileLines(s,c,A,nm,now,grp){
  const b=(A&&A.bits)||{},o=[];
  for(const w of (b.likes||[]).slice(0,4)){o.push([.9,`${obj(w)} 떠올리며 슬며시 미소를 지음`]);o.push([.6,`${w} 생각이 문득 스치는 듯함`]);o.push([.5,`${w} 이야기가 나오면 눈이 반짝일 것 같은 얼굴`]);o.push([.5,`다음에는 ${w}에 시간을 내야겠다고 마음먹는 듯함`])}
  for(const w of b.dislikes||[])o.push([.5,`${ga(w)} 문득 떠올랐는지 인상을 살짝 찌푸림`]);
  for(const h of (b.habits||[]).filter(h=>whenOK(h.w,now)))o.push([1,`${h.w} ${h.k}이 슬쩍 나옴`]);
  for(const w of b.memories||[])o.push([.8,`문득 ${w} 기억이 떠오른 듯 먼 곳을 봄`]);
  if(b.job)o.push(grp==='work'?[.9,`${b.job} 일이라 손이 익숙하게 움직임`]:[.7,`쉬는 중에도 ${b.job} 일이 머릿속을 맴도는 듯함`]);
  for(const x of episodes(s,c,nm,now))o.push(x);
  return o}
/* v37 개별 사건의 기억: 쌓인 기억(누가·무엇을·언제쯤) 중 힘이 센 몇 개가 시간 표현과 함께 번갈아 떠오르고, 갇혔던 일도 따로 떠오른다 */
const ago=(now,at)=>{const h=(now-at)/HOUR;return h<5?'조금 전':h<20?'오늘 일찍':h<44?'어제':h<96?'며칠 전':'지난번'};
const EPP=[(w,t)=>`${w} ${t}이 문득 떠오른 듯 표정이 풀림`,(w,t)=>`${w} ${t}을 떠올리고는 입가에 희미한 미소가 번짐`,(w,t)=>`${t}이 머릿속을 스치는지 잠시 멍해졌다가 웃음`];
const EPN=[(w,t)=>`${w} ${t}이 떠올라 표정이 굳음`,(w,t)=>`${w} ${t}을 곱씹는 듯 미간이 좁아짐`,(w,t)=>`${t}이 마음에 걸리는지 고개를 저어 생각을 털어 냄`];
function episodes(s,c,nm,now){
  const I=M._i,o=[];if(!nm)return o;
  const ms=((s.mem||{})[c]||[]).map(m=>({m,p:I.effPow(m,now)})).filter(x=>x.p>=10&&now-x.m.at<10*24*HOUR&&/기억$/.test(x.m.sum||'')&&nm(x.m.o)).sort((a,b)=>b.p-a.p).slice(0,3);
  const seen=new Set();ms.forEach((x,i)=>{const t=fixJosa(x.m.sum),F=(x.m.val<0?EPN:EPP)[hash(c+'|'+x.m.at)%3],ln=F(ago(now,x.m.at),t);if(seen.has(ln))return;seen.add(ln);o.push([1.2-.25*i,ln])});
  /* 정서 에너지(상호작용 의례 이론의 규칙화): 최근 이틀 사이 즐거운 어울림이 쌓였으면 기운이 오르고, 다툼·무시가 쌓였으면 사람 대하기가 버거워진다 */
  const POS={happy_time:1,chat_time:.6,cozy:.8,affection:1,helped:1,outing:1,apology:.8},NEG={quarrel:1,ignored:.8,love_no:1};
  const all=(s.mem||{})[c]||[];let ee=0;for(const m of all)if(now-m.at<48*HOUR)ee+=(POS[m.t]||0)*I.effPow(m,now)-(NEG[m.t]||0)*I.effPow(m,now);ee=clamp(ee/50,-1,1);
  if(ee>=.35)o.push([.9,'사람들과 어울린 여운이 남은 듯 표정이 환함'],[.7,'누구에게든 말을 걸 수 있을 것 같은 기운이 감돎']);
  else if(ee<=-.35)o.push([.9,'사람을 대하는 게 버거운 듯 기운이 없어 보임'],[.7,'누가 말을 걸면 한 발 물러설 것 같은 기색']);
  /* 의례: 같은 사람과 같은 종류의 시간을 닷새 안에 세 번 이상 보냈으면 일과처럼 자리 잡은 듯 느낀다 */
  const RT={happy_time:'즐거운 시간',chat_time:'대화 시간',cozy:'휴식 시간',affection:'다정한 시간',outing:'외출'},cnt={};
  for(const m of all)if(RT[m.t]&&m.o&&nm(m.o)&&now-m.at<120*HOUR){const k=m.o+'|'+m.t;cnt[k]=(cnt[k]||0)+1}
  for(const k of Object.keys(cnt))if(cnt[k]>=3){const [oo,tt]=k.split('|');o.push([.9,josaFill(`{o:with} 함께하는 ${RT[tt]}이 어느새 일과처럼 자리 잡은 듯함`,nm(oo))])}
  const tr=(SO.soc(s).log||[]).filter(e=>e.type==='trap'&&e.a===c&&now-e.t<72*HOUR).pop();
  if(tr)o.push([.8,`${ago(now,tr.t)} 갇혔던 일이 떠오른 듯 출입구 쪽을 힐끗 봄`]);
  return o}
/* v37 연인·부부의 평소 상태: 공식 연인·부부인 상대가 같은 방에 있는지·다른 방인지·외출 중인지·자는 중인지에 따라 평소 표정이 달라진다 */
const CP={lover:{
 with:['{o:sub} 곁에 있어서인지 표정이 한결 부드러움','{o:obj} 슬쩍 쳐다보고는 시선을 거두며 웃음','{o:with} 눈이 마주치면 쑥스럽게 웃을 것 같은 얼굴'],
 apart:['{o:obj} 생각하는 듯 다른 방 쪽을 한 번 바라봄','{o:sub} 뭘 하고 있을지 궁금한 얼굴'],
 out:['{o:sub} 돌아올 시간을 헤아려 보는 듯 문 쪽을 봄','{o:sub} 없는 집이 조금 허전한 듯함'],
 sl:['{o:sub} 자고 있는 쪽을 한 번 바라보고 미소 지음','{o:sub} 깰까 봐 조심스럽게 움직임']},
 spouse:{
 with:['{o:with} 말없이 같은 공간에 있는 것만으로 편안해 보임','굳이 말하지 않아도 되는 사이라는 듯 느긋함','{o:sub} 하는 일을 곁눈질로 확인하고 안심한 듯함'],
 apart:['{o:obj} 찾는 듯 집 안을 한 번 둘러봄','{o:sub} 끼니는 챙겼는지 마음이 쓰이는 듯함'],
 out:['{o:sub} 늦지 않을까 시계를 한 번 봄','{o:sub} 없는 집이 조용하게 느껴지는 듯함'],
 sl:['{o:sub} 깨지 않게 소리를 죽여 움직임','{o:sub} 자는 모습을 보고 이불을 여며 줄까 망설임']}};
function coupleLines(s,id,nm,now){
  const pos=chn(s).pos||{},me=pos[id],o=[];if(!me||!nm)return o;
  for(const k of Object.keys(s.rel||{})){if(k.indexOf(id+'>')!==0)continue;const p=k.slice(id.length+1),n=nm(p);if(!n)continue;
    let st;try{st=M.romState(s,id,p)}catch(e){continue}if(st.k!=='lover'&&st.k!=='spouse')continue;
    const q=pos[p],w=!q?'apart':q.sl?'sl':q.m!=='home'?'out':(q.seg!=null&&q.seg===me.seg)?'with':'apart',L=CP[st.k][w];
    for(const t of L)o.push([1.2/L.length*2,josaFill(t,n)])}
  return o}

/* v37 싫어하는 것 마주침: 프로필의 '싫어하는 것' 말이 지금 하는 행동·장소·곁의 사람 이름에 들어 있으면 짜증이 조금 오르고, 한동안 그 반응이 지문에 드러난다 */
const GEN=/^(음식|곳|것|거|사람|소리|일|장소|상황|때|날씨|냄새)$/;
const wg=w=>w+(jong(w)?'과':'와');
function observe(s,inp,env){
  const S=SO.soc(s),now=env.now,ch=chn(s),pos=ch.pos||(ch.pos={}),L2=S.lg2||(S.lg2={});
  for(const c of inp.chars){const cu=inp.cur[c.id];if(cu)pos[c.id]={seg:cu.mode==='home'?cu.seg:null,m:cu.mode,sl:cu.action==='sleep'?1:0}}
  for(const c of inp.chars){const id=c.id,cu=inp.cur[id];if(!cu||cu.mode!=='home'||cu.action==='sleep')continue;
    const A=env.A(id),dl=(A&&A.bits&&A.bits.dislikes)||[];if(!dl.length)continue;
    const near=inp.chars.filter(o=>o.id!==id&&inp.cur[o.id]&&inp.cur[o.id].mode==='home'&&inp.cur[o.id].seg===cu.seg).map(o=>env.name(o.id));
    const txt=[cu.verb,cu.say,cu.segName].concat(near).join(' ');
    for(const w of dl){const tk=w.split(/\s+/).filter(x=>x.length>=2&&!GEN.test(x));if(!tk.length||!tk.some(x=>txt.includes(x)))continue;
      const p=L2[id+'d'];if(p&&now-p.at<20*MIN)break;
      L2[id+'d']={at:now,w};
      emit(id,'irritated',3.5,`싫어하는 ${w}와 마주쳐서`,now,A);emit(id,'anxious',1.2,`싫어하는 ${w}와 마주쳐서`,now,A);
      if(!p||p.w!==w||now-p.at>3*HOUR)SO.jr(s,'dislike',id,null,`${env.name(id)}: 싫어하는 ${w}와 마주침`,now,{w});
      break}}}
const CT={anxious:['말하는 중에도 시선이 자꾸 흔들림','말끝이 조금 떨림'],irritated:['말투에 날이 서 있음','대꾸가 짧고 퉁명스러움'],sad:['목소리에 힘이 없음','웃어도 어딘가 쓸쓸해 보임'],lonely:['오랜만에 이야기하는 게 반가운 듯 말이 길어짐'],bored:['건성으로 맞장구를 침'],tired:['말하다 하품을 삼킴'],happy:['웃음이 자주 터짐','표정이 밝음'],excited:['말이 빨라지고 목소리가 높아짐'],mn1:['늘 하던 이야기를 되풀이하는 느낌'],mn2:['대화에 흥미가 없는 듯 대답만 함'],trap:['이야기하다 문득 출입구 쪽을 봄'],deja:['이 대화를 전에 나눈 것 같아 멈칫함']};
const TKR={conflict:['다툰 일이 마음에 걸려 말이 조심스러움'],sep:['헤어진 사이라 어색한 공기가 흐름','서로 눈을 오래 마주치지 못함'],crush:['말하는 동안 괜히 볼이 붉어짐','눈이 마주치면 시선을 피함'],jealous:['말하면서도 다른 사람 이야기에 신경이 쓰이는 듯함'],resent:['서운함을 삼키느라 말이 짧음'],wary:['경계를 풀지 않은 채 말을 고름'],lover:['서로를 바라보며 말투가 자꾸 부드러워짐'],spouse:['오래된 사이답게 편하게 말을 이어 감']};
const PTN={anxious:['{o:obj} 쓰다듬으며 마음을 가라앉히려 함'],irritated:['{o:obj} 대하자 표정이 조금 누그러짐'],sad:['{o:obj} 안고 한동안 놓아주지 않음','{o:obj} 바라보며 위로받는 듯함'],lonely:['{o:sub} 곁에 있어 허전함이 덜어지는 듯함'],bored:['{o:obj} 괜히 불러 말을 걸어 봄'],tired:['{o:obj} 돌보면서도 느릿느릿 움직임'],happy:['{o:with} 함께라 웃음이 잦음'],excited:['{o:obj} 보며 들뜬 목소리로 말을 건넴'],mn1:['늘 하던 대로 {o:obj} 챙김'],mn2:['{o:obj} 돌보는 것만은 놓지 않고 이어 감']};
const OT={anxious:['표정에 불안이 비침'],irritated:['걸음이 평소보다 빠름'],sad:['어깨가 처진 채 길을 나섬'],lonely:['혼자 나서는 길이 쓸쓸해 보임'],bored:['집을 벗어나는 게 반가운 듯 걸음이 가벼움'],tired:['피곤한 얼굴로 길을 나섬'],happy:['가벼운 걸음으로 나섬'],excited:['들뜬 걸음으로 나섬'],mn1:['오랜만에 바깥 공기를 쐬어 숨통이 트이는 듯함'],mn2:['집을 벗어나자 한결 표정이 풀림']};
const TONE_NO=new Set(['wander','wake','out','p_sleep','p_rest','p_play','p_roam','p_wait','p_eat','pet','care','unc','chat']);
function stateOf(s,id,now){
  const S=SO.soc(s),z=(S.apr||{})[id],t=(S.trapst||{})[id],lg=S.lg2||{},o=[];
  const L=k=>lv(s,id,k);
  if(t)o.push(['trap',70+Math.min(20,(now-t.since)/HOUR*3)]);
  if(z&&z.mn>=60)o.push(['mn2',z.mn+10]);else if(z&&z.mn>=30)o.push(['mn1',z.mn+10]);
  const dj=(S.dj||{})[id];if(dj&&dj.at&&now-dj.at<40*MIN)o.push(['deja',66]);
  const ax=(S.axes||{})[id];if(ax&&ax.unease>=.3)o.push(['unease',35+ax.unease*45]);
  if(lg[id+'b']&&now-lg[id+'b']<90*MIN)o.push(['busy',62]);
  if(lg[id+'r']&&now-lg[id+'r']<90*MIN)o.push(['rep',62]);
  for(const k of ['anxious','irritated','sad','lonely','bored','tired'])o.push([k,L(k)]);
  const hp=L('happy'),ex=L('excited');if(hp>=60)o.push(['happy',hp]);if(ex>=60)o.push(['excited',ex]);if(L('curious')>=65)o.push(['curious',L('curious')]);
  for(const r of relStates(s,id,now))o.push(r);
  return o.sort((a,b)=>b[1]-a[1])}
function extend(H,s,now){
  const baseGM=H.groupMul,S=SO.soc(s);
  H.groupMul=(c,g)=>{let m=baseGM(c,g);
    const L=k=>lv(s,c,k),an=L('anxious'),ir=L('irritated'),sa=L('sad'),bo=L('bored'),ti=L('tired'),ha=L('happy'),z=(S.apr||{})[c],mn=z?z.mn:0,tr=(S.trapst||{})[c]?1:0;
    if(g==='wander')m*=(1+an/90)*(1+ir/140)*(1+bo/160)*(1+tr*1.2);
    else if(g==='eat')m*=(1-.3*an/100)*(1-.25*sa/100)*(1+.15*bo/100)*(1+.2*ha/100);
    else if(g==='chore')m*=(1+ir/180)*(1-ti/150)*(1-mn/200);
    else if(g==='rest')m*=(1+mn/120)*(1-an/250);
    else if(g==='tv')m*=1+mn/150;
    else if(g==='work'||g==='hobby'||g==='study'||g==='read')m*=1-mn/160;
    else if(g==='wake')m*=1-mn/250;
    else if(g==='out'&&mn>=30)m*=1+mn/200;
    else if(g==='chat')m*=1-mn/300;
    return clamp(m,.4,2.6)};
  let lastK='',hab=false;
  const dn=(o,nm)=>{if(!o||!nm)return '';const n=String(o).split('&').map(nm);if(n.some(x=>!x))return '';return n.length>1?n[0]+(jong(n[0])?'과 ':'와 ')+n[1]:n[0]};
  const pickState=(c,v,A,pool,relPool,nm)=>{
    const st=stateOf(s,c,now);if(!st.length)return null;
    const rng=mulberry(hash('tn|'+c+'|'+Math.floor(now/(15*MIN))));
    for(const [k,str,o] of st){const isRel=!!REL[k]||k.indexOf('ap_')===0;const th=isRel?50:(k==='trap'||k==='busy'||k==='rep'||k==='deja')?60:(k==='mn1'||k==='mn2')?40:45;if(str<th)continue;
      const arr=isRel?relPool(k):pool(k);if(!arr||!arr.length)continue;
      const nmo=isRel&&o?dn(o,nm):'';
      if(isRel&&(!o&&k!=='solitude'||(o&&!nmo)))continue;
      const hb=(chn(s).hab||(chn(s).hab={}))[c]||((chn(s).hab[c])={k:'',n:0,at:0});
      if(hb.k===k&&now-hb.at<3*HOUR)hb.n++;else{hb.k=k;hb.n=1}hb.at=now;
      if(hb.n>3&&rng()<.7){hab=true;return null}                  // 같은 상태가 계속 이어져도 똑같은 표정만 반복되지 않게(익숙해짐)
      if(rng()>clamp((str-30)/60,.15,.85))return null;     // 이 걸음에는 드러나지 않음(가장 두드러진 상태 기준)
      const sh=P0(tvOf(A,'shy'))>.3,bd=P0(tvOf(A,'bold'))>.3;
      let a=arr.filter(x=>typeof x==='string'||!x[1]||(x[1]==='shy'&&sh)||(x[1]==='bold'&&bd)).map(x=>typeof x==='string'?x:x[0]);
      const ch=chn(s),last=(ch.tn||(ch.tn={}))[c];if(a.length>1)a=a.filter(x=>x!==last);
      const t=a[Math.floor(rng()*a.length)];ch.tn[c]=t;lastK=k;return isRel&&o?josaFill(t,nmo):t}
    return null};
  const flavor=(c,A,nm,grp)=>{                                 // 두드러진 상태가 없을 때: 자기 기록 성찰·프로필·쌓인 기억·성격 버릇 중 하나
    const rng=mulberry(hash('fl|'+c+'|'+Math.floor(now/(15*MIN))));if(rng()>.35)return '';
    const ch=chn(s),fl=ch.fl||(ch.fl={}),r=(S.refl||{})[c],pool=[];
    if(r&&now-r.at<36*HOUR&&RF[r.k]&&(r.k!=='with'||(nm&&nm(r.o))))for(const t of RF[r.k])pool.push([.7/RF[r.k].length*2,r.k==='with'?josaFill(t,nm(r.o)):t.replace('{G}',GN[r.g]||'')]);
    for(const x of profileLines(s,c,A,nm,now,grp))pool.push(x);
    for(const x of coupleLines(s,c,nm,now))pool.push(x);
    const tr=Object.keys(QK).filter(k=>tvOf(A,k)>=.3).sort((a,b)=>tvOf(A,b)-tvOf(A,a)).slice(0,4);for(const k of tr)for(const t of QK[k])pool.push([.5,t]);
    const ok=pool.filter(x=>x[1]!==fl[c]);if(!ok.length)return '';
    let w=rng()*ok.reduce((a,x)=>a+x[0],0),t=ok[0][1];for(const x of ok){w-=x[0];if(w<=0){t=x[1];break}}
    fl[c]=t;return t};
  const disLine=(c,wd)=>{const p=(S.lg2||{})[c+'d'];if(!p||now-p.at>30*MIN)return '';
    const rng=mulberry(hash('ds|'+c+'|'+Math.floor(now/(15*MIN))));if(rng()>.6)return '';const w=p.w,j=jong(w);
    const T=wd?[`싫어하는 ${w}를 피해 서성이는 중`,`${w} 쪽을 외면하며 서성이는 중`]:[`${w}${j?'이':'가'} 마음에 들지 않는 듯 입술을 꾹 다묾`,`${w}에서 슬쩍 시선을 돌리며 한숨을 쉼`,`${w}에 얽히고 싶지 않다는 듯 인상을 찌푸림`];
    return T[Math.floor(rng()*T.length)]};
  H.tone=(c,v,A,nm)=>{
    if(!v||TONE_NO.has(v.g)||v.pair||v.unc)return '';
    const sub=GROUP_SUB(v);
    if(!sub)return '';
    const dl=sub==='sleep'?'':disLine(c,0);if(dl)return dl;
    const t=pickState(c,v,A,k=>GT[sub][k],sub==='sleep'?(()=>null):(k=>REL[k]),nm),hb=((A&&A.bits&&A.bits.habits)||[]).filter(h=>whenOK(h.w,now));
    if(t){if(hb.length&&/(anxious|irritated|bored|lonely)/.test(lastK)&&mulberry(hash('hb|'+c+'|'+Math.floor(now/(15*MIN))))()<.3){const h=hb[Math.floor(now/(15*MIN))%hb.length];return `${h.w} ${h.k}이 슬쩍 나옴`}return t}
    if(sub==='sleep')return '';
    const st=stateOf(s,c,now);return st.length&&st[0][1]>=45&&!hab?'':flavor(c,A,nm,v.g)};   // 강한 상태가 있으면(이번 걸음에 드러나지 않았더라도) 평온한 버릇은 붙이지 않음
  /* v37 대화·반려동물 돌봄·외출·수면(위 GT.sleep)에도 마음이 드러남 */
  const topEmo=(c,tbl)=>{for(const [k,str] of stateOf(s,c,now)){if(str<45)break;if(tbl[k])return k}return null};
  const pickOf=(c,tag,arr)=>{const rng=mulberry(hash(tag+'|'+c+'|'+Math.floor(now/(15*MIN))));if(rng()>.55)return '';const ch=chn(s),l=ch.tn||(ch.tn={}),a=arr.filter(x=>x!==l[c+tag]);const t=(a.length?a:arr)[Math.floor(rng()*(a.length||arr.length))];l[c+tag]=t;return t};
  H.talk=(c,pid,A,nm)=>{const st=stateOf(s,c,now),rl=st.find(x=>x[2]===pid&&TKR[x[0]]&&x[1]>=50),e=topEmo(c,CT),pool=[];
    if(rl)for(const x of TKR[rl[0]])pool.push(x);if(e)for(const x of CT[e])pool.push(x);
    try{const r=M.romState(s,c,pid);if(r.k==='lover'||r.k==='spouse')for(const x of TKR[r.k])pool.push(x)}catch(e2){}
    return pool.length?pickOf(c,'tk'+pid,pool):''};
  H.petTone=(c,pname,A,nm)=>{const e=topEmo(c,PTN);return e?josaFill(pickOf(c,'pt',PTN[e]),pname):''};
  H.out=(c,A,nm)=>{const e=topEmo(c,OT),pool=e?[...OT[e]]:[],h=(S.refl||{})[c];
    if(h&&h.k==='home'&&now-h.at<36*HOUR)pool.push('며칠 만의 외출이라 바깥 공기가 반가운 듯함');
    const pos=chn(s).pos||{};for(const k of Object.keys(s.rel||{})){if(k.indexOf(c+'>')!==0)continue;const p=k.slice(c.length+1),n=nm(p);if(!n||!pos[p]||pos[p].m!=='home')continue;
      try{const r=M.romState(s,c,p);if(r.k==='lover'||r.k==='spouse')pool.push(josaFill('{o:obj} 두고 나서는 게 아쉬운 듯 한 번 뒤돌아봄',n))}catch(e2){}}
    return pool.length?pickOf(c,'ot',pool):''};
  H.alt=(c,v,A,room,nm)=>{                                      // 서성임: 상태에 맞는 문장으로 통째로 바꿈
    if(!v||v.g!=='wander'||v.petsay)return '';const dl=disLine(c,1);if(dl)return `${room}에서 ${dl}`;const t=pickState(c,v,A,k=>WL[k],k=>WREL[k],nm);return t?`${room}에서 ${t}`:''};
  return H}

function step(s,inp,env,log){contagion(s,env,inp);ripple(s,env,inp);care(s,env,inp,log);BUF=[];trap(s,inp,env,log);strain(s,inp,env);appraise(s,inp,env);deja(s,inp,env);history(s,inp,env);observe(s,inp,env);settle(s,env)}

/* 원인 사슬: 기록 id 에서 원인을 거슬러 올라가며(위쪽이 먼저) 돌려준다 */
function trace(s,id){const S=SO.soc(s),by=new Map(S.log.map(e=>[e.id,e])),out=[];let e=by.get(id),n=0;
  while(e&&n++<20){out.unshift(e);e=e.cause?by.get(e.cause):null}return out}
/* 이 기록에서 이어진 결과들(아래로) */
function effects(s,id){const S=SO.soc(s),out=[],q=[id];let n=0;
  while(q.length&&n++<200){const cur=q.shift();for(const e of S.log)if(e.cause===cur){out.push(e);q.push(e.id)}}return out}
M._chn={observe,coupleLines,episodes,step,trace,effects,ripple,contagion,trap,strain,trapOf,felt,appraise,apprOf,extend,stateOf};
})(typeof window!=='undefined'?window:globalThis);
