/* 비바리움 생활 시뮬레이션 — 외부 AI 없이 규칙(키워드·확률표)만으로 동작한다.
   - 화면(DOM)과 저장소를 직접 만지지 않는다. 상태 읽기/쓰기는 호출자가 넘겨 주는 함수(ctx)로만 한다 → 나중에 서버가 같은 함수를 돌려도 된다.
   - 기준 시각은 항상 Asia/Seoul(KST). 기기 시간대와 무관하다.
   - 오프라인 동안의 행동을 재생하지 않는다. 호출 시점의 서울 시각과 저장된 상태만 보고 "지금 어울리는 행동"을 고른다.
   - 같은 입력(캐릭터 id, 결정 횟수, 시각(분), 프로필, 도면)이면 항상 같은 결과가 나온다(결정적 난수) → 공유 단계에서 서버/클라이언트 결과가 일치한다.
   저장하는 최소 상태(캐릭터당): 집·위치·층·자세·현재 행동(그룹/세부)·가구 uid·말풍선 문구·외출 여부 | 다음 결정 시각·결정 횟수·최근 행동·대기 중인 후속 행동·사용자 선택(wish). 초 단위 저장 없음. */
(function(root){
'use strict';
const GROUPS={wake:'기상·정비',eat:'식사',sleep:'수면',rest:'휴식',read:'독서',work:'작업',tv:'TV 시청',study:'공부',hobby:'취미',chore:'집 가꾸기',pet:'반려동물',care:'반려동물 돌보기',p_sleep:'자기',p_rest:'쉬기',p_play:'놀기',p_roam:'돌아다니기',p_eat:'먹기',p_wait:'기다리기',wander:'집 안 이동',out:'외출',chat:'대화',unc:'주변 살피기'};
const MIN=60000;
/* 행동 갱신 시각은 서울 시계의 15분 단위(:00/:15/:30/:45)에 맞춘다. 10분 미만의 짧은 준비 동작은 그대로 둔다 */
const qd=(now,dur)=>dur>=10?Math.ceil((now+dur*MIN)/(15*MIN))*15*MIN:now+dur*MIN;

/* ---------- 서울 시각 ---------- */
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'});
function seoul(ms){const o={};fmt.formatToParts(new Date(ms)).forEach(p=>o[p.type]=p.value);return {hour:+o.hour,minute:+o.minute,weekday:o.weekday,day:+o.day,month:+o.month,year:+o.year,hm:+o.hour+(+o.minute)/60,text:o.hour+':'+o.minute}}

/* ---------- 공휴일 (한국, 직접 적어 둔 목록 — 2026·2027. 이 범위 밖의 해는 토·일만 쉬는 날로 봄) ---------- */
const HOLIDAYS=new Set(('2026-01-01 2026-02-16 2026-02-17 2026-02-18 2026-03-01 2026-03-02 2026-05-01 2026-05-05 2026-05-24 2026-05-25 2026-06-03 2026-06-06 2026-07-17 2026-08-15 2026-08-17 2026-09-24 2026-09-25 2026-09-26 2026-10-03 2026-10-05 2026-10-09 2026-12-25 '+
 '2027-01-01 2027-02-06 2027-02-07 2027-02-08 2027-02-09 2027-03-01 2027-05-01 2027-05-03 2027-05-05 2027-05-13 2027-06-06 2027-07-17 2027-07-19 2027-08-15 2027-08-16 2027-09-14 2027-09-15 2027-09-16 2027-10-03 2027-10-04 2027-10-09 2027-10-11 2027-12-25 2027-12-27').split(' '));
const p2=n=>String(n).padStart(2,'0');
const dateKey=sp=>sp.year+'-'+p2(sp.month)+'-'+p2(sp.day);
function isOffDay(ms){const sp=seoul(ms);return sp.weekday==='Sat'||sp.weekday==='Sun'||HOLIDAYS.has(dateKey(sp))}

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
/* 문장·절 단위로 읽어 내는 추가 규칙 — 4번째 값은 함께 추정되는 성향(약하게 반영) */
TRAIT_RULES.push(
 ['studious','공부·수험 준비 중',/공부|수험|시험 ?(준비|공부)|자격증|취준|공시|고시|토익|토플|수능|대학생|대학원생?|학생|스터디|임용|편입|어학|유학 ?준비/,{worker:.3}],
 ['dance','춤을 좋아함',/춤|댄스|안무|무용|발레|k-?pop 커버/i,{music:.3,hobby:.3}],
 ['sing','노래를 즐겨 부름',/노래 ?(부르|방|를 ?잘|를 ?좋아)|가수|보컬|합창|성악|랩|코인노래방/,{music:.4,hobby:.3}],
 ['boardgame','보드게임을 즐김',/보드 ?게임|체스|바둑|장기|할리갈리|루미큐브|카드 ?게임|퍼즐|마작|젠가|카탄/,{hobby:.4,social:.2}],
 ['gamer','게임을 즐김',/게임|게이머|콘솔|스팀|롤|e ?스포츠|플스|닌텐도/i,{hobby:.6,homebody:.4}],
 ['music','음악을 즐겨 들음',/음악 ?(감상|듣|을 ?좋아)|노래 ?(듣|를 ?좋아)|플레이리스트|재즈|클래식|밴드|힙합|LP|레코드|이어폰|헤드폰|디제잉|\bDJ\b/i,{rest:.3}],
 ['movie','영화·공연을 즐김',/영화관|시네마|극장|영화 ?(보|광|를 ?좋아)|뮤지컬|연극|콘서트|공연/,{tv:.4,outgoing:.3}],
 ['shopper','쇼핑을 즐김',/쇼핑|백화점|아울렛|득템|지름신|쇼핑몰|플렉스/,{fashion:.4,outgoing:.4}],
 ['nature','자연·바다를 좋아함',/바다|해변|여행|캠핑|등산|산을|숲|호수|낚시|자연/,{outgoing:.6,outdoor:.4}],
 ['sporty','운동을 즐김',/헬스|크로스핏|필라테스|러닝|마라톤|수영|축구|농구|배드민턴|테니스|골프|복싱|클라이밍|운동선수|근력|홈트/,{outdoor:.6}],
 ['shy','수줍음이 많음',/소심|수줍|부끄|낯가|내성적|말수가 ?적|조용한 ?성격|숫기/,{solitary:.6,homebody:.4}],
 ['creative','창작을 즐김',/창의|창작|상상|아이디어|예술|작곡|작사|소설을 ?쓰|웹툰|일러스트|디자인/,{hobby:.5,reader:.2}],
 ['caring','다정하고 챙겨 주는 편',/다정|배려|친절|살뜰|챙겨|돌봄|따뜻한|상냥|보살/,{social:.4,pet:.3,cook:.2}],
 ['busy','바쁘게 사는 편',/바쁘|분주|일정이 ?많|스케줄|동분서주|열정적/,{worker:.4,outgoing:.3,lazy:-.3}],
 ['sweet','단 음식·간식을 좋아함',/디저트|케이크|마카롱|초콜릿|아이스크림|단 ?것|달달/,{foodie:.6,tea:.3}],
 ['cat','고양이를 좋아함',/고양이|냥이|캣맘|집사/,{pet:.9,homebody:.3}],
 ['dog','강아지를 좋아함',/강아지|댕댕|반려견|멍멍|산책 ?친구/,{pet:.9,outdoor:.4}],
 ['sleepy','잠이 많음',/잠꾸러기|잠이 ?많|졸림|꿀잠|늦잠|낮잠/,{lazy:.5}],
 ['curious','호기심이 많음',/호기심|궁금|탐구|새로운 ?것|배우기|배움|취미 ?부자/,{reader:.3,hobby:.3,outgoing:.2}],
 /* v19: 연애 상호작용(viv-love.js)에서 쓰는 성격 */
 ['harsh','까칠함',/까칠|퉁명|날카로|예민|쌀쌀|냉랭|독설|톡톡 ?쏘/],
 ['angry','화가 많음',/화가 ?많|화를 ?잘|욱하|버럭|성격이 ?급|불같|짜증이 ?많|다혈질|분노/],
 ['negative','부정적임',/부정적|비관|투덜|불평|비판적|시니컬/],
 ['cynic','염세적임',/염세|냉소|허무|회의적|세상이 ?싫/],
 ['tsun','솔직하지 못함',/솔직하지|츤데레|속마음을 ?(숨|못)|삐딱|말과 ?행동이 ?다|자존심이 ?(세|강)/],
 ['bold','적극적임',/적극|직진|당돌|대담|용감|추진력|주도적|당당|거침없|리더십/,{social:.3}],
 ['playful','장난기가 많음',/장난|짓궂|유쾌|개구쟁이|익살|까불|농담|명랑/,{social:.3}],
 ['jealous','질투가 많음',/질투|시기심|독점욕|집착|소유욕|샘이 ?많/],
 ['aloof','무심함',/무심|무뚝뚝|덤덤|시큰둥|냉담|관심 ?없|쿨한/],
 ['smug','능글맞음',/능글|느물|뻔뻔|넉살|여우 ?같|바람둥이/,{social:.3}],
 ['inexpr','표현이 서툼',/표현이 ?서(툴|툼)|표현을 ?못|표현이 ?어렵|말주변이 ?없|감정 ?표현/]
);
const PARTNER_RE=/연인|애인|커플|남자친구|여자친구|남친|여친|부부|남편|아내|배우자|짝꿍|파트너|사귀|사랑하는 사이|결혼/;
const clauses=t=>String(t||'').split(/[.!?\n,;·~…]+/).map(s=>s.trim()).filter(Boolean);
const _acache=new Map();
function analyze(profile,name,others){
  profile=String(profile||'');others=others||[];
  const key=profile+'|'+name+'|'+others.map(o=>o.name+':'+o.profile).join('/');
  if(_acache.has(key))return _acache.get(key);
  const cl=clauses(profile),traits={},ev={};
  for(const [t,label,re,also] of TRAIT_RULES){let pos=0,neg=0;const hits=[];
    for(const c of cl){const m=re.exec(c);if(!m)continue;hits.push(m[0]);if(NEG.test(c)&&!(t==='tsun'&&/솔직하지/.test(c)))neg++;else pos++}
    if(!hits.length)continue;
    traits[t]=pos&&neg?.2:pos?Math.min(1,.55+.2*(pos-1)):-.6;ev[t]=[...new Set(hits)];
    if(also&&traits[t]>0)for(const k in also){const v=also[k]*traits[t];if(Math.abs(v)>Math.abs(traits[k]||0)&&!(traits[k]<0)){traits[k]=v;ev[k]=(ev[k]||[]).concat('('+label+' → 함께 추정)')}}}
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
  /* v18.2: 보편적인 직업명이 프로필에 있어도 '일하기' 가능 — 자유 직종은 집에서, 그 밖의 직업은 일하러 나감 */
  const JOB_FREE_RE=/작가|웹툰|일러스트레이터|삽화가|유튜버|스트리머|크리에이터|인플루언서|번역가|통역가|사진작가|사진가|화가|작곡가|프로듀서|시나리오|카피라이터|블로거|프리랜/;
  const JOB_NOUN_RE=/개발자|프로그래머|디자이너|마케터|회계사|세무사|노무사|건축가|건축사|한의사|치과의사|수의사|의사 선생|조무사|교수|강사|과학자|연구자|PD|피디|아나운서|검사|판사|법무사|변리사|감정평가사|직원|매니저|팀장|과장|부장|대리|사원|사장|대표님|상담사|상담원|사회복지사|영양사|미용사|헤어디자이너|네일아티스트|메이크업아티스트|셰프|제빵사|파티시에|조종사|파일럿|기장|농부|어부|택시 ?기사|운전기사|기사님|배달원|환경미화원|경비원|정비사|기술자|목수|전기기사|배관공|용접공|사서|학예사|큐레이터|디렉터|편집자|에디터|비서|트레이너|코치|감독|배우|가수|모델|간병인|돌봄|보육교사|유치원 ?교사|어린이집|학원 ?선생|조교|점장|캐셔|편의점|카페 ?(?:사장|알바)|약국|병원에서 ?일|학교에서 ?일|회사에서 ?일/;
  const KIN_RE=/(엄마|아빠|어머니|아버지|부모님?|할머니|할아버지|친구|동생|언니|누나|형|오빠|남편|아내|아들|딸|삼촌|이모|고모|연인|애인|남자친구|여자친구)(가|는|은|의|이|도)?\s/,SELF_RE=/나는|저는|본인|자신|내가|제가|직업은|직업이/;
  /* 직업: 고정 근무(직장인·알바)인지 자유 근무(프리랜서)인지. 부정·무직 표현이 있는 절은 무시 */
  /* v20: 신분(학생·백수·취준생·무직)은 직업 추정보다 먼저·우선 판별 — 본인을 가리키는 절에서만 인정(가족·친구 서술, 과거·부정·지망 표현은 제외) */
  const STAT_RE=[['student',/대학원생|대학생|고등학생|중학생|초등학생|휴학생|복학생|재수생|수험생|학생/],['jobseeker',/취준생|취업 ?준비|구직 ?중|구직자|공시생|고시생/],['jobless',/백수|놀고 ?먹/],['unemployed',/무직|직업이? ?없|직업 ?없/]];
  const STAT_BAD=/(학생|수험생)\s?(시절|때)|학생이었|학생였|졸업|전직|예전|과거|옛날|학생들?(을|를|에게|한테|이)\s?(가르|지도|돌보)|학생증|되고 ?싶|되려|꿈|지망|희망|아니|아닌|않|못/;
  let status=null;
  for(const c of cl.flatMap(x=>x.split(/이고|이며|인데|이지만|,/))){
    if(KIN_RE.test(c)&&!SELF_RE.test(c))continue;
    if(STAT_BAD.test(c)&&!/직업이? ?없/.test(c))continue;
    for(const [k,re] of STAT_RE){const m=re.exec(c);if(m){status={kind:k,words:[m[0]]};break}}
    if(status)break}
  let job=null;const JOBNEG=/백수|무직|퇴사|퇴직|은퇴|실직|휴직|방학|취준|구직/,JOB_ASPIRE=/지망|꿈|희망|되고 ?싶|되려|목표|준비 ?중/;
  for(const c of cl.flatMap(x=>x.split(/이고|이며|인데|이지만/))){if(NEG.test(c)||JOBNEG.test(c)||JOB_ASPIRE.test(c))continue;let k=null;
    if(/프리랜서|프리랜스|프리 ?랜서|자영업|1인 ?기업|외주|재택 ?근무|재택근무/.test(c))k='freelance';
    else if(/알바|아르바이트|파트 ?타임/.test(c))k='parttime';
    else if(KIN_RE.test(c)&&!SELF_RE.test(c)){/* 가족·친구의 직업은 이 캐릭터의 직업이 아님 */}
    else if(JOB_FREE_RE.test(c))k='freelance';
    else if(/직장인|회사원|회사에? ?다니|출근|퇴근|사무직|월급쟁이|근무|직장|공무원|은행원|간호사|의사|교사|선생님|연구원|엔지니어|기자|변호사|약사|점원|판매원|요리사|바리스타|승무원|경찰|소방관|군인|직업은|직업이|회사/.test(c)||JOB_NOUN_RE.test(c))k='office';
    if(k&&(!job||(k==='freelance')))job={kind:k,words:[(/프리랜서|프리랜스|자영업|외주|재택/.exec(c)||/알바|아르바이트|파트/.exec(c)||/직장인|회사원|출근|사무직|근무|직장|회사|직업/.exec(c)||[k])[0]]}}
  if(status&&job&&job.kind!=='parttime')job=null;   // 신분이 명시돼 있으면 프리랜서·직장인으로 추정하지 않음
  if(status)fl.push({k:'status',label:'신분',text:({student:'학생',jobseeker:'취준생',jobless:'백수',unemployed:'무직'})[status.kind]});
  if(job){job.night=/새벽|야근|야간|심야|밤샘|나이트|올빼미 ?근무|교대 ?근무/.test(profile);
    fl.push({k:'job',label:'직업',text:({office:'직장인',parttime:'아르바이트',freelance:'프리랜서'})[job.kind]+(job.night?' · 밤·새벽 근무 있음':'')})}
  const hobbyWords=[...new Set([...(likes||[]),...((ev.hobby||[]).filter(w=>w&&w!=='취미'&&w.length>=2))])].slice(0,6);
  /* 문장·절별 해석: 어떤 절에서 어떤 행동 성향을 읽었는지 */
  const clauseList=cl.map(c=>{const labs=[];for(const [t,label,re] of TRAIT_RULES){if(re.test(c))labs.push((NEG.test(c)?'싫어함: ':'')+label)}
    if(PARTNER_RE.test(c))labs.push('연인·배우자 관계');if(/프리랜서|프리랜스|알바|아르바이트|직장인|회사원|출근|직업|근무/.test(c)&&job)labs.push('직업 → 일하는 시간 규칙');return {text:c,labels:labs}}).filter(x=>x.text);
  const res={traits,ev,facts,job,status,hobbyWords,clauseList,likes:likes.slice(0,4),factList:fl,traitList:Object.keys(traits).map(t=>{const r=TRAIT_RULES.find(x=>x[0]===t);return {k:t,label:traits[t]<0?'싫어함: '+r[1].replace(/을 좋아함|를 좋아함|을 즐김|를 즐김/,''):r[1],v:traits[t],words:ev[t]}})};
  if(_acache.size>200)_acache.clear();_acache.set(key,res);return res}
const tv=(A,t)=>(A&&A.traits[t])||0;
const hobbyPool=A=>[...new Set([...(A.likes||[]),...(A.hobbyWords||[])])].filter(w=>w&&w!=='취미').slice(0,6);

/* =====================================================================
   2) 가구 분류 — 에셋 메타(분류·이름·태그)를 보고 "무엇으로 쓸 수 있는지(kind)"를 붙인다.
   ===================================================================== */
function kindsOf(m){
  const sub=m.sub||'',cat=m.cat||'',s=[m.name,m.en,(m.tags||[]).join(' '),m.sb,m.aid].join(' ').toLowerCase(),k=new Set();
  const T=re=>re.test(s);
  if(sub==='bed'){if(T(/아기|baby|crib|유아/))k.add('crib');else if(T(/해먹|hammock/))k.add('hammock');else k.add('bed')}
  if(sub==='sofa')k.add('sofa');
  if(sub==='door'&&cat==='architectural-elements')k.add('door');
  if(sub==='chair')k.add('chair');
  if(sub==='side-table-bench'&&T(/벤치|bench/))k.add('bench');
  if(sub==='desk')k.add('desk');
  if(cat!=='lighting'&&/사무실|워크스테이션|workstation|office|책상|데스크|desk/.test((s+' '+cat+' '+sub).toLowerCase()))k.add('office');   // v19: 이름·카테고리에 사무실·워크스테이션·책상·데스크가 든 에셋 → '일하기' 장소
  if(cat!=='lighting'&&T(/데스크|책상|테이블|(^|[^a-z])(desk|table)([^a-z]|$)/))k.add('studyfurn');   // 이름에 데스크·책상·테이블이 든 가구: 공부 장소로 쓸 수 있음
  if(sub==='dining-table'){k.add(T(/마작|mahjong/)?'gametable':'dining')}
  if(sub==='game-table')k.add('gametable');
  if(sub==='shelf'){if(T(/와인|wine/))k.add('wine');else if(T(/책장|bookcase|book|라이브러리|library/))k.add('bookshelf');else if(T(/신발|shoe/))k.add('shoes');else k.add('shelf')}
  if(T(/책 ?(더미|묶음)|book stack|book pile/))k.add('book');
  if(T(/꽃병|화병|vase/))k.add('vase');
  if(sub==='television'||(T(/(^|[^a-z])tv([^a-z]|$)|티비|텔레비/)&&!T(/안테나|aerial|antenna|cctv|씨씨티브이/)))k.add('tv');   // 이름에 TV 가 적힌 가구(TV 장식장 등)도 TV 보기 대상
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
  Object.values(byFloor).forEach(a=>{for(let i=0;i<a.length-1;i++)if(a[i].partX!=null){   // 내벽은 통과할 수 있음(문이 없어도). 외벽만 막힘
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
  const exits=(geo.exits||[]).slice();   // 문 에셋이 놓인 층이면 외벽에 문이 없어도 그 문으로 나갈 수 있음
  items.forEach(it=>{if(it.kinds.includes('door')&&!exits.some(e=>e.f===it.f&&Math.abs(e.x-it.x)<30))exits.push({f:it.f,x:it.x,side:'door:'+it.uid,item:it.uid})});
  return {geo,segs,segAt,segIn,items,bySeg,route,reach,floorE,clampX,windows,exits,byFloor,adj,
    segOf:id=>segs[id],mid:geo.mid!=null?geo.mid:geo.W/2,edgeOut:(f,x)=>{const E=geo.ext&&geo.ext[f];if(!E)return x<geo.W/2?geo.in0-60:geo.in1+60;return x<(E.l+E.r)/2?E.l-60:E.r+60}}}

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
V('bath','wake','bathtub','sit',[20,40],['{r}에서 욕조에 몸을 담그고 목욕하는 중','{r}에서 따뜻한 물에 느긋하게 목욕하는 중','{r}에서 욕조에서 목욕을 하며 피로를 푸는 중'],{lazy:.6,tidy:.4},{hr:[18,24]});
V('hairdry','wake','hairdryer','stand',[4,9],['{r}에서 머리를 말리는 중'],{fashion:.4},{});
/* v18: 욕실에서 하는 일상 행동 — 용변·세수·머리 감기·수건으로 머리 말리기·함께 목욕(연인·부부만) */
V('toilet','wake','toilet','sit',[3,8],['{r}에서 용변을 보는 중','{r}에서 화장실을 쓰는 중','{r}에서 볼일을 보는 중'],{},{});
V('facewash','wake','bsink','stand',[2,5],['{r}에서 세수를 하는 중','{r}에서 찬물로 얼굴을 씻는 중','{r}에서 세면대에서 얼굴을 닦는 중'],{tidy:.7});
V('hairwash','wake',['shower','bathtub'],'stand',[8,16],['{r}에서 머리를 감는 중','{r}에서 샴푸로 머리를 감고 헹구는 중','{r}에서 샴푸 거품을 헹구는 중'],{tidy:.7});
V('towel_hair','wake',['towel','bsink','shower'],'stand',[3,7],['{r}에서 수건으로 젖은 머리를 말리는 중','{r}에서 수건으로 머리의 물기를 닦는 중'],{tidy:.4},{rare:.6});
V('bath_pair','chat','bathtub','sit',[20,45],['{r}에서 {p}와(과) 함께 목욕하는 중'],{social:1.1,tidy:.4},{pair:true,couple:true,hr:[19,26],rare:.55,cp:['{r}에서 {p}와(과) 함께 욕조에 몸을 담그고 목욕하는 중','{r}에서 {p}와(과) 거품 목욕을 하며 도란도란 이야기하는 중','{r}에서 {p}와(과) 한 욕조에서 따뜻한 물에 느긋하게 목욕하는 중','{r}에서 {p}의 등을 밀어 주며 함께 목욕하는 중']});
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
V('job_free','work',['desk','laptop'],'stand',[40,120],['{r}에서 프리랜서 일을 하는 중','{r}에서 일감을 처리하는 중이에요','{r}에서 프리랜서 업무에 몰두하는 중'],{worker:1.2,busy:.4},{jobv:true,req:A=>!!(A.job&&A.job.kind==='freelance')});
V('hobby_free','hobby',null,'stand',[20,60],['{r}에서 {L}을(를) 즐기는 중','{r}에서 {L}에 푹 빠져 시간을 보내는 중','{r}에서 {L} 하며 여유를 즐기는 중'],{hobby:1.5,creative:.5},{hobbyFree:true,hr:[8,24]});
V('music_listen','rest',['sofa','chair','bed'],'sit',[20,60],['{r}에서 좋아하는 음악을 들으며 쉬는 중','{r}에서 이어폰을 끼고 음악에 빠진 중'],{music:1.6},{trait:'music'});
V('home_workout','rest',null,'stand',[15,40],['{r}에서 홈트레이닝으로 운동하는 중','{r}에서 스트레칭을 하며 몸을 푸는 중'],{sporty:1.5,outdoor:1},{trait:'sporty',hr:[6,22]});
V('game_play','hobby',['laptop','tv'],'sit',[30,90],['{r}에서 {GM}','{r}에서 {GM}'],{gamer:2},{trait:'gamer'});
V('write_desk','work','desk','stand',[25,80],['{r}에서 책상 앞에서 글을 쓰는 중','{r}에서 책상 앞에서 메모를 정리하는 중'],{worker:1.2,reader:.8});
V('work_laptop','work','laptop','stand',[30,90],['{r}에서 노트북으로 작업하는 중','{r}에서 노트북 앞에서 자료를 정리하는 중'],{worker:1.5});
V('write_chair','work','chair','sit',[20,60],['{r}에서 의자에 앉아 노트에 메모하는 중','{r}에서 의자에 앉아 생각을 정리하는 중'],{worker:1.2},{near:'desk',trait:'worker'});
V('monitor','work','monitor','stand',[3,8],['{r}에서 모니터를 확인하는 중']);
/* v19 일하기 행동 10종 — 성격에 따라 빈도가 달라지지만(가중치) 어떤 행동도 절대 막히지는 않는다. jobv=직업·일하기 선택에서 고르는 행동 */
const JK=['office','desk','laptop'],JREQ=A=>!!(A.job||tv(A,'worker')>0||tv(A,'busy')>0);
V('job_focus','work',JK,'stand',[30,90],['{r}에서 열심히 업무에 집중하는 중','{r}에서 자리를 뜨지 않고 업무에 몰두하는 중'],{worker:1.8,busy:.6,lazy:-.6},{jobv:true,hr:[7,24],req:JREQ});
V('job_busy','work',JK,'stand',[20,60],['{r}에서 바쁘게 여러 업무를 처리하는 중','{r}에서 이것저것 동시에 업무를 쳐내는 중'],{busy:1.8,worker:1,lazy:-.5},{jobv:true,hr:[7,24],req:JREQ});
V('job_call','work',JK,'stand',[5,20],['{r}에서 업무 전화를 받는 중','{r}에서 전화로 업무 내용을 조율하는 중'],{social:.9,worker:.5},{jobv:true,hr:[8,22],req:JREQ});
V('job_doc','work',JK,'stand',[25,70],['{r}에서 문서를 작성하는 중','{r}에서 작성한 문서를 꼼꼼히 검토하는 중'],{worker:1.2,reader:.9,tidy:.4},{jobv:true,hr:[7,24],req:JREQ});
V('job_pc','work',JK,'stand',[25,80],['{r}에서 컴퓨터로 작업하는 중','{r}에서 모니터를 보며 자료를 만드는 중'],{worker:1.2,gamer:.2},{jobv:true,hr:[7,24],req:JREQ});
V('job_paper','work',JK,'stand',[10,30],['{r}에서 서류를 정리하는 중','{r}에서 쌓인 서류를 분류해 파일에 끼우는 중'],{tidy:1.6,worker:.6},{jobv:true,hr:[8,22],req:JREQ});
V('job_break','work',JK,'stand',[5,15],['{r}에서 잠시 업무를 쉬며 기지개를 켜는 중','{r}에서 일을 멈추고 커피 한 모금 마시며 숨을 돌리는 중'],{lazy:1.2,tea:.8,busy:-.3},{jobv:true,hr:[8,24],req:JREQ});
V('job_daydream','work',JK,'stand',[5,18],['{r}에서 일하다 문득 딴생각에 빠진 중','{r}에서 모니터를 보며 멍하니 다른 생각을 하는 중'],{lazy:1,creative:.9,curious:.5,worker:-.3},{jobv:true,hr:[8,24],req:JREQ});
V('job_game','work',JK,'stand',[10,35],['{r}에서 업무 화면 뒤에 몰래 게임을 켜 둔 중','{r}에서 업무 중에 몰래 게임을 하는 중'],{gamer:2.2,lazy:1.1,playful:.9,worker:-.5},{jobv:true,hr:[9,24],req:JREQ,rare:.7});
V('job_procrast','work',JK,'stand',[10,30],['{r}에서 일을 미루며 딴짓하는 중','{r}에서 해야 할 일을 미뤄 두고 휴대폰만 만지작거리는 중'],{lazy:1.7,playful:.8,worker:-.5},{jobv:true,hr:[8,24],req:JREQ,rare:.8});
/* TV */
V('tv_sofa','tv','tv','sit',[25,100],['{r}에서 소파에 앉아 {S}'],{tv:1.8},{seatKind:'sofa'});
V('tv_chair','tv','tv','sit',[20,70],['{r}에서 의자에 앉아 {S}','{r}에서 의자를 돌려 앉아 {S}'],{tv:1.4},{seatKind:'chair'});
V('tv_stand','tv','tv','stand',[10,40],['{r}에서 TV 앞에 서서 {S}','{r}에서 TV를 켜고 {S}'],{tv:1.2});
V('tv_bed','tv','tv','lie',[20,70],['{r}에서 침대에 누워 {S}'],{tv:1.5,lazy:.6},{seatKind:'bed',hr:[20,27]});
/* 취미 */
V('chair_hobby','hobby','chair','sit',[15,45],['{r}에서 의자에 앉아 뜨개질을 하는 중','{r}에서 의자에 앉아 작은 수첩에 낙서하는 중','{r}에서 의자에 앉아 취미 거리를 만지작거리는 중'],{hobby:1.6},{trait:'hobby'});
V('paint','hobby','easel','stand',[25,90],['{r}에서 이젤 앞에서 그림을 그리는 중','{r}에서 캔버스에 색을 칠하는 중'],{hobby:1.8});
V('craft','hobby',['craft','lab'],'stand',[20,60],['{r}에서 작업대 앞에서 무언가를 만지작거리는 중','{r}에서 실험 도구를 살펴보는 중'],{hobby:1.5});
V('piano','hobby','piano','sit',[15,50],['{r}에서 피아노를 치는 중','{r}에서 피아노로 가볍게 연주하는 중'],{hobby:2},{hr:[9,22]});
V('guitar','hobby',['guitar','violin','instrument'],'stand',[15,45],['{r}에서 악기를 연주하는 중','{r}에서 악기를 조율하는 중'],{hobby:2},{hr:[9,22]});
V('chess','hobby','gametable','sit',[15,50],['{r}에서 테이블에 앉아 {B}을(를) 하는 중','{r}에서 {B}을(를) 펼쳐 놓고 혼자 연습하는 중'],{hobby:1.5});
V('bg_pair','hobby',['gametable','dining'],'sit',[25,70],['{r}에서 {p}와(과) {B}을(를) 하는 중','{r}에서 {p}와(과) 마주 앉아 {B} 한 판을 두는 중'],{social:1.5,boardgame:1.4,hobby:.5},{pair:true,cp:['{r}에서 {p}와(과) 웃으며 {B}을(를) 하는 중','{r}에서 {p}와(과) 내기를 걸고 {B} 한 판을 두는 중'],hr:[10,27]});
V('bg_floor','hobby',null,'stand',[25,70],['{r}에서 {p}와(과) 바닥에 둘러앉아 {B}을(를) 하는 중'],{social:1.2,boardgame:1.4,hobby:.5},{pair:true,hr:[10,27],rare:.6});
V('f_dance','hobby',null,'stand',[5,20],['{r}에서 음악에 맞춰 신나게 춤추는 중','{r}에서 K-pop 안무를 따라 추는 중','{r}에서 혼자 댄스 연습을 하는 중','{r}에서 어깨를 들썩이며 가볍게 춤추는 중'],{dance:1.8,music:.6,hobby:.3},{rare:.4,hr:[9,24]});
V('f_sing','hobby',null,'stand',[5,20],['{r}에서 좋아하는 노래를 따라 부르는 중','{r}에서 노래를 흥얼거리며 가사를 외우는 중','{r}에서 마이크가 있는 것처럼 열창하는 중','{r}에서 신나게 노래를 부르는 중'],{sing:1.8,music:.6,hobby:.3},{rare:.4,hr:[9,24]});
V('f_listen','hobby',null,'sit',[15,45],['{r}에서 이어폰을 끼고 노래를 듣는 중','{r}에서 플레이리스트를 틀어 놓고 노래를 듣는 중','{r}에서 좋아하는 앨범을 처음부터 듣는 중'],{music:1.6,hobby:.3},{rare:.5,hr:[8,27]});
V('f_game','hobby',null,'sit',[30,90],['{r}에서 {GM}'],{gamer:2,hobby:.3},{trait:'gamer',hr:[11,27]});
V('f_boardsolo','hobby',null,'sit',[15,40],['{r}에서 {B} 규칙집을 읽어 보는 중','{r}에서 {B} 전략을 곰곰이 생각하는 중'],{boardgame:1.6,hobby:.3},{trait:'boardgame',hr:[10,27]});
V('game','hobby','console','stand',[25,90],['{r}에서 {GM}','{r}에서 게임기에 푹 빠져 {GM}'],{hobby:1.8,tv:.8},{hr:[11,27]});
V('music','hobby','audio','stand',[10,40],['{r}에서 음악을 틀어 놓고 듣는 중','{r}에서 음악을 들으며 흥얼거리는 중'],{hobby:1.5,solitary:.3});
V('photo','hobby','camera','stand',[8,25],['{r}에서 카메라를 만지작거리는 중','{r}에서 사진을 고르는 중'],{hobby:1.8,outgoing:.4});
V('sew','hobby','sewing','stand',[15,45],['{r}에서 재봉틀로 바느질하는 중'],{hobby:1.8});
/* 공부 */
V('study_desk','study',['desk','studyfurn'],'stand',[30,90],['{r}에서 책상 앞에서 {Y}'],{studious:2,worker:.3},{trait:'studious',wishAny:true,hr:[8,27]});
V('study_chair','study','chair','sit',[20,70],['{r}에서 의자에 앉아 {Y}'],{studious:2},{trait:'studious',wishAny:true,near:'desk',hr:[8,27]});
V('study_bed','study','bed','lie',[15,45],['{r}에서 침대에 엎드려 {Y}'],{studious:1.2,lazy:.6},{trait:'studious',wishAny:true,hr:[20,27]});
V('study_free','study',null,'stand',[15,50],['{r}에서 {Y}'],{studious:1.5},{trait:'studious',wishAny:true,hr:[8,27]});
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
/* v19 연애 행동: 연애 상태(짝사랑·맞짝사랑·외사랑·연인·부부)가 있는 쌍에서만 후보가 된다. 지문은 viv-love.js 가 두 사람의 성격을 조합해 만든다.
   ev:true = 고백·프로포즈 같은 특별 이벤트(끝날 때까지 다른 캐릭터가 끼어들지 못하고, 쿨다운은 viv-mind.js 가 관리) */
V('love_crush','chat',null,'stand',[8,25],['{r}에서 {p}의 곁을 맴도는 중'],{social:.5},{pair:true,rom:'crush',rare:.9,hr:[8,27]});
V('love_aff','chat',null,'stand',[10,30],['{r}에서 {p}와(과) 다정하게 시간을 보내는 중'],{social:.6},{pair:true,rom:'aff',rare:.9,hr:[8,27]});
V('love_confess','chat',null,'stand',[20,40],['{r}에서 {p}에게 진지하게 할 말이 있다며 이야기하는 중'],{},{pair:true,rom:'confess',ev:true,rare:4,hr:[10,26]});
V('love_propose','chat',null,'stand',[25,45],['{r}에서 {p}에게 진지하게 할 말이 있다며 이야기하는 중'],{},{pair:true,rom:'propose',ev:true,rare:4,hr:[10,26]});
/* =====================================================================
   4-b) v17 반려동물 — 종(species)마다 행동 구성이 다르고, 사람보다 훨씬 단순함
   · 반려동물은 프로필 맨 앞의 표식 [반려:종|반려인id] 로 알아본다(parsePet). 화면에서는 표식을 떼어 낸다.
   · 사람 행동(sp 없는 VERBS)은 쓰지 않고 종 전용 행동(sp 있는 것)만 쓴다. 한 종에 7~10가지, 사람은 100가지가 넘음.
   · room:true 인 종(햄스터·새·물고기)은 있는 방 밖으로 나가지 않아서 계산도 저장도 가볍다.
   · 배고픔·목마름·배변·외로움은 '마지막으로 챙긴 시각' 5개만 저장하고 나머지는 시각에서 계산한다(st.pet).
   ===================================================================== */
const PET_TAG=/^\[반려:([a-z]+)\|([^\]\s|]*)\]\n?/;
const H1=3600000;
const ig=n=>n+(hasJong(n)?'이':'가');
const SPECIES={
 dog:{n:'강아지',h:46,room:false,walk:true,feedH:9,waterH:7,dirtyH:7,loveH:5,food:'사료',care:['feed','water','clean','walk','pat','hug','play','groom'],
  cl:['{p}의 배변을 치우고 자리를 닦는 중','킁킁거리며 깨끗해진 자리를 확인하는 중'],pl:['{p}와(과) 공 던지기를 하며 놀아 주는 중','공을 물어 와 꼬리를 흔드는 중']},
 cat:{n:'고양이',h:32,room:false,feedH:9,waterH:8,dirtyH:8,loveH:7,food:'캔 사료',care:['feed','water','clean','pat','hug','play','groom'],
  cl:['{p}의 화장실을 치우고 모래를 정리하는 중','화장실 앞에서 깨끗해진 모래를 살피는 중'],pl:['{p}와(과) 낚싯대 장난감으로 놀아 주는 중','장난감을 향해 엉덩이를 흔들며 노려보는 중']},
 rabbit:{n:'토끼',h:28,room:false,feedH:8,waterH:8,dirtyH:7,loveH:8,food:'건초와 채소',care:['feed','water','clean','pat','hug','play'],
  cl:['{p}의 배변판을 비우고 새 깔개를 깔아 주는 중','깔끔해진 배변판 옆에서 코를 씰룩이는 중'],pl:['{p}와(과) 터널 장난감으로 놀아 주는 중','터널 속을 폴짝폴짝 드나드는 중']},
 hamster:{n:'햄스터',h:14,room:true,feedH:12,waterH:12,dirtyH:24,loveH:14,food:'해바라기씨',care:['feed','water','clean','pat','play'],
  cl:['{p}의 집 톱밥을 새로 갈아 주는 중','새 톱밥 속을 파고드는 중'],pl:['{p}를 손 위에 올려 놓고 놀아 주는 중','손 위에서 해바라기씨를 까먹는 중']},
 bird:{n:'새',h:20,room:true,feedH:10,waterH:8,dirtyH:14,loveH:12,food:'모이',care:['feed','water','clean','play'],
  cl:['{p}의 새장 바닥을 깨끗이 청소하는 중','청소된 새장 안을 포르르 날아다니는 중'],pl:['{p}에게 휘파람으로 노래를 가르쳐 주는 중','{p}의 휘파람을 따라 지저귀는 중']},
 fish:{n:'물고기',h:12,room:true,feedH:14,waterH:48,dirtyH:36,loveH:48,food:'먹이',care:['feed','clean'],
  cl:['{p}의 어항을 청소하고 물을 갈아 주는 중','맑아진 물속을 유유히 헤엄치는 중']}};
const SPECIES_IDS=Object.keys(SPECIES);
const CLEAN_N={dog:'똥 치우기',cat:'화장실 치우기',rabbit:'똥 치우기',hamster:'톱밥 갈아주기',bird:'새장 청소하기',fish:'어항 청소하기'};
SPECIES_IDS.forEach(k=>SPECIES[k].cleanN=CLEAN_N[k]);
function parsePet(profile){const s=String(profile||''),m=PET_TAG.exec(s);if(!m||!SPECIES[m[1]])return {profile:s,pet:null};return {profile:s.slice(m[0].length),pet:{sp:m[1],owner:m[2]||null}}}
function petTag(sp,owner){return SPECIES[sp]?`[반려:${sp}|${owner||''}]\n`:''}
const allOf=ctx=>ctx.all||ctx.chars||[];
const petsOf=ctx=>allOf(ctx).filter(o=>o.pet);
const ownerOf=(ctx,pe)=>pe.pet&&pe.pet.owner?allOf(ctx).find(o=>!o.pet&&o.id===pe.pet.owner)||null:null;
const ownPets=(ctx,c)=>allOf(ctx).filter(o=>o.pet&&o.pet.owner===c.id);
/* 마지막으로 챙긴 시각 → 지금 필요한 정도(1이면 약 한 주기가 지난 것) */
function petNeeds(c,ps,now){const S=SPECIES[c.pet.sp],g=k=>ps&&ps[k]!=null?ps[k]:now,r=(k,h)=>Math.max(0,(now-g(k))/(h*H1));
  return {hunger:r('fedAt',S.feedH),thirst:S.care.includes('water')?r('waterAt',S.waterH):0,dirty:Math.min(4,Math.floor(r('cleanAt',S.dirtyH))),love:r('loveAt',S.loveH),walk:S.walk?r('walkAt',16):0,groom:S.care.includes('groom')?r('groomAt',72):0}}
const petInit=now=>({fedAt:now-1*H1,waterAt:now-1*H1,cleanAt:now-2*H1,walkAt:now-3*H1,loveAt:now-1*H1,groomAt:now-24*H1});
const CARE_KEY={feed:'fedAt',water:'waterAt',clean:'cleanAt',walk:'walkAt',pat:'loveAt',hug:'loveAt',play:'loveAt',groom:'groomAt'};
function applyCare(ps,care,now){const o={...(ps||petInit(now))};o[CARE_KEY[care]]=now;if(care==='walk'){o.loveAt=now;o.cleanAt=(o.cleanAt!=null?o.cleanAt:now)+(now-(o.cleanAt!=null?o.cleanAt:now))*.4}   /* 산책 중 밖에서 일부 해결 */if(care==='groom')o.loveAt=now;if(care==='play'||care==='hug')o.loveAt=now;return o}
/* 돌봄 필요도 0~1 (이 값이 0이면 반려인이 굳이 하지 않음) */
function careNeed(c,ps,care,now){const n=petNeeds(c,ps,now);
  switch(care){case 'feed':return Math.min(1,Math.max(0,(n.hunger-.4)/.8));case 'water':return Math.min(1,Math.max(0,(n.thirst-.4)/.8));
   case 'clean':return n.dirty>0?Math.min(1,n.dirty/2):0;case 'walk':return Math.min(1,Math.max(0,(n.walk-.3)/.8));
   case 'groom':return Math.min(1,Math.max(0,(n.groom-.5)/.8))*.6;
   case 'pat':case 'hug':case 'play':return Math.min(1,Math.max(0,(n.love-.35)/.9))}return 0}
/* 돌봄 행동(반려인 쪽) — t: 반려인 문구({p}=반려동물 이름), pt: 반려동물 쪽 문구({o}=반려인 이름). {f}=먹이 */
const CARE={
 feed:{n:'밥주기',d:[4,9],hr:[6,23],t:['{r}에서 {p}에게 {f}을(를) 챙겨 주는 중','{r}에서 {p}의 밥그릇을 채워 주는 중'],pt:['{r}에서 {p}이(가) 준 {f}을(를) 맛있게 먹는 중','{r}에서 밥그릇에 얼굴을 파묻고 먹는 중']},
 water:{n:'물 갈아주기',d:[3,6],hr:[6,23],t:['{r}에서 {p}의 물그릇을 새 물로 갈아 주는 중'],pt:['{r}에서 시원한 새 물을 마시는 중']},
 clean:{n:'똥 치우기',d:[4,9],hr:[6,23],t:null,pt:null},
 walk:{n:'산책하기',d:[30,60],hr:[6,22],t:null,pt:null},
 pat:{n:'쓰다듬기',d:[5,12],hr:[6,24],t:['{r}에서 {p}을(를) 쓰다듬어 주는 중','{r}에서 {p}의 머리를 살살 쓰다듬는 중'],pt:['{r}에서 {p}의 손길에 기분 좋게 눈을 감는 중','{r}에서 쓰다듬어 주는 손에 몸을 기대는 중']},
 hug:{n:'안아주기',d:[4,10],hr:[6,24],t:['{r}에서 {p}을(를) 품에 안아 주는 중','{r}에서 {p}을(를) 꼭 안고 토닥이는 중'],pt:['{r}에서 {p}의 품에 폭 안겨 있는 중','{r}에서 안겨서 얌전히 있는 중']},
 play:{n:'놀아주기',d:[8,20],hr:[7,23],t:null,pt:null},
 groom:{n:'빗질·목욕',d:[8,20],hr:[8,21],t:['{r}에서 {p}의 털을 빗겨 주는 중','{r}에서 {p}을(를) 목욕시키고 털을 말려 주는 중'],pt:['{r}에서 {p}에게 몸을 맡기고 빗질을 받는 중','{r}에서 보송보송하게 털을 말리는 중']}};
Object.keys(CARE).forEach(k=>{const C=CARE[k];V('care_'+k,'care',null,'stand',C.d,C.t||['{r}에서 {p}을(를) 돌보는 중'],{},{pair:true,care:k,hr:C.hr,pt:C.pt||['{r}에서 {p}와(과) 함께 있는 중']})});
/* 종별 행동 [id, 그룹, 가구 kind(없으면 null=가구 없이 가능), 자세, 지속(분), 문구, 시간대, 옵션] */
const PV={
 dog:[['d_sleep','p_sleep',['bed','sofa'],'lie',[30,60],['{r}에서 포근한 곳에 몸을 말고 잠든 중','{r}에서 배를 드러내고 곤히 자는 중'],[21,8]],
  ['d_nap','p_sleep',null,'lie',[20,40],['{r}에서 바닥에 엎드려 꾸벅꾸벅 조는 중'],[9,20]],
  ['d_lie','p_rest',null,'lie',[20,50],['{r}에서 바닥에 엎드려 쉬는 중','{r}에서 꼬리를 살랑거리며 느긋하게 누워 있는 중']],
  ['d_sofa','p_rest',['sofa','bed'],'lie',[20,50],['{r}에서 푹신한 곳에 올라가 몸을 웅크린 중']],
  ['d_play','p_play',null,'stand',[10,25],['{r}에서 장난감을 물고 신나게 뛰어다니는 중','{r}에서 꼬리를 흔들며 빙글빙글 도는 중'],[8,22]],
  ['d_sniff','p_roam',null,'stand',[8,20],['{r}에서 킁킁거리며 냄새를 맡는 중','{r}에서 코를 바닥에 대고 구석구석 살피는 중']],
  ['d_wander','p_roam',null,'stand',[10,30],['{r}에서 꼬리를 흔들며 돌아다니는 중','{r}에서 총총 걸으며 구경하는 중'],null,{special:'wander',petsay:1}],
  ['d_follow','p_roam',null,'stand',[10,30],['{r}에서 {p}을(를) 졸졸 따라다니는 중'],[7,24],{special:'wander',follow:1,petsay:1}],
  ['d_window','p_roam',['__window'],'stand',[8,15],['{r}에서 창밖을 내다보며 멍멍 짖는 중','{r}에서 창가에 앞발을 올리고 바깥을 구경하는 중'],[7,22]],
  ['d_wait','p_wait',null,'sit',[10,30],['{r}에서 {p}이(가) 돌아오길 현관 쪽을 보며 기다리는 중'],null,{special:'wander',wait:1,petsay:1}]],
 cat:[['c_sleep','p_sleep',['bed','sofa'],'lie',[30,60],['{r}에서 몸을 동그랗게 말고 잠든 중','{r}에서 푹신한 곳에서 새근새근 자는 중']],
  ['c_nap','p_sleep',null,'lie',[20,45],['{r}에서 앞발에 얼굴을 묻고 졸고 있는 중'],[8,20]],
  ['c_window','p_rest',['__window'],'sit',[20,50],['{r}에서 창가에서 햇볕을 쬐며 꾸벅꾸벅 조는 중','{r}에서 창밖의 새를 뚫어지게 쳐다보는 중'],[7,19]],
  ['c_groom','p_rest',null,'sit',[8,20],['{r}에서 앞발로 얼굴을 열심히 씻는 중','{r}에서 몸을 핥으며 그루밍하는 중']],
  ['c_scratch','p_play',null,'stand',[6,15],['{r}에서 발톱을 갈며 긁는 중','{r}에서 가구 모서리에 몸을 비비는 중'],[8,24]],
  ['c_play','p_play',null,'stand',[10,25],['{r}에서 보이지 않는 사냥감을 노리며 엉덩이를 흔드는 중','{r}에서 장난감 쥐를 물고 달리는 중'],[17,24]],
  ['c_hide','p_rest',['wardrobe','bed','sofa'],'sit',[15,40],['{r}에서 구석에 숨어 눈만 내놓고 있는 중']],
  ['c_wander','p_roam',null,'stand',[10,30],['{r}에서 사뿐사뿐 돌아다니는 중','{r}에서 꼬리를 세우고 집 안을 순찰하는 중'],null,{special:'wander',petsay:1}],
  ['c_follow','p_roam',null,'stand',[10,30],['{r}에서 {p} 곁에 슬쩍 다가가 앉는 중'],[7,24],{special:'wander',follow:1,petsay:1}],
  ['c_wait','p_wait',null,'sit',[10,30],['{r}에서 {p}이(가) 돌아오길 기다리며 현관 쪽을 보는 중'],null,{special:'wander',wait:1,petsay:1}]],
 rabbit:[['r_sleep','p_sleep',null,'lie',[30,60],['{r}에서 다리를 쭉 뻗고 잠든 중','{r}에서 눈을 반쯤 뜬 채 졸고 있는 중'],[10,18]],
  ['r_rest','p_rest',null,'sit',[15,40],['{r}에서 몸을 둥글게 말고 쉬는 중','{r}에서 귀를 접고 느긋하게 앉아 있는 중']],
  ['r_hop','p_play',null,'stand',[8,20],['{r}에서 폴짝폴짝 뛰어다니는 중','{r}에서 신나서 공중으로 점프하는 중'],[6,10]],
  ['r_hop2','p_play',null,'stand',[8,20],['{r}에서 폴짝폴짝 뛰어다니는 중','{r}에서 신나서 공중으로 점프하는 중'],[17,23]],
  ['r_nibble','p_eat',null,'sit',[10,25],['{r}에서 건초를 오물오물 씹는 중'],null,{pcond:'fed'}],
  ['r_groom','p_rest',null,'sit',[6,15],['{r}에서 앞발로 얼굴을 쓱쓱 닦는 중']],
  ['r_wander','p_roam',null,'stand',[10,30],['{r}에서 코를 씰룩이며 돌아다니는 중'],null,{special:'wander',petsay:1}],
  ['r_follow','p_roam',null,'stand',[10,30],['{r}에서 {p} 곁으로 폴짝 다가오는 중'],[7,24],{special:'wander',follow:1,petsay:1}]],
 hamster:[['h_sleep','p_sleep',null,'lie',[40,90],['{r}에서 톱밥 속에 파묻혀 잠든 중'],[6,18]],
  ['h_wheel','p_play',null,'stand',[15,40],['{r}에서 쳇바퀴를 열심히 돌리는 중'],[18,6]],
  ['h_hoard','p_roam',null,'stand',[10,25],['{r}에서 볼주머니에 먹이를 가득 채우는 중'],[17,7]],
  ['h_climb','p_roam',null,'stand',[10,25],['{r}에서 케이지 철망을 타고 오르는 중'],[17,7]],
  ['h_rest','p_rest',null,'sit',[15,40],['{r}에서 구석에서 세수를 하는 중','{r}에서 은신처에 들어가 가만히 있는 중']]],
 bird:[['b_perch','p_rest',null,'sit',[15,40],['{r}에서 횃대에 앉아 두리번거리는 중','{r}에서 한쪽 다리로 서서 쉬는 중'],[6,20]],
  ['b_sing','p_play',null,'stand',[8,20],['{r}에서 맑은 소리로 지저귀는 중','{r}에서 신나게 노래하는 중'],[6,19]],
  ['b_preen','p_rest',null,'sit',[8,20],['{r}에서 부리로 깃털을 다듬는 중']],
  ['b_flutter','p_roam',null,'stand',[6,15],['{r}에서 날개를 푸드덕거리며 날아오르는 중'],[7,19]],
  ['b_sleep','p_sleep',null,'sit',[40,90],['{r}에서 날개에 부리를 묻고 잠든 중'],[20,6]]],
 fish:[['f_swim','p_roam',null,'stand',[20,50],['{r}에서 어항 안을 유유히 헤엄치는 중','{r}에서 수초 사이를 지나다니는 중'],[6,21]],
  ['f_rest','p_rest',null,'stand',[20,50],['{r}에서 바닥 근처에서 가만히 쉬는 중']],
  ['f_bubble','p_play',null,'stand',[10,25],['{r}에서 수면에서 뽀글뽀글 물방울을 만드는 중'],[7,21]],
  ['f_sleep','p_sleep',null,'stand',[60,120],['{r}에서 불이 꺼진 어항 속에서 둥둥 떠 잠든 중'],[21,7]]]};
/* 공통(종마다 하나씩): 배고픔 · 방금 먹음 · 반려인이 없을 때 */
SPECIES_IDS.forEach(sp=>{
  (PV[sp]=PV[sp]||[]).push(
   [sp+'_hungry','p_eat',null,'stand',[10,25],['{r}에서 빈 밥그릇 앞에서 서성이는 중','{r}에서 배고픈 듯 밥그릇을 힐끔거리는 중'],null,{pcond:'hungry'}],
   [sp+'_eat','p_eat',null,'stand',[8,15],['{r}에서 밥그릇 앞에서 오물오물 먹는 중'],null,{pcond:'fed'}],
   [sp+'_lone','p_rest',null,'sit',[20,40],['{r}에서 반려인이 오기를 기다리며 멍하니 있는 중'],null,{pcond:'lone'}])});
for(const sp of SPECIES_IDS)for(const a of PV[sp]){const o=a[7]||{};
  V(a[0],a[1],a[2],a[3],a[4],a[5],{},{sp,hr:a[6]||undefined,...o,pcond:o.pcond||null,solo:/^p_(sleep|rest)$/.test(a[1])&&!o.follow&&!o.wait||o.pcond==='lone'||o.pcond==='hungry'})}
/* 반려동물 행동 조건 */
function petCond(v,ctx,c,ps,now){
  const lone=!(ownerOf(ctx,c)&&ctx.getPlace(ownerOf(ctx,c).id).house===ctx.houseId);
  if(v.pcond==='lone')return lone;
  if(lone&&!v.solo)return false;   // 반려인이 없으면 쉬거나 자거나 배고파하는 정도만 함
  if(v.pcond==='hungry')return petNeeds(c,ps,now).hunger>=1;
  if(v.pcond==='fed')return now-(ps.fedAt||0)<100*MIN&&ps.fedAt!=null&&petNeeds(c,ps,now).hunger<.45;
  if(v.wait){const ow=ownerOf(ctx,c);return !!ow&&ctx.getPlace(ow.id).mode==='out'}
  if(v.follow){const ow=ownerOf(ctx,c);return !!ow&&ctx.getPlace(ow.id).mode==='home'}
  return true}
const PET_ACT={dog:H=>H<7||H>=22?.12:H<9?.8:H<17?.5:H<21?1:.6,cat:H=>H<5?.7:H<8?.9:H<17?.3:H<24?.9:.5,rabbit:H=>(H>=5&&H<9)||(H>=17&&H<22)?1:H<5||H>=23?.2:.35,
  hamster:H=>H>=19||H<5?1:.12,bird:H=>H>=6&&H<19?.9:.05,fish:H=>H>=7&&H<21?.8:.15};
function petGroupW(c,g,H,ps,now){const a=(PET_ACT[c.pet.sp]||(()=>.6))(H),n=petNeeds(c,ps,now);
  switch(g){case 'p_sleep':return .15+1.8*(1-a);case 'p_rest':return .7;case 'p_play':return .15+1.1*a;case 'p_roam':return .1+.9*a;
   case 'p_eat':return .05+Math.min(3,n.hunger*1.6);case 'p_wait':return 5}return 1}
/* 돌보는 쪽(반려인) 가중치: 챙길 일이 급할수록 */
function careTexts(v,pet,side){const S=SPECIES[pet.pet.sp];
  if(v.care==='clean')return ['{r}에서 '+S.cl[side==='o'?0:1]];
  if(v.care==='play'&&S.pl)return ['{r}에서 '+S.pl[side==='o'?0:1]];
  return (side==='o'?v.t:v.pt)||['{r}에서 함께 있는 중']}
const careGroupW=(H,list)=>{const mx=Math.max(0,...list.map(x=>x.petNeed||0));return (H<7||H>=23?.15:1)*(.25+mx*5)};

/* 외출 — 사유는 시각·성향으로 고름 */
/* 활동에 맞는 장소 이름 — 사용자가 방에 이름을 붙이지 않았을 때만 쓴다(붙였다면 그 이름을 존중) */
const RNAME={toilet:'욕실',facewash:'욕실',hairwash:'욕실',towel_hair:'욕실',bath_pair:'욕실',brush:'욕실',shave:'욕실',shower:'욕실',bath:'욕실',hairdry:'욕실',cook_stove:'주방',cook_counter:'주방',fridge:'주방',snack:'주방',coffee:'주방',tea_kettle:'주방',toast:'주방',dishes:'주방',water:'주방',
  sleep_bed:'침실',nap_bed:'침실',lie_bed:'침실',wake_stretch:'침실',read_bed:'침실',pillow:'침실',tv_bed:'침실',sleep_hammock:'침실'};
VERBS.forEach(v=>{if(RNAME[v.id])v.rname=RNAME[v.id]});
const OUT_WHY=[
 {id:'jog',t:'아침 운동을 하러 나갔어요',hr:[5,9],d:['강변에서 아침 조깅을 하는 중이에요','운동장을 몇 바퀴 도는 중이에요','이어폰을 끼고 가볍게 달리는 중이에요','공원 벤치에서 숨을 돌리며 물을 마시는 중이에요'],w:{outdoor:2},dur:[30,70]},
 {id:'walk',t:'산책하러 나갔어요',hr:[6,22],d:['동네를 천천히 산책하는 중이에요','길가의 꽃 사진을 찍으며 걷는 중이에요','산책로에서 강아지를 만나 인사하는 중이에요','벤치에 앉아 지나가는 사람들을 구경하는 중이에요'],w:{outdoor:1.5,outgoing:.5},dur:[30,90]},
 {id:'dogwalk',t:'반려견과 산책하러 나갔어요',hr:[6,22],wishOnly:true,pet:true,d:['동네 공원을 천천히 산책하는 중이에요','가로등 아래에서 냄새를 맡는 동안 기다려 주는 중이에요','공원 잔디밭에서 공을 던지며 노는 중이에요','산책로에서 다른 강아지를 만나 인사하는 중이에요'],pd:['신나게 꼬리를 흔들며 산책하는 중이에요','풀 냄새를 맡느라 걸음이 느려진 중이에요','공원에서 공을 쫓아 달리는 중이에요','다른 강아지와 코인사를 하는 중이에요'],w:{},dur:[30,60]},
 {id:'visit',t:'이웃집에 놀러 갔어요',hr:[8,23],wishOnly:true,d:['{n}에 도착해 반갑게 인사를 나누는 중이에요','{n}에서 집 구경을 하는 중이에요','{n}에서 차를 마시며 수다를 떠는 중이에요','{n}에서 간식을 나눠 먹으며 노는 중이에요'],w:{},dur:[60,120]},
 {id:'shop',t:'장을 보러 나갔어요',hr:[9,20],d:['마트에서 장바구니를 채우는 중이에요','시장에서 제철 과일을 고르는 중이에요','계산대 앞에서 줄을 서 있는 중이에요','할인 코너를 둘러보며 고민하는 중이에요'],w:{foodie:.6,cook:1},dur:[40,90]},
 {id:'friend',t:'친구를 만나러 외출했어요',hr:[11,22],d:['친구와 만나 수다를 떠는 중이에요','친구와 근황을 나누며 웃는 중이에요','친구와 같이 사진을 찍는 중이에요','친구와 다음 약속을 정하는 중이에요'],w:{social:2.5,outgoing:1},dur:[90,240]},
 {id:'cafe',t:'카페에 갔어요',hr:[9,21],d:['카페 창가에 앉아 커피를 마시는 중이에요','카페에서 디저트를 맛보는 중이에요','카페에서 책을 꺼내 읽는 중이에요','카페에서 노트북을 펴고 작업하는 중이에요'],w:{tea:1.5,social:.5},dur:[60,150]},
 {id:'library',t:'도서관에 책을 읽으러 갔어요',hr:[9,19],d:['도서관에서 읽을 책을 고르는 중이에요','도서관 열람실에서 조용히 책을 읽는 중이에요','도서관에서 책을 빌려 나오는 중이에요'],w:{reader:2.5},dur:[90,200]},
 {id:'work',t:'일하러 나갔어요',hr:[7,18],d:['일터에서 업무에 집중하는 중이에요','회의에 참석해 메모하는 중이에요','점심을 먹고 다시 일터로 돌아가는 중이에요'],w:{worker:2},dur:[180,420]},
 {id:'hobby',t:'취미 활동을 하러 나갔어요',hr:[10,20],d:['취미 모임에서 시간을 보내는 중이에요','취미 용품을 구경하러 가게를 둘러보는 중이에요','좋아하는 취미를 즐기며 시간 가는 줄 모르는 중이에요'],w:{hobby:2.5},dur:[90,200]},
 {id:'errand',t:'볼일을 보러 나갔어요',hr:[9,18],d:['은행에서 볼일을 보는 중이에요','우체국에서 택배를 부치는 중이에요','주민센터에서 서류를 떼는 중이에요','약국에 들러 필요한 걸 사는 중이에요'],w:{},dur:[40,120]},
 {id:'dinner',t:'저녁 약속이 있어서 나갔어요',hr:[17,22],seq:true,d:['저녁 약속 자리에서 식사하는 중이에요','약속 장소에서 사람들과 건배하는 중이에요','저녁을 먹으며 이야기꽃을 피우는 중이에요'],w:{social:2,outgoing:1},dur:[120,240]},
 {id:'drink',t:'한잔하러 나갔어요',hr:[18,24],d:['술집에서 한잔하며 이야기하는 중이에요','안주를 고르며 한잔하는 중이에요','가볍게 맥주 한 잔을 기울이는 중이에요'],w:{drinker:2.5,social:1},dur:[120,240]},
 /* 일하러 나가기 — 프로필에 직장인·알바 표현이 있을 때만 (일하는 시간 규칙은 jobSlot) */
 {id:'job',t:'출근해서 일하는 중이에요',hr:[0,24],seq:true,d:['출근해서 업무를 처리하는 중이에요','동료와 점심을 먹는 중이에요','회의실에서 회의 중이에요','퇴근 시간을 기다리며 마무리 업무를 하는 중이에요'],w:{},dur:[60,540],jobOnly:true},
 /* 주말·공휴일에만 나오는 외출 */
 {id:'cinema',t:'영화관에서 영화를 보는 중이에요',hr:[11,22],seq:true,d:['영화 포스터 앞에서 사진을 찍는 중이에요','팝콘을 들고 상영관에 들어가는 중이에요','영화관에서 영화를 보는 중이에요','영화가 끝나고 감상을 이야기하는 중이에요'],w:{movie:1.5,tv:.6,outgoing:.5,social:.3},dur:[150,260],off:true,together:true},
 {id:'park',t:'공원에서 시간을 보내는 중이에요',hr:[9,19],d:['공원에서 낙엽 사진을 찍는 중이에요','공원에서 피크닉 돗자리를 펴는 중이에요','공원에서 지나가는 행인의 사진을 찍는 중이에요','공원 벤치에서 우연히 만난 이웃과 인사하는 중이에요','공원 연못가에서 오리를 구경하는 중이에요','공원에서 아이스크림을 먹으며 걷는 중이에요'],w:{outdoor:1.2,nature:.8,outgoing:.5},dur:[60,200],off:true,together:true},
 {id:'themepark',t:'놀이공원에서 놀고 있어요',hr:[10,20],d:['놀이공원에서 롤러코스터 줄을 서 있는 중이에요','놀이공원에서 회전목마를 타는 중이에요','놀이공원에서 퍼레이드를 구경하는 중이에요','놀이공원에서 츄러스를 먹는 중이에요'],w:{outgoing:1.2,social:.7,busy:.2},dur:[240,420],off:true,together:true},
 {id:'dept',t:'백화점에서 쇼핑하는 중이에요',hr:[11,20],d:['백화점에서 옷을 입어 보는 중이에요','백화점 지하 식품관을 구경하는 중이에요','백화점에서 선물을 고르는 중이에요','백화점 매장을 둘러보며 쇼핑하는 중이에요'],w:{shopper:1.6,fashion:.8,outgoing:.4},dur:[90,220],off:true,together:true},
 {id:'conv',t:'편의점에 잠깐 들렀어요',hr:[7,23],d:['편의점에서 간식을 고르는 중이에요','편의점에서 삼각김밥을 사는 중이에요','편의점에서 음료를 사서 나오는 중이에요'],w:{lazy:.3,foodie:.4},dur:[10,25],off:true},
 {id:'matjip',t:'맛집에서 밥을 먹는 중이에요',hr:[11,21],seq:true,d:['맛집 줄에서 순서를 기다리는 중이에요','맛집에서 메뉴를 고르는 중이에요','맛집에서 음식 사진을 찍고 먹는 중이에요','맛집에서 밥 한 공기를 뚝딱 비운 중이에요'],w:{foodie:1.8,social:.4,sweet:.3},dur:[60,130],off:true,together:true},
 {id:'friendhome',t:'친구 집에 놀러 왔어요',hr:[11,22],d:['친구 집에서 수다를 떨며 놀고 있어요','친구 집에서 같이 영화를 보는 중이에요','친구 집에서 간식을 나눠 먹는 중이에요','친구 집에서 보드게임을 하며 노는 중이에요'],w:{social:1.8,outgoing:.6,caring:.3},dur:[120,300],off:true},
 {id:'sea',t:'바다를 보러 왔어요',hr:[9,18],d:['바다에서 파도 소리를 들으며 걷는 중이에요','바닷가에서 조개껍데기를 줍는 중이에요','방파제에 앉아 수평선을 바라보는 중이에요','바닷가 카페에서 바다를 보며 쉬는 중이에요','바닷가에서 사진을 찍는 중이에요'],w:{nature:1.5,outgoing:.8,outdoor:.5},dur:[240,480],off:true,together:true}];
/* v20: 학생·백수·취준생·무직의 '일하기' = 아르바이트(외출). 일하는 곳·문구는 한국·일본·미국에서 흔한 알바를 섞었고(지역 설정은 없음), 성격에 따라 고르는 빈도만 달라진다 */
const PTJ=(id,t,hr,d,w,o)=>({id:'pt_'+id,pt:true,wishOnly:true,t,hr,d,w:w||{},dur:[180,300],rg:'kr',...(o||{})});
const PT_WHY=[
 PTJ('cafe','카페에서 아르바이트하는 중이에요',[8,22],['카페에서 주문을 받고 음료를 만들고 있어요','카페 카운터에서 손님을 맞고 컵을 정리하는 중이에요','카페에서 디저트를 진열하고 마감 정리를 하는 중이에요'],{social:.5,tidy:.4,sweet:.3}),
 PTJ('conv','편의점에서 아르바이트하는 중이에요',[0,24],['편의점에서 상품을 진열하고 계산을 돕고 있어요','편의점 카운터에서 택배를 접수하고 있어요','편의점에서 재고를 확인하며 유통기한을 살피는 중이에요'],{tidy:.5,lazy:-.3},{rg:'any'}),
 PTJ('fast','패스트푸드점에서 아르바이트하는 중이에요',[9,23],['패스트푸드점에서 주문을 처리하고 있어요','패스트푸드점 주방에서 감자튀김을 튀기는 중이에요','패스트푸드점에서 포장 주문을 챙기고 있어요'],{busy:.5,social:.3},{rg:'us'}),
 PTJ('serve','음식점에서 서빙과 주방 보조를 하는 중이에요',[10,22],['음식점에서 음식을 나르며 서빙하는 중이에요','음식점 주방에서 재료를 손질하며 돕는 중이에요','음식점 홀에서 테이블을 정리하는 중이에요'],{busy:.6,social:.3,cook:.4}),
 PTJ('babysit','아이를 돌보는 아르바이트를 하는 중이에요',[9,21],['아이를 돌보며 시간을 보내는 중이에요','아이와 블록 놀이를 하며 돌보는 중이에요','아이에게 동화책을 읽어 주는 중이에요'],{caring:1,sweet:.4,harsh:-.6,angry:-.6},{rg:'us',noMinor:true}),
 PTJ('carwash','세차장에서 아르바이트하는 중이에요',[9,18],['세차장에서 자동차를 닦고 있어요','세차장에서 거품을 내어 차를 씻기는 중이에요','세차장에서 자동차 유리를 닦는 중이에요'],{sporty:.5,outdoor:.5,lazy:-.5},{rg:'us',noMinor:true}),
 PTJ('lemon','길가에서 레모네이드를 팔고 있어요',[10,18],['길가에서 레모네이드를 팔고 있어요','가판대에서 손님에게 레모네이드를 따라 주는 중이에요','작은 가판대 앞에서 지나가는 사람들에게 손을 흔드는 중이에요'],{outgoing:.6,social:.6,playful:.4},{rg:'us',minor:true,dur:[90,180]}),
 PTJ('mart','마트에서 진열과 계산을 돕는 중이에요',[9,21],['마트에서 상품을 진열하고 있어요','마트 계산대에서 계산을 돕고 있어요','마트에서 장바구니를 정리하고 가격표를 바꾸는 중이에요'],{tidy:.6,busy:.3}),
 PTJ('deliv','배달 아르바이트를 하는 중이에요',[10,23],['배달 가방을 메고 주문을 전달하러 다니는 중이에요','골목을 돌며 음식을 배달하는 중이에요','배달을 마치고 다음 주문을 기다리는 중이에요'],{sporty:.6,outgoing:.5,lazy:-.6},{noMinor:true}),
 PTJ('book','서점과 문구점에서 아르바이트하는 중이에요',[10,21],['서점에서 책을 정리하고 계산을 돕고 있어요','문구점에서 노트와 펜을 진열하는 중이에요','서점 서가에서 신간을 꽂아 두는 중이에요'],{reader:.9,tidy:.4,shy:.2}),
 PTJ('cinema','영화관에서 아르바이트하는 중이에요',[10,24],['영화관 매점에서 팝콘을 담고 있어요','영화관에서 표를 확인하고 상영관을 안내하는 중이에요','영화관 상영관을 청소하고 정리하는 중이에요'],{movie:.9,social:.3},{rg:'any'}),
 PTJ('event','행사 스태프로 일하는 중이에요',[9,22],['행사장에서 참가자 안내를 맡고 있어요','행사 부스에서 물품을 나눠 주는 중이에요','행사장 입구에서 명찰을 나눠 주는 중이에요'],{outgoing:.7,social:.6,busy:.3},{dur:[240,420],noMinor:true}),
 PTJ('tutor','과외와 학습 보조를 하는 중이에요',[14,22],['학생에게 과외를 하며 문제를 설명해 주는 중이에요','학원에서 학습지를 채점하며 보조하는 중이에요','숙제를 봐주며 학습을 돕는 중이에요'],{studious:.9,caring:.4,reader:.3},{noMinor:true,dur:[120,240]}),
 PTJ('pet','반려동물을 돌보는 아르바이트를 하는 중이에요',[8,21],['이웃집 강아지를 산책시키고 있어요','반려동물 돌봄 센터에서 밥을 챙기는 중이에요','고양이 화장실을 치우며 돌봄을 돕는 중이에요'],{pet:1,dog:.4,cat:.4,caring:.4},{rg:'us',dur:[120,240]}),
 PTJ('flyer','전단과 신문을 돌리는 중이에요',[6,20],['거리에서 전단을 나눠 주고 있어요','동네를 돌며 신문을 배달하는 중이에요','상가 앞에서 전단을 붙이고 있어요'],{outdoor:.5,sporty:.4,earlybird:.4},{rg:'jp',dur:[90,200]}),
 PTJ('pcbang','PC방에서 아르바이트하는 중이에요',[0,24],['PC방 카운터에서 요금을 정산하고 있어요','PC방에서 자리를 정리하고 음료를 채우는 중이에요','PC방에서 손님 문의에 답하고 있어요'],{gamer:.9,nightowl:.4},{noMinor:true,night:true}),
 PTJ('bakery','빵집에서 아르바이트하는 중이에요',[7,20],['빵집에서 갓 나온 빵을 진열하고 있어요','빵집 카운터에서 포장을 돕는 중이에요','빵집에서 반죽 도구를 씻으며 정리하는 중이에요'],{sweet:.6,cook:.6,earlybird:.4}),
 PTJ('izaka','이자카야에서 홀을 돕는 중이에요',[17,24],['이자카야에서 주문을 받으며 안주를 나르고 있어요','이자카야 홀에서 빈 접시를 치우는 중이에요','이자카야 입구에서 손님을 자리로 안내하는 중이에요'],{social:.5,drinker:.2,nightowl:.4},{rg:'jp',noMinor:true,night:true}),
 PTJ('karaoke','노래방에서 아르바이트하는 중이에요',[12,24],['노래방 카운터에서 방을 배정하고 있어요','노래방 방을 청소하고 마이크를 정리하는 중이에요','노래방에서 음료를 가져다주는 중이에요'],{sing:.7,music:.5},{rg:'jp',noMinor:true,night:true}),
 PTJ('grocery','식료품점에서 짐을 포장해 주는 중이에요',[9,20],['식료품점에서 계산이 끝난 물건을 봉투에 담고 있어요','식료품점에서 손님의 짐을 차까지 옮겨 주는 중이에요','식료품점 진열대를 채우는 중이에요'],{caring:.3,busy:.3},{rg:'us'}),
 PTJ('lifeguard','수영장에서 안전요원 아르바이트를 하는 중이에요',[9,19],['수영장 의자에 앉아 물가를 살피고 있어요','수영장에서 호루라기를 들고 순찰하는 중이에요','수영장에서 안전 수칙을 안내하고 있어요'],{sporty:.9,outdoor:.5},{rg:'us',noMinor:true}),
 PTJ('yard','이웃집 마당 일을 도와 주는 중이에요',[9,18],['이웃집 마당의 잔디를 깎고 있어요','이웃집 정원의 낙엽을 쓸어 모으는 중이에요','이웃집 화단에 물을 주고 있어요'],{plant:.8,outdoor:.6,nature:.4},{rg:'us',minor:true,dur:[90,180]}),
 PTJ('shop','옷가게에서 판매 아르바이트를 하는 중이에요',[10,21],['옷가게에서 옷을 개어 진열하고 있어요','옷가게에서 손님에게 사이즈를 안내하는 중이에요','옷가게 피팅룸을 정리하는 중이에요'],{fashion:.9,social:.4,shopper:.3}),
 PTJ('themepark','놀이공원에서 스태프로 일하는 중이에요',[9,21],['놀이공원에서 줄 선 손님을 안내하고 있어요','놀이공원 기념품 가게에서 계산을 돕는 중이에요','놀이공원 입구에서 입장권을 확인하는 중이에요'],{outgoing:.6,playful:.4,social:.4},{noMinor:true,dur:[240,420]}),
 PTJ('errand','동네 가게에서 심부름 일을 거드는 중이에요',[10,18],['동네 가게에서 물건을 나르며 일손을 거드는 중이에요','가게 앞을 쓸며 손님을 기다리는 중이에요','가게에서 물건에 가격표를 붙이는 중이에요'],{caring:.3,tidy:.3},{minor:true,dur:[60,150]})];
OUT_WHY.push(...PT_WHY);
/* v20 희귀 사건: 일반 알바보다 훨씬 낮은 확률(1.2%)로, 같은 캐릭터에게는 3일에 한 번까지만, 성인 캐릭터에게만 생긴다. 현실의 범죄 방법은 담지 않은 서사용 문구이고, 캐릭터는 제안을 거절하고 일을 접는다(결과는 감정에 반영) */
const PT_ODD_P=.012,PT_ODD_CD=3*86400000;
const ODDJ=(id,d)=>({id:'pt_odd_'+id,pt:true,odd:true,wishOnly:true,seq:true,t:'알바 중에 수상한 제안을 받았어요',hr:[0,24],d,w:{},dur:[120,170],rg:'any'});
const PT_ODD=[
 ODDJ('pkg',['알바 중에 낯선 사람이 수상한 물건을 전달해 달라고 제안해 당황한 중이에요','출처를 알 수 없는 물건이라 단호하게 거절하고 자리를 피한 중이에요','찝찝한 마음에 알바를 일찍 접고 돌아가는 중이에요']),
 ODDJ('drug',['알바 중에 마약 운반을 도와 달라는 위험한 제안을 받고 얼어붙은 중이에요','분명하게 거절하고 곧바로 자리를 벗어난 중이에요','가슴이 두근거리지만 마음을 가라앉히며 돌아가는 중이에요']),
 ODDJ('sale',['알바 중에 불법적인 물건을 대신 팔아 달라는 제안을 받고 놀란 중이에요','제안을 거절하고 가게 사람에게 사정을 알린 중이에요','불안한 마음으로 일을 마무리하고 돌아가는 중이에요']),
 ODDJ('deal',['알바 중에 수상한 거래를 돕는 일을 제안받아 고민하는 중이에요','위험한 일에 얽히고 싶지 않아 정중히 거절한 중이에요','다시는 그 사람을 만나지 않겠다고 다짐하며 돌아가는 중이에요'])];
OUT_WHY.push(...PT_ODD);
function ptOdd(A,rng,st,now){if(!A||(A.facts&&A.facts.adult===false))return null;if(st&&st.ptOddAt&&now-st.ptOddAt<PT_ODD_CD)return null;if(rng()>=PT_ODD_P)return null;return PT_ODD[Math.floor(rng()*PT_ODD.length)]}

/* 아르바이트 고르기: 지금 시각에 가능한 곳 중 성격 가중치로 고른다. 미성년자(나이가 어리다고 명시된 경우)는 minor 표시가 있는 가벼운 일만 */
const PT_RG={kr:1.3,jp:.7,us:.7,any:1};
function ptCands(A,H){const minor=A&&A.facts&&A.facts.adult===false;
  return PT_WHY.filter(o=>inHr(o.hr,H)&&(minor?o.minor:!o.minorOnly)&&!(minor&&o.noMinor))}
function pickPt(A,rng,H,hash0){const c=ptCands(A,H);return c.length?wpick(rng,c,o=>mult(A,o.w)*(PT_RG[o.rg]||1)):null}
const OFF_ONLY=new Set(['cinema','park','themepark','dept','conv','matjip','friendhome','sea']);
/* 일하는 시간: 직장인·알바 = 평일(공휴일 제외) 9~18시 (밤·새벽 근무 단어가 있으면 18시 이후·새벽에도 가능) */
function jobSlot(A,now){const J=A&&A.job;if(!J||J.kind==='freelance')return null;
  const sp=seoul(now);if(isOffDay(now))return null;const hm=sp.hm;
  if(hm>=9&&hm<18)return {end:18,p:J.kind==='parttime'?.8:.88};
  if(J.night){if(hm>=18)return {end:24,p:.45};if(hm<6)return {end:6,p:.35}}
  return null}
function freeJobNow(A,now){const J=A&&A.job;if(!J||J.kind!=='freelance')return false;const sp=seoul(now);return !isOffDay(now)&&sp.hm>=9&&sp.hm<18}

/* ---------- 시간대 기본 가중치 (서울 시각 0~23시) ---------- */
const R=(a)=>{const o=[];a.forEach(([s,e,v])=>{for(let h=s;h<=e;h++)o[h]=v});return o};
const BASE={
 sleep:R([[0,5,10],[6,6,3],[7,7,1],[8,9,.4],[10,12,.15],[13,14,.5],[15,21,.1],[22,22,2.5],[23,23,7]]),
 wake:R([[0,5,.05],[6,6,6],[7,7,8],[8,8,4],[9,9,1.5],[10,17,.4],[18,19,.7],[20,20,2],[21,21,4],[22,22,5],[23,23,3]]),
 eat:R([[0,5,.12],[6,6,1],[7,8,4],[9,9,1.5],[10,10,.4],[11,11,2],[12,12,8],[13,13,6],[14,14,1],[15,16,.5],[17,17,2],[18,18,8],[19,19,7],[20,20,2],[21,21,.8],[22,22,.5],[23,23,.3]]),
 rest:R([[0,5,.3],[6,8,.6],[9,11,1],[12,14,1.5],[15,17,2],[18,19,1.2],[20,22,2.5],[23,23,1]]),
 read:R([[0,5,.6],[6,8,.6],[9,11,1.5],[12,14,1],[15,17,2],[18,19,.8],[20,22,2.5],[23,23,1.5]]),
 work:R([[0,5,.3],[6,8,.3],[9,11,3],[12,13,1],[14,17,3],[18,19,.8],[20,22,1.2],[23,23,.5]]),
 study:R([[0,5,.08],[6,8,.1],[9,11,.35],[12,14,.2],[15,17,.4],[18,19,.25],[20,22,.45],[23,23,.2]]),
 tv:R([[0,5,.3],[6,11,.3],[12,14,.8],[15,17,1],[18,19,1.5],[20,23,3]]),
 hobby:R([[0,5,.3],[6,8,.3],[9,11,1.2],[12,14,.8],[15,17,2],[18,19,1],[20,22,1.8],[23,23,.5]]),
 chore:R([[0,5,.05],[6,8,.8],[9,11,2],[12,14,.6],[15,17,1.2],[18,19,1.2],[20,21,.8],[22,23,.2]]),
 pet:R([[0,5,.05],[6,8,.8],[9,21,.8],[22,23,.2]]),
 wander:R([[0,5,.1],[6,23,1]]),
 out:R([[0,5,0],[6,6,.2],[7,7,1.2],[8,8,1.5],[9,11,2.5],[12,13,1.5],[14,17,3],[18,19,1.5],[20,20,.6],[21,21,.2],[22,23,.05]]),
 chat:R([[0,5,.05],[6,8,.4],[9,11,.8],[12,14,1],[15,17,1.3],[18,20,1.8],[21,22,1.2],[23,23,.4]])};
/* 그룹별 성향 계수: 가중치 배수 = max(.12, 1 + Σ계수×성향값) — 확률만 조정하고 행동을 고정하지 않는다 */
const GT={sleep:{lazy:.8,sleepy:1},wake:{tidy:.5,fashion:.8},eat:{foodie:.8,cook:.5,sweet:.6},rest:{lazy:.8,homebody:.3,music:.8,sleepy:.4},read:{reader:2.5,curious:.4},work:{worker:2.5,lazy:-.5,busy:.6},tv:{tv:2,movie:.8,gamer:.3},study:{studious:3,worker:.4,reader:.4,lazy:-.3},hobby:{hobby:2.5,gamer:1.2,creative:1,music:.4,curious:.4},
  chore:{tidy:1.5,plant:.8,lazy:-.5,caring:.3},pet:{pet:2,cat:.6,dog:.6},wander:{outgoing:.3,busy:.2},out:{outgoing:1.8,outdoor:1.2,social:1,homebody:-.8,solitary:-.5,lazy:-.4,nature:.9,shopper:.7,movie:.5,sporty:.5,shy:-.4,cat:-.2},chat:{social:2.2,solitary:-.7,caring:.4,shy:-.5}};
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
  let dy=0;if(pose==='sit')dy=Math.min(it.h*.3,35);if(pose==='lie')dy=it.kinds.includes('bed')?Math.max(30,Math.min(52,it.h*.4)):Math.min(it.h*.85,it.kinds.includes('sofa')?it.h*.55:it.h*.85);   // v23.4 침대: 머리판·캐노피까지 잰 전체 높이가 아니라 매트리스·이불선 높이(약 30~52cm)에 맞춰 눕힘
  return {f:it.f,x:W.clampX(s,it.x+off,pose==='lie'?Math.min(60,(s.right-s.left)/2-1):20),e:(it.e||fl.e)+dy,dy:it.e>fl.e+3&&pose==='stand'?0:dy,pose,uid:it.uid,seg:s.id}}
function occupancy(ctx,exceptId){const occ={};for(const o of ctx.chars){if(o.id===exceptId||o.pet)continue;const p=ctx.getPlace(o.id);if(p.mode==='home'&&p.tgt)occ[p.tgt]=(occ[p.tgt]||0)+1}return occ}
const isCouple=(A,B)=>A.facts.partners.includes(B.name);
function coupleOf(ctx,c,A){return ctx.chars.find(o=>o.id!==c.id&&!o.pet&&A.facts.partners.includes(o.name))||null}


/* ---------- 문구 재료: TV 서비스·공부·보드게임·게임·외출 세부 ---------- */
const STREAMS=[
 ['넷플릭스',['넷플릭스 드라마를 정주행하는 중','넷플릭스로 새로 올라온 시리즈를 보는 중','넷플릭스 다큐멘터리를 보는 중']],
 ['영화',['영화를 한 편 보는 중','예전에 본 영화를 다시 보는 중','TV로 영화를 틀어 놓고 보는 중']],
 ['왓챠',['왓챠로 보고 싶던 영화를 보는 중','왓챠에서 볼 만한 드라마를 고르는 중']],
 ['디즈니플러스',['디즈니플러스로 애니메이션을 보는 중','디즈니플러스에서 마블 시리즈를 보는 중']],
 ['쿠팡플레이',['쿠팡플레이로 스포츠 경기를 보는 중','쿠팡플레이에서 예능을 보는 중']],
 ['티빙',['티빙으로 예능을 몰아보는 중','티빙에서 인기 드라마를 보는 중']],
 ['웨이브',['웨이브로 지난 방송을 다시 보는 중','웨이브에서 드라마를 보는 중']]];
const BOARDGAMES=['체스','바둑','장기','할리갈리','인생게임','루미큐브','도블','젠가','블루마블','카탄','우노','젬블로','오목','마작','카드게임'];
const GAMEPLAY=['컴퓨터로 PC 게임을 하는 중','닌텐도 스위치로 게임을 하는 중','플레이스테이션으로 게임을 하는 중','휴대폰으로 모바일 게임을 하는 중','엑스박스로 게임을 하는 중','레트로 게임기로 추억의 게임을 하는 중','컴퓨터로 온라인 게임을 하는 중','스팀으로 새로 산 게임을 하는 중'];
/* 요즘 많이 준비하는 시험·공부 (2026 유망 자격증 소개 기사·취업 커뮤니티 등에서 흔히 거론되는 것들) */
const STUDY_SUBJ=['한국사능력검정시험','토익','SQLD','ADsP','재경관리사','컴퓨터활용능력','전기기사','공무원 시험','수능 수학','영어 회화','일본어(JLPT)','토플','IELTS','OPIc','텝스','지텔프','토익스피킹','HSK 중국어','DELF 프랑스어','DELE 스페인어','파이썬 코딩','전공 과제','회계 원리','ETF·경제'];
const STUDY_HARD=[x=>`${x} 문제집을 풀며 열공 중`,x=>`${x} 기출문제를 집중해서 푸는 중`,x=>`${x} 핵심 개념을 노트에 정리하는 중`,x=>`${x} 인터넷 강의를 들으며 필기하는 중`,x=>`${x} 내용을 소리 내어 외우는 중`,x=>`${x} 오답 노트를 정리하는 중`];
const STUDY_SLACK=[x=>`${x} 공부하는 척하며 휴대폰을 만지작거리는 중`,x=>`${x} 교재는 펴 놓고 딴생각에 빠진 중`,x=>`${x} 공부하다 몰래 영상을 구경하는 중`,x=>`${x} 공부는 미루고 책상 정리만 하는 중`,x=>`${x} 공부하다 말고 간식 생각에 빠진 중`];
const STUDY_SLEEPY=[x=>`${x} 교재에 얼굴을 묻고 꾸벅꾸벅 조는 중`,x=>`${x} 공부하다 졸음과 싸우는 중`,x=>`${x} 책을 펴 놓은 채 졸고 있는 중`];
function studyPhrase(rng,A,H,profile){
  const pr=profile||'';let pool=STUDY_SUBJ;
  const by=[[/영어|토익|토플|IELTS|아이엘츠|오픽/i,['토익','토플','IELTS','OPIc','텝스','지텔프','토익스피킹','영어 회화']],[/일본어|JLPT/i,['일본어(JLPT)']],[/중국어|HSK/i,['HSK 중국어']],[/프랑스어|DELF/i,['DELF 프랑스어']],[/스페인어|DELE/i,['DELE 스페인어']],[/코딩|프로그래|개발|파이썬/,['파이썬 코딩','SQLD']],[/회계|재무|경리/,['재경관리사','회계 원리']],[/공무원|공시|행정/,['공무원 시험','한국사능력검정시험']],[/전기|전공/,['전기기사','전공 과제']],[/수능|고3|입시/,['수능 수학']]];
  for(const [re,l] of by)if(re.test(pr)){pool=l;break}
  const subj=pick(rng,pool),late=(H>=23||H<5);
  const sl=Math.min(.5,(late?.3:.1)+(tv(A,'sleepy')>0?.15:0)),sk=.3+(tv(A,'lazy')>0?.2:0)-(tv(A,'worker')>0?.05:0);
  const r=rng();const list=r<sl?STUDY_SLEEPY:(r<sl+sk?STUDY_SLACK:STUDY_HARD);
  return pick(rng,list)(subj)}
function fillExtra(say,rng,A,H,profile,brng){
  if(say.indexOf('{')<0)return say;
  if(/\{S\}/.test(say)){const st=pick(rng,STREAMS);say=say.replace(/\{S\}/g,pick(rng,st[1]))}
  if(/\{Y\}/.test(say))say=say.replace(/\{Y\}/g,studyPhrase(rng,A,H,profile));
  if(/\{GM\}/.test(say))say=say.replace(/\{GM\}/g,pick(rng,GAMEPLAY));
  if(/\{B\}/.test(say)){const b=pick(brng||rng,BOARDGAMES);say=say.replace(/\{B\}을\(를\)/g,eul(b)).replace(/\{B\}/g,b)}
  return say}
/* v23: 위화감 행동(viv-uncanny.js 의 EVENTS)을 행동 후보로 만든다. 문구·단계·쿨다운·가중치는 모두 Uncanny 설정에서 가져온다. */
const _uv={};
function uncVerb(id,E){return _uv[id]||(_uv[id]={id,g:'unc',k:null,pose:'stand',dur:E.dur,t:[],w:{},unc:true,tier:E.tier,special:(E.kind==='prev'||E.kind==='exit'||E.kind==='alone')?'wander':undefined})}
function uncCandidates(ctx,c,A,st,pos,R,itemsR,winOps,others,out){
  const U=ctx.unc,W=ctx.world,here=pos.seg?pos.seg.id:null,dist=(x,f)=>Math.abs(x-pos.x)+(f!==pos.f?400:0);
  const sameRoom=others.filter(o=>{const q=posOf(W,ctx.getPlace(o.id));return q.seg&&q.seg.id===here});
  const lastNormal=[...(st.recent||[])].reverse().find(r=>!String(r).startsWith('u_'));
  for(const id of U.ids){const E=U.EVENTS[id];if(!U.allow(c.id,id,A))continue;const v=uncVerb(id,E);
    if(E.kind==='win')winOps.forEach(w=>out.push({v,win:w,dist:dist(w.x,w.f)}));
    else if(E.kind==='stand')out.push({v,seg:pos.seg,dist:0});
    else if(E.kind==='prev'){const ps=st.prevSeg!=null&&st.prevSeg!==here&&R.has(st.prevSeg)?W.segOf(st.prevSeg):null;if(ps)out.push({v,seg:ps,dist:dist((ps.left+ps.right)/2,ps.f)})}
    else if(E.kind==='exit'){const ex=W.exits[0],es=ex&&W.segAt(ex.f,ex.x);if(es&&R.has(es.id)&&es.id!==here)out.push({v,seg:es,dist:dist((es.left+es.right)/2,es.f)})}
    else if(E.kind==='alone'){for(const sid of R){if(sid===here)continue;const sg=W.segOf(sid);if(!sg)continue;if(others.some(o=>{const q=posOf(W,ctx.getPlace(o.id));return q.seg&&q.seg.id===sid}))continue;out.push({v,seg:sg,dist:dist((sg.left+sg.right)/2,sg.f)})}}
    else if(E.kind==='items'){for(const it of itemsR)if(it.kinds.some(k=>E.k.includes(k)))out.push({v,item:it,dist:dist(it.x,it.f)})}
    else if(E.kind==='near'){for(const o of sameRoom)out.push({v,seg:pos.seg,near:o,dist:0})}
    else if(E.kind==='rep'){const again=lastNormal&&out.find(x=>x.v.id===lastNormal&&!x.v.unc&&!x.v.care&&!x.v.pair&&x.v.g!=='sleep'&&x.v.g!=='p_sleep');if(again)out.push({v,seg:pos.seg,rep:again,dist:0})}}}
function candidates(ctx,c,A,st,pos,hm,opts){
  opts=opts||{};const W=ctx.world,R=(c.pet&&SPECIES[c.pet.sp].room&&pos.seg)?new Set([pos.seg.id]):W.reach(pos.seg?pos.seg.id:0),H=Math.floor(hm),out=[];   // v17: 작은 반려동물(햄스터·새·물고기)은 있는 방 안에서만 움직임
  const myPs=c.pet?(ctx.getSim(c.id).pet||{}):null;
  const others=ctx.chars.filter(o=>o.id!==c.id&&!o.pet&&ctx.getPlace(o.id).mode==='home'&&ctx.getPlace(o.id).house===ctx.houseId);
  const occ=occupancy(ctx,c.id);
  const itemsR=W.items.filter(it=>R.has(it.seg));
  const have=k=>itemsR.some(it=>it.kinds.includes(k));
  /* 서재라는 이름의 방이 있거나, 프로필에 독서를 좋아한다고 적힌 캐릭터는 책장·책 가구가 없어도 책을 읽을 수 있음 */
  const studyRoom=[...R].some(id=>/서재|도서실|책방|독서실|라이브러리|공부방|library|study/i.test((W.segOf(id).name||'')));
  const have2=k=>have(k)||((k==='bookshelf'||k==='book')&&(studyRoom||tv(A,'reader')>0));
  const winOps=W.windows.filter(w=>R.has(w.seg));
  /* 공부: 성격(공부를 좋아함)이 없어도 방 이름이 서재·공부방·침실이거나 데스크·책상·테이블 가구가 있으면 가끔 공부함 */
  const STUDY_ROOM=/서재|공부방|침실|study|bedroom/i;
  const studyOK=(seg,it)=>{if(it&&it.kinds.includes('studyfurn'))return true;if(!seg)return false;if(STUDY_ROOM.test(seg.name||''))return true;return (W.bySeg.get(seg.id)||[]).some(i=>i.kinds.includes('studyfurn')||i.kinds.includes('desk'))};
  for(const v of VERBS){
    if(v.internal||v.special==='prep')continue;
    if(v.sp){if(!c.pet||c.pet.sp!==v.sp||!petCond(v,ctx,c,myPs,ctx.now))continue}else if(c.pet)continue;   // v17: 반려동물은 자기 종 행동만, 사람은 반려동물 행동 제외
    if(v.wishOnly&&!opts.wish)continue;
    if(v.req&&!(opts.wish&&v.jobv&&v.id!=='job_free')&&!v.req(A))continue;   // 일하기를 직접 고른 경우에는 직업·성향이 없어도 책상류 가구만 있으면 가능
    const softStudy=v.g==='study'&&!(tv(A,'studious')>0)&&!opts.wish;
    if(v.trait&&!(tv(A,v.trait)>0)&&!(opts.wish&&v.wishAny)&&!softStudy)continue;
    if(v.likes){(A.likes||[]).forEach(L=>out.push({v,seg:pos.seg,dist:0,like:L}));continue}
    if(v.hr&&!inHr(v.hr,H)&&!opts.ignoreHr)continue;
    if(v.hobbyFree){hobbyPool(A).forEach(L=>out.push({v,seg:pos.seg,dist:0,like:L}));continue}
    if(v.nap&&(H>=21||H<6)&&!opts.ignoreHr&&have('bed'))continue;
    if(v.nobed&&have('bed'))continue;
    if(!v.nap&&v.g==='sleep'&&v.id.startsWith('sleep_')&&!opts.sleepAnyTime&&H>=9&&H<20&&!opts.wish)continue;
    if(v.nap&&!(H>=21||H<6)&&H>=6&&false)continue;
    if(v.need&&!v.need.some(k=>have2(k)))continue;
    if(v.care){   // v17: 반려인이 자기 반려동물을 돌보는 행동 — 반려동물이 같은 집에 있어야 함
      for(const pe of ownPets(ctx,c)){
        const S=SPECIES[pe.pet.sp];if(!S.care.includes(v.care))continue;
        const pp=ctx.getPlace(pe.id);if(pp.mode!=='home'||pp.house!==ctx.houseId)continue;
        const ps=posOf(W,pp);if(!ps.seg||!R.has(ps.seg.id))continue;
        const need=careNeed(pe,ctx.getSim(pe.id).pet||{},v.care,ctx.now);
        if(v.care==='walk'){if(!S.walk||!canExit(ctx,pos)||!(opts.wish||(H>=6&&H<22)))continue}
        if(!opts.wish&&need<=0)continue;
        if(opts.wish&&v.care==='clean'&&need<=0)continue;
        out.push({v,partner:pe,petNeed:need,dist:Math.abs(ps.x-pos.x)+(ps.f!==pos.f?400:0)})}
      continue}
    if(v.pair){   // 상대가 필요한 행동
      if(!others.length)continue;
      for(const o of others){
        const pp=ctx.getPlace(o.id);if(pp.action==='sleep'&&!(v.couple))continue;
        if(pp.verb==='love_confess'||pp.verb==='love_propose'){if(ctx.getSim(o.id).decideAt>ctx.now)continue}   // 고백·프로포즈 중인 사람에게는 다른 캐릭터가 끼어들지 못함
        const B=ctx.analysis(o);const cpl=isCouple(A,o)||!!(ctx.mind&&ctx.mind.isCouple&&ctx.mind.isCouple(c.id,o.id));if(v.couple&&!cpl)continue;
        if(v.rom&&!(ctx.mind&&ctx.mind.romCan&&ctx.mind.romCan(v.rom,c.id,o.id,A,B)))continue;
        if(v.ev){const ws=ctx.getSim(o.id).wish;if(ws&&!ws.done)continue}   // 상대가 직접 지정한 행동을 하고 있으면 특별 이벤트로 끊지 않음
        const oPos=posOf(W,pp);if(!oPos.seg||!R.has(oPos.seg.id))continue;
        const acc=.3+.5*Math.max(0,tv(B,'social'))-.2*Math.max(0,tv(B,'solitary'));
        const r0=mulberry(hash(c.id+o.id+'acc'+(st.n||0)+Math.floor(ctx.now/MIN)));
        if(!opts.wish&&!v.rom&&r0()>acc*(ctx.mind?ctx.mind.acceptMul(o.id,c.id):1))continue;   // v16: 상대가 나를 어떻게 느끼는지·상대의 기분이 받아들일 확률에 반영
        if(v.k){for(const it of itemsR){if(!it.kinds.some(k=>v.k.includes(k)))continue;if((occ[it.uid]||0)>=capacity(it,v.couple||cpl))continue;
          out.push({v,item:it,partner:o,couple:cpl,dist:Math.abs(it.x-pos.x)+(it.f!==pos.f?400:0)})}}
        else out.push({v,partner:o,couple:cpl,dist:Math.abs(oPos.x-pos.x)+(oPos.f!==pos.f?400:0)})}
      continue}
    if(v.k&&v.k[0]===WINDOW_KIND){
      for(const w of winOps)out.push({v,win:w,dist:Math.abs(w.x-pos.x)+(w.f!==pos.f?400:0)});continue}
    if(v.special==='wander'){   // 다른 방으로
      let segs=[...R].map(i=>W.segOf(i)).filter(s=>!pos.seg||s.id!==pos.seg.id),pw=null;
      if(c.pet&&(v.follow||v.wait)){   // v17: 반려인을 따라가거나(같은 집) 반려인이 나가 있으면 현관 쪽에서 기다림
        const ow=ownerOf(ctx,c);if(!ow){continue}
        if(v.follow){const op=ctx.getPlace(ow.id);if(op.house!==ctx.houseId||op.mode!=='home')continue;const q=posOf(W,op);segs=q.seg&&R.has(q.seg.id)&&(!pos.seg||q.seg.id!==pos.seg.id)?[q.seg]:[];pw=ow}
        else{const ex=W.exits[0],es=ex&&W.segAt(ex.f,ex.x);segs=es&&R.has(es.id)&&(!pos.seg||es.id!==pos.seg.id)?[es]:[];pw=ow}}
      segs.forEach(s=>out.push({v,seg:s,partner:pw||undefined,dist:Math.abs((s.left+s.right)/2-pos.x)+(s.f!==pos.f?400:0)}));continue}
    if(!v.k){   // 가구 없이 가능한 행동(서성임, 친구 연락)
      if(softStudy&&!studyOK(pos.seg,null))continue;
      out.push({v,seg:pos.seg,dist:0});continue}
    for(const it of itemsR){
      if(!it.kinds.some(k=>v.k.includes(k)))continue;
      if(softStudy&&!studyOK(W.segOf(it.seg),it))continue;
      if(v.id==='sleep_bed'||v.id==='nap_bed'||v.id==='lie_bed'||v.id==='read_bed'||v.id==='tv_bed'||v.id==='wake_stretch'){
        const cp=coupleOf(ctx,c,A);const cap=(cp&&it.w>=130)?2:1;if((occ[it.uid]||0)>=cap)continue}
      else if((occ[it.uid]||0)>=capacity(it,false))continue;
      if(v.seatKind){   // TV 시청: 같은 방에 앉을 곳이 있어야 함
        const seat=W.bySeg.get(it.seg).find(s=>s.kinds.includes(v.seatKind)&&(occ[s.uid]||0)<capacity(s,false));if(!seat)continue;
        out.push({v,item:it,seat,dist:Math.abs(seat.x-pos.x)+(seat.f!==pos.f?400:0)});continue}
      out.push({v,item:it,dist:Math.abs(it.x-pos.x)+(it.f!==pos.f?400:0)})}}
  if(ctx.unc&&!c.pet&&!opts.wish&&pos.seg)uncCandidates(ctx,c,A,st,pos,R,itemsR,winOps,others,out);
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
    if(st.outUntil&&now<st.outUntil&&!reason){
      /* 외출이 길면 30분 단위로 하고 있는 일이 바뀐다(공원이면 낙엽 사진 → 피크닉 …). 같이 나간 연인은 같은 문구가 나오도록 시각 기반으로 고른다 */
      const why0=OUT_WHY.find(o=>'out_'+o.id===p.verb),dd0=why0&&((c.pet&&why0.pd)||why0.d);
      if(why0&&dd0&&dd0.length>1&&st.outUntil-now>20*MIN){
        const n0=dd0.length,at=st.outAt||st.outUntil-120*MIN,prog=Math.max(0,Math.min(.999,(now-at)/Math.max(1,st.outUntil-at)));
        const pre=/^\S+ 함께 /.exec(p.say||''),off=why0.seq?0:hash(p.verb+'|'+at)%n0,idx=(off+Math.floor(prog*n0))%n0;   // 순서가 있는 외출(영화관 등)은 처음부터 차례대로, 그 외는 임의의 자리에서 시작해 차례로 돈다
        
        const ns=(pre?pre[0]:'')+dd0[idx].replace(/\{n\}/g,st.outNb||'이웃집');if(ns!==p.say)ctx.setPlace(c.id,{say:ns})}
      /* v23.3 외출이 길어지면 가끔 바깥 공간이 세트처럼 느껴지는 행동지문으로 바뀜(함께 나간 경우·404 상태는 제외) */
      if(ctx.unc&&!c.pet&&!ctx.unc.isMissing(c.id)&&!/^out_(visit|job|pt_|dogwalk)/.test(ctx.getPlace(c.id).verb||'')&&!/^\S+ 함께 /.test(ctx.getPlace(c.id).say||'')&&!(ctx.getPlace(c.id).partner)){const os=ctx.unc.outSay(c.id,A,mulberry(hash(c.id+'|os|'+now)));if(os)ctx.setPlace(c.id,{say:os})}
      ctx.setSim(c.id,{decideAt:Math.min(st.outUntil,qd(now,30))});return null}
    const ex=W.exits[0];if(!ex){ctx.setPlace(c.id,{mode:'home',f:0,x:W.mid});pos=posOf(W,{f:0,x:W.mid})}
    else{const e=(st.outFrom&&W.exits.find(x=>x.side===st.outFrom))||ex;pos=posOf(W,{f:e.f,x:e.x});ctx.setPlace(c.id,{mode:'home',f:e.f,x:pos.x,pose:'stand',dy:0,tgt:null});returned=true;moves.push({id:c.id,from:{f:e.f,x:W.edgeOut(e.f,e.x),e:W.floorE(e.f)},route:[{f:e.f,x:pos.x,e:W.floorE(e.f)}],enter:true})}}
  const from={f:pos.f,x:pos.x,e:p.mode==='out'||returned?W.floorE(pos.f):(p.e!=null?p.e:W.floorE(pos.f))};
  const recent=(st.recent||[]).slice(-4);
  const bias=st.bias&&st.bias.until>now?st.bias:null;
  /* 대기 중인 후속 행동(외출 준비 → 외출) */
  let wish=st.wish&&!st.wish.done&&now-st.wish.at<30*MIN?st.wish:null;   // 사용자 선택은 30분이 지나면 효력이 사라짐
  let then=wish?null:st.then;
  if(then&&now-(st.decideAt||0)>30*MIN)then=null;   // 준비가 끝난 지 오래된 후속 행동은 버린다(오프라인 동안의 일을 뒤늦게 실행하지 않음)   // 사용자가 새로 고른 방향이 있으면 대기 중이던 후속 행동보다 우선
  const setStop=(patch)=>ctx.setSim(c.id,{...stUp,...patch});
  let forcedPet=null,forcedNb=null;
  const doOut=(why,durMin)=>{
    const ex=exitSpot(W,rng);if(!ex)return false;
    const seg=W.segAt(ex.f,ex.x);if(!pos.seg||!W.reach(pos.seg.id).has(seg.id))return false;
    const rt=W.route({f:pos.f,x:pos.x},{f:ex.f,x:ex.x});if(!rt)return false;
    const dur=durMin||Math.round(why.dur[0]+rng()*(why.dur[1]-why.dur[0]));
    /* 연인·부부 사이라면 집에 있는 상대와 함께 나감 (둘 다 집에서 사라지고 화면 왼쪽 위에 나란히 표시) */
    let dsay=why.d&&why.d.length?why.d[why.seq?0:hash('out_'+why.id+'|'+now)%why.d.length]:why.t;if(why.id==='visit'){if(!forcedNb)return false;dsay=dsay.replace(/\{n\}/g,forcedNb.name)}let mate=null,say=dsay;
    if(why.together){const cp=coupleOf(ctx,c,A);
      if(cp){const pp=ctx.getPlace(cp.id);
        if(pp.mode==='home'&&pp.house===ctx.houseId&&pp.action!=='sleep'&&pp.action!=='out'&&rng()<.85){const pPos=posOf(W,pp);
          const rt2=pPos.seg&&W.reach(pPos.seg.id).has(seg.id)?W.route({f:pPos.f,x:pPos.x},{f:ex.f,x:ex.x}):null;
          if(rt2)mate={cp,pp,pPos,rt2}}}}
    let pm=null;
    if(why.pet){   // v17: 반려견 산책 — 집에 있는 반려견을 함께 데리고 나감
      const pe=(forcedPet?petsOf(ctx).find(o=>o.id===forcedPet):null)||ownPets(ctx,c).find(o=>SPECIES[o.pet.sp].walk);
      if(pe){const pp=ctx.getPlace(pe.id);
        if(pp.mode==='home'&&pp.house===ctx.houseId){const pPos=posOf(W,pp);const rt2=pPos.seg&&W.reach(pPos.seg.id).has(seg.id)?W.route({f:pPos.f,x:pPos.x},{f:ex.f,x:ex.x}):null;
          if(rt2)pm={pe,pp,pPos,rt2}}}
      if(!pm)return false;
      say=wa(pm.pe.name)+' 함께 '+dsay}
    if(mate)say=wa(mate.cp.name)+' 함께 '+dsay;
    ctx.setPlace(c.id,{mode:'out',action:'out',verb:'out_'+why.id,tgt:null,pose:'stand',dy:0,f:ex.f,x:ex.x,say,e:null});
    setStop({outAt:now,decideAt:dur>40?qd(now,30):qd(now,dur),outUntil:qd(now,dur),outFrom:ex.side,outTo:why.id==='visit'?forcedNb.hid:null,outNb:why.id==='visit'?forcedNb.name:null,then:null,wish:wish?{...wish,done:true}:null,recent:[...recent,'out'].slice(-5)});
    moves.push({id:c.id,from,route:rt,leave:true});
    if(mate){const {cp,pp,pPos,rt2}=mate;
      ctx.setPlace(cp.id,{mode:'out',action:'out',verb:'out_'+why.id,tgt:null,pose:'stand',dy:0,f:ex.f,x:ex.x,say:wa(c.name)+' 함께 '+dsay,e:null});
      ctx.setSim(cp.id,{outAt:now,decideAt:dur>40?qd(now,30):qd(now,dur),outUntil:qd(now,dur),outFrom:ex.side,then:null,wish:null,updatedAt:now,dirty:false,recent:[...((ctx.getSim(cp.id).recent)||[]),'out'].slice(-5)});
      moves.push({id:cp.id,from:{f:pPos.f,x:pPos.x,e:pp.e!=null?pp.e:W.floorE(pPos.f)},route:rt2,leave:true})}
    if(pm){const {pe,pp,pPos,rt2}=pm,pdsay=why.pd[why.seq?0:hash('out_'+why.id+'|'+now)%why.pd.length],pst0=ctx.getSim(pe.id);
      ctx.setPlace(pe.id,{mode:'out',action:'out',verb:'out_'+why.id,tgt:null,pose:'stand',dy:0,f:ex.f,x:ex.x,say:wa(c.name)+' 함께 '+pdsay,e:null});
      ctx.setSim(pe.id,{...pst0,outAt:now,decideAt:dur>40?qd(now,30):qd(now,dur),outUntil:qd(now,dur),outFrom:ex.side,then:null,wish:null,updatedAt:now,dirty:false,pet:applyCare(pst0.pet,'walk',now)});
      moves.push({id:pe.id,from:{f:pPos.f,x:pPos.x,e:pp.e!=null?pp.e:W.floorE(pPos.f)},route:rt2,leave:true})}
    return true};
  const pickWhy=(forced)=>{const off=isOffDay(now),inSlot=!!jobSlot(A,now);
    if(!forced&&inSlot)return OUT_WHY.find(o=>o.id==='job');   // 일하는 시간에는 일하러 가는 것이 우선
    const cand=OUT_WHY.filter(o=>!o.jobOnly&&!o.wishOnly&&(!OFF_ONLY.has(o.id)||off)&&(inHr(o.hr,H)||forced&&forced===o.id));
    if(forced){const f=OUT_WHY.find(o=>o.id===forced);if(f)return f}
    const cands=cand.filter(o=>!(o.id==='drink'&&A.facts.adult===false)&&!(o.id==='work'&&(A.job||(tv(A,'worker')<=0&&rng()<.7))));
    return wpick(rng,cands.length?cands:OUT_WHY.filter(o=>o.id==='errand'),o=>mult(A,o.w)*(off&&OFF_ONLY.has(o.id)?2.2:1))};
  if(then&&then.k==='out'){
    const why=OUT_WHY.find(o=>o.id===then.why)||pickWhy();forcedNb=then.nb&&(ctx.neighbors||[]).some(n=>n.hid===then.nb.hid)?then.nb:null;   // v20: 방문은 실행 직전에도 이 집과 연결된 이웃인지 다시 확인
    setStop({then:null});if(inHr(why.hr,H)&&canExit(ctx,pos)&&doOut(why,then.dur)){if(why.odd)ctx.setSim(c.id,{ptOddAt:now,ptOdd:why.id});return moves}st={...st,then:null}}
  else if(st.then)setStop({then:null});
  /* 사용자 선택(wish)이 있으면 가장 먼저 반영 */
  let forcedGroup=null,forcedVerb=null,bonusGroup=null,forcedJobV=false;
  if(wish){
    const wo=resolveWish(wishById(ctx,c,wish.k),A);
    if(wo){
      if(wo.out){const why=wo.out==='pt'?(ptOdd(A,rng,st,now)||pickPt(A,rng,H)||OUT_WHY.find(o=>o.id==='job')):OUT_WHY.find(o=>o.id===wo.out);const chk=wishCheck(ctx,c,wo);forcedPet=wo.pet||null;forcedNb=wo.nb||null;
        if(chk.ok){setStop({wish:{...wish,done:true},bias:{g:'out',until:now+120*MIN},then:null});const sd=ctx.getSim(c.id);
          // 외출 준비 후 나가기
          const prep=prepVerb(ctx,c,A,pos,rng);
          if(prep&&rng()<.6){return startVerb(ctx,c,A,p,st,pos,from,moves,prep,rng,stUp,hm,recent,{then:{k:'out',why:why.id,nb:forcedNb},dur:[1,2]})}
          if(doOut(why,why.id==='job'?240:undefined)){if(why.odd)ctx.setSim(c.id,{ptOddAt:now,ptOdd:why.id});return moves}}
        ctx.setSim(c.id,{...stUp,wish:{...wish,done:true,fail:chk.why}});wish=null}
      else if(wo.friend){
        const v=VERBS.find(x=>x.id==='friend_msg');
        const meet=canExit(ctx,pos)&&H>=11&&H<22&&rng()<.35+.35*Math.max(0,tv(A,'social'))+.15*Math.max(0,tv(A,'outgoing'));
        const phone=W.items.find(it=>it.kinds.includes('phone')&&W.reach(pos.seg.id).has(it.seg));
        const cand={v:phone?VERBS.find(x=>x.id==='phone_call'):v,item:phone||null,seg:pos.seg,dist:0};
        ctx.setSim(c.id,{...stUp,wish:{...wish,done:true},bias:{g:'chat',until:now+90*MIN}});
        return startVerb(ctx,c,A,p,st,pos,from,moves,cand,rng,stUp,hm,recent,meet?{then:{k:'out',why:'friend'}}:{},true)}
      else{forcedGroup=wo.g;bonusGroup=wo.g;forcedJobV=!!wo.job;forcedVerb=wo.vid||null;forcedPet=wo.pet||null;ctx.setSim(c.id,{bias:{g:wo.g,until:now+90*MIN}})}}}
  /* 일하는 시간(직장인·알바): 평일 9~18시에는 일하러 나감 */
  if(!c.pet&&(!forcedGroup&&p.mode!=='out'||returned&&!forcedGroup)){
    const js=jobSlot(A,now);
    if(js&&canExit(ctx,pos)&&!(st.lastBack&&now-st.lastBack<45*MIN&&!returned)&&rng()<js.p){
      const wj=OUT_WHY.find(o=>o.id==='job');if(doOut(wj,Math.max(30,Math.round((js.end-hm)*60))))return moves}}
  /* 일반 선택: 그룹 → 행동 */
  let cs=candidates(ctx,c,A,st,pos,hm,{wish:!!forcedGroup,ignoreHr:!!forcedGroup,sleepAnyTime:!!forcedGroup&&forcedGroup==='sleep'});
  if(forcedJobV){const jv=cs.filter(x=>x.v.jobv);if(jv.length)cs=jv}   // v19: '일하기'는 일하기 행동 10종 중에서 성격 가중치로 고름
  if(forcedVerb)cs=cs.filter(x=>x.v.id===forcedVerb&&(!forcedPet||x.partner&&x.partner.id===forcedPet));   // v17: '○○ 밥주기'처럼 대상까지 정한 선택
  const groups={};cs.forEach(x=>(groups[x.v.g]=groups[x.v.g]||[]).push(x));
  const eh=effHour(A,hm),eH=Math.floor(eh);
  if(!forcedGroup&&!c.pet&&canExit(ctx,pos)&&!groups.out){groups.out=[{v:{id:'out',g:'out'},special:true}]}
  const gnames=Object.keys(groups).filter(g=>!forcedGroup||g===forcedGroup);
  if(forcedGroup&&!gnames.length){ctx.setSim(c.id,{...stUp,wish:{...wish,done:true,fail:'지금은 할 수 없어요'}});return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent)}
  const lastOut=st.lastBack&&now-st.lastBack<60*MIN;
  const myPs=c.pet?(st.pet||{}):null;
  let uncW=0;
  const gw=g=>{if(g==='unc')return uncW;if(c.pet)return forcedGroup===g?1:petGroupW(c,g,H,myPs,now)*(bias&&bias.g===g?1.9:1);
    if(g==='care')return forcedGroup===g?1:careGroupW(H,groups.care||[])*(bias&&bias.g===g?1.9:1);
    let w=(BASE[g]?BASE[g][g==='out'||g==='chat'?H:eH]:1)*mult(A,GT[g]||{});
    if(ctx.mind&&!c.pet)w*=ctx.mind.groupMul(c.id,g);   // v16: 외로움·피곤함·지루함 같은 감정이 행동 종류 선택에 반영
    if(g==='chat'&&(groups.chat||[]).some(x=>x.v.rom))w*=2.6;   // v19: 연애 상태가 있는 쌍은 함께하는 행동이 더 자주 선택됨
    if(bias&&bias.g===g)w*=1.9;if(g==='work'&&freeJobNow(A,now))w*=2.4;if(forcedGroup===g)w=1;if(g==='out'&&isOffDay(now))w*=1.6;
    if(g==='out'&&lastOut)w*=.2;if(g==='sleep'&&H>=9&&H<20&&tv(A,'lazy')<=0)w*=.5;return w};
  if(groups.unc&&!forcedGroup&&ctx.unc){   // v23: 위화감 행동의 몫은 일상 행동 가중치 합에 대한 비율로 정함(체류일·부담·성격은 Uncanny.share 가 반영)
    let tot=0;for(const g of gnames)if(g!=='unc')tot+=gw(g);const sh=ctx.unc.share(c.id,A,{hour:hm});uncW=tot>0?tot*sh/(1-sh):0}
  const rg=wpick(rng,gnames,gw);
  if(!rg)return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent);
  if(rg==='out'){
    const why=pickWhy();const prep=prepVerb(ctx,c,A,pos,rng);
    if(canExit(ctx,pos)){if(prep&&rng()<.65)return startVerb(ctx,c,A,p,st,pos,from,moves,prep,rng,stUp,hm,recent,{then:{k:'out',why:why.id}});
      if(doOut(why))return moves}
    return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent)}
  const list=groups[rg];
  const uncCnt={};list.forEach(x=>{if(x.v.unc)uncCnt[x.v.id]=(uncCnt[x.v.id]||0)+1});
  const cw=x=>{let w=mult(A,x.v.w||{});if(x.v.rare)w*=x.v.rare;
    const rc=recent.filter(r=>r===x.v.id).length;w*=rc?(recent[recent.length-1]===x.v.id?.12:.4):1;
    w*=1/(1+(x.dist||0)/700);
    if(x.v.near&&x.item&&W.bySeg.get(x.item.seg).some(i=>i.kinds.includes(x.v.near)))w*=2.2;
    if(x.v.unc)return ctx.unc.verbW(c.id,x.v.id,A)/(uncCnt[x.v.id]||1);   // 같은 위화감 행동의 후보(가구·방)가 많아도 그 행동이 더 자주 뽑히지 않도록 나눔
    if(x.v.id==='wander'||x.v.id==='idle')w*=.5;
    if(x.v.g==='study'&&!(tv(A,'studious')>0))w*=.35;   // 공부를 좋아하지 않는 성격은 환경만 맞을 때 가끔
    if(x.item&&W.bySeg.get(x.item.seg)&&x.v.k&&x.v.k.includes('bookshelf')&&tv(A,'reader')>0)w*=1.3;
    if(x.couple)w*=2;
    if(x.v.care)w*=.3+(x.petNeed||0)*3;
    if(x.v.follow&&x.partner)w*=3;
    if(ctx.mind&&!c.pet&&!x.v.care){   // v16: 관계·기억·기분이 가까이 갈 상대를 고를 확률에 반영(확정 명령이 아님)
      if(x.partner)w*=ctx.mind.partnerMul(c.id,x.partner.id);
      else if(x.v.special==='wander'&&x.seg){for(const o of ctx.chars){if(o.id===c.id)continue;const op=ctx.getPlace(o.id);if(op.mode!=='home')continue;const q=posOf(W,op);if(q.seg&&q.seg.id===x.seg.id)w*=Math.sqrt(ctx.mind.partnerMul(c.id,o.id))}}}
    if(x.item&&x.v.id==='sleep_bed'){const cp=coupleOf(ctx,c,A);if(cp){const pq=ctx.getPlace(cp.id);if(pq.mode==='home'&&pq.verb==='sleep_bed'&&pq.tgt===x.item.uid)w*=10}}   // 연인이 이미 자는 침대로
    return w};
  let ch=wpick(rng,list,cw);
  if(ch&&ch.rep)ch={...ch.rep,uncRep:ch.v};   // 직전에 했던 일상 행동을 그대로 다시 함
  if(ch&&ch.v.care==='walk'){forcedPet=ch.partner.id;const wk=OUT_WHY.find(o=>o.id==='dogwalk');
    if(canExit(ctx,pos)&&doOut(wk))return moves;
    return decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent)}
  return startVerb(ctx,c,A,p,st,pos,from,moves,ch,rng,stUp,hm,recent,{})}

/* 행동이 바뀌는 간격: 행동 종류별 시간 단위 범위에서 랜덤(분). 잦은 갱신을 피하려는 설정 */
const SPAN={care:[8,25],p_sleep:[40,100],p_rest:[30,80],p_play:[10,30],p_roam:[10,40],p_eat:[10,25],p_wait:[15,40],wake:[30,60],eat:[45,90],chore:[40,90],pet:[40,90],wander:[30,90],sleep:[40,90],rest:[60,150],read:[60,180],work:[60,180],tv:[60,150],study:[45,120],hobby:[60,180],chat:[45,120]};
function spanOf(v,rng){const r=SPAN[v.g]||[60,120];return Math.round((r[0]+rng()*(r[1]-r[0]))/5)*5}
function prepVerb(ctx,c,A,pos,rng){
  const W=ctx.world;if(!pos.seg)return null;const R=W.reach(pos.seg.id);
  const its=W.items.filter(it=>R.has(it.seg)&&it.kinds.some(k=>['wardrobe','hanger','mirror','vanity','cosmetic','clothes','medical'].includes(k)));
  if(!its.length)return null;const it=pick(rng,its);return {v:VERBS.find(x=>x.id==='prep_out'),item:it,dist:0,prep:true}}
function idleOf(c){return c.pet?VERBS.find(x=>x.id===c.pet.sp+'_lone'||x.sp===c.pet.sp&&x.g==='p_rest')||VERBS.find(x=>x.sp===c.pet.sp):VERBS.find(x=>x.id==='idle')}
function decideFallback(ctx,c,A,p,st,pos,from,moves,rng,stUp,hm,recent){
  const v=idleOf(c);return startVerb(ctx,c,A,p,st,pos,from,moves,{v,seg:pos.seg,dist:0},rng,stUp,hm,recent,{})}

/* 문구 만들기: 자체 장소 표현("책상 앞에서", "침대에서")이 있으면 방 이름은 생략해 "~에서 ~에서"가 겹치지 않게 한다 */
function fillSay(tpl,room,partner){
  let t=tpl;if(t.startsWith('{r}에서 ')){const rest=t.slice(6);if(/^\S+( 앞)?에서\s/.test(rest))t=rest}
  return t.replace(/\{r\}/g,room).replace(/\{p\}와\(과\)/g,wa(partner||'')).replace(/\{p\}을\(를\)/g,eul(partner||'')).replace(/\{p\}이\(가\)/g,ig(partner||'')).replace(/\{p\}/g,partner||'')}
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
    const idle=idleOf(c);return startVerb(ctx,c,A,p,st,pos,from,moves,{v:idle,seg:pos.seg,dist:0},rng,stUp,hm,recent,{})}
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
  const tpls=(cpl&&v.cp&&rng()<.6)?v.cp:(v.care&&partner&&partner.pet?careTexts(v,partner,'o'):(v.t&&v.t.length?v.t:null));
  if(v.special==='wander'&&!v.petsay){const fromSeg=pos.seg;say=fromSeg&&fromSeg.id!==roomSeg.id?`${fromSeg.name}에서 ${ro(roomSeg.name)} 자리를 옮기는 중`:`${eul(room)} 이리저리 걸어 다니는 중`}
  else say=fillSay(pick(rng,tpls||['{r}에서 지내는 중']),room,partner&&partner.name);
  const pfood=(c.pet?c.pet:partner&&partner.pet)&&SPECIES[(c.pet||partner.pet).sp].food;if(pfood)say=say.replace(/\{f\}을\(를\)/g,eul(pfood)).replace(/\{f\}/g,pfood);
  const brng=partner?mulberry(hash([c.id,partner.id].sort().join('|')+'bg'+Math.floor(now/(15*MIN)))):null;
  say=fillExtra(say,rng,A,H,c.profile,brng);
  const uv=ch.uncRep||(v.unc?v:null);
  if(uv&&ctx.unc){const ut=ctx.unc.say(c.id,uv.id,A,rng,{nb:(ctx.neighbors||[]).length});if(ut)say=fillSay(ut,room,ch.near?ch.near.name:'')}
  if(ch.like)say=say.replace(/\{L\}을\(를\)/g,eul(ch.like)).replace(/\{L\}/g,ch.like);
  let evB=null;   // v19: 연애 상태가 있는 쌍이면 두 사람의 성격을 조합한 지문(특별 이벤트는 결과까지 정해 두 사람에게 함께 표시)
  if(partner&&v.pair&&!partner.pet&&!c.pet&&ctx.mind&&ctx.mind.romLine){
    try{const B2=ctx.analysis(partner);
      if(v.ev){const pl=ctx.mind.romPlan(v.rom,c.id,partner.id,A,B2,c.name,partner.name,room,rng);if(pl){say=pl.a;evB=pl.b}}
      else{const rl=ctx.mind.romLine(c.id,partner.id,A,B2,rng,c.name,partner.name,room,!!v.rom);if(rl)say=rl}}catch(e){}}
  if(v.id==='sleep_bed'&&ch.item){const cp=coupleOf(ctx,c,A);if(cp){const pp=ctx.getPlace(cp.id);if(pp.mode==='home'&&pp.action==='sleep'&&pp.tgt===ch.item.uid&&ctx.getSim(cp.id).decideAt>now)say=fillSay(pick(rng,['{r}에서 {p}를 꼭 안고 잠든 중','{r}에서 {p}의 곁에서 서로 기대어 곤히 자는 중','{r}에서 {p}의 팔을 베고 잠든 중']),room,cp.name)}}
  const patch={mode:'home',action:uv?'unc':v.g,verb:uv?uv.id:v.id,tgt:spot.uid||null,pose:spot.pose,dy:spot.dy||0,f:spot.f,x:Math.round(spot.x),say,e:spot.e,partner:partner?partner.id:null,seg:spot.seg};
  ctx.setPlace(c.id,patch);
  if(ctx.unc&&!c.pet){if(uv)ctx.unc.onStart(c.id,uv.id,A);else ctx.unc.onNormal(c.id)}
  /* v22: 행동 갱신은 서울 시계의 :00/:15/:30/:45 마다. 평소 행동은 다음 15분 눈금(5분 미만이 남으면 그다음 눈금)까지만 하고 다시 정함 — 밤잠·낮잠·준비 동작·직접 지정 시간은 예외로 길게 유지 */
  const longKeep=v.g==='sleep'||v.g==='p_sleep'||!v.dur||v.internal||v.special==='prep'||(extra&&extra.dur)||(extra&&extra.then);
  const QM=15*MIN,nextMark=(()=>{let t=(Math.floor(now/QM)+1)*QM;if(t-now<5*MIN)t+=QM;return t})();
  const nxt={...stUp,decideAt:longKeep?qd(now,dur):nextMark,recent:[...recent,uv?uv.id:v.id].slice(-5),prevSeg:(roomSeg&&pos.seg&&roomSeg.id!==pos.seg.id)?pos.seg.id:(st.prevSeg!=null?st.prevSeg:null),lastBack:(p.mode==='out'?now:st.lastBack),then:extra&&extra.then?extra.then:null,outUntil:0,outTo:null,outNb:null};
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
      const tp=partner.pet&&v.care?careTexts(v,partner,'p'):((ch.couple&&v.cp&&rng()<.6)?v.cp:v.t);let psay0=fillSay(pick(rng,tp),room,c.name);if(partner.pet){const fd=SPECIES[partner.pet.sp].food;psay0=psay0.replace(/\{f\}을\(를\)/g,eul(fd)).replace(/\{f\}/g,fd)}const psay=fillExtra(psay0,rng,B,H,partner.profile,partner?mulberry(hash([c.id,partner.id].sort().join('|')+'bg'+Math.floor(now/(15*MIN)))):null);
      let psayF=psay;   // v19: 상대 쪽 지문도 연애 상태·성격에 맞게
      if(!partner.pet&&!c.pet&&ctx.mind&&ctx.mind.romLine){try{
        if(evB)psayF=evB;
        else{const rl2=ctx.mind.romLine(partner.id,c.id,B,A,rng,partner.name,c.name,room,!!v.rom);if(rl2)psayF=rl2}}catch(e){}}
      const pfrom={f:ppos.f,x:ppos.x,e:pp.e!=null?pp.e:W.floorE(ppos.f)};
      ctx.setPlace(partner.id,{mode:'home',action:v.g,verb:v.id,tgt:ps.uid||null,pose:ps.pose,dy:ps.dy||0,f:ps.f,x:Math.round(ps.x),say:psayF,e:ps.e,partner:c.id,seg:ps.seg});
      ctx.setSim(partner.id,{...pst,n:(pst.n||0)+1,updatedAt:now,decideAt:nxt.decideAt,recent:[...(pst.recent||[]),v.id].slice(-5),then:null,...(v.care&&partner.pet?{pet:applyCare(pst.pet,v.care,now)}:{})});
      moves.push({id:partner.id,from:pfrom,route:prt||[],final:ctx.getPlace(partner.id)})}}
  return moves}

/* =====================================================================
   6) 사용자 선택(행동 방향)
   ===================================================================== */
const WISHES=[
 {id:'read',label:'집에서 책 읽기',g:'read',need:'책장·책이 있거나 서재라는 이름의 방이 있어야 해요(프로필에 독서를 좋아한다고 적혀 있으면 가구 없이도 가능)'},
 {id:'eat',label:'식사하기',g:'eat',need:'주방·식탁·냉장고 같은 가구가 필요해요'},
 {id:'sleep',label:'잠깐 자기',g:'sleep',need:'침대나 소파가 필요해요'},
 {id:'rest',label:'쉬기',g:'rest',need:'소파·의자·침대 같은 쉴 곳이 필요해요'},
 {id:'work',label:'작업하기',g:'work',need:'책상이나 노트북이 필요해요'},
 {id:'job',label:'일하기',job:true,need:'프로필에 직업이나 직업명(예: 직장인·알바·프리랜서·간호사·개발자)이 적혀 있거나, 집에 사무실·워크스테이션·책상·데스크 에셋이 있어야 해요'},
 {id:'tv',label:'TV 보기',g:'tv',need:'이름에 TV가 들어간 가구(TV·TV 장식장 등)가 필요해요'},
 {id:'study',label:'공부하기',g:'study',need:''},
 {id:'hobby',label:'취미 즐기기',g:'hobby',need:'취미 가구(악기·이젤 등)가 있거나, 프로필에 좋아하는 것·취미가 적혀 있어야 해요'},
 {id:'care',label:'씻고 단장하기',g:'wake',need:'욕실·거울·옷장 같은 가구가 필요해요'},
 {id:'walk',label:'산책하러 나가기',out:'walk',need:'바깥으로 나가는 문이 필요해요'},
 {id:'friend',label:'친구에게 연락하기',friend:true,need:''},
 {id:'chat',label:'다른 캐릭터와 대화하기',g:'chat',need:'같은 집에 이동할 수 있는 다른 캐릭터가 필요해요'}];
/* v17: 반려동물 돌보기 선택('care:행동:반려동물id')과 반려동물 자신의 선택('pg:그룹')은 상황에 따라 만들어진다 */
const PG_LABEL={p_sleep:'자기',p_rest:'쉬기',p_play:'놀기',p_roam:'돌아다니기',p_eat:'밥 먹기'};
function wishById(ctx,c,id){
  if(typeof id!=='string')return null;
  if(c.pet){const m=/^pg:(p_[a-z]+)$/.exec(id);return m&&PG_LABEL[m[1]]?{id,label:PG_LABEL[m[1]],g:m[1],need:m[1]==='p_eat'?'반려인이 밥을 챙겨 준 뒤에 먹을 수 있어요':'지금은 할 수 없어요'}:null}
  const vm=/^visit:(.+)$/.exec(id);
  if(vm){const nb=(ctx.neighbors||[]).find(n=>n.hid===vm[1]);return nb?{id,label:`${nb.name} 놀러가기`,out:'visit',nb:{hid:nb.hid,name:nb.name},need:'바깥으로 나가는 문이 필요해요'}:null}
  const m=/^care:([a-z]+):(.+)$/.exec(id);
  if(m){const pe=allOf(ctx).find(o=>o.id===m[2]&&o.pet&&o.pet.owner===c.id);if(!pe||!CARE[m[1]]||!SPECIES[pe.pet.sp].care.includes(m[1]))return null;
    const S=SPECIES[pe.pet.sp],nm=pe.name;
    if(m[1]==='walk')return {id,label:`${nm} 산책시키기`,out:'dogwalk',pet:pe.id,need:'바깥으로 나가는 문이 필요하고, 반려견이 집에 있어야 해요'};
    const lab=m[1]==='clean'?S.cleanN:CARE[m[1]].n;
    return {id,label:`${nm} ${lab}`,g:'care',vid:'care_'+m[1],pet:pe.id,need:m[1]==='clean'?'지금은 치울 것이 없어요':`${nm}이(가) 이 집에 있어야 해요`}}
  return WISHES.find(w=>w.id===id)||null}
function wishList(ctx,c){
  if(c.pet)return Object.keys(PG_LABEL).map(g=>wishById(ctx,c,'pg:'+g)).filter(Boolean);
  const A0=ctx.analysis?ctx.analysis(c):analyze(c.profile,c.name,ctx.chars||[]);
  const out=WISHES.map(w=>w.job&&A0.status?{...w,label:'알바하러 가기',need:'바깥으로 나가는 문이 필요해요'}:w);
  for(const nb of (ctx.neighbors||[])){const w=wishById(ctx,c,'visit:'+nb.hid);if(w)out.push(w)}   // v17: 이웃으로 등록한 집마다 '(집이름) 놀러가기'
  for(const pe of ownPets(ctx,c))for(const k of SPECIES[pe.pet.sp].care){const w=wishById(ctx,c,`care:${k}:${pe.id}`);if(w)out.push(w)}
  return out}
function resolveWish(wo,A){if(!wo||!wo.job)return wo;   // '일하기': 학생·백수·취준생·무직은 아르바이트, 고정 근무는 일하러 나가기, 프리랜서는 집에서 일하기
  if(A&&A.status)return {...wo,out:'pt',label:'알바하러 가기'};
  if(!A||!A.job)return {...wo,g:'work'};return A.job.kind==='freelance'?{...wo,g:'work',job:true}:{...wo,out:'job'}}
function wishCheck(ctx,c,wo0){
  const wo=resolveWish(wo0,ctx.analysis?ctx.analysis(c):analyze(c.profile,c.name,ctx.chars||[]));
  if(wo0.job){const A0=ctx.analysis?ctx.analysis(c):analyze(c.profile,c.name,ctx.chars||[]);if(!A0.job&&!A0.status&&!(ctx.world&&ctx.world.items&&ctx.world.items.some(it=>it.kinds.includes('office'))))return {ok:false,why:wo0.need};
    if(A0.status&&!ptCands(A0,seoul(ctx.now).hour).length)return {ok:false,why:'지금 시간에는 일할 수 있는 아르바이트 자리가 없어요'}}
  const p=ctx.getPlace(c.id);if(p.mode==='out'&&wo.id!=='walk')return {ok:false,why:'지금은 집에 없어요'};
  const A=ctx.analysis(c),W=ctx.world,pos=posOf(W,p),H=seoul(ctx.now).hour;
  if(p.mode==='out')return {ok:false,why:'이미 외출 중이에요'};
  if(wo.out==='dogwalk'){const pe=allOf(ctx).find(o=>o.id===wo.pet),pq=pe&&ctx.getPlace(pe.id);if(!pe||pq.mode!=='home'||pq.house!==ctx.houseId)return {ok:false,why:`${pe?pe.name:'반려동물'}이(가) 집에 없어요`}}
  if(wo.out){if(!canExit(ctx,pos))return {ok:false,why:W.exits.length?'현관까지 이어지는 길이 막혀 있어요':'바깥으로 나가는 문이 없어요(1층 외벽 문이나 "문" 에셋이 필요해요)'};
    if(wo.out!=='job'&&wo.out!=='pt'&&(H>=23||H<5))return {ok:false,why:'서울 시각으로 늦은 밤이라 지금은 나가기 어려워요'};return {ok:true}}
  if(wo.friend)return {ok:true};
  const st=ctx.getSim(c.id);
  const cs=candidates(ctx,c,A,st,pos,seoul(ctx.now).hm,{wish:true,ignoreHr:true,sleepAnyTime:true}).filter(x=>x.v.g===wo.g&&(!wo.job||x.v.jobv)&&(!wo.vid||x.v.id===wo.vid&&x.partner&&x.partner.id===wo.pet));
  if(!cs.length)return {ok:false,why:wo.need||'지금은 할 수 없어요'};
  return {ok:true}}
const ensure=ctx=>{if(!ctx.analysis)ctx.analysis=c=>analyze(c.profile,c.name,ctx.chars||[]);return ctx};
function wishOptions(ctx,c){ensure(ctx);return wishList(ctx,c).map(w=>{const r=wishCheck(ctx,c,w);return {id:w.id,label:w.label,ok:r.ok,why:r.ok?'':r.why}})}
function setWish(ctx,c,id){
  ensure(ctx);
  const wo=wishById(ctx,c,id);if(!wo)return {ok:false,why:'알 수 없는 선택이에요'};
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
  ctx.chars=mine;revalidate(ctx);
  const humans=mine.filter(c=>!c.pet),pets=mine.filter(c=>c.pet);   // v17: 사람의 관계·대화 계산에는 반려동물을 넣지 않음
  ctx.all=mine;ctx.chars=humans;ctx.analysis=ctx.analysis||(c=>analyze(c.profile,c.name,humans));
  for(const pe of pets){if(!ctx.getSim(pe.id).pet)ctx.setSim(pe.id,{pet:petInit(ctx.now)})}
  const cache=new Map();const an=ctx.analysis;ctx.analysis=c=>{if(!cache.has(c.id))cache.set(c.id,an(c));return cache.get(c.id)};
  for(const c of humans.concat(pets)){   // 사람이 먼저 정하고 반려동물이 그 뒤에 따라 움직임
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

const api={parsePet,petTag,SPECIES,SPECIES_IDS,CARE,petNeeds,careNeed,petInit,wishList,fillSay,_candidates:candidates,_posOf:posOf,GROUPS,seoul,analyze,kindsOf,buildWorld,stepHouse,revalidate,wishOptions,setWish,VERBS,OUT_WHY,WISHES,BASE,hash,mulberry,KNAME,TRAIT_RULES,effHour,wa,ro,jobSlot,isOffDay,HOLIDAYS,hobbyPool};
root.Sim=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
