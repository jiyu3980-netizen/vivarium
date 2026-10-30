/* =====================================================================
   연애 상태의 영향층 (viv-romfx.js)
   연애 상태(짝사랑·외사랑·맞짝사랑·연인·부부)가 '성격'과 맞물려 여섯 곳에 영향을 준다. 규칙만 쓰고 외부 AI는 쓰지 않는다.
     1) 행동 방향   : 다가갈지·망설일지(decide), 함께하는 행동의 선택 배율(partnerMul)
     2) 느끼는 감정 : 곁에 있을 때 설렘·편안함, 떨어져 있을 때 허전함·생각남, 질투(성격 'jealous')
     3) 친밀도      : 곁에 있는 시간이 쌓이면 마음을 둔 쪽의 친밀도가 천천히 오름(하루 상한 안에서)
     4) 상호작용    : 상대가 나를 좋아하면 제안을 받아들일 확률이 오르고, 츤데레·무심한 성격은 좋아해도 덜 받아 줌
     5) 기억        : 설렌 기억·보고 싶었던 기억·질투한 기억·포근했던 기억이 쌓임(기존 기억 규칙 그대로 겹침·감쇠)
     6) 관찰일지    : 눈에 띄는 마음의 움직임을 사건(rom_*)으로 남김 → 서버 일지가 그날의 한 문장 후보로 고름
   방향이 있다: A 가 B 를 좋아해도 B 는 A 를 좋아하지 않을 수 있다. '마음을 둔 쪽'과 '모르는 쪽'은 서로 다르게 영향을 받는다.
   ===================================================================== */
(function(root){'use strict';
const Mind=root.Mind;if(!Mind||!Mind._i)return;
const I=Mind._i,{pk,clamp,hash,mulberry,tvOf,romState,romBits,addEmo}=I;
const MIN=60000,HOUR=3600000;
/* 상태별 마음의 무게(0~1) */
const W={crush:.75,oneside:.7,mutual:.95,lover:1,spouse:.9};
Object.assign(Mind.MEM_TYPES,{
  rom_flutter:{n:'곁에 있어 가슴이 두근댄 기억',val:1,half:96,win:6},
  rom_miss:{n:'함께 있고 싶어 보고 싶었던 기억',val:1,half:72,win:8},
  rom_warm:{n:'곁에서 마음이 포근해진 기억',val:1,half:96,win:8},
  rom_jealous:{n:'상대 곁의 다른 사람이 신경 쓰였던 기억',val:-1,half:72,win:8}});
/* 성격에서 나오는 연애 태도 */
const NEU={shy:0,guard:0,jealous:0,expr:.5,cling:.2};
const sOf=(s,c)=>(s.rfx&&s.rfx.sty&&s.rfx.sty[c])||NEU;   // 시뮬레이션 규칙(함께하기·받아들임)은 분석 결과를 직접 못 받으므로 갱신 때 저장해 둔 성격 태도를 씀
const keep=(s,c,sty)=>{const rf=s.rfx||(s.rfx={t:{},j:{},sty:{}});(rf.sty||(rf.sty={}))[c]={shy:+sty.shy.toFixed(2),guard:+sty.guard.toFixed(2),jealous:+sty.jealous.toFixed(2),expr:+sty.expr.toFixed(2),cling:+sty.cling.toFixed(2)}};
function style(A){const t=k=>tvOf(A,k),guard=clamp(t('tsun')+.6*t('aloof')+.3*t('cynic'),0,1.4);
  return {shy:t('shy'),guard,jealous:t('jealous'),
    expr:clamp(.45+.5*t('bold')+.3*t('playful')+.25*t('caring')-.5*t('shy')-.4*t('inexpr')-.3*guard,0,1),   // 마음을 겉으로 드러내는 정도
    cling:clamp(.4*t('jealous')+.35*t('caring')+.15*t('playful')-.5*t('aloof'),0,1)}}
/* c 가 마음을 둔 상대들 [{o,k,w,secret}] — 맞짝사랑·연인·부부는 서로에게, 짝사랑·외사랑은 마음을 둔 쪽에게만 */
function loved(s,c,others){const out=[];for(const o of others){if(o===c)continue;let st;try{st=romState(s,c,o)}catch(e){continue}
  if(!W[st.k])continue;const b=romBits(s,c,o);if(!b.lv)continue;out.push({o,k:st.k,w:W[st.k],secret:st.k==='crush'||st.k==='oneside'})}return out}
/* ---- 1·4) 행동 방향·상호작용: 질의 ---- */
/* decide 가 쓰는 '다가가기' 후보 보정: 연인·부부·맞짝사랑은 성격에 따라 다가감이 달라지고, 짝사랑은 소심할수록 망설임 */
function dec(s,c,o,pc,lonely){let st;try{st=romState(s,c,o)}catch(e){return null}
  if(!W[st.k]||!romBits(s,c,o).lv)return null;const sty=sOf(s,c),w=W[st.k];
  if(st.k==='lover'||st.k==='spouse'||st.k==='mutual'){
    return {p:'affiliate',g:clamp(.18+.3*lonely+.25*sty.cling+.15*sty.expr,0,1)*w,c:clamp(sty.guard*.25+(st.k==='mutual'?sty.shy*.4:0),0,1)}}
  return null}
/* ---- 2) 감정 ---- */
function emo(s,c,env,loc,T,C){if(loc.mode==='out'||loc.action==='sleep')return;const A=env.A(c.id),sty=style(A),nm=env.name;keep(s,c.id,sty);
  const room=loc.sameRoom||[],cand=env.all||room;const L=loved(s,c.id,cand);if(!L.length)return;
  let hap=0,exc=0,anx=0,cal=0,lon=0,sad=0,irr=0,why={};
  for(const x of L){const here=room.includes(x.o),w=x.w;
    if(here){
      hap+=9*w;exc+=(x.secret?14:9)*w*(.55+.45*(1-Math.min(1,sty.guard)));cal+=(x.k==='lover'||x.k==='spouse')?9*w:0;
      if(x.secret)anx+=16*w*sty.shy+6*w*(1-sty.expr);else if(x.k==='mutual')anx+=8*w*sty.shy;
      why.h=`${nm(x.o)} 곁에 있어서`;why.e=x.secret?`${nm(x.o)} 곁에 있으니 가슴이 두근거려서`:`${nm(x.o)}와(과) 함께라서 마음이 들떠서`;why.a=`${nm(x.o)} 앞에서 괜히 긴장돼서`;
      /* 질투: 마음 둔 상대가 제3자와 가까이 있고, 둘이 연인·부부가 아닐 때 */
      for(const y of room){if(y===x.o)continue;const R=s.rel[pk(x.o,y)];let st2='none';try{st2=romState(s,x.o,y).k}catch(e){}
        if(R&&R.aff>=30&&st2!=='lover'&&st2!=='spouse'||(st2==='lover'||st2==='spouse')&&!(x.k==='lover'||x.k==='spouse')){
          const j=sty.jealous*w;if(j>.15){irr+=14*j;anx+=10*j;why.i=why.a2=`${nm(x.o)}${/[가-힣]/.test(nm(x.o).slice(-1))?'가':'이'} ${nm(y)}와(과) 가까이 있는 게 신경 쓰여서`}}}
    }else{
      /* 떨어져 있을 때: 연인·부부는 허전하고, 마음 둔 사람은 문득 생각이 난다(시각마다 달라짐, 같은 시각엔 같은 결과) */
      const hr=Math.floor((env.now||0)/HOUR),think=hash(c.id+x.o+hr)%3===0;
      if(x.k==='lover'||x.k==='spouse'||x.k==='mutual'){lon+=(5+10*sty.cling)*w;why.l=`${nm(x.o)}${/[가-힣]/.test(nm(x.o).slice(-1))?'가':'이'} 곁에 없어서 허전해서`}
      if(think){exc+=7*w*(.6+.4*sty.expr);why.e2=`문득 ${nm(x.o)} 생각이 나서`;if(x.secret){sad+=3*w*(1-sty.expr)}}}}
  const T0=T;
  T0.happy+=Math.min(22,hap);T0.excited+=Math.min(34,exc);T0.anxious+=Math.min(30,anx);T0.calm+=Math.min(18,cal);T0.lonely+=Math.min(30,lon);T0.sad+=Math.min(14,sad);T0.irritated+=Math.min(24,irr);
  if(hap&&why.h&&T0.happy>=22)C.happy=why.h;if(exc&&(why.e||why.e2))C.excited=why.e||why.e2;if(anx&&(why.a2||why.a))C.anxious=why.a2||why.a;if(lon&&why.l)C.lonely=why.l;if(irr&&why.i)C.irritated=why.i;if(sad&&why.e2)C.sad=why.e2.replace('생각이 나서','생각이 나지만 말하지 못해서')}
/* ---- 3·5·6) 친밀도·기억·일지: 갱신 때마다 ---- */
const MEMSPEC={flutter:{t:'rom_flutter',sum:'{p}와(과) 같은 곳에 있어 가슴이 두근댔음',p:34},miss:{t:'rom_miss',sum:'{p}가 곁에 없어 보고 싶었음',p:30},warm:{t:'rom_warm',sum:'{p} 곁에서 마음이 포근해졌음',p:28},jealous:{t:'rom_jealous',sum:'{p} 곁의 다른 사람이 신경 쓰였음',p:32}};
const JR={flutter:'가 {p} 곁에서 괜히 마음이 두근거렸다',miss:'가 {p}와(과) 떨어져 있는 시간이 길게 느껴졌다',warm:'가 {p} 곁에서 마음이 포근해졌다',jealous:'가 {p} 곁의 다른 사람이 마음에 걸렸다'};
function step(s,inp,env,log,sameRoom){const SO=Mind._soc;const rf=s.rfx||(s.rfx={t:{},j:{},sty:{}}),now=inp.now,slot=Math.floor(now/(15*MIN));
  const home=inp.chars.filter(c=>inp.cur[c.id]&&inp.cur[c.id].mode==='home'&&inp.cur[c.id].action!=='sleep').map(c=>c.id),ids=home;
  for(const c of home){const A=env.A(c),sty=style(A),room=sameRoom(c);keep(s,c,sty);
    const L=loved(s,c,inp.chars.map(x=>x.id));
    for(const x of L){const key=c+'>'+x.o,here=room.includes(x.o),last=rf.t[key];
      if(last!=null&&now-last<15*MIN)continue;rf.t[key]=now;
      const rng=mulberry(hash(key+'|rfx|'+slot)),dt=Math.min(60,last==null?15:(now-last)/MIN)/15;
      const R=s.rel[pk(c,x.o)];
      /* 3) 친밀도: 함께 있는 동안 마음을 둔 쪽의 친밀도가 천천히 오름. 표현이 서툴러도(소심·무심) 마음은 쌓이지만 느리다 */
      if(R&&here&&R.aff<85){const rate=(x.secret?.12:.18)*x.w*(.6+.6*sty.expr)*(1-.4*Math.min(1,sty.guard));
        if(R.dayKey!==env.day){R.dayKey=env.day;R.dayPos=0;R.dayNeg=0}
        const lim=Math.max(0,(Mind.LIMITS.dayPos||8)-R.dayPos),d=Math.min(lim,rate*dt);if(d>0){R.aff=clamp(R.aff+d,-100,100);R.dayPos+=d}}
      /* 5·6) 기억과 일지 */
      let kind=null;
      if(here){
        if(x.secret&&rng()<.2*x.w*(.7+.5*sty.shy))kind='flutter';
        else if(!x.secret&&(x.k==='lover'||x.k==='spouse'||x.k==='mutual')&&rng()<.16*x.w)kind=sty.shy>.5&&x.k==='mutual'?'flutter':'warm';
        for(const y of room){if(y===x.o||kind==='jealous')continue;const R2=s.rel[pk(x.o,y)];let st2='none';try{st2=romState(s,x.o,y).k}catch(e){}
          if(R2&&R2.aff>=30&&st2!=='lover'&&st2!=='spouse'&&sty.jealous*x.w>.25&&rng()<.35)kind='jealous'}
      }else if((x.k==='lover'||x.k==='spouse'||x.k==='mutual')&&rng()<.1*x.w*(.6+.8*sty.cling))kind='miss';
      if(!kind)continue;
      const ev={id:`rfx|${key}|${slot}`,at:now,a:c,b:x.o},spec=MEMSPEC[kind];
      try{I.addMem(s,c,x.o,spec,ev,env)}catch(e){}
      /* 일지에는 눈에 띄는 것만: 같은 마음은 6시간에 한 번 */
      const jk=key+'|'+kind;if(SO&&SO.jr&&(rf.j[jk]==null||now-rf.j[jk]>6*HOUR)){rf.j[jk]=now;SO.jr(s,'rom_'+kind,c,x.o,env.name(c)+JR[kind].replace('{p}',env.name(x.o)),now,{k:x.k})}}}
  const ks=Object.keys(rf.t);if(ks.length>300){ks.sort((a,b)=>rf.t[a]-rf.t[b]).slice(0,100).forEach(k=>delete rf.t[k])}
  const js=Object.keys(rf.j);if(js.length>300){js.sort((a,b)=>rf.j[a]-rf.j[b]).slice(0,100).forEach(k=>delete rf.j[k])}}
/* ---- 1·4) 함께하는 행동·받아들임 배율 ---- */
function extend(H,s,now){
  const basePM=H.partnerMul,baseAM=H.acceptMul;
  H.partnerMul=(c,o)=>{let m=basePM(c,o);const b=romBits(s,c,o);if(b.lv){let k='none';try{k=romState(s,c,o).k}catch(e){}
      if(W[k]){const sty=sOf(s,c);m*=1+.35*W[k]*(.55+.8*sty.expr)*(k==='crush'||k==='oneside'?(1-.55*sty.shy):1)}}return clamp(m,.08,4)};
  H.acceptMul=(o,c)=>{let m=baseAM(o,c);const b=romBits(s,o,c);let k='none';try{k=romState(s,o,c).k}catch(e){}
    if(b.lv&&W[k]&&k!=='crush'&&k!=='oneside'){const sty=sOf(s,o);m*=1+.25*W[k]-.18*Math.min(1,sty.guard)}   // 좋아하면 받아 주지만, 츤데레·무심한 성격은 덜 드러냄
    return clamp(m,.05,1.8)};
  return H}
Mind._rfx={style,loved,dec,emo,step,extend,W};
})(typeof window!=='undefined'?window:globalThis);
