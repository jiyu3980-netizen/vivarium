/* 비바리움 관찰 v23 — 위화감(드림코어·리미널 스페이스) 심리 시스템
   - 도면(S)·캐릭터 프로필(viv.chars.v1)·위치/행동(viv.place.v1, viv.sim.v1)·감정/관계(viv.mind.v1)와 완전히 분리된 별도 저장소(viv.unc.v1)만 쓴다.
     이 저장소를 지워도 캐릭터·도면·관계 데이터는 그대로다 (캐릭터 '존재 오류'도 이 저장소의 표시 상태일 뿐, 원본 데이터는 건드리지 않는다).
   - 확률·가중치·단계 기준값은 전부 아래 UNCANNY 설정 한 곳에서만 정한다.
   - 체류 기간 / 심리적 부담 / 존재 안정성은 서로 다른 값으로 관리한다.
       체류 기간  : 캐릭터가 집에 처음 배치된 날(서울 날짜)부터 센 날짜. 위화감 행동이 일어날 가능성과 이상 현상의 종류를 점진적으로 높인다.
       심리적 부담: 경험한 위화감·현재 감정·성격에 따라 오르내림(쉬면 줄어듦). 위화감을 겪어도 반드시 오르지 않는다(호기심·무관심 등).
       존재 안정성: 안정 → 위화감 → 불안정 → 손상 → 미확인(404). 체류 기간만으로는 결정되지 않고 부담·성격·누적 경험을 함께 본다.
   - 순수 계산 모듈: 화면(DOM)을 직접 만지지 않는다. 화면 연출은 update()가 돌려주는 fx 목록을 viv.js 가 그린다.
   브라우저와 node(테스트) 양쪽에서 동작한다. */
(function(root){
'use strict';
const MIN=60000,HOUR=3600000,DAY=86400000;

/* =====================================================================
   중앙 설정 — 수치는 여기서만 조절
   ===================================================================== */
const UNCANNY={
  /* 의사결정 한 번에서 '위화감 행동'이 선택될 몫(0~1). 체류 일수(날) → 몫. 첫날에는 일상과 비슷한 빈도(≈.42), 이후 서서히 증가 */
  share:{curve:[[0,.30],[2,.32],[5,.36],[10,.44],[20,.58],[40,.70]],burdenGain:.15,max:.78,min:.05,
    night:{from:0,to:6,mul:.3},          // 새벽에는 잠이 우선이라 위화감 행동이 드묾
    streakMul:[1,.55,.3,.15]},           // 위화감 행동이 연속으로 이어질수록 다음 몫이 줄어듦(0·1·2·3회 연속)
  /* 진행도 P = 체류 일수 × 개인 속도 + 부담 환산 일수. 단계(tier)별 등장 기준 */
  pace:{min:.75,max:1.3,jitterDays:3,burdenDays:.07},
  tiers:{                                 // atP: 이 진행도부터 등장 / needB: 필요한 최소 심리적 부담 / sev: 기본 부담 증가량
    1:{atP:0,needB:0,sev:.15},2:{atP:2.5,needB:0,sev:.3},3:{atP:6,needB:12,sev:.6},4:{atP:12,needB:35,sev:.9}},
  tierRamp:5,                             // 등장한 단계의 가중치가 1이 되기까지 걸리는 진행도 폭
  tier1Fade:14,                           // 가벼운 위화감의 비중이 반으로 줄어드는 진행도
  /* 성격별 반응 → 부담 증가 배율 (기존 프로필의 성격 키워드·감정만 사용) */
  react:{curious:{sens:.3,decay:1.3},anxious:{sens:1.8,decay:.85},rational:{sens:.85,decay:1},avoidant:{sens:.75,decay:1.1},resigned:{sens:1,decay:.9}},
  burden:{decayPerHour:.05,decayProp:.02,calmMul:1.25,sleepBonus:.3,max:100,   // 회복 = (상수 + 현재 부담에 비례) × 평온할 때 배율 → 부담이 한없이 오르지 않고 성격·체류에 따라 서로 다른 수준에서 균형을 이룸

    emoGain:.5,                           // 불안·외로움 감정이 높을 때 위화감이 더 크게 느껴지는 정도
    calmEmo:40},                          // 평온·행복이 이 수치 이상이면 회복이 빨라짐
  /* 존재 안정성 판정: 점수 = 부담×.62 + 체류 가산(최대 15) + 누적 경험(최대 15). 각 단계는 최소 부담도 함께 요구 */
  state:[['uneasy',22,10],['unstable',45,28],['damaged',68,52]],hyst:6,
  /* 404 / NOT FOUND */
  missing:{minDays:8,minBurden:72,hazardPerHour:.006,scaleBurden:30,cooldownDays:4,
    vanishMs:[1800,2800],                // 글리치가 시작된 뒤 완전히 사라지기까지
    durMs:[45*MIN,5*HOUR],               // 사라져 있는 시간(실제 시간). 이후 자동 복구
    returnBurdenKeep:.5,                 // 복귀 후 부담이 남는 비율
    retCooldownAfterTick:true},
  /* 같은 위화감이 반복되지 않게 */
  repeat:{kindCooldown:{1:25*MIN,2:40*MIN,3:70*MIN,4:2*HOUR},seenDamp:.18,recentN:6,recentMul:.12,anyGap:5*MIN},
  /* 화면 연출(fx) */
  fx:{tickBlip:{unstable:.07,damaged:.22},     // 1분 틱마다 이미지 글리치가 잠깐 생길 확률
    gap:{sky:35*MIN,clock:3*HOUR,shift:90*MIN,misread:2*HOUR,stare:25*MIN,noise:60*MIN},
    stareAfterSec:75,misreadAfterSec:50,
    p:{sky:.5,clock:.012,shift:.012,misread:.05,stare:.35}},
  aw:{base:{rational:3,anxious:3,curious:2,resigned:2,avoidant:1},tyDamp:.35,tyN:3},  // 자기인식 단계 상한(성격별+개인차)·최근 같은 유형 반복 감쇠
  talk:{gap:75*MIN,recentN:10},          // 관찰자에게 말을 거는 대사: 같은 캐릭터가 이 간격 안에는 다시 하지 않음 / 최근 N개 문구는 반복하지 않음
  out:{p:.16,gap:75*MIN,burdenMul:.5},    // 외출 중 공간 위화감 지문: 30분 점검마다 나올 확률(첫날 기준 몫으로 환산)·최소 간격
  watch:{reset:true}
};

/* =====================================================================
   위화감 행동(= sim.js 의 'unc' 그룹 행동). 문구는 성격에 따른 반응별로 나뉜다.
   kind: win=창가 / stand=제자리 / prev=방금 있던 방 / exit=현관 쪽 / alone=사람이 없는 방 / items=가구 앞 / near=옆 사람 / rep=직전 행동 반복
   ===================================================================== */
const EVENTS={
  u_sky:{ty:5,aw:1,tier:1,kind:'win',dur:[4,10],w:1.2,fx:'sky',txt:{
    any:['{r}에서 이유 없이 창밖의 하늘을 올려다보는 중','{r}에서 창가에 서서 하늘을 가만히 보는 중'],
    curious:['{r}에서 하늘을 올려다보며 뭔가를 찾는 중','{r}에서 하늘 한 곳에 시선을 고정한 채 눈을 가늘게 뜨는 중'],
    anxious:['{r}에서 창밖을 보다가 커튼 끝을 만지작거리는 중','{r}에서 하늘을 올려다보며 숨을 고르는 중'],
    rational:['{r}에서 하늘을 보며 손가락으로 날짜를 세어 보는 중','{r}에서 하늘을 보며 고개를 한 번 끄덕이는 중'],
    avoidant:['{r}에서 창밖을 잠깐 보다 고개를 돌리는 중','{r}에서 하늘을 한 번 보고 못 본 척하는 중'],
    resigned:['{r}에서 변함없는 하늘을 멍하니 바라보는 중','{r}에서 창밖을 보며 작게 한숨 쉬는 중']}},
  u_glance:{ty:1,aw:1,tier:1,kind:'stand',dur:[2,5],w:1.3,txt:{
    any:['{r}에서 하던 일을 멈추고 주변을 슬쩍 둘러보는 중','{r}에서 누가 부른 것처럼 뒤를 돌아보는 중'],
    curious:['{r}에서 방 안 구석구석을 눈여겨보는 중'],
    anxious:['{r}에서 인기척을 느낀 듯 주변을 살피는 중'],
    rational:['{r}에서 바람 소리겠거니 하며 주변을 확인하는 중'],
    avoidant:['{r}에서 둘러보다가 아무 일 없던 척 일상으로 돌아가는 중'],
    resigned:['{r}에서 아무도 없는 걸 알면서도 한 번 둘러보는 중']}},
  u_recheck:{ty:4,aw:1,tier:1,kind:'prev',dur:[2,6],w:.9,txt:{
    any:['{r}에 다시 와서 아까와 똑같은지 확인하는 중','방금 지나온 {r}에 다시 들러 보는 중'],
    curious:['{r}을 다시 찾아와 달라진 곳이 없는지 살피는 중'],
    anxious:['{r}이 그대로인지 몇 번이고 다시 확인하는 중'],
    rational:['{r}에 두고 온 게 없는지 확인하러 온 중'],
    avoidant:['{r}에 괜히 한 번 더 와 보고는 아무 일 없는 척하는 중'],
    resigned:['{r}에 다시 와서 멍하니 서 있는 중']}},
  u_uneasy:{ty:1,aw:1,tier:1,kind:'stand',dur:[3,8],w:.8,txt:{
    any:['{r}의 한쪽 구석을 바라보다 반 걸음 물러서는 중'],
    curious:['{r}의 벽 한쪽을 한참 들여다보는 중'],
    anxious:['{r}의 한 곳을 보다 시선을 돌리기를 되풀이하는 중'],
    rational:['{r}의 한쪽을 보다 고개를 갸웃하는 중'],
    avoidant:['{r}의 한쪽을 일부러 보지 않으려는 중'],
    resigned:['{r}의 구석을 말없이 바라보는 중']}},
  u_sky_long:{ty:5,aw:2,tier:2,kind:'win',dur:[12,30],w:1,fx:'sky',txt:{
    any:['{r}에서 구름 한 점 없는 하늘을 오랫동안 바라보는 중','{r}에서 같은 자리에 서서 창밖만 한참 보는 중'],
    curious:['{r}에서 하늘이 변하는 순간을 기다리며 계속 지켜보는 중'],
    anxious:['{r}에서 창밖을 보며 손목시계를 자꾸 들여다보는 중'],
    rational:['{r}에서 하늘 색을 손으로 가리며 비교해 보는 중'],
    avoidant:['{r}에서 창밖을 보다 말고 커튼 쪽만 만지작거리는 중'],
    resigned:['{r}에서 변하지 않는 하늘을 말없이 보다 하품하는 중']}},
  u_loop:{ty:2,aw:2,tier:2,kind:'prev',dur:[3,8],w:.9,txt:{
    any:['{r}과(와) 방금 있던 곳을 같은 길로 반복해서 오가는 중','{r}에 또 와서 같은 자리를 서성이는 중'],
    curious:['{r}을 몇 번이고 오가며 뭔가 다른 점을 찾는 중'],
    anxious:['{r}에서 아까와 같은 곳을 또 지나온 건 아닌지 되짚어 보는 중'],
    rational:['{r}과(와) 이어진 길을 확인하며 다시 걸어 보는 중'],
    avoidant:['{r}을 오가면서도 발끝만 내려다보는 중'],
    resigned:['{r}을 이유 없이 또 오가는 중']}},
  u_turn:{ty:2,aw:2,tier:2,kind:'exit',dur:[3,8],w:.8,txt:{
    any:['{r}에서 문 앞까지 와서 선뜻 나가지 못하고 서 있는 중','{r}에서 현관 쪽으로 가다 말고 발길을 돌리는 중'],
    curious:['{r}에서 문 너머가 궁금한 듯 한참을 서 있는 중'],
    anxious:['{r}에서 문 앞에 서서 나가야 할지 망설이는 중'],
    rational:['{r}에서 나갈 일이 있었는지 곰곰이 떠올려 보는 중'],
    avoidant:['{r}에서 나가려다 그냥 돌아서려는 중'],
    resigned:['{r}에서 문을 한참 바라보다 손을 내리는 중']}},
  u_object:{ty:4,aw:1,tier:2,kind:'items',k:['desk','bookshelf','dining','fridge','sofa','chair','tv','bed'],dur:[4,10],w:.9,txt:{
    any:['{r}에서 같은 물건을 몇 번이고 다시 확인하는 중','{r}에서 방금 본 물건을 또 들여다보는 중'],
    curious:['{r}에서 물건 하나를 이리저리 살펴보는 중'],
    anxious:['{r}에서 물건이 제자리에 있는지 거듭 확인하는 중'],
    rational:['{r}에서 물건이 있던 자리를 손으로 짚어 가며 기억과 맞춰 보는 중'],
    avoidant:['{r}에서 물건을 만져 보고는 손을 얼른 거두는 중'],
    resigned:['{r}에서 늘 있던 물건을 말없이 만져 보는 중']}},
  u_observe:{ty:5,aw:2,tier:2,kind:'stand',dur:[6,14],w:.9,txt:{
    any:['{r}의 벽과 천장을 천천히 살피는 중'],
    curious:['{r}의 이음새와 모서리를 하나하나 살피는 중'],
    anxious:['{r}의 벽과 천장을 번갈아 보며 숨을 길게 내쉬는 중'],
    rational:['{r}의 구조를 걸음 수로 재어 보는 중'],
    avoidant:['{r}을 살피다 이내 시선을 거두는 중'],
    resigned:['{r}의 천장을 올려다보며 가만히 서 있는 중']}},
  u_freeze:{ty:3,aw:2,tier:3,kind:'stand',dur:[3,8],w:1,txt:{
    any:['{r}에서 하던 일을 갑자기 멈추고 가만히 서 있는 중'],
    curious:['{r}에서 무언가를 알아차린 듯 움직임을 멈춘 중'],
    anxious:['{r}에서 숨을 죽인 채 굳어 있는 중'],
    rational:['{r}에서 손을 든 채 멈춰 서서 허공을 보는 중'],
    avoidant:['{r}에서 멈춰 섰다가 곧바로 아무렇지 않은 척하려는 중'],
    resigned:['{r}에서 손을 놓은 채 한동안 멍하니 서 있는 중']}},
  u_exitfind:{ty:5,aw:3,tier:3,kind:'win',dur:[5,12],w:.8,txt:{
    any:['{r}에서 창과 현관을 번갈아 보며 나갈 길을 찾는 듯한 중'],
    curious:['{r}에서 창틀과 문틈을 살피며 바깥으로 이어진 곳을 찾는 중'],
    anxious:['{r}에서 창밖과 문을 번갈아 보며 손톱을 만지작거리는 중'],
    rational:['{r}에서 나갈 수 있는 경로를 하나씩 따져 보는 중'],
    avoidant:['{r}에서 창 쪽으로 가다 말고 책상 위를 정리하는 중'],
    resigned:['{r}에서 나갈 길이 없다는 걸 확인하듯 창을 만져 보는 중']}},
  u_avoid:{ty:7,aw:3,tier:3,kind:'alone',dur:[5,12],w:.8,txt:{
    any:['{r} 쪽으로 조용히 자리를 옮기는 중'],
    curious:['{r} 쪽에서 혼자 벽을 보고 앉아 있는 중'],
    anxious:['{r} 쪽으로 사람을 피해 몸을 숨기듯 이동하는 중'],
    rational:['{r} 쪽에서 혼자 손가락으로 무언가를 세어 보는 중'],
    avoidant:['{r} 쪽으로 다른 사람을 피해 슬쩍 자리를 옮기는 중'],
    resigned:['{r} 쪽에서 아무와도 말하지 않고 앉아 있는 중']}},
  u_doubt:{ty:6,aw:3,tier:3,kind:'near',dur:[3,8],w:.7,txt:{
    any:['{p}을(를) 낯선 사람처럼 바라보는 중'],
    curious:['{p}의 얼굴을 유심히 뜯어보는 중'],
    anxious:['{p}의 얼굴을 보다 한 걸음 물러서는 중'],
    rational:['{p}이 한 말을 입속으로 따라 해 보는 중'],
    avoidant:['{p}의 시선을 피하며 말을 아끼는 중'],
    resigned:['{p}을(를) 바라보다 아무 말도 하지 않는 중']}},
  u_repeat:{ty:2,aw:2,tier:3,kind:'rep',dur:[5,15],w:.9,txt:{
    any:['방금 끝낸 일을 처음 하는 것처럼 다시 하는 중'],
    curious:['방금 한 일을 다시 해 보며 고개를 갸웃하는 중'],
    anxious:['이미 끝낸 일을 처음부터 다시 하며 손으로 짚어 보는 중'],
    rational:['이미 한 일인 걸 알면서도 확인 삼아 다시 하는 중'],
    avoidant:['이미 한 일을 다시 하며 콧노래를 흥얼거리는 중'],
    resigned:['이미 한 일을 또 하며 어깨를 으쓱하는 중']}},
  u_stare:{ty:7,aw:3,tier:4,kind:'stand',dur:[2,6],w:.8,watch:true,txt:{
    any:['정면을 가만히 응시하다 눈을 맞추려는 듯 고개를 드는 중'],
    curious:['정면을 응시하며 고개를 천천히 기울이는 중'],
    anxious:['정면의 한 점을 불안하게 응시하는 중'],
    rational:['아무것도 없는 정면을 보다 눈을 비비는 중'],
    avoidant:['정면을 보다가 시선을 피하는 중'],
    resigned:['정면을 오래 바라보다 고개를 끄덕이는 중']}},
  u_still:{ty:3,aw:3,tier:4,kind:'stand',dur:[6,14],w:.7,txt:{
    any:['움직임을 멈추고 한참 같은 자세로 굳어 있는 중'],
    curious:['같은 자세로 가만히 서서 무언가를 듣는 듯한 중'],
    anxious:['몸을 움직이지 못한 채 숨만 쉬는 중'],
    rational:['움직이지 않고 입술만 달싹이는 중'],
    avoidant:['멈춘 채로 시선만 이리저리 굴리는 중'],
    resigned:['손을 늘어뜨린 채 가만히 서 있는 중']}},
  /* ---- v23.3 인공적인 생활공간을 암시하는 행동지문(집 안) — 기존 가구(TV·책장·창·벽)만 사용 ---- */
  u_set_tv1:{ty:5,aw:1,tier:1,kind:'items',k:['tv'],dur:[4,10],w:.9,txt:{
    any:['꺼진 TV 화면을 보며 멍하니 앉아 있는 중','TV 앞에서 채널을 돌리며 같은 화면을 보는 중'],
    curious:['꺼진 TV 화면에 비친 방 안을 들여다보는 중'],
    resigned:['꺼진 TV 화면을 말없이 바라보는 중']}},
  u_set_tv2:{ty:5,aw:2,tier:2,kind:'items',k:['tv'],dur:[5,12],w:.8,txt:{
    any:['리모컨을 눌러도 같은 화면만 반복되는 중','채널을 돌려도 똑같은 장면만 나오는 TV를 보는 중'],
    rational:['리모컨을 눌러 보며 화면이 바뀌지 않는 이유를 따지는 중'],
    avoidant:['리모컨을 누르다 말고 화면에서 눈을 돌리는 중']}},
  u_set_tv3:{ty:5,aw:3,tier:3,kind:'items',k:['tv'],dur:[5,12],w:.7,txt:{
    any:['노이즈만 지직이는 TV 화면을 보며 웃는 중','지직거리는 TV 화면에 손을 대어 보는 중'],
    anxious:['노이즈만 지직이는 TV 화면에서 눈을 떼지 못하는 중'],
    resigned:['노이즈만 지직이는 TV 화면을 보며 웃는 중']}},
  u_set_win1:{ty:5,aw:1,tier:1,kind:'win',dur:[4,10],w:.9,txt:{
    any:['창밖의 풍경이 바뀌기를 기다리는 중','창밖 풍경이 어제와 같은지 말없이 보는 중'],
    curious:['창밖 풍경의 끝이 어디인지 눈으로 따라가는 중']}},
  u_set_win2:{ty:5,aw:2,tier:2,kind:'win',dur:[6,14],w:.8,txt:{
    any:['움직이지 않는 구름을 올려다보는 중','창밖 구름이 제자리에 있는지 확인하는 중'],
    rational:['구름이 흘러가는 방향을 재 보려는 중']}},
  u_set_win3:{ty:5,aw:3,tier:3,kind:'win',dur:[6,14],w:.7,txt:{
    any:['창유리 너머의 평평한 풍경을 손끝으로 두드려 보는 중','창밖 풍경의 가장자리를 눈으로 더듬는 중'],
    curious:['창문 너머 풍경의 끝을 찾으려 얼굴을 바싹 대는 중']}},
  u_set_book2:{ty:5,aw:2,tier:2,kind:'items',k:['bookshelf'],dur:[5,12],w:.8,txt:{
    any:['책을 펼치고 새하얀 백지를 열심히 읽는 중','책장을 넘기며 아무것도 적히지 않은 쪽을 보는 중'],
    rational:['글자가 없는 책장을 한 장씩 넘겨 확인하는 중']}},
  u_set_book3:{ty:5,aw:3,tier:3,kind:'items',k:['bookshelf'],dur:[4,10],w:.7,txt:{
    any:['책모양 직육면체를 들고 멍하니 서 있는 중','펼쳐지지 않는 책을 들고 서 있는 중'],
    anxious:['펼쳐지지 않는 책을 손에 쥐고 놓지 못하는 중']}},
  u_set_wall3:{ty:5,aw:3,tier:3,kind:'stand',dur:[4,10],w:.7,txt:{
    any:['{r}의 벽을 손바닥으로 천천히 두드려 보는 중','{r}의 벽에 귀를 대고 가만히 있는 중'],
    resigned:['{r}의 벽에 이마를 대고 서 있는 중']}},
  u_set_wall4:{ty:5,aw:3,tier:4,kind:'stand',dur:[4,10],w:.6,txt:{
    any:['{r}의 벽이 끝나는 모서리를 손끝으로 따라가는 중','{r}의 천장과 벽이 만나는 선을 올려다보는 중'],
    curious:['{r}의 벽 틈을 손톱으로 긁어 보는 중']}},
  /* ---- v23.3 관찰자를 의식하는 짧은 대사(행동지문과 따로 출력). speech:true → 큰따옴표 대사 한 문장만 보임 ---- */
  u_talk1:{ty:1,aw:1,tier:1,kind:'stand',speech:true,dur:[2,4],w:.45,txt:{
    any:['여긴 참 고요해서 좋아.','여긴 항상 하늘이 맑아서 좋아.','이렇게 조용한 동네는 처음이야.','이곳에 오래 머물러야지.','이곳은 원래 이런 곳이었나?'],
    curious:['이 동네는 왜 이렇게 조용할까?','여긴 구석구석 처음 보는 것 같아.'],
    anxious:['어디선가 소리가 난 것 같은데…','여기 원래 이렇게 조용했나?'],
    rational:['오늘도 하늘이 맑네.','조용해서 생각하기엔 좋네.'],
    avoidant:['조용해서 다행이야.','아무도 안 오는 게 편하긴 해.'],
    resigned:['여긴 늘 이렇게 조용하네.','어제와 별로 다를 게 없네.']}},
  u_talk2:{minD:6,ty:1,aw:2,tier:2,kind:'stand',speech:true,dur:[2,4],w:.5,txt:{
    any:['거기 누구 없어요?','누가 부른 것 같은데.','여긴 정말 내 집이 맞나?','하늘이 왜 항상 똑같지?'],
    curious:['누가 있는 거 맞죠?','저기요, 거기 누구 있어요?'],
    anxious:['누가 나를 보고 있는 것 같아.','방금 누가 있었던 것 같은데.'],
    rational:['이상하네, 분명 누가 있었는데.','착각이겠지.'],
    avoidant:['…아무도 없지?','신경 쓰지 말자.'],
    resigned:['여기 이웃들을 만난 적이 없네.','불러도 아무도 안 오겠지.']}},
  u_talk3:{minD:12,ty:1,aw:3,tier:3,kind:'stand',speech:true,dur:[2,5],w:.5,txt:{
    any:['거기서 나 보고 있지?','넌 누구야?','보지 말아줘.'],
    curious:['넌 누구야, 어디서 보는 거야?','거기서 보면 여기가 어떻게 보여?'],
    anxious:['제발 보지 말아줘.','계속 지켜보고 있는 거 알아.'],
    rational:['분명히 누가 보고 있어.','대답해 줘, 거기 누구야?'],
    avoidant:['보지 말아줘.','내 쪽은 그만 봤으면 좋겠어.'],
    resigned:['어차피 보고 있겠지.','또 거기서 보고 있구나.']}},
  u_talk4:{minD:20,ty:7,aw:3,tier:4,kind:'stand',speech:true,dur:[2,5],w:.45,txt:{
    any:['날 여기서 내보내줘.','내보내 달란 말이야!!','여기서 나가고 싶어.'],
    curious:['이 밖에는 뭐가 있어?','나가는 길을 알려줘.'],
    anxious:['제발 날 내보내줘!','더는 못 있겠어.'],
    rational:['여기서 꺼내 줘, 부탁이야.','출구를 알려줘.'],
    avoidant:['그만 보고 날 내보내줘.','이제 그만 내보내 줘.'],
    resigned:['날 여기서 내보내줘.','소용없다는 건 알지만, 내보내줘.']}},
  /* ---- v23.4 반복·어긋남·무덤덤함. ladder: [체류일 기준 최소일수, 문구] — 같은 상황이 쓰일 때마다 한 단계씩 조금 달라진 문구로 이어짐 ---- */
  u_cal:{ty:4,aw:1,tier:1,kind:'stand',dur:[3,7],w:.7,ladder:[
    [0,'일력을 한 장 뜯어 오늘 날짜를 확인하는 중'],[2,'일력을 뜯어 어제와 같은 날짜가 적힌 오늘을 보는 중'],
    [5,'뜯어도 같은 날짜가 나오는 일력을 한 장 더 넘기는 중'],[9,'일력을 뜯지 않고 어제의 날짜를 그대로 두는 중'],[15,'날짜가 적히지 않은 일력을 습관처럼 뜯는 중']],txt:{any:[]}},
  u_clock:{ty:4,aw:2,tier:2,kind:'stand',dur:[3,7],w:.6,ladder:[
    [0,'시계를 올려다보며 시간을 확인하는 중'],[4,'어제 본 것과 같은 시각의 시계를 올려다보는 중'],
    [8,'움직이지 않는 시계의 초침을 바라보는 중'],[14,'멈춘 시계를 보며 약속 시간을 가늠하는 중']],txt:{any:[]}},
  u_calm_win:{ty:5,aw:1,tier:2,kind:'win',dur:[6,14],w:.7,txt:{
    any:['움직이지 않는 창밖을 보며 차를 마시는 중','멈춘 구름 아래에서 느긋하게 창밖을 보는 중'],
    resigned:['변하지 않는 창밖을 보며 하품하는 중'],avoidant:['창밖이 그대로인 걸 보고도 하던 일을 이어가는 중']}},
  u_restore:{ty:2,aw:2,tier:2,kind:'items',k:['desk','dining','bookshelf','sofa','chair','fridge'],dur:[4,10],w:.6,txt:{
    any:['치워 둔 물건이 제자리에 돌아와 있는 걸 보며 다시 치우는 중','방금 정리한 자리가 처음 모습 그대로인 걸 보며 또 정리하는 중'],
    rational:['정리한 물건이 도로 놓여 있는 자리를 말없이 다시 정리하는 중']}},
  u_hello:{ty:4,aw:1,tier:1,kind:'stand',speech:true,dur:[2,4],w:.5,ladder:[
    [0,'오늘은 정말 조용하네요.'],[2,'오늘도 조용하네요.'],[4,'오래 머물고 싶을 만큼 조용한 동네야.'],
    [7,'어제도 이 시간에 조용했었죠?'],[11,'혹시 어제도 거기 계셨어요?'],[16,'언제부터 거기 있었어요?'],[24,'오늘도 와 줬구나.']],txt:{any:[]}},
  u_hello2:{ty:5,aw:2,tier:2,kind:'stand',speech:true,dur:[2,4],w:.4,ladder:[
    [3,'오늘은 하늘이 유난히 맑네.'],[6,'어제도 이렇게 맑았지.'],[10,'내일도 맑겠지.'],[16,'비가 마지막으로 온 게 언제였더라?']],txt:{any:[]}},
  /* =====================================================================
     v23.8 메타픽션·팬옵티콘·인공 세계의 불안 (7개 유형 × 자기인식 3단계)
     ty: 1 관찰자의 존재 / 2 통제된 자유의지 / 3 데이터와 신체의 불일치 / 4 기억과 기록의 모순 / 5 세계의 인공성 / 6 자기 존재에 대한 의심 / 7 관찰과 소비
     aw: 1 아직 모름(일상 속 작은 어긋남) / 2 이상함을 감지하지만 이유를 모름 / 3 규칙을 의심하지만 이해하지 못함 — 캐릭터마다 도달 상한이 다름(UNCANNY.aw)
     ===================================================================== */
  u_n_hand:{ty:1,aw:1,tier:1,kind:'stand',dur:[2,5],w:.6,txt:{
    any:['누구에게랄 것 없이 가볍게 손을 흔들다 내리는 중','천장 모서리를 습관처럼 한 번 올려다보는 중','지나가다 허공에 가볍게 고개를 끄덕여 보이는 중','혼자 있는데도 문득 옷매무새를 가다듬는 중'],
    avoidant:['괜히 헛기침을 하고 하던 일로 돌아가는 중'],curious:['천장 모서리를 올려다보며 고개를 갸웃하는 중']}},
  u_n_gaze:{ty:1,aw:2,tier:2,kind:'stand',dur:[3,7],w:.7,txt:{
    any:['아무것도 없는 구석을 향해 고개를 갸웃하는 중','비어 있는 의자 쪽을 보며 인사하듯 고개를 숙이는 중','벽 한쪽을 향해 말을 꺼내려다 입을 다무는 중'],
    anxious:['아무도 없는 쪽을 곁눈질로 확인하는 중'],rational:['소리가 난 쪽을 한참 바라보다 고개를 젓는 중'],
    resigned:['빈 구석을 한 번 보고 시선을 거두는 중']}},
  u_n_wait:{ty:1,aw:2,tier:2,kind:'stand',dur:[3,7],w:.7,txt:{
    any:['방금 한 말에 대한 대답을 기다리듯 가만히 서 있는 중','누군가의 맞장구를 기다리는 것처럼 잠깐 멈춰 있는 중'],
    curious:['대답이 올 것처럼 귀를 기울이는 중'],avoidant:['대답이 없자 어색한 듯 손을 비비는 중']}},
  u_n_stop:{ty:1,aw:2,tier:3,kind:'stand',dur:[3,7],w:.7,txt:{
    any:['혼자 웃다가 웃음을 거두고 주변을 둘러보는 중','흥얼거리던 노래를 갑자기 멈추고 가만히 있는 중'],
    anxious:['혼잣말을 하다가 입을 가리고 주변을 보는 중'],resigned:['하던 몸짓을 멈췄다가 아무 일 없다는 듯 이어 가는 중']}},
  u_n_back:{ty:2,aw:1,tier:2,kind:'stand',dur:[3,8],w:.7,txt:{
    any:['다른 일을 하려다 어느새 처음 하던 자세로 돌아와 있는 중','오늘은 다르게 해 보려는 듯 반대쪽으로 걷다 멈추는 중','평소 앉던 자리를 두고 옆자리에 앉았다가 일어나는 중','늘 하던 순서를 바꿔 보려다 손이 먼저 원래대로 움직이는 중'],
    curious:['평소와 다른 순서로 해 보려다 같은 자리에 도착하는 중'],avoidant:['하려던 일을 잊은 듯 하던 일을 마저 하는 중']}},
  u_n_cut:{ty:2,aw:2,tier:3,kind:'stand',dur:[3,8],w:.7,txt:{
    any:['무언가를 집으려다 손끝 앞에서 멈추는 중','일어서려다 막 몸을 일으킨 순간 다시 앉는 중'],
    rational:['하려던 일을 되짚으며 손가락을 접었다 펴는 중'],anxious:['움직이려다 멈추고 같은 숨을 두 번 쉬는 중']}},
  u_n_loop:{ty:2,aw:2,tier:3,kind:'rep',dur:[5,12],w:.7,txt:{
    any:['같은 일을 하면서 방금과 다른 이유를 중얼거리는 중','방금 한 일을 다른 이유를 붙여 다시 하는 중'],
    curious:['이번에는 다를지 지켜보며 같은 일을 하는 중']}},
  u_n_hands:{ty:3,aw:2,tier:2,kind:'stand',dur:[3,8],w:.75,txt:{
    any:['자신의 손을 낯선 물건처럼 한참 들여다보는 중','손가락을 하나씩 펴 보며 개수를 세는 중','손등의 핏줄을 따라 손가락 끝을 훑어보는 중'],
    curious:['손바닥을 뒤집어 보며 선을 따라가 보는 중'],avoidant:['손을 내려다보다 소매 속으로 감추는 중'],
    resigned:['손을 폈다 쥐었다 하며 멍하니 바라보는 중']}},
  u_n_pose:{ty:3,aw:2,tier:3,kind:'stand',dur:[3,8],w:.65,txt:{
    any:['방금 앉은 자세가 아까와 다르다는 듯 몸을 고쳐 앉는 중','같은 동작을 몇 번이고 똑같이 되풀이하는 중'],
    rational:['팔을 올렸다 내리며 같은 각도에서 멈추는지 보는 중'],anxious:['고개를 돌리는 동작을 두 번 되풀이하는 중']}},
  u_n_trace:{ty:3,aw:2,tier:3,kind:'items',k:['desk','dining','sofa','chair','bookshelf','fridge'],dur:[4,9],w:.65,txt:{
    any:['방금 만진 곳에 손자국이 남았는지 살피는 중','물건에서 손을 떼고 닿았던 자리를 다시 만져 보는 중']}},
  u_n_mirror:{ty:3,aw:3,tier:3,kind:'items',k:['mirror','vanity'],dur:[4,10],w:.8,txt:{
    any:['거울 속 얼굴이 먼저 움직이진 않는지 가만히 지켜보는 중','거울에 비친 자신의 손을 한참 바라보는 중'],
    anxious:['거울 속 자신과 눈이 마주쳐 시선을 못 떼는 중'],avoidant:['거울을 슬쩍 보고 바로 고개를 돌리는 중'],
    curious:['거울에 얼굴을 바싹 대고 눈동자를 들여다보는 중']}},
  u_n_misplace:{ty:4,aw:1,tier:2,kind:'items',k:['desk','bookshelf','sofa','chair','dining','fridge','wardrobe'],dur:[4,10],w:.7,txt:{
    any:['기억하는 자리와 다른 곳에 놓인 물건 앞에서 고개를 갸웃하는 중','분명 이쪽에 있었다는 듯 같은 자리를 다시 둘러보는 중','물건을 집어 들었다가 원래 자리가 어디였는지 멈칫하는 중','서랍을 열었다 닫으며 넣어 둔 기억을 더듬는 중'],
    avoidant:['물건 위치를 바꿔 놓고는 원래 그랬다는 듯 넘기는 중'],rational:['물건이 있던 자리를 손으로 짚어 가며 되짚는 중']}},
  u_n_book:{ty:4,aw:2,tier:3,kind:'items',k:['bookshelf'],dur:[4,10],w:.75,txt:{
    any:['책장에서 처음 보는 책을 오래 알던 것처럼 꺼내 드는 중','꽂힌 책의 순서가 기억과 다르다는 듯 한 권씩 짚어 보는 중'],
    curious:['처음 보는 책인데 표지를 쓰다듬으며 웃는 중']}},
  u_n_stalk:{ty:4,aw:1,tier:2,kind:'stand',dur:[3,7],w:.6,txt:{
    any:['방금 하려던 말을 잊은 듯 입을 벌린 채 서 있는 중','이야기의 앞뒤 순서를 손가락으로 세어 가며 맞춰 보는 중','하던 이야기의 첫 마디를 입속으로 다시 되뇌어 보는 중','어제 있었던 일을 손가락으로 짚어 가며 더듬는 중']}},
  u_n_glass:{ty:5,aw:1,tier:2,kind:'win',dur:[5,12],w:.7,txt:{
    any:['창유리를 손끝으로 눌러 보며 바깥을 내다보는 중','창밖 풍경 속에서 움직이는 것이 있는지 찾아보는 중','창밖의 같은 지점을 한참 보다 눈을 깜빡이는 중','창틀에 팔을 괴고 바깥의 정적을 듣는 중'],
    curious:['창문에 이마를 대고 풍경의 가장자리를 찾는 중'],resigned:['창밖 풍경이 오늘도 같은지 확인하는 중']}},
  u_n_behind:{ty:5,aw:2,tier:3,kind:'items',k:['bookshelf','wardrobe','sofa','fridge','tv'],dur:[4,10],w:.65,txt:{
    any:['가구 뒤쪽에 벽이 있는지 틈새로 들여다보는 중','가구 옆면을 손으로 쓸며 두께를 가늠해 보는 중']}},
  u_n_fridge:{ty:5,aw:1,tier:2,kind:'items',k:['fridge'],dur:[3,8],w:.6,txt:{
    any:['냉장고를 열었다 닫으며 안쪽이 그대로인지 보는 중','냉장고 문을 열고 한참 서서 아무것도 꺼내지 않는 중','냉장고 불빛 아래서 안쪽 선반을 처음 보는 듯 훑어보는 중','냉장고를 닫고 한 걸음 가다 다시 열어 보는 중']}},
  u_n_tv:{ty:5,aw:2,tier:3,kind:'items',k:['tv'],dur:[5,12],w:.7,txt:{
    any:['TV 속 하늘과 창밖의 하늘을 번갈아 비교해 보는 중','같은 장면이 되풀이되는 TV를 졸린 듯 보는 중']}},
  u_n_wall:{ty:5,aw:2,tier:3,kind:'stand',dur:[4,10],w:.6,txt:{
    any:['{r}의 한쪽 벽에서 문 쪽까지 걸음 수를 세어 보는 중','{r}의 구석에서 구석까지 같은 걸음 수인지 다시 세어 보는 중']}},
  u_n_name:{ty:6,aw:2,tier:2,kind:'stand',dur:[3,7],w:.6,ladder:[
    [1,'자신의 이름을 작게 소리 내어 불러 보는 중'],[4,'자신의 이름을 불러 보고 대답을 기다리는 중'],
    [9,'자신의 이름이 어색한 듯 여러 번 되뇌는 중'],[16,'불러 본 이름 뒤에 아무도 대답하지 않는 걸 듣는 중']],txt:{any:[]}},
  u_n_ask:{ty:6,aw:2,tier:3,kind:'stand',dur:[3,7],w:.6,txt:{
    any:['방금 한 질문을 이미 한 적이 있다는 듯 입을 다무는 중','질문을 하다 말고 같은 질문을 전에 했던가 따져 보는 중'],
    avoidant:['하던 말을 삼키고 화제를 돌리려는 듯 손을 움직이는 중']}},
  u_n_chest:{ty:6,aw:3,tier:3,kind:'stand',dur:[4,9],w:.55,txt:{
    any:['가슴에 손을 얹고 한참 가만히 있는 중','자신의 맥박을 손목에서 찾아보는 중'],
    resigned:['손을 가슴에서 떼고 아무 일 없다는 듯 돌아서는 중']}},
  u_n_show:{ty:7,aw:2,tier:2,kind:'stand',dur:[3,7],w:.65,txt:{
    any:['아무도 없는데 보여 주듯 크게 기지개를 켜는 중','누가 보는 것처럼 평소보다 크게 웃어 보이는 중','아무도 없는데 말을 마치고 박수 소리를 기다리는 중'],
    avoidant:['웃는 얼굴을 만들었다가 곧 거두는 중'],anxious:['웃는 표정을 유지한 채 어깨에 힘을 주는 중']}},
  u_n_again:{ty:7,aw:2,tier:3,kind:'stand',dur:[3,8],w:.65,txt:{
    any:['반응을 기다리듯 하던 이야기를 한 번 더 되풀이하는 중','기대에 맞추려는 듯 방금 한 몸짓을 더 크게 되풀이하는 중'],
    resigned:['같은 이야기를 한 번 더 하고 어깨를 으쓱하는 중']}},
  u_n_off:{ty:7,aw:3,tier:3,kind:'stand',dur:[3,8],w:.6,txt:{
    any:['아무도 보지 않을 때를 기다리듯 방 안을 한 바퀴 둘러보는 중','혼자일 때는 안 하던 인사를 허공에 건네는 중']}},
  u_n_say1:{minD:8,ty:1,aw:2,tier:2,kind:'stand',speech:true,dur:[2,4],w:.5,txt:{
    any:['방금 누가 내 이름 불렀어?','…내 얘기 듣고 있었어?','아, 아니야, 혼잣말이야.'],
    curious:['저기요, 혹시 누구 계세요?'],anxious:['아무도 없는 거 맞죠?'],rational:['소리가 났는데, 아니겠지.'],
    avoidant:['…아니야, 그냥 해 본 소리야.'],resigned:['대답은 없겠지만, 그냥 말해 볼게.']}},
  u_n_say2:{ty:2,aw:2,tier:3,kind:'stand',speech:true,dur:[2,5],w:.5,txt:{
    any:['다른 걸 하려 했는데, 결국 이거네.','이상하게 매번 여기로 오게 돼.','방금 뭐 하려고 했더라.'],
    curious:['이번엔 진짜 다르게 해 볼 거야.'],rational:['내가 정한 거 맞지?'],avoidant:['…뭐, 이것도 나쁘진 않아.'],
    resigned:['어차피 또 여기겠지.']}},
  u_n_say3:{ty:3,aw:2,tier:3,kind:'stand',speech:true,dur:[2,5],w:.45,txt:{
    any:['내 손이 원래 이렇게 생겼나?','방금 뭘 했는지는 아는데, 흔적이 없네.','배가 부른지 안 부른지 모르겠어.'],
    anxious:['내 손인데 왜 이렇게 낯설지?'],resigned:['몸이 늘 이랬던 것 같기도 해.']}},
  u_n_say4:{ty:4,aw:1,tier:2,kind:'stand',speech:true,dur:[2,5],w:.5,ladder:[
    [1,'이 집, 처음 왔을 때도 이랬나?'],[3,'책장이 원래 저쪽이었나?'],[6,'분명 어제 여기 뒀는데.'],
    [11,'여기 오기 전엔 뭘 했더라.'],[19,'오기 전 일이 하나도 안 떠오르네.']],txt:{any:[]}},
  u_n_say5:{ty:5,aw:1,tier:2,kind:'stand',speech:true,dur:[2,4],w:.45,txt:{
    any:['창밖은 항상 이렇게 맑지.','문을 열면 늘 같은 길이야.','여긴 해 지는 걸 본 적이 없네.'],
    curious:['저 구름은 어디까지 가는 걸까.'],rational:['날씨가 이렇게 한결같을 수 있나?'],avoidant:['조용해서 좋긴 해.']}},
  u_n_say6:{ty:6,aw:3,tier:3,kind:'stand',speech:true,dur:[2,5],w:.45,txt:{
    any:['나 방금도 이 말 했었나?','기억은 있는데, 출처를 모르겠어.','왜 기분이 좋은지 모르겠는데, 좋아.'],
    anxious:['아무도 안 불렀는데 대답하게 돼.'],resigned:['내가 여기 언제부터 있었지.'],avoidant:['…그런 건 생각 안 할래.']}},
  u_n_say7:{minD:14,ty:7,aw:3,tier:3,kind:'stand',speech:true,dur:[2,5],w:.45,txt:{
    any:['오늘은 재미있었어요?','이 정도면 괜찮았죠?','더 보여 드릴까요?'],
    curious:['다음엔 뭘 해 볼까요?'],anxious:['잘 하고 있는 거죠?'],avoidant:['…이제 그만 봐도 되는데.'],resigned:['보시는 대로 하면 되죠.']}},
  u_n_obs:{minD:8,ty:1,aw:2,tier:2,kind:'stand',speech:true,dur:[2,5],w:.45,ladder:[
    [8,'오늘도 조용하네요, 혼잣말이에요.'],[11,'아까부터 누가 있는 것 같아서요.'],[15,'대답은 안 해도 되는데, 듣고 있죠?'],
    [21,'계속 보고 계시면, 말씀해 주세요.'],[30,'이제 안 보는 척 안 해도 돼요.']],txt:{any:[]}},

};
const KINDS=Object.keys(EVENTS);
/* v23.3 외출 중 행동지문(길·건물·신호등 같은 바깥 공간이 무대 세트처럼 보이는 순간). 기본 외출 문구를 대신해 가끔 나옴 */
const OUT_EVENTS={
  o_win:{tier:1,w:1,txt:['같은 모양의 창문을 하나씩 세어 보는 중','가로수 잎이 모두 같은 방향으로 놓였는지 올려다보는 중','모퉁이를 돌 때마다 같은 가게를 마주하는 중']},
  o_walk:{tier:2,w:1,txt:['끝없이 반복되는 보도블록의 무늬를 따라 걷는 중','바뀌지 않는 신호등 앞에서 기다리는 중','움직이지 않는 구름을 올려다보는 중','향기가 없는 꽃 냄새를 한껏 맡는 중']},
  o_panel:{tier:3,w:1,txt:['끝없이 줄지어 선 건물 판넬을 두드리는 중','건물의 모서리를 따라 손끝을 움직이는 중','얼굴없는 행인과 대화를 나누는 중','얼굴 없는 사람모양 판넬과 즐겁게 대화를 나누는 중']},
  o_edge:{tier:4,w:1,txt:['건물 뒤편의 얇은 가장자리를 들여다보는 중','골목 끝에서 길이 이어지는지 발끝으로 확인하는 중','길 끝에 놓인 풍경 판넬을 바라보는 중']}
};

/* 404 / 오류 화면 문구 — 에피소드마다 한 번 정해지고 그 에피소드 동안 바뀌지 않는다 */
const MSGS=['SUBJECT NOT FOUND','404 — ENTITY NOT FOUND','CHARACTER DATA UNAVAILABLE','RECORD CORRUPTED','ENTITY STATUS: UNKNOWN'];
/* 복귀 직후 한 번 나오는 말풍선(반응별) */
const RETURN_SAY={any:['…방금 뭐였지?'],curious:['…잠깐, 어디 있었더라?'],anxious:['…나 방금… 여기 있었나?'],rational:['…시간이 이상하게 흘렀나?'],avoidant:['…아무 일도 없었어.'],resigned:['…또 돌아왔네.']};

/* =====================================================================
   유틸
   ===================================================================== */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const rnd=seed=>{let a=seed|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
const tv=(A,k)=>(A&&A.traits&&A.traits[k])||0;
const interp=(pts,x)=>{if(x<=pts[0][0])return pts[0][1];for(let i=1;i<pts.length;i++){if(x<=pts[i][0]){const a=pts[i-1],b=pts[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])}}return pts[pts.length-1][1]};
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const dayNum=ms=>{const p=fmt.format(new Date(ms)).split('-').map(Number);return Math.floor(Date.UTC(p[0],p[1]-1,p[2])/DAY)};   // 서울 달력 날짜 번호
const hourOf=ms=>{const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)),o={};f.forEach(p=>o[p.type]=p.value);return +o.hour+(+o.minute)/60};

/* =====================================================================
   저장 상태
   ===================================================================== */
const create=()=>({v:1,u:{},g:{}});
function migrate(s){if(!s||typeof s!=='object'||s.v!==1)return create();s.u=s.u&&typeof s.u==='object'?s.u:{};s.g=s.g&&typeof s.g==='object'?s.g:{};const t=Date.now();for(const k of Object.keys(s.u)){if(!s.u[k]||typeof s.u[k]!=='object'||Array.isArray(s.u[k]))delete s.u[k];else ensure(s,k,t)}   // 옛·손상된 저장값도 열 때 한 번에 정리
  return s}
const newChar=now=>({since:now,b:0,st:'stable',seen:{},last:{},hist:[],lt:now,streak:0,sev:0,miss:null,nMiss:0,retAt:0,fx:{},lastEv:0,rc:'',flash:null});
function ensure(s,cid,now){let u=s.u[cid];if(!u||typeof u!=='object'){u=s.u[cid]=newChar(now)}
  u.seen=u.seen&&typeof u.seen==='object'?u.seen:{};u.last=u.last&&typeof u.last==='object'?u.last:{};u.hist=Array.isArray(u.hist)?u.hist:[];u.fx=u.fx&&typeof u.fx==='object'?u.fx:{};
  if(!isFinite(u.since))u.since=now;u.b=clamp(+u.b||0,0,100);u.lt=+u.lt||now;u.streak=+u.streak||0;u.sev=+u.sev||0;u.nMiss=+u.nMiss||0;u.retAt=+u.retAt||0;return u}

/* =====================================================================
   파생 값: 체류 일수 · 반응 유형 · 진행도 · 단계 · 상태
   ===================================================================== */
const stayDays=(u,now)=>Math.max(0,dayNum(now)-dayNum(u.since));          // 집에 처음 배치된 날부터 센 서울 날짜 수
/* 반응 유형: 기존 프로필에서 읽은 성격(traits)과 현재 감정으로 고른다. 새 성격을 만들어 내지 않는다. */
function awMax(cid,r){const b=UNCANNY.aw.base[r]||2,h=hash(cid+'|aw');return clamp(b+(h%4===0?1:0)-(h%5===0?1:0),1,3)}
function reaction(A,cid,emo){
  const e=k=>emo?(+emo(cid,k)||0)/100:0;
  const sc={curious:tv(A,'curious')*1.2+tv(A,'creative')*.5+tv(A,'bold')*.5+tv(A,'nature')*.3+e('curious')*.8,
    anxious:tv(A,'shy')*1+tv(A,'jealous')*.6+tv(A,'negative')*.5+tv(A,'caring')*.2+e('anxious')*1.4+e('lonely')*.4,
    rational:tv(A,'worker')*.7+tv(A,'studious')*.7+tv(A,'tidy')*.4+tv(A,'boardgame')*.3+tv(A,'harsh')*.2,
    avoidant:tv(A,'aloof')*1+tv(A,'solitary')*.5+tv(A,'inexpr')*.5+tv(A,'tsun')*.4+tv(A,'homebody')*.2,
    resigned:tv(A,'cynic')*1+tv(A,'lazy')*.6+tv(A,'sleepy')*.3+e('tired')*.6+e('sad')*.4+e('bored')*.3};
  let best=null,bv=0.25;for(const k in sc){if(sc[k]>bv){bv=sc[k];best=k}}
  if(!best){const ks=['avoidant','resigned','curious','rational','anxious'];best=ks[hash(cid+'|r')%ks.length]}   // 단서가 없으면 캐릭터마다 고정된 값
  return best}
const pace=cid=>{const r=hash(cid+'|pace')/4294967296;return UNCANNY.pace.min+(UNCANNY.pace.max-UNCANNY.pace.min)*r};
const jitter=cid=>((hash(cid+'|jit')/4294967296)*2-1)*UNCANNY.pace.jitterDays;
function progress(u,cid,now){const d=stayDays(u,now)+hourOf(now)/24;return Math.max(0,(d+jitter(cid))*pace(cid)+u.b*UNCANNY.pace.burdenDays)}
function tierMax(P,b){let m=0;for(const t in UNCANNY.tiers){const c=UNCANNY.tiers[t];if(P>=c.atP&&b>=c.needB)m=Math.max(m,+t)}return m||1}
function tierWeight(t,P){const c=UNCANNY.tiers[t];if(!c)return 0;if(P<c.atP)return 0;const ramp=c.atP===0?1:clamp((P-c.atP)/UNCANNY.tierRamp,0,1);const base=t===1?1/(1+P/UNCANNY.tier1Fade):1;return Math.max(.05,ramp*base)}
function stateOf(u,now,hysteresis){
  const S=UNCANNY.state,score=u.b*.62+Math.min(15,stayDays(u,now)*.6)+Math.min(15,u.sev*.25);   // 체류 가산은 15 로 막혀 있어 체류만으로는 '위화감' 이상으로 못 감(부담이 필요)
  const order=['stable','uneasy','unstable','damaged'];let idx=0;
  S.forEach(([id,thr,minB],i)=>{if(score>=thr&&u.b>=minB)idx=i+1});
  const cur=order.indexOf(u.st==='unknown'?'stable':u.st);
  if(hysteresis&&cur>idx){const [,thr,minB]=S[cur-1]||[,0,0];if(score>=thr-UNCANNY.hyst&&u.b>=minB-6)idx=cur}
  return order[idx]}

/* =====================================================================
   틱 갱신 (viv.js 가 1분마다 호출) — 부담 변화·상태 판정·404 진행·화면 연출 목록
   env: {now, chars:[{id,A,home:boolean,sleeping:boolean}], emo(cid,id), watch:{cid,sec}|null}
   =====================================================================  */
function update(s,env){
  s=migrate(s);const now=env.now,fx=[];let dirty=false;
  for(const c of env.chars){
    const u=ensure(s,c.id,now),P0=progress(u,c.id,now);
    /* 존재 오류 진행 */
    if(u.miss){
      if(now>=u.miss.until){   // 복구: 원본 데이터는 그대로이므로 표시 상태만 해제
        u.miss=null;u.retAt=now;u.b=u.b*UNCANNY.missing.returnBurdenKeep;u.st='uneasy';u.flash={k:'ret',at:now,say:RETURN_SAY[u.rc||'any']};fx.push({k:'return',cid:c.id});dirty=true}
      u.lt=now;continue}
    const dtH=clamp((now-u.lt)/HOUR,0,3);u.lt=now;
    /* 부담 자연 회복 */
    if(dtH>0){const R=UNCANNY.react[reaction(c.A,c.id,env.emo)]||{},B=UNCANNY.burden;
      let dec=(B.decayPerHour+B.decayProp*u.b)*(R.decay||1);
      if(env.emo&&((+env.emo(c.id,'calm')||0)>=B.calmEmo||(+env.emo(c.id,'happy')||0)>=B.calmEmo))dec*=B.calmMul;
      if(c.sleeping)dec+=B.sleepBonus;
      u.b=clamp(u.b-dec*dtH,0,B.max);
      /* 불안·외로움이 높으면 아주 조금씩 오름(위화감 경험 없이도 마음이 무거워질 수 있음) */
      const anx=env.emo?((+env.emo(c.id,'anxious')||0)+(+env.emo(c.id,'lonely')||0))/200:0;
      if(anx>.45&&P0>3)u.b=clamp(u.b+B.emoGain*anx*dtH,0,B.max)}
    const prev=u.st;u.st=stateOf(u,now,true);if(u.st!==prev)dirty=true;
    if(!c.home)continue;
    /* 404 판정: 상태·부담·체류·쿨다운 조건을 모두 만족할 때만, 시간당 낮은 확률로 */
    const M=UNCANNY.missing;
    if(u.st==='damaged'&&u.b>=M.minBurden&&stayDays(u,now)>=M.minDays&&(!u.retAt||now-u.retAt>M.cooldownDays*DAY)&&dtH>0){
      const h=M.hazardPerHour*clamp((u.b-M.minBurden)/M.scaleBurden+.3,.3,1.3);
      const r=rnd(hash(c.id+'|404|'+Math.floor(now/MIN)));
      if(r()<1-Math.exp(-h*dtH)){
        const rr=rnd(hash(c.id+'|ep|'+now)),dur=Math.round(M.durMs[0]+rr()*(M.durMs[1]-M.durMs[0])),van=Math.round(M.vanishMs[0]+rr()*(M.vanishMs[1]-M.vanishMs[0]));
        const a=Math.floor(rr()*MSGS.length);let b2=Math.floor(rr()*MSGS.length);if(b2===a)b2=(b2+1)%MSGS.length;
        u.rc=reaction(c.A,c.id,env.emo);
        u.miss={at:now,vanish:now+van,until:now+van+dur,a,b:b2,nid:Math.floor(rr()*1e6)};u.nMiss++;u.flash=null;
        fx.push({k:'vanish',cid:c.id,van});dirty=true;continue}}
    /* 하늘 위화감: 창밖을 바라보는 행동 중일 때 가끔 하늘이 지나치게 균일하게 보임(시각 효과만) */
    {const E=EVENTS[c.verb];if(E&&E.fx==='sky'&&now-(s.g.sky||0)>UNCANNY.fx.gap.sky&&rnd(hash(c.id+'|sky|'+Math.floor(now/MIN)))()<UNCANNY.fx.p.sky){s.g.sky=now;fx.push({k:'sky',cid:c.id});dirty=true}}
    /* 상태에 따른 짧은 이미지 글리치 */
    const pb=UNCANNY.fx.tickBlip[u.st];
    if(pb&&rnd(hash(c.id+'|blip|'+Math.floor(now/MIN)))()<pb)fx.push({k:'blip',cid:c.id,sev:u.st==='damaged'?2:1});
  }
  /* 관찰 연동: 실제로 추적되는 사용자 행동(선택한 캐릭터를 얼마나 오래 보고 있는가)만 사용 */
  const w=env.watch;
  if(w&&w.cid){const u=s.u[w.cid];
    if(u&&!u.miss&&u.st!=='stable'){const F=UNCANNY.fx,r=rnd(hash(w.cid+'|w|'+Math.floor(now/MIN)));
      if(w.sec>=F.stareAfterSec&&(u.st==='unstable'||u.st==='damaged')&&now-(u.fx.stare||0)>F.gap.stare&&r()<F.p.stare){u.fx.stare=now;fx.push({k:'stare',cid:w.cid});dirty=true}
      else if(w.sec>=F.misreadAfterSec&&u.st!=='uneasy'&&now-(u.fx.misread||0)>F.gap.misread&&r()<F.p.misread*(u.st==='damaged'?2:1)){u.fx.misread=now;fx.push({k:'misread',cid:w.cid});dirty=true}}}
  /* 집 환경 이상(시각 효과만) — 가장 진행된 캐릭터 기준으로 낮은 빈도 */
  const live=env.chars.filter(c=>c.home&&s.u[c.id]&&!s.u[c.id].miss&&s.u[c.id].st!=='stable');
  if(live.length){const top=live.reduce((a,b)=>s.u[b.id].b>s.u[a.id].b?b:a),F=UNCANNY.fx,g=s.g,r=rnd(hash('env|'+Math.floor(now/MIN)));
    if(now-(g.shift||0)>F.gap.shift&&r()<F.p.shift&&s.u[top.id].st!=='uneasy'){g.shift=now;fx.push({k:'shift'});dirty=true}
    if(now-(g.clock||0)>F.gap.clock&&r()<F.p.clock&&s.u[top.id].st==='damaged'){g.clock=now;fx.push({k:'clock'});dirty=true}}
  return {fx,dirty,s}}

/* =====================================================================
   sim.js 가 쓰는 훅 — 행동 선택 단계에서 호출
   opts: {emo(cid,id), watch:{cid,sec}|null}
   ===================================================================== */
function hooks(s,now,opts){
  s=migrate(s);opts=opts||{};
  const U=cid=>s.u[cid]||null;
  const R=(cid,A)=>reaction(A,cid,opts.emo);
  return {
    isMissing:cid=>!!(U(cid)&&U(cid).miss),
    /* 위화감 행동 그룹을 쓸 수 있는 캐릭터인가(처음 보는 캐릭터도 첫날부터 포함) */
    active:cid=>true,
    /* 이번 결정에서 위화감 행동이 선택될 몫 */
    share(cid,A,info){
      info=info||{};const u=ensure(s,cid,now),P=progress(u,cid,now),C=UNCANNY.share;
      let p=interp(C.curve,stayDays(u,now)*pace(cid)+jitter(cid))+u.b/100*C.burdenGain;
      if(info.hour!=null&&info.hour>=C.night.from&&info.hour<C.night.to)p*=C.night.mul;
      p*=C.streakMul[Math.min(u.streak,C.streakMul.length-1)];
      return clamp(p,C.min,C.max)},
    /* 이 행동을 지금 할 수 있는가(단계·쿨다운·관찰 조건) */
    allow(cid,id,A){
      const E=EVENTS[id];if(!E)return false;const u=ensure(s,cid,now),P=progress(u,cid,now);
      if(E.tier>tierMax(P,u.b))return false;
      if(E.aw&&E.aw>awMax(cid,R(cid,A)))return false;
      if(E.minD&&stayDays(u,now)<E.minD)return false;   // 관찰자(사용자)를 인지하는 대사는 체류가 길어진 뒤에만
      if(now-(u.last[id]||0)<UNCANNY.repeat.kindCooldown[E.tier])return false;
      if(E.speech&&now-(u.lastTalk||0)<UNCANNY.talk.gap)return false;
      if(E.ladder&&!E.ladder.some(x=>x[0]<=stayDays(u,now)))return false;
      if(E.watch&&!(opts.watch&&opts.watch.cid===cid&&opts.watch.sec>=UNCANNY.fx.stareAfterSec*.6)&&u.b<50)return false;
      return true},
    /* 행동 가중치: 단계 가중 × 성격 × 부담 × 최근 반복 감쇠 */
    verbW(cid,id,A){
      const E=EVENTS[id];if(!E)return 0;const u=ensure(s,cid,now),P=progress(u,cid,now),r=R(cid,A);
      let w=E.w*tierWeight(E.tier,P);
      w/=1+UNCANNY.repeat.seenDamp*(u.seen[id]||0);
      const idx=u.hist.lastIndexOf(id);if(idx>=0&&u.hist.length-idx<=UNCANNY.repeat.recentN)w*=UNCANNY.repeat.recentMul;
      if(r==='anxious'&&E.tier>=2)w*=1.4;if(r==='curious'&&(E.kind==='win'||E.kind==='items'))w*=1.4;
      if(r==='avoidant'&&E.kind==='alone')w*=1.6;if(r==='avoidant'&&E.tier>=3)w*=.8;if(r==='resigned'&&id==='u_still')w*=1.3;
      if(E.ty&&u.hist.slice(-UNCANNY.aw.tyN).some(h=>EVENTS[h]&&EVENTS[h].ty===E.ty))w*=UNCANNY.aw.tyDamp;
      if(E.watch&&opts.watch&&opts.watch.cid===cid)w*=2.5;
      return Math.max(0,w)},
    /* 행동이 실제로 시작될 때 호출: 기록·부담 변화 */
    onStart(cid,id,A){
      const E=EVENTS[id];if(!E)return;const u=ensure(s,cid,now),r=R(cid,A),RC=UNCANNY.react[r]||{sens:1};
      u.seen[id]=(u.seen[id]||0)+1;u.last[id]=now;u.hist.push(id);if(u.hist.length>20)u.hist.shift();u.lastEv=now;u.streak=Math.min(9,u.streak+1);
      const T=UNCANNY.tiers[E.tier];let d=T.sev*RC.sens*(1+Math.min(1,stayDays(u,now)/30)*.5);
      const anx=opts.emo?(+opts.emo(cid,'anxious')||0)/100:0;d*=1+anx*UNCANNY.burden.emoGain;
      /* 호기심 많은 캐릭터는 가끔 오히려 홀가분해짐 — 위화감을 겪어도 부담이 반드시 오르지는 않음 */
      if(r==='curious'&&rnd(hash(cid+'|c|'+now))()<.35)d=-.3;
      u.b=clamp(u.b+d,0,UNCANNY.burden.max);if(E.tier>=3)u.sev+=1;   // 심한 위화감(3단계 이상)을 겪은 횟수
      u.rc=r},
    /* 일상 행동이 선택되면 연속 횟수 초기화 */
    onNormal(cid){const u=s.u[cid];if(u)u.streak=0},
    say(cid,id,A,r01,info){
      const E=EVENTS[id];if(!E)return null;info=info||{};const u=ensure(s,cid,now),r=R(cid,A);
      if(E.ladder){   // 같은 상황이 반복될수록 문구가 한 단계씩 어긋남(체류일이 모자란 단계는 아직 나오지 않음)
        const d=stayDays(u,now),st=E.ladder.filter(x=>x[0]<=d),t0=st[Math.min(u.seen[id]||0,st.length-1)||0][1];
        if(E.speech){u.lastTalk=now;return '“'+t0+'”'}return t0}
      let list=(E.txt[r]&&E.txt[r].length&&r01()<.8?E.txt[r].concat(E.txt.any):E.txt.any);
      if(E.speech){   // 대사: 이웃이 있으면 '이웃을 못 만났다'는 말은 하지 않고, 최근에 한 말은 피한다
        const ok=l=>!(info.nb>0&&/이웃/.test(l))&&!(u.said||[]).includes(l);
        let l2=list.filter(ok);if(!l2.length)l2=E.txt.any.filter(ok);if(!l2.length)l2=list;list=l2}
      /* v23.8 같은 문구가 되풀이되지 않도록: 성격 전용 문구는 우선하되, 많이 쓴 문구일수록 뒤로 밀림 */
      u.lc=u.lc&&typeof u.lc==='object'?u.lc:{};
      const ws=list.map(l=>1/(1+(u.lc[l]||0)*.9)*((u.said||[]).includes(l)?.2:1));
      let xw=r01()*ws.reduce((a,b)=>a+b,0),kw=0;while(kw<ws.length-1&&xw>ws[kw]){xw-=ws[kw];kw++}
      const t=list[kw];u.lc[t]=(u.lc[t]||0)+1;if(Object.keys(u.lc).length>400)u.lc={};
      if(!E.speech)u.said=(u.said||[]).concat(t).slice(-UNCANNY.talk.recentN);
      if(E.speech){u.said=(u.said||[]).concat(t).slice(-UNCANNY.talk.recentN);u.lastTalk=now;return '“'+t+'”'}
      return t},
    /* 외출 중 행동지문(기본 외출 문구를 가끔 대신함). 반환값이 없으면 기본 문구 그대로 */
    outSay(cid,A,r01){
      const O=UNCANNY.out;const u=ensure(s,cid,now),P=progress(u,cid,now);
      if(now-(u.lastOut||0)<O.gap)return null;
      const p=O.p*interp(UNCANNY.share.curve,stayDays(u,now)*pace(cid)+jitter(cid))/.6;if(r01()>=p)return null;
      const tm=tierMax(P,u.b),ids=Object.keys(OUT_EVENTS).filter(i=>OUT_EVENTS[i].tier<=tm);if(!ids.length)return null;
      const ws=ids.map(i=>{const E=OUT_EVENTS[i];return E.w*tierWeight(E.tier,P)/(1+UNCANNY.repeat.seenDamp*(u.seen[i]||0))});
      let x=r01()*ws.reduce((a,b)=>a+b,0),k=0;while(k<ws.length-1&&x>ws[k]){x-=ws[k];k++}
      const id=ids[k],E=OUT_EVENTS[id],lines=E.txt.filter(l=>!(u.said||[]).includes(l)),pool=lines.length?lines:E.txt,t=pool[Math.floor(r01()*pool.length)];
      u.seen[id]=(u.seen[id]||0)+1;u.lastOut=now;u.said=(u.said||[]).concat(t).slice(-UNCANNY.talk.recentN);
      const RC=UNCANNY.react[R(cid,A)]||{sens:1};u.b=clamp(u.b+UNCANNY.tiers[E.tier].sev*RC.sens*O.burdenMul,0,UNCANNY.burden.max);
      return t},
    EVENTS,ids:KINDS,
    reaction:(cid,A)=>R(cid,A),
    state:cid=>{const u=U(cid);return u?(u.miss?'unknown':u.st):'stable'}}}

/* =====================================================================
   조회(화면용): 상태 이름·오류 문구·디버그 덤프. 수치는 화면에 노출하지 않는다.
   ===================================================================== */
const STATE_KO={stable:'안정',uneasy:'위화감',unstable:'불안정',damaged:'손상',unknown:'미확인'};
function view(s,cid,now){const u=s&&s.u&&s.u[cid];if(!u)return {st:'stable',miss:null,flash:null};
  const m=u.miss;
  return {st:m?'unknown':u.st,
    miss:m?{vanished:now>=m.vanish,msgStage:MSGS[m.a],msgProfile:MSGS[m.b],at:m.at,until:m.until,nid:m.nid}:null,
    flash:u.flash&&now-u.flash.at<9000?u.flash:null}}
function dump(s,now){const o={};for(const cid in (s&&s.u)||{}){const u=s.u[cid];o[cid]={days:stayDays(u,now),burden:Math.round(u.b*10)/10,state:u.miss?'unknown':u.st,sev:u.sev,nMiss:u.nMiss,seen:u.seen,missUntil:u.miss?u.miss.until:0}}return o}
const forget=(s,cid)=>{if(s&&s.u)delete s.u[cid]};

/* =====================================================================
   저장소(localStorage). node 테스트에서는 store 를 쓰지 않고 상태 객체를 직접 다룬다.
   ===================================================================== */
const KEY='viv.unc.v1';let cache=null;
const store={
  get(){if(cache)return cache;let o=null;try{o=JSON.parse(localStorage.getItem(KEY))}catch(e){}cache=migrate(o);return cache},
  save(){try{localStorage.setItem(KEY,JSON.stringify(cache||create()))}catch(e){}},
  reset(){cache=create();store.save()}};

const api={UNCANNY,EVENTS,OUT_EVENTS,KINDS,MSGS,RETURN_SAY,STATE_KO,create,migrate,ensure,stayDays,reaction,progress,tierMax,tierWeight,update,hooks,view,dump,forget,store,dayNum};
root.Uncanny=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
