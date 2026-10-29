/* 비바리움 관찰 v38 — 세계 자각 (world-awareness) : 믿음 · 반박 · 부조화 · 공유 · V 게이지 · 틈 · 컬링 · 자가 진화
   - 규칙 기반 모듈(AI·외부 호출 없음). 논문(현실성 판단 기준, 믿음 철회, 오류 관련 신호, 인지 부조화, 에이전트 기반 자가 진화)에서 '영감'을 받은
     내 해석이며 논문 모델의 재현이 아니다. 계수는 조정용 값이고 근거 수치가 아니다.
   - 캐릭터마다 '이 세계는 이상하다'는 믿음 b(0~100)를 갖는다. 근거(E)는 네 가지 기준에서 온다 — 변화의 다양성(단조로움)·원인 없는 막힘(인과 일관성)·
     장면의 지속/되풀이(기시감·이질감)·타인의 반응(누군가 사라짐 목격). 반대 근거(평온·즐거움·함께 있음)는 믿음을 철회시킨다.
   - 예측 오류 스파이크(pe)는 빠르게 사라지는 순간 반응, 확인(CRMN 풍) 신호는 믿음이 높았다가 평범한 일상이 이어질 때의 철회로 구현했다 — 모두 내 해석.
   - 부조화: 믿음이 높은데 이 집에 대한 애착(관계·체류)도 크면 긴장이 생기고, 성격별로 합리화/회피/수용/확인 추구 중 하나로 풀린다.
   - V 게이지: 집 전체 평균 믿음(히스테리시스 4단계). 틈(fissure)은 방 단위의 일시적 이질감, 컬링은 오래 비어 있던 방에 들어설 때의 '방금 만들어진 듯한' 느낌.
   - 자가 진화: 하루 한 번 V 를 보고 틈·공유 배율을 한계 안에서 되돌릴 수 있게 조정(기록됨). 화면 효과는 없고 지문·상세창·일지만 바뀐다. */
(function(root){
'use strict';
const M=root.Mind;if(!M||!M._soc||!M._chn)return;
const MIN=60000,HOUR=3600000,DAY=24*HOUR;
const I=M._i,SO=M._soc,{clamp,hash,mulberry,addEmo,ensureEmo,pk}=I;
const AC=s=>{const S=SO.soc(s);return S.awc||(S.awc={})};              // 캐릭터별(서버 동기화 대상)
const AR=s=>{const S=SO.soc(s);return S.awr||(S.awr={v:{g:0,ph:0},fis:[],occ:{},evo:{gain:1,fis:1,sh:1},day:0,sum:0,n:0})};   // 집 전체(리더 쪽)
const SUS={rational:1.15,curious:1.2,anxious:1.35,avoidant:.85,resigned:.6};      // 성격 반응 유형별 '이상함'에 민감한 정도
const PH=[['평온',0],['수군거림',22],['동요',42],['임계',62]];                    // V 게이지 단계(진입 값, 퇴출은 -4)
const AWL={aw_hi:['이 세계가 이상하다는 확신을 억누르는 듯 입술을 깨묾','주위를 둘러보며 "여기가 진짜일까" 중얼거림','벽과 천장을 오래 올려다봄'],
  aw_mid:['익숙한 공간인데 어딘가 맞지 않는다는 듯 고개를 갸웃함','같은 자리를 두 번 확인하고 고개를 젓는 중','알 수 없는 위화감에 손끝으로 물건을 만져 봄'],
  aw_pe:['방금 뭔가 어긋난 것 같아 숨을 멈춤','순간 얼어붙었다가 천천히 숨을 내쉼'],
  aw_dis:['떠날 수도 없고 믿을 수도 없는 마음에 입을 다묾','"착각일 거야"라고 스스로를 달래는 듯함'],
  aw_cull:['방금 막 생겨난 듯한 방 안을 낯설게 둘러봄','오랜만에 들어선 방이 갑자기 나타난 것처럼 느껴져 멈칫함'],
  aw_fis:['벽의 한 부분이 이상하게 느껴져 눈을 떼지 못함','공기가 한 곳에서 일그러진 것처럼 보여 눈을 찌푸림']};
const DIS_T={rationalize:'착각이라고 스스로 설명을 붙여 믿음을 낮춤',avoid:'이상한 생각을 피해 다른 일에 몰두하기로 함',accept:'이상함을 그대로 받아들이고 마음을 가라앉힘',seek:'다른 사람에게 같은 느낌이 있는지 확인하고 싶어함'};
const jong=n=>{n=String(n||'');const c=n.charCodeAt(n.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28};
const ga=n=>n+(jong(n)?'이':'가');
const J=(s,k,a,b,why,now,x)=>SO.jr(s,'aware',a,b,why,now,Object.assign({k},x||{}));

function evid(s,env,inp,id,now,R,st){      // 네 가지 기준에서 오는 근거 0~1
  const S=SO.soc(s),z=(S.apr||{})[id],mono=z?z.mono||0:0,cur=inp.cur[id];
  const U=env.unc(id)||{},un=U.st&&U.st!=='stable'?clamp((U.b||0)/60,0,1):0;
  const dj=(S.dj||{})[id],djr=dj&&dj.at&&now-dj.at<40*MIN?1:0,tr=(S.trapst||{})[id]?1:0;
  const var_=clamp((mono-.4)/.5,0,1),cau=tr?.9:0,per=Math.max(djr*.8,un),res=st.vanish&&now-st.vanish<6*HOUR?1:0;
  const fis=R.fis.some(f=>f.seg===cur.seg&&now<f.at+f.ttl)?.4:0;
  return {var:var_,cau,per,res,fis,E:clamp(.3*var_+.3*cau+.3*per+.35*res+fis,0,1)}}
function disc(s,env,inp,id,now,seg){        // 반대 근거: 즐거움·함께 있음·평온
  const L=k=>{const e=ensureEmo(s,id);return e&&e.lv[k]?e.lv[k].v:0};
  let d=Math.max(L('happy'),L('excited'))/100*.5+L('calm')/100*.2;
  for(const o of inp.chars){if(o.id===id)continue;const c=inp.cur[o.id];if(c&&c.mode==='home'&&c.seg===seg&&c.action!=='sleep'){const R=s.rel[pk(id,o.id)];if(R&&R.aff>20){d+=.25;break}}}
  return clamp(d,0,1)}
function invest(s,id,env,U){let a=0;for(const k of Object.keys(s.rel||{})){if(k.indexOf(id+'>')!==0)continue;a=Math.max(a,(s.rel[k].aff||0)/100)}
  return clamp(a*.7+Math.min(1,((U&&U.days)||0)/14)*.3,0,1)}
function cope(rc,id,now){const r=mulberry(hash('cp|'+id+'|'+Math.floor(now/HOUR)))();
  const w={rational:[.6,.05,.2,.15],curious:[.1,.05,.3,.55],anxious:[.2,.45,.05,.3],avoidant:[.15,.6,.15,.1],resigned:[.1,.2,.65,.05]}[rc]||[.25,.25,.25,.25];
  const K=['rationalize','avoid','accept','seek'];let a=r;for(let i=0;i<4;i++){a-=w[i];if(a<=0)return K[i]}return 'accept'}

function step(s,inp,env,log){
  const R=AR(s),C=AC(s),now=env.now,emit=M._chn.emit;
  const home=inp.chars.map(c=>c.id).filter(id=>inp.cur[id]&&inp.cur[id].mode==='home'&&inp.cur[id].seg!=null);
  const vanished=[];
  for(const id of home){const st=C[id]||(C[id]={b:0,pe:0,pa:0,dis:0,cp:null,cpAt:0,t:now,seg:null,E:0,hi:0});
    const U=env.unc(id);if(U){st.seen=1;st.gone=0}else if(st.seen&&!st.gone){st.gone=1;vanished.push(id)}}
  /* 사라짐 목격 — 같은 방에 있던 다른 캐릭터에게 '타인의 반응' 근거 */
  for(const v of vanished)for(const o of home){if(o===v)continue;const a=inp.cur[o],b=inp.cur[v];if(a&&b&&a.seg===b.seg){const so=C[o];so.vanish=now;so.pe=1;so.pa=now;J(s,'vanish',o,v,`${env.name(o)}: ${ga(env.name(v))} 눈앞에서 사라지는 것을 목격함`,now,{})}}
  let sum=0,n=0;
  for(const id of home){const st=C[id],cur=inp.cur[id];if(st.gone)continue;
    const dt=clamp((now-(st.t||now))/HOUR,0,.5);st.t=now;
    if(cur.action==='sleep'){st.b=Math.max(0,st.b-dt*.8);st.seg=cur.seg;continue}
    const U=env.unc(id)||{},rc=U.rc||'resigned',sus=SUS[rc]||.9,A=env.A(id);
    const ev=evid(s,env,inp,id,now,R,st),d=disc(s,env,inp,id,now,cur.seg),nm=env.name(id);
    /* 컬링: 오래 비어 있던 방에 들어서면 '방금 만들어진 듯한' 느낌(방이 바뀐 순간에만) */
    if(st.seg!=null&&st.seg!==cur.seg){const last=R.occ[cur.seg];if(R.v.ph>=1&&(!last||now-last>3*HOUR)&&mulberry(hash('cu|'+id+'|'+Math.floor(now/(10*MIN))))()<.45){st.cull=now;st.pe=Math.max(st.pe,.6);st.pa=now;
      if(!st.lc||now-st.lc>6*HOUR){st.lc=now;J(s,'cull',id,null,`${nm}: 오래 비어 있던 방에 들어서자 방금 생겨난 듯한 낯섦을 느낌`,now,{})}}}
    st.seg=cur.seg;R.occ[cur.seg]=now;
    /* 예측 오류 스파이크(ERN 풍): 근거가 갑자기 커지면 pe, 빠르게 감쇠 */
    const jump=Math.max(0,ev.E-(st.E||0));st.E=ev.E;if(jump>.35){st.pe=Math.max(st.pe,clamp(jump,0,1));st.pa=now}
    st.pe=Math.max(0,st.pe-dt*3);
    if(st.pe>.3)emit(id,'anxious',st.pe*2.2,'어긋난 느낌이 순간 스쳐서',now,A);
    /* 믿음 갱신 */
    const gain=11*sus*R.evo.gain,rate=ev.E*gain*dt*(1-st.b/130),fade=(2+d*14*(rc==='rational'?1.2:1))*dt;
    const prev=st.b;st.b=clamp(st.b+rate-fade*(ev.E>.25?.35:1),0,100);
    /* 확인(CRMN 풍) — 믿음이 높았다가 평범한 날이 이어지면 철회 */
    if(prev>=50&&st.b<prev&&d>.5&&(!st.rt||now-st.rt>8*HOUR)){st.rt=now;J(s,'retract',id,null,`${nm}: 평범한 하루가 이어지자 '이 세계가 이상하다'는 생각을 거둬들임`,now,{b:Math.round(st.b)})}
    for(const th of [40,70]){if(prev<th&&st.b>=th&&(!st['t'+th]||now-st['t'+th]>12*HOUR)){st['t'+th]=now;J(s,'belief',id,null,`${nm}: ${th===40?'이 세계가 어딘가 이상하다는 의심이 커짐':'이 세계가 진짜가 아닐지 모른다고 거의 확신하게 됨'}`,now,{b:Math.round(st.b)})}}
    /* 인지 부조화(Festinger 풍): 믿음 × 애착 */
    st.dis=clamp(st.b/100*invest(s,id,env,U)*1.5,0,1);
    if(st.dis>.4&&(!st.cpAt||now-st.cpAt>10*HOUR)){st.cp=cope(rc,id,now);st.cpAt=now;J(s,'cope',id,null,`${nm}: ${DIS_T[st.cp]}`,now,{cp:st.cp,dis:Math.round(st.dis*100)/100});
      if(st.cp==='rationalize')st.b=Math.max(0,st.b-8);else if(st.cp==='accept'){st.b=Math.max(0,st.b-4);emit(id,'calm',3,'이상함을 받아들이고 나니 마음이 가라앉아서',now,A)}}
    if(st.dis>.4&&st.cp!=='accept')emit(id,'anxious',st.dis*1.4,'믿는 것과 지켜 온 것 사이에서 마음이 팽팽해서',now,A);
    sum+=st.b;n++}
  /* 가까운 사이의 믿음 공유 — 30분에 한 번, 같은 방·친밀·신뢰할수록. 회의적인 상대는 오히려 믿음을 낮춘다 */
  const sl=Math.floor(now/(30*MIN));
  for(const a of home)for(const b of home){if(a===b)continue;const ca=inp.cur[a],cb=inp.cur[b],sa=C[a],sb=C[b];
    if(!sa||!sb||ca.seg!==cb.seg||ca.action==='sleep'||cb.action==='sleep'||sa.b<45||sa.gone||sb.gone)continue;
    const f=SO.feelOf(s,b,a),tie=clamp((f.tr||0)/100+Math.max(0,(s.rel[pk(b,a)]||{}).aff||0)/200,0,1);if(tie<.35)continue;
    const key=a+'>'+b;if(sa['sh'+b]===sl)continue;sa['sh'+b]=sl;
    if(mulberry(hash('sh|'+key+'|'+sl))()>.5*R.evo.sh)continue;
    const rb=(env.unc(b)||{}).rc||'resigned',skeptic=rb==='rational'&&sb.b<25;
    if(skeptic){sa.b=Math.max(0,sa.b-3);J(s,'share_no',a,b,`${ga(env.name(a))} 이상한 느낌을 털어놓았지만 ${env.name(b)}는 대수롭지 않게 넘김`,now,{});continue}
    const mv=(sa.b-sb.b)*.22*tie*(SUS[rb]||.9);if(mv>=1.5){const quiet=sa['jl'+b]&&now-sa['jl'+b]<6*HOUR;sb.b=clamp(sb.b+mv,0,100);sb.pe=Math.max(sb.pe,.3);sb.pa=now;sa.dis=Math.max(0,sa.dis-.05);
      if(!quiet){sa['jl'+b]=now;J(s,'share',a,b,`${ga(env.name(a))} ${env.name(b)}에게 이 세계가 이상하게 느껴진다고 털어놓음`,now,{mv:Math.round(mv)})}}}
  /* V 게이지(집 전체 평균, 히스테리시스) */
  const g=n?sum/n:0;R.v.g=Math.round(g*10)/10;let ph=R.v.ph;
  while(ph<3&&g>=PH[ph+1][1]+2)ph++;while(ph>0&&g<PH[ph][1]-4)ph--;
  if(ph!==R.v.ph){if(n)J(s,'vgauge',null,null,`집 전체의 분위기가 '${PH[R.v.ph][0]}'에서 '${PH[ph][0]}'(으)로 바뀜`,now,{g:R.v.g});R.v.ph=ph}
  /* 틈: 방 단위 일시적 이질감. V 단계가 높을수록 자주, 한꺼번에 3개까지 */
  R.fis=R.fis.filter(f=>now<f.at+f.ttl);
  if(ph>=1&&R.fis.length<3&&home.length){const r=mulberry(hash('fs|'+Math.floor(now/(20*MIN))))();
    if(r<.012*ph*R.evo.fis){const who=home[Math.floor(r*1e6)%home.length],seg=inp.cur[who].seg;
      if(!R.fis.some(f=>f.seg===seg)){R.fis.push({seg,at:now,ttl:(2+ph)*HOUR});J(s,'fissure',who,null,`${env.name(who)}${jong(env.name(who))?'이':'가'} 있는 방 한켠에 설명하기 어려운 어긋남(틈)이 생김`,now,{seg,ph})}}}
  /* 자가 진화: 하루 한 번, V 의 하루 평균에 따라 배율을 한계 안에서 되돌릴 수 있게 조정 */
  const dn=Math.floor(now/DAY);R.sum+=g;R.n++;
  if(!R.day)R.day=dn;else if(dn!==R.day){const avg=R.sum/Math.max(1,R.n),e=R.evo,old=JSON.stringify(e);
    if(avg>=55){e.fis=Math.max(.5,e.fis*.85);e.sh=Math.max(.5,e.sh*.85);e.gain=Math.max(.7,e.gain*.95)}      // 너무 달아오르면 식힘
    else if(avg<12){e.fis=Math.min(1.6,e.fis*1.1);e.gain=Math.min(1.3,e.gain*1.03)}                              // 너무 잠잠하면 조금 흔듦
    else{for(const k in e)e[k]+= (1-e[k])*.15}                                                                    // 중간이면 기본값 쪽으로 복귀
    for(const k in e)e[k]=Math.round(e[k]*1000)/1000;
    const lg=R.lg||(R.lg={fis:1,sh:1,gain:1});if(Math.max(...Object.keys(e).map(k=>Math.abs(e[k]-lg[k])))>=.15){R.lg=Object.assign({},e);J(s,'evolve',null,null,`하루 평균 V ${Math.round(avg)} — 틈 ${e.fis}·공유 ${e.sh}·민감도 ${e.gain} 로 스스로 조정됨`,now,{avg:Math.round(avg)})}
    R.day=dn;R.sum=0;R.n=0}}

/* 지문용 상태: [키,세기] — chain.stateOf 가 합친다 */
function states(s,id,now){const st=(AC(s))[id];if(!st)return [];const o=[],R=AR(s),cur=(SO.soc(s).chn||{}).pos&&SO.soc(s).chn.pos[id];
  if(st.b>=60)o.push(['aw_hi',Math.min(78,40+st.b*.45)]);else if(st.b>=38)o.push(['aw_mid',Math.min(70,38+st.b*.5)]);
  if(st.pe>.3&&now-st.pa<20*MIN)o.push(['aw_pe',55+st.pe*15]);
  if(st.dis>.4&&st.cp&&st.cp!=='accept'&&now-st.cpAt<6*HOUR)o.push(['aw_dis',50+st.dis*20]);
  if(st.cull&&now-st.cull<20*MIN)o.push(['aw_cull',58]);
  if(cur&&R.fis.some(f=>f.seg===cur.seg&&now<f.at+f.ttl)&&st.b>=25)o.push(['aw_fis',54]);
  return o}
/* 상세창용 */
function view(s,id,now){const st=(AC(s))[id],R=AR(s);if(!st)return null;
  return {b:Math.round(st.b),dis:Math.round(st.dis*100)/100,cp:st.cp,v:R.v.g,ph:R.v.ph,phn:PH[R.v.ph][0],fis:R.fis.length,evo:R.evo}}
M._awr={step,states,view,lines:AWL,PH,AC,AR};
})(typeof window!=='undefined'?window:globalThis);
