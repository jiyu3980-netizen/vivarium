/* =====================================================================
   v19 연애 상호작용 문장 (viv-love.js)
   - 연애 상태(짝사랑·맞짝사랑·외사랑·연인·부부)와 '복수 성격'을 함께 읽어 행동 지문을 만든다.
   - 외부 AI API 는 쓰지 않는다. 성격별 행동 조각(원자 문장)을 규칙으로 조합하는 템플릿 시스템이다.
   - 상태·쿨다운·결과 저장은 viv-mind.js 가 맡고, 이 파일은 '어떤 문장을 보여 줄지'만 정한다(저장 없음).
   ===================================================================== */
(function(root){
'use strict';
const hasJong=s=>{const c=String(s).trim().slice(-1).charCodeAt(0);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0};
const J={eul:n=>n+(hasJong(n)?'을':'를'),ga:n=>n+(hasJong(n)?'이':'가'),wa:n=>n+(hasJong(n)?'과':'와'),eun:n=>n+(hasJong(n)?'은':'는')};
/* 문장 안의 {p} 표기: {p}를 {p}가 {p}와 {p}는 은 조사에 맞게, 나머지({p}에게 {p}의 …)는 이름만 */
const fill=(t,p)=>String(t).replace(/\{p\}(를|가|와|는)/g,(m,j)=>({'를':J.eul,'가':J.ga,'와':J.wa,'는':J.eun})[j](p)).replace(/\{p\}/g,p);
const tv=(A,k)=>(A&&A.traits&&A.traits[k])||0;
const TR=['shy','harsh','tsun','angry','negative','cynic','caring','bold','playful','jealous','aloof','smug','inexpr'];
const pick=(r,a)=>a[Math.floor(r()*a.length)];
/* 이 캐릭터의 성격 중 뚜렷한 것들(강한 순). 여러 개면 함께 반영된다 */
function active(A){return TR.map(k=>[k,tv(A,k)]).filter(x=>x[1]>=.4).sort((a,b)=>b[1]-a[1]).map(x=>x[0])}
/* '…하는 중' → '…하며' (뒤에 다른 행동 조각을 이어 붙이기 위한 연결형) */
const conn=t=>t.replace(/는 중$/,'며');

/* ---------- 역할별 행동 조각 ---------- */
const BANK={
 /* 짝사랑·외사랑: 내가 상대를 좋아함 (상대는 모르거나, 알면서 친구로만 대함) */
 crush:{base:['{p}에게 말을 걸까 말까 고민하며 주변을 맴도는 중','{p}를 몰래 힐끔 쳐다보는 중','{p}의 근처에서 괜히 서성이는 중','{p}가 웃을 때마다 슬며시 따라 웃는 중'],
  shy:['{p} 앞에서 얼굴이 붉어져 말을 더듬는 중','말을 걸려다 머뭇거리다 돌아서는 중','{p}와 눈이 마주치자 황급히 시선을 피하는 중','{p}에게 다가갔다가 도망치듯 물러서는 중'],
  harsh:['{p}에게 괜히 퉁명스럽게 말을 던지는 중','{p}가 다정하게 대하자 당황하면서도 싫은 척하는 중','{p}가 걱정되면서도 걱정된다는 말은 못 하고 툴툴대는 중'],
  tsun:['{p}에게 관심 없는 척하면서 자꾸 곁눈질하는 중','{p}가 챙겨 주자 아무렇지 않은 척 고개를 돌리는 중','좋아하는 마음을 감추려고 괜히 딴소리를 하는 중'],
  angry:['{p} 앞에서 괜히 짜증을 내다가 곧바로 후회하는 중','{p}가 다른 사람과 웃고 있자 속이 부글거리는 중'],
  negative:['{p}와 있는 게 편하면서도 괜히 투덜거리는 중','{p}가 잘해 줘도 어차피 안 될 거라며 혼자 한숨을 쉬는 중'],
  cynic:['{p}를 보며 냉소적인 말을 하면서도 눈은 떼지 못하는 중','"어차피 소용없다"고 중얼거리면서도 {p}의 곁을 떠나지 못하는 중'],
  caring:['{p}를 위해 조용히 따뜻한 차를 챙겨 두는 중','{p}가 편하도록 말없이 주변을 정리해 주는 중','{p}가 피곤해 보여 몰래 간식을 놓아 두는 중'],
  bold:['{p}에게 먼저 다가가 말을 걸며 곁에 앉는 중','{p}와 함께 있을 핑계를 적극적으로 만드는 중','{p}에게 같이 있자고 거침없이 제안하는 중'],
  playful:['{p}의 관심을 끌려고 장난을 치는 중','{p}를 놀리듯 말을 걸며 반응을 살피는 중'],
  jealous:['{p}가 다른 사람과 친하게 지내는 모습이 신경 쓰이지만 아무렇지 않은 척하는 중','{p} 곁에 있는 사람을 은근히 견제하는 중'],
  aloof:['{p}에게 관심 없는 듯 무심하게 곁을 지나가는 중','{p}의 이야기를 듣지 않는 척하면서 다 듣고 있는 중'],
  smug:['{p}에게 능글맞게 농담을 던지며 반응을 떠보는 중','{p}에게 슬쩍 윙크를 하다가 스스로 민망해하는 중'],
  inexpr:['{p}에게 하고 싶은 말을 고르다가 엉뚱한 이야기를 꺼내는 중','{p}를 향한 마음을 어떻게 전할지 몰라 입술만 달싹이는 중']},
 /* 맞짝사랑: 서로 좋아하지만 둘 다 상대의 마음을 모름 */
 mutual:{base:['{p}를 의식하며 어색하게 같은 공간에 머무는 중','{p}와 눈이 마주칠 때마다 서로 시선을 피하는 중','{p}가 자신을 어떻게 생각하는지 궁금해하는 중'],
  shy:['{p}가 말을 걸어 주길 바라면서도 먼저 말을 못 하는 중'],harsh:['{p}에게 괜히 날카롭게 굴었다가 속으로 후회하는 중'],tsun:['{p}에게 아무 마음도 없는 척하며 눈치만 보는 중'],
  bold:['{p}에게 슬쩍 마음을 떠보는 말을 던지는 중'],caring:['{p}가 좋아하는 것을 슬쩍 기억해 두는 중'],playful:['{p}에게 장난을 걸며 속마음을 숨기는 중'],jealous:['{p}가 다른 사람과 웃는 모습에 마음이 쓰이는 중']},
 /* 연인: 서로 좋아하고 서로 마음을 앎 */
 lover:{base:['{p}와 손을 잡고 나란히 앉아 있는 중','{p}의 어깨에 기대어 쉬는 중','{p}와 눈을 마주치며 미소 짓는 중'],
  shy:['{p}의 손을 잡고 싶지만 부끄러워 소매만 만지작거리는 중'],harsh:['{p}에게 퉁명스러운 말을 하면서도 곁에서 떨어지지 않는 중'],
  tsun:['{p}의 애정 표현에 투덜대면서도 은근히 기뻐하는 중'],playful:['{p}의 진지한 애정 표현을 농담으로 돌리는 중','{p}가 먼저 애정을 표현하자 놀리다가도 은근히 기뻐하는 중'],
  cynic:['세상이 별로라는 이야기를 하면서도 {p}가 힘들어하자 곁에 가만히 머무는 중'],negative:['{p}의 걱정을 투덜대며 들어 주다가 조용히 곁을 지키는 중'],
  caring:['{p}의 컨디션을 살피며 담요를 덮어 주는 중'],bold:['{p}에게 먼저 다가가 팔짱을 끼고 걷는 중'],
  jealous:['{p} 곁에 바짝 붙어 앉아 다른 사람이 끼어들지 못하게 하는 중'],aloof:['말은 없지만 {p}의 곁에 앉아 손을 놓지 않는 중'],
  smug:['{p}에게 능글맞게 애정 섞인 농담을 건네는 중'],inexpr:['{p}에게 애정을 말로 못 하고 대신 간식을 건네는 중'],
  angry:['{p}와 사소한 일로 티격태격하다가 금세 웃음을 터뜨리는 중']},
 /* 부부 */
 spouse:{base:['{p}와 하루 있었던 일을 나누며 편안하게 쉬는 중','{p}의 곁에서 말없이 편안하게 시간을 보내는 중','{p}에게 오늘 하루가 어땠는지 묻는 중'],
  caring:['{p}를 위해 따뜻한 음료를 준비해 주는 중'],playful:['{p}의 볼을 장난스럽게 꼬집으며 웃는 중'],aloof:['대화는 짧지만 {p}의 옆자리를 늘 비워 두는 중'],
  tsun:['{p}에게 고맙다는 말 대신 퉁명스럽게 간식을 건네는 중'],cynic:['{p}와 세상 흉을 보며 나란히 앉아 웃는 중'],harsh:['{p}에게 잔소리를 하면서도 이불을 덮어 주는 중'],
  bold:['{p}의 손을 이끌고 함께 어딘가 가자고 하는 중'],negative:['{p}와 사소한 불평을 늘어놓다가 서로 웃음이 터지는 중'],smug:['{p}에게 능글맞게 어깨동무를 하며 장난치는 중'],
  shy:['오랜 부부인데도 {p}와 눈이 마주치자 슬며시 웃는 중'],inexpr:['{p}에게 사랑한다는 말 대신 좋아하는 반찬을 챙겨 주는 중']},
 /* 상대가 나를 좋아하지만 나는 모름 */
 beloved_u:{base:['{p}가 자꾸 챙겨 주는 것을 친구의 호의로만 여기는 중','{p}와 평소처럼 편하게 어울리는 중','{p}가 오늘따라 말이 없는 걸 의아해하는 중'],
  caring:['{p}가 어색해하는 걸 눈치채고 다정하게 말을 걸어 주는 중'],aloof:['{p}가 건넨 말을 무심하게 흘려듣는 중'],harsh:['{p}에게 평소처럼 퉁명스럽게 대하는 중'],
  playful:['{p}를 평소처럼 장난스럽게 놀리는 중'],bold:['{p}에게 편하게 어깨동무를 하는 중'],shy:['{p}가 말을 걸어 주길 기다리는 중']},
 /* 상대가 나를 좋아하는 걸 알지만 나는 친구·가족으로만 대함 */
 beloved_a:{base:['{p}의 마음을 알고 있어 조심스럽게 선을 지키며 대하는 중','{p}를 친구로 대하려 애쓰며 평소처럼 행동하는 중','{p}의 시선을 느끼면서도 모르는 척 다른 이야기를 꺼내는 중'],
  caring:['{p}가 상처받지 않도록 상냥하지만 분명하게 거리를 두는 중'],aloof:['{p}의 마음을 알면서도 일부러 모르는 척하는 중'],tsun:['{p}의 마음을 아는 듯 모르는 듯 딴청을 피우는 중'],
  harsh:['{p}의 마음을 알고도 선을 긋듯 건조하게 대하는 중'],playful:['어색해지지 않게 농담으로 분위기를 풀어 주는 중'],shy:['{p}를 어떻게 대해야 할지 몰라 눈치만 보는 중'],smug:['{p}의 마음을 알고도 능글맞게 웃어넘기는 중']}};
/* 직전 맥락: 다툰 뒤 / 고백이 거절된 뒤 */
const AFTER_QUARREL={harsh:['{p}와 다툰 뒤라 말없이 고개를 돌리고 있는 중'],angry:['{p}와 다툰 뒤라 아직 화가 풀리지 않은 중'],tsun:['{p}와 다툰 뒤라 신경 쓰이면서도 모르는 척하는 중'],
  caring:['{p}와 다툰 뒤라 먼저 사과할 타이밍을 재는 중'],shy:['{p}와 다툰 뒤라 눈치를 보며 머뭇거리는 중'],base:['{p}와 다툰 뒤라 어색하게 거리를 두는 중']};
const AFTER_REJECTED={aloof:['아무렇지 않은 척 {p}와 거리를 두는 중'],cynic:['"그럴 줄 알았다"고 중얼거리며 {p}와 거리를 두는 중'],caring:['{p}가 불편하지 않도록 조용히 곁을 비켜 주는 중'],
  base:['고백이 거절된 뒤라 {p}를 애써 피하는 중','고백이 거절된 뒤라 {p}와 마주치지 않으려 하는 중']};
const AFTER_REJECTING={caring:['{p}의 고백을 거절한 뒤라 미안한 마음에 조심스럽게 대하는 중'],base:['{p}의 고백을 거절한 뒤라 눈치를 보며 조심스럽게 대하는 중']};
/* 두 사람의 성격 차이에서 나오는 행동 */
function contrast(A,B){
  const out=[];
  if(tv(A,'bold')>=.4&&tv(B,'shy')>=.4)out.push('{p}가 수줍어하는 걸 알아채고 먼저 말을 걸어 주는 중');
  if(tv(A,'shy')>=.4&&tv(B,'bold')>=.4)out.push('{p}의 적극적인 말에 얼굴이 붉어지는 중');
  if(tv(A,'harsh')>=.4&&tv(B,'caring')>=.4)out.push('{p}의 다정함에 괜히 뾰로통해지는 중');
  if(tv(A,'caring')>=.4&&tv(B,'harsh')>=.4)out.push('{p}의 퉁명스러운 말투 뒤에 숨은 마음을 짐작하며 웃는 중');
  if(tv(A,'playful')>=.4&&tv(B,'aloof')>=.4)out.push('{p}의 무심한 반응에도 굴하지 않고 장난을 거는 중');
  return out}

/* 한 사람의 행동 지문. role=상태에서 본 나의 역할, A=내 분석, B=상대 분석, ctx={quarrel,rejected,rejecting} */
function stateLine(role,A,B,rng,pname,ctx){
  ctx=ctx||{};const bank=BANK[role];if(!bank)return null;
  const act=active(A);
  if(ctx.rejecting&&rng()<.7){const b=AFTER_REJECTING;const k=act.find(x=>b[x]);return fill(pick(rng,k?b[k]:b.base),pname)}
  if(ctx.rejected&&rng()<.7){const b=AFTER_REJECTED;const k=act.find(x=>b[x]);return fill(pick(rng,k?b[k]:b.base),pname)}
  if(ctx.quarrel&&rng()<.4){const b=AFTER_QUARREL;const k=act.find(x=>b[x]);return fill(pick(rng,k?b[k]:b.base),pname)}
  if(rng()<.18){const c=contrast(A,B);if(c.length)return fill(pick(rng,c),pname)}
  const have=act.filter(k=>bank[k]);
  if(!have.length)return fill(pick(rng,bank.base),pname);
  /* 성격이 여러 개면 서로 다른 성격의 행동을 이어 붙여 함께 드러낸다 (예: 수줍음 + 까칠함) */
  const w=have.map((k,i)=>Math.max(.2,tv(A,k))*(i===0?1.3:1));
  let tot=w.reduce((a,b)=>a+b,0),r=rng()*tot,i1=0;for(;i1<w.length-1;i1++){r-=w[i1];if(r<=0)break}
  const k1=have[i1],first=pick(rng,bank[k1]);
  const rest=have.filter(k=>k!==k1);
  if(rest.length&&rng()<.6){const pool=rest.filter(k=>bank[k].some(t=>!/^\{p\}(가|는) /.test(t)));if(pool.length){const k2=pick(rng,pool);const second=pick(rng,bank[k2].filter(t=>!/^\{p\}(가|는) /.test(t))).replace(/^\{p\}(와|를) /,'');
    if(second!==first)return fill(conn(first)+' '+second,pname)}}
  return fill(first,pname)}

/* ---------- 특별 이벤트(고백·프로포즈) 문장 ---------- */
const HOW={
 direct:{base:'{p}에게 용기를 내어 좋아한다고 고백하며',bold:'{p}에게 먼저 다가가 솔직하게 마음을 고백하며',playful:'장난처럼 말을 꺼내다가 진심이라며 고백하며',tsun:'퉁명스러운 말투로 "좋아한다"고 내뱉으며',harsh:'퉁명스러운 말투로 "좋아한다"고 내뱉으며',
  smug:'능글맞은 웃음을 거두고 진지하게 마음을 고백하며',aloof:'덤덤한 얼굴로 마음을 털어놓으며',cynic:'덤덤한 얼굴로 마음을 털어놓으며',caring:'{p}를 향한 마음을 조심스럽게 전하며',inexpr:'서툰 말로 더듬더듬 마음을 전하며'},
 letter:{base:'{p}에게 몰래 쓴 편지를 건네며'}};
const RES_A={accept:{base:'마음이 받아들여져 얼굴이 환해지는 중',mutual:'서로 같은 마음이었다는 걸 알고 놀라는 중'},
 reject:{base:'거절당해 애써 웃어 보이는 중',cynic:'"그럴 줄 알았다"고 중얼거리는 중',harsh:'자존심이 상해 입술을 깨무는 중',caring:'"괜찮다"고 말하며 눈시울이 붉어지는 중',playful:'장난이었던 척 웃어넘기려 애쓰는 중'}};
const RES_B={accept:{base:'{p}의 고백을 듣고 놀라면서도 마음을 받아들이는 중',shy:'{p}의 고백에 얼굴이 새빨개져 고개를 끄덕이는 중',tsun:'{p}의 고백에 투덜대면서도 "나도"라고 작게 대답하는 중',bold:'{p}의 고백에 활짝 웃으며 먼저 손을 잡는 중',playful:'{p}의 고백에 놀려 대다가 이내 진지하게 마음을 받아 주는 중',
   mutual:'{p}의 고백을 듣고 사실 자기도 좋아했다고 털어놓는 중'},
 reject:{base:'{p}의 마음은 고맙지만 미안하다며 조심스럽게 거절하는 중',harsh:'{p}의 고백을 단호하게 거절하는 중',aloof:'{p}의 고백에 담담하게 받아 줄 수 없다고 말하는 중',caring:'{p}의 마음에 고마워하며 미안한 얼굴로 거절하는 중',shy:'{p}의 고백에 당황해 어쩔 줄 몰라 하며 거절하는 중',tsun:'{p}의 고백에 당황해 퉁명스럽게 안 된다고 말하는 중'}};
const HES_A={base:'{p}에게 고백하려다 말을 삼키며 괜히 딴청을 피우는 중',shy:'{p} 앞에서 입을 열려다 얼굴만 붉히는 중',tsun:'"아무것도 아니야"라며 말을 얼버무리는 중',inexpr:'{p}에게 할 말을 고르다가 결국 아무 말도 못 하는 중'};
const PROP_HOW={base:'{p}에게 반지를 건네며 결혼해 달라고 프로포즈하며',shy:'{p}에게 편지와 함께 조심스레 반지를 건네며',playful:'장난스럽게 반지를 내밀며 "결혼해 줄래?" 하고 프로포즈하며',bold:'{p}의 손을 잡고 당당하게 프로포즈하며',
  tsun:'퉁명스럽게 반지를 내밀며 "같이 살자"고 말하며',harsh:'퉁명스럽게 반지를 내밀며 "같이 살자"고 말하며',caring:'{p}를 위해 준비한 반지를 꺼내며 프로포즈하며',cynic:'세상이 별로여도 곁에 있어 달라며 프로포즈하며'};
const PROP_A={accept:'"좋아"라는 대답에 눈물이 맺히는 중',decline:'시간이 필요하다는 말에 아쉬움을 삼키며 기다리기로 하는 중'};
const PROP_B={accept:{base:'{p}의 프로포즈에 눈물을 글썽이며 "좋아"라고 답하는 중',tsun:'{p}의 프로포즈에 투덜대면서도 반지를 끼는 중',playful:'{p}의 프로포즈에 웃음이 터졌다가 눈물을 닦으며 승낙하는 중',shy:'{p}의 프로포즈에 말을 잇지 못하고 고개만 끄덕이는 중'},
  decline:{base:'{p}의 프로포즈에 마음의 준비가 필요하다며 시간을 달라고 말하는 중'}};
const pk1=(m,A,rng)=>{const a=active(A);const k=a.find(x=>m[x]);return k?m[k]:m.base};
/* kind: 'confess'|'propose', style: direct|letter|hesitate|flee, outcome: accept|reject|decline|none, mutual: 서로 좋아하던 사이였는지 */
function eventLines(kind,style,outcome,A,B,rng,aName,bName,mutual){
  let a,b;
  if(kind==='propose'){
    const how=pk1(PROP_HOW,A,rng);
    a=fill(conn(how)+' '+PROP_A[outcome==='accept'?'accept':'decline'],bName);
    b=fill(pk1(PROP_B[outcome==='accept'?'accept':'decline'],B,rng),aName);return {a,b}}
  if(style==='hesitate'){a=fill(pk1(HES_A,A,rng),bName);b=fill('{p}가 뭔가 말하려다 마는 모습을 의아하게 바라보는 중',aName);return {a,b}}
  if(style==='flee'){a=fill('{p}에게 고백하려다 너무 떨려서 도망치는 중',bName);b=fill('{p}가 얼굴이 빨개져 도망가는 모습을 어리둥절하게 바라보는 중',aName);return {a,b}}
  const how=style==='letter'?HOW.letter.base:pk1(HOW.direct,A,rng);
  const ra=outcome==='accept'?(mutual?RES_A.accept.mutual:RES_A.accept.base):pk1(RES_A.reject,A,rng);
  a=fill(conn(how)+' '+ra,bName);
  const rb=outcome==='accept'?(mutual?RES_B.accept.mutual:pk1(RES_B.accept,B,rng)):pk1(RES_B.reject,B,rng);
  b=fill(rb,aName);return {a,b}}

const api={stateLine,eventLines,active,fill,BANK};
root.VivLove=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
