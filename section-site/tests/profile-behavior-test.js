/* 프로필 읽기·2층 침대·음식 다양화 시험 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim'].forEach(f=>require(P+f+'.js'));
const F=require(__dirname+'/../../section-server/tests/fixture-geo.js');const Sim=globalThis.Sim;let fail=0;const ok=(n,c)=>{console.log((c?'ok ':'FAIL ')+n);if(!c)fail++};
const an=(p,n,o)=>Sim.analyze(p,n||'테스트',o||[]);
/* 1) 무서워함/싫어함/안 좋아함 */
let A=an('고양이를 무서워한다. 벌레는 싫어한다. 시끄러운 곳을 안 좋아한다.');
ok('무서워함 → dislikes+fears에 고양이',A.bits.dislikes.some(w=>/고양이/.test(w))&&A.bits.fears.some(w=>/고양이/.test(w)));
ok('싫어함 → 벌레(공포 아님)',A.bits.dislikes.some(w=>/벌레/.test(w))&&!A.bits.fears.some(w=>/벌레/.test(w)));
ok('안 좋아함 → 시끄러운 곳',A.bits.dislikes.some(w=>/시끄러/.test(w)));
ok('무서워하는 것은 좋아하는 것·취미로 읽지 않음',!A.likes.some(w=>/고양이|벌레/.test(w)));
/* 2) 친구 없음 → 지인 */
for(const t of ['친구가 없다.','교우관계가 좁다.','교우관계가 원만하지 않다.','친구가 거의 없는 편이다.'])ok('noFriend: '+t,an(t).facts.noFriend===true);
ok('친구 많음은 noFriend 아님',an('친구가 많고 활발하다.').facts.noFriend!==true);
/* 3) 사람이름·종족·음식은 취미 아님 */
const B=an('민수를 좋아한다. 고양이를 좋아한다. 치킨을 좋아한다. 그림 그리기를 좋아한다.','하나',[{name:'민수',profile:''}]);
const pool=Sim._hobbyPool?Sim._hobbyPool(B):[...(B.likes||[]),...(B.hobbyWords||[])].filter(w=>!Sim._notHobby(w,B.nhNames));
ok('취미 후보에 사람이름(민수) 없음',!pool.includes('민수'));
ok('취미 후보에 고양이 없음',!pool.some(w=>/^고양이/.test(w)));
ok('취미 후보에 치킨 없음',!pool.includes('치킨'));
ok('그림은 취미로 남음',pool.some(w=>/그림/.test(w)));
ok('좋아하는 것(표시용)은 남음',B.likes.length>0);
/* 4) 국적 짐작 + 음식 다양성 */
ok('유키 → JP',an('', '유키').nation==='JP');ok('마르코 → IT',an('','마르코').nation==='IT');ok('한글 이름 → KR',an('','김서연').nation==='KR');ok('Emily → US',an('','Emily').nation==='US');
const rngf=(()=>{let a=7;return()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296}})();
const seen=new Set();for(let i=0;i<300;i++)seen.add(Sim._foodPhrase('meal',an('', '마르코'),rngf).replace(/(을|를) .*/,''));
ok('음식 종류 10가지 이상',seen.size>=10);
ok('이탈리아 이름은 이탈리아 음식 포함',[...seen].some(w=>/라자냐|리조또|카르보나라|뇨끼|브루스케타|마르게리타/.test(w)));
const seenK=new Set();for(let i=0;i<300;i++)seenK.add(Sim._foodPhrase('snack',an('','김서연'),rngf).replace(/(을|를) .*/,''));
ok('보편 간식(도넛·쿠키 등)과 한국 간식 모두',[...seenK].some(w=>/도넛|쿠키|토스트|베이글/.test(w))&&[...seenK].some(w=>/호떡|약과|붕어빵|떡|누룽지|보리차|유자차|식혜|믹스커피/.test(w)));
const dis=an('오이를 싫어한다. 커피를 안 좋아한다.');let bad=false;for(let i=0;i<300;i++){const t=Sim._foodPhrase('snack',dis,rngf)+Sim._foodPhrase('meal',dis,rngf);if(/오이|커피/.test(t))bad=true}
ok('싫어하는 음식은 먹는 지문에 안 나옴',!bad);
/* 5) 2층 침대 */
const g=F.geo();const gg=JSON.parse(JSON.stringify(g));const r0=(gg.rooms&&gg.rooms[0])||{};const bx=((r0.left||0)+(r0.right||0))/2||g.in0+200;
gg.items=(gg.items||[]).concat([{uid:'bk1',aid:'modern-bunk-bed',assetId:'modern-bunk-bed',x:bx,e:0,w:100,h:170,f:r0.f||0,name:'모던 2층 침대',nameKo:'모던 2층 침대',en:'Modern Bunk Bed',cat:'furniture',sub:'bed',tags:['침대','bunk','bed']}]);
const W=Sim.buildWorld(gg);const lo=W.items.find(i=>i.uid==='bk1'),up=W.items.find(i=>i.uid==='bk1~up');
ok('2층 침대 → 침대 자리 2개(아래·위)',!!lo&&!!up&&lo.kinds.includes('bed')&&up.kinds.includes('bed'));
const sl=Sim._spotFor(W,lo,'lie',()=>.5,0),su=Sim._spotFor(W,up,'lie',()=>.5,0);
ok('위층 누운 높이가 아래층보다 70cm 이상 높음',su.dy-sl.dy>=70);
ok('각 자리는 한 명씩(capacity 1)',Sim._capacity(lo,false)===1&&Sim._capacity(up,false)===1);
ok('일반 침대는 자리가 1개',!(()=>{const g2=JSON.parse(JSON.stringify(g));g2.items=(g2.items||[]).concat([{uid:'b2',aid:'bed',x:bx,e:0,w:100,h:60,f:r0.f||0,name:'침대',en:'bed',cat:'furniture',sub:'bed',tags:['침대']}]);return Sim.buildWorld(g2).items.some(i=>/~up$/.test(i.uid))})());
/* 6) 프로필에 적힌 국적 */
ok('프로필 "프랑스 출신" → FR(한글 이름이어도)',an('프랑스 출신이다.','김서연').nation==='FR');
ok('프로필 "국적은 일본" → JP',an('국적은 일본이다.','철수').nation==='JP');
ok('프로필 "베트남에서 왔다" 아님/"베트남에서 태어났다" → VN',an('베트남에서 태어났다.','민지').nation==='VN');
ok('"일본 여행을 좋아함"은 국적 아님',an('일본 여행을 좋아한다.','철수').nation==='KR');
{const A=an('이탈리아계 미국인이다.','Tom');const sn=new Set();for(let i=0;i<300;i++)sn.add(Sim._foodPhrase('meal',A,rngf));ok('프로필 국적 음식이 섞임(이탈리아)',[...sn].some(t=>/라자냐|리조또|카르보나라|뇨끼|브루스케타|마르게리타/.test(t)))}
/* 7) 음악·서적 취향 */
const cnt=(f,n)=>{const m={};for(let i=0;i<n;i++){const t=f();m[t]=(m[t]||0)+1}return m};
const share=(A,re,n)=>{let h=0;for(let i=0;i<n;i++)if(re.test(Sim._musicPhrase(A,rngf)))h++;return h/n};
const shareB=(A,re,n)=>{let h=0;for(let i=0;i<n;i++)if(re.test(Sim._bookPhrase(A,rngf)))h++;return h/n};
const sw=an('싱어송라이터이고 기타를 친다. 홍대에서 버스킹을 한다.','다온');const vl=an('바이올린 연주가이다.','하진');const nrm=an('평범한 회사원이다.','지후');
ok('싱어송라이터 → 인디/어쿠스틱 음악 비중이 높음',share(sw,/인디|어쿠스틱|포크/,600)>.4);
ok('바이올린 연주가 → 클래식 비중이 높음',share(vl,/클래식|교향곡/,600)>.4);
ok('일반인은 가요·팝 위주로 다양(클래식 40% 미만)',share(nrm,/클래식|교향곡/,600)<.4);
const gk=Sim.kindsOf({name:'어쿠스틱 기타',sub:'music-instrument',cat:'furniture'});
const ip=(A,kinds)=>{const m=new Set();for(let i=0;i<200;i++)m.add(Sim._instrPhrase(A,kinds,rngf));return [...m]};
ok('기타리스트: 기타 에셋이면 기타 연주 지문',ip(sw,['guitar']).every(t=>/기타/.test(t)));
ok('바이올린 에셋이면 바이올린 지문',ip(vl,['violin']).every(t=>/바이올린/.test(t)));
ok('바이올린 연주가: 바이올린 클래식 지문 포함',ip(vl,['violin']).some(t=>/클래식/.test(t)));
ok('기타리스트 지문에 인디/자작곡 포함',ip(sw,['guitar']).some(t=>/인디|직접 쓴|통기타/.test(t)));
const dt=an('추리소설을 즐겨 읽는다. 시집도 좋아한다.','서진'),sc=an('물리학 연구원이다.','민재'),gm=an('요리와 미식을 좋아한다. 맛집 탐방이 취미다.','소율'),hr=an('공포 소설을 좋아한다.','태오'),nohr=an('호러를 무서워한다. 책을 좋아한다.','가온');
ok('추리 애독자 → 추리소설 비중 높음',shareB(dt,/추리|미스터리/,600)>.25);
ok('연구원 → 과학 전문서적 비중 높음',shareB(sc,/과학|전문서적/,600)>.3);
ok('미식 취향 → 미식 소설 포함',shareB(gm,/미식|요리가 나오는/,600)>.15);
ok('공포 소설 애독자 → 호러 포함',shareB(hr,/호러|공포/,600)>.2);
ok('호러를 무서워하면 호러/공포 책은 안 나옴',shareB(nohr,/호러|공포/,600)===0);
const books=new Set();for(let i=0;i<800;i++)books.add(Sim._bookPhrase(an('책을 좋아한다.','나나'),rngf));
ok('서적 지문 종류 15가지 이상(소설·에세이·시집·인문·과학·고전 등)',books.size>=15);
const allT=[].concat(...Object.values(Sim._MUS_TXT),...Object.values(Sim._BOOK_TXT),...Object.values(Sim._INS_TXT).flatMap(o=>Object.values(o).flat()));
ok('모든 신규 문구가 한국어 검사 통과',allT.every(t=>globalThis.Ko?globalThis.Ko.ok('거실에서 '+t):true));
/* 8) 회귀: 행동 지정이 실제로 idle 이 아닌 행동을 만든다(전역 함수 이름 충돌 방지) */
{['viv-mind','viv-social','viv-chain','viv-aware','viv-decide','viv-love','viv-romfx','viv-uncanny','viv-engine'].forEach(f=>require(P+f+'.js'));
 const W2=Sim.buildWorld(F.geo()),ch0=F.chars()[0],pl={mode:'home',house:'h1',f:0,x:W2.mid},sm={};
 const cx={world:W2,houseId:'h1',chars:[{id:ch0.id,name:ch0.name,profile:ch0.profile}],now:Date.UTC(2026,9,23,5,0,0),analysis:c=>Sim.analyze(c.profile,c.name,[]),getPlace:()=>pl,setPlace:(id,o)=>Object.assign(pl,o),getSim:()=>sm,setSim:(id,o)=>Object.assign(sm,o),neighbors:[],unc:null};
 let non=0;for(const id of ['rest','eat','read','hobby','tv']){pl.mode='home';pl.x=W2.mid;Object.keys(sm).forEach(k=>delete sm[k]);Sim.setWish(cx,cx.chars[0],id);Sim.stepHouse(cx);if(pl.verb&&pl.verb!=='idle')non++}
 ok('행동 지정 5종 중 4종 이상이 idle 이 아닌 행동으로 이어짐',non>=4)}
console.log(fail?'FAIL':'ALL PASS');process.exit(fail?1:0)
