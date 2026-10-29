/* 비바리움 관찰 v24 — 관계의 한살이 · 갈등의 갈래 · 정보 비대칭(목격·소문) · 사건 기록(관찰 일지용)
   - viv-mind.js 위에 얹는 규칙 기반 모듈(AI 아님). 논문(LASSI·VAD·믿음 수정·사회 규칙)에서 영감을 받은 규칙이며 논문 결과의 재현이 아니다.
   - 상태는 mind 저장소 s.soc 안에 함께 저장된다(서버 동기화 대상). 기존 필드는 건드리지 않는다.
   - 공식 관계(연인/부부 표시)는 바꾸지 않는다. 이별·이혼·재회는 캐릭터 행동·감정·기억으로 즉시 반영하고, 공식 표시는 rev.sug 제안으로만 남긴다.
   - 행동은 아는 정보에서만 나온다: 목격한 것(seen)·전해 들은 것(heard)만 반응의 근거가 되고, 아무것도 알려 주지 않는다. */
(function(root){
'use strict';
const MIN=60000,HOUR=3600000,DAY=86400000;
const M=root.Mind;if(!M)return;
const I=M._i,{pk,pairKey,clamp,hash,mulberry,tvOf,agg,addEmo,applyEvent,romState,romBits,romRev,mems,rel,ensureEmo,effPow}=I;
const ga=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?`${n}이`:`${n}가`};
const eun=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?`${n}은`:`${n}는`};
const wa=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?`${n}과`:`${n}와`};

/* ---------- 새 기억·사건 종류(기존 목록에 추가) ---------- */
Object.assign(M.MEM_TYPES,{
  resolved:{n:'갈등을 대화로 풀어낸 기억',val:1,half:480,win:12},
  breakup:{n:'헤어져서 마음이 아팠던 기억',val:-1,half:720,win:48},
  reunion:{n:'다시 만나게 된 기억',val:1,half:720,win:48},
  witness:{n:'두 사람의 모습을 지켜본 기억',val:-1,half:48,win:6}});
Object.assign(M.EVENTS,{
  bicker_end:{label:'말다툼 끝',A:{aff:.8,emo:{calm:6,irritated:-12},why:'{o}와(과)의 말다툼이 금방 풀려서'}},
  talk_out:{label:'대화로 갈등을 풂',A:{aff:3.5,emo:{irritated:-30,sad:-15,calm:10,happy:4},why:'{o}와(과) 차분히 이야기해 갈등을 풀어서',mem:{t:'resolved',p:48,sum:'{o}와(과) 갈등을 대화로 풀어낸 기억'}}},
  breakup:{label:'이별',A:{aff:-8,emo:{sad:40,anxious:12,lonely:10},why:'{o}와(과) 헤어져서',mem:{t:'breakup',p:80,sum:'{o}와(과) 헤어진 기억'}}},
  divorce:{label:'이혼',A:{aff:-8,emo:{sad:45,anxious:14,lonely:14},why:'{o}와(과) 갈라서서',mem:{t:'breakup',p:90,sum:'{o}와(과) 갈라선 기억'}}},
  reunion:{label:'재회',A:{aff:8,emo:{happy:30,excited:24},why:'{o}와(과) 다시 마음을 이어서',mem:{t:'reunion',p:70,sum:'{o}와(과) 다시 만나게 된 기억'}}}});

/* ---------- 상태 ---------- */
const soc=s=>{let S=s.soc;if(!S||typeof S!=='object')S=s.soc={};
  S.feel=S.feel||{};S.know=S.know||{};S.expect=S.expect||{};S.conf=S.conf||{};S.sep=S.sep||{};S.todo=S.todo||[];S.log=S.log||[];S.estr=S.estr||{};S.res=S.res||{};return S};
/* 방향별 다차원 감정(0~100): tr 신뢰, att 애착, rs 원망, jl 질투, wr 경계. 처음 만날 때는 친밀도에서 읽어 시작 */
const feelOf=(s,a,b)=>{const S=soc(s),k=pk(a,b);if(S.feel[k])return S.feel[k];const R=s.rel[k];const aff=R?R.aff:0;
  return S.feel[k]={tr:clamp(25+aff*.55,0,100),att:clamp(10+aff*.5,0,100),rs:0,jl:0,wr:clamp(-aff*.5,0,100),at:0}};
const bump=(s,a,b,k,d)=>{const f=feelOf(s,a,b);   // 이미 높을수록 더 오르기 어렵고(포화 방지), 높을수록 내려갈 때 충격이 큼
  const hi=(k==='tr'||k==='att');const v=f[k]/100;const m=d>0?(hi?(1-v)*.7+.05:(1-v)*.8+.1):(hi?.4+.6*v:.5+.5*(1-v));f[k]=clamp(f[k]+d*m,0,100)};
const FEEL_BY={talk:{att:.6,tr:.4},play:{att:1.2,tr:.6},meal:{att:.8,tr:.4},cozy:{att:.8,tr:.5},affection:{att:2.5,tr:1},date:{att:2.8,tr:1},comfort:{tr:3.5,att:1.5},apology:{tr:2.5,rs:-12},
  conflict:{tr:-3,rs:6,wr:3},ignore:{rs:3,tr:-1.5},talk_out:{tr:6,att:3,rs:-20,wr:-6},bicker_end:{rs:-8},confess_ok:{att:6,tr:3},confess_no:{rs:1},propose_ok:{att:6,tr:4},breakup:{rs:8,att:-6,tr:-5},divorce:{rs:10,att:-8,tr:-6},reunion:{tr:6,att:8,rs:-25,wr:-10}};
const nm=(env,id)=>env.name(id);
/* 사건 기록(관찰 일지용). 원인·결과가 남는 최소 정보만 */
const LOG_MAX=600,KEEP=new Set(['breakup','divorce','reunion','confess_ok','confess_no','propose_ok','propose_no','talk_out','conflict','witness','gossip','sep','conf_branch','check']);
let OFF=false;
/* 사건 연쇄(원인 추적): 모든 기록에 id 를 주고, 원인이 된 앞선 사건이 있으면 cause 로 잇는다. 시각·장소·참여자·원인·결과가 함께 남음(관찰 일지가 읽음) */
KEEP.add('care');KEEP.add('contagion_big');KEEP.add('trap');KEEP.add('mannerism');KEEP.add('deja');KEEP.add('reflect');KEEP.add('dislike');
const PARENT={witness:['conflict','affection','date','confess_ok','propose_ok','breakup','divorce','reunion'],gossip:['conflict','affection','date','confess_ok','propose_ok','breakup','divorce','reunion','witness'],
  check:['witness','gossip'],conf_branch:['conflict'],apology:['conflict','conf_branch'],talk_out:['conflict','conf_branch'],bicker_end:['conflict'],breakup:['conf_branch','conflict'],divorce:['conf_branch','conflict'],
  sep:['breakup','divorce'],reunion:['breakup','divorce','sep'],care:['witness','gossip','breakup','divorce','reunion','trap'],intent:['conflict','breakup','divorce','witness','conf_branch','gossip'],contagion:['conflict','breakup','divorce','witness']};
let SEQ=0,PLACE={};
const idsOf=e=>new Set([e.a,e.b,...(e.about||[]),...(e.pair||[])].filter(Boolean));
function jr(s,type,a,b,why,now,extra){const S=soc(s);const e={id:'e'+now.toString(36)+'.'+(SEQ++).toString(36),t:now,type,a,b,why,...(OFF?{off:1}:{}),...(extra||{})};
  if(PLACE[a]&&(b==null||PLACE[a]===PLACE[b]))e.place=PLACE[a];
  if(!e.cause&&PARENT[type]){const want=(e.about||[a,b]).filter(Boolean),pt=PARENT[type],person=type==='care'||type==='check'||type==='witness'||type==='gossip'&&false;
    for(let i=S.log.length-1,k=0;i>=0&&k<120;i--,k++){const P=S.log[i];if(now-P.t>72*HOUR)break;if(!pt.includes(P.type)||!P.id)continue;
      const pi=idsOf(P);if(!want.every(x=>pi.has(x)))continue;
      if((type==='care'||type==='check')&&(P.type==='witness'||P.type==='gossip')&&P.a!==a&&P.b!==a)continue;
      e.cause=P.id;break}}
  S.log.push(e);
  if(S.log.length>LOG_MAX){const i=S.log.findIndex(x=>!KEEP.has(x.type));S.log.splice(i>=0?i:0,1)}return e}
const pairOf=(a,b)=>pairKey(a,b);

/* ---------- 사건이 적용될 때(applyEvent 끝) ---------- */
function onEvent(s,ev,env){
  const S=soc(s),now=ev.at,E=FEEL_BY[ev.type];
  if(E)for(const [x,y] of [[ev.a,ev.b],[ev.b,ev.a]])for(const k in E)bump(s,x,y,k,E[k]);
  if(ev.type!=='ignore'||true)jr(s,ev.type,ev.a,ev.b,(M.EVENTS[ev.type]||{}).label||ev.type,now);
  if(ev.type==='conflict'){
    const key=pairOf(ev.a,ev.b),ea=ensureEmo(s,ev.a),eb=ensureEmo(s,ev.b);
    let c=S.conf[key];
    const irr=(ea.lv.irritated.v+eb.lv.irritated.v)/2;
    if(c&&c.open){c.n++;c.lvl=Math.min(100,Math.max(c.lvl,irr*.6)+10+(ev.bump||0));c.at=now;c.branch=null;c.due=0}
    else S.conf[key]=c={a:ev.a,b:ev.b,open:true,n:1,lvl:clamp(22+irr*.35+(ev.bump||0),0,100),at:now,start:now,branch:null,due:0,by:ev.a};
    if(ev.why)c.cause=ev.why}
  if(ev.type==='bicker_end'||ev.type==='talk_out'||ev.type==='apology'){const c=S.conf[pairOf(ev.a,ev.b)];
    /* 관계의 위기 중에는 일상 속 가벼운 사과(자동 사건) 하나로 갈등이 닫히지 않는다: 마음이 조금 누그러질 뿐, 결말은 위기의 갈래가 정한다 */
    if(c){if(ev.type==='apology'&&c.open&&c.branch==='crisis'&&!String(ev.id).startsWith('soc|'))c.lvl=Math.max(0,c.lvl-8);else c.open=false}}
}

/* ---------- 갈등의 갈래 ---------- */
const BRANCH_NAME={bicker:'말다툼으로 끝남',cooldown:'시간을 두고 화해',mature:'차분히 대화해 문제를 풂',mediate:'주변의 도움으로 화해',unresolved:'풀지 못한 채 남음',crisis:'관계의 위기'};
function third(s,env,a,b,ids){let best=null,bv=0;
  for(const m of ids){if(m===a||m===b)continue;const x=(s.rel[pk(m,a)]||{}).aff||0,y=(s.rel[pk(m,b)]||{}).aff||0;
    if(x>=15&&y>=15&&Math.min(x,y)>bv){bv=Math.min(x,y);best=m}}return best}
function will(s,env,a,b){const f=feelOf(s,a,b),R=s.rel[pk(a,b)]||{aff:0},g=agg(s,a,b,env.now),A=env.A(a);
  return clamp(.3+R.aff/150+f.att/400+Math.min(.25,g.posPow/400)+.25*tvOf(A,'caring')-.2*tvOf(A,'tsun')-.15*tvOf(A,'harsh')-f.rs/200-Math.min(.3,g.negPow/300)+(f.tr-50)/300,.05,1)}
function decide(s,env,c,ids,rng){
  const [a,b]=[c.a,c.b],A=env.A(a),B=env.A(b),fa=feelOf(s,a,b),fb=feelOf(s,b,a);
  const trust=(fa.tr+fb.tr)/2,w=(will(s,env,a,b)+will(s,env,b,a))/2;
  const temper=(tvOf(A,'angry')+tvOf(B,'angry')+tvOf(A,'harsh')+tvOf(B,'harsh')+.5*(tvOf(A,'tsun')+tvOf(B,'tsun')))/2;
  const mature=(tvOf(A,'caring')+tvOf(B,'caring'))/2-.4*temper;
  const cpl=['lover','spouse'].includes(romState(s,a,b).k);
  const th=third(s,env,a,b,ids);
  const W={bicker:c.lvl<38?3.2:(c.lvl<55?.6:0),
    cooldown:1.6+.8*Math.max(0,temper)+(c.lvl>=40?.5:0),
    mature:1.6*(trust/50)*Math.max(.2,.6+mature)*(c.lvl<78?1:.4)*(w>.35?1:.3),
    mediate:th?1.1:0,
    unresolved:.8+Math.max(0,temper)*.8+c.lvl/70,
    crisis:(c.lvl>=68&&(trust<38||w<.38))?(c.lvl-60)/18*(1-w)*(c.n>=2?1.4:.8):0};
  let tot=0;for(const k in W)tot+=W[k];let r=rng()*tot,pick='cooldown';for(const k in W){r-=W[k];if(r<=0){pick=k;break}}
  return {pick,th,cpl,W}}
function closeTalk(s,env,c,now,kind,why){
  const evId=`soc|${pairOf(c.a,c.b)}|${kind}|${now}`;
  applyEvent(s,{id:evId,type:'talk_out',a:c.a,b:c.b,at:now},env);c.open=false;
  soc(s).res[pairOf(c.a,c.b)]={kind,until:now+4*HOUR,at:now};
  jr(s,'conf_branch',c.a,c.b,why||BRANCH_NAME[kind],now,{branch:kind})}
function separate(s,env,c,now,log,inp){
  const S=soc(s),key=pairOf(c.a,c.b),st=romState(s,c.a,c.b);
  c.open=false;
  if(st.k==='lover'||st.k==='spouse'){
    const kind=st.k==='spouse'?'divorce':'breakup';
    S.sep[key]={kind,at:now,pre:st.k,by:c.by};
    const r=applyEvent(s,{id:`soc|${key}|${kind}|${now}`,type:kind,a:c.a,b:c.b,at:now},env);if(r)log.push(r);
    const rv=romRev(s,c.a,c.b);
    rv.sug={to:'ended',from:c.by,at:now,pre:st.k,text:`${eun(nm(env,c.a))} ${wa(nm(env,c.b))} ${kind==='divorce'?'갈라선':'헤어진'} 것 같아요. 공식 관계 표시도 '친구'로 바꿀까요? (바꾸지 않아도 캐릭터들은 헤어진 사이로 지내요)`};
    jr(s,'sep',c.a,c.b,kind==='divorce'?'이혼':'이별',now,{pre:st.k});
  }else{   // 연인이 아닌 사이: 틀어진 채 멀어짐
    S.estr[key]=now;for(const [x,y] of [[c.a,c.b],[c.b,c.a]]){const R=rel(s,x,y,env);R.aff=clamp(R.aff-12,-100,100);R.why=fillW(env,y,'와(과) 크게 다퉈 멀어져서');R.whyAt=now}
    jr(s,'conf_branch',c.a,c.b,'크게 틀어져 서로 멀어짐',now,{branch:'estrange'})}}
const fillW=(env,id,t)=>env.name(id)+t;
function resolveConflicts(s,env,inp,log){
  const S=soc(s),now=env.now,ids=inp.chars.map(c=>c.id),slice=Math.floor(now/(30*MIN));
  for(const key of Object.keys(S.conf)){const c=S.conf[key];if(!c.open)continue;
    if(!env.char(c.a)||!env.char(c.b)){c.open=false;continue}
    const rng=mulberry(hash('cf|'+key+'|'+slice));
    const age=(now-c.at)/HOUR;
    if(!c.branch){
      if(age<.5)continue;
      const d=decide(s,env,c,ids,rng);c.branch=d.pick;c.bAt=now;c.third=d.th||null;
      jr(s,'conf_branch',c.a,c.b,BRANCH_NAME[d.pick],now,{branch:d.pick,lvl:Math.round(c.lvl)});
      if(d.pick==='bicker'){applyEvent(s,{id:`soc|${key}|bk|${now}`,type:'bicker_end',a:c.a,b:c.b,at:now},env);c.open=false}
      else if(d.pick==='cooldown'){c.due=now+(2+Math.floor(rng()*7))*HOUR}
      else if(d.pick==='mature'){closeTalk(s,env,c,now,'mature')}
      else if(d.pick==='mediate'){c.due=now+(1+Math.floor(rng()*3))*HOUR;
        const t=c.third;if(t){const x=((s.rel[pk(t,c.a)]||{}).aff||0)<((s.rel[pk(t,c.b)]||{}).aff||0)?c.b:c.a;   // 중재자는 더 마음이 상한 쪽을 위로
          const y=x===c.a?c.b:c.a;const r=applyEvent(s,{id:`soc|${key}|md|${now}`,type:'comfort',a:t,b:x,at:now},env);if(r)log.push(r);
          jr(s,'conf_branch',t,x,`${ga(nm(env,t))} ${nm(env,x)}의 이야기를 들어 주며 화해를 도와서`,now,{branch:'mediate',third:t})}}
      else if(d.pick==='unresolved'){c.due=now+6*HOUR}
      else if(d.pick==='crisis'){c.due=now+(6+Math.floor(rng()*30))*HOUR;S.stage=S.stage||{};S.stage[key]={k:'crisis',at:now}}
      continue}
    if(c.due&&now>=c.due){
      const w=(will(s,env,c.a,c.b)+will(s,env,c.b,c.a))/2;
      if(c.branch==='cooldown'||c.branch==='mediate'){
        const x=c.by,y=x===c.a?c.b:c.a;const p=clamp(.55+w*.4,.2,.95);
        if(rng()<p){const r=applyEvent(s,{id:`soc|${key}|ap|${now}`,type:'apology',a:x,b:y,at:now},env);if(r)log.push(r);c.open=false;jr(s,'conf_branch',x,y,'시간이 지나 먼저 사과하고 화해함',now,{branch:'cooldown'})}
        else{c.branch='unresolved';c.due=now+6*HOUR;jr(s,'conf_branch',x,y,'사과했지만 받아들여지지 않아 풀리지 않음',now,{branch:'unresolved'})}}
      else if(c.branch==='unresolved'){   // 시간이 지나며 조금씩 누그러져 다시 판단
        c.lvl=Math.max(0,c.lvl-6);c.branch=null;c.at=now-HOUR;c.due=0}
      else if(c.branch==='crisis'){
        const tr=(feelOf(s,c.a,c.b).tr+feelOf(s,c.b,c.a).tr)/2,rescue=clamp(.15+w*.55+tr/250-c.lvl/200,.05,.85);
        if(rng()<rescue)closeTalk(s,env,c,now,'mature','위기를 넘기고 마음을 다시 맞춤');
        else separate(s,env,c,now,log,inp)}}
  }
  for(const k of Object.keys(S.conf))if(!S.conf[k].open&&now-S.conf[k].at>3*DAY)delete S.conf[k]}

/* ---------- 마찰: 쌓인 원망·질투·성격 충돌이 같은 곳에서 부딪힐 때만 갈등이 생김(무작위 주사위가 아니라 상태에서 나옴) ---------- */
function friction(s,env,inp,log){
  const S=soc(s),now=env.now,slice=Math.floor(now/(30*MIN));
  const home=inp.chars.map(c=>c.id).filter(id=>inp.cur[id]&&inp.cur[id].mode==='home'&&inp.cur[id].seg!=null&&inp.cur[id].action!=='sleep');
  for(let i=0;i<home.length;i++)for(let j=0;j<home.length;j++){if(i===j)continue;const a=home[i],b=home[j];
    if(inp.cur[a].seg!==inp.cur[b].seg)continue;
    const key=pairOf(a,b);if((S.conf[key]&&S.conf[key].open)||S.sep[key]&&now-S.sep[key].at<2*HOUR)continue;
    const fa=feelOf(s,a,b),A=env.A(a),B=env.A(b);
    const clash=Math.max(0,tvOf(A,'angry'))+.7*Math.max(0,tvOf(A,'harsh'))+.5*Math.max(0,tvOf(A,'tsun'))+.5*Math.max(0,tvOf(B,'harsh'))+.3*Math.max(0,tvOf(B,'smug'));
    const e=ensureEmo(s,a).lv.irritated.v/100;
    const sc=fa.jl*.0016+fa.rs*.0012+fa.wr*.0006+clash*.003+e*.02;
    if(sc<.01)continue;
    const rng=mulberry(hash('fr|'+a+'|'+b+'|'+slice));
    if(rng()>Math.min(.12,sc*(1-clamp(((s.rel[pk(a,b)]||{}).aff||0)/160,0,.4))))continue;
    const why=fa.jl>=15?`${nm(env,b)}와(과) 얽힌 마음이 풀리지 않아서`:fa.rs>=12?`쌓인 서운함이 터져서`:`서로 성격이 부딪혀서`;
    const r=applyEvent(s,{id:`soc|fr|${key}|${slice}`,type:'conflict',a,b,at:now,bump:fa.jl>=15?18:0,why},env);if(r)log.push(r)}}
/* ---------- 목격 · 소문 · 반응 ---------- */
const ROMANTIC=new Set(['affection','date','confess_ok','propose_ok']);
const WITNESS_T=new Set(['affection','date','confess_ok','propose_ok','conflict','breakup','divorce','reunion']);
function addKnow(s,w,item){const S=soc(s),L=S.know[w]||(S.know[w]=[]);
  const dup=L.find(x=>x.k===item.k&&pairOf(x.a,x.b)===pairOf(item.a,item.b));
  if(dup){const again=item.src==='seen'&&dup.src==='seen'&&item.at-dup.at>=12*HOUR;if(item.conf>=dup.conf||item.src==='seen'){Object.assign(dup,item)}return again}
  L.push(item);if(L.length>60)L.shift();return true}
const knows=(s,w,k,a,b)=>((soc(s).know[w]||[]).find(x=>x.k===k&&pairOf(x.a,x.b)===pairOf(a,b))||null);
const kindOf=t=>ROMANTIC.has(t)?'romantic':(t==='conflict'?'conflict':(t==='divorce'?'breakup':t));
function reactionPool(s,env,w,x,y,kind,conf){   // w 가 x 와 y 에 대해 아는 것에 반응. x 는 w 와 마음이 얽힌 쪽(없으면 null)
  const A=env.A(w),stake=!!x;
  const exSet=soc(s).expect[w]&&soc(s).expect[w][x||''];
  const excl=exSet==='excl'?1:exSet==='open'?0:clamp(.45+.3*tvOf(A,'jealous')+.1*tvOf(A,'tsun')-.25*tvOf(A,'aloof'),.1,.9);   // 프로필이 말이 없으면 독점을 가정하지 않고 성격에서만 기울기를 읽음
  const trustX=x?feelOf(s,w,x).tr/100:.5;
  const P={};
  if(kind==='romantic'&&stake){
    P.jealous=(.12+.55*Math.max(0,tvOf(A,'jealous'))*excl+.25*(1-trustX)*excl);
    P.anxious=.1+.3*Math.max(0,tvOf(A,'shy'))+.2*excl;
    P.relief=.08+.3*Math.max(0,tvOf(A,'aloof'))+.25*(1-excl);
    P.curious=.12+.2*Math.max(0,tvOf(A,'curious'));
    P.indifferent=.08+.4*Math.max(0,tvOf(A,'aloof'))+.3*(1-excl);
    P.resigned=.05+.2*Math.max(0,tvOf(A,'negative'))+.1*Math.max(0,tvOf(A,'cynic'));
    P.understand=.08+.3*Math.max(0,tvOf(A,'caring'))*(1-excl);
    P.silent=.08+.3*Math.max(0,tvOf(A,'shy'))+.2*Math.max(0,tvOf(A,'inexpr'));
    if((romBits(s,w,x).lv)&&romState(s,w,x).k!=='lover'&&romState(s,w,x).k!=='spouse')P.rival=.3+.3*Math.max(0,tvOf(A,'bold'));
  }else if(kind==='romantic'){
    P.curious=.2+.2*Math.max(0,tvOf(A,'curious'));P.indifferent=.4+.3*Math.max(0,tvOf(A,'aloof'));P.glad=.15+.3*Math.max(0,tvOf(A,'caring'));
  }else if(kind==='conflict'){
    P.worried=.2+.4*Math.max(0,tvOf(A,'caring'));P.indifferent=.3+.3*Math.max(0,tvOf(A,'aloof'));P.curious=.1+.15*Math.max(0,tvOf(A,'curious'));P.uneasy=.1+.3*Math.max(0,tvOf(A,'shy'))}
  else if(kind==='breakup'){P.worried=.2+.3*Math.max(0,tvOf(A,'caring'));P.curious=.2;P.indifferent=.3+.3*Math.max(0,tvOf(A,'aloof'));if(stake)P.hopeful=.25+.3*Math.max(0,tvOf(A,'bold'))}
  else if(kind==='reunion'){P.glad=.3+.3*Math.max(0,tvOf(A,'caring'));P.indifferent=.3;if(stake)P.resigned=.1}
  return {P,excl}}
const pickW=(rng,P)=>{let t=0;for(const k in P)t+=Math.max(0,P[k]);if(t<=0)return null;let r=rng()*t;for(const k in P){r-=Math.max(0,P[k]);if(r<=0)return k}return Object.keys(P)[0]};
const RLABEL={jealous:'질투를 느낌',anxious:'마음이 불안해짐',relief:'오히려 마음이 가벼워짐',curious:'궁금해함',indifferent:'별로 신경 쓰지 않음',resigned:'체념하듯 받아들임',understand:'이해해 보려 함',silent:'아무 말도 하지 않고 삼킴',rival:'경쟁심을 느낌',glad:'잘됐다고 여김',worried:'걱정함',uneasy:'어색하고 불편해함',hopeful:'기대를 품음'};
let CURPAIR=null;
function applyReaction(s,env,w,x,y,rk,kind,conf,rng,now,log,via){
  const S=soc(s),a=nm(env,x||y),b=nm(env,y);
  const g=(id,v)=>addEmo(s,w,id,v*conf,null,now,env.A(w));
  const cause=via==='heard'?`${nm(env,x||y)}와(과) ${nm(env,y)}에 대한 이야기를 듣고`:'두 사람의 모습을 보고';
  const E={jealous:()=>{g('irritated',16);g('anxious',12);if(x)bump(s,w,x,'jl',22*conf);},
    anxious:()=>{g('anxious',20)},relief:()=>{g('calm',12)},curious:()=>{g('curious',14)},indifferent:()=>{},
    resigned:()=>{g('sad',12);if(x)bump(s,w,x,'tr',-2)},understand:()=>{g('calm',8);g('curious',8)},silent:()=>{g('anxious',10);g('sad',6)},
    rival:()=>{g('irritated',14);g('excited',6);if(y)bump(s,w,y,'jl',16*conf)},glad:()=>{g('happy',10)},worried:()=>{g('anxious',12)},uneasy:()=>{g('anxious',10)},hopeful:()=>{g('excited',14)}};
  (E[rk]||(()=>{}))();
  jr(s,'witness',w,x||y,`${nm(env,w)}: ${RLABEL[rk]||rk} (${cause})`,now,{via:via||'seen',rk,about:[x||y,y].filter(Boolean),pair:CURPAIR});
  /* 반응에서 이어지는 행동 후보(실제 행동 훅이 읽음) */
  if(rk==='jealous'||rk==='anxious'||rk==='understand'||rk==='curious'&&x){if(x)S.todo.push({k:'check',w,to:x,at:now,due:now+(1+Math.floor(rng()*5))*HOUR,kind:rk,exp:now+DAY})}
  if(rk==='hopeful'&&x)S.todo.push({k:'approach',w,to:x,at:now,due:now,exp:now+12*HOUR});
  if(rk==='jealous'&&x){   // 성격이 거칠수록 직접 따짐 → 갈등 사건(그 뒤는 갈등의 갈래로 이어지며 항상 이별로 가지 않음)
    const p=.18+.35*Math.max(0,tvOf(env.A(w),'angry'))+.25*Math.max(0,tvOf(env.A(w),'bold'))+.2*Math.max(0,tvOf(env.A(w),'harsh'))-.2*Math.max(0,tvOf(env.A(w),'shy'));
    if(rng()<clamp(p,.05,.7)*conf){const r=applyEvent(s,{id:`soc|jf|${pairOf(w,x)}|${now}`,type:'conflict',a:w,b:x,at:now,bump:22,why:`${nm(env,y)}와(과) 있는 모습 때문에`},env);if(r)log.push(r)}}}
function witnessEvents(s,env,inp,log,newEv){
  const S=soc(s),now=env.now;
  for(const ev of newEv){if(!WITNESS_T.has(ev.type))continue;
    const ca=inp.cur[ev.a],cb=inp.cur[ev.b];if(!ca||!cb||ca.mode!=='home'||ca.seg==null)continue;
    const kind=kindOf(ev.type);
    for(const w of inp.chars.map(c=>c.id)){if(w===ev.a||w===ev.b)continue;const cw=inp.cur[w];
      if(!cw||cw.mode!=='home'||cw.seg!==ca.seg||cw.action==='sleep')continue;
      CURPAIR=[ev.a,ev.b];
      const rng=mulberry(hash('wt|'+w+'|'+ev.id));
      const item={k:kind,a:ev.a,b:ev.b,at:now,src:'seen',conf:1};
      if(!addKnow(s,w,item))continue;
      /* w 가 마음을 두거나 연인인 쪽 */
      const tie=[ev.a,ev.b].find(z=>{const st=romState(s,w,z);return st.k==='lover'||st.k==='spouse'||romBits(s,w,z).lv});
      const x=tie||null,y=tie?(tie===ev.a?ev.b:ev.a):ev.b;
      const {P}=reactionPool(s,env,w,x,y,kind,1);
      const r1=pickW(rng,P);if(!r1)continue;
      applyReaction(s,env,w,x,y,r1,kind,1,rng,now,log,'seen');
      if(Object.keys(P).length>2&&rng()<.4){const P2={...P};delete P2[r1];const r2=pickW(rng,P2);if(r2&&r2!==r1)applyReaction(s,env,w,x,y,r2,kind,.6,rng,now,log,'seen')}}}}
const DIST={conflict:'breakup',romantic:'romantic'};   // 전해지는 중에 부풀려진 소문(오해): 다툼→헤어졌다더라, 다정한 모습→사귀는 사이더라
function gossip(s,env,inp,log){
  const S=soc(s),now=env.now,slice=Math.floor(now/(30*MIN));
  const home=inp.chars.map(c=>c.id).filter(id=>inp.cur[id]&&inp.cur[id].mode==='home'&&inp.cur[id].seg!=null&&inp.cur[id].action!=='sleep');
  for(const a of home)for(const b of home){if(a===b||inp.cur[a].seg!==inp.cur[b].seg)continue;
    const L=S.know[a];if(!L||!L.length)continue;
    const rng=mulberry(hash('gs|'+a+'|'+b+'|'+slice)),A=env.A(a);
    const aff=(s.rel[pk(a,b)]||{}).aff||0;if(aff<12)continue;
    if(rng()>.011*(1+Math.max(0,tvOf(A,'social'))+Math.max(0,tvOf(A,'caring')))*(1-.6*Math.max(0,tvOf(A,'inexpr'))))continue;
    const cand=L.filter(it=>it.a!==b&&it.b!==b&&it.conf>=.4&&!(knows(s,b,it.k,it.a,it.b)&&knows(s,b,it.k,it.a,it.b).conf>=it.conf*.85));
    if(!cand.length)continue;const it=cand[Math.floor(rng()*cand.length)];
    const dist=rng()<.12&&DIST[it.k];
    const item={k:dist?DIST[it.k]:it.k,a:it.a,b:it.b,at:now,src:'heard',conf:it.conf*.85,from:a,mis:!!dist||it.mis||false};
    if(!addKnow(s,b,item))continue;
    jr(s,'gossip',a,b,`${ga(nm(env,a))} ${nm(env,b)}에게 ${nm(env,it.a)}·${nm(env,it.b)} 이야기를 전함${dist?' (조금 부풀려서)':''}`,now,{k:item.k,mis:item.mis,pair:[it.a,it.b]});
    const tie=[it.a,it.b].find(z=>{const st=romState(s,b,z);return st.k==='lover'||st.k==='spouse'||romBits(s,b,z).lv});
    const x=tie||null,y=tie?(tie===it.a?it.b:it.a):it.b;
    CURPAIR=[it.a,it.b];
    const {P}=reactionPool(s,env,b,x,y,item.k==='breakup'?'breakup':item.k,item.conf);
    const r=pickW(rng,P);if(r&&rng()<item.conf)applyReaction(s,env,b,x,y,r,item.k,item.conf,rng,now,log,'heard')}}
/* 반응 뒤의 '관계 확인 대화': 마음이 얽힌 두 사람이 같은 곳에 있을 때 직접 확인하고 지식·기대를 갱신 */
function todos(s,env,inp,log){
  const S=soc(s),now=env.now;
  S.todo=S.todo.filter(t=>now<t.exp);
  for(const t of S.todo){if(t.done||now<t.due)continue;
    const cw=inp.cur[t.w],cx=inp.cur[t.to];if(!cw||!cx||cw.mode!=='home'||cx.mode!=='home'||cw.seg==null||cw.seg!==cx.seg||cw.action==='sleep'||cx.action==='sleep')continue;
    if(t.k==='check'){const rng=mulberry(hash('ck|'+t.w+'|'+t.to+'|'+Math.floor(now/(30*MIN))));if(rng()>.5)continue;
      t.done=true;
      /* w 가 직접 물어 알게 된 것은 '직접 확인'으로 올라가고, 이야기가 잘 통하면 기대를 새로 맞출 수 있음 */
      for(const it of (S.know[t.w]||[]))if(it.k==='romantic'&&(it.a===t.to||it.b===t.to)){it.src='asked';it.conf=1;it.mis=false}
      const A=env.A(t.w),B=env.A(t.to),open=rng()<.25+.3*Math.max(0,tvOf(A,'caring'))+.25*Math.max(0,tvOf(B,'caring'))-.3*Math.max(0,tvOf(A,'jealous'));
      S.expect[t.w]=S.expect[t.w]||{};
      if(t.kind==='jealous'&&!open){S.expect[t.w][t.to]='excl';addEmo(s,t.w,'sad',8,'관계에 대한 기대가 어긋난다는 걸 확인해서',now,A);bump(s,t.w,t.to,'tr',-3)}
      else{S.expect[t.w][t.to]=open?'open':S.expect[t.w][t.to];addEmo(s,t.w,'calm',10,'직접 이야기해 보고 마음이 정리되어서',now,A);bump(s,t.w,t.to,'tr',3);bump(s,t.w,t.to,'jl',-12)}
      jr(s,'check',t.w,t.to,`${ga(nm(env,t.w))} ${nm(env,t.to)}에게 직접 관계를 확인함${open?' — 서로의 기대를 다시 맞춤':''}`,now,{open});
      const r=applyEvent(s,{id:`soc|ck|${pairOf(t.w,t.to)}|${now}`,type:'talk',a:t.w,b:t.to,at:now},env);if(r)log.push(r)}}}
/* ---------- 재회 ---------- */
function reunions(s,env,inp,log){
  const S=soc(s),now=env.now,slice=Math.floor(now/(30*MIN));
  for(const key of Object.keys(S.sep)){const sp=S.sep[key],[a,b]=key.split('|');
    if(!env.char(a)||!env.char(b)){delete S.sep[key];continue}
    const wait=(sp.kind==='divorce'?120:48)*HOUR;if(now-sp.at<wait)continue;
    const ca=inp.cur[a],cb=inp.cur[b];if(!ca||!cb||ca.mode!=='home'||cb.mode!=='home'||ca.seg==null||ca.seg!==cb.seg||ca.action==='sleep'||cb.action==='sleep')continue;
    const rng=mulberry(hash('ru|'+key+'|'+slice)),A=env.A(a),B=env.A(b);
    const aff=((s.rel[pk(a,b)]||{}).aff+(s.rel[pk(b,a)]||{}).aff)/2,ga_=agg(s,a,b,now),gb=agg(s,b,a,now);
    /* 이별 자체의 기억(오래가는 큰 기억)은 '상처' 문턱에서 빼고 따로 반영한다: 그대로 두면 석 달 가까이 재회가 불가능해진다 */
    const bkPow=[[a,b],[b,a]].reduce((t,[x,y])=>t+mems(s,x).filter(m=>m.o===y&&m.t==='breakup').reduce((u,m)=>u+effPow(m,now),0),0);
    if(aff<-10||ga_.posPow+gb.posPow<20||(ga_.hurt+gb.hurt-bkPow)>130)continue;
    const p=.007*clamp((aff+30)/70,.2,1.4)*(1+.8*Math.max(0,tvOf(A,'bold')+tvOf(B,'bold'))/2+.5*Math.max(0,tvOf(A,'caring')+tvOf(B,'caring'))/2)*(1-.5*Math.max(0,tvOf(A,'aloof')+tvOf(B,'aloof'))/2);
    if(rng()>p*clamp(1-bkPow/420,.45,1))continue;
    const r=applyEvent(s,{id:`soc|${key}|ru|${now}`,type:'reunion',a,b,at:now},env);if(r)log.push(r);
    delete S.sep[key];
    const R=s.rel[pk(a,b)],rv=romRev(s,a,b);
    if(R&&R.type!=='lover'&&R.type!=='spouse')rv.sug={to:sp.pre,from:a,at:now,text:`${eun(nm(env,a))} ${wa(nm(env,b))} 다시 마음을 이은 것 같아요. 두 사람을 '${sp.pre==='spouse'?'부부':'연인'}'로 되돌릴까요?`};
    else rv.sug=null;
    jr(s,'reunion',a,b,'다시 만나 마음을 이음',now,{kind:sp.kind})}}

/* ---------- 갱신(한 번 돌 때마다) ---------- */
const setPlace=inp=>{PLACE={};for(const c of inp.chars){const u=inp.cur[c.id];if(u&&u.mode==='home'&&u.segName)PLACE[c.id]=u.segName}};
function step(s,inp,env,log,newEv){
  const S=soc(s);setPlace(inp)
  const n0=log.length;
  friction(s,env,inp,log);
  resolveConflicts(s,env,inp,log);
  witnessEvents(s,env,inp,log,newEv.concat(log.slice(n0)));   // 이번 갱신 안에서 새로 생긴 다툼·이별도 같은 방에 있던 캐릭터가 본다
  gossip(s,env,inp,log);
  todos(s,env,inp,log);
  reunions(s,env,inp,log);
  /* 원망·질투·경계는 시간이 지나며 가라앉고, 신뢰·애착은 서서히만 움직임 */
  const now=env.now;
  for(const k in S.feel){const f=S.feel[k],dt=Math.min(3*HOUR,Math.max(0,now-(f.at||now)))/HOUR;
    if(dt>0){const d=Math.pow(.5,dt/48);f.rs*=d;f.jl*=d;f.wr*=Math.pow(.5,dt/120)}f.at=now}
  for(const k of Object.keys(S.res))if(now>S.res[k].until)delete S.res[k];
  for(const k of Object.keys(S.estr))if(now-S.estr[k]>3*DAY)delete S.estr[k]}


/* ---------- 오프라인 경과: 접속하지 않은 동안(최대 14일)의 일을 시간 순서대로 요약해 기록만 남김(알림·팝업 없음, 관찰 일지가 나중에 읽음) ----------
   같은 규칙을 30분 단위로 돌려 순서와 인과(다툼→화해, 목격→반응)가 유지된다. 위치는 그 집의 실제 구역과 하루 일과로 만든 가상 배치이며 실제 기록이 아니다. */
const CU={gapMin:3*HOUR,maxDays:14,step:30*MIN};
function catchUp(s,inp,env,runUpdate){
  const now=env.now,ids=inp.chars.map(c=>c.id);if(ids.length<1)return;
  let last=Infinity;for(const id of ids){const l=s.last[id];if(l==null)return;last=Math.min(last,l)}   // 처음 보는 캐릭터가 있으면 건너뜀
  const gap=now-last;if(!(gap>=CU.gapMin))return;
  const start=Math.max(last,now-CU.maxDays*DAY),segs=[...new Set(Object.values(inp.cur||{}).map(c=>c&&c.seg).filter(x=>x!=null))];if(!segs.length)segs.push('liv');
  OFF=true;let n=0;
  try{for(let t=start+CU.step;t<now-CU.step;t+=CU.step){
    const sp=new Date(t+9*HOUR),hour=sp.getUTCHours()+sp.getUTCMinutes()/60,day=`${sp.getUTCFullYear()}-${sp.getUTCMonth()+1}-${sp.getUTCDate()}`,blk=Math.floor(t/(2*HOUR));
    const cur={};
    for(const id of ids){const sleep=hour>=23||hour<7;const r=Math.floor(mulberry(hash('cu|'+id+'|'+blk))()*1000);
      cur[id]=sleep?{mode:'home',action:'sleep',verb:'sleep_bed',seg:'bed:'+id,partner:null,n:n}:{mode:'home',action:['rest','eat','hobby','work','tv','rest'][r%6],verb:'x',seg:segs[Math.floor(mulberry(hash('cs|'+id+'|'+blk))()*segs.length)],partner:null,n:n}}
    /* 같은 구역에서 가까운 사이끼리는 가끔 둘이서 시간을 보냄(연인은 다정한 시간, 그 밖은 이야기) */
    const slot=Math.floor(t/CU.step);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=ids[i],b=ids[j],ca=cur[a],cb=cur[b];
      if(ca.action==='sleep'||cb.action==='sleep'||ca.seg!==cb.seg)continue;
      const st=romState(s,a,b),aff=((s.rel[pk(a,b)]||{}).aff||8);if(S_SEP(s,a,b))continue;
      const pr=(st.k==='lover'||st.k==='spouse')?.18:(aff>=15?.06:0.02);
      if(mulberry(hash('cp|'+a+'|'+b+'|'+slot))()<pr&&!ca.partner&&!cb.partner){ca.partner=b;ca.verb=(st.k==='lover'||st.k==='spouse')?'love_aff':'chat_x';ca.n=n+1000000+slot}}
    n++;
    const pv={};for(const id of ids)pv[id]={n:-1,outAt:0};
    runUpdate({...inp,now:t,hour,day,cur,prev:pv,__cu:1})}}
  finally{OFF=false}
  jr(s,'offline',ids[0],null,`접속하지 않은 ${Math.round(gap/HOUR)}시간 동안의 일을 요약해 기록함`,now,{span:[start,now],steps:n})}
const S_SEP=(s,a,b)=>!!soc(s).sep[pairOf(a,b)];
/* ---------- 행동 훅 ---------- */
const LINES={
  conf_cool:['{p}와 다툰 뒤라 말없이 거리를 두고 있는 중','{p}가 보이면 괜히 시선을 피하는 중','{p}와 다툰 일이 자꾸 떠올라 마음이 무거운 중'],
  conf_unres:['{p}와 풀지 못한 일이 마음에 걸려 가까이 가지 못하는 중','{p}와 어색한 공기 속에서 서로 눈치를 보는 중'],
  seek:['{p}에게 먼저 말을 걸 타이밍을 재는 중','{p}에게 사과할 말을 속으로 고르는 중'],
  mature:['{p}와 차분하게 속마음을 털어놓으며 이야기하는 중','{p}와 서로 서운했던 점을 하나씩 짚어 보는 중','{p}와 마주 앉아 앞으로 어떻게 할지 이야기하는 중'],
  crisis:['{p}와 마주 앉았지만 아무 말도 못 하고 있는 중','{p}에게 건넬 말을 고르다 입을 다무는 중'],
  sep:['{p}와 헤어진 뒤라 어색하게 거리를 두는 중','{p}가 가까이 오자 마음이 흔들리지만 애써 담담한 척하는 중','{p}를 의식하지 않는 척하면서 신경은 온통 그쪽에 있는 중'],
  check:['{p}에게 직접 물어보려고 곁을 서성이는 중','{p}에게 마음을 확인하고 싶어 말을 고르는 중'],
  avoid:['{p}와 마주치지 않으려고 자리를 옮기는 중','{p} 쪽을 피해 다른 곳으로 가는 중']};
const fillP=(t,p)=>String(t).replace(/\{p\}(를|가|와|는)/g,(m,j)=>({'를':n=>n+(/[가-힣]/.test(n.slice(-1))&&(n.charCodeAt(n.length-1)-0xAC00)%28?'을':'를'),'가':n=>n+((n.charCodeAt(n.length-1)-0xAC00)%28?'이':'가'),'와':n=>n+((n.charCodeAt(n.length-1)-0xAC00)%28?'과':'와'),'는':n=>n+((n.charCodeAt(n.length-1)-0xAC00)%28?'은':'는')})[j](p)).replace(/\{p\}/g,p);
function extend(H,s,now,U){
  const S=soc(s),KEY=(a,b)=>pairOf(a,b);
  const sepOf=(c,o)=>S.sep[KEY(c,o)]||null,confOf=(c,o)=>{const x=S.conf[KEY(c,o)];return x&&x.open?x:null},resOf=(c,o)=>S.res[KEY(c,o)]||null;
  const todoFor=(c,o)=>S.todo.find(t=>!t.done&&t.w===c&&t.to===o&&now>=t.due)||null;
  H.sep=sepOf;
  const baseIsCouple=H.isCouple;H.isCouple=(c,o)=>baseIsCouple(c,o)&&!sepOf(c,o);
  const basePM=H.partnerMul;
  H.partnerMul=(c,o)=>{let m=basePM(c,o);
    const cf=confOf(c,o),sp=sepOf(c,o),es=S.estr[KEY(c,o)],td=todoFor(c,o);
    if(cf){if(cf.branch==='unresolved'||cf.branch==='crisis'||!cf.branch)m*=.35;else if(cf.branch==='cooldown'){m*=(cf.due&&now>=cf.due&&cf.by===c)?2.4:.5}}
    if(sp)m*=Math.min(1,.45+(now-sp.at)/(10*DAY));
    if(es)m*=.4;
    if(td)m*=2.2;
    const rs=resOf(c,o);if(rs&&rs.kind==='mature')m*=1.6;
    return clamp(m,.08,3.5)};
  const baseAM=H.acceptMul;
  H.acceptMul=(o,c)=>{let m=baseAM(o,c);const cf=confOf(o,c);if(cf&&(cf.branch==='unresolved'||cf.branch==='crisis'))m*=.5;if(sepOf(o,c))m*=.7;return clamp(m,.05,1.6)};
  /* 갈등·이별·확인 같은 상태를 보여 주는 행동 지문(연애 지문이 없을 때 사용). 확률로만 쓰여 매번 나오지 않음 */
  H.relLine=(c,o,A,B,rng,cname,oname,room)=>{
    const sp=sepOf(c,o),cf=confOf(c,o),rs=resOf(c,o),td=todoFor(c,o);let pool=null;
    if(rs&&rs.kind==='mature')pool=LINES.mature;
    else if(td&&td.k==='check')pool=LINES.check;
    else if(cf&&cf.branch==='crisis')pool=LINES.crisis;
    else if(cf&&cf.branch==='cooldown'&&cf.due&&now>=cf.due)pool=LINES.seek;
    else if(cf&&cf.branch==='unresolved')pool=LINES.conf_unres;
    else if(cf)pool=LINES.conf_cool;
    else if(sp&&now-sp.at<20*DAY)pool=LINES.sep;
    if(!pool||rng()>.7)return null;
    return (room?room+'에서 ':'')+fillP(pool[Math.floor(rng()*pool.length)],oname)};
  return H}

/* ---------- 화면·테스트용 조회 ---------- */
const journal=(s,since,limit)=>soc(s).log.filter(x=>x.t>=(since||0)).slice(-(limit||100));
const view=(s,a,b)=>{const S=soc(s),f1=feelOf(s,a,b),f2=feelOf(s,b,a),c=S.conf[pairOf(a,b)],sp=S.sep[pairOf(a,b)];
  return {feel:{ab:f1,ba:f2},conflict:c&&c.open?{branch:c.branch,lvl:Math.round(c.lvl),n:c.n}:null,sep:sp||null,know:{a:(S.know[a]||[]).length,b:(S.know[b]||[]).length}}};
function forget(s,id){const S=soc(s);for(const k of Object.keys(S.feel)){const [x,y]=k.split('>');if(x===id||y===id)delete S.feel[k]}
  delete S.know[id];for(const w of Object.keys(S.know))S.know[w]=S.know[w].filter(it=>it.a!==id&&it.b!==id);
  delete S.expect[id];for(const k of Object.keys(S.conf)){const [x,y]=k.split('|');if(x===id||y===id)delete S.conf[k]}
  for(const k of Object.keys(S.sep)){const [x,y]=k.split('|');if(x===id||y===id)delete S.sep[k]}
  S.todo=S.todo.filter(t=>t.w!==id&&t.to!==id);S.log=S.log.filter(x=>x.a!==id&&x.b!==id)}
/* 서버 동기화용: 그 집 캐릭터에 해당하는 부분만 잘라 내고, 받은 것으로 바꿔 넣는다 */
const ok1=(ids,k,sep)=>{const [a,b]=k.split(sep);return ids.has(a)&&ids.has(b)};
const CX=['apr','trapst','dj','hist','refl','strain'];
function slice(S,ids){const o={feel:{},know:{},expect:{},conf:{},sep:{},todo:[],log:[],estr:{},res:{},int:{}};
  for(const k of Object.keys(S.int||{}))if(k!=='_lg'&&ids.has(k))o.int[k]=S.int[k];   // 의도(자율 의사결정)도 함께 보내 다른 기기의 상세창에서 같은 마음이 보이게 함
  for(const k of Object.keys(S.feel||{}))if(ok1(ids,k,'>'))o.feel[k]=S.feel[k];
  for(const k of Object.keys(S.know||{}))if(ids.has(k))o.know[k]=S.know[k].filter(x=>ids.has(x.a)&&ids.has(x.b));
  for(const k of Object.keys(S.expect||{}))if(ids.has(k))o.expect[k]=S.expect[k];
  for(const k of Object.keys(S.conf||{}))if(ok1(ids,k,'|'))o.conf[k]=S.conf[k];
  for(const k of Object.keys(S.sep||{}))if(ok1(ids,k,'|'))o.sep[k]=S.sep[k];
  for(const k of Object.keys(S.estr||{}))if(ok1(ids,k,'|'))o.estr[k]=S.estr[k];
  for(const k of Object.keys(S.res||{}))if(ok1(ids,k,'|'))o.res[k]=S.res[k];
  o.cx={};for(const f of CX)if(S[f]){o.cx[f]={};for(const k of Object.keys(S[f]))if(ids.has(k))o.cx[f][k]=S[f][k]}   // 갇힘·매너리즘·기시감·생활 기록·성찰 상태(리더가 바뀌어도 이어지게)
  o.todo=(S.todo||[]).filter(t=>ids.has(t.w)&&ids.has(t.to));const lg=(S.log||[]).filter(x=>ids.has(x.a)&&(x.b==null||ids.has(x.b)));   // 서버로 보낼 때도 중요한 기록(이별·재회·갈등 갈래·돌봄 등)은 지키고 일상 기록만 최근 것으로 줄임
  const imp=lg.filter(x=>KEEP.has(x.type)),oth=lg.filter(x=>!KEEP.has(x.type)).slice(-200);o.log=imp.slice(-300).concat(oth).sort((x,y)=>x.t-y.t);return o}
function mergeSlice(s,sl,ids){const S=soc(s);
  for(const k of Object.keys(S.feel))if(ok1(ids,k,'>'))delete S.feel[k];
  for(const k of Object.keys(S.know))if(ids.has(k))delete S.know[k];
  for(const k of Object.keys(S.expect))if(ids.has(k))delete S.expect[k];
  for(const k of Object.keys(S.conf))if(ok1(ids,k,'|'))delete S.conf[k];
  for(const k of Object.keys(S.sep))if(ok1(ids,k,'|'))delete S.sep[k];
  for(const k of Object.keys(S.estr))if(ok1(ids,k,'|'))delete S.estr[k];
  for(const k of Object.keys(S.res))if(ok1(ids,k,'|'))delete S.res[k];
  S.int=S.int||{};for(const k of Object.keys(S.int))if(k!=='_lg'&&ids.has(k))delete S.int[k];Object.assign(S.int,sl.int||{});
  S.todo=S.todo.filter(t=>!(ids.has(t.w)&&ids.has(t.to)));S.log=S.log.filter(x=>!(ids.has(x.a)&&(x.b==null||ids.has(x.b))));
  Object.assign(S.feel,sl.feel||{});Object.assign(S.know,sl.know||{});Object.assign(S.expect,sl.expect||{});Object.assign(S.conf,sl.conf||{});Object.assign(S.sep,sl.sep||{});Object.assign(S.estr,sl.estr||{});Object.assign(S.res,sl.res||{});
  for(const f of CX){S[f]=S[f]||{};for(const k of Object.keys(S[f]))if(ids.has(k))delete S[f][k];Object.assign(S[f],(sl.cx||{})[f]||{})}
  S.todo.push(...(sl.todo||[]));S.log.push(...(sl.log||[]));S.log.sort((x,y)=>x.t-y.t)}
M._soc={jr,setPlace,catchUp,CU,slice,mergeSlice,onEvent,step,extend,journal,view,forget,soc,feelOf,addKnow,knows,BRANCH_NAME};
if(typeof module!=='undefined'&&module.exports)module.exports=M._soc;
})(typeof window!=='undefined'?window:globalThis);
