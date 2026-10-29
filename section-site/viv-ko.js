/* viv-ko.js — 행동지문용 한국어 문법 엔진 (규칙 기반, 외부 AI·형태소 분석기 없음, 약 12KB)
   ① 조사 선택(받침·ㄹ 받침·숫자·알파벳)  ② 용언 활용(불규칙 포함)  ③ 취미 표현 해석(명사 / 동사구 / ~기)  ④ 의미 분류별 문장 틀  ⑤ 최종 검사(조사 정리·호응 위반 거르기)
   프로필 문구를 문장 틀에 그대로 끼우지 않고 먼저 [목적어 + 서술어 / 명사] 로 나눈 뒤, 뜻에 맞는 틀로 문장을 새로 만든다. */
(function(G){
const H=ch=>{const c=String(ch).charCodeAt(0);return c>=0xAC00&&c<=0xD7A3},dec=c=>{const n=c.charCodeAt(0)-0xAC00;return [n/588|0,(n%588)/28|0,n%28]},com=(l,v,t)=>String.fromCharCode(0xAC00+l*588+v*28+t);
const withTail=(s,t)=>{const c=s.slice(-1);if(!H(c))return s+'';const [l,v]=dec(c);return s.slice(0,-1)+com(l,v,t)};
const setVow=(s,v)=>{const [l,,t]=dec(s.slice(-1));return s.slice(0,-1)+com(l,v,t)};
/* ---------- ① 조사 ---------- */
const DIG=[21,8,0,16,0,0,1,8,8,0],LAT={L:8,M:16,N:4,R:8,l:8,m:16,n:4,r:8};
function tail(n){n=String(n||'').replace(/[\s)\]"'’”.!?…]+$/,'');const c=n.slice(-1);if(!c)return 0;if(H(c))return dec(c)[2];if(/\d/.test(c))return DIG[+c];if(/[A-Za-z]/.test(c))return LAT[c]||0;return 0}
const JO={eun:['은','는'],i:['이','가'],eul:['을','를'],wa:['과','와'],rang:['이랑','랑'],ida:['이','']};
function j(n,k){n=String(n);if(k==='ro'){const t=tail(n);return n+(t===0||t===8?'로':'으로')}return n+JO[k][tail(n)?0:1]}
/* 'X을(를)' 'X이(가)' 'X은(는)' 'X와(과)' 'X(으)로' 꼴을 앞 낱말의 받침으로 확정 */
const fill=t=>String(t).replace(/([가-힣A-Za-z0-9]+)(을\(를\)|를\(을\)|이\(가\)|가\(이\)|은\(는\)|는\(은\)|와\(과\)|과\(와\)|\(으\)로)/g,(m,n,p)=>j(n,{'을':'eul','를':'eul','이':'i','가':'i','은':'eun','는':'eun','와':'wa','과':'wa','(':'ro'}[p[0]]));
/* ---------- ② 용언 활용 ---------- */
const NOREU=/(따르|치르|들르|푸르)$/,SIOT=/[짓낫잇붓긋젓]$/,LSTEM='만들 살 놀 알 팔 열 울 들 걸 돌 갈 풀 끌 불 썰 졸 굴 벌 빌 거닐 꾸밀 어울 이울'.split(' ');
const BADJ=/(롭|답|럽|겁|갑|맵|춥|덥|쉽|렵|깝|립|밉|섭|곱)$/,BV=/(돕|눕|굽|줍|곱)$/;
function cls(s,adj){const L=s.slice(-1);if(/하$/.test(s))return 'ha';if(/[듣걷싣묻]$/.test(s))return 'd';if(tail(s)===17&&(BV.test(s)||(adj&&BADJ.test(s))))return 'b';if(SIOT.test(s))return 's';
  if(/르$/.test(s)&&s.length>1&&!NOREU.test(s))return 'reu';if(H(L)&&dec(L)[1]===18&&dec(L)[2]===0)return 'eu';return tail(s)===8?'l':''}
const bright=ch=>{const v=dec(ch)[1];return v===0||v===8||v===9||v===2};   // ㅏ ㅗ ㅘ ㅑ → '아', 그 밖에는 '어'
function aeo(s,c){const L=s.slice(-1),P=s.slice(-2,-1);
  if(c==='ha')return s.slice(0,-1)+'해';
  if(c==='reu'){const [l,v]=dec(P);return s.slice(0,-2)+com(l,v,8)+(bright(P)?'라':'러')}
  if(c==='eu'){const [l]=dec(L);return s.slice(0,-1)+com(l,P&&bright(P)?0:4,0)}
  if(c==='d')return withTail(s,8)+(bright(L)?'아':'어');
  if(c==='b')return withTail(s,0)+(/[돕곱]$/.test(s)?'와':'워');
  if(c==='s')return withTail(s,0)+(bright(s.slice(-1))?'아':'어');
  const [,v,t]=dec(L);
  if(t)return s+(bright(L)?'아':'어');
  if(v===8)return setVow(s,9);if(v===13)return setVow(s,14);if(v===20)return setVow(s,6);if(v===11)return setVow(s,10);if(v===16||v===19)return s+'어';
  return s}
/* 으 계열 어미(은·을·음): 받침 없으면 받침으로, 있으면 '은/을/음'을 붙인다 */
function adn(s,c,t){const E={4:'은',8:'을',16:'음'}[t];
  if(c==='b')return withTail(s,0)+withTail('우',t);
  if(c==='s'||c==='d')return withTail(s,c==='d'?8:0)+E;
  if(c==='l'){const b=withTail(s,0);return t===16?withTail(b,10):withTail(b,t)}
  if(tail(s)===0)return withTail(s,t);
  return s+E}
function conj(base,f,adj){const s=String(base).replace(/다$/,''),c=cls(s,adj);
  switch(f){
  case 'a':return aeo(s,c);case 'ayo':return aeo(s,c)+'요';case 'cause':return aeo(s,c)+'서';
  case 'done':return withTail(aeo(s,c),20)+'다';
  case 'nom':return s+'기';case 'mum':return adn(s,c,16);
  case 'pres':return adj?adn(s,c,4):(c==='l'?withTail(s,0):s)+'는';
  case 'past':return adn(s,c,4);case 'fut':return adn(s,c,8);
  case 'seq':return s+'고';case 'conc':return s+'지만';case 'trans':return s+'다가';case 'prog':return s+'고 있다';
  case 'sim':return c==='d'?withTail(s,8)+'으며':c==='b'?withTail(s,0)+'우며':c==='s'?withTail(s,0)+'으며':(c==='l'||tail(s)===0)?s+'며':s+'으며'}
  return s}
/* ---------- ③ 취미 표현 해석 ---------- */
const VS=new Set('달리 걷 읽 듣 놀 쓰 부르 그리 보 타 먹 마시 만들 굽 뛰 찍 치 줍 뜨 짓 낚 캐 모으 키우 가꾸 꾸미 배우 찾 고르 거닐 쉬 자 눕 걸 끓이 만지 맞추 풀 감상하'.split(' '));
const restore=s=>{const l=LSTEM.find(x=>x.length>1&&withTail(x,0)===s);return l||s};
const CATS=[['liq',/술|맥주|소주|와인|위스키|막걸리|칵테일|음주|보드카|한잔/],['cafe',/커피|라떼|홍차|녹차|허브티|티타임|카페|주스|음료|^차$/],['walk',/산책|거닐|등산|산길|^걷/],['read',/책|독서|소설|만화|시집|잡지|읽/],['music',/음악|노래|피아노|기타|바이올린|연주|악기|작곡|합창|라디오|팟캐스트|레코드/],['sweet',/디저트|케이크|초콜릿|사탕|과자|쿠키|아이스크림|간식|젤리|빵/],['cook',/요리|베이킹|제빵|반찬/],['game',/게임|퍼즐|체스|바둑/],['draw',/그림|그리|스케치|드로잉|낙서|미술|수채화|색칠/],['write',/일기|글쓰기|^글|작문|캘리/],['watch',/영화|드라마|영상|애니|유튜브|넷플릭스|시청|TV|tv/],['plant',/식물|화분|정원|꽃|원예|텃밭|가꾸/],['sport',/운동|러닝|달리|조깅|헬스|요가|수영|자전거|스트레칭|줄넘기/],['nap',/낮잠|수면|늦잠|^잠/],['craft',/뜨개|바느질|수공예|목공|조립|공예|자수/],['photo',/사진|카메라|촬영|찍/],['fish',/낚시|낚/],['sky',/별|하늘|구름|창밖/]];
const catOf=s=>{for(const [k,re] of CATS)if(re.test(s))return k;return ''};
/* 'raw' → {kind:'v'|'n', obj, stem, noun, nom, cat}.  동사구('술 마시는 걸'), '~기', 하다 명사('산책하기'), 일반 명사를 가른다. */
const cache={};
function parse(raw){raw=String(raw||'').trim().replace(/\s+/g,' ');if(cache[raw])return cache[raw];let m,r;
  if(m=/^(?:(.+?) )?([가-힣]+?)는 ?(?:것|걸|거|게)?$/.exec(raw)){const st=restore(m[2]);r={kind:'v',obj:m[1]||'',stem:st}}
  else if(m=/^(?:(.+?) )?([가-힣]+?)기$/.exec(raw)){const st=m[2];if(m[1]||/하$/.test(st)||VS.has(st))r={kind:'v',obj:m[1]||'',stem:st}}
  if(r&&/^하$/.test(r.stem)&&r.obj){r.stem=r.obj+'하';r.obj=''}
  if(r&&/[가-힣]하$/.test(r.stem)&&!r.obj){r.obj=r.stem.slice(0,-1);r.hada=1}
  if(!r)r={kind:'n',noun:raw};
  r.raw=raw;
  if(r.kind==='v'){const o=r.obj,st=r.stem;r.cat=/굽|끓이|볶|삶|부치/.test(st)||(st==='만들'&&/빵|케이크|쿠키|음식|밥|반찬|디저트|요리|과자/.test(o))?'cook':/먹|마시/.test(st)?(c=>/liq|cafe|sweet/.test(c)?c:'')(catOf(o)):catOf(o+' '+st);r.intr=/^(있|없|되|가|오|살|놀|자|눕|쉬|달리|걷|뛰|앉|서|웃|울|떠나)$/.test(st)}
  else r.cat=catOf(r.noun);
  r.nom=r.kind==='v'?(r.hada?r.obj+'하기':(r.obj?r.obj+' ':'')+r.stem+'기'):raw;
  r.np=r.kind==='v'?r.obj:r.noun;           // 목적어로 쓸 수 있는 명사(없으면 '')
  return cache[raw]=r}
const canon=raw=>parse(raw).nom;
/* ---------- ④ 의미 분류별 문장 틀 (act: 실제 하고 있는 행동 / want: 욕구 / feel: 감정·회상 / habit: 습관) ---------- */
const F={
 liq:{act:['술잔을 천천히 기울이는 중','안주를 집어 가며 술잔을 기울이는 중','술잔을 만지작거리며 한 모금 넘기는 중'],want:['술이 마시고 싶은 모양','한잔하고 싶어 하는 듯함'],feel:['한잔하고 싶은 생각에 입맛을 다심','술병 쪽으로 슬쩍 눈길이 가는 모양'],habit:['습관처럼 술병이 있는 쪽을 살피는 중','저녁이 되면 한잔 생각이 나는 듯함']},
 cafe:{act:['따뜻한 잔을 두 손으로 감싸 쥐고 있는 중','향을 맡으며 천천히 한 모금씩 마시는 중'],want:['따뜻한 음료가 당기는 모양','한 잔 내려 마실까 고민하는 듯함'],feel:['향긋한 냄새를 떠올린 듯 표정이 풀림','한 잔 마시고 나면 개운할 것 같다는 얼굴'],habit:['습관처럼 주방 쪽을 흘끗 보는 중']},
 read:{act:['책장을 한 장씩 넘기는 중','책을 펼쳐 놓고 줄을 따라 눈을 옮기는 중','읽던 부분에 손가락을 끼운 채 다음 장으로 넘어가는 중'],want:['읽을 만한 책을 찾는 중','새 책을 펼쳐 보고 싶은 모양'],feel:['책을 펼쳐 놓고도 좀처럼 집중하지 못하는 중','읽다 만 대목이 마음에 걸리는 듯함'],habit:['습관처럼 책장 앞을 서성이는 중','손이 닿는 곳에 책을 두고 싶어 하는 듯함']},
 walk:{act:['천천히 걸으며 주변을 둘러보는 중','발걸음을 느긋하게 옮기는 중'],want:['산책을 나갈까 고민하는 중','바깥공기가 쐬고 싶은 모양'],feel:['걸으면 머릿속이 정리될 것 같다는 얼굴','창밖을 보며 걷고 싶은 마음을 누르는 듯함'],habit:['신발 쪽으로 자꾸 시선이 가는 모양']},
 music:{act:['음악에 맞춰 가볍게 고개를 까딱이는 중','흘러나오는 선율에 귀를 기울이는 중'],want:['다음에 틀 곡을 고르는 중','흥얼거릴 노래를 떠올리는 모양'],feel:['머릿속에 맴도는 선율을 따라가는 듯함','좋아하는 곡이 떠올랐는지 입꼬리가 올라감'],habit:['자기도 모르게 콧노래가 새어 나오는 모양']},
 sweet:{act:['달콤한 것을 아껴 가며 먹는 중','한 입씩 음미하며 먹는 중'],want:['달콤한 것이 당기는 모양','간식 생각에 입맛을 다시는 중'],feel:['단 것을 떠올리자 표정이 풀린 듯함'],habit:['출출해지면 간식 둔 곳을 살피는 중']},
 cook:{act:['재료를 손질하며 불 앞을 오가는 중','간을 보며 맛을 다듬는 중'],want:['무엇을 만들어 먹을지 고민하는 중','맛있는 냄새가 그리운 모양'],feel:['요리할 생각에 슬슬 기운이 나는 듯함'],habit:['냉장고를 열어 재료를 들여다보는 중']},
 game:{act:['화면에 시선을 고정한 채 손을 바삐 움직이는 중','한 판만 더 하자며 다시 시작하는 중'],want:['한 판 하고 싶어 손이 근질거리는 모양','어디까지 했는지 떠올리는 중'],feel:['지난 판의 아쉬움을 곱씹는 듯함'],habit:['틈이 나면 기기 쪽으로 손이 가는 모양']},
 draw:{act:['연필을 쥐고 선을 천천히 이어 가는 중','색을 고르며 종이 위에 덧칠하는 중'],want:['떠오른 장면을 그려 두고 싶은 모양','빈 종이를 앞에 두고 무엇을 그릴지 고민하는 중'],feel:['머릿속 그림이 손끝으로 옮겨지지 않아 답답한 듯함'],habit:['손끝으로 허공에 선을 긋는 중']},
 write:{act:['펜 끝으로 한 줄씩 적어 내려가는 중','썼다 지웠다를 되풀이하며 문장을 다듬는 중'],want:['적어 두고 싶은 말이 떠오른 모양','첫 문장을 고르는 중'],feel:['쓰고 싶은 이야기가 맴도는 듯함'],habit:['생각이 떠오를 때마다 메모를 하려는 모양']},
 watch:{act:['화면에 푹 빠져 눈을 떼지 못하는 중','줄거리를 따라가며 화면을 바라보는 중'],want:['볼 만한 것을 찾는 중','하던 이야기의 다음이 궁금한 모양'],feel:['어제 본 장면이 머릿속에 남아 있는 듯함'],habit:['쉬는 틈이 나면 화면부터 켜는 모양']},
 plant:{act:['잎을 하나씩 살피며 흙을 만져 보는 중','물뿌리개를 들고 화분을 돌보는 중'],want:['화분이 목말라 보이는지 살피는 모양','새 잎이 났는지 궁금한 듯함'],feel:['자란 잎을 보며 흐뭇해하는 듯함'],habit:['지나가다 화분 쪽을 한 번씩 들여다보는 중']},
 sport:{act:['몸을 풀며 숨을 고르는 중','땀을 닦아 가며 동작을 이어 가는 중'],want:['몸을 움직이고 싶어 근질거리는 모양','운동복을 챙길까 고민하는 중'],feel:['굳은 어깨를 돌려 보며 운동을 떠올리는 듯함'],habit:['앉아 있다가도 자꾸 기지개를 켜는 모양']},
 nap:{act:['눈을 감은 채 꾸벅꾸벅 졸고 있는 중'],want:['잠깐 눈을 붙일 곳을 찾는 모양'],feel:['잠이 쏟아지는지 눈꺼풀이 무거운 듯함'],habit:['앉기만 하면 하품이 나는 모양']},
 craft:{act:['손끝으로 조심스럽게 작업을 이어 가는 중','재료를 맞춰 보며 모양을 잡는 중'],want:['손으로 뭔가 만들고 싶은 모양'],feel:['만들던 것의 다음 단계를 떠올리는 듯함'],habit:['손이 심심한지 자꾸 무언가를 만지작거리는 중']},
 photo:{act:['앵글을 잡으며 셔터 소리를 내는 중','찍은 사진을 하나씩 넘겨 보는 중'],want:['찍어 두고 싶은 장면을 찾는 모양'],feel:['찍어 둔 사진이 떠오른 듯 미소를 지음'],habit:['눈에 띄는 장면마다 손으로 네모를 만들어 보는 중']},
 fish:{act:['낚싯대를 손질하며 채비를 살피는 중'],want:['물가에 앉아 있고 싶은 모양'],feel:['찌가 움직이던 순간을 떠올리는 듯함'],habit:['날씨가 좋으면 낚시 도구 쪽을 힐끗 보는 중']},
 sky:{act:['턱을 괴고 한참 올려다보는 중'],want:['탁 트인 곳에서 올려다보고 싶은 모양'],feel:['넋을 놓고 올려다보다 문득 숨을 내쉼'],habit:['틈만 나면 창밖을 올려다보는 중']}};
/* ===== 4단계 파이프라인 =====
   ① extract: 프로필 분석 결과(bits) → 의미 단위(좋아함·싫어함·관계)   ② plan: 의미 단위 → 구조화된 행동 {의도, 분류, 목적어·서술어, 형태} (문장 아님)
   ③ realize: 구조화된 행동 → 조사·활용을 거친 한국어 문장                  ④ verify: 호응·형식 검사(걸리면 버림) */
const extract=bits=>{const u=[];for(const w of (bits&&bits.likes||[]).slice(0,4))u.push({t:'like',r:parse(w)});for(const w of (bits&&bits.dislikes)||[])u.push({t:'dis',r:parse(w)});for(const x of (bits&&bits.rels)||[])u.push({t:'rel',x});return u};
const VB=r=>r.hada?r.obj+'하다':r.stem+'다';
function plan(u){const o=[];
  if(u.t==='rel'){o.push({i:'feel',f:'rel1',x:u.x},{i:'feel',f:'rel2',x:u.x});return o}
  const r=u.r,cf=F[r.cat];
  if(u.t==='dis'){o.push({i:'dis',r});return o}
  if(cf)for(const k in cf)for(const lit of cf[k])o.push({i:k,lit});                      // 분류별 문장 틀(관용적 표현)
  if(r.kind==='v'){if(!cf)o.push({i:'act',r,f:'prog'});o.push({i:'want',r,f:'desire'},{i:'feel',r,f:'fut1'},{i:'feel',r,f:'fut2'},{i:'habit',r,f:'habit'})}   // 활용으로 만드는 일반 틀
  else{if(!cf)o.push({i:'act',r,f:'enjoy'});o.push({i:'want',r,f:'n_want'},{i:'feel',r,f:'n_feel1'},{i:'feel',r,f:'n_feel2'},{i:'habit',r,f:'n_habit'})}
  return o}
function realize(a){if(a.lit)return a.lit;const r=a.r,x=a.x;
  if(a.f==='rel1')return j(x.n,'i')+' 문득 보고 싶어진 듯함';if(a.f==='rel2')return x.n+'의 안부가 궁금한 얼굴';
  if(a.i==='dis'){if(r.kind==='v'){const O=r.hada||!r.obj?'':r.intr?r.obj+' ':j(r.obj,'eul')+' ';return O+conj(VB(r),'fut')+' 생각만 해도 인상을 살짝 찌푸림'}return j(r.noun,'i')+' 문득 떠올랐는지 인상을 살짝 찌푸림'}
  if(r.kind==='n')return {enjoy:j(r.noun,'eul')+' 즐기는 중',n_want:r.noun+' 생각이 간절한 듯함',n_feel1:j(r.noun,'eul')+' 떠올리며 슬며시 미소를 지음',n_feel2:r.noun+' 이야기가 나오면 눈이 반짝일 것 같은 얼굴',n_habit:'자꾸 '+r.noun+' 생각이 나는 듯함'}[a.f];
  const O=r.hada||!r.obj?'':r.intr?r.obj+' ':j(r.obj,'eul')+' ',Oi=r.hada||!r.obj?'':r.intr?r.obj+' ':j(r.obj,'i')+' ',v=VB(r);
  return {prog:O+conj(v,'pres')+' 중',desire:Oi+conj(v,'seq')+' 싶은 모양',fut1:O+conj(v,'fut')+' 생각에 들뜬 얼굴',fut2:conj(v,'fut')+' 시간을 손꼽아 기다리는 듯함',habit:'틈만 나면 '+O+conj(v,'seq')+' 싶어지는 듯함'}[a.f]}
const verify=t=>{if(!t)return null;t=fix(t);return ok(t)?t:null};
/* 전체 실행: bits → [{i:의도, w:뜻 단위, text}] */
const gen=bits=>{const o=[];for(const u of extract(bits))for(const a of plan(u)){const text=verify(realize(a));if(text)o.push({i:a.i,t:u.t,text})}return o};
const likeCache={};
const like=raw=>likeCache[raw]||(likeCache[raw]=(()=>{const o={act:[],want:[],feel:[],habit:[]};for(const g of gen({likes:[raw]}))o[g.i].push(g.text);return o})());
const dislike=raw=>{const g=gen({dislikes:[raw]})[0];return g?g.text:''};
/* ---------- ⑤ 최종 검사 ---------- */
const BAD=[/[가-힣]+기[을를] ?(마시|바라보|쳐다보|먹|펼치|넘기|들이켜)/,/(독서|산책|운동|요리|게임|그림|음악)[을를] ?(마시|들이켜|먹)/,/(술|커피|차|물)[을를] ?(읽|펼치|넘기|듣|그리)/,/(책|소설|만화)[을를] ?(마시|먹|들이켜)/,/을\(를\)|이\(가\)|은\(는\)|와\(과\)|\{[^}]*\}|undefined|null|NaN/,/([가-힣]{2,}) \1 \1/];
const ok=t=>!BAD.some(re=>re.test(String(t)));
const fix=t=>fill(String(t)).replace(/\s+,/g,',').replace(/,\s*,/g,',').replace(/ {2,}/g,' ').replace(/([가-힣]{2,}[을를]) \1/g,'$1').trim();
/* 종결 유형(같은 캐릭터의 지문이 같은 꼴로 이어지지 않게 비교용) */
const endKind=t=>{t=String(t).replace(/[\s.!]+$/,'');return /는 중(이에요)?$/.test(t)?'중':/(모양|듯함|듯한 .*)$/.test(t)?'모양':/채 .*$/.test(t)?'채':/상태$/.test(t)?'상태':/참$/.test(t)?'참':'기타'};
/* '~는 중' 이 이어질 때 같은 뜻의 '~고 있음' 으로 바꿔 어미 반복을 줄인다(어간을 확실히 알 수 있을 때만) */
const vary=t=>String(t).replace(/([가-힣]+)는 중$/,(m,s)=>s==='있'||(s.length===1&&tail(s)===0)?m:restore(s)+'고 있음');   // 받침 없는 한 글자 어간(조는·떠는·사는)은 ㄹ 탈락 여부가 모호해 그대로 둔다
G.Ko={extract,plan,realize,verify,gen,jong:tail,j,josa:j,fill,conj,parse,canon,like,dislike,catOf,ok,fix,endKind,vary,cls};
if(typeof module!=='undefined')module.exports=G.Ko;
})(typeof window!=='undefined'?window:globalThis);
