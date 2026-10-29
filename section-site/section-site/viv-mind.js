/* 비바리움 관찰 v16 — 감정 · 관계 · 상대방에 대한 생각 · 감정적 기억
   - 도면(S)·가구 배치·캐릭터 프로필·시뮬레이션 상태(viv.sim.v1)와 완전히 분리된 별도 저장소(viv.mind.v1)를 쓴다.
   - 규칙 기반(AI 아님). 감정 계산 / 관계 변화 / 기억 생성 / 행동 선택 보정이 서로 다른 함수로 나뉘어 있어 나중에 AI 로 바꿔 끼울 수 있다.
   - 감정·관계 유형·기억 유형·사건 효과는 아래 설정 데이터(EMOTIONS, REL_TYPES, MEM_TYPES, EVENTS …)에서만 정의한다.
   - 시간은 호출하는 쪽이 넘겨 주는 now(ms)와 서울 시각(hour, day)만 쓴다. 페이지를 닫아 둔 동안의 사건은 만들지 않는다.
   브라우저와 node(테스트) 양쪽에서 동작한다. */
(function(root){
'use strict';
const MIN=60000,HOUR=3600000,DAY=86400000;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const SOC=()=>api._soc||null,DEC=()=>api._dec||null,CHN=()=>api._chn||null;
const tvOf=(A,k)=>(A&&A.traits&&A.traits[k])||0;
const ga=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?`${n}이`:`${n}가`};
const eun=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?`${n}은`:`${n}는`};
const wa=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?`${n}과`:`${n}와`};
const fill=(t,o)=>String(t||'').replace(/\{o\}와\(과\)/g,wa(o)).replace(/\{o\}/g,o||'상대');

/* =====================================================================
   설정 데이터 (추후 확장은 여기에 항목만 추가)
   ===================================================================== */
/* 감정: prio=대표 감정 선택 시 우선순위 가중, half=이 감정이 절반으로 줄어드는 시간(분) */
const EMOTIONS={
  happy:{n:'행복함',pos:1,prio:1.0,half:240},
  calm:{n:'평온함',pos:1,prio:.55,half:180},
  excited:{n:'설렘',pos:1,prio:1.15,half:90},
  curious:{n:'호기심',pos:1,prio:.9,half:120},
  sad:{n:'슬픔',pos:-1,prio:1.3,half:360},
  lonely:{n:'외로움',pos:-1,prio:1.2,half:120},
  anxious:{n:'불안함',pos:-1,prio:1.25,half:240},
  irritated:{n:'짜증남',pos:-1,prio:1.25,half:150},
  bored:{n:'지루함',pos:-1,prio:.85,half:120},
  tired:{n:'피곤함',pos:-1,prio:1.0,half:180}};
const EMO_IDS=Object.keys(EMOTIONS);
const LEVELS=[[70,'강함'],[40,'보통'],[0,'약함']];       // 강도 구간(수치 하한)
const SHOW_MIN=22;                                          // 이 수치보다 낮은 감정은 대표 감정으로 보이지 않음(없으면 '평온함 · 약함')
/* 관계 유형: lock=true 이면 자동으로 바뀌지 않는 유형(가족·연인) */
const REL_TYPES={
  family:{n:'가족',lock:true,aff:35},friend:{n:'친구',aff:40},lover:{n:'연인',lock:true,aff:55},spouse:{n:'부부',lock:true,aff:70},
  roommate:{n:'룸메이트',aff:8},acquaint:{n:'아는 사이',aff:12},awkward:{n:'어색한 사이',aff:0},
  rival:{n:'경쟁자',aff:-8},uneasy:{n:'불편한 사이',aff:-25},hostile:{n:'적대적인 사이',aff:-55}};
/* 상대방에 대한 현재 생각 */
const THOUGHTS={comfy:'편안한 사람',trust:'믿을 수 있는 사람',fun:'함께 있으면 즐거운 사람',notice:'신경 쓰이는 사람',burden:'부담스러운 사람',wary:'경계해야 하는 사람',unknown:'아직 잘 모르겠는 사람'};
/* 감정적 기억 유형: val=정서(+/−), half=영향력이 절반이 되는 시간(시간), win=같은 기억으로 합치는 시간 창(시간) */
const MEM_TYPES={
  chat_time:{n:'함께 이야기를 나눈 기억',val:1,half:30,win:8},
  happy_time:{n:'함께 즐거운 시간을 보낸 기억',val:1,half:60,win:6},
  affection:{n:'다정하게 시간을 보낸 기억',val:1,half:72,win:8},
  cozy:{n:'함께 편안하게 쉰 기억',val:1,half:36,win:8},
  outing:{n:'함께 외출한 기억',val:1,half:96,win:12},
  helped:{n:'힘들 때 도움받은 기억',val:1,half:240,win:6},
  apology:{n:'다툰 뒤 진심 어린 사과를 받은 기억',val:1,half:168,win:6},
  quarrel:{n:'다퉈서 마음이 상한 기억',val:-1,half:168,win:4},
  ignored:{n:'무시당해 서운했던 기억',val:-1,half:96,win:4},
  love_ok:{n:'마음을 전해 받아들여진 기억',val:1,half:480,win:24},
  love_no:{n:'고백이 거절되어 마음이 아팠던 기억',val:-1,half:336,win:24},
  love_fail:{n:'마음을 전하려다 말지 못한 기억',val:-1,half:96,win:12},
  propose_ok:{n:'프로포즈가 받아들여진 기억',val:1,half:720,win:48},
  propose_no:{n:'프로포즈에 답을 미룬 기억',val:-1,half:240,win:48}};
/* 사건 효과. A=먼저 행동한 쪽, B=상대. aff=친밀도 변화량, emo=감정 충격량(음수는 줄어듦), mem=기억 생성(t=유형, p=영향력 0~100)
   같은 사건이라도 받는 쪽의 성격·기존 관계에 따라 개별 계산된다(applyEvent). */
const EVENTS={
  talk:{label:'이야기를 나눔',A:{aff:1.2,emo:{happy:5},why:'{o}와(과) 이야기를 나눠서',mem:{t:'chat_time',p:9,sum:'{o}와(과) 이야기를 나눈 기억'}}},
  play:{label:'함께 놂',A:{aff:2.5,emo:{happy:12,excited:4},why:'{o}와(과) 함께 놀며 즐거워서',mem:{t:'happy_time',p:24,sum:'{o}와(과) 함께 놀며 즐거운 시간을 보낸 기억'}}},
  meal:{label:'함께 식사',A:{aff:1.6,emo:{happy:7},why:'{o}와(과) 함께 식사해서',mem:{t:'happy_time',p:16,sum:'{o}와(과) 함께 식사하며 즐거웠던 기억'}}},
  cozy:{label:'함께 쉼',A:{aff:1,emo:{calm:8},why:'{o}와(과) 한 공간에서 편하게 쉬어서',mem:{t:'cozy',p:12,sum:'{o}와(과) 한 공간에서 편하게 쉰 기억'}}},
  affection:{label:'다정한 시간',A:{aff:3,emo:{excited:12,happy:8},why:'{o}와(과) 다정한 시간을 보내서',mem:{t:'affection',p:24,sum:'{o}와(과) 다정하게 시간을 보낸 기억'}}},
  date:{label:'함께 외출',A:{aff:3.8,emo:{happy:12,excited:8},why:'{o}와(과) 함께 외출해서',mem:{t:'outing',p:30,sum:'{o}와(과) 함께 외출했던 기억'}}},
  comfort:{label:'위로·도움',
    A:{aff:1.2,emo:{happy:5},why:'{o}를 위로해 주며 가까워져서'},
    B:{aff:4.5,emo:{lonely:-30,sad:-25,anxious:-25,calm:8},why:'힘들 때 {o}가 곁에서 도와줘서',mem:{t:'helped',p:42,sum:'힘들 때 {o}에게 위로와 도움을 받은 기억'}}},
  conflict:{label:'다툼',
    A:{aff:-5,emo:{irritated:24,sad:8},why:'{o}와(과) 다퉈서',mem:{t:'quarrel',p:50,open:true,sum:'{o}와(과) 다퉈서 마음이 상한 기억'}},
    B:{aff:-5.5,emo:{irritated:22,sad:12},why:'{o}와(과) 다퉈서',mem:{t:'quarrel',p:50,open:true,sum:'{o}와(과) 다퉈서 마음이 상한 기억'}}},
  ignore:{label:'무시',
    A:null,
    B:{aff:-3.2,emo:{sad:12,irritated:6,lonely:6},why:'{o}에게 무시당한 느낌이 들어서',mem:{t:'ignored',p:30,sum:'{o}에게 무시당해 서운했던 기억'}}},
  apology:{label:'사과·화해',
    A:{aff:1.2,emo:{irritated:-15},why:'{o}에게 사과해서'},
    B:{aff:4.5,emo:{irritated:-30,sad:-14},why:'{o}의 사과를 받아 마음이 풀려서',mem:{t:'apology',p:42,sum:'다툰 뒤 {o}에게 진심 어린 사과를 받은 기억'}},
    after:'closeQuarrel'},
  /* v19 고백·프로포즈 (연애 상태 자체는 사용자 동의 없이 바꾸지 않고, 제안으로만 남긴다 — romResolve) */
  confess_ok:{label:'고백이 받아들여짐',
    A:{aff:6,emo:{happy:26,excited:26},why:'{o}에게 고백해 마음이 받아들여져서',mem:{t:'love_ok',p:62,sum:'{o}에게 마음을 고백해 받아들여진 기억'}},
    B:{aff:6,emo:{happy:20,excited:24},why:'{o}의 고백을 받아들여서',mem:{t:'love_ok',p:55,sum:'{o}의 고백을 받아들인 기억'}}},
  confess_no:{label:'고백이 거절됨',
    A:{aff:-1.5,emo:{sad:32,anxious:10},why:'{o}에게 고백했다가 거절당해서',mem:{t:'love_no',p:58,sum:'{o}에게 고백했다가 거절당한 기억'}},
    B:{aff:-.5,emo:{sad:8,anxious:10},why:'{o}의 고백을 거절해 마음이 무거워서',mem:{t:'love_no',p:28,sum:'{o}의 고백을 거절했던 기억'}}},
  confess_fail:{label:'고백을 망설임',
    A:{aff:0,emo:{anxious:14,sad:6},why:'{o}에게 마음을 전하려다 말지 못해서',mem:{t:'love_fail',p:22,sum:'{o}에게 마음을 전하려다 말지 못한 기억'}},B:null},
  propose_ok:{label:'프로포즈 승낙',
    A:{aff:5,emo:{happy:30,excited:26},why:'{o}에게 프로포즈해 승낙을 받아서',mem:{t:'propose_ok',p:72,sum:'{o}에게 프로포즈해 승낙받은 기억'}},
    B:{aff:5,emo:{happy:28,excited:24},why:'{o}의 프로포즈를 받아들여서',mem:{t:'propose_ok',p:70,sum:'{o}의 프로포즈를 받아들인 기억'}}},
  propose_no:{label:'프로포즈에 답을 미룸',
    A:{aff:-1,emo:{sad:18,anxious:12},why:'{o}에게 프로포즈했지만 답을 미뤄져서',mem:{t:'propose_no',p:40,sum:'{o}에게 프로포즈했지만 답을 미뤄진 기억'}},
    B:{aff:-.5,emo:{anxious:14},why:'{o}의 프로포즈에 답을 미뤄서',mem:{t:'propose_no',p:26,sum:'{o}의 프로포즈에 답을 미뤘던 기억'}}}};
/* 호환: 사건 효과의 상한(한 번에 과하게 바뀌지 않도록) */
const LIMITS={perEvent:8,dayPos:12,dayNeg:-16,memPerPair:10,memPerOwner:30,seen:600,aloneReset:30*MIN,maxTickGap:3*HOUR};
/* 행동 시뮬레이션 그룹이 감정에서 받는 영향(곱셈 가중치) — groupMul 에서 사용 */

/* =====================================================================
   상태
   ===================================================================== */
const create=()=>({v:1,emo:{},rel:{},th:{},mem:{},seen:[],last:{},rom:{},rev:{}});
function migrate(s){
  if(!s||typeof s!=='object'||s.v!==1)return create();
  s.emo=s.emo&&typeof s.emo==='object'?s.emo:{};s.rel=s.rel&&typeof s.rel==='object'?s.rel:{};s.th=s.th&&typeof s.th==='object'?s.th:{};
  s.rom=s.rom&&typeof s.rom==='object'?s.rom:{};s.rev=s.rev&&typeof s.rev==='object'?s.rev:{};
  s.mem=s.mem&&typeof s.mem==='object'?s.mem:{};s.seen=Array.isArray(s.seen)?s.seen:[];s.last=s.last&&typeof s.last==='object'?s.last:{};return s}
const pk=(a,b)=>a+'>'+b;                 // a 가 b 에 대해 갖는 관계(방향 있음)
const pairKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;

/* ---------- 관계 ---------- */
const FAMILY_RE=/가족|형제|자매|남매|오빠|언니|누나|형|동생|엄마|어머니|아빠|아버지|부모|자녀|아들|딸|할머니|할아버지|이모|삼촌|고모|사촌|조카/;
const REL_RE=[['friend',/친구|절친|벗|동료|단짝/],['roommate',/룸메|동거인|룸셰어|같이 ?사는/],['rival',/라이벌|경쟁|맞수/],['uneasy',/불편|껄끄|앙숙|사이가 ?안 ?좋|견제/],['hostile',/적대|원수|증오|철천지/]];
const clauses=t=>String(t||'').split(/[.!?\n,;·~…]+/).map(x=>x.trim()).filter(Boolean);
/* 프로필(양쪽)에 이름과 함께 적힌 관계를 읽는다. 연인은 시뮬레이션의 기존 해석(A.facts.partners)을 따른다 */
function profileRel(env,a,b){
  const ca=env.char(a),cb=env.char(b);if(!ca||!cb)return null;
  const A=env.A(a),B=env.A(b);
  if((A&&A.facts&&A.facts.partners.includes(cb.name))||(B&&B.facts&&B.facts.partners.includes(ca.name)))return 'lover';
  let out=null;
  const scan=(prof,other,mine)=>{for(const c of clauses(prof)){if(!c.includes(other))continue;
    if(FAMILY_RE.test(c)&&!/연인|애인|남자친구|여자친구/.test(c))return 'family';
    for(const [t,re] of REL_RE)if(re.test(c)){if((t==='uneasy'||t==='hostile')&&!mine)continue;return t}}return null};
  out=scan(ca.profile,cb.name,true)||scan(cb.profile,ca.name,false);return out}
function initRel(s,a,b,env){
  const t0=profileRel(env,a,b),A=env.A(a),shy=tvOf(A,'shy')+.6*tvOf(A,'solitary');
  let type=t0||(shy>.5?'awkward':'roommate');
  let aff=REL_TYPES[type].aff+Math.round(((hash(a+'~'+b)%9)-4))+(tvOf(A,'social')>0?3:0)-(shy>.5?3:0);
  const r={aff:clamp(aff,-100,100),type,lock:t0?'profile':null,last:0,why:t0?'프로필에 적힌 관계':'같은 집에서 지내며 알게 됨',whyAt:env.now,origin:t0?'프로필에 서로의 관계가 적혀 있어요':'같은 집에서 함께 지내게 되면서',cnt:0,rec:{},dayKey:'',dayPos:0,dayNeg:0};
  s.rel[pk(a,b)]=r;return r}
const rel=(s,a,b,env)=>s.rel[pk(a,b)]||initRel(s,a,b,env);

/* ---------- 기억 ---------- */
const mems=(s,o)=>s.mem[o]||(s.mem[o]=[]);
function effPow(m,now){
  const T=MEM_TYPES[m.t]||{half:48};const half=T.half*HOUR*(m.p0>=60?3:1);   // 중요도가 높은 사건은 더 오래 간다
  return m.pow*Math.pow(.5,Math.max(0,now-m.at)/half)}
function addMem(s,owner,other,spec,ev,env){
  const list=mems(s,owner),T=MEM_TYPES[spec.t];if(!T)return null;
  let pow=spec.p;
  const A=env.A(owner);if(T.val<0)pow*=1+.2*tvOf(A,'shy');else pow*=1+.1*tvOf(A,'caring');
  const ex=list.find(m=>m.t===spec.t&&m.o===other&&ev.at-m.at<T.win*HOUR&&(!spec.open||m.open));
  if(ex){   // 같은 종류의 기억이 최근에 있으면 새로 늘리지 않고 겹쳐서 조금만 강하게 한다(반복되면 서서히 쌓임)
    ex.pow=Math.min(100,effPow(ex,ev.at)+pow*.45);ex.p0=Math.max(ex.p0,ex.pow);ex.at=ev.at;ex.cnt=(ex.cnt||1)+1;return ex}
  const m={id:'m_'+hash(owner+other+spec.t+ev.id).toString(36),o:other,t:spec.t,sum:fill(spec.sum||T.n,env.name(other)),at:ev.at,val:T.val,pow:Math.min(100,pow),p0:Math.min(100,pow),cnt:1,open:!!spec.open,by:spec.open?ev.a:null};
  list.push(m);
  /* 개수 제한: 한 상대에 대해 10개, 전체 30개를 넘으면 영향력이 가장 약한 것부터 지움 */
  const prune=(arr,max)=>{while(arr.length>max){let k=0,lo=1e9;arr.forEach((x,i)=>{const e=effPow(x,ev.at);if(e<lo){lo=e;k=i}});const rm=arr[k];const li=list.indexOf(rm);if(li>=0)list.splice(li,1);arr.splice(k,1)}};
  prune(list.filter(x=>x.o===other),LIMITS.memPerPair);prune(list.slice(),LIMITS.memPerOwner);
  return m}
function agg(s,a,b,now){
  const r={posPow:0,negPow:0,posN:0,negN:0,help:0,fun:0,cozy:0,hurt:0,apol:0,open:false};
  for(const m of mems(s,a)){if(m.o!==b)continue;const p=effPow(m,now);if(p<2)continue;
    if(m.val>0){r.posPow+=p;r.posN+=m.cnt||1}else{r.negPow+=p;r.negN+=m.cnt||1;r.hurt+=p}
    if(m.t==='helped')r.help+=p;if(m.t==='apology'){r.apol+=p;r.help+=p*.5}
    if(m.t==='happy_time'||m.t==='affection'||m.t==='outing'||m.t==='chat_time')r.fun+=p*(m.t==='chat_time'?.5:1);
    if(m.t==='cozy'||m.t==='affection')r.cozy+=p;
    if(m.open)r.open=true}
  return r}

/* ---------- 관계 유형 자동 변화(사용자·프로필이 정한 유형은 건드리지 않음) ---------- */
function reclassify(s,a,b,env){
  const R=s.rel[pk(a,b)];if(!R||R.lock||REL_TYPES[R.type].lock)return;
  const g=agg(s,a,b,env.now);let to=null,why='';
  if(R.aff<=-60&&g.negN>=2&&R.cnt>=3){to='hostile';why='다툼이 거듭되며 사이가 크게 틀어져서'}
  else if(R.aff<=-25&&g.negPow>=25&&R.cnt>=3&&R.type!=='hostile'){to='uneasy';why='서운한 일이 쌓여 불편해져서'}
  else if((R.type==='uneasy'||R.type==='hostile')&&R.aff>=-5&&g.apol>=10){to='acquaint';why='사과와 화해로 다시 말을 섞게 되어서'}
  else if((R.type==='roommate'||R.type==='acquaint'||R.type==='awkward')&&R.aff>=50&&g.posN>=3&&R.cnt>=8){to='friend';why='함께한 즐거운 기억이 쌓여 친구가 되어서'}
  else if(R.type==='awkward'&&R.cnt>=4&&R.aff>=8){to='acquaint';why='몇 번 어울리며 어색함이 풀려서'}
  if(to&&to!==R.type){R.type=to;R.why=why;R.whyAt=env.now}}

/* ---------- 상대방에 대한 현재 생각 ---------- */
function updateThought(s,a,b,env){
  const R=rel(s,a,b,env),g=agg(s,a,b,env.now),now=env.now,key=pk(a,b);
  const aff=R.aff;
  const sc={
    comfy:.55*Math.max(0,aff)+.5*g.cozy+.25*g.fun,
    trust:(g.help>=18||aff>=55?1:0)*(1.1*g.help+.35*Math.max(0,aff-20)+.3*g.apol),
    fun:1.0*g.fun+.25*Math.max(0,aff),
    notice:Math.min(g.posPow,g.negPow)*.8+Math.max(0,R.cnt-3)*.7+(R.type==='lover'?12:0),
    burden:aff<-5&&aff>-45?(.5*(-aff)+.5*g.hurt):0,
    wary:1.0*g.hurt+Math.max(0,-aff-30)*1.1,
    unknown:R.cnt<3&&Math.abs(aff)<20?40:0};
  if(tvOf(env.A(a),'shy')>0.4){sc.trust*=.75;sc.comfy*=.85}   // 낯을 가리는 성격은 믿음·편안함이 천천히 쌓임
  let best='unknown',bv=-1;for(const k in sc)if(sc[k]>bv){bv=sc[k];best=k}
  if(bv<25)best='unknown';
  const cur=s.th[key];
  const why={comfy:'함께 있으면 마음이 편해져서',trust:'어려울 때 도움을 받은 기억이 쌓여서',fun:'함께 즐거운 시간을 자주 보내서',notice:'엇갈린 일이 있어 자꾸 마음이 쓰여서',burden:'함께 있으면 조금 불편해서',wary:'상처받은 기억이 있어 조심하게 돼서',unknown:'아직 겪은 일이 많지 않아서'}[best];
  if(!cur){s.th[key]={id:best,since:now,why,sc:Math.round(bv)};return}
  const curScore=sc[cur.id]||0;
  /* 한두 번의 사건으로 곧바로 뒤바뀌지 않도록: 새 생각이 현재 생각보다 충분히 크고, 현재 생각이 45분 이상 유지된 뒤에만 바뀜 */
  if(best!==cur.id&&(bv>=curScore*1.25+8||curScore<10)&&now-cur.since>=45*MIN){s.th[key]={id:best,since:now,why,sc:Math.round(bv)}}
  else cur.sc=Math.round(curScore)}

/* ---------- 감정 ---------- */
function ensureEmo(s,cid){
  const e=s.emo[cid]||(s.emo[cid]={lv:{},upd:0,alone:null,init:false});
  EMO_IDS.forEach(k=>{if(!e.lv[k])e.lv[k]={v:0,cause:'',at:0,src:'',cat:0}});return e}
function addEmo(s,cid,id,amt,cause,now,mod){
  if(!EMOTIONS[id])return;const e=ensureEmo(s,cid),L=e.lv[id];
  const A=mod||{};let a=amt;
  if(a>0){const pos=EMOTIONS[id].pos>0;a*=pos?1+.2*tvOf(A,'social'):1+.2*tvOf(A,'shy')}
  const before=L.v;L.v=clamp(L.v+a,0,100);
  if(a>=6&&cause){L.cause=cause;L.src='event';L.cat=now}
  if(before<SHOW_MIN&&L.v>=SHOW_MIN)L.at=now;L.upd=now}
const tiredBase=h=>{h=((h%24)+24)%24;return [70,72,72,70,66,55,40,28,20,15,14,16,26,30,26,22,20,22,26,30,36,46,58,66][Math.floor(h)]};
/* 감정이 향하는 목표값(시간대·성격·위치·혼자/함께 시간·기억). 수치는 이 목표를 향해 천천히 움직이므로 매번 초기화되지 않는다 */
function targets(s,c,env,loc){
  const A=env.A(c.id),T={},C={},h=env.hour,g=loc.action,sleeping=g==='sleep'&&loc.mode==='home',out=loc.mode==='out';
  const night=tvOf(A,'nightowl')>0?-2.5:(tvOf(A,'earlybird')>0?2:0);
  let tired=tiredBase(h+night)+(tvOf(A,'sleepy')>0?10:0)+(tvOf(A,'lazy')>0?4:0)+(out?6:0);
  if(sleeping)tired=0;T.tired=clamp(tired,0,95);C.tired=(h>=21||h<5)?'늦은 시간이라 졸음이 밀려와서':'하루 동안 쌓인 피로 때문에';
  const idle=(g==='wander')||(loc.verb==='idle')||(g==='rest'&&!/read|music|tv/.test(loc.verb||''));
  T.bored=sleeping?0:(out?6:(idle?44+15*tvOf(A,'curious'):10));C.bored='딱히 할 일이 없어서';
  const sm=clamp(1+.6*tvOf(A,'social')-.5*tvOf(A,'solitary')-.4*tvOf(A,'shy')-.25*tvOf(A,'homebody'),.3,1.7);
  const aloneMin=loc.alone&&env.now&&s.emo[c.id].alone!=null?(env.now-s.emo[c.id].alone)/MIN:0;
  T.lonely=sleeping||out?(out?8:0):(loc.alone?clamp((aloneMin-45)/2.5*sm,0,85):4);
  C.lonely=aloneMin>=120?`혼자 있는 시간이 ${Math.floor(aloneMin/60)}시간 넘게 이어져서`:'혼자 있는 시간이 길어져서';
  T.happy=22+(g==='hobby'?18:g==='eat'?10:g==='tv'?8:g==='chat'?14:0)+(out?18:0)+(tvOf(A,'social')>0&&!loc.alone?5:0);C.happy=g==='hobby'?'좋아하는 일을 하고 있어서':g==='eat'?'맛있는 식사를 해서':out?'바깥 나들이가 즐거워서':'기분 좋은 하루라서';
  T.calm=45+(sleeping?25:(g==='rest'?15:0));C.calm='편안한 곳에서 쉬고 있어서';
  T.excited=0;C.excited='';
  T.curious=12+25*tvOf(A,'curious')+((g==='read'||g==='hobby'||g==='study')?15:0)+(out?10:0);C.curious='새로운 것에 마음이 끌려서';
  T.sad=0;C.sad='';T.anxious=0;C.anxious='';
  T.irritated=T.tired>75?(T.tired-70)*.8:0;C.irritated='잠이 부족해 예민해져서';
  /* 같은 곳에 있는 상대에 대한 기억·관계가 현재 기분에 미치는 영향 */
  for(const o of loc.sameRoom||[]){const R=s.rel[pk(c.id,o)];if(!R)continue;const g2=agg(s,c.id,o,env.now),nm=env.name(o);
    if(g2.negPow>=25){const k=Math.min(30,g2.negPow*.4);T.anxious+=k*.6;T.irritated+=k*.5;C.anxious=C.irritated=`${nm}와(과) 함께 있으니 지난 일이 떠올라서`}
    if(g2.posPow>=25&&R.aff>=20){const k=Math.min(18,g2.posPow*.25);T.happy+=k;C.happy=`${nm}와(과) 함께 있어서`;T.lonely*=.6}}
  /* v23.22 위화감 → 현재 감정: 체류가 길어지고 이상현상을 겪어 마음이 무거울수록 감정이 달라짐. 성격(반응 유형)마다 방향이 다르다 */
  {const U=env.unc&&!sleeping&&!out?env.unc(c.id):null;
    if(U&&U.st&&U.st!=='stable'){const lv={uneasy:1,unstable:2,damaged:3}[U.st]||0,b=U.b||0,stay=Math.min(12,Math.max(0,U.days-2)*.8),rc=U.rc||'rational';
      const k=Math.min(55,b*.55+stay);   // 위화감의 무게(0~55)
      const mul={anxious:{anxious:1.15,irritated:.25,tired:.15},curious:{anxious:.35,curious:.5},rational:{anxious:.75,irritated:.15},avoidant:{anxious:.5,lonely:.45},resigned:{anxious:.55,sad:.45,tired:.2}}[rc]||{anxious:.7};
      for(const id in mul)T[id]=(T[id]||0)+k*mul[id]*(1+.12*lv);
      T.calm=Math.max(0,T.calm-Math.min(30,k*.5));
      if(k>=8){const why={anxious:'이 집에서 자꾸 이상한 느낌이 들어서',curious:'이 집의 이상한 점이 계속 마음에 걸려서',rational:'설명되지 않는 위화감이 이어져서',avoidant:'이상한 느낌을 애써 외면하다 보니 마음이 가라앉아서',resigned:'바뀌지 않는 이상한 일상에 지쳐서'}[rc]||'이상한 느낌이 이어져서';
        if(mul.anxious)C.anxious=why;if(mul.sad)C.sad=why;if(mul.lonely&&(T.lonely||0)>=SHOW_MIN)C.lonely=why;if(mul.curious&&(T.curious||0)>=SHOW_MIN)C.curious=why}}}
  for(const k of EMO_IDS)T[k]=clamp(T[k],0,100);
  return {T,C}}
function tickChar(s,c,env,loc){
  const e=ensureEmo(s,c.id),now=env.now;
  if(loc.alone){if(e.alone==null||now-(s.last[c.id]||0)>LIMITS.aloneReset)e.alone=now}else e.alone=null;
  const {T,C}=targets(s,c,env,loc);
  const first=!e.init,dt=first?Infinity:Math.min(Math.max(0,now-(s.last[c.id]||now)),LIMITS.maxTickGap)/MIN;
  for(const k of EMO_IDS){const L=e.lv[k],half=EMOTIONS[k].half*(k==='tired'&&loc.action==='sleep'?.35:1);
    const before=L.v;const f=dt===Infinity?1:1-Math.pow(.5,dt/half);L.v=clamp(L.v+(T[k]-L.v)*f,0,100);
    if(C[k]&&T[k]>=SHOW_MIN&&(L.src!=='event'||now-L.cat>EMOTIONS[k].half*2*MIN)){L.cause=C[k];L.src='tick'}
    if(before<SHOW_MIN&&L.v>=SHOW_MIN)L.at=now;if(Math.abs(L.v-before)>.01)L.upd=now}
  e.init=true;e.upd=now;s.last[c.id]=now}
function rep(s,cid,now){
  const e=s.emo[cid];
  if(!e)return {id:'calm',name:EMOTIONS.calm.n,v:20,level:'약함',cause:'아직 특별한 일 없이 지내는 중이에요',at:0,upd:0,others:[]};
  const arr=EMO_IDS.map(k=>({id:k,v:e.lv[k].v,sc:e.lv[k].v*EMOTIONS[k].prio})).filter(x=>x.v>=SHOW_MIN).sort((a,b)=>b.sc-a.sc);
  if(!arr.length)return {id:'calm',name:EMOTIONS.calm.n,v:Math.round(e.lv.calm.v),level:'약함',cause:'특별한 일 없이 하루를 보내는 중이에요',at:e.lv.calm.at||0,upd:e.upd,others:[]};
  const top=arr[0],L=e.lv[top.id],lvl=LEVELS.find(x=>top.v>=x[0])[1];
  return {id:top.id,name:EMOTIONS[top.id].n,v:Math.round(top.v),level:lvl,cause:L.cause||'뚜렷한 이유 없이 그런 기분이에요',at:L.at||0,upd:e.upd,
    others:arr.slice(1,4).map(x=>({id:x.id,name:EMOTIONS[x.id].n,v:Math.round(x.v),level:LEVELS.find(y=>x.v>=y[0])[1]}))}}

/* =====================================================================
   관계 변화 · 기억 생성 (사건 적용)
   ===================================================================== */
function applyEvent(s,ev,env){
  if(s.seen.includes(ev.id))return null;            // 같은 사건을 두 번 처리하지 않음(새로고침·재호출 방지)
  const E=EVENTS[ev.type];if(!E)return null;
  s.seen.push(ev.id);if(s.seen.length>LIMITS.seen)s.seen.splice(0,s.seen.length-LIMITS.seen);
  const sA=('A' in E)?E.A:null,sB=('B' in E)?E.B:sA;   // B 가 없으면 양쪽이 같은 효과(대칭 사건), A:null 이면 행동한 쪽에는 효과 없음
  const specs=[[ev.a,ev.b,sA],[ev.b,ev.a,sB]];
  for(const [me,other,spec] of specs){if(!spec)continue;
    const R=rel(s,me,other,env),A=env.A(me),nm=env.name(other),eff={};
    let d=spec.aff||0;
    if(d){let m=1;
      if(d>0){m*=1+.15*tvOf(A,'social')+.1*tvOf(A,'caring')-.3*tvOf(A,'shy')*(R.cnt<12?1:.4);if(R.type==='hostile')m*=.45;else if(R.type==='uneasy')m*=.7;else if(R.type==='lover')m*=1.1}
      else{m*=1+.2*tvOf(A,'shy');if(R.type==='family')m*=.7;else if(R.type==='lover')m*=1.1;else if(R.type==='friend')m*=.85}
      const rc=(R.rec[ev.type]||[]).filter(t=>ev.at-t<3*HOUR).length;m*=1/(1+.7*rc);   // 같은 일이 짧은 시간에 반복되면 효과가 줄어듦
      d=clamp(d*m,-LIMITS.perEvent,LIMITS.perEvent);
      if(R.dayKey!==env.day){R.dayKey=env.day;R.dayPos=0;R.dayNeg=0}
      if(d>0){d=Math.max(0,Math.min(d,LIMITS.dayPos-R.dayPos));R.dayPos+=d}else{d=Math.min(0,Math.max(d,LIMITS.dayNeg-R.dayNeg));R.dayNeg+=d}
      R.aff=clamp(R.aff+d,-100,100);eff.aff=d}
    R.last=ev.at;R.cnt++;(R.rec[ev.type]=R.rec[ev.type]||[]).push(ev.at);if(R.rec[ev.type].length>6)R.rec[ev.type].shift();
    if(spec.why){R.why=fill(spec.why,nm);R.whyAt=ev.at}
    const cause=fill(spec.why,nm);
    for(const k in (spec.emo||{}))addEmo(s,me,k,spec.emo[k],cause,ev.at,A);
    if(spec.mem)addMem(s,me,other,spec.mem,ev,env)}
  if(E.after==='closeQuarrel'){   // 사과를 받으면 다툼 기억의 영향력이 줄어든다(지워지지는 않음)
    for(const [x,y] of [[ev.a,ev.b],[ev.b,ev.a]])for(const m of mems(s,x)){if(m.t==='quarrel'&&m.o===y&&m.open){m.pow=effPow(m,ev.at)*.6;m.at=ev.at;m.open=false}}}
  for(const [x,y] of [[ev.a,ev.b],[ev.b,ev.a]]){reclassify(s,x,y,env);updateThought(s,x,y,env)}
  if(SOC())SOC().onEvent(s,ev,env);   // v24 관계의 한살이: 다차원 감정·사건 기록·갈등 열기
  return {id:ev.id,type:ev.type,a:ev.a,b:ev.b}}

/* =====================================================================
   갱신(시뮬레이션이 한 번 돈 뒤 호출)
   input: {now,hour,day,chars:[{id,name,profile}],A:id=>분석,cur:{id:{mode,action,verb,seg,segName,partner,n,outAt,say}},prev:{id:{n,outAt}}}
   ===================================================================== */
const PAIR_VERB={bg_pair:'play',bg_floor:'play',pillow:'affection',love_aff:'affection',love_crush:'talk'};
function makeEnv(s,inp){const byId={};inp.chars.forEach(c=>byId[c.id]=c);
  return {now:inp.now,hour:inp.hour,day:inp.day,char:id=>byId[id]||null,name:id=>(byId[id]||{}).name||'상대',A:id=>inp.A(byId[id]||{id,name:'',profile:''}),unc:id=>(inp.unc?inp.unc(id):null)}}
function update(s,inp){
  s=migrate(s);const env=makeEnv(s,inp),now=inp.now,log=[],ids=inp.chars.map(c=>c.id);
  if(!inp.__cu&&SOC()&&SOC().catchUp){try{SOC().catchUp(s,inp,env,i2=>update(s,i2))}catch(e){console.error('[viv catchup]',e)}}   // v24 오프라인 경과 요약(기록만)
  if(SOC()&&SOC().setPlace)SOC().setPlace(inp);
  /* 0) 같은 집 캐릭터끼리는 처음 만날 때 관계(유형·친밀도)와 첫 생각을 준비 — 프로필에 적힌 관계가 있으면 그대로 반영 */
  for(const x of ids)for(const y of ids)if(x!==y){const had=!!s.rel[pk(x,y)];rel(s,x,y,env);if(!had)updateThought(s,x,y,env)}
  /* 같은 방(함께 있음) 판정 */
  const home=ids.filter(id=>inp.cur[id]&&inp.cur[id].mode==='home');
  const sameRoom=id=>home.filter(o=>o!==id&&inp.cur[o].seg!=null&&inp.cur[o].seg===inp.cur[id].seg);
  /* 1) 감정: 시간·성격·위치·혼자/함께 → 목표를 향해 이동 */
  for(const c of inp.chars){const cu=inp.cur[c.id]||{mode:'home',action:'rest'};
    const alone=cu.mode==='home'?!sameRoom(c.id).length:false;
    tickChar(s,c,env,{mode:cu.mode,action:cu.action,verb:cu.verb,alone,sameRoom:cu.mode==='home'?sameRoom(c.id):[]})}
  /* 2) 실제로 일어난 일: 이번 갱신에서 새로 시작된 둘이서 하는 행동 */
  const touched=new Set();
  const slot15=Math.floor(now/(15*MIN));
  for(const c of inp.chars){const cu=inp.cur[c.id],pv=(inp.prev&&inp.prev[c.id])||{};if(!cu||!cu.partner||!env.char(cu.partner))continue;
    if(cu.mode!=='home'||(pv.n!=null&&pv.n===cu.n))continue;   // 새 결정이 있었을 때만
    const o=cu.partner,V=cu.verb||'',A=env.A(c.id);
    let type=PAIR_VERB[V]||null;if(!type&&/^chat_/.test(V))type=(A&&A.facts&&A.facts.partners.includes(env.name(o)))?'affection':'talk';
    if(!type)continue;
    const id=`obs|${pairKey(c.id,o)}|${type}|${slot15}`;const r=applyEvent(s,{id,type,a:c.id,b:o,at:now},env);if(r){log.push(r);touched.add(c.id+'>'+o).add(o+'>'+c.id)}}
  /* 함께 나간 외출 */
  for(const c of inp.chars){const cu=inp.cur[c.id],pv=(inp.prev&&inp.prev[c.id])||{};if(!cu||cu.mode!=='out'||!cu.outAt||cu.outAt===pv.outAt)continue;
    for(const o of ids){if(o===c.id||!inp.cur[o]||inp.cur[o].mode!=='out'||inp.cur[o].outAt!==cu.outAt)continue;
      if(!String(cu.say||'').includes(env.name(o))||!/함께/.test(cu.say||''))continue;
      const r=applyEvent(s,{id:`date|${pairKey(c.id,o)}|${cu.outAt}`,type:'date',a:c.id,b:o,at:now},env);if(r){log.push(r)}}}
  /* 2.5) v19 고백·프로포즈 결과 반영 */
  romResolve(s,env,now,log);
  /* 3) 같은 방에 함께 있는 동안의 변화(30분 단위로 한 번만 판정, 결과는 쌍과 시각으로 고정) */
  const slice=Math.floor(now/(30*MIN));
  for(let i=0;i<home.length;i++)for(let j=i+1;j<home.length;j++){
    const a=home[i],b=home[j];if(inp.cur[a].seg==null||inp.cur[a].seg!==inp.cur[b].seg)continue;
    if(inp.cur[a].action==='sleep'||inp.cur[b].action==='sleep')continue;
    const ev=ambient(s,a,b,slice,inp,env);if(ev){const r=applyEvent(s,ev,env);if(r)log.push(r)}}
  /* 3.5) v24 갈등의 갈래·목격·소문·관계 확인·재회 */
  if(SOC()){try{SOC().step(s,inp,env,log,log.slice())}catch(e){console.error('[viv social]',e)}}
  if(CHN()){try{CHN().step(s,inp,env,log)}catch(e){console.error('[viv chain]',e)}}
  if(DEC()){try{DEC().step(s,inp,env)}catch(e){console.error('[viv decide]',e)}}
  /* 4) 생각 갱신(시간이 지나며 기억 영향력이 줄어드는 것을 반영) — 같은 집 안의 쌍만 */
  for(let i=0;i<ids.length;i++)for(let j=0;j<ids.length;j++)if(i!==j){const k=pk(ids[i],ids[j]);if(s.rel[k]||s.th[k])updateThought(s,ids[i],ids[j],env)}
  /* 5) 오래되어 영향력이 거의 없는 기억 정리 */
  for(const o in s.mem)s.mem[o]=s.mem[o].filter(m=>effPow(m,now)>=1.5);
  return {state:s,events:log}}
/* 같은 방 두 캐릭터 사이의 변화 후보 하나(없으면 null). 확률은 감정·관계·성격에 따라 달라지고, 시드는 쌍+30분 구간이라 새로고침해도 같은 결과 */
function ambient(s,a,b,slice,inp,env){
  const idb=`amb|${pairKey(a,b)}|${slice}`;if(s.seen.some(x=>x.startsWith(idb)))return null;
  const rng=mulberry(hash(idb)),now=inp.now,A=env.A(a),B=env.A(b);
  const Ra=rel(s,a,b,env),Rb=rel(s,b,a,env),ea=ensureEmo(s,a),eb=ensureEmo(s,b),lv=(e,k)=>e.lv[k].v;
  const mk=(type,x,y)=>({id:`${idb}|${type}`,type,a:x,b:y,at:now});
  /* 사과: 다툼 기억이 열려 있고 먼저 시비를 건 쪽이 시간이 지난 뒤 화해를 청함 */
  for(const [x,y,Rx,Ax] of [[a,b,Ra,A],[b,a,Rb,B]]){
    const q=mems(s,y).find(m=>m.t==='quarrel'&&m.o===x&&m.open&&m.by===x&&now-m.at>=20*MIN&&now-m.at<DAY);
    if(q){const p=.22*(Rx.aff>-60?1:.2)*(1+.3*tvOf(Ax,'caring'));if(rng()<p)return mk('apology',x,y)}}
  /* 다툼 */
  const irr=Math.max(lv(ea,'irritated'),lv(eb,'irritated'));
  if(irr>=20||Ra.aff+Rb.aff<-20){let p=.012+.07*irr/100+.03*Math.max(0,-(Ra.aff+Rb.aff)/200);
    if((Ra.type==='lover'||Ra.type==='spouse'||Ra.type==='family')&&Ra.aff>40)p*=.5;p=Math.min(.2,p);
    if(rng()<p){const x=lv(ea,'irritated')>=lv(eb,'irritated')?a:b;return mk('conflict',x,x===a?b:a)}}
  /* 위로·도움 */
  for(const [x,y,Rx,Ax,ex,ey] of [[a,b,Ra,A,ea,eb],[b,a,Rb,B,eb,ea]]){
    const dis=Math.max(lv(ey,'lonely'),lv(ey,'sad'),lv(ey,'anxious'));
    if(dis>=40&&Rx.aff>=Math.max(-5,10-12*tvOf(Ax,'caring'))&&lv(ex,'irritated')<55){const p=.16*(dis/100)*(.7+.6*tvOf(Ax,'caring')+.3*tvOf(Ax,'social'))*clamp(Rx.aff/50,.3,1.4);if(rng()<p)return mk('comfort',x,y)}}
  /* 무시: 혼자 하는 일에 몰두하는 쪽이 외로운 상대를 지나침 */
  for(const [x,y,Rx,Ax,ey,cx] of [[a,b,Ra,A,eb,inp.cur[a]],[b,a,Rb,B,ea,inp.cur[b]]]){
    if(!/work|study|read|hobby|tv/.test(cx.action||''))continue;
    const p=.05*(lv(ey,'lonely')/100)*(1+.8*tvOf(Ax,'solitary'))*(1-Math.max(0,Rx.aff)/150)*(1-.7*tvOf(Ax,'caring'));if(lv(ey,'lonely')>=30&&rng()<p)return mk('ignore',x,y)}
  /* 함께 있는 일상: 식사 / 휴식 / 놀이 */
  const ca=inp.cur[a].action,cb=inp.cur[b].action,aff=Math.min(Ra.aff,Rb.aff);
  if(ca==='eat'&&cb==='eat'&&aff>-15&&rng()<.45)return mk('meal',a,b);
  if(/rest|read|tv/.test(ca)&&/rest|read|tv/.test(cb)&&aff>=10&&rng()<.35)return mk('cozy',a,b);
  if(ca==='hobby'&&cb==='hobby'&&aff>=10&&rng()<.25)return mk('play',a,b);
  return null}

/* =====================================================================
   행동 선택 보정 (확정 명령이 아니라 확률 가중치만 조정) — sim.js 가 ctx.mind 로 받아 쓴다
   ===================================================================== */
function hooks(s,now){
  s=migrate(s);
  const lvl=(c,k)=>{const e=s.emo[c];return e&&e.lv[k]?e.lv[k].v:0};
  const R=(a,b)=>s.rel[pk(a,b)];
  const mul=(a,b)=>{      // a 가 b 에게 다가가고 싶은 정도
    const r=R(a,b);if(!r)return 1;const g=agg(s,a,b,now);
    let m=1+r.aff/80;m*=1-Math.min(.6,g.negPow/150);m*=1+Math.min(.5,g.posPow/200);
    if(r.aff>0)m*=1+lvl(a,'lonely')/120;
    const th=s.th[pk(a,b)];if(th&&(th.id==='notice'||th.id==='fun'))m*=1+lvl(a,'excited')/150+lvl(a,'curious')/250;
    if(th&&th.id==='wary')m*=.6;
    return clamp(m,.15,2.5)};

  /* ---- v19 연애: 문장·특별 이벤트 (viv-love.js 가 있을 때만) ---- */
  const LV=()=>root.VivLove||null;
  const roleOf=(c,o)=>{const st=romState(s,c,o);
    if(st.k==='spouse'||st.k==='lover'||st.k==='mutual')return st.k;
    if(st.k==='crush'||st.k==='oneside')return st.from===c?'crush':(romBits(s,c,o).kn?'beloved_a':'beloved_u');
    return null};
  const rvOf=(a,b)=>s.rev[pairKey(a,b)]||null;
  const rctx=(c,o)=>{const rv=rvOf(c,o),l=rv&&rv.last;let rejected=false,rejecting=false;
    if(l&&l.kind==='confess'&&l.outcome==='reject'&&now-l.at<3*DAY){if(l.a===c)rejected=true;else if(l.b===c)rejecting=true}
    const g=agg(s,c,o,now);return {quarrel:g.open,rejected,rejecting}};
  const seed=(c,o,k)=>mulberry(hash(pairKey(c,o)+'|'+k+'|'+c+'|'+Math.floor(now/(15*MIN))));
  const aff=(c,o)=>{const R=s.rel[pk(c,o)];return R?R.aff:0};
  const H={
    /* 둘이서 하는 일반 행동의 지문을 연애 상태에 맞게 바꾼 문장(해당 없으면 null) */
    romLine(c,o,A,B,rng,cname,oname,room,force){const L=LV();if(!L)return null;const role=roleOf(c,o);if(!role)return null;
      const pr=(role==='beloved_u'||role==='beloved_a')?.35:.62;if(!force&&rng()>pr)return null;
      const t=L.stateLine(role,A,B,rng,oname,rctx(c,o));return t?(room?room+'에서 ':'')+t:null},
    romRole:roleOf,
    isCouple(c,o){const st=romState(s,c,o);return st.k==='lover'||st.k==='spouse'},
    romCan(kind,c,o,A,B){
      const st=romState(s,c,o),rv=rvOf(c,o)||{},u=rv.until||{},me=romBits(s,c,o),th=romBits(s,o,c),r=seed(c,o,kind);
      if(rv.sug)return false;
      if(kind==='crush'){if(!(st.k==='crush'||st.k==='oneside'||st.k==='mutual'))return false;if(!me.lv)return false;return r()<.5}
      if(kind==='aff'){if(st.k!=='lover'&&st.k!=='spouse')return false;return r()<.55}
      if(kind==='confess'){
        if(!me.lv||th.kn)return false;if(!(st.k==='crush'||st.k==='mutual'))return false;
        if(now<(u.confess||0))return false;const af=aff(c,o);if(af<15)return false;
        let p=.07*Math.max(.4,Math.min(1.6,af/55));
        p*=1+1.5*Math.max(0,tvOf(A,'bold'));p*=1-.6*Math.max(0,tvOf(A,'shy'));p*=1-.35*Math.max(0,tvOf(A,'tsun'));p*=1-.3*Math.max(0,tvOf(A,'inexpr'));p*=1-.3*Math.max(0,tvOf(A,'aloof'));
        p*=1+.25*Math.max(0,tvOf(A,'playful'))+.3*Math.max(0,tvOf(A,'jealous'))+.25*Math.max(0,tvOf(A,'smug'));
        return r()<Math.min(.3,p)}
      if(kind==='propose'){
        if(st.k!=='lover'||!(me.lv&&me.kn&&th.lv&&th.kn))return false;
        if(now<(u.propose||0))return false;if(aff(c,o)<55||aff(o,c)<45)return false;
        let p=.035*(1+1.2*Math.max(0,tvOf(A,'bold')))*(1-.5*Math.max(0,tvOf(A,'shy')))*(1-.3*Math.max(0,tvOf(A,'aloof')));
        return r()<Math.min(.2,p)}
      return false},
    /* 이벤트를 실제로 시작할 때 결과(수락·거절 등)까지 정해 계획으로 저장하고, 두 사람의 지문을 돌려줌. 결과는 update() 에서 한 번만 반영됨 */
    romPlan(kind,c,o,A,B,cname,oname,room,rng){const L=LV();if(!L)return null;
      const st=romState(s,c,o),rv=romRev(s,c,o),th=romBits(s,o,c);let style='direct',outcome='accept';
      if(kind==='confess'){
        const nerves=tvOf(A,'shy')+.5*tvOf(A,'inexpr')+.3*tvOf(A,'tsun')-.5*tvOf(A,'bold'),r1=rng(),r2=rng(),r3=rng();
        if(nerves>.35&&r1<.45){style='hesitate';outcome='hesitate'}
        else if(nerves>.3&&r1<.6&&r3<.18){style='flee';outcome='flee'}
        else{style=nerves>.5&&r2<.7?'letter':'direct';
          if(th.lv)outcome=rng()<(tvOf(B,'tsun')>=.4?.8:.93)?'accept':'reject';
          else{const af=aff(o,c),soft=(af>=55&&tvOf(B,'caring')>=.4)?.28:(af>=30?.07:.02);outcome=rng()<soft?'accept':'reject'}}}
      else{style='direct';const af=aff(o,c);outcome=rng()<(af>=70?.88:af>=55?.72:.5)?'accept':'decline'}
      const L2=L.eventLines(kind,style,outcome==='accept'?'accept':(outcome==='reject'||outcome==='decline')?outcome:'none',A,B,rng,cname,oname,st.k==='mutual');
      rv.plan={kind,a:c,b:o,style,outcome,at:now,done:false};
      return {a:room?room+'에서 '+L2.a:L2.a,b:room?room+'에서 '+L2.b:L2.b,style,outcome}},
    groupMul(c,g){const L=lvl(c,'lonely'),T=lvl(c,'tired'),B=lvl(c,'bored'),S=lvl(c,'sad'),I=lvl(c,'irritated'),X=lvl(c,'excited'),C=lvl(c,'curious');let m=1;
      if(g==='chat')m=(1+L/60)*(1+X/120)*(1-.4*I/100)*(1-.25*S/100);
      else if(g==='sleep')m=1+T/90;else if(g==='rest')m=1+T/150+S/150;
      else if(g==='work'||g==='study')m=(1-T/200)*(1-.2*S/100);
      else if(g==='hobby'||g==='tv')m=1+B/100;
      else if(g==='out')m=(1+B/150)*(1+C/200)*(1+X/200)*(1-.3*S/100);
      else if(g==='read')m=1+C/200;
      return clamp(m,.5,2.2)},
    partnerMul(c,o){return mul(c,o)},
    /* o 가 c 의 제안(함께하기)을 받아들일 가능성에 곱함: o 가 c 를 어떻게 느끼는지 + o 의 기분 */
    acceptMul(o,c){const r=R(o,c);let m=1;
      if(r){const g=agg(s,o,c,now);m=1+r.aff/120;m*=1-Math.min(.5,g.negPow/180);if(r.type==='hostile')m*=.25;else if(r.type==='uneasy')m*=.6}
      m*=1-.35*lvl(o,'irritated')/100-.25*lvl(o,'sad')/100-.2*lvl(o,'tired')/100;
      return clamp(m,.1,1.6)}};
  const H2=SOC()?SOC().extend(H,s,now,{}):H;const H3=DEC()?DEC().extend(H2,s,now):H2;return CHN()&&CHN().extend?CHN().extend(H3,s,now):H3}


/* =====================================================================
   v19 연애 상태 (짝사랑·맞짝사랑·외사랑·연인·부부)
   - 감정 방향은 독립: R(a→b).lv = a 가 b 를 좋아함, R(a→b).kn = a 가 'b 의 마음'을 앎. 쌍마다 따로 저장(s.rom[a>b])하고, 설정한 쌍에만 적용된다.
   - 이 값이 없으면 기존 관계 유형(연인/부부)에서 읽는다 → 기존 저장 데이터·프로필의 연인 관계가 그대로 유지된다.
   - 고백·프로포즈의 '결과'는 연애 상태를 바로 덮어쓰지 않고, 사용자가 확인하는 '제안'(s.rev[pair].sug)으로만 남긴다.
   ===================================================================== */
const ROM_LABEL={spouse:'부부',lover:'연인',mutual:'맞짝사랑',crush:'짝사랑',oneside:'외사랑',none:'없음'};
const romBits=(s,a,b)=>{const e=s.rom[pk(a,b)];if(e)return {lv:e.lv?1:0,kn:e.kn?1:0};const R=s.rel[pk(a,b)];return R&&(R.type==='lover'||R.type==='spouse')?{lv:1,kn:1}:{lv:0,kn:0}};
function romState(s,a,b){
  s=migrate(s);const x=romBits(s,a,b),y=romBits(s,b,a),Ra=s.rel[pk(a,b)],Rb=s.rel[pk(b,a)];
  if((Ra&&Ra.type==='spouse')||(Rb&&Rb.type==='spouse'))return {k:'spouse',label:ROM_LABEL.spouse,from:null,loves:[a,b]};
  if(x.lv&&y.lv)return (x.kn&&y.kn)?{k:'lover',label:ROM_LABEL.lover,from:null,loves:[a,b]}:{k:'mutual',label:ROM_LABEL.mutual,from:null,loves:[a,b],half:!!(x.kn||y.kn)};
  if(x.lv||y.lv){const l=x.lv?a:b,t=x.lv?b:a,tBits=x.lv?y:x;    // l 이 t 를 좋아함. tBits.kn = t 가 l 의 마음을 아는지
    const known=!!(romBits(s,t,l).kn);return {k:known?'oneside':'crush',label:known?ROM_LABEL.oneside:ROM_LABEL.crush,from:l,to:t,loves:[l]}}
  return {k:'none',label:'',from:null,loves:[]}}
const romRev=(s,a,b)=>{const k=pairKey(a,b);return s.rev[k]||(s.rev[k]={until:{},sug:null,plan:null,last:null})};
/* 사용자가 한 쌍에 연애 상태를 정함. preset: none | crush(a→b 짝사랑) | oneside(a→b 외사랑) | mutual | lover | spouse. 다른 쌍은 건드리지 않음 */
function setRomance(s,a,b,preset,env){
  s=migrate(s);rel(s,a,b,env);rel(s,b,a,env);
  const set=(x,y,lv,kn)=>{s.rom[pk(x,y)]={lv,kn,u:1}};
  const ty=(t,why)=>{for(const [x,y] of [[a,b],[b,a]]){const R=s.rel[pk(x,y)];R.type=t;R.lock='user';R.why=why;R.whyAt=env.now}};
  if(preset==='crush'){set(a,b,1,0);set(b,a,0,0)}
  else if(preset==='oneside'){set(a,b,1,0);set(b,a,0,1)}
  else if(preset==='mutual'){set(a,b,1,0);set(b,a,1,0)}
  else if(preset==='lover'||preset==='spouse'){set(a,b,1,1);set(b,a,1,1);ty(preset,'직접 '+ROM_LABEL[preset]+'(으)로 정함')}
  else {set(a,b,0,0);set(b,a,0,0)}
  if(preset!=='lover'&&preset!=='spouse'){for(const [x,y] of [[a,b],[b,a]]){const R=s.rel[pk(x,y)];if(R.type==='lover'||R.type==='spouse'){R.type='friend';R.lock='user';R.why='연애 상태를 '+ROM_LABEL[preset]+'(으)로 바꾸면서 친구로 정리';R.whyAt=env.now}}}
  const rv=romRev(s,a,b);rv.sug=null;rv.plan=null;
  return romState(s,a,b)}
/* 두 사람 각각의 방향별 값을 직접 정함(세부 설정): who 가 other 를 좋아하는지 / 상대의 마음을 아는지 */
function setRomBits(s,a,b,bitsA,bitsB,env){
  s=migrate(s);rel(s,a,b,env);rel(s,b,a,env);
  s.rom[pk(a,b)]={lv:bitsA.lv?1:0,kn:bitsA.kn?1:0,u:1};s.rom[pk(b,a)]={lv:bitsB.lv?1:0,kn:bitsB.kn?1:0,u:1};
  const st=romState(s,a,b);
  for(const [x,y] of [[a,b],[b,a]]){const R=s.rel[pk(x,y)];const want=st.k==='lover'||st.k==='spouse'?st.k:null;
    if(want&&R.type!==want){R.type=want;R.lock='user';R.why='직접 '+ROM_LABEL[want]+'(으)로 정함';R.whyAt=env.now}
    else if(!want&&(R.type==='lover'||R.type==='spouse')){R.type='friend';R.lock='user';R.why='연애 상태 변경으로 친구로 정리';R.whyAt=env.now}}
  const rv=romRev(s,a,b);rv.sug=null;return st}
/* 고백·프로포즈 결과 제안: 사용자가 '바꾸기'를 누를 때만 적용 */
function romSugApply(s,a,b,env){
  s=migrate(s);const rv=romRev(s,a,b),g=rv.sug;if(!g)return null;
  const from=g.from,to=from===a?b:a;
  if(g.to==='oneside'){setRomance(s,from,to,'oneside',env)}
  else if(g.to==='lover'){setRomance(s,a,b,'lover',env)}
  else if(g.to==='spouse'){setRomance(s,a,b,'spouse',env)}
  else if(g.to==='ended'){setRomance(s,a,b,'none',env)}
  rv.sug=null;rv.until.confess=Math.max(rv.until.confess||0,env.now+3*HOUR);return romState(s,a,b)}
function romSugDismiss(s,a,b,env){s=migrate(s);const rv=romRev(s,a,b);rv.sug=null;rv.until.confess=env.now+3*DAY;rv.until.propose=Math.max(rv.until.propose||0,env.now+3*DAY)}
/* 시뮬레이션이 고른 이벤트 계획이 실제 일어났을 때(update) 결과를 반영 */
function romResolve(s,env,now,log){
  for(const key of Object.keys(s.rev)){const rv=s.rev[key],p=rv&&rv.plan;if(!p||p.done)continue;
    if(now-p.at>6*HOUR){rv.plan=null;continue}
    const a=p.a,b=p.b;if(!env.char(a)||!env.char(b)){rv.plan=null;continue}
    p.done=true;
    const evId=`rom|${key}|${p.kind}|${p.at}`;
    if(p.kind==='confess'){
      const type=p.outcome==='accept'?'confess_ok':p.outcome==='reject'?'confess_no':'confess_fail';
      const r=applyEvent(s,{id:evId,type,a,b,at:now},env);if(r)log.push(r);
      if(p.outcome==='accept')rv.sug={to:'lover',from:a,at:now,text:`${env.name(a)}의 고백을 ${ga(env.name(b))} 받아들였어요. 두 사람을 '연인'으로 바꿀까요?`};
      else if(p.outcome==='reject')rv.sug={to:'oneside',from:a,at:now,text:`${ga(env.name(b))} ${env.name(a)}의 고백을 거절했어요. 이제 ${eun(env.name(b))} ${env.name(a)}의 마음을 알아요. '외사랑'으로 바꿀까요?`};
      else rv.until.confess=now+(p.outcome==='flee'?8:4)*HOUR;
      rv.last={kind:'confess',outcome:p.outcome,a,b,at:now}}
    else if(p.kind==='propose'){
      const type=p.outcome==='accept'?'propose_ok':'propose_no';
      const r=applyEvent(s,{id:evId,type,a,b,at:now},env);if(r)log.push(r);
      if(p.outcome==='accept')rv.sug={to:'spouse',from:a,at:now,text:`${ga(env.name(b))} ${env.name(a)}의 프로포즈를 받아들였어요. 두 사람을 '부부'로 바꿀까요?`};
      else rv.until.propose=now+3*DAY;
      rv.last={kind:'propose',outcome:p.outcome,a,b,at:now}}
  }}

/* =====================================================================
   화면용 조회 · 사용자 설정
   ===================================================================== */
function view(s,cid,now,otherIds,env){
  s=migrate(s);const out={emo:rep(s,cid,now),rels:[]};
  for(const o of otherIds){const R=s.rel[pk(cid,o)];const th=s.th[pk(cid,o)];
    out.rels.push({id:o,type:R?R.type:null,typeName:R?REL_TYPES[R.type].n:'아직 모르는 사이',lock:R?R.lock:null,aff:R?Math.round(R.aff):0,last:R?R.last:0,why:R?R.why:'',whyAt:R?R.whyAt:0,origin:R?R.origin:'',
      th:th?{id:th.id,name:THOUGHTS[th.id],why:th.why,since:th.since}:null,known:!!R,
      rom:(()=>{const st=romState(s,cid,o);const rv=s.rev[pairKey(cid,o)]||{};const me=romBits(s,cid,o),th2=romBits(s,o,cid);return {k:st.k,label:st.label,from:st.from,me,them:th2,sug:rv.sug||null}})()})}
  return out}
function memories(s,a,b,now){
  s=migrate(s);return mems(s,a).filter(m=>m.o===b).map(m=>({id:m.id,t:m.t,type:MEM_TYPES[m.t]?MEM_TYPES[m.t].n:m.t,sum:m.sum,at:m.at,val:m.val,cnt:m.cnt||1,pow:Math.round(effPow(m,now)),pow0:Math.round(m.p0||m.pow),fading:effPow(m,now)<(m.p0||m.pow)*.7,open:!!m.open}))
    .filter(m=>m.pow>=2).sort((x,y)=>y.pow-x.pow||y.at-x.at)}
/* 사용자가 직접 정한 관계 유형은 자동 변화가 건드리지 않음. type=null 이면 다시 자동으로 */
function setRelType(s,a,b,type,env){
  s=migrate(s);const R=rel(s,a,b,env);
  if(type===null||type===''){if(R.lock==='user')R.lock=null;return R}
  if(!REL_TYPES[type])return null;R.type=type;R.lock='user';R.why='직접 '+REL_TYPES[type].n+'(으)로 정함';R.whyAt=env.now;return R}
/* v18.3: 사용자가 친밀도 점수를 직접 정함(−100~+100). 이후 사건에 따라 이 값에서 다시 천천히 변함 */
function setRelAff(s,a,b,val,env){
  s=migrate(s);const R=rel(s,a,b,env);const v=clamp(Math.round(+val||0),-100,100);R.aff=v;R.why='직접 친밀도를 '+(v>0?'+':'')+v+'(으)로 정함';R.whyAt=env.now;return R}
/* 삭제된 캐릭터의 감정·관계·기억 정리 */
function prune(s,alive){
  s=migrate(s);const ok=new Set(alive);
  for(const k of Object.keys(s.emo))if(!ok.has(k))delete s.emo[k];
  for(const k of Object.keys(s.last))if(!ok.has(k))delete s.last[k];
  for(const k of Object.keys(s.mem)){if(!ok.has(k))delete s.mem[k];else s.mem[k]=s.mem[k].filter(m=>ok.has(m.o))}
  for(const k of Object.keys(s.rel)){const [a,b]=k.split('>');if(!ok.has(a)||!ok.has(b)){delete s.rel[k];delete s.th[k];delete s.rom[k]}}
  for(const k of Object.keys(s.rev)){const [a,b]=k.split('|');if(!ok.has(a)||!ok.has(b))delete s.rev[k]}
  if(s.soc&&SOC()){const S=s.soc;const ids=new Set();[...Object.keys(S.know||{}),...Object.keys(S.feel||{}).flatMap(k=>k.split('>'))].forEach(x=>ids.add(x));ids.forEach(x=>{if(!ok.has(x))SOC().forget(s,x)})}
  return s}

/* 특정 캐릭터가 삭제될 때만 그 캐릭터의 감정·관계·기억을 지움(다른 기기·다른 집의 데이터는 건드리지 않음) */
function forget(s,id){s=migrate(s);delete s.emo[id];delete s.last[id];delete s.mem[id];for(const k of Object.keys(s.mem))s.mem[k]=s.mem[k].filter(m=>m.o!==id);for(const k of Object.keys(s.rel)){const [a,b]=k.split('>');if(a===id||b===id){delete s.rel[k];delete s.th[k];delete s.rom[k]}}for(const k of Object.keys(s.rev)){const [a,b]=k.split('|');if(a===id||b===id)delete s.rev[k]}if(s.soc&&SOC())SOC().forget(s,id);return s}

/* ---------- v24 공유 집: 서버와 주고받는 부분(그 집 캐릭터 것만) ---------- */
const inSet=(ids,k,sep)=>{const [a,b]=k.split(sep);return ids.has(a)&&ids.has(b)};
function slice(s,ids){s=migrate(s);ids=new Set(ids);const o={v:1,emo:{},rel:{},th:{},mem:{},seen:[],last:{},rom:{},rev:{}};
  for(const k of Object.keys(s.emo))if(ids.has(k))o.emo[k]=s.emo[k];
  for(const k of Object.keys(s.last))if(ids.has(k))o.last[k]=s.last[k];
  for(const k of Object.keys(s.mem))if(ids.has(k))o.mem[k]=s.mem[k].filter(m=>ids.has(m.o));
  for(const k of Object.keys(s.rel))if(inSet(ids,k,'>')){o.rel[k]=s.rel[k];if(s.th[k])o.th[k]=s.th[k];if(s.rom[k])o.rom[k]=s.rom[k]}
  for(const k of Object.keys(s.rev))if(inSet(ids,k,'|'))o.rev[k]=s.rev[k];
  o.seen=s.seen.slice(-300);
  if(s.soc&&SOC())o.soc=SOC().slice(s.soc,ids);
  return o}
function mergeSlice(s,sl,ids){s=migrate(s);ids=new Set(ids);if(!sl||typeof sl!=='object')return s;
  for(const k of Object.keys(s.emo))if(ids.has(k))delete s.emo[k];
  for(const k of Object.keys(s.last))if(ids.has(k))delete s.last[k];
  for(const k of Object.keys(s.mem))if(ids.has(k))delete s.mem[k];
  for(const k of Object.keys(s.rel))if(inSet(ids,k,'>')){delete s.rel[k];delete s.th[k];delete s.rom[k]}
  for(const k of Object.keys(s.rev))if(inSet(ids,k,'|'))delete s.rev[k];
  Object.assign(s.emo,sl.emo||{});Object.assign(s.last,sl.last||{});Object.assign(s.mem,sl.mem||{});Object.assign(s.rel,sl.rel||{});Object.assign(s.th,sl.th||{});Object.assign(s.rom,sl.rom||{});Object.assign(s.rev,sl.rev||{});
  const seen=new Set(s.seen);(sl.seen||[]).forEach(x=>seen.add(x));s.seen=[...seen].slice(-LIMITS.seen);
  if(sl.soc&&SOC())SOC().mergeSlice(s,sl.soc,ids);
  return s}
const envOf=(chars,A,now,day)=>makeEnv(null,{chars,A,now,day,hour:0});
const api={_i:null,slice,mergeSlice,forget,env:envOf,EMOTIONS,REL_TYPES,THOUGHTS,MEM_TYPES,EVENTS,LIMITS,LEVELS,create,migrate,update,applyEvent,hooks,view,memories,setRelType,setRelAff,romState,setRomance,setRomBits,romSugApply,romSugDismiss,ROM_LABEL,prune,rep,effPow,agg,updateThought,reclassify,ensureEmo,addEmo,rel,initRel,profileRel,tickChar,targets,pk,pairKey,hash,mulberry};
api._i={pk,pairKey,clamp,hash,mulberry,tvOf,agg,addEmo,applyEvent,romState,romBits,romRev,mems,rel,ensureEmo,effPow};

/* ---------- 브라우저 저장(도면·캐릭터·시뮬레이션 키와 별도) ---------- */
if(typeof localStorage!=='undefined'){
  const KEY='viv.mind.v1';let cache=null;
  const load=()=>{if(cache)return cache;try{cache=migrate(JSON.parse(localStorage.getItem(KEY)))}catch(e){cache=create()}return cache};
  api.store={KEY,get:load,set:s=>{cache=s},save:()=>{try{localStorage.setItem(KEY,JSON.stringify(load()))}catch(e){}},reset:()=>{cache=create();try{localStorage.removeItem(KEY)}catch(e){}}}}
root.Mind=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
