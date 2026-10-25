/* 비바리움 생활 시뮬레이션 — 외부 AI 없이 규칙(키워드·확률표)만으로 동작한다.
   - 화면(DOM)과 저장소를 직접 만지지 않는다. 상태 읽기/쓰기는 호출자가 넘겨 주는 함수(ctx)로만 한다 → 나중에 서버가 같은 함수를 돌려도 된다.
   - 기준 시각은 항상 Asia/Seoul(KST). 기기 시간대와 무관하다.
   - 오프라인 동안의 행동을 재생하지 않는다. 호출 시점의 서울 시각과 저장된 상태만 보고 "지금 어울리는 행동"을 고른다.
   - 같은 입력(캐릭터 id, 결정 횟수, 시각(분), 프로필, 도면)이면 항상 같은 결과가 나온다(결정적 난수) → 공유 단계에서 서버/클라이언트 결과가 일치한다.
   저장하는 최소 상태(캐릭터당): 집·위치·층·자세·현재 행동(그룹/세부)·가구 uid·말풍선 문구·외출 여부 | 다음 결정 시각·결정 횟수·최근 행동·대기 중인 후속 행동·사용자 선택(wish). 초 단위 저장 없음. */
(function(root){
'use strict';
const GROUPS={wake:'기상·정비',eat:'식사',sleep:'수면',rest:'휴식',read:'독서',work:'작업',tv:'TV 시청',hobby:'취미',chore:'집 가꾸기',pet:'반려동물',wander:'집 안 이동',out:'외출',chat:'대화'};
const MIN=60000;

/* ---------- 서울 시각 ---------- */
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'});
function seoul(ms){const o={};fmt.formatToParts(new Date(ms)).forEach(p=>o[p.type]=p.value);return {hour:+o.hour,minute:+o.minute,weekday:o.weekday,day:+o.day,month:+o.month,year:+o.year,hm:+o.hour+(+o.minute)/60,text:o.hour+':'+o.minute}}

/* ---------- 결정적 난수 ---------- */
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const pick=(r,a)=>a[Math.floor(r()*a.length)];
function wpick(r,list,wf){let tot=0;const w=list.map(x=>{const v=Math.max(0,wf(x));tot+=v;return v});if(tot<=0)return list.length?list[0]:null;let t=r()*tot;for(let i=0;i<list.length;i++){t-=w[i];if(t<=0)return list[i]}return list[list.length-1]}
/* 한국어 조사 */
const hasJong=s=>{const c=String(s).trim().slice(-1).charCodeAt(0);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0};
const wa=n=>n+(hasJong(n)?'과':'와'),ro=n=>{const c=String(n).trim().slice(-1).charCodeAt(0);return n+((c>=0xAC00&&c<=0xD7A3&&(((c-0xAC00)%28)===0||((c-0xAC00)%28)===8))?'로':(c>=0xAC00&&c<=0xD7A3?'으로':'로'))};
const eul=n=>n+(hasJong(n)?'을':'를');

/* =====================================================================
   1) 프로필 해석 — 한국어 키워드 규칙. 명시적 사실(facts)과 규칙 추정(traits)을 분리해 돌려준다.
   ===================================================================== */
const NEG=/(싫|못 ?(마|먹|하|보|읽|쓰|나가)|안 ?(좋아|마시|마셔|먹|하|읽|보|나가)|않|금주|질색|별로|딱 ?질색|거부|피하)/;
const TRAIT_RULES=[
 ['social','사교적',/사교|외향|수다|활발|인싸|모임|파티|사람(들)?(을|이|과)? ?(만나|좋아)|친화|붙임성|어울리/],
 ['solitary','혼자 있기를 좋아함',/내향|조용|혼자|집순이|집돌이|은둔|낯(을)? ?가|고독|말수가 적/],
 ['reader','독서를 좋아함',/독서|책벌레|책 ?읽|책(?!임|상|가방)|소설|서점|도서관|문학|시집|만화책|필사/],
 ['worker','작업·일에 몰두함',/작가|글쓰기|글을 ?쓰|글 ?쓰|집필|개발자|코딩|프로그래|디자이너|일 ?중독|워커홀릭|재택|공부|연구|작업|번역|학생|수험|성실|근면|꼼꼼/],
 ['foodie','먹는 것을 좋아함',/먹(는|기)|맛집|미식|식도락|먹보|대식|디저트|간식|빵|커피|야식/],
 ['cook','요리를 즐김',/요리|베이킹|쿠킹|제빵|밥 ?짓|음식 ?만/],
 ['tea','차·커피를 즐김',/홍차|녹차|허브티|티타임|차 ?마시|차를|다도|커피|카페인/],
 ['drinker','술을 즐김',/술|와인|맥주|위스키|소주|칵테일|음주|막걸리|사케|한잔|애주가/],
 ['nightowl','늦게 자는 편',/올빼미|밤샘|야행성|밤늦게|새벽까지|늦게 ?(자|잠)|늦잠|야간|밤에 ?(활동|깨)/],
 ['earlybird','일찍 일어나는 편',/아침형|일찍 ?(일어|자)|얼리버드|미라클|새벽 ?(기상|운동|에 ?일어)|부지런/],
 ['homebody','집에서 보내기를 좋아함',/집순이|집돌이|집에서|집콕|방콕|칩거|홈바디|집 ?안/],
 ['outgoing','밖에서 활동하기를 좋아함',/외출|여행|돌아다|바깥|밖에서|나들이|활동적|모험|떠돌|역마/],
 ['outdoor','산책·운동을 즐김',/산책|운동|러닝|조깅|등산|요가|헬스|자전거|걷기|트레킹|수영|활동적/],
 ['tv','TV·영상을 즐김',/\btv\b|티비|텔레비전|드라마|영화|넷플릭스|예능|유튜브|애니|시청/i],
 ['hobby','취미 활동을 즐김',/취미|그림|그리기|악기|피아노|기타|바이올린|뜨개|수집|게임|체스|보드게임|만들기|공예|사진|음악|노래|캘리|자수|바느질|프라모델|DIY/i],
 ['plant','식물·정원을 좋아함',/식물|화분|원예|정원|가드닝|꽃|풀|텃밭|화초/],
 ['fashion','꾸미기를 좋아함',/꾸미|패션|화장|메이크업|스타일|멋쟁이|옷|코디|뷰티|스킨케어/],
 ['tidy','깔끔한 편',/청소|깔끔|정리|결벽|정돈|깨끗/],
 ['lazy','느긋하고 게으른 편',/게으|느긋|늘어|뒹굴|낮잠|졸|귀차니|나른|무기력|여유/],
 ['pet','동물을 좋아함',/반려|강아지|고양이|애완|펫|동물|댕댕|냥이|\b개\b/]
];
const PARTNER_RE=/연인|애인|커플|남자친구|여자친구|남친|여친|부부|남편|아내|배우자|짝꿍|파트너|사귀|사랑하는 사이|결혼/;
const clauses=t=>String(t||'').split(/[.!?\n,;·~…]+/).map(s=>s.trim()).filter(Boolean);
const _acache=new Map();
function analyze(profile,name,others){
  profile=String(profile||'');others=others||[];
  const key=profile+'|'+name+'|'+others.map(o=>o.name+':'+o.profile).join('/');
  if(_acache.has(key))return _acache.get(key);
  const cl=clauses(profile),traits={},ev={};
  for(const [t,label,re] of TRAIT_RULES){let pos=0,neg=0;const hits=[];
    for(const c of cl){const m=re.exec(c);if(!m)continue;hits.push(m[0]);if(NEG.test(c))neg++;else pos++}
    if(!hits.length)continue;
    traits[t]=pos&&neg?.2:pos?Math.min(1,.55+.2*(pos-1)):-.6;ev[t]=[...new Set(hits)]}
  /* 명시적 사실 — 자기 서술로 확실한 것만. 모호하면 비워 둔다(추정하지 않음). */
  const facts={gender:null,age:null,adult:null,partners:[],partnerWord:false};
  const gf=/여성|여자(?!친구)|그녀|소녀|아가씨|할머니|여학생/.test(profile),gm=/남성|남자(?!친구)|그는|소년|아저씨|할아버지|남학생/.test(profile);
  if(gf&&!gm)facts.gender='f';else if(gm&&!gf)facts.gender='m';
  let m=/(\d{1,3})\s*(?:살|세)(?!계)/.exec(profile);if(m)facts.age=+m[1];
  else if(m=/(\d)0\s*대/.exec(profile))facts.age=+m[1]*10;
  if(facts.age!=null)facts.adult=facts.age>=20;else if(/미성년|초등학생|중학생|고등학생|어린이|유아/.test(profile))facts.adult=false;else if(/성인/.test(profile))facts.adult=true;
  facts.partnerWord=PARTNER_RE.test(profile);
  const fl=[];
  if(facts.gender)fl.push({k:'gender',label:'성별',text:facts.gender==='f'?'여성':'남성'});
  if(facts.age!=null)fl.push({k:'age',label:'나이',text:/대/.test(profile)&&!/살|세/.test(profile)?facts.age+'대':facts.age+'세'});
  /* 연인 관계: 이 프로필(또는 상대 프로필)에 연인 표현이 있고 상대 이름이 같은 문장에 등장해야 인정 */
  for(const o of others){if(!o||o.name===name)continue;
    const mine=cl.some(c=>c.includes(o.name)&&PARTNER_RE.test(c)),theirs=clauses(o.profile).some(c=>c.includes(name)&&PARTNER_RE.test(c));
    if(mine||theirs){facts.partners.push(o.name);fl.push({k:'partner',label:'관계',text:`${o.name}와(과) 연인·부부 사이`+(mine?'':' (상대 프로필에 적힘)')})}}
  /* 프로필에 직접 적힌 '좋아하는 것·취미' 표현만 그대로 뽑는다(추정 아님) */
  const likes=[],GEN=/^(것|거|편|사람|때|곳|날|일|게|걸|그|이|저|매우|아주|정말|엄청|너무|좀|많이)$/;
  const addLike=w=>{w=String(w||'').trim().replace(/(을|를)$/,'').replace(/(이야|이다|입니다|이에요|예요|이며|이고|이라|야|다)$/,'').trim();if(w.length>=2&&w.length<=10&&!GEN.test(w)&&!likes.includes(w))likes.push(w)};
  for(const c of cl){if(NEG.test(c))continue;let m;
    if(m=/(?:취미는|취미가|취미로|취미:|좋아하는 것은|좋아하는 건)\s*([가-힣A-Za-z0-9 ]{2,14})/.exec(c))m[1].split(/\s*(?:와|과|랑|이랑|하고)\s*/).forEach(addLike);
    const re=/([가-힣A-Za-z0-9]{2,8}?)(?:을|를|이|가|도)?\s*(?:매우 |아주 |정말 |엄청 |무척 )?(?:좋아한|좋아해|좋아함|좋아하|즐긴|즐겨|즐기)/g;
    while(m=re.exec(c))addLike(m[1])}
  likes.slice(0,4).forEach(w=>fl.push({k:'like',label:'좋아하는 것',text:w}));
  const res={traits,ev,facts,likes:likes.slice(0,4),factList:fl,traitList:Object.keys(traits).map(t=>{const r=TRAIT_RULES.find(x=>x[0]===t);return {k:t,label:traits[t]<0?'싫어함: '+r[1].replace(/을 좋아함|를 좋아함|을 즐김|를 즐김/,''):r[1],v:traits[t],words:ev[t]}})};
  if(_acache.size>200)_acache.clear();_acache.set(key,res);return res}
const tv=(A,t)=>(A&&A.traits[t])||0;

/* =====================================================================
   2) 가구 분류 — 에셋 메타(분류·이름·태그)를 보고 "무엇으로 쓸 수 있는지(kind)"를 붙인다.
   ===================================================================== */
function kindsOf(m){
  const sub=m.sub||'',cat=m.cat||'',s=[m.name,m.en,(m.tags||[]).join(' '),m.sb,m.aid].join(' ').toLowerCase(),k=new Set();
  const T=re=>re.test(s);
  if(sub==='bed'){if(T(/아기|baby|crib|유아/))k.add('crib');else if(T(/해먹|hammock/))k.add('hammock');else k.add('bed')}
  if(sub==='sofa')k.add('sofa');
  if(sub==='chair')k.add('chair');
  if(sub==='side-table-bench'&&T(/벤치|bench/))k.add('bench');
  if(sub==='desk')k.add('desk');
  if(sub==='dining-table'){k.add(T(/마작|mahjong/)?'gametable':'dining')}
  if(sub==='game-table')k.add('gametable');
  if(sub==='shelf'){if(T(/와인|wine/))k.add('wine');else if(T(/책장|bookcase|book|라이브러리|library/))k.add('bookshelf');else if(T(/신발|shoe/))k.add('shoes');else k.add('shelf')}
  if(T(/책 ?(더미|묶음)|book stack|book pile/))k.add('book');
  if(T(/꽃병|화병|vase/))k.add('vase');
  if(sub==='television')k.add('tv');
  if(T(/노트북|laptop|컴퓨터|computer/)&&cat!=='lighting')k.add('laptop');
  if(sub==='refrigerator')k.add('fridge');
  if(sub==='oven')k.add('stove');
  if(sub==='countertop')k.add('counter');
  if(sub==='kitchen-sink')k.add('ksink');
  if(sub==='cookware-food')k.add(T(/주전자|kettle|teapot|차 /)?'kettle':'cookware');
  if(sub==='tableware'){k.add('tableware');if(T(/와인|wine/))k.add('wine')}
  if(sub==='small-appliance'){
    if(T(/커피|에스프레소|coffee|espresso/))k.add('coffee');
    else if(T(/토스터|toast/))k.add('toaster');else if(T(/밥솥|rice/))k.add('ricecooker');
    else if(T(/블렌더|믹서|착즙|blender|mixer|juic/))k.add('blender');else if(T(/전자레인지|microwave|lagan/))k.add('microwave');
    else if(T(/에어프라이어|air ?fry/))k.add('airfryer');else if(T(/와플|waffle/))k.add('waffle');
    else if(T(/식기세척|dishwasher/))k.add('dishwasher');else if(T(/정수기|water/))k.add('purifier');
    else if(T(/재봉|sewing/))k.add('sewing');else k.add('cookware')}
  if(cat==='bathroom'){
    if(sub==='toilet')k.add('toilet');else if(sub==='bathtub')k.add('bathtub');else if(sub==='shower-enclosure')k.add('shower');
    else if(sub==='bathroom-sink')k.add('bsink');else if(sub==='bathroom-accessory'){k.add(T(/드라이어|dryer/)?'hairdryer':T(/칫솔|tooth/)?'bsink':'bacc')}
    else if(sub==='towel-holder')k.add('towel')}
  if(T(/first.?aid|구급|의료|medical/))k.add('medical');
  if(sub==='clothes-hanger')k.add('hanger');
  if(sub==='mirror')k.add('mirror');
  if(sub==='clothes')k.add('clothes');
  if(T(/옷장|드레스|wardrobe|closet|dressing/))k.add('wardrobe');
  if(cat!=='bathroom'&&T(/화장대|dresser|vanity table|makeup table|vanity/))k.add('vanity');
  if(T(/화장품|뷰티|메이크업|makeup|cosmetic|beauty/))k.add('cosmetic');
  if(sub==='cabinet'&&!k.has('vanity')&&!T(/tv|티비/))k.add('cabinet');
  if(T(/와인|wine|샴페인|champagne|위스키|whisk|맥주|beer|칵테일|cocktail|sake|술병|술잔|주류|막걸리|소주|liquor/)&&cat!=='plants')k.add('wine');
  if(cat==='plants'){
    if(sub==='outdoor-garden'){if(T(/채소|무 |배추|텃밭|vegetable|상추|토마토/))k.add('veg');else k.add('garden')}
    else{k.add('plant');if(T(/꽃|장미|난초|flower|rose|orchid|헬리코니아|극락조/))k.add('flower')}}
  if(sub==='pet-animal'){
    if(T(/테디|teddy/))k.add('toy');
    else if(T(/개|강아지|dog|허스키|husky|로트와일러|rottweiler/))k.add('dog');else if(T(/고양이|cat/))k.add('cat');else if(T(/닭|chicken|hen/))k.add('chicken');else k.add('animal')}
  if(sub==='air-conditioner'&&!T(/실외기|outdoor/))k.add('fan');
  if(sub==='heater')k.add('boiler');
  if(sub==='washing-machine')k.add('washer');
  if(sub==='gaming-av'){if(T(/playstation|xbox|게임|game/))k.add('console');else k.add('audio')}
  if(sub==='camera')k.add('camera');
  if(sub==='music-instrument'){k.add(T(/피아노|piano/)?'piano':T(/기타|guitar/)?'guitar':T(/바이올린|violin/)?'violin':'instrument')}
  if(sub==='art-craft'){k.add(T(/이젤|미술|easel/)?'easel':T(/화학|실험|비커/)?'lab':'craft')}
  if(sub==='telephone-audio')k.add('phone');
  if(sub==='fireplace')k.add('fireplace');
  if(sub==='it-network'&&T(/cctv|모니터|인터폰/))k.add('monitor');
  return [...k]}
const KNAME={bed:'침대',sofa:'소파',chair:'의자',bench:'벤치',desk:'책상',dining:'식탁',bookshelf:'책장',tv:'TV',fridge:'냉장고',stove:'레인지',counter:'조리대',ksink:'싱크대',wardrobe:'옷장',mirror:'거울',vanity:'화장대',piano:'피아노',guitar:'기타',violin:'바이올린',easel:'이젤',fireplace:'벽난로',plant:'화분'};

/* =====================================================================
   3) 공간·이동 — 층별 방(내벽으로 나뉜 구간)과 문·계단으로 이어진 그래프. 벽은 문이 있어야만 통과.
   geo: {W,in0,in1,floors:[{k,name,e,top}],rooms:[{key,f,left,right,name,partX,doorRight}],stairs:[{f,xb,xt}],items:[…],exits:[{f,x,side}]}
   ===================================================================== */
function buildWorld(geo){
  const segs=geo.rooms.map((r,i)=>({id:i,key:r.key,f:r.f,left:r.left,right:r.right,uname:r.name||'',partX:r.partX,doorRight:!!r.doorRight}));
  const byFloor={};segs.forEach(s=>(byFloor[s.f]=byFloor[s.f]||[]).push(s));
  Object.values(byFloor).forEach(a=>a.sort((p,q)=>p.left-q.left));
  const segAt=(f,x)=>{const a=byFloor[f];if(!a||!a.length)return null;let best=a[0],bd=1e9;for(const s of a){const d=x<s.left?s.left-x:x>s.right?x-s.right:0;if(d<bd){bd=d;best=s}}return best};
  const segIn=(f,x)=>{const a=byFloor[f];return a?a.find(s=>x>=s.left&&x<=s.right)||null:null};
  const adj=new Map();segs.forEach(s=>adj.set(s.id,[]));
  const floorE=k=>(geo.floors[k]||{e:0}).e;
  Object.values(byFloor).forEach(a=>{for(let i=0;i<a.length-1;i++)if(a[i].doorRight&&a[i].partX!=null){
    adj.get(a[i].id).push({to:a[i+1].id,wp:[{f:a[i].f,x:a[i].partX,e:floorE(a[i].f)}]});adj.get(a[i+1].id).push({to:a[i].id,wp:[{f:a[i].f,x:a[i].partX,e:floorE(a[i].f)}]})}});
  (geo.stairs||[]).forEach(st=>{const A=segAt(st.f,st.xb),B=segAt(st.f+1,st.xt);if(!A||!B)return;
    const up=[{f:st.f,x:st.xb,e:floorE(st.f)},{f:st.f+1,x:st.xt,e:floorE(st.f+1)}];
    adj.get(A.id).push({to:B.id,wp:up});adj.get(B.id).push({to:A.id,wp:up.slice().reverse()})});
  /* 가구에 종류·방 붙이기 (벽 위에 걸치거나 건물 밖이면 제외) */
  const items=[];
  (geo.items||[]).forEach(it=>{const s=segIn(it.f,it.x);if(!s)return;items.push({...it,kinds:kindsOf(it),seg:s.id})});
  const bySeg=new Map();segs.forEach(s=>bySeg.set(s.id,[]));items.forEach(it=>bySeg.get(it.seg).push(it));
  /* 방 이름: 사용자가 붙인 이름 > 가구로 추정 > 층 이름 */
  const multi={};segs.forEach(s=>multi[s.f]=(multi[s.f]||0)+1);
  segs.forEach(s=>{
    if(s.uname){s.name=s.uname;s.named=true;return}
    const c={};(bySeg.get(s.id)||[]).forEach(it=>it.kinds.forEach(k=>c[k]=(c[k]||0)+1));
    const sc={침실:(c.bed||0)*4,욕실:((c.toilet||0)+(c.bathtub||0)+(c.shower||0)+(c.bsink||0))*3,주방:((c.fridge||0)+(c.stove||0)+(c.counter||0)+(c.ksink||0))*2.5+(c.dining||0)*.5,
      거실:((c.sofa||0)+(c.tv||0)+(c.fireplace||0))*2,서재:((c.desk||0)+(c.bookshelf||0))*1.6,식당:(c.dining||0)*1.6};
    let best='',bv=1.9,second=0;for(const k in sc)if(sc[k]>bv){second=bv>1.9?bv:second;bv=sc[k];best=k}else if(sc[k]>second&&sc[k]>1.9)second=sc[k];
    if(best&&second>0&&bv<second*1.35)best='';   // 여러 용도가 섞인 공간이면 억지로 이름 붙이지 않고 층 이름을 쓴다
    const fn=(geo.floors[s.f]||{}).name||'';
    s.name=best||(multi[s.f]>1?`${fn} ${byFloor[s.f].indexOf(s)+1}번 방`:fn||'집 안');
    s.inferred=!!best});
  const windows=(geo.windows||[]).map(w=>{const s=segAt(w.f,w.x);return s?{...w,seg:s.id}:null}).filter(Boolean);
  const route=(from,to)=>{   // from/to: {f,x} → 경유 지점 목록 {f,x,e} (시작점 제외, 도착점 포함). 막혀 있으면 null
    const A=segAt(from.f,from.x),B=segAt(to.f,to.x);if(!A||!B)return null;
    const prev=new Map([[A.id,null]]),q=[A.id];
    while(q.length){const u=q.shift();if(u===B.id)break;for(const e of adj.get(u)){if(!prev.has(e.to)){prev.set(e.to,{from:u,e});q.push(e.to)}}}
    if(!prev.has(B.id))return null;
    const chain=[];let c=B.id;while(prev.get(c)){chain.unshift(prev.get(c).e);c=prev.get(c).from}
    const out=[];chain.forEach(e=>e.wp.forEach(w=>out.push({...w})));
    out.push({f:to.f,x:to.x,e:to.e!=null?to.e:floorE(to.f)});return out};
  const reach=segId=>{const seen=new Set([segId]),q=[segId];while(q.length){const u=q.shift();for(const e of adj.get(u))if(!seen.has(e.to)){seen.add(e.to);q.push(e.to)}}return seen};
  const clampX=(s,x,pad)=>{const lo=s.left+pad,hi=s.right-pad;return lo<=hi?Math.min(hi,Math.max(lo,x)):(s.left+s.right)/2};
  return {geo,segs,segAt,segIn,items,bySeg,route,reach,floorE,clampX,windows,exits:geo.exits||[],byFloor,adj,
    segOf:id=>segs[id],mid:geo.W/2}}

/* =====================================================================
   4) 행동 정의 — 행동(verb) = 그룹 + 필요한 가구(kind) + 자세 + 지속시간 + 문구 + 성향 가중치
   문구 자리표시자: {r}=방 이름  {p}=상대 캐릭터
   ===================================================================== */
const VERBS=[];
function V(id,g,k,pose,dur,t,w,o){VERBS.push({id,g,k:k?[].concat(k):null,pose,dur,t,w:w||{},...(o||{})})}
/* 기상·개인 정비 */
V('wake_stretch','wake','bed','sit',[4,9],['{r}에서 침대에서 일어나 기지개를 켜는 중','{r}에서 침대 끝에 걸터앉아 잠을 깨는 중','{r}에서 하품을 하며 막 일어난 중'],{lazy:.3},{hr:[5,11]});
V('brush','wake','bsink','stand',[3,7],['{r}에서 세면대 앞에서 양치하는 중','{r}에서 세수를 하는 중','{r}에서 스킨케어를 하는 중'],{tidy:.6,fashion:.5});
V('shave','wake','bsink','stand',[3,7],['{r}에서 거울을 보며 면도하는 중'],{tidy:.4},{hr:[5,10],req:A=>A.facts.gender==='m'&&A.facts.age!=null&&A.facts.age>=20,rare:.35});
V('shower','wake','shower','stand',[8,18],['{r}에서 샤워하는 중','{r}에서 머리를 감는 중'],{tidy:.7});
V('bath','wake','bathtub','sit',[20,40],['{r}에서 욕조에 몸을 담그고 목욕하는 중','{r}에서 따뜻한 물에 느긋하게 목욕하는 중'],{lazy:.6,tidy:.4},{hr:[18,24]});
V('hairdry','wake','hairdryer','stand',[4,9],['{r}에서 머리를 말리는 중'],{fashion:.4},{});
V('dress','wake',['wardrobe','hanger','clothes','shoes'],'stand',[4,10],['{r}에서 오늘 입을 옷을 고민하는 중','{r}에서 옷을 갈아입는 중','{r}에서 옷매무새를 가다듬는 중'],{fashion:1.2},{hr:[5,12]});
V('mirror','wake',['mirror','vanity'],'stand',[3,8],['{r}에서 거울 앞에서 머리를 매만지는 중','{r}에서 거울을 보며 옷매무새를 확인하는 중'],{fashion:1});
V('makeup','wake',['vanity','cosmetic','mirror'],'stand',[6,14],['{r}에서 화장대 앞에서 화장을 하는 중','{r}에서 거울을 보며 화장을 고치는 중'],{fashion:1.2},{hr:[6,20],req:A=>A.facts.gender==='f'&&!(A.facts.age!=null&&A.facts.age<14)});
V('medkit','wake','medical','stand',[2,6],['{r}에서 구급상자를 열어 상비품을 확인하는 중','{r}에서 상비품을 정리하는 중'],{tidy:1.2});
V('wash_hands','wake','ksink','stand',[2,4],['{r}에서 손을 씻는 중'],{tidy:.8});
/* 식사·음주 */
V('eat_table','eat','dining','sit',[15,40],['{r}에서 식탁에 앉아 식사하는 중','{r}에서 식탁에서 천천히 밥을 먹는 중'],{foodie:.8});
V('set_table','eat','dining','stand',[4,10],['{r}에서 식탁을 차리는 중','{r}에서 식탁에 식기를 놓는 중'],{cook:.6,tidy:.4},{need:['tableware']});
V('cook_stove','eat','stove','stand',[12,35],['{r}에서 식사를 준비하는 중','{r}에서 레인지 앞에서 요리하는 중','{r}에서 불 앞에서 음식을 만드는 중'],{cook:2});
V('cook_counter','eat','counter','stand',[8,25],['{r}에서 조리대에서 재료를 손질하는 중','{r}에서 식사를 준비하는 중'],{cook:1.5});
V('fridge','eat','fridge','stand',[2,6],['{r}에서 냉장고에서 먹을 것을 꺼내는 중','{r}에서 냉장고를 열고 뭘 먹을지 고르는 중'],{foodie:1});
V('snack','eat','fridge','stand',[4,10],['{r}에서 간단히 간식을 챙겨 먹는 중'],{foodie:1.2},{hr:[14,18]});
V('coffee','eat','coffee','stand',[4,10],['{r}에서 커피를 내리는 중'],{tea:1.5,foodie:.5},{hr:[6,16]});
V('tea_kettle','eat',['kettle'],'stand',[4,9],['{r}에서 차를 우리는 중','{r}에서 주전자로 물을 끓이는 중'],{tea:1.5});
V('toast','eat',['toaster','waffle','airfryer','ricecooker','blender','microwave'],'stand',[4,12],['{r}에서 간단한 음식을 데우고 만드는 중','{r}에서 주방 가전으로 식사를 준비하는 중'],{cook:.8,foodie:.5});
V('dishes','eat',['ksink','dishwasher'],'stand',[5,12],['{r}에서 설거지하는 중','{r}에서 식기를 정리하는 중'],{tidy:1.2},{hr:[8,22]});
V('water','eat',['purifier'],'stand',[1,3],['{r}에서 물을 한 잔 마시는 중']);
V('drink_wine','eat','wine','stand',[10,30],['{r}에서 와인을 한 잔 따르는 중','{r}에서 술병을 고르는 중'],{drinker:2.5},{hr:[18,26],rare:.5,req:A=>A.facts.adult!==false});
V('drink_table','eat','dining','sit',[20,50],['{r}에서 식탁에서 술을 한잔하는 중','{r}에서 식탁에 앉아 와인을 홀짝이는 중'],{drinker:2.5},{hr:[19,26],need:['wine'],req:A=>A.facts.adult!==false});
/* 수면 */
V('sleep_bed','sleep','bed','lie',null,['{r}에서 침대에서 곤히 자는 중','{r}에서 이불을 덮고 잠든 중','{r}에서 새근새근 자고 있는 중'],{lazy:.5});
V('sleep_hammock','sleep','hammock','lie',null,['{r}에서 해먹에서 잠든 중'],{lazy:.5});
V('sleep_sofa','sleep','sofa','lie',null,['{r}에서 소파에서 웅크리고 잠든 중','{r}에서 소파에 몸을 눕히고 잠든 중'],{lazy:.5},{nobed:true,hr:[21,31]});
V('nap_sofa','sleep','sofa','lie',[15,40],['{r}에서 소파에서 꾸벅꾸벅 조는 중','{r}에서 소파에 기대 낮잠을 자는 중'],{lazy:1.2},{nap:true});
V('nap_bed','sleep','bed','lie',[20,60],['{r}에서 침대에서 낮잠을 자는 중'],{lazy:1.2},{nap:true});
/* 휴식 */
V('sofa_rest','rest','sofa','sit',[10,45],['{r}에서 소파에 앉아 쉬는 중','{r}에서 소파에서 느긋하게 쉬는 중','{r}에서 소파에 기대 멍하니 앉아 있는 중'],{lazy:.6,homebody:.3});
V('sofa_tea','rest','sofa','sit',[12,30],['{r}에서 소파에 앉아 차를 마시는 중','{r}에서 따뜻한 차를 홀짝이는 중'],{tea:1.8},{hr:[9,23]});
V('chair_rest','rest',['chair','bench'],'sit',[8,30],['{r}에서 의자에 앉아 쉬는 중','{r}에서 의자에 앉아 생각에 잠긴 중'],{});
V('chair_tea','rest','chair','sit',[12,30],['{r}에서 의자에 앉아 차를 마시는 중','{r}에서 의자에 앉아 따뜻한 차를 홀짝이는 중'],{tea:1.8},{hr:[9,23]});
V('chair_window','rest','chair','sit',[8,25],['{r}에서 의자에 앉아 창밖을 바라보는 중','{r}에서 의자에 앉아 멍하니 바깥을 보는 중'],{solitary:.5},{near:'__window'});
V('doze_chair','sleep','chair','sit',[10,30],['{r}에서 의자에 앉은 채 꾸벅꾸벅 조는 중','{r}에서 의자에 기대 깜빡 졸고 있는 중'],{lazy:1.2},{nap:true});
V('lie_bed','rest','bed','lie',[10,35],['{r}에서 침대에 누워 뒹구는 중','{r}에서 침대에 누워 천장을 보는 중'],{lazy:1.2},{hr:[8,26]});
V('fire','rest','fireplace','stand',[10,30],['{r}에서 벽난로 앞에서 불을 쬐는 중'],{homebody:.4});
V('fan','rest','fan','stand',[5,15],['{r}에서 선풍기 바람을 쐬는 중'],{});
V('window_gaze','rest','__window','stand',[4,12],['{r}에서 창밖을 바라보는 중','{r}에서 창가에서 바깥 풍경을 구경하는 중'],{solitary:.3});
/* 독서 */
V('read_shelf','read','bookshelf','stand',[8,25],['{r}에서 책장 앞에서 읽을 책을 고르는 중','{r}에서 책장 앞에 서서 책을 읽는 중'],{reader:2});
V('read_desk','read','desk','stand',[20,60],['{r}에서 책상에서 책을 읽는 중','{r}에서 책상 앞에서 책에 푹 빠진 중'],{reader:2},{need:['bookshelf','book']});
V('read_sofa','read','sofa','sit',[20,70],['{r}에서 소파에 앉아 책을 읽는 중','{r}에서 소파에서 책장을 넘기는 중'],{reader:2},{need:['bookshelf','book'],near:'bookshelf'});
V('read_chair','read','chair','sit',[20,60],['{r}에서 의자에 앉아 책을 읽는 중','{r}에서 의자에 앉아 조용히 책장을 넘기는 중'],{reader:2},{need:['bookshelf','book'],near:'bookshelf'});
V('read_bed','read','bed','lie',[15,50],['{r}에서 침대에 누워 책을 읽는 중'],{reader:1.8,nightowl:.8},{need:['bookshelf','book'],hr:[20,27],near:'bookshelf'});
V('read_book','read','book','stand',[10,30],['{r}에서 쌓아 둔 책을 뒤적이는 중'],{reader:1.5});
V('tidy_books','read',['bookshelf'],'stand',[6,14],['{r}에서 책장의 책을 정리하는 중','{r}에서 책을 가지런히 꽂는 중'],{tidy:1.2,reader:.5});
V('copy_text','read','desk','stand',[20,50],['{r}에서 책상에서 좋아하는 구절을 필사하는 중'],{reader:1.5,worker:.5},{need:['bookshelf','book']});
/* 작업 */
V('work_desk','work','desk','stand',[30,100],['{r}에서 책상 앞에서 작업하는 중','{r}에서 책상 앞에서 집중해서 일하는 중'],{worker:1.5});
V('write_desk','work','desk','stand',[25,80],['{r}에서 책상 앞에서 글을 쓰는 중','{r}에서 책상 앞에서 메모를 정리하는 중'],{worker:1.2,reader:.8});
V('work_laptop','work','laptop','stand',[30,90],['{r}에서 노트북으로 작업하는 중','{r}에서 노트북 앞에서 자료를 정리하는 중'],{worker:1.5});
V('write_chair','work','chair','sit',[20,60],['{r}에서 의자에 앉아 노트에 메모하는 중','{r}에서 의자에 앉아 생각을 정리하는 중'],{worker:1.2},{near:'desk',trait:'worker'});
V('monitor','work','monitor','stand',[3,8],['{r}에서 모니터를 확인하는 중']);
/* TV */
V('tv_sofa','tv','tv','sit',[25,100],['{r}에서 소파에 앉아 TV를 보는 중','{r}에서 소파에서 TV 프로그램을 보는 중'],{tv:1.8},{seatKind:'sofa'});
V('tv_chair','tv','tv','sit',[20,70],['{r}에서 의자에 앉아 TV를 보는 중','{r}에서 의자를 돌려 앉아 TV를 보는 중'],{tv:1.4},{seatKind:'chair'});
V('tv_stand','tv','tv','stand',[10,40],['{r}에서 TV 앞에 서서 방송을 보는 중','{r}에서 TV를 켜고 채널을 돌리는 중'],{tv:1.2});
V('tv_bed','tv','tv','lie',[20,70],['{r}에서 침대에 누워 TV를 보는 중'],{tv:1.5,lazy:.6},{seatKind:'bed',hr:[20,27]});
/* 취미 */
V('chair_hobby','hobby','chair','sit',[15,45],['{r}에서 의자에 앉아 뜨개질을 하는 중','{r}에서 의자에 앉아 작은 수첩에 낙서하는 중','{r}에서 의자에 앉아 취미 거리를 만지작거리는 중'],{hobby:1.6},{trait:'hobby'});
V('paint','hobby','easel','stand',[25,90],['{r}에서 이젤 앞에서 그림을 그리는 중','{r}에서 캔버스에 색을 칠하는 중'],{hobby:1.8});
V('craft','hobby',['craft','lab'],'stand',[20,60],['{r}에서 작업대 앞에서 무언가를 만지작거리는 중','{r}에서 실험 도구를 살펴보는 중'],{hobby:1.5});
V('piano','hobby','piano','sit',[15,50],['{r}에서 피아노를 치는 중','{r}에서 피아노로 가볍게 연주하는 중'],{hobby:2},{hr:[9,22]});
V('guitar','hobby',['guitar','violin','instrument'],'stand',[15,45],['{r}에서 악기를 연주하는 중','{r}에서 악기를 조율하는 중'],{hobby:2},{hr:[9,22]});
V('chess','hobby','gametable','sit',[15,50],['{r}에서 혼자 체스를 두는 중','{r}에서 테이블에 앉아 보드게임을 펼쳐 둔 중'],{hobby:1.5});
V('game','hobby','console','stand',[25,90],['{r}에서 게임을 하는 중','{r}에서 게임기에 푹 빠진 중'],{hobby:1.8,tv:.8},{hr:[11,27]});
V('music','hobby','audio','stand',[10,40],['{r}에서 음악을 틀어 놓고 듣는 중','{r}에서 음악을 들으며 흥얼거리는 중'],{hobby:1.5,solitary:.3});
V('photo','hobby','camera','stand',[8,25],['{r}에서 카메라를 만지작거리는 중','{r}에서 사진을 고르는 중'],{hobby:1.8,outgoing:.4});
V('sew','hobby','sewing','stand',[15,45],['{r}에서 재봉틀로 바느질하는 중'],{hobby:1.8});
/* 집 가꾸기 */
V('vase_water','chore','vase','stand',[3,8],['{r}에서 꽃병의 물을 갈아 주는 중','{r}에서 꽃병에 새 꽃을 꽂는 중','{r}에서 꽃병의 꽃을 다듬는 중'],{plant:1.5,tidy:.6});
V('vase_smell','chore','vase','stand',[2,5],['{r}에서 꽃 냄새를 맡는 중'],{plant:1.2});
V('plant_water','chore',['plant','garden','veg'],'stand',[4,10],['{r}에서 화분에 물을 주는 중','{r}에서 식물의 시든 잎을 정리하는 중'],{plant:2,tidy:.5});
V('plant_smell','chore','flower','stand',[2,6],['{r}에서 꽃 냄새를 맡는 중','{r}에서 풀 내음을 맡으며 숨을 고르는 중'],{plant:1.5});
V('replant','chore',['plant','garden'],'stand',[10,25],['{r}에서 화분에 새로 흙을 채우는 중'],{plant:2},{rare:.4});
V('window_open','chore','__window','stand',[2,5],['{r}에서 창문을 열어 환기하는 중','{r}에서 창문을 닫는 중'],{tidy:.5},{hr:[6,22]});
V('window_clean','chore','__window','stand',[8,18],['{r}에서 창문을 닦는 중'],{tidy:2},{hr:[9,18],rare:.5});
V('laundry','chore','washer','stand',[5,12],['{r}에서 빨래를 돌리는 중','{r}에서 세탁물을 꺼내는 중'],{tidy:1},{hr:[8,21]});
V('boiler','chore','boiler','stand',[2,5],['{r}에서 보일러 온도를 확인하는 중']);
V('tidy_cab','chore',['cabinet','shelf'],'stand',[5,12],['{r}에서 수납장을 정리하는 중','{r}에서 물건을 제자리에 두는 중'],{tidy:1.5},{hr:[8,22]});
V('arrange','chore',['basket'],'stand',[3,8],['{r}에서 바구니를 정리하는 중']);
/* 반려동물 */
V('pet_dog','pet','dog','stand',[8,25],['{r}에서 강아지를 쓰다듬어 주는 중','{r}에서 강아지와 놀아 주는 중'],{pet:1.5});
V('pet_cat','pet','cat','stand',[8,25],['{r}에서 고양이를 쓰다듬는 중','{r}에서 고양이와 장난감으로 놀아 주는 중'],{pet:1.5});
V('pet_chicken','pet','chicken','stand',[4,10],['{r}에서 닭에게 모이를 주는 중'],{pet:1.2});
V('pet_other','pet','animal','stand',[5,15],['{r}에서 동물을 살펴보는 중'],{pet:1});
/* 집 안 이동·기타 */
V('wander','wander',null,'stand',[1,3],[],{outdoor:.2},{special:'wander'});
V('idle','wander',null,'stand',[2,6],['{r}에서 서성이며 생각에 잠긴 중','{r}에서 가만히 서서 쉬는 중'],{});
V('phone_call','chat','phone','stand',[5,15],['{r}에서 전화로 이야기하는 중'],{social:1.5});
V('friend_msg','chat',null,'stand',[5,15],['{r}에서 친구에게 연락하는 중','{r}에서 친구와 메시지를 주고받는 중'],{social:1.2},{special:'friend',wishOnly:true});
/* 가구와 무관하게 프로필에서 유추되는 행동 — trait 가 프로필에 있을 때만 후보가 됨 */
V('f_stretch','rest',null,'stand',[5,15],['{r}에서 스트레칭으로 몸을 푸는 중','{r}에서 요가 자세로 호흡을 가다듬는 중'],{},{trait:'outdoor',hr:[6,22]});
V('f_workout','hobby',null,'stand',[15,35],['{r}에서 홈트레이닝으로 땀을 흘리는 중','{r}에서 가볍게 몸을 움직이며 운동하는 중'],{outdoor:1},{trait:'outdoor',hr:[6,21]});
V('f_hum','hobby',null,'stand',[5,20],['{r}에서 흥얼흥얼 노래를 부르는 중','{r}에서 좋아하는 멜로디를 흥얼거리는 중'],{hobby:1},{trait:'hobby'});
V('f_doodle','hobby',null,'stand',[8,25],['{r}에서 떠오른 아이디어를 수첩에 끄적이는 중'],{hobby:1},{trait:'hobby'});
V('f_quote','read',null,'stand',[5,15],['{r}에서 읽었던 책의 한 구절을 곱씹는 중','{r}에서 다음에 읽을 책을 떠올리는 중'],{reader:1},{trait:'reader'});
V('f_plan','work',null,'stand',[8,20],['{r}에서 오늘 할 일을 수첩에 적는 중','{r}에서 해야 할 일의 순서를 정리하는 중'],{worker:1},{trait:'worker'});
V('f_daydream','rest',null,'stand',[5,20],['{r}에서 조용히 멍하니 생각에 잠긴 중','{r}에서 혼자만의 시간을 즐기는 중'],{solitary:1},{trait:'solitary'});
V('f_recipe','eat',null,'stand',[6,15],['{r}에서 새로운 요리 레시피를 찾아보는 중'],{cook:1},{trait:'cook',hr:[9,20]});
V('f_snack','eat',null,'stand',[4,10],['{r}에서 주머니에 넣어 둔 간식을 우물거리는 중'],{foodie:1},{trait:'foodie',hr:[10,22]});
V('f_sweep','chore',null,'stand',[6,15],['{r}에서 먼지를 털고 바닥을 쓸어 내는 중','{r}에서 눈에 띄는 물건을 제자리에 두는 중'],{tidy:1},{trait:'tidy',hr:[8,21]});
V('f_social','chat',null,'stand',[5,15],['{r}에서 휴대폰으로 친구들 소식을 확인하는 중','{r}에서 안부 메시지를 보내는 중'],{social:1},{trait:'social'});
V('f_video','tv',null,'stand',[10,30],['{r}에서 휴대폰으로 영상을 보는 중'],{tv:1},{trait:'tv'});
V('f_style','wake',null,'stand',[5,12],['{r}에서 휴대폰으로 옷 구경을 하는 중','{r}에서 오늘의 코디를 상상해 보는 중'],{fashion:1},{trait:'fashion',hr:[8,22]});
V('f_plantinfo','chore',null,'stand',[5,12],['{r}에서 식물 키우는 법을 찾아보는 중'],{plant:1},{trait:'plant'});
V('f_petinfo','pet',null,'stand',[5,12],['{r}에서 동물 영상을 구경하는 중'],{pet:1},{trait:'pet'});
V('f_insomnia','rest',null,'stand',[10,25],['{r}에서 잠이 오지 않아 뒤척이는 중','{r}에서 불을 낮추고 밤 시간을 보내는 중'],{nightowl:1},{trait:'nightowl',hr:[23,27]});
V('f_likes','rest',null,'stand',[6,20],['{r}에서 {L}에 대해 곰곰이 생각하는 중','{r}에서 {L} 생각에 빠진 중','{r}에서 {L}을(를) 떠올리며 미소 짓는 중'],{},{likes:true,rare:.8});
V('prep_out','wake',null,'stand',[4,10],['{r}에서 외출 준비를 하는 중','{r}에서 가방을 챙기며 나갈 채비를 하는 중'],{},{special:'prep',internal:true});
/* 둘 이상이 하는 대화 */
V('chat_sofa','chat','sofa','sit',[10,35],['{r}에서 소파에 앉아 {p}와(과) 이야기하는 중','{r}에서 {p}와(과) 소파에서 수다를 떠는 중'],{social:1.8},{pair:true,cp:['{r}에서 {p}에게 어깨를 기대고 이야기하는 중','{r}에서 소파에서 {p}와(과) 손을 잡고 도란도란 이야기하는 중']});
V('chat_table','chat','dining','sit',[12,40],['{r}에서 식탁에서 {p}와(과) 이야기를 나누는 중','{r}에서 {p}와(과) 마주 앉아 수다를 떠는 중'],{social:1.8},{pair:true,cp:['{r}에서 {p}와(과) 마주 앉아 웃으며 이야기하는 중']});
V('chat_chair','chat','chair','sit',[10,30],['{r}에서 의자에 앉아 {p}와(과) 이야기하는 중','{r}에서 의자를 당겨 앉아 {p}와(과) 수다를 떠는 중'],{social:1.6},{pair:true,cp:['{r}에서 의자를 가까이 당겨 앉아 {p}와(과) 속삭이는 중']});
V('chat_stand','chat',null,'stand',[6,20],['{r}에서 {p}와(과) 서서 이야기하는 중','{r}에서 {p}에게 말을 거는 중'],{social:1.5},{pair:true,cp:['{r}에서 {p}와(과) 눈을 맞추며 이야기하는 중']});
V('pillow','chat','bed','lie',[10,35],['{r}에서 침대에 누워 {p}와(과) 필로우톡을 하는 중'],{social:1},{pair:true,couple:true,hr:[21,27],cp:['{r}에서 침대에서 {p}와(과) 속닥속닥 필로우톡 중','{r}에서 침대에서 {p}에게 오늘 있었던 일을 이야기하는 중','{r}에서 {p}의 곁에 누워 도란도란 이야기하는 중']});
/* 외출 — 사유는 시각·성향으로 고름 */
/* 활동에 맞는 장소 이름 — 사용자가 방에 이름을 붙이지 않았을 때만 쓴다(붙였다면 그 이름을 존중) */
const RNAME={brush:'욕실',shave:'욕실',shower:'욕실',bath:'욕실',hairdry:'욕실',cook_stove:'주방',cook_counter:'주방',fridge:'주방',snack:'주방',coffee:'주방',tea_kettle:'주방',toast:'주방',dishes:'주방',water:'주방',
  sleep_bed:'침실',nap_bed:'침실',lie_bed:'침실',wake_stretch:'침실',read_bed:'침실',pillow:'침실',tv_bed:'침실',sleep_hammock:'침실'};
VERBS.forEach(v=>{if(RNAME[v.id])v.rname=RNAME[v.id]});
const OUT_WHY=[
 {id:'jog',t:'아침 운동을 하러 나갔어요',hr:[5,9],w:{outdoor:2},dur:[30,70]},
 {id:'walk',t:'산책하러 나갔어요',hr:[6,22],w:{outdoor:1.5,outgoing:.5},dur:[30,90]},
 {id:'shop',t:'장을 보러 나갔어요',hr:[9,20],w:{foodie:.6,cook:1},dur:[40,90]},
 {id:'friend',t:'친구를 만나러 외출했어요',hr:[11,22],w:{social:2.5,outgoing:1},dur:[90,240]},
 {id:'cafe',t:'카페에 갔어요',hr:[9,21],w:{tea:1.5,social:.5},dur:[60,150]},
 {id:'library',t:'도서관에 책을 읽으러 갔어요',hr:[9,19],w:{reader:2.5},dur:[90,200]},
 {id:'work',t:'일하러 나갔어요',hr:[7,18],w:{worker:2},dur:[180,420]},
 {id:'hobby',t:'취미 활동을 하러 나갔어요',hr:[10,20],w:{hobby:2.5},dur:[90,200]},
 {id:'errand',t:'볼일을 보러 나갔어요',hr:[9,18],w:{},dur:[40,120]},
 {id:'dinner',t:'저녁 약속이 있어서 나갔어요',hr:[17,22],w:{social:2,outgoing:1},dur:[120,240]},
 {id:'drink',t:'한잔하러 나갔어요',hr:[18,24],w:{drinker:2.5,social:1},dur:[120,240]}];

/* ---------- 시간대 기본 가중치 (서울 시각 0~23시) ---------- */
const R=(a)=>{const o=[];a.forEach(([s,e,v])=>{for(let h=s;h<=e;h++)o[h]=v});return o};
const BASE={
 sleep:R([[0,5,10],[6,6,3],[7,7,1],[8,9,.4],[10,12,.15],[13,14,.5],[15,21,.1],[22,22,2.5],[23,23,7]]),
 wake:R([[0,5,.05],[6,6,6],[7,7,8],[8,8,4],[9,9,1.5],[10,17,.4],[18,19,.7],[20,20,2],[21,21,4],[22,22,5],[23,23,3]]),
 eat:R([[0,5,.12],[6,6,1],[7,8,4],[9,9,1.5],[10,10,.4],[11,11,2],[12,12,8],[13,13,6],[14,14,1],[15,16,.5],[17,17,2],[18,18,8],[19,19,7],[20,20,2],[21,21,.8],[22,22,.5],[23,23,.3]]),
 rest:R([[0,5,.3],[6,8,.6],[9,11,1],[12,14,1.5],[15,17,2],[18,19,1.2],[20,22,2.5],[23,23,1]]),
 read:R([[0,5,.6],[6,8,.6],[9,11,1.5],[12,14,1],[15,17,2],[18,19,.8],[20,22,2.5],[23,23,1.5]]),
 work:R([[0,5,.3],[6,8,.3],[9,11,3],[12,13,1],[14,17,3],[18,19,.8],[20,22,1.2],[23,23,.5]]),
 tv:R([[0,5,.3],[6,11,.3],[12,14,.8],[15,17,1],[18,19,1.5],[20,23,3]]),
 hobby:R([[0,5,.3],[6,8,.3],[9,11,1.2],[12,14,.8],[15,17,2],[18,19,1],[20,22,1.8],[23,23,.5]]),
 chore:R([[0,5,.05],[6,8,.8],[9,11,2],[12,14,.6],[15,17,1.2],[18,19,1.2],[20,21,.8],[22,23,.2]]),
 pet:R([[0,5,.05],[6,8,.8],[9,21,.8],[22,23,.2]]),
 wander:R([[0,5,.1],[6,23,1]]),
 out:R([[0,5,0],[6,6,.2],[7,7,1.2],[8,8,1.5],[9,11,2.5],[12,13,1.5],[14,17,3],[18,19,1.5],[20,20,.6],[21,21,.2],[22,23,.05]]),
 chat:R([[0,5,.05],[6,8,.4],[9,11,.8],[12,14,1],[15,17,1.3],[18,20,1.8],[21,22,1.2],[23,23,.4]])};
/* 그룹별 성향 계수: 가중치 배수 = max(.12, 1 + Σ계수×성향값) — 확률만 조정하고 행동을 고정하지 않는다 */
const GT={sleep:{lazy:.8},wake:{tidy:.5,fashion:.8},eat:{foodie:.8,cook:.5},rest:{lazy:.8,homebody:.3},read:{reader:2.5},work:{worker:2.5,lazy:-.5},tv:{tv:2},hobby:{hobby:2.5},
  chore:{tidy:1.5,plant:.8,lazy:-.5},pet:{pet:2},wander:{outgoing:.3},out:{outgoing:1.8,outdoor:1.2,social:1,homebody:-.8,solitary:-.5,lazy:-.4},chat:{social:2.2,solitary:-.7}};
const mult=(A,co)=>{let m=1;for(const t in co)m+=co[t]*tv(A,t);return Math.max(.12,m)};
const WINDOW_KIND='__window';

/* ---------- 상태 접근 ---------- */
const rngFor=(ctx,c,st,salt)=>mulberry(hash(c.id+'|'+(st.n||0)+'|'+Math.floor(ctx.now/MIN)+'|'+(salt||'')));
const inHr=(hr,h)=>!hr||(hr[0]<=hr[1]?(h>=hr[0]&&h<hr[1]):(h>=hr[0]||h<hr[1]))||(hr[1]>24&&(h>=hr[0]||h<hr[1]-24));
const effHour=(A,hm)=>{let s=0;if(tv(A,'nightowl')>0)s=-2;else if(tv(A,'earlybird')>0)s=1.5;return ((hm+s)%24+24)%24};

/* =====================================================================
   5) 결정 — 한 캐릭터의 다음 행동 고르기
   ===================================================================== */
function posOf(W,p){const f=Math.max(0,Math.min(W.geo.floors.length-1,p.f|0));const raw=p.x==null?W.mid:p.x;const s=W.segAt(f,raw);return {f,x:s?W.clampX(s,raw,12):raw,seg:s}}
function exitSpot(W,rng){const ex=W.exits;if(!ex.length)return null;return ex.length===1?ex[0]:ex[Math.floor(rng()*ex.length)]}
function spotFor(W,it,pose,rng,slot){
  const s=W.segOf(it.seg),fl=W.geo.floors[it.f],off=(rng()-.5)*Math.min(it.w*.5,60)+(slot||0)*Math.max(40,it.w*.28);
  let dy=0;if(pose==='sit')dy=Math.min(it.h*.3,35);if(pose==='lie')dy=Math.min(it.h*.85,it.kinds.includes('sofa')?it.h*.55:it.h*.85);
  return {f:it.f,x:W.clampX(s,it.x+off,pose==='lie'?Math.min(60,(s.right-s.left)/2-1):20),e:(it.e||fl.e)+dy,dy:it.e>fl.e+3&&pose==='stand'?0:dy,pose,uid:it.uid,seg:s.id}}
function occupancy(ctx,exceptId){const occ={};for(const o of ctx.chars){if(o.id===exceptId)continue;const p=ctx.getPlace(o.id);if(p.mode==='home'&&p.tgt)occ[p.tgt]=(occ[p.tgt]||0)+1}return occ}
const isCouple=(A,B)=>A.facts.partners.includes(B.name);
function coupleOf(ctx,c,A){return ctx.chars.find(o=>o.id!==c.id&&A.facts.partners.includes(o.name))||null}

function candidates(ctx,c,A,st,pos,hm,opts){
  opts=opts||{};const W=ctx.world,R=W.reach(pos.seg?pos.seg.id:0),H=Math.floor(hm),out=[];
  const others=ctx.chars.filter(o=>o.id!==c.id&&ctx.getPlace(o.id).mode==='home'&&ctx.getPlace(o.id).house===ctx.houseId);
  const occ=occupancy(ctx,c.id);
  const itemsR=W.items.filter(it=>R.has(it.seg));
  const have=k=>itemsR.some(it=>it.kinds.includes(k));
  const winOps=W.windows.filter(w=>R.has(w.seg));
  for(const v of VERBS){
    if(v.internal||v.special==='prep')continue;
    if(v.wishOnly&&!opts.wish)continue;
    if(v.req&&!v.req(A))continue;
    if(v.trait&&!(tv(A,v.trait)>0))continue;
    if(v.likes){(A.likes||[]).forEach(L=>out.push({v,seg:pos.seg,dist:0,like:L}));continue}
    if(v.hr&&!inHr(v.hr,H)&&!opts.ignoreHr)continue;
    if(v.nap&&(H>=21||H<6)&&!opts.ignoreHr&&have('bed'))continue;
    if(v.nobed&&have('bed'))continue;
    if(!v.nap&&v.g==='sleep'&&v.id.startsWith('sleep_')&&!opts.sleepAnyTime&&H>=9&&H<20&&!opts.wish)continue;
    if(v.nap&&!(H>=21||H<6)&&H>=6&&false)continue;
    if(v.need&&!v.need.some(k=>have(k)))continue;
    if(v.pair){   // 상대가 필요한 행동
      if(!others.length)continue;
      for(const o of others){
        const pp=ctx.getPlace(o.id);if(pp.action==='sleep'&&!(v.couple))continue;
        const B=ctx.analysis(o);if(v.couple&&!isCouple(A,o))continue;
        const oPos=posOf(W,pp);if(!oPos.seg||!R.has(oPos.seg.id))continue;
        const acc=.3+.5*Math.max(0,tv(B,'social'))-.2*Math.max(0,tv(B,'solitary'));
        const r0=mulberry(hash(c.id+o.id+'acc'+(st.n||0)+Math.floor(ctx.now/MIN)));
        if(!opts.wish&&r0()>acc)continue;
        if(v.k){for(const it of itemsR){if(!it.kinds.some(k=>v.k.includes(k)))continue;if((occ[it.uid]||0)>=capacity(it,v.couple||isCouple(A,o)))continue;
          out.push({v,item:it,partner:o,couple:isCouple(A,o),dist:Math.abs(it.x-pos.x)+(it.f!==pos.f?400:0)})}}
        else out.push({v,partner:o,couple:isCouple(A,o),dist:Math.abs(oPos.x-pos.x)+(oPos.f!==pos.f?400:0)})}
      continue}
    if(v.k&&v.k[0]===WINDOW_KIND){
      for(const w of winOps)out.push({v,win:w,dist:Math.abs(w.x-pos.x)+(w.f!==pos.f?400:0)});continue}
    if(v.special==='wander'){   // 다른 방으로
      const segs=[...R].map(i=>W.segOf(i)).filter(s=>!pos.seg||s.id!==pos.seg.id);
      segs.forEach(s=>out.push({v,seg:s,dist:Math.abs((s.left+s.right)/2-pos.x)+(s.f!==pos.f?400:0)}));continue}
    if(!v.k){   // 가구 없이 가능한 행동(서성임, 친구 연락)
      out.push({v,seg:pos.seg,dist:0});continue}
    for(const it of itemsR){
      if(!it.kinds.some(k=>v.k.includes(k)))continue;
      if(v.id==='sleep_bed'||v.id==='nap_bed'||v.id==='lie_bed'||v.id==='read_bed'||v.id==='tv_bed'||v.id==='wake_stretch'){
        const cp=coupleOf(ctx,c,A);const cap=(cp&&it.w>=130)?2:1;if((occ[it.uid]||0)>=cap)continue}
      else if((occ[it.uid]||0)>=capacity(it,false))continue;
      if(v.seatKind){   // TV 시청: 같은 방에 앉을 곳이 있어야 함
        const seat=W.bySeg.get(it.seg).find(s=>s.kinds.includes(v.seatKind)&&(occ[s.uid]||0)<capacity(s,false));if(!seat)continue;
        out.push({v,item:it,seat,dist:Math.abs(seat.x-pos.x)+(seat.f!==pos.f?400:0)});continue}
      out.push({v,item:it,dist:Math.abs(it.x-pos.x)+(it.f!==pos.f?400:0)})}}
  return out}
function capacity(it,couple){if(it.kinds.includes('chair')||it.kinds.includes('bench')&&it.w<90)return 1;if(it.kinds.includes('bed')||it.kinds.includes('hammock'))return couple?2:1;if(it.kinds.includes('sofa'))return Math.max(1,Math.floor(it.w/90));if(it.kinds.some(k=>k==='dining'||k==='gametable'))return Math.max(1,Math.floor(it.w/60));return 2}

function canExit(ctx,pos){const W=ctx.world;if(!W.exits.length||!pos.seg)return false;const R=W.reach(pos.seg.id);return W.exits.some(e=>{const s=W.segAt(e.f,e.x);return s&&R.has(s.id)})}

function decide(ctx,c,p,st,reason){
  const W=ctx.world,A=ctx.analysis(c),now=ctx.now,sp=seoul(now),hm=sp.hm,H=sp.hour;
  const rng=rngFor(ctx,c,st);
  const stUp={n:(st.n||0)+1,updatedAt:now,dirty:false};
  let pos=posOf(W,p),fromE=p.mode==='out'?null:undefined;
  const moves=[];
  /* 외출 중이면: 아직 시간이 안 됐으면 유지, 지났으면 귀가 */
  let returned=false;
  if(p.mode==='out'){
    if(st.outUntil&&now<st.outUntil&&!reason){ctx.setSim(c.id,{decideAt:st.outUntil});return null}
    const ex=W.exits[0];if(!ex){ctx.setPlace(c.id,{mode:'home',f:0,x:W.mid});pos=posOf(W,{f:0,x:W.mid})}
    else{const e=(st.outFrom&&W.exits.find(x=>x.side===st.outFrom))||ex;pos=posOf(W,{f:e.f,x:e.x});ctx.setPlace(c.id,{mode:'home',f:e.f,x:pos.x,pose:'stand',dy:0,tgt:null});returned=true;moves.push({id:c.id,from:{f:e.f,x:e.x<W.geo.W/2?W.geo.in0-60:W.geo.in1+60,e:W.floorE(e.f)},route:[{f:e.f,x:pos.x,e:W.floorE(e.f)}],enter:true})}}
  const from={f:pos.f,x:pos.x,e:p.mode==='out'||returned?W.floorE(pos.f):(p.e!=null?p.e:W.floorE(pos.f))};
  const recent=(st.recent||[]).slice(-4);
  const bias=st.bias&&st.bias.until>now?st.bias:null;
  /* 대기 중인 후속 행동(외출 준비 → 외출) */
  let wish=st.wish&&!st.wish.done&&now-st.wish.at<30*MIN?st.wish:null;   // 사용자 선택은 30분이 지나면 효력이 사라짐
  let then=wish?null:st.then;
  if(then&&now-(st.decideAt||0)>30*MIN)then=null;   // 준비가 끝난 지 오래된 후속 행동은 버린다(오프라인 동안의 일을 뒤늦게 실행하지 않음)   // 사용자가 새로 고른 방향이 있으면 대기 중이던 후속 행동보다 우선
  const setStop=(patch)=>ctx.setSim(c.id,{...stUp,...patch});
  const doOut=(why,durMin)=>{
    const ex=exitSpot(W,rng);if(!ex)return false;
    const seg=W.segAt(ex.f,ex.x);if(!pos.seg||!W.reach(pos.seg.id).has(seg.id))return false;
    const rt=W.route({f:pos.f,x:pos.x},{f:ex.f,x:ex.x});if(!rt)return false;
    const dur=durMin||Math.round(why.dur[0]+rng()*(why.dur[1]-why.dur[0]));
    ctx.setPlace(c.id,{mode:'out',action:'out',verb:'out_'+why.id,tgt:null,pose:'stand',dy:0,f:ex.f,x:ex.x,say:why.t,e:null});
    setStop({decideAt:now+dur*MIN,outUntil:now+dur*MIN,outFrom:ex.side,then:null,wish:wish?{...wish,done:true}:null,recent:[...recent,'out'].slice(-5)});
    moves.push({id:c.id,from,route:rt,leave:true});return true};
  const pickWhy=(forced)=>{const cand=OUT_WHY.filter(o=>inHr(o.hr,H)||forced&&forced===o.id);
    if(forced){const f=OUT_WHY.find(o=>o.id===forced);if(f)return f}
    const cands=cand.filter(o=>!(o.id==='drink'&&A.facts.adult===false)&&!(o.id==='work'&&tv(A,'worker')<=0&&rng()<.7));
    return wpick(rng,cands.length?cands:OUT_WHY.filter(o=>o.id==='errand'),o=>mult(A,o.w))};
  if(then&&then.k==='out'){
    const why=OUT_WHY.find(o=>o.id===then.why)||pickWhy();
    setStop({then:null});if(inHr(why.hr,H)&&canExit(ctx,pos)&&doOut(why,then.dur))return moves;st={...st,then:null}}
  else if(st.then)setStop({then:null});
  /* 사용자 선택(wish)이 있으면 가장 먼저 반영 */
  let forcedGroup=null,forcedVerb=null,bonusGroup=null;
  if(wish){
    const wo=WISHES.find(w=>w.id===wish.k);
    if(wo){
      if(wo.out){const why=OUT_WHY.find(o=>o.id===wo.out);const chk=wishCheck(ctx,c,wo);
        if(chk.ok){setStop({wish:{...wish,done:true},bias:{g:'out',until:now+120*MIN},then:null});const sd=ctx.getSim(c.id);
          // 외출 준비 후 나가기
          const prep=prepVerb(ctx,c,A,pos,rng);
          if(prep&&rng()<.6){return startVerb(ctx,c,A,p,st,pos,from,moves,prep,rng,stUp,hm,recent,{then:{k:'out',why:wo.out},dur:[1,2]})}
          if(doOut(why))return moves}
        ctx.setSim(c.id,{...stUp,wish:{...wish,done:true,fail:chk.why}});wish=null}
      else if(wo.friend){
        const v=VERBS.find(x=>x.id==='friend_msg');
        const meet=canExit(ctx,pos)&&H>=11&&H<22&&rng()<.35+.35*Math.max(0,tv(A,'social'))+.15*Math.max(0,tv(A,'outgoing'));
        const phone=W.items.find(it=>it.kinds.includes('phone')&&W.reach(pos.seg.id).has(it.seg));
        const cand={v:phone?VERBS.find(x=>x.id==='phone_call'):v,item:phone||null,seg:pos.seg,dist:0};
        ctx.setSim(c.id,{...stUp,wish:{...wish,done:true},bias:{g:'chat',until:now+90*MIN}});
        return startVerb(ctx,c,A,p,st,pos,from,moves,cand,rng,stUp,hm,recent,meet?{then:{k:'out',why:'friend'}}:{},true)}
      else{forcedGroup=wo.g;bonusGroup=wo.g;ctx.setSim(c.id,{bias:{g:wo.g,until:now+90*MIN}})}}}
  /* 일반 선택: 그룹 → 행동 */
  const cs=candidates(ctx,c,A,st,pos,hm,{wish:!!forcedGroup,ignoreHr:!!forcedGroup,sleepAnyTime:!!forcedGroup&&forcedGroup==='sleep'});
  const groups={};cs.forEach(x=>(groups[x.v.g]=groups[x.v.g]||[]).push(x));
  const eh=effHour(A,hm),eH=Math.floor(eh);
  if(!forcedGroup&&canExit(ctx,pos)&&!groups.out){groups.out=[{v:{id:'out',g:'out'},special:true}]}
  const gnames=Object.keys(groups).filter(g=>!forcedGroup||g===forcedGroup);
  if(forcedGroup&&!gnames.length){ctx.setSim(c.id,{...stUp,wish:{...wish,done:true,fail:'지금은 할 수 없어요'}});return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent)}
  const lastOut=st.lastBack&&now-st.lastBack<60*MIN;
  const gw=g=>{let w=(BASE[g]?BASE[g][g==='out'||g==='chat'?H:eH]:1)*mult(A,GT[g]||{});
    if(bias&&bias.g===g)w*=1.9;if(forcedGroup===g)w=1;
    if(g==='out'&&lastOut)w*=.2;if(g==='sleep'&&H>=9&&H<20&&tv(A,'lazy')<=0)w*=.5;return w};
  const rg=wpick(rng,gnames,gw);
  if(!rg)return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent);
  if(rg==='out'){
    const why=pickWhy();const prep=prepVerb(ctx,c,A,pos,rng);
    if(canExit(ctx,pos)){if(prep&&rng()<.65)return startVerb(ctx,c,A,p,st,pos,from,moves,prep,rng,stUp,hm,recent,{then:{k:'out',why:why.id}});
      if(doOut(why))return moves}
    return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent)}
  const list=groups[rg];
  const cw=x=>{let w=mult(A,x.v.w||{});if(x.v.rare)w*=x.v.rare;
    const rc=recent.filter(r=>r===x.v.id).length;w*=rc?(recent[recent.length-1]===x.v.id?.12:.4):1;
    w*=1/(1+(x.dist||0)/700);
    if(x.v.near&&x.item&&W.bySeg.get(x.item.seg).some(i=>i.kinds.includes(x.v.near)))w*=2.2;
    if(x.v.id==='wander'||x.v.id==='idle')w*=.5;
    if(x.item&&W.bySeg.get(x.item.seg)&&x.v.k&&x.v.k.includes('bookshelf')&&tv(A,'reader')>0)w*=1.3;
    if(x.couple)w*=2;
    if(x.item&&x.v.id==='sleep_bed'){const cp=coupleOf(ctx,c,A);if(cp){const pq=ctx.getPlace(cp.id);if(pq.mode==='home'&&pq.verb==='sleep_bed'&&pq.tgt===x.item.uid)w*=10}}   // 연인이 이미 자는 침대로
    return w};
  const ch=wpick(rng,list,cw);
  return startVerb(ctx,c,A,p,st,pos,from,moves,ch,rng,stUp,hm,recent,{})}

/* 행동이 바뀌는 간격: 행동 종류별 시간 단위 범위에서 랜덤(분). 잦은 갱신을 피하려는 설정 */
const SPAN={wake:[30,60],eat:[45,90],chore:[40,90],pet:[40,90],wander:[30,90],sleep:[40,90],rest:[60,150],read:[60,180],work:[60,180],tv:[60,150],hobby:[60,180],chat:[45,120]};
function spanOf(v,rng){const r=SPAN[v.g]||[60,120];return Math.round((r[0]+rng()*(r[1]-r[0]))/5)*5}
function prepVerb(ctx,c,A,pos,rng){
  const W=ctx.world;if(!pos.seg)return null;const R=W.reach(pos.seg.id);
  const its=W.items.filter(it=>R.has(it.seg)&&it.kinds.some(k=>['wardrobe','hanger','mirror','vanity','cosmetic','clothes','medical'].includes(k)));
  if(!its.length)return null;const it=pick(rng,its);return {v:VERBS.find(x=>x.id==='prep_out'),item:it,dist:0,prep:true}}
function decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent){
  const v=VERBS.find(x=>x.id==='idle');return startVerb(ctx,c,A,p,st,pos,from,moves,{v,seg:pos.seg,dist:0},rng,stUp,hm,recent,{})}

/* 문구 만들기: 자체 장소 표현("책상 앞에서", "침대에서")이 있으면 방 이름은 생략해 "~에서 ~에서"가 겹치지 않게 한다 */
function fillSay(tpl,room,partner){
  let t=tpl;if(t.startsWith('{r}에서 ')){const rest=t.slice(6);if(/^\S+( 앞)?에서\s/.test(rest))t=rest}
  return t.replace(/\{r\}/g,room).replace(/\{p\}와\(과\)/g,wa(partner||'')).replace(/\{p\}/g,partner||'')}
function startVerb(ctx,c,A,p,st,pos,from,moves,ch,rng,stUp,hm,recent,extra,keepWish){
  const W=ctx.world,v=ch.v,now=ctx.now,H=Math.floor(hm);
  let spot,partner=ch.partner||null,roomSeg;
  const standSeg=ch.seg||(pos.seg);
  if(v.special==='wander'){const s=ch.seg;const its=W.bySeg.get(s.id).filter(i=>!i.kinds.includes('window'));const it=its.length?pick(rng,its):null;
    const x=it?it.x+(rng()-.5)*Math.min(it.w,80):(s.left+s.right)/2;spot={f:s.f,x:W.clampX(s,x,24),e:W.floorE(s.f),dy:0,pose:'stand',uid:null,seg:s.id};roomSeg=s}
  else if(ch.win){const w=ch.win,s=W.segOf(w.seg);spot={f:w.f,x:W.clampX(s,w.x,40),e:W.floorE(w.f),dy:0,pose:'stand',uid:null,seg:s.id};roomSeg=s}
  else if(ch.item){const it=ch.seat||ch.item;
    let slot=0;if(v.pair&&partner)slot=1;
    spot=spotFor(W,it,v.pose,rng,ch.couple&&v.pose==='lie'?-.9:slot*0);roomSeg=W.segOf(it.seg);
    if(ch.seat&&v.seatKind){spot.pose=v.pose;}
    if(!ch.seat&&v.pose==='stand'&&it.kinds.includes('tv')){/* TV 앞에서 서기: 방 안쪽에서 TV를 바라봄 */spot.x=W.clampX(roomSeg,it.x+(it.x<(roomSeg.left+roomSeg.right)/2?1:-1)*(it.w/2+70),24)}}
  else{spot={f:standSeg.f,x:pos.x,e:W.floorE(standSeg.f),dy:0,pose:'stand',uid:null,seg:standSeg.id};roomSeg=standSeg;
    if(partner&&v.pair){const pp=ctx.getPlace(partner.id);const ps=posOf(W,pp);roomSeg=ps.seg;spot={f:ps.f,x:W.clampX(ps.seg,ps.x-70*(ps.x>W.mid?-1:1)*0-70,20),e:W.floorE(ps.f),dy:0,pose:'stand',uid:null,seg:ps.seg.id}}}
  const rt=W.route({f:pos.f,x:pos.x},{f:spot.f,x:spot.x,e:spot.e});
  if(!rt&&(spot.f!==pos.f||spot.seg!==(pos.seg&&pos.seg.id))){   // 막혀 있으면 이 방에서 서성임
    const idle=VERBS.find(x=>x.id==='idle');return startVerb(ctx,c,A,p,st,pos,from,moves,{v:idle,seg:pos.seg,dist:0},rng,stUp,hm,recent,{})}
  /* 지속시간 */
  let dur;
  if(v.dur)dur=Math.round(v.dur[0]+rng()*(v.dur[1]-v.dur[0]));
  else{ // 밤잠: 기상 시각(성향 반영)까지
    const wakeH=7+(tv(A,'nightowl')>0?2.2:0)-(tv(A,'earlybird')>0?1.2:0)+(rng()-.3)*.7;let until=wakeH-hm;while(until<=0)until+=24;
    dur=Math.round(until*60);if(dur<25)dur=25+Math.round(rng()*15);dur=Math.min(dur,600)}
  if(extra&&extra.dur)dur=Math.round(extra.dur[0]+rng()*(extra.dur[1]-extra.dur[0]));
  else if(v.dur&&!v.internal&&v.special!=='prep')dur=spanOf(v,rng);   // 갱신 주기는 '시간 단위'로 길게(랜덤)
  const room=(v.rname&&!roomSeg.named)?v.rname:roomSeg.name;let say;
  const cpl=ch.couple;
  const tpls=(cpl&&v.cp&&rng()<.6)?v.cp:(v.t&&v.t.length?v.t:null);
  if(v.special==='wander'){const fromSeg=pos.seg;say=fromSeg&&fromSeg.id!==roomSeg.id?`${fromSeg.name}에서 ${ro(roomSeg.name)} 자리를 옮기는 중`:`${eul(room)} 이리저리 걸어 다니는 중`}
  else say=fillSay(pick(rng,tpls||['{r}에서 지내는 중']),room,partner&&partner.name);
  if(ch.like)say=say.replace(/\{L\}을\(를\)/g,eul(ch.like)).replace(/\{L\}/g,ch.like);
  if(v.id==='sleep_bed'&&ch.item){const cp=coupleOf(ctx,c,A);if(cp){const pp=ctx.getPlace(cp.id);if(pp.mode==='home'&&pp.action==='sleep'&&pp.tgt===ch.item.uid&&ctx.getSim(cp.id).decideAt>now)say=fillSay(pick(rng,['{r}에서 {p}를 꼭 안고 잠든 중','{r}에서 {p}의 곁에서 서로 기대어 곤히 자는 중','{r}에서 {p}의 팔을 베고 잠든 중']),room,cp.name)}}
  const patch={mode:'home',action:v.g,verb:v.id,tgt:spot.uid||null,pose:spot.pose,dy:spot.dy||0,f:spot.f,x:Math.round(spot.x),say,e:spot.e,partner:partner?partner.id:null,seg:spot.seg};
  ctx.setPlace(c.id,patch);
  const nxt={...stUp,decideAt:now+dur*MIN,recent:[...recent,v.id].slice(-5),lastBack:(p.mode==='out'?now:st.lastBack),then:extra&&extra.then?extra.then:null,outUntil:0};
  if(!keepWish&&st.wish&&!st.wish.done)nxt.wish={...st.wish,done:true};
  ctx.setSim(c.id,nxt);
  moves.push({id:c.id,from,route:rt||[],final:patch});
  /* 상대가 있는 행동: 상대도 같은 시각까지 같은 자리 근처에서 같은 행동 */
  if(partner&&v.pair){
    const pst=ctx.getSim(partner.id),pp=ctx.getPlace(partner.id),ppos=posOf(W,pp);
    const B=ctx.analysis(partner);let ps;
    if(ch.item){ps=spotFor(W,ch.seat||ch.item,v.pose,mulberry(hash(partner.id+now)),1.4)}else{ps={f:spot.f,x:W.clampX(W.segOf(spot.seg),spot.x+80,20),e:W.floorE(spot.f),dy:0,pose:'stand',uid:null,seg:spot.seg}}
    const prt=W.route({f:ppos.f,x:ppos.x},{f:ps.f,x:ps.x,e:ps.e});
    if(prt||ps.seg===(ppos.seg&&ppos.seg.id)){
      const tp=(ch.couple&&v.cp&&rng()<.6)?v.cp:v.t;const psay=fillSay(pick(rng,tp),room,c.name);
      const pfrom={f:ppos.f,x:ppos.x,e:pp.e!=null?pp.e:W.floorE(ppos.f)};
      ctx.setPlace(partner.id,{mode:'home',action:v.g,verb:v.id,tgt:ps.uid||null,pose:ps.pose,dy:ps.dy||0,f:ps.f,x:Math.round(ps.x),say:psay,e:ps.e,partner:c.id,seg:ps.seg});
      ctx.setSim(partner.id,{...pst,n:(pst.n||0)+1,updatedAt:now,decideAt:now+dur*MIN,recent:[...(pst.recent||[]),v.id].slice(-5),then:null});
      moves.push({id:partner.id,from:pfrom,route:prt||[],final:ctx.getPlace(partner.id)})}}
  return moves}

/* =====================================================================
   6) 사용자 선택(행동 방향)
   ===================================================================== */
const WISHES=[
 {id:'read',label:'집에서 책 읽기',g:'read',need:'책이 있는 곳(책장·책)이 필요해요'},
 {id:'eat',label:'식사하기',g:'eat',need:'주방·식탁·냉장고 같은 가구가 필요해요'},
 {id:'sleep',label:'잠깐 자기',g:'sleep',need:'침대나 소파가 필요해요'},
 {id:'rest',label:'쉬기',g:'rest',need:'소파·의자·침대 같은 쉴 곳이 필요해요'},
 {id:'work',label:'작업하기',g:'work',need:'책상이나 노트북이 필요해요'},
 {id:'tv',label:'TV 보기',g:'tv',need:'TV가 필요해요'},
 {id:'hobby',label:'취미 즐기기',g:'hobby',need:'취미에 쓸 가구(악기·이젤 등)가 필요해요'},
 {id:'care',label:'씻고 단장하기',g:'wake',need:'욕실·거울·옷장 같은 가구가 필요해요'},
 {id:'walk',label:'산책하러 나가기',out:'walk',need:'바깥으로 나가는 문이 필요해요'},
 {id:'friend',label:'친구에게 연락하기',friend:true,need:''},
 {id:'chat',label:'다른 캐릭터와 대화하기',g:'chat',need:'같은 집에 이동할 수 있는 다른 캐릭터가 필요해요'}];
function wishCheck(ctx,c,wo){
  const p=ctx.getPlace(c.id);if(p.mode==='out'&&wo.id!=='walk')return {ok:false,why:'지금은 집에 없어요'};
  const A=ctx.analysis(c),W=ctx.world,pos=posOf(W,p),H=seoul(ctx.now).hour;
  if(p.mode==='out')return {ok:false,why:'이미 외출 중이에요'};
  if(wo.out){if(!canExit(ctx,pos))return {ok:false,why:W.exits.length?'현관까지 이어지는 길이 막혀 있어요':'바깥으로 나가는 문(1층 외벽 문)이 없어요'};
    if(H>=23||H<5)return {ok:false,why:'서울 시각으로 늦은 밤이라 지금은 나가기 어려워요'};return {ok:true}}
  if(wo.friend)return {ok:true};
  const st=ctx.getSim(c.id);
  const cs=candidates(ctx,c,A,st,pos,seoul(ctx.now).hm,{wish:true,ignoreHr:true,sleepAnyTime:true}).filter(x=>x.v.g===wo.g);
  if(!cs.length)return {ok:false,why:wo.need||'지금은 할 수 없어요'};
  return {ok:true}}
const ensure=ctx=>{if(!ctx.analysis)ctx.analysis=c=>analyze(c.profile,c.name,ctx.chars||[]);return ctx};
function wishOptions(ctx,c){ensure(ctx);return WISHES.map(w=>{const r=wishCheck(ctx,c,w);return {id:w.id,label:w.label,ok:r.ok,why:r.ok?'':r.why}})}
function setWish(ctx,c,id){
  ensure(ctx);
  const wo=WISHES.find(w=>w.id===id);if(!wo)return {ok:false,why:'알 수 없는 선택이에요'};
  const r=wishCheck(ctx,c,wo);if(!r.ok)return r;
  ctx.setSim(c.id,{wish:{k:id,at:ctx.now,done:false},decideAt:0});return {ok:true}}

/* =====================================================================
   7) 한 집 전체 갱신 — 접속·관찰 화면을 열 때와 주기 확인 때 호출
   ===================================================================== */
/* 도면이 바뀐 뒤(저장된 새 버전) 캐릭터 상태를 현재 도면에 맞게 필요한 만큼만 고친다.
   프로필·생활 기록(recent, n, likes 등)은 건드리지 않고 위치·대상 가구·자세만 보정한다. 고친 내용은 ctx.fixed 에 담는다. */
function revalidate(ctx){
  const W=ctx.world,fixed=ctx.fixed=ctx.fixed||[];
  const floors=Object.keys(W.byFloor).map(Number).sort((a,b)=>a-b);
  for(const c of ctx.chars){
    const p=ctx.getPlace(c.id);if(p.mode!=='home')continue;
    const st=ctx.getSim(c.id);let seg=W.segIn(p.f|0,p.x==null?W.mid:p.x);
    /* 1) 층이 없어졌거나 방 밖이면 가장 가까운 방 안으로 */
    if(!seg){
      let f=p.f|0;if(!W.byFloor[f]){if(!floors.length)continue;f=floors.reduce((b,k)=>Math.abs(k-f)<Math.abs(b-f)?k:b,floors[0])}
      const near=W.segAt(f,p.x==null?W.mid:p.x);if(!near)continue;
      ctx.setPlace(c.id,{f,x:W.clampX(near,p.x==null?W.mid:p.x,20),seg:near.id,e:null,tgt:null,pose:'stand',dy:0});ctx.setSim(c.id,{dirty:true});
      fixed.push({id:c.id,why:'pos'});seg=near;continue}
    if(p.seg!==seg.id)ctx.setPlace(c.id,{seg:seg.id});
    if(!p.tgt)continue;
    const it=W.items.find(i=>i.uid===p.tgt);
    /* 2) 쓰던 가구가 지워졌으면 행동 취소 → 다음 판단에서 다른 행동으로 대체 */
    if(!it){ctx.setPlace(c.id,{tgt:null,pose:'stand',dy:0,e:null});ctx.setSim(c.id,{dirty:true});fixed.push({id:c.id,why:'gone'});continue}
    /* 3) 가구가 다른 방·층으로 옮겨졌으면 캐릭터도 그 방의 새 자리로(같은 방 안에서 조금 옮겨진 경우는 그대로 둔다).
       따로 저장해 두는 값 없이 현재 위치와 가구 위치만 비교하므로 서버에 불필요한 쓰기가 생기지 않는다. */
    if(it.f!==(p.f|0)||it.seg!==seg.id){const sg=W.segOf(it.seg);ctx.setPlace(c.id,{f:it.f,x:sg?W.clampX(sg,it.x,10):it.x,seg:it.seg,e:null});fixed.push({id:c.id,why:'moved'})}}
  return fixed}
function stepHouse(ctx){
  const W=ctx.world,moves=[];
  const mine=ctx.chars.filter(c=>{const p=ctx.getPlace(c.id);return p.house===ctx.houseId}).sort((a,b)=>a.id<b.id?-1:1);
  ctx.chars=mine;revalidate(ctx);ctx.analysis=ctx.analysis||(c=>analyze(c.profile,c.name,mine));
  const cache=new Map();const an=ctx.analysis;ctx.analysis=c=>{if(!cache.has(c.id))cache.set(c.id,an(c));return cache.get(c.id)};
  for(const c of mine){
    const p=ctx.getPlace(c.id),st=ctx.getSim(c.id);
    const stale=p.mode==='home'&&p.tgt&&!W.items.some(i=>i.uid===p.tgt);
    const noSeg=p.mode==='home'&&!W.segAt(p.f|0,p.x==null?W.mid:p.x);
    const due=!(st.decideAt>ctx.now)||st.dirty||stale||noSeg||(st.wish&&!st.wish.done)||!p.say;
    if(!due)continue;
    const cur=ctx.getPlace(c.id);
    const mv=decide(ctx,c,cur,ctx.getSim(c.id),null);if(mv)moves.push(...mv)}
  reconcile(ctx);
  return mergeMoves(moves)}
/* 같은 캐릭터의 이동 구간을 하나의 경로로 이어 붙임(애니메이션용) */
function mergeMoves(ms){const by=new Map();for(const m of ms){const o=by.get(m.id);if(!o){by.set(m.id,{id:m.id,from:m.from,route:[...(m.route||[])],leave:!!m.leave,enter:!!m.enter,final:m.final||null})}else{o.route.push(...(m.route||[]));o.leave=o.leave||!!m.leave;if(m.final)o.final=m.final}}return [...by.values()]}
/* 같은 침대에서 함께 자는 연인의 문구 보정 */
function reconcile(ctx){
  const W=ctx.world,AFF=/안고|기대어|팔을 베고|곁에/;
  for(const c of ctx.chars){const p=ctx.getPlace(c.id);if(p.mode!=='home'||p.verb!=='sleep_bed'||!p.tgt)continue;
    const A=ctx.analysis(c),cp=coupleOf(ctx,c,A),seg=W.segOf(p.seg),room=seg&&!seg.named?'침실':(seg?seg.name:'');
    const together=cp&&(()=>{const pp=ctx.getPlace(cp.id);return pp.mode==='home'&&pp.verb==='sleep_bed'&&pp.tgt===p.tgt})();
    const r=mulberry(hash(c.id+'sl'+Math.floor((ctx.getSim(c.id).updatedAt||0)/MIN)));
    if(together&&!AFF.test(p.say||''))ctx.setPlace(c.id,{say:fillSay(pick(r,['{r}에서 {p}를 꼭 안고 잠든 중','{r}에서 {p}의 곁에서 서로 기대어 곤히 자는 중','{r}에서 {p}의 팔을 베고 잠든 중']),room,cp.name)});
    else if(!together&&AFF.test(p.say||''))ctx.setPlace(c.id,{say:fillSay(pick(r,['{r}에서 침대에서 곤히 자는 중','{r}에서 이불을 덮고 잠든 중','{r}에서 새근새근 자고 있는 중']),room,'')})}}

const api={fillSay,_candidates:candidates,_posOf:posOf,GROUPS,seoul,analyze,kindsOf,buildWorld,stepHouse,revalidate,wishOptions,setWish,VERBS,OUT_WHY,WISHES,BASE,hash,mulberry,KNAME,TRAIT_RULES,effHour,wa,ro};
root.Sim=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
